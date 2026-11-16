/**
 * Reads deleted rows back: which of these ids does Dataverse still return? (Generators delete hardening, DEL-2.)
 *
 * A delete answers "done" or "404 gone", and neither proves the row is absent: a 404 from a wrong entity set or
 * a stale gateway looks the same as a real one, and a delete can be acknowledged and not applied. After a
 * hardened run `executePlan` reads the affected ids back with `verifyGone`; one still present is a failure
 * (`DeleteNotConfirmedError`).
 *
 * One read per 40 ids (`CHUNK`, the URL limit of the `or` filter), at most 4 reads in flight, `$select` of the
 * primary key only. A failed read THROWS (it is never read as "gone"): the caller cannot tell, and says so.
 */
import { guardedCall, primaryKeyOf, type GuardedUpdateClient } from "./client";
import { forEachLimit } from "./concurrency";
import { chunk, idIn } from "./odata";
import { loggedCall } from "@/platform/requestLog";

/** The one read `verifyGone` needs from the SDK client (the real `getClient` result has it; tests stub it). */
export type VerifyClient = Pick<GuardedUpdateClient, "retrieveMultipleRecordsAsync">;

/** Reads in flight at once. */
export const VERIFY_READ_CONCURRENCY = 4;

/**
 * Rows a hardened delete reported as done or gone are still there. Carries the COUNT and the entity set only:
 * ids are never put in a message, a log line or a screen text.
 */
export class DeleteNotConfirmedError extends Error {
  readonly entitySet: string;
  readonly count: number;

  constructor(entitySet: string, count: number) {
    super(`${count} ${count === 1 ? "row" : "rows"} of ${entitySet} ${count === 1 ? "is" : "are"} still present after the delete`);
    this.name = "DeleteNotConfirmedError";
    this.entitySet = entitySet;
    this.count = count;
  }
}

/**
 * The ids (as given, in input order) that are STILL PRESENT in `entitySet`. An empty result means every id is
 * gone. Duplicates (any case) are read once. Throws for an unregistered entity set and for a failed read.
 */
export async function verifyGone(
  client: VerifyClient, entitySet: string, ids: readonly string[],
): Promise<string[]> {
  const primaryKey = primaryKeyOf(entitySet);
  if (!primaryKey) {
    throw new Error(`Table "${entitySet}" is not registered in this app — run \`pac code add-data-source\` for it.`);
  }
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    const key = id.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(id);
  }
  const present = new Set<string>();
  await forEachLimit(chunk(unique), async (batch) => {
    const filter = idIn(primaryKey, batch);
    const rows = await loggedCall(
      "read", `verify deleted ${entitySet}`,
      () => guardedCall(`verify deleted ${entitySet}`, () =>
        client.retrieveMultipleRecordsAsync<Record<string, unknown>>(entitySet, {
          select: [primaryKey], ...(filter ? { filter } : {}), maxPageSize: batch.length,
        })),
      (found) => found.length,
    );
    for (const row of rows) {
      const id = row[primaryKey];
      if (typeof id === "string") present.add(id.toLowerCase());
    }
  }, VERIFY_READ_CONCURRENCY);
  return unique.filter((id) => present.has(id.toLowerCase()));
}
