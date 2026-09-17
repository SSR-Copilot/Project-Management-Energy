/**
 * Land Lease Costs Screen.
 *
 * Canvas source: `_extracted/msapp/projectcosts/Src/Land Lease Costs Screen.pa.yaml`
 * (201 controls, 6,299 lines) and its older `.txt` twin. Reference screenshots:
 *   `Cost App - Landlease Tab selected.png`
 *   `Cost App - Add & Edit ContractPeriod Panel - Almost same for Landlease and other Opex also.png`
 *
 * THE CONTROL TREE, and what renders each part:
 *
 *   gal_LandLease_Content_Subaccounts                 -> `cards.map(<SubaccountCard/>)`
 *     con_…_CardHeader_1 + ico_…_Up_2 / _Down_2       -> the card's header button + chevron
 *     con_…_CardBody_1                                -> rendered only when `!card.isFolded`
 *       pcf_…_SubaccountsCommandBar_1                 -> `leaseCommands(...)` -> five buttons
 *       con_…_CostsTableHeader_1 (16 labels)          -> `landLeaseColumns(iso)`
 *       gal_…_CardBody_Costs_1                        -> `subaccountPeriodRows(...)`
 *         img_…_RadioSelection_2                      -> the row's radio input
 *   con_LandLease_RightPanel_NewEditPeriod_1          -> `<FormPanel>`
 *     …_LeftBodyContent  (11 field containers)        -> the panel's left column
 *     …_RightBodyContent (toggles, inflation, OTP)    -> the panel's right column
 *     con_LandLease_WarningOnSaveWithCost             -> the additional-periods warning
 *     …_BodyButtons_1 (Save / Cancel / Hint)          -> `<PanelButtons>` + the hint
 *   cmp_…_PopUpConfirmation_DeletePeriod / …_DeleteLandLeaseCost -> one `<ConfirmDialog>`
 *   cmp_LandLease_PopUpLoading                        -> `<LoadingOverlay>`
 *
 * COMPOSITION ONLY. Every decision — column set, cell text, command gating, panel title,
 * field validation, the Save gate, the write plans — lives in `./landLeaseRules.ts`, which is
 * the port of the canvas Power Fx and carries the line-level provenance for all of it. The one
 * rule expressed here rather than there is `periodBlockRequired`, and it says so at its site.
 *
 * This screen replaces the shared `./Screen.tsx` for Land Lease only. The merged screen was
 * wrong for it in ways the rules module documents: it rendered a `Threshold for EUR/MWh p.a.`
 * and a `Distribution Frequency` column the canvas Land Lease grid does not have, ordered
 * `Secured`/`Allocation`/`OTP` at the end of a shared base rather than after `Aggregation`,
 * rendered `Secured` from `standard ? "Yes" : ""` (a different field), singularised durations
 * the canvas never singularises, blanked a stored `0`, and modelled `Locations` as a synthetic
 * group with `Add Period` disabled when it is an ordinary sub-account.
 */
import { useMemo, useState } from "react";
import {
  Button, Dropdown, Input, MessageBar, MessageBarBody, Option, Switch, Text, Tooltip,
  makeStyles, mergeClasses, tokens,
} from "@fluentui/react-components";
import {
  AddRegular, ArrowCounterclockwiseRegular, ChevronDownRegular, ChevronUpRegular,
  DeleteRegular, EditRegular,
} from "@fluentui/react-icons";
import { ConfirmDialog, FormPanel, LoadingOverlay } from "@/components";
import { CostField, PanelButtons } from "@/features/costing/Fields";
import { useSession } from "@/app/SessionContext";
import { useProjectExtras } from "@/features/contracts/hooks";
import { serverEnforcedProvider } from "@/platform/privileges";
/*
 * `gblAreaWithRegion` is a property of the PROJECT, not of either period screen: `App.OnStart`
 * derives it once and both screens read it. `opexRules` holds the single transcription of that
 * Italy-only `Switch` (`ITALY_AREA_BY_REGION`), so this screen reads it from there rather than
 * keeping a second copy that could drift.
 */
import { areaWithRegion } from "./opexRules";
import { palette, space } from "@/theme/tokens";
import {
  useCountryInflation, useCurrencies, useLeaseAssumptions, useLeaseBook, useLeaseGenerators,
  useLeaseWrites,
} from "@/features/costing/useCostBook";
import {
  AGGREGATION_LABELS, DURATION_MONTH_OPTIONS, DURATION_YEAR_OPTIONS, LAND_LEASE_AGGREGATION,
  LEASE_DESCRIPTION_MAX_LENGTH, LEASE_ENTITY_SET, LEASE_LABELS, LEASE_MSG,
  addPaymentButton, additionalPeriodsWarningVisible, allocationEditable, allocationVisible,
  areaInflationVisible, buildContracts, canSaveLandLease,
  countryInflationDisplay, currencyEditable, defaultAllocatedGenerators, defaultCurrencyCode,
  deleteDialog,
  durationMonthLabel, durationYearLabel, emptyLandLeaseForm, headerEditable, hintVisible,
  inflationProfileLabel, inflationSectionVisible, inflationStartYearDefault, isPeriodOne,
  landLeaseColumns, landLeaseFormFrom, leaseAssumptionQuery, leaseCommands, leaseCurrencyLabel,
  leaseFieldErrors, leasePanelTitle, leaseSaveError, orderedSubaccounts,
  planLeaseDelete, planLeaseSave, planStandardImport, resetStartDate, resetStartDateVisible,
  resolveInflationProfileValue, resolveStartDate, startDateIsStandard, subaccountPeriodRows,
  toLeaseGridRow, toggleFold, toggleLeaseSelection, NO_LEASE_SELECTION,
  type GeneratorOption, type LandLeaseForm, type LeaseAllocationRow, type LeaseContract,
  type LeaseCostRow, type LeasePeriodRow, type LeaseProjectContext, type LeaseSubaccountCard,
} from "./landLeaseRules";

/**
 * `colDistributionFrequency` — `App.Formulas` in `App.pa.yaml`. An app-side table, not an
 * option set and not a Dataverse choice: `vsb_distributionfrequency` is a plain integer.
 */
const DISTRIBUTION_FREQUENCIES: readonly { value: number; label: string }[] = [
  { value: 1, label: "1 month" },
  { value: 2, label: "2 months" },
  { value: 3, label: "3 months" },
  { value: 6, label: "6 months" },
  { value: 12, label: "12 months" },
];

/** `Choices('Land Lease Aggregation')` — `drp_…_Aggregation_1.Items` (LL:3575). */
const AGGREGATION_OPTIONS: readonly number[] = [
  LAND_LEASE_AGGREGATION.sum, LAND_LEASE_AGGREGATION.max, LAND_LEASE_AGGREGATION.min,
];

/**
 * The three rate labels, which fall back to `"EUR"` — NOT to the grid's `"Cur."`
 * (`LL:3263`, `LL:3394`, `LL:3525` against `LL:710`). `leaseCurrencyLabel` carries the two
 * money labels that the rules module needed for other reasons; these three are label text
 * with no rule attached, so they are composed here rather than re-exported.
 */
const rateLabel = (unit: "MWh" | "MW" | "WTG", iso: string | null | undefined): string =>
  `${iso || "EUR"}/${unit} p.a.`;

const useStyles = makeStyles({
  page: { display: "flex", flexDirection: "column", gap: space.s, minWidth: 0 },
  card: {
    borderTopWidth: "1px", borderRightWidth: "1px",
    borderBottomWidth: "1px", borderLeftWidth: "1px",
    borderTopStyle: "solid", borderRightStyle: "solid",
    borderBottomStyle: "solid", borderLeftStyle: "solid",
    borderTopColor: tokens.colorNeutralStroke2, borderRightColor: tokens.colorNeutralStroke2,
    borderBottomColor: tokens.colorNeutralStroke2, borderLeftColor: tokens.colorNeutralStroke2,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  cardHeader: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    width: "100%",
    paddingTop: space.m, paddingBottom: space.m,
    paddingLeft: space.l, paddingRight: space.s,
    backgroundColor: "transparent",
    borderTopStyle: "none", borderRightStyle: "none",
    borderBottomStyle: "none", borderLeftStyle: "none",
    cursor: "pointer",
    ":hover": { backgroundColor: palette.Grayscale40 },
  },
  cardTitle: { fontSize: tokens.fontSizeBase400, color: tokens.colorNeutralForeground1 },
  chevron: { color: tokens.colorBrandForegroundLink },
  toolbar: {
    display: "flex", alignItems: "center", gap: space.m, flexWrap: "wrap",
    paddingLeft: space.m, paddingRight: space.m, paddingBottom: space.xs,
  },
  command: { color: tokens.colorBrandForegroundLink, fontWeight: tokens.fontWeightRegular },
  /*
   * `pcf_…_SubaccountsCommandBar` is a `cat_PowerCAT.CommandBar`, the same PCF the Contracts
   * command bar uses: a BLACK label with a blue leading icon, greying to #595959 / #c8c6c4
   * when disabled. Sampled off `UI Screenshots/Cost App - Other opex -  Tab selected.png` —
   * "Add Contract Type" reads (0, 0, 0) with a blue `+`, and the disabled "Add Period"
   * beside it reads (89, 89, 89). Painting the whole button with the brand link colour made
   * the toolbar read as a row of hyperlinks.
   *
   * NOT `command`, which stays as it is: that one dresses `btn_OneTimePayment2_…`, a modern
   * `Button@0.0.45` with `Appearance: Outline` inside the panel, which is a different
   * control with different colours.
   */
  toolbarCommand: {
    color: palette.neutralPrimary,
    fontWeight: tokens.fontWeightRegular,
    "& .fui-Button__icon": { color: palette.themePrimary },
  },
  toolbarCommandDisabled: {
    color: palette.neutralTertiary,
    "& .fui-Button__icon": { color: palette.neutralTertiaryAlt },
  },
  scroll: { overflowX: "auto", paddingBottom: space.xs },
  table: { width: "100%", borderCollapse: "collapse", whiteSpace: "nowrap" },
  /** `Color: gblAppStyles.Label.Color` + Semibold — dark labels, not the card's link blue. */
  th: {
    textAlign: "left", fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground1,
    fontSize: tokens.fontSizeBase200,
    paddingTop: space.s, paddingBottom: space.s,
    paddingLeft: space.s, paddingRight: space.s,
  },
  thRight: { textAlign: "right" },
  td: {
    fontSize: tokens.fontSizeBase200,
    paddingTop: space.xs, paddingBottom: space.xs,
    paddingLeft: space.s, paddingRight: space.s,
  },
  tdRight: { textAlign: "right", fontVariantNumeric: "tabular-nums" },
  /** `Italic: =StartsWith(ThisItem.Name, "Standard")` and the themePrimary `Color` (LL:992). */
  rowStandard: { fontStyle: "italic", color: palette.themePrimary },
  /** `FontWeight: =If(ThisItem.Period = 'Period 1', Bold, Normal)` (LL:1625). */
  rowBold: { fontWeight: tokens.fontWeightSemibold },
  rowSelected: { backgroundColor: palette.themeLighter },
  row: { cursor: "pointer" },
  selectCell: { width: "40px", paddingLeft: space.m },
  empty: {
    paddingTop: space.m, paddingBottom: space.m, paddingLeft: space.l,
    color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200,
  },
  panelColumns: {
    display: "grid", gap: space.xl,
    gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
    "@media (max-width: 899px)": { gridTemplateColumns: "minmax(0, 1fr)" },
  },
  panelColumn: { display: "flex", flexDirection: "column", gap: space.m, minWidth: 0 },
  /*
   * `drp_…_DurationYears_1.Width = 100`, `…_DurationMonths_1.Width = 120`, and the months box
   * sits at `DurationYears.X + DurationYears.Width + 20` — so a 20px gap (`LL:2543`, `:2607`).
   * Fluent's Dropdown carries `min-width: 160px`, which overrode both and let the two boxes size
   * themselves off their content instead ("1 year" vs "11 months" came out different widths and
   * overflowed the panel). `minWidth` has to be reset for `width` to take effect at all.
   */
  duration: { display: "flex", gap: "20px" },
  durationYears: { width: "100px", minWidth: "100px" },
  durationMonths: { width: "120px", minWidth: "120px" },
  /*
   * Every OTHER dropdown in this panel is `Width: Parent.Width - Self.X*2` — i.e. the full
   * column (`LL:2762` currency, `:3567` aggregation, `:3674` frequency, `:4400` area). Fluent
   * sizes a Dropdown to its content above a 160px floor instead, so they all came out narrower
   * than the panel and ragged against each other.
   */
  panelDropdown: { width: "100%", minWidth: "unset" },
  dateRow: { display: "flex", alignItems: "flex-end", gap: space.xs },
  toggleRow: { display: "flex", alignItems: "center", gap: space.s },
  required: { color: palette.Error, marginRight: "2px" },
  label: { fontWeight: tokens.fontWeightSemibold, fontSize: tokens.fontSizeBase300 },
  /** `dte_….FontItalic` / `.FontColor` when the date is still the standard assumption's. */
  standardDate: { fontStyle: "italic", color: palette.themePrimary },
  warning: { color: palette.Error, fontSize: tokens.fontSizeBase200 },
  hint: { color: palette.Error, fontSize: tokens.fontSizeBase200, marginRight: "auto" },
  footer: { display: "flex", alignItems: "center", gap: space.m, width: "100%" },
  readOnly: {
    backgroundColor: palette.Grayscale30, borderRadius: "3px",
    paddingTop: space.xs, paddingBottom: space.xs,
    paddingLeft: space.m, paddingRight: space.m,
    fontSize: tokens.fontSizeBase300, minHeight: "22px",
  },
});

/* ═════════════════════════════════════════════════════════════════ panel state ══ */

interface PanelState {
  subaccountId: string;
  subaccountName: string;
  /** `locRightPanelState`. */
  state: "New" | "Edit";
  /** `locSelectedLandLeaseCost`. */
  cost: LeaseCostRow | null;
  /** `locSelectedLandLeasePeriod`. */
  period: LeasePeriodRow | null;
  /** `locParentLandLeasePeriod` — the row `Add Period` was pressed on. */
  parentPeriod: LeasePeriodRow | null;
}

interface DeleteState {
  contract: LeaseContract;
  period: LeasePeriodRow;
}

export default function LandLeaseScreen() {
  const styles = useStyles();
  const { projectId, project, locale } = useSession();
  const extras = useProjectExtras(projectId);
  const book = useLeaseBook(projectId);
  const generatorQuery = useLeaseGenerators(projectId);
  const currencies = useCurrencies();
  const countryInflation = useCountryInflation(extras.data?.countryId);
  const assumptions = useLeaseAssumptions(extras.data?.countryId, extras.data?.technology);
  const writes = useLeaseWrites(projectId);

  /** `IsFolded`, but only for the cards the user has actually toggled. */
  const [folds, setFolds] = useState<Record<string, boolean>>({});
  const [selection, setSelection] = useState(NO_LEASE_SELECTION);
  const [panel, setPanel] = useState<PanelState | null>(null);
  const [form, setForm] = useState<LandLeaseForm | null>(null);
  /** `locCODDate` — the date the user has touched, which wins in every arm of `resolveStartDate`. */
  const [workingDate, setWorkingDate] = useState<string | null>(null);
  /** `locResetStartDate`. */
  const [resetFlag, setResetFlag] = useState(false);
  const [deleting, setDeleting] = useState<DeleteState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * `gblSelectedProject` / `gblRecordSelectedProjectCountry`, as the rules want them.
   *
   * `areaWithRegion` is `gblAreaWithRegion`, which `App.OnStart` derives from the project's
   * `Area/State/Province` through an Italy-only `Switch` over the twenty Italian regions
   * (`OnStart.txt:902-961`). `loadProject` now selects `_vsb_countryarea_value` and resolves its
   * name onto `ProjectContext.areaStateProvince`, so the two Italy-only things that read it —
   * the grid's `Inflation Profile` cell and the panel's read-only country profile text — print a
   * real zone instead of `"Italy - "` with nothing after it. `opexRules.ITALY_AREA_BY_REGION` is
   * the shared transcription of that `Switch`; it is a property of the PROJECT, not of either
   * screen, which is why both screens read the same map.
   */
  const ctx: LeaseProjectContext = useMemo(() => ({
    projectId: projectId ?? "",
    projectName: project?.projectName ?? "",
    owningBusinessUnitId: project?.owningBusinessUnitId ?? null,
    countryId: extras.data?.countryId ?? null,
    countryName: project?.countryName ?? null,
    isoCurrencyCode: project?.isoCurrencyCode ?? null,
    technology: extras.data?.technology ?? null,
    codDate: isoDay(project?.milestones?.operationsStartCod),
    areaWithRegion: areaWithRegion(project?.countryName ?? null, project?.areaStateProvince ?? null),
  }), [projectId, project, extras.data]);

  const subaccounts = useMemo(() => book.data?.subaccounts ?? [], [book.data]);
  const costs = useMemo(() => book.data?.costs ?? [], [book.data]);
  const periods = useMemo(() => book.data?.periods ?? [], [book.data]);
  const allocations = useMemo(() => book.data?.allocations ?? [], [book.data]);
  const generators = useMemo(() => generatorQuery.data ?? [], [generatorQuery.data]);

  /*
   * Rule 1 — `ClearCollect(colLandLeaseSubaccounts, Sort(AddColumns('Land Lease Subaccounts',
   * IsFolded, true), Order))`. Every card starts COLLAPSED; the two chevron icons'
   * `UpdateIf(col, id = selected, {IsFolded: Not(…)})` is `toggleFold`.
   *
   * `folds` holds only what the user has since changed, so the collection is DERIVED rather
   * than copied into state — a `useEffect` that re-seeded it would drop the user's open cards
   * every time the reference data refetched.
   */
  const ordered = useMemo(() => orderedSubaccounts(subaccounts), [subaccounts]);
  const cards = useMemo(
    () => ordered.map((c) => ({ ...c, isFolded: folds[c.id] ?? c.isFolded })),
    [ordered, folds],
  );
  const toggleCard = (subaccountId: string) =>
    setFolds(Object.fromEntries(toggleFold(cards, subaccountId).map((c) => [c.id, c.isFolded])));

  const contracts = useMemo(() => buildContracts(costs, periods), [costs, periods]);
  const columns = useMemo(
    () => landLeaseColumns(ctx.isoCurrencyCode), [ctx.isoCurrencyCode],
  );
  const costById = useMemo(() => new Map(costs.map((c) => [c.id, c])), [costs]);

  const selectedPeriod = useMemo(
    () => periods.find((p) => p.id === selection.periodId) ?? null,
    [periods, selection.periodId],
  );
  const selectedCost = useMemo(
    () => (selection.costId ? costById.get(selection.costId) ?? null : null),
    [costById, selection.costId],
  );
  const selectedContract = useMemo(
    () => contracts.find((c) => c.cost.id === selection.costId) ?? null,
    [contracts, selection.costId],
  );

  /** The panel's contract, for the additional-periods warning and the Add-Period chain. */
  const panelContract = useMemo(
    () => (panel?.cost ? contracts.find((c) => c.cost.id === panel.cost?.id) ?? null : null),
    [contracts, panel],
  );

  const errors = useMemo(
    () => (form ? leaseFieldErrors(form, locale) : {}), [form, locale],
  );

  /**
   * `LookUp('Country Inflation Profiles', Country = …, Year = …, Area = …).Inflation`
   * (`LL:4616`). The year is the panel's own start-year box, which is what the canvas reads.
   */
  const countryProfile = useMemo(() => {
    const rows = countryInflation.data ?? [];
    if (rows.length === 0 || !form) return null;
    const year = Number(form.inflationStartYear);
    if (!Number.isFinite(year)) return null;
    const area = (form.inflationCountryArea ?? "").trim();
    const match = rows.find(
      (r) => r.year === year && (area === "" || r.area === area),
    );
    return match ? match.inflation : null;
  }, [countryInflation.data, form]);

  /** The Area dropdown's `Items` — `Distinct(Filter('Country Inflation Profiles', …).Area)`. */
  const areaOptions = useMemo(
    () => [...new Set((countryInflation.data ?? []).map((r) => r.area).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b)),
    [countryInflation.data],
  );

  const isLoading = book.isLoading || extras.isLoading;

  /* ── commands ─────────────────────────────────────────────────────────── */

  const patch = (next: Partial<LandLeaseForm>) =>
    setForm((f) => (f ? { ...f, ...next } : f));

  const closePanel = () => {
    setPanel(null);
    setForm(null);
    setWorkingDate(null);
    setResetFlag(false);
  };

  const openAddContract = (card: LeaseSubaccountCard) => {
    // `"newLandLeaseContractKey"` (LL:388) — a blank cost, and `locCODDate` seeded with the
    // project's COD so `resolveStartDate`'s first arm has something to return.
    setPanel({
      subaccountId: card.id, subaccountName: card.name,
      state: "New", cost: null, period: null, parentPeriod: null,
    });
    setForm(emptyLandLeaseForm(ctx));
    setWorkingDate(ctx.codDate);
    setResetFlag(false);
  };

  const openAddPeriod = (card: LeaseSubaccountCard) => {
    if (!selectedCost || !selectedPeriod) return;
    setPanel({
      subaccountId: card.id, subaccountName: card.name,
      state: "New", cost: selectedCost, period: null, parentPeriod: selectedPeriod,
    });
    setForm(landLeaseFormFrom({
      cost: selectedCost, period: null, parentPeriod: selectedPeriod,
      allocations, panelState: "New", workingDate: null, resetStartDate: false,
    }));
    setWorkingDate(null);
    setResetFlag(false);
  };

  const openEdit = (card: LeaseSubaccountCard) => {
    if (!selectedPeriod) return;
    const cost = selectedCost;
    setPanel({
      subaccountId: card.id, subaccountName: card.name,
      state: "Edit", cost, period: selectedPeriod, parentPeriod: null,
    });
    setForm(landLeaseFormFrom({
      cost, period: selectedPeriod, parentPeriod: null,
      allocations, panelState: "Edit", workingDate: null, resetStartDate: false,
    }));
    setWorkingDate(null);
    setResetFlag(false);
  };

  /**
   * `"AddLandLeaseStandardContractKey"` (LL:388).
   *
   * `leaseAssumptionQuery` describes the `$filter`; the country / technology / contract-type
   * clauses are already the server's (`useLeaseAssumptions`) and the sub-account clause is
   * applied here, over rows still in the server's `Description` order — which is what defect
   * LL-D8 depends on, so they are NOT re-sorted by period.
   */
  const importStandard = async (card: LeaseSubaccountCard) => {
    const query = leaseAssumptionQuery(ctx, card.id);
    const scoped = (assumptions.data ?? []).filter((a) => a.subaccountId === query.subaccountId);
    const plan = planStandardImport({
      ctx,
      subaccountId: card.id,
      subaccountName: card.name,
      assumptions: scoped,
      existingCostsInSubaccount: costs.filter((c) => c.subaccountId === card.id),
      generators,
      countryInflationProfile: standardCountryProfile(countryInflation.data, ctx.codDate),
    });
    // `refused` is the canvas' `If(CountRows(recFilteredStandardContractsForProject) = 0, …)`
    // with no else arm: the command simply does nothing and says nothing.
    if (plan.refused || plan.writes.length === 0) return;
    setBusy(LEASE_MSG.loadingStandardContract);
    setError(null);
    try {
      await writes.mutateAsync(plan.writes);
      setSelection(NO_LEASE_SELECTION);
    } catch (e) {
      setError(leaseSaveError.contract("Add Standard Contract", messageOf(e)));
    } finally {
      setBusy(null);
    }
  };

  const onCommand = (card: LeaseSubaccountCard, key: string) => {
    setError(null);
    if (key === "newLandLeaseContractKey") openAddContract(card);
    else if (key === "newLandLeasePeriodKey") openAddPeriod(card);
    else if (key === "AddLandLeaseStandardContractKey") void importStandard(card);
    else if (key === "EditLandLeasePeriodKey") openEdit(card);
    else if (key === "deleteLandLeasePeriodKey") {
      if (selectedContract && selectedPeriod) {
        setDeleting({ contract: selectedContract, period: selectedPeriod });
      }
    }
  };

  /* ── save ─────────────────────────────────────────────────────────────── */

  const saveDisabled = !form || !panel || writes.isPending || !canSaveLandLease({
    form,
    selectedCost: panel?.cost ?? null,
    selectedPeriod: panel?.period ?? null,
    contract: panelContract,
    panelState: panel?.state ?? "New",
    technology: ctx.technology,
    countryName: ctx.countryName,
    locale,
  });

  /**
   * `drp_…_Currency_1.DefaultSelectedItems` (LL:2762) — `Switch(country, "Poland", PLN, EUR)`.
   * The control is `DisplayMode.Disabled`, so this is the only value it can ever have; a
   * contract that already carries one keeps it rather than being re-pointed on every save.
   */
  const defaultCurrencyId = (currencies.data ?? [])
    .find((c) => c.code === defaultCurrencyCode(ctx.countryName))?.id ?? null;

  const commit = async () => {
    if (!form || !panel || saveDisabled) return;
    const plan = planLeaseSave({
      form: { ...form, currencyId: form.currencyId ?? defaultCurrencyId },
      ctx,
      subaccountId: panel.subaccountId,
      subaccountName: panel.subaccountName,
      selectedCost: panel.cost,
      selectedPeriod: panel.period,
      parentPeriod: panel.parentPeriod,
      existingAllocations: allocations,
      generators,
      panelState: panel.state,
      locale,
    });
    /*
     * THE PANEL CLOSES FIRST, THEN THE SPINNER APPEARS — the canvas raises the spinner and
     * dismisses the panel in ONE `UpdateContext`: `{locSpinnerInformationText: "Saving Land
     * Lease Contract...", locIsVisiblePopUpSpinner: true, locIsVisibleRightPanelNewEditPeriod:
     * false}`, before any write. Closing after the await drew the spinner over the panel.
     *
     * Only the panel moves. Clearing the SELECTION stays below, where the canvas keeps it —
     * that is a separate, later `UpdateContext` (LL:5895).
     */
    setBusy(LEASE_MSG.savingContract);
    setError(null);
    closePanel();
    try {
      // The plan's order IS the canvas': header first (so a brand-new contract has an id
      // before the allocations and the period bind to it), then the allocation upserts, the
      // allocation deletes, and the period. `applyLeaseWrites` resolves each `parentRef`
      // against the ids the earlier creates returned, because `batch` is not a changeset and
      // an OData `$id` content reference would have nothing to resolve inside.
      await writes.mutateAsync(plan.writes);
      // `UpdateContext({locSelectedLandLeaseCost: Blank(), locSelectedLandLeasePeriod: Blank()})`
      // — `clearsSelectionAfterSave`, LL:5895.
      setSelection(NO_LEASE_SELECTION);
    } catch (e) {
      const source = plan.writesHeader ? "Land Lease Project Costs" : "Land Lease Periods";
      setError(plan.writesHeader
        ? leaseSaveError.contract(source, messageOf(e))
        : leaseSaveError.period(source, messageOf(e)));
    } finally {
      setBusy(null);
    }
  };

  /* ── delete ───────────────────────────────────────────────────────────── */

  const dialog = deleteDialog(deleting?.period);

  const confirmDelete = async () => {
    if (!deleting) return;
    const plan = planLeaseDelete(deleting.contract, deleting.period, allocations);
    setDeleting(null);
    setBusy(plan.kind === "contract" ? LEASE_MSG.deletingContract : LEASE_MSG.deletingPeriod);
    setError(null);
    try {
      await writes.mutateAsync(plan.writes);
      setSelection(NO_LEASE_SELECTION);
    } catch (e) {
      setError(plan.kind === "contract"
        ? leaseSaveError.contract("Delete Land Lease", messageOf(e))
        : leaseSaveError.period("Delete Period", messageOf(e)));
    } finally {
      setBusy(null);
    }
  };

  /* ── render ───────────────────────────────────────────────────────────── */

  if (isLoading) return <LoadingOverlay mode="inline" label="Loading Land Lease…" />;

  const permissions = {
    canCreateCost: serverEnforcedProvider.forTable(LEASE_ENTITY_SET.cost).canCreate,
    canCreatePeriod: serverEnforcedProvider.forTable(LEASE_ENTITY_SET.period).canCreate,
    canEditRecord: selectedPeriod
      ? serverEnforcedProvider.forRecord(LEASE_ENTITY_SET.period, selectedPeriod.id).canWrite
      : serverEnforcedProvider.forTable(LEASE_ENTITY_SET.period).canWrite,
    canDeleteRecord: selectedPeriod
      ? serverEnforcedProvider.forRecord(LEASE_ENTITY_SET.period, selectedPeriod.id).canDelete
      : serverEnforcedProvider.forTable(LEASE_ENTITY_SET.period).canDelete,
  };

  return (
    <div className={styles.page}>
      {error ? (
        <MessageBar intent="error" politeness="assertive">
          <MessageBarBody>{error}</MessageBarBody>
        </MessageBar>
      ) : null}

      {cards.map((card) => (
        <SubaccountCard
          key={card.id}
          card={card}
          columns={columns}
          contracts={contracts}
          costById={costById}
          ctx={ctx}
          selection={selection}
          selectedPeriod={selectedPeriod}
          selectedCost={selectedCost}
          selectedContract={selectedContract}
          costs={costs}
          hasMatchingAssumption={
            (assumptions.data ?? []).some((a) => a.subaccountId === card.id)
          }
          permissions={permissions}
          onToggle={() => toggleCard(card.id)}
          onSelectRow={(row) => setSelection((s) => toggleLeaseSelection(s, row))}
          onCommand={(key) => onCommand(card, key)}
        />
      ))}

      <FormPanel
        open={panel !== null}
        title={leasePanelTitle({
          selectedCost: panel?.cost ?? null,
          selectedPeriod: panel?.period ?? null,
          subaccountName: panel?.subaccountName ?? "",
        })}
        width="cost"
        onDismiss={closePanel}
        footer={
          <div className={styles.footer}>
            {/*
              * `lbl_…_BodyButtons_Hint_1` (LL:5960) — and it is one of the fifteen labels the
              * Save gate requires to be hidden, so it is a hard block, not advice.
              */}
            {form && hintVisible({
              form, selectedCost: panel?.cost ?? null, selectedPeriod: panel?.period ?? null,
            }) ? (
              <Text className={styles.hint} role="status">{LEASE_MSG.atLeastOneFigure}</Text>
            ) : null}
            <PanelButtons
              onSave={() => { void commit(); }}
              onCancel={closePanel}
              disabled={saveDisabled}
            />
          </div>
        }
      >
        {form && panel ? (
          <LeasePanelBody
            form={form}
            patch={patch}
            panel={panel}
            contract={panelContract}
            allocations={allocations}
            ctx={ctx}
            errors={errors}
            currencies={currencies.data ?? []}
            generators={generators}
            areaOptions={areaOptions}
            countryProfile={countryProfile}
            workingDate={workingDate}
            resetFlag={resetFlag}
            onStartDate={(value) => {
              setWorkingDate(value);
              setResetFlag(false);
              patch({ startDate: value });
            }}
            onResetStartDate={() => {
              const next = resetStartDate({
                codDate: ctx.codDate,
                selectedPeriod: panel.period,
                selectedCost: panel.cost,
              });
              setWorkingDate(next.workingDate);
              setResetFlag(true);
              patch({
                startDate: resolveStartDate({
                  workingDate: next.workingDate,
                  selectedCost: panel.cost,
                  selectedPeriod: panel.period,
                  parentPeriod: panel.parentPeriod,
                  panelState: panel.state,
                  resetStartDate: true,
                }),
                isStartDateStandardAssumption: next.isStartDateStandardAssumption,
              });
            }}
          />
        ) : null}
      </FormPanel>

      <ConfirmDialog
        open={deleting !== null}
        title={dialog.title}
        description={dialog.body}
        confirmText={dialog.confirmLabel}
        cancelText={dialog.cancelLabel}
        destructive
        busy={writes.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={() => { void confirmDelete(); }}
      />

      {busy ? <LoadingOverlay label={busy} /> : null}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════ the card ══ */

function SubaccountCard({
  card, columns, contracts, costById, ctx, selection, selectedPeriod, selectedCost,
  selectedContract, costs, hasMatchingAssumption, permissions,
  onToggle, onSelectRow, onCommand,
}: {
  card: LeaseSubaccountCard;
  columns: ReturnType<typeof landLeaseColumns>;
  contracts: LeaseContract[];
  costById: Map<string, LeaseCostRow>;
  ctx: LeaseProjectContext;
  selection: typeof NO_LEASE_SELECTION;
  selectedPeriod: LeasePeriodRow | null;
  selectedCost: LeaseCostRow | null;
  selectedContract: LeaseContract | null;
  costs: LeaseCostRow[];
  hasMatchingAssumption: boolean;
  permissions: {
    canCreateCost: boolean; canCreatePeriod: boolean;
    canEditRecord: boolean; canDeleteRecord: boolean;
  };
  onToggle: () => void;
  onSelectRow: (row: { periodId: string; costId: string | null; subaccountId: string }) => void;
  onCommand: (key: string) => void;
}) {
  const styles = useStyles();
  // `gal_…_CardBody_Costs_1.Items` (LL:919) — every period of every contract in this
  // sub-account, ordered by `Name` with `Start Date` breaking its ties.
  const rows = subaccountPeriodRows(contracts, card.id);
  const isSelectedCard = selection.subaccountId === card.id;

  const commands = leaseCommands({
    subaccountId: card.id,
    isSelectedCard,
    selectedPeriod: isSelectedCard ? selectedPeriod : null,
    selectedCost: isSelectedCard ? selectedCost : null,
    contract: isSelectedCard ? selectedContract : null,
    costsInSubaccount: costs.filter((c) => c.subaccountId === card.id),
    hasMatchingAssumption,
    permissions,
  });
  const icons = { Add: <AddRegular />, Edit: <EditRegular />, Delete: <DeleteRegular /> };
  const open = !card.isFolded;

  return (
    <section className={styles.card}>
      <button
        type="button"
        className={styles.cardHeader}
        aria-expanded={open}
        onClick={onToggle}
        data-testid={`leasecard-${card.name}`}
      >
        <Text className={styles.cardTitle}>{card.name}</Text>
        <span className={styles.chevron}>
          {open ? <ChevronUpRegular /> : <ChevronDownRegular />}
        </span>
      </button>

      {open ? (
        <>
          <div className={styles.toolbar}>
            {commands.map((c) => (
              <Button
                key={c.key}
                appearance="transparent"
                className={mergeClasses(
                  styles.toolbarCommand, !c.enabled && styles.toolbarCommandDisabled,
                )}
                icon={icons[c.icon]}
                disabled={!c.enabled}
                onClick={() => onCommand(c.key)}
                data-testid={`lease-${c.key}`}
              >
                {c.label}
              </Button>
            ))}
          </div>

          {rows.length === 0 ? (
            <Text className={styles.empty}>No periods yet.</Text>
          ) : (
            <div className={styles.scroll}>
              <table className={styles.table} aria-label={`${card.name} periods`}>
                <thead>
                  <tr>
                    <th className={styles.selectCell} />
                    {columns.map((c) => (
                      <th
                        key={c.key}
                        scope="col"
                        style={{ minWidth: c.width }}
                        className={mergeClasses(
                          styles.th, c.align === "right" && styles.thRight,
                        )}
                      >
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((period) => {
                    const cost = period.projectCostId
                      ? costById.get(period.projectCostId) ?? null
                      : null;
                    const row = toLeaseGridRow({
                      period, cost, ctx, selectedPeriodId: selection.periodId,
                    });
                    const select = () => onSelectRow({
                      periodId: period.id,
                      costId: period.projectCostId,
                      subaccountId: card.id,
                    });
                    return (
                      <tr
                        key={row.id}
                        className={mergeClasses(
                          styles.row,
                          row.standard && styles.rowStandard,
                          row.bold && styles.rowBold,
                          row.selected && styles.rowSelected,
                        )}
                        onClick={select}
                      >
                        <td className={styles.selectCell}>
                          {/*
                            * `img_…_CostsTableRow_RadioSelection_2` is a picture, not a
                            * control: the whole row is one transparent button
                            * (`btn_…_TransparentButton_2`, LL:1744) and clicking the row that
                            * is already selected DESELECTS it. So the radio is `readOnly` and
                            * its click bubbles to the row — one handler, one toggle, whether
                            * the user hits the dot or the description.
                            */}
                          <input
                            type="radio"
                            name={`lease-${card.id}`}
                            checked={row.selected}
                            readOnly
                            aria-label={`Select ${row.cells.description}`}
                            data-testid={`lease-select-${row.id}`}
                          />
                        </td>
                        {columns.map((c) => (
                          <td
                            key={c.key}
                            className={mergeClasses(
                              styles.td, c.align === "right" && styles.tdRight,
                            )}
                          >
                            {row.cells[c.key] ?? ""}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}
    </section>
  );
}

/* ═════════════════════════════════════════════════════════════════ the panel ══ */

function LeasePanelBody({
  form, patch, panel, contract, allocations, ctx, errors, currencies, generators, areaOptions,
  countryProfile, workingDate, resetFlag, onStartDate, onResetStartDate,
}: {
  form: LandLeaseForm;
  patch: (next: Partial<LandLeaseForm>) => void;
  panel: PanelState;
  contract: LeaseContract | null;
  allocations: readonly LeaseAllocationRow[];
  ctx: LeaseProjectContext;
  errors: Partial<Record<string, string>>;
  currencies: readonly { id: string; name: string; code: string }[];
  generators: readonly GeneratorOption[];
  areaOptions: readonly string[];
  countryProfile: number | null;
  workingDate: string | null;
  resetFlag: boolean;
  onStartDate: (value: string) => void;
  onResetStartDate: () => void;
}) {
  const styles = useStyles();
  const iso = ctx.isoCurrencyCode;
  const headerOn = headerEditable(panel.period, panel.cost);
  const allocationOn = allocationVisible(ctx.technology);
  const allocationEnabled = allocationEditable(panel.period, panel.cost);
  const errorFor = (key: string) => errors[key];

  /**
   * The dynamic required markers on Start Date, Duration, Distribution Frequency and
   * Allocation — `lbl_…_StartDateAsterisk_1.Visible` and its three twins (`PA:2481`, `PA:2726`,
   * `PA:3765`, `PA:4040`), which are the same three-armed formula four times over.
   *
   * THE ONE RULE THAT IS NOT IN `landLeaseRules.ts`. It is the visible face of the Save gate's
   * clauses F and I — the period block is required unless this is a payment-only contract with
   * no rate typed — but the rules module exposes that only inside `canSaveLandLease`, and that
   * file is not ours to extend. Kept here, next to the controls it marks, rather than
   * duplicated per control.
   */
  const periodBlockRequired = (() => {
    const anyRate = [
      form.fixedCosts, form.percentOfRevenues, form.eurPerMwh, form.eurPerMw, form.eurPerWtg,
    ].some((v) => v.trim() !== "");
    if (form.oneTimePaymentsOn && !panel.cost) return anyRate;
    if (panel.cost && isPeriodOne(panel.period?.period ?? null)) return anyRate;
    return true;
  })();

  const required = (on = true) =>
    (on ? <span className={styles.required}>*</span> : null);

  const paymentButton = (n: 2 | 3) => addPaymentButton(n, {
    showSecondPayment: form.showSecondPayment,
    showThirdPayment: form.showThirdPayment,
    previousAmount: n === 2 ? form.payments.amount : form.payments.amount2,
    previousDueDate: n === 2 ? form.payments.dueDate : form.payments.dueDate2,
    previousAmountError: Boolean(errorFor(n === 2 ? "amount" : "amount2")),
    previousDueDateError: Boolean(errorFor(n === 2 ? "dueDate" : "dueDate2")),
    selectedPeriod: panel.period,
    hasParentPeriod: panel.parentPeriod !== null,
  });

  const togglePaymentBlock = (n: 2 | 3, shown: boolean) => {
    // Every canvas path that hides a block also `Reset`s its two inputs (LL:5117, LL:5473),
    // which is why a hidden box can never hold a stale value that blocks Save.
    if (n === 2) {
      patch(shown
        ? { showSecondPayment: false, showThirdPayment: false,
          payments: { ...form.payments, dueDate2: "", amount2: "", dueDate3: "", amount3: "" } }
        : { showSecondPayment: true });
      return;
    }
    patch(shown
      ? { showThirdPayment: false, payments: { ...form.payments, dueDate3: "", amount3: "" } }
      : { showThirdPayment: true });
  };

  const currencyName = currencies.find((c) => c.id === form.currencyId)?.name
    // `drp_…_Currency_1.DefaultSelectedItems` (LL:2762) — PLN for Poland, EUR otherwise.
    ?? currencies.find((c) => c.code === defaultCurrencyCode(ctx.countryName))?.name
    ?? defaultCurrencyCode(ctx.countryName);

  // `Start Date`'s displayed value is `resolveStartDate`'s, not the raw box: the working date
  // wins in every arm, and the New arm chains off the parent period when it has not been set.
  const startDate = resolveStartDate({
    workingDate: workingDate ?? form.startDate,
    selectedCost: panel.cost,
    selectedPeriod: panel.period,
    parentPeriod: panel.parentPeriod,
    panelState: panel.state,
    resetStartDate: resetFlag,
  }) ?? "";

  return (
    <div className={styles.panelColumns}>
      {/* ── con_LandLease_RightPanel_NewEditContractPeriod_LeftBodyContent ── */}
      <div className={styles.panelColumn}>
        <CostField
          label={LEASE_LABELS.description}
          // `lbl_…_DescriptionAsterisk_1.Visible = IsBlank(locSelectedLandLeasePeriod)` (LL:2246).
          required={panel.period === null}
          value={form.description}
          maxLength={LEASE_DESCRIPTION_MAX_LENGTH}
          disabled={!headerOn}
          error={errorFor("description")}
          onChange={(v) => patch({ description: v })}
        />

        <div>
          <Text className={styles.label}>
            {required(periodBlockRequired)}{LEASE_LABELS.startDate}
          </Text>
          <div className={styles.dateRow}>
            <Input
              type="date"
              value={startDate}
              disabled={!headerOn}
              onChange={(_, d) => onStartDate(d.value)}
              style={{ flex: 1 }}
              className={startDateIsStandard(form.isStartDateStandardAssumption)
                ? styles.standardDate : undefined}
              data-testid="lease-start"
            />
            {/* `ico_ResetStartDay_NewEditCost_LandLease_1` (LL:2503). */}
            {resetStartDateVisible(panel.period, panel.cost) ? (
              <Tooltip content={LEASE_MSG.resetStartDateTooltip} relationship="label">
                <Button
                  appearance="subtle"
                  icon={<ArrowCounterclockwiseRegular />}
                  onClick={onResetStartDate}
                  data-testid="lease-reset-start"
                />
              </Tooltip>
            ) : null}
          </div>
        </div>

        <div>
          <Text className={styles.label}>
            {required(periodBlockRequired)}{LEASE_LABELS.duration}
          </Text>
          <div className={styles.duration}>
            <Dropdown
              aria-label={`${LEASE_LABELS.duration} years`}
              value={form.durationYears === null ? "" : durationYearLabel(form.durationYears)}
              selectedOptions={form.durationYears === null ? [] : [String(form.durationYears)]}
              onOptionSelect={(_, d) => patch({
                durationYears: Number(d.optionValue),
                // `DefaultSelectedItems` on the months dropdown selects 0 once a year is
                // picked, which is what makes the Save gate's blank-months arm reachable.
                durationMonths: form.durationMonths ?? 0,
              })}
              className={styles.durationYears}
              data-testid="lease-years"
            >
              {DURATION_YEAR_OPTIONS.map((y) => (
                <Option key={y} value={String(y)}>{durationYearLabel(y)}</Option>
              ))}
            </Dropdown>
            <Dropdown
              aria-label={`${LEASE_LABELS.duration} months`}
              value={form.durationMonths === null ? "" : durationMonthLabel(form.durationMonths)}
              selectedOptions={form.durationMonths === null ? [] : [String(form.durationMonths)]}
              onOptionSelect={(_, d) => patch({ durationMonths: Number(d.optionValue) })}
              className={styles.durationMonths}
              data-testid="lease-months"
            >
              {DURATION_MONTH_OPTIONS.map((m) => (
                <Option key={m} value={String(m)}>{durationMonthLabel(m)}</Option>
              ))}
            </Dropdown>
          </div>
        </div>

        <div>
          {/* `drp_…_Currency_1` is `DisplayMode.Disabled` always — `currencyEditable()`. */}
          <Text className={styles.label}>{LEASE_LABELS.currency}</Text>
          <Dropdown
            aria-label={LEASE_LABELS.currency}
            className={styles.panelDropdown}
            value={currencyName}
            selectedOptions={[currencyName]}
            disabled={!currencyEditable()}
            data-testid="lease-currency"
          >
            <Option value={currencyName}>{currencyName}</Option>
          </Dropdown>
        </div>

        <CostField
          label={leaseCurrencyLabel.fixCosts(iso)} type="number" value={form.fixedCosts}
          error={errorFor("fixedCosts")} onChange={(v) => patch({ fixedCosts: v })}
        />
        <CostField
          label="Share of Revenues [%]" type="number" value={form.percentOfRevenues}
          error={errorFor("percentOfRevenues")}
          onChange={(v) => patch({ percentOfRevenues: v })}
        />
        <CostField
          label={rateLabel("MWh", iso)} type="number" value={form.eurPerMwh}
          error={errorFor("eurPerMwh")} onChange={(v) => patch({ eurPerMwh: v })}
        />
        <CostField
          label={rateLabel("MW", iso)} type="number" value={form.eurPerMw}
          error={errorFor("eurPerMw")} onChange={(v) => patch({ eurPerMw: v })}
        />
        <CostField
          label={rateLabel("WTG", iso)} type="number" value={form.eurPerWtg}
          error={errorFor("eurPerWtg")} onChange={(v) => patch({ eurPerWtg: v })}
        />

        <div>
          {/* `lbl_…_AggregationAsterisk_1.Visible = false` (LL:3627) — no marker, deliberately. */}
          <Text className={styles.label}>{LEASE_LABELS.aggregation}</Text>
          <Dropdown
            aria-label={LEASE_LABELS.aggregation}
            className={styles.panelDropdown}
            value={form.aggregation === null ? "" : AGGREGATION_LABELS[form.aggregation] ?? ""}
            selectedOptions={form.aggregation === null ? [] : [String(form.aggregation)]}
            onOptionSelect={(_, d) => patch({ aggregation: Number(d.optionValue) })}
            data-testid="lease-aggregation"
          >
            {AGGREGATION_OPTIONS.map((a) => (
              <Option key={a} value={String(a)}>{AGGREGATION_LABELS[a] ?? ""}</Option>
            ))}
          </Dropdown>
        </div>

        <div>
          <Text className={styles.label}>
            {required(periodBlockRequired)}{LEASE_LABELS.distributionFrequency}
          </Text>
          <Dropdown
            aria-label={LEASE_LABELS.distributionFrequency}
            className={styles.panelDropdown}
            value={DISTRIBUTION_FREQUENCIES
              .find((f) => f.value === form.distributionFrequency)?.label ?? ""}
            selectedOptions={form.distributionFrequency === null
              ? [] : [String(form.distributionFrequency)]}
            onOptionSelect={(_, d) => patch({ distributionFrequency: Number(d.optionValue) })}
            data-testid="lease-frequency"
          >
            {DISTRIBUTION_FREQUENCIES.map((f) => (
              <Option key={f.value} value={String(f.value)}>{f.label}</Option>
            ))}
          </Dropdown>
        </div>
      </div>

      {/* ── con_LandLease_RightPanel_NewEditContractPeriod_RightBodyContent ── */}
      <div className={styles.panelColumn}>
        <div className={styles.toggleRow}>
          <Switch
            checked={form.securedChecked}
            disabled={!headerOn}
            onChange={(_, d) => patch({ securedChecked: d.checked })}
            data-testid="lease-secured"
          />
          <Text>{LEASE_LABELS.secured}</Text>
        </div>

        {/* `PA:3861` / `PA:3904` — both allocation controls are PV-or-Wind only. */}
        {allocationOn ? (
          <>
            <div className={styles.toggleRow}>
              <Switch
                checked={form.allWtgAllocated}
                disabled={!allocationEnabled}
                onChange={(_, d) => patch({
                  allWtgAllocated: d.checked,
                  // `locSelectAllWTG` — `cmb_…_AllocationWtg_1.DefaultSelectedItems` (LL:3905)
                  // pre-selects EVERY generator while it is on and falls back to the
                  // contract's stored allocation rows when it is off.
                  allocatedGeneratorIds: defaultAllocatedGenerators(
                    generators, allocations, d.checked,
                  ).map((g) => g.id),
                })}
                data-testid="lease-all-wtg"
              />
              <Text>{LEASE_LABELS.allocateToAllWtgs}</Text>
            </div>

            <div data-testid="lease-allocation">
              <Text className={styles.label}>
                {required(periodBlockRequired)}{LEASE_LABELS.allocation}
              </Text>
              <Dropdown
                multiselect
                aria-label={LEASE_LABELS.allocation}
                className={styles.panelDropdown}
                disabled={!allocationEnabled}
                selectedOptions={form.allocatedGeneratorIds}
                value={generators
                  .filter((g) => form.allocatedGeneratorIds.includes(g.id))
                  .map((g) => g.label)
                  .join(", ")}
                onOptionSelect={(_, d) => patch({
                  allocatedGeneratorIds: d.selectedOptions,
                  // `Rule 10` — `CountIf(SelectedItems) = CountIf(colGeneratorsInProject)`.
                  allWtgAllocated: generators.length > 0
                    && d.selectedOptions.length === generators.length,
                })}
              >
                {generators.map((g) => (
                  <Option key={g.id} value={g.id}>{g.label}</Option>
                ))}
              </Dropdown>
            </div>
          </>
        ) : null}

        <div className={styles.toggleRow}>
          <Switch
            checked={form.inflationChecked}
            disabled={!headerOn}
            onChange={(_, d) => patch({
              inflationChecked: d.checked,
              inflationStartYear: d.checked && form.inflationStartYear === ""
                ? String(inflationStartYearDefault(null, startDate) ?? "")
                : form.inflationStartYear,
            })}
            data-testid="lease-inflation"
          />
          <Text>{LEASE_LABELS.inflationProfile}</Text>
        </div>

        {inflationSectionVisible(form.inflationChecked) ? (
          <>
            <div className={styles.toggleRow}>
              {/*
                * `lbl_…_CountryInflationToggleAsterisk_1.Visible` is `=//If(...)` — a formula
                * that is nothing but a comment, so it evaluates blank and the marker never
                * shows on Land Lease. The OPEX screen's twin does show it (PA:4103).
                */}
              <Switch
                checked={form.countryInflationChecked}
                disabled={!headerOn}
                onChange={(_, d) => patch({
                  countryInflationChecked: d.checked,
                  inflationProfile: formatProfile(resolveInflationProfileValue({
                    selectedCost: panel.cost,
                    countryInflationChecked: d.checked,
                    countryName: ctx.countryName,
                    countryProfile,
                  })),
                })}
                data-testid="lease-country-inflation"
              />
              <Text>{LEASE_LABELS.countryInflationProfile}</Text>
            </div>

            <CostField
              label={LEASE_LABELS.inflationStartYear}
              required
              value={form.inflationStartYear}
              placeholder={LEASE_LABELS.inflationStartYearPlaceholder}
              disabled={!headerOn}
              error={errorFor("inflationStartYear")}
              onChange={(v) => patch({ inflationStartYear: v })}
            />

            {/* `con_…_AreaInflationProfile_1.Visible` (LL:4391) — Italy only. */}
            {areaInflationVisible({
              inflationChecked: form.inflationChecked,
              countryInflationChecked: form.countryInflationChecked,
              countryName: ctx.countryName,
            }) ? (
              <div>
                <Text className={styles.label}>
                  {required()}{LEASE_LABELS.area}
                </Text>
                <Dropdown
                  aria-label={LEASE_LABELS.area}
                  className={styles.panelDropdown}
                  value={form.inflationCountryArea ?? ""}
                  selectedOptions={form.inflationCountryArea ? [form.inflationCountryArea] : []}
                  disabled={!headerOn}
                  onOptionSelect={(_, d) => patch({ inflationCountryArea: d.optionValue ?? null })}
                  data-testid="lease-area"
                >
                  {areaOptions.map((a) => <Option key={a} value={a}>{a}</Option>)}
                </Dropdown>
              </div>
            ) : null}

            {/*
              * One label, two fields — `lbl_…_InflationProfile_1.Text` (LL:4645). The country
              * toggle swaps an editable percentage for read-only text.
              */}
            {form.countryInflationChecked ? (
              <div>
                <Text className={styles.label}>
                  {inflationProfileLabel(true)}
                </Text>
                <div className={styles.readOnly} data-testid="lease-country-profile">
                  {countryInflationDisplay(ctx)}
                </div>
              </div>
            ) : (
              <CostField
                label={inflationProfileLabel(false)}
                required
                type="number"
                value={form.inflationProfile}
                disabled={!headerOn}
                error={errorFor("inflationProfile")}
                onChange={(v) => patch({ inflationProfile: v })}
              />
            )}
          </>
        ) : null}

        <div className={styles.toggleRow}>
          <Switch
            checked={form.oneTimePaymentsOn}
            disabled={!headerOn}
            onChange={(_, d) => patch({
              oneTimePaymentsOn: d.checked,
              // `OnUncheck` resets all six boxes and both extra blocks (LL:4748).
              ...(d.checked ? {} : {
                showSecondPayment: false,
                showThirdPayment: false,
                payments: {
                  dueDate: "", amount: "", dueDate2: "", amount2: "", dueDate3: "", amount3: "",
                },
              }),
            })}
            data-testid="lease-otp"
          />
          <Text>{LEASE_LABELS.oneTimePayment}</Text>
        </div>

        {form.oneTimePaymentsOn ? (
          <>
            <PaymentBlock
              n={1} form={form} patch={patch} iso={iso} errors={errors} disabled={!headerOn}
            />
            {form.showSecondPayment ? (
              <PaymentBlock
                n={2} form={form} patch={patch} iso={iso} errors={errors} disabled={!headerOn}
              />
            ) : null}
            {paymentButton(2).visible ? (
              <Button
                appearance="transparent"
                className={styles.command}
                icon={paymentButton(2).icon === "Add" ? <AddRegular /> : <DeleteRegular />}
                disabled={!paymentButton(2).enabled}
                onClick={() => togglePaymentBlock(2, form.showSecondPayment)}
                data-testid="lease-payment-2"
              >
                {paymentButton(2).label}
              </Button>
            ) : null}
            {form.showThirdPayment ? (
              <PaymentBlock
                n={3} form={form} patch={patch} iso={iso} errors={errors} disabled={!headerOn}
              />
            ) : null}
            {paymentButton(3).visible ? (
              <Button
                appearance="transparent"
                className={styles.command}
                icon={paymentButton(3).icon === "Add" ? <AddRegular /> : <DeleteRegular />}
                disabled={!paymentButton(3).enabled}
                onClick={() => togglePaymentBlock(3, form.showThirdPayment)}
                data-testid="lease-payment-3"
              >
                {paymentButton(3).label}
              </Button>
            ) : null}
          </>
        ) : null}

        {/* `con_LandLease_WarningOnSaveWithCost` (LL:5802). */}
        {additionalPeriodsWarningVisible({
          form, selectedPeriod: panel.period, contract,
        }) ? (
          <Text className={styles.warning} role="alert" data-testid="lease-periods-warning">
            {LEASE_MSG.additionalPeriodsWarning}
          </Text>
        ) : null}
      </div>
    </div>
  );
}

/** One of the three One-Time Payment blocks: the due date then the amount (LL:4782, LL:4920). */
function PaymentBlock({
  n, form, patch, iso, errors, disabled,
}: {
  n: 1 | 2 | 3;
  form: LandLeaseForm;
  patch: (next: Partial<LandLeaseForm>) => void;
  iso: string | null | undefined;
  errors: Partial<Record<string, string>>;
  disabled: boolean;
}) {
  const dateKey = (n === 1 ? "dueDate" : `dueDate${n}`) as "dueDate" | "dueDate2" | "dueDate3";
  const amountKey = (n === 1 ? "amount" : `amount${n}`) as "amount" | "amount2" | "amount3";
  return (
    <>
      <CostField
        label={LEASE_LABELS.oneTimePaymentDate(n)}
        value={form.payments[dateKey]}
        placeholder={LEASE_LABELS.dueDatePlaceholder}
        disabled={disabled}
        error={errors[dateKey]}
        onChange={(v) => patch({ payments: { ...form.payments, [dateKey]: v } })}
      />
      <CostField
        label={leaseCurrencyLabel.oneTimePaymentAmount(n, iso)}
        type="number"
        value={form.payments[amountKey]}
        disabled={disabled}
        error={errors[amountKey]}
        onChange={(v) => patch({ payments: { ...form.payments, [amountKey]: v } })}
      />
    </>
  );
}

/* ═════════════════════════════════════════════════════════════════════ small ══ */

/** A `Date` from `ProjectContext` as the ISO day the rules expect, or null. */
function isoDay(value: Date | undefined): string | null {
  if (!value || Number.isNaN(value.getTime())) return null;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${value.getFullYear()}-${p(value.getMonth() + 1)}-${p(value.getDate())}`;
}

/** `txt_…_InflationProfile_1.Value` is a one-decimal string; blank stays blank. */
const formatProfile = (value: number | null): string =>
  value === null ? "" : value.toFixed(1);

/**
 * The `Country Inflation Profiles` row the standard import uses — (country, COD year + 1),
 * `LL:388`'s `recCODYear`. Area is not part of that lookup on the import path.
 */
function standardCountryProfile(
  rows: readonly { year: number; area: string; inflation: number }[] | undefined,
  codDate: string | null,
): number | null {
  if (!rows || rows.length === 0 || !codDate) return null;
  const year = Number(codDate.slice(0, 4));
  if (!Number.isFinite(year)) return null;
  return rows.find((r) => r.year === year + 1)?.inflation ?? null;
}

/** A thrown `DataError`'s message, for the two `Notify(...)` strings on the save path. */
function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
