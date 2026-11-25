// @vitest-environment jsdom
/**
 * FE-SH-03 (D162, decision D-3): Add Cost from Table is a right panel over the DEVEX/CAPEX screen, and the CAPEX screen stays
 * mounted while the panel opens and closes. `capex` renders `<CapexCostsScreen/>` and `add-from-table` renders
 * `<><CapexCostsScreen/><AddCostsFromTableScreen/></>`. That is NOT a remount: React unwraps an unkeyed top-level Fragment, so
 * CAPEX is the first child, of the same type and key, in both, and keeps its fiber, its state and its grid. These tests pin
 * that through the real `AppRoutes`; wrapping either element (a `<div>`, a keyed Fragment, a second element before CAPEX)
 * would make them fail.
 *
 * The CAPEX refresh after a Save (CA-13, D51 §11.19) does not depend on a remount either: `useSaveAddCostSheet` patches the
 * cached book in `onSuccess` and refetches it with `refetchType: "all"`. UT-CAPEXROUTE-FE-003 runs that real hook and the real
 * `useCostBook` through the real `AppRoutes`, and checks that the still-mounted CAPEX shows the saved total.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FluentProvider } from "@fluentui/react-components";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { vsbTheme } from "@/theme/fluent";
import type { CostBook } from "@/features/cost/costing/model";

const session = vi.hoisted(() => ({
  value: {
    projectId: "p-1", project: { projectId: "p-1", owningBusinessUnitId: "bu-1" },
    loading: false, projectIdInvalid: false, projectNotFound: false, error: null, session: null,
  } as Record<string, unknown>,
}));
vi.mock("@/app/SessionContext", () => ({ useSession: () => session.value }));

const repo = vi.hoisted(() => ({ getCostBook: vi.fn(), saveAddCostSheet: vi.fn() }));
vi.mock("@/data/costRepository", () => ({ costRepository: () => repo }));

const mounts = vi.hoisted(() => ({ capex: 0, sheet: 0 }));

/** DEVEX/CAPEX: the real book hook, a mount counter, the total of contract c-1, and the Add Cost from Table command. */
vi.mock("@/features/cost/capex-costs/Screen", async () => {
  const { useCostBook } = await import("@/features/cost/costing/useCostBook");
  return {
    default: function CapexStandIn() {
      useEffect(() => { mounts.capex += 1; }, []);
      const { data } = useCostBook(0);
      const navigate = useNavigate();
      const { pathname } = useLocation();
      return <>
        <output data-testid="capex-total">{data?.lines.find((l) => l.id === "c-1")?.totalCost ?? "loading"}</output>
        <output data-testid="capex-path">{pathname}</output>
        <button aria-label="Add Cost from Table" data-testid="open-sheet"
          onClick={() => { void navigate("/costs/add-from-table?category=0"); }}>Add Cost from Table</button>
      </>;
    },
  };
});

/** Add Cost from Table: the real save hook; Save resolves, then goes back as the screen's `back()` does; ✕ goes back. */
vi.mock("@/features/cost/add-costs-from-table/Screen", async () => {
  const { useSaveAddCostSheet } = await import("@/features/cost/costing/useCostBook");
  return {
    default: function SheetStandIn() {
      useEffect(() => { mounts.sheet += 1; }, []);
      const save = useSaveAddCostSheet(0);
      const navigate = useNavigate();
      const back = () => { void navigate({ pathname: "/costs/capex", search: "?category=0" }); };
      return <>
        <span data-testid="sheet">sheet</span>
        <button aria-label="Save" data-testid="save-sheet" onClick={async () => {
          await save.mutateAsync({
            changedRows: [], existingContracts: [], existingCosts: [], contractDeleteIds: [],
            idCache: new Map(), refreshBeforePlan: false,
          } as never);
          back();
        }}>Save</button>
        <button aria-label="Cancel" data-testid="close-sheet" onClick={back}>Cancel</button>
      </>;
    },
  };
});

const { AppRoutes } = await import("./routes");

const book = (total: number): CostBook => ({
  accounts: [{ id: "sub-1", category: 0 } as never],
  lines: [{ id: "c-1", accountId: "sub-1", description: "My Cost", totalCost: total, payments: [] } as never],
  periods: [], extraGroups: { om: [], land: [], other: [] },
});

let client: QueryClient;
const mount = (path: string) => render(
  <FluentProvider theme={vsbTheme}>
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter>
    </QueryClientProvider>
  </FluentProvider>,
);
const click = async (testId: string) => { await act(async () => { screen.getByTestId(testId).click(); }); };

beforeEach(() => {
  mounts.capex = 0;
  mounts.sheet = 0;
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 }, mutations: { retry: false } } });
  repo.getCostBook.mockReset().mockResolvedValue(book(100));
  repo.saveAddCostSheet.mockReset();
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});
afterEach(() => { vi.restoreAllMocks(); client.clear(); });

describe("FE-SH-03 — DEVEX/CAPEX stays mounted under Add Cost from Table", () => {
  it("UT-CAPEXROUTE-FE-001 opening and closing Add Cost from Table mounts CAPEX once (no remount)", async () => {
    mount("/costs/capex?category=0");
    await waitFor(() => expect(screen.getByTestId("capex-total")).toHaveTextContent("100"));
    expect(mounts.capex).toBe(1);

    await click("open-sheet");
    expect(await screen.findByTestId("sheet")).toBeInTheDocument();
    expect(screen.getByTestId("capex-path")).toHaveTextContent("/costs/add-from-table");
    expect(mounts.capex).toBe(1);

    await click("close-sheet");
    await waitFor(() => expect(screen.queryByTestId("sheet")).toBeNull());
    expect(screen.getByTestId("capex-path")).toHaveTextContent("/costs/capex");
    expect(mounts.capex).toBe(1);
    // The sheet itself mounts fresh on every open, as before.
    await click("open-sheet");
    await screen.findByTestId("sheet");
    expect(mounts.sheet).toBe(2);
    expect(mounts.capex).toBe(1);
  });

  it("UT-CAPEXROUTE-FE-002 both URLs keep working as deep links, behind the Cost project gate", async () => {
    const deep = mount("/costs/add-from-table?category=0");
    expect(await screen.findByTestId("sheet")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("capex-total")).toHaveTextContent("100"));
    deep.unmount();

    const plain = mount("/costs/capex?category=0");
    await waitFor(() => expect(screen.getByTestId("capex-total")).toHaveTextContent("100"));
    expect(screen.queryByTestId("sheet")).toBeNull();
    plain.unmount();

    // `CostProjectGate` still holds both back while the project loads.
    session.value = { ...session.value, loading: true };
    try {
      mount("/costs/add-from-table?category=0");
      expect(await screen.findByTestId("cost-project-loading")).toBeInTheDocument();
      expect(screen.queryByTestId("capex-total")).toBeNull();
      expect(screen.queryByTestId("sheet")).toBeNull();
    } finally {
      session.value = { ...session.value, loading: false };
    }
  });

  it("UT-CAPEXROUTE-FE-003 after a Save the still-mounted CAPEX shows the saved total at once, and its confirming read runs", async () => {
    mount("/costs/capex?category=0");
    await waitFor(() => expect(screen.getByTestId("capex-total")).toHaveTextContent("100"));
    await click("open-sheet");
    await screen.findByTestId("sheet");
    expect(repo.getCostBook).toHaveBeenCalledTimes(1);

    // The Save resolves with what it applied; the confirming read returns the stored state.
    repo.saveAddCostSheet.mockResolvedValue({
      applied: {
        contracts: [{ id: "c-1", isNew: false, totalCost: 250, columns: null }],
        costs: [], deletedContractIds: [], deletedCostIds: [],
      },
    });
    let confirm!: (b: CostBook) => void;
    repo.getCostBook.mockImplementation(() => new Promise<CostBook>((resolve) => { confirm = resolve; }));

    await click("save-sheet");
    await waitFor(() => expect(screen.queryByTestId("sheet")).toBeNull());
    // The optimistic patch (D51 §11.19) shows before the refetch answers, with no remount.
    expect(screen.getByTestId("capex-total")).toHaveTextContent("250");
    expect(mounts.capex).toBe(1);
    expect(repo.getCostBook).toHaveBeenCalledTimes(2);

    await act(async () => { confirm(book(260)); });
    await waitFor(() => expect(screen.getByTestId("capex-total")).toHaveTextContent("260"));
    expect(mounts.capex).toBe(1);
  });
});
