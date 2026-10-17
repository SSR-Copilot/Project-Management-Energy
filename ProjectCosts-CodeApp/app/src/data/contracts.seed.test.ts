/**
 * `findBopStandardAssumption` — which standard contract seeds a new project contract's margin
 * (open decision D-14; contracts settings audit B-8). The rule, until D-14 is decided: active rows
 * only, the oldest by `createdon` then id, one row in one request.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: { label: string; options: Record<string, unknown> }[] = [];
let rows: unknown[] = [];

vi.mock("./client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./client")>()),
  fetchPage: async (label: string, _page: unknown, options: Record<string, unknown>) => {
    calls.push({ label, options });
    return rows;
  },
  fetchAll: async () => {
    throw new Error("findBopStandardAssumption must read one page, not walk every row");
  },
}));

import { BOP_STANDARD_SEED_ORDER, findBopStandardAssumption } from "./contracts";
import { CONTRACT_TYPE } from "@/features/contracts/rules";

const DE = "9f5aade5-2b7c-ef11-ac20-000d3a466ab7";
const WIND = 952850000;

beforeEach(() => { calls.length = 0; rows = []; });

describe("findBopStandardAssumption", () => {
  it("UT-CS-001 reads one active row, oldest first, for the country, technology and type", async () => {
    rows = [{ vsb_bopcontractsstandardassumptionsid: "oldest", vsb_margin: true }];
    const seed = await findBopStandardAssumption({ countryId: DE, technology: WIND, contractType: CONTRACT_TYPE.Development });
    expect(seed?.vsb_bopcontractsstandardassumptionsid).toBe("oldest");
    expect(calls).toHaveLength(1);
    const { options } = calls[0]!;
    expect(options.orderBy).toEqual([...BOP_STANDARD_SEED_ORDER]);
    expect(BOP_STANDARD_SEED_ORDER).toEqual(["createdon asc", "vsb_bopcontractsstandardassumptionsid asc"]);
    expect(options.maxPageSize).toBe(1);
    expect(options.filter).toContain(`_vsb_country_value eq ${DE}`);
    expect(options.filter).toContain(`vsb_technology eq ${WIND}`);
    expect(options.filter).toContain(`vsb_contracttypes eq ${CONTRACT_TYPE.Development}`);
    expect(options.filter).toContain("statecode eq 0");
  });

  it("UT-CS-002 asks nothing without a country or technology, and is undefined when nothing matches", async () => {
    await expect(findBopStandardAssumption({ countryId: undefined, technology: WIND, contractType: CONTRACT_TYPE.Development })).resolves.toBeUndefined();
    expect(calls).toHaveLength(0);
    await expect(findBopStandardAssumption({ countryId: DE, technology: WIND, contractType: CONTRACT_TYPE.Construction })).resolves.toBeUndefined();
  });
});
