/**
 * Admin Milestones Screen — unit tests.
 *
 * IDs are the spec's (UT-ADMILE-nnn). Pure functions only, plus one case that actually
 * invokes the missing-flow wrapper (025) — that one is real behaviour, not a mock.
 */
import { describe, it, expect } from "vitest";
import { canSeeAdminSection, type CurrentUser } from "@/domain/session";
import { MILESTONE_ROW_NAME, CHOICE_ADMIN } from "@/data/entities";
import { triggerFabricRecalculationForCountries } from "@/flows/flowClient";
import {
  MSG, MILESTONE_COL, MILESTONE_ENTITY_SET, MILESTONE_FIELD_COLUMN, DURATION_FIELDS,
  SUCCESS_RATE_FIELDS, SUMMARY_TABLE_FIELDS, MILESTONE_JOB_TYPE_NAME, ACTIVE_JOB_STATES,
  sortCountries, pivotByTechnology, durationRows, successRateRows,
  isValidDuration, isValidSuccessRate, validateEdit, upsertEdit, editKey,
  canSave, invalidEdits, saveErrorMessages, canEditScope, planSaveMilestones,
  isRecalculating, applyCommandState, fabricRecalculationArgs,
  milestoneFieldDisplayLabel, editMilestonesTitle, technologyDisplayName,
  buildMilestoneSummaryRows,
  type AssumptionRow, type CountryRow, type MilestoneEdit, type EditMap, type FabricJob,
} from "./rules";

/* ─────────────────────────────────────────────────────────────────── fixtures */

const user = (o: Partial<CurrentUser> = {}): CurrentUser => ({
  id: "u-1", displayName: "A", mail: "a@vsb.energy", language: "en-US", lang: "en",
  roles: [], isApplicationAdministrator: false, isControllerOwnData: false,
  isProjectDataAllCountries: false, isProjectManagerOwnProjects: false, isDeveloper: false,
  canEditSelectedProject: false, editableCountries: [], editableCountriesAsString: "",
  ...o,
});

const durationRow = (o: Partial<AssumptionRow> = {}): AssumptionRow => ({
  id: "d-wind", name: MILESTONE_ROW_NAME.duration,
  technology: CHOICE_ADMIN.technology.wind, countryId: "de",
  values: {
    [MILESTONE_COL.cluster1]: 6, [MILESTONE_COL.cluster2]: 9, [MILESTONE_COL.cluster3]: 12,
    [MILESTONE_COL.cluster4]: 15, [MILESTONE_COL.cluster5]: 18,
    [MILESTONE_COL.finalInvestmentDecision]: 24,
    [MILESTONE_COL.operationalLifetime]: 300,
    [MILESTONE_COL.salesStart]: 3, [MILESTONE_COL.salesEnd]: 18,
  },
  ...o,
});

const successRow = (o: Partial<AssumptionRow> = {}): AssumptionRow => ({
  id: "s-wind", name: MILESTONE_ROW_NAME.successRate,
  technology: CHOICE_ADMIN.technology.wind, countryId: "de",
  values: {
    [MILESTONE_COL.cluster1]: 0.8, [MILESTONE_COL.cluster2]: 0.7,
    [MILESTONE_COL.cluster3]: 0.6, [MILESTONE_COL.cluster4]: 0.5,
    [MILESTONE_COL.finalInvestmentDecision]: 0.42,
  },
  ...o,
});

const country = (o: Partial<CountryRow> = {}): CountryRow => ({
  id: "de", name: "Germany", order: 1, key: 1, ...o,
});

const edit = (o: Partial<MilestoneEdit> = {}): MilestoneEdit => ({
  rowId: "d-wind", field: "Cluster 1", kind: "duration", raw: "12", valid: true, ...o,
});

const mapOf = (...list: MilestoneEdit[]): EditMap => {
  let m: EditMap = new Map();
  for (const e of list) m = upsertEdit(m, e);
  return m;
};

/* ═══════════════════════════════════════════════════════════════ permission ════ */

describe("permission", () => {
  it("UT-ADMILE-001 a non-admin is blocked", () => {
    expect(canSeeAdminSection(user())).toBe(false);
    expect(canSeeAdminSection(user({ isApplicationAdministrator: true }))).toBe(true);
  });

  it("UT-ADMILE-001b country scope gates the writes (new, absent from the canvas)", () => {
    const controller = user({
      isControllerOwnData: true, editableCountries: [{ id: "de", name: "Germany" }],
    });
    expect(canEditScope(controller, "de")).toBe(true);
    expect(canEditScope(controller, "fr")).toBe(false);
    const plan = planSaveMilestones({ edits: mapOf(edit()), canEdit: false });
    expect(plan.writes).toHaveLength(0);
    expect(plan.refusedReason).toBe(MSG.outOfScope);
  });
});

/* ═════════════════════════════════════════════════════════════════ the pivot ════ */

describe("the pivot", () => {
  it("UT-ADMILE-002 countries are listed by Order", () => {
    const list = sortCountries([
      country({ id: "c", order: 3 }), country({ id: "a", order: 1 }),
      country({ id: "d", order: 4 }), country({ id: "b", order: 2 }),
    ]);
    expect(list.map((c) => c.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("UT-ADMILE-003 the pivot pairs the duration and success-rate rows per technology", () => {
    const out = pivotByTechnology([
      durationRow(), successRow(),
      durationRow({ id: "d-pv", technology: CHOICE_ADMIN.technology.pv }),
      successRow({ id: "s-pv", technology: CHOICE_ADMIN.technology.pv }),
    ]);
    expect(out).toHaveLength(2);
    expect(out[0].technology).toBe(CHOICE_ADMIN.technology.wind);
    expect(out[0].durationRowId).toBe("d-wind");
    expect(out[0].successRateRowId).toBe("s-wind");
    expect(out[0].entries).toHaveLength(9);
    expect(out[0].entries.map((e) => e.label)).toEqual([...DURATION_FIELDS]);
  });

  it("UT-ADMILE-004 a missing success-rate row yields undefined, not a crash", () => {
    const out = pivotByTechnology([durationRow()]);
    expect(out).toHaveLength(1);
    expect(out[0].successRateRowId).toBeNull();
    const c1 = out[0].entries.find((e) => e.label === "Cluster 1")!;
    expect(c1.duration).toBe(6);
    expect(c1.successRate).toBeUndefined();
    // …except FID, which is a literal 1 whatever happens.
    expect(out[0].entries.find((e) => e.label === "FID")!.successRate).toBe(1);
  });

  it("UT-ADMILE-005 the FID success rate is ALWAYS the literal 1", () => {
    const out = pivotByTechnology([
      durationRow(),
      successRow({ values: { [MILESTONE_COL.finalInvestmentDecision]: 0.42 } }),
    ]);
    const fid = out[0].entries.find((e) => e.label === "FID")!;
    expect(fid.successRate).toBe(1);
    expect(fid.duration).toBe(24);
    // The stored 0.42 is ignored — the canvas hard-codes 1.
  });

  it("UT-ADMILE-006 'Sales Duration' reads the 'Sales End' column (documented defect)", () => {
    expect(MILESTONE_FIELD_COLUMN["Sales Duration"]).toBe(MILESTONE_COL.salesEnd);
    expect(MILESTONE_COL.salesEnd).toBe("vsb_salesend");
    const out = pivotByTechnology([durationRow()]);
    expect(out[0].entries.find((e) => e.label === "Sales Duration")!.duration).toBe(18);
    // The map is declared in ONE place, so the mismatch cannot be half-fixed.
    expect(MILESTONE_FIELD_COLUMN["Sales Start"]).toBe(MILESTONE_COL.salesStart);
  });

  it("UT-ADMILE-006b only Cluster 1–4 carry an editable success rate", () => {
    expect(SUCCESS_RATE_FIELDS).toEqual(["Cluster 1", "Cluster 2", "Cluster 3", "Cluster 4"]);
    expect(DURATION_FIELDS).toHaveLength(9);
  });

  it("UT-ADMILE-006c the two row families split on the magic Name strings", () => {
    const rows = [durationRow(), successRow()];
    expect(durationRows(rows).map((r) => r.id)).toEqual(["d-wind"]);
    expect(successRateRows(rows).map((r) => r.id)).toEqual(["s-wind"]);
    expect(MILESTONE_ROW_NAME.duration).toBe("average duration [months]");
    expect(MILESTONE_ROW_NAME.successRate).toBe("success rate [-]");
  });
});

/* ══════════════════════════════════════════════════════════════ validation ════ */

describe("cell validation", () => {
  it("UT-ADMILE-007 a duration accepts digits only", () => {
    expect(isValidDuration("12")).toBe(true);
    expect(isValidDuration("12.5")).toBe(false);
    expect(isValidDuration("")).toBe(false);
    expect(isValidDuration("1 2")).toBe(false);
  });

  it("UT-ADMILE-008 a negative duration is rejected", () => {
    expect(isValidDuration("-3")).toBe(false);
    expect(isValidDuration("+3")).toBe(false);
  });

  it("UT-ADMILE-009 a success rate of 0–1 with two decimals is accepted", () => {
    expect(isValidSuccessRate("0.85")).toBe(true);
    expect(isValidSuccessRate("1")).toBe(true);
    expect(isValidSuccessRate("0")).toBe(true);
  });

  it("UT-ADMILE-010 a success rate above 1 is rejected", () => {
    expect(isValidSuccessRate("1.20")).toBe(false);
    expect(isValidSuccessRate("2")).toBe(false);
  });

  it("UT-ADMILE-011 a success rate with three decimals is rejected", () => {
    expect(isValidSuccessRate("0.855")).toBe(false);
  });

  it("UT-ADMILE-012 a blank success rate is rejected", () => {
    expect(isValidSuccessRate("")).toBe(false);
    expect(isValidSuccessRate("   ")).toBe(false);
    expect(validateEdit("successRate", "")).toBe(false);
    expect(validateEdit("duration", "7")).toBe(true);
  });
});

/* ═══════════════════════════════════════════════════════════════ the edit map ════ */

describe("the edit map (replacing the sentinel-string journal)", () => {
  it("UT-ADMILE-013 Save is disabled with no edits", () => {
    expect(canSave(new Map())).toBe(false);
    expect(planSaveMilestones({ edits: new Map(), canEdit: true }).refusedReason)
      .toBe(MSG.noEdits);
  });

  it("UT-ADMILE-014 one invalid cell disables Save and names itself", () => {
    const edits = mapOf(
      edit({ field: "Cluster 1", raw: "12" }),
      edit({ field: "Cluster 2", raw: "14" }),
      edit({ field: "Cluster 3", raw: "9" }),
      edit({ field: "Cluster 4", raw: "1.5", valid: false }),
    );
    expect(canSave(edits)).toBe(false);
    expect(invalidEdits(edits).map((e) => e.field)).toEqual(["Cluster 4"]);
    expect(saveErrorMessages(edits)).toEqual([MSG.invalidDuration]);
    // The canvas could not do this: validity lived as the STRING "invalid duration"
    // inside the collection, so only one message for the whole country was possible.
  });

  it("UT-ADMILE-014b a bad success rate reports the success-rate message", () => {
    const edits = mapOf(edit({ kind: "successRate", field: "Cluster 1", raw: "1.2", valid: false }));
    expect(saveErrorMessages(edits)).toEqual([MSG.invalidSuccessRate]);
  });

  it("UT-ADMILE-015 the map upserts per (row, field)", () => {
    let edits = mapOf(edit({ raw: "12" }));
    edits = upsertEdit(edits, edit({ raw: "14" }));
    expect(edits.size).toBe(1);
    expect(edits.get(editKey("d-wind", "Cluster 1"))!.raw).toBe("14");
    // A different field is a different entry.
    edits = upsertEdit(edits, edit({ field: "Cluster 2", raw: "3" }));
    expect(edits.size).toBe(2);
  });

  it("UT-ADMILE-020 cancelling discards the map (the caller replaces it wholesale)", () => {
    const edits = mapOf(edit(), edit({ field: "Cluster 2" }));
    expect(edits.size).toBe(2);
    const afterCancel: EditMap = new Map();
    expect(canSave(afterCancel)).toBe(false);
  });
});

/* ═════════════════════════════════════════════════════════════════════ the save ════ */

describe("the save", () => {
  it("UT-ADMILE-016 the batch patches only the changed columns", () => {
    const plan = planSaveMilestones({
      edits: mapOf(edit({ field: "Cluster 2", raw: "14" })), canEdit: true,
    });
    expect(plan.writes).toHaveLength(1);
    expect(plan.writes[0]).toMatchObject({
      op: "update", entitySet: MILESTONE_ENTITY_SET, id: "d-wind",
      data: { [MILESTONE_COL.cluster2]: 14 },
    });
    expect(Object.keys(plan.writes[0].data ?? {})).toEqual([MILESTONE_COL.cluster2]);
  });

  it("UT-ADMILE-017 edits across three technologies become ONE batch of three PATCHes", () => {
    const plan = planSaveMilestones({
      edits: mapOf(
        edit({ rowId: "d-wind", field: "Cluster 1", raw: "6" }),
        edit({ rowId: "d-pv", field: "Cluster 1", raw: "7" }),
        edit({ rowId: "d-bess", field: "Cluster 1", raw: "8" }),
      ),
      canEdit: true,
    });
    expect(plan.writes).toHaveLength(3);
    expect(plan.writes.map((w) => w.id)).toEqual(["d-wind", "d-pv", "d-bess"]);
  });

  it("UT-ADMILE-017b several cells on one row collapse into one PATCH", () => {
    const plan = planSaveMilestones({
      edits: mapOf(
        edit({ field: "Cluster 1", raw: "6" }),
        edit({ field: "Sales Duration", raw: "20" }),
      ),
      canEdit: true,
    });
    expect(plan.writes).toHaveLength(1);
    expect(plan.writes[0].data).toEqual({
      [MILESTONE_COL.cluster1]: 6,
      [MILESTONE_COL.salesEnd]: 20,
    });
  });

  it("UT-ADMILE-018 a successful save clears the map (the caller resets it)", () => {
    const plan = planSaveMilestones({ edits: mapOf(edit()), canEdit: true });
    expect(plan.writes).toHaveLength(1);
    // The canvas Save never `Clear`ed `col_MilestoneAssumtionsUpdates`; it only `Select`ed
    // a hidden reset button, so stale journal rows survived into the next session.
    const cleared: EditMap = new Map();
    expect(canSave(cleared)).toBe(false);
  });

  it("UT-ADMILE-026 a batch that would carry an invalid column is refused outright", () => {
    const plan = planSaveMilestones({
      edits: mapOf(edit({ raw: "12" }), edit({ field: "Cluster 2", raw: "x", valid: false })),
      canEdit: true,
    });
    expect(plan.writes).toHaveLength(0);
    expect(plan.refusedReason).toBe(MSG.invalidDuration);
    // The canvas relied on ONE global disable; this is the second belt the spec asks for.
  });

  it("UT-ADMILE-027 a country with no assumptions pivots to nothing and cannot save", () => {
    expect(pivotByTechnology([])).toEqual([]);
    expect(planSaveMilestones({ edits: new Map(), canEdit: true }).refusedReason)
      .toBe(MSG.noEdits);
    expect(MSG.emptyCountry.length).toBeGreaterThan(0);
  });
});

/* ══════════════════════════════════════════════════════════════ the Fabric badge ════ */

describe("the recalculating badge", () => {
  const job = (o: Partial<FabricJob> = {}): FabricJob => ({
    id: "j1", regardingObjectId: "de", jobTypeName: MILESTONE_JOB_TYPE_NAME,
    jobStatus: CHOICE_ADMIN.jobStates.inProgress, ...o,
  });

  it("UT-ADMILE-021 the badge shows for In Progress, In Delay and Importing", () => {
    for (const status of ACTIVE_JOB_STATES) {
      expect(isRecalculating([job({ jobStatus: status })], "de")).toBe(true);
    }
    expect(MSG.recalculating).toContain("Currently recalculating");
  });

  it("UT-ADMILE-022 the badge is hidden for a completed job", () => {
    expect(isRecalculating([job({ jobStatus: CHOICE_ADMIN.jobStates.done })], "de")).toBe(false);
    expect(isRecalculating([job({ jobStatus: CHOICE_ADMIN.jobStates.dirty })], "de")).toBe(false);
  });

  it("UT-ADMILE-023 the badge ignores other job types and other countries", () => {
    expect(isRecalculating([job({ jobTypeName: "Something else" })], "de")).toBe(false);
    expect(isRecalculating([job()], "fr")).toBe(false);
    expect(isRecalculating([], "de")).toBe(false);
  });
});

/* ═════════════════════════════════════════════════════════════════════ the Apply ════ */

describe("Apply and Apply All (dead as shipped)", () => {
  it("UT-ADMILE-024 both Apply commands are disabled and carry a reason", () => {
    const perCountry = applyCommandState({ kind: "country", countryId: "de", countryName: "Germany" });
    const all = applyCommandState({ kind: "all" });
    expect(perCountry.enabled).toBe(false);
    expect(all.enabled).toBe(false);
    expect(perCountry.disabledReason).toBe(MSG.applyDisabled);
    // The confirmation wording is carried verbatim so enabling it needs no copy review.
    expect(all.confirmation).toBe(MSG.applyConfirmation);
    expect(all.confirmation).toContain("override existing standard assumptions of milestones");
  });

  it("UT-ADMILE-025 the flow wrapper reports the missing flow and writes nothing", async () => {
    const args = fabricRecalculationArgs({ kind: "country", countryId: "de", countryName: "Germany" });
    expect(args).toEqual({ countryNames: ["Germany"] });
    expect(fabricRecalculationArgs({ kind: "all" })).toEqual({ countryNames: ["All"] });

    await expect(triggerFabricRecalculationForCountries({ countryIds: ["de"] }))
      .rejects.toThrow(/not present in the solution export/i);
    // No `Fabric Sync Jobs` row is created either: this feature never writes that table.
  });
});

/* ═══════════════════════════════════════════════════════ the screenshot-driven UI (p22) */

describe("GUIDE p22 — the drawer title, field labels and the summary grid", () => {
  it("UT-ADMILE-028 the drawer title interpolates the country name", () => {
    expect(editMilestonesTitle("Germany")).toBe("Edit Milestones for Germany");
    expect(editMilestonesTitle("France")).toBe("Edit Milestones for France");
  });

  it("UT-ADMILE-029 the two section titles are verbatim", () => {
    expect(MSG.durationsSectionTitle).toBe("Cluster Durations [months]");
    expect(MSG.successRateSectionTitle).toBe("Cluster Probabilities - Success Rate [-]");
  });

  it("UT-ADMILE-030 the panel spells FID and Sales Duration differently from the grid", () => {
    expect(milestoneFieldDisplayLabel("FID")).toBe("Final Investment Decision");
    expect(milestoneFieldDisplayLabel("Sales Duration")).toBe("Sales End");
    // Every other field's panel label is its own key, unchanged.
    expect(milestoneFieldDisplayLabel("Cluster 1")).toBe("Cluster 1");
    expect(milestoneFieldDisplayLabel("Operational Lifetime")).toBe("Operational Lifetime");
  });

  it("UT-ADMILE-031 the summary grid shows exactly the seven fields the screenshot lists", () => {
    expect(SUMMARY_TABLE_FIELDS).toEqual([
      "Cluster 1", "Cluster 2", "Cluster 3", "Cluster 4",
      "FID", "Cluster 5", "Operational Lifetime",
    ]);
    // A slice of DURATION_FIELDS, not a second literal — Sales Start/Duration stay out.
    expect(SUMMARY_TABLE_FIELDS.length).toBe(DURATION_FIELDS.length - 2);
  });

  it("UT-ADMILE-032 technology names match the choice set, with PV capitalised", () => {
    expect(technologyDisplayName(CHOICE_ADMIN.technology.wind)).toBe("Wind");
    expect(technologyDisplayName(CHOICE_ADMIN.technology.pv)).toBe("PV");
    expect(technologyDisplayName(null)).toBe("—");
    expect(technologyDisplayName(999999)).toBe("—");
  });

  it("UT-ADMILE-033 the summary grid pairs a Duration and a Success Rate row per technology", () => {
    const out = buildMilestoneSummaryRows(pivotByTechnology([durationRow(), successRow()]));
    expect(out).toHaveLength(2);
    expect(out[0].seriesLabel).toBe("Duration [months]");
    expect(out[0].technologyCell).toBe("Wind — Duration [months]");
    expect(out[0].values["Cluster 1"]).toBe(6);
    expect(out[1].seriesLabel).toBe("Success Rate [-]");
    expect(out[1].technologyCell).toBe("Wind — Success Rate [-]");
    expect(out[1].values["Cluster 1"]).toBe(0.8);
    // FID's success rate is still the hard-coded 1 (rule 3), reachable through the same row.
    expect(out[1].values.FID).toBe(1);
  });
});
