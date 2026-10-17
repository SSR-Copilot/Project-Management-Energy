import { describe, expect, it } from "vitest";
import { qk } from "./keys";

/**
 * `qk.settings.*` must equal the keys the six settings screens build locally today, so the batch-2
 * switch is a drop-in (same cache entries, same tests). The literals below were copied from each
 * screen's `hooks.ts` / `data/settings/contracts.ts` on 2026-10-17.
 */
describe("qk.settings — identical to the screens' local keys", () => {
  const scope = { countryId: "c1", technology: 952850000 };

  it("UT-KEY-001 checklist-settings (checklistKeys)", () => {
    expect(qk.settings.checklists.all).toEqual(["settings", "checklist-settings"]);
    expect(qk.settings.checklists.tabs()).toEqual(["settings", "checklist-settings", "tabs"]);
    expect(qk.settings.checklists.clusters()).toEqual(["settings", "checklist-settings", "clusters"]);
    expect(qk.settings.checklists.tasks("t1")).toEqual(["settings", "checklist-settings", "tasks", "t1"]);
    expect(qk.settings.checklists.tasks(null)).toEqual(["settings", "checklist-settings", "tasks", ""]);
    expect(qk.settings.checklists.locks()).toEqual(["settings", "checklist-settings", "locks"]);
  });

  it("UT-KEY-002 project-gates (pgKeys), dataset by numeric technology code", () => {
    expect(qk.settings.gates.countries()).toEqual(["projectGates:countries"]);
    expect(qk.settings.gates.states()).toEqual(["projectGates:states"]);
    expect(qk.settings.gates.dataset("c1", 952850001)).toEqual(["projectGates", "c1", 952850001]);
    expect(qk.settings.gates.datasetNone()).toEqual(["projectGates", "none"]);
    expect(qk.settings.gates.people("  MÜ ")).toEqual(["projectGates:people", "mü"]);
  });

  it("UT-KEY-003 capex-accounts (capexAdminKeys)", () => {
    expect(qk.settings.capexAccounts.all).toEqual(["settings", "capex-accounts"]);
    expect(qk.settings.capexAccounts.tree).toEqual(["settings", "capex-accounts", "tree"]);
    expect(qk.settings.capexAccounts.hasContracts("a1")).toEqual(["settings", "capex-accounts", "has-contracts", "a1"]);
  });

  it("UT-KEY-004 milestones (milestoneKeys)", () => {
    expect(qk.settings.milestones.countries).toEqual(["milestoneCountries"]);
    expect(qk.settings.milestones.assumptions).toEqual(["milestoneStandardAssumptions"]);
  });

  it("UT-KEY-005 costs (costsKeys)", () => {
    expect(qk.settings.costs.all).toEqual(["settings-costs"]);
    expect(qk.settings.costs.countries).toEqual(["settings-costs", "countries"]);
    expect(qk.settings.costs.hierarchy).toEqual(["settings-costs", "capex-hierarchy"]);
    expect(qk.settings.costs.landLeaseSubaccounts).toEqual(["settings-costs", "land-lease-subaccounts"]);
    expect(qk.settings.costs.opexSubaccounts).toEqual(["settings-costs", "opex-subaccounts"]);
    expect(qk.settings.costs.currencies).toEqual(["settings-costs", "currencies"]);
    expect(qk.settings.costs.payerDefaults).toEqual(["settings-costs", "payer-defaults"]);
    expect(qk.settings.costs.inflationAreas("c1")).toEqual(["settings-costs", "inflation-areas", "c1"]);
    expect(qk.settings.costs.devex(scope)).toEqual(["settings-costs", "devex", "c1", 952850000]);
    expect(qk.settings.costs.devex(undefined)).toEqual(["settings-costs", "devex", "-", -1]);
    expect(qk.settings.costs.opex(scope)).toEqual(["settings-costs", "opex", "c1", 952850000]);
  });

  it("UT-KEY-006 contracts (contractSettingsKeys)", () => {
    expect(qk.settings.contracts.countries).toEqual(["settings-contracts-countries"]);
    expect(qk.settings.contracts.list("c1", 1)).toEqual(["settings-contracts", "c1", 1]);
    expect(qk.settings.contracts.devCo("c1", 1)).toEqual(["settings-contract-devco", "c1", 1]);
    expect(qk.settings.contracts.record("r1")).toEqual(["settings-contract", "r1"]);
  });
});

describe("qk.standards and qk.currentUser — the existing literals, unchanged", () => {
  it("UT-KEY-010 project-side prefixes match useCostBook.ts / features/contracts", () => {
    expect(qk.standards).toEqual({
      capexStandardAssumptions: ["capex-standard-assumptions"],
      landLeaseAssumptions: ["land-lease-assumptions"],
      opexAssumptionScopes: ["opex-assumption-scopes"],
      capexMilestoneDurations: ["capex-milestone-durations"],
      bopStandardAssumptionsAll: ["bopStandardAssumptions"],
      costBook: ["cost-book"],
      capexTotals: ["capex-totals"],
      addCostSheet: ["add-cost-sheet"],
    });
    expect(qk.bopStandardAssumptions("c1", 2).slice(0, 1)).toEqual(qk.standards.bopStandardAssumptionsAll);
  });

  it("UT-KEY-011 current user", () => {
    expect(qk.currentUser("oid")).toEqual(["current-user", "oid"]);
    expect(qk.currentUser(undefined)).toEqual(["current-user", ""]);
  });
});
