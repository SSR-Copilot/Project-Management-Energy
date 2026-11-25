// @vitest-environment jsdom
/**
 * D162 B3 — what a keystroke in the Contracts panel re-renders (FE-C2-01, FE-C2-02) and the payment-target Save gate
 * validated once per render (FE-C2-03).
 *
 * The panel's forms live in the screen body, so every keystroke renders the body. The contract cards, their open bodies
 * and the DevCo account picker take nothing the keystroke changes, so they must not render again. The hooks are mocked
 * with data that keeps its identity, as the app's `QueryClient` keeps it (`app/queryStructuralSharing.ts`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { FluentProvider } from "@fluentui/react-components";
import { MemoryRouter } from "react-router-dom";
import { vsbTheme } from "@/theme/fluent";
import { countRenders, type RenderCounts } from "@/test/renderCounts";

const spies = vi.hoisted(() => ({ title: { calls: 0 }, canSaveTarget: { calls: 0 } }));
vi.mock("./rules", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./rules")>();
  return {
    ...actual,
    contractCardTitle: (...args: Parameters<typeof actual.contractCardTitle>) => {
      spies.title.calls += 1;
      return actual.contractCardTitle(...args);
    },
    canSavePaymentTarget: (...args: Parameters<typeof actual.canSavePaymentTarget>) => {
      spies.canSaveTarget.calls += 1;
      return actual.canSavePaymentTarget(...args);
    },
  };
});

const fixtures = vi.hoisted(() => {
  const node = (over: Record<string, unknown>): Record<string, unknown> => ({
    order: 1, childCount: 0, totalCost: 0, selected: false, used: false, ...over,
  });
  const contracts = [
    { id: "c-1", description: "Grid works", contractType: 1, margin: false, isMarginStandardAssumption: false },
    { id: "c-2", description: "Road works", contractType: 1, margin: false, isMarginStandardAssumption: false },
    { id: "c-3", description: "Permits", contractType: 1, margin: false, isMarginStandardAssumption: false },
  ];
  const tree = [
    node({ id: "p1", level: 1, number: "81000", name: "Planning", childCount: 2 }),
    node({ id: "l1", level: 3, number: "81000_0_1", name: "Design works", parentId: "p1", totalCost: 100 }),
    node({ id: "l2", level: 3, number: "81000_0_2", name: "Permits", parentId: "p1", totalCost: 200 }),
  ];
  const q = (data: unknown) => ({ data, isLoading: false, error: null, isSuccess: true, isError: false, isPlaceholderData: false });
  return {
    contracts: q(contracts), empty: q([]), extras: q({}), none: q(undefined), tree,
    targets: { byContract: new Map(), isSuccess: true, isError: false, isPlaceholderData: false, data: [] },
    mutation: { mutateAsync: () => Promise.resolve(), isPending: false },
  };
});

vi.mock("@/app/SessionContext", () => {
  const session = {
    projectId: "11111111-2222-3333-4444-555555555555",
    project: { projectId: "11111111-2222-3333-4444-555555555555", projectIdCode: "P-1", projectName: "P" },
    projectNotFound: false,
    locale: "en-GB",
  };
  return { useSession: () => session };
});
vi.mock("@/platform/privileges", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/platform/privileges")>()),
  serverEnforcedProvider: { forTable: () => ({ canCreate: true, canWrite: true, canDelete: true }) },
}));
vi.mock("./hooks", () => {
  const trees = new Map<string, unknown>();
  return {
    useContracts: () => fixtures.contracts,
    usePaymentTargets: () => fixtures.targets,
    useCapexAccounts: () => fixtures.empty,
    useDevCoCapexContracts: () => fixtures.empty,
    useDevCoLinks: () => fixtures.empty,
    useProjectExtras: () => fixtures.extras,
    useCapexCostRows: () => fixtures.empty,
    // One tree per selection, so a keystroke (which selects nothing) hands the picker the same tree.
    useAccountTree: (args: { selectedAccountIds: readonly string[] }) => {
      const key = args.selectedAccountIds.join(",");
      if (!trees.has(key)) {
        trees.set(key, fixtures.tree.map((n) => ({ ...n, selected: args.selectedAccountIds.includes(n.id as string) })));
      }
      return trees.get(key);
    },
    useBopStandardAssumption: () => fixtures.none,
    useSaveContract: () => fixtures.mutation,
    useDeleteContract: () => fixtures.mutation,
    useSavePaymentTarget: () => fixtures.mutation,
    useDeletePaymentTarget: () => fixtures.mutation,
  };
});
vi.mock("@/features/cost/costing/useCostWriteFlight", () => ({
  useCostWriteInFlight: () => false,
  useWriteFailureReport: () => (text: string, show?: (t: string) => void) => { show?.(text); },
}));

import ContractsScreen from "./Screen";

const DESCRIPTION = "txt_Contracts_RightPanel_NewEdit_Description";
let renders: RenderCounts;

function mount() {
  return render(
    <FluentProvider theme={vsbTheme}>
      <MemoryRouter initialEntries={["/costs/contracts"]}><ContractsScreen /></MemoryRouter>
    </FluentProvider>,
  );
}

/** Every card open, the New Development Contract panel open, its one DevCo row unfolded. */
async function openEverything() {
  mount();
  for (const id of ["c-1", "c-2", "c-3"]) fireEvent.click(screen.getByTestId(`ico_Contracts_List_CardHeader_Down-${id}`));
  fireEvent.click(screen.getByTestId("command-newDevContarct"));
  await screen.findByTestId(DESCRIPTION);
  fireEvent.click(screen.getByTestId("btn_Contracts_RightPanel_NewEdit_DevCoCosts_TransparentButton-p1"));
  expect(screen.getByTestId("chb_Contracts_RightPanel_NewEdit_CostssRow-l1")).toBeInTheDocument();
}

const typeKeys = (...values: string[]) => {
  for (const value of values) fireEvent.change(screen.getByTestId(DESCRIPTION), { target: { value } });
};

beforeEach(() => {
  renders = countRenders();
  spies.title.calls = 0;
  spies.canSaveTarget.calls = 0;
});
afterEach(() => { renders.stop(); });

describe("Contracts — a panel keystroke re-renders only the panel (D162 B3)", () => {
  it("UT-CONTRACTS-FE-001 FE-C2-01 three keystrokes do not render the DevCo account picker again", async () => {
    await openEverything();
    expect(renders.of("DevCoAccountPicker")).toBeGreaterThan(0);
    renders.reset();
    typeKeys("M", "Ma", "Mai");
    expect(renders.of("ContractsScreenBody")).toBeGreaterThanOrEqual(3);
    expect(renders.of("DevCoAccountPicker")).toBe(0);
  });

  it("UT-CONTRACTS-FE-002 FE-C2-02 three keystrokes render no contract card header and no open card body", async () => {
    await openEverything();
    expect(renders.ofPrefix("ContractCardBody:")).toBeGreaterThan(0);
    renders.reset();
    spies.title.calls = 0;
    typeKeys("M", "Ma", "Mai");
    expect(renders.ofPrefix("ContractCardBody:")).toBe(0);
    // `contractCardTitle` runs twice per header render (title and text).
    expect(spies.title.calls).toBe(0);
  });

  it("UT-CONTRACTS-FE-003 FE-C2-02 a card still renders when its own state changes: folding one renders that one only", async () => {
    await openEverything();
    renders.reset();
    spies.title.calls = 0;
    fireEvent.click(screen.getByTestId("ico_Contracts_List_CardHeader_Up-c-2"));
    expect(screen.queryByTestId("ico_Contracts_List_CardHeader_Up-c-2")).toBeNull();
    expect(screen.getByTestId("ico_Contracts_List_CardHeader_Down-c-2")).toBeInTheDocument();
    expect(spies.title.calls).toBe(2);
    expect(renders.ofPrefix("ContractCardBody:")).toBe(0);
    // Selecting a contract re-renders that card (it shows the selection) and no other body.
    renders.reset();
    spies.title.calls = 0;
    fireEvent.click(screen.getByTestId("btn_Contracts_List_CardHeader_TransparentButton-c-1"));
    expect(screen.getByTestId("img_Contracts_List_CardHeaderRadioSelection-c-1")).toBeChecked();
    expect(renders.of("ContractCardBody:c-1")).toBe(1);
    expect(renders.of("ContractCardBody:c-3")).toBe(0);
  });

  it("UT-CONTRACTS-FE-004 FE-C2-03 the payment-target Save gate does not validate a second time on each render", async () => {
    await openEverything();
    spies.canSaveTarget.calls = 0;
    renders.reset();
    typeKeys("M", "Ma");
    expect(renders.of("ContractsScreenBody")).toBeGreaterThan(0);
    expect(spies.canSaveTarget.calls).toBe(0);
  });
});
