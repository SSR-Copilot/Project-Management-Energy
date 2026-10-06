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
 *   Add Project    → `/projects/new`, which is General Data's New Project state. Screen #9 is
 *                    not migrated, so the route renders a not-yet-built notice for now.
 *   Edit Project   → `/projects/:projectId/general`. Same screen, same caveat. The canvas
 *                    forked on `gblProduction` and RELAUNCHED the whole app in the player;
 *                    one app now, so it is plain client-side routing.
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
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { appTabUrl } from "@/app/deepLinks";
import {
  NEW_PROJECT_PATH, analyticsAppUrl, powerBiReportUrl, projectGeneralDataPath,
} from "@/app/navigation";
import {
  Button, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle,
  Dropdown, Field, Input, MessageBar, MessageBarBody, Option, Spinner, Table, TableBody,
  TableCell, TableHeader, TableHeaderCell, TableRow, Text, Tooltip, makeStyles, mergeClasses,
  tokens,
} from "@fluentui/react-components";
import {
  ArrowSortDownRegular, ArrowSortUpRegular, ChevronLeftRegular, ChevronRightRegular,
  ChevronDoubleLeftRegular, DismissRegular, FilterRegular, FilterDismissRegular,
  SearchRegular,
} from "@fluentui/react-icons";
import {
  CommandBar, CommandSlot, ConfirmDialog, EmptyState, LoadingOverlay, type Command,
} from "@/components";
import { useSession } from "@/app/SessionContext";
import { parseMailList } from "@/data/project";
import { media, palette, space } from "@/theme/tokens";
import { approvalDecoration, TECHNOLOGY_LABEL } from "@/domain/project";
import {
  CAPACITY_OPERATORS, COL, COST_LOCK, DELETE_DIALOG, OPEN_FAILED, PAGE_SIZE,
  REPORT_UNAVAILABLE, SPO_MSG,
  capacityError, clearIconState, commandBarState, costModuleLock, deleteMessages,
  formatCapacity, isCostModuleLocked, isFilterActive, isPagerVisible, pagerLabels,
  type CapacityOperator, type CommandKey, type ProjectRow, type SelectedProject,
} from "./rules";
import {
  useCountries, useCountryAreas, useCriteria, useDeleteProject, useProjectManagerSearch,
  useProjectPage, useProjectStateOrder, useProjectStates,
} from "./hooks";

/* ────────────────────────────────────────────────────────────────── styles */

const useStyles = makeStyles({
  /**
   * `flex: 1` so the screen owns the whole content area — which is what keeps the footer at
   * the BOTTOM instead of riding up under a short grid or an empty state.
   */
  page: {
    display: "flex", flexDirection: "column", gap: space.m,
    flex: 1, minWidth: 0, minHeight: 0,
  },
  /**
   * Everything between the filters and the footer. Takes the slack, so `Total Rows` and the
   * pager sit on the bottom edge whether the grid is full, short, empty or erroring.
   */
  body: { flex: 1, minHeight: 0, display: "flex", flexDirection: "column" },

  /*
   * ── the filter card ──────────────────────────────────────────────────────────────────
   * `con_Main_Project_Overview_Context_Filter`, transcribed from the running canvas app:
   *
   *   card      horizontal auto-layout, `gap: 6px`, `border-radius: 4px`, transparent fill,
   *             `box-shadow: 0 1px 2px rgba(0,0,0,.14), 0 0 2px rgba(0,0,0,.12)`, height 124
   *   column    `flex: 1 0 auto; min-width: 250px`, vertical, gap 0 — FOUR of them
   *   cell      280 px wide; the first in each column 56 px tall, the second 68 px
   *   label     24 px tall, 10 pt (13.33 px), `rgb(50, 49, 48)`, 5 px padding, line-height 1.2
   *   control   232 px wide at x=6, so it ends at 238
   *   funnel    32 x 32 at x=245 — a 7 px gap after the control
   *
   * The four columns are real columns, not a 4 x 2 grid: collapsing a grid to two columns
   * would reflow row-major and split Capacity from its operator and Project from its manager.
   * As columns, a narrow viewport wraps whole pairs, which is what the canvas auto-layout did.
   */
  filters: {
    display: "flex",
    flexFlow: "row wrap",
    gap: "6px",
    flex: "none",
    minWidth: 0,
    borderRadius: "4px",
    backgroundColor: palette.white,
    boxShadow: "0 1px 2px rgba(0, 0, 0, 0.14), 0 0 2px rgba(0, 0, 0, 0.12)",
    paddingTop: "2px", paddingRight: "2px", paddingBottom: "2px", paddingLeft: "2px",
  },
  filterColumn: {
    display: "flex", flexDirection: "column", rowGap: "4px",
    flexGrow: 1, flexShrink: 0, flexBasis: "auto",
    minWidth: "250px",
    [media.belowSm]: { minWidth: 0, flexBasis: "100%" },
  },
  /** One labelled filter. 280 px in the canvas, and never wider. */
  filterCell: {
    width: "280px", maxWidth: "100%",
    paddingLeft: "6px", paddingRight: "6px",
    boxSizing: "border-box",
  },
  /** `lbl_..._Filter_*` — 10 pt, `rgb(50, 49, 48)`, in a 24 px line box. */
  filterLabel: {
    display: "block",
    fontSize: "13.33px",
    lineHeight: "1.2",
    color: "#323130",
    paddingTop: "2px", paddingBottom: "3px",
  },
  /** The control and its funnel, with the canvas's 7 px between them. */
  filterRow: { display: "flex", alignItems: "center", gap: "7px", minWidth: 0 },
  /** 232 px, so the funnel lands where the canvas puts it rather than at the screen edge. */
  filterControl: { width: "232px", maxWidth: "100%", minWidth: 0 },
  /** `pcf_..._ProjectManager` is 266 px and carries NO funnel. */
  filterPerson: { width: "266px", maxWidth: "100%", minWidth: 0, position: "relative" },
  /** `txt_..._Capacity` is 100 px; `cbx_..._Capacity_Operator` is 128 px, 6 px after it. */
  capacityValue: { width: "100px", flexGrow: 0, flexShrink: 1, minWidth: 0 },
  capacityOperator: { width: "128px", flexGrow: 0, flexShrink: 1, minWidth: 0 },

  gridWrap: { flex: 1, minHeight: 0, overflow: "auto" },
  accentCell: { width: "6px", paddingLeft: 0, paddingRight: 0 },
  accent: { display: "block", width: "4px", height: "22px", borderRadius: "2px" },
  selectCell: { width: "44px" },
  numeric: { textAlign: "right", fontVariantNumeric: "tabular-nums" },
  sortable: { cursor: "pointer", userSelect: "none" },
  /** `AlternateRowColor: =gblAppTheme.palette.themeLighter` on the canvas details list. */
  rowAlt: { backgroundColor: palette.themeLighterAlt },
  rowSelected: { backgroundColor: palette.themeLighter },
  /**
   * Total Rows and the pager sit together at the LEFT, as in the reference.
   *
   * `flex: none` with `body` taking the slack above it: the strip belongs to the bottom edge
   * of the screen, not to the bottom of the rows. With a short, empty or failed grid it used
   * to ride up and sit under the message, which read as part of the message.
   */
  footer: {
    display: "flex", alignItems: "center", gap: space.s, flexWrap: "wrap",
    flex: "none",
    paddingTop: space.s,
    borderTopWidth: "1px",
    borderTopStyle: "solid",
    borderTopColor: tokens.colorNeutralStroke2,
  },
  /** An empty or failed grid fills the same space the rows would have. */
  bodyMessage: {
    flex: 1, minHeight: 0,
    display: "flex", flexDirection: "column", justifyContent: "center",
  },
  footerGap: { width: space.xl },
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
  approval: { display: "inline-flex", alignItems: "center", gap: space.xs },
  dot: {
    display: "inline-block", width: "12px", height: "12px", borderRadius: "50%",
    flexShrink: 0,
  },
});

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
  /** `locPreventEditCostPopUp` — the cost-module lock, shared by Edit Costs and Simulate. */
  const [lock, setLock] = useState<{ name: string; sections: string[] } | null>(null);
  /** `locProjectDelitionDialog` (the canvas's own spelling). */
  const [confirmDelete, setConfirmDelete] = useState(false);
  /** What the canvas said with `Notify()`. */
  const [notice, setNotice] = useState<{ intent: "success" | "error" | "info"; text: string }>();

  const pageQuery = useProjectPage({ criteria, locale });
  const countries = useCountries();
  const areas = useCountryAreas(criteria.filter.countryId);
  const states = useProjectStates();
  const managers = useProjectManagerSearch(managerQuery);

  const rows = pageQuery.data?.rows ?? [];
  const selected = rows.find((r) => r.id === selectedId);
  const stateOrder = useProjectStateOrder(selected?.clusterStateId ?? null);
  const deletion = useDeleteProject(pageQuery.pageKey);

  /* ── command bar ─────────────────────────────────────────────────────── */

  const analyticsAppUsers = useMemo(
    () => parseMailList(envVars.vsb_AnalyticsAppUsers),
    [envVars.vsb_AnalyticsAppUsers],
  );

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
        analyticsAppUsers,
      }),
    [selectedForGates, session?.userPrincipalName, analyticsAppUsers],
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
   * `locPreventEditCostPopUp` — the gate Edit Costs and Simulate share.
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
   * `Edit Project` and `Edit Costs` both do this, so the portfolio list stays open behind
   * them with its filter, page and selection untouched. `Add Project` deliberately does not:
   * creating a project continues in place.
   */
  const openInNewTab = (path: string, projectId?: string) => {
    try {
      launch(
        appTabUrl({
          currentUrl: window.location.href,
          ...(session?.appUrl === undefined ? {} : { appUrl: session.appUrl }),
          path,
          ...(projectId === undefined ? {} : { projectId }),
        }),
        OPEN_FAILED,
      );
    } catch {
      setNotice({ intent: "error", text: OPEN_FAILED });
    }
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

      case "editProject":
        if (selected) openInNewTab(projectGeneralDataPath(selected.id));
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

      /*
       * Analytics is still a separate canvas app, so this stays a real external launch. The
       * Draft check is the canvas's own second guard and is unreachable through the command
       * bar — `ItemEnabled` already requires `'Cluster State'.Order > 0` — but it is what the
       * handler does, and the two gates drifting apart is the defect it guards against.
       */
      case "simulateProject":
        if (!selected || blockedByCostLock(selected)) return;
        launch(
          analyticsAppUrl({
            environmentId: session?.environmentId,
            analyticsAppId: envVars.vsb_AnalyticsAppID,
            tenantId: session?.tenantId,
            projectId: selected.id,
          }),
          "Simulation is not configured for this environment.",
        );
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
    // The two segments do not divide evenly, so the server counts the pages.
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

  const header = (label: string, col?: string, numeric = false) => (
    <TableHeaderCell
      key={label}
      className={mergeClasses(numeric && styles.numeric, col && styles.sortable)}
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
            value={criteria.filter.keyword}
            onClear={() => setFilter({ keyword: "" })}
          >
            <Input
              className={styles.filterControl}
              value={criteria.filter.keyword}
              placeholder="Search for Project Name, Short Name and ID"
              contentBefore={<SearchRegular />}
              onChange={(_, d) => setFilter({ keyword: d.value })}
              data-testid="filter-keyword"
            />
          </FilterCell>

          {/*
            The Project Manager typeahead — `pcf_..._Filter_ProjectManager`, a PeoplePicker.
            266 px and NO funnel button, which is the one cell that breaks the pattern; it
            clears from the ✕ inside the input instead.
          */}
          <div className={styles.filterCell}>
            <label className={styles.filterLabel} htmlFor="filter-manager-input">
              Project Manager
            </label>
            <div className={styles.filterPerson}>
              <Input
                id="filter-manager-input"
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
                      onClick={() => {
                        setManagerQuery("");
                        setFilter({ projectManagerId: null });
                      }}
                    />
                  ) : undefined
                }
                onChange={(_, d) => setManagerQuery(d.value)}
                data-testid="filter-manager"
              />
              {managerQuery.trim().length >= 2 && !criteria.filter.projectManagerId ? (
                <ul className={styles.suggestions} aria-label="Suggested people">
                  {(managers.data ?? []).map((p) => (
                    <li key={p.id}>
                      <Button
                        appearance="subtle"
                        className={styles.suggestion}
                        onClick={() => {
                          setFilter({ projectManagerId: p.id });
                          setManagerQuery(p.label);
                        }}
                      >
                        <span>{p.label}</span>
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
              data-testid="filter-country"
            >
              {(countries.data ?? []).map((c) => (
                <Option key={c.id} value={c.id}>{c.name}</Option>
              ))}
            </Dropdown>
          </FilterCell>

          <FilterCell
            label="Area/State/Province"
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
              data-testid="filter-technology"
            >
              {Object.entries(TECHNOLOGY_LABEL).map(([value, label]) => (
                <Option key={value} value={value}>{label}</Option>
              ))}
            </Dropdown>
          </FilterCell>

          {/* Capacity is two controls in one cell: 100 px value, then a 128 px operator. */}
          <div className={styles.filterCell}>
            <label className={styles.filterLabel} htmlFor="filter-capacity-input">
              Capacity
            </label>
            <div className={styles.filterRow}>
              <Field
                className={styles.capacityValue}
                validationState={
                  capacityError(criteria.filter.capacity, locale) ? "error" : "none"
                }
                validationMessage={capacityError(criteria.filter.capacity, locale) ?? undefined}
              >
                <Input
                  id="filter-capacity-input"
                  value={criteria.filter.capacity}
                  onChange={(_, d) => setFilter({ capacity: d.value })}
                  data-testid="filter-capacity"
                />
              </Field>
              <Dropdown
                className={styles.capacityOperator}
                selectedOptions={
                  criteria.filter.capacityOperator ? [criteria.filter.capacityOperator] : []
                }
                value={criteria.filter.capacityOperator}
                placeholder="Select operator"
                onOptionSelect={(_, d) =>
                  setFilter({ capacityOperator: (d.optionValue as CapacityOperator) ?? "" })
                }
                data-testid="filter-capacity-operator"
              >
                {CAPACITY_OPERATORS.map((op) => (
                  <Option key={op} value={op}>{op}</Option>
                ))}
              </Dropdown>
              <ClearFilterButton
                value={criteria.filter.capacity}
                onClear={() => setFilter({ capacity: "" })}
              />
            </div>
          </div>
        </div>

        <div className={styles.filterColumn}>
          {/* `con_Main_Project_Overview_Context_Filter_Empty` — a real, empty 280 x 56 cell. */}
          <div className={styles.filterCell} aria-hidden="true" />

          <FilterCell
            label="Status"
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
          <Table size="small" aria-label="Projects">
            <TableHeader>
              <TableRow>
                <TableHeaderCell className={styles.selectCell} />
                <TableHeaderCell className={styles.accentCell} />
                {header("Project Name", COL.name)}
                {header("Short Name", COL.shortName)}
                {header("Status")}
                {header("Project Manager")}
                {header("Country")}
                {header("Area/State/Province/Voivodeship")}
                {header("Technology", COL.technology)}
                {header("Capacity [MW(p)]", COL.totalCapacity, true)}
                {header("Project ID", COL.internalProjectId)}
                {header("Approval", COL.approvalState)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, index) => (
                <ProjectGridRow
                  key={row.id}
                  row={row}
                  selected={row.id === selectedId}
                  alternate={index % 2 === 1}
                  onSelect={() => setSelectedId(row.id)}
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
        <Text data-testid="total-rows">{labels.totalRows}</Text>
        {/*
          `con_..._Pagination_Buttons.Visible = If(TotalPages > 1, true, false)` — a single
          page has no pager and no "Page: 1 from 1" caption at all, which is what the filtered
          screenshot shows: `Total Rows: 1` on its own, the control strip gone rather than
          greyed. `Total Rows` is its own label and stays either way.
        */}
        {showPager ? (
          <>
            <span className={styles.footerGap} />
            <Button
              appearance="subtle"
              icon={<ChevronDoubleLeftRegular />}
              aria-label="First page"
              disabled={currentPage <= 1 || pageQuery.isFetching}
              onClick={() => setPage(1)}
            />
            <Button
              appearance="subtle"
              icon={<ChevronLeftRegular />}
              aria-label="Previous page"
              disabled={currentPage <= 1 || pageQuery.isFetching}
              onClick={() => setPage(currentPage - 1)}
            />
            <Text data-testid="page-label">{labels.page}</Text>
            <Button
              appearance="subtle"
              icon={<ChevronRightRegular />}
              aria-label="Next page"
              // Forward-only paging knows whether a next page exists from the server's token,
              // which is more reliable than deriving it from a count the platform caps at 5000.
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
              <Button appearance="primary" onClick={() => setLock(null)}>
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
  label, value, onClear, children,
}: {
  label: string;
  value: unknown;
  onClear: () => void;
  children: React.ReactNode;
}) {
  const styles = useStyles();
  return (
    <div className={styles.filterCell}>
      <Text as="span" block className={styles.filterLabel}>{label}</Text>
      <div className={styles.filterRow}>
        {children}
        <ClearFilterButton value={value} onClear={onClear} />
      </div>
    </div>
  );
}

function ClearFilterButton({ value, onClear }: { value: unknown; onClear: () => void }) {
  const { active, disabled } = clearIconState(value);
  return (
    <Tooltip content={active ? "Clear this filter" : "Nothing to clear"} relationship="label">
      <Button
        appearance="subtle"
        disabled={disabled}
        icon={active ? <FilterDismissRegular /> : <FilterRegular />}
        onClick={onClear}
      />
    </Tooltip>
  );
}

function ProjectGridRow({
  row, selected, alternate, onSelect, locale,
}: {
  row: ProjectRow;
  selected: boolean;
  alternate: boolean;
  onSelect: () => void;
  locale: string;
}) {
  const styles = useStyles();
  const decoration = approvalDecoration(row.approvalState);
  return (
    <TableRow
      className={mergeClasses(alternate && styles.rowAlt, selected && styles.rowSelected)}
      onClick={onSelect}
      aria-selected={selected}
    >
      <TableCell className={styles.selectCell}>
        {/* A native radio, so the whole list is one tab stop with arrow-key navigation —
            which is what 275 of the canvas app's accessibility findings were about. */}
        <input
          type="radio"
          name="selectedProject"
          checked={selected}
          onChange={onSelect}
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
      <TableCell>{row.internalProjectId || "-"}</TableCell>
      <TableCell>
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
        >
          <span className={styles.dot} style={{ backgroundColor: decoration.color }} />
        </span>
      </TableCell>
    </TableRow>
  );
}
