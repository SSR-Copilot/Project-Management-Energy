import { describe, it, expect } from "vitest";
import {
  PM_NAV, COST_NAV, navItemColor, completionRatio, railTree, resolveLaunchRoute,
  NEW_PROJECT_ROUTE, isNewProjectRequest, PROJECT_SCOPED,
} from "./navigation";
import { navIconColor } from "@/theme/tokens";

const empty = {};
const full = {
  projectId: "p1", projectNumber: "DE-0001", projectStartDate: "2026-01-01",
  totalCapacity: 42, netYieldP50: 9000, clusterStateName: "In Progress",
};

describe("LeftNavigationMenu completeness colouring", () => {
  it("UT-NAV-001 pale when the prerequisite field is blank", () => {
    const milestones = PM_NAV.find((i) => i.key === "GeneralDataMilestonesKey")!;
    expect(navItemColor(milestones, empty)).toBe(navIconColor.incomplete);
  });
  it("UT-NAV-002 solid when the prerequisite is present", () => {
    const milestones = PM_NAV.find((i) => i.key === "GeneralDataMilestonesKey")!;
    expect(navItemColor(milestones, full)).toBe(navIconColor.complete);
  });
  it("UT-NAV-003 Production requires a non-zero Total Capacity", () => {
    const prod = PM_NAV.find((i) => i.key === "ProductionKey")!;
    expect(navItemColor(prod, { ...full, totalCapacity: 0 })).toBe(navIconColor.incomplete);
  });
  it("UT-NAV-004 Draft cluster state does not satisfy the six later items", () => {
    const team = PM_NAV.find((i) => i.key === "GeneralDataProjectTeamKey")!;
    expect(navItemColor(team, { ...full, clusterStateName: "Draft" })).toBe(navIconColor.incomplete);
    expect(navItemColor(team, full)).toBe(navIconColor.complete);
  });
  it("UT-NAV-005 no project at all is pale everywhere", () => {
    for (const i of PM_NAV.filter((x) => x.prerequisite)) {
      expect(navItemColor(i, null)).toBe(navIconColor.incomplete);
    }
  });
  it("UT-NAV-006 rail order matches the canvas table", () => {
    expect(PM_NAV.map((i) => i.key)).toEqual([
      "GeneralDataCommonKey", "GeneralDataMilestonesKey", "GeneratorKey", "ProductionKey",
      "GeneralDataCheckListKey", "GeneralDataProjectTeamKey", "PlanningKey",
      "GridOperatorKey", "RevenueKey", "FinanceKey",
    ]);
  });
});

describe("completion meter", () => {
  it("UT-NAV-007 empty project is 0, fully populated is 1", () => {
    expect(completionRatio(empty)).toBe(0);
    expect(completionRatio(full)).toBe(1);
  });
});

describe("Cost rail hierarchy", () => {
  it("UT-NAV-008 the three OPEX children sit under the OPEX parent", () => {
    const t = railTree(COST_NAV);
    const parentIdx = t.findIndex((x) => x.item.key === "OpexCostsKey");
    expect(t[parentIdx + 1].item.key).toBe("O&MKey");
    expect(t[parentIdx + 1].depth).toBe(1);
    expect(t.filter((x) => x.item.parentKey === "OpexCostsKey")).toHaveLength(3);
  });
  it("UT-NAV-009 Total Summary is hidden and excluded from the tree", () => {
    expect(railTree(COST_NAV).some((x) => x.item.key === "TotalCostsSummary")).toBe(false);
  });
  it("UT-NAV-010 O&M and Other OPEX are distinct routes onto one screen", () => {
    const om = COST_NAV.find((i) => i.key === "O&MKey")!;
    const other = COST_NAV.find((i) => i.key === "OtherOpexCostsKey")!;
    expect(om.route).not.toBe(other.route);
    expect(om.route.startsWith("/costs/opex")).toBe(true);
    expect(other.route.startsWith("/costs/opex")).toBe(true);
  });
});

describe("launch sequence", () => {
  it("UT-NAV-011 no projectid goes to the portfolio list", () => {
    expect(resolveLaunchRoute("pm", new URLSearchParams()).route).toBe("/projects");
  });
  it("UT-NAV-012 projectid deep-links to General Data", () => {
    const r = resolveLaunchRoute("pm", new URLSearchParams("projectid=abc"));
    expect(r).toEqual({ route: "/project/general", projectId: "abc" });
  });
  it("UT-NAV-013 screen=generators is honoured", () => {
    expect(resolveLaunchRoute("pm", new URLSearchParams("projectid=abc&screen=generators")).route)
      .toBe("/project/generators");
  });
  it("UT-NAV-014 the Cost app starts on Capex", () => {
    expect(resolveLaunchRoute("cost", new URLSearchParams()).route).toBe("/costs/capex");
  });
});

/**
 * GUIDE p10 — "+ Add Project" opens General with no project selected. The project guard is a
 * pure function of the location, so it is tested here rather than through the router.
 */
describe("new-project route", () => {
  it("UT-NAV-015 the add-project route is General with the new marker", () => {
    expect(NEW_PROJECT_ROUTE).toBe("/project/general?new=1");
    const [pathname, search] = NEW_PROJECT_ROUTE.split("?");
    expect(isNewProjectRequest(pathname, `?${search}`)).toBe(true);
  });
  it("UT-NAV-016 General without the marker still needs a project", () => {
    expect(isNewProjectRequest("/project/general", "")).toBe(false);
  });
  it("UT-NAV-017 the marker does not unlock any other project screen", () => {
    for (const route of PROJECT_SCOPED.filter((r) => r !== "/project/general")) {
      expect(isNewProjectRequest(route, "?new=1")).toBe(false);
    }
  });
});
