/**
 * Adapter between the ported PCF grid (`SpreadSheet.tsx`'s `SheetGrid` / `SpreadsheetOutputRow`)
 * and this repo's `SheetRow` (`../rules.ts`) — the shape `validateSheet`, `contractUpserts`,
 * `costWrites` etc. already consume. Nothing here re-derives business rules; it only reshapes
 * data so the grid layer and the rules layer can talk to each other.
 *
 * THE LAYOUT IS NOT INVENTED HERE. It is the canvas' `colAddCostFromTable`
 * (`CapexScreenCode.txt:2428-2669`) fed through the PCF's `groupData()`/`prepareInitialData()`
 * (`vsbcloud-pcf-spreadsheet/SpreadSheet/index.ts`), which between them produce, per ACCOUNT in
 * the selected category:
 *
 *     80000     | Turbine / PV Supply Agreement | *Account*                  <- account row
 *     80000_0   | Turbine / PV Supply Agreement | (blank)                    <- sub-account row
 *     (blank)   | (blank)                       | Gesamt (CAPEX_after_FID)…  <- contract rows
 *     80001     | Additional WTG / PV Costs     | *Account*
 *     80001_0   | Additional WTG / PV Costs     | (blank)
 *
 * `c_Description: If(IsAccount, "*Account*")` puts the marker on ACCOUNT rows ONLY —
 * sub-account rows carry a BLANK description — and contract rows set `a_Number: ""` /
 * `b_Name: ""` because `sanitizeSpreadsheetData` fills them down again on the way out.
 * A sub-account with no contracts gets NO filler row; the user adds one with "Add Row".
 */
import DropdownEditor from "./CostPaidBy";
import YesNoEditor from "./YesNoDropDown";
import type { SheetCell, SheetGrid, SpreadsheetOutputRow } from "./SpreadSheet";
import { resolveRow, type SheetRow } from "../rules";

const FIXED_HEADERS = [
  "Account Number", "Account Name", "Cost Description", "Cost Paid By", "Depreciation", "Apply VAT",
];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const cell = (value: string, extra: Partial<SheetCell> = {}): SheetCell => ({ value, ...extra });

/** "*Account*" is the PCF's literal marker for a pure ACCOUNT row (Description column). */
export const ACCOUNT_MARKER = "*Account*";

export interface SheetSourceAccountLike { id: string; number: string; name: string }

/** An ACCOUNT with its SUB-accounts — the hierarchy the grid is laid out from. */
export interface SheetAccountGroup extends SheetSourceAccountLike {
  subaccounts: readonly SheetSourceAccountLike[];
}

/**
 * The PCF's `generateMonthLabels(1, startingYear, maxColumns - 6)` — `MM/YYYY`, zero padded
 * ("01/2015"), NOT "Jan/2015". Twelve labels per year, laid out as consecutive year blocks.
 */
export function monthHeaderLabels(years: readonly number[]): string[] {
  return years.flatMap((y) => MONTHS.map((_, i) => `${String(i + 1).padStart(2, "0")}/${y}`));
}

/** A label/structural row: readOnly across its whole width. */
function labelRow(number: string, name: string, description: string, years: readonly number[]): SheetCell[] {
  return [
    cell(number, { readOnly: true }),
    cell(name, { readOnly: true }),
    cell(description, { readOnly: true }),
    ...Array(3 + years.length * 12).fill(null).map(() => cell("", { readOnly: true })),
  ];
}

/**
 * Builds the grid: the header row, then per ACCOUNT its "*Account*" row, each of its
 * SUB-accounts' rows (blank description), and under each sub-account one wide row per
 * contract — every year's months concatenated left-to-right, 12 columns per year, matching
 * the PCF's `maxColumns` layout.
 *
 * All years of one contract merge into ONE grid row, exactly as the PCF's `groupData()` keys
 * rows by `${a_Number}_${u_RelatedRowID}`.
 */
export function sheetRowsToGrid(
  rows: readonly SheetRow[],
  accounts: readonly SheetAccountGroup[],
  years: readonly number[],
): SheetGrid {
  const header: SheetCell[] = [
    ...FIXED_HEADERS.map((h) => cell(h, { readOnly: true })),
    ...monthHeaderLabels(years).map((label) => cell(label, { readOnly: true })),
  ];

  const grid: SheetGrid = [header];

  for (const account of accounts) {
    grid.push(labelRow(account.number, account.name, ACCOUNT_MARKER, years));

    for (const sub of account.subaccounts) {
      grid.push(labelRow(sub.number, sub.name, "", years));

      // A row with no description is not a contract — `buildInitialSheet` emits one per
      // empty sub-account, and the canvas has no such row. It is dropped rather than
      // rendered as a filler row; "Add Row" is how a user starts a new contract.
      const subRows = rows.filter(
        (r) => r.accountNumber === sub.number
          && r.accountName === sub.name
          && r.description.trim() !== "",
      );

      const byDescription = new Map<string, SheetRow[]>();
      for (const r of subRows) {
        byDescription.set(r.description, [...(byDescription.get(r.description) ?? []), r]);
      }

      for (const [description, group] of byDescription) {
        const byYear = new Map(group.map((r) => [r.year, r]));
        const anyRow = group[0];
        if (!anyRow) continue;
        const rowId = anyRow.rowId;
        // Account Number/Name are left BLANK on contract data rows — as in the PCF, only the
        // account and sub-account rows carry them, and `sanitizeSpreadsheetData`'s fill-down
        // repopulates them algorithmically when the sheet is read back on save.
        grid.push([
          cell("", { Row_ID: rowId }),
          cell("", { Row_ID: rowId }),
          cell(description, { Row_ID: rowId }),
          cell(anyRow.costPaidBy ?? "", { Row_ID: rowId, DataEditor: DropdownEditor }),
          cell(anyRow.depreciation ?? "", { Row_ID: rowId, DataEditor: YesNoEditor }),
          cell(anyRow.applyVat ?? "", { Row_ID: rowId, DataEditor: YesNoEditor }),
          ...years.flatMap((y) => {
            const yr = byYear.get(y);
            return MONTHS.map((_, i) => cell(
              yr?.months[i] === null || yr?.months[i] === undefined ? "" : String(yr.months[i]),
              { Row_ID: rowId },
            ));
          }),
        ]);
      }
    }
  }

  return grid;
}

/**
 * Turns the grid's `onDataChange` JSON output (one flat object per row-and-year, already
 * unpivoted by `gridToJson`) back into `SheetRow[]`, resolved against the category's known
 * sub-accounts and contracts so `subAccountId`/`projectContractId` are populated exactly as
 * `resolveRow` (../rules.ts) would compute them.
 */
export function outputRowsToSheetRows(
  outputRows: readonly SpreadsheetOutputRow[],
  subaccounts: Parameters<typeof resolveRow>[1],
  contracts: Parameters<typeof resolveRow>[2],
): SheetRow[] {
  return outputRows
    .filter((r) => r.Description.trim() !== "" && r.Description !== ACCOUNT_MARKER)
    .map((r) => {
      const months = MONTHS.map((m) => {
        const raw = r[m];
        return raw === undefined || raw === "" ? null : Number(raw);
      });
      const row: SheetRow = {
        rowId: r.Row_ID,
        accountNumber: r.Number,
        accountName: r.Name,
        description: r.Description,
        year: Number(r.Year),
        costPaidBy: r.CostPaidBy || null,
        depreciation: r.Depreciation || null,
        applyVat: r.ApplyVAT || null,
        months,
        subAccountId: null,
        projectContractId: null,
      };
      return resolveRow(row, subaccounts, contracts);
    });
}

/* ═══════════════════════════════════════════════ identity round-trip safety ══ */

/**
 * A sheet row's REAL identity, independent of `Row_ID`.
 *
 * `Row_ID` is POSITIONAL — `sanitizeSpreadsheetData` hands out `Row_2`, `Row_3`, … as it walks
 * the grid, and every contract row under one sub-account deliberately shares one id (the
 * duplicate-sub-account validation counts distinct ids per sub-account and would otherwise
 * report every multi-contract sub-account as "is duplicated"). It therefore cannot be used to
 * pair a row with its pre-edit self: inserting or deleting a row shifts every id below it.
 */
export function rowIdentity(row: SheetRow): string {
  const account = row.projectContractId
    ?? `${row.accountNumber}|${row.accountName}|${row.description}`;
  return `${account}|${row.year}`;
}

/**
 * Re-keys `originalRows` onto the ids the CURRENT sheet carries, matching on `rowIdentity`.
 *
 * `diffRows` and the Screen's orphan cleanup both pair rows by `rowId`. Feeding them raw
 * `Row_N` ids from two different walks of the grid pairs unrelated rows — which is how a
 * whole project's historical costs were emptied in one save. Rows with no counterpart keep
 * their own id, so they read as "removed", which is what they are.
 */
export function alignOriginalRowIds(
  originalRows: readonly SheetRow[],
  currentRows: readonly SheetRow[],
): SheetRow[] {
  const currentIdByIdentity = new Map<string, string>();
  for (const r of currentRows) currentIdByIdentity.set(rowIdentity(r), r.rowId);
  return originalRows.map((o) => {
    const aligned = currentIdByIdentity.get(rowIdentity(o));
    return aligned === undefined || aligned === o.rowId ? o : { ...o, rowId: aligned };
  });
}

/**
 * Contracts the sheet was BUILT from that no longer resolve to a `projectContractId` once the
 * grid is read back.
 *
 * This is the failure mode that destroyed live data: a contract whose identity does not
 * survive the grid round trip looks, to `planContractDeletions*`, exactly like a row the user
 * deleted — and gets dropped together with its entire cost history. It is never a legitimate
 * state, so the caller must refuse to save rather than guess.
 *
 * `loadedRows` is `buildInitialSheet`'s output (straight from Dataverse); `roundTrippedRows`
 * is the same data after `sheetRowsToGrid` -> `gridToJson` -> `outputRowsToSheetRows`.
 */
export function identityRoundTripFailures(
  loadedRows: readonly SheetRow[],
  roundTrippedRows: readonly SheetRow[],
): { id: string; description: string }[] {
  const resolved = new Set(
    roundTrippedRows.map((r) => r.projectContractId).filter((x): x is string => x !== null),
  );
  const lost = new Map<string, string>();
  for (const r of loadedRows) {
    if (r.projectContractId !== null && !resolved.has(r.projectContractId)) {
      lost.set(r.projectContractId, r.description);
    }
  }
  return [...lost].map(([id, description]) => ({ id, description }));
}
