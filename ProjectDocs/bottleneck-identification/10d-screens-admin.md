# 10d - Screen-level audit: Application Settings (admin) and Report a problem

Agent prefix `SAD`. Register: `_register/SAD.md` (17 findings). Worktree `Project-Management-Energy-WorkDev1-BottleneckOptimization`, base `dde9e92`. Read-only audit; nothing under `ProjectCosts-CodeApp/` was changed. All paths below are relative to `ProjectCosts-CodeApp/` unless they start with `ProjectDocs/`.

## 1. Scope inspected, and what was not

Read in full or in the relevant parts:

- Screens: `src/features/admin/{admin-default-checklists,admin-gates-approvals,admin-capex-accounts,admin-cost,admin-contract,admin-milestones}/` (`Screen.tsx`, `hooks.ts`, plus `AccountCard.tsx`, `GateTable.tsx`, `DevexCostTree.tsx`, `DevCoCostForm.tsx`, `AssumptionsMatrix.tsx`; `rules.ts` only where a derivation or write plan matters).
- Data: `src/data/adminCapexAccounts.ts`, `adminRowWrites.ts`, `adminDefaultChecklists.ts`, `adminChecklistTables.ts`, `adminGatesApprovals.ts`, `adminCost.ts`, `adminContract.ts`, `adminMilestones.ts`, `adminInvalidation.ts`, `adminFlags.ts`, `adminQueryPresets.ts`, `countries.ts`, `capexChart.ts`, `capexAccounts.ts`, `projectStates.ts`, plus `client.ts` (fetchAll, updateRecordIfExists), `requestFlags.ts`.
- Shared: `src/components/SettingsAccordion.tsx`, `SettingsTabStrip.tsx`, `CollapsibleCard.tsx`, `FormPanel.tsx` (header part), `src/app/{Providers,routes,bootPrefetch,bootPlan}.ts*`, `src/App.tsx`, `src/features/shared/useToggleSet.ts`, `src/features/shared/report-problem/ReportProblemPanel.tsx`.
- Prior art: D165 docs 02, 03, 04 (AD findings), 12, 13, 27; D162 docs 02, 03, 05, 08, 09; `ProjectDocs/instructions/KNOWN-RISKS-AND-DECISIONS.md`.
- `dist/` source maps (chunk sizes), and two throwaway scripts (section 4).

Not read in full: `rules.ts` bodies (message tables, validation), `ApprovalsPanel.tsx`, `PeoplePickerField.tsx`, `ContractPeriodDrawer.tsx`, `DevexCostDrawer.tsx`, `EditMilestonesPanel.tsx`, `Panels.tsx` (CAPEX), `TaskTable.tsx`, `TaskEditorDrawer.tsx` (only their state hooks were grepped: all form drafts are local state, which is consistent with D162 FE-AD-02). Tests were not run. No live Dataverse, no browser: every wall-clock claim is DERIVED or ESTIMATED.

## 2. Method and labels

Each screen was followed through the 16 stages (section 6 is the matrix). Evidence is labelled MEASURED (I ran something, command given), DERIVED (counted from source) or ESTIMATED (reasoning). Confidence uses the brief's CONFIRMED / HIGH / SUSPECTED. No finding is CONFIRMED, because no repo document or run measures any admin screen's latency (D165 doc 13 states that no runtime measurement was taken; D162 only measured bundle bytes and render counts).

Ranking follows the brief: frequency and user criticality, not size. The admin area is low-frequency, with one exception: **Check List Settings is the landing screen** (`src/app/routes.tsx:206` redirects `/admin` to it, and `src/App.tsx:~160` sends the App Settings menu there), so it is hit by every admin session.

## 3. Prior-programme status for the admin area (verified against current source)

| Prior ID | What | Current state in source |
|---|---|---|
| AD-01 (D165) clean-up resilience | retry, settle-all, partial report | FIXED, `CLEANUP_RESILIENT: true` (`data/adminFlags.ts:40`). No Resume or unload guard remains (SAD-05) |
| AD-02 | 2 requests per zeroed row, 1 per deleted row | OPEN, not started (`adminRowWrites.ts:273-290` still calls `updateRecordIfExists`) -> SAD-04, SAD-07 |
| AD-03 `hasContracts` fan-out | pooled to 6 | FIXED, `ADMIN_HAS_CONTRACTS_POOL: true`, `HAS_CONTRACTS_POOL_WIDTH = 6` |
| AD-04 tree stale 0 ms | focus refetch | OPEN (`data/adminQueryPresets.ts:14` unchanged) -> SAD-06 |
| AD-05 404 = already gone | | FIXED, `ADMIN_DELETE_ALREADY_GONE_OK: true` |
| AD-06 Gates Active pill reload | slice reload | FIXED for toggles, `ADMIN_GATES_NARROW_RELOAD: true`; focus refetch still runs the full chain -> SAD-13 |
| AD-07 order PATCH flows | | OPEN -> SAD-08 |
| AD-08 no existence GET after create | | FIXED, `ADMIN_NO_REDUNDANT_EXISTS: true` |
| AD-09 / AD-12 OPEX read twice, hierarchy own read | | **SWITCHED OFF**, `ADMIN_SCOPE_READS_ONCE: false` (`adminFlags.ts:45`, integration decision) -> SAD-10 |
| AD-10 Period-1 propagation | | OPEN -> SAD-09 |
| AD-11 cascade invalidation | | FIXED, `ADMIN_CASCADE_INVALIDATE: true` |
| OPT-17 (a)(b)(c) Gates fan-out and people reuse | | FIXED (`adminChecklistTables.ts` READ_FAN_OUT 4; `adminGatesApprovals.ts` PEOPLE_CHUNK_FAN_OUT 4, `PEOPLE_LOOKUP_FAN_OUT` 6, `GATES_REUSE_PEOPLE = true`) |
| OPT-07a/c/d shared countries, chart, states | | FIXED (shared `qk.adminCountries`, `capexChart.ts`, `projectStatesQueryOptions`) |
| FE-AD-01/02/03/05/06/07 (D162) | memo rows, local drafts, no Cost Contracts chunk | FIXED (GateTable rows `memo`, drafts local, `listActiveCapexAccounts` in `data/capexAccounts.ts`) |
| FE-AD-04, FE-AD-08, FE-AD-09 | | DEFERRED -> SAD-14, SAD-16, SAD-17 |
| D165 open question 8 (locks read scope) | | UNANSWERED -> SAD-01 |

`POLICY_ADMIN_WRITES` (retry policy on admin writes) is ON (`data/requestFlags.ts`), `REQUEST_DEADLINES` and `GLOBAL_GATE` are OFF, so no admin call has a deadline and none passes through a global request gate.

## 4. Measurements taken (MEASURED)

Scripts live in `ProjectDocs/bottleneck-identification/_bench/SAD/`.

1. **Chunk sizes** (`node chunks.mjs ProjectCosts-CodeApp/dist/assets`, source maps used to attribute chunks):

   | Chunk | Raw | Gzip |
   |---|---|---|
   | Costs `Screen-D-tfb6nZ.js` | 76.9 KB | 22.5 KB |
   | Contracts `Screen-BCiAxgJ7.js` | 76.1 KB | 22.0 KB |
   | Gates `Screen-Dgwg0-Cx.js` | 40.2 KB | 12.7 KB |
   | CAPEX Accounts `Screen-MdqRc4Pr.js` | 38.7 KB | 12.5 KB |
   | Check List Settings `Screen-8Bf0Dqoc.js` | 27.8 KB | 9.8 KB |
   | Milestones `Screen-D5QLiMEH.js` | 23.0 KB | 7.5 KB |
   | `SettingsTabStrip` / `SettingsAccordion` shared chunks | 16.5 / 14.1 KB | 6.2 / 5.1 KB |

   `ReportProblemPanel` is in the entry chunk `index-Bz8NfcTv.js` (450 KB raw / 146 KB gzip), as a 141-line file; its weight is negligible.
2. **First-visit closure** (`node firstvisit.mjs <dist> <chunk>`; static import closure minus the startup closure of `index.html`): startup ~316 KB gzip; extra per admin screen 32-76 KB gzip (Milestones 32 KB, CAPEX 54 KB, Contracts 51 KB, Costs 66 KB, Gates 72 KB, Check List 76 KB). My method differs from D162 doc 09, so totals (348-393 KB gzip) are close to, but not equal to, its 330-372 KB.
3. **Pure derivations at stress volume** (rolldown bundle of the real `rules.ts` / `adminCost.ts` functions, `node bench.out.mjs`, Node 24, 20 reps after warm-up):

   ```
   buildCapexTree 5111 rows:      7.439 ms/call
   buildCapexHierarchy 5111 rows: 2.010 ms/call
   buildDevexTree 3000 costs:    18.349 ms/call
   buildTaskIndex 250+250:        0.462 ms/call
   ```
   These are one-off per data change (all are `useMemo`'d), so CPU in the admin derivations is **not** a bottleneck. The real tables are far smaller than 5,111 rows for the tree, so this is a safe upper bound.

## 5. Cross-cutting facts that shape every admin screen

- **Routing and loading.** `/admin/*` are six plain `lazy()` imports (`src/app/routes.tsx:51-56`), with no session gate and no idle prefetch of siblings (unlike PM screens, `app/pmScreenPrefetch.ts`). `bootPlan.ts` classifies every `/admin` path as `kind: "none"`, so a deep link to an admin URL starts nothing early. Arriving from Project Overview, countries and project states are already warm (boot prefetch for `projects`, and `useCurrentUser` reads countries through the shared `qk.adminCountries` entry).
- **Query defaults** (`app/Providers.tsx:19-37`): `staleTime` 30 s, `refetchOnWindowFocus: true`, `retry` 2 on retryable errors with jitter. Mutations are never retried at the query layer.
- **Freshness per screen** (this decides whether navigating between admin screens reloads data):

  | Screen | Reads | Stale / refetch rule |
  |---|---|---|
  | Check List Settings | tabs; tasks per tab; locks; clusters (shared states) | tabs 5 min; tasks 30 s + focus; locks refetch on EVERY mount, never stale afterwards; states 30 min |
  | Project Gates | dataset per (country, technology); states; countries | dataset 30 s + focus (full chain); states / countries 30 min |
  | CAPEX Accounts | whole tree; has-contracts per expanded subaccount | tree 0 ms (mount + every focus); checks 30 s + focus |
  | Costs | 6 reference reads; 3 scope reads | reference 30 min; scope reads 30 s + focus |
  | Contracts | list, DevCo per scope; chart | 30 s + focus; chart 5 min |
  | Milestones | assumptions | 5 min, no focus refetch |

  Switching between admin screens therefore re-reads, at most: the CAPEX tree (always), the Check List locks (always), and anything older than its stale time. Reference data is not re-read.
- **Accordions and cards mount only what is open.** `AccordionPanel` uses `unmountOnExit` (`@fluentui/react-accordion` 9.12.3, `useAccordionPanel.js`), and `CollapsibleCard` renders its body only when `expanded` (`components/CollapsibleCard.tsx`). Milestones, Costs and Check List Settings start collapsed, so closed sections cost nothing but JSX element creation. Gates starts with every gate expanded (canvas parity), which is SAD-12.
- **Write engine use.** Admin plans are single writes via `runPlan`; every multi-request flow lives in `data/admin*.ts` (D165 doc 03). Every guarded update is 2 sequential requests (SAD-07).
- **Invalidation** (`data/adminInvalidation.ts`) uses `allSettled` and refetches only mounted queries, so a write on an admin screen refetches the screen's own queries (unmounted project caches are only marked stale).
- **Console tracing** (D72) is per call and gated by `consoleGate`; not a measurable cost.

## 6. The 16 stages across the screens

| Stage | Check List Settings | Project Gates | CAPEX Accounts | Costs | Contracts | Milestones |
|---|---|---|---|---|---|---|
| 1 Initial load | lazy chunk 9.8 KB gz | 12.7 KB gz | 12.5 KB gz | 22.5 KB gz | 22.0 KB gz | 7.5 KB gz |
| 2 Component init | tab strip measured on first paint (`Overflow`, one extra render) | rail + table | tab strip + cards | picker + accordion | picker + cards | accordion |
| 3 State init | URL `?tab`; open clusters `[]` | collapse set per scope; all gates expanded | expand set empty; selection | sections / openDevex / collapsed sets | `useToggleSet`; panel state | `openItems []`; draft in screen |
| 4 Data retrieval | tabs, then clusters / tasks / locks | countries / states (warm), then dataset | tree; checks on expand | 6 reference reads, then scope reads | countries, then list / DevCo / chart | countries + assumptions |
| 5 Requests | section 7 | 3-4 waves | tree + S checks | 6 + 3 (+1 Italy) | 2-3 + chart | 2 |
| 6 Business logic | `groupTasksByCluster`, `lockState` | `buildGateRows`, `buildTaskIndex` | `buildCapexTree` | `buildDevexTree`, `groupContracts` | `classifyAccounts`, `buildAccountTree` | `groupAssumptions`, `evaluatePanel` |
| 7 Transformation | row mappers | row mappers + people parse | `toRow` | `toOpexPeriod` (38 cols) | `toContract` | `toAssumption` |
| 8 Calculations | none heavy | none heavy | none heavy | none heavy | `limitFlags` | `evaluatePanel` per keystroke |
| 9 Rendering | open clusters' `TaskTable` (memo) | all gates + tasks (memo rows, SAD-12) | cards; body only when open | rows only when category / section open (SAD-17) | <= 20 memo cards; DevCo tree opens one root | matrices only when open |
| 10 Interaction | status / completion / delete / reorder | Active pill (optimistic), editor | select / expand / commands | picker, drawers | edit panel | edit panel |
| 11 Save | guarded PATCH; create + status PATCH | one write per action | per-row flows | per-contract flows | parent, deletes, creates | n guarded PATCHes |
| 12 Bulk | reorder / renumber 2n (SAD-08) | none | clean-up 2Z + D (SAD-04) | Period-1 2k (SAD-09) | R deletes + A creates | 2n |
| 13 Refresh | tasks (+ locks after completion toggle, SAD-03) | slice reload on toggle; full chain otherwise | tree awaited by the overlay | scope key(s) | list + DevCo | assumptions |
| 14 Navigation | tab = one tasks read, no locks read | scope = dataset read | category tab is client-side | scope = 3 reads | scope = 2 reads | none |
| 15 Errors | per query health; locks fail closed | `fatalWhen: any-error` | stale-error bar | per-section notices | retry per query | stale-error bar |
| 16 Cleanup | queries gc 5 min | `sliceReloads` map entry deleted | clean-up promise outlives the screen (SAD-05) | none | none | none |

## 7. Screens: critical-path timelines (DERIVED), volumes, delays, prior fixes

Notation: a wave is a set of requests in flight together; the next wave waits. Round-trip times are NOT measured anywhere in the repo for single admin calls, so waves and request counts are the honest unit.

### 7.1 Check List Settings (`/admin/default-checklists`, the landing screen)

- **Entry timeline:** lazy chunk (1 round trip, ~76 KB gz of closure over startup) -> tabs (1 request, cached 5 min) -> [clusters from the shared states entry (cached after boot, else 1) ‖ tasks of the open tab (1 request, `$select` 10 cols, `vsb_order asc`) ‖ **locks** (1..N sequential pages)]. The tab list and tasks render as soon as they arrive; row actions stay disabled until the locks arrive (`Screen.tsx:193-194` `locksLoading`, `rules.ts:277` `lockState` returns "loading"). The screen is therefore visible after ~3 waves and editable after tabs plus the slowest lock page.
- **Volumes (DERIVED, not measured):** tabs = country x technology combinations (6 countries x Wind / PV = 12 if all are configured). Tasks per tab: D162 doc 02 cites 100-250 rows for a scope's checklist and approvals. The locks set is environment-wide (upper bound ~12 x 250 = ~3,000 rows = up to 6 pages at 500 rows; D165 doc 12 question 8 is open).
- **Delay candidates:** SAD-01 (locks read, gates editability), SAD-02 (locks waits for tabs), SAD-03 (completion toggle awaits the locks refetch), SAD-08 (reorder / delete-with-renumber at width 4, with a server flow per PATCH).
- **Prior fixes in force:** OPT-08(c) narrow lock columns (3 cols), OPT-17(a) approval chunks, OPT-07d shared states, AD-08 no existence GET after create, FE-AD-02/03 local drawer form and memo table.
- **Navigation between tabs:** the locks query has `staleTime: Infinity`, so a tab switch reads only that tab's tasks (1 request) and never the locks; clusters are shared. Good.

### 7.2 Project Gates (`/admin/gates-approvals`)

- **Entry timeline:** chunk -> countries / states (warm) -> pick Germany / Wind -> dataset: [templates (1) -> Portfolio Managers of the templates via Entra (chunks of 15, 4 wide)] ‖ [checklist header (1) -> checklists (1) -> approvals in chunks of 40 (4 wide) -> unresolved approval Portfolio Managers (usually none)]. That is 3-4 sequential waves, each a Dataverse call; people come from the Graph-backed `aadusers` table. The whole screen waits for the full dataset (SAD-13).
- **Volumes:** 5-6 gates per scope, 100-250 task approvals (D162), up to ~7 Tooltips per task row (SAD-12). Pick list: 6 countries x 2 technologies.
- **Interactions:** Active pill = optimistic flip, 1 guarded update (2 requests), then `reloadGatesSlice` (one slice, one reload for N quick clicks). Save / reset / delete = 1-2 requests then the full dataset invalidation (`invalidateAfterGatesWrite`, 3-4 waves). People search: debounced 300 ms, at least 2 characters, 1 page of 25 with 4 `contains` columns on `aadusers`; this is a suspected-slow server query but is rare and covered by D165 inventory AD-OP-71, so it is not raised again.
- **Prior fixes in force:** AD-06, OPT-17(a)(b)(c), FE-AD-01/06.

### 7.3 CAPEX Accounts (`/admin/capex-accounts`)

- **Entry timeline:** chunk -> tree (whole table, 6 columns, all states; always re-read on mount and focus). One extra wave only when an account is expanded: S has-contract reads (limit 1, one column), gated 6 wide since AD-03.
- **Volume:** unmeasured. The tree is root + categories + accounts + subaccounts; a few hundred to about 1,000 rows is plausible (1-2 pages). MEASURED: `buildCapexTree` handles 5,111 rows in 7.4 ms.
- **Writes (DERIVED, from D165 doc 03, re-verified in source):**
  - Create: 4-5 waves, 6 requests (number check ‖ order read, POST, plain PATCH Inactive since AD-08, tree refetch).
  - Rename / Activate: 3 requests.
  - **Deactivate account with S subaccounts, under the blocking overlay:** child list (1) -> account guarded PATCH (2, sequential) -> S guarded PATCHes at width 8 (2 x ceil(S/8) waves) -> awaited tree refetch. For S = 24 that is about 10 sequential round trips with the overlay up. `runSteps` (`adminCapexAccounts.ts:529-545`) runs the account step and the subaccount step in order.
  - **Background clean-up** (`Screen.tsx:216-227`, `adminCapexAccounts.ts:423-476`): contract reads (4 wide), cost reads (2 per 40 contracts, 4 chunks wide), then zero (8 wide, 2 requests per row) beside delete (16 wide, 1 per row), 24 requests in flight. SAD-04 and SAD-05.
- **Prior fixes in force:** AD-01, AD-03, AD-05, AD-08, OPT-20 (parallel guards), OPT-07c (shared chart), invalidation drops the per-row checks (`capexAccountsWriteKeys`, comment at `adminInvalidation.ts:15-20`).

### 7.4 Costs (`/admin/cost`)

- **Entry timeline:** chunk -> six reference reads in parallel (countries shared, hierarchy, Land Lease subaccounts, OPEX subaccounts = 2 requests joined client-side, currencies, payer defaults) and, as soon as the picker has a selection (it needs only the countries), the three scope reads in parallel (DEVEX 16 cols, OPEX 38 cols, inactive OPEX 5 cols) plus the Italy inflation areas. Cold: countries first, then everything. All six reference reads gate the first paint (SAD-11); the scope reads gate only their own sections.
- **Volumes:** DEVEX rows per scope and OPEX contracts per scope are unmeasured. OPEX is bounded by `MAX_PERIOD = 10` periods per contract; DEVEX rows render only for expanded categories; OPEX rows render for every contract of an open section (contracts start expanded, `collapsed` set empty).
- **Writes:** DEVEX create 1 / update 2 requests; OPEX new contract 4 requests (3 waves), add period 6 (5 waves), Period-1 edit 2k + 5 (SAD-09), delete contract m + 3 sequential (deliberate, tail first), delete last period 7 (6 waves).
- **Prior fixes in force:** OPT-07a/b/c/d reference reads cached 30 min, AD-05, AD-11, OPT-27(b) memoised groupings. **Switched OFF:** `ADMIN_SCOPE_READS_ONCE` (SAD-10).

### 7.5 Contracts (`/admin/contract`, standard BoP contracts)

- **Entry timeline:** chunk -> countries (shared) -> selection -> [contract list (14 cols) ‖ DevCo links (4 cols, filtered through the parent lookup path) ‖ chart of accounts (shared active chart, 5 min)]. At most `CONTRACT_LIMIT = 10` Development and 10 Construction contracts per scope, so at most 20 memoised cards (`ContractCard`, FE-AD-05).
- **Edit open:** the panel opens at once, disabled while the record GET (`staleTime 0`) and the DevCo refetch run in parallel (1 wave). **Save:** DevCo ownership read -> parent PATCH pair (or POST) -> R DELETEs (16 wide) -> A POSTs (8 wide) -> invalidation (list + DevCo). That is R + A + 5 requests in at least 5 waves (SAD-15 notes the repeated DevCo read).
- **Rendering:** the DevCo tree mounts one root's children at a time (`openRoot`), so it never mounts the whole chart; `DevCoCostForm` is `memo`.
- **Prior fixes in force:** AD-05 on DevCo unlink, AD-11 cascade invalidation, FE-AD-05/07, OPT-27(c).

### 7.6 Milestones (`/admin/milestones`)

- **Entry timeline:** chunk -> countries (shared) ‖ assumptions (one request, `ACTIVE`, 13 columns, ordered by `createdon`). One wave. `staleTime` 5 min, no focus refetch.
- **Edit:** `openEdit` refetches the whole assumptions table under a blocking overlay before opening the panel (SAD-14). **Save:** n changed rows, each a guarded PATCH (2 requests), 8 wide, every row attempted; then one refetch (the other three invalidation keys are not mounted). 2n + 1 requests.
- **Rendering:** a closed country renders nothing; an open one renders a read-only matrix (one row per technology). The draft lives in screen state, so a keystroke re-renders the screen (FE-AD-04, small).

### 7.7 Report a problem (`features/shared/report-problem`)

Mounted once in the app shell (`App.tsx:176`), inside the entry chunk. While closed it renders a `Drawer` with `open={false}`, which mounts nothing. Its `detail` string is a `useMemo` over `[open, session, project, envVars]`: it reads the last error and the last 15 entries of a ring buffer capped at 200 (`platform/telemetry.ts`, `MAX_ENTRIES`), so it is O(1) and runs only when the session or project changes, or when the panel opens. Opening it, typing and "Copy report" make no network call. **Not a bottleneck.**

### 7.8 `SettingsAccordion` and `SettingsTabStrip`

- Accordion: closed panels are unmounted (`unmountOnExit`); items are created for all rows on each render, which is cheap. Milestones, Costs and Check List Settings pass at most a few dozen items.
- Tab strip: first renders a plain `TabList`, then (after the band has a width) re-renders with Fluent `Overflow`; for the 12-20 tabs of Check List Settings and CAPEX this is a single extra render. **Not a bottleneck.**

## 8. Findings summary (full detail in `_register/SAD.md`)

| ID | P | Screen | One line |
|---|---|---|---|
| SAD-04 | P1 | CAPEX Accounts | Clean-up sends 2Z + D individual requests (PRIOR:AD-02, open) |
| SAD-01 | P2 | Check List Settings | Environment-wide locks read on every mount gates editability (PRIOR:AD-OP-61) |
| SAD-05 | P2 | CAPEX Accounts | Clean-up dies silently on tab close; no unload guard or Resume (PRIOR:AD-01 residual) |
| SAD-07 | P2 | Cross-cutting | Every admin update is GET + PATCH; chunked existence read would halve requests (PRIOR:AD-OP-03) |
| SAD-08 | P2 | Check List Settings | Reorder / delete-with-renumber: 2 requests and a server flow per row at width 4 (PRIOR:AD-07) |
| SAD-02 | P3 | Check List Settings | Locks wait for the tabs although independent (NEW) |
| SAD-03 | P3 | Check List Settings | Completion toggle awaits a full locks refetch (NEW) |
| SAD-06 | P3 | CAPEX Accounts | Tree re-read on every focus (PRIOR:AD-04) |
| SAD-09 | P3 | Costs | Period-1 edit rewrites every later period (PRIOR:AD-10) |
| SAD-10 | P3 | Costs | `ADMIN_SCOPE_READS_ONCE` is OFF (PRIOR:AD-09) |
| SAD-11 | P3 | Costs | Six reference reads all gate first paint (NEW) |
| SAD-12 | P3 | Project Gates | Every task row mounts ~7 Tooltips on first render (PRIOR:FE-AD-01 residual; SUSPECTED) |
| SAD-13 | P3 | Project Gates | Dataset is a 3-4 wave chain, rerun on each focus (PRIOR:AD-06 residual) |
| SAD-14 | P3 | Milestones | Edit pre-refetch under overlay; draft in screen state (PRIOR:FE-AD-04) |
| SAD-15 | P3 | Contracts | DevCo list read 3 times per edit cycle (PRIOR:AD-OP-50) |
| SAD-16 | P3 | Cross-cutting | Admin chunks not prefetched; MEASURED sizes (PRIOR:FE-AD-08) |
| SAD-17 | P3 | Costs | DEVEX / OPEX tables not memoised (PRIOR:FE-AD-09; SUSPECTED) |

Counts: P1 1, P2 4, P3 12. Confidence: HIGH 15, SUSPECTED 2, CONFIRMED 0. Origin: PRIOR 14, NEW 3.

### Request volume of the one large workload (SAD-04), for scale

`requests ~ ceil((1+S)/40) + 2*ceil(C/40) + 2Z + D + 1` (D165 doc 03, formula re-checked against `adminCapexAccounts.ts:423-476`). ESTIMATED illustration, using the only live throughput figure in the repo (D51: 70 requests in 9.5 s on DEV, `ProjectDocs/instructions/KNOWN-RISKS-AND-DECISIONS.md:85`, about 7 requests/s, a different write path):

| Z (zeroed rows) | D (deleted rows) | Requests | At ~7 req/s |
|---|---|---|---|
| 100 | 1,000 | ~1,200 | ~3 min |
| 1,800 | 36,000 | ~39,600 | ~95 min |

Neither row is measured for the clean-up; they only show that D, the later-year rows, dominates and scales with the forecast horizon. Dataverse service protection (6,000 requests / 5 min / user) is ~20 requests/s, so the 24-wide pool can exceed it if single calls are faster than 1.2 s, in which case `CLEANUP_RESILIENT` retries on 429. Count real volumes on DEV first (D165 doc 12 Q1).

## 9. Checked and found NOT to be bottlenecks

- **Admin derivations (CPU).** MEASURED in section 4: 0.5-18 ms at 3,000-5,000 rows, all memoised. `buildDevexTree`, `buildCapexTree`, `buildTaskIndex`, `groupContracts` and `contractMenu` are single linear passes (OPT-27).
- **Collapsed accordions and cards.** `AccordionPanel` unmounts closed content; `CollapsibleCard` renders its body only when open; the Contracts DevCo tree opens one root at a time. Nothing hidden is mounted (Gates, whose gates start expanded, is the exception raised as SAD-12).
- **Form drafts.** Local in `DevexCostDrawer`, `ContractPeriodDrawer`, CAPEX `Panels`, `TaskEditorDrawer`, `ApprovalsPanel`; typing does not redraw the screens (FE-AD-02/05 done). Milestones is the one exception (SAD-14, small).
- **Admin bundle size.** The six screens are 23-77 KB raw each (7.5-22.5 KB gzip); the cost of a first visit is dominated by the shared startup (~316 KB gzip), which is not admin-specific.
- **Tab strip and Report a problem.** See 7.7 and 7.8.
- **Pagination of reads.** `fetchAll` walks pages sequentially, but every admin read is `$select`ed and filtered; only the locks read (SAD-01) and the CAPEX tree (SAD-06) are unfiltered whole-table reads. At the 50-page ceiling (25,000 rows) `fetchAll` throws rather than truncating (D157), so the clean-up cannot silently act on a partial list; no admin read is near it on the figures above.
- **Gates people lookup fan-out.** Already bounded (6 / 4 wide) and reused across reloads; not re-raised.
- **Costs reference data.** Cached 30 min; not re-read when moving between admin screens.
- **Memory.** Admin datasets are small and held in the TanStack cache for the default 5 min; the clean-up holds at most the id lists of the rows to zero or delete (tens of thousands of GUID strings, a few MB). No leak pattern was seen in the admin screens (the module-level `togglesInFlight` and `sliceReloads` maps delete their entries when idle).

## 10. Critical user journeys (for the orchestrator to merge into doc 11)

| # | Journey | Sequence (DERIVED) | Where it waits | Findings |
|---|---|---|---|---|
| A1 | Open Application Settings (header menu -> Check List Settings) | lazy chunk (1) -> tabs (1, 5 min cache) -> [clusters ‖ tasks ‖ locks 1..N pages] | time-to-visible ~3 waves; time-to-editable = tabs + locks | SAD-01, SAD-02, SAD-16 |
| A2 | Edit, activate or delete a checklist task | guarded PATCH (2) -> tasks refetch (1); delete adds renumber 2 per later row at width 4 | overlay or inline pending; renumber dominates | SAD-07, SAD-08 |
| A3 | Toggle Completion Date | guarded PATCH (2) -> tasks refetch ‖ locks refetch (awaited) | row pending until the slower refetch | SAD-03 |
| A4 | Review or edit gate approvals (Project Gates) | countries / states (warm) -> dataset 3-4 waves -> render ~100-250 task rows | loader until the dataset; a brief freeze while rows mount | SAD-13, SAD-12 |
| A5 | Flip a gate or task Active pill | optimistic flip -> guarded PATCH (2) -> one slice reload | none visible (optimistic) | (fixed by AD-06) |
| A6 | Deactivate a CAPEX account | list (1) -> account PATCH pair -> subaccount PATCH pairs (8 wide) -> tree refetch, then background clean-up | blocking overlay ~4 + 2 x ceil(S/8) waves; then minutes to hours of background work | SAD-04, SAD-05, SAD-07 |
| A7 | Add or edit a CAPEX account / reorder | number check ‖ order read -> POST -> plain PATCH -> tree refetch; reorder 2n at width 8 | overlay | SAD-07 |
| A8 | Maintain a standard cost (DEVEX / OPEX) | scope picked -> 3 scope reads; save 2-7 requests; Period-1 edit 2k + 5 | first paint waits for 6 reference reads on a cold visit | SAD-11, SAD-09, SAD-10 |
| A9 | Edit a standard BoP contract with DevCo links | Edit open: record GET ‖ DevCo refetch -> save: DevCo read -> PATCH -> deletes -> creates -> list + DevCo refetch | panel disabled one wave on open | SAD-15 |
| A10 | Edit milestone assumptions | Edit: whole-table refetch under overlay -> panel; save 2n at width 8 | overlay before the panel opens | SAD-14, SAD-07 |
| A11 | Report a problem | none (local) | none | - |

Ranking guidance for doc 11: A1 is the highest-frequency admin journey (every admin session) and its only material cost is SAD-01 (volume unknown, to be counted on DEV). A6 is the rare but longest-running journey and the only P1.

## 11. Limitations

- No run against Dataverse: no single-call latency, no row counts (accounts, approvals, DEVEX, OPEX, milestone rows) are measured, so every volume above is a derived upper bound. D165 doc 12 questions 1 and 8 would settle SAD-01 and SAD-04 and need a signed-in count on `VSBCloud_Dev` (`[VSB] DATA` lines give rows, pages and ms).
- Whether the Power Apps host queues or caps concurrent SDK calls (D165 open question 2) is not visible in the repo; it changes how bad 24 in-flight writes (SAD-04) are.
- Render costs (SAD-12, SAD-17) are ESTIMATED from component counts; a React Profiler capture on the largest DEV scope is the missing evidence.
- I did not read the editor panels, validation `rules.ts` bodies or message tables, and did not run any test.
- The register header in the brief names 17 columns although the text says 15 or 16; I used the 17 named columns.
