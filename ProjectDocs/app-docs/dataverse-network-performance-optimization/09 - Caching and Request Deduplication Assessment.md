# 09 - Caching and Request Deduplication Assessment

> Stage 1 audit, 25 Nov 2026. Branch `feature/dataverse-network-performance-optimization`, from `origin/RounakDev1` at `30afece`. Investigation only: no application source file was changed. Every request count is **code-derived**, not measured. 

Stale times, query keys, shared reads, invalidation, browser storage, per-user safety.

**23 findings name this area** (a finding naming several areas appears in each; its primary area is listed first in its block).

| ID | Pri | Conf | Title |
|---|---|---|---|
| AD-03 | P1 | High | `hasContracts` fan-out: one uncapped query per visible subaccount, refetched on focus, retried without Retry-After |
| CA-05 | P1 | Medium | A paid toggle, a panel save or a panel delete reloads the WHOLE category book, and the spinner waits for it |
| AD-04 | P2 | High | CAPEX tree is stale at 0 ms: every window focus re-reads the whole account table |
| AD-06 | P2 | High | Project Gates: every Active-pill click reloads the whole dataset chain (3–4 waves); overlapping clicks run overlapping reloads |
| CA-08 | P2 | High | The SPV/DevCo mapping table is read on every CAPEX book load and every sheet load, with no cache |
| CA-10 | P2 | High | The heavy CAPEX reads refetch on every window focus after 30 s (re-raise of OPT-18 with scoped evidence) |
| PB-04 | P2 | High | "Edit Project" and "Edit Costs" open a new tab that pays the whole cold boot again |
| AD-09 | P3 | High | Costs settings: three scope reads refetch on every focus; OPEX rows read twice per scope |
| AD-11 | P3 | Medium | Plugin-cascading deletes do not invalidate the project caches they change |
| AD-12 | P3 | High | Same table, three admin reads (OPT-07c residual) |
| CB-08 | P3 | High | The OPEX book re-reads `vsb_opexsubaccounts` on every load while the screen holds the catalogue |
| CB-12 | P3 | High | Contracts: id-set query keys make a create or delete read the payment targets and links twice |
| CB-15 | P3 | High | Every Land Lease write reloads the whole book, reference rows included, before the save resolves |
| PA-08 | P3 | High | Production reload re-reads data the save has just read (twice when generation runs) |
| PA-09 | P3 | High | Type add / delete / replace refetches the turbines twice (old key, then new key) |
| PA-10 | P3 | High | Generator-type reads for ids only select 12–14 columns; Finance re-reads a list the warm-up has just cached |
| PA-11 | P3 | Medium | The Generators warm-up sends 10–13 reads from every PM screen, whether or not Generators is visited |
| PA-12 | P3 | Medium | Persisted catalogue (off): key not scoped by environment or user |
| PB-06 | P3 | High | `vsb_countries` is read under four keys with four selects (the rest of OPT-07a; D119 §4(a) still open) |
| PB-09 | P3 | High | The Generators warm-up runs 10 speculative reads on every PM screen, and most of them go stale before they are used |
| PB-10 | P3 | High | Project-row reads: Planning and Grid Operator share a loader but not a key; each PM screen re-reads `vsb_projects` with its own select |
| PB-15 | P3 | High | The General Data gate-cancellation path re-reads gates and Entra that the Check List has cached |
| PB-16 | P3 | High | Three separate Entra person caches for the same `aadusers` lookups |

## Findings

### AD-03 - `hasContracts` fan-out: one uncapped query per visible subaccount, refetched on focus, retried without Retry-After

**Priority P1, confidence High.** Source scope: Admin screens and the shared write engine.

- **Area:** network, concurrency, caching · **Screen:** CAPEX Accounts
- **File:line:** `features/admin/admin-capex-accounts/hooks.ts:49-56`, `Screen.tsx:152-158`, `app/Providers.tsx:23-27`
- **Function:** `useHasContracts`
- **Problem:** every subaccount of every expanded account gets its own `fetchPage` query, all started together (no gate). With `staleTime: 30_000` and the global `refetchOnWindowFocus: true`, all of them re-run on each tab return after 30 s. A 429 is retried twice with React Query's default 1 s / 2 s backoff, ignoring Retry-After.
- **Evidence:** `hooks.ts:50-55`: `useQueries({ queries: ids.map((id) => ({ queryKey: qk.adminCapexHasContracts(id), queryFn: () => hasContracts(id), staleTime: 30_000 })) })`; `Screen.tsx:155`: `for (const a of accounts) if (expandedIds.has(a.id)) for (const s of a.children) ids.push(s.id);`
- **Impact:** expanding a few large accounts (e.g. 5 × 20 subaccounts = 100 ids, illustrative) sends 100 reads at once, above the 52-concurrent ceiling per user, while the tree refetch and boot reads share it. The answer only greys out Delete, and the server re-checks it at delete time anyway (`adminCapexAccounts.ts:302, 310`).
- **Proposed solution:** (a) no decision needed: run the checks through a shared read gate of 4–8 (the deferred OPT-09 helper, or a local `createGate` used in `queryFn`); (b) *needs product decision (freshness):* `refetchOnWindowFocus: false` and a longer `staleTime` (e.g. 5 min) for these checks only. Safe because `deleteCapexSubaccount`/`deleteCapexAccount` re-check on the server before deleting. (c) Optional: one read per expanded account with `lookupIn("vsb_account", subIds)`, `$select=_vsb_account_value`. Not proposed by default, because without `$apply`/distinct it can return many contract rows per account.
- **Behaviour change?** (a) none; (b) needs product decision (a check may be up to 5 min old; the delete stays server-checked).
- **Risk:** Low.
- **Dependencies:** OPT-09 (deferred), OPT-18/DEC-3.
- **Validation approach:** jsdom test that expands 3 accounts with 30 subaccounts and asserts in-flight count ≤ gate; on DEV, count `[VSB] DATA "check CAPEX contracts on account"` lines after a tab return.
- **Priority:** P1 · **Confidence:** High (code); the platform behaviour above 52 in flight is not measured here.

### CA-05 - A paid toggle, a panel save or a panel delete reloads the WHOLE category book, and the spinner waits for it

**Priority P1, confidence Medium.** Source scope: Cost A: CAPEX/DEVEX, Add Cost from Table, shared costing layer.

- **Area** network / caching. **Screen** CAPEX/DEVEX tab. **File:line** `features/cost/costing/capexInvalidation.ts:53-61`, `features/cost/costing/useCostBook.ts:479-495,518-531` (awaited `invalidate`), `data/costBook.ts:913,1039`. **Function** `capexWriteInvalidations`, `useCapexWrites`.
- **Problem** OPT-12 narrowed the paid job to "the book alone", but the book is the whole category: payer defaults + `ceil(A/40)` contract reads + `ceil(C/40)` payment reads (each possibly paged) to show ONE changed month or ONE contract. The Add Cost path already patches the cached book from what the Save applied (`savedSheetPatch.ts`, `useCostBook.ts:660`); the panel path does not. D56 section 5 gives the reason: "Making it fire-and-forget would need a book patch like D51 section 11.19, or the pre-save grid would flash."
- **Evidence** `capexInvalidation.ts:54`: `if (job === "paid") return [book];`; `useCostBook.ts:494`: `await invalidate(context ? context.category : category, savedMonthsDeleteRows(args.payments) ? "save-deleted" : "save");`
- **Impact** Per paid toggle: 1 write, then `1 + ceil(A/40) + ceil(C/40)` requests in a 3-wave chain that the user waits for. The register (OPT-25) quotes "about 60k payments on a large category".
- **Proposed solution** On success `setQueryData` the cached book with the known result (the paid flag of one payment; the saved line and its month rows; the removed line), then confirm with a background refetch (`refetchType:"active"`, not awaited), as Add Cost does. Keep the awaited reload behind a switch for rollback.
- **Behaviour change?** needs product decision (the spinner lowers before the reload; canvas timing parity, D56 section 5). **Risk** medium (the patch must reproduce `loadCostLines` derivations such as `payer`, `totalCost`, `linkedCluster*`, `editedFromSpreadsheet`). **Dependencies** `applySavedSheetToBook` as the model. **Validation** differential test: patched book equals re-read book for random saves (as done for Add Cost, UT-SHEETPATCH). **Priority** P1. **Confidence** medium.

### AD-04 - CAPEX tree is stale at 0 ms: every window focus re-reads the whole account table

**Priority P2, confidence High.** Source scope: Admin screens and the shared write engine.

- **Area:** caching, network · **Screen:** CAPEX Accounts
- **File:line:** `data/adminQueryPresets.ts:14`, `features/admin/admin-capex-accounts/hooks.ts:26-31`
- **Function:** `useCapexTree`
- **Problem:** `FRESH_ON_ENTRY` is documented as "refetch whenever the screen mounts", but its `staleTime: 0` combined with the global `refetchOnWindowFocus: true` also refetches on every focus, not only after 30 s like other queries. The preset comment does not mention this.
- **Evidence:** `adminQueryPresets.ts:14`: `export const FRESH_ON_ENTRY = { staleTime: 0, refetchOnMount: "always" } as const;`; `Providers.tsx:27` `refetchOnWindowFocus: true`.
- **Impact:** 1 full-table `fetchAll` (6 columns, inactive rows included) per focus event (alt-tab, dialog, devtools). Small per call, but frequent and avoidable.
- **Proposed solution:** `{ staleTime: 30_000, refetchOnMount: "always" }` keeps "fresh on every entry" and limits focus refetches to the app default. Or add `NO_FOCUS_REFETCH` as Milestones does.
- **Behaviour change?** needs product decision (minor freshness: another admin's edit shows at the next entry or after 30 s instead of the next focus). OPT-18/DEC-3 covers the policy; this is the one admin query where it is 0 s.
- **Risk:** Low.
- **Dependencies:** DEC-3.
- **Validation approach:** hook test with a focus event within 30 s: assert no refetch; mount: assert refetch.
- **Priority:** P2 · **Confidence:** High.

### AD-06 - Project Gates: every Active-pill click reloads the whole dataset chain (3–4 waves); overlapping clicks run overlapping reloads

**Priority P2, confidence High.** Source scope: Admin screens and the shared write engine.

- **Area:** network, caching · **Screen:** Project Gates
- **File:line:** `features/admin/admin-gates-approvals/hooks.ts:71-104`, `data/adminInvalidation.ts:171-182`, `data/adminGatesApprovals.ts:633-684`
- **Function:** `useToggleActive`, `loadDataset`
- **Problem:** a one-boolean toggle is already optimistic, yet `onSettled` invalidates the full dataset: templates, header, tasks and approval chunks. The pill stays pending until that finishes. Each concurrent toggle on another pill calls `cancelQueries` and `invalidate` again; `loadDataset` takes no `AbortSignal`, so a cancelled reload's SDK requests still run to completion.
- **Evidence:** `hooks.ts:84`: `await qc.cancelQueries({ queryKey: key });`; `hooks.ts:102`: `onSettled: () => invalidateAfterGatesWrite(qc, { countryId, technology }),`; `hooks.ts:46`: `queryFn: () => repo.loadDataset(countryId as string, technology as number, qc.getQueryData<GatesDataset>(key)?.people)` (no signal).
- **Impact:** ≈ 8–12 requests per click (§B); N quick clicks on different pills = N × (2 + 6–10) requests, several reload chains overlapping. A rollback after a failure restores a snapshot that may predate a sibling toggle's optimistic flip (`hooks.ts:85, 100`), so that sibling's pill shows the old value until the reload.
- **Proposed solution:** (a) none: after a successful toggle, reload only the half that changed: templates for a gate toggle, approvals for a task toggle (reuse the cached header and tasks). Or keep the optimistic row and mark the dataset stale with `refetchType: "none"` (the `staleOnly` pattern of `usePlanWrite.ts:203-205`). (b) Coalesce: debounce the post-toggle invalidation by about 300 ms so N clicks give one reload.
- **Behaviour change?** (a) partial reload: needs product decision (other users' edits in the untouched half show at the next full load or focus); (b) none.
- **Risk:** Low–Medium (the dataset's derived index `buildTaskIndex` must still be rebuilt).
- **Dependencies:** OPT-17 (people reuse done), OPT-18.
- **Validation approach:** hook test: 3 toggles in 100 ms → 3 guarded updates, 1 dataset load; `[VSB] ACTION` count on DEV.
- **Priority:** P2 · **Confidence:** High.

### CA-08 - The SPV/DevCo mapping table is read on every CAPEX book load and every sheet load, with no cache

**Priority P2, confidence High.** Source scope: Cost A: CAPEX/DEVEX, Add Cost from Table, shared costing layer.

- **Area** caching / network. **Screen** CAPEX tab, Add Cost. **File:line** `data/costBook.ts:157-175`, `:1163` (`const payerRead = category >= 0 ? loadPayerDefaults() : undefined;`), `data/addCostSheet.ts:141`. **Function** `loadPayerDefaults`.
- **Problem** OPT-05 took the read off the critical chain, but it is still one extra request on every tab switch, every post-save refetch (CA-05), every focus refetch (CA-10) and every sheet open. It is global master data (3 columns, whole table) and the chart of accounts beside it already has a shared read with a 30 s memo (`capexChart.ts`).
- **Evidence** `costBook.ts:158-167`: `fetchAll("list SPV/DevCo sub-account mapping", ..., { select: [...], filter: ACTIVE })`, no `sharedRead`.
- **Impact** 1 request per category book load; it is also one more way for the whole book to fail (`payerRead` is awaited at `:1173`).
- **Proposed solution** Put it behind `sharedRead` (30 s to 5 min) like `capexChart.ts`, or use `ensureQueryData` as for project states. The only app reference besides the Cost loaders is a read in `data/adminCost.ts:351`; no in-app write was found (G3).
- **Behaviour change?** none (same freshness window as the CAPEX chart). **Risk** low. **Dependencies** G3. **Validation** extend `costReadPath.waves.test.ts`; count requests per tab switch. **Priority** P2. **Confidence** high.

### CA-10 - The heavy CAPEX reads refetch on every window focus after 30 s (re-raise of OPT-18 with scoped evidence)

**Priority P2, confidence High.** Source scope: Cost A: CAPEX/DEVEX, Add Cost from Table, shared costing layer.

- **Area** caching. **Screen** CAPEX tab, Summary, comments. **File:line** `features/cost/costing/useCostBook.ts:85-87` (cost book: no `staleTime`, no focus opt-out), `:417-423` (totals), `:845-851` (comments); compare `:553-559` (the sheet opts out through `NO_FOCUS_REFETCH`) and `:752-759` (standard assumptions opt out). `app/Providers.tsx:24-27`.
- **Problem** Returning to the browser tab after 30 s refetches the whole category book (flow B1), the category's comments and, on the Summary tab, the whole-project sums. The master-data sibling reads already opted out (D159); the three heaviest project reads did not.
- **Evidence** `useCostBook.ts:86`: `queryKey, enabled: Boolean(projectId), retry: false,` (no refetch policy).
- **Impact** One category reload (about `1 + ceil(A/40) + ceil(C/40)` plus `ceil(C/40)` for comments) per tab return. An open Add/Edit panel is not corrupted by it: its `storedPayments` snapshot is captured at open (`Screen.tsx:~950`).
- **Proposed solution** Not a blanket change. Keep the 30 s protection for the book (multi-user freshness, DEC-3), but give comments a longer `staleTime` / `refetchOnWindowFocus:false` (the dots are advisory and re-read after every comment write) and consider a few minutes for the Summary totals. The decision belongs to the product owner.
- **Behaviour change?** needs product decision (freshness DIVERGENCE). **Risk** low-medium. **Validation** count `[VSB] ACTION Load` lines after a tab return, as OPT-18 suggests. **Priority** P2. **Confidence** high on the facts.

### PB-04 - "Edit Project" and "Edit Costs" open a new tab that pays the whole cold boot again

**Priority P2, confidence High.** Source scope: PM B: boot, Project Overview, PM screens, Cluster Checklist.

- **Area:** caching, network. **Screen:** Project Overview, then any PM or Cost screen.
- **File:line:** `features/pm/project-main/Screen.tsx:684-728`; `app/SessionContext.tsx:53-65`; `data/currentUser.ts:189-237`.
- **Function:** `openInNewTab`, `openProjectTab`.
- **Problem:** the query cache lives in memory per tab. Every "Edit Project" or "Edit Costs" click re-reads, with nothing shared:
  - the environment variables (2 sequential requests);
  - the whole current-user chain (6 requests, 3 waves);
  - the project-states list and the countries;
  - the session project.

  That is about 10-12 requests of reference data before the target screen's own reads, on every click. The canvas also launches a new tab (parity), but it is a separate app with its own `OnStart`.
- **Evidence:** `window.open(url, "_blank", "noopener,noreferrer");` (`Screen.tsx:674`, the `launch` both paths use); `staleTime: Infinity,` (`useCurrentUser.ts:17`), which lasts only as long as the tab.
- **Impact:** code-derived, about 10-12 requests and 3 waves per opened tab. Users who open several projects from the list pay it each time.
- **Proposed solution:**
  - Persist ONLY non-security reference data across tabs: the environment variables, project states and countries, keyed by environment id, with their present `staleTime`. TanStack `persistQueryClient` with a `localStorage` persister and a whitelist of keys.
  - Never persist roles or user flags (D119 §4(d) already refused that without a product decision).
  - The tab still revalidates in the background.
- **Behaviour change?** Needs a product decision: freshness across tabs, and storage of tenant configuration in the browser.
- **Risk:** M. Stale admin changes (a new state) are visible later; the storage can be blocked (it must work without it); per-user isolation through the key.
- **Dependencies:** D119 §4(d); `consoleGate` (it learns `vsb_EnvironmentName` from the env-var read, `project.ts:105`). A persisted value would have to apply the gate too.
- **Validation:** the `[VSB] ACTION Load` count in the new tab, with and without the persisted entries; tests for blocked storage.
- **Priority:** P2. **Confidence:** High on the cost. The benefit depends on usage.

### AD-09 - Costs settings: three scope reads refetch on every focus; OPEX rows read twice per scope

**Priority P3, confidence High.** Source scope: Admin screens and the shared write engine.

- **Area:** caching, query · **Screen:** Costs
- **File:line:** `features/admin/admin-cost/hooks.ts:59-84`, `data/adminCost.ts:466-497`
- **Function:** `useDevexCosts`, `useOpexPeriods`, `useInactiveOpexRows`
- **Problem:** no `staleTime` override, so the global 30 s + focus refetch re-runs 3 full scope reads (16 + 38 + 5 columns) on each tab return. Active and inactive OPEX rows are two queries on the same table.
- **Evidence:** `hooks.ts:66-71`: `useQuery({ queryKey: qk.adminCostOpex(scope), queryFn: () => listOpexPeriods(scope as CostScope), enabled: Boolean(scope) })`; `adminCost.ts:487`: `filter: and(scopeFilter(scope), ne("statecode", 0))`.
- **Impact:** 3 requests per tab return; 1 extra request per scope load.
- **Proposed solution:** (a) `NO_FOCUS_REFETCH` (as Milestones, because an open drawer is compared to these rows); (b) S6-12, one read with a statecode split client-side, was **skipped on purpose** in D160 §10 (it couples failure modes). Not re-raised.
- **Behaviour change?** (a) needs product decision (DEC-3).
- **Risk:** Low.
- **Dependencies:** DEC-3.
- **Validation approach:** focus-event hook test.
- **Priority:** P3 · **Confidence:** High.

### AD-11 - Plugin-cascading deletes do not invalidate the project caches they change

**Priority P3, confidence Medium.** Source scope: Admin screens and the shared write engine.

- **Area:** caching (correctness) · **Screen:** Costs (DEVEX delete), Contracts (delete)
- **File:line:** `data/adminInvalidation.ts:112-124, 142-157`
- **Function:** `costsWriteKeys`, `contractsWriteKeys`
- **Problem:** `VSB_CapexAssumptionDeletion` deletes every project `vsb_capexprojectcontract` and `vsb_capexcost` built from a deleted standard cost. `VSB.BoPContractAssumptionDeletion` deletes every project BoP contract and DevCo cost built from a deleted standard contract (§E). The invalidation lists refresh only the standard-assumption keys, not the project cost book, totals, Add-Costs sheet or project contracts caches. Compare `capexAccountsWriteKeys` (`:53-72`), which does include them.
- **Evidence:** `adminInvalidation.ts:113-117`: `if (kind === "devex") { return [scope ? qk.adminCostDevex(scope) : qk.adminCostDevexAll, qk.capexStandardAssumptionsAll]; }`.
- **Impact:** in the same tab, a project Cost screen visited within the last 30 s (default `staleTime`) shows deleted contracts until its next refetch. Low frequency, no request saving, but a correctness gap.
- **Proposed solution:** for the two delete paths only, add `qk.costBookAll`, `qk.capexTotalsAll`, `qk.addCostSheetAll` (DEVEX) and the project BoP contracts prefixes (Contracts). Unmounted queries are only marked stale, so the cost is 0 requests until the screen is opened.
- **Behaviour change?** none (fresher data).
- **Risk:** Low.
- **Dependencies:** none.
- **Validation approach:** invalidation-key unit test (`adminInvalidation.test.ts` pattern).
- **Priority:** P3 · **Confidence:** Medium (the plugin behaviour is read from the DLL strings per `04-flow-inventory.md`, not observed).

### AD-12 - Same table, three admin reads (OPT-07c residual)

**Priority P3, confidence High.** Source scope: Admin screens and the shared write engine.

- **Area:** query, caching · **Screen:** CAPEX Accounts, Costs, Contracts
- **File:line:** `data/adminCapexAccounts.ts:66-78` (all rows, 6 cols, FRESH_ON_ENTRY), `data/adminCost.ts:260-276` (ACTIVE, 5 cols, 30 min, `qk.adminCostHierarchy`), `data/capexAccounts.ts:26-28` → `data/capexChart.ts:39` (ACTIVE, `qk.capexAccounts`)
- **Problem:** Contracts already uses the shared chart read (B2); the Costs hierarchy still reads the same active rows itself.
- **Evidence:** `adminCost.ts:261-267`: `fetchAll<Raw>("list CAPEX account hierarchy", (o) => Vsb_capexaccountlistsService.getAll(o) as never, { select: [...], filter: ACTIVE })`.
- **Impact:** 1 request per Costs-settings cold load when the chart is warm. Small.
- **Proposed solution:** build `buildCapexHierarchy` from `loadCapexChartRows()` (the same columns plus `vsb_number` ordering; `buildCapexHierarchy` re-sorts by order, number, name anyway). Keep the admin tree separate (it deliberately includes inactive rows).
- **Behaviour change?** none: `CHART_SELECT` (`capexChart.ts:30-33`) holds all five columns (id, number, name, order, parent) plus `vsb_accountcategory`, with the same `ACTIVE` filter. Freshness becomes the chart's 30 s memo instead of 30 min (fresher).
- **Risk:** Low.
- **Dependencies:** OPT-07c.
- **Validation approach:** differential test of `buildCapexHierarchy` over both inputs.
- **Priority:** P3 · **Confidence:** High.

### CB-08 - The OPEX book re-reads `vsb_opexsubaccounts` on every load while the screen holds the catalogue

**Priority P3, confidence High.** Source scope: Cost B: Contracts, OPEX, Land Lease, periods.

- **Area** caching · **Screen** OPEX
- **File:line** `data/costBook.ts:468-472, 498-503`; `features/cost/costing/useCostBook.ts:357-365`
- **Function** `loadOpexPeriods`, `useOpexCatalog`
- **Problem** OPT-06 started this read at t = 0 (one of its two proposed options) but did not take it from the cached catalogue.
  The same table, with a superset of the columns, sits in `["opex-subaccounts"]` (30 min).
- **Evidence** `const subaccountsRead = fetchAll("list OPEX subaccounts", ... { select: ["vsb_opexsubaccountid", "vsb_name"], filter: ACTIVE })`
  (`costBook.ts:468-472`) vs `queryKey: ["opex-subaccounts"] ... staleTime: 30 * 60 * 1000` (`useCostBook.ts:359-360`).
- **Impact** 1 request per OPEX visit, focus refetch and post-write reload (on the first visit, 2 reads of the table). No wave,
  because it runs in parallel.
- **Proposed solution** Pass `queryClient.ensureQueryData` of the catalogue's subaccounts into `loadOpexPeriods`, the same way OPT-06
  did for the accounts (`useCostBook.ts:364`).
- **Behaviour change?** none. The freshness of the names follows the catalogue (30 min, the same rows: ACTIVE).
- **Risk** Low · **Dependencies** the costBook auditor owns `loadOpexPeriods` · **Validation** request count in `useCostBook.reads.test.tsx`.
- **Priority** P3 · **Confidence** High

### CB-12 - Contracts: id-set query keys make a create or delete read the payment targets and links twice

**Priority P3, confidence High.** Source scope: Cost B: Contracts, OPEX, Land Lease, periods.

- **Area** caching · **Screen** Contracts
- **File:line** `features/cost/contracts/hooks.ts:55, 115, 282, 291, 318-327`; `data/keys.ts:181-196`
- **Function** `usePaymentTargets`, `useDevCoLinks`, `invalidateContractCaches`
- **Problem** The keys include the joined contract ids (OPT-12 B2). A delete invalidates targets and links under the OLD key (they
  refetch at once, because they are active), and then the contracts refetch changes the id set. The new key reads both again. A
  create does the same for the links, and reads every target again under the new key.
- **Evidence** `queryKey: [...qk.paymentTargets(projectId ?? "none"), idsKey]` (`:55`); `onSettled: () =>
  invalidateContractCaches(queryClient, projectId)` with `contractInvalidations = [contracts, paymentTargets, devCoLinks]`
  (`keys.ts:181-186`).
- **Impact** +2 requests per delete and +1 per create (C ≤ 40), wasted but in parallel (code-derived).
- **Proposed solution** On delete and create, invalidate the contracts only, with `refetchType: "none"` on the two prefixes (mark stale).
  The new key then fetches. If the key did not change, the stale entry refetches on the next mount or focus (staleTime 0). Or seed
  the new key from the old data minus the deleted contract. CB-05 removes the cause entirely.
- **Behaviour change?** none · **Risk** Low · **Priority** P3 · **Confidence** High

### CB-15 - Every Land Lease write reloads the whole book, reference rows included, before the save resolves

**Priority P3, confidence High.** Source scope: Cost B: Contracts, OPEX, Land Lease, periods.

- **Area** caching · **Screen** Land Lease · **File:line** `features/cost/costing/useCostBook.ts:323-328`; `data/landLease.ts:120-131`
- **Problem** `onSuccess` awaits the invalidation, so the write status and the write guard stay up for 2 more waves of 4 requests,
  including the 9-row `vsb_landleasesubaccounts` reference table. The `["cost-book", p, "none"]` invalidation is request-free unless
  the OPEX screen is mounted (OPT-04 already noted it as needless).
- **Proposed solution** Move the subaccounts into their own long-cached query (`landLease.ts:121-131`), which saves 1 request per
  reload, and drop the OPEX-book invalidation. A cache patch from the plan instead of the reload is possible but changes the
  freshness the canvas has (it reloads), so it needs a product decision.
- **Behaviour change?** none for the first two · **Priority** P3 · **Confidence** High

### PA-08 - Production reload re-reads data the save has just read (twice when generation runs)

**Priority P3, confidence High.** Source scope: PM A: Generators, Production, Revenues, Finance.

- **Area**: caching · **Screen**: Production · **File:line**: `features/pm/production/hooks.ts:164-168, 180-186, 189-201`
- **Function**: `useProductionWrites`, `rollUp`, `generateIfDue`
- **Problem**: `rollUp` reads yields and the project fresh, then writes only project columns. The job's background reload (`productionAll`) reads both again. The generation job (a second `w.run`) has no `invalidate` of its own, so it reloads `productionAll` again, although the generation writes no yield.
- **Evidence**: `const [yields, project] = await Promise.all([listEnergyYields(id), loadProductionProject(id)]);` (`:181`); `invalidate: [qk.productionAll(id), …]` (`:165`); `w.run({ progress: UI.loadingStandardContracts, plan: … })` (`:191-200`, no `invalidate`).
- **Impact**: 1 redundant yields read per action, plus 1 per generation run (code-derived). Small and in the background, but it lengthens `refreshing`, which holds the commands.
- **Proposed solution**: seed `qk.production(id, "yields")` from the `rollUp` read (`setQueryData`) and invalidate only the project. Give the generation job `invalidate: [qk.production(id, "project")]` (it writes the four CAPEX flags only).
- **Behaviour change?** none · **Risk**: L · **Dependencies**: none · **Validation**: reload tests counting reads (UT-PRODREAD style) · **Priority**: P3 · **Confidence**: high.

### PA-09 - Type add / delete / replace refetches the turbines twice (old key, then new key)

**Priority P3, confidence High.** Source scope: PM A: Generators, Production, Revenues, Finance.

- **Area**: caching / network · **Screen**: Generators · **File:line**: `features/pm/generators/reload.ts:45-51, 113, 120, 135`; `hooks.ts:209-225`; `data/usePlanWrite.ts:204-205`
- **Function**: `familyKeys`, `useProjectTurbines`
- **Problem**: the turbines key embeds the type ids. The reload invalidates the `turbines` prefix and `types` at the same time (`Promise.all`). The active query under the OLD key refetches (its result is discarded), then the new types change the key and the turbines are read again.
- **Evidence**: `queryKey: qk.generators(projectId ?? "", "turbines", ...sorted)` (`hooks.ts:216`); `Promise.all((job?.invalidate ?? opts.invalidate).map((queryKey) => qc.invalidateQueries(…)))` (`usePlanWrite.ts:204-205`).
- **Impact**: ⌈T/40⌉ wasted requests per add / delete / replace of a WTG type (usually 1).
- **Proposed solution**: for the kinds that change the type set, invalidate the turbines only after the types refetch has settled, or mark the old key stale only and rely on the key change.
- **Behaviour change?** none · **Risk**: L–M (if the type set comes back unchanged, a stale-only key must still be refetched; keep a fallback refetch) · **Validation**: `saveLatency.reload.test.tsx` style count · **Priority**: P3 · **Confidence**: high.

### PA-10 - Generator-type reads for ids only select 12–14 columns; Finance re-reads a list the warm-up has just cached

**Priority P3, confidence High.** Source scope: PM A: Generators, Production, Revenues, Finance.

- **Area**: query / caching · **Screens**: Finance, Production · **File:line**: `data/finance.ts:219-225`; `data/production.ts:340-343`; `data/generators.ts:244-249, 362-366`
- **Function**: `countActiveTurbines`, `loadGenerationInputs`
- **Problem**: both callers use only `id` (and turbine `name`) but call `listGeneratorTypes` / `listPvTypes` / `listProjectTurbines`, whose `$select`s carry 10–14 columns plus formatted-value annotations. Finance's count also misses `qk.generators(projectId, "types")`, which the warm-up (`app/generatorsWarmup.ts:51`) puts in the cache 1.5 s into the visit.
- **Evidence**: `const { listGeneratorTypes } = await import("./generators"); const types = await listGeneratorTypes(projectId);` (`finance.ts:219-220`).
- **Impact**: payload only (row counts are small); Finance can save 1 request when the warm-up has run. Production's pre-write reads must stay live (OPT-24), so there only the column list changes.
- **Proposed solution**: id-only variants (`select: [id]`). For Finance, `qc.fetchQuery(generatorTypesQueryOptions(projectId))`, which keeps D109 freshness when the cached entry predates the visit (as `useVisitStaleTime`).
- **Behaviour change?** none · **Risk**: L · **Priority**: P3 · **Confidence**: high.

### PA-11 - The Generators warm-up sends 10–13 reads from every PM screen, whether or not Generators is visited

**Priority P3, confidence Medium.** Source scope: PM A: Generators, Production, Revenues, Finance.

- **Area**: caching / network · **Screens**: all PM screens · **File:line**: `app/generatorsWarmup.ts:40-55`; `app/routes.tsx:135`; `features/pm/generators/queries.ts:101-117`; `app/Providers.tsx:24`
- **Function**: `useGeneratorsWarmup`, `prefetchGenerators`
- **Problem**: once per project per page load, 1.5 s after Production, Revenues, Finance (any PM screen) opens, the Generators chunk and about 10 reads (plus supplier chunks and countries) start. They are cached at the app's 30 s `staleTime`, so a Generators visit more than 30 s later refetches them on mount anyway, still showing the cached copy at once. Within the default 5-minute `gcTime` the warm-up helps first paint; after it, nothing. The reads overlap the current screen's own Fabric and Dataverse reads (well under 52 in flight).
- **Evidence**: `import("@/features/pm/generators/queries").then((q) => q.prefetchGenerators(qc, projectId))` (`generatorsWarmup.ts:50-51`); "A person who … opened its General Data, Milestones, ... screen very often goes to Generators next" (`:6-8`, an assumption, not measured).
- **Impact**: ≈ 10–13 requests per project per page load when Generators is not visited. Requires usage data.
- **Proposed solution**: measure the hit rate (`[VSB]` lines). If it is low, warm on intent (hover/focus of the Generators nav entry) or only the Generators chunk.
- **Behaviour change?** none · **Risk**: L · **Priority**: P3 · **Confidence**: medium (requires profiling).

### PA-12 - Persisted catalogue (off): key not scoped by environment or user

**Priority P3, confidence Medium.** Source scope: PM A: Generators, Production, Revenues, Finance.

- **Area**: caching / security · **Screen**: Generators · **File:line**: `data/generatorCatalogueCache.ts:35-36, 47-55`; `features/pm/generators/hooks.ts:126-156`
- **Problem**: the version key is shape + build id + column fingerprint, and the entry key is the FID date. Neither environment (org) nor user is included. IndexedDB is per origin: two users on one browser profile, or two environments if they share an origin, see each other's last catalogue until the server read replaces it. Writes are held back while the rows are seeded (`hooks.ts:154-155`), so nothing stale is saved, but a model not visible to the user's security role can be shown for the length of one read.
- **Evidence**: `referenceVersion(\`shape${SHAPE}\`, appBuild(), fingerprint(Object.values(GENERATOR_COL).join(",")))` (`:36`).
- **Proposed solution**: before flipping `persistCatalogue`, add the environment id and the user's object id (or a hash) to the version key.
- **Behaviour change?** none · **Risk**: L · **Priority**: P3 (latent, flag off) · **Confidence**: medium (origin sharing across environments not verified).

### PB-06 - `vsb_countries` is read under four keys with four selects (the rest of OPT-07a; D119 §4(a) still open)

**Priority P3, confidence High.** Source scope: PM B: boot, Project Overview, PM screens, Cluster Checklist.

- **Area:** caching, query. **Screen:** boot, Overview, General Data, Milestones, the Generators warm-up.
- **File:line:**
  - `data/currentUser.ts:183-187` (no key, 2 cols, all rows);
  - `features/pm/project-main/queries.ts:68-72` (`["countries"]`, 2 cols, ACTIVE);
  - `data/generalData.ts:119-137` (`qk.generalDataCountries`, 5 cols, all);
  - `data/countries.ts:21,66-67` (`qk.adminCountries`, 5 cols; used by the Generators warm-up, `generators/queries.ts:39`).
- **Problem:** one small table, read up to four times in one session. OPT-07a was closed for Milestones and Generators only (`05_…Tracker.md:27,32`).
- **Evidence:**
  - `{ select: ["vsb_name", "_vsb_businessunit_value"] }` (`currentUser.ts:186`)
  - `queryKey: ["countries"] as const,` (`queries.ts:69`)
  - `select: ["vsb_countryid", "vsb_name", "vsb_title", "_owningbusinessunit_value", "_vsb_businessunit_value"]` (`generalData.ts:123`)
  - `export const COUNTRY_SELECT = ["vsb_countryid", "vsb_name", "vsb_isocurrencycode", "vsb_title", "statecode"];` (`countries.ts:21`)
- **Impact:** 2-3 extra requests per session (code-derived), one of them in the boot's wave 1.
- **Proposed solution:** one `queryOptions` with the union select (id, name, title, ISO currency, statecode, the two business-unit columns), all rows, 30 min. Each consumer takes a `select` view: ACTIVE and sorted for the Overview, sorted for General Data, the BU map for the current user. The same technique as `data/projectStates.ts`.
- **Behaviour change?** None, if each view reproduces its filter and sort, including the Overview's server `vsb_name asc` against General Data's `localeCompare`.
- **Risk:** L-M (sort-order differences, the admin invalidation lists `data/adminInvalidation.ts`).
- **Dependencies:** OPT-07a; `adminInvalidation.ts`.
- **Validation:** differential tests old reader against the view (the OPT pattern); the request count at boot.
- **Priority:** P3. **Confidence:** High.

### PB-09 - The Generators warm-up runs 10 speculative reads on every PM screen, and most of them go stale before they are used

**Priority P3, confidence High.** Source scope: PM B: boot, Project Overview, PM screens, Cluster Checklist.

- **Area:** network, caching. **Screen:** every PM screen except Generators.
- **File:line:** `app/generatorsWarmup.ts:40-55`; `app/routes.tsx:135`; `features/pm/generators/queries.ts:44-90, 101-116`.
- **Problem:** 1.5 s after any PM screen opens, 10 Generators reads start (11 with `readsByProject`), once per project per page load. Nine of them keep the 30 s default `staleTime` (only `pvModuleCatalog` has 30 min, `:68`). A person who reaches Generators more than 30 s later is shown the warm data, and the screen then re-reads all nine: the warm-up was paid twice. D141 assumes Generators is usually next; no hit-rate figure exists.
- **Evidence:** `const timer = setTimeout(() => {` … `q.prefetchGenerators(qc, projectId)` (`generatorsWarmup.ts:46-51`); `export const generatorTypesQueryOptions = (projectId: string) => queryOptions({ queryKey: …, queryFn: … });` (no `staleTime`, `queries.ts:49-52`).
- **Impact:** up to 10 extra reads per project visit. On the Check List they overlap waves 2-4 of the visit. Dataverse allows 52 concurrent requests per user, so there is no throttling risk, but it is load.
- **Proposed solution:** measure the hit rate first (the `logAction` line at `queries.ts:103` against the next Generators `Load` lines). Then either warm on intent (hover or focus of the Generators rail item), or skip the warm-up on the screens with the heaviest own load (Check List).
- **Behaviour change?** None (timing only).
- **Risk:** L. **Dependencies:** D141, `GENERATORS_PERF.prefetch` (Generators auditor).
- **Validation:** `[VSB]` line counts on DEV across a typical navigation path.
- **Priority:** P3. **Confidence:** High (code). The benefit cannot be measured from the code.

### PB-10 - Project-row reads: Planning and Grid Operator share a loader but not a key; each PM screen re-reads `vsb_projects` with its own select

**Priority P3, confidence High.** Source scope: PM B: boot, Project Overview, PM screens, Cluster Checklist.

- **Area:** caching, query. **Screen:** Planning, Grid Operator (and every PM screen).
- **File:line:** `grid-operator/hooks.ts:46-53`; `planning/hooks.ts:81-84`; `data/team.ts:64-68`; `data/checklist.ts:164-181`; `data/milestones.ts:72-79`; `data/generalData.ts:38-53`.
- **Problem:** `loadPlanningProject` runs under `qk.planning(id,"project")` and again under `qk.gridOperator(id,"project")`. The comment says "it selects the same lock columns". Planning → Grid Operator within 30 s still reads the row twice. More widely, there are 6 different `$select`s of the same row across the PM screens, besides the session row.
- **Evidence:** `queryKey: qk.gridOperator(projectId ?? "", "project"),` / `queryFn: () => loadPlanningProject(projectId!),` (`grid-operator/hooks.ts:48-49`).
- **Impact:** 1 request per Planning ↔ Grid Operator move. Small, since each screen re-reads on visit anyway (canvas `OnVisible`).
- **Proposed solution:** one shared key for `loadPlanningProject` (and its invalidation in both reload maps). A union "PM project row" query is possible, but OPT-01's re-key was declined ("smaller gain, higher risk", `05_…Tracker.md:62`).
- **Behaviour change?** None.
- **Risk:** L. **Dependencies:** `planning/reload.ts`, `grid-operator/reload.ts` mapping tests.
- **Validation:** UT-*-OPT-2xx reload mapping tests.
- **Priority:** P3. **Confidence:** High.

### PB-15 - The General Data gate-cancellation path re-reads gates and Entra that the Check List has cached

**Priority P3, confidence High.** Source scope: PM B: boot, Project Overview, PM screens, Cluster Checklist.

- **Area:** caching. **Screen:** General Data.
- **File:line:** `general-data/hooks.ts:250`; `checklist/hooks.ts:188-196` (`qk.checklistGates`).
- **Problem:** `cancelDraftGateApprovalIfRunning` calls `listChecklistGates` directly: one gate read + Entra, on a path that is already sequential inside the save. The Check List keeps the same data under `qk.checklistGates(country, tech)`.
- **Evidence:** `const gates = await listChecklistGates({ countryId: args.project.countryId, technology: args.project.technology ?? null });` (`:250`).
- **Impact:** 1-2 requests on a rare save path (a start-cluster change while the Draft approval runs).
- **Proposed solution:** `qc.fetchQuery` with the Check List's gate query options (honours their `staleTime`).
- **Behaviour change?** Freshness only: gate admin settings can be up to their `staleTime` old.
- **Risk:** L. **Dependencies:** D156 `scopedGates`.
- **Validation:** hook test.
- **Priority:** P3. **Confidence:** High.

### PB-16 - Three separate Entra person caches for the same `aadusers` lookups

**Priority P3, confidence High.** Source scope: PM B: boot, Project Overview, PM screens, Cluster Checklist.

- **Area:** caching. **Screen:** General Data, Team, Check List.
- **File:line:** `data/personCache.ts:23-26` (Team); `data/checklistPeople.ts:21, 53-61` (Check List); `general-data/hooks.ts:160-169` (`qk.entraPeople(ids)` → uncached `getEntraPeople`).
- **Problem:** a project manager looked up on General Data is looked up again on Team (and again on the Check List when that person is also a Portfolio Manager). `personCache.ts:17` says the Check List cache was deliberately kept apart.
- **Impact:** 1-2 Graph-backed requests per screen change. The Graph virtual table is the slowest read (`currentUser.ts:172-175`).
- **Proposed solution:** route General Data's `useEntraPeople` through `lookupPeopleCached`, which has the same 30-minute DIVERGENCE as Team (D160); merging with the Check List's needs its owner's nod.
- **Behaviour change?** Freshness: a name changed in Entra shows up to 30 min late on General Data. It needs the same D160 sign-off.
- **Risk:** L. **Dependencies:** D156, D160.
- **Validation:** hook tests.
- **Priority:** P3. **Confidence:** High.

---

