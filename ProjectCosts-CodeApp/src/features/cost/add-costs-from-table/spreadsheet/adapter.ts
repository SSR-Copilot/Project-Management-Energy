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
import {
  IdentityIndex, diffRows, planContractDeletions, planContractDeletionsCanvasParity, resolveRow,
  type ContractDeletePlan, type ExistingContract, type ExistingCost, type SheetRow,
} from "../rules";

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

  // A row with no description is not a contract — `buildInitialSheet` emits one per
  // empty sub-account, and the canvas has no such row. It is dropped rather than
  // rendered as a filler row; "Add Row" is how a user starts a new contract.
  //
  // Grouped ONCE by (number, name), in row order — the same rows, in the same order, that a
  // `rows.filter` per sub-account returned, without reading all 15,000 rows 300 times.
  const rowsBySub = new Map<string, Map<string, SheetRow[]>>();
  for (const r of rows) {
    if (r.description.trim() === "") continue;
    let byName = rowsBySub.get(r.accountNumber);
    if (!byName) rowsBySub.set(r.accountNumber, (byName = new Map()));
    const list = byName.get(r.accountName);
    if (list) list.push(r);
    else byName.set(r.accountName, [r]);
  }

  for (const account of accounts) {
    grid.push(labelRow(account.number, account.name, ACCOUNT_MARKER, years));

    for (const sub of account.subaccounts) {
      grid.push(labelRow(sub.number, sub.name, "", years));

      const subRows = rowsBySub.get(sub.number)?.get(sub.name) ?? [];

      /*
       * Keyed on the CONTRACT, falling back to the description for a row that has no contract
       * yet (one the user is typing). It was keyed on the description alone, which folded two
       * contracts that happen to share a name under one sub-account into a single grid row:
       * `byYear` below then took whichever of them came last for each year, so one contract's
       * money was displayed under the other's row, and on the way back out `resolveRow`'s
       * `.find()` handed both rows to the first contract — leaving the second unresolvable.
       * `identityRoundTripFailures` caught that and refused the save outright, which is how it
       * surfaced: "could not be matched back to the contracts it was built from".
       *
       * Two contracts with one name is a perfectly legal state in Dataverse — nothing enforces
       * a unique `vsb_name` per sub-account — so the sheet has to be able to show both.
       */
      const byContract = new Map<string, SheetRow[]>();
      for (const r of subRows) {
        const key = r.projectContractId ?? `description:${r.description}`;
        const group = byContract.get(key);
        if (group) group.push(r);
        else byContract.set(key, [r]);
      }

      for (const group of byContract.values()) {
        const byYear = new Map(group.map((r) => [r.year, r]));
        const anyRow = group[0];
        if (!anyRow) continue;
        const description = anyRow.description;
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
  const kept = outputRows.filter(
    (r) => r.Description.trim() !== "" && r.Description !== ACCOUNT_MARKER,
  );

  /*
   * Every lookup is indexed once, so this is O(rows + sub-accounts + contracts). It runs on
   * EVERY settled edit, and a `subaccounts.find` per row plus a `contracts.filter` per grid
   * row was 4.4 million reads on a 15,000-row sheet.
   *
   * Sub-accounts by (name, number), FIRST match winning as `find` did. Nested maps rather
   * than a joined string key, so no two distinct pairs can collide.
   */
  const subByNameNumber = new Map<string, Map<string, (typeof subaccounts)[number]>>();
  for (const s of subaccounts) {
    let byNumber = subByNameNumber.get(s.name);
    if (!byNumber) subByNameNumber.set(s.name, (byNumber = new Map()));
    if (!byNumber.has(s.number)) byNumber.set(s.number, s);
  }
  const subs = kept.map((r) => subByNameNumber.get(r.Name)?.get(r.Number));

  // Contracts by (sub-account, name), each list in input order — exactly the
  // `contracts.filter((c) => c.subaccountId === sub.id && c.name === r.Description)` result.
  const contractsBySubName = new Map<string | null, Map<string, (typeof contracts)[number][]>>();
  for (const c of contracts) {
    let byName = contractsBySubName.get(c.subaccountId);
    if (!byName) contractsBySubName.set(c.subaccountId, (byName = new Map()));
    const list = byName.get(c.name);
    if (list) list.push(c);
    else byName.set(c.name, [c]);
  }

  /*
   * Which GRID ROW each entry came from.
   *
   * `Row_ID` cannot say: `sanitizeSpreadsheetData` bumps its counter only on an account or
   * sub-account row, so every contract row under one sub-account deliberately shares a single
   * id (see `rowIdentity`) — two rows with the same name would be indistinguishable by it.
   *
   * The ORDER can. `gridToJson` emits one entry per (row, year), all of one row's years
   * consecutively and ascending from the sheet's first year, so an entry begins a new grid row
   * whenever its account/description changes or its year fails to advance.
   */
  const gridRowOf: number[] = [];
  let ordinal = -1;
  let previous: SpreadsheetOutputRow | undefined;
  for (const r of kept) {
    const continues = previous !== undefined
      && previous.Number === r.Number
      && previous.Name === r.Name
      && previous.Description === r.Description
      && Number(r.Year) > Number(previous.Year);
    if (!continues) ordinal += 1;
    gridRowOf.push(ordinal);
    previous = r;
  }

  /*
   * Which contract each grid row means, decided for the whole sheet before any row is
   * converted, so that two rows sharing a (sub-account, description) take DIFFERENT contracts.
   *
   * `resolveRow` alone cannot do this: it matches one row at a time with `.find()`, so a second
   * row with the same name resolves to the same contract as the first and the other contract is
   * left with no row pointing at it — which every deletion planner reads as "the user removed
   * it", and `identityRoundTripFailures` rightly refuses to save.
   *
   * Rows claim in sheet order, and a row with no contract left to claim resolves to `null` — a
   * new contract, which is what an extra row carrying a duplicate name is. Which of two
   * identically named contracts a row gets is arbitrary, because nothing in the sheet
   * distinguishes them; it only has to be a BIJECTION, so that neither is silently dropped.
   */
  const contractByGridRow = new Map<number, string | null>();
  const claimed = new Map<string, number>();
  kept.forEach((r, i) => {
    const sub = subs[i];
    const gridRow = gridRowOf[i] as number;
    if (!sub || contractByGridRow.has(gridRow)) return;
    // The claim counter keeps its original string key, collisions and all, so claims are
    // counted exactly as before; only the candidate list is looked up instead of filtered.
    const nameKey = `${sub.id}|${r.Description}`;
    const matches = contractsBySubName.get(sub.id)?.get(r.Description) ?? [];
    const taken = claimed.get(nameKey) ?? 0;
    contractByGridRow.set(gridRow, matches[taken]?.id ?? null);
    claimed.set(nameKey, taken + 1);
  });

  return kept.map((r, i) => {
    const months = MONTHS.map((m) => {
      const raw = r[m];
      return raw === undefined || raw === "" ? null : Number(raw);
    });
    return {
      rowId: r.Row_ID,
      accountNumber: r.Number,
      accountName: r.Name,
      description: r.Description,
      year: Number(r.Year),
      costPaidBy: r.CostPaidBy || null,
      depreciation: r.Depreciation || null,
      applyVat: r.ApplyVAT || null,
      months,
      subAccountId: subs[i]?.id ?? null,
      projectContractId: contractByGridRow.get(gridRowOf[i] as number) ?? null,
    };
  });
}

/* ═══════════════════════════════════════════════ identity round-trip safety ══ */

/*
 * `rowIdentity` and its `IdentityIndex` live in `../rules` (one definition, rule 17): `diffRows`
 * pairs rows on it there. Re-exported here, where the round-trip guards first used it.
 */
export { rowIdentity } from "../rules";

/**
 * Re-keys `originalRows` onto the ids the CURRENT sheet carries, matching on `rowIdentity`.
 *
 * Feeding raw `Row_N` ids from two different walks of the grid to anything that pairs on
 * `rowId` pairs unrelated rows — which is how a whole project's historical costs were emptied
 * in one save. Rows with no counterpart keep their own id, so they read as "removed", which is
 * what they are.
 *
 * `diffRows` now pairs by identity itself and no longer needs this; the result is the same with
 * or without it. Kept for the deletion planners' input in `prepareSheetSave`, so no consumer of
 * the originals there ever sees a mispaired `rowId` again.
 */
export function alignOriginalRowIds(
  originalRows: readonly SheetRow[],
  currentRows: readonly SheetRow[],
): SheetRow[] {
  // The LAST current row with an identity wins, as the sequential `set` always did.
  const currentIdByIdentity = new IdentityIndex<string>();
  for (const r of currentRows) currentIdByIdentity.set(r, r.rowId);
  return originalRows.map((o) => {
    const aligned = currentIdByIdentity.get(o);
    return aligned === undefined || aligned === o.rowId ? o : { ...o, rowId: aligned };
  });
}

/* ═══════════════════════════════════════════════ preparing a save ══ */

/** Milliseconds per prepare step, as measured by the injected clock. */
interface PrepareTimings {
  roundTripCheck: number;
  align: number;
  diff: number;
  deletions: number;
  orphans: number;
  total: number;
}

type PreparedSheetSave =
  /** `identityRoundTripFailures` found contracts the read-back lost: the save must be refused. */
  | { kind: "lost"; lost: { id: string; description: string }[]; timings: PrepareTimings }
  | {
    kind: "ready";
    /** Rows `diffRows` reports as changed against their identity-matched originals. */
    changed: SheetRow[];
    /** Rows that were on the sheet and no longer are, with their months blanked. */
    orphanCleanup: SheetRow[];
    deletion: ContractDeletePlan;
    timings: PrepareTimings;
  };

/**
 * Everything the Save does between the click and the first request — moved here from
 * `Screen.tsx` unchanged, so it is one pure, testable, timeable function:
 *
 *  1. refuse when the identity round trip lost a contract (`identityRoundTripFailures`);
 *  2. re-key the originals by identity (`alignOriginalRowIds`) and diff (`diffRows`, which
 *     pairs rows by identity on its own);
 *  3. plan contract deletions — canvas parity or the past-cost guard, as the caller chooses;
 *  4. blank the months of every (contract, year) that left the sheet (the orphan clean-up).
 *
 * Steps 2 and 4 key on identity through `IdentityIndex`, which never builds the identity
 * string for a row with a contract; the screen used to build every row's string twice.
 *
 * `now` is injected (rule 5): the screen passes `performance.now`; tests pass nothing.
 */
export function prepareSheetSave(args: {
  loadedRows: readonly SheetRow[];
  roundTripped: readonly SheetRow[];
  originalRows: readonly SheetRow[];
  currentRows: readonly SheetRow[];
  contracts: readonly ExistingContract[];
  costs: readonly ExistingCost[];
  currentYear: number;
  canvasParityDeletion: boolean;
  now?: () => number;
}): PreparedSheetSave {
  const now = args.now ?? (() => 0);
  const { originalRows, currentRows } = args;
  const t0 = now();

  const lost = identityRoundTripFailures(args.loadedRows, args.roundTripped);
  const t1 = now();
  if (lost.length > 0) {
    return {
      kind: "lost", lost,
      timings: { roundTripCheck: t1 - t0, align: 0, diff: 0, deletions: 0, orphans: 0, total: t1 - t0 },
    };
  }

  // `Row_ID` is positional; pair rows by what they actually ARE before diffing.
  const alignedOriginals = alignOriginalRowIds(originalRows, currentRows);
  const t2 = now();
  const changed = diffRows(currentRows, alignedOriginals);
  const t3 = now();

  const deletion: ContractDeletePlan = args.canvasParityDeletion
    ? {
      deleteIds: planContractDeletionsCanvasParity({
        originalRows: alignedOriginals, sheetRows: currentRows,
      }),
      blockedByPastCosts: [],
    }
    : planContractDeletions({
      originalRows: alignedOriginals,
      sheetRows: currentRows,
      contracts: args.contracts,
      costs: args.costs,
      currentYear: args.currentYear,
    });
  const t4 = now();

  /*
   * A (contract, year) that was on the sheet and no longer is has its months blanked, so the
   * cost rows behind it are removed. Keyed on identity, NOT on `rowId` — `rowId` shifts
   * whenever a row is inserted or deleted, and blanking a row that is still on the sheet
   * deletes booked money. Built from the UNALIGNED originals, as the screen always did.
   */
  const stillPresent = new IdentityIndex<true>();
  for (const r of currentRows) if (r.projectContractId !== null) stillPresent.set(r, true);
  const doomed = new Set(deletion.deleteIds);
  const orphanCleanup: SheetRow[] = [];
  originalRows.forEach((orig) => {
    if (orig.projectContractId === null) return;
    if (stillPresent.get(orig) === true) return;
    if (doomed.has(orig.projectContractId)) return;
    orphanCleanup.push({ ...orig, months: new Array<number | null>(12).fill(null) });
  });
  const t5 = now();

  return {
    kind: "ready", changed, orphanCleanup, deletion,
    timings: {
      roundTripCheck: t1 - t0, align: t2 - t1, diff: t3 - t2, deletions: t4 - t3,
      orphans: t5 - t4, total: t5 - t0,
    },
  };
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
