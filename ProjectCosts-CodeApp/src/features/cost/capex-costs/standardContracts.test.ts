import { describe, expect, it } from "vitest";
import {
  COST_UNIT, activeWtgCount, applicableStartCluster, buildStandardOptions,
  checkStandardContractClick, eligibleClusters, showStandardSubMenu,
  standardAssumptionAmount, standardContractRefusal, type DevexCapexAssumption,
} from "./standardContracts";
import type { ClusterDuration } from "./clusters";

const cluster = (order: number, startYear = 2020, endYear = 2021): ClusterDuration => ({
  order, name: `Cluster ${order}`, startYear, startMonth: 1, endYear, endMonth: 1,
});

const assumption = (over: Partial<DevexCapexAssumption> = {}): DevexCapexAssumption => ({
  id: "a1", description: "Standard O&M", subaccountId: "sub-1",
  countryId: "Germany", technology: 952850000,
  costAmount: 100, unit: COST_UNIT.eur, costPaidBy: 952850001, distributionFrequency: 1,
  applyVat: true, depreciation: true,
  clusters: [true, true, true, true, true],
  ...over,
});

describe("standardAssumptionAmount", () => {
  it("UT-STD-001 passes a flat EUR amount through unchanged", () => {
    expect(standardAssumptionAmount(COST_UNIT.eur, 500, { totalCapacity: 12, activeWtgCount: 4 }))
      .toBe(500);
  });

  it("UT-STD-002 multiplies a per-WTG unit by the active generator count", () => {
    expect(standardAssumptionAmount(COST_UNIT.eurPerWtg, 1500, { totalCapacity: 0, activeWtgCount: 4 }))
      .toBe(6000);
  });

  it("UT-STD-003 multiplies a per-MW(p) unit by total capacity", () => {
    expect(standardAssumptionAmount(COST_UNIT.eurPerMw, 200, { totalCapacity: 12, activeWtgCount: 0 }))
      .toBe(2400);
  });

  it("UT-STD-004 treats PLN units the same as their EUR equivalents", () => {
    expect(standardAssumptionAmount(COST_UNIT.plnPerWtg, 100, { totalCapacity: 0, activeWtgCount: 3 }))
      .toBe(300);
  });
});

describe("activeWtgCount", () => {
  it("UT-STD-005 sums only active rows", () => {
    expect(activeWtgCount([{ count: 4, active: true }, { count: 6, active: false }])).toBe(4);
  });

  it("UT-STD-006 sums several active rows", () => {
    expect(activeWtgCount([{ count: 4, active: true }, { count: 2, active: true }])).toBe(6);
  });
});

describe("applicableStartCluster", () => {
  it("UT-STD-007 passes 0-4 through unchanged", () => {
    expect(applicableStartCluster(0)).toBe(0);
    expect(applicableStartCluster(3)).toBe(3);
  });

  it("UT-STD-008 floors anything 5 or above at 5", () => {
    expect(applicableStartCluster(5)).toBe(5);
    expect(applicableStartCluster(6)).toBe(5);
  });

  it("UT-STD-009 treats a missing value as Greenfield", () => {
    expect(applicableStartCluster(undefined)).toBe(0);
  });
});

describe("eligibleClusters", () => {
  const clusters = [cluster(1), cluster(2), cluster(3), cluster(4), cluster(5)];

  it("UT-STD-010 keeps only clusters ticked on the assumption", () => {
    const eligible = eligibleClusters(
      { clusters: [true, false, true, false, false] }, clusters, 0,
    );
    expect(eligible.map((c) => c.order)).toEqual([1, 3]);
  });

  it("UT-STD-011 drops clusters below the project's start cluster", () => {
    const eligible = eligibleClusters(
      { clusters: [true, true, true, true, true] }, clusters, 3,
    );
    expect(eligible.map((c) => c.order)).toEqual([3, 4, 5]);
  });

  it("UT-STD-012 ignores an inverted or zero-span cluster", () => {
    const bad = cluster(2, 2022, 2020);
    const eligible = eligibleClusters(
      { clusters: [true, true, true, true, true] }, [cluster(1), bad], 0,
    );
    expect(eligible.map((c) => c.order)).toEqual([1]);
  });

  it("UT-STD-013 never considers cluster 6 (assumptions only tick 1-5)", () => {
    const eligible = eligibleClusters(
      { clusters: [true, true, true, true, true] }, [...clusters, cluster(6)], 0,
    );
    expect(eligible.map((c) => c.order)).not.toContain(6);
  });
});

describe("standardContractRefusal", () => {
  it("UT-STD-014 refuses when nothing is eligible", () => {
    expect(standardContractRefusal([])).toContain("no applicable cost period");
  });

  it("UT-STD-015 says nothing when at least one cluster is eligible", () => {
    expect(standardContractRefusal([cluster(1)])).toBeNull();
  });
});

describe("buildStandardOptions", () => {
  const clusters = [cluster(1), cluster(2)];

  it("UT-STD-016 matches on category, country and technology", () => {
    const options = buildStandardOptions({
      assumptions: [assumption()],
      subaccountIdsInCategory: ["sub-1"],
      project: { countryId: "Germany", technology: 952850000 },
      existingContracts: [],
      clusters,
    });
    expect(options).toHaveLength(1);
  });

  it("UT-STD-017 excludes an assumption for a sub-account outside this category", () => {
    const options = buildStandardOptions({
      assumptions: [assumption()],
      subaccountIdsInCategory: ["sub-2"],
      project: { countryId: "Germany", technology: 952850000 },
      existingContracts: [],
      clusters,
    });
    expect(options).toHaveLength(0);
  });

  it("UT-STD-018 excludes a technology or country mismatch", () => {
    const opts1 = buildStandardOptions({
      assumptions: [assumption({ countryId: "France" })],
      subaccountIdsInCategory: ["sub-1"], project: { countryId: "Germany", technology: 952850000 },
      existingContracts: [], clusters,
    });
    const opts2 = buildStandardOptions({
      assumptions: [assumption({ technology: 952850001 })],
      subaccountIdsInCategory: ["sub-1"], project: { countryId: "Germany", technology: 952850000 },
      existingContracts: [], clusters,
    });
    expect(opts1).toHaveLength(0);
    expect(opts2).toHaveLength(0);
  });

  it("UT-STD-019 excludes an assumption already created for that sub-account", () => {
    const options = buildStandardOptions({
      assumptions: [assumption()],
      subaccountIdsInCategory: ["sub-1"],
      project: { countryId: "Germany", technology: 952850000 },
      existingContracts: [{ subaccountId: "sub-1", standardAssumptionId: "a1" }],
      clusters,
    });
    expect(options).toHaveLength(0);
  });

  it("UT-STD-020 excludes an assumption with no eligible cluster", () => {
    const options = buildStandardOptions({
      assumptions: [assumption({ clusters: [false, false, false, false, false] })],
      subaccountIdsInCategory: ["sub-1"],
      project: { countryId: "Germany", technology: 952850000 },
      existingContracts: [],
      clusters,
    });
    expect(options).toHaveLength(0);
  });
});

describe("showStandardSubMenu / checkStandardContractClick", () => {
  it("UT-STD-021 shows the submenu only above one option", () => {
    expect(showStandardSubMenu(0)).toBe(false);
    expect(showStandardSubMenu(1)).toBe(false);
    expect(showStandardSubMenu(2)).toBe(true);
  });

  it("UT-STD-022 refuses without a selected sub-account", () => {
    const result = checkStandardContractClick({ subaccountSelected: false, alreadyExists: false });
    expect(result.ok).toBe(false);
    expect(result.message).toContain("select a valid subaccount");
  });

  it("UT-STD-023 refuses a duplicate", () => {
    const result = checkStandardContractClick({ subaccountSelected: true, alreadyExists: true });
    expect(result.ok).toBe(false);
    expect(result.message).toContain("already created");
  });

  it("UT-STD-024 allows a fresh, valid click", () => {
    expect(checkStandardContractClick({ subaccountSelected: true, alreadyExists: false }))
      .toEqual({ ok: true });
  });
});
