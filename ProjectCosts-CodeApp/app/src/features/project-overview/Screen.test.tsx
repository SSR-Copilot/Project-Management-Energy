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
import { render, screen, waitFor, within } from "@testing-library/react";
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

/**
 * A project that MAY be deleted.
 *
 * `projectRow()` is Approved (`952850002`), and the canvas `deleteProject.ItemEnabled`
 * requires `'Approval States' <> 'Approval States'.Approved` — so the default fixture is
 * deliberately undeletable and every delete test has to opt out of it. UT-OV-049 pins the
 * block itself at the rule level.
 */
const deletableRow = () => projectRow({ vsb_approvalstates: 952850000 });

/**
 * The environment variables `SessionProvider` resolves, as `schemaname → value`.
 *
 * Served through `defaultvalue` on the DEFINITION row, which is the path
 * `loadEnvironmentVariables` falls back to when a variable has no value row — the shape a
 * freshly imported solution actually has.
 */
let envVarValues: Record<string, string> = {};

/** Every project delete the screen issued, and whether the transport should accept it. */
const deletes: string[] = [];
let deleteSucceeds = true;

vi.mock("@microsoft/power-apps/data", () => ({
  getClient: () => ({
    retrieveMultipleRecordsAsync: vi.fn(
      async (table: string, options: Record<string, unknown>) => {
        calls.push({ table, options });
        if (table === "environmentvariabledefinitions") {
          return {
            success: true,
            // The id MUST be a real GUID: `loadEnvironmentVariables` feeds these ids straight
            // into `guid()` when it builds the follow-up query for the value rows, and that
            // helper throws on anything else. A short fake id made the whole query reject, so
            // every environment variable silently read as unset.
            data: Object.entries(envVarValues).map(([schemaname, defaultvalue], i) => ({
              environmentvariabledefinitionid: `0000000${i}-0000-0000-0000-00000000000${i}`,
              schemaname,
              defaultvalue,
            })),
          };
        }
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
    deleteRecordAsync: vi.fn(async (_table: string, id: string) => {
      deletes.push(id);
      // The SDK does NOT throw for a failed call — it returns `success: false`, which is
      // exactly the shape `deleteRecord` exists to stop the generated service discarding.
      return deleteSucceeds
        ? { success: true, data: undefined }
        : { success: false, data: undefined, error: new Error("forbidden") };
    }),
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

/**
 * Select a row and wait for the command bar to settle.
 *
 * Selecting a project starts a SECOND query — the cluster state's `Order`, which the Simulate
 * gate needs and the grid row does not carry. When it lands the gates recompute and the
 * command bar re-renders, so a click issued in that window can land on a button React is
 * about to replace. Waiting for the gates to settle is waiting for the state the test is
 * actually about.
 */
async function selectRow(
  user: ReturnType<typeof userEvent.setup>,
  id: string = PROJECT_ID,
): Promise<void> {
  await user.click(screen.getByTestId(`select-${id}`));
  await waitFor(() => expect(screen.getByTestId("command-editProject")).toBeEnabled());
}

/**
 * Click a command once it is actually clickable.
 *
 * Same race as `selectRow`, one level finer: each command has its own gate, so waiting for
 * `Edit Project` does not prove `Delete Project` has settled. Clicking a button React is
 * mid-way through replacing dispatches the event at a detached node and nothing happens —
 * which showed up as a dialog that intermittently never opened.
 */
async function clickCommand(
  user: ReturnType<typeof userEvent.setup>,
  key: string,
): Promise<void> {
  await waitFor(() => expect(screen.getByTestId(`command-${key}`)).toBeEnabled());
  await user.click(screen.getByTestId(`command-${key}`));
}

/**
 * Click a command and wait for the dialog it opens.
 *
 * A click on a Fluent `Toolbar` button is occasionally lost in jsdom: the toolbar runs Tabster's
 * mover with `memorizeCurrent`, so focusing a button during the gesture can re-render the bar
 * between `pointerdown` and `click`, and the `click` then lands on a node React has replaced.
 * It reproduces for roughly one in ten of these tests and never for the same one twice.
 *
 * So the click is repeated until the dialog appears. That is safe for exactly these commands
 * and is the reason this helper is limited to them: `deleteProject` and `editCosts` only open
 * a dialog, and nothing is written or navigated until the dialog is confirmed — a repeated
 * click cannot delete twice. Do NOT reuse this for a command that acts on the first click.
 */
async function openDialogVia(
  user: ReturnType<typeof userEvent.setup>,
  key: string,
  title: string,
): Promise<void> {
  await waitFor(() => expect(screen.getByTestId(`command-${key}`)).toBeEnabled());
  await waitFor(
    async () => {
      if (!screen.queryByText(title)) {
        await user.click(screen.getByTestId(`command-${key}`));
      }
      expect(screen.getByText(title)).toBeInTheDocument();
    },
    { timeout: 5000 },
  );
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
    envVarValues = {};
    deletes.length = 0;
    deleteSucceeds = true;
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

  it("UT-OVUI-009 enables the selection commands once a row is selected", async () => {
    projectRows = [deletableRow()];
    const user = userEvent.setup();
    render(<Harness><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    await selectRow(user);
    expect(screen.getByTestId("command-editCosts")).toBeEnabled();
    expect(screen.getByTestId("command-editProject")).toBeEnabled();
    expect(screen.getByTestId("command-deleteProject")).toBeEnabled();
    // `ItemEnabled: DataSourceInfo(Projects, CreatePermission)` — never gated on selection.
    expect(screen.getByTestId("command-addProject")).toBeEnabled();
    // Neither Dashboard nor Portfolio Overview declares ItemEnabled in the canvas source, so
    // both stay enabled with nothing selected. See rules.ts SKELETON FIX 3 and UT-OV-057.
    expect(screen.getByTestId("command-viewDashboardFunctionality")).toBeEnabled();
  });

  it("UT-OVUI-023 navigates INTERNALLY to CAPEX rather than launching a second app", async () => {
    // The canvas `Launch(gblCostAppLaunchUrl, {projectId: …})` opened a separate Power Apps
    // app. One app now, so Edit Costs is a route — which is also what gives the back button
    // its way home to the filtered list.
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const user = userEvent.setup();
    render(<Harness search="?q=endpoint"><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    await selectRow(user);
    await clickCommand(user, "editCosts");
    expect(screen.getByTestId("current-location"))
      .toHaveTextContent(`/costs/capex?projectId=${PROJECT_ID}`);
    expect(open).not.toHaveBeenCalled();
  });

  it("UT-OVUI-010 blocks Edit Costs for a Draft project with the lock dialog", async () => {
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
    await selectRow(user);
    // `txt_PopUp_Common_Generators_PreventTotalCapacity_Title_2` — verbatim.
    await openDialogVia(user, "editCosts", "Cost Module (Contr. Endpoint Testproject)");
    expect(screen.getByText(
      "Cost module is locked. To unlock it, please complete the following sections:",
    )).toBeInTheDocument();
    // Asserted on the text rather than the `listitem` role: the wording is the requirement,
    // and the role is computed from CSS the test environment does not fully apply.
    for (const section of [
      "Milestones", "Generator", "Production", "Change the project status from Draft",
    ]) {
      expect(await screen.findByText(section)).toBeInTheDocument();
    }
    // Blocked means blocked: the route must not have changed.
    expect(screen.getByTestId("current-location")).toHaveTextContent("/projects");
  });

  it("UT-OVUI-011 keeps Delete Project fourth in the bar, disabled without a selection", async () => {
    // It is destructive and it belongs to Project Management, but it stays FOURTH rather than
    // being shuffled to the end.
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

  it("UT-OVUI-013 leaves Dashboard enabled with nothing selected", async () => {
    // `{ItemKey: "viewDashboardFunctionality", ItemVisible: true}` and NO `ItemEnabled`, so
    // the canvas never gated it. The dashboard link is not project-scoped either — it is a
    // whole URL from `vsb_PowerBIDashboardLink`.
    //
    // CANVAS DIVERGENCE (recorded, not resolved): GUIDE p06 reads the recording as showing
    // Dashboard greyed with nothing selected, and the harness plan says it was "corrected" to
    // a selection gate. The YAML has no such gate and the screen plan's own non-negotiable is
    // to inspect the YAML, so the source wins here. UT-OV-057 pins the rule side.
    render(<Harness><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    expect(screen.getByTestId("command-viewDashboardFunctionality")).toBeEnabled();
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

  /* ───────────────────────────────── the commands wired to a destination */

  it("UT-OVUI-024 sends Add Project to General Data with no project selected", async () => {
    // `+ Add Project` blanks the globals and navigates — General Data IS the New Project
    // screen, and this is the app's only create path.
    const user = userEvent.setup();
    render(<Harness><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    await clickCommand(user, "addProject");
    expect(screen.getByTestId("current-location")).toHaveTextContent("/projects/new");
  });

  it("UT-OVUI-025 sends Edit Project to the selected project's General Data", async () => {
    // The canvas forked on `gblProduction` and RELAUNCHED the whole app in the player. One
    // app, one route.
    const user = userEvent.setup();
    render(<Harness><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    await selectRow(user);
    await clickCommand(user, "editProject");
    expect(screen.getByTestId("current-location"))
      .toHaveTextContent(`/projects/${PROJECT_ID}/general`);
  });

  /* ──────────────────────────────────────────────────────────── the delete */

  it("UT-OVUI-026 asks before deleting, in the canvas's own words", async () => {
    projectRows = [deletableRow()];
    const user = userEvent.setup();
    render(<Harness><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    await selectRow(user);
    await openDialogVia(user, "deleteProject", "Delete project?");
    expect(screen.getByText(
      'Are you sure you want to delete the project "Contr. Endpoint Testproject"?',
    )).toBeInTheDocument();
    // Opening the dialog deletes nothing.
    expect(deletes).toEqual([]);
  });

  it("UT-OVUI-027 cancelling deletes nothing", async () => {
    projectRows = [deletableRow()];
    const user = userEvent.setup();
    render(<Harness><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    await selectRow(user);
    await openDialogVia(user, "deleteProject", "Delete project?");
    await user.click(await screen.findByTestId("confirm-dialog-cancel"));
    expect(deletes).toEqual([]);
  });

  it("UT-OVUI-028 deletes the project and names it in the confirmation", async () => {
    projectRows = [deletableRow()];
    const user = userEvent.setup();
    render(<Harness><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    await selectRow(user);
    await openDialogVia(user, "deleteProject", "Delete project?");
    await user.click(await screen.findByTestId("confirm-dialog-confirm"));
    expect(deletes).toEqual([PROJECT_ID]);
    expect(await screen.findByTestId("notice")).toHaveTextContent(
      "The project 'Contr. Endpoint Testproject' was successfully deleted!",
    );
  });

  it("UT-OVUI-029 says so when the delete is refused, and keeps the row", async () => {
    // The SDK returns `success: false` rather than throwing, and the generated service
    // discards it — this is the path `deleteRecord` exists for. The corrected wording says
    // "Project", not the canvas's copy/pasted "Permit".
    projectRows = [deletableRow()];
    deleteSucceeds = false;
    const user = userEvent.setup();
    render(<Harness><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    await selectRow(user);
    await openDialogVia(user, "deleteProject", "Delete project?");
    await user.click(await screen.findByTestId("confirm-dialog-confirm"));
    const notice = await screen.findByTestId("notice");
    expect(notice).toHaveTextContent("Project could not be deleted");
    expect(notice).not.toHaveTextContent("Permit");
    // The optimistic removal is rolled back, so the row the server still has is still shown.
    expect(screen.getByText("Contr. Endpoint Testproject")).toBeInTheDocument();
  });

  /* ───────────────────────────────────────── the launches and their guards */

  it("UT-OVUI-030 launches the Power BI dashboard from its environment variable", async () => {
    envVarValues = {
      vsb_PowerBIDashboardLink: "https://app.powerbi.com/dashboards/d1",
      // Only so the test has a visible signal that the environment variables have landed:
      // Simulate's VISIBILITY is `User().Email in colAnalyticsAppUsers`, so the command
      // appears (disabled, with nothing selected) as soon as the env query resolves. The
      // project rows arrive on a separate query and cannot be waited on instead.
      vsb_AnalyticsAppUsers: "demo.user@vsb.energy",
    };
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const user = userEvent.setup();
    render(<Harness><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    await screen.findByTestId("command-simulateProject");
    await clickCommand(user, "viewDashboardFunctionality");
    expect(open).toHaveBeenCalledWith(
      "https://app.powerbi.com/dashboards/d1", "_blank", "noopener,noreferrer",
    );
  });

  it("UT-OVUI-031 says the dashboard is unconfigured rather than opening nothing", async () => {
    // An unset environment variable must surface, not produce `window.open(undefined)`.
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const user = userEvent.setup();
    render(<Harness><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    await clickCommand(user, "viewDashboardFunctionality");
    expect(open).not.toHaveBeenCalled();
    expect(await screen.findByTestId("notice"))
      .toHaveTextContent("This report is not configured for this environment.");
  });

  it("UT-OVUI-032 hides both Power BI reports from a user off the allow-list", async () => {
    // `ItemVisible: CountIf(Filter(colReportViewers, Mail = gblCurrentUser.Mail), true) > 0`.
    // demo.user@vsb.energy is not one of the ten hardcoded addresses, so neither command
    // renders at all — with or without a selection.
    envVarValues = { vsb_ProjectOverviewPowerBIReportID: "r1", vsb_PowerBITenantID: "t1" };
    const user = userEvent.setup();
    render(<Harness><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    expect(screen.queryByTestId("command-viewProjectOverviewPowerBI")).toBeNull();
    expect(screen.queryByTestId("command-viewPortfolioOverviewPowerBI")).toBeNull();
    await selectRow(user);
    expect(screen.queryByTestId("command-viewProjectOverviewPowerBI")).toBeNull();
  });

  it("UT-OVUI-033 keeps SharePoint and Teams out of a non-Croatian project", async () => {
    // `ItemVisible: varProjectRecord.Country.Name = "Croatia"` — a hardcoded country string.
    const user = userEvent.setup();
    render(<Harness><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    await selectRow(user);
    expect(screen.queryByTestId("command-viewSharepoint")).toBeNull();
    expect(screen.queryByTestId("command-viewTeams")).toBeNull();
  });

  it("UT-OVUI-034 launches the stored SharePoint and Teams urls for Croatia", async () => {
    projectRows = [projectRow({
      [`_vsb_country_value${FV}`]: "Croatia",
      vsb_sposharepointurl: "https://vsb.sharepoint.com/sites/p1",
      vsb_spoteamsurl: "https://teams.microsoft.com/l/team/p1",
    })];
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const user = userEvent.setup();
    render(<Harness><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    await selectRow(user);
    await clickCommand(user, "viewSharepoint");
    expect(open).toHaveBeenCalledWith(
      "https://vsb.sharepoint.com/sites/p1", "_blank", "noopener,noreferrer",
    );
    await clickCommand(user, "viewTeams");
    expect(open).toHaveBeenLastCalledWith(
      "https://teams.microsoft.com/l/team/p1", "_blank", "noopener,noreferrer",
    );
  });

  it("UT-OVUI-035 needs BOTH urls before either command is usable", async () => {
    // The canvas `ItemEnabled` requires both, on both commands — so a project with a
    // SharePoint site but no Teams channel offers neither.
    projectRows = [projectRow({
      [`_vsb_country_value${FV}`]: "Croatia",
      vsb_sposharepointurl: "https://vsb.sharepoint.com/sites/p1",
      vsb_spoteamsurl: null,
    })];
    const user = userEvent.setup();
    render(<Harness><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    await selectRow(user);
    expect(screen.getByTestId("command-viewSharepoint")).toBeDisabled();
    expect(screen.getByTestId("command-viewTeams")).toBeDisabled();
  });

  /* ───────────────────────────────────────────────────────────── the pager */

  it("UT-OVUI-036 hides the pager entirely for a single page of results", async () => {
    // `con_..._Pagination_Buttons.Visible = If(TotalPages > 1, …)`. Total Rows stays.
    render(<Harness><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    expect(screen.getByTestId("total-rows")).toHaveTextContent("Total Rows: 1");
    expect(screen.queryByTestId("page-label")).toBeNull();
    expect(screen.queryByRole("button", { name: "Next page" })).toBeNull();
    expect(screen.queryByRole("button", { name: "First page" })).toBeNull();
  });

  it("UT-OVUI-037 shows the pager once a second page exists", async () => {
    projectTotal = 1129;
    projectNextToken = "tok";
    render(<Harness><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    expect(screen.getByTestId("page-label")).toHaveTextContent("Page: 1 from 6");
    expect(screen.getByRole("button", { name: "Next page" })).toBeEnabled();
  });
});
