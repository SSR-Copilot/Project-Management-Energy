/**
 * `useAddCostSheet` must never refetch behind an open sheet (D51 §3a): a refetch re-hydrates the
 * grid and clears the Screen's retry-id cache, so after a failed save a focus or reconnect refetch
 * would turn a safe "Save again" into a silent partial save.
 */
import { describe, expect, it, vi } from "vitest";

const useQuery = vi.fn((options: unknown) => options);
const invalidations: unknown[] = [];
/** Never settles: a Save that awaited it would hang. */
const invalidateQueries = vi.fn((filters: unknown) => {
  invalidations.push(filters);
  return new Promise<void>(() => {});
});

vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: unknown) => useQuery(options),
  useMutation: (options: unknown) => options,
  useQueryClient: () => ({ invalidateQueries }),
}));
vi.mock("@/app/SessionContext", () => ({ useSession: () => ({ projectId: "p-1", project: null }) }));
/** The app toaster, mocked: the hook dispatches into it through `useNotify`. */
const notifyError = vi.fn();
vi.mock("@/components/useNotify", () => ({
  useNotify: () => ({
    success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: notifyError, dismissAll: vi.fn(),
  }),
}));

const { useAddCostSheet, useSaveAddCostSheet } = await import("./useCostBook");
const {
  BACKGROUND_DELETE_FAILED, COST_DELETE_FAILED_RECONCILED, COST_DELETE_FAILED_NOT_RECONCILED,
} = await import("@/data/addCostSheet");
const { BulkDeleteError } = await import("@/data/bulkWrites");

type Outcome = {
  requests: number; error?: unknown; costDeleteError?: unknown; contractDeleteError?: unknown;
  reconciled?: boolean; reconcileError?: unknown;
};
type SaveOptions = {
  onSuccess: (result?: {
    background?: Promise<Outcome>; deferredContracts?: number; deferredCosts?: number;
  }) => unknown;
};
/** A background promise the test settles by hand. */
const deferred = () => {
  let resolve: (o: Outcome) => void = () => undefined;
  const promise = new Promise<Outcome>((r) => { resolve = r; });
  return { promise, resolve };
};
const flush = () => new Promise((r) => setTimeout(r, 0));
/** The CAPEX keys `invalidate` refreshes (the DEVEX/CAPEX grid, the totals, DevCo). */
const CAPEX_KEYS = [
  { queryKey: ["cost-book", "p-1", 3] },
  { queryKey: ["capex-totals", "p-1"] },
];

describe("useAddCostSheet", () => {
  it("UT-ACSHEET-QUERY-001 does not refetch on window focus or reconnect", () => {
    const options = useAddCostSheet(3) as unknown as Record<string, unknown>;
    expect(options.queryKey).toEqual(["add-cost-sheet", "p-1", 3]);
    expect(options.refetchOnWindowFocus).toBe(false);
    expect(options.refetchOnReconnect).toBe(false);
  });

  it("UT-ACSHEET-QUERY-002 the Save does not wait for the post-save reloads, and never refetches the sheet", () => {
    const options = useSaveAddCostSheet(3) as unknown as { onSuccess: () => unknown };
    // A returned promise is what made `mutateAsync` wait for every refetch before navigating.
    expect(options.onSuccess()).toBeUndefined();
    expect(invalidations).toContainEqual({ queryKey: ["add-cost-sheet", "p-1", 3], refetchType: "none" });
  });

  it("UT-ACSHEET-QUERY-003 when the deferred contract deletes settle, the CAPEX queries are invalidated again", async () => {
    invalidations.length = 0;
    notifyError.mockClear();
    const options = useSaveAddCostSheet(3) as unknown as SaveOptions;
    const bg = deferred();
    // Still fire-and-forget with a background attached.
    expect(options.onSuccess({ background: bg.promise, deferredContracts: 1 })).toBeUndefined();
    const once = invalidations.length;
    for (const key of CAPEX_KEYS) expect(invalidations).toContainEqual(key);
    await flush();
    expect(invalidations).toHaveLength(once); // nothing more until the deletes settle

    bg.resolve({ requests: 1 });
    await flush();
    expect(invalidations).toHaveLength(once * 2);
    for (const key of CAPEX_KEYS) {
      expect(invalidations.filter((i) => JSON.stringify(i) === JSON.stringify(key))).toHaveLength(2);
    }
    expect(notifyError).not.toHaveBeenCalled();
  });

  it("UT-ACSHEET-QUERY-004 a failed background delete shows the error toast, and still invalidates", async () => {
    invalidations.length = 0;
    notifyError.mockClear();
    const options = useSaveAddCostSheet(3) as unknown as SaveOptions;
    const bg = deferred();
    options.onSuccess({ background: bg.promise, deferredContracts: 2 });
    const once = invalidations.length;
    bg.resolve({
      requests: 0,
      error: new BulkDeleteError("delete contracts", "vsb_capexprojectcontracts", ["a", "b"], 0, [new Error("x"), new Error("y")]),
    });
    await flush();
    expect(notifyError).toHaveBeenCalledTimes(1);
    expect(notifyError).toHaveBeenCalledWith(BACKGROUND_DELETE_FAILED(2));
    expect(invalidations).toHaveLength(once * 2);
  });

  it("UT-ACSHEET-QUERY-005 the background handler never throws, even when the toast does", async () => {
    notifyError.mockClear();
    notifyError.mockImplementationOnce(() => { throw new Error("toaster gone"); });
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    try {
      const options = useSaveAddCostSheet(3) as unknown as SaveOptions;
      const bg = deferred();
      options.onSuccess({ background: bg.promise, deferredContracts: 1 });
      bg.resolve({ requests: 0, error: new Error("refused") });
      await flush();
      await flush();
      expect(notifyError).toHaveBeenCalledWith(BACKGROUND_DELETE_FAILED(1));
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off("unhandledRejection", unhandled);
    }
  });

  /** Settles a background with `outcome` through the hook and returns the toasts it raised. */
  const toastsFor = async (
    options: SaveOptions, outcome: Outcome, counts: { deferredContracts?: number; deferredCosts?: number },
  ) => {
    invalidations.length = 0;
    notifyError.mockReset();
    const bg = deferred();
    options.onSuccess({ background: bg.promise, ...counts });
    const once = invalidations.length;
    bg.resolve(outcome);
    await flush();
    // Every ending re-invalidates the CAPEX queries (a reconcile may have rewritten totals).
    expect(invalidations).toHaveLength(once * 2);
    return notifyError.mock.calls.map((c) => c[0] as string);
  };

  it("UT-ACSHEET-QUERY-006 a background cost-delete failure that was reconciled shows the reconciled text", async () => {
    const err = new Error("refused");
    const options = useSaveAddCostSheet(3) as unknown as SaveOptions;
    expect(await toastsFor(options, { requests: 0, error: err, costDeleteError: err, reconciled: true }, { deferredCosts: 16 }))
      .toEqual([COST_DELETE_FAILED_RECONCILED]);
  });

  it("UT-ACSHEET-QUERY-007 a cost-delete failure whose totals were not reconciled says the totals may not match", async () => {
    const err = new Error("refused");
    const options = useSaveAddCostSheet(3) as unknown as SaveOptions;
    expect(await toastsFor(options, {
      requests: 0, error: err, costDeleteError: err, reconciled: false, reconcileError: new Error("read"),
    }, { deferredCosts: 16 })).toEqual([COST_DELETE_FAILED_NOT_RECONCILED]);
  });

  it("UT-ACSHEET-QUERY-008 both kinds failed: two toasts, cost first; a throwing toast does not hide the second", async () => {
    const cost = new Error("cost");
    const contract = new BulkDeleteError("delete contracts", "vsb_capexprojectcontracts", ["a"], 1, [new Error("x")]);
    const outcome = { requests: 0, error: cost, costDeleteError: cost, contractDeleteError: contract, reconciled: true };
    const options = useSaveAddCostSheet(3) as unknown as SaveOptions;
    expect(await toastsFor(options, outcome, { deferredCosts: 3, deferredContracts: 2 }))
      .toEqual([COST_DELETE_FAILED_RECONCILED, BACKGROUND_DELETE_FAILED(1)]);

    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    try {
      notifyError.mockReset();
      notifyError.mockImplementationOnce(() => { throw new Error("toaster gone"); });
      const bg = deferred();
      options.onSuccess({ background: bg.promise, deferredCosts: 3, deferredContracts: 2 });
      bg.resolve(outcome);
      await flush();
      await flush();
      expect(notifyError).toHaveBeenCalledTimes(2);
      expect(notifyError).toHaveBeenLastCalledWith(BACKGROUND_DELETE_FAILED(1));
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off("unhandledRejection", unhandled);
    }
  });
});
