/**
 * FE-AD-07 (D162): Application Settings → Contracts must not load the Cost Contracts data module (`src/data/contracts.ts`, with
 * `features/cost/contracts/rules.ts` and four more services), directly or through any module it imports. This walks the screen's
 * STATIC value imports (`import … from`, `export … from`, side-effect imports; type-only ones are erased and skipped) from every
 * non-test file of the folder, resolving `@/` and relative paths, and fails on a path that reaches the module.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = resolve(__dirname, "../../..");
const FOLDER = __dirname;
const FORBIDDEN = join(SRC, "data", "contracts.ts");

/** Static value-import specifiers of one file. */
function specifiers(code: string): string[] {
  const out: string[] = [];
  const re = /^\s*(import|export)\s+(type\s+)?([^;]*?)\s*from\s*["']([^"']+)["']|^\s*import\s*["']([^"']+)["']/gms;
  for (const m of code.matchAll(re)) {
    if (m[5]) { out.push(m[5]); continue; }
    if (m[2]) continue; // `import type` / `export type`
    const clause = m[3] ?? "";
    // `import { type A, type B } from` imports nothing at run time.
    const named = /^\{([^}]*)\}$/s.exec(clause.trim());
    if (named && named[1]!.split(",").map((p) => p.trim()).filter(Boolean).every((p) => p.startsWith("type "))) continue;
    out.push(m[4]!);
  }
  return out;
}

function resolveSpec(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(from), spec);
  else return null; // a package
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
    if (/\.(ts|tsx)$/.test(candidate) && existsSync(candidate)) return candidate;
  }
  return null; // .json, .css, generated JS: not a TypeScript module of ours
}

/** The import chain from an entry file to `target`, or null. */
function pathTo(entries: string[], target: string): string[] | null {
  const parent = new Map<string, string | null>();
  const queue = [...entries];
  for (const e of entries) parent.set(e, null);
  while (queue.length > 0) {
    const file = queue.shift()!;
    if (file === target) {
      const chain: string[] = [];
      for (let f: string | null = file; f; f = parent.get(f) ?? null) chain.unshift(relative(SRC, f));
      return chain;
    }
    for (const spec of specifiers(readFileSync(file, "utf8"))) {
      const next = resolveSpec(file, spec);
      if (next && !parent.has(next)) { parent.set(next, file); queue.push(next); }
    }
  }
  return null;
}

const entries = readdirSync(FOLDER)
  .filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.(ts|tsx)$/.test(f) && f !== "fixtures.ts")
  .map((f) => join(FOLDER, f));

describe("Application Settings Contracts import boundary (FE-AD-07)", () => {
  it("UT-ADCONTR-FE-001 no static value import path from features/admin/admin-contract reaches data/contracts.ts", () => {
    expect(entries.length).toBeGreaterThan(5);
    expect(pathTo(entries, FORBIDDEN)).toBeNull();
  });

  it("UT-ADCONTR-FE-002 the walker does find data/contracts.ts from a module that imports it (no false pass)", () => {
    expect(pathTo([join(SRC, "data", "costRepository.ts")], FORBIDDEN)).toEqual(["data/costRepository.ts", "data/contracts.ts"].map((p) => p.replace(/\//g, process.platform === "win32" ? "\\" : "/")));
  });
});
