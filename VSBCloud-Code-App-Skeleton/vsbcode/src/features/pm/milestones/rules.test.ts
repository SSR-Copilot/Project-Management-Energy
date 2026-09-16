/**
 * Project General Milestones Screen — unit tests.
 * IDs are the spec's (UT-MSTONE-nnn). Pure functions only.
 */
import { describe, it, expect } from "vitest";
import { ES, CHOICE } from "@/data/entities";
import { PROJECT_COL } from "@/features/pm/general-data/rules";
import {
  MILESTONE_KEYS, emptyMilestoneDates, validateMilestones, validateFarmdown,
  invalidMessages, isPageLocked, canSaveMilestones, initialDates, initialForm,
  recalculateMilestone, editMilestone, deriveNextDate, operationalLifetime, pfxMonthDiff,
  accumulatedIndex, repriceGenerators, needsPlantCostRecalculation, plantWtgCost,
  codChangeBlocksSave, milestoneLabels, italianRegion, revenueLabelFor, describeRevenue,
  contractDates, pickPrice, inflationSettings, buildDefaultRevenue, planSaveMilestones,
  clearSkippedMilestones, shouldConfirmLeave, resetValidationAfterSave, milestoneMeta,
  orderingMessage, isDerivedMilestone, classifyDerivedMilestones, resetShareOfFarmdown,
  type MilestoneDates, type MilestoneProject, type MilestonesForm,
  type RevenueAssumptionRow, type ProjectGenerator, type MilestoneKey,
} from "./rules";
import { toMilestoneProject, saveMilestones, computeFidRepricing } from "./hooks";

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
  areaName: "Sachsen", technology: "Wind", startCluster: 0, acquisitionDate: null,
  shareOfFarmdown: null, isStandardShareOfFarmdown: null,
  createdOn: "2026-09-03T10:49:00Z", modifiedOn: "2026-09-03T10:49:00Z",
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

  it("UT-MSTONE-002 dates bind from the project record", () => {
    const bound = toMilestoneProject({
      vsb_projectid: "p-1", vsb_name: "Nordwind", vsb_internalprojectid: "DE-1021",
      vsb_technology: "Wind", vsb_totalcapacity: 1, vsb_plantwtgcapacity: 1,
      vsb_plantwtgcost: 1, vsb_netyieldp50: 1, statecode: 0, modifiedon: "2026-01-01",
      _vsb_country_value: "c-de", _vsb_clusterstate_value: "s-draft",
      vsb_projectstartdate: CHAIN.StartDate,
      vsb_feasibilitystudies: CHAIN.FeasibilityStudies,
      vsb_projectdevelopmentstarted: CHAIN.ProjectDevelopmentStarted,
      vsb_applicationsubmitted: CHAIN.ApplicationSubmitted,
      vsb_legallybindingpermits: CHAIN.LegallyBindingPermits,
      vsb_finalinvestmentdecision: CHAIN.FinalInvestmentDecision,
      vsb_construction: CHAIN.Construction,
      vsb_operationsstartdatecod: CHAIN.OperationsStartDate,
      vsb_enddate: CHAIN.EndDate,
      vsb_salesstartdate: CHAIN.SalesStartDate,
      vsb_salescompleted: CHAIN.StartCompleted,
      vsb_isfinalinvestmentdecisionstandardassumption: true,
    })!;
    expect(bound.dates).toEqual(CHAIN);
    expect(bound.standardAssumption.FinalInvestmentDecision).toBe(true);
    expect(bound.standardAssumption.Construction).toBe(false);
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
    expect(initialForm(project({ shareOfFarmdown: null })).shareOfFarmdown).toBe("50");
    expect(initialForm(project({ shareOfFarmdown: 33.5 })).shareOfFarmdown).toBe("33.5");
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
    // GUIDE p15/p16: the ordering message names the PREVIOUS date, not the field itself.
    expect(v.FeasibilityStudies.text).toBe("The date needs to be later than Project Start date.");
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
    // GUIDE p15: verbatim — "The date needs to be later than Cluster 4 date."
    expect(v.FinalInvestmentDecision.text)
      .toBe("The date needs to be later than Cluster 4 date.");
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

describe("UT-MSTONE the ordering-validation copy (GUIDE p15/p16)", () => {
  it("UT-MSTONE-047 GUIDE p15 verbatim: Cluster 4 needs to be later than Cluster 3", () => {
    expect(orderingMessage("LegallyBindingPermits"))
      .toBe("The date needs to be later than Cluster 3 date.");
    const pass = validateMilestones(dates(), 0);
    expect(pass.LegallyBindingPermits.valid).toBe(true);
    const fail = validateMilestones(
      dates({ LegallyBindingPermits: "2027-01-01" /* before Cluster 3 */ }), 0,
    );
    expect(fail.LegallyBindingPermits.valid).toBe(false);
    expect(fail.LegallyBindingPermits.text).toBe(orderingMessage("LegallyBindingPermits"));
  });

  it("UT-MSTONE-048 GUIDE p15 verbatim: FID needs to be later than Cluster 4", () => {
    expect(orderingMessage("FinalInvestmentDecision"))
      .toBe("The date needs to be later than Cluster 4 date.");
    expect(validateMilestones(dates(), 0).FinalInvestmentDecision.valid).toBe(true);
    const fail = validateMilestones(dates({ FinalInvestmentDecision: "2027-12-01" }), 0);
    expect(fail.FinalInvestmentDecision.valid).toBe(false);
    expect(fail.FinalInvestmentDecision.text).toBe(orderingMessage("FinalInvestmentDecision"));
  });

  it("UT-MSTONE-049 GUIDE p15 verbatim: Cluster 5 needs to be later than FID", () => {
    expect(orderingMessage("Construction"))
      .toBe("The date needs to be later than Final Investment Decision date.");
    expect(validateMilestones(dates(), 0).Construction.valid).toBe(true);
    const fail = validateMilestones(dates({ Construction: "2028-05-01" }), 0);
    expect(fail.Construction.valid).toBe(false);
    expect(fail.Construction.text).toBe(orderingMessage("Construction"));
  });

  it("UT-MSTONE-050 GUIDE p15 verbatim: Cluster 6 needs to be later than Cluster 5", () => {
    expect(orderingMessage("OperationsStartDate"))
      .toBe("The date needs to be later than Cluster 5 date.");
    expect(validateMilestones(dates(), 0).OperationsStartDate.valid).toBe(true);
    const fail = validateMilestones(dates({ OperationsStartDate: "2028-12-01" }), 0);
    expect(fail.OperationsStartDate.valid).toBe(false);
    expect(fail.OperationsStartDate.text).toBe(orderingMessage("OperationsStartDate"));
  });

  it("UT-MSTONE-051 GUIDE p15 verbatim: Project End Date needs to be later than Cluster 6", () => {
    expect(orderingMessage("EndDate"))
      .toBe("The date needs to be later than Cluster 6 date.");
    expect(validateMilestones(dates(), 0).EndDate.valid).toBe(true);
    const fail = validateMilestones(dates({ EndDate: "2029-12-31" }), 0);
    expect(fail.EndDate.valid).toBe(false);
    expect(fail.EndDate.text).toBe(orderingMessage("EndDate"));
  });

  it('UT-MSTONE-052 GUIDE p15 verbatim: Sales Completion needs to be later than "sales starts"', () => {
    expect(orderingMessage("StartCompleted"))
      .toBe("The date needs to be later than sales starts date.");
    expect(validateMilestones(dates(), 0).StartCompleted.valid).toBe(true);
    const fail = validateMilestones(
      dates({ SalesStartDate: "2031-07-01", StartCompleted: "2031-06-01" }), 0,
    );
    expect(fail.StartCompleted.valid).toBe(false);
    expect(fail.StartCompleted.text).toBe(orderingMessage("StartCompleted"));
  });

  it("UT-MSTONE-053 the pattern extends one link further for Clusters 1–3 (not directly confirmed)", () => {
    expect(orderingMessage("FeasibilityStudies"))
      .toBe("The date needs to be later than Project Start date.");
    expect(orderingMessage("ProjectDevelopmentStarted"))
      .toBe("The date needs to be later than Cluster 1 date.");
    expect(orderingMessage("ApplicationSubmitted"))
      .toBe("The date needs to be later than Cluster 2 date.");
    const fail = validateMilestones(dates({ ApplicationSubmitted: "2026-11-01" }), 0);
    expect(fail.ApplicationSubmitted.text).toBe(orderingMessage("ApplicationSubmitted"));
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
  const assumption = {
    cluster1: 6, cluster2: 6, cluster3: 7, cluster4: 6, cluster5: 6, cluster6: 12,
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
      cluster1: 6, cluster2: 6, cluster3: 7, cluster4: 6, cluster5: 6, cluster6: 12,
    });
    expect(isDerivedMilestone("Construction", recalculated)).toBe(true);
    const typed = editMilestone(recalculated, "Construction", "2029-03-01");
    expect(isDerivedMilestone("Construction", typed)).toBe(false);
  });

  it("UT-MSTONE-056 the reset button restores Share of Farmdown to 50% and re-marks it derived", () => {
    expect(resetShareOfFarmdown()).toEqual({
      shareOfFarmdown: "50", isStandardShareOfFarmdown: true,
    });
    const edited = formOf({ shareOfFarmdown: "33.50", isStandardShareOfFarmdown: false });
    expect(isDerivedMilestone("ShareOfFarmdown", edited)).toBe(false);
    const reset = { ...edited, ...resetShareOfFarmdown() };
    expect(isDerivedMilestone("ShareOfFarmdown", reset)).toBe(true);
    expect(reset.shareOfFarmdown).toBe("50");
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
    const data = plan.writes[0].data!;
    expect(data[PROJECT_COL.projectStartDate]).toBeNull();
    expect(data[PROJECT_COL.applicationSubmitted]).toBeNull();
    expect(data[PROJECT_COL.isApplicationSubmittedStd]).toBe(false);
  });
});

/* ══════════════════════════════════════════════════════════ FID re-pricing */

describe("UT-MSTONE FID-driven re-pricing", () => {
  const gens: ProjectGenerator[] = [
    { id: "g1", count: 3, wtgPrices: [10, 9, 8, 7, 6], additionalFoundationCost: 1,
      foundationCostIncluded: true, generatorsCost: 0 },
  ];

  it("UT-MSTONE-025 accumulated price index formula", () => {
    const index = accumulatedIndex(
      "2030-06-15",
      { fidYear: 2030, annualIndex: null, accumulatedIndex: 1.16 },
      { fidYear: 2029, annualIndex: null, accumulatedIndex: 1.10 },
    );
    expect(index).toBeCloseTo(1.13, 10);
  });

  it("UT-MSTONE-025b a missing inflation row leaves the index neutral", () => {
    expect(accumulatedIndex("2030-06-15", null, null)).toBe(1);
    expect(accumulatedIndex(null, { fidYear: 1, annualIndex: 1, accumulatedIndex: 1 }, null)).toBe(1);
  });

  it("UT-MSTONE-026 FID change flags plant-cost recalculation", () => {
    expect(needsPlantCostRecalculation("2028-06-01", "2029-06-01")).toBe(true);
    const r = computeFidRepricing({
      storedFid: "2028-06-01", selectedFid: "2030-06-15", generators: gens,
      inflation: {
        current: { fidYear: 2030, annualIndex: null, accumulatedIndex: 1.16 },
        previous: { fidYear: 2029, annualIndex: null, accumulatedIndex: 1.10 },
      },
    });
    expect(r.needsPlantCostRecalculation).toBe(true);
    expect(r.index).toBeCloseTo(1.13, 10);
  });

  it("UT-MSTONE-027 setting FID to the same value does not flag recalculation", () => {
    expect(needsPlantCostRecalculation("2028-06-01", "2028-06-01")).toBe(false);
    const r = computeFidRepricing({
      storedFid: "2028-06-01", selectedFid: "2028-06-01", generators: gens,
      inflation: { current: null, previous: null },
    });
    expect(r.needsPlantCostRecalculation).toBe(false);
    expect(r.generators).toBe(gens);
  });

  it("UT-MSTONE-027b the price ladder tops out at the 5-WTG price and adds the foundation", () => {
    const priced = repriceGenerators([
      { id: "a", count: 3, wtgPrices: [10, 9, 8, 7, 6], additionalFoundationCost: 1,
        foundationCostIncluded: true, generatorsCost: 0 },
      { id: "b", count: 9, wtgPrices: [10, 9, 8, 7, 6], additionalFoundationCost: 2,
        foundationCostIncluded: false, generatorsCost: 0 },
    ], 2);
    // 3 WTG at price rung 3 (8) × index 2 → 16 each → 48
    expect(priced[0].generatorsCost).toBe(48);
    // 9 WTG falls back to the 5-WTG price (6) + 2 foundation, × index 2 → 16 each → 144
    expect(priced[1].generatorsCost).toBe(144);
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
    expect(plan.writes[0].data![PROJECT_COL.plantWtgCost]).toBe(60);
    expect(plan.writes.filter((w) => w.entitySet === ES.generatorTypeInProjects))
      .toHaveLength(3);
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
    expect(italianRegion("Lazio")).toBe("Italy_Centre - South");
    expect(italianRegion("Lombardia")).toBe("Italy_North");
    expect(italianRegion("Calabria")).toBe("Italy_Calabria");
    expect(italianRegion("Bayern")).toBeNull();
    expect(italianRegion(null)).toBeNull();
  });

  it("UT-MSTONE-035 Italian description format", () => {
    expect(describeRevenue({
      countryName: "Italy", areaName: "Lazio", revenueLabel: "FiT",
    })).toBe("Standard FiT Italy - Centre - South");
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
    expect(plan.log).toContain("Project data was saved/updated successfully.");
    expect(plan.log).toContain("A default revenue contract was created.");
    expect(plan.writes.filter((w) => w.entitySet === ES.projectRevenues)).toHaveLength(1);
    expect(resetValidationAfterSave()).toEqual([]);
  });

  it("UT-MSTONE-043b the patch carries the lifetime string, farmdown and business unit", () => {
    const plan = planSaveMilestones({
      project: project(), form: formOf({ shareOfFarmdown: "33.5" }),
      repricedGenerators: null, revenueDraft: null, language: "en-US",
    });
    const data = plan.writes[0].data!;
    expect(data[PROJECT_COL.operationalLifetime])
      .toBe(operationalLifetime(CHAIN.OperationsStartDate, CHAIN.EndDate).text);
    expect(data[PROJECT_COL.shareOfFarmdown]).toBe(33.5);
    expect(data["owningbusinessunit@odata.bind"]).toBe("/businessunits(bu-de)");
    // One Projects write only — the canvas issued a second one for the plant cost.
    expect(plan.writes.filter((w) => w.entitySet === ES.projects)).toHaveLength(1);
  });

  it("UT-MSTONE-044 save failure surfaces the error", async () => {
    const res = await saveMilestones({
      project: project({ id: null }), form: formOf(),
      repricedGenerators: null, revenueDraft: null, language: "en-US",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.message).toContain("General Data");
  });

  it("UT-MSTONE-045 leaving with dirty milestones prompts", () => {
    expect(shouldConfirmLeave(["EndDate"] as MilestoneKey[])).toBe(true);
    expect(shouldConfirmLeave([])).toBe(false);
  });

  it("UT-MSTONE-045b an empty chain has an empty date record for every key", () => {
    expect(Object.keys(emptyMilestoneDates)).toHaveLength(MILESTONE_KEYS.length - 1);
  });
});
