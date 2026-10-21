/**
 * Add Cost from Table — every business rule as a pure function.
 *
 * Stage 2.5. Ported from the skeleton's `add-costs-from-table/rules.ts`. Reached from the
 * Add Cost from Table button on the CAPEX toolbar, this bulk-edits one category as a
 * spreadsheet: one row per (sub-account or account, contract, year), twelve month columns.
 *
 * WHAT WAS DELETED, deliberately, rather than ported:
 *  - the JSON round trip into `vsb_Dev.SpreadSheet` (`jsonDataIn`/`jsonDataOut`) and its
 *    1-second Timer two-step save handshake — the sheet is React state here;
 *  - six `gblTimer*` instrumentation stamps left in canvas production code;
 *  - the ~200-line re-derivation of every CAPEX collection before navigating back — one
 *    react-query invalidation replaces it.
 *
 * ONE COMMENTED-OUT CANVAS GUARD IS REINSTATED, flagged `SOURCE DEFECT A-1` below — the
 * past-cost guard on contract deletion.
 */

/** Verified live option-set values (`.power/schemas/dataverse/capexprojectcontracts...`). */
export const CHOICE = {
  costPaidType: { devCo: 952850001, spv: 952850002 },
  distributionType: { equal: 952850000, individual: 952850001 },
  distributionScheme: { percent: 952850000, absoluteValues: 952850001 },
  initialContractSource: { pcf: 95285, powerapps: 95289 },
} as const;

/* ══════════════════════════════════════════════════════════════════════ types ══ */

/** One row of the sheet: a (sub-account, contract, year) triple with twelve month cells. */
export interface SheetRow {
  rowId: string;
  accountNumber: string;
  accountName: string;
  description: string;
  year: number;
  costPaidBy: string | null;
  depreciation: string | null;
  applyVat: string | null;
  /** Twelve values, index 0 = January. `null` = the cell is empty. */
  months: (number | null)[];
  /** Resolved from the chart of accounts; null when the row sits on an ACCOUNT, not a sub-account. */
  subAccountId: string | null;
  /** Resolved from existing contracts; null when the contract is new. */
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
  /**
   * The contract's CURRENT stored metadata — needed only to hydrate a sheet row from an
   * existing contract (`buildInitialSheet`); the six validations and the upsert/cost
   * functions above never read these three fields.
   */
  costType: number | null;
  depreciation: boolean | null;
  applyVat: boolean | null;
}

export interface ExistingCost {
  id: string;
  contractId: string;
  year: number;
  /** 1-12. */
  month: number;
  cost: number | null;
}

export interface ValidationError {
  rowKey: string;
  accountNumber: string;
  accountName: string;
  message: string;
}

/* ═══════════════════════════════════════════════════════════════════ messages ══ */

export const ADDCOST_MSG = {
  duplicateSubaccount: " is duplicated. Please ensure it is unique.",
  costOnAccount: ": Cost entered below Account instead of Sub-Account.",
  duplicateContract:
    " :- There cannot be two contracts with the same name under the same sub-account.",
  missingMetadata: " : Please fill out the missing cost information.",
  /** NEW — no canvas equivalent: guards the reserved contract name "Standard". */
  standardReserved:
    ' : The term "Standard" is applicable only for system-prefilled contracts.',
  noCost: " : Each cost item must be assigned a cost.",
  saveFailed:
    "Something went wrong saving the Capex data. Please refresh the page and verify your "
    + "changes were saved correctly.",
  /** NEW — the canvas PCF table has no permission check at all. */
  noPermission:
    "You do not have permission to create CAPEX costs, so this table cannot be edited.",
  pastCostGuard: (names: string[]) =>
    `These contracts carry costs in past years and were NOT deleted: ${names.join(", ")}. `
    + "Remove their historical costs first, or confirm the deletion explicitly.",
} as const;

/* ═══════════════════════════════════════════════════════════════ years ══ */

/** The sheet spans [costAllowedStartYear, codYear + 3], falling back to 2050 with no COD. */
export function sheetYearRange(
  costAllowedStartYear: number,
  codYear: number | null,
): { start: number; end: number; years: number[] } {
  const start = costAllowedStartYear;
  const end = codYear === null ? 2050 : codYear + 3;
  const span = Math.max(end - start + 1, 1);
  return { start, end, years: Array.from({ length: span }, (_, i) => start + i) };
}

/** colReference spans at least 15 years: Sequence(Max(Year(End)-Year(Start), 15), Year(Start)). */
export function referenceYears(
  projectStartYear: number,
  projectEndYear: number | null,
): number[] {
  const span = Math.max((projectEndYear ?? projectStartYear) - projectStartYear, 15);
  return Array.from({ length: span }, (_, i) => projectStartYear + i);
}

/* ═══════════════════════════════════════════════════════════ the sheet ══ */

/** The two synthetic keys the canvas builds for each row. */
export const uniqueId = (row: Pick<SheetRow, "accountNumber" | "accountName">): string =>
  `${row.accountNumber} - ${row.accountName}`;

export const costUniqueId = (row: SheetRow): string =>
  `${row.accountName}-${row.accountNumber}${row.description}${row.year}${row.rowId}`;

/** The DevCo/SPV default per sub-account number, from the SPVDevCo mapping. */
export function devCoSpvDefault(
  mapping: readonly { accountNumber: string; devCoSpv: string | null }[],
  accountNumber: string,
): string | null {
  return mapping.find((m) => m.accountNumber === accountNumber)?.devCoSpv ?? null;
}

/** Resolves a row to its sub-account and any existing contract by name/number match. */
export function resolveRow(
  row: SheetRow,
  subaccounts: readonly { id: string; name: string; number: string }[],
  contracts: readonly ExistingContract[],
): SheetRow {
  const sub = subaccounts.find(
    (s) => s.name === row.accountName && s.number === row.accountNumber,
  );
  const contract = sub
    ? contracts.find((c) => c.name === row.description && c.subaccountId === sub.id)
    : undefined;
  return { ...row, subAccountId: sub?.id ?? null, projectContractId: contract?.id ?? null };
}

/** `"{Project Name} - {Category Name}"` — the sheet title, as hot-fixed in the canvas. */
export const sheetTitle = (projectName: string, categoryName: string): string =>
  `${projectName} - ${categoryName}`;

/* ═══════════════════════════════════════════════════ building the initial sheet ══ */

/** A sub-account, as far as the sheet builder needs it. */
export interface SheetSourceAccount {
  id: string;
  number: string;
  name: string;
}

/** The inverse of `costTypeFromText` — an option-set value back to the sheet's text form. */
export function costPaidByText(costType: number | null): string {
  return costType === CHOICE.costPaidType.spv ? "SPV" : "DevCo";
}

const yesNoTextOrDefault = (v: boolean | null): string => (v === true ? "Yes" : v === false ? "No" : "No");

/**
 * Builds the sheet's starting rows from what already exists in Dataverse.
 *
 * Ported from `CapexScreenCode.txt`'s `colAddCostFromTable` build
 * (`colCombinedCostAccounts` + `locCostGroupedByContracts`, `CapexScreenCode.txt:2437-2631`),
 * simplified: the canvas emits one placeholder "MainRow" per account/sub-account plus one row
 * per (contract, year) group, blanks the Number/Name on the contract rows, and leans on the
 * PCF component's own client-side merge (not visible in this repo — it is a compiled control)
 * to fold them back together for display. There is no such PCF here, so this builds the same
 * ROWS directly instead of the two-collection-plus-merge dance:
 *
 *   - a sub-account with NO contract yet gets one empty row, ready to fill in;
 *   - a sub-account WITH contracts gets one row per (contract, year) the contract has any
 *     existing cost rows in — or one row for the current year if a contract somehow has none.
 *
 * `subaccountId`/`projectContractId` are set directly (this already knows the match), so a
 * caller does not need to also run `resolveRow` over the result.
 */
export function buildInitialSheet(args: {
  subaccounts: readonly SheetSourceAccount[];
  contracts: readonly ExistingContract[];
  costs: readonly ExistingCost[];
  currentYear: number;
  /** Sub-account id -> "DevCo" | "SPV", from the SPVDevCo mapping. Seeds a brand-new row only. */
  payerDefaults?: ReadonlyMap<string, string>;
}): SheetRow[] {
  const payerDefaults = args.payerDefaults ?? new Map<string, string>();
  const rows: SheetRow[] = [];

  for (const sub of args.subaccounts) {
    const subContracts = args.contracts.filter((c) => c.subaccountId === sub.id);

    if (subContracts.length === 0) {
      rows.push({
        rowId: `new-${sub.id}`,
        accountNumber: sub.number,
        accountName: sub.name,
        description: "",
        year: args.currentYear,
        costPaidBy: payerDefaults.get(sub.id) ?? null,
        depreciation: null,
        applyVat: null,
        months: new Array(12).fill(null),
        subAccountId: sub.id,
        projectContractId: null,
      });
      continue;
    }

    for (const contract of subContracts) {
      const contractCosts = args.costs.filter((c) => c.contractId === contract.id);
      const years = [...new Set(contractCosts.map((c) => c.year))].sort((a, b) => a - b);
      const yearsToShow = years.length > 0 ? years : [args.currentYear];

      for (const year of yearsToShow) {
        const months: (number | null)[] = new Array(12).fill(null);
        for (const c of contractCosts) {
          if (c.year === year && c.month >= 1 && c.month <= 12) months[c.month - 1] = c.cost ?? null;
        }
        rows.push({
          rowId: `${contract.id}-${year}`,
          accountNumber: sub.number,
          accountName: sub.name,
          description: contract.name,
          year,
          costPaidBy: costPaidByText(contract.costType),
          depreciation: yesNoTextOrDefault(contract.depreciation),
          applyVat: yesNoTextOrDefault(contract.applyVat),
          months,
          subAccountId: sub.id,
          projectContractId: contract.id,
        });
      }
    }
  }

  return rows;
}

/* ═══════════════════════════════════════════════════ the six validations ══ */

const key = (r: SheetRow) => ({
  rowKey: r.rowId, accountNumber: r.accountNumber, accountName: r.accountName,
});

const isBlank = (v: string | null): boolean => v === null || v.trim() === "";

/**
 * Validation 1 — the same sub-account appearing on more than one distinct row **in the same
 * year**.
 *
 * DEVIATION FROM THE LITERAL PORT: the canvas' `GroupBy(colPCFDataOut, UniqueID, ...)` groups
 * by Number-Name alone, with no year in the key — which, taken literally, would reject a
 * sub-account that legitimately carries two years of one contract's history as "duplicated"
 * the moment the sheet is populated from existing data (see `buildInitialSheet`). The
 * skeleton's own port carries the comment "the same contract across two YEARS is a legitimate
 * pair of rows" right next to a test that never actually exercises two years — the intent was
 * documented but the key was never widened to match it. `year` is added to the key so a
 * sub-account may appear on more than one row across different years (normal multi-year
 * editing) but not twice within one year (still rejected, matching every existing test case).
 */
export function validateDuplicateSubaccounts(rows: readonly SheetRow[]): ValidationError[] {
  const groupKey = (r: SheetRow) => `${uniqueId(r)}|${r.year}`;
  const byUnique = new Map<string, Set<string>>();
  for (const r of rows) {
    const set = byUnique.get(groupKey(r)) ?? new Set<string>();
    set.add(r.rowId);
    byUnique.set(groupKey(r), set);
  }
  return rows
    .filter((r) => (byUnique.get(groupKey(r))?.size ?? 0) > 1)
    .map((r) => ({ ...key(r), message: `${uniqueId(r)}${ADDCOST_MSG.duplicateSubaccount}` }));
}

/** Validation 2 — a cost typed on an ACCOUNT row rather than a sub-account. */
export function validateCostOnAccount(rows: readonly SheetRow[]): ValidationError[] {
  return rows
    .filter((r) => r.subAccountId === null)
    .map((r) => ({ ...key(r), message: `${uniqueId(r)}${ADDCOST_MSG.costOnAccount}` }));
}

/**
 * Validation 3 — two contracts with the same name under one sub-account, **in the same year**.
 *
 * Same deviation as `validateDuplicateSubaccounts` above, for the same reason: without `year`
 * in the key, one contract's second (or third, ...) year of existing history reads as a
 * "duplicate contract" the instant the sheet is populated from real data.
 */
export function validateDuplicateContracts(rows: readonly SheetRow[]): ValidationError[] {
  const groupKey = (r: SheetRow) => `${r.accountName}|${r.accountNumber}|${r.description}|${r.year}`;
  const seenRows = new Map<string, Set<string>>();
  for (const r of rows) {
    const set = seenRows.get(groupKey(r)) ?? new Set<string>();
    set.add(r.rowId);
    seenRows.set(groupKey(r), set);
  }
  return rows
    .filter((r) => (seenRows.get(groupKey(r))?.size ?? 0) > 1)
    .map((r) => ({ ...key(r), message: `${r.description}${ADDCOST_MSG.duplicateContract}` }));
}

/** Validation 4 — Depreciation, ApplyVAT or CostPaidBy missing. */
export function validateMissingMetadata(rows: readonly SheetRow[]): ValidationError[] {
  return rows
    .filter((r) => isBlank(r.depreciation) || isBlank(r.applyVat) || isBlank(r.costPaidBy))
    .map((r) => ({ ...key(r), message: `${uniqueId(r)}${ADDCOST_MSG.missingMetadata}` }));
}

/**
 * Validation 5 — "Standard" is reserved for system rows. An EXISTING standard contract may
 * keep its name; only a NEW row is refused.
 */
export function validateStandardWord(rows: readonly SheetRow[]): ValidationError[] {
  return rows
    .filter((r) => r.description.toLowerCase().includes("standard"))
    .filter((r) => r.projectContractId === null)
    .map((r) => ({ ...key(r), message: `${r.description}${ADDCOST_MSG.standardReserved}` }));
}

/** Validation 6 — every contract must carry at least one non-zero month. */
export function validateContractHasCost(rows: readonly SheetRow[]): ValidationError[] {
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

/** The six passes, unioned and de-duplicated by message. Nothing is ever partially applied. */
export function validateSheet(rows: readonly SheetRow[]): ValidationError[] {
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

export const sheetIsWritable = (errors: readonly ValidationError[]): boolean => errors.length === 0;

/* ═══════════════════════════════════════════════════════════ the diff ══ */

/**
 * The canvas compares a pipe-separated, lower-cased, trimmed concatenation of the twelve
 * month values plus Depreciation/CostPaidBy/ApplyVAT/Description. Kept in this form (as well
 * as the structured comparison below) so a test can prove the two agree.
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
  for (let i = 0; i < 12; i += 1) {
    if ((row.months[i] ?? null) !== (original.months[i] ?? null)) return true;
  }
  return false;
}

export function diffRows(sheetRows: readonly SheetRow[], originalRows: readonly SheetRow[]): SheetRow[] {
  const byId = new Map(originalRows.map((r) => [r.rowId, r]));
  return sheetRows.filter((r) => rowChanged(r, byId.get(r.rowId)));
}

/* ═══════════════════════════════════════════════════════ contracts ══ */

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

/** "DevCo" / "SPV" -> the option-set value; anything else defaults to DevCo. */
export function costTypeFromText(value: string | null): number {
  if ((value ?? "").toUpperCase() === "SPV") return CHOICE.costPaidType.spv;
  return CHOICE.costPaidType.devCo;
}

const yesNo = (v: string | null): boolean => (v ?? "").trim().toLowerCase() === "yes";

/**
 * "Is Edited from PCF?" is written No ONLY when the existing contract is a Powerapps-sourced
 * standard contract already Individual + Absolute and not already flagged. Every other case
 * writes Yes.
 */
export function isEditedFromPcf(existing: ExistingContract | undefined): boolean {
  if (!existing) return true;
  const untouchedPowerappsStandard =
    existing.isStandardContract
    && existing.initialContractSource === CHOICE.initialContractSource.powerapps
    && existing.distribution === CHOICE.distributionType.individual
    && existing.distributionScheme === CHOICE.distributionScheme.absoluteValues
    && existing.isEditedFromPcf !== true;
  return !untouchedPowerappsStandard;
}

/** Coalesce(existing.'Initial Contract Source', ...PCF). */
export function initialContractSource(existing: ExistingContract | undefined): number {
  return existing?.initialContractSource ?? CHOICE.initialContractSource.pcf;
}

/**
 * One contract upsert per (Name, Number, Description) group.
 *
 * ANY contract edited through this sheet is FORCED to Individual Distribution + Absolute
 * Values. Deliberate in the canvas and preserved: the sheet types absolute monthly figures,
 * so an Equal-distributed contract cannot survive an edit through it.
 */
export function contractUpserts(
  rows: readonly SheetRow[],
  existingContracts: readonly ExistingContract[],
): ContractUpsert[] {
  const byGroup = new Map<string, SheetRow>();
  for (const r of rows) byGroup.set(`${r.accountName}|${r.accountNumber}|${r.description}`, r);
  return [...byGroup.values()].map((r) => {
    const existing = existingContracts.find((c) => c.id === r.projectContractId);
    return {
      contractId: r.projectContractId,
      subaccountId: r.subAccountId,
      name: r.description,
      applyVat: yesNo(r.applyVat),
      depreciation: yesNo(r.depreciation),
      costType: costTypeFromText(r.costPaidBy),
      distribution: CHOICE.distributionType.individual,
      distributionScheme: CHOICE.distributionScheme.absoluteValues,
      isEditedFromPcf: isEditedFromPcf(existing),
      initialContractSource: initialContractSource(existing),
    };
  });
}

/* ═══════════════════════════════════════════════════════════ costs ══ */

export interface CostWrite {
  costId: string | null;
  contractId: string | null;
  year: number;
  month: number;
  cost: number;
}

/**
 * Twelve candidate rows are staged per sheet row. A blank month WITH an existing id is
 * deleted; a blank month WITHOUT one is simply dropped.
 */
export function costWrites(
  rows: readonly SheetRow[],
  existingCosts: readonly ExistingCost[],
): { upserts: CostWrite[]; deletes: string[]; candidates: number } {
  const upserts: CostWrite[] = [];
  const deletes: string[] = [];
  let candidates = 0;

  for (const row of rows) {
    for (let m = 1; m <= 12; m += 1) {
      candidates += 1;
      const value = row.months[m - 1] ?? null;
      const existing = existingCosts.find(
        (c) => c.contractId === row.projectContractId && c.year === row.year && c.month === m,
      );
      if (value === null) {
        if (existing) deletes.push(existing.id);
        continue;
      }
      upserts.push({
        costId: existing?.id ?? null, contractId: row.projectContractId,
        year: row.year, month: m, cost: value,
      });
    }
  }
  return { upserts, deletes, candidates };
}

/** The contract total is recomputed as Round(Sum(costs), 0) after the write. */
export function recomputeContractTotal(costs: readonly { cost: number | null }[]): number {
  const sum = costs.reduce((a, c) => a + (c.cost ?? 0), 0);
  return Math.round(sum);
}

/* ═══════════════════════════════════════════════════ the past-cost guard ══ */

export interface ContractDeletePlan {
  deleteIds: string[];
  /** Contracts spared by the guard, with names for the message. */
  blockedByPastCosts: { id: string; name: string }[];
}

/**
 * Contracts that disappeared from the sheet are deleted.
 *
 * SOURCE DEFECT A-1: the canvas computes locContractsWithPastCosts and then its
 * IsBlank(LookUp(...)) filter clause IS COMMENTED OUT, so a contract dropped from the sheet
 * is deleted regardless of how much historical cost it carries. Whether that was a
 * deliberate hotfix or an accident is not recoverable from the source, and silently
 * destroying booked history is bad enough to need a decision.
 *
 * The guard is REINSTATED here and on by default: a contract with CAPEX Costs in a year
 * before the current one is NOT deleted, and its name is reported. Pass
 * allowPastCostDeletion: true -- which a confirmation dialog can do -- for the canvas
 * behaviour.
 */
export function planContractDeletions(args: {
  originalRows: readonly SheetRow[];
  sheetRows: readonly SheetRow[];
  contracts: readonly ExistingContract[];
  costs: readonly ExistingCost[];
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
    costs.some((c) => c.contractId === contractId && c.year < currentYear && (c.cost ?? 0) !== 0);

  if (args.allowPastCostDeletion) return { deleteIds: removed, blockedByPastCosts: [] };

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
  originalRows: readonly SheetRow[];
  sheetRows: readonly SheetRow[];
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

/* ═══════════════════════════════════════════════════════ permissions ══ */

export interface BulkEditPermissions {
  canCreateCost: boolean;
  canCreateContract: boolean;
}

/**
 * The canvas performs NO permission check on this screen at all -- it inherits the gate
 * from the CAPEX command bar. Both the open and the save are gated here.
 */
export function canOpenBulkEdit(p: BulkEditPermissions): boolean {
  return p.canCreateCost && p.canCreateContract;
}

export function canSaveBulkEdit(
  p: BulkEditPermissions,
  errors: readonly ValidationError[],
): boolean {
  return canOpenBulkEdit(p) && sheetIsWritable([...errors]);
}

/** Cancel navigates back with the selected category restored, writing nothing. */
export const cancelWritesNothing = true;
