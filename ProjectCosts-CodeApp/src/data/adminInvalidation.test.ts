import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient, type QueryKey } from "@tanstack/react-query";
import { qk } from "@/data/keys";
import { ADMIN_OPT } from "./adminFlags";
import {
  capexAccountsWriteKeys, checklistsWriteKeys, contractsWriteKeys, costsWriteKeys, gatesWriteKeys,
  invalidateAfterCapexAccountsWrite, invalidateAfterChecklistsWrite, invalidateAfterContractsWrite,
  invalidateAfterCostsWrite, invalidateAfterGatesWrite, invalidateAfterMilestonesWrite,
  milestonesWriteKeys,
} from "./adminInvalidation";

const DE = "9f5aade5-2b7c-ef11-ac20-000d3a466ab7";
const WIND = 952850000;
const PV = 952850001;
const scope = { countryId: DE, technology: WIND };

let client: QueryClient;
afterEach(() => client?.clear());

function spyClient() {
  client = new QueryClient();
  const spy = vi.spyOn(client, "invalidateQueries");
  const keys = () => spy.mock.calls.map(([filters]) => (filters as { queryKey: QueryKey }).queryKey);
  return { spy, keys };
}

/** Seeds a query under `key` and reports whether a helper marked it stale. */
function seeded(keys: QueryKey[]) {
  client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  for (const key of keys) client.setQueryData(key, { seeded: true });
  return (key: QueryKey) => client.getQueryState(key)?.isInvalidated ?? false;
}

describe("Settings invalidation helpers — exact key sets", () => {
  it.each([
    ["CAPEX accounts", () => invalidateAfterCapexAccountsWrite(client), [
      ["adminCapexAccounts", "tree"], ["capexAccounts"], ["adminCostHierarchy"],
      ["cost-book"], ["capex-totals"], ["add-cost-sheet"],
      ["devCoCapexCosts"], ["devCoCapexContracts"],
    ]],
    ["Milestones", () => invalidateAfterMilestonesWrite(client), [
      ["adminMilestoneAssumptions"], ["capex-milestone-durations"],
      // master: the PM Milestones / General Data reads of the same table.
      ["milestoneAssumptions"], ["milestoneDurations"],
    ]],
    ["Costs devex (scoped)", () => invalidateAfterCostsWrite(client, "devex", scope), [
      ["adminCostDevex", DE, WIND], ["capex-standard-assumptions"],
    ]],
    ["Costs devex (all scopes)", () => invalidateAfterCostsWrite(client, "devex"), [
      ["adminCostDevex"], ["capex-standard-assumptions"],
    ]],
    ["Costs opex (scoped)", () => invalidateAfterCostsWrite(client, "opex", scope), [
      ["adminCostOpex", DE, WIND], ["land-lease-assumptions"], ["opex-assumption-scopes"],
    ]],
    ["Contracts (scoped)", () => invalidateAfterContractsWrite(client, scope), [
      ["adminContractList", DE, WIND], ["adminContractDevCo", DE, WIND], ["adminContractRecord"],
      ["bopStandardAssumptions", DE, WIND],
    ]],
    ["Contracts (all scopes)", () => invalidateAfterContractsWrite(client), [
      ["adminContractList"], ["adminContractDevCo"], ["adminContractRecord"], ["bopStandardAssumptions"],
    ]],
    ["Project Gates (scoped)", () => invalidateAfterGatesWrite(client, scope), [
      ["adminGateDataset", DE, WIND], ["adminChecklistLocks"],
    ]],
    ["Project Gates (all)", () => invalidateAfterGatesWrite(client), [
      ["adminGateDataset"], ["adminChecklistLocks"],
    ]],
    ["Checklists (one tab)", () => invalidateAfterChecklistsWrite(client, "tab-1"), [
      ["adminChecklistTasks", "tab-1"], ["adminGateDataset"],
    ]],
    ["Checklists (all tabs)", () => invalidateAfterChecklistsWrite(client), [
      ["adminChecklistTasks"], ["adminGateDataset"],
    ]],
  ] as const)("UT-INV-001 %s", async (_name, run, expected) => {
    const { keys } = spyClient();
    await run();
    expect(keys()).toEqual(expected);
  });

  it("UT-INV-002 the exported key lists match what the helpers invalidate", () => {
    expect(capexAccountsWriteKeys()).toHaveLength(8);
    expect(milestonesWriteKeys()).toHaveLength(4);
    expect(costsWriteKeys("opex")).toEqual([
      ["adminCostOpex"], ["land-lease-assumptions"], ["opex-assumption-scopes"],
    ]);
    expect(contractsWriteKeys(scope)[3]).toEqual(["bopStandardAssumptions", DE, WIND]);
    expect(gatesWriteKeys()[0]).toEqual(["adminGateDataset"]);
    expect(checklistsWriteKeys(null)[0]).toEqual(["adminChecklistTasks", ""]);
  });

  it("UT-INV-003 a refetch failure does not reject the helper (the write already landed)", async () => {
    const { spy } = spyClient();
    spy.mockRejectedValueOnce(new Error("refetch failed"));
    await expect(invalidateAfterMilestonesWrite(client)).resolves.toBeUndefined();
  });
});

describe("Settings invalidation helpers — the cross-screen consumers' real keys", () => {
  it("UT-INV-B1 a standard-contract save refreshes the project Contracts margin seed", async () => {
    // `useBopStandardAssumption` appends the contract type to `qk.bopStandardAssumptions(c, t)`.
    const devSeed = ["bopStandardAssumptions", DE, WIND, 1];
    const conSeed = ["bopStandardAssumptions", DE, WIND, 2];
    const otherScope = ["bopStandardAssumptions", DE, PV, 1];
    const stale = seeded([devSeed, conSeed, otherScope]);
    await invalidateAfterContractsWrite(client, scope);
    expect(stale(devSeed)).toBe(true);
    expect(stale(conSeed)).toBe(true);
    expect(stale(otherScope)).toBe(false);
  });

  it("UT-INV-B2 a CAPEX account write refreshes the Costs settings account hierarchy", async () => {
    const hierarchy = ["adminCostHierarchy"];
    const tree = ["adminCapexAccounts", "tree"];
    const book = ["cost-book", "project-1", 3];
    const totals = ["capex-totals", "project-1"];
    const unrelated = ["adminCostCurrencies"];
    const stale = seeded([hierarchy, tree, book, totals, unrelated]);
    await invalidateAfterCapexAccountsWrite(client);
    expect(stale(hierarchy)).toBe(true);
    expect(stale(tree)).toBe(true);
    expect(stale(book)).toBe(true);
    expect(stale(totals)).toBe(true);
    expect(stale(unrelated)).toBe(false);
  });

  it("UT-INV-B5 a CAPEX account write refreshes the project Contracts DevCo CAPEX rows", async () => {
    const costs = [...qk.devCoCapexCosts("project-1")];
    const contracts = [...qk.devCoCapexContracts("project-1")];
    const stale = seeded([costs, contracts]);
    await invalidateAfterCapexAccountsWrite(client);
    expect(stale(costs)).toBe(true);
    expect(stale(contracts)).toBe(true);
  });

  it("UT-INV-B3 a gate-approval write refreshes Check List Settings' locks", async () => {
    const locks = ["adminChecklistLocks"];
    const dataset = ["adminGateDataset", DE, WIND];
    const stale = seeded([locks, dataset]);
    await invalidateAfterGatesWrite(client, scope);
    expect(stale(locks)).toBe(true);
    expect(stale(dataset)).toBe(true);
  });

  it("UT-INV-B4 a milestone save refreshes every cached cluster timeline", async () => {
    const de = ["capex-milestone-durations", DE, WIND];
    const fr = ["capex-milestone-durations", "fr", PV];
    const stale = seeded([de, fr]);
    await invalidateAfterMilestonesWrite(client);
    expect(stale(de)).toBe(true);
    expect(stale(fr)).toBe(true);
  });
});

/* ═════════ dvopt AD-11: the two plug-in cascading deletes also mark the project caches stale ═════════ */

describe("AD-11 cascading deletes", () => {
  afterEach(() => { ADMIN_OPT.ADMIN_CASCADE_INVALIDATE = true; });

  it("UT-INV-D1 deleting a standard DEVEX cost also marks the project cost book, totals, Add-Costs sheet and DevCo CAPEX caches stale", async () => {
    const book = ["cost-book", "project-1", 3];
    const totals = ["capex-totals", "project-1"];
    const sheet = ["add-cost-sheet", "project-1"];
    const costs = [...qk.devCoCapexCosts("project-1")];
    const contracts = [...qk.devCoCapexContracts("project-1")];
    const unrelated = ["adminCostCurrencies"];
    const stale = seeded([book, totals, sheet, costs, contracts, unrelated]);
    await invalidateAfterCostsWrite(client, "devex", scope, { cascade: true });
    for (const key of [book, totals, sheet, costs, contracts]) expect(stale(key)).toBe(true);
    expect(stale(unrelated)).toBe(false);
  });

  it("UT-INV-D2 a DEVEX save (no cascade) and every OPEX write keep their key lists exactly", () => {
    expect(costsWriteKeys("devex", scope)).toEqual([["adminCostDevex", DE, WIND], ["capex-standard-assumptions"]]);
    expect(costsWriteKeys("devex", scope, { cascade: false })).toEqual(costsWriteKeys("devex", scope));
    expect(costsWriteKeys("opex", scope, { cascade: true })).toEqual(costsWriteKeys("opex", scope));
  });

  it("UT-INV-D3 deleting a standard BoP contract also marks the project contracts, payment targets and DevCo links stale", async () => {
    const contracts = [...qk.contracts("project-1")];
    const targets = [...qk.paymentTargets("project-1")];
    const links = [...qk.devCoLinks("project-1")];
    const unrelated = ["adminCostCurrencies"];
    const stale = seeded([contracts, targets, links, unrelated]);
    await invalidateAfterContractsWrite(client, scope, { cascade: true });
    for (const key of [contracts, targets, links]) expect(stale(key)).toBe(true);
    expect(stale(unrelated)).toBe(false);
  });

  it("UT-INV-D4 a contract save keeps its four keys; the all-scopes delete adds the same three prefixes", () => {
    expect(contractsWriteKeys(scope)).toHaveLength(4);
    expect(contractsWriteKeys(undefined, { cascade: true })).toEqual([
      ["adminContractList"], ["adminContractDevCo"], ["adminContractRecord"], ["bopStandardAssumptions"],
      ["contracts"], ["paymentTargets"], ["devCoLinks"],
    ]);
  });

  it("UT-INV-D5 with ADMIN_CASCADE_INVALIDATE off the delete invalidates only what it did before", () => {
    ADMIN_OPT.ADMIN_CASCADE_INVALIDATE = false;
    expect(costsWriteKeys("devex", scope, { cascade: true })).toEqual(costsWriteKeys("devex", scope));
    expect(contractsWriteKeys(scope, { cascade: true })).toEqual(contractsWriteKeys(scope));
  });
});
