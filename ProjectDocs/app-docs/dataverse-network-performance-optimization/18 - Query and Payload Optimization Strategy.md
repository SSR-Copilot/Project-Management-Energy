# 18 - Query and Payload Optimization Strategy

> Stage 2 (design and planning only), 25 Nov 2026. Inputs: docs 06 (12 findings) and 07 (5 findings). Tasks: T-30, T-31, T-32, T-33.

## 1. Standards that already hold (verified by the audits, keep)

`$select` on every read (CONVENTIONS rule 1, enforced by `fetchAll`'s required `select`); server-side filters through `odata.ts`; `maxPageSize` for paging, never `$top`; Cost rows page at 5,000; the 50-page cap fails loudly (D157). The audits recorded these as the norm and raised no finding for a missing `$select`; the exceptions they did find (over-wide or duplicated selects, whole-table reads for aggregates, id-list fan-out) are below. The audits read the hot paths of every screen but did not check every read in the 250 generated-service call sites; T-00's census would reveal an unfiltered read as a large row count.

## 2. Query findings and the design for each

| Finding | Problem | Design | Gate before building |
|---|---|---|---|
| CA-04 | every id fan-out sends 40 ids per `or` chain | raise the chunk or use `Microsoft.Dynamics.CRM.In(PropertyName='x',PropertyValues=[...])` (the SDK builds this very function for its own metadata filter) | **P-1**: does the host accept it, and where does the URL limit refuse? |
| CB-05 | Contracts and Land Lease load children in a second wave through id lists | filter children through the parent lookup so they load with the parent (the admin contract load already does this) | **P-2**: does the host accept `_vsb_x_value eq <id>` / navigation filters on these tables? |
| PB-02 | municipality search reads one page of 5,000 | page to completion or show truncation | DEV count for Bayern |
| CA-13 | Summary reads every cost row for five numbers | none without server work (DEC-D) | owner |
| CA-16, PA-10, AD-09, AD-12, CB-13, PB-06 | unused columns, duplicate reads of one table | one read with the widest used select | grep of the select usage |

**Not proposed, because the SDK cannot:** `$expand`, FetchXML `link-entity`, aggregates, `$apply`. The audits' 'join' ideas are expressed as more selective filters or fewer waves, not joins.

**Rule for a combined query:** combine two reads only if the combined response is not larger than the two together by more than the saved round trip is worth; the wave-0 capture records response sizes (`networkRequest` metric) so that this is measured, not assumed.

## 3. Payload design

| Finding | Today | Design | Constraint |
|---|---|---|---|
| PA-03 | Finance tranche Save rewrites every repayment and step-up row | write only rows whose values changed (compare with the loaded rows) | differential test: same stored result as full rewrite |
| CA-12 | a CAPEX Edit sends the whole contract column bag, including the unchanged Linked Cluster bind | send changed columns only (the Add Cost path already does: `CHANGED_COLUMNS_ONLY`) | check each omitted column against `04-flow-inventory.md` |
| AD-10 | Period-1 edit propagates to every later period even if nothing changed | skip when no propagated field changed | canvas parity; D160 deferred it; owner confirms after a DEV check |
| PB-14 | Check List back-fill upserts | covered by the guard in T-01 | - |

**Fixed by the platform:** every POST and PATCH response returns the whole row with annotations (`Prefer: return=representation,odata.include-annotations=*`, set by the SDK). The app cannot ask for a smaller response, so write payload work reduces **request** size and **count**, not the response.

**Never removed:** an attribute a plug-in, a flow, auditing or a downstream report reads; the business-unit bind on a create; the lookups a flow filters on. Each payload task lists the columns it drops and where it checked them.

## 4. DEV probes (T-00), exact questions

| Probe | Question | Used by |
|---|---|---|
| P-1 | Does `$filter` with `Microsoft.Dynamics.CRM.In(PropertyName='vsb_x',PropertyValues=['g1','g2',...])` work through the host for a GUID column? What number of ids / URL length is the first refusal? | T-30 |
| P-2 | Does a filter on a single-valued navigation (`_vsb_parent_value eq g`, or `vsb_parent/vsb_name eq`) work for the cost, contract, lease period and allocation tables? | T-31 |
| P-3 | Does `UpdateMultiple` accept `statecode` / `statuscode`? What does it return for a missing id (error for the chunk, or silent)? | T-40, T-41 |
| P-4 | What do 429 responses look like through the host (status, message), and what back-off clears them? | T-10 |
| P-5 | How long does a request that never completes live before the host answers? | T-12 |

All five are read-only except P-4, which provokes throttling on DEV and is run with you present.
