// @vitest-environment jsdom
/**
 * Render tests for the Main Project Overview.
 *
 * The SDK is mocked at `retrieveMultipleRecordsAsync`, which is the one call every read on
 * this screen goes through — including `countedPage`, whose whole reason for existing is that
 * the generated service cannot ask for `@odata.count`. So these tests exercise the real
 * filter builder, the real row mapper, the real pager arithmetic and the real command gates
 * against a stubbed transport, rather than mocking the repository layer and testing nothing.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FluentProvider } from "@fluentui/react-components";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";
import type { ReactNode } from "react";

const PROJECT_ID = "33b9cc79-5b4f-f111-bec6-000d3a3855c2";
const FV = "@OData.Community.Display.V1.FormattedValue";

/** Records every query the screen issues so the tests can assert on the `$filter`. */
const calls: { table: string; options: Record<string, unknown> }[] = [];

function projectRow(over: Record<string, unknown> = {}) {
  return {
    vsb_projectid: PROJECT_ID,
    vsb_projectname: "Contr. Endpoint Testproject",
    vsb_shortname: "CET",
    vsb_internalprojectid: "20100479",
    vsb_technology: 952850000,
    [`vsb_technology${FV}`]: "Wind",
    vsb_totalcapacity: 12.5,
    vsb_approvalstates: 952850002,
    [`vsb_approvalstates${FV}`]: "Approved",
    _vsb_clusterstate_value: "11111111-1111-1111-1111-111111111111",
    [`_vsb_clusterstate_value${FV}`]: "Cluster 4",
    [`_vsb_country_value${FV}`]: "Germany",
    [`_vsb_countryarea_value${FV}`]: "Hesse",
    [`_vsb_projectmanager_value${FV}`]: "Pilevski, Alexander",
    vsb_projectstartdate: "2026-01-01T00:00:00Z",
    vsb_netyieldp50: 42,
    ...over,
  };
}

let projectRows: Record<string, unknown>[] = [projectRow()];
let projectTotal = 1;
/** Set to a token to pretend a further page exists. */
let projectNextToken: string | undefined;

/**
 * The NAMELESS tail — projects with no value in the sorted column.
 *
 * `loadProjectPage` serves the list as two ordered segments, so the transport has to answer the
 * `<col> eq null` half separately; returning the same fixture for both would make the tail look
 * as big as the list and the pager arithmetic meaningless.
 */
let blankRows: Record<string, unknown>[] = [];
let blankTotal = 0;

vi.mock("@microsoft/power-apps/app", () => ({
  setConfig: vi.fn(),
  getContext: vi.fn().mockResolvedValue({
    app: {
      appId: "app", environmentId: "env-1", appSettings: {},
      queryParams: {}, dataverseOrgUrl: undefined, appUrl: undefined,
    },
    host: { sessionId: "s" },
    user: {
      fullName: "Demo User", objectId: "u1",
      tenantId: "tenant-1", userPrincipalName: "demo.user@vsb.energy",
    },
  }),
}));

vi.mock("@microsoft/power-apps/data", () => ({
  getClient: () => ({
    retrieveMultipleRecordsAsync: vi.fn(
      async (table: string, options: Record<string, unknown>) => {
        calls.push({ table, options });
        if (table === "vsb_projects") {
          if (String(options.filter ?? "").includes(" eq null")) {
            return { success: true, data: blankRows, count: blankTotal };
          }
          // A second page exists only when the fixture says so, so the Next button and the
          // skip-token walk are both exercised for real.
          return {
            success: true,
            data: projectRows,
            count: projectTotal,
            ...(projectNextToken ? { skipToken: projectNextToken } : {}),
          };
        }
        if (table === "vsb_countries") {
          return {
            success: true,
            data: [{ vsb_countryid: "c1", vsb_name: "Germany" }],
          };
        }
        if (table === "vsb_projectstates") {
          return {
            success: true,
            data: [{ vsb_projectstateid: "s1", vsb_name: "Cluster 4", vsb_order: 4 }],
          };
        }
        return { success: true, data: [] };
      },
    ),
    retrieveRecordAsync: vi.fn(async () => ({
      success: true,
      data: { vsb_projectstateid: "s1", vsb_order: 4, vsb_name: "Cluster 4" },
    })),
    createRecordAsync: vi.fn(),
    updateRecordAsync: vi.fn(),
    deleteRecordAsync: vi.fn(),
    executeAsync: vi.fn(),
  }),
}));

import { resetPageTokens } from "@/data/client";
import { vsbTheme } from "@/theme/fluent";
import { SessionProvider } from "@/app/SessionContext";
import ProjectOverviewScreen from "./Screen";

function Harness({ children, search = "" }: { children: ReactNode; search?: string }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return (
    <FluentProvider theme={vsbTheme}>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[`/projects${search}`]}>
          <SessionProvider>{children}<CurrentLocation /></SessionProvider>
        </MemoryRouter>
      </QueryClientProvider>
    </FluentProvider>
  );
}

function CurrentLocation() {
  const location = useLocation();
  return <output data-testid="current-location">{location.pathname}{location.search}</output>;
}

const isBlankSegment = (o: Record<string, unknown>) =>
  String(o.filter ?? "").includes(" eq null");

/** The last query for the NAMED segment — the one that serves all but the tail. */
const projectQuery = () => calls
  .filter((c) => c.table === "vsb_projects" && !isBlankSegment(c.options)).at(-1)?.options;

/** The last query for the nameless tail. */
const blankQuery = () => calls
  .filter((c) => c.table === "vsb_projects" && isBlankSegment(c.options)).at(-1)?.options;

/** Column headers contain regex metacharacters — "Capacity [MW(p)]" most of all. */
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

describe("ProjectOverviewScreen", () => {
  afterEach(() => vi.restoreAllMocks());
  beforeEach(() => {
    calls.length = 0;
    projectRows = [projectRow()];
    projectTotal = 1;
    projectNextToken = undefined;
    blankRows = [];
    blankTotal = 0;
    resetPageTokens();
  });

  it("UT-OVUI-001 renders the grid columns the screenshot shows", async () => {
    render(<Harness><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    // Scoped to the table on purpose: five of these names are ALSO filter labels
    // ("Status", "Country", "Technology", "Project Manager", "Project"), so an unscoped
    // query finds two elements and fails for the wrong reason.
    const grid = within(screen.getByRole("table", { name: "Projects" }));
    for (const h of [
      "Project Name", "Short Name", "Status", "Project Manager", "Country",
      "Area/State/Province/Voivodeship", "Technology", "Capacity [MW(p)]",
      "Project ID", "Approval",
    ]) {
      expect(grid.getByRole("columnheader", { name: new RegExp(escapeRe(h)) }))
        .toBeInTheDocument();
    }
  });

  it("UT-OVUI-002 renders a row's mapped values, not raw option-set integers", async () => {
    render(<Harness><ProjectOverviewScreen /></Harness>);
    const cell = await screen.findByText("Contr. Endpoint Testproject");
    const row = cell.closest("tr");
    expect(row).not.toBeNull();
    const cells = within(row as HTMLElement);
    expect(cells.getByText("CET")).toBeInTheDocument();
    expect(cells.getByText("Cluster 4")).toBeInTheDocument();
    expect(cells.getByText("Wind")).toBeInTheDocument();
    expect(cells.getByText("20100479")).toBeInTheDocument();
    // The approval state is a coloured glyph with no text, as in the reference — the label
    // is its accessible name so a screen reader still announces it.
    expect(cells.getByRole("img", { name: "Approved" })).toBeInTheDocument();
    expect(row?.textContent).not.toContain("9528");
  });

  it("UT-OVUI-003 asks the server for a page, a count and an $orderby", async () => {
    render(<Harness><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    const q = projectQuery();
    expect(q?.count).toBe(true);
    expect(q?.top).toBe(200);
    expect(q?.orderBy).toEqual(["vsb_projectname asc"]);
    // $select is mandatory — without it Dataverse returns all 112 project columns.
    expect(Array.isArray(q?.select)).toBe(true);
    expect((q?.select as string[]).length).toBeGreaterThan(15);
  });

  it("UT-OVUI-003b NEVER sends $skip, which Dataverse rejects outright", async () => {
    // 0x80060888 "Skip Clause is not supported in CRM". Paging is a skip-token walk.
    render(<Harness search="?p=3"><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    for (const c of calls) expect(c.options).not.toHaveProperty("skip");
  });

  it("UT-OVUI-003c walks forward with the server's skip token", async () => {
    projectNextToken = "TOKEN-PAGE-2";
    render(<Harness search="?p=2"><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    const projectCalls = calls.filter((c) => c.table === "vsb_projects");
    // Page 1 with no token, then page 2 carrying the token page 1 handed back.
    expect(projectCalls[0]?.options.skipToken).toBeUndefined();
    expect(projectCalls.some((c) => c.options.skipToken === "TOKEN-PAGE-2")).toBe(true);
  });

  it("UT-OVUI-004 sends no $filter at all when nothing is filtered beyond active", async () => {
    render(<Harness><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    // `statecode eq 0` is always composed in, and the segment split adds the sorted column's
    // null test. What must never appear is an empty `$filter=`.
    expect(projectQuery()?.filter).toBe("(statecode eq 0) and (vsb_projectname ne null)");
    expect(blankQuery()?.filter).toBe("(statecode eq 0) and (vsb_projectname eq null)");
  });

  it("UT-OVUI-005 renders the footer strings the screenshot shows", async () => {
    projectTotal = 1129;
    render(<Harness><ProjectOverviewScreen /></Harness>);
    // The footer renders during loading too, reading 0 — so wait for the data, not the
    // element, or the assertion races the query.
    await screen.findByText("Contr. Endpoint Testproject");
    expect(screen.getByTestId("total-rows")).toHaveTextContent("Total Rows: 1129");
    expect(screen.getByTestId("page-label")).toHaveTextContent("Page: 1 from 6");
  });

  it("UT-OVUI-006 reads the criteria out of the URL", async () => {
    projectNextToken = "TOKEN-PAGE-2";
    render(
      <Harness search="?q=endpoint&sort=vsb_shortname&dir=desc&p=2">
        <ProjectOverviewScreen />
      </Harness>,
    );
    await screen.findByText("Contr. Endpoint Testproject");
    const q = projectQuery();
    expect(q?.orderBy).toEqual(["vsb_shortname desc"]);
    expect(q?.skipToken).toBe("TOKEN-PAGE-2");
    expect(q).not.toHaveProperty("skip");
    expect(String(q?.filter)).toContain("contains(vsb_projectname,'endpoint')");
  });

  it("UT-OVUI-007 ignores a keyword shorter than three characters", async () => {
    render(<Harness search="?q=ab"><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    expect(String(projectQuery()?.filter)).not.toContain("contains(");
  });

  it("UT-OVUI-008 disables the selection commands until a row is picked", async () => {
    render(<Harness><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    expect(screen.getByTestId("command-editCosts")).toBeDisabled();
    expect(screen.getByTestId("command-editProject")).toBeDisabled();
  });

  it("UT-OVUI-009 enables Edit Costs once a row is selected", async () => {
    const user = userEvent.setup();
    render(<Harness><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    await user.click(screen.getByTestId(`select-${PROJECT_ID}`));
    expect(screen.getByTestId("command-editCosts")).toBeEnabled();
    expect(screen.getByTestId("command-addProject")).toBeDisabled();
    expect(screen.getByTestId("command-editProject")).toBeDisabled();
    expect(screen.getByTestId("command-viewDashboardFunctionality")).toBeDisabled();
  });

  it("opens the same app at CAPEX in a new tab while keeping the filtered overview", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const user = userEvent.setup();
    render(<Harness search="?q=endpoint"><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    await user.click(screen.getByTestId(`select-${PROJECT_ID}`));
    await user.click(screen.getByTestId("command-editCosts"));
    expect(open).toHaveBeenCalledOnce();
    const [href, target, features] = open.mock.calls[0]!;
    const url = new URL(String(href));
    expect(url.origin).toBe(window.location.origin);
    expect(url.pathname).toBe(window.location.pathname);
    expect(url.hash).toBe(`#/costs/capex?projectId=${PROJECT_ID}`);
    expect(url.searchParams.get("projectId")).toBe(PROJECT_ID);
    expect(target).toBe("_blank");
    expect(features).toBe("noopener,noreferrer");
    expect(screen.getByTestId("current-location")).toHaveTextContent("/projects?q=endpoint");
  });

  it("UT-OVUI-010 blocks Edit Costs for a Draft project with the prerequisites dialog", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    // The canvas gate is the Draft test alone:
    // If(ClusterState.Name = "Draft", <popup>, Launch(costApp)).
    projectRows = [projectRow({
      [`_vsb_clusterstate_value${FV}`]: "Draft",
      vsb_projectstartdate: null,
      vsb_totalcapacity: null,
      vsb_netyieldp50: null,
    })];
    const user = userEvent.setup();
    render(<Harness><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    await user.click(screen.getByTestId(`select-${PROJECT_ID}`));
    await user.click(screen.getByTestId("command-editCosts"));
    expect(await screen.findByText("Costs cannot be edited yet")).toBeInTheDocument();
    expect(screen.getByText(/Milestones, Generator, Production/)).toBeInTheDocument();
    expect(open).not.toHaveBeenCalled();
  });

  it("UT-OVUI-011 keeps Delete Project in its reference position, permanently disabled", async () => {
    // Decision D12: destructive, and it belongs to Project Management. It stays FOURTH in
    // the bar rather than being shuffled to the end.
    render(<Harness><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    expect(screen.getByTestId("command-deleteProject")).toBeDisabled();

    const labels = screen.getAllByRole("button")
      .map((b) => b.textContent?.trim())
      .filter((t): t is string => Boolean(t));
    const order = ["Add Project", "Edit Project", "Edit Costs", "Delete Project", "Dashboard"];
    const positions = order.map((l) => labels.indexOf(l));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions]).toEqual([...positions].sort((a, b) => a - b));
  });

  it("UT-OVUI-011b disables Next when the server hands back no token", async () => {
    // Forward-only paging: the token is the truth, not a count the platform caps at 5000.
    projectTotal = 1129;
    render(<Harness><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();
  });

  it("UT-OVUI-012 hides Simulate and the Power BI items for a user on neither list", async () => {
    render(<Harness><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    expect(screen.queryByTestId("command-simulateProject")).toBeNull();
    expect(screen.queryByTestId("command-viewProjectOverviewPowerBI")).toBeNull();
  });

  it("UT-OVUI-013 retains Dashboard's position but disables it for the Cost-only demo", async () => {
    render(<Harness><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    expect(screen.getByTestId("command-viewDashboardFunctionality")).toBeDisabled();
  });

  it("UT-OVUI-014 disables the Area filter until a Country is chosen", async () => {
    render(<Harness><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    expect(screen.getByTestId("filter-area")).toBeDisabled();
  });

  it("UT-OVUI-015 shows the empty state, with a clear-filters action, when nothing matches", async () => {
    projectRows = [];
    projectTotal = 0;
    render(<Harness search="?q=nothingmatches"><ProjectOverviewScreen /></Harness>);
    expect(await screen.findByText("No project matches these filters")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear all filters" })).toBeInTheDocument();
  });

  /*
   * A project with no value in the sorted column goes LAST, not first.
   *
   * Dataverse has no `NULLS LAST`, so `$orderby=vsb_projectname asc` put every nameless project
   * at the top and filled page 1 of the default view with blank rows. The canvas app never
   * showed that because it never sorts on the server: it collects the first
   * `DefaultConnectedDataSourceMaxGetRowsCount` rows in table order and sorts that collection,
   * so nameless rows outside the cap were simply invisible. The list is served as two ordered
   * segments instead, which puts them last without hiding any of them.
   */
  it("UT-OVUI-017 asks for the named projects and the nameless ones separately", async () => {
    render(<Harness><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    expect(projectQuery()?.orderBy).toEqual(["vsb_projectname asc"]);
    // Nothing to sort the tail by — the column is empty on every one of them — so it takes the
    // autonumber, which is never blank.
    expect(blankQuery()?.orderBy).toEqual(["vsb_name asc"]);
  });

  it("UT-OVUI-018 splits on the SORTED column, not always on the name", async () => {
    render(<Harness search="?sort=vsb_shortname&dir=desc"><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    expect(String(projectQuery()?.filter)).toContain("vsb_shortname ne null");
    expect(String(blankQuery()?.filter)).toContain("vsb_shortname eq null");
  });

  it("UT-OVUI-019 keeps page 1 on the named projects even when nameless ones exist", async () => {
    projectTotal = 250;
    blankRows = [projectRow({ vsb_projectname: null, vsb_shortname: null })];
    blankTotal = 60;
    render(<Harness><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    // 250 named over two pages, then 60 nameless on a third.
    expect(screen.getByTestId("total-rows")).toHaveTextContent("Total Rows: 310");
    expect(screen.getByTestId("page-label")).toHaveTextContent("Page: 1 from 3");
  });

  it("UT-OVUI-020 offers a next page from the last named one, because the tail follows it", async () => {
    // No skip token: there is no further NAMED page, but the nameless tail still comes after.
    blankRows = [projectRow({ vsb_projectname: null })];
    blankTotal = 5;
    render(<Harness><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    expect(screen.getByRole("button", { name: "Next page" })).toBeEnabled();
  });

  it("UT-OVUI-021 serves the tail once the named pages run out", async () => {
    blankRows = [projectRow({ vsb_projectname: "", vsb_shortname: "NONAME" })];
    blankTotal = 5;
    render(<Harness search="?p=2"><ProjectOverviewScreen /></Harness>);
    // Page 2 is past the single named page, so it is the tail.
    expect(await screen.findByText("NONAME")).toBeInTheDocument();
    expect(blankQuery()?.top).toBe(200);
  });

  it("UT-OVUI-022 falls back to the last named page when there is no tail at all", async () => {
    // Asking for page 9 of a 1-page list showed page 1 before the split, and still does.
    render(<Harness search="?p=9"><ProjectOverviewScreen /></Harness>);
    expect(await screen.findByText("Contr. Endpoint Testproject")).toBeInTheDocument();
  });

  it("UT-OVUI-016 renders without a Griffel or hook-order failure", async () => {
    const errors: unknown[] = [];
    const spy = vi.spyOn(console, "error").mockImplementation((...a) => { errors.push(a); });
    render(<Harness><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    spy.mockRestore();
    expect(errors).toEqual([]);
  });
});
