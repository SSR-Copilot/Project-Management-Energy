/**
 * Contracts standard assumptions (canvas `Admin Contract Screen`) — every pure rule.
 *
 * Nothing here touches Dataverse or React. Citations are `ACS:<line>` into
 * `_extracted/msapp/projectmanagement/Src/Admin Contract Screen.pa.yaml`; requirement ids
 * (FR-n / DR-n / D-n) are from
 * `codeapp-knowledge-base/screens/application-settings/contracts/06-code-app-requirements/`.
 */
import {
  Vsb_bopcontractsstandardassumptionsesvsb_closingdatereference as ClosingRefMap,
  Vsb_bopcontractsstandardassumptionsesvsb_contracttypes as ContractTypeMap,
  Vsb_bopcontractsstandardassumptionsesvsb_margintype as MarginTypeMap,
  Vsb_bopcontractsstandardassumptionsesvsb_technology as TechnologyMap,
} from "@/generated/models/Vsb_bopcontractsstandardassumptionsesModel";
import {
  checkDecimalInput, decimalSeparatorFor, formatEditValue, formatFixed, inRangeInput, isMaxDecimals, parseDecimalInput,
} from "@/domain/numberInput";
import { scopeBreadcrumb } from "@/domain/countryPicker";
import { isDirty as formChanged } from "@/domain/form";
import { powerFxTrim } from "@/domain/powerFx";
import { technologyOptionLabel } from "@/domain/technology";

/* ════════════════════════════════════════════════════ choice constants (DR-11) ══ */

/*
 * Option VALUES, never labels. These used to be looked up in the generated choice maps by their
 * generated identifier ("DevelopmentContract", "Cluster4", "FixedValue"); the `pa` CLI 1.2.0
 * regeneration (SDK 1.5.0) put the real Dataverse display labels in those maps ("Development
 * Contract", "Cluster 4", "Fixed Value"), so the lookup threw at import time and every module
 * importing this file failed to load. The option values are what Dataverse stores and are stable;
 * `optionValue` only asserts that the value still exists in the generated model, so a removed
 * option still fails loudly while a relabelled one does not.
 */
function optionValue(map: Record<number, string>, value: number): number {
  if (!(value in map)) throw new Error(`Choice value ${value} is missing from the generated model`);
  return value;
}

/**
 * The Contracts table's technology codes, by name (the picker itself uses `CONTRACT_TECHNOLOGIES`
 * from `@/domain/technology`, whose test checks the same codes). Labels: `technologyOptionLabel`.
 */
export const TECHNOLOGY = {
  Wind: optionValue(TechnologyMap, 952850000),
  PV: optionValue(TechnologyMap, 952850001),
  BESS: optionValue(TechnologyMap, 952850003),
} as const;

export const CONTRACT_TYPE = {
  Development: optionValue(ContractTypeMap, 952850001),
  Construction: optionValue(ContractTypeMap, 952850002),
} as const;

export const CLOSING_REF = {
  Cluster4: optionValue(ClosingRefMap, 952850000),
  FID: optionValue(ClosingRefMap, 952850001),
  Cluster5: optionValue(ClosingRefMap, 952850002),
} as const;

export const MARGIN_TYPE = {
  Percentage: optionValue(MarginTypeMap, 952850000),
  FixedValue: optionValue(MarginTypeMap, 952850001),
} as const;

/**
 * `vsb_applyandapplyalltracking.vsb_action` and `vsb_typeofcontract` BoP. Kept for the record
 * (DR-11); Apply / Apply to All is NOT built (decision D-01, see the build log), so nothing
 * reads them yet. No generated model exists for that table.
 */
export const APPLY_ACTION = { Apply: 952850000, ApplyAll: 952850001 } as const;
export const TYPE_OF_CONTRACT_BOP = 128470001;

/** Choice labels of `vsb_contracttypes` — the panel title and the `vsb_name` prefix. */
export const CONTRACT_TYPE_LABEL: Record<number, string> = {
  [CONTRACT_TYPE.Development]: "Development Contract",
  [CONTRACT_TYPE.Construction]: "Construction Contract",
};

/** Option-set order (ACS:2222-2254). */
export const CLOSING_REF_OPTIONS: readonly { value: number; label: string }[] = [
  { value: CLOSING_REF.Cluster4, label: "Cluster 4" },
  { value: CLOSING_REF.FID, label: "FID" },
  { value: CLOSING_REF.Cluster5, label: "Cluster 5" },
];

export const MARGIN_TYPE_LABEL: Record<number, string> = {
  [MARGIN_TYPE.Percentage]: "Percentage",
  [MARGIN_TYPE.FixedValue]: "Fixed Value",
};

/* ═════════════════════════════════════════════════════════ picker (FR-2, D-20) ══ */

/*
 * The picker model is shared (batch 2b, M6): `@/domain/countryPicker` holds the six-country
 * allow-list (`pickerCountries(rows, CONTRACT_COUNTRY_RULE)`: exact name match, canvas order,
 * ISO-2 badge), `parseSelectionParams` / `sameCountryTechnology` (B-2) and `CONTRACT_DEFAULT`
 * (none, D-29); `@/domain/technology` holds `CONTRACT_TECHNOLOGIES` (Wind, PV, BESS).
 */

/** `Contracts / <Country> / <Technology>` (FR-3, ACS:565). */
export function breadcrumbText(countryName: string | undefined, technology: number | undefined): string {
  return scopeBreadcrumb("Contracts", countryName, technology === undefined ? undefined : technologyOptionLabel(technology));
}

/* ══════════════════════════════════════════════════════════════ domain shapes ══ */

export interface StandardContract {
  id: string;
  name: string;
  description: string;
  countryId?: string;
  technology?: number;
  contractType?: number;
  closingRef?: number;
  /** Dataverse's formatted label of `vsb_closingdatereference`, when sent (parity round 2, NG-4). */
  closingRefText?: string;
  monthDifference?: number;
  margin: boolean;
  marginType?: number;
  marginPercentage?: number;
  marginFixedValue?: number;
  comment?: string;
  /** 0 Active / 1 Inactive. Inactive rows are listed and counted, as the canvas did (D-12). */
  stateCode?: number;
}

/**
 * D-12 / DR-2: inactive standard contracts are listed and count toward the limit of 10 (canvas
 * parity), but the project Contracts reader filters them out, so they never seed a project.
 * The card shows an "Inactive" badge so that difference is visible (G-5).
 */
export const INCLUDE_INACTIVE_STANDARD_CONTRACTS = true;
export const STATE_INACTIVE = 1;

export function isInactive(contract: Pick<StandardContract, "stateCode">): boolean {
  return contract.stateCode === STATE_INACTIVE;
}

/** One `vsb_bopcontractsstandardassumptiondevcocosts` row. */
export interface DevCoRow {
  id: string;
  contractId: string;
  accountId: string;
  /** Set by the server plugin `DevCoCostRootCapexPlugin`; never written by this app. */
  rootAccountId?: string;
  /** Formatted value of the account lookup, when Dataverse sends it. */
  accountLabel?: string;
  rootLabel?: string;
}

/** A `vsb_capexaccountlists` row — structurally `AccountRow` from the project Contracts feature. */
export interface CapexAccount {
  id: string;
  number: string;
  name: string;
  order?: number;
  parentId?: string;
}

/* ═════════════════════════════════════════════════════════════ limits (FR-8) ══ */

export const CONTRACT_LIMIT = 10;

/** Counts the server rows for the selection; inactive rows count too (D-12, canvas parity). */
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

/** The tooltip on a disabled Add button; also the canvas' unreachable warning text (ACS:584, 606). */
export function limitMessage(contractType: number, countryName: string, technology: number): string {
  const kind = contractType === CONTRACT_TYPE.Development ? "development" : "construction";
  return `Maximum ${CONTRACT_LIMIT} ${kind} contracts allowed for ${countryName} - ${technologyOptionLabel(technology)}`;
}

/** Type ascending (numeric: Development before Construction), then name (FR-4, ACS:818-830). */
export function sortContracts(contracts: readonly StandardContract[]): StandardContract[] {
  return [...contracts].sort((a, b) =>
    (a.contractType ?? 0) - (b.contractType ?? 0) || a.name.localeCompare(b.name));
}

/* ════════════════════════════════════════════════════════ card text (FR-6) ══ */

/**
 * The text of a closing-reference choice, as `ThisItem.'Closing Date Reference'` concatenates it
 * (ACS:1386): the choice's own label. A known code uses its option label; a code this app does not
 * know (a new option added to `vsb_closingdatereference`) uses Dataverse's formatted label when it
 * was sent, otherwise `""` — never a placeholder such as `"-"`, which the canvas never shows
 * (parity round 2, NG-4).
 */
export function closingRefLabel(code: number | undefined, formatted?: string): string {
  return CLOSING_REF_OPTIONS.find((o) => o.value === code)?.label ?? formatted ?? "";
}

/**
 * `<label> <sign> <abs> months`; `"- "` below zero, `"+ "` otherwise (ACS:1386-1393).
 * Canvas: `ThisItem.'Closing Date Reference' & " " & Switch(...) & Abs(...) & " months"` — a blank reference
 * (legacy rows) concatenates as "", so the canvas renders `" + 0 months"`; parity round 1, Gap 3.
 * An unknown code renders its choice label (`formatted`), never `"- + n months"` (round 2, NG-4).
 */
export function formatClosingRef(
  closingRef: number | null | undefined, monthDifference: number | null | undefined, formatted?: string,
): string {
  const months = monthDifference ?? 0;
  const label = closingRef === undefined || closingRef === null ? "" : closingRefLabel(closingRef, formatted);
  return `${label} ${months < 0 ? "-" : "+"} ${Math.abs(months)} months`;
}

/** ISO currency of the selected country, default EUR — the card AND the panel (D-11). */
export function currencyOf(isoCurrencyCode: string | undefined): string {
  return isoCurrencyCode?.trim() || "EUR";
}

export function marginValueHeading(marginType: number | undefined, currency: string): string {
  return marginType === MARGIN_TYPE.FixedValue ? `Margin Fixed Value [${currency}]` : "Margin [%]";
}

export function marginValue(contract: StandardContract, locale?: string): string {
  const value = contract.marginType === MARGIN_TYPE.FixedValue
    ? contract.marginFixedValue : contract.marginPercentage;
  if (value === undefined || value === null) return "-";
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);
}

export function commentText(comment: string | undefined): string {
  return comment && comment.trim() !== "" ? comment : "-";
}

/* ═══════════════════════════════════════════════════════ CAPEX tree (DR-6) ══ */

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
  /** Every CAPEX account read, by id — used to name DevCo rows (DR-5). */
  accounts: Map<string, CapexAccount>;
}

const ROOT_PARENT_NUMBER = "00001";
const EXCLUDED_ROOT_NUMBER = "10006";

const byOrderThenNumber = (a: { order?: number; number: string }, b: { order?: number; number: string }) =>
  (a.order ?? Number.POSITIVE_INFINITY) - (b.order ?? Number.POSITIVE_INFINITY) ||
  a.number.localeCompare(b.number);

/**
 * The canvas 3-level tree (ACS:134-273): Level 1 = children of the account numbered `00001`
 * except `10006`; Level 2 = their children; Level 3 = THEIR children. Only Level 3 is shown and
 * linked (D-15, parity); deeper accounts are ignored, as in the canvas.
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

/* ═════════════════════════════════════════════════ ownership (DR-7, FR-15) ══ */

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
 * Classifies every linked account of the selection. With no `currentContractId` (a new
 * contract) every linked account is `used`. If legacy data links one account to this AND
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

/* ═════════════════════════════════════════════════════ tri-state (FR-14) ══ */

export interface RootState {
  checked: boolean | "mixed";
  disabled: boolean;
  available: string[];
  /** Used by another contract but still in this form's selection — can only be removed (B-1). */
  stale: string[];
}

/**
 * An account another contract owns that is still in this form's selection (e.g. it was linked
 * elsewhere while the panel was open). It may be unchecked, never re-checked (B-1, FR-15).
 */
export function isStaleSelection(
  accountId: string, selected: ReadonlySet<string>, classes: ReadonlyMap<string, AccountClass>,
): boolean {
  return classes.get(accountId)?.used === true && selected.has(accountId);
}

/**
 * ACS:3607-3677. Checked only when every child is selected by THIS contract; mixed when some
 * are, or all available ones are while others are used elsewhere; disabled when none is
 * available (and none is a stale selection to remove). A fully-used root shows
 * checked-and-disabled, as the used children do.
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
 * Selects every available child when none is selected, otherwise clears them (ACS:3636).
 * Clearing also drops stale selections (B-1); used accounts are never added.
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

/** A child toggle; a used account can never be added, only removed if still selected (FR-15, B-1). */
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

/** The form without the given accounts — the B-1 recovery after a save-time ownership conflict. */
export function withoutAccounts(form: ContractForm, accountIds: readonly string[]): ContractForm {
  const drop = new Set(accountIds);
  return { ...form, selectedAccountIds: form.selectedAccountIds.filter((id) => !drop.has(id)) };
}

/* ══════════════════════════════════════════════════════ DevCo tags (FR-7) ══ */

/** Root ranking by NAME (ACS:1707-1720), canvas parity; D-26 (rank by `vsb_order`) is open. */
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
 * Groups a contract's child rows by root account. A row whose root is null (the plugin did not
 * run) goes under "Other" with rank 99 — neither dropped nor a crash (DR-5).
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

/* ═════════════════════════════════════════════ numbers (fn_Numeric, FR-13) ══ */

/*
 * The helpers are shared (`@/domain/numberInput`, M10, batch 2b). These one-line bindings only fix
 * Contracts' configuration: the UI-language separator rule (`"language"`: `.` for an `en-*`
 * language, `,` otherwise — fn_Numeric:167-265; open decision 5.2-5), no sign and no trailing
 * separator (B-7), `-0` normalised to `0`.
 */

/** `.` for an `en-*` UI language, `,` otherwise (fn_Numeric:167-265). */
export function decimalSeparator(lang: string): "." | "," {
  return decimalSeparatorFor(lang, "language");
}

/** `IsOneDecimal` / `IsTwoDecimal`: digits, then optionally the separator and 1..`n` decimals. */
export function isNDecimal(text: string, n: number, lang: string): boolean {
  return isMaxDecimals(text, { places: n, separator: decimalSeparator(lang) });
}

export function parseLocaleNumber(text: string, lang: string): number | undefined {
  return parseDecimalInput(text, decimalSeparator(lang));
}

export function inRange(text: string, min: number, max: number, lang: string): boolean {
  return inRangeInput(text, min, max, decimalSeparator(lang));
}

/** A number into the field's locale text, for pre-filling an edit (FR-13). */
export function formatLocaleNumber(value: number | undefined, lang: string): string {
  return formatEditValue(value, decimalSeparator(lang));
}

/** The maximum in the user's locale with the field's decimals: "100.0" / "1,000,000,000.00" (D-30). */
export const formatMax = formatFixed;

export const MARGIN_PERCENT_MAX = 100;
export const MARGIN_FIXED_MAX = 1_000_000_000;

/* ═══════════════════════════════════════════════════════════ the form ══ */

export const DESCRIPTION_MAX = 256;
export const COMMENT_MAX = 50;

/**
 * Comment counter `"{Len(Trim(v))}/50"` (ACS:3011; parity round 1 Gap 4, round 2 NG-2): the length
 * after Power Fx `Trim` — ends trimmed AND inner runs of spaces collapsed to one.
 */
export function commentCounter(comment: string): string {
  return `${powerFxTrim(comment).length}/${COMMENT_MAX}`;
}

export interface ContractForm {
  description: string;
  closingRef: number | null;
  monthSign: "+" | "-";
  monthText: string;
  margin: boolean | null;
  marginType: number | null;
  marginPercentageText: string;
  marginFixedText: string;
  comment: string;
  /** Level-3 accounts linked to this contract, sorted. */
  selectedAccountIds: string[];
}

/**
 * New-mode defaults (FR-8) or the record's values (FR-10..13). A stored month of 0 shows `+`
 * (D-28); edit mode is decided by the record, not by a relationship (D-07).
 */
export function initialForm(
  contract: StandardContract | undefined, selectedAccountIds: readonly string[], lang: string,
): ContractForm {
  if (!contract) {
    return {
      description: "", closingRef: CLOSING_REF.Cluster4, monthSign: "+", monthText: "",
      margin: false, marginType: MARGIN_TYPE.Percentage,
      marginPercentageText: "", marginFixedText: "", comment: "",
      selectedAccountIds: [...selectedAccountIds].sort(),
    };
  }
  const months = contract.monthDifference;
  return {
    description: contract.description ?? "",
    closingRef: contract.closingRef ?? CLOSING_REF.Cluster4,
    monthSign: months !== undefined && months < 0 ? "-" : "+",
    monthText: months === undefined || months === null ? "" : String(Math.abs(months)),
    margin: contract.margin,
    marginType: contract.marginType ?? MARGIN_TYPE.Percentage,
    marginPercentageText: formatLocaleNumber(contract.marginPercentage, lang),
    marginFixedText: formatLocaleNumber(contract.marginFixedValue, lang),
    comment: contract.comment ?? "",
    selectedAccountIds: [...selectedAccountIds].sort(),
  };
}

export const MSG = {
  inputBlank: "Input must not be blank",
  oneDecimal: "Numeric value with maximum of one decimals",
  twoDecimals: "Numeric value with maximum of two decimals",
  closingRefBlank: "The Contract Closing Date cannot be empty.",
  monthFormat: "Only whole numbers with up to two digits are allowed.",
  marginBlank: "Select whether the contract has a margin.",
  marginTypeBlank: "Select a margin type.",
  accountsNone: "Select at least one DevCo cost account.",
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

/** The month: blank, else digits only (one or two; D-04). */
function monthError(text: string, lang: string): string | undefined {
  const check = checkDecimalInput(text, { maxDecimals: 0, separator: "language", lang, digitsOnly: MONTH_PATTERN });
  if (check.kind === "blank") return MSG.inputBlank;
  return check.kind === "ok" ? undefined : MSG.monthFormat;
}

/** The Level-3 accounts shown in the tree — `AccountTree.leaves` satisfies it. */
export interface VisibleAccounts { has(accountId: string): boolean }

/**
 * Parity round 2, NG-5. CAPEX accounts are read active-only, so a link to an inactive (or
 * otherwise out-of-tree) account is in `selectedAccountIds` but nowhere in the tree. Such hidden
 * links must NOT satisfy the "at least one account" rule — only selections the user can see count.
 * They stay in the selection, so a save never deletes them (`planDevCoDiff` keeps them).
 * Without `visible` every selection counts (the tree is not known yet).
 */
export function visibleSelectionCount(selectedAccountIds: readonly string[], visible?: VisibleAccounts): number {
  return visible ? selectedAccountIds.filter((id) => visible.has(id)).length : selectedAccountIds.length;
}

/**
 * Every rule of `03-behaviour/03-validations.md`, with D-04 (month) and D-25 (Level-3) fixed.
 * `visible`: the tree's Level-3 accounts; hidden links do not count toward ≥ 1 account (NG-5).
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
 * A real diff against the loaded values (D-06, D-31): reverting a change makes it clean again.
 * The shared `isDirty` (H7) over Contracts' normaliser.
 */
export function isDirty(form: ContractForm, initial: ContractForm): boolean {
  return formChanged(form, initial, normalized);
}

/**
 * FR-16: dirty, at least one Level-3 account, and every field valid. `linksAvailable` is false
 * when the DevCo link table cannot be read — the "≥ 1 account" rule then cannot be met.
 * `visible`: only accounts shown in the tree count toward that rule (parity round 2, NG-5).
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

/** Changing Margin or Margin Type clears both margin inputs (ACS:2873-2930). */
export function withMargin(form: ContractForm, margin: boolean): ContractForm {
  return { ...form, margin, marginPercentageText: "", marginFixedText: "" };
}
export function withMarginType(form: ContractForm, marginType: number): ContractForm {
  return { ...form, marginType, marginPercentageText: "", marginFixedText: "" };
}

/* ══════════════════════════════════════════════════════ save payloads (DR-8) ══ */

export interface ParentPayload {
  vsb_name: string;
  vsb_description: string;
  "vsb_Country@odata.bind": string;
  vsb_technology: number;
  vsb_closingdatereference: number | null;
  vsb_monthdifference: number;
  vsb_margin: boolean;
  vsb_margintype: number | null;
  vsb_marginpercentage: number | null;
  vsb_marginfixedvalue: number | null;
  vsb_comment: string | null;
  vsb_contracttypes: number;
}

/**
 * The parent write. `vsb_name` is re-derived on every save, so changing the description
 * renames the contract (parity). Margin = No nulls the type and both values; only the value
 * matching the type is written (ACS:3884-3921).
 */
export function buildParentPayload(form: ContractForm, ctx: {
  contractType: number; countryId: string; technology: number; lang: string;
}): ParentPayload {
  const description = form.description.trim();
  const months = Number(form.monthText);
  const signed = form.monthSign === "-" && months !== 0 ? -months : months;
  const margin = form.margin === true;
  const isPct = margin && form.marginType === MARGIN_TYPE.Percentage;
  const isFixed = margin && form.marginType === MARGIN_TYPE.FixedValue;
  return {
    vsb_name: `${CONTRACT_TYPE_LABEL[ctx.contractType] ?? ""} - ${description}`,
    vsb_description: description,
    "vsb_Country@odata.bind": `/vsb_countries(${ctx.countryId})`,
    vsb_technology: ctx.technology,
    vsb_closingdatereference: form.closingRef,
    vsb_monthdifference: signed,
    vsb_margin: margin,
    vsb_margintype: margin ? form.marginType : null,
    vsb_marginpercentage: isPct ? parseLocaleNumber(form.marginPercentageText, ctx.lang) ?? null : null,
    vsb_marginfixedvalue: isFixed ? parseLocaleNumber(form.marginFixedText, ctx.lang) ?? null : null,
    vsb_comment: form.comment.trim() === "" ? null : form.comment,
    vsb_contracttypes: ctx.contractType,
  };
}

/** Existing children of THIS contract minus the selection go; the selection minus them comes. */
export function planDevCoDiff(ownChildren: readonly DevCoRow[], selectedAccountIds: readonly string[]) {
  const selected = new Set(selectedAccountIds);
  const existing = new Set(ownChildren.map((r) => r.accountId));
  return {
    toDelete: ownChildren.filter((r) => !selected.has(r.accountId)).map((r) => r.id),
    toCreate: selectedAccountIds.filter((id) => !existing.has(id)),
  };
}

/** Newly selected accounts that another contract of the scope now owns (D-23 re-check). */
export function findOwnershipConflicts(
  scope: readonly DevCoRow[], contractId: string | undefined, selectedAccountIds: readonly string[],
): string[] {
  const selected = new Set(selectedAccountIds);
  const ownedHere = new Set(scope.filter((r) => contractId && r.contractId === contractId).map((r) => r.accountId));
  const conflicts = new Set<string>();
  for (const row of scope) {
    if (selected.has(row.accountId) && row.contractId !== contractId && !ownedHere.has(row.accountId)) {
      conflicts.add(row.accountId);
    }
  }
  return [...conflicts];
}

/**
 * `isNew` is fixed when the panel opens: a new contract keeps its "New …" title until a save
 * fully succeeds, even after a partial save created the parent (B-3).
 */
export function panelTitle(isNew: boolean, contractType: number): string {
  return `${isNew ? "New" : "Edit"} ${CONTRACT_TYPE_LABEL[contractType] ?? ""}`;
}

/* ═══════════════════════════════════════════ closing the panel (B-2, B-3) ══ */

export type ClosePrompt = "none" | "discard" | "incomplete";

/**
 * What closing the panel must ask first. After a partial save (`linksIncomplete`: the parent was
 * written but its DevCo links were not all saved) the user is warned that a contract exists with
 * incomplete links (B-3) — that wins over the plain "Discard changes?" prompt.
 */
export function closePrompt(args: { dirty: boolean; linksIncomplete: boolean }): ClosePrompt {
  if (args.linksIncomplete) return "incomplete";
  return args.dirty ? "discard" : "none";
}

export interface CloseDialogText { title: string; description: string; confirmText: string; cancelText: string }

/** `fromScopeChange`: the country/technology changed (back/forward, URL) while the panel was open (B-2). */
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

export const INCOMPLETE_CLOSED_WARNING =
  "The contract was saved, but its DevCo accounts are incomplete. Edit it to finish linking them.";

export function deleteDescription(name: string): string {
  return `Are you sure that you want to permanently delete "${name}" contract?`;
}
