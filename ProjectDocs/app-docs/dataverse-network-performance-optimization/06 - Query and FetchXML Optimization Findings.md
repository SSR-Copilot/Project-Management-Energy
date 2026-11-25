# 06 - Query and FetchXML Optimization Findings

> Stage 1 audit, 25 Nov 2026. Branch `feature/dataverse-network-performance-optimization`, from `origin/RounakDev1` at `30afece`. Investigation only: no application source file was changed. Every request count is **code-derived**, not measured. 

`$select`, `$filter`, id-list fan-out, pagination, client-side filtering. FetchXML and `$expand` are NOT available through this SDK (doc 01 §4).

**12 findings name this area** (a finding naming several areas appears in each; its primary area is listed first in its block).

| ID | Pri | Conf | Title |
|---|---|---|---|
| CA-04 | P1 | Medium | Id-list fan-out uses 40 ids per request in an `or` chain; larger chunks or the `In` function would cut request counts several-fold (new evidence for the deferred OPT-09 family) |
| PB-02 | P1 | Medium | Municipality search can be cut short with no warning (OPT-19 part 1: the verification is still owed) |
| CA-13 | P2 | Medium | The Summary tab reads every cost row of the project to produce five numbers (no server-side aggregate) |
| CB-05 | P2 | Medium | The second load wave on Contracts and Land Lease could go, through single-valued navigation filters |
| PB-03 | P2 | High | The PM deep-link boot prefetch starts only the session project; the screen's own first reads wait for the gate |
| AD-09 | P3 | High | Costs settings: three scope reads refetch on every focus; OPEX rows read twice per scope |
| AD-12 | P3 | High | Same table, three admin reads (OPT-07c residual) |
| CA-16 | P3 | Medium | The active-WTG count is read for every CAPEX tab although only standard contracts need it, and it selects an unused column |
| CB-13 | P3 | High | The two BoP standard-assumption reads could be one request |
| PA-10 | P3 | High | Generator-type reads for ids only select 12–14 columns; Finance re-reads a list the warm-up has just cached |
| PB-06 | P3 | High | `vsb_countries` is read under four keys with four selects (the rest of OPT-07a; D119 §4(a) still open) |
| PB-10 | P3 | High | Project-row reads: Planning and Grid Operator share a loader but not a key; each PM screen re-reads `vsb_projects` with its own select |

## Findings

### CA-04 - Id-list fan-out uses 40 ids per request in an `or` chain; larger chunks or the `In` function would cut request counts several-fold (new evidence for the deferred OPT-09 family)

**Priority P1, confidence Medium.** Source scope: Cost A: CAPEX/DEVEX, Add Cost from Table, shared costing layer.

- **Area** network / query. **Screen** CAPEX tab, Summary, Add Cost, comments. **File:line** `data/odata.ts:63-72,78` (`CHUNK = 40`, `lookupIn`, `chunk`); callers `costBook.ts:913,1040,1208`, `comments.ts:66`, `standardContracts.ts:30`, `addCostSheet.ts:146,194,214`, `bulkSend.ts:195`. **Function** `lookupIn`, `chunk`.
- **Problem** Every read keyed by a list of contract or account ids sends `ceil(N/40)` parallel requests. The code gives the cap as "the ~16 k practical query cap (36 chars + ' or ' + column name each)". One `_vsb_contract_value eq <guid>` term is about 70 characters, so 40 ids is about 3 KB: roughly 4-5x headroom under the cited cap. The comment "Dataverse has no `in` for GUIDs in `$filter`" is at odds with the Dataverse Web API query function `Microsoft.Dynamics.CRM.In(PropertyName=...,PropertyValues=[...])` (Microsoft documentation; NOT verified through this SDK or host).
- **Evidence** `data/odata.ts:70`: `export const CHUNK = 40;` and `:73-75`: `return or(...ids.map((id) => lookupEq(column, id)));`
- **Impact** (symbolic) a 400-contract category costs 10 payment reads + 10 comment reads per load or refetch; a 2,000-contract Summary costs 50 sum reads. At a chunk of 150 these become 3 and 14. Fewer concurrent reads also lowers the 52-limit pressure of CA-06 and CA-17.
- **Proposed solution** Make the chunk size a per-use constant for reads (100-150, subject to a DEV test of the largest filter the host accepts), then evaluate the `In` function on one read behind a switch. Do not change write payloads.
- **Behaviour change?** none. **Risk** medium (URL length through the host's batch envelope; server filter-complexity limits; both unknown, G2). **Dependencies** G2. **Validation** on DEV with the largest project, record the request count and the first failing chunk size; unit test pins chunk boundaries (`odata.test.ts`). **Priority** P1. **Confidence** medium-low (the saving is arithmetic, the platform ceiling is not known).

### PB-02 - Municipality search can be cut short with no warning (OPT-19 part 1: the verification is still owed)

**Priority P1, confidence Medium.** Source scope: PM B: boot, Project Overview, PM screens, Cluster Checklist.

- **Area:** query, correctness. **Screen:** General Data.
- **File:line:** `data/generalData.ts:281, 288-308, 315-332`; `data/client.ts:104-114`.
- **Function:** `searchGermanMunicipalities`, `searchFrenchMunicipalities`.
- **Problem:** the comment promises "the WHOLE filtered collection", but `fetchPage` reads one page and ignores `skipToken`, and it sends `top: 5000` as `$top` beside `maxPageSize: 500`. If Dataverse applies the 500-row page size and returns a next link, an Area with more than 500 municipalities (Bayern ≈ 2,000, per `02_…Register.md` OPT-19) loses rows with no warning. The code is unchanged since OPT-19. `08_Final…` "What the owner must do" item 2 still lists "the municipality count (Bayern, empty search term)".
- **Evidence:**
  - `export const MUNICIPALITY_SEARCH_TOP = 5000;` (`generalData.ts:281`)
  - `const rows = await fetchPage(` … `top: MUNICIPALITY_SEARCH_TOP,` (`:290-298`)
  - `unwrap(await page(compact({ maxPageSize: DEFAULT_PAGE_SIZE, ...query })), operation)` (`client.ts:112`)
- **Impact:** a municipality that is not offered cannot be picked: a wrong tax factor, or a project that cannot be saved with its real municipality.
- **Proposed solution:** run the DEV count first. If rows are cut: `fetchAll` with `maxPages` 10 (bounded, D157-compatible), or `maxPageSize: 5000` with no `$top`.
- **Behaviour change?** None (it restores the documented behaviour).
- **Risk:** L. **Dependencies:** OPT-19, DEC-6 (the debounce is a separate matter).
- **Validation:** a `[VSB] DATA` line row count for Bayern with an empty term, against a direct count in the maker portal.
- **Priority:** P1 (verify). **Confidence:** Medium. The truncation depends on how the server combines `$top` and `maxpagesize`; the code cannot tell.

### CA-13 - The Summary tab reads every cost row of the project to produce five numbers (no server-side aggregate)

**Priority P2, confidence Medium.** Source scope: Cost A: CAPEX/DEVEX, Add Cost from Table, shared costing layer.

- **Area** query. **Screen** CAPEX Summary. **File:line** `data/costBook.ts:1200-1222` (`loadContractCostSums`), `:1265-1290` (`loadCapexTotals`). **Function** `loadCapexTotals`.
- **Problem** The platform has no `$apply` or aggregate (platform fact), so the sums download every `vsb_cost` of every contract of the project (two columns, 5,000 rows per page, `ceil(C_all/40)` parallel chunks). The canvas rule is "sum of the monthly rows, floored at 0", which differs from the stored `vsb_totalcost` (the code comment documents a 2,999.46 gap on Wirmighausen), so the stored total cannot replace it.
- **Evidence** `costBook.ts:1215-1221`: `fetchAll("sum CAPEX cost rows per contract", ..., { select: skipPendingCosts ? [...] : ["_vsb_contract_value", "vsb_cost"], filter: lookupIn("vsb_contract", ids), maxPageSize: 5000 })`.
- **Impact** Proportional to the number of month rows of the project on every Summary load, refetch and focus (CA-10, CA-06).
- **Proposed solution** Needs Dataverse work: a rollup column on the contract (sum of its month rows) or a custom API returning per-category totals. Inside the app, only CA-04 (fewer chunks), CA-06 (do not refetch it while hidden) and CA-10 (longer staleTime) apply.
- **Behaviour change?** needs product decision (rollup refresh latency versus a live sum). **Risk** medium. **Dependencies** the Dataverse team. **Validation** compare the rollup with the live sum on DEV data. **Priority** P2. **Confidence** medium.

### CB-05 - The second load wave on Contracts and Land Lease could go, through single-valued navigation filters

**Priority P2, confidence Medium.** Source scope: Cost B: Contracts, OPEX, Land Lease, periods.

- **Area** query · **Screen** Contracts, Land Lease
- **File:line** `data/contracts.ts:174-188, 200-212, 247-265`; `data/landLease.ts:148-169`
- **Function** `listPaymentTargets`, `listDevCoLinks`, `listCapexCostRows`, `loadLeaseBook`
- **Problem** Children are read by parent-id lists (`lookupIn` on chunks of 40), so they wait for the parent read, and they fan out
  one request per 40 parents with an unbounded `Promise.all` (the OPT-09 concern). Dataverse Web API `$filter` accepts a path through
  a single-valued navigation property, and the SDK forwards `filter` verbatim. The repo already relies on this in live code.
- **Evidence**
  - `chunk(contractIds).map((ids) => fetchAll(... filter: and(lookupIn("vsb_bopprojectcontract", ids), ACTIVE)` (`contracts.ts:175-184`).
  - `const headerIds = costRows.map(...)` → `Promise.all(chunk(headerIds).map(...lookupIn("vsb_projectcost", ids)))` (`landLease.ts:148-158`).
  - Precedent: `` `vsb_BoPContractStandardAssumption/_vsb_country_value eq ${guid(countryId)}` `` (`data/adminContract.ts:186`).
  - Navigation names already used in binds: `vsb_BoPProjectContract@odata.bind` (`contracts.ts:632`), `vsb_BoPContract@odata.bind`
    (`:602`), `LEASE_BIND.projectCost = { nav: "vsb_ProjectCost" ... }` (`landLeaseRules.ts:192`).
  - D120 §7: "A lookup join filter ... for the load chain were not tried (live check)".
- **Impact** Contracts load: 2 waves → 1. The ready gate waits only for the slowest single read. Land Lease load: 2 waves → 1 for
  the book. Request count becomes independent of C / H, with no 40-id URLs. Every revisit and every reload after a write gains
  the same.
- **Proposed solution** Each filter below runs in wave 1, paged by `fetchAll`; the client then groups by parent id as today.
  - Payment targets: `vsb_BoPProjectContract/_vsb_project_value eq P and vsb_BoPProjectContract/statecode eq 0 and statecode eq 0`.
  - DevCo links: `vsb_BoPContract/_vsb_project_value eq P and vsb_BoPContract/statecode eq 0 and statecode eq 0`.
  - Lease periods and allocations: `vsb_ProjectCost/_vsb_project_value eq P and vsb_ProjectCost/statecode eq 0`, which keeps exactly
    the rows of the ACTIVE headers.
  - CAPEX cost rows: `vsb_Contract/_vsb_project_value eq P and vsb_Contract/vsb_costtype eq DevCo and vsb_Contract/statecode eq 0
    and statecode eq 0`. Check this navigation name; it was not looked up.

  The query keys could then drop the id-set part, which also removes CB-12. Keep the old path behind a switch as the oracle (the
  D142 `readsByProject` pattern, `generators.ts:306-320`).
- **Behaviour change?** none: the same rows, provided the parent-state clause mirrors today's ACTIVE parent list.
- **Risk** Medium: the navigation names and the server's answer must be probed on DEV (D142 did the same for a polymorphic lookup,
  and these are not polymorphic). A row whose parent is inactive must stay out.
- **Dependencies** none. It makes OPT-09 (deferred) moot for these reads.
- **Validation** A DEV probe comparing the row-id sets of both filters on 2–3 projects. A differential unit test with a mock SDK.
  Wave counter `test/waveClient.ts`.
- **Priority** P2 · **Confidence** Medium

### PB-03 - The PM deep-link boot prefetch starts only the session project; the screen's own first reads wait for the gate

**Priority P2, confidence High.** Source scope: PM B: boot, Project Overview, PM screens, Cluster Checklist.

- **Area:** network, query. **Screen:** Milestones, Team, Planning, Grid Operator, Check List (and Production, Revenues, Finance: other auditors).
- **File:line:** `app/bootPrefetch.ts:44-47`; `app/routes.tsx:130-149`; `App.tsx:75`.
- **Function:** `prefetchTarget` (`pm-screen` branch).
- **Problem:** OPT-03 starts the screen *chunk* and the *session project* for `pm-screen`. Every read the screen makes with only the project id (Check List project and trackings; Team row, members and descriptions; Planning project, row and types; Grid Operator project and row; Milestones project) starts only after the session project has answered and the gate has rendered the `Outlet`. General Data and Generators prefetch their reads already (`:49-58, 79-101`). D156 §6 lists "a start-up prefetch of the Check List" as not built.
- **Evidence:**

  ```
  if (target.kind === "pm-screen" || target.kind === "cost") {
    await quietly("session project", () => qc.prefetchQuery(sessionProjectQueryOptions(…)));
    return;
  }
  ```
  (`bootPrefetch.ts:44-47`)
- **Impact:** 1 wave (the session project) on the critical path of every PM deep link, reload and new tab. Code-derived: about 1 round trip.
- **Proposed solution:** move each screen's project-id-only `queryOptions` into a `queries.ts`, as General Data and Generators do, and prefetch them in the `pm-screen` branch. Same keys, so a wrong guess costs one wasted read.
- **Behaviour change?** None (timing only; the gate still decides what renders).
- **Risk:** L. A key that drifts from the hook's is a wasted read; the UT-BOOT-OPT pattern pins it.
- **Dependencies:** OPT-03; the `queries.ts` refactor per screen.
- **Validation:** bootPrefetch tests (prefetched key = the hook's key, no second request); the `[VSB]` lines on DEV.
- **Priority:** P2. **Confidence:** High.

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

### CA-16 - The active-WTG count is read for every CAPEX tab although only standard contracts need it, and it selects an unused column

**Priority P3, confidence Medium.** Source scope: Cost A: CAPEX/DEVEX, Add Cost from Table, shared costing layer.

- **Area** query. **Screen** CAPEX tab. **File:line** `features/cost/costing/useCostBook.ts:761-766`, `data/standardContracts.ts:66-76`. **Function** `loadActiveWtgCount`.
- **Problem** `enabled: Boolean(projectId)` makes it a request on the first CAPEX visit (then a 5-minute cache) whether or not a standard contract is added; the select includes `statecode` although the filter already restricts to active rows.
- **Evidence** `standardContracts.ts:71`: `select: ["vsb_generatortypeinprojectid", "vsb_numberofgenerators", "statecode"],`.
- **Impact** One small request per 5 minutes per project.
- **Proposed solution** Enable it on first use of the Add panel or the standard-contract menu; drop `statecode` from the select.
- **Behaviour change?** none. **Risk** low. **Priority** P3. **Confidence** medium (who reads `activeWtgCount` was not traced beyond `Screen.tsx` standard-contract eligibility).

### CB-13 - The two BoP standard-assumption reads could be one request

**Priority P3, confidence High.** Source scope: Cost B: Contracts, OPEX, Land Lease, periods.

- **Area** query · **Screen** Contracts · **File:line** `features/cost/contracts/Screen.tsx:301-310`; `data/contracts.ts:342-368`
- **Problem** Two queries (Development, Construction), each `top 1`, run on every mount after 15 min.
- **Proposed solution** One read with `vsb_contracttypes in (Development, Construction)` (an `or` of two `eq`), ordered by `createdon asc`;
  take the first row per type on the client. 2 requests → 1, no wave change.
- **Behaviour change?** none (the same "oldest match per type" rule, TS-13) · **Priority** P3 · **Confidence** High

### PA-10 - Generator-type reads for ids only select 12–14 columns; Finance re-reads a list the warm-up has just cached

**Priority P3, confidence High.** Source scope: PM A: Generators, Production, Revenues, Finance.

- **Area**: query / caching · **Screens**: Finance, Production · **File:line**: `data/finance.ts:219-225`; `data/production.ts:340-343`; `data/generators.ts:244-249, 362-366`
- **Function**: `countActiveTurbines`, `loadGenerationInputs`
- **Problem**: both callers use only `id` (and turbine `name`) but call `listGeneratorTypes` / `listPvTypes` / `listProjectTurbines`, whose `$select`s carry 10–14 columns plus formatted-value annotations. Finance's count also misses `qk.generators(projectId, "types")`, which the warm-up (`app/generatorsWarmup.ts:51`) puts in the cache 1.5 s into the visit.
- **Evidence**: `const { listGeneratorTypes } = await import("./generators"); const types = await listGeneratorTypes(projectId);` (`finance.ts:219-220`).
- **Impact**: payload only (row counts are small); Finance can save 1 request when the warm-up has run. Production's pre-write reads must stay live (OPT-24), so there only the column list changes.
- **Proposed solution**: id-only variants (`select: [id]`). For Finance, `qc.fetchQuery(generatorTypesQueryOptions(projectId))`, which keeps D109 freshness when the cached entry predates the visit (as `useVisitStaleTime`).
- **Behaviour change?** none · **Risk**: L · **Priority**: P3 · **Confidence**: high.

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

