/**
 * OPEX — `Operation & Maintenance` and `Other OPEX Costs`.
 *
 * ONE canvas screen, TWO rail items. `App.pa.yaml:102-125` points both `O&MKey` and
 * `OtherOpexCostsKey` at `Opex Costs Screen`, and `OnVisible` (`:9-14`) derives the mode from the
 * selected rail key. Here the mode arrives as a route prop. Land Lease is a DIFFERENT canvas
 * screen and is deliberately not served by this component.
 *
 * COMPOSITION ONLY. Every decision — which cards, which commands, which columns, which panel
 * fields, what saves — lives in `./opexRules.ts`, which was ported from the canvas Power Fx with
 * line-level provenance. This file wires those answers to Fluent controls and to the settled data
 * layer (`@/features/costing/useCostBook`, `@/data/periodWrites`). Where a rule is deliberately
 * NOT called, the reason is written at the call site.
 *
 * Canvas control map (`Src/Opex Costs Screen.pa.yaml`, 230 controls):
 *
 *   `gal_OpexCosts_Content_GeneratorsInProject`          → `<OpexCard>` per device type (O&M)
 *   `gal_OpexCosts_Content_Subaccounts`                  → `<OpexCard>` per sub-account (Other)
 *   `con_…_CardHeader` + `ico_…_Up` / `_Down`            → the card's header button + chevron
 *   `con_AlignWithProjectDuration_Container`             → the header's duration badge
 *   `pcf_…_CommandBar` / `…_SubaccountsCommandBar`       → `<CardToolbar>`
 *   `con_…_CardBody_CostsTableHeader` + `gal_…_Costs`    → the `<table>`
 *   `inf_OpexCost_AlignWithDuration`                     → the amber info button in the row
 *   `con_OpexCosts_RightPanel_NewEditCost`               → `<FormPanel>` (left/right columns)
 *   `cmp_OpexCosts_PopUpConfirmation_DeleteCost`         → `<ConfirmDialog>`
 *   `cmp_OpexCosts_PopUpLoading`                         → `<LoadingOverlay>`
 *
 * Reference screenshots:
 *   `Cost App - O & M Selected Tab - Almost same for Landlease and other Opex also.png`
 *   `Cost App - Other opex -  Tab selected.png`
 *   `Cost App - Add & Edit ContractPeriod Panel - Almost same for Landlease and other Opex also.png`
 */
import { useMemo, useState } from "react";
import {
  Button, Dropdown, Input, Option, Switch, Text, Tooltip,
  makeStyles, mergeClasses, tokens,
} from "@fluentui/react-components";
import {
  AddRegular, ArrowCounterclockwiseRegular, ChevronDownRegular, ChevronUpRegular,
  DeleteRegular, EditRegular, InfoRegular,
} from "@fluentui/react-icons";
import { ConfirmDialog, EmptyState, FormPanel, LoadingOverlay } from "@/components";
import { useSession } from "@/app/SessionContext";
import { useProjectExtras } from "@/features/contracts/hooks";
import { CostField, PanelButtons } from "@/features/costing/Fields";
import {
  useAddStandardContract, useCostBook, useCountryInflation, useCountryInflationAreas,
  useOpexAssumptionScopes, useOpexCatalog, useOpexDeviceTypes,
} from "@/features/costing/useCostBook";
import type { CostPeriod } from "@/features/costing/model";
import { palette, space } from "@/theme/tokens";
import {
  DELETE_DIALOG, DURATION_BADGE_TEXT, DURATION_MONTH_OPTIONS, DURATION_YEAR_OPTIONS,
  OPEX_AGGREGATION, OPEX_AGGREGATION_LABEL, OPEX_COMMAND_ICONS, OPEX_COMMAND_LABELS,
  OPEX_DISTRIBUTION_FREQUENCY, OPEX_MODE_NAMES, OPEX_MSG, OPEX_PANEL_LABELS, THRESHOLD_TYPE,
  addPeriodRecordType, alignWithProjectDurationDefault, areaFieldVisible, areaFieldVisibleIntended,
  areaWithRegion, canSaveOpexCost, chainHead, childrenOf, costName, costsInScope,
  countryInflationPercent, defaultCurrencyCode,
  defaultSubaccount, deleteDialogText, deviceTypeList, durationBadge, externalContractDefault,
  inflationProfileCountryText, inflationProfileDefault, inflationStartYearDefault,
  inheritStartDateStandard, italyZone, matchesStandardAssumption, nextPeriodDescriptionPanel,
  omDurationBadge, opexColumns, opexCommands,
  opexFormErrors, panelFieldModes, panelRateLabel, panelRequiredMarkers, panelTitle, planDeleteCost,
  resetStartDateFlag, resetStartDateVisible, selectedAccount, showAtLeastOneFigureHint,
  showEurPerWtgField, showThresholdColumn, standardAssumptionFilter, startDateDefault,
  startDateStandardFlagAfterManualChange,
  subaccountsForMode, thresholdToggleLabel, toOpexRow, toggleRowSelection, visibleCommands,
  type CountryInflationProfile, type FieldMode, type OpexCommandKey, type OpexCost, type OpexForm,
  type OpexMode, type OpexProjectContext, type OpexSubaccount, type PanelContext,
  type RowSelection,
} from "./opexRules";

/* ═══════════════════════════════════════════════════════════ reference data ══ */

/**
 * `colOpexAccounts` / `colOpexSubaccounts` used to be TRANSCRIBED CONSTANTS here, because
 * `src/data/*` carried no loader for them. They are now `useOpexCatalog()`
 * (`data/opexCatalog.ts` -> `costRepository().listOpexAccounts/listOpexSubaccounts`), which
 * returns the same `OpexAccount` / `OpexSubaccount` shapes `selectedAccount`,
 * `defaultSubaccount` and `subaccountsForMode` already took.
 *
 * Measured on VSBCloud_Dev, 16 Sep, the live rows are exactly what was transcribed — two
 * accounts (`Operation & Maintenance` Order 1, `Other OPEX Costs` Order 2) and nine sub-accounts
 * — so this renders identically today and stops being silently wrong the day an admin adds one.
 */

/**
 * `drp_…_Currency.DefaultSelectedItems` resolves a `Currencies` ROW; the book carries the
 * currency's NAME. These two maps are the only translation needed, and the panel's rate labels
 * (`panelRateLabel`) switch on the CODE, not on the country.
 */
const CURRENCY_NAME_BY_CODE: Record<string, string> = { EUR: "Euro", PLN: "Polish Zloty" };
const CURRENCY_CODE_BY_NAME: Record<string, string> = {
  Euro: "EUR", "Polish Zloty": "PLN", "Czech Koruna": "CZK", "Romanian Leu": "RON",
};
const currencyCodeOf = (name: string | null): string =>
  CURRENCY_CODE_BY_NAME[name ?? ""] ?? "EUR";

/** `rdg_…_Threshold.Items: Choices(Thresholds)` — the option set's display names (`:1714-1716`). */
const THRESHOLD_OPTIONS: readonly { value: number; label: string }[] = [
  { value: THRESHOLD_TYPE.netYieldP75, label: "Net Yield p75" },
  { value: THRESHOLD_TYPE.netYieldP90, label: "Net Yield p90" },
  { value: THRESHOLD_TYPE.individual, label: "Individual" },
];

const AGGREGATION_OPTIONS: readonly number[] = [
  OPEX_AGGREGATION.sum, OPEX_AGGREGATION.max, OPEX_AGGREGATION.min,
];

/* ══════════════════════════════════════════════════════════════════ styles ══ */

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
    width: "100%", gap: space.m,
    paddingTop: space.m, paddingBottom: space.m,
    paddingLeft: space.l, paddingRight: space.s,
    backgroundColor: "transparent",
    borderTopStyle: "none", borderRightStyle: "none",
    borderBottomStyle: "none", borderLeftStyle: "none",
    cursor: "pointer",
    ":hover": { backgroundColor: palette.Grayscale40 },
  },
  /** `lbl_…_CardHeader_SubaccountName` — link colour, Medium, Normal weight. */
  cardTitle: {
    fontSize: tokens.fontSizeBase400, color: tokens.colorBrandForegroundLink,
    textAlign: "left", flexGrow: 1, minWidth: 0,
  },
  /** `con_AlignWithProjectDuration_Container` — `SuccessLight` / a 60 % faded `Warning`. */
  badge: {
    fontSize: tokens.fontSizeBase200, whiteSpace: "nowrap",
    paddingTop: space.xxs, paddingBottom: space.xxs,
    paddingLeft: space.s, paddingRight: space.s,
    borderTopLeftRadius: tokens.borderRadiusMedium,
    borderTopRightRadius: tokens.borderRadiusMedium,
    borderBottomLeftRadius: tokens.borderRadiusMedium,
    borderBottomRightRadius: tokens.borderRadiusMedium,
  },
  badgeMatch: { backgroundColor: palette.SuccessLight, color: palette.Success },
  badgeMismatch: { backgroundColor: "#F8D49E", color: palette.Grayscale00 },
  toolbar: {
    display: "flex", alignItems: "center", gap: space.m, flexWrap: "wrap",
    paddingLeft: space.m, paddingRight: space.m, paddingBottom: space.xs,
  },
  command: { color: tokens.colorBrandForegroundLink, fontWeight: tokens.fontWeightRegular },
  scroll: { overflowX: "auto", paddingBottom: space.xs },
  table: { width: "100%", borderCollapse: "collapse", whiteSpace: "nowrap" },
  /*
   * `lbl_…_CardBody_CostsTableHeader_*` — `Color: gblAppStyles.Label.Color` (the app's dark
   * label colour) with `FontWeight.Semibold`. Without an explicit colour these headings picked
   * up the link blue from the card around them, which is what made the row of column titles
   * read as blue rather than as plain dark labels.
   */
  th: {
    textAlign: "left", fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground1,
    fontSize: tokens.fontSizeBase200,
    paddingTop: space.s, paddingBottom: space.s,
    paddingLeft: space.s, paddingRight: space.s,
  },
  thNumeric: { textAlign: "right" },
  td: {
    fontSize: tokens.fontSizeBase200,
    paddingTop: space.xs, paddingBottom: space.xs,
    paddingLeft: space.s, paddingRight: space.s,
  },
  tdNumeric: { textAlign: "right", fontVariantNumeric: "tabular-nums" },
  /** `lbl_…_CostsTableRow_DurationMonths.Color` — the months cell is the link colour. */
  tdMonths: { color: tokens.colorBrandForegroundLink },
  /** `Italic: StartsWith(ThisItem.Description, "Standard")` and the matching `themePrimary`. */
  rowStandard: { fontStyle: "italic", color: tokens.colorBrandForegroundLink },
  rowSelected: { backgroundColor: palette.themeLighter },
  selectCell: { width: "40px", paddingLeft: space.m },
  warnCell: { display: "inline-flex", alignItems: "center", gap: space.xxs },
  warnIcon: { color: palette.Warning, minWidth: "auto", paddingLeft: 0, paddingRight: 0 },
  empty: {
    paddingTop: space.m, paddingBottom: space.m, paddingLeft: space.l,
    color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200,
  },
  /** `lbl_…_GeneratorsInProject_Instruction` — centred, semibold, above the (empty) gallery. */
  instruction: {
    display: "block", textAlign: "center",
    paddingTop: space.xxl, paddingBottom: space.xxl,
    fontWeight: tokens.fontWeightSemibold,
  },
  banner: {
    paddingTop: space.s, paddingBottom: space.s, paddingLeft: space.m, paddingRight: space.m,
    backgroundColor: "#FBE9E9", color: palette.Error, fontSize: tokens.fontSizeBase200,
  },
  panelColumns: {
    display: "grid", gap: space.xl,
    gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
    "@media (max-width: 899px)": { gridTemplateColumns: "minmax(0, 1fr)" },
  },
  panelColumn: { display: "flex", flexDirection: "column", gap: space.m, minWidth: 0 },
  /*
   * `drp_…_DurationYears.Width = 100`, `…_DurationMonths.Width = 120`, months placed at
   * `DurationYears.X + Width + 20` (`OpexCostScreenCode.txt:5989`, `:6053`). Fluent's Dropdown
   * `min-width: 160px` overrode both, so the pair sized off its own text and overflowed.
   */
  duration: { display: "flex", gap: "20px" },
  durationYears: { width: "100px", minWidth: "100px" },
  durationMonths: { width: "120px", minWidth: "120px" },
  /** Every other panel dropdown is `Parent.Width - Self.X*2`, i.e. the full column. */
  panelDropdown: { width: "100%", minWidth: "unset" },
  dateRow: { display: "flex", alignItems: "center", gap: space.xs },
  toggleRow: { display: "flex", alignItems: "center", gap: space.s },
  indent: { paddingLeft: space.xl, display: "flex", flexDirection: "column", gap: space.m },
  required: { color: palette.Error, marginRight: "2px" },
  label: { fontWeight: tokens.fontWeightSemibold, fontSize: tokens.fontSizeBase300 },
  error: { color: palette.Error, fontSize: tokens.fontSizeBase200 },
  hint: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  readOnly: {
    backgroundColor: palette.Grayscale30, color: palette.Grayscale10,
    paddingTop: space.xs, paddingBottom: space.xs,
    paddingLeft: space.m, paddingRight: space.m,
    borderTopLeftRadius: tokens.borderRadiusSmall,
    borderTopRightRadius: tokens.borderRadiusSmall,
    borderBottomLeftRadius: tokens.borderRadiusSmall,
    borderBottomRightRadius: tokens.borderRadiusSmall,
    fontSize: tokens.fontSizeBase200, minHeight: "22px",
  },
  radioGroup: { display: "flex", flexDirection: "column", gap: space.xs },
  radioRow: { display: "flex", alignItems: "center", gap: space.s, fontSize: tokens.fontSizeBase200 },
});

/* ═══════════════════════════════════════════════════════════════ the cards ══ */

/** One rendered card: a device type in O&M, a sub-account in Other OPEX. */
interface OpexCard {
  /** `locSelectedDeviceTypeInProject` / `locSelectedSubaccount` — the command scope. */
  id: string;
  /**
   * `lbl_…_CardHeader_SubaccountName.Text` — what the header RENDERS.
   *
   * In O&M that is the resolved `Generator.'Turbine Type'` or the PV module's `Label`
   * (`:4800-4840`), NOT the device row's `vsb_name`; in Other OPEX it is the sub-account name.
   * Distinct from `group` for exactly that reason.
   */
  title: string;
  /**
   * The name the COST BOOK and the WRITE LAYER key on: the device's `vsb_name` in O&M, the
   * sub-account's name in Other OPEX.
   *
   * `periodWrites.resolveDeviceType` / `resolveOpexGroupTarget` resolve a group back to its
   * Dataverse id by this string, so a save that sent `title` instead would fail to resolve every
   * WTG card the moment the header started showing a turbine type.
   */
  group: string;
  /** The sub-account a save binds to: the O&M one, or the card itself in Other OPEX. */
  subaccount: OpexSubaccount;
}

interface PanelState {
  card: OpexCard;
  /** `locSelectedOpexCost` — null while adding. */
  selected: OpexCost | null;
  /** `locSelectedOpexCostParent` — the chain head, or null on a root / a new cost type. */
  parent: OpexCost | null;
  /** `locSelectedOpexCostNext` — the period the new one follows. */
  next: OpexCost | null;
  /** `locResetStartDate`. */
  resetStartDate: boolean;
  /** `locCODDate` — the project's COD, except on Edit where `:954` / `:3422` set it to the row. */
  codDate: string | null;
  /** `locIsStartDateStandardAssumption`. */
  startDateStandard: boolean;
  /** The book row behind `selected`, so an Edit hands `contractId`/`parentId`/`periodIndex` back. */
  period: CostPeriod | null;
}

const NO_SELECTION: RowSelection = {
  selectedId: null, scopeId: null, candidateDescription: "", parentCostId: null,
};

/* ═════════════════════════════════════════════════════════════════ adapters ══ */

/** `0` reads back from Dataverse where the canvas wrote `Blank()`; `Text(0, "###…")` is empty. */
const blankZero = (value: number): number | null => (value === 0 ? null : value);

/** `CostPeriod`'s aggregation union -> the option-set value the panel's dropdown compares. */
const AGGREGATION_VALUE_OF: Record<CostPeriod["aggregation"], number> = {
  SUM: OPEX_AGGREGATION.sum,
  MAX: OPEX_AGGREGATION.max,
  MIN: OPEX_AGGREGATION.min,
};

/** The panel's aggregation dropdown -> `CostPeriod`'s union, for the save. */
function aggregationUnion(value: number | null): CostPeriod["aggregation"] {
  if (value === OPEX_AGGREGATION.max) return "MAX";
  if (value === OPEX_AGGREGATION.min) return "MIN";
  return "SUM";
}

/**
 * `CostPeriod` (the book's shape) → `OpexCost` (the rules' shape).
 *
 * `name` is REBUILT with `costName`, the canvas' own `vsb_name` composition
 * (`pcf_…_Save.OnChange`, `:8695`), because the book does not carry `vsb_name` and three rules
 * read it: `isStandardLocked`, `lastPeriod` (chain order, defect O-5) and `deleteAllowedForRow`.
 * Rebuilding it reproduces those three exactly rather than approximating them.
 *
 * The five money fields and the two threshold columns now come straight off the book: they are
 * NULLABLE there (an empty box stores `Blank()`, not 0, so `blankZero` is no longer needed for
 * them), `vsb_thresholdtype` carries the panel's own radio selection rather than a hard-coded
 * Individual, and `vsb_thresholdindividual` is its own column rather than a copy of
 * `vsb_eurmwh`.
 */
function toOpexCost(
  period: CostPeriod,
  mode: OpexMode,
  subaccount: OpexSubaccount,
  accountName: string,
): OpexCost {
  return {
    id: period.id,
    name: costName(
      {
        accountName,
        subaccountName: subaccount.name,
        deviceName: mode === "om" ? period.group : null,
      },
      period.description,
    ),
    description: period.description,
    parentCostId: period.parentId ?? null,
    subaccountId: subaccount.id,
    deviceTypeInProjectId: mode === "om" ? period.group : null,
    startDate: period.startDate || null,
    durationYears: period.years,
    durationMonths: period.months,
    currencyId: period.currency || null,
    currencyName: period.currency,
    fixCosts: period.fixed,
    percentOfRevenues: period.revenue,
    eurPerMwh: period.perMwh,
    eurPerMw: period.perMw,
    eurPerWtg: period.perWtg,
    aggregation: AGGREGATION_VALUE_OF[period.aggregation],
    distributionFrequency: period.frequency,
    threshold: period.threshold,
    thresholdType: period.threshold ? period.thresholdType ?? THRESHOLD_TYPE.individual : null,
    thresholdIndividual: period.threshold ? period.thresholdIndividual ?? null : null,
    useInflationProfile: period.inflation,
    useCountryInflationProfile: period.countryInflation,
    inflationProfile: blankZero(period.inflationPercent),
    inflationStartYear: period.inflationYear || null,
    inflationCountryArea: period.inflationCountryArea || null,
    alignWithProjectDuration: period.align,
    externalContract: period.external,
    isStandardContract: period.standard,
    isStartDateStandardAssumption: period.isStartDateStandard === true,
    createdOn: null,
  };
}

const iso = (date: Date | null): string => (date === null ? "" : [
  date.getFullYear(),
  String(date.getMonth() + 1).padStart(2, "0"),
  String(date.getDate()).padStart(2, "0"),
].join("-"));

const numberOrNull = (value: string): number | null => {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

const text = (value: number | null | undefined): string =>
  value === null || value === undefined ? "" : String(value);

/**
 * Everything the panel opens with, seeded in the canvas' own order:
 * description → start date → currency → inflation start year → inflation profile →
 * align → external.
 */
function seedForm(
  panel: PanelState,
  project: OpexProjectContext,
  mode: OpexMode,
  inflationRows: readonly CountryInflationProfile[],
  areaRegion: string | null,
): OpexForm {
  const { selected, parent, next } = panel;
  const contractLevel = parent !== null && selected === null ? parent : selected;

  const description = selected !== null
    ? selected.description
    : parent !== null
      ? nextPeriodDescriptionPanel(next, parent)
      : "";

  const startDate = startDateDefault({
    selected,
    parent,
    next,
    deviceId: mode === "om" ? panel.card.id : null,
    deviceCosts: [],
    codDate: panel.codDate,
    resetStartDate: panel.resetStartDate,
  }).date;

  // `drp_…_Currency.DefaultSelectedItems` (`:6194-6205`) reads the COUNTRY only. The control is
  // permanently Disabled, so a row saved in a third currency would silently be rewritten to EUR
  // on the next edit; the row's own currency is preferred here and the country default is the
  // fallback. Deliberate divergence — see the report.
  const currencyId = selected?.currencyName
    ?? parent?.currencyName
    ?? CURRENCY_NAME_BY_CODE[defaultCurrencyCode(project.countryName)]
    ?? "Euro";

  const useCountryInflationProfile = contractLevel?.useCountryInflationProfile ?? false;
  const inflationStartYear = inflationStartYearDefault({
    selected, parent, startDate: startDate,
  });
  // `LookUp('Country Inflation Profiles', country && year [&& area]).Inflation` (`:7822-7847`).
  // For Italy the canvas adds the Area term; `gblAreaWithRegion` minus its `Italy_` prefix is
  // what the Area dropdown would have preselected, so it is the fallback when the row carries
  // no area of its own.
  const countryProfile = countryInflationPercent(inflationRows, {
    year: inflationStartYear,
    countryName: project.countryName,
    area: contractLevel?.inflationCountryArea ?? italyZone(areaRegion) ?? null,
  });

  return {
    description,
    startDate: startDate === null ? null : iso(startDate),
    durationYears: selected?.durationYears ?? null,
    durationMonths: selected?.durationMonths ?? null,
    currencyId,
    aggregation: selected?.aggregation ?? null,
    distributionFrequency: selected?.distributionFrequency ?? null,
    fixCosts: text(selected?.fixCosts),
    percentOfRevenues: text(selected?.percentOfRevenues),
    eurPerMwh: text(selected?.eurPerMwh),
    eurPerMw: text(selected?.eurPerMw),
    eurPerWtg: text(selected?.eurPerWtg),
    thresholdOn: contractLevel?.threshold ?? false,
    thresholdType: contractLevel?.thresholdType ?? null,
    thresholdIndividual: text(contractLevel?.thresholdIndividual),
    inflationOn: contractLevel?.useInflationProfile ?? false,
    useCountryInflationProfile,
    inflationStartYear: text(inflationStartYear),
    inflationProfile: text(inflationProfileDefault({
      selected,
      parent,
      useCountryInflationProfile,
      countryName: project.countryName,
      countryProfile,
    })),
    inflationCountryArea: contractLevel?.inflationCountryArea ?? null,
    alignWithProjectDuration: alignWithProjectDurationDefault({ selected, parent }),
    externalContract: externalContractDefault({
      selected, parent, mode, subaccountOrder: panel.card.subaccount.order,
    }),
  };
}

/* ══════════════════════════════════════════════════════════════ the screen ══ */

export interface OpexScreenProps {
  /** `"om"` = Operation & Maintenance · `"other"` = Other OPEX Costs. */
  mode: OpexMode;
}

export default function OpexScreen({ mode }: OpexScreenProps) {
  const styles = useStyles();
  const { project, projectId } = useSession();
  const { data: book, isLoading, error, save } = useCostBook();
  const extras = useProjectExtras(projectId);
  const addStandard = useAddStandardContract();
  const areas = useCountryInflationAreas(extras.data?.countryId);
  /** `colOpexAccounts` / `colOpexSubaccounts` — real rows, not the constants this file carried. */
  const catalog = useOpexCatalog();
  /** `colDeviceTypesInProject` — `[generators, pvModules]` for `deviceTypeList` to order. */
  const deviceTypes = useOpexDeviceTypes(projectId);
  /** `Country Inflation Profiles` for the project's country — every year, every Area. */
  const countryInflation = useCountryInflation(extras.data?.countryId);
  /** The catalogue behind `Add Standard Contract`, for the command's gate. */
  const assumptionScopes = useOpexAssumptionScopes(
    extras.data?.countryId, extras.data?.technology,
  );

  const [openCards, setOpenCards] = useState<Record<string, boolean>>({});
  const [selection, setSelection] = useState<RowSelection>(NO_SELECTION);
  const [panel, setPanel] = useState<PanelState | null>(null);
  const [form, setForm] = useState<OpexForm | null>(null);
  const [deleting, setDeleting] = useState<OpexCost | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  /** `locSpinnerInformationText` — the text `cmp_OpexCosts_PopUpLoading` is showing. */
  const [busyLabel, setBusyLabel] = useState<string | null>(null);

  /* ── scope, once per render (`OnVisible`, `:9-64`) ─────────────────────── */

  const account = useMemo(
    () => selectedAccount(catalog.accounts, mode), [catalog.accounts, mode],
  );
  const subaccount = useMemo(
    () => defaultSubaccount(catalog.subaccounts, account),
    [catalog.subaccounts, account],
  );

  const projectContext = useMemo<OpexProjectContext>(() => ({
    codDate: project?.milestones?.operationsStartCod
      ? iso(project.milestones.operationsStartCod) : null,
    projectStartDate: project?.startDate ? iso(project.startDate) : null,
    endDate: project?.endDate ? iso(project.endDate) : null,
    countryName: project?.countryName ?? null,
    countryId: extras.data?.countryId ?? null,
    technology: extras.data?.technology ?? null,
    // `gblSelectedProject.'Area/State/Province'.Name` — `loadProject` now selects
    // `_vsb_countryarea_value` and resolves its name, so `areaWithRegion` answers for Italy too.
    areaStateProvince: project?.areaStateProvince ?? null,
    isoCurrencyCode: project?.isoCurrencyCode ?? null,
    owningBusinessUnitId: project?.owningBusinessUnitId ?? null,
  }), [project, extras.data]);

  /** `Set(gblAreaWithRegion, …)` (`OnStart.txt:902-961`) — Italy only, blank elsewhere. */
  const areaRegion = useMemo(
    () => areaWithRegion(projectContext.countryName, projectContext.areaStateProvince),
    [projectContext],
  );

  const columns = useMemo(
    () => opexColumns(mode, projectContext.isoCurrencyCode),
    [mode, projectContext.isoCurrencyCode],
  );

  /** `colOpexProjectCosts`, scoped to this rail item. */
  const allCosts = useMemo<OpexCost[]>(() => {
    if (!book || !subaccount || !account) return [];
    return book.periods
      .filter((p) => p.mode === mode)
      .map((p) => toOpexCost(
        p,
        mode,
        mode === "om" ? subaccount : subaccountFor(catalog.subaccounts, p.group, account),
        account.name,
      ));
  }, [book, mode, subaccount, account, catalog.subaccounts]);

  /** The book row behind each `OpexCost`, for the save/delete round trip. */
  const periodById = useMemo(
    () => new Map((book?.periods ?? []).map((p) => [p.id, p])),
    [book],
  );

  const cards = useMemo<OpexCard[]>(() => {
    if (!subaccount) return [];
    if (mode === "other") {
      // `gal_OpexCosts_Content_Subaccounts.Items` (`:328`) — every Other-OPEX sub-account, in
      // `vsb_order`, whether or not it holds a cost. Any group name a cost refers to that the
      // reference list does not mention is appended, so no row is ever invisible.
      const listed = subaccountsForMode(catalog.subaccounts, "other");
      const names = new Set(listed.map((s) => s.name));
      const extraNames = [...new Set(
        (book?.periods ?? []).filter((p) => p.mode === "other").map((p) => p.group),
      )].filter((name) => !names.has(name));
      return [
        ...listed.map((s) => ({ id: s.id, title: s.name, group: s.name, subaccount: s })),
        ...extraNames.map((name) => ({
          id: name,
          title: name,
          group: name,
          subaccount: {
            id: name, name, order: Number.MAX_SAFE_INTEGER,
            accountId: account?.id ?? null, accountName: OPEX_MODE_NAMES.other,
          },
        })),
      ];
    }
    /*
     * `colDeviceTypesInProject` (`:68-109`) — the real device rows, WTG types first by the
     * matching GENERATOR's `Created On` ascending, then the PV module types.
     *
     * This used to be synthesised from the cost book's group names, which meant two departures
     * from canvas that `loadOpexDeviceTypes` now closes: the WTG block was ordered by first
     * appearance in the book (`Description`, then `Start Date`) rather than by `Created On`, and
     * a device with no cost yet had no card at all. `card.id` / `card.group` stay the device's
     * `vsb_name` — the cost book groups on it and `resolveDeviceType` resolves on it — while
     * `card.title` becomes the resolved `Generator.'Turbine Type'` / PV `Label`, which is what
     * the canvas header label renders.
     */
    const generators = deviceTypes.data?.[0] ?? [];
    const pvModules = deviceTypes.data?.[1] ?? [];
    const known = new Set([...generators, ...pvModules].map((d) => d.name));
    // A device a cost still points at but the project no longer lists keeps its card rather than
    // taking its costs off screen with it — the silent-drop failure this codebase has had once.
    const orphans = [...new Set(
      (book?.periods ?? []).filter((p) => p.mode === "om").map((p) => p.group),
    )].filter((name) => !known.has(name)).map((name) => ({
      id: name, name, typeInProjectId: null, createdOn: null, displayName: name,
    }));
    return deviceTypeList(
      [...generators, ...orphans.filter((d) => addPeriodRecordType(d.name) === "Generator")],
      [...pvModules, ...orphans.filter((d) => addPeriodRecordType(d.name) !== "Generator")],
    ).map((d) => ({ id: d.name, title: d.displayName, group: d.name, subaccount }));
  }, [book, mode, subaccount, account, catalog.subaccounts, deviceTypes.data]);

  // The first card opens by default — that is what both reference screenshots show. `openCards`
  // holds only what the user has since changed, so the default never fights a deliberate close.
  const firstCardId = cards[0]?.id;
  const isOpen = (id: string) => openCards[id] ?? id === firstCardId;
  const toggleCard = (id: string) =>
    setOpenCards((prev) => ({ ...prev, [id]: !(prev[id] ?? id === firstCardId) }));

  const selectedCost = allCosts.find((c) => c.id === selection.selectedId) ?? null;

  /* ── commands ─────────────────────────────────────────────────────────── */

  const openPanel = (next: PanelState) => {
    setForm(seedForm(next, projectContext, mode, countryInflation.data ?? [], areaRegion));
    setPanel(next);
    setBanner(null);
  };

  const onCommand = (card: OpexCard, key: OpexCommandKey) => {
    const cardCosts = costsInScope(allCosts, mode, card.id);

    if (key === "newOpexProjectCostType") {
      // `:588-606` — a brand-new cost type: no parent, no next, start at COD, flag cleared.
      openPanel({
        card, selected: null, parent: null, next: null, resetStartDate: true,
        codDate: projectContext.codDate, startDateStandard: false, period: null,
      });
      return;
    }

    if (key === "newOpexProjectCost") {
      // `:607-630` / `:2990-3026` — the parent is the chain HEAD whichever period was selected,
      // the next is the selected row itself, and `locResetStartDate` is `IsBlank(next)`. On a card
      // that does not own the selection both are Blank, which is how O&M creates a cost type.
      const owns = selection.scopeId === card.id && selectedCost !== null;
      const parent = owns ? chainHead(cardCosts, selectedCost) : null;
      const next = owns ? selectedCost : null;
      openPanel({
        card, selected: null, parent, next, resetStartDate: next === null,
        codDate: projectContext.codDate, startDateStandard: false, period: null,
      });
      return;
    }

    if (key === "editOpexProjectCost" && selectedCost) {
      // `:926-955` / `:3396-3430` — `locSelectedOpexCostParent` is the row's parent (blank on a
      // root), `locCODDate` becomes the ROW's start date, and the standard-start flag survives
      // only on a root.
      const parent = selectedCost.parentCostId === null
        ? null
        : allCosts.find((c) => c.id === selectedCost.parentCostId) ?? null;
      openPanel({
        card,
        selected: selectedCost,
        parent,
        next: null,
        resetStartDate: false,
        codDate: selectedCost.startDate,
        startDateStandard: selectedCost.parentCostId === null
          ? selectedCost.isStartDateStandardAssumption
          : false,
        period: periodById.get(selectedCost.id) ?? null,
      });
      return;
    }

    if (key === "deleteOpexProjectCost" && selectedCost) {
      setDeleting(selectedCost);
      return;
    }

    if (key === "addStandardContract") {
      setBanner(null);
      setBusyLabel(OPEX_MSG.loadingStandardContract);
      addStandard.mutate({
        mode,
        group: card.group,
        countryId: extras.data?.countryId,
        technology: extras.data?.technology,
        codDate: projectContext.codDate ?? "",
        // `LookUp('Country Inflation Profiles', Country = … && Year = recCODYear).Inflation`
        // (`:726-728`) — COD year + 1, and with NO Area term even on an Italian project, which
        // is why `area` is not passed here. `undefined` rather than `null` keeps the write
        // layer's own `?? 0` in charge when the country has no profile for that year.
        countryInflationPercent: countryInflationPercent(
          countryInflation.data ?? [],
          {
            year: projectContext.codDate
              ? Number(projectContext.codDate.slice(0, 4)) + 1 : null,
            countryName: projectContext.countryName,
            area: null,
          },
        ) ?? undefined,
      }, {
        onError: (e: unknown) => setBanner(e instanceof Error ? e.message : String(e)),
        onSettled: () => setBusyLabel(null),
      });
    }
  };

  /**
   * `dte_…_StartDate.OnChange` (`:5823-5832`) — picking a date by hand also re-derives
   * `locIsStartDateStandardAssumption` from the period this one FOLLOWS, not from the row being
   * edited, and sets `locCODDate` to the chosen date (`:5838`).
   */
  const onStartDate = (value: string) => {
    setForm((f) => (f ? { ...f, startDate: value } : f));
    setPanel((p) => (p ? {
      ...p,
      codDate: value,
      startDateStandard: startDateStandardFlagAfterManualChange(p.next?.parentCostId),
    } : p));
  };

  /** `ico_ResetStartDay_NewEditCost_OPEXCosts.OnChange` (`:5941-5955`). */
  const onResetStartDate = () => {
    const cod = projectContext.codDate;
    setForm((f) => (f ? { ...f, startDate: cod } : f));
    setPanel((p) => (p ? {
      ...p,
      codDate: cod,
      resetStartDate: true,
      startDateStandard: resetStartDateFlag({
        selected: p.selected, parent: p.parent, next: p.next,
      }),
    } : p));
  };

  /* ── save (`pcf_…_BodyButtons_Save.OnChange`, `:8695`) ─────────────────── */

  const commit = async () => {
    if (!panel || !form || !book) return;
    const { card, selected, parent, period } = panel;
    if (!canSaveOpexCost(form, {
      selected,
      costsInScope: costsInScope(allCosts, mode, card.id),
      countryName: projectContext.countryName,
    })) return;

    /*
     * `Value(txt_…_InflationProfile.Value)` — with the country toggle ON the box is hidden but
     * its formula still evaluates to `Max(LookUp('Country Inflation Profiles', country && year
     * [&& area]).Inflation, 0)` (`:7822-7847`), and that is what the save stores. Recomputed
     * here rather than read from `form.inflationProfile`, because the start-year box and the
     * Area dropdown can both have moved since the panel opened.
     */
    const inflationYear = numberOrNull(form.inflationStartYear);
    const inflationPercent = form.useCountryInflationProfile
      ? Math.max(countryInflationPercent(countryInflation.data ?? [], {
        year: inflationYear,
        countryName: projectContext.countryName,
        area: form.inflationCountryArea ?? italyZone(areaRegion) ?? null,
      }) ?? 0, 0)
      : numberOrNull(form.inflationProfile) ?? 0;

    const saved: CostPeriod = {
      ...(period ?? {}),
      id: period?.id ?? crypto.randomUUID(),
      // The DEVICE NAME / SUB-ACCOUNT NAME, never `card.title`: in O&M the header now shows the
      // resolved turbine type, and the cost book and `resolveDeviceType` both key on the name.
      group: card.group,
      mode,
      description: form.description.trim(),
      startDate: form.startDate ?? "",
      years: form.durationYears ?? 0,
      months: form.durationMonths ?? 0,
      currency: form.currencyId ?? "",
      // `Value("")` is `Blank()`: an empty box stores nothing, not 0.
      fixed: numberOrNull(form.fixCosts),
      revenue: numberOrNull(form.percentOfRevenues),
      perMwh: numberOrNull(form.eurPerMwh),
      perMw: numberOrNull(form.eurPerMw),
      perWtg: numberOrNull(form.eurPerWtg),
      // All three options — `Choices('Opex Aggregation')` (`:7023`) — now that `CostPeriod`
      // carries MIN and the write map no longer collapses it to SUM.
      aggregation: aggregationUnion(form.aggregation),
      frequency: form.distributionFrequency ?? 1,
      inflation: form.inflationOn,
      countryInflation: form.useCountryInflationProfile,
      inflationYear: inflationYear ?? 0,
      inflationPercent,
      inflationCountryArea: form.inflationCountryArea ?? "",
      threshold: form.thresholdOn,
      // `rdg_….Selected.Value` and `Value(txt_…_Threshold_Individual.Value)` — the panel's own
      // two controls, not Individual-and-`vsb_eurmwh`.
      thresholdType: form.thresholdOn ? form.thresholdType ?? undefined : undefined,
      thresholdIndividual: form.thresholdOn ? numberOrNull(form.thresholdIndividual) : null,
      align: form.alignWithProjectDuration,
      external: form.externalContract,
      standard: period?.standard ?? false,
      // Rule 13 — `Coalesce(parent.IsStartDateStandardAssumption, locIsStartDateStandardAssumption)`.
      isStartDateStandard: inheritStartDateStandard(parent, panel.startDateStandard),
      // Add Period → the chain head on both columns. Add Contract Type / a new O&M cost type →
      // neither, which is what tells `savePeriod` to create a head.
      contractId: period?.contractId ?? parent?.id,
      parentId: period?.parentId ?? parent?.id,
    };

    // The canvas shows `savingCost` and then `updatingChildCosts` while `ForAll(varOpexChildCosts,
    // Patch(…))` runs. `savePeriod` performs the row write AND the cascade in one call, so only
    // one of the two can be named; the cascade is the phase worth naming when there is one.
    const cascades = selected !== null && childrenOf(allCosts, selected.id).length > 0;
    /*
     * THE PANEL CLOSES FIRST, THEN THE SPINNER APPEARS.
     *
     * The canvas Save raises the spinner and dismisses the panel in ONE `UpdateContext` —
     * `{locSpinnerInformationText: "Saving OPEX cost...", locIsVisiblePopUpSpinner: true,
     * locIsVisibleRightPanelNewEditOpexCost: false, locResetStartDate: false}`
     * (`OpexCostScreenCode.txt:8695`) — and only then runs the `Patch`.
     *
     * This used to close after awaiting, so the spinner was drawn on top of the panel it was
     * saving. The failure branch is just `Notify(…)`: the panel is already gone by then, so the
     * error surfaces as the screen banner below, not inside a panel.
     */
    setBusyLabel(cascades ? OPEX_MSG.updatingChildCosts : OPEX_MSG.savingCost);
    setPanel(null);
    setForm(null);
    try {
      await save.mutateAsync({
        ...book,
        periods: [...book.periods.filter((p) => p.id !== saved.id), saved],
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setBanner(OPEX_MSG.saveFailed("Save", message));
    } finally {
      setBusyLabel(null);
    }
  };

  /* ── delete (`cmp_…_DeleteCost.OnConfirm`, `:8861-8874`) ───────────────── */

  const confirmDelete = () => {
    if (!deleting || !book) { setDeleting(null); return; }
    const plan = planDeleteCost(costsInScope(allCosts, mode, selection.scopeId), deleting);
    // `deleteOpexPeriod` (`data/periodWrites.ts`) already removes the chain's children before the
    // head, so only the head is withdrawn from the book here — submitting `plan.ids` would make
    // the book diff issue a second, now-404 delete for every child. `plan.ids` is still what the
    // selection is cleared against.
    setBusyLabel(OPEX_MSG.deletingCost);
    save.mutate(
      { ...book, periods: book.periods.filter((p) => p.id !== deleting.id) },
      {
        onError: (e: unknown) => setBanner(e instanceof Error ? e.message : String(e)),
        onSettled: () => setBusyLabel(null),
      },
    );
    if (plan.ids.includes(selection.selectedId ?? "")) setSelection(NO_SELECTION);
    setDeleting(null);
  };

  /* ── render ───────────────────────────────────────────────────────────── */

  if (isLoading) {
    return <LoadingOverlay mode="inline" label={`Loading ${OPEX_MODE_NAMES[mode]}…`} />;
  }
  if (!book || error) {
    return (
      <EmptyState
        title="Cost data is unavailable"
        description="This project's Cost data could not be loaded."
      />
    );
  }

  // `lbl_OpexCosts_Content_GeneratorsInProject_Instruction.Visible` (`:309`) — O&M with an empty
  // device gallery renders this and nothing else.
  if (mode === "om" && cards.length === 0) {
    return (
      <div className={styles.page}>
        <Text className={styles.instruction}>{OPEX_MSG.noGenerators}</Text>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {banner ? <div className={styles.banner} role="alert">{banner}</div> : null}

      {cards.map((card) => (
        <OpexCardView
          key={card.id}
          card={card}
          mode={mode}
          open={isOpen(card.id)}
          columns={columns}
          allCosts={allCosts}
          project={projectContext}
          selection={selection}
          selectedCost={selectedCost}
          /*
           * `Filter('OPEX & Land Lease Standard Assumptions', Country && Technology &&
           * 'Type Of Contract' [&& 'Opex Subaccount'])` — `:650-662` / `:3038-3049`, expressed by
           * `standardAssumptionFilter` + `matchesStandardAssumption`. One query for the screen;
           * each card tests its own scope, so `Add Standard Contract` arrives DISABLED where
           * there is no catalogue instead of failing at the server with an inline error.
           */
          hasStandardAssumption={(assumptionScopes.data ?? []).some((a) =>
            matchesStandardAssumption(
              {
                ...a,
                // `matchesStandardAssumption` reads only these four; the rest of `OpexAssumption`
                // is not fetched, because nothing here needs an assumption's figures.
                id: a.id, period: 0, description: "",
                durationYears: null, durationMonths: null,
                currencyId: null, fixCosts: null, percentOfRevenues: null,
                eurPerMwh: null, eurPerMw: null, eurPerWtg: null,
                aggregation: null, distributionFrequency: null,
                threshold: false, thresholdType: null, thresholdIndividual: null,
                useInflationProfile: false, useCountryInflationProfile: false,
                inflationProfile: null, inflationCountryArea: null,
                alignWithProjectDuration: false, externalContract: false,
              },
              standardAssumptionFilter(mode, {
                countryId: projectContext.countryId,
                technology: projectContext.technology,
                subaccountId: card.subaccount.id,
              }),
            ))}
          onToggle={() => toggleCard(card.id)}
          onSelectRow={(row) =>
            setSelection((current) => toggleRowSelection({ current, row, cardScopeId: card.id }))}
          onCommand={(key) => onCommand(card, key)}
        />
      ))}

      {panel && form ? (
        <OpexPanel
          mode={mode}
          panel={panel}
          form={form}
          project={projectContext}
          areaRegion={areaRegion}
          areaOptions={areas.data ?? []}
          cardCosts={costsInScope(allCosts, mode, panel.card.id)}
          busy={save.isPending}
          onChange={(patch) => setForm((f) => (f ? { ...f, ...patch } : f))}
          onStartDate={onStartDate}
          onResetStartDate={onResetStartDate}
          onCancel={() => { setPanel(null); setForm(null); }}
          onSave={() => { void commit(); }}
        />
      ) : null}

      <ConfirmDialog
        open={deleting !== null}
        title={DELETE_DIALOG.title}
        description={deleteDialogText(deleting)}
        confirmText={DELETE_DIALOG.confirm}
        cancelText={DELETE_DIALOG.cancel}
        destructive
        busy={save.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={confirmDelete}
      />

      {busyLabel ? <LoadingOverlay label={busyLabel} /> : null}
    </div>
  );
}

/**
 * The sub-account an Other-OPEX group name binds to.
 *
 * A name the reference list does not carry still gets a sub-account record, so its costs keep a
 * card and a correctly composed `vsb_name` instead of disappearing.
 */
function subaccountFor(
  subaccounts: readonly OpexSubaccount[],
  group: string,
  account: { id: string } | null,
): OpexSubaccount {
  return subaccounts.find((s) => s.name === group) ?? {
    id: group, name: group, order: Number.MAX_SAFE_INTEGER,
    accountId: account?.id ?? null, accountName: OPEX_MODE_NAMES.other,
  };
}

/* ═══════════════════════════════════════════════════════════════ the card ══ */

function OpexCardView({
  card, mode, open, columns, allCosts, project, selection, selectedCost,
  hasStandardAssumption, onToggle, onSelectRow, onCommand,
}: {
  card: OpexCard;
  mode: OpexMode;
  open: boolean;
  columns: ReturnType<typeof opexColumns>;
  allCosts: readonly OpexCost[];
  project: OpexProjectContext;
  selection: RowSelection;
  selectedCost: OpexCost | null;
  /** `recCountryTechnologyRelatedStandardAssumption` — does this scope have a catalogue at all? */
  hasStandardAssumption: boolean;
  onToggle: () => void;
  onSelectRow: (row: OpexCost) => void;
  onCommand: (key: OpexCommandKey) => void;
}) {
  const styles = useStyles();
  const cardCosts = costsInScope(allCosts, mode, card.id);

  // `con_AlignWithProjectDuration_Container` — the device card and the sub-account card use
  // DIFFERENT algorithms (`omDurationBadge` reproduces defect O-4).
  const badge = mode === "om"
    ? omDurationBadge(cardCosts, project)
    : durationBadge(cardCosts, project);

  const gates = opexCommands({
    mode,
    cardScopeId: card.id,
    selectedScopeId: selection.scopeId,
    selected: selectedCost,
    allCosts,
    cardCosts,
    candidateDescription: selection.candidateDescription,
    hasStandardAssumption,
    // `DataSourceInfo`/`RecordInfo` have no Code-App equivalent; the server refuses what the user
    // may not do. The canvas O&M bar carries no `RecordInfo` check at all (defect O-1).
    permissions: { canCreate: true, canEditRecord: true, canDeleteRecord: true },
  });

  const icons = { Add: <AddRegular />, Edit: <EditRegular />, Delete: <DeleteRegular /> };

  return (
    <section className={styles.card}>
      <button type="button" className={styles.cardHeader} aria-expanded={open} onClick={onToggle}>
        <Text className={styles.cardTitle}>{card.title}</Text>
        {badge !== "none" ? (
          <span
            className={mergeClasses(
              styles.badge,
              badge === "match" ? styles.badgeMatch : styles.badgeMismatch,
            )}
            data-testid={`opex-badge-${card.id}`}
          >
            {DURATION_BADGE_TEXT[badge]}
          </span>
        ) : null}
        {open ? <ChevronUpRegular /> : <ChevronDownRegular />}
      </button>

      {open ? (
        <>
          <div className={styles.toolbar}>
            {visibleCommands(mode).map((key) => (
              <Button
                key={key}
                appearance="transparent"
                className={styles.command}
                icon={icons[OPEX_COMMAND_ICONS[key]]}
                disabled={!gates[key]}
                onClick={() => onCommand(key)}
                data-testid={`opex-${key}`}
              >
                {OPEX_COMMAND_LABELS[key]}
              </Button>
            ))}
          </div>

          {cardCosts.length === 0 ? null : (
            <div className={styles.scroll}>
              <table className={styles.table} aria-label={`${card.title} costs`}>
                <thead>
                  <tr>
                    <th className={styles.selectCell} />
                    {columns.map((c) => (
                      <th
                        key={c.key}
                        scope="col"
                        className={mergeClasses(styles.th, c.numeric && styles.thNumeric)}
                      >
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cardCosts.map((cost) => {
                    const row = toOpexRow({
                      cost, mode, selectedId: selection.selectedId, project, cardCosts,
                    });
                    return (
                      <tr
                        key={row.id}
                        className={mergeClasses(
                          row.standard && styles.rowStandard,
                          row.selected && styles.rowSelected,
                        )}
                        onClick={() => onSelectRow(cost)}
                      >
                        <td className={styles.selectCell}>
                          {/* `img_…_CostsTableRow_RadioSelection` is a PICTURE; the whole row is
                              one `btn_…_TransparentButton` (`:2137`). Keeping the radio read-only
                              and letting the click bubble to the row is what makes selection
                              TOGGLE once rather than twice. */}
                          <input
                            type="radio"
                            name={`opex-${card.id}`}
                            checked={row.selected}
                            readOnly
                            aria-label={`Select ${row.cells.description}`}
                            data-testid={`opex-select-${row.id}`}
                          />
                        </td>
                        {columns.map((c) => (
                          <td
                            key={c.key}
                            className={mergeClasses(
                              styles.td,
                              c.numeric && styles.tdNumeric,
                              c.key === "durationMonths" && !row.standard && styles.tdMonths,
                            )}
                          >
                            {c.key === "durationMonths" ? (
                              <span className={styles.warnCell}>
                                {row.cells[c.key] ?? ""}
                                {/* `inf_OpexCost_AlignWithDuration` sits immediately after the
                                    months cell (`X: = …DurationMonths.X + …Width`). */}
                                {row.warnAlignment ? (
                                  <Tooltip content={OPEX_MSG.doesNotAlign} relationship="label">
                                    <Button
                                      appearance="transparent"
                                      size="small"
                                      className={styles.warnIcon}
                                      icon={<InfoRegular />}
                                      aria-label={OPEX_MSG.doesNotAlign}
                                      data-testid={`opex-warn-${row.id}`}
                                    />
                                  </Tooltip>
                                ) : null}
                              </span>
                            ) : row.cells[c.key] ?? ""}
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

/* ══════════════════════════════════════════════════════════════ the panel ══ */

function OpexPanel({
  mode, panel, form, project, areaRegion, areaOptions, cardCosts, busy,
  onChange, onStartDate, onResetStartDate, onCancel, onSave,
}: {
  mode: OpexMode;
  panel: PanelState;
  form: OpexForm;
  project: OpexProjectContext;
  areaRegion: string | null;
  areaOptions: readonly string[];
  cardCosts: readonly OpexCost[];
  busy: boolean;
  onChange: (patch: Partial<OpexForm>) => void;
  onStartDate: (value: string) => void;
  onResetStartDate: () => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const styles = useStyles();
  const { selected, parent, card } = panel;

  const ctx: PanelContext = {
    mode,
    selected,
    parent,
    // `locSelectedAccount = First(colOpexAccounts)` is true exactly in O&M mode; the panel header
    // says "Cost Type" only when it is NOT (`:5430-5445`).
    isFirstAccount: mode === "om",
    deviceLabel: card.title,
    // `locSelectedRecordTypeAddPeriod = If(Left(ThisItem.Name, 3) = "WTG", …)` (`:2927-2934`)
    // keys off the DEVICE ROW's name, which is `card.group` — the header's turbine type would
    // never start with "WTG" and would hide `EUR/WTG` on every generator card.
    recordType: mode === "om" ? addPeriodRecordType(card.group) : null,
    countryName: project.countryName,
  };

  const modes = panelFieldModes(ctx, {
    eurPerMwh: form.eurPerMwh,
    useCountryInflationProfile: form.useCountryInflationProfile,
  });
  const required = panelRequiredMarkers(ctx, {
    useCountryInflationProfile: form.useCountryInflationProfile,
  });
  const errors = opexFormErrors(form, {
    selected, costsInScope: cardCosts, countryName: project.countryName,
  });
  const errorFor = (field: string) => errors.find((e) => e.field === field)?.message;
  const canSave = canSaveOpexCost(form, {
    selected, costsInScope: cardCosts, countryName: project.countryName,
  });

  const currencyCode = currencyCodeOf(form.currencyId);
  const disabled = (m: FieldMode) => m !== "edit";

  /**
   * `con_…_AreaInflationProfile.Visible` is literally `false` (`:7576`) — defect O-2 — while the
   * Save gate still demands an Area on an Italian project with both inflation toggles on
   * (`:8672-8676`). Reproducing only the canvas answer makes Save permanently impossible there,
   * so the commented-out INTENDED condition is ORed in. Deliberate divergence — see the report.
   */
  const showArea = areaFieldVisible() || areaFieldVisibleIntended({
    inflationOn: form.inflationOn,
    useCountryInflationProfile: form.useCountryInflationProfile,
    countryName: project.countryName,
  });

  const star = (on: boolean | undefined) =>
    (on === true ? <span className={styles.required}>*</span> : null);

  /** A panel label: the conditional red asterisk, then the caption in its own element. */
  const fieldLabel = (on: boolean | undefined, caption: string) => (
    <Text className={styles.label}>
      {on === true ? <span className={styles.required}>*</span> : null}
      <span>{caption}</span>
    </Text>
  );

  const numberField = (
    field: "fixCosts" | "percentOfRevenues" | "eurPerMwh" | "eurPerMw" | "eurPerWtg",
    label: string,
  ) => (
    <CostField
      label={label}
      type="number"
      value={form[field]}
      disabled={disabled(modes[field])}
      error={errorFor(field)}
      onChange={(v) => onChange({ [field]: v } as Partial<OpexForm>)}
    />
  );

  return (
    <FormPanel
      open
      title={panelTitle(ctx)}
      width="cost"
      onDismiss={onCancel}
      footer={
        <>
          {showAtLeastOneFigureHint(form) ? (
            <Text className={styles.hint}>{OPEX_MSG.atLeastOneFigure}</Text>
          ) : null}
          <PanelButtons onSave={onSave} onCancel={onCancel} disabled={!canSave || busy} />
        </>
      }
    >
      <div className={styles.panelColumns}>
        {/* ── con_…_Body_ColumnLeft ──────────────────────────────────────── */}
        <div className={styles.panelColumn}>
          <CostField
            label={OPEX_PANEL_LABELS.description}
            required={required.description}
            value={form.description}
            disabled={disabled(modes.description)}
            error={errorFor("description")}
            onChange={(v) => onChange({ description: v })}
          />

          <div>
            {fieldLabel(required.startDate, OPEX_PANEL_LABELS.startDate)}
            <div className={styles.dateRow}>
              <Input
                type="date"
                value={form.startDate ?? ""}
                disabled={disabled(modes.startDate)}
                style={{ flex: 1 }}
                data-testid="opex-start"
                onChange={(_, d) => onStartDate(d.value)}
              />
              {/* `ico_ResetStartDay_NewEditCost_OPEXCosts` (`:5942-5963`) — chain roots only. */}
              {resetStartDateVisible({ selected, parent }) ? (
                <Tooltip content="Reset to the standard assumption date." relationship="label">
                  <Button
                    appearance="subtle"
                    icon={<ArrowCounterclockwiseRegular />}
                    data-testid="opex-reset-start"
                    aria-label="Reset start date"
                    onClick={onResetStartDate}
                  />
                </Tooltip>
              ) : null}
            </div>
            {errorFor("startDate") ? (
              <Text className={styles.error}>{errorFor("startDate")}</Text>
            ) : null}
          </div>

          <div>
            {fieldLabel(required.duration, OPEX_PANEL_LABELS.duration)}
            <div className={styles.duration}>
              <Dropdown
                aria-label="Duration years"
                className={styles.durationYears}
                data-testid="opex-years"
                disabled={disabled(modes.durationYears)}
                value={DURATION_YEAR_OPTIONS.find((o) => o.value === form.durationYears)?.name ?? ""}
                selectedOptions={form.durationYears === null ? [] : [String(form.durationYears)]}
                onOptionSelect={(_, d) => onChange({ durationYears: Number(d.optionValue) })}
              >
                {DURATION_YEAR_OPTIONS.map((o) => (
                  <Option key={o.value} value={String(o.value)}>{o.name}</Option>
                ))}
              </Dropdown>
              <Dropdown
                aria-label="Duration months"
                className={styles.durationMonths}
                data-testid="opex-months"
                disabled={disabled(modes.durationMonths)}
                value={DURATION_MONTH_OPTIONS.find((o) => o.value === form.durationMonths)?.name ?? ""}
                selectedOptions={form.durationMonths === null ? [] : [String(form.durationMonths)]}
                onOptionSelect={(_, d) => onChange({ durationMonths: Number(d.optionValue) })}
              >
                {DURATION_MONTH_OPTIONS.map((o) => (
                  <Option key={o.value} value={String(o.value)}>{o.name}</Option>
                ))}
              </Dropdown>
            </div>
          </div>

          <div>
            {fieldLabel(required.currency, OPEX_PANEL_LABELS.currency)}
            {/* `drp_…_Currency.DisplayMode: =DisplayMode.Disabled` — always (`:6206`). */}
            <Dropdown
              aria-label={OPEX_PANEL_LABELS.currency}
              className={styles.panelDropdown}
              data-testid="opex-currency"
              disabled
              value={form.currencyId ?? ""}
              selectedOptions={form.currencyId === null ? [] : [form.currencyId]}
              onOptionSelect={(_, d) => onChange({ currencyId: d.optionValue ?? null })}
            >
              {[...new Set([
                form.currencyId ?? "",
                ...Object.values(CURRENCY_NAME_BY_CODE),
              ])].filter(Boolean).map((name) => (
                <Option key={name} value={name}>{name}</Option>
              ))}
            </Dropdown>
          </div>

          {numberField("fixCosts", `Fix Costs p.a. [${project.isoCurrencyCode || "EUR"}]`)}
          {numberField("percentOfRevenues", OPEX_PANEL_LABELS.percentOfRevenues)}
          {numberField("eurPerMwh", panelRateLabel(currencyCode, "MWh"))}
          {numberField("eurPerMw", panelRateLabel(currencyCode, "MW"))}
          {/* `con_…_EuroPerWtg.Visible` (`:6868-6871`) — hidden for a PV module. */}
          {showEurPerWtgField(ctx.recordType)
            ? numberField("eurPerWtg", panelRateLabel(currencyCode, "WTG"))
            : null}

          <div>
            {fieldLabel(required.aggregation, OPEX_PANEL_LABELS.aggregation)}
            <Dropdown
              aria-label={OPEX_PANEL_LABELS.aggregation}
              className={styles.panelDropdown}
              data-testid="opex-aggregation"
              disabled={disabled(modes.aggregation)}
              value={form.aggregation === null ? "" : OPEX_AGGREGATION_LABEL[form.aggregation] ?? ""}
              selectedOptions={form.aggregation === null ? [] : [String(form.aggregation)]}
              onOptionSelect={(_, d) => onChange({ aggregation: Number(d.optionValue) })}
            >
              {AGGREGATION_OPTIONS.map((value) => (
                <Option key={value} value={String(value)}>
                  {OPEX_AGGREGATION_LABEL[value] ?? ""}
                </Option>
              ))}
            </Dropdown>
          </div>

          <div>
            {fieldLabel(
              required.distributionFrequency, OPEX_PANEL_LABELS.distributionFrequency,
            )}
            <Dropdown
              aria-label={OPEX_PANEL_LABELS.distributionFrequency}
              className={styles.panelDropdown}
              data-testid="opex-frequency"
              disabled={disabled(modes.distributionFrequency)}
              value={OPEX_DISTRIBUTION_FREQUENCY
                .find((o) => o.value === form.distributionFrequency)?.name ?? ""}
              selectedOptions={form.distributionFrequency === null
                ? [] : [String(form.distributionFrequency)]}
              onOptionSelect={(_, d) => onChange({ distributionFrequency: Number(d.optionValue) })}
            >
              {OPEX_DISTRIBUTION_FREQUENCY.map((o) => (
                <Option key={o.value} value={String(o.value)}>{o.name}</Option>
              ))}
            </Dropdown>
          </div>
        </div>

        {/* ── con_…_Body_ColumnRight ─────────────────────────────────────── */}
        <div className={styles.panelColumn}>
          {/* `con_…_InflationToggles` — Inflation Profile first, Country Inflation Profile below
              it, and the container clips to the first toggle while inflation is off (`:7273`). */}
          <div className={styles.toggleRow}>
            {star(required.inflationProfileToggle)}
            <Switch
              checked={form.inflationOn}
              disabled={disabled(modes.inflationProfileToggle)}
              data-testid="opex-inflation"
              onChange={(_, d) => onChange(d.checked ? { inflationOn: true } : {
                // `tgl_…_InflationProfile.OnUncheck` resets the whole block (`:7378-7386`).
                inflationOn: false,
                useCountryInflationProfile: false,
                inflationStartYear: "",
                inflationProfile: "",
                inflationCountryArea: null,
              })}
            />
            <Text>{OPEX_PANEL_LABELS.inflationProfile}</Text>
          </div>

          {form.inflationOn ? (
            <>
              <div className={styles.toggleRow}>
                {star(required.countryInflationProfile)}
                <Switch
                  checked={form.useCountryInflationProfile}
                  disabled={disabled(modes.countryInflationProfile)}
                  data-testid="opex-country-inflation"
                  onChange={(_, d) => onChange({
                    useCountryInflationProfile: d.checked,
                    // `OnSelect: Reset(txt_…_InflationProfile)` (`:7345`).
                    inflationProfile: "",
                  })}
                />
                <Text>{OPEX_PANEL_LABELS.countryInflationProfile}</Text>
              </div>

              <CostField
                label={OPEX_PANEL_LABELS.inflationStartYear}
                required={required.inflationStartYear}
                value={form.inflationStartYear}
                disabled={disabled(modes.inflationStartYear)}
                placeholder={OPEX_PANEL_LABELS.inflationStartYearPlaceholder}
                maxLength={4}
                error={errorFor("inflationStartYear")}
                onChange={(v) => onChange({ inflationStartYear: v })}
              />

              {showArea ? (
                <div>
                  {fieldLabel(required.inflationCountryArea, OPEX_PANEL_LABELS.area)}
                  <Dropdown
                    aria-label={OPEX_PANEL_LABELS.area}
                    className={styles.panelDropdown}
                    data-testid="opex-area"
                    disabled={disabled(modes.inflationCountryArea)}
                    value={form.inflationCountryArea ?? ""}
                    selectedOptions={form.inflationCountryArea ? [form.inflationCountryArea] : []}
                    onOptionSelect={(_, d) =>
                      onChange({ inflationCountryArea: d.optionValue ?? null })}
                  >
                    {[...new Set([
                      ...areaOptions,
                      // `gblAreaWithRegion` without its `Italy_` prefix is the value the canvas
                      // would have preselected.
                      ...(areaRegion ? [areaRegion.split("Italy_").join("")] : []),
                    ])].map((area) => <Option key={area} value={area}>{area}</Option>)}
                  </Dropdown>
                </div>
              ) : null}

              {/* `lbl_…_InflationProfile.Text` switches caption AND control on the country
                  toggle (`:7940-7950`, `:7789`, `:7861`). */}
              <div>
                {fieldLabel(
                  required.inflationProfile,
                  form.useCountryInflationProfile
                    ? OPEX_PANEL_LABELS.countryInflationProfile
                    : OPEX_PANEL_LABELS.customInflationProfile,
                )}
                {form.useCountryInflationProfile ? (
                  <div className={styles.readOnly} data-testid="opex-inflation-country">
                    {inflationProfileCountryText(project)}
                  </div>
                ) : (
                  <>
                    <Input
                      type="number"
                      value={form.inflationProfile}
                      disabled={disabled(modes.inflationProfile)}
                      data-testid="opex-inflation-profile"
                      onChange={(_, d) => onChange({ inflationProfile: d.value })}
                    />
                    {errorFor("inflationProfile") ? (
                      <Text className={styles.error}>{errorFor("inflationProfile")}</Text>
                    ) : null}
                  </>
                )}
              </div>
            </>
          ) : null}

          {/* `con_…_Threshold_Container.Visible` (`:8100`) — O&M only. */}
          {showThresholdColumn(mode) ? (
            <>
              <div className={styles.toggleRow}>
                <Switch
                  checked={form.thresholdOn}
                  disabled={disabled(modes.threshold)}
                  data-testid="opex-threshold"
                  onChange={(_, d) => onChange(d.checked
                    ? { thresholdOn: true }
                    : { thresholdOn: false, thresholdType: null, thresholdIndividual: "" })}
                />
                <Text>{thresholdToggleLabel(project.isoCurrencyCode)}</Text>
              </div>

              {form.thresholdOn ? (
                <div className={styles.indent}>
                  <div>
                    {fieldLabel(required.threshold, OPEX_PANEL_LABELS.threshold)}
                    <div className={styles.radioGroup} role="radiogroup" aria-label="Threshold">
                      {THRESHOLD_OPTIONS.map((o) => (
                        <label key={o.value} className={styles.radioRow}>
                          <input
                            type="radio"
                            name="opex-threshold-type"
                            checked={form.thresholdType === o.value}
                            disabled={disabled(modes.thresholdType)}
                            data-testid={`opex-threshold-${o.value}`}
                            onChange={() => onChange({
                              thresholdType: o.value,
                              // `rdg_….OnChange: Reset(txt_…_Threshold_Individual)` (`:8313`).
                              thresholdIndividual: "",
                            })}
                          />
                          {o.label}
                        </label>
                      ))}
                    </div>
                    {errorFor("thresholdType") ? (
                      <Text className={styles.error}>{errorFor("thresholdType")}</Text>
                    ) : null}
                  </div>

                  {/* `con_…_Threshold_Individual.Visible` — Individual only (`:8151`). */}
                  {form.thresholdType === THRESHOLD_TYPE.individual ? (
                    <CostField
                      label={OPEX_PANEL_LABELS.individualThreshold}
                      required={required.thresholdIndividual}
                      type="number"
                      value={form.thresholdIndividual}
                      disabled={disabled(modes.thresholdIndividual)}
                      error={errorFor("thresholdIndividual")}
                      onChange={(v) => onChange({ thresholdIndividual: v })}
                    />
                  ) : null}
                </div>
              ) : null}
            </>
          ) : null}

          <div className={styles.toggleRow}>
            <Switch
              checked={form.alignWithProjectDuration}
              disabled={disabled(modes.alignWithProjectDuration)}
              data-testid="opex-align"
              onChange={(_, d) => onChange({ alignWithProjectDuration: d.checked })}
            />
            <Text>{OPEX_PANEL_LABELS.alignWithProjectDuration}</Text>
          </div>

          <div className={styles.toggleRow}>
            <Switch
              checked={form.externalContract}
              disabled={disabled(modes.externalContract)}
              data-testid="opex-external"
              onChange={(_, d) => onChange({ externalContract: d.checked })}
            />
            <Text>{OPEX_PANEL_LABELS.externalContract}</Text>
            {/* `InfoButtonCanvas1.Content` (`:8552`). */}
            <Tooltip content={OPEX_MSG.externalContractHelp} relationship="description">
              <Button
                appearance="transparent"
                icon={<InfoRegular />}
                aria-label="About external contracts"
              />
            </Tooltip>
          </div>

        </div>
      </div>
    </FormPanel>
  );
}
