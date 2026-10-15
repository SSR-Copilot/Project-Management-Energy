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

/**
 * A STATEFUL skip-token server for the named segment: maps the token a request carries to
 * that page's rows and the token for the page after it. The flat `projectRows` fixture above
 * answers every call identically, which is fine for single-page assertions but cannot
 * reproduce a real Next → Previous → Next walk — the three calls would all look alike.
 */
let namedPager:
  | ((skipToken: unknown) => { rows: Record<string, unknown>[]; next?: string; total: number })
  | undefined;

/**
 * A Dataverse-faithful server for the whole `vsb_projects` table: `named` rows with a project
 * name, then `blank` rows without one. Unlike `namedPager` it honours what Dataverse honours —
 * the page size is `Prefer: odata.maxpagesize` (the SDK's `maxPageSize`), a skip token opens
 * the page after the one that issued it, and a last page carries no token — so the real page
 * arithmetic (200 a page) and the real boundary / tail pages can be walked through the UI.
 */
let faithful: { named: number; blank: number } | undefined;

/** While set, every `vsb_projects` read waits for it — holds a refetch mid-flight for a test. */
let holdProjects: Promise<void> | undefined;

function faithfulPage(options: Record<string, unknown>) {
  const isBlank = String(options.filter ?? "").includes(" eq null");
  const total = isBlank ? faithful!.blank : faithful!.named;
  const size = (options.maxPageSize as number | undefined) ?? 500;
  const offset = typeof options.skipToken === "string" ? Number(options.skipToken.split("@")[0]) : 0;
  const end = Math.min(total, offset + size);
  const data = Array.from({ length: end - offset }, (_, i) => {
    const n = offset + i + 1;
    const code = `${isBlank ? "B" : "N"}${String(n).padStart(4, "0")}`;
    return projectRow({
      vsb_projectid: `${isBlank ? "00000002" : "00000001"}-0000-0000-0000-${String(n).padStart(12, "0")}`,
      vsb_projectname: isBlank ? null : `Named ${code}`,
      vsb_shortname: null,
      vsb_internalprojectid: code,
    });
  });
  return {
    success: true,
    data,
    ...(end < total ? { skipToken: `${end}@${size}` } : {}),
    ...(options.count ? { count: total } : {}),
  };
}

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

/** `'Base cases'` rows for the selected project — `simulateProject`'s second OnSelect guard. */
let baseCaseRows: Record<string, unknown>[] = [{ vsb_basecaseid: "bc1" }];

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
          if (holdProjects) await holdProjects;
          if (faithful) return faithfulPage(options);
          if (String(options.filter ?? "").includes(" eq null")) {
            return { success: true, data: blankRows, count: blankTotal };
          }
          if (namedPager) {
            const p = namedPager(options.skipToken);
            return {
              success: true,
              data: p.rows,
              count: p.total,
              ...(p.next ? { skipToken: p.next } : {}),
            };
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
        if (table === "vsb_basecases") {
          return { success: true, data: baseCaseRows };
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

import { resetProjectPageCache } from "@/data/projects";
import { vsbTheme } from "@/theme/fluent";
import { SessionProvider } from "@/app/SessionContext";
import ProjectOverviewScreen from "./Screen";
import { DELETE_DIALOG } from "./rules";

/**
 * The query defaults the Harness builds its client with. `gcTime: 0` is the suite's usual choice
 * (nothing leaks between assertions), but it also means a page left behind is DISCARDED, so
 * every Previous/Next re-fetches. Production keeps pages for five minutes and serves them from
 * cache for `staleTime`, so the paging tests that are about that must opt into the real values.
 */
let queryDefaults: { gcTime?: number; staleTime?: number } = { gcTime: 0 };
/** The client the last Harness built, so a test can expire its cache the way 30 s of idling does. */
let activeClient: QueryClient | undefined;

function Harness({ children, search = "" }: { children: ReactNode; search?: string }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, ...queryDefaults } },
  });
  activeClient = client;
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
    baseCaseRows = [{ vsb_basecaseid: "bc1" }];
    namedPager = undefined;
    faithful = undefined;
    holdProjects = undefined;
    queryDefaults = { gcTime: 0 };
    resetProjectPageCache();
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
    // The page size is `maxPageSize`; a `$top` would be ignored by Dataverse (UT-PROJPAGE-012).
    expect(q?.maxPageSize).toBe(200);
    expect(q).not.toHaveProperty("top");
    // The sort column, then the unique autonumber so the order is total (stable across pages).
    expect(q?.orderBy).toEqual(["vsb_projectname asc", "vsb_name asc"]);
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
    // A real 1,129-row list has a page 1 with a further page behind it. The old fixture was a
    // single row with a 1129 count and no token, which only "worked" because the named segment's
    // end was never read off the walk; the end is the walk's truth now.
    projectNextToken = "tok";
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
    expect(q?.orderBy).toEqual(["vsb_shortname desc", "vsb_name asc"]);
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

  it("UT-OVUI-023 opens CAPEX in a new tab, leaving the filtered list in place", async () => {
    // The canvas `Launch(gblCostAppLaunchUrl, {projectId: …})` opened a separate app in a new
    // tab. It is this app's own `/costs/capex` route now, but still a new tab — so the
    // portfolio list behind it keeps its filter, its page and its selection.
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const user = userEvent.setup();
    render(<Harness search="?q=endpoint"><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    await selectRow(user);
    await clickCommand(user, "editCosts");

    expect(open).toHaveBeenCalledOnce();
    const [href, target, features] = open.mock.calls[0]!;
    const url = new URL(String(href));
    expect(url.hash).toBe(`#/costs/capex?projectId=${PROJECT_ID}`);
    // Also as a query parameter: the player strips the fragment before `getContext()` runs.
    expect(url.searchParams.get("projectId")).toBe(PROJECT_ID);
    expect(target).toBe("_blank");
    expect(features).toBe("noopener,noreferrer");
    // The list did not move.
    expect(screen.getByTestId("current-location")).toHaveTextContent("/projects?q=endpoint");
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
    // Forward-only paging: the token is the truth, not a count the platform caps at 5000. Page 3
    // of a three-page chain ends without a token, so Next is disabled there.
    threeNamedPages();
    render(<Harness search="?p=3"><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Page3 Project 1");
    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();
  });

  it("UT-OVUI-012 hides the Power BI items for a user off the allow-list, but always shows Simulate", async () => {
    // Simulate's `ItemVisible` is unconditionally `true` in the canvas — the analytics
    // allow-list formula beside it is commented out and never runs.
    render(<Harness><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    expect(screen.queryByTestId("command-viewProjectOverviewPowerBI")).toBeNull();
    expect(screen.getByTestId("command-simulateProject")).toBeInTheDocument();
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
    expect(projectQuery()?.orderBy).toEqual(["vsb_projectname asc", "vsb_name asc"]);
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
    projectNextToken = "tok"; // more named rows follow page 1
    blankRows = [projectRow({ vsb_projectname: null, vsb_shortname: null })];
    blankTotal = 60;
    render(<Harness><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    // SOURCE DEFECT fixed: this read "from 3" (250 named = 2 pages, + 60 nameless on a page of
    // their own). The segments are one continuous list now: ceil((250 + 60) / 200) = 2.
    expect(screen.getByTestId("total-rows")).toHaveTextContent("Total Rows: 310");
    expect(screen.getByTestId("page-label")).toHaveTextContent("Page: 1 from 2");
  });

  it("UT-OVUI-020 offers a next page when the tail overflows the boundary page", async () => {
    // One named row, no skip token: the nameless tail shares page 1 (1 + 199 rows) and, at 400
    // rows, overflows onto more pages. SOURCE DEFECT fixed: with only 5 tail rows this used to
    // offer a second page; they now fit on page 1 with the named row (UT-OVUI-021).
    blankRows = [projectRow({ vsb_projectname: null })];
    blankTotal = 400;
    render(<Harness><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    expect(screen.getByTestId("page-label")).toHaveTextContent("Page: 1 from 3");
    expect(screen.getByRole("button", { name: "Next page" })).toBeEnabled();
  });

  it("UT-OVUI-021 serves the tail on the same page as the last named rows", async () => {
    // SOURCE DEFECT fixed: 1 named row + 5 nameless used to be TWO pages (the tail started on
    // its own page 2, and ?p=2 showed it). Now it is 1 page of 6 rows, the tail topping the
    // named page up, and ?p=2 is past the end so it is clamped to that page.
    blankRows = Array.from({ length: 5 }, (_, i) =>
      projectRow({ vsb_projectname: "", vsb_shortname: `NONAME${i + 1}` }));
    blankTotal = 5;
    render(<Harness search="?p=2"><ProjectOverviewScreen /></Harness>);
    expect(await screen.findByText("NONAME5")).toBeInTheDocument();
    expect(screen.getByText("Contr. Endpoint Testproject")).toBeInTheDocument();
    expect(screen.getByTestId("total-rows")).toHaveTextContent("Total Rows: 6");
    expect(screen.queryByTestId("page-label")).toBeNull(); // one page: no pager
    // The top-up asks for exactly the 199 rows that fill the page, as maxPageSize (never $top).
    expect(blankQuery()?.maxPageSize).toBe(199);
    expect(blankQuery()).not.toHaveProperty("top");
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

  it("UT-OVUI-024 sends Add Project to General Data in the SAME tab", async () => {
    // `+ Add Project` blanks the globals and navigates — General Data IS the New Project
    // screen, and this is the app's only create path. Unlike Edit Project and Edit Costs it
    // stays in place: there is no list state worth preserving behind a form you are about to
    // fill in, and a new tab for an empty form is just a lost tab.
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const user = userEvent.setup();
    render(<Harness><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    await clickCommand(user, "addProject");
    expect(screen.getByTestId("current-location")).toHaveTextContent("/projects/new");
    expect(open).not.toHaveBeenCalled();
  });

  it("UT-OVUI-025 opens the project's General Data in a new tab", async () => {
    // The canvas forked on `gblProduction` and relaunched the whole app in the player, which
    // is a new tab too. The fork is gone; the new tab is not.
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const user = userEvent.setup();
    render(<Harness search="?q=endpoint"><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    await selectRow(user);
    await clickCommand(user, "editProject");

    expect(open).toHaveBeenCalledOnce();
    const url = new URL(String(open.mock.calls[0]![0]));
    expect(url.hash).toBe(`#/projects/${PROJECT_ID}/general`);
    // Unlike Edit Costs, no `projectId` launch parameter: the route carries it in the path.
    expect(url.searchParams.has("projectId")).toBe(false);
    expect(screen.getByTestId("current-location")).toHaveTextContent("/projects?q=endpoint");
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
    await user.click(await screen.findByLabelText(DELETE_DIALOG.cancelText));
    expect(deletes).toEqual([]);
  });

  it("UT-OVUI-028 deletes the project and names it in the confirmation", async () => {
    projectRows = [deletableRow()];
    const user = userEvent.setup();
    render(<Harness><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    await selectRow(user);
    await openDialogVia(user, "deleteProject", "Delete project?");
    await user.click(await screen.findByLabelText(DELETE_DIALOG.confirmText));
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
    await user.click(await screen.findByLabelText(DELETE_DIALOG.confirmText));
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
    };
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const user = userEvent.setup();
    render(<Harness><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
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

  /* ── Simulate: `simulateProject`'s OnSelect, not its ItemEnabled/ItemVisible ──────────── */

  it("UT-OVUI-033 launches Analytics for a Wind/PV project in Clusters 1-5 with a Base Case row", async () => {
    // Fixture default: Wind, Cluster 4 (order 4), and `baseCaseRows` has one row.
    envVarValues = { vsb_AnalyticsAppID: "ana-1" };
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const user = userEvent.setup();
    render(<Harness><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    await selectRow(user);
    await clickCommand(user, "simulateProject");
    await waitFor(() => expect(open).toHaveBeenCalled());
    const [url] = open.mock.calls[0]!;
    expect(String(url)).toContain(`projectId=${PROJECT_ID}`);
    expect(screen.queryByTestId("notice")).toBeNull();
  });

  it("UT-OVUI-034 warns instead of launching for a non-Wind/PV technology", async () => {
    projectRows = [projectRow({
      vsb_technology: 952850003, [`vsb_technology${FV}`]: "BESS",
    })];
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const user = userEvent.setup();
    render(<Harness><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    await selectRow(user);
    await clickCommand(user, "simulateProject");
    expect(await screen.findByTestId("notice")).toHaveTextContent(
      "Simulation is supported only for Wind/PV projects in Clusters 1 to 5.",
    );
    expect(open).not.toHaveBeenCalled();
  });

  it("UT-OVUI-035 warns instead of launching when the project has no Base Case row", async () => {
    baseCaseRows = [];
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const user = userEvent.setup();
    render(<Harness><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    await selectRow(user);
    await clickCommand(user, "simulateProject");
    expect(await screen.findByTestId("notice")).toHaveTextContent("Base data missing");
    expect(open).not.toHaveBeenCalled();
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

  it("UT-OVUI-040 walks Next → Previous → Next → Next with the right rows and an enabled Next each time", async () => {
    // Reported against the live app: Next to page 2, Previous back, then Next did nothing and
    // the grid showed the wrong rows. Three pages behind a real skip-token chain (count 450 at
    // 200 a page), so every step is distinguishable by its own row names.
    const makeRows = (page: number) => [1, 2].map((i) => projectRow({
      vsb_projectid: `0000000${page}-0000-0000-0000-00000000000${i}`,
      vsb_projectname: `Page${page} Project ${i}`,
    }));
    namedPager = (token) => {
      if (token === undefined) return { rows: makeRows(1), next: "T1", total: 450 };
      if (token === "T1") return { rows: makeRows(2), next: "T2", total: 450 };
      return { rows: makeRows(3), total: 450 };
    };

    const user = userEvent.setup();
    render(<Harness><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Page1 Project 1");
    expect(screen.getByTestId("page-label")).toHaveTextContent("Page: 1 from 3");

    const next = () => screen.getByRole("button", { name: "Next page" });
    const previous = () => screen.getByRole("button", { name: "Previous page" });

    await waitFor(() => expect(next()).toBeEnabled());
    await user.click(next());
    await screen.findByText("Page2 Project 1");
    expect(screen.getByTestId("page-label")).toHaveTextContent("Page: 2 from 3");
    expect(screen.queryByText("Page1 Project 1")).toBeNull();

    await waitFor(() => expect(previous()).toBeEnabled());
    await user.click(previous());
    await screen.findByText("Page1 Project 1");
    expect(screen.getByTestId("page-label")).toHaveTextContent("Page: 1 from 3");
    expect(screen.queryByText("Page2 Project 1")).toBeNull();

    // The step that was reported broken.
    await waitFor(() => expect(next()).toBeEnabled());
    await user.click(next());
    await screen.findByText("Page2 Project 1");
    expect(screen.getByTestId("page-label")).toHaveTextContent("Page: 2 from 3");
    expect(screen.queryByText("Page1 Project 1")).toBeNull();

    await waitFor(() => expect(next()).toBeEnabled());
    await user.click(next());
    await screen.findByText("Page3 Project 1");
    expect(screen.getByTestId("page-label")).toHaveTextContent("Page: 3 from 3");
    expect(next()).toBeDisabled();
  });

  /** Three named pages behind a real skip-token chain, one distinct pair of rows per page. */
  const threeNamedPages = (opts: { countOnFirstPageOnly?: boolean } = {}) => {
    const makeRows = (page: number) => [1, 2].map((i) => projectRow({
      vsb_projectid: `0000000${page}-0000-0000-0000-00000000000${i}`,
      vsb_projectname: `Page${page} Project ${i}`,
    }));
    namedPager = (token) => {
      if (token === undefined) return { rows: makeRows(1), next: "T1", total: 450 };
      const total = opts.countOnFirstPageOnly ? (undefined as unknown as number) : 450;
      if (token === "T1") return { rows: makeRows(2), next: "T2", total };
      return { rows: makeRows(3), total };
    };
  };

  /**
   * Next → Previous → Next → Next, optionally expiring the whole query cache before each click
   * (what 30 s of idling does to every page already visited).
   */
  const walkNextPreviousNext = async (expire: boolean) => {
    const user = userEvent.setup();
    render(<Harness><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Page1 Project 1");
    const next = () => screen.getByRole("button", { name: "Next page" });
    const previous = () => screen.getByRole("button", { name: "Previous page" });
    const label = (n: number) =>
      expect(screen.getByTestId("page-label")).toHaveTextContent(`Page: ${n} from 3`);
    const click = async (button: () => HTMLElement) => {
      await waitFor(() => expect(button()).toBeEnabled());
      if (expire) await activeClient?.invalidateQueries({ refetchType: "none" });
      await user.click(button());
    };

    await click(next);
    await screen.findByText("Page2 Project 1");
    label(2);
    await click(previous);
    await screen.findByText("Page1 Project 1");
    label(1);
    await click(next);
    await screen.findByText("Page2 Project 1");
    label(2);
    expect(screen.queryByText("Page1 Project 1")).toBeNull();
    await click(next);
    await screen.findByText("Page3 Project 1");
    label(3);
    expect(next()).toBeDisabled();
  };

  it("UT-OVUI-041 walks Next → Previous → Next with the production cache (pages kept, served while fresh)", async () => {
    threeNamedPages();
    queryDefaults = {};
    await walkNextPreviousNext(false);
  });

  it("UT-OVUI-042 walks Next → Previous → Next when every visited page has gone stale", async () => {
    threeNamedPages();
    queryDefaults = {};
    await walkNextPreviousNext(true);
  });

  it("UT-OVUI-043 walks Next → Previous → Next when the server sends @odata.count on page 1 only", async () => {
    threeNamedPages({ countOnFirstPageOnly: true });
    queryDefaults = {};
    await walkNextPreviousNext(false);
  });

  /** Next, Next, … to the last page, waiting for each page's own rows before the next click. */
  const walkToLastPage = async (pages: number) => {
    const user = userEvent.setup();
    render(<Harness><ProjectOverviewScreen /></Harness>);
    await screen.findByText("N0001", {}, { timeout: 15000 });
    expect(screen.getByTestId("page-label")).toHaveTextContent(`Page: 1 from ${pages}`);
    for (let p = 2; p <= pages; p += 1) {
      const next = () => screen.getByRole("button", { name: "Next page" });
      await waitFor(() => expect(next()).toBeEnabled(), { timeout: 15000 });
      await user.click(next());
      await waitFor(
        () => expect(screen.getByTestId("page-label")).toHaveTextContent(`Page: ${p} from ${pages}`),
        { timeout: 15000 },
      );
    }
  };

  it("UT-OVUI-044 Next to a BOUNDARY last page renders its named rows then the nameless ones", async () => {
    // 450 named + 29 nameless at 200 a page: page 3 = named 401..450 followed by nameless 1..29.
    faithful = { named: 450, blank: 29 };
    queryDefaults = {};
    await walkToLastPage(3);
    expect(await screen.findByText("N0450", {}, { timeout: 15000 })).toBeTruthy();
    expect(screen.getByText("B0029")).toBeTruthy();
    expect(screen.queryByText("No project matches these filters")).toBeNull();
    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();
    expect(screen.getAllByRole("radio")).toHaveLength(79);
  }, 120_000);

  it("UT-OVUI-045 Next to a PURE-TAIL last page renders the nameless rows", async () => {
    // 200 named + 250 nameless: page 2 = nameless 1..200, page 3 = nameless 201..250.
    faithful = { named: 200, blank: 250 };
    queryDefaults = {};
    await walkToLastPage(3);
    expect(await screen.findByText("B0250", {}, { timeout: 15000 })).toBeTruthy();
    expect(screen.queryByText("No project matches these filters")).toBeNull();
    expect(screen.getAllByRole("radio")).toHaveLength(50);
  }, 120_000);

  it("UT-OVUI-037 shows the pager once a second page exists", async () => {
    projectTotal = 1129;
    projectNextToken = "tok";
    render(<Harness><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    expect(screen.getByTestId("page-label")).toHaveTextContent("Page: 1 from 6");
    expect(screen.getByRole("button", { name: "Next page" })).toBeEnabled();
  });

  /** The data cells of the one rendered row, in column order (select, stripe, then the ten). */
  const rowCells = async () => {
    const name = await screen.findByText("Contr. Endpoint Testproject");
    return within(name.closest("tr") as HTMLElement).getAllByRole("cell");
  };

  it("UT-OVUI-046 renders empty values as empty cells, not a '-' placeholder", async () => {
    // The canvas details list shows an empty string where a value is blank.
    projectRows = [projectRow({
      vsb_shortname: null,
      vsb_internalprojectid: null,
      vsb_totalcapacity: null,
      [`_vsb_countryarea_value${FV}`]: null,
      [`_vsb_country_value${FV}`]: null,
      [`_vsb_projectmanager_value${FV}`]: null,
    })];
    render(<Harness><ProjectOverviewScreen /></Harness>);
    const cells = await rowCells();
    // 3 short name · 5 manager · 6 country · 7 area · 9 capacity · 10 project id.
    for (const i of [3, 5, 6, 7, 9, 10]) expect(cells[i]?.textContent).toBe("");
    expect(cells.map((c) => c.textContent).join("")).not.toContain("-");
  });

  it("UT-OVUI-047 right-aligns Project ID, and centres Approval, in header and cell", async () => {
    render(<Harness><ProjectOverviewScreen /></Harness>);
    const cells = await rowCells();
    expect(getComputedStyle(cells[10] as HTMLElement).textAlign).toBe("right");
    expect(getComputedStyle(cells[11] as HTMLElement).textAlign).toBe("center");
    const grid = within(screen.getByRole("table", { name: "Projects" }));
    const idHeader = grid.getByRole("columnheader", { name: /Project ID/ });
    const approvalHeader = grid.getByRole("columnheader", { name: /Approval/ });
    expect(getComputedStyle(idHeader).textAlign).toBe("right");
    expect(getComputedStyle(approvalHeader).textAlign).toBe("center");
  });

  it("UT-OVUI-048 does not sort on the Approval header (no ColSortable in the canvas)", async () => {
    const user = userEvent.setup();
    render(<Harness><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    const header = within(screen.getByRole("table", { name: "Projects" }))
      .getByRole("columnheader", { name: /Approval/ });
    expect(header).not.toHaveAttribute("aria-sort");
    const before = screen.getByTestId("current-location").textContent;
    await user.click(header);
    expect(header).not.toHaveAttribute("aria-sort");
    expect(screen.getByTestId("current-location").textContent).toBe(before);
    expect(screen.getByTestId("current-location").textContent).not.toContain("sort=");
  });

  it("UT-OVUI-049 draws a glyph for a known approval state and none for an unknown one", async () => {
    const { unmount } = render(<Harness><ProjectOverviewScreen /></Harness>);
    const known = (await rowCells())[11] as HTMLElement;
    const approved = within(known).getByRole("img", { name: "Approved" });
    expect(approved.querySelector("svg")).not.toBeNull();
    unmount();

    // `loc_iconstate` is `Blank()` for a state the Switch does not list.
    projectRows = [projectRow({
      vsb_approvalstates: null,
      [`vsb_approvalstates${FV}`]: undefined,
    })];
    render(<Harness><ProjectOverviewScreen /></Harness>);
    const unknown = (await rowCells())[11] as HTMLElement;
    const none = within(unknown).getByRole("img", { name: "No approval state" });
    expect(none.querySelector("svg")).toBeNull();
    expect(none.textContent).toBe("");
  });

  /* ─────────────────── page correction, keyboard sorting, refetch feedback, selection */

  it("UT-OVUI-050 shows page 1 when the URL page is past the end, and rewrites the URL", async () => {
    // The server resets an out-of-range page to 1 (canvas `adjustedPage`); the screen follows it
    // with a `replace`, so the dead page is not left behind in the history.
    faithful = { named: 450, blank: 29 }; // 479 rows = 3 pages of 200
    render(<Harness search="?p=99"><ProjectOverviewScreen /></Harness>);
    expect(await screen.findByText("N0001", {}, { timeout: 15000 })).toBeInTheDocument();
    expect(screen.getByTestId("page-label")).toHaveTextContent("Page: 1 from 3");
    await waitFor(() =>
      expect(screen.getByTestId("current-location").textContent).not.toContain("p=99"));
    expect(screen.getByTestId("current-location").textContent).not.toContain("p=");
    expect(screen.getByTestId("page-label")).toHaveTextContent("Page: 1 from 3");
  }, 60_000);

  it("UT-OVUI-051 sorts from the keyboard: Enter sorts, Enter again and Space flip the direction", async () => {
    const user = userEvent.setup();
    render(<Harness><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    const grid = within(screen.getByRole("table", { name: "Projects" }));
    const shortName = () => grid.getByRole("columnheader", { name: /Short Name/ });
    const location = () => screen.getByTestId("current-location").textContent ?? "";

    // The header exposes a focusable button, and reports "none" until it is the sort column.
    const button = within(shortName()).getByRole("button");
    expect(button).toHaveAttribute("tabindex", "0");
    expect(shortName()).toHaveAttribute("aria-sort", "none");

    button.focus();
    expect(button).toHaveFocus();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(location()).toContain("sort=vsb_shortname"));
    expect(location()).not.toContain("dir=desc");
    expect(shortName()).toHaveAttribute("aria-sort", "ascending");

    within(shortName()).getByRole("button").focus();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(location()).toContain("dir=desc"));
    expect(shortName()).toHaveAttribute("aria-sort", "descending");

    within(shortName()).getByRole("button").focus();
    await user.keyboard(" ");
    await waitFor(() => expect(location()).not.toContain("dir=desc"));
    expect(shortName()).toHaveAttribute("aria-sort", "ascending");
  });

  it("UT-OVUI-052 leaves the non-sortable headers out of the tab order, without aria-sort", async () => {
    render(<Harness><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    const grid = within(screen.getByRole("table", { name: "Projects" }));
    for (const name of [/^Status/, /Project Manager/, /^Country/, /Area\/State/, /Approval/]) {
      const header = grid.getByRole("columnheader", { name });
      expect(header).not.toHaveAttribute("aria-sort");
      expect(within(header).queryByRole("button")).toBeNull();
      expect(header.querySelector("[tabindex]")).toBeNull();
    }
  });

  it("UT-OVUI-053 covers the stale rows with a scrim, and disables row commands, while a page loads", async () => {
    threeNamedPages();
    const user = userEvent.setup();
    render(<Harness><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Page1 Project 1");
    await selectRow(user, "00000001-0000-0000-0000-000000000001");
    const next = () => screen.getByRole("button", { name: "Next page" });
    await waitFor(() => expect(next()).toBeEnabled());
    expect(screen.queryByTestId("grid-scrim")).toBeNull();

    // Forget the prefetched page 2, then hold the transport so its fetch stays in flight.
    let release!: () => void;
    holdProjects = new Promise<void>((resolve) => { release = resolve; });
    activeClient?.removeQueries({
      queryKey: ["projectPage"], predicate: (q) => q.getObserversCount() === 0,
    });
    await user.click(next());

    await waitFor(() => expect(screen.getByTestId("grid-scrim")).toBeInTheDocument());
    // The previous page is still what is on screen, but it is busy and nothing acts on it.
    expect(screen.getByText("Page1 Project 1")).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Projects" }).parentElement)
      .toHaveAttribute("aria-busy", "true");
    expect(screen.getByTestId("command-editProject")).toBeDisabled();
    expect(screen.getByTestId("command-editCosts")).toBeDisabled();

    release();
    await screen.findByText("Page2 Project 1");
    await waitFor(() => expect(screen.queryByTestId("grid-scrim")).toBeNull());
    expect(screen.getByRole("table", { name: "Projects" }).parentElement)
      .toHaveAttribute("aria-busy", "false");
  });

  it("UT-OVUI-054 loses the selection once its row has left the page, and does not restore it", async () => {
    threeNamedPages();
    const id1 = "00000001-0000-0000-0000-000000000001";
    const user = userEvent.setup();
    render(<Harness><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Page1 Project 1");
    await selectRow(user, id1);
    expect(screen.getByTestId(`select-${id1}`)).toBeChecked();

    const next = () => screen.getByRole("button", { name: "Next page" });
    const previous = () => screen.getByRole("button", { name: "Previous page" });
    await waitFor(() => expect(next()).toBeEnabled());
    await user.click(next());
    await screen.findByText("Page2 Project 1");
    await waitFor(() => expect(previous()).toBeEnabled());
    await user.click(previous());
    await screen.findByText("Page1 Project 1");

    expect(screen.getByTestId(`select-${id1}`)).not.toBeChecked();
    expect(screen.getByTestId("command-editProject")).toBeDisabled();
    expect(screen.getByTestId("command-editCosts")).toBeDisabled();
    expect(screen.getByTestId("command-deleteProject")).toBeDisabled();
  });
});
