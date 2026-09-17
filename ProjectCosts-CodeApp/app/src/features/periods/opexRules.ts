/**
 * OPEX — `Operation & Maintenance` and `Other OPEX Costs`, every decision as a pure function.
 *
 * Canvas source: `Opex Costs Screen` — `OpexCostScreenCode.txt` (8,932 lines of Power Fx,
 * 230 controls) and `OnStart.txt` for `colOpexAccounts`, `colOpexSubaccounts` and
 * `gblAreaWithRegion`. Every line reference below is into `OpexCostScreenCode.txt` unless the
 * comment names another file.
 *
 * ONE SCREEN, TWO RAIL ITEMS. `App.pa.yaml:102-125` gives both `O&MKey`
 * ("Operation & Maintenance") and `OtherOpexCostsKey` ("Other OPEX Costs") the same
 * `TargetScreen: 'Opex Costs Screen'`, and `OnVisible` (`:9-14`) derives the mode from
 * `gblLeftNavigationSelected.ItemDisplayName`. In this app the mode arrives as a route prop;
 * `modeFromNavKey` keeps the canvas key mapping resolvable.
 *
 * WHAT THE TWO MODES ACTUALLY SHARE AND WHERE THEY DIVERGE
 *
 *   scoping      O&M cards are DEVICE TYPES (`gal_OpexCosts_Content_GeneratorsInProject`,
 *                `Items: colDeviceTypesInProject`, `:2689`);
 *                Other OPEX cards are SUB-ACCOUNTS
 *                (`gal_OpexCosts_Content_Subaccounts`,
 *                `Items: Filter(colOpexSubaccounts, Account.Name = "Other OPEX Costs")`, `:328`)
 *   command bar  O&M has FOUR commands and NO `RecordInfo` checks (`:2770-2923`);
 *                Other OPEX has FIVE — it gains `Add Contract Type` — and DOES check
 *                `RecordInfo` (`:411-575`)
 *   columns      `Threshold` renders only when `locSelectedSubaccountOandM` (`:1242`, `:3636`),
 *                and the two headers are worded differently (see `OPEX_COLUMNS`)
 *   panel        the `Threshold` block is O&M-only
 *                (`con_..._Threshold_Container.Visible`, `:8100`);
 *                `EUR/WTG` hides for a PV module (`:6868-6871`)
 *   duration     the sub-account card badge and the device card badge use DIFFERENT
 *                algorithms — see `durationBadge` and `omDurationBadge`
 *
 * Nothing here touches React, the network or a global. Structural input types are declared
 * locally on purpose: `@/features/costing/model`'s `CostPeriod` is being reshaped by the data
 * layer, and these rules must stay testable against a plain record.
 *
 * Provenance comments cite the canvas control and property, in the form `control.Property`,
 * so a reviewer can diff against the source.
 */
import { inRange, isDecimal, isNumeric, orZero, parseNumber } from "@/domain/numeric";
import { numberFormat } from "@/domain/locale";

/* ═══════════════════════════════════════════════════════════════════ dates ══ */

/**
 * Power Fx `DateAdd(date, n, TimeUnit.Months)` — clamps the day to the last day of the target
 * month, so 31 Jan + 1 month is 28/29 Feb rather than rolling into March.
 */
export function addMonths(date: Date, months: number): Date {
  const day = date.getDate();
  const out = new Date(date.getTime());
  out.setDate(1);
  out.setMonth(out.getMonth() + months);
  const lastDay = new Date(out.getFullYear(), out.getMonth() + 1, 0).getDate();
  out.setDate(Math.min(day, lastDay));
  return out;
}

/** Midday parse, so a date-only ISO string cannot shift a day under a negative UTC offset. */
export function toDate(value: string | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const d = value instanceof Date
    ? new Date(value.getTime())
    : new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Power Fx `Text(date, "yyyy/mm/dd")` — the form both duration comparisons are made in. */
export function ymd(date: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}/${p(date.getMonth() + 1)}/${p(date.getDate())}`;
}

/** `Text(date, "dd.mm.yy")` — every date cell in both cost tables (`:2055`, `:4557`). */
export function formatTableDate(value: string | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${p(d.getFullYear() % 100)}`;
}

/* ═════════════════════════════════════════════════════════════ option sets ══ */

/**
 * `vsb_aggregation` on `vsb_opexprojectcosts`. Measured against VSBCloud_Dev metadata,
 * 16 Sep — the canvas dropdown is `Items: Choices('Opex Aggregation')` (`:7023`), i.e. all
 * three. `periods/rules.ts` models only SUM and MAX and is therefore short one option.
 */
export const OPEX_AGGREGATION = {
  sum: 952850000,
  max: 952850001,
  min: 952850002,
} as const;

export const OPEX_AGGREGATION_LABEL: Record<number, string> = {
  [OPEX_AGGREGATION.sum]: "SUM",
  [OPEX_AGGREGATION.max]: "MAX",
  [OPEX_AGGREGATION.min]: "MIN",
};

/**
 * `vsb_thresholdtype` — the canvas `Thresholds` option set
 * (`rdg_..._Threshold.Items: Choices(Thresholds)`, `:8302`). Verified against the org.
 */
export const THRESHOLD_TYPE = {
  netYieldP75: 952850000,
  netYieldP90: 952850001,
  individual: 952850002,
} as const;

/**
 * `vsb_typeofcontract` on `vsb_opexlandleasestandardassumptions`, verified against the org:
 * the two OPEX loaders filter `'Type Of Contract' = 'Contract Types'.'Opex O&M'` (`:2842`)
 * and `… .'Opex Other'` (`:481`, `:656`).
 */
export const TYPE_OF_CONTRACT = {
  landLease: 952850000,
  opexOandM: 952850001,
  opexOther: 952850002,
  devexCapex: 952850003,
  bop: 128470001,
} as const;

/**
 * `vsb_period` — `'Opex & Land Lease Period'.'Period 1'` … `'Period 10'`. The standard load
 * branches on Period 1 vs Period 2 vs everything else (`:783-820`, `:3171-3208`).
 */
export const STANDARD_PERIOD = {
  period1: 952850000,
  period2: 952850001,
  period3: 952850002,
  period4: 952850003,
  period5: 952850004,
  period6: 952850005,
  period7: 952850006,
  period8: 952850007,
  period9: 952850008,
  period10: 952850009,
} as const;

/** `'Opex Project Costs'.'Time Zone Rule Version Number': 4` — written literally on save (`:8695`). */
export const TIME_ZONE_RULE_VERSION_NUMBER = 4;

/* ═══════════════════════════════════════════════════════════════ the modes ══ */

export type OpexMode = "om" | "other";

/** `locSelectedAccount` compares against these two literals (`OnVisible`, `:10`, `:12`). */
export const OPEX_MODE_NAMES = {
  om: "Operation & Maintenance",
  other: "Other OPEX Costs",
} as const;

export const MODE_DISPLAY_NAME: Record<OpexMode, string> = {
  om: OPEX_MODE_NAMES.om,
  other: OPEX_MODE_NAMES.other,
};

/** `LeftNavigationMenu` in `App.pa.yaml:102` / `:120`. */
export const NAV_KEY_TO_MODE: Record<string, OpexMode> = {
  "O&MKey": "om",
  OtherOpexCostsKey: "other",
};

export function modeFromNavKey(key: string | null | undefined): OpexMode | null {
  if (!key) return null;
  return NAV_KEY_TO_MODE[key] ?? null;
}

export interface OpexAccount { id: string; name: string; order: number }

export interface OpexSubaccount {
  id: string;
  name: string;
  order: number;
  accountId: string | null;
  /** The `Account.Name` the Other-OPEX gallery filters on (`:328`). */
  accountName: string | null;
  /** `colOpexSubaccounts` adds `IsFolded: true` in `OnStart.txt:631-640`. */
  isFolded?: boolean;
}

/**
 * `Opex Costs Screen.OnVisible` (`:9-14`) — `locSelectedAccount`.
 *
 * `colOpexAccounts = Sort('Opex Accounts', Order, Ascending)` (`OnStart.txt:622-629`); O&M takes
 * `First(colOpexAccounts)` and Other OPEX takes `Last(colOpexAccounts)`. That is POSITIONAL, not
 * a name match.
 *
 * CANVAS DIVERGENCE FROM THE SKELETON — `opex-costs/rules.ts:72-81` prefers a name match and
 * only falls back to First/Last, calling the positional rule "source ambiguity 1". It is not
 * ambiguous: measured on VSBCloud_Dev 16 Sep, `vsb_opexaccount` holds exactly two rows,
 * `Operation & Maintenance` Order 1 and `Other OPEX Costs` Order 2. The canvas behaviour is
 * reproduced here because a name match would silently disagree with the live app if a third
 * account were ever added. `selectedAccountByName` keeps the skeleton's behaviour available.
 */
export function selectedAccount(
  accounts: readonly OpexAccount[],
  mode: OpexMode,
): OpexAccount | null {
  if (accounts.length === 0) return null;
  const sorted = [...accounts].sort((a, b) => a.order - b.order);
  return (mode === "om" ? sorted[0] : sorted[sorted.length - 1]) ?? null;
}

/** The skeleton's name-preferring variant, kept reachable so the choice stays reviewable. */
export function selectedAccountByName(
  accounts: readonly OpexAccount[],
  mode: OpexMode,
): OpexAccount | null {
  const sorted = [...accounts].sort((a, b) => a.order - b.order);
  return sorted.find((a) => a.name === MODE_DISPLAY_NAME[mode]) ?? selectedAccount(accounts, mode);
}

/**
 * `locSelectedSubaccount` — `LookUp(colOpexSubaccounts, Account.'Opex Account' = locSelectedAccount…)`
 * (`OnVisible`, `:49-59`). `LookUp` returns the FIRST match in `colOpexSubaccounts`, which
 * `OnStart.txt:633-638` sorted by `Order` ascending — so this is the lowest-Order sub-account of
 * the selected account. For O&M that is the single `Operation & Maintenance` sub-account; for
 * Other OPEX it is `Technical Commercial Management Agreement (TCMA)`, Order 1.
 */
export function defaultSubaccount(
  subaccounts: readonly OpexSubaccount[],
  account: OpexAccount | null,
): OpexSubaccount | null {
  if (!account) return null;
  return [...subaccounts]
    .sort((a, b) => a.order - b.order)
    .find((s) => s.accountId === account.id) ?? null;
}

/** `locSelectedSubaccountOandM` (`OnVisible`, `:60-64`). */
export function isOandMSubaccount(subaccount: { name: string } | null | undefined): boolean {
  return subaccount?.name === OPEX_MODE_NAMES.om;
}

/**
 * Whether the `Threshold` column and the panel's Threshold block render.
 *
 * The COLUMN is gated on `locSelectedSubaccountOandM` (`lbl_…_CostsTableHeader_Threshold.Visible`,
 * `:1242`; `…_Threshold_1.Visible`, `:3636`; and the matching row cells at `:1717` and `:4297`),
 * which is true exactly when the selected account's first sub-account is named
 * "Operation & Maintenance" — i.e. in O&M mode. The PANEL block is gated directly on
 * `gblLeftNavigationSelected.ItemDisplayName = "Operation & Maintenance"`
 * (`con_…_Threshold_Container.Visible`, `:8100`). Both reduce to the mode.
 */
export function showThresholdColumn(mode: OpexMode): boolean {
  return mode === "om";
}

/**
 * `gal_OpexCosts_Content_Subaccounts.Items` (`:328`) — Other OPEX only, and only the
 * sub-accounts whose `Account.Name` is "Other OPEX Costs". The gallery adds no `Sort`, so the
 * order is `colOpexSubaccounts`' own — `Sort('Opex Subaccounts', Order, Ascending)`
 * (`OnStart.txt:633-638`). Order comes from master data, never alphabetically.
 */
export function subaccountsForMode(
  subaccounts: readonly OpexSubaccount[],
  mode: OpexMode,
): OpexSubaccount[] {
  const sorted = [...subaccounts].sort((a, b) => a.order - b.order);
  if (mode === "om") return sorted;
  return sorted.filter((s) => s.accountName === OPEX_MODE_NAMES.other);
}

/* ═════════════════════════════════════════════════════════════ device types ══ */

export interface DeviceTypeInProject {
  /** `DeviceTypesInProject` — the `vsb_devicetypesinproject` id. */
  id: string;
  /** `Name` on the device row; `Left(Name, 3) = "WTG"` is the generator test (`:2928-2933`). */
  name: string;
  /** `TypeInProject`, the polymorphic lookup the card header resolves through. */
  typeInProjectId: string | null;
  kind: "generator" | "pv";
  /** The GENERATOR's `Created On` — the only sort key for the WTG block (`:89-90`). */
  createdOn: string | null;
  /** `AddColumns(…, IsFolded, true)` — every card starts collapsed (`:92-94`). */
  isFolded: boolean;
  /**
   * What the card header renders: the PV module's `Label`, or the generator's
   * `Generator.'Turbine Type'` (`lbl_…_SubaccountName_1.Text`, `:4800-4840`).
   */
  displayName: string;
}

/**
 * `Opex Costs Screen.OnVisible` (`:68-109`) — `colDeviceTypesInProject`.
 *
 * WTG types first, sorted by the matching `GeneratorTypeInProjects` row's `Created On`
 * ascending, then the PV module types appended in their natural order. Both blocks get
 * `IsFolded: true`.
 *
 * Note what the canvas joins on: `LookUp(GeneratorTypeInProjects, Project = … && Name =
 * DeviceItem.Name)` (`:81-87`) matches by NAME, not by the `TypeInProject` id it already has.
 * Reproduced by taking `createdOn` from the caller, which must resolve it the same way.
 */
export function deviceTypeList(
  generators: readonly Omit<DeviceTypeInProject, "kind" | "isFolded">[],
  pvModules: readonly Omit<DeviceTypeInProject, "kind" | "isFolded">[],
): DeviceTypeInProject[] {
  const gen = [...generators]
    .sort((a, b) => (a.createdOn ?? "").localeCompare(b.createdOn ?? ""))
    .map((d) => ({ ...d, kind: "generator" as const, isFolded: true }));
  const pv = pvModules.map((d) => ({ ...d, kind: "pv" as const, isFolded: true }));
  return [...gen, ...pv];
}

/**
 * `locSelectedRecordTypeAddPeriod` (`:2927-2934`) —
 * `If(Left(ThisItem.Name, 3) = "WTG", "Generator", "PVModule")`.
 *
 * It keys off the DEVICE ROW's name, not the resolved type, so a generator device row named
 * anything other than `WTG…` is treated as a PV module and loses its `EUR/WTG` field.
 */
export type OpexRecordType = "Generator" | "PVModule";

export function addPeriodRecordType(deviceName: string | null | undefined): OpexRecordType {
  return (deviceName ?? "").slice(0, 3) === "WTG" ? "Generator" : "PVModule";
}

/**
 * `con_…_BodyContent_EuroPerWtg.Visible` (`:6868-6871`) —
 * `Or(IsBlank(locSelectedRecordTypeAddPeriod), locSelectedRecordTypeAddPeriod = "Generator")`.
 * Blank means "the Other-OPEX bar opened the panel", which resets it to `Blank()` (`:577`).
 */
export function showEurPerWtgField(recordType: OpexRecordType | null | undefined): boolean {
  return recordType === null || recordType === undefined || recordType === "Generator";
}

/* ════════════════════════════════════════════════════════════════ the model ══ */

/**
 * One `Opex Project Costs` row, reduced to what this screen reads.
 *
 * Structural on purpose — see the file header. Column names are the Dataverse logical names
 * confirmed against `src/generated/models/Vsb_opexprojectcostsModel.ts` and the org metadata;
 * `inflationCountryArea` is `vsb_inflationcountryarea`, a STRING (the `Area` text off
 * `Country Inflation Profiles`), not an option set — the skeleton types it as a number.
 */
export interface OpexCost {
  id: string;
  /** `vsb_name`. `StartsWith(Name, "Standard")` is one of the two standard-row locks. */
  name: string;
  /** `vsb_description`. `StartsWith(Lower(Description), "standard")` is the other. */
  description: string;
  /** `_vsb_parentcost_value` — blank on a chain root, i.e. on a "cost type". */
  parentCostId: string | null;
  subaccountId: string | null;
  deviceTypeInProjectId: string | null;
  /** `vsb_startdate`, ISO date. */
  startDate: string | null;
  durationYears: number | null;
  durationMonths: number | null;
  currencyId: string | null;
  currencyName?: string | null;
  fixCosts: number | null;
  percentOfRevenues: number | null;
  eurPerMwh: number | null;
  eurPerMw: number | null;
  eurPerWtg: number | null;
  aggregation: number | null;
  distributionFrequency: number | null;
  threshold: boolean;
  thresholdType: number | null;
  thresholdIndividual: number | null;
  useInflationProfile: boolean;
  useCountryInflationProfile: boolean;
  inflationProfile: number | null;
  inflationStartYear: number | null;
  /** `vsb_inflationcountryarea` — free text, e.g. `"Centre - South"`. */
  inflationCountryArea: string | null;
  alignWithProjectDuration: boolean;
  externalContract: boolean;
  isStandardContract: boolean;
  isStartDateStandardAssumption: boolean;
  /** `Created On` — the start-date default reads it (`:5853`). */
  createdOn?: string | null;
}

export interface OpexProjectContext {
  /** `gblSelectedProject.'Operations start date (COD)'`. */
  codDate: string | null;
  /** `gblSelectedProject.'Project Start Date'` — the duration badge's lower bound. */
  projectStartDate: string | null;
  /** `gblSelectedProject.'End Date'` — what an aligned last period must land on. */
  endDate: string | null;
  /** `gblSelectedProject.Country.Name` — compared against the literal `"Italy"`. */
  countryName: string | null;
  countryId: string | null;
  /** `gblSelectedProject.Technology` — an option-set VALUE, compared numerically. */
  technology: number | null;
  /** `gblSelectedProject.'Area/State/Province'.Name` — Italy's region, for `gblAreaWithRegion`. */
  areaStateProvince?: string | null;
  /** `gblRecordSelectedProjectCountry.'ISO Currency Code'`. */
  isoCurrencyCode?: string | null;
  owningBusinessUnitId?: string | null;
}

/* ════════════════════════════════════════════════════════════════ ordering ══ */

/**
 * Both cost galleries: `Sort(Sort(Filter(…), 'Start Date', Asc), Description, Asc)`
 * (`:1453-1464` sub-accounts, `:3916-3927` devices). The OUTER sort wins, so the list reads by
 * `Description` with `Start Date` as the tie-break.
 */
export function sortCosts(costs: readonly OpexCost[]): OpexCost[] {
  return [...costs].sort(
    (a, b) =>
      a.description.localeCompare(b.description)
      || (a.startDate ?? "").localeCompare(b.startDate ?? ""),
  );
}

export function costsForDevice(costs: readonly OpexCost[], deviceId: string): OpexCost[] {
  return sortCosts(costs.filter((c) => c.deviceTypeInProjectId === deviceId));
}

export function costsForSubaccount(costs: readonly OpexCost[], subaccountId: string): OpexCost[] {
  return sortCosts(costs.filter((c) => c.subaccountId === subaccountId));
}

/** `locSelectedProjectCosts` — the card's own rows, which the duplicate guard is scoped to. */
export function costsInScope(
  costs: readonly OpexCost[],
  mode: OpexMode,
  scopeId: string | null,
): OpexCost[] {
  if (!scopeId) return [];
  return mode === "om" ? costsForDevice(costs, scopeId) : costsForSubaccount(costs, scopeId);
}

/* ═══════════════════════════════════════════════════════════════ the chain ══ */

export interface OpexChain {
  root: OpexCost;
  /** Root FIRST, then its children sorted by `Name` ascending — the canvas' own order. */
  periods: OpexCost[];
}

/**
 * A "cost type" is a row with a blank `'Parent Cost'`; every later period points at it.
 *
 * The canvas never flattens deeper than one level: the standard loader writes
 * `'Parent Cost': recProjectCost` — the PERIOD-1 row — on every later period (`:850`, `:3238`),
 * and `Add Period` sets `locSelectedOpexCostParent` to
 * `Coalesce(LookUp(costs, id = selected.'Parent Cost'), selected)` (`:609-615`, `:2994-3000`),
 * i.e. the selected row's parent if it has one, else the selected row itself. So a chain is
 * always exactly two levels: one root and N siblings.
 */
export function groupChains(costs: readonly OpexCost[]): OpexChain[] {
  const roots = costs.filter((c) => c.parentCostId === null);
  return roots.map((root) => ({
    root,
    periods: [
      root,
      ...costs
        .filter((c) => c.parentCostId === root.id)
        .sort((a, b) => a.name.localeCompare(b.name)),
    ],
  }));
}

/**
 * `locLastPeriod` as the command bars compute it —
 * `Last(Sort(Filter(costs, 'Parent Cost' = firstPeriod …), Name, Ascending))` (`:557-566`,
 * `:2806-2821`, `:2905-2914`).
 *
 * SOURCE DEFECT: O-5. `Name` is text, so ten or more periods sort
 * `… - 10` before `… - 2` and the wrong row is treated as the chain's last. Reproduced, not
 * corrected: `Add Period` and `Delete` would enable on a different row in the live app.
 */
export function lastPeriod(chain: OpexChain): OpexCost {
  return chain.periods[chain.periods.length - 1] ?? chain.root;
}

/**
 * `colLastPeriods` as the sub-account DURATION BADGE computes it —
 * `Last(Sort(costTypePeriods, 'Start Date', Ascending))` (`:2416-2422`, `:2569-2575`).
 *
 * A different sort key from `lastPeriod` above, on the same chain, in the same screen. Both are
 * transcribed because the two answers genuinely differ once the numbering and the dates
 * disagree — for example after a start date is edited by hand.
 */
export function lastPeriodByStartDate(chain: OpexChain): OpexCost {
  return [...chain.periods].sort(
    (a, b) => (a.startDate ?? "").localeCompare(b.startDate ?? ""),
  )[chain.periods.length - 1] ?? chain.root;
}

export function chainOf(chains: readonly OpexChain[], costId: string): OpexChain | null {
  return chains.find((c) => c.periods.some((p) => p.id === costId)) ?? null;
}

/** `Coalesce(parentOf(selected), selected)` — the row the panel treats as the chain head. */
export function chainHead(costs: readonly OpexCost[], selected: OpexCost): OpexCost {
  if (selected.parentCostId === null) return selected;
  return costs.find((c) => c.id === selected.parentCostId) ?? selected;
}

/**
 * `dte_…_StartDate.SelectedDate`, branch 2 (`:5839-5843`) —
 * `DateAdd(next.'Start Date', next.years * 12 + next.months, TimeUnit.Months)`.
 * A brand-new cost type starts at `locCODDate`, which `Add Period` seeds from
 * `gblSelectedProject.'Operations start date (COD)'` (`:627`, `:3015`).
 */
export function nextStartDate(
  previous: Pick<OpexCost, "startDate" | "durationYears" | "durationMonths"> | null | undefined,
  codDate: string | Date | null,
): Date | null {
  const prevStart = toDate(previous?.startDate);
  if (!previous || !prevStart) return toDate(codDate);
  return addMonths(prevStart, orZero(previous.durationYears) * 12 + orZero(previous.durationMonths));
}

/** `DateAdd(DateAdd(start, years*12 + months, Months), -1, Days)` (`:1921-1932`, `:4059-4070`). */
export function periodEndDate(
  period: Pick<OpexCost, "startDate" | "durationYears" | "durationMonths">,
): Date | null {
  const start = toDate(period.startDate);
  if (!start) return null;
  const end = addMonths(start, orZero(period.durationYears) * 12 + orZero(period.durationMonths));
  end.setDate(end.getDate() - 1);
  return end;
}

/**
 * `dte_OpexCosts_RightPanel_NewEditCost_BodyContent_StartDate.SelectedDate` (`:5834-5869`),
 * in full. Five branches, in order:
 *
 *   1. editing a row, or `locResetStartDate`           → `locCODDate`
 *   2. adding a period to a chain                      → previous period's end
 *   3. a device card is selected (O&M, new cost type)  → the device's LAST-CREATED row's end,
 *                                                        or `locCODDate` when it has none
 *   4. otherwise                                       → `locCODDate`
 *
 * SOURCE DEFECT: O-6. Branch 3 reads
 * `varLastRelatedPeriod.'Opex Project duration years' * 12 +
 *  locSelectedOpexCostParent.'Opex Project duration months'` (`:5862-5864`) — the MONTHS term
 * comes off `locSelectedOpexCostParent`, a different record, which is `Blank()` in the branch's
 * own precondition. So the months are silently dropped. Reproduced exactly; `defectiveMonths`
 * is returned so a caller can show what a corrected answer would have been.
 *
 * Branch 3 also sorts by `'Created On'` ascending and takes `Last`, i.e. the most recently
 * created row on the card, not the latest-starting one.
 */
export function startDateDefault(args: {
  /** `locSelectedOpexCost` — the row being edited, if any. */
  selected: OpexCost | null;
  /** `locSelectedOpexCostParent` — the chain root when adding a period. */
  parent: OpexCost | null;
  /** `locSelectedOpexCostNext` — the period the new one follows. */
  next: OpexCost | null;
  /** `locSelectedDeviceTypeInProject`. */
  deviceId: string | null;
  /** The rows on the device card, for branch 3. */
  deviceCosts: readonly OpexCost[];
  /** `locCODDate`. */
  codDate: string | Date | null;
  /** `locResetStartDate`. */
  resetStartDate: boolean;
}): { date: Date | null; defectiveMonths: number } {
  const { selected, parent, next, deviceId, deviceCosts, codDate, resetStartDate } = args;
  const cod = toDate(codDate);

  if (selected !== null || resetStartDate) return { date: cod, defectiveMonths: 0 };

  if (parent !== null) {
    return { date: nextStartDate(next, codDate), defectiveMonths: 0 };
  }

  if (deviceId !== null) {
    const byCreated = [...deviceCosts].sort(
      (a, b) => (a.createdOn ?? "").localeCompare(b.createdOn ?? ""),
    );
    const last = byCreated[byCreated.length - 1];
    if (!last) return { date: cod, defectiveMonths: 0 };
    const start = toDate(last.startDate);
    if (!start) return { date: null, defectiveMonths: 0 };
    // SOURCE DEFECT O-6 — months deliberately omitted, see the doc comment.
    return {
      date: addMonths(start, orZero(last.durationYears) * 12),
      defectiveMonths: orZero(last.durationMonths),
    };
  }

  return { date: cod, defectiveMonths: 0 };
}

/* ══════════════════════════════════════════════════════ period description ══ */

const TRAILING_NUMBER = / - (\d+)$/;

/**
 * `locCandidateOpexCostDesc` as the O&M row button computes it (`:4620-4641`).
 *
 * `If(IsMatch(desc, " - \d+", EndsWith),
 *     Left(desc, Find(" - ", desc) - 1) & " - " & Value(Mid(Match(desc, " - \d+").FullMatch, 4)) + 1,
 *     desc & " - 2")`
 *
 * Note `Find(" - ", desc)` finds the FIRST `" - "` in the description, while `Match` finds the
 * first `" - <digits>"`. On `"Service - 2"` both point at the same place and the answer is
 * `"Service - 3"`. On `"A - B - 2"` they do not: the stem becomes `"A"` and the answer is
 * `"A - 3"`, silently losing `" - B"`. SOURCE DEFECT: O-7, and the panel's own version of the
 * same expression (`nextPeriodDescriptionPanel`) does NOT have it.
 */
export function nextPeriodDescription(description: string): string {
  const match = TRAILING_NUMBER.exec(description);
  if (!match) return `${description} - 2`;
  const firstDash = description.indexOf(" - ");
  const stem = firstDash === -1 ? description : description.slice(0, firstDash);
  return `${stem} - ${Number(match[1]) + 1}`;
}

/**
 * `txt_…_BodyContent_Description.Value`, the add-a-period branch (`:5630-5663`).
 *
 * `Left(next.Description, Find(" - " & Trim(Last(Split(next.Description,"-")).Value), next.Description))
 *  & "- " & Value(Last(Split(next.Description,"-")).Value) + 1`
 *
 * `Find` is given the FULL `" - <n>"` suffix here, so the whole stem survives — `"A - B - 2"`
 * becomes `"A - B - 3"`. `Left(…, Find(…))` is one character LONGER than the stem, which is what
 * supplies the space before the `"- "` literal. Both quirks are reproduced.
 *
 * The increment only fires when the previous period's description ends in `" - <n>"` AND differs
 * from the chain root's; otherwise the canvas appends `" - 2"`.
 */
export function nextPeriodDescriptionPanel(
  next: Pick<OpexCost, "description"> | null,
  parent: Pick<OpexCost, "description"> | null,
): string {
  const description = next?.description ?? "";
  const numbered = TRAILING_NUMBER.test(description);
  if (!numbered || parent === null || parent.description === description) {
    return `${description} - 2`;
  }
  const tail = description.split("-").pop() ?? "";
  const suffix = ` - ${tail.trim()}`;
  const at = description.indexOf(suffix);
  // Power Fx `Find` is 1-based and `Left(s, n)` takes n characters, so `Left(s, Find(...))`
  // keeps the space that precedes the suffix.
  const stem = at === -1 ? description : description.slice(0, at + 1);
  return `${stem}- ${Number(tail.trim()) + 1}`;
}

/**
 * `Add Period`'s duplicate guard (`:456-466`) —
 * `Not(CountRows(Filter(colOpexProjectCosts, Description = locCandidateOpexCostDesc &&
 *  DeviceTypeInProject = locSelectedDeviceTypeInProject)) > 0)`.
 *
 * SOURCE DEFECT: O-8. Only the Other-OPEX bar carries this clause, and in Other OPEX mode BOTH
 * sides of the device comparison are blank, so `Blank() = Blank()` is TRUE for every Other-OPEX
 * row in the project. The guard therefore checks the description against every Other-OPEX cost
 * in the project rather than against the card's own rows. Reproduced by taking the whole
 * project's costs and filtering on the device id as the canvas does.
 */
export function descriptionIsFree(
  candidate: string,
  costs: readonly Pick<OpexCost, "description" | "deviceTypeInProjectId">[],
  selectedDeviceId: string | null,
): boolean {
  return !costs.some(
    (c) => c.description === candidate && c.deviceTypeInProjectId === selectedDeviceId,
  );
}

/* ═══════════════════════════════════════════════════════════ standard locks ══ */

/**
 * `Add Period` / `Edit` (`:449-455`, `:520-526`, `:2826`, `:2873-2879`) — a standard row is
 * locked when `'Is Standard Contract?' = Yes` OR `StartsWith(Name, "Standard")`.
 *
 * The `StartsWith(Name, …)` half is case-SENSITIVE and reads `Name`, which the save builds as
 * `<subaccount>-<device>-<description>` — so it only ever fires when the sub-account itself
 * starts with "Standard". The delete rule below uses a different, case-insensitive test on
 * `Description`. Both are transcribed as written.
 */
export function isStandardLocked(cost: Pick<OpexCost, "isStandardContract" | "name">): boolean {
  return cost.isStandardContract || cost.name.startsWith("Standard");
}

/** `Delete`'s own test (`:541-544`, `:2889-2892`) — `StartsWith(Lower(Description), "standard")`. */
export function isStandardByDescription(cost: Pick<OpexCost, "description">): boolean {
  return cost.description.toLowerCase().startsWith("standard");
}

/**
 * Which panel fields a standard-imported row still lets the user change.
 *
 * `Is Standard Contract? = Yes` blocks `Edit` outright (`:520`, `:2873`), so a standard row is
 * read-only end to end — it is never opened in the panel at all. The FIELD-level locks below are
 * about the other read-only state, a CHILD PERIOD, which is reachable.
 */
export interface PanelContext {
  mode: OpexMode;
  /** `locSelectedOpexCost` — null while adding. */
  selected: OpexCost | null;
  /** `locSelectedOpexCostParent` — non-null while adding a period to an existing chain. */
  parent: OpexCost | null;
  /** `locSelectedAccount.'Opex Account' = First(colOpexAccounts).'Opex Account'`. */
  isFirstAccount: boolean;
  /** `locSelectedDevice` — the string appended to the panel header. */
  deviceLabel: string;
  recordType: OpexRecordType | null;
  countryName: string | null;
}

export type FieldMode = "edit" | "disabled" | "view";

export interface PanelFieldModes {
  description: FieldMode;
  startDate: FieldMode;
  durationYears: FieldMode;
  durationMonths: FieldMode;
  currency: FieldMode;
  fixCosts: FieldMode;
  percentOfRevenues: FieldMode;
  eurPerMwh: FieldMode;
  eurPerMw: FieldMode;
  eurPerWtg: FieldMode;
  aggregation: FieldMode;
  distributionFrequency: FieldMode;
  countryInflationProfile: FieldMode;
  inflationProfileToggle: FieldMode;
  inflationStartYear: FieldMode;
  inflationProfile: FieldMode;
  inflationCountryArea: FieldMode;
  threshold: FieldMode;
  thresholdType: FieldMode;
  thresholdIndividual: FieldMode;
  alignWithProjectDuration: FieldMode;
  externalContract: FieldMode;
}

/**
 * Every `DisplayMode` the Add/Edit panel declares, transcribed control by control.
 *
 * The recurring predicate is `IsBlank(locSelectedOpexCostParent) &&
 * IsBlank(locSelectedOpexCost.'Parent Cost')` — "this is a chain ROOT" — which gates the
 * inflation block, the threshold block, Align with Project Duration and External Contract
 * (`:7332-7336`, `:7364-7368`, `:7475-7479`, `:8431-8435`, `:8484-8488`, `:8538-8542`). A child
 * period inherits all of them from its root and cannot change any of them, which is exactly why
 * saving the root cascades them (see `cascadeToChildren`).
 *
 * `Currency` is `DisplayMode.Disabled` unconditionally (`:6206`).
 * `Description` is editable only on a brand-new cost type (`:5616-5623`).
 * `Threshold` additionally requires a non-blank `EUR/MWh` (`:8431-8435`).
 * `Inflation Profile [%]` is additionally disabled while `Country Inflation Profile` is on
 * (`:7786-7792`).
 */
export function panelFieldModes(
  ctx: PanelContext,
  form: { eurPerMwh: string; useCountryInflationProfile: boolean },
): PanelFieldModes {
  const isRoot = ctx.parent === null && (ctx.selected?.parentCostId ?? null) === null;
  const rootOnly: FieldMode = isRoot ? "edit" : "view";
  const rootOnlyInput: FieldMode = isRoot ? "edit" : "disabled";
  const brandNew = ctx.selected === null && ctx.parent === null;

  return {
    description: brandNew ? "edit" : "disabled",
    startDate: "edit",
    durationYears: "edit",
    durationMonths: "edit",
    // `drp_…_Currency.DisplayMode: =DisplayMode.Disabled` — always.
    currency: "disabled",
    fixCosts: "edit",
    percentOfRevenues: "edit",
    eurPerMwh: "edit",
    eurPerMw: "edit",
    eurPerWtg: "edit",
    aggregation: "edit",
    distributionFrequency: "edit",
    countryInflationProfile: rootOnly,
    inflationProfileToggle: rootOnly,
    inflationStartYear: rootOnlyInput,
    inflationProfile: form.useCountryInflationProfile ? "disabled" : rootOnlyInput,
    // `drp_…_AreaInflationProfile.DisplayMode` tests only the PARENT (`:7621`).
    inflationCountryArea: ctx.parent === null ? "edit" : "disabled",
    threshold: isRoot && form.eurPerMwh.trim() !== "" ? "edit" : "view",
    // `rdg_…_Threshold.DisplayMode: =togl_…_Threshold.DisplayMode` (`:8301`).
    thresholdType: isRoot && form.eurPerMwh.trim() !== "" ? "edit" : "view",
    thresholdIndividual: "edit",
    alignWithProjectDuration: rootOnly,
    externalContract: rootOnly,
  };
}

/**
 * Which red asterisks the panel shows. They are conditional, not fixed.
 *
 * `Description*`          `IsBlank(locSelectedOpexCost)` (`:5755`)
 * `Individual Threshold*` `IsBlank(locSelectedOpexCost)` (`:8283`)
 * `Country Inflation*`    `IsBlank(locSelectedOpexCostParent)` (`:7312`)
 * `Inflation Start Year*` `IsBlank(locSelectedOpexCostParent)` (`:7556`)
 * `Area*`                 `IsBlank(locSelectedOpexCostParent)` (`:7694`)
 * `Inflation Profile*`    `Or(IsBlank(parent), Not(countryToggle))` (`:7995`)
 * `Inflation toggle*`     `Visible: =false` — declared and permanently hidden (`:7409`)
 * everything else         always
 */
export function panelRequiredMarkers(
  ctx: PanelContext,
  form: { useCountryInflationProfile: boolean },
): Record<string, boolean> {
  return {
    description: ctx.selected === null,
    startDate: true,
    duration: true,
    currency: true,
    aggregation: true,
    distributionFrequency: true,
    countryInflationProfile: ctx.parent === null,
    inflationProfileToggle: false,
    inflationStartYear: ctx.parent === null,
    inflationCountryArea: ctx.parent === null,
    inflationProfile: ctx.parent === null || !form.useCountryInflationProfile,
    threshold: true,
    thresholdIndividual: ctx.selected === null,
  };
}

/* ══════════════════════════════════════════════════════════ the command bars ══ */

export type OpexCommandKey =
  | "newOpexProjectCostType"
  | "newOpexProjectCost"
  | "addStandardContract"
  | "editOpexProjectCost"
  | "deleteOpexProjectCost";

/**
 * `ItemDisplayName` on both command bars, verbatim
 * (`pcf_con_OpexCosts_Content_Subaccounts_CardBody_SubaccountsCommandBar.Items`, `:414`/`:440`/
 * `:471`/`:511`/`:531`; `pcf_con_OpexCosts_Content_GeneratorsInProject_CardBody_CommandBar.Items`,
 * `:2773`/`:2833`/`:2869`/`:2884`).
 *
 * The two bars use DIFFERENT keys for the same "Add Standard Contract" command —
 * `newAddStandardContractKey` on the sub-account bar, `addStandardContract` on the device bar.
 * One key is used here; `CANVAS_COMMAND_KEYS` records both spellings.
 */
export const OPEX_COMMAND_LABELS: Record<OpexCommandKey, string> = {
  newOpexProjectCostType: "Add Contract Type",
  newOpexProjectCost: "Add Period",
  addStandardContract: "Add Standard Contract",
  editOpexProjectCost: "Edit",
  deleteOpexProjectCost: "Delete",
};

export const CANVAS_COMMAND_KEYS = {
  om: ["newOpexProjectCost", "addStandardContract", "editOpexProjectCost", "deleteOpexProjectCost"],
  other: [
    "newOpexProjectCostType", "newOpexProjectCost", "newAddStandardContractKey",
    "editOpexProjectCost", "deleteOpexProjectCost",
  ],
} as const;

export const OPEX_COMMAND_ICONS: Record<OpexCommandKey, "Add" | "Edit" | "Delete"> = {
  newOpexProjectCostType: "Add",
  newOpexProjectCost: "Add",
  addStandardContract: "Add",
  editOpexProjectCost: "Edit",
  deleteOpexProjectCost: "Delete",
};

export interface OpexPermissions {
  /** `DataSourceInfo('Opex Project Costs', DataSourceInfo.CreatePermission)`. */
  canCreate: boolean;
  /** `RecordInfo(locSelectedOpexCost, RecordInfo.EditPermission)`. */
  canEditRecord: boolean;
  /** `RecordInfo(locSelectedOpexCost, RecordInfo.DeletePermission)`. */
  canDeleteRecord: boolean;
}

export interface CommandArgs {
  mode: OpexMode;
  /** The card the bar is drawn in: a device id in O&M, a sub-account id in Other OPEX. */
  cardScopeId: string;
  /** `locSelectedDeviceTypeInProject` / `locSelectedSubaccount` — the SELECTED card. */
  selectedScopeId: string | null;
  /** `locSelectedOpexCost`. */
  selected: OpexCost | null;
  /** Every `Opex Project Costs` row of the project — the canvas' `colOpexProjectCosts`. */
  allCosts: readonly OpexCost[];
  /** The rows on THIS card. */
  cardCosts: readonly OpexCost[];
  /** `locCandidateOpexCostDesc`, recomputed when a row is selected. */
  candidateDescription: string;
  /**
   * Whether a matching `OPEX & Land Lease Standard Assumptions` row exists for this card:
   * country + technology + type-of-contract, plus the sub-account in Other OPEX mode.
   */
  hasStandardAssumption: boolean;
  permissions: OpexPermissions;
}

/** Every command is scoped to the card it is drawn in. */
export function commandsInScope(
  selectedScopeId: string | null,
  cardScopeId: string,
): boolean {
  return selectedScopeId === cardScopeId;
}

/**
 * `Add Contract Type` — Other OPEX only (`:411-437`).
 *
 * `And(CreatePermission,
 *      If(locSelectedSubaccount = ThisItem, IsBlank(locSelectedOpexCost), true),
 *      IsBlank(LookUp('Opex Project Costs', project && 'Is Standard Contract?' = Yes &&
 *                     Subaccount = ThisItem)))`
 *
 * So: on the card that currently owns the selection it needs the selection CLEARED; on every
 * other card it is free; and it is blocked outright once a standard contract exists there.
 */
export function canAddContractType(args: CommandArgs): boolean {
  const { mode, cardScopeId, selectedScopeId, selected, cardCosts, permissions } = args;
  if (mode !== "other") return false;
  if (!permissions.canCreate) return false;
  if (selectedScopeId === cardScopeId && selected !== null) return false;
  return !cardCosts.some((c) => c.isStandardContract);
}

/**
 * `Add Period`.
 *
 * OTHER OPEX (`:438-468`): `Not(IsBlank(selected))`, the card owns the selection, Create
 * permission, the selection is not a standard contract, its `Name` does not start with
 * "Standard", and `descriptionIsFree`.
 *
 * O&M (`:2770-2830`) — a materially different expression:
 * `And(CreatePermission,
 *      Or(And(IsBlank(selected), CountIf(costs, device = ThisItem) = 0),
 *         And(Not(IsBlank(selected)), ThisItem = locSelectedDeviceTypeInProject,
 *             <selected is the chain's last period>, Not(standard contract))))`
 *
 * Two clauses the skeleton's single `canAddPeriod` does not have:
 *
 *  · O&M's FIRST disjunct is how a cost type gets created at all in that mode. There is no
 *    "Add Contract Type" on the device bar — the device type IS the contract type — so
 *    `Add Period` doubles as it, and is enabled on an EMPTY card with nothing selected.
 *  · O&M requires the selection to be the chain's LAST period; Other OPEX does NOT. The
 *    sub-account bar has no last-period clause at all, so Other OPEX lets a period be added
 *    after any selected row in the chain.
 *
 * CANVAS DIVERGENCE FROM THE SKELETON — `opex-costs/rules.ts:263-271` applies the last-period
 * rule and the `StartsWith(Name, "Standard")` lock to both modes. Neither is what the canvas
 * does. The canvas is followed.
 */
export function canAddPeriod(args: CommandArgs): boolean {
  const {
    mode, cardScopeId, selectedScopeId, selected, allCosts, cardCosts,
    candidateDescription, permissions,
  } = args;
  if (!permissions.canCreate) return false;

  if (mode === "om") {
    if (selected === null) return cardCosts.length === 0;
    if (selectedScopeId !== cardScopeId) return false;
    if (selected.isStandardContract) return false;
    const chain = chainOf(groupChains(cardCosts), selected.id);
    return chain !== null && lastPeriod(chain).id === selected.id;
  }

  if (selected === null) return false;
  if (selectedScopeId !== cardScopeId) return false;
  if (isStandardLocked(selected)) return false;
  return descriptionIsFree(
    candidateDescription,
    allCosts,
    // In Other OPEX mode `locSelectedDeviceTypeInProject` is always blank — see O-8.
    null,
  );
}

/**
 * `Add Standard Contract`.
 *
 * O&M (`:2831-2866`): an assumption exists for country + technology + `'Opex O&M'`, no standard
 * contract exists for the device, and NO cost of any kind exists for the device.
 *
 * OTHER OPEX (`:469-508`): the same three, with the assumption filter additionally matched on
 * the card's sub-account and the two cost checks scoped to the sub-account.
 *
 * Note the third clause is the second with its `'Is Standard Contract?'` term commented out in
 * the source (`:502`) — so "no standard contract in scope" is subsumed by "no cost in scope".
 * Both are kept so the shape stays diff-able.
 *
 * It carries NO `CreatePermission` check in EITHER mode. The skeleton adds one
 * (`opex-costs/rules.ts:306-311`); it is kept here as an argument the caller may pass `true`
 * for to reproduce the canvas exactly.
 */
export function canAddStandardContract(
  args: Pick<CommandArgs, "cardCosts" | "hasStandardAssumption">,
  requireCreatePermission = false,
  canCreate = true,
): boolean {
  if (requireCreatePermission && !canCreate) return false;
  if (!args.hasStandardAssumption) return false;
  if (args.cardCosts.some((c) => c.isStandardContract)) return false;
  return args.cardCosts.length === 0;
}

/**
 * `Edit`.
 *
 * OTHER OPEX (`:509-528`): `Not(IsBlank(selected))`, the card owns the selection,
 * `RecordInfo(selected, EditPermission)`, not a standard contract, `Name` does not start with
 * "Standard".
 *
 * O&M (`:2867-2881`): `locSelectedDeviceTypeInProject.TypeInProject = ThisItem.TypeInProject`,
 * not a standard contract, `Name` does not start with "Standard".
 *
 * SOURCE DEFECT: O-1. The O&M bar has NEITHER `Not(IsBlank(locSelectedOpexCost))` NOR the
 * `RecordInfo` check. Two consequences:
 *
 *  · With a card selected but no ROW selected, `Not(Blank() = Yes)` is `true` and
 *    `StartsWith(Blank(), "Standard")` is `false`, so `Edit` renders ENABLED with nothing to
 *    edit. `locSelectedDeviceTypeInProject` is only set by selecting a row (`:4618`) or by
 *    pressing a command (`:3007`, `:3400`), so it is reachable straight after a save or a
 *    cancel, both of which blank the selection but not always the device.
 *  · A user with read-only access to the row sees `Edit` enabled and is refused by the server.
 *
 * Reproduced. `canEditCostCanvasParity` is the bug-for-bug twin; `canEditCost` normalises O&M to
 * the Other-OPEX shape, which is what the screen should call.
 */
export function canEditCost(args: CommandArgs): boolean {
  const { cardScopeId, selectedScopeId, selected, permissions } = args;
  if (selected === null) return false;
  if (selectedScopeId !== cardScopeId) return false;
  if (!permissions.canEditRecord) return false;
  return !isStandardLocked(selected);
}

/** SOURCE DEFECT O-1, reproduced: O&M drops the blank check and the record privilege. */
export function canEditCostCanvasParity(args: CommandArgs): boolean {
  const { mode, cardScopeId, selectedScopeId, selected } = args;
  if (mode === "other") return canEditCost(args);
  if (selectedScopeId !== cardScopeId) return false;
  if (selected === null) return true;
  return !isStandardLocked(selected);
}

/**
 * `Delete`.
 *
 * OTHER OPEX (`:529-574`): `Not(IsBlank(selected))`, the card owns the selection,
 * `RecordInfo(selected, DeletePermission)`, then
 *
 * `If(StartsWith(Lower(Description), "standard"),
 *     IsBlank('Parent Cost'),
 *     Or(IsBlank('Parent Cost'), <selected is the chain's last period>))`
 *
 * O&M (`:2882-2922`): the same trailing `If`, but with NEITHER the blank check NOR
 * `RecordInfo` — the same O-1 asymmetry as `Edit`.
 *
 * CANVAS DIVERGENCE FROM THE SKELETON — `opex-costs/rules.ts:291-299` returns `true` for ANY
 * non-standard row with a parent. The canvas allows a non-root period to be deleted only when
 * it is the chain's LAST. Deleting from the middle would leave a gap in the date chain, which
 * is presumably the point. The canvas is followed.
 */
export function canDeleteCost(args: CommandArgs): boolean {
  const { cardScopeId, selectedScopeId, selected, cardCosts, permissions } = args;
  if (selected === null) return false;
  if (selectedScopeId !== cardScopeId) return false;
  if (!permissions.canDeleteRecord) return false;
  return deleteAllowedForRow(selected, cardCosts);
}

/** SOURCE DEFECT O-1, reproduced: O&M drops the blank check and the record privilege. */
export function canDeleteCostCanvasParity(args: CommandArgs): boolean {
  const { mode, cardScopeId, selectedScopeId, selected, cardCosts } = args;
  if (mode === "other") return canDeleteCost(args);
  if (selectedScopeId !== cardScopeId) return false;
  if (selected === null) return true;
  return deleteAllowedForRow(selected, cardCosts);
}

function deleteAllowedForRow(selected: OpexCost, cardCosts: readonly OpexCost[]): boolean {
  const isRoot = selected.parentCostId === null;
  if (isStandardByDescription(selected)) return isRoot;
  if (isRoot) return true;
  // `locLastPeriod` here filters CHILDREN only — `'Parent Cost' = locFirstPeriod` — so the root
  // is deliberately excluded from the comparison (`:559-562`, `:2907-2910`).
  const siblings = cardCosts
    .filter((c) => c.parentCostId === selected.parentCostId)
    .sort((a, b) => a.name.localeCompare(b.name));
  return siblings[siblings.length - 1]?.id === selected.id;
}

export interface OpexCommandGates {
  newOpexProjectCostType: boolean;
  newOpexProjectCost: boolean;
  addStandardContract: boolean;
  editOpexProjectCost: boolean;
  deleteOpexProjectCost: boolean;
}

/** One card's toolbar. `Add Contract Type` is omitted entirely in O&M mode. */
export function opexCommands(args: CommandArgs): OpexCommandGates {
  return {
    newOpexProjectCostType: canAddContractType(args),
    newOpexProjectCost: canAddPeriod(args),
    addStandardContract: canAddStandardContract(args),
    editOpexProjectCost: canEditCost(args),
    deleteOpexProjectCost: canDeleteCost(args),
  };
}

/** Which of the five the bar renders at all, in the canvas' order. */
export function visibleCommands(mode: OpexMode): OpexCommandKey[] {
  return mode === "om"
    ? ["newOpexProjectCost", "addStandardContract", "editOpexProjectCost", "deleteOpexProjectCost"]
    : [
      "newOpexProjectCostType", "newOpexProjectCost", "addStandardContract",
      "editOpexProjectCost", "deleteOpexProjectCost",
    ];
}

/* ════════════════════════════════════════════════════════════ the inflation ══ */

/**
 * `gblAreaWithRegion`, set in `OnStart.txt:902-961` — Italy's twenty regions mapped to the five
 * price zones `Country Inflation Profiles` is keyed on. Set for Italy ONLY; blank elsewhere.
 *
 * Transcribed verbatim, including `Valle d’Aosta`'s U+2019 right single quotation mark — the key
 * has to match `gblSelectedProject.'Area/State/Province'.Name` exactly or the `Switch` falls
 * through to `Blank()`.
 */
export const ITALY_AREA_BY_REGION: Record<string, string> = {
  Lazio: "Italy_Centre - South",
  Lombardia: "Italy_North",
  "Emilia Romagna": "Italy_North",
  Sicilia: "Italy_Sicily",
  "Valle d’Aosta": "Italy_North",
  Veneto: "Italy_North",
  "Friuli Venezia Giulia": "Italy_North",
  Puglia: "Italy_South",
  Marche: "Italy_Centre - North",
  Molise: "Italy_South",
  Calabria: "Italy_Calabria",
  Abruzzo: "Italy_Centre - South",
  Piemonte: "Italy_North",
  Sardegna: "Italy_Sardinia",
  Toscana: "Italy_Centre - North",
  "Trentino Alto Adige": "Italy_North",
  Campania: "Italy_Centre - South",
  Liguria: "Italy_North",
  Basilicata: "Italy_South",
  Umbria: "Italy_Centre - South",
};

/** `Set(gblAreaWithRegion, …)` — `Trim(Coalesce(area.Name, ""))` then the `Switch`. */
export function areaWithRegion(
  countryName: string | null | undefined,
  areaStateProvince: string | null | undefined,
): string | null {
  if (countryName !== "Italy") return null;
  const region = (areaStateProvince ?? "").trim();
  return ITALY_AREA_BY_REGION[region] ?? null;
}

/** `Substitute(gblAreaWithRegion, "Italy_", "")` — the zone without its country prefix. */
export function italyZone(areaWithRegionValue: string | null | undefined): string {
  return (areaWithRegionValue ?? "").split("Italy_").join("");
}

/**
 * What the `Inflation Profile` column shows (`lbl_…_CostsTableRow_InflationProfile.Text`,
 * `:1829-1847`, and its O&M twin at `:4116-4134`):
 *
 * `If(And(useCountryInflation = Yes, useInflation = Yes),
 *     If(country.Name = "Italy", "Italy - " & Substitute(gblAreaWithRegion, "Italy_", ""),
 *        country.Name),
 *     Text('Inflation Profile', "###,###,###.0 %"))`
 *
 * SOURCE DEFECT: O-9. The else branch fires whenever the two flags are not BOTH Yes — including
 * when `Use Inflation Profile` is No, where `'Inflation Profile'` is blank and the cell renders
 * an empty string rather than being suppressed. Harmless, but it means "no inflation" and
 * "inflation of zero" are indistinguishable in the table.
 */
export function inflationColumnText(
  cost: Pick<OpexCost, "useInflationProfile" | "useCountryInflationProfile" | "inflationProfile">,
  project: Pick<OpexProjectContext, "countryName" | "areaStateProvince">,
): string {
  if (cost.useCountryInflationProfile && cost.useInflationProfile) {
    if (project.countryName === "Italy") {
      return `Italy - ${italyZone(areaWithRegion(project.countryName, project.areaStateProvince))}`;
    }
    return project.countryName ?? "";
  }
  return formatOneDecimalPercent(cost.inflationProfile);
}

/** Power Fx `Text(n, "###,###,###.0 %")`. Blank in, blank out. */
export function formatOneDecimalPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "";
  return `${numberFormat("en-GB", {
    minimumFractionDigits: 1, maximumFractionDigits: 1,
  }).format(value)} %`;
}

/** `Text(n, "###,###,###,###")` — the five money columns. */
export function formatWholeNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "";
  return numberFormat("en-GB", { maximumFractionDigits: 0 }).format(value);
}

/** `Text(n, "###,###,###,##0.00 %")` — `Share of Revenues` (`:1754`, `:4244`). */
export function formatRevenuePercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "";
  return `${numberFormat("en-GB", {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(value)} %`;
}

/**
 * The `Threshold` cell (`lbl_…_CostsTableRow_Threshold.Text`, `:1702-1716`, `:4282-4296`):
 * `If(Threshold, Switch('Threshold Type', p75, "p75", p90, "p90", Text(individual, "###,###.0")),
 *     Blank())`.
 */
export function thresholdColumnText(
  cost: Pick<OpexCost, "threshold" | "thresholdType" | "thresholdIndividual">,
): string {
  if (!cost.threshold) return "";
  if (cost.thresholdType === THRESHOLD_TYPE.netYieldP75) return "p75";
  if (cost.thresholdType === THRESHOLD_TYPE.netYieldP90) return "p90";
  if (cost.thresholdIndividual === null || cost.thresholdIndividual === undefined) return "";
  return numberFormat("en-GB", {
    minimumFractionDigits: 1, maximumFractionDigits: 1,
  }).format(cost.thresholdIndividual);
}

/** `recCODYear = Year('Operations start date (COD)') + 1` (`:664`, `:3051`). */
export function inflationStartYear(codDate: string | Date | null): number | null {
  const d = toDate(codDate);
  return d === null ? null : d.getFullYear() + 1;
}

/**
 * `txt_…_InflationStartYear.Value` (`:7485-7495`) — the parent's year while adding a period, the
 * row's own year when editing (but only when it is not 0), otherwise `Year(startDate) + 1`.
 *
 * The `<> 0` guard matters: `'Inflation Start Year'` is written `Blank()` when inflation is off
 * (`:8695`), and a blank whole number reads back as 0.
 */
export function inflationStartYearDefault(args: {
  selected: OpexCost | null;
  parent: OpexCost | null;
  startDate: string | Date | null;
}): number | null {
  const { selected, parent, startDate } = args;
  if (parent !== null && selected === null) return parent.inflationStartYear;
  if (selected !== null && selected.inflationStartYear !== 0) return selected.inflationStartYear;
  const d = toDate(startDate);
  return d === null ? null : d.getFullYear() + 1;
}

/**
 * `'Inflation Profile'` on a standard-imported row (`:719-735`, `:861-877`, `:3110-3126`):
 *
 *   inflation Yes AND country Yes → the `Country Inflation Profiles` row for COD year + 1
 *   inflation Yes AND country No  → the assumption's own `Inflation Profile`
 *   anything else                 → `Blank()`
 *
 * Note the third arm is `Blank()`, not "the assumption's value" — inflation off means the
 * imported row carries no profile at all.
 */
export function resolveInflationProfile(
  assumption: Pick<
    OpexAssumption, "useInflationProfile" | "useCountryInflationProfile" | "inflationProfile"
  >,
  countryProfile: number | null,
): number | null {
  if (!assumption.useInflationProfile) return null;
  return assumption.useCountryInflationProfile ? countryProfile : assumption.inflationProfile;
}

/** One `Country Inflation Profiles` row, as the two lookups below read it. */
export interface CountryInflationProfile {
  year: number;
  /** `vsb_area`. Blank on every country but Italy — measured, see `countryInflationPercent`. */
  area: string;
  inflation: number;
}

/**
 * `LookUp('Country Inflation Profiles', Country = <project's> && Year = <year> [&& Area = …])
 * .Inflation` — the percentage the "use the country profile" branches resolve to.
 *
 * The rows are already scoped to the project's COUNTRY by the loader (`loadCountryInflation` in
 * `data/landLease.ts`), so what is left is the YEAR and, **for Italy only, the AREA**:
 *
 *   panel        `:7822-7847` — with the country toggle on, Italy adds
 *                `Area = drp_…_AreaInflationProfile.Selected.Value` to the `LookUp`; every other
 *                country matches on the year alone.
 *   Add Standard `:726-728` — `Country && Year = recCODYear` with NO Area term at all, on every
 *                country including Italy. Pass `area: null` there; passing the zone would be a
 *                divergence, not a fix.
 *
 * MEASURED, VSBCloud_Dev 16 Sep: Italy carries SEVEN rows per year (North · Centre - North ·
 * Centre - South · South · Sicily · Sardinia · Calabria) and every other country exactly one with
 * `vsb_area` blank — so an Area term applied outside Italy would match nothing and an Italian
 * lookup without one picks an arbitrary zone.
 *
 * `null` when nothing matches, which is what both call sites' `Max(…, 0)` turns into `0.0`.
 */
export function countryInflationPercent(
  rows: readonly CountryInflationProfile[],
  args: { year: number | null; countryName: string | null; area?: string | null },
): number | null {
  const { year, countryName } = args;
  if (year === null || !Number.isFinite(year)) return null;
  const area = (args.area ?? "").trim();
  const useArea = countryName === "Italy" && area !== "";
  const match = rows.find(
    (r) => r.year === year && (!useArea || r.area === area),
  );
  return match ? match.inflation : null;
}

/**
 * `txt_…_InflationProfile.Value` (`:7797-7847`) — what the panel shows in the percentage box.
 *
 * Four branches, in order: the parent's profile while adding a period with the country toggle
 * off; the row's own profile with the country toggle off; for Italy with the country toggle on,
 * `Max(LookUp(CIP, country && year && Area = <the Area dropdown>).Inflation, 0)`; otherwise with
 * the country toggle on, the same lookup WITHOUT the area term.
 *
 * `Max(x, 0)` is how the canvas coerces a missing profile to `0.0` rather than blank.
 */
export function inflationProfileDefault(args: {
  selected: OpexCost | null;
  parent: OpexCost | null;
  useCountryInflationProfile: boolean;
  countryName: string | null;
  /** `LookUp('Country Inflation Profiles', country && year [&& area]).Inflation`. */
  countryProfile: number | null;
}): number | null {
  const { selected, parent, useCountryInflationProfile, countryProfile } = args;
  if (!useCountryInflationProfile) {
    if (parent !== null && selected === null) return parent.inflationProfile;
    if (selected !== null) return selected.inflationProfile;
    return null;
  }
  return Math.max(orZero(countryProfile), 0);
}

/**
 * `txt_…_InflationProfileCountry.Value` (`:7869-7927`) — the read-only twin shown INSTEAD of the
 * percentage box while `Country Inflation Profile` is on:
 * `"Italy - " & Substitute(gblAreaWithRegion, "Italy_", "")` for Italy, else the country name.
 */
export function inflationProfileCountryText(
  project: Pick<OpexProjectContext, "countryName" | "areaStateProvince">,
): string {
  if (project.countryName === "Italy") {
    return `Italy - ${italyZone(areaWithRegion(project.countryName, project.areaStateProvince))}`;
  }
  return project.countryName ?? "";
}

/**
 * SOURCE DEFECT: O-2. `con_…_BodyContent_AreaInflationProfile.Visible` is literally `false`
 * (`:7576`); the real condition — inflation on, country inflation on, country is Italy — is
 * commented out directly above it (`:7571-7575`).
 *
 * So the `Area` dropdown never renders, yet the Save gate still requires a non-blank selection
 * for an Italian project with both inflation toggles on (`:8672-8676`). On such a project Save
 * is permanently disabled with no visible field to fix. Reproduced: `areaFieldVisible` returns
 * the canvas answer, `areaFieldVisibleIntended` the commented-out one.
 */
export function areaFieldVisible(): boolean {
  return false;
}

export function areaFieldVisibleIntended(args: {
  inflationOn: boolean;
  useCountryInflationProfile: boolean;
  countryName: string | null;
}): boolean {
  return args.inflationOn && args.useCountryInflationProfile && args.countryName === "Italy";
}

/* ══════════════════════════════════════════════ standard-assumption import ══ */

/**
 * One `OPEX & Land Lease Standard Assumptions` row. Column names verified against
 * `src/generated/models/Vsb_opexlandleasestandardassumptionsesModel.ts`.
 *
 * Note what this table does NOT have: `vsb_inflationstartyear` as a number (only
 * `vsb_inflationstartyearstring`), which is why the import always writes COD year + 1.
 */
export interface OpexAssumption {
  id: string;
  /** `vsb_period`, an option-set value — see `STANDARD_PERIOD`. */
  period: number;
  description: string;
  durationYears: number | null;
  durationMonths: number | null;
  typeOfContract: number | null;
  countryId: string | null;
  /** `vsb_technology`, an option-set value. */
  technology: number | null;
  opexSubaccountId: string | null;
  currencyId: string | null;
  fixCosts: number | null;
  percentOfRevenues: number | null;
  eurPerMwh: number | null;
  eurPerMw: number | null;
  eurPerWtg: number | null;
  aggregation: number | null;
  distributionFrequency: number | null;
  threshold: boolean;
  thresholdType: number | null;
  thresholdIndividual: number | null;
  useInflationProfile: boolean;
  useCountryInflationProfile: boolean;
  inflationProfile: number | null;
  inflationCountryArea: string | null;
  alignWithProjectDuration: boolean;
  externalContract: boolean;
}

export interface StandardAssumptionFilter {
  typeOfContract: number;
  countryId: string | null;
  technology: number | null;
  /** Other OPEX only; O&M does not scope the assumption by sub-account. */
  opexSubaccountId: string | null;
}

/**
 * `recCountryTechnologyRelatedStandardAssumption` (`:650-662` Other OPEX, `:3038-3049` O&M).
 *
 * Both filter on country, technology and type-of-contract; Other OPEX adds
 * `'Opex Subaccount'.'Opex Subaccount' = ThisItem.'Opex Subaccount'`. Both then
 * `Sort(…, Description, Ascending)`.
 *
 * `Technology` is compared as an option-set value against `gblSelectedProject.Technology`, not as
 * text. The skeleton lower-cases two strings (`opex-costs/rules.ts:420-421`); numeric comparison
 * is what the canvas does and what the org stores.
 */
export function standardAssumptionFilter(
  mode: OpexMode,
  scope: { countryId: string | null; technology: number | null; subaccountId: string | null },
): StandardAssumptionFilter {
  return {
    typeOfContract: mode === "om" ? TYPE_OF_CONTRACT.opexOandM : TYPE_OF_CONTRACT.opexOther,
    countryId: scope.countryId,
    technology: scope.technology,
    opexSubaccountId: mode === "om" ? null : scope.subaccountId,
  };
}

export function matchesStandardAssumption(
  assumption: OpexAssumption,
  filter: StandardAssumptionFilter,
): boolean {
  if (assumption.typeOfContract !== filter.typeOfContract) return false;
  if (assumption.countryId !== filter.countryId) return false;
  if (assumption.technology !== filter.technology) return false;
  if (filter.opexSubaccountId !== null && assumption.opexSubaccountId !== filter.opexSubaccountId) {
    return false;
  }
  return true;
}

/** `Sort(…, Description, Ascending)` — the order the import walks the assumptions in. */
export function sortedAssumptions(assumptions: readonly OpexAssumption[]): OpexAssumption[] {
  return [...assumptions].sort((a, b) => a.description.localeCompare(b.description));
}

/**
 * `recStartDate` (`:783-820` Other OPEX, `:3171-3208` O&M) — the chained start dates.
 *
 *   Period 1  → `recCODDate`
 *   Period 2  → period 1's start + its whole duration in months
 *   Period 3+ → the LAST row already collected + its whole duration in months
 *
 * The two modes sort the "already collected" list differently: Other OPEX by `Period`
 * (`:796-798`), O&M by `Description` (`:3184-3186`).
 *
 * SOURCE DEFECT: O-10. O&M's `Sort(…, Description, Ascending)` puts `"Standard X - 10"` before
 * `"Standard X - 2"`, so from ten periods on the chain is computed off the wrong row. The
 * `Period`-sorted Other-OPEX path is correct. `standardPeriodStarts` takes the sort key so both
 * can be asserted; the O&M defect is reproduced when `orderBy` is `"description"`.
 */
export function standardPeriodStarts(
  codDate: string | Date | null,
  assumptions: readonly OpexAssumption[],
  orderBy: "period" | "description" = "period",
): { id: string; period: number; startDate: Date | null }[] {
  const ordered = sortedAssumptions(assumptions);
  const out: { id: string; period: number; startDate: Date | null }[] = [];
  const collected: OpexAssumption[] = [];
  let first: { assumption: OpexAssumption; startDate: Date | null } | null = null;

  for (const a of ordered.filter((x) => x.period === STANDARD_PERIOD.period1)) {
    const startDate = toDate(codDate);
    out.push({ id: a.id, period: a.period, startDate });
    first = { assumption: a, startDate };
  }

  for (const a of ordered.filter((x) => x.period !== STANDARD_PERIOD.period1)) {
    let startDate: Date | null = null;
    if (a.period === STANDARD_PERIOD.period2) {
      startDate = first?.startDate
        ? addMonths(
          first.startDate,
          orZero(first.assumption.durationYears) * 12 + orZero(first.assumption.durationMonths),
        )
        : null;
    } else {
      const sorted = [...collected].sort((x, y) =>
        orderBy === "period"
          ? x.period - y.period
          : x.description.localeCompare(y.description));
      const previous = sorted[sorted.length - 1];
      const previousStart = previous
        ? out.find((o) => o.id === previous.id)?.startDate ?? null
        : null;
      startDate = previous && previousStart
        ? addMonths(
          previousStart,
          orZero(previous.durationYears) * 12 + orZero(previous.durationMonths),
        )
        : null;
    }
    out.push({ id: a.id, period: a.period, startDate });
    collected.push(a);
  }
  return out;
}

/** Every standard-created row is stamped with both flags (`:745-746`, `:887-888`, `:3136-3137`). */
export const STANDARD_STAMP = {
  isStandardContract: true,
  isStartDateStandardAssumption: true,
} as const;

/**
 * `Name` on a standard-imported row.
 *   Other OPEX: `"Other OPEX Costs" & "-" & subaccount.Name & "-" & assumption.Description`
 *               (`:689`, `:831`)
 *   O&M:        `"Operation & Maintenance" & "-" & locSelectedSubaccount.Name & "-" &
 *               assumption.Description` (`:3080`, `:3219`)
 *
 * Both interpolate the account's DISPLAY NAME, not the device — so every O&M standard row on
 * every device type of a project carries the same `Name`.
 */
export function standardCostName(
  mode: OpexMode,
  subaccountName: string,
  description: string,
): string {
  return `${MODE_DISPLAY_NAME[mode]}-${subaccountName}-${description}`;
}

/** What one standard-imported `Opex Project Costs` row carries. */
export interface StandardImportRow {
  subaccountId: string | null;
  deviceTypeInProjectId: string | null;
  name: string;
  description: string;
  startDate: Date | null;
  durationYears: number | null;
  durationMonths: number | null;
  currencyId: string | null;
  fixCosts: number | null;
  percentOfRevenues: number | null;
  threshold: boolean;
  thresholdType: number | null;
  thresholdIndividual: number | null;
  eurPerMwh: number | null;
  eurPerMw: number | null;
  eurPerWtg: number | null;
  aggregation: number | null;
  /** `null` on the period-1 row; the period-1 row's id on every later period. */
  parentKey: string | null;
  useInflationProfile: boolean;
  useCountryInflationProfile: boolean;
  inflationProfile: number | null;
  inflationStartYear: number | null;
  inflationCountryArea: string | null;
  distributionFrequency: number | null;
  owningBusinessUnitId: string | null;
  alignWithProjectDuration: boolean;
  isStartDateStandardAssumption: boolean;
  isStandardContract: boolean;
  externalContract: boolean;
  /** The assumption this row came from — the caller's join key. */
  assumptionId: string;
  period: number;
}

/**
 * `newAddStandardContractKey` / `addStandardContract` — the whole import, as data.
 *
 * WHICH FIELDS SEED AND WHICH DO NOT, read off the two `Patch` blocks
 * (`:685-751` and `:827-893` for Other OPEX, `:3076-3142` and `:3215-3281` for O&M):
 *
 *   SEEDED from the assumption   Description (trimmed), duration years and months, Currency,
 *                                Fix Costs, % of Revenues, Threshold / Threshold Type /
 *                                Threshold individual, EUR/MWh, EUR/MW, EUR/WTG, Aggregation,
 *                                Use Inflation Profile, Use Country Inflation Profile,
 *                                Inflation Country Area, Distribution Frequency,
 *                                Align With Project Duration, External Contract?
 *   DERIVED, not copied          Name (built from the account and sub-account names),
 *                                Start Date (chained from COD — the assumption's own
 *                                `vsb_startdatestring` is ignored),
 *                                Inflation Profile (resolved against the COUNTRY profile when
 *                                both inflation flags are Yes),
 *                                Inflation Start Year (always COD year + 1, never the
 *                                assumption's `vsb_inflationstartyearstring`),
 *                                Parent Cost (blank on period 1, period 1 on the rest),
 *                                Owning Business Unit, Project, DeviceTypeInProject
 *   NEVER seeded                 the Land-Lease-only columns on the same table — `vsb_secured`,
 *                                `vsb_allwtgallocated`, the three one-time payments,
 *                                `vsb_landleasesubaccount`, `vsb_order`, `vsb_islastperiod`
 *
 * `DeviceTypeInProject` is `Blank()` in Other OPEX mode (`:688`, `:830`) and the clicked device
 * in O&M (`:3079`, `:3218`); `Subaccount` is the assumption's own in Other OPEX and
 * `locSelectedSubaccount` — the account's first sub-account — in O&M.
 */
export function planStandardImport(args: {
  mode: OpexMode;
  assumptions: readonly OpexAssumption[];
  /** `locSelectedSubaccount` in O&M; the card's sub-account in Other OPEX. */
  subaccount: OpexSubaccount;
  /** The clicked device, O&M only. */
  deviceTypeInProjectId: string | null;
  project: OpexProjectContext;
  /** `LookUp('Country Inflation Profiles', country && Year = COD year + 1).Inflation`. */
  countryProfile: number | null;
}): StandardImportRow[] {
  const { mode, assumptions, subaccount, deviceTypeInProjectId, project, countryProfile } = args;
  const codYear = inflationStartYear(project.codDate);
  const starts = standardPeriodStarts(
    project.codDate,
    assumptions,
    mode === "om" ? "description" : "period",
  );
  const startById = new Map(starts.map((s) => [s.id, s.startDate]));
  const period1 = sortedAssumptions(assumptions).find((a) => a.period === STANDARD_PERIOD.period1);

  return sortedAssumptions(assumptions).map((a) => ({
    subaccountId: mode === "om" ? subaccount.id : a.opexSubaccountId,
    deviceTypeInProjectId: mode === "om" ? deviceTypeInProjectId : null,
    name: standardCostName(mode, subaccount.name, a.description),
    description: a.description.trim(),
    startDate: startById.get(a.id) ?? null,
    durationYears: a.durationYears,
    durationMonths: a.durationMonths,
    currencyId: a.currencyId,
    fixCosts: a.fixCosts,
    percentOfRevenues: a.percentOfRevenues,
    threshold: a.threshold,
    thresholdType: a.thresholdType,
    thresholdIndividual: a.thresholdIndividual,
    eurPerMwh: a.eurPerMwh,
    eurPerMw: a.eurPerMw,
    eurPerWtg: a.eurPerWtg,
    aggregation: a.aggregation,
    parentKey: a.period === STANDARD_PERIOD.period1 ? null : period1?.id ?? null,
    useInflationProfile: a.useInflationProfile,
    useCountryInflationProfile: a.useCountryInflationProfile,
    inflationProfile: resolveInflationProfile(a, countryProfile),
    inflationStartYear: codYear,
    inflationCountryArea: a.inflationCountryArea,
    distributionFrequency: a.distributionFrequency,
    owningBusinessUnitId: project.owningBusinessUnitId ?? null,
    alignWithProjectDuration: a.alignWithProjectDuration,
    ...STANDARD_STAMP,
    externalContract: a.externalContract,
    assumptionId: a.id,
    period: a.period,
  }));
}

/* ═════════════════════════════════════════════════════════ the save cascade ══ */

/**
 * `pcf_…_BodyButtons_Save.OnChange` (`:8695`) — after the cost itself is patched, every DIRECT
 * child of the saved row is patched with ten fields:
 *
 * `varOpexChildCosts = Filter('Opex Project Costs', 'Parent Cost' = locSelectedOpexCost)`, then
 * `ForAll(varOpexChildCosts As ChildCost, Patch(…, { … }))`.
 *
 * Rates, dates, durations, currency, description and aggregation are NOT cascaded — a period
 * keeps its own money and its own dates. Only the fields the panel makes read-only on a child
 * (see `panelFieldModes`) are pushed down, which is what keeps the two consistent.
 *
 * Note the last two are read from the TOGGLE CONTROLS rather than from the patched record, so
 * `alignWithProjectDuration` and `externalContract` cascade the value the user just left in the
 * panel even on a path where the patch itself failed. `cascadeToChildren` takes them explicitly
 * for that reason.
 *
 * The chain is only ever two levels deep (see `groupChains`), so one pass reaches every period.
 */
export const CASCADED_FIELDS = [
  "useInflationProfile",
  "useCountryInflationProfile",
  "inflationProfile",
  "inflationStartYear",
  "inflationCountryArea",
  "threshold",
  "thresholdIndividual",
  "thresholdType",
  "alignWithProjectDuration",
  "externalContract",
] as const;

export type CascadePayload = Pick<OpexCost, (typeof CASCADED_FIELDS)[number]>;

export function cascadeToChildren(
  saved: OpexCost,
  children: readonly OpexCost[],
  fromPanel?: { alignWithProjectDuration: boolean; externalContract: boolean },
): { id: string; payload: CascadePayload }[] {
  if (children.length === 0) return [];
  const payload: CascadePayload = {
    useInflationProfile: saved.useInflationProfile,
    useCountryInflationProfile: saved.useCountryInflationProfile,
    inflationProfile: saved.inflationProfile,
    inflationStartYear: saved.inflationStartYear,
    inflationCountryArea: saved.inflationCountryArea,
    threshold: saved.threshold,
    thresholdIndividual: saved.thresholdIndividual,
    thresholdType: saved.thresholdType,
    alignWithProjectDuration:
      fromPanel?.alignWithProjectDuration ?? saved.alignWithProjectDuration,
    externalContract: fromPanel?.externalContract ?? saved.externalContract,
  };
  return children.map((c) => ({ id: c.id, payload }));
}

/** `varOpexChildCosts` — the rows the cascade will touch. */
export function childrenOf(costs: readonly OpexCost[], parentId: string): OpexCost[] {
  return costs.filter((c) => c.parentCostId === parentId);
}

/* ═════════════════════════════════════════════════════════════════ deleting ══ */

/**
 * `cmp_OpexCosts_PopUpConfirmation_DeleteCost.OnConfirm` (`:8861-8874`):
 *
 * `If(IsBlank(selected.'Parent Cost'),
 *     RemoveIf(costs, 'Parent Cost' = selected || 'Opex Project Cost' = selected),
 *     RemoveIf(costs, 'Opex Project Cost' = selected))`
 *
 * Deleting a chain ROOT deletes the root and every child; deleting a period deletes only it.
 */
export function planDeleteCost(
  costs: readonly OpexCost[],
  selected: OpexCost,
): { ids: string[]; cascades: boolean } {
  if (selected.parentCostId !== null) return { ids: [selected.id], cascades: false };
  return {
    ids: [selected.id, ...childrenOf(costs, selected.id).map((c) => c.id)],
    cascades: true,
  };
}

/**
 * `cmp_OpexCosts_PopUpConfirmation_DeleteCost` — the confirmation, transcribed.
 *
 * SOURCE DEFECT: O-3. `.Description` (`:8843-8847`) is
 *
 * `If(IsBlank(locSelectedOpexCost),
 *     "Are you sure that you want to permanently delete """ & desc & """Cost and all its related periods?",
 *     "Are you sure that you want to permanently delete """ & desc & """ cost?")`
 *
 * It tests the SELECTED COST where `OnConfirm` tests that cost's `'Parent Cost'`. Since the
 * dialog only ever opens from a command that requires a selection, the first branch is
 * unreachable — and it is the branch that warns about the cascade. So the dialog always promises
 * a single-row delete while the confirm cascades. The first branch also interpolates the
 * description of a record it has just asserted is blank, and is missing the space before "Cost".
 *
 * `deleteDialogText` branches on the parent, so the warning matches the action.
 * `deleteDialogTextCanvasParity` keeps the canvas behaviour reachable.
 */
export const DELETE_DIALOG = {
  /** `cmp_OpexCosts_PopUpConfirmation_DeleteCost.Title` — verbatim. */
  title: "Delete OPEX cost?",
  /** `cmp_OpexCosts_PopUpConfirmation_DeleteCost.TextConfirmButton` — verbatim. */
  confirm: "Delete",
  /** `cmp_OpexCosts_PopUpConfirmation_DeleteCost.TextCancelButton` — verbatim. */
  cancel: "Cancel",
} as const;

/** The cascade wording, verbatim — including the missing space before "Cost". */
export function deleteDialogCascadeText(description: string): string {
  return `Are you sure that you want to permanently delete "${description}"Cost and all its related periods?`;
}

/** The single-row wording, verbatim. */
export function deleteDialogSingleText(description: string): string {
  return `Are you sure that you want to permanently delete "${description}" cost?`;
}

/** SOURCE DEFECT O-3 corrected: the wording follows the parent, as `OnConfirm` does. */
export function deleteDialogText(selected: OpexCost | null): string {
  if (selected === null) return deleteDialogCascadeText("");
  return selected.parentCostId === null
    ? deleteDialogCascadeText(selected.description)
    : deleteDialogSingleText(selected.description);
}

/** Bug-for-bug twin: the canvas tests the selection itself, so the cascade text is unreachable. */
export function deleteDialogTextCanvasParity(selected: OpexCost | null): string {
  return selected === null
    ? deleteDialogCascadeText("")
    : deleteDialogSingleText(selected.description);
}

/* ═══════════════════════════════════════════════════════════ duration badge ══ */

export type DurationBadge = "none" | "match" | "mismatch";

/**
 * `con_AlignWithProjectDuration_Container.Fill` / `lbl_AlignWithProjectDurationLabel.Text`
 * (`:2395-2529` and `:2548-2671`) — the badge on an Other-OPEX SUB-ACCOUNT card.
 *
 * Step 1: every cost type in the sub-account (`IsBlank('Parent Cost')`).
 * Step 2: for each, its LAST period by `'Start Date'` ascending — including the root itself.
 * Step 3: five counts over that set of last periods:
 *   `locTotal`                     all of them
 *   `alignedCount`                 `Align With Project Duration = Yes`
 *   `notAlignedCount`              `= No`
 *   `alignedLanding`               aligned AND `'Start Date' >= 'Project Start Date'` AND
 *                                  `Text(end, "yyyy/mm/dd") = Text(projectEnd, "yyyy/mm/dd")`
 *   `notAlignedLanding`            the same with `= No`
 * then `alignedMissing = alignedCount - alignedLanding` and likewise for the unaligned.
 *
 * Step 4: a nine-arm `If`, transcribed in order below. The eighth and ninth arms carry a comment
 * in the source recording a deliberate change from `""` to `"Duration Match"`:
 *
 *   "This is changed from "" to "Duration Match" so that if not aligned period is out of range
 *    but we have aligned period in range, so it shows "Duration Match""  (`:2522`, `:5215`)
 *
 * CANVAS DIVERGENCE FROM THE SKELETON — `opex-costs/rules.ts:586-615` collapses this to
 * "everything lands → match; an aligned one misses → mismatch; otherwise none". That gets arm 9
 * wrong: with at least one aligned period landing and at least one UNALIGNED period missing, the
 * canvas shows `Duration Match` and the skeleton shows nothing. The comment above is the author
 * saying so explicitly. The canvas is followed.
 *
 * The `Fill` and the `Text` agree arm for arm: `SuccessLight` where the text is `Duration Match`,
 * a 60 % faded `Warning` where it is `Duration Mismatch`, and `Color.Transparent` where it is
 * empty.
 */
export function durationBadge(
  subaccountCosts: readonly OpexCost[],
  project: Pick<OpexProjectContext, "projectStartDate" | "endDate">,
): DurationBadge {
  const chains = groupChains(subaccountCosts);
  const lastPeriods = chains.map(lastPeriodByStartDate);

  const total = lastPeriods.length;
  if (total === 0) return "none";

  const projectEnd = toDate(project.endDate);
  const projectStart = toDate(project.projectStartDate);

  const lands = (p: OpexCost): boolean => {
    const start = toDate(p.startDate);
    const end = periodEndDate(p);
    if (start === null || end === null || projectEnd === null) return false;
    if (projectStart !== null && start.getTime() < projectStart.getTime()) return false;
    return ymd(end) === ymd(projectEnd);
  };

  const aligned = lastPeriods.filter((p) => p.alignWithProjectDuration);
  const notAligned = lastPeriods.filter((p) => !p.alignWithProjectDuration);
  const alignedCount = aligned.length;
  const notAlignedCount = notAligned.length;
  const alignedMissing = alignedCount - aligned.filter(lands).length;
  const notAlignedMissing = notAlignedCount - notAligned.filter(lands).length;

  if (alignedCount === 0 && notAlignedCount === 0) return "none";
  if (alignedCount > 0 && alignedMissing === 0 && notAlignedCount === 0) return "match";
  if (alignedCount > 0 && alignedMissing > 0 && notAlignedCount === 0) return "mismatch";
  if (alignedCount === 0 && notAlignedCount > 0 && notAlignedMissing > 0) return "none";
  if (alignedCount === 0 && notAlignedCount > 0 && notAlignedMissing === 0) return "match";
  if (alignedCount > 0 && alignedMissing === 0 && notAlignedCount > 0 && notAlignedMissing === 0) {
    return "match";
  }
  if (alignedCount > 0 && alignedMissing > 0) return "mismatch";
  if (alignedCount > 0 && alignedMissing === 0 && notAlignedCount > 0 && notAlignedMissing > 0) {
    return "match";
  }
  // The canvas `If` has no final else, so anything unmatched is `Blank()`.
  return "none";
}

/**
 * `lbl_AlignWithProjectDurationLabel_1.Text` (`:5222-5297`) — the badge on an O&M DEVICE card.
 *
 * A COMPLETELY DIFFERENT algorithm from the sub-account badge above, which is commented out
 * directly over it (`:5132-5219`). What ships:
 *
 * `locOpexCostLastPeriod = Last(Sort(Sort(Filter(costs, device = ThisItem), 'Start Date', Asc),
 *                               Description, Asc))`
 * then
 *   lands AND aligned      → "Duration Match"
 *   NOT lands AND NOT aligned → ""
 *   NOT lands AND aligned  → "Duration Mismatch"
 *   otherwise              → ""
 *
 * So it judges exactly ONE row on the whole card — the last by description then start date,
 * across every cost type on that device — instead of the last period of each cost type. A device
 * with two cost types has the second one silently ignored.
 *
 * SOURCE DEFECT: O-4. Reproduced. Note the fourth arm swallows "lands AND not aligned", which
 * the sub-account badge calls `Duration Match` (arm 6).
 */
export function omDurationBadge(
  deviceCosts: readonly OpexCost[],
  project: Pick<OpexProjectContext, "projectStartDate" | "endDate">,
): DurationBadge {
  const sorted = sortCosts(deviceCosts);
  const last = sorted[sorted.length - 1];
  if (!last) return "none";

  const projectEnd = toDate(project.endDate);
  const projectStart = toDate(project.projectStartDate);
  const start = toDate(last.startDate);
  const end = periodEndDate(last);

  const lands =
    start !== null && end !== null && projectEnd !== null
    && (projectStart === null || start.getTime() >= projectStart.getTime())
    && ymd(end) === ymd(projectEnd);

  if (lands && last.alignWithProjectDuration) return "match";
  if (!lands && !last.alignWithProjectDuration) return "none";
  if (!lands && last.alignWithProjectDuration) return "mismatch";
  return "none";
}

/**
 * `inf_OpexCost_AlignWithDuration.Visible` — the amber warning icon on an Other-OPEX ROW
 * (`:2219-2259`).
 *
 * Per row: resolve the chain head, take its last period by `Name` ascending, and if THIS row is
 * that period, show when `('Start Date' < 'Project Start Date' OR the end does not land)` AND
 * `Align With Project Duration = Yes`.
 */
export function otherAlignWarningVisible(
  row: OpexCost,
  subaccountCosts: readonly OpexCost[],
  project: Pick<OpexProjectContext, "projectStartDate" | "endDate">,
): boolean {
  const headId = row.parentCostId ?? row.id;
  const inChain = subaccountCosts
    .filter((c) => c.parentCostId === headId || c.id === headId)
    .sort((a, b) => a.name.localeCompare(b.name));
  const last = inChain[inChain.length - 1];
  if (!last || last.id !== row.id) return false;

  const projectEnd = toDate(project.endDate);
  const projectStart = toDate(project.projectStartDate);
  const start = toDate(row.startDate);
  const end = periodEndDate(row);
  const before = start !== null && projectStart !== null
    && start.getTime() < projectStart.getTime();
  const misses = end === null || projectEnd === null || ymd(end) !== ymd(projectEnd);
  return (before || misses) && row.alignWithProjectDuration;
}

/**
 * `inf_OpexCost_AlignWithDuration_1.Visible` — the same icon on an O&M ROW (`:4682-4757`).
 *
 * SOURCE DEFECT: O-4b. The condition never mentions `ThisItem` except to read its device, so it
 * is the SAME answer for every row on the card: it resolves the card's last row (by start date
 * then description, `Last` of a double sort) and asks whether THAT one misses while aligned. The
 * icon therefore appears on every row of a device card, not on the offending one.
 *
 * Reproduced. The three-arm `If` is transcribed literally: lands AND aligned → false;
 * NOT lands AND NOT aligned → false; NOT lands AND aligned → true; else false.
 */
export function omAlignWarningVisible(
  deviceCosts: readonly OpexCost[],
  project: Pick<OpexProjectContext, "projectStartDate" | "endDate">,
): boolean {
  return omDurationBadge(deviceCosts, project) === "mismatch";
}

/* ══════════════════════════════════════════════════════════════════ strings ══ */

/**
 * Every user-visible string on the screen, transcribed from the canvas control named in each
 * comment. Same words, same punctuation, same capitalisation — including the wording the canvas
 * got wrong, which is noted rather than fixed.
 */
export const OPEX_MSG = {
  /**
   * `ico_ResetStartDay_NewEditCost_OPEXCosts.Tooltip` (`:5949`) — the same string the Land
   * Lease icon carries. Ours said "Reset to the standard assumption date.", which is not what
   * the button does: it puts the project's COD back.
   */
  resetStartDateTooltip: "Reset to current project COD date.",

  /**
   * `lbl_OpexCosts_Content_GeneratorsInProject_Instruction.Text` (`:309`) — verbatim.
   * Visible when the device gallery is empty and the rail item is Operation & Maintenance.
   */
  noGenerators:
    "Please add a generator and refresh this page to enter Operation & Maintenance costs",

  /**
   * `lbl_OpexCosts_RightPanel_NewEditCost_BodyContent_Description_ErrorMessage.Text` (`:5580`) —
   * verbatim, including the doubled quotes the canvas escapes.
   *
   * Its `.Visible` (`:5597-5607`) is `Not(IsBlank(value)) && Not(IsBlank(Find("standard",
   * Lower(value))))` — the substring may appear ANYWHERE, not only at the start. The
   * duplicate-description message the control originally carried is commented out above it
   * (`:5561-5577`).
   */
  descriptionStandardReserved:
    'The term "Standard" is applicable only for system-prefilled contracts.',

  /** `lbl_…_BodyContent_StartDate_ErrorMessage.Text` (`:5807-5810`) — verbatim. */
  startDateBlank: "Value cannot be blank",

  /**
   * `lbl_…_FixCosts_ErrorMessage.Text` (`:6370`), and identically on EUR/MWh (`:6638`),
   * EUR/MW (`:6772`) and EUR/WTG (`:6911`) — verbatim, "place" singular.
   */
  twoDecimal: "Value must be a numeric with two decimal place.",

  /**
   * `lbl_…_ProcentOfRevenues_ErrorMessage.Text` (`:6504`) — DIFFERENT wording for the same check.
   * The skeleton reuses `twoDecimal` here; the canvas does not.
   */
  twoDecimalRevenues: "Enter a number with no more than two decimal places.",

  /** `lbl_…_InflationProfile_ErrorMessage.Text` (`:7748`) — no trailing full stop. */
  oneDecimalInflation: "Value must be a numeric with 1 decimal place",

  /** `lbl_…_InflationProfile_ErrorMessage.Text` (`:7758`) — with a trailing full stop. */
  inflationProfileRange: "Please select a value between 0 and 100.",

  /** `lbl_…_InflationStartYear_ErrorMessage.Text` (`:7458`) — the `^\d{4}$` check. */
  inflationStartYearFormat: "Year value must be in format YYYY.",

  /** `lbl_…_Threshold_Individual_ErrorMessage.Text` (`:8179`) — `gblAppResx`'s own wording. */
  thresholdOneDecimal: "Numeric value with maximum of one decimals",

  /**
   * `lbl_…_Threshold_Individual_ErrorMessage.Text` (`:8190`) —
   * `$"Please select a value between 0 and {Text(10000000, "###.#")}"`. `"###.#"` carries no
   * group separator, so the number renders ungrouped and there is no trailing full stop.
   */
  thresholdRange: "Please select a value between 0 and 10000000",

  /**
   * `lbl_…_ProcentOfRevenues_ErrorMessage_1.Text` (`:8402`) — the threshold radio, verbatim.
   * Its `.Visible` is simply `IsBlank(radio.Selected.Value)`, so it shows the moment the
   * Threshold toggle is switched on and before a type is chosen.
   */
  thresholdTypeMissing: "Please select a threshold option.",

  /** `lbl_OpexCosts_RightPanel_NewEditCost_BodyButtons_Hint.Text` (`:8763`) — verbatim. */
  atLeastOneFigure: "Please fill in at least one commercial figure",

  /** `inf_OpexCost_AlignWithDuration.Content` (`:2215`, `:4666`) — verbatim. */
  doesNotAlign: "This Cost Contract does not align with Project duration",

  /** `InfoButtonCanvas1.Content` (`:8552`) — verbatim. */
  externalContractHelp:
    "External contracts involve third-party providers, while internal contracts are with "
    + "internal VSB/Total departments (e.g., VSB Service).",

  /** `locSpinnerInformationText` — `:635` / `:3023`. */
  loadingStandardContract: "Please wait, loading Standard Assumption Contract...",
  /** `locSpinnerInformationText` — `pcf_…_BodyButtons_Save.OnChange` (`:8695`). */
  savingCost: "Saving OPEX cost...",
  /** `locSpinnerInformationText` — the child cascade (`:8695`, `:8786`). */
  updatingChildCosts: "Updating inflation profiles on child costs...",
  /** `locSpinnerInformationText` — `cmp_…_DeleteCost.OnConfirm` (`:8856`). */
  deletingCost: "Deleting OPEX cost...",

  /**
   * The save failure `Notify` (`pcf_…_BodyButtons_Save.OnChange`, `:8695`) —
   * `"Error: OPEX cost could not be saved correctly. " & "Internal error: originated on " &
   *  FirstError.Source & ". Message: " & FirstError.Message & FirstError.Details.HttpResponse`
   *
   * Reproduced as a builder so the interpolated parts stay identifiable. The canvas has no
   * separator before `HttpResponse`, and none is added.
   */
  saveFailed: (source: string, message: string, httpResponse = ""): string =>
    `Error: OPEX cost could not be saved correctly. Internal error: originated on ${source}. `
    + `Message: ${message}${httpResponse}`,
} as const;

/** Panel field labels and titles, transcribed control by control. */
export const OPEX_PANEL_LABELS = {
  /** `lbl_…_BodyContentDescription.Text` (`:5721`). */
  description: "Description",
  /** `lbl_…_BodyContent_StartDate.Text` (`:5897`). */
  startDate: "Start Date",
  /** `lbl_…_BodyContent_DurationYears.Text` (`:6130`) — one label over two dropdowns. */
  duration: "Duration",
  /** `lbl_…_BodyContent_Currency.Text` (`:6280`). */
  currency: "Currency",
  /** `lbl_…_BodyContent_ProcentOfRevenues.Text` (`:6580`). */
  percentOfRevenues: "Share of Revenues [%]",
  /** `lbl_…_BodyContent_Aggregation.Text` (`:7060`). */
  aggregation: "Aggregation",
  /** `lbl_…_BodyContent_DistributionFrequency.Text` (`:7179`). */
  distributionFrequency: "Distribution Frequency",
  /** `tgl_…_BodyContent_CountryInflationProfile.Label` (`:7337`). */
  countryInflationProfile: "Country Inflation Profile",
  /** `tgl_…_BodyContent_InflationProfile.Label` (`:7369`). */
  inflationProfile: "Inflation Profile",
  /** `lbl_…_BodyContent_InflationStartYear.Text` (`:7522`), placeholder `"YYYY"` (`:7481`). */
  inflationStartYear: "Inflation Start Year",
  inflationStartYearPlaceholder: "YYYY",
  /** `lbl_…_BodyContent_AreaInflationProfile.Text` (`:7660`). */
  area: "Area",
  /** `lbl_…_BodyContent_InflationProfile.Text`, the country-toggle-off branch (`:7959`). */
  customInflationProfile: "Custom Inflation Profile [%]",
  /** `lbl_…_BodyContent_Threshold.Text` (`:8340`). */
  threshold: "Threshold",
  /** `lbl_…_BodyContent_Threshold_Individual.Text` (`:8249`). */
  individualThreshold: "Individual Threshold [MWh p.a.]",
  /** `tgl_…_BodyContent_AlignWithProjectDuration.Label` (`:8489`) — lower-case "with". */
  alignWithProjectDuration: "Align with Project Duration",
  /** `tgl_…_BodyContent_ExternelContract.Label` (`:8543`). */
  externalContract: "External Contract",
  /** `pcf_…_BodyButtons_Save.Text` (`:8696`) / `…_Cancel.Text` (`:8601`). */
  save: "Save",
  cancel: "Cancel",
} as const;

/** The card-header badge captions (`lbl_AlignWithProjectDurationLabel.Text`, `:2654`/`:2656`). */
export const DURATION_BADGE_TEXT: Record<DurationBadge, string> = {
  none: "",
  match: "Duration Match",
  mismatch: "Duration Mismatch",
};

/**
 * The cost table header, left to right, with the two mode-dependent captions.
 *
 * `Fix Costs p.a. [<ISO currency code>]` (`:1173-1177`, `:3701-3705`) and the three
 * `<code>/…  p.a.` captions (`:1274`, `:1306`, `:1338`) interpolate
 * `gblRecordSelectedProjectCountry.'ISO Currency Code'`, falling back to `"EUR"` for Fix Costs
 * and — note the inconsistency — to `"Cur."` for the three rate columns.
 *
 * `Threshold` is worded DIFFERENTLY in the two galleries: `"Threshold [MWh]"` on the sub-account
 * table (`:1241`) and `"Threshold for <code>/MWh p.a."` on the device table (`:3635`), the latter
 * falling back to `"EUR"`. Both are transcribed.
 */
export interface OpexColumn { key: string; label: string; numeric?: boolean }

export function opexColumns(
  mode: OpexMode,
  isoCurrencyCode: string | null | undefined,
): OpexColumn[] {
  const code = (isoCurrencyCode ?? "").trim();
  const cur = code === "" ? "Cur." : code;
  const eur = code === "" ? "EUR" : code;
  const columns: OpexColumn[] = [
    { key: "description", label: "Description" },
    { key: "startDate", label: "Start Date" },
    { key: "durationYears", label: "Duration" },
    { key: "durationMonths", label: "" },
    { key: "endDate", label: "End Date" },
    { key: "currency", label: "Currency" },
    { key: "inflationProfile", label: "Inflation Profile" },
    { key: "fixCosts", label: `Fix Costs p.a. [${eur}]`, numeric: true },
    { key: "percentOfRevenues", label: "Share of Revenues [%]", numeric: true },
  ];
  if (showThresholdColumn(mode)) {
    columns.push({
      key: "threshold",
      label: mode === "om" ? `Threshold for ${eur}/MWh p.a.` : "Threshold [MWh]",
      numeric: true,
    });
  }
  columns.push(
    { key: "eurPerMwh", label: `${cur}/MWh p.a.`, numeric: true },
    { key: "eurPerMw", label: `${cur}/MW p.a.`, numeric: true },
    { key: "eurPerWtg", label: `${cur}/WTG p.a.`, numeric: true },
    { key: "aggregation", label: "Aggregation" },
    { key: "distributionFrequency", label: "Distribution Frequency" },
  );
  return columns;
}

/**
 * `lbl_OpexCosts_RightPanel_NewEditCost_BodyHeader.Text` (`:5430-5445`):
 *
 * `If(And(IsBlank(locSelectedOpexCostParent),
 *         locSelectedAccount <> First(colOpexAccounts)),
 *     If(IsBlank(locSelectedOpexCost), "Add Cost Type", "Edit Cost Type"),
 *     If(IsBlank(locSelectedOpexCost), "Add Period", "Edit Period")) & " - " & locSelectedDevice`
 *
 * So "Cost Type" only in Other OPEX mode (the selected account is not the first) and only for a
 * chain root; everything else is "Period". `locSelectedDevice` is the sub-account name in Other
 * OPEX (`:593`) and the resolved device label in O&M (`:2935-2973`).
 */
export function panelTitle(ctx: Pick<PanelContext,
  "selected" | "parent" | "isFirstAccount" | "deviceLabel">): string {
  const verb = ctx.selected === null ? "Add" : "Edit";
  const noun = ctx.parent === null && !ctx.isFirstAccount ? "Cost Type" : "Period";
  return `${verb} ${noun} - ${ctx.deviceLabel}`;
}

/* ═══════════════════════════════════════════════════════════════ the panel ══ */

/**
 * `drp_…_DurationYears.Items` (`:6078-6084`) — `ForAll(Sequence(36), {Name: Value-1 & …, Value: Value-1})`,
 * i.e. **0 to 35 years**, not 0 to 50 as `periods/rules.ts` has it.
 *
 * SOURCE DEFECT: O-11. The label is
 * `ThisRecord.Value - 1 & If(ThisRecord.Value = 1, " year", " years")` — the singular test reads
 * the 1-BASED sequence index while the caption reads the 0-based value, so the list starts
 * `"0 year", "1 years", "2 years"…`. The months list next to it tests `ThisRecord.Value - 1 = 1`
 * and is correct. Reproduced.
 */
export const DURATION_YEAR_OPTIONS: readonly { name: string; value: number }[] =
  Array.from({ length: 36 }, (_, i) => ({
    // `i` is `Sequence` index - 1, so `ThisRecord.Value` is `i + 1`.
    name: `${i}${i + 1 === 1 ? " year" : " years"}`,
    value: i,
  }));

/** `drp_…_DurationMonths.Items` (`:6024-6030`) — `Sequence(12)`, 0 to 11, correctly pluralised. */
export const DURATION_MONTH_OPTIONS: readonly { name: string; value: number }[] =
  Array.from({ length: 12 }, (_, i) => ({
    name: `${i}${i === 1 ? " month" : " months"}`,
    value: i,
  }));

/**
 * `locColDistributionFrequency`, declared inline in `OnVisible` (`:23-44`).
 * The stored value IS the month count — there is no separate id.
 */
export const OPEX_DISTRIBUTION_FREQUENCY: readonly { name: string; value: number }[] = [
  { name: "1 month", value: 1 },
  { name: "2 months", value: 2 },
  { name: "3 months", value: 3 },
  { name: "6 months", value: 6 },
  { name: "12 months", value: 12 },
];

/**
 * `drp_…_Currency.DefaultSelectedItems` (`:6194-6205`) —
 * `Switch(country.Name, "Poland", LookUp(Currencies, 'Currency Code' = "PLN"),
 *  LookUp(Currencies, 'Currency Code' = "EUR"))`. The control is permanently `Disabled`.
 */
export function defaultCurrencyCode(countryName: string | null | undefined): "PLN" | "EUR" {
  return countryName === "Poland" ? "PLN" : "EUR";
}

/**
 * The three rate labels in the PANEL switch on the CURRENCY DROPDOWN, not on the country
 * (`:6710-6714`, `:6844-6848`, `:6983-6987`):
 * `Switch(currency.'Currency Code', "PLN", "PLN/MWh p.a.", "EUR/MWh p.a.")`.
 *
 * So a project in, say, Czechia shows `EUR/MWh p.a.` in the panel while the TABLE header shows
 * the country's own ISO code. Transcribed, not reconciled.
 */
export function panelRateLabel(currencyCode: string | null | undefined, unit: "MWh" | "MW" | "WTG") {
  return currencyCode === "PLN" ? `PLN/${unit} p.a.` : `EUR/${unit} p.a.`;
}

/**
 * `togl_…_BodyContent_Threshold.Label` (`:8436`) —
 * `"Threshold for " & <ISO code, else "EUR"> & "/MWh p.a."`.
 */
export function thresholdToggleLabel(isoCurrencyCode: string | null | undefined): string {
  const code = (isoCurrencyCode ?? "").trim();
  return `Threshold for ${code === "" ? "EUR" : code}/MWh p.a.`;
}

/**
 * `tgl_…_BodyContent_ExternelContract.Checked` (`:8508-8535`).
 *
 * The parent's flag while adding a period, the row's own flag when editing, and on a brand-new
 * cost type — where both are blank — the final `Switch` arms:
 * `locSelectedSubaccount.Order = 1 && rail = "Other OPEX Costs"` → false, else **true**.
 *
 * So a new cost defaults to External EXCEPT on the lowest-ordered Other-OPEX sub-account, which
 * on VSBCloud_Dev is `Technical Commercial Management Agreement (TCMA)` — the one contract VSB
 * holds internally.
 */
export function externalContractDefault(args: {
  selected: Pick<OpexCost, "externalContract"> | null;
  parent: Pick<OpexCost, "externalContract"> | null;
  mode: OpexMode;
  subaccountOrder: number | null;
}): boolean {
  const { selected, parent, mode, subaccountOrder } = args;
  if (parent !== null && selected === null) return parent.externalContract;
  if (selected !== null) return selected.externalContract;
  return !(subaccountOrder === 1 && mode === "other");
}

/**
 * `tgl_…_AlignWithProjectDuration.Checked` (`:8463-8481`) — the parent's flag while adding, the
 * row's own when editing, and `true` when neither is set. The final `true` arm means a brand-new
 * cost type is aligned by default.
 */
export function alignWithProjectDurationDefault(args: {
  selected: Pick<OpexCost, "alignWithProjectDuration"> | null;
  parent: Pick<OpexCost, "alignWithProjectDuration"> | null;
}): boolean {
  if (args.parent !== null && args.selected === null) return args.parent.alignWithProjectDuration;
  if (args.selected !== null) return args.selected.alignWithProjectDuration;
  return true;
}

/**
 * `dte_…_StartDate.OnChange` (`:5823-5832`) —
 * `locIsStartDateStandardAssumption: If(IsBlank(locSelectedOpexCostNext.'Parent Cost'), No, Yes)`.
 *
 * Choosing a date by hand clears the flag only when the period this one FOLLOWS is a chain root;
 * following a child period leaves the flag set. Note it tests `locSelectedOpexCostNext`, the
 * previous period, not the record being edited.
 */
export function startDateStandardFlagAfterManualChange(
  nextParentCostId: string | null | undefined,
): boolean {
  return nextParentCostId !== null && nextParentCostId !== undefined;
}

/**
 * `ico_ResetStartDay_NewEditCost_OPEXCosts.OnChange` (`:5941-5955`) — the refresh icon beside the
 * date resets it to COD and re-derives the flag from a three-arm `Switch`, all three of which
 * answer `Yes`:
 *
 *   no next AND no selection                  → Yes
 *   selection is a chain root                 → Yes
 *   no parent AND no selection                → Yes
 *   otherwise                                 → No
 *
 * Its `.Visible` (`:5959-5963`) is `Or(IsBlank(selected) && IsBlank(parent),
 * IsBlank(selected.'Parent Cost') && Not(IsBlank(selected)))` — the icon only appears on a chain
 * root.
 */
export function resetStartDateFlag(args: {
  selected: OpexCost | null;
  parent: OpexCost | null;
  next: OpexCost | null;
}): boolean {
  const { selected, parent, next } = args;
  if (next === null && selected === null) return true;
  if (selected !== null && selected.parentCostId === null) return true;
  if (parent === null && selected === null) return true;
  return false;
}

export function resetStartDateVisible(args: {
  selected: OpexCost | null;
  parent: OpexCost | null;
}): boolean {
  const { selected, parent } = args;
  return (selected === null && parent === null)
    || (selected !== null && selected.parentCostId === null);
}

/** Rule 13 — `IsStartDateStandardAssumption: Coalesce(parent.…, locIsStartDateStandardAssumption)`. */
export function inheritStartDateStandard(
  parent: Pick<OpexCost, "isStartDateStandardAssumption"> | null,
  own: boolean,
): boolean {
  return parent ? parent.isStartDateStandardAssumption : own;
}

/* ═════════════════════════════════════════════════════════════ validation ══ */

/**
 * `locContractsCostsMax`-style bounds, read off each `*_ErrorMessage.Text`.
 *
 * `fixCosts`, `eurPerMwh`, `eurPerMw` and `eurPerWtg` are TWO decimals, 0..1 000 000 000.
 * `percentOfRevenues` is two decimals, 0..10 000, with its own message.
 * `inflationProfile` is ONE decimal, 0..100.
 * `thresholdIndividual` is ONE decimal, 0..10 000 000 — the skeleton has it at two decimals
 * against `OPEX_MSG.range`, which is neither the right precision nor the right wording.
 */
export const OPEX_RANGES = {
  fixCosts: { min: 0, max: 1_000_000_000, places: 2 as const },
  percentOfRevenues: { min: 0, max: 10_000, places: 2 as const },
  eurPerMwh: { min: 0, max: 1_000_000_000, places: 2 as const },
  eurPerMw: { min: 0, max: 1_000_000_000, places: 2 as const },
  eurPerWtg: { min: 0, max: 1_000_000_000, places: 2 as const },
  inflationProfile: { min: 0, max: 100, places: 1 as const },
  thresholdIndividual: { min: 0, max: 10_000_000, places: 1 as const },
} as const;

export type OpexNumericField = keyof typeof OPEX_RANGES;

/** `$"Value must be between 0 and {Text(max, "#,###.0#")}."` (`:6381-6384`). */
export function rangeMessage(max: number): string {
  return `Value must be between 0 and ${
    numberFormat("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 2 })
      .format(max)
  }.`;
}

/**
 * One numeric field's error message, or `null` when the canvas would hide the label.
 *
 * Every one of these labels has the same shape: `.Visible` is
 * `And(Not(IsBlank(value)), Or(Not(IsNDecimal(value)), Not(InRange(value, 0, max))))` and `.Text`
 * picks the decimal message first, then the range message. BLANK IS ALWAYS VALID — the required
 * fields are enforced by the Save gate, not here.
 *
 * `fn_Numeric.IsTwoDecimal` accepts a leading `-` while `IsOneDecimal` does not
 * (`domain/numeric.ts` PARITY NOTE 3); that asymmetry is carried through by `allowNegative`.
 */
export function validateOpexNumber(
  field: OpexNumericField,
  value: string,
  locale?: string,
): string | null {
  if (value.trim() === "") return null;
  const spec = OPEX_RANGES[field];
  const twoDecimal = spec.places === 2;
  const ok = isDecimal(value, {
    places: spec.places,
    allowNegative: twoDecimal,
    locale,
  });

  if (field === "thresholdIndividual") {
    if (!ok) return OPEX_MSG.thresholdOneDecimal;
    // The threshold label's range arm tests `Not(IsBlank(value))`, NOT `IsNumeric(value)`.
    if (!inRange(value, spec.min, spec.max, locale)) return OPEX_MSG.thresholdRange;
    return null;
  }

  if (field === "inflationProfile") {
    if (!ok) return OPEX_MSG.oneDecimalInflation;
    if (!isNumeric(value, locale)) return null;
    if (!inRange(value, spec.min, spec.max, locale)) return OPEX_MSG.inflationProfileRange;
    return null;
  }

  if (!ok) {
    return field === "percentOfRevenues" ? OPEX_MSG.twoDecimalRevenues : OPEX_MSG.twoDecimal;
  }
  // The five money labels gate the range arm on `IsNumeric(value)`.
  if (!isNumeric(value, locale)) return null;
  if (!inRange(value, spec.min, spec.max, locale)) return rangeMessage(spec.max);
  return null;
}

/**
 * `lbl_…_InflationStartYear_ErrorMessage.Visible` (`:7461-7465`) —
 * `And(Not(IsBlank(value)), Not(IsMatch(value, "^\d{4}$")))`.
 */
export function validateInflationStartYear(value: string): string | null {
  if (value.trim() === "") return null;
  return /^\d{4}$/.test(value.trim()) ? null : OPEX_MSG.inflationStartYearFormat;
}

/**
 * `lbl_…_Description_ErrorMessage.Visible` (`:5597-5607`) —
 * `And(Not(IsBlank(value)), Not(IsBlank(Find("standard", Lower(value)))))`.
 *
 * A SUBSTRING test, anywhere in the value: "Non-standard cover" is rejected too. Note the control
 * does NOT trim before testing but the Save gate trims separately.
 */
export function descriptionHasReservedStandard(value: string): boolean {
  return value !== "" && value.toLowerCase().includes("standard");
}

export function descriptionError(value: string): string | null {
  return descriptionHasReservedStandard(value) ? OPEX_MSG.descriptionStandardReserved : null;
}

/**
 * SOURCE DEFECT: O-12. `lbl_…_StartDate_ErrorMessage` has
 * `Text: If(IsBlank(date), "Value cannot be blank")` (`:5807-5810`) and
 * `Visible: Not(IsBlank(date))` (`:5812`). The two are inverted with respect to each other: the
 * label renders EMPTY when a date IS chosen and hides itself when one is missing, so the message
 * is never shown. The Save gate independently requires a non-blank date, so the bug is cosmetic.
 *
 * `startDateError` is the corrected behaviour; `startDateErrorVisibleCanvasParity` keeps the
 * canvas' own `.Visible` reachable.
 */
export function startDateError(date: string | Date | null): string | null {
  return toDate(date) === null ? OPEX_MSG.startDateBlank : null;
}

export function startDateErrorVisibleCanvasParity(date: string | Date | null): boolean {
  return toDate(date) !== null;
}

/** `lbl_…_BodyButtons_Hint.Visible` (`:8766-8772`) — all five commercial figures blank. */
export function showAtLeastOneFigureHint(form: Pick<OpexForm,
  "fixCosts" | "percentOfRevenues" | "eurPerMwh" | "eurPerMw" | "eurPerWtg">): boolean {
  return [
    form.fixCosts, form.percentOfRevenues, form.eurPerMwh, form.eurPerMw, form.eurPerWtg,
  ].every((v) => v.trim() === "");
}

/** `lbl_…_ProcentOfRevenues_ErrorMessage_1.Visible` (`:8404`) — the threshold radio. */
export function thresholdTypeError(thresholdType: number | null): string | null {
  return thresholdType === null ? OPEX_MSG.thresholdTypeMissing : null;
}

export interface OpexForm {
  description: string;
  startDate: string | null;
  durationYears: number | null;
  durationMonths: number | null;
  currencyId: string | null;
  aggregation: number | null;
  distributionFrequency: number | null;
  fixCosts: string;
  percentOfRevenues: string;
  eurPerMwh: string;
  eurPerMw: string;
  eurPerWtg: string;
  thresholdOn: boolean;
  thresholdType: number | null;
  thresholdIndividual: string;
  inflationOn: boolean;
  useCountryInflationProfile: boolean;
  inflationStartYear: string;
  inflationProfile: string;
  /** The `Area` dropdown's selected `Area` text — see `areaFieldVisible` and defect O-2. */
  inflationCountryArea: string | null;
  alignWithProjectDuration: boolean;
  externalContract: boolean;
}

export interface SaveGateContext {
  /** `locSelectedOpexCost` — null while adding. */
  selected: OpexCost | null;
  /** `locSelectedProjectCosts` — every row on the card. */
  costsInScope: readonly OpexCost[];
  countryName: string | null;
  locale?: string;
}

/**
 * `pcf_OpexCosts_RightPanel_NewEditCost_BodyButtons_Save.DisplayMode` (`:8612-8680`), clause by
 * clause, in the canvas' own order.
 *
 *   1-6   none of the six numeric `*_ErrorMessage` labels is visible: Fix Costs,
 *         % of Revenues, Threshold Individual, EUR/MWh, EUR/WTG, EUR/MW
 *   7     `Not(IsBlank(Trim(Description)))`
 *   8     the Description error label is not visible — i.e. "standard" does not appear in it
 *   9     `Or(Not(IsBlank(selected)), <no other row on the card has this Description>)`
 *   10    a start date is chosen
 *   11-12 both duration dropdowns have a selection
 *   13    `Not(years = 0 && months = 0)`
 *   14    a currency is selected
 *   15    an aggregation is selected
 *   16    a distribution frequency is selected
 *   17    `Or(Not(thresholdToggle), <a threshold type is selected>)`
 *   18    `Or(Not(type = Individual), <the individual value is not blank>)`
 *   19    at least one of the five commercial figures is filled
 *   20    `Or(Not(inflationToggle), <start year filled and valid AND profile filled and valid>)`
 *   21    `If(country = "Italy" && inflationToggle && countryInflationToggle,
 *            <an Area is selected>, true)`
 *
 * Clause 8 is the one the skeleton does not have; the skeleton instead carries the
 * duplicate-description message that the canvas commented OUT (`:5561-5577`). Clause 9 — the real
 * duplicate check — is kept.
 *
 * Clause 21 is unsatisfiable on an Italian project because the Area dropdown is hidden — see
 * defect O-2.
 *
 * Clause 3 checks the Threshold Individual error even in Other OPEX mode, where the whole
 * Threshold block is hidden; a hidden control's `Value` is blank, so the clause passes.
 */
export function canSaveOpexCost(form: OpexForm, ctx: SaveGateContext): boolean {
  const { selected, costsInScope: scope, countryName, locale } = ctx;

  const numeric: [OpexNumericField, string][] = [
    ["fixCosts", form.fixCosts],
    ["percentOfRevenues", form.percentOfRevenues],
    ["thresholdIndividual", form.thresholdIndividual],
    ["eurPerMwh", form.eurPerMwh],
    ["eurPerWtg", form.eurPerWtg],
    ["eurPerMw", form.eurPerMw],
  ];
  if (numeric.some(([f, v]) => validateOpexNumber(f, v, locale) !== null)) return false;

  const description = form.description.trim();
  if (description === "") return false;
  if (descriptionHasReservedStandard(form.description)) return false;
  if (selected === null && scope.some((c) => c.description === description)) return false;

  if (toDate(form.startDate) === null) return false;
  if (form.durationYears === null || form.durationMonths === null) return false;
  if (form.durationYears === 0 && form.durationMonths === 0) return false;

  if (form.currencyId === null) return false;
  if (form.aggregation === null) return false;
  if (form.distributionFrequency === null) return false;

  if (form.thresholdOn && form.thresholdType === null) return false;
  if (form.thresholdType === THRESHOLD_TYPE.individual
    && form.thresholdIndividual.trim() === "") return false;

  const figures = [
    form.fixCosts, form.percentOfRevenues, form.eurPerMwh, form.eurPerMw, form.eurPerWtg,
  ];
  if (figures.every((v) => v.trim() === "")) return false;

  if (form.inflationOn) {
    if (form.inflationStartYear.trim() === "") return false;
    if (validateInflationStartYear(form.inflationStartYear) !== null) return false;
    if (validateOpexNumber("inflationProfile", form.inflationProfile, locale) !== null) return false;
    if (form.inflationProfile.trim() === "") return false;
  }

  if (countryName === "Italy" && form.inflationOn && form.useCountryInflationProfile) {
    if (form.inflationCountryArea === null || form.inflationCountryArea === "") return false;
  }
  return true;
}

/**
 * Every error the panel should be showing, in field order.
 *
 * NEW — no canvas equivalent. The canvas has no error list: each `*_ErrorMessage` label computes
 * itself and a required field left BLANK shows nothing while still disabling Save, because every
 * `.Visible` requires `Not(IsBlank(value))`. That is the same D-4 gap the Contracts panel has.
 * Reporting blank required fields is a deliberate divergence; nothing here changes what saves.
 */
export interface FieldError { field: string; message: string }

/**
 * The two messages the Description label USED to carry, before they were commented out
 * (`lbl_…_Description_ErrorMessage.Text`, `:5561-5577`). They are the canvas' own wording for
 * the two states the live Save gate still enforces silently — blank, and a duplicate within the
 * card — so they are reused here rather than invented.
 */
export const OPEX_DESCRIPTION_MSG = {
  /** `$"Value cannot be blank"` — the commented-out first branch. */
  blank: "Value cannot be blank",
  /** `$"A period with the same description already exists."` — the commented-out second branch. */
  duplicate: "A period with the same description already exists.",
} as const;

export function opexFormErrors(form: OpexForm, ctx: SaveGateContext): FieldError[] {
  const errors: FieldError[] = [];
  const push = (field: string, message: string | null) => {
    if (message !== null) errors.push({ field, message });
  };

  push("description", descriptionError(form.description));
  if (form.description.trim() === "") {
    errors.push({ field: "description", message: OPEX_DESCRIPTION_MSG.blank });
  } else if (ctx.selected === null
    && ctx.costsInScope.some((c) => c.description === form.description.trim())) {
    errors.push({ field: "description", message: OPEX_DESCRIPTION_MSG.duplicate });
  }
  push("startDate", startDateError(form.startDate));
  push("fixCosts", validateOpexNumber("fixCosts", form.fixCosts, ctx.locale));
  push("percentOfRevenues",
    validateOpexNumber("percentOfRevenues", form.percentOfRevenues, ctx.locale));
  push("eurPerMwh", validateOpexNumber("eurPerMwh", form.eurPerMwh, ctx.locale));
  push("eurPerMw", validateOpexNumber("eurPerMw", form.eurPerMw, ctx.locale));
  push("eurPerWtg", validateOpexNumber("eurPerWtg", form.eurPerWtg, ctx.locale));
  if (form.thresholdOn) {
    push("thresholdType", thresholdTypeError(form.thresholdType));
    push("thresholdIndividual",
      validateOpexNumber("thresholdIndividual", form.thresholdIndividual, ctx.locale));
  }
  if (form.inflationOn) {
    push("inflationStartYear", validateInflationStartYear(form.inflationStartYear));
    push("inflationProfile",
      validateOpexNumber("inflationProfile", form.inflationProfile, ctx.locale));
  }
  return errors;
}

/* ══════════════════════════════════════════════════════════════ the payload ══ */

/**
 * `Name` on a hand-entered cost (`pcf_…_BodyButtons_Save.OnChange`, `:8695`):
 *
 * `If(IsBlank(locSelectedDeviceTypeInProject),
 *     locSelectedAccount.Name & "-" & locSelectedSubaccount.Name & "-" & <raw Description>,
 *     locSelectedSubaccount.Name & "-" & locSelectedDeviceTypeInProject.Name & "-" & <raw Description>)`
 *
 * The device branch uses the DEVICE ROW's `Name` (e.g. `WTG 1`), not the turbine-type label the
 * card header shows. Note the description is interpolated UNTRIMMED into `Name` while
 * `Description` is written `Trim(…)` — a trailing space survives in one column and not the other.
 */
export function costName(
  parts: { accountName: string; subaccountName: string; deviceName: string | null },
  rawDescription: string,
): string {
  return parts.deviceName === null || parts.deviceName === ""
    ? `${parts.accountName}-${parts.subaccountName}-${rawDescription}`
    : `${parts.subaccountName}-${parts.deviceName}-${rawDescription}`;
}

/** `DeviceTypeInProject` is the selected device in O&M and blank in Other OPEX. */
export function deviceTypeForSave(
  mode: OpexMode,
  selectedDeviceId: string | null,
): string | null {
  return mode === "om" ? selectedDeviceId : null;
}

export interface OpexCostWrite {
  subaccountId: string | null;
  deviceTypeInProjectId: string | null;
  name: string;
  description: string;
  startDate: string | null;
  durationYears: number | null;
  durationMonths: number | null;
  currencyId: string | null;
  fixCosts: number | null;
  percentOfRevenues: number | null;
  threshold: boolean;
  thresholdType: number | null;
  thresholdIndividual: number | null;
  eurPerMwh: number | null;
  eurPerMw: number | null;
  eurPerWtg: number | null;
  aggregation: number | null;
  parentCostId: string | null;
  useInflationProfile: boolean;
  useCountryInflationProfile: boolean;
  inflationProfile: number | null;
  inflationStartYear: number | null;
  inflationCountryArea: string | null;
  distributionFrequency: number | null;
  owningBusinessUnitId: string | null;
  alignWithProjectDuration: boolean;
  isStartDateStandardAssumption: boolean;
  externalContract: boolean;
  timeZoneRuleVersionNumber: number;
}

/**
 * The save payload, field for field (`pcf_…_BodyButtons_Save.OnChange`, `:8695`).
 *
 * The three conditional writes are the ones to keep: `'Inflation Profile'` and
 * `'Inflation Start Year'` are written `Blank()` unless the Inflation Profile toggle is on, and
 * `'Inflation Country Area'` is written `Blank()` unless the COUNTRY inflation toggle is on. So
 * switching inflation off clears the stored profile rather than leaving a stale one.
 *
 * `Value("")` in Power Fx is `Blank()`, which is why every money field maps an empty string to
 * `null` rather than to 0.
 *
 * `'Is Standard Contract?'` is NOT in the payload — a hand-saved row never becomes a standard
 * one, and editing is blocked on rows that already are.
 */
export function opexCostWrite(
  form: OpexForm,
  ctx: {
    mode: OpexMode;
    accountName: string;
    subaccount: OpexSubaccount;
    deviceTypeInProjectId: string | null;
    deviceName: string | null;
    parent: OpexCost | null;
    isStartDateStandardAssumption: boolean;
    owningBusinessUnitId: string | null;
    locale?: string;
  },
): OpexCostWrite {
  const n = (v: string): number | null => {
    const parsed = parseNumber(v, ctx.locale);
    return parsed === undefined ? null : parsed;
  };
  const start = toDate(form.startDate);
  return {
    subaccountId: ctx.subaccount.id,
    deviceTypeInProjectId: deviceTypeForSave(ctx.mode, ctx.deviceTypeInProjectId),
    name: costName(
      {
        accountName: ctx.accountName,
        subaccountName: ctx.subaccount.name,
        deviceName: deviceTypeForSave(ctx.mode, ctx.deviceTypeInProjectId) === null
          ? null
          : ctx.deviceName,
      },
      form.description,
    ),
    description: form.description.trim(),
    startDate: start === null
      ? null
      : `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${
        String(start.getDate()).padStart(2, "0")}`,
    durationYears: form.durationYears,
    durationMonths: form.durationMonths,
    currencyId: form.currencyId,
    fixCosts: n(form.fixCosts),
    percentOfRevenues: n(form.percentOfRevenues),
    threshold: form.thresholdOn,
    thresholdType: form.thresholdType,
    thresholdIndividual: n(form.thresholdIndividual),
    eurPerMwh: n(form.eurPerMwh),
    eurPerMw: n(form.eurPerMw),
    eurPerWtg: n(form.eurPerWtg),
    aggregation: form.aggregation,
    parentCostId: ctx.parent?.id ?? null,
    useInflationProfile: form.inflationOn,
    useCountryInflationProfile: form.useCountryInflationProfile,
    inflationProfile: form.inflationOn ? n(form.inflationProfile) : null,
    inflationStartYear: form.inflationOn ? n(form.inflationStartYear) : null,
    inflationCountryArea: form.useCountryInflationProfile ? form.inflationCountryArea : null,
    distributionFrequency: form.distributionFrequency,
    owningBusinessUnitId: ctx.owningBusinessUnitId,
    alignWithProjectDuration: form.alignWithProjectDuration,
    isStartDateStandardAssumption: inheritStartDateStandard(
      ctx.parent,
      ctx.isStartDateStandardAssumption,
    ),
    externalContract: form.externalContract,
    timeZoneRuleVersionNumber: TIME_ZONE_RULE_VERSION_NUMBER,
  };
}

/* ══════════════════════════════════════════════════════════════════ the row ══ */

export interface OpexRow {
  id: string;
  /** A row whose Description starts with "Standard" renders italic and in the link colour. */
  standard: boolean;
  selected: boolean;
  /** Whether the amber "does not align" info button shows beside it. */
  warnAlignment: boolean;
  cells: Record<string, string>;
}

/**
 * One rendered table row.
 *
 * `Italic: StartsWith(ThisItem.Description, "Standard")` and the matching `Color` switch to
 * `themePrimary` on every cell (`:1493`, `:1508` and eleven siblings). Note this is the
 * DESCRIPTION, case-sensitive, and it is independent of `'Is Standard Contract?'` — a row typed
 * by hand as "Standard cover" would render as one, which is why the panel refuses the word.
 *
 * `Duration` occupies two cells — `{years} years` and `{months} months` — each of which the
 * canvas suppresses entirely when its column is blank (`:1970-1973`, `:2011-2014`).
 */
export function toOpexRow(args: {
  cost: OpexCost;
  mode: OpexMode;
  selectedId: string | null;
  project: Pick<OpexProjectContext, "countryName" | "areaStateProvince" | "projectStartDate" | "endDate">;
  /** The rows of the card this one is drawn in, for the alignment warning. */
  cardCosts: readonly OpexCost[];
}): OpexRow {
  const { cost, mode, selectedId, project, cardCosts } = args;
  const end = periodEndDate(cost);
  return {
    id: cost.id,
    standard: cost.description.startsWith("Standard"),
    selected: cost.id === selectedId,
    warnAlignment: mode === "om"
      ? omAlignWarningVisible(cardCosts, project)
      : otherAlignWarningVisible(cost, cardCosts, project),
    cells: {
      description: cost.description,
      startDate: formatTableDate(cost.startDate),
      durationYears: cost.durationYears === null || cost.durationYears === undefined
        ? "" : `${cost.durationYears} years`,
      durationMonths: cost.durationMonths === null || cost.durationMonths === undefined
        ? "" : `${cost.durationMonths} months`,
      endDate: end === null ? "" : formatTableDate(end),
      currency: cost.currencyName ?? "",
      inflationProfile: inflationColumnText(cost, project),
      fixCosts: formatWholeNumber(cost.fixCosts),
      percentOfRevenues: formatRevenuePercent(cost.percentOfRevenues),
      threshold: thresholdColumnText(cost),
      eurPerMwh: formatWholeNumber(cost.eurPerMwh),
      eurPerMw: formatWholeNumber(cost.eurPerMw),
      eurPerWtg: formatWholeNumber(cost.eurPerWtg),
      aggregation: cost.aggregation === null || cost.aggregation === undefined
        ? "" : OPEX_AGGREGATION_LABEL[cost.aggregation] ?? "",
      distributionFrequency: cost.distributionFrequency === null
        || cost.distributionFrequency === undefined
        ? "" : String(cost.distributionFrequency),
    },
  };
}

/**
 * `btn_…_CostsTableRow_TransparentButton.OnSelect` (`:2150-2200`, `:4608-4650`) — selecting a row
 * TOGGLES: clicking the already-selected row clears the selection, the card and the candidate
 * description; clicking another row selects it and recomputes `locCandidateOpexCostDesc` and
 * `locSelectedOpexCostParent`.
 */
export interface RowSelection {
  selectedId: string | null;
  scopeId: string | null;
  candidateDescription: string;
  parentCostId: string | null;
}

export function toggleRowSelection(args: {
  current: RowSelection;
  row: OpexCost;
  cardScopeId: string;
}): RowSelection {
  const { current, row, cardScopeId } = args;
  if (current.selectedId === row.id) {
    return { selectedId: null, scopeId: null, candidateDescription: "", parentCostId: null };
  }
  return {
    selectedId: row.id,
    scopeId: cardScopeId,
    candidateDescription: nextPeriodDescription(row.description),
    parentCostId: row.parentCostId,
  };
}
