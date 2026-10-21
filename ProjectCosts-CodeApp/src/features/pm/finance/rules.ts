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
 * SOURCE DEFECTS — each is commented at its rule, canvas behaviour kept reachable
 * (`…CanvasParity` twins, logged in `ProjectDocs/app-docs/02-OPEN-DECISIONS.md` D34):
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
 *  5. (D34) the Drawdown default compares to "Pro Rate", so a stored Pro Rata reopens as
 *     Equity First (`drawdownDefaultCanvasParity`).
 *  6. (D34) the DSRA duration months default is `Coalesce(Value(0), …)` — always 0
 *     (`dsraDurationMonthsCanvasParity`).
 *  7. (D34) "Remove Last Period" leaves the removed step-up row stored (`stepUpWritesCanvasParity`).
 *  8. (D34) the percentage Shareholder Loan is computed only for an INTEGER free equity, so
 *     12.5 % saves a blank loan (`shareholderLoanCanvasParity`).
 *  9. (D34) the Date of Expiry error is visible for `Expiry = Issue` with no text
 *     (`dateOfExpiryMessageCanvasParity`).
 *
 * No flow is called from this screen: no `.Run(` occurs in `Project Finance Screen.pa.yaml`.
 * The sources `Assumptions Debt SQL`, `Assumptions Banks SQL` and `AssumptionsKfWTrancheSQL` are
 * Fabric SQL (`[dbo].[AssumptionsDebt]` … on `Lakehouse_Gold`, `References/DataSources.json`),
 * not Dataverse, and stay unconnected (D2): every rule below that reads them gets no rows.
 */
import {
  parseNumber, isNumeric, isInteger, inRange, inRangeAbs, isDecimalWithPlaces, isBlank,
  decimalSeparator, pfxRound, formatInteger, type Lang,
} from "@/domain/powerFxNumeric";
import { addDays, addMonths, addYears, toMMYY, fromMMYY } from "@/domain/dates";
import { CHOICE_FINANCE, ES, ES_FINANCE } from "@/data/dataverseNames";
import { bind, dateOnly } from "@/data/odata";
import { createdRowRef, refusePlan, type PlannedWrite, type WritePlan } from "@/data/writePlan";
import type { PlanJob } from "@/data/usePlanWrite";
import {
  assumptionNumber, pageLock as revenuePageLock, isPageLocked as revenueIsPageLocked,
  type RevenueProject,
} from "@/features/pm/revenues/rules";
import { textFormat } from "@/features/pm/generators/rules";

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
 * `rad_SeniorDebtData_BaseRate_2.Items` (Y:12415), and the same formula on `cmb_VATFinancingData_BaseRate`
 * and `drp_DSRA_DRSFData_Base_Rate`: `If(Country = "Poland", Choices('Base Rate Options'),
 * FirstN(Choices('Base Rate Options'), 3))` — all SIX options in Poland, the three Euribor terms
 * elsewhere. Corrected (D34): the earlier "GUIDE q26" list offered only the Wibor terms in Poland,
 * with no recorded decision.
 */
export function baseRateOptions(country: string | null): number[] {
  const all = [
    CHOICE_FINANCE.baseRate.euribor1M, CHOICE_FINANCE.baseRate.euribor3M, CHOICE_FINANCE.baseRate.euribor6M,
    CHOICE_FINANCE.baseRate.wibor1M, CHOICE_FINANCE.baseRate.wibor3M, CHOICE_FINANCE.baseRate.wibor6M,
  ];
  return country === "Poland" ? all : all.slice(0, 3);
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

/**
 * Rule 20 — which display-card values render as standard assumptions (themePrimary + italic).
 * Each card re-parses its row's JSON exactly as the canvas `With({…: ParseJSON(LookUp(
 * colFinancingInputInProject, …, '<column>'))}, …)` does:
 *  - Equity `txt_EquityData_FreeEquityEUR_1` / `…ShareholderLoanEUR_1`:
 *    `locIsEquityStandardAssunption.locIsStandardFreeEquity` / `.locIsStandardShareholderLoan`
 *    from `'Is Standard Value'`;
 *  - VAT `txt_VATFinancingData_BaseRate_2` / `…BankMargin_1`: `'Is Standard Value'`;
 *  - Decommissioning `txt_Decommissioning_Data_Display_Card_*_1`: `'Decommissioning Standard
 *    Assumption JSON'` (Cost_of_Decommissioning_1 reads `CostsofDecommissioningValue`);
 *  - DSRA/DSRF `txt_Decommissioning_Data_Display_Card_*_3..6`: `'DSRA/DRSF Standard Assumptions
 *    JSON'` (Duration_of_Saving_3 = Type reads `locIsStandardType`).
 * A missing or malformed blob reads all-false (`parseStandardFlags`), so nothing is styled.
 */
export interface FinanceCardStandard {
  equity: EquityFlags;
  vat: VatFlags;
  decommissioning: DecommissioningFlags;
  dsra: DsraFlags;
}

export function financeCardStandard(rows: {
  equity: FinancingInputRow | null; vat: FinancingInputRow | null;
  decommissioning: FinancingInputRow | null; dsra: FinancingInputRow | null;
}): FinanceCardStandard {
  const json = (row: FinancingInputRow | null, col: string) => rawStr(row?.raw[col]);
  return {
    equity: parseStandardFlags(json(rows.equity, INPUT_COL.isStandardValue), DEFAULT_EQUITY_FLAGS),
    vat: parseStandardFlags(json(rows.vat, INPUT_COL.isStandardValue), DEFAULT_VAT_FLAGS),
    decommissioning: parseStandardFlags(
      json(rows.decommissioning, INPUT_COL.decommissioningStandardAssumptionJson), DEFAULT_DECOMMISSIONING_FLAGS),
    dsra: parseStandardFlags(json(rows.dsra, INPUT_COL.dsraStandardAssumptionsJson), DEFAULT_DSRA_FLAGS),
  };
}

/**
 * Rule 20 — `txt_SeniorDebt_Data_Display_Card_FinancialClose`:
 * `Boolean(First(ParseJSON(ThisItem.'Senior Debt Standard Assumption JSON')).FinancialCloseDate)`
 * for both `FontColor` and `FontItalic` (the value comparison beside it is commented out).
 */
export const trancheFinancialCloseIsStandard = (row: FinancingInputRow): boolean =>
  parseStandardFlags(rawStr(row.raw[INPUT_COL.seniorDebtStandardAssumptionJson]), DEFAULT_SENIOR_DEBT_FLAGS)
    .FinancialCloseDate;

/* ═════════════════════════════════════════════════════════════════ equity ══════ */

export type FreeEquityMode = "percentage" | "fixed";

/**
 * Rule 13 — the shareholder loan is the complement of free equity
 * (`txt_EquityData_ShareholderLoanEUR.Value`, Y:7788).
 * Percentage: `100 - Value(freeEquity)`.
 * Fixed: `Coalesce(Max(0, totalCapex - Value(freeEquity)), 0)`, falling back to
 * `totalCapex` when the free-equity text is not a valid integer in range.
 *
 * SOURCE DEFECT (D34) — the percentage branch is guarded by `IsInteger(freeEquity)`, while the
 * free-equity field accepts TWO decimals: 12.5 % shows (and Save writes, `Value("")`) a blank
 * shareholder loan. Here any valid percentage gives `100 - v`; `shareholderLoanCanvasParity` is
 * the canvas. Returns `null` where the canvas shows blank.
 */
export function shareholderLoan(
  mode: FreeEquityMode, freeEquity: string, totalCapex: number, country: string | null = null,
  lang: Lang = "en-US",
): number | null {
  const v = parseNumber(freeEquity, lang);
  if (mode === "percentage") {
    return !isBlank(freeEquity) && isDecimalWithPlaces(freeEquity, 2, lang) && inRange(freeEquity, 0, 100, lang)
      ? pfxRound(100 - v, 2) : null;
  }
  if (!isBlank(freeEquity) && isInteger(freeEquity, lang) && inRange(freeEquity, 0, freeEquityCap(country), lang)) {
    return Math.max(0, totalCapex - v);
  }
  return totalCapex;
}

/** Canvas parity of `shareholderLoan`: the percentage branch needs an INTEGER free equity. */
export function shareholderLoanCanvasParity(
  mode: FreeEquityMode, freeEquity: string, totalCapex: number, country: string | null = null,
  lang: Lang = "en-US",
): number | null {
  if (mode === "percentage") {
    return !isBlank(freeEquity) && isInteger(freeEquity, lang) && inRange(freeEquity, 0, 100, lang)
      ? 100 - parseNumber(freeEquity, lang) : null;
  }
  return shareholderLoan(mode, freeEquity, totalCapex, country, lang);
}

/**
 * `pcf_btn_GeneralData_RightPanel_Equity_Form_Buttons_Save.OnChange` (Y:7943):
 * `'Shareholder Loan Value': Value(txt_EquityData_ShareholderLoanEUR.Value)` — the value of the SHOWN
 * text, which is `Text(…, "###,###,###,##0")` (Y:7801-7838). A Fixed Value loan
 * (`Max(0, CAPEX − value)`, CAPEX a sum of cost rows) is therefore stored rounded to the whole unit.
 * Corrected 21 Oct 2026 (audit): the unrounded difference was written. The Percentage branch keeps
 * D34's SOURCE DEFECT 6 fix — `100 − v`, exact — because the canvas would store Blank there
 * (`shareholderLoanCanvasParity`); rounding it to the shown "88" for 12.5 % would store a sum of 100.5.
 */
export function shareholderLoanToSave(
  mode: FreeEquityMode, freeEquity: string, totalCapex: number, country: string | null = null,
  lang: Lang = "en-US",
): number | null {
  const loan = shareholderLoan(mode, freeEquity, totalCapex, country, lang);
  if (loan === null || mode === "percentage") return loan;
  return pfxRound(loan, 0);
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

const isPoland = (country: string | null): boolean => country === "Poland";

/**
 * Every error and notification text of the screen, verbatim from the canvas (rule 7) — typos,
 * missing full stops and lower-case starts included. Each cites its control and property.
 */
export const MSG = {
  /** `lbl_EquityData_FreeEquityEUR_ErrorMessage.Text` — blank branch. */
  inputMustNotBeBlank: "Input must not be blank",
  /** `lbl_EquityData_FreeEquityEUR_ErrorMessage.Text` — Percentage branch. */
  freeEquityPercentage: "Number from 0 to 100, with up to two decimal places",
  /** `lbl_EquityData_FreeEquityEUR_ErrorMessage.Text` — `"Numeric value in range 0 to " & <cap>` (unformatted cap). */
  freeEquityRangePrefix: "Numeric value in range 0 to ",
  /** `lbl_EquityData_FreeEquityEUR_ErrorMessage.Text` — else branch. */
  freeEquityAboveCapex: "Free Equity must not be higher than Total CAPEX.",
  /** `lbl_SeniorDebtData_Tenor_ErrorMessage.Text` / `lbl_SeniorDebtData_FIR_ErrorMessage.Text`. */
  tenorZero: "0 Year and 0 Months can't be selected",
  /** `lbl_SeniorDebtData_Tenor_ErrorMessage.Text` — else branch. */
  tenorShorterThanStart: "The Tenor duration must not be shorter than the Start of repayment.",
  /** `lbl_SeniorDebtData_SUB_ErrorMessage_1.Text` — verbatim. */
  stepUpDuration: "Step-up Bank Margin duration must be equal to the Fixed Interest Rate duration",
  /** `lbl_SeniorDebtData_StepUp_Bank_Margin_ErrorMessage.Text` — verbatim. */
  stepUpMargin: "Numeric value with only two decimal is allowed",
  /** `lbl_SeniorDebtData_DSCR_*_ErrorMessage.Text` — the "en" branch. */
  dscr: "Enter a value between 1.00x and 2.50x with 2 decimals.",
  /** `lbl_SeniorDebtData_DSCR_*_ErrorMessage.Text` — the non-"en" branch. */
  dscrComma: "Enter a value between 1,00x and 2,50x with 2 decimals.",
  /** `lbl_SeniorDebtData_FixedAmountValue_ErrorMessage.Text` — % of Capex branch. */
  fixedAmountPercent: "value must be in range 0 to 100 with max one decimal.",
  /** `lbl_SeniorDebtData_FixedAmountValue_ErrorMessage.Text` — Fixed Value branch, `& <cap> & "."`. */
  fixedAmountValuePrefix: "value must be integer in range 0 to ",
  /** `lbl_SeniorDebtData_Hedging_ErrorMessage.Text` — verbatim. */
  hedging: "Value must be in range 0 to 100 with max one decimal.",
  /** `lbl_SeniorDebtData_RepaymentAmount_ErrorMessage.Text` — `"… 0 to " & <cap> & " without decimal place."`. */
  repaymentAmountPrefix: "value must be numeric in range 0 to ",
  repaymentAmountSuffix: " without decimal place.",
  /** `lbl_SeniorDebtData_UpfrontFeeValue_ErrorMessage.Text` — Percentage of Debt branch. */
  upfrontFeePercent: "value must be in range 0 to 100 with max two decimal.",
  /** `lbl_SeniorDebtData_UpfrontFeeValue_ErrorMessage.Text` — Fixed branch, `& <cap> & " without decimal."`. */
  upfrontFeeFixedPrefix: "value must be integer in range 0 to ",
  upfrontFeeFixedSuffix: " without decimal.",
  /** `lbl_SeniorDebtData_CommitmentFeeValue_ErrorMessage.Text` and `lbl_DSRA_DRSFData_Commitment_Fee_Percentage_ErrorMessage.Text`. */
  commitmentFee: "Value must be in a range 0 to 100 with maximum two decimal place.",
  /** `lbl_SeniorDebtData_SwapMargin_ErrorMessage.Text` (and the four other rate fields). */
  rate: "value must be in range 0 to 10 with max two decimal.",
  /** `lbl_VATFinancingData_BankMargin_ErrorMessage.Text` — two-decimals branch. */
  vatBankMarginDecimals: "Numeric value with maximum of two decimals",
  /** `lbl_VATFinancingData_BankMargin_ErrorMessage.Text` — range branch. */
  vatBankMargin: "Please ensure Bank margin can be maximum 10",
  /** `lbl_VATFinancingData_VATFacilityAmountEUR_ErrorMessage.Text` — Calculated branch (its container is hidden then). */
  vatPreliminary: "Preliminary - final numbers will apply after calculation of plant",
  /** `lbl_VATFinancingData_VATFacilityAmountEUR_ErrorMessage.Text` — blank branch. */
  vatAmountBlank: "Input can not be blank",
  /** `lbl_VATFinancingData_VATFacilityAmountEUR_ErrorMessage.Text` — `& <cap>` (unformatted). */
  vatAmountRangePrefix: "Numeric value must be between 0 and ",
  /** `lbl_DecommissioningData_Costs_Of_Decommissiong_ErrorMessage.Text` — integer branch. */
  decommissioningInteger: "Numeric value must be integer without decimal.",
  /** `lbl_DecommissioningData_Costs_Of_Decommissiong_ErrorMessage.Text` — `$"… 0 to {Text(cap, "###,###,###,###")}"`. */
  decommissioningRangePrefix: "Value must be in range 0 to ",
  /** `lbl_DecommissioningData_Cost_of_Guarantee_ErrorMessage_1.Text` — `$"…0 to 9{sep}9"`. */
  costOfGuaranteePrefix: "Numeric value with maximum of one decimal in range 0 to 9",
  /** `lbl_DecommissioningData_End_Date_of_Issue_ErrorMessage.Text`. */
  dateOfIssueBeforeCluster4: "Date of Issue must not be earlier than the cluster 4.",
  dateOfIssueAfterEnd: "Date of Issue must not be later than the Project End Date.",
  /** `lbl_DecommissioningData_Start_Date_of_Saving_ErrorMessage.Text`. */
  startOfSavingBeforeCod: "Start Date of Saving must not be earlier than the COD.",
  startOfSavingAfterEnd: "Start Date of Saving must not be later than the Project End Date.",
  startOfSavingBeforeIssue: "Start Date of Saving must be later than Date of Issue.",
  /** `lbl_DecommissioningData_End_Date_of_Expiry_ErrorMessage.Text`. */
  expiryBeforeCod: "Date of Expiry must not be earlier than the COD Date",
  expiryAfterEnd: "Date of Expiry must not be later than the Project End Date.",
  expiryBeforeIssue: "Date of Expiry must be later than the Date of Issue.",
  /** `lbl_DSRA_DRSFData_Margin_ErrorMessage_1.Text` — `$"Value must be in a range {min} to 10 …"`. */
  dsraMarginPrefix: "Value must be in a range ",
  dsraMarginSuffix: " to 10 with maximum two decimal place.",
  /** `lbl_DSRA_DRSFData_Upfront_Fee_Percentage_ErrorMessage.Text` — verbatim. */
  dsraUpfrontFee: "Value must be in a range 0 to 10 with maximum two decimal place.",
  /** `lbl_DSRA_DRSFData_POFDS_Fee_Percentage_ErrorMessage.Text` — verbatim. */
  pofds: "Value must be in a range 0 to 100 with maximum one decimal place.",
  /** `lbl_DSRA_DRSFData_End_of_debt_service_savings_ErrorMessage.Text` — verbatim. */
  endOfSavingsBeforeCod: "End of debt service savings must not be earlier than COD date",
  /**
   * `pcf_btn_GeneralData_RightPanel_SeniorDebt_Form_Buttons_Save_1.OnChange` — verbatim (the
   * canvas literal is built in that behaviour formula).
   */
  duplicateTranche: "Same senior debt tranche already exists for this project.",
} as const;

/** `If(Poland, "500,000,000", "100,000,000")` — the formatted caps the canvas texts spell out. */
const capText = (n: number): string => textFormat(n, "#,##0");

/**
 * Rule 14 — `lbl_EquityData_FreeEquityEUR_ErrorMessage` (Y:7600), `Visible` and `Text` term for
 * term. Percentage: not blank, two decimals, 0–100. Fixed value: not blank, integer, `0…cap`, and
 * `Not(freeEquity > totalCapex)`. The error SHOWS on a blank field, as in the canvas.
 */
export function validateFreeEquity(
  text: string, mode: FreeEquityMode, country: string | null, totalCapex: number,
  lang: Lang = "en-US",
): ValidationResult {
  const cap = freeEquityCap(country);
  if (mode === "percentage") {
    const valid = !isBlank(text) && isDecimalWithPlaces(text, 2, lang) && inRange(text, 0, 100, lang);
    if (valid) return ok;
    return bad(isBlank(text) ? MSG.inputMustNotBeBlank : MSG.freeEquityPercentage);
  }
  const intInRange = !isBlank(text) && isInteger(text, lang) && inRange(text, 0, cap, lang);
  if (intInRange && !(parseNumber(text, lang) > totalCapex)) return ok;
  if (isBlank(text)) return bad(MSG.inputMustNotBeBlank);
  if (!intInRange) return bad(`${MSG.freeEquityRangePrefix}${cap}`);
  return bad(MSG.freeEquityAboveCapex);
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
  // `Switch(varLang, "en", …)` — the comma text for every other language root.
  return rx.test(text) ? ok : bad(decimalSeparator(lang) === "." ? MSG.dscr : MSG.dscrComma);
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
  const cap = isPoland(country) ? 500_000_000 : 100_000_000;
  const valid = !isBlank(text) && isInteger(text, lang) && inRange(text, 0, cap, lang);
  return valid ? ok : bad(`${MSG.repaymentAmountPrefix}${capText(cap)}${MSG.repaymentAmountSuffix}`);
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
      // `txt_SeniorDebtData_StepUp_Bank_Margin_Percentage.Value: Text(ThisItem.Margin, "##0.00")` (Y:13102).
      margin: textFormat(r.margin, "##0.00"),
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
 * `btn_SeniorDebt_BankMargin_Add_StepUp_Period_1.DisplayMode` (Y:13204): `IsBlank(Last(col).DurationYY.Name)`
 * is TRUE for an empty collection, so with no row the button is disabled (the first row comes from
 * the toggle's `OnCheck` or the FIR years `OnChange`). Corrected 21 Oct 2026: it was enabled.
 */
export function stepUpAddEnabled(
  rows: readonly StepUpRow[], firYears: number | null, isStandardAssumption: boolean,
): boolean {
  if (isStandardAssumption) return false;
  if (rows.length === 0) return false;
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
  const valid = !isBlank(text) && isDecimalWithPlaces(text, 2, lang) && inRange(text, 0, 100, lang);
  return valid ? ok : bad(MSG.stepUpMargin);
}

/**
 * Rule 26 — the step-up writes of a tranche Save (Y:13886-13935). Toggle on with rows: one
 * upsert per row, matched to the stored row of the same `Order` (= the row `Id`). Otherwise
 * every stored row of the tranche is deleted (`RemoveIf`).
 *
 * SOURCE DEFECT (D34): after "Remove Last Period" the canvas upserts the remaining rows by
 * `Order` but never deletes the stored row whose `Order` is now above the count, so the removed
 * period comes back on the next edit. Here stored rows that are no longer in the schedule are
 * deleted; `stepUpWritesCanvasParity` keeps them.
 */
export function stepUpWrites(
  toggleOn: boolean, rows: readonly StepUpRow[], stored: readonly StoredStepUpRow[],
  lang: Lang = "en-US",
): { toDelete: string[]; toUpsert: StoredStepUpRow[] } {
  const canvas = stepUpWritesCanvasParity(toggleOn, rows, stored, lang);
  if (canvas.toUpsert.length === 0) return canvas;
  const keep = new Set(canvas.toUpsert.map((n) => n.id).filter(Boolean));
  return {
    toDelete: stored.map((s) => s.id).filter((x): x is string => Boolean(x) && !keep.has(x)),
    toUpsert: canvas.toUpsert,
  };
}

/** Canvas parity of `stepUpWrites`: rows above the new count stay stored. */
export function stepUpWritesCanvasParity(
  toggleOn: boolean, rows: readonly StepUpRow[], stored: readonly StoredStepUpRow[],
  lang: Lang = "en-US",
): { toDelete: string[]; toUpsert: StoredStepUpRow[] } {
  if (!toggleOn || rows.length === 0) {
    return { toDelete: stored.map((s) => s.id).filter((x): x is string => Boolean(x)), toUpsert: [] };
  }
  const byOrder = new Map(stored.map((s) => [s.order, s.id]));
  return {
    toDelete: [],
    toUpsert: stepUpToStorage(rows, lang).map((r) => ({ ...r, id: byOrder.get(r.order) ?? r.id })),
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

/**
 * Rule 35 / UT-FIN-074 — the DSRA card's duration label
 * (`txt_Decommissioning_Data_Display_Card_Duration_of_Saving_5`, Y:6923):
 * `If(YY <= 1, " Year", " Years")` — ZERO is singular too ("0 Year"). Corrected (D34; was `=== 1`).
 */
export function mmyyLabel(value: string | null | undefined): string {
  const { months, years } = unpackMMYY(value);
  return `${years} ${years <= 1 ? "Year" : "Years"} ${months} ${months <= 1 ? "Month" : "Months"}`;
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
 * Validation — `lbl_DSRA_DRSFData_Margin_ErrorMessage_1` (Y:16189): not blank → two decimals and
 * `InRangeAbs(If(type = DSRA, -5, 0), 10)`. DSRA alone may go negative.
 */
export function validateDsraMargin(
  text: string, type: number, lang: Lang = "en-US",
): ValidationResult {
  if (isBlank(text)) return ok;
  const min = type === CHOICE_FINANCE.dsraDsrfType.dsra ? -5 : 0;
  return isDecimalWithPlaces(text, 2, lang) && inRangeAbs(text, min, 10, lang)
    ? ok : bad(`${MSG.dsraMarginPrefix}${min}${MSG.dsraMarginSuffix}`);
}

/** Validation — `lbl_DSRA_DRSFData_Upfront_Fee_Percentage_ErrorMessage`: two decimals, 0…10. */
export function validateDsraUpfrontFee(text: string, lang: Lang = "en-US"): ValidationResult {
  if (isBlank(text)) return ok;
  return isDecimalWithPlaces(text, 2, lang) && inRange(text, 0, 10, lang) ? ok : bad(MSG.dsraUpfrontFee);
}

/** Validation — `lbl_DSRA_DRSFData_POFDS_Fee_Percentage_ErrorMessage` (S29): one decimal, 0…100. */
export function validatePofds(text: string, lang: Lang = "en-US"): ValidationResult {
  if (isBlank(text)) return ok;
  return isDecimalWithPlaces(text, 1, lang) && inRange(text, 0, 100, lang) ? ok : bad(MSG.pofds);
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

/** The decommissioning value cap: Total → Poland 50 000 000 / else 10 000 000; Per Turbine → 5 000 000 / 1 000 000. */
export const decommissioningCap = (costType: number, country: string | null): number =>
  costType === CHOICE_FINANCE.costsOfDecommissioning.total
    ? (isPoland(country) ? 50_000_000 : 10_000_000)
    : (isPoland(country) ? 5_000_000 : 1_000_000);

/** Validation — `lbl_DecommissioningData_Costs_Of_Decommissiong_ErrorMessage` (Y:14279). */
export function validateDecommissioningValue(
  text: string, costType: number, country: string | null, lang: Lang = "en-US",
): ValidationResult {
  if (isBlank(text)) return ok;
  if (!isInteger(text, lang)) return bad(MSG.decommissioningInteger);
  const cap = decommissioningCap(costType, country);
  return inRange(text, 0, cap, lang) ? ok : bad(`${MSG.decommissioningRangePrefix}${capText(cap)}`);
}

/**
 * Validation — `lbl_DecommissioningData_Cost_of_Guarantee_ErrorMessage_1` (Y:14451): visible
 * unless `Not(IsBlank) And IsOneDecimal And 0 <= v < 10` — a BLANK value shows the error too.
 */
export function validateCostOfGuarantee(text: string, lang: Lang = "en-US"): ValidationResult {
  const v = parseNumber(text, lang);
  const valid = !isBlank(text) && isDecimalWithPlaces(text, 1, lang) && v >= 0 && v < 10;
  return valid ? ok : bad(`${MSG.costOfGuaranteePrefix}${decimalSeparator(lang)}9`);
}

const before = (a: Date | null, b: Date | null): boolean => Boolean(a && b) && a!.getTime() < b!.getTime();
const after = (a: Date | null, b: Date | null): boolean => Boolean(a && b) && a!.getTime() > b!.getTime();

/** The project dates the decommissioning checks compare against. */
export type DecommissioningDates = Pick<FinanceProject, "legallyBindingPermits" | "endDate" | "cod">;

/**
 * Validation — `lbl_DecommissioningData_End_Date_of_Issue_ErrorMessage` (S21): not before
 * `'4-Legally binding permits'`, not after `'End Date'`. A blank date or project date is no
 * error (the page is locked without an End Date anyway).
 */
export function validateDateOfIssue(issue: Date | null, p: DecommissioningDates): ValidationResult {
  if (before(issue, p.legallyBindingPermits)) return bad(MSG.dateOfIssueBeforeCluster4);
  if (after(issue, p.endDate)) return bad(MSG.dateOfIssueAfterEnd);
  return ok;
}

/** Validation — `lbl_DecommissioningData_Start_Date_of_Saving_ErrorMessage`: ≥ COD, ≤ End Date, ≥ Issue. */
export function validateStartDateOfSaving(
  start: Date | null, issue: Date | null, p: DecommissioningDates,
): ValidationResult {
  if (before(start, p.cod)) return bad(MSG.startOfSavingBeforeCod);
  if (after(start, p.endDate)) return bad(MSG.startOfSavingAfterEnd);
  if (before(start, issue)) return bad(MSG.startOfSavingBeforeIssue);
  return ok;
}

/**
 * Validation — `lbl_DecommissioningData_End_Date_of_Expiry_ErrorMessage`: ≥ COD, ≤ End Date and
 * strictly after the Date of Issue.
 *
 * SOURCE DEFECT (D34): the label's `Visible` tests `Expiry <= Issue` but its `Text` tests
 * `Expiry < Issue`, so an expiry ON the issue date blocks Save with an empty message. The message
 * shows here; `dateOfExpiryMessageCanvasParity` returns the canvas's blank text.
 */
export function validateDateOfExpiry(
  expiry: Date | null, issue: Date | null, p: DecommissioningDates,
): ValidationResult {
  if (before(expiry, p.cod)) return bad(MSG.expiryBeforeCod);
  if (after(expiry, p.endDate)) return bad(MSG.expiryAfterEnd);
  if (expiry && issue && expiry.getTime() <= issue.getTime()) return bad(MSG.expiryBeforeIssue);
  return ok;
}

/** Canvas parity of the expiry message: blank when `Expiry = Issue` (the label is still visible). */
export function dateOfExpiryMessageCanvasParity(
  expiry: Date | null, issue: Date | null, p: DecommissioningDates,
): string {
  if (before(expiry, p.cod)) return MSG.expiryBeforeCod;
  if (after(expiry, p.endDate)) return MSG.expiryAfterEnd;
  if (before(expiry, issue)) return MSG.expiryBeforeIssue;
  return "";
}

/* ═══════════════════════════════════════════════════════════════════════ VAT ═══ */

/** Validation — `lbl_VATFinancingData_BankMargin_ErrorMessage` (Y:8288). */
export function validateVatBankMargin(text: string, lang: Lang = "en-US"): ValidationResult {
  if (isBlank(text)) return ok;
  if (!isDecimalWithPlaces(text, 2, lang)) return bad(MSG.vatBankMarginDecimals);
  return inRange(text, 0, 10, lang) ? ok : bad(MSG.vatBankMargin);
}

/**
 * Validation — `lbl_VATFinancingData_VATFacilityAmountEUR_ErrorMessage` (Y:8495). `Calculated`
 * needs no value (the canvas text is the "Preliminary…" note, inside a container that is hidden
 * for Calculated, so it never shows); `Individual` requires an integer `0…cap`.
 */
export function validateVatFacilityAmount(
  text: string, mode: number | null, country: string | null, lang: Lang = "en-US",
): ValidationResult {
  if (mode === CHOICE_FINANCE.vatFacilityAmount.calculated) return ok;
  const cap = isPoland(country) ? 500_000_000 : 100_000_000;
  if (isBlank(text)) return bad(MSG.vatAmountBlank);
  return isInteger(text, lang) && inRange(text, 0, cap, lang) ? ok : bad(`${MSG.vatAmountRangePrefix}${cap}`);
}

/* ═════════════════════════════════════════════════════════ senior-debt fields ══ */

/** Validation — the five rate fields (`lbl_SeniorDebtData_SwapMargin_ErrorMessage`, …): 0…10, 2 dp. */
export function validateRateField(text: string, lang: Lang = "en-US"): ValidationResult {
  if (isBlank(text)) return ok;
  return isDecimalWithPlaces(text, 2, lang) && inRange(text, 0, 10, lang) ? ok : bad(MSG.rate);
}

/**
 * Validation — `lbl_SeniorDebtData_Hedging_ErrorMessage` (Y:11541): visible unless not blank,
 * one decimal and 0…100 — a BLANK value shows the error too.
 */
export function validateHedging(text: string, lang: Lang = "en-US"): ValidationResult {
  const valid = !isBlank(text) && isDecimalWithPlaces(text, 1, lang) && inRange(text, 0, 100, lang);
  return valid ? ok : bad(MSG.hedging);
}

/** Validation — Commitment Fee Value (senior debt and DSRF): two decimals, 0…100. */
export function validateCommitmentFeeValue(text: string, lang: Lang = "en-US"): ValidationResult {
  if (isBlank(text)) return ok;
  return isDecimalWithPlaces(text, 2, lang) && inRange(text, 0, 100, lang) ? ok : bad(MSG.commitmentFee);
}

/** The `If(Poland, 5,000,000,000, 1,000,000,000)` cap of the fixed upfront fee and the fixed amount. */
const fixedCap = (country: string | null): number => (isPoland(country) ? 5_000_000_000 : 1_000_000_000);

/**
 * Validation — `lbl_SeniorDebtData_UpfrontFeeValue_ErrorMessage` (Y:11845): Percentage of Debt →
 * two decimals 0…100; Fixed → integer `0…cap`.
 */
export function validateUpfrontFee(
  text: string, option: number, country: string | null, lang: Lang = "en-US",
): ValidationResult {
  if (isBlank(text)) return ok;
  if (option === CHOICE_FINANCE.upfrontFee.percentageOfDebt) {
    return isDecimalWithPlaces(text, 2, lang) && inRange(text, 0, 100, lang) ? ok : bad(MSG.upfrontFeePercent);
  }
  const cap = fixedCap(country);
  return isInteger(text, lang) && inRange(text, 0, cap, lang)
    ? ok : bad(`${MSG.upfrontFeeFixedPrefix}${capText(cap)}${MSG.upfrontFeeFixedSuffix}`);
}

/**
 * Validation — `lbl_SeniorDebtData_FixedAmountValue_ErrorMessage` (Y:10838): `% of Capex` → ONE
 * decimal 0…100; `Fixed Value` → integer `0…cap`.
 */
export function validateFixedAmount(
  text: string, option: number | null, country: string | null, lang: Lang = "en-US",
): ValidationResult {
  // `If(% of Capex, …, Fixed Value, …)` has no else branch: with no option selected it is not visible.
  if (isBlank(text) || option === null) return ok;
  if (option === CHOICE_FINANCE.fixedAmount.percentOfCapex) {
    return isDecimalWithPlaces(text, 1, lang) && inRange(text, 0, 100, lang) ? ok : bad(MSG.fixedAmountPercent);
  }
  const cap = fixedCap(country);
  return isInteger(text, lang) && inRange(text, 0, cap, lang)
    ? ok : bad(`${MSG.fixedAmountValuePrefix}${capText(cap)}.`);
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
  /**
   * `rad_SeniorDebt_Fixed_Amount_Options.DefaultSelectedItems: locSelectedFixedAmount` (Y:10771): BLANK on
   * Add and after every Gearing change (`locSelectedFixedAmount: []`), the stored option on Edit.
   */
  fixedAmountOption: number | null;
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
  /** `'Tranche Status'` of the STORED tranche (`locSelectedSeniorDebtTranche`) — the radio gate. */
  storedTrancheStatus?: number | null;
  /** `rad_SeniorDebt_Data_EnergyYield` / `rad_SeniorDebt_Data_SpotCurve`. */
  energyYield?: number | null;
  spotCurve?: number | null;
  /** `locIsFinancialCloseDateStandard`. */
  financialCloseStandard?: boolean;
  /** The stored `'Track Status Active?'` (`Coalesce(…, Yes)` on Save). */
  trackStatusActive?: boolean | null;
  /**
   * `locSelectedSeniorDebtTranche: Blank()` — set by a Tranche Status change to or from Standard
   * Assumption (Y:9239). The panel title then reads "Add Tranche", although the Save still patches the
   * edited row (`locTempSelectedSeniorDebtTranche`, Y:13683).
   */
  selectionCleared?: boolean;
}

/**
 * `lbl_con_GeneralData_RightPanel_SeniorDebt_FormHeader_1.Text` (Y:9086):
 * `If(IsBlank(locSelectedSeniorDebtTranche), "Add Tranche", "Edit Tranche")`.
 */
export const trancheFormTitle = (form: Pick<SeniorDebtFormState, "trancheId" | "selectionCleared">): string =>
  (form.trancheId && !form.selectionCleared ? FIN_LABEL.editTrancheTitle : FIN_LABEL.addTrancheTitle);

/**
 * The month dropdowns of the tranche form (`drp_SeniorDebtData_Tenor_MM`, `Drp_…_StartRepayment_MM`,
 * `Drp_…_Commitment_Fee_Free_Period_MM`, `drp_…_Fixed_Interest_Rate_MM`, Y:9935 / 11273 / 12245 / 12863):
 * `Coalesce(tranche.<MM>, standard.<MM>, If(Not(IsBlank(<YY>.Selected.Value)), 0))` — a blank month
 * reads 0 once the years are set.
 */
export const trancheMonthDefault = (
  stored: number | null, standard: number | null | undefined, years: number | null,
): number | null => fieldDefault(stored, standard) ?? (years !== null ? 0 : null);

/**
 * The five repayment-schedule `OnChange`s (tenor YY / MM, start YY / MM, the profile radio, Y:9865 …):
 * the schedule is rebuilt only for the Individual profile with all four dropdowns set; otherwise
 * `colRepaymentProfileAmount` is left as it is.
 */
export function shouldRegenerateRepayments(
  form: Pick<SeniorDebtFormState, "repaymentProfile" | "tenorYears" | "tenorMonths" | "startRepaymentYears" | "startRepaymentMonths">,
): boolean {
  return form.repaymentProfile === CHOICE_FINANCE.repaymentProfile.individual
    && form.tenorYears !== null && form.tenorMonths !== null
    && form.startRepaymentYears !== null && form.startRepaymentMonths !== null;
}

/**
 * `btn_SeniorDebt_BankMargin_Add_StepUp_Period_1.OnSelect` / `…_Remove_StepUp_LastPeriod.OnSelect`
 * (Y:13184, 13223): `If(And(Not(IsBlank(FIR_YY)), Not(IsBlank(FIR_MM)), Not(lbl_…_FIR_ErrorMessage.Visible)), …)`.
 * Unlike the toggle's `OnCheck` (`canSeedStepUp`), the FIR MONTHS must be set too.
 */
export const stepUpPeriodChangeAllowed = (firYears: number | null, firMonths: number | null): boolean =>
  firYears !== null && firMonths !== null && validateYearMonthPair(firYears, firMonths).valid;

/**
 * `rad_SeniorDebt_Data_TrancheStatus.DisplayMode` (Y:9223):
 * `If(locSelectedSeniorDebtTranche.'Tranche Status' = 'Credit Agreement', Disabled, Edit)` — the
 * WHOLE radio is disabled for a stored Credit Agreement tranche (D34 follows the canvas; the
 * earlier "GUIDE q26" per-option disabling had no recorded decision).
 */
export const trancheStatusRadioDisabled = (storedStatus: number | null | undefined): boolean =>
  storedStatus === CHOICE_FINANCE.trancheStatus.creditAgreement;

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

/** `Lower(Trim(cmb_SeniorDebt_Data_Bank.Selected.bankname)) = "other"` — by name or by the sentinel id. */
export const isOtherBank = (bankId: string | null, bankName: string | null): boolean =>
  bankId === OTHER_BANK_SENTINEL || (bankName ?? "").trim().toLowerCase() === "other";

/**
 * Validation — `pcf_btn_…_SeniorDebt_Form_Buttons_Save_1.DisplayMode` (Y:13543-13648), term for
 * term, skipping the commented-out terms. The error labels are the validators; the re-entrancy
 * guard `locIsSavingSeniorDebtTranche` is `isSaving`.
 *
 * Corrected (D34): the old gate required `swapMargin` always and `swapRate` only under Swap
 * After Fixed Period. The canvas does the opposite — `txt_SeniorDebtData_SwapMargin` carries the
 * SWAP RATE (always required), `txt_SeniorDebtData_SwapRate` the SWAP MARGIN and
 * `txt_SeniorDebtData_BankMargin` the BANK RATE (required only under Swap After). The DSCR
 * errors count whatever the gearing (only the blank check is Debt-Sizing-only), and an
 * Individual profile with no rows passes (`CountIf(…, Valid = false) = 0`).
 *
 * DIVERGENCE (D34): the canvas requires `cmb_SeniorDebt_Data_Bank.Selected.bankname`. The bank
 * names come from `Assumptions Banks SQL` (Fabric, not connected — D2), so the stored bank id is
 * checked instead; otherwise no Term Sheet / Credit Agreement tranche could be saved at all.
 */
export function canSaveSeniorDebtTranche(
  form: SeniorDebtFormState, lang: Lang = "en-US",
): boolean {
  if (!form.formDirty || form.isSaving) return false;
  if (form.trancheStatus === null) return false;
  const isStandard = form.trancheStatus === CHOICE_FINANCE.trancheStatus.standardAssumption;
  const other = isOtherBank(form.bankId, form.bankName);
  if (!isStandard && isBlank(form.bankId)) return false;
  if (other && isBlank(form.otherBankName)) return false;
  if (form.kfwEnabled && isBlank(form.kfwValue)) return false;
  if (!form.financialClose) return false;
  if (form.tenorMonths === null || form.tenorYears === null) return false;
  if (form.drawdown === null) return false;
  const fixedAmount = form.gearing === CHOICE_FINANCE.gearing.fixedAmount;
  if (fixedAmount && isBlank(form.fixedAmountValue)) return false;
  if (form.repaymentProfile === null) return false;
  if (form.startRepaymentMonths === null || form.startRepaymentYears === null) return false;
  if (form.frequencyOfRepayment === null) return false;
  if (isBlank(form.hedging) || isBlank(form.upfrontFeeValue) || isBlank(form.commitmentFeeValue)) return false;
  if (isBlank(form.swapRate) || isBlank(form.bankMarginConstruction) || isBlank(form.bankMarginOperational)) return false;
  if (form.fixedInterestRateMonths === null || form.fixedInterestRateYears === null) return false;
  if (form.swapAfterFixedPeriod && (isBlank(form.bankRate) || isBlank(form.swapMargin))) return false;
  if (form.gearing === CHOICE_FINANCE.gearing.debtSizing
    && (isBlank(form.dscrContracted) || isBlank(form.dscrUncontracted))) return false;
  if (form.repaymentProfile === CHOICE_FINANCE.repaymentProfile.individual
    && form.repaymentRows.some((r) => !r.valid)) return false;
  if (form.stepUpEnabled && form.stepUpRows.some((r) => !r.valid)) return false;
  // `Not(lbl_SeniorDebtData_SUB_ErrorMessage_1.Visible)` — visible only while the toggle is on.
  if (form.stepUpEnabled && !stepUpScheduleValid(form.stepUpRows, form.fixedInterestRateYears)) return false;
  // The error labels, in the canvas order.
  if (standardAssumptionConflict(form.trancheStatus, form.otherTranches, form.trancheId)) return false;
  if (!validateYearMonthPair(form.tenorYears, form.tenorMonths).valid) return false;
  if (!validateTenorAgainstRepaymentStart(form.repaymentProfile, form.tenorYears, form.startRepaymentYears).valid) {
    return false;
  }
  if (!validateDscr(form.dscrUncontracted, lang).valid || !validateDscr(form.dscrContracted, lang).valid) return false;
  if (fixedAmount && !validateFixedAmount(form.fixedAmountValue, form.fixedAmountOption, form.country, lang).valid) {
    return false;
  }
  if (!validateHedging(form.hedging, lang).valid) return false;
  if (!validateUpfrontFee(form.upfrontFeeValue, form.upfrontFeeOption, form.country, lang).valid) return false;
  if (!validateCommitmentFeeValue(form.commitmentFeeValue, lang).valid) return false;
  for (const t of [form.swapRate, form.bankMarginConstruction, form.bankMarginOperational, form.bankRate, form.swapMargin]) {
    if (!validateRateField(t, lang).valid) return false;
  }
  if (!validateYearMonthPair(form.fixedInterestRateYears, form.fixedInterestRateMonths).valid) return false;
  return true;
}

/* ══════════════════════════════════════════════════════════════ status cascade ══ */

export interface FinancingInputStatus {
  id: string;
  categoryOrder: number;
  status: number;
  /** `'Track Status Active?'` — a two-option boolean (D34: was typed as a 1/0 number). */
  trackStatusActive: boolean | null;
  /** `'Is Deactivated By Button'` — a two-option boolean. */
  isDeactivatedByButton: boolean | null;
  /** `'DSRA/DSRF Original Status Active?'` — a 952850000-band picklist. */
  dsraOriginalStatusActive: number | null;
}

/**
 * Rule 15 — the financing-option switch cascades statuses
 * (`rad_ProjectFinance_FinancingOptions.OnChange`, Y:2402), in the canvas write ORDER:
 * the VAT input first, then every senior-debt tranche (`ForAll`), then the DSRA/DSRF input.
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
  const { active, inactive } = CHOICE_FINANCE.status;
  const vat = inputs
    .filter((i) => i.categoryOrder === CATEGORY_ORDER.vatFinancing && i.isDeactivatedByButton !== CHOICE_FINANCE.yesNo.yes)
    .map((i) => ({ id: i.id, status: allEquity ? inactive : active }));
  const tranches = inputs
    .filter((i) => i.categoryOrder === CATEGORY_ORDER.seniorDebt)
    .map((i) => ({
      id: i.id,
      status: allEquity ? inactive : i.trackStatusActive === CHOICE_FINANCE.yesNo.yes ? active : inactive,
    }));
  const dsra = inputs
    .filter((i) => i.categoryOrder === CATEGORY_ORDER.dsraDsrf)
    .map((i) => ({
      id: i.id,
      status: allEquity ? inactive
        : i.dsraOriginalStatusActive === CHOICE_FINANCE.dsraOriginalStatusActive.yes ? active : inactive,
    }));
  return [...vat, ...tranches, ...dsra];
}

/**
 * Rule 16 — a tranche's Activate / Deactivate (`cmp_PopUp_ActivationForSeniorDebtTranche.OnConfirm`,
 * Y:8946-8973):
 *   `Status` flips; `'Is Deactivated By Button' = If(Active, Yes, <unchanged>)`;
 *   `'Track Status Active?' = If(Active, No, Yes)` — i.e. EQUAL to the new status.
 * Corrected (D34): the old rule wrote the inverse, so a later switch back to Debt Financing
 * (rule 15) restored every tranche to the wrong status.
 */
export function toggleTrancheStatus(
  input: Pick<FinancingInputStatus, "status">,
): { status: number; trackStatusActive: boolean; isDeactivatedByButton?: boolean } {
  const deactivating = input.status === CHOICE_FINANCE.status.active;
  if (!deactivating) {
    return { status: CHOICE_FINANCE.status.active, trackStatusActive: CHOICE_FINANCE.yesNo.yes };
  }
  return {
    status: CHOICE_FINANCE.status.inactive,
    trackStatusActive: CHOICE_FINANCE.yesNo.no,
    isDeactivatedByButton: CHOICE_FINANCE.yesNo.yes,
  };
}

/**
 * Rule 16 — the DSRA/DSRF card's Activate / Deactivate (`cmp_PopUp_Confirmation_3.OnConfirm`,
 * Y:17042-17064): `Status` flips and `'DSRA/DSRF Original Status Active?' = If(Active, No, Yes)`
 * — equal to the new status. Nothing else is written. Corrected (D34): the old rule wrote the
 * inverse and added `'Is Deactivated By Button'`, which the canvas never writes here.
 */
export function toggleDsraStatus(
  input: Pick<FinancingInputStatus, "status">,
): { status: number; dsraOriginalStatusActive: number } {
  const deactivating = input.status === CHOICE_FINANCE.status.active;
  return deactivating
    ? { status: CHOICE_FINANCE.status.inactive, dsraOriginalStatusActive: CHOICE_FINANCE.dsraOriginalStatusActive.no }
    : { status: CHOICE_FINANCE.status.active, dsraOriginalStatusActive: CHOICE_FINANCE.dsraOriginalStatusActive.yes };
}

/**
 * Rule 16 — the VAT-Financing / Decommissioning Activate / Deactivate
 * (`cmp_PopUp_Confirmation_1.OnConfirm`, Y:8830-8848): `Status` flips and
 * `'Is Deactivated By Button': If(Active, Yes)` — Blank (null) when activating, so the VAT
 * input follows the financing option again (rule 15). `'Track Status Active?'` is not written.
 */
export function toggleCategoryStatus(
  input: Pick<FinancingInputStatus, "status">,
): { status: number; isDeactivatedByButton: boolean | null } {
  const deactivating = input.status === CHOICE_FINANCE.status.active;
  return deactivating
    ? { status: CHOICE_FINANCE.status.inactive, isDeactivatedByButton: CHOICE_FINANCE.yesNo.yes }
    : { status: CHOICE_FINANCE.status.active, isDeactivatedByButton: null };
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
 * The canvas shows no reason for a disabled command; the invented tooltips were removed (D34).
 * `canEdit` / `canDelete` / `canCreate` stand for `DataSourceInfo` / `RecordInfo`, which have no
 * SDK equivalent (D1): they pass and Dataverse refuses what the user may not do.
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
    },
    edit: {
      visible: true,
      enabled: Boolean(selected?.canEdit) && isActive,
    },
    activate: { visible: Boolean(selected) && isInactive, enabled: Boolean(selected?.canEdit) },
    deactivate: {
      visible: Boolean(selected) && isActive,
      enabled: Boolean(selected?.canEdit) && activeCount > 1,
    },
    delete: {
      visible: true,
      enabled: Boolean(selected?.canDelete) && !undeletableStatus && tranches.length > 1,
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

/**
 * The DSRA/DSRF CARD's own Activate / Deactivate button (`con_DSRA_DSRF_Data_Deactivate`,
 * canvas 1.21.753). It is separate from the category command bar above (Orders 2 and 5 only)
 * and was missing from the code app, which left `toggleDsraStatus` unreachable.
 *   Visible     always on the DSRA/DSRF card (Order 4) — the control has no Visible rule
 *   DisplayMode `=` (blank → Edit); the code app also requires the record and edit rights
 *   Text        `If(locStatus.Status = Active, "Deactivate", "Activate")`
 */
export const DSRA_TOGGLE_LABEL = {
  /** `con_DSRA_DSRF_Data_Deactivate.Text` — Active branch. */
  deactivate: "Deactivate",
  /** `con_DSRA_DSRF_Data_Deactivate.Text` — else branch. */
  activate: "Activate",
} as const;

export function dsraCardToggle(
  order: number, status: number | null, canEditRecord: boolean,
): { visible: boolean; enabled: boolean; label: string } {
  return {
    visible: order === CATEGORY_ORDER.dsraDsrf,
    enabled: canEditRecord,
    label: status === CHOICE_FINANCE.status.active ? DSRA_TOGGLE_LABEL.deactivate : DSRA_TOGGLE_LABEL.activate,
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

/* ══════════════════════════════════════════════════════════════ screen captions ══ */

/**
 * `Assumptions Banks SQL` — one row per bank (`colAssumptionBanks`). The shape
 * `bankDisplayName` already takes, named so the data seam can type its hook with it.
 */
export interface BankRow { id: string; bankname: string }

/**
 * Rule 2 — `locProjectTechnology = Lower(Text(Technology))`. Moved here from the old
 * `hooks.ts` (it is pure; the hooks no longer map rows).
 */
export const toDebtTech = (t: FinanceProject["technology"]): DebtTech =>
  t === "Wind" ? "wind" : t === "PV" ? "pv" : "other";

/**
 * `gal_ProjectFinance_DisplayProject_Body_Form_FinancingInputs.Items` —
 * `Filter(colFinanceCategoriesInProject, Not(Order = 6))`: Cash Sweep has no card.
 */
export const CATEGORY_CARD_ORDERS: readonly number[] = [
  CATEGORY_ORDER.equity, CATEGORY_ORDER.vatFinancing, CATEGORY_ORDER.seniorDebt,
  CATEGORY_ORDER.dsraDsrf, CATEGORY_ORDER.decommissioning,
];

/** The `[PLN]` / `[EUR]` suffix every money caption on this screen appends. */
export const currencySuffix = (country: string | null): string =>
  country === "Poland" ? "[PLN]" : "[EUR]";

/**
 * Every visible caption of `Project Finance Screen` that `MSG`, `TRANCHE_FORM_LABEL`,
 * `DSRA_TOGGLE_LABEL` and `PAGE_LOCK_TITLE` do not already carry. Each cites the canvas
 * `Control.Property` it is transcribed from, verbatim — typos and trailing spaces included.
 */
export const FIN_LABEL = {
  /** `lbl_ProjectFinance_FinancingOptions.Text` */
  financingOptions: "Financing Options",
  /** `OnVisible.locLoadingSpinnerInformationText` */
  loading: "Please wait, loading financing inputs for project...",

  /* ── category command bar (`pcf_ProjectRevenues_Content_ContractCommandBar_2.Items`) ── */
  /** `ItemDisplayName: "Edit " & Switch(…)` */
  editPrefix: "Edit ",
  /** `ItemDisplayName: "Activate " & Switch(…)` */
  activatePrefix: "Activate ",
  /** `ItemDisplayName: "Deactivate " & Switch(…)` */
  deactivatePrefix: "Deactivate ",
  /** `Switch(ThisItem.Order, 1, "Equity", …)` */
  equityNoun: "Equity",
  /** `Switch(ThisItem.Order, …, 2, "Tranche", ThisItem.Name)` — Order 2 is VAT-Financing. */
  trancheNoun: "Tranche",

  /* ── senior-debt command bar (`pcf_FinancingInputs_Content_SeniroDebtTranche_CommandBar.Items`) ── */
  /** `ItemKey "AddFinanceInput"` */
  addTranche: "Add Tranche",
  /** `ItemKey "EditFinanceInput"` */
  editTranche: "Edit Tranche",
  /** `ItemKey "ActivateFinanceInput"` */
  activateTranche: "Activate Tranche",
  /** `ItemKey "DeactivateFinanceInput"` */
  deactivateTranche: "Deactivate Tranche",
  /** `ItemKey "DeleteFinancingInput"` */
  delete: "Delete",
  /** `btn_FinancingInput_DisplayProject_Body_Form_SeniorDebt_CardHeader_RowTransparent.Tooltip` */
  seniorDebtTooltip: "Senior Debt",

  /* ── category cards (read-only display) ── */
  /** `lbl_EquityData_FreeEquityEUR_1.Text` — `"Free Equity " & <unit>` */
  freeEquityPrefix: "Free Equity ",
  /** `lbl_EquityData_ShareholderLoanEUR_1.Text` — `"Shareholder Loan " & <unit>` */
  shareholderLoanPrefix: "Shareholder Loan ",
  /** `lbl_VATFinancingData_BaseRate_2.Text` */
  baseRate: "Base Rate",
  /** `lbl_VATFinancingData_BankMargin_1.Text` */
  bankMargin: "Bank Margin [%]",
  /** `lbl_VATFinancingData_VATFacilityAmountEUR_1.Text` — `"VAT Facility Amount " & <unit>` */
  vatFacilityAmountPrefix: "VAT Facility Amount ",
  /** `lbl_SeniorDebt_Data_Display_Card_General_Tag.Text` */
  generalTag: "General",
  /** `lbl_SeniorDebt_Data_Display_Card_Conditions_Tag.Text` */
  conditionsTag: "Conditions",
  /** `lbl_SeniorDebt_Data_Display_Card_Gearing.Text` */
  gearing: "Gearing",
  /** `lbl_SeniorDebt_Data_Display_Card_Amount.Text` */
  amount: "Amount",
  /** `lbl_SeniorDebt_Data_Display_Card_StartRepayment.Text` */
  startRepayment: "Start Repayment",
  /** `lbl_SeniorDebt_Data_Display_Card_Tenor.Text` */
  tenor: "Tenor",
  /** `lbl_SeniorDebt_Data_Display_Card_RepaymentProfile.Text` */
  repaymentProfile: "Repayment Profile",
  /** `lbl_SeniorDebt_Data_Display_Card_DSCRContracted.Text` */
  dscrContracted: "DSCR Contracted",
  /** `lbl_SeniorDebt_Data_Display_Card_DSCRUncontracted.Text` */
  dscrUncontracted: "DSCR Uncontracted",
  /** `lbl_SeniorDebt_Data_Display_Card_EnergyYield_DebtSizing.Text` */
  energyYieldDisplay: "Energy Yield (Debt Sizing)",
  /** `lbl_SeniorDebt_Data_Display_Card_SpotCurve_DebtSizing.Text` */
  spotCurveDisplay: "Spot Curve (Debt Sizing)",
  /** `lbl_SeniorDebt_Data_Display_Card_UpfrontFee.Text` — `$"Upfront Fee {<[%] or unit>}"` */
  upfrontFeePrefix: "Upfront Fee ",
  /** `lbl_SeniorDebt_Data_Display_Card_Hedging.Text` */
  hedging: "Hedging [%]",
  /** `lbl_SeniorDebt_Data_Display_Card_FixedInterestRate.Text` */
  fixedInterestRate: "Fixed Interest Rate",
  /** `lbl_SeniorDebt_Data_Display_Card_StepUp_Margin.Text` */
  stepUpMarginDisplay: "Step-Up Margin",
  /** `lbl_Decommissioning_Data_Display_Card_Cost_of_Decommissioning_1.Text` — `& <unit>` */
  totalCostsOfDecommissioningPrefix: "Total Costs of Decommissioning ",
  /** `lbl_Decommissioning_Data_Display_Card_Cost_of_Guarantee_1.Text` */
  costOfGuarantee: "Cost of Guarantee [%]",
  /** `lbl_Decommissioning_Data_Display_Card_Date_of_Issue_1.Text` */
  dateOfIssue: "Date of Issue",
  /** `lbl_Decommissioning_Data_Display_Card_Date_of_Expiry_1.Text` */
  dateOfExpiry: "Date of Expiry",
  /** `lbl_Decommissioning_Data_Display_Card_Start_Date_of_Saving_1.Text` */
  startDateOfSaving: "Start Date of Saving",
  /** `lbl_Decommissioning_Data_Display_Card_Duration_of_Saving_1.Text` */
  durationOfSavingDisplay: "Duration of Saving [Year/Month]",
  /** `lbl_Decommissioning_Data_Display_Card_Duration_of_Saving_3.Text` */
  type: "Type",
  /** `lbl_Decommissioning_Data_Display_Card_Date_of_Expiry_3.Text` */
  margin: "Margin [%]",
  /** `lbl_Decommissioning_Data_Display_Card_Start_Date_of_Saving_3.Text` */
  upfrontFeePercent: "Upfront Fee [%]",
  /** `lbl_Decommissioning_Data_Display_Card_Duration_of_Saving_4.Text` */
  percentageOfFutureDebtService: "Percentage of Future Debt Service [%]",
  /** `lbl_Decommissioning_Data_Display_Card_Duration_of_Saving_5.Text` (the YAML's trailing spaces are outside the string literal) */
  durationOfFutureDebtService: "Duration of Future Debt Service",
  /** `lbl_Decommissioning_Data_Display_Card_Duration_of_Saving_6.Text` */
  endOfDebtServiceSavings: "End of Debt Service Savings",
  /** `con_DSRA_DSRF_Data_Edit.Text` */
  edit: "Edit",

  /* ── panels ── */
  /** `lbl_con_GeneralData_RightPanel_Equity_FormHeader.Text` */
  equityTitle: "Edit Equity",
  /** `lbl_EquityData_FreeEquity.Text` */
  freeEquity: "Free Equity",
  /** `but_Milestones_DisplayProject_Body_General_Content_farmdown_Reset_2.Tooltip` */
  resetTo10: "Reset to 10%.",
  /**
   * `lbl_con_GeneralData_RightPanel_VATFinancing_FormHeader.Text` — SOURCE DEFECT: the VAT
   * financing panel's header literal is "Add Tranche" in the canvas. Reproduced verbatim.
   */
  vatTitle: "Add Tranche",
  /** `but_Milestones_DisplayProject_Body_General_Content_farmdown_Reset_3.Tooltip` (and the other "reset to standard" icons) */
  resetToStandard: "Reset to standard assumption.",
  /** `lbl_VATFinancingData_BaseRate_1.Text` */
  vatFacilityAmount: "VAT Facility Amount",
  /** `lbl_con_GeneralData_RightPanel_SeniorDebt_FormHeader_1.Text` — blank-selection branch */
  addTrancheTitle: "Add Tranche",
  /** `lbl_con_GeneralData_RightPanel_SeniorDebt_FormHeader_1.Text` — else branch */
  editTrancheTitle: "Edit Tranche",
  /** `lbl_SeniorDebtData_TrancheStatus_ErrorMessage.Text` */
  standardTrancheCantBeAdded: "Standard Assumption Tranche can't be added",
  /** `lbl_SeniorDebtData_VATFacilityAmountEUR_20.Text` */
  otherBank: "Other Bank",
  /** `ico_SeniorDebt_Data_Financial_Close_Reset.Tooltip` */
  resetFinancialClose: "Reset to current project Cluster 5 date minus 3 months.",
  /** `lbl_SeniorDebtData_DSCR_Contracted_ErrorMessage.Tooltip` (and `…_Uncontracted_…`) */
  dscrTooltip: "Enter a value between 1.00x and 2.50x with 2 decimals.",
  /** `lbl_SeniorDebtData_BaseRate_5.Text` */
  energyYield: "Energy Yield [Debt Sizing]",
  /** `lbl_SeniorDebtData_BaseRate_6.Text` */
  spotCurve: "Spot Curve [Debt Sizing]",
  /** `lbl_SeniorDebtData_Fixed_Amount_Options.Text` */
  fixedAmount: "Fixed Amount",
  /** `lbl_SeniorDebtData_VATFacilityAmountEUR_6.Text` — `% of Capex` branch */
  percentOfCapex: "% of Capex",
  /** `lbl_SeniorDebtData_VATFacilityAmountEUR_6.Text` — `"Fixed Value " & <unit>` */
  fixedValuePrefix: "Fixed Value ",
  /** `lbl_SeniorDebtData_BankMargin_6.Text` */
  startRepaymentYears: "Start Repayment [Years from COD]",
  /** `lbl_SeniorDebtData_BankMargin_7.Text` */
  frequencyOfRepayment: "Frequency of Repayment",
  /** `lbl_SeniorDebtData_RepaymentAmount.Text` — `$"{Year} - Repayment Amount " & <unit>` */
  repaymentAmountInfix: " - Repayment Amount ",
  /** `lbl_SeniorDebtData_VATFacilityAmountEUR_14.Text` — `$"Upfront fee {<[%] or unit>}"` */
  upfrontFeeValuePrefix: "Upfront fee ",
  /** `tgl_SeniorDebtData_Step_Up_Bank_Margin.Label` */
  stepUpBankMargin: "Step-Up Bank Margin",
  /** `lbl_SeniorDebtData_StepUp_Bank_Margin_Year.Text` — `$"Year {…} to"` */
  stepUpYearPrefix: "Year ",
  stepUpYearSuffix: " to",
  /** `btn_SeniorDebt_BankMargin_Remove_StepUp_LastPeriod.Text` */
  removeLastPeriod: "Remove Last Period",
  /** `btn_SeniorDebt_BankMargin_Add_StepUp_Period_1.Text` */
  addStepUpPeriod: "Add Step-Up Period",
  /** `tgl_SeniorDebt_Data_Swap_After_Fixed_Period.Label` — the trailing space is the canvas's. */
  swapAfterFixedPeriod: "Swap After Fixed Period ",
  /** `lbl_con_GeneralData_RightPanel_Decommissioning_FormHeader_1.Text` */
  decommissioningTitle: "Edit Decommissioning Cost",
  /** `lbl_DecommissioningData_BaseRate_1.Text` */
  costsOfDecommissioning: "Costs of Decommissioning",
  /** `lbl_DecommissioningData_BankMargin_1.Text` — Per Turbine branch, `"…[" & <PLN|EUR> & "/WTG]"` */
  costsOfDecommissioningPerWtgPrefix: "Costs of Decommissioning [",
  costsOfDecommissioningPerWtgSuffix: "/WTG]",
  /** `ico_DecommissioningData_Date_of_Issue_Reset_to_Standard_1.Tooltip` — the live (uncommented) string */
  resetDateOfIssue: "Reset to current Cluster 5 date.",
  /** `ico_DecommissioningData_Start_Date_of_Saving_Reset_to_Standard_1.Tooltip` */
  resetStartDateOfSaving: "Reset to current project COD date.",
  /** `lbl_DecommissioningData_Duration_of_Saving_1.Text` */
  durationOfSaving: "Duration of Saving",
  /** `lbl_DecommissioningData_End_Date_of_Savin_1.Text` */
  endDateOfSaving: "End Date of Saving",
  /** `ico_DecommissioningData_Date_of_Expiry_Reset_1.Tooltip` */
  resetDateOfExpiry: "Reset to current project end date.",
  /** `lbl_DecommissioningData_Duration_of_Saving_ErrorMessage_1.Text` (and the DSRA duration's) */
  zeroDurationNotAllowed: "0 Year and 0 Months are not allowed to be selected",
  /** `lbl_DecommissioningData_End_Date_of_Saving_ErrorMessage_1.Text` */
  endDateOfSavingAfterEnd: "End Date of Saving must not be later than Project End Date",
  /** `lbl_con_GeneralData_RightPanel_DSRA_DRSF_FormHeader.Text` */
  dsraTitle: "Edit DSRF/DSRA",

  /* ── dialogs (`cmp_PopUp_Confirmation`) ── */
  /** `*.CancelButtonText` */
  cancel: "Cancel",
  /** `cmp_PopUp_ActivationForSeniorDebtTranche.ConfirmButtonText`, `cmp_PopUp_Confirmation_3.ConfirmButtonText` */
  confirm: "Confirm",

  /* ── placeholders (`InputTextPlaceholder`) ── */
  /** `cmb_SeniorDebt_Data_Bank.InputTextPlaceholder` (Y:9387) */
  findBank: "Find Bank",
  /** `cmb_DecommissioningData_Duration_of_Saving_YY_1` / `cmb_DSRA_DRSFData_*_YY.InputTextPlaceholder` (Y:14915, 15890, 16536) */
  yearPlaceholder: "Year",
  /** `cmb_DecommissioningData_Duration_of_Saving_MM_1` / `cmb_DSRA_DRSFData_*_MM.InputTextPlaceholder` (Y:14950, 15940, 16589) */
  monthPlaceholder: "Month",
} as const;

/**
 * The panel inputs' canvas `MaxLength` (Y:7680 … 16366). Most are 20; Free Equity is 9, the VAT bank
 * margin 6 and the decommissioning value 15 — those three cut typing short in the canvas. Added
 * 21 Oct 2026 (audit, MISSING before).
 */
export const PANEL_MAX_LENGTH = {
  freeEquity: 9,
  vatBankMargin: 6,
  vatFacilityAmount: 20,
  decommissioningValue: 15,
  other: 20,
} as const;

/** `Choices('Financing Options')` — the two names `rad_ProjectFinance_FinancingOptions.OnChange` compares. */
export const FINANCING_OPTION_LABEL: Readonly<Record<number, string>> = Object.freeze({
  [CHOICE_FINANCE.financingOptions.allEquity]: "All Equity",
  [CHOICE_FINANCE.financingOptions.debtFinancing]: "Debt Financing",
});

/** `'Status (Financing Inputs)'.Active` / `.Inactive` — `lbl_Generator_GeneratorStatus_1.Text`. */
export const STATUS_LABEL: Readonly<Record<number, string>> = Object.freeze({
  [CHOICE_FINANCE.status.active]: "Active",
  [CHOICE_FINANCE.status.inactive]: "Inactive",
});

/**
 * Option-set names as the canvas formulas spell them (`'<Option Set>'.'<Name>'`) — each is the
 * radio caption Power Apps renders from `Choices(...)`. Keyed by option-set value, in value order.
 */
export const CHOICE_LABEL = {
  /** `'Free Equity Options'.Percentage` / `.'Fixed Value'` (`rad_EquityData_FreeEquity`) */
  freeEquity: {
    [CHOICE_FINANCE.freeEquity.percentage]: "Percentage",
    [CHOICE_FINANCE.freeEquity.fixedValue]: "Fixed Value",
  },
  /** `'VAT Facility Amount Options'.Calculated` / `.Individual` */
  vatFacilityAmount: {
    [CHOICE_FINANCE.vatFacilityAmount.calculated]: "Calculated",
    [CHOICE_FINANCE.vatFacilityAmount.individual]: "Individual",
  },
  /** `'Drawdown Options'.'Equity First'` / `.'Pro Rata'` (`rad_SeniorDebt_Data_Drawdown`) */
  drawdown: {
    [CHOICE_FINANCE.drawdown.equityFirst]: "Equity First",
    [CHOICE_FINANCE.drawdown.proRata]: "Pro Rata",
  },
  /** `'Energy Yield (Debt Sizing)'.p50` / `.p75` / `.p90` */
  energyYield: {
    [CHOICE_FINANCE.energyYieldDebtSizing.p50]: "p50",
    [CHOICE_FINANCE.energyYieldDebtSizing.p75]: "p75",
    [CHOICE_FINANCE.energyYieldDebtSizing.p90]: "p90",
  },
  /** `'Spot Curve Options'.'Low Curve'` / `.'Average Low/Central Curve'` / `.'Central Curve'` */
  spotCurve: {
    [CHOICE_FINANCE.spotCurve.lowCurve]: "Low Curve",
    [CHOICE_FINANCE.spotCurve.averageLowCentralCurve]: "Average Low/Central Curve",
    [CHOICE_FINANCE.spotCurve.centralCurve]: "Central Curve",
  },
  /** `'Gearing Options'.'Debt Sizing'` / `.'Fixed Amount'` */
  gearing: {
    [CHOICE_FINANCE.gearing.debtSizing]: "Debt Sizing",
    [CHOICE_FINANCE.gearing.fixedAmount]: "Fixed Amount",
  },
  /** `'Fixed Amount Options'.'% of Capex'` / `.'Fixed Value'` */
  fixedAmount: {
    [CHOICE_FINANCE.fixedAmount.percentOfCapex]: "% of Capex",
    [CHOICE_FINANCE.fixedAmount.fixedValue]: "Fixed Value",
  },
  /** `'Repayment Profile'.'Straight Line'` / `.'DSCR Sculpted'` / `.Individual` */
  repaymentProfile: {
    [CHOICE_FINANCE.repaymentProfile.straightLine]: "Straight Line",
    [CHOICE_FINANCE.repaymentProfile.dscrSculpted]: "DSCR Sculpted",
    [CHOICE_FINANCE.repaymentProfile.individual]: "Individual",
  },
  /** `'Upfront Fee'.'Percentage of Debt'` / `.Fixed` */
  upfrontFee: {
    [CHOICE_FINANCE.upfrontFee.percentageOfDebt]: "Percentage of Debt",
    [CHOICE_FINANCE.upfrontFee.fixed]: "Fixed",
  },
  /** `'Commitment Fee Options'.'Percentage of Margin'` / `.Percentage` */
  commitmentFee: {
    [CHOICE_FINANCE.commitmentFee.percentageOfMargin]: "Percentage of Margin",
    [CHOICE_FINANCE.commitmentFee.percentage]: "Percentage",
  },
  /** `'Type (DSRA/DSRF)'.DSRF` / `.DSRA` — DSRF is the lower value, so it lists first. */
  dsraDsrfType: {
    [CHOICE_FINANCE.dsraDsrfType.dsrf]: "DSRF",
    [CHOICE_FINANCE.dsraDsrfType.dsra]: "DSRA",
  },
  /** `'Costs of Decommissioning'.'Per Turbine'` / `.Total` */
  costsOfDecommissioning: {
    [CHOICE_FINANCE.costsOfDecommissioning.perTurbine]: "Per Turbine",
    [CHOICE_FINANCE.costsOfDecommissioning.total]: "Total",
  },
} as const satisfies Record<string, Readonly<Record<number, string>>>;

/** `App.Formulas.colFrequencyInMonths` — the Frequency of Repayment dropdown. */
export const FREQUENCY_OPTIONS: readonly { value: number; name: string }[] = [
  { value: 1, name: "1 Month" },
  { value: 2, name: "2 Months" },
  { value: 3, name: "3 Months" },
  { value: 6, name: "6 Months" },
  { value: 12, name: "12 Months" },
];

/**
 * `App.Formulas.colYearsForDuration` / `colMonthsForDuration` — `Name: n & If(n = 1 || n = 0,
 * " year", " years")`, and the month equivalent.
 */
export const durationOptionName = (n: number, unit: "year" | "month"): string =>
  `${n} ${unit}${n === 1 || n === 0 ? "" : "s"}`;

/**
 * The `Value <= max` filter each duration dropdown puts on `colYearsForDuration`
 * (`<= 25` tenor and FIR, `< 6` repayment start, `< 4` commitment-fee period, `<= 35`
 * duration of saving, `<= 10` DSRA duration) — `[0 … max]`.
 */
export const durationRange = (max: number): number[] =>
  Array.from({ length: max + 1 }, (_, i) => i);

/**
 * `pcf_ProjectRevenues_Content_ContractCommandBar_2.Items` — `<verb> & Switch(ThisItem.Order,
 * 1, "Equity", 2, "Tranche", ThisItem.Name)`. Order 2 (VAT-Financing) reads "Tranche".
 */
export function categoryCommandLabel(
  verb: "edit" | "activate" | "deactivate", order: number, categoryName: string,
): string {
  const prefix = verb === "edit" ? FIN_LABEL.editPrefix
    : verb === "activate" ? FIN_LABEL.activatePrefix : FIN_LABEL.deactivatePrefix;
  const noun = order === CATEGORY_ORDER.equity ? FIN_LABEL.equityNoun
    : order === CATEGORY_ORDER.vatFinancing ? FIN_LABEL.trancheNoun : categoryName;
  return `${prefix}${noun}`;
}

/**
 * `cmp_PopUp_Confirmation_1` — the VAT-Financing / Decommissioning activation dialog.
 *   Title       `If(Active, "Deactivate", "Activate") & Switch(Order, 5, " Decommissioning Cost", " Tranche")`
 *   Description `"Are you sure you want to " & If(Active, "deactivate", "activate") &
 *                Switch(Name, "Decommissioning Costs", " Decommissioning Cost?", " tranche for VAT Financing Input?")`
 *   Confirm     `If(Active, "Deactivate", "Activate")`
 * NOTE the title switches on ORDER and the description on the category NAME.
 */
export function categoryToggleDialog(
  status: number | null, order: number, categoryName: string,
): { title: string; description: string; confirmText: string } {
  const active = status === CHOICE_FINANCE.status.active;
  const verb = active ? "Deactivate" : "Activate";
  return {
    title: verb + (order === CATEGORY_ORDER.decommissioning ? " Decommissioning Cost" : " Tranche"),
    description: "Are you sure you want to " + (active ? "deactivate" : "activate")
      + (categoryName === "Decommissioning Costs"
        ? " Decommissioning Cost?" : " tranche for VAT Financing Input?"),
    confirmText: verb,
  };
}

/**
 * `cmp_PopUp_ActivationForSeniorDebtTranche` — one dialog for activation AND deletion.
 *   Title       `If(action = "Activation", $"{If(Active, "Deactivate", "Activate")} Trache",
 *                action = "Deletion", "Delete Tranche")` — "Trache" is the canvas's typo.
 *   Description `$"Are you sure you want to {Deactivate|Activate} ""{name}"" tranche?"` /
 *               `$"Are you sure you want to Delete ""{name}"" tranche?"`
 */
export function trancheActionDialog(
  action: "activation" | "deletion", status: number | null, trancheName: string,
): { title: string; description: string } {
  if (action === "deletion") {
    return {
      title: "Delete Tranche",
      description: `Are you sure you want to Delete "${trancheName}" tranche?`,
    };
  }
  const verb = status === CHOICE_FINANCE.status.active ? "Deactivate" : "Activate";
  return {
    title: `${verb} Trache`,
    description: `Are you sure you want to ${verb} "${trancheName}" tranche?`,
  };
}

/**
 * `cmp_PopUp_Confirmation_3` — the DSRA/DSRF card's activation dialog.
 *   Title       `If(Active, "Deactivate DSRA/DSRF...", "Activate DSRA/DSRF...")`
 *   Description `"Are you sure you want to " & If(Active, "deactivate DSRA/DSRF ?", "activate DSRA/DSRF ?")`
 */
export function dsraToggleDialog(status: number | null): { title: string; description: string } {
  const active = status === CHOICE_FINANCE.status.active;
  return {
    title: active ? "Deactivate DSRA/DSRF..." : "Activate DSRA/DSRF...",
    description: "Are you sure you want to "
      + (active ? "deactivate DSRA/DSRF ?" : "activate DSRA/DSRF ?"),
  };
}

/* ═════════════════════════════════════════════════════════════════ columns ══ */

/** `vsb_projects.vsb_financingoptions` — `'Financing Options'` (`Vsb_projectsvsb_financingoptions`). */
export const PROJECT_FINANCING_OPTIONS_COL = "vsb_financingoptions";

/** `Financing Inputs` columns (verified against the generated `Vsb_financinginputsModel`, D34). */
export const INPUT_COL = {
  id: "vsb_financinginputid",
  name: "vsb_name",
  project: "_vsb_project_value",
  category: "_vsb_financingcategory_value",
  uniqueKeyString: "vsb_uniquekeystring",
  isFolded: "vsb_isfolded",
  freeEquity: "vsb_freeequity",
  freeEquityValue: "vsb_freeequityvalue",
  shareholderLoanValue: "vsb_shareholderloanvalue",
  baseRate: "vsb_baserate",
  bankMargin: "vsb_bankmargin",
  vatFacilityAmount: "vsb_vatfacilityamount",
  vatFacilityAmountValue: "vsb_vatfacilityamountvalue",
  isDeactivatedByButton: "vsb_isdeactivatedbybutton",
  trancheStatus: "vsb_tranchestatus",
  bank: "vsb_bank",
  otherBankName: "vsb_otherbankname",
  kfwTranche: "vsb_kfwtranche",
  kfwTrancheValue: "vsb_kfwtranchevalue",
  financialClose: "vsb_financialclose",
  tenorDurationYear: "vsb_tenordurationyear",
  tenorDurationMonth: "vsb_tenordurationmonth",
  drawdown: "vsb_drawdown",
  gearing: "vsb_gearing",
  fixedAmount: "vsb_fixedamount",
  fixedAmountValue: "vsb_fixedamountvalue",
  repaymentProfile: "vsb_repaymentprofile",
  startRepaymentYear: "vsb_startrepaymentyear",
  startRepaymentMonth: "vsb_startrepaymentmonth",
  frequencyOfRepayment: "vsb_frequencyofrepayment",
  hedging: "vsb_hedging",
  upfrontFee: "vsb_upfrontfee",
  upfrontFeeValue: "vsb_upfrontfeevalue",
  commitmentFee: "vsb_commitmentfee",
  commitmentFeeValue: "vsb_commitmentfeevalue",
  commitmentFeePeriodYear: "vsb_commitmentfeeperiodyear",
  commitmentFeePeriodMonth: "vsb_commitmentfeeperiodmonth",
  swapMargin: "vsb_swapmargin",
  swapRate: "vsb_swaprate",
  bankRate: "vsb_bankrate",
  bankMarginConstructionPhase: "vsb_bankmarginconstructionphase",
  bankMarginOperationalPhase: "vsb_bankmarginoperationalphase",
  fixedInterestRateYear: "vsb_fixedinterestrateyear",
  fixedInterestRateMonth: "vsb_fixedinterestratemonth",
  swapAfterFixedPeriod: "vsb_swapafterfixedperiod",
  stepUpBankMargin: "vsb_stepupbankmargin",
  spotCurveDebtSizing: "vsb_spotcurvedebtsizing",
  energyYieldDebtSizing: "vsb_energyyielddebtsizing",
  dscrContractedDecimal: "vsb_dscrcontracteddecimal",
  dscrUncontractedDecimal: "vsb_dscruncontracteddecimal",
  trackStatusActive: "vsb_trackstatusactive",
  seniorDebtStandardAssumptionJson: "vsb_seniordebtstandardassumptionjson",
  typeDsraDsrf: "vsb_typedsradrsf",
  margin: "vsb_margin",
  percentageOfFutureDebtService: "vsb_percentageoffuturedebtservice",
  durationOfFutureDebtServiceMmyy: "vsb_durationoffuturedebtservicemmyy",
  endOfDebtServiceSavings: "vsb_endofdebtservicesavings",
  dsraOriginalStatusActive: "vsb_dsradsrforiginalstatusactive",
  dsraStandardAssumptionsJson: "vsb_dsradrsfstandardassumptionsjson",
  costsOfDecommissioning: "vsb_costsofdecommissioning",
  costsOfDecommissioningValue: "vsb_costsofdecommissioningvalue",
  costOfGuarantee: "vsb_costofguarantee",
  dateOfIssue: "vsb_dateofissue",
  dateOfExpiry: "vsb_dateofexpiry",
  startDateOfSaving: "vsb_startdateofsaving",
  durationOfSaving: "vsb_durationofsaving",
  decommissioningStandardAssumptionJson: "vsb_decommissioningstandardassumptionjson",
  isStandardValue: "vsb_isstandardvalue",
  owningBusinessUnit: "_owningbusinessunit_value",
} as const;

/** `Financing Inputs Repayment Amounts` columns (`Vsb_financinginputsrepaymentamountsModel`). */
export const REPAYMENT_COL = {
  id: "vsb_financinginputsrepaymentamountid",
  name: "vsb_name",
  project: "_vsb_project_value",
  financingInput: "_vsb_financinginput_value",
  category: "_vsb_financingcategory_value",
  /** A TEXT column — `Text(Item.Year)` in the canvas. */
  year: "vsb_repaymentyear",
  amount: "vsb_repaymentamount",
} as const;

/** `Financing Input Step Up margins` columns (`Vsb_financinginputstepupmarginsesModel`). */
export const STEPUP_COL = {
  id: "vsb_financinginputstepupmarginsid",
  name: "vsb_name",
  project: "_vsb_project_value",
  financingInput: "_vsb_financinginput_value",
  category: "_vsb_financingcategory_value",
  order: "vsb_order",
  startYear: "vsb_startyear",
  duration: "vsb_duration",
  /** `'Margin '` — the trailing space is in the display name only. */
  margin: "vsb_margin",
} as const;

/** The navigation properties the writes bind (`<nav>@odata.bind`). */
export const FIN_NAV = {
  project: "vsb_Project",
  category: "vsb_FinancingCategory",
  financingInput: "vsb_FinancingInput",
  owningBusinessUnit: "owningbusinessunit",
} as const;

/** `statuscode` paired with each `statecode` (`Vsb_financinginputsstatuscode`: 1 Active, 2 Inactive). */
export const STATUS_REASON = { active: 1, inactive: 2 } as const;

/* ═══════════════════════════════════════════════════════════════════ row types ══ */

/** One `Financing Inputs` row as the screen consumes it. */
export interface FinancingInputRow {
  id: string;
  name: string;
  categoryId: string | null;
  /** The category's `Order` — 1 Equity … 5 Decommissioning (see `CATEGORY_ORDER`). */
  categoryOrder: number;
  uniqueKeyString: string | null;
  /** `statecode` — `CHOICE_FINANCE.status`. */
  status: number;
  /** The row keyed by Dataverse column name (`INPUT_COL`). */
  raw: Record<string, unknown>;
  /** `RecordInfo(…, Edit/DeletePermission)` — no SDK equivalent (D1): true, Dataverse decides. */
  canEdit: boolean;
  canDelete: boolean;
}

/** One `Financing Inputs Repayment Amounts` row. */
export interface StoredRepaymentRow {
  id: string;
  financingInputId: string;
  year: number;
  amount: number;
}

/** One `Financing Input Step-Up margins` row, with its parent tranche. */
export interface StoredStepUpMarginRow extends StoredStepUpRow {
  id: string;
  financingInputId: string;
}

/** `FinancingInputStatus` of a row (the cascade and the toggles read it). */
export function inputStatus(row: FinancingInputRow): FinancingInputStatus {
  const flag = (v: unknown): boolean | null => (typeof v === "boolean" ? v : null);
  const n = row.raw[INPUT_COL.dsraOriginalStatusActive];
  return {
    id: row.id,
    categoryOrder: row.categoryOrder,
    status: row.status,
    trackStatusActive: flag(row.raw[INPUT_COL.trackStatusActive]),
    isDeactivatedByButton: flag(row.raw[INPUT_COL.isDeactivatedByButton]),
    dsraOriginalStatusActive: typeof n === "number" ? n : null,
  };
}

/* ═════════════════════════════════════════════════════════════════ texts ══ */

/** The canvas progress texts (`locLoadingSpinnerInformationText`) of each write. */
export const SPINNER = {
  /** `rad_ProjectFinance_FinancingOptions.OnChange` and the tranche Save. */
  saving: "Please wait, Saving...",
  /** `pcf_btn_GeneralData_RightPanel_Equity_Form_Buttons_Save.OnChange`. */
  equity: "Saving Financing Input for Equity...",
  /** `pcf_btn_GeneralData_RightPanel_VATFinancing_Form_Buttons_Save.OnChange`. */
  vat: "Saving Financing Input for VAT Financing...",
  /** `pcf_btn_GeneralData_RightPanel_Decommissioning_Form_Buttons_Save_1.OnChange`. */
  decommissioning: "Saving Financing Input for Decommissioning Costs...",
  /** `pcf_btn_GeneralData_RightPanel_Equity_Form_Buttons_Save_1.OnChange` (the DSRA/DSRF Save). */
  dsra: "Please wait, saving...",
} as const;

/** `cmp_PopUp_Confirmation_1.OnConfirm` — `"Please wait, " & <verb> & <" Decommissioning Cost..." | " tranche...">`. */
export const categoryToggleSpinner = (status: number, order: number): string =>
  `Please wait, ${status === CHOICE_FINANCE.status.active ? "Deactivating" : "Activating"}${
    order === CATEGORY_ORDER.decommissioning ? " Decommissioning Cost..." : " tranche..."}`;

/** `cmp_PopUp_Confirmation_3.OnConfirm` — `$"Please wait, {deactivating|activating} DSRA/DSRF..."`. */
export const dsraToggleSpinner = (status: number): string =>
  `Please wait, ${status === CHOICE_FINANCE.status.active ? "deactivating DSRA/DSRF" : "activating DSRA/DSRF"}...`;

/** The canvas `Notify` texts around the writes (`FirstError.Message` is the failure detail). */
export const NOTIFY = {
  /** `cmp_PopUp_ActivationForSeniorDebtTranche.OnConfirm` — `$"{FirstError.Message} : Error Occured while Tranche Status change"`. */
  trancheStatus: (detail: string): string => `${detail} : Error Occured while Tranche Status change`,
  /** `pcf_btn_…_SeniorDebt_Form_Buttons_Save_1.OnChange` — `"Error while saving Senior Debt tranche: " & FirstError.Message`. */
  trancheSave: (detail: string): string => `Error while saving Senior Debt tranche: ${detail}`,
  /** `OnVisible` — `"Error while creating <X> financing input: " & FirstError.Message`, one per seed. */
  seed: (category: SeedCategory, detail: string): string => `Error while creating ${SEED_NOTIFY_NAME[category]} financing input: ${detail}`,
} as const;

/** The `<X>` of each seed's `Notify` — verbatim per `If(CountIf(…) = 0, …)` block of `OnVisible`. */
export const SEED_NOTIFY_NAME: Readonly<Record<SeedCategory, string>> = Object.freeze({
  equity: "Equity",
  vatFinancing: "VAT-Financing",
  seniorDebt: "Senior Debt",
  dsraDsrf: "Debt Service Reserve Account / Facility",
  decommissioning: "Decommissioning",
});

/** NEW texts (no canvas equivalent): the load-error state (rule 19), the Fabric notice (D2), refusals. */
export const FINANCE_SCREEN_TEXT = {
  loadFailedTitle: "Financing data is unavailable",
  loadFailedDescription: "The financing inputs of this project could not be loaded. Reload the page to try again.",
  assumptionsNotConnected:
    "The standard debt assumptions, banks and KfW tranches come from Fabric SQL (Assumptions Debt SQL, Assumptions Banks SQL, AssumptionsKfWTrancheSQL), which is not connected yet. Standard values cannot be applied, and Senior Debt, DSRA/DSRF and Decommissioning inputs are not created automatically.",
  noProject: "The project is not loaded.",
  noInput: "The financing input of this category does not exist for this project.",
  noCategory: "The financing category is missing.",
} as const;

/* ═════════════════════════════════════════════════════════════ write helpers ══ */

const ownerBind = (businessUnitId: string | null): Record<string, string> =>
  businessUnitId ? { [`${FIN_NAV.owningBusinessUnit}@odata.bind`]: bind("businessunits", businessUnitId) } : {};
const projectBind = (projectId: string): Record<string, string> =>
  ({ [`${FIN_NAV.project}@odata.bind`]: bind(ES.projects, projectId) });
const categoryBind = (categoryId: string | null): Record<string, string> =>
  (categoryId ? { [`${FIN_NAV.category}@odata.bind`]: bind(ES_FINANCE.financingCategories, categoryId) } : {});
const inputBind = (inputId: string): Record<string, string> =>
  ({ [`${FIN_NAV.financingInput}@odata.bind`]: bind(ES_FINANCE.financingInputs, inputId) });
const ymdOrNull = (d: Date | null | undefined): string | null => (d ? dateOnly(d) : null);
/** `Value(text)` — Blank (null) for blank or non-numeric text. */
export const valueOrNull = (text: string, lang: Lang = "en-US"): number | null => {
  const v = parseNumber(text, lang);
  return Number.isNaN(v) ? null : v;
};
const statePair = (status: number): Record<string, number> => ({
  statecode: status,
  statuscode: status === CHOICE_FINANCE.status.active ? STATUS_REASON.active : STATUS_REASON.inactive,
});
const update = (entitySet: string, id: string, data: Record<string, unknown>, reason: string): PlannedWrite =>
  ({ op: "update", entitySet, id, data, reason });

/* ═══════════════════════════════════════════════════════════════════ seeding ══ */

/**
 * DIVERGENCE (D34, D2) — only the seeds whose values do NOT come from Fabric SQL are created while
 * `Assumptions Debt SQL` is unconnected: Equity (10 / 90) and VAT-Financing (base rate by country,
 * 1.5, Calculated). The Senior Debt, DSRA/DSRF and Decommissioning seeds are built from the SQL
 * standard; without it they would store zeros and blanks flagged as "standard". They are withheld
 * and the screen says so.
 */
export function seedsAllowed(seeds: readonly SeedRow[], assumptionsConnected: boolean): SeedRow[] {
  return assumptionsConnected ? [...seeds] : seeds.filter((s) => s.category === "equity" || s.category === "vatFinancing");
}

/** One seed's `Patch(Defaults('Financing Inputs'), …)` as a create (rule 10). */
export function seedWrite(seed: SeedRow, project: Pick<FinanceProject, "id">): PlannedWrite {
  const data: Record<string, unknown> = {
    [INPUT_COL.name]: seed.name,
    [INPUT_COL.uniqueKeyString]: seed.uniqueKeyString,
    ...projectBind(project.id),
    ...categoryBind(seed.categoryId),
  };
  for (const [key, value] of Object.entries(seed.fields)) {
    if (key === "owningBusinessUnitId") { Object.assign(data, ownerBind(value as string | null)); continue; }
    const col = (INPUT_COL as Record<string, string>)[key];
    if (!col) continue;
    data[col] = value instanceof Date ? dateOnly(value) : value;
  }
  return { op: "create", entitySet: ES_FINANCE.financingInputs, data, reason: `create the ${SEED_NOTIFY_NAME[seed.category]} financing input` };
}

/**
 * The `OnVisible` seeds as JOBS — one per seed, because each canvas `Patch` has its own `IfError`
 * → `Notify`, so one failing seed does not stop the others.
 */
export const seedJobs = (seeds: readonly SeedRow[], project: Pick<FinanceProject, "id">): PlanJob[] =>
  seeds.map((seed) => ({
    progress: FIN_LABEL.loading,
    errorText: (detail: string) => NOTIFY.seed(seed.category, detail),
    plan: { writes: [seedWrite(seed, project)], log: [] },
  }));

/* ═════════════════════════════════════════════════════════ financing option ══ */

/**
 * `rad_ProjectFinance_FinancingOptions.OnChange` (Y:2402): `Patch(Projects, …, {'Financing Options'})`,
 * then the cascade of rule 15 in the canvas order (VAT, tranches, DSRA/DSRF). The canvas has no
 * `IfError` here; a failure shows the shared write message. The "fold all categories" step is the
 * screen's (local state).
 */
export function planFinancingOption(
  project: Pick<FinanceProject, "id"> | null, option: number, inputs: readonly FinancingInputRow[],
): WritePlan {
  if (!project) return refusePlan(FINANCE_SCREEN_TEXT.noProject);
  return {
    writes: [
      update(ES.projects, project.id, { [PROJECT_FINANCING_OPTIONS_COL]: option }, "set the project's Financing Options"),
      ...applyFinancingOptionCascade(inputs.map(inputStatus), option).map((c) =>
        update(ES_FINANCE.financingInputs, c.id, statePair(c.status), "set the financing input's status")),
    ],
    log: [],
  };
}

/* ═════════════════════════════════════════════════════════ status toggles ══ */

/** Rule 16 — the tranche Activate / Deactivate as a plan. */
export function planTrancheToggle(row: FinancingInputRow | null): WritePlan {
  if (!row) return refusePlan(FINANCE_SCREEN_TEXT.noInput);
  const t = toggleTrancheStatus(row);
  return {
    writes: [update(ES_FINANCE.financingInputs, row.id, {
      ...statePair(t.status),
      [INPUT_COL.trackStatusActive]: t.trackStatusActive,
      ...(t.isDeactivatedByButton !== undefined ? { [INPUT_COL.isDeactivatedByButton]: t.isDeactivatedByButton } : {}),
    }, "change the tranche status")],
    log: [],
  };
}

/** Rule 16 — the VAT-Financing / Decommissioning Activate / Deactivate as a plan. */
export function planCategoryToggle(row: FinancingInputRow | null): WritePlan {
  if (!row) return refusePlan(FINANCE_SCREEN_TEXT.noInput);
  const t = toggleCategoryStatus(row);
  return {
    writes: [update(ES_FINANCE.financingInputs, row.id, {
      ...statePair(t.status), [INPUT_COL.isDeactivatedByButton]: t.isDeactivatedByButton,
    }, "change the financing input's status")],
    log: [],
  };
}

/** Rule 16 — the DSRA/DSRF Activate / Deactivate as a plan. */
export function planDsraToggle(row: FinancingInputRow | null): WritePlan {
  if (!row) return refusePlan(FINANCE_SCREEN_TEXT.noInput);
  const t = toggleDsraStatus(row);
  return {
    writes: [update(ES_FINANCE.financingInputs, row.id, {
      ...statePair(t.status), [INPUT_COL.dsraOriginalStatusActive]: t.dsraOriginalStatusActive,
    }, "change the DSRA/DSRF status")],
    log: [],
  };
}

/**
 * Rule 38 — the tranche Delete (Y:8980-9000): its step-up margins and repayment amounts
 * (`RemoveIf`, concurrently in the canvas), then the tranche. Deletes go through `executePlan`,
 * which checks the SDK result (CONVENTIONS rule 14).
 */
export function planTrancheDelete(
  trancheId: string | null,
  stepUps: readonly { id: string; financingInputId: string }[],
  repayments: readonly { id: string; financingInputId: string }[],
): WritePlan {
  if (!trancheId) return refusePlan(FINANCE_SCREEN_TEXT.noInput);
  const p = trancheDeletePlan(trancheId, stepUps, repayments);
  return {
    writes: [
      ...p.stepUpIds.map((id): PlannedWrite => ({ op: "delete", entitySet: ES_FINANCE.financingInputStepUpMargins, id, reason: "delete a step-up margin of the tranche" })),
      ...p.repaymentIds.map((id): PlannedWrite => ({ op: "delete", entitySet: ES_FINANCE.financingInputsRepaymentAmounts, id, reason: "delete a repayment amount of the tranche" })),
      { op: "delete", entitySet: ES_FINANCE.financingInputs, id: p.trancheId, reason: "delete the tranche" },
    ],
    log: [],
  };
}

/* ═══════════════════════════════════════════════════════════════ panel saves ══ */

/** The Equity panel's state, with its standard flags (`locIsStandardFreeEquity` / `…ShareholderLoan`). */
export interface EquityForm { mode: FreeEquityMode; value: string; flags: EquityFlags }

/**
 * `pcf_btn_GeneralData_RightPanel_Equity_Form_Buttons_Save.OnChange` (Y:7930-7949): one update of
 * the Equity input — Name, Category, Free Equity, Free Equity Value, Shareholder Loan Value
 * (`Value` of the computed field), Project, and `'Is Standard Value'` = the flags JSON for
 * Percentage, Blank for Fixed Value. No Owning Business Unit (the canvas writes none here).
 */
export function planEquitySave(input: {
  project: FinanceProject | null; row: FinancingInputRow | null; form: EquityForm; totalCapex: number; language?: Lang;
}): WritePlan {
  const { project, row, form } = input;
  const lang = input.language ?? "en-US";
  if (!project) return refusePlan(FINANCE_SCREEN_TEXT.noProject);
  if (!row) return refusePlan(FINANCE_SCREEN_TEXT.noInput);
  const loan = shareholderLoanToSave(form.mode, form.value, input.totalCapex, project.countryName, lang);
  return {
    writes: [update(ES_FINANCE.financingInputs, row.id, {
      [INPUT_COL.name]: `${project.projectName ?? ""}-Equity`,
      ...categoryBind(row.categoryId),
      [INPUT_COL.freeEquity]: form.mode === "fixed" ? CHOICE_FINANCE.freeEquity.fixedValue : CHOICE_FINANCE.freeEquity.percentage,
      [INPUT_COL.freeEquityValue]: valueOrNull(form.value, lang),
      [INPUT_COL.shareholderLoanValue]: loan,
      ...projectBind(project.id),
      [INPUT_COL.isStandardValue]: form.mode === "percentage" ? serialiseStandardFlags(form.flags) : null,
    }, "save the Equity financing input")],
    log: [],
  };
}

/** The VAT-Financing panel's state, with `locVatFinancingStatndardValues`. */
export interface VatForm { baseRate: number | null; bankMargin: string; mode: number | null; amount: string; flags: VatFlags }

/**
 * `cmb_VATFinancingData_BaseRate.DefaultSelectedItems` (Y:8235): Poland → Wibor 3M ALWAYS; else
 * Euribor 3M while the base rate is standard; else the stored value.
 */
export function vatBaseRateDefault(country: string | null, flags: VatFlags, stored: number | null): number | null {
  if (isPoland(country)) return CHOICE_FINANCE.baseRate.wibor3M;
  if (flags.locIsStandardBaseRate) return CHOICE_FINANCE.baseRate.euribor3M;
  return stored;
}

/** `pcf_btn_…_VATFinancing_Form_Buttons_Save` `DisplayMode` (Y:8632): no dirty term. */
export function canSaveVatFinancing(form: VatForm, country: string | null, lang: Lang = "en-US"): boolean {
  if (form.baseRate === null || isBlank(form.bankMargin) || form.mode === null) return false;
  if (!validateVatBankMargin(form.bankMargin, lang).valid) return false;
  if (form.mode === CHOICE_FINANCE.vatFacilityAmount.individual) {
    return !isBlank(form.amount) && validateVatFacilityAmount(form.amount, form.mode, country, lang).valid;
  }
  return true;
}

/**
 * `pcf_btn_GeneralData_RightPanel_VATFinancing_Form_Buttons_Save.OnChange` (Y:8672-8698): Name,
 * Category, Base Rate, Bank Margin, VAT Facility Amount, `'VAT Facility Amount Value' =
 * Value(<amount field>)` (the hidden field keeps its value for Calculated), Project, flags JSON.
 */
export function planVatSave(input: {
  project: FinanceProject | null; row: FinancingInputRow | null; form: VatForm; language?: Lang;
}): WritePlan {
  const { project, row, form } = input;
  if (!project) return refusePlan(FINANCE_SCREEN_TEXT.noProject);
  if (!row) return refusePlan(FINANCE_SCREEN_TEXT.noInput);
  return {
    writes: [update(ES_FINANCE.financingInputs, row.id, {
      [INPUT_COL.name]: `${project.projectName ?? ""}-VAT-Financing`,
      ...categoryBind(row.categoryId),
      [INPUT_COL.baseRate]: form.baseRate,
      [INPUT_COL.bankMargin]: valueOrNull(form.bankMargin, input.language),
      [INPUT_COL.vatFacilityAmount]: form.mode,
      [INPUT_COL.vatFacilityAmountValue]: valueOrNull(form.amount, input.language),
      ...projectBind(project.id),
      [INPUT_COL.isStandardValue]: serialiseStandardFlags(form.flags),
    }, "save the VAT-Financing input")],
    log: [],
  };
}

/** The Decommissioning panel's state, with `locMyRecord` and `locIsDirtyDecommissiongForm`. */
export interface DecommissioningForm {
  costType: number | null; value: string; guarantee: string;
  dateOfIssue: Date | null; startDateOfSaving: Date | null; dateOfExpiry: Date | null;
  years: number | null; months: number | null;
  flags: DecommissioningFlags; dirty: boolean;
}

/** `pcf_btn_…_Decommissioning_Form_Buttons_Save_1.DisplayMode` (Y:15280-15302), term for term. */
export function canSaveDecommissioning(
  form: DecommissioningForm, project: DecommissioningDates, country: string | null, lang: Lang = "en-US",
): boolean {
  if (!form.dirty || form.costType === null || isBlank(form.value)) return false;
  if (!form.dateOfExpiry || !form.dateOfIssue || !form.startDateOfSaving || isBlank(form.guarantee)) return false;
  if (form.months === null || form.years === null) return false;
  if (!validateCostOfGuarantee(form.guarantee, lang).valid) return false;
  if (!validateDecommissioningValue(form.value, form.costType, country, lang).valid) return false;
  const end = endDateOfSaving(form.startDateOfSaving, form.months, form.years);
  if (after(end, project.endDate)) return false;
  if (form.years === 0 && form.months === 0) return false;
  if (!validateDateOfExpiry(form.dateOfExpiry, form.dateOfIssue, project).valid) return false;
  if (!validateStartDateOfSaving(form.startDateOfSaving, form.dateOfIssue, project).valid) return false;
  return validateDateOfIssue(form.dateOfIssue, project).valid;
}

/**
 * `pcf_btn_…_Decommissioning_Form_Buttons_Save_1.OnChange` (Y:15325-15350): cost type, value,
 * guarantee, the three dates, `'Duration of Saving (MMYY)' = Text(MM,"00") & Text(YY,"00")` and the
 * flags JSON. No Name, Project, Category or owner (the canvas writes none here).
 */
export function planDecommissioningSave(input: {
  row: FinancingInputRow | null; form: DecommissioningForm; language?: Lang;
}): WritePlan {
  const { row, form } = input;
  if (!row) return refusePlan(FINANCE_SCREEN_TEXT.noInput);
  return {
    writes: [update(ES_FINANCE.financingInputs, row.id, {
      [INPUT_COL.costsOfDecommissioning]: form.costType,
      [INPUT_COL.costsOfDecommissioningValue]: valueOrNull(form.value, input.language),
      [INPUT_COL.costOfGuarantee]: valueOrNull(form.guarantee, input.language),
      [INPUT_COL.dateOfIssue]: ymdOrNull(form.dateOfIssue),
      [INPUT_COL.startDateOfSaving]: ymdOrNull(form.startDateOfSaving),
      [INPUT_COL.dateOfExpiry]: ymdOrNull(form.dateOfExpiry),
      [INPUT_COL.durationOfSaving]: packMMYY(form.months ?? 0, form.years ?? 0),
      [INPUT_COL.decommissioningStandardAssumptionJson]: serialiseStandardFlags(form.flags),
    }, "save the Decommissioning financing input")],
    log: [],
  };
}

/** The DSRA/DSRF panel's state, with `locSelectedDSRA_DSRF_IsStandard`. */
export interface DsraForm {
  type: number | null; commitmentFee: string; cfYears: number | null; cfMonths: number | null;
  baseRate: number | null; margin: string; upfrontFee: string; percentage: string;
  durYears: number | null; durMonths: number | null; endOfSavings: Date | null;
  flags: DsraFlags;
}

/**
 * `cmb_DSRA_DRSFData_Duration_of_furture_debt_service_MM.DefaultSelectedItems` —
 * `Coalesce(Value(0), …)` is ALWAYS 0.
 * SOURCE DEFECT (D34): an edit reopened with 0 months and a Save then overwrote the stored months.
 * The stored months are shown here; this twin is the canvas.
 */
export const dsraDurationMonthsCanvasParity = (): number => 0;

/**
 * `cmb_DSRA_DRSFData_commitment_fee_free_period_MM.DefaultSelectedItems` (Y:15922):
 * `If(standardFlag, 0, Coalesce(stored, 0))`.
 */
export const dsraCommitmentFeeMonthsDefault = (flags: DsraFlags, stored: number | null): number =>
  (flags.locIsStandardCommitmentFeeFreeDuration ? 0 : stored ?? 0);

/** `pcf_btn_GeneralData_RightPanel_Equity_Form_Buttons_Save_1.DisplayMode` (the DSRA/DSRF Save, Y:16821). */
export function canSaveDsra(form: DsraForm, cod: Date | null, lang: Lang = "en-US"): boolean {
  if (form.type === null || isBlank(form.percentage)) return false;
  if (form.type === CHOICE_FINANCE.dsraDsrfType.dsrf) {
    if (isBlank(form.upfrontFee) || isBlank(form.commitmentFee)) return false;
    if (!validateCommitmentFeeValue(form.commitmentFee, lang).valid) return false;
    if (!validateDsraUpfrontFee(form.upfrontFee, lang).valid) return false;
  }
  if (!form.endOfSavings) return false;
  if (!validateEndOfDebtServiceSavings(form.endOfSavings, cod).valid) return false;
  if (form.durYears === 0 && form.durMonths === 0) return false;
  if (isBlank(form.margin) || !validateDsraMargin(form.margin, form.type, lang).valid) return false;
  if (form.baseRate === null) return false;
  return validatePofds(form.percentage, lang).valid;
}

/**
 * The DSRA/DSRF Save (`pcf_btn_GeneralData_RightPanel_Equity_Form_Buttons_Save_1.OnChange`,
 * Y:16870-16940): Name, Category, Type, Base Rate, Margin, the DSRF-only fields (Blank for DSRA —
 * rule 28), the percentage, End of debt service savings, MMYY, Project, flags JSON and the
 * project's Owning Business Unit.
 */
export function planDsraSave(input: {
  project: FinanceProject | null; row: FinancingInputRow | null; form: DsraForm; language?: Lang;
}): WritePlan {
  const { project, row, form } = input;
  const lang = input.language ?? "en-US";
  if (!project) return refusePlan(FINANCE_SCREEN_TEXT.noProject);
  if (!row) return refusePlan(FINANCE_SCREEN_TEXT.noInput);
  const type = form.type ?? CHOICE_FINANCE.dsraDsrfType.dsra;
  const only = dsrfOnlyFields(type, {
    commitmentFeeValue: valueOrNull(form.commitmentFee, lang),
    commitmentFeePeriodYear: form.cfYears,
    commitmentFeePeriodMonth: form.cfMonths,
    upfrontFeeValue: valueOrNull(form.upfrontFee, lang),
  });
  return {
    writes: [update(ES_FINANCE.financingInputs, row.id, {
      [INPUT_COL.name]: `${project.projectName ?? ""}-DSRF/DSRA`,
      ...categoryBind(row.categoryId),
      [INPUT_COL.typeDsraDsrf]: form.type,
      [INPUT_COL.baseRate]: form.baseRate,
      [INPUT_COL.margin]: valueOrNull(form.margin, lang),
      [INPUT_COL.commitmentFeeValue]: only.commitmentFeeValue,
      [INPUT_COL.commitmentFeePeriodYear]: only.commitmentFeePeriodYear,
      [INPUT_COL.commitmentFeePeriodMonth]: only.commitmentFeePeriodMonth,
      [INPUT_COL.percentageOfFutureDebtService]: valueOrNull(form.percentage, lang),
      [INPUT_COL.endOfDebtServiceSavings]: ymdOrNull(form.endOfSavings),
      [INPUT_COL.upfrontFeeValue]: only.upfrontFeeValue,
      [INPUT_COL.durationOfFutureDebtServiceMmyy]: packMMYY(form.durMonths ?? 0, form.durYears ?? 0),
      ...projectBind(project.id),
      [INPUT_COL.dsraStandardAssumptionsJson]: serialiseStandardFlags(form.flags),
      ...ownerBind(project.owningBusinessUnitId),
    }, "save the DSRA/DSRF financing input")],
    log: [],
  };
}

/* ══════════════════════════════════════════════════════════════ tranche save ══ */

/** Rule 17 — the tranche's `UniqueKeyString` from the form (the Save's `locSeniorDebtUniqueKeyToSave`). */
export const trancheUniqueKey = (form: SeniorDebtFormState): string =>
  buildUniqueKey({
    projectId: form.projectId,
    statusLabel: TRANCHE_STATUS_LABEL[form.trancheStatus ?? -1] ?? "",
    bankName: isOtherBank(form.bankId, form.bankName) ? "other" : form.bankName,
    bankId: form.bankId,
    otherBankName: form.otherBankName,
    kfwEnabled: form.kfwEnabled,
    kfwValue: form.kfwValue,
  });

/** `Value(Left(Text(<DSCR field>), 4))` — Blank for a blank field. */
export const dscrValue = (text: string, lang: Lang = "en-US"): number | null =>
  (isBlank(text) ? null : valueOrNull(text.slice(0, 4), lang));

/** The tranche `Patch` record (Y:13760-13850), as Dataverse columns. */
export function trancheRecord(
  form: SeniorDebtFormState, project: FinanceProject, seniorDebtCategoryId: string | null, lang: Lang = "en-US",
): Record<string, unknown> {
  const other = isOtherBank(form.bankId, form.bankName);
  return {
    [INPUT_COL.name]: `${project.projectName ?? ""} - Senior Debt`,
    ...projectBind(project.id),
    [INPUT_COL.trancheStatus]: form.trancheStatus,
    [INPUT_COL.bank]: form.bankId,
    [INPUT_COL.otherBankName]: other ? form.otherBankName.trim() : null,
    [INPUT_COL.kfwTranche]: form.kfwEnabled,
    [INPUT_COL.kfwTrancheValue]: form.kfwEnabled ? form.kfwValue : null,
    [INPUT_COL.financialClose]: ymdOrNull(form.financialClose),
    [INPUT_COL.tenorDurationMonth]: form.tenorMonths,
    [INPUT_COL.tenorDurationYear]: form.tenorYears,
    [INPUT_COL.drawdown]: form.drawdown,
    [INPUT_COL.dscrContractedDecimal]: dscrValue(form.dscrContracted, lang),
    [INPUT_COL.dscrUncontractedDecimal]: dscrValue(form.dscrUncontracted, lang),
    [INPUT_COL.energyYieldDebtSizing]: form.energyYield ?? null,
    [INPUT_COL.spotCurveDebtSizing]: form.spotCurve ?? null,
    [INPUT_COL.gearing]: form.gearing,
    [INPUT_COL.fixedAmount]: form.fixedAmountOption,
    [INPUT_COL.fixedAmountValue]: valueOrNull(form.fixedAmountValue, lang),
    [INPUT_COL.repaymentProfile]: form.repaymentProfile,
    [INPUT_COL.startRepaymentMonth]: form.startRepaymentMonths,
    [INPUT_COL.startRepaymentYear]: form.startRepaymentYears,
    [INPUT_COL.frequencyOfRepayment]: form.frequencyOfRepayment,
    [INPUT_COL.hedging]: valueOrNull(form.hedging, lang),
    [INPUT_COL.upfrontFee]: form.upfrontFeeOption,
    [INPUT_COL.upfrontFeeValue]: valueOrNull(form.upfrontFeeValue, lang),
    [INPUT_COL.commitmentFee]: form.commitmentFeeOption,
    [INPUT_COL.commitmentFeeValue]: valueOrNull(form.commitmentFeeValue, lang),
    [INPUT_COL.commitmentFeePeriodMonth]: form.commitmentFeePeriodMonths,
    [INPUT_COL.commitmentFeePeriodYear]: form.commitmentFeePeriodYears,
    [INPUT_COL.baseRate]: form.baseRate,
    // The crossed canvas names: `txt_SeniorDebtData_SwapRate` → 'Swap Margin [%]',
    // `txt_SeniorDebtData_BankMargin` → 'Bank Rate', `txt_SeniorDebtData_SwapMargin` → 'Swap Rate'.
    [INPUT_COL.swapMargin]: valueOrNull(form.swapMargin, lang),
    [INPUT_COL.bankMarginConstructionPhase]: valueOrNull(form.bankMarginConstruction, lang),
    [INPUT_COL.bankMarginOperationalPhase]: valueOrNull(form.bankMarginOperational, lang),
    [INPUT_COL.fixedInterestRateMonth]: form.fixedInterestRateMonths,
    [INPUT_COL.fixedInterestRateYear]: form.fixedInterestRateYears,
    [INPUT_COL.stepUpBankMargin]: form.stepUpEnabled,
    [INPUT_COL.swapAfterFixedPeriod]: form.swapAfterFixedPeriod,
    [INPUT_COL.bankRate]: valueOrNull(form.bankRate, lang),
    [INPUT_COL.swapRate]: valueOrNull(form.swapRate, lang),
    ...ownerBind(project.owningBusinessUnitId),
    ...categoryBind(seniorDebtCategoryId),
    [INPUT_COL.isFolded]: CHOICE_FINANCE.isFolded.true,
    [INPUT_COL.trackStatusActive]: form.trackStatusActive ?? CHOICE_FINANCE.yesNo.yes,
    [INPUT_COL.seniorDebtStandardAssumptionJson]: form.financialCloseStandard
      ? serialiseStandardFlags(DEFAULT_SENIOR_DEBT_FLAGS) : null,
    [INPUT_COL.uniqueKeyString]: trancheUniqueKey(form),
  };
}

/**
 * The tranche Save as one plan, in the canvas order: the tranche upsert; then (Individual) the
 * repayment rows whose year left the schedule are deleted and every row upserted, or (any other
 * profile) every stored repayment row deleted; then the step-up margins (rule 26). A new tranche's
 * children bind `@created#0`. Every child carries Project, Category, the tranche and the project's
 * Owning Business Unit, as the canvas `Patch`es do.
 *
 * `duplicateIds` are the ids `LookUp('Financing Inputs', UniqueKeyString = key)` found on the
 * server (all projects, as the canvas); one other than the edited tranche refuses the plan with
 * the canvas Notify text.
 */
export function planTrancheSave(input: {
  form: SeniorDebtFormState;
  project: FinanceProject | null;
  seniorDebtCategoryId: string | null;
  duplicateIds: readonly string[];
  storedRepayments: readonly { id: string; year: number; financingInputId: string }[];
  storedStepUps: readonly StoredStepUpMarginRow[];
  language?: Lang;
  stepUpCanvasParity?: boolean;
}): WritePlan {
  const { form, project } = input;
  const lang = input.language ?? "en-US";
  if (!project) return refusePlan(FINANCE_SCREEN_TEXT.noProject);
  if (input.duplicateIds.some((id) => id !== form.trancheId)) return refusePlan(MSG.duplicateTranche);
  const trancheRef = form.trancheId ?? createdRowRef(0);
  const children = {
    ...projectBind(project.id),
    ...categoryBind(input.seniorDebtCategoryId),
    ...inputBind(trancheRef),
    ...ownerBind(project.owningBusinessUnitId),
  };
  const writes: PlannedWrite[] = [
    form.trancheId
      ? update(ES_FINANCE.financingInputs, form.trancheId, trancheRecord(form, project, input.seniorDebtCategoryId, lang), "save the tranche")
      : { op: "create", entitySet: ES_FINANCE.financingInputs, data: trancheRecord(form, project, input.seniorDebtCategoryId, lang), reason: "create the tranche" },
  ];
  const ownRepayments = form.trancheId ? input.storedRepayments.filter((r) => r.financingInputId === form.trancheId) : [];
  const repay = repaymentDiff(form.repaymentProfile, form.repaymentRows, ownRepayments, lang);
  writes.push(...repay.toDelete.map((id): PlannedWrite =>
    ({ op: "delete", entitySet: ES_FINANCE.financingInputsRepaymentAmounts, id, reason: "delete a repayment amount" })));
  for (const r of repay.toUpsert) {
    const data = {
      [REPAYMENT_COL.name]: r.name,
      [REPAYMENT_COL.amount]: valueOrNull(form.repaymentRows.find((x) => x.year === r.year)?.value ?? "", lang),
      [REPAYMENT_COL.year]: String(r.year),
      ...children,
    };
    writes.push(r.recordId
      ? update(ES_FINANCE.financingInputsRepaymentAmounts, r.recordId, data, "save a repayment amount")
      : { op: "create", entitySet: ES_FINANCE.financingInputsRepaymentAmounts, data, reason: "create a repayment amount" });
  }
  const ownStepUps = form.trancheId ? input.storedStepUps.filter((s) => s.financingInputId === form.trancheId) : [];
  const steps = (input.stepUpCanvasParity ? stepUpWritesCanvasParity : stepUpWrites)(form.stepUpEnabled, form.stepUpRows, ownStepUps, lang);
  for (const s of steps.toUpsert) {
    const row = form.stepUpRows.find((x) => x.id === s.order);
    const data = {
      [STEPUP_COL.name]: `${row?.durationYY ?? ""} - Value`,
      [STEPUP_COL.duration]: s.duration,
      [STEPUP_COL.margin]: s.margin,
      ...children,
      [STEPUP_COL.startYear]: s.startYear,
      [STEPUP_COL.order]: s.order,
    };
    writes.push(s.id
      ? update(ES_FINANCE.financingInputStepUpMargins, s.id, data, "save a step-up margin")
      : { op: "create", entitySet: ES_FINANCE.financingInputStepUpMargins, data, reason: "create a step-up margin" });
  }
  writes.push(...steps.toDelete.map((id): PlannedWrite =>
    ({ op: "delete", entitySet: ES_FINANCE.financingInputStepUpMargins, id, reason: "delete a step-up margin" })));
  return { writes, log: [] };
}

/* ═══════════════════════════════════════════════════════════════════ jobs ══ */

export const financingOptionJob = (plan: WritePlan): PlanJob => ({ progress: SPINNER.saving, plan });
export const trancheToggleJob = (plan: WritePlan): PlanJob =>
  // The canvas shows no spinner for the tranche dialog; "" shows none.
  ({ progress: "", errorText: NOTIFY.trancheStatus, plan });
export const trancheDeleteJob = (plan: WritePlan): PlanJob => ({ progress: "", plan });
export const categoryToggleJob = (row: FinancingInputRow, plan: WritePlan): PlanJob =>
  ({ progress: categoryToggleSpinner(row.status, row.categoryOrder), plan });
export const dsraToggleJob = (row: FinancingInputRow, plan: WritePlan): PlanJob =>
  ({ progress: dsraToggleSpinner(row.status), plan });
export const equitySaveJob = (plan: WritePlan): PlanJob => ({ progress: SPINNER.equity, plan });
export const vatSaveJob = (plan: WritePlan): PlanJob => ({ progress: SPINNER.vat, plan });
export const decommissioningSaveJob = (plan: WritePlan): PlanJob => ({ progress: SPINNER.decommissioning, plan });
export const dsraSaveJob = (plan: WritePlan): PlanJob => ({ progress: SPINNER.dsra, plan });
export const trancheSaveJob = (plan: () => Promise<WritePlan>): PlanJob =>
  ({ progress: SPINNER.saving, errorText: NOTIFY.trancheSave, plan });

/* ═════════════════════════════════════════════════════════ tranche form open ══ */

/**
 * `rad_SeniorDebt_Data_Drawdown.DefaultSelectedItems` (Y:10072):
 * `Switch(Text(Coalesce(tranche, standard)), "Equity First", Equity First, "Pro Rate", Pro Rata, Equity First)`.
 * SOURCE DEFECT (D34): "Pro Rate" never matches the option name "Pro Rata", so a stored Pro Rata
 * reopens as Equity First and the next Save overwrites it. The stored value wins here; this twin is the canvas.
 */
export function drawdownDefaultCanvasParity(tranche: number | null, standard: number | null): number {
  void tranche; void standard;
  return CHOICE_FINANCE.drawdown.equityFirst;
}

/** The drawdown default: `Coalesce(tranche, standard)`, Equity First when both are blank. */
export const drawdownDefault = (tranche: number | null, standard: number | null): number =>
  fieldDefault(tranche, standard) ?? CHOICE_FINANCE.drawdown.equityFirst;

/** `rad_SeniorDebt_Data_EnergyYield.DefaultSelectedItems` — `Coalesce(tranche, standard)`, else p90. */
export const energyYieldDefault = (tranche: number | null, standard: number | null): number =>
  fieldDefault(tranche, standard) ?? CHOICE_FINANCE.energyYieldDebtSizing.p90;
/** `rad_SeniorDebt_Data_SpotCurve.DefaultSelectedItems` — else Low Curve. */
export const spotCurveDefault = (tranche: number | null, standard: number | null): number =>
  fieldDefault(tranche, standard) ?? CHOICE_FINANCE.spotCurve.lowCurve;
/** `rad_SeniorDebt_Data_RepaymentProfile.DefaultSelectedItems` — else DSCR Sculpted. */
export const repaymentProfileDefault = (tranche: number | null, standard: number | null): number =>
  fieldDefault(tranche, standard) ?? CHOICE_FINANCE.repaymentProfile.dscrSculpted;
/** `rad_SeniorDebtData_CommitmentFee.DefaultSelectedItems` — else Percentage of Margin. */
export const commitmentFeeOptionDefault = (tranche: number | null, standard: number | null): number =>
  fieldDefault(tranche, standard) ?? CHOICE_FINANCE.commitmentFee.percentageOfMargin;

const rawNum = (v: unknown): number | null => (typeof v === "number" ? v : null);
const rawStr = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const rawBool = (v: unknown): boolean => v === true;
/** A Date Only string from the row as a LOCAL day (rule 18). */
export function rawDay(v: unknown): Date | null {
  if (typeof v !== "string" || v.length < 10) return null;
  const [y, m, d] = v.slice(0, 10).split("-").map(Number);
  return y && m && d ? new Date(y, m - 1, d) : null;
}

/** `Text(<stored or standard>, "<pattern>")` for the panel's text inputs. */
const fmtField = (v: number | null | undefined, pattern: string): string => textFormat(v ?? null, pattern);

/**
 * Add Tranche / Edit Tranche (`pcf_FinancingInputs_Content_SeniroDebtTranche_CommandBar.OnSelect`,
 * Y:2639-2732): every field is `Coalesce(locSelectedSeniorDebtTranche.<f>, locSelectedStandardAssumption.<f>)`
 * — the standard is `standard2` on Add and blank on Edit — formatted as each control's `Value`.
 * Add opens DIRTY (`locFormIsDirty: true`, B13); Edit opens clean with the stored FC flag.
 *
 * SOURCE DEFECT (21 Oct 2026 audit, not reproduced): `locFormIsDirty` is never set back to false
 * anywhere on the screen, so after the first Add or field change of a visit EVERY later Edit opens
 * with Save enabled. Edit opens clean here. Also not reproduced: `cmb_SeniorDebt_Data_Bank`,
 * `txt_SeniorDebtData_BankName` and `txt_SeniorDebtData_BankMargin_OperationalPhase` have no
 * `OnChange`, so on a fresh visit changing only those leaves the canvas Save disabled; every field
 * change marks the form dirty here (D34 addendum).
 */
export function openTrancheForm(input: {
  existing: FinancingInputRow | null;
  project: FinanceProject;
  standard: SeniorDebtStandard | null;
  banks: readonly BankRow[];
  tranches: readonly FinancingInputRow[];
}): SeniorDebtFormState {
  const { existing, project, banks } = input;
  const r = existing?.raw ?? {};
  // On Edit the canvas blanks `locSelectedStandardAssumption`, so only the stored values count.
  const std = existing ? null : input.standard;
  const n = (col: string) => rawNum(r[col]);
  const bankId = rawStr(r[INPUT_COL.bank]);
  const fcFlags = parseStandardFlags(rawStr(r[INPUT_COL.seniorDebtStandardAssumptionJson]), DEFAULT_SENIOR_DEBT_FLAGS);
  const upfrontOption = fieldDefault(n(INPUT_COL.upfrontFee), null) ?? CHOICE_FINANCE.upfrontFee.percentageOfDebt;
  // `locSelectedFixedAmount`: `[]` on Add, `['Fixed Amount ']` on Edit (Y:2651, 2676). Corrected 21 Oct
  // 2026: Add pre-selected "% of Capex", which showed the value field the canvas keeps hidden.
  const fixedOption = n(INPUT_COL.fixedAmount);
  const tenorYears = fieldDefault(n(INPUT_COL.tenorDurationYear), std?.loanTenor);
  const startRepaymentYears = fieldDefault(n(INPUT_COL.startRepaymentYear), std ? 0 : null);
  const commitmentFeePeriodYears = fieldDefault(n(INPUT_COL.commitmentFeePeriodYear), std ? 0 : null);
  const fixedInterestRateYears = fieldDefault(n(INPUT_COL.fixedInterestRateYear), std ? 0 : null);
  return {
    formDirty: existing === null,
    isSaving: false,
    trancheId: existing?.id ?? null,
    trancheStatus: n(INPUT_COL.trancheStatus) ?? CHOICE_FINANCE.trancheStatus.standardAssumption,
    storedTrancheStatus: existing ? n(INPUT_COL.trancheStatus) : null,
    bankId,
    bankName: bankId === OTHER_BANK_SENTINEL ? "Other" : banks.find((b) => b.id === bankId)?.bankname ?? null,
    otherBankName: rawStr(r[INPUT_COL.otherBankName]) ?? "",
    kfwEnabled: rawBool(r[INPUT_COL.kfwTranche]),
    kfwValue: rawStr(r[INPUT_COL.kfwTrancheValue]),
    financialClose: existing ? rawDay(r[INPUT_COL.financialClose]) : std?.financialClose ?? null,
    financialCloseStandard: existing ? fcFlags.FinancialCloseDate : true,
    tenorYears,
    tenorMonths: trancheMonthDefault(n(INPUT_COL.tenorDurationMonth), std ? 0 : null, tenorYears),
    drawdown: drawdownDefault(n(INPUT_COL.drawdown), std?.drawdown ?? null),
    gearing: n(INPUT_COL.gearing) ?? CHOICE_FINANCE.gearing.debtSizing,
    fixedAmountOption: fixedOption,
    fixedAmountValue: fmtField(n(INPUT_COL.fixedAmountValue),
      fixedOption === CHOICE_FINANCE.fixedAmount.percentOfCapex ? "##0.0" : "#"),
    repaymentProfile: repaymentProfileDefault(n(INPUT_COL.repaymentProfile), std?.repaymentProfile ?? null),
    startRepaymentYears,
    startRepaymentMonths: trancheMonthDefault(n(INPUT_COL.startRepaymentMonth), std?.repaymentStartAfterCod, startRepaymentYears),
    frequencyOfRepayment: fieldDefault(n(INPUT_COL.frequencyOfRepayment), std?.repaymentFreq),
    hedging: fmtField(fieldDefault(n(INPUT_COL.hedging), std?.hedging), "##0.0"),
    upfrontFeeOption: upfrontOption,
    upfrontFeeValue: fmtField(fieldDefault(n(INPUT_COL.upfrontFeeValue), std?.upFrontFee),
      upfrontOption === CHOICE_FINANCE.upfrontFee.fixed ? "#" : "##0.0#"),
    commitmentFeeOption: commitmentFeeOptionDefault(n(INPUT_COL.commitmentFee), std?.commitmentFeeDefault ?? null),
    commitmentFeeValue: fmtField(fieldDefault(n(INPUT_COL.commitmentFeeValue), std?.commitmentFeePercentageOfMargin), "##0.0#"),
    commitmentFeePeriodYears,
    commitmentFeePeriodMonths: trancheMonthDefault(n(INPUT_COL.commitmentFeePeriodMonth), std?.commitmentFeeFreePeriod, commitmentFeePeriodYears),
    swapMargin: fmtField(n(INPUT_COL.swapMargin), "##0.0#"),
    bankMarginConstruction: fmtField(fieldDefault(n(INPUT_COL.bankMarginConstructionPhase), std?.bankMarginConstruction), "##0.0#"),
    bankMarginOperational: fmtField(fieldDefault(n(INPUT_COL.bankMarginOperationalPhase), std?.bankMarginOperation), "##0.0#"),
    fixedInterestRateYears,
    fixedInterestRateMonths: trancheMonthDefault(n(INPUT_COL.fixedInterestRateMonth), std?.fixedInterestRateTime, fixedInterestRateYears),
    swapAfterFixedPeriod: rawBool(r[INPUT_COL.swapAfterFixedPeriod]),
    bankRate: fmtField(n(INPUT_COL.bankRate), "##0.0#"),
    baseRate: baseRateDefault(n(INPUT_COL.baseRate), std?.baserate ?? null, project.countryName),
    swapRate: fmtField(fieldDefault(n(INPUT_COL.swapRate), std?.swapRate), "##0.0#"),
    dscrContracted: formatDscr(fieldDefault(n(INPUT_COL.dscrContractedDecimal), std?.dscrContracted)),
    dscrUncontracted: formatDscr(fieldDefault(n(INPUT_COL.dscrUncontractedDecimal), std?.dscrUncontracted)),
    energyYield: energyYieldDefault(n(INPUT_COL.energyYieldDebtSizing), std?.energyYieldDebtSizing ?? null),
    spotCurve: spotCurveDefault(n(INPUT_COL.spotCurveDebtSizing), std?.spotCurveDebtSizing ?? null),
    stepUpEnabled: rawBool(r[INPUT_COL.stepUpBankMargin]),
    stepUpRows: [],
    repaymentRows: [],
    country: project.countryName,
    otherTranches: input.tranches.filter((t) => t.id !== existing?.id).map((t) => ({
      id: t.id, trancheStatus: rawNum(t.raw[INPUT_COL.trancheStatus]), uniqueKeyString: t.uniqueKeyString,
    })),
    projectId: project.id,
    trackStatusActive: typeof r[INPUT_COL.trackStatusActive] === "boolean" ? (r[INPUT_COL.trackStatusActive] as boolean) : null,
  };
}

/**
 * Rule 37 / `rad_SeniorDebt_Data_TrancheStatus.OnChange` (Y:9239): marks the form dirty; moving TO
 * Standard Assumption re-applies `standard2` to every field; moving FROM it resets the fields and
 * blanks the fixed / commitment / upfront values; always `locFinancialCloseToShow = standard FC`
 * and the FC flag true. The selection is blanked in both branches, as the canvas does.
 */
export function applyTrancheStatusChange(input: {
  form: SeniorDebtFormState; next: number; project: FinanceProject; standard: SeniorDebtStandard | null;
  banks: readonly BankRow[]; tranches: readonly FinancingInputRow[];
}): SeniorDebtFormState {
  const { form, next, standard } = input;
  const wasStandard = form.trancheStatus === CHOICE_FINANCE.trancheStatus.standardAssumption
    || form.storedTrancheStatus === CHOICE_FINANCE.trancheStatus.standardAssumption;
  const reset = resetOnTrancheStatusChange(next, standard ?? EMPTY_SENIOR_DEBT_STANDARD);
  const base = { ...form, trancheStatus: next, formDirty: true };
  if (reset.standardApplies || wasStandard) {
    const fresh = openTrancheForm({ existing: null, project: input.project, standard: reset.standardApplies ? standard : null, banks: input.banks, tranches: input.tranches });
    // Both branches run `locSelectedSeniorDebtTranche: Blank()` (Y:9239). Corrected 21 Oct 2026 (audit):
    //  - the stored status no longer counts, so a later Term Sheet ↔ Credit Agreement change is the plain
    //    third branch and does not reset the form again (it did, because the stored SA was kept);
    //  - the Save writes `'Track Status Active?': Coalesce(<blank>.'Track Status Active?', Yes)` = Yes;
    //  - the title reads "Add Tranche" (`trancheFormTitle`). The Save still patches the edited row.
    return {
      ...fresh,
      trancheId: form.trancheId, storedTrancheStatus: null, otherTranches: form.otherTranches,
      trancheStatus: next, formDirty: true,
      fixedAmountValue: "", commitmentFeeValue: reset.standardApplies ? fresh.commitmentFeeValue : "",
      upfrontFeeValue: reset.standardApplies ? fresh.upfrontFeeValue : "",
      financialClose: reset.financialCloseToShow, financialCloseStandard: true,
      trackStatusActive: null,
      selectionCleared: form.trancheId !== null,
    };
  }
  return { ...base, financialClose: reset.financialCloseToShow ?? base.financialClose, financialCloseStandard: true };
}

/** A standard with nothing in it — what `buildSeniorDebtStandard` yields with no SQL rows. */
export const EMPTY_SENIOR_DEBT_STANDARD: SeniorDebtStandard =
  buildSeniorDebtStandard([], "other", { construction: null }, { today: new Date(2000, 0, 1) });

/* ═════════════════════════════════════════════════════════════ card formats ══ */

/** `Text(x, DateTimeFormat.LongDate)` — e.g. "Tuesday, October 20, 2026" in en-US. */
export const fmtLongDate = (d: Date | null, lang: Lang = "en-US"): string =>
  (d ? d.toLocaleDateString(lang, { weekday: "long", year: "numeric", month: "long", day: "numeric" }) : "");

/**
 * `txt_SeniorDebt_Data_Display_Card_Status_3.Value` (Y:4396): blank unless BOTH parts are set,
 * else the padded `yearMonthLabel`.
 */
export const commitmentFeeFreePeriodLabel = (years: number | null, months: number | null): string =>
  (years === null || months === null ? "" : yearMonthLabel(years, months));

/**
 * `txt_Decommissioning_Data_Display_Card_Cost_of_Guarantee_3.Value` (the DSRA card, Y:6216):
 * `Y & If(Y <= 1, " Year ", " Years ") & M & If(M <= 1, " Month ", " Months")` — unpadded, the
 * singular "Month " keeps its trailing space, and a blank part concatenates as "".
 */
export function dsraPeriodLabel(years: number | null, months: number | null): string {
  const y = years === null ? "" : String(years);
  const m = months === null ? "" : String(months);
  return `${y}${(years ?? 0) <= 1 ? " Year " : " Years "}${m}${(months ?? 0) <= 1 ? " Month " : " Months"}`;
}

/** `Value(Right(d, 2)) & " Years " & Value(Left(d, 2)) & " Months"` (Y:5655) — always plural. */
export function decommissioningDurationLabel(value: string | null | undefined): string {
  const { months, years } = unpackMMYY(value);
  return `${years} Years ${months} Months`;
}

/** The card number formats (U2): `Text(v, "<pattern>")`. */
export const CARD_FORMAT = {
  amount: "###,###,###,##0",
  commitmentFee: "##0.0",
  hedging: "##0.0",
  rate: "#0.0#",
  costOfGuarantee: "0.0",
  dsraCommitmentFee: "##0.0#",
  dsraMargin: "#0.0#",
  dsraUpfrontFee: "#0.0#",
  pofds: "##0.0",
} as const;
export const fmtCard = (v: number | null | undefined, pattern: string): string => textFormat(v ?? null, pattern);

/* ══════════════════════════════════════════════════════════════════ folding ══ */

/**
 * `ico_Generators_…_Up_1` / `_Down_1.OnSelect` (Y:7129-7212): toggling a category's fold also sets
 * EVERY input of that category to folded. Fold state is local (the canvas `UpdateIf`s collections,
 * never Dataverse); the categories start folded (`AddColumns(…, IsFolded, true)`, B9), the tranches
 * as stored (`IsFolded`, written `true` by every tranche Save).
 */
export function toggleCategoryFold(
  folded: ReadonlySet<number>, order: number, trancheFolded: ReadonlyMap<string, boolean>,
  inputs: readonly FinancingInputRow[],
): { folded: Set<number>; trancheFolded: Map<string, boolean> } {
  const next = new Set(folded);
  if (next.has(order)) next.delete(order); else next.add(order);
  const tf = new Map(trancheFolded);
  inputs.filter((i) => i.categoryOrder === order).forEach((i) => tf.set(i.id, true));
  return { folded: next, trancheFolded: tf };
}

/** A tranche's fold state: the local toggle, else the stored `IsFolded`. */
export const isTrancheFolded = (row: FinancingInputRow, local: ReadonlyMap<string, boolean>): boolean =>
  local.get(row.id) ?? rawBool(row.raw[INPUT_COL.isFolded]);

/* ═══════════════════════════════════════════════════════════════ on visit ══ */

/**
 * `OnVisible` (Y:1509): `Patch(Projects, gblRecordSelectedProject, {'Financing Options': 'Debt Financing'})`
 * — guarded by `financingOptionOnVisit` (SOURCE DEFECT 2): written only while the column is blank.
 * `null` when nothing is to be written.
 */
export function planFinancingOptionOnVisit(
  project: Pick<FinanceProject, "id" | "financingOptions"> | null,
): WritePlan | null {
  if (!project) return null;
  const option = financingOptionOnVisit(project.financingOptions);
  if (option === null) return null;
  return {
    writes: [update(ES.projects, project.id, { [PROJECT_FINANCING_OPTIONS_COL]: option }, "set the project's Financing Options")],
    log: [],
  };
}

/* ══════════════════════════════════════════════════════════════ panel opens ══ */

/**
 * Category Edit, Order 1 (Y:2834-2862): the stored Free Equity mode (`Coalesce(…, Percentage)`) and
 * value, and the flags from `'Is Standard Value'` (`locIsEquityStandardAssunption`).
 */
export function openEquityForm(row: FinancingInputRow | null): EquityForm {
  const r = row?.raw ?? {};
  return {
    mode: rawNum(r[INPUT_COL.freeEquity]) === CHOICE_FINANCE.freeEquity.fixedValue ? "fixed" : "percentage",
    value: rawNum(r[INPUT_COL.freeEquityValue]) === null ? "" : String(rawNum(r[INPUT_COL.freeEquityValue])),
    flags: parseStandardFlags(rawStr(r[INPUT_COL.isStandardValue]), DEFAULT_EQUITY_FLAGS),
  };
}

/** Category Edit, Order 2 (Y:2864-2884): the stored values and `locVatFinancingStatndardValues`. */
export function openVatForm(row: FinancingInputRow | null, country: string | null): VatForm {
  const r = row?.raw ?? {};
  const flags = parseStandardFlags(rawStr(r[INPUT_COL.isStandardValue]), DEFAULT_VAT_FLAGS);
  const margin = rawNum(r[INPUT_COL.bankMargin]);
  const amount = rawNum(r[INPUT_COL.vatFacilityAmountValue]);
  return {
    baseRate: vatBaseRateDefault(country, flags, rawNum(r[INPUT_COL.baseRate])),
    bankMargin: margin === null ? "" : String(margin),
    mode: rawNum(r[INPUT_COL.vatFacilityAmount]),
    amount: amount === null ? "" : String(amount),
    flags,
  };
}

/**
 * Category Edit, Order 5 (Y:2898-2934): the stored decommissioning values (`locCostsOfDecommissioning`,
 * `locCostsOfGuarantee` as `Text(…, "0.0")`, the three dates, the MMYY duration) and `locMyRecord`;
 * `locIsDirtyDecommissiongForm: false`.
 */
export function openDecommissioningForm(row: FinancingInputRow | null): DecommissioningForm {
  const r = row?.raw ?? {};
  const duration = rawStr(r[INPUT_COL.durationOfSaving]);
  const { months, years } = unpackMMYY(duration);
  const value = rawNum(r[INPUT_COL.costsOfDecommissioningValue]);
  return {
    costType: rawNum(r[INPUT_COL.costsOfDecommissioning]),
    value: value === null ? "" : String(value),
    guarantee: fmtField(rawNum(r[INPUT_COL.costOfGuarantee]), "0.0"),
    dateOfIssue: rawDay(r[INPUT_COL.dateOfIssue]),
    startDateOfSaving: rawDay(r[INPUT_COL.startDateOfSaving]),
    dateOfExpiry: rawDay(r[INPUT_COL.dateOfExpiry]),
    years: duration ? years : null,
    months: duration ? months : null,
    flags: parseStandardFlags(rawStr(r[INPUT_COL.decommissioningStandardAssumptionJson]), DEFAULT_DECOMMISSIONING_FLAGS),
    dirty: false,
  };
}

/**
 * `con_DSRA_DSRF_Data_Edit.OnSelect` (Y:5832-5889): the stored DSRA/DSRF values (the standard for
 * edit is blanked) formatted as each control's `Value`, and `locSelectedDSRA_DSRF_IsStandard`.
 * The duration months are the STORED months (SOURCE DEFECT 6, `dsraDurationMonthsCanvasParity`).
 */
export function openDsraForm(row: FinancingInputRow | null): DsraForm {
  const r = row?.raw ?? {};
  const flags = parseStandardFlags(rawStr(r[INPUT_COL.dsraStandardAssumptionsJson]), DEFAULT_DSRA_FLAGS);
  const duration = rawStr(r[INPUT_COL.durationOfFutureDebtServiceMmyy]);
  const { months, years } = unpackMMYY(duration);
  return {
    type: rawNum(r[INPUT_COL.typeDsraDsrf]),
    commitmentFee: fmtField(rawNum(r[INPUT_COL.commitmentFeeValue]), "##0.0#"),
    cfYears: rawNum(r[INPUT_COL.commitmentFeePeriodYear]),
    cfMonths: dsraCommitmentFeeMonthsDefault(flags, rawNum(r[INPUT_COL.commitmentFeePeriodMonth])),
    baseRate: rawNum(r[INPUT_COL.baseRate]),
    margin: fmtField(rawNum(r[INPUT_COL.margin]), "#0.0#"),
    upfrontFee: fmtField(rawNum(r[INPUT_COL.upfrontFeeValue]), "#0.0#"),
    percentage: fmtField(rawNum(r[INPUT_COL.percentageOfFutureDebtService]), "##0.0"),
    durYears: duration ? years : null,
    durMonths: duration ? months : null,
    endOfSavings: rawDay(r[INPUT_COL.endOfDebtServiceSavings]),
    flags,
  };
}

/**
 * `rad_DSRA_DRSFData_DSRA_DRSF_Type.OnChange` (Y:15593-15647): every flag true, the SQL standard
 * re-applied to the ten fields (`locStandardDSRA_DSRF_For_Edit = locStandardDSRA_DSRF`) and End of
 * debt service savings recomputed (COD + the longest active tenor − 1 day). The base rate takes the
 * DSRF standard whatever the type — `DefaultSelectedItems: Coalesce(…BaseRateDSRF, …)`, reproduced.
 *
 * DIVERGENCE (D34, D2): with `Assumptions Debt SQL` unconnected there is no standard to apply; the
 * type and the end date change, the other values and their flags stay as they are (the canvas
 * would blank or zero them and flag them standard).
 */
export function applyDsraTypeChange(
  form: DsraForm, type: number, standard: DsraStandard | null, endOfSavings: Date | null,
): DsraForm {
  if (!standard) return { ...form, type, endOfSavings: endOfSavings ?? form.endOfSavings };
  const dur = unpackMMYY(padMMYY(standard.durationOfFutureDebtService));
  return {
    type,
    commitmentFee: fmtField(standard.commitmentFee, "##0.0#"),
    cfYears: standard.commitmentFeeFreePeriod,
    cfMonths: 0,
    baseRate: standard.baseRateDsrf,
    margin: fmtField(type === CHOICE_FINANCE.dsraDsrfType.dsrf ? standard.marginDsrf : standard.marginDsra, "#0.0#"),
    upfrontFee: fmtField(standard.upFrontFee, "#0.0#"),
    percentage: fmtField(standard.percentageOfFutureDebtService, "##0.0"),
    durYears: dur.years,
    durMonths: dsraDurationMonthsCanvasParity(),
    endOfSavings,
    flags: { ...DEFAULT_DSRA_FLAGS },
  };
}

/** The repayment rows of a stored tranche (`colRepaymentProfileAmount` on Edit, Y:2700). */
export const repaymentRowsOf = (trancheId: string | null, stored: readonly StoredRepaymentRow[]): RepaymentRow[] =>
  stored.filter((r) => r.financingInputId === trancheId).sort((a, b) => a.year - b.year)
    .map((r) => ({ year: r.year, value: String(r.amount), valid: true, dirty: false, repaymentAmountRecordId: r.id }));

/** The step-up rows of a stored tranche (`colStepUpBankMargins` on Edit, Y:2712). */
export const stepUpRowsOf = (trancheId: string | null, stored: readonly StoredStepUpMarginRow[]): StepUpRow[] =>
  stepUpFromStorage(stored.filter((r) => r.financingInputId === trancheId));

/**
 * `tgl_SeniorDebtData_Step_Up_Bank_Margin.OnCheck` (Y:12923) and `drp_SeniorDebtData_Fixed_Interest_Rate_YY.OnChange`
 * (Y:12818): the first period is created only when the FIR years are set and the FIR has no error
 * (`OnCheck`), or when the toggle is on and there is no row yet (FIR change).
 */
export const firstStepUpRow = (): StepUpRow => ({ id: 1, durationYY: null, margin: "", valid: false, recordId: null });
export const canSeedStepUp = (firYears: number | null, firMonths: number | null): boolean =>
  firYears !== null && validateYearMonthPair(firYears, firMonths).valid;
