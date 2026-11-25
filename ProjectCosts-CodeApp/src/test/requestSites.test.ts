import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * G-REQ (dvopt T-13, doc 15 section 5, doc 21 section 5): the number of DIRECT request sites must never grow.
 *
 * The shared request core (`data/requestPolicy.ts`: retry policy, deadline, global gate) can only see requests that go through
 * it. A call made straight on a generated service (`XxxService.getAll(` / `get(` / `create(` / `update(` / `delete(`) or on the
 * SDK client (`retrieveMultipleRecordsAsync`, `retrieveRecordAsync`, `createRecordAsync`, `updateRecordAsync`,
 * `deleteRecordAsync`, `executeAsync`) bypasses it. This test counts those sites per source file and compares the count with
 * BASELINE below: a file may not have MORE than its baseline, and a file that is not listed may have none.
 *
 * LOWERING the baseline (a site moved onto the shared helpers): run
 *   npx vitest run src/test/requestSites.test.ts
 * UT-GREQ-003 then fails and prints the current `file: count` lines; paste them into BASELINE_TEXT (or decrement / remove the entry by hand). RAISING it needs a reason in review: add the site to the shared helpers instead.
 *
 * NOTE (dvopt programme): other agents edit data modules at the same time and only ever LOWER counts. The orchestrator regenerates
 * BASELINE at integration; until then UT-GREQ-003 (the baseline has no stale, too-high entry) may fail on a branch that moved sites
 * onto the helpers, which is expected. UT-GREQ-001 and UT-GREQ-002 (no growth) must always pass.
 *
 * Counts: comments and the text inside string literals are ignored; test files, `src/test/` and `src/generated/` are not scanned.
 */
const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");

const SERVICE_CALL = /\b[A-Za-z0-9_]*Service\.(?:getAll|get|create|update|delete)\s*\(/g;
const SDK_CALL = /\b(?:retrieveMultipleRecordsAsync|retrieveRecordAsync|createRecordAsync|updateRecordAsync|deleteRecordAsync|executeAsync)\b\s*(?:<|\()/g;

/** The allow-list: `file: count` of direct request sites in the tree at commit 30afece (generated from it, sorted). */
// dvopt integration (25 Nov 2026): raised by 11 REVIEWED sites in 8 files (existence-guard reads, the one-read O&M guard, the by-name environment-variable read, the stable-id create, a retry-wrapped guarded update); costUpdateGuard.ts is new. Each is a deliberate read or write, not a stray direct call.
const BASELINE_TEXT = `
data/addCostSheet.ts: 7
data/adminCapexAccounts.ts: 10
data/adminChecklistTables.ts: 4
data/adminContract.ts: 5
data/adminCost.ts: 13
data/adminGatesApprovals.ts: 11
data/adminMilestones.ts: 1
data/adminRowWrites.ts: 3
data/bulkSend.ts: 5
data/capexChart.ts: 1
data/capexWrites.ts: 6
data/checklist.ts: 12
data/client.ts: 6
data/comments.ts: 3
data/contracts.ts: 11
data/costBook.ts: 11
data/costUpdateGuard.ts: 1
data/countries.ts: 1
data/countryInflation.ts: 1
data/currencies.ts: 1
data/currentUser.ts: 6
data/executePlan.ts: 4
data/finance.ts: 12
data/generalData.ts: 10
data/generators.ts: 34
data/gridOperator.ts: 1
data/landLease.ts: 15
data/milestones.ts: 10
data/opexCatalog.ts: 7
data/periodWrites.ts: 13
data/planning.ts: 6
data/production.ts: 11
data/project.ts: 9
data/projects.ts: 7
data/revenues.ts: 9
data/standardContracts.ts: 2
data/team.ts: 3
data/verifyGone.ts: 1
`;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "generated" || name === "test" ? [] : sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) && !/\.d\.ts$/.test(name) ? [path] : [];
  });
}

/** The code of a file without block comments, line comments and the text inside string literals on one line. */
function codeOnly(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .map((line) => line.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/g, '""').replace(/\/\/.*$/, ""))
    .join("\n");
}

function countSites(code: string): number {
  return (code.match(SERVICE_CALL)?.length ?? 0) + (code.match(SDK_CALL)?.length ?? 0);
}

function currentCounts(): Map<string, number> {
  const counts = new Map<string, number>();
  for (const file of sourceFiles(SRC)) {
    const n = countSites(codeOnly(readFileSync(file, "utf8")));
    if (n > 0) counts.set(relative(SRC, file).replace(/\\/g, "/"), n);
  }
  return counts;
}

function baseline(): Map<string, number> {
  const out = new Map<string, number>();
  for (const line of BASELINE_TEXT.split("\n")) {
    const m = /^(\S+): (\d+)$/.exec(line.trim());
    if (m) out.set(m[1] as string, Number(m[2]));
  }
  return out;
}

const HOW_TO = "Route the call through the shared helpers (data/client.ts, data/executePlan.ts, data/requestPolicy.ts) instead of adding a direct site. "
  + "If a site was REMOVED, lower its entry in BASELINE_TEXT (see the header of src/test/requestSites.test.ts).";

describe("G-REQ: direct request sites never grow (UT-GREQ)", () => {
  it("UT-GREQ-001 no file has more direct request sites than its baseline", () => {
    const base = baseline();
    const over: string[] = [];
    for (const [file, n] of currentCounts()) {
      const allowed = base.get(file) ?? 0;
      if (n > allowed) over.push(`${file}: ${n} direct request sites, baseline ${allowed}`);
    }
    expect(over, `${HOW_TO}\n${over.join("\n")}`).toEqual([]);
  });

  it("UT-GREQ-002 a file that is not in the baseline has none (a new file cannot add a direct site)", () => {
    const base = baseline();
    const added = [...currentCounts()].filter(([file]) => !base.has(file)).map(([file, n]) => `${file}: ${n}`);
    expect(added, `${HOW_TO}\n${added.join("\n")}`).toEqual([]);
  });

  it("UT-GREQ-003 the baseline has no stale entry: every listed file still has that many sites (lower it when sites move)", () => {
    const now = currentCounts();
    const stale = [...baseline()].filter(([file, n]) => (now.get(file) ?? 0) < n).map(([file, n]) => `${file}: baseline ${n}, now ${now.get(file) ?? 0}`);
    const fresh = [...now].sort(([a], [b]) => (a < b ? -1 : 1)).map(([file, n]) => `${file}: ${n}`).join("\n");
    expect(stale, `${HOW_TO}\nCurrent counts:\n${fresh}`).toEqual([]);
  });

  it("UT-GREQ-004 the counter sees what it must: a generated-service call and an SDK-client call, not a comment or a string", () => {
    expect(countSites(codeOnly("const r = await Vsb_projectsService.getAll({ $select: 'a' });"))).toBe(1);
    expect(countSites(codeOnly("await Vsb_projectsService.delete(id); await Vsb_projectsService.create(x);"))).toBe(2);
    expect(countSites(codeOnly("await client.retrieveMultipleRecordsAsync<T>(es, o); await c.executeAsync(op);"))).toBe(2);
    expect(countSites(codeOnly("// Vsb_projectsService.getAll(x)\n/* c.updateRecordAsync(a) */\nconst s = 'FooService.get(1)';"))).toBe(0);
    // A bulk action service is the shared transport's business, not a single-row site.
    expect(countSites(codeOnly("await CreateMultipleService.CreateMultiple(es, rows);"))).toBe(0);
  });

  it("UT-GREQ-005 the scan covers the tree (a sanity floor, so an empty scan cannot pass for 'no sites')", () => {
    expect(sourceFiles(SRC).length).toBeGreaterThan(200);
    expect(currentCounts().size).toBeGreaterThan(5);
  });
});
