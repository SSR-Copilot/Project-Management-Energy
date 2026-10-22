// @vitest-environment jsdom
/**
 * The Contracts writes invalidate through the shared `invalidateAfterContractsWrite`,
 * so a standard-contract save or delete also refreshes the PROJECT Contracts margin seed
 * (`qk.bopStandardAssumptions(c, t)`, every contract type below it) besides the
 * screen's own list / DevCo keys. A failed save still invalidates (the parent may be written).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@microsoft/power-apps/data", () => ({ getClient: () => ({}) }));

const api = vi.hoisted(() => ({
  saveStandardContract: vi.fn(),
  deleteStandardContract: vi.fn(),
}));

vi.mock("@/data/adminContract", async () => {
  const actual = await vi.importActual<typeof import("@/data/adminContract")>("@/data/adminContract");
  return { ...actual, saveStandardContract: api.saveStandardContract, deleteStandardContract: api.deleteStandardContract };
});

import { qk } from "@/data/keys";
import type { SaveContractInput } from "@/data/adminContract";
import { useDeleteContract, useSaveContract } from "./hooks";
import { CONTRACT_TYPE, TECHNOLOGY, initialForm } from "./rules";
import { GERMANY_ID } from "./fixtures";

const SCOPE = { countryId: GERMANY_ID, technology: TECHNOLOGY.Wind };

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  // Seed the caches a save must refresh, including the project-side margin seed per contract type.
  const seed = [...qk.bopStandardAssumptions(SCOPE.countryId, SCOPE.technology), CONTRACT_TYPE.Development];
  const otherScope = [...qk.bopStandardAssumptions(SCOPE.countryId, TECHNOLOGY.PV), CONTRACT_TYPE.Development];
  client.setQueryData(seed, { margin: 1 });
  client.setQueryData(otherScope, { margin: 2 });
  client.setQueryData(qk.adminContractList(SCOPE.countryId, SCOPE.technology), []);
  client.setQueryData(qk.adminContractDevCo(SCOPE.countryId, SCOPE.technology), []);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const stale = (key: readonly unknown[]) => client.getQueryState(key)?.isInvalidated === true;
  return { client, wrapper, seed, otherScope, stale };
}

const input: SaveContractInput = {
  contractType: CONTRACT_TYPE.Development, ...SCOPE, lang: "en-US", accounts: new Map(),
  form: initialForm(undefined, ["l3-a"], "en-US"),
};

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Contracts settings hooks — shared invalidation", () => {
  it("UT-ADCONTR-801 a standard-contract save refreshes the project margin seed of its scope and the screen keys", async () => {
    api.saveStandardContract.mockResolvedValue({ contractId: "c-1" });
    const { wrapper, seed, otherScope, stale } = setup();
    const { result } = renderHook(() => useSaveContract(), { wrapper });
    await act(async () => { await result.current.mutateAsync(input); });
    expect(stale(seed)).toBe(true);
    expect(stale(qk.adminContractList(SCOPE.countryId, SCOPE.technology))).toBe(true);
    expect(stale(qk.adminContractDevCo(SCOPE.countryId, SCOPE.technology))).toBe(true);
    expect(stale(otherScope)).toBe(false);
  });

  it("UT-ADCONTR-802 a failed save still invalidates (the parent may already be written)", async () => {
    api.saveStandardContract.mockRejectedValue(new Error("additions failed"));
    const { wrapper, seed, stale } = setup();
    const { result } = renderHook(() => useSaveContract(), { wrapper });
    await act(async () => { await result.current.mutateAsync(input).catch(() => undefined); });
    expect(stale(seed)).toBe(true);
  });

  it("UT-ADCONTR-803 a delete refreshes the project margin seed too", async () => {
    api.deleteStandardContract.mockResolvedValue({ alreadyDeleted: false });
    const { wrapper, seed, stale } = setup();
    const { result } = renderHook(() => useDeleteContract(), { wrapper });
    await act(async () => { await result.current.mutateAsync({ id: "c-1", selection: SCOPE }); });
    expect(stale(seed)).toBe(true);
  });
});
