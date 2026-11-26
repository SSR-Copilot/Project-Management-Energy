# 15 - Target Dataverse Architecture

> Stage 2 (design and planning only), 25 Nov 2026. No application source file has been changed. Inputs: docs 01-14. Findings are cited by ID (doc 12); tasks by T-nn (doc 22).

## 1. Principle: evolve what exists, add one small layer

The audit found a mature data layer (paged reads, write plans, bulk transport, gates, a retry module, shared reads, request logging). The gaps are narrow and consistent: retry and deadline rules that are missing or dead (OR-01, WE-02, CA-01, CA-02), no global ceiling (WE-03), refresh scope wider than the write, a few unguarded writes, and bulk switches that are off. So the target is **one new internal layer plus targeted changes**, not a new client.

What the platform will not allow shapes the design (doc 01 section 4): no `$batch` or change set, no `$expand`, no FetchXML, no aggregates, no `Retry-After`, no cancellation. Nothing in this design depends on any of them.

## 2. Target layers

```
Screen / component                         (composition only; no request logic)
  -> hooks.ts / queries.ts                 TanStack Query: keys, staleTime, invalidation (doc 20)
    -> data/<module>.ts                    one function per business read or write (unchanged shape)
      -> data/ helpers                     fetchAll, countedPage, updateRecordIfExists, deleteRecord,
                                           plans (executePlan), bulk (bulkWrites/bulkSend), flows
        -> data/requestPolicy.ts   NEW     the one place that applies: error class, retry schedule + jitter,
                                           deadline, idempotency rule, global gate lane, [VSB] trace
          -> generated service / SDK client -> host -> Dataverse     (unchanged, pac output)
```

`requestPolicy.ts` is new and small. It does not replace `retry.ts`, `concurrency.ts` or `requestLog.ts`; it composes them and becomes the only caller of the retry schedule and the deadline. `retry.ts` keeps its tested pure functions (rewritten to the status-based policy in T-10).

## 3. Evaluation of each infrastructure item in the brief

| Item | Today | Decision | Reason |
|---|---|---|---|
| Centralized Dataverse client | `getClient(dataSourcesInfo)` plus 96 generated services | **Do not build** | Generated services are pac output and cannot be wrapped or edited; a second client would duplicate them |
| Standard request builder, query utilities | `data/odata.ts` (`f.*`, `idIn`, `dateOnly`, `bind`) | **Keep and extend** (id-list form after probe P-1, T-30) | Already the single home; rule 2 forbids hand-built filters |
| FetchXML / OData execution | OData only | **Do not build FetchXML** | SDK exposes no FetchXML |
| Batch builder, change-set execution | none | **Do not build** | The host sends every request in its own batch; the app cannot share a `batchId` (doc 01 section 4) |
| Bulk operation service | `bulkWrites.ts`, `bulkSend.ts`, `bulkBackend.ts` | **Keep; widen use** (T-40, T-41, T-42, T-43) | Already chunked, 501-tolerant, partial-failure aware |
| Batch response parser | n/a | **Not needed** | Bulk actions return one result per call; parsing exists in `bulkSend.ts` |
| Request deduplication, in-flight sharing | `sharedRead.ts`, TanStack | **Keep; apply to the remaining duplicates** (T-20..T-24) | Mechanism exists; findings are call sites not using it |
| Cache management and invalidation | TanStack + `adminInvalidation.ts`, `pendingDeletes.ts` | **Keep; set rules** (doc 20) | No new cache library |
| Concurrency limiter | `concurrency.ts` (`mapLimit`, `createGate`) | **Add a global ceiling** (T-13) | Per-pool limits do not add up safely (WE-03) |
| Retry / backoff manager | `retry.ts` (header-dependent, partly dead) | **Replace internals** (T-10) | `Retry-After` is unreadable (OR-01) |
| Timeout handling | none | **Add** (T-12) | No deadline anywhere (CA-02, WE-05) |
| Error handling | `platform/errors.ts` | **Extend** with classes and `UnknownOutcomeError` | One taxonomy for retry, UI and tests |
| Telemetry and diagnostics | `requestLog.ts`, `consoleGate.ts`, App Insights (D161) | **Keep; add the census script** (T-00) | Logs already carry rows and ms; production prints nothing (D164) and must stay that way |

## 4. What stays exactly as it is

Business rules, `rules.ts` files, canvas-parity switches (`CANVAS_PARITY_DELETION` and similar are product decisions), the Dataverse schema, security roles and the execution context, the Power Automate flows, the paging invariants of Project Overview (D41-D46), the 'fresh on entry' behaviour of the admin screens, and every visible string.

## 5. Guard against regression of the architecture

A unit-suite gate (**G-REQ**, T-13) lists the modules allowed to call the SDK or a generated service directly (today about 33 data modules, 250 call expressions) and fails on a new one outside the list, so the number can only go down. It follows the pattern of the existing `controlLabels` and `expandChevrons` gates.

## 6. Shared files this design touches

`data/retry.ts`, `data/concurrency.ts`, `data/client.ts`, `data/executePlan.ts`, `data/bulkSend.ts`, `app/Providers.tsx` (query `retryDelay`), `platform/errors.ts`. These are the likely collision points with the frontend and business-logic sessions; doc 24 sets who edits them and in what order.
