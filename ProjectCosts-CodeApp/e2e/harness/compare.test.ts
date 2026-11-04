/**
 * The offline comparison (`compare.ts`, D80): every key form, every class, `needsEnv`, the generic layer, and key parity with
 * the old specs' `noteDiff` keys (`landlease.validation.parity.spec.ts`). Pure: no browser, no files.
 */
import { describe, expect, it } from "vitest";
import type { ArtefactRule, ClassedDiff, FactFile, Kind, Layer } from "./contract";
import { compareRun, stableJson, validationKey, type CompareManifest } from "./compare";
import { noteDiff } from "../lib/known";
import type { TextFact } from "../lib/texts";

const noop = async () => {};

function manifest(over: Partial<CompareManifest> = {}): CompareManifest {
  return { known: {}, artefacts: [], visual: [], validation: [], gates: [], ux: [], flows: [], ...over };
}

function fact(kind: Kind, layer: Layer, key: string, data: unknown): FactFile {
  return { screen: "test-screen", kind, layer, key, recordedAt: "2026-11-03T10:00:00.000Z", data };
}

/** The same fact for both apps. */
const pair = (layer: Layer, key: string, canvas: unknown, code: unknown) => ({ canvas: [fact("canvas", layer, key, canvas)], code: [fact("code", layer, key, code)] });

const text = (t: string, over: Partial<TextFact> = {}): TextFact => ({ text: t, x: 300, y: 200, w: 50, h: 16, fontSize: "14px", fontWeight: "400", color: "rgb(0, 0, 0)", ...over });

const keys = (diffs: ClassedDiff[]) => diffs.map((d) => d.key).sort();
const byClass = (diffs: ClassedDiff[], cls: ClassedDiff["cls"]) => diffs.filter((d) => d.cls === cls);

describe("compareRun: key forms", () => {
  it("UT-PHCMP-001 visual: visual.<state>[\"<text>\"].<property> per style or position difference", () => {
    const r = compareRun({ manifest: manifest(), ...pair("visual", "card-open",
      [text("Contract"), text("Total", { y: 240 })],
      [text("Contract", { fontSize: "16px", color: "rgb(1, 2, 3)" }), text("Total", { y: 240 })]) });
    expect(keys(r.diffs)).toEqual(['visual.card-open["Contract"].color', 'visual.card-open["Contract"].fontSize']);
    const size = r.diffs.find((d) => d.key.endsWith(".fontSize"))!;
    expect(size).toMatchObject({ layer: "visual", cls: "new", canvas: "14px", code: "16px" });
  });

  it("UT-PHCMP-002 visual: .missing / .extra, a repeated text counted, a second hit of one key gets #2", () => {
    const r = compareRun({ manifest: manifest(), ...pair("visual", "default",
      [text("Only canvas"), text("Twice"), text("Twice", { y: 260 }), text("Dup"), text("Dup", { y: 300 })],
      [text("Only code"), text("Dup", { fontSize: "20px" }), text("Dup", { y: 300, fontSize: "20px" })]) });
    expect(keys(r.diffs)).toEqual([
      'visual.default["Dup"].fontSize',
      'visual.default["Dup"].fontSize#2',
      'visual.default["Only canvas"].missing',
      'visual.default["Only code"].extra',
      'visual.default["Twice"].missing',
    ]);
    expect(r.diffs.find((d) => d.key === 'visual.default["Twice"].missing')).toMatchObject({ canvas: "Twice (x2)", code: null });
    expect(r.diffs.find((d) => d.key === 'visual.default["Only code"].extra')).toMatchObject({ canvas: null, code: "Only code" });
  });

  it("UT-PHCMP-003 visual: a text with quotes or backslashes keeps its JSON escapes in the key", () => {
    const r = compareRun({ manifest: manifest(), ...pair("visual", "s", [text('Say "hi" \\ now')], [text('Say "hi" \\ now', { fontWeight: "700" })]) });
    expect(keys(r.diffs)).toEqual([`visual.s[${JSON.stringify('Say "hi" \\ now')}].fontWeight`]);
  });

  it("UT-PHCMP-004 validation: validation.<group>[\"<input>\"].messages / .save; the message order does not matter", () => {
    const r = compareRun({ manifest: manifest(), ...pair("validation", "euroMW",
      { "-1": { messages: ["B", "A"], save: false }, "1.": { messages: [], save: true }, "5": { messages: ["A"], save: true } },
      { "-1": { messages: ["A", "B"], save: false }, "1.": { messages: ["Bad"], save: false }, "5": { messages: ["A"], save: true } }) });
    expect(keys(r.diffs)).toEqual(['validation.euroMW["1."].messages', 'validation.euroMW["1."].save']);
    expect(validationKey("euroMW", "1.", "save")).toBe('validation.euroMW["1."].save');
  });

  it("UT-PHCMP-005 validation keys are exactly the keys the old spec's noteDiff builds for the same outcomes", () => {
    const canvas = { g1: { "a\"b": { messages: ["M1"], save: false }, " ": { messages: [], save: true }, "x": { messages: [], save: true } } };
    const code = { g1: { "a\"b": { messages: ["M2"], save: true }, " ": { messages: [], save: false }, "x": { messages: [], save: true } } };
    // The old spec, line for line: key = `validation.${group.key}[${JSON.stringify(row.input)}]`, then `.messages` / `.save`.
    const found: Record<string, string> = {};
    for (const [group, inputs] of Object.entries(canvas)) {
      for (const input of Object.keys(inputs)) {
        const a = canvas[group as "g1"][input as "x"];
        const b = code[group as "g1"][input as "x"];
        const key = `validation.${group}[${JSON.stringify(input)}]`;
        noteDiff(found, `${key}.messages`, a?.messages, b?.messages);
        noteDiff(found, `${key}.save`, a?.save, b?.save);
      }
    }
    const r = compareRun({ manifest: manifest(), ...pair("validation", "g1", canvas.g1, code.g1) });
    expect(keys(r.diffs)).toEqual(Object.keys(found).sort());
  });

  it("UT-PHCMP-006 gates: gates.<state>[\"<command>\"].enabled; a command one app lacks is null there", () => {
    const r = compareRun({ manifest: manifest(), ...pair("gates", "row-selected", { Edit: true, Delete: false, New: true }, { Edit: false, Delete: false }) });
    expect(keys(r.diffs)).toEqual(['gates.row-selected["Edit"].enabled', 'gates.row-selected["New"].enabled']);
    expect(r.diffs.find((d) => d.key.includes('"New"'))).toMatchObject({ canvas: true, code: null, layer: "gates" });
  });

  it("UT-PHCMP-007 ux: ux.<check>.value, deep; a map file of checks is split into its checks", () => {
    const m = manifest({ ux: [{ name: "focus-order", run: async () => null }] });
    const r = compareRun({
      manifest: m,
      canvas: [fact("canvas", "ux", "focus-order", ["a", "b"]), fact("canvas", "ux", "hovers", { close: "Cancel", save: "Save" })],
      code: [fact("code", "ux", "focus-order", ["b", "a"]), fact("code", "ux", "hovers", { close: "Close", save: "Save" })],
    });
    expect(keys(r.diffs)).toEqual(["ux.close.value", "ux.focus-order.value"]);
    expect(r.diffs.find((d) => d.key === "ux.close.value")).toMatchObject({ canvas: "Cancel", code: "Close" });
  });

  it("UT-PHCMP-024 ux: an object of fields in both apps gives one key per leaf field, like the old gates spec's keys", () => {
    const m = manifest({ ux: ["edit-panel-texts", "edit-panel-dropdowns", "save-gate", "toggles"].map((name) => ({ name, run: async () => null })) });
    const r = compareRun({
      manifest: m,
      canvas: [
        fact("canvas", "ux", "edit-panel-texts", { description: "Lease A", euroWTG: "1000", "Fix Costs p.a.": "5" }),
        fact("canvas", "ux", "edit-panel-dropdowns", { durationYears: { value: "1 year", enabled: true, options: ["1 year", "2 years"] }, currency: { value: "EUR", enabled: false } }),
        fact("canvas", "ux", "save-gate", { empty: false, descriptionOnly: false }),
        fact("canvas", "ux", "toggles", { secured: true }),
      ],
      code: [
        fact("code", "ux", "edit-panel-texts", { description: "Lease A", euroWTG: "1,000", "Fix Costs p.a.": "6" }),
        fact("code", "ux", "edit-panel-dropdowns", { durationYears: { value: "1 year", enabled: true, options: ["1 year"] }, currency: { value: "EUR", enabled: false }, extra: { value: "x" } }),
        fact("code", "ux", "save-gate", { empty: false, descriptionOnly: true }),
        fact("code", "ux", "toggles", null),
      ],
    });
    expect(keys(r.diffs)).toEqual([
      'ux.edit-panel-dropdowns.durationYears.options',
      "ux.edit-panel-dropdowns.extra.value",
      'ux.edit-panel-texts.euroWTG',
      'ux.edit-panel-texts["Fix Costs p.a."]',
      "ux.save-gate.descriptionOnly",
      "ux.toggles.value",
    ]);
    expect(r.diffs.find((d) => d.key === "ux.edit-panel-dropdowns.extra.value")).toMatchObject({ canvas: null, code: "x", cls: "new" });
    expect(r.diffs.find((d) => d.key === "ux.save-gate.descriptionOnly")).toMatchObject({ canvas: false, code: true, layer: "ux" });
    // One app recorded an object, the other not: the whole value, as before.
    expect(r.diffs.find((d) => d.key === "ux.toggles.value")).toMatchObject({ canvas: { secured: true }, code: null });
  });

  it("UT-PHCMP-025 ux per-field keys are judged known and stale like any other key", () => {
    const m = manifest({
      ux: [{ name: "save-gate", run: async () => null }],
      known: { "ux.save-gate.descriptionOnly": "D9", "ux.save-gate.empty": "D10" },
    });
    const r = compareRun({ manifest: m, ...pair("ux", "save-gate", { empty: false, descriptionOnly: false }, { empty: false, descriptionOnly: true }) });
    expect(r.diffs.map((d) => [d.key, d.cls])).toEqual([["ux.save-gate.descriptionOnly", "known"], ["ux.save-gate.empty", "stale"]]);
  });

  it("UT-PHCMP-008 flows: flows.<flow>.<step>[\"<table>\"].count and [<i>].<column> from a <flow>.<step> file", () => {
    const r = compareRun({ manifest: manifest(), ...pair("flows", "lease.S1-create",
      { costs: [{ name: "A", amount: 1 }], periods: [{ n: 1 }, { n: 2 }] },
      { costs: [{ name: "A", amount: 2 }], periods: [{ n: 1 }] }) });
    expect(keys(r.diffs)).toEqual(['flows.lease.S1-create["costs"][0].amount', 'flows.lease.S1-create["periods"].count']);
    expect(r.diffs.find((d) => d.key.endsWith(".count"))).toMatchObject({ canvas: 2, code: 1, layer: "flows" });
  });

  it("UT-PHCMP-009 flows: a file keyed by the flow with a step map, and a bare step key placed under its one flow", () => {
    const m = manifest({ flows: [{ name: "lease", steps: [{ name: "S1", run: noop }, { name: "S2", run: noop }], cleanup: noop }] });
    const r = compareRun({
      manifest: m,
      canvas: [fact("canvas", "flows", "lease", { S1: { costs: [{ a: 1 }] }, S2: { costs: [] } })],
      code: [fact("code", "flows", "S1", { costs: [{ a: 9 }] }), fact("code", "flows", "lease.S2", { costs: [] })],
    });
    expect(keys(r.diffs)).toEqual(['flows.lease.S1["costs"][0].a']);
    expect(r.notCaptured).toEqual([]);
  });

  it("UT-PHCMP-010 data: a row-shaped data fact uses the flows key form and keeps the data layer", () => {
    const r = compareRun({ manifest: manifest(), ...pair("data", "lease.S3", { costs: [{ c: "x" }] }, { costs: [{ c: "y" }] }) });
    expect(r.diffs).toEqual([{ key: 'flows.lease.S3["costs"][0].c', layer: "data", cls: "new", canvas: "x", code: "y" }]);
  });

  it("UT-PHCMP-011 any other layer (a screen's own lane) is compared generically: <layer>.<key>.value, deep, key order ignored", () => {
    const r = compareRun({
      manifest: manifest(),
      canvas: [fact("canvas", "platform", "deep-link", { a: 1, b: [1, 2] }), fact("canvas", "rules", "totals", 10), fact("canvas", "data", "summary", "x")],
      code: [fact("code", "platform", "deep-link", { b: [1, 2], a: 1 }), fact("code", "rules", "totals", 11), fact("code", "data", "summary", "y")],
    });
    expect(keys(r.diffs)).toEqual(["data.summary.value", "rules.totals.value"]);
    expect(r.diffs.find((d) => d.key === "rules.totals.value")).toMatchObject({ layer: "rules", canvas: 10, code: 11 });
    expect(stableJson({ b: 1, a: { d: 1, c: 2 } })).toBe(stableJson({ a: { c: 2, d: 1 }, b: 1 }));
  });
});

describe("compareRun: classes", () => {
  const KEY = 'gates.rest["Edit"].enabled';
  const gates = pair("gates", "rest", { Edit: true }, { Edit: false });

  it("UT-PHCMP-012 new: a difference with no known entry and no artefact rule", () => {
    const r = compareRun({ manifest: manifest(), ...gates });
    expect(r.diffs).toEqual([{ key: KEY, layer: "gates", cls: "new", canvas: true, code: false }]);
  });

  it("UT-PHCMP-013 known: the key is in manifest.known; the note is its reason", () => {
    const r = compareRun({ manifest: manifest({ known: { [KEY]: "D99 DIVERGENCE" } }), ...gates });
    expect(r.diffs).toEqual([{ key: KEY, layer: "gates", cls: "known", canvas: true, code: false, note: "D99 DIVERGENCE" }]);
  });

  it("UT-PHCMP-014 artefact: a rule of the same layer matches (screen rules first, then extraArtefacts); another layer's rule does not", () => {
    const visualRule: ArtefactRule = { id: "V1", layer: "visual", test: () => true, reason: "visual only" };
    const screenRule: ArtefactRule = { id: "S1", layer: "gates", test: (d) => d.key.includes("Edit"), reason: "screen rule" };
    const common: ArtefactRule = { id: "C1", layer: "gates", test: () => true, reason: "common rule" };
    const r1 = compareRun({ manifest: manifest({ artefacts: [visualRule] }), ...gates, extraArtefacts: [common] });
    expect(r1.diffs[0]).toMatchObject({ cls: "artefact", note: "C1: common rule" });
    const r2 = compareRun({ manifest: manifest({ artefacts: [screenRule] }), ...gates, extraArtefacts: [common] });
    expect(r2.diffs[0]).toMatchObject({ cls: "artefact", note: "S1: screen rule" });
    const r3 = compareRun({ manifest: manifest({ artefacts: [visualRule] }), ...gates });
    expect(r3.diffs[0]!.cls).toBe("new");
  });

  it("UT-PHCMP-015 known wins over an artefact rule", () => {
    const rule: ArtefactRule = { id: "C1", layer: "gates", test: () => true, reason: "r" };
    const r = compareRun({ manifest: manifest({ known: { [KEY]: "D1" } }), ...gates, extraArtefacts: [rule] });
    expect(r.diffs[0]!.cls).toBe("known");
  });

  it("UT-PHCMP-016 stale: one stale diff for a known key whose entry both apps recorded without that difference", () => {
    const r = compareRun({ manifest: manifest({ known: { 'gates.rest["Edit"].enabled': "D1", 'gates.rest["New"].enabled': "D2" } }), ...gates });
    expect(byClass(r.diffs, "stale")).toEqual([
      { key: 'gates.rest["New"].enabled', layer: "gates", cls: "stale", canvas: null, code: null, note: "D2 (no longer occurs)" },
    ]);
    expect(byClass(r.diffs, "known").map((d) => d.key)).toEqual(['gates.rest["Edit"].enabled']);
  });

  it("UT-PHCMP-017 not stale: a known key whose entry is in the manifest but was not recorded by both apps (the run did not look)", () => {
    const m = manifest({
      gates: [{ name: "rest", steps: noop }, { name: "panel", steps: noop }],
      known: { 'gates.panel["Save"].enabled': "D3", 'visual.never["x"].color': "D4" },
    });
    const r = compareRun({ manifest: m, ...gates });
    expect(byClass(r.diffs, "stale")).toEqual([]);
  });

  it("UT-PHCMP-018 stale: a known key whose entry exists nowhere, in a layer both apps recorded (renamed or removed)", () => {
    const m = manifest({ gates: [{ name: "rest", steps: noop }], known: { 'gates.old-state["Edit"].enabled': "D5" } });
    const r = compareRun({ manifest: m, ...gates });
    expect(byClass(r.diffs, "stale")).toEqual([
      { key: 'gates.old-state["Edit"].enabled', layer: "gates", cls: "stale", canvas: null, code: null, note: "D5 (its entry is neither in the manifest nor recorded)" },
    ]);
  });

  it("UT-PHCMP-019 stale: a known key that is not a harness key form can never match (an old spec's `cards`, `hover.rowTitle`)", () => {
    const r = compareRun({ manifest: manifest({ known: { cards: "old", "hover.rowTitle": "old", "S9.startDateShown": "old" } }), canvas: [], code: [] });
    expect(byClass(r.diffs, "stale").map((d) => d.key).sort()).toEqual(["S9.startDateShown", "cards", "hover.rowTitle"]);
    expect(r.diffs.every((d) => d.layer === "static")).toBe(true);
  });

  it("UT-PHCMP-020 not-captured: a fact one app recorded and a validation input one app typed", () => {
    const r = compareRun({
      manifest: manifest(),
      canvas: [fact("canvas", "visual", "only-canvas", [text("a")]), fact("canvas", "validation", "g", { "1": { messages: [], save: true }, "2": { messages: [], save: true } })],
      code: [fact("code", "ux", "only-code", 1), fact("code", "validation", "g", { "1": { messages: [], save: true } })],
    });
    expect(byClass(r.diffs, "not-captured")).toEqual([
      { key: "visual.only-canvas", layer: "visual", cls: "not-captured", canvas: "recorded", code: null, note: "recorded by the Canvas only" },
      { key: 'validation.g["2"]', layer: "validation", cls: "not-captured", canvas: { messages: [], save: true }, code: null, note: "input recorded by the Canvas only" },
      { key: "ux.only-code", layer: "ux", cls: "not-captured", canvas: null, code: "recorded", note: "recorded by the code app only" },
    ]);
    expect(r.diffs.every((d) => d.cls === "not-captured")).toBe(true);
  });

  it("UT-PHCMP-023 a platform fact one app recorded is that app's own check: no difference of any class", () => {
    const r = compareRun({
      manifest: manifest(),
      canvas: [fact("canvas", "platform", "canvas-refresh", { shows: true })],
      code: [fact("code", "platform", "load", { errors: [] }), fact("code", "platform", "unlabelled-default", [])],
    });
    expect(r.diffs).toEqual([]);
    expect(r.notCaptured).toEqual([]);
  });
});

describe("compareRun: notCaptured", () => {
  it("UT-PHCMP-021 a visual state with needsEnv unset is 'skipped: <ENV> not set'; set but unrecorded is 'recorded by neither app'", () => {
    const m = manifest({ visual: [{ name: "empty-card", needsEnv: "LANDLEASE_EMPTY_CARD", steps: noop }] });
    expect(compareRun({ manifest: m, canvas: [], code: [], env: {} }).notCaptured).toEqual(["visual.empty-card: skipped: LANDLEASE_EMPTY_CARD not set"]);
    expect(compareRun({ manifest: m, canvas: [], code: [], env: { LANDLEASE_EMPTY_CARD: "  " } }).notCaptured).toEqual(["visual.empty-card: skipped: LANDLEASE_EMPTY_CARD not set"]);
    expect(compareRun({ manifest: m, canvas: [], code: [], env: { LANDLEASE_EMPTY_CARD: "3" } }).notCaptured).toEqual(["visual.empty-card: recorded by neither app"]);
  });

  it("UT-PHCMP-022 every manifest layer is listed when one app or neither recorded it; recorded by both is not listed", () => {
    const m = manifest({
      visual: [{ name: "default", steps: noop }],
      validation: [{ key: "euroMW", field: "txt", baseline: noop, inputs: ["1"] }],
      gates: [{ name: "rest", steps: noop }],
      ux: [{ name: "zoom", run: async () => null }],
      flows: [{ name: "lease", steps: [{ name: "S1", run: noop }, { name: "S2", run: noop }], cleanup: noop }],
    });
    const r = compareRun({
      manifest: m,
      canvas: [fact("canvas", "visual", "default", []), fact("canvas", "gates", "rest", {}), fact("canvas", "flows", "lease.S1", {})],
      code: [fact("code", "visual", "default", []), fact("code", "ux", "zoom", true), fact("code", "flows", "lease.S1", {})],
    });
    expect(r.notCaptured).toEqual([
      "validation.euroMW: recorded by neither app",
      "gates.rest: recorded by the Canvas only",
      "ux.zoom: recorded by the code app only",
      "flows.lease.S2: recorded by neither app",
    ]);
  });
});
