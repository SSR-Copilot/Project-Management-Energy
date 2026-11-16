# Generators screen: Dataverse bulk actions — analysis, risk assessment and implementation plan

| | |
|---|---|
| **Status** | **Analysis only. No application code was changed.** Nothing here is approved for development |
| **Screen** | PM → Project Generators (`ProjectCosts-CodeApp/src/features/pm/generators/`, `src/data/generators.ts`) |
| **Date / base** | 16 Nov 2026, `RounakDev1` at `9d5d03d`. Analysis branch `analysis/generators-bulk-dataverse` |
| **Method** | Four independent read-only investigations: (A) the bulk code already in the repo and the SDK, (B) every Dataverse request the Generators screen makes, (C) relationships, cascades and server-side automation from the solution export `customizations.xml` (1.21.709), (D) Microsoft documentation on bulk operations. Their findings were combined here. Companion: `GENERATORS-SCREEN-FUNCTIONAL-ANALYSIS.md` |
| **How to read the tags** | **[doc]** stated in Microsoft documentation. **[code]** read in this repo. **[export]** read in the solution export, which may be older than DEV. **[inferred]** reasoning from the above, not proven. **[unknown]** not found anywhere; needs a DEV test (section 9) |
| **Not done** | Nothing was executed against DEV. Request counts are computed from the code, not measured. No Generators save has ever been timed live |
| **Scope note (16 Nov 2026)** | The product owner confirmed that **no custom Dataverse plug-ins exist for these functionalities**. Risk R9 and probes 9 and 10 below are therefore withdrawn. The flows (the Fabric sync trigger and the approval flows) are not plug-ins and stay in scope. Decisions taken after the first review are in `GENERATORS-BULK-IMPLEMENTATION-PLAN.md`, section 9 |

---

## 1. Summary

**The opportunity is real but narrow.** Almost all of the cost sits in the **land-lease allocation rows** that a new or replaced wind turbine type creates: one row per new turbine for every "all-WTG" land-lease cost. Everything else on the screen is already small (2–4 requests), or must stay as single requests.

| Scenario (realistic worst case) | Requests today | With bulk, chunk of 500 |
|---|---|---|
| Add WTG type, 200 turbines, 30 all-WTG land-lease costs | **6,203** (778 awaited waves) | **about 16** (4 waves) |
| Replace Generator Type, same size, 5 O&M costs | **12,415** | about 6,220, of which **6,202 are deletes** that bulk cannot reduce |
| Activate / Deactivate a type with 200 turbines | **202, all one after another** | 3 waves (or 202 requests in 28 waves with a zero-risk interim fix) |
| Edit a turbine with "apply to all", 200 turbines | 202 | about 4 |
| Add a turbine (30 land-lease costs) | 33 | about 4 |
| Add PV type (30 costs) | 34 | about 5 |
| Delete turbine / Delete WTG type / Delete PV type | 33 / 37–6,007 / 41 | **unchanged**: there is no bulk delete for standard tables |
| BESS, Hydrogen, Substation, Inverter, Substructure save or delete | 2 | unchanged |

The typical project is far below the worst case (for example 10 turbines and 3 costs is 43 requests, about 5 after bulk). **Before building anything, measure how often large types and many all-WTG costs actually occur**, because that decides whether the work pays.

**Five facts that shape the design**

1. **Standard-table bulk requests are all-or-nothing per request** [doc], and the response does not say which row failed [doc: not documented]. A chunk is the atomic unit. The app's current `executePlan` reports "N of M changes saved", which will not mean the same thing.
2. **There is no `DeleteMultiple` for standard tables** [doc] (the error text is "DeleteMultiple has not yet been implemented"). The only documented bulk delete, `BulkDelete`, is an asynchronous query job with no rollback. Deletes stay one request per row.
3. **Generators has never used bulk.** The existing bulk path (Add Cost from Table, D51/D56) is hard-wired to two CAPEX tables, including its 501 fallback [code].
4. **Nothing proves that polymorphic lookup binds, the owning-business-unit bind, a `null` bind, or a `statecode` change work inside a `CreateMultiple` / `UpdateMultiple` target** for these tables [code: no instance exists]. The code app docs even list polymorphic lookups as unsupported in generated services [doc]. These must be probed in DEV first.
5. **The relationships are forgiving on delete but leave orphans** [export]. No Generators parent has a `Restrict` rule. Deleting a type cascades to its turbines and bridge rows, but **unlinks** (does not delete) land-lease allocations and O&M costs. The app deletes those explicitly today, and any bulk path must keep doing so.

**Recommendation:** run a short DEV verification phase (section 9) first, then deliver in small, separately-switchable steps, cheapest and safest first (section 8): one `together()` change, then bulk allocation creates, then bulk status and apply-to-all updates, then bulk turbine creates, and only then, if the measurements justify it, the Replace flows. Leave deletes and every single-row step alone.

---

## 2. How the screen writes today (baseline)

### 2.1 Mechanism [code]

- Every save is a `WritePlan`: an ordered list of single-row create, update or delete operations (`data/writePlan.ts`). `executePlan` sends them one at a time, in order.
- Operations marked `together()` run as one group, **8 in flight** (`executePlan.ts`, `concurrency.ts`). A group sees only ids created before it.
- A child binds to a parent created in the same plan with a placeholder (`createdRowRef(n)`, written `@created#n`). `executePlan` replaces it with the id the earlier create returned. **That placeholder cannot appear inside a bulk payload.**
- Creates ask for the full row back (`Prefer: return=representation`). The new type's autonumber name arrives that way and is used for the device-type row (`PlanResult.createdRows`).
- A job is a plan plus an optional follow-up (`then`), one progress text, one background reload. Commands stay disabled until the reload ends (D99).
- Every plan ends with the project roll-up. That update fires a flow (section 5).
- There is **no** `DeleteMultiple`, `ExecuteMultiple` or `$batch` use anywhere in the app. The SDK client exposes create, update, delete, retrieve and `executeAsync`, and **no batch API** [code: `@microsoft/power-apps` 1.3.1]. What the host does with an internal batch header is [unknown].

### 2.2 Request counts per scenario [code, computed]

Symbols: **N** turbines (max 200 per type), **L** all-WTG land-lease costs, **O** O&M costs on the type's device-type row, **M** manually allocated rows, **U** PV units, **Sb** substructures.

| # | Scenario | Requests in order | Count |
|---|---|---|---|
| 1.1 | **Add WTG type** | create type (1) → create N turbines (together) → project roll-up (1, in country only) → then: device-type row + N×L allocation creates (together) | N + N·L + 3 |
| 1.2 | **Add turbine** | create turbine → type totals → roll-up → L allocation creates | 3 + L |
| 1.3 | **Edit turbine** | update turbine → update each sibling if "apply to all" (together) → type totals → roll-up | 3, or N + 2 |
| 1.4 | **Delete turbine** | reads (1 + one per 40 costs) → D deletes of its allocations or whole costs → delete turbine → type totals → roll-up | D + 3 (+ reads) |
| 1.5 | **Delete WTG type** | cancel flow if a request is open; reads → X land-lease deletes + O O&M deletes (together) → delete type → roll-up | X + O + 2 |
| 1.6 | **Activate / Deactivate** | update type → update each turbine's `statecode` (**not** in `together()`) → roll-up | N + 2, **all sequential** |
| 1.7 | **Add / edit PV type** | create or update type → unit → L allocations (new only) → PV roll-up → device-type row | 4 + L (new) |
| 1.8 | **Delete PV type** | X + O deletes → delete unit → delete type → PV capacity → each substructure cost → PV cost | X + O + U + 3 + Sb |
| 1.9 | **Replace Generator Type** | job 1: detach O O&M costs, delete N old units, delete bridge rows, delete old type, create new type, create N turbines, roll-up. Job 2: bridge row, then N·L allocation creates + repoint + delete old allocations + O&M re-links | about 12,400 at N=200, L=30, O=5 |
| 1.10 | **Replace PV Type** | detach, delete, create; then bridge, unit, allocations, roll-up, re-links | about 77 at L=30, O=5 |
| 1.11 | **BESS / Hydrogen / Substation; Inverter / Substructure delete** | row, then one project roll-up | 2 |

Worked numbers for 1.1: N=1, L=0 gives 4 requests; N=10, L=3 gives 43 (8 waves); N=200, L=0 gives 203 (28 waves); N=200, L=30 gives 6,203 (778 waves). `waves` = awaited steps, the real driver of wall-clock time.

**A scenario where "N·L" is large only exists when the project has all-WTG land-lease costs.** If a project has none (L=0), Add WTG type is already cheap.

### 2.3 What the app measured elsewhere (for expectation setting) [docs, D51]

- A bulk request through the Power Apps host has **never measured under about 1 second**; 0.6–1.9 s each on DEV for 60–96 rows, 5–6 s when deletes overlapped on the same parents (lock contention).
- Per-row writes through the host are throughput-bound (about 9.5 s for 70 requests, 4.1 s for 40).
- A model of about 0.5 s per request plus about 22–32 ms per row is recorded, but it is **not measured per request**.
- **No Generators save has ever been timed live**, and no 429 (throttling) has ever been observed or tested on the write path.

So the gain is mostly in *requests and waves*, not a guaranteed drop in seconds. Expect a 6,000-row allocation create to be a handful of seconds, not milliseconds.

---

## 3. What Microsoft documents about bulk operations [doc, learn.microsoft.com, Oct 2026]

| Topic | Finding |
|---|---|
| **Messages and tables** | `CreateMultiple`, `UpdateMultiple`, `UpsertMultiple` exist for elastic tables and "many but not all" standard tables. **Test support per table**: `GET sdkmessagefilters?$filter=sdkmessageid/name eq 'CreateMultiple' and primaryobjecttypecode eq '<logical>'`. The docs disagree with each other about some tables, so test, do not trust a list |
| **DeleteMultiple** | Elastic tables only. Standard tables: not implemented. `BulkDelete` is the documented alternative: asynchronous, query-driven, honours cascade, **runs plug-ins per row, does not roll back**, logs failures in `BulkDeleteFailure` |
| **Atomicity** | A standard-table `CreateMultiple` / `UpdateMultiple` request **rolls back entirely** on any error. Microsoft says to use them only when you are highly confident all rows will succeed. The failing row is not identified (only a plug-in can add that) |
| **Batch size** | No documented maximum for standard tables. Start at 100–1,000 per request if the payload is small and there are no plug-ins. Make the size configurable. SQL timeout (`-2147204783`) means "reduce the batch size". 100 per request for elastic tables |
| **`$batch` / `ExecuteMultiple`** | `$batch`: up to 1,000 requests, change sets are atomic, `Content-ID` lets a later request reference a row created earlier in the same change set. `ExecuteMultiple`: each request in its own transaction. **Whether the code app host can send either is not documented** |
| **UpdateMultiple restrictions** | Alternate keys unsupported. **Duplicate keys in one request: the first wins and later ones are silently ignored.** `UpsertMultiple` errors on duplicates. No per-row `If-Match` is documented |
| **Plug-ins and flows** | Create / Update steps still run for each row. Logic registered on both the single and the multiple message can run twice. A flow with a Dataverse trigger is **inferred** to fire once per row, so a 500-row create could start 500 runs. Unchanged values still count as an update, so send only changed columns |
| **Lookups, owner, ids** | `@odata.bind` is documented for single create; inside bulk targets it is ordinary JSON but **not shown**. Polymorphic lookups are listed as unsupported in the code-app generated services. Client-supplied primary keys are allowed but Microsoft recommends letting the system generate them. Autonumber behaviour with a client key is not documented |
| **Parent and child in one request** | Not documented for bulk. Documented ways: a `$batch` change set with `Content-ID`, or parents first then children |
| **Service protection** | Per user, per web server, 5-minute window: 6,000 requests, 20 minutes of execution time, 52 concurrent requests. 429 with `Retry-After`. **Execution time is the binding limit for bulk**, not request count. Bulk messages count as one request but are long. Most scenarios are fastest with single requests at high parallelism; if batching, start small and ramp up |
| **Deadlocks** | Concurrent requests touching the same rows cause SQL error 1205 |
| **Cascades** | Delete cascades are synchronous by default; large cascades lock rows and risk timeout and full rollback. Async cascading starts above 5,000 rows for Delete. Whether it is enabled in DEV is [unknown] |

---

## 4. Which features can be optimised, ranked

Benefit = requests and waves saved in realistic use. Effort and risk reflect what each step needs that does not exist yet.

| Rank | Feature and step | Technique | Benefit | Effort | Risk | Needs a DEV probe first |
|---|---|---|---|---|---|---|
| **0** | **Activate / Deactivate: turbine `statecode` updates** run one after another | **Wrap in `together()`** (8 at a time). Same requests, about 28 waves instead of 202 | High for the cost (199 fewer waves) | Tiny | Very low: no new mechanism | No |
| **1** | **Allocation creates** (Add type, Add turbine, Add PV, Replace) | `CreateMultiple` on `vsb_landleaseallocationwtgs`, binds to existing turbine and cost ids | **Largest**: 6,000 rows become 12 requests | Medium | Low–medium: one entity, existing ids, five plans share one helper (`allocationCreates`) | Yes: OBU bind, name, support, flow/plugin counts |
| **2** | **Toggle status** as a true bulk | `UpdateMultiple` on `vsb_generatorinprojects` with `statecode` | High | Small after probe | Medium: `statecode`-only update in a bulk target is unproven | Yes |
| **3** | **Apply-to-all siblings** | `UpdateMultiple`, per-row payloads | High (N+2 becomes about 4) | Small–medium | Medium: per-row `owningbusinessunit@odata.bind` on update has no precedent | Yes |
| **4** | **New turbines in Add type** and in Replace | Create the type as a single request, then one `CreateMultiple` for N turbines with the known type id | Medium (N becomes 1–8) | Medium | Medium–high: polymorphic bind unproven in bulk; names and order | Yes |
| **5** | **Replace Generator / PV Type** | Compose steps 1–4, and keep the deletes | Large for creates, deletes remain | Large | High: many ordered steps, detach-before-delete rule, flow calls between | Yes |
| **6** | Moved allocations, O&M detach / re-link | `UpdateMultiple` | Small–medium | Medium | Medium: `null` bind inside a bulk target unproven | Yes |
| — | Add PV type | uses 1 | Medium | follows 1 | Low | — |
| — | Substructure cost patches | `UpdateMultiple` | Negligible (1–3 rows) | — | — | — |

**Leave alone:** the type create (it supplies the autonumber and the parent id), every roll-up and type-totals update (single row, and the project update fires a flow so it must be last), the flow calls (approvals and mails, between writes), and every single-row save (BESS, Hydrogen, Substation, Inverter, Substructure).

**Deletes** (turbines, allocations, land-lease costs, O&M costs, units, bridge rows, types): no bulk option. Options for the plan are only: keep per-row with the existing gate; raise concurrency carefully for deletes that do not share parents; or, as a separate product decision, **repoint and rename instead of delete-and-recreate** in the Replace flows (the same land-lease allocation rows would be moved to the new turbines, saving about 6,000 deletes, but it changes ids and the canvas behaviour).

---

## 5. Relationships and cascade behaviour [export 1.21.709]

The export (`ProjectDocs/_extracted/VSBCloud/customizations.xml`) is version 1.21.709. **DEV may be newer**: check before relying on anything below (section 9, item 13).

### 5.1 Common facts

- All the tables are user-owned, audited (entity level and nearly every column) and have change tracking on. `owningbusinessunit` accepts a bind on create, which is why the app's bind works.
- Custom relationships come in two shapes: **CASC**, where Assign, Delete, Reparent, Share and Unshare all cascade; and **RL**, where Delete is `RemoveLink` and the rest are `NoCascade`.
- **No `Restrict` exists on any relationship where the parent is a Generators table.** All 79 `Restrict` values are the business-unit ones, which only block deleting a business unit. No many-to-many relationships.
- No business rules, no classic or real-time workflows, no duplicate-detection rules in the export. No calculated or rollup columns. The formula column `vsb_totalcapacity` is on `vsb_projects` (sum of the five plant capacity columns) and is computed on read.

### 5.2 Parent → child tree (C = Cascade, RL = RemoveLink)

```
businessunit --[Restrict: only blocks deleting a BU]--> every table
catalogues (generator, pvmodule, inverter, substructure) --RL--> their *TypeInProject rows
vsb_country --RL--> vsb_project, vsb_devicecost

vsb_project
 |-C-> generatortypeinproject
 |      |-C-> generatorinproject (turbine)   --RL--> landleaseallocationwtg.generatorinproject
 |      \-C-> devicetypesinproject (O&M bridge) --RL--> opexprojectcost.devicetypeinproject
 |-C-> pvmoduletypeinproject  (same two children: unit, bridge)
 |-C-> invertertype / substructuretype / storagetype / hydrogentype / substationtype (no children)
 |-C-> landleaseprojectcost --C--> landleaseallocationwtg, landleaseperiod
 |-C-> opexprojectcost      --RL--> child costs (vsb_parentcost)
 \-C-> projectplanning
```

Two structural facts:
1. **A turbine (`vsb_generatorinproject`) has no project lookup.** It belongs to a project only through its type.
2. **Two lookups are polymorphic** and need the per-target navigation property in exact mixed case: `vsb_ModuleTypeInProjectId_vsb_generatortypeinproject` / `…_vsb_pvmoduletypeinproject` (turbine), `vsb_TypeInProjectId_vsb_generatortypeinproject` / `…_vsb_pvmoduletypeinproject` (device-type bridge). The device-type lookup is "application required" only, so **the API will not refuse a missing bind**.

### 5.3 What a delete does

| Delete | Platform deletes | Platform only unlinks (row stays) | App must do |
|---|---|---|---|
| WTG type | its turbines and bridge rows | allocations of those turbines; O&M costs of the bridge | land-lease clean-up, bridge O&M deletes, roll-up |
| Turbine | nothing | its allocations | its allocations or the whole land-lease cost, type re-banding, roll-up |
| PV type | its unit and bridge rows | the unit's allocations; the bridge's O&M costs | same as WTG type, plus substructure recompute |
| Bridge row | nothing | O&M costs pointing at it | delete those O&M costs first |
| Land-lease cost | its allocations and periods | — | nothing |
| Allocation | — | — | the cost total is not recomputed by the server |
| O&M cost with children | — | child costs (their parent link is nulled) | delete the chain explicitly |

- **An unlink changes meaning.** `data/costBook.ts` treats an O&M row as "O&M" only when its bridge lookup is set. A bridge deleted by cascade turns its O&M costs into "other" costs that stay in the totals under a different group.
- **`planDeleteGeneratorType` deletes the O&M costs of the first bridge only** (ordered by creation). A second bridge would leave orphans. Whether a type can ever have two bridges was not found.
- **Whether RemoveLink can null the required lookup** `vsb_landleaseallocationwtg.vsb_generatorinproject` is not shown in the export and must be tested (item 6).

### 5.4 Server-side automation on these tables [export]

- **Plug-ins:** 14 steps exist, none on a Generators table. All are on `vsb_project`, `vsb_balancingprice` and two standard-assumption tables, on **Create, Update and Delete only**. **No `*Multiple` step is registered in the export**; whether the platform also runs Create/Update steps for a bulk call is not shown in the files [doc: it does].
- **The project update that every Generators save ends with** touches capacity columns (`vsb_plantwtgcapacity`, `…pvcapacitymwp`, `…storagecapacity`, `…substationcapacity`, `…hydrogencapacity`). None of them is in a plug-in's filter. They **are** the filter of the flow `LoadDevexCapexCostTotalCapacityTrigger`: one run creates one `vsb_fabricsyncjobs` row ("Recalculate Capex Standard Cost"). A cost-only change (`vsb_plantwtgcost`, `vsb_plantpvcost`) does not fire it.
- A **second flow** ("When Project Data gets updated → Send E-Mail Card to Portfolio Manager and CCs") watches the same columns. It is **Draft** in the export, so it is off, but if it is active in DEV it sends a mail per project write.
- The approval flows (Request Module Permission, Request permission cancellation) update the type's state and the project's plant totals on approval, so they fire the trigger again, and **on decline they delete the type row** (the cascade above then runs and leaves allocations and O&M costs unlinked).
- One async plug-in on `vsb_project` (`vsb_InitialCapexContractCreation`) reads generator type rows when `vsb_initialp50trigger` is written. Its logic was not read, only byte strings in the DLL.
- **Autonumber:** `WTG-{SEQNUM:4}` (generator type), `PVT-{SEQNUM:4}`, `INVT-{SEQNUM:1}`, `SUBT-{SEQNUM:4}`. **Not** autonumber, so the app supplies the name: turbines (`WTG <Short>_<max+i>`), bridge rows, allocations, land-lease costs, O&M costs, storage / hydrogen / substation rows. Two users computing `max+i` at the same moment can create duplicate turbine names, because nothing in Dataverse prevents it.
- **Security:** the roles are Basic or Local depth on the child tables, so **a bulk-created row without the owning-business-unit bind is invisible to Local and Deep readers**, and nothing fails.

---

## 6. Risk register

Likelihood × impact, 1–5. Section 9 gives the verification for each.

| # | Risk | Score | Mitigation / verification |
|---|---|---|---|
| R1 | **Orphans after a partial bulk delete or a failed replace**: allocations with no turbine, O&M costs whose bridge is gone (they flip to "other" in totals). Deletes are not transactional | **16** | Children first, parent last; idempotent retries; a post-run orphan query; inject a failure in a later group and check |
| R2 | **Roll-up fan-out**: each project update with a capacity column makes one flow run and one Fabric sync-job row, plus one mail per write if the Draft flow is active in DEV | **15** | Exactly one roll-up per bulk operation, always last; count sync-job rows after one save; test whether an unchanged capacity value still fires the flow |
| R3 | **A bulk target without `owningbusinessunit@odata.bind`** succeeds silently and the rows are hidden from other roles | 12 | The bulk builder must **fail closed** if the bind is missing; read the first created row back (`_owningbusinessunit_value`, `_ownerid_value`) during rollout |
| R4 | **DEV differs from the export** (newer solution, extra plug-ins or `*Multiple` steps, flows outside the solution) | 12 | Run the section 9 queries and `pac solution list` before building |
| R5 | **Atomic chunk failure with no failing-row detail**: one bad row rolls back 500 rows and the message names none | 12 | Validate rows on the client before sending; on failure bisect the chunk, falling back to single requests for the failing part; keep chunk size configurable |
| R6 | **Cascade amplification** on a type with hundreds of turbines (audited RemoveLink updates, locks, timeout) | 9 | Delete turbines and allocations in chunks before the type; cap cascade-capable deletes at 4 in flight (the D51 precedent); measure a 200-turbine type |
| R7 | **Parent and child in one request** is undocumented | 9 | Two requests: parents first, then children. Pre-generate GUIDs for ids the plan needs |
| R8 | **Polymorphic bind wrong, wrongly cased, or unsupported in bulk** | 8 | Keep the `PLANT_BIND` constants as the only source; probe 3 rows and read back each lookup with its target table |
| R9 | ~~Bulk change overlapping the async CAPEX contract plug-in~~ **Withdrawn 16 Nov 2026**: no custom plug-ins exist for these functionalities (product owner) | — | — |
| R10 | **Autonumber and the response shape**: `CreateMultiple` may return ids only, so the type's name could not be read from the response; number order and gaps are unspecified | 6 | Keep the type create single; read names back by id if needed |
| R11 | **Throttling** (52 concurrent per user, 20 minutes of execution per 5; no retry on writes today) | 6 | Keep write concurrency at 8; add `Retry-After` handling before enlarging anything; load-test 200+ rows |
| R12 | **Lock contention or deadlock**: two users, or the approval flow and the app, updating the same project row; overlapping deletes on one land-lease cost | 6 | One bulk operation per project at a time; retry on deadlock only for idempotent steps |
| R13 | **Stale overwrite or resurrection**: another user edits or deletes between load and save; PATCH is an upsert; Generators plans are not guarded; `UpdateMultiple` refuses a missing row so the whole chunk fails | 6 | Re-read or use a guarded update where it matters; the Add Cost guard is the model |
| R14 | **Duplicate ids in one `UpdateMultiple` request are silently ignored** [doc] | 6 | De-duplicate on the client; the existing executor already rejects duplicates before sending |
| R15 | **Audit and change tracking overhead** on every row | 6 | Include in timing tests |
| R16 | **The "first bridge only" gap and O&M chains** | 6 | DEV query for O&M rows with a parent set and a null bridge |
| R17 | **Duplicate turbine names** between concurrent users (existing, not new) | 4 | Out of scope; note only |

**Lessons from the repo that apply** [code, D51/D56]: the Wirmighausen incident (a save silently removed about 168 cost rows, which led to the round-trip identity check); HTTP 501 after the `environment_<id>` entry was removed from `power.config.json`; fresh ids on every retry duplicated rows (fixed by keeping ids across retries); cascade deletes overlapping writes made requests take 6–11 s (start deletes after writes settle); a 404 on delete can be a wrong entity set, so it must be verified; a failed parallel group has no exact "prefix" count, so landed ids are a set.

---

## 7. Design options

### Option A (recommended): a bulk step inside the existing write plan

Add a bulk operation type to `WriteOp` (a create-many or update-many on one entity set with a list of rows), executed by `executePlan` in order, like a `together()` group.

- **Reuse:** `executePlan`, `usePlanWrite`, progress and error text, invalidation, background reload, the `then` follow-up all stay. Roll-up stays last by plan order.
- **New:** the bulk operation in `writePlan.ts` and `executePlan.ts`; a bulk transport for the Generators tables (the existing sender is wired to two CAPEX tables); pre-generated ids; failure bisection; a flag; tests.
- **Fits:** allocation creates, turbine creates, status and apply-to-all updates.

### Option B: call the existing bulk sender directly from the hooks

Quicker for one case but bypasses `executePlan`, duplicating its error, progress and invalidation behaviour. Not recommended.

### Option C: `$batch` change sets

Atomic across several entity sets with `Content-ID` parent references, which would solve parent-and-child ordering. **Not available**: the SDK client has no batch API and the host's behaviour is unknown. Revisit only if a probe shows the host accepts it.

### Required cross-cutting decisions (whatever the option)

1. **Chunk size and splitting.** Reuse the tuned splitter (minimum chunk 10, up to 8 parallel chunks, maximum 500).
2. **Ids.** Pre-generate GUIDs for rows other rows refer to. Keep the type create single so its autonumber name comes back. Keep the existing `createdIds` order contract (type first, turbines next) or switch to pre-generated ids.
3. **Failure semantics.** A chunk lands whole or not at all; parallel chunks can land partly. Define the message ("N of M rows saved") and what `PlanError.done` counts (rows or requests). Pin it with tests.
4. **501 fallback.** Each action needs a fall back to per-row writes, remembered per tab, as Add Cost has; it must be extended beyond the two CAPEX tables, and its resurrection guard must cover Generators.
5. **Fail-closed builder.** A target without the owning-business-unit bind must throw before anything is sent.
6. **One roll-up per bulk operation**, last, and no bulk write while the project's P50 trigger is pending.
7. **Tracing (rule 23).** One `[VSB] DATA create|update <entity set>` line per bulk request with rows and time, a pinned test, and a console check in a real run.
8. **Switch and rollback.** A module-level flag in the data layer (`GENERATORS_BULK`, per step if possible), the current `together()` path kept intact and tested as the off path, a `DIVERGENCE:` marker and a D-entry (CONVENTIONS rules 8 and 15).

---

## 8. Proposed phased plan (not started)

Each phase would be its own local branch cut from `RounakDev1` and merged back (fast-forward) only after `npm run verify`, the file-13 check, the E2E-parity question and your approval, per the project rules. Nothing is built until you approve a phase.

| Phase | Content | Branch (proposed) | Gate to proceed |
|---|---|---|---|
| **0. Measure and verify (no app code)** | The DEV probes of section 9; count real data (turbines per type, all-WTG costs per project); decompile or trace the CAPEX plug-in | `analysis/generators-bulk-dataverse` (this) → results appended | Decide with the probe results whether phase 2 onward is worth doing |
| **1. Zero-risk interim** | Wrap the turbine `statecode` updates of Activate / Deactivate in `together()`; add a test | `perf/generators-status-together` | `verify` green; no new mechanism |
| **2. Bulk allocation creates** | The bulk operation in `WritePlan`; the Generators transport; fail-closed builder; flag and fallback; use it in `allocationCreates` (Add type, Add turbine, Add PV, Replace follow-ups) | `perf/generators-bulk-allocations` | Probes 1, 4, 10 pass; counts and `[VSB]` lines confirmed in DEV |
| **3. Bulk updates** | Status toggle and apply-to-all through `UpdateMultiple`, one chunk per group | `perf/generators-bulk-updates` | `statecode` and per-row bind probes pass |
| **4. Bulk turbine creates** | Type single, N turbines in one `CreateMultiple` with the known type id (polymorphic bind); GUIDs or response order | `perf/generators-bulk-turbines` | Polymorphic bind probe passes; names and order verified |
| **5. Replace flows** | Compose the above; keep deletes; decide (separately) whether to repoint instead of delete-and-recreate | `perf/generators-bulk-replace` | Product decision on repointing; orphan test passes |
| **Out of scope** | Deletes, single-row saves, flow calls, a custom API for all-or-nothing saves | — | — |

**Tests that would change** [code]: `rules.test.ts` UT-GEN-118 to 128, 133, 135, 137 to 139 (plan shapes and concurrent flags); `Screen.test.tsx` UT-GEN-903, 905, 909, 912 to 915; `executePlan.test.ts` UT-PLAN-032 to 037 if `executePlan` gains a bulk operation. New tests: the bulk transport (fake that refuses existing ids, as UT-ACSHEET-BULK-068 does), chunk failure and bisection, the fail-closed OBU rule, flag on and off, the `[VSB]` line.

**Documentation owed with each phase:** the file-13 improvements log, a D-entry for each divergence (writes land per chunk; a failure is per request; a different failure shape), and the console-trace test.

---

## 9. DEV verification checklist (phase 0)

Every probe uses a **test project**. They write rows, so each needs your approval and a cleanup step.

| # | Check | How | Closes |
|---|---|---|---|
| 1 | Does each table support the messages? | `sdkmessagefilters` query for `CreateMultiple` and `UpdateMultiple` for `vsb_landleaseallocationwtgs`, `vsb_generatorinprojects`, `vsb_generatortypeinprojects`, `vsb_pvmoduletypeinprojects`, `vsb_devicetypesinprojects`, `vsb_opexprojectcosts` | Which steps are possible |
| 2 | One deliberately bad row (bad lookup GUID, over-length string) in a 50-row create: does anything persist, and what does the error body say (failing index? with the annotations header?) | App's bulk path or Web API | R5 |
| 3 | Largest workable chunk and latency by chunk size and parallelism (1, 2, 4, 8) with real payloads | benchmark | Chunk size |
| 4 | **Polymorphic bind**, **`owningbusinessunit@odata.bind`**, and a **`null` bind** inside targets; create 3 rows and read back each lookup, owner and business unit | 3-row test | R3, R8 |
| 5 | **`statecode`-only update** and **per-row `owningbusinessunit@odata.bind` on update** in `UpdateMultiple` | 3-row test | Phases 3, 6 |
| 6 | **Cascade functional test**: type with 2 turbines, a bridge, one allocation, one O&M cost; delete the type; query for orphans; record the HTTP status (does RemoveLink null the required allocation→turbine lookup?) | test project | R1 |
| 7 | What does `CreateMultiple` return through the host (ids? rows?) and does a client-supplied id plus autonumber behave? Compare autonumber order with array order | 5-row test | R10 |
| 8 | **Flow runs and Fabric sync-job rows after a 50-row create and a 50-row update**, and after a project capacity update; does an unchanged capacity value still fire the flow? Is the Draft mail flow active in DEV? | maker portal | R2 |
| 9 | ~~Live plug-in steps~~ **Withdrawn**: no custom plug-ins exist (product owner, 16 Nov 2026) | — | — |
| 10 | ~~What `vsb_InitialCapexContractCreation` reads~~ **Withdrawn** for the same reason | — | — |
| 11 | Throttling for 200+ rows: 429 with `Retry-After`? Does the SDK retry? Is `x-ms-dop-hint` visible? | load test | R11 |
| 12 | Delete a parent while growing the child count (100, then 1,000) and record time and failure point; is async cascading enabled in DEV? | test project | R6 |
| 13 | **DEV solution version** versus 1.21.709, live cascade configuration for the six parents, duplicate-detection rules, organisation audit setting, and real role assignments | `pac solution list`; `EntityDefinitions(...)/OneToManyRelationships?$select=SchemaName,CascadeConfiguration`; `organizations?$select=isauditenabled` | R4, R15 |
| 14 | Does the host accept `$batch`? (Only if option C is wanted.) | single probe | Option C |
| 15 | How many turbines per type and how many all-WTG land-lease costs per project exist in real DEV and QA data? | read-only query | Whether the work pays |

---

## 10. Decisions needed from the product owner

**Answered on 16 Nov 2026: see `GENERATORS-BULK-IMPLEMENTATION-PLAN.md` section 9.** Sizes are small today, the full plan (phases 1–5) is still wanted, Replace keeps delete-and-recreate with parallel deletes, failed creates are rolled back, and success means at least 50% faster than today. The original questions follow for reference.

1. Is the worst case (hundreds of turbines with many all-WTG land-lease costs) realistic enough to justify phases 2–5, or is phase 1 enough? (Item 15 answers it.)
2. Accept that **a save may fail as a whole chunk** and report "N of M rows saved" at row level, rather than per request.
3. Keep the Replace flows' delete-and-recreate of land-lease allocations, or **repoint them** (fewer requests, different ids and a changed canvas behaviour)?
4. Accept per-tab remembered fallback to single-row writes if a bulk call answers 501.
5. Accept that no bulk write runs while a project's P50 trigger is pending.
6. Approve spending test-project writes in DEV for the phase 0 probes.

---

## 11. What was not verified

- Nothing was run against DEV. All request counts come from reading the plan functions. All server-side facts come from a **1.21.709** export.
- The plug-in DLL logic was not read; the Draft e-mail flow's state in DEV is unknown; no seeds for the autonumbers; no organisation audit setting; no role assignments.
- The response shape of `CreateMultiple` through the host, 429 behaviour and the host's use of a batch header are unknown.
- The figures from the code-app documentation about `$batch` and polymorphic lookups come from Microsoft pages dated 26–30 Oct 2026. The source pages disagree with each other in places (for example which standard tables support the messages), which is why probe 1 exists.
