/**
 * Contracts screen — every decision, as pure functions.
 *
 * Canvas source: `Src/Contracts Screen.pa.yaml` (243 controls, 7,835 lines of Power Fx).
 * Nothing in here touches React, the network or a global. If it branches on data it lives
 * here and it has a test.
 *
 * Provenance comments cite the canvas control and property the rule came from, in the form
 * `control.Property`, so a reviewer can diff against the `.pa.yaml`.
 */
import { isDecimal, isInteger, inRange, orZero, parseNumber, round, sum } from "@/domain/numeric";

/* ══════════════════════════════════════════════════════════════ option sets */

/** `vsb_contracttypes` — values read from the generated model, not guessed. */
export const CONTRACT_TYPE = {
  None: 952850000,
  Development: 952850001,
  Construction: 952850002,
  ProjectRights: 952850003,
} as const;
export type ContractType = (typeof CONTRACT_TYPE)[keyof typeof CONTRACT_TYPE];

/**
 * The `BoP Contract Types` choice labels, as Power Fx renders them when a choice is
 * interpolated into a string (`$"Total {ThisItem.'Contract Types'} […]"`, `:1163`).
 */
export const CONTRACT_TYPE_NAME: Record<number, string> = {
  [CONTRACT_TYPE.Development]: "Development Contract",
  [CONTRACT_TYPE.Construction]: "Construction Contract",
  [CONTRACT_TYPE.ProjectRights]: "Project Rights Contract",
};

/**
 * Whether a contract card shows the closing-cost block.
 *
 * Every card field except `Closing Date` is gated on
 * `Not(ThisItem.'Contract Types' = 'BoP Contract Types'.'Project Rights Contract')`
 * (`con_Contracts_List_Card_Body_Fields_{CostsUntilClosing,Margins,TotalDevContract,
 * CostsAfterClosing,TotalCosts}.Visible`). A Project Rights contract shows only its own
 * total (`…_TotalCosts_RC`, the mirror-image `Visible`) plus the closing date.
 */
export function cardShowsClosingCosts(contractType: number | undefined): boolean {
  return contractType !== CONTRACT_TYPE.ProjectRights;
}

/**
 * The contract card's total-cost label.
 *
 * Two DIFFERENT controls, not one with a conditional:
 *   - `lbl_…_Card_Body_Fields_TotalDevContract` = $"Total {Contract Types} [{cur}]"  (:1163)
 *   - `lbl_…_Card_Body_Fields_TotalCosts_RC`    = "Total Project Rights Contract […]" (:1023)
 *
 * They coincide for a Project Rights contract, which is why one function covers both. Note this
 * is NOT `"Total cost of contract"` — that label belongs to the right-hand EDIT PANEL
 * (`lbl_Contracts_RightPanel_NewEdit_TotalCosts_Contract`, `:6200`) and rendering it on the card
 * was this screen's visible mismatch against canvas.
 */
/**
 * The card's closing date.
 *
 * `dtp_Contracts_List_Card_Body_Fields_ClosingDate.Format = 'DatePickerCanvas.Format'
 * .LongAbbreviated` (`:1056`) — abbreviated weekday, abbreviated month, day, year, e.g.
 * `Sun, Apr 13, 2025`. `toLocaleDateString()` with no options gave `4/13/2025`.
 */
export function longAbbreviatedDate(value: Date | undefined, locale?: string): string {
  if (!value) return "-";
  return value.toLocaleDateString(locale, {
    weekday: "short", month: "short", day: "numeric", year: "numeric",
  });
}

export function cardTotalLabel(contractType: number | undefined, currency: string): string {
  const name = contractType === undefined ? "" : CONTRACT_TYPE_NAME[contractType] ?? "";
  return `Total ${name} [${currency}]`.replace("Total  [", "Total [");
}

/** `vsb_costsuntilclosingdate` / `vsb_costsafterclosingdate`. */
export const CLOSING_DATE_TYPE = {
  None: 952850000,
  Plan: 952850001,
  Actual: 952850002,
} as const;
export type ClosingDateType = (typeof CLOSING_DATE_TYPE)[keyof typeof CLOSING_DATE_TYPE];

/** `vsb_totalcoststype`. */
export const TOTAL_COSTS_TYPE = {
  None: 952850000,
  Calculated: 952850001,
  Overwrite: 952850002,
} as const;
export type TotalCostsType = (typeof TOTAL_COSTS_TYPE)[keyof typeof TOTAL_COSTS_TYPE];

/** `vsb_margintype`. */
export const MARGIN_TYPE = {
  Percentage: 952850000,
  FixedValue: 952850001,
} as const;
export type MarginType = (typeof MARGIN_TYPE)[keyof typeof MARGIN_TYPE];

/** `vsb_costtype` on CAPEX Project Contract. Only DevCo costs feed a BoP contract. */
export const COST_TYPE = { None: 952850000, DevCo: 952850001, SPV: 952850002 } as const;

/**
 * Contract-type labels.
 *
 * The canvas app rendered `Text(ThisItem.'Contract Types')`, i.e. the option-set display
 * label, in the card header (`lbl_Contracts_List_CardHeader_Description.Text` =
 * `$"{ThisItem.'Contract Types'} - {ThisItem.Description}"`) and in both panel headers.
 * Dataverse returns `vsb_contracttypesname` for the same thing, but a create response does
 * not always carry it, so the labels are transcribed here as the fallback.
 */
export const CONTRACT_TYPE_LABELS: Record<number, string> = {
  [CONTRACT_TYPE.None]: "",
  [CONTRACT_TYPE.Development]: "Development Contract",
  [CONTRACT_TYPE.Construction]: "Construction Contract",
  [CONTRACT_TYPE.ProjectRights]: "Project Rights Contract",
};

/* ═══════════════════════════════════════════════════════════════════ strings */

/**
 * `gblAppResx`, set in `App.OnStart`. Transcribed verbatim — including
 * "one decimals" and "two decimals", which are the canvas app's own wording.
 */
export const RESX = {
  numericOneDecimals: "Numeric value with maximum of one decimals",
  numericTwoDecimals: "Numeric value with maximum of two decimals",
  numericThreeDecimals: "Numeric value with maximum of three decimals",
  numeric: "Numeric value without decimals",
  inputBlank: "Input must not be blank",
} as const;

/** Screen-level strings, each transcribed from the control named in the comment. */
export const MSG = {
  /** `cmd_Contracts_CommandBar.Items[0..4].ItemDisplayName` */
  addDevelopmentContract: "Add Development Contract",
  addConstructionContract: "Add Construction Contract",
  addProjectRightsContract: "Add Project Rights Contract",
  edit: "Edit",
  delete: "Delete",

  /** `lbl_Contracts_List_Card_Body_PaymentTargets.Text` and its header row */
  paymentTargets: "Payment Targets",
  period: "Period",
  notes: "Notes",
  paymentDate: "Payment Date",
  percentOfTotalCosts: "% of Total Costs",

  /** `lbl_Contracts_List_Card_Body_Fields_ClosingDate.Text` — the CARD's label (`:1099`). */
  closingDate: "Closing Date",

  /** Right-panel field labels */
  description: "Description",
  contractClosingDate: "Contract Closing Date",
  plan: "Plan",
  actual: "Actual",
  calculated: "Calculated",
  overwrite: "Overwrite",
  margin: "Margin",
  marginPercent: "Margin [%]",
  devCoCostsFrom: "DevCo Costs From",
  comment: "Comment",
  totalCostsContractPercent: "Total Costs Contract [%]",
  closingDatePlaceholder: "Select a closing date...",
  paymentDatePlaceholder: "MM/YYYY",
  resetToStandardAssumption: "Reset to standard assumption.",

  /** Panel headers — `lbl_Contracts_RightPanel_NewEdit_Header.Text` */
  addPeriod: "Add Period",
  editPeriod: "Edit Period",

  save: "Save",
  cancel: "Cancel",

  /** `lbl_..._PaymentTarget_PaymentDate_ErrorMessage.Text` */
  paymentDateFormat: "Payment date must be in format MM/YYYY.",

  /** `cmp_OpexCosts_PopUpConfirmation_DeleteContracts` / `..._DeletePaymentTarget` */
  /*
   * `locContractSpinnerInformationText` — the canvas picks a DIFFERENT string per operation, on
   * the Save/Confirm that starts it. A single "Saving Contract data..." for all five, which is
   * what this screen showed, is wrong for four of them.
   */
  spinnerSavingContract: "Saving Contract data...",
  spinnerSavingRightsContract: "Saving Project Right Contract data...",
  spinnerSavingPaymentTarget: "Saving payment target data...",
  spinnerDeletingContract: "Deleting contract...",
  spinnerDeletingPaymentTarget: "Deleting payment target...",
} as const;

/**
 * `locContractsCostsMax`, set in `Contracts Screen.OnVisible`. Every cost field on this
 * screen is validated against 0..this.
 */
export const CONTRACT_COSTS_MAX = 1_000_000_000;

/** `lbl_..._PaymentTarget_Note_Details.Text` is `{Len}/55`; the comment counter is `/255`. */
export const NOTE_MAX_LENGTH = 55;
export const COMMENT_MAX_LENGTH = 255;

/* ════════════════════════════════════════════════════════════════════ types */

export interface ProjectContext {
  projectId: string;
  /** `vsb_name`, whose DISPLAY name is "Project ID" — used in the derived contract name. */
  projectIdCode: string;
  projectName: string;
  /**
   * The country's `vsb_name`, as the canvas' `gblRecordSelectedProjectCountry.Name`.
   *
   * Carried as the NAME and not just the id because the one rule that needs it compares against
   * a literal: `totalCostMax` is 2.25bn for `"Poland"` and 500m everywhere else
   * (`CapexScreenCode.txt:10770`). The loader already reads this column for the currency lookup.
   */
  countryName?: string;
  /**
   * `gblSelectedProject.'Area/State/Province'.Name` — the `vsb_countryarea` lookup's name.
   *
   * Carried as the NAME for the same reason `countryName` is: the one thing that reads it
   * compares against literals. `App.OnStart` (`OnStart.txt:902-961`) derives `gblAreaWithRegion`
   * from it with an **Italy-only** `Switch` over the twenty Italian regions, and both period
   * screens then render `"Italy - " & Substitute(gblAreaWithRegion, "Italy_", "")` in the grid's
   * Inflation Profile cell and in the panel's read-only country text
   * (`OpexCostScreenCode.txt:1829-1847`, `:7869-7927`). `opexRules.ITALY_AREA_BY_REGION` holds
   * that map; without this field it could only ever answer for a non-Italian project, and an
   * Italian one rendered `"Italy - "` with nothing after it.
   *
   * MEASURED, VSBCloud_Dev 16 Sep: `vsb_countryarea` holds exactly the twenty Italian regions
   * `ITALY_AREA_BY_REGION` lists — including `Valle d’Aosta` with a U+2019 apostrophe — plus the
   * German Länder, the French regions, the Polish voivodeships and the Croatian counties. Every
   * live Italian project carries one (Zingariello `de5aade5-…` → Puglia, `Italy Test Checklist`
   * `d47ccefb-…` → Trentino Alto Adige); Quellendorf I is Saxony-Anhalt and Project New Data is
   * Mecklenburg-Western Pomerania, so both correctly resolve to no region.
   */
  areaStateProvince?: string;
  /**
   * `vsb_projectstartdate`, whose DISPLAY name is "Project Start Date" — the canvas'
   * `gblSelectedProject.'Project Start Date'` (44 references across the canvas source).
   *
   * NOT `vsb_startdate` ("Start Date"), a different and, on real rows, usually EMPTY column
   * that the loader used to read. Reading the wrong one made `costAllowedStart` fall through
   * to `Today()` — see `loadProject` in `src/data/project.ts`.
   */
  startDate?: Date;
  /**
   * `vsb_startcluster` — 0 = Greenfield, 1..6 = the cluster the project was acquired at.
   *
   * `locProjectStartClusterNo` in the canvas. `costAllowedStart` prefers the acquisition date
   * over the project start date when this is > 0, so it cannot be assumed to be 0.
   */
  startClusterNo?: number;
  /**
   * `gblSelectedProject.'Cluster State'.Order` — the cluster the project has actually REACHED.
   *
   * A `vsb_projectstate` LOOKUP on the project row (`vsb_clusterstate`), not the `vsb_startcluster`
   * option set and not a row index: the table's `Order` values are 0 Draft, 1..6 Cluster 1..6,
   * 8 Abandoned, 9 Inactive/On-hold, so a consumer that wants "the clusters" filters to 1..6.
   * Measured on VSBCloud_Dev, 16 Sep — Wirmighausen (`9f5aade5-…`) is "Cluster 4", Order 4.
   *
   * The one consumer is the Add/Edit Costs panel's "Link to Milestone" dropdown, whose Items are
   * `Filter('Project States', Order in [1..6] && Order > gblSelectedProject.'Cluster State'.Order
   * && Order >= Max(1, varStartClusterNo))` (`CapexScreenCode.txt:11268-11276`): a cost may only
   * be linked to a milestone the project has NOT yet passed. `undefined` where the lookup is
   * blank, which the rule treats as 0 — every cluster then qualifies on that clause alone.
   */
  clusterStateOrder?: number;
  owningBusinessUnitId?: string;
  /** `gblRecordSelectedProjectCountry.'ISO Currency Code'`, "EUR" when absent. */
  isoCurrencyCode?: string;
  /**
   * The milestone dates the CAPEX cluster timeline is built from.
   *
   * `gblClusterDurations` in `OnStart.txt` chains them: Feasibility -> Development started ->
   * Application submitted -> Legally binding permits -> Construction -> COD -> End Date. They
   * live on the project row itself, not on a milestones table.
   */
  milestones?: ProjectMilestones;
  endDate?: Date;
  acquisitionDate?: Date;
  totalCapacity?: number;
}

/** The six cluster boundaries, in order. Any of them may be missing on a real project. */
export interface ProjectMilestones {
  feasibilityStudies?: Date;
  developmentStarted?: Date;
  applicationSubmitted?: Date;
  legallyBindingPermits?: Date;
  construction?: Date;
  operationsStartCod?: Date;
  endDate?: Date;
}

export interface BopContract {
  id: string;
  name?: string;
  description?: string;
  contractType: ContractType;
  closingDate?: Date;
  costsUntilClosingType: ClosingDateType;
  costsUntilClosingPlan?: number;
  costsUntilClosingActual?: number;
  costsAfterClosingType: ClosingDateType;
  costsAfterClosingPlan?: number;
  costsAfterClosingActual?: number;
  totalCostsType: TotalCostsType;
  totalCostsCalculated?: number;
  totalCostsOverwrite?: number;
  margin: boolean;
  marginType?: MarginType;
  marginPercentage?: number;
  marginFixedValue?: number;
  totalCostOfContract?: number;
  comment?: string;
  isStandardContract: boolean;
  isMarginStandardAssumption: boolean;
}

export interface PaymentTarget {
  id: string;
  contractId: string;
  description?: string;
  /** STORED AS TEXT. `vsb_paymentdate` is `nvarchar`, not a date column — see notes below. */
  paymentDate?: string;
  /** `vsb_totalcostscontract` — despite the name this is a PERCENTAGE, 0..100. */
  totalCostsContract?: number;
  note?: string;
}

/** One CAPEX cost row, flattened the way `colSelectedProjectCapexContractsCosts` was. */
export interface CapexCostRow {
  contractId: string;
  year: number;
  /** 1-12. The canvas app carried this as `mm: Int(ThisRecord.Month)`. */
  month: number;
  cost?: number;
}

/** A CAPEX Project Contract, reduced to what this screen needs. */
export interface CapexProjectContract {
  id: string;
  accountId?: string;
  totalCost?: number;
}

/** One node of the three-level CAPEX account tree the DevCo picker renders. */
export interface AccountNode {
  id: string;
  parentId?: string;
  /** `ParentIdLevel1` / `ParentIdLevel2` in the canvas collection. */
  level1Id?: string;
  level2Id?: string;
  number: string;
  name: string;
  order: number;
  level: 1 | 2 | 3;
  childCount: number;
  totalCost: number;
  /** Ticked in this panel. `colSelectedConratctWithDevCoCosts.Selected`. */
  selected: boolean;
  /** Already claimed by a DIFFERENT contract, so unavailable. `.Used`. */
  used: boolean;
  usedByContractId?: string;
}

/** Raw CAPEX Account List row. */
export interface AccountRow {
  id: string;
  number: string;
  name: string;
  order?: number;
  parentId?: string;
  parentNumber?: string;
}

/* ══════════════════════════════════════════════════════════ the account tree */

/**
 * `Contracts Screen.OnVisible` — the level-1 roots.
 *
 * The canvas filter is
 * `Filter(colCapexAllAccountsTemporary, 'Parent Account'.Number = "00001", Not(Number = "10006"))`.
 * So a root is any account whose PARENT is the "00001" account, excluding the one numbered
 * "10006". Both magic numbers are the canvas app's, named here so the intent survives.
 */
export const CAPEX_ROOT_NUMBER = "00001";
export const CAPEX_EXCLUDED_ROOT_NUMBER = "10006";

/**
 * Builds the three-level account tree.
 *
 * The canvas version is three nested `ForAll`s, each re-`Filter`ing the whole
 * `CAPEX Account Lists` collection to find children — O(n²) client-side work, repeated on
 * every screen visit and again on every command-bar click. This is one pass with an index.
 *
 * `totalCost` is only populated at level 3, matching the canvas: it sums `Total Cost` over
 * the project's DEVCO CAPEX Project Contracts filed under that account.
 */
export function buildAccountTree(
  accounts: readonly AccountRow[],
  devCoContracts: readonly CapexProjectContract[],
): AccountNode[] {
  const byParent = new Map<string, AccountRow[]>();
  for (const a of accounts) {
    const key = a.parentId ?? "";
    const bucket = byParent.get(key);
    if (bucket) bucket.push(a);
    else byParent.set(key, [a]);
  }

  const costByAccount = new Map<string, number>();
  for (const c of devCoContracts) {
    if (!c.accountId) continue;
    costByAccount.set(c.accountId, orZero(costByAccount.get(c.accountId)) + orZero(c.totalCost));
  }

  const rootAccount = accounts.find((a) => a.number === CAPEX_ROOT_NUMBER);
  const level1 = (rootAccount ? byParent.get(rootAccount.id) ?? [] : []).filter(
    (a) => a.number !== CAPEX_EXCLUDED_ROOT_NUMBER,
  );

  const out: AccountNode[] = [];
  for (const l1 of level1) {
    const l2s = byParent.get(l1.id) ?? [];
    out.push(node(l1, 1, l2s.length, 0, { parentId: undefined, level1Id: l1.id }));
    for (const l2 of l2s) {
      const l3s = byParent.get(l2.id) ?? [];
      out.push(node(l2, 2, l3s.length, 0, { parentId: l1.id, level1Id: l2.id }));
      for (const l3 of l3s) {
        const l4s = byParent.get(l3.id) ?? [];
        out.push(
          node(l3, 3, l4s.length, orZero(costByAccount.get(l3.id)), {
            parentId: l1.id,
            level1Id: l2.id,
            level2Id: l3.id,
          }),
        );
      }
    }
  }
  // `colSelectedConratctWithDevCoCosts` is sorted by Nummer ascending before rendering
  // (`cmd_Contracts_CommandBar.OnSelect`).
  return out.sort((a, b) => a.number.localeCompare(b.number));
}

function node(
  row: AccountRow,
  level: 1 | 2 | 3,
  childCount: number,
  totalCost: number,
  ids: { parentId?: string; level1Id?: string; level2Id?: string },
): AccountNode {
  return {
    id: row.id,
    parentId: ids.parentId,
    level1Id: ids.level1Id,
    level2Id: ids.level2Id,
    number: row.number,
    name: row.name,
    order: orZero(row.order),
    level,
    childCount,
    totalCost,
    selected: false,
    used: false,
  };
}

/**
 * Marks which level-3 accounts are already claimed by another contract.
 *
 * `cmd_Contracts_CommandBar.OnSelect` does this: for every DevCo-cost row across ALL the
 * project's contracts, set `UsedInContractDevCo` and set `Used` to false when the row belongs
 * to the contract being edited (you may keep your own) and true otherwise.
 */
export function applyUsage(
  tree: readonly AccountNode[],
  devCoLinks: readonly { accountId: string; contractId: string }[],
  editingContractId: string | undefined,
): AccountNode[] {
  const claim = new Map<string, string>();
  for (const l of devCoLinks) claim.set(l.accountId, l.contractId);
  return tree.map((n) => {
    const owner = claim.get(n.id);
    if (!owner) return n;
    return { ...n, usedByContractId: owner, used: owner !== editingContractId };
  });
}

/**
 * Ticks the accounts that belong to the contract being edited.
 * `cmd_Contracts_CommandBar.OnSelect`, the `"editContarct"` branch.
 */
export function applySelection(
  tree: readonly AccountNode[],
  selectedAccountIds: readonly string[],
): AccountNode[] {
  const wanted = new Set(selectedAccountIds);
  return tree.map((n) => (wanted.has(n.id) ? { ...n, selected: true } : n));
}

/** The level-3 accounts currently ticked — what a save writes DevCo-cost rows for. */
export function selectedLeafAccounts(tree: readonly AccountNode[]): AccountNode[] {
  return tree.filter((n) => n.level === 3 && n.selected);
}

/* ══════════════════════════════════════════ the closing-date cost split */

export interface ClosingSplitArgs {
  closingDate: Date;
  /** CAPEX cost rows for the DevCo contracts under the ticked level-3 accounts. */
  costs: readonly CapexCostRow[];
}

/**
 * `but_..._Buttons_Recalculate.OnSelect` — costs up to and including the closing month.
 *
 * The canvas expression is
 *   `Sum(year <= closingYear) - Sum(month > closingMonth AND year = closingYear)`
 * which is an inclusion-exclusion way of writing "everything before the closing year, plus
 * the closing year's months up to and including the closing month". It is reproduced in that
 * shape rather than simplified, so a reviewer can match it line for line — and because the
 * two forms differ if a cost row ever carried a month outside 1-12.
 */
export function costsUntilClosing({ closingDate, costs }: ClosingSplitArgs): number {
  const y = closingDate.getFullYear();
  const m = closingDate.getMonth() + 1;
  const upToYear = sum(...costs.filter((c) => c.year <= y).map((c) => c.cost));
  const laterInYear = sum(
    ...costs.filter((c) => c.month > m && c.year === y).map((c) => c.cost),
  );
  return upToYear - laterInYear;
}

/**
 * `but_..._Buttons_Recalculate.OnSelect` — costs after the closing month.
 *   `Sum(year > closingYear) + Sum(month > closingMonth AND year = closingYear)`
 */
export function costsAfterClosing({ closingDate, costs }: ClosingSplitArgs): number {
  const y = closingDate.getFullYear();
  const m = closingDate.getMonth() + 1;
  const laterYears = sum(...costs.filter((c) => c.year > y).map((c) => c.cost));
  const laterInYear = sum(
    ...costs.filter((c) => c.month > m && c.year === y).map((c) => c.cost),
  );
  return laterYears + laterInYear;
}

/* ═══════════════════════════════════════════════ the contract total chain */

export interface ContractForm {
  description: string;
  contractType: ContractType;
  closingDate?: Date;
  costsUntilClosingType: ClosingDateType;
  costsUntilClosingPlan: string;
  costsUntilClosingActual: string;
  costsAfterClosingType: ClosingDateType;
  costsAfterClosingPlan: string;
  costsAfterClosingActual: string;
  totalCostsType: TotalCostsType;
  totalCostsCalculated: string;
  totalCostsOverwrite: string;
  margin: boolean;
  marginType: MarginType;
  marginPercentage: string;
  marginFixedValue: string;
  comment: string;
  /** True while the margin still came from a standard assumption, untouched by the user. */
  isMarginStandardAssumption: boolean;
}

/**
 * `but_..._Buttons_Recalculate.OnSelect` — Total Costs Calculated.
 *
 * When the type is Calculated it is the sum of the two closing-date halves, each taken from
 * the recalculated Plan figure or the typed Actual figure depending on that half's radio.
 * When the type is Overwrite it is simply the typed Overwrite value.
 *
 * `vsb_totalcostscalculated` is a Dataverse **integer** column (so is `..._overwrite`, and so
 * are both `...plan` / `...actual` columns), while `vsb_cost` on CAPEX Cost is a decimal. The
 * canvas app wrote the unrounded sum and let Dataverse round it; rounding here makes what the
 * user sees and what is stored the same number.
 */
export function totalCostsCalculated(
  form: Pick<
    ContractForm,
    | "totalCostsType" | "totalCostsOverwrite"
    | "costsUntilClosingType" | "costsUntilClosingActual"
    | "costsAfterClosingType" | "costsAfterClosingActual"
  >,
  recalculated: { untilClosingPlan: number; afterClosingPlan: number },
  locale?: string,
): number {
  if (form.totalCostsType !== TOTAL_COSTS_TYPE.Calculated) {
    return round(orZero(parseNumber(form.totalCostsOverwrite, locale)));
  }
  const until =
    form.costsUntilClosingType === CLOSING_DATE_TYPE.Plan
      ? recalculated.untilClosingPlan
      : orZero(parseNumber(form.costsUntilClosingActual, locale));
  const after =
    form.costsAfterClosingType === CLOSING_DATE_TYPE.Plan
      ? recalculated.afterClosingPlan
      : orZero(parseNumber(form.costsAfterClosingActual, locale));
  return round(until + after);
}

/**
 * `but_..._Buttons_Recalculate.OnSelect` — Total cost of contract.
 *
 * SOURCE DEFECT (C-6). The canvas expression is:
 *
 *   If(Margin = Yes,
 *      If(MarginType = Percentage,
 *         If(<numeric checks>, calculated * (1 + pct/100)),   ← no else branch
 *         Sum(calculated, fixedValue)),
 *      Sum(calculated, fixedValue))                            ← Margin = No
 *
 * Two problems:
 *
 *  1. The `Margin = No` branch is IDENTICAL to the fixed-value branch, so a contract with no
 *     margin still gets `marginFixedValue` added. It is masked while the user toggles the
 *     radio, because `rad_..._Margin.OnChange` zeroes the field — but it is reachable on Edit
 *     of a stored row, and on a NEW Development/Construction contract, where
 *     `cmd_Contracts_CommandBar.OnSelect` seeds `locSelectedContractMarginFixedValues` from
 *     the standard assumption's `marginvalue` and then immediately fires Recalculate, whether
 *     or not that assumption's `margin` flag is set.
 *  2. The percentage branch has NO else, so a non-numeric percentage silently yields
 *     `Blank()` — the total is wiped rather than left alone.
 *
 * `totalCostOfContract` fixes both: no margin means no margin, and a non-numeric percentage
 * leaves the calculated total unchanged. `totalCostOfContractCanvasParity` reproduces the
 * original so the difference is testable and reviewable. THIS CHANGES STORED NUMBERS —
 * it is on the open-decision list.
 */
export function totalCostOfContract(
  form: Pick<ContractForm, "margin" | "marginType" | "marginPercentage" | "marginFixedValue">,
  calculated: number,
  locale?: string,
): number {
  if (!form.margin) return calculated;
  if (form.marginType === MARGIN_TYPE.Percentage) {
    const pct = parseNumber(form.marginPercentage, locale);
    if (pct === undefined) return calculated;
    return calculated * (1 + pct / 100);
  }
  return calculated + orZero(parseNumber(form.marginFixedValue, locale));
}

/** Bug-for-bug twin of the canvas calculation. `undefined` is the canvas `Blank()`. */
export function totalCostOfContractCanvasParity(
  form: Pick<ContractForm, "margin" | "marginType" | "marginPercentage" | "marginFixedValue">,
  calculated: number,
  locale?: string,
): number | undefined {
  const fixed = orZero(parseNumber(form.marginFixedValue, locale));
  if (!form.margin) return calculated + fixed;
  if (form.marginType === MARGIN_TYPE.Percentage) {
    const pct = parseNumber(form.marginPercentage, locale);
    if (pct === undefined) return undefined; // the missing else branch
    return calculated * (1 + pct / 100);
  }
  return calculated + fixed;
}

/* ══════════════════════════════════════════════════════════════ validation */

export interface FieldError {
  field: string;
  message: string;
}

/**
 * The cost fields. Each canvas `*_ErrorMessage.Text` is
 * `If(IsBlank, InputBlank, Not(IsInteger), Numeric, Not(InRange(0, max)), "between …")`.
 *
 * SOURCE DEFECT (D-3) — `lbl_..._CostsUntilClosingDate_Plan_ErrorMessage.Text` breaks that
 * pattern twice: it tests `Not(IsBlank(<the ACTUAL field>))` where every sibling tests
 * `IsBlank(Trim(<its own field>))`. Wrong field, inverted predicate. It is not a save
 * blocker, because the matching `.Visible` property has its own correct logic and the Save
 * gate reads `.Visible` — so the only symptom is the wrong message in one state. The rule
 * below uses the sibling's correct shape for both fields.
 */
export function validateCostField(
  field: string,
  raw: string,
  locale?: string,
): FieldError | undefined {
  if (raw.trim() === "") return { field, message: RESX.inputBlank };
  if (!isInteger(raw, locale)) return { field, message: RESX.numeric };
  if (!inRange(raw, 0, CONTRACT_COSTS_MAX, locale)) {
    return { field, message: betweenMessage(0, CONTRACT_COSTS_MAX) };
  }
  return undefined;
}

/** `$"Please select a value between 0 and {Text(max, "#,##0")}"`. */
export function betweenMessage(min: number, max: number): string {
  return `Please select a value between ${formatThousands(min)} and ${formatThousands(max)}`;
}

/** Power Fx `Text(n, "#,##0")` with the app's grouping. */
export function formatThousands(value: number, locale = "de-DE"): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value);
}

/** `lbl_..._Description_ErrorMessage.Text` — `IsBlank(Trim(value))`. */
export function validateDescription(raw: string): FieldError | undefined {
  return raw.trim() === ""
    ? { field: "description", message: RESX.inputBlank }
    : undefined;
}

/** `lbl_..._MarginPercentage_ErrorMessage` — one decimal, 0..100. */
export function validateMarginPercentage(raw: string, locale?: string): FieldError | undefined {
  if (raw.trim() === "") return { field: "marginPercentage", message: RESX.inputBlank };
  if (!isDecimal(raw, { places: 1, locale })) {
    return { field: "marginPercentage", message: RESX.numericOneDecimals };
  }
  if (!inRange(raw, 0, 100, locale)) {
    return { field: "marginPercentage", message: betweenMessage(0, 100) };
  }
  return undefined;
}

/** `lbl_..._MarginFixedValues_ErrorMessage` — whole currency, 0..max. */
export function validateMarginFixedValue(raw: string, locale?: string): FieldError | undefined {
  return validateCostField("marginFixedValue", raw, locale);
}

/**
 * `pcf_Contracts_RightPanel_NewEdit_Buttons_Save.DisplayMode`, as one predicate.
 *
 * The canvas gate is a nine-way `And`, and the FIRST term is `locContractDevCoCostsDirty` —
 * so Save stays disabled until Recalculate has run at least once, even on an unchanged
 * record. That is why every radio's `OnChange` ends in
 * `Select(but_..._Buttons_Recalculate)`. Preserved deliberately: it is what guarantees the
 * stored totals match the stored inputs.
 */
export function canSaveContract(args: {
  form: ContractForm;
  tree: readonly AccountNode[];
  recalculated: boolean;
  locale?: string;
}): boolean {
  const { form, tree, recalculated, locale } = args;
  if (!recalculated) return false;
  if (selectedLeafAccounts(tree).length === 0) return false;
  if (form.description.trim() === "") return false;
  if (!form.closingDate) return false;

  const until =
    form.costsUntilClosingType === CLOSING_DATE_TYPE.Plan
      ? form.costsUntilClosingPlan
      : form.costsUntilClosingActual;
  if (validateCostField("until", until, locale)) return false;

  const after =
    form.costsAfterClosingType === CLOSING_DATE_TYPE.Plan
      ? form.costsAfterClosingPlan
      : form.costsAfterClosingActual;
  if (validateCostField("after", after, locale)) return false;

  const total =
    form.totalCostsType === TOTAL_COSTS_TYPE.Calculated
      ? form.totalCostsCalculated
      : form.totalCostsOverwrite;
  if (validateCostField("total", total, locale)) return false;

  if (form.margin) {
    const marginError =
      form.marginType === MARGIN_TYPE.Percentage
        ? validateMarginPercentage(form.marginPercentage, locale)
        : validateMarginFixedValue(form.marginFixedValue, locale);
    if (marginError) return false;
  }
  return true;
}

/**
 * Every error the contract panel should be showing, in field order.
 *
 * The canvas app had no such list: each `*_ErrorMessage` label computed itself, and a field
 * left blank showed NOTHING while still disabling Save — because `*_ErrorMessage.Visible`
 * requires `Not(IsBlank(field))`. So a user faced a greyed-out Save with no explanation.
 * DIVERGENCE (D-4): blank required fields now report `RESX.inputBlank`.
 */
export function contractErrors(
  form: ContractForm,
  tree: readonly AccountNode[],
  locale?: string,
): FieldError[] {
  const errors: FieldError[] = [];
  const push = (e: FieldError | undefined) => { if (e) errors.push(e); };

  push(validateDescription(form.description));
  if (!form.closingDate) errors.push({ field: "closingDate", message: RESX.inputBlank });

  push(validateCostField(
    form.costsUntilClosingType === CLOSING_DATE_TYPE.Plan
      ? "costsUntilClosingPlan" : "costsUntilClosingActual",
    form.costsUntilClosingType === CLOSING_DATE_TYPE.Plan
      ? form.costsUntilClosingPlan : form.costsUntilClosingActual,
    locale,
  ));
  push(validateCostField(
    form.costsAfterClosingType === CLOSING_DATE_TYPE.Plan
      ? "costsAfterClosingPlan" : "costsAfterClosingActual",
    form.costsAfterClosingType === CLOSING_DATE_TYPE.Plan
      ? form.costsAfterClosingPlan : form.costsAfterClosingActual,
    locale,
  ));
  push(validateCostField(
    form.totalCostsType === TOTAL_COSTS_TYPE.Calculated
      ? "totalCostsCalculated" : "totalCostsOverwrite",
    form.totalCostsType === TOTAL_COSTS_TYPE.Calculated
      ? form.totalCostsCalculated : form.totalCostsOverwrite,
    locale,
  ));
  if (form.margin) {
    push(form.marginType === MARGIN_TYPE.Percentage
      ? validateMarginPercentage(form.marginPercentage, locale)
      : validateMarginFixedValue(form.marginFixedValue, locale));
  }
  if (selectedLeafAccounts(tree).length === 0) {
    errors.push({ field: "devCoCosts", message: RESX.inputBlank });
  }
  return errors;
}

/* ═══════════════════════════════════════════════ payment-target validation */

/** `^(0[1-9]|1[0-2])\/\d{4}$` — the canvas format check, anchored as `IsMatch` anchors it. */
const MM_YYYY = /^(0[1-9]|1[0-2])\/\d{4}$/;

export interface PaymentTargetForm {
  description: string;
  /** Free text. `vsb_paymentdate` is an `nvarchar` column, not a date. */
  paymentDate: string;
  /** A PERCENTAGE, 0..100, despite `vsb_totalcostscontract`'s name. */
  totalCostsContract: string;
  note: string;
}

/**
 * `lbl_..._PaymentTarget_PaymentDate_ErrorMessage.Text`.
 *
 * Blank → InputBlank; not `MM/YYYY` → the format message; earlier than the project start →
 * a message naming the project start as `MM/YYYY`.
 *
 * The canvas comparison builds `DateValue($"{yyyy}-{mm}-{Day(projectStart)}")` — it borrows
 * the DAY from the project start date, so a target in the project's own start month is
 * accepted. That subtlety is preserved.
 *
 * Note the canvas version binds `varCompareDate` in a `With` BEFORE the format check runs,
 * and `With` is eager: for input that does not match, it evaluates `DateValue("--15")` and
 * raises an error that `App.OnError` then swallows. Ordering the checks first avoids that.
 */
export function validatePaymentDate(
  raw: string,
  projectStart: Date | undefined,
): FieldError | undefined {
  const value = raw.trim();
  if (value === "") return { field: "paymentDate", message: RESX.inputBlank };
  if (!MM_YYYY.test(value)) return { field: "paymentDate", message: MSG.paymentDateFormat };
  if (!projectStart) return undefined;

  const [mm, yyyy] = value.split("/");
  const compare = new Date(Number(yyyy), Number(mm) - 1, projectStart.getDate());
  if (compare.getTime() < startOfDay(projectStart).getTime()) {
    return {
      field: "paymentDate",
      message:
        `Payment date must be greater project start date ` +
        `${pad2(projectStart.getMonth() + 1)}/${projectStart.getFullYear()}`,
    };
  }
  return undefined;
}

/**
 * `lbl_Contracts_Payment_Targets_RightPanel_TotalCosts_ErrorMessage.Text`.
 *
 * The bound is `100 - (sumOfAllTargetsOnThisContract - thisTarget)`, i.e. the percentage left
 * over once the other targets have taken their share. `Round(..., 1)` is the canvas app's.
 * The canvas version skips both checks entirely when the field is blank, so blank passes and
 * Save is disabled with no message — the same D-4 gap as the contract panel.
 */
export function remainingPercent(
  targets: readonly PaymentTarget[],
  editingTargetId: string | undefined,
): number {
  const others = targets.filter((t) => t.id !== editingTargetId);
  return round(100 - sum(...others.map((t) => t.totalCostsContract)), 1);
}

export function validateTargetPercent(
  raw: string,
  remaining: number,
  locale?: string,
): FieldError | undefined {
  if (raw.trim() === "") return { field: "totalCostsContract", message: RESX.inputBlank };
  if (!isDecimal(raw, { places: 1, locale })) {
    return { field: "totalCostsContract", message: RESX.numericOneDecimals };
  }
  if (!inRange(raw, 0, remaining, locale)) {
    return {
      field: "totalCostsContract",
      message: `Please select a value between 0 and ${formatOneDecimal(remaining)}`,
    };
  }
  return undefined;
}

/** Power Fx `Text(n, "###,###0.0")`. */
export function formatOneDecimal(value: number, locale = "de-DE"): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value);
}

export function paymentTargetErrors(args: {
  form: PaymentTargetForm;
  projectStart?: Date;
  targets: readonly PaymentTarget[];
  editingTargetId?: string;
  locale?: string;
}): FieldError[] {
  const errors: FieldError[] = [];
  const push = (e: FieldError | undefined) => { if (e) errors.push(e); };
  push(validateDescription(args.form.description));
  push(validatePaymentDate(args.form.paymentDate, args.projectStart));
  push(validateTargetPercent(
    args.form.totalCostsContract,
    remainingPercent(args.targets, args.editingTargetId),
    args.locale,
  ));
  if (args.form.note.length > NOTE_MAX_LENGTH) {
    errors.push({ field: "note", message: `Maximum ${NOTE_MAX_LENGTH} characters` });
  }
  return errors;
}

export function canSavePaymentTarget(args: Parameters<typeof paymentTargetErrors>[0]): boolean {
  return paymentTargetErrors(args).length === 0;
}

/* ══════════════════════════════════════════════════════════════ derived text */

/**
 * `Name: $"BoP-{gblSelectedProject.'Project ID'}-{txt_..._Description.Value}"`.
 *
 * Note the canvas app interpolates the UNTRIMMED description into the name while writing the
 * TRIMMED one into `Description`, so a trailing space ends up in `Name` only. Trimming both
 * is a deliberate, harmless divergence.
 */
export function contractName(projectIdCode: string, description: string): string {
  return `BoP-${projectIdCode}-${description.trim()}`;
}

/** `Name: $"BoP-PT-{locSelectedContract.Description}-{txt_..._Description.Value}"`. */
export function paymentTargetName(
  contractDescription: string | undefined,
  description: string,
): string {
  return `BoP-PT-${contractDescription ?? ""}-${description.trim()}`;
}

/** `Name: $"{ThisRecord.Nummer}-{ThisRecord.Name}"` on a DevCo-cost row. */
export function devCoCostName(node: Pick<AccountNode, "number" | "name">): string {
  return `${node.number}-${node.name}`;
}

/** `lbl_Contracts_List_CardHeader_Description.Text`. */
export function contractCardTitle(contract: Pick<BopContract, "contractType" | "description">) {
  return `${CONTRACT_TYPE_LABELS[contract.contractType] ?? ""} - ${contract.description ?? ""}`;
}

/** `lbl_Contracts_RightPanel_NewEdit_Header.Text` — "Add …" / "Edit …". */
export function panelTitle(editing: boolean, contractType: ContractType): string {
  return `${editing ? "Edit" : "Add"} ${CONTRACT_TYPE_LABELS[contractType] ?? ""}`.trim();
}

/**
 * The currency suffix every cost label carries:
 * `If(Not(IsBlank(country.'ISO Currency Code')), country.'ISO Currency Code', "EUR")`.
 */
export function currencyCode(project: Pick<ProjectContext, "isoCurrencyCode">): string {
  const code = project.isoCurrencyCode?.trim();
  return code ? code : "EUR";
}

export function costLabel(base: string, project: Pick<ProjectContext, "isoCurrencyCode">) {
  return `${base} [${currencyCode(project)}]`;
}

/* ═════════════════════════════════════════════════════════ command bar */

export interface CommandState {
  key: string;
  label: string;
  enabled: boolean;
}

/**
 * `cmd_Contracts_CommandBar.Items`.
 *
 * Add is gated on `DataSourceInfo('BoP Projects Contracts', CreatePermission)`; Edit and
 * Delete on a selection plus `RecordInfo(record, EditPermission)`.
 *
 * SOURCE DEFECT (D-5) — Delete is gated on **Edit** permission, not Delete permission. A
 * user who may edit but not delete sees Delete enabled and gets a 403 from the server.
 * `canDelete` is a separate argument here so the caller can pass the real answer; passing
 * `canWrite` for it reproduces the canvas behaviour exactly.
 */
export function contractCommands(args: {
  canCreate: boolean;
  canWrite: boolean;
  canDelete: boolean;
  hasSelection: boolean;
}): CommandState[] {
  const { canCreate, canWrite, canDelete, hasSelection } = args;
  return [
    { key: "newDevContarct", label: MSG.addDevelopmentContract, enabled: canCreate },
    { key: "newConstructionContarct", label: MSG.addConstructionContract, enabled: canCreate },
    { key: "newProjecRightsContarct", label: MSG.addProjectRightsContract, enabled: canCreate },
    { key: "editContarct", label: MSG.edit, enabled: hasSelection && canWrite },
    { key: "deleteContarct", label: MSG.delete, enabled: hasSelection && canDelete },
  ];
}

/* ══════════════════════════════════════════════════════════════════ helpers */

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Sorts the contract list the way `Sort(..., 'Contract Types', Ascending)` did. */
export function sortContracts(contracts: readonly BopContract[]): BopContract[] {
  return [...contracts].sort((a, b) => {
    if (a.contractType !== b.contractType) return a.contractType - b.contractType;
    return (a.description ?? "").localeCompare(b.description ?? "");
  });
}

/* ═════════════════════════════════════════════════════════ recalculation */

/**
 * `Select(but_Contracts_RightPanel_NewEdit_Buttons_Recalculate)`, as a pure form transform.
 *
 * Every radio `OnChange` on the canvas panel ended with that `Select(...)`, so a change and
 * its recalculation were one user action. Expressing it as `form → form` keeps it that way:
 * the screen applies a patch and its recalculation in a single state update, instead of
 * setting a "needs recalculating" flag and reacting to it in an effect — which would render
 * twice for every keystroke on a radio.
 *
 * Returns the form unchanged when there is no closing date, because both halves of the split
 * are `If(Not(IsBlank(closingDate)), …)` in the canvas source and therefore `Blank()` without
 * one.
 */
export function recalculateForm(
  form: ContractForm,
  costs: readonly CapexCostRow[],
  locale?: string,
): ContractForm {
  if (!form.closingDate) return form;
  const untilClosingPlan = round(costsUntilClosing({ closingDate: form.closingDate, costs }));
  const afterClosingPlan = round(costsAfterClosing({ closingDate: form.closingDate, costs }));
  const calculated = totalCostsCalculated(form, { untilClosingPlan, afterClosingPlan }, locale);
  return {
    ...form,
    costsUntilClosingPlan:
      form.costsUntilClosingType === CLOSING_DATE_TYPE.Plan
        ? String(untilClosingPlan) : form.costsUntilClosingPlan,
    costsAfterClosingPlan:
      form.costsAfterClosingType === CLOSING_DATE_TYPE.Plan
        ? String(afterClosingPlan) : form.costsAfterClosingPlan,
    totalCostsCalculated:
      form.totalCostsType === TOTAL_COSTS_TYPE.Calculated
        ? String(calculated) : form.totalCostsCalculated,
  };
}

/**
 * The contract total as rendered, derived from whatever is currently in the form.
 * `txt_Contracts_RightPanel_NewEdit_TotalCosts_Contract.Default`.
 */
export function contractTotalFromForm(form: ContractForm, locale?: string): number {
  const calculated =
    form.totalCostsType === TOTAL_COSTS_TYPE.Calculated
      ? orZero(parseNumber(form.totalCostsCalculated, locale))
      : orZero(parseNumber(form.totalCostsOverwrite, locale));
  return totalCostOfContract(form, calculated, locale);
}
