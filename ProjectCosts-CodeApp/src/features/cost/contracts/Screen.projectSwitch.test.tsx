// @vitest-environment jsdom
/** UT-CONTR-211 — a different project gets a fresh Contracts screen: the open panel and the form do not carry over. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FluentProvider } from "@fluentui/react-components";
import { MemoryRouter } from "react-router-dom";
import { vsbTheme } from "@/theme/fluent";

const session = vi.hoisted(() => ({ projectId: "11111111-2222-3333-4444-555555555555" }));

vi.mock("@/app/SessionContext", () => ({
  useSession: () => ({
    projectId: session.projectId,
    project: { projectId: session.projectId, projectIdCode: "P-1", projectName: "P" },
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
    useBopStandardAssumption: () => query(undefined),
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

/** A NEW element each call: re-rendering the same element object would let React skip the screen. */
const makeTree = () => (
  <FluentProvider theme={vsbTheme}>
    <MemoryRouter><ContractsScreen /></MemoryRouter>
  </FluentProvider>
);

beforeEach(() => { session.projectId = "11111111-2222-3333-4444-555555555555"; });

describe("Contracts screen per project", () => {
  it("UT-CONTR-211 switching to another project closes an open panel and starts the form empty", async () => {
    const view = render(makeTree());
    fireEvent.click(screen.getByTestId("command-newDevContarct"));
    const description = await screen.findByTestId("txt_Contracts_RightPanel_NewEdit_Description");
    fireEvent.change(description, { target: { value: "Project A input" } });
    expect(description).toHaveValue("Project A input");

    session.projectId = "99999999-2222-3333-4444-555555555555";
    view.rerender(makeTree());
    await waitFor(() => expect(screen.queryByTestId("txt_Contracts_RightPanel_NewEdit_Description")).toBeNull());
    fireEvent.click(screen.getByTestId("command-newDevContarct"));
    expect(await screen.findByTestId("txt_Contracts_RightPanel_NewEdit_Description")).toHaveValue("");
  });
});
