/**
 * Writes one test's outcome to reporting/results/<id>.json, in the shape TEST-STRATEGY.md
 * §14 documents. Call this from a parity spec's test body, not from outside a test — it's
 * meant to run once per test execution, with that test's own values.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RESULTS_DIR = join(dirname(fileURLToPath(import.meta.url)), "results");

export interface TestResultInput {
  id: string;
  status: "pass" | "fail";
  canvasValue?: string;
  codeAppValue?: string;
  diff?: string | null;
}

export function recordResult(input: TestResultInput): void {
  mkdirSync(RESULTS_DIR, { recursive: true });
  const payload = { ...input, ranAt: new Date().toISOString() };
  writeFileSync(join(RESULTS_DIR, `${input.id}.json`), JSON.stringify(payload, null, 2));
}
