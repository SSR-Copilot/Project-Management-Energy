/**
 * Opex Costs Screen — unit tests. IDs are the spec's `UT-OPEX-nnn`.
 *
 * Both rail modes are covered: every mode-dependent rule is asserted twice, once as
 * `om` (rail item `O&MKey`, "Operation & Maintenance") and once as `other`
 * (rail item `OtherOpexCostsKey`, "Other OPEX Costs").
 */
import { describe, it, expect } from "vitest";
import { CHOICE_COST, OPEX_MODE_NAMES } from "@/data/entities";
import {
  MODE_DISPLAY_NAME, NAV_KEY_TO_MODE, OPEX_MSG, DELETE_DIALOG,
  O_AND_M_EMPTY_STATE, O_AND_M_EMPTY_STATE_CANVAS, OPEX_DISTRIBUTION_FREQUENCY,
  TIME_ZONE_RULE_VERSION_NUMBER, CASCADED_FIELDS, STANDARD_STAMP,
  modeFromNavKey, selectedAccount, isOandMSubaccount, showThresholdColumns,
  subaccountsForMode, deviceTypeList, groupChains, lastPeriod, chainOf, nextStartDate,
  startDateStandardFlagAfterManualChange, inheritStartDateStandard, isStandardLocked,
  canAddPeriod, canEditCost, canDeleteCost, canAddStandardContract, commandsInScope,
  opexCommands, descriptionIsFree, standardAssumptionFilter, matchesStandardAssumption,
  standardPeriodStarts, inflationStartYear, resolveInflationProfile, cascadeToChildren,
  planDeleteCost, deleteDialogText, deleteDialogTextCanvasParity, periodEndDate,
  durationBadge, costName, standardCostName, deviceTypeForSave, validateOpexNumber,
  startDateError, startDateErrorVisibleCanvasParity, canSaveOpexCost, sortCosts,
  costsForDevice, costsForSubaccount,
  type OpexCost, type OpexForm, type OpexAssumption, type OpexSubaccount,
} from "./rules";

/* ────────────────────────────────────────────────────────────────── fixtures */

const cost = (o: Partial<OpexCost> = {}): OpexCost => ({
  id: "p1", name: "Service", description: "Service", parentCostId: null,
  subaccountId: "sub-1", deviceTypeInProjectId: null, startDate: "2027-01-01",
  durationYears: 5, durationMonths: 0, currencyId: "eur", fixCosts: 1000,
  percentOfRevenues: null, eurPerMwh: null, eurPerMw: null, eurPerWtg: null,
  aggregation: CHOICE_COST.aggregation.sum, distributionFrequency: 12,
  threshold: false, thresholdType: null, thresholdIndividual: null,
  useInflationProfile: false, useCountryInflationProfile: false, inflationProfile: null,
  inflationStartYear: null, inflationCountryArea: null, alignWithProjectDuration: false,
  externalContract: false, isStandardContract: false,
  isStartDateStandardAssumption: false, ...o,
});

const sub = (o: Partial<OpexSubaccount> = {}): OpexSubaccount => ({
  id: "sub-1", name: "Operation & Maintenance", order: 1, accountId: "acc-1",
  accountName: OPEX_MODE_NAMES.oandm, ...o,
});

const assumption = (o: Partial<OpexAssumption> = {}): OpexAssumption => ({
  id: "a-1", period: 1, durationYears: 5, durationMonths: 0,
  typeOfContract: CHOICE_COST.typeOfContract.opexOandM, countryId: "de",
  technology: "Wind", opexSubaccountId: null, description: "Standard O&M",
  fixCosts: 1000, percentOfRevenues: null, eurPerMwh: null, eurPerMw: null,
  eurPerWtg: null, aggregation: CHOICE_COST.aggregation.sum, distributionFrequency: 12,
  threshold: false, thresholdType: null, thresholdIndividual: null,
  useInflationProfile: false, useCountryInflationProfile: false, inflationProfile: null,
  inflationCountryArea: null, alignWithProjectDuration: false, externalContract: false,
  ...o,
});

const form = (o: Partial<OpexForm> = {}): OpexForm => ({
  description: "Service", startDate: "2027-01-01", durationYears: 5, durationMonths: 0,
  currencyId: "eur", aggregation: CHOICE_COST.aggregation.sum, distributionFrequency: 12,
  fixCosts: "1000.00", percentOfRevenues: "", eurPerMwh: "", eurPerMw: "", eurPerWtg: "",
  thresholdOn: false, thresholdType: null, thresholdIndividual: "",
  inflationOn: false, useCountryInflationProfile: false, inflationStartYear: "",
  inflationProfile: "", inflationCountryArea: null, isNew: true, ...o,
});

const accounts = [
  { id: "acc-om", name: OPEX_MODE_NAMES.oandm, order: 1 },
  { id: "acc-other", name: OPEX_MODE_NAMES.other, order: 2 },
];

const perms = { canCreate: true, canEditRecord: true, canDeleteRecord: true };

/* ══════════════════════════════════════════════════════════════ the modes ════ */

describe("Opex — one screen, two rail items", () => {
  it("UT-OPEX-001 the O&M rail item selects the first account by Order", () => {
    expect(modeFromNavKey("O&MKey")).toBe("om");
    expect(NAV_KEY_TO_MODE["O&MKey"]).toBe("om");
    expect(selectedAccount(accounts, "om")!.id).toBe("acc-om");
    expect(MODE_DISPLAY_NAME.om).toBe("Operation & Maintenance");
  });

  it("UT-OPEX-002 the Other OPEX rail item selects the last account by Order", () => {
    expect(modeFromNavKey("OtherOpexCostsKey")).toBe("other");
    expect(selectedAccount(accounts, "other")!.id).toBe("acc-other");
    expect(MODE_DISPLAY_NAME.other).toBe("Other OPEX Costs");
  });

  it("UT-OPEX-002b the positional rule is only a fallback (source ambiguity 1)", () => {
    // Re-ordered table: Other OPEX now sorts first. The name match still wins.
    const reordered = [
      { id: "acc-other", name: OPEX_MODE_NAMES.other, order: 1 },
      { id: "acc-om", name: OPEX_MODE_NAMES.oandm, order: 2 },
    ];
    expect(selectedAccount(reordered, "om")!.id).toBe("acc-om");
    expect(selectedAccount(reordered, "other")!.id).toBe("acc-other");
    // With unrecognisable names the canvas' First/Last rule is what remains.
    const unnamed = [{ id: "x", name: "?", order: 1 }, { id: "y", name: "??", order: 2 }];
    expect(selectedAccount(unnamed, "om")!.id).toBe("x");
    expect(selectedAccount(unnamed, "other")!.id).toBe("y");
    expect(selectedAccount([], "om")).toBeNull();
  });

  it("UT-OPEX-003 switching rail items re-derives the mode", () => {
    expect(modeFromNavKey("O&MKey")).toBe("om");
    expect(modeFromNavKey("OtherOpexCostsKey")).toBe("other");
    expect(modeFromNavKey("LandLeaseKey")).toBeNull();
    expect(modeFromNavKey(null)).toBeNull();
  });

  it("UT-OPEX-004 Threshold and % of Revenues exist only in O&M mode", () => {
    expect(showThresholdColumns("om")).toBe(true);
    expect(showThresholdColumns("other")).toBe(false);
    expect(isOandMSubaccount(sub())).toBe(true);
    expect(isOandMSubaccount(sub({ name: "Insurance" }))).toBe(false);
    expect(isOandMSubaccount(null)).toBe(false);
  });

  it("UT-OPEX-005 Other mode lists only Other OPEX Costs sub-accounts", () => {
    const all = [
      sub({ id: "s1", accountName: OPEX_MODE_NAMES.oandm }),
      sub({ id: "s2", name: "Insurance", accountName: OPEX_MODE_NAMES.other, order: 2 }),
      sub({ id: "s3", name: "Fees", accountName: OPEX_MODE_NAMES.other, order: 1 }),
    ];
    expect(subaccountsForMode(all, "other").map((x) => x.id)).toEqual(["s3", "s2"]);
    expect(subaccountsForMode(all, "om")).toHaveLength(3);
  });

  it("UT-OPEX-006 O&M lists WTG types by the generator's Created On, then PV", () => {
    const list = deviceTypeList(
      [
        { id: "g2", name: "WTG B", typeInProjectId: "t2", createdOn: "2026-02-01" },
        { id: "g1", name: "WTG A", typeInProjectId: "t1", createdOn: "2026-01-01" },
      ],
      [{ id: "p1", name: "PV 1", typeInProjectId: "t3", createdOn: null }],
    );
    expect(list.map((d) => d.id)).toEqual(["g1", "g2", "p1"]);
    expect(list.every((d) => d.isFolded)).toBe(true);
    expect(list[2].kind).toBe("pv");
  });

  it("UT-OPEX-007 the O&M empty state points at the Generators screen", () => {
    expect(deviceTypeList([], [])).toHaveLength(0);
    expect(O_AND_M_EMPTY_STATE).toContain("Generators screen");
    // The canvas wording is kept so the divergence is visible.
    expect(O_AND_M_EMPTY_STATE_CANVAS).toContain("refresh this page");
  });

  it("UT-OPEX-008/009 costs are scoped by device or sub-account and sorted", () => {
    const costs = [
      cost({ id: "1", deviceTypeInProjectId: "dev-A", description: "Z", startDate: "2027-01-01" }),
      cost({ id: "2", deviceTypeInProjectId: "dev-A", description: "A", startDate: "2028-01-01" }),
      cost({ id: "3", deviceTypeInProjectId: "dev-B", description: "M" }),
      cost({ id: "4", deviceTypeInProjectId: null, subaccountId: "sub-9", description: "Q" }),
    ];
    expect(costsForDevice(costs, "dev-A").map((c) => c.id)).toEqual(["2", "1"]);
    expect(costsForSubaccount(costs, "sub-9").map((c) => c.id)).toEqual(["4"]);
  });

  it("the sort is Description first, Start Date as the tie-break", () => {
    const sorted = sortCosts([
      cost({ id: "b", description: "Same", startDate: "2029-01-01" }),
      cost({ id: "a", description: "Same", startDate: "2027-01-01" }),
    ]);
    expect(sorted.map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("UT-OPEX-028 the saved cost name differs by mode", () => {
    const parts = {
      accountName: "Other OPEX Costs", subaccountName: "Insurance", deviceName: "WTG A",
    };
    expect(costName("om", parts, "Service")).toBe("Insurance-WTG A-Service");
    expect(costName("other", parts, "Service")).toBe("Other OPEX Costs-Insurance-Service");
    expect(standardCostName("Insurance", "Standard cover"))
      .toBe("Other OPEX Costs-Insurance-Standard cover");
  });

  it("UT-OPEX-029 DeviceTypeInProject is blank in Other mode", () => {
    expect(deviceTypeForSave("om", "dev-1")).toBe("dev-1");
    expect(deviceTypeForSave("other", "dev-1")).toBeNull();
  });
});

/* ══════════════════════════════════════════════════════════════ the chain ════ */

describe("Opex — cost-type chains", () => {
  const root = cost({ id: "r", name: "Service", parentCostId: null });
  const p2 = cost({ id: "p2", name: "Service - 2", parentCostId: "r" });
  const p3 = cost({ id: "p3", name: "Service - 3", parentCostId: "r" });
  const chain = groupChains([p3, root, p2])[0];

  it("chains group by Parent Cost with the root first", () => {
    expect(chain.root.id).toBe("r");
    expect(chain.periods.map((p) => p.id)).toEqual(["r", "p2", "p3"]);
    expect(lastPeriod(chain).id).toBe("p3");
    expect(chainOf([chain], "p2")!.root.id).toBe("r");
    expect(chainOf([chain], "nope")).toBeNull();
  });

  it("UT-OPEX-010 a new period starts where the previous one ended", () => {
    const start = nextStartDate(
      { startDate: "2027-01-01", durationYears: 2, durationMonths: 6 }, null,
    )!;
    expect(start.getFullYear()).toBe(2029);
    expect(start.getMonth()).toBe(6); // July
    expect(start.getDate()).toBe(1);
  });

  it("UT-OPEX-011 a brand-new cost type defaults to COD", () => {
    const start = nextStartDate(null, "2027-04-01")!;
    expect(start.getFullYear()).toBe(2027);
    expect(start.getMonth()).toBe(3);
    expect(nextStartDate(null, null)).toBeNull();
  });

  it("UT-OPEX-012 Add Period is only enabled on the last period of a chain", () => {
    expect(canAddPeriod(chain, p2, perms)).toBe(false);
    expect(canAddPeriod(chain, p3, perms)).toBe(true);
    expect(canAddPeriod(chain, p3, { ...perms, canCreate: false })).toBe(false);
    expect(canAddPeriod(null, p3, perms)).toBe(false);
  });

  it("a one-period cost type is its own last period", () => {
    const lone = groupChains([cost({ id: "solo" })])[0];
    expect(canAddPeriod(lone, lone.root, perms)).toBe(true);
  });

  it("UT-OPEX-013 standard-created costs cannot be edited or extended", () => {
    const std = cost({ id: "s", isStandardContract: true });
    expect(isStandardLocked(std)).toBe(true);
    expect(canEditCost(std, perms)).toBe(false);
    expect(canAddPeriod(groupChains([std])[0], std, perms)).toBe(false);
  });

  it('UT-OPEX-014 a cost whose Name starts with "Standard" is also locked', () => {
    const std = cost({ id: "s", name: "Standard O&M", isStandardContract: false });
    expect(isStandardLocked(std)).toBe(true);
    expect(canEditCost(std, perms)).toBe(false);
  });

  it("UT-OPEX-015 a standard chain can only be deleted from its root", () => {
    const stdRoot = cost({ id: "sr", name: "Standard O&M", parentCostId: null });
    const stdChild = cost({ id: "sc", name: "Standard O&M - 2", parentCostId: "sr" });
    expect(canDeleteCost(stdChild, perms)).toBe(false);
    expect(canDeleteCost(stdRoot, perms)).toBe(true);
    // A non-standard leaf deletes freely.
    expect(canDeleteCost(p2, perms)).toBe(true);
  });

  it("UT-OPEX-016 deleting a chain root deletes every period in one request", () => {
    const plan = planDeleteCost([chain], root);
    expect(plan.ids).toEqual(["r", "p2", "p3"]);
    expect(plan.cascades).toBe(true);
  });

  it("UT-OPEX-017 deleting a leaf period deletes only that row", () => {
    const plan = planDeleteCost([chain], p3);
    expect(plan.ids).toEqual(["p3"]);
    expect(plan.cascades).toBe(false);
  });

  it("UT-OPEX-047 the delete dialog wording matches the cascade", () => {
    expect(deleteDialogText(root)).toBe(DELETE_DIALOG.cascade);
    expect(deleteDialogText(p3)).toBe(DELETE_DIALOG.single);
    // SOURCE DEFECT parity: the canvas tests the selection itself, so with any selection
    // the cascade wording is unreachable.
    expect(deleteDialogTextCanvasParity(root)).toBe(DELETE_DIALOG.single);
    expect(deleteDialogTextCanvasParity(null)).toBe(DELETE_DIALOG.cascade);
  });

  it("UT-OPEX-018/019 a standard contract is blocked once ANY cost exists in scope", () => {
    expect(canAddStandardContract([], perms)).toBe(true);
    expect(canAddStandardContract([cost()], perms)).toBe(false);
    expect(canAddStandardContract([], { ...perms, canCreate: false })).toBe(false);
  });

  it("the duplicate-description guard on Add Period", () => {
    expect(descriptionIsFree("Service", [cost({ description: "Service" })])).toBe(false);
    expect(descriptionIsFree("Other", [cost({ description: "Service" })])).toBe(true);
  });

  it("rule 5/13 — the start-date standard flag", () => {
    expect(startDateStandardFlagAfterManualChange(null)).toBe(false);
    expect(startDateStandardFlagAfterManualChange("parent")).toBe(true);
    expect(inheritStartDateStandard({ isStartDateStandardAssumption: true }, false)).toBe(true);
    expect(inheritStartDateStandard(null, true)).toBe(true);
  });
});

/* ═══════════════════════════════════════════════════════════ standard load ════ */

describe("Opex — standard assumption load", () => {
  it("UT-OPEX-020 the assumption filter differs by mode", () => {
    const scope = { countryId: "de", technology: "Wind", subaccountId: "sub-9" };
    const om = standardAssumptionFilter("om", scope);
    expect(om.typeOfContract).toBe(CHOICE_COST.typeOfContract.opexOandM);
    expect(om.opexSubaccountId).toBeNull();

    const other = standardAssumptionFilter("other", scope);
    expect(other.typeOfContract).toBe(CHOICE_COST.typeOfContract.opexOther);
    expect(other.opexSubaccountId).toBe("sub-9");

    expect(matchesStandardAssumption(assumption(), om)).toBe(true);
    expect(matchesStandardAssumption(assumption(), other)).toBe(false);
    expect(matchesStandardAssumption(assumption({
      typeOfContract: CHOICE_COST.typeOfContract.opexOther, opexSubaccountId: "sub-9",
    }), other)).toBe(true);
    expect(matchesStandardAssumption(assumption({ countryId: "pl" }), om)).toBe(false);
    expect(matchesStandardAssumption(assumption({ technology: "PV" }), om)).toBe(false);
  });

  it("UT-OPEX-021 the load chains the period start dates", () => {
    const starts = standardPeriodStarts("2027-04-01", [
      assumption({ period: 1, durationYears: 5, durationMonths: 0 }),
      assumption({ period: 2, durationYears: 5, durationMonths: 0 }),
      assumption({ period: 3, durationYears: 10, durationMonths: 0 }),
    ]);
    expect(starts.map((p) => p.startDate.toISOString().slice(0, 10)))
      .toEqual(["2027-04-01", "2032-04-01", "2037-04-01"]);
  });

  it("UT-OPEX-022 the country inflation profile wins when both flags are Yes", () => {
    expect(inflationStartYear("2027-04-01")).toBe(2028);
    expect(resolveInflationProfile({
      useInflationProfile: true, useCountryInflationProfile: true, inflationProfile: 1.8,
    }, 2.4)).toBe(2.4);
  });

  it("UT-OPEX-023 the assumption's own profile is used when country inflation is off", () => {
    expect(resolveInflationProfile({
      useInflationProfile: true, useCountryInflationProfile: false, inflationProfile: 1.8,
    }, 2.4)).toBe(1.8);
  });

  it("UT-OPEX-024 inflation off leaves the profile blank", () => {
    expect(resolveInflationProfile({
      useInflationProfile: false, useCountryInflationProfile: true, inflationProfile: 1.8,
    }, 2.4)).toBeNull();
    expect(inflationStartYear(null)).toBeNull();
  });

  it("UT-OPEX-025 standard-created rows are stamped", () => {
    expect(STANDARD_STAMP).toEqual({
      isStandardContract: true, isStartDateStandardAssumption: true,
    });
  });
});

/* ═════════════════════════════════════════════════════════════ the cascade ════ */

describe("Opex — save cascade", () => {
  const parent = cost({
    id: "r", useInflationProfile: true, inflationProfile: 2.4, inflationStartYear: 2028,
    threshold: true, thresholdType: CHOICE_COST.thresholdType.individual,
    thresholdIndividual: 500, externalContract: true, alignWithProjectDuration: true,
    fixCosts: 9999, durationYears: 7,
  });
  const kids = [
    cost({ id: "c1", parentCostId: "r", fixCosts: 1, durationYears: 1 }),
    cost({ id: "c2", parentCostId: "r", fixCosts: 2, durationYears: 2 }),
  ];

  it("UT-OPEX-026 saving a parent cascades ten fields to every child", () => {
    const plan = cascadeToChildren(parent, kids);
    expect(plan.map((p) => p.id)).toEqual(["c1", "c2"]);
    expect(Object.keys(plan[0].payload).sort()).toEqual([...CASCADED_FIELDS].sort());
    expect(plan[0].payload.inflationProfile).toBe(2.4);
    expect(plan[0].payload.thresholdIndividual).toBe(500);
    expect(plan[0].payload.externalContract).toBe(true);
    // Rates, dates and durations are NOT cascaded.
    expect(Object.keys(plan[0].payload)).not.toContain("fixCosts");
    expect(Object.keys(plan[0].payload)).not.toContain("startDate");
    expect(Object.keys(plan[0].payload)).not.toContain("durationYears");
  });

  it("UT-OPEX-027 the cascade does not run when there are no children", () => {
    expect(cascadeToChildren(parent, [])).toEqual([]);
  });

  it("rule 14 — the Time Zone Rule Version Number is a named constant", () => {
    expect(TIME_ZONE_RULE_VERSION_NUMBER).toBe(4);
  });
});

/* ═════════════════════════════════════════════════════════ duration badge ════ */

describe("Opex — duration badge", () => {
  const project = { projectStartDate: "2026-01-01", endDate: "2049-12-31" };

  it("UT-OPEX-041 the badge matches when the last period ends on the project end", () => {
    const costs = [cost({
      id: "r", startDate: "2027-01-01", durationYears: 23, durationMonths: 0,
      alignWithProjectDuration: true,
    })];
    expect(periodEndDate(costs[0])!.toISOString().slice(0, 10)).toBe("2049-12-31");
    expect(durationBadge(costs, project)).toBe("match");
  });

  it("UT-OPEX-042 an aligned cost type that ends early is a mismatch", () => {
    const costs = [cost({
      id: "r", startDate: "2027-01-01", durationYears: 20, durationMonths: 0,
      alignWithProjectDuration: true,
    })];
    expect(durationBadge(costs, project)).toBe("mismatch");
  });

  it("UT-OPEX-043 the badge is none with no cost types", () => {
    expect(durationBadge([], project)).toBe("none");
    expect(durationBadge([cost()], { projectStartDate: null, endDate: null })).toBe("none");
  });

  it("only the LAST period of each chain is judged", () => {
    const costs = [
      cost({ id: "r", startDate: "2027-01-01", durationYears: 2, durationMonths: 0 }),
      cost({
        id: "p2", name: "Service - 2", parentCostId: "r", startDate: "2029-01-01",
        durationYears: 21, durationMonths: 0, alignWithProjectDuration: true,
      }),
    ];
    expect(durationBadge(costs, project)).toBe("match");
  });

  it("an unaligned miss leaves the badge neutral rather than warning", () => {
    const costs = [cost({
      id: "r", startDate: "2027-01-01", durationYears: 1, durationMonths: 0,
      alignWithProjectDuration: false,
    })];
    expect(durationBadge(costs, project)).toBe("none");
  });
});

/* ═════════════════════════════════════════════════════════════ validation ════ */

describe("Opex — validation and gating", () => {
  it("UT-OPEX-030 at least one rate field is required", () => {
    expect(canSaveOpexCost(form({ fixCosts: "" }), { countryName: "Germany" }, [])).toBe(false);
    expect(canSaveOpexCost(form({ fixCosts: "12.00" }), { countryName: "Germany" }, []))
      .toBe(true);
    expect(canSaveOpexCost(form({ fixCosts: "", eurPerMwh: "3.00" }),
      { countryName: "Germany" }, [])).toBe(true);
  });

  it("UT-OPEX-031 duration cannot be zero years and zero months", () => {
    expect(canSaveOpexCost(form({ durationYears: 0, durationMonths: 0 }),
      { countryName: "Germany" }, [])).toBe(false);
    expect(canSaveOpexCost(form({ durationYears: 0, durationMonths: 6 }),
      { countryName: "Germany" }, [])).toBe(true);
    expect(canSaveOpexCost(form({ durationYears: null }),
      { countryName: "Germany" }, [])).toBe(false);
  });

  it("UT-OPEX-032 Fix Costs is bounded at 1 000 000 000", () => {
    expect(validateOpexNumber("fixCosts", "1000000001"))
      .toBe(OPEX_MSG.range(1_000_000_000));
    expect(validateOpexNumber("fixCosts", "1000000000")).toBeNull();
    expect(canSaveOpexCost(form({ fixCosts: "1000000001" }),
      { countryName: "Germany" }, [])).toBe(false);
  });

  it("UT-OPEX-033 Fix Costs takes at most two decimals", () => {
    expect(validateOpexNumber("fixCosts", "12.345")).toBe(OPEX_MSG.twoDecimal);
    expect(validateOpexNumber("fixCosts", "12.34")).toBeNull();
  });

  it("UT-OPEX-034 % of Revenues is bounded at 10 000", () => {
    expect(validateOpexNumber("percentOfRevenues", "10001")).not.toBeNull();
    expect(validateOpexNumber("percentOfRevenues", "10000")).toBeNull();
  });

  it("the threshold value is bounded at 10 000 000", () => {
    expect(validateOpexNumber("thresholdIndividual", "10000001")).not.toBeNull();
    expect(validateOpexNumber("thresholdIndividual", "")).toBeNull();
  });

  it("UT-OPEX-035 an Individual threshold requires a value", () => {
    const base = {
      thresholdOn: true, thresholdType: CHOICE_COST.thresholdType.individual,
    };
    expect(canSaveOpexCost(form({ ...base, thresholdIndividual: "" }),
      { countryName: "Germany" }, [])).toBe(false);
    expect(canSaveOpexCost(form({ ...base, thresholdIndividual: "500.00" }),
      { countryName: "Germany" }, [])).toBe(true);
  });

  it("UT-OPEX-036 the threshold type is ignored while the toggle is off", () => {
    expect(canSaveOpexCost(form({ thresholdOn: false, thresholdType: null }),
      { countryName: "Germany" }, [])).toBe(true);
  });

  it("UT-OPEX-037 inflation on requires a start year and a profile", () => {
    expect(canSaveOpexCost(form({ inflationOn: true, inflationStartYear: "" }),
      { countryName: "Germany" }, [])).toBe(false);
    expect(canSaveOpexCost(form({
      inflationOn: true, inflationStartYear: "2028", inflationProfile: "2.4",
    }), { countryName: "Germany" }, [])).toBe(true);
  });

  it("UT-OPEX-038 Italy with both inflation toggles on requires an area", () => {
    const base = {
      inflationOn: true, useCountryInflationProfile: true,
      inflationStartYear: "2028", inflationProfile: "2.4",
    };
    expect(canSaveOpexCost(form({ ...base, inflationCountryArea: null }),
      { countryName: "Italy" }, [])).toBe(false);
    expect(canSaveOpexCost(form({ ...base, inflationCountryArea: 952850000 }),
      { countryName: "Italy" }, [])).toBe(true);
  });

  it("UT-OPEX-039 a non-Italian project does not require an area", () => {
    expect(canSaveOpexCost(form({
      inflationOn: true, useCountryInflationProfile: true,
      inflationStartYear: "2028", inflationProfile: "2.4", inflationCountryArea: null,
    }), { countryName: "Germany" }, [])).toBe(true);
  });

  it("UT-OPEX-040 a duplicate description within the scope is rejected on create", () => {
    expect(canSaveOpexCost(form({ isNew: true }), { countryName: "Germany" }, ["Service"]))
      .toBe(false);
    // An EDIT of the same row is not blocked by its own description.
    expect(canSaveOpexCost(form({ isNew: false }), { countryName: "Germany" }, ["Service"]))
      .toBe(true);
  });

  it("UT-OPEX-044 Edit and Delete require the record privileges in BOTH modes", () => {
    const selected = cost();
    const noEdit = { canCreate: true, canEditRecord: false, canDeleteRecord: true };
    const omGates = opexCommands({
      mode: "om", chain: groupChains([selected])[0], selected,
      costsInScope: [selected], permissions: noEdit, inScope: true,
    });
    const otherGates = opexCommands({
      mode: "other", chain: groupChains([selected])[0], selected,
      costsInScope: [selected], permissions: noEdit, inScope: true,
    });
    expect(omGates.edit).toBe(false);
    expect(otherGates.edit).toBe(false);
    // The O&M bar has no "Add Contract Type": the device type IS the contract type.
    expect(omGates.addContractType).toBe(false);
    expect(otherGates.addContractType).toBe(true);
  });

  it("commands do not leak across cards", () => {
    const selected = cost();
    expect(commandsInScope("card-A", "card-A")).toBe(true);
    expect(commandsInScope("card-A", "card-B")).toBe(false);
    const gates = opexCommands({
      mode: "other", chain: groupChains([selected])[0], selected,
      costsInScope: [selected], permissions: perms, inScope: false,
    });
    expect(gates.edit).toBe(false);
    expect(gates.delete).toBe(false);
    expect(gates.addPeriod).toBe(false);
  });

  it("UT-OPEX-045 a save failure has a message that keeps the panel", () => {
    expect(OPEX_MSG.saveFailed).toContain("OPEX cost could not be saved correctly");
    expect(OPEX_MSG.saveFailed).toContain("still in the panel");
  });

  it("UT-OPEX-046 the start-date error shows when the date is EMPTY", () => {
    expect(startDateError(null)).toBe(OPEX_MSG.blankDate);
    expect(startDateError("2027-01-01")).toBeNull();
    // SOURCE DEFECT parity: the canvas label is visible exactly when it should be hidden.
    expect(startDateErrorVisibleCanvasParity(null)).toBe(false);
    expect(startDateErrorVisibleCanvasParity("2027-01-01")).toBe(true);
  });

  it("UT-OPEX-048 the distribution frequency options are 1, 2, 3, 6 and 12 months", () => {
    expect(OPEX_DISTRIBUTION_FREQUENCY.map((x) => x.value)).toEqual([1, 2, 3, 6, 12]);
    expect(OPEX_DISTRIBUTION_FREQUENCY.map((x) => x.label))
      .toEqual(["1 month", "2 months", "3 months", "6 months", "12 months"]);
    // Note the ID is not the value: ID 4 → 6 months, ID 5 → 12 months.
    expect(OPEX_DISTRIBUTION_FREQUENCY.map((x) => x.id)).toEqual([1, 2, 3, 4, 5]);
  });
});
