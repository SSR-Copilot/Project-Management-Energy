# Add Cost from Table Save — performance plan, benchmark and Dataverse audit (2 Nov 2026)

Decisions: **D75** (client timeline, chunk tuning, changed columns only), **D76** (deep insert, flag
off), **D77** (background Save, flag off) in `02-OPEN-DECISIONS.md`. Bugs: **CA-24** (fixed),
**CA-25**, **CA-26** (open) in `01-BUGS-FOUND.md`.

Code: the local-only branch `feature/AddCostSavePerf` (worktree
`C:\Personal\Code App Mordenization\Project-Management-Energy-perf\feature`). Not pushed, not
deployed, not product-approved. **Nothing in this file has been measured live yet.** Every number
is the D51 §11.16 baseline, or a model marked "inferred".

## 1. Baseline and target

| Shape | What | Baseline (live DEV, D51 §11.16) | Target (2.5×) |
|---|---|---|---|
| S | 60 rows, existing contracts only | 1,607 ms, 3 requests: cost `CreateMultiple` 1.6 s ‖ cost `UpdateMultiple` 1.3 s ‖ contract update 865 ms | **≤ 643 ms** |
| M | 96 rows, with new contracts | 1,916 ms: contract `CreateMultiple` 1.4 s, THEN the new contracts' costs 556 ms | **≤ 766 ms** |
| L | about 800 rows | not measured | report only |
| XL | about 3,500 rows | not measured | report only |

About 90% of a Save is server time per bulk request. The rows of one request are processed one
after another. The smallest request ever measured took 556 ms.

## 2. Bottlenecks

| # | Bottleneck | Where the time goes | Lever | Status |
|---|---|---|---|---|
| B1 | Fixed cost per bulk request, `a` ≈ 0.5 s (host bridge + Dataverse pipeline) | Every request; sets the floor of any Save | Fewer serial hops (B3); a Custom API (one request for the whole Save) | Floor; not removable from the client |
| B2 | Rows of one request run serially, `b` ≈ 22–32 ms per row (inferred) | The cost `CreateMultiple` / `UpdateMultiple` of S | Split a group into more, smaller chunks sent together (WS-A, D75 §2.3) | Built, on: minChunk 10, parallel 8 (PROVISIONAL) |
| B3 | Serial hop: contract `CreateMultiple` THEN the new contracts' costs (stage 2b) | M's critical path (1.4 s + 556 ms) | Deep insert per new contract (WS-B, D76); a Custom API | Built, **off** |
| B4 | Write gate of 16 requests in flight | Large saves (L, XL) queue | Gate 24 (WS-A) | Built, on (PROVISIONAL) |
| B5 | Contract UPDATE carries all 9 columns per changed row | The contract update (865 ms on S) | Send only the changed columns (WS-D, D75 §2.4) | Built, on; gain expected small |
| B6 | Server per-row platform work: an inherited-sharing row on every create, an audit row on every write | Every create (sharing + audit) and every update (audit) | Dataverse admin changes (WS-C, §6) | **Not changed**; needs approval |
| B7 | Client work between click and first request (prepare log console output) | click → first request | Print the prepare line after the send (WS-E) | Built, on; < 1% |
| B8 | The user waits on the sheet for the whole server time | Perceived latency | Navigate at once, finish the Save in the background (WS-F, D77) | Built, **off**; a DIVERGENCE |

## 3. Expected gains (inferred, not measured)

| Shape | Default branch (WS-A + D + E) | + D76 deep insert | + D77 background (perceived only) |
|---|---|---|---|
| S | about 820–870 ms (≈ 1.9×); floor = the 865 ms contract update | no change (no new contracts) | tens of ms to CAPEX visible |
| M | about 1.9 s (no group splits) | about 1.4–1.9 s; floor = the 1.4 s contract create | tens of ms to CAPEX visible |
| L (1,000 rows) | about 3.9 → 2.4 s | small | tens of ms |
| XL (3,500 rows) | about 12.3 → 6.4 s | small | tens of ms |

Honest reading: **the 2.5× server-time target is not reachable by the client changes on the
measured shapes.** S could approach it if minChunk drops to about 5 (modelled 635–660 ms, 15–16
requests), which only the P0.3 probe can justify. M cannot get under the 1.4 s contract create
from the client. What remains is server work per row (B6) or a Custom API. Only D77 brings the
*perceived* time under the target.

## 4. Benchmark protocol — the user runs this on DEV

The agent cannot run it: it needs a signed-in browser session, and it writes cost rows to a test
project (your own Saves).

### 4.1 Setup

1. From `ProjectCosts-CodeApp/` in the `feature/AddCostSavePerf` worktree: `npm run dev` (port 3000)
   and, in a second terminal, `pac code run --appUrl http://localhost:3000` (or `pa app run`).
2. Open the `apps.powerapps.com/.../app/local?...` URL that pac prints, signed in to VSBCloud_Dev.
   Confirm `pac org who` shows VSBCloud_Dev first.
3. Use one **test project** only. Keep DevTools **closed** during timed runs (console output costs
   time with it open); read the console afterwards, or keep it open for every run of a series.
4. Open a fresh tab per flag setting: the per-tab session flags (§5) must start clear.

### 4.2 Save shapes (5 runs each)

| Shape | How to build it | Between runs |
|---|---|---|
| S | Edit 60 cells on existing contracts only (e.g. 5 contracts × 12 months of one year) | Alternate the values (+1 / −1) so every run changes the same 60 cells |
| M | Add 4 new contract rows with 12 months each (48 new costs) and edit 48 existing cells | Remove the 4 new contracts in a separate Save, then wait until its background deletes have finished (the delete toast / console line) before the next timed run |
| L | About 800 changed cells (copy a table, or edit several years) | Alternate the values |
| XL | About 3,500 changed cells (a large project or a copied table) | Alternate the values |

### 4.3 What to read per run

- The client line: `Add Cost from Table client: click→first request …, first request→resolved …,
  resolve→CAPEX painted …` and its group "Client timeline (from the click)".
- The save line (D59): its total, the request count, every `bulk [ms, …]` entry and the gate tail
  (`gate peak N/24`).
- Any 429 or `save failed` line.

Record each run in a table: shape, flags, click→resolved (= click→first request + first
request→resolved), resolve→painted, save-line total, requests, gate peak, 429s. Report the
**median and p90** per shape and flag setting.

### 4.4 Flag settings to compare

1. **Legacy:** `TUNED_CHUNKING = false`, `CHANGED_COLUMNS_ONLY = false` (today's behaviour).
2. **Default branch:** both `true`.
3. **Default + D76:** `DEEP_INSERT_NEW_CONTRACTS = true` (M only; see D76 §6 first).
4. **Default + D77:** `BACKGROUND_SAVE = true` (perceived time; report click→painted).

### 4.5 Pass criteria

- **S median click→resolved ≤ 643 ms and M median ≤ 766 ms**, with `BACKGROUND_SAVE` off;
- no rise in 429s against the legacy setting;
- p90 reported, not judged.

If it fails, the report shows the gap per shape. Then the options are minChunk ≈ 5 (after P0.3),
the WS-C admin changes (§6), a Custom API (D76 §7), or turning on D77 (a product decision).

## 5. How to switch each flag

Each flag is a code constant. Change it, save the file (Vite reloads), and open a **new tab**.

| Flag | File | Default | Off / false |
|---|---|---|---|
| `TUNED_CHUNKING` | `src/data/bulkSend.ts` | `true` | the legacy chunking 25 / 4 / 500, gate 16 |
| `CHANGED_COLUMNS_ONLY` | `src/features/cost/add-costs-from-table/savePlan.ts` | `true` | the full contract column bag |
| `DEEP_INSERT_NEW_CONTRACTS` | `src/data/addCostSheet.ts` | `false` | today's contract create THEN costs |
| `DEEP_INSERT_MAX_CONTRACTS` / `_MAX_COSTS` | `src/data/addCostSheetBulk.ts` | 8 / 24 | thresholds above which today's path is kept |
| `BACKGROUND_SAVE` | `src/features/cost/costing/backgroundSave.ts` | `false` | the Save waits on the sheet, as in the canvas |
| `PAINT_TIMEOUT_MS` | `src/features/cost/costing/saveTimeline.ts` | 10,000 | measurement only |
| `TUNED_BULK_TUNING` | `src/data/bulkSend.ts` | 10 / 8 / 500 / 24 | the tuned numbers themselves (Phase 3 tuning) |

Per-tab session flags (`sessionStorage`; a new tab clears them):
`vsb.addCostSheet.createMultiple501`, `vsb.addCostSheet.updateMultiple501` (D51 501 fallback),
`vsb.addCostSheet.deepInsertUnavailable`, `vsb.addCostSheet.deepInsertConfirmed` (D76).

Changing `TUNED_BULK_TUNING` also changes the UT-BULKCHUNK-002 and 010…023 expectations.

## 5a. P0.3 — chunk-size probe (needs explicit approval: it writes test rows to DEV)

Goal: confirm `a` and `b` and whether `a` grows with parallel requests, before any further tuning.

- One test project, one table (`vsb_capexcost`), throw-away rows created and then deleted by the
  probe.
- Chunk sizes 5, 10, 20, 50, 100; parallel 1, 4, 8, 16; 5 repetitions each. Record each request's
  duration and row count, and the 429 count at a write gate of 24.
- Fit `time = a + b × rows` per parallel level. Watch for `a` rising with parallelism (parent
  contract locks, the browser's connections per host, the org's degree of parallelism).
- The logs give per-request durations but not row counts today; adding rows to the `bulk [...]`
  entries would make the live saves themselves a probe (a `saveLog` / `bulkSend` change, not done).
- **Do not run without the user's approval.** It writes and deletes rows in VSBCloud_Dev, which are
  audited (§6, finding 4) and leave audit history.

## 6. Dataverse audit (WS-C, read-only, 2 Nov 2026)

Read with `pac org fetch` (FetchXML) on VSBCloud_Dev (`pac org who`: env
`be41add6-6f60-ebb0-9c73-2480d6bc615d`), plus the offline export
`ProjectDocs/_extracted/VSBCloud/customizations.xml` (solution 1.21.709). Nothing was changed.
Tables: `vsb_capexcost` (10636), `vsb_capexprojectcontract` (10643), `vsb_capexcomments` (10887).

| # | Area | Finding | Evidence | Lever / expected gain | Who approves |
|---|---|---|---|---|---|
| 1 | Plug-in steps | No custom or ISV step on the 3 tables; only Microsoft platform steps | Live | None | – |
| 2 | Flows, workflows, business rules | None with these tables as primary; no Dataverse-trigger flow on them. The 2 `vsb_project` triggers fire only when the project row changes | Live | None | – |
| 3 | Calculated / rollup / autonumber | No calculated, rollup or formula column. Autonumber: cost `vsb_Name` `{SEQNUM:8}` (generated on every create), contract `vsb_AutoID` `{SEQNUM:4}`. Cost alternate key `vsb_contractyearmonth` | Export | Small (inferred). Sending `vsb_name` would differ from the canvas; keep the key | Product owner (only if `vsb_name` were sent) |
| 4 | **Auditing** | Org audit on (user-access and read audit on, 30 days). Table audit on for all 3. Cost audits `vsb_Cost`, `vsb_Contract`, month, year, `vsb_CostPaid`, owner, BU, state; contract 20+ columns. Last 14 days: cost 9,113 Create / 149 Update / 7,260 Delete; contract 113 / 134 / 94 | Org and counts live; columns from the export | One audit row per write in the same transaction; the only extra on `UpdateMultiple`. **Inferred 5–15%** of server time per bulk request | Product owner / compliance, then a Dataverse admin. Production audit needs decide; changing DEV only distorts parity |
| 5 | Duplicate detection | Org-level on; 8 rules, none on these tables; `IsDuplicateCheckSupported` 0 | Live + export | None | – |
| 6 | **Cascade and inherited sharing** | Account list → contract and contract → cost are parental (every cascade on). 78 of 80 account-list rows are owned by a **disabled user** (Andriy Chevychalov), so every contract (5,558 inherited share rows) and every new cost row gets an inherited share row: about **1.09 per new cost** in the last 14 days; 0 direct shares | Cascade from the export; sharing rows live | Share/unshare/reparent/assign to no-cascade on account list → contract (and possibly contract → cost) stops about one share-row write per created row: **inferred 10–30% of create time** (cost and contract `CreateMultiple`). Delete cascade contract → cost must stay (the Save relies on it). Existing inherited rows need an admin cleanup | Dataverse admin / solution owner (change in the VSBCloud source environment); product owner to confirm nobody relies on account-list ownership for access |
| 7 | Risk, not speed | Deleting one CAPEX account-list row cascades to every contract under it and their costs | Export | – | Product owner / Dataverse admin |
| 8 | Change tracking, sync, retention | Change tracking on (small cost, may be needed downstream); no Synapse/Fabric link; no retention config | Live + export | None worth taking | – |

Could not be read: live table/column metadata and live cascade settings (FetchXML returns too few
columns; `pac` 2.13.1 has no metadata command; no Web API calls were allowed), the total of cost
share rows (over the 50,000 aggregate limit), and the per-row server cost of audit and sharing
(needs writes). **Findings 6 and 4 are the only server-side levers**; measuring them needs an A/B
timing with the setting on and off, which writes to DEV and needs approval. The FetchXML files are in
the session scratchpad
(`C:\Users\ROUNAK~1\AppData\Local\Temp\claude\c--Personal-Code-App-Mordenization-Project-Management-Energy\58ca730f-bf7b-4ddc-a62d-70aa4ca34321\scratchpad\`).

## 7. Live test cases to add to `13-ADDCOST-BULK-SAVE-TEST-PLAN.md`

On a test project, after the benchmark:
1. **D75 chunking.** S and L saves succeed; the save line shows the tuned request counts (a group of
   20+ rows split) and `gate peak ≤ 24`; no 429.
2. **CA-24.** Hard to force live; covered by UT-ACREV-001…007.
3. **D75 changed columns.** Toggle Apply VAT on 60 existing contracts' rows: the contract
   `UpdateMultiple` carries only `vsb_applyvat` (network tab) and the contracts show the new value
   after reload. Compare its time with `CHANGED_COLUMNS_ONLY = false`.
4. **D76 (flag on).** 1–3 new contracts of 1–24 months: the contract and every month row exist with
   the minted ids, the owning BU on every cost row, `vsb_totalcost` right; the log shows the
   deep-insert step and no `upsert costs (new contracts)` step; a second save in the same tab makes
   no `check existing vsb_capexcosts` read; a forced failure makes the tab fall back to
   `CreateMultiple` with the same ids.
5. **D77 (flag on).** DEVEX/CAPEX shows at once with the status toast; Cost writes on the project are
   greyed until the saved toast; closing the tab asks first; a failure (e.g. a refused row) shows the
   error toast and the book shows only what landed.

## 8. Open items

- P0.2 benchmark (§4) and P0.3 probe (§5a, approval needed).
- Product decisions: D75 §7, D76 §8, D77 §7.
- CA-25 (sheet snapshot read mid-write) and CA-26 (ungated reads).
- The client timeline's "first request" is the first `upsert` call; on a retry it follows the
  refresh/verify read. A mark inside `bulkSend.ts` would be exact.
