/**
 * UT-PHSCR: the harness's screen layer (`screens.ts`, plus the pure parts of `openers.ts` and `data.ts`): lanes, budgets,
 * finding screens by folder, manifest checks, common artefacts, PM opening, run tags and row normalising. No browser.
 */
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { ScreenManifest, TableSpec } from "./contract";
import { assertTag, compareCells, deleteOrder, KIND_CODE, normaliseRows, readOrder, rowsWithoutBu, runTag } from "./data";
import { REPO_ROOT } from "./env";
import { isProjectScoped, pmCodeHash, pmMenuLabel, refreshKeepsScreen } from "./openers";
import {
  budgetFor, COMMON_ARTEFACTS, DEFAULT_BUDGETS, DEFAULT_FLOW_TIMEOUT_MIN, DEFAULT_LANES, flowTimeoutMs, LANE_LAYER_ORDER, laneFor, laneKind,
  laneTarget, layersOfLane, listScreens, loadManifest, selectedScreen, smokeStateOf, uxLaneFor, validateManifest, validationWaitFor,
  visualKeyParts,
} from "./screens";

const noop = async () => {};

/** The smallest valid manifest; each test changes one thing. */
function minimal(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    slug: "demo", title: "Demo", canvasSource: { app: "projectcosts", yaml: "Demo Screen.pa.yaml" }, canvasVersion: "1.21.709",
    open: { app: "cost", canvasMenu: "Demo", codeRoute: "/costs/demo" }, tables: [], controls: {}, messages: [],
    visual: [{ name: "default", steps: noop }], validation: [], gates: [], ux: [], flows: [], known: {}, artefacts: [], budgets: {},
    ...over,
  };
}
const asManifest = (m: Record<string, unknown>) => m as unknown as ScreenManifest;
const problems = (m: Record<string, unknown>, slug = "demo"): string => {
  try { validateManifest(slug, m); return ""; } catch (e) { return (e as Error).message; }
};

const tmp = mkdtempSync(join(tmpdir(), "phscr-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe("lanes and budgets", () => {
  it("UT-PHSCR-001 DEFAULT_LANES: the plan's lane per layer and app", () => {
    expect(DEFAULT_LANES).toEqual({
      visual: { canvas: "canvas-A", code: "code-A" }, platform: { canvas: "canvas-A", code: "code-A" },
      validation: { canvas: "canvas-B", code: "code-B" }, gates: { canvas: "canvas-B", code: "code-B" },
      ux: { canvas: "canvas-C", code: "code-A" }, flows: { canvas: "write-canvas", code: "write-code" },
      data: { canvas: "write-canvas", code: "write-code" },
    });
  });

  it("UT-PHSCR-002 laneFor: the default, a manifest override, and static/rules refused", () => {
    const m = asManifest(minimal());
    expect(laneFor(m, "validation", "canvas")).toBe("canvas-B");
    expect(laneFor(m, "visual", "code")).toBe("code-A");
    const o = asManifest(minimal({ lanes: { validation: { canvas: "canvas-C", code: "code-A" } } }));
    expect(laneFor(o, "validation", "canvas")).toBe("canvas-C");
    expect(laneFor(o, "validation", "code")).toBe("code-A");
    expect(laneFor(o, "gates", "canvas")).toBe("canvas-B");
    expect(() => laneFor(m, "rules", "code")).toThrow(/vitest/);
  });

  it("UT-PHSCR-003 uxLaneFor: a check's own lane counts only for the app that lane drives", () => {
    const m = asManifest(minimal());
    expect(uxLaneFor(m, { lane: "canvas-A" }, "canvas")).toBe("canvas-A");
    expect(uxLaneFor(m, { lane: "canvas-A" }, "code")).toBe("code-A");
    expect(uxLaneFor(m, {}, "canvas")).toBe("canvas-C");
  });

  it("UT-PHSCR-004 laneKind / laneTarget", () => {
    expect([laneKind("canvas-B"), laneKind("write-canvas"), laneKind("code-A"), laneKind("write-code")]).toEqual(["canvas", "canvas", "code", "code"]);
    expect([laneTarget("canvas-C"), laneTarget("write-code")]).toEqual(["read", "write"]);
  });

  it("UT-PHSCR-005 layersOfLane: what each lane runs, platform last; ux only where a check lands", () => {
    const m = asManifest(minimal({ ux: [{ name: "hover", lane: "canvas-A", run: noop }] }));
    expect(layersOfLane(m, "canvas-A")).toEqual(["visual", "ux", "platform"]);
    expect(layersOfLane(m, "canvas-C")).toEqual([]);
    expect(layersOfLane(m, "code-A")).toEqual(["visual", "ux", "platform"]);
    expect(layersOfLane(m, "code-B")).toEqual(["validation", "gates"]);
    expect(layersOfLane(m, "write-canvas")).toEqual(["flows"]);
  });

  it("UT-PHSCR-006 budgetFor: the manifest's minutes, else the harness default", () => {
    const m = asManifest(minimal({ budgets: { "canvas-B": 22 } }));
    expect(budgetFor(m, "canvas-B")).toBe(22);
    expect(budgetFor(m, "write-canvas")).toBe(25);
    expect(DEFAULT_BUDGETS).toEqual({ "canvas-A": 15, "canvas-B": 18, "canvas-C": 10, "code-A": 10, "code-B": 10, "write-canvas": 25, "write-code": 12 });
  });

  it("UT-PHSCR-007 the generic lane files, in Playwright's alphabetical order, run the layers in LANE_LAYER_ORDER (platform last)", () => {
    // One worker per lane runs the project's files one after another, sorted by path: the file names carry the order.
    const files = readdirSync(join(REPO_ROOT, "e2e", "harness", "lanes")).filter((f) => f.endsWith(".lane.ts")).sort();
    expect(files.map((f) => f.replace(/^\d+-/, "").replace(/\.lane\.ts$/, ""))).toEqual([...LANE_LAYER_ORDER]);
    expect(files.every((f) => /^\d-[a-z]+\.lane\.ts$/.test(f))).toBe(true); // one digit: "10-x" would sort before "2-x"
    expect(LANE_LAYER_ORDER.at(-1)).toBe("platform");
    // The screen lanes sort after the generic ones (their path does), so platform is last among the generic layers only.
    expect(["e2e/harness/lanes/6-platform.lane.ts", "e2e/screens/a/x.lane.ts"].sort()[0]).toBe("e2e/harness/lanes/6-platform.lane.ts");
  });

  it("UT-PHSCR-008 per-manifest settings: flow timeout, validation wait, smoke state, with their defaults", () => {
    expect(DEFAULT_FLOW_TIMEOUT_MIN).toBe(30);
    expect(flowTimeoutMs({})).toBe(30 * 60_000);
    expect(flowTimeoutMs({ timeoutMin: 45 })).toBe(45 * 60_000);
    expect([validationWaitFor({}, "canvas"), validationWaitFor({}, "code")]).toEqual(["outcome", "settle"]);
    expect([validationWaitFor({ validationWait: "settle" }, "canvas"), validationWaitFor({ validationWait: "settle" }, "code")]).toEqual(["settle", "settle"]);
    expect([validationWaitFor({ validationWait: { code: "stable" } }, "canvas"), validationWaitFor({ validationWait: { code: "stable" } }, "code")]).toEqual(["outcome", "stable"]);
    const visual = [{ name: "default", steps: noop }, { name: "card-open", steps: noop }];
    expect(smokeStateOf({ visual })?.name).toBe("default");
    expect(smokeStateOf({ visual, smokeState: "card-open" })?.name).toBe("card-open");
    expect(smokeStateOf({ visual: [] })).toBeNull();
  });
});

describe("finding and loading screens", () => {
  it("UT-PHSCR-010 listScreens: folders with a manifest.ts only, sorted; a missing folder is no screens", () => {
    const dir = join(tmp, "list");
    for (const d of ["opex", "land-lease", "draft-only", "Bad_Name"]) mkdirSync(join(dir, d), { recursive: true });
    writeFileSync(join(dir, "opex", "manifest.ts"), "export {}");
    writeFileSync(join(dir, "land-lease", "manifest.ts"), "export {}");
    writeFileSync(join(dir, "draft-only", "manifest.draft.ts"), "export {}");
    writeFileSync(join(dir, "Bad_Name", "manifest.ts"), "export {}");
    writeFileSync(join(dir, "stray.ts"), "export {}");
    expect(listScreens(dir)).toEqual(["land-lease", "opex"]);
    expect(listScreens(join(tmp, "nowhere"))).toEqual([]);
  });

  it("UT-PHSCR-011 loadManifest: imports <slug>/manifest.ts and checks it", async () => {
    const dir = join(tmp, "load");
    mkdirSync(join(dir, "demo"), { recursive: true });
    writeFileSync(join(dir, "demo", "manifest.ts"), `const noop = async () => {};
export const manifest = { slug: "demo", title: "Demo", canvasSource: { app: "projectcosts", yaml: "Demo.pa.yaml" }, canvasVersion: "1.21.709",
  open: { app: "admin", leftMenuLabel: "Costs", codeRoute: "/admin/cost" }, tables: [], controls: {}, messages: [],
  visual: [{ name: "default", steps: noop }], validation: [], gates: [], ux: [], flows: [], known: {}, artefacts: [], budgets: {} };`);
    const m = await loadManifest("demo", dir);
    expect(m.title).toBe("Demo");
    expect(m.open.app).toBe("admin");
  });

  it("UT-PHSCR-012 loadManifest: a missing screen names the screens found; a file without the export says so", async () => {
    const dir = join(tmp, "missing");
    mkdirSync(join(dir, "opex"), { recursive: true });
    writeFileSync(join(dir, "opex", "manifest.ts"), "export const other = 1;");
    await expect(loadManifest("land-lease", dir)).rejects.toThrow(/No manifest for screen "land-lease".*screens found: opex/);
    await expect(loadManifest("opex", dir)).rejects.toThrow(/has no "manifest" export/);
    await expect(loadManifest("Bad Slug", dir)).rejects.toThrow(/kebab-case/);
  });

  it("UT-PHSCR-013 selectedScreen: PARITY_SCREEN is required (no default); unset it names the screens on disk; a bad slug is refused", () => {
    const dir = join(tmp, "selected");
    for (const d of ["opex", "land-lease"]) { mkdirSync(join(dir, d), { recursive: true }); writeFileSync(join(dir, d, "manifest.ts"), "export {}"); }
    expect(() => selectedScreen({}, dir)).toThrow("set PARITY_SCREEN to one of: land-lease, opex");
    expect(() => selectedScreen({ PARITY_SCREEN: " " }, dir)).toThrow("set PARITY_SCREEN to one of: land-lease, opex");
    expect(selectedScreen({ PARITY_SCREEN: " opex " }, dir)).toBe("opex");
    expect(() => selectedScreen({ PARITY_SCREEN: "Land Lease" }, dir)).toThrow(/PARITY_SCREEN must be a lower-case slug/);
  });
});

describe("validateManifest", () => {
  it("UT-PHSCR-020 a minimal manifest passes and is returned as it is", () => {
    const m = minimal();
    expect(validateManifest("demo", m)).toBe(m);
  });

  it("UT-PHSCR-021 the slug must equal the folder, and every problem is named in one error", () => {
    const msg = problems(minimal({ slug: "other", title: "", messages: "x", visual: "none" }));
    expect(msg).toMatch(/^Manifest of screen "demo" \(e2e\/screens\/demo\/manifest\.ts\) is invalid:/);
    expect(msg).toContain('slug must equal its folder name "demo" (got "other")');
    expect(msg).toContain("title must be a non-empty string");
    expect(msg).toContain("messages must be an array of non-empty strings");
    expect(msg).toContain("visual must be an array");
  });

  it("UT-PHSCR-022 open: each app's required fields; codeRoute starts with /; custom needs open() and projectScoped", () => {
    expect(problems(minimal({ open: { app: "cost", codeRoute: "costs/x" } }))).toMatch(/open\.canvasMenu must be.*\n.*open\.codeRoute must start with "\/"/s);
    expect(problems(minimal({ open: { app: "pm", codeRoute: "/project/team" } }))).toContain("open.canvasScreen must be a non-empty string");
    expect(problems(minimal({ open: { app: "custom" } }))).toMatch(/open\.projectScoped.*open\.open must be a function/s);
    expect(problems(minimal({ open: { app: "web" } }))).toContain('open.app must be "cost", "pm", "admin" or "custom"');
  });

  it("UT-PHSCR-023 entry names: letters, digits, - and _ (a dot or bracket would break the KNOWN key), unique per layer", () => {
    const msg = problems(minimal({ visual: [{ name: "hover.rowTitle", steps: noop }, { name: "a", steps: noop }, { name: "a", steps: noop }] }));
    expect(msg).toContain('visual[0].name must be letters, digits, - or _ (got "hover.rowTitle")');
    expect(msg).toContain('visual: name "a" is used twice');
    expect(problems(minimal({ validation: [{ key: "euroMWh", field: "txt_X", baseline: noop, inputs: ["1", ""] }] }))).toBe("");
  });

  it("UT-PHSCR-024 functions are required where the harness calls them", () => {
    const msg = problems(minimal({
      visual: [{ name: "x" }], validation: [{ key: "g", field: "f", inputs: [] }], gates: [{ name: "s" }], ux: [{ name: "u" }],
      flows: [{ name: "f", steps: [{ name: "s1" }] }], tables: [{ name: "t", service: "S", serviceModule: "/src/x.ts", entitySet: "e", primaryKey: "id", deleteOrder: 1 }],
    }));
    for (const want of ["visual[0] (x).steps", "validation[0] (g).baseline", "gates[0] (s).steps", "ux[0] (u).run", "flows[0] (f).cleanup", "flows[0].steps[0] (s1).run"]) {
      expect(msg).toContain(`${want} must be a function`);
    }
  });

  it("UT-PHSCR-025 flows: step names unique across flows, and flows need tables", () => {
    const flow = (name: string, step: string) => ({ name, cleanup: noop, steps: [{ name: step, run: noop }] });
    const msg = problems(minimal({ flows: [flow("one", "create"), flow("two", "create")] }));
    expect(msg).toContain('step "create" is in "one" and "two"');
    expect(msg).toContain("flows need tables");
  });

  it("UT-PHSCR-026 tables: required fields, a dev-server module path, a known parent", () => {
    const msg = problems(minimal({ tables: [
      { name: "costs", service: "S", serviceModule: "src/generated/x.ts", entitySet: "e", primaryKey: "id", deleteOrder: 2 },
      { name: "periods", service: "S", serviceModule: "/src/x.ts", entitySet: "e2", primaryKey: "pid", deleteOrder: "1", parent: { table: "header", lookup: "_x_value" } },
    ] }));
    expect(msg).toContain("tables[0].serviceModule must be a dev-server path starting with /src/");
    expect(msg).toContain("tables[1].deleteOrder must be a number");
    expect(msg).toContain('tables: "periods" has parent "header", which is not in tables');
  });

  it("UT-PHSCR-027 lanes / budgets / ux lane / controls: only valid lanes for the right app and target", () => {
    const msg = problems(minimal({
      lanes: { visual: { canvas: "code-A", code: "code-A" }, flows: { canvas: "canvas-B", code: "write-code" }, rules: { canvas: "canvas-A", code: "code-A" } },
      budgets: { "canvas-Z": 5, "code-B": 0 }, ux: [{ name: "u", lane: "write-code", run: noop }],
      controls: { save: { canvas: "btn_Save" }, commands: { Edit: { canvas: "Edit", code: "edit", by: "text" } } },
    }));
    expect(msg).toContain('lanes.visual.canvas: lane "code-A" drives the other app');
    expect(msg).toContain('lanes.flows.canvas: a write layer needs a write lane (got "canvas-B")');
    expect(msg).toContain("lanes.rules: not a browser layer");
    expect(msg).toContain('budgets: unknown lane "canvas-Z"');
    expect(msg).toContain("budgets.code-B must be a positive number of minutes");
    expect(msg).toContain('ux[0].lane must be a read lane (got "write-code")');
    expect(msg).toContain("controls.save.code must be a non-empty string");
    expect(msg).toContain('controls.commands["Edit"].by must be "name" or "caption"');
  });

  it("UT-PHSCR-028 a manifest that is not an object", () => {
    expect(() => validateManifest("demo", null)).toThrow(/must be an object/);
  });

  const table = (over: Record<string, unknown> = {}) => ({ name: "costs", service: "S", serviceModule: "/src/x.ts", entitySet: "e", primaryKey: "id", deleteOrder: 1, ...over });
  const flow = { name: "f", cleanup: noop, steps: [{ name: "s1", run: noop }] };

  it("UT-PHSCR-029 flows need a root table (no parent) with a tagColumn; a child's tag column does not count", () => {
    const want = "flows need a root table (no `parent`) with a `tagColumn`";
    expect(problems(minimal({ flows: [flow], tables: [table()] }))).toContain(want);
    expect(problems(minimal({ flows: [flow], tables: [table(), table({ name: "kids", tagColumn: "vsb_name", parent: { table: "costs", lookup: "_x_value" } })] }))).toContain(want);
    expect(problems(minimal({ flows: [flow], tables: [table({ tagColumn: "vsb_name" })] }))).toBe("");
    // A read-only screen's tables need no tag column.
    expect(problems(minimal({ tables: [table()] }))).toBe("");
  });

  it("UT-PHSCR-049 a visual state's until: a ControlRef, checked like the controls", () => {
    expect(problems(minimal({ visual: [{ name: "panel", until: { canvas: "btn_Save", code: "save" }, steps: noop }] }))).toBe("");
    expect(problems(minimal({ visual: [{ name: "panel", until: "btn_Save", steps: noop }] }))).toContain("visual[0].until");
  });

  it("UT-PHSCR-034 the optional settings: codeMatch, sortKey, timeoutMin, validationWait, textWindow, smokeState", () => {
    expect(problems(minimal({
      controls: { restMarker: { canvas: "lbl_T", code: "card-", codeMatch: "prefix" } },
      tables: [table({ tagColumn: "vsb_name", sortKey: ["vsb_name", "_x_value@name"] })],
      flows: [{ ...flow, timeoutMin: 45 }], validationWait: { canvas: "settle" }, textWindow: { minX: 0, minY: 60 }, smokeState: "default",
    }))).toBe("");
    const msg = problems(minimal({
      controls: { restMarker: { canvas: "lbl_T", code: "card-", codeMatch: "start" } },
      tables: [table({ tagColumn: "vsb_name", sortKey: [] })], flows: [{ ...flow, timeoutMin: 0 }],
      validationWait: "fast", textWindow: { minX: -1 }, smokeState: "nowhere",
    }));
    for (const want of [
      'controls.restMarker.codeMatch must be "exact" or "prefix"', "tables[0].sortKey must be a non-empty array of column names",
      "flows[0].timeoutMin must be a positive number of minutes", 'validationWait must be "settle" | "stable" | "outcome"',
      "textWindow must be { minX, minY }", 'smokeState must name a visual state (got "nowhere")',
    ]) expect(msg).toContain(want);
    expect(problems(minimal({ validationWait: { canvas: "stable", phone: "settle" } }))).toContain("validationWait must be");
  });
});

describe("common artefacts", () => {
  const rule = (id: string) => COMMON_ARTEFACTS.find((r) => r.id === id)!;
  const d = (key: string) => ({ key, layer: "visual" as const, canvas: null, code: null });

  it("UT-PHSCR-030 visualKeyParts: text and property from the visual key form, quotes and brackets kept", () => {
    expect(visualKeyParts('visual.card-open["Add Period"].fontSize')).toEqual({ text: "Add Period", property: "fontSize" });
    expect(visualKeyParts('visual.s["a \\"b\\"].c"].x#2')).toEqual({ text: 'a "b"].c', property: "x" });
    expect(visualKeyParts('gates.s["Edit"].enabled')).toBeNull();
  });

  it("UT-PHSCR-031 common-glyph: icon-font and empty texts, never a real word", () => {
    expect(rule("common-glyph").test(d('visual.s[""].missing'))).toBe(true);
    expect(rule("common-glyph").test(d('visual.s[" ​ "].x'))).toBe(true);
    expect(rule("common-glyph").test(d('visual.s["Edit "].missing'))).toBe(false);
    expect(rule("common-glyph").test(d('validation.g[""].messages'))).toBe(false);
  });

  it("UT-PHSCR-032 common-asterisk: a '*' missing, extra or moved; not its style, not another text", () => {
    const r = rule("common-asterisk");
    for (const p of ["missing", "extra", "x", "y#3"]) expect(r.test(d(`visual.s["*"].${p}`))).toBe(true);
    expect(r.test(d('visual.s["*"].color'))).toBe(false);
    expect(r.test(d('visual.s["**"].missing'))).toBe(false);
    expect(r.test(d('visual.s["Name *"].missing'))).toBe(false);
  });
});

describe("opening and data (pure parts)", () => {
  it("UT-PHSCR-040 PM: the left-menu caption from the screen name (App.pa.yaml), or the caption as given; the hash route", () => {
    expect(pmMenuLabel("Project General Milestones Screen")).toBe("Milestones");
    expect(pmMenuLabel("Project General Team Screen")).toBe("Project Team");
    expect(pmMenuLabel("Planning")).toBe("Planning");
    expect(pmCodeHash("/project/team", "00000000-0000-4000-8000-000000000001")).toBe("#/project/team?projectId=00000000-0000-4000-8000-000000000001");
  });

  it("UT-PHSCR-041 isProjectScoped / refreshKeepsScreen per app shape", () => {
    const open = (o: unknown) => asManifest(minimal({ open: o }));
    expect(isProjectScoped(open({ app: "cost", canvasMenu: "x", codeRoute: "/costs/x" }))).toBe(true);
    expect(isProjectScoped(open({ app: "admin", leftMenuLabel: "x", codeRoute: "/admin/x" }))).toBe(false);
    expect(isProjectScoped(open({ app: "custom", projectScoped: false, open: noop }))).toBe(false);
    expect(refreshKeepsScreen({ app: "cost", canvasMenu: "x", codeRoute: "/costs/x" })).toBe(true);
    expect(refreshKeepsScreen({ app: "pm", canvasScreen: "General", codeRoute: "/project/general" })).toBe(true);
    expect(refreshKeepsScreen({ app: "pm", canvasScreen: "Planning", codeRoute: "/project/planning" })).toBe(false);
    expect(refreshKeepsScreen({ app: "admin", leftMenuLabel: "x", codeRoute: "/admin/x" })).toBe(false);
  });

  it("UT-PHSCR-042 runTag: PW-<run>-<cv|ca>-<flow>, unsafe characters made '-'; assertTag refuses anything else", () => {
    expect(runTag("20261103-1712", "canvas", "S1 create")).toBe("PW-20261103-1712-cv-S1-create");
    expect(runTag("run_1.2", "code", "f/x")).toBe("PW-run-1-2-ca-f-x");
    expect(() => assertTag("Lease A")).toThrow(/PW- run tag/);
    expect(() => assertTag("PW-x'or'1")).toThrow(/PW- run tag/);
  });

  it("UT-PHSCR-047 runTag: the two apps' tags have the same length (a derived or cut column still compares once masked)", () => {
    expect(KIND_CODE).toEqual({ canvas: "cv", code: "ca" });
    for (const flow of ["contract", "periods", "S1 create"]) {
      expect(runTag("20261103-1712", "canvas", flow).length).toBe(runTag("20261103-1712", "code", flow).length);
    }
    // A column cut to 20 characters, then masked: equal in both apps only because the tags are equally long.
    const cut = (kind: "canvas" | "code") => { const tag = runTag("20261103-1712", kind, "periods"); return `${tag} Lease`.slice(0, 30).split(tag).join("<tag>"); };
    expect(cut("canvas")).toBe(cut("code"));
  });

  const T = (name: string, deleteOrder: number, parent?: string): TableSpec => ({
    name, service: "S", serviceModule: "/src/x.ts", entitySet: name, primaryKey: `${name}id`, deleteOrder,
    ...(parent ? { parent: { table: parent, lookup: `_${parent}_value` } } : {}),
  });

  it("UT-PHSCR-043 readOrder: parents before children at any depth; a missing parent or a cycle is named", () => {
    expect(readOrder([T("alloc", 1, "period"), T("period", 2, "cost"), T("cost", 3)]).map((t) => t.name)).toEqual(["cost", "period", "alloc"]);
    expect(() => readOrder([T("a", 1, "zz")])).toThrow(/a -> zz/);
    expect(() => readOrder([T("a", 1, "b"), T("b", 1, "a")])).toThrow(/cycle among a, b/);
  });

  it("UT-PHSCR-044 deleteOrder: lowest first, ties in manifest order", () => {
    expect(deleteOrder([T("cost", 3), T("period", 2, "cost"), T("alloc", 1, "cost"), T("note", 1, "cost")]).map((t) => t.name)).toEqual(["alloc", "note", "period", "cost"]);
  });

  it("UT-PHSCR-045 normaliseRows: ids, stamps, owners and the tag masked; the owning BU and lookup names kept; rows sorted", () => {
    const tag = "PW-20261103-1712-code-f1";
    const g = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
    const rows = [
      { vsb_costid: g(1), vsb_name: `${tag} B`, _vsb_project_value: g(2), "_vsb_project_value@OData.Community.Display.V1.FormattedValue": "Wind A",
        _vsb_subaccount_value: g(3), "_vsb_subaccount_value@OData.Community.Display.V1.FormattedValue": "Lease", _owningbusinessunit_value: g(4),
        _ownerid_value: g(5), createdon: "2026-11-03T10:00:00Z", modifiedon: "x", versionnumber: 9, "@odata.etag": "W/1", vsb_amount: 12.5, vsb_note: null },
      { vsb_costid: g(6), vsb_name: `${tag} A`, _vsb_project_value: null, _vsb_subaccount_value: null, vsb_amount: 1, vsb_seq: "PRJ-1" },
    ];
    const out = normaliseRows(rows, { primaryKey: "vsb_costid", projectLookup: "_vsb_project_value", ignoreColumns: ["vsb_seq"] }, tag);
    // Sorted by the normalised row's JSON: `{"_owningbusinessunit_value"…` sorts before `{"_vsb_project_value"…`.
    expect(out).toEqual([
      { _owningbusinessunit_value: "<guid>", _vsb_project_value: "<project>", _vsb_subaccount_value: "<guid>", "_vsb_subaccount_value@name": "Lease",
        vsb_amount: 12.5, vsb_name: "<tag> B", vsb_note: null },
      { _vsb_project_value: null, _vsb_subaccount_value: null, vsb_amount: 1, vsb_name: "<tag> A" },
    ]);
    expect(Object.keys(out[0]!)).toEqual([...Object.keys(out[0]!)].sort());
  });

  it("UT-PHSCR-046 normaliseRows: sortKey orders by the normalised columns (numbers numerically, null first), then by JSON", () => {
    const g = "00000000-0000-4000-8000-000000000001";
    const N = "@OData.Community.Display.V1.FormattedValue";
    const periods = [
      { pid: g, vsb_period: 100000002, vsb_name: "c" }, { pid: g, vsb_period: 100000000, vsb_name: "b" },
      { pid: g, vsb_period: 100000000, vsb_name: "a" }, { pid: g, vsb_period: null, vsb_name: "z" },
    ];
    expect(normaliseRows(periods, { primaryKey: "pid", sortKey: ["vsb_period", "vsb_name"] }, "").map((r) => r.vsb_name)).toEqual(["z", "a", "b", "c"]);
    // A lookup's GUID is masked, so the allocations sort by the generator's name (`_x_value@name`), not by the masked id.
    const allocations = [
      { aid: g, _gen_value: g, [`_gen_value${N}`]: "WTG 2" }, { aid: g, _gen_value: g, [`_gen_value${N}`]: "WTG 10" },
      { aid: g, _gen_value: g, [`_gen_value${N}`]: "PV 1" },
    ];
    expect(normaliseRows(allocations, { primaryKey: "aid", sortKey: ["_gen_value@name"] }, "").map((r) => r["_gen_value@name"])).toEqual(["PV 1", "WTG 10", "WTG 2"]);
    // Without a sortKey: the JSON order, as before.
    expect(normaliseRows([{ id: g, b: 1 }, { id: g, a: 2 }], { primaryKey: "id" }, "")).toEqual([{ a: 2 }, { b: 1 }]);
    expect([compareCells(undefined, 0), compareCells(2, 10), compareCells(true, "x"), compareCells("b", "a")].map(Math.sign)).toEqual([-1, -1, -1, 1]);
  });

  it("UT-PHSCR-048 rowsWithoutBu: every table's rows, absolute (one line per table with a row lacking the Owning Business Unit)", () => {
    const bu = { _owningbusinessunit_value: "00000000-0000-4000-8000-000000000009" };
    expect(rowsWithoutBu({ costs: [bu], periods: [bu, {}, { _owningbusinessunit_value: null }], allocations: [] }))
      .toEqual(["periods: 2 row(s) without an Owning Business Unit"]);
    expect(rowsWithoutBu({ costs: [bu], periods: [] })).toEqual([]);
  });
});
