/**
 * Project General Milestones Screen — unit tests.
 * IDs are the spec's (UT-MSTONE-nnn). Pure functions only.
 */
import { describe, it, expect } from "vitest";
import { ES, CHOICE } from "@/data/dataverseNames";
import { PROJECT_COL } from "@/features/pm/general-data/rules";
import {
  MILESTONE_KEYS, emptyMilestoneDates, validateMilestones, validateFarmdown,
  invalidMessages, isPageLocked, canSaveMilestones, initialDates, initialForm,
  recalculateMilestone, editMilestone, deriveNextDate, operationalLifetime, pfxMonthDiff,
  accumulatedIndex, repriceGenerators, repriceGeneratorsBooleanReading, needsPlantCostRecalculation, plantWtgCost,
  codChangeBlocksSave, milestoneLabels, italianRegion, revenueLabelFor, describeRevenue,
  contractDates, pickPrice, inflationSettings, buildDefaultRevenue, planSaveMilestones,
  isInRevenueSlice, revenuePricePool,
  clearSkippedMilestones, shouldConfirmLeave, milestoneMeta,
  isDerivedMilestone, classifyDerivedMilestones, resetShareOfFarmdown,
  isMilestoneFieldVisible, isRecalculateVisible, farmdownError, MILESTONES_MSG, MILESTONE_FIELD_ERROR,
  accumulatedIndexCanvasParity, requiredFieldsContent, isMilestoneFieldErrorVisible, nextDirtyKeys,
  recalculateMilestoneCanvasParity, isRecalculateEnabled, needsPlantCostRecalculationCanvasParity,
  cancelMilestones, cancelMilestonesCanvasParity, formatFarmdown, formatShortDateTime24,
  revenueSeedWouldRun, sameDate, HEDGE_TYPE_INDIVIDUAL_VOLUMES, FABRIC_JOB_STATUS, RECALC_SOURCE,
  type MilestoneDates, type MilestoneProject, type MilestonesForm, type MilestoneAssumptionRow,
  type RevenueAssumptionRow, type ProjectGenerator, type MilestoneKey,
} from "./rules";
import { LEAVE_DIALOG as MS_LEAVE_DIALOG } from "./rules";
import { Vsb_projectrevenuesvsb_hedgetype, Vsb_projectrevenuesvsb_label } from "@/generated/models/Vsb_projectrevenuesModel";
import { Vsb_fabricsyncjobsvsb_jobstatuscode } from "@/generated/models/Vsb_fabricsyncjobsModel";
import { Vsb_projectsvsb_technology } from "@/generated/models/Vsb_projectsModel";

/* ─────────────────────────────────────────────────────────────────── fixtures */

/** A consistent, fully valid Greenfield chain. */
const CHAIN: MilestoneDates = {
  StartDate: "2026-01-01",
  FeasibilityStudies: "2026-06-01",
  ProjectDevelopmentStarted: "2026-12-01",
  ApplicationSubmitted: "2027-06-01",
  LegallyBindingPermits: "2028-01-01",
  FinalInvestmentDecision: "2028-06-01",
  Construction: "2029-01-01",
  OperationsStartDate: "2030-01-01",
  EndDate: "2059-12-31",
  SalesStartDate: "2031-01-01",
  StartCompleted: "2031-06-01",
};

const dates = (o: Partial<MilestoneDates> = {}): MilestoneDates => ({ ...CHAIN, ...o });

const project = (o: Partial<MilestoneProject> = {}): MilestoneProject => ({
  id: "p-1", name: "Nordwind", projectNumber: "DE-1021", clusterStateName: "Draft",
  countryId: "c-de", countryName: "Germany", countryBusinessUnitId: "bu-de",
  areaName: "Sachsen", technology: "Wind", technologyValue: 952850000, startCluster: 0, acquisitionDate: null,
  shareOfFarmdown: null, isStandardShareOfFarmdown: null,
  createdByName: "Shakti Singh", createdOn: "2026-09-03T10:49:00Z",
  modifiedByName: "Shakti Singh", modifiedOn: "2026-09-03T10:49:00Z",
  dates: dates(), standardAssumption: {},
  ...o,
});

const formOf = (o: Partial<MilestonesForm> = {}): MilestonesForm => ({
  dates: dates(), standardAssumption: {}, shareOfFarmdown: "50",
  isStandardShareOfFarmdown: true, ...o,
});

const allValid = () => validateMilestones(dates(), 0, "50");
const allowAll = { canCreate: true, canEdit: true };

/* ═══════════════════════════════════════════════════════════ lock and binding */

describe("UT-MSTONE lock and binding", () => {
  it("UT-MSTONE-001 screen locked until the project has a Project ID", () => {
    expect(isPageLocked(project({ projectNumber: null }))).toBe(true);
    expect(isPageLocked(project())).toBe(false);
    expect(isPageLocked(null)).toBe(true);
    expect(canSaveMilestones({
      perms: allowAll, project: project({ projectNumber: null }),
      validation: allValid(), dirtyKeys: ["EndDate"],
    })).toBe(false);
  });

  it("UT-MSTONE-003 acquired project defaults its start cluster date to the acquisition date", () => {
    const p = project({
      startCluster: 3, acquisitionDate: "2027-03-15",
      dates: dates({ ApplicationSubmitted: null, EndDate: null }),
    });
    expect(initialDates(p).ApplicationSubmitted).toBe("2027-03-15");
  });

  it("UT-MSTONE-004 that default does not apply once End Date exists", () => {
    const p = project({
      startCluster: 3, acquisitionDate: "2027-03-15",
      dates: dates({ ApplicationSubmitted: null, EndDate: "2059-12-31" }),
    });
    expect(initialDates(p).ApplicationSubmitted).toBeNull();
  });

  it("UT-MSTONE-005 Share of Farmdown defaults to 50", () => {
    // `Text(locShareOfFarmdown, "##0.0")` (D26: was shown unformatted).
    expect(initialForm(project({ shareOfFarmdown: null })).shareOfFarmdown).toBe("50.0");
    expect(initialForm(project({ shareOfFarmdown: 33.5 })).shareOfFarmdown).toBe("33.5");
    expect(initialForm(project({ shareOfFarmdown: 33.5 }), "de-DE").shareOfFarmdown).toBe("33,5");
    expect(initialForm(project({ isStandardShareOfFarmdown: null })).isStandardShareOfFarmdown)
      .toBe(true);
  });

  it("UT-MSTONE-002b the Sales-Completion row is named StartCompleted in the source", () => {
    expect(MILESTONE_KEYS).toContain("StartCompleted");
    expect(milestoneMeta("StartCompleted").projectField).toBe(PROJECT_COL.salesCompleted);
    // GUIDE p16: "Sales Completion Date" is the label the two-column form renders.
    expect(milestoneMeta("StartCompleted").label).toBe("Sales Completion Date");
  });
});

/* ═══════════════════════════════════════════════════════════════ the date chain */

describe("UT-MSTONE the date chain", () => {
  it("UT-MSTONE-006 milestones below the start cluster are valid when blank", () => {
    const v = validateMilestones(
      dates({ StartDate: null, FeasibilityStudies: null, ProjectDevelopmentStarted: null }), 3,
    );
    expect(v.StartDate.valid).toBe(true);
    expect(v.FeasibilityStudies.valid).toBe(true);
    expect(v.ProjectDevelopmentStarted.valid).toBe(true);
  });

  it("UT-MSTONE-007 Cluster 1 must be later than Project Start", () => {
    const v = validateMilestones(
      dates({ StartDate: "2026-01-01", FeasibilityStudies: "2025-12-01" }), 0,
    );
    expect(v.FeasibilityStudies.valid).toBe(false);
    // The validation row's `Text` (Y:4224) — the under-field label is MILESTONE_FIELD_ERROR.
    expect(v.FeasibilityStudies.text).toBe("Check input for Cluster 1 date.");
  });

  it("UT-MSTONE-008 cluster chain enforced pairwise", () => {
    const v = validateMilestones(dates({ ApplicationSubmitted: "2026-11-01" }), 0);
    expect(v.ApplicationSubmitted.valid).toBe(false);
    expect(v.ProjectDevelopmentStarted.valid).toBe(true);
  });

  it("UT-MSTONE-009 FID must be later than Cluster 4", () => {
    const v = validateMilestones(dates({ FinalInvestmentDecision: "2027-12-01" }), 0);
    expect(v.FinalInvestmentDecision.valid).toBe(false);
  });

  it("UT-MSTONE-010 FID required even for a late start cluster", () => {
    const v = validateMilestones(dates({ FinalInvestmentDecision: null }), 5);
    expect(v.FinalInvestmentDecision.valid).toBe(false);
    expect(v.FinalInvestmentDecision.text)
      .toBe("Check input for Final Investment Decision date.");
  });

  it("UT-MSTONE-010b a late start cluster drops the Cluster-4 comparison but not the FID", () => {
    const v = validateMilestones(
      dates({ LegallyBindingPermits: null, FinalInvestmentDecision: "2028-06-01" }), 5,
    );
    expect(v.FinalInvestmentDecision.valid).toBe(true);
  });

  it("UT-MSTONE-011 Construction must be later than FID", () => {
    expect(validateMilestones(dates({ Construction: "2028-05-01" }), 0).Construction.valid)
      .toBe(false);
    expect(validateMilestones(dates({ Construction: null }), 6).Construction.valid).toBe(false);
  });

  it("UT-MSTONE-012 End Date must be later than COD", () => {
    expect(validateMilestones(dates({ EndDate: "2029-12-31" }), 0).EndDate.valid).toBe(false);
  });

  it("UT-MSTONE-013 sales start must precede sales completion", () => {
    const v = validateMilestones(
      dates({ SalesStartDate: "2031-07-01", StartCompleted: "2031-06-01" }), 0,
    );
    expect(v.SalesStartDate.valid).toBe(false);
    expect(v.StartCompleted.valid).toBe(false);
  });

  it("UT-MSTONE-013b a consistent chain reports nothing", () => {
    expect(invalidMessages(allValid())).toEqual([]);
  });
});

/* ═══════════════════════════════════════ GUIDE p15/p16 ordering-validation copy ════ */

describe("UT-MSTONE the validation and field-error copy", () => {
  // CORRECTED (D26): these pinned the field-label copy as the validation row's `Text`. The
  // row text is the "Check input for …" string (Y:4201-4342); the label under the field is
  // MILESTONE_FIELD_ERROR (Y:1630-3804).
  it("UT-MSTONE-047 Cluster 4: row text and field label", () => {
    const fail = validateMilestones(dates({ LegallyBindingPermits: "2027-01-01" }), 0);
    expect(fail.LegallyBindingPermits.valid).toBe(false);
    expect(fail.LegallyBindingPermits.text).toBe("Check input for Cluster 4 date.");
    expect(MILESTONE_FIELD_ERROR.LegallyBindingPermits).toBe("The date needs to be later than Cluster 3 date.");
  });

  it("UT-MSTONE-048 FID: row text and field label", () => {
    const fail = validateMilestones(dates({ FinalInvestmentDecision: "2027-12-01" }), 0);
    expect(fail.FinalInvestmentDecision.text).toBe("Check input for Final Investment Decision date.");
    expect(MILESTONE_FIELD_ERROR.FinalInvestmentDecision).toBe("The date needs to be later than Cluster 4 date.");
  });

  it("UT-MSTONE-049 Cluster 5: row text and field label", () => {
    const fail = validateMilestones(dates({ Construction: "2028-05-01" }), 0);
    expect(fail.Construction.text).toBe("Check input for Cluster 5 date.");
    expect(MILESTONE_FIELD_ERROR.Construction).toBe("The date needs to be later than Final Investment Decision date.");
  });

  it("UT-MSTONE-050 Cluster 6: row text (capital D, verbatim) and field label", () => {
    const fail = validateMilestones(dates({ OperationsStartDate: "2028-12-01" }), 0);
    expect(fail.OperationsStartDate.text).toBe("Check input for Cluster 6 Date.");
    expect(MILESTONE_FIELD_ERROR.OperationsStartDate).toBe("The date needs to be later than Cluster 5 date.");
  });

  it("UT-MSTONE-051 End Date: row text and field label", () => {
    const fail = validateMilestones(dates({ EndDate: "2029-12-31" }), 0);
    expect(fail.EndDate.text).toBe("Check input for End Date.");
    expect(MILESTONE_FIELD_ERROR.EndDate).toBe("The date needs to be later than Cluster 6 date.");
  });

  it("UT-MSTONE-052 Sales Completion: row text and the 'sales starts' field label", () => {
    const fail = validateMilestones(dates({ SalesStartDate: "2031-07-01", StartCompleted: "2031-06-01" }), 0);
    expect(fail.StartCompleted.text).toBe("Check input for Sales Completion Date.");
    expect(fail.SalesStartDate.text).toBe("Check input for Sales Start Date.");
    expect(MILESTONE_FIELD_ERROR.StartCompleted).toBe("The date needs to be later than sales starts date.");
  });

  it("UT-MSTONE-053 every row text, verbatim, in the canvas order", () => {
    expect(MILESTONE_KEYS.map((k) => milestoneMeta(k).text)).toEqual([
      "Check input for Project Start date.", "Check input for Cluster 1 date.",
      "Check input for Cluster 2 date.", "Check input for Cluster 3 date.",
      "Check input for Cluster 4 date.", "Check input for Final Investment Decision date.",
      "Check input for Cluster 5 date.", "Check input for Cluster 6 Date.",
      "Check input for End Date.", "Check input for Sales Start Date.",
      "Check input for Sales Completion Date.", "Check input for Share of Farmdown [%].",
    ]);
    expect(requiredFieldsContent(validateMilestones(dates({ EndDate: null }), 0)))
      .toBe("Check input for End Date.\n");
  });
});

/* ═══════════════════════════════════════════════════════════════ the save gate */

describe("UT-MSTONE the save gate", () => {
  it("UT-MSTONE-014 save disabled when nothing is dirty", () => {
    expect(canSaveMilestones({
      perms: allowAll, project: project(), validation: allValid(), dirtyKeys: [],
    })).toBe(false);
  });

  it("UT-MSTONE-015 save disabled when any milestone is invalid", () => {
    const bad = validateMilestones(dates({ EndDate: "2029-01-01" }), 0);
    expect(canSaveMilestones({
      perms: allowAll, project: project(), validation: bad, dirtyKeys: ["EndDate"],
    })).toBe(false);
  });

  it("UT-MSTONE-016 save disabled without edit permission", () => {
    expect(canSaveMilestones({
      perms: { canCreate: true, canEdit: false }, project: project(),
      validation: allValid(), dirtyKeys: ["EndDate"],
    })).toBe(false);
  });

  it("UT-MSTONE-016b save enabled for a valid, dirty, permitted, unlocked form", () => {
    expect(canSaveMilestones({
      perms: allowAll, project: project(), validation: allValid(), dirtyKeys: ["EndDate"],
    })).toBe(true);
  });
});

/* ═══════════════════════════════════════════════════════════════ recalculation */

describe("UT-MSTONE recalculation", () => {
  const assumption: MilestoneAssumptionRow = {
    cluster1: 6, cluster2: 6, cluster3: 7, cluster4: 6, cluster5: 12,
    finalInvestmentDecision: 9, operationalLifetime: 300, salesStart: 3, salesEnd: 18,
  };

  it("UT-MSTONE-017 recalculate derives the next date from the assumption row", () => {
    const next = recalculateMilestone(
      formOf({ dates: dates({ FeasibilityStudies: "2026-01-31" }) }),
      "ProjectDevelopmentStarted", assumption,
    );
    expect(next.dates.ProjectDevelopmentStarted).toBe("2026-07-31");
    expect(next.standardAssumption.ProjectDevelopmentStarted).toBe(true);
  });

  it("UT-MSTONE-017b deriveNextDate is DateAddMonths", () => {
    expect(deriveNextDate("2026-01-31", 1)).toBe("2026-02-28");
    expect(deriveNextDate(null, 6)).toBeNull();
    expect(deriveNextDate("2026-01-31", null)).toBeNull();
  });

  it("UT-MSTONE-018 recalculate with a missing assumption row is a no-op", () => {
    const before = formOf();
    expect(recalculateMilestone(before, "ProjectDevelopmentStarted", null)).toBe(before);
    expect(recalculateMilestone(before, "ProjectDevelopmentStarted", undefined)).toBe(before);
    // A blank predecessor is also a no-op rather than a crash.
    const noSource = formOf({ dates: dates({ FeasibilityStudies: null }) });
    expect(recalculateMilestone(noSource, "ProjectDevelopmentStarted", assumption))
      .toBe(noSource);
  });

  it("UT-MSTONE-019 manual edit clears the standard-assumption flag", () => {
    const recalculated = recalculateMilestone(
      formOf({ dates: dates({ FeasibilityStudies: "2026-01-31" }) }),
      "ProjectDevelopmentStarted", assumption,
    );
    expect(recalculated.standardAssumption.ProjectDevelopmentStarted).toBe(true);
    const typed = editMilestone(recalculated, "ProjectDevelopmentStarted", "2026-09-01");
    expect(typed.dates.ProjectDevelopmentStarted).toBe("2026-09-01");
    expect(typed.standardAssumption.ProjectDevelopmentStarted).toBe(false);
  });
});

/* ═══════════════════════════════════════ GUIDE p16 — derived vs entered styling ════ */

describe("UT-MSTONE the derived-vs-entered classification (GUIDE p16)", () => {
  it("UT-MSTONE-054 the p16 fixture: Project Start, Cluster 1 and Cluster 3 stay plain", () => {
    const p16Form = formOf({
      standardAssumption: {
        // Cluster 1 and Cluster 3 were typed by hand — false, even though both carry a
        // standard-assumption flag structurally.
        FeasibilityStudies: false, ApplicationSubmitted: false,
        // Everything else in the p16 screenshot is italic blue — system-derived.
        ProjectDevelopmentStarted: true, LegallyBindingPermits: true,
        FinalInvestmentDecision: true, Construction: true, OperationsStartDate: true,
        SalesStartDate: true, StartCompleted: true,
      },
      isStandardShareOfFarmdown: true,
    });

    expect(isDerivedMilestone("StartDate", p16Form)).toBe(false);
    expect(isDerivedMilestone("FeasibilityStudies", p16Form)).toBe(false);
    expect(isDerivedMilestone("ApplicationSubmitted", p16Form)).toBe(false);

    expect(isDerivedMilestone("ProjectDevelopmentStarted", p16Form)).toBe(true);
    expect(isDerivedMilestone("LegallyBindingPermits", p16Form)).toBe(true);
    expect(isDerivedMilestone("FinalInvestmentDecision", p16Form)).toBe(true);
    expect(isDerivedMilestone("Construction", p16Form)).toBe(true);
    expect(isDerivedMilestone("OperationsStartDate", p16Form)).toBe(true);
    expect(isDerivedMilestone("SalesStartDate", p16Form)).toBe(true);
    expect(isDerivedMilestone("StartCompleted", p16Form)).toBe(true);
    expect(isDerivedMilestone("ShareOfFarmdown", p16Form)).toBe(true);

    const flags = classifyDerivedMilestones(p16Form);
    expect(flags.StartDate).toBe(false);
    expect(flags.FinalInvestmentDecision).toBe(true);
  });

  it("UT-MSTONE-055 typing over a derived date reclassifies it as entered", () => {
    const recalculated = recalculateMilestone(formOf(), "Construction", {
      cluster1: 6, cluster2: 6, cluster3: 7, cluster4: 6, cluster5: 12,
      finalInvestmentDecision: 9, operationalLifetime: null, salesStart: null, salesEnd: null,
    });
    expect(isDerivedMilestone("Construction", recalculated)).toBe(true);
    const typed = editMilestone(recalculated, "Construction", "2029-03-01");
    expect(isDerivedMilestone("Construction", typed)).toBe(false);
  });

  it("UT-MSTONE-056 the reset button restores Share of Farmdown to 50% and re-marks it derived", () => {
    // `Text(50, "##0.0")` once the input is Reset.
    expect(resetShareOfFarmdown()).toEqual({
      shareOfFarmdown: "50.0", isStandardShareOfFarmdown: true,
    });
    const edited = formOf({ shareOfFarmdown: "33.50", isStandardShareOfFarmdown: false });
    expect(isDerivedMilestone("ShareOfFarmdown", edited)).toBe(false);
    const reset = { ...edited, ...resetShareOfFarmdown() };
    expect(isDerivedMilestone("ShareOfFarmdown", reset)).toBe(true);
    expect(reset.shareOfFarmdown).toBe("50.0");
  });
});

/* ═══════════════════════════════════════════════════════ operational lifetime */

describe("UT-MSTONE operational lifetime", () => {
  it("UT-MSTONE-020 operational lifetime years/months", () => {
    const l = operationalLifetime("2027-01-01", "2056-12-31");
    expect(l.years).toBe(30);
    expect(l.months).toBe(0);
    expect(l.text).toBe("30 years 0 months");
  });

  it("UT-MSTONE-021 operational lifetime singular wording", () => {
    const l = operationalLifetime("2030-01-01", "2031-01-31");
    expect(l.years).toBe(1);
    expect(l.months).toBe(1);
    expect(l.text).toBe("1 year 1 month");
  });

  it("UT-MSTONE-021b the +1 day matters, and Power Fx counts month boundaries", () => {
    // Without the +1 day this would be 359 months, i.e. 29 years 11 months.
    expect(pfxMonthDiff("2027-01-01", "2057-01-01")).toBe(360);
    expect(operationalLifetime(null, "2056-12-31").text).toBe("0 years 0 months");
  });
});

/* ═════════════════════════════════════════════════════════════════ farmdown */

describe("UT-MSTONE share of farmdown", () => {
  it("UT-MSTONE-022 Share of Farmdown rejects three decimals", () => {
    expect(validateFarmdown("12.345")).toBe(false);
    expect(validateFarmdown("12.34")).toBe(true);
  });

  it("UT-MSTONE-023 Share of Farmdown rejects >100", () => {
    expect(validateFarmdown("120")).toBe(false);
    expect(validateFarmdown("")).toBe(false);
    expect(validateFarmdown("100")).toBe(true);
  });

  it("UT-MSTONE-023b farmdown is validated in the same pass as the dates", () => {
    expect(validateMilestones(dates(), 0, "120").ShareOfFarmdown.valid).toBe(false);
    expect(invalidMessages(validateMilestones(dates(), 0, "120")))
      .toContain("Check input for Share of Farmdown [%].");
  });
});

/* ═══════════════════════════════════════════════════════ skipped milestones */

describe("UT-MSTONE skipped milestones", () => {
  it("UT-MSTONE-024 skipped milestones cleared on save", () => {
    const patch = clearSkippedMilestones({
      startDate: CHAIN.StartDate, cluster1: CHAIN.FeasibilityStudies,
      cluster2: CHAIN.ProjectDevelopmentStarted, cluster3: CHAIN.ApplicationSubmitted,
      cluster4: CHAIN.LegallyBindingPermits,
    }, 4);
    expect(patch[PROJECT_COL.projectStartDate]).toBeNull();
    expect(patch[PROJECT_COL.feasibilityStudies]).toBeNull();
    expect(patch[PROJECT_COL.projectDevelopmentStarted]).toBeNull();
    expect(patch[PROJECT_COL.applicationSubmitted]).toBeNull();
    expect(patch[PROJECT_COL.legallyBindingPermits]).toBe(CHAIN.LegallyBindingPermits);
    expect(patch[PROJECT_COL.isProjectDevelopmentStd]).toBe(false);
    expect(patch[PROJECT_COL.isApplicationSubmittedStd]).toBe(false);
  });

  it("UT-MSTONE-024b the save applies the same rule General Data's panel applies", () => {
    const plan = planSaveMilestones({
      project: project({ startCluster: 4 }), form: formOf(),
      repricedGenerators: null, revenueDraft: null, language: "en-US",
    });
    const data = plan.writes[0]!.data!;
    expect(data[PROJECT_COL.projectStartDate]).toBeNull();
    expect(data[PROJECT_COL.applicationSubmitted]).toBeNull();
    expect(data[PROJECT_COL.isApplicationSubmittedStd]).toBe(false);
  });
});

/* ══════════════════════════════════════════════════════════ FID re-pricing */

describe("UT-MSTONE FID-driven re-pricing", () => {
  it("UT-MSTONE-025 accumulated price index formula", () => {
    const index = accumulatedIndex(
      "2030-06-15",
      { fidYear: 2030, annualIndex: null, accumulatedIndex: 1.16 },
      { fidYear: 2029, annualIndex: null, accumulatedIndex: 1.10 },
    );
    expect(index).toBeCloseTo(1.13, 10);
  });

  it("UT-MSTONE-025b SOURCE DEFECT: a missing inflation row skips re-pricing (canvas: blanks are 0)", () => {
    const cur = { fidYear: 2030, annualIndex: null, accumulatedIndex: 1.16 };
    expect(accumulatedIndex("2030-06-15", null, null)).toBeNull();
    expect(accumulatedIndex("2030-06-15", cur, null)).toBeNull();
    expect(accumulatedIndex(null, cur, cur)).toBeNull();
    // The canvas: Blank is 0 — no rows at all gives index 0 (every cost written as 0).
    expect(accumulatedIndexCanvasParity("2030-06-15", null, null)).toBe(0);
    expect(accumulatedIndexCanvasParity("2030-06-15", cur, null)).toBeCloseTo(0.58, 10);
  });

  it("UT-MSTONE-026 FID change flags plant-cost recalculation", () => {
    expect(needsPlantCostRecalculation("2028-06-01", "2029-06-01")).toBe(true);
  });

  it("UT-MSTONE-027 setting FID to the same value does not flag recalculation", () => {
    expect(needsPlantCostRecalculation("2028-06-01", "2028-06-01")).toBe(false);
  });

  it("UT-MSTONE-027b the price ladder tops out at the 5-WTG price and ALWAYS adds the foundation (canvas)", () => {
    const priced = repriceGenerators([
      { id: "a", count: 3, wtgPrices: [10, 9, 8, 7, 6], additionalFoundationCost: 1,
        foundationCostIncluded: true, generatorsCost: 0 },
      { id: "b", count: 9, wtgPrices: [10, 9, 8, 7, 6], additionalFoundationCost: 2,
        foundationCostIncluded: false, generatorsCost: 0 },
    ], 2);
    // 3 WTG at price rung 3 (8) + 1 foundation — added although "included" (D26 M4) — × index 2 → 18 each → 54
    expect(priced[0]!.generatorsCost).toBe(54);
    // 9 WTG falls back to the 5-WTG price (6) + 2 foundation, × index 2 → 16 each → 144
    expect(priced[1]!.generatorsCost).toBe(144);
  });

  it("UT-MSTONE-028 plant cost written as the generator sum", () => {
    const repriced: ProjectGenerator[] = [
      { id: "g1", count: 1, wtgPrices: [10], additionalFoundationCost: null,
        foundationCostIncluded: true, generatorsCost: 10 },
      { id: "g2", count: 1, wtgPrices: [20], additionalFoundationCost: null,
        foundationCostIncluded: true, generatorsCost: 20 },
      { id: "g3", count: 1, wtgPrices: [30], additionalFoundationCost: null,
        foundationCostIncluded: true, generatorsCost: 30 },
    ];
    expect(plantWtgCost(repriced)).toBe(60);
    const plan = planSaveMilestones({
      project: project(), form: formOf(), repricedGenerators: repriced,
      revenueDraft: null, language: "en-US",
    });
    // The canvas order (Y:445-466): project patch, the generators, then the plant cost patch.
    expect(plan.writes.map((w) => w.entitySet)).toEqual([
      ES.projects, ES.generatorTypeInProjects, ES.generatorTypeInProjects, ES.generatorTypeInProjects, ES.projects,
    ]);
    expect(plan.writes[0]!.data![PROJECT_COL.plantWtgCost]).toBeUndefined();
    expect(plan.writes[1]!.data).toEqual({ vsb_generatorscost: 10 });
    expect(plan.writes[4]!.data).toEqual({ [PROJECT_COL.plantWtgCost]: 60 });
    expect(plan.log).toEqual([
      "Project data was saved/updated successfully.",
      "Plant WTG Cost (WTG's: 3), was recalculated and updated successfully.",
    ]);
  });
});

/* ═════════════════════════════════════════════════════════════ the COD guard */

describe("UT-MSTONE the COD guard", () => {
  it("UT-MSTONE-029 COD change with individual-volume contracts blocks save", () => {
    expect(codChangeBlocksSave(true, true, 1)).toBe(true);
  });

  it("UT-MSTONE-030 COD change with no such contracts saves normally", () => {
    expect(codChangeBlocksSave(true, true, 0)).toBe(false);
    expect(codChangeBlocksSave(false, true, 3)).toBe(false);
    expect(codChangeBlocksSave(true, false, 3)).toBe(false);
  });
});

/* ═══════════════════════════════════════════════════════════ milestone labels */

describe("UT-MSTONE milestone labels", () => {
  it("UT-MSTONE-046 milestone labels sorted numerically, not by Text(Order)", () => {
    const states = [10, 2, 1, 3].map((order) => ({
      name: `Cluster ${order}`, order, isVisibleOnChecklist: true,
      clusterDescription: `Desc ${order}`,
    }));
    expect(milestoneLabels(states)).toEqual(["Desc 1", "Desc 2", "Desc 3", "Desc 10"]);
  });

  it("UT-MSTONE-046b non-checklist states and Order 0 are excluded", () => {
    const labels = milestoneLabels([
      { name: "Draft", order: 0, isVisibleOnChecklist: true, clusterDescription: "Draft" },
      { name: "Archived", order: 9, isVisibleOnChecklist: false, clusterDescription: "Arch" },
      { name: "Cluster 1", order: 1, isVisibleOnChecklist: true, clusterDescription: "C1" },
    ]);
    expect(labels).toEqual(["C1"]);
  });
});

/* ═══════════════════════════════════════════════════════ the revenue seed */

const REVENUE_ROWS = (country: string, type: string): RevenueAssumptionRow[] => [
  { country, valuetype: "revenuetype", category: null, pv: type, wind: type },
  { country, valuetype: "contractdurationyear", category: null, pv: "20", wind: "20" },
  { country, valuetype: "contractdurationmonth", category: null, pv: "0", wind: "0" },
  { country, valuetype: "hedgedvolume", category: null, pv: "80", wind: "80" },
  { country, valuetype: "price", category: "2029", pv: "40", wind: "45" },
  { country, valuetype: "price", category: "2030", pv: "50", wind: "60" },
  { country, valuetype: "price", category: "2031", pv: "55", wind: "65" },
  { country, valuetype: "inflation", category: "useinflation", pv: "true", wind: "true" },
  { country, valuetype: "inflation", category: "usecountryinflation", pv: "false", wind: "false" },
  { country, valuetype: "inflation", category: "inflationprofile", pv: "2", wind: "2" },
  { country, valuetype: "inflation", category: "inflationstartyear",
    pv: "finalinvestmentdecision", wind: "finalinvestmentdecision" },
];

describe("UT-MSTONE the default revenue seed", () => {
  it("UT-MSTONE-031 revenue seed only for Draft or Cluster 1 with no rows", () => {
    expect(buildDefaultRevenue({
      project: project({ clusterStateName: "Cluster 3" }), dates: dates(),
      assumptions: REVENUE_ROWS("Germany", "fit"), existingRevenueCount: 0,
      currencyId: "cur-1", subaccountId: "sub-1", owningBusinessUnitId: "bu-de",
    })).toBeNull();

    expect(buildDefaultRevenue({
      project: project({ clusterStateName: "Cluster 1" }), dates: dates(),
      assumptions: REVENUE_ROWS("Germany", "fit"), existingRevenueCount: 0,
      currencyId: "cur-1", subaccountId: "sub-1", owningBusinessUnitId: "bu-de",
    })).not.toBeNull();
  });

  it("UT-MSTONE-032 revenue seed skipped when rows already exist", () => {
    expect(buildDefaultRevenue({
      project: project(), dates: dates(),
      assumptions: REVENUE_ROWS("Germany", "fit"), existingRevenueCount: 2,
      currencyId: null, subaccountId: null, owningBusinessUnitId: null,
    })).toBeNull();

    const plan = planSaveMilestones({
      project: project(), form: formOf(), repricedGenerators: null,
      revenueDraft: null, language: "en-US",
    });
    expect(plan.writes.some((w) => w.entitySet === ES.projectRevenues)).toBe(false);
  });

  it("UT-MSTONE-032b a country with no revenue type seeds nothing", () => {
    expect(buildDefaultRevenue({
      project: project(), dates: dates(),
      assumptions: REVENUE_ROWS("Germany", "unknown"), existingRevenueCount: 0,
      currencyId: null, subaccountId: null, owningBusinessUnitId: null,
    })).toBeNull();
  });

  it("UT-MSTONE-033 revenue label resolved from the assumption row", () => {
    const row = { country: "Germany", valuetype: "revenuetype", category: null,
      pv: "fit", wind: "ppa" };
    expect(revenueLabelFor("PV", row)).toBe("FiT");
    expect(revenueLabelFor("Wind", row)).toBe("FiT"); // SOURCE DEFECT: reads .pv
    expect(revenueLabelFor("Wind", row, { fixWindDefect: true })).toBe("PPA");
    expect(revenueLabelFor("Storage", row)).toBeNull();
    expect(revenueLabelFor("PV", undefined)).toBeNull();
  });

  it("UT-MSTONE-034 Italian region mapping", () => {
    expect(italianRegion("Sicilia")).toBe("Italy_Sicily");
    expect(italianRegion("Lazio")).toBe("Italy_Centre-South");
    expect(italianRegion("Toscana")).toBe("Italy_Centre-North");
    expect(italianRegion("Lombardia")).toBe("Italy_North");
    expect(italianRegion("Calabria")).toBe("Italy_Calabria");
    expect(italianRegion("Bayern")).toBeNull();
    expect(italianRegion(null)).toBeNull();
  });

  it("UT-MSTONE-035 Italian description format", () => {
    expect(describeRevenue({
      countryName: "Italy", areaName: "Lazio", revenueLabel: "FiT",
    })).toBe("Standard FiT Italy - Centre-South"); // 1.21.753 zone spelling
  });

  it("UT-MSTONE-036 German FiT description uses EEG", () => {
    expect(describeRevenue({ countryName: "Germany", areaName: null, revenueLabel: "FiT" }))
      .toBe("Standard EEG Germany");
    expect(describeRevenue({ countryName: "France", areaName: null, revenueLabel: "FiT" }))
      .toBe("Standard CfD France");
    expect(describeRevenue({ countryName: "Poland", areaName: null, revenueLabel: "PPA" }))
      .toBe("Standard PPA Poland");
  });

  it("UT-MSTONE-037 contract end date is start + years + months − 1 day", () => {
    expect(contractDates("2030-01-01", 20, 0))
      .toEqual({ start: "2030-01-01", end: "2049-12-31" });
    expect(contractDates("2030-01-01", 20, 6).end).toBe("2050-06-30");
    expect(contractDates(null, 20, 0)).toEqual({ start: null, end: null });
  });

  it("UT-MSTONE-038 price picked by exact COD year", () => {
    expect(pickPrice(REVENUE_ROWS("Germany", "fit"), "Wind", 2030)).toBe(60);
    expect(pickPrice(REVENUE_ROWS("Germany", "fit"), "PV", 2030)).toBe(50);
  });

  it("UT-MSTONE-039 price clamps below the first year and above the last", () => {
    expect(pickPrice(REVENUE_ROWS("Germany", "fit"), "Wind", 2020)).toBe(45);
    expect(pickPrice(REVENUE_ROWS("Germany", "fit"), "Wind", 2040)).toBe(65);
    expect(pickPrice([], "Wind", 2030)).toBeNull();
  });

  it("UT-MSTONE-040 German FiT non-PV sets bidding price and correction factor 1", () => {
    const draft = buildDefaultRevenue({
      project: project({ countryName: "Germany", technology: "Wind" }),
      dates: dates(), assumptions: REVENUE_ROWS("Germany", "fit"),
      existingRevenueCount: 0, currencyId: "cur-1", subaccountId: "sub-1",
      owningBusinessUnitId: "bu-de",
    })!;
    expect(draft.derived.label).toBe("FiT");
    expect(draft.derived.price).toBe(60);
    expect(draft.derived.biddingPrice).toBe(60);
    expect(draft.derived.correctionFactor).toBe(1.0);
    expect(draft.data["vsb_isbiddingpricestandardassumption"]).toBe(true);
    expect(draft.data["vsb_iscorrectionfactorstandardassumption"]).toBe(true);
    // The p90 pair tests `= Wind`, not `<> PV`.
    expect(draft.data["vsb_iscorrectionfactorp90standardassumption"]).toBe(true);
  });

  it("UT-MSTONE-041 non-German contract gets zero bidding price", () => {
    const draft = buildDefaultRevenue({
      project: project({ countryName: "France", technology: "PV" }),
      dates: dates(), assumptions: REVENUE_ROWS("France", "ppa"),
      existingRevenueCount: 0, currencyId: "cur-1", subaccountId: "sub-1",
      owningBusinessUnitId: "bu-fr",
    })!;
    expect(draft.derived.label).toBe("PPA");
    expect(draft.derived.biddingPrice).toBe(0);
    expect(draft.derived.correctionFactor).toBe(0);
    expect(draft.data["vsb_isbiddingpricestandardassumption"]).toBe(false);
  });

  it("UT-MSTONE-042 inflation start year resolves from the token", () => {
    const s = inflationSettings(REVENUE_ROWS("Germany", "fit"), "Wind", dates());
    expect(s.startYear).toBe(2028); // the chain's FID year
    expect(s.useInflation).toBe(true);
    expect(s.useCountryInflation).toBe(false);
    expect(s.customProfile).toBe(2);

    const codToken = inflationSettings([
      { country: "Germany", valuetype: "inflation", category: "inflationstartyear",
        pv: "operationstartdatecod", wind: "operationstartdatecod" },
    ], "Wind", dates());
    expect(codToken.startYear).toBe(2030);
  });

  it("UT-MSTONE-042b the seed carries the contract dates and the project binding", () => {
    const draft = buildDefaultRevenue({
      project: project(), dates: dates(), assumptions: REVENUE_ROWS("Germany", "fit"),
      existingRevenueCount: 0, currencyId: "cur-1", subaccountId: "sub-1",
      owningBusinessUnitId: "bu-de",
    })!;
    expect(draft.derived.contractStart).toBe("2030-01-01");
    expect(draft.derived.contractEnd).toBe("2049-12-31");
    expect(draft.data["vsb_Project@odata.bind"]).toBe(`/${ES.projects}(p-1)`);
    expect(draft.data["vsb_Currency@odata.bind"]).toBe(`/${ES.currencies}(cur-1)`);
    expect(draft.data["vsb_label"]).toBe(CHOICE.revenueLabel.fit);
    expect(draft.data["vsb_name"]).toBe("Nordwind-FiT-Standard EEG Germany");
  });
});

/* ═════════════════════════════════════════════════════════════ the save plan */

describe("UT-MSTONE canvas 1.21.753 — the Italian revenue slice", () => {
  const ITALY = (): RevenueAssumptionRow[] => [
    ...REVENUE_ROWS("Italy", "ppa").filter((r) => r.valuetype !== "price"),
    { country: "Italy_North", valuetype: "price", category: "2030", pv: "70", wind: "71" },
    { country: "Italy_Centre-South", valuetype: "price", category: "2030", pv: "80", wind: "81" },
    { country: "Italy_Centre-South", valuetype: "revenuetype", category: null, pv: "fit", wind: "fit" },
  ];

  it("UT-MSTONE-057 the slice is every Italy* row for Italy, the exact country otherwise", () => {
    expect(isInRevenueSlice("Italy", "Italy")).toBe(true);
    expect(isInRevenueSlice("Italy_Centre-South", "Italy")).toBe(true);
    expect(isInRevenueSlice("Germany", "Italy")).toBe(false);
    expect(isInRevenueSlice("Germany", "Germany")).toBe(true);
    expect(isInRevenueSlice("Italy_North", "Germany")).toBe(false);
  });

  it("UT-MSTONE-058 an Italian seed prices from its own zone, and its type from the Italy row", () => {
    const pool = revenuePricePool(ITALY(), "Italy", "Lazio");
    expect(pool.map((r) => r.country)).toEqual(["Italy_Centre-South"]);
    expect(revenuePricePool(ITALY(), "Italy", "Bayern")).toEqual([]);
    expect(revenuePricePool(REVENUE_ROWS("Germany", "fit"), "Germany", null)).toHaveLength(3);

    const draft = buildDefaultRevenue({
      project: project({ countryName: "Italy", areaName: "Lazio", technology: "Wind" }),
      dates: dates(), assumptions: ITALY(),
      existingRevenueCount: 0, currencyId: "cur-1", subaccountId: "sub-1",
      owningBusinessUnitId: "bu-it",
    });
    // `recRevenueTypeRecordForCountry` reads country = "Italy" (ppa) — not the zone's fit row.
    expect(draft?.derived.label).toBe("PPA");
    // Lazio → Italy_Centre-South → 81 for wind in 2030 (the fixture COD year).
    expect(draft?.derived.price).toBe(81);
  });
});

describe("UT-MSTONE the save plan", () => {
  it("UT-MSTONE-043 save resets dirty and valid state, and logs its steps", () => {
    const draft = buildDefaultRevenue({
      project: project(), dates: dates(), assumptions: REVENUE_ROWS("Germany", "fit"),
      existingRevenueCount: 0, currencyId: null, subaccountId: null,
      owningBusinessUnitId: null,
    });
    const plan = planSaveMilestones({
      project: project(), form: formOf(), repricedGenerators: null,
      revenueDraft: draft, language: "en-US",
    });
    // The canvas seeds silently after its Notify: no invented step text (D26).
    expect(plan.log).toEqual(["Project data was saved/updated successfully."]);
    expect(plan.writes.filter((w) => w.entitySet === ES.projectRevenues)).toHaveLength(1);
  });

  it("UT-MSTONE-043b the patch carries the lifetime string, farmdown and business unit", () => {
    const plan = planSaveMilestones({
      project: project(), form: formOf({ shareOfFarmdown: "33.5" }),
      repricedGenerators: null, revenueDraft: null, language: "en-US",
    });
    const data = plan.writes[0]!.data!;
    expect(data[PROJECT_COL.operationalLifetime])
      .toBe(operationalLifetime(CHAIN.OperationsStartDate, CHAIN.EndDate).text);
    expect(data[PROJECT_COL.shareOfFarmdown]).toBe(33.5);
    expect(data["owningbusinessunit@odata.bind"]).toBe("/businessunits(bu-de)");
    // One Projects write only when the FID did not move.
    expect(plan.writes.filter((w) => w.entitySet === ES.projects)).toHaveLength(1);
  });

  it("UT-MSTONE-045 leaving with dirty milestones prompts", () => {
    expect(shouldConfirmLeave(["EndDate"] as MilestoneKey[])).toBe(true);
    expect(shouldConfirmLeave([])).toBe(false);
  });

  it("UT-MSTONE-045b an empty chain has an empty date record for every key", () => {
    expect(Object.keys(emptyMilestoneDates)).toHaveLength(MILESTONE_KEYS.length - 1);
  });
});

describe("UT-MSTONE field visibility and screen copy", () => {
  it("UT-MSTONE-059 date containers up to Cluster 4 hide once the start cluster passes them", () => {
    expect(isMilestoneFieldVisible("StartDate", 0)).toBe(true);
    expect(isMilestoneFieldVisible("StartDate", 1)).toBe(false);
    expect(isMilestoneFieldVisible("FeasibilityStudies", 1)).toBe(true);
    expect(isMilestoneFieldVisible("FeasibilityStudies", 2)).toBe(false);
    expect(isMilestoneFieldVisible("LegallyBindingPermits", 5)).toBe(false);
    expect(isMilestoneFieldVisible("FinalInvestmentDecision", 6)).toBe(true);
    expect(isMilestoneFieldVisible("EndDate", 6)).toBe(true);
    expect(isMilestoneFieldVisible("StartDate", null)).toBe(true);
  });

  it("UT-MSTONE-060 recalculate buttons render for Wind and PV only", () => {
    expect(isRecalculateVisible("Wind")).toBe(true);
    expect(isRecalculateVisible("PV")).toBe(true);
    expect(isRecalculateVisible("Hybrid")).toBe(false);
    expect(isRecalculateVisible(null)).toBe(false);
  });

  it("UT-MSTONE-061 the farmdown error picks the blank or the format message", () => {
    expect(farmdownError("")).toBe(MILESTONES_MSG.farmdownBlank);
    expect(farmdownError("100.123")).toBe(MILESTONES_MSG.farmdownFormat);
    expect(farmdownError("150")).toBe(MILESTONES_MSG.farmdownFormat);
    expect(farmdownError("50")).toBeNull();
  });

  it("UT-MSTONE-062 the field error copy is the canvas label text", () => {
    expect(MILESTONE_FIELD_ERROR.StartDate).toBe("The Project Start Date cannot be empty.");
    expect(MILESTONE_FIELD_ERROR.SalesStartDate).toBeUndefined();
    expect(MILESTONE_FIELD_ERROR.LegallyBindingPermits).toBe("The date needs to be later than Cluster 3 date.");
  });
});

/* ═════════════════════════════════════════════════ D26 — connected-screen rules */

const ROW: MilestoneAssumptionRow = {
  cluster1: 17, cluster2: 18, cluster3: 30, cluster4: 6, cluster5: 12,
  finalInvestmentDecision: 9, operationalLifetime: 300, salesStart: 3, salesEnd: 18,
};

describe("UT-MSTONE the CalendarAdd buttons (D26)", () => {
  it("UT-MSTONE-063 each button reads the canvas predecessor and duration column", () => {
    expect(RECALC_SOURCE.Construction).toEqual({ from: "FinalInvestmentDecision", months: "finalInvestmentDecision" });
    expect(RECALC_SOURCE.OperationsStartDate).toEqual({ from: "Construction", months: "cluster5" });
    expect(RECALC_SOURCE.SalesStartDate).toEqual({ from: "LegallyBindingPermits", months: "salesStart" });
    expect(RECALC_SOURCE.StartCompleted).toEqual({ from: "FinalInvestmentDecision", months: "salesEnd" });
    const f = formOf();
    expect(recalculateMilestone(f, "Construction", ROW).dates.Construction).toBe("2029-03-01");
    expect(recalculateMilestone(f, "OperationsStartDate", ROW).dates.OperationsStartDate).toBe("2030-01-01");
    expect(recalculateMilestone(f, "SalesStartDate", ROW).dates.SalesStartDate).toBe("2028-04-01");
    const done = recalculateMilestone(f, "StartCompleted", ROW);
    expect(done.dates.StartCompleted).toBe("2029-12-01");
    expect(done.standardAssumption.StartCompleted).toBe(true);
  });

  it("UT-MSTONE-064 End Date = COD + Operational Lifetime − 1 day, 30 × 12 months without a row", () => {
    const f = formOf();
    expect(recalculateMilestone(f, "EndDate", ROW).dates.EndDate).toBe("2054-12-31");
    const noRow = recalculateMilestone(f, "EndDate", null);
    expect(noRow.dates.EndDate).toBe("2059-12-31");
    expect(noRow.standardAssumption.EndDate).toBe(true);
  });

  it("UT-MSTONE-065 SOURCE DEFECT: no assumption row is a no-op; the canvas copies the predecessor", () => {
    const f = formOf();
    expect(recalculateMilestone(f, "Construction", null)).toBe(f);
    const parity = recalculateMilestoneCanvasParity(f, "Construction", null);
    expect(parity.dates.Construction).toBe(f.dates.FinalInvestmentDecision);
    expect(parity.standardAssumption.Construction).toBe(true);
    expect(validateMilestones(parity.dates, 0).Construction.valid).toBe(false);
  });

  it("UT-MSTONE-066 a button is enabled once the date it reads is set — no lock gate", () => {
    expect(isRecalculateEnabled("Construction", dates())).toBe(true);
    expect(isRecalculateEnabled("Construction", dates({ FinalInvestmentDecision: null }))).toBe(false);
    expect(isRecalculateEnabled("SalesStartDate", dates({ LegallyBindingPermits: null }))).toBe(false);
  });

  it("UT-MSTONE-067 durations are whole months and dates use local parts", () => {
    expect(deriveNextDate("2026-01-31", 1.9)).toBe("2026-02-28");
    expect(deriveNextDate("2026-12-31", 2)).toBe("2027-02-28");
  });
});

describe("UT-MSTONE field errors, dirty rows and Cancel (D26)", () => {
  it("UT-MSTONE-068 the field error hides while the predecessor is blank (Power Fx blank compare)", () => {
    const d = dates({ LegallyBindingPermits: null });
    expect(isMilestoneFieldErrorVisible("FinalInvestmentDecision", d, 0)).toBe(false);
    expect(validateMilestones(d, 0).FinalInvestmentDecision.valid).toBe(false);
    expect(isMilestoneFieldErrorVisible("FinalInvestmentDecision", dates({ FinalInvestmentDecision: null }), 0)).toBe(true);
    expect(isMilestoneFieldErrorVisible("FinalInvestmentDecision", dates({ FinalInvestmentDecision: "2027-01-01" }), 0)).toBe(true);
    // FID is not compared to Cluster 4 at start cluster 5.
    expect(isMilestoneFieldErrorVisible("FinalInvestmentDecision", dates({ FinalInvestmentDecision: "2027-01-01" }), 5)).toBe(false);
    expect(isMilestoneFieldErrorVisible("EndDate", dates({ OperationsStartDate: null }), 0)).toBe(false);
    expect(isMilestoneFieldErrorVisible("EndDate", dates({ EndDate: null }), 0)).toBe(true);
    expect(isMilestoneFieldErrorVisible("StartDate", dates({ StartDate: null }), 1)).toBe(false);
    expect(isMilestoneFieldErrorVisible("FeasibilityStudies", dates({ FeasibilityStudies: null }), 1)).toBe(true);
    expect(isMilestoneFieldErrorVisible("SalesStartDate", dates({ SalesStartDate: null }), 0)).toBe(false);
    expect(isMilestoneFieldErrorVisible("Construction", dates(), 0)).toBe(false);
  });

  it("UT-MSTONE-069 typing the stored FID back clears its Dirty row; a button always sets it", () => {
    const stored = "2028-06-01";
    const moved = nextDirtyKeys([], "FinalInvestmentDecision", { via: "edit", storedFid: stored, value: "2029-01-01" });
    expect(moved).toEqual(["FinalInvestmentDecision"]);
    expect(nextDirtyKeys(moved, "FinalInvestmentDecision", { via: "edit", storedFid: stored, value: stored })).toEqual([]);
    expect(nextDirtyKeys([], "FinalInvestmentDecision", { via: "recalculate" })).toEqual(["FinalInvestmentDecision"]);
    expect(nextDirtyKeys([], "EndDate", { via: "edit", value: CHAIN.EndDate })).toEqual(["EndDate"]);
    expect(sameDate("2028-06-01", "2028-06-01T00:00:00.000Z")).toBe(true);
  });

  it("UT-MSTONE-070 SOURCE DEFECT: Cancel returns to the page-entry state; the canvas kept farmdown and Dirty", () => {
    const p = project({ shareOfFarmdown: 40 });
    const typed = { ...initialForm(p), shareOfFarmdown: "12", dates: dates({ EndDate: "2060-01-01" }) };
    const fixed = cancelMilestones(p);
    expect(fixed.form).toEqual(initialForm(p));
    expect(fixed.dirtyKeys).toEqual([]);
    const parity = cancelMilestonesCanvasParity(p, typed, ["EndDate", "ShareOfFarmdown"]);
    expect(parity.form.dates.EndDate).toBe(CHAIN.EndDate);
    expect(parity.form.shareOfFarmdown).toBe("12");
    expect(parity.dirtyKeys).toEqual(["EndDate", "ShareOfFarmdown"]);
  });

  it("UT-MSTONE-071 Share of Farmdown renders as ##0.0 with the language's separator", () => {
    expect(formatFarmdown(50)).toBe("50.0");
    expect(formatFarmdown(12.25)).toBe("12.3");
    expect(formatFarmdown(100, "de-DE")).toBe("100,0");
    expect(resetShareOfFarmdown("de-DE").shareOfFarmdown).toBe("50,0");
  });
});

describe("UT-MSTONE FID re-pricing and the save order (D26)", () => {
  it("UT-MSTONE-072 SOURCE DEFECT: the saved FID decides re-pricing; the canvas needs a TYPED FID", () => {
    expect(needsPlantCostRecalculation("2028-06-01", "2028-09-01")).toBe(true);
    // Set by the CalendarAdd button only: the canvas never re-prices.
    expect(needsPlantCostRecalculationCanvasParity("2028-06-01", undefined)).toBe(false);
    expect(needsPlantCostRecalculationCanvasParity("2028-06-01", "2028-09-01")).toBe(true);
    expect(needsPlantCostRecalculationCanvasParity("2028-06-01", "2028-06-01")).toBe(false);
  });

  it("UT-MSTONE-073 a blank rung price is 0, not the 5-WTG price, and costs are not rounded", () => {
    const [g] = repriceGenerators([
      { id: "a", count: 2, wtgPrices: [10, null, 8, 7, 6], additionalFoundationCost: 1,
        foundationCostIncluded: false, generatorsCost: 99 },
    ], 1.0333);
    expect(g!.generatorsCost).toBeCloseTo(2 * 1 * 1.0333, 10);
    const [h] = repriceGenerators([
      { id: "b", count: 3, wtgPrices: [10, 9, 8.123, 7, 6], additionalFoundationCost: null,
        foundationCostIncluded: true, generatorsCost: 0 },
    ], 1.111);
    expect(h!.generatorsCost).toBe(3 * (8.123 * 1.111));
  });

  it("UT-MSTONE-080 M4 canvas behaviour: Text(Yes/No) is never \"Yes\", so the foundation is always added; the boolean reading is the twin", () => {
    const gens: ProjectGenerator[] = [
      { id: "inc", count: 2, wtgPrices: [10, 9, 8, 7, 6], additionalFoundationCost: 1.5,
        foundationCostIncluded: true, generatorsCost: 0 },
      { id: "exc", count: 2, wtgPrices: [10, 9, 8, 7, 6], additionalFoundationCost: 1.5,
        foundationCostIncluded: false, generatorsCost: 0 },
    ];
    // live (canvas): (9 + 1.5) × 2 × 2 WTG = 42 for both rows, whatever the flag
    expect(repriceGenerators(gens, 2).map((g) => g.generatorsCost)).toEqual([42, 42]);
    // twin (NOT live): an included foundation adds nothing → 9 × 2 × 2 = 36
    expect(repriceGeneratorsBooleanReading(gens, 2).map((g) => g.generatorsCost)).toEqual([36, 42]);
  });

  it("UT-MSTONE-074 the owner bind is left out when the country has no business unit", () => {
    const plan = planSaveMilestones({
      project: project({ countryBusinessUnitId: null }), form: formOf(),
      repricedGenerators: null, revenueDraft: null, language: "en-US",
    });
    expect("owningbusinessunit@odata.bind" in plan.writes[0]!.data!).toBe(false);
    expect(plan.writes[0]!.reason).toBeTruthy();
  });

  it("UT-MSTONE-075 every save writes COD, Construction, End Date and the Cluster 2 flag column", () => {
    const data = planSaveMilestones({
      project: project(), form: formOf({ standardAssumption: { ProjectDevelopmentStarted: true } }),
      repricedGenerators: null, revenueDraft: null, language: "en-US",
    }).writes[0]!.data!;
    expect(data[PROJECT_COL.cod]).toBe(CHAIN.OperationsStartDate);
    expect(data[PROJECT_COL.construction]).toBe(CHAIN.Construction);
    expect(data[PROJECT_COL.endDate]).toBe(CHAIN.EndDate);
    // 'Is 2-Project development Standard Assumption ?' (resolved in D25).
    expect(data.vsb_feasibilitystudiesstandardassumption).toBe(true);
  });
});

describe("UT-MSTONE footer, notices and pinned option values (D26)", () => {
  it("UT-MSTONE-076 option values match the pac-generated enums", () => {
    expect(Vsb_projectrevenuesvsb_hedgetype[HEDGE_TYPE_INDIVIDUAL_VOLUMES]).toBe("IndividualVolumes");
    expect(Vsb_fabricsyncjobsvsb_jobstatuscode[FABRIC_JOB_STATUS.inProgress]).toBe("InProgress");
    expect(Vsb_fabricsyncjobsvsb_jobstatuscode[FABRIC_JOB_STATUS.importing]).toBe("Importing");
    expect(Vsb_projectrevenuesvsb_label[CHOICE.revenueLabel.fit]).toBe("FiT");
    expect(Vsb_projectrevenuesvsb_label[CHOICE.revenueLabel.ppa]).toBe("PPA");
    // The recalculate buttons compare the technology LABEL.
    expect(Vsb_projectsvsb_technology[952850000]).toBe("Wind");
    expect(Vsb_projectsvsb_technology[952850001]).toBe("PV");
  });

  it("UT-MSTONE-077 the footer stamps are ShortDateTime24", () => {
    const local = new Date(2026, 8, 3, 14, 5);
    expect(formatShortDateTime24(local.toISOString(), "en-GB")).toBe("03/09/2026 14:05");
    // The product owner's canvas screenshot (en-US): "4/7/2025 22:08".
    expect(formatShortDateTime24(new Date(2025, 3, 7, 22, 8).toISOString(), "en-US")).toBe("4/7/2025 22:08");
    expect(formatShortDateTime24(new Date(2025, 3, 7, 9, 5).toISOString(), "de-DE")).toBe("07.04.2025 09:05");
    expect(formatShortDateTime24(null, "en-GB")).toBe("");
  });

  it("UT-MSTONE-078 the revenue-seed notice shows only while the canvas seed would run", () => {
    expect(revenueSeedWouldRun(project({ clusterStateName: "Draft" }), 0)).toBe(true);
    expect(revenueSeedWouldRun(project({ clusterStateName: "Cluster 1" }), 0)).toBe(true);
    expect(revenueSeedWouldRun(project({ clusterStateName: "Cluster 2" }), 0)).toBe(false);
    expect(revenueSeedWouldRun(project(), 1)).toBe(false);
    expect(revenueSeedWouldRun(null, 0)).toBe(false);
  });

  it("UT-MSTONE-079 the farmdown tooltip keeps its three canvas lines", () => {
    expect(MILESTONES_MSG.farmdownInfo.split("\n")).toEqual([
      "0%     : Project will remain fully at VSB",
      "50%   : Standard farmdown approach",
      "100% : Project will be fully sold",
    ]);
  });
});

describe("D35 — the shared leave guard", () => {
  it("UT-MSTONE-910 the leave dialog texts are the canvas ones, verbatim", () => {
    expect(MS_LEAVE_DIALOG).toEqual({ title: "Unsaved data", description: "You have unsaved data. Do you really want to leave current form without saving?", confirm: "Yes", cancel: "Cancel" });
  });
});
