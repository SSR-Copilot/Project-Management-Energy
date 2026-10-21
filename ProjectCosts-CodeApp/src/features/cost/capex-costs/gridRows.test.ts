/**
 * `gridRows` — the DEVEX/CAPEX grid's row set.
 *
 * The point of most of these is EQUIVALENCE. The function was rewritten from a readable but
 * quadratic shape into an indexed single pass, so the risk is not "does it work" but "does it
 * still produce exactly what the PCF was given before". `reference()` below is the original
 * implementation, kept verbatim, and `UT-GRID-010` compares the two on generated data.
 */
import { describe, expect, it } from "vitest";
import { gridRows, type FlatRow } from "./gridRows";
import {
  COMMENT_TYPE, commentThreads, gridCommentIndicators, type CapexComment,
} from "./comments";
import { total, type CostAccount, type CostLine, type Payment } from "../costing/model";

/* ─────────────────────────────────────────────────────────────── fixtures ── */

const account = (id: string, over: Partial<CostAccount> = {}): CostAccount => ({
  id, number: id, name: `Account ${id}`, category: 0, ...over,
});

const pay = (year: number, month: number, amount: number, paid = false): Payment =>
  ({ year, month, amount, paid });

/**
 * A contract as `loadCostLines` produces one.
 *
 * `startDate`/`endDate`/`clusters` are EMPTY by default, which is what a contract with no
 * `vsb_bystartenddatejson` and no `vsb_byclusterjson` reads back as — and is what keeps the
 * default `SubLabel` at the bare `[payer]`. The sub-label's distribution half has its own tests
 * (UT-GRID-019/020 here, `contractSubLabel` in `rules.test.ts`).
 */
const line = (id: string, accountId: string, payments: Payment[], over: Partial<CostLine> = {}): CostLine => ({
  id, accountId, description: `Cost ${id}`, payer: "SPV",
  depreciation: true, vat: true, standard: false,
  distribution: "equal", equalMode: "cluster", distributionScheme: "absolute",
  startDate: "", endDate: "", frequency: 1, clusters: [],
  payments, comments: [], ...over,
});

/** Accounts: one level-2 `80000` with a subaccount `80000_0`. */
const ACCOUNTS: CostAccount[] = [account("80000"), account("80000_0", { parentId: "80000" })];

const rowById = (rows: FlatRow[], id: string) => rows.find((r) => r.RowId === id);

/** A `vsb_capexcommentses` row on contract `c1`, the contract the fixtures above use. */
const comment = (over: Partial<CapexComment> = {}): CapexComment => ({
  id: "cm1", text: "hello", contractId: "c1", costId: null, parentId: null, rootId: null,
  commentType: COMMENT_TYPE.general, resolved: false, resolvedById: null,
  createdOn: "2026-01-01T00:00:00Z", createdByName: "Shakti", ...over,
});

/* ──────────────────────────────────────────────── the original, verbatim ── */

function reference(accounts: CostAccount[], lines: CostLine[], year: number): FlatRow[] {
  const sums = (costs: CostLine[]) => {
    const payments = costs.flatMap((c) => c.payments);
    return {
      TotalCost: total(payments),
      ActualCost: total(payments.filter((p) => p.paid)),
      PlannedCost: total(payments.filter((p) => !p.paid)),
      ...Object.fromEntries(Array.from({ length: 12 }, (_, m) =>
        [`M${m + 1}`, total(payments.filter((p) => p.year === year && p.month === m + 1))])),
    };
  };
  return accounts.flatMap((acct) => {
    const subIds = accounts.filter((a) => a.parentId === acct.id).map((a) => a.id);
    const costs = lines.filter((c) => c.accountId === acct.id || subIds.includes(c.accountId));
    const row: FlatRow = {
      RowId: acct.id, ParentId: acct.parentId ?? "",
      Type: acct.parentId ? "subaccount" : "account",
      Number: acct.number, Name: acct.name, ...sums(costs),
    };
    return [row, ...(acct.parentId ? costs.map((c) => ({
      RowId: c.id, ParentId: acct.id, Type: "contract", Number: "", Name: c.description,
      SubLabel: `[${c.payer}]`, CostPaidBy: c.payer, IsStandardContract: c.standard,
      DistributionType: c.distribution === "individual" ? "Individual Distribution" : "Equal Distribution",
      HasComments: false, CommentTooltip: "", ...sums([c]),
      ...Object.fromEntries(Array.from({ length: 12 }, (_, m) =>
        [`M${m + 1}Paid`, c.payments.some((p) => p.year === year && p.month === m + 1 && p.paid)])),
      ...Object.fromEntries(Array.from({ length: 12 }, (_, m) => [`M${m + 1}HasComments`, false])),
      // Added with the comment indicators (stage 2.4): the canvas emits a month tooltip on every
      // contract row, `""` when the month has nothing to say.
      ...Object.fromEntries(Array.from({ length: 12 }, (_, m) => [`M${m + 1}CommentTooltip`, ""])),
    })) : [])];
  });
}

/** The `gridCommentIndicators` shape `gridRows` consumes, with sensible empties. */
const flags = (over: Partial<{
  general: boolean; generalTooltip: string; months: boolean[]; monthTooltips: string[];
}> = {}) => ({
  general: false, generalTooltip: "",
  months: new Array<boolean>(12).fill(false),
  monthTooltips: new Array<string>(12).fill(""),
  ...over,
});

/* ────────────────────────────────────────────────────────────────── tests ── */

describe("gridRows", () => {
  it("UT-GRID-001 emits an account row, a subaccount row, and contracts under the subaccount", () => {
    const rows = gridRows(ACCOUNTS, [line("c1", "80000_0", [pay(2026, 1, 100)])], 2026);

    expect(rows.map((r) => r.Type)).toEqual(["account", "subaccount", "contract"]);
    expect(rowById(rows, "c1")?.ParentId).toBe("80000_0");
  });

  it("UT-GRID-002 rolls a subaccount's money up into its parent account", () => {
    const rows = gridRows(ACCOUNTS, [line("c1", "80000_0", [pay(2026, 3, 250)])], 2026);

    expect(rowById(rows, "80000")?.TotalCost).toBe(250);
    expect(rowById(rows, "80000")?.M3).toBe(250);
  });

  it("UT-GRID-003 counts a cost filed directly on the account but gives it no contract row", () => {
    // The canvas grid hangs contracts off sub-accounts only; money on a level-2 account still
    // has to appear in that account's totals or the Grand Total stops reconciling.
    const rows = gridRows(ACCOUNTS, [line("direct", "80000", [pay(2026, 1, 40)])], 2026);

    expect(rowById(rows, "80000")?.TotalCost).toBe(40);
    expect(rows.some((r) => r.Type === "contract")).toBe(false);
  });

  it("UT-GRID-004 splits paid and unpaid into Actual and Planned", () => {
    const rows = gridRows(ACCOUNTS, [
      line("c1", "80000_0", [pay(2026, 1, 100, true), pay(2026, 2, 40)]),
    ], 2026);

    const row = rowById(rows, "c1");
    expect(row?.TotalCost).toBe(140);
    expect(row?.ActualCost).toBe(100);
    expect(row?.PlannedCost).toBe(40);
  });

  it("UT-GRID-005 counts every year in the totals but only the selected year in the months", () => {
    const rows = gridRows(ACCOUNTS, [
      line("c1", "80000_0", [pay(2025, 5, 70), pay(2026, 5, 30)]),
    ], 2026);

    const row = rowById(rows, "c1");
    expect(row?.TotalCost).toBe(100);
    expect(row?.M5).toBe(30);
  });

  it("UT-GRID-006 marks a month paid only when a payment in that month is paid", () => {
    const rows = gridRows(ACCOUNTS, [
      line("c1", "80000_0", [pay(2026, 1, 10, true), pay(2026, 2, 10)]),
    ], 2026);

    const row = rowById(rows, "c1");
    expect(row?.M1Paid).toBe(true);
    expect(row?.M2Paid).toBe(false);
  });

  it("UT-GRID-007 sums several contracts in one subaccount", () => {
    const rows = gridRows(ACCOUNTS, [
      line("c1", "80000_0", [pay(2026, 1, 10)]),
      line("c2", "80000_0", [pay(2026, 1, 25)]),
    ], 2026);

    expect(rowById(rows, "80000_0")?.M1).toBe(35);
    expect(rows.filter((r) => r.Type === "contract")).toHaveLength(2);
  });

  it("UT-GRID-008 carries the contract's display fields", () => {
    const rows = gridRows(ACCOUNTS, [
      line("c1", "80000_0", [], {
        payer: "DevCo", standard: true, distribution: "individual",
      }),
    ], 2026);

    const row = rowById(rows, "c1");
    expect(row?.SubLabel).toBe("[DevCo]");
    expect(row?.IsStandardContract).toBe(true);
    expect(row?.DistributionType).toBe("Individual Distribution");
  });

  it("UT-GRID-008b HasComments comes from the commentFlags parameter, not the dead comments field", () => {
    const rows = gridRows(
      ACCOUNTS,
      [line("c1", "80000_0", [])],
      2026,
      new Map([["c1", { general: true, months: new Array(12).fill(false) }]]),
    );
    expect(rowById(rows, "c1")?.HasComments).toBe(true);
    expect(gridRows(ACCOUNTS, [line("c1", "80000_0", [])], 2026).find((r) => r.RowId === "c1")?.HasComments).toBe(false);
  });

  it("UT-GRID-008c emits CommentTooltip and every M{n}CommentTooltip, blank where there is none", () => {
    const rows = gridRows(ACCOUNTS, [line("c1", "80000_0", [])], 2026, new Map([
      ["c1", flags({
        general: true, generalTooltip: "latest general",
        months: [false, false, true, ...new Array<boolean>(9).fill(false)],
        monthTooltips: ["", "", "March thread", ...new Array<string>(9).fill("")],
      })],
    ]));

    const row = rowById(rows, "c1");
    expect(row?.CommentTooltip).toBe("latest general");
    expect(row?.M3HasComments).toBe(true);
    expect(row?.M3CommentTooltip).toBe("March thread");
    // All twelve are present — the PCF reads a missing column as absent, not as empty.
    for (let m = 1; m <= 12; m += 1) expect(row).toHaveProperty(`M${m}CommentTooltip`);
    expect(row?.M4CommentTooltip).toBe("");
  });

  it("UT-GRID-008d leaves both tooltips blank when the contract has no flags at all", () => {
    const row = rowById(gridRows(ACCOUNTS, [line("c1", "80000_0", [])], 2026), "c1");
    expect(row?.CommentTooltip).toBe("");
    expect(row?.M7CommentTooltip).toBe("");
    expect(row?.HasComments).toBe(false);
  });

  it("UT-GRID-008e carries real comment threads through to the row's dots and tooltips", () => {
    // The whole path the screen uses: Dataverse rows -> threads -> indicators -> grid row.
    const costs = [{ id: "cost-mar-26", contractId: "c1", year: 2026, month: 3 }];
    const threads = commentThreads([
      comment({ id: "g1", text: "parent text" }),
      comment({ id: "g1-r1", parentId: "g1", text: "reply wins", createdOn: "2026-02-01T00:00:00Z" }),
      comment({ id: "resolved", text: "invisible", resolved: true, createdOn: "2026-03-01T00:00:00Z" }),
      comment({
        id: "p1", text: "pay March", commentType: COMMENT_TYPE.paymentDate, costId: "cost-mar-26",
      }),
    ]);

    const rows = gridRows(ACCOUNTS, [line("c1", "80000_0", [])], 2026,
      gridCommentIndicators(threads, costs, 2026));
    const row = rowById(rows, "c1");

    expect(row?.HasComments).toBe(true);
    // The latest REPLY wins over its parent, and the resolved thread never competes for it.
    expect(row?.CommentTooltip).toBe("reply wins");
    expect(row?.M3HasComments).toBe(true);
    expect(row?.M3CommentTooltip).toBe("pay March");
    expect(row?.M4HasComments).toBe(false);
  });

  it("UT-GRID-008f drops the month dot when the grid is showing another year", () => {
    const costs = [{ id: "cost-mar-26", contractId: "c1", year: 2026, month: 3 }];
    const threads = commentThreads([comment({
      id: "p1", text: "pay March", commentType: COMMENT_TYPE.paymentDate, costId: "cost-mar-26",
    })]);

    const row = rowById(
      gridRows(ACCOUNTS, [line("c1", "80000_0", [])], 2027, gridCommentIndicators(threads, costs, 2027)),
      "c1",
    );
    expect(row?.M3HasComments).toBe(false);
    expect(row?.M3CommentTooltip).toBe("");
    // A payment-date comment never lights the contract-level dot either.
    expect(row?.HasComments).toBe(false);
  });

  it("UT-GRID-009 ignores a payment whose month is out of range instead of throwing", () => {
    // Dataverse should never produce this, but an unmapped picklist would arrive as 0 and
    // writing to `months[-1]` would corrupt the row rather than fail loudly.
    const rows = gridRows(ACCOUNTS, [line("c1", "80000_0", [pay(2026, 0, 99)])], 2026);

    const row = rowById(rows, "c1");
    expect(row?.TotalCost).toBe(99);
    expect(row?.M1).toBe(0);
  });

  it("UT-GRID-010 matches the original implementation on generated data", () => {
    // 40 accounts x 3 contracts x 24 payments, deterministic — the equivalence proof.
    const accounts: CostAccount[] = [];
    const lines: CostLine[] = [];
    for (let a = 0; a < 20; a += 1) {
      accounts.push(account(`8${a}000`));
      accounts.push(account(`8${a}000_0`, { parentId: `8${a}000` }));
      for (let c = 0; c < 3; c += 1) {
        const payments: Payment[] = [];
        for (let m = 0; m < 24; m += 1) {
          payments.push(pay(2025 + (m % 2), (m % 12) + 1, (a + c + m) * 7, (a + m) % 3 === 0));
        }
        lines.push(line(`c-${a}-${c}`, `8${a}000_0`, payments, {
          payer: c % 2 === 0 ? "DevCo" : "SPV",
          standard: c === 2,
          distribution: c === 1 ? "individual" : "equal",
          comments: c === 0 ? ["note"] : [],
        }));
      }
      // One cost filed straight on the account, to exercise the roll-up path.
      lines.push(line(`direct-${a}`, `8${a}000`, [pay(2026, 6, a * 11)]));
    }

    expect(gridRows(accounts, lines, 2026)).toEqual(reference(accounts, lines, 2026));
  });

  it("UT-GRID-011 stays fast on a project-sized data set", () => {
    // The regression this guards: the old shape was accounts x lines x payments x 15 and ran
    // on every repaint. This is a smoke alarm, not a benchmark — it fails only if the
    // complexity goes back to quadratic.
    const accounts: CostAccount[] = [];
    const lines: CostLine[] = [];
    for (let a = 0; a < 100; a += 1) {
      accounts.push(account(`9${a}`));
      accounts.push(account(`9${a}_0`, { parentId: `9${a}` }));
      for (let c = 0; c < 5; c += 1) {
        const payments = Array.from({ length: 192 }, (_, m) =>
          pay(2015 + Math.floor(m / 12), (m % 12) + 1, 100, m % 4 === 0));
        lines.push(line(`c${a}-${c}`, `9${a}_0`, payments));
      }
    }
    expect(lines).toHaveLength(500);

    const started = performance.now();
    const rows = gridRows(accounts, lines, 2026);
    const elapsed = performance.now() - started;

    expect(rows.length).toBe(200 + 500);
    expect(elapsed).toBeLessThan(500);
  });

  /* ── TotalCost's source ───────────────────────────────────────────────────
   * `varTotalCost: Coalesce(C.'Total Cost', Sum(Filter('CAPEX Costs', Contract = C), Cost), 0)`
   * — `Capex Costs Screen.pa.yaml:1536-1546`.
   *
   * THIS IS HALF OF A DELIBERATE ASYMMETRY. The grid reads the contract's STORED total; the
   * Summary tab reads the SUM OF THE COST ROWS (`loadCapexTotals`, pinned by UT-BOOK-032..038).
   * They are two different canvas expressions and unifying them breaks one screen or the other.
   */

  it("UT-GRID-012 shows the contract's STORED total, not the sum of its cost rows", () => {
    // "Desc" on Wirmighausen: `vsb_totalcost` 52,000 against cost rows summing 55,000. We
    // showed 55,000.
    const rows = gridRows(ACCOUNTS, [
      line("c1", "80000_0", [pay(2026, 1, 30_000), pay(2026, 2, 25_000)], { totalCost: 52_000 }),
    ], 2026);

    expect(rowById(rows, "c1")?.TotalCost).toBe(52_000);
    // The months are untouched — they are the cost rows, and only the total changed source.
    expect(rowById(rows, "c1")?.M1).toBe(30_000);
    expect(rowById(rows, "c1")?.M2).toBe(25_000);
  });

  it("UT-GRID-013 falls back to the sum of the cost rows when nothing is stored", () => {
    const rows = gridRows(ACCOUNTS, [
      line("c1", "80000_0", [pay(2026, 1, 30_000), pay(2026, 2, 25_000)]),
    ], 2026);
    expect(rowById(rows, "c1")?.TotalCost).toBe(55_000);
  });

  it("UT-GRID-014 lets a stored ZERO win — Coalesce skips blanks, and 0 is not blank", () => {
    const rows = gridRows(ACCOUNTS, [
      line("c1", "80000_0", [pay(2026, 1, 999)], { totalCost: 0 }),
    ], 2026);
    expect(rowById(rows, "c1")?.TotalCost).toBe(0);
  });

  it("UT-GRID-015 rolls the STORED totals up into the subaccount and account", () => {
    // `:2250-2289` sums `TotalCostAmount`, which is `varTotalCost` — so the stored figure
    // propagates all the way to the Grand Total.
    const rows = gridRows(ACCOUNTS, [
      line("c1", "80000_0", [pay(2026, 1, 55_000)], { totalCost: 52_000 }),
      line("c2", "80000_0", [pay(2026, 2, 500)]),
    ], 2026);

    expect(rowById(rows, "80000_0")?.TotalCost).toBe(52_500);
    expect(rowById(rows, "80000")?.TotalCost).toBe(52_500);
    // The months still reconcile to the cost rows, which is exactly why they no longer add up
    // to the total — and the canvas has the same gap.
    expect(rowById(rows, "80000")?.M1).toBe(55_000);
  });

  it("UT-GRID-016 derives Planned from the stored total minus what is paid", () => {
    // `PlannedCostAmount: varTotalCost - varPaidCost` (`:1563`). Actual stays sourced from the
    // paid cost rows, so fixing Total fixes Planned and leaves Actual alone.
    const rows = gridRows(ACCOUNTS, [
      line("c1", "80000_0", [pay(2026, 1, 30_000, true), pay(2026, 2, 25_000)], {
        totalCost: 52_000,
      }),
    ], 2026);

    const row = rowById(rows, "c1");
    expect(row?.ActualCost).toBe(30_000);
    expect(row?.PlannedCost).toBe(22_000);
  });

  it("UT-GRID-017 keeps the fraction the stored total rounds away when nothing is stored", () => {
    // `Gesamt (59013_0_47110102)`: stored 3,162,000, rows 3,161,999.96. With the total stored
    // the grid shows the round figure; strip it and the rows' own sum shows through.
    const payments = [pay(2026, 1, 3_161_999.96)];
    expect(rowById(gridRows(ACCOUNTS, [
      line("c1", "80000_0", payments, { totalCost: 3_162_000 }),
    ], 2026), "c1")?.TotalCost).toBe(3_162_000);
    expect(rowById(gridRows(ACCOUNTS, [line("c1", "80000_0", payments)], 2026), "c1")?.TotalCost)
      .toBe(3_161_999.96);
  });

  /* ── order and sub-label ──────────────────────────────────────────────── */

  it("UT-GRID-018 orders a subaccount's contracts by description, not by fetch order", () => {
    // `SortByColumns(…, "vsb_costdescription", SortOrder.Ascending)` (`:1404-1414`).
    const rows = gridRows(ACCOUNTS, [
      line("c1", "80000_0", [], { description: "Windgutachten" }),
      line("c2", "80000_0", [], { description: "Bescheide" }),
      line("c3", "80000_0", [], { description: "Statische Berechnungen" }),
    ], 2026);

    expect(rows.filter((r) => r.Type === "contract").map((r) => r.Name))
      .toEqual(["Bescheide", "Statische Berechnungen", "Windgutachten"]);
  });

  it("UT-GRID-019 carries the equal distribution's clusters into the sub-label", () => {
    const rows = gridRows(ACCOUNTS, [
      line("c1", "80000_0", [], { payer: "DevCo", clusters: [1, 2] }),
    ], 2026);
    expect(rowById(rows, "c1")?.SubLabel).toBe("[DevCo]Distribution to Cluster 1 & 2");
  });

  it("UT-GRID-020 carries the equal distribution's date range into the sub-label", () => {
    const rows = gridRows(ACCOUNTS, [
      line("c1", "80000_0", [], { startDate: "2017-12-01", endDate: "2026-06-01" }),
    ], 2026);
    expect(rowById(rows, "c1")?.SubLabel).toBe("[SPV]Distribution from 12/2017 to 06/2026");
  });
});
