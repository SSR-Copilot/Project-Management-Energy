/**
 * Promotes reporting/results/<id>.json to reporting/baseline/<id>.json — NEVER automatic.
 * TEST-STRATEGY.md §11.3: "a baseline is a ticket, not an answer." This script exists so
 * promotion is a deliberate, confirmed act, not a side effect of a green run.
 *
 *   npm run promote-baseline -- TC-CAPEX-001
 *   npm run promote-baseline -- --all     (prompts once per case)
 */
import { copyFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as readline from "node:readline/promises";

const HERE = dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = join(HERE, "..", "reporting", "results");
const BASELINE_DIR = join(HERE, "..", "reporting", "baseline");

async function confirm(prompt: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`${prompt} [y/N] `);
  rl.close();
  return answer.trim().toLowerCase() === "y";
}

async function promoteOne(id: string): Promise<void> {
  const resultPath = join(RESULTS_DIR, `${id}.json`);
  if (!existsSync(resultPath)) {
    console.error(`No result found for ${id} at ${resultPath} — run the suite first.`);
    return;
  }
  const ok = await confirm(
    `Promote ${id}'s latest result to baseline? This records it as human-confirmed correct.`,
  );
  if (!ok) {
    console.log(`Skipped ${id}.`);
    return;
  }
  copyFileSync(resultPath, join(BASELINE_DIR, `${id}.json`));
  console.log(`Promoted ${id}.`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args[0] === "--all") {
    if (!existsSync(RESULTS_DIR)) {
      console.error("No results directory — run the suite first.");
      return;
    }
    const ids = readdirSync(RESULTS_DIR)
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/, ""));
    for (const id of ids) await promoteOne(id);
    return;
  }
  const id = args[0];
  if (!id) {
    console.error("Usage: npm run promote-baseline -- <TC-ID> | --all");
    process.exitCode = 1;
    return;
  }
  await promoteOne(id);
}

main();
