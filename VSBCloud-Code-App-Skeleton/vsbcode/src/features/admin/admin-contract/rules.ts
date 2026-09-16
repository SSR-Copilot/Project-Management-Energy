/**
 * Admin Contract Screen — every business rule as a pure function.
 *
 * Canvas screen: `Admin Contract Screen` (PM app)
 *   145 controls · 3 985 lines of Power Fx · 43 substantive blocks · band M
 *
 * Maintains the BoP standard contracts for one country × technology: up to ten Development
 * Contracts and ten Construction Contracts, each with a description, a closing-date
 * reference and month offset, an optional margin, a comment, and a set of CAPEX
 * subaccounts the contract "owns" as DevCo costs. Each subaccount belongs to AT MOST ONE
 * contract in the scope; accounts owned by another contract render locked.
 *
 * ┌────────────────────────────────────────────────────────────────────────────────┐
 * │ SOURCE DEFECT — NO SCREEN-LEVEL OR SERVER-SIDE PERMISSION CHECK.               │
 * │                                                                                │
 * │ `brief.py` reports `PERMISSION SIGNALS: none`: no `DataSourceInfo`, no          │
 * │ `RecordInfo`, no `gblCurrentUser` test anywhere in 3 985 lines. Entry is gated  │
 * │ only by `Or(gblCurrentUser.IsApplicationAdministrator,                          │
 * │ gblCurrentUser.IsControllerOwnData)` on the nav items — CLIENT-SIDE HIDING.     │
 * │                                                                                │
 * │ WHAT WE DID: `RequireAdmin` guards the route and `canEditScope` gates every     │
 * │ write plan on `canEditCountry`. THE ROUTE GUARD IS NOT SECURITY — the server    │
 * │ must reject writes to `vsb_bopcontractsstandardassumptionses` and its child     │
 * │ table, and today it does not. These contracts decide which CAPEX subaccounts a  │
 * │ DevCo owns for a whole country; an unauthorised edit silently moves cost        │
 * │ ownership across legal entities.                                                │
 * └────────────────────────────────────────────────────────────────────────────────┘
 *
 * COUNTRY SCOPING IS HARD-CODED PICKER LITERALS. `gblCurrentUser.EditableCounties` is
 * never read. The picker excludes Spain, Greece and Romania and nests Wind and PV only —
 * see `buildCountryPicker`, shared with Gates and Cost. Row security is anchored by
 * `'Owning Business Unit'` written on save.
 *
 * DEAD CODE, REPRODUCED AS DEAD:
 *  - the `Fabric Sync Jobs` patch at line 4163, the
 *    `SynchronizeStandardAssumptionCosts.Run("BoP", …)` after it and its `Notify` are all
 *    inside a `/* … *\/` comment. (`sol/Controls/3898.json` carries a STALE
 *    `AutoRuleBindingString` copy in which the block is NOT commented; the `.pa.yaml` is
 *    the authoritative unpacked form, so the Fabric path is disabled.)
 *  - the per-contract Apply and the Apply-to-All button both ship
 *    `DisplayMode: =DisplayMode.Disabled`.
 *  - `SynchronizeStandardAssumptionCosts` IS NOT IN THE SOLUTION EXPORT. The typed wrapper
 *    in `@/flows/flowClient` throws; `applyCommandState` points the disabled commands at
 *    it so the intent is in the code and the internals are never invented.
 *  - `Apply and Apply All Trackings` rows ARE still written by the shipped app for work
 *    that never runs; `planApplyTracking` (Admin Cost's, shared) does not write one by
 *    default and says why.
 *
 * WHAT WAS DELETED AS A WORKAROUND
 *  - the nested `ForAll` + `Collect` tree walk (rule 2) — `buildAccountTree`, shared with
 *    Admin CAPEX Accounts, builds it in TypeScript from the flat list.
 *  - `col_Costs_Flat_Cache`, `col_Global_DevCoCosts`, `colAdminContracts` and
 *    `colApplyAndApplyAllTracking` — four UNFILTERED full-table pulls in `OnVisible`
 *    (rule 1). Three scoped queries plus one server-filtered tracking query.
 *  - the `HtmlViewer` card (rule 18): `Concat(...)` into inline-styled `div`s and `span`
 *    "tags", with the five root-account names and five style strings as literals. Real
 *    components, one `ROOT_ACCOUNT_RANK` constant.
 *  - the hidden `CheckBox` (rule 10) — `Visible: false` but with LIVE `OnCheck`/`OnUncheck`
 *    handlers duplicating `toggleParent`. Dead UI with live logic; not ported.
 *  - `varTargetTechnology`'s "Delegation Fix" comment (rule 6) — a canvas workaround, not
 *    a business rule.
 *  - `locKeepExpandedID` and the `IsFolded` column — one `expandedId` value.
 */
import { isBlank, isOneDecimal, isTwoDecimal, inRange } from "@/domain/numeric";
import { ES_ADMIN, CHOICE_ADMIN, CAPEX_CONTRACT_TREE_EXCLUDED_NUMBER } from "@/data/entities";
import { canEditCountry, type CurrentUser } from "@/domain/session";
import {
  buildAccountTree, flattenTree, type CapexAccount, type AccountNode,
} from "@/features/admin/admin-capex-accounts/rules";
import {
  buildCountryPicker, COST_CONTRACT_EXCLUDED_COUNTRIES, PICKER_TECHNOLOGIES,
  technologyValue, technologyLabel,
} from "@/features/admin/admin-gates-approvals/rules";

export {
  buildAccountTree, flattenTree, buildCountryPicker, COST_CONTRACT_EXCLUDED_COUNTRIES,
  PICKER_TECHNOLOGIES, technologyValue, technologyLabel,
};
export type { CapexAccount, AccountNode };

/* ═══════════════════════════════════════════════════════════════════ columns ════ */

export const BOP_CONTRACT_COL = {
  id: "vsb_bopcontractsstandardassumptionid",
  name: "vsb_name",
  description: "vsb_description",
  country: "_vsb_country_value",
  technology: "vsb_technology",
  contractTypes: "vsb_contracttypes",
  closingDateReference: "vsb_closingdatereference",
  monthDifference: "vsb_monthdifference",
  margin: "vsb_margin",
  marginType: "vsb_margintype",
  marginPercentage: "vsb_marginpercentage",
  marginFixedValue: "vsb_marginfixedvalue",
  comment: "vsb_comment",
  owningBusinessUnit: "_owningbusinessunit_value",
} as const;

export const DEVCO_COST_COL = {
  id: "vsb_bopcontractsstandardassumptiondevcocostid",
  name: "vsb_name",
  contract: "_vsb_bopcontractstandardassumption_value",
  capexAccount: "_vsb_capexaccount_value",
  /** Rule 16 — the column the card reads and the canvas create payload OMITS. */
  rootCapexAccount: "_vsb_rootcapexaccount_value",
  country: "_vsb_country_value",
  technology: "vsb_technology",
  owningBusinessUnit: "_owningbusinessunit_value",
} as const;

export const BOP_LOOKUP = {
  country: "vsb_Country",
  contract: "vsb_BoPContractStandardAssumption",
  capexAccount: "vsb_CAPEXAccount",
  rootCapexAccount: "vsb_RootCapexAccount",
  owningBusinessUnit: "owningbusinessunit",
} as const;

export const BOP_CONTRACT_ENTITY_SET = ES_ADMIN.bopContractsStandardAssumptions;
export const DEVCO_COST_ENTITY_SET = ES_ADMIN.bopDevCoCosts;

/** Rule 22 — `locContractsCostsMax: 1000000000`, the margin fixed-value ceiling. */
export const CONTRACT_COSTS_MAX = 1_000_000_000;

/** Rules 3/4 — ten Development and ten Construction contracts per scope. */
export const CONTRACT_CAP = 10;

/* ═════════════════════════════════════════════════════════════════════ types ════ */

export type BopContractType = "development" | "construction";

export const CONTRACT_TYPE_VALUE: Record<BopContractType, number> = {
  development: CHOICE_ADMIN.bopContractTypes.development,
  construction: CHOICE_ADMIN.bopContractTypes.construction,
};

export const CONTRACT_TYPE_LABEL: Record<BopContractType, string> = {
  /**
   * NEW — no canvas equivalent: a contract-TYPE label for the code app's grid and dropdown; the
   * canvas only had the command caption `btn_AdminContract_Add_Development_Contract.Text` ("Add
   * Development Contract")
   */
  development: "Development Contract",
  /**
   * NEW — no canvas equivalent: a contract-TYPE label for the code app's grid and dropdown; the
   * canvas only had `btn_AdminContract_Add_Construction_Contract.Text` ("Add Construction
   * Contract")
   */
  construction: "Construction Contract",
};

export interface BopContract {
  id: string;
  name: string | null;
  description: string | null;
  countryId: string | null;
  technology: number | null;
  contractType: number | null;
  closingDateReference: number | null;
  monthDifference: number | null;
  margin: boolean;
  marginType: number | null;
  marginPercentage: number | null;
  marginFixedValue: number | null;
  comment: string | null;
}

export interface DevCoCost {
  id: string;
  contractId: string | null;
  capexAccountId: string | null;
  rootAccountId: string | null;
  rootAccountName: string | null;
  categoryName: string | null;
}

export interface ContractScope {
  countryId: string | null;
  countryName: string | null;
  technology: string | null;
  technologyValue: number | null;
}

/** Rule 5's per-node classification: selected by THIS contract, or used by another. */
export interface AccountSelection {
  accountId: string;
  selected: boolean;
  used: boolean;
  usedByContractId: string | null;
  /** The existing child row's id, when this contract already owns the account. */
  devCoCostId: string | null;
}

export interface PlannedWrite {
  op: "create" | "update" | "delete";
  entitySet: string;
  id?: string;
  data?: Record<string, unknown>;
  reason: string;
}

export interface WritePlan {
  writes: PlannedWrite[];
  log: string[];
  refusedReason?: string;
}

export const emptyPlan = (): WritePlan => ({ writes: [], log: [] });
const refuse = (reason: string): WritePlan => ({ writes: [], log: [], refusedReason: reason });

/* ═════════════════════════════════════════════════════════════════ messages ════ */

export const MSG = {
  /**
   * The closing-date message. In the canvas this text lives on a control called
   * `lbl_Add_Edit_AdminContracts_Description_ErrorMessage_1` — see `CLOSING_DATE_RULE_NOTE`.
   */
  /** `lbl_Add_Edit_AdminContracts_Description_ErrorMessage_1.Text` — verbatim. */
  closingDateEmpty: "The Contract Closing Date cannot be empty.",
  /** `lbl_Add_Edit_AdminContracts_MonthDifference_ErrorMessage.Text` — verbatim. */
  monthDifference: "Only whole numbers with up to two digits are allowed.",
  /**
   * `lbl_Add_Edit_AdminContracts_MarginPercentage_ErrorMessage.Text` — the canvas message for
   * this field.
   */
  marginPercentage: "Enter a percentage between 0 and 100 with one decimal.",
  /**
   * `lbl_Add_Edit_AdminContracts_MarginFixedValue_ErrorMessage.Text` — the canvas message for
   * this field.
   */
  marginFixedValue: "Enter a value between 0 and 1,000,000,000 with two decimals.",
  /**
   * `lbl_Admin_Checklist_Form_Fields_Name_ErrorMessage.Text` (`Admin Project Default Checklists
   * Screen`) — verbatim.
   */
  descriptionBlank: "Value cannot be blank.",
  /**
   * NEW — no canvas equivalent: the code app refuses a save with no CAPEX account selected; the
   * canvas allowed it
   */
  noAccountSelected: "Select at least one CAPEX account for this contract.",
  /**
   * NEW — no canvas equivalent: the code app says why Save is refused; the canvas only greyed
   * the button out
   */
  notDirty: "Nothing has been changed yet.",
  capReached: (type: BopContractType, country: string, technology: string) =>
    `Maximum 10 ${type} contracts allowed for ${country} - ${technology}`,
  /** NEW — no canvas equivalent: the country-scope gate is added by the code app */
  outOfScope: "This country is outside your editable country scope, so contracts are read-only.",
  applyDisabled:
    "Apply is disabled in the shipped app: both buttons carry DisplayMode.Disabled, the "
    + "Fabric Sync Job write is commented out, and SynchronizeStandardAssumptionCosts is "
    + "not present in the solution export.",
  /**
   * `cmp_PopUp_Confirmation_Delete_Contract_Or_Period_1.Title` — the canvas title for this
   * dialog.
   */
  deleteTitle: "Delete this BoP standard contract?",
  /** NEW — no canvas equivalent: empty state for the contract list */
  noContracts: "No BoP standard contracts for this scope yet.",
} as const;

/**
 * ┌──────────────────────────────────────────────────────────────────────────────┐
 * │ DOCUMENTED DEFECT — TWO SIMILARLY NAMED LABELS, NEITHER OF WHICH DOES WHAT   │
 * │ ITS NAME SAYS.                                                               │
 * │                                                                              │
 * │ `lbl_Add_Edit_AdminContracts_Description_ErrorMessage_1` — the one that IS   │
 * │ in the Save conjunction — is NOT a description validator. Despite its name    │
 * │ it is the CLOSING-DATE validator:                                            │
 * │   Text:    If(IsBlank(rad_…_CostsUntilClosingDate.Selected.Value),            │
 * │               $"The Contract Closing Date cannot be empty.", "Visible")       │
 * │   Visible: If(Not(IsBlank(locSelectedBoPStandardContract)),                   │
 * │               IsBlank(rad_…_CostsUntilClosingDate.Selected.Value), false)     │
 * │ — so it fires ONLY WHEN EDITING an existing contract.                         │
 * │                                                                              │
 * │ `lbl_Add_Edit_AdminContracts_Description_ErrorMessage` (no `_1`) is DEAD: its │
 * │ whole `Text` is commented out (a copy of an Opex "period with the same        │
 * │ description already exists" check) and its `Visible` is                       │
 * │ `Not(IsBlank(Trim(txt_….Value)))`, so it renders an EMPTY label whenever a    │
 * │ description is typed. Nothing references it.                                  │
 * │                                                                              │
 * │ CONSEQUENCES, both preserved and both named for what they check:              │
 * │  · THERE IS NO DUPLICATE-DESCRIPTION CHECK ON THIS SCREEN. We did not invent  │
 * │    one — see `duplicateDescriptionCheckExists`.                               │
 * │  · The closing-date requirement is enforced TWICE for edits (the label plus   │
 * │    the separate `Not(IsBlank(rad_….Selected.Value))` term of the conjunction) │
 * │    and ONCE for new contracts. `validateContract` keeps the single effective  │
 * │    rule — closing date required in both cases — and `closingDateLabelVisible` │
 * │    reproduces the edit-only label so UT-ADCONTR-039/040 can tell them apart.  │
 * └──────────────────────────────────────────────────────────────────────────────┘
 */
export const CLOSING_DATE_RULE_NOTE =
  "lbl_…_Description_ErrorMessage_1 is the closing-date validator, not a description one; "
  + "lbl_…_Description_ErrorMessage is dead. There is no duplicate-description check.";

/** Deliberately `false`: the canvas has no such check and we did not add one. */
export const duplicateDescriptionCheckExists = (): boolean => false;

/* ═══════════════════════════════════════════════════════════════════ the tree ════ */

/**
 * Rule 2 — the account tree, seeded from `"00001"` and EXCLUDING `"10006"`.
 * `Filter(colCapexAllAccountsTemporary, And('Parent Account'.Number = "00001",
 *                                           Not(ThisRecord.Number = "10006")))`
 * Only `Level = 3` nodes are selectable.
 */
export function buildContractAccountTree(accounts: CapexAccount[]): AccountNode[] {
  return buildAccountTree(accounts, {
    exclude: [CAPEX_CONTRACT_TREE_EXCLUDED_NUMBER],
  });
}

export const selectableNodes = (tree: AccountNode[]): AccountNode[] =>
  flattenTree(tree).filter((n) => n.level === 3);

/**
 * Rule 5 — opening the panel classifies EVERY account into Selected / Used / free.
 *
 * `Selected` = this row's DevCo cost belongs to the contract being edited.
 * `Used`     = it belongs to a DIFFERENT contract in the same scope.
 * For a NEW contract every found account is `{Selected: false, Used: true}` — a new
 * contract owns nothing yet, so everything already claimed is locked to it.
 */
export function classifyAccounts(
  tree: AccountNode[],
  devCoCosts: DevCoCost[],
  currentContractId: string | null,
): Map<string, AccountSelection> {
  const out = new Map<string, AccountSelection>();
  for (const node of selectableNodes(tree)) {
    out.set(node.id, {
      accountId: node.id, selected: false, used: false,
      usedByContractId: null, devCoCostId: null,
    });
  }
  for (const cost of devCoCosts) {
    if (!cost.capexAccountId) continue;
    const entry = out.get(cost.capexAccountId);
    if (!entry) continue;
    const mine = currentContractId !== null && cost.contractId === currentContractId;
    out.set(cost.capexAccountId, {
      accountId: cost.capexAccountId,
      selected: mine,
      used: !mine,
      usedByContractId: mine ? null : cost.contractId,
      devCoCostId: mine ? cost.id : null,
    });
  }
  return out;
}

/* ═══════════════════════════════════════════════════════════ the tri-state box ════ */

export type TriState = "LOCKED" | "UNCHECKED" | "PARTIAL" | "CHECKED";

/**
 * Rule 7 — the parent checkbox computes over three pools:
 *   `_ChildPool`     = level-3 children
 *   `_AvailablePool` = children with `!Used`
 *   `_SelectedPool`  = children `Selected && !Used`
 * and renders LOCKED when `_AvailableCount = 0`, UNCHECKED when `_SelectedCount = 0`,
 * CHECKED when `_SelectedCount = _TotalCount`, PARTIAL otherwise.
 *
 * ┌──────────────────────────────────────────────────────────────────────────────┐
 * │ DECISION, per implementation step 5 — WE KEEP THE SOURCE SEMANTICS.           │
 * │                                                                              │
 * │ `CHECKED` compares the selected count to the TOTAL child count, not to the    │
 * │ AVAILABLE count, so a parent with any used child can never read fully         │
 * │ checked. The source comment acknowledges it. We keep it because the box then  │
 * │ answers a useful question — "does this contract own the whole group?" — and   │
 * │ changing it would make a parent look complete while another contract still    │
 * │ owns part of the group. `parentTriStateAvailableSemantics` implements the     │
 * │ alternative and is unit-tested alongside, so the decision is reversible in    │
 * │ one place.                                                                    │
 * └──────────────────────────────────────────────────────────────────────────────┘
 */
export function parentTriState(children: AccountSelection[]): TriState {
  const total = children.length;
  const available = children.filter((c) => !c.used);
  const selected = children.filter((c) => c.selected && !c.used);
  if (available.length === 0) return "LOCKED";
  if (selected.length === 0) return "UNCHECKED";
  if (selected.length === total) return "CHECKED";
  return "PARTIAL";
}

/** The alternative semantics: CHECKED once every AVAILABLE child is selected. */
export function parentTriStateAvailableSemantics(children: AccountSelection[]): TriState {
  const available = children.filter((c) => !c.used);
  const selected = available.filter((c) => c.selected);
  if (available.length === 0) return "LOCKED";
  if (selected.length === 0) return "UNCHECKED";
  if (selected.length === available.length) return "CHECKED";
  return "PARTIAL";
}

/**
 * Rule 9 — the overlay button that receives the click is disabled when nothing is
 * available: `_AvailableCount: CountRows(Filter(col_Edit_DevCoCosts,
 * ParentId = ThisItem.Id && Level = 3 && !Used))`.
 */
export const parentToggleEnabled = (children: AccountSelection[]): boolean =>
  children.some((c) => !c.used);

/**
 * Rule 8 — clicking the parent toggles ONLY the available children.
 * `_TurnOn: If(_SelectedAvailableCount = 0, true, false)` — so a partially selected group
 * turns everything OFF, not on.
 */
export function toggleParent(children: AccountSelection[]): AccountSelection[] {
  const available = children.filter((c) => !c.used);
  const turnOn = available.filter((c) => c.selected).length === 0;
  return children.map((c) => (c.used ? c : { ...c, selected: turnOn }));
}

/** Single-node toggle. A used node never changes. */
export function toggleAccount(
  selections: Map<string, AccountSelection>,
  accountId: string,
): Map<string, AccountSelection> {
  const next = new Map(selections);
  const entry = next.get(accountId);
  if (!entry || entry.used) return next;
  next.set(accountId, { ...entry, selected: !entry.selected });
  return next;
}

/**
 * Rule 11 — expansion is ACCORDION-style: the canvas closes everything
 * (`UpdateIf(col_Edit_DevCoCosts, true, {IsFolded: true})`) and then opens the clicked
 * node. One `expandedId` value expresses the same thing.
 */
export const nextExpandedId = (current: string | null, clicked: string): string | null =>
  current === clicked ? null : clicked;

/* ═══════════════════════════════════════════════════════════════════ the caps ════ */

/**
 * Rules 3 and 4 — the ten-contract caps.
 *
 * ┌──────────────────────────────────────────────────────────────────────────────┐
 * │ DOCUMENTED DEFECT — THE CAPS ARE COMPUTED IN `OnVisible` ONLY, INTO            │
 * │ `locDevContractLimitExceeded` / `locConstructionContractLimitExceeded`, SO    │
 * │ THEY GO STALE THE MOMENT A CONTRACT IS ADDED WITHOUT LEAVING THE SCREEN.      │
 * │ And they are enforced by a `Notify(...)` TOAST on click, not by disabling the │
 * │ button — so the user presses Add, gets a warning, and nothing happens.        │
 * │                                                                              │
 * │ FIXED: `contractCapReached` takes the LIVE contract list, so the Add buttons  │
 * │ are simply disabled and re-evaluate after every save (UT-ADCONTR-029).        │
 * └──────────────────────────────────────────────────────────────────────────────┘
 */
export function countContracts(
  contracts: BopContract[],
  scope: ContractScope,
  type: BopContractType,
): number {
  return contracts.filter((c) =>
    c.countryId === scope.countryId
    && c.technology === scope.technologyValue
    && c.contractType === CONTRACT_TYPE_VALUE[type]).length;
}

export const contractCapReached = (
  contracts: BopContract[],
  scope: ContractScope,
  type: BopContractType,
): boolean => countContracts(contracts, scope, type) >= CONTRACT_CAP;

/* ═══════════════════════════════════════════════════════════════════ the form ════ */

export interface ContractForm {
  description: string;
  closingDateReference: number | null;
  /** `"+"` or `"−"`, from the separate sign dropdown (rule 13). */
  monthSign: "+" | "−";
  months: string;
  margin: boolean;
  marginType: number | null;
  marginPercentage: string;
  marginFixedValue: string;
  comment: string;
  dirty: boolean;
}

export const emptyContractForm = (): ContractForm => ({
  description: "", closingDateReference: null, monthSign: "+", months: "",
  margin: false, marginType: null, marginPercentage: "", marginFixedValue: "",
  comment: "", dirty: false,
});

export function toContractForm(contract: BopContract | null): ContractForm {
  if (!contract) return emptyContractForm();
  const months = contract.monthDifference ?? 0;
  return {
    description: contract.description ?? "",
    closingDateReference: contract.closingDateReference,
    monthSign: months < 0 ? "−" : "+",
    months: String(Math.abs(months)),
    margin: contract.margin === true,
    marginType: contract.marginType,
    marginPercentage: contract.marginPercentage === null
      ? "" : String(contract.marginPercentage),
    marginFixedValue: contract.marginFixedValue === null
      ? "" : String(contract.marginFixedValue),
    comment: contract.comment ?? "",
    dirty: false,
  };
}

/**
 * Rule 13 — the month difference is SIGNED BY A SEPARATE `+`/`−` DROPDOWN:
 * `If(drp_…_AddSub.Selected.Value = "+", Value(txt_…_Month.Value),
 *     Value(txt_…_Month.Value) * -1)`
 */
export function signedMonthDifference(sign: "+" | "−", months: string): number {
  const n = Number(String(months).trim());
  if (!Number.isFinite(n)) return 0;
  return sign === "−" ? -n : n;
}

/** `And(Not(IsMatch(v, "^\d{1,2}$")), Not(IsBlank(v)))` — one or two digits, unsigned. */
export const isValidMonthDifference = (months: string): boolean =>
  /^\d{1,2}$/.test(String(months).trim());

export const marginPercentageError = (raw: string, language = "en-US"): string | null => {
  if (isBlank(raw)) return MSG.descriptionBlank;
  if (!isOneDecimal(raw, language)) return MSG.marginPercentage;
  if (!inRange(raw, 0, 100, language)) return MSG.marginPercentage;
  return null;
};

export const marginFixedValueError = (raw: string, language = "en-US"): string | null => {
  if (isBlank(raw)) return MSG.descriptionBlank;
  if (!isTwoDecimal(raw, language)) return MSG.marginFixedValue;
  if (!inRange(raw, 0, CONTRACT_COSTS_MAX, language)) return MSG.marginFixedValue;
  return null;
};

/**
 * Rule 14 — the margin fields are MUTUALLY EXCLUSIVE and cleared when not applicable:
 *   'Margin Type'        written only when Margin = Yes, else Blank()
 *   'Margin Percentage'  only when Margin = Yes AND type = Percentage
 *   'Margin Fixed Value' only when Margin = Yes AND type = Fixed Value
 * A field the condition excludes is written as `null`, which is what `Blank()` does.
 */
export interface MarginFields {
  margin: boolean;
  marginType: number | null;
  marginPercentage: number | null;
  marginFixedValue: number | null;
}

export function marginFields(
  marginYes: boolean,
  marginType: number | null,
  pct: string,
  fixed: string,
): MarginFields {
  if (!marginYes) {
    return { margin: false, marginType: null, marginPercentage: null, marginFixedValue: null };
  }
  const isPct = marginType === CHOICE_ADMIN.contractMarginType.percentage;
  const isFixed = marginType === CHOICE_ADMIN.contractMarginType.fixedValue;
  const toNumber = (raw: string) => {
    if (isBlank(raw)) return null;
    const n = Number(String(raw).replace(",", "."));
    return Number.isFinite(n) ? n : null;
  };
  return {
    margin: true,
    marginType,
    marginPercentage: isPct ? toNumber(pct) : null,
    marginFixedValue: isFixed ? toNumber(fixed) : null,
  };
}

/**
 * The closing-date LABEL's visibility, reproduced exactly — edit-only. See
 * `CLOSING_DATE_RULE_NOTE`: the label is called `…_Description_ErrorMessage_1` in the
 * source but validates the closing date.
 */
export const closingDateLabelVisible = (
  isEdit: boolean,
  closingDateReference: number | null,
): boolean => isEdit && closingDateReference === null;

/**
 * The Save conjunction (`ico_AdminContracts_Save.DisplayMode`), spelled out.
 *
 * Every term is from the source: dirty AND at least one account selected; a non-blank
 * trimmed description; the closing-date label not visible; the margin branch; a non-blank
 * closing-date reference; a non-blank month difference; a non-blank margin radio value.
 */
export function validateContract(
  form: ContractForm,
  args: { selectedCount: number; isEdit: boolean; language?: string },
): string[] {
  const errors: string[] = [];
  const lang = args.language ?? "en-US";

  if (!form.dirty) errors.push(MSG.notDirty);
  if (args.selectedCount === 0) errors.push(MSG.noAccountSelected);
  if (isBlank(form.description.trim())) errors.push(MSG.descriptionBlank);

  // The single effective closing-date rule. The canvas enforced it twice for edits and
  // once for new contracts; one rule, both cases.
  if (form.closingDateReference === null) errors.push(MSG.closingDateEmpty);

  if (isBlank(form.months)) {
    errors.push(MSG.monthDifference);
  } else if (!isValidMonthDifference(form.months)) {
    errors.push(MSG.monthDifference);
  }

  if (form.margin) {
    if (form.marginType === CHOICE_ADMIN.contractMarginType.percentage) {
      const e = marginPercentageError(form.marginPercentage, lang);
      if (e) errors.push(e);
    } else if (form.marginType === CHOICE_ADMIN.contractMarginType.fixedValue) {
      const e = marginFixedValueError(form.marginFixedValue, lang);
      if (e) errors.push(e);
    } else {
      errors.push("Select a margin type.");
    }
  }
  return errors;
}

export const canSaveContract = (
  form: ContractForm,
  args: { selectedCount: number; isEdit: boolean; canEdit: boolean; language?: string },
): boolean => args.canEdit && validateContract(form, args).length === 0;

/** Country scope, applied here and absent from the canvas. */
export function canEditScope(user: CurrentUser | null, scope: ContractScope): boolean {
  if (!user) return false;
  return canEditCountry(user, scope.countryId ?? undefined);
}

/* ═══════════════════════════════════════════════════════════ the DevCo reconcile ════ */

/**
 * Rule 15 — the children are reconciled in two steps, both scoped to the current contract:
 *   delete — the rows whose account is no longer selected
 *   create — the selected level-3 accounts that have no row yet
 * The canvas comment above the create reads
 * `// OPTIMIZATION: Instead of Looping Collect, we use ForAll inside Patch to shape the
 * table in memory` — the same intent, expressed as a batch here.
 */
export interface ReconcileResult {
  toDelete: string[];
  toCreate: string[];
}

export function reconcileDevCoCosts(
  before: Map<string, AccountSelection>,
  after: Map<string, AccountSelection>,
): ReconcileResult {
  const toDelete: string[] = [];
  const toCreate: string[] = [];
  for (const [accountId, next] of after) {
    const prev = before.get(accountId);
    if (next.used) continue;                       // never touch another contract's row
    const wasOwned = prev?.devCoCostId != null;
    if (next.selected && !wasOwned) toCreate.push(accountId);
    if (!next.selected && wasOwned) toDelete.push(prev!.devCoCostId!);
  }
  return { toDelete, toCreate };
}

/* ═════════════════════════════════════════════════════════════════════ the save ════ */

/** Rule 12 — `Name: Text(<contract type>) & " - " & <description>`. */
export const composeContractName = (type: BopContractType, description: string): string =>
  `${CONTRACT_TYPE_LABEL[type]} - ${description.trim()}`;

export function buildContractPayload(
  form: ContractForm,
  args: { type: BopContractType; scope: ContractScope; isCreate: boolean },
): Record<string, unknown> {
  const margin = marginFields(
    form.margin, form.marginType, form.marginPercentage, form.marginFixedValue,
  );
  const data: Record<string, unknown> = {
    [BOP_CONTRACT_COL.name]: composeContractName(args.type, form.description),
    [BOP_CONTRACT_COL.description]: form.description.trim(),
    [BOP_CONTRACT_COL.closingDateReference]: form.closingDateReference,
    [BOP_CONTRACT_COL.monthDifference]: signedMonthDifference(form.monthSign, form.months),
    [BOP_CONTRACT_COL.margin]: margin.margin,
    [BOP_CONTRACT_COL.marginType]: margin.marginType,
    [BOP_CONTRACT_COL.marginPercentage]: margin.marginPercentage,
    [BOP_CONTRACT_COL.marginFixedValue]: margin.marginFixedValue,
    [BOP_CONTRACT_COL.comment]: form.comment.trim() === "" ? null : form.comment.trim(),
  };
  if (args.isCreate) {
    data[BOP_CONTRACT_COL.contractTypes] = CONTRACT_TYPE_VALUE[args.type];
    data[BOP_CONTRACT_COL.technology] = args.scope.technologyValue;
    if (args.scope.countryId) {
      data[`${BOP_LOOKUP.country}@odata.bind`] = `/vsb_countries(${args.scope.countryId})`;
    }
  }
  return data;
}

/**
 * Rule 15's create payload.
 *
 * Rule 16, FIXED: the canvas OMITS `RootCapexAccount` from the create, even though
 * `col_Costs_Flat_Cache` reads `RootCapexAccount.Order` and `RootCapexAccount.Name` for
 * the collapsed card — so a newly created row renders with a BLANK account name until
 * something else populates the lookup. Here the level-2 ancestor is derived from the tree
 * node and included (UT-ADCONTR-026).
 */
export function buildDevCoCostPayload(args: {
  node: AccountNode;
  rootAccount: AccountNode | null;
  contractId: string;
  scope: ContractScope;
  owningBusinessUnitId: string | null;
}): Record<string, unknown> {
  const data: Record<string, unknown> = {
    [DEVCO_COST_COL.name]: `${args.node.number}-${args.node.name}`,
    [`${BOP_LOOKUP.contract}@odata.bind`]:
      `/${BOP_CONTRACT_ENTITY_SET}(${args.contractId})`,
    [`${BOP_LOOKUP.capexAccount}@odata.bind`]: `/vsb_capexaccountlists(${args.node.id})`,
    [DEVCO_COST_COL.technology]: args.scope.technologyValue,
  };
  if (args.rootAccount) {
    data[`${BOP_LOOKUP.rootCapexAccount}@odata.bind`] =
      `/vsb_capexaccountlists(${args.rootAccount.id})`;
  }
  if (args.scope.countryId) {
    data[`${BOP_LOOKUP.country}@odata.bind`] = `/vsb_countries(${args.scope.countryId})`;
  }
  if (args.owningBusinessUnitId) {
    data[`${BOP_LOOKUP.owningBusinessUnit}@odata.bind`] =
      `/businessunits(${args.owningBusinessUnitId})`;
  }
  return data;
}

/** The level-2 ancestor of a level-3 node — the ROOT account the card groups by. */
export function rootAccountFor(tree: AccountNode[], accountId: string): AccountNode | null {
  for (const category of tree) {
    for (const account of category.children) {
      if (account.children.some((c) => c.id === accountId)) return account;
    }
  }
  return null;
}

/**
 * The save as ONE batch: the contract upsert plus the reconciled child deletes and
 * creates. The canvas does the parent `Patch`, then a `RemoveIf`, then a bulk `Patch`,
 * then two `Refresh`es and a local `Collect`/`UpdateIf` — five operations that can
 * half-apply.
 *
 * NOTE: a CREATE cannot bind its children in the same batch without a `$batch`
 * content-id reference. `hooks.ts` therefore creates the contract first and then sends the
 * children as one batch; `contractId` here is the id that create returned. For an EDIT the
 * whole thing is a single batch.
 */
export function planSaveContract(args: {
  form: ContractForm;
  type: BopContractType;
  scope: ContractScope;
  existing: BopContract | null;
  contractId: string | null;
  before: Map<string, AccountSelection>;
  after: Map<string, AccountSelection>;
  tree: AccountNode[];
  owningBusinessUnitId: string | null;
  canEdit: boolean;
  language?: string;
}): WritePlan {
  const selectedCount = [...args.after.values()].filter((a) => a.selected && !a.used).length;
  if (!args.canEdit) return refuse(MSG.outOfScope);
  const errors = validateContract(args.form, {
    selectedCount, isEdit: args.existing !== null, language: args.language,
  });
  if (errors.length > 0) return refuse(errors[0]);

  const plan = emptyPlan();
  const payload = buildContractPayload(args.form, {
    type: args.type, scope: args.scope, isCreate: args.existing === null,
  });

  if (args.existing === null) {
    plan.writes.push({
      op: "create", entitySet: BOP_CONTRACT_ENTITY_SET, data: payload,
      reason: `${CONTRACT_TYPE_LABEL[args.type]} created`,
    });
  } else {
    plan.writes.push({
      op: "update", entitySet: BOP_CONTRACT_ENTITY_SET, id: args.existing.id, data: payload,
      reason: `${CONTRACT_TYPE_LABEL[args.type]} updated`,
    });
  }

  const { toDelete, toCreate } = reconcileDevCoCosts(args.before, args.after);
  for (const id of toDelete) {
    plan.writes.push({
      op: "delete", entitySet: DEVCO_COST_ENTITY_SET, id,
      reason: "CAPEX account released by this contract",
    });
  }

  const contractId = args.contractId ?? args.existing?.id ?? null;
  const nodes = new Map(selectableNodes(args.tree).map((n) => [n.id, n]));
  for (const accountId of toCreate) {
    const node = nodes.get(accountId);
    if (!node || contractId === null) continue;
    plan.writes.push({
      op: "create", entitySet: DEVCO_COST_ENTITY_SET,
      data: buildDevCoCostPayload({
        node,
        rootAccount: rootAccountFor(args.tree, accountId),
        contractId,
        scope: args.scope,
        owningBusinessUnitId: args.owningBusinessUnitId,
      }),
      reason: `CAPEX account ${node.number} claimed by this contract`,
    });
  }

  plan.log.push(
    `${toCreate.length} account(s) claimed, ${toDelete.length} released.`,
  );
  return plan;
}

/**
 * Rule 19 — Delete removes the PARENT only:
 * `Remove('BoP Contracts Standard Assumptions', locSelectedBoPStandardContract)`.
 * The DevCo-cost children are left to Dataverse cascade behaviour, WHICH IS NOT VISIBLE
 * FROM THE APP SOURCE. Because an orphaned child would keep an account locked forever,
 * the children are deleted explicitly here; if the schema does cascade, the extra deletes
 * are harmless no-ops on a second run and the batch is still one round-trip.
 */
export function planDeleteContract(args: {
  contract: BopContract;
  ownedCosts: DevCoCost[];
  canEdit: boolean;
}): WritePlan {
  if (!args.canEdit) return refuse(MSG.outOfScope);
  const plan = emptyPlan();
  for (const cost of args.ownedCosts) {
    if (cost.contractId !== args.contract.id) continue;
    plan.writes.push({
      op: "delete", entitySet: DEVCO_COST_ENTITY_SET, id: cost.id,
      reason: "DevCo cost removed with its contract",
    });
  }
  plan.writes.push({
    op: "delete", entitySet: BOP_CONTRACT_ENTITY_SET, id: args.contract.id,
    reason: `Contract “${args.contract.description ?? args.contract.id}” deleted`,
  });
  return plan;
}

/* ═══════════════════════════════════════════════════════════════════ the card ════ */

/**
 * Rule 18 — the collapsed card groups the contract's accounts by ROOT ACCOUNT and orders
 * them by this rank. The five names and the `99` fallback are literals in the canvas
 * `Switch`; they are declared once here instead of inside a `Concat` that builds HTML.
 */
export const ROOT_ACCOUNT_RANK: Record<string, number> = {
  "Wind Turbine / Panels": 1,
  "Development Expenses": 2,
  "Construction Expenses": 3,
  "Substation / Grid Connection": 4,
  "Other CAPEX": 5,
};

export const UNRANKED_ROOT_ACCOUNT = 99;

export const rootAccountRank = (name: string | null): number =>
  name === null ? UNRANKED_ROOT_ACCOUNT : ROOT_ACCOUNT_RANK[name] ?? UNRANKED_ROOT_ACCOUNT;

export interface CardGroup {
  rootAccountName: string;
  rank: number;
  subaccounts: { id: string; label: string }[];
}

export function groupCostsForCard(costs: DevCoCost[], contractId: string): CardGroup[] {
  const byRoot = new Map<string, CardGroup>();
  for (const cost of costs) {
    if (cost.contractId !== contractId) continue;
    const name = cost.rootAccountName ?? "—";
    const group = byRoot.get(name) ?? {
      rootAccountName: name, rank: rootAccountRank(cost.rootAccountName), subaccounts: [],
    };
    group.subaccounts.push({ id: cost.id, label: cost.categoryName ?? cost.id });
    byRoot.set(name, group);
  }
  return [...byRoot.values()].sort(
    (a, b) => a.rank - b.rank || a.rootAccountName.localeCompare(b.rootAccountName),
  );
}

/* ═════════════════════════════════════════════════════════════════════ the Apply ════ */

export interface ApplyCommandState {
  enabled: false;
  disabledReason: string;
}

/**
 * Rule 20 — Apply and Apply-to-All, DISABLED EXACTLY AS SHIPPED. `enabled` is the literal
 * `false` in the type, so a later edit cannot flip it by accident.
 */
export const applyCommandState = (): ApplyCommandState => ({
  enabled: false,
  disabledReason: MSG.applyDisabled,
});

/**
 * The BoP overload's call signature, from the COMMENTED call site:
 *
 *   SynchronizeStandardAssumptionCosts.Run(
 *       "BoP",
 *       locFabricSyncCostJob.Country.Country,
 *       Int(locFabricSyncCostJob.Technology),
 *       locFabricSyncCostJob.'Fabric Sync Job',
 *       { text_3: If(IsBlank(locSelectedBoPStandardContractForApply), "All",
 *                    Text(locSelectedBoPStandardContractForApply.'BoP Contracts Standard Assumptions')) }
 *   )
 *
 * THE FLOW IS NOT IN THE SOLUTION EXPORT. Its internals are not invented here; the wrapper
 * in `@/flows/flowClient` throws.
 *
 * ┌──────────────────────────────────────────────────────────────────────────────┐
 * │ DOCUMENTED DEFECT — RULE 21: EIGHT FORMULAS ON THIS SCREEN READ THE **COST**  │
 * │ SCREEN'S COUNTRY PICKER.                                                     │
 * │                                                                              │
 * │ `cmp_Admin_Costs_Assumption_NestedCountryPickerColumn` exists only on         │
 * │ `Admin Cost Screen`; this screen's own picker is                              │
 * │ `cmp_AdminContraacts_NestedCountryPickerColumn` (the misspelling is in the    │
 * │ source). Affected: `lbl_AdminContract_Last_Apply_All_Tracking.Text`,          │
 * │ `lbl_AdminContract_Info_Individual_AdminContracts_1.Text`, an Apply button's  │
 * │ lookup, and the commented Fabric job's Country/Technology. So the "last        │
 * │ applied" badges can disagree with the record just written, and a              │
 * │ Contract-screen Apply would have recalculated whatever scope the COST screen  │
 * │ last had.                                                                    │
 * │                                                                              │
 * │ FIXED: scope is a PARAMETER everywhere (`synchronizeBopArgs`,                 │
 * │ `LastAppliedBadge`'s props). No component reads another feature's state.      │
 * └──────────────────────────────────────────────────────────────────────────────┘
 */
export function synchronizeBopArgs(args: {
  scope: ContractScope;
  contractId: string | null;
}): { costType: "BoP"; countryId: string | null; technology: number | null; text_3: string } {
  return {
    costType: "BoP",
    countryId: args.scope.countryId,
    technology: args.scope.technologyValue,
    text_3: args.contractId ?? "All",
  };
}
