# 07 - Asynchronous execution and concurrency bottlenecks

Stage 1 audit, agent NET (second document). Same worktree, branch and read-only rules as `06-dataverse-and-network-bottlenecks.md`; findings are in `_register/NET.md` with `ASYNC` named in the Root Cause cell of the concurrency findings (NET-02, NET-03, NET-04, NET-05, NET-16, NET-18). Evidence labels as in doc 06: MEASURED (I ran it), REPO-MEASURED (a repo document), DERIVED (counted from code), ESTIMATED. Paths are relative to `ProjectCosts-CodeApp/src/` unless stated.

## 1. Summary

- The write paths are well disciplined: bounded pools (8 / 16 / 4), a status-based retry layer with backoff and jitter, one retry per request (D165), and gates for the Add Cost bulk save. The remaining problems are on the **read side** and in the **gaps between layers**.
- **Reads are the unbounded part.** 17 sites fan out `ceil(N/40)` requests at once with no gate, the TanStack query layer retries the whole fan-out when one chunk fails, and the D165 global gate cannot see query reads (NET-02, NET-04, NET-05). The repo's own review already counted a case of 57 requests in flight against the 52-per-user limit (`data/bulkSend.ts:99-104`).
- **Nothing can be cancelled.** The SDK has no abort or timeout (MEASURED grep: no match in `node_modules/@microsoft/power-apps/dist`), no query function uses TanStack's `signal`, so cancel and invalidate discard results while the requests run on (NET-03, NET-16).
- **Flows are a dependency, not a code bottleneck.** Seven cloud flows are called from user-blocking write jobs, never retried and without a deadline; their latency is not recorded anywhere in the repo (section 9, NET-17, NET-18, NET-19).
- Client CPU in this layer is not a bottleneck: the console trace costs about 10-26 microseconds per request (MEASURED, section 7) and the heaviest client-side prepare I could run takes 3-146 ms per step on 15,000 rows (MEASURED, section 8).

## 2. Scope and method

Read: `data/concurrency.ts`, `data/requestPolicy.ts`, `data/retry.ts` (first 80 lines), `data/client.ts`, `data/bulkSend.ts` (tuning and gates, lines 40-130 and 355-420), `data/flows.ts`, `app/Providers.tsx`, `app/queryLog.ts`, `platform/requestLog.ts`, `platform/consoleGate.ts`, `platform/telemetry.ts`, `appInsights/appInsights.ts`, `appInsights/sanitize.ts`, `app/generatorsWarmup.ts`, `app/bootPrefetch.ts`, the checklist, general-data and generators hooks around their flow calls, the project-main next-page prefetch, TanStack `query-core` 5.102.8 (`query.js`, `queryClient.js`, `removable.js`), and the SDK executor. Greps over all non-test `src/` for `AbortController`, `AbortSignal`, `signal`, `setTimeout`, `setInterval`, `refetchInterval`, `gcTime`, `cancelQueries`, `Promise.all`, `mapLimit`, `createGate`.

Not read: `executePlan.ts` and `bulkSend.ts` internals beyond the gates, the e2e harness, `persistedReference.ts`, every Screen file except where a flow is called. Throwaway code is under `ProjectDocs/bottleneck-identification/_bench/NET/`.

## 3. Pool widths and how they add up

Every width below is a constant in source (I opened each). They are per call site: **no ceiling spans them** (`GLOBAL_GATE` = false, `data/requestFlags.ts:26`, and it would not see reads, NET-05).

| Pool / gate | Width | Where | Guards |
|---|---|---|---|
| `WRITE_CONCURRENCY` (default `mapLimit`, plan groups) | 8 | `data/concurrency.ts:31` | single-row writes |
| `WIDE_GROUP_CONCURRENCY` (Generators, Production, Revenues, Finance groups) | 16 | `concurrency.ts:41` | plan groups; a group runs alone |
| `DELETE_CONCURRENCY`, leaf deletes | 16 | `concurrency.ts:140,156` | row deletes |
| Cascade deletes (Land Lease costs, generator types) | 4 | `concurrency.ts:157` | cascades, 6-11 s each when overlapped (D51) |
| Add Cost `saveGate` (`BULK_TUNING.writeGate`, `TUNED_CHUNKING` on) | 24, with `parallel` 8 and `minChunk` 10 | `data/bulkSend.ts:121-128,384-387` | all bulk and per-row save writes; its 429 behaviour is marked UNVERIFIED in the source comment |
| `contractDeleteGate`, `costDeleteGate`, CAPEX `panelDeleteGate` | 4, 4, 4 | `bulkSend.ts:397-415`, `data/capexWrites.ts:717` | deferred deletes |
| Per-row fallback writes | 16 | `bulkSend.ts:368` | after a 501 |
| Generators / OPEX / device / verify / existence reads | 4 each | `data/generators.ts:60,684`, `production.ts:303`, `verifyGone.ts:23`, `costUpdateGuard.ts:23` | id-list reads |
| Finance cost-chunk reads | 8 | `data/finance.ts:45` | reads |
| Person lookups | 6 | `data/personCache.ts:35` | Entra |
| Admin `hasContracts` pool, order writes | 6, 4 | `data/adminFlags.ts:50`, `data/adminDefaultChecklists.ts:317` | admin |
| Planned global gate (OFF) | ceiling 40, write lane 24 | `concurrency.ts:241-242` | `sendWithPolicy` callers only |
| **Unbounded** `Promise.all(chunk(ids).map(fetchAll))` | ceil(N/40) | 17 sites (register NET-04) | nothing |

How they add up (DERIVED from the constants; the 52 limit is the Dataverse per-user figure quoted at `data/concurrency.ts:10-12`):

| Situation | In flight at the worst moment |
|---|---|
| Add Cost bulk Save | 24 gated writes + 4 contract cascades + 4 cost deletes = 32; with the CAPEX panel's gate 36 (documented, `bulkSend.ts:409-412`). The ungated verify reads add ceil(N/40): the repo's own example reaches 57 (`bulkSend.ts:99-104`) |
| After the Save | The navigation mounts the CAPEX screen: `invalidate()` refetches the book (`refetchType: "all"`) and totals at once = about 2 + ceil(A/40) + ceil(C/40) + 1 + ceil(C_all/40) requests, beside the 8 deferred-delete slots (`useCostBook.ts:721-741`) |
| Generators save | one group of up to 16 writes + the background reload (9-13 reads, D144) = up to 29, plus the warm-up reads if the screen was opened less than 1.5 s earlier |
| Land Lease save or delete | one tier at a time (8, 16 or 4) + at most 3 existence reads (`costUpdateGuard.ts`) + the reload |
| Admin CAPEX clean-up | two pools together (8 zero PATCHes + 16 deletes = 24, `adminCapexAccounts.ts:451-455`) + the `hasContracts` pool 6 + any focus refetch of the tree |
| CAPEX tab load | 2 x ceil(C/40) reads together (payments and comments, `useCostBook.ts:121`) + the standard-assumption reads: 50 at C = 1000 |

Why a wider pool is not the answer: D51 measured 16 deletes in one pool pushing every request to about 3 s with the writes waiting about 4 s behind them (REPO-MEASURED, `bulkSend.ts:402-415`). The platform, not the pool, is the limit, so the useful levers are fewer requests and fewer waves (D165's plan), and an honest ceiling that counts reads.

## 4. The read fan-out (NET-04, NET-05, NET-12)

Pattern, at 17 sites: `await Promise.all(chunk(ids).map((ids) => fetchAll(...)))` (`data/costBook.ts:539,949,1079,1255`, `contracts.ts:177,205,256`, `landLease.ts:172,177,303`, `comments.ts:66`, `addCostSheet.ts:164,214`, `opexCatalog.ts:152,160`, `standardContracts.ts:31`, `bulkSend.ts:197`, `adminGatesApprovals.ts:286`). Properties:

1. Width is `ceil(N/40)`; `CHUNK = 40` (`data/odata.ts:70`) because ids go into an `or` chain.
2. All chunks start in the same tick; there is no read gate. The planned global gate is entered only through `sendWithPolicy` (`requestPolicy.ts:184-199`) and `requestGate` is referenced from nowhere else.
3. The wave is as slow as its slowest chunk, and the failure of any chunk rejects the whole `Promise.all` while the siblings continue (nothing can be cancelled, NET-03).
4. The query layer retries the whole function (NET-02).

Data volumes are not in the repo: the only counts are "579 cost rows on Wirmighausen" and "tens of thousands elsewhere" (`costBook.ts:1085-1089`), and contract counts per category are unknown. The formulas are the finding; the threshold C = 1000 is arithmetic, not an observation.

## 5. Retry layers and how they interact (NET-02)

| Layer | Applies to | Tries and wait | Source |
|---|---|---|---|
| TanStack query retry | every `useQuery` read | 2 retries when `isRetryable` (5xx, 429, no status; not 403/404/deterministic); wait by class: 429 equal jitter on a 2 s base (1-2 s first), others full jitter (0-1 s, 0-2 s) | `app/Providers.tsx:24-26`, `data/retry.ts:78-83`, `platform/errors.ts:129` |
| `sendWithPolicy` | writes (create 429 only; patch and delete 429 + transient), a few verify and existence reads | 3 tries transient, 4 throttled, backoff base 1 s x2 cap 15 s (429: 2 s base, 7-14 s worst case); at most 2 tries with no HTTP status | `data/requestPolicy.ts:129-173`, `data/retry.ts:35-60` |
| Bulk transport and delete helpers | bulk calls (429 only), per-row delete | own loops guarded by `insideOwnRetry` / the `policy` option so a request is retried by one layer | `requestPolicy.ts:114-116` |
| Mutations | all | none (`mutations: { retry: false }`) | `Providers.tsx:34` |
| Flows | all | none, by design (a retry could send a second approval) | `requestPolicy.ts:22` |

Interaction found: the first row retries a **function**, not a request. For a fan-out it multiplies requests by the number of chunks and by 3 (one try plus two retries), and a 429 caused by the fan-out is answered 1-2 s later by an identical fan-out. Until D165 T-14 this was masked on the four heaviest reads (`retry: false`); `COST_READS_RETRY = true` (`data/leaseOpexFlags.ts:47`, `useCostBook.ts:81`) removed the mask. The test that pins it (UT-READRETRY-004) counts reads of the function, not requests. The write layers do not stack with each other (D165 UT-COSTSTACK-*); I found no second layer on a write path.

Worst case of one failing CAPEX tab load, for the formula in doc 06 section 7: `3 x (1 + ceil(A/40) + 2 x ceil(C/40))` requests (DERIVED), e.g. C = 400, A = 40: `3 x (1 + 1 + 20) = 66` instead of 22.

## 6. Cancellation, work after unmount, timers and polling (NET-03, NET-18)

- **No abort path** (MEASURED): `grep -rln "AbortController\|AbortSignal\|signal"` over the SDK `dist/` finds no file, and `timeout` finds nothing; over `src/` (non-test) the only mention is a comment (`requestPolicy.ts:10`). No `queryFn` reads TanStack's `signal`.
- TanStack behaviour (`query-core/build/modern/query.js:138-139,158`): when the last observer leaves and the signal was not consumed, the query only calls `cancelRetry()` (the running function finishes); `cancelRefetch` (default true for `invalidateQueries`) on a query that already has data cancels the fetch's result and starts a new one. The app depends on this on purpose: `useCostBook.ts:721-741` cancels the book and totals reads before invalidating so a pre-write answer cannot land. That is correct, but it doubles the in-flight fan-out of a read already running, and the abandoned requests keep counting toward the per-user limit.
- **Work that continues after the screen is left, by design:** deferred Add Cost deletes (the tab is held, `HOLD_TAB_FOR_DEFERRED_DELETES`), write jobs of `usePlanWrite`, and `waitForClusterTransition` (`features/pm/checklist/hooks.ts:79-90`), which polls up to 20 times at 1.5 s for 30 s with no unmount check inside a blocking job.
- **Timers (all of them, MEASURED grep over non-test src):** Generators warm-up 1.5 s or 20 s idle (cleared on unmount, `app/generatorsWarmup.ts:72-87`); next-page prefetch 1.5 s (cleared, `features/pm/project-main/hooks.ts:204-206`); Azure Maps token refresh 10 minutes before expiry only while a map is retained (`platform/azureMapsToken.ts:111-130`); the persisted-cache storage timeout; the request log flush (`platform/requestLog.ts:219`); the transition poll above; UI-only timers in Add Cost, Planning, Grid Operator and the map. **There is no `setInterval` and no `refetchInterval` anywhere.**
- A deadline is possible only as "stop waiting" (`withDeadline`, `requestPolicy.ts:54-78`, OFF); it cannot free the host connection or the Dataverse work.

## 7. Telemetry overhead on the request path (MEASURED)

What runs per request: the SDK reports each request as a `networkRequest` metric to `powerClient.ts:ensureInitialized`, which calls `trackMetric` (App Insights dependency) and `logHttp` (console line); every query fetch and mutation opens an ACTION scope (`app/queryLog.ts:57-89`) so `logHttp` loops over all open scopes; `logData` batches per kind and table with a timer.

Benchmark: `_bench/NET/telemetry.bench.mjs` runs verbatim copies of `platform/requestLog.ts` and `platform/consoleGate.ts` (two edits: the import specifier gained `.ts` and `import.meta.env.MODE === "test"` became `false`), with the gate **closed** as in Production, a 2,668-character URL (40 contract ids) and Node v24.22.3:

`cd _bench/NET && node --experimental-strip-types telemetry.bench.mjs`

| Call (20,000 each after 2,000 warm-up) | Run 1: total / per call | Run 2 (saved in `telemetry.bench.out.txt`) |
|---|---|---|
| `logHttp`, 2.7 kB URL, gate closed | 529.0 ms / 26.45 us | 190.9 ms / 9.54 us |
| `logHttp` with 30 open actions | 402.3 ms / 20.12 us | 197.3 ms / 9.87 us |
| `logData`, 5 targets | 39.1 ms / 1.96 us | 13.1 ms / 0.66 us |
| `beginAction` + end | 46.1 ms / 2.31 us | 16.3 ms / 0.82 us |
| `redactIds` on a 90-character key | 17.2 ms / 0.86 us | 6.6 ms / 0.33 us |

The two runs differ by about 2.7x (machine noise; the first run was the colder one), so I quote the range: `logHttp` 10-26 microseconds, the rest 0.3-2.3 microseconds.

Reading: the line text is built (URL parse, `decodeURIComponent`, regex) before the gate decides to drop it, but 2,000 requests cost about 19-53 ms in total, spread over seconds of network wait (DERIVED from the per-call figure). This is a **negative finding**: no register row. Not measured: the browser console with DevTools open in non-Prod environments (printing is slower than the stub), and the App Insights SDK's own batching, serialisation and beacon work per dependency item (`toDependency` allocates an id, parses the URL and strips ids: `appInsights/sanitize.ts`, ESTIMATED tens of microseconds). The telemetry queue is capped at 100 items before the connection string is known and the held console lines at 1,000, so the early-boot cost is bounded. The SDK itself is a separate 198.9 kB chunk (REPO-MEASURED, D119) loaded after the environment variable arrives, off the first paint.

## 8. Main-thread work after responses (MEASURED, existing benchmark)

`npx vitest run src/features/cost/add-costs-from-table/prepare.bench.test.ts --reporter=verbose` (one existing file; 3 tests passed in 6.34 s) printed, for a seeded 15,000-row sheet with 14,650 edited rows:

| Step | ms |
|---|---|
| `buildInitialSheet` | 53.0 |
| `sheetRowsToGrid` | 145.8 |
| `gridToJson` (load) | 55.2 |
| `outputRowsToSheetRows` (load) | 32.1 |
| `gridToJson` (edit) | 32.0 |
| `outputRowsToSheetRows` (edit) | 26.5 |
| `validateSheet` | 85.5 |
| `identityRoundTripFailures` | 2.9 |
| `diffRows` | 25.2 |
| `prepareSheetSave` (whole Save prepare) | 34.5 |

The load-side steps sum to about 286 ms for 15,000 rows, and UT-ADDPERF-002/003 pin linear (not quadratic) behaviour. Against round trips of 0.2-0.5 s and bulk requests of 0.6-1.9 s (doc 06 section 2.1) this is not a bottleneck. Row mapping in the Cost book (`loadPayments`, `loadContractCostSums`) is a single pass with a `Map` per response (`data/costBook.ts:1079-1130,1255-1290`); I did not time it in a browser and the grid render is the frontend audit's. No row-mapping step I read blocks the thread for a perceptible time.

## 9. Power Automate dependencies

Scope: the cloud flows the app **calls** (`data/flows.ts`) and the server-side automation its writes **trigger** (D165 doc 08, section E, from `ProjectDocs/migration-plans/04-flow-inventory.md`, verified there 19 Oct 2026). This section documents the dependency and its latency contribution only; it does not propose changing any flow, and the flows are not modified by anything in the register (NET-17, NET-18 and NET-19 are about how the app waits).

**What the repo knows about flow latency:** nothing measured. The only recorded numbers are the platform limit for a `Run` ("within the platform's 120 s", `16-PM-FLOWS-IN-THE-CODE-APP.md:26`), and the canvas tooltip's "wait 30 seconds" that the code app copied into the poll (`features/pm/checklist/hooks.ts:70-72`). Every flow call is already timed by the app (`[VSB] DATA execute flow <name>`, `data/flows.ts:runFlow` through `loggedCall`), so a DEV capture with `scripts/request-census.mjs` would give the first real numbers.

### 9.1 Flows the app calls (seven, not six: the six PM flows plus the Azure Maps token flow)

| Flow (DEV id prefix per D165 doc 08) | Call site | Where it sits in the user's wait | Retry / deadline | Latency evidence |
|---|---|---|---|---|
| Perform Common Request of Gate Approval (`7235fad7`) | Check List, Request Approval in cluster mode: `features/pm/checklist/hooks.ts:580-590` | after the tracking pre-patch, inside the blocking write job; then, for an Only Notifications gate, `waitForClusterTransition` (first read after 1.5 s, up to 20 reads, 30 s), then a cluster list read and the note POST | never retried (`requestPolicy.ts:22`); no deadline | none; the flow keeps running after it responds and is not awaited |
| Perform Common Request of Check List Approval (`b0b35f43`) | Check List, task mode: `hooks.ts:557` | after a fresh task read and the PATCH | same | none |
| Perform Request of Gate Approval Cancellation (`d68b3a66`) | Check List cancel: `hooks.ts:613`; General Data: `features/pm/general-data/hooks.ts:272` | Check List: after the tracking patch, before the note. General Data: between Patch #2 and the return to Draft, inside the save chain, preceded by a gates read (cache-reused when fresh, PB-15); failure swallowed and logged (`IfError(...)` parity) | same | none; General Data path is rare (start cluster changed while a Draft approval runs) |
| Perform Request of Check List Approval Cancellation (`67e2929f`, not in the 1.21.709 export) | Check List row cancel: `hooks.ts:625-633` | blocking overlay until it answers `success`, then a reload | same | none |
| Request Module Permission (`483a3074`) | Generators, after a type is added: `features/pm/generators/hooks.ts:388` | a slow flow holds the one-job guard of the screen (D165 doc 08, `Screen.tsx:641-660`) | same | none |
| Request permission cancellation (`1a8b4be8`) | Generators card Cancel, and in front of every delete / replace of a type: `generators/hooks.ts:396`, `flowBesideReads.ts:18-30` | in series before the 2-3 Identify read waves while `flowBesideReads` is OFF (NET-19) | same | Replace measured 4.30 s total with the flow inside (D144), flow share not separated |
| Get Azure Maps SAS Token (`5ebce9d1`) | General Data map: `platform/azureMapsToken.ts:164` | first map open waits for it; cached in memory and `localStorage` for the token lifetime (24 h at most); refresh 10 min before expiry only while a map is mounted; a failure is not retried for 60 s | caching by design, no deadline | none; no Dataverse involved |

Properties that matter for latency, all DERIVED from the call sites: the flow time is **added in series** to the write job; the job's overlay (`usePlanWrite`, "Please wait") blocks the screen until it ends; there is no deadline, so a hung `Run` holds the overlay up to the platform's 120 s; no flow call goes through `sendWithPolicy`, the global gate or the Cost write lock's timeout; the approval flows answer at "Respond to a Power App" and continue afterwards, so the app waits for the response, not for the approval.

### 9.2 Server-side automation the app's writes trigger (documentation only)

| Automation | Fired by | Latency contribution to the user |
|---|---|---|
| `SynchroniseProjectState` (flow, tracking Added/Modified to In Progress) | General Data tracking rebuild, Check List back-fill, Move, Reset, Activate, gate cancel patch | asynchronous; the client re-reads afterwards; ordering with parallel tracking upserts is an open question (D165 doc 12, PM B item 7) |
| `UpdateTeamsandSPOSite`, `CreatingTeamsandSPOSite-ProjectCreation` | project cluster state change; New Project create | asynchronous (the app re-reads the row after a create) |
| `LoadDevexCapexCostTotalCapacityTrigger` (flow) | every Generators plant roll-up PATCH | asynchronous; fires even when the totals did not change (PA-04, held DEC-B) |
| Project plugins (Milestones: COD, construction, end date; Production: 3 async plugins on the flags PATCH) | Milestones save; Production generation | some synchronous, some async; the client re-reads and never recomputes |
| Revenues balancing-price period-date plugin | balancing create/update | synchronous; the reload after a balancing save must stay |
| `VSB_CapexAssumptionDeletion`, `VSB.BoPContractAssumptionDeletion` (pre-validation plugins) | admin delete of a standard assumption | synchronous; one click can be a long server transaction and an ambiguous 504 reads as failure (AD-11) |
| Land Lease / OPEX / CAPEX cost tables | none | no flow or plugin exists on these tables (D165 doc 08), but the Dataverse cascade of a contract delete measured 5.2 s (D51 section 11.14) |
| `WhenProjectDatagetsupdated-SendE-MailCardtoPortfolioManagers` | unknown trigger, missing from the export | unknown: any change in the number of project PATCHes is behaviour-relevant until it is located |

### 9.3 Findings that come from this section

NET-17 (flow outcome and the blocking overlay), NET-18 (30 s poll for the gate flow's cluster move), NET-19 (cancellation flow in front of the Identify reads). All three concern how long the app waits and how it reports an unknown outcome. None needs a flow change: the measurement that unblocks them is the `[VSB] DATA execute flow` timing on DEV.

## 10. Checked and found NOT to be a bottleneck

- Write-path retry stacking: one layer per request; a persistent 503 sends 3 requests per row and a persistent 429 sends 4 (D165 UT-COSTSTACK, REPO test, not re-run by me).
- Gate hand-over and slot release: `createGate` and `createRequestGate` give a finished task's slot straight to the next waiter and never exceed their limit (`concurrency.ts:207-232,272-321`); the retry wait sits outside the slot in `sendWithPolicy` (`requestPolicy.ts:199,225`).
- The serial awaits I read in the current-user chain: `loadCurrentUser` starts the directory entry and the country map with the user row (`startupFlags.parallelUserLookups` ON, `data/currentUser.ts:208-219`), so the only forced chain is user, teams, team roles (depth 3). In `loadProject` the country, state and area reads run together (`data/project.ts:275-279`). No new serial pair of independent reads turned up in the files I opened; the earlier programmes' lists (D165 docs 04 and 12) remain the reference.
- Polling cost: the only loop is the transition poll, one 1-row read per 1.5 s and bounded at 30 s.
- Console and App Insights per-request cost: section 7.
- `fetchAll` page loop: sequential by necessity (skip token), bounded, and it fails rather than truncating (`data/client.ts:87-97`).

## 11. Limitations

- No browser, host or Dataverse run: all concurrency numbers are derived from constants and loops; the 52-per-user limit is quoted from the repo's own comments, not verified by me.
- The telemetry benchmark is a Node micro-benchmark of verbatim copies, not a browser profile; it measures CPU only.
- Flow latency, throttling behaviour and host timeouts are unmeasured; D165 probes P-4 and P-5 remain the way to find out.
- `usePlanWrite`, `executePlan` and the feature Screen files were read only where a flow or a timer is called.
