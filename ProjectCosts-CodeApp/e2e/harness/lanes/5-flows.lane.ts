/**
 * Generic lane, flows / data layers (D80): every `manifest.flows` flow of `PARITY_SCREEN`, written through each app's UI
 * on its WRITE project, the rows read back by run tag after every step.
 *
 * WRITES TO DEV: runs only with `PARITY_WRITE=1` (else every flow is skipped with that reason, `common.ts` writeSkip) and only
 * in the full tier. Per app, one serial describe on the write lane (default write-canvas / write-code); one test per flow:
 *   timeout  `flow.timeoutMin` (default 30 min, `screens.ts` flowTimeoutMs)
 *   tag      `PW-<runId>-<cv|ca>-<flow>` (`data.ts` runTag): the flow writes it into the tables' tag columns
 *   steps    reset to rest, then each step: run (with `ctx`: `record` for extra facts, `rows(tag)` for a raw read), settle,
 *            read the tagged rows once they stop changing (`settledByTag`), then
 *              - Owning Business Unit, ABSOLUTE: every settled row of every table (header, periods, allocations, ...) must have
 *                `_owningbusinessunit_value` (`data.ts` rowsWithoutBu; CONVENTIONS rule 4), in each app, at every step
 *                (a delete step's remaining rows too). A miss is a soft failure: the flow goes on, the test fails at the end
 *              - normalise them (`normaliseTables`: ids, stamps and the tag masked, rows in `sortKey` order) and record the
 *                flow so far as `flows/<flow>` = { <step>: { <table>: rows } } (the shape `compare.ts` keys by step name)
 *   cleanup  in `afterEach`, so it runs also when the test body TIMED OUT (Playwright gives after-hooks a fresh slot; the hook
 *            sets its own `FLOW_CLEANUP_TIMEOUT_MS`): `flow.cleanup`, then `deleteByTag` (children first, through the app's
 *            `deleteRecord`), then a read must find nothing tagged left; the screen is reloaded afterwards. Exactly once per
 *            test: the body registers the flow, the hook takes it. A timed-out body still running in the background stops at
 *            its next step (it checks that the flow is still registered).
 * The rows are read through the code app's own modules, so the Canvas lane opens one code-app page of its own for that
 * (the project list: no project needed), in the code app's saved session.
 */
import type { Page } from "@playwright/test";
import type { AppHandle, Flow, FlowContext, Kind } from "../contract";
import { expect, laneTest, newLaneContext } from "../session";
import { deleteByTag, normaliseTables, readByTag, rowCount, rowsWithoutBu, runTag, settledByTag, type TableRows } from "../data";
import { openCode } from "../../lib/parity";
import { FLOW_CLEANUP_TIMEOUT_MS, flowTimeoutMs, laneFor } from "../screens";
import { settle } from "../waits";
import { collectManifest, errorText, KINDS, kindSkip, laneCase, laneDescribe, writeSkip, type LaneFixtures } from "./common";

const manifest = await collectManifest();

/** The page whose code-app frame reads the rows: the lane's own page in the code app; one extra page on the Canvas lane. */
let reader: { close: () => Promise<void>; page: Page } | null = null;
async function readerPage(fx: Pick<LaneFixtures, "kind" | "app" | "browser">): Promise<Page> {
  if (fx.kind === "code") return fx.app.page;
  if (!reader) {
    const ctx = await newLaneContext("code", fx.browser);
    const page = await ctx.newPage();
    await openCode(page);
    reader = { page, close: () => ctx.close() };
  }
  return reader.page;
}

/** The flow a test body is running, per app, until its `afterEach` cleans it up (see the header). */
interface Pending { flow: Flow; tag: string; app: AppHandle; rows: Page }
const pending = new Map<Kind, Pending>();

/** The cleanup of one flow (see the header). Problems and the rows left are asserted by the caller. */
async function cleanUp(p: Pending): Promise<{ problems: string[]; left: number }> {
  const problems: string[] = [];
  let left = -1;
  try { await p.flow.cleanup(p.app, p.tag); } catch (e) { problems.push(`flow.cleanup: ${errorText(e)}`); }
  try { problems.push(...await deleteByTag(p.rows, manifest.tables, p.tag)); } catch (e) { problems.push(`deleteByTag: ${errorText(e)}`); }
  try { left = rowCount(await readByTag(p.rows, manifest.tables, p.tag)); } catch (e) { problems.push(`read after cleanup: ${errorText(e)}`); }
  if (problems.length || left !== 0) {
    laneTest.info().annotations.push({ type: "cleanup", description: `${p.tag}: ${left} row(s) left; ${problems.join("; ") || "no errors"}` });
    console.error(`[harness] cleanup of ${p.tag}: ${left} row(s) left; ${problems.join("; ")}`);
  }
  await p.app.reload().catch((e) => problems.push(`reload after cleanup: ${errorText(e)}`));
  return { problems, left };
}

for (const kind of KINDS) {
  if (!manifest.flows.length) continue;
  const lane = laneFor(manifest, "flows", kind);
  laneDescribe(manifest, "flows", kind, () => {
    laneTest.afterEach(async () => {
      const p = pending.get(kind);
      if (!p) return; // skipped, or a test of the other app
      pending.delete(kind);
      laneTest.setTimeout(FLOW_CLEANUP_TIMEOUT_MS);
      const { problems, left } = await cleanUp(p);
      expect(problems, `cleanup of ${p.tag}`).toEqual([]);
      expect(left, `rows of ${p.tag} left on DEV`).toBe(0);
    });
    laneTest.afterAll(async () => { await reader?.close().catch(() => {}); reader = null; });

    for (const flow of manifest.flows) {
      const c = laneCase(kind, `flows: ${flow.name} @${lane}`, kindSkip(kind) ?? writeSkip());
      c.declare(...c.args, c.body(async (fx) => {
        laneTest.setTimeout(flowTimeoutMs(flow));
        const { app, record, env } = fx;
        const tag = runTag(env.runId, kind, flow.name);
        const rows = await readerPage(fx);
        const mine: Pending = { flow, tag, app, rows };
        pending.set(kind, mine);
        const ctx: FlowContext = {
          record: (layer, key, data) => { record(layer, key, data); },
          rows: (t) => readByTag(rows, manifest.tables, t),
        };
        const facts: Record<string, TableRows> = {};
        await app.reset();
        for (const step of flow.steps) {
          // A timed-out body keeps running in the background; once the cleanup took the flow, it must not act any more.
          if (pending.get(kind) !== mine) throw new Error(`flow ${flow.name} was cleaned up (the test timed out); step ${step.name} not run`);
          await step.run(app, tag, ctx);
          await settle(app);
          const settled = await settledByTag(rows, manifest.tables, tag);
          expect.soft(rowsWithoutBu(settled), `${kind} ${flow.name}.${step.name}: settled rows without an Owning Business Unit`).toEqual([]);
          facts[step.name] = normaliseTables(settled, manifest.tables, tag);
          record("flows", flow.name, facts);
        }
      }));
    }
  });
}
