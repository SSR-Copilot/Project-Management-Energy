// @vitest-environment jsdom
/**
 * UT-CONTRACTS-NOSPIN — the Contracts screen without spinners (D57).
 *
 * While the first read runs, the chrome renders with an empty body and every write command greyed
 * out (no spinner, no "No contracts yet"). While a save or delete runs, the verbatim canvas
 * `InformationText` shows as a status line (no overlay), the write-starting commands are greyed
 * out by `writeCommandsDisabled`, and the read-only actions stay usable. A failed read still
 * renders the error state (rule 19).
 *
 * The data hooks and the session are mocked; what is under test is the screen's wiring.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { FluentProvider } from "@fluentui/react-components";
import { MemoryRouter } from "react-router-dom";
import { vsbTheme } from "@/theme/fluent";
import { CONTRACT_TYPE, MSG, type BopContract } from "./rules";

const PROJECT_ID = "11111111-2222-3333-4444-555555555555";
const CONTRACT = {
  id: "c-1", description: "Grid works", contractType: CONTRACT_TYPE.Development, margin: false,
  isMarginStandardAssumption: false,
} as unknown as BopContract;
const TARGET = { id: "t-1", contractId: "c-1", description: "First", paymentDate: "01/2027", totalCostsContract: 50 };

interface State {
  contractsLoading: boolean;
  contractsError: unknown;
  /** Which mutation is pending, if any. */
  pending: "none" | "saveContract" | "deleteContract" | "saveTarget" | "deleteTarget";
}
let state: State;

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
  const query = (data: unknown, isLoading = false, error: unknown = null) => ({ data, isLoading, error });
  const mutation = (key: State["pending"]) => () => ({
    mutateAsync: vi.fn(async () => undefined), isPending: state.pending === key,
  });
  return {
    useContracts: () => query(state.contractsLoading ? undefined : [CONTRACT], state.contractsLoading, state.contractsError),
    usePaymentTargets: () => ({ byContract: new Map([["c-1", [TARGET]]]) }),
    useCapexAccounts: () => query([]),
    useDevCoCapexContracts: () => query([]),
    useDevCoLinks: () => query([]),
    useProjectExtras: () => query({}),
    useCapexCostRows: () => query([]),
    useAccountTree: () => [],
    useBopStandardAssumption: () => query(undefined),
    useSaveContract: mutation("saveContract"),
    useDeleteContract: mutation("deleteContract"),
    useSavePaymentTarget: mutation("saveTarget"),
    useDeletePaymentTarget: mutation("deleteTarget"),
  };
});

import ContractsScreen from "./Screen";

const COMMAND_KEYS = [
  "newDevContarct", "newConstructionContarct", "newProjecRightsContarct", "editContarct", "deleteContarct",
];
const command = (key: string) => screen.getByTestId(`command-${key}`);

function mount() {
  return render(
    <FluentProvider theme={vsbTheme}>
      <MemoryRouter initialEntries={[`/costs/contracts?projectId=${PROJECT_ID}`]}>
        <ContractsScreen />
      </MemoryRouter>
    </FluentProvider>,
  );
}

/** Selects the contract and opens its card, so the payment-target bar renders. */
function selectAndExpand() {
  fireEvent.click(screen.getByTestId("img_Contracts_List_CardHeaderRadioSelection-c-1"));
  fireEvent.click(screen.getByTestId("ico_Contracts_List_CardHeader_Down-c-1"));
}

beforeEach(() => {
  state = { contractsLoading: false, contractsError: null, pending: "none" };
});

describe("Contracts screen without spinners (D57)", () => {
  it("UT-CONTRACTS-NOSPIN-010 while loading: the command bar with every write command disabled, an empty body", () => {
    state.contractsLoading = true;
    mount();
    for (const key of COMMAND_KEYS) expect(command(key)).toBeDisabled();
    const body = screen.getByTestId("contracts-loading");
    expect(body.getAttribute("aria-busy")).toBe("true");
    expect(body.textContent).toBe("");
    expect(screen.queryByText("Loading contracts…")).toBeNull();
    expect(screen.queryByText("No contracts yet")).toBeNull();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("UT-CONTRACTS-NOSPIN-011 a failed read still renders the error state (rule 19)", () => {
    state.contractsError = new Error("403");
    mount();
    expect(screen.getByText("Cost data is unavailable")).toBeInTheDocument();
    expect(screen.queryByTestId("contracts-loading")).toBeNull();
  });

  it("UT-CONTRACTS-NOSPIN-012 idle: the write commands follow their own gates and there is no status line", () => {
    mount();
    selectAndExpand();
    for (const key of COMMAND_KEYS) expect(command(key)).not.toBeDisabled();
    expect(screen.getByTestId("contracts-add-target-c-1")).not.toBeDisabled();
    expect(screen.getByTestId("contracts-write-status")).toBeEmptyDOMElement();
  });

  it("UT-CONTRACTS-NOSPIN-013 a pending write: the fallback status line, no overlay, write commands disabled", () => {
    state.pending = "saveContract";
    mount();
    selectAndExpand();
    const status = screen.getByTestId("contracts-write-status");
    expect(status).toHaveTextContent(MSG.spinnerSavingContract);
    expect(status.getAttribute("role")).toBe("status");
    expect(screen.queryByRole("progressbar")).toBeNull();
    for (const key of COMMAND_KEYS) expect(command(key)).toBeDisabled();
    expect(screen.getByTestId("contracts-add-target-c-1")).toBeDisabled();
    expect(screen.getByTestId("contracts-edit-target-c-1")).toBeDisabled();
    expect(screen.getByTestId("contracts-delete-target-c-1")).toBeDisabled();
  });

  it("UT-CONTRACTS-NOSPIN-014 a pending write leaves the read-only actions usable", () => {
    state.pending = "deleteTarget";
    mount();
    const radio = screen.getByTestId("img_Contracts_List_CardHeaderRadioSelection-c-1");
    // The click really changes the selection mid-write: unchecked before, checked after.
    expect(radio).not.toBeChecked();
    expect(screen.queryByTestId("img_Contracts_List_Card_Body_PaymentTargetsRow_RadioSelection-t-1")).toBeNull();
    selectAndExpand();
    expect(radio).toBeChecked();
    // The card really opened, and its payment-target row can still be selected.
    const targetRadio = screen.getByTestId("img_Contracts_List_Card_Body_PaymentTargetsRow_RadioSelection-t-1");
    expect(targetRadio).not.toBeChecked();
    fireEvent.click(targetRadio);
    expect(targetRadio).toBeChecked();
    // …but Edit and Delete for it stay greyed out until the write settles.
    expect(screen.getByTestId("contracts-edit-target-c-1")).toBeDisabled();
  });

  it("UT-CONTRACTS-NOSPIN-015 every one of the four mutations disables the write commands", () => {
    for (const pending of ["saveContract", "deleteContract", "saveTarget", "deleteTarget"] as const) {
      state.pending = pending;
      const view = mount();
      for (const key of COMMAND_KEYS) expect(command(key)).toBeDisabled();
      expect(screen.getByTestId("contracts-write-status").textContent).not.toBe("");
      view.unmount();
    }
  });
});
