# 02 — Optimization findings register

Stage 1 output, 23 Nov 2026. Read-only audit of `ProjectCosts-CodeApp/src` (the working tree, including the uncommitted D157–D159 edits).
Seven parallel scans (slices S1–S7, see `01_Codebase_Discovery_Report.md`) produced about 130 raw findings. This register
consolidates them into **OPT-xx** entries (the same underlying issue seen from two slices is one entry; every raw id and every
file reference is kept). Paths are relative to `ProjectCosts-CodeApp/src/`.

**How to read the evidence.**
- **Confirmed** = the code was read and the inefficiency is certain from the code alone.
- **Potential** = plausible, size depends on data volume.
- **Requires profiling** = structure is real, wall-clock gain unknown.
- **Nothing in this register is a measured benefit.** Every benefit below is an *estimate from the code*, expressed mostly in
  requests and sequential round trips (the docs record 1.2–1.9 s per request through the Power Apps host, D51). Measuring comes in
  Stage 3 (`06_Performance_Comparison.md`).
- Verified by the orchestrator against source before writing: OPT-04, OPT-10, OPT-26, OPT-33, DEC-1 (see `01`, §6).

**What this audit did not find.** The app has had heavy performance work already (D41–46, D51/D56/D59/D75, D108/D119/D136/D137,
D138–D158, D159). Pure computation is rarely the problem: the scans found no CPU-bound hot path in Generators, Check List, Finance,
Revenues, Production, the Add Cost bulk save, or the shared components. The remaining cost is **awaited server round trips**
(waterfalls, duplicated reference reads, over-wide reloads, sequential writes) plus a few **render-path recomputations**.

Priority key: P0 critical, P1 high, P2 medium, P3 low (framework in `04`, §1). Cx = complexity, Risk = regression risk (L/M/H).

---

## A. Asynchronous processing and request volume (category 6, with 3 and 4)

### OPT-01 — Every PM screen waits on a 2-round-trip project load, then re-reads the same row
- **Priority** P1 · **Module** all 10 PM screens · **Cx** M · **Risk** M · **Confidence** Confirmed (waterfall); gain Requires profiling
- **Source** S3-01, S5-01, S5-08 (reload part)
- **Where** `app/routes.tsx:125-145` (`ProjectScreenGate`), `app/SessionContext.tsx:63-68,107-110`, `data/project.ts:131-229` (`loadProject`);
  dependent re-reads at `features/pm/finance/Screen.tsx:712`, `revenues/Screen.tsx:717-723`, `production/Screen.tsx:329`,
  `milestones/Screen.tsx:377`, `planning/Screen.tsx:475-476`; session invalidations at `general-data/hooks.ts:220`,
  `milestones/hooks.ts:262`, `generators/hooks.ts:339`, `checklist/hooks.ts:131`.
- **Current behaviour** A `/project/*` route is held until `loadProject` ends: the project row, then 3 parallel lookups (country,
  cluster state, area) = 4 requests, 2 round trips deep. The screen then reads the same `vsb_projects` row with its own `$select`
  (trip 3) and its country-keyed reads (assumptions, currency, inflation, debt) wait for that (trip 4). PM screens use the session
  project only for the header and the not-found test; country ISO, area and state order are Cost-only. Every PM save that
  invalidates `qk.project(id)` repeats the 4-request load, and the save spinner waits for it (`usePlanWrite.ts:196-197`).
- **Root cause** One loader serves Cost and PM although PM needs a subset; screens ignore the countryId the session already holds.
- **Recommended** (a) a PM variant of `loadProject` that reads the row only (state name from the `@…FormattedValue` annotation, as
  General Data does); keep the full load for `/costs/*`. (b) key the country-dependent reads on `session.project` countryId when present.
  (c) `qk.project(id)` into `staleOnly` for General Data and Milestones saves (`usePlanWrite.ts:77`).
- **Expected benefit (estimated)** about 1–2 round trips off every PM screen entry; a PM save reloads 1 request instead of 4.
- **Risk detail** header state text source changes; `approvalState` must come out identical; session project has 5-min stale time.
- **Dependencies** `SessionContext`, `ProjectScreenGate`, `UT-BOOT-*`; sequence before OPT-03 and OPT-13.

### OPT-02 — Cost screens re-read the project row for country and technology
- **P2** · Cost screens · Cx L · Risk L · Confirmed
- **Source** S3-02
- **Where** `data/project.ts:237-250` (`loadProjectExtras`), `features/cost/contracts/hooks.ts:117-124` (`useProjectExtras`); callers
  `contracts/Screen.tsx:231`, `useCostBook.ts:775`, `LandLeaseScreen.tsx:682`, `OpexScreen.tsx:769`.
- **Current** `loadProject` (`project.ts:136-173`) already selects `_vsb_country_value` and `vsb_technology`; the extras query reads the
  same row again. OPEX and Land Lease chain `useCountryInflationAreas` / `useCountryInflation` behind it (`OpexScreen.tsx:775,788`).
- **Recommended** put `countryId` and `technology` on `ProjectContext`; derive `useProjectExtras` from the session project (no query);
  keep the `typeof === "number"` technology rule.
- **Benefit (est.)** 1 request and one waterfall step per Cost screen entry. **Depends** `ProjectContext` type, 4 Cost screens.

### OPT-03 — Boot prefetch covers only three targets
- **P2** · app start · Cx M · Risk L · Confirmed
- **Source** S3-03
- **Where** `app/bootPlan.ts:43-75`, `app/bootPrefetch.ts:36-90`, `app/SessionContext.tsx:109`.
- **Current** only `/projects`, `/project/general` and `/project/generators` prefetch. A Cost deep link or any other PM screen starts
  nothing until the chunk downloads, React mounts and the session query succeeds (D119 §4 lists Cost start-up as not looked at).
- **Recommended** when the project id is valid, prefetch `sessionProjectQueryOptions(id)` and the screen chunk (`screenLoaders`);
  prefetch only, same keys, so a wrong guess costs one request.
- **Benefit (est.)** takes chunk download, mount and gating off the critical path of the most common entry. **Depends** `bootPlan.test`, OPT-01.

### OPT-04 — OPEX screen loads the Land Lease book and the CAPEX chart it never reads, in three serial stages  **[P0]**
- **P0** · Cost / OPEX (O&M, Other) · Cx M · Risk L–M · **Confirmed** (call path verified by the orchestrator)
- **Source** S1-01, S2-01
- **Where** `features/cost/periods/OpexScreen.tsx:768` `useCostBook(undefined, {everyVisit:true})` → `data/costBook.ts:1227-1245`
  `loadCostBook` → `loadCostAccounts` (`:776`) → `loadCostLines` → `loadPeriods` (`:705-716`) → `loadOpexPeriods` ‖ `loadLandLeasePeriods`
  (`:617`) → `loadLeaseBook` (`data/landLease.ts:116-220`: subaccounts, project costs, periods in chunks, allocations in chunks, currencies).
- **Current** The screen reads only `book.periods.filter(p => p.mode === mode)` (`OpexScreen.tsx:870-880`); a repo-wide grep found no
  reader of Land Lease periods, `extraGroups` or the accounts on this screen. The three stages are awaited one after the other
  (accounts → lines → periods), and the whole thing re-runs on every visit, every O&M/Other switch and after every OPEX save
  (`useCostBook.ts:154-163`). Estimate: about 12–15 requests / 4 waves versus about 4 / 2 for OPEX alone.
- **Root cause** `category === undefined` is the shared call for all three period screens, so OPEX gets Land Lease's data.
- **Recommended** an OPEX-only scope in `loadCostBook` (skip `loadCostAccounts` and the Land Lease read; start OPEX periods at t=0).
  Land Lease already has its own `useLeaseBook`.
- **Benefit (est.)** about 8–10 requests and 2 waves per OPEX visit/save.
- **Risk detail** the `CostBook` shape and fixtures (`costBook.test`, `costRepository.test`); `useCostBook.save` diffs `book.periods`
  including the `land` periods (`OpexScreen.tsx:1236,1262`); `useLeaseWrites` invalidates `["cost-book", id, "none"]` needlessly
  (`useCostBook.ts:339,347`). **Depends** OPT-05, OPT-06, OPT-12 (same files).

### OPT-05 — CAPEX tab load: independent payer-defaults read sits in the chain
- **P1** · Cost / CAPEX · Cx L · Risk L · Confirmed
- **Source** S1-02
- **Where** `data/costBook.ts:1228-1232` — `await loadCostAccounts()` → `await loadPayerDefaults()` → `loadCostLines` (contracts → payments).
- **Current** `loadPayerDefaults` depends on neither read; `loadCostLines` uses it only in the final `resolvePayer` map (`:1102`).
- **Recommended** start it with the accounts read, or pass the promise into `loadCostLines`.
- **Benefit (est.)** one round trip per tab switch and per post-save refetch.

### OPT-06 — OPEX period read: 3 serial stages where 2 suffice, and its reference reads duplicate cached queries
- **P1** · Cost / OPEX · Cx L · Risk L · Confirmed
- **Source** S1-03, S2-02, S2-03 (OPEX part)
- **Where** `data/costBook.ts:523-586` (`loadOpexPeriods`; subaccounts `:548`, currencies `:553`, `loadCurrencyNames` `:292-300`),
  `data/opexCatalog.ts:63-89,117-209`, `costRepository.ts:323`, `OpexScreen.tsx:775,788`.
- **Current** cost rows → (subaccounts ‖ whole currencies table) → device names. The subaccount and currency reads do not depend on the
  rows. `useOpexCatalog` reads OPEX accounts twice in parallel (`costRepository.ts:323` omits the accounts argument, so
  `opexCatalog.ts:63-80` re-reads). `useCountryInflationAreas` is a distinct of rows `useCountryInflation` already holds (Land Lease does it right, `LandLeaseScreen.tsx:802-806`).
- **Recommended** start subaccount + currency reads at t=0 (or reuse cached query data); pass `accounts` into `listOpexSubaccounts`;
  derive areas from `countryInflation`. Device names stay second.
- **Benefit (est.)** one wave (0.3–0.8 s) and about 2 requests per OPEX visit.

### OPT-07 — Shared reference tables are read under several keys and selects
D159 fixed this for `Project States` only. Same pattern, still open (each sub-entry is a separate change, same technique:
one `queryOptions` with the union select, each screen takes a `select` view, as `data/projectStates.ts`). Common risk: each view
must reproduce its screen's filter and sort; the admin invalidation lists (`data/adminInvalidation.ts:34-72`) must follow key changes.

- **OPT-07a Countries — P1 · Cx M · Risk L–M · Confirmed.** Source S3-04, S5-04, S5-06, S4-05, S7-04.
  Read by `data/projects.ts:477` (key `["countries"]`, active), `data/generalData.ts:122` (`qk.generalDataCountries`, all),
  `data/countries.ts:55` (`qk.adminCountries`, 30 min), `data/currentUser.ts:183-187`, `data/adminGatesApprovals.ts:176`; plus
  dependent single-row reads after the project row: `data/project.ts:263-273`, `data/generators.ts:105-122` (`loadGeneratorsProject`, reloaded after every save),
  `data/milestones.ts:89-110` (2 round trips on every load and save reload). `COUNTRY_SELECT` (`countries.ts:21`) is documented as the union
  of four screens but lacks `_owningbusinessunit_value` and `_vsb_businessunit_value`. Benefit (est.): 2–3 requests per cold screen; removes
  a sequential step in Milestones and Generators and 1 request per save there.
- **OPT-07b Currencies — P1 · Cx M · Risk M · Confirmed.** Source S7-05, S2-03, S1 cross-note, S3-09, S5-04.
  Whole `transactioncurrencies` table read at `data/costBook.ts:292` (every OPEX/Land Lease book load), `data/landLease.ts:167,238-255`
  (inside `loadLeaseBook` and again by `useCurrencies`; `loadCurrencyNames(ids)` ignores `ids`), `data/periodWrites.ts:150-158`
  (`resolveCurrencyId` on every period save: active rows, find by name in the browser, against CONVENTIONS rule 2), `data/revenues.ts:276-292`,
  and `features/pm/milestones/hooks.ts:168` (`findCurrency("EUR")` without `onlyThisCode`, the D136 fix applied to Revenues only — S3-09 is the one-line version, **P2, L/L**).
  Keep: reads are deliberately unfiltered by `statecode`, the save-time lookup deliberately `ACTIVE`.
- **OPT-07c CAPEX chart of accounts — P1 · Cx M · Risk L–M · Confirmed.** Source S1-06, S6-08.
  Five loaders read the whole table: `data/costBook.ts:753,776,1336`, `data/addCostSheet.ts:121`, `data/contracts.ts:281`, `data/adminCost.ts:248-264`,
  `data/adminCapexAccounts.ts:66-78`. The CAPEX Summary tab makes three identical reads; every category-tab switch and save refetch re-reads it;
  `"00001"`/"Overleveraging" constants are defined in 7 places (`adminCost.ts:213-214`, `dataverseNames.ts:521,654`, `costBook.ts:202,726`,
  `features/cost/contracts/rules.ts:478`, `admin-capex-accounts/rules.ts:37`, `admin-contract/rules.ts:362-363`).
  Immediate and zero risk: import the constants from `dataverseNames.ts`. Larger: one cached read with per-screen `select` views and invalidation from the admin account save;
  admin tree is deliberately `FRESH_ON_ENTRY` and includes inactive rows — keep that.
- **OPT-07d Project-state stragglers — P2 · Cx L · Risk L–M · Confirmed.** Source S3-05, S6-09.
  `data/project.ts:299-312` (`loadClusterState`), `data/projects.ts:398-415` (`loadProjectStateOrder`), `data/costBook.ts:868-884`
  (`loadProjectStates`, called at `:1061`), `data/adminDefaultChecklists.ts:141-148` (`listClusters`) still read the 10-row table. Resolve from
  `projectStatesQueryOptions()` (`costStates()` and `overviewStates()` exist). Tie-break trap: server `vsb_order asc` puts nulls first; shared list maps null→0 — use `orderRaw ?? -Infinity` to keep parity (S6-09).
- **OPT-07e Small reference lookups — P3 · Cx L · Risk L · Confirmed.** Source S5-04, S5-07, S3-08, S3-13, S5-11.
  Milestone "average duration" row under 3 keys (`costBook.ts:960`; `general-data/hooks.ts:202`, `milestones/hooks.ts:87`, `capexMilestoneDurationsAll`);
  Fabric revenue assumptions read by Revenues, Production (`production.ts:~93`) and the Milestones seed (`milestones/hooks.ts:166`);
  the static Fabric job-type name→id lookup before every recalculation check (`data/milestones.ts:282-304`, re-run on focus and after every save);
  device types read one request per type with unbounded `Promise.all` (`data/production.ts:307-330`, `data/generators.ts:615-622`, `data/milestones.ts:245-260`);
  `countActiveTurbines` reads all turbines to count `statecode 0` (`data/finance.ts:214`). Benefit (est.): 1 request each.

### OPT-08 — Reads wider or smaller-paged than they need to be
- **P1** · Cost, Finance, Admin · Cx L · Risk L · Confirmed (selects/filters); Potential (page-size gain)
- **Source** S1-04, S3-06, S5-05, S3-17, S6-01
- **(a) Page size.** Default `maxPageSize` is 500 (`data/client.ts:49,73`); only `data/costBook.ts:1286` (`loadContractCostSums`) uses 5000, with
  the documented statement that it "changes the number of round trips and nothing else". Same shape at 500: `costBook.ts:1153-1189` (`loadPayments`),
  `data/addCostSheet.ts:210-231` (`loadCostsForContracts`), `data/contracts.ts:249-273` (`listCapexCostRows`), `data/finance.ts:175-199` (`loadTotalDevexCapex`,
  which also selects an unused `vsb_capexcostid`; the code docs record 579 cost rows on Wirmighausen = 2 sequential pages). Add `maxPageSize: 5000` per read; do **not** raise the global default (annotations inflate payloads, D119 F4). Do **not** add `ACTIVE` to the Finance read (the canvas formula has none).
- **(b) Server filter.** `data/standardContracts.ts:19-56` (`loadStandardAssumptions`) reads the whole active `vsb_devexcapexstandardassumptions` table although
  `useCostBook.ts:749-755` documents per-category narrowing; each category tab refetches all 16 columns (key = joined subaccount ids, `:760`), filtered in JS (`capex-costs/standardContracts.ts:136-138`). Use `lookupIn("vsb_subaccount", chunk)`.
- **(c) Column select.** Check List Settings locks (`data/adminDefaultChecklists.ts:174-175` → `data/adminChecklistTables.ts:270-288`) falls back to `APPROVAL_COLUMNS`
  (`:57-61`), pulling three JSON columns of up to 1000 characters per row for every locking approval in the environment; only `checklistId` and `mode` are kept (`:210-221`).
  `ListApprovalsOptions.select` already exists. It is refetched on every mount, every Completion-Date toggle (awaited) and every gate write. Estimated payload reduction 5–10×.
- **Benefit (est.)** up to 5–8× fewer sequential round trips on very large projects (none on small ones); locks payload 5–10× smaller.

### OPT-09 — Unbounded chunk fan-out with no read gate (about 19 sites)
- **P2** · repo-wide · Cx M · Risk L–M · **Potential** (needs the real contract count)
- **Source** S1-05, S7-01
- **Where** `Promise.all(chunk(ids).map(fetchAll))`: `data/addCostSheet.ts:140-147,162,193,212`; `comments.ts:66`; `contracts.ts:184,210,254`;
  `costBook.ts:563,1028,1154,1275`; `currentUser.ts:267`; `landLease.ts:150-168,301`; `opexCatalog.ts:151,160`; `adminGatesApprovals.ts:285`; `bulkSend.ts:194-202` (`existingIds`).
  Bounded already: `adminCapexAccounts.ts:373,381`, `generators.ts:73,658`, `finance.ts:193` (`mapLimit`). `data/concurrency.ts:38` mentions a "shared read gate" that exists only for writes.
- **Current** each read is ceil(N/40) parallel requests and can itself page; a cost screen runs 3–4 such families at once. For N=400 contracts about 40 in flight against the platform's 52 per user per server;
  `bulkSend.ts:94-105` already records it as "review low" (D75).
- **Recommended** one helper `readByIds(column, ids, opts, limit 4–8)` (chunk, `mapLimit`, flatten in input order) in `data/odata.ts` or `data/client.ts` replacing the copies.
- **Risk detail** `mapLimit` stops starting new work after the first failure whereas `Promise.all` lets siblings finish; result order is preserved. Slight latency change on small projects.

### OPT-10 — Land Lease writes are strictly sequential  **[P0]**
- **P0** · Cost / Land Lease · Cx M–H · Risk M · **Confirmed** (executor verified by the orchestrator)
- **Source** S1-09, S2-05
- **Where** `data/landLease.ts:518-579` (`applyLeaseWrites`, `runLeaseWrites` `for … await`); plans `features/cost/periods/landLeaseRules.ts:1591-1611,2817-3000,3459-3473`
  (`diffAllocation`, `planLeaseSave`, `planLeaseDelete`, `planStandardImport`).
- **Current** one awaited request per write in planner order. A Period-1 edit rewrites every allocated generator row (canvas parity "Patch re-writes"): 40 WTGs ≈ 42–45 sequential requests;
  the standard import ≈ 50; a contract delete is N allocation deletes then periods then the header. `executePlan` already supports `together()` groups, tiered delete limits and `createdRowRef`
  (Production got this in `PRODUCTION_GENERATION_WAVES`); Land Lease has its own executor without any of it and without `invalidatePageTokens`.
- **Recommended** run each independent tier (allocation creates/updates, allocation deletes, period deletes) through `mapLimit` (8/16), keeping header → allocations → periods and children-before-parents;
  better, convert the plans to `WritePlan` + `executePlan`. *Separate, needs a decision (DEC-6):* skip allocation updates whose `Name` is unchanged (needs `vsb_name` in the allocation select).
- **Benefit (est.)** about 5–10× wall-clock on large wind projects (tens of seconds → seconds).
- **Risk detail** creation order and `createdon`; "first failure stops" semantics (`independentSteps`, UT-LLDATA, FT-BR-LEASE-089); plan tests.

### OPT-11 — OPEX period save, delete and standard import: avoidable reads and serial loops
- **P1** · Cost / OPEX · Cx M · Risk M · Confirmed (reads); Potential (loop gain)
- **Source** S1-10, S1-11, S2-04, S2-14
- **Where** `data/periodWrites.ts:150-160,171-223,420-549,563-568,1106-1254` (`addOpexStandardContract`); pure planners `features/cost/periods/opexRules.ts:1630-1675,1767-1820,1858-1880`.
- **Current** each save re-reads the currency table and OPEX accounts/subaccounts that the screen already caches 30 min; `childrenOfChain(savedId)` is always empty for a child period (the chain is a star); cascade PATCHes (`:485-494`),
  re-chain PATCHes (`:514-527`) and child deletes (`:566`) run one at a time; `planFollowingPeriodStarts` is computed twice (`OpexScreen.tsx:1224`, `periodWrites.ts:508`);
  the import creates up to ~10 chain periods sequentially although only the head's id is needed. The pure planners are referenced only by tests, so the tests pin code that is not what runs.
- **Recommended** take currency/account/subaccount ids from the cached catalogue (OPT-07b/06); skip the child query when `period.parentId` is set; `mapLimit` (WRITE_CONCURRENCY 8) for cascade, re-chain, deletes, import tail with "try all, report first failure by index"; pass the plan in; have the import execute the pure plan.
- **Benefit (est.)** about 3–4 requests per save plus N−1 round trips; import 2–4 s.
- **Risk detail** save-time currency lookup is `ACTIVE`-only while the screen list is not; warning text and order; `createdon` order within a chain (nothing in OPEX rules sorts by it); the reproduced O-10 date chain (FT-BR-OPEX-089/091).

### OPT-12 — Invalidation fan-out after Cost writes
- **P1** · Cost / CAPEX, Contracts · Cx L–M · Risk L–M · Confirmed
- **Source** S1-08, S2-09, S1-19
- **Where** `features/cost/costing/useCostBook.ts:461-471,479-487,512-516,532-538` (`invalidate`, `setPaid`), `:873-877` (`useCommentWrites.invalidate`, called from `capex-costs/CommentsPanel.tsx:569,575`);
  `features/cost/contracts/hooks.ts:222`, `data/keys.ts:175-181`.
- **Current** marking a month paid (the grid's most frequent write, `capexWrites.ts:68-74`) awaits invalidation of cost-book, capex-totals, both DevCo keys and the `["capex-comments"]` prefix, and the spinner waits. The paid flag changes none of totals, DevCo costs or comments.
  A comment save writes only `vsb_capexcomments` (`data/comments.ts`) yet reloads the whole cost book (accounts, payer defaults, contracts, payments). A contract save also refetches payment targets, which only a delete can change.
- **Recommended** `setPaid` invalidates the cost-book only (or patches the cached payment); `saveLine` drops comments; `deleteLine` keeps comments; `useCommentWrites` keeps `["capex-comments"]` only (re-check that a payment-date comment never changes a cost row); split contract save and delete invalidations.
  Also key `usePaymentTargets` / `useDevCoLinks` on a hash of the ids, not `ids.length` (`contracts/hooks.ts:51-56,94`; equal-size sets share a key, cross-user case only).
- **Benefit (est.)** −ceil(contracts/40) requests and a shorter spinner per paid toggle; comment save no longer reloads the book. Same-file as OPT-04: batch together.

### OPT-13 — PM writes reload more than they wrote
- **P1** (Team, Grid Operator) / **P2** (Planning, General Data) · Cx L · Risk L (L–M for session) · Confirmed
- **Source** S4-03, S5-03, S5-08, S5-09
- **Where** `features/pm/team/hooks.ts:95-100` (`qk.teamAll`), `features/pm/grid-operator/hooks.ts:65-70` (`qk.gridOperatorAll`), `features/pm/planning/hooks.ts:146-151` (`planningAll`; jobs `planning/rules.ts:822,899,908,1184,1200`),
  `features/pm/general-data/Screen.tsx:509-530,574-584` (chained jobs), `general-data/hooks.ts:217-223`, `milestones/hooks.ts:258-268`.
- **Current** Team writes only `vsb_projectmembers` but invalidates the whole screen key (project + 2 Entra lookups); Grid Operator writes only `vsb_gridoperators`, same; a permit or acquisition save refetches project, planning row, permits and acquisition (the acquisition refetch re-runs the seed check);
  the General Data cluster-panel job awaits a full reload before `runSave` starts although `runSave` uses the captured snapshot.
- **Recommended** per-job invalidation as Finance (`perf.ts reloadKeys`), Revenues (`revenues/reload.ts`) and Generators (`KIND_TABLES`) already do; `staleOnly` or empty `invalidate` for the intermediate job; one reload at the end.
- **Benefit (est.)** 1–3 requests per save; the Team post-save wait shrinks (project chain was the longest).
- **Risk detail** confirm no flow or plugin changes the project on these tables (the inventory says none); the cluster panel save must stay all-or-nothing; the shell header could be one view stale on General Data/Milestones.

### OPT-14 — Team: unbounded Entra fan-out and a whole-table description read, twice per visit
- **P1** · PM / Team · Cx L–M · Risk L–M · Confirmed
- **Source** S4-01, S4-02 (+ S6/S4 cross-note `getEntraPeople`)
- **Where** `data/team.ts:35-43` (`getPeopleTolerant`), `:76`, `:118-128` (`listTeamMembers` → `listMemberDescriptions`); `data/adminGatesApprovals.ts:340-350` (`getEntraPeople`, unbounded `Promise.all`);
  `features/pm/team/hooks.ts:63-75,95-100`; `data/checklistPeople.ts` (`lookupPersonOnce`, 30-min reuse, Check List only).
- **Current** every members load fires one Entra request per unique member at once, no cache, no cap; repeats after every save and delete. `vsb_projectmemberdescriptions` is read twice in parallel per visit (once in `listTeamMembers`, once in `useMemberDescriptions`, key `qk.teamMemberDescriptions`) and again uncached after each write.
- **Recommended** route Team lookups through a shared per-person cache (a new neutral name rather than the checklist-named one) with `mapLimit` ≈6; join `description` from the cached descriptions query by id.
- **Benefit (est.)** a team of 20: about 22 requests per load/save → about 2 on a warm cache; 1 table read less per visit.
- **Risk detail** a display name or mail changed in Entra can be up to 30 minutes old (same DIVERGENCE as D156, needs a decision record); keep blank-name tolerance and the trace warning; per-person failure isolation is deliberate (`checklist.ts:157`) — do not batch ids into one request (S7).

### OPT-15 — Generators: residual dependent hops and a cold orderable catalogue
- **P2** · PM / Generators · Cx L–M · Risk L · Confirmed (S4-04); Potential / Requires profiling (rest)
- **Source** S4-04, S4-07, S4-08, S4-14 (the country hop is OPT-07a)
- **Where** `features/pm/generators/hooks.ts:429-435,444-450` (`loadTypeDeleteInputs`, `loadPvDeleteInputs`; callers `Screen.tsx:1173,1235`), `:461-478` (`loadReplaceInputsInWaves`, the pattern to reuse);
  `data/generators.ts:382-394,397-434,437-469` (`catalogueSuppliers`, `listInverterTypes`, `listSubstructureTypes`), `hooks.ts:126-156,249-257` (`useGeneratorCatalog`).
- **Current** type delete: `await Promise.all([allocations, deviceTypes])` and only then the O&M read (WTG type delete ≈ 4 hops, PV ≈ 5). Inverter and substructure types are read first, then their catalogue rows by id, while the panel already reads the full catalogue (cached 30 min). The orderable catalogue (multi-page, 18 columns) starts only when a panel opens and Save stays disabled until it lands (D141; `GENERATORS_PERF.persistCatalogue` is OFF).
- **Recommended** dependency-graph form for the delete inputs (same rows come back, keep `UT-GENLAT-*` seams); join the cached catalogue in the hook as PV does; warm the orderable catalogue on intent (hover/focus of "+ Add Generator Type") rather than persistently.
- **Benefit (est.)** 1 hop (WTG type delete) / 2 hops (PV delete) after the user confirms; instant panel open. Catalogue size unknown — S4-07 Requires profiling.

### OPT-16 — Planning: 3-deep read chain on entry
- **P2** · PM / Planning · Cx L–M · Risk L–M · Confirmed (chain); Potential (gain)
- **Source** S5-02
- **Where** `features/pm/planning/hooks.ts:90-133`, `planning/Screen.tsx:467-476`.
- **Current** project → `useProjectPlanning(project)` → `usePermits(planning?.id)` in sequence; `loadProjectPlanning(project.id)` and `listAquisitionStatuses` need only the project id.
- **Recommended** key the row and acquisition reads on `projectId`, pass the project lazily to the seed path (needed only for `owningBusinessUnitId` when the row is missing; keep the seed gated on a loaded project); optionally filter permits by `vsb_projectplanning/_vsb_project_value` (unverified on DEV).
- **Benefit (est.)** 1–2 round trips on screen entry.

### OPT-17 — Admin Gates and Check List Settings: serial legs and refetch breadth
- **P1** · Admin · Cx L–M · Risk L (M for people reuse) · Confirmed
- **Source** S6-02, S6-03, S6-04
- **Where** `data/adminChecklistTables.ts:277-281` (approval chunks `for … await`; the sibling `data/adminGatesApprovals.ts:285-296` already uses `Promise.all`);
  `data/adminGatesApprovals.ts:543-557` (`resolvePeople`, 15-id chunks one at a time), `:589-620` (`loadDataset`); `features/admin/admin-gates-approvals/hooks.ts:95,120,131,141` (`useToggleActive`, saves).
- **Current** gates load = templates ‖ (header → tasks → approvals), then PM resolution through the Graph-backed `aadusers` serially; a one-boolean Active toggle (already optimistic) triggers ≥5 reads plus a fresh Graph lookup and the save spinner waits for it. 100–250 tasks per country/technology = 3–7 serial approval legs.
- **Recommended** `mapLimit(chunk, …, READ_FAN_OUT=4)` for approvals (concatenate in chunk order; pattern at `adminCapexAccounts.ts:373,381`); run people chunks in parallel and start template PM resolution as soon as the template read returns; carry the previous dataset's `people` map into the reload and resolve only unknown ids.
- **Benefit (est.)** about 3–6 legs per gates load and toggle; 1–2 Graph calls and about 6 requests per toggle/save.
- **Risk detail** `peopleError` must stay non-fatal, `out` keyed by lowercase id; a changed Entra display name would stay stale until the next full load.

### OPT-18 — Window-focus refetch of heavy reads  **[decision required: DEC-3]**
- **P2** · repo-wide (Cost, Admin, Generators) · Cx L · Risk L–M (behavioural) · **Requires profiling**
- **Source** S3-12, S1-14, S6-05, S4-14
- **Where** `app/Providers.tsx:19-26` (`staleTime` 30 s, `refetchOnWindowFocus: true`, retry rules); 141 `useQuery` sites, only 5 opt out of focus refetch (Milestones `NO_FOCUS_REFETCH`, Add Cost sheet, Check List `quietFocus`, D159 reference reads).
  Heavy without an override: Cost book/totals/comments/Contracts (`REREAD_ON_VISIT`, `contracts/hooks.ts:32`, `useCostBook.ts:76,423-432`), admin `useGatesDataset`, `useDevexCosts`, `useOpexPeriods`, `useStandardContracts`, `useCapexTree` (`FRESH_ON_ENTRY`), ≈14 Generators queries.
- **Current** returning to the tab after 30 s re-reads every stale mounted query (a gates refetch is 5+ requests plus Graph; the CAPEX tree is the whole table).
- **Why a decision** the 30 s focus refetch is a documented multi-user protection against stale writes (Providers comment, D109). Do not change the default blindly: first count `[VSB] ACTION Load` lines after a tab return, then propose per-query overrides to the product owner (a freshness DIVERGENCE).

### OPT-19 — Municipality search: truncation risk, then debounce  
- **P1 (verify) / P2** · PM / General Data · Cx L · Risk L–M · Potential (S3-07); Confirmed code (S5-12, S7-06)
- **Source** S3-07, S5-12, S7-06
- **Where** `data/generalData.ts:284,291-335` (`searchGermanMunicipalities`, `searchFrenchMunicipalities`: `fetchPage` with `top: 5000`, which sends `maxPageSize: 500` and reads one page);
  `features/pm/general-data/hooks.ts:174-190`, `Screen.tsx:377,421,671`; `features/pm/team/hooks.ts:82-92` (`useMemberSearch`), `Screen.tsx:233-238,426`.
- **Current** (1) **a possible correctness defect:** the comment says "the whole filtered collection", but if Dataverse returns 500 plus a next link, a state with more than 500 municipalities (Bayern ≈ 2,000) is silently truncated. Verify on DEV by counting rows per state; if truncated pass `maxPageSize` (not `top`) or use `fetchAll`.
  (2) Both type-aheads fire a request per keystroke with no debounce, while the other pickers are debounced (250/300/350 ms, three magic numbers).
- **Recommended** verify (1) first (P1); use the existing `useDebouncedValue` for Team (L/L) and General Data. The municipality per-keystroke behaviour is a **documented DIVERGENCE (user, 3 Nov 2026; the canvas Germany box has `DelayOutput`)**, so a debounce there needs product sign-off.

### OPT-20 — Small independent-read and write sequencing items in Admin
- **P3** · Admin · Cx L–M · Risk L–M · Confirmed (S6-12/13/14/18); product nod needed for S6-07
- **Source** S6-07, S6-12, S6-13, S6-14
- **Where** `data/adminCost.ts:821-833` (Period-1 edit PATCHes every later period, guard GET + PATCH each, up to ~18 requests; payload `propagationFields` `:603-622`), `:454-485` (OPEX read twice per scope: active 38 columns, inactive 5 columns),
  `data/adminContract.ts:368-386` (removals then additions, disjoint rows), `data/adminCapexAccounts.ts:301-305,240-242` (sequential guard reads).
- **Recommended** S6-14: `Promise.all` the two guard reads (keep message priority). S6-13: run removals and additions together as the CAPEX clean-up does (`adminCapexAccounts.ts:398-406`) — needs a combined error report. S6-12: one read with `statecode` split client-side (couples failure modes). **S6-07 is canvas parity ("copy always"): skipping unchanged propagation is a DIVERGENCE → DEC-5.**
- **Benefit (est.)** S6-07: ~18 → ~0–2 requests on a typical Period-1 edit; the others one round trip each.

### OPT-21 — Bulk-write switches that are built but OFF  **[not a code change: DEC-4]**
- **P2 (decision)** · Generators, Check List · Cx M (test and approval) · Risk M · Confirmed (status); Potential (gain)
- **Source** S4-06
- **Where** `data/generatorsBulkFlags.ts` (every `GENERATORS_BULK` flag `false`), `data/checklistBulkFlags.ts` (`materialise: false`); `GENERATORS-BULK-DEV-TEST-PLAN.md` ("every flag off, not run against DEV"). Plans `features/pm/generators/plans.ts:140-260`.
- **Current** Add WTG Type with N turbines × L all-WTG costs sends 1 + N + N×L single writes at 16 wide (30 turbines, 3 costs ≈ 120 writes ≈ 8 rounds); with the switches on ≈ 3–4 sequential requests. Activate/Deactivate N status updates; Check List first visit 10–40 template creates.
- **Why a decision** the divergence (a bulk chunk lands whole or not at all, 501 fallbacks) is not product-approved and the DEV test plan has not been run. No new code is needed; this register only records it as the largest remaining Generators write saving.

### OPT-22 — Guarded-update pre-read and batching  **[blocked / decision: DEC-7]**
- **P3** · repo-wide writes · Cx M · Risk M–H · Potential
- **Source** S3-11, S6-15
- **Where** `data/client.ts:402-453` (`updateRecordIfExists`: 1 existence GET + 1 PATCH per row); loop callers `adminMilestones.ts:104-124`, `adminCost.ts:677,788,825`, `adminChecklistTables.ts:297`, `adminRowWrites.ts:87-102`; the CAPEX deactivation zeroing `adminCapexAccounts.ts:398-401` (an account on hundreds of contracts is thousands of requests at 8 wide).
- **Current** SDK 1.3.1 sends PATCH without `If-Match`, so the pre-read prevents resurrection of deleted rows. The comment at `adminCapexAccounts.ts:147-155` describes behaviour of SDK ≥1.5.0 that is not installed (note: D159 follow-up #9 evaluated SDK 1.6.0).
- **Recommended** (now) `updateRecordsIfExist(rows)`: one `idIn` read per 40 ids then PATCHes, keeping per-row `RecordGoneError` attribution (pattern: `data/verifyGone.ts:43-75`); (later) drop the pre-read when the SDK sends `If-Match: *`. **Doing the second now is Risk H (silent resurrection).**

### OPT-23 — Cost panel delete relies on per-row deletes where the contract cascade would do  **[decision: DEC-5]**
- **P3** · Cost / CAPEX · Cx L · Risk M–H · Requires a live check
- **Source** S1-13
- **Where** `data/capexWrites.ts:845-869` (`deleteCostLineBulk`: comments → comment deletes (4 wide) → one delete per month row (4 wide) → contract delete; 120 months ≈ 30 rounds), code comment `:790-802`.
- **Why a decision** the canvas relies on the cascade and D51 already deletes whole contracts by cascade, but this code deliberately avoids relying on it. Verify the cascade on DEV first.

### OPT-24 — Production/others: small repeated reads
- **P3** · Production, Check List · Cx L · Risk L · Confirmed
- **Source** S5-10, S4-12, S4-13
- **Where** `features/pm/production/hooks.ts:176-195,197-245` (`generateIfDue` re-reads the project that `rollUp` just loaded: hand it over via `seen`; pre-write reads stay live);
  `features/pm/checklist/hooks.ts:78-89,515` (`waitForClusterTransition` re-reads all 11 columns of all trackings every 1.5 s for up to 30 s = up to 20 reads; `requestApproval` reads the whole cluster to `.find` one row — narrow both, keep `staleTaskRequestRefusal`, `clusterTransitionDone` and the C6 fresh-read semantics);
  `data/checklist.ts:342-366`, `data/adminGatesApprovals.ts:242-253` (`findScopeCountryTechId`: cache the scope id for the 30-minute reference window).

---

## B. Render-path recomputation, algorithms and transformations (categories 1, 3, 5)

### OPT-25 — CAPEX grid repaints and rebuilds its dataset on every parent render  **[P0]**
- **P0** · Cost / CAPEX · Cx L · Risk L–M · **Confirmed** (verified by the orchestrator; magnitude needs profiling)
- **Source** S2-06, S2-07, S2-08, S2-18 (+ S1 cross-note)
- **Where** `features/cost/capex-costs/Screen.tsx:397` (`categoryAccounts = book ? accountsInCategory(...) : []`, a fresh array each render), `:609-625,1015-1020`, `:416-421`; `capex-costs/PcfGrid.tsx:64-74`
  (`useMemo(gridRows, [props.accounts, …])` defeated by the new array; `useLayoutEffect(…, [props, rows])` runs `paint.current()` on every parent render because `props` is a new object), `:11-15,80-98` (`dataset()` rebuilt in every `render()`, including every `ResizeObserver` tick);
  `capex-costs/comments.ts:627-638,341-382,270-286`; `useCostBook.ts:851-858`.
- **Current** the grid stays mounted behind the Add/Edit drawer, so every keystroke in the panel (`update`, `setCostValue`, `setMonthText`) re-runs `gridRows` (about 60k payments on a large category), builds the dataset and re-parses it with the vendored `DatasetParser`, which rebuilds the whole DOM.
  `commentCosts` allocates one object per payment; `commentThreads` is roots × comments filter+sort; the comments query key `[...contractIds].sort().join(",")` (about 20 KB at 500+ contracts) is rebuilt and hashed every render.
- **Recommended** `useMemo` `categoryAccounts`, `pcfStandardOptions`, `clusterDates`; explicit deps for `PcfGrid` (rows, year, showEmpty, showPlanned, payer, standardOptions, clusterDates, writeActionsDisabled; `onAction` is already read through a ref) or `React.memo`; build the dataset next to `rows`; coalesce the observer with `requestAnimationFrame` and full-render only on width change; collect referenced cost ids first and group replies by `parentId`; memoise the comments key.
  Treat the vendored `GridRenderer.js` / `DatasetParser.js` as low priority.
- **Benefit (est.)** typing in the panel no longer rebuilds the grid; GC pressure down. Must show a repaint whenever a rendered input changes: `Screen.test`, `pcfGridFormat.test`, `pcfWriteActions.test`.

### OPT-26 — Period screens re-render whole cards per keystroke; OPEX warnings O(k²)
- **P2** · Cost / OPEX, Land Lease · Cx L–M · Risk L–M · Confirmed (structure); Requires profiling (magnitude, k ≈ 10–30)
- **Source** S2-10, S2-11, S2-13, S7-10 (part), S2-12 (part)
- **Where** `features/cost/periods/opexRules.ts:3222-3266,2127,2061,2094,463` (`toOpexRow` calls `warnAlignment` per row; `omAlignWarningVisible` sorts the whole card per row and its answer is the same for every row — defect O-4b, reproduced; `otherAlignWarningVisible` filters+sorts the chain per row; `groupChains` roots × n);
  `OpexScreen.tsx:811,1319-1365,1460-1480,1337-1358,1570`; `LandLeaseScreen.tsx:698,1271-1291,1474-1476,1783-1786`; `landLeaseRules.ts:857-867,918-931`; `useCostBook.ts:389-397,213` (device-type query not gated by `mode`).
- **Current** panel form state lives in the screen; `OpexCardView` / `SubaccountCard` are not memoised, so every keystroke re-sorts `costsInScope`, recomputes badges, gates and row models, and Land Lease `rows` even when a card is folded; `hasStandardAssumption` allocates a 20-field object per assumption per card per render.
  **`useOpexDeviceTypes` runs on Other OPEX although only O&M uses it** (≈4–5 requests per Other OPEX visit and per standard import) — a confirmed async fix independent of the rest.
- **Recommended** compute warnings once per card (last row for O&M, last-by-chain Map for Other OPEX; behaviour identical); `enabled: mode === "om"` and invalidate only for `om`; `React.memo` cards with stable props; compute `rows` only when a card is open; Set for the assumption scope; Map for header grouping.

### OPT-27 — Admin screens derive their rows on every render
- **P2** · Admin (Gates, Costs, Contracts) · Cx L–M · Risk L · Confirmed (complexity); wall-clock Requires profiling
- **Source** S6-06, S6-10, S6-11, S6-18
- **Where** `features/admin/admin-gates-approvals/GateTable.tsx:207-216`, `rules.ts:248-249,264-283`, `Screen.tsx:160`
  (`tasksOfGate`, `canAddTask`, three `parsePeople` per gate row, `checklists.find(sameId)` per approval, `approvals.some(sameId)` per checklist; `sameId` lower-cases both strings on every comparison: roughly gates 6 × approvals 100 × checklists 150 ≈ 90k `sameId` calls per render, twice, plus about 100 `JSON.parse`);
  `features/admin/admin-cost/Screen.tsx:379-388,409-410`, `rules.ts:261,264` (`groupContracts` / `contractMenu` per render even for folded sections; `contracts.find(c => c.periods.includes(r))` per row);
  `features/admin/admin-contract/Screen.tsx:200-208,420-424,504`, `rules.ts:774-783,794-813` (DevCo filter + tag grouping per card per keystroke; `visibleSelectionCount` and `isDirty` computed twice);
  `data/adminCost.ts:220-223` (`childrenOf` re-filters and re-sorts per parent).
- **Recommended** `useMemo` a `Map<lowerId, checklist>` and a `Set` of approved ids once per dataset, derive per-gate rows from them, parse participant JSON once; memoise groupings and pass `contract` into `canEdit`/`canDelete`; index DevCo rows by `contractId`; thread `dirty` into `canSave`; group by `parentId` once, as `buildCapexTree` does (`admin-capex-accounts/rules.ts:76-101`). Keep case-insensitive id semantics, the `isShownChecklist` filter and the sort key `order, number, name`.
- **Benefit (est.)** Gates: about 10–30 ms per render → negligible; the others small.

### OPT-28 — Cost screens: recalculation, validation twice, per-edit validation passes
- **P3** · Cost / Contracts, Add Cost · Cx L–M · Risk L–M · Requires profiling (S1-17, S1-18); Confirmed duplication (S1-16, S2-17)
- **Source** S1-16, S1-17, S1-18, S2-17, S7-16
- **Where** `features/cost/contracts/rules.ts:1052-1090` (`canSaveContract`) mirrors `:1100-1160` (`contractErrors`), both per render (`Screen.tsx:833,1045`), equivalent for non-Rights contracts to `recalculated && contractErrors(...).length === 0`; `Screen.tsx:416-423,437-449`, `rules.ts:739-767,1553-1580`, `hooks.ts:157-171`;
  `features/cost/add-costs-from-table/Screen.tsx:209-214`, `rules.ts:562-577` (six passes over up to 15k rows after the 200 ms debounce; `JSON.stringify` per row in `validateDuplicateContracts`), `spreadsheet/SpreadSheet.tsx:155-175` (`sanitizeRow`: arrays allocated and options trimmed/lowercased per cell on every `handleChange`);
  `LandLeaseScreen.tsx:785-787,943-952`, `landLeaseRules.ts:2597`; `OpexScreen.tsx:1716-1722,1136`.
- **Recommended** derive `canSave` from the already computed errors (keep every message and the order, `ADDCOST_MSG`); index cost rows once by contract and split the account-tree memo into base/usage/selection; share per-row keys across the Add Cost passes or validate changed rows; hoist constant arrays/lowercased Maps in `sanitizeRow`. Check against D140 / `UT-ADDPERF` numbers first.
- **Risk detail** rounding and the `sumCosts` loop semantics must stay identical; the canvas inclusion–exclusion form must stay.

### OPT-29 — Shared Intl / collator / hook micro-costs
- **P3** · repo-wide · Cx L · Risk L · Confirmed (S7-11, S7-15); Potential (S2-12, S7-10, S1-20)
- **Source** S7-11, S7-15, S2-12, S7-10, S1-20, S3-15
- **Where** `features/pm/revenues/rules.ts:2374,2385,2415` (`new Intl.NumberFormat` per cell, about 80 µs each), `domain/powerFxNumeric.ts:129,137`, `features/pm/finance/rules.ts:3814`, `admin-contract/rules.ts:322` — route through the existing pool `domain/locale.ts:117,170` (output byte-identical per `locale.ts:113`);
  `components/useMediaQuery.ts:9-19` (verified: a new `subscribe` closure each render makes React unsubscribe and resubscribe the `matchMedia` listener on every `CountryTechnologyPicker` render, `:236-238`); about 66 `localeCompare` sites, heavy where a locale/options argument is passed
  (`opexRules.ts:401-407,449-451,1612`, `LandLeaseScreen.tsx:1270-1273`, `costBook.ts:280-282,434-435`, `add-costs-from-table/rules.ts:379`, `admin-default-checklists/rules.ts:140`) → pooled `Intl.Collator` beside the formatters (collator options and locale must match each call; do not replace ISO-date `localeCompare` with `<` without checking formats);
  `platform/requestLog.ts:188-217,107-119,87-96` and `appInsights/appInsights.ts:259-262` (`trackMetric` builds its payload before `send` checks `client === null`: lazy payload is the only item worth doing — leave the logger otherwise, Requires profiling).

### OPT-30 — Algorithm micro-items (fix only when the file is touched)
- **P3** · Generators, Check List · Cx L · Risk L · Confirmed (low impact)
- **Source** S4-10, S4-11
- **Where** `features/pm/generators/plans.ts:642` (`planTypeLandLeaseCleanup`: `[...(byCost.get(a.costId) ?? []), a.id]` copies the growing array per allocation, O(A²/C); A ≤ a few hundred); `features/pm/checklist/rules.ts:716-767` (`planChecklistMaterialisation` builds `bulkRows` and calls `newRowId()` per template even on the shipped single-create path; guard on `opts.bulk === true && ctx.owningBusinessUnitId`; `UT-CHKPERF-075`).

---

## C. Calculation consolidation and shared utilities (category 2)

Every entry below was checked for **identical** semantics. Families whose rounding, null handling or date boundary differ are *not* proposed for merging and are listed under §D as decisions.

### OPT-31 — `dateOnly` re-inlined 7 times; identical date-text parsers
- **P2** · repo-wide · Cx L · Risk L · Confirmed
- **Source** S7-02, S7-12, S3-10 (date part)
- **Where** local-parts `yyyy-mm-dd` identical to `data/odata.ts:97 dateOnly`: `features/cost/capex-costs/rules.ts:218`, `costing/model.ts:337`, `periods/landLeaseRules.ts:672-675` (`toIso`) and `:712-716` (`isoDay`), `periods/opexRules.ts:2708-2709,3165-3166`, `periods/OpexScreen.tsx:640-643` (`iso`; `OpexScreen` and `isoDay` differ only in the null guard).
  **Not** the same, keep apart: `capex-costs/clusters.ts:89` (always `-01`), `features/pm/project-main/rules.ts:451` (UTC parts).
  Identical `day`/`rawDay`: `data/revenues.ts:44-49`, `features/pm/finance/rules.ts:3659-3664`, `finance/Screen.tsx:458-463`. `canvasDate.ts:42 dateFromIso` validates rollover ("2026-02-30" → null, `day` gives 2 Mar) — not identical.
- **Recommended** move `dateOnly` to `domain/dates.ts` (rule 17's named home) and re-export from `odata.ts`; replace the 7 copies; dedupe the three identical `day`.
- **Benefit** removes a recurring off-by-one-day risk (CONVENTIONS rule 18). The `asDate` UTC and local-midnight/local-noon parse differences are **DEC-2**, not merged.

### OPT-32 — Row-value coercers copied about 30 times
- **P3** · `data/` · Cx L · Risk L · Confirmed
- **Source** S7-03, S3-10, S1-15 (part), S5/S4 cross-notes
- **Where** identical groups: `str` (`checklist.ts:41`, `finance.ts:46`, `generalData.ts:35`, `generators.ts:55`, `gridOperator.ts:15`, `milestones.ts:41`, `planning.ts:26`, `production.ts:37`, `revenues.ts:38`, `team.ts:45`, `features/pm/finance/Screen.tsx:456`),
  `num = numberOf(v) ?? null` (8 modules), `bool` (`generalData.ts:37`, `generators.ts:57`, `milestones.ts:43`, `production.ts:39`), `formatted(col)` (`checklist.ts:40`, `generalData.ts:32`, `milestones.ts:38`, `planning.ts:28`, `team.ts:46`); `adminContract.ts:98 numberOf` is identical to `odata.ts:217`; `nullableNumber` equals `odata.money`.
  **Different, keep local:** `revenues.ts:40` (`bool` also accepts `1`), `revenues.ts:41` (`formatted` takes a row), `adminCost.ts:180`, `adminMilestones.ts:67` (finite-only, returns `undefined`), `adminGatesApprovals.ts:170` (`Number(v)`, "abc" → NaN), `checklist.ts:42` and `project-main/rules.ts:393-394` (`typeof` only / stringifies), `landLease.ts:63,73`, `opexCatalog.ts:261`, `periodWrites.ts:99` (finite + trim).
- **Recommended** `data/rowValues.ts` with the identical set only; leave the differing ones. A NaN reaching a currency column is the risk (`odata.money` exists for that).

### OPT-33 — Other identical copies (move once, re-export)
- **P3** · repo-wide · Cx L · Risk L · Confirmed
- **Source** S7-08, S4-09, S7-13, S7-14, S7-17, S7-18, S1-15 (part)
- **(a)** `roundDown` / `roundUp` byte-identical in `domain/numeric.ts:204,209` and `domain/powerFxNumeric.ts:150,154`. (`round` vs `pfxRound` are **not** — DEC-1.)
- **(b)** `forLanguage`, `textFormat`, `textIntOr` live in `features/pm/generators/rulesCore.ts:2539-2565` but five screens import them (`grid-operator/rules.ts:42`, Planning, Finance, Production, Revenues), coupling their tests to the Generators plan builders (rules.ts re-exports about 11k lines).
  Move to `domain/powerFxNumeric.ts` (their dependencies `pfxRound`/`decimalSeparator` already live there), re-export from generators; `production/rules.ts:303-308 pfxText` duplicates `textFormat(.., lang)`.
- **(c)** `.toLowerCase().startsWith("standard")` five copies (`landLeaseRules.ts:1039,1047` — one body, `:1043` says "redundant", `opexRules.ts:728,733`, `features/pm/revenues/rules.ts:2056`) → `startsWithStandard(text)` beside the shared style (CONVENTIONS rule 20). Not the same: `revenues/rules.ts:594` (case-sensitive "Standard " strip), `contracts/rules.ts:1659` (a flag).
- **(d)** `groupBy` hand-rolled 25+ times (`data/addCostSheet.ts:1489-1494`, `add-costs-from-table/rules.ts:231`, `costBook.ts:421,805`, `contracts/rules.ts:500`, `capex-costs/gridRows.ts:147,155`, `admin-cost/rules.ts:654-661`, `adapter.ts:100,129,202`, `contracts/hooks.ts:63`).
- **(e)** OData fragments outside `data/odata.ts`: `data/projects.ts:532-546` and `data/project.ts:341-346` hand-build `contains(...)` with their own quote doubling; 9 sites `filter: \`${PROJECT_COL.id} eq ${guid(projectId)}\`, top: 1` (`checklist.ts:179`, `finance.ts:62`, `generalData.ts:63`, `generators.ts:107`, `milestones.ts:93`, `planning.ts:41`, `production.ts:58`, `revenues.ts:78`, `team.ts:71`), plus about 8 `col eq ${guid(id)}` — all validated, only duplicated; add `eqId` / `top1ById`.
- **(f)** "duration in months" `years*12 + months` at 17 sites (`costing/model.ts:334`, `landLeaseRules.ts:705,1315,1372,3359`, `opexRules.ts:561,570,1652,1667,2598,2659`, `periodWrites.ts:1168,1326`, `admin-cost/rules.ts:684`, `production/rules.ts:1614`, `finance/rules.ts:1305`, `revenues/rules.ts:1371`); null handling varies (`?? 0`, `orZero`, `|| 0`; D159 deliberately left `monthsOf` alone) → `durationMonths(years, months)` only if the NaN note is respected.
- **(g)** `dd.mm.yyyy` local copies (`canvasDate.ts:34`, `finance/rules.ts:1459`, `revenues/rules.ts:1176`, `checklist/rules.ts:2713`) can go through `formatCanvasDate`; keep the UTC one (`project-main/rules.ts:451`).
- **(h)** Admin helpers: `searchEntraPeople` (`data/adminGatesApprovals.ts:325`) and `searchPeople` (`:568`) build the same filter; `toPersona` (`:312`) / `toPerson` (`:535`); `getEntraPeople` (`:340`) / `resolvePeople` (`:543`); two approvals readers (`adminGatesApprovals.ts:282-308` `Promise.all` vs `adminChecklistTables.ts:270-288` sequential — OPT-17).
  Note `getEntraPeople` is deliberately one request per id (per-person failure isolation, `checklist.ts:157`): do not batch (S7).

### OPT-34 — Dead or duplicated implementations (delete after `knip` confirms)
- **P3** · Cost, Admin, platform · Cx L · Risk L–M · Confirmed by call graph / grep
- **Source** S1-12, S2-15, S3-16, S6-16
- **Where** Land Lease branch of `data/periodWrites.ts:570-950,1256+` (`saveLandLeasePeriod`, `reconcileLandLeaseAllocations`, `deleteLandLeasePeriod`, `addLandLeaseStandardContract`, `resolveLandLeaseHeader`, `usedLandLeaseSlots`) plus `costBook.ts:617` (`loadLandLeasePeriods`), `useLandLeaseContracts` (`useCostBook.ts:225`), `getLandLeaseCostFlags`: callers are only OPEX; Land Lease writes via `applyLeaseWrites`. About 450 lines with different rule semantics (slot-based, one header) that will drift from `landLeaseRules`; UT-PWRITE tests pin it, and it is exported through `costRepository`.
  `useLeaseWrites`/`save` invalidate `["land-lease-contracts"]`, a query nobody mounts (no-op). `data/project.ts:338-372 searchProjects` and `data/projects.ts:594-602 canReadProject` (bypasses `unwrap`, rule 3) are unused outside tests.
  Admin: `listGateStates` (`:187`), `listGateCountries` (`:174`), `listScopeChecklistItems` (`:259`), `deactivateCapexAccount`/`deactivateCapexSubaccount` (`adminCapexAccounts.ts:506,517`), `isNDecimal`/`inRange` (`admin-contract/rules.ts:607,612`).
  **Caveat** removing the Land Lease path is only safe once OPT-04 has removed the OPEX screen's dependency on Land Lease periods in the book (they are coupled through `useCostBook.save`'s diff).

---

## D. Findings that need a product / owner decision (not for Stage 3 without sign-off)

These are real, evidenced differences. They change numbers, stored values or freshness, so CONVENTIONS rule 8 applies.
Each needs a line in `02-OPEN-DECISIONS.md` if acted on.

| ID | Finding | Evidence | Why it is not a refactor |
|---|---|---|---|
| **DEC-1** | **Two Power Fx `Round` ports disagree on ties.** `domain/numeric.ts:176 round` adds an epsilon nudge; `domain/powerFxNumeric.ts:141 pfxRound` does not. The scan ran both: 1.005 → 1.01 vs 1.00; 1.255 → 1.26 vs 1.25; 0.285 → 0.29 vs 0.28; 10.075 → 10.08 vs 10.07 (2.675, 8.345, 54.505, 1.115 agree). `pfxRound` has 35 call sites outside `domain/` (e.g. `generators/plans.ts:296` stores a cost; `revenues/rules.ts:2372`). Source S7-07. Verified in source by the orchestrator. | `numeric.ts` documents the nudge as matching Power Fx's decimal arithmetic. | Merging changes stored or displayed values. Needs: which is canvas-correct, and whether stored data is affected. |
| **DEC-1b** | `Math.round` used for money in `add-costs-from-table/rules.ts:839` (`recomputeContractTotal`, sets stored `vsb_totalcost`), `capex-costs/rules.ts:244,436,461`, `costing/model.ts:325`: half-up, so −2.5 → −2 where Power Fx gives −3. Source S7 flag. | Identical to Power Fx only for non-negative amounts. | Only matters if negative cost corrections are legal. |
| **DEC-2** | `data/project.ts:111 asDate` is `new Date(value)` (UTC midnight for date-only), used for COD and milestone dates (`project.ts:208-225`): a day early west of UTC. Other parsers use local midnight (`contracts.ts:69`) or local noon (`opexRules.ts:53`, `landLeaseRules.ts:666`). Sources S3-10, S7-12. | D159 §6 already decided not to unify the instants; the scan agrees. | A possible correctness item for the product owner; midnight vs noon changes DST arithmetic. |
| **DEC-3** | Focus refetch policy for heavy reads (OPT-18). | Multi-user protection by design. | Freshness DIVERGENCE. |
| **DEC-4** | Turn on the Generators / Check List bulk switches (OPT-21). | DEV test plan not run. | Whole-or-nothing chunks, 501 fallbacks. |
| **DEC-5** | Period-1 propagation skip (S6-07), cascade delete for CAPEX panel (S1-13), skip unchanged allocation `Name` (S2-05b). | Canvas parity ("copy always", per-row delete, "Patch re-writes"). | `DIVERGENCE` entries needed; cascade needs a live DEV check. |
| **DEC-6** | Municipality search debounce (S5-12). | Documented DIVERGENCE of 3 Nov 2026 (canvas Germany box has `DelayOutput`). | Product sign-off. |
| **DEC-7** | SDK upgrade to drop guarded-update pre-reads (S6-15; D159 #9). | SDK 1.3.1 installed. | Risk H if done early (resurrection). |
| **DEC-8** | Inflation helper twins: `opexRules.countryInflationPercent` (`:1397-1409`) vs `landLeaseRules.countryProfileFor` (`:2280-2291`) differ for Italy with a blank Area (OPEX ignores the Area term; Land Lease applies it and matches no row). The identical parts (`resolveInflationProfile`/`resolveStandardInflationProfile`, the four `inflationStartYear*` one-liners, `defaultCurrencyCode`, duration option lists) could share a home; keep the lookups apart as a parity twin. Source S2-16. | A merge changes behaviour for one case. | Parity twin. |
| **DEC-9** | Three numeric parse/validate stacks: `domain/numeric.ts` (Intl separators, `undefined`), `domain/powerFxNumeric.ts` (language prefix, NaN, strips every "," in en), `domain/numberInput.ts` (already "OPEN PRODUCT DECISION" in its header, lines 12–18), local copies `landLeaseRules.ts:1964 leaseNumber`. Differ on de-CH/en-ZA separators and "1."/".5". Sources S7-09, S6-17. | Only per-call-site consolidation with parity tests, or document which family a screen uses. Safe item: one compiled-regex cache for `isDecimal` (`numeric.ts:68` has one, `powerFxNumeric.ts:77` builds a RegExp per call — microseconds). | Do not merge blindly. |

---

## E. Cross-screen opportunities (summary)

1. **One loader for the project** (OPT-01/02/03): PM and Cost both pay for a heavier session load than they use, and both re-read the row.
2. **One shared reference-data layer** (OPT-07a–d): countries, currencies, chart of accounts, project states — the `projectStates.ts` pattern repeated.
3. **One chunked-read helper with a gate** (OPT-09), and the existing `mapLimit` extended to the sequential admin and Cost write loops (OPT-10, 11, 17, 20).
4. **Per-job reload narrowing** (OPT-12/13): Finance, Revenues and Generators already do it; Team, Grid Operator, Planning, General Data, Milestones and the CAPEX/Comments writes do not.
5. **A shared per-person lookup cache** (OPT-14) so Team, General Data and the admin picker stop re-reading Entra.
6. **Shared utilities** (OPT-31–33) so the copies stop drifting.

## F. Raw-finding traceability

Every raw id maps to an entry above. Not mapped to an OPT-xx by design: S3-14 (environment-variable reads, two sequential, low value, P3, left as is);
S5 "minor" items (revenue assumption rows converted twice; fresh `[]` defaults while loading — negligible); S2-19 (comment panel save serial,
threads are small); S1-20 / S3-15 partly folded into OPT-29.

| Slice | Raw ids → OPT |
|---|---|
| S1 | 01→04 · 02→05 · 03→06 · 04→08 · 05→09 · 06→07c · 07→12 (contracts reads; fold with OPT-12 by `fetchQuery` dedupe) · 08→12 · 09→10 · 10→11 · 11→11 · 12→34 · 13→23 · 14→18 · 15→32/33 · 16→28 · 17→28 · 18→28 · 19→12 · 20→29 |
| S2 | 01→04 · 02→06 · 03→06/07b · 04→11 · 05→10 · 06→25 · 07→25 · 08→25 · 09→12 · 10→26 · 11→26 · 12→29 · 13→26 · 14→11 · 15→34 · 16→DEC-8 · 17→28 · 18→25 · 19→not mapped |
| S3 | 01→01 · 02→02 · 03→03 · 04→07a · 05→07d · 06→08 · 07→19 · 08→07e · 09→07b · 10→32/DEC-2 · 11→22 · 12→18 · 13→07e · 14→not mapped · 15→29 · 16→34 · 17→08(b) |
| S4 | 01→14 · 02→14 · 03→13 · 04→15 · 05→07a · 06→21 · 07→15 · 08→15 · 09→33(b) · 10→30 · 11→30 · 12→24 · 13→24 · 14→18 |
| S5 | 01→01 · 02→16 · 03→13 · 04→07a/b/e · 05→08 · 06→07a · 07→07e · 08→01/13 · 09→13 · 10→24 · 11→07e · 12→19 |
| S6 | 01→08(c) · 02→17 · 03→17 · 04→17 · 05→18 · 06→27 · 07→20/DEC-5 · 08→07c · 09→07d · 10→27 · 11→27 · 12→20 · 13→20 · 14→20 · 15→22 · 16→33(h)/34 · 17→DEC-9 · 18→27 |
| S7 | 01→09 · 02→31 · 03→32 · 04→07a · 05→07b · 06→19 · 07→DEC-1 · 08→33(a) · 09→DEC-9 · 10→29 · 11→29 · 12→31/DEC-2 · 13→33(c) · 14→33(d) · 15→29 · 16→28 · 17→33(e) · 18→33(f) |
