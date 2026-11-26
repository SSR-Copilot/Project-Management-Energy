/**
 * Switches of the shared request core (dvopt T-10, T-12, T-13). Each is a plain boolean constant, so a rollback is a
 * one-line change and the old code path stays in the tree (CONVENTIONS rule 15: live product decisions, not dead code).
 *
 * Tests flip them with `vi.mock("./requestFlags", ...)`; `sendWithPolicy` also takes a per-call override.
 */

/**
 * T-10 (OR-01, WE-01). ON = status-based retry policy: classes from the HTTP status, exponential backoff with full jitter,
 * bulk writes retry only a 429, a DELETE also retries a bare 503, the query client waits with jitter.
 * OFF = the previous rules exactly (`legacyRetryDelay`, `legacyDeleteRetryDelay`, TanStack's default delay).
 */
export const RETRY_POLICY_V2 = true;

/**
 * T-12 (CA-02, WE-05). ON = `sendWithPolicy` races every attempt against a deadline: a read throws a retryable timeout, a write
 * throws `UnknownOutcomeError`. OFF = no deadline (today's behaviour: a hung call hangs for ever). Ships OFF until the deadlines
 * are calibrated from the DEV capture.
 */
export const REQUEST_DEADLINES = false;

/**
 * T-13 (WE-03). ON = `sendWithPolicy` runs each attempt through the global request gate (`requestGate`, ceiling 40, write lane 24).
 * OFF = no global ceiling (today's behaviour). Not wired into any caller yet.
 */
export const GLOBAL_GATE = false;

/*
 * T-11 (WE-02, CA-01, CA-17). Adoption of `sendWithPolicy` (`requestPolicy.ts`) by the write paths, one switch per module. Each is
 * ON by default. OFF = the module sends exactly as before T-11 (no retry, no extra log line). They only matter while
 * `RETRY_POLICY_V2` is on: with it off `sendWithPolicy` retries nothing but a delete and a bulk call by the old rules.
 * Flow calls never go through the policy.
 */

/** `data/client.ts`: `deleteRecord` ('delete', a 404 after a retry means done) and `updateRecordIfExists` (existence read 'read', PATCH 'patchAbsolute'). */
export const POLICY_CLIENT_WRITES = true;

/** `data/executePlan.ts`: the plan engine's single create ('create'), update ('patchAbsolute'), plain delete ('delete'), guarded update, and `verifyGone`'s reads. Hardened deletes keep their own `withDeleteRetry`. */
export const POLICY_PLAN_WRITES = true;

/** `data/bulkSend.ts` + `generatorsBulk.ts`: the Add Cost / CAPEX bulk transport ('bulk': 429 only), the per-row upsert fallback ('patchAbsolute'), the deep insert ('create'), the per-row writes after a 501. */
export const POLICY_BULK_TRANSPORT = true;

/** `data/bulkSend.ts` `existingIds` (phase-0 verify, the per-row guard, the 404 read-back) and `generatorsBulk.ts` `readExisting`: reads made inside a write path ('read'). With `GLOBAL_GATE` on they also take a read slot of the global gate (CA-17). */
export const POLICY_VERIFY_READS = true;

/** `data/adminRowWrites.ts`: `createRowsEach` ('create'), `updateRowsEach` and `updateRecordJustCreated` ('patchAbsolute'), `deleteRowIfPresent` ('delete'). The CAPEX clean-up keeps its own retry (`withIdempotentRetry`, `withDeleteRetry`); it is never stacked. */
export const POLICY_ADMIN_WRITES = true;
