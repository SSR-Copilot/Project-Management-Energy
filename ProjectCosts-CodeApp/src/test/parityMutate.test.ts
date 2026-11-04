/**
 * UT-PMUT — the mutation proof kit (`scripts/parity-mutate.mjs`, D80 plan section 5).
 *
 * Every case that writes runs on a temporary folder passed as `root`, with the git check injected, so the real sources
 * are never touched. The last two cases read (never write) the real Land Lease mutation set.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { STATE_FILE, apply, check, loadMutations, readState, revert, status } from "../../scripts/parity-mutate.mjs";

const roots: string[] = [];
afterEach(() => {
  for (const r of roots.splice(0)) fs.rmSync(r, { recursive: true, force: true });
});

/** Byte content with CRLF line ends and non-ASCII text, so a byte-for-byte restore is really tested. */
const A = Buffer.from('export const LABELS = {\r\n  title: "Größe — Title",\r\n  hint: "Hint",\r\n};\r\nexport const gate = canCreate;\r\n', "utf8");
const B = Buffer.from('const th = { fontSize: "10pt", height: "34px" };\n', "utf8");

function makeRoot(mutations: unknown = [
  { id: "caption", layer: "visual", file: "src/a.ts", find: 'title: "Größe — Title",', replace: 'title: "Größe — Titel",', expectKey: '^visual\\.[^\\[]+\\["Größe — Titel"\\]\\.extra$' },
  { id: "gate", layer: "gates", file: "src/a.ts", find: "export const gate = canCreate;", replace: "export const gate = !canCreate;", expectKey: '^gates\\.[^\\[]+\\["Add"\\]\\.enabled$' },
  { id: "size", layer: "visual", file: "src/b.tsx", find: 'fontSize: "10pt"', replace: 'fontSize: "11pt"', expectKey: "^visual\\..*\\.fontSize$" },
]): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pmut-"));
  roots.push(root);
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.mkdirSync(path.join(root, "e2e/screens/demo"), { recursive: true });
  fs.writeFileSync(path.join(root, "src/a.ts"), A);
  fs.writeFileSync(path.join(root, "src/b.tsx"), B);
  fs.writeFileSync(path.join(root, "e2e/screens/demo/mutations.json"), JSON.stringify(mutations, null, 2));
  return root;
}
const clean = () => false;
const read = (root: string, rel: string) => fs.readFileSync(path.join(root, rel));

function summary(root: string, name: string, diffs: { key: string; cls: string }[], startedAt = "2099-01-01T00:00:00.000Z"): string {
  const dir = path.join(root, "runs", name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "summary.json"), JSON.stringify({ screen: "demo", startedAt, diffs: diffs.map((d) => ({ ...d, layer: "visual", canvas: null, code: null })) }));
  return dir;
}

describe("UT-PMUT — parity-mutate apply / revert / status / check", () => {
  it("UT-PMUT-001 apply then revert restores every file byte for byte and forgets the state", () => {
    const root = makeRoot();
    apply({ screen: "demo", root, isDirty: clean });
    expect(read(root, "src/a.ts").equals(A)).toBe(false);
    const r = revert({ root });
    expect(r).toEqual({ restored: ["src/a.ts", "src/b.tsx"], screen: "demo" });
    expect(read(root, "src/a.ts").equals(A)).toBe(true);
    expect(read(root, "src/b.tsx").equals(B)).toBe(true);
    expect(fs.existsSync(path.join(root, STATE_FILE))).toBe(false);
    expect(status({ root })).toBeNull();
  });

  it("UT-PMUT-002 apply writes every replacement once and records originals with their hashes", () => {
    const root = makeRoot();
    const r = apply({ screen: "demo", root, isDirty: clean, now: () => "2026-11-03T10:00:00.000Z" });
    expect(r.applied.map((a) => a.id)).toEqual(["caption", "gate", "size"]);
    const a = read(root, "src/a.ts").toString("utf8");
    expect(a).toContain('title: "Größe — Titel",\r\n');
    expect(a).toContain("export const gate = !canCreate;");
    expect(read(root, "src/b.tsx").toString("utf8")).toBe('const th = { fontSize: "11pt", height: "34px" };\n');
    const state = readState(root)!;
    expect(state.screen).toBe("demo");
    expect(state.appliedAt).toBe("2026-11-03T10:00:00.000Z");
    expect(state.files.map((f) => f.file)).toEqual(["src/a.ts", "src/b.tsx"]);
    expect(Buffer.from(state.files[0]!.original, "base64").equals(A)).toBe(true);
    expect(status({ root })?.files).toEqual([{ file: "src/a.ts", state: "mutated" }, { file: "src/b.tsx", state: "mutated" }]);
    revert({ root });
  });

  it("UT-PMUT-003 refuses a second apply while a set is applied, and changes nothing", () => {
    const root = makeRoot();
    apply({ screen: "demo", root, isDirty: clean });
    const before = read(root, "src/a.ts");
    expect(() => apply({ screen: "demo", root, isDirty: clean })).toThrow(/already applied/);
    expect(read(root, "src/a.ts").equals(before)).toBe(true);
    revert({ root });
    expect(read(root, "src/a.ts").equals(A)).toBe(true);
  });

  it("UT-PMUT-004 refuses a missing anchor and writes nothing, not even the other mutations", () => {
    const root = makeRoot([
      { id: "ok", layer: "visual", file: "src/b.tsx", find: 'fontSize: "10pt"', replace: 'fontSize: "11pt"', expectKey: "x" },
      { id: "gone", layer: "visual", file: "src/a.ts", find: "no such text", replace: "y", expectKey: "x" },
    ]);
    expect(() => apply({ screen: "demo", root, isDirty: clean })).toThrow(/gone: the find text occurs 0 times in src\/a\.ts/);
    expect(read(root, "src/b.tsx").equals(B)).toBe(true);
    expect(readState(root)).toBeNull();
  });

  it("UT-PMUT-005 refuses an anchor found twice", () => {
    const root = makeRoot([{ id: "twice", layer: "visual", file: "src/a.ts", find: "\r\n", replace: "\n", expectKey: "x" }]);
    expect(() => apply({ screen: "demo", root, isDirty: clean })).toThrow(/twice: the find text occurs 5 times/);
    expect(read(root, "src/a.ts").equals(A)).toBe(true);
  });

  it("UT-PMUT-006 refuses a target file with uncommitted changes, or one whose git status cannot be read", () => {
    const root = makeRoot();
    expect(() => apply({ screen: "demo", root, isDirty: (rel) => rel === "src/b.tsx" })).toThrow(/src\/b\.tsx has uncommitted changes/);
    expect(read(root, "src/a.ts").equals(A)).toBe(true);
    expect(() => apply({ screen: "demo", root, isDirty: () => { throw new Error("not a git repository"); } })).toThrow(/cannot check git status/);
    expect(readState(root)).toBeNull();
  });

  it("UT-PMUT-007 revert refuses a file changed since apply and keeps the state; a file already restored is fine", () => {
    const root = makeRoot();
    apply({ screen: "demo", root, isDirty: clean });
    fs.writeFileSync(path.join(root, "src/a.ts"), "edited by hand\n");
    fs.writeFileSync(path.join(root, "src/b.tsx"), B);
    expect(() => revert({ root })).toThrow(/src\/a\.ts: changed since apply/);
    expect(readState(root)).not.toBeNull();
    expect(status({ root })?.files).toEqual([{ file: "src/a.ts", state: "changed" }, { file: "src/b.tsx", state: "original" }]);
    fs.writeFileSync(path.join(root, "src/a.ts"), A);
    expect(revert({ root }).restored).toEqual(["src/a.ts", "src/b.tsx"]);
    expect(revert({ root })).toEqual({ restored: [], screen: null });
  });

  it("UT-PMUT-008 check finds each mutation in the run's new differences and reports the missed ones", () => {
    const root = makeRoot();
    const run = summary(root, "r1", [
      { key: 'visual.panel["Größe — Titel"].extra', cls: "new" },
      { key: 'gates.rest["Add"].enabled', cls: "known" },
      { key: 'visual.card["Start Date"].fontSize', cls: "new" },
    ]);
    const r = check({ screen: "demo", runDir: run, root });
    expect(r.results).toEqual([
      { id: "caption", layer: "visual", found: true, keys: ['visual.panel["Größe — Titel"].extra'] },
      // A "known" difference is not the mutation showing up.
      { id: "gate", layer: "gates", found: false, keys: [] },
      { id: "size", layer: "visual", found: true, keys: ['visual.card["Start Date"].fontSize'] },
    ]);
    expect(r.missed).toEqual(["gate"]);
  });

  it("UT-PMUT-009 check with a baseline ignores keys that were already new before the mutations", () => {
    const root = makeRoot();
    const base = summary(root, "base", [{ key: 'visual.card["Start Date"].fontSize', cls: "new" }]);
    const run = summary(root, "r2", [
      { key: 'visual.card["Start Date"].fontSize', cls: "new" },
      { key: 'visual.panel["Größe — Titel"].extra', cls: "new" },
      { key: 'gates.rest["Add"].enabled', cls: "new" },
    ]);
    const r = check({ screen: "demo", runDir: run, baselineDir: base, root });
    expect(r.missed).toEqual(["size"]);
    expect(() => check({ screen: "demo", runDir: path.join(root, "runs/none"), root })).toThrow(/no summary\.json/);
  });

  it("UT-PMUT-010 check warns when the run started before the mutations were applied", () => {
    const root = makeRoot();
    apply({ screen: "demo", root, isDirty: clean, now: () => "2026-11-03T10:00:00.000Z" });
    const run = summary(root, "old", [], "2026-11-03T09:00:00.000Z");
    expect(check({ screen: "demo", runDir: run, root }).warnings).toEqual([expect.stringMatching(/started .* before the mutations were applied/)]);
    revert({ root });
  });

  it("UT-PMUT-011 validates the mutation list: shape, duplicate ids, a bad expectKey, a missing set", () => {
    expect(() => loadMutations("demo", makeRoot([{ id: "a", layer: "ux", file: "src/a.ts", find: "", replace: "b", expectKey: "x" }]))).toThrow(/"find" must be a non-empty string/);
    const dup = { id: "a", layer: "ux", file: "src/a.ts", find: "x", replace: "y", expectKey: "x" };
    expect(() => loadMutations("demo", makeRoot([dup, dup]))).toThrow(/listed twice/);
    expect(() => loadMutations("demo", makeRoot([{ ...dup, expectKey: "([" }]))).toThrow();
    expect(() => loadMutations("nope", makeRoot())).toThrow(/no mutation set/);
    expect(() => loadMutations(undefined, makeRoot())).toThrow(/no screen/);
  });

  const APP = path.resolve(__dirname, "../..");
  it("UT-PMUT-012 the Land Lease set: six mutations, one per kind, each anchor exactly once in the real source", () => {
    const list = loadMutations("land-lease", APP);
    expect(list.map((m) => [m.id, m.layer])).toEqual([
      ["caption", "visual"], ["size", "visual"], ["gate", "gates"], ["message", "validation"], ["written-column", "flows"], ["aria-label", "ux"],
    ]);
    for (const m of list) {
      const text = fs.readFileSync(path.join(APP, m.file), "utf8");
      expect(text.split(m.find).length - 1, `${m.id} in ${m.file}`).toBe(1);
      expect(text.includes(m.replace), `${m.id}: the replacement must not be in the source already`).toBe(false);
    }
  });

  it("UT-PMUT-013 each Land Lease expectKey matches its own difference in the compare key form, and no other", () => {
    const list = loadMutations("land-lease", APP);
    const keys: Record<string, string> = {
      caption: 'visual.panel-new-edit-period["Descripton"].extra',
      size: 'visual.gallery-subaccounts["Start Date"].fontSize',
      // "Add Standard Contract", not "Add Contract Type": disabling Add Contract Type also blocked the new-contract panel and
      // the write flows, which hid the caption and written-column mutations (mutation run, 4 Nov 2026).
      gate: 'gates.card-6-open["Add Standard Contract"].enabled',
      message: 'validation.due-date["1."].messages',
      "written-column": 'flows.add-period["land-lease-periods"][0].vsb_eurwtg',
      // compare.ts writes one key per field of an object-valued ux check (`ux.<check>.<field>`); the mutated label is Duration years.
      "aria-label": "ux.edit-panel-accessible-names.durationYears",
    };
    for (const m of list) {
      const re = new RegExp(m.expectKey);
      for (const [id, key] of Object.entries(keys)) expect(re.test(key), `${m.id} vs ${id}`).toBe(id === m.id);
    }
    // A check that records the label as a whole value (`.value`) is still found; another field of the check is not.
    const aria = new RegExp(list.find((m) => m.id === "aria-label")!.expectKey);
    expect(aria.test("ux.accessible-names.value")).toBe(true);
    expect(aria.test("ux.edit-panel-accessible-names.durationMonths")).toBe(false);
    // The old validation spec's group name form (`otpDueDate1`) matches too.
    expect(new RegExp(list.find((m) => m.id === "message")!.expectKey).test('validation.otpDueDate1["13/2026"].messages')).toBe(true);
  });
});
