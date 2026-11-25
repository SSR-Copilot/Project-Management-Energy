# 03 - Screen-Level Network Audit

> Stage 1 audit, 25 Nov 2026. Branch `feature/dataverse-network-performance-optimization`, from `origin/RounakDev1` at `30afece`. Investigation only: no application source file was changed. Every request count is **code-derived**, not measured. Waves = sequential round-trip depth.

Per screen: initial load, interactions, saves and post-save refresh, with request and wave counts. All are code-derived estimates; see doc 13 for what could be measured. Boot and navigation traces are under "PM B".

## Cost A: CAPEX/DEVEX, Add Cost from Table, shared costing layer

Notation: A = accounts+sub-accounts of the open category, C = contracts of the category, M = month rows of the category, S = sub-accounts. `p` = extra pages (a page holds 500 rows by default, 5,000 for cost-row reads). Requests that the app can coalesce (shared chart) are counted once.

##### B1. CAPEX/DEVEX tab (category 0..n), first load

| Wave | Requests (parallel inside a wave) | Source |
|---|---|---|
| 1 | CA-OP-01 chart (1 + p; shared with CA-OP-08 categories, so one read), CA-OP-02 payer defaults (1), CA-OP-10 WTG count (1), CA-OP-08 categories (0 extra) | `costBook.ts:1162-1164` (accounts and payer start together); `useCostBook.ts:761` |
| 2 | CA-OP-03 contracts: ceil(A/40) requests | `costBook.ts:913` |
| 3 | CA-OP-04 payments: ceil(C/40) requests, each paged at 5,000 rows; CA-OP-05 project states (only if a contract has a linked cluster, cached) | `costBook.ts:944-947` |
| 4 | CA-OP-12 comments: ceil(C/40); CA-OP-09 standard assumptions: ceil(S/40); CA-OP-23 milestone durations (cached 30 min) | `useCostBook.ts:847,752`; hooks are enabled only after `book` resolves (`Screen.tsx:405-423`) |

Critical chain for the first paint: chart -> contracts -> payments = **3 waves**. The red comment dots add a 4th wave (`Screen.tsx:423`, `contractIds` come from `book`). Total (code-derived): about `4 + ceil(A/40) + 2*ceil(C/40) + ceil(S/40)` requests plus extra pages (`M/5,000` per chunk). Example, symbolic: C=400 -> 10 contract-chunk reads (if A>=400 ... A is usually far smaller than C, so ceil(A/40) is small), 10 payment reads, 10 comment reads.

Tab switch to another category: new key `["cost-book", project, category]` (`useCostBook.ts:84`); the chart is memo-hit (30 s), the payer-defaults table is re-read (not memoised: CA-10), contracts, payments and comments are re-read: the chain is again 3 + 1 waves. Returning to a tab within 30 s serves from cache; after 30 s it refetches (default staleTime) and again on every window focus (CA-20).

##### B2. CAPEX Summary tab
Wave 1: CA-OP-01 (shared) and CA-OP-06 contracts of the project (1 + p) in parallel. Wave 2: CA-OP-07 sums, ceil(C_all/40) requests each at 5,000 rows/page (`costBook.ts:1265-1290`). Chain = 2 waves. `useCostBook(-1)` runs but `loadCostLines` returns `[]` immediately for zero accounts (`costBook.ts:912`), no request. Comments are disabled (no contracts).

##### B3. CAPEX Add / Edit panel save (bulk, live)
- **Edit** (`capexWrites.ts:744-757`): contract PATCH (CA-OP-15) in parallel with the cost upsert (CA-OP-17: CreateMultiple and UpdateMultiple in parallel, each 1..8 requests), then deletes (CA-OP-19) after both settle. With a paid reset (relink) the contract goes first. Waves: 2 (writes), +1 if months were cleared (deletes at 4 wide: ceil(D/4) rounds, where D = deleted months), then post-save refresh.
- **Add** (`:738-741`): contract POST, then the cost upsert (new rows = CreateMultiple), then deletes (none on add). Waves: 2.
- **Post-save refresh** (`useCostBook.ts:479-495`, `capexInvalidation.ts:53-61`): `await Promise.all(invalidate)` of the category book (full B1 chain: 1 payer + ceil(A/40) + ceil(C/40)+pages; chart memo hit), plus keys for capex-totals and the two DevCo reads (`refetchType` default = active only, so they are marked stale, not fetched, unless that screen is mounted) and comments only when a month row was deleted. The panel's spinner waits for this (D56 section 5). So the visible save time = write waves + a full category reload.
- Request count (code-derived): writes `1 + bulkRequestCount(createRows) + bulkRequestCount(updateRows) (+ D)`; refresh `2 + ceil(A/40) + ceil(C/40)` waves-deep 3.

##### B4. CAPEX paid toggle
`setCostPaid` PATCH (1 request; +1 PATCH first when a cluster-linked contract is confirmed, sequential, `costRepository.ts:315-316`), then awaited refetch of the whole category book (job "paid" -> `[book]` only, `capexInvalidation.ts:54`): 3 waves, `1 + ceil(A/40) + ceil(C/40)` requests plus pages. So the grid's most frequent write costs 1 write and a full category reload, and the spinner waits for it.

##### B5. CAPEX Delete line (`capexWrites.ts:845-870`)
Wave 1 comments read (ceil(1/40)=1). Wave 2 comment deletes (K at 4 wide). Wave 3 month-row deletes (M_c at 4 wide, so ceil(M_c/4) rounds; 120 months = 30 rounds, matches OPT-23). Wave 4 contract DELETE. Then awaited full book refetch + comments refetch (`"delete"` job adds `COMMENTS_KEY`, `capexInvalidation.ts:61`).

##### B6. Comments panel save (`CommentsPanel.tsx:499-576`)
The panel dismisses first (`:511`), then strictly sequential awaits: each delete, each changed root (in `createdOn` order), each changed reply: 1 request each, `D + R + P` waves. Then `writes.invalidate()` = refetch of the `["capex-comments"]` prefix (screen-level key for the whole category + the panel's single-contract key = ceil(C/40) + 1 requests). Not the cost book (OPT-12 already).

##### B7. Add Cost from Table, load (`addCostSheet.ts:117-154`, `useCostBook.ts:546-566`)
Wave 1 chart (cached or 1+p). Wave 2 payer defaults (1) in parallel with contracts (ceil(A/40)). Wave 3 costs (ceil(C/40), 5,000 rows/page). Chain 3 waves, same data family as B1 minus comments/standard assumptions. The query has `NO_FOCUS_REFETCH`, `refetchOnReconnect:false`, `retry:false`.

##### B8. Add Cost from Table, Save (live flags)
First attempt (no prior ids, bulk available): `verifyUpserts=false`, no refresh. Plan is client-side. Then, at t=0: contract upsert (CA-OP-29), stage-A costs (CA-OP-30) in parallel, each as CreateMultiple + UpdateMultiple in parallel, each group split into at most 8 parallel requests of >=10 rows (`bulkSend.ts:118-120, 156-171`), all through the write gate of 24. Stage-B costs (CA-OP-31) after the contract create resolves (`addCostSheetBulk.ts:614-618`). After every write settles, deferred deletes start (CA-OP-32/33; 4 + 4 wide). The Save resolves before the deletes finish when nothing failed (`addCostSheetBulk.ts:714-734`). Waves on the critical path: 1 (existing contracts only) or 2 (new contracts: contract create -> their costs). Writes request count per group = `bulkRequestCount(rows)` (`bulkSend.ts:166-171`). With `refreshBeforePlan` (retry after a failure) +1 wave (`2*ceil(C/40)` reads) and verify +1 wave unless the plan has only deletes.
Post-save (`useCostBook.ts:603-632, 645-690`): `setQueryData` patch of the cached book (no wait), then fire-and-forget `invalidate()`: `cancelQueries` + invalidate book (refetch all, even inactive), capex-totals (refetch all), the "none" book (active only), the two DevCo keys (active only), sheet key (`refetchType:"none"`). So the CAPEX screen it navigates to starts one confirming refetch of the category (B1 chain) and one totals read (B2 chain) at once: about `2 + ceil(A/40) + ceil(C/40)` + `1 + ceil(C_all/40)` requests, not awaited by the Save. When the deferred deletes settle, `invalidate()` runs again (`followBackgroundDeletes`), i.e. the same refetch a second time.

## Cost B: Contracts, OPEX, Land Lease, periods

A "wave" is one sequential round-trip depth. Counts assume C, D, H, T ≤ 40 (one chunk each) unless stated.

##### Contracts (`ContractsScreenBody`, `Screen.tsx:226-345`)

- **Initial load, cold cache.** Wave 1: OP-01, OP-04, OP-05, OP-07 ×2 = 5. Wave 2: OP-02, OP-03 (need the contract ids),
  OP-06 (needs the DevCo contracts) = 3. **8 requests, 2 waves.** The write commands wait for all of them (`queriesReady`,
  `Screen.tsx:329-337`), so the critical chain is OP-01 → OP-02/OP-03 and OP-05 → OP-06.
- **Revisit / window focus.** OP-01, OP-02, OP-03 re-read (staleTime 0). With an unchanged id set the targets and links start
  at mount from the cached ids: 3 requests, 1 wave; with a changed set a second wave follows. OP-05/06 re-read after 30 s.
- **Save, edit, links unchanged.** OP-09 GET → OP-09 PATCH → OP-10 GET → `onSettled` refetch OP-01 + OP-03 (awaited, `hooks.ts:282`,
  `:318-327`). **5 requests, 4 waves.** With +a / −r accounts: + ceil(a/8) create waves + ceil(r/16) delete waves.
- **Save, create with a links.** OP-08 → OP-11 (ceil(a/8) waves) → refetch OP-01 + OP-03 (old id-set key) → the new id set changes
  both keys (`hooks.ts:55`, `:115`): OP-02 + OP-03 again. **≈ 1 + 1 + 2 + 2 requests, 2 + ceil(a/8) waves.**
- **Delete contract.** OP-13 → refetch OP-01, OP-02, OP-03 (old keys) → keys change → OP-02, OP-03 again. **6 requests, 3 waves**;
  2 of them (old-key targets and links) are thrown away (CB-12).
- **Payment target save / delete.** POST (or GET + PATCH) / DELETE → refetch OP-02. 2–3 requests, 2–3 waves.

##### Land Lease (`LandLeaseScreen`, `LandLeaseScreen.tsx:686-700`)

- **Initial load.** Wave 1: OP-16, OP-17, OP-21 ×2, OP-23, OP-24, OP-20 = 7. Wave 2: OP-18, OP-19, OP-22 = 3. **≈ 10 requests,
  2 waves.** The body waits for the book and the extras (`:737-741`).
- **Revisit after 30 s / focus.** lease book: 4 requests, 2 waves.
- **Save (`commit`, `:975-1037`), Period-1 edit, A = 40 allocations, 2 followers** (D160 §6 counts, re-derived): header PATCH (1) →
  40 allocation PATCHes 8 wide (5) → period PATCH (1) → each follower alone (2) = **9 waves, 44 requests**, then the awaited
  refetch (`useCostBook.ts:323-328`): 4 requests, 2 waves. **≈ 48 requests, 11 waves.**
- **Save, Period 2+ edit.** period PATCH (+ followers, one wave each) → refetch: ≈ 5 requests, 3 waves.
- **Delete contract (`confirmDelete`, `:1043-1066`), A = 40, 3 periods.** 40 allocation DELETEs 16 wide (3) → 3 period DELETEs one
  by one (3) → header (1) = **7 waves, 44 requests** + refetch (4 / 2). **≈ 48 requests, 9 waves.**
- **Standard import (`importStandard`, `:908-935`), 1 header, 40 allocations, 3 periods.** header (1) → allocations (5) →
  periods (3) = **9 waves, 44 requests** + refetch.

##### OPEX (`OpexScreen`, `OpexScreen.tsx:760-797`)

- **Initial load, O&M, cold.** Wave 1: OP-30, OP-31, OP-20, OP-33, OP-34, OP-35 (types ×2), OP-23, OP-36 = 9. Wave 2: OP-32, OP-35
  (devices, generators) = 3. **≈ 12 requests, 2 waves.** Other OPEX: no OP-35, ≈ 8 requests, 2 waves.
- **Revisit.** OP-30, OP-31, OP-32 (+ 4 for OP-35 on O&M): 3–7 requests, 2 waves.
- **Head save with k children, start changed, f followers.** OP-38 → OP-39 → OP-40 (ceil(k/8)) → OP-41 (ceil(f/8)) → book refetch
  (not awaited, `useCostBook.ts:168-176`): 3 requests, 2 waves. **≈ 4 writes waves + 2 refetch waves.**
- **Child save.** OP-38 → [OP-39 siblings ‖ OP-41] → refetch.
- **Delete head with k children.** OP-39 → OP-43 children (ceil(k/8)) → head → refetch. **3 waves + 2.**
- **Add Standard Contract.** (catalogue cached: no target read) OP-44 → OP-45 → head POST → rest (ceil(n/8)) → refetch book (+ OP-35
  on O&M, `useCostBook.ts:227-235`). **4–5 waves + 2.**

## PM A: Generators, Production, Revenues, Finance

Notation: T = WTG types, N = turbines of a type, L = AllWTG land-lease costs, I/S = inverter/substructure types.

##### Generators
**Initial load** (deep link, `prefetch` on; or first visit after warm-up).
- Wave 1 (prefetch or mount): project (1) + countries (0–1) + planning (1) + types (1) + PV catalogue (0–1) + PV types (1) + inverter types (1) + substructure types (1) + storage/hydrogen/substation (3) ≈ **10–12**.
- Wave 2: turbines ⌈T/40⌉, models ⌈G/40⌉, inverter suppliers ⌈I/40⌉, substructure suppliers ⌈S/40⌉ ≈ **4** for a typical project.
- Critical chain: types → turbines/models (2 waves); the list gate (`Screen.tsx:228-238`) waits for both. Total to first list ≈ 14–16 requests.
- Lazy on panel open: catalogue (≥1 page), price index, device costs, AllWTG costs (`loadGate.ts:58-68`).
- Row selection of a WTG/PV type: device types → active O&M check, **2 sequential reads** per newly selected type (`hooks.ts:288-299`), cached 30 s.
- Window focus after 30 s: ~14 queries refetch (OPT-18, deferred).

**Add WTG Type** (in country, flags as shipped), `Screen.tsx:786-863`:
- Job plan: type POST (wave 1) → N turbine POSTs (⌈N/16⌉ waves) → `then` (name from the POST response, no read, `Screen.tsx:834-837`) → one wave of [device-type POST + N·L allocation POSTs + roll-up PATCH] (⌈(N·L+2)/16⌉ waves).
- Requests = N + N·L + 3; waves = 1 + ⌈N/16⌉ + ⌈(N·L+2)/16⌉. Example N = 20, L = 2: **63 requests, 6 waves**.
- Out of country: + RequestModulePermission flow (sequential) between the two plans; no roll-up.
- Background reload (`reload.ts:113`): generators project (1) + types (1) + turbines under the old key (⌈T/40⌉) + turbines under the new key (⌈T/40⌉) + models new key (⌈G/40⌉) + active opex keys (0–2) ≈ **5–7**.
- Same save with `turbines` + `allocations` on: type (1) → CreateMultiple turbines (20 rows = 2 parallel chunks) → [device + roll-up] (2) → CreateMultiple allocations (40 rows = 4 parallel chunks) ≈ **9 requests, 4 waves**.

**Turbine save**: new turbine (relane): POST → one wave [type PATCH, roll-up PATCH, L allocations] = 3 + L requests, 2 waves. Edit: turbine PATCH → sibling group (k) → type PATCH → roll-up PATCH = 3 + k requests, 4 waves (`plans.ts:554-581`). Reload: turbines, types, project (+ opex) ≈ 4.

**Toggle status**: [type + N turbine PATCHes] (⌈(N+1)/16⌉ waves) → roll-up: N + 2 requests. N = 50: 52 requests, 5 waves. With `status` on: type → guard reads (2) → UpdateMultiple (1–5 chunks) → roll-up ≈ 5–9 requests.

**Delete WTG type** (`Screen.tsx:1165-1182`): [cancellation flow if `FlowRunId`] → Identify graph (3 waves: allocations + device types; counts + O&M heads; O&M members) → leaf delete group (16) → cascade group of LL costs (4) → type DELETE → roll-up PATCH. ≈ 3 read waves + 4 write waves; requests = reads (≈ 4–6) + allocations + O&M + LL costs + 2.

**Delete turbine**: allocation rows (1) → counts (1) → leaf → cascade → turbine DELETE → type PATCH → roll-up = 2 read waves + up to 5 write waves.

**Simple / inverter / substructure save**: row write → roll-up PATCH (2 waves, 2 requests) (+ flow for an Other Supplier). Reload: that family + project.

##### Production
- **Load**: project + yields (wave 1, 2 requests) → Fabric standard assumptions (wave 2, 1 SQL, 30 min). Edit panel: seasonality + negative prices (2).
- **Save yield** (`hooks.ts:204-226`): plan reads 4 in parallel (wave 1) → yield write (wave 2) → one 16-wide group [seasonality, K negative prices, R revenue syncs, superseded yields] → `then`: yields + project read (1 wave, 2) → roll-up PATCH. ≈ 4 + 1 + (1 + K + R) + 2 + 1 requests, 5 + ⌈(1+K+R)/16⌉ waves. Background reload: project + yields (2).
- **Generation** (once, when `shouldGenerate`): `loadGenerationInputs` wave A (3) → wave B (≈ 6 + chunks) → dependency waves of creates at **8 wide** → flags PATCH. Example: 2 LL contracts with AllWTG over 40 units = 80 allocations + periods + OPEX + O&M per device type; allocations alone ≈ 10 waves of 8. Second background reload: project + yields (2).

##### Revenues
- **Load**: wave 1 project (1, states cached) + contracts + balancing + negative-price check + subaccount (≈ 5) → wave 2 Fabric assumptions + currency + inflation (3). ≈ 8–9 requests, 2 waves.
- **Contract Save** (Edit, Individual, V stored, M new; `Screen.tsx:825-871`): volume ids (1) → contract PATCH (1) → V DELETEs (⌈V/16⌉ waves) → M POSTs (⌈M/16⌉ waves) → awaited reload contracts (1). V = M = 25: **53 requests, 6 waves** (incl. reload). Percentage hedge: overlap read beside the ids read (D146).
- **Balancing Save/Delete**: 1 write → reload balancing (1), awaited (the plugin computes dates).

##### Finance
- **Load**: wave 1 project (+cached states) + categories + inputs + repayments + step-ups + banks (SQL) + KfW (SQL) ≈ 7 → wave 2 debt assumptions (SQL) → visit seed job if needed (one group, `Screen.tsx:1098-1128`) → reload inputs (+project). Four Dataverse reads re-run on every visit (`EVERY_VISIT`, `hooks.ts:74`, D109).
- **Lazy**: CAPEX contracts → cost chunks (2 waves); turbine count: types → turbine chunks (2 waves).
- **Tranche Save** (Y repayments, S step-ups, D deletes; `Screen.tsx:1306-1316`): duplicate check (1) → tranche write (1) → one 16-wide group of Y + S + D → awaited reload inputs + repayments + step-ups (3). Y = 25, S = 4: **34 requests, 7 waves** (incl. reload) — this matches D137's "34" model. With `bulkSchedules` on: D137 models 11.

---

## PM B: boot, Project Overview, PM screens, Cluster Checklist

##### B.0 Boot

Order: `main.tsx:15` starts `startBootPrefetch` before React mounts. Then `Providers` → `SessionProvider` → `App`.

**Landing on `/` or `/projects` (Project Overview)**

| Wave | Requests | Notes |
|---|---|---|
| 0 | host `getContext()` (PB-OP-01); the Overview chunk download starts (`bootPrefetch.ts:135`) | Not Dataverse |
| 0′ | dynamic import of `project-main/queries` + `rules` (`bootPrefetch.ts:63-66`) | One chunk round trip before the reads, unless it is already cached |
| 1 | PB-OP-14 + PB-OP-15 (page 1 + probe) ‖ PB-OP-18 countries ‖ PB-OP-06 states ‖ PB-OP-02 env definitions ‖ PB-OP-07/08/09 user row, directory entry, country map | 8 requests |
| 2 | PB-OP-03 env values ‖ PB-OP-10/11 direct roles, teams | 3 |
| 3 | PB-OP-12 team roles | 1 (more with over 40 teams) |
| +1.5 s | PB-OP-17 next page (2) | Speculative |

- **About 14 requests, 3 Dataverse waves.**
- **Interactive** after wave 1: `App.tsx:75` blocks only on `loading`. On `/projects` that is `sessionQuery.isLoading` alone (`SessionContext.tsx:142-146`), and the grid then needs page 1.
- **Critical chain:** context → (chunk) → page 1 ‖ probe.

**Deep link `/project/<screen>?projectId=` (any PM screen except General Data and Generators)**

| Wave | Requests |
|---|---|
| 0 | context; the screen chunk is preloaded (`bootPrefetch.ts:111`) |
| 1 | PB-OP-04 session project (prefetched with `scope "pm"`, `bootPrefetch.ts:44-46`) ‖ env definitions ‖ user row, directory entry, country map |
| 2 | env values ‖ roles, teams. **`ProjectScreenGate` opens** once PB-OP-04 has answered (`routes.tsx:130-149`; `App.tsx:75` blocks on `Boolean(projectId) && projectQuery.isLoading`) |
| 3 | team roles ‖ **the screen's first reads** (they were not prefetched: PB-03 below) |
| 4+ | the screen's dependent reads |
| +1.5 s after the screen | PB-OP-13 Generators warm-up, 10 reads |

- **Critical chain:** context → session project → gate → screen reads → dependent reads.
- **General Data deep link:** the screen's reads are prefetched in wave 1 (`bootPrefetch.ts:79-101`): row, countries, states, shareholders, trackings; then areas and utilizations once the row has answered. Wave 3 above therefore holds only Entra people and the map token.

**A new tab.** "Edit Project" and "Edit Costs" open new tabs (`project-main/Screen.tsx:684-728`). Each tab pays the whole boot again: env vars 2 waves, the user chain 3 waves, and every reference list. See PB-04.

##### B.1 Project Overview

- **Initial load:** 4 requests from the boot prefetch (page, probe, countries, states), then 2 (the next page) after 1.5 s.
- **Interactions:**
  - **Next or Previous:** 2 requests (the cached token reaches the page; no recount). Taken from the cache when the prefetch has landed.
  - **Filter or sort:** a new signature, so a new walk: 2 requests with `count`.
  - **Deep link `?p=N` with no tokens yet:** walks N-1 pages one after another. The cap is 100 (`client.ts:216`). The D41-D46 invariants keep this as it is.
  - **Keyword:** debounced 350 ms. **Capacity:** debounced 300 ms (`hooks.ts:130-132`).
  - **Selecting a row:** PB-OP-22, usually 0 requests (taken from the shared states list).
  - **Simulate:** PB-OP-23 ‖ PB-OP-22, then a new tab.
- **Delete:** an optimistic patch of the page on screen; PB-OP-24; then every `projectPage` key is invalidated (the active one refetches: 2 requests) and the token cache is dropped (`projects.ts:484`).
- **Focus after 30 s:** 2 requests (page and probe). The lists have a 30-minute `staleTime`, so they do not refetch.

##### B.2 General Data

- **Initial load (in-app):**
  - **Wave 1** (6 parallel): PB-OP-25, 26, 06, 29, 30, and PB-OP-28 under the `""` key until the country is known.
  - **Wave 2:** PB-OP-27 (areas), PB-OP-28 (country), PB-OP-35 (the two Entra lookups), PB-OP-33 (maybe), PB-OP-43 (cached).
  - About 9-11 requests, 2 waves. Countries and states come from the cache when the Overview loaded them under the same key: states yes, **countries no** (a different key: PB-06).
- **Interactions:**
  - The municipality box sends 1 request per keystroke (PB-OP-31/32, DEC-6).
  - The manager search is debounced 250 ms.
- **Save (edit):**
  - Head: PATCH ×1-2.
  - Optionally, the gate-cancel path: gates + Entra + the flow.
  - Tail, sequential: on a start-cluster change, 1 project PATCH + about 7 tracking upserts; M shareholder upserts when the list changed; and the Draft tracking create when it is missing.
  - Then the awaited reload of 4 keys (`general-data/reload.ts:17`): the GD row, shareholders, trackings, and `qk.project` (the session row, 1 request).
  - **Worst case, a start-cluster change with 3 shareholders:** 2 + (gates 1 + Entra k + flow 1) + 1 + 7 + 3 + reload 4 ≈ **19-20 requests, about 17 sequential waves** (code-derived).
- **Save (new project):** create → re-read → follow-ups `concurrent` (`rules.ts:2089-2095`) → reload.

##### B.3 Milestones

- **Initial load:**
  - **Wave 1:** PB-OP-44 (+ PB-OP-26 through `fetchQuery`), PB-OP-06, PB-OP-46, PB-OP-47 (1 request, or 2 with the job type cold).
  - **Wave 2:** PB-OP-45; PB-OP-48 when the seed would run.
  - **Wave 3:** PB-OP-49 (3 parallel).
  - About 6-10 requests, 3 waves.
- **Save:**
  - Reads in parallel: PB-OP-50 (3 + ⌈g/40⌉ sequential requests, only when the FID moved) ‖ PB-OP-48 fresh + PB-OP-49 (cached).
  - Writes, sequential: PATCH project → N × PATCH generator type → PATCH project (plant cost) → POST revenue (the seed).
  - Reload of 6 keys (`milestones/hooks.ts:286-288`). The active ones: the milestone project, the session row, the recalculation flag, the revenue count; that is 4-5 requests.
  - **FID moved, 3 generator types:** about 4 + 6 + 5 ≈ **15 requests, about 10 waves**.
- **Server side:** every save writes `vsb_operationsstartdatecod`, `vsb_construction` and `vsb_enddate`, so the plugin steps run on every save (`milestones/hooks.ts:10-16`).

##### B.4 Team

- **Initial load:**
  - **Wave 1:** PB-OP-52 row ‖ PB-OP-53 members ‖ PB-OP-54 descriptions.
  - **Wave 2:** Entra for the manager and deputy, and for each member (cached 30 min, 6 wide).
  - Cold, a team of 10: about 3 + 12 = 15 requests, 2 waves (the Entra wave is `⌈people / 6⌉` deep). Warm: 3 requests.
- **Save / Delete:** 1 write, then a reload of the members only (`team/reload.ts`): 1 request + Entra for any new person.

##### B.5 Planning

- **Initial load:**
  - **Wave 1:** PB-OP-56 ‖ PB-OP-57 ‖ PB-OP-59.
  - **Wave 2:** PB-OP-58 (needs the row id) ‖ PB-OP-60 (needs the types) ‖ PB-OP-61 ×2 (needs the project's country).
  - About 7 requests, 2 waves (OPT-16 done).
- **First visit:** + 1 POST (planning row) + 1 GET; + N POST (acquisition statuses) + 1 GET. All of it runs **inside query functions** (PB-05).
- **Saves:** 1 write per job + the per-kind reload (1-2 requests).

##### B.6 Grid Operator

- **Initial load:** PB-OP-63 ‖ PB-OP-64: 2 requests, 1 wave.
- **Save:** 1 write + 1 reload.
- Coming from Planning: PB-OP-63 re-reads the very row PB-OP-56 holds, under another key (PB-10).

##### B.7 Cluster Check List (usual visit, every switch as shipped)

| Wave | Requests | Gate |
|---|---|---|
| 1 | PB-OP-66 project ‖ PB-OP-67 trackings ‖ PB-OP-06 states (0 when shared) | — |
| 2 | PB-OP-68 gates (0 when cached) ‖ PB-OP-69 rows (`earlyRows`) ‖ PB-OP-72 trackings + count (`earlyVisit`) | the loader waits for the gates |
| 3 | Entra for the gate PMs (0 when cached) ‖ PB-OP-70 approval settings | — |
| 4 | Entra for the approval PMs (0 when cached) | row actions wait for the settings (C1) |
| +1.5 s | PB-OP-13, 10 Generators reads | — |

- **About 6-10 Check List requests + 10 warm-up reads, 2-4 waves.**
- **First visit of an empty cluster:** + PB-OP-73 (scope id, memoised, + templates) + ⌈N/16⌉ waves of PB-OP-74 + the reload (rows and approvals).
- **Row action:** GET + PATCH + rows reload = 3 requests (`targetedReload`).
- **Move:** GET ×2 ‖ warm-up (count + templates); then GET+PATCH, GET+PATCH, POST, PATCH; then the reload of the 9 `checklistWriteKeys` (`hooks.ts:131-135`): 5 active checklist keys + the session row, about 6 requests. **About 14-16 requests, about 9 waves.**
- **Request Approval (cluster mode):** GET, GET+PATCH, flow (up to 120 s), up to 20 polls at 1.5 s for an Only-Notifications gate, GET rows, POST note, then the reload.

##### B.8 Navigation between PM screens (same tab)

- The session project is cached for 5 min (`SessionContext.tsx:76`), so the gate does not wait for it.
- Each screen's own queries use the 30 s default: going back to a screen visited more than 30 s ago reads all of them again (the canvas `OnVisible` re-read, kept on purpose).
- The Generators warm-up runs once per project per page load.

##### B.9 Focus refetch per screen (active and stale queries only; OPT-18 / DEC-3 kept on purpose)

| Screen | Requests per window focus |
|---|---|
| Overview | 2 |
| General Data | 3 (+1 for the session row after 5 min) |
| Milestones | 3-4 |
| Team | 2 (+ descriptions after 5 min) |
| Planning | 4 |
| Grid Operator | 2 |
| Check List | 3 (+ history while a panel is open). The reference reads are quiet (`hooks.ts:173,237`) |

Every PM screen also refetches the session project once it is older than 5 min (1 request). The host-level session and current-user reads never refetch (`staleTime: Infinity`). The environment variables refetch after 15 min (2 requests in sequence).

---

## Admin screens and the shared write engine

Notation: a *wave* = requests that can be in flight together; the next wave waits for the previous one. `fA` reads count as 1 request when the table fits one 500-row page.

##### Write engine — generic execution sequence (`executePlan.ts:443-626`)

1. `refusedReason` → throw `PlanRefusedError`, nothing sent (`:449`).
2. `assertPlanShape` (`:452`, bulk/hardened misuse throws before send); D158 owner-bind check over the whole plan (`:454-457`).
3. Loop over writes in plan order (`:512`):
   - **bulk step** (`createMany`/`updateMany`): one step through the bulk backend; page tokens invalidated; on failure → `PlanError` with `done` in rows, `landed`, `maybeLanded` (`:514-544`).
   - **sequential write** (`:545-567`): `sendWrite` → 1 request (2 for guarded); creates push the returned id; a delete pushes `deleted`; then `confirmDeletes` for hardened deletes; any throw → `PlanError(done, total, …)` and **nothing after it is sent**.
   - **concurrent run** (`:568-623`): consecutive writes of one `together()` group with equal limit; gate of `limit` (default 8), `serialKey` chains outside the gate; `Promise.allSettled`; `stopOnFailure` stops new starts; read-back; first failure → `PlanError` with every failure (`failures`).
4. `invalidatePageTokens(entitySet)` only after the server accepted a write (`:326, 346, 358, 369, 379, 417, 428`).
5. Return `{ done, createdIds, createdRows, landed, deleted, maybeLanded: [] }`.

Requests per write: create 1, plain update 1, guarded update 2 (sequential), plain delete 1, hardened delete 1–3 (+ read-back ⌈n/40⌉ per entity set, 4 wide). No retry for create/update; no timeout anywhere (SDK has none either); mutations are never retried (`Providers.tsx:31`).
`runPlan` (`runPlan.ts:215-226`) adds no request: it rethrows `PlanError.cause`. `usePlanWrite` (`usePlanWrite.ts:183-215`) adds the `invalidate` refetches in `onSettled`, awaited unless `refresh: "background"`.

**Admin use of the engine:** every admin plan is a single write (`singleWrite` in each `rules.ts`; grep shows no `together()`, `hardenedDelete()` or bulk step under `features/admin`). Multi-request admin flows bypass the engine and live in `data/admin*.ts` (D36 §3).

##### CAPEX Accounts

- **Initial load:** wave 1 = tree (AD-OP-10, 1 req) + current user / countries (boot, other auditor). Wave 2 = nothing until an account is expanded.
- **Expand account with S subaccounts:** S `hasContracts` reads at once (AD-OP-11), no concurrency cap (`useQueries`). Expanding k accounts accumulates ΣS queries, all refetched on a focus after 30 s.
- **Window focus:** tree always (stale at 0 ms) + every check older than 30 s.
- **Create:** wave 1: number check ‖ order read (2); wave 2: POST (1); wave 3: existence GET (1); wave 4: PATCH Inactive (1); then the tree refetch (1, awaited by `useCapexWrite` `onSettled`). **6 requests, 5 waves.**
- **Rename / Activate:** G+P (2, 2 waves) + tree refetch (1). **3 requests, 3 waves.**
- **Reorder n changed rows:** 2n at 8 wide (⌈n/8⌉×2 waves) + tree (1).
- **Delete subaccount:** contract check (1) → DELETE (1) → tree (1). **Delete account:** 2 guard reads ‖ → DELETE → tree: 4 requests, 3 waves.
- **Deactivate account with S subaccounts** (under overlay): child list (1) → account G+P (2) → S subaccounts G+P at 8 wide (2S) → tree refetch (1). **2S+4 requests**, about 4 + 2⌈S/8⌉ waves.
- **Background clean-up** (`Screen.tsx:216-227`) for 1+S accounts, C contracts, Z current-year rows to zero, D later-year rows to delete:
  contract reads ⌈(1+S)/40⌉ (4 wide) → cost reads 2⌈C/40⌉ (8 in flight) → zero 2Z (8 wide) ‖ delete D (16 wide) → toast → tree refetch (1).
  **Total ≈ ⌈(1+S)/40⌉ + 2⌈C/40⌉ + 2Z + D + 1 requests; peak 24 writes in flight** (`adminCapexAccounts.ts:375-378`).
  *Illustrative only (inputs are hypothetical, not measured):* C = 300 contracts, 6 future months each → Z = 1,800 → 3,600 zero requests; 10 later years × 12 months → D = 36,000 deletes. The D-term dominates and scales with the forecast horizon of the projects.

##### Milestones

- **Load:** countries (shared, 30 min) ‖ assumptions (1). 1 wave.
- **Save n changed rows:** 2n at 8 wide, every row attempted; then 4 invalidation keys, of which only the assumptions query is mounted → 1 refetch. **2n+1.**

##### Costs

- **Load:** wave 1 = countries (shared) + hierarchy + LL subaccounts + OPEX subaccounts + OPEX accounts + currencies + payer defaults (**6 own requests**, 30 min each). Wave 2 (after a scope is picked) = DEVEX + OPEX + inactive OPEX (**3**), + inflation areas for Italy (1).
- **Focus after 30 s:** the 3 scope reads.
- **DEVEX save:** create 1 / update 2 → invalidation: devex(scope) refetch (1) + project standards prefix (unmounted, mark only). **2–3.**
- **DEVEX delete:** 1 DELETE (server plugin deletes project CAPEX contracts and costs synchronously) + 1 refetch.
- **OPEX new contract:** contract read (1) → POST (1) → refetch OPEX + inactive (2). **4, 3 waves.**
- **OPEX add period:** read (1) → POST (1) → flag fix for the old tail G+P (2, sequential) → refetch (2). **6, 5 waves.**
- **OPEX edit, period ≠ 1:** G+P (2) → re-read (1) → flags (normally 0) → refetch (2). **5, 4 waves.**
- **OPEX edit Period 1 with k later periods:** G+P (2) → re-read (1) → 2k at 8 wide → flags (0) → refetch (2). **2k+5** (k = 9 → 23 requests, about 7 waves).
- **OPEX delete contract (m ≤ 10 rows):** read (1) → m DELETEs one by one → refetch (2). **m+3, m+2 waves** (deliberate, keeps periods contiguous).
- **OPEX delete last period:** read (1) → DELETE (1) → re-read (1) → new-tail flag G+P (2) → refetch (2). **7, 6 waves.**

##### Contracts

- **Load:** countries (shared) ‖ chart (memo); after selection: list ‖ DevCo (2).
- **Edit open:** record GET ‖ DevCo refetch (2).
- **Save (update) with R removals, A additions:** DevCo ownership read (1) → parent G+P (2) → R DELETEs (16 wide) → A POSTs (8 wide) → invalidation: list + DevCo refetch (2; record/bop keys unmounted). **R+A+5**, ≥ 5 waves. Create: R = 0, parent 1 → **A+4**.
- DevCo rows of the scope are read **3 times within one edit** (open, save re-check, post-save refetch) — the save re-check is the deliberate ownership guard.
- **Delete:** 1 DELETE (plugin cascades) + 2 refetches.

##### Check List Settings

- **Load:** tabs (1) ‖ states (shared, 30 min) ‖ locks (1, environment-wide, every mount) → tasks of the first tab (1). **3 own requests, 2 waves.** Tab switch: 1 (cached 30 s).
- **Add task:** POST (1) → G+P status (2) → tasks refetch (1). **4, 4 waves; the sync flow runs on the create and on the update.**
- **Edit / Active toggle:** G+P (2) → tasks refetch (1). **Completion toggle:** G+P (2) → tasks ‖ locks (2).
- **Reorder n changed rows:** 2n at 4 wide → tasks (1). Each PATCH triggers one sync-flow run (§E).
- **Delete task at position p in a group of g:** G+P soft delete (2) → renumber g−p rows 2(g−p) at 4 wide → tasks (1). E.g. first of 30 → 2 + 58 + 1 = **61 requests and 30 flow runs.**

##### Project Gates

- **Load / reload of one (country, technology):** wave 1 = templates ‖ header (2); wave 2 = tasks (1) ‖ template PM names ⌈p/15⌉; wave 3 = approvals ⌈n/40⌉ (4 wide); wave 4 = remaining PM names (normally 0). For n = 100–250 tasks: **≈ 6–10 requests, 3–4 waves** (people reused on reload).
- **Active pill:** optimistic flip → G+P (2) → full dataset reload (≈ 6–10). **≈ 8–12 requests per click**; the pill stays "pending" until the reload ends (`Screen.tsx:303-305`, `hooks.ts:102`).
- **Save / Reset / Delete:** 1–2 + full reload.
- **Focus after 30 s:** full reload (no `staleTime` override, `hooks.ts:44-48`).

---

