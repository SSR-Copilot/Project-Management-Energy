/**
 * dvopt T-11 adoption for the Cost screens' single-row writes (Land Lease, OPEX periods, Contracts): ONE helper that sends a write
 * through `sendWithPolicy` (`data/requestPolicy.ts`) with the retry matrix of doc 21 section 2, or, with `COST_WRITES_POLICY` off, runs
 * it exactly as before.
 *
 *   kind            retried                                           used for
 *   `create`        a 429 only (a 5xx may have landed: no retry)      a POST of one row
 *   `patchAbsolute` a 429 and a transient 5xx / network failure       a PATCH whose payload states the final value
 *   `delete`        a 429 and a transient 5xx / network failure       a DELETE (a second 404 means the first worked)
 *
 * The label is the ENTITY SET name, never an id or a value (it reaches the `[VSB]` retry line). A failed `IOperationResult` that is
 * not retried comes back unchanged, so the caller's `unwrap` behaves as before. `fn` makes ONE attempt and must not retry itself.
 *
 * QB-01 / QB-02: `costWrite` is the ONE retry layer of a request. A helper that has a policy of its own (`deleteRecord`, `deleteIfExists`,
 * `updateRecordIfExists` in `client.ts`) must be called from `fn` with `{ policy: false }`; otherwise the two loops multiply (3 x 3, 4 x 4) and,
 * with `COST_WRITES_POLICY` off, the inner one would still retry. Off, `fn` runs once, exactly as before the policy existed.
 */
import { sendWithPolicy, type RequestKind } from "./requestPolicy";
import { COST_WRITES_POLICY } from "./leaseOpexFlags";

export type CostWriteKind = Extract<RequestKind, "create" | "patchAbsolute" | "delete">;

export function costWrite<T>(kind: CostWriteKind, entitySet: string, fn: () => Promise<T>): Promise<T> {
  return COST_WRITES_POLICY ? sendWithPolicy(kind, fn, { label: entitySet }) : fn();
}
