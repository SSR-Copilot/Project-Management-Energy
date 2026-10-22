/**
 * Contracts standard assumptions (canvas `Admin Contract Screen`) — every pure rule.
 *
 * Nothing here touches Dataverse or React. Citations are `ACS:<line>` into
 * `ProjectDocs/_extracted/msapp/projectmanagement/Src/Admin Contract Screen.pa.yaml`, or the
 * canvas `Control.Property` the rule or string comes from.
 *
 * SERVER AUTOMATION (`04-flow-inventory.md`): a DevCo-cost create sets `vsb_rootcapexaccount`
 * through the `DevCoCostRootCapexPlugin` plugin, so neither the canvas nor this app writes it; a
 * contract delete runs `VSB.BoPContractAssumptionDeletion` and the DevCo costs cascade. No flow
 * fires (`SynchronizeStandardAssumptionCosts` is only called from commented-out Apply code).
 *
 * HIDDEN CONTROLS: `btn_Add_Edit_AdminContracts_Reset` (Select()-ed by Edit and Save) = the panel
 * form rebuilt by `initialForm` on every open; `btnGeneralPurposeReset` = query invalidation after
 * a write (`hooks.ts`); `fn_Numeric_AdminContracts` = `@/domain/numberInput`. The hidden
 * `chb_Add_Edit_AdminContract_Right_Panel_DevCoCostForm_Costs` (`Visible: false`) and the debug
 * label `lbl_Contracts_RightPanel_NewEdit_CostssRow_Info_Hidden` are not ported.
 *
 * SOURCE DEFECTs fixed (each marked where the rule lives):
 *  - Save accepts a non-numeric month (`validateForm`);
 *  - the DevCo dirty flag `locContractDevCoCostsCahnged` is never reset (`isDirty`);
 *  - the month prefill reads a relationship, not the column (`initialForm`, re-export below);
 *  - a failed delete is silent — `Remove` has no `IfError` (`messages.ts`, `deleteErrorMessage`).
 */
import {
  checkDecimalInput, formatFixed, inRangeInput, isMaxDecimals,
} from "@/domain/numberInput";
import { scopeBreadcrumb } from "@/domain/countryPicker";
import { isDirty as formChanged } from "@/domain/form";
import { powerFxTrim } from "@/domain/powerFx";
import { technologyOptionLabel } from "@/domain/technology";
import {
  CLOSING_REF, CONTRACT_TYPE, CONTRACT_TYPE_LABEL, MARGIN_TYPE, decimalSeparator,
  type ContractForm, type DevCoRow, type StandardContract,
} from "@/domain/contractStandards";

/* ════════════════════════════════════════════════════ choice constants ══ */

/*
 * The choice constants, domain shapes, locale-number helpers, the initial form and the save
 * payload / DevCo diff rules are shared with the data layer (`data/adminContract.ts`), so they
 * live in `@/domain/contractStandards` and are RE-EXPORTED here (CONVENTIONS rule 17: one
 * definition). Option VALUES, never labels — the generated option-set maps carry pac identifiers.
 *
 * `initialForm` (the panel's prefill):
 * SOURCE DEFECT (fixed): `txt_Add_Edit_AdminContracts_MonthDifference_Month.Default` reads
 * `If(Not(IsBlank(locSelectedBoPStandardContract.'BoP Projects Contracts')), Abs('Month
 * Difference'))` — `'BoP Projects Contracts'` is the one-to-many relationship to project
 * contracts, not a column, so a contract no project uses yet opens with an EMPTY month. Here the
 * stored month is always shown.
 * DIVERGENCE: `drp_Add_Edit_AdminContracts_MonthDifference_AddSub.DefaultSelectedItems` is
 * `If(Value('Month Difference') > 0, "+", "-")`, so a stored 0 shows "-"; here 0 shows "+" (the
 * saved value is 0 either way).
 */
export {
  TECHNOLOGY, CONTRACT_TYPE, CLOSING_REF, MARGIN_TYPE, CONTRACT_TYPE_LABEL,
  decimalSeparator, parseLocaleNumber, formatLocaleNumber, initialForm,
  buildParentPayload, planDevCoDiff, findOwnershipConflicts,
} from "@/domain/contractStandards";
export type {
  StandardContract, DevCoRow, ContractForm, ParentPayload,
} from "@/domain/contractStandards";

/**
 * `rad_Contracts_RightPanel_NewEdit_CostsUntilClosingDate.Items = Choices('Closing Date Reference')`
 * — the option-set labels and order (ACS:2222-2254), verbatim.
 */
export const CLOSING_REF_OPTIONS: readonly { value: number; label: string }[] = [
  { value: CLOSING_REF.Cluster4, label: "Cluster 4" },
  { value: CLOSING_REF.FID, label: "FID" },
  { value: CLOSING_REF.Cluster5, label: "Cluster 5" },
];

/**
 * `rad_AddEdit_AdminContracts_RightPanel_MarginType.Items = Choices('Contract Margin Type')` and
 * `lbl_MarginType_Value.Text = Text(ThisItem.'Margin Type')` — the option-set labels, verbatim.
 */
export const MARGIN_TYPE_LABEL: Record<number, string> = {
  [MARGIN_TYPE.Percentage]: "Percentage",
  [MARGIN_TYPE.FixedValue]: "Fixed Value",
};

/**
 * `rad_Add_Edit_AdminContracts_RightPanel_NewEdit_Margin.Items =
 * Choices('Margin (BoP Contracts Standard Assumptions)')` and `lbl_Margin_Value.Text =
 * ThisItem.Margin` — the two-option labels, verbatim. `value` is the radio value in the panel.
 */
export const MARGIN_LABEL = { yes: "Yes", no: "No" } as const;
export const MARGIN_CHOICES: readonly { value: "yes" | "no"; label: string }[] = [
  { value: "yes", label: MARGIN_LABEL.yes },
  { value: "no", label: MARGIN_LABEL.no },
];

/** `drp_Add_Edit_AdminContracts_MonthDifference_AddSub.Items = ["+","-"]` — verbatim. */
export const MONTH_SIGNS = ["+", "-"] as const;

/** The card and panel captions, verbatim (CONVENTIONS rule 7). */
export const CARD_TEXT = {
  /** `btn_Edit_AdminContracts.Text` — verbatim. */
  edit: "Edit",
  /** `btn_Delete_AdminContracts.Text` — verbatim. */
  delete: "Delete",
  /** `lbl_Description_Heading.Text` / `lbl_Add_Edit_AdminContracts_Description.Text` — verbatim. */
  description: "Description",
  /** `lbl_ClosingDateReference_Heading.Text` / `lbl_Add_Edit_AdminContracts_CDF.Text` — verbatim. */
  closingDateReference: "Closing Date Reference",
  /** `lbl_Add_Edit_AdminContracts_MonthDifference.Text` — verbatim. */
  monthDifference: "Month Difference",
  /** `lbl_Margin_Heading.Text` / `lbl_Add_Edit_AdminContracts_Margin.Text` — verbatim. */
  margin: "Margin",
  /**
   * `lbl_MarginType_Heading.Text` — verbatim. DIVERGENCE: the panel also captions the
   * `rad_AddEdit_AdminContracts_RightPanel_MarginType` radio with it; the canvas panel radio has
   * no caption.
   */
  marginType: "Margin Type",
  /** `lbl_Add_Edit_AdminContracts_Margin_Percentage.Text` — verbatim. */
  marginPercentage: "Margin [%]",
  /** `lbl_DevCoCostFrom_Heading.Text` — verbatim. */
  devCoCostsFrom: "DevCo Costs From",
  /** `lbl_Comment_Heading.Text` — verbatim. */
  comments: "Comments",
  /** `lbl_Add_Edit_AdminContracts_Comments.Text` — verbatim. */
  comment: "Comment",
  /** `lbl_Add_Edit_AdminContracts_DevCoCostForm.Text` — verbatim. */
  devCoCostForm: "DevCo Cost Form",
  /** `btn_AdminContract_Add_Development_Contract.Text` — verbatim. */
  addDevelopment: "Add Development Contract",
  /** `btn_AdminContract_Add_Construction_Contract.Text` — verbatim. */
  addConstruction: "Add Construction Contract",
  /** `cmp_PopUp_Confirmation_Delete_Contract_Or_Period_1.Title` — verbatim. */
  deleteTitle: "Delete BoP Standard Contract",
  /** `cmp_PopUp_Confirmation_Delete_Contract_Or_Period_1.ConfirmButtonText` — verbatim. */
  deleteConfirm: "Confirm",
  /** `ico_AdminContracts_Save.OnChange` → `locContractSpinnerInformationText` — verbatim. */
  saving: "Please wait, saving...",
  /** `cmp_PopUp_Confirmation_Delete_Contract_Or_Period_1.OnConfirm` → `locContractSpinnerInformationText` — verbatim. */
  deleting: "Please wait, deleting...",
} as const;

/* ═════════════════════════════════════════════════════════ picker ══ */

/*
 * The picker (`cmp_AdminContraacts_NestedCountryPickerColumn`) model is shared:
 * `@/domain/countryPicker` holds the six-country allow-list
 * (`pickerCountries(rows, CONTRACT_COUNTRY_RULE)`: exact name match, canvas order, ISO-2 badge),
 * `parseSelectionParams` / `sameCountryTechnology` and `CONTRACT_DEFAULT` (`{kind:"first"}` — the
 * first listed country with its first technology, PO requirement of 2026-10-17, which replaced
 * the earlier "no selection" start; the default is display-only, so the URL stays clean until the
 * first pick); `@/domain/technology` holds `CONTRACT_TECHNOLOGIES` (Wind, PV, BESS — the
 * component's `Nestings` on this screen).
 *
 * DIVERGENCE: the canvas picker keeps its selection in component state; here it lives in the URL
 * (`?country&tech`, browser history), and only ACTIVE countries are listed.
 */

/** `lbl_AdminContract_Selected_Country_Technology.Text` — `$"Contracts / {country} / {technology}"` (ACS:565). */
export function breadcrumbText(countryName: string | undefined, technology: number | undefined): string {
  return scopeBreadcrumb("Contracts", countryName, technology === undefined ? undefined : technologyOptionLabel(technology));
}

/* ══════════════════════════════════════════════════════════════ domain shapes ══ */

/* `StandardContract` and `DevCoRow` come from `@/domain/contractStandards` (re-exported above). */

/**
 * Inactive standard contracts are listed and count toward the limit of 10 (canvas
 * parity), but the project Contracts reader filters them out, so they never seed a project.
 * DIVERGENCE: the card shows an "Inactive" badge so that difference is visible (the canvas
 * shows inactive rows unmarked).
 */
export const INCLUDE_INACTIVE_STANDARD_CONTRACTS = true;
export const STATE_INACTIVE = 1;

export function isInactive(contract: Pick<StandardContract, "stateCode">): boolean {
  return contract.stateCode === STATE_INACTIVE;
}

/** A `vsb_capexaccountlists` row — structurally `AccountRow` from the project Contracts feature. */
export interface CapexAccount {
  id: string;
  number: string;
  name: string;
  order?: number;
  parentId?: string;
}

/* ═════════════════════════════════════════════════════════════ limits ══ */

export const CONTRACT_LIMIT = 10;

/**
 * `locDevContractLimitExceeded` / `locConstructionContractLimitExceeded` (`CountIf(…) >= 10`,
 * `OnVisible` and `btnGeneralPurposeReset`). Counts the server rows for the selection; inactive
 * rows count too (canvas parity).
 */
export function limitFlags(contracts: readonly StandardContract[]) {
  const development = contracts.filter((c) => c.contractType === CONTRACT_TYPE.Development).length;
  const construction = contracts.filter((c) => c.contractType === CONTRACT_TYPE.Construction).length;
  return {
    development,
    construction,
    developmentFull: development >= CONTRACT_LIMIT,
    constructionFull: construction >= CONTRACT_LIMIT,
  };
}

/**
 * `btn_AdminContract_Add_Development_Contract.OnSelect` / `btn_AdminContract_Add_Construction_Contract.OnSelect`
 * `Notify("Maximum 10 development contracts allowed for " & country & " - " & technology)` —
 * verbatim (ACS:584, 606).
 * DIVERGENCE: in the canvas the Notify is unreachable (the button is `DisplayMode.Disabled` at the
 * limit first). Here the button at the limit stays focusable and shows this text as its tooltip.
 */
export function limitMessage(contractType: number, countryName: string, technology: number): string {
  const kind = contractType === CONTRACT_TYPE.Development ? "development" : "construction";
  return `Maximum ${CONTRACT_LIMIT} ${kind} contracts allowed for ${countryName} - ${technologyOptionLabel(technology)}`;
}

/**
 * `gal_AdminContracts_StandardAssumptions_Updated.Items` — `SortByColumns(…, "vsb_contracttypes",
 * Ascending, "vsb_name", Ascending)`: type ascending (numeric: Development before Construction),
 * then name (ACS:818-830).
 */
export function sortContracts(contracts: readonly StandardContract[]): StandardContract[] {
  return [...contracts].sort((a, b) =>
    (a.contractType ?? 0) - (b.contractType ?? 0) || a.name.localeCompare(b.name));
}

/* ════════════════════════════════════════════════════════ card text ══ */

/**
 * The text of a closing-reference choice, as `ThisItem.'Closing Date Reference'` concatenates it
 * (ACS:1386): the choice's own label. A known code uses its option label; a code this app does not
 * know (a new option added to `vsb_closingdatereference`) uses Dataverse's formatted label when it
 * was sent, otherwise `""` — never a placeholder such as `"-"`, which the canvas never shows
 * (canvas parity).
 */
export function closingRefLabel(code: number | undefined, formatted?: string): string {
  return CLOSING_REF_OPTIONS.find((o) => o.value === code)?.label ?? formatted ?? "";
}

/**
 * `lbl_ClosingDateReference_Value.Text` — `ThisItem.'Closing Date Reference' & " " &
 * Switch(true, n < 0, "- ", n >= 0, "+ ") & Abs(n) & " months"` (ACS:1386-1393), verbatim:
 * `<label> <sign> <abs> months`. A blank reference (legacy rows) concatenates as "", so the canvas
 * renders `" + 0 months"`. An unknown code renders its choice label (`formatted`), never
 * `"- + n months"`.
 */
export function formatClosingRef(
  closingRef: number | null | undefined, monthDifference: number | null | undefined, formatted?: string,
): string {
  const months = monthDifference ?? 0;
  const label = closingRef === undefined || closingRef === null ? "" : closingRefLabel(closingRef, formatted);
  return `${label} ${months < 0 ? "-" : "+"} ${Math.abs(months)} months`;
}

/**
 * ISO currency of the selected country, default EUR — `lbl_MarginFixedValuePercentage_Heading.Text`:
 * `If(Not(IsBlank(SelectedCountry.'ISO Currency Code')), 'ISO Currency Code', "EUR")`.
 * DIVERGENCE: the PANEL caption `lbl_Add_Edit_AdminContracts_MarginFixedValue.Text` uses
 * `If(SelectedCountry.Name = "Poland", "PLN", "EUR")`; here the panel uses this same ISO-code rule
 * as the card.
 */
export function currencyOf(isoCurrencyCode: string | undefined): string {
  return isoCurrencyCode?.trim() || "EUR";
}

/**
 * `lbl_MarginFixedValuePercentage_Heading.Text` (card) and
 * `lbl_Add_Edit_AdminContracts_MarginFixedValue.Text` / `lbl_Add_Edit_AdminContracts_Margin_Percentage.Text`
 * (panel): `"Margin Fixed Value [" & currency & "]"` or `"Margin [%]"` — verbatim.
 */
export function marginValueHeading(marginType: number | undefined, currency: string): string {
  return marginType === MARGIN_TYPE.FixedValue ? `Margin Fixed Value [${currency}]` : "Margin [%]";
}

/**
 * `lbl_MarginFixedValuePercentage_Value.Text` — `Value(ThisItem.'Margin Fixed Value')` or
 * `Value(ThisItem.'Margin Percentage')`.
 * DIVERGENCE: the canvas shows the raw number; here it is locale-formatted with grouping and at
 * most two decimals, and a blank value shows "-".
 */
export function marginValue(contract: StandardContract, locale?: string): string {
  const value = contract.marginType === MARGIN_TYPE.FixedValue
    ? contract.marginFixedValue : contract.marginPercentage;
  if (value === undefined || value === null) return "-";
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);
}

/** `lbl_Comment_Value.Text` — `If(IsBlank(ThisItem.Comment), "-", Text(ThisItem.Comment))`, verbatim. */
export function commentText(comment: string | undefined): string {
  return comment && comment.trim() !== "" ? comment : "-";
}

/* ═══════════════════════════════════════════════════════ CAPEX tree ══ */

export interface TreeLeaf {
  id: string; number: string; name: string; order?: number;
  level: 3; rootId: string; parentId: string;
}

export interface TreeRoot {
  id: string; number: string; name: string; order?: number;
  level: 1; rootId: string; childCount: number; children: TreeLeaf[];
}

export interface AccountTree {
  roots: TreeRoot[];
  /** Every Level-3 account, by id. */
  leaves: Map<string, TreeLeaf>;
  /** Every CAPEX account read, by id — used to name DevCo rows. */
  accounts: Map<string, CapexAccount>;
}

const ROOT_PARENT_NUMBER = "00001";
const EXCLUDED_ROOT_NUMBER = "10006";

const byOrderThenNumber = (a: { order?: number; number: string }, b: { order?: number; number: string }) =>
  (a.order ?? Number.POSITIVE_INFINITY) - (b.order ?? Number.POSITIVE_INFINITY) ||
  a.number.localeCompare(b.number);

/**
 * The canvas 3-level tree (`OnVisible`, ACS:134-273): Level 1 = children of the account numbered
 * `00001` except `10006`; Level 2 = their children; Level 3 = THEIR children. The DevCo Cost Form
 * (`gal_Add_Edit_AdminContracts_Right_Panel_DevCoCostForm.Items = Sort(Filter(col_Edit_DevCoCosts,
 * Level = 1), Order)`) lists the Level-1 roots, each with its Level-3 descendants flat
 * (`gal_Contracts_RightPanel_NewEdit_Costs`, sorted by number). Only Level 3 is shown and linked
 * (canvas parity); deeper accounts are ignored, as in the canvas.
 */
export function buildAccountTree(rows: readonly CapexAccount[]): AccountTree {
  const accounts = new Map(rows.map((r) => [r.id, r]));
  const childrenOf = new Map<string, CapexAccount[]>();
  for (const row of rows) {
    if (!row.parentId) continue;
    const list = childrenOf.get(row.parentId) ?? [];
    list.push(row);
    childrenOf.set(row.parentId, list);
  }

  const leaves = new Map<string, TreeLeaf>();
  const roots: TreeRoot[] = [];
  for (const row of rows) {
    const parent = row.parentId ? accounts.get(row.parentId) : undefined;
    if (!parent || parent.number !== ROOT_PARENT_NUMBER || row.number === EXCLUDED_ROOT_NUMBER) continue;
    const children: TreeLeaf[] = [];
    for (const level2 of childrenOf.get(row.id) ?? []) {
      for (const level3 of childrenOf.get(level2.id) ?? []) {
        const leaf: TreeLeaf = {
          id: level3.id, number: level3.number, name: level3.name, order: level3.order,
          level: 3, rootId: row.id, parentId: level2.id,
        };
        children.push(leaf);
        leaves.set(leaf.id, leaf);
      }
    }
    children.sort((a, b) => a.number.localeCompare(b.number));
    roots.push({
      id: row.id, number: row.number, name: row.name, order: row.order,
      level: 1, rootId: row.id, childCount: children.length, children,
    });
  }
  roots.sort(byOrderThenNumber);
  return { roots, leaves, accounts };
}

/* ═════════════════════════════════════════════════ ownership ══ */

export interface AccountClass {
  /** Linked to the contract being edited. */
  selected: boolean;
  /** Linked to ANOTHER contract of the same country/technology — locked. */
  used: boolean;
  usedBy?: string;
  /** This contract's existing child row for the account. */
  existingChildId?: string;
}

/**
 * Classifies every linked account of the selection, as `btn_Edit_AdminContracts.OnSelect` /
 * `btn_AdminContract_Add_*.OnSelect` do over the scope's DevCo costs: `Selected` = linked to the
 * contract being edited, `Used` = linked to a different contract. With no `currentContractId` (a
 * new contract) every linked account is `used`. If legacy data links one account to this AND
 * another contract, this contract's own link wins (selected, not locked) so a save never
 * deletes it behind the user's back.
 */
export function classifyAccounts(
  devCoRows: readonly DevCoRow[], currentContractId?: string,
): Map<string, AccountClass> {
  const out = new Map<string, AccountClass>();
  for (const row of devCoRows) {
    const entry = out.get(row.accountId) ?? { selected: false, used: false };
    if (currentContractId && row.contractId === currentContractId) {
      entry.selected = true;
      entry.used = false;
      entry.usedBy = undefined;
      entry.existingChildId = row.id;
    } else if (!entry.selected) {
      entry.used = true;
      entry.usedBy = row.contractId;
    }
    out.set(row.accountId, entry);
  }
  return out;
}

/* ═════════════════════════════════════════════════════ tri-state ══ */

export interface RootState {
  checked: boolean | "mixed";
  disabled: boolean;
  available: string[];
  /** Used by another contract but still in this form's selection — can only be removed. */
  stale: string[];
}

/**
 * An account another contract owns that is still in this form's selection (e.g. it was linked
 * elsewhere while the panel was open). It may be unchecked, never re-checked.
 */
export function isStaleSelection(
  accountId: string, selected: ReadonlySet<string>, classes: ReadonlyMap<string, AccountClass>,
): boolean {
  return classes.get(accountId)?.used === true && selected.has(accountId);
}

/**
 * `img_Parent_TriState_Checkbox.Image` / `.DisplayMode` (ACS:3607-3677). Checked only when every
 * child is selected by THIS contract; mixed when some are, or all available ones are while others
 * are used elsewhere; disabled when none is available (and none is a stale selection to remove).
 * A fully-used root shows checked-and-disabled, as the used children do (the canvas LOCKED image).
 */
export function rootState(
  root: TreeRoot, selected: ReadonlySet<string>, classes: ReadonlyMap<string, AccountClass>,
): RootState {
  const available = root.children.filter((c) => !classes.get(c.id)?.used).map((c) => c.id);
  const stale = root.children.filter((c) => isStaleSelection(c.id, selected, classes)).map((c) => c.id);
  const selectedCount = available.filter((id) => selected.has(id)).length;
  if (available.length === 0) {
    return { checked: root.children.length > 0, disabled: stale.length === 0, available, stale };
  }
  if (selectedCount === 0 && stale.length === 0) return { checked: false, disabled: false, available, stale };
  if (selectedCount === root.children.length) return { checked: true, disabled: false, available, stale };
  return { checked: "mixed", disabled: false, available, stale };
}

/**
 * `img_Parent_TriState_Checkbox.OnSelect` (`btn_Parent_TriState_Overlay`, ACS:3636): selects every
 * available child when none is selected, otherwise clears them. Clearing also drops stale
 * selections; used accounts are never added.
 */
export function toggleRoot(
  root: TreeRoot, selected: ReadonlySet<string>, classes: ReadonlyMap<string, AccountClass>,
): Set<string> {
  const { available, stale } = rootState(root, selected, classes);
  const next = new Set(selected);
  const anySelected = stale.length > 0 || available.some((id) => next.has(id));
  for (const id of available) {
    if (anySelected) next.delete(id);
    else next.add(id);
  }
  if (anySelected) for (const id of stale) next.delete(id);
  return next;
}

/**
 * `chb_Contracts_RightPanel_NewEdit_CostssRow.OnCheck` / `OnUncheck`. A used account
 * (`DisplayMode.View` in the canvas) can never be added, only removed if still selected.
 */
export function toggleLeaf(
  accountId: string, selected: ReadonlySet<string>, classes: ReadonlyMap<string, AccountClass>,
): Set<string> {
  const next = new Set(selected);
  if (classes.get(accountId)?.used) {
    next.delete(accountId);
    return next;
  }
  if (next.has(accountId)) next.delete(accountId);
  else next.add(accountId);
  return next;
}

/**
 * The form without the given accounts — the recovery after a save-time ownership conflict.
 * DIVERGENCE: the canvas Save has no ownership re-check; this app re-reads the links before
 * writing and drops accounts another contract claimed meanwhile (see `messages.ts`).
 */
export function withoutAccounts(form: ContractForm, accountIds: readonly string[]): ContractForm {
  const drop = new Set(accountIds);
  return { ...form, selectedAccountIds: form.selectedAccountIds.filter((id) => !drop.has(id)) };
}

/* ══════════════════════════════════════════════════════ DevCo tags ══ */

/** Root ranking by NAME (ACS:1707-1720), canvas parity (ranking by `vsb_order` is an open question). */
const ROOT_RANK: Record<string, number> = {
  "Wind Turbine / Panels": 1,
  "Development Expenses": 2,
  "Construction Expenses": 3,
  "Substation / Grid Connection": 4,
  "Other CAPEX": 5,
};
export const OTHER_RANK = 99;

export interface TagGroup {
  rootId: string;
  rootName: string;
  rank: number;
  tags: { id: string; label: string }[];
}

/**
 * `htmlDevCoCostTagList` — a contract's child rows grouped by root account
 * (`RootCapexAccount.Name`), each group headed `AccountName & " :"`, ordered by `ROOT_RANK`.
 * A row whose root is null (the plugin did not run) goes under "Other" with rank 99 — neither
 * dropped nor a crash.
 * DIVERGENCE: the canvas sorts by rank only (equal ranks keep first-appearance order) and lists
 * the tags in source order; here equal ranks sort by account order, then name, and tags by
 * account number.
 */
export function groupDevCoTags(rows: readonly DevCoRow[], accounts: ReadonlyMap<string, CapexAccount>): TagGroup[] {
  const groups = new Map<string, TagGroup & { order: number; sortKeys: string[] }>();
  for (const row of rows) {
    const root = row.rootAccountId ? accounts.get(row.rootAccountId) : undefined;
    const rootKey = row.rootAccountId ?? "";
    const rootName = root?.name ?? (row.rootAccountId ? row.rootLabel ?? "Other" : "Other");
    const group = groups.get(rootKey) ?? {
      rootId: rootKey, rootName,
      rank: row.rootAccountId ? ROOT_RANK[rootName] ?? OTHER_RANK : OTHER_RANK,
      order: root?.order ?? Number.POSITIVE_INFINITY, tags: [], sortKeys: [],
    };
    const account = accounts.get(row.accountId);
    group.tags.push({ id: row.id, label: account?.name ?? row.accountLabel ?? "Unknown account" });
    group.sortKeys.push(account?.number ?? "");
    groups.set(rootKey, group);
  }
  return [...groups.values()]
    .sort((a, b) => a.rank - b.rank || a.order - b.order || a.rootName.localeCompare(b.rootName))
    .map(({ rootId, rootName, rank, tags, sortKeys }) => {
      const sorted = tags
        .map((t, i) => ({ t, k: sortKeys[i] ?? "" }))
        .sort((x, y) => x.k.localeCompare(y.k))
        .map((x) => x.t);
      return { rootId, rootName, rank, tags: sorted };
    });
}

/* ═════════════════════════════════════════════ numbers (fn_Numeric) ══ */

/*
 * `fn_Numeric_AdminContracts` (the `fn_Numeric` component). The helpers are shared
 * (`@/domain/numberInput`); these one-line bindings only set Contracts' configuration: the
 * UI-language separator rule (`"language"`: `.` for an `en-*` language, `,` otherwise —
 * `Components/fn_Numeric.pa.yaml`:167-265), no sign and no trailing separator, `-0` normalised
 * to `0`.
 */

/* `decimalSeparator`, `parseLocaleNumber`, `formatLocaleNumber`: `@/domain/contractStandards`. */

/** `fn_Numeric.IsOneDecimal` / `IsTwoDecimal`: digits, then optionally the separator and 1..`n` decimals. */
export function isNDecimal(text: string, n: number, lang: string): boolean {
  return isMaxDecimals(text, { places: n, separator: decimalSeparator(lang) });
}

/** `fn_Numeric.InRange(value, min, max)`. */
export function inRange(text: string, min: number, max: number, lang: string): boolean {
  return inRangeInput(text, min, max, decimalSeparator(lang));
}

/**
 * The maximum in a range message, in the user's locale with the field's decimals: "100.0" /
 * "1,000,000,000.00". DIVERGENCE: the canvas renders `Text(100, "###,###0.0")` and
 * `Text(locContractsCostsMax, "###,###0,00")` with the app language; here the number is
 * formatted with `Intl` in the user's locale, with exactly the field's decimals.
 */
export const formatMax = formatFixed;

/** `Text(100, …)` in `lbl_Add_Edit_AdminContracts_MarginPercentage_ErrorMessage` — the percentage ceiling. */
export const MARGIN_PERCENT_MAX = 100;
/** `locContractsCostsMax: 1000000000` — the fixed-value ceiling. */
export const MARGIN_FIXED_MAX = 1_000_000_000;

/* ═══════════════════════════════════════════════════════════ the form ══ */

/** `txt_Add_Edit_AdminContracts_Description.MaxLength`. */
export const DESCRIPTION_MAX = 256;
/** `txt_Add_Edit_AdminContracts_Comments.MaxLength`; the counter's `/50`. */
export const COMMENT_MAX = 50;

/**
 * `lbl_Contracts_RightPanel_NewEdit_PaymentTarget_Note_Details_1.Text` —
 * `$"{Len(Trim(txt_Add_Edit_AdminContracts_Comments.Value))}/50"` (ACS:3011): the length after
 * Power Fx `Trim` — ends trimmed AND inner runs of spaces collapsed to one.
 */
export function commentCounter(comment: string): string {
  return `${powerFxTrim(comment).length}/${COMMENT_MAX}`;
}

/* `ContractForm` and `initialForm`: `@/domain/contractStandards`. */

export const MSG = {
  /** `gblAppResx.InputBlank` (`App.pa.yaml`) — verbatim. */
  inputBlank: "Input must not be blank",
  /** `gblAppResx.NumericOneDecimals` (`App.pa.yaml`) — verbatim. */
  oneDecimal: "Numeric value with maximum of one decimals",
  /** `gblAppResx.NumericTwoDecimals` (`App.pa.yaml`) — verbatim. */
  twoDecimals: "Numeric value with maximum of two decimals",
  /**
   * `lbl_Add_Edit_AdminContracts_Description_ErrorMessage_1.Text` — verbatim. Despite its name this
   * label is the CLOSING-DATE validator; `lbl_Add_Edit_AdminContracts_Description_ErrorMessage`
   * (no `_1`) is dead (its `Text` is commented out), so there is no description check beyond
   * "not blank".
   */
  closingRefBlank: "The Contract Closing Date cannot be empty.",
  /** `lbl_Add_Edit_AdminContracts_MonthDifference_ErrorMessage.Text` — verbatim. */
  monthFormat: "Only whole numbers with up to two digits are allowed.",
  /**
   * NEW — no canvas equivalent: the canvas only greys Save while the Margin radio is blank
   * (`Not(IsBlank(rad_Add_Edit_AdminContracts_RightPanel_NewEdit_Margin.Selected.Value))`).
   */
  marginBlank: "Select whether the contract has a margin.",
  /** NEW — no canvas equivalent: Save is greyed while no margin type is chosen. */
  marginTypeBlank: "Select a margin type.",
  /**
   * NEW — no canvas equivalent: Save's `CountIf(Filter(col_Edit_DevCoCosts, Selected = true)) > 0`
   * term greys the button without a message.
   */
  accountsNone: "Select at least one DevCo cost account.",
  /**
   * The range branch of `lbl_Add_Edit_AdminContracts_MarginPercentage_ErrorMessage.Text` /
   * `lbl_Add_Edit_AdminContracts_MarginFixedValue_ErrorMessage.Text` —
   * `$"Please select a value between 0 and {Text(max, fmt)}"`, verbatim (see `formatMax` for the
   * number).
   */
  range: (max: number, decimals: number, locale?: string) =>
    `Please select a value between 0 and ${formatMax(max, decimals, locale)}`,
} as const;

export interface FormErrors {
  description?: string;
  closingRef?: string;
  month?: string;
  margin?: string;
  marginType?: string;
  marginPercentage?: string;
  marginFixed?: string;
  accounts?: string;
}

const MONTH_PATTERN = /^\d{1,2}$/;

/**
 * One margin input through the shared `checkDecimalInput` (UI-language separator, no sign, no
 * trailing separator). A malformed number and one with too many decimals both get the
 * `IsOneDecimal` / `IsTwoDecimal` message, as the canvas' single check did.
 */
function marginError(text: string, maxDecimals: 1 | 2, max: number, lang: string, locale?: string): string | undefined {
  const check = checkDecimalInput(text, { maxDecimals, separator: "language", lang, min: 0, max });
  switch (check.kind) {
    case "blank": return MSG.inputBlank;
    case "format":
    case "decimals": return maxDecimals === 1 ? MSG.oneDecimal : MSG.twoDecimals;
    case "range": return MSG.range(max, maxDecimals, locale);
    default: return undefined;
  }
}

/** The month: blank, else digits only (one or two) — `IsMatch(month, "^\d{1,2}$")`. */
function monthError(text: string, lang: string): string | undefined {
  const check = checkDecimalInput(text, { maxDecimals: 0, separator: "language", lang, digitsOnly: MONTH_PATTERN });
  if (check.kind === "blank") return MSG.inputBlank;
  return check.kind === "ok" ? undefined : MSG.monthFormat;
}

/** The Level-3 accounts shown in the tree — `AccountTree.leaves` satisfies it. */
export interface VisibleAccounts { has(accountId: string): boolean }

/**
 * CAPEX accounts are read active-only, so a link to an inactive (or
 * otherwise out-of-tree) account is in `selectedAccountIds` but nowhere in the tree. Such hidden
 * links must NOT satisfy the "at least one account" rule — only selections the user can see count.
 * They stay in the selection, so a save never deletes them (`planDevCoDiff` keeps them).
 * Without `visible` every selection counts (the tree is not known yet).
 */
export function visibleSelectionCount(selectedAccountIds: readonly string[], visible?: VisibleAccounts): number {
  return visible ? selectedAccountIds.filter((id) => visible.has(id)).length : selectedAccountIds.length;
}

/**
 * Every validation rule of the screen — the terms of `ico_AdminContracts_Save.DisplayMode` plus
 * the error labels' texts: description not blank, a closing reference, a one- or two-digit month,
 * a margin choice, a valid margin value for the chosen type, and at least one Level-3 account.
 * `visible`: the tree's Level-3 accounts; hidden links do not count toward ≥ 1 account.
 *
 * SOURCE DEFECT (fixed): Save's month term is only
 * `Not(IsBlank(txt_Add_Edit_AdminContracts_MonthDifference_Month.Value))` — the regex label is not
 * in the conjunction — so "abc" or "123" saves (`Value("abc")` writes a blank month). Here the
 * month must also match `^\d{1,2}$`.
 * DIVERGENCE: the canvas error labels are `Visible` only for a NON-blank invalid value (blank only
 * greys Save), and there is no description label at all. Here a blank description, month or margin
 * value also returns `MSG.inputBlank`, which the panel shows once the field was touched.
 * DIVERGENCE: the canvas shows the closing-date message only when editing
 * (`Not(IsBlank(locSelectedBoPStandardContract))`); here it applies to new contracts too.
 */
export function validateForm(form: ContractForm, lang: string, locale?: string, visible?: VisibleAccounts): FormErrors {
  const errors: FormErrors = {};
  if (form.description.trim() === "") errors.description = MSG.inputBlank;
  if (form.closingRef === null) errors.closingRef = MSG.closingRefBlank;
  const month = monthError(form.monthText, lang);
  if (month) errors.month = month;
  if (form.margin === null) errors.margin = MSG.marginBlank;
  if (form.margin === true) {
    if (form.marginType === MARGIN_TYPE.Percentage) {
      const e = marginError(form.marginPercentageText, 1, MARGIN_PERCENT_MAX, lang, locale);
      if (e) errors.marginPercentage = e;
    } else if (form.marginType === MARGIN_TYPE.FixedValue) {
      const e = marginError(form.marginFixedText, 2, MARGIN_FIXED_MAX, lang, locale);
      if (e) errors.marginFixed = e;
    } else {
      errors.marginType = MSG.marginTypeBlank;
    }
  }
  if (visibleSelectionCount(form.selectedAccountIds, visible) === 0) errors.accounts = MSG.accountsNone;
  return errors;
}

/** Comparable form values; margin texts that are hidden do not make a form dirty. */
function normalized(form: ContractForm): ContractForm {
  return {
    ...form,
    description: form.description,
    marginType: form.margin ? form.marginType : null,
    marginPercentageText: form.margin && form.marginType === MARGIN_TYPE.Percentage ? form.marginPercentageText : "",
    marginFixedText: form.margin && form.marginType === MARGIN_TYPE.FixedValue ? form.marginFixedText : "",
    selectedAccountIds: [...form.selectedAccountIds].sort(),
  };
}

/**
 * A real diff against the loaded values: reverting a change makes it clean again. The shared
 * `isDirty` (`@/domain/form`) over Contracts' normaliser.
 *
 * SOURCE DEFECT (fixed): the canvas Save's "changed" term is `locContractDevCoCostsDirty Or
 * locContractDevCoCostsCahnged`, and `locContractDevCoCostsCahnged` — set by every DevCo tick — is
 * never reset, so after the first tick on the screen Save's "changed" test passes for every later
 * panel, even an untouched one. Here every panel starts clean.
 */
export function isDirty(form: ContractForm, initial: ContractForm): boolean {
  return formChanged(form, initial, normalized);
}

/**
 * `ico_AdminContracts_Save.DisplayMode`: dirty, at least one Level-3 account, and every field
 * valid. `linksAvailable` is false when the DevCo link table cannot be read — the "≥ 1 account"
 * rule then cannot be met. `visible`: only accounts shown in the tree count toward that rule.
 * `forceDirty`: a retry after a partial save (no canvas equivalent).
 */
export function canSave(args: {
  form: ContractForm; initial: ContractForm; errors: FormErrors;
  linksAvailable: boolean; forceDirty?: boolean; visible?: VisibleAccounts;
}): boolean {
  const { form, initial, errors, linksAvailable, forceDirty, visible } = args;
  if (!linksAvailable) return false;
  if (!forceDirty && !isDirty(form, initial)) return false;
  if (visibleSelectionCount(form.selectedAccountIds, visible) === 0) return false;
  return Object.values(errors).every((e) => !e);
}

/**
 * `rad_Add_Edit_AdminContracts_RightPanel_NewEdit_Margin.OnChange` /
 * `rad_AddEdit_AdminContracts_RightPanel_MarginType.OnChange` (ACS:2873-2930) reset both margin
 * inputs. DIVERGENCE: the canvas resets them to 0 (the inputs then show "0"); here they are
 * cleared to "".
 */
export function withMargin(form: ContractForm, margin: boolean): ContractForm {
  return { ...form, margin, marginPercentageText: "", marginFixedText: "" };
}
export function withMarginType(form: ContractForm, marginType: number): ContractForm {
  return { ...form, marginType, marginPercentageText: "", marginFixedText: "" };
}

/* ══════════════════════════════════════════════════════ save payloads ══ */

/* `ParentPayload`, `buildParentPayload`, `planDevCoDiff`, `findOwnershipConflicts`: `@/domain/contractStandards`. */

/**
 * `lbl_Add_Edit_AdminContracts_Header.Text` — `If(IsBlank(locSelectedBoPStandardContract), "New ",
 * "Edit ") & Text(locContractTypeBoPAssumption)`, verbatim. `isNew` is fixed when the panel opens:
 * a new contract keeps its "New …" title until a save fully succeeds, even after a partial save
 * created the parent.
 */
export function panelTitle(isNew: boolean, contractType: number): string {
  return `${isNew ? "New" : "Edit"} ${CONTRACT_TYPE_LABEL[contractType] ?? ""}`;
}

/* ═══════════════════════════════════════════ closing the panel ══ */

export type ClosePrompt = "none" | "discard" | "incomplete";

/**
 * What closing the panel must ask first. After a partial save (`linksIncomplete`: the parent was
 * written but its DevCo links were not all saved) the user is warned that a contract exists with
 * incomplete links — that wins over the plain "Discard changes?" prompt.
 * DIVERGENCE: the canvas closes the panel (`ico_AdminContracts_Cancel`, `ico_Add_Edit_AdminContracts_Close`)
 * without asking; these prompts and their texts (below) have no canvas equivalent.
 */
export function closePrompt(args: { dirty: boolean; linksIncomplete: boolean }): ClosePrompt {
  if (args.linksIncomplete) return "incomplete";
  return args.dirty ? "discard" : "none";
}

export interface CloseDialogText { title: string; description: string; confirmText: string; cancelText: string }

/** `fromScopeChange`: the country/technology changed (back/forward, URL) while the panel was open. */
export function closeDialogText(kind: Exclude<ClosePrompt, "none">, fromScopeChange: boolean): CloseDialogText {
  const scopeLead = fromScopeChange ? "The country or technology changed while this contract was open. " : "";
  if (kind === "incomplete") {
    return {
      title: "DevCo accounts incomplete",
      description: `${scopeLead}The contract was saved, but its DevCo accounts are incomplete. ` +
        "Close anyway, or keep editing and select Save to retry?",
      confirmText: "Close anyway",
      cancelText: "Keep editing",
    };
  }
  return fromScopeChange
    ? {
      title: "Discard changes?",
      description: `${scopeLead}Discard your unsaved changes to it, or keep editing?`,
      confirmText: "Discard",
      cancelText: "Keep editing",
    }
    : {
      title: "Discard changes?",
      description: "You have unsaved changes to this contract. Do you want to discard them?",
      confirmText: "Discard",
      cancelText: "Keep editing",
    };
}

/** NEW — no canvas equivalent: the toast after closing a partly saved contract. */
export const INCOMPLETE_CLOSED_WARNING =
  "The contract was saved, but its DevCo accounts are incomplete. Edit it to finish linking them.";

/**
 * `cmp_PopUp_Confirmation_Delete_Contract_Or_Period_1.Description` — `"Are you sure that you want
 * to permanently delete """ & locSelectedBoPStandardContract.Name & """ contract?"`, verbatim.
 */
export function deleteDescription(name: string): string {
  return `Are you sure that you want to permanently delete "${name}" contract?`;
}
