/**
 * Admin Contract Screen — every business rule as a pure function (redeveloped and connected
 * 19 Oct 2026, D23).
 *
 * Canvas screen: `Admin Contract Screen` (PM app),
 * `ProjectDocs/_extracted/msapp/projectmanagement/Src/Admin Contract Screen.pa.yaml`.
 *
 * Maintains the BoP standard contracts for one country × technology: up to ten Development
 * Contracts and ten Construction Contracts, each with a description, a closing-date reference
 * and month offset, an optional margin, a comment, and the CAPEX subaccounts the contract
 * "owns" as DevCo costs. Each subaccount belongs to AT MOST ONE contract in the scope;
 * accounts owned by another contract render ticked and locked.
 *
 * SERVER AUTOMATION (04-flow-inventory.md, verified 19 Oct 2026; the plugin assemblies read
 * from the solution export):
 *  - `vsb_bopcontractsstandardassumptiondevcocosts` Create / Update of `vsb_capexaccount`
 *    (pre-operation, `DevCoCostRootCapexPlugin`) walks the CAPEX hierarchy and SETS
 *    `vsb_rootcapexaccount`. The canvas therefore never writes RootCapexAccount, and neither do
 *    we (the code app used to write it — removed, CONVENTIONS "never redo a plugin's work").
 *  - `vsb_bopcontractsstandardassumptions` Delete (pre-validation,
 *    `VSB.BoPContractAssumptionDeletion`) deletes the contract's template DevCo costs, every
 *    project's live `vsb_bopcontractsdevcocosts` and every `vsb_bopprojectscontracts` built from
 *    it. The parent → DevCo-cost relationship also has `CascadeDelete = Cascade`. Delete
 *    therefore removes the parent row only, exactly as the canvas `Remove(...)`.
 *  - No flow fires. `SynchronizeStandardAssumptionCosts` is only called from commented-out code.
 *
 * NOT PORTED: Apply / Apply to All, their info texts, the last-Apply labels and the
 * `Apply and Apply All Trackings` write — out of scope for the migration (D20). The canvas
 * buttons were `DisplayMode.Disabled` anyway. The flag images of the country rail.
 *
 * PERMISSION: entry and every write are gated on the admin rule (`useAdminAccess`), as on the
 * other admin screens. The canvas has no permission signal on this screen at all; the invented
 * country-scope rule (`canEditScope`) was removed (D23).
 *
 * HIDDEN CONTROLS:
 *  - `btn_Add_Edit_AdminContracts_Reset` (Select()-ed by Edit and Save) resets the panel
 *    inputs → the panel form is rebuilt from `toContractForm` every time it opens.
 *  - `btnGeneralPurposeReset` (Select()-ed by the picker, Save, Close and Delete) refreshes both
 *    tables, rebuilds the card cache keeping each card's fold state, and recomputes the caps →
 *    query invalidation; the open-card set lives outside the data, and the caps are derived
 *    from the live list (`contractCapReached`).
 *  - `fn_Numeric_AdminContracts` (IsOneDecimal / IsTwoDecimal / InRange) → `@/domain/powerFxNumeric`.
 *  - The hidden `chb_Add_Edit_AdminContract_Right_Panel_DevCoCostForm_Costs` (`Visible: false`
 *    with live handlers duplicating the tri-state) and the debug label `S:… U:…` are not ported.
 *
 * SOURCE DEFECTs fixed (each marked below):
 *  - the dirty flag of the DevCo form (`locContractDevCoCostsCahnged`) is never reset;
 *  - the month prefill reads `'BoP Projects Contracts'` (a relationship, not the column);
 *  - Save accepts a non-numeric month value;
 *  - a failed delete is silent (no `IfError` around `Remove`).
 */
import { isBlank, isOneDecimal, isTwoDecimal, inRange } from "@/domain/powerFxNumeric";
import { ES, ES_ADMIN, CHOICE_ADMIN, CAPEX_CONTRACT_TREE_EXCLUDED_NUMBER } from "@/data/dataverseNames";
import {
  buildAccountTree, flattenTree, type CapexAccount, type AccountNode,
} from "@/features/admin/admin-capex-accounts/rules";
import {
  buildCountryPicker, toNestedPicker, COST_CONTRACT_EXCLUDED_COUNTRIES, technologyValue,
} from "@/features/admin/admin-gates-approvals/rules";
import { createdRowRef, emptyPlan, refusePlan as refuse, type WritePlan } from "@/data/writePlan";

export {
  buildAccountTree, flattenTree, buildCountryPicker, toNestedPicker, COST_CONTRACT_EXCLUDED_COUNTRIES,
  technologyValue,
};
export type { CapexAccount, AccountNode };

/* ═══════════════════════════════════════════════════════════════════ columns ════ */

export const BOP_CONTRACT_COL = {
  id: "vsb_bopcontractsstandardassumptionsid",
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
} as const;

/**
 * `BoP Contracts Standard Assumption DevCo Costs`. Its Country and Technology columns carry the
 * `crc36_` publisher prefix (the code app had `vsb_country` / `vsb_technology`, which do not
 * exist).
 */
export const DEVCO_COST_COL = {
  id: "vsb_bopcontractsstandardassumptiondevcocostsid",
  name: "vsb_name",
  contract: "_vsb_bopcontractstandardassumption_value",
  capexAccount: "_vsb_capexaccount_value",
  /** Set by the `DevCoCostRootCapexPlugin` plugin — read, never written. */
  rootCapexAccount: "_vsb_rootcapexaccount_value",
  country: "_crc36_country_value",
  technology: "crc36_technology",
} as const;

/** Navigation properties for `@odata.bind` (the lookups' schema names). */
export const BOP_LOOKUP = {
  /** On the contract. */
  contractCountry: "vsb_Country",
  /** On the DevCo cost. */
  devCoCountry: "crc36_Country",
  contract: "vsb_BoPContractStandardAssumption",
  capexAccount: "vsb_CAPEXAccount",
} as const;

export const BOP_CONTRACT_ENTITY_SET = ES_ADMIN.bopContractsStandardAssumptions;
export const DEVCO_COST_ENTITY_SET = ES_ADMIN.bopDevCoCosts;

/** `locContractsCostsMax: 1000000000` — the margin fixed-value ceiling. */
export const CONTRACT_COSTS_MAX = 1_000_000_000;

/** `locDevContractLimitExceeded` / `locConstructionContractLimitExceeded`: `>= 10`. */
export const CONTRACT_CAP = 10;

/**
 * `cmp_AdminContraacts_NestedCountryPickerColumn.Nestings`: every country nests Wind, PV and
 * BESS — this screen overrides the component's Wind/PV default.
 */
export const CONTRACT_PICKER_TECHNOLOGIES: readonly string[] = ["Wind", "PV", "BESS"];

/* ═════════════════════════════════════════════════════════════════════ types ════ */

/** The two families the Add buttons create. */
export type BopContractType = "development" | "construction";

export const CONTRACT_TYPE_VALUE: Record<BopContractType, number> = {
  development: CHOICE_ADMIN.bopContractTypes.development,
  construction: CHOICE_ADMIN.bopContractTypes.construction,
};

/**
 * `Text('BoP Contract Types'.<value>)` — the option labels of the global set
 * `vsb_contracttypes` (customizations.xml). The canvas composes the contract Name and the panel
 * title from them.
 */
export const CONTRACT_TYPE_LABELS: Readonly<Record<number, string>> = {
  [CHOICE_ADMIN.bopContractTypes.none]: "None",
  [CHOICE_ADMIN.bopContractTypes.development]: "Development Contract",
  [CHOICE_ADMIN.bopContractTypes.construction]: "Construction Contract",
  [CHOICE_ADMIN.bopContractTypes.projectRights]: "Project Rights Contract",
};

export const contractTypeLabel = (value: number | null): string =>
  value === null ? "" : CONTRACT_TYPE_LABELS[value] ?? "";

export interface BopContract {
  id: string;
  name: string | null;
  description: string | null;
  countryId: string | null;
  technology: number | null;
  contractType: number | null;
  closingDateReference: number | null;
  monthDifference: number | null;
  margin: boolean | null;
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
}

/** `Countries` with the column the card's currency heading reads. */
export interface ContractCountry {
  id: string;
  name: string;
  isoCurrencyCode: string | null;
}

export interface ContractScope {
  countryId: string | null;
  countryName: string | null;
  /** The picker's `SelectedNestedValue` — `"Wind"`, `"PV"` or `"BESS"`. */
  technology: string | null;
  technologyValue: number | null;
  /** `SelectedCountry.'ISO Currency Code'`. */
  isoCurrencyCode: string | null;
}

/** Per-account classification when the panel opens: selected by THIS contract, or used by another. */
export interface AccountSelection {
  accountId: string;
  selected: boolean;
  used: boolean;
  usedByContractId: string | null;
  /** The existing child row's id, when this contract already owns the account (`ContractDevCo`). */
  devCoCostId: string | null;
}

export { emptyPlan, type PlannedWrite, type WritePlan } from "@/data/writePlan";

/* ═════════════════════════════════════════════════════════════════ messages ════ */

export const MSG = {
  /** `lbl_Add_Edit_AdminContracts_Description_ErrorMessage_1.Text` — verbatim. */
  closingDateEmpty: "The Contract Closing Date cannot be empty.",
  /** `lbl_Add_Edit_AdminContracts_MonthDifference_ErrorMessage.Text` — verbatim. */
  monthDifference: "Only whole numbers with up to two digits are allowed.",
  /** `gblAppResx.InputBlank` (`App.pa.yaml`) — verbatim. */
  inputBlank: "Input must not be blank",
  /** `gblAppResx.NumericOneDecimals` (`App.pa.yaml`) — verbatim. */
  numericOneDecimals: "Numeric value with maximum of one decimals",
  /** `gblAppResx.NumericTwoDecimals` (`App.pa.yaml`) — verbatim. */
  numericTwoDecimals: "Numeric value with maximum of two decimals",
  /**
   * The range branch of both margin error labels — `$"Please select a value between 0 and
   * {Text(max, fmt)}"`. `Text(100, "###,###0.0")` renders "100.0" and
   * `Text(1000000000, "###,###0,00")` renders "1,000,000,000" (en-US).
   */
  outOfRange: (maxText: string) => `Please select a value between 0 and ${maxText}`,
  /** `btn_AdminContract_Add_*.OnSelect` Notify — verbatim. Unreachable: the button is disabled first. */
  capReached: (type: BopContractType, country: string, technology: string) =>
    `Maximum 10 ${type} contracts allowed for ${country} - ${technology}`,
  /** `ico_AdminContracts_Save.OnChange` → `locContractSpinnerInformationText` — verbatim. */
  saving: "Please wait, saving...",
  /** `cmp_PopUp_Confirmation_Delete_Contract_Or_Period_1.OnConfirm` — verbatim. */
  deleting: "Please wait, deleting...",
  /** `Notify("Error saving Contract: " & FirstError.Message, NotificationType.Error)` — verbatim. */
  saveError: (detail: string) => `Error saving Contract: ${detail}`,
  /** NEW — no canvas equivalent: the save plan's refusal when nothing changed (Save is greyed). */
  notDirty: "Nothing has been changed yet.",
  /** NEW — no canvas equivalent: the save plan's refusal with no account (Save is greyed). */
  noAccountSelected: "Select at least one CAPEX account for this contract.",
  /** NEW — no canvas equivalent: the write plans' refusal without the admin rule. */
  noPermission: "You do not have permission to change the BoP standard contracts.",
  /** NEW — no canvas equivalent: rule 19 load-error state. */
  loadFailedTitle: "Contracts are unavailable",
  /** NEW — no canvas equivalent: rule 19 load-error state. */
  loadFailedDescription: "The BoP standard contracts could not be loaded. Please try again.",
  /** NEW — no canvas equivalent: rule 19 loading state. */
  loading: "Loading...",
} as const;

/**
 * DOCUMENTED — TWO SIMILARLY NAMED LABELS, NEITHER OF WHICH DOES WHAT ITS NAME SAYS.
 * `lbl_Add_Edit_AdminContracts_Description_ErrorMessage_1` — the one in the Save conjunction —
 * is the CLOSING-DATE validator, visible only when EDITING with a blank closing date.
 * `lbl_Add_Edit_AdminContracts_Description_ErrorMessage` (no `_1`) is dead: its `Text` is
 * commented out. There is therefore no duplicate-description check on this screen, and none was
 * invented.
 */
export const CLOSING_DATE_RULE_NOTE =
  "lbl_…_Description_ErrorMessage_1 is the closing-date validator, not a description one; "
  + "lbl_…_Description_ErrorMessage is dead. There is no duplicate-description check.";

/** Deliberately `false`: the canvas has no such check and we did not add one. */
export const duplicateDescriptionCheckExists = (): boolean => false;

/* ═══════════════════════════════════════════════════════════════════ the scope ════ */

/** The picker items: Spain, Greece and Romania excluded; Wind, PV and BESS under every country. */
export function buildContractPicker(countries: readonly ContractCountry[]) {
  return toNestedPicker(buildCountryPicker([...countries], {
    exclude: COST_CONTRACT_EXCLUDED_COUNTRIES, technologies: CONTRACT_PICKER_TECHNOLOGIES,
  }));
}

export function scopeFor(country: ContractCountry | null, technology: string | null): ContractScope {
  return {
    countryId: country?.id ?? null,
    countryName: country?.name ?? null,
    technology,
    technologyValue: technologyValue(technology),
    isoCurrencyCode: country?.isoCurrencyCode ?? null,
  };
}

/**
 * The picker's initial selection: `gal_Countries` defaults to its first row (Germany) and the
 * nested gallery to its first child (Wind).
 */
export function defaultContractScope(countries: readonly ContractCountry[]): ContractScope {
  const picker = buildContractPicker(countries);
  const first = picker.countries[0];
  const country = first ? countries.find((c) => c.id === first.key) ?? null : null;
  return scopeFor(country, country ? CONTRACT_PICKER_TECHNOLOGIES[0] ?? null : null);
}

/* ═══════════════════════════════════════════════════════════════════ the tree ════ */

/**
 * `OnVisible`'s tree, seeded from `"00001"` and EXCLUDING `"10006"`:
 * `Filter(colCapexAllAccountsTemporary, And('Parent Account'.Number = "00001",
 * Not(ThisRecord.Number = "10006")))`. Only `Level = 3` nodes are selectable.
 */
export function buildContractAccountTree(accounts: CapexAccount[]): AccountNode[] {
  return buildAccountTree(accounts, { exclude: [CAPEX_CONTRACT_TREE_EXCLUDED_NUMBER] });
}

export const selectableNodes = (tree: AccountNode[]): AccountNode[] =>
  flattenTree(tree).filter((n) => n.level === 3);

/** One header of the DevCo Cost Form and the level-3 rows under it. */
export interface DevCoFormGroup {
  category: AccountNode;
  leaves: AccountNode[];
}

/**
 * `gal_Add_Edit_AdminContracts_Right_Panel_DevCoCostForm.Items` =
 * `Sort(Filter(col_Edit_DevCoCosts, Level = 1), Order)` — the level-1 CATEGORIES, every one of
 * them; each lists `Filter(col_Edit_DevCoCosts, ParentId = ThisItem.Id && Level = 3)`, i.e. ALL
 * its level-3 descendants flat (the level-3 `ParentId` is the level-1 id), in the
 * `SortByColumns(…, "Nummer")` order. Level-2 accounts are never shown.
 */
export function devCoFormGroups(tree: AccountNode[]): DevCoFormGroup[] {
  return tree.map((category) => ({
    category,
    leaves: category.children
      .flatMap((account) => account.children.filter((n) => n.level === 3))
      .sort((a, b) => a.number.localeCompare(b.number)),
  }));
}

/**
 * Opening the panel classifies every level-3 account (`btn_Edit_AdminContracts.OnSelect` /
 * `btn_AdminContract_Add_*.OnSelect`, over the scope's DevCo costs):
 *   `Selected` = the cost belongs to the contract being edited;
 *   `Used`     = it belongs to a DIFFERENT contract in the same scope.
 * For a NEW contract every cost found is `{Selected: false, Used: true}`.
 */
export function classifyAccounts(
  tree: AccountNode[],
  devCoCosts: DevCoCost[],
  currentContractId: string | null,
): Map<string, AccountSelection> {
  const out = new Map<string, AccountSelection>();
  for (const node of selectableNodes(tree)) {
    out.set(node.id, {
      accountId: node.id, selected: false, used: false, usedByContractId: null, devCoCostId: null,
    });
  }
  for (const cost of devCoCosts) {
    if (!cost.capexAccountId) continue;
    if (!out.has(cost.capexAccountId)) continue;
    const mine = currentContractId !== null && cost.contractId === currentContractId;
    out.set(cost.capexAccountId, {
      accountId: cost.capexAccountId,
      selected: mine,
      used: !mine,
      usedByContractId: cost.contractId,
      devCoCostId: mine ? cost.id : null,
    });
  }
  return out;
}

/** `chb_Contracts_RightPanel_NewEdit_CostssRow.Checked = Or(ThisItem.Selected, ThisItem.Used)`. */
export const leafChecked = (sel: AccountSelection | undefined): boolean =>
  sel !== undefined && (sel.selected || sel.used);

/* ═══════════════════════════════════════════════════════════ the tri-state box ════ */

export type TriState = "LOCKED" | "UNCHECKED" | "PARTIAL" | "CHECKED";

/**
 * `img_Parent_TriState_Checkbox.Image` — three pools over the header's level-3 rows:
 * `_TotalCount` all, `_AvailableCount` `!Used`, `_SelectedCount` `Selected && !Used`.
 * LOCKED when nothing is available, UNCHECKED when nothing is selected, CHECKED when
 * `_SelectedCount = _TotalCount`, PARTIAL otherwise. So a header with any used row can never read
 * fully checked — the canvas comment says so, and it is kept. `parentTriStateAvailableSemantics`
 * is the alternative, tested alongside so the choice stays reversible.
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

/** `img_Parent_TriState_Checkbox.DisplayMode`: disabled when `_AvailableCount = 0`. */
export const parentToggleEnabled = (children: AccountSelection[]): boolean =>
  children.some((c) => !c.used);

/**
 * `img_Parent_TriState_Checkbox.OnSelect` — toggles ONLY the available children;
 * `_TurnOn: If(_SelectedAvailableCount = 0, true, false)`, so a partly selected header turns
 * everything OFF.
 */
export function toggleParent(children: AccountSelection[]): AccountSelection[] {
  const available = children.filter((c) => !c.used);
  const turnOn = available.filter((c) => c.selected).length === 0;
  return children.map((c) => (c.used ? c : { ...c, selected: turnOn }));
}

/** `chb_…_CostssRow.OnCheck` / `OnUncheck`. A used row is `DisplayMode.View` and never changes. */
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
 * The DevCo Cost Form headers are an ACCORDION (`UpdateIf(col_Edit_DevCoCosts, true,
 * {IsFolded: true})`, then open the clicked one); the open header is also the highlighted one
 * (`locSelectedCapexAccountsForContract`, `rec_…_Card_Selected.Fill`).
 */
export const nextExpandedId = (current: string | null, clicked: string): string | null =>
  current === clicked ? null : clicked;

/* ═══════════════════════════════════════════════════════════════════ the cards ════ */

/**
 * `ico_Chevron_Expand_Collapse_AdminContracrs.OnSelect` — `Patch(colAdminContracts, ThisItem,
 * {IsFolded: !ThisItem.IsFolded})`: cards open and close INDEPENDENTLY ("others will stay
 * expanded"). New cards start folded (`AddColumns(…, IsFolded, true)`).
 */
export function toggleCard(open: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(open);
  if (next.has(id)) next.delete(id); else next.add(id);
  return next;
}

/** After Save the saved card is collected with `IsFolded: false` — opened, others unchanged. */
export function openCardAfterSave(open: ReadonlySet<string>, id: string): Set<string> {
  return new Set(open).add(id);
}

/**
 * `gal_AdminContracts_StandardAssumptions_Updated.Items` — `SortByColumns(Filter(…, scope),
 * "vsb_contracttypes", Ascending, "vsb_name", Ascending)`. The server already orders the rows;
 * this keeps the order after a client-side change.
 */
export function sortContracts(contracts: readonly BopContract[]): BopContract[] {
  return [...contracts].sort((a, b) =>
    (a.contractType ?? -1) - (b.contractType ?? -1) || (a.name ?? "").localeCompare(b.name ?? ""));
}

/** `con_MarginType_InfoGrid2.Visible` and `con_MarginFixedValuePercentage_InfoGrid2.Visible`. */
export const cardShowsMarginDetails = (c: BopContract): boolean => c.margin === true;

const isFixedMargin = (c: BopContract): boolean =>
  c.margin === true && c.marginType === CHOICE_ADMIN.contractMarginType.fixedValue;

/**
 * `lbl_MarginFixedValuePercentage_Heading.Text` — the card uses the country's ISO currency code
 * (fallback EUR); the PANEL uses the Poland test (`marginCurrency`). Both kept as the canvas has
 * them.
 */
export function cardMarginHeading(c: BopContract, isoCurrencyCode: string | null): string {
  return isFixedMargin(c)
    ? CONTRACT_SCREEN_TEXT.marginFixedValue(isBlank(isoCurrencyCode) ? "EUR" : isoCurrencyCode!)
    : CONTRACT_SCREEN_TEXT.marginPercentage;
}

/** `lbl_MarginFixedValuePercentage_Value.Text` — `Value(fixed)` or `Value(percentage)`. */
export function cardMarginValue(c: BopContract): string {
  const v = isFixedMargin(c) ? c.marginFixedValue : c.marginPercentage;
  return v === null ? "" : String(v);
}

/** `lbl_Margin_Value.Text = ThisItem.Margin` — the two-option labels. */
export const cardMarginText = (c: BopContract): string =>
  c.margin === null ? "" : c.margin ? MARGIN_OPTIONS.yes : MARGIN_OPTIONS.no;

/**
 * `htmlDevCoCostTagList` — the contract's DevCo costs grouped by root account
 * (`RootCapexAccount.Name`), the groups ordered by this rank (99 for any other name); each tag is
 * the cost's `'CAPEX Account'.Name`.
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

/**
 * `GroupBy(_ScopedData, AccountName, Rank, …)` sorted by `Rank` only (equal ranks keep their
 * first-appearance order). Names come from the account chart the screen already reads.
 */
export function groupCostsForCard(
  costs: readonly DevCoCost[],
  contractId: string,
  accountName: (id: string | null) => string,
): CardGroup[] {
  const byRoot = new Map<string, CardGroup>();
  for (const cost of costs) {
    if (cost.contractId !== contractId) continue;
    const name = accountName(cost.rootAccountId);
    const group = byRoot.get(name) ?? {
      rootAccountName: name, rank: rootAccountRank(name || null), subaccounts: [],
    };
    group.subaccounts.push({ id: cost.id, label: accountName(cost.capexAccountId) });
    byRoot.set(name, group);
  }
  return [...byRoot.values()].sort((a, b) => a.rank - b.rank);
}

/* ═══════════════════════════════════════════════════════════════════ the caps ════ */

/**
 * The ten-contract caps, `CountIf(colAdminContracts, Country.Name = …, Text(Technology) = …,
 * 'Contract Types' = …) >= 10`, which disable the Add buttons. The canvas recomputes them in
 * `OnVisible` and `btnGeneralPurposeReset`; here they derive from the live list.
 */
export function countContracts(
  contracts: readonly BopContract[],
  scope: ContractScope,
  type: BopContractType,
): number {
  return contracts.filter((c) =>
    c.countryId === scope.countryId
    && c.technology === scope.technologyValue
    && c.contractType === CONTRACT_TYPE_VALUE[type]).length;
}

export const contractCapReached = (
  contracts: readonly BopContract[],
  scope: ContractScope,
  type: BopContractType,
): boolean => countContracts(contracts, scope, type) >= CONTRACT_CAP;

/* ═══════════════════════════════════════════════════════════════════ the form ════ */

export interface ContractForm {
  description: string;
  closingDateReference: number | null;
  /** `drp_Add_Edit_AdminContracts_MonthDifference_AddSub` — `"+"` or `"−"`. */
  monthSign: "+" | "−";
  months: string;
  margin: boolean;
  marginType: number | null;
  marginPercentage: string;
  marginFixedValue: string;
  comment: string;
  /**
   * `locContractDevCoCostsDirty` OR `locContractDevCoCostsCahnged` — the Save conjunction's
   * first term. Reset whenever the panel opens (see `toContractForm`).
   */
  dirty: boolean;
}

/** `'Closing Date Reference'.'Cluster 4'` — the radio's default for a new or blank record. */
export const CLOSING_DATE_CLUSTER_4 = 952850000;

/**
 * A NEW contract: `rad_…_CostsUntilClosingDate` defaults to Cluster 4, the sign to "+", Margin to
 * No, and the Add buttons set `locSelectedContractMarginType: 'Contract Margin Type'.Percentage`.
 */
export const emptyContractForm = (): ContractForm => ({
  description: "", closingDateReference: CLOSING_DATE_CLUSTER_4, monthSign: "+", months: "",
  margin: false, marginType: CHOICE_ADMIN.contractMarginType.percentage,
  marginPercentage: "", marginFixedValue: "", comment: "", dirty: false,
});

/**
 * The panel form for a record (Edit) or a new contract (Add).
 *
 * SOURCE DEFECT (fixed): `locContractDevCoCostsCahnged` — set by every DevCo tick — is NEVER
 * reset (only set to `true`, in five places), so after the first tick on the screen Save's
 * "changed" test passes for every later panel, even one where nothing was touched. Here `dirty`
 * starts `false` every time the panel opens. (`locContractDevCoCostsDirty` IS reset by the Add,
 * Edit and Close handlers.)
 *
 * Sign: `If(Value('Month Difference') > 0, "+", "-")` for a record — so 0 shows "-" (it saves 0
 * either way).
 *
 * SOURCE DEFECT (fixed): the month TEXTBOX reads `If(Not(IsBlank(locSelectedBoPStandardContract.
 * 'BoP Projects Contracts')), Abs('Month Difference'))` — `'BoP Projects Contracts'` is the
 * one-to-many relationship to project contracts, not a column, so a standard contract no project
 * uses yet opens with an EMPTY month and Save greyed until it is retyped. Here the stored value
 * is always shown; `monthPrefillCanvasParity` keeps the canvas rule.
 */
export function toContractForm(contract: BopContract | null): ContractForm {
  if (!contract) return emptyContractForm();
  const months = contract.monthDifference ?? 0;
  return {
    description: contract.description ?? "",
    closingDateReference: contract.closingDateReference ?? CLOSING_DATE_CLUSTER_4,
    monthSign: months > 0 ? "+" : "−",
    months: contract.monthDifference === null ? "" : String(Math.abs(months)),
    margin: contract.margin === true,
    marginType: contract.marginType,
    marginPercentage: contract.marginPercentage === null ? "" : String(contract.marginPercentage),
    marginFixedValue: contract.marginFixedValue === null ? "" : String(contract.marginFixedValue),
    comment: contract.comment ?? "",
    dirty: false,
  };
}

/** The canvas month prefill: blank unless some project contract was built from this one. */
export function monthPrefillCanvasParity(contract: BopContract, hasProjectContracts: boolean): string {
  if (!hasProjectContracts || contract.monthDifference === null) return "";
  return String(Math.abs(contract.monthDifference));
}

/**
 * `rad_…_NewEdit_Margin.OnChange` — dirty, both values set to 0, both inputs reset (so they show
 * "0").
 */
export const changeMargin = (form: ContractForm, margin: boolean): ContractForm =>
  ({ ...form, margin, marginPercentage: "0", marginFixedValue: "0", dirty: true });

/** `rad_AddEdit_AdminContracts_RightPanel_MarginType.OnChange` — same reset to 0. */
export const changeMarginType = (form: ContractForm, marginType: number | null): ContractForm =>
  ({ ...form, marginType, marginPercentage: "0", marginFixedValue: "0", dirty: true });

/**
 * The Patch's `'Month Difference'`: `If(sign = "+", Value(month), Value(month) * -1)`.
 */
export function signedMonthDifference(sign: "+" | "−", months: string): number {
  const n = Number(String(months).trim());
  if (!Number.isFinite(n)) return 0;
  return sign === "−" ? -n : n;
}

/** `IsMatch(month, "^\d{1,2}$")` — one or two digits, unsigned. */
export const isValidMonthDifference = (months: string): boolean =>
  /^\d{1,2}$/.test(String(months));

/** `lbl_…_MonthDifference_ErrorMessage.Visible` — non-blank AND not matching. */
export const monthDifferenceErrorVisible = (months: string): boolean =>
  !isBlank(months) && !isValidMonthDifference(months);

/** `Text(100, "###,###0.0")`. */
const PERCENT_MAX_TEXT = "100.0";
/** `Text(locContractsCostsMax, "###,###0,00")`. */
const FIXED_MAX_TEXT = "1,000,000,000";

/**
 * `lbl_…_MarginPercentage_ErrorMessage` — `null` when the label is hidden. `Visible` requires a
 * NON-BLANK value, so the label's own `InputBlank` branch never shows; blank is caught by Save's
 * separate `Not(IsBlank(Trim(…)))` term.
 */
export function marginPercentageError(raw: string, language = "en-US"): string | null {
  if (isBlank(raw.trim())) return null;
  if (!isOneDecimal(raw, language)) return MSG.numericOneDecimals;
  if (!inRange(raw, 0, 100, language)) return MSG.outOfRange(PERCENT_MAX_TEXT);
  return null;
}

/** `lbl_…_MarginFixedValue_ErrorMessage` — the same shape, two decimals, 0 – 1,000,000,000. */
export function marginFixedValueError(raw: string, language = "en-US"): string | null {
  if (isBlank(raw.trim())) return null;
  if (!isTwoDecimal(raw, language)) return MSG.numericTwoDecimals;
  if (!inRange(raw, 0, CONTRACT_COSTS_MAX, language)) return MSG.outOfRange(FIXED_MAX_TEXT);
  return null;
}

/**
 * The Patch's margin columns: `'Margin Type'` only when Margin = Yes; `'Margin Percentage'` only
 * when Yes AND Percentage; `'Margin Fixed Value'` only when Yes AND Fixed Value; otherwise
 * `Blank()` (= `null`).
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
    if (isBlank(raw.trim())) return null;
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
 * `lbl_Add_Edit_AdminContracts_Description_ErrorMessage_1.Visible` — edit-only (see
 * `CLOSING_DATE_RULE_NOTE`).
 */
export const closingDateLabelVisible = (
  isEdit: boolean,
  closingDateReference: number | null,
): boolean => isEdit && closingDateReference === null;

/** Save's month term in the canvas: `Not(IsBlank(txt_…_MonthDifference_Month.Value))` only. */
export const monthDifferenceSaveTermCanvasParity = (months: string): boolean => !isBlank(months);

/**
 * SOURCE DEFECT (fixed): Save's month term is only `Not(IsBlank(…))` — the regex label is not in
 * the conjunction — so "abc" or "123" saves (`Value("abc")` writes a blank month difference).
 * Here the month must also match `^\d{1,2}$`.
 */
export const monthDifferenceSaveTerm = (months: string): boolean =>
  !isBlank(months) && isValidMonthDifference(months);

/**
 * `ico_AdminContracts_Save.DisplayMode`, term by term:
 *  - (dirty OR changed) AND `CountIf(Filter(col_Edit_DevCoCosts, Selected = true)) > 0`;
 *  - `Not(IsBlank(Trim(description)))`;
 *  - the closing-date label not visible;
 *  - Margin = Yes → `'Margin Type' = Percentage` ? (pct label hidden AND pct non-blank) :
 *    (fixed label hidden AND fixed non-blank) — any type other than Percentage, blank included,
 *    takes the Fixed branch;
 *  - closing date non-blank; month non-blank (and now valid, see above); margin non-blank.
 */
export function validateContract(
  form: ContractForm,
  args: { selectedCount: number; isEdit: boolean; language?: string },
): string[] {
  const errors: string[] = [];
  const lang = args.language ?? "en-US";

  if (!form.dirty) errors.push(MSG.notDirty);
  if (args.selectedCount === 0) errors.push(MSG.noAccountSelected);
  if (isBlank(form.description.trim())) errors.push(MSG.inputBlank);
  // The label term (edit-only) and the radio's own non-blank term reduce to one rule.
  if (form.closingDateReference === null) errors.push(MSG.closingDateEmpty);

  if (form.margin) {
    if (form.marginType === CHOICE_ADMIN.contractMarginType.percentage) {
      const e = marginPercentageError(form.marginPercentage, lang);
      if (e) errors.push(e);
      else if (isBlank(form.marginPercentage.trim())) errors.push(MSG.inputBlank);
    } else {
      const e = marginFixedValueError(form.marginFixedValue, lang);
      if (e) errors.push(e);
      else if (isBlank(form.marginFixedValue.trim())) errors.push(MSG.inputBlank);
    }
  }

  if (!monthDifferenceSaveTerm(form.months)) errors.push(MSG.monthDifference);
  return errors;
}

export const canSaveContract = (
  form: ContractForm,
  args: { selectedCount: number; isEdit: boolean; canEdit: boolean; language?: string },
): boolean => args.canEdit && validateContract(form, args).length === 0;

/** The number of level-3 accounts this contract will own. */
export const selectedAccountCount = (after: ReadonlyMap<string, AccountSelection>): number =>
  [...after.values()].filter((a) => a.selected && !a.used).length;

/* ═══════════════════════════════════════════════════════════ the DevCo reconcile ════ */

/**
 * Save's child steps, both scoped to the current contract:
 *   B. `RemoveIf(…, contract = varCurrentContractId && row in Filter(col_Edit_DevCoCosts,
 *      Selected = false && !IsBlank(ContractDevCo)).ContractDevCo)` — the released accounts;
 *   C. `Patch(…, ForAll(Filter(col_Edit_DevCoCosts, Selected && ContractDevCo = EmptyGUID &&
 *      Level = 3), …))` — the newly claimed accounts.
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

/** `Name: Text(locContractTypeBoPAssumption) & " - " & txt_…_Description.Value` — untrimmed. */
export const composeContractName = (contractType: number | null, description: string): string =>
  `${contractTypeLabel(contractType)} - ${description}`;

/**
 * The parent `Patch` — written on EVERY save, create or update: Name, Description, Country,
 * Technology, Closing Date Reference, signed Month Difference, Margin and its three columns,
 * Comment and Contract Types. The canvas writes no Owning Business Unit here (an admin table,
 * not project-scoped), so neither do we.
 */
export function buildContractPayload(
  form: ContractForm,
  args: { contractType: number | null; scope: ContractScope },
): Record<string, unknown> {
  const margin = marginFields(
    form.margin, form.marginType, form.marginPercentage, form.marginFixedValue,
  );
  const data: Record<string, unknown> = {
    [BOP_CONTRACT_COL.name]: composeContractName(args.contractType, form.description),
    [BOP_CONTRACT_COL.description]: form.description,
    [BOP_CONTRACT_COL.technology]: args.scope.technologyValue,
    [BOP_CONTRACT_COL.closingDateReference]: form.closingDateReference,
    [BOP_CONTRACT_COL.monthDifference]: signedMonthDifference(form.monthSign, form.months),
    [BOP_CONTRACT_COL.margin]: margin.margin,
    [BOP_CONTRACT_COL.marginType]: margin.marginType,
    [BOP_CONTRACT_COL.marginPercentage]: margin.marginPercentage,
    [BOP_CONTRACT_COL.marginFixedValue]: margin.marginFixedValue,
    [BOP_CONTRACT_COL.comment]: form.comment === "" ? null : form.comment,
    [BOP_CONTRACT_COL.contractTypes]: args.contractType,
  };
  if (args.scope.countryId) {
    data[`${BOP_LOOKUP.contractCountry}@odata.bind`] = `/${ES.countries}(${args.scope.countryId})`;
  }
  return data;
}

/**
 * A child create (step C): `{Name: $"{Nummer}-{Name}", 'BoP Contract Standard Assumption',
 * 'CAPEX Account', Country, Technology}`. RootCapexAccount is set by the
 * `DevCoCostRootCapexPlugin` plugin; no Owning Business Unit, as the canvas.
 * `contractRef` is the contract id, or `createdRowRef(0)` for a contract created in the same plan.
 */
export function buildDevCoCostPayload(args: {
  node: AccountNode;
  contractRef: string;
  scope: ContractScope;
}): Record<string, unknown> {
  const data: Record<string, unknown> = {
    [DEVCO_COST_COL.name]: `${args.node.number}-${args.node.name}`,
    [`${BOP_LOOKUP.contract}@odata.bind`]: `/${BOP_CONTRACT_ENTITY_SET}(${args.contractRef})`,
    [`${BOP_LOOKUP.capexAccount}@odata.bind`]: `/${ES_ADMIN.capexAccountLists}(${args.node.id})`,
    [DEVCO_COST_COL.technology]: args.scope.technologyValue,
  };
  if (args.scope.countryId) {
    data[`${BOP_LOOKUP.devCoCountry}@odata.bind`] = `/${ES.countries}(${args.scope.countryId})`;
  }
  return data;
}

/**
 * The save, in the canvas order: A. the parent create or update; B. the released children's
 * deletes; C. the new children's creates (bound to the parent — `createdRowRef(0)` when the
 * parent is created in the same plan). Not transactional (KNOWN-RISKS): a failure part-way is
 * reported with how many writes had run.
 */
export function planSaveContract(args: {
  form: ContractForm;
  contractType: number | null;
  scope: ContractScope;
  existing: BopContract | null;
  before: Map<string, AccountSelection>;
  after: Map<string, AccountSelection>;
  tree: AccountNode[];
  canEdit: boolean;
  language?: string;
}): WritePlan {
  if (!args.canEdit) return refuse(MSG.noPermission);
  const errors = validateContract(args.form, {
    selectedCount: selectedAccountCount(args.after), isEdit: args.existing !== null, language: args.language,
  });
  if (errors.length > 0) return refuse(errors[0]!);

  const plan = emptyPlan();
  const payload = buildContractPayload(args.form, { contractType: args.contractType, scope: args.scope });
  const label = contractTypeLabel(args.contractType);
  if (args.existing === null) {
    plan.writes.push({ op: "create", entitySet: BOP_CONTRACT_ENTITY_SET, data: payload, reason: `${label} created` });
  } else {
    plan.writes.push({
      op: "update", entitySet: BOP_CONTRACT_ENTITY_SET, id: args.existing.id, data: payload,
      reason: `${label} updated`,
    });
  }

  const { toDelete, toCreate } = reconcileDevCoCosts(args.before, args.after);
  for (const id of toDelete) {
    plan.writes.push({ op: "delete", entitySet: DEVCO_COST_ENTITY_SET, id, reason: "CAPEX account released by this contract" });
  }

  const contractRef = args.existing?.id ?? createdRowRef(0);
  const nodes = new Map(selectableNodes(args.tree).map((n) => [n.id, n]));
  for (const accountId of toCreate) {
    const node = nodes.get(accountId);
    if (!node) continue;
    plan.writes.push({
      op: "create", entitySet: DEVCO_COST_ENTITY_SET,
      data: buildDevCoCostPayload({ node, contractRef, scope: args.scope }),
      reason: `CAPEX account ${node.number} claimed by this contract`,
    });
  }

  plan.log.push(`${toCreate.length} account(s) claimed, ${toDelete.length} released.`);
  return plan;
}

/**
 * `cmp_PopUp_Confirmation_Delete_Contract_Or_Period_1.OnConfirm` — `Remove('BoP Contracts
 * Standard Assumptions', locSelectedBoPStandardContract)`: the PARENT only. The DevCo costs go
 * with it (`CascadeDelete = Cascade`), and the deletion plugin also removes the project rows
 * built from it — none of that is redone here.
 *
 * SOURCE DEFECT (fixed): the canvas `Remove` has no `IfError`, so a refused delete closed the
 * spinner as if it had worked. The failure is now shown (`WriteFeedback`).
 */
export function planDeleteContract(args: { contract: BopContract; canEdit: boolean }): WritePlan {
  if (!args.canEdit) return refuse(MSG.noPermission);
  const plan = emptyPlan();
  plan.writes.push({
    op: "delete", entitySet: BOP_CONTRACT_ENTITY_SET, id: args.contract.id,
    reason: `Contract “${args.contract.name ?? args.contract.id}” deleted`,
  });
  return plan;
}

/* ═════════════════════════════════════════════════════════ screen captions (canvas) ════ */

/**
 * The visible strings of the `Admin Contract Screen`, verbatim (CONVENTIONS rule 7). Option-set
 * labels come from the global `<optionset>` blocks in `customizations.xml`, which is what
 * `Text(<choice>)` renders.
 */
export const CONTRACT_SCREEN_TEXT = {
  /** `cmp_Admin_Contracts_Header.Project` → `Name: "Contracts"`. */
  title: "Contracts",
  /** `lbl_AdminContract_Selected_Country_Technology.Text` — `$"Contracts / {country} / {technology}"`. */
  scopeHeading: (country: string, technology: string) => `Contracts / ${country} / ${technology}`,
  /** `btn_AdminContract_Add_Development_Contract.Text`. */
  addDevelopment: "Add Development Contract",
  /** `btn_AdminContract_Add_Construction_Contract.Text`. */
  addConstruction: "Add Construction Contract",
  /** `btn_Edit_AdminContracts.Text`, `btn_Delete_AdminContracts.Text`. */
  edit: "Edit",
  delete: "Delete",
  /** The card info grids: `lbl_Description_Heading`, `lbl_ClosingDateReference_Heading`, … */
  description: "Description",
  closingDateReference: "Closing Date Reference",
  margin: "Margin",
  marginType: "Margin Type",
  /** `lbl_MarginFixedValuePercentage_Heading.Text` / `lbl_Add_Edit_AdminContracts_Margin_Percentage.Text`. */
  marginPercentage: "Margin [%]",
  /** `lbl_Add_Edit_AdminContracts_MarginFixedValue.Text` — `"Margin Fixed Value [" & currency & "]"`. */
  marginFixedValue: (currency: string) => `Margin Fixed Value [${currency}]`,
  /**
   * `lbl_ClosingDateReference_Value.Text` — `ref & " " & Switch(true, n < 0, "- ", n >= 0, "+ ",
   * "+ ") & Abs(n) & " months"`.
   */
  closingDateValue: (reference: string, monthDifference: number) =>
    `${reference} ${monthDifference < 0 ? "- " : "+ "}${Math.abs(monthDifference)} months`,
  /** `lbl_DevCoCostFrom_Heading.Text`. */
  devCoCostsFrom: "DevCo Costs From",
  /** `htmlDevCoCostTagList` — each group header is `AccountName & " :"`. */
  devCoGroupHeading: (rootAccountName: string) => `${rootAccountName} :`,
  /** `lbl_Comment_Heading.Text`; `lbl_Comment_Value.Text` shows "-" when blank. */
  comments: "Comments",
  blankComment: "-",
  /** `lbl_Add_Edit_AdminContracts_Header.Text` — `If(IsBlank(sel), "New ", "Edit ") & Text(type)`. */
  panelTitle: (isEdit: boolean, typeLabel: string) => `${isEdit ? "Edit " : "New "}${typeLabel}`,
  /** `lbl_Add_Edit_AdminContracts_MonthDifference.Text`. */
  monthDifference: "Month Difference",
  /** `drp_Add_Edit_AdminContracts_MonthDifference_AddSub.Items`. */
  monthSigns: ["+", "-"] as readonly string[],
  /** `lbl_Add_Edit_AdminContracts_Comments.Text`; counter `$"{Len(Trim(value))}/50"`. */
  comment: "Comment",
  commentMax: 50,
  /** `txt_Add_Edit_AdminContracts_Description.MaxLength`. */
  descriptionMax: 256,
  /** `txt_…_MarginPercentage.MaxLength` / `txt_…_MarginFixedValue.MaxLength`. */
  marginMax: 130,
  /** `lbl_Add_Edit_AdminContracts_DevCoCostForm.Text`. */
  devCoCostForm: "DevCo Cost Form",
  /** `ico_AdminContracts_Save.Text`, `ico_AdminContracts_Cancel.Text`, the dialog's buttons. */
  save: "Save",
  cancel: "Cancel",
  confirm: "Confirm",
  /** `cmp_PopUp_Confirmation_Delete_Contract_Or_Period_1.Title` / `.Description`. */
  deleteTitle: "Delete BoP Standard Contract",
  deleteDescription: (name: string) =>
    `Are you sure that you want to permanently delete "${name}" contract?`,
} as const;

/** `Closing Date Reference` option set (`vsb_closingdatereference`) — the radio's `Choices(...)`. */
export const CLOSING_DATE_REFERENCE_OPTIONS: readonly { value: number; label: string }[] = [
  { value: CLOSING_DATE_CLUSTER_4, label: "Cluster 4" },
  { value: 952850001, label: "FID" },
  { value: 952850002, label: "Cluster 5" },
];

/** `Margin (BoP Contracts Standard Assumptions)` two-option set — the radio's `Choices(...)`. */
export const MARGIN_OPTIONS = { yes: "Yes", no: "No" } as const;

/** `Contract Margin Type` option set (`vsb_contractmargintype`) — the radio's `Choices(...)`. */
export const MARGIN_TYPE_OPTIONS: readonly { value: number; label: string }[] = [
  { value: CHOICE_ADMIN.contractMarginType.percentage, label: "Percentage" },
  { value: CHOICE_ADMIN.contractMarginType.fixedValue, label: "Fixed Value" },
];

export const optionLabel = (options: readonly { value: number; label: string }[], value: number | null): string =>
  options.find((o) => o.value === value)?.label ?? "";

/**
 * The currency in the PANEL's Margin Fixed Value caption — `lbl_Add_Edit_AdminContracts_MarginFixedValue.Text`:
 * `If(SelectedCountry.Name = "Poland", "PLN", "EUR")`.
 */
export const marginCurrency = (countryName: string | null): string =>
  countryName === "Poland" ? "PLN" : "EUR";
