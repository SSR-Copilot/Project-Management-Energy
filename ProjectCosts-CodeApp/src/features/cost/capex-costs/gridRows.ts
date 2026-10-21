/**
 * The DEVEX/CAPEX grid's row set, built in one pass.
 *
 * This was inline in `PcfGrid.tsx` and was the screen's main cost. The old shape was, per
 * account:
 *
 *   accounts.filter(...)                      // O(accounts)
 *   lines.filter(c => subIds.includes(...))   // O(lines x subaccounts)
 *   sums(costs)                               // 15 separate passes over every payment
 *
 * so the work grew as `accounts x lines x payments x 15`. On a real project — a few hundred
 * accounts, a few hundred contracts, ~200 monthly rows each — that is tens of millions of
 * operations, and it ran again on **every repaint**, including every `ResizeObserver` fire.
 *
 * Here each payment is visited exactly once, lookups are by index, and an account's totals are
 * its own lines plus its children's, added rather than recomputed. `gridRows.test.ts` pins the
 * details that are easy to lose: `TotalCost` is the contract's STORED total and only falls back
 * to the sum of its cost rows (`aggregateLine`), `PlannedCost` is that total minus paid, an
 * account row carries its subaccounts' money, and contract rows are only emitted under
 * subaccounts, sorted by description.
 */
import { type CostAccount, type CostLine } from "../costing/model";
import { contractSubLabel } from "./rules";

export type FlatRow = Record<string, string | number | boolean>;

/** One line's money, in a single pass over its payments. */
interface Aggregate {
  /**
   * `varTotalCost` — the contract's STORED total, falling back to the sum of its cost rows.
   * Not the sum of `months`, and not the sum of `payments`. See `aggregateLine`.
   */
  total: number;
  actual: number;
  /** Index 0 = January of the selected year. */
  months: number[];
  /** Whether the selected year's month has any paid payment. Contract rows only. */
  paidMonths: boolean[];
}

const emptyAggregate = (): Aggregate => ({
  total: 0,
  actual: 0,
  months: new Array<number>(12).fill(0),
  paidMonths: new Array<boolean>(12).fill(false),
});

/**
 * One contract's money.
 *
 * `total` is **not** the sum of the monthly rows. The canvas is explicit
 * (`Capex Costs Screen.pa.yaml:1536-1546`):
 *
 *     varTotalCost: Coalesce(C.'Total Cost', Sum(Filter('CAPEX Costs', Contract = C), Cost), 0)
 *
 * — the contract's STORED `vsb_totalcost` wins, and the sum of the cost rows is only the
 * fallback for a contract that has none. The account/sub-account roll-ups at `:2250-2289` then
 * sum that same figure, so the choice propagates all the way to the Grand Total. Both
 * `ControlManifest.Input.xml:26-28` and `GridModels.ts:12-16` say the PCF must render these
 * totals as given and never re-derive them.
 *
 * The two genuinely differ in live data — on Wirmighausen the contract "Desc" stores 52,000
 * while its rows sum to 55,000, and `Gesamt (59013_0_47110102)` stores 3,162,000 against rows
 * of 3,161,999.96 — so re-deriving showed the wrong number on the grid's most-read column.
 *
 * A stored ZERO still wins: `Coalesce` skips blanks, and 0 is not blank.
 *
 * Everything else here stays sourced from the cost rows — `actual` is the paid ones
 * (`varPaidCost`), the twelve months are the selected year's, and `PlannedCost` is
 * `varTotalCost - varPaidCost` (`:1563`), which is why fixing the total fixes Planned too.
 */
function aggregateLine(line: CostLine, year: number): Aggregate {
  const out = emptyAggregate();
  let rowSum = 0;
  for (const p of line.payments) {
    rowSum += p.amount;
    if (p.paid) out.actual += p.amount;
    if (p.year === year) {
      const i = p.month - 1;
      if (i >= 0 && i < 12) {
        out.months[i] = (out.months[i] as number) + p.amount;
        if (p.paid) out.paidMonths[i] = true;
      }
    }
  }
  out.total = line.totalCost ?? rowSum;
  return out;
}

function addInto(target: Aggregate, source: Aggregate): void {
  target.total += source.total;
  target.actual += source.actual;
  for (let i = 0; i < 12; i += 1) {
    target.months[i] = (target.months[i] as number) + (source.months[i] as number);
  }
}

/**
 * Contracts, by description ascending — the canvas' merge step
 * (`Capex Costs Screen.pa.yaml:1404-1414`):
 *
 *     SortByColumns(Filter(colCapexContractCostGrouped_V1, vsb_parentaccountid = Item.…),
 *                   "vsb_costdescription", SortOrder.Ascending)
 *
 * `vsb_costdescription` in that collection is the contract's `Coalesce(Description, Name)`,
 * which is exactly `CostLine.description`. We rendered in fetch order, which is Dataverse's
 * (effectively arbitrary) order, so the same sub-account listed its contracts differently from
 * the canvas app. The sort is stable, so two contracts sharing a description keep fetch order.
 */
function sortedByDescription(lines: readonly CostLine[]): CostLine[] {
  return [...lines].sort((a, b) => a.description.localeCompare(b.description));
}

/** The `TotalCost` / `PlannedCost` / `ActualCost` / `M1..M12` fields the PCF reads. */
function money(a: Aggregate): FlatRow {
  const row: FlatRow = {
    TotalCost: a.total,
    ActualCost: a.actual,
    // The canvas defines Planned as what is NOT yet paid. Deriving it by subtraction rather
    // than by a second filter keeps it consistent with Total by construction.
    PlannedCost: a.total - a.actual,
  };
  for (let i = 0; i < 12; i += 1) row[`M${i + 1}`] = a.months[i] as number;
  return row;
}

export function gridRows(
  accounts: readonly CostAccount[],
  lines: readonly CostLine[],
  year: number,
  /**
   * Per-contract red dots and their hover text — `gridCommentIndicators` (`comments.ts`).
   *
   * `CostLine.comments` is dead; comments live on their own table and are loaded once per
   * category by the screen, which is what feeds this. The tooltip halves are optional so a
   * caller that only has dots (`gridCommentFlags`) can still pass its map.
   */
  commentFlags: ReadonlyMap<string, {
    general: boolean; months: boolean[];
    generalTooltip?: string; monthTooltips?: string[];
  }> = new Map(),
): FlatRow[] {
  const linesByAccount = new Map<string, CostLine[]>();
  for (const line of lines) {
    const bucket = linesByAccount.get(line.accountId);
    if (bucket) bucket.push(line);
    else linesByAccount.set(line.accountId, [line]);
  }

  const childrenByParent = new Map<string, CostAccount[]>();
  for (const account of accounts) {
    if (!account.parentId) continue;
    const bucket = childrenByParent.get(account.parentId);
    if (bucket) bucket.push(account);
    else childrenByParent.set(account.parentId, [account]);
  }

  // Every line's money, computed once and reused by its own row and by its ancestors.
  const lineAggregates = new Map<string, Aggregate>();
  for (const line of lines) lineAggregates.set(line.id, aggregateLine(line, year));

  const ownAggregate = (accountId: string): Aggregate => {
    const out = emptyAggregate();
    for (const line of linesByAccount.get(accountId) ?? []) {
      addInto(out, lineAggregates.get(line.id) as Aggregate);
    }
    return out;
  };

  const rows: FlatRow[] = [];
  for (const account of accounts) {
    const isSubaccount = Boolean(account.parentId);
    const own = ownAggregate(account.id);

    // An account row shows its own money plus every subaccount's. The canvas did the same by
    // filtering lines against the account id OR any of its child ids.
    if (!isSubaccount) {
      for (const child of childrenByParent.get(account.id) ?? []) {
        addInto(own, ownAggregate(child.id));
      }
    }

    rows.push({
      RowId: account.id,
      ParentId: account.parentId ?? "",
      Type: isSubaccount ? "subaccount" : "account",
      Number: account.number,
      Name: account.name,
      ...money(own),
    });

    // Contracts hang off subaccounts only — a cost filed directly against a level-2 account is
    // counted in its totals but has no row of its own, which is what the canvas grid shows.
    if (!isSubaccount) continue;
    for (const line of sortedByDescription(linesByAccount.get(account.id) ?? [])) {
      const a = lineAggregates.get(line.id) as Aggregate;
      const flags = commentFlags.get(line.id);
      const row: FlatRow = {
        RowId: line.id,
        ParentId: account.id,
        Type: "contract",
        Number: "",
        Name: line.description,
        // `[payer]`, the `Link to Cluster N` segment and the equal-distribution half —
        // `contractSubLabel` in `rules.ts`, which is where the canvas' branching and its
        // conditional separator are spelled out.
        SubLabel: contractSubLabel(line),
        CostPaidBy: line.payer,
        IsStandardContract: line.standard,
        DistributionType:
          line.distribution === "individual" ? "Individual Distribution" : "Equal Distribution",
        HasComments: flags?.general ?? false,
        CommentTooltip: flags?.generalTooltip ?? "",
        ...money(a),
      };
      for (let i = 0; i < 12; i += 1) {
        row[`M${i + 1}Paid`] = a.paidMonths[i] as boolean;
        row[`M${i + 1}HasComments`] = flags?.months[i] ?? false;
        // The canvas emits a tooltip for every month, `""` when there is nothing to say
        // (`Coalesce(First(Sort(...)).LatestText, "")`). The PCF treats a non-empty month
        // tooltip as implying the dot, so the two must not disagree.
        row[`M${i + 1}CommentTooltip`] = flags?.monthTooltips?.[i] ?? "";
      }
      rows.push(row);
    }
  }
  return rows;
}
