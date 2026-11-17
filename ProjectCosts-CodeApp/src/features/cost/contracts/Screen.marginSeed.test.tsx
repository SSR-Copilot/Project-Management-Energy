// @vitest-environment jsdom
/**
 * UT-CONTR-223..225 and 233 — the standard assumption seeds a NEW contract's margin once, and a late arrival (or a refetch with
 * equal data) never overwrites what the user already has on screen (D120 §7).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { FluentProvider } from "@fluentui/react-components";
import { MemoryRouter } from "react-router-dom";
import { vsbTheme } from "@/theme/fluent";

const state = vi.hoisted(() => ({ assumption: undefined as Record<string, unknown> | undefined }));

vi.mock("@/app/SessionContext", () => ({
  useSession: () => ({
    projectId: "11111111-2222-3333-4444-555555555555",
    project: { projectId: "11111111-2222-3333-4444-555555555555", projectIdCode: "P-1", projectName: "P" },
    projectNotFound: false,
    locale: "en-US",
  }),
}));
vi.mock("@/platform/privileges", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/platform/privileges")>()),
  serverEnforcedProvider: { forTable: () => ({ canCreate: true, canWrite: true, canDelete: true }) },
}));
vi.mock("./hooks", () => {
  const query = (data: unknown) => ({
    data, isLoading: false, error: null, isSuccess: true, isError: false, isPlaceholderData: false,
  });
  const mutation = () => ({ mutateAsync: vi.fn(() => Promise.resolve()), isPending: false });
  const tree: unknown[] = [];
  return {
    useContracts: () => query([]),
    usePaymentTargets: () => ({ byContract: new Map(), data: [], isSuccess: true, isError: false, isPlaceholderData: false }),
    useCapexAccounts: () => query([]),
    useDevCoCapexContracts: () => query([]),
    useDevCoLinks: () => query([]),
    useProjectExtras: () => query({}),
    useCapexCostRows: () => query([]),
    useAccountTree: () => tree,
    useBopStandardAssumption: () => query(state.assumption),
    useSaveContract: mutation,
    useDeleteContract: mutation,
    useSavePaymentTarget: mutation,
    useDeletePaymentTarget: mutation,
  };
});
vi.mock("@/features/cost/costing/useCostWriteFlight", () => ({
  useCostWriteInFlight: () => false,
  useWriteFailureReport: () => (text: string, show?: (t: string) => void) => { show?.(text); },
}));

import ContractsScreen from "./Screen";

const PERCENT = "txt_Contracts_RightPanel_NewEdit_MarginPercentage";
/** A NEW element each call: re-rendering the same element object would let React skip the screen. */
const makeTree = () => (
  <FluentProvider theme={vsbTheme}>
    <MemoryRouter><ContractsScreen /></MemoryRouter>
  </FluentProvider>
);
const assumption = () => ({ vsb_margin: true, vsb_marginpercentage: 7, vsb_marginfixedvalue: 9 });

beforeEach(() => { state.assumption = undefined; });

describe("the margin seed of a new contract", () => {
  it("UT-CONTR-223 an assumption that arrives after the panel opened seeds the untouched margin", async () => {
    const view = render(makeTree());
    fireEvent.click(screen.getByTestId("command-newDevContarct"));
    await screen.findByTestId("txt_Contracts_RightPanel_NewEdit_Description");
    expect(screen.queryByTestId(PERCENT)).toBeNull();
    state.assumption = assumption();
    view.rerender(makeTree());
    expect(await screen.findByTestId(PERCENT)).toHaveValue("7");
  });

  it("UT-CONTR-224 an assumption that arrives after the user touched the margin does not overwrite it", async () => {
    const view = render(makeTree());
    fireEvent.click(screen.getByTestId("command-newDevContarct"));
    await screen.findByTestId("txt_Contracts_RightPanel_NewEdit_Description");
    fireEvent.click(screen.getByRole("radio", { name: "Yes" }));
    fireEvent.change(screen.getByTestId(PERCENT), { target: { value: "3" } });
    state.assumption = assumption();
    view.rerender(makeTree());
    expect(screen.getByTestId(PERCENT)).toHaveValue("3");
  });

  it("UT-CONTR-225 a refetch that returns equal data in a new object does not seed again", async () => {
    state.assumption = assumption();
    const view = render(makeTree());
    fireEvent.click(screen.getByTestId("command-newDevContarct"));
    expect(await screen.findByTestId(PERCENT)).toHaveValue("7");
    fireEvent.change(screen.getByTestId(PERCENT), { target: { value: "5" } });
    state.assumption = assumption();
    view.rerender(makeTree());
    expect(screen.getByTestId(PERCENT)).toHaveValue("5");
  });
});

describe("the Total cost of contract box (LD-1, canvas :6126)", () => {
  const TOTAL = "txt_Contracts_RightPanel_NewEdit_TotalCosts_Contract";

  it("UT-CONTR-233 is hidden while the margin type is Fixed Value and back for Percentage; the box keeps its test id", async () => {
    render(makeTree());
    fireEvent.click(screen.getByTestId("command-newDevContarct"));
    expect(await screen.findByTestId(TOTAL)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Yes" }));
    expect(screen.getByTestId(TOTAL)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Fixed Value" }));
    expect(screen.queryByTestId(TOTAL)).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "Percentage" }));
    expect(screen.getByTestId(TOTAL)).toBeInTheDocument();
  });
});
