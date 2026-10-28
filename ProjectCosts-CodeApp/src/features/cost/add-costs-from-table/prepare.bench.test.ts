/**
 * How long the work BEFORE the first save request takes, on a large sheet.
 *
 * The sheet: 100 accounts x 3 sub-accounts (300), five contracts each (1,500), ten years —
 * 15,000 sheet rows and 15,000 stored cost rows — then 5,000 changed cells, 40 removed
 * contracts and 5 added rows. Each step the screen runs between a grid edit and
 * `save.mutateAsync` is timed and printed (`npx vitest run … prepare.bench --reporter=verbose`),
 * and pinned twice:
 *
 *  - by READ COUNTS on the reference arrays (sub-accounts, contracts, costs), which are exact
 *    and machine-independent: an index built once reads each element a small, fixed number of
 *    times, whereas a `find`/`filter`/`some` per row reads the whole array per row; and
 *  - by a generous wall-clock bound, as a backstop.
 */
import { describe, expect, it } from "vitest";
import {
  buildInitialSheet, diffRows, planContractDeletions, planContractDeletionsCanvasParity,
  validateSheet, type ExistingContract, type ExistingCost,
} from "./rules";
import {
  alignOriginalRowIds, identityRoundTripFailures, outputRowsToSheetRows, prepareSheetSave,
  rowIdentity, sheetRowsToGrid, type SheetAccountGroup,
} from "./spreadsheet/adapter";
import { gridToJson, type SheetCell, type SheetGrid } from "./spreadsheet/SpreadSheet";

/* ─────────────────────────────────────────────────────────────── the fixture ── */

/** mulberry32 — a tiny seeded PRNG, so every run builds the same sheet. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Fixture {
  accounts: SheetAccountGroup[];
  subaccounts: { id: string; number: string; name: string }[];
  contracts: ExistingContract[];
  costs: ExistingCost[];
  years: number[];
  currentYear: number;
}

function buildFixture(opts: {
  accounts: number; subsPerAccount: number; contractsPerSub: number; years: number; seed: number;
}): Fixture {
  const rand = seeded(opts.seed);
  const years = Array.from({ length: opts.years }, (_, i) => 2020 + i);
  const accounts: SheetAccountGroup[] = [];
  const contracts: ExistingContract[] = [];
  const costs: ExistingCost[] = [];
  for (let a = 0; a < opts.accounts; a += 1) {
    const number = String(80000 + a);
    const name = `Account ${a}`;
    const subs = Array.from({ length: opts.subsPerAccount }, (_, s) => ({
      // Sub-accounts carry their account's name, as the real chart of accounts does.
      id: `sub-${a}-${s}`, number: `${number}_${s}`, name,
    }));
    accounts.push({ id: `acc-${a}`, number, name, subaccounts: subs });
    for (const sub of subs) {
      for (let k = 0; k < opts.contractsPerSub; k += 1) {
        const id = `c-${sub.id}-${k}`;
        contracts.push({
          id, name: `Contract ${k} of ${sub.number}`, subaccountId: sub.id,
          isStandardContract: false, initialContractSource: null, distribution: null,
          distributionScheme: null, isEditedFromPcf: false,
          costType: k % 2 === 0 ? 952850001 : 952850002, depreciation: true, applyVat: k % 3 === 0,
        });
        for (const year of years) {
          costs.push({
            id: `k-${id}-${year}`, contractId: id, year,
            month: 1 + Math.floor(rand() * 12), cost: Math.round(rand() * 10000) + 1,
          });
        }
      }
    }
  }
  return {
    accounts, subaccounts: accounts.flatMap((a) => a.subaccounts), contracts, costs, years,
    currentYear: 2025,
  };
}

/** The grid after a user's session: changed cells, removed contract rows, added rows. */
function editGrid(grid: SheetGrid, rand: () => number, opts: {
  changedCells: number; removedRows: number; addedRows: number;
}): SheetGrid {
  const out: SheetGrid = grid.map((r) => r.map((c) => ({ ...c })));
  const width = out[0]?.length ?? 0;
  const contractRows = () => out
    .map((r, i) => ({ r, i }))
    .filter(({ r, i }) => i > 0 && r[0]?.value === "" && (r[2]?.value ?? "") !== "")
    .map(({ i }) => i);

  let rows = contractRows();
  for (let n = 0; n < opts.changedCells; n += 1) {
    const ri = rows[Math.floor(rand() * rows.length)] as number;
    const ci = 6 + Math.floor(rand() * (width - 6));
    const target = out[ri]?.[ci];
    if (target) target.value = rand() < 0.2 ? "" : String(Math.round(rand() * 50000));
  }
  for (let n = 0; n < opts.removedRows; n += 1) {
    rows = contractRows();
    out.splice(rows[Math.floor(rand() * rows.length)] as number, 1);
  }
  for (let n = 0; n < opts.addedRows; n += 1) {
    rows = contractRows();
    const at = (rows[Math.floor(rand() * rows.length)] as number) + 1;
    const fresh: SheetCell[] = Array.from({ length: width }, (_, ci) => ({
      value: ci === 2 ? `New cost item ${n}` : ci === 3 ? "DevCo" : ci === 4 || ci === 5 ? "Yes"
        : ci === 6 ? "100" : "",
    }));
    out.splice(at, 0, fresh);
  }
  return out;
}

/**
 * Wraps an array so every element read is counted. `find`/`filter`/`some`/`for…of` all read
 * elements by index, so the count is exactly the work a scan does.
 */
function counting<T>(items: readonly T[]): { arr: T[]; reads: () => number } {
  let reads = 0;
  const arr = new Proxy([...items], {
    get(target, prop, receiver) {
      if (typeof prop === "string" && /^\d+$/.test(prop)) reads += 1;
      return Reflect.get(target, prop, receiver) as unknown;
    },
  });
  return { arr, reads: () => reads };
}

/** One warm-up run, then the median of five, in ms. */
function time<T>(fn: () => T): { ms: number; result: T } {
  let result = fn();
  const runs: number[] = [];
  for (let i = 0; i < 5; i += 1) {
    const t0 = performance.now();
    result = fn();
    runs.push(performance.now() - t0);
  }
  runs.sort((a, b) => a - b);
  return { ms: runs[2] as number, result };
}

const SIZE = { accounts: 100, subsPerAccount: 3, contractsPerSub: 5, years: 10, seed: 20261027 };
const EDITS = { changedCells: 5000, removedRows: 40, addedRows: 5 };
/** `prepareSheetSave(...).changed.length` for SIZE + EDITS: the rows really edited (identity pairing). */
const CHANGED_ROWS = 3487;

/* ──────────────────────────────────────────────────────────────── the bench ── */

describe("Add Cost from Table — prepare-before-save on a 15,000-row sheet", () => {
  const fx = buildFixture(SIZE);

  it("UT-ADDPERF-001 times every step and stays far inside a generous bound", () => {
    const ms: Record<string, number> = {};
    const step = <T,>(name: string, fn: () => T): T => {
      const { ms: took, result } = time(fn);
      ms[name] = took;
      return result;
    };

    // Load time — once per fresh sheet.
    const loadedRows = step("buildInitialSheet", () => buildInitialSheet({
      subaccounts: fx.subaccounts, contracts: fx.contracts, costs: fx.costs,
      currentYear: fx.currentYear,
    }));
    const grid = step("sheetRowsToGrid", () => sheetRowsToGrid(loadedRows, fx.accounts, fx.years));
    const loadJson = step("gridToJson (load)", () => gridToJson(grid, String(fx.years[0])));
    const roundTripped = step("outputRowsToSheetRows (load)",
      () => outputRowsToSheetRows(loadJson, fx.subaccounts, fx.contracts));

    // Every settled edit — the grid read-back the screen keeps `currentRows` from.
    const edited = editGrid(grid, seeded(7), EDITS);
    const json = step("gridToJson (edit)", () => gridToJson(edited, String(fx.years[0])));
    const currentRows = step("outputRowsToSheetRows (edit)",
      () => outputRowsToSheetRows(json, fx.subaccounts, fx.contracts));
    step("validateSheet", () => validateSheet(currentRows));

    // The Save click, up to `save.mutateAsync` — each piece alone, then `prepareSheetSave`.
    step("identityRoundTripFailures", () => identityRoundTripFailures(loadedRows, roundTripped));
    const aligned = step("alignOriginalRowIds", () => alignOriginalRowIds(roundTripped, currentRows));
    step("diffRows", () => diffRows(currentRows, aligned));
    step("planContractDeletionsCanvasParity", () => planContractDeletionsCanvasParity({
      originalRows: aligned, sheetRows: currentRows,
    }));
    step("planContractDeletions", () => planContractDeletions({
      originalRows: aligned, sheetRows: currentRows, contracts: fx.contracts, costs: fx.costs,
      currentYear: fx.currentYear,
    }));
    step("orphan cleanup (as Screen wrote it)", () => {
      const stillPresent = new Set(currentRows.filter((r) => r.projectContractId !== null).map(rowIdentity));
      return roundTripped.filter((o) => o.projectContractId !== null && !stillPresent.has(rowIdentity(o)));
    });
    const prepared = step("prepareSheetSave (whole Save prepare)", () => prepareSheetSave({
      loadedRows, roundTripped, originalRows: roundTripped, currentRows,
      contracts: fx.contracts, costs: fx.costs, currentYear: fx.currentYear,
      canvasParityDeletion: true,
    }));

    console.info(`prepare bench (${roundTripped.length} rows, ${currentRows.length} edited rows):\n`
      + Object.entries(ms).map(([k, v]) => `  ${k.padEnd(40)} ${v.toFixed(1)} ms`).join("\n"));

    expect(roundTripped).toHaveLength(15000);
    expect(prepared.kind).toBe("ready");
    if (prepared.kind !== "ready") return;
    console.info(`prepare bench: ${prepared.changed.length} of ${currentRows.length} rows changed`);
    /*
     * 5,000 cell edits land on at most 5,000 (contract, year) rows, plus 5 added rows x 10 years.
     * Paired by Row_ID, which every contract row under one sub-account shares, the diff reported
     * 14,416 of 14,650 rows; paired by identity it reports only the rows actually edited.
     */
    expect(prepared.changed.length).toBeLessThanOrEqual(EDITS.changedCells + EDITS.addedRows * SIZE.years);
    expect(prepared.changed.length).toBe(CHANGED_ROWS);
    // Independently: the rows whose identity has no original, or whose compared fields differ.
    const byIdentity = new Map(roundTripped.map((o) => [rowIdentity(o), o]));
    const reallyEdited = currentRows.filter((r) => {
      const o = byIdentity.get(rowIdentity(r));
      return o === undefined || JSON.stringify([r.description, r.depreciation, r.costPaidBy, r.applyVat, r.months])
        !== JSON.stringify([o.description, o.depreciation, o.costPaidBy, o.applyVat, o.months]);
    });
    expect(prepared.changed).toEqual(reallyEdited);
    // Generous backstops (each step is tens of ms here); the read counts below are the exact guard.
    expect(ms["buildInitialSheet"]).toBeLessThan(500);
    expect(ms["sheetRowsToGrid"]).toBeLessThan(500);
    expect(ms["outputRowsToSheetRows (edit)"]).toBeLessThan(500);
    expect(ms["validateSheet"]).toBeLessThan(500);
    expect(ms["planContractDeletions"]).toBeLessThan(500);
    expect(ms["prepareSheetSave (whole Save prepare)"]).toBeLessThan(500);
  });

  it("UT-ADDPERF-002 reads each reference array a bounded number of times (no scan per row)", () => {
    const subs = counting(fx.subaccounts);
    const contracts = counting(fx.contracts);
    const costs = counting(fx.costs);

    const loadedRows = buildInitialSheet({
      subaccounts: subs.arr, contracts: contracts.arr, costs: costs.arr, currentYear: fx.currentYear,
    });
    const grid = sheetRowsToGrid(loadedRows, fx.accounts, fx.years);
    const edited = editGrid(grid, seeded(7), EDITS);
    const currentRows = outputRowsToSheetRows(
      gridToJson(edited, String(fx.years[0])), subs.arr, contracts.arr,
    );
    const plan = planContractDeletions({
      originalRows: loadedRows, sheetRows: currentRows, contracts: contracts.arr, costs: costs.arr,
      currentYear: fx.currentYear,
    });

    // Each function indexes an array once, so the totals are a few passes, never one per row.
    // (Before the indexes: 4.4 million sub-account reads and 25 million contract/cost reads.)
    expect(plan.blockedByPastCosts.length).toBeGreaterThan(0);
    expect(subs.reads()).toBeLessThanOrEqual(3 * fx.subaccounts.length);
    expect(contracts.reads()).toBeLessThanOrEqual(4 * fx.contracts.length);
    expect(costs.reads()).toBeLessThanOrEqual(3 * fx.costs.length);
  });

  it("UT-ADDPERF-003 a sheet grid row costs the same at 1x and 4x the size (linear, not quadratic)", () => {
    // Reads per sheet row must not grow with the sheet: a scan per row would quadruple them.
    const readsPerRow = (accounts: number) => {
      const f = buildFixture({ ...SIZE, accounts });
      const contracts = counting(f.contracts);
      const costs = counting(f.costs);
      const subs = counting(f.subaccounts);
      const rows = buildInitialSheet({
        subaccounts: subs.arr, contracts: contracts.arr, costs: costs.arr, currentYear: f.currentYear,
      });
      outputRowsToSheetRows(gridToJson(sheetRowsToGrid(rows, f.accounts, f.years), "2020"), subs.arr, contracts.arr);
      return (contracts.reads() + costs.reads() + subs.reads()) / rows.length;
    };
    const small = readsPerRow(25);
    const large = readsPerRow(100);
    expect(large).toBeLessThan(small * 1.5);
  });
});
