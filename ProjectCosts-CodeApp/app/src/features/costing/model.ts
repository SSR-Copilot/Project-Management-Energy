export const CATEGORIES = [
  "Wind Turbine / Panels", "Development Expenses", "Construction Expenses",
  "Substation / Grid Connection", "Other CAPEX",
] as const;
export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const CLUSTERS = ["Feasibility Studies", "Pre-Permitting", "Permitting", "Pre-Construction", "Construction"];
export interface CostAccount { id: string; number: string; name: string; parentId?: string; category: number }
/**
 * One month's money on a contract.
 *
 * `id` is the `vsb_capexcostid` of the backing row. It is absent for a payment the panel has
 * proposed but not yet saved, and absent throughout the demo book — and that absence is
 * load-bearing: `capexWriteSet` uses "has an id" to tell an existing row from a new one.
 */
export interface Payment { id?: string; year: number; month: number; amount: number; paid: boolean }
export interface CostLine {
  id: string; accountId: string; description: string; payer: "SPV" | "DevCo";
  depreciation: boolean; vat: boolean; standard: boolean;
  distribution: "equal" | "individual"; equalMode: "cluster" | "dates";
  /**
   * `vsb_distributionscheme` — only meaningful for an INDIVIDUAL distribution. Percent rows are
   * converted against `totalCost`; absolute rows are the money itself.
   */
  distributionScheme: "percent" | "absolute";
  startDate: string; endDate: string; frequency: number; clusters: number[];
  payments: Payment[]; comments: string[];
  /**
   * `vsb_totalcost` on the contract — NOT the sum of `payments`.
   *
   * The canvas panel binds its Total Costs box to `locAllYearsCost = contract.'Total Cost'`
   * (`CapexScreenCode.txt:7212`, control value at :10841), and the skeleton's
   * `totalCostForPercent` coalesces `'Total Cost'` -> sum of existing costs -> the typed box.
   * The two can legitimately differ, so the stored figure has to be carried.
   */
  totalCost?: number;
  /** `_vsb_capexstandardassumptioncontract_value` — which assumption a standard contract came from. */
  standardAssumptionId?: string;
  /**
   * `vsb_linkedcluster` — the contract's "Link to Milestone" selection.
   *
   * A lookup to `Project States` (`vsb_projectstate`), NOT to a cluster table and not to an
   * option set: the canvas dropdown's Items is
   * `Filter('Project States', Order in [1,2,3,4,5,6] && Order > project.'Cluster State'.Order &&
   * Order >= Max(1, varStartClusterNo))` (`CapexScreenCode.txt:11244-11280`), and every consumer
   * reads `.Order` or `.Name` off the resolved row rather than the id.
   *
   * All three parts are carried because the three consumers each want a different one:
   * `paidToggleNeedsConfirmation` and `contractSubLabel` want the ORDER, the panel's dropdown
   * compares by NAME (`Selected.Name <> locSelectedProjectContract.'Linked Cluster'.Name`,
   * `:11291`), and the write side needs the ID to bind `vsb_LinkedCluster@odata.bind`.
   *
   * `undefined` on all three means "not linked" — the canvas' `IsBlank('Linked Cluster')`.
   * Measured on VSBCloud_Dev, 16 Sep: 31 of the org's CAPEX contracts carry one (28 Individual
   * Distribution, 3 Equal), none of them on Wirmighausen.
   */
  linkedClusterId?: string;
  /** `'Linked Cluster'.Name` — "Cluster 3". */
  linkedClusterName?: string;
  /** `'Linked Cluster'.Order` — 1..6 on the six cluster rows. */
  linkedClusterOrder?: number;
}
export type PeriodMode = "om" | "land" | "other";
/**
 * One period row on the O&M / Other OPEX / Land Lease screens.
 *
 * THE CHAIN. A "cost" on these screens is not one row — it is a CONTRACT made of 1..N
 * consecutive periods, and both canvas screens model that, differently:
 *
 *   O&M / Other OPEX   one `vsb_opexprojectcosts` row per period. The FIRST period is the
 *                      contract (`vsb_parentcost` blank); every later period is a row whose
 *                      `vsb_parentcost` points at that FIRST row — a FLAT star, never a
 *                      linked list. `OpexCostScreenCode.txt:8695` patches
 *                      `'Parent Cost': locSelectedOpexCostParent`, and :609 resolves that
 *                      parent as `Coalesce(LookUp(costs, id = selected.'Parent Cost'), selected)`
 *                      — the head, whichever period you started from.
 *   Land Lease         one `vsb_landleaseprojectcosts` HEADER row per contract plus 1..9
 *                      `vsb_landleaseperiods` child rows, slotted by the `vsb_period` choice
 *                      (Period1..Period9). The header carries everything shared: currency,
 *                      inflation, Secured, Allocation and the one-time payments.
 *
 * Both are therefore described here by the same three facts — `contractId`, `periodIndex` and
 * (OPEX only) `parentId` — so a rule can ask "is this the head?" or "is this the tail?" without
 * knowing which table it came from.
 *
 * MEASURED, VSBCloud_Dev, 16 Sep. Quellendorf I (`ac3168e6-…`) has 3 O&M chains of 5 periods
 * each — heads `Initialized O&M Contract`, children `… - 2` … `… - 5`, all 12 children pointing
 * at their head. Project New Data (`910d8ed0-…`) has **12 separate Land Lease headers under the
 * one `Locations` sub-account**, which is why `contractId` cannot be inferred from `group`.
 */
export interface CostPeriod {
  id: string; group: string; mode: PeriodMode; description: string;
  startDate: string; years: number; months: number; currency: string;
  /**
   * The five money columns — `vsb_fixcosts` / `vsb_ofrevenues` / `vsb_eurmwh` / `vsb_eurmw` /
   * `vsb_eurwtg` on OPEX, `vsb_fixedcosts` / … on Land Lease.
   *
   * NULLABLE, and that is load-bearing. The canvas writes `Value(txt.Value)`
   * (`OpexCostScreenCode.txt:8695`), and `Value("")` is `Blank()` — an empty box stores NOTHING,
   * not zero. Reading them back with `?? 0` made blank indistinguishable from a stored `0`,
   * which matters twice: `landLeaseRules`' `formatGrouped` prints a stored `0` and BLANKS a null,
   * and `firstPeriodHasRate` — Land Lease's `Add Period` gate — asks whether any of the five is
   * non-blank, so coalescing turned that gate permanently on.
   *
   * MEASURED, VSBCloud_Dev 16 Sep: of 517 `vsb_landleaseperiods` rows only 173 carry
   * `vsb_fixedcosts`, 102 `vsb_ofrevenues`, 23 `vsb_eurmwh`, 11 `vsb_eurmw`, 269 `vsb_eurwtg`.
   */
  fixed: number | null; revenue: number | null;
  perMwh: number | null; perMw: number | null; perWtg: number | null;
  /**
   * `vsb_aggregation` — `SUM` 952850000, `MAX` 952850001, **`MIN` 952850002**, the same three
   * values on `vsb_opexprojectcosts` and `vsb_landleaseperiods`.
   *
   * MIN is not hypothetical: measured on VSBCloud_Dev, 16 Sep, **four live OPEX rows carry it**
   * (`Test - 2`, `Test - 4`, `Test O&M Contract N149-5.7 Period 3`, `CCC`) against 952 SUM and
   * 18 MAX. While this union was `"SUM" | "MAX"` the loader read those four back as SUM and the
   * write map turned MAX-or-else-SUM, so opening and saving one of them silently rewrote MIN to
   * SUM — and the panel's own dropdown offers all three (`Choices('Opex Aggregation')`, `:7023`).
   */
  aggregation: "SUM" | "MAX" | "MIN"; frequency: number;
  inflation: boolean; countryInflation: boolean; inflationYear: number; inflationPercent: number;
  threshold: boolean; align: boolean; external: boolean; standard: boolean;
  /**
   * `vsb_thresholdtype` — O&M only, and `undefined` whenever `threshold` is false.
   *
   * MEASURED, 16 Sep: `Net Yield p75` 952850000, `Net Yield p90` 952850001, `Individual`
   * 952850002 — and all 8 live rows that carry a type carry `Individual`. The panel offers all
   * three (`rdg_…_Threshold.Items: Choices(Thresholds)`, `:8302`), so p75/p90 has to survive the
   * round trip; before this field existed the write map hard-coded `Individual`.
   */
  thresholdType?: number;
  /**
   * `vsb_thresholdindividual` — the panel's own `Individual Threshold` box
   * (`'Threshold individual': Value(txt_…_Threshold_Individual.Value)`, `:8695`).
   *
   * A DIFFERENT COLUMN FROM `perMwh`, which the write map used to copy into it. Measured on
   * VSBCloud_Dev, 16 Sep, all 8 rows with a threshold have `vsb_thresholdindividual` = 222.00
   * against `vsb_eurmwh` of 33.00 or 990.00, so that copy would have destroyed the stored
   * threshold on every one of them.
   */
  thresholdIndividual?: number | null;

  /* ── the chain ────────────────────────────────────────────────────────── */

  /**
   * The contract this period belongs to.
   *
   * O&M / Other OPEX — the `vsb_opexprojectcostid` of the chain HEAD, which for the head itself
   * equals `id`. Land Lease — the `vsb_landleaseprojectcostid` of the header row (never `id`).
   *
   * `undefined` only on a period the panel has built but not yet saved. `savePeriod` reads it as
   * "which contract to attach to": a Land Lease create with no `contractId` creates a NEW header
   * (canvas' "Add Contract Type"), and one WITH a `contractId` adds a period to that header.
   */
  contractId?: string;
  /**
   * `vsb_parentcost` — O&M / Other OPEX only, `undefined` on the chain head.
   *
   * Carried separately from `contractId` because they differ on exactly one row, the head, and
   * that is the row whose edit cascades (`saveOpexPeriod`) and whose delete takes the whole
   * chain with it (`deleteOpexPeriod`).
   */
  parentId?: string;
  /**
   * 1-based position of this period inside its contract.
   *
   * Land Lease reads it straight off `vsb_period` (Period1 = 1 … Period9 = 9) and WRITES it:
   * a new period takes its predecessor's slot + 1 (`LandLeaseCostScreenCode.txt:5895`'s
   * `Switch(locParentLandLeasePeriod.Period, Period1, Period2, …)`). OPEX has no such column,
   * so this is the position in the canvas' own chain order — `Name` ascending among the head's
   * children, `OpexCostScreenCode.txt:558-565`.
   */
  periodIndex?: number;
  /**
   * The contract's display name — the head's / header's `Description`.
   *
   * Land Lease needs it because one sub-account card can show periods from a dozen different
   * contracts (measured above) and they are only told apart by this.
   */
  contractName?: string;

  /* ── columns the panel has no control for but the round trip must not lose ── */

  /**
   * `vsb_inflationcountryarea` — a TEXT column, not a lookup and not an option set.
   *
   * MEASURED, 16 Sep: 982 OPEX rows, values `"North"` and `"Centre - North"`, 978 blank. The
   * canvas fills it from `Distinct(Filter('Country Inflation Profiles', Country = project's
   * country).Area, Area)` (`OpexCostScreenCode.txt:7622`) and writes it ONLY while the Country
   * Inflation Profile toggle is on, blanking it otherwise (`:8695`).
   */
  inflationCountryArea?: string;
  /**
   * `vsb_isstartdatestandardassumption` — whether the start date came from a standard assumption.
   *
   * The canvas coalesces the PARENT's value over the panel's on every save
   * (`OpexCostScreenCode.txt:8695`), so a period added to a seeded chain inherits it.
   */
  isStartDateStandard?: boolean;
  /**
   * `vsb_secured` on the Land Lease header — the `Secured` column.
   *
   * `LandLeaseCostScreenCode.txt:1246-1255` renders `varLandLeaseCost.Secured` verbatim, so it
   * is a property of the CONTRACT, not of the period and not of "is this a standard contract".
   */
  secured?: boolean;
  /**
   * `vsb_allwtgallocated` on the linked `Land Lease Project Costs` header — Land Lease only.
   *
   * `LandLeaseCostScreenCode.txt:1058` — `If(varLandLeaseCost.AllWTGAllocated, "Yes", "No")`.
   * Undefined (O&M/Other OPEX, or a Land Lease period the loader has not joined yet) renders
   * the same as `false`: the canvas' own lookup-then-If never produces a blank cell either.
   */
  allWtgAllocated?: boolean;
  /**
   * Whether the header carries its first one-time payment — both `Due Date One-Time Payment`
   * AND `Amount One-Time Payment` set. Land Lease only; same never-blank rule as above.
   *
   * `LandLeaseCostScreenCode.txt:1010` — the canvas checks only the FIRST of the three one-time
   * payments here, not payments 2 or 3.
   */
  hasOneTimePayment?: boolean;

  /* ── the Land Lease header's own columns ──────────────────────────────── */

  /**
   * `vsb_landowner` on the Land Lease header — the panel's `Land Owner` box.
   *
   * Land Lease only. `undefined` means "the caller has no opinion"; `null`/`""` means blank.
   * MEASURED, 16 Sep: 12 of the org's 416 Land Lease headers carry one.
   */
  landOwner?: string | null;
  /**
   * `vsb_amountonetimepayment` 1..3 and `vsb_duedateonetimepayment` 1..3 on the Land Lease
   * header — the panel's whole One-Time Payment section, which had no source at all while these
   * six columns went unselected and unwritten.
   *
   * Flat rather than an array of `{amount, dueDate}` on purpose: `useCostBook`'s save diff
   * compares periods field by field with `===`, and a fresh array object would compare unequal
   * on every reload and re-save the contract each time the book refetched.
   *
   * MEASURED, 16 Sep: 27 headers carry a first amount, 2 a second, 2 a third; 29 carry a first
   * due date. `hasOneTimePayment` above stays the canvas' derived Yes/No for the GRID and is
   * computed from the first pair only (`LandLeaseCostScreenCode.txt:1010`).
   */
  amountOneTimePayment?: number | null;
  amountOneTimePayment2?: number | null;
  amountOneTimePayment3?: number | null;
  dueDateOneTimePayment?: string | null;
  dueDateOneTimePayment2?: string | null;
  dueDateOneTimePayment3?: string | null;
  /**
   * `vsb_landleaseallocationwtgs` — the `Generator In Project` ids allocated to this contract,
   * ascending so two reads of the same allocation set compare equal.
   *
   * Land Lease only, and a property of the CONTRACT (the header), not of the period; every
   * period under a header reports the same list. `undefined` means the caller has no opinion and
   * `saveLandLeasePeriod` leaves the allocation rows alone — writing `[]` would DELETE them, and
   * a stranded/over-eager allocation delete is exactly the failure `docs/01-BUGS-FOUND.md` S-5
   * records.
   */
  allocatedGeneratorIds?: readonly string[];
}
export interface CostBook { accounts: CostAccount[]; lines: CostLine[]; periods: CostPeriod[]; extraGroups: Record<PeriodMode, string[]> }
export const amount = (value: number, digits = 2) => value === 0 ? "-" : new Intl.NumberFormat("en-GB", { maximumFractionDigits: digits }).format(value);
export const total = (payments: Payment[]) => payments.reduce((sum, p) => sum + p.amount, 0);

/** Work in cents and assign the remainder once; visible months always sum to the entered total. */
export function distribute(value: number, start: string, end: string, frequency: number): Payment[] {
  const from = new Date(start + "T12:00:00"); const to = new Date(end + "T12:00:00");
  if (!Number.isFinite(value) || value < 0 || !Number.isInteger(frequency) || frequency < 1 ||
    Number.isNaN(+from) || Number.isNaN(+to) || from > to) return [];
  const dates: { year: number; month: number }[] = [];
  for (let y = from.getFullYear(), m = from.getMonth(); y * 12 + m <= to.getFullYear() * 12 + to.getMonth(); m += frequency) {
    y += Math.floor(m / 12); m %= 12;
    if (y * 12 + m > to.getFullYear() * 12 + to.getMonth()) break;
    dates.push({ year: y, month: m + 1 });
    if (dates.length > 1200) return [];
  }
  const cents = Math.round(value * 100), share = Math.floor(cents / dates.length);
  return dates.map((date, index) => ({ ...date, amount: (share + (index === dates.length - 1 ? cents - share * dates.length : 0)) / 100, paid: false }));
}

export function periodEnd(p: Pick<CostPeriod, "startDate" | "years" | "months">) {
  const start = new Date(p.startDate + "T12:00:00");
  if (Number.isNaN(+start)) return "";
  const day = start.getDate();
  start.setDate(1); start.setMonth(start.getMonth() + p.years * 12 + p.months);
  const last = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
  start.setDate(Math.min(day, last)); start.setDate(start.getDate() - 1);
  return `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
}
