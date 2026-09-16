/**
 * Add Costs from Table — every business rule as a pure function.
 *
 * Canvas screen: `Add Costs from Table` (Project Costs app)
 *   23 controls · 1 409 lines of Power Fx · 3 substantive blocks · band XS
 *
 * Despite the tiny control count this is one of the densest logic blocks in the solution:
 * `tmr__CheckChanges_Add_Costs_To_Dataverse.OnTimerEnd` is ~1 200 lines. It is reached only
 * from `btn_Costs_ProjectCosts_TableCommandBar_AddCostFromTable` on the Capex screen and
 * bulk-edits one CAPEX account category as a spreadsheet.
 *
 * WHAT WAS DELETED AS A WORKAROUND
 *  · the JSON round trip into `vsb_Dev.SpreadSheet` (`jsonDataIn` / `jsonDataOut`) and the
 *    1-second `Timer` two-step save handshake — the sheet is React state here;
 *  · the six `gblTimer*` instrumentation stamps left in production code;
 *  · the hidden duplicate button row `con_btns_SpreadSheet_…` (`Visible: false`) and the
 *    dead `Show Cost from Project Start` toggle (`//true : Changed to False, Hotfix to Prod`);
 *  · the ~200-line re-derivation of every Capex collection before `Navigate` back — one
 *    `invalidateQueries(['capex', projectId])` replaces it.
 *
 * ONE COMMENTED-OUT GUARD IS REINSTATED HERE, flagged with `// SOURCE DEFECT:` — the
 * past-cost guard on contract deletion.
 */
import { isBlank, pfxRound } from "@/domain/numeric";
import { CHOICE_COST } from "@/data/entities";

/* ══════════════════════════════════════════════════════════════════════ types ════ */

/** One row of the sheet: a (sub-account, contract, year) triple with twelve month cells. */
export interface SheetRow {
  rowId: string;
  /** `Data.Number` — the sub-account number. */
  accountNumber: string;
  /** `Data.Name` — the sub-account name. */
  accountName: string;
  /** `Data.Description` — the contract name. */
  description: string;
  year: number;
  /** `"DevCo"` / `"SPV"`, from `SPVDevCo Mapping Capex Devexes` or typed. */
  costPaidBy: string | null;
  depreciation: string | null;
  applyVat: string | null;
  /** Twelve values, index 0 = January. `null` = the cell is empty. */
  months: (number | null)[];
  /** Resolved from `colCapexSubaccountsNew`; null when the row sits on an ACCOUNT. */
  subAccountId: string | null;
  /** Resolved from `colCapexProjectContracts`; null when the contract is new. */
  projectContractId: string | null;
}

export interface ExistingContract {
  id: string;
  name: string;
  subaccountId: string | null;
  isStandardContract: boolean;
  initialContractSource: number | null;
  distribution: number | null;
  distributionScheme: number | null;
  isEditedFromPcf: boolean;
}

export interface ExistingCost {
  id: string;
  contractId: string;
  year: number;
  /** 1…12. */
  month: number;
  cost: number | null;
}

export interface ValidationError {
  rowKey: string;
  accountNumber: string;
  accountName: string;
  message: string;
}

/* ═══════════════════════════════════════════════════════════════════ messages ════ */

export const ADDCOST_MSG = {
  /**
   * `tmr__CheckChanges_Add_Costs_To_Dataverse.OnTimerEnd.Comment` — verbatim (the canvas
   * literal lives in that formula's record field).
   */
  duplicateSubaccount: " is duplicated. Please ensure it is unique.",
  /**
   * `tmr__CheckChanges_Add_Costs_To_Dataverse.OnTimerEnd.Comment` — verbatim (the canvas
   * literal lives in that formula's record field).
   */
  costOnAccount: ": Cost entered below Account instead of Sub-Account.",
  /**
   * `tmr__CheckChanges_Add_Costs_To_Dataverse.OnTimerEnd.Comment` — verbatim (the canvas
   * literal lives in that formula's record field).
   */
  duplicateContract:
    " :- There cannot be two contracts with the same name under the same sub-account.",
  /**
   * `tmr__CheckChanges_Add_Costs_To_Dataverse.OnTimerEnd.Comment` — verbatim (the canvas
   * literal lives in that formula's record field).
   */
  missingMetadata: " : Please fill out the missing cost information.",
  /**
   * NEW — no canvas equivalent: guards the reserved contract name "Standard"; the canvas had no
   * such check
   */
  standardReserved:
    ' : The term "Standard" is applicable only for system-prefilled contracts.',
  /**
   * `tmr__CheckChanges_Add_Costs_To_Dataverse.OnTimerEnd.Comment` — verbatim (the canvas
   * literal lives in that formula's record field).
   */
  noCost: " : Each cost item must be assigned a cost.",
  saveFailed:
    "Something went wrong saving the Capex data. Please refresh the page and verify your "
    + "changes were saved correctly.",
  /**
   * NEW — no canvas equivalent: raised when the CAPEX-cost create privilege is missing; the
   * canvas PCF table was always editable
   */
  noPermission:
    "You do not have permission to create CAPEX costs, so this table cannot be edited.",
  pastCostGuard: (names: string[]) =>
    `These contracts carry costs in past years and were NOT deleted: ${names.join(", ")}. `
    + "Remove their historical costs first, or confirm the deletion explicitly.",
} as const;

/* ═══════════════════════════════════════════════════════ rules 21, 24 · years ════ */

/**
 * Rule 24 — the sheet spans `[costAllowedStartYear, codYear + 3]`, with 2050 as the
 * fallback end when the project has no COD.
 */
export function sheetYearRange(
  costAllowedStartYear: number,
  codYear: number | null,
): { start: number; end: number; years: number[] } {
  const start = costAllowedStartYear;
  const end = codYear === null ? 2050 : codYear + 3;
  const span = Math.max(end - start + 1, 1);
  return { start, end, years: Array.from({ length: span }, (_, i) => start + i) };
}

/**
 * Rule 21 — `colReference` spans AT LEAST 15 years:
 * `Sequence(Max(Year(End) - Year(Start), 15), Year(Start))`.
 */
export function referenceYears(
  projectStartYear: number,
  projectEndYear: number | null,
): number[] {
  const span = Math.max((projectEndYear ?? projectStartYear) - projectStartYear, 15);
  return Array.from({ length: span }, (_, i) => projectStartYear + i);
}

/* ══════════════════════════════════════════════════════ rules 1–3 · the sheet ════ */

/** Rule 3 — the two synthetic keys the canvas builds for each row. */
export const uniqueId = (row: Pick<SheetRow, "accountNumber" | "accountName">) =>
  `${row.accountNumber} - ${row.accountName}`;

export const costUniqueId = (row: SheetRow) =>
  `${row.accountName}-${row.accountNumber}${row.description}${row.year}${row.rowId}`;

/** Rule 4 of the *Data* section — the DevCo/SPV default per sub-account number. */
export function devCoSpvDefault(
  mapping: { accountNumber: string; devCoSpv: string | null }[],
  accountNumber: string,
): string | null {
  return mapping.find((m) => m.accountNumber === accountNumber)?.devCoSpv ?? null;
}

/** Rule 3 — resolve a row to its sub-account and any existing contract. */
export function resolveRow(
  row: SheetRow,
  subaccounts: { id: string; name: string; number: string }[],
  contracts: ExistingContract[],
): SheetRow {
  const sub = subaccounts.find(
    (s) => s.name === row.accountName && s.number === row.accountNumber,
  );
  const contract = sub
    ? contracts.find((c) => c.name === row.description && c.subaccountId === sub.id)
    : undefined;
  return {
    ...row,
    subAccountId: sub?.id ?? null,
    projectContractId: contract?.id ?? null,
  };
}

/** The header title, as hot-fixed in the canvas: `"{Project Name} - {Category Name}"`. */
export const sheetTitle = (projectName: string, categoryName: string) =>
  `${projectName} - ${categoryName}`;

/* ════════════════════════════════════════════ rules 4–10 · the six validations ════ */

const key = (r: SheetRow) => ({
  rowKey: r.rowId, accountNumber: r.accountNumber, accountName: r.accountName,
});

/** Validation 1 (rule 4) — the same sub-account appearing on more than one distinct row. */
export function validateDuplicateSubaccounts(rows: SheetRow[]): ValidationError[] {
  const byUnique = new Map<string, Set<string>>();
  for (const r of rows) {
    const k = uniqueId(r);
    const set = byUnique.get(k) ?? new Set<string>();
    set.add(r.rowId);
    byUnique.set(k, set);
  }
  return rows
    .filter((r) => (byUnique.get(uniqueId(r))?.size ?? 0) > 1)
    .map((r) => ({ ...key(r), message: `${uniqueId(r)}${ADDCOST_MSG.duplicateSubaccount}` }));
}

/** Validation 2 (rule 5) — a cost typed on an ACCOUNT row rather than a sub-account. */
export function validateCostOnAccount(rows: SheetRow[]): ValidationError[] {
  return rows
    .filter((r) => r.subAccountId === null)
    .map((r) => ({ ...key(r), message: `${uniqueId(r)}${ADDCOST_MSG.costOnAccount}` }));
}

/** Validation 3 (rule 6) — two contracts with the same name under one sub-account. */
export function validateDuplicateContracts(rows: SheetRow[]): ValidationError[] {
  const counts = new Map<string, number>();
  const k = (r: SheetRow) =>
    `${r.accountName}|${r.accountNumber}|${r.description}|${r.year}|${r.rowId}`;
  const groupKey = (r: SheetRow) => `${r.accountName}|${r.accountNumber}|${r.description}`;
  const seenRows = new Map<string, Set<string>>();
  for (const r of rows) {
    counts.set(k(r), (counts.get(k(r)) ?? 0) + 1);
    const set = seenRows.get(groupKey(r)) ?? new Set<string>();
    set.add(r.rowId);
    seenRows.set(groupKey(r), set);
  }
  return rows
    .filter((r) => (seenRows.get(groupKey(r))?.size ?? 0) > 1)
    .map((r) => ({
      ...key(r), message: `${r.description}${ADDCOST_MSG.duplicateContract}`,
    }));
}

/** Validation 4 (rule 7) — Depreciation, ApplyVAT or CostPaidBy missing. */
export function validateMissingMetadata(rows: SheetRow[]): ValidationError[] {
  return rows
    .filter((r) => isBlank(r.depreciation) || isBlank(r.applyVat) || isBlank(r.costPaidBy))
    .map((r) => ({ ...key(r), message: `${uniqueId(r)}${ADDCOST_MSG.missingMetadata}` }));
}

/**
 * Validation 5 (rule 8) — `"Standard"` is reserved for system rows. An EXISTING standard
 * contract may keep its name; only a NEW row is refused.
 */
export function validateStandardWord(rows: SheetRow[]): ValidationError[] {
  return rows
    .filter((r) => r.description.toLowerCase().includes("standard"))
    .filter((r) => r.projectContractId === null)
    .map((r) => ({ ...key(r), message: `${r.description}${ADDCOST_MSG.standardReserved}` }));
}

/** Validation 6 (rule 9) — every contract must carry at least one non-zero month. */
export function validateContractHasCost(rows: SheetRow[]): ValidationError[] {
  const groupKey = (r: SheetRow) => `${r.accountName}|${r.accountNumber}|${r.description}`;
  const hasCost = new Map<string, boolean>();
  for (const r of rows) {
    const any = r.months.some((m) => m !== null && m !== 0);
    hasCost.set(groupKey(r), (hasCost.get(groupKey(r)) ?? false) || any);
  }
  return rows
    .filter((r) => hasCost.get(groupKey(r)) === false)
    .map((r) => ({ ...key(r), message: `${r.description}${ADDCOST_MSG.noCost}` }));
}

/**
 * Rule 10 — the six passes are unioned and DE-DUPLICATED, and the write branch runs only
 * when the list is empty. Nothing is ever partially applied.
 */
export function validateSheet(rows: SheetRow[]): ValidationError[] {
  const all = [
    ...validateDuplicateSubaccounts(rows),
    ...validateCostOnAccount(rows),
    ...validateDuplicateContracts(rows),
    ...validateMissingMetadata(rows),
    ...validateStandardWord(rows),
    ...validateContractHasCost(rows),
  ];
  const seen = new Set<string>();
  return all.filter((e) => {
    if (seen.has(e.message)) return false;
    seen.add(e.message);
    return true;
  });
}

export const sheetIsWritable = (errors: ValidationError[]) => errors.length === 0;

/* ═══════════════════════════════════════════════════════════ rule 11 · the diff ════ */

/**
 * Rule 11 — unchanged rows are skipped.
 *
 * The canvas compares a pipe-separated, lower-cased, trimmed CONCATENATION of the twelve
 * month values plus `Depreciation`, `CostPaidBy`, `ApplyVAT` and `Description`. That is
 * ported as a structured field-by-field comparison, and `rowSignature` keeps the canvas'
 * string form so a test can prove the two agree.
 */
export function rowSignature(row: SheetRow): string {
  return [
    ...row.months.map((m) => (m === null ? "" : String(m))),
    row.depreciation ?? "", row.costPaidBy ?? "", row.applyVat ?? "", row.description,
  ].map((v) => v.trim().toLowerCase()).join("|");
}

export function rowChanged(row: SheetRow, original: SheetRow | undefined): boolean {
  if (!original) return true;
  if (row.description !== original.description) return true;
  if (row.depreciation !== original.depreciation) return true;
  if (row.costPaidBy !== original.costPaidBy) return true;
  if (row.applyVat !== original.applyVat) return true;
  for (let i = 0; i < 12; i++) {
    if ((row.months[i] ?? null) !== (original.months[i] ?? null)) return true;
  }
  return false;
}

export function diffRows(sheetRows: SheetRow[], originalRows: SheetRow[]): SheetRow[] {
  const byId = new Map(originalRows.map((r) => [r.rowId, r]));
  return sheetRows.filter((r) => rowChanged(r, byId.get(r.rowId)));
}

/* ═══════════════════════════════════════════════════ rules 12–14 · contracts ════ */

export interface ContractUpsert {
  contractId: string | null;
  subaccountId: string | null;
  name: string;
  applyVat: boolean;
  depreciation: boolean;
  costType: number;
  distribution: number;
  distributionScheme: number;
  isEditedFromPcf: boolean;
  initialContractSource: number;
}

/** `"DevCo"` / `"SPV"` → the option-set value; anything else defaults to DevCo. */
export function costTypeFromText(value: string | null): number {
  if ((value ?? "").toUpperCase() === "SPV") return CHOICE_COST.costPaidType.spv;
  return CHOICE_COST.costPaidType.devCo;
}

const yesNo = (v: string | null) => (v ?? "").trim().toLowerCase() === "yes";

/**
 * Rule 13 — `'Is Edited from PCF?'` is written `No` ONLY when the existing contract is a
 * Powerapps-sourced standard contract that is already Individual + Absolute and is not
 * already flagged. In every other case it is `Yes`.
 */
export function isEditedFromPcf(existing: ExistingContract | undefined): boolean {
  if (!existing) return true;
  const untouchedPowerappsStandard =
    existing.isStandardContract
    && existing.initialContractSource === CHOICE_COST.initialContractSource.powerapps
    && existing.distribution === CHOICE_COST.distributionType.individual
    && existing.distributionScheme === CHOICE_COST.distributionScheme.absoluteValues
    && existing.isEditedFromPcf !== true;
  return !untouchedPowerappsStandard;
}

/** Rule 14 — `Coalesce(existing.'Initial Contract Source', …PCF)`. */
export function initialContractSource(existing: ExistingContract | undefined): number {
  return existing?.initialContractSource ?? CHOICE_COST.initialContractSource.pcf;
}

/**
 * Rule 12 — one contract upsert per `(Name, Number, Description)` group.
 *
 * ANY contract edited through this sheet is FORCED to Individual Distribution + Absolute
 * Values. That is deliberate in the canvas and preserved here: the sheet types absolute
 * monthly figures, so an Equal-distributed contract cannot survive an edit through it
 * (UT-ADDCOST-017).
 */
export function contractUpserts(
  rows: SheetRow[],
  existingContracts: ExistingContract[],
): ContractUpsert[] {
  const byGroup = new Map<string, SheetRow>();
  for (const r of rows) {
    byGroup.set(`${r.accountName}|${r.accountNumber}|${r.description}`, r);
  }
  return [...byGroup.values()].map((r) => {
    const existing = existingContracts.find((c) => c.id === r.projectContractId);
    return {
      contractId: r.projectContractId,
      subaccountId: r.subAccountId,
      name: r.description,
      applyVat: yesNo(r.applyVat),
      depreciation: yesNo(r.depreciation),
      costType: costTypeFromText(r.costPaidBy),
      distribution: CHOICE_COST.distributionType.individual,
      distributionScheme: CHOICE_COST.distributionScheme.absoluteValues,
      isEditedFromPcf: isEditedFromPcf(existing),
      initialContractSource: initialContractSource(existing),
    };
  });
}

/* ═════════════════════════════════════════════════════ rules 15–16 · the costs ════ */

export interface CostWrite {
  costId: string | null;
  contractId: string | null;
  year: number;
  month: number;
  cost: number;
}

/**
 * Rules 15–16 — twelve candidate rows are staged per sheet row; a blank month WITH an
 * existing id is deleted, and a blank month WITHOUT one is simply dropped.
 */
export function costWrites(
  rows: SheetRow[],
  existingCosts: ExistingCost[],
): { upserts: CostWrite[]; deletes: string[]; candidates: number } {
  const upserts: CostWrite[] = [];
  const deletes: string[] = [];
  let candidates = 0;

  for (const row of rows) {
    for (let m = 1; m <= 12; m++) {
      candidates += 1;
      const value = row.months[m - 1] ?? null;
      const existing = existingCosts.find(
        (c) => c.contractId === row.projectContractId && c.year === row.year && c.month === m,
      );
      if (value === null) {
        // `// means an existing record was found`
        if (existing) deletes.push(existing.id);
        continue;
      }
      upserts.push({
        costId: existing?.id ?? null,
        contractId: row.projectContractId,
        year: row.year,
        month: m,
        cost: value,
      });
    }
  }
  return { upserts, deletes, candidates };
}

/** Rule 18 — the contract totals are recomputed as `Round(Sum(costs), 0)` after the write. */
export function recomputeContractTotal(costs: { cost: number | null }[]): number {
  return pfxRound(costs.reduce((a, c) => a + (c.cost ?? 0), 0), 0);
}

/* ═════════════════════════════════════════════ rule 19 · the past-cost guard ════ */

export interface ContractDeletePlan {
  deleteIds: string[];
  /** Contracts spared by the guard, with the names for the message. */
  blockedByPastCosts: { id: string; name: string }[];
}

/**
 * Rule 19 — contracts that disappeared from the sheet are deleted.
 *
 * SOURCE DEFECT: the canvas computes `locContractsWithPastCosts` and then its
 * `IsBlank(LookUp(...))` filter clause IS COMMENTED OUT, so a contract dropped from the
 * sheet is deleted regardless of how much historical cost it carries. Whether that was a
 * deliberate hotfix or an accident is not recoverable from the source (source ambiguity 8),
 * and silently destroying booked history is bad enough to need a decision.
 *
 * The guard is REINSTATED here and is on by default: a contract with `CAPEX Costs` in a year
 * before the current one is NOT deleted, and its name is reported so the user can confirm
 * explicitly. Pass `allowPastCostDeletion: true` — which the confirmation dialog does — to
 * get the canvas behaviour back.
 */
export function planContractDeletions(args: {
  originalRows: SheetRow[];
  sheetRows: SheetRow[];
  contracts: ExistingContract[];
  costs: ExistingCost[];
  currentYear: number;
  allowPastCostDeletion?: boolean;
}): ContractDeletePlan {
  const { originalRows, sheetRows, contracts, costs, currentYear } = args;
  const stillPresent = new Set(
    sheetRows.map((r) => r.projectContractId).filter((x): x is string => x !== null),
  );
  const removed = [...new Set(
    originalRows
      .map((r) => r.projectContractId)
      .filter((x): x is string => x !== null && !stillPresent.has(x)),
  )];

  const hasPastCosts = (contractId: string) =>
    costs.some((c) => c.contractId === contractId && c.year < currentYear
      && (c.cost ?? 0) !== 0);

  if (args.allowPastCostDeletion) {
    return { deleteIds: removed, blockedByPastCosts: [] };
  }

  const blocked = removed.filter(hasPastCosts);
  return {
    deleteIds: removed.filter((id) => !blocked.includes(id)),
    blockedByPastCosts: blocked.map((id) => ({
      id, name: contracts.find((c) => c.id === id)?.name ?? id,
    })),
  };
}

/** The canvas behaviour, kept reachable: every removed contract goes, history and all. */
export function planContractDeletionsCanvasParity(args: {
  originalRows: SheetRow[];
  sheetRows: SheetRow[];
}): string[] {
  const stillPresent = new Set(
    args.sheetRows.map((r) => r.projectContractId).filter((x): x is string => x !== null),
  );
  return [...new Set(
    args.originalRows
      .map((r) => r.projectContractId)
      .filter((x): x is string => x !== null && !stillPresent.has(x)),
  )];
}

/* ══════════════════════════════════════════════════════════════ permissions ════ */

export interface BulkEditPermissions {
  canCreateCost: boolean;
  canCreateContract: boolean;
}

/**
 * The canvas performs NO permission check on this screen at all — it inherits the gate from
 * the Capex command bar and nothing here re-checks `DataSourceInfo` before writing. Both the
 * open and the save are gated here (UT-ADDCOST-031).
 */
export function canOpenBulkEdit(p: BulkEditPermissions): boolean {
  return p.canCreateCost && p.canCreateContract;
}

export function canSaveBulkEdit(
  p: BulkEditPermissions,
  errors: ValidationError[],
): boolean {
  return canOpenBulkEdit(p) && sheetIsWritable(errors);
}

/** Rule 23 — Cancel navigates back with the selected category restored, writing nothing. */
export const cancelWritesNothing = true;
