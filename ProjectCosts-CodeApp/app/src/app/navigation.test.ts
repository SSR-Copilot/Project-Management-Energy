import { describe, expect, it } from "vitest";
import {
  NAV_ITEMS, NEW_PROJECT_PATH, activeNavKey, analyticsAppUrl, parentOf,
  powerBiReportUrl, projectGeneralDataPath, projectManagementAppUrl,
} from "./navigation";

describe("NAV_ITEMS", () => {
  it("UT-NAV-001 transcribes all seven canvas rail entries, plus Projects", () => {
    // The eighth is NOT from the canvas: the Cost app had no way back to the project list
    // because it was only ever reached by deep link. The overview is the landing screen now.
    expect(NAV_ITEMS).toHaveLength(8);
    expect(NAV_ITEMS.filter((i) => i.key !== "ProjectsKey")).toHaveLength(7);
  });

  it("UT-NAV-001b puts Projects first and points it at the overview", () => {
    expect(NAV_ITEMS[0]?.key).toBe("ProjectsKey");
    expect(NAV_ITEMS[0]?.path).toBe("/projects");
    expect(NAV_ITEMS[0]?.visible).toBe(false);
    expect(NAV_ITEMS.filter((item) => item.visible)[0]?.key).toBe("DevexCapexCostsKey");
  });

  it("UT-NAV-002 keeps OPEX as a group with no destination", () => {
    // The canvas entry's TargetScreen is commented out, so it expands rather than navigates.
    const opex = NAV_ITEMS.find((i) => i.key === "OpexCostsKey");
    expect(opex?.path).toBeUndefined();
    expect(opex?.visible).toBe(true);
  });

  it("UT-NAV-003 keeps Total Summary hidden and disabled, as the canvas shipped it", () => {
    const summary = NAV_ITEMS.find((i) => i.key === "TotalCostsSummary");
    expect(summary?.visible).toBe(false);
    expect(summary?.enabled).toBe(false);
  });

  it("UT-NAV-004 drops the leading space the canvas label carried", () => {
    // App.Formulas has ItemDisplayName: " DEVEX/CAPEX"; the screenshots render it flush.
    const capex = NAV_ITEMS.find((i) => i.key === "DevexCapexCostsKey");
    expect(capex?.label).toBe("DEVEX/CAPEX");
  });

  it("UT-NAV-005 nests the three OPEX children under it", () => {
    const children = NAV_ITEMS.filter((i) => i.parentKey === "OpexCostsKey").map((i) => i.label);
    expect(children).toEqual(["Operation & Maintenance", "Land Lease", "Other OPEX Costs"]);
  });

  it("UT-NAV-006 points the two OPEX cost items at distinct routes", () => {
    // Both went to the same canvas screen, which switched on the selected key.
    const om = NAV_ITEMS.find((i) => i.key === "O&MKey")?.path;
    const other = NAV_ITEMS.find((i) => i.key === "OtherOpexCostsKey")?.path;
    expect(om).toBe("/costs/opex/om");
    expect(other).toBe("/costs/opex/other");
    expect(om).not.toBe(other);
  });

  it("UT-NAV-007 gives every visible destination a unique key and path", () => {
    const keys = NAV_ITEMS.map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
    const paths = NAV_ITEMS.map((i) => i.path).filter(Boolean);
    expect(new Set(paths).size).toBe(paths.length);
  });
});

describe("activeNavKey", () => {
  it("UT-NAV-008 matches a rail item exactly", () => {
    expect(activeNavKey("/costs/contracts")).toBe("ContractsKey");
    expect(activeNavKey("/costs/capex")).toBe("DevexCapexCostsKey");
  });

  it("UT-NAV-009 attributes the Add-Costs modal route to DEVEX/CAPEX", () => {
    // It is reached from the Capex screen and returns to it, so the rail must not change.
    expect(activeNavKey("/costs/add-from-table")).toBe("DevexCapexCostsKey");
  });

  it("UT-NAV-010 returns undefined for an unknown path", () => {
    expect(activeNavKey("/nowhere")).toBeUndefined();
  });

  it("UT-NAV-010b highlights Projects on the landing route", () => {
    // `/` renders the overview when there is no projectId, so the rail must agree.
    expect(activeNavKey("/")).toBe("ProjectsKey");
    expect(activeNavKey("/projects")).toBe("ProjectsKey");
  });

  it("UT-NAV-011 does not confuse the two OPEX routes", () => {
    expect(activeNavKey("/costs/opex/om")).toBe("O&MKey");
    expect(activeNavKey("/costs/opex/other")).toBe("OtherOpexCostsKey");
  });
});

describe("parentOf", () => {
  it("UT-NAV-012 finds the group a child belongs to", () => {
    expect(parentOf("LandLeaseKey")).toBe("OpexCostsKey");
    expect(parentOf("ContractsKey")).toBeUndefined();
    expect(parentOf(undefined)).toBeUndefined();
  });
});

describe("projectManagementAppUrl", () => {
  it("UT-NAV-013 builds the canvas play URL exactly as App.OnStart did", () => {
    expect(projectManagementAppUrl({
      environmentId: "env1", projectManagementAppId: "app1", tenantId: "ten1",
    })).toBe("https://apps.powerapps.com/play/e/env1/a/app1?tenantId=ten1");
  });

  it("UT-NAV-014 omits the tenant when it is unknown rather than sending 'undefined'", () => {
    expect(projectManagementAppUrl({
      environmentId: "env1", projectManagementAppId: "app1", tenantId: undefined,
    })).toBe("https://apps.powerapps.com/play/e/env1/a/app1");
  });

  it("UT-NAV-015 returns undefined when the PM app id is missing", () => {
    // vsb_ProjectManagementAppID is an environment variable; an unconfigured environment
    // must hide the link, not render a broken one.
    expect(projectManagementAppUrl({
      environmentId: "env1", projectManagementAppId: undefined, tenantId: "ten1",
    })).toBeUndefined();
    expect(projectManagementAppUrl({
      environmentId: undefined, projectManagementAppId: "app1", tenantId: "ten1",
    })).toBeUndefined();
  });
});

/* ───────────────────────────────── the Project Management route helpers */

describe("the Project Management routes", () => {
  it("UT-NAV-016 sends Add Project to a literal route, not a flagged one", () => {
    // General Data IS the New Project screen. Marking that in the path rather than in a store
    // flag is what makes a reloaded or shared "new project" link still work.
    expect(NEW_PROJECT_PATH).toBe("/projects/new");
  });

  it("UT-NAV-017 puts the project id in the path for Edit Project", () => {
    expect(projectGeneralDataPath("abc")).toBe("/projects/abc/general");
  });

  it("UT-NAV-018 keeps the create route distinguishable from a project's own", () => {
    // `/projects/new` must not be read as a project whose id is "new", which is what a single
    // `/projects/:projectId/general` route with an optional segment would have done.
    expect(projectGeneralDataPath("new")).not.toBe(NEW_PROJECT_PATH);
  });
});

/* ────────────────────────────────────────────── the Analytics app launch */

describe("analyticsAppUrl", () => {
  const base = {
    environmentId: "env1", analyticsAppId: "ana1", tenantId: "ten1", projectId: "p1",
  };

  it("UT-NAV-019 builds gblAnalyticsAppLaunchUrl plus the project", () => {
    expect(analyticsAppUrl(base))
      .toBe("https://apps.powerapps.com/play/e/env1/a/ana1?tenantId=ten1&projectId=p1");
  });

  it("UT-NAV-020 spells the parameter projectId, with the capital I", () => {
    // The canvas is inconsistent: the PM app's own launch uses lowercase `projectid`, the
    // Cost and Analytics launches use `projectId`. The receiving app reads what it was given,
    // so the difference cannot be normalised away.
    const url = new URL(analyticsAppUrl(base)!);
    expect(url.searchParams.get("projectId")).toBe("p1");
    expect(url.searchParams.get("projectid")).toBeNull();
  });

  it("UT-NAV-021 omits an unknown tenant rather than sending 'undefined'", () => {
    expect(analyticsAppUrl({ ...base, tenantId: undefined }))
      .toBe("https://apps.powerapps.com/play/e/env1/a/ana1?projectId=p1");
  });

  it("UT-NAV-022 returns undefined when the environment has no Analytics app", () => {
    // vsb_AnalyticsAppID unset must surface as "not configured", never as a broken link.
    expect(analyticsAppUrl({ ...base, analyticsAppId: undefined })).toBeUndefined();
    expect(analyticsAppUrl({ ...base, environmentId: undefined })).toBeUndefined();
    expect(analyticsAppUrl({ ...base, projectId: "" })).toBeUndefined();
  });
});

/* ──────────────────────────────────────────────── the Power BI report links */

describe("powerBiReportUrl", () => {
  it("UT-NAV-023 filters the project report to the selected project", () => {
    const url = new URL(powerBiReportUrl({
      reportId: "r1", tenantId: "t1", projectId: "p1",
    })!);
    expect(url.origin + url.pathname).toBe("https://app.powerbi.com/reportEmbed");
    expect(url.searchParams.get("reportId")).toBe("r1");
    expect(url.searchParams.get("autoAuth")).toBe("true");
    expect(url.searchParams.get("ctid")).toBe("t1");
    expect(url.searchParams.get("navContentPaneEnabled")).toBe("false");
    // Lowercase `id`, as the command's own handler writes it. The grid's `CellAction` handler
    // writes `Project/Id`, but that handler is dead code — no column declares a link cell.
    expect(url.searchParams.get("filter")).toBe("Project/id eq 'p1'");
  });

  it("UT-NAV-024 leaves the portfolio report unfiltered", () => {
    // Which is also why the portfolio command carries no selection gate.
    const url = new URL(powerBiReportUrl({ reportId: "r2", tenantId: "t1" })!);
    expect(url.searchParams.get("reportId")).toBe("r2");
    expect(url.searchParams.has("filter")).toBe(false);
  });

  it("UT-NAV-025 encodes the project id rather than concatenating it in", () => {
    // The filter value carries spaces and apostrophes. A hand-built query string would put
    // whatever this is straight into a URL the browser then opens.
    const url = powerBiReportUrl({ reportId: "r1", tenantId: "t1", projectId: "a&b=c" })!;
    expect(url).not.toContain("a&b=c");
    expect(new URL(url).searchParams.get("filter")).toBe("Project/id eq 'a&b=c'");
  });

  it("UT-NAV-026 returns undefined without a report id", () => {
    expect(powerBiReportUrl({ reportId: undefined, tenantId: "t1" })).toBeUndefined();
  });
});
