/**
 * Main Project Overview — the landing screen. Composition only.
 *
 * Canvas screen: `Project Main Screen.pa.yaml` in the Project Management app.
 * Every decision lives in `rules.ts`; every query in `hooks.ts`.
 *
 * Structure, matching the canvas containers:
 *   command bar   `con_Main_Project_Overview_Header_SuitBar_CommandBar`
 *   filter bar    `con_Main_Project_Overview_Context_Filter` 1-4 (seven fields)
 *   the grid      `psf_MainScreen_DetailList_Container_FluentDetailsList`
 *   footer        Total Rows + the pager
 *
 * Which commands do what, in THIS app:
 *   Add Project    → `/projects/new` → `/project/general`, General Data's New Project form,
 *                    in the same tab.
 *   Edit Project   → `/projects/:projectId/general` → `/project/general?projectId=…`, in the
 *                    same tab. The canvas forked on `gblProduction` and RELAUNCHED the whole
 *                    app in the player; one app now, so it is plain client-side routing.
 *   Edit Costs     → `/costs/capex?projectId=…`, internal. The canvas `Launch`ed a second
 *                    Power Apps app. The Draft gate is reproduced exactly: a project whose
 *                    cluster state is "Draft" gets the cost-module lock dialog instead.
 *   Delete Project → confirmation, then one delete with the page patched optimistically.
 *                    Blocked for an approved project, as the canvas blocks it.
 *   Simulate       → launches the Analytics canvas app, which stays canvas this phase. A real
 *                    external launch, not a route.
 *   Sharepoint /   → `window.open` of the URL stored on the project. Croatia only, and only
 *   Teams            when BOTH urls are present — the canvas gates both commands on both.
 *   Power BI ×2 /  → `window.open` of a link built from environment variables. An unset
 *   Dashboard        variable says so rather than opening nothing.
 *
 * Every caption, dialog title and notification on this screen is transcribed in `rules.ts`
 * with the canvas control it came from; none of them are written here.
 */
import { memo, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { appTabUrl, projectAppUrl, resolvePlayAppUrl } from "@/app/deepLinks";
import {
  NEW_PROJECT_PATH, analyticsAppUrl, powerBiReportUrl,
} from "@/app/navigation";
import {
  Button, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle,
  Dropdown, Input, MessageBar, MessageBarBody, Option, Spinner, Table, TableBody,
  TableCell, TableHeader, TableHeaderCell, TableRow, Text, Tooltip, makeStyles, mergeClasses,
  tokens,
} from "@fluentui/react-components";
import {
  ArrowLeftRegular, ArrowPreviousRegular, ArrowRightRegular, ArrowSortDownRegular,
  ArrowSortUpRegular, CheckmarkCircleFilled, CircleFilled, ClockFilled, DismissCircleFilled,
  DismissRegular, FilterRegular, FilterDismissRegular, SearchRegular,
} from "@fluentui/react-icons";
import {
  CommandBar, CommandSlot, ConfirmDialog, EmptyState, LoadingOverlay, type Command,
} from "@/components";
import { useSession } from "@/app/SessionContext";
import { loadHasBaseCase } from "@/data/projects";
import { media, palette, space } from "@/theme/tokens";
import { approvalDecoration, TECHNOLOGY_LABEL } from "@/domain/project";
import {
  CAPACITY_OPERATORS, COL, COST_LOCK, DELETE_DIALOG, OPEN_FAILED, PAGE_SIZE,
  REPORT_UNAVAILABLE, SPO_MSG,
  capacityError, clearIconState, commandBarState, costModuleLock, deleteMessages,
  formatCapacity, isCostModuleLocked, isFilterActive, isPagerVisible, pagerLabels,
  simulateGate,
  type CapacityOperator, type CommandKey, type ProjectRow, type SelectedProject,
} from "./rules";
import {
  useCountries, useCountryAreas, useCriteria, useDeleteProject, useProjectManagerSearch,
  useProjectPage, useProjectStateOrder, useProjectStates,
} from "./hooks";

/* ────────────────────────────────────────────────────────────────── styles */

/**
 * Column widths as the live grid renders them (`UI Screenshots/Main Overview Screen.png`):
 * the canvas `columns_Items` widths (`titleWidth: 350`, `defaultWidth: 100`,
 * `defaulPMtWidth: 200`, `areaWidth: 220`, `capacityWidth: 160`, `iconWidth: 60`) plus the
 * Fluent details list's cell padding. The selection column is this app's radio.
 *
 * The grid is a fixed ~1720 px and does NOT stretch: on a 1919 px screen the canvas leaves an
 * empty strip to its right, and so does this.
 *
 * `columns_Items` also lists `vsb_totalcapacity` (captioned "Technology") and `loc_wMW`
 * ("Weighted Capacity [MWp]"); the live grid shows neither, so neither is rendered.
 */
const COLUMN_WIDTH = {
  select: 44, accent: 20, name: 365, shortName: 116, status: 116, manager: 220, country: 116,
  area: 240, technology: 116, capacity: 160, projectId: 116, approval: 90,
} as const;
const GRID_WIDTH = Object.values(COLUMN_WIDTH).reduce((sum, w) => sum + w, 0);

const useStyles = makeStyles({
  /**
   * `flex: 1` so the screen owns the whole content area — which is what keeps the footer at
   * the BOTTOM instead of riding up under a short grid or an empty state.
   */
  /**
   * `con_Main_Project_Overview_Context` is a vertical auto-layout with `LayoutGap: =4`, and the
   * results container inside it pads its grid and pager by 4 on every side.
   */
  page: {
    display: "flex", flexDirection: "column", gap: space.xs,
    flex: 1, minWidth: 0, minHeight: 0,
    paddingLeft: space.xs, paddingRight: space.xs, paddingBottom: space.xs,
  },
  /**
   * Everything between the filters and the footer. Takes the slack, so `Total Rows` and the
   * pager sit on the bottom edge whether the grid is full, short, empty or erroring.
   */
  body: { flex: 1, minHeight: 0, display: "flex", flexDirection: "column" },

  /*
   * ── the filter card ──────────────────────────────────────────────────────────────────
   * `con_Main_Project_Overview_Context_Filter`, from `Project Main Screen.pa.yaml`:
   *
   *   card      horizontal auto-layout, `LayoutGap: =6`, `Height: =124`, white, 4 px radius
   *   column    FOUR of them. `Width: =Parent.Width/6` with the auto-layout's default fill
   *             portions, so they share the card equally: a quarter each, as the live
   *             `UI Screenshots/Main Overview Screen.png` shows.
   *   cell      `Width: =Parent.Width`; the first in each column 56 tall, the second 68
   *   label     `X: =6, Y: =2`, 24 tall, `Size: =10` (13.33 px)
   *   control   `X: =6, Width: =Parent.Width-48` — it ends 42 px short of the cell's edge
   *   funnel    32 x 32 at `X: =Parent.Width - 35` — 7 px after the control, 3 px from the edge
   *   second-row controls sit at `Y: =28`, first-row ones at `Y: =24`
   *
   * The columns used to grow across the card while every control stayed 232 px, which left
   * each pair of filters stranded at the left of its quarter with a wide gap after it. The
   * controls now fill their column, as they do in the canvas.
   *
   * The four columns are real columns, not a 4 x 2 grid: collapsing a grid to two columns
   * would reflow row-major and split Capacity from its operator and Project from its manager.
   * As columns, a narrow viewport wraps whole pairs, which is what the canvas auto-layout did.
   */
  filters: {
    display: "flex",
    flexFlow: "row wrap",
    columnGap: "6px",
    flex: "none",
    minWidth: 0,
    borderRadius: "4px",
    backgroundColor: palette.white,
    boxShadow: "0 1px 2px rgba(0, 0, 0, 0.14), 0 0 2px rgba(0, 0, 0, 0.12)",
    paddingTop: "2px", paddingRight: "2px", paddingBottom: "2px", paddingLeft: "2px",
  },
  /** An equal share of the card, never narrower than 250 px; narrower screens wrap pairs. */
  filterColumn: {
    display: "flex", flexDirection: "column",
    flexGrow: 1, flexShrink: 1, flexBasis: 0,
    minWidth: "250px",
    [media.belowSm]: { minWidth: 0, flexBasis: "100%" },
  },
  /** One labelled filter: the full column width, label at x=6, funnel 3 px from the edge. */
  filterCell: {
    width: "100%",
    paddingLeft: "6px", paddingRight: "3px",
    boxSizing: "border-box",
  },
  /** The first cell of a column — `Height: =56`, control at `Y: =24`. */
  filterCellTop: { height: "56px" },
  /** The second — `Height: =Parent.Height - 56` = 68, control at `Y: =28`. */
  filterCellBottom: { height: "68px", "& > div": { marginTop: "4px" } },
  /** `lbl_..._Filter_*` — 10 pt, `rgb(50, 49, 48)`, in a 24 px line box at `Y: =2`. */
  filterLabel: {
    display: "flex", alignItems: "baseline", gap: space.s,
    boxSizing: "border-box",
    height: "24px",
    fontSize: "13.33px",
    lineHeight: "1.2",
    color: "#323130",
    paddingTop: "2px",
    whiteSpace: "nowrap",
  },
  /**
   * `lbl_..._Filter_Capacity_ErrorMessage` — `Y: =6`, beside the "Capacity" caption rather
   * than under the input, so a bad value does not push the cell past its 68 px.
   */
  filterError: {
    fontSize: "10.67px",
    color: palette.akzent5,
    overflow: "hidden", textOverflow: "ellipsis",
  },
  /** The control and its funnel, with the canvas's 7 px between them. */
  filterRow: { display: "flex", alignItems: "center", gap: "7px", minWidth: 0 },
  /**
   * `Width: =Parent.Width-48` — the control takes what the funnel leaves. The button's caption
   * never wraps: "Select operator" breaking over two lines is what made the Capacity cell grow.
   */
  filterControl: {
    flex: 1, minWidth: 0,
    "& .fui-Dropdown__button": {
      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
    },
  },
  /** `pcf_..._ProjectManager` — `X: =12, Width: =Parent.Width - 14`, and NO funnel. */
  filterPerson: {
    flex: 1, minWidth: 0, position: "relative",
    paddingLeft: "6px", paddingRight: 0,
  },
  personInput: { width: "100%" },
  /** `txt_..._Capacity` is 100 px; the operator takes the rest, 6 px after it. */
  capacityValue: { width: "100px", flexGrow: 0, flexShrink: 0 },
  capacityGroup: { display: "flex", gap: "6px", flex: 1, minWidth: 0 },

  gridWrap: { flex: 1, minHeight: 0, overflow: "auto" },
  /** The sum of `COLUMN_WIDTH`, fixed, so every column keeps the width the canvas gives it. */
  table: { tableLayout: "fixed", width: `${GRID_WIDTH}px` },
  accentCell: { width: "6px", paddingLeft: 0, paddingRight: 0 },
  accent: { display: "block", width: "4px", height: "22px", borderRadius: "2px" },
  selectCell: { width: "44px" },
  /** `ColHorizontalAlign: "Right"` — the cell AND its header, so the figures line up under it. */
  numeric: {
    textAlign: "right", fontVariantNumeric: "tabular-nums",
    "& .fui-TableHeaderCell__button": { justifyContent: "flex-end" },
  },
  /** `ColHorizontalAlign: "Center"` — the Approval glyph. */
  centered: {
    textAlign: "center",
    "& .fui-TableHeaderCell__button": { justifyContent: "center" },
  },
  sortable: { cursor: "pointer", userSelect: "none" },
  /**
   * `AlternateRowColor: =gblAppTheme.palette.themeLighter` on the canvas details list. The
   * live grid stripes the FIRST row and every second one after it, the rest white.
   * `canvas.css` and this rule used to stripe opposite rows, so no row was white.
   */
  rowAlt: { backgroundColor: palette.themeLighter },
  /** The selected row on the screenshot: Fluent's `neutralLight`. */
  rowSelected: { backgroundColor: palette.neutralLight },
  /**
   * Total Rows and the pager sit together at the LEFT, as in the reference.
   *
   * `flex: none` with `body` taking the slack above it: the strip belongs to the bottom edge
   * of the screen, not to the bottom of the rows. With a short, empty or failed grid it used
   * to ride up and sit under the message, which read as part of the message.
   */
  /*
   * `con_..._Pagination` is 32 tall: `_Pagination_Info` (120 wide, `PaddingLeft: =10`) holds
   * Total Rows, then `_Pagination_Buttons` (`LayoutGap: =10`, `PaddingLeft: =10`).
   */
  footer: {
    display: "flex", alignItems: "center", columnGap: "10px", flexWrap: "wrap",
    flex: "none",
    minHeight: "32px",
    paddingLeft: "10px",
    paddingTop: space.xs,
    borderTopWidth: "1px",
    borderTopStyle: "solid",
    borderTopColor: tokens.colorNeutralStroke2,
  },
  /** An empty or failed grid fills the same space the rows would have. */
  bodyMessage: {
    flex: 1, minHeight: 0,
    display: "flex", flexDirection: "column", justifyContent: "center",
  },
  /** Total Rows sits in its own 120 px box before the pager. */
  totalRows: { minWidth: "100px" },
  suggestions: {
    listStyleType: "none", margin: 0, padding: 0,
    borderTopWidth: "1px", borderTopStyle: "solid", borderTopColor: tokens.colorNeutralStroke2,
    maxHeight: "220px", overflowY: "auto",
  },
  suggestion: {
    display: "flex", flexDirection: "column", alignItems: "flex-start", width: "100%",
    paddingTop: space.xs, paddingBottom: space.xs,
  },
  suggestionMail: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase100 },
  /**
   * The cost-lock dialog's prerequisite list. The canvas stacked four separate labels.
   *
   * Deliberately NOT `display: flex`: a flex or grid container drops the implicit `list` and
   * `listitem` roles in some engines, which would take the count a screen reader announces
   * with it. Four short lines do not need a flex container.
   */
  lockList: {
    marginTop: space.s, marginBottom: 0,
    paddingLeft: space.l,
    lineHeight: "1.6",
  },
  approval: { display: "inline-flex", alignItems: "center", fontSize: "20px" },
  /**
   * `cat_PowerCAT.Icon` with `IconType: IconButon`: a 32 x 32 box filled `themePrimary` with
   * a white glyph, `HoverFillColor: themeLighter` / `HoverFontColor: themePrimary`. Disabled
   * it greys out, which is what the filter funnels look like until a filter is set.
   */
  iconButton: {
    minWidth: "32px", width: "32px", height: "32px", flexShrink: 0,
    borderRadius: "2px",
    backgroundColor: palette.themePrimary, color: palette.white,
    ":hover:enabled": { backgroundColor: palette.themeLighter, color: palette.themePrimary },
    ":disabled": { backgroundColor: palette.neutralLighter, color: palette.neutralTertiaryAlt },
  },
  /**
   * The details list's selection circle: an empty ring, or a filled `themePrimary` disc with a
   * white tick when selected. Still a native radio underneath, so the list stays one tab stop.
   */
  radio: {
    appearance: "none", cursor: "pointer",
    marginTop: 0, marginRight: 0, marginBottom: 0, marginLeft: 0,
    width: "18px", height: "18px", borderRadius: "50%",
    borderTopWidth: "1px", borderRightWidth: "1px", borderBottomWidth: "1px", borderLeftWidth: "1px",
    borderTopStyle: "solid", borderRightStyle: "solid", borderBottomStyle: "solid", borderLeftStyle: "solid",
    borderTopColor: palette.neutralSecondary, borderRightColor: palette.neutralSecondary,
    borderBottomColor: palette.neutralSecondary, borderLeftColor: palette.neutralSecondary,
    backgroundColor: palette.white,
    ":checked": {
      backgroundColor: palette.themePrimary,
      borderTopColor: palette.themePrimary, borderRightColor: palette.themePrimary,
      borderBottomColor: palette.themePrimary, borderLeftColor: palette.themePrimary,
      backgroundImage:
        "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M4 8.5l2.5 2.5L12 5.5' fill='none' stroke='white' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")",
      backgroundRepeat: "no-repeat", backgroundPosition: "center", backgroundSize: "14px",
    },
    ":focus-visible": { outline: `2px solid ${palette.themePrimary}`, outlineOffset: "2px" },
  },
});

/**
 * `loc_iconstate`: the canvas grid's approval glyph per state (`icon:StatusCircleOuter`,
 * `icon:AwayStatus`, `icon:SkypeCircleCheck`, `icon:StatusErrorFull`, `icon:Cancel`), drawn in
 * `loc_iconcolor`. Keyed by `approvalDecoration(...).icon`.
 */
const APPROVAL_ICON: Record<string, React.ReactElement> = {
  circle: <CircleFilled />,
  clock: <ClockFilled />,
  check: <CheckmarkCircleFilled />,
  dismiss: <DismissCircleFilled />,
  prohibited: <DismissRegular />,
};

/** `ItemIconName` → a Fluent icon. Keeps `rules.ts` free of React. */
const COMMAND_ICON: Record<string, Command["icon"]> = {
  Add: "Add",
  Edit: "Edit",
  Delete: "Delete",
  ReadingMode: "ReadingMode",
  Play: "Play",
  View: "Document",
  BIDashboard: "BIDashboard",
};

/* ─────────────────────────────────────────────────────────────── the screen */

export default function ProjectOverviewScreen() {
  const styles = useStyles();
  const { session, envVars, locale } = useSession();
  const { criteria, setFilter, clearFilter, setSort, setPage } = useCriteria();

  const navigate = useNavigate();

  const [selectedId, setSelectedId] = useState<string>();
  const [managerQuery, setManagerQuery] = useState("");
  /** `locPreventEditCostPopUp` — the cost-module lock. Edit Costs's own guard; Simulate has its
   * own separate validation (`simulateGate`) and does not share this dialog. */
  const [lock, setLock] = useState<{ name: string; sections: string[] } | null>(null);
  /** `locProjectDelitionDialog` (the canvas's own spelling). */
  const [confirmDelete, setConfirmDelete] = useState(false);
  /** What the canvas said with `Notify()`. `NotificationType.Warning` maps to `"warning"`. */
  const [notice, setNotice] =
    useState<{ intent: "success" | "error" | "info" | "warning"; text: string }>();

  const pageQuery = useProjectPage({ criteria, locale });
  const capacityMessage = capacityError(criteria.filter.capacity, locale);
  const countries = useCountries();
  const areas = useCountryAreas(criteria.filter.countryId);
  const states = useProjectStates();
  const managers = useProjectManagerSearch(managerQuery);

  const rows = pageQuery.data?.rows ?? [];
  const selected = rows.find((r) => r.id === selectedId);
  const stateOrder = useProjectStateOrder(selected?.clusterStateId ?? null);
  const deletion = useDeleteProject(pageQuery.pageKey);

  /* ── command bar ─────────────────────────────────────────────────────── */

  const selectedForGates = useMemo<SelectedProject | null>(
    () =>
      selected
        ? {
            id: selected.id,
            name: selected.name,
            approvalState: selected.approvalState,
            statusName: selected.statusName || null,
            statusOrder: stateOrder.data ?? null,
            countryName: selected.countryName || null,
            spoSharepointUrl: selected.spoSharepointUrl,
            spoTeamsUrl: selected.spoTeamsUrl,
          }
        : null,
    [selected, stateOrder.data],
  );

  const gates = useMemo(
    () =>
      commandBarState({
        selected: selectedForGates,
        // Under decision D1 the server is the only authority on privileges, so the app offers
        // the commands and Dataverse refuses. See src/platform/privileges.ts.
        canCreate: true,
        canEditSelected: true,
        userMail: session?.userPrincipalName ?? null,
      }),
    [selectedForGates, session?.userPrincipalName],
  );

  const commands = useMemo<Command[]>(() => {
    // The reference order: Add Project · Edit Project · Edit Costs · Delete Project ·
    // Simulate · Dashboard, with the four conditional items after them.
    const order: CommandKey[] = [
      "addProject", "editProject", "editCosts", "deleteProject", "simulateProject",
      "viewDashboardFunctionality",
      "viewSharepoint", "viewTeams",
      "viewProjectOverviewPowerBI", "viewPortfolioOverviewPowerBI",
    ];
    return order
      .map((key) => gates[key])
      .filter((c) => c.visible)
      .map((c) => ({
        key: c.key,
        label: c.label,
        icon: COMMAND_ICON[c.icon] ?? "Document",
        enabled: c.enabled && !deletion.isPending,
      }));
  }, [gates, deletion.isPending]);

  /* ── the handlers ────────────────────────────────────────────────────── */

  /**
   * `locPreventEditCostPopUp` — Edit Costs's own gate. Simulate does NOT share it: the canvas
   * `simulateProject` OnSelect has its own, separate validation (`simulateGate`, below) and
   * never tests `'Cluster State'.Name = "Draft"`. Conflating the two was the easy mistake here.
   *
   * The gate is the Draft test ALONE (`varProjectRecord.'Cluster State'.Name = "Draft"`); the
   * four bullets the dialog lists are each independently visible. So a non-Draft project with
   * a blank start date goes straight through even though the dialog would have listed
   * "Milestones" — conflating the list with the gate is the easy mistake, and both halves are
   * tested.
   */
  const blockedByCostLock = (row: ProjectRow): boolean => {
    const input = {
      projectStartDate: row.projectStartDate,
      totalCapacity: row.totalCapacity,
      netYieldP50: row.netYieldP50,
      statusName: row.statusName || null,
    };
    if (!isCostModuleLocked(input)) return false;
    setLock({ name: row.name, sections: costModuleLock(input) });
    return true;
  };

  /** `Launch(...)` — kept synchronous with the gesture so the browser allows the tab. */
  const launch = (url: string | undefined, unavailable: string) => {
    if (!url) { setNotice({ intent: "info", text: unavailable }); return; }
    window.open(url, "_blank", "noopener,noreferrer");
  };

  /**
   * Open one of this app's own routes in a new tab.
   *
   * `Edit Costs` and `Edit Project` (via `openProjectTab`) do this, so the portfolio list stays
   * open behind them with its filter, page and selection untouched. `Add Project` does not: a
   * new project's form continues in place.
   */
  const openInNewTab = (path: string, projectId?: string) => {
    try {
      // `resolvePlayAppUrl` is what makes this dynamic across environments: a pushed app uses
      // the host-reported `session.appUrl`, a local `npm run dev` + `pac code run` session
      // builds the `…/app/local?_localAppUrl=…` shape instead, and if neither applies,
      // `appTabUrl` falls back to the current browser URL on its own. See `app/deepLinks.ts`.
      const appUrl = resolvePlayAppUrl({
        sessionAppUrl: session?.appUrl,
        environmentId: session?.environmentId,
        appOrigin: window.location.origin,
      });
      launch(
        appTabUrl({
          currentUrl: window.location.href,
          ...(appUrl === undefined ? {} : { appUrl }),
          path,
          ...(projectId === undefined ? {} : { projectId }),
        }),
        OPEN_FAILED,
      );
    } catch {
      setNotice({ intent: "error", text: OPEN_FAILED });
    }
  };

  /** `Edit Project`: this app's General Data for `projectId`, in a new tab (`projectAppUrl`). */
  const openProjectTab = (projectId: string) => {
    try {
      const appUrl = resolvePlayAppUrl({
        sessionAppUrl: session?.appUrl,
        environmentId: session?.environmentId,
        appOrigin: window.location.origin,
      });
      launch(
        projectAppUrl({
          currentUrl: window.location.href,
          ...(appUrl === undefined ? {} : { appUrl }),
          projectId,
        }),
        OPEN_FAILED,
      );
    } catch {
      setNotice({ intent: "error", text: OPEN_FAILED });
    }
  };

  /**
   * `simulateProject`'s `OnSelect` — see `simulateGate` in `rules.ts` for the formula itself.
   *
   * The canvas's `With({ varProjectRecord: …, varBaseCaseRecord: LookUp('Base cases', …) }, …)`
   * evaluates both lookups EAGERLY, before the `If` that decides whether either result is used.
   * `loadHasBaseCase` is awaited up front here for the same reason — not skipped just because
   * the technology/cluster check is about to fail.
   */
  const handleSimulate = async (row: ProjectRow): Promise<void> => {
    const hasBaseCase = await loadHasBaseCase(row.id);
    const result = simulateGate({
      technology: row.technology,
      clusterStateOrder: stateOrder.data ?? null,
      hasBaseCase,
    });
    if (!result.ok) {
      setNotice({ intent: "warning", text: result.message });
      return;
    }
    launch(
      analyticsAppUrl({
        environmentId: session?.environmentId,
        analyticsAppId: envVars.vsb_AnalyticsAppID,
        tenantId: session?.tenantId,
        projectId: row.id,
      }),
      "Simulation is not configured for this environment.",
    );
  };

  const onCommand = (key: string) => {
    setNotice(undefined);
    const command = gates[key as CommandKey];
    if (!command || !command.enabled) return;

    switch (key as CommandKey) {
      /*
       * General Data IS the New Project screen — the canvas blanks its globals and navigates
       * with nothing selected. Creating happens IN PLACE, not in a second tab: there is no
       * list state worth preserving behind a form you are about to fill in.
       *
       * Screen #9 is not built yet, so `/projects/new` renders the not-yet-built notice.
       */
      case "addProject":
        navigate(NEW_PROJECT_PATH);
        return;

      /*
       * A NEW tab of THIS app on the selected project's General Data (PO, 20 Oct 2026), so the
       * portfolio list stays open behind it. The player strips the URL fragment, so the
       * screen and project ride along as the `pmScreen` / `projectId` launch parameters
       * (`projectAppUrl`) and `Landing` routes to `/project/general?projectId=…`; from there the
       * left navigation reaches the other PM screens. Under `npm run dev` the tab opens the
       * local play URL, never a published app (`resolvePlayAppUrl`).
       */
      case "editProject":
        if (selected) openProjectTab(selected.id);
        return;

      /*
       * Still a new tab, as the canvas `Launch(gblCostAppLaunchUrl, {projectId: …})` was —
       * but of THIS app's own `/costs/capex` route rather than of a second Power Apps app.
       * The project id rides along as a launch parameter because the player strips the
       * fragment before `Landing` reads it.
       */
      case "editCosts":
        if (!selected || blockedByCostLock(selected)) return;
        openInNewTab("/costs/capex", selected.id);
        return;

      case "deleteProject":
        setConfirmDelete(true);
        return;

      // Analytics is still a separate canvas app, so this stays a real external launch. The
      // validation lives entirely in `handleSimulate` / `simulateGate` — see their own comments.
      case "simulateProject":
        if (selected) void handleSimulate(selected);
        return;

      // `If(IsBlank(url), Notify(...), Launch(url))` — the handler's own guard, kept because
      // the command gate and the guard disagreeing is how a live command does nothing.
      case "viewSharepoint":
        launch(selected?.spoSharepointUrl ?? undefined, SPO_MSG.noSharepoint);
        return;

      case "viewTeams":
        launch(selected?.spoTeamsUrl ?? undefined, SPO_MSG.noTeams);
        return;

      case "viewProjectOverviewPowerBI":
        launch(
          powerBiReportUrl({
            reportId: envVars.vsb_ProjectOverviewPowerBIReportID,
            tenantId: envVars.vsb_PowerBITenantID ?? session?.tenantId,
            projectId: selected?.id,
          }),
          REPORT_UNAVAILABLE,
        );
        return;

      // No `filter` and no selection gate: the portfolio report is not project-scoped.
      case "viewPortfolioOverviewPowerBI":
        launch(
          powerBiReportUrl({
            reportId: envVars.vsb_PortfolioOverviewPowerBIReportID,
            tenantId: envVars.vsb_PowerBITenantID ?? session?.tenantId,
          }),
          REPORT_UNAVAILABLE,
        );
        return;

      // `Launch(gblPowerBIDashboardLink)` — a whole link from the environment variable, not
      // a report id, and nothing about it is project-scoped.
      case "viewDashboardFunctionality":
        launch(envVars.vsb_PowerBIDashboardLink, REPORT_UNAVAILABLE);
        return;
    }
  };

  const onConfirmDelete = () => {
    if (!selected) return;
    const { name, id } = selected;
    const messages = deleteMessages(name);
    deletion.mutate({ id, name }, {
      onSuccess: () => {
        setNotice({ intent: "success", text: messages.success });
        // `Set(gblRecordSelectedProject, Blank())` — the row is gone, so nothing is selected.
        setSelectedId(undefined);
      },
      onError: () => setNotice({ intent: "error", text: messages.error }),
      onSettled: () => setConfirmDelete(false),
    });
  };

  /* ── the grid ────────────────────────────────────────────────────────── */

  const page = pageQuery.data;
  const pagerState = {
    page: page?.page ?? criteria.page,
    pageSize: page?.pageSize ?? PAGE_SIZE,
    totalRows: page?.totalRows ?? 0,
    // `loadProjectPage` counts the pages: the canvas `RoundUp(TotalRows / PageSize)` over the two
    // segments paged as one continuous sequence, or the walk's own answer once it has reached the
    // end of the data (D44), which a count alone cannot give.
    ...(page?.totalPages === undefined ? {} : { totalPages: page.totalPages }),
  };
  const labels = pagerLabels(pagerState);
  const showPager = isPagerVisible(pagerState);
  const currentPage = page?.page ?? criteria.page;

  const sortIcon = (col: string) =>
    criteria.sort.col !== col
      ? null
      : criteria.sort.asc
        ? <ArrowSortUpRegular />
        : <ArrowSortDownRegular />;

  const header = (
    label: string,
    col?: string,
    { width, align }: { width?: number; align?: "right" | "center" } = {},
  ) => (
    <TableHeaderCell
      key={label}
      className={mergeClasses(
        align === "right" && styles.numeric,
        align === "center" && styles.centered,
        col && styles.sortable,
      )}
      style={width === undefined ? undefined : { width: `${width}px` }}
      onClick={col ? () => setSort(col) : undefined}
      aria-sort={
        col && criteria.sort.col === col
          ? criteria.sort.asc ? "ascending" : "descending"
          : undefined
      }
    >
      {label}
      {col ? sortIcon(col) : null}
    </TableHeaderCell>
  );

  return (
    <div className={`${styles.page} canvas-project-overview`}>
      {/*
        `Notify()`. The canvas rendered these in the Power Apps frame's own banner, which a code
        app does not have, so they sit at the top of the screen and are dismissible. The delete
        success notification had `NotificationType.Success` with a 1000 ms timeout; it stays up
        here until dismissed or until the next command runs, because a message that names the
        project just deleted is worth more than matching a one-second timer.
      */}
      {notice ? (
        <MessageBar intent={notice.intent} data-testid="notice">
          <MessageBarBody>{notice.text}</MessageBarBody>
          <Button
            appearance="transparent"
            size="small"
            icon={<DismissRegular />}
            aria-label="Dismiss"
            data-testid="notice-dismiss"
            onClick={() => setNotice(undefined)}
          />
        </MessageBar>
      ) : null}

      {/* The command bar belongs to the HEADER band — see CommandSlot.tsx. */}
      <CommandSlot>
        <CommandBar commands={commands} onCommand={onCommand} ariaLabel="Project actions" />
      </CommandSlot>

      {/*
        The seven filters, as the canvas lays them out: FOUR columns of two, not a 4 x 2 grid.
          column 1   Project            · Project Manager
          column 2   Country            · Area/State/Province
          column 3   Technology         · Capacity + operator
          column 4   (empty)            · Status
        Column 4's first cell is genuinely empty in the canvas — it is what puts Status
        underneath nothing rather than beside Technology.
      */}
      <div className={styles.filters}>
        <div className={styles.filterColumn}>
          <FilterCell
            label="Project"
            row="top"
            value={criteria.filter.keyword}
            onClear={() => setFilter({ keyword: "" })}
          >
            <Input
              className={styles.filterControl}
              value={criteria.filter.keyword}
              placeholder="Search for Project Name, Short Name and ID"
              contentBefore={<SearchRegular />}
              onChange={(_, d) => setFilter({ keyword: d.value })}
              aria-label="Project"
              data-testid="filter-keyword"
            />
          </FilterCell>

          {/*
            The Project Manager typeahead — `pcf_..._Filter_ProjectManager`, a PeoplePicker.
            266 px and NO funnel button, which is the one cell that breaks the pattern; it
            clears from the ✕ inside the input instead.
          */}
          <div className={mergeClasses(styles.filterCell, styles.filterCellBottom)}>
            <label className={styles.filterLabel} htmlFor="filter-manager-input">
              Project Manager
            </label>
            <div className={`${styles.filterPerson} canvas-person`}>
              <Input
                id="filter-manager-input"
                className={styles.personInput}
                value={managerQuery}
                placeholder="Search for project manager"
                contentBefore={<SearchRegular />}
                contentAfter={
                  criteria.filter.projectManagerId ? (
                    <Button
                      appearance="transparent"
                      size="small"
                      icon={<DismissRegular />}
                      aria-label="Clear project manager"
                      data-testid="filter-manager-clear"
                      onClick={() => {
                        setManagerQuery("");
                        setFilter({ projectManagerId: null });
                      }}
                    />
                  ) : undefined
                }
                onChange={(_, d) => setManagerQuery(d.value)}
                aria-label="Project Manager"
              data-testid="filter-manager"
              />
              {managerQuery.trim().length >= 2 && !criteria.filter.projectManagerId ? (
                <ul className={styles.suggestions} aria-label="Suggested people">
                  {(managers.data ?? []).map((p) => (
                    <li key={p.id}>
                      <Button
                        appearance="subtle"
                        className={styles.suggestion}
                        aria-labelledby={`filter-manager-suggestion-${p.id}-name`}
                        data-testid={`filter-manager-suggestion-${p.id}`}
                        onClick={() => {
                          setFilter({ projectManagerId: p.id });
                          setManagerQuery(p.label);
                        }}
                      >
                        <span id={`filter-manager-suggestion-${p.id}-name`}>{p.label}</span>
                        {p.mail ? (
                          <span className={styles.suggestionMail}>{p.mail}</span>
                        ) : null}
                      </Button>
                    </li>
                  ))}
                  {managers.isFetching ? <li><Spinner size="tiny" /></li> : null}
                </ul>
              ) : null}
            </div>
          </div>
        </div>

        <div className={styles.filterColumn}>
          <FilterCell
            label="Country"
            row="top"
            value={criteria.filter.countryId}
            onClear={() => setFilter({ countryId: null })}
          >
            <Dropdown
              className={styles.filterControl}
              selectedOptions={criteria.filter.countryId ? [criteria.filter.countryId] : []}
              value={
                countries.data?.find((c) => c.id === criteria.filter.countryId)?.name ?? ""
              }
              placeholder=""
              onOptionSelect={(_, d) => setFilter({ countryId: d.optionValue ?? null })}
              aria-label="Country"
              data-testid="filter-country"
            >
              {(countries.data ?? []).map((c) => (
                <Option key={c.id} value={c.id}>{c.name}</Option>
              ))}
            </Dropdown>
          </FilterCell>

          <FilterCell
            label="Area/State/Province"
            row="bottom"
            value={criteria.filter.areaId}
            onClear={() => setFilter({ areaId: null })}
          >
            <Dropdown
              className={styles.filterControl}
              // The canvas filtered CountryAreas by the chosen country, so Area means nothing
              // until a Country is picked.
              disabled={!criteria.filter.countryId}
              selectedOptions={criteria.filter.areaId ? [criteria.filter.areaId] : []}
              value={areas.data?.find((a) => a.id === criteria.filter.areaId)?.name ?? ""}
              placeholder={criteria.filter.countryId ? "" : "Select a country first"}
              onOptionSelect={(_, d) => setFilter({ areaId: d.optionValue ?? null })}
              aria-label="Area/State/Province"
              data-testid="filter-area"
            >
              {(areas.data ?? []).map((a) => (
                <Option key={a.id} value={a.id}>{a.name}</Option>
              ))}
            </Dropdown>
          </FilterCell>
        </div>

        <div className={styles.filterColumn}>
          <FilterCell
            label="Technology"
            row="top"
            value={criteria.filter.technology}
            onClear={() => setFilter({ technology: null })}
          >
            <Dropdown
              className={styles.filterControl}
              selectedOptions={
                criteria.filter.technology === null ? [] : [String(criteria.filter.technology)]
              }
              value={
                criteria.filter.technology === null
                  ? ""
                  : TECHNOLOGY_LABEL[criteria.filter.technology] ?? ""
              }
              placeholder=""
              onOptionSelect={(_, d) =>
                setFilter({ technology: d.optionValue ? Number(d.optionValue) : null })
              }
              aria-label="Technology"
              data-testid="filter-technology"
            >
              {Object.entries(TECHNOLOGY_LABEL).map(([value, label]) => (
                <Option key={value} value={value}>{label}</Option>
              ))}
            </Dropdown>
          </FilterCell>

          {/*
            Capacity is two controls in one cell: the 100 px value, then the operator in what
            is left. Its error message sits on the caption line, as
            `lbl_..._Filter_Capacity_ErrorMessage` does, not under the input.
          */}
          <div className={mergeClasses(styles.filterCell, styles.filterCellBottom)}>
            <label className={styles.filterLabel} htmlFor="filter-capacity-input">
              Capacity
              {capacityMessage ? (
                <span id="filter-capacity-error" className={styles.filterError} role="alert">
                  {capacityMessage}
                </span>
              ) : null}
            </label>
            <div className={styles.filterRow}>
              <div className={styles.capacityGroup}>
                <Input
                  id="filter-capacity-input"
                  className={styles.capacityValue}
                  value={criteria.filter.capacity}
                  onChange={(_, d) => setFilter({ capacity: d.value })}
                  aria-invalid={capacityMessage ? true : undefined}
                  aria-describedby={capacityMessage ? "filter-capacity-error" : undefined}
                  aria-label="Capacity"
                  data-testid="filter-capacity"
                />
                <Dropdown
                  className={styles.filterControl}
                  selectedOptions={
                    criteria.filter.capacityOperator ? [criteria.filter.capacityOperator] : []
                  }
                  value={criteria.filter.capacityOperator}
                  placeholder="Select operator"
                  onOptionSelect={(_, d) =>
                    setFilter({ capacityOperator: (d.optionValue as CapacityOperator) ?? "" })
                  }
                  aria-label="Select operator"
                  data-testid="filter-capacity-operator"
                >
                  {CAPACITY_OPERATORS.map((op) => (
                    <Option key={op} value={op}>{op}</Option>
                  ))}
                </Dropdown>
              </div>
              <ClearFilterButton
                field="Capacity"
                value={criteria.filter.capacity}
                onClear={() => setFilter({ capacity: "" })}
              />
            </div>
          </div>
        </div>

        <div className={styles.filterColumn}>
          {/* `con_Main_Project_Overview_Context_Filter_Empty` — a real, empty 280 x 56 cell. */}
          <div
            className={mergeClasses(styles.filterCell, styles.filterCellTop)}
            aria-hidden="true"
          />

          <FilterCell
            label="Status"
            row="bottom"
            value={criteria.filter.clusterStateId}
            onClear={() => setFilter({ clusterStateId: null })}
          >
            <Dropdown
              className={styles.filterControl}
              selectedOptions={
                criteria.filter.clusterStateId ? [criteria.filter.clusterStateId] : []
              }
              value={
                states.data?.find((s) => s.id === criteria.filter.clusterStateId)?.name ?? ""
              }
              placeholder=""
              onOptionSelect={(_, d) => setFilter({ clusterStateId: d.optionValue ?? null })}
              aria-label="Status"
              data-testid="filter-status"
            >
              {(states.data ?? []).map((s) => (
                <Option key={s.id} value={s.id}>{s.name}</Option>
              ))}
            </Dropdown>
          </FilterCell>
        </div>
      </div>

      {/*
        ── the grid ──────────────────────────────────────────────────────
        Wrapped so this region, not the footer, absorbs the leftover height. Whatever is in
        here — rows, a spinner, an empty state, an error — the pager stays on the bottom edge.
      */}
      <div className={styles.body}>
      {pageQuery.isLoading ? (
        /*
         * The app's FIRST load is the canvas' full-screen wait card, not a small inline spinner
         * in an otherwise-empty grid — `AppLoadingScreen.png`: the 500 x 240 white card on a
         * dimmed ground with "Please wait...". `LoadingOverlay`'s blocking mode already is that
         * card, transcribed from `cmp_PopUp_Loading`; the overview simply was not using it.
         */
        <LoadingOverlay label="Please wait..." />
      ) : pageQuery.isError ? (
        <div className={styles.bodyMessage}>
          <EmptyState
            title="Projects could not be loaded"
            description={
              pageQuery.error instanceof Error
                ? pageQuery.error.message
                : String(pageQuery.error)
            }
          />
        </div>
      ) : rows.length === 0 ? (
        <div className={styles.bodyMessage}>
          <EmptyState
            title="No project matches these filters"
            {...(isFilterActive(criteria.filter)
              ? { action: { label: "Clear all filters", onClick: clearFilter } }
              : {})}
          />
        </div>
      ) : (
        <div className={styles.gridWrap}>
          <Table size="small" aria-label="Projects" className={styles.table}>
            <TableHeader>
              <TableRow>
                <TableHeaderCell
                  className={styles.selectCell}
                  style={{ width: `${COLUMN_WIDTH.select}px` }}
                />
                <TableHeaderCell
                  className={styles.accentCell}
                  style={{ width: `${COLUMN_WIDTH.accent}px` }}
                />
                {header("Project Name", COL.name, { width: COLUMN_WIDTH.name })}
                {header("Short Name", COL.shortName, { width: COLUMN_WIDTH.shortName })}
                {header("Status", undefined, { width: COLUMN_WIDTH.status })}
                {header("Project Manager", undefined, { width: COLUMN_WIDTH.manager })}
                {header("Country", undefined, { width: COLUMN_WIDTH.country })}
                {header("Area/State/Province/Voivodeship", undefined, { width: COLUMN_WIDTH.area })}
                {header("Technology", COL.technology, { width: COLUMN_WIDTH.technology })}
                {header("Capacity [MW(p)]", COL.totalCapacity,
                  { width: COLUMN_WIDTH.capacity, align: "right" })}
                {header("Project ID", COL.internalProjectId,
                  { width: COLUMN_WIDTH.projectId, align: "right" })}
                {header("Approval", COL.approvalState,
                  { width: COLUMN_WIDTH.approval, align: "center" })}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, index) => (
                <ProjectGridRow
                  key={row.id}
                  row={row}
                  selected={row.id === selectedId}
                  alternate={index % 2 === 0}
                  // The state setter itself, which React keeps stable, so the memoised row is
                  // not handed a new function on every render of the screen.
                  onSelect={setSelectedId}
                  locale={locale}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      </div>

      {/* ── footer: Total Rows then the pager, both left ───────────────── */}
      <div className={styles.footer}>
        <Text data-testid="total-rows" className={styles.totalRows}>{labels.totalRows}</Text>
        {/*
          `con_..._Pagination_Buttons.Visible = If(TotalPages > 1, true, false)` — a single
          page has no pager and no "Page: 1 from 1" caption at all, which is what the filtered
          screenshot shows: `Total Rows: 1` on its own, the control strip gone rather than
          greyed. `Total Rows` is its own label and stays either way.
        */}
        {showPager ? (
          <>
            <Button
              appearance="primary"
              className={styles.iconButton}
              icon={<ArrowPreviousRegular />}
              aria-label="First page"
              // `ico_Main_Project_Overview_Context_Pagination_FirstPage.Tooltip: ="Navigate to
              // first page"` (Project Main Screen.pa.yaml:2139) — verbatim.
              title="Navigate to first page"
              data-testid="ico_Main_Project_Overview_Context_Pagination_FirstPage"
              // Canvas (line 2117):
              //   `DisplayMode: =If(First(colFiltersOverview).Page>1,DisplayMode.Edit,DisplayMode.Disabled)`
              // ported as-is; `|| pageQuery.isFetching` only stops a double-dispatch while the
              // page this app actually fetches is in flight (the canvas pager is event-driven).
              disabled={currentPage <= 1 || pageQuery.isFetching}
              onClick={() => setPage(1)}
            />
            <Button
              appearance="primary"
              className={styles.iconButton}
              icon={<ArrowLeftRegular />}
              aria-label="Previous page"
              // `ico_Main_Project_Overview_Context_Pagination_PageLeft.Tooltip: ="Navigate to
              // previous page"` (Project Main Screen.pa.yaml:2173) — verbatim.
              title="Navigate to previous page"
              data-testid="ico_Main_Project_Overview_Context_Pagination_PageLeft"
              // Canvas (line 2147): same `Page>1` gate as First Page, ported as-is.
              disabled={currentPage <= 1 || pageQuery.isFetching}
              onClick={() => setPage(currentPage - 1)}
            />
            <Text data-testid="page-label">{labels.page}</Text>
            <Button
              appearance="primary"
              className={styles.iconButton}
              icon={<ArrowRightRegular />}
              aria-label="Next page"
              // `ico_Main_Project_Overview_Context_Pagination_PageRight.Tooltip: ="Navigate to
              // next page"` (Project Main Screen.pa.yaml:2226) — verbatim.
              title="Navigate to next page"
              data-testid="ico_Main_Project_Overview_Context_Pagination_PageRight"
              /*
                DIVERGENCE: this app implements the canvas's COMMENTED-OUT formula, not its live
                one — CONVENTIONS rule 10 in reverse, so it is marked here rather than left to
                look like a porting slip.

                `ico_Main_Project_Overview_Context_Pagination_PageRight.DisplayMode`
                (Project Main Screen.pa.yaml:2191-2200) carries both:

                  commented out (line 2192):
                    //If(psf_MainScreen_DetailList_Container_FluentDetailsList.HasNextPage,
                    //  DisplayMode.Edit,DisplayMode.Disabled)

                  LIVE (lines 2193-2200):
                    With(
                        {varRecPage: First(colFiltersOverview)},
                        If(
                            varRecPage.Page < varRecPage.TotalPages,
                            DisplayMode.Edit,
                            DisplayMode.Disabled
                        )
                    )

                The live formula derives "is there a next page" from TotalPages, which this app
                computes from `@odata.count` — and the platform caps that count at 5000 rows. The
                dead formula asks the grid whether the SERVER handed back a next-page token, which
                is always the truth for forward-only paging. So the token wins: `page.hasNext`.

                Consequence, and the reason this is recorded rather than silently "better" (D41):
                `hasNext` is token-derived while `totalPages` starts out count-derived. Until
                D44 that let the label read "Page: 25 from 26" (beyond the 5,000-row cap, or with
                a count above what the walk really found) with Next already disabled. Since D44
                `loadProjectPage` takes the page count from the walk once it has ended at the
                data, and never lets it drop below the page served, so on the real last page the
                label reads "Page: N from N" and Next is disabled. A count can still overstate the
                pages not reached yet; the total corrects itself on arrival. See D41 and D44 in
                `ProjectDocs/app-docs/02-OPEN-DECISIONS.md`.
              */
              disabled={!(page?.hasNext ?? false) || pageQuery.isFetching}
              onClick={() => setPage(currentPage + 1)}
            />
          </>
        ) : null}
        {pageQuery.isFetching ? <Spinner size="tiny" aria-label="Loading" /> : null}
      </div>

      {/*
        ── the cost-module lock ──────────────────────────────────────────
        `con_Main_PopUp_Common_Generators_PreventTotalCapacity_Information_2`. Not a
        confirmation — one `Close` button, no destructive action, nothing to cancel — so it is
        its own dialog rather than a `ConfirmDialog` with a second button invented for it.
      */}
      <Dialog
        open={lock !== null}
        onOpenChange={(_, d) => { if (!d.open) setLock(null); }}
      >
        <DialogSurface>
          <DialogBody>
            <DialogTitle>{COST_LOCK.title(lock?.name ?? "")}</DialogTitle>
            <DialogContent>
              <Text block>{COST_LOCK.intro}</Text>
              {/* A real list, so a screen reader announces the count. The canvas carried the
                  bullet glyph inside each label; `COST_LOCK.bullet` keeps that string
                  available for anywhere the literal is wanted. */}
              <ul className={styles.lockList}>
                {(lock?.sections ?? []).map((section) => (
                  <li key={section}>{section}</li>
                ))}
              </ul>
            </DialogContent>
            <DialogActions>
              <Button appearance="primary" onClick={() => setLock(null)}
                aria-label={COST_LOCK.close}
                data-testid="btn_PopUp_Common_Generators_PreventTotalCapacity_Information_Close_2">
                {COST_LOCK.close}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      {/*
        ── the delete confirmation ───────────────────────────────────────
        `cmp_Project_PopUp_ConfirmationDeleteProject`. Its `IconRightButton` is `Trash` and its
        `IconLeftButton` is `Cancel`, which are this component's `delete` and `dismiss`.
      */}
      <ConfirmDialog
        open={confirmDelete}
        title={DELETE_DIALOG.title}
        description={DELETE_DIALOG.description(selected?.name ?? "")}
        confirmText={DELETE_DIALOG.confirmText}
        cancelText={DELETE_DIALOG.cancelText}
        destructive
        busy={deletion.isPending}
        confirmIcon="delete"
        cancelIcon="dismiss"
        onConfirm={onConfirmDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}

/* ────────────────────────────────────────────────────────── sub-components */

/**
 * A filter with its funnel button — `con_..._Filter_<field>` plus
 * `ico_..._Filter_<field>`, which the canvas disabled while its filter was blank.
 *
 * The label sits ABOVE the control and the funnel beside it, which is why this is a column
 * containing a row rather than one flex line: with all three on one line the label pushed the
 * control off its 232 px and the funnel ended up against the screen edge.
 */
function FilterCell({
  label, value, onClear, row, children,
}: {
  label: string;
  value: unknown;
  onClear: () => void;
  /** Which of its column's two cells this is — they differ in height and control offset. */
  row: "top" | "bottom";
  children: React.ReactNode;
}) {
  const styles = useStyles();
  return (
    <div
      className={mergeClasses(
        styles.filterCell,
        row === "top" ? styles.filterCellTop : styles.filterCellBottom,
      )}
    >
      <Text as="span" block className={styles.filterLabel}>{label}</Text>
      <div className={styles.filterRow}>
        {children}
        <ClearFilterButton field={label} value={value} onClear={onClear} />
      </div>
    </div>
  );
}

/** The canvas funnel icon's control name, per filter caption. */
const CLEAR_FILTER_TESTID: Record<string, string> = {
  "Project": "ico_Main_Project_Overview_Context_Filter_ProjectKeyword",
  "Country": "ico_Main_Project_Overview_Context_Filter_Country",
  "Area/State/Province": "ico_Main_Project_Overview_Context_Filter_Area",
  "Technology": "ico_Main_Project_Overview_Context_Filter_Texnology",
  "Capacity": "ico_Main_Project_Overview_Context_Filter_Capacity",
  "Status": "ico_Main_Project_Overview_Context_Filter_Status",
};

function ClearFilterButton({
  field, value, onClear,
}: { field: string; value: unknown; onClear: () => void }) {
  const styles = useStyles();
  const { active, disabled } = clearIconState(value);
  return (
    <Tooltip content={active ? "Clear this filter" : "Nothing to clear"} relationship="label">
      <Button
        className={styles.iconButton}
        appearance="primary"
        disabled={disabled}
        icon={active ? <FilterDismissRegular /> : <FilterRegular />}
        /*
         * Tosca rule 1, and rule 2's uniqueness point: the tooltip names all SEVEN of these
         * buttons "Clear this filter", which is the identical-fingerprint case the live scan
         * flagged as "N items are not unique" on the radio groups. Naming each one after the
         * field it clears makes it distinguishable without putting a value in the label.
         */
        aria-label={`Clear ${field} filter`}
        data-testid={CLEAR_FILTER_TESTID[field]}
        onClick={onClear}
      />
    </Tooltip>
  );
}

/**
 * One grid row, memoised.
 *
 * Every prop is stable between renders of the screen: `row` keeps its identity through
 * TanStack's structural sharing, `selected`/`alternate` are booleans, `locale` a string and
 * `onSelect` the state setter. So a row re-renders only when its own data or selection changes,
 * not each time `isFetching` flips or another row is picked — on a 200-row page that is the
 * difference between one row and two hundred.
 */
const ProjectGridRow = memo(function ProjectGridRow({
  row, selected, alternate, onSelect, locale,
}: {
  row: ProjectRow;
  selected: boolean;
  alternate: boolean;
  onSelect: (id: string) => void;
  locale: string;
}) {
  const styles = useStyles();
  const decoration = approvalDecoration(row.approvalState);
  const select = () => onSelect(row.id);
  return (
    <TableRow
      className={mergeClasses(alternate && styles.rowAlt, selected && styles.rowSelected)}
      onClick={select}
      aria-selected={selected}
    >
      <TableCell className={styles.selectCell}>
        {/* A native radio, so the whole list is one tab stop with arrow-key navigation —
            which is what 275 of the canvas app's accessibility findings were about. */}
        <input
          type="radio"
          className={styles.radio}
          name="selectedProject"
          checked={selected}
          onChange={select}
          aria-label={`Select ${row.name}`}
          data-testid={`select-${row.id}`}
        />
      </TableCell>
      <TableCell className={styles.accentCell}>
        {row.accentColor ? (
          <span
            className={styles.accent}
            style={{ backgroundColor: row.accentColor }}
            aria-hidden="true"
          />
        ) : null}
      </TableCell>
      <TableCell>{row.name || "-"}</TableCell>
      <TableCell>{row.shortName || "-"}</TableCell>
      <TableCell>{row.statusName || "-"}</TableCell>
      <TableCell>{row.managerName || "-"}</TableCell>
      <TableCell>{row.countryName || "-"}</TableCell>
      <TableCell>{row.areaName || "-"}</TableCell>
      <TableCell>{row.technology || "-"}</TableCell>
      <TableCell className={styles.numeric}>
        {formatCapacity(row.totalCapacity, locale) || "-"}
      </TableCell>
      <TableCell className={styles.numeric}>{row.internalProjectId || "-"}</TableCell>
      <TableCell className={styles.centered}>
        {/*
          The reference renders the approval state as a coloured glyph and NO text — the
          canvas `loc_iconstate` Switch produced icon:SkypeCircleCheck / icon:StatusErrorFull
          / icon:StatusCircleOuter. The label is the accessible name, so a screen reader still
          announces "Approved" where a sighted user reads the colour.
        */}
        <span
          className={styles.approval}
          role="img"
          aria-label={row.approvalLabel || "No approval state"}
          title={row.approvalLabel}
          style={{ color: decoration.color }}
        >
          {/* A blank state had no `Switch` branch in the canvas, so it shows no glyph. */}
          {row.approvalState === null ? null : APPROVAL_ICON[decoration.icon]}
        </span>
      </TableCell>
    </TableRow>
  );
});
