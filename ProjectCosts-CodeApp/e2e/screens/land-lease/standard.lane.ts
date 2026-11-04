/**
 * Land Lease screen lane: the standard-contract import, E2E-LANDLEASE-070 (rule map F8, B4). WRITES TO DEV.
 *
 * Why not a manifest flow: "Add Standard Contract" names its contracts after the country's standard assumptions, so the
 * rows carry no run tag and the generic flows lane (rows read back by tag) cannot find them. And the canvas offers the
 * import only while the card holds no standard contract, so the two apps must import one AFTER the other when they share
 * a project. Rows are found NARROWLY instead: headers of the write project created since this test began (less a clock
 * margin), flagged `vsb_isstandardcontract`, with their periods and allocations; only those are deleted.
 *
 *   full mode     ONE test on the Canvas flows lane (default write-canvas, `laneFor(manifest, "flows", "canvas")`): the
 *                 Canvas import, its rows read and deleted, then, ONLY when nothing of it is left (the old spec's
 *                 `expect(left).toEqual([])`: a clear failure before the code app imports), the code app's import in a
 *                 code-app page of its own, read and deleted. Facts `flows/standard.import` for each app (row-shaped,
 *                 compared by `compare.ts` as `flows.standard.import["<table>"]...`).
 *   compare mode  the Canvas side is the cached reference, so the code app's flows lane (default write-code) imports in the
 *                 code app alone.
 * Runs only with PARITY_WRITE=1 in the full tier (`common.ts` writeSkip, the generic flows lane's rule). Every standard row
 * of the write projects created during the test is deleted at the end, whatever happened.
 */
import type { Page } from "@playwright/test";
import type { AppHandle, Kind, RunEnv } from "../../harness/contract";
import { rowCount, rowsWithoutBu } from "../../harness/data";
import { requireProjectId } from "../../harness/env";
import { errorText, kindSkip, laneCase, laneDescribe, writeSkip } from "../../harness/lanes/common";
import { openScreenReady } from "../../harness/openers";
import { laneFor } from "../../harness/screens";
import { expect, newLaneContext } from "../../harness/session";
import { writeFact } from "../../harness/store";
import { settle } from "../../harness/waits";
import {
  deleteImport, importedSince, importStandard, manifest, normaliseImport, settledImport, STANDARD_MARGIN_MS,
} from "./manifest";

const KEY = "standard.import";
const CANVAS_LANE = laneFor(manifest, "flows", "canvas");
const CODE_LANE = laneFor(manifest, "flows", "code");

const since = (): string => new Date(Date.now() - STANDARD_MARGIN_MS).toISOString();

/** One app's import result: the headers it imported, Owning Business Unit problems, and the rows its delete could NOT remove. */
interface ImportResult { headers: number; bu: string[]; left: string[] }

/** One app's import on `app` (already on the screen), its rows read back on `reader`, recorded, then deleted. */
async function importOne(kind: Kind, app: Pick<AppHandle, "kind" | "page" | "frame">, reader: Page, env: RunEnv, projectId: string): Promise<ImportResult> {
  const from = since();
  await importStandard(app);
  const rows = await settledImport(reader, projectId, from);
  writeFact(env, kind, "flows", KEY, normaliseImport(rows));
  // Deleted before the other app runs: the import is offered only while the card holds no standard contract.
  const left = await deleteImport(reader, rows);
  return { headers: (rows.costs ?? []).length, bu: rowsWithoutBu(rows).map((m) => `${kind}: ${m}`), left: left.map((l) => `${kind}: could not delete ${l}`) };
}

/** Deletes every standard row of `projectIds` created since `from`; what could not be deleted. */
async function cleanup(reader: Page, projectIds: string[], from: string): Promise<string[]> {
  const left: string[] = [];
  for (const id of new Set(projectIds)) {
    try { left.push(...await deleteImport(reader, await importedSince(reader, id, from))); } catch (e) { left.push(`read for cleanup: ${errorText(e)}`); }
  }
  return left;
}

laneDescribe(manifest, "standard import (070)", "canvas", () => {
  const c = laneCase("canvas", `flows: standard-import, the Canvas then the code app @${CANVAS_LANE}`, kindSkip("canvas") ?? writeSkip());
  c.declare(...c.args, c.body(async ({ app, env, browser }) => {
    const canvasProject = requireProjectId(env, manifest, "write", "canvas")!;
    const codeProject = requireProjectId(env, manifest, "write", "code")!;
    const start = since();
    const ctx = await newLaneContext("code", browser);
    const problems: string[] = [];
    try {
      const page = await ctx.newPage();
      const reader = { kind: "code" as const, page, frame: await openScreenReady("code", page, manifest, codeProject) };
      await settle(reader, { timeoutMs: 60_000 });
      for (const id of new Set([canvasProject, codeProject])) {
        expect((await importedSince(page, id, start)).costs?.length ?? 0, "no standard contract created in the minutes before the test").toBe(0);
      }
      await app.reset();
      const canvas = await importOne("canvas", app, page, env, canvasProject);
      problems.push(...canvas.bu);
      // The old spec stopped here when the Canvas's rows could not all be deleted: the code app's import would then find a
      // standard contract on the card (shared project) and the two apps would not be compared on the same start.
      expect(canvas.left, "the Canvas's imported rows could all be deleted before the code app imports").toEqual([]);
      expect(rowCount(await importedSince(page, canvasProject, start)), "the Canvas's imported rows left before the code app imports").toBe(0);
      // The code page was opened before the Canvas import: open the screen again so it reads the card as it is now.
      reader.frame = await openScreenReady("code", page, manifest, codeProject);
      await settle(reader, { timeoutMs: 60_000 });
      const code = await importOne("code", reader, page, env, codeProject);
      problems.push(...code.bu, ...code.left);
      expect(canvas.headers, "the canvas imported at least one standard contract").toBeGreaterThan(0);
    } finally {
      const page = ctx.pages()[0];
      if (page) problems.push(...(await cleanup(page, [canvasProject, codeProject], start)).map((l) => `cleanup: ${l}`));
      await ctx.close().catch(() => {});
      await app.reload().catch(() => {});
    }
    expect(problems, "Owning Business Unit, delete and cleanup problems").toEqual([]);
  }));
});

laneDescribe(manifest, "standard import (070)", "code", () => {
  const fullMode = process.env.PARITY_MODE?.trim() !== "compare"
    ? "full mode: the Canvas flows lane imports in both apps in turn (the import is offered only while the card holds no standard contract)"
    : null;
  const c = laneCase("code", `flows: standard-import, the code app alone (compare mode) @${CODE_LANE}`, fullMode ?? writeSkip());
  c.declare(...c.args, c.body(async ({ app, env }) => {
    const project = requireProjectId(env, manifest, "write", "code")!;
    const start = since();
    const problems: string[] = [];
    try {
      expect((await importedSince(app.page, project, start)).costs?.length ?? 0, "no standard contract created in the minutes before the test").toBe(0);
      await app.reset();
      const code = await importOne("code", app, app.page, env, project);
      problems.push(...code.bu, ...code.left);
      expect(code.headers, "the code app imported at least one standard contract").toBeGreaterThan(0);
    } finally {
      problems.push(...(await cleanup(app.page, [project], start)).map((l) => `cleanup: ${l}`));
      await app.reload().catch(() => {});
    }
    expect(problems, "Owning Business Unit, delete and cleanup problems").toEqual([]);
  }));
});
