/**
 * Contracts Screen — every business rule as a pure function.
 *
 * Canvas screen: `Contracts Screen` (Project Costs app)
 *   243 controls · 6 713 lines of Power Fx · 80 substantive blocks · band XL
 *
 * BoP (Balance of Plant) contracts in three flavours: Development, Construction and
 * Project Rights. A Development/Construction contract owns a set of LEVEL-3 CAPEX accounts
 * (`BoP Contracts DevCo Costs` join rows) and derives its cost split around a closing date.
 * Margin defaults come from `Assumptions BoP Contracts`, the app's ONLY connected
 * (Fabric/SQL) source.
 *
 * WHAT WAS DELETED AS A WORKAROUND
 *  · `but_Contracts_RightPanel_NewEdit_Buttons_Recalculate` — the canvas Save button
 *    requires `locContractDevCoCostsDirty`, which ONLY Recalculate sets, so the user had to
 *    press Recalculate before Save became available. Here every figure is derived reactively
 *    and Save is driven by validity plus dirtiness. The "Reset to standard assumption"
 *    action is kept, because that has real meaning.
 *  · `ClearCollect(colCapexAllAccountsTemporary, 'CAPEX Account Lists')` — a full-table load
 *    to build a three-level picker. The tree comes back filtered.
 *  · the hard-coded test-project GUID fallback.
 *
 * TWO CANVAS DEFECTS ARE CORRECTED HERE, both flagged with `// SOURCE DEFECT:` —
 * the `Margin = No` branch still adding the fixed value, and Delete checking
 * `RecordInfo.EditPermission` instead of `DeletePermission`.
 */
import { isBlank, isNumeric, parseNumber, pfxRound } from "@/domain/numeric";
import {
  CHOICE_COST, CAPEX_ROOT_NUMBER, CAPEX_CONTRACT_TREE_EXCLUDED_NUMBER,
} from "@/data/entities";

/* ══════════════════════════════════════════════════════════════════════ types ════ */

export interface CapexAccountRow {
  id: string;
  name: string;
  number: string;
  order: number;
  parentId: string | null;
}

export interface AccountNode {
  id: string;
  parentId: string | null;
  parentIdLevel1: string | null;
  parentIdLevel2: string | null;
  number: string;
  name: string;
  order: number;
  level: 1 | 2 | 3;
  childCount: number;
  /** Only level 3 carries a cost (rule 2). */
  totalCost: number;
  selected: boolean;
  /** The contract that already owns this account, if any (rule 3). */
  usedInContractId: string | null;
  used: boolean;
  isFolded: boolean;
}

export interface DevCoCapexContract {
  id: string;
  accountId: string | null;
  totalCost: number | null;
  /** `'Cost Type'` — only DevCo contracts feed the tree (rule 5). */
  costType: number | null;
}

export interface DevCoCostJoin {
  id: string;
  contractId: string | null;
  accountId: string | null;
}

export interface CapexCostForContract {
  contractId: string;
  accountId: string | null;
  year: number;
  month: number;
  cost: number;
  /** `Contract.'Cost Type'` — SPV rows are excluded from the sums. */
  costType: number | null;
}

export interface BopContract {
  id: string;
  name: string;
  description: string;
  contractType: number | null;
  closingDate: string | null;
  costsUntilClosingType: number | null;
  costsUntilClosingPlan: number | null;
  costsUntilClosingActual: number | null;
  costsAfterClosingType: number | null;
  costsAfterClosingPlan: number | null;
  costsAfterClosingActual: number | null;
  totalCostsType: number | null;
  totalCostsCalculated: number | null;
  totalCostsOverwrite: number | null;
  margin: boolean;
  marginType: number | null;
  marginPercentage: number | null;
  marginFixedValue: number | null;
  totalCostOfContract: number | null;
  isMarginStandardAssumption: boolean;
  isFolded: boolean;
}

export interface PaymentTarget {
  id: string;
  name: string;
  description: string;
  note: string | null;
  contractId: string | null;
  /** Stored as TEXT in `MM/YYYY`. */
  paymentDate: string | null;
  totalCostsContract: number | null;
}

/**
 * One row of the Fabric source `Assumptions BoP Contracts`.
 *
 * The column names are the SQL ones, lower-cased and unprefixed — this is the only source
 * in the app that is not Dataverse, so it does not carry `vsb_` names.
 */
export interface BopAssumption {
  countryname: string | null;
  technology: string | null;
  contracttype: string | null;
  margin: boolean | null;
  margintype: string | null;
  marginvalue: number | null;
}

/* ═══════════════════════════════════════════════════════════════════ messages ════ */

export const CONTR_MSG = {
  /** `lbl_Contracts_RightPanel_NewEdit_PaymentTarget_Description_ErrorMessage.Text` — verbatim. */
  paymentDateBlank: "Input must not be blank",
  /** `lbl_Contracts_RightPanel_NewEdit_PaymentTarget_PaymentDate_ErrorMessage.Text` — verbatim. */
  paymentDateFormat: "Payment date must be in format MM/YYYY.",
  paymentDateBeforeStart: (mm: string, yyyy: string) =>
    `Payment date must be greater project start date ${mm}/${yyyy}`,
  /** `lbl_Contracts_Payment_Targets_RightPanel_TotalCosts_ErrorMessage.Text` — verbatim. */
  oneDecimal: "Numeric value with maximum of one decimals",
  headroom: (max: number) =>
    `Please select a value between 0 and ${
      new Intl.NumberFormat("en-US", {
        minimumFractionDigits: 1, maximumFractionDigits: 1,
      }).format(max)
    }`,
  /**
   * INTERPOLATED — canvas `lbl_AddContract_RightPanel_TotalCost_ErrorMessage_1.Text` builds
   * this from "Value must be between 0 and " + the country bound.
   */
  costRange: "Value must be between 0 and 1,000,000,000.",
  /** `but_Milestones_DisplayProject_Body_General_Content_farmdown_Reset_2.Tooltip` — verbatim. */
  resetTooltip: "Reset to standard assumption.",
  saveFailed:
    "Error: BoP Contract could not be saved correctly. Your changes are still in the panel — "
    + "try again, or copy them somewhere safe before closing it.",
  fabricUnavailable:
    "Standard margin assumptions are unavailable right now. The panel still opens; the "
    + "margin simply has no default.",
} as const;

/** Rule 26 — `locContractsCostsMax`, set in `OnVisible`. */
export const CONTRACT_COSTS_MAX = 1_000_000_000;

/**
 * GUIDE r07 — the screen's own command bar, verbatim: three separate "+ Add … Contract"
 * actions (Development / Construction / Project Rights), then `Edit` and `Delete`, both
 * disabled until a row is selected.
 */
export const CONTRACT_COMMAND_LABELS = {
  /** `btn_AdminContract_Add_Development_Contract.Text` (`Admin Contract Screen`) — verbatim. */
  addDevelopment: "Add Development Contract",
  /** `btn_AdminContract_Add_Construction_Contract.Text` (`Admin Contract Screen`) — verbatim. */
  addConstruction: "Add Construction Contract",
  /**
   * `cmd_Contracts_CommandBar.Items.ItemDisplayName` — verbatim (the canvas literal lives in
   * that formula's record field).
   */
  addRights: "Add Project Rights Contract",
  /** `lbl_Contracts_RightPanel_NewEdit_Header.Text` — verbatim. */
  edit: "Edit",
  /** `btn_Delete_AdminContracts.Text` (`Admin Contract Screen`) — verbatim. */
  delete: "Delete",
} as const;

/* ═════════════════════════════════════════════════ rules 1–3 · account tree ════ */

/**
 * Rule 1 — the three-level picker, built from the children of account `"00001"`.
 * Account number `"10006"` is explicitly EXCLUDED, together with everything below it.
 * Rule 2 — only level-3 rows carry a `TotalCost`.
 * Rule 5 — only DevCo-paid `CAPEX Project Contracts` contribute to that cost.
 */
export function buildAccountTree(
  accounts: CapexAccountRow[],
  capexContracts: DevCoCapexContract[],
): AccountNode[] {
  const root = accounts.find((a) => a.number === CAPEX_ROOT_NUMBER);
  if (!root) return [];

  const devCoTotals = new Map<string, number>();
  for (const c of capexContracts) {
    if (c.costType !== CHOICE_COST.costPaidType.devCo) continue;
    if (!c.accountId) continue;
    devCoTotals.set(c.accountId, (devCoTotals.get(c.accountId) ?? 0) + (c.totalCost ?? 0));
  }

  const childrenOf = (id: string) =>
    accounts.filter((a) => a.parentId === id).sort((a, b) => a.order - b.order);

  const out: AccountNode[] = [];
  for (const level1 of childrenOf(root.id)) {
    if (level1.number === CAPEX_CONTRACT_TREE_EXCLUDED_NUMBER) continue;
    const level2s = childrenOf(level1.id);
    out.push(node(level1, 1, null, null, level2s.length, 0));
    for (const level2 of level2s) {
      const level3s = childrenOf(level2.id);
      out.push(node(level2, 2, level1.id, null, level3s.length, 0));
      for (const level3 of level3s) {
        out.push(node(
          level3, 3, level1.id, level2.id, 0, devCoTotals.get(level3.id) ?? 0,
        ));
      }
    }
  }
  return out;

  function node(
    a: CapexAccountRow, level: 1 | 2 | 3,
    parentIdLevel1: string | null, parentIdLevel2: string | null,
    childCount: number, totalCost: number,
  ): AccountNode {
    return {
      id: a.id, parentId: a.parentId, parentIdLevel1, parentIdLevel2,
      number: a.number, name: a.name, order: a.order, level, childCount, totalCost,
      selected: false, usedInContractId: null, used: false, isFolded: true,
    };
  }
}

/**
 * Rule 3 — an account already joined to ANOTHER contract is flagged `used`; an account
 * joined to the contract currently being edited is NOT flagged, and is pre-selected
 * (rule 24).
 */
export function markUsedAccounts(
  tree: AccountNode[],
  devCoCosts: DevCoCostJoin[],
  editingContractId: string | null,
): AccountNode[] {
  const byAccount = new Map<string, string | null>();
  for (const j of devCoCosts) {
    if (j.accountId) byAccount.set(j.accountId, j.contractId);
  }
  return tree.map((n) => {
    if (!byAccount.has(n.id)) return { ...n, usedInContractId: null, used: false };
    const owner = byAccount.get(n.id) ?? null;
    const mine = owner !== null && owner === editingContractId;
    return {
      ...n,
      usedInContractId: owner,
      used: !mine,
      selected: mine ? true : n.selected,
    };
  });
}

/** Rule 9 — only SELECTED LEVEL-3 rows contribute to any figure. */
export function selectedLevel3Ids(tree: AccountNode[]): string[] {
  return tree.filter((n) => n.selected && n.level === 3).map((n) => n.id);
}

/* ═══════════════════════════════════════════ rules 6–9 · the cost split ════ */

export interface ClosingDate { year: number; month: number }

export function toClosingDate(value: string | Date | null | undefined): ClosingDate | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

/** The DevCo-only cost set the `OnVisible` block builds — SPV contracts are excluded. */
export function devCoCosts(costs: CapexCostForContract[]): CapexCostForContract[] {
  return costs.filter((c) => c.costType !== CHOICE_COST.costPaidType.spv);
}

/**
 * Rule 6 — costs UP TO AND INCLUDING the closing month, in the canvas' two-sum form:
 * `Sum(year <= closingYear) − Sum(mm > closingMonth && year = closingYear)`.
 * Rule 8 — blank without a closing date.
 */
export function costsUntilClosing(
  costs: CapexCostForContract[],
  closing: ClosingDate | null,
  selectedAccountIds: string[],
): number | undefined {
  if (!closing) return undefined;
  const rows = scope(costs, selectedAccountIds);
  const upToYear = sum(rows.filter((c) => c.year <= closing.year));
  const afterMonthInYear = sum(
    rows.filter((c) => c.month > closing.month && c.year === closing.year),
  );
  return upToYear - afterMonthInYear;
}

/** Rule 7 — the complement: `Sum(year > closingYear) + Sum(mm > closingMonth && year =)`. */
export function costsAfterClosing(
  costs: CapexCostForContract[],
  closing: ClosingDate | null,
  selectedAccountIds: string[],
): number | undefined {
  if (!closing) return undefined;
  const rows = scope(costs, selectedAccountIds);
  return sum(rows.filter((c) => c.year > closing.year))
    + sum(rows.filter((c) => c.month > closing.month && c.year === closing.year));
}

const sum = (rows: CapexCostForContract[]) => rows.reduce((a, c) => a + c.cost, 0);

function scope(costs: CapexCostForContract[], accountIds: string[]): CapexCostForContract[] {
  const ids = new Set(accountIds);
  return devCoCosts(costs).filter((c) => c.accountId !== null && ids.has(c.accountId));
}

/* ═══════════════════════════════════════════ rules 10–12 · the totals ════ */

export interface ContractForm {
  description: string;
  contractType: number | null;
  closingDate: string | null;
  untilType: number;
  untilActual: string;
  afterType: number;
  afterActual: string;
  totalType: number;
  totalOverwrite: string;
  marginEnabled: boolean;
  marginType: number | null;
  marginPercentage: string;
  marginFixedValue: string;
  isMarginStandardAssumption: boolean;
  isDirty: boolean;
}

/**
 * Rule 10 — Total Costs is either CALCULATED (each half independently using its computed
 * Plan figure or its manually typed Actual figure, per its own radio) or OVERWRITTEN.
 */
export function totalCosts(
  form: Pick<ContractForm, "untilType" | "untilActual" | "afterType" | "afterActual"
    | "totalType" | "totalOverwrite">,
  computed: { until: number | undefined; after: number | undefined },
  language = "en-US",
): number | undefined {
  if (form.totalType === CHOICE_COST.totalCostsType.overwrite) {
    const v = parseNumber(form.totalOverwrite, language);
    return Number.isNaN(v) ? undefined : v;
  }
  const half = (type: number, actual: string, plan: number | undefined) => {
    if (type === CHOICE_COST.closingDateType.actual) {
      const v = parseNumber(actual, language);
      return Number.isNaN(v) ? undefined : v;
    }
    return plan;
  };
  const until = half(form.untilType, form.untilActual, computed.until);
  const after = half(form.afterType, form.afterActual, computed.after);
  if (until === undefined || after === undefined) return undefined;
  return until + after;
}

export interface MarginInput {
  enabled: boolean;
  type: number | null;
  /** The RAW box values — rule 12's `IsNumeric` guard needs the strings. */
  percentage: string;
  fixedValue: string;
}

/**
 * Rule 11 — `'Total cost of contract [EUR]' = total + margin`.
 *
 * SOURCE DEFECT: the canvas formula is
 *   `If(Margin = Yes,
 *       If(MarginType = Percentage, total * (1 + pct/100), total + fixed),
 *       total + fixed)`
 * — the `Margin = No` branch STILL ADDS `Margin Fixed Value`. Because the fixed-value box
 * is only shown for `Margin = Yes` + `Fixed Value` it is usually blank (`Value("")` = 0), so
 * the bug rarely bites; but a stale value left in state is added to a contract that has no
 * margin at all. Corrected here: `Margin = No` adds NOTHING (UT-CONTR-017).
 * `totalCostOfContractCanvasParity` keeps the canvas arithmetic reachable, and source
 * ambiguity 6 flags this as needing a product decision.
 *
 * Rule 12 — the percentage branch only computes when both the total box and the percentage
 * box are numeric; otherwise the result is blank, never `NaN`.
 */
export function totalCostOfContract(
  total: number | undefined,
  margin: MarginInput,
  language = "en-US",
): number | undefined {
  if (total === undefined || Number.isNaN(total)) return undefined;
  if (!margin.enabled) return total;

  if (margin.type === CHOICE_COST.contractMarginType.percentage) {
    if (!isNumeric(margin.percentage, language)) return undefined;
    return total * (1 + parseNumber(margin.percentage, language) / 100);
  }
  if (margin.type === CHOICE_COST.contractMarginType.fixedValue) {
    if (!isNumeric(margin.fixedValue, language)) return undefined;
    return total + parseNumber(margin.fixedValue, language);
  }
  return total;
}

/** The canvas arithmetic, kept reachable for the regression test. */
export function totalCostOfContractCanvasParity(
  total: number | undefined,
  margin: MarginInput,
  language = "en-US",
): number | undefined {
  if (total === undefined) return undefined;
  const fixed = isNumeric(margin.fixedValue, language)
    ? parseNumber(margin.fixedValue, language) : 0;
  if (!margin.enabled) return total + fixed;
  if (margin.type === CHOICE_COST.contractMarginType.percentage) {
    if (!isNumeric(margin.percentage, language)) return undefined;
    return total * (1 + parseNumber(margin.percentage, language) / 100);
  }
  return total + fixed;
}

/* ═══════════════════════════════════════════ rules 4–5 · Fabric defaults ════ */

/**
 * Rule 4 — the margin defaults for a new Development or Construction contract, looked up
 * CASE-INSENSITIVELY on `contracttype`.
 *
 * The canvas silently skips its `UpdateContext` when the lookup is blank; that behaviour is
 * preserved — a missing Fabric row leaves the margin blank and the panel still opens
 * (UT-CONTR-021, UT-CONTR-055 @ut-ref spec case; 055 sits on no `it()` — see the note on
 * `useBopAssumptions` in hooks.ts).
 */
export function fabricMarginDefaults(
  assumptions: BopAssumption[],
  contractTypeLabel: string,
): {
  marginEnabled: boolean;
  marginType: number | null;
  marginPercentage: string;
  marginFixedValue: string;
  isMarginStandardAssumption: boolean;
} | null {
  const needle = contractTypeLabel.toLowerCase();
  const hit = assumptions.find((a) => (a.contracttype ?? "").toLowerCase() === needle);
  if (!hit) return null;
  const isPercentage = (hit.margintype ?? "").toLowerCase() === "percentage";
  const value = hit.marginvalue === null || hit.marginvalue === undefined
    ? "" : String(hit.marginvalue);
  return {
    marginEnabled: hit.margin === true,
    marginType: isPercentage
      ? CHOICE_COST.contractMarginType.percentage
      : CHOICE_COST.contractMarginType.fixedValue,
    // `marginvalue` populates BOTH boxes in the canvas.
    marginPercentage: value,
    marginFixedValue: value,
    isMarginStandardAssumption: true,
  };
}

/** The Fabric rows are pre-filtered on country + technology before the type lookup. */
export function fabricRowsForProject(
  assumptions: BopAssumption[],
  project: { countryName: string | null; technology: string | null },
): BopAssumption[] {
  return assumptions.filter((a) =>
    a.countryname === project.countryName && a.technology === project.technology);
}

/** The three contract-type labels the Fabric `contracttype` column carries. */
export const CONTRACT_TYPE_LABEL: Record<number, string> = {
  [CHOICE_COST.bopContractTypes.development]: "Development Contract",
  [CHOICE_COST.bopContractTypes.construction]: "Construction Contract",
  [CHOICE_COST.bopContractTypes.projectRights]: "Project Rights Contract",
};

/* ══════════════════════════════════════════════════ naming and payloads ════ */

/** Rule 14 — Development / Construction. */
export function contractName(projectNumber: string, description: string): string {
  return `BoP-${projectNumber}-${description}`;
}

/**
 * Rule 14 — Project Rights.
 *
 * SOURCE DEFECT: the canvas builds this `Name` from
 * `txt_Contracts_RightPanel_NewEdit_Description.Value` — the OTHER panel's description box —
 * while writing `Description` from its own `txt_…_RightsContract_Content_Description.Value`.
 * The Rights contract's `Name` is therefore built from a stale or blank value. Corrected
 * here to use this panel's own description (UT-CONTR-033).
 */
export function rightsContractName(projectNumber: string, description: string): string {
  return `BoP RC-${projectNumber}-${description}`;
}

/** Rule 21 — the payment-target name; `Description` and `'Payment Date'` are both trimmed. */
export function paymentTargetName(
  contractDescription: string,
  targetDescription: string,
): string {
  return `BoP-PT-${contractDescription}-${targetDescription}`;
}

/** Rule 18/35 — the DevCo-cost join name. */
export function devCoCostName(number: string, name: string): string {
  return `${number}-${name}`;
}

/**
 * Rule 15 — Plan and Actual are MUTUALLY EXCLUSIVE on write, as are Calculated and
 * Overwrite. Rule 16 — margin fields are written only when the margin block is visible.
 * Rule 19 — `'Is Standard Contract'` is ALWAYS written `No`, while
 * `'Is Margin Standard Assumption?'` records whether the margin came from Fabric, and
 * `'BoP Standard Assumption Contract'` is written blank unconditionally.
 */
export function contractWritePayload(
  form: ContractForm,
  computed: { until: number | undefined; after: number | undefined },
  language = "en-US",
): Record<string, number | boolean | string | null> {
  const nOrNull = (v: string) => {
    const n = parseNumber(v, language);
    return Number.isNaN(n) ? null : n;
  };
  const marginVisible = form.marginEnabled;
  const total = totalCosts(form, computed, language);

  return {
    costsUntilClosingType: form.untilType,
    costsUntilClosingPlan:
      form.untilType === CHOICE_COST.closingDateType.plan ? computed.until ?? null : null,
    costsUntilClosingActual:
      form.untilType === CHOICE_COST.closingDateType.actual ? nOrNull(form.untilActual) : null,
    costsAfterClosingType: form.afterType,
    costsAfterClosingPlan:
      form.afterType === CHOICE_COST.closingDateType.plan ? computed.after ?? null : null,
    costsAfterClosingActual:
      form.afterType === CHOICE_COST.closingDateType.actual ? nOrNull(form.afterActual) : null,
    totalCostsType: form.totalType,
    totalCostsCalculated:
      form.totalType === CHOICE_COST.totalCostsType.calculated ? total ?? null : null,
    totalCostsOverwrite:
      form.totalType === CHOICE_COST.totalCostsType.overwrite
        ? nOrNull(form.totalOverwrite) : null,
    margin: form.marginEnabled,
    marginType: marginVisible ? form.marginType : null,
    marginPercentage:
      marginVisible && form.marginType === CHOICE_COST.contractMarginType.percentage
        ? nOrNull(form.marginPercentage) : null,
    marginFixedValue:
      marginVisible && form.marginType === CHOICE_COST.contractMarginType.fixedValue
        ? nOrNull(form.marginFixedValue) : null,
    totalCostOfContract: totalCostOfContract(total, {
      enabled: form.marginEnabled, type: form.marginType,
      percentage: form.marginPercentage, fixedValue: form.marginFixedValue,
    }, language) ?? null,
    isStandardContract: false,
    isMarginStandardAssumption: form.isMarginStandardAssumption,
    bopStandardAssumptionContract: null,
  };
}

/**
 * Rule 18 — saving a contract REPLACES its whole DevCo-cost set: the old joins are removed
 * and the new selection inserted, both inside the same `$batch`.
 */
export function planDevCoCostSet(
  tree: AccountNode[],
  existingJoins: DevCoCostJoin[],
  contractId: string | null,
): { deleteIds: string[]; create: { accountId: string; name: string }[] } {
  const selected = tree.filter((n) => n.selected && n.level === 3);
  return {
    deleteIds: existingJoins
      .filter((j) => contractId !== null && j.contractId === contractId)
      .map((j) => j.id),
    create: selected.map((n) => ({
      accountId: n.id, name: devCoCostName(n.number, n.name),
    })),
  };
}

/**
 * Rule 25 — the canvas' contract delete only does
 * `Remove('BoP Projects Contracts', locSelectedContract)` and leaves the payment targets and
 * DevCo-cost joins to Dataverse cascade rules. Here they are deleted EXPLICITLY in the same
 * batch, so a missing or misconfigured cascade cannot orphan them (UT-CONTR-048).
 */
export function planDeleteContract(
  contractId: string,
  targets: PaymentTarget[],
  joins: DevCoCostJoin[],
): { targetIds: string[]; joinIds: string[]; contractId: string } {
  return {
    targetIds: targets.filter((t) => t.contractId === contractId).map((t) => t.id),
    joinIds: joins.filter((j) => j.contractId === contractId).map((j) => j.id),
    contractId,
  };
}

/* ═══════════════════════════════════════════════ validation and gating ════ */

/** Cost boxes are two-decimal in `0 … locContractsCostsMax`. */
export function validateCostValue(value: string, language = "en-US"): string | null {
  if (isBlank(value)) return null;
  const sep = language.startsWith("en") ? "\\." : ",";
  if (!new RegExp(`^\\d+(?:${sep}\\d{0,2})?$`).test(value)) return CONTR_MSG.costRange;
  const n = parseNumber(value, language);
  return n >= 0 && n <= CONTRACT_COSTS_MAX ? null : CONTR_MSG.costRange;
}

/** Payment-target percentages are ONE-decimal (`fn_Numeric_Contracts.IsOneDecimal`). */
export function validatePaymentPercentage(
  value: string,
  headroom: number,
  language = "en-US",
): string | null {
  if (isBlank(value)) return null;
  const sep = language.startsWith("en") ? "\\." : ",";
  if (!new RegExp(`^\\d+(?:${sep}\\d?)?$`).test(value)) return CONTR_MSG.oneDecimal;
  const n = parseNumber(value, language);
  return n >= 0 && n <= headroom ? null : CONTR_MSG.headroom(headroom);
}

/**
 * Rule 20 — the headroom left for a payment target, EXCLUDING the row being edited:
 * `Round(100 − (sumOfAllTargets − thisTarget), 1)`.
 */
export function paymentTargetHeadroom(
  targets: PaymentTarget[],
  editingTargetId: string | null,
): number {
  const total = targets.reduce((a, t) => a + (t.totalCostsContract ?? 0), 0);
  const own = editingTargetId === null
    ? 0
    : targets.find((t) => t.id === editingTargetId)?.totalCostsContract ?? 0;
  return pfxRound(100 - (total - own), 1);
}

/** Rule 20 — "Add Period" is enabled only while the existing targets sum below 100. */
export function canAddPaymentTarget(targets: PaymentTarget[]): boolean {
  return targets.reduce((a, t) => a + (t.totalCostsContract ?? 0), 0) < 100;
}

const MM_YYYY = /^(0[1-9]|1[0-2])\/\d{4}$/;

/**
 * Rule 22 — the payment date must be MM/YYYY and not before the project start.
 *
 * The canvas builds its comparison date as
 * `DateValue($"{yyyy}-{mm}-{Day('Project Start Date')}")` — it reuses the project start's
 * DAY-OF-MONTH, which makes the comparison depend on an irrelevant field. Compared here at
 * MONTH precision instead, which is what the format implies.
 */
export function validatePaymentDate(
  value: string,
  projectStartDate: string | Date | null,
): string | null {
  if (isBlank(value)) return CONTR_MSG.paymentDateBlank;
  if (!MM_YYYY.test(value)) return CONTR_MSG.paymentDateFormat;
  if (!projectStartDate) return null;
  const start = projectStartDate instanceof Date
    ? projectStartDate : new Date(projectStartDate);
  if (Number.isNaN(start.getTime())) return null;
  const [mm, yyyy] = value.split("/").map(Number);
  const entered = yyyy * 12 + mm;
  const startIndex = start.getFullYear() * 12 + (start.getMonth() + 1);
  if (entered < startIndex) {
    return CONTR_MSG.paymentDateBeforeStart(
      String(start.getMonth() + 1).padStart(2, "0"), String(start.getFullYear()),
    );
  }
  return null;
}

/**
 * `pcf_Contracts_RightPanel_NewEdit_Buttons_Save.DisplayMode`, transcribed — minus the
 * `locContractDevCoCostsDirty` clause, which only the removed Recalculate button could set.
 * `isDirty` takes its place, so an untouched panel still cannot be saved.
 */
export function canSaveContract(
  form: ContractForm,
  selectedAccounts: string[],
  computed: { until: number | undefined; after: number | undefined },
  language = "en-US",
): boolean {
  if (!form.isDirty) return false;
  if (selectedAccounts.length === 0) return false;
  if (isBlank(form.description.trim())) return false;
  if (isBlank(form.closingDate)) return false;

  // Each cost block: the branch matching its radio must be non-blank and error-free.
  const half = (type: number, actual: string, plan: number | undefined) => {
    if (type === CHOICE_COST.closingDateType.actual) {
      return !isBlank(actual) && validateCostValue(actual, language) === null;
    }
    return plan !== undefined;
  };
  if (!half(form.untilType, form.untilActual, computed.until)) return false;
  if (!half(form.afterType, form.afterActual, computed.after)) return false;

  if (form.totalType === CHOICE_COST.totalCostsType.overwrite) {
    if (isBlank(form.totalOverwrite)) return false;
    if (validateCostValue(form.totalOverwrite, language) !== null) return false;
  } else if (totalCosts(form, computed, language) === undefined) {
    return false;
  }

  if (form.marginEnabled) {
    if (form.marginType === CHOICE_COST.contractMarginType.percentage) {
      if (isBlank(form.marginPercentage)) return false;
      if (!isNumeric(form.marginPercentage, language)) return false;
    } else if (form.marginType === CHOICE_COST.contractMarginType.fixedValue) {
      if (isBlank(form.marginFixedValue)) return false;
      if (validateCostValue(form.marginFixedValue, language) !== null) return false;
    } else {
      return false;
    }
  }
  return true;
}

/** The three-field Project Rights panel has its own, much smaller gate. */
export function canSaveRightsContract(
  form: Pick<ContractForm, "description" | "closingDate" | "totalOverwrite" | "isDirty">,
  language = "en-US",
): boolean {
  if (!form.isDirty) return false;
  if (isBlank(form.description.trim())) return false;
  if (isBlank(form.closingDate)) return false;
  if (isBlank(form.totalOverwrite)) return false;
  return validateCostValue(form.totalOverwrite, language) === null;
}

export interface ContractPermissions {
  canCreate: boolean;
  canEditRecord: boolean;
  canDeleteRecord: boolean;
}

export interface ContractCommandGates {
  addDevelopment: boolean;
  addConstruction: boolean;
  addRights: boolean;
  edit: boolean;
  delete: boolean;
}

/**
 * `cmd_Contracts_CommandBar.Items`.
 *
 * SOURCE DEFECT: the canvas gates BOTH "Edit" and "Delete" on
 * `RecordInfo(locSelectedContract, RecordInfo.EditPermission)` — Delete never checks the
 * DELETE privilege. The server rejects the delete anyway, so the only effect is a
 * misleading enabled button; corrected here to `canDeleteRecord` (UT-CONTR-049).
 * `contractCommandsCanvasParity` keeps the canvas gating reachable.
 */
export function contractCommands(args: {
  selected: BopContract | null;
  permissions: ContractPermissions;
  busy: boolean;
}): ContractCommandGates {
  const { selected, permissions, busy } = args;
  const add = permissions.canCreate && !busy;
  return {
    addDevelopment: add,
    addConstruction: add,
    addRights: add,
    edit: !busy && selected !== null && permissions.canEditRecord,
    delete: !busy && selected !== null && permissions.canDeleteRecord,
  };
}

export function contractCommandsCanvasParity(args: {
  selected: BopContract | null;
  permissions: ContractPermissions;
}): Pick<ContractCommandGates, "edit" | "delete"> {
  const enabled = args.selected !== null && args.permissions.canEditRecord;
  return { edit: enabled, delete: enabled };
}

/**
 * The payment-target command bar. In the canvas none of its three commands carries a
 * `DataSourceInfo` / `RecordInfo` check at all; the privilege gates are ADDED here, per the
 * implementation steps.
 */
export function paymentTargetCommands(args: {
  contract: BopContract | null;
  cardContractId: string;
  selectedTarget: PaymentTarget | null;
  targets: PaymentTarget[];
  permissions: ContractPermissions;
}): { addPeriod: boolean; edit: boolean; delete: boolean } {
  const inScope = args.contract !== null && args.contract.id === args.cardContractId;
  return {
    addPeriod: inScope && args.permissions.canCreate && canAddPaymentTarget(args.targets),
    edit: inScope && args.selectedTarget !== null && args.permissions.canEditRecord,
    delete: inScope && args.selectedTarget !== null && args.permissions.canDeleteRecord,
  };
}

/* ═══════════════════════════════════════════════════════ rules 23, 24, 27 ════ */

/** Rule 23 — the card's margin label and value. Fabric-sourced margins render italic. */
export function marginDisplay(
  contract: Pick<BopContract, "margin" | "marginType" | "marginPercentage"
    | "marginFixedValue" | "isMarginStandardAssumption">,
  isoCurrencyCode: string | null | undefined,
): { label: string; value: number | null; italic: boolean } {
  const isPercentage = contract.marginType === CHOICE_COST.contractMarginType.percentage;
  const unit = isPercentage ? "%" : (isoCurrencyCode || "EUR");
  return {
    label: `Margin [${unit}]`,
    value: contract.margin
      ? (isPercentage ? contract.marginPercentage : contract.marginFixedValue)
      : null,
    italic: contract.isMarginStandardAssumption,
  };
}

/** Rule 24 — a Project Rights contract opens the three-field panel, not the full one. */
export function panelForContract(
  contract: Pick<BopContract, "contractType">,
): "rights" | "main" {
  return contract.contractType === CHOICE_COST.bopContractTypes.projectRights
    ? "rights" : "main";
}

/** Rule 27 — the card list is grouped and sorted by `Contract Types`. */
export function groupByContractType(contracts: BopContract[]): BopContract[] {
  return [...contracts].sort((a, b) => (a.contractType ?? 0) - (b.contractType ?? 0));
}

/**
 * Rule 13's replacement — the canvas required an explicit Recalculate click before Save was
 * available. Here every derived figure recomputes from the form and the cost set, so
 * `deriveFigures` is what the panel renders and what `canSaveContract` reads
 * (UT-CONTR-056).
 */
export function deriveFigures(
  form: ContractForm,
  costs: CapexCostForContract[],
  tree: AccountNode[],
  language = "en-US",
): {
  until: number | undefined;
  after: number | undefined;
  total: number | undefined;
  totalOfContract: number | undefined;
} {
  const closing = toClosingDate(form.closingDate);
  const accountIds = selectedLevel3Ids(tree);
  const until = costsUntilClosing(costs, closing, accountIds);
  const after = costsAfterClosing(costs, closing, accountIds);
  const total = totalCosts(form, { until, after }, language);
  return {
    until,
    after,
    total,
    totalOfContract: totalCostOfContract(total, {
      enabled: form.marginEnabled, type: form.marginType,
      percentage: form.marginPercentage, fixedValue: form.marginFixedValue,
    }, language),
  };
}
