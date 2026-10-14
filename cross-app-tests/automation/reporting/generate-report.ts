/**
 * Builds reporting/REGRESSION-REPORT.md from reporting/results/*.json against
 * reporting/baseline/*.json. See TEST-STRATEGY.md §14.
 *
 *   npm run report
 */
import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = join(HERE, "results");
const BASELINE_DIR = join(HERE, "baseline");
const TEST_CASES_DIR = join(HERE, "..", "..", "test-cases");
const SPECS_DIR = join(HERE, "..", "specs");
const REPORT_PATH = join(HERE, "REGRESSION-REPORT.md");

interface TestResult {
  id: string;
  ranAt: string;
  status: "pass" | "fail";
  canvasValue?: string;
  codeAppValue?: string;
  diff?: string | null;
}

function readJsonFiles(dir: string): TestResult[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as TestResult);
}

/** Every TC-<PREFIX>-NNN id referenced anywhere under test-cases/ (by filename). */
function allDocumentedCaseIds(): string[] {
  const ids: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else {
        const match = entry.name.match(/^(TC-[A-Z]+-\d+)/);
        if (match) ids.push(match[1]!);
      }
    }
  };
  if (existsSync(TEST_CASES_DIR)) walk(TEST_CASES_DIR);
  return ids;
}

/** Every TC-<PREFIX>-NNN id cited anywhere inside specs/**\/*.spec.ts. */
function allCitedCaseIds(): Set<string> {
  const cited = new Set<string>();
  const walk = (dir: string) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".spec.ts")) {
        const text = readFileSync(full, "utf8");
        for (const match of text.matchAll(/TC-[A-Z]+-\d+/g)) cited.add(match[0]);
      }
    }
  };
  walk(SPECS_DIR);
  return cited;
}

function main(): void {
  const results = readJsonFiles(RESULTS_DIR);
  const baselines = new Map(readJsonFiles(BASELINE_DIR).map((b) => [b.id, b]));
  const documentedIds = allDocumentedCaseIds();
  const citedIds = allCitedCaseIds();

  const lines: string[] = [];
  lines.push("# Regression report");
  lines.push("");
  lines.push(`Generated ${new Date().toISOString()}`);
  lines.push("");

  const passed = results.filter((r) => r.status === "pass").length;
  const failed = results.filter((r) => r.status === "fail").length;
  lines.push("## Summary");
  lines.push("");
  lines.push(`| Total | Passed | Failed |`);
  lines.push(`|---:|---:|---:|`);
  lines.push(`| ${results.length} | ${passed} | ${failed} |`);
  lines.push("");

  lines.push("## Failures");
  lines.push("");
  const failures = results.filter((r) => r.status === "fail");
  if (failures.length === 0) {
    lines.push("None.");
  } else {
    lines.push("| Test | Canvas value | Code-app value |");
    lines.push("|---|---|---|");
    for (const f of failures) {
      lines.push(`| ${f.id} | ${f.canvasValue ?? "—"} | ${f.codeAppValue ?? "—"} |`);
    }
  }
  lines.push("");

  lines.push("## Drift from baseline (passing, but changed since last approved run)");
  lines.push("");
  const drifted = results.filter((r) => {
    const base = baselines.get(r.id);
    return r.status === "pass" && base && JSON.stringify(base) !== JSON.stringify(r);
  });
  if (drifted.length === 0) {
    lines.push("None.");
  } else {
    for (const d of drifted) lines.push(`- ${d.id} — passed, but result differs from its baseline.`);
  }
  lines.push("");

  lines.push("## Coverage gaps (test case has no implementing spec)");
  lines.push("");
  const uncited = documentedIds.filter((id) => !citedIds.has(id));
  lines.push(uncited.length === 0 ? "None." : uncited.map((id) => `- ${id}`).join("\n"));
  lines.push("");

  lines.push("## Dangling citations (spec cites an id not found under test-cases/)");
  lines.push("");
  const dangling = [...citedIds].filter((id) => !documentedIds.includes(id));
  lines.push(dangling.length === 0 ? "None." : dangling.map((id) => `- ${id}`).join("\n"));
  lines.push("");

  writeFileSync(REPORT_PATH, lines.join("\n"));
  console.log(`Wrote ${REPORT_PATH}`);
}

main();
