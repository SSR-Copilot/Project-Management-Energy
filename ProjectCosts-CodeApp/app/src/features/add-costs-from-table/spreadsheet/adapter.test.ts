/**
 * The grid/adapter layer, pinned against the canvas it is a port of.
 *
 * The reference layout is `Existing Solution/UI Screenshots/Cost App - Add Cost from table
 * screen - After clicking on Add cost from table button.png`, reproduced row-for-row below —
 * it is the only artefact that shows what the real screen emits, and four shipped defects
 * (account rows collapsed onto sub-accounts, a filler row canvas never had, "Jan/2026" header
 * labels, and a broken identity round trip that deleted ~168 live cost rows on one save) were
 * all invisible without it.
 */
import { describe, expect, it } from "vitest";
import {
  ACCOUNT_MARKER, alignOriginalRowIds, identityRoundTripFailures, monthHeaderLabels,
  outputRowsToSheetRows, rowIdentity, sheetRowsToGrid, type SheetAccountGroup,
} from "./adapter";
import { gridToJson, wholeNumberCell } from "./SpreadSheet";
import {
  buildInitialSheet, planContractDeletions, planContractDeletionsCanvasParity,
  type ExistingContract, type ExistingCost, type SheetRow,
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
