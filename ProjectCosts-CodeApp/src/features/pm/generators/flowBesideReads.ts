/**
 * Generators screen — the permission-cancellation flow beside the Identify reads (PA-05, dvopt T-22). A module of its own (not in
 * `hooks.ts`) so the screen tests that replace `./hooks` whole keep working with the real helper.
 */
import { generatorsPerf } from "@/data/generatorsPerfFlags";

/**
 * PA-05 (dvopt T-22, `GENERATORS_PERF.flowBesideReads`): the permission-cancellation flow of a delete / replace and the Identify reads of
 * its plan are independent (the flow writes only the type row's request fields, which no Identify read selects; the plan is built from the
 * row the screen already holds). They run together; the caller builds the plan only after this has returned, i.e. after BOTH settled, so the
 * flow still completes before any delete (the D97 order).
 *
 * Failure precedence is the old order's: `cancelFirst` (the deletes: the flow ran first, its failure was thrown before any read was sent)
 * throws the flow's error when both fail; `readFirst` (the replaces: the reads ran first) throws the reads'. Both are awaited, so nothing
 * is left running when the plan step ends. OFF: the old sequence.
 */
export async function cancelBesideReads<T>(
  cancel: () => Promise<void>, read: () => Promise<T>, order: "cancelFirst" | "readFirst",
): Promise<T> {
  if (!generatorsPerf().flowBesideReads) {
    if (order === "cancelFirst") { await cancel(); return read(); }
    const value = await read();
    await cancel();
    return value;
  }
  const [flow, reads] = await Promise.allSettled([cancel(), read()]);
  const failed = order === "cancelFirst" ? [flow, reads] : [reads, flow];
  for (const outcome of failed) if (outcome.status === "rejected") throw outcome.reason;
  return (reads as PromiseFulfilledResult<T>).value;
}
