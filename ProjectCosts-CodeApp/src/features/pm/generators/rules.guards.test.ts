/**
 * UT-GEN-1212.. — the pure rules of the Generators review fixes F1, F3, F5, F6, F7 and F9 (D121). The Screen
 * behaviour they drive is in `Screen.guards.test.tsx`; the read functions are in `data/generators.reads.test.ts`.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CHOICE_PLANT } from "@/data/dataverseNames";
import type { WritePlan } from "@/data/writePlan";
import * as R from "./rules";
import { P, costs, genType, model, simple, turbine } from "./bulkPlans.testkit";

const NO_BU = { ...P, owningBusinessUnitId: null };

describe("F1 — the O&M dependency read must be known before Delete / Deactivate may open", () => {
  it("UT-GEN-1212 opexReadState: nothing selected is none; an answer is known even after a failed refresh; else failed beats checking", () => {
    expect(R.opexReadState({ needed: false, known: false, failed: true })).toBe("none");
    expect(R.opexReadState({ needed: true, known: true, failed: true })).toBe("known");
    expect(R.opexReadState({ needed: true, known: false, failed: true })).toBe("failed");
    expect(R.opexReadState({ needed: true, known: false, failed: false })).toBe("checking");
  });

  it("UT-GEN-1213 opexGuardBlock blocks only the three guarded commands, per family, while the read is checking or failed", () => {
    const reads = (wtg: R.OpexReadState, pv: R.OpexReadState) => ({ wtg, pv });
    expect(R.OPEX_GUARDED_COMMANDS).toEqual(["deleteGeneratorType", "deactivateGenerator", "deletePVModuleType"]);
    expect(R.opexGuardBlock("deleteGeneratorType", reads("checking", "known"))).toBe(R.GUARD_READ_MSG.opexChecking);
    expect(R.opexGuardBlock("deactivateGenerator", reads("failed", "known"))).toBe(R.GUARD_READ_MSG.opexFailed);
    expect(R.opexGuardBlock("deletePVModuleType", reads("known", "checking"))).toBe(R.GUARD_READ_MSG.opexChecking);
    expect(R.opexGuardBlock("deletePVModuleType", reads("failed", "known"))).toBeNull();
    expect(R.opexGuardBlock("deleteGeneratorType", reads("known", "known"))).toBeNull();
    expect(R.opexGuardBlock("deleteGeneratorType", reads("none", "none"))).toBeNull();
    // Every other command is never held back by the O&M read.
    for (const key of R.GENERATOR_COMMAND_KEYS.filter((k) => !R.OPEX_GUARDED_COMMANDS.includes(k))) {
      expect(R.opexGuardBlock(key, reads("failed", "failed"))).toBeNull();
    }
  });

  it("UT-GEN-1214 opexReadBanner shows the failure text for either selected family, else nothing", () => {
    expect(R.opexReadBanner({ wtg: "failed", pv: "none" })).toBe(R.GUARD_READ_MSG.opexFailed);
    expect(R.opexReadBanner({ wtg: "none", pv: "failed" })).toBe(R.GUARD_READ_MSG.opexFailed);
    expect(R.opexReadBanner({ wtg: "checking", pv: "known" })).toBeNull();
  });
});

describe("F3 and F7 — settling reads and failed refreshes", () => {
  it("UT-GEN-1215 dataSettling: any read still loading, or still showing the previous key's data, holds the writes", () => {
    expect(R.dataSettling([])).toBe(false);
    expect(R.dataSettling([{ loading: false }, { loading: false, placeholder: false }])).toBe(false);
    expect(R.dataSettling([{ loading: true }])).toBe(true);
    expect(R.dataSettling([{ loading: false, placeholder: true }])).toBe(true);
  });

  it("UT-GEN-1216 loadErrorMode: no error is none; an error with NO data blocks; errors that all still have data are a banner; no hasData counts as no data", () => {
    expect(R.loadErrorMode([{ error: undefined, hasData: false }])).toBe("none");
    expect(R.loadErrorMode([{ error: new Error("x"), hasData: false }])).toBe("blocking");
    expect(R.loadErrorMode([{ error: new Error("x") }])).toBe("blocking");
    expect(R.loadErrorMode([{ error: new Error("x"), hasData: true }, { error: undefined }])).toBe("banner");
    expect(R.loadErrorMode([{ error: new Error("x"), hasData: true }, { error: new Error("y"), hasData: false }])).toBe("blocking");
  });
});

describe("F5 — the text limits are the Dataverse ones", () => {
  const schema = (table: string): Record<string, { maxLength?: number }> =>
    (JSON.parse(readFileSync(`.power/schemas/dataverse/${table}.Schema.json`, "utf-8")) as
      { schema: { items: { properties: Record<string, { maxLength?: number }> } } }).schema.items.properties;

  it("UT-GEN-1217 the constants equal the schema's maxLength (PV label and other supplier; BESS / Hydrogen / Substation name and supplier)", () => {
    const pv = schema("pvmoduletypeinprojects");
    expect(R.PV_MODULE_LABEL_MAX_LENGTH).toBe(pv.vsb_label!.maxLength);
    expect(R.PV_MODULE_LABEL_MAX_LENGTH).toBe(pv.vsb_othersupplier!.maxLength);
    for (const table of ["storagetypeinprojects", "hydrogentypeinprojects", "substationtypeinprojects"]) {
      expect(R.SIMPLE_TEXT_MAX_LENGTH).toBe(schema(table).vsb_name!.maxLength);
      expect(R.SIMPLE_TEXT_MAX_LENGTH).toBe(schema(table).vsb_supplier!.maxLength);
    }
    // The canvas twin keeps the number the canvas boxes accepted.
    expect(R.PV_MODULE_LABEL_MAX_LENGTH_CANVAS).toBe(512);
  });

  const pvForm = (over: Partial<R.PvTypeFormState> = {}): R.PvTypeFormState => ({
    moduleLabel: "JA 550", capacity: "10", supplier: "m1", otherSupplier: "", degradation1stYear: "", degradationRemainingYears: "",
    dirty: new Set<string>(), ...over,
  });

  it("UT-GEN-1218 a PV label or Other Supplier over the limit has an error and cannot be saved; at the limit it can", () => {
    const max = R.PV_MODULE_LABEL_MAX_LENGTH;
    const ok = pvForm({ moduleLabel: "x".repeat(max) });
    expect(R.validatePvTypeForm(ok, { otherSupplierChosen: false }).moduleLabel).toBeNull();
    expect(R.canSavePvType(R.validatePvTypeForm(ok, { otherSupplierChosen: false }), ok, { otherSupplierChosen: false })).toBe(true);
    const long = pvForm({ moduleLabel: "x".repeat(max + 1) });
    const errors = R.validatePvTypeForm(long, { otherSupplierChosen: false });
    expect(errors.moduleLabel).toBe(R.textTooLongMessage(max));
    expect(R.canSavePvType(errors, long, { otherSupplierChosen: false })).toBe(false);
    const other = pvForm({ otherSupplier: "y".repeat(max + 1) });
    expect(R.validatePvTypeForm(other, { otherSupplierChosen: true }).otherSupplier).toBe(R.textTooLongMessage(max));
    // A hidden Other Supplier box is not validated.
    expect(R.validatePvTypeForm(other, { otherSupplierChosen: false }).otherSupplier).toBeNull();
    expect(R.textTooLongMessage(100)).toBe("Please enter at most 100 characters.");
  });

  it("UT-GEN-1219 BESS / Hydrogen / Substation: a name or supplier over the limit blocks Save; Replace PV uses the same PV gate", () => {
    const max = R.SIMPLE_TEXT_MAX_LENGTH;
    const form = (over: Partial<R.SimpleFormState>): R.SimpleFormState =>
      ({ label: "B", capacity: "10", energyCapacity: "20", supplier: "T", dirty: new Set(["label"]), ...over });
    for (const family of ["storage", "hydrogen", "substation"] as const) {
      expect(R.canSaveSimple(family, form({ label: "x".repeat(max) }))).toBe(true);
      expect(R.canSaveSimple(family, form({ label: "x".repeat(max + 1) }))).toBe(false);
      expect(R.canSaveSimple(family, form({ supplier: "y".repeat(max + 1) }))).toBe(false);
      expect(R.validateSimpleForm(family, form({ label: "x".repeat(max + 1) })).label).toBe(R.textTooLongMessage(max));
      expect(R.validateSimpleForm(family, form({ supplier: "y".repeat(max + 1) })).supplier).toBe(R.textTooLongMessage(max));
    }
    // The Replace PV panel's gate (`replacePvOk`) is `canSavePvType(validatePvTypeForm(...))`: the same limit stops it.
    const replaceForm = pvForm({ moduleLabel: "x".repeat(R.PV_MODULE_LABEL_MAX_LENGTH + 1), dirty: new Set(["moduleLabel"]) });
    expect(R.canSavePvType(R.validatePvTypeForm(replaceForm, { otherSupplierChosen: false }), replaceForm, { otherSupplierChosen: false })).toBe(false);
  });
});

describe("F6 — a create without the project's owning business unit is refused, nothing sent", () => {
  const typeArgs = {
    inCountry: true, model: model({ specificCapacity: 5.6, hubHeight: 148, rotorDiameter: 150 }), numberOfGenerators: 2, costPerWtg: 900_000,
    selectedHeight: 150, revisedHubHeight: null, existingTypes: [], projectTurbines: [],
  };
  const inverterForm: R.InverterFormState = {
    label: "INV A", supplierId: "s", otherSupplier: "", inverterTypes: [952850000], warranty: "20", numberOfInverters: "10",
    nominalPower: "250", dirty: new Set(["label"]),
  };
  const substructureForm: R.SubstructureFormState = {
    label: "S1", supplierId: "x", otherSupplier: "", substructureType: 952850000, dirty: new Set(["label"]),
  };
  const pvForm: R.PvTypeFormState = {
    moduleLabel: "JA 600", capacity: "12", supplier: "m1", otherSupplier: "", degradation1stYear: "", degradationRemainingYears: "",
    dirty: new Set<string>(),
  };
  const replaceInputs: R.ReplaceInputs = { bridgeIds: ["b1"], opexCostIds: ["o1"], unitIds: ["w1"], allocations: [], landLeaseCosts: costs(2) };
  const turbineArgs = (project: R.PlanProject, existing: boolean) => {
    const type = genType();
    return {
      lang: "en-US" as const, project, type, model: model({ rotorDiameter: 150 }), accumulatedIndex: 1,
      turbine: existing ? turbine(1) : null, typeTurbines: [turbine(1), turbine(2)], allTypes: [type],
      form: { nameIndex: existing ? "1" : "3", effectiveCapacity: "5", effectiveHubHeight: "150", foundationPlinth: "1", dirty: new Set(["nameIndex"]) },
      applyAll: { capacity: false, hubHeight: false, plinth: false }, totalHeight: 226, landLeaseCosts: costs(2),
    };
  };
  const builders: [string, (project: R.PlanProject) => WritePlan][] = [
    ["planCreateGeneratorType", (project) => R.planCreateGeneratorType({ project, ...typeArgs })],
    ["planGeneratorTypeFollowUp", (project) => R.planGeneratorTypeFollowUp({
      project, typeId: "t9", typeName: "WTG-9", hasDeviceType: false, turbines: [{ id: "w1", name: "WTG WPN_1" }], landLeaseCosts: costs(1),
    })],
    ["planSaveTurbine (new)", (project) => R.planSaveTurbine(turbineArgs(project, false))],
    ["planSavePvType (new)", (project) => R.planSavePvType({
      lang: "en-US", project, pv: null, form: pvForm, deviceCostModules: 300, otherSupplierChosen: false,
    })],
    ["planPvFollowUp (new unit)", (project) => R.planPvFollowUp({
      project, pvId: "pv1", pvName: "PVT-1", unitId: null, hasDeviceType: false, pvRows: [{ capacity: 12, cost: 1 }], inverters: [], substructures: [],
      isNew: true, landLeaseCosts: costs(1),
    })],
    ["planSaveSimple (new)", (project) => R.planSaveSimple({
      lang: "en-US", project, family: "storage", row: null, rows: [],
      form: { label: "B", capacity: "10", energyCapacity: "20", supplier: "T", dirty: new Set(["label"]) },
    })],
    ["planSaveInverter (new)", (project) => R.planSaveInverter({
      lang: "en-US", project, row: null, form: inverterForm, otherSupplierChosen: false, deviceCostInverter: 80, pv: [], inverters: [], substructures: [],
    })],
    ["planSaveSubstructure (new)", (project) => R.planSaveSubstructure({
      project, row: null, form: substructureForm, otherSupplierChosen: false, deviceCostFix: 100, deviceCostTracker: 200,
      plantPvCapacity: 10, pv: [], inverters: [], substructures: [],
    })],
    ["planReplaceGeneratorType", (project) => R.planReplaceGeneratorType({
      project, oldType: genType({ numberOfGenerators: 2 }), inCountry: true, model: model({ specificCapacity: 6, hubHeight: 150, rotorDiameter: 160 }),
      costPerWtg: 1000, selectedHeight: 150, revisedHubHeight: null, otherTypes: [], otherTurbines: [], inputs: replaceInputs,
    })],
    ["planReplaceGeneratorTypeFollowUp", (project) => R.planReplaceGeneratorTypeFollowUp({
      project, newTypeId: "tN", newTypeName: "WTG-0100", existingBridgeId: null, newUnits: [{ id: "n1", name: "WTG WPN_1" }], inputs: replaceInputs,
    })],
    ["planReplacePvType", (project) => R.planReplacePvType({
      lang: "en-US", project, oldPv: simple({ id: "pvA" }), form: pvForm, deviceCostModules: 300, otherSupplierChosen: false, inputs: replaceInputs,
    })],
    ["planReplacePvTypeFollowUp", (project) => R.planReplacePvTypeFollowUp({
      project, newPvId: "pvN", newPvName: "JA 600", existingBridgeId: null, inputs: replaceInputs,
      pvRows: [{ capacity: 12, cost: 1 }], inverters: [], substructures: [],
    })],
  ];

  it.each(builders)("UT-GEN-1220 %s: with a business unit it creates; without one it is refused and sends nothing", (_name, build) => {
    const good = build(P);
    expect(good.refusedReason).toBeUndefined();
    expect(good.writes.some((w) => w.op === "create" || w.op === "createMany")).toBe(true);
    const refused = build(NO_BU);
    expect(refused.refusedReason).toBe(R.OWNING_BU_MSG.missing);
    expect(refused.writes).toEqual([]);
    // A blank string is as missing as null.
    expect(build({ ...P, owningBusinessUnitId: "  " }).refusedReason).toBe(R.OWNING_BU_MSG.missing);
  });

  it("UT-GEN-1221 a Replace is refused BEFORE anything is detached or deleted (the old type is never removed without its replacement)", () => {
    for (const name of ["planReplaceGeneratorType", "planReplacePvType"]) {
      const plan = builders.find(([n]) => n === name)![1](NO_BU);
      expect(plan.writes.some((w) => w.op === "delete" || w.op === "update")).toBe(false);
    }
  });

  it("UT-GEN-1222 an edit (no create) or a delete does not need the business unit: it passes unchanged", () => {
    const edit = R.planSaveTurbine(turbineArgs(NO_BU, true));
    expect(edit.refusedReason).toBeUndefined();
    expect(edit.writes.some((w) => w.op === "update")).toBe(true);
    const plan: WritePlan = { writes: [{ op: "update", entitySet: "vsb_xs", id: "1", data: {}, reason: "r" }], log: [] };
    expect(R.requireOwningBusinessUnit(plan, null)).toBe(plan);
    const refused: WritePlan = { writes: [], log: [], refusedReason: "earlier" };
    expect(R.requireOwningBusinessUnit(refused, null)).toBe(refused);
  });

  it("UT-GEN-1223 the follow-up's extra field survives a refusal (unmatchedCount of a Replace follow-up)", () => {
    const refused = R.requireOwningBusinessUnit(
      { writes: [{ op: "create", entitySet: "vsb_xs", data: {}, reason: "r" }], log: [], unmatchedCount: 3 }, undefined,
    );
    expect(refused.unmatchedCount).toBe(3);
    expect(refused.writes).toEqual([]);
  });

  it("UT-GEN-1224 the owner bind uses the shared key and the same value as before for a real id", () => {
    const plan = R.planSaveSimple({
      lang: "en-US", project: { ...P, owningBusinessUnitId: "bu-7" }, family: "hydrogen", row: null, rows: [],
      form: { label: "H", capacity: "1", energyCapacity: "", supplier: "T", dirty: new Set(["label"]) },
    });
    expect(plan.writes[0]!.data!["owningbusinessunit@odata.bind"]).toBe("/businessunits(bu-7)");
  });
});

describe("F9 — small fixes", () => {
  it("UT-GEN-1225 the read-only Total Height box drops binary float noise and keeps every real digit", () => {
    // e.g. hub height 140.2 + plinth 2.2 + half of a 141.2 m rotor: the raw sum is 212.99999999999997.
    expect(140.2 + 2.2 + 0.5 * 141.2).not.toBe(213);
    expect(R.fmtTurbineTotalHeightBox(140.2 + 2.2 + 0.5 * 141.2)).toBe("213");
    expect(R.fmtTurbineTotalHeightBox(130.39999999999998)).toBe("130.4");
    expect(R.fmtTurbineTotalHeightBox(223)).toBe("223");
    expect(R.fmtTurbineTotalHeightBox(140.123)).toBe("140.123");
    expect(R.fmtTurbineTotalHeightBox(130.39999999999998, "de-DE")).toBe("130,4");
    expect(R.fmtTurbineTotalHeightBox(null)).toBe("");
    expect(R.fmtTurbineTotalHeightBox(Number.NaN)).toBe("");
  });

  it("UT-GEN-1226 the Degradation 1st Year prefill keeps three decimals (the field accepts three), in the user's language", () => {
    expect(R.pvDegradationPrefill(0.125)).toBe("0.125");
    expect(R.pvDegradationPrefill(0.125, "de-DE")).toBe("0,125");
    expect(R.pvDegradationPrefill(2)).toBe("2");
    expect(R.pvDegradationPrefill(null)).toBe("");
    // The value the field shows passes the field's own three-decimal check, so an unchanged Save keeps it.
    const form: R.PvTypeFormState = {
      moduleLabel: "JA", capacity: "10", supplier: "m1", otherSupplier: "", degradation1stYear: R.pvDegradationPrefill(0.125),
      degradationRemainingYears: "", dirty: new Set<string>(),
    };
    expect(R.validatePvTypeForm(form, { otherSupplierChosen: false }).degradation1stYear).toBeNull();
  });

  it("UT-GEN-1227 the PV follow-up back-fills the AllWTG costs for a new type, and for an edit that has to CREATE the unit", () => {
    expect(R.pvFollowUpIsNew({ editing: false, unitId: null })).toBe(true);
    expect(R.pvFollowUpIsNew({ editing: true, unitId: null })).toBe(true);
    expect(R.pvFollowUpIsNew({ editing: true, unitId: "u1" })).toBe(false);
    const base = {
      project: P, pvId: "pv1", pvName: "PVT-1", hasDeviceType: true, pvRows: [{ capacity: 1, cost: 1 }], inverters: [], substructures: [],
      landLeaseCosts: costs(2),
    };
    const created = R.planPvFollowUp({ ...base, unitId: null, isNew: R.pvFollowUpIsNew({ editing: true, unitId: null }) });
    expect(created.writes.filter((w) => w.entitySet === "vsb_landleaseallocationwtgs")).toHaveLength(2);
    const existing = R.planPvFollowUp({ ...base, unitId: "u1", isNew: R.pvFollowUpIsNew({ editing: true, unitId: "u1" }) });
    expect(existing.writes.some((w) => w.entitySet === "vsb_landleaseallocationwtgs")).toBe(false);
  });

  it("UT-GEN-1228 the pager counts the loaded turbines: no page without rows, and a type with rows beyond the stored count still pages", () => {
    expect(R.pagerVisible(0)).toBe(false);
    expect(R.pagerVisible(R.GENERATORS_PAGE_SIZE)).toBe(false);
    expect(R.pagerVisible(R.GENERATORS_PAGE_SIZE + 1)).toBe(true);
    expect(R.pageCount(R.GENERATORS_PAGE_SIZE + 1)).toBe(2);
  });

  it("UT-GEN-1229 the two unused exports are gone (PLANT_LOOKUP, TYPE_VALIDATION_ROWS)", () => {
    expect("PLANT_LOOKUP" in R).toBe(false);
    expect("TYPE_VALIDATION_ROWS" in R).toBe(false);
  });
});

describe("F8 — canvas texts and chips pinned (generators fix, GT-3 / GT-8)", () => {
  it("UT-GEN-1230 the permission chip labels, one per state, and none for no state", () => {
    const s = CHOICE_PLANT.requestPermissionState;
    expect(R.permissionStateLabel(s.approved)).toBe("Request Approved");
    expect(R.permissionStateLabel(s.declined)).toBe("Request Declined");
    expect(R.permissionStateLabel(s.pending)).toBe("Request Pending");
    expect(R.permissionStateLabel(s.canceled)).toBe("Request Canceled");
    expect(R.permissionStateLabel(null)).toBeNull();
    expect(R.permissionStateLabel(undefined)).toBeNull();
  });

  it("UT-GEN-1231 the delete / status / height confirmations, verbatim", () => {
    const d = R.DIALOG_TEXT;
    expect(d.deleteGeneratorType("V150")).toBe("Are you sure to delete the WTG type: V150? All related cost in O&M and Land Lease will be removed.");
    expect(d.deleteGenerator("WTG WPN_1")).toBe('Are you sure to delete selected generator: "WTG WPN_1"? All possibly allocated Land Lease cost will be removed.');
    expect(d.deletePvModuleType("JA 550")).toBe('Are you sure that you want to delete selected PV Module type "JA 550"? All related cost in O&M and Land Lease will be removed');
    expect(d.deleteInverterType("INV")).toBe("Are you sure that you want to delete selected inverter type INV?");
    expect(d.deleteSubstructureType("S1")).toBe("Are you sure that you want to delete substructure type S1?");
    expect(d.deleteBess("B")).toBe('Are you sure to delete selected BESS Type: "B"? ');
    expect(d.deleteHydrogen("H")).toBe('Are you sure to delete selected Hydrogen Type: "H"? ');
    expect(d.deleteSubstation("S")).toBe('Are you sure to delete selected Substation Type: "S"? ');
    expect(d.changeStatus("V150")).toBe("Are you sure to change status of the WTG type: V150?");
    expect(d.heightExceeded("V150")).toBe('The total height of Generator Type "V150" is exceeding the height limitation. Are you sure you want to continue?');
    expect(d.deleteGeneratorType(null)).toContain("WTG type: ?");
  });

  it("UT-GEN-1232 the approval flows' set-up message names what is missing", () => {
    expect(R.PERMISSION_MSG.setupMissing("your e-mail address"))
      .toBe("The approval flow cannot be started: your e-mail address is not set in this environment. Please contact your administrator.");
  });
});
