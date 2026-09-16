/**
 * Capex Costs Screen — every business rule as a pure function.
 *
 * Canvas screen: `Capex Costs Screen` (Project Costs app)
 *   355 controls · 22 286 lines of Power Fx · 180 substantive blocks · band XL
 *
 * WHAT WAS DELETED AS A WORKAROUND
 *  · `tmr_Capex_Initial_Load` (500 ms repeating), `tmr_Capex_Cost_Category_SwitchTabs`,
 *    `tmr_Capex_Cost_Cost_EnrichLoader`, `tmr_Load_Contract_Gallery_Warmup` — timers that
 *    existed only because `App.OnStart` collections were not ready when `OnVisible` ran.
 *  · The hidden "code buttons" (`btn_Capex_Cost_Refresh_Capex_Cost_Code`,
 *    `btn_Capex_Cost_Reload_PCF_After_Mutation_Code`,
 *    `btn_Capex_Cost_Build_StandardContractOptions_Code`, `btn_SaveCost_Execute____`,
 *    `Btn_CodeforSettingCostPaidUnpaid`) and `cmp_Hotfix_CDN_FluentUI` — React state plus
 *    query invalidation replaces all of them.
 *  · The hard-coded fallback `LookUp(Projects, Project = GUID("33b9cc79-…"))`. A missing
 *    project id is an error state, never a silent default (UT-CAPEX-058).
 *  · The three dead view toggles (`…_ShowInactiveAccounts`, `…_FiscalYear`,
 *    `…_ProjectTimeline`, all `Visible: false`).
 *
 * DEAD FEATURE, NOT PORTED: `DefaultProjectCostsMarginValue = 10` and
 * `'Capex Project Cost Margins'`. Both exist in the canvas but every reference to them is
 * commented out — there is no CAPEX margin feature in the shipped app. See
 * `DEAD_CAPEX_MARGIN` in `data/entities.ts`. The only live margin is the BoP contract
 * margin on the Contracts screen.
 */
import {
  coalesce, isBlank, isInteger, inRange, pfxRound, roundDown, parseNumber,
} from "@/domain/numeric";
import { CHOICE_COST, OVERLEVERAGING, CAPEX_SUMMARY_TAB_NAME } from "@/data/entities";

/* ══════════════════════════════════════════════════════════════════════ types ════ */

export interface CapexProject {
  projectId: string;
  /** `'Acquisition date'` */
  acquisitionDate: string | null;
  /** `'Project Start Date'` */
  projectStartDate: string | null;
  /** `'End Date'` */
  endDate: string | null;
  /** `'Operations start date (COD)'` */
  codDate: string | null;
  /** `'Total Capacity'` — the EUR/MW(p) multiplier. */
  totalCapacity: number | null;
  /** `locProjectStartClusterNo` — 0 (Greenfield) … 6. */
  startClusterNo: number;
  technology: string | null;
  countryId: string | null;
  countryName: string | null;
  /** `gblRecordSelectedProjectCountry.'ISO Currency Code'`. */
  isoCurrencyCode: string | null;
}

/** One row of `gblClusterDurations`. */
export interface ClusterDuration {
  order: number;
  name: string;
  startMonth: number;
  startYear: number;
  endMonth: number;
  endYear: number;
}

export interface CapexAccountNode {
  id: string;
  name: string;
  number: string;
  order: number;
  parentId: string | null;
  /** `statecode` — only Active rows are loaded. */
  status: number;
}

export interface CapexContract {
  id: string;
  name: string;
  description: string | null;
  /** The owning SUB-ACCOUNT (`Account` lookup). */
  subaccountId: string | null;
  totalCost: number | null;
  /** `'Cost Type'` — `CHOICE_COST.costPaidType`. */
  costType: number | null;
  distribution: number | null;
  distributionScheme: number | null;
  distributionFrequency: number | null;
  linkedClusterOrder: number | null;
  byClusterJson: string | null;
  byStartEndDateJson: string | null;
  isStandardContract: boolean;
  standardAssumptionId: string | null;
}

export interface CapexCostRow {
  id: string;
  contractId: string;
  year: number;
  /** Raw `Month` as it comes back — a label, an English name or a number string. */
  month: string | number;
  cost: number | null;
  isPaid: boolean;
}

export type MonthIndex = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

/* ═══════════════════════════════════════════════════════════════════ messages ════ */

export const MSG = {
  /**
   * NEW — no canvas equivalent: guards the reserved contract name "Standard" on the capex grid;
   * the canvas had no such check
   */
  standardReserved:
    'The term "Standard" is applicable only for system-prefilled contracts.',
  /**
   * `lbl_GeneratorData_RightPanel_Form_PvModuleType_Fields_Label_ErrorMessage_2.Text` —
   * verbatim.
   */
  duplicateContract:
    "There cannot be two contracts with the same name under the same sub-account",
  /** `lbl_AddContract_RightPanel_EndDate_ErrorMessage_1.Text` — verbatim. */
  dateFormat: "Date must be in MM/YYYY format",
  startBefore: (allowed: string) => `Start Date must be in or after ${allowed}`,
  endBefore: (allowed: string) => `End Date must be in or after ${allowed}`,
  totalCostRange: (max: number, lang: string) =>
    `Value must be between 1 and ${formatThousands(max, lang)}.`,
  noApplicableCluster:
    "Standard cost was not created because no applicable cost period was found for the "
    + "project's Start Cluster.",
  /**
   * NEW — no canvas equivalent: the code app refuses a duplicate standard contract per
   * subaccount; the canvas created a second row
   */
  duplicateStandard:
    "This standard contract is already created for this project and subaccount.",
  /**
   * NEW — no canvas equivalent: the code app requires a subaccount before Add; the canvas
   * silently did nothing
   */
  noSubaccountSelected:
    "Please select a valid subaccount before adding a standard contract.",
  /**
   * `Btn_CodeforSettingCostPaidUnpaid.OnSelect` — verbatim (the canvas literal is built in that
   * behaviour formula).
   */
  noCostRow: "No monthly cost row found for selected contract/month/year.",
  /** `lbl_Draft_Edit_Comment_Warning.Text` — verbatim. */
  paymentCommentOnEqual:
    "Payment date comments cannot be added to automatically distributed costs.",
  clearsMilestoneLink:
    "Setting the milestone-linked cost to 'Paid' will remove the milestone link for all "
    + "costs in the contract. Do you want to proceed?",
  saveFailed:
    "Something went wrong saving the Capex data. Please refresh the page and verify your "
    + "changes were saved correctly.",
  missingProject:
    "No project was selected. Open this screen from a project — the canvas app fell back to "
    + "a hard-coded test project here, which must never happen in production.",
  /** GUIDE r08 — the blocking "saving costs" modal's text, verbatim, three dots included. */
  /**
   * `btn_GeneratorData_RightPanel_Form_PvModuleType_Buttons_Save.OnSelect` — verbatim (the
   * canvas literal is built in that behaviour formula).
   */
  savingCosts: "Please wait, saving costs...",
} as const;

/** `Text(max, "#,###")` in the user's language — the two spellings the canvas hard-codes. */
export function formatThousands(value: number, language = "en-US"): string {
  return new Intl.NumberFormat(language, { maximumFractionDigits: 0 }).format(value);
}

/**
 * GUIDE r06 — a grid cell with NO cost data renders a dash, never a zero: a typed `0` means
 * someone entered zero, and that distinction is load-bearing. `null` is "no row here";
 * a number (including `0`) is "a row exists and this is its value".
 */
export function formatCostCell(value: number | null, language = "en-US"): string {
  return value === null ? "-" : formatThousands(value, language);
}

/** GUIDE r06 — the twelve month-column headers, Jan → Dec, for the selected year. */
export const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

/** GUIDE r06/r08 — the grid's closing totals row. */
/**
 * SPELLING CORRECTED — canvas `con_Costs_ProjectCostsMonthSummaryTotal_Title_2.Text` reads
 * "Grand Total\u0020\u0020\u0020" (three trailing spaces used as layout padding, written here
 * as escapes so they survive a re-wrap). Trimmed here; the wording is verbatim.
 */
export const GRAND_TOTAL_LABEL = "Grand Total";

/** GUIDE r06 — the toolbar row beneath the category tabs, verbatim. */
export const CAPEX_TOOLBAR_LABELS = {
  /**
   * `btn_Costs_ProjectCosts_TableCommandBar_AddCostFromTable.Text` — the canvas command
   * caption.
   */
  addCostFromTable: "+ Add Cost from Table",
  /** `tgl_Costs_ProjectCostbtn_ShowEmptyAccounts.Label` — verbatim. */
  showEmptyAccounts: "Show Empty Accounts",
  /** `tgl_Costs_ProjectCostbtn_ShowPlannedPaid.Label` — verbatim. */
  showTotalPlannedPaid: "Show Total Planned/Paid",
  /**
   * @labels-not-in-corpus — a dropdown OPTION value: the canvas builds it in a formula,
   * `drp_Costs_ProjectCostbtn_ShowCostPaidBy.Default = First(["Show All Cost","DevCo","SPV"])`,
   * not on a label property
   */
  showAllCost: "Show All Cost",
} as const;

/** GUIDE r06 — the grid's own column headers (the month headers are `MONTH_LABELS`). */
export const CAPEX_GRID_COLUMNS = {
  /**
   * `lbl_Account_RightPanel_NewEditAccount_BodyContent_Number.Text` (`Admin CAPEX Accounts`) —
   * verbatim.
   */
  number: "Number",
  /** `lbl_Costs_label_2.Text` — verbatim. */
  accountName: "Account Name",
  /**
   * NEW — no canvas equivalent: a column header for the code app's grid; the canvas capex table
   * has no total columns (its currency-suffixed "Total Costs [" labels belong to the Contracts
   * card)
   */
  totalCosts: "Total Costs",
  /**
   * NEW — no canvas equivalent: a column header that replaces the canvas toggle
   * `tgl_Costs_ProjectCostbtn_ShowPlannedPaid` ("Show Total Planned/Paid")
   */
  totalPaid: "Total Paid",
  /**
   * NEW — no canvas equivalent: a column header that replaces the canvas toggle
   * `tgl_Costs_ProjectCostbtn_ShowPlannedPaid` ("Show Total Planned/Paid")
   */
  totalPlanned: "Total Planned",
} as const;

/**
 * GUIDE r06 — the row-level Add is an inline flyout (a "••• Add" control anchored to a
 * sub-account row, opening a one-item menu), never a page-level command.
 */
/**
 * `btn_general_data_shareholding_entity_add_new.Text` (`Project General Data Screen`) —
 * verbatim.
 */
export const ROW_ADD_BUTTON_LABEL = "Add";
/** `cmd_Costs_ProjectCosts_TableCommandBar.Items.ItemDisplayName` — the canvas command caption. */
export const ROW_ADD_MENU_ITEM_LABEL = "+ Add New Cost";

/* ═══════════════════════════════════════════ rules 1–4 · the year window ════ */

const SENTINEL_YEAR = 1900;

const toDate = (v: string | Date | null | undefined): Date | null => {
  if (v === null || v === undefined || v === "") return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

/**
 * Rule 1 — the earliest year a cost may sit in.
 *
 * `varPreferredStartDate: If(locProjectStartClusterNo > 0, 'Acquisition date',
 *  'Project Start Date')`, then `Coalesce(…, 'Acquisition date', 'Project Start Date',
 *  Today())` and finally the `> 1900` sentinel guard.
 */
export function costAllowedStart(
  project: Pick<CapexProject, "acquisitionDate" | "projectStartDate" | "startClusterNo">,
  today: Date = new Date(),
): { year: number; date: Date } {
  const acquisition = toDate(project.acquisitionDate);
  const start = toDate(project.projectStartDate);
  const preferred = project.startClusterNo > 0 ? acquisition : start;
  const base = coalesce(preferred, acquisition, start) ?? today;
  const raw = base.getFullYear();
  const year = raw > SENTINEL_YEAR ? raw : today.getFullYear();
  return { year, date: new Date(year, 0, 1) };
}

/**
 * Rule 2 — `locNavigationMinYear` / `locNavigationMaxYear`.
 *
 * min = Min(acquisitionYear, earliest cluster start, costAllowedStartYear)
 * max = Max(COD year, project end year, latest cluster end, the year on screen)
 * Every input is dropped when it is `<= 1900`; an empty result falls back to this year.
 */
export function navigationWindow(
  project: Pick<CapexProject, "acquisitionDate" | "codDate" | "endDate">,
  clusters: ClusterDuration[],
  costAllowedStartYear: number,
  selectedYear: number | null,
  today: Date = new Date(),
): { min: number; max: number } {
  const live = (n: number | null | undefined): n is number =>
    typeof n === "number" && Number.isFinite(n) && n > SENTINEL_YEAR;

  const acquisitionYear = toDate(project.acquisitionDate)?.getFullYear() ?? null;
  const codYear = toDate(project.codDate)?.getFullYear() ?? null;
  const endYear = toDate(project.endDate)?.getFullYear() ?? null;

  const mins = [acquisitionYear, ...clusters.map((c) => c.startYear), costAllowedStartYear]
    .filter(live);
  const maxes = [codYear, endYear, ...clusters.map((c) => c.endYear), selectedYear]
    .filter(live);

  const min = mins.length > 0 ? Math.min(...mins) : today.getFullYear();
  const max = maxes.length > 0 ? Math.max(...maxes) : today.getFullYear();
  // A window can never be inverted; the canvas relies on the data never doing this.
  return { min, max: Math.max(min, max) };
}

/** Rule 3 — `Min(Max(varDefaultYear, min), max)`. */
export function clampSelectedYear(year: number, min: number, max: number): number {
  return Math.min(Math.max(year, min), max);
}

/** Rule 4 — `colProjectPeriods`: one entry per year, each with a nested 12-month table. */
export function projectPeriods(min: number, max: number): { year: number; months: number[] }[] {
  const count = Math.max(max - min + 1, 1);
  return Array.from({ length: count }, (_, i) => ({
    year: min + i,
    months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  }));
}

/** Year-navigation bounds (Validation section). */
export const canGoPreviousYear = (selected: number, min: number) => selected > min;
export const canGoNextYear = (selected: number, max: number) => selected < max;

/* ═══════════════════════════════════════════════ rule 5 · Overleveraging ════ */

/** Rule 5 — the "Overleveraging" category is hidden in the tab list AND in the summary. */
export function visibleCategories<T extends { name: string }>(categories: T[]): T[] {
  return categories.filter((c) => c.name !== OVERLEVERAGING);
}

export const isSummaryTab = (categoryId: string | null) => categoryId === null;
export const SUMMARY_TAB_NAME = CAPEX_SUMMARY_TAB_NAME;

/* ══════════════════════════════════════════ rules 7 · month normalisation ════ */

const MONTH_NAMES_EN = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];
/**
 * The localised choice labels the canvas `Switch` also accepts. German is the shipped
 * second language; the numeric and English arms cover everything else.
 */
const MONTH_NAMES_DE = [
  "januar", "februar", "märz", "april", "mai", "juni",
  "juli", "august", "september", "oktober", "november", "dezember",
];

/**
 * Rule 7 — `Month` is normalised defensively: the localised choice label, the lowercase
 * English name, or the numeric string `"1"`…`"12"` all map to a 1-based index.
 * Anything unrecognised yields 0, which no roll-up will match.
 */
export function monthIndex(raw: string | number | null | undefined): number {
  if (raw === null || raw === undefined || raw === "") return 0;
  if (typeof raw === "number") return raw >= 1 && raw <= 12 ? raw : 0;
  const v = raw.trim().toLowerCase();
  const n = Number(v);
  if (Number.isInteger(n) && n >= 1 && n <= 12) return n;
  const en = MONTH_NAMES_EN.indexOf(v);
  if (en >= 0) return en + 1;
  const de = MONTH_NAMES_DE.indexOf(v);
  if (de >= 0) return de + 1;
  // Some locales abbreviate; match on the first three letters as a last resort.
  const short = v.slice(0, 3);
  const enShort = MONTH_NAMES_EN.findIndex((m) => m.startsWith(short));
  if (short.length === 3 && enShort >= 0) return enShort + 1;
  const deShort = MONTH_NAMES_DE.findIndex((m) => m.startsWith(short));
  if (short.length === 3 && deShort >= 0) return deShort + 1;
  return 0;
}

/* ═══════════════════════════════════════════════ rules 8–13 · the grid ════ */

export interface FlatCost {
  costId: string;
  contractId: string;
  subaccountId: string | null;
  accountId: string | null;
  monthIndex: number;
  cost: number;
  isPaid: boolean;
}

export type GridRowType = "account" | "subaccount" | "contract";

export interface GridRow {
  id: string;
  type: GridRowType;
  /** GUIDE r06 — the `Number` column: the account/sub-account number, blank on a contract. */
  number: string;
  name: string;
  /** `SubLabel` — the PCF's second line (rule 11). */
  subLabel: string;
  parentId: string | null;
  /**
   * 12 entries, index 0 = January. `null` = no `CAPEX Cost` row lands in that month for this
   * row's scope, rendered as "-"; a number (including `0`) means a row exists.
   */
  m: (number | null)[];
  mPaid: boolean[];
  /** `Total Costs`. `null` when nothing under this row carries a cost, ever. */
  total: number | null;
  /** `Total Planned` — `null` exactly when `total` is `null`. */
  planned: number | null;
  /** `Total Paid`. `null` when nothing under this row has ever been marked paid. */
  paid: number | null;
  hasComments: boolean;
  mHasComments: boolean[];
  isStandard: boolean;
  costPaidByText: string;
  distribution: number | null;
}

/**
 * Rule 6 — the grid is rebuilt for ONE category and ONE year. `flattenCosts` is the
 * `colFlatCostsMapped` step: only rows whose `Year` equals the selected year survive, and
 * `Month` goes through `monthIndex`.
 */
export function flattenCosts(
  costs: CapexCostRow[],
  contracts: CapexContract[],
  subaccounts: CapexAccountNode[],
  year: number,
): FlatCost[] {
  const contractById = new Map(contracts.map((c) => [c.id, c]));
  const subById = new Map(subaccounts.map((s) => [s.id, s]));
  return costs
    .filter((c) => Number(c.year) === Number(year))
    .map((c) => {
      const contract = contractById.get(c.contractId);
      const sub = contract?.subaccountId ? subById.get(contract.subaccountId) : undefined;
      return {
        costId: c.id,
        contractId: c.contractId,
        subaccountId: contract?.subaccountId ?? null,
        accountId: sub?.parentId ?? null,
        monthIndex: monthIndex(c.month),
        cost: c.cost ?? 0,
        isPaid: c.isPaid,
      };
    });
}

/** Rule 9 — `Planned = Total − Paid`, `Actual = Paid`, with the `Total Cost` fallback. */
export function contractTotals(
  contract: Pick<CapexContract, "totalCost">,
  costs: { cost: number | null; isPaid: boolean }[],
): { total: number; planned: number; actual: number } {
  const sumAll = costs.reduce((a, c) => a + (c.cost ?? 0), 0);
  const total = coalesce(contract.totalCost, sumAll) ?? 0;
  const paid = costs.filter((c) => c.isPaid).reduce((a, c) => a + (c.cost ?? 0), 0);
  return { total, planned: total - paid, actual: paid };
}

/** `null` in every slot — "no cost row here", per `formatCostCell`. */
const emptyMonths = (): (number | null)[] => Array.from({ length: 12 }, () => null);
const emptyFlags = () => [
  false, false, false, false, false, false, false, false, false, false, false, false,
];

/** Rule 11 — the PCF's contract sub-label. */
export function contractSubLabel(
  contract: Pick<
    CapexContract,
    "costType" | "linkedClusterOrder" | "distribution" | "byClusterJson" | "byStartEndDateJson"
  >,
): string {
  const parts: string[] = [];
  if (contract.costType === CHOICE_COST.costPaidType.devCo) parts.push("[DevCo]");
  else if (contract.costType === CHOICE_COST.costPaidType.spv) parts.push("[SPV]");

  if (contract.linkedClusterOrder !== null && contract.linkedClusterOrder !== undefined) {
    parts.push(`Link to Cluster ${contract.linkedClusterOrder}`);
  }

  if (contract.distribution === CHOICE_COST.distributionType.equal) {
    const clusters = parseByClusterJson(contract.byClusterJson);
    if (clusters.length > 0) {
      parts.push(`Distribution to Cluster ${clusters.join(", ")}`);
    } else {
      const range = parseStartEndJson(contract.byStartEndDateJson);
      if (range) {
        parts.push(
          `Distribution from ${mmYYYY(range.startMonth, range.startYear)}`
          + ` to ${mmYYYY(range.endMonth, range.endYear)}`,
        );
      }
    }
  }
  return parts.join(" ").trim();
}

const mmYYYY = (m: number, y: number) => `${String(m).padStart(2, "0")}/${y}`;

/** `ParseJSON(CPC.'By Cluster JSON')` → the ticked cluster numbers. */
export function parseByClusterJson(json: string | null | undefined): number[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json) as Record<string, unknown>;
    return Object.entries(parsed)
      .filter(([k, v]) => /^Cluster\d+$/.test(k) && v === true)
      .map(([k]) => Number(k.replace("Cluster", "")))
      .sort((a, b) => a - b);
  } catch {
    return [];
  }
}

/** `ParseJSON(CPC.'By Start & End Date JSON')`. */
export function parseStartEndJson(
  json: string | null | undefined,
): { startMonth: number; startYear: number; endMonth: number; endYear: number } | null {
  if (!json) return null;
  try {
    const p = JSON.parse(json) as Record<string, number>;
    if (!p || typeof p.StartMonth !== "number") return null;
    return {
      startMonth: p.StartMonth, startYear: p.StartYear,
      endMonth: p.EndMonth, endYear: p.EndYear,
    };
  } catch {
    return null;
  }
}

export interface GridInput {
  accounts: CapexAccountNode[];
  subaccounts: CapexAccountNode[];
  contracts: CapexContract[];
  flat: FlatCost[];
  /** All the contract's costs across every year — `contractTotals` needs them. */
  allCosts: CapexCostRow[];
  /** Unresolved comment flags, from `gridCommentFlags`. */
  commentFlags?: Map<string, { general: boolean; months: boolean[] }>;
  /** View options the canvas passed straight into the PCF. */
  showEmptyAccounts?: boolean;
  costPaidByFilter?: "all" | "devco" | "spv";
}

/**
 * GUIDE r06 — `Total Costs` / `Total Paid` / `Total Planned` for an ACCOUNT or SUB-ACCOUNT
 * row: rolled up from every descendant contract's own `contractTotals`, across every year —
 * exactly like a single contract's figures, never scoped to the year on screen (a contract's
 * `Total Cost` is not a monthly figure). `null` means no descendant contract carries a
 * `Total Cost` or has ever booked a `CAPEX Cost` row — rendered as "-", never "0".
 */
export function rollupTotals(
  contracts: CapexContract[],
  costsByContract: Map<string, CapexCostRow[]>,
): { total: number | null; paid: number | null; planned: number | null } {
  let hasCost = false;
  let hasPaid = false;
  let totalSum = 0;
  let paidSum = 0;
  for (const c of contracts) {
    const costs = costsByContract.get(c.id) ?? [];
    if (c.totalCost !== null || costs.length > 0) hasCost = true;
    if (costs.some((x) => x.isPaid)) hasPaid = true;
    const t = contractTotals(c, costs);
    totalSum += t.total;
    paidSum += t.actual;
  }
  return {
    total: hasCost ? totalSum : null,
    paid: hasPaid ? paidSum : null,
    planned: hasCost ? totalSum - paidSum : null,
  };
}

/**
 * Rules 8, 10, 11, 13 — the whole row model the PCF consumed, built in one pass.
 * A month value on a row is the sum of every mapped cost whose LEVEL matches, which is why
 * account and sub-account rows are summed from `flat` rather than from their children.
 */
export function buildGrid(input: GridInput): GridRow[] {
  const {
    accounts, subaccounts, contracts, flat, allCosts,
    commentFlags, showEmptyAccounts = true, costPaidByFilter = "all",
  } = input;

  const keptContracts = contracts.filter((c) => {
    if (costPaidByFilter === "devco") return c.costType === CHOICE_COST.costPaidType.devCo;
    if (costPaidByFilter === "spv") return c.costType === CHOICE_COST.costPaidType.spv;
    return true;
  });
  const keptIds = new Set(keptContracts.map((c) => c.id));
  const usable = flat.filter((f) => keptIds.has(f.contractId));

  const costsByContract = new Map<string, CapexCostRow[]>();
  for (const c of allCosts) {
    const list = costsByContract.get(c.contractId) ?? [];
    list.push(c);
    costsByContract.set(c.contractId, list);
  }

  const sumInto = (
    rows: FlatCost[],
    months: (number | null)[],
    paid: boolean[],
    flagPaid: boolean,
  ) => {
    for (const r of rows) {
      if (r.monthIndex < 1 || r.monthIndex > 12) continue;
      const i = r.monthIndex - 1;
      // GUIDE r06 — a month only leaves `null` (renders "-") once a cost row actually
      // lands in it; a row present with cost 0 stays a real, visible zero.
      months[i] = (months[i] ?? 0) + r.cost;
      // Rule 10 — a month cell is paid if ANY cost row in it is paid, contracts only.
      if (flagPaid && r.isPaid) paid[i] = true;
    }
  };

  const out: GridRow[] = [];
  for (const account of [...accounts].sort((a, b) => a.order - b.order)) {
    const accountMonths = emptyMonths();
    sumInto(usable.filter((f) => f.accountId === account.id), accountMonths, emptyFlags(), false);

    const accountSubs = subaccounts
      .filter((s) => s.parentId === account.id)
      .sort((a, b) => a.order - b.order);

    const subRows: GridRow[] = [];
    const accountContracts: CapexContract[] = [];
    for (const sub of accountSubs) {
      const subMonths = emptyMonths();
      sumInto(usable.filter((f) => f.subaccountId === sub.id), subMonths, emptyFlags(), false);

      const subContracts = keptContracts
        .filter((c) => c.subaccountId === sub.id)
        .sort((a, b) => (a.description ?? a.name).localeCompare(b.description ?? b.name));
      accountContracts.push(...subContracts);

      const contractRows: GridRow[] = subContracts.map((contract) => {
        const months = emptyMonths();
        const paid = emptyFlags();
        sumInto(usable.filter((f) => f.contractId === contract.id), months, paid, true);
        const totals = rollupTotals([contract], costsByContract);
        const flags = commentFlags?.get(contract.id);
        return {
          id: contract.id,
          type: "contract" as const,
          number: "",
          name: contract.description ?? contract.name,
          subLabel: contractSubLabel(contract),
          parentId: sub.id,
          m: months,
          mPaid: paid,
          ...totals,
          hasComments: flags?.general ?? false,
          mHasComments: flags?.months ?? emptyFlags(),
          isStandard: contract.isStandardContract,
          costPaidByText: costPaidByText(contract.costType),
          distribution: contract.distribution,
        };
      });

      const subTotals = rollupTotals(subContracts, costsByContract);
      if (!showEmptyAccounts && subTotals.total === null && contractRows.length === 0) continue;

      subRows.push({
        id: sub.id, type: "subaccount", number: sub.number, name: sub.name, subLabel: "",
        parentId: account.id,
        m: subMonths, mPaid: emptyFlags(),
        ...subTotals,
        hasComments: false, mHasComments: emptyFlags(),
        isStandard: false, costPaidByText: "", distribution: null,
      }, ...contractRows);
    }

    const accountTotals = rollupTotals(accountContracts, costsByContract);
    if (!showEmptyAccounts && accountTotals.total === null && subRows.length === 0) continue;

    out.push({
      id: account.id, type: "account", number: account.number, name: account.name,
      subLabel: "", parentId: null,
      m: accountMonths, mPaid: emptyFlags(),
      ...accountTotals,
      hasComments: false, mHasComments: emptyFlags(),
      isStandard: false, costPaidByText: "", distribution: null,
    }, ...subRows);
  }
  return out;
}

export interface GrandTotalRow {
  m: (number | null)[];
  total: number | null;
  paid: number | null;
  planned: number | null;
}

const sumNullable = (values: (number | null)[]): number | null => {
  const present = values.filter((v): v is number => v !== null);
  return present.length === 0 ? null : present.reduce((a, b) => a + b, 0);
};

/**
 * GUIDE r06/r08 — the dark-banded `Grand Total` row that closes the grid. Sums the
 * ACCOUNT-level rows only: they already roll up every sub-account and contract beneath
 * them, so summing every row would double-count.
 */
export function grandTotalRow(rows: GridRow[]): GrandTotalRow {
  const accounts = rows.filter((r) => r.type === "account");
  const m = emptyMonths();
  for (const a of accounts) {
    a.m.forEach((v, i) => { if (v !== null) m[i] = (m[i] ?? 0) + v; });
  }
  return {
    m,
    total: sumNullable(accounts.map((a) => a.total)),
    paid: sumNullable(accounts.map((a) => a.paid)),
    planned: sumNullable(accounts.map((a) => a.planned)),
  };
}

export function costPaidByText(costType: number | null | undefined): string {
  if (costType === CHOICE_COST.costPaidType.devCo) return "DevCo";
  if (costType === CHOICE_COST.costPaidType.spv) return "SPV";
  return "";
}

/* ═══════════════════════════════════ rules 18–20 · equal distribution ════ */

export interface SchedulePoint { year: number; month: number }

/**
 * Rule 18 — the payment schedule, in the canvas' exact integer arithmetic.
 *
 * `numPayments = RoundDown(Max((ey-sy)*12 + (em-sm), 0) / Coalesce(freq,1), 0) + 1`
 * `Year_i  = sy + RoundDown((sm - 1 + (i-1)*freq) / 12, 0)`
 * `Month_i = Mod(sm - 1 + (i-1)*freq, 12) + 1`
 */
export function distributionSchedule(range: {
  startYear: number; startMonth: number;
  endYear: number; endMonth: number;
  frequency: number | null;
}): SchedulePoint[] {
  const freq = range.frequency && range.frequency > 0 ? range.frequency : 1;
  const span = Math.max(
    (range.endYear - range.startYear) * 12 + (range.endMonth - range.startMonth),
    0,
  );
  const numPayments = roundDown(span / freq, 0) + 1;
  return Array.from({ length: numPayments }, (_, i) => {
    const offset = range.startMonth - 1 + i * freq;
    return {
      year: range.startYear + roundDown(offset / 12, 0),
      month: (offset % 12) + 1,
    };
  });
}

/**
 * Rule 19 — equal amounts with the WHOLE remainder on the final payment, and
 * `Average Payment = RoundDown(total / n, 0)`.
 *
 * Deliberately NOT a "spread the remainder" algorithm: the canvas puts every cent of the
 * remainder on the last row and stores the rounded-down figure as the average.
 */
export function equalDistributionAmounts(
  total: number,
  numPayments: number,
): { amounts: number[]; averagePayment: number } {
  if (numPayments <= 0) return { amounts: [], averagePayment: 0 };
  const base = roundDown(total / numPayments, 0);
  const amounts = Array.from({ length: numPayments }, (_, i) =>
    i === numPayments - 1 ? total - base * (numPayments - 1) : base);
  return { amounts, averagePayment: base };
}

/**
 * Rule 20 — equal distribution REPLACES, it does not merge. The delete of the contract's
 * existing `CAPEX Costs` and the insert of the new schedule go in the SAME batch, so a
 * failure can never leave a contract with no cost rows.
 */
export interface EqualDistributionPlan {
  deleteAllForContract: boolean;
  rows: { year: number; month: number; cost: number }[];
  averagePayment: number;
}

export function planEqualDistribution(
  total: number,
  range: Parameters<typeof distributionSchedule>[0],
): EqualDistributionPlan {
  const schedule = distributionSchedule(range);
  const { amounts, averagePayment } = equalDistributionAmounts(total, schedule.length);
  return {
    deleteAllForContract: true,
    rows: schedule.map((p, i) => ({ ...p, cost: amounts[i] })),
    averagePayment,
  };
}

/* ═══════════════════════════════ rules 21–23 · individual distribution ════ */

export type DistributionScheme = "percent" | "absolute";

export interface PanelMonthRow {
  year: number;
  month: number;
  /** The value the user typed — a percentage or an absolute amount. */
  value: number | null;
  /** The `CAPEX Cost` id when the row already exists in Dataverse. */
  costId: string | null;
}

/** Rules 21/22 — convert the typed values into money. */
export function individualDistribution(
  rows: PanelMonthRow[],
  scheme: DistributionScheme,
  totalCostForPct: number,
): { year: number; month: number; cost: number | null; costId: string | null }[] {
  return rows.map((r) => ({
    year: r.year,
    month: r.month,
    cost: r.value === null || r.value === undefined
      ? null
      : scheme === "percent"
        ? pfxRound((totalCostForPct * r.value) / 100, 0)
        : pfxRound(r.value, 0),
    costId: r.costId,
  }));
}

/**
 * `locValidCostInContract` — the post-gate check the `OnSelect` re-runs even when the
 * Save button was enabled.
 *  · `% Values`      → `Round(Sum(TotalUI), 1) = 100`
 *  · `Absolute Values` → `Sum(TotalSave) > 0`
 */
export function canPersistIndividual(
  rows: PanelMonthRow[],
  scheme: DistributionScheme,
): boolean {
  const sum = rows.reduce((a, r) => a + (r.value ?? 0), 0);
  return scheme === "percent" ? pfxRound(sum, 1) === 100 : sum > 0;
}

export interface CapexWriteSet {
  upserts: { year: number; month: number; cost: number; costId: string | null }[];
  deletes: string[];
}

/**
 * Rule 23 — zero is written only OVER AN EXISTING ROW; a blank with an id is deleted.
 * Source comment: `// <-- existing record, allow 0 update`.
 */
export function capexWriteSet(
  rows: { year: number; month: number; cost: number | null; costId: string | null }[],
): CapexWriteSet {
  const upserts: CapexWriteSet["upserts"] = [];
  const deletes: string[] = [];
  for (const r of rows) {
    if (r.cost === null || r.cost === undefined) {
      if (r.costId) deletes.push(r.costId);
      continue;
    }
    if (r.cost !== 0 || r.costId) {
      upserts.push({ year: r.year, month: r.month, cost: r.cost, costId: r.costId });
    }
  }
  return { upserts, deletes };
}

/**
 * Rule 24 — the cluster-linkage / cost-paid-by confirmation.
 * `colOtherClusterHavingCost` = clusters whose window contains a month that carries a value.
 */
export function clustersHavingCost(
  clusters: ClusterDuration[],
  rows: { year: number; month: number; cost: number | null }[],
): ClusterDuration[] {
  const live = rows.filter((r) => (r.cost ?? 0) !== 0);
  const idx = (y: number, m: number) => y * 12 + m;
  return clusters.filter((c) =>
    live.some((r) =>
      idx(r.year, r.month) >= idx(c.startYear, c.startMonth)
      && idx(r.year, r.month) <= idx(c.endYear, c.endMonth)));
}

export function needsClusterLinkageConfirmation(args: {
  clusters: ClusterDuration[];
  rows: { year: number; month: number; cost: number | null }[];
  selectedClusterOrder: number | null;
  clusterLinkageChanged: boolean;
  costPaidByChanged: boolean;
  milestoneRelinkResetNeeded: boolean;
}): boolean {
  const others = clustersHavingCost(args.clusters, args.rows)
    .filter((c) => c.order !== args.selectedClusterOrder);
  return (others.length > 0 && args.clusterLinkageChanged)
    || args.costPaidByChanged
    || args.milestoneRelinkResetNeeded;
}

/* ══════════════════════════════ rules 14–17 · standard assumptions ════ */

export interface DevexCapexAssumption {
  id: string;
  description: string;
  subaccountId: string | null;
  countryId: string | null;
  technology: string | null;
  costAmount: number | null;
  /** `'Cost Unit'` — `CHOICE_COST.costUnit`. */
  unit: number | null;
  costPaidBy: number | null;
  distributionFrequency: number | null;
  applyVat: boolean;
  depreciation: boolean;
  /** `Cluster 1`…`Cluster 5` ticks. */
  clusters: boolean[];
}

/**
 * Rule 15 — unit conversion. EUR/PLN pass through; the per-WTG and per-MW(p) units
 * multiply and `Round(..., 0)`.
 */
export function standardAssumptionAmount(
  unit: number | null,
  costAmount: number | null,
  ctx: { totalCapacity: number | null; activeWtgCount: number },
): number {
  const amount = costAmount ?? 0;
  switch (unit) {
    case CHOICE_COST.costUnit.eurPerWtg:
    case CHOICE_COST.costUnit.plnPerWtg:
      return pfxRound(ctx.activeWtgCount * amount, 0);
    case CHOICE_COST.costUnit.eurPerMw:
    case CHOICE_COST.costUnit.plnPerMw:
      return pfxRound((ctx.totalCapacity ?? 0) * amount, 0);
    default:
      return amount;
  }
}

/** Rule 17 — `varApplicableStartCostClusterNo: If(locProjectStartClusterNo >= 5, 5, …)`. */
export function applicableStartCluster(startClusterNo: number | null | undefined): number {
  const n = startClusterNo ?? 0;
  return n >= 5 ? 5 : n;
}

/**
 * Rules 14 + 17 — the clusters a standard contract may actually be spread over.
 *
 * A cluster counts only when it is ticked on the assumption, BOTH of its dates exist,
 * `end >= start`, and it is at or after the project's (capped) start cluster.
 */
export function eligibleClusters(
  assumption: Pick<DevexCapexAssumption, "clusters">,
  clusterDurations: ClusterDuration[],
  startClusterNo: number | null,
): ClusterDuration[] {
  const floor = applicableStartCluster(startClusterNo);
  const idx = (y: number, m: number) => y * 12 + m;
  return clusterDurations.filter((c) => {
    if (!assumption.clusters[c.order - 1]) return false;
    if (!c.startYear || !c.endYear || !c.startMonth || !c.endMonth) return false;
    if (idx(c.endYear, c.endMonth) < idx(c.startYear, c.startMonth)) return false;
    return floor === 0 || c.order >= floor;
  });
}

/** Rule 17 — the abort path when nothing survives. */
export function standardContractRefusal(eligible: ClusterDuration[]): string | null {
  return eligible.length === 0 ? MSG.noApplicableCluster : null;
}

/**
 * Rule 14 — the option list. An assumption is offered when its sub-account is in the open
 * category, its country and technology match (case-insensitively, as the canvas does),
 * NO contract already links it for this project × sub-account, and it has at least one
 * eligible cluster.
 */
export function buildStandardOptions(args: {
  assumptions: DevexCapexAssumption[];
  subaccountIdsInCategory: string[];
  project: Pick<CapexProject, "countryId" | "technology" | "startClusterNo">;
  existingContracts: Pick<CapexContract, "subaccountId" | "standardAssumptionId">[];
  clusterDurations: ClusterDuration[];
}): { assumption: DevexCapexAssumption; eligible: ClusterDuration[] }[] {
  const inCategory = new Set(args.subaccountIdsInCategory);
  const used = new Set(
    args.existingContracts
      .filter((c) => c.standardAssumptionId)
      .map((c) => `${c.subaccountId}|${c.standardAssumptionId}`),
  );
  const tech = (args.project.technology ?? "").toLowerCase();

  return args.assumptions
    .filter((a) => a.subaccountId !== null && inCategory.has(a.subaccountId))
    .filter((a) => a.countryId === args.project.countryId)
    .filter((a) => (a.technology ?? "").toLowerCase() === tech)
    .filter((a) => !used.has(`${a.subaccountId}|${a.id}`))
    .map((a) => ({
      assumption: a,
      eligible: eligibleClusters(a, args.clusterDurations, args.project.startClusterNo),
    }))
    .filter((o) => o.eligible.length > 0);
}

/** The standard sub-menu only renders above one option (`ItemVisible: CountRows(...) > 1`). */
export const showStandardSubMenu = (optionCount: number) => optionCount > 1;

/**
 * The click-time re-check. The option list can be stale; the canvas re-queries and
 * refuses rather than creating a duplicate.
 */
export function checkStandardContractClick(args: {
  selectedRow: { type: GridRowType } | null;
  serverHasContract: boolean;
}): { ok: boolean; message?: string; removeOption?: boolean } {
  if (!args.selectedRow || args.selectedRow.type === "contract") {
    return { ok: false, message: MSG.noSubaccountSelected };
  }
  if (args.serverHasContract) {
    return { ok: false, message: MSG.duplicateStandard, removeOption: true };
  }
  return { ok: true };
}

/**
 * Rule 16 — clusters 1–4 are synthesised from `Milestones Standard Assumptions` durations
 * chained off the project's start reference date. Clusters 5 and 6 are NEVER synthesised —
 * the source comment reads "Cluster 6 / COD should not be calculated from standard
 * assumptions. Use actual project value only."
 */
export interface MilestoneDurations {
  cluster1: number | null;
  cluster2: number | null;
  cluster3: number | null;
  cluster4: number | null;
  finalInvestmentDecision: number | null;
}

export function synthesiseClusterDates(
  startReferenceDate: Date,
  durations: MilestoneDurations,
): { order: number; startYear: number; startMonth: number; endYear: number; endMonth: number }[] {
  const steps = [
    durations.cluster1, durations.cluster2, durations.cluster3, durations.cluster4,
  ];
  const out: ReturnType<typeof synthesiseClusterDates> = [];
  let cursor = new Date(startReferenceDate.getTime());
  for (let i = 0; i < steps.length; i++) {
    const months = steps[i] ?? 0;
    const end = new Date(cursor.getFullYear(), cursor.getMonth() + months, 1);
    out.push({
      order: i + 1,
      startYear: cursor.getFullYear(), startMonth: cursor.getMonth() + 1,
      endYear: end.getFullYear(), endMonth: end.getMonth() + 1,
    });
    cursor = end;
  }
  // Clusters 5 and 6 are deliberately absent — see the doc comment.
  return out;
}

/* ══════════════════════════════════════════════════ validation & gating ════ */

export interface ContractForm {
  description: string;
  /** The description the panel opened with — the uniqueness check is suppressed while equal. */
  originalDescription: string | null;
  totalCost: string;
  distribution: number | null;
  scheme: number | null;
  /** Equal Distribution only. */
  equalMode: "cluster" | "dates" | null;
  /** Five checkboxes; `enabled` mirrors the canvas' `DisplayMode = Edit`. */
  clusterTicks: { checked: boolean; enabled: boolean }[];
  startDate: string;
  endDate: string;
  frequency: number | null;
  isDirty: boolean;
  isStandardContract: boolean;
}

/** `MaxLength: 512` on the description box. */
export const DESCRIPTION_MAX_LENGTH = 512;

/**
 * Description validation. `Find("standard", Lower(value))` wins over the uniqueness check,
 * and the whole check is suppressed while the typed value still equals the original.
 */
export function describeDescriptionError(
  value: string,
  ctx: { originalDescription: string | null; existingNames: string[] },
): string | null {
  if (isBlank(value.trim())) return null; // blankness is handled by the Save gate
  if (value === ctx.originalDescription) return null;
  if (value.toLowerCase().includes("standard")) return MSG.standardReserved;
  const needle = value.trim().toLowerCase();
  const clash = ctx.existingNames.some((n) => n.trim().toLowerCase() === needle);
  return clash ? MSG.duplicateContract : null;
}

/** The country-dependent total-cost ceiling. */
export function totalCostMax(countryName: string | null | undefined): number {
  return countryName === "Poland" ? 2_250_000_000 : 500_000_000;
}

export function validateTotalCost(
  value: string,
  countryName: string | null | undefined,
  language = "en-US",
): { valid: boolean; message: string | null; severity: "error" | "warning" } {
  const max = totalCostMax(countryName);
  const ok = isInteger(value, language) && inRange(value, 1, max, language);
  return {
    valid: ok,
    message: ok ? null : MSG.totalCostRange(max, language),
    // The label's colour is Warning for Individual + Absolute, Error otherwise —
    // the caller picks; this is the default.
    severity: "error",
  };
}

const MM_YYYY = /^(0[1-9]|1[0-2])\/[0-9]{4}$/;

/** MM/YYYY format plus the "not before the allowed cost start" floor. */
export function validateMonthYear(
  value: string,
  allowedStart: Date,
  kind: "start" | "end" = "start",
): string | null {
  if (isBlank(value)) return null;
  if (!MM_YYYY.test(value)) return MSG.dateFormat;
  const [mm, yyyy] = value.split("/").map(Number);
  const entered = new Date(yyyy, mm - 1, 1);
  if (entered < allowedStart) {
    const label = mmYYYY(allowedStart.getMonth() + 1, allowedStart.getFullYear());
    return kind === "start" ? MSG.startBefore(label) : MSG.endBefore(label);
  }
  return null;
}

/**
 * The Save button's `DisplayMode`, transcribed.
 *
 * `locEditSaveButtonEnabled` — set true by any field's `OnChange`, so an untouched form
 * cannot be saved — becomes RHF's `isDirty`.
 */
export function canSaveContract(
  form: ContractForm,
  ctx: {
    existingNames: string[];
    countryName: string | null;
    allowedStart: Date;
    language?: string;
  },
): boolean {
  if (!form.isDirty) return false;
  if (isBlank(form.description.trim())) return false;
  if (describeDescriptionError(form.description, {
    originalDescription: form.originalDescription,
    existingNames: ctx.existingNames,
  }) !== null) return false;
  if (form.distribution === null) return false;

  const totalOk = validateTotalCost(form.totalCost, ctx.countryName, ctx.language).valid;

  if (form.distribution === CHOICE_COST.distributionType.individual) {
    if (form.scheme === null) return false;
    // Individual + % requires a total cost; Individual + Absolute does not.
    if (form.scheme === CHOICE_COST.distributionScheme.percentValues && !totalOk) return false;
    return true;
  }

  // Equal Distribution.
  if (form.equalMode === "cluster") {
    // Rule: a CHECKED BUT DISABLED cluster does not count.
    if (!form.clusterTicks.some((c) => c.checked && c.enabled)) return false;
  } else if (form.equalMode === "dates") {
    if (isBlank(form.startDate) || isBlank(form.endDate)) return false;
    if (validateMonthYear(form.startDate, ctx.allowedStart, "start") !== null) return false;
    if (validateMonthYear(form.endDate, ctx.allowedStart, "end") !== null) return false;
  } else {
    return false;
  }
  if (form.frequency === null) return false;
  return totalOk;
}

/** `By Cluster JSON` — a checked-but-disabled cluster serialises as `false`. */
export function byClusterJson(ticks: { checked: boolean; enabled: boolean }[]): string {
  const obj: Record<string, boolean> = {};
  ticks.forEach((t, i) => { obj[`Cluster${i + 1}`] = t.checked && t.enabled; });
  return JSON.stringify(obj);
}

/**
 * Rule 27 — editing a standard contract's description un-marks it as standard and strips
 * the literal word "Standard" out of the text.
 */
export function applyDescriptionChange(
  value: string,
  wasStandard: boolean,
): { description: string; isStandardContract: boolean } {
  if (!wasStandard) return { description: value, isStandardContract: false };
  return {
    description: value.replace(/Standard/g, "").trim(),
    isStandardContract: false,
  };
}

/* ═══════════════════════════════════════════════════════ command gating ════ */

export interface CapexPrivileges {
  canCreateCost: boolean;
  canDeleteCost: boolean;
}

export interface CommandGates {
  addNewCost: boolean;
  addStandardContract: boolean;
  addStandardVisible: boolean;
  edit: boolean;
  deleteCost: boolean;
}

/**
 * `cmd_Costs_ProjectCosts_TableCommandBar.Items`.
 *
 * "Add New Cost" needs a SUB-ACCOUNT row selected; "Edit" and "Delete Cost" need a
 * CONTRACT row. Note the canvas gates "Edit" on `CreatePermission` (there is no separate
 * write probe in `DataSourceInfo` usage here) and "Delete Cost" on `DeletePermission` —
 * that pair is transcribed as-is.
 */
export function capexCommands(args: {
  selected: { type: GridRowType } | null;
  privileges: CapexPrivileges;
  standardOptionCount: number;
  busy: boolean;
}): CommandGates {
  const { selected, privileges, standardOptionCount, busy } = args;
  const isContract = selected?.type === "contract";
  const isSubaccount = selected?.type === "subaccount";
  return {
    addNewCost: !busy && privileges.canCreateCost && isSubaccount,
    addStandardVisible: standardOptionCount > 0,
    addStandardContract:
      !busy && privileges.canCreateCost && isSubaccount && standardOptionCount > 0,
    edit: !busy && privileges.canCreateCost && isContract,
    deleteCost: !busy && privileges.canDeleteCost && isContract,
  };
}

/* ═════════════════════════════════════════════════ rules 25–26 · paid ════ */

/** Rule 25 — marking a milestone-linked INDIVIDUAL cost as paid asks first. */
export function paidToggleNeedsConfirmation(
  contract: Pick<CapexContract, "distribution" | "linkedClusterOrder">,
): boolean {
  return contract.distribution === CHOICE_COST.distributionType.individual
    && contract.linkedClusterOrder !== null
    && contract.linkedClusterOrder !== undefined;
}

/** Rule 26 — find the single cost row; warn instead of writing when there is none. */
export function resolvePaidTarget(
  costs: CapexCostRow[],
  key: { contractId: string; year: number; month: number },
): { costId: string } | { error: string } {
  const hit = costs.find((c) =>
    c.contractId === key.contractId
    && Number(c.year) === key.year
    && monthIndex(c.month) === key.month);
  return hit ? { costId: hit.id } : { error: MSG.noCostRow };
}

/* ═════════════════════════════════════════════ rules 12, 29–33 · comments ════ */

export interface CapexComment {
  id: string;
  text: string;
  contractId: string | null;
  costId: string | null;
  parentId: string | null;
  rootId: string | null;
  commentType: number;
  resolved: boolean;
  resolvedById: string | null;
  createdOn: string;
  createdById: string | null;
}

export interface CommentThread {
  root: CapexComment;
  replies: CapexComment[];
  lastActivityOn: string;
  latestText: string;
  resolved: boolean;
  sequenceNumber: number;
  relatedCostId: string | null;
  isGeneral: boolean;
}

export const COMMENT_MAX_LENGTH = 250;

/** `txt_Draft_Edit_Comment_Value.MaxLength = 250` with a live counter. */
export function truncateComment(value: string): { text: string; counter: string } {
  const text = value.slice(0, COMMENT_MAX_LENGTH);
  return { text, counter: `${text.length} / ${COMMENT_MAX_LENGTH}` };
}

/**
 * Rule 12 — `colCapexCommentsLatest`: keep only roots, attach the NEWEST reply, and fall
 * back to the root's own timestamp and text when it has none.
 */
export function commentThreads(comments: CapexComment[]): CommentThread[] {
  const roots = comments.filter((c) => c.parentId === null);
  const threads = roots.map((root) => {
    const replies = comments
      .filter((c) => c.parentId === root.id)
      .sort((a, b) => a.createdOn.localeCompare(b.createdOn));
    const latest = replies.length > 0 ? replies[replies.length - 1] : null;
    return {
      root,
      replies,
      lastActivityOn: coalesce(latest?.createdOn, root.createdOn) ?? root.createdOn,
      latestText: coalesce(latest?.text, root.text) ?? root.text,
      resolved: root.resolved,
      sequenceNumber: 0,
      relatedCostId: root.costId,
      isGeneral: root.commentType === CHOICE_COST.capexCommentType.generalComment,
    };
  });
  return renumberThreads(threads);
}

/** Rule 31's second half — `SequenceNumber` 1..n over the sorted remaining roots. */
export function renumberThreads(threads: CommentThread[]): CommentThread[] {
  return [...threads]
    .sort((a, b) => a.root.createdOn.localeCompare(b.root.createdOn))
    .map((t, i) => ({ ...t, sequenceNumber: i + 1 }));
}

/**
 * Rule 13 — the grid's comment badges. A contract row badges on an UNRESOLVED
 * "General Comment"; a month cell badges on an unresolved "Comments to payment date" whose
 * cost sits in the displayed year and month.
 */
export function gridCommentFlags(
  threads: CommentThread[],
  costs: CapexCostRow[],
  year: number,
): Map<string, { general: boolean; months: boolean[] }> {
  const costById = new Map(costs.map((c) => [c.id, c]));
  const out = new Map<string, { general: boolean; months: boolean[] }>();
  for (const t of threads) {
    if (t.resolved) continue;
    const contractId = t.root.contractId;
    if (!contractId) continue;
    const entry = out.get(contractId) ?? { general: false, months: emptyFlags() };
    if (t.isGeneral) {
      entry.general = true;
    } else if (t.relatedCostId) {
      const cost = costById.get(t.relatedCostId);
      if (cost && Number(cost.year) === year) {
        const m = monthIndex(cost.month);
        if (m >= 1 && m <= 12) entry.months[m - 1] = true;
      }
    }
    out.set(contractId, entry);
  }
  return out;
}

/** Rule 30 — resolving a root resolves its replies, stamped with the current user. */
export function resolveThread(
  comments: CapexComment[],
  rootId: string,
  resolverId: string,
): CapexComment[] {
  return comments.map((c) =>
    c.id === rootId || c.parentId === rootId
      ? { ...c, resolved: true, resolvedById: resolverId }
      : c);
}

/** Rule 31 — deleting a root stages its replies too, and the survivors renumber. */
export function planDeleteRoot(
  threads: CommentThread[],
  rootId: string,
): { deletedIds: string[]; remaining: CommentThread[] } {
  const target = threads.find((t) => t.root.id === rootId);
  if (!target) return { deletedIds: [], remaining: threads };
  return {
    deletedIds: [target.root.id, ...target.replies.map((r) => r.id)],
    remaining: renumberThreads(threads.filter((t) => t.root.id !== rootId)),
  };
}

/**
 * Rule 32 — the triple sort. The "Add comment" button row is forced last, general comments
 * pin first when the box is ticked, and the base order is `Created On` per the dropdown.
 * Resolved threads are filtered out unless "Show resolved comments" is on.
 */
export function sortComments(
  threads: CommentThread[],
  opts: { pinGeneral: boolean; order: "oldest" | "newest"; showResolved: boolean },
): CommentThread[] {
  const visible = opts.showResolved ? threads : threads.filter((t) => !t.resolved);
  return [...visible].sort((a, b) => {
    if (opts.pinGeneral && a.isGeneral !== b.isGeneral) return a.isGeneral ? -1 : 1;
    const cmp = a.root.createdOn.localeCompare(b.root.createdOn);
    return opts.order === "newest" ? -cmp : cmp;
  });
}

/** Rule 33 — payment-date comments are refused on equal-distributed contracts. */
export function paymentDateCommentsAllowed(
  contract: Pick<CapexContract, "distribution"> | null,
): boolean {
  return contract?.distribution !== CHOICE_COST.distributionType.equal;
}

export interface CommentDraft {
  id: string;
  text: string;
  isDirty: boolean;
  isModified: boolean;
}

/**
 * `btn_Capex_Comment_Save.DisplayMode` — disabled while any row is invalid (blank), enabled
 * when anything is dirty, modified, or staged for deletion.
 */
export function canSaveComments(
  drafts: CommentDraft[],
  deletedIds: string[],
): boolean {
  if (drafts.some((d) => isBlank(d.text.trim()))) return false;
  return drafts.some((d) => d.isDirty || d.isModified) || deletedIds.length > 0;
}

/** Edit / reset icons are hidden on resolved comments. */
export const commentEditable = (thread: Pick<CommentThread, "resolved">) => !thread.resolved;

/** Rule 29 — the saved `Name` convention. */
export const commentName = (sequenceNumber: number, fullName: string) =>
  `Comment - ${sequenceNumber} - ${fullName}`;

/**
 * Rule 28 — deleting a contract deletes its comments. The canvas' matching
 * `RemoveIf('CAPEX Costs', …)` is COMMENTED OUT; the cost rows are left to Dataverse
 * cascade behaviour. We keep that: the relationship is cascade-delete, and adding an
 * explicit delete here would double-delete rows in the same batch.
 */
export function planDeleteContract(
  contractId: string,
  comments: CapexComment[],
): { commentIds: string[]; contractId: string } {
  return {
    commentIds: comments.filter((c) => c.contractId === contractId).map((c) => c.id),
    contractId,
  };
}

/* ══════════════════════════════════════════════════ rule 34 · summary tab ════ */

export interface SummaryRow { id: string; name: string; sum: number }

/** Rule 34 — per-category totals, floored at 0, minus Overleveraging. */
export function summaryRows(
  categories: { id: string; name: string }[],
  totalsByCategoryId: Map<string, number>,
): SummaryRow[] {
  return visibleCategories(categories).map((c) => ({
    id: c.id,
    name: c.name,
    sum: Math.max(totalsByCategoryId.get(c.id) ?? 0, 0),
  }));
}

/** `Text(Sum, "###,###,###,##0") & " " & Coalesce(ISO code, "EUR")`. */
export function formatSummaryAmount(
  sum: number,
  isoCurrencyCode: string | null | undefined,
  language = "en-US",
): string {
  return `${formatThousands(sum, language)} ${coalesce(isoCurrencyCode) ?? "EUR"}`;
}

/* ══════════════════════════════════════════════════════ misc conversions ════ */

/** `Sum(Filter(GeneratorTypeInProjects, Project…, Status = Active), 'Number of Generators')`. */
export function activeWtgCount(
  rows: { count: number | null; status: number }[],
): number {
  return rows
    .filter((r) => r.status === CHOICE_COST.status.active)
    .reduce((a, r) => a + (r.count ?? 0), 0);
}

/** `totalCostForPct` — `Coalesce('Total Cost', Sum(existing costs), Value(typed box))`. */
export function totalCostForPercent(
  contractTotal: number | null,
  existingSum: number,
  typed: string,
  language = "en-US",
): number {
  const typedValue = parseNumber(typed, language);
  return coalesce(contractTotal, existingSum || null, Number.isNaN(typedValue) ? null : typedValue)
    ?? 0;
}
