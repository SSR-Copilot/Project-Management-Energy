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
 *   Edit Costs   → the only one that navigates INTO the cost module. It reproduces the canvas
 *                  gate exactly: a project whose status is "Draft" gets the prerequisites
 *                  dialog instead.
 *   All other commands retain their Canvas labels, order, and visibility gates but remain
 *   disabled for the Monday demo. Cost opens this same Code App in a new browser tab.
 */
import { useMemo, useState } from "react";
import { costAppUrl } from "@/app/deepLinks";
import {
  Button, Dropdown, Field, Input, Option, Spinner, Table, TableBody, TableCell,
  TableHeader, TableHeaderCell, TableRow, Text, Tooltip, makeStyles, mergeClasses, tokens,
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
  CAPACITY_OPERATORS, COL, PAGE_SIZE, capacityError, clearIconState, commandBarState,
  costModuleLock, formatCapacity, isCostModuleLocked, isFilterActive, pagerLabels,
  type CapacityOperator, type CommandKey, type ProjectRow, type SelectedProject,
} from "./rules";
import {
  useCountries, useCountryAreas, useCriteria, useProjectManagerSearch, useProjectPage,
  useProjectStateOrder, useProjectStates,
} from "./hooks";

/* ────────────────────────────────────────────────────────────────── styles */

const useStyles = makeStyles({
  page: { display: "flex", flexDirection: "column", gap: space.m, minWidth: 0, minHeight: 0 },
  /**
   * FOUR columns over TWO rows, which is the reference layout:
   *   row 1  Project · Country · Technology · (empty)
   *   row 2  Project Manager · Area/State/Province · Capacity + operator · Status
   * A `repeat(auto-fit, …)` strip put all seven on one line, which is what made the first
   * cut of this screen look nothing like the app.
   */
  filters: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    columnGap: space.l,
    rowGap: space.s,
    paddingBottom: space.m,
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: tokens.colorNeutralStroke2,
    [media.belowLg]: { gridTemplateColumns: "repeat(2, minmax(0, 1fr))" },
    [media.belowSm]: { gridTemplateColumns: "minmax(0, 1fr)" },
  },
  filterCell: { display: "flex", alignItems: "flex-end", gap: space.xs, minWidth: 0 },
  filterField: { flex: 1, minWidth: 0 },
  capacityCell: { display: "flex", alignItems: "flex-end", gap: space.xs, minWidth: 0 },
  /** The capacity value is narrow, its operator wide — as in the reference. */
  capacityValue: { flexBasis: "38%", flexGrow: 0, minWidth: 0 },
  capacityOperator: { flex: 1, minWidth: 0 },
  gridWrap: { flex: 1, minHeight: "240px", overflow: "auto" },
  accentCell: { width: "6px", paddingLeft: 0, paddingRight: 0 },
  accent: { display: "block", width: "4px", height: "22px", borderRadius: "2px" },
  selectCell: { width: "44px" },
  numeric: { textAlign: "right", fontVariantNumeric: "tabular-nums" },
  sortable: { cursor: "pointer", userSelect: "none" },
  /** `AlternateRowColor: =gblAppTheme.palette.themeLighter` on the canvas details list. */
  rowAlt: { backgroundColor: palette.themeLighterAlt },
  rowSelected: { backgroundColor: palette.themeLighter },
  /** Total Rows and the pager sit together at the LEFT, as in the reference. */
  footer: {
    display: "flex", alignItems: "center", gap: space.s, flexWrap: "wrap",
    paddingTop: space.s,
    borderTopWidth: "1px",
    borderTopStyle: "solid",
    borderTopColor: tokens.colorNeutralStroke2,
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

  const [selectedId, setSelectedId] = useState<string>();
  const [managerQuery, setManagerQuery] = useState("");
  const [lockDialog, setLockDialog] = useState<string[] | null>(null);
  const [banner, setBanner] = useState<string>();

  const pageQuery = useProjectPage({ criteria, locale });
  const countries = useCountries();
  const areas = useCountryAreas(criteria.filter.countryId);
  const states = useProjectStates();
  const managers = useProjectManagerSearch(managerQuery);

  const rows = pageQuery.data?.rows ?? [];
  const selected = rows.find((r) => r.id === selectedId);
  const stateOrder = useProjectStateOrder(selected?.clusterStateId ?? null);

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
    // Simulate · Dashboard. Only Costs is enabled for this demo.
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
        enabled: c.key === "editCosts" && c.enabled,
      }));
  }, [gates]);

  /**
   * Edit Costs — the canvas handler, reproduced:
   *
   *   If(ClusterState.Name = "Draft", <show the prerequisites dialog>,
   *                                   Launch(gblCostAppLaunchUrl, {projectId: …}))
   *
   * Costs opens in a new browser tab using this Code App's own player URL.
   */
  const openCosts = () => {
    if (!selected) return;
    const lockInput = {
      projectStartDate: selected.projectStartDate,
      totalCapacity: selected.totalCapacity,
      netYieldP50: selected.netYieldP50,
      statusName: selected.statusName || null,
    };
    if (isCostModuleLocked(lockInput)) { setLockDialog(costModuleLock(lockInput)); return; }
    try {
      const url = costAppUrl({
        currentUrl: window.location.href,
        appUrl: session?.appUrl,
        projectId: selected.id,
      });
      // Keep this synchronous with the user gesture to allow opening the browser tab.
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      setBanner("Costs could not be opened. Please select the project again and retry.");
    }
  };

  const onCommand = (key: string) => {
    setBanner(undefined);
    if (key === "editCosts" && gates.editCosts.enabled) openCosts();
  };

  /* ── the grid ────────────────────────────────────────────────────────── */

  const page = pageQuery.data;
  const labels = pagerLabels({
    page: page?.page ?? criteria.page,
    pageSize: page?.pageSize ?? PAGE_SIZE,
    totalRows: page?.totalRows ?? 0,
  });
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
      {banner ? (
        <EmptyState title={banner} />
      ) : null}

      {/* The command bar belongs to the HEADER band — see CommandSlot.tsx. */}
      <CommandSlot>
        <CommandBar commands={commands} onCommand={onCommand} ariaLabel="Project actions" />
      </CommandSlot>

      {/*
        The seven filters, in the reference's two rows of four:
          Project · Country · Technology · (empty)
          Project Manager · Area/State/Province · Capacity+operator · Status
        The empty cell is a real grid cell, not a margin — it is what keeps Project Manager
        under Project rather than beside Technology.
      */}
      <div className={styles.filters}>
        <FilterCell
          label="Project"
          value={criteria.filter.keyword}
          onClear={() => setFilter({ keyword: "" })}
        >
          <Input
            className={styles.filterField}
            value={criteria.filter.keyword}
            placeholder="Search for Project Name, Short Name and ID"
            contentBefore={<SearchRegular />}
            onChange={(_, d) => setFilter({ keyword: d.value })}
            data-testid="filter-keyword"
          />
        </FilterCell>

        <FilterCell
          label="Country"
          value={criteria.filter.countryId}
          onClear={() => setFilter({ countryId: null })}
        >
          <Dropdown
            className={styles.filterField}
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
          label="Technology"
          value={criteria.filter.technology}
          onClear={() => setFilter({ technology: null })}
        >
          <Dropdown
            className={styles.filterField}
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

        {/* Row 1 column 4 is empty in the reference. */}
        <div />

        {/* The Project Manager typeahead. `pcf_..._Filter_ProjectManager` was a PeoplePicker. */}
        <div className={styles.filterCell}>
          <Field label="Project Manager" className={styles.filterField}>
            <Input
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
          </Field>
        </div>

        <FilterCell
          label="Area/State/Province"
          value={criteria.filter.areaId}
          onClear={() => setFilter({ areaId: null })}
        >
          <Dropdown
            className={styles.filterField}
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

        <div className={styles.capacityCell}>
          <Field
            label="Capacity"
            className={styles.capacityValue}
            validationState={capacityError(criteria.filter.capacity, locale) ? "error" : "none"}
            validationMessage={capacityError(criteria.filter.capacity, locale) ?? undefined}
          >
            <Input
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

        <FilterCell
          label="Status"
          value={criteria.filter.clusterStateId}
          onClear={() => setFilter({ clusterStateId: null })}
        >
          <Dropdown
            className={styles.filterField}
            selectedOptions={
              criteria.filter.clusterStateId ? [criteria.filter.clusterStateId] : []
            }
            value={states.data?.find((s) => s.id === criteria.filter.clusterStateId)?.name ?? ""}
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

      {/* ── the grid ──────────────────────────────────────────────────── */}
      {pageQuery.isLoading ? (
        /*
         * The app's FIRST load is the canvas' full-screen wait card, not a small inline spinner
         * in an otherwise-empty grid — `AppLoadingScreen.png`: the 500 x 240 white card on a
         * dimmed ground with "Please wait...". `LoadingOverlay`'s blocking mode already is that
         * card, transcribed from `cmp_PopUp_Loading`; the overview simply was not using it.
         */
        <LoadingOverlay label="Please wait..." />
      ) : pageQuery.isError ? (
        <EmptyState
          title="Projects could not be loaded"
          description={
            pageQuery.error instanceof Error ? pageQuery.error.message : String(pageQuery.error)
          }
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No project matches these filters"
          {...(isFilterActive(criteria.filter)
            ? { action: { label: "Clear all filters", onClick: clearFilter } }
            : {})}
        />
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

      {/* ── footer: Total Rows then the pager, both left ───────────────── */}
      <div className={styles.footer}>
        <Text data-testid="total-rows">{labels.totalRows}</Text>
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
        {pageQuery.isFetching ? <Spinner size="tiny" aria-label="Loading" /> : null}
      </div>

      {/* ── the Edit Costs prerequisites dialog ─────────────────────── */}
      <ConfirmDialog
        open={lockDialog !== null}
        title="Costs cannot be edited yet"
        description={
          lockDialog && lockDialog.length > 0
            ? `Before this project's costs can be edited, complete: ${lockDialog.join(", ")}.`
            : "This project is still a draft."
        }
        confirmText="Close"
        cancelText="Cancel"
        onConfirm={() => setLockDialog(null)}
        onCancel={() => setLockDialog(null)}
      />
    </div>
  );
}

/* ────────────────────────────────────────────────────────── sub-components */

/**
 * A filter with its funnel button — `con_..._Filter_<field>` plus
 * `ico_..._Filter_<field>`, which the canvas disabled while its filter was blank.
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
      <Field label={label} className={styles.filterField}>{children}</Field>
      <ClearFilterButton value={value} onClear={onClear} />
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
