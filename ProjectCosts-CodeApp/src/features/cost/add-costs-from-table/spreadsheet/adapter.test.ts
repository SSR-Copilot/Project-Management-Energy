/**
 * The grid/adapter layer, pinned against the canvas it is a port of.
 *
 * The reference layout is `ProjectDocs/Existing Solution/UI Screenshots/Cost App - Add Cost from table
 * screen - After clicking on Add cost from table button.png`, reproduced row-for-row below —
 * it is the only artefact that shows what the real screen emits, and four shipped defects
 * (account rows collapsed onto sub-accounts, a filler row canvas never had, "Jan/2026" header
 * labels, and a broken identity round trip that deleted ~168 live cost rows on one save) were
 * all invisible without it.
 */
import { describe, expect, it } from "vitest";
import {
  ACCOUNT_MARKER, alignOriginalRowIds, identityRoundTripFailures, monthHeaderLabels,
  outputRowsToSheetRows, prepareSheetSave, rowIdentity, sheetRowsToGrid, type SheetAccountGroup,
} from "./adapter";
import {
  gridToJson, wholeNumberCell, type SheetCell, type SheetGrid, type SpreadsheetOutputRow,
} from "./SpreadSheet";
import DropdownEditor from "./CostPaidBy";
import YesNoEditor from "./YesNoDropDown";
import {
  ADDCOST_MSG, buildInitialSheet, diffRows, planContractDeletions, planContractDeletionsCanvasParity,
  validateDuplicateContracts, validateSheet, type ExistingContract, type ExistingCost, type SheetRow,
} from "../rules";

const emptyMonths = (): (number | null)[] => new Array(12).fill(null);

/* ───────────────────────────────────────────────────────── the screenshot's data ── */

const CONTRACT_NAME = "Gesamt (CAPEX_after_FID) (59018_0_47110101)";

/** Two ACCOUNTS, each with one SUB-account — exactly rows 2-6 of the reference screenshot. */
const ACCOUNTS: SheetAccountGroup[] = [
  {
    id: "acc-80000", number: "80000", name: "Turbine / PV Supply Agreement",
    subaccounts: [{ id: "sub-80000_0", number: "80000_0", name: "Turbine / PV Supply Agreement" }],
  },
  {
    id: "acc-80001", number: "80001", name: "Additional WTG / PV Costs",
    subaccounts: [{ id: "sub-80001_0", number: "80001_0", name: "Additional WTG / PV Costs" }],
  },
];

const SUBACCOUNTS = ACCOUNTS.flatMap((a) => a.subaccounts);

const contract = (over: Partial<ExistingContract> = {}): ExistingContract => ({
  id: "c-1", name: CONTRACT_NAME, subaccountId: "sub-80000_0", isStandardContract: false,
  initialContractSource: null, distribution: null, distributionScheme: null,
  isEditedFromPcf: false, costType: 952850002 /* SPV */, depreciation: true, applyVat: true,
  ...over,
});

const row = (over: Partial<SheetRow> = {}): SheetRow => ({
  rowId: "r1", accountNumber: "80000_0", accountName: "Turbine / PV Supply Agreement",
  description: CONTRACT_NAME, year: 2015, costPaidBy: "SPV", depreciation: "Yes", applyVat: "Yes",
  months: emptyMonths(), subAccountId: "sub-80000_0", projectContractId: "c-1",
  ...over,
});

/** The first three columns of every grid row — the shape the screenshot shows. */
const firstThree = (grid: readonly (readonly { value: string }[])[]) =>
  grid.map((r) => [r[0]?.value, r[1]?.value, r[2]?.value]);

/* ══════════════════════════════════════════════════════════ layout (D1, D3, D4) ══ */

describe("sheetRowsToGrid — UT-ADDCOST-032", () => {
  it("reproduces the canvas screenshot row-for-row: account, sub-account, contracts", () => {
    const grid = sheetRowsToGrid([row()], ACCOUNTS, [2015]);

    expect(firstThree(grid)).toEqual([
      ["Account Number", "Account Name", "Cost Description"],
      ["80000", "Turbine / PV Supply Agreement", ACCOUNT_MARKER],
      ["80000_0", "Turbine / PV Supply Agreement", ""],
      ["", "", CONTRACT_NAME],
      ["80001", "Additional WTG / PV Costs", ACCOUNT_MARKER],
      ["80001_0", "Additional WTG / PV Costs", ""],
    ]);
  });

  it("UT-ADDCOST-037 marks ONLY the account row '*Account*'; the sub-account row is blank", () => {
    // `c_Description: If(IsAccount, "*Account*")` — CapexScreenCode.txt:2470. A sub-account
    // carrying the marker is what collapsed the two levels into one in the shipped build.
    const grid = sheetRowsToGrid([], ACCOUNTS, [2015]);
    const markers = grid.filter((r) => r[2]?.value === ACCOUNT_MARKER).map((r) => r[0]?.value);
    expect(markers).toEqual(["80000", "80001"]);
  });

  it("UT-ADDCOST-038 emits NO filler row for a sub-account with no contracts", () => {
    // The canvas emits account + sub-account rows and nothing else; a user starts a contract
    // with the "Add Row" button.
    const grid = sheetRowsToGrid([], ACCOUNTS, [2015]);
    expect(grid).toHaveLength(5); // header + (account + sub-account) x 2
  });

  it("UT-ADDCOST-039 drops a blank-description row rather than rendering it as a filler", () => {
    // `buildInitialSheet` emits one such row per empty sub-account; it has no canvas analogue.
    const grid = sheetRowsToGrid([row({ description: "", projectContractId: null })], ACCOUNTS, [2015]);
    expect(grid).toHaveLength(5);
  });

  it("UT-ADDCOST-033 emits one wide data row per contract with its months in the right year block", () => {
    const grid = sheetRowsToGrid(
      [row({ months: [10, ...emptyMonths().slice(1)] })], ACCOUNTS, [2015, 2016],
    );
    const dataRow = grid[3];
    expect(dataRow?.[0]?.value).toBe(""); // blank on data rows, filled down on save
    expect(dataRow?.[2]?.value).toBe(CONTRACT_NAME);
    expect(dataRow?.[3]?.value).toBe("SPV");
    expect(dataRow?.[6]?.value).toBe("10"); // Jan 2015
    expect(dataRow?.[18]?.value).toBe(""); // Jan 2016 — no row for that year
  });

  it("UT-ADDCOST-040 merges every YEAR of one contract into a single grid row", () => {
    // The PCF keys rows by `${a_Number}_${u_RelatedRowID}`, so years become column blocks.
    const grid = sheetRowsToGrid(
      [
        row({ rowId: "c-1-2015", year: 2015, months: [1, ...emptyMonths().slice(1)] }),
        row({ rowId: "c-1-2016", year: 2016, months: [2, ...emptyMonths().slice(1)] }),
      ],
      ACCOUNTS,
      [2015, 2016],
    );
    expect(grid).toHaveLength(6); // header + 2 accounts + 2 sub-accounts + ONE contract row
    expect(grid[3]?.[6]?.value).toBe("1"); // Jan 2015
    expect(grid[3]?.[18]?.value).toBe("2"); // Jan 2016
  });
});

describe("month header labels — UT-ADDCOST-041", () => {
  it("formats them MM/YYYY, as the PCF's generateMonthLabels does", () => {
    expect(monthHeaderLabels([2015, 2016]).slice(0, 3)).toEqual(["01/2015", "02/2015", "03/2015"]);
    expect(monthHeaderLabels([2015, 2016])[11]).toBe("12/2015");
    expect(monthHeaderLabels([2015, 2016])[12]).toBe("01/2016");
  });

  it("UT-ADDCOST-042 puts those labels on the grid's header row, after the six fixed columns", () => {
    const header = sheetRowsToGrid([], ACCOUNTS, [2015]).at(0);
    expect(header?.slice(0, 6).map((c) => c.value)).toEqual([
      "Account Number", "Account Name", "Cost Description",
      "Cost Paid By", "Depreciation", "Apply VAT",
    ]);
    expect(header?.[6]?.value).toBe("01/2015");
    expect(header?.[17]?.value).toBe("12/2015");
  });
});

/* ════════════════════════════════════════════════════════════════ the round trip ══ */

describe("outputRowsToSheetRows — UT-ADDCOST-035", () => {
  const contracts = [contract()];

  it("round-trips through gridToJson back into SheetRow[], resolving subAccountId/projectContractId", () => {
    const grid = sheetRowsToGrid([row({ months: [50, ...emptyMonths().slice(1)] })], ACCOUNTS, [2015]);
    const rows = outputRowsToSheetRows(gridToJson(grid, "2015"), SUBACCOUNTS, contracts);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      accountNumber: "80000_0", accountName: "Turbine / PV Supply Agreement",
      description: CONTRACT_NAME, year: 2015, costPaidBy: "SPV",
      subAccountId: "sub-80000_0", projectContractId: "c-1",
    });
    expect(rows[0]?.months[0]).toBe(50);
  });

  it("UT-ADDCOST-036 drops '*Account*' marker rows and blank sub-account rows", () => {
    const json = gridToJson(sheetRowsToGrid([], ACCOUNTS, [2015]), "2015");
    expect(outputRowsToSheetRows(json, SUBACCOUNTS, contracts)).toHaveLength(0);
  });

  it("UT-ADDCOST-034 fills Account Number/Name down onto the contract rows", () => {
    const json = gridToJson(sheetRowsToGrid([row()], ACCOUNTS, [2015]), "2015");
    expect(json.map((r) => [r.Number, r.Name])).toEqual([
      ["80000_0", "Turbine / PV Supply Agreement"],
    ]);
  });
});

/**
 * THE REGRESSION THIS FILE EXISTS FOR.
 *
 * A save deleted ~168 CAPEX cost rows on project Wirmighausen that nobody had touched. The
 * mechanism was identity, not intent: rows built from Dataverse did not come back out of the
 * grid as the same rows, so the deletion planner read untouched contracts as "removed".
 */
describe("identity round trip — UT-ADDCOST-043", () => {
  const CONTRACTS: ExistingContract[] = [
    contract(),
    contract({ id: "c-2", name: "Second Contract" }),
    contract({ id: "c-3", name: "Other Account Contract", subaccountId: "sub-80001_0" }),
  ];

  const COSTS: ExistingCost[] = [
    { id: "cost-1", contractId: "c-1", year: 2015, month: 1, cost: 1000 },
    { id: "cost-2", contractId: "c-1", year: 2016, month: 6, cost: 2000 },
    { id: "cost-3", contractId: "c-2", year: 2015, month: 3, cost: 300 },
    { id: "cost-4", contractId: "c-3", year: 2017, month: 12, cost: 40 },
  ];

  const YEARS = [2015, 2016, 2017, 2018];

  const loadAndRoundTrip = () => {
    const loadedRows = buildInitialSheet({
      subaccounts: SUBACCOUNTS, contracts: CONTRACTS, costs: COSTS, currentYear: 2026,
    });
    const grid = sheetRowsToGrid(loadedRows, ACCOUNTS, YEARS);
    const roundTripped = outputRowsToSheetRows(
      gridToJson(grid, String(YEARS[0])), SUBACCOUNTS, CONTRACTS,
    );
    return { loadedRows, grid, roundTripped };
  };

  it("every contract the sheet was built from still resolves after the grid round trip", () => {
    const { loadedRows, roundTripped } = loadAndRoundTrip();

    expect(identityRoundTripFailures(loadedRows, roundTripped)).toEqual([]);
    expect(new Set(roundTripped.map((r) => r.projectContractId)))
      .toEqual(new Set(["c-1", "c-2", "c-3"]));
    expect(roundTripped.every((r) => r.subAccountId !== null)).toBe(true);
  });

  it("UT-ADDCOST-044 deletes nothing when the user changed nothing — either deletion plan", () => {
    const { loadedRows, roundTripped } = loadAndRoundTrip();

    expect(planContractDeletionsCanvasParity({
      originalRows: loadedRows, sheetRows: roundTripped,
    })).toEqual([]);

    expect(planContractDeletions({
      originalRows: loadedRows, sheetRows: roundTripped,
      contracts: CONTRACTS, costs: COSTS, currentYear: 2026,
    })).toEqual({ deleteIds: [], blockedByPastCosts: [] });
  });

  it("UT-ADDCOST-045 keeps every month of existing cost inside the grid's year range", () => {
    const { roundTripped } = loadAndRoundTrip();
    const cell = (contractId: string, year: number, month: number) =>
      roundTripped.find((r) => r.projectContractId === contractId && r.year === year)
        ?.months[month - 1];

    expect(cell("c-1", 2015, 1)).toBe(1000);
    expect(cell("c-1", 2016, 6)).toBe(2000);
    expect(cell("c-2", 2015, 3)).toBe(300);
    expect(cell("c-3", 2017, 12)).toBe(40);
  });

  it("UT-ADDCOST-046 gives every contract row under ONE sub-account the SAME Row_ID", () => {
    // `validateDuplicateSubaccounts` counts DISTINCT Row_IDs per (sub-account, year); a
    // per-contract Row_ID makes every multi-contract sub-account read as "is duplicated".
    const { grid } = loadAndRoundTrip();
    const json = gridToJson(grid, String(YEARS[0]));

    const idsFor = (number: string) => new Set(
      json.filter((r) => r.Number === number).map((r) => r.Row_ID),
    );
    expect(idsFor("80000_0").size).toBe(1); // c-1 and c-2 share one id
    expect(idsFor("80001_0").size).toBe(1);
    // ...but the two sub-accounts do NOT share one with each other.
    expect([...idsFor("80000_0")][0]).not.toBe([...idsFor("80001_0")][0]);
  });

  it("UT-ADDCOST-047 reports a contract that stops resolving as a round-trip failure", () => {
    // Simulates the failure the guard exists for: the sheet went out carrying a contract and
    // came back unable to name it. Never a user action, so the save must refuse.
    const { loadedRows } = loadAndRoundTrip();
    const broken = outputRowsToSheetRows(
      gridToJson(sheetRowsToGrid(loadedRows, ACCOUNTS, YEARS), String(YEARS[0])),
      SUBACCOUNTS,
      CONTRACTS.filter((c) => c.id !== "c-2"),
    );
    expect(identityRoundTripFailures(loadedRows, broken))
      .toEqual([{ id: "c-2", description: "Second Contract" }]);
  });
});

describe("alignOriginalRowIds — UT-ADDCOST-048", () => {
  it("re-keys originals onto the ids the current sheet uses, so a positional Row_ID cannot mispair", () => {
    // `Row_ID` is handed out by position, so inserting a row above shifts every id below it.
    const original = row({ rowId: "Row_3" });
    const current = row({ rowId: "Row_4" });

    expect(alignOriginalRowIds([original], [current])[0]?.rowId).toBe("Row_4");
    expect(rowIdentity(original)).toBe(rowIdentity(current));
  });

  it("UT-ADDCOST-049 leaves a row with no counterpart alone, so a real removal still reads as one", () => {
    const removed = row({ rowId: "Row_3", projectContractId: "c-9", description: "Gone" });
    expect(alignOriginalRowIds([removed], [row({ rowId: "Row_4" })])[0]?.rowId).toBe("Row_3");
  });

  it("UT-ADDCOST-050 keys a not-yet-saved row on its account/description, not its contract id", () => {
    const fresh = row({ rowId: "Row_7", projectContractId: null, description: "New Contract" });
    expect(rowIdentity(fresh)).toBe("80000_0|Turbine / PV Supply Agreement|New Contract|2015");
  });
});

/* ═══════════════════════════════ two contracts, one name (UT-ADDCOST-051..054) ══ */

/**
 * Nothing in Dataverse enforces a unique `vsb_name` per sub-account, and a real project hit it:
 * "Standard Turbine / PV Supply Agreement - Same Ind Contract" existed twice under 80000_0.
 *
 * The grid grouped its rows by DESCRIPTION, so the two folded into one row — one contract's
 * months displayed under the other's, and on the way back `resolveRow`'s `.find()` gave both to
 * the first contract, leaving the second pointing at nothing. Every deletion planner reads that
 * as "the user removed this row" and takes the contract's whole cost history with it, which is
 * exactly what `identityRoundTripFailures` exists to stop — so the save was refused and the
 * screen showed "could not be matched back to the contracts it was built from".
 */
describe("two contracts sharing a name under one sub-account", () => {
  const SAME = "Standard Turbine / PV Supply Agreement - Same Ind Contract";
  const TWINS: ExistingContract[] = [
    contract({ id: "c-twin-a", name: SAME }),
    contract({ id: "c-twin-b", name: SAME }),
  ];
  const TWIN_COSTS: ExistingCost[] = [
    { id: "k-a", contractId: "c-twin-a", year: 2015, month: 1, cost: 111 },
    { id: "k-b", contractId: "c-twin-b", year: 2015, month: 1, cost: 222 },
  ];

  const loaded = () => buildInitialSheet({
    subaccounts: SUBACCOUNTS, contracts: TWINS, costs: TWIN_COSTS, currentYear: 2015,
  });
  const roundTrip = (rows: readonly SheetRow[]) => outputRowsToSheetRows(
    gridToJson(sheetRowsToGrid(rows, ACCOUNTS, [2015]), "2015"), SUBACCOUNTS, TWINS,
  );

  it("UT-ADDCOST-051 gives each contract its own grid row rather than folding them into one", () => {
    const rows = sheetRowsToGrid(loaded(), ACCOUNTS, [2015]).slice(1)
      .filter((r) => r[2]?.value === SAME);
    expect(rows).toHaveLength(2);
  });

  it("UT-ADDCOST-052 keeps each contract's money on its own row instead of overwriting it", () => {
    // Column 6 is January 2015. Folding used to leave only the last contract's 222.
    const january = sheetRowsToGrid(loaded(), ACCOUNTS, [2015]).slice(1)
      .filter((r) => r[2]?.value === SAME)
      .map((r) => r[6]?.value);
    expect(january).toEqual(["111", "222"]);
  });

  it("UT-ADDCOST-053 resolves the two rows to DIFFERENT contracts on the way back", () => {
    const ids = roundTrip(loaded()).filter((r) => r.description === SAME)
      .map((r) => r.projectContractId);
    expect(ids).toEqual(["c-twin-a", "c-twin-b"]);
  });

  it("UT-ADDCOST-054 no longer reports a lost contract, so the save is not refused", () => {
    const rows = loaded();
    expect(identityRoundTripFailures(rows, roundTrip(rows))).toEqual([]);
  });

  it("UT-ADDCOST-055 treats a third row with the same name as a NEW contract, not a third claim", () => {
    // Only two contracts exist to claim; an extra row the user added is a new one.
    const rows = [...loaded(), row({ rowId: "extra", description: SAME, projectContractId: null })];
    const resolved = roundTrip(rows).filter((r) => r.description === SAME);
    expect(resolved.map((r) => r.projectContractId)).toEqual(["c-twin-a", "c-twin-b", null]);
  });
});

/* ══════════════════════════ month cells take whole numbers (UT-ADDCOST-056..) ══ */

/**
 * The month columns accepted `^[0-9.]*$` and cleared anything else, so a decimal went straight
 * in and only `validateMonthAmount` downstream ever objected. Costs here are whole units, so a
 * decimal is now refused at the point of entry — typed or pasted, both of which reach
 * `handleChange` the same way.
 */
describe("wholeNumberCell", () => {
  it("UT-ADDCOST-056 leaves a whole number and an empty cell alone", () => {
    expect(wholeNumberCell("1234")).toBe("1234");
    expect(wholeNumberCell("")).toBe("");
    expect(wholeNumberCell("   ")).toBe("");
  });

  it("UT-ADDCOST-057 rounds a pasted decimal instead of letting it through", () => {
    expect(wholeNumberCell("12.5")).toBe("13");
    expect(wholeNumberCell("12.4")).toBe("12");
    expect(wholeNumberCell("1234.56")).toBe("1235");
  });

  it("UT-ADDCOST-058 reads both locales' separators, since a paste comes from the user's Excel", () => {
    // The LAST separator followed by one or two digits is the decimal point.
    expect(wholeNumberCell("1.234,56")).toBe("1235");
    expect(wholeNumberCell("1,234.56")).toBe("1235");
    expect(wholeNumberCell("12,5")).toBe("13");
  });

  it("UT-ADDCOST-059 treats a three-digit group as thousands, not as a fraction", () => {
    expect(wholeNumberCell("1.234")).toBe("1234");
    expect(wholeNumberCell("1,234")).toBe("1234");
    expect(wholeNumberCell("1.234.567")).toBe("1234567");
  });

  it("UT-ADDCOST-060 leaves a half-typed separator alone rather than fighting the typist", () => {
    // Rewriting "12." to "12" mid-keystroke would make the separator un-typeable in a way the
    // person cannot see; it carries no fraction yet, and the next keystroke settles it.
    expect(wholeNumberCell("12.")).toBe("12.");
    expect(wholeNumberCell("12,")).toBe("12,");
  });

  it("UT-ADDCOST-061 still clears anything that is not a figure, as the old rule did", () => {
    expect(wholeNumberCell("abc")).toBe("");
    expect(wholeNumberCell("12abc")).toBe("");
    expect(wholeNumberCell("-5")).toBe("");
  });
});

/* ═════════════════ indexed lookups behave exactly like the scans (UT-ADDCOST-062..) ══ */

/**
 * `sheetRowsToGrid`, `outputRowsToSheetRows`, `alignOriginalRowIds` and the Save's prepare step
 * were rewritten to index once instead of scanning per row (`prepare.bench.test.ts` has the
 * numbers). The implementations they replaced are kept below, verbatim, as the ORACLE: every
 * seeded random sheet must come out identical from both. The inputs are deliberately hostile —
 * a handful of names and numbers so rows collide, duplicated sub-accounts, twin contracts,
 * contracts with no sub-account, account markers, blank descriptions and shared Row_IDs.
 */
describe("the indexed adapter matches the scanning one it replaced", () => {
  /* ── the oracle: the pre-index implementations, verbatim ── */

  type SubLike = { id: string; name: string; number: string };
  const ORACLE_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const oCell = (value: string, extra: Partial<SheetCell> = {}): SheetCell => ({ value, ...extra });

  function oracleSheetRowsToGrid(
    rows: readonly SheetRow[], accounts: readonly SheetAccountGroup[], years: readonly number[],
  ): SheetGrid {
    const labelRow = (number: string, name: string, description: string): SheetCell[] => [
      oCell(number, { readOnly: true }), oCell(name, { readOnly: true }),
      oCell(description, { readOnly: true }),
      ...Array(3 + years.length * 12).fill(null).map(() => oCell("", { readOnly: true })),
    ];
    const header: SheetCell[] = [
      ...["Account Number", "Account Name", "Cost Description", "Cost Paid By", "Depreciation", "Apply VAT"]
        .map((h) => oCell(h, { readOnly: true })),
      ...monthHeaderLabels(years).map((label) => oCell(label, { readOnly: true })),
    ];
    const grid: SheetGrid = [header];
    for (const account of accounts) {
      grid.push(labelRow(account.number, account.name, ACCOUNT_MARKER));
      for (const sub of account.subaccounts) {
        grid.push(labelRow(sub.number, sub.name, ""));
        const subRows = rows.filter(
          (r) => r.accountNumber === sub.number && r.accountName === sub.name && r.description.trim() !== "",
        );
        const byContract = new Map<string, SheetRow[]>();
        for (const r of subRows) {
          const key = r.projectContractId ?? `description:${r.description}`;
          byContract.set(key, [...(byContract.get(key) ?? []), r]);
        }
        for (const group of byContract.values()) {
          const byYear = new Map(group.map((r) => [r.year, r]));
          const anyRow = group[0];
          if (!anyRow) continue;
          const rowId = anyRow.rowId;
          grid.push([
            oCell("", { Row_ID: rowId }), oCell("", { Row_ID: rowId }),
            oCell(anyRow.description, { Row_ID: rowId }),
            oCell(anyRow.costPaidBy ?? "", { Row_ID: rowId, DataEditor: DropdownEditor }),
            oCell(anyRow.depreciation ?? "", { Row_ID: rowId, DataEditor: YesNoEditor }),
            oCell(anyRow.applyVat ?? "", { Row_ID: rowId, DataEditor: YesNoEditor }),
            ...years.flatMap((y) => {
              const yr = byYear.get(y);
              return ORACLE_MONTHS.map((_, i) => oCell(
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

  function oracleOutputRowsToSheetRows(
    outputRows: readonly SpreadsheetOutputRow[], subaccounts: readonly SubLike[],
    contracts: readonly ExistingContract[],
  ): SheetRow[] {
    const kept = outputRows.filter((r) => r.Description.trim() !== "" && r.Description !== ACCOUNT_MARKER);
    const subOf = (r: SpreadsheetOutputRow) =>
      subaccounts.find((s) => s.name === r.Name && s.number === r.Number);
    const gridRowOf: number[] = [];
    let ordinal = -1;
    let previous: SpreadsheetOutputRow | undefined;
    for (const r of kept) {
      const continues = previous !== undefined && previous.Number === r.Number
        && previous.Name === r.Name && previous.Description === r.Description
        && Number(r.Year) > Number(previous.Year);
      if (!continues) ordinal += 1;
      gridRowOf.push(ordinal);
      previous = r;
    }
    const contractByGridRow = new Map<number, string | null>();
    const claimed = new Map<string, number>();
    kept.forEach((r, i) => {
      const sub = subOf(r);
      const gridRow = gridRowOf[i] as number;
      if (!sub || contractByGridRow.has(gridRow)) return;
      const nameKey = `${sub.id}|${r.Description}`;
      const matches = contracts.filter((c) => c.subaccountId === sub.id && c.name === r.Description);
      const taken = claimed.get(nameKey) ?? 0;
      contractByGridRow.set(gridRow, matches[taken]?.id ?? null);
      claimed.set(nameKey, taken + 1);
    });
    return kept.map((r, i) => ({
      rowId: r.Row_ID, accountNumber: r.Number, accountName: r.Name, description: r.Description,
      year: Number(r.Year), costPaidBy: r.CostPaidBy || null, depreciation: r.Depreciation || null,
      applyVat: r.ApplyVAT || null,
      months: ORACLE_MONTHS.map((m) => {
        const raw = r[m];
        return raw === undefined || raw === "" ? null : Number(raw);
      }),
      subAccountId: subOf(r)?.id ?? null,
      projectContractId: contractByGridRow.get(gridRowOf[i] as number) ?? null,
    }));
  }

  /** `SpreadSheet.tsx`'s `gridToJson` (with its `sanitizeSpreadsheetData`) as it was. */
  function oracleGridToJson(grid: SheetGrid, startYear: string): SpreadsheetOutputRow[] {
    const rows = grid.slice(1).map((r) => r.map((c) => ({ ...c, value: c.value || "" })));
    const sanitized: SheetCell[][] = [];
    let name = "";
    let number = "";
    let rowIDCounter = 1;
    rows.forEach((item) => {
      const [col0, col1, col2] = item;
      if (!col0 || !col1 || !col2) return;
      const accNo = (col0.value ?? "").toString();
      const accName = (col1.value ?? "").toString();
      if (accName.length !== 0 || accNo.length !== 0) col2.value = "";
      if (col2.value.length === 0 || accName.length !== 0 || accNo.length !== 0) rowIDCounter++;
      const currentRowID = `Row_${rowIDCounter}`;
      if (!col2.value.includes("*Account*")) {
        if (accName !== "") name = accName;
        if (accNo !== "") number = accNo;
        col0.Row_ID = currentRowID;
        if ((col0.value ?? "").toString() === "") col0.value = number;
        if ((col1.value ?? "").toString() === "") col1.value = name;
        if (col2.value !== "") sanitized.push(item);
      }
    });
    const out: SpreadsheetOutputRow[] = [];
    sanitized.forEach((r) => {
      const baseRow = {
        Number: r[0]?.value ?? "", Name: r[1]?.value ?? "", Description: r[2]?.value ?? "",
        CostPaidBy: r[3]?.value ?? "", Depreciation: r[4]?.value ?? "", ApplyVAT: r[5]?.value ?? "",
        Row_ID: r[0]?.Row_ID ?? "", Year: "",
      };
      const yearChunks = Math.ceil((r.length - 6) / 12);
      for (let i = 0; i < yearChunks; i++) {
        const start = 6 + i * 12;
        const newRow: SpreadsheetOutputRow = { ...baseRow, Year: String(Number(startYear) + i) };
        r.slice(start, start + 12).forEach((c, ci) => {
          const k = ORACLE_MONTHS[ci];
          if (k) newRow[k] = c?.value || "";
        });
        out.push(newRow);
      }
    });
    return out;
  }

  function oracleAlign(originalRows: readonly SheetRow[], currentRows: readonly SheetRow[]): SheetRow[] {
    const currentIdByIdentity = new Map<string, string>();
    for (const r of currentRows) currentIdByIdentity.set(rowIdentity(r), r.rowId);
    return originalRows.map((o) => {
      const aligned = currentIdByIdentity.get(rowIdentity(o));
      return aligned === undefined || aligned === o.rowId ? o : { ...o, rowId: aligned };
    });
  }

  /** `Screen.tsx`'s `doSave`, from the round-trip check to the orphan clean-up, as it was. */
  function oracleScreenPrepare(a: Parameters<typeof prepareSheetSave>[0]) {
    const lost = identityRoundTripFailures(a.loadedRows, a.roundTripped);
    if (lost.length > 0) return { kind: "lost" as const, lost };
    const alignedOriginals = oracleAlign(a.originalRows, a.currentRows);
    const changed = diffRows(a.currentRows, alignedOriginals);
    const deletion = a.canvasParityDeletion
      ? {
        deleteIds: planContractDeletionsCanvasParity({ originalRows: alignedOriginals, sheetRows: a.currentRows }),
        blockedByPastCosts: [] as { id: string; name: string }[],
      }
      : planContractDeletions({
        originalRows: alignedOriginals, sheetRows: a.currentRows, contracts: a.contracts,
        costs: a.costs, currentYear: a.currentYear,
      });
    const stillPresent = new Set(a.currentRows.filter((r) => r.projectContractId !== null).map(rowIdentity));
    const doomed = new Set(deletion.deleteIds);
    const orphanCleanup = a.originalRows
      .filter((orig) => orig.projectContractId !== null && !stillPresent.has(rowIdentity(orig)))
      .filter((orig) => !doomed.has(orig.projectContractId as string))
      .map((orig) => ({ ...orig, months: new Array(12).fill(null) as (number | null)[] }));
    return { kind: "ready" as const, changed, orphanCleanup, deletion };
  }

  /* ── seeded, hostile inputs ── */

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

  function world(seed: number) {
    const rand = seeded(seed);
    const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)] as T;
    const NUMBERS = ["80000_0", "80000_1", "80001_0", "80001_1"];
    const NAMES = ["Turbine", "Additional", "Grid"];
    const DESCRIPTIONS = ["Alpha", "Beta", "Standard Gamma", "Alpha ", "", ACCOUNT_MARKER, "a|b"];
    // Sub-accounts: a few, sometimes the same (name, number) twice under different ids.
    const subaccounts: SubLike[] = Array.from({ length: 2 + Math.floor(rand() * 5) }, (_, i) => ({
      id: `sub-${i}`, number: pick(NUMBERS), name: pick(NAMES),
    }));
    const accounts: SheetAccountGroup[] = [
      { id: "acc-a", number: "80000", name: "Turbine", subaccounts: subaccounts.slice(0, 3) },
      { id: "acc-b", number: "80001", name: "Grid", subaccounts: subaccounts.slice(2) },
    ];
    const contracts: ExistingContract[] = Array.from({ length: Math.floor(rand() * 10) }, (_, i) => ({
      id: `c-${i}`, name: pick(DESCRIPTIONS.filter((d) => d !== "")),
      subaccountId: rand() < 0.15 ? null : pick(subaccounts).id,
      isStandardContract: rand() < 0.3, initialContractSource: null, distribution: null,
      distributionScheme: null, isEditedFromPcf: false, costType: null, depreciation: null, applyVat: null,
    }));
    const years = [2019, 2020, 2021];
    const months = () => Array.from({ length: 12 }, () => (rand() < 0.6 ? null : rand() < 0.2 ? 0 : Math.round(rand() * 900)));
    const sheetRow = (i: number): SheetRow => {
      const sub = pick(subaccounts);
      const c = rand() < 0.6 && contracts.length > 0 ? pick(contracts) : null;
      return {
        rowId: `Row_${Math.floor(rand() * 4)}`, accountNumber: rand() < 0.9 ? sub.number : pick(NUMBERS),
        accountName: rand() < 0.9 ? sub.name : pick(NAMES),
        description: c?.name ?? pick(DESCRIPTIONS), year: pick([...years, 2022]),
        costPaidBy: pick(["DevCo", "SPV", null]), depreciation: pick(["Yes", "No", null]),
        applyVat: pick(["Yes", "No", null]), months: months(),
        subAccountId: rand() < 0.9 ? sub.id : null, projectContractId: c?.id ?? (i % 7 === 0 ? `ghost-${i}` : null),
      };
    };
    const sheet = (n: number) => Array.from({ length: n }, (_, i) => sheetRow(i));
    const output = (n: number): SpreadsheetOutputRow[] => Array.from({ length: n }, () => {
      const r: SpreadsheetOutputRow = {
        Number: pick(NUMBERS), Name: pick(NAMES), Description: pick(DESCRIPTIONS),
        CostPaidBy: pick(["DevCo", "SPV", ""]), Depreciation: pick(["Yes", ""]), ApplyVAT: pick(["No", ""]),
        Row_ID: `Row_${Math.floor(rand() * 4)}`, Year: String(pick(years)),
      };
      for (const m of ORACLE_MONTHS) r[m] = pick(["", "0", "12", "7"]);
      return r;
    });
    return { rand, subaccounts, accounts, contracts, years, sheet, output };
  }

  const SEEDS = Array.from({ length: 300 }, (_, i) => 1000 + i);

  it("UT-ADDCOST-062 sheetRowsToGrid builds the same grid as the per-sub-account filter", () => {
    for (const seed of SEEDS) {
      const w = world(seed);
      const rows = w.sheet(Math.floor(w.rand() * 40));
      expect(sheetRowsToGrid(rows, w.accounts, w.years), `seed ${seed}`)
        .toEqual(oracleSheetRowsToGrid(rows, w.accounts, w.years));
    }
  });

  it("UT-ADDCOST-063 outputRowsToSheetRows resolves the same sub-accounts and claims the same contracts", () => {
    for (const seed of SEEDS) {
      const w = world(seed);
      const out = w.output(Math.floor(w.rand() * 60));
      expect(outputRowsToSheetRows(out, w.subaccounts, w.contracts), `seed ${seed}`)
        .toEqual(oracleOutputRowsToSheetRows(out, w.subaccounts, w.contracts));
      // And through a real grid round trip, where rows arrive in the grid's own order.
      const json = gridToJson(sheetRowsToGrid(w.sheet(30), w.accounts, w.years), String(w.years[0]));
      expect(outputRowsToSheetRows(json, w.subaccounts, w.contracts), `seed ${seed} (grid)`)
        .toEqual(oracleOutputRowsToSheetRows(json, w.subaccounts, w.contracts));
    }
  });

  it("UT-ADDCOST-064 alignOriginalRowIds pairs exactly the same rows", () => {
    for (const seed of SEEDS) {
      const w = world(seed);
      const original = w.sheet(25);
      const current = [...w.sheet(10), ...original.filter(() => w.rand() < 0.7)];
      expect(alignOriginalRowIds(original, current), `seed ${seed}`).toEqual(oracleAlign(original, current));
    }
  });

  it("UT-ADDCOST-065 prepareSheetSave returns what Screen's inline prepare did, in both deletion modes", () => {
    let lostSeen = 0;
    let orphansSeen = 0;
    let blockedSeen = 0;
    for (const seed of SEEDS) {
      const w = world(seed);
      const loadedRows = w.sheet(20);
      const roundTripped = w.rand() < 0.8 ? loadedRows : w.sheet(20);
      const currentRows = [...roundTripped.filter(() => w.rand() < 0.75), ...w.sheet(5)]
        .map((r) => (w.rand() < 0.3 ? { ...r, months: r.months.map((m) => (m === null ? 5 : null)) } : r));
      const costs: ExistingCost[] = w.contracts.flatMap((c, i) => (i % 2 === 0
        ? [{ id: `k-${c.id}`, contractId: c.id, year: 2018 + (i % 4), month: 1, cost: i % 3 === 0 ? 0 : 10 }]
        : []));
      for (const canvasParityDeletion of [true, false]) {
        const args = {
          loadedRows, roundTripped, originalRows: roundTripped, currentRows, contracts: w.contracts,
          costs, currentYear: 2020, canvasParityDeletion,
        };
        const expected = oracleScreenPrepare(args);
        const { timings: _t, ...actual } = prepareSheetSave(args);
        expect(actual, `seed ${seed} parity=${canvasParityDeletion}`).toEqual(expected);
        if (expected.kind === "lost") lostSeen += 1;
        else {
          orphansSeen += expected.orphanCleanup.length;
          blockedSeen += expected.deletion.blockedByPastCosts.length;
        }
      }
    }
    // The random worlds really exercise every branch, or the equality above proves little.
    expect(lostSeen).toBeGreaterThan(0);
    expect(orphansSeen).toBeGreaterThan(0);
    expect(blockedSeen).toBeGreaterThan(0);
  });

  it("UT-ADDCOST-072 gridToJson emits the same rows, copying only the cells it rewrites, and leaves the grid alone", () => {
    for (const seed of SEEDS) {
      const w = world(seed);
      const grid = sheetRowsToGrid(w.sheet(25), w.accounts, w.years);
      // Hand-edited rows the way the grid holds them: blanks, a ragged row, an added row with
      // its account fields typed in, missing values.
      grid.push([{ value: "80001_1" }, { value: "" }, { value: "Typed" }, { value: undefined as unknown as string },
        { value: "Yes" }, { value: "" }, { value: "4" }]);
      grid.splice(2, 0, Array.from({ length: 6 + w.years.length * 12 }, (_, i) => ({ value: i === 2 ? "Late" : w.rand() < 0.5 ? "" : "9" })));
      const before = JSON.stringify(grid);
      expect(gridToJson(grid, "2019"), `seed ${seed}`).toEqual(oracleGridToJson(grid, "2019"));
      expect(JSON.stringify(grid), `seed ${seed} grid untouched`).toBe(before);
    }
  });

  it("UT-ADDCOST-073 the (account, year) identity index matches exactly what the identity string matched", () => {
    // Identities that collide or nearly collide as strings: a contract id spelled like a text
    // account, "|" inside descriptions, and the years a string and a Map key could disagree on.
    const years = [2020, 0, -0, Number.NaN, 2020.5];
    const accounts: Partial<SheetRow>[] = [
      { projectContractId: "80000_0|Turbine|Alpha" },
      { projectContractId: null, accountNumber: "80000_0", accountName: "Turbine", description: "Alpha" },
      { projectContractId: null, accountNumber: "80000_0", accountName: "Turbine|Alpha", description: "" },
      { projectContractId: null, accountNumber: "80000_0|Turbine", accountName: "Alpha", description: "" },
      { projectContractId: "c|2020" }, { projectContractId: "c" },
    ];
    const all = accounts.flatMap((a, i) => years.map((year, j) => row({ ...a, year, rowId: `R${i}-${j}` })));
    for (let seed = 0; seed < 200; seed += 1) {
      const rand = seeded(seed);
      const original = all.filter(() => rand() < 0.6).map((r) => ({ ...r, rowId: `O${Math.floor(rand() * 5)}` }));
      const current = all.filter(() => rand() < 0.6).map((r) => ({ ...r, rowId: `C${Math.floor(rand() * 5)}` }));
      expect(alignOriginalRowIds(original, current), `seed ${seed}`).toEqual(oracleAlign(original, current));
      const args = {
        loadedRows: [], roundTripped: [], originalRows: original, currentRows: current,
        contracts: [], costs: [], currentYear: 2020, canvasParityDeletion: true,
      };
      const { timings: _t, ...actual } = prepareSheetSave(args);
      expect(actual, `seed ${seed} prepare`).toEqual(oracleScreenPrepare(args));
    }
  });

  it("UT-ADDCOST-066 prepareSheetSave reports each step's time from the injected clock", () => {
    let tick = 0;
    const rows = buildInitialSheet({
      subaccounts: SUBACCOUNTS, contracts: [contract()],
      costs: [{ id: "k1", contractId: "c-1", year: 2015, month: 1, cost: 5 }], currentYear: 2015,
    });
    const prepared = prepareSheetSave({
      loadedRows: rows, roundTripped: rows, originalRows: rows, currentRows: rows,
      contracts: [contract()], costs: [], currentYear: 2015, canvasParityDeletion: true,
      now: () => (tick += 1),
    });
    expect(prepared.kind).toBe("ready");
    expect(prepared.timings).toEqual({
      roundTripCheck: 1, align: 1, diff: 1, deletions: 1, orphans: 1, total: 5,
    });
    // Without a clock (rules stay pure) every step reads 0.
    expect(prepareSheetSave({
      loadedRows: rows, roundTripped: rows, originalRows: rows, currentRows: rows,
      contracts: [], costs: [], currentYear: 2015, canvasParityDeletion: true,
    }).timings.total).toBe(0);
  });
});

/* ═════════════════════ the Save reports only what was edited (UT-ADDCOST-079..) ══ */

/**
 * The `prepare.bench.test.ts` shape, small: accounts x sub-accounts x contracts x years, one
 * stored cost per (contract, year), round-tripped through the REAL grid, where every contract
 * row under one sub-account comes back with the same `Row_ID`.
 */
describe("prepareSheetSave reports edited rows only, through a real grid round trip", () => {
  const YEARS = [2020, 2021, 2022, 2023];
  const accounts: SheetAccountGroup[] = Array.from({ length: 4 }, (_, a) => ({
    id: `acc-${a}`, number: String(80000 + a), name: `Account ${a}`,
    subaccounts: Array.from({ length: 2 }, (__, s) => ({
      id: `sub-${a}-${s}`, number: `${80000 + a}_${s}`, name: `Account ${a}`,
    })),
  }));
  const subaccounts = accounts.flatMap((a) => a.subaccounts);
  const contracts: ExistingContract[] = subaccounts.flatMap((sub) => Array.from({ length: 3 }, (_, k) => contract({
    id: `c-${sub.id}-${k}`, name: `Contract ${k} of ${sub.number}`, subaccountId: sub.id,
    costType: k % 2 === 0 ? 952850001 : 952850002, applyVat: k % 3 === 0,
  })));
  const costs: ExistingCost[] = contracts.flatMap((c, i) => YEARS.map((year) => ({
    id: `k-${c.id}-${year}`, contractId: c.id, year, month: 1 + ((i + year) % 12), cost: 10 + i + year,
  })));

  const loadedRows = buildInitialSheet({ subaccounts, contracts, costs, currentYear: 2021 });
  const grid = sheetRowsToGrid(loadedRows, accounts, YEARS);
  const readBack = (g: SheetGrid) => outputRowsToSheetRows(gridToJson(g, String(YEARS[0])), subaccounts, contracts);
  const roundTripped = readBack(grid);
  const prepare = (currentRows: SheetRow[]) => {
    const p = prepareSheetSave({
      loadedRows, roundTripped, originalRows: roundTripped, currentRows, contracts, costs,
      currentYear: 2021, canvasParityDeletion: true,
    });
    if (p.kind !== "ready") throw new Error("round trip lost a contract");
    return p;
  };
  const copy = (g: SheetGrid): SheetGrid => g.map((r) => r.map((c) => ({ ...c })));
  /** The grid indexes of the contract rows (blank account number, a description). */
  const contractRowIndexes = grid.map((_r, i) => i).filter((i) => i > 0 && grid[i]?.[0]?.value === "" && grid[i]?.[2]?.value !== "");

  it("UT-ADDCOST-079 the fixture really shares one Row_ID across a sub-account's contracts and years", () => {
    expect(roundTripped).toHaveLength(contracts.length * YEARS.length);
    const bySub = new Map<string | null, Set<string>>();
    for (const r of roundTripped) bySub.set(r.subAccountId, (bySub.get(r.subAccountId) ?? new Set()).add(r.rowId));
    for (const ids of bySub.values()) expect(ids.size).toBe(1);
  });

  it("UT-ADDCOST-080 an unedited sheet gives 0 changed rows", () => {
    const p = prepare(readBack(copy(grid)));
    expect(p.changed).toEqual([]);
    expect(p.orphanCleanup).toEqual([]);
    expect(p.deletion.deleteIds).toEqual([]);
  });

  it("UT-ADDCOST-081 a single edited cell gives exactly that (contract, year) row", () => {
    const edited = copy(grid);
    const ri = contractRowIndexes[5] as number;
    const yearBlock = 2; // 2022
    const ci = 6 + yearBlock * 12 + 4; // May
    const target = edited[ri]?.[ci] as SheetCell;
    target.value = "4242";
    const { changed } = prepare(readBack(edited));
    expect(changed).toHaveLength(1);
    expect(changed[0]?.description).toBe(edited[ri]?.[2]?.value);
    expect(changed[0]?.year).toBe(2022);
    expect(changed[0]?.months[4]).toBe(4242);
  });

  it("UT-ADDCOST-082 a metadata edit reports every year of that grid row, and nothing else", () => {
    const edited = copy(grid);
    const ri = contractRowIndexes[3] as number;
    const vat = edited[ri]?.[5] as SheetCell;
    vat.value = vat.value === "Yes" ? "No" : "Yes";
    const { changed } = prepare(readBack(edited));
    expect(changed.map((r) => r.year)).toEqual(YEARS);
    expect(new Set(changed.map((r) => r.projectContractId)).size).toBe(1);
  });

  it("UT-ADDCOST-083 a removed row is not in the diff (the orphan clean-up takes it); an added row is", () => {
    const edited = copy(grid);
    const removed = edited[contractRowIndexes[0] as number]?.[2]?.value;
    edited.splice(contractRowIndexes[0] as number, 1);
    const width = edited[0]?.length ?? 0;
    edited.splice(contractRowIndexes[2] as number, 0, Array.from({ length: width }, (_, ci) => ({
      value: ci === 2 ? "Brand new" : ci === 3 ? "DevCo" : ci === 4 || ci === 5 ? "Yes" : ci === 6 ? "100" : "",
    })));
    const p = prepare(readBack(edited));
    expect(p.changed.every((r) => r.description === "Brand new")).toBe(true);
    expect(p.changed).toHaveLength(YEARS.length);
    expect(p.changed.some((r) => r.description === removed)).toBe(false);
    // Canvas-parity deletion removes the contract outright, so nothing is left to blank.
    expect(p.deletion.deleteIds).toHaveLength(1);
  });

  /** A new contract row typed into the grid: name, DevCo, Yes, Yes, and one value at `column`. */
  const newRow = (name: string, column: number, value: string): SheetCell[] =>
    Array.from({ length: grid[0]?.length ?? 0 }, (_, ci) => ({
      value: ci === 2 ? name : ci === 3 ? "DevCo" : ci === 4 || ci === 5 ? "Yes" : ci === column ? value : "",
    }));

  it("UT-ADDCOST-087 CA-12 through the real grid: two new same-named rows under one sub-account, months not overlapping, disable Save", () => {
    expect(validateSheet(roundTripped)).toEqual([]); // the unedited sheet is clean
    const edited = copy(grid);
    const at = contractRowIndexes[2] as number;
    edited.splice(at, 0, newRow("Twin", 6, "100"), newRow("Twin", 7, "200")); // Jan / Feb 2020
    const current = readBack(edited);
    const twins = current.filter((r) => r.description === "Twin");
    // Both rows come back under one sub-account with ONE Row_ID, so the canvas key matches.
    expect(new Set(twins.map((r) => r.rowId)).size).toBe(1);
    expect(twins).toHaveLength(2 * YEARS.length);
    expect(validateDuplicateContracts(current)).toHaveLength(2 * YEARS.length);
    expect(validateSheet(current).map((e) => e.message)).toEqual([`Twin${ADDCOST_MSG.duplicateContract}`]);
    // One such row alone is fine.
    const single = copy(grid);
    single.splice(at, 0, newRow("Twin", 6, "100"));
    expect(validateSheet(readBack(single))).toEqual([]);
  });

  it("UT-ADDCOST-088 canvas parity: two STORED contracts sharing a name under one sub-account and a year are refused too", () => {
    // Legal in Dataverse, and shown as two grid rows (bijection in `outputRowsToSheetRows`); the
    // canvas `CostCountRows > 1` refuses them, so this screen now does as well.
    const sub = subaccounts[0] as (typeof subaccounts)[number];
    const twins = [
      contract({ id: "c-twin-1", name: "Same", subaccountId: sub.id }),
      contract({ id: "c-twin-2", name: "Same", subaccountId: sub.id }),
    ];
    const twinCosts: ExistingCost[] = [
      { id: "k-t1", contractId: "c-twin-1", year: 2021, month: 1, cost: 5 },
      { id: "k-t2", contractId: "c-twin-2", year: 2021, month: 2, cost: 6 },
    ];
    const all = [...contracts, ...twins];
    const rows = buildInitialSheet({ subaccounts, contracts: all, costs: [...costs, ...twinCosts], currentYear: 2021 });
    const back = outputRowsToSheetRows(
      gridToJson(sheetRowsToGrid(rows, accounts, YEARS), String(YEARS[0])), subaccounts, all,
    );
    expect(new Set(back.filter((r) => r.description === "Same").map((r) => r.projectContractId)))
      .toEqual(new Set(["c-twin-1", "c-twin-2"]));
    expect(validateSheet(back).map((e) => e.message)).toEqual([`Same${ADDCOST_MSG.duplicateContract}`]);
  });
});
