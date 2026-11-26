// @vitest-environment jsdom
/**
 * CA-03 (dvopt T-06): the Add Cost from Table Save holds the tab (`beforeunload`) for the whole life of its deferred deletes and
 * reconcile (`result.background`), through the pending-delete registry, with `BACKGROUND_SAVE` still off. It is given back whether
 * the background succeeds or fails, and a Save with nothing deferred never takes it.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const invalidateQueries = vi.fn(async () => undefined);
vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: unknown) => options,
  useMutation: (options: unknown) => options,
  useQueryClient: () => ({ invalidateQueries, setQueryData: vi.fn(), cancelQueries: vi.fn(async () => undefined) }),
}));
vi.mock("@/data/costRepository", () => ({ costRepository: () => ({}) }));
vi.mock("@/app/SessionContext", () => ({ useSession: () => ({ projectId: "p-1", project: null }) }));
vi.mock("@/components/useNotify", () => ({
  useNotify: () => ({ success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn(), dismissAll: vi.fn() }),
}));

const { useSaveAddCostSheet } = await import("./useCostBook");
const { BACKGROUND_SAVE } = await import("./backgroundSave");
const { pendingDeletes } = await import("@/data/pendingDeletes");

type Outcome = { requests: number };
const deferred = () => {
  let resolve: (o: Outcome) => void = () => undefined;
  let reject: (e: unknown) => void = () => undefined;
  const promise = new Promise<Outcome>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};
const flush = () => new Promise((r) => setTimeout(r, 0));
type Options = { onSuccess: (r?: unknown) => unknown };
const prompts = () => {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
};

afterEach(() => vi.clearAllMocks());

describe("the Add Cost from Table Save holds the tab while its deferred deletes run", () => {
  it("UT-CA03-020 BACKGROUND_SAVE is still off: this hold is the registry's, not WS-F's", () => {
    expect(BACKGROUND_SAVE).toBe(false);
  });

  it("UT-CA03-021 the tab prompts from the Save's resolution until the deferred deletes settle, then not", async () => {
    const bg = deferred();
    expect(prompts()).toBe(false);
    (useSaveAddCostSheet(3) as unknown as Options).onSuccess({ background: bg.promise, deferredContractIds: ["c-1"], deferredCostIds: [], deferredContracts: 1 });
    expect(prompts()).toBe(true);
    await flush();
    expect(prompts()).toBe(true); // still running
    bg.resolve({ requests: 1 });
    await flush();
    expect(prompts()).toBe(false);
    expect(pendingDeletes.snapshot().contractIds.size).toBe(0);
  });

  it("UT-CA03-022 a failed background gives the hold back too", async () => {
    const bg = deferred();
    (useSaveAddCostSheet(3) as unknown as Options).onSuccess({ background: bg.promise, deferredContractIds: [], deferredCostIds: ["k-1"], deferredCosts: 1 });
    expect(prompts()).toBe(true);
    bg.reject(new Error("never rejects in practice, but the ids and the hold must still go"));
    await flush();
    expect(prompts()).toBe(false);
  });

  it("UT-CA03-023 a Save with nothing deferred (no background) never prompts", () => {
    (useSaveAddCostSheet(3) as unknown as Options).onSuccess({ applied: undefined });
    expect(prompts()).toBe(false);
    (useSaveAddCostSheet(3) as unknown as Options).onSuccess(undefined);
    expect(prompts()).toBe(false);
  });

  it("UT-CA03-024 two Saves in a row: the tab prompts until the second one settles", async () => {
    const a = deferred();
    const b = deferred();
    (useSaveAddCostSheet(3) as unknown as Options).onSuccess({ background: a.promise, deferredContractIds: ["c-1"], deferredCostIds: [] });
    (useSaveAddCostSheet(3) as unknown as Options).onSuccess({ background: b.promise, deferredContractIds: ["c-2"], deferredCostIds: [] });
    a.resolve({ requests: 1 });
    await flush();
    expect(prompts()).toBe(true);
    b.resolve({ requests: 1 });
    await flush();
    expect(prompts()).toBe(false);
  });
});
