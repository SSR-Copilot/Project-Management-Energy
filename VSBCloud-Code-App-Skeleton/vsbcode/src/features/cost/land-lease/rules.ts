/**
 * Land Lease Costs Screen — every business rule as a pure function.
 *
 * Canvas screen: `Land Lease Costs Screen` (Project Costs app)
 *   201 controls · 6 169 lines of Power Fx · 61 substantive blocks · band L
 *
 * The shape that makes this screen surprising: the CONTRACT header (description, currency,
 * up to three one-time payments, Secured, the WTG allocation and the inflation settings)
 * lives on `Land Lease Project Costs`, while the recurring economics (start date, duration,
 * the five rates, aggregation, frequency) live on `Land Lease Periods`. ONE right panel
 * edits both and decides which table to write from whether the selected period is Period 1
 * — see `writesContractHeader`, the single most surprising rule here.
 *
 * WHAT WAS DELETED AS A WORKAROUND
 *  · the hard-coded test-project GUID fallback;
 *  · the canvas' two-step `Filter(Periods, 'Project Cost' in colLandLeaseProjectCosts…)`
 *    load, replaced by one server-side filter on the parent cost's project.
 *
 * ONE CANVAS DEFECT IS CORRECTED HERE, flagged with `// SOURCE DEFECT:` — the Period-9 wrap.
 */
import { addMonths } from "@/domain/dates";
import { isBlank, pfxRound } from "@/domain/numeric";
import { CHOICE_COST } from "@/data/entities";

/* ══════════════════════════════════════════════════════════════════════ types ════ */

export interface LandLeaseSubaccount {
  id: string;
  name: string;
  order: number;
  /** `AddColumns('Land Lease Subaccounts', IsFolded, true)` — cards start collapsed. */
  isFolded: boolean;
}

export interface LandLeaseCost {
  id: string;
  name: string;
  description: string;
  subaccountId: string | null;
  landOwner: string | null;
  currencyId: string | null;
  secured: number | null;
  allWtgAllocated: boolean;
  isStandardContract: boolean;
  isStartDateStandardAssumption: boolean;
  amountOneTimePayment: number | null;
  amountOneTimePayment2: number | null;
  amountOneTimePayment3: number | null;
  dueDateOneTimePayment: string | null;
  dueDateOneTimePayment2: string | null;
  dueDateOneTimePayment3: string | null;
  useInflationProfile: boolean;
  useCountryInflationProfile: boolean;
  inflationProfile: number | null;
  inflationCountryArea: number | null;
  inflationStartYear: number | null;
}

export interface LandLeasePeriod {
  id: string;
  name: string;
  projectCostId: string | null;
  /** `Land Lease Period` option-set value. */
  period: number | null;
  startDate: string | null;
  durationYears: number | null;
  durationMonths: number | null;
  fixedCosts: number | null;
  percentOfRevenues: number | null;
  eurPerMwh: number | null;
  eurPerMw: number | null;
  eurPerWtg: number | null;
  aggregation: number | null;
  distributionFrequency: number | null;
}

export interface LandLeaseContract {
  cost: LandLeaseCost;
  /** Sorted by period number ascending. */
  periods: LandLeasePeriod[];
}

export interface AllocationRow {
  id: string;
  projectCostId: string | null;
  generatorInProjectId: string | null;
}

export interface GeneratorOption {
  id: string;
  label: string;
  order: number;
  kind: "wtg" | "pv";
}

/* ═══════════════════════════════════════════════════════════════════ messages ════ */

export const LEASE_MSG = {
  /** `lbl_LandLease_RightPanel_NewEditCost_BodyContent_DueDate_ErrorMessage_1.Text` — verbatim. */
  dueDateFormat: "Due Date must be in format MM/YYYY.",
  /** `cmp_LandLease_PopUpConfirmation_DeleteLandLeaseCost.Title` — verbatim. */
  deleteContractTitle: "Delete Land Lease?",
  /**
   * `cmp_LandLease_PopUpConfirmation_DeleteLandLeaseCost.Description` — the canvas body for
   * this dialog.
   */
  deleteContractBody: "This deletes the contract and all related Periods?",
  /** `cmp_LandLease_PopUpConfirmation_DeletePeriod.Title` — verbatim. */
  deletePeriodTitle: "Delete Period?",
  /**
   * `cmp_LandLease_PopUpConfirmation_DeletePeriod.Description` — the canvas body for this
   * dialog.
   */
  deletePeriodBody: "This deletes only the selected period.",
  saveFailed:
    "Error: Land Lease Period could not be saved correctly. Your changes are still in the "
    + "panel — try again, or copy them somewhere safe before closing it.",
  /**
   * NEW — no canvas equivalent: explains why the standard-assumption apply is refused; the
   * canvas wrote a blank row
   */
  noStandardAssumption:
    "No Land Lease standard assumption exists for this country, technology and sub-account.",
} as const;

/* ══════════════════════════════════════════════════════ sub-accounts / model ════ */

/** `Sort(AddColumns('Land Lease Subaccounts', IsFolded, true), Order, Ascending)`. */
export function orderedSubaccounts(
  rows: Omit<LandLeaseSubaccount, "isFolded">[],
): LandLeaseSubaccount[] {
  return [...rows]
    .sort((a, b) => a.order - b.order)
    .map((r) => ({ ...r, isFolded: true }));
}

const PERIOD_VALUES: number[] = [
  CHOICE_COST.landLeasePeriod.period1, CHOICE_COST.landLeasePeriod.period2,
  CHOICE_COST.landLeasePeriod.period3, CHOICE_COST.landLeasePeriod.period4,
  CHOICE_COST.landLeasePeriod.period5, CHOICE_COST.landLeasePeriod.period6,
  CHOICE_COST.landLeasePeriod.period7, CHOICE_COST.landLeasePeriod.period8,
  CHOICE_COST.landLeasePeriod.period9,
];

/** `'Land Lease Period'.'Period n'` → n (1…9), or 0 when the value is not a period. */
export function periodNumber(period: number | null | undefined): number {
  if (period === null || period === undefined) return 0;
  const i = PERIOD_VALUES.indexOf(period);
  return i < 0 ? 0 : i + 1;
}

export function periodValue(n: number): number | null {
  return n >= 1 && n <= 9 ? PERIOD_VALUES[n - 1] : null;
}

export const isPeriodOne = (period: number | null | undefined) => periodNumber(period) === 1;

/**
 * Rule 7 — the next period number.
 *
 * SOURCE DEFECT: the canvas' `Switch` maps `'Period 8' → 'Period 9'` and then, in its
 * DEFAULT arm, `'Period 9' → 'Period 1'` — a tenth period silently becomes a SECOND
 * Period 1 in the same contract, which corrupts the chain (the choice set stops at
 * Period 9, so the intended behaviour beyond nine is genuinely undefined — source
 * ambiguity 11). Corrected here: `nextPeriod` returns `null` at Period 9 and "Add Period"
 * is disabled. `nextPeriodCanvasParity` keeps the wrapping behaviour reachable.
 */
export function nextPeriod(current: number | null | undefined): number | null {
  const n = periodNumber(current);
  if (n === 0) return CHOICE_COST.landLeasePeriod.period1;
  if (n >= 9) return null;
  return periodValue(n + 1);
}

/** The canvas behaviour: Period 9 wraps back to Period 1. Parity only. */
export function nextPeriodCanvasParity(current: number | null | undefined): number {
  const n = periodNumber(current);
  if (n === 0 || n >= 9) return CHOICE_COST.landLeasePeriod.period1;
  return periodValue(n + 1)!;
}

/** Contracts are `{ cost, periods }` with the periods ordered by period number. */
export function buildContracts(
  costs: LandLeaseCost[],
  periods: LandLeasePeriod[],
): LandLeaseContract[] {
  return costs.map((cost) => ({
    cost,
    periods: periods
      .filter((p) => p.projectCostId === cost.id)
      .sort((a, b) => periodNumber(a.period) - periodNumber(b.period)),
  }));
}

export function contractsForSubaccount(
  contracts: LandLeaseContract[],
  subaccountId: string,
): LandLeaseContract[] {
  return contracts.filter((c) => c.cost.subaccountId === subaccountId);
}

export function lastPeriod(contract: LandLeaseContract): LandLeasePeriod | null {
  return contract.periods.length === 0
    ? null
    : contract.periods[contract.periods.length - 1];
}

export function firstPeriod(contract: LandLeaseContract): LandLeasePeriod | null {
  return contract.periods[0] ?? null;
}

/** Rule 19 — Period 1 must carry at least one of the five rates before a period is added. */
export function firstPeriodHasRate(contract: LandLeaseContract): boolean {
  const p = firstPeriod(contract);
  if (!p) return false;
  return [p.fixedCosts, p.percentOfRevenues, p.eurPerMw, p.eurPerMwh, p.eurPerWtg]
    .some((v) => v !== null && v !== undefined);
}

/**
 * Rule 2 — PERIOD 1 OWNS THE CONTRACT.
 *
 * `Land Lease Project Costs` is written ONLY when there is no selected cost (a brand-new
 * contract) or the selected period is Period 1; the `Land Lease Periods` patch always runs.
 * Editing period 2+ therefore cannot change the contract header — the canvas achieves this
 * by silently not writing those fields, which is why the panel disables the whole contract
 * section instead (see `PeriodPanel`).
 */
export function writesContractHeader(
  selectedPeriod: Pick<LandLeasePeriod, "period"> | null,
  isNewContract: boolean,
): boolean {
  if (isNewContract) return true;
  return isPeriodOne(selectedPeriod?.period ?? null);
}

/** Rule 3 — `Name` convention. `Description` is NOT trimmed here, unlike OPEX. */
export function landLeaseCostName(
  projectName: string,
  subaccountName: string,
  description: string,
): string {
  return `${projectName}-${subaccountName}-${description}`;
}

/**
 * Rule 8 — the auto-numbered period name. When the previous name already ends in
 * `" - <digits>"` and no Period-1 sibling exists, the trailing number increments; otherwise
 * `" - 2"` is appended.
 */
export function nextPeriodName(previousName: string, hasPeriod1Sibling: boolean): string {
  const m = /^(.*) - (\d+)$/.exec(previousName);
  if (m && !hasPeriod1Sibling) return `${m[1]} - ${Number(m[2]) + 1}`;
  return `${previousName} - 2`;
}

/* ═══════════════════════════════════════════════════ rules 4–6 · the header ════ */

export interface OneTimePayments {
  dueDate: string;
  amount: string;
  dueDate2: string;
  amount2: string;
  dueDate3: string;
  amount3: string;
}

/**
 * Rule 4 — the one-time payments are all-or-nothing on the toggle: turning it OFF writes
 * all six fields blank.
 */
export function oneTimePaymentPayload(
  enabled: boolean,
  values: OneTimePayments,
): {
  dueDate: string | null; amount: number | null;
  dueDate2: string | null; amount2: number | null;
  dueDate3: string | null; amount3: number | null;
} {
  const money = (v: string) => (isBlank(v) ? null : Number(v));
  const text = (v: string) => (isBlank(v) ? null : v);
  if (!enabled) {
    return {
      dueDate: null, amount: null, dueDate2: null,
      amount2: null, dueDate3: null, amount3: null,
    };
  }
  return {
    dueDate: text(values.dueDate), amount: money(values.amount),
    dueDate2: text(values.dueDate2), amount2: money(values.amount2),
    dueDate3: text(values.dueDate3), amount3: money(values.amount3),
  };
}

/** Rule 5 — the 2nd / 3rd payment blocks appear only when BOTH their fields hold data. */
export function showSecondPayment(cost: Pick<LandLeaseCost,
  "amountOneTimePayment2" | "dueDateOneTimePayment2"> | null): boolean {
  return !isBlank(cost?.amountOneTimePayment2 ?? null)
    && !isBlank(cost?.dueDateOneTimePayment2 ?? null);
}

export function showThirdPayment(cost: Pick<LandLeaseCost,
  "amountOneTimePayment3" | "dueDateOneTimePayment3"> | null): boolean {
  return !isBlank(cost?.amountOneTimePayment3 ?? null)
    && !isBlank(cost?.dueDateOneTimePayment3 ?? null);
}

/** Rule 6 — `Secured` is a Yes/No CHOICE written from a toggle, not a boolean column. */
export function securedValue(checked: boolean): number {
  return checked ? CHOICE_COST.landLeaseSecured.yes : CHOICE_COST.landLeaseSecured.no;
}

const MM_YYYY = /^(0[1-9]|1[0-2])\/[0-9]{4}$/;

/**
 * The due-date validator. The canvas field is a free-text `TextInput` and
 * `'Due Date One-Time Payment'` is written from its raw value.
 *
 * SOURCE AMBIGUITY 5: the Dataverse column type is not visible in the app source. The code
 * app uses a month picker backed by this normalised string and keeps the message as the
 * fallback parse error for legacy values already stored.
 */
export function validateDueDate(value: string): string | null {
  if (isBlank(value)) return null;
  return MM_YYYY.test(value) ? null : LEASE_MSG.dueDateFormat;
}

/* ══════════════════════════════════════════════════ rules 9–12 · allocation ════ */

/** Rule 9 — the allocation is a DIFF, not a replace. Both halves ride in one `$batch`. */
export function diffAllocation(
  existing: AllocationRow[],
  selectedGeneratorIds: string[],
): { toCreate: string[]; toDelete: string[] } {
  const have = new Set(
    existing.map((a) => a.generatorInProjectId).filter((x): x is string => x !== null),
  );
  const want = new Set(selectedGeneratorIds);
  return {
    toCreate: selectedGeneratorIds.filter((id) => !have.has(id)),
    toDelete: existing
      .filter((a) => a.generatorInProjectId === null || !want.has(a.generatorInProjectId))
      .map((a) => a.id),
  };
}

/** Rule 10 — `AllWTGAllocated` is derived from the selection, not stored as a list. */
export function allWtgSelected(selectedIds: string[], allIds: string[]): boolean {
  return allIds.length > 0 && selectedIds.length === allIds.length;
}

/** Rule 11 — the allocation controls are editable only on Period 1 or a brand-new cost. */
export function allocationEditable(
  selectedPeriod: Pick<LandLeasePeriod, "period"> | null,
  isNewContract: boolean,
): boolean {
  return isNewContract || isPeriodOne(selectedPeriod?.period ?? null);
}

/** Rule 12 — the allocation block only renders for Wind or PV projects. */
export function allocationVisible(technology: string | null | undefined): boolean {
  const t = (technology ?? "").toLowerCase();
  return t === "wind" || t === "pv";
}

/**
 * The WTG picker list: generators labelled `${name} - ${status}` ordered by the numeric
 * suffix after the last `_`, then PV modules labelled by their type label.
 */
export function generatorOptions(
  generators: { id: string; name: string; status: string | null }[],
  pvModules: { id: string; label: string }[],
): GeneratorOption[] {
  const wtg = generators
    .map((g) => ({
      id: g.id,
      label: `${g.name} - ${g.status ?? ""}`.trim(),
      order: Number(g.name.split("_").pop()) || 0,
      kind: "wtg" as const,
    }))
    .sort((a, b) => a.order - b.order);
  const pv = pvModules.map((p, i) => ({
    id: p.id, label: p.label, order: wtg.length + i, kind: "pv" as const,
  }));
  return [...wtg, ...pv];
}

/** Rule 9's join `Name` convention. */
export function allocationName(
  landOwner: string | null,
  description: string,
  generatorName: string,
): string {
  return `${landOwner ?? ""}-${description}-${generatorName}`;
}

/* ══════════════════════════════════════════════ rules 13–17 · standard load ════ */

export interface LandLeaseAssumption {
  id: string;
  /** `'Opex & Land Lease Period'` value — TEN periods on this side. */
  period: number;
  description: string;
  durationYears: number | null;
  durationMonths: number | null;
  aggregation: number | null;
  secured: boolean;
  allWtgAllocated: boolean;
  fixCosts: number | null;
  percentOfRevenues: number | null;
  eurPerMwh: number | null;
  eurPerMw: number | null;
  eurPerWtg: number | null;
  amountOneTimePayment: number | null;
  amountOneTimePayment2: number | null;
  amountOneTimePayment3: number | null;
  distributionFrequency: number | null;
  useInflationProfile: boolean;
  useCountryInflationProfile: boolean;
  inflationProfile: number | null;
}

/** Rule 13 — period 1 at COD, later periods chained by the previous period's duration. */
export function standardPeriodStarts(
  codDate: string | Date,
  assumptions: Pick<LandLeaseAssumption, "period" | "durationYears" | "durationMonths">[],
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

const OPEX_PERIOD_VALUES: number[] = [
  CHOICE_COST.opexLandLeasePeriod.period1, CHOICE_COST.opexLandLeasePeriod.period2,
  CHOICE_COST.opexLandLeasePeriod.period3, CHOICE_COST.opexLandLeasePeriod.period4,
  CHOICE_COST.opexLandLeasePeriod.period5, CHOICE_COST.opexLandLeasePeriod.period6,
  CHOICE_COST.opexLandLeasePeriod.period7, CHOICE_COST.opexLandLeasePeriod.period8,
  CHOICE_COST.opexLandLeasePeriod.period9, CHOICE_COST.opexLandLeasePeriod.period10,
];

/**
 * Rule 14 — the enumeration mapping between the assumption side and the child side.
 * `'Opex & Land Lease Period'` has TEN values, `'Land Lease Period'` has nine, so
 * Period 10 has nowhere to go and falls to the canvas' default of Period 1.
 */
export function mapAssumptionPeriod(assumptionPeriod: number): number {
  const i = OPEX_PERIOD_VALUES.indexOf(assumptionPeriod);
  if (i < 0 || i > 8) return CHOICE_COST.landLeasePeriod.period1;
  return PERIOD_VALUES[i];
}

/** `'Opex Aggregation'.MAX/MIN/SUM` → `'Land Lease Aggregation'.MAX/MIN/SUM` — same values. */
export function mapAggregation(opexAggregation: number | null): number | null {
  return opexAggregation;
}

/** The two-option booleans on the assumptions table become 952850000-band choices. */
export function mapSecured(secured: boolean): number {
  return secured ? CHOICE_COST.landLeaseSecured.yes : CHOICE_COST.landLeaseSecured.no;
}

export const mapAllWtgAllocated = (allWtg: boolean): boolean => allWtg;

/**
 * Rule 15 — the standard load rounds money THROUGH TEXT:
 * `Value(Text(x, "##0.00"))` for the one-time payments, `Value(Text(x, "#0.00"))` for
 * `Fixed Costs`. Both are a two-decimal normalisation.
 */
export function roundTwoDecimals(value: number | null | undefined): number | null {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return pfxRound(value, 2);
}

/** Rule 16 — allocate every WTG when the assumption says so. */
export function planStandardAllocation(
  allWtgAllocated: boolean,
  generators: GeneratorOption[],
): string[] {
  return allWtgAllocated ? generators.map((g) => g.id) : [];
}

/** Rule 17 — identical to the OPEX screen's inflation resolution. */
export function resolveInflationProfile(
  assumption: Pick<LandLeaseAssumption,
    "useInflationProfile" | "useCountryInflationProfile" | "inflationProfile">,
  countryProfile: number | null,
): number | null {
  if (!assumption.useInflationProfile) return null;
  return assumption.useCountryInflationProfile ? countryProfile : assumption.inflationProfile;
}

export function inflationStartYear(codDate: string | Date | null): number | null {
  if (!codDate) return null;
  const d = codDate instanceof Date ? codDate : new Date(codDate);
  return Number.isNaN(d.getTime()) ? null : d.getFullYear() + 1;
}

export const LEASE_STANDARD_STAMP = {
  isStandardContract: true,
  isStartDateStandardAssumption: true,
} as const;

/* ═══════════════════════════════════════════════════════ rule 18 · delete ════ */

export interface LeaseDeletePlan {
  kind: "period" | "contract";
  periodIds: string[];
  allocationIds: string[];
  costIds: string[];
}

/**
 * Rule 18 — the delete branches on the period NUMBER.
 * Period 2+ removes only that `Land Lease Periods` row; Period 1 cascades the allocations,
 * every period and the cost itself — all in one atomic batch.
 */
export function planDelete(
  contract: LandLeaseContract,
  selectedPeriod: LandLeasePeriod,
  allocations: AllocationRow[],
): LeaseDeletePlan {
  if (!isPeriodOne(selectedPeriod.period)) {
    return {
      kind: "period", periodIds: [selectedPeriod.id], allocationIds: [], costIds: [],
    };
  }
  return {
    kind: "contract",
    periodIds: contract.periods.map((p) => p.id),
    allocationIds: allocations
      .filter((a) => a.projectCostId === contract.cost.id)
      .map((a) => a.id),
    costIds: [contract.cost.id],
  };
}

export function deleteDialog(
  selectedPeriod: Pick<LandLeasePeriod, "period"> | null,
): { title: string; body: string } {
  return isPeriodOne(selectedPeriod?.period ?? null)
    ? { title: LEASE_MSG.deleteContractTitle, body: LEASE_MSG.deleteContractBody }
    : { title: LEASE_MSG.deletePeriodTitle, body: LEASE_MSG.deletePeriodBody };
}

/* ═══════════════════════════════════════════════════════════ command gating ════ */

export interface LeasePermissions {
  canCreateCost: boolean;
  canCreatePeriod: boolean;
  canEditRecord: boolean;
  canDeleteRecord: boolean;
}

/** Standard rows are locked: `'Is Standard Contract?' = Yes` or a `"Standard"` name. */
export function isStandardLocked(
  contract: LandLeaseContract | null,
  period: LandLeasePeriod | null,
): boolean {
  return Boolean(contract?.cost.isStandardContract)
    || Boolean(period?.name.startsWith("Standard"));
}

export interface LeaseCommandGates {
  addContractType: boolean;
  addPeriod: boolean;
  addStandardContract: boolean;
  edit: boolean;
  delete: boolean;
}

/**
 * `pcf_con_LandLease_Content_Subaccounts_CardBody_SubaccountsCommandBar_1.Items`.
 *
 * Every command is scoped to its own card — `inScope` is
 * `locSelectedLandLeaseSubaccount.'Land Lease Subaccount' = ThisItem.…`.
 */
export function leaseCommands(args: {
  contract: LandLeaseContract | null;
  selectedPeriod: LandLeasePeriod | null;
  costsInSubaccount: LandLeaseCost[];
  hasMatchingAssumption: boolean;
  permissions: LeasePermissions;
  inScope: boolean;
  nothingSelected: boolean;
}): LeaseCommandGates {
  const {
    contract, selectedPeriod, costsInSubaccount, hasMatchingAssumption,
    permissions, inScope, nothingSelected,
  } = args;
  const locked = isStandardLocked(contract, selectedPeriod);
  const isLast = contract !== null && selectedPeriod !== null
    && lastPeriod(contract)?.id === selectedPeriod.id;

  return {
    // "Add Contract Type": create permission, no standard contract in the sub-account,
    // and nothing selected on this card.
    addContractType: permissions.canCreateCost
      && !costsInSubaccount.some((c) => c.isStandardContract)
      && nothingSelected,
    // "Add Period": create permission on the PERIODS table, the last period selected,
    // Period 1 must carry a rate (rule 19), the row must not be standard, and — the
    // corrected Period-9 cap — a next period must exist.
    addPeriod: inScope
      && permissions.canCreatePeriod
      && isLast
      && !locked
      && contract !== null
      && firstPeriodHasRate(contract)
      && nextPeriod(selectedPeriod?.period ?? null) !== null,
    // "Add Standard Contract": an assumption must exist AND the sub-account must be empty.
    addStandardContract: permissions.canCreateCost
      && hasMatchingAssumption
      && costsInSubaccount.length === 0,
    edit: inScope && permissions.canEditRecord && selectedPeriod !== null && !locked,
    // A standard chain can only be deleted from Period 1.
    delete: inScope && permissions.canDeleteRecord && selectedPeriod !== null
      && (!locked || isPeriodOne(selectedPeriod.period)),
  };
}

/* ═══════════════════════════════════════════════════════════════ save gate ════ */

export interface LandLeaseForm {
  description: string;
  currencyId: string | null;
  securedChecked: boolean;
  oneTimePaymentsOn: boolean;
  payments: OneTimePayments;
  allWtgAllocated: boolean;
  allocatedGeneratorIds: string[];
  startDate: string | null;
  durationYears: number | null;
  durationMonths: number | null;
  fixedCosts: string;
  percentOfRevenues: string;
  eurPerMwh: string;
  eurPerMw: string;
  eurPerWtg: string;
  aggregation: number | null;
  distributionFrequency: number | null;
}

export const LEASE_RANGES = {
  fixedCosts: { min: 0, max: 1_000_000_000 },
  percentOfRevenues: { min: 0, max: 10_000 },
  eurPerMwh: { min: 0, max: 1_000_000_000 },
  eurPerMw: { min: 0, max: 1_000_000_000 },
  eurPerWtg: { min: 0, max: 1_000_000_000 },
  amount: { min: 0, max: 1_000_000_000 },
} as const;

export type LeaseNumericField = keyof typeof LEASE_RANGES;

export const LEASE_NUMERIC_MSG = {
  /** `lbl_LandLease_RightPanel_NewEditPeriod_BodyContent_EuroMW_ErrorMessage_1.Text` — verbatim. */
  twoDecimal: "Value must be a numeric with two decimal place.",
  range: (max: number, language = "en-US") =>
    `Value must be between 0 and ${
      new Intl.NumberFormat(language, {
        minimumFractionDigits: 1, maximumFractionDigits: 2,
      }).format(max)
    }.`,
} as const;

/** `fn_Numeric_LL` — `IsTwoDecimal` then `InRange`, the same pattern as the OPEX screen. */
export function validateLeaseNumber(
  field: LeaseNumericField,
  value: string,
  language = "en-US",
): string | null {
  if (isBlank(value)) return null;
  const sep = language.startsWith("en") ? "\\." : ",";
  if (!new RegExp(`^[+-]?\\d+(?:${sep}\\d{0,2})?$`).test(value)) {
    return LEASE_NUMERIC_MSG.twoDecimal;
  }
  const n = Number(value.replace(",", "."));
  const spec = LEASE_RANGES[field];
  if (Number.isNaN(n) || n < spec.min || n > spec.max) {
    return LEASE_NUMERIC_MSG.range(spec.max, language);
  }
  return null;
}

/**
 * `pcf_LandLease_RightPanel_NewEditPeriod_BodyButtons_Save_1.DisplayMode` — 151 lines in
 * the canvas: the description must be non-blank and EVERY error label must be hidden.
 */
export function canSaveLandLease(form: LandLeaseForm, language = "en-US"): boolean {
  if (isBlank(form.description.trim())) return false;

  const numeric: [LeaseNumericField, string][] = [
    ["fixedCosts", form.fixedCosts],
    ["percentOfRevenues", form.percentOfRevenues],
    ["eurPerMwh", form.eurPerMwh],
    ["eurPerMw", form.eurPerMw],
    ["eurPerWtg", form.eurPerWtg],
  ];
  if (numeric.some(([f, v]) => validateLeaseNumber(f, v, language) !== null)) return false;

  if (form.oneTimePaymentsOn) {
    const amounts: string[] = [
      form.payments.amount, form.payments.amount2, form.payments.amount3,
    ];
    if (amounts.some((v) => validateLeaseNumber("amount", v, language) !== null)) return false;
    const dates = [
      form.payments.dueDate, form.payments.dueDate2, form.payments.dueDate3,
    ];
    if (dates.some((v) => validateDueDate(v) !== null)) return false;
  }
  return true;
}

/**
 * Rule 20 — after every save both collections are fully reloaded and the SELECTION IS
 * CLEARED. In the code app that is `invalidateQueries` plus resetting the selection state;
 * this predicate exists so the behaviour is testable.
 */
export const clearsSelectionAfterSave = true;
