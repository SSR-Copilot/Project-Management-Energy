/**
 * Project Main Screen — the spec's UT-MAIN-001..025, plus 026..034 for rules the spec
 * exercises through rendering that are pure functions here.
 *
 * NOTE ON NUMBERING. This file previously carried IDs 001-017 against a different set of
 * assertions than the specification assigns those numbers — its 001 was "an empty filter
 * returns everything" (`applyFilter`), where the spec's 001 is "grid binds server page to
 * columns". Since the point of keeping `UT-<SCREEN>-nnn` IDs is that a CI failure points
 * straight back at a documented rule, the whole file is renumbered to the spec and the
 * assertions with no spec ID are appended from 026. The four `serverFilterFor` cases survive
 * as 026-029.
 */
import { describe, it, expect } from "vitest";
import { CHOICE, CHOICE_PROCESS, SELECT } from "@/data/entities";
import { palette } from "@/theme/tokens";
import { computePaging, pagerVisible, pagerLabel, totalRowsLabel } from "@/domain/paging";
import type { CurrentUser } from "@/domain/session";
import {
  PROJECT_MAIN_COL as C,
  PROJECT_MAIN_COL_UNVERIFIED,
  fv,
  CAPACITY_OPERATORS,
  emptyProjectListFilter,
  keywordClause,
  capacityClause,
  capacityFieldError,
  resolveCapacityOperator,
  buildProjectFilter,
  applyFilterPatch,
  clearIconState,
  isFilterActive,
  toProjectListRow,
  formatCapacity,
  formatMilestoneDate,
  costModuleLock,
  isCostModuleLocked,
  commandBarState,
  REPORT_VIEWERS,
  deleteMessages,
  deleteMessagesCanvasParity,
  applyOptimisticDelete,
  serverFilterFor,
  nextSortState,
  DEFAULT_SORT,
  resolveSortColumn,
  technologyValue,
  technologyLabel,
  parseCriteria,
  serialiseCriteria,
  defaultProjectListCriteria,
  filterPeopleSuggestions,
  type ProjectListCriteria,
  type ProjectListFilter,
  type SelectedProjectRow,
  type CommandBarContext,
} from "./rules";

const A = CHOICE.approvalState;
const T = CHOICE_PROCESS.technology;

/** A Dataverse-shaped row, as `queryProjects` returns it. */
const dvRow = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  [C.id]: "p-1",
  [C.name]: "0 0 0 0",
  [C.shortName]: "500",
  [C.internalProjectId]: "24100007",
  [C.technology]: T.wind,
  [fv(C.technology)]: "Wind",
  [C.totalCapacity]: 136,
  [C.weightedMw]: 125.12,
  [C.approvalState]: A.approved,
  [fv(C.approvalState)]: "Approved",
  [C.projectStartDate]: "2025-04-01",
  [C.netYieldP50]: 326_400,
  [C.m1FeasibilityStudies]: "2025-06-01",
  [C.m2ProjectDevelopmentStarted]: "2025-09-01",
  [C.m3ApplicationSubmitted]: "2026-02-01",
  [C.m4LegallyBindingPermits]: "2026-09-01",
  [C.m5Construction]: "2027-03-01",
  [fv(C.country)]: "Italy",
  [fv(C.area)]: "Puglia",
  [fv(C.clusterState)]: "Cluster 1",
  [fv(C.projectManager)]: "Georg, Lucas (external)",
  [C.spoSharepointUrl]: null,
  [C.spoTeamsUrl]: null,
  ...over,
});

const filter = (over: Partial<ProjectListFilter> = {}): ProjectListFilter => ({
  ...emptyProjectListFilter,
  ...over,
});

const sel = (over: Partial<SelectedProjectRow> = {}): SelectedProjectRow => ({
  id: "p-1",
  name: "0 0 0 0",
  approvalState: A.notStarted,
  clusterStateName: "Cluster 1",
  clusterStateOrder: 1,
  countryName: "Italy",
  spoSharepointUrl: null,
  spoTeamsUrl: null,
  ...over,
});

const ctx = (over: Partial<CommandBarContext> = {}): CommandBarContext => ({
  selected: sel(),
  canCreate: true,
  canEditSelected: true,
  environmentName: "Dev",
  userMail: "someone.else@vsb.energy",
  reportViewers: REPORT_VIEWERS,
  ...over,
});

const user = (over: Partial<CurrentUser> = {}): CurrentUser =>
  ({
    id: "u-1",
    mail: "a@vsb.energy",
    displayName: "A",
    lang: "en",
    roles: [],
    isApplicationAdministrator: false,
    isControllerOwnData: false,
    isProjectDataAllCountries: false,
    isProjectManagerOwnProjects: true,
    isDeveloper: false,
    canEditSelectedProject: false,
    editableCountries: [],
    editableCountriesAsString: "",
    ...over,
  }) as CurrentUser;

/* ══════════════════════════════════════════════════════ 001 — the row model ════ */

describe("UT-MAIN-001 grid binds the server page to its columns", () => {
  it("projects every column the screenshot shows", () => {
    const r = toProjectListRow(dvRow());

    expect(r.name).toBe("0 0 0 0");
    expect(r.shortName).toBe("500");
    expect(r.statusName).toBe("Cluster 1");
    expect(r.managerName).toBe("Georg, Lucas (external)");
    expect(r.countryName).toBe("Italy");
    expect(r.areaName).toBe("Puglia");
    expect(r.technologyLabel).toBe("Wind");
    expect(formatCapacity(r.totalCapacity)).toBe("136.0");
    expect(r.internalProjectId).toBe("24100007");
    expect(r.approvalLabel).toBe("Approved");
    expect(r.milestones).toHaveLength(5);
  });

  it("gives the row its approval accent colour", () => {
    expect(toProjectListRow(dvRow()).accentColor).toBe(palette.akzent3);
    expect(toProjectListRow(dvRow({ [C.approvalState]: A.rejected })).accentColor).toBe(
      palette.akzent5,
    );
    expect(toProjectListRow(dvRow({ [C.approvalState]: A.notStarted })).accentColor).toBe(
      palette.akzent2,
    );
  });

  it("formats the five milestone dates dd.mm.yyyy", () => {
    const r = toProjectListRow(dvRow());
    expect(formatMilestoneDate(r.milestones[0])).toBe("01.06.2025");
    expect(formatMilestoneDate(r.milestones[4])).toBe("01.03.2027");
    expect(formatMilestoneDate(null)).toBe("");
  });

  it("survives a row with every optional field missing", () => {
    const r = toProjectListRow({ [C.id]: "p-9" });
    expect(r.id).toBe("p-9");
    expect(r.name).toBe("");
    expect(r.totalCapacity).toBeNull();
    expect(r.milestones).toEqual([null, null, null, null, null]);
    expect(r.accentColor).toBeUndefined();
  });

  it("reads only columns the projection actually selects", () => {
    // The live bug this replaces: `toRow` read `_vsb_projectmanager_value` while
    // `SELECT.projectList` omitted it, so the value was always undefined.
    const selected = new Set<string>(SELECT.projectMain);
    for (const col of Object.values(C)) {
      expect(selected.has(col), `${col} is read but not selected`).toBe(true);
    }
  });
});

/* ══════════════════════════════════════════════════════ 002-009 — the filter ════ */

describe("UT-MAIN-002 blank filters produce no $filter clauses", () => {
  it("returns undefined so the request omits $filter entirely", () => {
    // The spec's wording says "empty string"; its expected result is "request omits
    // $filter", which undefined achieves directly through `f.and`'s contract.
    expect(buildProjectFilter(emptyProjectListFilter)).toBeUndefined();
  });
});

describe("UT-MAIN-003 country filter emits one equality clause", () => {
  it("emits the country clause and nothing else", () => {
    const out = buildProjectFilter(filter({ countryId: "c-de" }));
    expect(out).toBe(`(${C.country} eq c-de)`);
    expect(out).not.toContain("contains(");
    expect(out).not.toContain(C.totalCapacity);
  });
});

describe("UT-MAIN-004 keyword under 3 characters is ignored", () => {
  it("emits no clause for one or two characters", () => {
    expect(keywordClause("")).toBeUndefined();
    expect(keywordClause("a")).toBeUndefined();
    expect(keywordClause("ab")).toBeUndefined();
    // Whitespace does not count towards the minimum.
    expect(keywordClause("  a  ")).toBeUndefined();
    expect(buildProjectFilter(filter({ keyword: "ab" }))).toBeUndefined();
  });
});

describe("UT-MAIN-005 keyword of 3+ characters searches four fields", () => {
  it("ORs contains() over name, project number, short name and area", () => {
    const out = keywordClause("nor")!;
    expect(out).toContain(`contains(${C.name},'nor')`);
    expect(out).toContain(`contains(${C.internalProjectId},'nor')`);
    expect(out).toContain(`contains(${C.shortName},'nor')`);
    expect(out).toContain(`contains(${C.area},'nor')`);
    expect(out.split(" or ")).toHaveLength(4);
  });

  it("escapes an apostrophe, as OData requires", () => {
    expect(keywordClause("d'Aosta")).toContain("d''Aosta");
  });
});

describe("UT-MAIN-006 capacity operator maps to an OData comparison", () => {
  it("maps all five operators", () => {
    const pairs: [string, string][] = [
      ["Equals", "eq"],
      ["Greater than", "gt"],
      ["Greater than or equal to", "ge"],
      ["Less than", "lt"],
      ["Less than or equal to", "le"],
    ];
    for (const [label, op] of pairs) {
      expect(capacityClause("12.5", label as never)).toBe(`${C.totalCapacity} ${op} 12.5`);
    }
  });

  it("uses the operators' canvas order, with Equals first", () => {
    // The stored value IS the display string, and the default is `First(colFilterOperators)`.
    expect(CAPACITY_OPERATORS[0]).toBe("Equals");
    expect(CAPACITY_OPERATORS).toHaveLength(5);
  });
});

describe("UT-MAIN-007 capacity typed without an operator defaults to Equals", () => {
  it("resolves the operator rather than dropping the clause", () => {
    expect(resolveCapacityOperator("12.5", "")).toBe("Equals");
    expect(capacityClause("12.5", "")).toBe(`${C.totalCapacity} eq 12.5`);
  });

  it("resolves to null when there is no capacity to compare", () => {
    expect(resolveCapacityOperator("", "")).toBeNull();
    expect(resolveCapacityOperator("   ", "Greater than")).toBeNull();
  });

  it("applies the default through the patch reducer too, so the two cannot drift", () => {
    const next = applyFilterPatch(emptyProjectListFilter, { capacity: "12.5" });
    expect(next.capacityOperator).toBe("Equals");
  });
});

describe("UT-MAIN-008 a non-two-decimal capacity blocks the filter and shows the error", () => {
  it("reports the canvas message", () => {
    expect(capacityFieldError("12.345")).toBe("Value must be a numeric");
    expect(capacityFieldError("abc")).toBe("Value must be a numeric");
  });

  it("accepts up to two decimals, and a blank box is not an error", () => {
    expect(capacityFieldError("12")).toBeNull();
    expect(capacityFieldError("12.5")).toBeNull();
    expect(capacityFieldError("47.13")).toBeNull();
    expect(capacityFieldError("")).toBeNull();
  });

  it("emits no clause while the value is invalid", () => {
    expect(capacityClause("12.345", "Equals")).toBeUndefined();
    expect(buildProjectFilter(filter({ capacity: "12.345", capacityOperator: "Equals" })))
      .toBeUndefined();
  });
});

describe("UT-MAIN-009 clearing Country clears Area", () => {
  it("drops the area when the country is cleared", () => {
    const cur = filter({ countryId: "c-de", areaId: "ca-de-bb" });
    const next = applyFilterPatch(cur, { countryId: null });
    expect(next.countryId).toBeNull();
    expect(next.areaId).toBeNull();
  });

  it("also drops the area when the country CHANGES, since it belonged to the old one", () => {
    const cur = filter({ countryId: "c-de", areaId: "ca-de-bb" });
    expect(applyFilterPatch(cur, { countryId: "c-it" }).areaId).toBeNull();
  });

  it("clearing Capacity clears its operator", () => {
    const cur = filter({ capacity: "12.5", capacityOperator: "Greater than" });
    const next = applyFilterPatch(cur, { capacity: "" });
    expect(next.capacityOperator).toBe("");
  });

  it("returns the SAME object for a no-op patch, to keep selector references stable", () => {
    // A fresh object every call renders forever through a zustand selector — React #185.
    const cur = filter({ countryId: "c-de" });
    expect(applyFilterPatch(cur, { countryId: "c-de" })).toBe(cur);
    expect(applyFilterPatch(cur, {})).toBe(cur);
  });

  it("drives the per-filter clear icon", () => {
    expect(clearIconState(null)).toEqual({ icon: "Filter", disabled: true });
    expect(clearIconState("")).toEqual({ icon: "Filter", disabled: true });
    expect(clearIconState("c-de")).toEqual({ icon: "ClearFilter", disabled: false });
  });

  it("knows whether anything is filtered at all", () => {
    expect(isFilterActive(emptyProjectListFilter)).toBe(false);
    expect(isFilterActive(filter({ keyword: "nor" }))).toBe(true);
  });
});

/* ══════════════════════════════════════════════════════ 010-012 — paging ════ */

describe("UT-MAIN-010 page count of an empty result is 1", () => {
  it("never reports zero pages", () => {
    const p = computePaging(0, 200, 1);
    expect(p.totalPages).toBe(1);
    expect(p.page).toBe(1);
  });
});

describe("UT-MAIN-011 a page beyond range resets to 1", () => {
  it("resets rather than clamping to the last page", () => {
    expect(computePaging(100, 200, 3).page).toBe(1);
  });
});

describe("UT-MAIN-012 the pager is hidden for a single page", () => {
  it("hides at one page and shows at more", () => {
    expect(pagerVisible(computePaging(150, 200, 1))).toBe(false);
    expect(pagerVisible(computePaging(1127, 200, 1))).toBe(true);
  });
});

/* ══════════════════════════════════════════════════════ 013 — approval ════ */

describe("UT-MAIN-013 approval decoration for each state", () => {
  it("is exercised in full by src/domain/approval.test.ts", () => {
    // Kept as a spec-traceable smoke check; the exhaustive table lives with the function.
    const r = toProjectListRow(dvRow({ [C.approvalState]: A.inProgress, [fv(C.approvalState)]: "" }));
    expect(r.approvalLabel).toBe("Approving");
    expect(r.accentColor).toBe(palette.akzent4);
  });
});

/* ══════════════════════════════════════════════════════ 014-019 — commands ════ */

describe("UT-MAIN-014 Edit degrades to View without edit rights", () => {
  it("changes the label and icon but NOT the enablement", () => {
    // The canvas gates Edit Project / Edit Costs on selection alone. Lacking edit rights
    // relabels them; it does not disable them. Getting this backwards is the whole point.
    const cs = commandBarState(ctx({ canEditSelected: false }));
    expect(cs.editProject.label).toBe("View Project");
    expect(cs.editProject.icon).toBe("ReadingMode");
    expect(cs.editProject.enabled).toBe(true);
    expect(cs.editCosts.label).toBe("View Costs");
    expect(cs.editCosts.icon).toBe("ReadingMode");
  });

  it("keeps Edit labels when rights are present", () => {
    const cs = commandBarState(ctx({ canEditSelected: true }));
    expect(cs.editProject.label).toBe("Edit Project");
    expect(cs.editCosts.label).toBe("Edit Costs");
  });

  it("disables both when nothing is selected", () => {
    const cs = commandBarState(ctx({ selected: null }));
    expect(cs.editProject.enabled).toBe(false);
    expect(cs.editProject.reason).toBe("Select a project first.");
  });

  it("gates Add Project on the table create privilege", () => {
    expect(commandBarState(ctx({ canCreate: false })).addProject.enabled).toBe(false);
    expect(commandBarState(ctx({ canCreate: true })).addProject.enabled).toBe(true);
  });
});

describe("UT-MAIN-015 Delete is disabled for an Approved project", () => {
  it("refuses an approved project even with full rights", () => {
    const cs = commandBarState(ctx({ selected: sel({ approvalState: A.approved }) }));
    expect(cs.deleteProject.enabled).toBe(false);
    expect(cs.deleteProject.reason).toContain("approved project cannot be deleted");
  });

  it("allows a Draft project with rights", () => {
    const cs = commandBarState(ctx({ selected: sel({ approvalState: A.notStarted }) }));
    expect(cs.deleteProject.enabled).toBe(true);
  });
});

describe("UT-MAIN-016 Delete is disabled without edit permission", () => {
  it("needs the record-level privilege", () => {
    const cs = commandBarState(ctx({ canEditSelected: false }));
    expect(cs.deleteProject.enabled).toBe(false);
  });
});

describe("UT-MAIN-017 Simulate is hidden outside Dev", () => {
  it("is invisible in QA and Prod", () => {
    expect(commandBarState(ctx({ environmentName: "QA" })).simulateProject.visible).toBe(false);
    expect(commandBarState(ctx({ environmentName: "Prod" })).simulateProject.visible).toBe(false);
  });

  it("is visible in Dev, and needs a project past Draft", () => {
    const dev = commandBarState(ctx({ environmentName: "Dev" }));
    expect(dev.simulateProject.visible).toBe(true);
    expect(dev.simulateProject.enabled).toBe(true);

    const draft = commandBarState(
      ctx({ environmentName: "Dev", selected: sel({ clusterStateOrder: 0 }) }),
    );
    expect(draft.simulateProject.enabled).toBe(false);
  });
});

describe("UT-MAIN-018 Sharepoint and Teams are visible only for Croatia with both URLs", () => {
  it("is invisible for Germany even with both URLs present", () => {
    const cs = commandBarState(
      ctx({
        selected: sel({
          countryName: "Germany",
          spoSharepointUrl: "https://spo/x",
          spoTeamsUrl: "https://teams/x",
        }),
      }),
    );
    expect(cs.viewSharepoint.visible).toBe(false);
    expect(cs.viewTeams.visible).toBe(false);
  });

  it("is visible for Croatia, and enabled only when BOTH URLs are present", () => {
    const noUrls = commandBarState(ctx({ selected: sel({ countryName: "Croatia" }) }));
    expect(noUrls.viewSharepoint.visible).toBe(true);
    expect(noUrls.viewSharepoint.enabled).toBe(false);

    const oneUrl = commandBarState(
      ctx({ selected: sel({ countryName: "Croatia", spoSharepointUrl: "https://spo/x" }) }),
    );
    expect(oneUrl.viewTeams.enabled).toBe(false);

    const both = commandBarState(
      ctx({
        selected: sel({
          countryName: "Croatia",
          spoSharepointUrl: "https://spo/x",
          spoTeamsUrl: "https://teams/x",
        }),
      }),
    );
    expect(both.viewSharepoint.enabled).toBe(true);
    expect(both.viewTeams.enabled).toBe(true);
  });
});

describe("UT-MAIN-019 the Power BI items are gated by the report-viewer list", () => {
  it("hides both for an address not on the list", () => {
    const cs = commandBarState(ctx({ userMail: "nobody@vsb.energy" }));
    expect(cs.powerBiOverview.visible).toBe(false);
    expect(cs.powerBiFinance.visible).toBe(false);
  });

  it("shows both for an address on the list, case- and whitespace-insensitively", () => {
    const cs = commandBarState(ctx({ userMail: "  Thomas.Lorenz@VSB.energy " }));
    expect(cs.powerBiOverview.visible).toBe(true);
    expect(cs.powerBiFinance.visible).toBe(true);
  });

  it("hides both when there is no signed-in mail at all", () => {
    expect(commandBarState(ctx({ userMail: null })).powerBiOverview.visible).toBe(false);
  });

  it("keeps Dashboard always visible, but — GUIDE p06 — gated on selection like the rest", () => {
    // The screenshot's "the other five are greyed" names all six non-Add commands with
    // nothing selected, Dashboard included. The old assertion here ("always available") was
    // written before the screenshots existed and is corrected against p06.
    const cs = commandBarState(ctx({ selected: null, canCreate: false, userMail: null }));
    expect(cs.dashboard.visible).toBe(true);
    expect(cs.dashboard.enabled).toBe(false);
    expect(cs.dashboard.reason).toBe("Select a project first.");

    const selected = commandBarState(ctx({ canCreate: false, userMail: null }));
    expect(selected.dashboard.enabled).toBe(true);
  });
});

/* ══════════════════════════════════════════════════ project manager typeahead ════ */

describe("UT-MAIN-037 the Project Manager typeahead — GUIDE p07", () => {
  const people = [
    { id: "u-1", label: "Shakti Singh", mail: "shakti.singh@xebia.com" },
    { id: "u-2", label: "Singh Rajput, Shakti (external)", mail: "shakti.singh@vsb.energy" },
    { id: "u-3", label: "Georg, Lucas (external)", mail: "lucas.georg@vsb.energy" },
  ];

  it("suggests nothing until something is typed", () => {
    expect(filterPeopleSuggestions(people, "")).toEqual([]);
    expect(filterPeopleSuggestions(people, "   ")).toEqual([]);
  });

  it("matches on name, case-insensitively", () => {
    const out = filterPeopleSuggestions(people, "shakti singh");
    expect(out.map((p) => p.id)).toEqual(["u-1", "u-2"]);
  });

  it("matches on email too", () => {
    expect(filterPeopleSuggestions(people, "xebia.com").map((p) => p.id)).toEqual(["u-1"]);
  });

  it("caps the panel at the given limit", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      id: `u-${i}`, label: `Person ${i}`, mail: null,
    }));
    expect(filterPeopleSuggestions(many, "person", 8)).toHaveLength(8);
  });

  it("matches nothing when nothing matches, rather than falling back to everyone", () => {
    expect(filterPeopleSuggestions(people, "zzz")).toEqual([]);
  });
});

/* ══════════════════════════════════════════════════════ 020-021 — cost lock ════ */

describe("UT-MAIN-020 the cost-module lock lists exactly the missing sections", () => {
  it("lists them in the canvas's order", () => {
    expect(
      costModuleLock({
        projectStartDate: null,
        totalCapacity: 0,
        netYieldP50: 326_400,
        clusterStateName: "Draft",
      }),
    ).toEqual(["Milestones", "Generator", "Change the project status from Draft"]);
  });

  it("returns an empty list for a complete, advanced project", () => {
    expect(
      costModuleLock({
        projectStartDate: "2025-04-01",
        totalCapacity: 136,
        netYieldP50: 326_400,
        clusterStateName: "Cluster 3",
      }),
    ).toEqual([]);
  });

  it("treats a zero capacity or yield as missing, not as present", () => {
    const out = costModuleLock({
      projectStartDate: "2025-04-01",
      totalCapacity: 0,
      netYieldP50: 0,
      clusterStateName: "Cluster 2",
    });
    expect(out).toEqual(["Generator", "Production"]);
  });
});

describe("UT-MAIN-021 Edit Costs is blocked while Draft", () => {
  it("gates on the Draft test alone", () => {
    expect(
      isCostModuleLocked({
        projectStartDate: "2025-04-01",
        totalCapacity: 136,
        netYieldP50: 1,
        clusterStateName: "Draft",
      }),
    ).toBe(true);
  });

  it("does NOT block a non-Draft project with a blank start date", () => {
    // The list and the gate are different things: costModuleLock would still say
    // "Milestones" here, but the canvas only blocks on Draft.
    const p = {
      projectStartDate: null,
      totalCapacity: 136,
      netYieldP50: 1,
      clusterStateName: "Cluster 2",
    };
    expect(costModuleLock(p)).toContain("Milestones");
    expect(isCostModuleLocked(p)).toBe(false);
  });
});

/* ══════════════════════════════════════════════════════ 022-023 — delete ════ */

describe("UT-MAIN-022 delete removes the row and keeps the total honest", () => {
  it("drops the row and decrements totalCount", () => {
    const page = { rows: [{ id: "a" }, { id: "b" }], totalCount: 1127 };
    const next = applyOptimisticDelete(page, "a", (r) => (r as { id: string }).id);
    expect(next.rows).toHaveLength(1);
    // Without the decrement the footer reads a stale "Total Rows" until the refetch lands.
    expect(next.totalCount).toBe(1126);
  });

  it("is a no-op for an id that is not on this page", () => {
    const page = { rows: [{ id: "a" }], totalCount: 5 };
    expect(applyOptimisticDelete(page, "zzz", (r) => (r as { id: string }).id)).toBe(page);
  });

  it("names the project in the success notification", () => {
    expect(deleteMessages("0 0 0 0").success).toBe(
      "The project '0 0 0 0' was successfully deleted!",
    );
  });
});

describe("UT-MAIN-023 the delete error names a Project, not a Permit", () => {
  it("corrects the canvas copy/paste", () => {
    expect(deleteMessages("x").error).toContain("Project could not be deleted");
    expect(deleteMessages("x").error).not.toContain("Permit");
  });

  it("keeps the canvas string reachable so the divergence stays reversible", () => {
    // SOURCE DEFECT parity, per the repo convention.
    expect(deleteMessagesCanvasParity("x").error).toContain("Permit could not be deleted");
  });
});

/* ══════════════════════════════════════════════════════ 024-025 ════ */

describe("UT-MAIN-024 sort click persists the column and direction", () => {
  it("defaults to project name ascending", () => {
    expect(DEFAULT_SORT).toEqual({ col: C.name, asc: true });
  });

  it("flips direction on the same column and resets to ascending on a new one", () => {
    const first = nextSortState(DEFAULT_SORT, C.name);
    expect(first).toEqual({ col: C.name, asc: false });
    const second = nextSortState(first, C.name);
    expect(second).toEqual({ col: C.name, asc: true });
    expect(nextSortState(second, C.totalCapacity)).toEqual({ col: C.totalCapacity, asc: true });
  });

  it("refuses a column that is not on the allow-list", () => {
    // Raw interpolation into `$orderby` is a 400 live and a silent no-op in mock.
    expect(resolveSortColumn("vsb_nonsense")).toBe(C.name);
    expect(resolveSortColumn("'; drop --")).toBe(C.name);
    expect(resolveSortColumn(C.shortName)).toBe(C.shortName);
  });

  it("does not offer lookup label columns for server-side sorting", () => {
    // Ordering by a FormattedValue needs $orderby on a navigation path; sorting those
    // within a 200-row page would order the page differently from the table.
    expect(resolveSortColumn(C.clusterState)).toBe(C.name);
    expect(resolveSortColumn(C.projectManager)).toBe(C.name);
  });
});

describe("UT-MAIN-025 an empty result set renders cleanly", () => {
  it("reports one page and a zero total", () => {
    const p = computePaging(0, 200, 1);
    expect(totalRowsLabel(p)).toBe("Total Rows: 0");
    expect(pagerLabel(p)).toBe("Page: 1 from 1");
    expect(pagerVisible(p)).toBe(false);
  });
});

/* ══════════════════════════════════════ 026-029 — country scope (no spec id) ════ */

describe("UT-MAIN-026..029 the server-side country scope", () => {
  it("UT-MAIN-026 is unscoped for an all-countries user", () => {
    expect(serverFilterFor(user({ isProjectDataAllCountries: true }))).toBeUndefined();
  });

  it("UT-MAIN-027 is unscoped for an application administrator", () => {
    expect(serverFilterFor(user({ isApplicationAdministrator: true }))).toBeUndefined();
  });

  it("UT-MAIN-028 ORs the user's editable countries", () => {
    const out = serverFilterFor(
      user({
        editableCountries: [
          { id: "c-de", name: "Germany" },
          { id: "c-pl", name: "Poland" },
        ] as CurrentUser["editableCountries"],
      }),
    );
    expect(out).toBe(`(${C.country} eq c-de) or (${C.country} eq c-pl)`);
  });

  it("UT-MAIN-029 is unscoped with no user and with no roles", () => {
    expect(serverFilterFor(null)).toBeUndefined();
    expect(serverFilterFor(user({ editableCountries: [] }))).toBeUndefined();
  });
});

/* ══════════════════════════════════════════════ 030-034 — structural guards ════ */

describe("UT-MAIN-030 the column map is structurally sound", () => {
  it("uses only Dataverse-shaped logical names", () => {
    for (const [key, col] of Object.entries(C)) {
      expect(col, key).toMatch(/^(vsb_|_vsb_|_owning|statecode$|modifiedon$)/);
    }
  });

  it("lists only real keys as unverified", () => {
    for (const key of PROJECT_MAIN_COL_UNVERIFIED) {
      expect(Object.keys(C)).toContain(key);
    }
  });

  it("keeps the projection a superset of the map", () => {
    // The guard against the exact class of bug that made `managerId` always undefined:
    // a column read by the mapper but absent from `$select`.
    const selected = new Set<string>(SELECT.projectMain);
    for (const col of Object.values(C)) expect(selected.has(col), col).toBe(true);
  });
});

describe("UT-MAIN-031 the built filter is safely parenthesised", () => {
  it("balances every parenthesis", () => {
    const out = buildProjectFilter(
      filter({
        keyword: "nor",
        countryId: "c-de",
        areaId: "ca-de-bb",
        technology: T.wind,
        capacity: "12.5",
        capacityOperator: "Greater than",
        clusterStateId: "cs-dev",
      }),
    )!;
    let depth = 0;
    for (const ch of out) {
      if (ch === "(") depth++;
      if (ch === ")") depth--;
      expect(depth).toBeGreaterThanOrEqual(0);
    }
    expect(depth).toBe(0);
  });

  it("never leaves an ` or ` at the top level", () => {
    // The mock folds boolean operators left to right, so an unparenthesised `or` between
    // `and` clauses would evaluate differently there than against live Dataverse.
    const out = buildProjectFilter(filter({ keyword: "nor", countryId: "c-de" }))!;
    let depth = 0;
    for (let i = 0; i < out.length; i++) {
      if (out[i] === "(") depth++;
      if (out[i] === ")") depth--;
      if (depth === 0 && out.startsWith(" or ", i)) {
        throw new Error(`top-level " or " at ${i} in ${out}`);
      }
    }
    expect(out).toContain(" and ");
  });
});

describe("UT-MAIN-032 technology accepts the int and the legacy label", () => {
  it("resolves both representations to the same value", () => {
    expect(technologyValue(T.wind)).toBe(T.wind);
    expect(technologyValue("Wind")).toBe(T.wind);
    expect(technologyValue("wind")).toBe(T.wind);
    expect(technologyValue(String(T.pv))).toBe(T.pv);
    expect(technologyValue("nonsense")).toBeNull();
    expect(technologyValue(null)).toBeNull();
  });

  it("prefers a row's FormattedValue for the label", () => {
    expect(technologyLabel(T.wind)).toBe("Wind");
    expect(technologyLabel(T.pv)).toBe("PV");
    expect(technologyLabel(999, "Floating PV")).toBe("Floating PV");
    expect(technologyLabel(null)).toBe("");
  });

  it("filters on the integer, which is what live Dataverse stores", () => {
    // `vsb_technology eq 'Wind'` would be a 400 against a picklist column.
    expect(buildProjectFilter(filter({ technology: T.wind }))).toBe(`(${C.technology} eq ${T.wind})`);
  });
});

describe("UT-MAIN-033 capacity formatting matches the screenshot", () => {
  it("keeps one mandatory decimal and a second only when non-zero", () => {
    expect(formatCapacity(136)).toBe("136.0");
    expect(formatCapacity(13.6)).toBe("13.6");
    expect(formatCapacity(47.13)).toBe("47.13");
    expect(formatCapacity(559.8)).toBe("559.8");
    expect(formatCapacity(0)).toBe("0.0");
    expect(formatCapacity(14.4)).toBe("14.4");
  });

  it("renders nothing for a missing capacity, rather than 0.0", () => {
    expect(formatCapacity(null)).toBe("");
    expect(formatCapacity(undefined)).toBe("");
  });
});

describe("UT-MAIN-034 the footer reproduces the screenshot exactly", () => {
  it("reads Total Rows: 1127 over 6 pages", () => {
    const p = computePaging(1127, 200, 1);
    expect(totalRowsLabel(p)).toBe("Total Rows: 1127");
    expect(pagerLabel(p)).toBe("Page: 1 from 6");
  });
});

/* ══════════════════════════════════════════════════════════════════ UT-MAIN-035 ════ */

/**
 * The URL codec. This is the screen's only *untrusted* input — a hand-edited or truncated
 * link — and both halves of what it produces reach the service: the sort column reaches
 * `$orderby` and every filter field reaches `$filter`. So the cases that matter are the
 * malformed ones, not the round trip.
 */
describe("UT-MAIN-035 filter/sort/page serialise to and from the URL", () => {
  const parse = (qs: string): ProjectListCriteria => parseCriteria(new URLSearchParams(qs));

  it("an empty query string yields the defaults", () => {
    expect(parse("")).toEqual(defaultProjectListCriteria);
  });

  it("a pristine criteria set serialises to an empty query string", () => {
    // Otherwise the landing URL carries eleven empty parameters, and "is anything filtered?"
    // stops being answerable by looking at the address bar.
    expect(serialiseCriteria(defaultProjectListCriteria).toString()).toBe("");
  });

  it("round-trips every field", () => {
    const criteria: ProjectListCriteria = {
      filter: {
        keyword: "Puglia",
        projectManagerId: "pm-1",
        countryId: "c-it",
        areaId: "a-pug",
        technology: T.pv,
        capacity: "136",
        capacityOperator: "Greater than",
        clusterStateId: "ps-3",
      },
      sort: { col: C.totalCapacity, asc: false },
      page: 4,
    };
    expect(parse(serialiseCriteria(criteria).toString())).toEqual(criteria);
  });

  it("rejects a sort column that is not on the allow-list", () => {
    // An arbitrary string here is a 400 against live Dataverse and a silent no-op in mock.
    expect(parse("sort=vsb_name;drop").sort.col).toBe(DEFAULT_SORT.col);
    expect(parse(`sort=${C.projectManager}`).sort.col).toBe(DEFAULT_SORT.col);
    expect(parse(`sort=${C.shortName}`).sort.col).toBe(C.shortName);
  });

  it("treats any sort direction other than desc as ascending", () => {
    expect(parse("dir=desc").sort.asc).toBe(false);
    expect(parse("dir=asc").sort.asc).toBe(true);
    expect(parse("dir=sideways").sort.asc).toBe(true);
  });

  it("falls back to page 1 for a missing, non-numeric or out-of-range page", () => {
    expect(parse("").page).toBe(1);
    expect(parse("p=abc").page).toBe(1);
    expect(parse("p=0").page).toBe(1);
    expect(parse("p=-3").page).toBe(1);
    expect(parse("p=6").page).toBe(6);
  });

  it("drops an unrecognised capacity operator but keeps the value", () => {
    const c = parse("cap=136&capop=Roughly");
    expect(c.filter.capacity).toBe("136");
    // Rule 7 then supplies the default rather than leaving a filter that does nothing.
    expect(c.filter.capacityOperator).toBe("Equals");
  });

  it("omits the capacity operator when there is no capacity to compare", () => {
    expect(serialiseCriteria({
      ...defaultProjectListCriteria,
      filter: { ...emptyProjectListFilter, capacity: "", capacityOperator: "Less than" },
    }).toString()).toBe("");
  });

  it("drops an area that arrives without a country", () => {
    // Unreachable through the UI — the Area box is disabled until a country is chosen — so a
    // link carrying one is malformed, and honouring it would filter on a mismatched pair.
    expect(parse("a=a-pug").filter.areaId).toBeNull();
    expect(parse("c=c-it&a=a-pug").filter.areaId).toBe("a-pug");
  });

  it("accepts technology as the option-set integer and rejects anything else", () => {
    expect(parse(`t=${T.wind}`).filter.technology).toBe(T.wind);
    expect(parse("t=Wind").filter.technology).toBe(T.wind);
    expect(parse("t=Storage").filter.technology).toBeNull();
    expect(parse("t=").filter.technology).toBeNull();
  });

  it("never throws, whatever the query string contains", () => {
    for (const qs of ["p=%2F%2F", "q=%27%20or%201%3D1", "t=NaN", "sort=&dir=&p=", "cap=abc"]) {
      expect(() => parse(qs)).not.toThrow();
    }
  });

  it("a parsed criteria set builds a filter with balanced parentheses", () => {
    // The guard that matters: parsed input must not be able to produce a malformed `$filter`.
    const f = buildProjectFilter(parse("q=Ita&c=c-it&cap=136&capop=Less%20than").filter);
    expect(f).toBeTruthy();
    const opens = (f!.match(/\(/g) ?? []).length;
    const closes = (f!.match(/\)/g) ?? []).length;
    expect(opens).toBe(closes);
  });
});

/* ══════════════════════════════════════════════════════════════════ UT-MAIN-036 ════ */

/**
 * The logical names, pinned against the solution export.
 *
 * Six of these were wrong until they were checked against `<entity Name="vsb_Project">` in
 * `customizations.xml` (112 attributes). Each wrong name is a hard 400 on `$select` or a
 * filter that silently matches nothing, and neither shows up in mock mode — which is exactly
 * why they survived. This test is the guard.
 *
 * If a name here has to change, change it because the solution export says so.
 */
describe("UT-MAIN-036 column logical names match the solution export", () => {
  it("uses the verified name for every column the grid reads", () => {
    expect(C.name).toBe("vsb_projectname");
    expect(C.internalProjectId).toBe("vsb_internalprojectid");
    expect(C.shortName).toBe("vsb_shortname");
    expect(C.technology).toBe("vsb_technology");
    expect(C.totalCapacity).toBe("vsb_totalcapacity");
    expect(C.weightedMw).toBe("vsb_weightedmw");
    expect(C.approvalState).toBe("vsb_approvalstates");
    expect(C.spoSharepointUrl).toBe("vsb_sposharepointurl");
    expect(C.spoTeamsUrl).toBe("vsb_spoteamsurl");
    expect(C.area).toBe("_vsb_countryarea_value");
    expect(C.country).toBe("_vsb_country_value");
    expect(C.clusterState).toBe("_vsb_clusterstate_value");
    expect(C.projectManager).toBe("_vsb_projectmanager_value");
  });

  it("uses the un-numbered milestone names, not the display-name forms", () => {
    // The display names read "1-Feasibility studies" … "5-Construction"; the LOGICAL names
    // carry no number. An earlier cut transcribed the display names.
    expect(C.m1FeasibilityStudies).toBe("vsb_feasibilitystudies");
    expect(C.m2ProjectDevelopmentStarted).toBe("vsb_projectdevelopmentstarted");
    expect(C.m3ApplicationSubmitted).toBe("vsb_applicationsubmitted");
    expect(C.m4LegallyBindingPermits).toBe("vsb_legallybindingpermits");
    expect(C.m5Construction).toBe("vsb_construction");
  });

  it("never calls the project name vsb_name", () => {
    // `vsb_name` IS titled "Project ID" in the metadata but is the auto-numbered primary
    // column; the canvas only reads it as a fallback seed for 'Internal Project ID'. Binding
    // the grid's Project Name column to it showed the wrong value in every row.
    expect(Object.values(C)).not.toContain("vsb_name");
    expect(Object.values(C)).not.toContain("vsb_projectnumber");
  });

  it("has nothing left marked unverified", () => {
    expect(PROJECT_MAIN_COL_UNVERIFIED).toEqual([]);
  });
});
