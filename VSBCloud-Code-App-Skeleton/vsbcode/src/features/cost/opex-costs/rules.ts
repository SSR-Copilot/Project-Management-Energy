/**
 * Opex Costs Screen — every business rule as a pure function.
 *
 * Canvas screen: `Opex Costs Screen` (Project Costs app)
 *   230 controls · 8 147 lines of Power Fx · 65 substantive blocks · band L
 *
 * ONE SCREEN, TWO RAIL ITEMS. `LeftNavigationMenu` gives both `O&MKey`
 * ("Operation & Maintenance") and `OtherOpexCostsKey` ("Other OPEX Costs") the same
 * `TargetScreen: 'Opex Costs Screen'`; `cmp_Left_Navigation.OnSelect` only guards on
 * `Self.SelectedKey <> gblLeftNavigationSelected.ItemKey`, so picking the other row
 * re-`Navigate`s to the SAME screen and re-runs `OnVisible`, which re-derives the mode from
 * `gblLeftNavigationSelected.ItemDisplayName`.
 *
 * In the code app the mode comes from the ROUTE (`/costs/opex/om`, `/costs/opex/other`) and
 * is passed in as a prop, not from a display string — see `modeFromNavKey` for the rail-key
 * mapping the canvas relied on. That is a deliberate behaviour change: switching modes no
 * longer forces a full reload (source ambiguity 2).
 *
 * WHAT WAS DELETED AS A WORKAROUND
 *  · the hidden `tab_OpexCosts_Content_OpexAccounts` (`Visible: false`) in-screen account
 *    switcher, superseded by the rail;
 *  · `txt_OpexCosts_Content_OpexAccounts_DO_NOT_DELETE`, whose own comment reads
 *    "Require to workaround MS bug with downloading only needed (column) data";
 *  · the hard-coded test-project GUID fallback.
 *
 * TWO CANVAS DEFECTS ARE CORRECTED HERE, both flagged with `// SOURCE DEFECT:`.
 */
import { addMonths } from "@/domain/dates";
import { isBlank, isDecimalWithPlaces, inRange, parseNumber } from "@/domain/numeric";
import {
  CHOICE_COST, OPEX_MODE_NAMES, DISTRIBUTION_FREQUENCY,
} from "@/data/entities";

/* ══════════════════════════════════════════════════════════════════════ mode ════ */

/** The route's prop. The canvas keyed this off a display string; we key it off the route. */
export type OpexMode = "om" | "other";

/** The rail keys the canvas navigated with, so a deep link by `ItemKey` still resolves. */
export const NAV_KEY_TO_MODE: Record<string, OpexMode> = {
  "O&MKey": "om",
  OtherOpexCostsKey: "other",
};

export function modeFromNavKey(key: string | null | undefined): OpexMode | null {
  if (!key) return null;
  return NAV_KEY_TO_MODE[key] ?? null;
}

/** The `ItemDisplayName` each mode corresponds to — the canvas' actual discriminator. */
export const MODE_DISPLAY_NAME: Record<OpexMode, string> = {
  om: OPEX_MODE_NAMES.oandm,
  other: OPEX_MODE_NAMES.other,
};

export interface OpexAccount { id: string; name: string; order: number }
export interface OpexSubaccount {
  id: string; name: string; order: number; accountId: string | null; accountName: string | null;
}

/**
 * Rule 1 — `locSelectedAccount`.
 *
 * `colOpexAccounts = Sort('Opex Accounts', Order, Ascending)`, then O&M takes
 * `First(colOpexAccounts)` and Other OPEX takes `Last(colOpexAccounts)`.
 *
 * SOURCE AMBIGUITY 1: that "O&M is first by Order, Other OPEX is last" assumption is DATA,
 * not code, and could not be verified from the canvas source. `selectedAccount` therefore
 * prefers a NAME match and only falls back to the positional rule, so a re-ordered table
 * cannot silently select the wrong account.
 */
export function selectedAccount(
  accounts: OpexAccount[],
  mode: OpexMode,
): OpexAccount | null {
  if (accounts.length === 0) return null;
  const sorted = [...accounts].sort((a, b) => a.order - b.order);
  const byName = sorted.find((a) => a.name === MODE_DISPLAY_NAME[mode]);
  if (byName) return byName;
  return mode === "om" ? sorted[0] : sorted[sorted.length - 1];
}

/** `locSelectedSubaccountOandM: If(varSelectedSubaccount.Name = "Operation & Maintenance", …)`. */
export function isOandMSubaccount(subaccount: { name: string } | null): boolean {
  return subaccount?.name === OPEX_MODE_NAMES.oandm;
}

/**
 * Rule 2 — the `Threshold` and `% of Revenues` columns exist only in O&M mode.
 * The canvas collapses them to `Width: 0`; in React they are simply omitted.
 */
export function showThresholdColumns(mode: OpexMode): boolean {
  return mode === "om";
}

/** The Other-OPEX gallery filters `Account.Name = "Other OPEX Costs"`. */
export function subaccountsForMode(
  subaccounts: OpexSubaccount[],
  mode: OpexMode,
): OpexSubaccount[] {
  if (mode === "om") return subaccounts;
  return subaccounts
    .filter((s) => s.accountName === OPEX_MODE_NAMES.other)
    .sort((a, b) => a.order - b.order);
}

/* ═══════════════════════════════════════════════════ rule 3 · device list ════ */

export interface DeviceTypeInProject {
  id: string;
  name: string;
  /** `AsType(TypeInProject, …)` target id. */
  typeInProjectId: string | null;
  kind: "generator" | "pv";
  /** The generator's `Created On`, used only for the generator ordering. */
  createdOn: string | null;
  isFolded: boolean;
}

/**
 * Rule 3 — WTG types via `AsType(TypeInProject, GeneratorTypeInProjects)` sorted by the
 * GENERATOR's `Created On` ascending, then the PV module types appended, each `IsFolded`.
 */
export function deviceTypeList(
  generators: Omit<DeviceTypeInProject, "kind" | "isFolded">[],
  pvModules: Omit<DeviceTypeInProject, "kind" | "isFolded">[],
): DeviceTypeInProject[] {
  const gen = [...generators]
    .sort((a, b) => (a.createdOn ?? "").localeCompare(b.createdOn ?? ""))
    .map((d) => ({ ...d, kind: "generator" as const, isFolded: true }));
  const pv = pvModules.map((d) => ({ ...d, kind: "pv" as const, isFolded: true }));
  return [...gen, ...pv];
}

/** The O&M empty state, reworded: the code app has no "refresh this page" step. */
export const O_AND_M_EMPTY_STATE =
  "Add a generator on the Generators screen to enter Operation & Maintenance costs.";

/** The canvas string, kept so the divergence is visible. */
export const O_AND_M_EMPTY_STATE_CANVAS =
  "Please add a generator and refresh this page to enter Operation & Maintenance costs";

/* ══════════════════════════════════════════════════════════════ cost model ════ */

export interface OpexCost {
  id: string;
  name: string;
  description: string;
  parentCostId: string | null;
  subaccountId: string | null;
  deviceTypeInProjectId: string | null;
  startDate: string | null;
  durationYears: number | null;
  durationMonths: number | null;
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
  inflationStartYear: number | null;
  inflationCountryArea: number | null;
  alignWithProjectDuration: boolean;
  externalContract: boolean;
  isStandardContract: boolean;
  isStartDateStandardAssumption: boolean;
}

export interface OpexChain {
  root: OpexCost;
  /** Root FIRST, then the children sorted by `Name` ascending. */
  periods: OpexCost[];
}

/**
 * `groupChains` — a cost type is a row with a blank `'Parent Cost'`; every later period is
 * a row whose `'Parent Cost'` points at it.
 *
 * NOTE ON `lastPeriod`: the canvas computes it as
 * `Last(Sort(Filter(costs, 'Parent Cost' = firstPeriod), Name, Asc))`, which is BLANK for a
 * cost type that has no second period — so `locLastPeriod.'Opex Project Cost' = selected`
 * is false and "Add Period" would never enable on a brand-new one-period cost type. The
 * root is included in `periods` here so a single-period chain is its own last period.
 */
export function groupChains(costs: OpexCost[]): OpexChain[] {
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

export function lastPeriod(chain: OpexChain): OpexCost {
  return chain.periods[chain.periods.length - 1];
}

export function chainOf(chains: OpexChain[], costId: string): OpexChain | null {
  return chains.find((c) => c.periods.some((p) => p.id === costId)) ?? null;
}

/**
 * Rule 4 — a new period starts where the previous one ends:
 * `DateAdd(startDate, years*12 + months, TimeUnit.Months)`.
 * A brand-new cost type starts at `locCODDate`.
 */
export function nextStartDate(
  previous: Pick<OpexCost, "startDate" | "durationYears" | "durationMonths"> | null,
  codDate: string | null,
): Date | null {
  if (!previous?.startDate) return codDate ? new Date(codDate) : null;
  const months = (previous.durationYears ?? 0) * 12 + (previous.durationMonths ?? 0);
  return addMonths(new Date(previous.startDate), months);
}

/**
 * Rule 5 — choosing a start date by hand clears the standard-assumption flag on it, but
 * only for a chain ROOT; a child period inherits its parent's flag (rule 13).
 */
export function startDateStandardFlagAfterManualChange(
  parentCostId: string | null,
): boolean {
  return parentCostId !== null;
}

/** Rule 13 — `Coalesce(parent.IsStartDateStandardAssumption, locIsStartDate…)`. */
export function inheritStartDateStandard(
  parent: Pick<OpexCost, "isStartDateStandardAssumption"> | null,
  own: boolean,
): boolean {
  return parent ? parent.isStartDateStandardAssumption : own;
}

/* ═══════════════════════════════════════════════════════ command gating ════ */

export interface OpexPermissions {
  canCreate: boolean;
  canEditRecord: boolean;
  canDeleteRecord: boolean;
}

/** Rule 7 — a standard-created row is read-only. */
export function isStandardLocked(cost: Pick<OpexCost, "isStandardContract" | "name">): boolean {
  return cost.isStandardContract || cost.name.startsWith("Standard");
}

/**
 * Rule 6 — only the LAST period of a chain can be extended.
 * Rule 7 — a standard row cannot be extended at all.
 */
export function canAddPeriod(
  chain: OpexChain | null,
  selected: OpexCost | null,
  permissions: OpexPermissions,
): boolean {
  if (!chain || !selected || !permissions.canCreate) return false;
  if (isStandardLocked(selected)) return false;
  return lastPeriod(chain).id === selected.id;
}

/** Rule 7 — Edit is blocked on standard rows and requires the record's edit privilege. */
export function canEditCost(
  selected: OpexCost | null,
  permissions: OpexPermissions,
): boolean {
  if (!selected || !permissions.canEditRecord) return false;
  return !isStandardLocked(selected);
}

/**
 * Rule 7 — Delete of a STANDARD chain is allowed only on the chain root
 * (`If(StartsWith(Lower(Description), "standard"), IsBlank('Parent Cost'), true)`).
 *
 * The canvas' O&M command bar carries NO `RecordInfo` check at all while the Other-OPEX bar
 * does. That asymmetry is normalised to the Other-OPEX behaviour — Dataverse rejects the
 * write anyway, so the only effect of the canvas version is a misleading enabled button
 * (UT-OPEX-044).
 */
export function canDeleteCost(
  selected: OpexCost | null,
  permissions: OpexPermissions,
): boolean {
  if (!selected || !permissions.canDeleteRecord) return false;
  const standard = isStandardLocked(selected)
    || selected.description.toLowerCase().startsWith("standard");
  return standard ? selected.parentCostId === null : true;
}

/**
 * Rule 8 — "Add Standard Contract" is enabled only when NO `Opex Project Costs` row exists
 * for the scope at all. A manually created cost in that sub-account or on that device type
 * blocks the standard load entirely.
 */
export function canAddStandardContract(
  costsInScope: OpexCost[],
  permissions: OpexPermissions,
): boolean {
  return permissions.canCreate && costsInScope.length === 0;
}

/** Every command is scoped to the card it is drawn in. */
export function commandsInScope(
  selectedScopeId: string | null,
  cardScopeId: string,
): boolean {
  return selectedScopeId === cardScopeId;
}

export interface OpexCommandGates {
  addContractType: boolean;
  addPeriod: boolean;
  addStandardContract: boolean;
  edit: boolean;
  delete: boolean;
}

/**
 * The two command bars. The O&M bar has FOUR commands — the device type IS the contract
 * type, so there is no "Add Contract Type"; the Other-OPEX bar has five.
 */
export function opexCommands(args: {
  mode: OpexMode;
  chain: OpexChain | null;
  selected: OpexCost | null;
  costsInScope: OpexCost[];
  permissions: OpexPermissions;
  inScope: boolean;
}): OpexCommandGates {
  const { mode, chain, selected, costsInScope, permissions, inScope } = args;
  const scoped = <T,>(v: T, fallback: T): T => (inScope ? v : fallback);
  return {
    // Only the Other-OPEX bar renders this one.
    addContractType: mode === "other" && permissions.canCreate,
    addPeriod: scoped(canAddPeriod(chain, selected, permissions), false),
    addStandardContract: canAddStandardContract(costsInScope, permissions),
    edit: scoped(canEditCost(selected, permissions), false),
    delete: scoped(canDeleteCost(selected, permissions), false),
  };
}

/** Duplicate-description guard on "Add Period". */
export function descriptionIsFree(
  candidate: string,
  costsInScope: Pick<OpexCost, "description">[],
): boolean {
  return !costsInScope.some((c) => c.description === candidate);
}

/* ══════════════════════════════════════════════ rules 9–11 · standard load ════ */

export interface OpexAssumption {
  id: string;
  period: number;
  durationYears: number | null;
  durationMonths: number | null;
  typeOfContract: number | null;
  countryId: string | null;
  technology: string | null;
  opexSubaccountId: string | null;
  description: string;
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
  inflationCountryArea: number | null;
  alignWithProjectDuration: boolean;
  externalContract: boolean;
}

/**
 * The standard-assumption filter differs by mode: O&M matches country + technology only,
 * Other OPEX adds the card's own sub-account.
 */
export function standardAssumptionFilter(
  mode: OpexMode,
  scope: { countryId: string | null; technology: string | null; subaccountId: string | null },
): {
  typeOfContract: number;
  countryId: string | null;
  technology: string | null;
  opexSubaccountId: string | null;
} {
  return {
    typeOfContract: mode === "om"
      ? CHOICE_COST.typeOfContract.opexOandM
      : CHOICE_COST.typeOfContract.opexOther,
    countryId: scope.countryId,
    technology: scope.technology,
    opexSubaccountId: mode === "om" ? null : scope.subaccountId,
  };
}

export function matchesStandardAssumption(
  assumption: OpexAssumption,
  filter: ReturnType<typeof standardAssumptionFilter>,
): boolean {
  if (assumption.typeOfContract !== filter.typeOfContract) return false;
  if (assumption.countryId !== filter.countryId) return false;
  if ((assumption.technology ?? "").toLowerCase()
    !== (filter.technology ?? "").toLowerCase()) return false;
  if (filter.opexSubaccountId !== null
    && assumption.opexSubaccountId !== filter.opexSubaccountId) return false;
  return true;
}

/**
 * Rule 9 — period 1 starts at COD; every later period starts where the previous one ended.
 * The canvas computes period ≥ 3 from `Last(Sort(colOtherOpexPeriods, Period, Asc))`, i.e.
 * from the growing local collection; chaining the array is the same arithmetic.
 */
export function standardPeriodStarts(
  codDate: string | Date,
  assumptions: Pick<OpexAssumption, "period" | "durationYears" | "durationMonths">[],
): { period: number; startDate: Date }[] {
  const ordered = [...assumptions].sort((a, b) => a.period - b.period);
  const out: { period: number; startDate: Date }[] = [];
  let cursor = codDate instanceof Date ? new Date(codDate.getTime()) : new Date(codDate);
  for (const a of ordered) {
    out.push({ period: a.period, startDate: new Date(cursor.getTime()) });
    cursor = addMonths(cursor, (a.durationYears ?? 0) * 12 + (a.durationMonths ?? 0));
  }
  return out;
}

/** `recCODYear = Year('Operations start date (COD)') + 1`. */
export function inflationStartYear(codDate: string | Date | null): number | null {
  if (!codDate) return null;
  const d = codDate instanceof Date ? codDate : new Date(codDate);
  return Number.isNaN(d.getTime()) ? null : d.getFullYear() + 1;
}

/**
 * Rule 10 — inflation resolution.
 *   both flags Yes → the `Country Inflation Profiles` row for COD year + 1
 *   inflation Yes, country No → the assumption's own profile
 *   inflation No → blank
 */
export function resolveInflationProfile(
  assumption: Pick<OpexAssumption,
    "useInflationProfile" | "useCountryInflationProfile" | "inflationProfile">,
  countryProfile: number | null,
): number | null {
  if (!assumption.useInflationProfile) return null;
  return assumption.useCountryInflationProfile ? countryProfile : assumption.inflationProfile;
}

/** Rule 11 — every standard-created row is stamped. */
export const STANDARD_STAMP = {
  isStandardContract: true,
  isStartDateStandardAssumption: true,
} as const;

/**
 * Rule 14 — `'Time Zone Rule Version Number': 4` is written literally on every
 * `Opex Project Costs` patch.
 *
 * SOURCE AMBIGUITY 4: there is no comment explaining it and no equivalent on any other
 * table. It looks like a workaround for a Dataverse date-shift issue. It is preserved as a
 * named constant so it can be removed in one place once the column is checked against the
 * metadata — `timezoneruleversionnumber` is a platform column and is normally server-managed.
 */
export const TIME_ZONE_RULE_VERSION_NUMBER = 4;

/**
 * Rule 12 — saving a cost cascades TEN fields onto every child period. Rates, dates and
 * durations are NOT cascaded. The canvas issues one `Patch` per child inside a `ForAll`;
 * this returns the payload so the mutation can send them in a single `$batch`.
 */
export const CASCADED_FIELDS = [
  "useInflationProfile", "useCountryInflationProfile", "inflationProfile",
  "inflationStartYear", "inflationCountryArea", "threshold", "thresholdIndividual",
  "thresholdType", "alignWithProjectDuration", "externalContract",
] as const;

export type CascadePayload = Pick<OpexCost, (typeof CASCADED_FIELDS)[number]>;

export function cascadeToChildren(
  saved: OpexCost,
  children: OpexCost[],
): { id: string; payload: CascadePayload }[] {
  if (children.length === 0) return [];
  const payload = Object.fromEntries(
    CASCADED_FIELDS.map((k) => [k, saved[k]]),
  ) as unknown as CascadePayload;
  return children.map((c) => ({ id: c.id, payload }));
}

/* ══════════════════════════════════════════════════════ rule 15 · delete ════ */

/** Deleting a chain ROOT deletes the whole chain; deleting a leaf deletes only that row. */
export function planDeleteCost(
  chains: OpexChain[],
  selected: OpexCost,
): { ids: string[]; cascades: boolean } {
  if (selected.parentCostId !== null) return { ids: [selected.id], cascades: false };
  const chain = chains.find((c) => c.root.id === selected.id);
  return { ids: chain ? chain.periods.map((p) => p.id) : [selected.id], cascades: true };
}

/**
 * SOURCE DEFECT: `cmp_OpexCosts_PopUpConfirmation_DeleteCost.Description` is
 * `If(IsBlank(locSelectedOpexCost), "…and all its related periods?", "…cost?")` — it tests
 * the SELECTED COST rather than its `'Parent Cost'`, so the "and all its related periods"
 * wording is unreachable (a delete is only ever raised with a selection), while the
 * `OnConfirm` DOES cascade on `IsBlank(locSelectedOpexCost.'Parent Cost')`. The dialog
 * therefore promises a single-row delete and performs a cascade.
 *
 * Corrected here to branch on the parent, so the warning matches the action
 * (UT-OPEX-047). `deleteDialogTextCanvasParity` keeps the canvas wording reachable.
 */
export const DELETE_DIALOG = {
  /**
   * CANVAS DIVERGENCE — see deleteDialogTextCanvasParity; canvas text: "\"Cost and all its
   * related periods?" (`cmp_OpexCosts_PopUpConfirmation_DeleteCost.Description`, which names
   * the cost inline and tests the wrong record).
   */
  cascade: "Delete this cost and all its related periods?",
  /**
   * CANVAS DIVERGENCE — see deleteDialogTextCanvasParity; canvas text: "\" cost?" (the second
   * branch of `cmp_OpexCosts_PopUpConfirmation_DeleteCost.Description`).
   */
  single: "Delete this cost?",
} as const;

export function deleteDialogText(selected: OpexCost | null): string {
  return selected?.parentCostId === null ? DELETE_DIALOG.cascade : DELETE_DIALOG.single;
}

/** The canvas behaviour, kept reachable for a parity test. */
export function deleteDialogTextCanvasParity(selected: OpexCost | null): string {
  return selected === null ? DELETE_DIALOG.cascade : DELETE_DIALOG.single;
}

/* ══════════════════════════════════════════════ rule 16 · duration badge ════ */

export type DurationBadge = "none" | "match" | "mismatch";

const ymd = (d: Date) =>
  `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;

/** `DateAdd(DateAdd(start, years*12 + months, Months), -1, Days)` — day-precision. */
export function periodEndDate(
  period: Pick<OpexCost, "startDate" | "durationYears" | "durationMonths">,
): Date | null {
  if (!period.startDate) return null;
  const start = new Date(period.startDate);
  if (Number.isNaN(start.getTime())) return null;
  const end = addMonths(start, (period.durationYears ?? 0) * 12 + (period.durationMonths ?? 0));
  end.setDate(end.getDate() - 1);
  return end;
}

/**
 * Rule 16 — the "Duration Match" badge, per sub-account.
 *
 * For every cost type take its LAST period, then compare
 * `start + (years*12 + months) months − 1 day` to the project end date as `yyyy/mm/dd`
 * strings, additionally requiring `start >= 'Project Start Date'`.
 *
 * `match`    — every last period, aligned or not, lands on the project end;
 * `mismatch` — at least one ALIGNED cost type does not;
 * `none`     — nothing to judge, or only unaligned cost types miss (the canvas leaves the
 *              fill transparent in that third case, which is what `none` renders).
 */
export function durationBadge(
  subaccountCosts: OpexCost[],
  project: { projectStartDate: string | null; endDate: string | null },
): DurationBadge {
  if (subaccountCosts.length === 0 || !project.endDate) return "none";
  const chains = groupChains(subaccountCosts);
  if (chains.length === 0) return "none";

  const projectEnd = new Date(project.endDate);
  const projectStart = project.projectStartDate ? new Date(project.projectStartDate) : null;
  if (Number.isNaN(projectEnd.getTime())) return "none";

  let allLand = true;
  let alignedMisses = false;
  for (const chain of chains) {
    const period = lastPeriod(chain);
    const end = periodEndDate(period);
    const start = period.startDate ? new Date(period.startDate) : null;
    const lands = end !== null
      && ymd(end) === ymd(projectEnd)
      && start !== null
      && (projectStart === null || start.getTime() >= projectStart.getTime());
    if (!lands) {
      allLand = false;
      if (period.alignWithProjectDuration) alignedMisses = true;
    }
  }
  if (allLand) return "match";
  return alignedMisses ? "mismatch" : "none";
}

/* ═══════════════════════════════════════════════════ naming and payloads ════ */

/** Rule 18 — `Description` is TRIMMED on save while `Name` is built from the raw value. */
export function costName(
  mode: OpexMode,
  parts: { accountName: string; subaccountName: string; deviceName: string | null },
  rawDescription: string,
): string {
  return mode === "om"
    ? `${parts.subaccountName}-${parts.deviceName ?? ""}-${rawDescription}`
    : `${parts.accountName}-${parts.subaccountName}-${rawDescription}`;
}

/** The standard-contract loader's own name shape in Other mode. */
export function standardCostName(subaccountName: string, description: string): string {
  return `${OPEX_MODE_NAMES.other}-${subaccountName}-${description}`;
}

/** `DeviceTypeInProject` is the selected device in O&M mode and blank in Other mode. */
export function deviceTypeForSave(
  mode: OpexMode,
  selectedDeviceId: string | null,
): string | null {
  return mode === "om" ? selectedDeviceId : null;
}

/* ═════════════════════════════════════════════════════ validation gating ════ */

export const OPEX_RANGES = {
  fixCosts: { min: 0, max: 1_000_000_000, places: 2 as const },
  percentOfRevenues: { min: 0, max: 10_000, places: 2 as const },
  eurPerMwh: { min: 0, max: 1_000_000_000, places: 2 as const },
  eurPerMw: { min: 0, max: 1_000_000_000, places: 2 as const },
  eurPerWtg: { min: 0, max: 1_000_000_000, places: 2 as const },
  thresholdIndividual: { min: 0, max: 10_000_000, places: 2 as const },
} as const;

export type OpexNumericField = keyof typeof OPEX_RANGES;

export const OPEX_MSG = {
  /** `lbl_OpexCosts_RightPanel_NewEditCost_BodyContent_EuroPerMw_ErrorMessage.Text` — verbatim. */
  twoDecimal: "Value must be a numeric with two decimal place.",
  range: (max: number, language = "en-US") =>
    `Value must be between 0 and ${
      new Intl.NumberFormat(language, {
        minimumFractionDigits: 1, maximumFractionDigits: 2,
      }).format(max)
    }.`,
  /** `lbl_OpexCosts_RightPanel_NewEditCost_BodyContent_StartDate_ErrorMessage.Text` — verbatim. */
  blankDate: "Value cannot be blank",
  saveFailed:
    "Error: OPEX cost could not be saved correctly. Your changes are still in the panel — "
    + "try again, or copy them somewhere safe before closing it.",
} as const;

/** `fn_Numeric_Opex` — two decimals, then the range. */
export function validateOpexNumber(
  field: OpexNumericField,
  value: string,
  language = "en-US",
): string | null {
  if (isBlank(value)) return null;
  const spec = OPEX_RANGES[field];
  if (!isDecimalWithPlaces(value, spec.places, language)) return OPEX_MSG.twoDecimal;
  if (!inRange(value, spec.min, spec.max, language)) return OPEX_MSG.range(spec.max, language);
  return null;
}

/**
 * SOURCE DEFECT: `lbl_OpexCosts_RightPanel_NewEditCost_BodyContent_StartDate_ErrorMessage`
 * has `Visible = Not(IsBlank(dte_…StartDate.SelectedDate))` while its `Text` is
 * `If(IsBlank(dte_…SelectedDate), "Value cannot be blank")` — the label renders EMPTY when a
 * date IS chosen and hides when it is missing. The save gate independently requires a
 * non-blank date, so the bug is cosmetic. Corrected here (UT-OPEX-046);
 * `startDateErrorVisibleCanvasParity` keeps the canvas behaviour reachable.
 */
export function startDateError(date: string | Date | null): string | null {
  return isBlank(date as unknown) || date === null ? OPEX_MSG.blankDate : null;
}
export const startDateErrorVisibleCanvasParity = (date: string | Date | null) => date !== null;

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
  inflationCountryArea: number | null;
  isNew: boolean;
}

/**
 * `pcf_OpexCosts_RightPanel_NewEditCost_BodyButtons_Save.DisplayMode`, transcribed.
 *
 * Note the two clauses that are easy to lose: at least one of the five RATE fields must be
 * filled, and an Italian project with BOTH inflation toggles on must also carry an
 * `Inflation Country Area`.
 */
export function canSaveOpexCost(
  form: OpexForm,
  project: { countryName: string | null },
  existingDescriptions: string[],
  language = "en-US",
): boolean {
  const numericFields: [OpexNumericField, string][] = [
    ["fixCosts", form.fixCosts],
    ["percentOfRevenues", form.percentOfRevenues],
    ["eurPerMwh", form.eurPerMwh],
    ["eurPerMw", form.eurPerMw],
    ["eurPerWtg", form.eurPerWtg],
    ["thresholdIndividual", form.thresholdIndividual],
  ];
  if (numericFields.some(([f, v]) => validateOpexNumber(f, v, language) !== null)) return false;

  if (isBlank(form.description.trim())) return false;
  if (form.isNew && existingDescriptions.includes(form.description.trim())) return false;

  if (isBlank(form.startDate)) return false;
  if (form.durationYears === null || form.durationMonths === null) return false;
  if (form.durationYears === 0 && form.durationMonths === 0) return false;

  if (form.currencyId === null) return false;
  if (form.aggregation === null) return false;
  if (form.distributionFrequency === null) return false;

  if (form.thresholdOn) {
    if (form.thresholdType === null) return false;
    if (form.thresholdType === CHOICE_COST.thresholdType.individual
      && isBlank(form.thresholdIndividual)) return false;
  }

  const rates = [
    form.fixCosts, form.percentOfRevenues, form.eurPerMwh, form.eurPerMw, form.eurPerWtg,
  ];
  if (!rates.some((r) => !isBlank(r))) return false;

  if (form.inflationOn) {
    if (isBlank(form.inflationStartYear) || isBlank(form.inflationProfile)) return false;
    if (Number.isNaN(parseNumber(form.inflationProfile, language))) return false;
    if (project.countryName === "Italy"
      && form.useCountryInflationProfile
      && form.inflationCountryArea === null) return false;
  }
  return true;
}

/* ═══════════════════════════════════════════════════════════════ ordering ════ */

/**
 * `Sort(Sort(Filter(...), 'Start Date', Asc), Description, Asc)` — the OUTER sort wins, so
 * the list is by `Description` with `Start Date` as the tie-break.
 */
export function sortCosts(costs: OpexCost[]): OpexCost[] {
  return [...costs].sort((a, b) =>
    a.description.localeCompare(b.description)
    || (a.startDate ?? "").localeCompare(b.startDate ?? ""));
}

export function costsForDevice(costs: OpexCost[], deviceId: string): OpexCost[] {
  return sortCosts(costs.filter((c) => c.deviceTypeInProjectId === deviceId));
}

export function costsForSubaccount(costs: OpexCost[], subaccountId: string): OpexCost[] {
  return sortCosts(costs.filter((c) => c.subaccountId === subaccountId));
}

/** Rule 17 — the frequency list, declared inline as `locColDistributionFrequency`. */
export const OPEX_DISTRIBUTION_FREQUENCY = DISTRIBUTION_FREQUENCY;
