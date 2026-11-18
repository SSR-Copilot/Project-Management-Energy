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
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FluentProvider } from "@fluentui/react-components";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { useState, type ReactNode } from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";

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
 * Held open to keep a project query in flight.
 *
 * The pager's three buttons also disable themselves while `pageQuery.isFetching`, and that state
 * is only observable if the transport can be made to wait.
 */
let projectGate: Promise<void> | null = null;
/**
 * Hand back a DIFFERENT token per page — `P2` from page 1, `P3` from page 2 and so on — so a
 * test can tell the request for page N (it carries `P<N>`) from every other one. The constant
 * `projectNextToken` cannot: every page after the first would carry the same token.
 */
let chainTokens = false;
/**
 * With `chainTokens`, how many named pages the server really has: the response for that page
 * hands back NO token, so the walk ends there. Unset, the chain never ends.
 *
 * Since D44 the pager believes the walk over `@odata.count` once the walk has ended, so a test
 * whose count promises several pages must hand back tokens for them — a count of 1129 with no
 * page-1 token now (correctly) means one named page.
 */
let tokenPages: number | undefined;
/** When set, `projectGate` holds only the named request carrying this skip token. */
let gateOnlyToken: string | undefined;
const chainedToken = (incoming: unknown) => {
  const served = typeof incoming === "string" ? Number(incoming.slice(1)) : 1;
  return tokenPages !== undefined && served >= tokenPages ? undefined : `P${served + 1}`;
};

/**
 * Counts renders of the grid row. `approvalDecoration` is called once per render of
 * `ProjectGridRow` and nowhere else on the screen while the fixture rows carry a formatted
 * approval label — so it is a render counter that needs no test hook in production code.
 */
const rowRenders = vi.hoisted(() => ({ count: 0 }));
vi.mock("@/domain/project", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/domain/project")>();
  return {
    ...actual,
    approvalDecoration: (...a: Parameters<typeof actual.approvalDecoration>) => {
      rowRenders.count += 1;
      return actual.approvalDecoration(...a);
    },
  };
});

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

/** `'Base cases'` rows for the selected project — `simulateProject`'s second OnSelect guard. */
let baseCaseRows: Record<string, unknown>[] = [{ vsb_basecaseid: "bc1" }];
/**
 * PO-001: the `systemusers` table. The chip's name lookup is a filter on the Entra id with an UNQUOTED guid
 * (the session's own current-user read quotes it); the typeahead filters on `contains(fullname ...`.
 */
let lookupUsers: Record<string, unknown>[] = [];
let searchUsers: Record<string, unknown>[] = [];
let lookupFails = false;
/** PO-031: tables whose reads are refused (a 403), and whether the typeahead's search is refused. */
const failTables = new Set<string>();
let searchFails = false;
const isManagerLookup = (c: { table: string; options: Record<string, unknown> }) =>
  c.table === "systemusers"
  && /azureactivedirectoryobjectid eq [0-9a-f]{8}-/.test(String(c.options.filter ?? ""));
/** PO-006: make the Base cases read fail, or hold it open. */
let baseCaseFails = false;
let baseCaseGate: Promise<void> | null = null;
/** PO-006: make the cluster-state read fail, hold it open, and count how often it ran. */
let stateReadFails = false;
let stateReadGate: Promise<void> | null = null;
let stateReads = 0;

vi.mock("@microsoft/power-apps/data", () => ({
  getClient: () => ({
    retrieveMultipleRecordsAsync: vi.fn(
      async (table: string, options: Record<string, unknown>) => {
        calls.push({ table, options });
        if (failTables.has(table)) {
          return { success: false, data: undefined, error: new Error("forbidden") };
        }
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
          if (projectGate && (gateOnlyToken === undefined || options.skipToken === gateOnlyToken)) {
            await projectGate;
          }
          // A second page exists only when the fixture says so, so the Next button and the
          // skip-token walk are both exercised for real.
          const token = chainTokens ? chainedToken(options.skipToken) : projectNextToken;
          return {
            success: true,
            data: projectRows,
            count: projectTotal,
            ...(token ? { skipToken: token } : {}),
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
        if (table === "systemusers") {
          const filter = String(options.filter ?? "");
          if (isManagerLookup({ table, options })) {
            if (lookupFails) return { success: false, data: undefined, error: new Error("forbidden") };
            return { success: true, data: lookupUsers };
          }
          if (filter.includes("contains(fullname")) {
            if (searchFails) return { success: false, data: undefined, error: new Error("forbidden") };
            return { success: true, data: searchUsers };
          }
        }
        if (table === "vsb_basecases") {
          if (baseCaseGate) await baseCaseGate;
          if (baseCaseFails) return { success: false, data: undefined, error: new Error("forbidden") };
          return { success: true, data: baseCaseRows };
        }
        return { success: true, data: [] };
      },
    ),
    retrieveRecordAsync: vi.fn(async () => {
      stateReads += 1;
      if (stateReadGate) await stateReadGate;
      if (stateReadFails) return { success: false, data: undefined, error: new Error("forbidden") };
      return {
        success: true,
        data: { vsb_projectstateid: "s1", vsb_order: 4, vsb_name: "Cluster 4" },
      };
    }),
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

import { testIdPart } from "@/components";
import { resetPageTokens } from "@/data/client";
import { vsbTheme } from "@/theme/fluent";
import { SessionProvider } from "@/app/SessionContext";
import { startupFlags } from "@/app/startupFlags";
import { prefetchTarget } from "@/app/bootPrefetch";
import ProjectOverviewScreen from "./Screen";
import { DELETE_DIALOG, OPEN_FAILED, parseCriteria } from "./rules";
import { projectPageKey } from "./queries";

/**
 * `gcTime: 0` by default, so no test sees another's cache. The prefetch tests pass the app's
 * real default instead: with `gcTime: 0` a prefetched page has no observer and is collected a
 * tick after it lands, which is not what a user's Next click meets.
 */
const APP_GC_TIME = 5 * 60 * 1000;

function Harness({ children, search = "", gcTime = 0, client: given }: {
  children: ReactNode; search?: string; gcTime?: number; client?: QueryClient;
}) {
  const [client] = useState(() => given ?? new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime } },
  }));
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

/** Every query for the NAMED segment, in the order issued. */
const namedCalls = () => calls
  .filter((c) => c.table === "vsb_projects" && !isBlankSegment(c.options));

/** How many named-segment requests carried this skip token — i.e. asked for that page. */
const requestsFor = (token: string) =>
  namedCalls().filter((c) => c.options.skipToken === token).length;

/** The last query for the nameless tail. */
const blankQuery = () => calls
  .filter((c) => c.table === "vsb_projects" && isBlankSegment(c.options)).at(-1)?.options;

/** Column headers contain regex metacharacters — "Capacity [MW(p)]" most of all. */
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

describe("ProjectOverviewScreen", () => {
  const delayAtStart = startupFlags.nextPagePrefetchDelayMs;
  afterEach(() => {
    vi.restoreAllMocks();
    startupFlags.nextPagePrefetchDelayMs = delayAtStart;
  });
  beforeEach(() => {
    // The prefetch tests below pin the page-on-screen-then-prefetch-at-once half (the old value of the
    // switch). UT-OVUI-060/061 pin the delayed half (D119).
    startupFlags.nextPagePrefetchDelayMs = 0;
    calls.length = 0;
    projectRows = [projectRow()];
    projectTotal = 1;
    projectNextToken = undefined;
    projectGate = null;
    chainTokens = false;
    tokenPages = undefined;
    gateOnlyToken = undefined;
    rowRenders.count = 0;
    blankRows = [];
    blankTotal = 0;
    envVarValues = {};
    deletes.length = 0;
    deleteSucceeds = true;
    baseCaseRows = [{ vsb_basecaseid: "bc1" }];
    lookupUsers = [];
    searchUsers = [];
    lookupFails = false;
    failTables.clear();
    searchFails = false;
    baseCaseFails = false;
    baseCaseGate = null;
    stateReadFails = false;
    stateReadGate = null;
    stateReads = 0;
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
    // The FIRST named request asks for the count; later ones for the same key (a walk step, a
    // next-page prefetch) carry none and read the total from the token cache.
    // Was `const q = projectQuery(); expect(q?.count).toBe(true);` — the LAST request.
    const q = namedCalls()[0]?.options;
    expect(q?.count).toBe(true);
    // The page size travels as `maxPageSize` (odata.maxpagesize), never `$top`, which caps the
    // whole result set and stops Dataverse paging (D42; was `expect(q?.top).toBe(200)`).
    expect(q?.maxPageSize).toBe(200);
    expect(q?.top).toBeUndefined();
    // The primary key breaks ties so page seams are exact (D44; was `["vsb_projectname asc"]`).
    expect(q?.orderBy).toEqual(["vsb_projectname asc", "vsb_projectid asc"]);
    // $select is mandatory — without it Dataverse returns all 112 project columns.
    expect(Array.isArray(q?.select)).toBe(true);
    expect((q!.select as string[]).length).toBeGreaterThan(15);
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
    // Six real pages behind the count: since D44 a count with no page-1 token means ONE page.
    chainTokens = true;
    tokenPages = 6;
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
    // Tie-breaker always ascending, whatever the sort (D44; was `["vsb_shortname desc"]`).
    expect(q?.orderBy).toEqual(["vsb_shortname desc", "vsb_projectid asc"]);
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
    // both stay enabled with nothing selected. See rules.ts SKELETON FIX 3 and UT-OV-100.
    expect(screen.getByTestId("command-viewDashboardFunctionality")).toBeEnabled();
  });

  it("UT-OVUI-048 the selected row's circle deselects it; a plain row click selects and never toggles (canvas DetailsList)", async () => {
    projectRows = [deletableRow()];
    const user = userEvent.setup();
    render(<Harness><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    await selectRow(user);
    const radio = screen.getByTestId(`select-${PROJECT_ID}`) as HTMLInputElement;
    expect(radio.checked).toBe(true);
    await user.click(radio);
    await waitFor(() => expect(screen.getByTestId("command-editProject")).toBeDisabled());
    expect(radio.checked).toBe(false);
    await user.click(screen.getByText("Contr. Endpoint Testproject"));
    await waitFor(() => expect(screen.getByTestId("command-editProject")).toBeEnabled());
    await user.click(screen.getByText("Contr. Endpoint Testproject"));
    expect(screen.getByTestId("command-editProject")).toBeEnabled();
    expect(radio.checked).toBe(true);
  });

  it("UT-OVUI-047 the Project search accepts spaces: 'Wind Park' can be typed and stays in the box", async () => {
    // Canvas `txt_Main_Project_Overview_Context_Filter_Project`: `ProjectKeyword: Self.Value`, never trimmed.
    // The box reads its value back from the URL, which used to be written trimmed, so each space vanished.
    projectRows = [deletableRow()];
    const user = userEvent.setup();
    render(<Harness><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    const box = screen.getByTestId("filter-keyword") as HTMLInputElement;
    await user.type(box, "Wind Park");
    expect(box.value).toBe("Wind Park");
    expect(screen.getByTestId("current-location")).toHaveTextContent("/projects?q=Wind+Park");
    await user.type(box, " ");
    expect(box.value).toBe("Wind Park ");
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
    // Forward-only paging: the token is the truth, not a count the platform caps at 5000.
    // On page 6 of six real pages the server hands back no token. (Was page 1 with a count and
    // no token at all; since D44 that is a one-page list and the pager is not even shown.)
    projectTotal = 1129;
    chainTokens = true;
    tokenPages = 6;
    render(<Harness search="?p=6"><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    await waitFor(() =>
      expect(screen.getByTestId("page-label")).toHaveTextContent("Page: 6 from 6"));
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
    // to inspect the YAML, so the source wins here. UT-OV-100 pins the rule side.
    render(<Harness><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    expect(screen.getByTestId("command-viewDashboardFunctionality")).toBeEnabled();
  });

  it("UT-OVUI-014 keeps the Area filter enabled with no Country, as the canvas does", async () => {
    // The canvas dropdown has no DisplayMode: with no country its filtered Items are just empty.
    render(<Harness><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    expect(screen.getByTestId("filter-area")).toBeEnabled();
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
    // Both segments end on the primary key, so page seams are exact (D44; were
    // `["vsb_projectname asc"]` and `["vsb_name asc"]`).
    expect(projectQuery()?.orderBy).toEqual(["vsb_projectname asc", "vsb_projectid asc"]);
    // Nothing to sort the tail by — the column is empty on every one of them — so it takes the
    // autonumber, which is never blank.
    expect(blankQuery()?.orderBy).toEqual(["vsb_name asc", "vsb_projectid asc"]);
  });

  it("UT-OVUI-018 splits on the SORTED column, not always on the name", async () => {
    render(<Harness search="?sort=vsb_shortname&dir=desc"><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    expect(String(projectQuery()?.filter)).toContain("vsb_shortname ne null");
    expect(String(blankQuery()?.filter)).toContain("vsb_shortname eq null");
  });

  it("UT-OVUI-019 keeps page 1 on the named projects even when nameless ones exist", async () => {
    projectTotal = 250;
    // The two named pages really exist: page 1 hands back a token, page 2 none.
    chainTokens = true;
    tokenPages = 2;
    blankRows = [projectRow({ vsb_projectname: null, vsb_shortname: null })];
    blankTotal = 60;
    render(<Harness><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    // 250 named + 60 nameless = 310 rows in ONE continuous sequence: RoundUp(310 / 200) = 2 pages,
    // as the canvas counts them. Was "Page: 1 from 3" (two named pages, the nameless on a third).
    expect(screen.getByTestId("total-rows")).toHaveTextContent("Total Rows: 310");
    expect(screen.getByTestId("page-label")).toHaveTextContent("Page: 1 from 2");
  });

  it("UT-OVUI-020 offers a next page from the last named one, because the tail follows it", async () => {
    // No skip token: there is no further NAMED page, but the nameless tail still comes after.
    // Was ONE nameless row (count 5). Since the tail tops up the last named page, one named row
    // plus a few nameless ones all fit on page 1, so nothing follows: 200 nameless rows overflow
    // the 199 slots left on page 1, and Next is lit by the tail.
    blankRows = Array.from({ length: 200 }, (_, i) => projectRow({
      vsb_projectid: `00000000-0000-0000-0000-${String(i).padStart(12, "0")}`, vsb_projectname: null,
    }));
    blankTotal = 200;
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
    // Page size as `maxPageSize`, never `$top` (D42; was `expect(blankQuery()?.top).toBe(200)`).
    expect(blankQuery()?.maxPageSize).toBe(200);
    expect(blankQuery()?.top).toBeUndefined();
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

  it("UT-OVUI-025 opens the project's General Data in a NEW tab of this app", async () => {
    // PO, 20 Oct 2026: a new tab of the same (local) app. The player strips the fragment, so
    // the screen and project ride along as launch parameters that `Landing` routes on.
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const user = userEvent.setup();
    render(<Harness search="?q=endpoint"><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    await selectRow(user);
    await clickCommand(user, "editProject");

    expect(open).toHaveBeenCalledOnce();
    const url = new URL(String(open.mock.calls[0]![0]));
    expect(url.searchParams.get("pmScreen")).toBe("/project/general");
    expect(url.searchParams.get("projectId")).toBe(PROJECT_ID);
    expect(url.hash).toBe(`#/project/general?projectId=${PROJECT_ID}`);
    // The list stays where it was behind the new tab.
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

  it("UT-OVUI-063 keeps SharePoint and Teams out of a non-Croatian project", async () => {
    // `ItemVisible: varProjectRecord.Country.Name = "Croatia"` — a hardcoded country string.
    const user = userEvent.setup();
    render(<Harness><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    await selectRow(user);
    expect(screen.queryByTestId("command-viewSharepoint")).toBeNull();
    expect(screen.queryByTestId("command-viewTeams")).toBeNull();
  });

  it("UT-OVUI-064 launches the stored SharePoint and Teams urls for Croatia", async () => {
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

  it("UT-OVUI-065 needs BOTH urls before either command is usable", async () => {
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

  it("UT-OVUI-038 once the walk has ended, the label's total is the page reached and Next is off",
    async () => {
      // What this USED to pin (D41): the recorded DIVERGENCE on
      // `ico_..._Pagination_PageRight.DisplayMode` — the canvas's LIVE formula is
      // `varRecPage.Page < varRecPage.TotalPages`, this app ports the commented-out
      // `HasNextPage` one — had the consequence that `totalPages` was count-derived while
      // `hasNext` was token-derived, so the label could read "from 6" with Next already dead.
      // Old body: count 1129, no token, `?p=1`, expecting "Page: 1 from 6" and Next disabled.
      //
      // Why it changed (D44): that state was the "page 6 of 7 with Next disabled" bug, and the
      // last page could never be reached. Once the walk ends at the data, the number of named
      // pages IS the page reached, whatever `@odata.count` said. Next still follows the token.
      projectTotal = 1400; // the count promises seven pages...
      chainTokens = true;
      tokenPages = 6; // ...the server has six: page 6 hands back no token.
      render(<Harness search="?p=6"><ProjectOverviewScreen /></Harness>);
      await screen.findByText("Contr. Endpoint Testproject");
      await waitFor(() =>
        expect(screen.getByTestId("page-label")).toHaveTextContent("Page: 6 from 6"));
      expect(screen.getByTestId("page-label")).not.toHaveTextContent("from 7");
      expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();
    });

  it("UT-OVUI-039 disables First and Previous on page 1", async () => {
    // `If(First(colFiltersOverview).Page>1,DisplayMode.Edit,DisplayMode.Disabled)` on both.
    projectTotal = 1129;
    projectNextToken = "tok";
    render(<Harness><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    expect(screen.getByRole("button", { name: "First page" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Previous page" })).toBeDisabled();
  });

  it("UT-OVUI-040 disables all three pager buttons while a page is in flight", async () => {
    // The next page is PREFETCHED now, so one Next click is served from the cache and never
    // puts the page in flight. The page that IS in flight is the one after it: its prefetch is
    // held open below, and the second Next click attaches to it.
    // Was: render `?p=2` with a constant token, set the gate, ONE Next click, expect disabled.
    projectTotal = 1129;
    chainTokens = true;
    const user = userEvent.setup();
    render(<Harness search="?p=2" gcTime={APP_GC_TIME}><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "First page" })).toBeEnabled());
    // Page 3's prefetch has gone out ungated, so it lands.
    await waitFor(() => expect(requestsFor("P3")).toBe(1));

    // Hold every further query open so `pageQuery.isFetching` is observable.
    let release: () => void = () => {};
    projectGate = new Promise<void>((resolve) => { release = resolve; });
    await user.click(screen.getByRole("button", { name: "Next page" }));
    await waitFor(() => {
      expect(screen.getByTestId("page-label")).toHaveTextContent("Page: 3 from 6");
      expect(screen.getByRole("button", { name: "Next page" })).toBeEnabled();
    });
    await user.click(screen.getByRole("button", { name: "Next page" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "First page" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Previous page" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();
    });
    projectGate = null;
    release();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Next page" })).toBeEnabled());
  });

  it("UT-OVUI-041 carries the canvas pager tooltips", async () => {
    // `Tooltip:` on the three `ico_..._Pagination_*` icons — verbatim, lines 2139/2173/2226.
    projectTotal = 1129;
    projectNextToken = "tok";
    render(<Harness><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    // Shown as a Fluent tooltip above the button, as the canvas draws it, not the browser's
    // `title` box. Only Next is enabled on page 1, and a disabled button gets no hover.
    const user = userEvent.setup();
    await user.hover(screen.getByRole("button", { name: "Next page" }));
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Navigate to next page");
    expect(screen.getByRole("button", { name: "First page" })).not.toHaveAttribute("title");
  });

  /* ──────────────────────────────────────────────── the next-page prefetch */

  it("UT-OVUI-042 requests page 2 in the background once page 1 has a next page", async () => {
    projectTotal = 1129;
    chainTokens = true;
    render(<Harness gcTime={APP_GC_TIME}><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    // No click: page 2's request (it carries page 1's token, `P2`) goes out on its own.
    await waitFor(() => expect(requestsFor("P2")).toBe(1));
    expect(screen.getByTestId("page-label")).toHaveTextContent("Page: 1 from 6");
    expect(screen.getByTestId("current-location")).toHaveTextContent(/^\/projects$/);
    // One page ahead, never further.
    expect(requestsFor("P3")).toBe(0);
  });

  it("UT-OVUI-043 serves Next from the prefetched page, with no new request", async () => {
    projectTotal = 1129;
    chainTokens = true;
    const user = userEvent.setup();
    render(<Harness gcTime={APP_GC_TIME}><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    // Issued before any click, ungated, so it lands.
    await waitFor(() => expect(requestsFor("P2")).toBe(1));

    // From here every project request hangs, so page 2 can only render from the cache.
    let release: () => void = () => {};
    projectGate = new Promise<void>((resolve) => { release = resolve; });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Next page" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Next page" }));
    await waitFor(() =>
      expect(screen.getByTestId("page-label")).toHaveTextContent("Page: 2 from 6"));
    expect(screen.getByRole("button", { name: "Previous page" })).toBeEnabled();
    expect(requestsFor("P2")).toBe(1);
    projectGate = null;
    release();
  });

  it("UT-OVUI-060 waits the configured delay before it prefetches page 2, then does", async () => {
    startupFlags.nextPagePrefetchDelayMs = 400;
    projectTotal = 1129;
    chainTokens = true;
    render(<Harness gcTime={APP_GC_TIME}><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    // The page is on screen and nothing has asked for page 2 yet.
    await act(async () => { await new Promise((r) => setTimeout(r, 100)); });
    expect(requestsFor("P2")).toBe(0);
    await waitFor(() => expect(requestsFor("P2")).toBe(1), { timeout: 2000 });
    expect(requestsFor("P3")).toBe(0);
  });

  it("UT-OVUI-061 a Next click before the delay loads page 2 itself and the timer asks for nothing more", async () => {
    startupFlags.nextPagePrefetchDelayMs = 400;
    projectTotal = 1129;
    chainTokens = true;
    const user = userEvent.setup();
    render(<Harness gcTime={APP_GC_TIME}><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Next page" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Next page" }));
    await waitFor(() =>
      expect(screen.getByTestId("page-label")).toHaveTextContent("Page: 2 from 6"));
    expect(requestsFor("P2")).toBe(1);
    // Let the old timer's moment pass: page 2 is not fetched twice, and page 3 is the new prefetch's.
    await act(async () => { await new Promise((r) => setTimeout(r, 600)); });
    expect(requestsFor("P2")).toBe(1);
  });

  it("UT-OVUI-062 a page the boot prefetch already loaded is shown with no second request", async () => {
    projectTotal = 1129;
    chainTokens = true;
    const warm = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: APP_GC_TIME } } });
    // The same call `main.tsx` makes before the first render, for the same URL.
    await prefetchTarget(warm, { kind: "projects", search: "" });
    const before = namedCalls().length;
    expect(before).toBe(1);
    render(<Harness client={warm}><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    expect(screen.getByTestId("page-label")).toHaveTextContent("Page: 1 from 6");
    // Page 1 came from the cache: the screen never asked for it again (page 2 may follow, from the next-page prefetch).

    expect(requestsFor("P1")).toBe(0);
    expect(namedCalls().filter((c) => c.options.skipToken === undefined)).toHaveLength(1);
  });

  it("UT-OVUI-044 does not prefetch when there is no next page", async () => {
    // The real last page of six, whose walk has ended: page 6 hands back no token and there is
    // no tail. (Was page 1 of a count with no token; since D44 that is a one-page list with no
    // pager, which would leave "Next disabled" unobservable.)
    projectTotal = 1129;
    chainTokens = true;
    tokenPages = 6;
    render(<Harness search="?p=6" gcTime={APP_GC_TIME}><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    await waitFor(() =>
      expect(screen.getByTestId("page-label")).toHaveTextContent("Page: 6 from 6"));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled());
    // Give a prefetch effect every chance to run before asserting it did not.
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    // The cold walk to page 6 is six requests, one per page (none, P2 … P6), each exactly once.
    // A page-7 prefetch would resume from page 6's token and ask for page 6 again.
    expect(namedCalls()).toHaveLength(6);
    expect(requestsFor("P6")).toBe(1);
    expect(requestsFor("P7")).toBe(0);
  });

  it("UT-OVUI-045 a Next click during the prefetch joins it instead of asking again", async () => {
    projectTotal = 1129;
    chainTokens = true;
    const user = userEvent.setup();
    // Hold page 2's prefetch open: only the request carrying page 1's token `P2` waits.
    let release: () => void = () => {};
    projectGate = new Promise<void>((resolve) => { release = resolve; });
    gateOnlyToken = "P2";
    render(<Harness gcTime={APP_GC_TIME}><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    await waitFor(() => expect(requestsFor("P2")).toBe(1));
    // The prefetch is a different query from the page on screen, so the pager is still live.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Next page" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Next page" }));
    // The page is in flight (the pager says so) but no second request went out for it.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled());
    expect(requestsFor("P2")).toBe(1);
    projectGate = null;
    release();
    await waitFor(() =>
      expect(screen.getByTestId("page-label")).toHaveTextContent("Page: 2 from 6"));
    expect(requestsFor("P2")).toBe(1);
  });

  /* ─────────────────────────────────────────────────── row re-rendering */

  it("UT-OVUI-046 selecting a row re-renders only the rows whose selection changed", async () => {
    const ids = [
      "aaaaaaaa-0000-0000-0000-000000000001",
      "aaaaaaaa-0000-0000-0000-000000000002",
      "aaaaaaaa-0000-0000-0000-000000000003",
    ];
    projectRows = ids.map((id, i) =>
      projectRow({ vsb_projectid: id, vsb_projectname: `Project ${i + 1}` }));
    projectTotal = 3;
    const user = userEvent.setup();
    render(<Harness><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Project 3");
    expect(rowRenders.count).toBeGreaterThanOrEqual(3);

    // Selecting re-renders the screen several times (the selection, then the cluster-state
    // read the Simulate gate needs), but only the newly selected row's props changed.
    rowRenders.count = 0;
    await selectRow(user, ids[1]);
    expect(rowRenders.count).toBe(1);

    // Moving the selection touches exactly two rows: the one left and the one picked.
    rowRenders.count = 0;
    await user.click(screen.getByTestId(`select-${ids[2]}`));
    await waitFor(() => expect(screen.getByTestId(`select-${ids[2]}`)).toBeChecked());
    await waitFor(() => expect(screen.getByTestId("command-editProject")).toBeEnabled());
    expect(rowRenders.count).toBe(2);
  });

  /* ═════════ Parity fixes, batch A1 (PO-003, PO-012a, PO-013, PO-014, PO-015, PO-029) ═════════ */

  /** The six headings the canvas grid lets the user sort by. */
  const SORTABLE_HEADINGS = [
    "Project Name", "Short Name", "Technology", "Capacity [MW(p)]", "Project ID", "Approval",
  ] as const;
  const gridTable = () => within(screen.getByRole("table", { name: "Projects" }));
  const headingButton = (caption: string) =>
    gridTable().getByTestId(`grid-header-${testIdPart(caption)}`);

  it("UT-OVFIX-001 exactly the six sortable headings are focusable buttons; the others are not", async () => {
    render(<Harness><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    const headers = gridTable().getAllByRole("columnheader");
    const withButton = headers.filter((h) => within(h).queryByRole("button") !== null);
    expect(withButton).toHaveLength(6);
    for (const caption of SORTABLE_HEADINGS) {
      expect(within(headingButton(caption).closest("th") as HTMLElement).getByRole("button"))
        .toBe(headingButton(caption));
    }
  });

  it("UT-OVFIX-002 Project Name is in the tab order and Enter flips the sort and announces it", async () => {
    const user = userEvent.setup();
    render(<Harness><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    const heading = headingButton("Project Name");
    const cell = heading.closest("th") as HTMLElement;
    expect(cell).toHaveAttribute("aria-sort", "ascending");
    // In the tab order (tabIndex 0, not -1); jsdom's Tabster does not walk the whole filter card reliably,
    // so focus it directly and press the key, which is what the keyboard user does once there.
    expect(heading.tabIndex).toBe(0);
    heading.focus();
    expect(document.activeElement).toBe(heading);
    await user.keyboard("{Enter}");
    await waitFor(() => expect(cell).toHaveAttribute("aria-sort", "descending"));
    await waitFor(() =>
      expect(projectQuery()?.orderBy).toEqual(["vsb_projectname desc", "vsb_projectid asc"]));
    expect(screen.getByTestId("current-location")).toHaveTextContent("/projects?dir=desc");
  });

  it("UT-OVFIX-003 Space on Short Name sorts by it, ascending first", async () => {
    const user = userEvent.setup();
    render(<Harness><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    const heading = headingButton("Short Name");
    heading.focus();
    await user.keyboard(" ");
    await waitFor(() =>
      expect(projectQuery()?.orderBy).toEqual(["vsb_shortname asc", "vsb_projectid asc"]));
    expect(heading.closest("th")).toHaveAttribute("aria-sort", "ascending");
    expect(screen.getByTestId("current-location")).toHaveTextContent("sort=vsb_shortname");
  });

  it("UT-OVFIX-004 a heading that cannot be sorted has no button and no aria-sort", async () => {
    render(<Harness><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    for (const caption of ["Status", "Project Manager", "Country", "Area/State/Province/Voivodeship"]) {
      const cell = gridTable().getByRole("columnheader", { name: caption });
      expect(within(cell).queryByRole("button")).toBeNull();
      expect(cell).not.toHaveAttribute("aria-sort");
    }
  });

  it("UT-OVFIX-005 each sortable heading's button carries its caption as aria-label and a unique test id", async () => {
    render(<Harness><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    const ids = SORTABLE_HEADINGS.map((caption) => {
      const button = headingButton(caption);
      expect(button).toHaveAttribute("aria-label", caption);
      return button.getAttribute("data-testid");
    });
    expect(new Set(ids).size).toBe(6);
    expect(ids).toEqual([
      "grid-header-project-name", "grid-header-short-name", "grid-header-technology",
      "grid-header-capacity-mw-p", "grid-header-project-id", "grid-header-approval",
    ]);
  });

  it("UT-OVFIX-006 a mouse click on a heading still sorts, once (the button's click bubbles to the cell)", async () => {
    const user = userEvent.setup();
    render(<Harness><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    await user.click(headingButton("Project Name"));
    // A double dispatch would flip it twice and leave it ascending.
    await waitFor(() =>
      expect(projectQuery()?.orderBy).toEqual(["vsb_projectname desc", "vsb_projectid asc"]));
    await user.click(screen.getByText("Short Name"));
    await waitFor(() =>
      expect(projectQuery()?.orderBy).toEqual(["vsb_shortname asc", "vsb_projectid asc"]));
  });

  /** The canvas control names of `Project Main Screen.pa.yaml`, as the canvas-identity gate reads them. */
  const CANVAS_NAMES = [
    "psf_MainScreen_DetailList_Container_FluentDetailsList",
    "con_Main_Project_Overview_Header_SuitBar_CommandBar",
    "cmp_MS_Spinner",
    "lbl_Main_Project_Overview_Context_Filter_ProjectKeyword",
    "lbl_Main_Project_Overview_Context_Filter_ProjectManager",
    "lbl_Main_Project_Overview_Context_Filter_Country",
    "lbl_Main_Project_Overview_Context_Filter_Area",
    "lbl_Main_Project_Overview_Context_Filter_Technology",
    "lbl_Main_Project_Overview_Context_Filter_Capacity",
    "lbl_Main_Project_Overview_Context_Filter_Status",
    "lbl_Main_Project_Overview_Context_Filter_Capacity_ErrorMessage",
    "ico_Main_Project_Overview_Context_Filter_ProjectKeyword",
    "ico_Main_Project_Overview_Context_Filter_Country",
    "ico_Main_Project_Overview_Context_Filter_Area",
    "ico_Main_Project_Overview_Context_Filter_Texnology",
    "ico_Main_Project_Overview_Context_Filter_Capacity",
    "ico_Main_Project_Overview_Context_Filter_Status",
  ] as const;

  it("UT-OVFIX-010 the grid, the seven captions, the capacity error and the command bar carry their canvas names", async () => {
    // Hold the first page open: while it loads the blocking spinner is `cmp_MS_Spinner`.
    let release: () => void = () => {};
    projectGate = new Promise<void>((resolve) => { release = resolve; });
    render(<Harness search="?cap=12a"><ProjectOverviewScreen /></Harness>);
    expect(await screen.findByTestId("cmp_MS_Spinner")).toBeInTheDocument();
    projectGate = null;
    release();
    await screen.findByText("Contr. Endpoint Testproject");
    expect(screen.getByRole("table", { name: "Projects" }))
      .toHaveAttribute("data-testid", "psf_MainScreen_DetailList_Container_FluentDetailsList");
    const caption = (id: string, text: string) => expect(screen.getByTestId(id)).toHaveTextContent(text);
    caption("lbl_Main_Project_Overview_Context_Filter_ProjectKeyword", "Project");
    caption("lbl_Main_Project_Overview_Context_Filter_ProjectManager", "Project Manager");
    caption("lbl_Main_Project_Overview_Context_Filter_Country", "Country");
    caption("lbl_Main_Project_Overview_Context_Filter_Area", "Area/State/Province");
    caption("lbl_Main_Project_Overview_Context_Filter_Technology", "Technology");
    caption("lbl_Main_Project_Overview_Context_Filter_Capacity", "Capacity");
    caption("lbl_Main_Project_Overview_Context_Filter_Status", "Status");
    caption("lbl_Main_Project_Overview_Context_Filter_Capacity_ErrorMessage", "Value must be a numeric");
    // The error keeps the id the input's `aria-describedby` points at.
    expect(screen.getByTestId("lbl_Main_Project_Overview_Context_Filter_Capacity_ErrorMessage"))
      .toHaveAttribute("id", "filter-capacity-error");
    const bar = screen.getByTestId("con_Main_Project_Overview_Header_SuitBar_CommandBar");
    expect(bar).toContainElement(screen.getByTestId("command-addProject"));
    // No layout box of its own.
    expect(bar.style.display).toBe("contents");
  });

  it("UT-OVFIX-011 no test id the screen already had was changed", async () => {
    projectTotal = 1129;
    projectNextToken = "tok";
    projectRows = [deletableRow()];
    const user = userEvent.setup();
    render(<Harness search="?cap=12"><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    await selectRow(user);
    for (const id of [
      "filter-keyword", "filter-manager", "filter-country", "filter-area", "filter-technology",
      "filter-capacity", "filter-capacity-operator", "filter-status", "page-label", "total-rows",
      `select-${PROJECT_ID}`, "command-addProject", "command-editProject", "command-editCosts",
      "command-deleteProject", "command-simulateProject", "command-viewDashboardFunctionality",
      "ico_Main_Project_Overview_Context_Pagination_FirstPage",
      "ico_Main_Project_Overview_Context_Pagination_PageLeft",
      "ico_Main_Project_Overview_Context_Pagination_PageRight",
    ]) {
      expect(screen.getByTestId(id), id).toBeInTheDocument();
    }
  });

  it("UT-OVFIX-012 the six funnels carry the canvas icon names, the typo in Technology included", async () => {
    // A value in every filter, so each funnel is enabled and shows as a funnel with a cross.
    render(
      <Harness search={"?q=endpoint&c=cccccccc-0000-0000-0000-000000000001&a=aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee&t=wind&cap=12&st=11111111-1111-1111-1111-111111111111"}>
        <ProjectOverviewScreen />
      </Harness>,
    );
    await screen.findByText("Contr. Endpoint Testproject");
    const funnels = [
      ["Project", "ico_Main_Project_Overview_Context_Filter_ProjectKeyword"],
      ["Country", "ico_Main_Project_Overview_Context_Filter_Country"],
      ["Area/State/Province", "ico_Main_Project_Overview_Context_Filter_Area"],
      ["Technology", "ico_Main_Project_Overview_Context_Filter_Texnology"],
      ["Capacity", "ico_Main_Project_Overview_Context_Filter_Capacity"],
      ["Status", "ico_Main_Project_Overview_Context_Filter_Status"],
    ] as const;
    for (const [field, id] of funnels) {
      const button = screen.getByTestId(id);
      expect(button).toHaveAttribute("aria-label", `Clear ${field} filter`);
      expect(button).toBeEnabled();
    }
  });

  it("UT-OVFIX-018 every canvas name the screen writes exists in the canvas source", () => {
    const yaml = readFileSync(join(
      __dirname, "../../../../../ProjectDocs/_extracted/msapp/projectmanagement/Src/Project Main Screen.pa.yaml",
    ), "utf8");
    for (const name of CANVAS_NAMES) expect(yaml, name).toMatch(new RegExp(`- ${name}:`));
  });

  it("UT-OVFIX-013 the Project caption shows the canvas hover text", async () => {
    render(<Harness><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    expect(screen.getByTestId("lbl_Main_Project_Overview_Context_Filter_ProjectKeyword"))
      .toHaveAttribute("title", "Search (Project name, Short Name, ID)");
  });

  it("UT-OVFIX-014 the Project Manager box shows the canvas hover text", async () => {
    render(<Harness><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    expect(screen.getByTestId("filter-manager").closest("div[title]"))
      .toHaveAttribute("title", "Search for project manager");
  });

  it("UT-OVFIX-015 the grid shows the canvas hover text", async () => {
    render(<Harness><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    expect(screen.getByTitle("Project overview list")).toContainElement(
      screen.getByRole("table", { name: "Projects" }));
  });

  it("UT-OVFIX-019 the other captions have no hover text, and the command-bar copy-paste text is not reproduced", async () => {
    render(<Harness><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    for (const id of [
      "lbl_Main_Project_Overview_Context_Filter_Country", "lbl_Main_Project_Overview_Context_Filter_Area",
      "lbl_Main_Project_Overview_Context_Filter_Technology", "lbl_Main_Project_Overview_Context_Filter_Status",
    ]) expect(screen.getByTestId(id)).not.toHaveAttribute("title");
    expect(screen.queryByTitle("Home screen navigation")).toBeNull();
  });

  it("UT-OVFIX-016 the funnel hover text is unchanged and the new titles do not shadow it", async () => {
    const user = userEvent.setup();
    render(<Harness search="?q=endpoint"><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    const funnel = screen.getByTestId("ico_Main_Project_Overview_Context_Filter_ProjectKeyword");
    expect(funnel).not.toHaveAttribute("title");
    await user.hover(funnel);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Filter projects details list view.");
  });

  it("UT-OVFIX-017 a row's radio is named by the project's name cell, with no aria-label of bound data", async () => {
    render(<Harness><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    const radio = screen.getByRole("radio", { name: "Contr. Endpoint Testproject" });
    expect(radio).toHaveAttribute("data-testid", `select-${PROJECT_ID}`);
    expect(radio).not.toHaveAttribute("aria-label");
  });

  it("UT-OVFIX-020 a Croatian project shows SharePoint and Teams before Dashboard, as the canvas Items do", async () => {
    projectRows = [projectRow({
      [`_vsb_country_value${FV}`]: "Croatia",
      vsb_sposharepointurl: "https://vsb.sharepoint.com/sites/p1",
      vsb_spoteamsurl: "https://teams.microsoft.com/l/team/p1",
    })];
    const user = userEvent.setup();
    render(<Harness><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    await selectRow(user);
    await waitFor(() => expect(screen.getByTestId("command-viewTeams")).toBeEnabled());
    const order = Array.from(document.querySelectorAll('[data-testid^="command-"]'))
      .map((el) => el.getAttribute("data-testid"));
    expect(order).toEqual([
      "command-addProject", "command-editProject", "command-editCosts", "command-deleteProject",
      "command-simulateProject", "command-viewSharepoint", "command-viewTeams",
      "command-viewDashboardFunctionality",
    ]);
  });

  it("UT-OVFIX-021 for any other country the order is unchanged: five commands, then Dashboard", async () => {
    const user = userEvent.setup();
    render(<Harness><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    await selectRow(user);
    const order = Array.from(document.querySelectorAll('[data-testid^="command-"]'))
      .map((el) => el.getAttribute("data-testid"));
    expect(order).toEqual([
      "command-addProject", "command-editProject", "command-editCosts", "command-deleteProject",
      "command-simulateProject", "command-viewDashboardFunctionality",
    ]);
  });

  /* ═════════ Parity fixes, batch A6 (PO-027) ═════════ */

  it("UT-OVFIX-081 a stored SharePoint or Teams link that is not an http(s) address is refused, not opened", async () => {
    projectRows = [projectRow({
      [`_vsb_country_value${FV}`]: "Croatia",
      vsb_sposharepointurl: "javascript:alert(1)",
      vsb_spoteamsurl: "data:text/html,<b>x</b>",
    })];
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const user = userEvent.setup();
    render(<Harness><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    await selectRow(user);
    await clickCommand(user, "viewSharepoint");
    expect(await screen.findByTestId("notice")).toHaveTextContent(OPEN_FAILED);
    await clickCommand(user, "viewTeams");
    expect(open).not.toHaveBeenCalled();
    expect(screen.getByTestId("notice")).toHaveTextContent(OPEN_FAILED);
  });

  it("UT-OVFIX-082 the Dashboard link from the environment variable still opens when it is an https address", async () => {
    envVarValues = { vsb_PowerBIDashboardLink: "https://app.powerbi.com/dashboards/d2" };
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const user = userEvent.setup();
    render(<Harness><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    await clickCommand(user, "viewDashboardFunctionality");
    expect(open).toHaveBeenCalledWith(
      "https://app.powerbi.com/dashboards/d2", "_blank", "noopener,noreferrer",
    );
    expect(screen.queryByTestId("notice")).toBeNull();
  });

  it("UT-OVFIX-083 a Dashboard link set to a javascript: address is refused", async () => {
    envVarValues = { vsb_PowerBIDashboardLink: "javascript:alert(1)" };
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const user = userEvent.setup();
    render(<Harness><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    await clickCommand(user, "viewDashboardFunctionality");
    expect(open).not.toHaveBeenCalled();
    expect(await screen.findByTestId("notice")).toHaveTextContent(OPEN_FAILED);
  });

  /* ═════════ Parity fixes, batch A3 (PO-006, PO-017, X-2): Simulate hardening ═════════ */

  const SIMULATE_BASE = "Could not check this project for simulation.";

  it("UT-OVFIX-040 a failing Base cases read says so; it is not 'Base data missing'", async () => {
    baseCaseFails = true;
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const user = userEvent.setup();
    render(<Harness><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    await selectRow(user);
    await clickCommand(user, "simulateProject");
    const notice = await screen.findByTestId("notice");
    expect(notice).toHaveTextContent(SIMULATE_BASE);
    expect(notice).not.toHaveTextContent("Base data missing");
    expect(notice).not.toHaveTextContent("Simulation is supported only");
    expect(open).not.toHaveBeenCalled();
  });

  it("UT-OVFIX-041 a click before the cluster order has loaded waits for it, with no premature warning", async () => {
    envVarValues = { vsb_AnalyticsAppID: "ana-1" };
    let release: () => void = () => {};
    stateReadGate = new Promise<void>((resolve) => { release = resolve; });
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const user = userEvent.setup();
    render(<Harness><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    await selectRow(user);
    await clickCommand(user, "simulateProject");
    // Still waiting: no notice (the old code read a null order here and warned "Clusters 1 to 5").
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(screen.queryByTestId("notice")).toBeNull();
    expect(open).not.toHaveBeenCalled();
    release();
    await waitFor(() => expect(open).toHaveBeenCalledOnce());
    expect(screen.queryByTestId("notice")).toBeNull();
  });

  it("UT-OVFIX-042 a failing cluster-state read says so, and the answer is not cached: the next click retries", async () => {
    envVarValues = { vsb_AnalyticsAppID: "ana-1" };
    stateReadFails = true;
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const user = userEvent.setup();
    render(<Harness><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    await selectRow(user);
    await clickCommand(user, "simulateProject");
    const notice = await screen.findByTestId("notice");
    expect(notice).toHaveTextContent(SIMULATE_BASE);
    expect(notice).not.toHaveTextContent("Simulation is supported only");
    expect(open).not.toHaveBeenCalled();
    const readsAfterFailure = stateReads;
    stateReadFails = false;
    await clickCommand(user, "simulateProject");
    await waitFor(() => expect(open).toHaveBeenCalledOnce());
    expect(stateReads).toBeGreaterThan(readsAfterFailure);
  });

  it("UT-OVFIX-043 a double click opens one tab", async () => {
    envVarValues = { vsb_AnalyticsAppID: "ana-1" };
    let release: () => void = () => {};
    baseCaseGate = new Promise<void>((resolve) => { release = resolve; });
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const user = userEvent.setup();
    render(<Harness><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    await selectRow(user);
    await waitFor(() => expect(screen.getByTestId("command-simulateProject")).toBeEnabled());
    // The first check is held open, so the second click lands while it is still running.
    await user.dblClick(screen.getByTestId("command-simulateProject"));
    release();
    await waitFor(() => expect(open).toHaveBeenCalledOnce());
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(open).toHaveBeenCalledOnce();
    expect(calls.filter((c) => c.table === "vsb_basecases")).toHaveLength(1);
  });

  it("UT-OVFIX-044 the check is traced as ACTION 'simulate project' with its Base cases read", async () => {
    envVarValues = { vsb_AnalyticsAppID: "ana-1" };
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(window, "open").mockReturnValue(null);
    const user = userEvent.setup();
    render(<Harness><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    await selectRow(user);
    await clickCommand(user, "simulateProject");
    await waitFor(() => {
      const lines = [...info.mock.calls, ...warn.mock.calls].map((c) => String(c[0]));
      expect(lines.some((l) => l.includes("ACTION simulate project:") && l.includes("read check base case")))
        .toBe(true);
    });
  });

  it("UT-OVFIX-045 an unsupported technology still reads the Base cases first, as the canvas's eager With does", async () => {
    projectRows = [projectRow({
      vsb_technology: 952850003, [`vsb_technology${FV}`]: "BESS",
    })];
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const user = userEvent.setup();
    render(<Harness><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    await selectRow(user);
    await clickCommand(user, "simulateProject");
    expect(await screen.findByTestId("notice")).toHaveTextContent("Simulation is supported only for Wind/PV");
    expect(calls.filter((c) => c.table === "vsb_basecases")).toHaveLength(1);
    expect(open).not.toHaveBeenCalled();
  });

  it("UT-OVFIX-046 an unconfigured Analytics app says so with the transcribed local message", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const user = userEvent.setup();
    render(<Harness><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    await selectRow(user);
    await clickCommand(user, "simulateProject");
    expect(await screen.findByTestId("notice"))
      .toHaveTextContent("Simulation is not configured for this environment.");
    expect(open).not.toHaveBeenCalled();
  });

  /* ═════════ Parity fixes, batch A2 (PO-001): the Project Manager filter from the address ═════════ */

  const MGR_ID = "bbbbbbbb-0000-0000-0000-00000000000b";
  const MGR_ROW = {
    systemuserid: "u-b", fullname: "# Alan Turing", internalemailaddress: "alan@vsb.energy",
    azureactivedirectoryobjectid: MGR_ID,
  };
  const managerLookups = () => calls.filter(isManagerLookup);
  const pmClause = `_vsb_projectmanager_value eq ${MGR_ID}`;

  const OTHER_ID = "cccccccc-0000-0000-0000-00000000000c";

  /** Changes the address from inside the router, as a Back / Forward step or a pasted link does. */
  function GoTo() {
    const navigate = useNavigate();
    return (
      <>
        <button type="button" data-testid="goto-plain" aria-label="Go to the plain list"
          onClick={() => navigate("/projects")} />
        <button type="button" data-testid="goto-other" aria-label="Go to another manager"
          onClick={() => navigate(`/projects?pm=${OTHER_ID}`)} />
      </>
    );
  }

  it("UT-OVFIX-030 a manager in the address is shown as a chip with its name and its clear button", async () => {
    lookupUsers = [MGR_ROW];
    render(<Harness search={`?pm=${MGR_ID}`}><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    // The name is cleaned of the "# " the directory puts on synced accounts, as the picker does.
    expect(await screen.findByText("Alan Turing")).toBeInTheDocument();
    expect(screen.getByTestId("filter-manager-clear")).toBeInTheDocument();
    // The list really is filtered by that person: the visible chip and the request agree.
    expect(String(projectQuery()?.filter)).toContain(pmClause);
    expect(managerLookups()).toHaveLength(1);
  });

  it("UT-OVFIX-031 when the lookup finds nobody the chip says so, and its clear button still clears", async () => {
    lookupUsers = [];
    const user = userEvent.setup();
    render(<Harness search={`?pm=${MGR_ID}`}><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    expect(await screen.findByText("Selected project manager")).toBeInTheDocument();
    await user.click(screen.getByTestId("filter-manager-clear"));
    await waitFor(() => expect(screen.queryByText("Selected project manager")).toBeNull());
    expect(screen.getByTestId("current-location")).not.toHaveTextContent("pm=");
  });

  it("UT-OVFIX-032 the clear button takes pm out of the address and the list is asked again without it", async () => {
    lookupUsers = [MGR_ROW];
    const user = userEvent.setup();
    render(<Harness search={`?pm=${MGR_ID}&q=endpoint`}><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Alan Turing");
    await user.click(screen.getByTestId("filter-manager-clear"));
    await waitFor(() =>
      expect(screen.getByTestId("current-location")).toHaveTextContent(/^\/projects\?q=endpoint$/));
    await waitFor(() => expect(String(projectQuery()?.filter)).not.toContain("_vsb_projectmanager_value"));
    expect(screen.queryByTestId("filter-manager-clear")).toBeNull();
    // The box is empty and ready for a new search.
    expect((screen.getByTestId("filter-manager") as HTMLInputElement).value).toBe("");
  });

  it("UT-OVFIX-033 picking a suggestion names the chip at once, with no extra lookup", async () => {
    searchUsers = [MGR_ROW];
    const user = userEvent.setup();
    render(<Harness><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    await user.type(screen.getByTestId("filter-manager"), "ala");
    await user.click(await screen.findByTestId(`filter-manager-suggestion-${MGR_ID}`));
    expect(await screen.findByTestId("filter-manager-clear")).toBeInTheDocument();
    expect(screen.getAllByText("Alan Turing").length).toBeGreaterThan(0);
    expect(screen.getByTestId("current-location")).toHaveTextContent(`pm=${MGR_ID}`);
    await waitFor(() => expect(String(projectQuery()?.filter)).toContain(pmClause));
    expect(managerLookups()).toHaveLength(0);
  });

  it("UT-OVFIX-034 the chip follows the address: it goes when the address loses pm and is looked up again for another", async () => {
    lookupUsers = [MGR_ROW];
    const user = userEvent.setup();
    render(
      <Harness search={`?pm=${MGR_ID}`}>
        <ProjectOverviewScreen />
        <GoTo />
      </Harness>,
    );
    await screen.findByText("Alan Turing");
    await user.click(screen.getByTestId("goto-plain"));
    await waitFor(() => expect(screen.queryByTestId("filter-manager-clear")).toBeNull());
    expect(screen.queryByText("Alan Turing")).toBeNull();
    // Another manager in a pasted link is looked up; it is not shown under the previous name.
    lookupUsers = [{ ...MGR_ROW, fullname: "Grace Hopper", azureactivedirectoryobjectid: OTHER_ID }];
    await user.click(screen.getByTestId("goto-other"));
    expect(await screen.findByText("Grace Hopper")).toBeInTheDocument();
    expect(screen.queryByText("Alan Turing")).toBeNull();
  });

  it("UT-OVFIX-035 a failing lookup shows the fallback caption and a failed read line", async () => {
    lookupFails = true;
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    render(<Harness search={`?pm=${MGR_ID}`}><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    expect(await screen.findByText("Selected project manager")).toBeInTheDocument();
    expect(screen.getByTestId("filter-manager-clear")).toBeInTheDocument();
    await waitFor(() => {
      const lines = [...info.mock.calls, ...warn.mock.calls].map((c) => String(c[0]));
      expect(lines.some((l) => l.includes("DATA read look up project manager") && l.includes("1 FAILED")))
        .toBe(true);
    });
  });

  it("UT-OVFIX-036 the lookup is traced as a DATA read line", async () => {
    lookupUsers = [MGR_ROW];
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    render(<Harness search={`?pm=${MGR_ID}`}><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Alan Turing");
    await waitFor(() => {
      const lines = info.mock.calls.map((c) => String(c[0]));
      expect(lines.some((l) => l.includes("DATA read look up project manager: 1 row"))).toBe(true);
    });
  });

  /* ═════════ Parity fixes, batch A5 (PO-031): a failed filter list is said, with Retry ═════════ */

  const listErrorIds = () =>
    Array.from(document.querySelectorAll('[data-testid^="filter-list-error-"]'))
      .map((el) => el.getAttribute("data-testid"));

  it("UT-OVFIX-070 a refused Country list shows its message and a Retry that reads it again", async () => {
    failTables.add("vsb_countries");
    const user = userEvent.setup();
    render(<Harness><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    const bar = await screen.findByTestId("filter-list-error-countries");
    expect(bar).toHaveTextContent("The country list could not be loaded.");
    // The list itself is empty: there is nothing to choose.
    await user.click(screen.getByTestId("filter-country"));
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    await user.keyboard("{Escape}");
    const before = calls.filter((c) => c.table === "vsb_countries").length;
    failTables.delete("vsb_countries");
    await user.click(screen.getByTestId("filter-list-error-countries-retry"));
    await waitFor(() => expect(screen.queryByTestId("filter-list-error-countries")).toBeNull());
    expect(calls.filter((c) => c.table === "vsb_countries").length).toBeGreaterThan(before);
  });

  it("UT-OVFIX-071 a refused Status list shows its message and a working Retry", async () => {
    failTables.add("vsb_projectstates");
    const user = userEvent.setup();
    render(<Harness><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    expect(await screen.findByTestId("filter-list-error-states"))
      .toHaveTextContent("The status list could not be loaded.");
    failTables.delete("vsb_projectstates");
    await user.click(screen.getByTestId("filter-list-error-states-retry"));
    await waitFor(() => expect(screen.queryByTestId("filter-list-error-states")).toBeNull());
  });

  it("UT-OVFIX-072 a refused Area list (after a country is chosen) shows its message", async () => {
    failTables.add("vsb_countryareas");
    render(<Harness search="?c=cccccccc-0000-0000-0000-000000000001"><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    expect(await screen.findByTestId("filter-list-error-areas"))
      .toHaveTextContent("The area list could not be loaded.");
    expect(screen.getByTestId("filter-list-error-areas-retry")).toBeInTheDocument();
  });

  it("UT-OVFIX-073 a refused Project Manager search shows its message as the suggestion list's only row", async () => {
    searchFails = true;
    const user = userEvent.setup();
    render(<Harness><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    await user.type(screen.getByTestId("filter-manager"), "ala");
    const row = await screen.findByTestId("filter-list-error-managers");
    expect(row).toHaveTextContent("The project manager search could not be loaded.");
    expect(screen.getByRole("list", { name: "Suggested people" }).querySelectorAll("button")).toHaveLength(0);
  });

  it("UT-OVFIX-074 a healthy load shows no list error", async () => {
    searchUsers = [];
    const user = userEvent.setup();
    render(<Harness search="?c=cccccccc-0000-0000-0000-000000000001"><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    await user.type(screen.getByTestId("filter-manager"), "ala");
    await act(async () => { await new Promise((r) => setTimeout(r, 450)); });
    expect(listErrorIds()).toEqual([]);
  });

  /* ═════════ Parity fixes, batch A4 (PO-007, PO-025): capacity ═════════ */

  /** The capacity clause of every named-segment request issued so far, in order (undefined: none). */
  const capacityClauses = () => namedCalls().map((c) => {
    const m = /vsb_totalcapacity (eq|gt|ge|lt|le) (-?[0-9.]+)/.exec(String(c.options.filter ?? ""));
    return m ? `${m[1]} ${m[2]}` : undefined;
  });

  it("UT-OVFIX-059 a malformed ?cap= link prefetches under the key the screen reads", () => {
    const raw = parseCriteria(new URLSearchParams("cap=12a"));
    const sort = raw.sort;
    const fromPrefetch = projectPageKey({ filter: raw.filter, sort, page: 1, locale: "en-GB" });
    const fromScreen = projectPageKey({
      filter: { ...raw.filter, capacity: "", capacityOperator: "" }, sort, page: 1, locale: "en-GB",
    });
    expect(fromPrefetch).toEqual(fromScreen);
    // A valid capacity is untouched.
    const valid = parseCriteria(new URLSearchParams("cap=12")).filter;
    expect(projectPageKey({ filter: valid, sort, page: 1 })[1]).toEqual(valid);
  });

  it("UT-OVFIX-060 typing a letter after a valid capacity keeps the list filtered by the last one and sends nothing", async () => {
    const user = userEvent.setup();
    render(<Harness search="?cap=12"><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    expect(capacityClauses().every((c) => c === "eq 12")).toBe(true);
    const before = namedCalls().length;
    await user.type(screen.getByTestId("filter-capacity"), "a");
    expect(screen.getByTestId("current-location")).toHaveTextContent("cap=12a");
    expect(screen.getByTestId("lbl_Main_Project_Overview_Context_Filter_Capacity_ErrorMessage"))
      .toHaveTextContent("Value must be a numeric");
    // Past the debounce window: still no request, and none ever lacked the capacity clause.
    await act(async () => { await new Promise((r) => setTimeout(r, 500)); });
    expect(namedCalls().length).toBe(before);
    expect(capacityClauses().every((c) => c === "eq 12")).toBe(true);
    expect(screen.getByText("Contr. Endpoint Testproject")).toBeInTheDocument();
  });

  it("UT-OVFIX-061 typing 125.5 sends one request for the finished number, none for the keystrokes", async () => {
    const user = userEvent.setup();
    render(<Harness><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    await user.type(screen.getByTestId("filter-capacity"), "125.5");
    // Inside the debounce window nothing has been asked yet.
    expect(capacityClauses().filter((c) => c !== undefined)).toEqual([]);
    await waitFor(() => expect(capacityClauses()).toContain("eq 125.5"), { timeout: 3000 });
    expect(capacityClauses().filter((c) => c !== undefined)).toEqual(["eq 125.5"]);
  });

  it("UT-OVFIX-062 emptying the box clears the filter once the debounce has passed", async () => {
    const user = userEvent.setup();
    render(<Harness search="?cap=12"><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    await user.clear(screen.getByTestId("filter-capacity"));
    await waitFor(() => expect(capacityClauses().at(-1)).toBeUndefined(), { timeout: 3000 });
    expect(capacityClauses()[0]).toBe("eq 12");
    expect(screen.getByTestId("current-location")).not.toHaveTextContent("cap=");
  });

  it("UT-OVFIX-063 picking an operator with a valid capacity asks at once, not after a debounce", async () => {
    const user = userEvent.setup();
    render(<Harness search="?cap=12"><ProjectOverviewScreen /></Harness>);
    await screen.findByText("Contr. Endpoint Testproject");
    await user.click(screen.getByTestId("filter-capacity-operator"));
    await user.click(await screen.findByRole("option", { name: "Greater than" }));
    await waitFor(() => expect(capacityClauses()).toContain("gt 12"), { timeout: 1500 });
  });
});
