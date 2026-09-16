/**
 * Project Finance Screen — every business rule as a pure function.
 *
 * Canvas screen: `Project Finance Screen` (PM app)
 *   604 controls · 14 328 lines of Power Fx · 186 substantive blocks · band XL
 *
 * The debt-and-equity structuring workspace: six `Financing Categories` (1 Equity,
 * 2 VAT-Financing, 3 Senior Debt, 4 DSRA/DSRF, 5 Decommissioning, 6 Cash Sweep) as
 * collapsible cards, each with its own right-hand form. On every visit the screen derives
 * a complete set of country- and technology-specific standard assumptions from
 * `Assumptions Debt SQL` and, where a `Financing Inputs` row for a category does not yet
 * exist, CREATES it pre-populated with them. Senior Debt is the only multi-row category.
 *
 * WHAT WAS DELETED AS A WORKAROUND
 *  - The `With({varLang: …}, Switch(varLang, "en", Value(x), Value(Substitute(x,".",","))))`
 *    wrapper, repeated around every one of the 27 senior-debt fields and again for
 *    DSRA/DSRF and Decommissioning. One `assumptionNumber`, imported from the Revenues
 *    feature so the two screens cannot drift apart.
 *  - Five copies of `If(CountIf('Financing Inputs', …) = 0, IfError(Patch(…), Notify(…)))`
 *    in `OnVisible` — a write-on-read that races when two users open the screen at once.
 *    `planSeeds` returns the rows that are MISSING; `hooks.ts` issues them as one batch
 *    and the spec's `vsb_EnsureFinancingInputs` custom API is the production home for it.
 *  - The four verbatim copies of the repayment-profile regeneration (tenor YY/MM,
 *    start-repayment YY/MM `OnChange`) plus a fifth on the profile radio.
 *    `regenerateRepaymentYears` is called from all five.
 *  - `colIndexedBackup`, a collection that existed only to survive a `ClearCollect` of
 *    the collection being rebuilt. The regeneration is a pure function of the old array.
 *  - `locIsSavingSeniorDebtTranche`, a context-variable re-entrancy guard cleared on
 *    every exit path — now `isSaving` in the store (`canSaveSeniorDebtTranche` still
 *    takes it as a term, because the canvas `DisplayMode` does).
 *  - `OnHidden`, which blanks 13 context variables and clears 9 collections. Query-cache
 *    keys carry the project id, so nothing leaks between projects (UT-FIN-103 @ut-ref spec
 *    case; no `it()` carries it — see the same note in hooks.ts).
 *  - `con_FinancingInput_SeniorDebtCalculationStatus`, whose `.Visible` is hard-coded
 *    `false` with its real predicate commented out (source ambiguity 11). Not ported.
 *
 * SOURCE DEFECTS — each is commented at its rule, canvas behaviour kept reachable:
 *  1. ambiguity 2 — `MarginDSRA` reads `category = "margin dsrf"`, identical to
 *     `MarginDSRF`. No `"margin dsra"` row is looked up anywhere in the screen.
 *     `buildDsraStandard` reads `"margin dsra"` with a documented fall-back to
 *     `"margin dsrf"`; `marginDsraCanvasParity` is the shipped behaviour.
 *  2. ambiguity 3 — `OnVisible` unconditionally patches `'Financing Options' =
 *     'Debt Financing'`, overwriting a user's `All Equity` choice on every visit.
 *     `financingOptionOnVisit` guards it: the patch fires only when the column is blank.
 *  3. ambiguity 8 — the swap rate has no fallback after 2030. `swapRateForYear` returns
 *     `null` and `SWAP_RATE_LAST_YEAR` names the cliff so a test fails when it arrives.
 *  4. ambiguity 9 — two control names contradict their bodies
 *     (`pcf_btn_GeneralData_RightPanel_Equity_Form_Buttons_Save_1` saves DSRA/DSRF).
 *     Everything below is named after what the formula DOES.
 *
 * No flow is called from this screen. `brief.py` reports `FLOWS: none` and no `.Run(`
 * occurs in `Project Finance Screen.pa.yaml`.
 */
import {
  parseNumber, isNumeric, isInteger, inRange, isDecimalWithPlaces, isBlank,
  decimalSeparator, pfxRound, formatInteger, type Lang,
} from "@/domain/numeric";
import { addDays, addMonths, addYears, toMMYY, fromMMYY } from "@/domain/dates";
import { CHOICE_FINANCE } from "@/data/entities";
import {
  assumptionNumber, pageLock as revenuePageLock, isPageLocked as revenueIsPageLocked,
  type RevenueProject,
} from "@/features/pm/revenues/rules";

/* ═════════════════════════════════════════════════════════════════════ types ════ */

/** `locProjectTechnology = Lower(Text(gblRecordSelectedProject.Technology))`. */
export type DebtTech = "wind" | "pv" | "other";

/** One row of `Assumptions Debt SQL`. `wind` / `pv` are SQL *strings*. */
export interface DebtAssumptionRow {
  country: string;
  debttype: string;
  category: string;
  wind: string | null;
  pv: string | null;
}

/** The project columns this screen reads off `gblRecordSelectedProject`. */
export interface FinanceProject extends RevenueProject {
  /** `'Financing Options'` — the option-set value, or null when never set. */
  financingOptions: number | null;
}

export interface FinancingCategory {
  id: string;
  name: string;
  order: number;
}

/* ═════════════════════════════════════════════════════════════════ page lock ════ */

/**
 * Validation — `con_Milestones_Page_LockMessage_8.Visible` is the IDENTICAL formula to
 * the Revenues screen's `…_7`. Imported rather than re-typed so the two screens cannot
 * drift apart; the spec's implementation step 14 asks for exactly that.
 */
export const pageLock = revenuePageLock;
export const isPageLocked = revenueIsPageLocked;
export const PAGE_LOCK_TITLE =
  "This page is locked. To unlock it, please complete the following sections:";

/* ══════════════════════════════════════════════════════════════ category map ═══ */

export interface CategoryMap {
  equity: FinancingCategory | null;
  vatFinancing: FinancingCategory | null;
  seniorDebt: FinancingCategory | null;
  dsraDsrf: FinancingCategory | null;
  decommissioning: FinancingCategory | null;
  cashSweep: FinancingCategory | null;
}

/**
 * Rule 1 — the category map is built by `Order`, NOT by name.
 * `{Equity: LookUp(col, Order = 1), VATFinancing: … 2, SeniorDebt: … 3,
 *   Decommissioning: … 5, DSRA_DSRF: … 4, CashSweep: … 6}`.
 * Note the inversion: Decommissioning is Order 5 and DSRA/DSRF is Order 4.
 */
export const CATEGORY_ORDER = {
  equity: 1, vatFinancing: 2, seniorDebt: 3, dsraDsrf: 4, decommissioning: 5, cashSweep: 6,
} as const;

export function buildCategoryMap(categories: readonly FinancingCategory[]): CategoryMap {
  const by = (o: number) => categories.find((c) => c.order === o) ?? null;
  return {
    equity: by(CATEGORY_ORDER.equity),
    vatFinancing: by(CATEGORY_ORDER.vatFinancing),
    seniorDebt: by(CATEGORY_ORDER.seniorDebt),
    dsraDsrf: by(CATEGORY_ORDER.dsraDsrf),
    decommissioning: by(CATEGORY_ORDER.decommissioning),
    cashSweep: by(CATEGORY_ORDER.cashSweep),
  };
}

/* ═══════════════════════════════════════════════════════════ assumption slices ══ */

export interface DebtAssumptionSlices {
  /** `debttype in ["debt facility", "DSCR"]` */
  debt: DebtAssumptionRow[];
  /** `debttype = "decommissioning costs"` */
  decommissioning: DebtAssumptionRow[];
  /** `debttype in ["DSRA_DSRF", "DSRA", "DSRF"]` */
  dsra: DebtAssumptionRow[];
}

export const DEBT_TYPES = {
  debt: ["debt facility", "DSCR"],
  decommissioning: ["decommissioning costs"],
  dsra: ["DSRA_DSRF", "DSRA", "DSRF"],
} as const;

/** Rule 2 — the three slices, all already scoped to the project country by the query. */
export function sliceDebtAssumptions(rows: readonly DebtAssumptionRow[]): DebtAssumptionSlices {
  const has = (list: readonly string[], t: string) =>
    list.some((x) => x.toLowerCase() === t.toLowerCase());
  return {
    debt: rows.filter((r) => has(DEBT_TYPES.debt, r.debttype)),
    decommissioning: rows.filter((r) => has(DEBT_TYPES.decommissioning, r.debttype)),
    dsra: rows.filter((r) => has(DEBT_TYPES.dsra, r.debttype)),
  };
}

/** Rule 2 — `Switch(locProjectTechnology, "wind", wind, "pv", pv)`. */
export function debtTechColumn(row: DebtAssumptionRow | undefined, tech: DebtTech): string | null {
  if (!row) return null;
  if (tech === "wind") return row.wind;
  if (tech === "pv") return row.pv;
  return null;
}

export function debtText(
  rows: readonly DebtAssumptionRow[], category: string, tech: DebtTech,
): string | null {
  return debtTechColumn(rows.find((r) => r.category === category), tech);
}

export function debtValue(
  rows: readonly DebtAssumptionRow[], category: string, tech: DebtTech, lang: Lang = "en-US",
): number {
  return assumptionNumber(debtText(rows, category, tech), lang);
}

/**
 * Rule 3 — percent-typed fields are multiplied by 100 because the SQL stores fractions.
 * `NaN * 100` stays `NaN`, which is what a missing row must produce; do not coerce to 0.
 */
export function debtPercent(
  rows: readonly DebtAssumptionRow[], category: string, tech: DebtTech, lang: Lang = "en-US",
): number {
  const v = debtValue(rows, category, tech, lang);
  return Number.isNaN(v) ? NaN : pfxRound(v * 100, 10);
}

/**
 * The exact `category` strings the canvas looks up. Kept in ONE exported map so a
 * renamed SQL category fails a test rather than silently yielding blank
 * (spec implementation step 3).
 */
export const DEBT_CATEGORY = {
  bankMarginConstruction: "bank margin construction",
  bankMarginOperation: "bank margin operation",
  swapRate2025: "swap rate 10 y 2025",
  swapRate2026: "swap rate 10 y 2026",
  swapRate2027: "swap rate 10 y 2027",
  swapRate2028: "swap rate 10 y 2028",
  swapRate2029: "swap rate 10 y 2029",
  swapRate2030: "swap rate 10 y 2030",
  loanTenor: "loan tenor",
  commitmentFeeDefault: "commitment fee default",
  upFrontFee: "up-front fee",
  hedging: "hedging",
  maxGearing: "max gearing",
  drawdown: "drawdown",
  repaymentFreq: "repayment freq",
  fixedInterestRateTime: "fixed interest rate time",
  commitmentFeeFreePeriod: "commitment fee free period",
  commitmentFee: "commitment fee",
  commitmentFeePercentageOfMargin: "commitment fee percentage of margin",
  repaymentStartAfterCod: "repayment start (after cod)",
  repaymentProfile: "repayment profile",
  monthsFromCluster5ToFc: "months from cluster 5 until financial close",
  baserate: "baserate",
  spotCurveDebtSizing: "spot curve debt sizing",
  energyYieldDebtSizing: "energy yield debt sizing",
  dscrContracted: "dscr-target contracted",
  dscrUncontracted: "dscr-target uncontracted",
} as const;

export const DSRA_CATEGORY = {
  defaultType: "default dsra or dsrf",
  marginDsrf: "margin dsrf",
  /** Never looked up by the canvas — see defect 1. */
  marginDsra: "margin dsra",
  commitmentFee: "commitment fee",
  baseRateDsra: "base rate dsra",
  baseRateDsrf: "base rate dsrf",
  durationOfFutureDebtService: "duration of future debt service",
  commitmentFeeFreePeriod: "commitment fee free period",
  upFrontFee: "up-front fee",
  percentageOfFutureDebtService: "percentage of future debt service",
} as const;

export const DECOMMISSIONING_CATEGORY = {
  amountPerTurbine: "amount of guarantee per turbine",
  amountTotal: "amount of guarantee total",
  baseRateSavings: "baserate_savings",
  costType: "cost_type",
  durationSaving: "duration_saving",
  guaranteeCosts: "guarantee costs",
  guaranteeForLandOwners: "guarantee for land owners",
  marginSavings: "margin_savings",
} as const;

/* ══════════════════════════════════════════════════════════════ enum decoding ══ */

/** Rule 6 — `"equity_first"` → Equity First, anything else → Pro Rata. */
export const decodeDrawdown = (s: string | null): number =>
  s === "equity_first" ? CHOICE_FINANCE.drawdown.equityFirst : CHOICE_FINANCE.drawdown.proRata;

/** Rule 6 — `"percentage_margin"` → Percentage of Margin, anything else → Percentage. */
export const decodeCommitmentFee = (s: string | null): number =>
  s === "percentage_margin"
    ? CHOICE_FINANCE.commitmentFee.percentageOfMargin
    : CHOICE_FINANCE.commitmentFee.percentage;

/**
 * Rule 6 — `"p90"/"p75"/"p50"`. NOTE the canvas `Switch` has NO default arm here, so an
 * unknown string yields blank rather than a fallback. Reproduced as `null`.
 */
export function decodeEnergyYieldDebtSizing(s: string | null): number | null {
  if (s === "p90") return CHOICE_FINANCE.energyYieldDebtSizing.p90;
  if (s === "p75") return CHOICE_FINANCE.energyYieldDebtSizing.p75;
  if (s === "p50") return CHOICE_FINANCE.energyYieldDebtSizing.p50;
  return null;
}

/** Rule 6 — `"dscr_sculped"` (the canvas's spelling), `"individual"`, `"straight_line"`. */
export function decodeRepaymentProfile(s: string | null): number | null {
  if (s === "dscr_sculped") return CHOICE_FINANCE.repaymentProfile.dscrSculpted;
  if (s === "individual") return CHOICE_FINANCE.repaymentProfile.individual;
  if (s === "straight_line") return CHOICE_FINANCE.repaymentProfile.straightLine;
  return null;
}

/** Rule 6 — `"low_curve"`, `"central_curve"`, everything else → Average Low/Central. */
export const decodeSpotCurve = (s: string | null): number =>
  s === "low_curve" ? CHOICE_FINANCE.spotCurve.lowCurve
    : s === "central_curve" ? CHOICE_FINANCE.spotCurve.centralCurve
      : CHOICE_FINANCE.spotCurve.averageLowCentralCurve;

export const BASE_RATE_LABELS: Readonly<Record<string, number>> = Object.freeze({
  "euribor 1m": CHOICE_FINANCE.baseRate.euribor1M,
  "euribor 3m": CHOICE_FINANCE.baseRate.euribor3M,
  "euribor 6m": CHOICE_FINANCE.baseRate.euribor6M,
  "wibor 1m": CHOICE_FINANCE.baseRate.wibor1M,
  "wibor 3m": CHOICE_FINANCE.baseRate.wibor3M,
  "wibor 6m": CHOICE_FINANCE.baseRate.wibor6M,
});

/**
 * Rule 6 — `LookUp(Choices('Base Rate Options'), Lower(Text(Value)) = Lower(baserate)).Value`.
 * Case-insensitive; an unmatched string yields blank.
 */
export const decodeBaseRate = (s: string | null): number | null =>
  s === null ? null : (BASE_RATE_LABELS[s.trim().toLowerCase()] ?? null);

/**
 * Rule 7 — the DSRA/DSRF base rate is a 6-way `Switch` over `"EURIBOR 1M/3M/6M"` and
 * `"WIBOR 1M/3M/6M"` that DOES have a default: `'Euribor 3M'`.
 */
export const decodeDsraBaseRate = (s: string | null): number =>
  decodeBaseRate(s) ?? CHOICE_FINANCE.baseRate.euribor3M;

/** Rule 8 — `"total"` → Total, anything else → Per Turbine. */
export const decodeCostType = (s: string | null): number =>
  s === "total"
    ? CHOICE_FINANCE.costsOfDecommissioning.total
    : CHOICE_FINANCE.costsOfDecommissioning.perTurbine;

/** GUIDE q26 — the Base Rate radio's display text, proper-cased (`BASE_RATE_LABELS` above
 * is the lower-cased decode direction). */
export const BASE_RATE_OPTION_LABEL: Readonly<Record<number, string>> = Object.freeze({
  [CHOICE_FINANCE.baseRate.euribor1M]: "Euribor 1M",
  [CHOICE_FINANCE.baseRate.euribor3M]: "Euribor 3M",
  [CHOICE_FINANCE.baseRate.euribor6M]: "Euribor 6M",
  [CHOICE_FINANCE.baseRate.wibor1M]: "Wibor 1M",
  [CHOICE_FINANCE.baseRate.wibor3M]: "Wibor 3M",
  [CHOICE_FINANCE.baseRate.wibor6M]: "Wibor 6M",
});

/**
 * GUIDE q26 — the "Edit Tranche" panel's Base Rate radio offers exactly three options,
 * Euribor terms everywhere and Wibor terms in Poland — the same country split
 * `baseRateDefault` already falls back to.
 */
export function baseRateOptions(country: string | null): number[] {
  return country === "Poland"
    ? [CHOICE_FINANCE.baseRate.wibor1M, CHOICE_FINANCE.baseRate.wibor3M, CHOICE_FINANCE.baseRate.wibor6M]
    : [CHOICE_FINANCE.baseRate.euribor1M, CHOICE_FINANCE.baseRate.euribor3M, CHOICE_FINANCE.baseRate.euribor6M];
}

/** Rule 7 — `"dsrf"` → DSRF, anything else → DSRA. */
export const decodeDsraType = (s: string | null): number =>
  s === "dsrf" ? CHOICE_FINANCE.dsraDsrfType.dsrf : CHOICE_FINANCE.dsraDsrfType.dsra;

/* ══════════════════════════════════════════════════════════════ swap rate ══════ */

/** The last year the canvas `Switch` has an arm for. */
export const SWAP_RATE_LAST_YEAR = 2030;
export const SWAP_RATE_FIRST_YEAR = 2025;

const SWAP_RATE_CATEGORY: Readonly<Record<number, string>> = Object.freeze({
  2025: DEBT_CATEGORY.swapRate2025,
  2026: DEBT_CATEGORY.swapRate2026,
  2027: DEBT_CATEGORY.swapRate2027,
  2028: DEBT_CATEGORY.swapRate2028,
  2029: DEBT_CATEGORY.swapRate2029,
  2030: DEBT_CATEGORY.swapRate2030,
});

/**
 * Rule 5 — the swap rate is picked by the CURRENT calendar year with no fallback:
 * `Switch(Year(Today()), 2025, swap_rate_10y_2025, … 2030, swap_rate_10y_2030)`.
 *
 * SOURCE DEFECT (ambiguity 8): from 1 January 2031 this yields blank, so a freshly
 * seeded senior-debt tranche gets no swap rate at all and the display shows nothing.
 * There is no comment in the canvas indicating that is deliberate. Returning `null`
 * (not 0) keeps the blank visible instead of silently structuring debt at a 0 % swap.
 */
export function swapRateForYear(
  rows: readonly DebtAssumptionRow[], tech: DebtTech, year: number, lang: Lang = "en-US",
): number | null {
  const cat = SWAP_RATE_CATEGORY[year];
  if (!cat) return null;
  const v = debtPercent(rows, cat, tech, lang);
  return Number.isNaN(v) ? null : v;
}

/* ═════════════════════════════════════════════════════ senior debt standard ════ */

/** Rule 3 — the 27-field senior-debt assumption record, `locStandardAssumptionForSeniorDebt`. */
export interface SeniorDebtStandard {
  bankMarginConstruction: number;
  bankMarginOperation: number;
  swapRate: number | null;
  loanTenor: number;
  commitmentFeeDefault: number;
  upFrontFee: number;
  hedging: number;
  maxGearing: number;
  drawdown: number;
  repaymentFreq: number;
  fixedInterestRateTime: number;
  commitmentFeeFreePeriod: number;
  commitmentFee: number;
  commitmentFeePercentageOfMargin: number;
  repaymentStartAfterCod: number;
  repaymentProfile: number | null;
  monthsFromCluster5ToFc: number;
  baserate: number | null;
  spotCurveDebtSizing: number;
  energyYieldDebtSizing: number | null;
  dscrContracted: number;
  dscrUncontracted: number;
  /** Rule 4 — derived, not entered. */
  financialClose: Date | null;
}

/** Rule 4 — `DateAdd('5-Construction', months_from_cluster_5_to_fc, TimeUnit.Months)`. */
export function financialClose(construction: Date | null, monthsOffset: number): Date | null {
  if (!construction || Number.isNaN(monthsOffset)) return null;
  return addMonths(construction, monthsOffset);
}

/**
 * Rules 3 + 4 + 5 + 6 — the whole `locStandardAssumptionForSeniorDebt` record.
 *
 * `today` is injected so the swap-rate arm (rule 5) is testable without a clock stub.
 */
export function buildSeniorDebtStandard(
  rows: readonly DebtAssumptionRow[],
  tech: DebtTech,
  project: Pick<FinanceProject, "construction">,
  opts: { today?: Date; language?: Lang } = {},
): SeniorDebtStandard {
  const lang = opts.language ?? "en-US";
  const today = opts.today ?? new Date();
  const n = (c: string) => debtValue(rows, c, tech, lang);
  const p = (c: string) => debtPercent(rows, c, tech, lang);
  const z = (v: number) => (Number.isNaN(v) ? 0 : v);
  const months = z(n(DEBT_CATEGORY.monthsFromCluster5ToFc));

  return {
    bankMarginConstruction: z(p(DEBT_CATEGORY.bankMarginConstruction)),
    bankMarginOperation: z(p(DEBT_CATEGORY.bankMarginOperation)),
    swapRate: swapRateForYear(rows, tech, today.getFullYear(), lang),
    loanTenor: z(n(DEBT_CATEGORY.loanTenor)),
    commitmentFeeDefault: decodeCommitmentFee(debtText(rows, DEBT_CATEGORY.commitmentFeeDefault, tech)),
    upFrontFee: z(p(DEBT_CATEGORY.upFrontFee)),
    hedging: z(p(DEBT_CATEGORY.hedging)),
    maxGearing: z(n(DEBT_CATEGORY.maxGearing)),
    drawdown: decodeDrawdown(debtText(rows, DEBT_CATEGORY.drawdown, tech)),
    repaymentFreq: z(n(DEBT_CATEGORY.repaymentFreq)),
    fixedInterestRateTime: z(n(DEBT_CATEGORY.fixedInterestRateTime)),
    commitmentFeeFreePeriod: z(n(DEBT_CATEGORY.commitmentFeeFreePeriod)),
    commitmentFee: z(n(DEBT_CATEGORY.commitmentFee)),
    commitmentFeePercentageOfMargin: z(p(DEBT_CATEGORY.commitmentFeePercentageOfMargin)),
    repaymentStartAfterCod: z(n(DEBT_CATEGORY.repaymentStartAfterCod)),
    repaymentProfile: decodeRepaymentProfile(debtText(rows, DEBT_CATEGORY.repaymentProfile, tech)),
    monthsFromCluster5ToFc: months,
    baserate: decodeBaseRate(debtText(rows, DEBT_CATEGORY.baserate, tech)),
    spotCurveDebtSizing: decodeSpotCurve(debtText(rows, DEBT_CATEGORY.spotCurveDebtSizing, tech)),
    energyYieldDebtSizing: decodeEnergyYieldDebtSizing(
      debtText(rows, DEBT_CATEGORY.energyYieldDebtSizing, tech),
    ),
    dscrContracted: z(n(DEBT_CATEGORY.dscrContracted)),
    dscrUncontracted: z(n(DEBT_CATEGORY.dscrUncontracted)),
    financialClose: financialClose(project.construction, months),
  };
}

/* ═════════════════════════════════════════════════════════ DSRA/DSRF standard ══ */

export interface DsraStandard {
  type: number;
  marginDsrf: number;
  marginDsra: number;
  commitmentFee: number;
  baseRateDsra: number;
  baseRateDsrf: number;
  durationOfFutureDebtService: string | null;
  commitmentFeeFreePeriod: number;
  upFrontFee: number;
  percentageOfFutureDebtService: number;
}

/**
 * SOURCE DEFECT (ambiguity 2) — `MarginDSRA` as the canvas actually ships it.
 *
 * `locStandardDSRA_DSRF.MarginDSRA` looks up `category = "margin dsrf"`, byte-identical to
 * `.MarginDSRF` (`Project Finance Screen.pa.yaml` lines 187 and 233). There is no
 * `"margin dsra"` lookup anywhere in the screen. Since the seed then writes
 * `If(type = DSRF, MarginDSRF, MarginDSRA)`, a DSRA project silently receives the DSRF
 * margin — and DSRA is allowed a NEGATIVE margin while DSRF is not, so the two are not
 * interchangeable. Almost certainly a copy-paste defect, but the SQL table may genuinely
 * have no DSRA row; that is a data question, not a code one.
 */
export function marginDsraCanvasParity(
  rows: readonly DebtAssumptionRow[], tech: DebtTech, lang: Lang = "en-US",
): number {
  const v = debtPercent(rows, DSRA_CATEGORY.marginDsrf, tech, lang);
  return Number.isNaN(v) ? 0 : v;
}

/**
 * Rule 7 — the DSRA/DSRF standard record.
 *
 * `marginDsra` reads the correct `"margin dsra"` category and FALLS BACK to
 * `"margin dsrf"` when that row is absent, which is exactly the canvas result when the
 * SQL table has no DSRA row and is a safe correction when it does. Set
 * `canvasParityMarginDsra: true` to force the shipped behaviour.
 */
export function buildDsraStandard(
  rows: readonly DebtAssumptionRow[],
  tech: DebtTech,
  opts: { language?: Lang; canvasParityMarginDsra?: boolean } = {},
): DsraStandard {
  const lang = opts.language ?? "en-US";
  const z = (v: number) => (Number.isNaN(v) ? 0 : v);
  const dsraOwn = debtPercent(rows, DSRA_CATEGORY.marginDsra, tech, lang);
  const dsrf = z(debtPercent(rows, DSRA_CATEGORY.marginDsrf, tech, lang));
  return {
    type: decodeDsraType(debtText(rows, DSRA_CATEGORY.defaultType, tech)),
    marginDsrf: dsrf,
    marginDsra: opts.canvasParityMarginDsra
      ? marginDsraCanvasParity(rows, tech, lang)
      : (Number.isNaN(dsraOwn) ? dsrf : dsraOwn),
    commitmentFee: z(debtPercent(rows, DSRA_CATEGORY.commitmentFee, tech, lang)),
    baseRateDsra: decodeDsraBaseRate(debtText(rows, DSRA_CATEGORY.baseRateDsra, tech)),
    baseRateDsrf: decodeDsraBaseRate(debtText(rows, DSRA_CATEGORY.baseRateDsrf, tech)),
    durationOfFutureDebtService: debtText(rows, DSRA_CATEGORY.durationOfFutureDebtService, tech),
    commitmentFeeFreePeriod: z(debtValue(rows, DSRA_CATEGORY.commitmentFeeFreePeriod, tech, lang)),
    upFrontFee: z(debtPercent(rows, DSRA_CATEGORY.upFrontFee, tech, lang)),
    percentageOfFutureDebtService:
      z(debtPercent(rows, DSRA_CATEGORY.percentageOfFutureDebtService, tech, lang)),
  };
}

/* ═══════════════════════════════════════════════════ decommissioning standard ══ */

export interface DecommissioningStandard {
  amountPerTurbine: number;
  amountTotal: number;
  baseRateSavings: number | null;
  costType: number;
  /** `"00" & duration_saving` — the MMYY packing of rule 29. */
  durationSaving: string;
  guaranteeCosts: number;
  guaranteeForLandOwners: string | null;
  marginSavings: number;
  dateIssue: Date | null;
  expiry: Date | null;
  startSaving: Date | null;
}

/** Rule 8 — the decommissioning standard record, including the three project dates. */
export function buildDecommissioningStandard(
  rows: readonly DebtAssumptionRow[],
  tech: DebtTech,
  project: Pick<FinanceProject, "construction" | "endDate" | "cod">,
  opts: { language?: Lang } = {},
): DecommissioningStandard {
  const lang = opts.language ?? "en-US";
  const z = (v: number) => (Number.isNaN(v) ? 0 : v);
  return {
    amountPerTurbine: z(debtValue(rows, DECOMMISSIONING_CATEGORY.amountPerTurbine, tech, lang)),
    amountTotal: z(debtValue(rows, DECOMMISSIONING_CATEGORY.amountTotal, tech, lang)),
    baseRateSavings: decodeBaseRate(debtText(rows, DECOMMISSIONING_CATEGORY.baseRateSavings, tech)),
    costType: decodeCostType(debtText(rows, DECOMMISSIONING_CATEGORY.costType, tech)),
    // `"00" & LookUp(…, duration_saving)` — the canvas prefix, verbatim.
    durationSaving: `00${debtText(rows, DECOMMISSIONING_CATEGORY.durationSaving, tech) ?? ""}`,
    guaranteeCosts: z(debtPercent(rows, DECOMMISSIONING_CATEGORY.guaranteeCosts, tech, lang)),
    guaranteeForLandOwners: debtText(rows, DECOMMISSIONING_CATEGORY.guaranteeForLandOwners, tech),
    marginSavings: z(debtValue(rows, DECOMMISSIONING_CATEGORY.marginSavings, tech, lang)),
    dateIssue: project.construction,
    expiry: project.endDate,
    startSaving: project.cod,
  };
}

/* ═══════════════════════════════════════════════════════════ standard flags ════ */

export interface EquityFlags { locIsStandardFreeEquity: boolean; locIsStandardShareholderLoan: boolean }
export interface VatFlags { locIsStandardBaseRate: boolean; locIsStandardBankMargin: boolean }
export interface SeniorDebtFlags { FinancialCloseDate: boolean }
export interface DsraFlags {
  locIsStandardBaseRate: boolean;
  locIsStandardMargin: boolean;
  locIsStandardCommitmentFee: boolean;
  locIsStandardCommitmentFeeFreeDuration: boolean;
  locIsStandardUpfrontfee: boolean;
  locIsStandardPercentageoffuturedebtservice: boolean;
  locIsStandardDurationoffuturedebtservice: boolean;
  locIsStandardEndofDebtserviceSavings: boolean;
  locIsStandardType: boolean;
}
export interface DecommissioningFlags {
  CostofGuarantee: boolean;
  CostsofDecommissioning: boolean;
  CostsofDecommissioningValue: boolean;
  DateofExpiry: boolean;
  DateofIssue: boolean;
  DurationofSaving: boolean;
  StartDateofSaving: boolean;
}

/** The all-true defaults the seeds write. Key names are load-bearing — existing rows use them. */
export const DEFAULT_EQUITY_FLAGS: EquityFlags =
  { locIsStandardFreeEquity: true, locIsStandardShareholderLoan: true };
export const DEFAULT_VAT_FLAGS: VatFlags =
  { locIsStandardBaseRate: true, locIsStandardBankMargin: true };
export const DEFAULT_SENIOR_DEBT_FLAGS: SeniorDebtFlags = { FinancialCloseDate: true };
export const DEFAULT_DSRA_FLAGS: DsraFlags = {
  locIsStandardBaseRate: true, locIsStandardMargin: true, locIsStandardCommitmentFee: true,
  locIsStandardCommitmentFeeFreeDuration: true, locIsStandardUpfrontfee: true,
  locIsStandardPercentageoffuturedebtservice: true,
  locIsStandardDurationoffuturedebtservice: true,
  locIsStandardEndofDebtserviceSavings: true, locIsStandardType: true,
};
export const DEFAULT_DECOMMISSIONING_FLAGS: DecommissioningFlags = {
  CostofGuarantee: true, CostsofDecommissioning: true, CostsofDecommissioningValue: true,
  DateofExpiry: true, DateofIssue: true, DurationofSaving: true, StartDateofSaving: true,
};

/**
 * Rule 11 — standardness is stored as a JSON blob on the row, not as columns.
 * Written with `JSON(Table({…}), JSONFormat.Compact)` — a one-element ARRAY — and read
 * back with `First(Table(ParseJSON(<column>))).Value` + `Boolean(parsed.<flag>)`.
 *
 * A missing or malformed blob must yield all-false, never a throw: the screen renders
 * before the user has ever saved.
 */
export function parseStandardFlags<T extends object>(
  json: string | null | undefined, defaults: T,
): T {
  const allFalse = Object.fromEntries(Object.keys(defaults).map((k) => [k, false])) as T;
  if (!json) return allFalse;
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return allFalse;
  }
  const first = Array.isArray(parsed) ? parsed[0] : parsed;
  if (!first || typeof first !== "object") return allFalse;
  const rec = first as Record<string, unknown>;
  const out = { ...allFalse } as Record<string, boolean>;
  for (const k of Object.keys(defaults)) {
    // `Boolean(parsed.<flag>)` — the canvas coerces, so `"true"` and `1` are truthy.
    out[k] = rec[k] === true || rec[k] === "true" || rec[k] === 1;
  }
  return out as T;
}

/** `JSON(Table({…}), JSONFormat.Compact)` — always a single-element array. */
export const serialiseStandardFlags = <T extends object>(flags: T): string =>
  JSON.stringify([flags]);

/* ═════════════════════════════════════════════════════════════════ equity ══════ */

export type FreeEquityMode = "percentage" | "fixed";

/**
 * Rule 13 — the shareholder loan is the complement of free equity.
 * Percentage: `100 - Value(freeEquity)`.
 * Fixed: `Coalesce(Max(0, totalCapex - Value(freeEquity)), 0)`, falling back to
 * `totalCapex` when the free-equity text is not a number.
 */
export function shareholderLoan(
  mode: FreeEquityMode, freeEquity: string, totalCapex: number, lang: Lang = "en-US",
): number {
  const v = parseNumber(freeEquity, lang);
  if (mode === "percentage") return Number.isNaN(v) ? 100 : 100 - v;
  if (Number.isNaN(v)) return totalCapex;
  return Math.max(0, totalCapex - v);
}

/** Rule 14 — the free-equity unit label switches on mode and country. */
export const freeEquityLabel = (mode: FreeEquityMode, country: string | null): string =>
  mode === "percentage" ? "[%]" : country === "Poland" ? "[PLN]" : "[EUR]";

/** Rule 14 — the fixed-mode cap: 500 000 000 for Poland, 100 000 000 elsewhere. */
export const freeEquityCap = (country: string | null): number =>
  country === "Poland" ? 500_000_000 : 100_000_000;

export interface ValidationResult { valid: boolean; message: string }
const ok: ValidationResult = { valid: true, message: "" };
const bad = (message: string): ValidationResult => ({ valid: false, message });

export const MSG = {
  /**
   * NEW — no canvas equivalent: no canvas string carries this text; the canvas numeric errors
   * on this screen read "Numeric value with maximum of …" or come from `gblAppResx`
   */
  numeric: "Numeric value expected",
  /** `lbl_EquityData_FreeEquityEUR_ErrorMessage.Text` — verbatim. */
  freeEquityAboveCapex: "Free Equity must not be higher than Total CAPEX.",
  /** `lbl_SeniorDebtData_Commitment_Fee_Free_Period_ErrorMessage.Text` — verbatim. */
  tenorZero: "0 Year and 0 Months can't be selected",
  /** `lbl_SeniorDebtData_Tenor_ErrorMessage.Text` — verbatim. */
  tenorShorterThanStart: "The Tenor duration must not be shorter than the Start of repayment.",
  /** `lbl_SeniorDebtData_SUB_ErrorMessage_1.Text` — verbatim. */
  stepUpDuration: "Step-up Bank Margin duration must be equal to the Fixed Interest Rate duration",
  /** `lbl_VATFinancingData_BankMargin_ErrorMessage.Text` — verbatim. */
  vatBankMargin: "Please ensure Bank margin can be maximum 10",
  /** `lbl_DSRA_DRSFData_End_of_debt_service_savings_ErrorMessage.Text` — verbatim. */
  endOfSavingsBeforeCod: "End of debt service savings must not be earlier than COD date",
  /**
   * `pcf_btn_GeneralData_RightPanel_SeniorDebt_Form_Buttons_Save_1.OnChange` — verbatim (the
   * canvas literal is built in that behaviour formula).
   */
  duplicateTranche: "Same senior debt tranche already exists for this project.",
  /**
   * NEW — no canvas equivalent: the code app refuses a second Standard Assumption tranche; the
   * canvas created it
   */
  duplicateStandardAssumption:
    "A Standard Assumption tranche already exists for this project.",
  /** `lbl_VATFinancingData_VATFacilityAmountEUR_ErrorMessage.Text` — verbatim. */
  vatPreliminary: "Preliminary - final numbers will apply after calculation of plant",
} as const;

const between = (min: number, max: number, lang: Lang) => {
  const sep = decimalSeparator(lang);
  const fmt = (n: number) => String(n).replace(".", sep);
  return `Please select a value between ${fmt(min)} and ${fmt(max)}.`;
};

/**
 * Rule 14 — free-equity validation. Percentage: 0–100 with two decimals. Fixed value:
 * integer, `0…cap`, AND `Not(freeEquity > totalCapex)`.
 */
export function validateFreeEquity(
  text: string, mode: FreeEquityMode, country: string | null, totalCapex: number,
  lang: Lang = "en-US",
): ValidationResult {
  if (isBlank(text)) return ok;
  if (mode === "percentage") {
    if (!isDecimalWithPlaces(text, 2, lang)) return bad(MSG.numeric);
    return inRange(text, 0, 100, lang) ? ok : bad(between(0, 100, lang));
  }
  if (!isInteger(text, lang)) return bad(MSG.numeric);
  const cap = freeEquityCap(country);
  if (!inRange(text, 0, cap, lang)) return bad(between(0, cap, lang));
  return parseNumber(text, lang) > totalCapex ? bad(MSG.freeEquityAboveCapex) : ok;
}

/**
 * Rule 12 — total DEVEX/CAPEX. The canvas loads the WHOLE `CAPEX Project Contracts`
 * table at app start and sums `CAPEX Costs` client-side; `hooks.ts` pushes both filters
 * server-side. This is the fold, kept pure so the aggregation is testable.
 */
export function totalDevexCapex(
  contractIds: readonly string[], costs: readonly { contractId: string; cost: number | null }[],
): number {
  if (contractIds.length === 0) return 0;
  const wanted = new Set(contractIds);
  return costs
    .filter((c) => wanted.has(c.contractId))
    .reduce((s, c) => s + (c.cost ?? 0), 0);
}

/* ═══════════════════════════════════════════════════════════════ tranche key ═══ */

/**
 * Rule 17 — a senior-debt tranche's identity is a composed key.
 *
 *   Standard Assumption → `<Project>-SeniorDebt-StandardAssumption`
 *   otherwise           → `<Project>-SeniorDebt-<statusKey>-<bankKey>-<kfwKey>`
 *
 * `statusKey = Substitute(Lower(Trim(Text(status))), " ", "")`
 * `bankKey   = If(Lower(Trim(bankname)) = "other", "other-" & Substitute(Lower(Trim(typedName)), " ", ""),
 *                 "bank-" & Text(bank.id))`
 * `kfwKey    = If(kfwToggle, "kfw-" & Substitute(Lower(Trim(Coalesce(kfwValue, "blank"))), " ", ""), "nokfw")`
 */
const strip = (s: string) => s.trim().toLowerCase().replace(/ /g, "");

export interface TrancheKeyInput {
  projectId: string;
  /** the `Senior Debt Tranche Status ` LABEL, e.g. `"Term Sheet"` */
  statusLabel: string;
  /** the bank's display name, used only to detect the `"Other"` sentinel */
  bankName: string | null;
  bankId: string | null;
  otherBankName: string | null;
  kfwEnabled: boolean;
  kfwValue: string | null;
}

export function buildUniqueKey(input: TrancheKeyInput): string {
  if (strip(input.statusLabel) === "standardassumption") {
    return `${input.projectId}-SeniorDebt-StandardAssumption`;
  }
  const statusKey = strip(input.statusLabel);
  const bankKey = (input.bankName ?? "").trim().toLowerCase() === "other"
    ? `other-${strip(input.otherBankName ?? "")}`
    : `bank-${input.bankId ?? ""}`;
  const kfwKey = input.kfwEnabled
    ? `kfw-${strip(input.kfwValue ?? "blank")}`
    : "nokfw";
  return `${input.projectId}-SeniorDebt-${statusKey}-${bankKey}-${kfwKey}`;
}

/**
 * Rule 18 — duplicates are rejected BEFORE the write:
 * `LookUp('Financing Inputs', UniqueKeyString = key && Or(IsBlank(current),
 *   'Financing Input' <> current.'Financing Input'))`. Editing the row that owns the key
 * is not a collision.
 */
export function isDuplicateTranche(
  key: string,
  existing: readonly { id: string; uniqueKeyString: string | null }[],
  currentId: string | null,
): boolean {
  return existing.some((e) => e.uniqueKeyString === key && e.id !== currentId);
}

/**
 * Validation — `lbl_SeniorDebtData_TrancheStatus_ErrorMessage.Visible`: a second Standard
 * Assumption tranche is blocked.
 */
export function standardAssumptionConflict(
  statusValue: number,
  tranches: readonly { id: string; trancheStatus: number | null }[],
  currentId: string | null,
): boolean {
  if (statusValue !== CHOICE_FINANCE.trancheStatus.standardAssumption) return false;
  return tranches.some(
    (t) => t.trancheStatus === CHOICE_FINANCE.trancheStatus.standardAssumption && t.id !== currentId,
  );
}

/* ══════════════════════════════════════════════════════════════════════ DSCR ═══ */

/**
 * Rule 20 — DSCR is stored as a decimal but entered as an `x`-suffixed string.
 * The canvas save is `Value(Left(Text(<field>.Value), 4))` — literally the first four
 * characters. `"1.35x"` → `"1.35"` → `1.35`.
 */
export function parseDscr(text: string, lang: Lang = "en-US"): number {
  const v = parseNumber(text.slice(0, 4), lang);
  return Number.isNaN(v) ? 0 : v;
}

/**
 * Rule 20 — display is
 * `$"{Text(Coalesce(tranche.DSCR, standard.DSCR), "#.00")}{If(IsBlank(...), "", "x")}"`.
 * A blank value must render as `""` with no stray `x`.
 */
export function formatDscr(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "";
  return `${pfxRound(value, 2).toFixed(2)}x`;
}

/**
 * Validation — the DSCR regex, `"^(?:1\\.[0-9]{2}|2\\.(?:[0-4][0-9]|50))x$"` with a comma
 * variant for non-English clients. 1.00x…2.50x, exactly two decimals, trailing `x`.
 */
export function validateDscr(text: string, lang: Lang = "en-US"): ValidationResult {
  if (isBlank(text)) return ok;
  const sep = decimalSeparator(lang) === "." ? "\\." : ",";
  const rx = new RegExp(`^(?:1${sep}[0-9]{2}|2${sep}(?:[0-4][0-9]|50))x$`);
  return rx.test(text) ? ok : bad("Please enter a DSCR between 1.00x and 2.50x.");
}

/* ═════════════════════════════════════════════════════════ repayment profile ═══ */

export interface RepaymentRow {
  year: number;
  /** the typed amount; `""` while untouched */
  value: string;
  valid: boolean;
  dirty: boolean;
  /** the existing `Financing Inputs Repayment Amounts` row for this year, if any */
  repaymentAmountRecordId: string | null;
}

/**
 * Rule 21 — individual repayment-profile rows are regenerated from tenor and repayment
 * start, PRESERVING VALUES BY POSITION.
 *
 * `varStartYear = Year(DateAdd(DateAdd(COD, startYY, Years), startMM, Months))`
 * `varEndYear   = Year(DateAdd(DateAdd(COD, tenorYY, Years), tenorMM, Months))`
 * `Sequence(Max(0, (varEndYear - varStartYear) + 1))`, each row taking
 * `Coalesce(varRotationMatch.OldValue, "")` — the match is by INDEX, so shortening the
 * term keeps the first N values and moving the start year shifts the same values onto
 * different years (UT-FIN-053 / UT-FIN-054).
 */
export function regenerateRepaymentYears(
  cod: Date | null,
  startYY: number, startMM: number,
  tenorYY: number, tenorMM: number,
  previous: readonly RepaymentRow[] = [],
  existing: readonly { year: number; id: string }[] = [],
): RepaymentRow[] {
  if (!cod) return [];
  const startYear = addMonths(addYears(cod, startYY), startMM).getFullYear();
  const endYear = addMonths(addYears(cod, tenorYY), tenorMM).getFullYear();
  const n = Math.max(0, endYear - startYear + 1);
  return Array.from({ length: n }, (_, i) => {
    const year = startYear + i;
    const old = previous[i];
    return {
      year,
      value: old?.value ?? "",
      valid: old?.valid ?? false,
      dirty: true,
      repaymentAmountRecordId: existing.find((e) => e.year === year)?.id ?? null,
    };
  });
}

export interface RepaymentDiff {
  toDelete: string[];
  toUpsert: { year: number; amount: number; recordId: string | null; name: string }[];
}

/**
 * Rule 22 — repayment amounts are written only for the Individual profile.
 *
 * Individual: `RemoveIf(…, !(Value('Repayment Year') in colRepaymentProfileAmount.Year))`
 * then a `Patch` per row with `Name = $"{Year} - Value"`.
 * Any other profile: ALL repayment rows for the tranche are deleted.
 */
export function repaymentDiff(
  profile: number | null,
  rows: readonly RepaymentRow[],
  stored: readonly { id: string; year: number }[],
  lang: Lang = "en-US",
): RepaymentDiff {
  if (profile !== CHOICE_FINANCE.repaymentProfile.individual) {
    return { toDelete: stored.map((s) => s.id), toUpsert: [] };
  }
  const years = new Set(rows.map((r) => r.year));
  return {
    toDelete: stored.filter((s) => !years.has(s.year)).map((s) => s.id),
    toUpsert: rows.map((r) => {
      const v = parseNumber(r.value, lang);
      return {
        year: r.year,
        amount: Number.isNaN(v) ? 0 : v,
        recordId: stored.find((s) => s.year === r.year)?.id ?? null,
        name: `${r.year} - Value`,
      };
    }),
  };
}

/**
 * Validation — repayment amount rows: `IsInteger` and
 * `InRange(0, If(Country.Name = "Poland", 500000000, 100000000))`.
 */
export function validateRepaymentAmount(
  text: string, country: string | null, lang: Lang = "en-US",
): ValidationResult {
  if (isBlank(text)) return bad(MSG.numeric);
  if (!isInteger(text, lang)) return bad(MSG.numeric);
  const cap = country === "Poland" ? 500_000_000 : 100_000_000;
  return inRange(text, 0, cap, lang) ? ok : bad(between(0, cap, lang));
}

/* ═════════════════════════════════════════════════════════════ step-up margins ══ */

/** The in-memory row: the user picks the END year of each period plus a margin. */
export interface StepUpRow {
  id: number;
  /** `DurationYY.Value` — the year the period ENDS at, cumulative from year 1. */
  durationYY: number | null;
  margin: string;
  valid: boolean;
  recordId?: string | null;
}

/** The persisted row: a duration and a start year, not a boundary. */
export interface StoredStepUpRow {
  id?: string;
  order: number;
  startYear: number;
  duration: number;
  margin: number;
}

/**
 * Rule 23 — step-up bank margins are stored as DURATIONS, not year boundaries.
 *
 * `Duration: If(Id = 1, DurationYY, Abs(previous.DurationYY - DurationYY))`
 * `'Start Year': If(Id = 1, 1, previous.DurationYY)`
 * `Order: Id`
 */
export function stepUpToStorage(rows: readonly StepUpRow[], lang: Lang = "en-US"): StoredStepUpRow[] {
  return rows.map((r, i) => {
    const prev = i === 0 ? null : rows[i - 1]!;
    const yy = r.durationYY ?? 0;
    const prevYY = prev?.durationYY ?? 0;
    const m = parseNumber(r.margin, lang);
    return {
      id: r.recordId ?? undefined,
      order: r.id,
      startYear: i === 0 ? 1 : prevYY,
      duration: i === 0 ? yy : Math.abs(prevYY - yy),
      // The canvas stores `Value(Text(Self.Value, "##0.0#"))` — two decimals, trailing
      // zero trimmed. `pfxRound(…, 2)` is the same number.
      margin: Number.isNaN(m) ? 0 : pfxRound(m, 2),
    };
  });
}

/**
 * Rule 23 — the inverse, run when a tranche is opened for edit:
 * `DurationYY = If(Order = 1, ('Start Year' + Duration) - 1, 'Start Year' + Duration)`.
 *
 * Note the asymmetry: the first row subtracts one, later rows do not. It is not a
 * mistake — the first period starts at year 1 inclusive, later ones start at the
 * previous period's end year.
 */
export function stepUpFromStorage(rows: readonly StoredStepUpRow[]): StepUpRow[] {
  return [...rows]
    .sort((a, b) => a.order - b.order)
    .map((r) => ({
      id: r.order,
      durationYY: r.order === 1 ? r.startYear + r.duration - 1 : r.startYear + r.duration,
      margin: String(r.margin),
      valid: true,
      recordId: r.id ?? null,
    }));
}

/**
 * Rule 24 — the step-up schedule must exactly cover the fixed-interest period.
 * `Or(Not(Last(col).DurationYY = firYears), CountIf(col, DurationYY = firYears) > 1)`
 * — the last period must END at the FIR duration and no two periods may end there.
 */
export function stepUpScheduleValid(rows: readonly StepUpRow[], firYears: number | null): boolean {
  if (rows.length === 0 || firYears === null) return false;
  const last = rows[rows.length - 1]!;
  if (last.durationYY !== firYears) return false;
  return rows.filter((r) => r.durationYY === firYears).length <= 1;
}

/**
 * Rule 24 — the year picker offers only years above the previous period's end and at or
 * below the FIR years, excluding 0:
 * `Filter(colYearsForDuration, Or(IsBlank(prev), Value > prev.DurationYY), Value <= firYears, Value <> 0)`.
 */
export function stepUpYearOptions(previousEnd: number | null, firYears: number | null): number[] {
  if (firYears === null) return [];
  const from = previousEnd === null ? 1 : previousEnd + 1;
  const out: number[] = [];
  for (let y = Math.max(1, from); y <= firYears; y += 1) out.push(y);
  return out;
}

/**
 * Rule 25 — add-period is disabled once the schedule is complete or the last row is
 * incomplete, and always for a Standard Assumption tranche.
 */
export function stepUpAddEnabled(
  rows: readonly StepUpRow[], firYears: number | null, isStandardAssumption: boolean,
): boolean {
  if (isStandardAssumption) return false;
  if (rows.length === 0) return true;
  const last = rows[rows.length - 1]!;
  if (last.durationYY === null || isBlank(last.margin) || !last.valid) return false;
  const highest = [...rows].sort((a, b) => a.id - b.id)[rows.length - 1]!;
  return highest.durationYY !== firYears;
}

/** Rule 25 — remove-period is disabled for a Standard Assumption or with a single row. */
export const stepUpRemoveEnabled = (rows: readonly StepUpRow[], isStandardAssumption: boolean): boolean =>
  !isStandardAssumption && rows.length > 1;

/** Validation — step-up margin rows: `IsTwoDecimal` and `InRange(0, 100)`. */
export function validateStepUpMargin(text: string, lang: Lang = "en-US"): ValidationResult {
  if (isBlank(text)) return bad(MSG.numeric);
  if (!isDecimalWithPlaces(text, 2, lang)) return bad(MSG.numeric);
  return inRange(text, 0, 100, lang) ? ok : bad(between(0, 100, lang));
}

/** Rule 26 — step-up margins are wiped when the toggle is off. */
export function stepUpWrites(
  toggleOn: boolean, rows: readonly StepUpRow[], stored: readonly StoredStepUpRow[],
  lang: Lang = "en-US",
): { toDelete: string[]; toUpsert: StoredStepUpRow[] } {
  if (!toggleOn || rows.length === 0) {
    return { toDelete: stored.map((s) => s.id).filter((x): x is string => Boolean(x)), toUpsert: [] };
  }
  const next = stepUpToStorage(rows, lang);
  const keep = new Set(next.map((n) => n.id).filter(Boolean));
  return {
    toDelete: stored.map((s) => s.id).filter((x): x is string => Boolean(x) && !keep.has(x)),
    toUpsert: next,
  };
}

/* ══════════════════════════════════════════════════════════════════ DSRA/DSRF ══ */

export interface TenorTranche {
  tenorYears: number | null;
  tenorMonths: number | null;
  /** `statecode` — `Status <> Inactive` is the filter. */
  status: number;
}

/**
 * Rule 27 — the DSRA/DSRF end-of-savings default:
 * `DateAdd(DateAdd(COD, Max(Filter(inputs, category = Order 3, Status <> Inactive),
 *   ('Tenor Duration Year' * 12) + 'Tenor Duration Month'), TimeUnit.Months), -1, TimeUnit.Days)`
 * — the LONGEST ACTIVE senior-debt tranche; inactive tranches are ignored.
 */
export function defaultEndOfDebtServiceSavings(
  cod: Date | null, tranches: readonly TenorTranche[],
): Date | null {
  if (!cod) return null;
  const months = tranches
    .filter((t) => t.status !== CHOICE_FINANCE.status.inactive)
    .map((t) => (t.tenorYears ?? 0) * 12 + (t.tenorMonths ?? 0));
  if (months.length === 0) return null;
  return addDays(addMonths(cod, Math.max(...months)), -1);
}

/** Validation — `>= 'Operations start date (COD)'`. */
export function validateEndOfDebtServiceSavings(value: Date | null, cod: Date | null): ValidationResult {
  if (!value || !cod) return ok;
  return value.getTime() >= cod.getTime() ? ok : bad(MSG.endOfSavingsBeforeCod);
}

/**
 * Rule 29 — duration MMYY is a 4-character packed string:
 * written `Concatenate(Text(<MM>, "00"), Text(<YY>, "00"))`, read back as
 * `Value(Right(v,2))` YEARS and `Value(Left(v,2))` MONTHS.
 *
 * `@/domain/dates` ships `toMMYY(date)` / `fromMMYY(string)`, which encode a DATE's month
 * and two-digit year in exactly the same 4-character shape. They are used here for the
 * 1–12 month range, which is the whole of their domain, so the two encodings are pinned
 * to each other by `MMYY_PARITY` below; a zero-month duration has no date equivalent
 * (`toMMYY` would roll back into December of the previous year) and is padded directly.
 */
export function packMMYY(months: number, years: number): string {
  const m = Math.trunc(months);
  const y = Math.trunc(years);
  if (m >= 1 && m <= 12 && y >= 0 && y <= 99) return toMMYY(new Date(2000 + y, m - 1, 1));
  return `${String(m).padStart(2, "0")}${String(y).padStart(2, "0")}`;
}

export function unpackMMYY(value: string | null | undefined): { months: number; years: number } {
  if (!value || value.length !== 4) return { months: 0, years: 0 };
  const asDate = fromMMYY(value);
  if (asDate) return { months: asDate.getMonth() + 1, years: asDate.getFullYear() - 2000 };
  return { months: Number(value.slice(0, 2)) || 0, years: Number(value.slice(2)) || 0 };
}

/** Rule 10 — the DSRA seed zero-pads the raw SQL duration to four characters. */
export const padMMYY = (raw: string | null | undefined): string =>
  String(raw ?? "").padStart(4, "0");

/** Rule 35 / UT-FIN-074 — the singular/plural duration label. */
export function mmyyLabel(value: string | null | undefined): string {
  const { months, years } = unpackMMYY(value);
  return `${years} ${years === 1 ? "Year" : "Years"} ${months} ${months === 1 ? "Month" : "Months"}`;
}

/**
 * Rule 35 — the year/month pair renders with a `0#` pad and a singular/plural switch:
 * `Text(y, "0#") & If(y <= 1, " Year ", " Years ") & Text(m, "0#") & If(m <= 1, " Month", " Months")`.
 * NOTE the canvas's `<= 1`, which makes ZERO singular: `"00 Year 00 Month"`.
 */
export function yearMonthLabel(years: number | null, months: number | null): string {
  const y = years ?? 0;
  const m = months ?? 0;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(y)}${y <= 1 ? " Year " : " Years "}${pad(m)}${m <= 1 ? " Month" : " Months"}`;
}

/**
 * Rule 28 — DSRF-only fields are written as `Blank()` when the type is DSRA:
 * commitment fee value, both commitment-fee period parts and the upfront fee.
 */
export interface DsrfOnlyFields {
  commitmentFeeValue: number | null;
  commitmentFeePeriodYear: number | null;
  commitmentFeePeriodMonth: number | null;
  upfrontFeeValue: number | null;
}

export function dsrfOnlyFields(type: number, values: DsrfOnlyFields): DsrfOnlyFields {
  if (type === CHOICE_FINANCE.dsraDsrfType.dsrf) return values;
  return {
    commitmentFeeValue: null,
    commitmentFeePeriodYear: null,
    commitmentFeePeriodMonth: null,
    upfrontFeeValue: null,
  };
}

/**
 * Validation — DSRA/DSRF Margin [%]: two decimals and
 * `InRangeAbs(If(type = DSRA, -5, 0), 10)`. DSRA alone may go negative.
 */
export function validateDsraMargin(
  text: string, type: number, lang: Lang = "en-US",
): ValidationResult {
  if (isBlank(text)) return ok;
  if (!isDecimalWithPlaces(text, 2, lang)) return bad(MSG.numeric);
  const min = type === CHOICE_FINANCE.dsraDsrfType.dsra ? -5 : 0;
  return inRange(text, min, 10, lang) ? ok : bad(between(min, 10, lang));
}

/* ═════════════════════════════════════════════════════════════ decommissioning ══ */

/**
 * Rule 30 — the per-turbine cost is multiplied by the ACTIVE turbine count;
 * a Total cost is used as-is.
 */
export function totalDecommissioningCost(
  costType: number, value: number | null, activeTurbines: number,
): number {
  const v = value ?? 0;
  return costType === CHOICE_FINANCE.costsOfDecommissioning.perTurbine ? v * activeTurbines : v;
}

/**
 * Rule 31 — `DateAdd(DateAdd(DateAdd(start, MM, Months), YY, Years), -1, Days)`,
 * formatted `"dd.mm.yyyy"`. NOTE months are applied BEFORE years here, the opposite
 * order from the revenue contract's end date.
 */
export function endDateOfSaving(start: Date | null, months: number, years: number): Date | null {
  if (!start) return null;
  return addDays(addYears(addMonths(start, months), years), -1);
}

export const fmtDateDots = (d: Date | null): string =>
  d === null ? ""
    : `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;

/**
 * Validation — decommissioning cost value: integer, capped by mode AND country.
 * Total → Poland 50 000 000 / else 10 000 000. Per Turbine → Poland 5 000 000 / else 1 000 000.
 */
export function validateDecommissioningValue(
  text: string, costType: number, country: string | null, lang: Lang = "en-US",
): ValidationResult {
  if (isBlank(text)) return ok;
  if (!isInteger(text, lang)) return bad(MSG.numeric);
  const pl = country === "Poland";
  const cap = costType === CHOICE_FINANCE.costsOfDecommissioning.total
    ? (pl ? 50_000_000 : 10_000_000)
    : (pl ? 5_000_000 : 1_000_000);
  return inRange(text, 0, cap, lang) ? ok : bad(between(0, cap, lang));
}

/** Validation — Cost of Guarantee [%]: one decimal, 0…9.9. */
export function validateCostOfGuarantee(text: string, lang: Lang = "en-US"): ValidationResult {
  if (isBlank(text)) return ok;
  if (!isDecimalWithPlaces(text, 1, lang)) return bad(MSG.numeric);
  return inRange(text, 0, 9.9, lang) ? ok : bad(between(0, 9.9, lang));
}

/* ═══════════════════════════════════════════════════════════════════════ VAT ═══ */

/** Validation — VAT Bank Margin: two decimals, 0…10. */
export function validateVatBankMargin(text: string, lang: Lang = "en-US"): ValidationResult {
  if (isBlank(text)) return ok;
  if (!isDecimalWithPlaces(text, 2, lang)) return bad(MSG.vatBankMargin);
  return inRange(text, 0, 10, lang) ? ok : bad(MSG.vatBankMargin);
}

/**
 * Validation — VAT Facility Amount: `Calculated` shows the preliminary note and needs no
 * value; `Individual` requires an integer 0…cap.
 */
export function validateVatFacilityAmount(
  text: string, mode: number, country: string | null, lang: Lang = "en-US",
): ValidationResult {
  if (mode === CHOICE_FINANCE.vatFacilityAmount.calculated) return ok;
  if (isBlank(text)) return bad(MSG.numeric);
  if (!isInteger(text, lang)) return bad(MSG.numeric);
  const cap = country === "Poland" ? 500_000_000 : 100_000_000;
  return inRange(text, 0, cap, lang) ? ok : bad(between(0, cap, lang));
}

export const canSaveVatFinancing = (
  amountText: string, mode: number, bankMargin: string, country: string | null,
  formDirty: boolean, lang: Lang = "en-US",
): boolean =>
  formDirty &&
  validateVatBankMargin(bankMargin, lang).valid &&
  !isBlank(bankMargin) &&
  validateVatFacilityAmount(amountText, mode, country, lang).valid;

/* ═════════════════════════════════════════════════════════ senior-debt fields ══ */

/** Validation — Swap Margin, Swap Rate, both Bank Margins and the Bank Rate: 0…10, 2 dp. */
export function validateRateField(text: string, lang: Lang = "en-US"): ValidationResult {
  if (isBlank(text)) return ok;
  if (!isDecimalWithPlaces(text, 2, lang)) return bad(MSG.numeric);
  return inRange(text, 0, 10, lang) ? ok : bad(between(0, 10, lang));
}

/** Validation — Hedging [%]: `IsOneDecimal` and 0…100. */
export function validateHedging(text: string, lang: Lang = "en-US"): ValidationResult {
  if (isBlank(text)) return ok;
  if (!isDecimalWithPlaces(text, 1, lang)) return bad(MSG.numeric);
  return inRange(text, 0, 100, lang) ? ok : bad(between(0, 100, lang));
}

/** Validation — Commitment Fee Value: two decimals, 0…100. */
export function validateCommitmentFeeValue(text: string, lang: Lang = "en-US"): ValidationResult {
  if (isBlank(text)) return ok;
  if (!isDecimalWithPlaces(text, 2, lang)) return bad(MSG.numeric);
  return inRange(text, 0, 100, lang) ? ok : bad(between(0, 100, lang));
}

/**
 * Validation — Upfront Fee Value: percentage mode → two decimals 0…100; fixed mode →
 * integer 0…`If(Poland, 5 000 000 000, 1 000 000 000)`.
 */
export function validateUpfrontFee(
  text: string, option: number, country: string | null, lang: Lang = "en-US",
): ValidationResult {
  if (isBlank(text)) return ok;
  if (option === CHOICE_FINANCE.upfrontFee.percentageOfDebt) {
    if (!isDecimalWithPlaces(text, 2, lang)) return bad(MSG.numeric);
    return inRange(text, 0, 100, lang) ? ok : bad(between(0, 100, lang));
  }
  if (!isInteger(text, lang)) return bad(MSG.numeric);
  const cap = country === "Poland" ? 5_000_000_000 : 1_000_000_000;
  return inRange(text, 0, cap, lang) ? ok : bad(between(0, cap, lang));
}

/**
 * Validation — Fixed Amount Value: `% of Capex` → ONE decimal 0…100;
 * `Fixed Value` → integer 0…`If(Poland, 5 000 000 000, 1 000 000 000)`.
 */
export function validateFixedAmount(
  text: string, option: number, country: string | null, lang: Lang = "en-US",
): ValidationResult {
  if (isBlank(text)) return ok;
  if (option === CHOICE_FINANCE.fixedAmount.percentOfCapex) {
    if (!isDecimalWithPlaces(text, 1, lang)) return bad(MSG.numeric);
    return inRange(text, 0, 100, lang) ? ok : bad(between(0, 100, lang));
  }
  if (!isInteger(text, lang)) return bad(MSG.numeric);
  const cap = country === "Poland" ? 5_000_000_000 : 1_000_000_000;
  return inRange(text, 0, cap, lang) ? ok : bad(between(0, cap, lang));
}

/** Validation — `"0 Year and 0 Months can't be selected"` for the tenor and the FIR. */
export function validateYearMonthPair(years: number | null, months: number | null): ValidationResult {
  if (years === null || months === null) return ok;
  return years === 0 && months === 0 ? bad(MSG.tenorZero) : ok;
}

/**
 * Validation — `"The Tenor duration must not be shorter than the Start of repayment."`
 * applies only to the Individual profile.
 */
export function validateTenorAgainstRepaymentStart(
  profile: number | null, tenorYY: number | null, startRepaymentYY: number | null,
): ValidationResult {
  if (profile !== CHOICE_FINANCE.repaymentProfile.individual) return ok;
  if (tenorYY === null || startRepaymentYY === null) return ok;
  return tenorYY < startRepaymentYY ? bad(MSG.tenorShorterThanStart) : ok;
}

/* ═══════════════════════════════════════════════════════ senior-debt save gate ══ */

export interface SeniorDebtFormState {
  formDirty: boolean;
  isSaving: boolean;
  trancheId: string | null;
  trancheStatus: number | null;
  bankId: string | null;
  bankName: string | null;
  otherBankName: string;
  kfwEnabled: boolean;
  kfwValue: string | null;
  financialClose: Date | null;
  tenorYears: number | null;
  tenorMonths: number | null;
  drawdown: number | null;
  gearing: number | null;
  fixedAmountOption: number;
  fixedAmountValue: string;
  repaymentProfile: number | null;
  startRepaymentYears: number | null;
  startRepaymentMonths: number | null;
  frequencyOfRepayment: number | null;
  hedging: string;
  upfrontFeeOption: number;
  upfrontFeeValue: string;
  commitmentFeeOption: number;
  commitmentFeeValue: string;
  commitmentFeePeriodYears: number | null;
  commitmentFeePeriodMonths: number | null;
  swapMargin: string;
  bankMarginConstruction: string;
  bankMarginOperational: string;
  fixedInterestRateYears: number | null;
  fixedInterestRateMonths: number | null;
  swapAfterFixedPeriod: boolean;
  bankRate: string;
  baseRate: number | null;
  swapRate: string;
  dscrContracted: string;
  dscrUncontracted: string;
  stepUpEnabled: boolean;
  stepUpRows: StepUpRow[];
  repaymentRows: RepaymentRow[];
  country: string | null;
  /** other tranches on the project, for the duplicate and uniqueness tests */
  otherTranches: { id: string; trancheStatus: number | null; uniqueKeyString: string | null }[];
  projectId: string;
}

/**
 * GUIDE q26 — in the "Edit Tranche" panel's Status radio group, once a tranche has
 * reached Credit Agreement the two earlier draft statuses (Standard Assumption, Term
 * Sheet) render disabled (light-grey, non-selectable): a signed Credit Agreement is not a
 * status the editor lets you step back down from. Only Credit Agreement itself, and
 * whichever option is already selected, stay enabled.
 */
export function trancheStatusOptionDisabled(
  selectedStatus: number | null, option: number,
): boolean {
  if (selectedStatus !== CHOICE_FINANCE.trancheStatus.creditAgreement) return false;
  return option !== CHOICE_FINANCE.trancheStatus.creditAgreement;
}

/**
 * GUIDE q26 — every verbatim field label in the "Edit Tranche" panel that is not already
 * an inline radio-option string matching this file's existing convention (Gearing,
 * Repayment Profile, DSRA type, …). `Screen.tsx` never hand-types one of these.
 */
export const TRANCHE_FORM_LABEL = {
  /** `lbl_SeniorDebt_Data_Display_Card_Status.Text` — verbatim. */
  status: "Status",
  /** `lbl_SeniorDebt_Data_Display_Card_Bank.Text` — verbatim. */
  bank: "Bank",
  /** `lbl_SeniorDebt_Data_Display_Card_KfWTranche.Text` — verbatim. */
  kfwTranche: "KfW-Tranche",
  /** `lbl_SeniorDebt_Data_Display_Card_FinancialClose.Text` — verbatim. */
  financialClose: "Financial Close",
  /** `lbl_SeniorDebtData_BankMargin_5.Text` — verbatim. */
  tenor: "Tenor [Years after COD]",
  /** `lbl_SeniorDebt_Data_Display_Card_Drawdown.Text` — verbatim. */
  drawdown: "Drawdown",
  /** `lbl_SeniorDebtData_VATFacilityAmountEUR_4.Text` — verbatim. */
  dscr: "DSCR",
  /** `lbl_SeniorDebtData_VATFacilityAmountEUR_3.Text` — verbatim. */
  dscrContracted: "Contracted",
  /** `lbl_SeniorDebtData_VATFacilityAmountEUR_5.Text` — verbatim. */
  dscrUncontracted: "Uncontracted",
  /** `lbl_SeniorDebtData_BaseRate_13.Text` — verbatim. */
  upfrontFee: "Upfront Fee",
  /** `lbl_DSRA_DRSFData_Upfront_Fee_Percentage.Text` — the canvas field label. */
  upfrontFeeValue: "Upfront fee [%]",
  /** `lbl_SeniorDebtData_BaseRate_14.Text` — verbatim. */
  commitmentFee: "Commitment Fee",
  /** `lbl_Decommissioning_Data_Display_Card_Cost_of_Decommissioning_3.Text` — verbatim. */
  commitmentFeeValue: "Commitment Fee [%]",
  /** `lbl_Decommissioning_Data_Display_Card_Cost_of_Guarantee_3.Text` — verbatim. */
  commitmentFeeFreePeriod: "Commitment Fee Free Period",
  /** `lbl_SeniorDebtData_VATFacilityAmountEUR_16.Text` — verbatim. */
  interestRate: "Interest Rate",
  /** `lbl_Decommissioning_Data_Display_Card_Date_of_Issue_3.Text` — verbatim. */
  baseRate: "Base Rate",
  /** `lbl_SeniorDebt_Data_Display_Card_SwapMargin.Text` — verbatim. */
  swapRate: "Swap Rate [%]",
  /** `lbl_SeniorDebt_Data_Display_Card_BankMargin_ConstructionPhase.Text` — verbatim. */
  bankMarginConstruction: "Bank Margin - Construction Phase [%]",
  /** `lbl_SeniorDebt_Data_Display_Card_BankMargin_OperationalPhase.Text` — verbatim. */
  bankMarginOperational: "Bank Margin - Operational Phase [%]",
} as const;

/**
 * Validation — `pcf_btn_…_SeniorDebt_Form_Buttons_Save_1.DisplayMode`, 108 lines,
 * ported term for term.
 *
 * The canvas ends with 15 explicit `Not(<error label>.Visible)` terms plus
 * `Not(locIsSavingSeniorDebtTranche)`; here the error labels are the validators and the
 * re-entrancy guard is `isSaving` (rule 19).
 */
export function canSaveSeniorDebtTranche(
  form: SeniorDebtFormState, lang: Lang = "en-US",
): boolean {
  if (!form.formDirty || form.isSaving) return false;
  if (form.trancheStatus === null) return false;

  const isStandard = form.trancheStatus === CHOICE_FINANCE.trancheStatus.standardAssumption;
  if (standardAssumptionConflict(form.trancheStatus, form.otherTranches, form.trancheId)) return false;

  if (!isStandard) {
    if (isBlank(form.bankId) && (form.bankName ?? "").trim().toLowerCase() !== "other") return false;
    if ((form.bankName ?? "").trim().toLowerCase() === "other" && isBlank(form.otherBankName)) {
      return false;
    }
  }
  if (form.kfwEnabled && isBlank(form.kfwValue)) return false;
  if (!form.financialClose) return false;

  if (form.tenorYears === null || form.tenorMonths === null) return false;
  if (!validateYearMonthPair(form.tenorYears, form.tenorMonths).valid) return false;
  if (form.drawdown === null) return false;

  if (form.gearing === CHOICE_FINANCE.gearing.fixedAmount) {
    if (isBlank(form.fixedAmountValue)) return false;
    if (!validateFixedAmount(form.fixedAmountValue, form.fixedAmountOption, form.country, lang).valid) {
      return false;
    }
  }

  if (form.repaymentProfile === null) return false;
  if (form.startRepaymentYears === null || form.startRepaymentMonths === null) return false;
  if (!validateTenorAgainstRepaymentStart(
    form.repaymentProfile, form.tenorYears, form.startRepaymentYears,
  ).valid) return false;
  if (form.frequencyOfRepayment === null) return false;

  if (isBlank(form.hedging) || !validateHedging(form.hedging, lang).valid) return false;
  if (isBlank(form.upfrontFeeValue)) return false;
  if (!validateUpfrontFee(form.upfrontFeeValue, form.upfrontFeeOption, form.country, lang).valid) {
    return false;
  }
  if (isBlank(form.commitmentFeeValue)) return false;
  if (!validateCommitmentFeeValue(form.commitmentFeeValue, lang).valid) return false;

  for (const t of [form.swapMargin, form.bankMarginConstruction, form.bankMarginOperational]) {
    if (isBlank(t) || !validateRateField(t, lang).valid) return false;
  }

  if (form.fixedInterestRateYears === null || form.fixedInterestRateMonths === null) return false;
  if (!validateYearMonthPair(form.fixedInterestRateYears, form.fixedInterestRateMonths).valid) {
    return false;
  }

  if (form.swapAfterFixedPeriod) {
    for (const t of [form.bankRate, form.swapRate]) {
      if (isBlank(t) || !validateRateField(t, lang).valid) return false;
    }
  }

  if (form.gearing === CHOICE_FINANCE.gearing.debtSizing) {
    if (isBlank(form.dscrContracted) || isBlank(form.dscrUncontracted)) return false;
    if (!validateDscr(form.dscrContracted, lang).valid) return false;
    if (!validateDscr(form.dscrUncontracted, lang).valid) return false;
  }

  if (form.repaymentProfile === CHOICE_FINANCE.repaymentProfile.individual) {
    if (form.repaymentRows.length === 0) return false;
    if (form.repaymentRows.some((r) => !r.valid)) return false;
  }

  if (form.stepUpEnabled) {
    if (form.stepUpRows.some((r) => !r.valid)) return false;
    if (!stepUpScheduleValid(form.stepUpRows, form.fixedInterestRateYears)) return false;
  }
  return true;
}

/* ══════════════════════════════════════════════════════════════ status cascade ══ */

export interface FinancingInputStatus {
  id: string;
  categoryOrder: number;
  status: number;
  trackStatusActive: number | null;
  isDeactivatedByButton: number | null;
  dsraOriginalStatusActive: number | null;
}

/**
 * Rule 15 — the financing-option switch cascades statuses.
 *
 *  - The VAT input follows the option UNLESS `'Is Deactivated By Button' = Yes`.
 *  - `All Equity`: every senior-debt tranche and the DSRA/DSRF input go Inactive.
 *  - `Debt Financing`: each tranche is restored from `'Track Status Active?'` and the
 *    DSRA/DSRF input from `'DSRA/DSRF Original Status Active?'`.
 */
export function applyFinancingOptionCascade(
  inputs: readonly FinancingInputStatus[], option: number,
): { id: string; status: number }[] {
  const allEquity = option === CHOICE_FINANCE.financingOptions.allEquity;
  const out: { id: string; status: number }[] = [];
  for (const i of inputs) {
    if (i.categoryOrder === CATEGORY_ORDER.vatFinancing) {
      if (i.isDeactivatedByButton === CHOICE_FINANCE.yesNo.yes) continue;
      out.push({
        id: i.id,
        status: allEquity ? CHOICE_FINANCE.status.inactive : CHOICE_FINANCE.status.active,
      });
    } else if (i.categoryOrder === CATEGORY_ORDER.seniorDebt) {
      out.push({
        id: i.id,
        status: allEquity
          ? CHOICE_FINANCE.status.inactive
          : i.trackStatusActive === CHOICE_FINANCE.yesNo.yes
            ? CHOICE_FINANCE.status.active
            : CHOICE_FINANCE.status.inactive,
      });
    } else if (i.categoryOrder === CATEGORY_ORDER.dsraDsrf) {
      out.push({
        id: i.id,
        status: allEquity
          ? CHOICE_FINANCE.status.inactive
          : i.dsraOriginalStatusActive === CHOICE_FINANCE.dsraOriginalStatusActive.yes
            ? CHOICE_FINANCE.status.active
            : CHOICE_FINANCE.status.inactive,
      });
    }
  }
  return out;
}

/**
 * Rule 16 — a manual activate/deactivate remembers the pre-switch state.
 * `'Track Status Active?'` is set to the INVERSE of the new status (Active → No,
 * Inactive → Yes), and deactivating also sets `'Is Deactivated By Button' = Yes`.
 */
export function toggleTrancheStatus(
  input: Pick<FinancingInputStatus, "status">,
): { status: number; trackStatusActive: number; isDeactivatedByButton?: number } {
  const activating = input.status === CHOICE_FINANCE.status.inactive;
  if (activating) {
    return { status: CHOICE_FINANCE.status.active, trackStatusActive: CHOICE_FINANCE.yesNo.no };
  }
  return {
    status: CHOICE_FINANCE.status.inactive,
    trackStatusActive: CHOICE_FINANCE.yesNo.yes,
    isDeactivatedByButton: CHOICE_FINANCE.yesNo.yes,
  };
}

/** Rule 16 — the DSRA/DSRF equivalent uses its own memory column. */
export function toggleDsraStatus(
  input: Pick<FinancingInputStatus, "status">,
): { status: number; dsraOriginalStatusActive: number; isDeactivatedByButton?: number } {
  const activating = input.status === CHOICE_FINANCE.status.inactive;
  if (activating) {
    return {
      status: CHOICE_FINANCE.status.active,
      dsraOriginalStatusActive: CHOICE_FINANCE.dsraOriginalStatusActive.no,
    };
  }
  return {
    status: CHOICE_FINANCE.status.inactive,
    dsraOriginalStatusActive: CHOICE_FINANCE.dsraOriginalStatusActive.yes,
    isDeactivatedByButton: CHOICE_FINANCE.yesNo.yes,
  };
}

/**
 * SOURCE DEFECT (ambiguity 3) — `OnVisible` unconditionally runs
 * `Patch(Projects, gblRecordSelectedProject, {'Financing Options': 'Debt Financing'})`
 * at the top level of its `Concurrent`, not inside any `If`. Since
 * `rad_ProjectFinance_FinancingOptions.OnChange` lets the user choose `All Equity` and
 * writes it to the same column, every re-visit of the screen silently overwrites that
 * choice — and, through rule 15, would leave the tranches Inactive while the project
 * claims Debt Financing.
 *
 * WHAT WE DO: the patch fires only when the column has never been set. A project that
 * already carries a choice keeps it. `unconditionalDebtFinancingCanvasParity` keeps the
 * shipped behaviour reachable if the product owner confirms the overwrite is intended.
 */
export function financingOptionOnVisit(current: number | null): number | null {
  return current === null || current === undefined
    ? CHOICE_FINANCE.financingOptions.debtFinancing
    : null;
}

/** Canvas parity: patch `Debt Financing` on every visit, whatever the current value. */
export const unconditionalDebtFinancingCanvasParity = (): number =>
  CHOICE_FINANCE.financingOptions.debtFinancing;

/* ═══════════════════════════════════════════════════════════════ command bars ══ */

export interface CommandState { visible: boolean; enabled: boolean; reason?: string }
export type SeniorDebtCommandKey = "add" | "edit" | "activate" | "deactivate" | "delete";

export interface TrancheRow {
  id: string;
  trancheStatus: number | null;
  status: number;
  canEdit: boolean;
  canDelete: boolean;
}

/**
 * Validation — `pcf_FinancingInputs_Content_SeniroDebtTranche_CommandBar.Items`
 * (the control name's typo is the canvas's).
 *
 *  - Add: create permission AND not (exactly one input which is the Standard Assumption).
 *  - Edit: a selection, edit permission, and `Status = Active`.
 *  - Activate / Deactivate: visible only in the matching status; Deactivate additionally
 *    requires more than one ACTIVE senior-debt input — the last one cannot be deactivated.
 *  - Delete: delete permission, status neither Credit Agreement nor Standard Assumption,
 *    and more than one senior-debt input.
 */
export function seniorDebtCommandBar(
  tranches: readonly TrancheRow[],
  selected: TrancheRow | null,
  canCreate: boolean,
): Record<SeniorDebtCommandKey, CommandState> {
  const onlyStandard =
    tranches.length === 1 &&
    tranches[0]!.trancheStatus === CHOICE_FINANCE.trancheStatus.standardAssumption;
  const activeCount = tranches.filter((t) => t.status === CHOICE_FINANCE.status.active).length;
  const isActive = selected?.status === CHOICE_FINANCE.status.active;
  const isInactive = selected?.status === CHOICE_FINANCE.status.inactive;
  const undeletableStatus =
    selected?.trancheStatus === CHOICE_FINANCE.trancheStatus.creditAgreement ||
    selected?.trancheStatus === CHOICE_FINANCE.trancheStatus.standardAssumption;

  return {
    add: {
      visible: true,
      enabled: canCreate && !onlyStandard,
      reason: onlyStandard
        ? "Add a Term Sheet or Credit Agreement tranche from the Standard Assumption first."
        : undefined,
    },
    edit: {
      visible: true,
      enabled: Boolean(selected?.canEdit) && isActive,
      reason: selected && !isActive ? "An inactive tranche cannot be edited." : undefined,
    },
    activate: { visible: Boolean(selected) && isInactive, enabled: Boolean(selected?.canEdit) },
    deactivate: {
      visible: Boolean(selected) && isActive,
      enabled: Boolean(selected?.canEdit) && activeCount > 1,
      reason: activeCount <= 1 ? "The last active tranche cannot be deactivated." : undefined,
    },
    delete: {
      visible: true,
      enabled: Boolean(selected?.canDelete) && !undeletableStatus && tranches.length > 1,
      reason: undeletableStatus
        ? "A Credit Agreement or Standard Assumption tranche cannot be deleted."
        : undefined,
    },
  };
}

/**
 * Validation — the CATEGORY command bar (`pcf_ProjectRevenues_Content_ContractCommandBar_2`,
 * misnamed in the canvas — source ambiguity 9). Activate / Deactivate are visible only for
 * `Order in [2, 5]`: VAT-Financing and Decommissioning.
 */
export function categoryCommandBar(
  order: number, status: number, canEditRecord: boolean,
): { activate: CommandState; deactivate: CommandState } {
  const eligible = order === CATEGORY_ORDER.vatFinancing || order === CATEGORY_ORDER.decommissioning;
  return {
    activate: {
      visible: eligible && status === CHOICE_FINANCE.status.inactive,
      enabled: canEditRecord,
    },
    deactivate: {
      visible: eligible && status === CHOICE_FINANCE.status.active,
      enabled: canEditRecord,
    },
  };
}

/* ═══════════════════════════════════════════════════════════════════ display ═══ */

/** Rule 32 — the bank name has a sentinel: `"other-id-123"` means read the free-text name. */
export const OTHER_BANK_SENTINEL = "other-id-123";

export function bankDisplayName(
  bankId: string | null, otherBankName: string | null,
  banks: readonly { id: string; bankname: string }[],
): string {
  if (bankId === OTHER_BANK_SENTINEL) return otherBankName ?? "";
  return banks.find((b) => b.id === bankId)?.bankname ?? "";
}

export const TRANCHE_STATUS_LABEL: Readonly<Record<number, string>> = Object.freeze({
  [CHOICE_FINANCE.trancheStatus.standardAssumption]: "Standard Assumption",
  [CHOICE_FINANCE.trancheStatus.termSheet]: "Term Sheet",
  [CHOICE_FINANCE.trancheStatus.creditAgreement]: "Credit Agreement",
});

/**
 * Rule 33 — the tranche display name.
 * Standard Assumption → `"Standard Assumptions"` (plural, in the canvas).
 * Otherwise → `$"Term Sheet - *{bank}*{If(KfW, " - " & 'KfW-Tranche Value', "")}"`.
 */
export function trancheDisplayName(
  trancheStatus: number | null, bank: string, kfwEnabled: boolean, kfwValue: string | null,
): string {
  if (trancheStatus === CHOICE_FINANCE.trancheStatus.standardAssumption) return "Standard Assumptions";
  const label = TRANCHE_STATUS_LABEL[trancheStatus ?? -1] ?? "";
  const kfw = kfwEnabled && kfwValue ? ` - ${kfwValue}` : "";
  return `${label} - *${bank}*${kfw}`;
}

/**
 * Rule 34 — the upfront fee is formatted by its OWN option:
 * `If('Upfront Fee' = 'Percentage of Debt', Text(v, "##0.0"), Text(v, "###,###,##0"))`.
 */
export function formatUpfrontFee(option: number, value: number | null): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "";
  if (option === CHOICE_FINANCE.upfrontFee.percentageOfDebt) return pfxRound(value, 1).toFixed(1);
  return formatInteger(value, "en-GB");
}

/**
 * Rule 36 — every `DefaultSelectedItems` on the senior-debt form is
 * `Coalesce(locSelectedSeniorDebtTranche.<field>, locSelectedStandardAssumption.<field>)`,
 * and the base rate falls back FURTHER to `If(Country = "Poland", 'Wibor 3M', 'Euribor 3M')`.
 */
export function fieldDefault<T>(tranche: T | null | undefined, standard: T | null | undefined): T | null {
  if (tranche !== null && tranche !== undefined) return tranche;
  if (standard !== null && standard !== undefined) return standard;
  return null;
}

export function baseRateDefault(
  tranche: number | null, standard: number | null, country: string | null,
): number {
  return fieldDefault(tranche, standard) ??
    (country === "Poland" ? CHOICE_FINANCE.baseRate.wibor3M : CHOICE_FINANCE.baseRate.euribor3M);
}

/* ═══════════════════════════════════════════════════════════════════ seeding ═══ */

export type SeedCategory = "equity" | "vatFinancing" | "seniorDebt" | "dsraDsrf" | "decommissioning";

export interface SeedRow {
  category: SeedCategory;
  categoryId: string | null;
  name: string;
  uniqueKeyString: string;
  fields: Record<string, unknown>;
}

/**
 * Rule 10 — the five seed rows, exactly as `OnVisible` writes them.
 *
 * The canvas guards each with `If(CountIf('Financing Inputs', …) = 0, …)`; `planSeeds`
 * returns only the rows whose category is MISSING, so it is idempotent by construction
 * (UT-FIN-014). One `Patch` per row becomes one `$batch` in `hooks.ts`, and the
 * production home for this is a Dataverse custom API — this is a write on read, and the
 * canvas version races when two users open the screen at once.
 */
export function planSeeds(
  project: FinanceProject,
  categories: CategoryMap,
  existingCategoryIds: readonly string[],
  standard: SeniorDebtStandard,
  dsra: DsraStandard,
  decommissioning: DecommissioningStandard,
): SeedRow[] {
  const have = new Set(existingCategoryIds);
  const out: SeedRow[] = [];
  const pname = project.projectName ?? "";
  const bu = project.owningBusinessUnitId;

  if (categories.equity && !have.has(categories.equity.id)) {
    out.push({
      category: "equity",
      categoryId: categories.equity.id,
      name: `${pname}-Equity`,
      uniqueKeyString: `${project.id}-Equity`,
      fields: {
        freeEquity: CHOICE_FINANCE.freeEquity.percentage,
        freeEquityValue: 10,
        shareholderLoanValue: 90,
        isStandardValue: serialiseStandardFlags(DEFAULT_EQUITY_FLAGS),
        owningBusinessUnitId: bu,
      },
    });
  }

  if (categories.vatFinancing && !have.has(categories.vatFinancing.id)) {
    out.push({
      category: "vatFinancing",
      categoryId: categories.vatFinancing.id,
      name: `${pname}-VAT-Financing`,
      uniqueKeyString: `${project.id}-VAT-Financing`,
      fields: {
        baseRate: project.countryName === "Poland"
          ? CHOICE_FINANCE.baseRate.wibor3M
          : CHOICE_FINANCE.baseRate.euribor3M,
        bankMargin: 1.5,
        vatFacilityAmount: CHOICE_FINANCE.vatFacilityAmount.calculated,
        vatFacilityAmountValue: null,
        isStandardValue: serialiseStandardFlags(DEFAULT_VAT_FLAGS),
        owningBusinessUnitId: bu,
      },
    });
  }

  if (categories.seniorDebt && !have.has(categories.seniorDebt.id)) {
    out.push({
      category: "seniorDebt",
      categoryId: categories.seniorDebt.id,
      name: `${pname}-Senior Debt`,
      uniqueKeyString: `${project.id}-SeniorDebt-StandardAssumption`,
      fields: {
        trancheStatus: CHOICE_FINANCE.trancheStatus.standardAssumption,
        financialClose: standard.financialClose,
        tenorDurationMonth: 0,
        tenorDurationYear: standard.loanTenor,
        dscrContractedDecimal: standard.dscrContracted,
        dscrUncontractedDecimal: standard.dscrUncontracted,
        startRepaymentMonth: standard.repaymentStartAfterCod,
        startRepaymentYear: 0,
        frequencyOfRepayment: standard.repaymentFreq,
        hedging: standard.hedging,
        upfrontFeeValue: standard.upFrontFee,
        commitmentFeeValue: standard.commitmentFeePercentageOfMargin,
        commitmentFeePeriodMonth: standard.commitmentFeeFreePeriod,
        commitmentFeePeriodYear: 0,
        swapRate: standard.swapRate,
        // The canvas rounds this ONE field through `Text(v, "#0.0#")` before `Value()`.
        bankMarginConstructionPhase: pfxRound(standard.bankMarginConstruction, 2),
        bankMarginOperationalPhase: standard.bankMarginOperation,
        fixedInterestRateMonth: standard.fixedInterestRateTime,
        fixedInterestRateYear: 0,
        trackStatusActive: CHOICE_FINANCE.yesNo.yes,
        isFolded: CHOICE_FINANCE.isFolded.true,
        drawdown: standard.drawdown,
        commitmentFee: standard.commitmentFeeDefault,
        energyYieldDebtSizing: standard.energyYieldDebtSizing,
        baseRate: standard.baserate,
        repaymentProfile: standard.repaymentProfile,
        spotCurveDebtSizing: standard.spotCurveDebtSizing,
        gearing: CHOICE_FINANCE.gearing.debtSizing,
        upfrontFee: CHOICE_FINANCE.upfrontFee.percentageOfDebt,
        swapAfterFixedPeriod: CHOICE_FINANCE.yesNo.no,
        stepUpBankMargin: CHOICE_FINANCE.yesNo.no,
        seniorDebtStandardAssumptionJson: serialiseStandardFlags(DEFAULT_SENIOR_DEBT_FLAGS),
        owningBusinessUnitId: bu,
      },
    });
  }

  if (categories.dsraDsrf && !have.has(categories.dsraDsrf.id)) {
    const isDsrf = dsra.type === CHOICE_FINANCE.dsraDsrfType.dsrf;
    const only = dsrfOnlyFields(dsra.type, {
      commitmentFeeValue: dsra.commitmentFee,
      commitmentFeePeriodYear: dsra.commitmentFeeFreePeriod,
      commitmentFeePeriodMonth: 0,
      upfrontFeeValue: dsra.upFrontFee,
    });
    out.push({
      category: "dsraDsrf",
      categoryId: categories.dsraDsrf.id,
      name: `${pname}-DSRF/DSRA`,
      uniqueKeyString: `${project.id}-Debt Service Reserve Account / Facility`,
      fields: {
        typeDsraDsrf: dsra.type,
        baseRate: isDsrf ? dsra.baseRateDsrf : dsra.baseRateDsra,
        margin: isDsrf ? dsra.marginDsrf : dsra.marginDsra,
        commitmentFeeValue: only.commitmentFeeValue,
        commitmentFeePeriodYear: only.commitmentFeePeriodYear,
        // The canvas writes 0 here unconditionally, NOT Blank() — reproduced.
        commitmentFeePeriodMonth: 0,
        upfrontFeeValue: only.upfrontFeeValue,
        percentageOfFutureDebtService: dsra.percentageOfFutureDebtService,
        endOfDebtServiceSavings: project.cod
          ? addDays(addMonths(project.cod, standard.loanTenor * 12), -1)
          : null,
        durationOfFutureDebtServiceMmyy: padMMYY(dsra.durationOfFutureDebtService),
        dsraOriginalStatusActive: CHOICE_FINANCE.dsraOriginalStatusActive.yes,
        dsraStandardAssumptionsJson: serialiseStandardFlags(DEFAULT_DSRA_FLAGS),
        owningBusinessUnitId: bu,
      },
    });
  }

  if (categories.decommissioning && !have.has(categories.decommissioning.id)) {
    out.push({
      category: "decommissioning",
      categoryId: categories.decommissioning.id,
      name: `${pname}-Decommissioning`,
      uniqueKeyString: `${project.id}-Decommissioning Costs`,
      fields: {
        costsOfDecommissioning: decommissioning.costType,
        costsOfDecommissioningValue:
          decommissioning.costType === CHOICE_FINANCE.costsOfDecommissioning.total
            ? decommissioning.amountTotal
            : decommissioning.amountPerTurbine,
        costOfGuarantee: decommissioning.guaranteeCosts,
        dateOfIssue: decommissioning.dateIssue,
        startDateOfSaving: decommissioning.startSaving,
        dateOfExpiry: decommissioning.expiry,
        durationOfSaving: decommissioning.durationSaving,
        decommissioningStandardAssumptionJson:
          serialiseStandardFlags(DEFAULT_DECOMMISSIONING_FLAGS),
        owningBusinessUnitId: bu,
      },
    });
  }

  return out;
}

/**
 * Rule 37 — switching a tranche's status to or from Standard Assumption resets the form:
 * the selection is blanked, `locSelectedStandardAssumption` is re-seeded (or blanked when
 * leaving Standard Assumption), `locFinancialCloseToShow = locStandardFinancialClose` and
 * `locIsFinancialCloseDateStandard = true`.
 */
export function resetOnTrancheStatusChange(
  nextStatus: number, standard: SeniorDebtStandard,
): {
  selectedTrancheId: null;
  standardApplies: boolean;
  financialCloseToShow: Date | null;
  isFinancialCloseDateStandard: true;
} {
  const toStandard = nextStatus === CHOICE_FINANCE.trancheStatus.standardAssumption;
  return {
    selectedTrancheId: null,
    standardApplies: toStandard,
    financialCloseToShow: standard.financialClose,
    isFinancialCloseDateStandard: true,
  };
}

/**
 * Rule 38 — deleting a tranche cascades to its step-up margins and repayment amounts.
 * The canvas issues two `Concurrent`s; here it is one changeset (UT-FIN-098).
 */
export function trancheDeletePlan(
  trancheId: string,
  stepUps: readonly { id: string; financingInputId: string }[],
  repayments: readonly { id: string; financingInputId: string }[],
): { stepUpIds: string[]; repaymentIds: string[]; trancheId: string } {
  return {
    stepUpIds: stepUps.filter((s) => s.financingInputId === trancheId).map((s) => s.id),
    repaymentIds: repayments.filter((r) => r.financingInputId === trancheId).map((r) => r.id),
    trancheId,
  };
}

/* ═════════════════════════════════════════════════════════════════ formatting ══ */

export const fmtAmount = (v: number | null | undefined): string =>
  v === null || v === undefined || Number.isNaN(v) ? "" : formatInteger(v, "en-GB");

export const fmtPercent = (v: number | null | undefined, places = 2): string =>
  v === null || v === undefined || Number.isNaN(v) ? "" : `${pfxRound(v, places).toFixed(places)} %`;

export const isNumericText = (t: string, lang: Lang = "en-US") => isNumeric(t, lang);
