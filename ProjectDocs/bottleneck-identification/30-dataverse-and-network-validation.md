# 30 — Dataverse and network validation

> Stage 3, 27 Nov 2026. **Nothing was run against DEV or Dataverse.** All results are from tests over the real data modules with mocked transport, and from builds. Probes P-0..P-6 and the Generators bulk test plan have not been run; none of the tasks in this batch needed them by design.

## 1. Requests, rounds and concurrency (what changed, and what must not have)

| Measure | Before | After | Evidence |
|---|---|---|---|
| Requests for a Cost deep link (same reads) | N | N (identical, asserted) | `costScreenPrefetch.waves.test.ts` |
| Waves before the first Cost read | 2 | 0 | same |
| Waves before the first Production / Revenues read | 1 | 0 | `UT-BOOT-SCREENS-200..206` |
| Peak reads in flight, one 40-chunk read | 40 | 16 | `UT-READLANE-004` |
| CAPEX tab, 640 / 680 contracts | 3 waves, 20 / 21 requests | 3 waves, 20 requests / **4 waves**, 21 requests | `UT-COSTWAVE-READLANE-001..003` |
| Reference list on return visit after 6 min | read again | 0 reads | `UT-QPOL-005/006` |
| Admin CAPEX tree has-contracts reads on tab return | 1 per visible sub-account | 0 | `UT-ADCAPEX-FOCUS-001` |
| Check List shipped Move | 37 requests | 34 (a baseline correction) | bench |
| Write paths | unchanged | unchanged | not modified |

## 2. Reliability properties

- **Read lane error semantics**: the first failure in time propagates with the same error; a chunk still waiting for a slot is not started after a sibling failed (avoids work only). Chunk-level retry (T-C06) was not implemented.
- **No unbounded concurrency was added**: the lane is bounded at 16 (the global ceiling 40 minus the 24-wide write lane); intent data prefetch (OFF) is bounded at 4 screens.
- **No retry behaviour changed.** The D165 retry layer, `requestPolicy` and flow handling are untouched; no non-idempotent operation is retried.
- **Throttling interplay**: the lane counts chunks, not requests; two concurrent adopted calls share the 16 slots, so a large Summary read can delay the same screen's book chunks by a round above 16 chunks. `GLOBAL_GATE` stays OFF; the 16 is unproven against real throttling (probe P-4).
- **Deadlines**: `REQUEST_DEADLINES` stays OFF (query reads bypass `sendWithPolicy`, doc 16).
- **Prefetch and staleness**: a prefetched entry is a hit only inside `staleTime` (default 30 s); at boot the window is the project-gate wait (seconds). Keys that re-read on every mount (Contracts rows, payment targets, DevCo links, OPEX book, device types, Finance project/inputs/repayments/step-ups) are deliberately not prefetched.
- **Data shown is unchanged**: same keys, same functions, same selects; only the start time moves. `Contracts` now starts `devCoCapexCosts` (the heavy all-DevCo-cost-rows read) at boot, which the screen would run on mount anyway (note for the owner: a visit that is abandoned within seconds still pays it).

## 2b. Cache and focus behaviour

The global `staleTime` (30 s), refetch on visibility and default `gcTime` are untouched (DEC-F / DEC-3). Only the reference preset and the has-contracts focus opt-out changed. The has-contracts opt-out has a stated consequence: no account write invalidates them (`capexAccountsWriteKeys` leaves them out on purpose), so a contract booked by a colleague after the check is not seen until the next mount past 30 s; Delete still re-checks on the server. The owner may want to confirm.

## 3. Power Automate dependencies

No flow was modified or called differently. Check List approval and cancellation flows are exercised only in the bench through stubs (S7a/S7b/S8: gate flow 5 hops, cancellation 3 hops, transition poll stubbed to complete at once). Flow durations remain unmeasured anywhere in the repo.

## 4. Not validated

Latency per request on DEV; HTTP 429 behaviour at 16 in flight (the lane is a ceiling, not a measurement); the host's request coalescing (P-6); the Application Insights dependency telemetry for the new prefetch lines (`[VSB] ACTION prefetch …` and `read lane: …`).
