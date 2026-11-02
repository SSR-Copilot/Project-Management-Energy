/**
 * Test helper: a console line without the request log's `[VSB] ACTION ` prefix (D72, D78), so a
 * test can match the save logs' own wording ("Add Cost from Table save: …", "CAPEX panel …").
 * The prefix itself is pinned in `data/saveLog.test.ts` (UT-SAVELOG-020…023); other prefixes
 * (`[VSB] DATA`, `HTTP`, `ERROR`) are left in place, so those lines never match a save-log filter.
 */
export const logText = (line: unknown): string => String(line).replace(/^\[VSB\] ACTION /, "");
