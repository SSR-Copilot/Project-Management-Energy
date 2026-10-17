/**
 * V-1 (shared, `09-upsert-risk.md`): how the project / cost screens word a `RecordGoneError`.
 *
 * Single-row updates go through `updateRecordIfExists` (`@/data/client`), which refuses to PATCH
 * a row another user deleted (the SDK 1.3.1's If-Match-less PATCH would silently recreate it) and throws
 * `RecordGoneError` instead. The screens below used to print a write error's raw `.message`; for
 * this case that is SDK-shaped text ("update X failed: vsb_x row … no longer exists"), so they
 * route it through `writeErrorText`, which gives the plain "deleted by someone else — refresh"
 * sentence and leaves every other error's text exactly as it was.
 */
import { RecordGoneError } from "@/platform/errors";

export const RECORD_GONE_TEXT =
  "This record was deleted by someone else, so your change was not saved. Refresh the screen and try again.";

/** True when `error`, or anything in its `cause` chain (depth 4), is a `RecordGoneError`. */
export function isRecordGone(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    if (current instanceof RecordGoneError) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/** A write error's on-screen text: the "deleted by someone else" sentence, else its own message. */
export function writeErrorText(error: unknown): string {
  if (isRecordGone(error)) return RECORD_GONE_TEXT;
  return error instanceof Error ? error.message : String(error);
}
