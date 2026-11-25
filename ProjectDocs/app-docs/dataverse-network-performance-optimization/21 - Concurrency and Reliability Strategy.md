# 21 - Concurrency and Reliability Strategy

> Stage 2 (design and planning only), 25 Nov 2026. Inputs: docs 10 (11 findings) and 11 (22 findings), including OR-01 (Retry-After unreadable). Tasks: T-10 to T-14, T-04.

All numeric values below marked **initial** are starting points to be calibrated from the wave-0 capture (T-00, probes P-4 and P-5). They are not measurements.

## 1. Error classification

One taxonomy, in `platform/errors.ts`, derived from `status` (the SDK exposes no headers).

| Class | Status / signal | Meaning |
|---|---|---|
| validation | 400 | the request is wrong; never retried |
| auth | 401 | session; surface, never retried by the app |
| permission | 403 | surface; never retried (reads may use `unwrapOrForbidden`) |
| not-found | 404, `0x80040217` | for a delete: done; for a read or update: row gone (`RecordGoneError`) |
| conflict | 409, 412 | surface; a create's 'already exists' triggers a read-back (X3) |
| throttled | 429 | **not processed**: safe to retry any request type after back-off |
| transient | 500, 502, 503, 504, 408, no status (network) | the server may or may not have processed it |
| unknown outcome | a write that exceeded its deadline or ended in a transient/network class | shown as 'may or may not have been saved' |

## 2. Retry and idempotency matrix

| Request type | 429 | transient (5xx, network) | unknown outcome |
|---|---|---|---|
| Read (GET, `fetchAll` page) | retry | retry | n/a |
| Delete | retry | retry (a second 404 means the first worked) | read back |
| PATCH with absolute values (a constant, or the value being saved) | retry | retry | read back |
| Create with a client id | retry | **no auto-retry**; the user's retry reuses the id (X3) | read back, then offer retry |
| Bulk action (`Create/Update/UpsertMultiple`) | retry | **no** (the call may have partly landed) | reconcile (doc 17 section 4) |
| Flow call | **no** (a flow can send a real approval) | **no** | re-read the row, restore state, show 'unknown' (T-08) |
| Create without a client id (to be removed, T-09) | retry | no | - |

A retry never changes the payload and never starts a second flow.

## 3. Back-off

Exponential with **full jitter**, per request, plus a **budget per save** (a ceiling on total retries so a throttled save ends instead of looping). **Initial:** base 1 s, factor 2, cap 15 s; 3 tries for transient, 4 for 429. Reads: the query client's `retryDelay` uses the same function so reads and writes do not retry in step. `Retry-After` is read if a future host exposes it, otherwise ignored (OR-01).

## 4. Deadline

`Promise.race` against a timer; it stops **waiting**, it cannot cancel the request (no `AbortController` path through the SDK). A read that exceeds its deadline throws a retryable timeout; a write that exceeds it throws `UnknownOutcomeError`. A retry wait releases its gate slot (WE-05). **Initial** (to be set from P-5 and the capture's p99 plus margin): reads 60 s; writes 120 s, the platform's own limit for a flow call. A wrong deadline makes a slow success look unknown, so it is calibrated before it is switched on and sits behind a switch.

## 5. Concurrency design

| Layer | Setting | Source |
|---|---|---|
| Dataverse limit | 52 concurrent per user per web server; about 6,000 requests per 5 minutes | platform |
| **Global ceiling (new, T-13)** | **initial 40** total in flight for requests sent through the shared helpers | leaves room under 52 |
| Write lane inside it | 24 (the Add Cost / bulk gate today) | `bulkSend.ts` |
| Per-pool limits | writes 8, wide groups 16, leaf deletes 16, cascade deletes 4 | `concurrency.ts`, unchanged |
| Reads | share the ceiling; `fetchAll` pages sequentially per read | - |
| Verify reads | now inside the gate (CA-17) | T-13 |

**Honest limit:** the gate sees only requests that go through the shared helpers. A direct generated-service call in a data module is not counted. T-13 routes the hot paths, and the G-REQ allow-list test (doc 15 section 5) keeps the number of direct sites from growing.

Dependent work is never concurrent: a plan's groups run one after another (`executePlan`), and a caller must not run two groups at once (the 16 + 16 + 8 warning in `concurrency.ts`).

## 6. Duplicate submissions and ambiguity

A double click is blocked by the busy state; a retry after ambiguity reuses the create id; a second tab cannot create the same Planning rows (T-07); an 'unknown outcome' is never retried automatically for a create or a flow. Findings: WE-04, CB-14, CA-07, PB-01, PB-05.

## 7. Diagnostics

Every retry, deadline, gate wait and unknown outcome prints one `[VSB]` line (counts, class, wait; never row values; nothing in Production, D164). The census script (T-00) reads them, so retry counts are measured, not inferred.

## 8. Failure tests (Stage 3, doc 30)

429 and 5xx on a read, a single write, a bulk chunk and a delete; a network drop; a timeout on a write and a read; a 400/403; a duplicate Save with a delayed first answer; an interrupted bulk run; a flow call that fails after it started. Each asserts the matrix above and that no row is duplicated or lost.
