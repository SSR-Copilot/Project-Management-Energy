/**
 * Project General Data Screen — direct tests for the `rules.ts` exports that no other test named
 * (GD-027, 18 Nov 2026). Pure assertions, derived from the canvas formula each rule's comment cites.
 * Ids UT-GDATA-092 to 105; UT-GDATA-0nn live in `rules.test.ts`. No behaviour change.
 */
import { describe, it, expect } from "vitest";
import { ES, CHOICE } from "@/data/dataverseNames";
import { TECHNOLOGY_LABEL } from "@/domain/technology";
import {
  CALENDAR_ADD_SOURCE, CLUSTER_PANEL_FIELDS, DELETE_SHAREHOLDER_DIALOG, LEAVE_DIALOG, LOCATION_DIALOG, MSG,
  SHAREHOLDER_COL, TECHNOLOGY_OPTIONS, TRACKING_COL, acquisitionPriceLabel, assertManagerSelected,
  clusterPanelPatch, clusterSaveErrorText, deleteShareholderDescription, emptyGeneralDataForm,
  formatHashZeroDotZeroHash, hasAnyMilestoneData, hasAnyMilestoneToDelete, isAcquisitionRowVisible,
  isSpvCompanyCodeVisible, isSpvLegalStructureRequired, municipalityMode, newStartClusterNo, openClusterPanel,
  ownershipInputText, planClusterPanelSave, projectSaveErrorText, shareholderDeleteErrorText,
  shareholderTypeLabel, shareholdingRangeMessage, shareholdingSum, startClusterNo,
  type GeneralDataForm, type ProjectSnapshot, type ShareholdingEntity,
} from "./rules";

/* ─────────────────────────────────────────────────────────────────── fixtures */

const project = (o: Partial<ProjectSnapshot> = {}): ProjectSnapshot => ({
  id: "p-1", projectNumber: "PL-1021", internalProjectId: null, projectName: "Nordwind", originalProjectName: null,
  approvalState: null, statecode: 0, clusterStateId: "s-draft", clusterStateName: "Draft",
  clusterStateOrder: 0, countryId: "c-pl", countryName: "Poland", countryKey: "33",
  besitzerBusinessUnitId: "bu-pl", startCluster: 0, technology: 952850000, shareOfFarmdown: null,
  isStandardShareOfFarmdown: null, standardCostCreated: null,
  projectStartDate: null, feasibilityStudies: null, projectDevelopmentStarted: null,
  applicationSubmitted: null, legallyBindingPermits: null, fid: null,
  construction: null, cod: null,
  ...o,
});

const form = (o: Partial<GeneralDataForm> = {}): GeneralDataForm => ({ ...emptyGeneralDataForm, ...o });

const entity = (ownership: number): ShareholdingEntity => ({
  key: `e-${ownership}`, recordId: null, entityTypeValue: 952850000, customName: "", ownership,
});

/* ═════════════════════════════════════════════════════════════════ visibility */

describe("UT-GDATA direct: visibility and modes", () => {
  it("UT-GDATA-092 isAcquisitionRowVisible: only an Acquired Project shows the acquisition row (Y:2514, Y:2554)", () => {
    expect(isAcquisitionRowVisible(CHOICE.developmentType.acquiredProject)).toBe(true);
    expect(isAcquisitionRowVisible(CHOICE.developmentType.ownDevelopment)).toBe(false);
    expect(isAcquisitionRowVisible(null)).toBe(false);
    expect(isAcquisitionRowVisible(undefined)).toBe(false);
  });

  it("UT-GDATA-093 municipalityMode: Germany and France are exact names, everything else is free text", () => {
    expect(municipalityMode("Germany")).toBe("germany");
    expect(municipalityMode("France")).toBe("france");
    expect(municipalityMode("Poland")).toBe("text");
    expect(municipalityMode("germany")).toBe("text");
    expect(municipalityMode(null)).toBe("text");
    expect(municipalityMode(undefined)).toBe("text");
  });

  it("UT-GDATA-094 SPV: legal structure required only for Germany with an SPV name; company code visible when the name is not empty (Y:1631-1639, Y:1689)", () => {
    expect(isSpvLegalStructureRequired("Germany", "SPV 1")).toBe(true);
    // The canvas test is `<> ""`, so a single space counts as present.
    expect(isSpvLegalStructureRequired("Germany", " ")).toBe(true);
    expect(isSpvLegalStructureRequired("Germany", "")).toBe(false);
    expect(isSpvLegalStructureRequired("France", "SPV 1")).toBe(false);
    expect(isSpvLegalStructureRequired(null, "SPV 1")).toBe(false);
    expect(isSpvCompanyCodeVisible("x")).toBe(true);
    expect(isSpvCompanyCodeVisible(" ")).toBe(true);
    expect(isSpvCompanyCodeVisible("")).toBe(false);
  });
});

/* ═══════════════════════════════════════════════════ start cluster and milestones */

describe("UT-GDATA direct: milestones and the start cluster", () => {
  it("UT-GDATA-095 hasAnyMilestoneData: false for no project and for blank dates, true as soon as one of the eight is set", () => {
    expect(hasAnyMilestoneData(null)).toBe(false);
    expect(hasAnyMilestoneData(project())).toBe(false);
    expect(hasAnyMilestoneData(project({ projectStartDate: "" }))).toBe(false);
    // `isBlank` is Power Fx `IsBlank`: only null and "" are blank, a space is a value.
    expect(hasAnyMilestoneData(project({ projectStartDate: " " }))).toBe(true);
    const keys = [
      "projectStartDate", "feasibilityStudies", "projectDevelopmentStarted", "applicationSubmitted",
      "legallyBindingPermits", "fid", "construction", "cod",
    ] as const;
    for (const k of keys) expect(hasAnyMilestoneData(project({ [k]: "2026-05-01" }))).toBe(true);
  });

  it("UT-GDATA-096 hasAnyMilestoneToDelete: each threshold 1 to 5 is tied to one date; later dates never count", () => {
    expect(hasAnyMilestoneToDelete(null, 5)).toBe(false);
    const pairs: Array<[number, keyof ProjectSnapshot]> = [
      [1, "projectStartDate"], [2, "feasibilityStudies"], [3, "projectDevelopmentStarted"],
      [4, "applicationSubmitted"], [5, "legallyBindingPermits"],
    ];
    for (const [n, key] of pairs) {
      const p = project({ [key]: "2026-05-01" });
      expect(hasAnyMilestoneToDelete(p, n)).toBe(true);
      expect(hasAnyMilestoneToDelete(p, n - 1)).toBe(false);
    }
    // FID, Construction and COD are never deleted by a start-cluster change.
    expect(hasAnyMilestoneToDelete(project({ fid: "2026-05-01", construction: "2026-06-01", cod: "2026-07-01" }), 6)).toBe(false);
  });

  it("UT-GDATA-097 newStartClusterNo: Acquired maps through startClusterNo, Own Development and no type give 0 (Y:5182-5189)", () => {
    expect(newStartClusterNo(CHOICE.developmentType.acquiredProject, 3)).toBe(startClusterNo(3));
    expect(newStartClusterNo(CHOICE.developmentType.acquiredProject, null)).toBe(0);
    expect(newStartClusterNo(CHOICE.developmentType.ownDevelopment, 3)).toBe(0);
    expect(newStartClusterNo(null, 3)).toBe(0);
  });

  it("UT-GDATA-098 planClusterPanelSave: one update of the project with the panel's patch", () => {
    const panel = openClusterPanel(
      project({ startCluster: 4, projectStartDate: "2026-01-01", feasibilityStudies: "2026-02-01" }),
      form({ developmentType: CHOICE.developmentType.acquiredProject, startCluster: 2 }),
    );
    const plan = planClusterPanelSave("p-1", panel);
    expect(plan.log).toEqual([]);
    expect(plan.writes).toEqual([{
      op: "update", entitySet: ES.projects, id: "p-1", data: clusterPanelPatch(panel),
      reason: "save the cluster milestone changes",
    }]);
  });

  it("UT-GDATA-099 assertManagerSelected: an empty picker returns the manager message, a picked id returns null", () => {
    expect(assertManagerSelected(form({ managerEntraRowId: null }))).toBe(MSG.manager);
    expect(assertManagerSelected(form({ managerEntraRowId: "" }))).toBe(MSG.manager);
    // Power Fx `IsBlank`: a space is a value, not blank.
    expect(assertManagerSelected(form({ managerEntraRowId: " " }))).toBeNull();
    expect(assertManagerSelected(form({ managerEntraRowId: "e-1" }))).toBeNull();
  });
});

/* ══════════════════════════════════════════════════════════════ labels and numbers */

describe("UT-GDATA direct: labels, sums and number text", () => {
  it("UT-GDATA-100 acquisitionPriceLabel: Poland is PLN, every other country and none is EUR (lbl_…_ClusterChange_3)", () => {
    expect(acquisitionPriceLabel("Poland")).toBe("Acquisition Price [PLN]");
    expect(acquisitionPriceLabel("Germany")).toBe("Acquisition Price [EUR]");
    expect(acquisitionPriceLabel(null)).toBe("Acquisition Price [EUR]");
    expect(acquisitionPriceLabel(undefined)).toBe("Acquisition Price [EUR]");
  });

  it("UT-GDATA-101 shareholdingSum rounds to 4 decimals; ownershipInputText shows the percentage in the player's separator", () => {
    expect(shareholdingSum([])).toBe(0);
    expect(shareholdingSum([entity(0.5), entity(0.3333)])).toBe(0.8333);
    expect(shareholdingSum([entity(0.1), entity(0.2)])).toBe(0.3);
    expect(ownershipInputText(0.3333, "en-US")).toBe("33.33");
    expect(ownershipInputText(0.3333, "de-DE")).toBe("33,33");
    expect(ownershipInputText(0.5, "en-US")).toBe("50");
  });

  it("UT-GDATA-102 deleteShareholderDescription and shareholderTypeLabel: exact canvas text, unknown option gives an empty label", () => {
    expect(deleteShareholderDescription("Green Yield One (IPP2)")).toBe("Are you sure that you want to delete 'Green Yield One (IPP2)'?");
    expect(shareholderTypeLabel(952850000)).toBe("Green Yield One (IPP2)");
    expect(shareholderTypeLabel(952850017)).toBe("Third Party");
    expect(shareholderTypeLabel(1)).toBe("");
    expect(shareholderTypeLabel(null)).toBe("");
    expect(shareholderTypeLabel(undefined)).toBe("");
  });

  it("UT-GDATA-103 the save error texts name the failing table and carry the detail verbatim", () => {
    expect(projectSaveErrorText("boom")).toBe(`Error: Project could not be saved. Internal error: originated on ${ES.projects}. Message: boom`);
    expect(shareholderDeleteErrorText("boom")).toBe(
      `Error: Shareholding Entities could not be deleted. Internal error: originated on ${ES.shareholderEntityInProjects}. Message: boom`,
    );
    expect(clusterSaveErrorText("boom")).toBe("Error: Cluster milestone changes could not be saved. boom");
  });

  it("UT-GDATA-104 formatHashZeroDotZeroHash (#0.0#) and shareholdingRangeMessage", () => {
    expect(formatHashZeroDotZeroHash(5, "en-US")).toBe("5.0");
    expect(formatHashZeroDotZeroHash(5.25, "en-US")).toBe("5.25");
    expect(formatHashZeroDotZeroHash(5.256, "en-US")).toBe("5.26");
    expect(formatHashZeroDotZeroHash(5.254, "en-US")).toBe("5.25");
    expect(formatHashZeroDotZeroHash(5, "de-DE")).toBe("5,0");
    expect(formatHashZeroDotZeroHash(0, "en-US")).toBe("0.0");
    expect(shareholdingRangeMessage("120", 37.5, "en-US")).toBe("The number 120 must be between 0 and 37.5.");
    expect(shareholdingRangeMessage("120", 37.5, "de-DE")).toBe("The number 120 must be between 0 and 37,5.");
  });
});

/* ═══════════════════════════════════════════════════════════════════ constants */

describe("UT-GDATA direct: pinned constants", () => {
  it("UT-GDATA-105 dialogs verbatim; Technology has no Hybrid; CalendarAdd and panel field order; column names", () => {
    expect(DELETE_SHAREHOLDER_DIALOG).toEqual({ title: "Delete Shareholding Entity?", confirm: "Confirm", cancel: "Cancel" });
    expect(LEAVE_DIALOG).toEqual({
      title: "Unsaved data",
      description: "You have unsaved data. Do you really want to leave current form without saving?",
      confirm: "Yes", cancel: "Cancel",
    });
    expect(LOCATION_DIALOG).toEqual({
      title: "Project Location Confirmation",
      description: "Are you sure that you want to change the project location?",
      confirm: "Confirm", cancel: "Cancel",
    });
    expect(TECHNOLOGY_OPTIONS).not.toContain("Hybrid");
    expect(TECHNOLOGY_OPTIONS).toEqual(Object.values(TECHNOLOGY_LABEL).filter((t) => t !== "Hybrid"));
    expect(CALENDAR_ADD_SOURCE).toEqual({
      cluster2: { prev: "cluster1", duration: "cluster1" },
      cluster3: { prev: "cluster2", duration: "cluster2" },
      cluster4: { prev: "cluster3", duration: "cluster3" },
    });
    expect(CLUSTER_PANEL_FIELDS).toEqual(["startDate", "cluster1", "cluster2", "cluster3", "cluster4", "fid", "cluster5", "cluster6"]);
    expect(TRACKING_COL).toEqual({
      approvalClusterState: "vsb_approvalclusterstate", clusterStepState: "vsb_clusterstepstate",
      approvalDueDate: "vsb_approvalduedate", approvalComment: "vsb_approvalcomment",
      flowRunId: "vsb_flowrunid", flowApprovalId: "vsb_flowapprovalid",
      project: "vsb_Project", clusterState: "vsb_ClusterState",
    });
    expect(SHAREHOLDER_COL).toEqual({
      id: "vsb_shareholderentitiyid", name: "vsb_name", entityType: "vsb_shareholderentitiytype",
      customName: "vsb_customname", ownership: "vsb_ownership", project: "vsb_Project",
    });
  });
});
