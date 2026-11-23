// @vitest-environment jsdom
/**
 * UT-CONTR-170..174 — the real save and delete hooks against a mocked repository (not a mock of `./hooks`).
 *
 * A save that fails AFTER the contract row landed (its DevCo links did not) has still changed Dataverse: the list
 * must be refetched and the error must carry the saved id, so Save is retried as an update, not as a second create.
 */
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DataError } from "@/platform/errors";
import { ContractLinksError, type ContractWrite } from "@/data/contracts";
import { CONTRACT_TYPE } from "./rules";

const repo = {
  saveContract: vi.fn(),
  replaceDevCoLinks: vi.fn(),
  deleteContract: vi.fn(),
  savePaymentTarget: vi.fn(),
  deletePaymentTarget: vi.fn(),
};
vi.mock("@/data/costRepository", () => ({ costRepository: () => repo }));

import { useDeleteContract, useDeletePaymentTarget, useSaveContract } from "./hooks";

const PROJECT = "11111111-1111-1111-1111-111111111111";
const write = (over: Partial<ContractWrite> = {}) =>
  ({ projectId: PROJECT, contractType: CONTRACT_TYPE.Development, ...over }) as ContractWrite;

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { wrapper, invalidate };
}

beforeEach(() => {
  Object.values(repo).forEach((fn) => fn.mockReset());
});

describe("useSaveContract", () => {
  it("UT-CONTR-170 links failing after the contract landed rejects with the saved id and refreshes the lists", async () => {
    repo.saveContract.mockResolvedValue({ id: "c-new" });
    repo.replaceDevCoLinks.mockRejectedValue(new DataError("create DevCo cost link", "boom", 500));
    const { wrapper, invalidate } = setup();
    const { result } = renderHook(() => useSaveContract(PROJECT), { wrapper });
    let caught: unknown;
    await act(async () => {
      await result.current.mutateAsync({ write: write(), accounts: [] }).catch((e) => { caught = e; });
    });
    expect(caught).toBeInstanceOf(ContractLinksError);
    expect((caught as ContractLinksError).contractId).toBe("c-new");
    // B2 (OPT-12): the two caches a save can change (contracts, DevCo links) were invalidated although the save failed; the
    // payment targets were not (it was three before: a save never writes or removes a payment target).
    expect(invalidate).toHaveBeenCalledTimes(2);
    expect(invalidate.mock.calls.map(([f]) => f?.queryKey?.[0]).sort()).toEqual(["contracts", "devCoLinks"]);
  });

  it("UT-CONTR-171 a failed contract write also refreshes the lists, and never touches the links", async () => {
    repo.saveContract.mockRejectedValue(new DataError("create BoP contract", "boom", 500));
    const { wrapper, invalidate } = setup();
    const { result } = renderHook(() => useSaveContract(PROJECT), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ write: write(), accounts: [] }).catch(() => undefined);
    });
    expect(repo.replaceDevCoLinks).not.toHaveBeenCalled();
    // B2 (OPT-12): 3 before; no payment-target refetch after a save.
    expect(invalidate).toHaveBeenCalledTimes(2);
  });

  it("UT-CONTR-172 a Project Rights contract writes no links (canvas :3744-3801), a Development one passes the id and mode", async () => {
    repo.saveContract.mockResolvedValue({ id: "c-1" });
    repo.replaceDevCoLinks.mockResolvedValue(undefined);
    const { wrapper } = setup();
    const { result } = renderHook(() => useSaveContract(PROJECT), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ write: write({ contractType: CONTRACT_TYPE.ProjectRights }), accounts: [] });
    });
    expect(repo.replaceDevCoLinks).not.toHaveBeenCalled();
    await act(async () => {
      await result.current.mutateAsync({ write: write({ id: "c-1" }), accounts: [{ id: "a1", name: "n" }] });
    });
    expect(repo.replaceDevCoLinks).toHaveBeenCalledWith(PROJECT, {
      contractId: "c-1", isNewContract: false, owningBusinessUnitId: undefined, accounts: [{ id: "a1", name: "n" }],
    });
  });
});

describe("the delete hooks", () => {
  it("UT-CONTR-173 a failed contract delete still refreshes the lists", async () => {
    repo.deleteContract.mockRejectedValue(new DataError("delete BoP contract", "denied", 403));
    const { wrapper, invalidate } = setup();
    const { result } = renderHook(() => useDeleteContract(PROJECT), { wrapper });
    await act(async () => { await result.current.mutateAsync("c-1").catch(() => undefined); });
    // A DELETE still refreshes all three: the contract's payment targets go with it (OPT-12 changes the save only).
    expect(invalidate).toHaveBeenCalledTimes(3);
    expect(invalidate.mock.calls.map(([f]) => f?.queryKey?.[0]).sort()).toEqual(["contracts", "devCoLinks", "paymentTargets"]);
  });

  it("UT-CONTR-174 a failed payment-target delete refreshes the payment targets", async () => {
    repo.deletePaymentTarget.mockRejectedValue(new DataError("delete payment target", "denied", 403));
    const { wrapper, invalidate } = setup();
    const { result } = renderHook(() => useDeletePaymentTarget(PROJECT), { wrapper });
    await act(async () => { await result.current.mutateAsync("t-1").catch(() => undefined); });
    expect(invalidate).toHaveBeenCalledTimes(1);
  });
});
