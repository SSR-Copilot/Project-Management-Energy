/**
 * UT-OVFIX-100 — a test id (`UT-<SCREEN>-NNN`) names exactly one `it()` (CONVENTIONS rule 13).
 *
 * The Project Overview's two test files carried five ids twice, so a failure could not be traced to
 * one documented case. The five duplicates were renumbered (UT-OV-099, UT-OV-100, UT-OVUI-063..065);
 * this test keeps them unique. Scope is the Project Overview's own two files on purpose: a whole-tree
 * version would need a baseline list for the other screens (see the Project Overview parity plan).
 *
 * A suffixed id (`UT-OVUI-003b`) is a different id from its parent, so the token keeps its trailing letter.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(__dirname, "..");

/** The files whose `it(...)` ids must be unique, relative to `src`. */
const FILES = [
  "features/pm/project-main/rules.test.ts",
  "features/pm/project-main/Screen.test.tsx",
] as const;

/** `it("UT-OVUI-003b …` / `test('UT-…` — the id at the start of a test title, with any suffix letter. */
const TITLE = /\b(?:it|test)\(\s*(["'`])(UT-[A-Z]+(?:-[A-Z]+)*-\d+[a-z]?)\b/g;

/** Every id used as a test title in `source`, in file order. */
function testTitleIds(source: string): string[] {
  return [...source.matchAll(TITLE)].map((m) => m[2] as string);
}

/** The ids that appear more than once, each with its count. */
function duplicateIds(ids: readonly string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const id of ids) counts[id] = (counts[id] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).filter(([, n]) => n > 1));
}

describe("test ids are unique per file", () => {
  it("UT-OVFIX-101 finds repeated ids, and keeps a suffixed id apart from its parent", () => {
    const sample = [
      'it("UT-OV-001 a", () => {});',
      "it('UT-OV-001 b', () => {});",
      'it("UT-OVUI-003 c", async () => {});',
      'it("UT-OVUI-003b d", async () => {});',
      'it(\n  "UT-OVUI-003c e",\n async () => {});',
      'describe("UT-OV-001 not a test", () => {});',
    ].join("\n");
    expect(testTitleIds(sample)).toEqual([
      "UT-OV-001", "UT-OV-001", "UT-OVUI-003", "UT-OVUI-003b", "UT-OVUI-003c",
    ]);
    expect(duplicateIds(testTitleIds(sample))).toEqual({ "UT-OV-001": 2 });
  });

  it("UT-OVFIX-100 the Project Overview's test files use no test id twice", () => {
    for (const file of FILES) {
      const ids = testTitleIds(readFileSync(join(SRC, file), "utf8"));
      expect(ids.length, `${file} has test ids`).toBeGreaterThan(50);
      expect(duplicateIds(ids), `repeated ids in ${file}`).toEqual({});
    }
  });
});
