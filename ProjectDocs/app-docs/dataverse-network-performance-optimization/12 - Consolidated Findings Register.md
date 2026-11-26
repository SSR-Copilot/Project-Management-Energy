# 12 - Consolidated Findings Register

> Stage 1 audit, 25 Nov 2026. Branch `feature/dataverse-network-performance-optimization`, from `origin/RounakDev1` at `30afece`. Investigation only: no application source file was changed. Every request count is **code-derived**, not measured. 

**83 findings** from five read-only audits: P0: 3, P1: 15, P2: 28, P3: 37.

Priorities: P0 correctness, security, data integrity or reliability; P1 high performance or scale impact; P2 medium; P3 low. Priorities and confidence are the auditors' own; the orchestrator re-read the code for the items marked in the last column. A finding that would change behaviour is marked "needs product decision" in its block.

| ID | Pri | Conf | Areas | Screen | Title | Detail doc | Check |
|---|---|---|---|---|---|---|---|
| AD-01 | P0 | High | reliability, bulk, concurrency | CAPEX Accounts | CAPEX clean-up: thousands of un-retried per-row writes, fail-fast, no resume path | 11, 05, 10 | verified |
| CB-01 | P0 | High | reliability | Land Lease, OPEX | Land Lease and OPEX updates are unguarded upserts: a row another user deleted is re-created, often as an orphan | 11 | verified |
| CB-02 | P0 | High | reliability | Land Lease, OPEX | A partly failed Cost period write leaves the cache stale, and the retry runs from it (Land Lease import can duplicate a standard contract) | 11 |  |
| AD-02 | P1 | High | network, bulk | CAPEX Accounts | CAPEX clean-up request volume: 2 requests per zeroed row, 1 per deleted row (re-raise OPT-22 / D36 §1 with new evidence) | 04, 05 |  |
| AD-03 | P1 | High | network, concurrency, caching | CAPEX Accounts | `hasContracts` fan-out: one uncapped query per visible subaccount, refetched on focus, retried without Retry-After | 04, 10, 09 |  |
| CA-01 | P1 | High | reliability | Add Cost from Table, CAPEX Add/Edit panel | Add Cost and CAPEX panel writes (and their verify reads) are never retried on 429 / 503 | 11 |  |
| CA-02 | P1 | Medium | reliability | Add Cost, CAPEX panel, and every Cost screen (shared lock) | No client-side deadline on any request: a hung call freezes the save, the gate, the CA-15 lock and the pending-delete registry | 11 |  |
| CA-03 | P1 | High | transaction, reliability | Add Cost from Table | Deferred deletes are not protected against closing or reloading the tab (live flags) | 08, 11 |  |
| CA-04 | P1 | Medium | network, query | CAPEX tab, Summary, Add Cost, comments | Id-list fan-out uses 40 ids per request in an `or` chain; larger chunks or the `In` function would cut request counts several-fold (new evidence for the deferred OPT-09 family) | 04, 06 |  |
| CA-05 | P1 | Medium | network, caching | CAPEX/DEVEX tab | A paid toggle, a panel save or a panel delete reloads the WHOLE category book, and the spinner waits for it | 04, 09 |  |
| CB-03 | P1 | High | reliability | Land Lease, OPEX | Land Lease and OPEX deletes treat "already gone" (404) as a failure | 11 |  |
| CB-04 | P1 | Medium | transaction | Land Lease | Land Lease contract delete sends every child delete although the header delete cascades them (and would be atomic) | 08 |  |
| OR-01 | P1 | High | reliability, concurrency | All screens (shared retry layer) | `Retry-After` can never be read: the SDK error has no headers, so every Retry-After branch is dead code and a 503 is never retried | 11, 10 |  |
| PA-01 | P1 | High | bulk | Generators | Generators bulk switches all off: the largest remaining write volume (re-raised OPT-21 with counts and an evaluation) | 05 |  |
| PA-02 | P1 | High | reliability, transaction | Finance | Finance `bulkSchedules` relies on a bulk backend that Finance never registers (latent partial save) | 11, 08 | qualified |
| PB-01 | P1 | High | reliability | Cluster Check List (also General Data's cancellation path) | Flow steps: an ambiguous or failed flow call can send a duplicate approval, or leave a task with no way forward | 11 |  |
| PB-02 | P1 | Medium | query, correctness | General Data | Municipality search can be cut short with no warning (OPT-19 part 1: the verification is still owed) | 06 |  |
| WE-02 | P1 | High | reliability, concurrency |  | No retry of any single-row create/update/delete on 429 / 503+Retry-After (engine and admin loops) | 11, 10 |  |
| AD-04 | P2 | High | caching, network | CAPEX Accounts | CAPEX tree is stale at 0 ms: every window focus re-reads the whole account table | 09, 04 |  |
| AD-05 | P2 | High | reliability | CAPEX Accounts (clean-up, deletes), Costs (OPEX contract / p | Admin per-row deletes treat 404 ("already gone") as a failure | 11 |  |
| AD-06 | P2 | High | network, caching | Project Gates | Project Gates: every Active-pill click reloads the whole dataset chain (3–4 waves); overlapping clicks run overlapping reloads | 04, 09 |  |
| AD-07 | P2 | High | network, server | Check List Settings | Check List Settings: each order PATCH fires a server flow; delete-with-renumber = 2 requests and 1 flow run per later row | 04 |  |
| CA-06 | P2 | High | concurrency, network | Add Cost from Table -> CAPEX | After an Add Cost Save the app refetches the Summary totals of the whole project (not displayed) and the category book, twice, in a burst beside the deferred deletes | 10, 04 |  |
| CA-07 | P2 | Medium | transaction | CAPEX panel | CAPEX panel Add/Edit has no compensation after a partial failure, and its Add create is not idempotent | 08 |  |
| CA-08 | P2 | High | caching, network | CAPEX tab, Add Cost | The SPV/DevCo mapping table is read on every CAPEX book load and every sheet load, with no cache | 09, 04 |  |
| CA-09 | P2 | Medium | network | CAPEX tab | The comment dots wait one extra wave: comments start only after the payments have returned | 04 |  |
| CA-10 | P2 | High | caching | CAPEX tab, Summary, comments | The heavy CAPEX reads refetch on every window focus after 30 s (re-raise of OPT-18 with scoped evidence) | 09 |  |
| CA-11 | P2 | Medium | reliability | CAPEX tab, Summary, Add Cost | The three main Cost reads have `retry: false`, so one transient 5xx/429 shows "Cost data is unavailable" | 11 |  |
| CA-13 | P2 | Medium | query | CAPEX Summary | The Summary tab reads every cost row of the project to produce five numbers (no server-side aggregate) | 06 |  |
| CA-14 | P2 | Medium | bulk, transaction | CAPEX Delete line | CAPEX panel Delete: four sequential phases of per-row deletes (re-raise of OPT-23 with new evidence) | 05, 08 |  |
| CB-05 | P2 | Medium | query | Contracts, Land Lease | The second load wave on Contracts and Land Lease could go, through single-valued navigation filters | 06 |  |
| CB-06 | P2 | Medium | bulk | Land Lease | Land Lease allocation writes are single-row loops; `CreateMultiple` / `UpdateMultiple` fit them | 05 |  |
| CB-14 | P2 | Medium | reliability | Contracts, Land Lease, OPEX | Header creates have no idempotency: an ambiguous failure plus a retry duplicates the row | 11 |  |
| PA-03 | P2 | High | payload, network | Finance | Finance tranche Save rewrites every repayment and step-up row, changed or not | 07, 04 |  |
| PA-04 | P2 | Medium | network, server-side | Generators | Every Generators save writes the plant roll-up, which fires `LoadDevexCapexCostTotalCapacityTrigger` even when the totals did not change | 04 |  |
| PA-05 | P2 | High | network | Generators | Delete / replace: the permission-cancellation flow and the Identify reads run one after the other although they are independent | 04 |  |
| PA-06 | P2 | High | bulk, payload | Revenues | Revenues Save deletes every stored hedge volume and re-creates every volume | 05, 07 |  |
| PA-07 | P2 | High | bulk, concurrency | Production | Production one-shot generation: creates go out 8 wide, allocations one POST each | 05, 10 |  |
| PA-14 | P2 | High | transaction, reliability | Generators (Production re-reads, Finance has no roll-up) | Roll-ups are computed from the screen's snapshot, not from the server (lost update across users and tabs) | 08, 11 |  |
| PB-03 | P2 | High | network, query | Milestones, Team, Planning, Grid Operator, Check List (and P | The PM deep-link boot prefetch starts only the session project; the screen's own first reads wait for the gate | 04, 06 |  |
| PB-04 | P2 | High | caching, network | Project Overview, then any PM or Cost screen | "Edit Project" and "Edit Costs" open a new tab that pays the whole cold boot again | 09, 04 |  |
| PB-05 | P2 | High | reliability, transaction | Planning | Planning writes rows from inside query functions | 11, 08 |  |
| PB-11 | P2 | High | concurrency, bulk | General Data | General Data edit save: tracking rebuild and shareholder writes go one at a time, while the create path sends them together | 10, 05 |  |
| WE-01 | P2 | High | reliability, network |  | Deterministic failures are classified as retryable: a `fetchAll` cap failure is re-walked twice more | 11, 04 |  |
| WE-03 | P2 | High | concurrency |  | Per-pool limits only: concurrent pools and plans add up with no global write ceiling | 10 |  |
| WE-04 | P2 | Medium | reliability, transaction |  | Creates are not idempotent: an ambiguous failure plus a user retry can duplicate a row | 11, 08 |  |
| AD-08 | P3 | High | network | CAPEX Accounts, Check List Settings | Redundant existence GET right after a create (create-then-update pairs) | 04 |  |
| AD-09 | P3 | High | caching, query | Costs | Costs settings: three scope reads refetch on every focus; OPEX rows read twice per scope | 09, 06 |  |
| AD-10 | P3 | High | payload, network | Costs | Period-1 edit propagates to every later period even when nothing changed (deferred S6-07, recorded for completeness) | 07, 04 |  |
| AD-11 | P3 | Medium | caching | Costs (DEVEX delete), Contracts (delete) | Plugin-cascading deletes do not invalidate the project caches they change | 09 |  |
| AD-12 | P3 | High | query, caching | CAPEX Accounts, Costs, Contracts | Same table, three admin reads (OPT-07c residual) | 06, 09 |  |
| CA-12 | P3 | Medium | payload | CAPEX panel | A CAPEX Edit sends the whole contract column bag, including the unchanged Linked Cluster bind | 07 |  |
| CA-15 | P3 | Medium | network | Comments panel | Comments panel Save is a chain of single awaits; the deletes could overlap | 04 |  |
| CA-16 | P3 | Medium | query | CAPEX tab | The active-WTG count is read for every CAPEX tab although only standard contracts need it, and it selects an unused column | 06 |  |
| CA-17 | P3 | High | concurrency | Add Cost Save (retry path, 501 path) | Verify reads are ungated and can pass the 52-per-user limit beside gated writes (re-raise of the D75 review-low item) | 10 |  |
| CB-07 | P3 | High | concurrency | Land Lease | Land Lease tiering still serialises independent period writes (followers, period deletes, import periods) | 10 |  |
| CB-08 | P3 | High | caching | OPEX | The OPEX book re-reads `vsb_opexsubaccounts` on every load while the screen holds the catalogue | 09 |  |
| CB-09 | P3 | High | network | OPEX | Independent sequential awaits in the OPEX writes | 04 |  |
| CB-10 | P3 | Medium | bulk | OPEX | OPEX cascade and re-chain PATCH loops could be one `UpdateMultiple` | 05 |  |
| CB-11 | P3 | High | network | Contracts | A Contracts edit save reads the contract's links only after the contract PATCH | 04 |  |
| CB-12 | P3 | High | caching | Contracts | Contracts: id-set query keys make a create or delete read the payment targets and links twice | 09 |  |
| CB-13 | P3 | High | query | Contracts | The two BoP standard-assumption reads could be one request | 06 |  |
| CB-15 | P3 | High | caching | Land Lease | Every Land Lease write reloads the whole book, reference rows included, before the save resolves | 09 |  |
| PA-08 | P3 | High | caching | Production | Production reload re-reads data the save has just read (twice when generation runs) | 09 |  |
| PA-09 | P3 | High | caching, network | Generators | Type add / delete / replace refetches the turbines twice (old key, then new key) | 09, 04 |  |
| PA-10 | P3 | High | query, caching |  | Generator-type reads for ids only select 12–14 columns; Finance re-reads a list the warm-up has just cached | 06, 09 |  |
| PA-11 | P3 | Medium | caching, network |  | The Generators warm-up sends 10–13 reads from every PM screen, whether or not Generators is visited | 09, 04 |  |
| PA-12 | P3 | Medium | caching, security | Generators | Persisted catalogue (off): key not scoped by environment or user | 09 |  |
| PA-13 | P3 | Medium | bulk | Generators, Finance | Bulk `updateMany` always pays a guard read, even where `UpdateMultiple` itself would refuse a missing id | 05 |  |
| PA-15 | P3 | High | network | Generators | A selected type's O&M guard is 2 sequential reads per selection | 04 |  |
| PB-06 | P3 | High | caching, query | boot, Overview, General Data, Milestones, the Generators war | `vsb_countries` is read under four keys with four selects (the rest of OPT-07a; D119 §4(a) still open) | 09, 06 |  |
| PB-07 | P3 | Medium | network | boot (header badge, admin rail, General Data country scope,  | The current-user chain can lose a wave: filter roles and teams by the Entra id, not by the user row's id | 04 |  |
| PB-08 | P3 | Medium | network | boot | The environment variables take two sequential reads; the console gate and click-time flows wait for them | 04 |  |
| PB-09 | P3 | High | network, caching | every PM screen except Generators | The Generators warm-up runs 10 speculative reads on every PM screen, and most of them go stale before they are used | 04, 09 |  |
| PB-10 | P3 | High | caching, query | Planning, Grid Operator (and every PM screen) | Project-row reads: Planning and Grid Operator share a loader but not a key; each PM screen re-reads `vsb_projects` with its own select | 09, 06 |  |
| PB-12 | P3 | High | concurrency | Milestones | Milestones FID re-pricing: generator-type updates and price-ladder reads run in sequence | 10 |  |
| PB-13 | P3 | High | network | Cluster Check List | Check List: the trackings are read twice on every cluster visit | 04 |  |
| PB-14 | P3 | High | reliability, payload | Cluster Check List | Check List back-fill: up to 7 sequential, unguarded upserts; an update can bring a deleted tracking back without its project or owner | 11, 07 |  |
| PB-15 | P3 | High | caching | General Data | The General Data gate-cancellation path re-reads gates and Entra that the Check List has cached | 09 |  |
| PB-16 | P3 | High | caching | General Data, Team, Check List | Three separate Entra person caches for the same `aadusers` lookups | 09 |  |
| WE-05 | P3 | High | reliability |  | No request timeout anywhere; a hard retry wait holds a gate slot | 11 |  |
| WE-06 | P3 | High | reliability |  | Engine shape gaps that a plan bug would turn into a bad request | 11 |  |
| WE-07 | P3 | High | reliability |  | `usePlanWrite` permission message is not found inside a `PlanError` (pinned on purpose) | 11 |  |

## Orchestrator verification notes

- **CB-01**: VERIFIED by orchestrator: `landLease.ts:425-450` and `periodWrites.ts:478-502` call the generated `update()` directly, no existence check.
- **AD-01**: VERIFIED by orchestrator: `adminCapexAccounts.ts` runs the clean-up through `forEachLimit` (first failure stops it), deletes through `deleteRecord` without `withDeleteRetry`; `zeroCostsFilter` selects only rows not yet zero, so a rerun is safe.
- **PA-02**: QUALIFIED by orchestrator: `financeBulk.ts` registers tables only; the default backend is registered by `generators.ts:53` and `checklistBulk.ts:23`, but `finance.ts:219` lazily imports `./generators`, which would register it if that path runs first. Dormant (flag off); confidence Medium until the load order is tested.

## Cross-cutting themes (orchestrator synthesis)

- **Retry on throttling is missing for single-row writes and for bulk writes outside Generators**: CA-01, WE-02, AD-01 (and AD-03 on reads). The retry rules exist in `data/retry.ts` but are used by `generatorsBulk`, `executePlan` bulk steps and hardened deletes only.
- **No request deadline anywhere**: CA-02, WE-05, PB-01. A hung call holds gate slots, locks and (for flows) leaves approvals in an unknown state.
- **Unguarded upserts**: CB-01 (Land Lease, OPEX), PB-14 (Check List back-fill); Contracts and the plan engine already guard (`updateRecordIfExists`).
- **Stale cache after a partial failure**: CB-02, AD-11.
- **Ambiguous create outcomes can duplicate rows**: WE-04, CB-14, PB-05, CA-07.
- **Platform ceiling**: the SDK has no `$batch`/changeset, `$expand`, FetchXML or aggregates (doc 01 §4). Only `CreateMultiple`/`UpdateMultiple`/`UpsertMultiple` batch writes; reads cannot be joined. Proposals that need more are marked "needs a Dataverse custom API".

## Appendix F - already addressed (verified in code by the auditors; not re-reported)

### Cost A: CAPEX/DEVEX, Add Cost from Table, shared costing layer

| Item | Decision | File:line |
|---|---|---|
| Payer defaults read off the critical chain (starts with the chart) | OPT-05 | `data/costBook.ts:1162-1164,1171-1173` |
| One shared CAPEX chart read, 30 s memo, in-flight sharing | OPT-07c | `data/capexChart.ts:27,35-42` |
| One shared Project States cache entry for cluster names | OPT-07d, D159 | `features/cost/costing/useCostBook.ts:93-98`; `data/costBook.ts:944-947` |
| Cost-row reads page at 5,000 | OPT-08a | `data/costBook.ts:1054,1220`; `data/addCostSheet.ts:224` |
| Standard assumptions filtered server-side by sub-account | OPT-08b | `data/standardContracts.ts:30-42` |
| Invalidation narrowed per write job | OPT-12 | `features/cost/costing/capexInvalidation.ts:48-62`; `useCostBook.ts:448-460` |
| Comment key memoised, grid inputs memoised | OPT-25 | `features/cost/costing/useCostBook.ts:839-842`; `capex-costs/Screen.tsx:237,406` |
| Add Cost bulk save: concurrent graph, deferred deletes, 404-as-gone with read-back | D51 sections 2, 11 | `data/addCostSheetBulk.ts` module note; `data/addCostSheet.ts:320,338,1252-1264,1290` |
| Stable ids across retries; verify on retry, skipped on a first attempt | D51 sections 3a, 11.12 | `data/addCostSheet.ts:774-782` |
| Per-action 501 fallback, remembered per tab | D51 section 11 | `data/bulkSend.ts:300-337,577-605` |
| Own delete gates so cascades never hold write slots | D51 section 11.15 | `data/bulkSend.ts:389-407` |
| Changed-columns-only contract UPDATE (Add Cost) | WS-D, D75 | `features/cost/add-costs-from-table/savePlan.ts:143` |
| Pending deletes hidden from every CAPEX read | D51 section 11.19 | `data/pendingDeletes.ts`; `useCostBook.ts:88-101,421` |
| Book patched from the Save result (no wait for the reload) | D51 section 11.19 | `useCostBook.ts:645-662`; `savedSheetPatch.ts` |
| CAPEX panel bulk save, unchanged months skipped | D56 | `data/capexWrites.ts:146-153,693-760` |
| Delete failures surface (never swallowed) | rule 14, CA-18 | `data/capexWrites.ts:622,829,865`; `data/comments.ts:229-231` |
| fetchAll fails instead of truncating at 50 pages | D157 | `data/client.ts:86-97` |
| Write lock across screens | CA-15 | `features/cost/costing/useCostWriteFlight.ts:24-26` |
| Sheet is not refetched on focus or reconnect (it would drop edits) | D58 area | `useCostBook.ts:553-559` |
| Only the active category is read; the Summary uses narrow reads | Stage 1a | `data/costBook.ts:912,1265-1290` |

### Cost B: Contracts, OPEX, Land Lease, periods

| Item | Decision | file:line |
|---|---|---|
| Cost screens derive country and technology from the session project (no second project read) | OPT-02 | `contracts/hooks.ts:168-183` |
| The OPEX screen reads only OPEX periods (no chart of accounts, no Land Lease book) | OPT-04 | `costBook.ts:1144-1147`; `OpexScreen.tsx:769` |
| OPEX subaccount and currency reads start at t = 0; the catalogue reads the accounts once | OPT-06 | `costBook.ts:468-498`; `useCostBook.ts:364` |
| One shared currency read (memo 5 min), active view for the save lookup | OPT-07b / OPT-11 | `currencies.ts:112-139`; `periodWrites.ts:150-158` |
| The default chart read is shared; only the DevCo picker keeps its all-states read | OPT-07c | `contracts.ts:289-301` |
| CAPEX cost rows paged at 5,000 | OPT-08a | `contracts.ts:261` |
| The DevCo CAPEX contracts are read once for two keys | S1-07 | `contracts/hooks.ts:130-144` |
| Land Lease writes run in tiers (44 → 9/7/9 waves) | OPT-10, D160 | `landLease.ts:526, 571-579`; `landLeaseRules.ts:2699-2729` |
| OPEX writes: catalogue in the context, no child query on child/new rows, pooled cascade / re-chain / child deletes, parallel import tail | OPT-11, D160 | `useCostBook.ts:188-202`; `periodWrites.ts:178-186, 421-428, 492, 575-579, 729, 908-914` |
| A contract save no longer refetches the payment targets; keys on the id set | OPT-12 | `keys.ts:194-196`; `contracts/hooks.ts:55, 115, 282` |
| Device types only on O&M, re-read only for an O&M import | OPT-26 | `useCostBook.ts:228-235, 380-386`; `OpexScreen.tsx:780` |
| The unused Land Lease path in `periodWrites` was removed | OPT-34 | `periodWrites.ts:921-942` |
| DevCo links: the difference only, creates before deletes, bounded pools, 404 = done | D120 §2 | `contracts.ts:585-615` |
| The contract and payment-target updates are guarded | D120 §3 | `contracts.ts:508-516, 643-649` |
| The contract caches refresh on every outcome | D100 / D120 §1 | `contracts/hooks.ts:279-282` |
| The contract delete and payment-target delete go through `deleteRecord`; 404 = done | CA-27, D120 | `contracts.ts:531-547, 659-661` |
| `fetchAll` cap throws instead of truncating | D157 | `client.ts:80-93` |
| OPEX re-binds the OBU on edit and re-reads on every visit | D123 | `periodWrites.ts:456-461`; `useCostBook.ts:86-87` |

**Deferred items touching this scope (not re-raised unless noted):**
- OPT-09, the unbounded `Promise.all` over chunks (`contracts.ts:174, 200, 251`; `landLease.ts:154, 159, 285`; `opexCatalog.ts:152, 160`):
  CB-05 makes it moot for most of these reads.
- OPT-18, the focus refetch: it matters most for Contracts' `REREAD_ON_VISIT`, which re-reads 3+ requests on every focus.
- OPT-22, the guarded-update batching: re-raised with new evidence as CB-01, because these modules have no guard at all.
- DEC-5, the allocation `Name` skip.
- S6-13, Contracts link removals and additions together.

### PM A: Generators, Production, Revenues, Finance

| Item | Decision | Where |
|---|---|---|
| Per-kind reload | D141 | `features/pm/generators/reload.ts:111-151, 209-226` |
| List gate / lazy catalogue, index, device costs, AllWTG | D141 | `loadGate.ts:58-68`; `Screen.tsx:228-238` |
| Prefetch of independent reads | D141 | `queries.ts:101-117`; `app/bootPrefetch.ts:47-56` |
| Parallel id-chunk reads | D142 | `data/generators.ts:69-75` |
| Wave relaning, replace lanes, trimmed reload, 16-wide groups | D144 | `plans.ts:166-178, 346-348, 531-553, 721-726`; `reload.ts:192-199`; `hooks.ts:352-362` |
| New-type name from the create response (no read-back) | save performance 6 Nov 2026 | `Screen.tsx:828-837, 1002-1007` |
| Delete Identify as a dependency graph | OPT-15 S4-04 | `hooks.ts:434, 447-454, 466-471` |
| Country from the shared list | OPT-07a | `data/generators.ts:104-133`; `queries.ts:37-40` |
| Tiered deletes 16 / 4 | D115 / DEL-1 | `plans.ts:99-101`; `generatorsDeleteFlags.ts:33` |
| All-bridge O&M clean-up | D116 | `data/generators.ts:664-683` |
| Allocation grouping without O(A²) copy | OPT-30 | `plans.ts:642-646` |
| Production device types in one read per 40 | OPT-07e | `data/production.ts:310-331` |
| Production project handed to the generation | OPT-24 | `production/hooks.ts:194-197` |
| Production generation waves / Save 16 wide | D135 / D145 | `production/rules.ts:1625, 1654-1675, 1398` |
| Production reload drops the session project | D135 | `production/hooks.ts:156-168` |
| Revenues parallel volume groups, 16 wide; narrowed reload; one-code currency; shared states | D136 / D146 | `revenuesFlags.ts:34-35`; `revenues/reload.ts`; `data/revenues.ts:242-254`; `revenues/hooks.ts:82-92` |
| Revenues ids read beside the overlap read | D146 | `revenues/Screen.tsx:846-858` |
| Finance parallel / lazy reads, targeted reload, concurrent writes, one seed job, 16-wide tranche group | D137 / D149 | `financeFlags.ts:33-37`; `finance/perf.ts`; `finance/hooks.ts:170-191, 237-260` |
| Finance CAPEX cost reads 5000/page, no unused id | OPT-08a | `data/finance.ts:190` |
| Finance active-turbine count filtered on the server | OPT-07e | `data/finance.ts:222-230` |
| Shared Project States entry | D159 | `finance/hooks.ts:103` |
| Every visit re-reads Finance data | D109 | `finance/hooks.ts:74` |

**Deferred and not re-raised** (08 Summary, Deferred table): S4-07/08 supplier join and catalogue warm-up (no new evidence beyond OPT-15; the join would read the whole catalogue at load instead of the matched rows); OPT-18 focus refetch; re-keying PM country-dependent reads (Fabric) onto the session project. Note the PM session scope deliberately drops the country name (`data/project.ts:230-238`), so that change would also need the session layer. **Re-raised with new evidence**: OPT-21 (PA-01, including the bulk-engine evaluation).

---

### PM B: boot, Project Overview, PM screens, Cluster Checklist

| Item | Verified at |
|---|---|
| OPT-01: a PM route's session project is the row only (1 request), with the cluster-state name from the annotation and a fallback lookup | `data/project.ts:146, 230-239`; `app/bootPlan.ts:107-109` |
| OPT-03: the boot prefetch covers Cost and every PM slug (session project + chunk) | `bootPrefetch.ts:44-47, 105-114`; `bootPlan.ts:86-91` |
| OPT-07a: Milestones takes the country BU from the cached list; Generators the country from the shared list | `milestones/hooks.ts:78-102`; `generators/queries.ts:37-40` |
| OPT-07d / D159: one Project States key; the state order and the cluster state come from it | `data/projectStates.ts` (`projectStatesQueryOptions`); `data/projectStateLookup.ts`; `projects.ts:412-419`; `project.ts:373-385` |
| OPT-13: PM saves reload only what they wrote (Team, Grid Operator, Planning per kind, General Data `staleOnly` for the cluster panel) | `team/reload.ts`, `grid-operator/reload.ts`, `planning/reload.ts:41-45`, `general-data/Screen.tsx:590-595` |
| OPT-14: Team Entra lookups cached 30 min, 6 wide; descriptions read once per visit | `data/personCache.ts:23-26, 40-69`; `team/hooks.ts:65-80` |
| OPT-16: the Planning row and acquisitions keyed on the project id (2 waves) | `planning/hooks.ts:100-149` |
| OPT-19 (Team part): member search debounced 250 ms | `team/hooks.ts:89-104` |
| D119 S1-S5: env vars do not block paint; boot prefetch; next-page delay 1.5 s; parallel user lookups with name-filtered roles | `startupFlags.ts:17-42`; `currentUser.ts:152-160, 203-206` |
| D41-D46 invariants: `maxPageSize` not `$top`; one continuous `named ++ blank` run; `RoundUp(Total/200)`; Next follows the skip token; count asked once per walk; primary-key tie-breaker | `client.ts:285-316`; `projects.ts:93-155, 250-271`. **Kept; nothing here proposes a change** |
| D157: `fetchAll` throws at the default cap instead of returning a short list | `client.ts:80-93` |
| D150 / D156 Check List switches (early rows and visit, targeted reload, read-ahead copy, 16-wide copy, 30-min people, scoped gates, shared states, quiet focus) | `checklistPerfFlags.ts:69-80`; `checklist/hooks.ts:166-240, 327-369` |
| Analysis issue 5: an empty visit plan skips the write job (no overlay, no reload) | `checklist/hooks.ts:441` |
| Analysis issue 6 / D158: an interrupted copy is completed | `checklist/hooks.ts:377-390, 420-424` |
| Analysis issue 10 / C7: a blank AppId is refused before the cancel patch | `checklist/hooks.ts:575-577`; `rules.ts:3156-3160` |
| Analysis issue 13: the progress text is `taskChanging` | `checklist/Screen.tsx:849, 929` |
| OPT-24 (S4-12/13): the transition poll reads 1 tracking × 3 cols; the request-approval fresh check reads 1 task; the scope id is memoised | `data/checklist.ts:217-228, 322-333`; `checklistPeople.ts:35, 38-47` |
| OPT-07e: the Milestones Fabric job-type id is memoised 30 min | `data/milestones.ts:290-305` |
| The Milestones seed inputs are read in parallel and ahead (5 Nov 2026; OPT-07b EUR by ISO code) | `milestones/hooks.ts:190-203, 251-277` |
| The Overview delete goes through `deleteRecord` (the failure is surfaced) and drops the page tokens | `projects.ts:482-485` |
| Double-submit: Check List and General Data writes are gated on `progress !== null` with a blocking overlay; Simulate has a ref guard; Delete Project is disabled while it is pending | `checklist/Screen.tsx:736, 954`; `general-data/Screen.tsx:456-457`; `project-main/Screen.tsx:739-740, 640` |

Deferred items deliberately not re-raised: OPT-18 focus-refetch policy (DEC-3; the per-screen counts are in B.9), OPT-21 bulk switches (DEC-4: `CHECKLIST_BULK.materialise` is OFF), OPT-22 guarded-update batching (SDK, DEC-7), the municipality debounce (DEC-6; only the truncation check is re-raised, PB-02), and OPT-01's re-keying of the PM country reads (declined).

---

### Admin screens and the shared write engine

| Item | Where verified |
|---|---|
| OPT-08(c) locks read 3 columns, not 9 | `adminDefaultChecklists.ts:159-161` (`select: LOCK_COLUMNS`), `adminChecklistTables.ts:77-79` |
| OPT-17(a) approval chunks 4 wide, input order | `adminChecklistTables.ts:290-299` |
| OPT-17(b) people chunks parallel, template PMs resolved beside the checklist chain, `getEntraPeople` bounded to 6 | `adminGatesApprovals.ts:561-578, 650-676, 312, 348` |
| OPT-17(c) reload reuses resolved people (`GATES_REUSE_PEOPLE = true`) | `adminGatesApprovals.ts:490, 584-601`; `hooks.ts:46` |
| OPT-20 S6-14: CAPEX create checks and delete guards in parallel, message priority kept | `adminCapexAccounts.ts:244-248, 310-314` |
| OPT-07c: Contracts settings uses the shared chart read; account writes drop it | `capexAccounts.ts:26-28`, `hooks.ts:86-88`, `adminInvalidation.ts:74-79` |
| OPT-07d / D159: Check List clusters and Gates states are views of the shared Project States entry | `admin-default-checklists/hooks.ts:31-33`, `admin-gates-approvals/hooks.ts:32-34` |
| OPT-07a (admin part): one shared countries entry for all admin screens | `data/countries.ts:59-84` |
| Clean-up skips rows already at 0 (`ne("vsb_cost", 0)`) and paid rows; runs in background | `adminCapexAccounts.ts:326, 335-337`; `Screen.tsx:216-227` |
| `capexAccountsWriteKeys` no longer refetches every per-row has-contracts check | `adminInvalidation.ts:55-60` |
| Invalidation helpers use `allSettled` (a failed refetch never fails a landed write) | `adminInvalidation.ts:41-43` |
| D157: `unwrapDelete` gone = 404 / `0x80040217` only; `fetchAll` cap throws | `errors.ts:74-97`, `client.ts:80-93` |
| D158: owner-bind guard before any send (admin tables not project-scoped) | `ownerBindGuard.ts:304-315`, `executePlan.ts:454-457` |
| Upsert guard on every admin single-row update (no resurrection on SDK 1.3.1) | `client.ts:416-453`; all admin `guardedUpdate` plans |
| Engine: page tokens invalidated only after accepted writes; plan order kept; concurrent groups bounded | `executePlan.ts:65-78, 512-624` |
| Reads are server-filtered with `$select` on every admin query (no whole-table client filtering except the deliberately small reference tables) | §A |
| Deliberately skipped in D160 §10 (not re-raised): S6-13 (Contracts removals ‖ additions), S6-12 (OPEX one read), S6-07 (DEC-5) | `02-OPEN-DECISIONS.md` D160 §10 |

---

## Appendix G - open questions

### Cost A: CAPEX/DEVEX, Add Cost from Table, shared costing layer

1. **G1** Does the SDK or host impose its own request timeout (and does it throw or hang)? It decides the real severity of CA-02. Nothing in the repo shows it; `node_modules/@microsoft/power-apps` was not inspected in this audit.
2. **G2** What is the largest `$filter` URL or batch body the host accepts, and does the environment accept `Microsoft.Dynamics.CRM.In(...)` through the SDK's `filter` option (CA-04)?
3. **G3** Which screen (if any) writes `vsb_spvdevcomappingcapexdevexes`? Only `data/adminCost.ts:351` (a read) references the service, so CA-08's cache has no in-app invalidation hook; if an admin path writes it, add an invalidation there.
4. **G4** Why are the book, totals and sheet reads `retry: false` (CA-11)? No recorded rationale; if the intent is "show failures quickly", an owner decision is needed.
5. **G5** Was the WS-A tuning probe (`bulkSend.ts:121-123`: 8+ parallel requests per table keep per-request cost; 24 in flight raise no 429s) ever run on DEV? If not, CA-01 is the safety net that makes the tuning safe.
6. **G6** Is a browser-close prompt acceptable for the length of the deferred-delete window (CA-03), given that WS-F already chose that prompt for its background save?
7. **G7** Would the product accept a rollup column or custom API for category totals (CA-13)? It is the only route to remove the whole-project cost download of the Summary tab.
8. **G8** Does `vsb_capexcomments` carry a project lookup? If it did, the dots query could be one project-filtered read in wave 1 instead of `ceil(C/40)` reads in wave 4 (CA-04, CA-09). The generated model was not inspected for it.

### Cost B: Contracts, OPEX, Land Lease, periods

1. Does the live DEV solution still declare `CascadeDelete = Cascade` for the Land Lease period and allocation relationships, and
   `RemoveLink` for the OPEX `vsb_ParentCost` relationship (CB-04, §5)? The extract is 1.21.709.
2. Does the host forward a single-valued navigation path in `$filter` unchanged for these tables, and what is the navigation name of
   the `vsb_capexcosts` → contract lookup (CB-05)? `adminContract.ts:186` suggests yes for another table.
3. Does `CreateMultiple` / `UpdateMultiple` answer on `vsb_landleaseallocationwtgs` and `vsb_opexprojectcosts` without the 501 seen
   in D51 (CB-06, CB-10; DEC-4)?
4. Is there any request timeout in the host? No app-level timeout exists for these writes (no `AbortController` or timeout in
   `data/client.ts`, `landLease.ts` or `periodWrites.ts`). A hung request keeps `useCostWriteInFlight` true and blocks every Cost write
   of the project (`useCostWriteFlight.ts:24-26`) until a reload.
5. Which error does Dataverse return for a POST with an existing primary key on these tables (CB-14)?
6. Product: refuse a save on a row another user deleted (CB-01), and re-check the Land Lease standard import on the server (CB-02)?
7. Product: is a lost `createdon` order acceptable for imported Land Lease periods (CB-07), the same question as `OPEX_IMPORT_PARALLEL`?
8. The `Prefer: return=representation` the SDK adds to every PATCH returns the full row with annotations for each cascade, re-chain
   and allocation PATCH. This cannot be changed from the app (platform constraint). Bulk messages (CB-06, CB-10) avoid it as a side effect.

### PM A: Generators, Production, Revenues, Finance

1. Does `UpdateMultiple` accept `statecode` on `vsb_generatorinproject`, and does it fail (not upsert) on a missing id? (PA-01, PA-13)
2. Does `LoadDevexCapexCostTotalCapacityTrigger` fire when the plant column is in the PATCH with an unchanged value? (PA-04)
3. Do code apps of different environments share one browser origin (IndexedDB)? (PA-12)
4. Is the Generators warm-up hit rate known (Generators visits within 5 minutes of another PM screen)? (PA-11)
5. What timeout does the host apply to a flow `Run`? A hung permission flow blocks every Generators write in the tab. (E)
6. Parallel `CreateMultiple` chunks of children under one parent type or cost: any lock serialisation on DEV? (PA-01, PA-07)
7. Product: may unchanged schedule rows (PA-03) or unchanged hedge volumes (PA-06) be skipped, given that `modifiedon` and audit history then differ from the canvas?

### PM B: boot, Project Overview, PM screens, Cluster Checklist

1. **`$top` + `odata.maxpagesize` together** (PB-02): which one wins in this Dataverse version, and does a next link come back? A single DEV read settles it.
2. **Does the gate-approval flow write `FlowRunId` before or after "Respond to a Power App"?** That decides the duplicate-approval window in PB-01. It is readable from the flow definition (`ProjectDocs/_extracted/VSBCloud/Workflows/`); not checked in this pass.
3. **`WhenProjectDatagetsupdated-SendE-MailCardtoPortfolioManagers`:** is it active in DEV or PROD, and what does it filter on? Until that is known, any change in the number of project PATCHes (PB-11, the GD Patch #2 skip already shipped) could change the mails sent.
4. **Hit rate of the Generators warm-up** (PB-09). It can be measured from the existing `[VSB]` lines; no code is needed.
5. **Persisting reference data across tabs** (PB-04): is tenant configuration (environment variables, states, countries) acceptable in `localStorage` under the security policy? Roles and flags stay excluded.
6. **Lambda and navigation-property filters** (PB-07, PB-08): do they pass through the SDK and host unchanged? The SDK forwards `filter` as a string; host behaviour is unverified.
7. **The order of `SynchroniseProjectState` runs** when tracking upserts go out together (PB-11, PB-14). The create path already does this; has it been observed on DEV?
8. **Planning duplicates** (PB-05): does DEV already hold projects with more than one `vsb_projectplanning` row (or duplicate acquisition statuses per type)? That would show whether the race happens.

### Admin screens and the shared write engine

1. **Volumes for the CAPEX clean-up.** How many contracts sit on a typical or the largest account, and how many later-year cost rows per contract? This decides whether AD-01/AD-02 are near the 6,000-requests-per-5-min service-protection limit. Count on DEV with `[VSB] DATA` lines from one deactivation.
2. **Does the host enforce its own concurrency or timeout** for SDK requests? If it queues above some width, AD-03/WE-03 are less severe; if it times out, WE-05(a) is less severe. Not visible in SDK `dist`.
3. **DEC-7 risk acceptance** for a chunked existence check (AD-02a, AD-07a, OPT-22): is a race window of one chunk acceptable for the zeroing and order PATCHes?
4. **D36 §1:** is `UpdateMultiple` for the CAPEX zeroing worth a decision (AD-02b)? A server-side bulk delete needs a custom API or BulkDelete job design.
5. **Do the admin tables accept a client-supplied primary key on POST** (WE-04)? Needs a live check per table.
6. **Stale comment:** `adminCapexAccounts.ts:151-155` says the PATCH "since SDK 1.5.0 always sends `If-Match: *`", but 1.3.1 is installed (already noted in OPT-22; still present).
7. **Dead code:** `createRowsEach`, `deactivateCapexAccount`, `deactivateCapexSubaccount` have no production caller; confirm with knip before removing (OPT-34).
8. **Locks read scope:** `listLocks` reads every locking approval in the environment on every Check List Settings mount (AD-OP-61). It is narrow (3 columns) and one request; is the environment's approval count small enough that this stays one page?

