/**
 * The Revenue screen's two read trims (D136): the currency lookup asks the server for one ISO code, and the
 * project load takes its project states from a caller-supplied (cached) read. Both keep their old behaviour when the
 * new argument is absent, because the Milestones screen calls `findCurrency` without it.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  fetchAll: vi.fn(),
  fetchPage: vi.fn(),
  loadCurrencies: vi.fn(),
  listProjectStates: vi.fn(),
}));

vi.mock("./client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./client")>()),
  fetchAll: m.fetchAll, fetchPage: m.fetchPage,
}));
// BND-03/04/06 (T-E01/T-E02): `findCurrency` now lives in `./revenueLookups` and reads the whole table through `./currencies` (the same read
// `landLease.loadCurrencies` wraps); the project states come from `./projectStatesRead`.
vi.mock("./currencies", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./currencies")>()), loadAllCurrencies: m.loadCurrencies,
}));
vi.mock("./projectStatesRead", () => ({ listProjectStates: m.listProjectStates }));
vi.mock("./milestones", () => ({ listRevenueAssumptions: vi.fn() }));

import { PROJECT_COL } from "@/features/pm/revenues/rules";
import { loadRevenueProject } from "./revenues";
import { findCurrency } from "./revenueLookups";

const TABLE = [
  { id: "cur-1", name: "Euro", code: "EUR" },
  { id: "cur-2", name: "Zloty", code: "PLN" },
  { id: "cur-3", name: "Euro (second row)", code: "EUR" },
];
const asRows = (rows: typeof TABLE) => rows.map((r) => ({
  transactioncurrencyid: r.id, currencyname: r.name, isocurrencycode: r.code,
}));

beforeEach(() => {
  m.fetchAll.mockReset(); m.fetchPage.mockReset(); m.loadCurrencies.mockReset(); m.listProjectStates.mockReset();
  m.loadCurrencies.mockResolvedValue(TABLE);
});

describe("UT-REVPERF findCurrency", () => {
  it("UT-REVPERF-040 onlyThisCode: one filtered read of three columns, and the whole table is never loaded", async () => {
    m.fetchAll.mockResolvedValueOnce(asRows([TABLE[0]!, TABLE[2]!]));
    const c = await findCurrency("EUR", { onlyThisCode: true });
    expect(c).toEqual({ id: "cur-1", name: "Euro" });
    expect(m.fetchAll).toHaveBeenCalledTimes(1);
    const options = m.fetchAll.mock.calls[0]![2] as Record<string, unknown>;
    expect(options["filter"]).toBe("isocurrencycode eq 'EUR'");
    expect(options["select"]).toEqual(["transactioncurrencyid", "currencyname", "isocurrencycode"]);
    expect(m.loadCurrencies).not.toHaveBeenCalled();
  });

  it("UT-REVPERF-041 EQUIVALENCE: with two rows for one code, the filtered read finds the same row as the whole-table read", async () => {
    const whole = await findCurrency("EUR");
    m.fetchAll.mockResolvedValueOnce(asRows(TABLE.filter((r) => r.code === "EUR")));
    const filtered = await findCurrency("EUR", { onlyThisCode: true });
    expect(filtered).toEqual(whole);
    expect(whole).toEqual({ id: "cur-1", name: "Euro" });
  });

  it("UT-REVPERF-042 without the option nothing changes: the shared whole-table loader, no filtered read (Milestones)", async () => {
    expect(await findCurrency("PLN")).toEqual({ id: "cur-2", name: "Zloty" });
    expect(m.loadCurrencies).toHaveBeenCalledTimes(1);
    expect(m.fetchAll).not.toHaveBeenCalled();
  });

  it("UT-REVPERF-043 no row for the code is null in both forms; the code is still compared exactly (case-sensitive, as before)", async () => {
    expect(await findCurrency("USD")).toBeNull();
    m.fetchAll.mockResolvedValueOnce([]);
    expect(await findCurrency("USD", { onlyThisCode: true })).toBeNull();
    m.fetchAll.mockResolvedValueOnce(asRows([{ id: "cur-9", name: "euro", code: "eur" }]));
    expect(await findCurrency("EUR", { onlyThisCode: true })).toBeNull();
  });

  it("UT-REVPERF-044 a failed read is not swallowed (CONVENTIONS rule 3)", async () => {
    m.fetchAll.mockRejectedValueOnce(new Error("403"));
    await expect(findCurrency("EUR", { onlyThisCode: true })).rejects.toThrow("403");
  });
});

const PID = "11111111-1111-1111-1111-111111111111";

describe("UT-REVPERF loadRevenueProject", () => {
  const row = { [PROJECT_COL.id]: "p1", [PROJECT_COL.projectName]: "Parc", [PROJECT_COL.clusterState]: "cs-4" };

  it("UT-REVPERF-050 with an injected states read, the table is not read again and the cluster Order comes from it", async () => {
    m.fetchPage.mockResolvedValueOnce([row]);
    const readStates = vi.fn(async () => [{ id: "cs-3", order: 3 }, { id: "cs-4", order: 4 }]);
    const p = await loadRevenueProject(PID, readStates);
    expect(p?.clusterStateOrder).toBe(4);
    expect(readStates).toHaveBeenCalledTimes(1);
    expect(m.listProjectStates).not.toHaveBeenCalled();
  });

  it("UT-REVPERF-051 without it, the states are read directly as before", async () => {
    m.fetchPage.mockResolvedValueOnce([row]);
    m.listProjectStates.mockResolvedValueOnce([{ id: "cs-4", order: 4 }]);
    expect((await loadRevenueProject(PID))?.clusterStateOrder).toBe(4);
    expect(m.listProjectStates).toHaveBeenCalledTimes(1);
  });

  it("UT-REVPERF-052 the project row and the states are read in parallel, not one after the other", async () => {
    let release: (v: { id: string; order: number }[]) => void = () => undefined;
    const states = new Promise<{ id: string; order: number }[]>((r) => { release = r; });
    m.fetchPage.mockResolvedValueOnce([row]);
    const pending = loadRevenueProject(PID, () => states);
    await Promise.resolve();
    expect(m.fetchPage).toHaveBeenCalledTimes(1); // started while the states are still pending
    release([{ id: "cs-4", order: 4 }]);
    expect((await pending)?.clusterStateOrder).toBe(4);
  });

  it("UT-REVPERF-053 a project that is not found is null, and a failed states read fails the load (as before)", async () => {
    m.fetchPage.mockResolvedValueOnce([]);
    expect(await loadRevenueProject(PID, async () => [])).toBeNull();
    m.fetchPage.mockResolvedValueOnce([row]);
    await expect(loadRevenueProject(PID, async () => { throw new Error("states 500"); })).rejects.toThrow("states 500");
  });
});
