/**
 * The `sweep` Playwright project (D80): deletes the rows an earlier run left on DEV, for the screen of `PARITY_SCREEN`.
 *
 *   npm run parity:sweep            with PARITY_SCREEN=<slug> and PARITY_SWEEP_TAG=PW-<runId>[...]
 *
 * Why it exists: a write lane's cleanup reads and deletes through the code app's own modules. When that cleanup itself fails
 * (live run 1, 3 Nov 2026: the reads ran in the player's outer page), the run's `PW-` rows stay on DEV and show up in the
 * next run's read project. This removes them by tag (`contains`, as the write lanes' cleanup: a header Name is `<project>-<sub-account>-<tag>`) across the manifest's tables, children first, through the app's
 * `deleteRecord` (`data.ts` readByTag + deleteRows), then reads again: the test fails while anything is left.
 *
 * Only a `PW-` tag is accepted (`data.ts` assertTag), so it can never select real data. It logs counts per table, never
 * values. It writes to DEV, so it runs only with `PARITY_WRITE=1`, like the write lanes. `PARITY_SWEEP_DRY=1` reads only:
 * it prints the count per table and the tagged names it would delete, and deletes nothing (check the scope first).
 */
import { test, expect } from "@playwright/test";
import { assertTag, deleteRows, readByTag, rowCount } from "./data";
import { loadManifest, selectedScreen } from "./screens";
import { newLaneContext } from "./session";
import { openCode } from "../lib/parity";

test("sweep: delete the PW- rows of an earlier run (PARITY_SWEEP_TAG)", async ({ browser }) => {
  test.setTimeout(15 * 60_000);
  const tag = process.env.PARITY_SWEEP_TAG?.trim() ?? "";
  const dryRun = process.env.PARITY_SWEEP_DRY?.trim() === "1";
  test.skip(!tag, "PARITY_SWEEP_TAG is not set (e.g. PW-20261103-2133)");
  test.skip(!dryRun && process.env.PARITY_WRITE?.trim() !== "1", 'PARITY_WRITE is not "1": the sweep deletes DEV rows (PARITY_SWEEP_DRY=1 only lists them)');
  assertTag(tag);
  const manifest = await loadManifest(selectedScreen());
  const context = await newLaneContext("code", browser);
  try {
    const page = await context.newPage();
    await openCode(page);
    const found = await readByTag(page, manifest.tables, tag);
    const counts = Object.entries(found).map(([t, r]) => `${t} ${r.length}`).join(", ");
    console.log(`[parity] sweep ${manifest.slug} *${tag}*: ${rowCount(found)} row(s) (${counts})`);
    if (dryRun) {
      // Only the run tag inside each root row's tag column (a Name also holds the project and sub-account: business data).
      for (const t of manifest.tables.filter((x) => x.tagColumn)) {
        for (const r of found[t.name] ?? []) console.log(`[parity]   ${t.name}: ${/PW-[A-Za-z0-9-]+/.exec(String(r[t.tagColumn!]))?.[0] ?? "?"}`);
      }
      return;
    }
    const failed = rowCount(found) ? await deleteRows(page, manifest.tables, found) : [];
    const left = rowCount(await readByTag(page, manifest.tables, tag));
    console.log(`[parity] sweep ${manifest.slug} *${tag}*: ${left} row(s) left`);
    expect(failed, "rows the sweep could not delete").toEqual([]);
    expect(left, `rows tagged *${tag}* left on DEV`).toBe(0);
  } finally {
    await context.close().catch(() => {});
  }
});
