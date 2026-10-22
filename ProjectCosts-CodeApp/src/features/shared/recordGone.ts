/**
 * Upsert guard: how the project / cost screens word a `RecordGoneError`.
 *
 * Single-row updates go through `updateRecordIfExists` (`@/data/client`), which refuses to PATCH
 * a row another user deleted (the SDK 1.3.1's If-Match-less PATCH would silently recreate it) and throws
 * `RecordGoneError` instead. The screens below used to print a write error's raw `.message`; for
 * this case that is SDK-shaped text ("update X failed: vsb_x row … no longer exists"), so they
 * route it through `writeErrorText`, which gives the plain "deleted by someone else — refresh"
 * sentence and leaves every other error's text exactly as it was.
 *
 * `RECORD_GONE_TEXT` and `isRecordGone` live in `@/platform/errors` (the data layer's
 * `usePlanWrite` needs them and `data` must not import `features`); they are re-exported here so
 * every existing import keeps working.
 */
import { isRecordGone, RECORD_GONE_TEXT } from "@/platform/errors";

export { isRecordGone, RECORD_GONE_TEXT };

/** A write error's on-screen text: the "deleted by someone else" sentence, else its own message. */
export function writeErrorText(error: unknown): string {
  if (isRecordGone(error)) return RECORD_GONE_TEXT;
  return error instanceof Error ? error.message : String(error);
}
