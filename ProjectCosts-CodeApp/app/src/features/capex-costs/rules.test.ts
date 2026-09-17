/**
 * DEVEX/CAPEX rules.
 *
 * These cover logic that was inline in `Screen.tsx` and therefore untestable — which is where
 * three shipped defects came from. Anything asserting canvas behaviour cites the source.
 */
import { describe, expect, it } from "vitest";
import {
  NO_MILESTONE, SUMMARY_CATEGORY, SUMMARY_TAB_NAME,
  accountsInCategory, allocatedForYear, applyDescriptionChange, averagePayment, byClusterJson,
  canPersistIndividual, canSaveContract, categoryTabs, clusterLinkageChanged,
  clusterLinkageConfirmation, clusterPayments, clustersHavingCost, contractSubLabel,
  describeDescriptionError,
  equalPayments, formatSummaryAmount, frequencyLabel, individualDistribution, initialCostValue,
  isSummaryTab, linkToMilestoneVisible, milestoneOptions, milestoneRelinkResetNeeded,
  needsClusterLinkageConfirmation,
  newCostLine, paidToggleNeedsConfirmation, panelTitle, parseByClusterJson,
  parseStartEndJson, paymentIdsByMonth, planDeleteContract, proposedPayments, reconcilePayments,
  resolveCategory, resolveEqualMode, resolvePaidTarget, startEndJson,
  totalCostForPercent, totalCostMax, validateEndMonthYear, validateStartMonthYear,
  validateTotalCost,
  validateMonthAmount, monthAmountErrors,
} from "./rules";
import { CATEGORIES, type CostAccount, type CostLine, type Payment } from "../costing/model";

const line = (over: Partial<CostLine> = {}): CostLine => ({
  ...newCostLine("acct-1", "line-1"), ...over,
});

const pay = (year: number, month: number, amount: number, id?: string): Payment =>
  ({ id, year, month, amount, paid: false });

/** Seven boundaries for six clusters — stage 2.1 derives these from the project. */
const BOUNDS = [
  "2015-01-01", "2018-01-01", "2022-01-01", "2025-03-01", "2026-06-01", "2027-08-30", "2046-08-01",
];

/* ───────────────────────────────────────────────────────────────── tabs ── */

describe("category tabs", () => {
  it("UT-CAPEXR-001 puts Summary first, then the five categories", () => {
    expect(categoryTabs()).toEqual([SUMMARY_TAB_NAME, ...CATEGORIES]);
    expect(categoryTabs()).toHaveLength(6);
  });

  it("UT-CAPEXR-002 resolves a valid category index", () => {
    expect(resolveCategory("0")).toBe(0);
    expect(resolveCategory("4")).toBe(4);
  });

  it("UT-CAPEXR-003 falls back to Summary for anything unusable", () => {
    // A hand-edited or stale deep link must not break the screen.
    for (const raw of [null, "", "   ", "abc", "-1", "5", "99", "1.5"]) {
      expect(resolveCategory(raw)).toBe(SUMMARY_CATEGORY);
    }
  });

  it("UT-CAPEXR-004 treats only a negative category as the Summary tab", () => {
    expect(isSummaryTab(SUMMARY_CATEGORY)).toBe(true);
    expect(isSummaryTab(0)).toBe(false);
  });

  it("UT-CAPEXR-005 shows nothing rather than a zero before the totals land", () => {
    expect(formatSummaryAmount(undefined)).toBe("");
    expect(formatSummaryAmount(0)).toBe("0");
    expect(formatSummaryAmount(19700000)).toBe("19,700,000");
  });

  it("UT-CAPEXR-095 builds the strip from the live category list when given one", () => {
    // The canvas' Items is
    // `SortByColumns(Filter(colCapexAccountCategoriesNew, Not(Name = "Overleveraging")),
    //  "vsb_order")` — Dataverse, not a literal. `loadCapexCategories` supplies it.
    const live = [...CATEGORIES, "Grid Reinforcement"];
    expect(categoryTabs(live)).toEqual([SUMMARY_TAB_NAME, ...live]);
    expect(resolveCategory("5", live.length)).toBe(5);
  });

  it("UT-CAPEXR-096 falls back to CATEGORIES rather than blanking the navigation", () => {
    // `loadCapexCategories` returns [] when the "00001" root is missing, and a transient query
    // failure must not leave a strip with only Summary on it.
    expect(categoryTabs([])).toEqual([SUMMARY_TAB_NAME, ...CATEGORIES]);
    expect(resolveCategory("4", 0)).toBe(4);
  });

  it("UT-CAPEXR-097 still rejects an index past the end of the live list", () => {
    expect(resolveCategory("3", 3)).toBe(SUMMARY_CATEGORY);
    expect(resolveCategory("2", 3)).toBe(2);
  });
});

/* ────────────────────────────────────────────────────── the Total box ── */

describe("totalCostForPercent", () => {
  it("UT-CAPEXR-006 prefers the contract's stored total over the sum of its months", () => {
    // `locAllYearsCost = contract.'Total Cost'` — CapexScreenCode.txt:7212. Reading the sum
    // instead was the Edit-panel defect.
    expect(totalCostForPercent(19700000, 250, "99")).toBe(19700000);
  });

  it("UT-CAPEXR-007 falls back to the sum when no total is stored", () => {
    expect(totalCostForPercent(undefined, 250, "99")).toBe(250);
  });

  it("UT-CAPEXR-008 falls back to the typed box when there is neither", () => {
    expect(totalCostForPercent(undefined, 0, "99")).toBe(99);
  });

  it("UT-CAPEXR-009 returns undefined when nothing is known", () => {
    expect(totalCostForPercent(undefined, 0, "")).toBeUndefined();
  });

  it("UT-CAPEXR-010 keeps a stored zero rather than falling through it", () => {
    // A contract deliberately set to zero is not the same as one with no total.
    expect(totalCostForPercent(0, 500, "")).toBe(0);
  });

  it("UT-CAPEXR-011 opens the box empty for a new line", () => {
    expect(initialCostValue(undefined)).toBe("");
    expect(initialCostValue(line({ totalCost: 1000 }))).toBe("1000");
    expect(initialCostValue(line({ payments: [pay(2026, 1, 40)] }))).toBe("40");
  });
});

/* ───────────────────────────────────────────────── proposed payments ── */

describe("proposedPayments", () => {
  it("UT-CAPEXR-012 returns nothing without a line", () => {
    expect(proposedPayments(null, "100", BOUNDS)).toEqual([]);
  });

  it("UT-CAPEXR-013 passes an individual distribution through untouched", () => {
    // Individual money is typed month by month; nothing redistributes it.
    const payments = [pay(2026, 3, 55), pay(2026, 4, 45)];
    const l = line({ distribution: "individual", payments });
    expect(proposedPayments(l, "999", BOUNDS)).toBe(payments);
  });

  it("UT-CAPEXR-014 spreads an equal distribution over a date range", () => {
    const l = line({
      distribution: "equal", equalMode: "dates",
      startDate: "2026-01-01", endDate: "2026-03-31", frequency: 1,
    });
    expect(proposedPayments(l, "1000", BOUNDS)).toEqual([
      { year: 2026, month: 1, amount: 333, paid: false },
      { year: 2026, month: 2, amount: 333, paid: false },
      { year: 2026, month: 3, amount: 334, paid: false },
    ]);
  });

  it("UT-CAPEXR-015 splits cluster money across every cluster at once", () => {
    // The remainder lands on the last month OVERALL, not once per cluster — otherwise the
    // payments would not sum to the total.
    const l = line({ distribution: "equal", equalMode: "cluster", clusters: [4, 5], frequency: 12 });
    const proposed = proposedPayments(l, "1000", BOUNDS);
    expect(proposed.length).toBeGreaterThan(1);
    expect(proposed.reduce((a, p) => a + p.amount, 0)).toBe(1000);
  });

  it("UT-CAPEXR-016 yields nothing when no cluster is ticked", () => {
    const l = line({ distribution: "equal", equalMode: "cluster", clusters: [] });
    expect(proposedPayments(l, "1000", BOUNDS)).toEqual([]);
  });

  it("UT-CAPEXR-017 treats a blank or unparseable total as zero, not NaN", () => {
    const l = line({ equalMode: "dates", startDate: "2026-01-01", endDate: "2026-02-28" });
    for (const value of ["", "  ", "abc"]) {
      const proposed = proposedPayments(l, value, BOUNDS);
      expect(proposed.every((p) => Number.isFinite(p.amount))).toBe(true);
    }
  });

  it("UT-CAPEXR-018 returns nothing for an unusable date", () => {
    const l = line({ equalMode: "dates", startDate: "", endDate: "2026-03-31" });
    expect(proposedPayments(l, "100", BOUNDS)).toEqual([]);
  });

  it("UT-CAPEXR-019 ignores a cluster index outside the six boundaries", () => {
    expect(clusterPayments(100, [99], 1, BOUNDS)).toEqual([]);
  });

  it("UT-CAPEXR-020 runs a cluster up to the day before the next one starts", () => {
    // Cluster 4 spans BOUNDS[3] .. BOUNDS[4] - 1 day.
    const months = equalPayments(0, BOUNDS[3] as string, "2026-05-31", 1).length;
    expect(clusterPayments(0, [4], 1, BOUNDS)).toHaveLength(months);
  });

  it("UT-CAPEXR-080 collapses a month two clusters both schedule", () => {
    /*
     * `Distinct(colCapexCostDataToPatch, ThisRecord)` before the count
     * (`CapexScreenCode.txt:1756`). A project whose milestone chain repeats a date gives a
     * cluster whose end falls BEFORE its start; the span clamps to 0, it schedules its own
     * start month, and the next cluster — starting on the same date — schedules it again.
     * Undeduped that is two rows for one month, and the money split one way too many.
     */
    const repeated = ["2025-01-01", "2025-04-01", "2025-04-01", "2025-07-01"];
    const both = clusterPayments(900, [2, 3], 1, repeated);
    const months = both.map((p) => `${p.year}-${p.month}`);
    expect(new Set(months).size).toBe(months.length);
    // April (cluster 2, collapsed span) plus April/May/June (cluster 3) is three months, not
    // four: the money divides by 3 and April gets one row, not two.
    expect(both).toHaveLength(3);
    expect(both.map((p) => p.amount)).toEqual([300, 300, 300]);
    expect(both.reduce((sum, p) => sum + p.amount, 0)).toBe(900);
  });

  it("UT-CAPEXR-081 pays the whole remainder on the final month overall", () => {
    // One cluster, three months, 1000 -> 333/333/334 (`equalDistributionAmounts`), never
    // 333.33 each and never a remainder spread per cluster.
    const bounds = ["2025-01-01", "2025-04-01"];
    expect(clusterPayments(1000, [1], 1, bounds).map((p) => p.amount)).toEqual([333, 333, 334]);
  });
});

describe("averagePayment", () => {
  it("UT-CAPEXR-021 is the rounded-down base, not the mean", () => {
    expect(averagePayment("1000", 3)).toBe(333);
  });

  it("UT-CAPEXR-022 is undefined when there are no payments", () => {
    expect(averagePayment("1000", 0)).toBeUndefined();
  });
});

describe("allocatedForYear", () => {
  it("UT-CAPEXR-023 sums only the given year", () => {
    const payments = [pay(2025, 1, 10), pay(2026, 1, 20), pay(2026, 5, 5)];
    expect(allocatedForYear(payments, 2026)).toBe(25);
    expect(allocatedForYear(payments, 2030)).toBe(0);
  });
});

/* ──────────────────────────────────────────────────────────── the gate ── */

describe("canSaveContract", () => {
  const proposed = [pay(2026, 1, 100)];

  it("UT-CAPEXR-024 requires a line", () => {
    expect(canSaveContract(null, "100", proposed)).toBe(false);
  });

  it("UT-CAPEXR-025 requires a non-blank description", () => {
    expect(canSaveContract(line({ description: "   " }), "100", proposed)).toBe(false);
    expect(canSaveContract(line({ description: "Studies" }), "100", proposed)).toBe(true);
  });

  it("UT-CAPEXR-026 requires the distribution to produce at least one month", () => {
    expect(canSaveContract(line({ description: "x" }), "100", [])).toBe(false);
  });

  it("UT-CAPEXR-027 rejects a negative or unparseable month", () => {
    expect(canSaveContract(line({ description: "x" }), "100", [pay(2026, 1, -5)])).toBe(false);
    expect(canSaveContract(line({ description: "x" }), "100", [pay(2026, 1, Number.NaN)]))
      .toBe(false);
  });

  it("UT-CAPEXR-028 requires a total for an equal distribution", () => {
    const l = line({ description: "x", distribution: "equal" });
    expect(canSaveContract(l, "", proposed)).toBe(false);
    expect(canSaveContract(l, "abc", proposed)).toBe(false);
    expect(canSaveContract(l, "-1", proposed)).toBe(false);
    expect(canSaveContract(l, "0", proposed)).toBe(true);
  });

  it("UT-CAPEXR-029 does not require a total for an individual distribution", () => {
    // Individual money is typed into the months; the Total box is not even shown.
    const l = line({ description: "x", distribution: "individual" });
    expect(canSaveContract(l, "", proposed)).toBe(true);
  });
});

/* ────────────────────────────────────────────────────────────── labels ── */

describe("labels and helpers", () => {
  it("UT-CAPEXR-030 titles the panel for add versus edit", () => {
    expect(panelTitle(false, "Technical Studies")).toBe("Add Costs - Technical Studies");
    expect(panelTitle(true, "Technical Studies")).toBe("Edit Costs - Technical Studies");
  });

  it("UT-CAPEXR-031 pluralises the frequency label", () => {
    expect(frequencyLabel(1)).toBe("1 month");
    expect(frequencyLabel(3)).toBe("3 months");
  });

  it("UT-CAPEXR-032 filters accounts to one category", () => {
    const accounts: CostAccount[] = [
      { id: "a", number: "80000", name: "A", category: 0 },
      { id: "b", number: "81000", name: "B", category: 1 },
    ];
    expect(accountsInCategory(accounts, 0).map((a) => a.id)).toEqual(["a"]);
  });

  it("UT-CAPEXR-033 indexes existing cost-row ids by month", () => {
    // `capexWriteSet` tells an update from a create by whether an id is present, so the panel
    // has to carry the ids of the months it started with.
    const ids = paymentIdsByMonth(line({ payments: [pay(2026, 1, 10, "cost-1")] }));
    expect(ids.get("2026-1")).toBe("cost-1");
    expect(ids.get("2026-2")).toBeUndefined();
  });

  it("UT-CAPEXR-034 gives a new line the canvas defaults", () => {
    const fresh = newCostLine("acct-9", "id-9");
    expect(fresh).toMatchObject({
      accountId: "acct-9", id: "id-9", payer: "SPV",
      depreciation: true, vat: true, standard: false,
      distribution: "equal", equalMode: "cluster", frequency: 1,
    });
    expect(fresh.payments).toEqual([]);
  });
});

/* ---panel validation--- */

describe("totalCostMax / validateTotalCost", () => {
  it("UT-CAPEXR-035 caps Poland at 2.25bn and everywhere else at 500m", () => {
    expect(totalCostMax("Poland")).toBe(2250000000);
    expect(totalCostMax("Germany")).toBe(500000000);
    expect(totalCostMax(null)).toBe(500000000);
  });

  it("UT-CAPEXR-036 rejects zero, negative, decimal and over-cap values", () => {
    expect(validateTotalCost("0", "Germany").valid).toBe(false);
    expect(validateTotalCost("-5", "Germany").valid).toBe(false);
    expect(validateTotalCost("1.5", "Germany").valid).toBe(false);
    expect(validateTotalCost("600000000", "Germany").valid).toBe(false);
    expect(validateTotalCost("500000000", "Poland").valid).toBe(true);
  });

  it("UT-CAPEXR-037 accepts an integer within range", () => {
    expect(validateTotalCost("19700000", "Germany")).toEqual({ valid: true, message: null });
  });
});

describe("validateStartMonthYear", () => {
  const allowed = new Date(2025, 3, 1);

  it("UT-CAPEXR-038 accepts a blank value", () => {
    expect(validateStartMonthYear("", allowed)).toBeNull();
  });

  it("UT-CAPEXR-039 rejects the wrong format", () => {
    expect(validateStartMonthYear("2025-04", allowed)).toBe("Date must be in MM/YYYY format");
    expect(validateStartMonthYear("4/2025", allowed)).toBe("Date must be in MM/YYYY format");
  });

  it("UT-CAPEXR-040 rejects a date before the allowed start", () => {
    expect(validateStartMonthYear("03/2025", allowed))
      .toBe("Start Date must be in or after 04/2025");
  });

  it("UT-CAPEXR-041 accepts a date on or after the allowed start", () => {
    expect(validateStartMonthYear("04/2025", allowed)).toBeNull();
    expect(validateStartMonthYear("05/2025", allowed)).toBeNull();
  });
});

describe("validateEndMonthYear", () => {
  it("UT-CAPEXR-042 rejects the wrong format before comparing anything", () => {
    expect(validateEndMonthYear("2025-04", "01/2025")).toBe("Date must be in MM/YYYY format");
  });

  it("UT-CAPEXR-043 compares against the TYPED start date, not the allowed start", () => {
    // `DateValue("01/" & Start) >= DateValue("01/" & End)` — `CapexScreenCode.txt`, the
    // `…EndDate_ErrorMessage_1.Text`. An end before the start is the error the canvas names.
    expect(validateEndMonthYear("03/2025", "06/2025"))
      .toBe("End Date must take place after Start Date");
  });

  it("UT-CAPEXR-044 rejects an end in the SAME month as the start", () => {
    // The canvas comparison is `>=`, so equal months are an error too — the old shared
    // "must be in or after" check accepted this.
    expect(validateEndMonthYear("03/2026", "03/2026"))
      .toBe("End Date must take place after Start Date");
  });

  it("UT-CAPEXR-045 accepts an end after the start", () => {
    expect(validateEndMonthYear("07/2025", "06/2025")).toBeNull();
  });

  it("UT-CAPEXR-046 says nothing while the start date is still unusable", () => {
    // Both halves of the canvas condition require `IsMatch(Start, …)`; with a half-typed start
    // there is nothing to compare against yet.
    expect(validateEndMonthYear("07/2025", "")).toBeNull();
    expect(validateEndMonthYear("07/2025", "6/2025")).toBeNull();
  });
});

describe("validateTotalCost message", () => {
  it("UT-CAPEXR-047 reads 'between 0 and …', with no full stop", () => {
    // `$"Value must be between 0 and {…}"` — the bound in the SENTENCE is 0, and the canvas
    // label carries no trailing period.
    expect(validateTotalCost("0", null, "en-GB").message)
      .toBe("Value must be between 0 and 500,000,000");
  });

  it("UT-CAPEXR-048 raises the ceiling for Poland", () => {
    expect(validateTotalCost("0", "Poland", "en-GB").message)
      .toBe("Value must be between 0 and 2,250,000,000");
  });

  it("UT-CAPEXR-049 groups with dots outside English", () => {
    // `If(Lower(First(Split(Language(), "-")).Value) = "en", "2,250,000,000", "2.250.000.000")`.
    expect(validateTotalCost("0", "Poland", "de-DE").message)
      .toBe("Value must be between 0 and 2.250.000.000");
  });
});

describe("describeDescriptionError", () => {
  it("UT-CAPEXR-042 ignores a blank value", () => {
    expect(describeDescriptionError("", null, ["Existing"])).toBeNull();
  });

  it("UT-CAPEXR-043 does not flag a value unchanged from its own original", () => {
    expect(describeDescriptionError("Existing", "Existing", ["Existing"])).toBeNull();
  });

  it("UT-CAPEXR-044 rejects the reserved word Standard", () => {
    expect(describeDescriptionError("My Standard Cost", null, [])).toContain("Standard");
  });

  it("UT-CAPEXR-045 rejects a duplicate name case and whitespace insensitively", () => {
    expect(describeDescriptionError("  studies  ", null, ["Studies"]))
      .toBe("There cannot be two contracts with the same name under the same sub-account");
  });

  it("UT-CAPEXR-046 accepts a fresh non duplicate name", () => {
    expect(describeDescriptionError("New Cost", null, ["Existing"])).toBeNull();
  });
});

describe("applyDescriptionChange", () => {
  it("UT-CAPEXR-047 passes a non standard contract through untouched", () => {
    expect(applyDescriptionChange("New text", false))
      .toEqual({ description: "New text", isStandardContract: false });
  });

  it("UT-CAPEXR-048 strips Standard and clears the flag when editing a standard contract", () => {
    const result = applyDescriptionChange("Standard O&M Standard Contract", true);
    expect(result.isStandardContract).toBe(false);
    expect(result.description).not.toContain("Standard");
  });
});

describe("byClusterJson / parseByClusterJson", () => {
  /**
   * The exact string a live VSBCloud_Dev contract carries, copied off `pac org fetch`. Five
   * keys, always all present, array-wrapped.
   */
  const LIVE = '[{"Cluster1":false,"Cluster2":true,"Cluster3":false,"Cluster4":true,"Cluster5":false}]';

  it("UT-CAPEXR-049 round trips a set of ticked clusters", () => {
    const json = byClusterJson([2, 4]);
    expect(JSON.parse(json)).toEqual([{
      Cluster1: false, Cluster2: true, Cluster3: false,
      Cluster4: true, Cluster5: false,
    }]);
    expect(parseByClusterJson(json)).toEqual([2, 4]);
  });

  it("UT-CAPEXR-050 returns nothing for a malformed or absent value", () => {
    expect(parseByClusterJson(undefined)).toEqual([]);
    expect(parseByClusterJson("not json")).toEqual([]);
    expect(parseByClusterJson("{}")).toEqual([]);
    expect(parseByClusterJson("[]")).toEqual([]);
  });

  it("UT-CAPEXR-051 ignores keys that are not ClusterN", () => {
    expect(parseByClusterJson("{\"Cluster1\":true,\"Other\":true}")).toEqual([1]);
  });

  it("UT-CAPEXR-062 writes the canvas' array-of-one-record shape, not a bare object", () => {
    // `JSON([{Cluster1: ...}])` at `CapexScreenCode.txt:1544`, read back with
    // `First(ParseJSON(...))` at `:19542`. A bare object still parses HERE but the canvas app,
    // reading the same row, would get a blank record and show no clusters at all.
    const parsed: unknown = JSON.parse(byClusterJson([1]));
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(1);
  });

  it("UT-CAPEXR-063 writes five clusters, not six", () => {
    // The panel has `chk_...SelectCluster1_1` .. `..Cluster5_1` and nothing more, even though
    // `clusterDurations` yields a sixth cluster (COD -> End Date).
    expect(Object.keys((JSON.parse(byClusterJson([])) as object[])[0]!)).toEqual([
      "Cluster1", "Cluster2", "Cluster3", "Cluster4", "Cluster5",
    ]);
  });

  it("UT-CAPEXR-064 reads only the clusters that are true in a live row", () => {
    // The regression this replaces: the old reader scanned the string for any integer 1-6 and
    // so matched the digits in the KEY names, returning all five for every populated row.
    expect(parseByClusterJson(LIVE)).toEqual([2, 4]);
  });

  it("UT-CAPEXR-065 an all-false row is no clusters, not all of them", () => {
    const allFalse = '[{"Cluster1":false,"Cluster2":false,"Cluster3":false,"Cluster4":false,"Cluster5":false}]';
    expect(parseByClusterJson(allFalse)).toEqual([]);
  });

  it("UT-CAPEXR-066 still reads a bare object written by an earlier build", () => {
    expect(parseByClusterJson('{"Cluster1":true,"Cluster3":true}')).toEqual([1, 3]);
  });
});

describe("startEndJson / parseStartEndJson", () => {
  it("UT-CAPEXR-067 writes MM/YYYY inside the canvas' array wrapper", () => {
    // `CapexScreenCode.txt:1555` writes the raw text-box values, and the box's Placeholder is
    // "MM/YYYY". Live rows: `[{"EndDate":"06/2026","StartDate":"12/2017"}]`.
    expect(JSON.parse(startEndJson("2025-04-01", "2027-07-31")))
      .toEqual([{ StartDate: "04/2025", EndDate: "07/2027" }]);
  });

  it("UT-CAPEXR-068 round trips a pair back to the first of each month", () => {
    const json = startEndJson("2025-04-01", "2027-07-31");
    // The column carries no day; every consumer works in whole months.
    expect(parseStartEndJson(json)).toEqual({ startDate: "2025-04-01", endDate: "2027-07-01" });
  });

  it("UT-CAPEXR-069 an unset pair writes two blanks, as the canvas does", () => {
    expect(JSON.parse(startEndJson("", "")))
      .toEqual([{ StartDate: "", EndDate: "" }]);
    expect(parseStartEndJson(startEndJson("", "")))
      .toEqual({ startDate: "", endDate: "" });
  });

  it("UT-CAPEXR-070 reads a live row", () => {
    expect(parseStartEndJson('[{"EndDate":"06/2026","StartDate":"12/2017"}]'))
      .toEqual({ startDate: "2017-12-01", endDate: "2026-06-01" });
  });

  it("UT-CAPEXR-071 falls back to a full ISO date from an earlier build", () => {
    expect(parseStartEndJson('[{"StartDate":"2025-04-01","EndDate":"2027-07-31"}]'))
      .toEqual({ startDate: "2025-04-01", endDate: "2027-07-31" });
  });

  it("UT-CAPEXR-072 returns blanks for a malformed or absent value", () => {
    expect(parseStartEndJson(undefined)).toEqual({ startDate: "", endDate: "" });
    expect(parseStartEndJson("not json")).toEqual({ startDate: "", endDate: "" });
    expect(parseStartEndJson("[]")).toEqual({ startDate: "", endDate: "" });
    // "13" is not a month.
    expect(parseStartEndJson('[{"StartDate":"13/2025","EndDate":"01/2026"}]'))
      .toEqual({ startDate: "", endDate: "2026-01-01" });
  });
});

describe("resolveEqualMode", () => {
  it("UT-CAPEXR-073 any ticked cluster means By Cluster", () => {
    expect(resolveEqualMode([3], "2025-01-01", "2026-01-01")).toBe("cluster");
  });

  it("UT-CAPEXR-074 no clusters but both dates means By Start and End Date", () => {
    expect(resolveEqualMode([], "2025-01-01", "2026-01-01")).toBe("dates");
  });

  it("UT-CAPEXR-075 neither stored falls back to By Cluster, not to dates", () => {
    // `rad_AddContract_RightPanel_DistributionBy_1.DefaultSelectedItems` ends `["By Cluster"]`.
    expect(resolveEqualMode([], "", "")).toBe("cluster");
    // One date alone is not a range.
    expect(resolveEqualMode([], "2025-01-01", "")).toBe("cluster");
  });
});

describe("reconcilePayments", () => {
  it("UT-CAPEXR-076 carries the existing row id onto a month that survives", () => {
    const writes = reconcilePayments([pay(2026, 1, 10, "cost-1")], [pay(2026, 1, 25)]);
    expect(writes).toEqual([{ id: "cost-1", year: 2026, month: 1, amount: 25 }]);
  });

  it("UT-CAPEXR-077 tombstones a month the new schedule drops", () => {
    // The canvas achieves this by deleting the contract's whole cost set and rewriting it
    // (`CapexScreenCode.txt:1776`). Without it a save is additive: widening the frequency left
    // the old months behind with their old money.
    const writes = reconcilePayments(
      [pay(2026, 1, 10, "cost-1"), pay(2026, 2, 10, "cost-2")],
      [pay(2026, 1, 20)],
    );
    expect(writes).toEqual([
      { id: "cost-1", year: 2026, month: 1, amount: 20 },
      { id: "cost-2", year: 2026, month: 2, amount: null },
    ]);
  });

  it("UT-CAPEXR-078 a dropped month that never had a row is simply absent", () => {
    // Nothing to delete, so nothing is emitted — `capexWriteSet` would ignore it anyway, but
    // emitting it would mean an id-less delete in the plan.
    expect(reconcilePayments([pay(2026, 2, 0)], [pay(2026, 1, 5)]))
      .toEqual([{ id: undefined, year: 2026, month: 1, amount: 5 }]);
  });

  it("UT-CAPEXR-079 a create has no existing rows and no tombstones", () => {
    expect(reconcilePayments([], [pay(2026, 1, 5), pay(2026, 2, 5)])).toEqual([
      { id: undefined, year: 2026, month: 1, amount: 5 },
      { id: undefined, year: 2026, month: 2, amount: 5 },
    ]);
  });
});

describe("individualDistribution", () => {
  const row = (year: number, month: number, value: number | null, costId?: string) =>
    ({ year, month, value, costId });

  it("UT-CAPEXR-052 converts a percentage row against the contract total", () => {
    const rows = individualDistribution([row(2026, 1, 25), row(2026, 2, 75)], "percent", 1000);
    expect(rows).toEqual([
      { year: 2026, month: 1, cost: 250, costId: undefined },
      { year: 2026, month: 2, cost: 750, costId: undefined },
    ]);
  });

  it("UT-CAPEXR-053 passes an absolute row through rounded", () => {
    const rows = individualDistribution([row(2026, 1, 333.6)], "absolute", 0);
    expect(rows[0]?.cost).toBe(334);
  });

  it("UT-CAPEXR-054 turns a blank row into a null cost carrying its id for deletion", () => {
    const rows = individualDistribution([row(2026, 1, null, "cost-1")], "absolute", 0);
    expect(rows[0]).toEqual({ year: 2026, month: 1, cost: null, costId: "cost-1" });
  });
});

describe("canPersistIndividual", () => {
  const row = (value: number | null) => ({ year: 2026, month: 1, value });

  it("UT-CAPEXR-055 requires a percentage distribution to sum to exactly 100", () => {
    expect(canPersistIndividual([row(50), row(50)], "percent")).toBe(true);
    expect(canPersistIndividual([row(50), row(49)], "percent")).toBe(false);
  });

  it("UT-CAPEXR-056 absorbs rounding to one decimal on a percentage sum", () => {
    expect(canPersistIndividual([row(33.34), row(33.33), row(33.33)], "percent")).toBe(true);
  });

  it("UT-CAPEXR-057 requires an absolute distribution to sum positive", () => {
    expect(canPersistIndividual([row(0), row(0)], "absolute")).toBe(false);
    expect(canPersistIndividual([row(100)], "absolute")).toBe(true);
  });
});

describe("paidToggleNeedsConfirmation", () => {
  it("UT-CAPEXR-058 requires confirmation only for an individual cluster linked contract", () => {
    expect(paidToggleNeedsConfirmation({ distribution: "individual", linkedClusterOrder: 3 }))
      .toBe(true);
    expect(paidToggleNeedsConfirmation({ distribution: "individual" })).toBe(false);
    expect(paidToggleNeedsConfirmation({ distribution: "equal", linkedClusterOrder: 3 }))
      .toBe(false);
  });
});

describe("resolvePaidTarget", () => {
  it("UT-CAPEXR-059 finds the cost row for a year and month", () => {
    const payments: Payment[] = [pay(2026, 3, 100, "cost-3")];
    expect(resolvePaidTarget(payments, 2026, 3)).toEqual({ costId: "cost-3" });
  });

  it("UT-CAPEXR-060 reports an error when no row matches", () => {
    const result = resolvePaidTarget([], 2026, 3);
    expect("error" in result).toBe(true);
  });
});

describe("planDeleteContract", () => {
  it("UT-CAPEXR-061 collects only the comments belonging to the deleted contract", () => {
    const plan = planDeleteContract("c1", [
      { id: "cm1", contractId: "c1" }, { id: "cm2", contractId: "c2" },
    ]);
    expect(plan).toEqual({ contractId: "c1", commentIds: ["cm1"] });
  });
});

/* ────────────────────────────────────────────────────────── sub-label ── */

/**
 * `contractSubLabel` — the grid contract row's second line.
 *
 * Transcribed from `Capex Costs Screen.pa.yaml:1222-1330`. Note that the `", "` separator appears
 * ONLY in the linked-cluster cases below: in the canvas that comma lives inside each distribution
 * branch, guarded by `If(Not(IsBlank(CPC.'Linked Cluster')), ", ", "")`, so it exists purely to
 * divide the link text from the distribution text.
 */
describe("contractSubLabel", () => {
  const contract = (over: Partial<CostLine> = {}) =>
    line({ payer: "SPV", distribution: "equal", clusters: [], startDate: "", endDate: "", ...over });

  it("UT-CAPEXR-082 is just the payer tag when there is no distribution selection", () => {
    expect(contractSubLabel(contract())).toBe("[SPV]");
    expect(contractSubLabel(contract({ payer: "DevCo" }))).toBe("[DevCo]");
  });

  it("UT-CAPEXR-083 joins two or fewer clusters with ' & '", () => {
    expect(contractSubLabel(contract({ clusters: [1, 2] })))
      .toBe("[SPV]Distribution to Cluster 1 & 2");
    expect(contractSubLabel(contract({ clusters: [3] })))
      .toBe("[SPV]Distribution to Cluster 3");
  });

  it("UT-CAPEXR-084 joins MORE THAN TWO clusters with ', '", () => {
    // `If(CountRows(locSelectedClusters) > 2, ", ", " & ")` — the switch is at three, not two.
    expect(contractSubLabel(contract({ clusters: [1, 2, 5] })))
      .toBe("[SPV]Distribution to Cluster 1, 2, 5");
  });

  it("UT-CAPEXR-085 lists clusters in order whatever order they were stored in", () => {
    expect(contractSubLabel(contract({ clusters: [5, 1] })))
      .toBe("[SPV]Distribution to Cluster 1 & 5");
  });

  it("UT-CAPEXR-086 renders the date pair as MM/YYYY", () => {
    // The live shape of `vsb_bystartenddatejson`: [{"StartDate":"12/2017","EndDate":"06/2026"}],
    // which `parseStartEndJson` hands over as the first of each month.
    expect(contractSubLabel(contract({ startDate: "2017-12-01", endDate: "2026-06-01" })))
      .toBe("[SPV]Distribution from 12/2017 to 06/2026");
  });

  it("UT-CAPEXR-087 prefers the clusters when a contract has both stored", () => {
    // The canvas' `If` tests the clusters first, so a contract carrying both never shows dates.
    expect(contractSubLabel(contract({
      clusters: [2], startDate: "2017-12-01", endDate: "2026-06-01",
    }))).toBe("[SPV]Distribution to Cluster 2");
  });

  it("UT-CAPEXR-088 still emits the segment when only one of the two dates is set", () => {
    // `Not(IsBlank(StartDate & EndDate))` is a CONCATENATION — one date alone is non-blank.
    expect(contractSubLabel(contract({ startDate: "2017-12-01", endDate: "" })))
      .toBe("[SPV]Distribution from 12/2017 to ");
  });

  it("UT-CAPEXR-089 gives an individual distribution no distribution half at all", () => {
    // Both branches of the canvas' `If` require `Distribution = 'Equal Distribution'`.
    expect(contractSubLabel(contract({
      distribution: "individual", clusters: [1, 2], startDate: "2017-12-01", endDate: "2026-06-01",
    }))).toBe("[SPV]");
  });

  it("UT-CAPEXR-090 appends ' Link to Cluster N' when the contract is linked", () => {
    // `If(Not(IsBlank(CPC.'Linked Cluster')), " Link to Cluster " & CPC.'Linked Cluster'.Order, "")`
    // — a LEADING space, no trailing one.
    expect(contractSubLabel(contract({ linkedClusterOrder: 3 })))
      .toBe("[SPV] Link to Cluster 3");
  });

  it("UT-CAPEXR-091 separates the link from the cluster distribution with ', '", () => {
    expect(contractSubLabel(contract({ linkedClusterOrder: 2, clusters: [1, 2] })))
      .toBe("[SPV] Link to Cluster 2, Distribution to Cluster 1 & 2");
    // The `> 2` cluster join and the link separator are both commas and must not run together.
    expect(contractSubLabel(contract({ linkedClusterOrder: 5, clusters: [1, 2, 3] })))
      .toBe("[SPV] Link to Cluster 5, Distribution to Cluster 1, 2, 3");
  });

  it("UT-CAPEXR-092 separates the link from the date distribution with ', '", () => {
    /*
     * A real row: `ddf8dce1-498f-f111-8076-000d3a284664` in VSBCloud_Dev, measured 16 Sep —
     * "Equal distribution by start/end date - linking 3aug", Cost Type SPV, Linked Cluster
     * "Cluster 2", `vsb_byclusterjson` all false, `vsb_bystartenddatejson`
     * `[{"EndDate":"12/2026","StartDate":"06/2026"}]`. All three of the org's linked
     * EQUAL-distribution contracts are date-distributed like this, so this branch — not the
     * cluster one above — is the one that actually renders today.
     */
    expect(contractSubLabel(contract({
      linkedClusterOrder: 2, startDate: "2026-06-01", endDate: "2026-12-01",
    }))).toBe("[SPV] Link to Cluster 2, Distribution from 06/2026 to 12/2026");
  });

  it("UT-CAPEXR-093 emits no trailing comma when there is no distribution half to separate", () => {
    // The `", "` is emitted per BRANCH, so falling out of both branches leaves the link text
    // with nothing after it — a linked contract with neither clusters nor dates …
    expect(contractSubLabel(contract({ linkedClusterOrder: 4 })))
      .toBe("[SPV] Link to Cluster 4");
    // … and the far commoner case: linked AND individually distributed. 28 of the org's 31
    // linked contracts are exactly this.
    expect(contractSubLabel(contract({
      linkedClusterOrder: 4, distribution: "individual", clusters: [1, 2],
    }))).toBe("[SPV] Link to Cluster 4");
  });

  it("UT-CAPEXR-094 leaves an unlinked contract's label byte-for-byte unchanged", () => {
    // The regression guard for the segment that was just added: `IsBlank('Linked Cluster')` must
    // produce neither the link text nor the separator.
    expect(contractSubLabel(contract({ linkedClusterOrder: undefined, clusters: [1, 2] })))
      .toBe("[SPV]Distribution to Cluster 1 & 2");
  });
});

/* ────────────────────────────────────────────────── link to milestone ── */

/** `Project States` as VSBCloud_Dev holds them — measured 16 Sep, ten rows, only 1..6 clusters. */
const PROJECT_STATES = [
  { id: "ps-0", name: "Draft", order: 0 },
  { id: "ps-1", name: "Cluster 1", order: 1 },
  { id: "ps-2", name: "Cluster 2", order: 2 },
  { id: "ps-3", name: "Cluster 3", order: 3 },
  { id: "ps-4", name: "Cluster 4", order: 4 },
  { id: "ps-5", name: "Cluster 5", order: 5 },
  { id: "ps-6", name: "Cluster 6", order: 6 },
  { id: "ps-8", name: "Abandoned", order: 8 },
  { id: "ps-9", name: "Inactive/ On-hold", order: 9 },
];

const names = (o: { name: string }[]) => o.map((x) => x.name);

describe("the Link to Milestone dropdown", () => {
  it("UT-CAPEXR-098 is visible for Individual, and for Equal only By Start and End Date", () => {
    // `Visible` on `con_Add_Edit_Cost_Data_RightPanel_Form_Link_to_Cluster`
    // (`CapexScreenCode.txt:11192-11199`).
    expect(linkToMilestoneVisible(line({ distribution: "individual", equalMode: "cluster" })))
      .toBe(true);
    expect(linkToMilestoneVisible(line({ distribution: "individual", equalMode: "dates" })))
      .toBe(true);
    expect(linkToMilestoneVisible(line({ distribution: "equal", equalMode: "dates" })))
      .toBe(true);
    // By Cluster is the one combination that hides it — the clusters ARE the distribution.
    expect(linkToMilestoneVisible(line({ distribution: "equal", equalMode: "cluster" })))
      .toBe(false);
    expect(linkToMilestoneVisible(null)).toBe(false);
  });

  it("UT-CAPEXR-099 offers only clusters the project has not yet reached", () => {
    // Wirmighausen, measured: `Cluster State` = "Cluster 4", Order 4; Start Cluster blank.
    // `Order in [1..6] && Order > 4 && Order >= Max(1, 0)` leaves 5 and 6.
    expect(names(milestoneOptions(PROJECT_STATES, 4, undefined)))
      .toEqual(["Cluster 5", "Cluster 6"]);
  });

  it("UT-CAPEXR-100 drops Draft, Abandoned and Inactive/On-hold", () => {
    // `Order in [1, 2, 3, 4, 5, 6]` (`:11272`) — the table is project STATES, not clusters, and
    // without this clause the dropdown would offer "Abandoned" (Order 8).
    const all = names(milestoneOptions(PROJECT_STATES, undefined, undefined));
    expect(all)
      .toEqual(["Cluster 1", "Cluster 2", "Cluster 3", "Cluster 4", "Cluster 5", "Cluster 6"]);
    expect(all).not.toContain("Draft");
    expect(all).not.toContain("Abandoned");
  });

  it("UT-CAPEXR-101 floors an acquired project at its start cluster", () => {
    // `Order >= Max(1, varStartClusterNo)` — a project bought at cluster 3 never had 1 or 2.
    expect(names(milestoneOptions(PROJECT_STATES, 0, 3)))
      .toEqual(["Cluster 3", "Cluster 4", "Cluster 5", "Cluster 6"]);
    // `Max(1, …)` is why Greenfield (0) still starts at Cluster 1, not at a non-existent 0.
    expect(names(milestoneOptions(PROJECT_STATES, 0, 0))[0]).toBe("Cluster 1");
  });

  it("UT-CAPEXR-102 sorts by Order, not by the order the rows arrived in", () => {
    // `pac org fetch` really does return this table unordered; `Sort(…, Order, Ascending)`.
    const shuffled = [...PROJECT_STATES].reverse();
    expect(names(milestoneOptions(shuffled, undefined, undefined)))
      .toEqual(["Cluster 1", "Cluster 2", "Cluster 3", "Cluster 4", "Cluster 5", "Cluster 6"]);
  });

  it("UT-CAPEXR-103 compares the selection BY NAME, and treats None as no change", () => {
    // `Selected.Name <> locSelectedProjectContract.'Linked Cluster'.Name` (`:11291`).
    expect(clusterLinkageChanged("Cluster 3", "Cluster 2")).toBe(true);
    expect(clusterLinkageChanged("Cluster 2", "Cluster 2")).toBe(false);
    // A first link on an unlinked contract: `"Cluster 3" <> Blank()` is true.
    expect(clusterLinkageChanged("Cluster 3", undefined)).toBe(true);
    // UNLINKING is not a linkage change — the canvas' first clause is `Selected.Name <> "None"`,
    // so picking None over a stored link never raises the dialog.
    expect(clusterLinkageChanged(NO_MILESTONE, "Cluster 2")).toBe(false);
    expect(clusterLinkageChanged(NO_MILESTONE, undefined)).toBe(false);
  });

  it("UT-CAPEXR-104 needs a relink reset only for paid months or payment-date comments", () => {
    // `locMilestoneRelinkResetNeeded` (`:11301-11324`).
    const paid = [{ paid: true }, { paid: false }];
    const unpaid = [{ paid: false }];
    expect(milestoneRelinkResetNeeded({
      selectedName: "Cluster 3", storedName: "Cluster 2",
      payments: paid, paymentDateCommentCount: 0,
    })).toBe(true);
    expect(milestoneRelinkResetNeeded({
      selectedName: "Cluster 3", storedName: "Cluster 2",
      payments: unpaid, paymentDateCommentCount: 1,
    })).toBe(true);
    expect(milestoneRelinkResetNeeded({
      selectedName: "Cluster 3", storedName: "Cluster 2",
      payments: unpaid, paymentDateCommentCount: 0,
    })).toBe(false);
    // No linkage change at all — nothing to reset, however much is paid.
    expect(milestoneRelinkResetNeeded({
      selectedName: "Cluster 2", storedName: "Cluster 2",
      payments: paid, paymentDateCommentCount: 3,
    })).toBe(false);
  });
});

/* ──────────────────────────────────── the cluster-linkage confirmation ── */

/** Six clusters a year apart, so a month maps to a cluster by inspection. */
const LINK_CLUSTERS = [1, 2, 3, 4, 5, 6].map((order) => ({
  order,
  name: `Cluster ${order}`,
  startYear: 2014 + order, startMonth: 1, endYear: 2014 + order, endMonth: 12,
}));

describe("clustersHavingCost / needsClusterLinkageConfirmation", () => {
  it("UT-CAPEXR-105 counts a cluster only when a month inside it carries money", () => {
    // `colOtherClusterHavingCost` — `Coalesce(C.<Month>Save, 0) > 0`, so a zero is not "entered".
    const found = clustersHavingCost(LINK_CLUSTERS, [
      { year: 2016, month: 6, cost: 100 },   // cluster 2
      { year: 2018, month: 1, cost: 0 },     // cluster 4 — zero, not counted
      { year: 2019, month: 12, cost: null }, // cluster 5 — blank, not counted
    ]);
    expect(found.map((c) => c.order)).toEqual([2]);
  });

  it("UT-CAPEXR-106 includes both boundary months of a cluster", () => {
    // The window is inclusive at both ends, matching `clusterDurations`' own `[start, end]`.
    expect(clustersHavingCost(LINK_CLUSTERS, [{ year: 2015, month: 1, cost: 1 }])
      .map((c) => c.order)).toEqual([1]);
    expect(clustersHavingCost(LINK_CLUSTERS, [{ year: 2015, month: 12, cost: 1 }])
      .map((c) => c.order)).toEqual([1]);
  });

  it("UT-CAPEXR-107 asks only when money sits OUTSIDE the cluster being linked to", () => {
    /*
     * `Or(And(CountRows(Filter(colOtherClusterHavingCost, Order <> Selected.Order)) > 0,
     *        locClusterLinkageChanged),
     *     locCostPaidByChanged,
     *     locMilestoneRelinkResetNeeded)` — `CapexScreenCode.txt:17413` / `:17526`.
     */
    const base = {
      clusters: LINK_CLUSTERS,
      rows: [{ year: 2016, month: 6, cost: 100 }], // cluster 2
      clusterLinkageChanged: true,
      costPaidByChanged: false,
      milestoneRelinkResetNeeded: false,
    };
    // Linking TO cluster 2, where the money already is: the normal case, no dialog.
    expect(needsClusterLinkageConfirmation({ ...base, selectedClusterOrder: 2 })).toBe(false);
    // Linking to cluster 3 while money sits in cluster 2: the link is about to move it.
    expect(needsClusterLinkageConfirmation({ ...base, selectedClusterOrder: 3 })).toBe(true);
    // The linkage half is gated on `locClusterLinkageChanged` too.
    expect(needsClusterLinkageConfirmation({
      ...base, selectedClusterOrder: 3, clusterLinkageChanged: false,
    })).toBe(false);
  });

  it("UT-CAPEXR-108 asks for a cost-paid-by change or a relink reset on their own", () => {
    const quiet = {
      clusters: LINK_CLUSTERS, rows: [], selectedClusterOrder: undefined,
      clusterLinkageChanged: false, costPaidByChanged: false, milestoneRelinkResetNeeded: false,
    };
    expect(needsClusterLinkageConfirmation(quiet)).toBe(false);
    expect(needsClusterLinkageConfirmation({ ...quiet, costPaidByChanged: true })).toBe(true);
    expect(needsClusterLinkageConfirmation({ ...quiet, milestoneRelinkResetNeeded: true }))
      .toBe(true);
  });
});

describe("the relink confirmation copy", () => {
  const confirm = (over: Partial<Parameters<typeof clusterLinkageConfirmation>[0]> = {}) =>
    clusterLinkageConfirmation({
      costPaidByChanged: false, payer: "SPV",
      clusterLinkageChanged: false, milestoneRelinkResetNeeded: false,
      clustersWithCost: [], selectedName: NO_MILESTONE, selectedOrder: undefined,
      ...over,
    });

  it("UT-CAPEXR-109 renders the cost-paid-by bullet under Change Cost Paid By", () => {
    const c = confirm({ costPaidByChanged: true, payer: "DevCo" });
    expect(c.title).toBe("Change Cost Paid By");
    expect(c.description).toBe(
      "Are you sure you want to proceed with the following changes?"
      + '\n• Switch the "Cost Paid By" to DevCo. This will impact liquidity planning and BoP.',
    );
    expect(c.confirmLabel).toBe("Confirm");
    expect(c.cancelLabel).toBe("Cancel");
  });

  it("UT-CAPEXR-110 renders the cluster bullet under Change Cluster Link", () => {
    const c = confirm({
      clusterLinkageChanged: true,
      clustersWithCost: [{ order: 1 }, { order: 2 }],
      selectedName: "Cluster 3", selectedOrder: 3,
    });
    expect(c.title).toBe("Change Cluster Link");
    expect(c.description).toBe(
      "Are you sure you want to proceed with the following changes?"
      + "\n• Costs have been entered for Cluster 1, 2 and linked to Cluster 3.",
    );
  });

  it("UT-CAPEXR-111 renders the relink-reset bullet verbatim", () => {
    // `:19882` — the quotes around Paid are doubled in Power Fx, i.e. literal `"Paid"`.
    const c = confirm({ milestoneRelinkResetNeeded: true, selectedName: "Cluster 3" });
    expect(c.description).toContain(
      '\n• "Paid" markers are not supported for milestone-linked costs. '
      + "Linking this cost to a milestone will reset all costs to unpaid.",
    );
    expect(c.title).toBe("Change Cluster Link");
  });

  it("UT-CAPEXR-112 stacks all three bullets as Confirm Changes / Confirm All", () => {
    const c = confirm({
      costPaidByChanged: true, payer: "DevCo",
      clusterLinkageChanged: true, milestoneRelinkResetNeeded: true,
      clustersWithCost: [{ order: 1 }], selectedName: "Cluster 3", selectedOrder: 3,
    });
    expect(c.title).toBe("Confirm Changes");
    expect(c.confirmLabel).toBe("Confirm All");
    expect(c.description.split("\n")).toHaveLength(4);
  });

  it("UT-CAPEXR-113 keeps the canvas' two different counts of colOtherClusterHavingCost", () => {
    /*
     * `locShowC2` and the Title filter the selected cluster OUT (`:19877-19881`, `:19945-19952`);
     * the confirm button's label tests the RAW `CountRows(colOtherClusterHavingCost)` (`:19929`).
     * A cost whose only money is in the cluster it is being linked to therefore shows NO cluster
     * bullet but still gets the "Confirm All" label. Transcribed, not tidied.
     */
    const c = confirm({
      costPaidByChanged: true, payer: "SPV",
      clusterLinkageChanged: true,
      clustersWithCost: [{ order: 3 }], selectedName: "Cluster 3", selectedOrder: 3,
    });
    expect(c.description).not.toContain("Costs have been entered");
    expect(c.title).toBe("Change Cost Paid By");
    expect(c.confirmLabel).toBe("Confirm All");
  });
});

/* ------------------------------------------- the Edit panel's month boxes */

describe("validateMonthAmount", () => {
  // `lbl_…_FirstMonth_ErrorMessage_*`, one per month, branching on the distribution SCHEME.
  it("UT-CAPEXR-060 takes a whole number in range for Absolute Values", () => {
    expect(validateMonthAmount("1500", "absolute", "Germany"))
      .toEqual({ valid: true, message: null });
  });

  it("UT-CAPEXR-061 rejects a decimal for Absolute Values", () => {
    // `Not(IsInteger(v))` — and the message is the canvas' own wording.
    expect(validateMonthAmount("1500.5", "absolute", "Germany").message)
      .toBe("Value must be a numeric");
  });

  it("UT-CAPEXR-062 bounds Absolute Values by the country ceiling, WITH a full stop", () => {
    // `InRange(v, 0, If(Country.Name = "Poland", 2250000000, 500000000))`. Unlike
    // `validateTotalCost`, this sentence ends in a full stop in the canvas.
    expect(validateMonthAmount("500000001", "absolute", "Germany").message)
      .toBe("Value must be between 0 and 500,000,000.");
    expect(validateMonthAmount("500000001", "absolute", "Poland"))
      .toEqual({ valid: true, message: null });
    expect(validateMonthAmount("2250000001", "absolute", "Poland").message)
      .toBe("Value must be between 0 and 2,250,000,000.");
  });

  it("UT-CAPEXR-063 allows ONE decimal for % Values, not two", () => {
    // `IsOneDecimal`, not `IsTwoDecimal` — the canvas message says so in as many words.
    expect(validateMonthAmount("12.5", "percent", "Germany"))
      .toEqual({ valid: true, message: null });
    expect(validateMonthAmount("12.55", "percent", "Germany").message)
      .toBe("Value must be numeric upto one decimal");
  });

  it("UT-CAPEXR-064 bounds % Values at 0 and 100", () => {
    expect(validateMonthAmount("100", "percent", "Germany"))
      .toEqual({ valid: true, message: null });
    expect(validateMonthAmount("100.1", "percent", "Germany").message)
      .toBe("Value must be between 0 and 100.");
    expect(validateMonthAmount("-1", "percent", "Germany").valid).toBe(false);
  });

  it("UT-CAPEXR-065 treats a blank month as no cost, not as an error", () => {
    // Every branch is gated on `Not(IsBlank(...))`.
    expect(validateMonthAmount("", "absolute", "Germany"))
      .toEqual({ valid: true, message: null });
    expect(validateMonthAmount("   ", "percent", "Germany"))
      .toEqual({ valid: true, message: null });
  });
});

describe("monthAmountErrors", () => {
  it("UT-CAPEXR-066 keys each bad month by year and month", () => {
    const out = monthAmountErrors(
      [{ year: 2026, month: 1, amount: 10 }, { year: 2026, month: 2, amount: 100.25 }],
      "percent",
      "Germany",
    );
    expect([...out.keys()]).toEqual(["2026-2"]);
    expect(out.get("2026-2")).toBe("Value must be numeric upto one decimal");
  });

  it("UT-CAPEXR-067 is empty when every month passes, so Save stays open", () => {
    expect(monthAmountErrors(
      [{ year: 2026, month: 1, amount: 250 }], "absolute", "Germany",
    ).size).toBe(0);
  });
});
