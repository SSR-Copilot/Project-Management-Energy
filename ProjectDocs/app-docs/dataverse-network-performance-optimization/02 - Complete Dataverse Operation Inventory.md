# 02 - Complete Dataverse Operation Inventory

> Stage 1 audit, 25 Nov 2026. Branch `feature/dataverse-network-performance-optimization`, from `origin/RounakDev1` at `30afece`. Investigation only: no application source file was changed. Every request count is **code-derived**, not measured. 

**324 distinct call sites** across five scopes (CA: 38, CB: 46, PA: 80, PB: 85, AD/WE: 75). Operation IDs are `<scope>-OP-NN`. Columns: caller, table, operation, HTTP method, query/payload shape, trigger and frequency, dependencies, individual/bulk/action.

Counting note: a call site is one place in the code that issues a request shape; a shared helper counts once, and the screens that use it are named in its row.

## Cost A: CAPEX/DEVEX, Add Cost from Table, shared costing layer

Legend: Ind = individual request, Bulk = CreateMultiple/UpdateMultiple. Every read pages by `maxPageSize` 500 through `fetchAll` unless stated. The host wraps each request in its own batch envelope. A = accounts + sub-accounts of the open category, C = contracts of the category, S = sub-accounts.

| OpID | Screen | Caller (file:function:line) | Table (entity set) | Op / HTTP | Query / payload | Trigger & frequency | Depends on | Kind |
|---|---|---|---|---|---|---|---|---|
| CA-OP-01 | CAPEX, Summary, Add Cost, Contracts | `data/capexChart.ts:35` `loadCapexChartRows` (used by `costBook.ts:640,654`, `addCostSheet.ts:121`) | `vsb_capexaccountlists` | read GET | `$select` 6 cols, `statecode eq 0`, `orderBy vsb_number asc`, whole table; in-flight sharing + 30 s memo | each cost-book / totals / categories / sheet load after memo expiry | none | Ind (shared) |
| CA-OP-02 | CAPEX tab | `costBook.ts:157` `loadPayerDefaults`, started at t=0 in `loadCostBook` (`:1139` area) | `vsb_spvdevcomappingcapexdevexes` | read GET | `$select` 3 cols, ACTIVE, whole table; NOT memoised | each CAPEX tab load, each refetch | none | Ind |
| CA-OP-03 | CAPEX tab | `costBook.ts:913-936` `loadCostLines` | `vsb_capexprojectcontracts` | read GET x ceil(A/40), parallel | `$select` 18 cols; `project eq X and (account eq a1 or ... a40)`; no `statecode` | each tab load, each post-save refetch, tab return > 30 s | CA-OP-01 | Ind, unbounded `Promise.all` |
| CA-OP-04 | CAPEX tab | `costBook.ts:1039` `loadPayments` | `vsb_capexcosts` | read GET x ceil(C/40), parallel, each paged | `$select` 6 cols (`:1045-1048`), `contract eq c1 or ... c40`, `maxPageSize 5000` | same as CA-OP-03 | CA-OP-03 | Ind, unbounded `Promise.all` |
| CA-OP-05 | CAPEX tab | `costBook.ts:944-946`, loader = shared project-states query (`useCostBook.ts:97`) | `vsb_projectstates` | read GET | `$select` 3 cols, ACTIVE | only when a contract has a linked cluster; 30-min shared cache | CA-OP-03 | Ind (cached) |
| CA-OP-06 | Summary tab | `costBook.ts:1265` `loadCapexTotals` (contracts) | `vsb_capexprojectcontracts` | read GET | `$select` 2 cols, `project eq X`, no `statecode` | Summary visit, invalidations, window focus | none (chart in parallel) | Ind |
| CA-OP-07 | Summary tab | `costBook.ts:1200` `loadContractCostSums` | `vsb_capexcosts` | read GET x ceil(C/40), parallel | `$select` 2 cols (3 when a delete is pending), `maxPageSize 5000` | after CA-OP-06 | CA-OP-06 | Ind, unbounded `Promise.all` |
| CA-OP-08 | CAPEX screen | `useCostBook.ts:802` -> `costBook.ts:640` `loadCapexCategories` | chart (CA-OP-01) | no own request | derived from the shared chart read | staleTime 30 min | CA-OP-01 | cached |
| CA-OP-09 | CAPEX tab | `useCostBook.ts:752` -> `data/standardContracts.ts:20` | `vsb_devexcapexstandardassumptionses` | read GET x ceil(S/40) | `$select` 16 cols, `subaccount in chunk and statecode eq 0` | key = joined subaccount ids; staleTime 30 min, no focus refetch | CA-OP-03 (subaccount ids from the book) | Ind |
| CA-OP-10 | CAPEX tab | `useCostBook.ts:761` -> `standardContracts.ts:66` `loadActiveWtgCount` | `vsb_generatortypeinprojects` | read GET | `$select` 3 cols, `project eq X and ACTIVE` | staleTime 5 min | none | Ind |
| CA-OP-11 | CAPEX tab | `useCostBook.ts:765` `useProjectExtras` (`features/cost/contracts/hooks.ts:168`) | `vsb_projects` | normally none | derived from the session project; GET only if the session project differs | 5 min | session | cached |
| CA-OP-12 | CAPEX tab | `useCostBook.ts:847` -> `data/comments.ts:64` `loadComments` (screen: all contracts of the category) | `vsb_capexcommentses` | read GET x ceil(C/40) | `$select` 11 cols, `capexcontract in chunk and ACTIVE` | after the book resolves; default 30 s staleTime + focus refetch; re-read per `capexInvalidation.ts` job | CA-OP-03/04 (`contractIds` come from the resolved book) | Ind |
| CA-OP-13 | CAPEX grid | `capexWrites.ts:75` `setCostPaid` | `vsb_capexcosts` | write PATCH | `{vsb_costpaid}` | each paid toggle | CA-OP-14 first when cluster-linked | Ind |
| CA-OP-14 | CAPEX grid | `capexWrites.ts:88` `clearLinkedCluster` | `vsb_capexprojectcontracts` | write PATCH | `{"vsb_LinkedCluster@odata.bind": null}` | paid toggle on a cluster-linked contract, after confirm | precedes CA-OP-13 (`costRepository.ts:315-316`) | Ind |
| CA-OP-15 | CAPEX panel | `capexWrites.ts:485` `updateContract` | contracts | write PATCH | ~22-column bag + `LinkedCluster@odata.bind` on every edit (see CA-12) | each Edit save | none | Ind |
| CA-OP-16 | CAPEX panel | `capexWrites.ts:496` `createContract` | contracts | write POST | full bag + project/account/OwningBU binds, optional standard-assumption bind | each Add; each standard-contract add | none | Ind |
| CA-OP-17 | CAPEX panel | `capexWrites.ts:729` `upsertRowsByAction(CAPEX_COSTS, ...)` | `vsb_capexcosts` | write CreateMultiple + UpdateMultiple in parallel, each split by `bulkRequestCount` | create: full row with binds; update: `{vsb_cost}` (+ `vsb_costpaid:false` on a reset); unchanged months skipped | each panel save | Edit: parallel with CA-OP-15 (after it when reset); Add: after CA-OP-16 (`:739-752`) | Bulk |
| CA-OP-18 | CAPEX panel (legacy, not live) | `capexWrites.ts:550-628` `saveCostLineLegacy` | `vsb_capexcosts` | PATCH/POST/DELETE one per month, sequential | per row | only `PANEL_BULK_SAVE=false` or DEV override | contract first | Ind sequential |
| CA-OP-19 | CAPEX panel | `capexWrites.ts:756-760` `deleteMany` (4 wide) | `vsb_capexcosts` | delete DELETE per row | one per cleared month with a stored row | after CA-OP-17 | CA-OP-17 | Ind (gate 4) |
| CA-OP-20 | CAPEX Delete line | `capexWrites.ts:845` `deleteCostLineBulk`: (a) CA-OP-12 for one contract, (b) comment deletes, (c) cost deletes, (d) contract delete | comments, costs, contracts | GET + DELETE x (K + M + 1) | one DELETE per comment, per month row, then the contract | each Delete confirm | a -> b -> c -> d, sequential phases | Ind (gate 4 per phase) |
| CA-OP-21 | Comments panel | `comments.ts:156` `saveComment`, loop `CommentsPanel.tsx:516-566` | comments | POST/PATCH one per changed comment, sequential awaits (deletes, roots by order, replies) | `scalars + links`; creates carry OwningBU | each comments Save | by design (ids, numbering) | Ind sequential |
| CA-OP-22 | CAPEX add standard | `costBook.ts:1099` `standardContractExists` | contracts | read GET top 1 | equality on project, account, standard assumption; no statecode | each "Add standard contract" click, before the create | none | Ind |
| CA-OP-23 | CAPEX add standard | `costBook.ts:829` `loadMilestoneAssumptionValues` | `vsb_milestonesstandardassumptionses` | read GET top 1 | 9 cols; staleTime 30 min | standard-contract date synthesis | project extras | Ind (cached) |
| CA-OP-24 | Add Cost load | `addCostSheet.ts:117-148` `loadAddCostSheetData` (contracts via `loadContracts` `:161`) | contracts | read GET x ceil(A/40) | `$select` 10 cols (`:108-115`), `project and (account in chunk)`, no statecode | each sheet open (`NO_FOCUS_REFETCH`, no reconnect refetch) | CA-OP-01 | Ind |
| CA-OP-25 | Add Cost load | `addCostSheet.ts:151,212` `loadCostsForContracts` | `vsb_capexcosts` | read GET x ceil(C/40) | `$select` 5 cols, `maxPageSize 5000` | after CA-OP-24 | CA-OP-24 | Ind |
| CA-OP-26 | Add Cost load | `addCostSheet.ts:141` `loadPayerDefaults` | mapping table | read GET | same as CA-OP-02, parallel with CA-OP-24 | each sheet load | none | Ind |
| CA-OP-27 | Add Cost Save (retry only) | `addCostSheet.ts:191` `refreshSnapshot` (`refreshBeforePlan`) | contracts + costs | read GET x (ceil(C/40) + ceil(C/40)) | re-read by id | only after a failed attempt | none | Ind |
| CA-OP-28 | Add Cost Save | `bulkSend.ts:194` `existingIds` via `addCostSheetBulk.ts:896` `verifyPlan` | contracts, costs | read GET x ceil(ids/40) per table, ungated | pk only, `pk in chunk` | only when `verifyUpserts` (retry, or a 501 flag set); always for `costDeletesIfExist` ids | plan | Ind, ungated |
| CA-OP-29 | Add Cost Save | `addCostSheet.ts:887` `upsert` -> `bulkSend.ts:674` (contracts) | contracts | write CreateMultiple + UpdateMultiple in parallel; each up to 8 parallel requests (min chunk 10 rows) else 500-row chunks | new: full bag + binds + total; existing: changed columns, total only if changed | each Save with contract changes | verify (if run) | Bulk |
| CA-OP-30 | Add Cost Save | same, stage A: costs of existing contracts | costs | write Create/UpdateMultiple | create full row; update `{vsb_cost}` | each Save | parallel with CA-OP-29 | Bulk |
| CA-OP-31 | Add Cost Save | same, stage B: costs of new contracts | costs | write CreateMultiple | binds to the new contract id | after CA-OP-29 succeeded and no failure seen (`addCostSheetBulk.ts:614-618`) | CA-OP-29 | Bulk |
| CA-OP-32 | Add Cost Save | `addCostSheet.ts:823,1252` `verifiedDeleteMany` / `deleteOr404` | contracts | delete DELETE per contract, gate 4 (server cascade) | per removed contract | deferred: starts after every write settled | all writes | Ind (gate 4) |
| CA-OP-33 | Add Cost Save | same | costs | delete DELETE per cleared cell, gate 4 | per cleared month | deferred likewise | all writes | Ind (gate 4) |
| CA-OP-34 | Add Cost Save | `addCostSheet.ts:1290` `verifyNotFound` | contracts / costs | read GET x ceil(404 ids/40) | pk read-back | only for deletes that answered 404 | CA-OP-32/33 | Ind |
| CA-OP-35 | Add Cost failure | `addCostSheetBulk.ts:1111` `reconcileTotals` (+ `loadCostsForContracts`) | costs read, contracts write | GET x ceil(ids/40); then Create/UpdateMultiple | recomputed totals | only after a failed op or failed background delete | all ops settled | Bulk |
| CA-OP-36 | Add Cost Save | `bulkSend.ts:509` `upsertEachRow` (501 fallback) | contracts, costs | write PATCH per row, 16 wide on the write gate; pre-read when `guard` | per row | only after a 501 | 501 | Ind |
| CA-OP-37 | Add Cost (OFF) | `bulkSend.ts:934` `deepInsertContracts` | contracts (+ nested costs) | POST per new contract | | `DEEP_INSERT_NEW_CONTRACTS=false` | | Ind |
| CA-OP-38 | after every CAPEX / Add Cost write | `useCostBook.ts:448-460` `invalidate`, `:603-632` | book, totals, DevCo keys, comments | refetch | re-runs CA-OP-02/03/04/06/07/12 and the Contracts screen's DevCo reads | per the `capexInvalidation.ts` job table | the write | derived |

## Cost B: Contracts, OPEX, Land Lease, periods

All reads use `fetchAll` (500-row pages) unless noted. "C" = contracts on the project, "D" = DevCo CAPEX contracts, "H" = Land
Lease headers, "T" = generator + PV type rows, "A" = allocations of one contract, "k" = OPEX children of a head.

| OpID | Screen | Caller file:function:line | Table (entity set) | Op | HTTP | Query / payload | Trigger & frequency | Depends on | Ind./bulk |
|---|---|---|---|---|---|---|---|---|---|
| CB-OP-01 | Contracts | `data/contracts.ts:listContracts:152` | `vsb_bopprojectscontractses` | read | GET | 22 cols (`CONTRACT_SELECT` `:135-144`); `vsb_project eq P and statecode eq 0` | every mount, every focus (staleTime 0), after any contract save/delete | session project | individual |
| CB-OP-02 | Contracts | `contracts.ts:listPaymentTargets:168` | `vsb_bopcontractspaymenttargetses` | read | GET ×ceil(C/40), `Promise.all` | 7 cols; `lookupIn(vsb_bopprojectcontract, 40 ids) and ACTIVE` | every mount/focus; after payment-target save/delete, contract delete; whenever the contract id set changes (key `hooks.ts:55`) | OP-01 | individual, chunked |
| CB-OP-03 | Contracts | `contracts.ts:listDevCoLinks:196` | `vsb_bopcontractsdevcocostses` | read | GET ×ceil(C/40) | 3 cols; `lookupIn(vsb_bopcontract) and ACTIVE` | as OP-02, plus after every contract save | OP-01 | individual, chunked |
| CB-OP-04 | Contracts | `contracts.ts:listCapexAccounts:283` (`includeInactive`) | `vsb_capexaccountlists` | read | GET | 6 cols, no filter, `vsb_number asc` | first mount, then 30 min | — | individual |
| CB-OP-05 | Contracts | `contracts.ts:listDevCoCapexContracts:311` | `vsb_capexprojectcontracts` | read | GET | 3 cols; project + `vsb_costtype eq DevCo` + ACTIVE | mount (30 s); shared with OP-06 via `fetchQuery` (`hooks.ts:138-141`) | — | individual |
| CB-OP-06 | Contracts | `contracts.ts:listCapexCostRows:239` | `vsb_capexcosts` | read | GET ×ceil(D/40), `maxPageSize: 5000` | 5 cols; `lookupIn(vsb_contract) and ACTIVE` | mount (30 s) | OP-05 | individual, chunked |
| CB-OP-07 | Contracts | `contracts.ts:findBopStandardAssumption:342` ×2 (`Screen.tsx:301-310`) | `vsb_bopcontractsstandardassumptionses` | read | GET ×2 | 6 cols; country + technology + contract type + ACTIVE, `createdon asc`, `top 1` | mount (15 min), one per type | extras (derived, no request) | individual |
| CB-OP-08 | Contracts | `contracts.ts:saveContract:518-522` | `vsb_bopprojectscontractses` | create | POST | 22 cols + `vsb_Project` bind + OBU bind (Rights: 7 cols, `:489-501`) | Save of a new contract | — | individual |
| CB-OP-09 | Contracts | `contracts.ts:saveContract:508-516` → `client.ts:updateRecordIfExists:416` | `vsb_bopprojectscontractses` | update | GET (pk, `maxPageSize 1`) then PATCH | same payload, no OBU bind | Save of an edit | — | individual, guarded |
| CB-OP-10 | Contracts | `contracts.ts:replaceDevCoLinks:593` | `vsb_bopcontractsdevcocostses` | read | GET | OP-03 for one id | every non-Rights edit save | OP-09 (awaited after it) | individual |
| CB-OP-11 | Contracts | `contracts.ts:replaceDevCoLinks:598-609` | `vsb_bopcontractsdevcocostses` | create | POST per added account, 8 wide | name + 2 binds + OBU | Save with added accounts | OP-08/09 (contract id), OP-10 | individual loop |
| CB-OP-12 | Contracts | `contracts.ts:replaceDevCoLinks:610-614` | `vsb_bopcontractsdevcocostses` | delete | DELETE per removed link, 16 wide; 404 = done | — | Save with removed accounts | OP-11 settled | individual loop |
| CB-OP-13 | Contracts | `contracts.ts:deleteContract:545` | `vsb_bopprojectscontractses` | delete | DELETE; 404 = done | server cascades targets and links (§6) | Delete contract | — | individual |
| CB-OP-14 | Contracts | `contracts.ts:savePaymentTarget:629-657` | `vsb_bopcontractspaymenttargetses` | create / update | POST, or GET+PATCH | 6 cols + contract bind (+ OBU on create) | Save target | — | individual, update guarded |
| CB-OP-15 | Contracts | `contracts.ts:deletePaymentTarget:659` | `vsb_bopcontractspaymenttargetses` | delete | DELETE; 404 = done | — | Delete target | — | individual |
| CB-OP-16 | Land Lease | `data/landLease.ts:loadLeaseBook:121-131` | `vsb_landleasesubaccounts` | read | GET | 3 cols, ACTIVE | every lease-book load (mount after 30 s, focus, after every write) | — | individual |
| CB-OP-17 | Land Lease | `landLease.ts:loadLeaseBook:132-139` | `vsb_landleaseprojectcosts` | read | GET | 22 cols (`LEASE_COST_SELECT` `:93-101`); project + ACTIVE | same | — | individual |
| CB-OP-18 | Land Lease | `landLease.ts:loadLeaseBook:154-158` | `vsb_landleaseperiods` | read | GET ×ceil(H/40) | 14 cols; `lookupIn(vsb_projectcost)`, no state filter | same | OP-17 | individual, chunked |
| CB-OP-19 | Land Lease | `landLease.ts:loadLeaseBook:159-169` | `vsb_landleaseallocationwtgs` | read | GET ×ceil(H/40) | 3 cols; `lookupIn(vsb_projectcost)` | same | OP-17 | individual, chunked |
| CB-OP-20 | Land Lease, OPEX | `data/currencies.ts:112-129` (via `loadCurrencyNameMap` `landLease.ts:170`, `useCurrencies`, `loadOpexPeriods`, `resolveCurrencyId`) | `transactioncurrencies` | read | GET (shared, memo 5 min) | 4 cols, no filter | first use per 5 min | — | shared read |
| CB-OP-21 | Land Lease | `landLease.ts:loadLeaseGenerators:259-276` | `vsb_generatortypeinprojects`, `vsb_pvmoduletypeinprojects` | read | GET ×2 parallel | 1 / 2 cols; project + ACTIVE | mount (5 min) | — | individual |
| CB-OP-22 | Land Lease | `landLease.ts:loadLeaseGenerators:285-297` | `vsb_generatorinprojects` | read | GET ×ceil(T/40) | 4 cols; `lookupIn(vsb_moduletypeinprojectid)` | mount (5 min) | OP-21 | individual, chunked |
| CB-OP-23 | Land Lease, OPEX | `data/countryInflation.ts:loadCountryInflation:183` | `vsb_countryinflationprofiles` | read | GET | 4 cols; country + ACTIVE | mount (30 min) | extras | individual |
| CB-OP-24 | Land Lease | `landLease.ts:loadLeaseAssumptions:348` | `vsb_opexlandleasestandardassumptionses` | read | GET | 27 cols; type + country + technology + ACTIVE, `vsb_description asc` | mount (15 min) | extras | individual |
| CB-OP-25 | Land Lease | `landLease.ts:sendLeaseWrite:550-556` via `WRITERS[cost]` `:425-433` | `vsb_landleaseprojectcosts` | create / update | POST / **PATCH, unguarded** | `buildCostPayload` (`landLeaseRules.ts:2741-2777`): 16 cols + project, subaccount, currency, OBU binds | Save when new contract or Period 1; import | — | individual |
| CB-OP-26 | Land Lease | `landLease.ts:sendLeaseWrite` via `WRITERS[allocation]` `:442-450` | `vsb_landleaseallocationwtgs` | create / update / delete | POST / PATCH (unguarded) / DELETE, same-op tier 8 (16 for deletes) | name + cost, generator, OBU binds (`landLeaseRules.ts:2824-2838`); **every** allocated row re-written on a Period-1 save (`diffAllocation` `:1589-1610`) | Period-1 save, import, contract delete | OP-25 (`parentRef`) | individual loop |
| CB-OP-27 | Land Lease | `landLease.ts:sendLeaseWrite` via `WRITERS[period]` `:434-441` | `vsb_landleaseperiods` | create / update | POST / PATCH (unguarded); followers PATCH `vsb_startdate` only (`landLeaseRules.ts:2974-2979`) | 12 cols + cost, OBU binds | every Save; D118 followers on an Edit | OP-25 when new | individual, one tier each |
| CB-OP-28 | Land Lease | `landLeaseRules.ts:planLeaseDelete:3009-3040` → `applyLeaseWrites` | allocations, periods, header | delete | DELETE: allocations 16 wide, then each period alone, then header (4) | — | Delete Period 1 (= delete contract); Period 2+ = 1 DELETE | children first | individual loop |
| CB-OP-29 | Land Lease | `landLeaseRules.ts:planStandardImport:3445-3560` | header, allocations, periods | create | POST: headers one tier each, allocations 8 wide, periods one tier each | header 18 cols + 4 binds; allocation name + 2 binds; period 12 cols + bind | Add Standard Contract | OP-25 ids | individual loop |
| CB-OP-30 | OPEX | `data/costBook.ts:loadOpexPeriods:477-492` | `vsb_opexprojectcosts` | read | GET | 29 cols; project + ACTIVE | every OPEX mount (`everyVisit`), focus, after every save/delete/import | — | individual |
| CB-OP-31 | OPEX | `costBook.ts:loadOpexPeriods:468-472` | `vsb_opexsubaccounts` | read | GET (t = 0, beside OP-30) | 2 cols, ACTIVE | every OPEX book load | — | individual |
| CB-OP-32 | OPEX | `costBook.ts:loadOpexPeriods:509-516` | `vsb_devicetypesinprojects` | read | GET ×ceil(devices/40) | 2 cols; `idIn` | every OPEX book load with O&M rows | OP-30 | individual, chunked |
| CB-OP-33 | OPEX | `data/opexCatalog.ts:loadOpexAccounts:43` | `vsb_opexaccounts` | read | GET | 3 cols, ACTIVE | 30 min | — | individual |
| CB-OP-34 | OPEX | `opexCatalog.ts:loadOpexSubaccounts:63` | `vsb_opexsubaccounts` | read | GET | 4 cols, ACTIVE | 30 min | — (accounts promise joined) | individual |
| CB-OP-35 | OPEX (O&M) | `opexCatalog.ts:loadOpexDeviceTypes:118-170` | gen types, PV types, `vsb_devicetypesinprojects`, `vsb_generators` | read | GET ×2, then ×ceil(T/40) + ×ceil(G/40) | 4/3 cols; then 3 cols `lookupIn(vsb_typeinprojectid)` and 3 cols `idIn(vsb_generatorid)` | every O&M mount; after an O&M import | — | individual, chunked |
| CB-OP-36 | OPEX | `opexCatalog.ts:loadOpexAssumptionScopes:242` | `vsb_opexlandleasestandardassumptionses` | read | GET | 5 cols; country + technology + ACTIVE | 15 min | extras | individual |
| CB-OP-37 | OPEX | `data/periodWrites.ts:saveOpexPeriod:464-480` | `vsb_opexprojectcosts` | create | POST | ~28 cols + subaccount, device, OBU, project, parent binds | Save of a new period / contract | currency + target (no request when cached) | individual |
| CB-OP-38 | OPEX | `periodWrites.ts:saveOpexPeriod:481-486` | `vsb_opexprojectcosts` | update | **PATCH, unguarded** | full column bag + subaccount, device, OBU re-binds (D123) | Save of an edit | — | individual |
| CB-OP-39 | OPEX | `periodWrites.ts:childrenOfChain:312-324` (`:492`, `:513`, `:571`) | `vsb_opexprojectcosts` | read | GET | 2 cols; `vsb_parentcost eq X`, no state filter | head save (after OP-38), child save (siblings), every delete | OP-38 on a head save | individual |
| CB-OP-40 | OPEX | `periodWrites.ts:saveOpexPeriod:497-502` | `vsb_opexprojectcosts` | update | PATCH per child (unguarded), 8 wide | 11 cascade cols (`cascadeFields` `:294-309`) | head save with children | OP-38, OP-39 | individual loop |
| CB-OP-41 | OPEX | `periodWrites.ts:saveOpexPeriod:529-536` | `vsb_opexprojectcosts` | update | PATCH per follower (unguarded), 8 wide | `vsb_startdate` only | edit whose start or months changed / drifted (D118) | OP-40 | individual loop |
| CB-OP-42 | OPEX | `periodWrites.ts:resolveOpexGroupTarget:186-197`, `resolveDeviceType:234-265` | accounts, subaccounts, gen/PV types, device types | read | GET ×2; GET ×2 then ×1 | fallback only: no cached catalogue / no `deviceId` | rare | — | individual |
| CB-OP-43 | OPEX | `periodWrites.ts:deleteOpexPeriod:570-581` | `vsb_opexprojectcosts` | delete | DELETE per child 8 wide, then head | — | Delete | OP-39 | individual loop |
| CB-OP-44 | OPEX | `periodWrites.ts:addOpexStandardContract:749-763` | `vsb_opexprojectcosts` | read | GET | 1 col; project + standard + scope + ACTIVE | Add Standard Contract | target | individual |
| CB-OP-45 | OPEX | `periodWrites.ts:loadAssumptions:669-697` (`:768`) | `vsb_opexlandleasestandardassumptionses` | read | GET | 33 cols; type + country + technology (+ subaccount) + ACTIVE | Add Standard Contract | OP-44 (awaited after it) | individual |
| CB-OP-46 | OPEX | `periodWrites.ts:addOpexStandardContract:904-914` | `vsb_opexprojectcosts` | create | POST head, then the rest 8 wide | full column bag + binds | Add Standard Contract | OP-45, head id | individual loop |

46 distinct call sites.

## PM A: Generators, Production, Revenues, Finance

HTTP: GET = `retrieveMultipleRecordsAsync` (via `fetchPage`/`fetchAll`), POST = create, PATCH = update (upsert, no `If-Match`),
DELETE, ACTION = `executeAsync` (`CreateMultiple`/`UpdateMultiple`), FLOW = cloud flow `Run`, SQL = Fabric SQL connector `getAll`.

##### Generators

| OpID | Screen | Caller file:function:line | Table (entity set) | Op | HTTP | Query / payload | Trigger & frequency | Depends on | Kind |
|---|---|---|---|---|---|---|---|---|---|
| PA-OP-01 | Generators | `data/generators.ts:loadGeneratorsProject:111` | vsb_projects | read | GET | 16-col `$select`, `vsb_projectid eq`, top 1 | mount/prefetch, every save that touches PROJECT, focus >30 s | — | individual |
| PA-OP-02 | Generators | `data/generators.ts:loadGeneratorsProject:109` (`countries?.()` → `queries.ts:39` `fetchQuery(countriesQueryOptions)`) | vsb_countries | read | GET | shared list, 30 min | beside PA-OP-01 when not cached | — | individual (shared cache) |
| PA-OP-03 | Generators | `data/generators.ts:loadGeneratorsProject:126` | vsb_countries | read | GET | 3 cols, top 1 | **dead while `countryFromSharedList` = true** | PA-OP-01 | individual |
| PA-OP-04 | Generators | `data/generators.ts:loadProjectPlanning:160` | vsb_projectplannings | read | GET | 3 cols, top 1 | mount/prefetch | — | individual |
| PA-OP-05 | Generators | `data/generators.ts:listOrderableGenerators:215` | vsb_generators | read | GET (fetchAll) | 18 cols, `earliestphaseout gt FID`, orderby displayname | type/replace panel open (lazy), 30 min | PA-OP-01 (FID) | individual, multi-page |
| PA-OP-06 | Generators | `data/generators.ts:listGeneratorsByIds:229` | vsb_generators | read | GET ×⌈G/40⌉ (4 at once) | 18 cols, `id in (…)` | mount; key change after type add/remove | PA-OP-07 | individual chunks |
| PA-OP-07 | Generators, Production, Finance | `data/generators.ts:listGeneratorTypes:240` | vsb_generatortypeinprojects | read | GET | 12 cols, project filter, createdon asc | mount/prefetch; reload after WTG saves; Production generation inputs; Finance turbine count | — | individual |
| PA-OP-08 | Generators, Production | `data/generators.ts:listProjectTurbines:284` | vsb_generatorinprojects | read | GET ×⌈T/40⌉ | 10 cols, `vsb_moduletypeinprojectid in` | after types; reload; PV delete/replace Identify; Production generation | PA-OP-07 | chunks |
| PA-OP-09 | Generators | `data/generators.ts:listProjectTurbinesByProject:329` | vsb_generatorinprojects | read | GET | polymorphic navigation filter | **inactive** (`readsByProject` false) | — | individual |
| PA-OP-10 | Generators | `data/generators.ts:listPvModules:346` | vsb_pvmodules | read | GET (fetchAll) | 3 cols, whole table | mount/prefetch, 30 min | — | individual |
| PA-OP-11 | Generators, Production | `data/generators.ts:listPvTypes:359` | vsb_pvmoduletypeinprojects | read | GET | 14 cols | mount/prefetch; reload; Production generation | — | individual |
| PA-OP-12 | Generators | `data/generators.ts:listInverterTypes:409` + `catalogueSuppliers:399` | vsb_invertertypeinprojects → vsb_inverters | read | GET + GET ×⌈I/40⌉ | 15 cols; then 2 cols `id in` | mount/prefetch; reload | sequential inside one queryFn | individual |
| PA-OP-13 | Generators | `data/generators.ts:listSubstructureTypes:449` + `catalogueSuppliers:401` | vsb_substructuretypeinprojects → vsb_substructures | read | GET + GET ×⌈S/40⌉ | 11 cols; then 2 cols | as above | sequential | individual |
| PA-OP-14 | Generators | `data/generators.ts:listPlantSupplierCatalogue:489/497` | vsb_inverters / vsb_substructures | read | GET (fetchAll) | 3 cols, whole table | inverter / substructure panel open, 30 min | — | individual |
| PA-OP-15 | Generators | `data/generators.ts:listSimpleTypes:509/524/538` | storage / hydrogen / substation type tables | read | GET ×3 | 5–6 cols | mount/prefetch; reload of that family | — | individual |
| PA-OP-16 | Generators | `data/generators.ts:loadDeviceCosts:570` | vsb_devicecosts | read | GET (fetchAll) | 4 cols, 4 device types, **all countries** (country picked in browser) | PV/inverter/substructure panel open (lazy), 30 min | PA-OP-01 (key only) | individual |
| PA-OP-17 | Generators | `hooks.ts:useInflationIndex:182` → `data/milestones.ts:loadPriceInflation` | vsb_estimationpriceinflations | read | GET | (milestones module) | type/turbine/replace panel (lazy), 30 min | FID | individual |
| PA-OP-18 | Generators | `data/generators.ts:listAllWtgLandLeaseCosts:594` | vsb_landleaseprojectcosts | read | GET | 4 cols, project + AllWTG | type/turbine/pv panel (lazy, default 30 s stale); replace Identify | — | individual |
| PA-OP-19 | Generators | `data/generators.ts:loadTypeName:613` | type tables | read | GET top 1 | fallback only when the create response lacks `vsb_name` | rare | create | individual |
| PA-OP-20 | Generators | `data/generators.ts:listDeviceTypes:627` | vsb_devicetypesinprojects | read | GET | 2 cols | opex guard on row selection; delete/replace Identify; fallback new-type inputs | — | individual |
| PA-OP-21 | Generators | `data/generators.ts:hasActiveOpexCostOn:688` (via `loadOpexDependency:710`, `hooks.ts:useOpexDependency:291`) | vsb_opexprojectcosts | read | GET top 1 per 40 bridges, sequential | id only | each newly selected WTG/PV type (default 30 s) | PA-OP-20 | individual |
| PA-OP-22 | Generators | `data/generators.ts:listOpexCostIdsForBridges:669/681` | vsb_opexprojectcosts | read | GET heads ×⌈B/40⌉, then members ×⌈H/40⌉ (4 at once) | 2 cols | delete / replace Identify | PA-OP-20 | chunks |
| PA-OP-23 | Generators | `data/generators.ts:findPvUnit:720` | vsb_generatorinprojects | read | GET top 1 | id | PV edit follow-up | — | individual |
| PA-OP-24 | Generators | `data/generators.ts:loadTurbineAllocationRows:734` | vsb_landleaseallocationwtgs | read | GET ×⌈T/40⌉ | 3 cols | turbine/type/PV delete, replace Identify | turbine ids | chunks |
| PA-OP-25 | Generators | `data/generators.ts:loadTurbineAllocations:756` | vsb_landleaseallocationwtgs | read (count by rows) | GET ×⌈C/40⌉ | 2 cols, every allocation of the costs (no aggregate on the SDK) | turbine/type/PV delete | PA-OP-24 | chunks |
| PA-OP-26 | Generators | `features/pm/generators/plans.ts:planCreateGeneratorType:312` | vsb_generatortypeinprojects | create | POST | type with binds + OBU | Add WTG Type, Replace | — | individual |
| PA-OP-27 | Generators | `plans.ts:333` (flag off) / `:330` (flag on) | vsb_generatorinprojects | create ×N | POST ×N (16 wide) / ACTION CreateMultiple | name, bind to `createdRowRef(0)`, capacity, heights, OBU | Add WTG Type, Replace | PA-OP-26 | **individual today** |
| PA-OP-28 | Generators | `plans.ts:projectWtgRollup:208`; simple `rollback.ts:573,594`; PV/inverter/substructure roll-ups (`rollback.ts`, `panelPlans.ts`) | vsb_projects | update | PATCH | plant capacity/cost columns | **every** Generators save/delete | after children | individual; **fires `LoadDevexCapexCostTotalCapacityTrigger`** |
| PA-OP-29 | Generators | `plans.ts:deviceTypeShadow:373` | vsb_devicetypesinprojects | create | POST | name, type bind, OBU | follow-up of new WTG/PV type, replace | type name | individual |
| PA-OP-30 | Generators | `plans.ts:allocationCreates:221` / `allocationStep:257` | vsb_landleaseallocationwtgs | create ×N·L | POST ×N·L / ACTION | name, cost + turbine binds, OBU | new type, new turbine, PV G7, replace | turbines | **individual today** |
| PA-OP-31 | Generators | `plans.ts:planSaveTurbine:494-496` | vsb_generatorinprojects | create/update | POST/PATCH | full turbine record incl. binds | turbine panel Save | — | individual |
| PA-OP-32 | Generators | `plans.ts:515,564` (off) / `:538,559` (on) | vsb_generatorinprojects | update ×siblings | PATCH ×k / ACTION | changed fields + OBU | apply-to-all | PA-OP-31 | individual today |
| PA-OP-33 | Generators | `plans.ts:532, 616` | vsb_generatortypeinprojects | update | PATCH | 4 totals (+ project bind/OBU on delete) | turbine save/delete | — | individual |
| PA-OP-34 | Generators | `plans.ts:planDeleteTurbine:611-612`; `landLeaseCleanupWrites:124` | allocations / LL costs / turbine | delete | DELETE (16 leaf, 4 cascade) | — | delete turbine | PA-OP-24/25 | individual |
| PA-OP-35 | Generators | `plans.ts:planDeleteGeneratorType:681-689` | allocations, vsb_opexprojectcosts, LL costs, type | delete | DELETE | type `confirm`; turbines + device types by Dataverse cascade | delete WTG type | PA-OP-22/24/25 | individual |
| PA-OP-36 | Generators | `plans.ts:planToggleStatus:707,720` (off) / `:716` (on) | type + turbines | update | PATCH ×(N+1) / ACTION | `statecode` | Activate/Deactivate | — | individual today |
| PA-OP-37 | Generators | `rollback.ts:planSavePvType:333`, `planPvFollowUp:372`, `planDeletePvType:485`, `planDeleteInverterOrSubstructure:517`, `planSaveSimple:549`, `planDeleteSimple:584`; `panelPlans.ts:248,418` | PV/inverter/substructure/simple tables, units, project | create/update/delete | POST/PATCH/DELETE | row + roll-up | panel saves/deletes | — | individual |
| PA-OP-38 | Generators | `replacePlans.ts:127,174,260,300` | O&M re-links, units, bridges, type, new type, units, allocations | update/delete/create | mixed | detach → delete → add → follow-up | Replace WTG / PV | PA-OP-41 Identify | individual today |
| PA-OP-39 | Generators | `rollback.ts:planRollbackCreate:106` | landed rows | delete | DELETE | — | **inactive** (`createRollback` false) | — | individual |
| PA-OP-40 | Generators | `data/generatorsBulk.ts:readExisting:357` | bulk tables | read | GET ×⌈N/40⌉ (8 at once) | primary key only | before every `updateMany` (inactive today) | — | guard |
| PA-OP-41 | Generators | `hooks.ts:loadReplaceInputsInWaves:486`, `loadDeleteInputsInWaves:447`, `loadPvDeleteInputs:463` | (composite of PA-OP-08/18/20/22/24/25) | read graph | GET | — | delete / replace plan step | — | individual |
| PA-OP-42 | Generators | `hooks.ts:useModulePermissionFlows.request:385` → `data/flows.ts:requestModulePermission:175` | flow RequestModulePermission | flow | FLOW | requester mail, approval group, app id, project JSON | out-of-country WTG save/replace, inverter/substructure Other Supplier save (job `then`) | the row create | flow |
| PA-OP-43 | Generators | `hooks.ts:cancel/cancelIfOpen:393-400` → `data/flows.ts:cancelModulePermission:193` | flow Requestpermissioncancellation | flow | FLOW | requester mail, app id, module JSON | card Cancel; before delete/replace of a type with `FlowRunId` | — | flow |
| PA-OP-44 | Generators (and every PM screen) | `queries.ts:prefetchGenerators:101`, called from `app/bootPrefetch.ts:55` and `app/generatorsWarmup.ts:51` | PA-OP-01,02,04,07,10,11,12,13,15 | read | GET ×10 (+countries, +supplier chunks) | — | boot deep link; **1.5 s after any other PM screen opens**, once per project per page load | — | prefetch |

##### Production

| OpID | Screen | Caller | Table | Op | HTTP | Query / payload | Trigger & frequency | Depends on | Kind |
|---|---|---|---|---|---|---|---|---|---|
| PA-OP-45 | Production | `data/production.ts:loadProductionProject:55` | vsb_projects | read | GET top 1 | 17 cols | mount; plan step `rollUp` (`hooks.ts:181`); reload after every job | — | individual |
| PA-OP-46 | Production | `data/production.ts:listStandardRevenueAssumptions:91` | Fabric `AssumptionsRevenue` | read | SQL | country + 2 value types | after project, 30 min | PA-OP-45 (country name) | connector |
| PA-OP-47 | Production | `data/production.ts:listEnergyYields:115` | vsb_energyyields | read | GET | 20 cols | mount; save/delete/status plan step; `rollUp` step; reload | — | individual |
| PA-OP-48 | Production | `data/production.ts:loadStoredSeasonality:146` | vsb_pvseasonalityvalueses | read | GET top 1 | 14 cols | edit panel open; save plan step | yield id | individual |
| PA-OP-49 | Production | `data/production.ts:listStoredNegativePrices:163` | vsb_pvnegativepriceses | read | GET | 4 cols | edit panel; save plan step | yield id | individual |
| PA-OP-50 | Production | `data/production.ts:listProjectRevenues:182` | vsb_projectrevenues | read | GET | 4 cols | every save/delete/status plan step | — | individual |
| PA-OP-51 | Production | `data/production.ts:loadGenerationInputs:340-352` (types, PV types, O&M subaccount; then assumptions, 2 standard-contract counts, turbines chunks, device types chunks, country inflation) | 9 tables | read | GET ×(3 + 5+) in 2 waves | narrow except PA-OP-07/11/08 (12/14/10 cols for ids/names only) | generation job (once per project, when `shouldGenerate`) | PA-OP-45 | individual |
| PA-OP-52 | Production | `features/pm/production/rules.ts:planSaveYield:1349-1389` | yield, seasonality, negative prices, revenues | create/update/delete | POST/PATCH/DELETE | yield first alone, the rest one 16-wide group | yield Save | PA-OP-47..50 | individual |
| PA-OP-53 | Production | `rules.ts:planDeleteYield:1410`, `planStatusChange:1422`, `revenueSyncWrites:1401` | yield, revenues | delete/update | DELETE/PATCH | + revenue sync group | Delete / status | PA-OP-47/50 | individual |
| PA-OP-54 | Production | `rules.ts:planRollUp:1478` (via `hooks.ts:rollUp:180-186`) | vsb_projects | update | PATCH | yield totals | `then` of every action | fresh PA-OP-45/47 | individual |
| PA-OP-55 | Production | `rules.ts:planStandardContracts:1682-1849` | LL costs, LL allocations (costs × all units), LL periods, OPEX heads/periods, O&M per device type, project flags | create ×many, update | POST (dependency waves, **8 wide**), PATCH flags last | full records with binds + OBU | generation job | PA-OP-51 | individual; flags fire 3 async plugins |

##### Revenues

| OpID | Screen | Caller | Table | Op | HTTP | Query / payload | Trigger & frequency | Depends on | Kind |
|---|---|---|---|---|---|---|---|---|---|
| PA-OP-56 | Revenues | `data/revenues.ts:loadRevenueProject:62` (+ states via `hooks.ts:86` 30 min) | vsb_projects (+ vsb_projectstates) | read | GET (+GET) | shared PM select | mount, focus | — | individual |
| PA-OP-57 | Revenues | `data/revenues.ts:listRevenueContracts:123` | vsb_projectrevenues | read | GET | contract + flag cols | mount; contract Save/Delete reload (awaited) | — | individual |
| PA-OP-58 | Revenues | `data/revenues.ts:listBalancingPrices:135` | vsb_balancingprices | read | GET | balancing cols | mount; balancing reload | — | individual |
| PA-OP-59 | Revenues | `data/revenues.ts:listIndividualVolumes:162` | vsb_revenueindividualhedgevolumes | read | GET | all cols, by contract | edit of an Individual contract | — | individual |
| PA-OP-60 | Revenues | `data/revenues.ts:listIndividualVolumeIds:187` | vsb_revenueindividualhedgevolumes | read | GET | id | every contract Edit Save (fresh, D136 §4) | — | individual |
| PA-OP-61 | Revenues | `data/revenues.ts:hasNegativePriceProduction:200` | vsb_energyyields | read | GET top 1 | id | mount | — | individual |
| PA-OP-62 | Revenues | `data/revenues.ts:loadFirstRevenueSubaccount:214` | vsb_revenuesubaccounts | read | GET top 1 | 2 cols | mount, 30 min | — | individual |
| PA-OP-63 | Revenues | `data/revenues.ts:listRevenueAssumptionRows:228` → milestones loader | Fabric `AssumptionsRevenue` | read | SQL | country slice | after project, 30 min | PA-OP-56 | connector |
| PA-OP-64 | Revenues | `data/revenues.ts:findCurrency:246` | transactioncurrencies | read | GET | 3 cols, ISO filter | after project, 30 min | PA-OP-56 | individual |
| PA-OP-65 | Revenues | `data/revenues.ts:listRevenueCountryInflation:260` → `landLease.loadCountryInflation` | vsb_countryinflationprofiles | read | GET | — | after project, 30 min | PA-OP-56 | individual |
| PA-OP-66 | Revenues | `data/revenues.ts:listOverlappingContracts:276` | vsb_projectrevenues | read | GET | 4 cols, date window | percentage-hedge Save | — | individual |
| PA-OP-67 | Revenues | `features/pm/revenues/rules.ts:planSaveContract:2926-2970` | vsb_projectrevenues, vsb_revenueindividualhedgevolumes | update/create, delete ×V, create ×M | PATCH/POST, DELETE (16), POST (16) | contract first; **all stored volumes deleted, all re-created** | contract Save | PA-OP-60 | individual |
| PA-OP-68 | Revenues | `rules.ts:planDeleteContract:2980`; `planSaveBalancing:3019`; jobs `:3087-3104` | contract / balancing | delete / create/update | DELETE / POST/PATCH | volumes by cascade; balancing dates by plugin | Delete; balancing Save/Delete | — | individual |

##### Finance

| OpID | Screen | Caller | Table | Op | HTTP | Query / payload | Trigger & frequency | Depends on | Kind |
|---|---|---|---|---|---|---|---|---|---|
| PA-OP-69 | Finance | `data/finance.ts:loadFinanceProject:58` (+ states `hooks.ts:103`) | vsb_projects | read | GET top 1 | PM select + financing options | **every visit** (`refetchOnMount: "always"`), option reload | — | individual |
| PA-OP-70 | Finance | `data/finance.ts:listFinancingCategories:73` | vsb_financingcategories | read | GET | 3 cols | 30 min | — | individual |
| PA-OP-71 | Finance | `data/finance.ts:listFinancingInputsRaw:103` | vsb_financinginputs | read | GET | all INPUT_COL | every visit; every write reload | — | individual |
| PA-OP-72 | Finance | `data/finance.ts:listRepaymentAmounts:133` | vsb_financinginputsrepaymentamounts | read | GET | 4 cols | every visit; tranche reload | — | individual |
| PA-OP-73 | Finance | `data/finance.ts:listStepUpMargins:151` | vsb_financinginputstepupmarginses | read | GET | 6 cols | every visit; tranche reload | — | individual |
| PA-OP-74 | Finance | `data/finance.ts:loadTotalDevexCapex:180,185` | vsb_capexprojectcontracts → vsb_capexcosts | read | GET + GET ×⌈C/40⌉ (8 at once, 5000/page) | ids; contract + cost | Equity panel (lazy, latched) | — | individual |
| PA-OP-75 | Finance | `data/finance.ts:countActiveTurbines:219-230` | vsb_generatortypeinprojects → vsb_generatorinprojects | read | GET + GET ×⌈T/40⌉ | types 12 cols (ids used), turbines id + ACTIVE | Decommissioning card/panel (lazy, latched) | — | individual |
| PA-OP-76 | Finance | `data/finance.ts:findFinancingInputsByKey:239` | vsb_financinginputs | read | GET top 5 | id, `uniquekeystring eq` (alternate key) | tranche Save plan step | — | individual |
| PA-OP-77 | Finance | `data/finance.ts:listDebtAssumptions:256`, `listBanks:277`, `listKfwTranches:290` | Fabric Debt / Banks / KfW | read | SQL ×3 | debt by country; banks / KfW whole tables | mount, 30 min (debt after project) | debt: PA-OP-69 | connector |
| PA-OP-78 | Finance | `features/pm/finance/rules.ts:planTrancheSave:3568-3606` + `perf.ts:optimizeTrancheSavePlan:142-191` | inputs, repayments, step-ups | create/update + ×Y + ×S + deletes | POST/PATCH then one 16-wide group | **every repayment and step-up row upserted with full payload + 4 binds**, changed or not | tranche Save | PA-OP-76 | individual (bulk off) |
| PA-OP-79 | Finance | `perf.ts:optimizeTrancheSavePlan:169-179` | repayments / step-ups | createMany / updateMany | ACTION (+ guard GET) | from 5 rows/table | **inactive** (`bulkSchedules` false) | tranche | bulk |
| PA-OP-80 | Finance | `perf.ts:optimizeTrancheDeletePlan:89`, `optimizeFinancingOptionPlan:107`, `seedGroupJob:205`; `Screen.tsx:1419,1482,1910,2048,2152,2169-2184` | inputs, schedules, project | delete/update/create | mixed groups | — | delete, option switch, visit seeds, panel saves, toggles | — | individual |

---

## PM B: boot, Project Overview, PM screens, Cluster Checklist

Abbreviations:
- **Wave** is relative to the screen's own start.
- **S** = single request; **B** = bulk; **F** = flow; **H** = host call (no Dataverse round trip).
- `fetchAll` pages at `maxPageSize` 500 (`client.ts:73`). `fetchPage` reads one page and sends the caller's `top` as `$top` (`client.ts:112`).
- Every GET carries `odata.include-annotations=*` (SDK constant, D119 F6).

| OpID | Screen | Caller (file:function:line) | Table / flow | Op | HTTP | Query / payload | Trigger & frequency | Depends on | Kind |
|---|---|---|---|---|---|---|---|---|---|
| PB-OP-01 | Boot | `platform/powerClient.ts:ensureInitialized:30`; `readSession:85` | host `getContext()` | context | H | — | Once per page, at `main.tsx:15` and in the session query | — | H |
| PB-OP-02 | Boot | `data/project.ts:loadEnvironmentVariables:63-70` | `environmentvariabledefinitions` | read | GET | 3 cols; `schemaname eq` ×12 OR | Once; `staleTime` 15 min (`SessionContext.tsx:61-65`); refetched on focus once stale | session | S |
| PB-OP-03 | Boot | `data/project.ts:loadEnvironmentVariables:85-94` | `environmentvariablevalues` | read | GET | 3 cols; definition-id OR | After PB-OP-02 | PB-OP-02 | S |
| PB-OP-04 | Boot / every PM or Cost route | `data/project.ts:loadProject:171-218` via `SessionContext.tsx:sessionProjectQueryOptions:71-77` | `vsb_projects` | read | GET | 21 cols, `top 1`, no state filter | Once per project; `staleTime` 5 min; prefetched at boot (`bootPrefetch.ts:44-46`); refetched by every `qk.project(id)` invalidation | session (prefetch starts it beside the context) | S |
| PB-OP-05 | Cost routes only | `data/project.ts:loadCountry:331`, `loadCountryAreaName:348`, `loadClusterState:386` | `vsb_countries(id)`, `vsb_countryareas(id)`, `vsb_projectstates(id)` | read | GET | by id | `scope: "full"` only; a PM route uses them only as the cluster-state fallback (`project.ts:239`) | PB-OP-04 | S |
| PB-OP-06 | Shared (Overview, GD, Milestones, Check List, session fallback) | `data/generalData.ts:listProjectStates:167-190` via `data/projectStates.ts:projectStatesQueryOptions` | `vsb_projectstates` | read | GET | 7 cols, all rows | One key, `qk.generalDataProjectStates`, 30 min (D159) | — | S |
| PB-OP-07 | Boot (header) | `data/currentUser.ts:readUserRow:162-170` | `systemusers` | read | GET | 4 cols incl. `entityimage`; `top 1` | Once per session (`useCurrentUser.ts:15-17`, `staleTime: Infinity`) | session | S |
| PB-OP-08 | Boot | `data/currentUser.ts:readDirectoryEntry:177-181` | `aadusers` (Graph virtual) | read | GET | 2 cols, `top 1` | Once; starts with PB-OP-07 | session | S |
| PB-OP-09 | Boot | `data/currentUser.ts:readCountryBusinessUnits:183-187` | `vsb_countries` | read | GET | 2 cols, all rows | Once; starts with PB-OP-07; not cached under any query key | session | S |
| PB-OP-10 | Boot | `data/currentUser.ts:loadBadgeScope:247-254` | `roles` | read | GET | 3 cols; the 5 badge names AND `systemuserroles_association/any(...)` | Once | PB-OP-07 (user id) | S |
| PB-OP-11 | Boot | `data/currentUser.ts:loadBadgeScope:256-263` | `teams` | read | GET | `teamid`; `teammembership_association/any(...)` | Once | PB-OP-07 | S |
| PB-OP-12 | Boot | `data/currentUser.ts:loadBadgeScope:266-277` | `roles` | read | GET | per 40 team ids (`odata.ts:70`) | Once; `Promise.all` over the chunks | PB-OP-11 | S |
| PB-OP-13 | Any PM screen (not Generators) | `app/generatorsWarmup.ts:useGeneratorsWarmup:46-51` → `generators/queries.ts:prefetchGenerators:101-116` | 10 Generators reads (project, planning, types, PV catalogue, PV, inverter, substructure, storage, hydrogen, substation) | read | GET ×10+ | per family | Once per project per page load, 1.5 s after the screen opens | project id | S ×10 |
| PB-OP-14 | Overview | `data/projects.ts:loadProjectPage.namedRead:125-133` → `client.ts:countedPage:268` | `vsb_projects` | read | GET | 22 cols (`rules.ts:106-113`); `maxPageSize` 200; `count` on the first call only; skip-token walk | Page view, filter, sort, focus refetch (30 s); prefetched at boot | — | S |
| PB-OP-15 | Overview | `data/projects.ts:servePage:282` (`blank-probe`) | `vsb_projects` | read | GET | 1 row, null sort column | Every page view, beside PB-OP-14 | — | S |
| PB-OP-16 | Overview | `data/projects.ts:servePage:355,375` | `vsb_projects` | read | GET | blank tail, 1 or 2 aligned pages | Only on a page that reaches the blank tail | PB-OP-14/15 | S |
| PB-OP-17 | Overview | `project-main/hooks.ts:useProjectPage:188-204` | as PB-OP-14/15 | read | GET ×2 | next page through the cached token | 1.5 s after each served page, while `hasNext` | the served page | S |
| PB-OP-18 | Overview | `data/projects.ts:listCountries:495-502` (key `["countries"]`, `queries.ts:69`) | `vsb_countries` | read | GET | 2 cols, ACTIVE, ordered | 30 min; prefetched at boot | — | S |
| PB-OP-19 | Overview | `data/projects.ts:listCountryAreas:510-522` | `vsb_countryareas` | read | GET | 3 cols, by country | On a country filter; 30 min | filter | S |
| PB-OP-20 | Overview | `data/projects.ts:searchProjectManagers:547-576` | `systemusers` | read | GET | 4 cols, `contains`, `top` 25 | Typeahead, debounced 300 ms, ≥ 2 characters | — | S |
| PB-OP-21 | Overview | `data/projects.ts:loadProjectManagerLabel:587-600` | `systemusers` | read | GET | `top 1` | A manager filter that arrived in the URL | — | S |
| PB-OP-22 | Overview | `data/projects.ts:loadProjectStateOrder:402-433` | shared states (PB-OP-06), else `vsb_projectstates(id)` | read | GET (fallback) | by id | Row selection, Simulate click; 30 min | selection | S |
| PB-OP-23 | Overview | `data/projects.ts:loadHasBaseCase:443-452` (`Screen.tsx:746-752`) | `vsb_basecases` | read | GET | `top 1` | Each Simulate click (fresh, canvas parity) | — | S |
| PB-OP-24 | Overview | `data/projects.ts:deleteProject:482-485` (`hooks.ts:useDeleteProject:297`) | `vsb_projects` | delete | DELETE | — | Delete confirm; afterwards every `projectPage` key is invalidated and the token cache dropped | — | S |
| PB-OP-25 | General Data | `data/generalData.ts:loadGeneralDataProject:56-114` | `vsb_projects` | read | GET | 42 cols, `top 1` | Visit (30 s); prefetched at boot; after every save | — | S |
| PB-OP-26 | General Data, Milestones | `data/generalData.ts:listGeneralDataCountries:119-137` (`qk.generalDataCountries`) | `vsb_countries` | read | GET | 5 cols, all rows | 30 min; prefetched at boot | — | S |
| PB-OP-27 | General Data | `data/generalData.ts:listCountryAreas:143-152` | `vsb_countryareas` | read | GET | by country | 30 min; ×2 keys (live and saved country), usually the same key | PB-OP-25 | S |
| PB-OP-28 | General Data | `data/generalData.ts:listTerrainUtilizations:200-215` | `vsb_customchoicevalues` | read | GET | by field name and country | 30 min; always enabled (`hooks.ts:113-116`) | country | S |
| PB-OP-29 | General Data | `data/generalData.ts:listShareholders:220-239` | `vsb_shareholderentitiies` | read | GET | 5 cols, by project | Visit; after every save | — | S |
| PB-OP-30 | General Data | `data/generalData.ts:listStateTrackings:242-265` | `vsb_projectstatetrackings` | read | GET | 5 cols, by project | Visit; after every save | — | S |
| PB-OP-31 | General Data | `data/generalData.ts:searchGermanMunicipalities:288-308` | `vsb_assumptionslocaltaxgermanies` | read | GET | `startswith(state)`, `contains`, `top` 5000, **one page** | Each keystroke (no debounce, DEC-6); 30 min per term | area | S |
| PB-OP-32 | General Data | `data/generalData.ts:searchFrenchMunicipalities:315-332` | `vsb_assumptionslocaltaxfrances` | read | GET | `contains`, `top` 5000, one page | Each keystroke from the 3rd character | — | S |
| PB-OP-33 | General Data | `data/generalData.ts:lookupGermanTradeTaxRate:338-345` | `vsb_assumptionslocaltaxgermanies` | read | GET | `top 1` | Only when the tax factor is blank | PB-OP-25 | S |
| PB-OP-34 | General Data, Team | `data/adminGatesApprovals.ts:searchEntraPeople:329-338` (`general-data/hooks.ts:141-154`, `team/hooks.ts:95-109`) | `aadusers` | read | GET | `top` N | Picker typing, debounced 250 ms; 60 s | — | S |
| PB-OP-35 | General Data | `general-data/hooks.ts:useEntraPeople:160-169` → `getEntraPeople:344-356` | `aadusers` | read | GET ×(1-2) | by id, 6 in flight | 30 min under `qk.entraPeople(ids)` (its own cache) | PB-OP-25 | S |
| PB-OP-36 | General Data | `general-data/hooks.ts:useMilestoneDurations:261` → `costBook.loadMilestoneDurations` | milestones standard assumptions | read | GET | by country and technology | Cluster panel open; 30 min | PB-OP-25 | S |
| PB-OP-37 | General Data | `general-data/rules.ts:planGeneralDataSaveHead:2010-2024` | `vsb_projects` | update | PATCH ×1-2 | Patch #1, plus Patch #2 unless it is a no-op | Save | form | S |
| PB-OP-38 | General Data | `general-data/hooks.ts:cancelDraftGateApprovalIfRunning:238-259` | gates read (PB-OP-68) + Entra + **F: Perform Request of Gate Approval Cancellation** | read + flow | GET ×2+, flow | 15-field JSON | Save that changes the start cluster while the Draft approval runs | PB-OP-37 | F |
| PB-OP-39 | General Data | `general-data/rules.ts:planClusterAndEntities:2113-2181` | `vsb_projects`, `vsb_projectstatetrackings`, `vsb_shareholderentitiies` | update/create | PATCH/POST × (1 + ~7 + M + 1) | Draft return, tracking rebuild, shareholders, Draft tracking | Save (the parts that apply) | PB-OP-37 (and the flow) | S, sequential |
| PB-OP-40 | General Data (new) | `general-data/Screen.tsx:runCreate:519-545`; `rules.ts:planProjectCreate:2057-2068`, `planSaveFollowUps:2082-2096` | `vsb_projects` + children | create, then re-read and updates | POST, GET, PATCH / POST (children `concurrent`) | — | New Project save | — | S |
| PB-OP-41 | General Data | `general-data/Screen.tsx:saveClusterPanel:584-597` (`rules.ts:1809`) | `vsb_projects` | update | PATCH | milestone dates | Cluster panel save, then PB-OP-37 | — | S |
| PB-OP-42 | General Data | `general-data/rules.ts:1004` (`Screen.tsx:confirmDelete:600-612`) | `vsb_shareholderentitiies` | delete | DELETE | — | Delete confirm | — | S |
| PB-OP-43 | General Data (map) | `platform/azureMapsToken.ts:164` → `data/flows.ts:getAzureMapsSasToken:218` | **F: Get Azure Maps SAS Token** | flow | POST | no inputs | Once per token lifetime per browser (memory + `localStorage`, `azureMapsToken.ts:11`) | — | F |
| PB-OP-44 | Milestones | `data/milestones.ts:loadMilestoneProject:91-147` | `vsb_projects` (+ `vsb_countries` fallback `:107-114`) | read | GET (+1) | 30+ cols, `top 1` | Visit; after every save | PB-OP-26 (cached list) | S |
| PB-OP-45 | Milestones | `milestones/hooks.ts:useMilestoneAssumption:111-121` | milestones standard assumptions | read | GET | by country and technology | 30 min | PB-OP-44 | S |
| PB-OP-46 | Milestones | `data/milestones.ts:countIndividualVolumeContracts:156-171` | `vsb_projectrevenues` | read | GET | `top 1` | Visit | — | S |
| PB-OP-47 | Milestones | `data/milestones.ts:isMilestoneRecalculationRunning:312-330` (+ job type `:295-305`, memo 30 min) | `vsb_fabricsyncjobs` (+ `vsb_fabricjobtypes`) | read | GET (+1) | `top 1` | Visit; after every save; on focus | — | S |
| PB-OP-48 | Milestones | `data/milestones.ts:countProjectRevenues:177-184` (`hooks.ts:256-260`, and again at save `:221`) | `vsb_projectrevenues` | read | GET | `top 1` | Visit when the seed would run; each save (fresh) | PB-OP-44 | S |
| PB-OP-49 | Milestones | `milestones/hooks.ts:loadRevenueSeedInputs:190-203` | Fabric SQL `AssumptionsRevenue`, currency (EUR), revenue subaccount | read | GET ×3 parallel | — | Prefetched on visit when the seed would run; 30 min | PB-OP-48 = 0 | S |
| PB-OP-50 | Milestones | `data/milestones.ts:loadPriceInflation:214-237`, `listProjectGeneratorsForRepricing:243-280` | `vsb_estimationpriceinflations`, `vsb_generatortypeinprojects`, `vsb_generators` | read | GET ×3 (+1 per 40 generators, **sequential `for … await`**, `:254`) | — | Save when the FID moved | — | S |
| PB-OP-51 | Milestones | `milestones/rules.ts:planSaveMilestones:1402-1440` | `vsb_projects`, `vsb_generatortypeinprojects`, `vsb_projectrevenues` | update/create | PATCH, N × PATCH, PATCH, POST (sequential) | — | Save | PB-OP-50 | S |
| PB-OP-52 | Team | `data/team.ts:loadTeamProject:71-93` | `vsb_projects` + `aadusers` ×(≤2) | read | GET, then GET ×2 | 10 cols | Visit (30 s) | — | S |
| PB-OP-53 | Team | `data/team.ts:listTeamMembers:126-155` | `vsb_projectmemberses` + `aadusers` per member (cache 30 min, 6 wide) | read | GET, then GET ×k | 6 cols | Visit; after every member write | PB-OP-54 promise | S |
| PB-OP-54 | Team | `data/team.ts:listMemberDescriptions` (`:99-110`), `team/hooks.ts:78-80` | `vsb_projectmemberdescriptionses` | read | GET | whole table | 5 min | — | S |
| PB-OP-55 | Team | `team/hooks.ts:useTeamWrites:112-117` | `vsb_projectmemberses` | create/update/delete | POST/PATCH/DELETE ×1 | — | Save / Delete; reload members only | — | S |
| PB-OP-56 | Planning | `data/planning.ts:loadPlanningProject:35-54` (`qk.planning(id,"project")`, `hooks.ts:81-84`) | `vsb_projects` | read | GET | 10 cols | Visit | — | S |
| PB-OP-57 | Planning | `data/planning.ts:loadProjectPlanning:65-89`; `hooks.ts:useProjectPlanning:100-113` | `vsb_projectplannings` (+ **seed create inside the queryFn**) | read (+create) | GET (+POST, GET) | `top 1` | Visit; when there is no row: create, then re-read | — (project only for the seed) | S |
| PB-OP-58 | Planning | `data/planning.ts:listPermits:96-116` | `vsb_permits` | read | GET | by planning row | Visit | PB-OP-57 | S |
| PB-OP-59 | Planning | `data/planning.ts:listAquisitionTypes:122-138` | `vsb_aquisitiontypes` | read | GET | 2 kinds | 5 min | — | S |
| PB-OP-60 | Planning | `data/planning.ts:listAquisitionStatuses:145-172`; `hooks.ts:132-149` | `vsb_aquisitionstatuses` (+ **N seed creates inside the queryFn**) | read (+create) | GET (+N POST, GET) | by project | Visit | PB-OP-59 | S |
| PB-OP-61 | Planning | `data/planning.ts:listCustomChoiceValues:179-195` | `vsb_customchoicevalues` ×2 | read | GET ×2 | by field and country | 5 min | PB-OP-56 | S |
| PB-OP-62 | Planning | `planning/Screen.tsx:527-554` + `reload.ts:planningReloadKeys` | `vsb_projectplannings`, `vsb_permits`, `vsb_aquisitionstatuses` | C/U/D | 1 write per job | — | Save / permit / acquisition | — | S |
| PB-OP-63 | Grid Operator | `grid-operator/hooks.ts:useGridOperatorProject:46-53` (calls `loadPlanningProject`) | `vsb_projects` | read | GET | the same 10 cols as PB-OP-56, under **a different key** | Visit | — | S |
| PB-OP-64 | Grid Operator | `data/gridOperator.ts:loadGridOperator:131-152` | `vsb_gridoperators` | read | GET | `top 1` | Visit; after a save | — | S |
| PB-OP-65 | Grid Operator | `grid-operator/hooks.ts:useGridOperatorWrites:66-72` | `vsb_gridoperators` | create/update | POST/PATCH | 10 cols + binds | Save; reload the row only | — | S |
| PB-OP-66 | Check List | `data/checklist.ts:loadChecklistProject:174-181` | `vsb_projects` | read | GET | 19 cols | Visit (30 s); after every non-targeted write | — | S |
| PB-OP-67 | Check List | `data/checklist.ts:listChecklistTrackings:202-209` (query `hooks.ts:183-187`) | `vsb_projectstatetrackings` | read | GET | 11 cols | Visit; focus; after writes | — | S |
| PB-OP-68 | Check List, GD cancel path | `data/checklist.ts:listChecklistGates:243-288` → `listGateApprovals:210-237` + `entraMails:154-160` | `vsb_projectdefaultapprovalses` + `aadusers` per PM | read | GET, then GET ×k | every gate row of the country and technology, filtered on `gateActive` in the client (`:249`) | Cached by country and technology (D156), no focus refetch | PB-OP-66 | S |
| PB-OP-69 | Check List | `data/checklist.ts:listClusterChecklist:307-314` | `vsb_projectchecklists` | read | GET | 16 cols, ACTIVE | Cluster selection; focus; after writes | PB-OP-66/67 (+ states) | S |
| PB-OP-70 | Check List | `data/checklist.ts:listChecklistApprovalSettings:412-425` → `listChecklistApprovals:283-309` | `vsb_checklistdefaultapprovalses` (per 40 templates) + `aadusers` | read | GET ×c, then GET ×k | by template ids | After the rows; no focus refetch | PB-OP-69 | S |
| PB-OP-71 | Check List | `data/checklist.ts:listHistory:436-452` | the two note tables | read | GET | by tracking or task | Panel open | panel | S |
| PB-OP-72 | Check List | `checklist/hooks.ts:prepareCluster:414-416` | `vsb_projectstatetrackings` + `vsb_projectchecklists` (count) | read | GET ×2 parallel | fresh | Every cluster visit (once per cluster per visit) | sequence ready | S |
| PB-OP-73 | Check List | `data/checklist.ts:listClusterTemplates:379-405` (+ `findScopeCountryTechId`, memo) ; `listClusterCopyProbe:353-371` | `vsb_checklistcountryandtechnologies`, `vsb_projectdefaultchecklistses`, `vsb_projectchecklists` | read | GET ×1-3 | — | Only when a copy (or a complete-copy check) is needed | PB-OP-72 | S |
| PB-OP-74 | Check List | `checklist/hooks.ts:prepareCluster:434-443` (`planPrepareCluster`) | `vsb_projectchecklists` (+ tracking ensure) | create | POST × N (16 wide), or 1 `CreateMultiple` if the bulk switch is on | templates | First visit of a cluster | PB-OP-73 | S (B when the flag is on) |
| PB-OP-75 | Check List | `checklist/hooks.ts:backfill:393-403`; `rules.ts:planSkippedClusterBackfill:444-487` | `vsb_projectstatetrackings` | read, then upsert | GET, then PATCH/POST × ≤7, sequential, **unguarded** | — | Once per visit when the guard holds | PB-OP-66/67 | S |
| PB-OP-76 | Check List | `checklist/hooks.ts:patchRow:446-453` | `vsb_projectchecklists` | guarded update | GET + PATCH | 1 to 3 cols | Complete / In Progress / date / comment; reload rows only | — | S |
| PB-OP-77 | Check List | `checklist/hooks.ts:saveTransition:456-476`; `rules.ts:planClusterTransition:1498-1565` | trackings ×2 (guarded), note, `vsb_projects` | reads, then writes | GET ×2 ‖, then (GET+PATCH)×2, POST, PATCH — sequential | — | Move to next cluster; plus the `warmCopy` reads (`:358-369`) | — | S |
| PB-OP-78 | Check List | `checklist/hooks.ts:returnToPrevious:479-496` | trackings, note | read + writes | GET, then writes | — | Reset to … | — | S |
| PB-OP-79 | Check List | `checklist/hooks.ts:changeTerminal:499-505` | trackings, `vsb_projects` | read + writes | GET, then writes | — | Abandon / Inactivate / Activate | — | S |
| PB-OP-80 | Check List | `checklist/hooks.ts:requestApproval (cluster):535-566` | trackings; **F: Perform Common Request of Gate Approval**; poll ≤ 20 × `readClusterTracking` (`:79-92`); rows; note | read, write, flow, poll, write | GET, PATCH/POST, flow, GET ×≤20, GET, POST | — | Request Approval (cluster) | each step on the previous | F |
| PB-OP-81 | Check List | `checklist/hooks.ts:requestApproval (checklist):512-533` | `readClusterTask`; guarded patch; **F: Perform Common Request of Check List Approval**; write-back + note | read, write, flow, writes | GET, GET+PATCH, flow, GET+PATCH, POST | — | Request Approval (task) | sequential | F |
| PB-OP-82 | Check List | `checklist/hooks.ts:cancelGateApproval:570-593` | trackings; guarded patch; **F: Perform Request of Gate Approval Cancellation**; note | read, write, flow, write | GET, GET+PATCH, flow, POST | 13-field JSON | Cancel Approval Request | sequential | F |
| PB-OP-83 | Check List | `checklist/hooks.ts:cancelChecklistApproval:596-605` | **F: Perform Request of Check List Approval Cancellation** | flow | flow | checklist id | Row ✕; then reload | — | F |
| PB-OP-84 | Check List | `checklist/hooks.ts:refresh:612-620` | every checklist key + states + gates | invalidate | GET × all active | — | Command-bar Refresh | — | S |
| PB-OP-85 | Every PM save | `data/usePlanWrite.ts:onSettled:202-205` | the hook's `invalidate` list | refetch | GET × active keys | awaited by default | After every job | the job | S |

Two exported functions have no caller (grep, excluding tests): `searchProjects` (`data/project.ts:422`) and `canReadProject` (`data/projects.ts:612`). `canReadProject` calls `Vsb_projectsService.getAll` directly, with no `unwrap` and no `loggedCall` (CONVENTIONS rules 3 and 23), so it must not be revived as it is.

---

## Admin screens and the shared write engine

Abbreviations: `fA` = `fetchAll` (pages of 500, follows skip token), `fP` = `fetchPage` (one page), `G+P` = guarded update (`updateRecordIfExists`: 1 GET by key + 1 PATCH, `data/client.ts:435-449`).
"Per row" counts are requests per row. All writes are individual requests (D36 §1); no admin call site uses an action.

##### Write engine and shared primitives

| OpID | Screen / engine | Caller file:function:line | Table | Op type | HTTP | Query / payload | Trigger & frequency | Depends on | Ind./bulk/action |
|---|---|---|---|---|---|---|---|---|---|
| AD-OP-01 | engine | `executePlan.ts:sendWrite:319-324` | any plan set | create | POST | resolved `data` (refs substituted), `Prefer: return=representation` (SDK) | per `create` write | earlier creates (`createdRowRef`) | individual |
| AD-OP-02 | engine | `executePlan.ts:sendWrite:351-356` | any | update (plain) | PATCH (upsert, no `If-Match`) | `data` | per unguarded update (PM plans) | — | individual |
| AD-OP-03 | engine | `executePlan.ts:sendWrite:339-342` → `client.ts:updateRecordIfExists:435-449` | any | guarded update | GET (`$select=<pk>`, `$filter=<pk> eq id`, `maxPageSize 1`) then PATCH | `data` | per `guardedUpdate` (every admin single-row update) | GET → PATCH sequential | individual (2 req) |
| AD-OP-04 | engine | `executePlan.ts:sendWrite:377` | any | delete | DELETE | — (404 / 0x80040217 = done, `errors.ts:74-76`) | per plain delete | — | individual |
| AD-OP-05 | engine | `executePlan.ts:sendWrite:364-367` | any | hardened delete | DELETE ×≤3 | retry 429/500/504/503+RA/network once (`retry.ts:120-139`) | opt-in (Generators etc.; no admin caller) | — | individual |
| AD-OP-06 | engine | `executePlan.ts:confirmDeletes:490` → `verifyGone.ts:59-73` | any | read-back | GET | `idIn(pk, ≤40 ids)`, 4 wide | after a step with "gone"/confirmed hardened deletes | the step | individual |
| AD-OP-07 | engine | `executePlan.ts:sendBulk:416,427` | any | createMany / updateMany | action | via `getBulkBackend()` | opt-in (no admin caller; banned D36 §1) | earlier steps | bulk action |
| AD-OP-08 | shared | `client.ts:deleteRecord:133-140` | any | delete | DELETE | `unwrap` → **404 throws** | admin per-row deletes | — | individual |
| AD-OP-09 | shared | `adminRowWrites.ts:updateRowsEach:89-104` | any | guarded update ×N | GET+PATCH per row | `mapLimit` 8, fail-fast | admin multi-row updates | — | individual (2/row) |

##### CAPEX Accounts (`features/admin/admin-capex-accounts`)

| OpID | Screen | Caller file:function:line | Table | Op | HTTP | Query / payload | Trigger & frequency | Depends on | Ind./bulk |
|---|---|---|---|---|---|---|---|---|---|
| AD-OP-10 | CAPEX Accounts | `adminCapexAccounts.ts:loadCapexAccountRows:66-78` (hook `hooks.ts:useCapexTree:26-31`) | `vsb_capexaccountlists` | read | GET fA | 6 cols, **no filter** (inactive included) | every mount (`refetchOnMount: "always"`) and **every window focus** (`staleTime: 0`); after every write | — | individual |
| AD-OP-11 | CAPEX Accounts | `adminCapexAccounts.ts:hasContracts:105-112` (hook `hooks.ts:useHasContracts:49-56`, ids `Screen.tsx:152-158`) | `vsb_capexprojectcontracts` | read | GET fP | `_vsb_account_value eq id`, 1 col, `maxPageSize 1` | **one query per subaccount of every expanded account** + selected leaf account; `staleTime 30 s`, focus refetch, default retry | tree | individual (N) |
| AD-OP-12 | CAPEX Accounts | `adminCapexAccounts.ts:numberExists:81-88` | `vsb_capexaccountlists` | read | GET fP | `vsb_number eq …`, top 1 | Create account/subaccount | — (parallel with 13, `:244`) | individual |
| AD-OP-13 | CAPEX Accounts | `adminCapexAccounts.ts:maxChildOrder:132-145` | `vsb_capexaccountlists` | read | GET fP | parent filter, `vsb_order desc`, top 1 | Create | — | individual |
| AD-OP-14 | CAPEX Accounts | `adminCapexAccounts.ts:createCapexAccount:250-258` | `vsb_capexaccountlists` | create | POST | name, number, order, parent bind | Create | 12, 13 | individual |
| AD-OP-15 | CAPEX Accounts | `adminCapexAccounts.ts:createCapexAccount:262` | `vsb_capexaccountlists` | guarded update | G+P | `statecode 1, statuscode 2` | Create (canvas two-write, D19) | 14 | individual (2) |
| AD-OP-16 | CAPEX Accounts | `rules.ts:planRenameAccount:585-588` via `runPlan` (`Screen.tsx:269,315`) | `vsb_capexaccountlists` | guarded update | G+P | `{ vsb_name }` (changed field only) | Edit save | — | individual (2) |
| AD-OP-17 | CAPEX Accounts | `rules.ts:planActivateAccount/Subaccount:596-606` (`Screen.tsx:413,423`) | `vsb_capexaccountlists` | guarded update | G+P | state only | Activate | — | individual (2) |
| AD-OP-18 | CAPEX Accounts | `adminCapexAccounts.ts:saveCapexOrder:282-287` (`Screen.tsx:355`) | `vsb_capexaccountlists` | guarded update ×N | G+P per row, 8 wide | `{ vsb_order }`, changed rows only (`reorderDiff`) | Reorder save | — | individual (2/row) |
| AD-OP-19 | CAPEX Accounts | `adminCapexAccounts.ts:deleteCapexSubaccount:301-304` | contracts / accounts | read + delete | GET fP → DELETE | contract re-check then delete | Delete subaccount | sequential | individual |
| AD-OP-20 | CAPEX Accounts | `adminCapexAccounts.ts:deleteCapexAccount:307-316` | accounts / contracts | 2 reads ‖ + delete | GET ‖ GET → DELETE | children + contracts guards | Delete account | sequential after guards | individual |
| AD-OP-21 | CAPEX Accounts | `adminCapexAccounts.ts:listChildIds:118-125` (`:503`) | `vsb_capexaccountlists` | read | GET fA | parent filter, id only | Deactivate account | — | individual |
| AD-OP-22 | CAPEX Accounts | `adminCapexAccounts.ts:accountStatusSteps:478-490` | `vsb_capexaccountlists` | guarded update 1 + S | G+P; subaccounts 8 wide | state only | Deactivate account / subaccount (`:509-511`) | 21 | individual (2/row) |
| AD-OP-23 | CAPEX Accounts (background) | `adminCapexAccounts.ts:cleanUpForecastCosts:384-388` (`Screen.tsx:216-227`) | `vsb_capexprojectcontracts` | read | GET fA per 40 account ids, 4 wide | id only | after each deactivation, background | 22 | individual |
| AD-OP-24 | CAPEX Accounts (background) | `adminCapexAccounts.ts:cleanUpForecastCosts:392-403` | `vsb_capexcosts` | read ×2 per chunk | GET fA ×2 per 40 contract ids, 4 chunks wide (≤8 reads in flight) | id only; zero filter `:335-337`, delete filter `:340-342` | same | 23 | individual |
| AD-OP-25 | CAPEX Accounts (background) | `adminCapexAccounts.ts:cleanUpForecastCosts:410` | `vsb_capexcosts` | guarded update ×Z | G+P per row, 8 wide, fail-fast | `{ vsb_cost: 0 }` | same | 24 | individual (2/row) |
| AD-OP-26 | CAPEX Accounts (background) | `adminCapexAccounts.ts:cleanUpForecastCosts:411-416` | `vsb_capexcosts` | delete ×D | DELETE, 16 wide, fail-fast, no retry, 404 = failure | — | same, side by side with 25 | 24 | individual |
| AD-OP-27 | CAPEX Accounts | `hooks.ts:useCapexWrite:89` + `Screen.tsx:225` → `adminInvalidation.ts:74-79` | tree (+ any mounted Cost query) | refetch | GET fA | 8 keys; only mounted ones refetch | after every write (awaited) AND after each clean-up | write | individual |

##### Milestones

| OpID | Screen | Caller | Table | Op | HTTP | Query / payload | Trigger | Depends | Ind. |
|---|---|---|---|---|---|---|---|---|---|
| AD-OP-28 | all admin | `data/countries.ts:59-69` (`useActiveCountries` / `useCountries`) | `vsb_countries` | read | GET fA | `COUNTRY_SELECT`, `vsb_name asc`, key `qk.adminCountries`, 30 min | first admin screen visit; shared by 5 screens | — | individual |
| AD-OP-29 | Milestones | `adminMilestones.ts:listMilestoneAssumptions:74-85` (`hooks.ts:164-172`) | `vsb_milestonesstandardassumptionses` | read | GET fA | 13 cols, `ACTIVE`, whole table | mount (stale 5 min), no focus refetch | — | individual |
| AD-OP-30 | Milestones | `adminMilestones.ts:saveMilestonePatches:114-137` | same | guarded update ×N | G+P per changed row, 8 wide, collect-all | changed columns only | Save | — | individual (2/row) |

##### Costs (DEVEX / OPEX / Land Lease standards)

| OpID | Screen | Caller | Table | Op | HTTP | Query / payload | Trigger | Depends | Ind. |
|---|---|---|---|---|---|---|---|---|---|
| AD-OP-31 | Costs | `adminCost.ts:loadCapexHierarchy:260-276` | `vsb_capexaccountlists` | read | GET fA | 5 cols, `ACTIVE` | mount, 30 min | — | individual |
| AD-OP-32 | Costs | `adminCost.ts:listLandLeaseSubaccounts:279-288` | `vsb_landleasesubaccounts` | read | GET fA | 3 cols, ACTIVE | mount, 30 min | — | individual |
| AD-OP-33 | Costs | `adminCost.ts:listOpexSubaccounts:294-306` | `vsb_opexsubaccounts` + `vsb_opexaccounts` | read ×2 ‖ | GET fA ×2 | client join (no `$expand`) | mount, 30 min | — | individual |
| AD-OP-34 | Costs | `adminCost.ts:listCostCurrencies:326-335` | `transactioncurrencies` | read | GET fA | 3 cols, no filter | mount, 30 min | — | individual |
| AD-OP-35 | Costs | `adminCost.ts:loadCostPayerDefaults:348-361` | `vsb_spvdevcomappingcapexdevexes` | read | GET fA | 3 cols, ACTIVE | mount, 30 min | — | individual |
| AD-OP-36 | Costs | `adminCost.ts:listInflationAreas:338-345` | `vsb_countryinflationprofiles` | read | GET fA | country + ACTIVE | Italy only, 30 min | selection | individual |
| AD-OP-37 | Costs | `adminCost.ts:listDevexCosts:392-399` (`hooks.ts:59-65`) | `vsb_devexcapexstandardassumptionses` | read | GET fA | 16 cols, scope + ACTIVE | per scope; default 30 s stale + focus | selection | individual |
| AD-OP-38 | Costs | `adminCost.ts:listOpexPeriods:466-473` (`hooks.ts:66-72`) | `vsb_opexlandleasestandardassumptionses` | read | GET fA | 38 cols, scope + ACTIVE | per scope; 30 s + focus | selection | individual |
| AD-OP-39 | Costs | `adminCost.ts:listInactiveOpexRows:481-497` (`hooks.ts:78-84`) | same | read | GET fA | 5 cols, scope + `statecode ne 0` | per scope; 30 s + focus | selection | individual |
| AD-OP-40 | Costs | `rules.ts:planSaveDevexCost:561-570` via `runPlan` (`hooks.ts:116-131`) | devex | create / guarded update | POST / G+P | full record `devexPayload` (`rules.ts:523-545`) | DEVEX save | — | individual |
| AD-OP-41 | Costs | `rules.ts:planDeleteDevexCost:580-585` | devex | delete | DELETE | — (sync plugin cascade, §E) | DEVEX delete | — | individual |
| AD-OP-42 | Costs | `adminCost.ts:listContractRows:502-513` (from `saveOpexPeriod:777,783,823`, `deleteOpexContract:867`, `deleteOpexPeriod:899,909`, `repairLastFlags:728,737`) | opex | read | GET fA | 3 cols, contract filter, any state | integrity re-reads | — | individual |
| AD-OP-43 | Costs | `adminCost.ts:saveOpexPeriod:800,803-806` | opex | create / guarded update | POST / G+P | full `opexPayload` (`:637-667`), minus inflation when unchanged | OPEX/LL save | 42 (new/add) | individual |
| AD-OP-44 | Costs | `adminCost.ts:saveOpexPeriod:837-840` | opex | guarded update ×k | G+P per later period, 8 wide | `propagationFields` (`:615-634`), always sent (S6-07) | Period-1 edit | 43 → 42 re-read | individual (2/row) |
| AD-OP-45 | Costs | `adminCost.ts:applyFlagUpdates:684-696` | opex | guarded update ×f | G+P, **sequential** | `{ vsb_islastperiod }` | add period / edit / delete period / repair (f usually 0–2) | 42 | individual |
| AD-OP-46 | Costs | `adminCost.ts:deleteOpexContract:871-883` | opex | delete ×≤10 | DELETE sequential, tail first (deliberate) | — | Delete contract | 42 | individual |
| AD-OP-47 | Costs | `adminCost.ts:deleteOpexPeriod:906` | opex | delete | DELETE | — | Delete last period | 42 | individual |
| AD-OP-48 | Costs | `hooks.ts:130,139,148,157,166` → `adminInvalidation.ts:112-132` | scope lists | refetch | GET fA | DEVEX: devex(scope) + project standards prefix; OPEX: opex(scope) (+inactive) + LL/OPEX project prefixes | after every write (settled) | write | individual |

##### Contracts (BoP standard contracts)

| OpID | Screen | Caller | Table | Op | HTTP | Query / payload | Trigger | Depends | Ind. |
|---|---|---|---|---|---|---|---|---|---|
| AD-OP-49 | Contracts | `adminContract.ts:listStandardContracts:149-160` | `vsb_bopcontractsstandardassumptionses` | read | GET fA | 14 cols, country+tech (no state filter) | per selection; 30 s + focus | selection | individual |
| AD-OP-50 | Contracts | `adminContract.ts:createDevCoRepository.listByScope:247-256` | `vsb_bopcontractsstandardassumptiondevcocostses` | read | GET fA | 4 cols, filter through parent lookup | per selection (30 s + focus); **again on Edit open** (`Screen.tsx:256`); **again at save** (`:333`) | selection | individual |
| AD-OP-51 | Contracts | `capexAccounts.ts:listActiveCapexAccounts:26-28` → `capexChart.ts:39` (`hooks.ts:49-57`) | `vsb_capexaccountlists` | read | GET fA (30 s memo) | active, number order | mount, 5 min | — | individual |
| AD-OP-52 | Contracts | `adminContract.ts:getStandardContract:163-169` (`hooks.ts:60-67`, `Screen.tsx:256`) | SA | read | GET by id | 14 cols | Edit open (canvas `Refresh`), `staleTime 0` | — (‖ AD-OP-50) | individual |
| AD-OP-53 | Contracts | `adminContract.ts:saveStandardContract:347-360` | SA | create / guarded update | POST / G+P | full parent payload | Save | AD-OP-50 (ownership re-check) | individual |
| AD-OP-54 | Contracts | `adminContract.ts:saveStandardContract:369` → `repo.remove:271-275` | SADC | delete ×R | DELETE 16 wide, 404 = failure | — | Save (released links) | 53 | individual |
| AD-OP-55 | Contracts | `adminContract.ts:createMany:258-269` (`:383`) | SADC | create ×A | POST 8 wide | 5 fields + binds (plugin sets root) | Save (new links) | 54 | individual |
| AD-OP-56 | Contracts | `adminContract.ts:deleteStandardContract:399-410` | SA | delete | DELETE (404 = alreadyDeleted) | — (sync plugin cascade, §E) | Delete | — | individual |
| AD-OP-57 | Contracts | `hooks.ts:74-84` → `adminInvalidation.ts:142-161` | list, DevCo, record, bop seed | refetch | GET fA | mounted ones only | after save/delete | write | individual |

##### Check List Settings (Default Checklists)

| OpID | Screen | Caller | Table | Op | HTTP | Query / payload | Trigger | Depends | Ind. |
|---|---|---|---|---|---|---|---|---|---|
| AD-OP-58 | Check List Settings | `adminDefaultChecklists.ts:listTabs:131-133` → `adminChecklistTables.ts:257-267` | `vsb_checklistcountryandtechnologies` | read | GET fA | 7 cols, all tabs | mount, 5 min | — | individual |
| AD-OP-59 | Check List Settings / Gates | `data/projectStates.ts` `projectStatesQueryOptions` (`hooks.ts:31-33`) | `vsb_projectstates` | read | GET fA | shared D159 entry, 30 min | first need | — | individual |
| AD-OP-60 | Check List Settings | `adminChecklistTables.ts:listDefaultChecklists:269-281` (`hooks.ts:36-43`) | `vsb_projectdefaultchecklistses` | read | GET fA | 10 cols, tab + not-to-delete | per tab; 30 s + focus; after every write | tabs | individual |
| AD-OP-61 | Check List Settings | `adminChecklistTables.ts:listChecklistApprovals:283-306` (`adminDefaultChecklists.ts:159-161`, `hooks.ts:52-59`) | `vsb_checklistdefaultapprovalses` | read | GET fA | 3 cols, **locking only, environment-wide** | every mount (`FRESH_ON_ENTRY_ONCE`); after Completion toggle and every gate write | — | individual |
| AD-OP-62 | Check List Settings | `adminDefaultChecklists.ts:createTask:289-299` → `adminChecklistTables.ts:308-312, 314-316` | tasks | create + guarded update | POST → G+P | create payload, then `statecode/statuscode` | Add task (canvas create-then-update, D18; flow fires twice) | — | individual (3) |
| AD-OP-63 | Check List Settings | `rules.ts:planUpdateTask/planToggleCompletion/planSetActive:483,499,515` via `runPlan` (`hooks.ts:85-123`) | tasks | guarded update | G+P | edit payload / one column / state | Edit, Completion toggle, Active toggle | — | individual (2) |
| AD-OP-64 | Check List Settings | `adminDefaultChecklists.ts:writeOrders:316-329` | tasks | guarded update ×N | G+P per row, 4 wide | `{ vsb_order }`, changed rows only | Reorder; renumber after delete | — | individual (2/row) |
| AD-OP-65 | Check List Settings | `adminDefaultChecklists.ts:softDeleteTask:346-356` | tasks | guarded update + 64 | G+P → writeOrders | `{ vsb_todelete: true }` | Delete (flow hard-deletes) | — | individual |

##### Project Gates (Approvals)

| OpID | Screen | Caller | Table | Op | HTTP | Query / payload | Trigger | Depends | Ind. |
|---|---|---|---|---|---|---|---|---|---|
| AD-OP-66 | Gates | `adminGatesApprovals.ts:listGateTemplates:496-514` (`loadDataset:650`) | `vsb_projectdefaultapprovalses` | read | GET fA | `TEMPLATE_SELECT`, country + tech code | per selection; default 30 s + focus; after every gate write | selection | individual |
| AD-OP-67 | Gates | `adminGatesApprovals.ts:findChecklistHeader:521-532` | headers | read | GET fA | country + tech | same, ‖ 66 | — | individual |
| AD-OP-68 | Gates | `adminGatesApprovals.ts:listDefaultChecklists:535-546` | tasks | read | GET fA | header + not-to-delete | same | 67 | individual |
| AD-OP-69 | Gates | `adminGatesApprovals.ts:listGateTaskApprovals:549-551` → `adminChecklistTables.ts:290-299` | task approvals | read | GET fA per 40 task ids, 4 wide | `APPROVAL_COLUMNS` (9 incl. 3 JSON) | same | 68 | individual |
| AD-OP-70 | Gates | `adminGatesApprovals.ts:resolvePeople:561-578` (`:655-676`) | `aadusers` (Graph-backed virtual) | read | GET fA per 15 ids, 4 wide | `or(id eq …)` | same; only unknown ids (`GATES_REUSE_PEOPLE`) | 66 (and 69) | individual |
| AD-OP-71 | Gates | `adminGatesApprovals.ts:searchPeople:612-625` (`hooks.ts:57-65`) | `aadusers` | read | GET, 1 page of 25 | `contains` ×4 + enabled | per debounced term (300 ms, ≥2 chars), 60 s cache | — | individual |
| AD-OP-72 | Gates | `rules.ts:planSetGateActive/planSetTaskApprovalActive:954,964` (`hooks.ts:71-104`) | gates / task approvals | guarded update | G+P | one boolean | Active pill (optimistic) | — | individual (2) |
| AD-OP-73 | Gates | `rules.ts:planSaveGate/planSaveTaskApproval:973-981` (`hooks.ts:111-131`) | same | create / guarded update | POST / G+P | full panel payload | Save | — | individual |
| AD-OP-74 | Gates | `rules.ts:planResetGate:986` / `planDeleteTaskApproval:998` | same | guarded update / delete | G+P / DELETE | reset payload / — | Reset / Delete | — | individual |
| AD-OP-75 | Gates | `hooks.ts:102,127,138,148` → `adminInvalidation.ts:171-182` | dataset (66–70) + locks | refetch | as 66–70 | full dataset chain | after every gate write | write | individual |

Not called by any admin screen but living in admin files: `adminGatesApprovals.ts:175-356` (`listGateCountries`, `listGateApprovals`, `findScopeCountryTechId`, `listChecklistApprovals` with unbounded `Promise.all` at `:286`, `searchEntraPeople`, `getEntraPeople`) are used by PM modules (`data/checklist.ts`, `checklistPeople.ts`, `generalData.ts`, `team.ts`) — out of this auditor's scope. `createRowsEach` (`adminRowWrites.ts:110-125`), `deactivateCapexAccount` (`adminCapexAccounts.ts:517-525`) and `deactivateCapexSubaccount` (`:528-533`) have **no production caller** (tests only).

---

