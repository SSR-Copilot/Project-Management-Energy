/**
 * UT-CANVASDRIFT — the canvas drift tool (`scripts/check-canvas-drift.mjs`, GD-004) on two tiny synthetic trees
 * (`src/test/fixtures/canvas-drift/{a,b,c}`): `a` is the base, `b` has real changes, `c` only re-indents and comments `a`.
 * No real canvas source and no private path is read.
 */
import path from "node:path";
import { describe, expect, it } from "vitest";
import { compareCanvasTrees, driftFails, main, normalFormula, resolveSrcDir } from "../../scripts/check-canvas-drift.mjs";

const FIX = path.resolve(__dirname, "fixtures/canvas-drift");
const src = (d: string) => resolveSrcDir(path.join(FIX, d))!;

describe("UT-CANVASDRIFT canvas drift report", () => {
  it("UT-CANVASDRIFT-001 a renamed control (one removed, one added) is detected and fails", () => {
    const r = compareCanvasTrees(src("a"), src("b"));
    expect(r.controlsRemoved.map((c) => c.control)).toEqual(["btn_Gone"]);
    expect(r.controlsAdded.map((c) => c.control)).toEqual(["btn_New"]);
    expect(driftFails(r)).toBe(true);
  });

  it("UT-CANVASDRIFT-002 a changed AccessibleLabel is detected and fails, with no other identity drift", () => {
    const r = compareCanvasTrees(src("a"), src("b"));
    expect(r.labelChanges).toEqual([{ file: "Test Screen", control: "btn_Save", from: '"Save"', to: '"Save changes"' }]);
    // The label change alone is enough to fail: take the added and removed controls away.
    expect(driftFails({ ...r, controlsAdded: [], controlsRemoved: [], versionChanges: [], formulaChanges: [] })).toBe(true);
  });

  it("UT-CANVASDRIFT-003 a control version bump is reported but fails only under --strict", () => {
    const r = compareCanvasTrees(src("a"), src("b"));
    expect(r.versionChanges).toEqual([{ file: "Test Screen", control: "txt_Name", from: "ModernTextInput@1.1.1", to: "ModernTextInput@1.1.2" }]);
    expect(r.typeChanges).toEqual([]);
    const softOnly = { ...r, controlsAdded: [], controlsRemoved: [], labelChanges: [] };
    expect(driftFails(softOnly)).toBe(false);
    expect(driftFails(softOnly, { strict: true })).toBe(true);
    // A changed watched formula is reported in the same way.
    expect(r.formulaChanges.map((f) => `${f.control}.${f.property}`)).toEqual(["drp_Kind.Items"]);
  });

  it("UT-CANVASDRIFT-004 re-indenting, spacing and comment-only edits are not drift; a string literal is compared as written", () => {
    const r = compareCanvasTrees(src("a"), src("c"));
    expect(r).toEqual({
      filesAdded: [], filesRemoved: [], controlsAdded: [], controlsRemoved: [],
      labelChanges: [], versionChanges: [], typeChanges: [], formulaChanges: [],
    });
    expect(driftFails(r, { strict: true })).toBe(false);
    expect(normalFormula('=If(\n  a, // note\n  "x  y"\n)')).toBe('If(a,"x  y")');
    expect(normalFormula('=If(a, "x y")')).not.toBe(normalFormula('=If(a, "x  y")'));
  });

  it("UT-CANVASDRIFT-005 the CLI skips with a clear message when the live folder is absent, and reports a usage error without one", () => {
    const out: string[] = [];
    const err: string[] = [];
    const io = { log: (s: string) => out.push(s), err: (s: string) => err.push(s) };
    expect(main([path.join(FIX, "does-not-exist")], io)).toBe(0);
    expect(out[0]).toMatch(/^SKIPPED: no canvas source/);
    expect(main([], io)).toBe(2);
    expect(err[0]).toMatch(/^usage:/);
    out.length = 0;
    expect(main([path.join(FIX, "b"), "--base", path.join(FIX, "a")], io)).toBe(1);
    expect(out.join("\n")).toContain("btn_New");
    expect(main([path.join(FIX, "c"), "--base", path.join(FIX, "a")], io)).toBe(0);
  });
});
