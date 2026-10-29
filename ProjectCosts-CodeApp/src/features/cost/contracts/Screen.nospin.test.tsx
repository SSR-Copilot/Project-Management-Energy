// @vitest-environment jsdom
/**
 * UT-CONTRACTS-NOSPIN — the Contracts screen without spinners (D58).
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
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { FluentProvider } from "@fluentui/react-components";
import { MemoryRouter } from "react-router-dom";
import { vsbTheme } from "@/theme/fluent";
import { CONTRACT_TYPE, MSG, type BopContract } from "./rules";
import { COST_WRITE_MSG } from "@/domain/writeGuard";

const PROJECT_ID = "11111111-2222-3333-4444-555555555555";
const CONTRACT = {
  id: "c-1", description: "Grid works", contractType: CONTRACT_TYPE.Development, margin: false,
  isMarginStandardAssumption: false,
} as unknown as BopContract;
const TARGET = { id: "t-1", contractId: "c-1", description: "First", paymentDate: "01/2027", totalCostsContract: 50 };
/** A second card, for CA-17: picked while a delete of the first one runs. */
const CONTRACT_2 = {
  id: "c-2", description: "Substation", contractType: CONTRACT_TYPE.Construction, margin: false,
  isMarginStandardAssumption: false,
} as unknown as BopContract;

interface State {
  contractsLoading: boolean;
  contractsError: unknown;
  /** Which mutation is pending, if any. */
  pending: "none" | "saveContract" | "deleteContract" | "saveTarget" | "deleteTarget";
  /** The contract cards the screen lists. */
  contracts: BopContract[];
  /** CA-15 — the project-wide "a Cost write is in flight" flag. */
  writeInFlight: boolean;
  /** What every `mutateAsync` returns; a test holds it open to act mid-write. */
  gate: Promise<void> | null;
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
    mutateAsync: vi.fn(() => state.gate ?? Promise.resolve()), isPending: state.pending === key,
  });
  return {
    useContracts: () => query(state.contractsLoading ? undefined : state.contracts, state.contractsLoading, state.contractsError),
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

vi.mock("@/features/cost/costing/useCostWriteFlight", () => ({
  useCostWriteInFlight: () => state.writeInFlight,
  useWriteFailureReport: () => (text: string, show?: (t: string) => void) => { show?.(text); },
}));

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
  state = { contractsLoading: false, contractsError: null, pending: "none", contracts: [CONTRACT], writeInFlight: false, gate: null };
});

describe("Contracts screen without spinners (D58)", () => {
  it("UT-CONTRACTS-NOSPIN-010 while loading: the command bar with every write command disabled, the inline spinner body", () => {
    state.contractsLoading = true;
    mount();
    for (const key of COMMAND_KEYS) expect(command(key)).toBeDisabled();
    const body = screen.getByTestId("contracts-loading");
    expect(body.getAttribute("aria-busy")).toBe("true");
    expect(body.getAttribute("role")).toBe("status");
    expect(body.textContent).toBe("Loading contracts…");
    expect(body.querySelector(".fui-Spinner")).not.toBeNull();
    expect(screen.queryByText("No contracts yet")).toBeNull();
    // No write is running, so no blocking overlay.
    expect(screen.getByTestId("contracts-write-status").getAttribute("role")).toBe("status");
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

  it("UT-CONTRACTS-NOSPIN-013 a pending write: the fallback text on the blocking spinner, write commands disabled", () => {
    state.pending = "saveContract";
    mount();
    selectAndExpand();
    const status = screen.getByTestId("contracts-write-status");
    expect(status).toHaveTextContent(MSG.spinnerSavingContract);
    expect(status.getAttribute("role")).toBe("dialog");
    expect(status.getAttribute("aria-modal")).toBe("true");
    expect(status.querySelector(".fui-Spinner")).not.toBeNull();
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

describe("Contracts screen: the busy indicators (D60)", () => {
  /** Selects c-1, confirms Delete Contract with the write held open on `state.gate`. */
  async function startPendingDelete(gate: Promise<void>) {
    state.gate = gate;
    const view = mount();
    fireEvent.click(screen.getByTestId("img_Contracts_List_CardHeaderRadioSelection-c-1"));
    fireEvent.click(command("deleteContarct"));
    // The mutation turns pending as the confirmed delete starts.
    state.pending = "deleteContract";
    await act(async () => {
      fireEvent.click(within(screen.getByRole("alertdialog")).getByTestId("confirm-dialog-confirm"));
    });
    return view;
  }
  const expectBlocking = () => {
    const status = screen.getByTestId("contracts-write-status");
    expect(status.getAttribute("role")).toBe("dialog");
    expect(status).toHaveTextContent(MSG.spinnerDeletingContract);
    expect(status.querySelector(".fui-Spinner")).not.toBeNull();
  };
  const expectIdle = () => {
    const status = screen.getByTestId("contracts-write-status");
    expect(status.getAttribute("role")).toBe("status");
    expect(status.textContent).toBe("");
    expect(document.querySelector(".fui-Spinner")).toBeNull();
  };

  it("UT-CONTRACTS-BUSY-001 the blocking spinner stays up through other clicks and goes when the delete resolves", async () => {
    let finish: () => void = () => {};
    await startPendingDelete(new Promise<void>((r) => { finish = r; }));
    expectBlocking();
    fireEvent.click(screen.getByTestId("img_Contracts_List_CardHeaderRadioSelection-c-1"));
    fireEvent.click(screen.getByTestId("ico_Contracts_List_CardHeader_Down-c-1"));
    expectBlocking();
    state.pending = "none";
    await act(async () => { finish(); });
    expectIdle();
  });

  it("UT-CONTRACTS-BUSY-002 the blocking spinner also goes when the delete REJECTS, and the error banner shows", async () => {
    let fail: (e: Error) => void = () => {};
    await startPendingDelete(new Promise<void>((_r, reject) => { fail = reject; }));
    expectBlocking();
    state.pending = "none";
    await act(async () => { fail(new Error("HTTP 403")); });
    expectIdle();
    expect(screen.getByText("Could not complete that")).toBeInTheDocument();
  });

  it("UT-CONTRACTS-BUSY-003 while loading it never reads 'No contracts yet', and the list replaces the spinner after", () => {
    state.contractsLoading = true;
    state.contracts = [];
    const view = mount();
    expect(screen.getByTestId("contracts-loading").querySelector(".fui-Spinner")).not.toBeNull();
    expect(screen.queryByText("No contracts yet")).toBeNull();
    state.contractsLoading = false;
    view.rerender(
      <FluentProvider theme={vsbTheme}>
        <MemoryRouter initialEntries={[`/costs/contracts?projectId=${PROJECT_ID}`]}><ContractsScreen /></MemoryRouter>
      </FluentProvider>,
    );
    expect(screen.queryByTestId("contracts-loading")).toBeNull();
    expect(screen.getByText("No contracts yet")).toBeInTheDocument();
  });
});

describe("Contracts screen: CA-15 and CA-17", () => {
  it("UT-CONTRACTS-FLIGHT-001 a Cost write in flight from another screen greys every write command and says so", () => {
    state.writeInFlight = true;
    mount();
    selectAndExpand();
    for (const key of COMMAND_KEYS) expect(command(key)).toBeDisabled();
    expect(screen.getByTestId("contracts-add-target-c-1")).toBeDisabled();
    expect(screen.getByTestId("contracts-write-status")).toHaveTextContent(COST_WRITE_MSG.writeRunningElsewhere);
    // Selection stays usable.
    expect(screen.getByTestId("img_Contracts_List_CardHeaderRadioSelection-c-1")).toBeChecked();
  });

  /** Selects c-1, opens Delete Contract and confirms it, with every `mutateAsync` held open. */
  async function deleteFirstContract(): Promise<() => Promise<void>> {
    let finish: () => void = () => {};
    state.gate = new Promise<void>((r) => { finish = r; });
    fireEvent.click(screen.getByTestId("img_Contracts_List_CardHeaderRadioSelection-c-1"));
    fireEvent.click(command("deleteContarct"));
    const dialog = screen.getByRole("alertdialog");
    await act(async () => { fireEvent.click(within(dialog).getByTestId("confirm-dialog-confirm")); });
    return async () => { await act(async () => { finish(); }); };
  }

  it("UT-CONTRACTS-SEL-001 a card picked while the delete runs stays selected when it ends", async () => {
    state.contracts = [CONTRACT, CONTRACT_2];
    mount();
    const settle = await deleteFirstContract();
    fireEvent.click(screen.getByTestId("img_Contracts_List_CardHeaderRadioSelection-c-2"));
    await settle();
    expect(screen.getByTestId("img_Contracts_List_CardHeaderRadioSelection-c-2")).toBeChecked();
  });

  it("UT-CONTRACTS-SEL-002 the deleted card's own selection is still cleared, as before", async () => {
    state.contracts = [CONTRACT, CONTRACT_2];
    mount();
    const settle = await deleteFirstContract();
    await settle();
    expect(screen.getByTestId("img_Contracts_List_CardHeaderRadioSelection-c-1")).not.toBeChecked();
    expect(screen.getByTestId("img_Contracts_List_CardHeaderRadioSelection-c-2")).not.toBeChecked();
  });
});
