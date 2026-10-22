/**
 * BoP standard contracts (Admin Contract screen) — the pure shapes and payload rules that the
 * DATA layer (`data/adminContract.ts`) needs as well as the screen.
 *
 * Kept out of the screen's `rules.ts` so the data module does not import from a feature (a
 * data → feature dependency). The data layer lands before the screen,
 * so the pieces both sides use live here, in `domain/` (pure: no React, no network), and the
 * screen's `features/admin/admin-contract/rules.ts` RE-EXPORTS them instead of redefining them
 * (CONVENTIONS rule 17). Citations `ACS:<line>` are into `Admin Contract Screen.pa.yaml`.
 */
import {
  Vsb_bopcontractsstandardassumptionsesvsb_closingdatereference as ClosingRefMap,
  Vsb_bopcontractsstandardassumptionsesvsb_contracttypes as ContractTypeMap,
  Vsb_bopcontractsstandardassumptionsesvsb_margintype as MarginTypeMap,
  Vsb_bopcontractsstandardassumptionsesvsb_technology as TechnologyMap,
} from "@/generated/models/Vsb_bopcontractsstandardassumptionsesModel";
import { decimalSeparatorFor, formatEditValue, parseDecimalInput } from "@/domain/numberInput";

/* ════════════════════════════════════════════════════ choice constants ══ */

/*
 * Option VALUES, never labels: the generated choice maps' labels differ between pac 1.3.1 (master,
 * e.g. "DevelopmentContract") and pa 1.5 ("Development Contract"). `optionValue` only asserts that
 * the value still exists in the generated model, so a removed option fails loudly while a
 * relabelled one does not.
 */
function optionValue(map: Record<number, string>, value: number): number {
  if (!(value in map)) throw new Error(`Choice value ${value} is missing from the generated model`);
  return value;
}

/** The Contracts table's technology codes, by name. Labels: `technologyOptionLabel`. */
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

/** Choice labels of `vsb_contracttypes` — the panel title and the `vsb_name` prefix. */
export const CONTRACT_TYPE_LABEL: Record<number, string> = {
  [CONTRACT_TYPE.Development]: "Development Contract",
  [CONTRACT_TYPE.Construction]: "Construction Contract",
};

/* ══════════════════════════════════════════════════════════════ domain shapes ══ */

export interface StandardContract {
  id: string;
  name: string;
  description: string;
  countryId?: string;
  technology?: number;
  contractType?: number;
  closingRef?: number;
  /** Dataverse's formatted label of `vsb_closingdatereference`, when sent. */
  closingRefText?: string;
  monthDifference?: number;
  margin: boolean;
  marginType?: number;
  marginPercentage?: number;
  marginFixedValue?: number;
  comment?: string;
  /** 0 Active / 1 Inactive. Inactive rows are listed and counted, as the canvas did. */
  stateCode?: number;
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

/* ═══════════════════════════════════════════════════════════ locale numbers ══ */

/** `.` for an `en-*` UI language, `,` otherwise (fn_Numeric:167-265). */
export function decimalSeparator(lang: string): "." | "," {
  return decimalSeparatorFor(lang, "language");
}

export function parseLocaleNumber(text: string, lang: string): number | undefined {
  return parseDecimalInput(text, decimalSeparator(lang));
}

/** A number into the field's locale text, for pre-filling an edit. */
export function formatLocaleNumber(value: number | undefined, lang: string): string {
  return formatEditValue(value, decimalSeparator(lang));
}

/* ═══════════════════════════════════════════════════════════ the form ══ */

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
 * New-mode defaults or the record's values. A stored month of 0 shows `+`
 * ; edit mode is decided by the record, not by a relationship.
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

/* ══════════════════════════════════════════════════════ save payloads ══ */

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

/** Newly selected accounts that another contract of the scope now owns (re-check). */
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
