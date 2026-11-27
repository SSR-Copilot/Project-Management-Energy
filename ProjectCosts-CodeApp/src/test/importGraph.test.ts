import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * G-IMPORT (bottleneck programme T-E03, finding BND-18; doc 18, `_stage2/E-rca-and-strategy.md` section 4.1): the import graph of
 * `src/data` must not grow edges into `src/features`, and the small "light" modules the first wave split out must stay light.
 *
 * Why: `features/**` is not marked side-effect free (`vite.config.ts`), and a bundler cannot split inside a module. So when a data
 * module imports a feature's `rules.ts` for one constant or one helper, every screen that loads that data module downloads the whole
 * `rules.ts` (measured: 15-60 KiB gzip per first screen before BND-03/04/06/07 were fixed). The fix is to import the pure helper from
 * the module that owns it, not through a heavy one; this test keeps it that way.
 *
 * What is compared:
 *  - UT-IMPGRAPH-001: every VALUE import from `src/data/**` into `src/features/**` is in ALLOWED_EDGES, and every entry is still real.
 *    Type-only imports (`import type`, or a list whose specifiers are all `type X`) are erased by the compiler and are not edges.
 *    Dynamic `import()` is a lazy chunk, not a static edge, and is not counted.
 *  - UT-IMPGRAPH-002..006: a light module does not reach a heavy one through any chain of STATIC value imports.
 *
 * ADDING an edge to ALLOWED_EDGES needs a reason in review: move the helper to a small module (see `data/bulkTables.ts`,
 * `data/projectStatesRead.ts`, `data/revenueLookups.ts`, `data/milestoneDurations.ts`, `features/pm/general-data/projectColumns.ts`)
 * instead. REMOVING an edge (you fixed one): UT-IMPGRAPH-001 then fails and prints the current list; delete the line.
 *
 * Test files, `src/test/` and `src/generated/` are not scanned. The scan is textual (comments removed, no TypeScript parser), as
 * `requestSites.test.ts` (G-REQ) is.
 */
const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");

/** The allow-list: `importer -> imported module` (paths relative to `src/`, no extension) of every value import from data into features. */
const ALLOWED_EDGES_TEXT = `
data/addCostSheet -> features/cost/add-costs-from-table/rules
data/addCostSheet -> features/cost/add-costs-from-table/savePlan
data/addCostSheet -> features/cost/capex-costs/rules
data/addCostSheet -> features/cost/costing/saveTimeline
data/addCostSheetBulk -> features/cost/add-costs-from-table/rules
data/capexWrites -> features/cost/capex-costs/distribution
data/capexWrites -> features/cost/capex-costs/rules
data/capexWrites -> features/cost/capex-costs/savePlan
data/capexWrites -> features/cost/capex-costs/writeSet
data/checklist -> features/pm/checklist/rules
data/checklist -> features/pm/general-data/projectColumns
data/comments -> features/cost/capex-costs/comments
data/contracts -> features/cost/contracts/rules
data/costBook -> features/cost/capex-costs/rules
data/costBook -> features/cost/costing/model
data/finance -> features/pm/finance/rules
data/finance -> features/pm/shared/projectRow
data/generalData -> features/pm/general-data/rules
data/generatorCatalogueCache -> features/pm/generators/rules
data/generators -> features/pm/generators/rules
data/gridOperator -> features/pm/grid-operator/rules
data/landLease -> features/cost/periods/landLeaseRules
data/milestones -> features/pm/general-data/projectColumns
data/milestones -> features/pm/milestones/milestonesPerfFlags
data/milestones -> features/pm/milestones/rules
data/periodWrites -> features/cost/periods/opexRules
data/planning -> features/pm/planning/rules
data/pmProjectRow -> features/pm/shared/projectRow
data/production -> features/pm/production/rules
data/projects -> features/pm/project-main/rules
data/revenues -> features/pm/revenues/rules
data/team -> features/pm/team/rules
`;

/* ───────────────────────────────────────────────────────────────── scanning ── */

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "generated" || name === "test" ? [] : sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) && !/\.d\.ts$/.test(name) ? [path] : [];
  });
}

/** Block comments and whole-line comments removed (strings are kept: the module specifiers are in them). */
function withoutComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").split(/\r?\n/).filter((line) => !/^\s*\/\//.test(line)).join("\n");
}

const NAMED = String.raw`\{[^}]*\}`;
const IMPORT_FROM = new RegExp(
  String.raw`(?:^|\n)\s*import\s+(type\s+)?((?:[\w$]+\s*,?\s*)?(?:\*\s+as\s+[\w$]+|${NAMED})?)\s*from\s*["']([^"']+)["']`, "g",
);
const EXPORT_FROM = new RegExp(
  String.raw`(?:^|\n)\s*export\s+(type\s+)?(\*(?:\s+as\s+[\w$]+)?|${NAMED})\s*from\s*["']([^"']+)["']`, "g",
);
const SIDE_EFFECT_IMPORT = /(?:^|\n)\s*import\s*["']([^"']+)["']/g;

/** A clause such as `{ type A, type B }` has no value in it; `{ type A, b }`, `X`, `X, { y }` and `* as X` have. */
function hasValue(clause: string): boolean {
  const named = /\{([^}]*)\}/.exec(clause);
  const outside = clause.replace(/\{[^}]*\}/, "").replace(/,/g, "").trim();
  if (outside) return true;
  if (!named) return false;
  return named[1]!.split(",").map((s) => s.trim()).filter(Boolean).some((s) => !/^type\s/.test(s));
}

/** The module specifiers a file imports or re-exports with at least one value (`import type` is skipped). */
function valueSpecifiers(code: string): string[] {
  const out: string[] = [];
  for (const re of [IMPORT_FROM, EXPORT_FROM]) {
    for (const m of code.matchAll(re)) if (!m[1] && hasValue(m[2] ?? "")) out.push(m[3]!);
  }
  for (const m of code.matchAll(SIDE_EFFECT_IMPORT)) out.push(m[1]!);
  return out;
}

const norm = (path: string): string => relative(SRC, path).replace(/\\/g, "/");

/** `@/x`, `./x`, `../x` to a file under `src/` (`x.ts`, `x.tsx` or `x/index.ts(x)`), or null for a package or a CSS/asset file. */
function resolveSpecifier(fromFile: string, spec: string): string | null {
  const base = spec.startsWith("@/") ? join(SRC, spec.slice(2)) : spec.startsWith(".") ? resolve(dirname(fromFile), spec) : null;
  if (!base) return null;
  for (const candidate of [`${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

const files = sourceFiles(SRC);
const staticImports = new Map<string, string[]>(files.map((file) => {
  const targets = valueSpecifiers(withoutComments(readFileSync(file, "utf8")))
    .map((spec) => resolveSpecifier(file, spec))
    .filter((t): t is string => t !== null);
  return [file, targets];
}));

/** The first chain of static value imports from `start` to a file under `forbidden`, or null. */
function reachPath(start: string, forbidden: readonly string[]): string[] | null {
  const from = join(SRC, start);
  const parent = new Map<string, string>();
  const queue = [from];
  const seen = new Set<string>([from]);
  while (queue.length > 0) {
    const file = queue.shift()!;
    for (const next of staticImports.get(file) ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      parent.set(next, file);
      const rel = norm(next).replace(/\.tsx?$/, "");
      if (forbidden.some((f) => rel === f || rel.startsWith(`${f}/`))) {
        const chain = [rel];
        for (let at = file; at !== from; at = parent.get(at)!) chain.unshift(norm(at));
        chain.unshift(start);
        return chain;
      }
      queue.push(next);
    }
  }
  return null;
}

function dataToFeatureEdges(): string[] {
  const edges = new Set<string>();
  for (const file of files) {
    const rel = norm(file);
    if (!rel.startsWith("data/")) continue;
    for (const target of staticImports.get(file) ?? []) {
      if (norm(target).startsWith("features/")) edges.add(`${rel.replace(/\.tsx?$/, "")} -> ${norm(target).replace(/\.tsx?$/, "")}`);
    }
  }
  return [...edges].sort();
}

function allowedEdges(): string[] {
  return ALLOWED_EDGES_TEXT.split("\n").map((l) => l.trim()).filter(Boolean).sort();
}

const HOW_TO = "Import the helper from the module that owns it, or move it to a small module (data/bulkTables.ts, data/projectStatesRead.ts, "
  + "data/revenueLookups.ts, data/milestoneDurations.ts), instead of importing a feature's rules.ts into the data layer or a light module into a heavy one. "
  + "If an edge was REMOVED, delete its line from ALLOWED_EDGES_TEXT (see the header of src/test/importGraph.test.ts).";

function expectNotReaching(start: string, forbidden: readonly string[]): void {
  const chain = reachPath(start, forbidden);
  expect(chain, `${start} must not reach ${forbidden.join(" / ")}. Chain: ${chain?.join(" -> ")}\n${HOW_TO}`).toBeNull();
}

/* ───────────────────────────────────────────────────────────────── the tests ── */

describe("G-IMPORT: the data layer keeps its feature edges, the light modules stay light (UT-IMPGRAPH)", () => {
  it("UT-IMPGRAPH-001 the value imports from src/data into src/features are exactly the allow-list (none new, none stale)", () => {
    const now = dataToFeatureEdges();
    const allowed = allowedEdges();
    const added = now.filter((e) => !allowed.includes(e));
    const stale = allowed.filter((e) => !now.includes(e));
    expect({ added, stale }, `${HOW_TO}\nCurrent edges:\n${now.join("\n")}`).toEqual({ added: [], stale: [] });
  });

  it("UT-IMPGRAPH-002 Planning, Grid Operator and Revenues rules do not reach the Generators rules barrel (BND-03)", () => {
    for (const rules of ["features/pm/planning/rules.ts", "features/pm/grid-operator/rules.ts", "features/pm/revenues/rules.ts"]) {
      expectNotReaching(rules, ["features/pm/generators/rules"]);
    }
  });

  it("UT-IMPGRAPH-003 the project-states cache entry and its read do not reach General Data's rules (BND-06)", () => {
    for (const mod of ["data/projectStates.ts", "data/projectStatesRead.ts"]) {
      expectNotReaching(mod, ["features/pm/general-data/rules", "data/generalData"]);
    }
  });

  it("UT-IMPGRAPH-004 the bulk transport does not reach the Add Cost sheet module (BND-07)", () => {
    expectNotReaching("data/bulkSend.ts", ["data/addCostSheetBulk", "features/cost/add-costs-from-table/rules"]);
    expectNotReaching("data/bulkTables.ts", ["data/addCostSheetBulk"]);
  });

  it("UT-IMPGRAPH-005 the Milestones and General Data hooks do not reach the cost book or Land Lease (BND-04)", () => {
    for (const hooks of ["features/pm/milestones/hooks.ts", "features/pm/general-data/hooks.ts"]) {
      expectNotReaching(hooks, ["data/costBook", "data/landLease"]);
    }
    expectNotReaching("data/milestoneDurations.ts", ["data/costBook", "data/landLease"]);
  });

  it("UT-IMPGRAPH-006 the revenue data module and its lookups do not reach Land Lease (BND-04)", () => {
    expectNotReaching("data/revenues.ts", ["data/landLease"]);
    expectNotReaching("data/revenueLookups.ts", ["data/landLease", "data/revenues"]);
  });

  it("UT-IMPGRAPH-007 the scanner itself: type-only clauses are not value edges, value clauses are", () => {
    expect(hasValue("{ type A, type B }")).toBe(false);
    expect(hasValue("{ type A, b }")).toBe(true);
    expect(hasValue("Default")).toBe(true);
    expect(hasValue("Default, { type A }")).toBe(true);
    expect(hasValue("* as ns")).toBe(true);
    const code = withoutComments([
      'import type { A } from "@/features/x/rules";',
      'import { type B } from "@/features/y/rules";',
      'import { c } from "@/features/z/rules";',
      'export { d } from "./d";',
      'export type { E } from "./e";',
      '// import { gone } from "./gone";',
      '/* import { gone2 } from "./gone2"; */',
      'const lazy = () => import("./lazy");',
    ].join("\n"));
    expect(valueSpecifiers(code).sort()).toEqual(["./d", "@/features/z/rules"]);
  });
});
