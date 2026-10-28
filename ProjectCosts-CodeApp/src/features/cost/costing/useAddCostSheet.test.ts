/**
 * `useAddCostSheet` must never refetch behind an open sheet (D51 §3a): a refetch re-hydrates the
 * grid and clears the Screen's retry-id cache, so after a failed save a focus or reconnect refetch
 * would turn a safe "Save again" into a silent partial save.
 */
import { describe, expect, it, vi } from "vitest";

const useQuery = vi.fn((options: unknown) => options);
const invalidations: unknown[] = [];
/** Every cache call in order (`set <key>` / `invalidate <key> pending=<n>`), for ordering checks. */
const events: string[] = [];
/** How many contract ids `pendingDeletes` held when each invalidation was made. */
const pendingAt = () => pendingRegistry().snapshot().contractIds.size;
/** Never settles: a Save that awaited it would hang. */
const invalidateQueries = vi.fn((filters: { queryKey: unknown[] }) => {
  invalidations.push(filters);
  events.push(`invalidate ${JSON.stringify(filters.queryKey)} pending=${pendingAt()}`);
  return new Promise<void>(() => {});
});
/** A query cache with TanStack's `setQueryData` semantics: an updater returning undefined is a no-op. */
const cache = new Map<string, unknown>();
const setQueryData = vi.fn((key: unknown[], updater: unknown) => {
  const k = JSON.stringify(key);
  const next = typeof updater === "function" ? (updater as (old: unknown) => unknown)(cache.get(k)) : updater;
  if (next !== undefined) cache.set(k, next);
  events.push(`set ${k}`);
  return next;
});

const cancelQueries = vi.fn((filters: { queryKey: unknown[] }) => {
  events.push(`cancel ${JSON.stringify(filters.queryKey)}`);
  return Promise.resolve();
});

vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: unknown) => useQuery(options),
  useMutation: (options: unknown) => options,
  useQueryClient: () => ({ invalidateQueries, setQueryData, cancelQueries }),
}));
/** The repository the query functions read through, mocked per test. */
const repo = {
  getCostBook: vi.fn(),
  getCapexTotals: vi.fn(),
  loadAddCostSheet: vi.fn(),
  saveAddCostSheet: vi.fn(),
};
vi.mock("@/data/costRepository", () => ({ costRepository: () => repo }));
vi.mock("@/app/SessionContext", () => ({ useSession: () => ({ projectId: "p-1", project: null }) }));
/** The app toaster, mocked: the hook dispatches into it through `useNotify`. */
const notifyError = vi.fn();
vi.mock("@/components/useNotify", () => ({
  useNotify: () => ({
    success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: notifyError, dismissAll: vi.fn(),
  }),
}));

const { useAddCostSheet, useCapexTotals, useCostBook, useSaveAddCostSheet } = await import("./useCostBook");
const { pendingDeletes } = await import("@/data/pendingDeletes");
function pendingRegistry() { return pendingDeletes; }
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
/**
 * The CAPEX keys `invalidate` refreshes (the DEVEX/CAPEX grid and the totals), refetched even
 * while inactive (D51 §11.19).
 */
const CAPEX_KEYS = [
  { queryKey: ["cost-book", "p-1", 3], refetchType: "all" },
  { queryKey: ["capex-totals", "p-1"], refetchType: "all" },
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

/* ── D51 §11.19 / CA-13: the saved state at once, pending deletes hidden ── */

type Payment = { id?: string; year: number; month: number; amount: number; paid: boolean };
type Line = { id: string; accountId: string; totalCost?: number; payments: Payment[] };
type Book = { accounts: { id: string }[]; lines: Line[]; periods: unknown[]; extraGroups: unknown };
type PatchOptions = {
  onSuccess: (result?: {
    background?: Promise<Outcome>; deferredContracts?: number; deferredCosts?: number;
    deferredContractIds?: string[]; deferredCostIds?: string[]; applied?: unknown;
  }) => unknown;
};
type QueryOptions<T> = { queryFn: () => Promise<T> };

const BOOK_KEY = JSON.stringify(["cost-book", "p-1", 3]);
const storedBook = (): Book => ({
  accounts: [{ id: "sub-1" }],
  lines: [
    { id: "c-1", accountId: "sub-1", totalCost: 150, payments: [
      { id: "k-1", year: 2026, month: 1, amount: 100, paid: true },
      { id: "k-2", year: 2026, month: 2, amount: 50, paid: false },
    ] },
    { id: "doomed", accountId: "sub-1", totalCost: 70, payments: [{ id: "k-d", year: 2026, month: 1, amount: 70, paid: false }] },
  ],
  periods: [], extraGroups: { om: [], land: [], other: [] },
});
/** What `saveAddCostSheetBulk` returns for: k-1 100 → 200, k-2 cleared, "doomed" removed. */
const APPLIED = {
  contracts: [{ id: "c-1", isNew: false, totalCost: 200, columns: null }],
  costs: [{ id: "k-1", contractId: "c-1", year: 2026, month: 1, amount: 200, isNew: false }],
  deletedContractIds: ["doomed"],
  deletedCostIds: ["k-2"],
};
const deferredResult = (bg: Promise<Outcome>) => ({
  background: bg, deferredContracts: 1, deferredCosts: 1,
  deferredContractIds: ["doomed"], deferredCostIds: ["k-2"], applied: APPLIED,
});
const ids = (b: Book) => b.lines.map((l) => `${l.id}[${l.payments.map((p) => p.id).join(",")}]`);

describe("useSaveAddCostSheet — saved state at once (D51 §11.19)", () => {
  const reset = () => {
    invalidations.length = 0;
    events.length = 0;
    cache.clear();
    notifyError.mockReset();
    setQueryData.mockClear();
  };

  it("UT-ACSHEET-QUERY-009 onSuccess patches the cached book synchronously, before any invalidation", async () => {
    reset();
    cache.set(BOOK_KEY, storedBook());
    const options = useSaveAddCostSheet(3) as unknown as PatchOptions;
    const bg = deferred();
    // `onSuccess` runs before `mutateAsync` resolves, so the patch is in place before `back()`.
    expect(options.onSuccess(deferredResult(bg.promise))).toBeUndefined();
    const patched = cache.get(BOOK_KEY) as Book;
    expect(ids(patched)).toEqual(["c-1[k-1]"]);
    expect(patched.lines[0]?.totalCost).toBe(200);
    expect(patched.lines[0]?.payments[0]).toEqual({ id: "k-1", year: 2026, month: 1, amount: 200, paid: true });
    expect(events[0]).toBe(`set ${BOOK_KEY}`);
    expect(events.slice(1).every((e) => e.startsWith("invalidate ") || e.startsWith("cancel "))).toBe(true);
    bg.resolve({ requests: 2 });
    await flush();
  });

  it("UT-ACSHEET-QUERY-010 the CAPEX book and totals refetch with type all; the sheet stays none; the period book and DevCo keep the default", async () => {
    reset();
    const options = useSaveAddCostSheet(3) as unknown as PatchOptions;
    options.onSuccess({ applied: APPLIED });
    expect(invalidations).toEqual(expect.arrayContaining([
      { queryKey: ["add-cost-sheet", "p-1", 3], refetchType: "none" },
      { queryKey: ["cost-book", "p-1", 3], refetchType: "all" },
      { queryKey: ["capex-totals", "p-1"], refetchType: "all" },
      { queryKey: ["cost-book", "p-1", "none"] },
      { queryKey: ["devCoCapexContracts", "p-1"] },
      { queryKey: ["devCoCapexCosts", "p-1"] },
    ]));
    expect(invalidations).toHaveLength(6);
  });

  it("UT-ACSHEET-QUERY-011 no cached book: nothing is written to the cache; it is still refetched", () => {
    reset();
    const options = useSaveAddCostSheet(3) as unknown as PatchOptions;
    options.onSuccess({ applied: APPLIED });
    expect(cache.has(BOOK_KEY)).toBe(false);
    expect(invalidations).toContainEqual({ queryKey: ["cost-book", "p-1", 3], refetchType: "all" });
  });

  it("UT-ACSHEET-QUERY-012 the legacy path (result {}): no patch, no registry entry, just the refetch", () => {
    reset();
    cache.set(BOOK_KEY, storedBook());
    const before = cache.get(BOOK_KEY);
    const options = useSaveAddCostSheet(3) as unknown as PatchOptions;
    expect(options.onSuccess({})).toBeUndefined();
    expect(setQueryData).not.toHaveBeenCalled();
    expect(cache.get(BOOK_KEY)).toBe(before);
    expect(pendingDeletes.snapshot().contractIds.size).toBe(0);
    expect(invalidations).toContainEqual({ queryKey: ["cost-book", "p-1", 3], refetchType: "all" });
  });

  it("UT-ACSHEET-QUERY-013 a book refetch racing the background hides the pending rows; after it settles they are released", async () => {
    reset();
    const options = useSaveAddCostSheet(3) as unknown as PatchOptions;
    const bg = deferred();
    options.onSuccess(deferredResult(bg.promise));
    // Every invalidation of this save was made with the ids already registered.
    expect(events.filter((e) => e.startsWith("invalidate ")).every((e) => e.endsWith("pending=1"))).toBe(true);

    // The server still holds the rows (the deletes have not landed).
    repo.getCostBook.mockImplementation(async () => storedBook());
    const read = (useCostBook(3) as unknown as QueryOptions<Book>).queryFn;
    expect(ids(await read())).toEqual(["c-1[k-1]"]);

    events.length = 0;
    bg.resolve({ requests: 2 });
    await flush();
    // Released BEFORE the second invalidation, so that refetch shows the server as it is.
    const second = events.filter((e) => e.startsWith("invalidate "));
    expect(second.length).toBeGreaterThan(0);
    expect(second.every((e) => e.endsWith("pending=0"))).toBe(true);
    expect(ids(await read())).toEqual(["c-1[k-1,k-2]", "doomed[k-d]"]);
  });

  it("UT-ACSHEET-QUERY-014 a failed background delete releases the ids too: the rows show again, with the toast", async () => {
    reset();
    const options = useSaveAddCostSheet(3) as unknown as PatchOptions;
    const bg = deferred();
    options.onSuccess(deferredResult(bg.promise));
    repo.getCostBook.mockImplementation(async () => storedBook());
    const read = (useCostBook(3) as unknown as QueryOptions<Book>).queryFn;
    expect(ids(await read())).toEqual(["c-1[k-1]"]);
    const err = new BulkDeleteError("delete contracts", "vsb_capexprojectcontracts", ["doomed"], 0, [new Error("x")]);
    bg.resolve({ requests: 0, error: err, contractDeleteError: err, costDeleteError: err, reconciled: true });
    await flush();
    expect(pendingDeletes.snapshot().contractIds.size).toBe(0);
    expect(pendingDeletes.snapshot().costIds.size).toBe(0);
    expect(ids(await read())).toEqual(["c-1[k-1,k-2]", "doomed[k-d]"]);
    expect(notifyError).toHaveBeenCalledWith(BACKGROUND_DELETE_FAILED(1));
  });

  it("UT-ACSHEET-QUERY-015 the Summary totals and the sheet reload also read with the pending ids", async () => {
    reset();
    const options = useSaveAddCostSheet(3) as unknown as PatchOptions;
    const bg = deferred();
    options.onSuccess(deferredResult(bg.promise));

    repo.getCapexTotals.mockResolvedValue([]);
    await (useCapexTotals() as unknown as QueryOptions<unknown>).queryFn();
    const pending = repo.getCapexTotals.mock.calls[0]?.[1] as { contractIds: Set<string>; costIds: Set<string> };
    expect([...pending.contractIds]).toEqual(["doomed"]);
    expect([...pending.costIds]).toEqual(["k-2"]);

    repo.loadAddCostSheet.mockResolvedValue({
      accounts: [], subaccounts: [], payerDefaults: new Map(),
      contracts: [{ id: "c-1" }, { id: "doomed" }],
      costs: [{ id: "k-1", contractId: "c-1" }, { id: "k-2", contractId: "c-1" }, { id: "k-d", contractId: "doomed" }],
    });
    const sheet = await (useAddCostSheet(3) as unknown as QueryOptions<{ contracts: { id: string }[]; costs: { id: string }[] }>).queryFn();
    expect(sheet.contracts.map((c) => c.id)).toEqual(["c-1"]);
    expect(sheet.costs.map((c) => c.id)).toEqual(["k-1"]);
    bg.resolve({ requests: 2 });
    await flush();
  });

  it("UT-ACSHEET-QUERY-017 the book and totals reads in flight are cancelled before they are invalidated, on save and on release", async () => {
    reset();
    const options = useSaveAddCostSheet(3) as unknown as PatchOptions;
    const bg = deferred();
    options.onSuccess(deferredResult(bg.promise));
    const order = (log: string[]) => {
      for (const key of [JSON.stringify(["cost-book", "p-1", 3]), JSON.stringify(["capex-totals", "p-1"])]) {
        const cancel = log.indexOf(`cancel ${key}`);
        const invalidate = log.findIndex((e) => e.startsWith(`invalidate ${key}`));
        expect(cancel).toBeGreaterThanOrEqual(0);
        expect(cancel).toBeLessThan(invalidate);
      }
    };
    order(events);
    events.length = 0;
    bg.resolve({ requests: 2 });
    await flush();
    order(events);
  });

  it("UT-ACSHEET-QUERY-016 a patch that throws never fails the Save, and the refetch still starts", async () => {
    reset();
    cache.set(BOOK_KEY, { broken: true }); // not a book: the patch throws on it
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const options = useSaveAddCostSheet(3) as unknown as PatchOptions;
    const bg = deferred();
    expect(() => options.onSuccess(deferredResult(bg.promise))).not.toThrow();
    expect(error).toHaveBeenCalled();
    expect(invalidations).toContainEqual({ queryKey: ["cost-book", "p-1", 3], refetchType: "all" });
    bg.resolve({ requests: 2 });
    await flush();
    expect(pendingDeletes.snapshot().contractIds.size).toBe(0);
    error.mockRestore();
  });
});
