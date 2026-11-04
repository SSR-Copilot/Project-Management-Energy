/**
 * Land Lease report hook: the rule-map check of the old Canvas validation test (`landlease.validation.parity.spec.ts`,
 * `landlease.validation.rulemap-corrections.txt`), now over the run's recorded Canvas facts. Coverage map gap G3.
 *
 * It runs in the `report` project (phase 3), which picks up `e2e/screens/<PARITY_SCREEN>/*.report.ts` beside the generic
 * `report.run.ts`: by then every validation lane has finished, whatever worker it ran on. No browser.
 *
 *   Canvas facts  full mode: this run's `validation/<group>`; compare mode: the cached reference's
 *   output        `<runDir>/rulemap-corrections.txt` (one line per input where the Canvas disagrees with the hand-derived
 *                 rule map) and a count on the console
 *
 * Like the old test, it reports and never fails on a correction: the rule map is a document, not the app. It fails only
 * when the facts cannot be read. Note: the generic reader looks for 4 more messages than the old one (coverage map,
 * section 2), so a "none" row can now list one of those as a correction where the old file did not.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "@playwright/test";
import type { ValidationOutcome } from "../../harness/contract";
import { runEnv } from "../../harness/env";
import { readFacts, referenceDir } from "../../harness/store";
import { ruleMapCorrections } from "./manifest";

test("report: Land Lease rule-map corrections from the Canvas validation facts", () => {
  const env = runEnv();
  const dir = env.mode === "full" ? env.runDir : referenceDir(env.screen);
  const facts = readFacts(dir, "canvas", "validation");
  const canvas: Record<string, Record<string, ValidationOutcome>> = {};
  for (const f of facts) canvas[f.key] = f.data as Record<string, ValidationOutcome>;
  const lines = ruleMapCorrections(canvas);
  mkdirSync(env.runDir, { recursive: true });
  const out = join(env.runDir, "rulemap-corrections.txt");
  writeFileSync(out, lines.length ? `${lines.join("\n")}\n` : "", "utf8");
  console.log(`[parity] land-lease rule map: ${facts.length} Canvas validation group(s) read; rule-map rows to correct: ${lines.length} (${out})`);
});
