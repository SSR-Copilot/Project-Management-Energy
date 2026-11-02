// @vitest-environment jsdom
/**
 * WS-F â€” `useSaveAddCostSheet` with a background Save, against a REAL `QueryClient`, the real
 * `useMutation`, the real CA-15 `useCostWriteInFlight` and the real `<AppToaster />`.
 *
 * The screen that started the Save is unmounted before it resolves, exactly as a background Save
 * leaves the sheet at once. What must survive that: the write lock, the status toast, the unload
 * guard, and the hook's own success / failure handling. A Save without `background` must take none
 * of those branches (the flag-off half).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEffect } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FluentProvider } from "@fluentui/react-components";
import { vsbTheme } from "@/theme/fluent";
import { AppToaster } from "@/components/AppToaster";

vi.mock("@/app/SessionContext", () => ({
  useSession: () => ({ projectId: "p-1", project: { owningBusinessUnitId: "bu-1" } }),
}));
const repo = { saveAddCostSheet: vi.fn() };
vi.mock("@/data/costRepository", () => ({ costRepository: () => repo }));

const { useSaveAddCostSheet } = await import("./useCostBook");
const { useCostWriteInFlight } = await import("./useCostWriteFlight");
const { BACKGROUND_SAVE_MSG, BACKGROUND_SAVE_STATUS_TEST_ID, backgroundSaveRunning } = await import("./backgroundSave");

type Save = ReturnType<typeof useSaveAddCostSheet>;
const handle: { save?: Save } = {};

/** The sheet: owns the mutation observer, as the Add Cost from Table screen does. */
function Sheet() {
  const save = useSaveAddCostSheet(1);
  useEffect(() => { handle.save = save; }, [save]);
  return null;
}
/** DEVEX/CAPEX's CA-15 guard, mounted on another "route". */
function Capex() {
  return <span data-testid="lock">{String(useCostWriteInFlight("p-1"))}</span>;
}

let client: QueryClient;
const view = (sheet: boolean) => (
  <QueryClientProvider client={client}>
    <FluentProvider theme={vsbTheme}>
      <AppToaster />
      <Capex />
      {sheet ? <Sheet /> : null}
    </FluentProvider>
  </QueryClientProvider>
);

/** A Save the test settles by hand. */
const deferred = () => {
  let resolve: (v: unknown) => void = () => undefined;
  let reject: (e: unknown) => void = () => undefined;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

const fireBeforeUnload = () => {
  const event = new Event("beforeunload", { cancelable: true }) as BeforeUnloadEvent;
  Object.defineProperty(event, "returnValue", { value: undefined, writable: true });
  window.dispatchEvent(event);
  return event;
};

const args = (background?: boolean) => ({
  changedRows: [], existingContracts: [], existingCosts: [], contractDeleteIds: [],
  idCache: new Map<string, string>(), refreshBeforePlan: false,
  ...(background === undefined ? {} : { background }),
});

/** Starts a Save from the sheet, then unmounts the sheet (the navigation). */
const startThenLeave = async (rerender: (ui: React.ReactElement) => void, background?: boolean) => {
  let sending!: Promise<unknown>;
  await act(async () => { sending = handle.save!.mutateAsync(args(background)); });
  const settled = sending.then(() => "resolved", () => "rejected");
  rerender(view(false));
  // Wrapped: an async function returning the promise itself would wait for the Save to settle.
  return { settled };
};

/** The invalidation filters the hook made, as `key refetchType` strings. */
let invalidations: string[];

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  invalidations = [];
  const real = client.invalidateQueries.bind(client);
  vi.spyOn(client, "invalidateQueries").mockImplementation((filters, options) => {
    const f = filters as { queryKey?: unknown[]; refetchType?: string } | undefined;
    invalidations.push(`${JSON.stringify(f?.queryKey)} ${f?.refetchType ?? "default"}`);
    return real(filters, options);
  });
  repo.saveAddCostSheet.mockReset();
  handle.save = undefined;
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});
afterEach(() => { vi.restoreAllMocks(); });

describe("useSaveAddCostSheet â€” background Save (WS-F, flag on)", () => {
  it("UT-ACBG-010 the CA-15 lock holds after the sheet is left, until the Save resolves", async () => {
    const write = deferred();
    repo.saveAddCostSheet.mockReturnValue(write.promise);
    const { rerender } = render(view(true));
    const { settled } = await startThenLeave(rerender, true);
    expect(screen.getByTestId("lock").textContent).toBe("true");
    expect(backgroundSaveRunning("p-1")).toBe(true);
    await act(async () => { write.resolve({}); });
    expect(await settled).toBe("resolved");
    await waitFor(() => expect(screen.getByTestId("lock").textContent).toBe("false"));
    expect(backgroundSaveRunning("p-1")).toBe(false);
  });

  it("UT-ACBG-011 the 'Savingâ€¦' status shows (NEW text, test id, aria-label) while it runs, then the saved toast", async () => {
    const write = deferred();
    repo.saveAddCostSheet.mockReturnValue(write.promise);
    const { rerender } = render(view(true));
    const { settled } = await startThenLeave(rerender, true);
    const status = await screen.findByTestId(BACKGROUND_SAVE_STATUS_TEST_ID);
    expect(status.getAttribute("aria-label")).toBe(BACKGROUND_SAVE_MSG.saving);
    expect(status.textContent).toContain(BACKGROUND_SAVE_MSG.saving);
    await act(async () => { write.resolve({}); });
    await settled;
    await waitFor(() => expect(screen.queryByTestId(BACKGROUND_SAVE_STATUS_TEST_ID)).toBeNull());
    expect(await screen.findByText(BACKGROUND_SAVE_MSG.saved)).toBeTruthy();
  });

  it("UT-ACBG-012 the browser asks before closing the tab while it runs, and no longer once it settled", async () => {
    const write = deferred();
    repo.saveAddCostSheet.mockReturnValue(write.promise);
    const { rerender } = render(view(true));
    const { settled } = await startThenLeave(rerender, true);
    const event = fireBeforeUnload();
    expect(event.defaultPrevented).toBe(true);
    expect(event.returnValue).toBe("");
    await act(async () => { write.resolve({}); });
    await settled;
    expect(fireBeforeUnload().defaultPrevented).toBe(false);
  });

  it("UT-ACBG-013 on success the book is patched/invalidated as before, and an open sheet is re-read", async () => {
    const write = deferred();
    repo.saveAddCostSheet.mockReturnValue(write.promise);
    const { rerender } = render(view(true));
    const { settled } = await startThenLeave(rerender, true);
    await act(async () => { write.resolve({}); });
    await settled;
    expect(invalidations).toContain(`${JSON.stringify(["cost-book", "p-1", 1])} all`);
    expect(invalidations).toContain(`${JSON.stringify(["add-cost-sheet", "p-1", 1])} none`);
    expect(invalidations).toContain(`${JSON.stringify(["add-cost-sheet", "p-1", 1])} active`);
  });

  it("UT-ACBG-014 on failure: the cache is refetched (rolled back to what landed), the status and guard are released, no saved toast", async () => {
    const write = deferred();
    repo.saveAddCostSheet.mockReturnValue(write.promise);
    const { rerender } = render(view(true));
    const { settled } = await startThenLeave(rerender, true);
    await screen.findByTestId(BACKGROUND_SAVE_STATUS_TEST_ID);
    await act(async () => { write.reject(new Error("boom")); });
    expect(await settled).toBe("rejected");
    expect(invalidations).toContain(`${JSON.stringify(["cost-book", "p-1", 1])} all`);
    expect(invalidations).toContain(`${JSON.stringify(["capex-totals", "p-1"])} all`);
    expect(invalidations).toContain(`${JSON.stringify(["add-cost-sheet", "p-1", 1])} active`);
    await waitFor(() => expect(screen.queryByTestId(BACKGROUND_SAVE_STATUS_TEST_ID)).toBeNull());
    expect(screen.queryByText(BACKGROUND_SAVE_MSG.saved)).toBeNull();
    expect(fireBeforeUnload().defaultPrevented).toBe(false);
    await waitFor(() => expect(screen.getByTestId("lock").textContent).toBe("false"));
    expect(backgroundSaveRunning("p-1")).toBe(false);
  });

  it("UT-ACBG-015 `background` never reaches the data layer; the project and its BU still do", async () => {
    repo.saveAddCostSheet.mockResolvedValue({});
    const { rerender } = render(view(true));
    await startThenLeave(rerender, true);
    const sent = repo.saveAddCostSheet.mock.calls[0]![0] as Record<string, unknown>;
    expect(sent).not.toHaveProperty("background");
    expect(sent).toMatchObject({ projectId: "p-1", owningBusinessUnitId: "bu-1" });
  });
});

describe("useSaveAddCostSheet â€” a Save without `background` (flag off) is unchanged", () => {
  it("UT-ACBG-020 no status, no unload guard, no registration; success invalidates exactly as before", async () => {
    const write = deferred();
    repo.saveAddCostSheet.mockReturnValue(write.promise);
    const { rerender } = render(view(true));
    let sending!: Promise<unknown>;
    await act(async () => { sending = handle.save!.mutateAsync(args()); });
    expect(screen.queryByTestId(BACKGROUND_SAVE_STATUS_TEST_ID)).toBeNull();
    expect(fireBeforeUnload().defaultPrevented).toBe(false);
    expect(backgroundSaveRunning("p-1")).toBe(false);
    // The lock is CA-15's, unchanged: the mutation itself.
    await waitFor(() => expect(screen.getByTestId("lock").textContent).toBe("true"));
    await act(async () => { write.resolve({}); });
    await sending;
    rerender(view(true));
    expect(invalidations.filter((i) => i.includes("add-cost-sheet"))).toEqual([
      `${JSON.stringify(["add-cost-sheet", "p-1", 1])} none`,
    ]);
    expect(screen.queryByText(BACKGROUND_SAVE_MSG.saved)).toBeNull();
  });

  it("UT-ACBG-021 a failure makes no invalidation and no toast from the hook (the screen keeps its banner and retry)", async () => {
    repo.saveAddCostSheet.mockRejectedValue(new Error("boom"));
    render(view(true));
    let outcome = "";
    await act(async () => { outcome = await handle.save!.mutateAsync(args()).then(() => "resolved", () => "rejected"); });
    expect(outcome).toBe("rejected");
    expect(invalidations).toEqual([]);
    expect(screen.queryByTestId(BACKGROUND_SAVE_STATUS_TEST_ID)).toBeNull();
  });

  it("UT-ACBG-022 the arguments reach the data layer exactly as before (no `background` key)", async () => {
    repo.saveAddCostSheet.mockResolvedValue({});
    render(view(true));
    await act(async () => { await handle.save!.mutateAsync(args()); });
    const sent = repo.saveAddCostSheet.mock.calls[0]![0] as Record<string, unknown>;
    expect(Object.keys(sent).sort()).toEqual([
      "changedRows", "contractDeleteIds", "existingContracts", "existingCosts", "idCache",
      "owningBusinessUnitId", "projectId", "refreshBeforePlan",
    ]);
  });
});
