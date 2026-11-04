/**
 * UT-GENPARITY — the parity manifest generator (`scripts/gen-parity-manifest.mjs`, D80 plan section 6) and the shared
 * canvas YAML reader it uses (`scripts/lib/paYaml.mjs`).
 *
 * Runs on a small inline `.pa.yaml` fixture with a hand-made context (no disk), so every rule is pinned on known input:
 * controls, a commented-out formula skipped (CONVENTIONS rule 10), an error label tied to its input, AccessibleLabel
 * verbatim, a Patch target table resolved to its logical name, entity set and generated service.
 * The last case reads the real Land Lease canvas source and is skipped when `ProjectDocs/_extracted` is not on disk.
 */
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type * as TS from "typescript";
import { describe, expect, it } from "vitest";
import {
  PROBE_INPUTS, buildManifestDraft, buildRuleMap, canvasNavFrom, codeNavFrom, extractScreen, kebab, resolveOpen, resolveTables,
  testIdsIn, type GenContext,
} from "../../scripts/gen-parity-manifest.mjs";

/** The compiler, loaded as the scripts load it (a CommonJS package). */
const ts = createRequire(import.meta.url)("typescript") as typeof TS;

const FIXTURE = [
  "Screens:",
  "  Demo Screen:",
  "    Properties:",
  "      OnVisible: =ClearCollect(colRows, Filter('Demo Rows', Project.Project = gblSelectedProject.Project))",
  "    Children:",
  "      - con_Demo_RightPanel_Edit:",
  "          Control: GroupContainer@1.5.0",
  "          Variant: ManualLayout",
  "          Properties:",
  "            Visible: =locShowPanel",
  "          Children:",
  "            - txt_Demo_RightPanel_Edit_Amount_1:",
  "                Control: TextInput@0.0.54",
  "                Properties:",
  '                  AccessibleLabel: ="Amount ""net"""',
  '                  Tooltip: ="Type the amount"',
  "                  DisplayMode: |-",
  "                    =/*If(locLocked, DisplayMode.View, DisplayMode.Edit)*/",
  "                    If(locReadOnly, DisplayMode.Disabled, DisplayMode.Edit)",
  "            - lbl_Demo_RightPanel_Edit_Amount_ErrorMessage_1:",
  "                Control: Label@2.5.1",
  "                Properties:",
  "                  Text: |-",
  '                    =/*"Old message that is commented out"*/',
  '                    If(IsBlank(Self.Text), "Value must be a number", $"Max {locMax}")',
  '                  Visible: "=// old: true\\nNot(IsNumeric(txt_Demo_RightPanel_Edit_Amount_1.Value))"',
  "            - btn_Demo_RightPanel_Edit_Save_1:",
  "                Control: Button@0.0.45",
  "                Properties:",
  '                  Text: ="Save"',
  "                  OnSelect: |-",
  "                    =Patch('Demo Rows', Defaults('Demo Rows'), {Amount: Value(txt_Demo_RightPanel_Edit_Amount_1.Value), 'Row Name': \"a, b\"});",
  '                    // Patch(\'Old Rows\', Defaults(\'Old Rows\'), {Amount: 1});',
  '                    Notify("Saved.", NotificationType.Success)',
  "            - btn_Demo_RightPanel_Edit_Cancel_1:",
  "                Control: Button@0.0.45",
  "                Properties:",
  '                  Text: ="Cancel"',
  "      - pcf_Demo_CommandBar:",
  "          Control: CodeComponent",
  "          ComponentName: cat_PowerCAT.CommandBar",
  "          Properties:",
  "            Items: |-",
  "              =Table(",
  '                  {ItemKey: "addKey", ItemDisplayName: "Add", ItemEnabled: true},',
  '                  {ItemKey: "editKey", ItemDisplayName: "Edit", ItemEnabled: Not(IsBlank(locSelectedRow))}',
  "              )",
  '            OnSelect: =Switch(Self.Selected.ItemKey, "editKey", UpdateContext({locShowPanel: true}))',
  "      - gal_Demo_Rows:",
  "          Control: Gallery@2.15.0",
  "          Properties:",
  "            Items: =colRows",
  "      - cmp_Demo_PopUpConfirmation_Delete:",
  "          Control: CanvasComponent",
  "          ComponentName: cmp_PopUp_Confirmation",
  "          Properties:",
  '            Title: ="Delete Row?"',
  "            OnConfirm: =Remove('Demo Rows', locSelectedRow)",
  "",
].join("\n");

const CTX: GenContext = {
  app: "projectcosts",
  dataSources: new Map([["Demo Rows", { logicalName: "vsb_demorow", entitySet: "vsb_demorows" }]]),
  entities: new Map([["vsb_demorow", { primaryIdAttribute: "vsb_demorowid" }]]),
  attributes: new Map([["vsb_demorow", {
    vsb_amount: { displayName: "Amount", type: "decimal" },
    vsb_rowname: { displayName: "Row Name", type: "nvarchar" },
    vsb_name: { displayName: "Name", type: "nvarchar" },
    vsb_project: { displayName: "Project", type: "lookup" },
  }]]),
  services: new Map([["vsb_demorows", { service: "Vsb_demorowsService", module: "/src/generated/services/Vsb_demorowsService.ts" }]]),
  canvasNav: [{ menu: "LeftNavigationMenu", key: "DemoKey", caption: " Demo", target: "Demo Screen" }],
  codeNav: new Map([["DemoKey", "/costs/demo"]]),
  fragments: ["src/features/cost/demo/"],
  codeFiles: ["src/features/cost/demo/Screen.tsx"],
  codeIds: new Set(["txt_Demo_RightPanel_Edit_Amount_1", "btn_Demo_RightPanel_Edit_Save_1"]),
};
const OPTS = { slug: "demo", title: "Demo", yaml: "Demo Screen.pa.yaml", canvasVersion: "1.21.709", date: "2026-11-03" };

describe("UT-GENPARITY — canvas YAML to a parity manifest draft", () => {
  const model = extractScreen(FIXTURE);

  it("UT-GENPARITY-001 reads every control with its type and parent", () => {
    expect(model.screenName).toBe("Demo Screen");
    expect(model.controls.map((c) => c.name)).toEqual([
      "con_Demo_RightPanel_Edit", "txt_Demo_RightPanel_Edit_Amount_1", "lbl_Demo_RightPanel_Edit_Amount_ErrorMessage_1",
      "btn_Demo_RightPanel_Edit_Save_1", "btn_Demo_RightPanel_Edit_Cancel_1", "pcf_Demo_CommandBar", "gal_Demo_Rows",
      "cmp_Demo_PopUpConfirmation_Delete",
    ]);
    const txt = model.controls.find((c) => c.name === "txt_Demo_RightPanel_Edit_Amount_1");
    expect(txt).toMatchObject({ type: "TextInput@0.0.54", family: "input", parent: "con_Demo_RightPanel_Edit", tooltip: "Type the amount" });
    expect(model.controls.find((c) => c.name === "pcf_Demo_CommandBar")?.family).toBe("commandbar");
    expect(model.controls.find((c) => c.name === "cmp_Demo_PopUpConfirmation_Delete")?.family).toBe("dialog");
  });

  it("UT-GENPARITY-002 skips commented-out formulas: the live DisplayMode, Text and Visible only", () => {
    const txt = model.controls.find((c) => c.name === "txt_Demo_RightPanel_Edit_Amount_1");
    expect(txt?.displayMode).toBe("If(locReadOnly, DisplayMode.Disabled, DisplayMode.Edit)");
    const err = model.errorLabels[0];
    expect(err?.messages).not.toContain("Old message that is commented out");
    // A double-quoted YAML value is decoded (\n) before its `//` comment is removed.
    expect(err?.visible).toBe("Not(IsNumeric(txt_Demo_RightPanel_Edit_Amount_1.Value))");
    // The commented-out Patch to 'Old Rows' is not a write.
    expect(model.writes.map((w) => w.target)).not.toContain("Old Rows");
  });

  it("UT-GENPARITY-003 ties the *_ErrorMessage_* label to its input, with the verbatim texts", () => {
    expect(model.errorLabels).toHaveLength(1);
    expect(model.errorLabels[0]).toMatchObject({
      name: "lbl_Demo_RightPanel_Edit_Amount_ErrorMessage_1", input: "txt_Demo_RightPanel_Edit_Amount_1",
      messages: ["Value must be a number"], templates: ["Max {…}"],
    });
    expect(model.inputs[0]?.errorLabels).toEqual(["lbl_Demo_RightPanel_Edit_Amount_ErrorMessage_1"]);
    expect(model.messages.map((m) => m.text)).toEqual(["Value must be a number", "Saved."]);
  });

  it("UT-GENPARITY-004 keeps a literal AccessibleLabel verbatim (\"\" unescaped)", () => {
    expect(model.accessible).toEqual([{ name: "txt_Demo_RightPanel_Edit_Amount_1", line: 15, label: 'Amount "net"', formula: null }]);
  });

  it("UT-GENPARITY-005 resolves the Patch / Remove target to its table, entity set and generated service", () => {
    const { tables, collections } = resolveTables(model, CTX);
    expect(tables).toHaveLength(1);
    const t = tables[0]!;
    expect(t).toMatchObject({
      display: "Demo Rows", name: "demo-rows", logicalName: "vsb_demorow", entitySet: "vsb_demorows", primaryKey: "vsb_demorowid",
      service: "Vsb_demorowsService", serviceModule: "/src/generated/services/Vsb_demorowsService.ts",
      projectLookup: "_vsb_project_value", parent: null, deleteOrder: 1,
    });
    expect([...t.ops].sort()).toEqual(["Patch", "Remove"]);
    expect(Object.fromEntries([...t.columns].map(([k, v]) => [k, v?.logical]))).toEqual({ Amount: "vsb_amount", "Row Name": "vsb_rowname" });
    expect(collections).toEqual(["colRows"]);
  });

  it("UT-GENPARITY-006 reads the command bar's captions and gates; a gate on a selection gets its own state", () => {
    expect(model.commandBars[0]?.items).toEqual([
      { key: "addKey", caption: "Add", captionIsFormula: false, enabled: "true", visible: "" },
      { key: "editKey", caption: "Edit", captionIsFormula: false, enabled: "Not(IsBlank(locSelectedRow))", visible: "" },
    ]);
    const draft = buildManifestDraft(model, CTX, OPTS);
    expect(draft).toContain('"Add": { canvas: "Add", code: "Add", by: "caption" }');
    expect(draft).toContain('{ name: "rest", steps: atRest }');
    expect(draft).toContain('{ name: "select-for-edit", steps: todo(');
    expect(draft).not.toContain('"select-for-add"');
  });

  it("UT-GENPARITY-007 guesses the OpenSpec from the left menu and the code app's nav item", () => {
    expect(resolveOpen(model, CTX).spec).toEqual({ app: "cost", canvasMenu: "Demo", codeRoute: "/costs/demo" });
    const pm = resolveOpen(model, { ...CTX, app: "projectmanagement" }).spec;
    expect(pm).toEqual({ app: "pm", canvasScreen: "Demo Screen", codeRoute: "/costs/demo" });
    const admin = resolveOpen(model, { ...CTX, app: "projectmanagement", canvasNav: [{ ...CTX.canvasNav[0]!, menu: "LeftAdminNavigationMenu" }] }).spec;
    expect(admin).toEqual({ app: "admin", leftMenuLabel: "Demo", codeRoute: "/costs/demo" });
    expect(resolveOpen(model, { ...CTX, canvasNav: [] }).spec).toEqual({ app: "cost", canvasMenu: "TODO", codeRoute: "TODO" });
  });

  it("UT-GENPARITY-008 writes a draft that parses as TypeScript, with the screen's pieces in place", () => {
    const draft = buildManifestDraft(model, CTX, OPTS);
    const sf = ts.createSourceFile("manifest.draft.ts", draft, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const diags = (sf as unknown as { parseDiagnostics: TS.Diagnostic[] }).parseDiagnostics;
    expect(diags.map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"))).toEqual([]);
    expect(draft).toContain('export const manifest: ScreenManifest = {');
    expect(draft).toContain('open: { app: "cost", canvasMenu: "Demo", codeRoute: "/costs/demo" }');
    expect(draft).toContain('save: { canvas: "btn_Demo_RightPanel_Edit_Save_1", code: "btn_Demo_RightPanel_Edit_Save_1" }');
    // Cancel has no data-testid in the feature folder: flagged.
    expect(draft).toMatch(/cancel: \{ canvas: "btn_Demo_RightPanel_Edit_Cancel_1", code: "btn_Demo_RightPanel_Edit_Cancel_1" \}, \/\/ TODO/);
    expect(draft).toContain('{ key: "amount", field: "txt_Demo_RightPanel_Edit_Amount_1", baseline: todo(');
    expect(draft).toContain(`const PROBES = ${JSON.stringify(PROBE_INPUTS)};`);
    expect(draft).toContain('{ name: "panel-edit", steps: todo(');
    expect(draft).toContain('{ name: "dialog-delete", steps: todo(');
    expect(draft).toContain('"Value must be a number", //');
    expect(draft).toContain('entitySet: "vsb_demorows"');
    expect(draft).toContain('["txt_Demo_RightPanel_Edit_Amount_1", "txt_Demo_RightPanel_Edit_Amount_1", "Amount \\"net\\""]');
    expect(draft).toMatch(/flows: \[\],\s+known: \{\},\s+artefacts: \[\],\s+budgets: \{\},\s+mutations,/);
  });

  it("UT-GENPARITY-009 writes the rule map rows with live formulas and TODO code columns", () => {
    const md = buildRuleMap(model, CTX, OPTS);
    expect(md).toContain("# Rule map draft: Demo (Power Fx vs code app TypeScript)");
    expect(md).toContain("| C1 | `lbl_Demo_RightPanel_Edit_Amount_ErrorMessage_1.Visible`");
    expect(md).toContain("`Not(IsNumeric(txt_Demo_RightPanel_Edit_Amount_1.Value))` | TODO | TODO | TODO | TODO");
    expect(md).toContain("`vsb_demorow` / `vsb_demorows` / `Vsb_demorowsService`; columns: Amount = vsb_amount, Row Name = vsb_rowname");
    expect(md).not.toContain("Old message that is commented out");
    expect(md).not.toContain("Old Rows");
  });

  it("UT-GENPARITY-010 reads the canvas and code app nav tables and the code app's test ids", () => {
    const app = [
      "App:",
      "  Properties:",
      "    Formulas: |-",
      "      =LeftNavigationMenu = Table(",
      '          {ItemKey: "AKey", ItemDisplayName: " A", TargetScreen: \'A Screen\'},',
      '          {ItemKey: "BKey", ItemDisplayName: "B"}',
      "          /*,{ItemKey: \"CKey\", ItemDisplayName: \"C\", TargetScreen: 'C Screen'}*/",
      "      );",
    ].join("\n");
    expect(canvasNavFrom(app)).toEqual([
      { menu: "LeftNavigationMenu", key: "AKey", caption: " A", target: "A Screen" },
      { menu: "LeftNavigationMenu", key: "BKey", caption: "B", target: null },
    ]);
    const nav = 'export const NAV_ITEMS = [\n  { key: "AKey", label: "A", path: "/a" },\n  { key: "BKey", label: "B" },\n  { key: "CKey", path: "/c" },\n];';
    expect([...codeNavFrom(nav)]).toEqual([["AKey", "/a"], ["CKey", "/c"]]);
    const ids = testIdsIn(['<Button data-testid="btn_X_1" /> <CostField name="txt_Y_1" /> <tr data-testid={`row-${r.id}`} /> <PanelButtons saveTestId="pcf_S_1" />']);
    expect([...ids].sort()).toEqual(["btn_X_1", "pcf_S_1", "row", "txt_Y_1"]);
    expect(kebab("NewEditPeriod")).toBe("new-edit-period");
    expect(kebab("EuroWTG")).toBe("euro-wtg");
    expect(kebab("EuroMWh")).toBe("euro-mwh");
  });

  const landLease = path.resolve(__dirname, "../../../ProjectDocs/_extracted/msapp/projectcosts/Src/Land Lease Costs Screen.pa.yaml");
  it.skipIf(!fs.existsSync(landLease))("UT-GENPARITY-011 reads the real Land Lease screen: error labels, messages, commands, writes", () => {
    const ll = extractScreen(fs.readFileSync(landLease, "utf8"));
    expect(ll.screenName).toBe("Land Lease Costs Screen");
    expect(ll.controlCount).toBe(201);
    expect(ll.errorLabels.every((e) => e.input !== null)).toBe(true);
    expect(ll.messages.map((m) => m.text)).toEqual(expect.arrayContaining([
      "Due Date must be in format MM/YYYY.", 'The term "Standard" is applicable only for system-prefilled contracts.', "Value must be a number",
    ]));
    expect(ll.commandBars[0]?.items.map((i) => i.caption)).toEqual(["Add Contract Type", "Add Period", "Add Standard Contract", "Edit", "Delete"]);
    expect([...new Set(ll.writes.map((w) => w.target))].filter((t) => !t.startsWith("col")).sort()).toEqual([
      "Land Lease Allocation WTGS", "Land Lease Periods", "Land Lease Project Costs",
    ]);
    expect(ll.accessible.find((a) => a.name === "drp_LandLease_RightPanel_NewEditPeriod_BodyContent_DurationYears_1")?.label).toBe("Year");
  });
});
