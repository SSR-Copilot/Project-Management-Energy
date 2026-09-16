/**
 * Project Main Screen — the portfolio list.
 * 101 controls, 2,502 loc, 27 substantive blocks, band M.
 *
 * The landing screen of the Project Management app: a two-row filter band (3 filters, then 4 —
 * GUIDE p06) over the canvas's 12 visible columns plus a row-accent stripe, with single-row
 * selection and a server-side pager.
 * Selecting a project sets `gblRecordSelectedProject`, which is what unlocks the rail on
 * every project-scoped screen.
 *
 * ─── what this rewrite changed, and why ─────────────────────────────────────────────────
 *
 *  - The list is now **one query per page**. It used to be `projectRepo.list({ all: true })`
 *    followed by a client-side `.filter()` — every row of the table on every mount, which is
 *    the exact pattern CLAUDE.md rule 1 forbids and which the canvas app never did.
 *  - Edit rights come from `useRowPrivileges`, i.e. from the server. They used to be inferred
 *    from the user's *role names*, forbidden by rule 5, and wrong wherever row-level sharing
 *    is in play.
 *  - `PageHeader` and the four `StatTiles` are gone. The canvas screen has neither, and the
 *    tiles were summing only the rows currently loaded, so they were quietly wrong the moment
 *    paging arrived.
 *  - Filter / sort / page live in the URL, not in `useState`. The canvas kept them in one row
 *    of `colFiltersOverview`; search params give the same single source of truth plus a link
 *    people can paste to each other, which is what a portfolio screen is for.
 *
 * The command bar renders here rather than inside `AppHeader` — see the deliberate-deviation
 * note in that file.
 */
import {
  useCallback, useMemo, useState, type ReactElement,
} from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Avatar, Button, Dropdown, Field, Input, Option, Text, Tooltip,
  makeStyles, mergeClasses, tokens,
} from "@fluentui/react-components";
import {
  AddRegular, EditRegular, MoneyRegular, DeleteRegular, PlayRegular,
  DataBarVerticalRegular, ReadingModeMobileRegular, SearchRegular,
  FilterRegular, FilterDismissRegular, ChartMultipleRegular,
  // `GlobeRegular` for SharePoint: `@fluentui/react-icons` ships no product-logo glyphs, so
  // the canvas `SharepointLogo` has no equivalent here.
  GlobeRegular, PeopleTeamRegular,
  CircleRegular, ClockRegular, CheckmarkCircleFilled, DismissCircleFilled,
  ProhibitedRegular,
} from "@fluentui/react-icons";
import {
  DataGrid, CommandBar, ConfirmDialog, GridPager,
  type Column, type Command, type SortState,
} from "@/components";
import { useAppStore } from "@/store/appStore";
import { selectProjectById } from "@/features/shared/useProjectContext";
import { space, media, radius } from "@/theme/tokens";
import { DEFAULT_PAGE_SIZE, computePaging } from "@/domain/paging";
import { approvalDecoration, type ApprovalIconToken } from "@/domain/approval";
import { NEW_PROJECT_ROUTE } from "@/domain/navigation";
import { REPORT_VIEWERS } from "./rules";
import {
  CAPACITY_OPERATORS, PROJECT_MAIN_COL,
  applyFilterPatch, capacityFieldError, clearIconState, commandBarState, costModuleLock,
  deleteMessages, filterPeopleSuggestions, formatCapacity, isCostModuleLocked, nextSortState,
  parseCriteria, serialiseCriteria, TECHNOLOGY_LABEL,
  type CapacityOperator, type CommandKey, type PersonOption, type ProjectListFilter,
  type ProjectListRow,
} from "./rules";
import {
  useAreaOptions, useCountryOptions, useDeleteProject, usePeopleOptions,
  useProjectList, useProjectStateOptions, useRowPrivileges,
} from "./hooks";

const useStyles = makeStyles({
  /**
   * The screen owns its own scroll frame. `AppShell` is rendered with `bleed` on this route,
   * so there is no page padding to fight — the filter band reaches the viewport edges exactly
   * as it does in the canvas app, and `main` does not scroll.
   *
   * The layout is three bands: command bar and filters are `flex: none` so they are frozen in
   * place, and the grid takes the rest. The ONLY scroller on the screen is the one inside
   * `DataGrid`, which moves the rows underneath a sticky header — so the filters stay put and
   * the pager, which sits in the grid's footer, is always visible without scrolling.
   */
  root: { display: "flex", flexDirection: "column", minHeight: 0, flex: 1, overflow: "hidden" },
  /** Frozen: the command bar never scrolls out of reach. */
  commandBand: { flex: "none" },
  /**
   * GUIDE p06: the filter band is not one auto-wrapping grid — it is two literal rows, three
   * filters over four (Project/Country/Technology, then Project Manager/Area/Capacity/Status).
   * A single `repeat(4, 1fr)` grid would wrap the SEVENTH filter onto row 2 with the wrong
   * three ahead of it, which is what this screen did before the screenshots existed.
   */
  band: {
    display: "flex",
    flexDirection: "column",
    // Frozen alongside the command bar — see the note on `root`.
    flex: "none",
    gap: space.s,
    padding: `${space.s} ${space.m}`,
    backgroundColor: tokens.colorNeutralBackground3,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    [media.belowMd]: { padding: space.s },
  },
  filterRow3: {
    display: "grid",
    gap: space.s,
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    [media.belowLg]: { gridTemplateColumns: "repeat(2, minmax(0, 1fr))" },
    [media.belowMd]: { gridTemplateColumns: "1fr" },
  },
  filterRow4: {
    display: "grid",
    gap: space.s,
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    [media.belowXl]: { gridTemplateColumns: "repeat(3, minmax(0, 1fr))" },
    [media.belowLg]: { gridTemplateColumns: "repeat(2, minmax(0, 1fr))" },
    [media.belowMd]: { gridTemplateColumns: "1fr" },
  },
  /** A filter and its clear button, so the funnel sits on the control's baseline. */
  pair: { display: "flex", alignItems: "flex-end", gap: "4px", minWidth: 0 },
  field: { flex: 1, minWidth: 0 },
  /** Capacity is an operator dropdown plus a value box, in one track. */
  capacity: { display: "flex", gap: "4px", minWidth: 0 },
  capacityOp: { flex: "1 1 55%", minWidth: 0 },
  capacityValue: { flex: "1 1 45%", minWidth: 0 },
  gridArea: {
    display: "flex", flexDirection: "column",
    // `minHeight: 0` is what lets the grid shrink to the leftover space instead of growing
    // the page; `flex: 1` gives it everything the two frozen bands do not take.
    minHeight: 0, flex: 1, minWidth: 0,
    padding: space.m,
    [media.belowMd]: { padding: space.s },
  },
  approvalCell: { display: "flex", alignItems: "center", justifyContent: "center", height: "100%" },
  nameCell: { fontWeight: 600 },
  lockList: { margin: "0", paddingLeft: space.l, display: "flex", flexDirection: "column", gap: "2px" },
  error: { color: tokens.colorPaletteRedForeground1 },

  /* ── the Project Manager typeahead — GUIDE p07 ────────────────────────────────── */
  pmWrap: { position: "relative", minWidth: 0 },
  pmPanel: {
    position: "absolute",
    top: "calc(100% + 2px)",
    left: 0,
    right: 0,
    zIndex: 10,
    backgroundColor: tokens.colorNeutralBackground1,
    borderTopColor: tokens.colorNeutralStroke1,
    borderRightColor: tokens.colorNeutralStroke1,
    borderBottomColor: tokens.colorNeutralStroke1,
    borderLeftColor: tokens.colorNeutralStroke1,
    borderTopWidth: "1px",
    borderRightWidth: "1px",
    borderBottomWidth: "1px",
    borderLeftWidth: "1px",
    borderTopStyle: "solid",
    borderRightStyle: "solid",
    borderBottomStyle: "solid",
    borderLeftStyle: "solid",
    borderRadius: radius.md,
    boxShadow: tokens.shadow16,
    maxHeight: "260px",
    overflowY: "auto",
    padding: "4px",
  },
  pmPanelHeading: {
    padding: `6px ${space.s}`,
    fontSize: "11px", fontWeight: 600, letterSpacing: ".04em", textTransform: "uppercase",
    color: tokens.colorNeutralForeground3,
  },
  pmOption: {
    display: "flex", alignItems: "center", gap: space.s,
    padding: `6px ${space.s}`,
    borderRadius: radius.sm,
    cursor: "pointer",
    ":hover": { backgroundColor: tokens.colorNeutralBackground1Hover },
  },
  pmOptionText: { display: "flex", flexDirection: "column", minWidth: 0 },
  pmOptionName: { fontSize: "13px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  pmOptionMail: {
    fontSize: "11px", color: tokens.colorNeutralForeground3,
    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
  },
});

/* ─────────────────────────────────────────── icon maps (JSX stays out of rules) */

const COMMAND_ICON: Record<string, ReactElement> = {
  Add: <AddRegular />,
  Edit: <EditRegular />,
  Money: <MoneyRegular />,
  Delete: <DeleteRegular />,
  Play: <PlayRegular />,
  Chart: <ChartMultipleRegular />,
  DataBarVertical: <DataBarVerticalRegular />,
  ReadingMode: <ReadingModeMobileRegular />,
  SharepointLogo: <GlobeRegular />,
  TeamsLogo: <PeopleTeamRegular />,
};

/** `approvalDecoration` returns an icon TOKEN so it can stay a pure function. */
function ApprovalIcon({ token, color }: { token: ApprovalIconToken; color: string }) {
  const style = { color };
  switch (token) {
    case "clock": return <ClockRegular style={style} />;
    case "check": return <CheckmarkCircleFilled style={style} />;
    case "dismiss": return <DismissCircleFilled style={style} />;
    case "prohibited": return <ProhibitedRegular style={style} />;
    case "circle":
    default: return <CircleRegular style={style} />;
  }
}

/**
 * The Project Manager typeahead — GUIDE p07.
 *
 * `value` is what the box currently shows: the typed-but-not-yet-picked text while the user is
 * editing, otherwise the selected person's name. `suggestions` is already filtered
 * (`filterPeopleSuggestions`, a pure function in `rules.ts`) — this component only renders.
 */
function ProjectManagerFilter({
  styles: s, value, suggestions, onChange, onPick, onBlur,
}: {
  styles: ReturnType<typeof useStyles>;
  value: string;
  suggestions: PersonOption[];
  onChange: (v: string) => void;
  onPick: (p: PersonOption) => void;
  onBlur: () => void;
}) {
  const open = suggestions.length > 0;
  return (
    <div className={s.pmWrap}>
      <Input
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        value={value}
        placeholder="Search for project manager"
        onChange={(_, d) => onChange(d.value)}
        onBlur={onBlur}
      />
      {open && (
        <div className={s.pmPanel} role="listbox">
          <div className={s.pmPanelHeading}>Suggested People</div>
          {suggestions.map((p) => (
            <div
              key={p.id}
              role="option"
              aria-selected={false}
              className={s.pmOption}
              // `onMouseDown` + preventDefault fires before the input's `onBlur` closes the
              // panel, so a click actually lands on the option instead of the panel vanishing
              // first.
              onMouseDown={(e) => { e.preventDefault(); onPick(p); }}
            >
              <Avatar size={28} name={p.label} color="colorful" />
              <div className={s.pmOptionText}>
                <span className={s.pmOptionName}>{p.label}</span>
                {p.mail && <span className={s.pmOptionMail}>{p.mail}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** The six commands the landing screen shows, in the canvas's order. */
const BAR_ORDER: CommandKey[] = [
  "addProject", "editProject", "editCosts", "deleteProject", "simulateProject", "dashboard",
];

export default function ProjectMainScreen() {
  const s = useStyles();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();

  const user = useAppStore((st) => st.session.user);
  const env = useAppStore((st) => st.session.env);

  /* ── state: filter / sort / page all live in the URL ────────────────────────── */

  const criteria = useMemo(() => parseCriteria(params), [params]);
  const { filter, sort, page } = criteria;

  // `replace`, not push: a filter keystroke must not add a history entry, or Back becomes
  // unusable. Paging pushes, because stepping back a page is what a user means by Back.
  const write = useCallback(
    (next: typeof criteria, push = false) =>
      setParams(serialiseCriteria(next), { replace: !push }),
    [setParams],
  );

  const patchFilter = useCallback(
    (patch: Partial<ProjectListFilter>) => {
      const nextFilter = applyFilterPatch(filter, patch);
      if (nextFilter === filter) return;
      // Any filter change invalidates the page number — page 4 of the old result set is not
      // page 4 of the new one, and would usually be past the end.
      write({ filter: nextFilter, sort, page: 1 });
    },
    [filter, sort, write],
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [lockedSections, setLockedSections] = useState<string[] | null>(null);
  const [opening, setOpening] = useState(false);
  // GUIDE p07/p08: the Project Manager box is a typeahead, not a plain dropdown. `null` means
  // "not being edited" — the box shows the selected person's name; a string is what is
  // currently typed, shown instead of the selection until a suggestion is picked or the box
  // loses focus (p08: typed text that is never picked reverts, the filter stays untouched).
  const [pmQuery, setPmQuery] = useState<string | null>(null);

  /* ── data ───────────────────────────────────────────────────────────────────── */

  const list = useProjectList({ filter, sort, page, pageSize: DEFAULT_PAGE_SIZE, user });
  const countries = useCountryOptions();
  const areas = useAreaOptions(filter.countryId);
  const states = useProjectStateOptions();
  const people = usePeopleOptions();

  // GUIDE p07 — the currently-selected manager (to show when the box is not being edited) and
  // the typed-text suggestions (a pure function, so the panel's contents are directly tested).
  const selectedManager = useMemo(
    () => people.data?.find((p) => p.id === filter.projectManagerId) ?? null,
    [people.data, filter.projectManagerId],
  );
  const pmSuggestions = useMemo(
    () => filterPeopleSuggestions(people.data ?? [], pmQuery ?? ""),
    [people.data, pmQuery],
  );

  const selected = useMemo(
    () => list.rows.find((r) => r.id === selectedId) ?? null,
    [list.rows, selectedId],
  );

  // Server-answered, per record. Never a role name.
  const { privileges } = useRowPrivileges(selected?.id ?? null);
  const remove = useDeleteProject(list.pageKey);

  const paging = computePaging(list.totalRows, DEFAULT_PAGE_SIZE, page);

  /* ── command bar ────────────────────────────────────────────────────────────── */

  const openProject = useCallback(
    async (row: ProjectListRow, route: string) => {
      setOpening(true);
      try {
        // The grid reads a 24-column projection; the project-scoped screens need the full
        // record in the store, so this re-reads it by id rather than casting the list row.
        await selectProjectById(row.id);
        nav(route);
      } finally {
        setOpening(false);
      }
    },
    [nav],
  );

  const barState = commandBarState({
    selected: selected
      ? {
          id: selected.id,
          name: selected.name,
          approvalState: selected.approvalState,
          clusterStateName: selected.clusterStateName,
          // `vsb_order` is not in the list projection. The five cluster names all sort after
          // "Draft", which is the only order-0 state, so this reproduces the gate the canvas
          // computes from the lookup without a second request.
          clusterStateOrder: selected.clusterStateName === "Draft" ? 0 : 1,
          countryName: selected.countryName,
          spoSharepointUrl: selected.spoSharepointUrl,
          spoTeamsUrl: selected.spoTeamsUrl,
        }
      : null,
    canCreate: privileges.create || !selected,
    canEditSelected: privileges.edit,
    environmentName: env?.environmentName ?? "",
    userMail: user?.mail ?? null,
    reportViewers: REPORT_VIEWERS,
  });

  const onCommand: Record<CommandKey, () => void> = {
    // GUIDE p10: opens General in its New Project state — see `NEW_PROJECT_ROUTE`.
    addProject: () => nav(NEW_PROJECT_ROUTE),
    editProject: () => selected && void openProject(selected, "/project/general"),
    editCosts: () => {
      if (!selected) return;
      // Rule 22 — the gate is the Draft test alone; the list is only what the dialog shows.
      if (isCostModuleLocked(selected)) {
        setLockedSections(costModuleLock(selected));
        return;
      }
      void openProject(selected, "/costs/capex");
    },
    deleteProject: () => setConfirmDelete(true),
    simulateProject: () => { /* ManualTrigger-SimulateProject — not wired in mock mode. */ },
    viewSharepoint: () =>
      selected?.spoSharepointUrl && window.open(selected.spoSharepointUrl, "_blank", "noopener"),
    viewTeams: () =>
      selected?.spoTeamsUrl && window.open(selected.spoTeamsUrl, "_blank", "noopener"),
    powerBiOverview: () => { /* Power BI report launch — needs the report URL. */ },
    powerBiFinance: () => { /* Power BI report launch — needs the report URL. */ },
    dashboard: () => nav("/project/general"),
  };

  const commands: Command[] = BAR_ORDER.map((key) => {
    const st = barState[key];
    return {
      key,
      label: st.label,
      icon: COMMAND_ICON[st.icon],
      onClick: onCommand[key],
      disabled: !st.enabled || opening,
      visible: st.visible,
      danger: key === "deleteProject",
      primary: key === "addProject",
      disabledReason: st.reason,
    };
  });

  /* ── the grid ───────────────────────────────────────────────────────────────── */

  // `DataGrid` speaks `{ key, dir }`; the filter row speaks `{ col, asc }`. The column keys
  // ARE the logical column names, so `resolveSortColumn`'s allow-list still guards `$orderby`.
  const gridSort: SortState = { key: sort.col, dir: sort.asc ? "asc" : "desc" };
  const onSortChange = (next: SortState | null) => {
    // `allowClearSort` is off, so `null` cannot arrive; a list with no order at all would
    // page incoherently, because `$skip` without `$orderby` has no defined meaning.
    if (!next) return;
    write({ filter, sort: nextSortState(sort, next.key), page: 1 });
  };

  /**
   * The grid columns, transcribed from `columns_Items` in `Project Main Screen.pa.yaml`.
   *
   * Twelve, in the canvas's order, with its widths (title 350, PM 200, area 220, weighted
   * capacity 180, capacity 160, icon 60, default 100) and its horizontal alignment.
   *
   * GUIDE p06 corrects a call this file made before any screenshot existed: the approval
   * colour bar is NOT a leading 4px column. The screenshot's row anatomy is explicit — "a
   * short vertical colour stripe sits immediately to the left of the Project Name text inside
   * the cell" — i.e. a row decoration next to the first data column, exactly what `DataGrid`'s
   * `rowAccent` draws (it paints right after the radio track, ahead of the first column). So
   * this is `rowAccent` on the grid below, not a column here; the approval ICON stays its own
   * column at the far right, since the screenshot's Status column reads "Cluster 1..4" — the
   * bar's colour is not obviously derived from that, and the Approval column is off-screen in
   * every capture (the grid scrolls further right than the screenshot goes).
   *
   * The five milestone dates are NOT columns either. They are built by the row projection and
   * then never surfaced in `columns_Items` — exactly like `vsb_numberwtgs: 0`, which the build
   * spec already flags as dead. An earlier cut of this screen rendered them; they are gone.
   */
  const columns: Column<ProjectListRow>[] = [
    {
      key: PROJECT_MAIN_COL.name, header: "Project Name", width: "minmax(200px, 350px)",
      sortable: true, value: (r) => r.name,
      render: (r) => <span className={s.nameCell}>{r.name}</span>,
    },
    {
      key: PROJECT_MAIN_COL.shortName, header: "Short Name", width: "100px",
      sortable: true, value: (r) => r.shortName,
    },
    {
      key: "clusterState", header: "Status", width: "120px",
      // Not sortable: a lookup FormattedValue, so `$orderby` would need a navigation path.
      // Ordering it inside the page would disagree with the table at every page boundary.
      //
      // GUIDE p06: plain text, not a StateChip. The recording shows "Cluster 1" … "Cluster 4"
      // as ordinary cell text in this grid; the coloured chip belongs to the record header,
      // where the state is the subject. In a 1,127-row list a chip per row also truncated to
      // "Clus…", which is worse than the value it was decorating.
      value: (r) => r.statusName,
      render: (r) => (r.statusName ? <span>{r.statusName}</span> : null),
    },
    {
      key: "manager", header: "Project Manager", width: "200px",
      hideBelow: "lg", value: (r) => r.managerName,
    },
    { key: "country", header: "Country", width: "100px", hideBelow: "md", value: (r) => r.countryName },
    {
      key: "area", header: "Area/State/Province/Voivodeship", width: "265px",
      hideBelow: "xl", value: (r) => r.areaName,
    },
    {
      key: PROJECT_MAIN_COL.technology, header: "Technology", width: "100px",
      sortable: true, hideBelow: "md", value: (r) => r.technologyLabel,
    },
    {
      // SOURCE DEFECT: in the canvas this column is `ColName: "vsb_totalcapacity"` with
      // `ColDisplayName: "Technology"` — a duplicated header — and the row projection never
      // writes a `vsb_totalcapacity` key, so every cell renders BLANK. Two bugs in one
      // column. The build spec says to flag it and label it "Total Capacity" after
      // confirming with the product owner, which is what this does; the real column is
      // fetched, so the cell now carries a value.
      key: PROJECT_MAIN_COL.totalCapacity, header: "Total Capacity", width: "140px",
      numeric: true, sortable: true, hideBelow: "xl",
      value: (r) => r.totalCapacity ?? 0,
      render: (r) => formatCapacity(r.totalCapacity),
    },
    {
      // `vsb_capacitymwwtg: Text('Total Capacity', "#,##0.0#")` — despite the name, the
      // canvas fills this from Total Capacity, not from Plant WTG Capacity.
      key: "vsb_capacitymwwtg", header: "Capacity [MW(p)]", width: "160px",
      align: "end", sortable: false,
      value: (r) => r.totalCapacity ?? 0,
      render: (r) => formatCapacity(r.totalCapacity),
    },
    {
      key: PROJECT_MAIN_COL.weightedMw, header: "Weighted Capacity [MWp]", width: "180px",
      align: "end", sortable: true, hideBelow: "xl",
      value: (r) => r.weightedMw ?? 0,
      render: (r) => formatCapacity(r.weightedMw),
    },
    {
      // The canvas grid's "Project ID" is `'Internal Project ID'`, right-aligned.
      key: PROJECT_MAIN_COL.internalProjectId, header: "Project ID", width: "100px",
      align: "end", sortable: true, hideBelow: "lg",
      value: (r) => r.internalProjectId,
    },
    {
      // `loc_iconstate` — the approval glyph, last column, centred, 60px.
      key: PROJECT_MAIN_COL.approvalState, header: "Approval", width: "60px",
      align: "center", sortable: true,
      value: (r) => r.approvalLabel,
      render: (r) => {
        const d = approvalDecoration(r.approvalState);
        return (
          <Tooltip content={d.label} relationship="label" withArrow>
            <span className={s.approvalCell}>
              <ApprovalIcon token={d.icon} color={d.color} />
            </span>
          </Tooltip>
        );
      },
    },
  ];

  /* ── the filter band ────────────────────────────────────────────────────────── */

  const capacityError = capacityFieldError(filter.capacity);

  /** One filter's clear button — the canvas's funnel, disabled while that filter is blank. */
  const clearButton = (value: unknown, onClear: () => void, label: string) => {
    const st = clearIconState(value);
    return (
      <Tooltip content={st.disabled ? `No ${label} filter` : `Clear ${label}`} relationship="label" withArrow>
        <Button
          appearance="subtle"
          disabled={st.disabled}
          onClick={onClear}
          aria-label={`Clear ${label}`}
          icon={st.icon === "ClearFilter" ? <FilterDismissRegular /> : <FilterRegular />}
        />
      </Tooltip>
    );
  };

  return (
    <div className={s.root}>
      <div className={s.commandBand}>
        <CommandBar commands={commands} maxInline={BAR_ORDER.length} />
      </div>

      <div className={s.band}>
        {/* GUIDE p06 — row 1: Project keyword, Country, Technology (three tracks). */}
        <div className={s.filterRow3}>
          <div className={s.pair}>
            <Field
              className={s.field}
              label="Project"
              // Rule 4/5: the search does nothing until the third character, so say so rather
              // than letting it look broken.
              hint={
                filter.keyword.trim().length > 0 && filter.keyword.trim().length < 3
                  ? "Type at least 3 characters"
                  : undefined
              }
            >
              <Input
                value={filter.keyword}
                contentBefore={<SearchRegular />}
                // GUIDE p06 — verbatim.
                placeholder="Search for Project Name, Short Name and ID"
                onChange={(_, d) => patchFilter({ keyword: d.value })}
              />
            </Field>
            {clearButton(filter.keyword, () => patchFilter({ keyword: "" }), "Project")}
          </div>

          <div className={s.pair}>
            <Field className={s.field} label="Country">
              <Dropdown
                placeholder="All countries"
                value={countries.data?.find((c) => c.id === filter.countryId)?.label ?? ""}
                selectedOptions={filter.countryId ? [filter.countryId] : []}
                onOptionSelect={(_, d) => patchFilter({ countryId: d.optionValue ?? null })}
              >
                {(countries.data ?? []).map((c) => (
                  <Option key={c.id} value={c.id}>{c.label}</Option>
                ))}
              </Dropdown>
            </Field>
            {clearButton(filter.countryId, () => patchFilter({ countryId: null }), "Country")}
          </div>

          <div className={s.pair}>
            <Field className={s.field} label="Technology">
              <Dropdown
                placeholder="All technologies"
                value={filter.technology === null ? "" : TECHNOLOGY_LABEL[filter.technology] ?? ""}
                selectedOptions={filter.technology === null ? [] : [String(filter.technology)]}
                onOptionSelect={(_, d) =>
                  patchFilter({ technology: d.optionValue ? Number(d.optionValue) : null })}
              >
                {Object.entries(TECHNOLOGY_LABEL).map(([v, label]) => (
                  <Option key={v} value={v}>{label}</Option>
                ))}
              </Dropdown>
            </Field>
            {clearButton(filter.technology, () => patchFilter({ technology: null }), "Technology")}
          </div>
        </div>

        {/* GUIDE p06 — row 2: Project Manager, Area/State/Province, Capacity, Status (four
            tracks) — not the 4-then-3 split this screen used before the screenshots. */}
        <div className={s.filterRow4}>
          <div className={s.pair}>
            <Field className={s.field} label="Project Manager">
              <ProjectManagerFilter
                styles={s}
                value={pmQuery ?? selectedManager?.label ?? ""}
                suggestions={pmSuggestions}
                onChange={setPmQuery}
                onPick={(p) => {
                  patchFilter({ projectManagerId: p.id });
                  setPmQuery(null);
                }}
                onBlur={() => setPmQuery(null)}
              />
            </Field>
            {clearButton(
              filter.projectManagerId,
              () => { patchFilter({ projectManagerId: null }); setPmQuery(null); },
              "Project Manager",
            )}
          </div>

          <div className={s.pair}>
            <Field
              className={s.field}
              label="Area/State/Province"
              hint={filter.countryId ? undefined : "Choose a country first"}
            >
              <Dropdown
                // The canvas repopulates this from the country and leaves it empty until one is
                // chosen; `useAreaOptions` is `enabled` on the same condition.
                disabled={!filter.countryId}
                placeholder={filter.countryId ? "All areas" : "—"}
                value={areas.data?.find((a) => a.id === filter.areaId)?.label ?? ""}
                selectedOptions={filter.areaId ? [filter.areaId] : []}
                onOptionSelect={(_, d) => patchFilter({ areaId: d.optionValue ?? null })}
              >
                {(areas.data ?? []).map((a) => (
                  <Option key={a.id} value={a.id}>{a.label}</Option>
                ))}
              </Dropdown>
            </Field>
            {clearButton(filter.areaId, () => patchFilter({ areaId: null }), "Area")}
          </div>

          <div className={s.pair}>
            <Field
              className={s.field}
              // GUIDE p06 — verbatim "Capacity", not "Capacity (MW)".
              label="Capacity"
              validationState={capacityError ? "error" : "none"}
              validationMessage={capacityError ?? undefined}
            >
              <div className={s.capacity}>
                <Dropdown
                  className={s.capacityOp}
                  aria-label="Capacity comparison"
                  // GUIDE p06 — verbatim; the operator has no default until a capacity is
                  // typed (rule 7), so the box shows a real placeholder, not a pretend value.
                  placeholder="Select operator"
                  value={filter.capacityOperator}
                  selectedOptions={filter.capacityOperator ? [filter.capacityOperator] : []}
                  onOptionSelect={(_, d) =>
                    patchFilter({ capacityOperator: (d.optionValue as CapacityOperator) ?? "" })}
                >
                  {CAPACITY_OPERATORS.map((op) => (
                    <Option key={op} value={op}>{op}</Option>
                  ))}
                </Dropdown>
                <Input
                  className={s.capacityValue}
                  value={filter.capacity}
                  placeholder="e.g. 136"
                  inputMode="decimal"
                  aria-label="Capacity value"
                  onChange={(_, d) => patchFilter({ capacity: d.value })}
                />
              </div>
            </Field>
            {clearButton(
              filter.capacity,
              // Rule 9's second cascade: clearing the value clears the operator too.
              () => patchFilter({ capacity: "" }),
              "Capacity",
            )}
          </div>

          <div className={s.pair}>
            <Field className={s.field} label="Status">
              <Dropdown
                placeholder="All statuses"
                value={states.data?.find((o) => o.id === filter.clusterStateId)?.label ?? ""}
                selectedOptions={filter.clusterStateId ? [filter.clusterStateId] : []}
                onOptionSelect={(_, d) => patchFilter({ clusterStateId: d.optionValue ?? null })}
              >
                {(states.data ?? []).map((o) => (
                  <Option key={o.id} value={o.id}>{o.label}</Option>
                ))}
              </Dropdown>
            </Field>
            {clearButton(filter.clusterStateId, () => patchFilter({ clusterStateId: null }), "Status")}
          </div>
        </div>
      </div>

      <div className={s.gridArea}>
        <DataGrid
          rows={list.rows}
          columns={columns}
          rowKey={(r) => r.id}
          loading={list.isLoading}
          selectionMode="single"
          selectedKey={selectedId}
          onRowClick={(r) => setSelectedId(r.id)}
          zebra
          horizontalScroll
          // GUIDE p06: the colour bar is a row decoration next to Project Name, not its own
          // column — see the note above `columns`.
          rowAccent={(r) => r.accentColor}
          rowAccentLabel={(r) => r.approvalLabel}
          sort={gridSort}
          onSortChange={onSortChange}
          // The order is what `$skip` is measured against, so there is no coherent unsorted
          // state to clear to.
          allowClearSort={false}
          emptyMessage={
            list.isError
              ? "The project list could not be loaded."
              : "No project matches these filters."
          }
          caption="Clear a filter with the funnel beside it."
          footer={
            <GridPager
              totalRows={list.totalRows}
              page={paging.page}
              pageSize={DEFAULT_PAGE_SIZE}
              loading={list.isLoading}
              onPageChange={(p) => write({ filter, sort, page: p }, true)}
            />
          }
        />
      </div>

      {/* Rule 23 — the Draft lock. Informational: there is nothing to confirm. */}
      <ConfirmDialog
        open={lockedSections !== null}
        intent="info"
        title="The cost module is not available yet"
        onCancel={() => setLockedSections(null)}
      >
        <Text>
          <strong>{selected?.name}</strong> still needs the following before costs can be
          entered:
        </Text>
        <ul className={s.lockList}>
          {(lockedSections ?? []).map((sec) => <li key={sec}>{sec}</li>)}
        </ul>
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmDelete}
        intent="danger"
        title="Delete this project?"
        confirmLabel={remove.isPending ? "Deleting…" : "Delete project"}
        busy={remove.isPending}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          if (!selected) return;
          remove.mutate(
            { id: selected.id, name: selected.name },
            {
              onSuccess: () => {
                setSelectedId(null);
                setConfirmDelete(false);
              },
            },
          );
        }}
      >
        <Text>
          <strong>{selected?.name}</strong> ({selected?.internalProjectId}) and everything linked to
          it will be removed. This cannot be undone.
        </Text>
        {remove.isError && (
          <Text className={mergeClasses(s.error)}>
            {/* SOURCE DEFECT: the canvas string reads "Error: Permit could not be deleted." —
                a copy/paste from the Planning screen. `deleteMessages` carries the correction
                and `deleteMessagesCanvasParity` keeps the original pinned by a test. */}
            {deleteMessages(selected?.name ?? "").error}
          </Text>
        )}
      </ConfirmDialog>
    </div>
  );
}
