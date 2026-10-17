import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient, type QueryKey } from "@tanstack/react-query";
import { qk } from "@/data/keys";
import {
  capexAccountsWriteKeys, checklistsWriteKeys, contractsWriteKeys, costsWriteKeys, gatesWriteKeys,
  invalidateAfterCapexAccountsWrite, invalidateAfterChecklistsWrite, invalidateAfterContractsWrite,
  invalidateAfterCostsWrite, invalidateAfterGatesWrite, invalidateAfterMilestonesWrite,
  milestonesWriteKeys,
} from "./invalidation";

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

describe("settings invalidation helpers — exact key sets", () => {
  it.each([
    ["CAPEX accounts", () => invalidateAfterCapexAccountsWrite(client), [
      ["settings", "capex-accounts"], ["capexAccounts"], ["settings-costs", "capex-hierarchy"],
      ["cost-book"], ["capex-totals"], ["add-cost-sheet"],
      ["devCoCapexCosts"], ["devCoCapexContracts"],
    ]],
    ["Milestones", () => invalidateAfterMilestonesWrite(client), [
      ["milestoneStandardAssumptions"], ["capex-milestone-durations"],
    ]],
    ["Costs devex (scoped)", () => invalidateAfterCostsWrite(client, "devex", scope), [
      ["settings-costs", "devex", DE, WIND], ["capex-standard-assumptions"],
    ]],
    ["Costs devex (all scopes)", () => invalidateAfterCostsWrite(client, "devex"), [
      ["settings-costs", "devex"], ["capex-standard-assumptions"],
    ]],
    ["Costs opex (scoped)", () => invalidateAfterCostsWrite(client, "opex", scope), [
      ["settings-costs", "opex", DE, WIND], ["land-lease-assumptions"], ["opex-assumption-scopes"],
    ]],
    ["Contracts (scoped)", () => invalidateAfterContractsWrite(client, scope), [
      ["settings-contracts", DE, WIND], ["settings-contract-devco", DE, WIND], ["settings-contract"],
      ["bopStandardAssumptions", DE, WIND],
    ]],
    ["Contracts (all scopes)", () => invalidateAfterContractsWrite(client), [
      ["settings-contracts"], ["settings-contract-devco"], ["settings-contract"], ["bopStandardAssumptions"],
    ]],
    ["Project Gates (scoped)", () => invalidateAfterGatesWrite(client, scope), [
      ["projectGates", DE, WIND], ["settings", "checklist-settings", "locks"],
    ]],
    ["Project Gates (all)", () => invalidateAfterGatesWrite(client), [
      ["projectGates"], ["settings", "checklist-settings", "locks"],
    ]],
    ["Checklists (one tab)", () => invalidateAfterChecklistsWrite(client, "tab-1"), [
      ["settings", "checklist-settings", "tasks", "tab-1"], ["projectGates"],
    ]],
    ["Checklists (all tabs)", () => invalidateAfterChecklistsWrite(client), [
      ["settings", "checklist-settings", "tasks"], ["projectGates"],
    ]],
  ] as const)("UT-INV %s", async (_name, run, expected) => {
    const { keys } = spyClient();
    await run();
    expect(keys()).toEqual(expected);
  });

  it("UT-INV the exported key lists match what the helpers invalidate", () => {
    expect(capexAccountsWriteKeys()).toHaveLength(8);
    expect(milestonesWriteKeys()).toHaveLength(2);
    expect(costsWriteKeys("opex")).toEqual([
      ["settings-costs", "opex"], ["land-lease-assumptions"], ["opex-assumption-scopes"],
    ]);
    expect(contractsWriteKeys(scope)[3]).toEqual(["bopStandardAssumptions", DE, WIND]);
    expect(gatesWriteKeys()[0]).toEqual(["projectGates"]);
    expect(checklistsWriteKeys(null)[0]).toEqual(["settings", "checklist-settings", "tasks", ""]);
  });

  it("UT-INV a refetch failure does not reject the helper (the write already landed)", async () => {
    const { spy } = spyClient();
    spy.mockRejectedValueOnce(new Error("refetch failed"));
    await expect(invalidateAfterMilestonesWrite(client)).resolves.toBeUndefined();
  });
});

describe("settings invalidation helpers — the cross-screen consumers' real keys", () => {
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
    const hierarchy = ["settings-costs", "capex-hierarchy"];
    const tree = ["settings", "capex-accounts", "tree"];
    const book = ["cost-book", "project-1", 3];
    const totals = ["capex-totals", "project-1"];
    const unrelated = ["settings-costs", "countries"];
    const stale = seeded([hierarchy, tree, book, totals, unrelated]);
    await invalidateAfterCapexAccountsWrite(client);
    expect(stale(hierarchy)).toBe(true);
    expect(stale(tree)).toBe(true);
    expect(stale(book)).toBe(true);
    expect(stale(totals)).toBe(true);
    expect(stale(unrelated)).toBe(false);
  });

  it("UT-INV-B5 (NG-1) a CAPEX account write refreshes the project Contracts DevCo CAPEX rows", async () => {
    const costs = [...qk.devCoCapexCosts("project-1")];
    const contracts = [...qk.devCoCapexContracts("project-1")];
    const stale = seeded([costs, contracts]);
    await invalidateAfterCapexAccountsWrite(client);
    expect(stale(costs)).toBe(true);
    expect(stale(contracts)).toBe(true);
  });

  it("UT-INV-B3 a gate-approval write refreshes Check List Settings' locks", async () => {
    const locks = ["settings", "checklist-settings", "locks"];
    const dataset = ["projectGates", DE, WIND];
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
