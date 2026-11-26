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
