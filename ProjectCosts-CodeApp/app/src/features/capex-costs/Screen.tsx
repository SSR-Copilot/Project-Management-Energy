/**
 * DEVEX/CAPEX — composition only.
 *
 * Every decision this screen makes lives in `./rules.ts` (and, for the panel's own
 * presentation arithmetic, `./panelRules.ts`); every write in `useCapexWrites`. That split is
 * stage 2.0 of `docs/06-DEMO-COMPLETION-PLAN.md`, and it exists because the three defects that
 * shipped from this feature were all in logic that sat inline here, where no test could reach
 * it.
 *
 * Layout references for the Add/Edit Costs panel:
 *   `Existing Solution/UI Screenshots/Cost App Landing Screen - Devex Capex Screen - Add Cost Panel.png`
 *   `Existing Solution/UI Screenshots/Cost App - Edit Contract - Year Cost Inputs.png`
 *
 * Two columns. LEFT is the form, in the canvas' order, with red `*` markers. RIGHT is the year
 * gallery: one 42 px row per year reading `2015  Allocated Cost: 0 EUR` with a chevron at the
 * far right, and — for the ONE year that is open — twelve rows of `January 2020` + a number
 * box. It was `<details>/<summary>` with a floated `⌄` glyph and a two-across month grid,
 * which is what the client saw as "distorted".
 */
import { useMemo, useState } from "react";
import {
  Button, Checkbox, Dropdown, Input, Option, Switch, makeStyles, mergeClasses, tokens,
} from "@fluentui/react-components";
import {
  AddRegular, ArrowLeftRegular, ArrowRightRegular, ChevronDownRegular, ChevronUpRegular,
} from "@fluentui/react-icons";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ConfirmDialog, EmptyState, FormPanel, LoadingOverlay } from "@/components";
import { costLocation } from "@/app/deepLinks";
import { useSession } from "@/app/SessionContext";
import { palette, space } from "@/theme/tokens";
import { CLUSTERS, amount, type CostLine } from "../costing/model";
import {
  useCapexComments, useCapexTotals, useCapexWrites, useCostBook, useMilestoneDurations,
  useProjectStates, useStandardAssumptions,
} from "../costing/useCostBook";
import { COMMENT_TYPE, commentCosts, commentThreads, gridCommentIndicators } from "./comments";
import { Choices, CostField, CostSelect, PanelButtons, PanelExtraButton } from "../costing/Fields";
import { costLabel, currencyCode } from "../contracts/rules";
import { PcfGrid } from "./PcfGrid";
import { CommentsPanel } from "./CommentsPanel";
import {
  buildStandardOptions, checkStandardContractClick, standardAssumptionAmount,
} from "./standardContracts";
import { clusterPayments as clusterMoneyPayments } from "./rules";
import type { GridCallback } from "./pcf/ui/GridRenderer";
import {
  clusterBoundaries, clusterDurations, costAllowedStart, canGoNextYear, canGoPreviousYear,
  navigationWindow, projectPeriods, synthesiseClusterDates,
} from "./clusters";
import {
  CATEGORY_LABELS, DESCRIPTION_MAX_LENGTH, FREQUENCY_OPTIONS,
  LINK_TO_MILESTONE_LABEL, NO_MILESTONE, PAYER_FILTERS,
  accountsInCategory, allocatedForYear, averagePayment, canSaveContract, categoryTabs,
  clusterLinkageChanged, clusterLinkageConfirmation, clustersHavingCost,
  formatSummaryAmount, frequencyLabel, initialCostValue, isSummaryTab, newCostLine, panelTitle,
  linkToMilestoneVisible, milestoneOptions, milestoneRelinkResetNeeded,
  needsClusterLinkageConfirmation,
  proposedPayments, reconcilePayments, resolveCategory, resolvedPayments,
  applyDescriptionChange, describeDescriptionError, paidToggleNeedsConfirmation,
  resolvePaidTarget, validateMonthYear, validateTotalCost,
} from "./rules";
import {
  LOADING_COST, LOADING_DATA, PAID_CONFIRM_DESCRIPTION, PAID_CONFIRM_TITLE,
  RECALCULATE_ALLOCATED_COST, SAVING_COSTS,
  allocatedCostLabel, clusterCheckboxState, confirmButtonWidth, defaultSelectedYear,
  distributionLocked, enabledClusters, isoToMonthYear, monthYearLabel, monthYearToIso,
  previousYearFloor, recalculateEnabled, recalculateVisible, recalculatedPayments,
  savingCostLabel, standardContractLoadingLabel,
} from "./panelRules";

const MONTH_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

/**
 * `makeStyles` in this codebase rejects CSS shorthands (`border`, `background`, mixed-unit
 * `padding`), so every edge is written out longhand.
 */
const useStyles = makeStyles({
  /* ── toolbar ─────────────────────────────────────────────────────────── */
  /** Fluent's `Dropdown` defaults to a 250 px `minWidth`, which blows the toolbar apart. */
  payerFilter: { minWidth: "150px", maxWidth: "180px" },
  yearFilter: { minWidth: "96px", maxWidth: "120px" },

  /* ── the Add/Edit Costs panel ────────────────────────────────────────── */
  panelColumns: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
    columnGap: space.xl,
    rowGap: space.xl,
    // Left as `stretch` on purpose: it is what carries the year column's divider the full
    // height of the panel body, as the reference shows.
    "@media (max-width: 899px)": { gridTemplateColumns: "minmax(0, 1fr)" },
  },
  formColumn: { display: "flex", flexDirection: "column", gap: space.l, minWidth: "0" },
  yearColumn: {
    display: "flex", flexDirection: "column", minWidth: "0",
    borderLeftWidth: "1px", borderLeftStyle: "solid",
    borderLeftColor: tokens.colorNeutralStroke2,
    paddingLeft: space.xl,
    "@media (max-width: 899px)": {
      borderLeftStyle: "none", paddingLeft: "0", paddingTop: space.l,
    },
  },

  /** `Select Cluster` — the five checkboxes under a standard `.canvas-field` label. */
  clusterList: { display: "flex", flexDirection: "column", gap: "0" },
  /** `FontColor: themePrimary` + `FontItalic` when the contract is a standard one. */
  standardText: { color: palette.themePrimary, fontStyle: "italic" },
  /** `labelPosition="before"` already lays the row out; this only keeps it flush left. */
  toggle: { alignSelf: "flex-start", marginLeft: "0" },

  /* ── the year gallery ────────────────────────────────────────────────── */
  yearRow: {
    display: "flex", alignItems: "center", gap: space.s, width: "100%",
    minHeight: "42px", textAlign: "left", cursor: "pointer", fontFamily: "inherit",
    paddingTop: space.s, paddingBottom: space.s, paddingLeft: "0", paddingRight: space.s,
    backgroundColor: "transparent",
    borderTopStyle: "none", borderRightStyle: "none",
    borderBottomStyle: "none", borderLeftStyle: "none",
    ":hover": { backgroundColor: palette.Grayscale40 },
  },
  yearNumber: {
    fontWeight: tokens.fontWeightSemibold, fontSize: tokens.fontSizeBase400,
    color: tokens.colorNeutralForeground1,
  },
  yearAllocated: { fontSize: tokens.fontSizeBase300, color: tokens.colorNeutralForeground1 },
  yearChevron: {
    marginLeft: "auto", display: "flex", alignItems: "center",
    color: palette.themePrimary, fontSize: tokens.fontSizeBase500,
  },
  monthList: {
    display: "flex", flexDirection: "column", gap: space.xs, paddingBottom: space.m,
  },
  monthRow: { display: "flex", alignItems: "center", gap: space.m, minHeight: "34px" },
  monthLabel: {
    flexGrow: 1, flexShrink: 1, minWidth: "0",
    fontSize: tokens.fontSizeBase300, color: tokens.colorNeutralForeground1,
  },
  monthInput: { flexGrow: 0, flexShrink: 0, width: "50%", minWidth: "0" },
});

export default function CapexCostsScreen() {
  const styles = useStyles();
  const navigate = useNavigate();
  const [search, setSearch] = useSearchParams();
  const category = resolveCategory(search.get("category"));

  /*
   * The category is resolved BEFORE the fetch so only the open tab's costs are requested. The
   * Summary tab uses `SUMMARY_CATEGORY` (-1, from `resolveCategory`) rather than `undefined` —
   * no CAPEX account has that category, so it still fetches zero cost lines (the Summary tab
   * reads the far cheaper per-category totals instead), but it stays a real number. `undefined`
   * is reserved for the O&M / Land Lease / Other OPEX screens (`useCostBook()` with no
   * argument), which is how `loadCostBook` knows to also load period rows — passing `undefined`
   * here as well made every CAPEX Summary-tab load run those period queries too and fail
   * whenever they errored, which is what broke the CAPEX tab entirely.
   */
  const scoped = category;
  const { data: book, isLoading, error, save, projectId } = useCostBook(scoped);
  const totals = useCapexTotals(isSummaryTab(category));
  const writes = useCapexWrites(scoped);
  const { project } = useSession();
  const isoCurrencyCode = project?.isoCurrencyCode;
  /** `Coalesce(gblRecordSelectedProjectCountry.'ISO Currency Code', "EUR")`, once. */
  const currency = currencyCode(project ?? {});
  /** `locProjectStartClusterNo` — 0 = Greenfield. Gates the five cluster checkboxes. */
  const startClusterNo = project?.startClusterNo ?? 0;

  const busy = writes.setPaid.isPending || writes.saveLine.isPending || writes.deleteLine.isPending;
  const writeError = writes.setPaid.error ?? writes.saveLine.error ?? writes.deleteLine.error;

  /*
   * The cluster timeline and the year window come from the project's own milestone columns —
   * `gblClusterDurations` in `OnStart.txt`. They replace the six hard-coded dates and the fixed
   * 2015-2030 stepper. A project with gaps in its milestone chain simply yields fewer clusters
   * and a narrower window rather than dates in year 0.
   */
  const clusters = clusterDurations(project?.milestones);
  const boundaries = clusterBoundaries(project?.milestones);
  // `locProjectStartClusterNo` decides whether the acquisition date or the project start date
  // is preferred (`CapexScreenCode.txt:75-115`) — defaulting it to 0 picks the wrong one for
  // every acquired project.
  const allowedStart = costAllowedStart(project ?? {}, startClusterNo);
  const [rawYear, setYear] = useState<number | null>(null);
  const window = navigationWindow(project ?? {}, clusters, allowedStart.year, rawYear);
  /*
   * `Coalesce(gblSelectedProjectYear, locCostAllowedStartYear, locNavigationMinYear,
   * Year(Today()))`, clamped — NOT `Year(Today())` on its own, which opened a 2015-2019
   * project on a year it has no periods for.
   */
  const year = defaultSelectedYear({
    selectedYear: rawYear,
    costAllowedStartYear: allowedStart.year,
    navigationMinYear: window.min,
    navigationMaxYear: window.max,
  });
  /** The ◀ floor, which is allowed to be LATER than the dropdown's first entry. */
  const yearFloor = previousYearFloor({
    costAllowedStartYear: allowedStart.year, navigationMinYear: window.min,
  });
  const [showEmpty, setShowEmpty] = useState(true);
  const [showPlanned, setShowPlanned] = useState(false);
  const [payer, setPayer] = useState<string>(PAYER_FILTERS[0]);
  const [edit, setEdit] = useState<CostLine | null>(null);
  const [costValue, setCostValue] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [commentFor, setCommentFor] = useState<string | null>(null);
  /** Exactly one year's months are visible at a time — the reference shows no second one. */
  const [openYear, setOpenYear] = useState<number | null>(null);
  /** What the `MM/YYYY` boxes hold while the user is still typing. */
  const [startText, setStartText] = useState("");
  const [endText, setEndText] = useState("");
  /** The description the panel opened with, so Edit does not flag a contract's own name. */
  const [originalDescription, setOriginalDescription] = useState<string | null>(null);
  const [paidRequest, setPaidRequest] = useState<
    { lineId: string; year: number; month: number; paid: boolean; costId: string } | null
  >(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [standardName, setStandardName] = useState<string | null>(null);
  /** `locShowClusterLinkageConfirmation` — Save stopped and asked. */
  const [linkConfirmOpen, setLinkConfirmOpen] = useState(false);
  /**
   * `locSpinnerInformationText` for the save that is in flight.
   *
   * Latched rather than derived, because `persist()` closes the panel BEFORE it awaits the
   * write (see the note there) and `edit` — which decides between "the cost" and "costs" — is
   * null from that moment on.
   */
  const [savingLabel, setSavingLabel] = useState<string | null>(null);

  /*
   * Standard-contract options need the sub-accounts on THIS tab, which need `book` — but hooks
   * cannot run conditionally, so this is computed defensively (empty before `book` loads) and
   * called unconditionally, ahead of the loading/error guards below.
   */
  const categoryAccounts = book ? accountsInCategory(book.accounts, category) : [];
  const subaccountIds = categoryAccounts.filter(a => a.parentId).map(a => a.id);
  const std = useStandardAssumptions(subaccountIds);
  /** `Project States` — the "Link to Milestone" dropdown's `Items`. Ten rows, session-cached. */
  const projectStates = useProjectStates();
  /** `varMilestoneDurations` — consumed ONLY by the standard-contract path below. */
  const milestoneDurations = useMilestoneDurations(std.countryId, std.technology);

  /*
   * The grid's red dots — `colCapexCommentsInSelectedContracts` + `colCapexCommentsLatest`
   * (`Comments_PCF_CodeSnippets.txt`), loaded once for the whole open category rather than per
   * contract when the panel opens, because `HasComments` is asked of EVERY contract row.
   *
   * The month a payment-date comment belongs to lives on the COST row it links to, not on the
   * comment — so the `{id, contractId, year, month}` projection the indicators need comes
   * straight off the cost book's payments (`Payment.id` IS `vsb_capexcostid`), with no second
   * query. `year` is the year the grid is showing, which is the whole reason a dot appears on
   * one year's March and not another's.
   */
  const contractIds = useMemo(() => (book?.lines ?? []).map(l => l.id), [book]);
  const comments = useCapexComments(contractIds);
  const commentFlags = useMemo(
    () => gridCommentIndicators(commentThreads(comments.data ?? []), commentCosts(book?.lines), year),
    [book, comments.data, year],
  );

  if (isLoading) return <LoadingOverlay mode="inline" label={LOADING_COST} />;
  if (!book || error) {
    return <EmptyState title="Cost data is unavailable"
      description="This project's Cost data could not be loaded." />;
  }

  const update = (patch: Partial<CostLine>) =>
    setEdit(current => current ? { ...current, ...patch } : null);

  /**
   * Any hand-edit of a standard contract clears its flag and strips the reserved word from its
   * description (`CapexScreenCode.txt:11328-11344`, `:11480-11497`). Left set, the contract
   * keeps the blue italic styling and still counts as "already created", so its standard
   * option never comes back.
   */
  const clearStandardFlag = (description: string, wasStandard: boolean) => {
    const next = applyDescriptionChange(description, wasStandard);
    return { description: next.description, standard: next.isStandardContract };
  };

  const chooseCategory = (i: number) => {
    const next = new URLSearchParams(search);
    if (isSummaryTab(i)) next.delete("category"); else next.set("category", String(i));
    setSearch(next, { replace: true });
  };

  const open = (accountId: string, line?: CostLine) => {
    setCostValue(initialCostValue(line));
    // A cluster below the project's start cluster is not offered, so it must not be carried
    // either — the canvas serialises a ticked-but-disabled cluster as `false`.
    const next = line
      ? { ...structuredClone(line), clusters: enabledClusters(line.clusters, startClusterNo) }
      : newCostLine(accountId, crypto.randomUUID());
    setEdit(next);
    setStartText(isoToMonthYear(next.startDate));
    setEndText(isoToMonthYear(next.endDate));
    setOriginalDescription(line ? line.description : null);
    setOpenYear(null);
    // `locShowClusterLinkageConfirmation: false` on both the Add and the Edit trigger
    // (`CapexScreenCode.txt:7156`, `:7192`) — a dialog dismissed on the last contract must not
    // reappear over the next one.
    setLinkConfirmOpen(false);
  };

  const closePanel = () => { setEdit(null); setOpenYear(null); setLinkConfirmOpen(false); };

  /*
   * ── the standard-contract cluster timeline ───────────────────────────────────────────────
   *
   * `synthesiseClusterDates` back-computes the milestones an ACQUIRED project never had, from
   * the country's and technology's average durations. It is applied HERE AND NOWHERE ELSE, and
   * that placement is canvas-exact and deliberate:
   *
   *   - `OnStart.txt:849-900` builds `gblClusterDurations` from the project's own milestone
   *     columns with NO synthesis, and everything downstream of it — the grid, the cluster
   *     picker, the year window — reads those raw values;
   *   - the back-computation exists solely inside `btn_Capex_Cost_Add_Standard_Contract_Code`
   *     (`CapexScreenCode.txt:18062` opens the control, `:18138-18356` is the block), feeding
   *     `colStandardCostAllSelectedClusters`.
   *
   * So `clusters` / `boundaries` above stay raw, and a project with milestone gaps really does
   * keep losing clusters from the picker and from the year window. `06-DEMO-COMPLETION-PLAN.md:
   * 97-101` proposes applying the synthesis to those as well; that was considered and DECLINED
   * by the client in favour of canvas parity.
   */
  const standardMilestones = synthesiseClusterDates(project ?? {}, milestoneDurations.data);
  const standardClusters = clusterDurations(standardMilestones);
  const standardBoundaries = clusterBoundaries(standardMilestones);

  // `buildStandardOptions` — country + technology + category + not already created. Existing
  // standard contracts are read from the lines already loaded for this tab.
  const standardOptions = buildStandardOptions({
    assumptions: std.assumptions,
    subaccountIdsInCategory: subaccountIds,
    // `startClusterNo` was hard-coded to 0 here while the real value sat in scope 100 lines
    // above, so assumptions were offered — AND created with money — for clusters the project
    // had already passed (`CapexScreenCode.txt:18289-18300`).
    project: { countryId: std.countryId, technology: std.technology, startClusterNo },
    existingContracts: book.lines
      .filter(l => l.standard)
      .map(l => ({ subaccountId: l.accountId, standardAssumptionId: l.standardAssumptionId })),
    clusters: standardClusters,
  });
  const pcfStandardOptions = standardOptions.map(o => ({
    id: o.assumption.id, subaccountId: o.assumption.subaccountId, name: o.assumption.description,
  }));

  const addStandardContract = (subaccountId: string, assumptionId: string) => {
    const option = standardOptions.find(o => o.assumption.id === assumptionId);
    const check = checkStandardContractClick({
      subaccountSelected: Boolean(subaccountId),
      alreadyExists: !option,
    });
    // `window` is shadowed by the year-navigation range above; use globalThis explicitly.
    if (!check.ok) { if (check.message) globalThis.alert(check.message); return; }
    const { assumption, eligible } = option!;
    const amt = standardAssumptionAmount(assumption.unit, assumption.costAmount, {
      totalCapacity: std.totalCapacity, activeWtgCount: std.activeWtgCount,
    });
    // The SYNTHESISED boundaries, matching `eligible` — which came from `standardClusters`.
    // Distributing over the raw `boundaries` would skip exactly the clusters the synthesis
    // just made eligible, and the money would silently go nowhere.
    const payments = clusterMoneyPayments(
      amt, eligible.map(c => c.order), assumption.distributionFrequency, standardBoundaries,
    );
    const newLine: CostLine = {
      id: crypto.randomUUID(), accountId: subaccountId, description: assumption.description,
      payer: assumption.costPaidBy === 952850001 ? "DevCo" : "SPV",
      depreciation: assumption.depreciation, vat: assumption.applyVat, standard: true,
      distribution: "equal", equalMode: "cluster", distributionScheme: "absolute",
      startDate: "", endDate: "", frequency: assumption.distributionFrequency,
      clusters: eligible.map(c => c.order), payments: [], comments: [],
      totalCost: amt, standardAssumptionId: assumption.id,
    };
    // Two round trips (the contract row, then its months) — the spinner names which one.
    setStandardName(assumption.description);
    writes.saveLine.mutate({
      line: newLine, accountId: subaccountId, isNew: true,
      payments: payments.map(p => ({ year: p.year, month: p.month, amount: p.amount })),
    }, { onSettled: () => setStandardName(null) });
  };

  const onAction: GridCallback = (action, id, standardContractId, paid) => {
    if (action === "Add") open(id);
    if (action === "AddStandardContract" && standardContractId) {
      addStandardContract(id, standardContractId);
    }
    if (action === "Edit") {
      const line = book.lines.find(c => c.id === id);
      if (line) open(line.accountId, line);
    }
    if (action === "Delete") setDeleting(id);
    if (action === "Comment") setCommentFor(id);
    if (action === "SetCostPaidUnpaid" && paid) {
      // Dataverse updates the COST row; the grid only knows the contract row, so the month is
      // resolved back to its payment here. A month with no row is TOLD to the user rather than
      // patched as `costId: undefined`, which silently did nothing.
      const line = book.lines.find(c => c.id === id);
      const target = line
        ? resolvePaidTarget(line.payments, paid.year, paid.month)
        : { error: "No monthly cost row found for the selected contract/month/year." };
      if ("error" in target) { setActionError(target.error); return; }
      setActionError(null);
      const request = {
        lineId: id, year: paid.year, month: paid.month, paid: paid.paid, costId: target.costId,
      };
      // Marking a cluster-linked, individually-distributed cost paid also clears the cluster
      // link for the WHOLE contract, so the canvas asks first (`:19833`).
      if (line && paidToggleNeedsConfirmation(line)) setPaidRequest(request);
      else writes.setPaid.mutate(request);
    }
  };

  const rawProposed = proposedPayments(edit, costValue, boundaries);
  // Individual + percent proposes PERCENTAGES; everything downstream — the year totals, the
  // save, the average — needs MONEY. `resolvedPayments` is the one place that conversion
  // happens, so the panel's month boxes stay showing the raw percent the user typed.
  const proposed = edit ? resolvedPayments(edit, costValue, rawProposed) : [];
  const average = averagePayment(costValue, proposed.length);
  const isEdit = book.lines.some(c => c.id === edit?.id);

  /* ── inline validation (`lbl_..._ErrorMessage_1`) ───────────────────────── */

  const siblingNames = edit
    ? book.lines.filter(l => l.accountId === edit.accountId && l.id !== edit.id)
      .map(l => l.description)
    : [];
  const descriptionError = edit
    ? describeDescriptionError(edit.description, originalDescription, siblingNames)
    : null;
  /*
   * `totalCostMax` is `gblRecordSelectedProjectCountry.Name = "Poland" ? 2.25bn : 500m`
   * (`CapexScreenCode.txt:10770`), so the ceiling needs the country's NAME, not its id.
   * `loadProject` reads it in the same request it already makes for the ISO currency.
   */
  const countryName = project?.countryName;
  const showsTotalCost = Boolean(edit)
    && (edit?.distribution === "equal" || edit?.distributionScheme === "percent");
  const totalCostCheck = validateTotalCost(costValue, countryName);
  const totalCostError = showsTotalCost && costValue.trim() !== "" && !totalCostCheck.valid
    ? totalCostCheck.message
    : null;
  const showsDates = edit?.distribution === "equal" && edit.equalMode === "dates";
  const startDateError = showsDates
    ? validateMonthYear(startText, allowedStart.date, "start")
    : null;
  const endDateError = showsDates ? validateMonthYear(endText, allowedStart.date, "end") : null;

  const valid = canSaveContract(edit, costValue, rawProposed)
    && !descriptionError && !totalCostError && !startDateError && !endDateError;

  /* ── Link to Milestone (`drp_…_Form_Link_to_Cluster`) ───────────────────── */

  /** The row the panel opened on — `locSelectedProjectContract`. */
  const storedLine = book.lines.find(c => c.id === edit?.id);
  /** `Items` minus the "None" the dropdown prepends. */
  const milestones = milestoneOptions(
    projectStates.data ?? [], project?.clusterStateOrder, startClusterNo,
  );
  const selectedMilestone = edit?.linkedClusterName ?? NO_MILESTONE;
  /**
   * The three canvas context variables the Save gate reads. All THREE are derived from the
   * form rather than latched in an `OnChange`: the canvas resets them to `false` every time the
   * panel opens (`CapexScreenCode.txt:7156-7158`, `:7192-7194`) and sets them from exactly these
   * comparisons, so recomputing them is equivalent and cannot go stale.
   */
  const linkageChanged = clusterLinkageChanged(selectedMilestone, storedLine?.linkedClusterName);
  // `locCostPaidByChanged: locInitialCostPaidBy <> Self.Selected.Value` (`:12127`), where
  // `locInitialCostPaidBy` is the coalesced payer the panel opened with — our `CostLine.payer`.
  const costPaidByChanged = Boolean(storedLine) && edit?.payer !== storedLine?.payer;
  const relinkResetNeeded = edit !== null && milestoneRelinkResetNeeded({
    selectedName: selectedMilestone,
    storedName: storedLine?.linkedClusterName,
    payments: storedLine?.payments ?? [],
    paymentDateCommentCount: (comments.data ?? []).filter(
      c => c.contractId === edit.id && c.commentType === COMMENT_TYPE.paymentDate,
    ).length,
  });
  /** `colOtherClusterHavingCost` — against the RAW timeline, as the canvas' `gblClusterDurations`. */
  const clustersWithCost = clustersHavingCost(
    clusters, proposed.map(p => ({ year: p.year, month: p.month, cost: p.amount })),
  );
  const needsLinkConfirmation = edit !== null && needsClusterLinkageConfirmation({
    clusters,
    rows: proposed.map(p => ({ year: p.year, month: p.month, cost: p.amount })),
    selectedClusterOrder: edit.linkedClusterOrder,
    clusterLinkageChanged: linkageChanged,
    costPaidByChanged,
    milestoneRelinkResetNeeded: relinkResetNeeded,
  });
  const linkConfirmation = clusterLinkageConfirmation({
    costPaidByChanged,
    payer: edit?.payer ?? "SPV",
    clusterLinkageChanged: linkageChanged,
    milestoneRelinkResetNeeded: relinkResetNeeded,
    clustersWithCost,
    selectedName: selectedMilestone,
    selectedOrder: edit?.linkedClusterOrder,
  });

  /**
   * The dropdown itself, rendered in whichever branch is live — see `linkToMilestoneVisible`.
   *
   * A STORED LINK MAY NOT BE IN `Items`. The canvas sets `DefaultSelectedItems` to the
   * contract's own `'Linked Cluster'` (`:11237-11243`) independently of the `Items` filter, so a
   * project that has since advanced past the linked cluster shows a selection it can no longer
   * offer. Two live contracts on "Leuvanneva" are exactly that today — linked to Cluster 3 on a
   * project whose Cluster State is Cluster 3, which `Order > 3` excludes. Reproduced: `value` is
   * the stored name whether or not it is among the options, and re-picking it is impossible,
   * which is the canvas' behaviour and not a bug to fix here.
   */
  const linkToMilestoneField = edit && linkToMilestoneVisible(edit) ? (
    <CostSelect label={LINK_TO_MILESTONE_LABEL} required value={selectedMilestone}
      options={[NO_MILESTONE, ...milestones.map(m => m.name)]}
      onChange={v => {
        const hit = milestones.find(m => m.name === v);
        update(hit
          ? { linkedClusterId: hit.id, linkedClusterName: hit.name, linkedClusterOrder: hit.order }
          : { linkedClusterId: undefined, linkedClusterName: undefined, linkedClusterOrder: undefined });
      }} />
  ) : null;

  const persist = async () => {
    if (!edit) return;
    /*
     * THE PANEL CLOSES FIRST, THEN THE SPINNER APPEARS.
     *
     * Both save branches of the canvas Save button raise the spinner and dismiss the panel in
     * ONE `UpdateContext` — `{locIsVisiblePopUpSpinner: true, locSpinnerInformationText: …,
     * locIsVisibleRightPanelAddContract: false, …}` (`CapexScreenCode.txt:17413`, the extracted
     * `OnSelect` at lines 717-721 and 1487-1493) — and only then start patching. The relink
     * popup's `OnConfirm` does the same before it re-triggers Save (`:19906-19912`).
     *
     * This used to `await` the write with the panel still mounted and close it afterwards, so
     * the spinner was drawn on top of the panel it was saving. The client's reference is
     * explicit about the order, filename and all: "Panel Closes and Spinner is shown".
     */
    setSavingLabel(savingCostLabel(edit.distribution));
    closePanel();
    /*
     * `reconcilePayments` carries the ids of the months the line already had — so a month that
     * had a row updates it and one that did not creates it — AND emits an `amount: null`
     * tombstone for every month the new schedule drops, which `capexWriteSet` turns into a
     * delete. Mapping `proposed` alone made a save purely additive: widening the frequency or
     * shortening the range left the old months behind with their old money.
     */
    const stored = storedLine?.payments ?? [];
    try {
      await writes.saveLine.mutateAsync({
        line: { ...edit, totalCost: costValue.trim() === "" ? undefined : Number(costValue) },
        accountId: edit.accountId,
        isNew: !isEdit,
        payments: reconcilePayments(stored, proposed),
        // The dialog's third bullet is a promise; `saveCostLine` keeps it.
        resetPaidAndPaymentDateComments: relinkResetNeeded,
      });
    } catch {
      // Swallowed on purpose: `writes.saveLine.error` is already rendered as the screen's error
      // banner below, and re-throwing here only produces an unhandled rejection because the
      // Save button calls this as `void commit()`.
    } finally {
      setSavingLabel(null);
    }
  };

  /**
   * Save — which, on the canvas, is not always a save.
   *
   * `If(locValidCostInContract, If(<the three conditions>, show the popup, save))`
   * (`CapexScreenCode.txt:17413` / `:17526`). The popup's `OnConfirm` re-triggers the same Save
   * button with the flags cleared, which is what `persist()` is here.
   */
  const commit = async () => {
    if (!edit || !valid) return;
    if (needsLinkConfirmation) { setLinkConfirmOpen(true); return; }
    await persist();
  };

  /** The year gallery's `Allocated Cost:` figure — percent rows show what was TYPED. */
  const allocatedLabel = (y: number) => allocatedCostLabel(
    edit?.distributionScheme === "percent"
      ? allocatedForYear(rawProposed, y)
      : allocatedForYear(proposed, y),
    edit?.distributionScheme ?? "absolute",
    currency,
  );

  return <div className="canvas-cost-screen">
    <div role="tablist" aria-label="CAPEX categories" className="canvas-capex-tabs">
      {categoryTabs().map((label, i) => (
        <button key={label} role="tab" aria-selected={category === i - 1}
          onClick={() => chooseCategory(i - 1)}>{label}</button>
      ))}
    </div>

    {isSummaryTab(category) ? (
      totals.isLoading ? <LoadingOverlay mode="inline" label={LOADING_DATA} /> : (
        <table className="canvas-capex-summary" aria-label="DEVEX/CAPEX Summary"><tbody>
          {CATEGORY_LABELS.map((name, i) => (
            <tr key={name}>
              <td>{name}</td>
              <td>{formatSummaryAmount(totals.data?.find(t => t.category === i)?.total)} {currency}</td>
            </tr>
          ))}
          <tr>
            <td>Total CAPEX</td>
            <td>
              {formatSummaryAmount((totals.data ?? []).reduce((sum, t) => sum + t.total, 0))}
              {" "}{currency}
            </td>
          </tr>
        </tbody></table>
      )
    ) : <>
      <div className="canvas-cost-toolbar">
        <Button appearance="transparent" icon={<AddRegular />} onClick={() => {
          const to = costLocation("/costs/add-from-table", projectId!);
          navigate({ ...to, search: `${to.search}&category=${category}` });
        }}>Add Cost from Table</Button>
        <Switch label="Show Empty Accounts" checked={showEmpty}
          onChange={(_, d) => setShowEmpty(d.checked)} />
        <Switch label="Show Total Planned/Paid" checked={showPlanned}
          onChange={(_, d) => setShowPlanned(d.checked)} />
        <Dropdown className={styles.payerFilter} aria-label="Cost paid by filter"
          value={payer} selectedOptions={[payer]}
          onOptionSelect={(_, d) => { if (d.optionValue) setPayer(d.optionValue); }}>
          {PAYER_FILTERS.map(v => <Option key={v} value={v}>{v}</Option>)}
        </Dropdown>
        <Button appearance="transparent" icon={<ArrowLeftRegular />} aria-label="Previous year"
          disabled={!canGoPreviousYear(year, yearFloor)}
          onClick={() => setYear(Math.max(year - 1, yearFloor))} />
        <Dropdown className={styles.yearFilter} aria-label="Cost year"
          value={String(year)} selectedOptions={[String(year)]}
          onOptionSelect={(_, d) => { if (d.optionValue) setYear(Number(d.optionValue)); }}>
          {projectPeriods(window.min, window.max).map(y => (
            <Option key={y} value={String(y)}>{String(y)}</Option>
          ))}
        </Dropdown>
        <Button appearance="transparent" icon={<ArrowRightRegular />} aria-label="Next year"
          disabled={!canGoNextYear(year, window.max)} onClick={() => setYear(year + 1)} />
      </div>
      <PcfGrid key={category} accounts={categoryAccounts}
        lines={book.lines} year={year} showEmpty={showEmpty} showPlanned={showPlanned}
        payer={payer} clusterDates={boundaries} standardOptions={pcfStandardOptions}
        commentFlags={commentFlags} onAction={onAction} />
    </>}

    <FormPanel open={!!edit} width="cost" onDismiss={closePanel}
      title={panelTitle(isEdit, book.accounts.find(a => a.id === edit?.accountId)?.name ?? "")}
      footer={<PanelButtons onSave={() => { void commit(); }} onCancel={closePanel}
        disabled={!valid || busy}
        /*
         * `btn_Right_Panel_Add_Contract_Calculate_Allocated_Cost` — the third footer button,
         * between Save and Cancel (`CapexScreenCode.txt:17537-17993`). Present only for an
         * Individual Distribution, because that is the only mode whose months are typed.
         */
        extra={recalculateVisible(edit) ? (
          <PanelExtraButton label={RECALCULATE_ALLOCATED_COST}
            disabled={busy || !recalculateEnabled({ line: edit, costValue, saveEnabled: valid })}
            onClick={() => {
              if (!edit) return;
              update({ payments: recalculatedPayments(edit.payments, edit.distributionScheme) });
            }} />
        ) : undefined} />}>
      {edit ? <div className={styles.panelColumns}>
        {/* ── left: the form ─────────────────────────────────────────────── */}
        <div className={styles.formColumn}>
          <CostField label="Description" required maxLength={DESCRIPTION_MAX_LENGTH}
            value={edit.description} error={descriptionError ?? undefined}
            onChange={v => update(clearStandardFlag(v, edit.standard))} />
          {/*
            * BOTH radio groups go read-only on an existing contract —
            * `=If(Not(locSelectedCostRow.IsContract), DisplayMode.Edit, DisplayMode.View)` on
            * `rad_…_DistributionType_1` (`:10445`) and `rad_…_DistributionScheme_1` (`:10585`).
            * Nothing else in the panel is gated: `rad_…_DistributionBy_1` carries the same
            * formula COMMENTED OUT followed by a bare `DisplayMode.Edit` (`:10697`), and Link
            * to Milestone / Cost Paid By / Apply VAT / Depreciation set no `DisplayMode` at all.
            */}
          <Choices label="Distribution" disabled={distributionLocked(isEdit)}
            value={edit.distribution === "equal" ? "Equal Distribution" : "Individual Distribution"}
            options={["Equal Distribution", "Individual Distribution"]}
            onChange={v => update({
              distribution: v.startsWith("Equal") ? "equal" : "individual", payments: proposed,
            })} />
          {edit.distribution === "individual" ? <>
            {/*
              * `required` because `lbl_…_Fields_Label_Asterisk` next to the Distribution Scheme
              * label is `Visible: =true` (`CapexScreenCode.txt:10545`+), while the ones beside
              * `Distribution` (`:10409`+) and `Cost Paid By` (`:12053`+) are `Visible: =false`.
              * The client's screenshot shows exactly that: a star on Distribution Scheme and
              * Link to Milestone, none on Distribution or Cost Paid By.
              */}
            <Choices label="Distribution Scheme" required disabled={distributionLocked(isEdit)}
              value={edit.distributionScheme === "percent" ? "% Values" : "Absolute Values"}
              options={["Absolute Values", "% Values"]}
              onChange={v => update({
                distributionScheme: v === "% Values" ? "percent" : "absolute",
              })} />
            {edit.distributionScheme === "percent" ? (
              <CostField label={costLabel("Total Costs", { isoCurrencyCode })} required
                value={costValue} type="number" error={totalCostError ?? undefined}
                onChange={setCostValue} />
            ) : null}
            {/* `con_…_Form_Link_to_Cluster` sits above the Cost Paid By radio (`:11178` vs
              * `:12100`), and an individual distribution has no cluster or date fields between
              * them. */}
            {linkToMilestoneField}
          </> : null}
          {edit.distribution === "equal" ? <>
            <Choices label="Equal Distribution" required
              value={edit.equalMode === "cluster" ? "By Cluster" : "By Start and End Date"}
              options={["By Cluster", "By Start and End Date"]}
              onChange={v => update({ equalMode: v === "By Cluster" ? "cluster" : "dates" })} />
            <CostField label={costLabel("Total Costs", { isoCurrencyCode })} required
              value={costValue} type="number" error={totalCostError ?? undefined}
              onChange={setCostValue} />
            {edit.equalMode === "cluster" ? (
              // `.canvas-field` so the label matches every other field's, star and all.
              <div className="canvas-field">
                <span data-required="true">Select Cluster</span>
                <div className={styles.clusterList}>{CLUSTERS.map((label, i) => {
                  const clusterNo = i + 1;
                  // `Checked = stored && startClusterNo <= N`, `DisplayMode` likewise.
                  const state = clusterCheckboxState(
                    clusterNo, startClusterNo, edit.clusters.includes(clusterNo),
                  );
                  return <Checkbox key={label} checked={state.checked} disabled={!state.enabled}
                    label={<span className={mergeClasses(edit.standard && styles.standardText)}>
                      {`Cluster ${clusterNo}: ${label}`}
                    </span>}
                    onChange={(_, d) => update({
                      ...clearStandardFlag(edit.description, edit.standard),
                      clusters: d.checked
                        ? [...edit.clusters, clusterNo].sort((a, b) => a - b)
                        : edit.clusters.filter(c => c !== clusterNo),
                    })} />;
                })}</div>
              </div>
            ) : <>
              {/* Canvas order: Link to Cluster (`:11178`) THEN the Start/End Date group
                * (`:11345`). `linkToMilestoneVisible` is what makes it absent in By Cluster
                * mode, so rendering it in both branches shows it in exactly one. */}
              {linkToMilestoneField}
              {/*
                * `txt_AddContract_RightPanel_StartDate_1` is a TextInput with an `MM/YYYY`
                * placeholder (`CapexScreenCode.txt:11420-11445`) — there is no day component
                * anywhere in this feature, and a `type="date"` picker invented one.
                */}
              <CostField label="Start Date" required placeholder="MM/YYYY" value={startText}
                error={startDateError ?? undefined}
                onChange={v => { setStartText(v); update({ startDate: monthYearToIso(v) }); }} />
              <CostField label="End Date" required placeholder="MM/YYYY" value={endText}
                error={endDateError ?? undefined}
                onChange={v => { setEndText(v); update({ endDate: monthYearToIso(v) }); }} />
            </>}
            <CostSelect label="Distribution Frequency" required
              value={frequencyLabel(edit.frequency)}
              options={FREQUENCY_OPTIONS.map(frequencyLabel)}
              onChange={v => update({ frequency: parseInt(v, 10) })} />
            <CostField label={costLabel("Average Amount per Payment", { isoCurrencyCode })}
              value={average === undefined ? "" : amount(average)} disabled />
          </> : null}
          <Choices label="Cost Paid By" value={edit.payer} options={["DevCo", "SPV"]}
            onChange={v => update({ payer: v as CostLine["payer"] })} />
          {/* Label LEFT of the toggle, as the reference shows. */}
          <Switch className={styles.toggle} labelPosition="before" label="Apply VAT"
            checked={edit.vat} onChange={(_, d) => update({ vat: d.checked })} />
          <Switch className={styles.toggle} labelPosition="before" label="Depreciation"
            checked={edit.depreciation}
            onChange={(_, d) => update({ depreciation: d.checked })} />
        </div>

        {/* ── right: the year gallery ────────────────────────────────────── */}
        <div className={styles.yearColumn}>
          {projectPeriods(window.min, window.max).map(y => {
            const expanded = openYear === y;
            return <div key={y}>
              {/*
                * The name is given explicitly: the two spans are inline, so the computed
                * accessible name would otherwise run the year straight into the figure
                * ("2015Allocated Cost: 0 EUR").
                */}
              <button type="button" className={styles.yearRow} aria-expanded={expanded}
                aria-label={`${y} ${allocatedLabel(y)}`}
                onClick={() => setOpenYear(expanded ? null : y)}>
                <span className={styles.yearNumber}>{y}</span>
                <span className={styles.yearAllocated}>{allocatedLabel(y)}</span>
                <span className={styles.yearChevron} aria-hidden="true">
                  {expanded ? <ChevronUpRegular /> : <ChevronDownRegular />}
                </span>
              </button>
              {expanded ? (
                <div className={styles.monthList}>{MONTH_NUMBERS.map(month => {
                  const label = monthYearLabel(month, y);
                  const stored = rawProposed.find(p => p.year === y && p.month === month);
                  return <div key={month} className={styles.monthRow}>
                    <span className={styles.monthLabel}>{label}</span>
                    <Input className={styles.monthInput} type="number" appearance="filled-lighter"
                      aria-label={label} min={0} step="any"
                      disabled={edit.distribution !== "individual"}
                      value={stored === undefined ? "" : String(stored.amount)}
                      onChange={(_, d) => update({
                        payments: [
                          ...edit.payments.filter(p => !(p.year === y && p.month === month)),
                          { year: y, month, amount: Number(d.value), paid: false },
                        ],
                      })} />
                  </div>;
                })}</div>
              ) : null}
            </div>;
          })}
        </div>
      </div> : null}
    </FormPanel>

    <CommentsPanel
      open={!!commentFor}
      contractId={commentFor}
      contractDescription={book.lines.find(c => c.id === commentFor)?.description ?? ""}
      breadcrumb={`${CATEGORY_LABELS[category] ?? ""} / ${book.accounts.find(a => a.id === book.lines.find(c => c.id === commentFor)?.accountId)?.name ?? ""}`}
      payments={book.lines.find(c => c.id === commentFor)?.payments ?? []}
      distribution={book.lines.find(c => c.id === commentFor)?.distribution ?? "equal"}
      onDismiss={() => setCommentFor(null)}
    />

    <ConfirmDialog open={!!deleting} title="Delete Cost"
      description="Delete this cost and its monthly values?" confirmText="Delete" destructive
      onCancel={() => setDeleting(null)}
      onConfirm={() => {
        const line = book.lines.find(c => c.id === deleting);
        if (line) writes.deleteLine.mutate(line);
        setDeleting(null);
      }} />

    {/*
      * `cmp_PopUp_Confirmation_For_SetClusterLinkingConfirmationPopup` (`:19853-19980`). Cancel
      * is `locContinueToSavelinkedCluster: false` — the panel simply stays open with the
      * selection the user made, exactly as the canvas leaves it.
      *
      * It is the ONE instance of `cmp_PopUp_Confirmation_New` on this screen, hence the ⓘ block
      * (`variant="info"`), and the one that passes `IconConfirmButton: ="Text"` /
      * `IconCancelButton: ="CheckMark"` (`:19884-19885`) — so Confirm carries no icon and
      * Cancel carries a ✓, which is what the client's screenshot shows.
      */}
    <ConfirmDialog open={linkConfirmOpen} title={linkConfirmation.title}
      description={linkConfirmation.description} confirmText={linkConfirmation.confirmLabel}
      cancelText={linkConfirmation.cancelLabel}
      variant="info" confirmIcon="none" cancelIcon="checkmark"
      confirmWidth={confirmButtonWidth(linkConfirmation.confirmLabel)}
      onCancel={() => setLinkConfirmOpen(false)}
      onConfirm={() => { setLinkConfirmOpen(false); void persist(); }} />

    {/*
      * `cmp_PopUp_Confirmation_For_SetasPaidUnpaidCostConfirmation` (`:19833-19852`) — the
      * screen's other `cmp_PopUp_Confirmation_New`, with the same `IconConfirmButton: ="Text"` /
      * `IconCancelButton: ="CheckMark"` pair and `WidthConfirmButton: =96`.
      */}
    <ConfirmDialog open={!!paidRequest} title={PAID_CONFIRM_TITLE}
      description={PAID_CONFIRM_DESCRIPTION} confirmText="Confirm"
      variant="info" confirmIcon="none" cancelIcon="checkmark"
      onCancel={() => setPaidRequest(null)}
      onConfirm={() => {
        if (paidRequest) writes.setPaid.mutate(paidRequest);
        setPaidRequest(null);
      }} />

    {/*
      * `cmp_Costs_PopUpLoading` — `Visible: =locIsVisiblePopUpSpinner` (`:18045-18056`), with
      * `InformationText` coming from whichever branch raised it. `savingLabel` is the panel
      * save's ("the cost" for an individual distribution, "costs" for an equal one); the
      * standard-contract path names the assumption it is creating; anything else falls back to
      * the plural form.
      */}
    {busy ? (
      <LoadingOverlay label={standardName
        ? standardContractLoadingLabel(standardName)
        : savingLabel ?? SAVING_COSTS} />
    ) : null}
    {actionError ? <div className="canvas-error" role="alert">{actionError}</div> : null}
    {writeError ? (
      <div className="canvas-error" role="alert">{(writeError as Error).message}</div>
    ) : null}
    {save.error ? (
      <p className="canvas-error" role="alert">{(save.error as Error).message}</p>
    ) : null}
  </div>;
}
