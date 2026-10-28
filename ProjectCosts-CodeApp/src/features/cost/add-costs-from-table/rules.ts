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
  /**
   * The contract's STORED total (`vsb_totalcost`), when the reader fetched it. Optional so
   * fixtures and callers that predate it still compile; the save planner compares it with the
   * recomputed total to skip a total write that would change nothing.
   */
  totalCost?: number | null;
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

/* ═════════════════════════════════════════════════════ failed-save messages ══ */

/** Why a Save failed, as the screen needs to word it. Built by the data layer, worded here. */
export type SaveFailure =
  /** The bulk save stopped at one of its four phases (D51). */
  | { kind: "phase"; phase: 1 | 2 | 3 | 4; reconciled: boolean; committedBefore: boolean }
  /** The planner refused an ambiguous sheet before writing anything (`SheetConflictError`). */
  | { kind: "conflict"; detail: string }
  /**
   * The upsert verify found rows of this sheet deleted by someone else. `committedBefore`: some
   * writes of this attempt (the deletes that start beside the verify, D51 §11.12) had already
   * landed. Counts of 0 / 0 mean "unknown" (a record-gone error without counts).
   */
  | { kind: "gone"; contracts: number; costs: number; committedBefore: boolean }
  | { kind: "other" };

/** `n contract` / `n contracts`, and so on. */
const counted = (n: number, singular: string, plural: string): string =>
  `${n} ${n === 1 ? singular : plural}`;

/** "2 contracts and 3 cost rows were" / "1 cost row was"; "some rows were" when both are 0. */
function goneRows(contracts: number, costs: number): string {
  const parts: string[] = [];
  if (contracts > 0) parts.push(counted(contracts, "contract", "contracts"));
  if (costs > 0) parts.push(counted(costs, "cost row", "cost rows"));
  const what = parts.length > 0 ? parts.join(" and ") : "some rows";
  const verb = parts.length === 1 && (contracts + costs) === 1 ? "was" : "were";
  return `${what} ${verb}`;
}

/**
 * Every string after `ADDCOST_MSG.saveFailed` is NEW: the canvas save has no phases, no
 * planner and no pre-write check, so it has no equivalent wording. `ADDCOST_MSG.saveFailed`
 * (canvas, verbatim) always comes first.
 */
export const ADDCOST_SAVE_MSG = {
  /** NEW — no canvas equivalent: the four bulk-save steps, by phase. */
  phase: {
    1: "saving contracts",
    2: "saving costs",
    3: "deleting costs",
    4: "deleting contracts",
  } as const,
  /** NEW — no canvas equivalent: which step stopped. */
  stopped: (phase: 1 | 2 | 3 | 4, step: string): string =>
    `The save stopped at step ${phase} of 4 (${step}).`,
  /** NEW — no canvas equivalent: retry is safe because new rows keep their ids across attempts. */
  retrySafe:
    "The changes written before it were saved. Press Save again to finish the save without "
    + "duplicating anything.",
  /** NEW — no canvas equivalent: the reconcile after a failure could not vouch for the totals. */
  totalsMayBeStale:
    "Contract totals may not match the saved costs: reload the screen before saving again.",
  /** NEW — no canvas equivalent: prefix for a refusal that wrote nothing. */
  nothingSaved: (reason: string): string => `Nothing was saved: ${reason}`,
  /** NEW — no canvas equivalent: rows deleted by another user since the sheet loaded. */
  gone: (contracts: number, costs: number): string =>
    `${goneRows(contracts, costs)} deleted by someone else after this sheet was loaded. `
    + "Reload the screen and try again.",
  /**
   * NEW — no canvas equivalent: the same, when writes of this attempt had already landed
   * (`committedBefore`), so "Nothing was saved" would be false. It starts a sentence, so
   * "some rows" (unknown counts) is capitalised.
   */
  goneAfterCommit: (contracts: number, costs: number): string => {
    const what = goneRows(contracts, costs);
    return `${what.charAt(0).toUpperCase()}${what.slice(1)} deleted by someone else after this `
      + "sheet was loaded. Some of your changes were already saved: reload the screen before "
      + "saving again.";
  },
  /** NEW — no canvas equivalent: `SheetConflictError.detail`, two rows write one month. */
  conflictSameCell: (description: string, accountName: string, year: number): string =>
    `"${description}" under account "${accountName}" has more than one row for ${year}.`,
  /**
   * NEW — no canvas equivalent: `SheetConflictError.detail`, two groups resolve to one
   * (sub-account, name). `accounts` are already quoted.
   */
  conflictSameGroup: (description: string, accounts: readonly string[]): string =>
    accounts.length > 1
      ? `"${description}" is listed under ${accounts.join(" and ")}, which are the same sub-account.`
      : `"${description}" under account ${accounts[0] ?? '""'} is listed more than once.`,
  /**
   * NEW — no canvas equivalent: `SheetConflictError.detail`, two groups point at one saved
   * contract. `descriptions` are already quoted.
   */
  conflictSameContract: (descriptions: readonly string[], accountName: string): string =>
    `${descriptions.join(" and ")} under account "${accountName}" point to the same saved cost item.`,
} as const;

/** The text the screen shows for a failed Save. */
export function saveFailureText(f: SaveFailure): string {
  switch (f.kind) {
    case "other":
      return ADDCOST_MSG.saveFailed;
    case "conflict":
      return `${ADDCOST_MSG.saveFailed} ${ADDCOST_SAVE_MSG.nothingSaved(f.detail)}`;
    case "gone":
      return f.committedBefore
        ? `${ADDCOST_MSG.saveFailed} ${ADDCOST_SAVE_MSG.goneAfterCommit(f.contracts, f.costs)}`
        : `${ADDCOST_MSG.saveFailed} ${ADDCOST_SAVE_MSG.nothingSaved(ADDCOST_SAVE_MSG.gone(f.contracts, f.costs))}`;
    case "phase": {
      const parts: string[] = [
        ADDCOST_MSG.saveFailed,
        ADDCOST_SAVE_MSG.stopped(f.phase, ADDCOST_SAVE_MSG.phase[f.phase]),
      ];
      // Unreconciled totals make a retry unsafe, so the reload hint replaces "Save again".
      if (!f.reconciled) parts.push(ADDCOST_SAVE_MSG.totalsMayBeStale);
      else if (f.committedBefore) parts.push(ADDCOST_SAVE_MSG.retrySafe);
      return parts.join(" ");
    }
  }
}

/* ═══════════════════════════════════════════════════════════════ indexes ══ */

/**
 * `items` grouped by `keyOf`, each group in input order — exactly what
 * `items.filter((x) => keyOf(x) === k)` returns for every `k`, built in one pass. Keys compare
 * with SameValueZero, which agrees with `===` for the string / null keys used here.
 */
function groupBy<T, K>(items: readonly T[], keyOf: (item: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const item of items) {
    const k = keyOf(item);
    const group = out.get(k);
    if (group) group.push(item);
    else out.set(k, [item]);
  }
  return out;
}

/** The FIRST item per key — what `items.find((x) => keyOf(x) === k)` returns, in one pass. */
function firstBy<T, K>(items: readonly T[], keyOf: (item: T) => K): Map<K, T> {
  const out = new Map<K, T>();
  for (const item of items) {
    const k = keyOf(item);
    if (!out.has(k)) out.set(k, item);
  }
  return out;
}

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

  /*
   * O(sub-accounts + contracts + costs): contracts and costs are grouped once, in their input
   * order, instead of a `filter` per sub-account and a `filter` per contract (1,500 contracts
   * x 15,000 costs is 22.5 million reads). Each group holds exactly what that `filter`
   * returned, in the same order, so the rows are unchanged.
   */
  const contractsBySub = groupBy(args.contracts, (c) => c.subaccountId);
  const costsByContract = groupBy(args.costs, (c) => c.contractId);

  for (const sub of args.subaccounts) {
    const subContracts = contractsBySub.get(sub.id) ?? [];

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
      const contractCosts = costsByContract.get(contract.id) ?? [];
      const years = [...new Set(contractCosts.map((c) => c.year))].sort((a, b) => a - b);
      const yearsToShow = years.length > 0 ? years : [args.currentYear];

      // One pass over the contract's costs fills every year's months; the last cost written to
      // a cell wins, as it did when each year re-scanned the list. A NaN year matched nothing
      // under `===`, so it still fills nothing.
      const monthsByYear = new Map<number, (number | null)[]>();
      for (const year of yearsToShow) monthsByYear.set(year, new Array(12).fill(null));
      for (const c of contractCosts) {
        if (Number.isNaN(c.year) || !(c.month >= 1 && c.month <= 12)) continue;
        const months = monthsByYear.get(c.year);
        if (months) months[c.month - 1] = c.cost ?? null;
      }

      for (const year of yearsToShow) {
        const months = monthsByYear.get(year) as (number | null)[];
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
  return rowsInGroupsWithManyIds(rows, (r) => `${uniqueId(r)}|${r.year}`)
    .map((r) => ({ ...key(r), message: `${uniqueId(r)}${ADDCOST_MSG.duplicateSubaccount}` }));
}

/**
 * The rows whose group (by `groupKey`) holds more than one distinct `rowId`, in row order.
 * Each row's key is built ONCE — this runs on every settled edit of a 15,000-row sheet.
 */
function rowsInGroupsWithManyIds(
  rows: readonly SheetRow[],
  groupKey: (r: SheetRow) => string,
): SheetRow[] {
  // Per group, its first rowId — or MANY once a second, different one turns up. "More than one
  // distinct id" is all the callers ask, so a Set per group (15,000 of them) is not needed.
  const MANY = true;
  const keys = rows.map(groupKey);
  const firstId = new Map<string, string | typeof MANY>();
  rows.forEach((r, i) => {
    const k = keys[i] as string;
    const seen = firstId.get(k);
    if (seen === undefined) firstId.set(k, r.rowId);
    else if (seen !== MANY && seen !== r.rowId) firstId.set(k, MANY);
  });
  return rows.filter((_, i) => firstId.get(keys[i] as string) === MANY);
}

/** Validation 2 — a cost typed on an ACCOUNT row rather than a sub-account. */
export function validateCostOnAccount(rows: readonly SheetRow[]): ValidationError[] {
  return rows
    .filter((r) => r.subAccountId === null)
    .map((r) => ({ ...key(r), message: `${uniqueId(r)}${ADDCOST_MSG.costOnAccount}` }));
}

/**
 * Validation 3 — two contracts with the same name under one sub-account, in the same year.
 *
 * The canvas rule, ported as it runs (`tmr__CheckChanges_Add_Costs_To_Dataverse.OnTimerEnd`,
 * `Add Costs from Table.pa.yaml` line 30):
 *
 *     ClearCollect(colValidationPCFOutRow, AddColumns(colPCFDataOut As Current,
 *         CostCountRows, CountIf(colPCFDataOut,
 *             Name = Current.Name, CurrentYear = Current.CurrentYear, row_ID = Current.row_ID,
 *             Number = Current.Number, Description = Current.Description), …));
 *     locDuplication: ForAll(Filter(colValidationPCFOutRow, CostCountRows > 1) As Current, …
 *         Comment: " :- There cannot be two contracts with the same name under the same sub-account.")
 *
 * A row is flagged when MORE THAN ONE row shares all five of account name, year, `rowId`,
 * account number and description. Every contract row under one sub-account shares one `Row_ID`
 * (`sanitizeSpreadsheetData`), so two same-named rows under one sub-account in one year are
 * refused, as in the canvas (bug CA-12). The year is in the canvas key too: it is no deviation.
 *
 * Bug CA-12: this used to flag a group only when it held more than one DISTINCT `rowId` — the
 * reverse condition. That case (one sub-account at two places in the grid) is not in the canvas
 * rule and is not lost: every such pair also has one `uniqueId` and year with two `rowId`s, so
 * `validateDuplicateSubaccounts` refuses it (" is duplicated. Please ensure it is unique."), as
 * the canvas' `locDuplicateSubaccounts` does.
 *
 * Text compares exactly. The year is compared as text (`CurrentYear: Text(Data.Year)`). Each
 * row's key is built once (JSON, so no separator can make two keys collide): linear time.
 */
export function validateDuplicateContracts(rows: readonly SheetRow[]): ValidationError[] {
  const keys = rows.map((r) =>
    JSON.stringify([r.accountName, String(r.year), r.rowId, r.accountNumber, r.description]));
  const costCountRows = new Map<string, number>();
  for (const k of keys) costCountRows.set(k, (costCountRows.get(k) ?? 0) + 1);
  return rows
    .filter((_, i) => (costCountRows.get(keys[i] as string) ?? 0) > 1)
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
  const keys = rows.map((r) => `${r.accountName}|${r.accountNumber}|${r.description}`);
  const hasCost = new Map<string, boolean>();
  rows.forEach((r, i) => {
    const k = keys[i] as string;
    if (hasCost.get(k) === true) return;
    hasCost.set(k, r.months.some((m) => m !== null && m !== 0));
  });
  return rows
    .filter((_, i) => hasCost.get(keys[i] as string) === false)
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

/* ─────────────────────────────────────────────────────────── row identity ── */

/**
 * A sheet row's REAL identity, independent of `Row_ID`: its contract and year, or — for a row
 * with no contract yet — its account number, account name, description and year.
 *
 * `Row_ID` is POSITIONAL — `sanitizeSpreadsheetData` hands out `Row_2`, `Row_3`, … as it walks
 * the grid, and every contract row under one sub-account deliberately shares one id (the
 * duplicate-sub-account validation counts distinct ids per sub-account and would otherwise
 * report every multi-contract sub-account as "is duplicated"). It therefore cannot be used to
 * pair a row with its pre-edit self: inserting or deleting a row shifts every id below it, and
 * every year of every contract under one sub-account carries the same id.
 */
export function rowIdentity(row: SheetRow): string {
  return `${identityAccount(row)}|${row.year}`;
}

/** The part of `rowIdentity` before the year. */
const identityAccount = (row: SheetRow): string =>
  row.projectContractId ?? `${row.accountNumber}|${row.accountName}|${row.description}`;

/**
 * A map keyed on `rowIdentity` WITHOUT building the string: (account, year) as nested maps.
 *
 * Exactly as discriminating as the string. `String(year)` never contains "|", so the string
 * splits back into one (account, year) pair only; and two years print the same exactly when
 * they are the same Map key (0 and -0 both print "0"; NaN prints "NaN"). For a row with a
 * contract — nearly every row — no string is built at all, and string-keyed lookups of 15,000
 * concatenated keys were the bulk of the Save's prepare time.
 */
export class IdentityIndex<V> {
  private readonly byAccount = new Map<string, Map<number, V>>();

  set(row: SheetRow, value: V): void {
    const account = identityAccount(row);
    let byYear = this.byAccount.get(account);
    if (!byYear) this.byAccount.set(account, (byYear = new Map()));
    byYear.set(row.year, value);
  }

  get(row: SheetRow): V | undefined {
    return this.byAccount.get(identityAccount(row))?.get(row.year);
  }
}

/**
 * The rows of `sheetRows` that differ from their pre-edit selves — the rows the Save writes.
 *
 * Rows are paired by IDENTITY (`rowIdentity`), never by `rowId`: every year of every contract
 * under one sub-account shares one `Row_ID`, so a `rowId` map paired each row with whichever
 * row of its sub-account came last, and reported nearly every row as changed (14,416 of 14,650
 * on the 15,000-row bench in `prepare.bench.test.ts`, where 3,487 differ from their originals).
 *
 *  - A row with no identity match is new, so it is changed.
 *  - A row is unchanged ONLY when every field `rowChanged` compares is equal.
 *  - An AMBIGUOUS identity — held by two current rows, or by two original rows — cannot be
 *    paired safely, so every current row carrying it is reported as changed. Since CA-12,
 *    validation refuses two current rows sharing an identity without a contract
 *    (`validateDuplicateContracts` for one `Row_ID`, `validateDuplicateSubaccounts` for two),
 *    so a sheet that can be saved has no ambiguous current row; the fallback stays as a guard,
 *    and for the ORIGINAL side, which validation never sees. Reporting such rows costs at most
 *    a redundant write; hiding one could lose an edit.
 *    Rows with a contract are never ambiguous on a real sheet: `outputRowsToSheetRows` gives
 *    each contract to at most one grid row, and one grid row has each year once.
 *
 * Rows that were removed from the sheet are not in the result; the orphan clean-up
 * (`prepareSheetSave`) handles them.
 */
export function diffRows(sheetRows: readonly SheetRow[], originalRows: readonly SheetRow[]): SheetRow[] {
  const originals = new IdentityIndex<{ row: SheetRow; count: number }>();
  for (const o of originalRows) {
    const seen = originals.get(o);
    if (seen) seen.count += 1;
    else originals.set(o, { row: o, count: 1 });
  }
  const current = new IdentityIndex<{ count: number }>();
  for (const r of sheetRows) {
    const seen = current.get(r);
    if (seen) seen.count += 1;
    else current.set(r, { count: 1 });
  }
  return sheetRows.filter((r) => {
    if ((current.get(r)?.count ?? 0) > 1) return true;
    const original = originals.get(r);
    if (original && original.count > 1) return true;
    return rowChanged(r, original?.row);
  });
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
  // Indexed once instead of a `find` per group. The FIRST contract with an id wins, exactly as
  // `find` resolved it; a null id never matched an (always-string) contract id, and still does not.
  const byId = new Map<string, ExistingContract>();
  for (const c of existingContracts) if (!byId.has(c.id)) byId.set(c.id, c);
  return [...byGroup.values()].map((r) => {
    const existing = r.projectContractId === null ? undefined : byId.get(r.projectContractId);
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

/** The `(contract, year, month)` key a cost row is unique on. Contract ids are GUIDs: no `|`. */
export const costCellKey = (contractId: string, year: number, month: number): string =>
  `${contractId}|${year}|${month}`;

/**
 * Existing cost rows by `costCellKey`, built once. Where Dataverse holds two rows for one
 * cell, the FIRST one wins — the row `existingCosts.find(...)` used to resolve to.
 */
function indexCostsByCell(existingCosts: readonly ExistingCost[]): Map<string, ExistingCost> {
  const out = new Map<string, ExistingCost>();
  for (const c of existingCosts) {
    const k = costCellKey(c.contractId, c.year, c.month);
    if (!out.has(k)) out.set(k, c);
  }
  return out;
}

/**
 * Twelve candidate rows are staged per sheet row. A blank month WITH an existing id is
 * deleted; a blank month WITHOUT one is simply dropped.
 *
 * O(rows × 12 + costs): the existing rows are indexed once by `indexCostsByCell` instead of a
 * `find` per cell. A row with no contract id matches nothing, as `find` matched nothing for it.
 */
export function costWrites(
  rows: readonly SheetRow[],
  existingCosts: readonly ExistingCost[],
): { upserts: CostWrite[]; deletes: string[]; candidates: number } {
  const upserts: CostWrite[] = [];
  const deletes: string[] = [];
  let candidates = 0;
  const byCell = indexCostsByCell(existingCosts);

  for (const row of rows) {
    const contractId = row.projectContractId;
    for (let m = 1; m <= 12; m += 1) {
      candidates += 1;
      const value = row.months[m - 1] ?? null;
      const existing = contractId === null ? undefined : byCell.get(costCellKey(contractId, row.year, m));
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

  if (args.allowPastCostDeletion) return { deleteIds: removed, blockedByPastCosts: [] };

  // Indexed once: a `costs.some` and a `contracts.find` per removed contract, plus a
  // `blocked.includes` per removed id, made this O(removed x costs).
  const withPastCosts = new Set<string>();
  for (const c of costs) {
    if (c.year < currentYear && (c.cost ?? 0) !== 0) withPastCosts.add(c.contractId);
  }
  const blocked = removed.filter((id) => withPastCosts.has(id));
  const blockedSet = new Set(blocked);
  const contractById = firstBy(contracts, (c) => c.id);
  return {
    deleteIds: removed.filter((id) => !blockedSet.has(id)),
    blockedByPastCosts: blocked.map((id) => ({
      id, name: contractById.get(id)?.name ?? id,
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
