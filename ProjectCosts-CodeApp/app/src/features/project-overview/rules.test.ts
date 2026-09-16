import { describe, expect, it } from "vitest";
import {
  COL, fv, PROJECT_SELECT, CAPACITY_OPERATORS, EMPTY_FILTER, KEYWORD_MIN, PAGE_SIZE,
  REPORT_VIEWERS, SORTABLE, DEFAULT_SORT, DEFAULT_CRITERIA,
  keywordClause, resolveCapacityOperator, capacityError, capacityClause,
  buildProjectFilter, applyFilterPatch, isFilterActive, clearIconState,
  resolveSortColumn, nextSortState, toProjectRow, formatCapacity, formatGridDate,
  costModuleLock, isCostModuleLocked, commandBarState,
  totalPages, clampPage, pagerLabels, parseCriteria, serialiseCriteria, filterPeople,
  type ProjectFilter, type SelectedProject, type PersonOption,
} from "./rules";
import { APPROVAL_STATE, TECHNOLOGY } from "@/domain/project";
import { palette } from "@/theme/tokens";

const G1 = "33b9cc79-5b4f-f111-bec6-000d3a3855c2";
const G2 = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

/* ─────────────────────────────────────────────────────────────── columns */

describe("columns", () => {
  it("UT-OV-001 distinguishes the two columns that both claim 'Project ID'", () => {
    // `vsb_name` is the autonumber primary column, titled "Project ID" in the metadata.
    // `vsb_internalprojectid` is what the grid's "Project ID" column shows — the canvas grid
    // projection aliases it: `vsb_name: ThisRecord.'Internal Project ID'`.
    expect(COL.projectIdCode).toBe("vsb_name");
    expect(COL.internalProjectId).toBe("vsb_internalprojectid");
    expect(COL.name).toBe("vsb_projectname");
  });

  it("UT-OV-002 selects every column the grid and the gates read", () => {
    for (const c of [
      COL.id, COL.name, COL.shortName, COL.internalProjectId, COL.approvalState,
      COL.totalCapacity, COL.netYieldP50, COL.projectStartDate,
      COL.spoSharepointUrl, COL.spoTeamsUrl,
      COL.country, COL.area, COL.clusterState, COL.projectManager,
    ]) {
      expect(PROJECT_SELECT).toContain(c);
    }
  });

  it("UT-OV-003 builds the FormattedValue annotation name", () => {
    expect(fv(COL.country))
      .toBe("_vsb_country_value@OData.Community.Display.V1.FormattedValue");
  });
});

/* ──────────────────────────────────────────────────────────────── keyword */

describe("keywordClause", () => {
  it("UT-OV-004 does nothing below three characters", () => {
    expect(keywordClause("")).toBeUndefined();
    expect(keywordClause("ab")).toBeUndefined();
    expect(keywordClause("  ab  ")).toBeUndefined();
    expect(KEYWORD_MIN).toBe(3);
  });

  it("UT-OV-005 searches name, Project ID, Internal Project ID and short name", () => {
    // SKELETON FIX 1: the skeleton's fourth field was `_vsb_countryarea_value`, a GUID
    // column — `contains()` on it is a 400. The canvas searches 'Project ID'.
    const c = keywordClause("test") ?? "";
    expect(c).toContain("contains(vsb_projectname,'test')");
    expect(c).toContain("contains(vsb_name,'test')");
    expect(c).toContain("contains(vsb_internalprojectid,'test')");
    expect(c).toContain("contains(vsb_shortname,'test')");
    expect(c).not.toContain("countryarea");
  });

  it("UT-OV-006 escapes an apostrophe in the keyword", () => {
    expect(keywordClause("O'Brien")).toContain("contains(vsb_projectname,'O''Brien')");
  });

  it("UT-OV-007 OR-s the four fields, each parenthesised", () => {
    const c = keywordClause("test") ?? "";
    expect(c.split(" or ")).toHaveLength(4);
    expect(c.startsWith("(")).toBe(true);
  });
});

/* ─────────────────────────────────────────────────────────────── capacity */

describe("capacity", () => {
  it("UT-OV-008 defaults a typed capacity's operator to Equals", () => {
    expect(resolveCapacityOperator("10", "")).toBe("Equals");
    expect(CAPACITY_OPERATORS[0]).toBe("Equals");
  });

  it("UT-OV-009 has no operator when there is no capacity", () => {
    expect(resolveCapacityOperator("", "Greater than")).toBeNull();
    expect(resolveCapacityOperator("   ", "")).toBeNull();
  });

  it("UT-OV-010 keeps an explicitly chosen operator", () => {
    expect(resolveCapacityOperator("10", "Less than")).toBe("Less than");
  });

  it("UT-OV-011 validates as two decimals", () => {
    expect(capacityError("", "en-GB")).toBeNull();
    expect(capacityError("136.0", "en-GB")).toBeNull();
    expect(capacityError("47.13", "en-GB")).toBeNull();
    expect(capacityError("47.135", "en-GB")).toBe("Value must be a numeric");
    expect(capacityError("abc", "en-GB")).toBe("Value must be a numeric");
  });

  it("UT-OV-012 maps each operator to its OData comparison", () => {
    const cl = (op: Parameters<typeof capacityClause>[1]) =>
      capacityClause("10", op, "en-GB");
    expect(cl("Equals")).toBe("vsb_totalcapacity eq 10");
    expect(cl("Greater than")).toBe("vsb_totalcapacity gt 10");
    expect(cl("Greater than or equal to")).toBe("vsb_totalcapacity ge 10");
    expect(cl("Less than")).toBe("vsb_totalcapacity lt 10");
    expect(cl("Less than or equal to")).toBe("vsb_totalcapacity le 10");
  });

  it("UT-OV-013 emits no clause for an invalid capacity", () => {
    // An unparseable capacity must not become `vsb_totalcapacity eq NaN`.
    expect(capacityClause("abc", "Equals", "en-GB")).toBeUndefined();
    expect(capacityClause("47.135", "Equals", "en-GB")).toBeUndefined();
  });
});

/* ───────────────────────────────────────────────────────────── the filter */

describe("buildProjectFilter", () => {
  it("UT-OV-014 is undefined when nothing is set", () => {
    // So the request carries no $filter at all rather than an empty string.
    expect(buildProjectFilter(EMPTY_FILTER, "en-GB")).toBeUndefined();
  });

  it("UT-OV-015 omits every blank clause", () => {
    const filter: ProjectFilter = { ...EMPTY_FILTER, countryId: G1 };
    expect(buildProjectFilter(filter, "en-GB")).toBe(`_vsb_country_value eq ${G1}`);
  });

  it("UT-OV-016 ANDs the clauses that are set", () => {
    const filter: ProjectFilter = {
      ...EMPTY_FILTER, countryId: G1, technology: TECHNOLOGY.wind,
    };
    const out = buildProjectFilter(filter, "en-GB") ?? "";
    expect(out).toContain(`_vsb_country_value eq ${G1}`);
    expect(out).toContain(`vsb_technology eq ${TECHNOLOGY.wind}`);
    expect(out).toContain(" and ");
  });

  it("UT-OV-017 filters area and status by lookup id, not by related name", () => {
    // Documented divergence: reaching a related name needs $expand. It also fixes a canvas
    // bug where two identically-named areas in different countries matched each other.
    const filter: ProjectFilter = {
      ...EMPTY_FILTER, countryId: G1, areaId: G2, clusterStateId: G2,
    };
    const out = buildProjectFilter(filter, "en-GB") ?? "";
    expect(out).toContain(`_vsb_countryarea_value eq ${G2}`);
    expect(out).toContain(`_vsb_clusterstate_value eq ${G2}`);
    expect(out).not.toContain("/vsb_name");
  });

  it("UT-OV-018 filters the project manager by the Entra object id", () => {
    const filter: ProjectFilter = { ...EMPTY_FILTER, projectManagerId: G1 };
    expect(buildProjectFilter(filter, "en-GB")).toBe(`_vsb_projectmanager_value eq ${G1}`);
  });

  it("UT-OV-019 rejects a projectManagerId that is not a GUID", () => {
    // Filter values reach $filter; a hand-edited URL is untrusted input.
    const filter: ProjectFilter = { ...EMPTY_FILTER, projectManagerId: "1 or 1 eq 1" };
    expect(() => buildProjectFilter(filter, "en-GB")).toThrow(/Not a GUID/);
  });

  it("UT-OV-020 treats technology 0 as set, not as blank", () => {
    // A `!filter.technology` test would drop a legitimate zero-valued option.
    const filter: ProjectFilter = { ...EMPTY_FILTER, technology: 0 };
    expect(buildProjectFilter(filter, "en-GB")).toBe("vsb_technology eq 0");
  });
});

describe("applyFilterPatch", () => {
  it("UT-OV-021 clears Area when Country changes", () => {
    const cur: ProjectFilter = { ...EMPTY_FILTER, countryId: G1, areaId: G2 };
    expect(applyFilterPatch(cur, { countryId: G2 }).areaId).toBeNull();
  });

  it("UT-OV-022 clears Area when Country is cleared", () => {
    const cur: ProjectFilter = { ...EMPTY_FILTER, countryId: G1, areaId: G2 };
    expect(applyFilterPatch(cur, { countryId: null }).areaId).toBeNull();
  });

  it("UT-OV-023 keeps Area when Country is re-set to the same value", () => {
    const cur: ProjectFilter = { ...EMPTY_FILTER, countryId: G1, areaId: G2 };
    expect(applyFilterPatch(cur, { countryId: G1 }).areaId).toBe(G2);
  });

  it("UT-OV-024 clears the operator when the capacity is cleared", () => {
    const cur: ProjectFilter = { ...EMPTY_FILTER, capacity: "10", capacityOperator: "Less than" };
    expect(applyFilterPatch(cur, { capacity: "" }).capacityOperator).toBe("");
  });

  it("UT-OV-025 defaults the operator when a capacity is typed", () => {
    expect(applyFilterPatch(EMPTY_FILTER, { capacity: "10" }).capacityOperator).toBe("Equals");
  });

  it("UT-OV-026 returns the SAME OBJECT for a no-op patch", () => {
    // A fresh object each call would re-render forever through a memoised consumer.
    const cur: ProjectFilter = { ...EMPTY_FILTER, keyword: "x" };
    expect(applyFilterPatch(cur, { keyword: "x" })).toBe(cur);
    expect(applyFilterPatch(cur, {})).toBe(cur);
  });
});

describe("isFilterActive / clearIconState", () => {
  it("UT-OV-027 is inactive only when nothing is set", () => {
    expect(isFilterActive(EMPTY_FILTER)).toBe(false);
    expect(isFilterActive({ ...EMPTY_FILTER, keyword: "a" })).toBe(true);
    expect(isFilterActive({ ...EMPTY_FILTER, technology: TECHNOLOGY.pv })).toBe(true);
  });

  it("UT-OV-028 disables the funnel while its filter is blank", () => {
    expect(clearIconState("")).toEqual({ active: false, disabled: true });
    expect(clearIconState(null)).toEqual({ active: false, disabled: true });
    expect(clearIconState([])).toEqual({ active: false, disabled: true });
    expect(clearIconState("Germany")).toEqual({ active: true, disabled: false });
  });
});

/* ──────────────────────────────────────────────────────────────── sorting */

describe("sorting", () => {
  it("UT-OV-029 defaults to Project Name ascending", () => {
    expect(DEFAULT_SORT).toEqual({ col: COL.name, asc: true });
  });

  it("UT-OV-030 refuses a column outside the allow-list", () => {
    // An unvetted column in $orderby is a 400 against Dataverse.
    expect(resolveSortColumn("vsb_projectname")).toBe("vsb_projectname");
    expect(resolveSortColumn("1;DROP")).toBe(COL.name);
    expect(resolveSortColumn("")).toBe(COL.name);
  });

  it("UT-OV-031 excludes the lookup columns that cannot be ordered server-side", () => {
    // Sorting them client-side within one page would order the page differently from the
    // table — a lie visible at every page boundary.
    expect(SORTABLE).not.toContain(COL.clusterState);
    expect(SORTABLE).not.toContain(COL.projectManager);
    expect(SORTABLE).not.toContain(COL.country);
    expect(SORTABLE).not.toContain(COL.area);
  });

  it("UT-OV-032 flips direction on the sorted column and resets on another", () => {
    const cur = { col: COL.name, asc: true };
    expect(nextSortState(cur, COL.name)).toEqual({ col: COL.name, asc: false });
    expect(nextSortState(cur, COL.shortName)).toEqual({ col: COL.shortName, asc: true });
  });

  it("UT-OV-033 falls back to the default when an unsortable column is clicked", () => {
    expect(nextSortState({ col: COL.shortName, asc: true }, COL.country))
      .toEqual({ col: COL.name, asc: true });
  });
});

/* ───────────────────────────────────────────────────────────── row mapping */

describe("toProjectRow", () => {
  const raw: Record<string, unknown> = {
    [COL.id]: G1,
    [COL.name]: "Contr. Endpoint Testproject",
    [COL.shortName]: "CET",
    [COL.projectIdCode]: "99999",
    [COL.internalProjectId]: "20100479",
    [COL.technology]: TECHNOLOGY.wind,
    [fv(COL.technology)]: "Wind",
    [COL.totalCapacity]: 12.5,
    [COL.approvalState]: APPROVAL_STATE.approved,
    [fv(COL.approvalState)]: "Approved",
    [COL.clusterState]: G2,
    [fv(COL.clusterState)]: "Cluster 4",
    [fv(COL.country)]: "Germany",
    [COL.country]: G2,
    [fv(COL.area)]: "Hesse",
    [fv(COL.projectManager)]: "Pilevski, Alexander",
    [COL.m1FeasibilityStudies]: "2026-03-15T00:00:00Z",
  };

  it("UT-OV-034 maps the grid's visible columns", () => {
    const row = toProjectRow(raw);
    expect(row.name).toBe("Contr. Endpoint Testproject");
    expect(row.shortName).toBe("CET");
    expect(row.statusName).toBe("Cluster 4");
    expect(row.managerName).toBe("Pilevski, Alexander");
    expect(row.countryName).toBe("Germany");
    expect(row.areaName).toBe("Hesse");
    expect(row.technology).toBe("Wind");
    expect(row.internalProjectId).toBe("20100479");
  });

  it("UT-OV-035 prefers the row's own FormattedValue for technology", () => {
    expect(toProjectRow({ ...raw, [fv(COL.technology)]: "Viento" }).technology).toBe("Viento");
  });

  it("UT-OV-036 never renders the raw option-set integer", () => {
    const row = toProjectRow({ [COL.technology]: TECHNOLOGY.pv });
    expect(row.technology).toBe("PV");
    expect(row.technology).not.toContain("9528");
  });

  it("UT-OV-037 colours the accent bar from the approval state", () => {
    expect(toProjectRow(raw).accentColor).toBe(palette.akzent3); // Approved -> green
    expect(toProjectRow({ ...raw, [COL.approvalState]: APPROVAL_STATE.rejected }).accentColor)
      .toBe(palette.akzent5); // red
    expect(toProjectRow({ ...raw, [COL.approvalState]: APPROVAL_STATE.draft }).accentColor)
      .toBe(palette.akzent2); // teal
  });

  it("UT-OV-038 falls back to the cluster name when there is no approval state", () => {
    const row = toProjectRow({ [fv(COL.clusterState)]: "Draft" });
    expect(row.accentColor).toBe(palette.akzent2);
  });

  it("UT-OV-039 survives a row with nothing in it", () => {
    // A $select that omits a column, or a genuinely empty project, must not throw.
    const row = toProjectRow({});
    expect(row.name).toBe("");
    expect(row.totalCapacity).toBeNull();
    expect(row.approvalState).toBeNull();
    expect(row.accentColor).toBeUndefined();
    expect(row.milestones).toHaveLength(5);
  });
});

/* ───────────────────────────────────────────────────────────── formatting */

describe("formatting", () => {
  it("UT-OV-040 gives capacity one mandatory decimal and a second only when non-zero", () => {
    // `Text('Total Capacity', "#,##0.0#")` — the screenshot shows both 136.0 and 47.13.
    expect(formatCapacity(136, "en-GB")).toBe("136.0");
    expect(formatCapacity(47.13, "en-GB")).toBe("47.13");
    expect(formatCapacity(0, "en-GB")).toBe("0.0");
    expect(formatCapacity(1234.5, "en-GB")).toBe("1,234.5");
  });

  it("UT-OV-041 renders a blank capacity as empty, not as 0", () => {
    expect(formatCapacity(null)).toBe("");
    expect(formatCapacity(undefined)).toBe("");
    expect(formatCapacity(Number.NaN)).toBe("");
  });

  it("UT-OV-042 formats dates dd.mm.yyyy", () => {
    expect(formatGridDate("2026-03-05T00:00:00Z")).toBe("05.03.2026");
    expect(formatGridDate(null)).toBe("");
    expect(formatGridDate("not a date")).toBe("");
  });
});

/* ────────────────────────────────────────────────────────── cost module */

describe("cost module lock", () => {
  const ok = {
    projectStartDate: "2026-01-01", totalCapacity: 10, netYieldP50: 5, statusName: "Cluster 2",
  };

  it("UT-OV-043 lists the missing prerequisites in the canvas order", () => {
    expect(costModuleLock({ ...ok, projectStartDate: null, totalCapacity: null }))
      .toEqual(["Milestones", "Generator"]);
    expect(costModuleLock({
      projectStartDate: null, totalCapacity: null, netYieldP50: null, statusName: "Draft",
    })).toEqual([
      "Milestones", "Generator", "Production", "Change the project status from Draft",
    ]);
  });

  it("UT-OV-044 gates Edit Costs on the Draft test ALONE", () => {
    // The canvas handler is If(ClusterState.Name = "Draft", <popup>, <launch>). A project
    // with a blank start date but a status of Cluster 2 is NOT blocked, even though
    // costModuleLock still lists "Milestones". Conflating the two is the easy mistake.
    expect(isCostModuleLocked(ok)).toBe(false);
    expect(isCostModuleLocked({ ...ok, projectStartDate: null })).toBe(false);
    expect(isCostModuleLocked({ ...ok, statusName: "Draft" })).toBe(true);
  });

  it("UT-OV-045 lists nothing when everything is present", () => {
    expect(costModuleLock(ok)).toEqual([]);
  });
});

/* ─────────────────────────────────────────────────────────── command bar */

describe("commandBarState", () => {
  const selected: SelectedProject = {
    id: G1, name: "P", approvalState: APPROVAL_STATE.draft, statusName: "Cluster 1",
    statusOrder: 1, countryName: "Germany", spoSharepointUrl: null, spoTeamsUrl: null,
  };
  const base = {
    selected, canCreate: true, canEditSelected: true,
    userMail: "nobody@vsb.energy", analyticsAppUsers: [] as string[],
  };

  it("UT-OV-046 disables the six selection commands with nothing selected", () => {
    const s = commandBarState({ ...base, selected: null });
    expect(s.editProject.enabled).toBe(false);
    expect(s.editCosts.enabled).toBe(false);
    expect(s.deleteProject.enabled).toBe(false);
    expect(s.simulateProject.enabled).toBe(false);
    expect(s.viewProjectOverviewPowerBI.enabled).toBe(false);
    expect(s.editProject.reason).toBe("Select a project first.");
  });

  it("UT-OV-047 degrades the LABEL, not the enablement, without edit rights", () => {
    // The canvas gates Edit Project and Edit Costs on selection ONLY; lacking edit rights
    // changes the label to View and the icon to ReadingMode.
    const s = commandBarState({ ...base, canEditSelected: false });
    expect(s.editCosts.enabled).toBe(true);
    expect(s.editCosts.label).toBe("View Costs");
    expect(s.editCosts.icon).toBe("ReadingMode");
    expect(s.editProject.label).toBe("View Project");
  });

  it("UT-OV-048 uses the Edit labels when edit rights are held", () => {
    const s = commandBarState(base);
    expect(s.editCosts.label).toBe("Edit Costs");
    expect(s.editCosts.icon).toBe("Edit");
    expect(s.editProject.label).toBe("Edit Project");
  });

  it("UT-OV-049 refuses to delete an approved project whatever the privileges", () => {
    const s = commandBarState({
      ...base, selected: { ...selected, approvalState: APPROVAL_STATE.approved },
    });
    expect(s.deleteProject.enabled).toBe(false);
    expect(s.deleteProject.reason).toBe("An approved project cannot be deleted.");
  });

  it("UT-OV-050 gates Add Project on create permission", () => {
    expect(commandBarState({ ...base, canCreate: false }).addProject.enabled).toBe(false);
    expect(commandBarState(base).addProject.enabled).toBe(true);
  });

  it("UT-OV-051 SKELETON FIX 2: Simulate visibility is the analytics allow-list", () => {
    // The skeleton gated it on environmentName === "Dev"; the canvas gates it on
    // User().Email in colAnalyticsAppUsers.
    expect(commandBarState(base).simulateProject.visible).toBe(false);
    const allowed = commandBarState({
      ...base, userMail: "a@vsb.energy", analyticsAppUsers: ["A@VSB.ENERGY"],
    });
    expect(allowed.simulateProject.visible).toBe(true);
  });

  it("UT-OV-052 needs a status past Draft for Simulate", () => {
    const s = commandBarState({
      ...base, userMail: "a@b", analyticsAppUsers: ["a@b"],
      selected: { ...selected, statusOrder: 0 },
    });
    expect(s.simulateProject.enabled).toBe(false);
  });

  it("UT-OV-053 shows SharePoint and Teams for Croatia only", () => {
    expect(commandBarState(base).viewSharepoint.visible).toBe(false);
    const hr = commandBarState({
      ...base,
      selected: {
        ...selected, countryName: "Croatia",
        spoSharepointUrl: "https://x", spoTeamsUrl: "https://y",
      },
    });
    expect(hr.viewSharepoint.visible).toBe(true);
    expect(hr.viewSharepoint.enabled).toBe(true);
    expect(hr.viewSharepoint.label).toBe("View Sharepoint Site");
    expect(hr.viewTeams.icon).toBe("View");
  });

  it("UT-OV-054 needs BOTH SPO urls, not either", () => {
    const one = commandBarState({
      ...base,
      selected: { ...selected, countryName: "Croatia", spoSharepointUrl: "https://x", spoTeamsUrl: null },
    });
    expect(one.viewSharepoint.enabled).toBe(false);
  });

  it("UT-OV-055 gates the two Power BI items on the report-viewer allow-list", () => {
    expect(commandBarState(base).viewProjectOverviewPowerBI.visible).toBe(false);
    const viewer = commandBarState({ ...base, userMail: REPORT_VIEWERS[0] ?? "" });
    expect(viewer.viewProjectOverviewPowerBI.visible).toBe(true);
    expect(viewer.viewProjectOverviewPowerBI.label).toBe("Show Project Overview (Beta)");
    expect(viewer.viewPortfolioOverviewPowerBI.label).toBe("Show Portfolio Overview (Beta)");
  });

  it("UT-OV-056 matches the allow-lists case-insensitively and ignores surrounding space", () => {
    const viewer = commandBarState({ ...base, userMail: "  ALEXANDER.PILEVSKI@VSB.ENERGY " });
    expect(viewer.viewProjectOverviewPowerBI.visible).toBe(true);
  });

  it("UT-OV-057 SKELETON FIX 3: Dashboard and Portfolio Overview ignore the selection", () => {
    // Neither canvas item declares ItemEnabled, so PowerCAT leaves them enabled.
    const s = commandBarState({ ...base, selected: null, userMail: REPORT_VIEWERS[0] ?? "" });
    expect(s.viewDashboardFunctionality.enabled).toBe(true);
    expect(s.viewDashboardFunctionality.visible).toBe(true);
    expect(s.viewPortfolioOverviewPowerBI.enabled).toBe(true);
  });

  it("UT-OV-058 SKELETON FIX 4: the report-viewer list is the canvas one", () => {
    expect(REPORT_VIEWERS).toContain("andreas.laeubli@vsb.energy");
    expect(REPORT_VIEWERS).toContain("ravindra.mund@vsb.energy");
    expect(REPORT_VIEWERS).toContain("test-vsbcloud-01@vsb.energy");
    expect(REPORT_VIEWERS).not.toContain("philip.wagner@vsb.energy");
    expect(REPORT_VIEWERS).toHaveLength(10);
  });

  it("UT-OV-059 gives every enabled command no reason and every disabled one a reason", () => {
    const s = commandBarState({ ...base, selected: null });
    for (const c of Object.values(s)) {
      if (c.enabled) expect(c.reason).toBeUndefined();
    }
    expect(s.editCosts.reason).toBeTruthy();
  });
});

/* ────────────────────────────────────────────────────────────────── paging */

describe("paging", () => {
  it("UT-OV-060 reports one page for an empty list, not zero", () => {
    // The canvas adds `If(total = 0, 1, 0)` so the footer reads "Page: 1 from 1".
    expect(totalPages(0)).toBe(1);
  });

  it("UT-OV-061 rounds up", () => {
    expect(totalPages(1129, 200)).toBe(6);
    expect(totalPages(200, 200)).toBe(1);
    expect(totalPages(201, 200)).toBe(2);
  });

  it("UT-OV-062 snaps a page beyond the end back to 1, as the canvas did", () => {
    expect(clampPage(9, 1129, 200)).toBe(1);
    expect(clampPage(6, 1129, 200)).toBe(6);
    expect(clampPage(0, 1129, 200)).toBe(1);
    expect(clampPage(Number.NaN, 1129, 200)).toBe(1);
  });

  it("UT-OV-063 renders the footer strings the screenshot shows", () => {
    expect(pagerLabels({ page: 1, pageSize: 200, totalRows: 1129 })).toEqual({
      totalRows: "Total Rows: 1129",
      page: "Page: 1 from 6",
    });
  });

  it("UT-OV-064 uses the canvas page size", () => {
    expect(PAGE_SIZE).toBe(200);
  });
});

/* ────────────────────────────────────────────────────── URL serialisation */

describe("criteria round trip", () => {
  it("UT-OV-065 serialises a pristine list to nothing at all", () => {
    expect(serialiseCriteria(DEFAULT_CRITERIA).toString()).toBe("");
  });

  it("UT-OV-066 round-trips a full criteria set", () => {
    const criteria = {
      filter: {
        keyword: "test", projectManagerId: G1, countryId: G2, areaId: G1,
        technology: TECHNOLOGY.pv, capacity: "12.5",
        capacityOperator: "Greater than" as const, clusterStateId: G2,
      },
      sort: { col: COL.shortName, asc: false },
      page: 3,
    };
    expect(parseCriteria(serialiseCriteria(criteria))).toEqual(criteria);
  });

  it("UT-OV-067 falls back to the default sort for an unknown column", () => {
    const p = new URLSearchParams({ sort: "1;DROP TABLE", dir: "desc" });
    expect(parseCriteria(p).sort).toEqual({ col: COL.name, asc: false });
  });

  it("UT-OV-068 drops an unknown capacity operator but keeps a usable default", () => {
    const p = new URLSearchParams({ cap: "10", capop: "Nonsense" });
    expect(parseCriteria(p).filter.capacityOperator).toBe("Equals");
  });

  it("UT-OV-069 drops an area with no country as a malformed link", () => {
    const p = new URLSearchParams({ a: G1 });
    expect(parseCriteria(p).filter.areaId).toBeNull();
  });

  it("UT-OV-070 never throws on a hand-edited URL", () => {
    for (const q of ["p=-5", "p=abc", "t=nonsense", "capop=", "q=", "cap=abc"]) {
      expect(() => parseCriteria(new URLSearchParams(q))).not.toThrow();
    }
    expect(parseCriteria(new URLSearchParams("p=-5")).page).toBe(1);
    expect(parseCriteria(new URLSearchParams("t=nonsense")).filter.technology).toBeNull();
  });

  it("UT-OV-071 accepts a technology by label as well as by value", () => {
    expect(parseCriteria(new URLSearchParams("t=Wind")).filter.technology)
      .toBe(TECHNOLOGY.wind);
    expect(parseCriteria(new URLSearchParams(`t=${TECHNOLOGY.pv}`)).filter.technology)
      .toBe(TECHNOLOGY.pv);
  });

  it("UT-OV-072 omits the capacity operator when there is no capacity", () => {
    const c = { ...DEFAULT_CRITERIA, filter: { ...EMPTY_FILTER, capacityOperator: "Equals" as const } };
    expect(serialiseCriteria(c).has("capop")).toBe(false);
  });
});

/* ──────────────────────────────────────────────────── people typeahead */

describe("filterPeople", () => {
  const people: PersonOption[] = [
    { id: G1, label: "Singh Rajput, Shakti (external)", mail: "shakti.singh@vsb.energy" },
    { id: G2, label: "Georg, Lucas (external)", mail: "lucas.georg@vsb.energy" },
    { id: "3", label: "Rohit Revnath Somase", mail: null },
  ];

  it("UT-OV-073 matches every typed word in any order", () => {
    // "Shakti Singh" must find "Singh Rajput, Shakti (external)" — a plain
    // includes("shakti singh") would fail on the surname-first form.
    expect(filterPeople(people, "Shakti Singh").map((p) => p.id)).toEqual([G1]);
    expect(filterPeople(people, "singh shakti").map((p) => p.id)).toEqual([G1]);
  });

  it("UT-OV-074 matches on the mail as well as the name", () => {
    expect(filterPeople(people, "lucas.georg").map((p) => p.id)).toEqual([G2]);
  });

  it("UT-OV-075 returns nothing for an empty query", () => {
    // The panel opens only once something is typed, never as a browse-everyone list.
    expect(filterPeople(people, "")).toEqual([]);
    expect(filterPeople(people, "   ")).toEqual([]);
  });

  it("UT-OV-076 tolerates a person with no mail", () => {
    expect(filterPeople(people, "Rohit").map((p) => p.id)).toEqual(["3"]);
  });

  it("UT-OV-077 caps the panel", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      id: String(i), label: `Person ${i}`, mail: null,
    }));
    expect(filterPeople(many, "Person")).toHaveLength(8);
    expect(filterPeople(many, "Person", 3)).toHaveLength(3);
  });
});
