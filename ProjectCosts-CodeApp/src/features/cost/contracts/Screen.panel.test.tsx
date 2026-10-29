// @vitest-environment jsdom
/**
 * UT-CONPANEL — the Add / Edit Contract panel's error display (D61, CA-23).
 *
 * A field shows its error only once the user has touched THAT field (edited it, or visited it and
 * left it). Before D61 one flag covered the whole panel, so the first edit anywhere, even ticking a
 * DevCo account, painted an error under every empty required field. The data hooks are mocked; what
 * is under test is the screen's wiring of "touched".
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { FluentProvider } from "@fluentui/react-components";
import { MemoryRouter } from "react-router-dom";
import { vsbTheme } from "@/theme/fluent";
import { CONTRACT_TYPE, RESX, type AccountNode, type BopContract } from "./rules";

const PROJECT_ID = "11111111-2222-3333-4444-555555555555";
const CONTRACT = {
  id: "c-1", description: "Grid works", contractType: CONTRACT_TYPE.Development, margin: false,
  isMarginStandardAssumption: false,
} as unknown as BopContract;

/** One level-1 account with two selectable leaves, so the DevCo picker has something to tick. */
const node = (over: Partial<AccountNode> & Pick<AccountNode, "id" | "level" | "number" | "name">): AccountNode => ({
  order: 1, childCount: 0, totalCost: 0, selected: false, used: false, ...over,
});
const BASE_TREE: AccountNode[] = [
  node({ id: "p1", level: 1, number: "81000", name: "Planning", childCount: 2 }),
  node({ id: "l1", level: 3, number: "81000_0_1", name: "Design works", parentId: "p1", totalCost: 100 }),
  node({ id: "l2", level: 3, number: "81000_0_2", name: "Permits", parentId: "p1", totalCost: 200 }),
];

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
  const query = (data: unknown) => ({ data, isLoading: false, error: null });
  const mutation = () => ({ mutateAsync: vi.fn(() => Promise.resolve()), isPending: false });
  // One array per selection, so the screen's memoised values keep their identity between renders.
  const trees = new Map<string, unknown>();
  return {
    useContracts: () => query([{
      id: "c-1", description: "Grid works", contractType: 1, margin: false, isMarginStandardAssumption: false,
    }]),
    usePaymentTargets: () => ({ byContract: new Map() }),
    useCapexAccounts: () => query([]),
    useDevCoCapexContracts: () => query([]),
    useDevCoLinks: () => query([]),
    useProjectExtras: () => query({}),
    useCapexCostRows: () => query([]),
    useAccountTree: (args: { selectedAccountIds: readonly string[] }) => {
      const key = args.selectedAccountIds.join(",");
      if (!trees.has(key)) {
        trees.set(key, (globalThis as { __BASE_TREE__?: AccountNode[] }).__BASE_TREE__!
          .map((n) => ({ ...n, selected: args.selectedAccountIds.includes(n.id) })));
      }
      return trees.get(key);
    },
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

beforeEach(() => {
  (globalThis as { __BASE_TREE__?: AccountNode[] }).__BASE_TREE__ = BASE_TREE;
});

function mount() {
  return render(
    <FluentProvider theme={vsbTheme}>
      <MemoryRouter initialEntries={[`/costs/contracts?projectId=${PROJECT_ID}`]}>
        <ContractsScreen />
      </MemoryRouter>
    </FluentProvider>,
  );
}

/** Every error message currently visible anywhere (the panel is portalled, so search the document). */
const shownErrors = () => [...document.querySelectorAll(".canvas-field-error")].map((e) => e.textContent ?? "");
const field = (testId: string) => screen.getByTestId(testId);
const type = (testId: string, value: string) => fireEvent.change(field(testId), { target: { value } });
const DESCRIPTION = "txt_Contracts_RightPanel_NewEdit_Description";

async function openNewDevelopmentContract() {
  mount();
  fireEvent.click(screen.getByTestId("command-newDevContarct"));
  await screen.findByTestId(DESCRIPTION);
}

/** Opens the single level-1 row and ticks (or unticks) the first leaf. */
function toggleFirstLeaf() {
  if (!screen.queryByTestId("chb_Contracts_RightPanel_NewEdit_CostssRow-l1")) {
    fireEvent.click(screen.getByTestId("btn_Contracts_RightPanel_NewEdit_DevCoCosts_TransparentButton-p1"));
  }
  fireEvent.click(screen.getByTestId("chb_Contracts_RightPanel_NewEdit_CostssRow-l1"));
}

describe("Add / Edit Contract panel: errors show only for touched fields (D61)", () => {
  it("UT-CONPANEL-001 a freshly opened panel shows no error at all, though every required field is empty", async () => {
    await openNewDevelopmentContract();
    expect(shownErrors()).toEqual([]);
    // The validation itself is unchanged: Save stays disabled.
    expect(screen.getByTestId("panel-save")).toBeDisabled();
  });

  it("UT-CONPANEL-002 ticking a DevCo account does not paint errors under the untouched required fields", async () => {
    await openNewDevelopmentContract();
    toggleFirstLeaf();
    await waitFor(() => expect(screen.getByTestId("chb_Contracts_RightPanel_NewEdit_CostssRow-l1")).toBeChecked());
    // Description and Closing Date are still blank and still unvisited: nothing about them shows.
    expect(shownErrors()).toEqual([]);
    expect(screen.getByTestId("panel-save")).toBeDisabled();
  });

  it("UT-CONPANEL-003 clearing a field the user typed in shows THAT field's error and no other", async () => {
    await openNewDevelopmentContract();
    type(DESCRIPTION, "Main works");
    expect(shownErrors()).toEqual([]);
    type(DESCRIPTION, "");
    expect(shownErrors()).toEqual([RESX.inputBlank]);
    // It sits under the Description field, not under Closing Date.
    const descriptionField = field(DESCRIPTION).closest(".canvas-field") as HTMLElement;
    expect(within(descriptionField).getByRole("alert")).toHaveTextContent(RESX.inputBlank);
  });

  it("UT-CONPANEL-004 visiting a required field and leaving it empty marks it touched", async () => {
    await openNewDevelopmentContract();
    fireEvent.focus(field(DESCRIPTION));
    expect(shownErrors()).toEqual([]);
    fireEvent.blur(field(DESCRIPTION));
    expect(shownErrors()).toEqual([RESX.inputBlank]);
  });

  it("UT-CONPANEL-005 a radio choice touches nothing: Overwrite shows its box without an error until it is used", async () => {
    await openNewDevelopmentContract();
    fireEvent.click(screen.getByRole("radio", { name: "Overwrite" }));
    const overwrite = await screen.findByTestId("txt_Contracts_RightPanel_NewEdit_TotalCosts_Overwrite");
    expect(shownErrors()).toEqual([]);
    fireEvent.change(overwrite, { target: { value: "abc" } });
    // Only the Overwrite box is flagged; Description (never visited) is not.
    expect(shownErrors()).toHaveLength(1);
    expect((overwrite.closest(".canvas-field") as HTMLElement).querySelector(".canvas-field-error")).not.toBeNull();
  });

  it("UT-CONPANEL-006 unticking the last DevCo account then shows the account error (the user touched it)", async () => {
    await openNewDevelopmentContract();
    toggleFirstLeaf();
    await waitFor(() => expect(screen.getByTestId("chb_Contracts_RightPanel_NewEdit_CostssRow-l1")).toBeChecked());
    expect(shownErrors()).toEqual([]);
    toggleFirstLeaf();
    await waitFor(() => expect(shownErrors()).toEqual([RESX.inputBlank]));
    const devCoField = screen.getByRole("group", { name: /DevCo/i }).closest(".canvas-field") as HTMLElement;
    expect(devCoField.querySelector(".canvas-field-error")).not.toBeNull();
  });

  it("UT-CONPANEL-007 flipping Margin to Yes does not show errors in the margin box it just revealed", async () => {
    await openNewDevelopmentContract();
    fireEvent.click(screen.getByRole("radio", { name: "Yes" }));
    const percent = await screen.findByTestId("txt_Contracts_RightPanel_NewEdit_MarginPercentage");
    expect(shownErrors()).toEqual([]);
    fireEvent.blur(percent);
    expect(shownErrors()).toEqual([RESX.inputBlank]);
  });

  it("UT-CONPANEL-008 closing and reopening the panel starts clean again", async () => {
    await openNewDevelopmentContract();
    type(DESCRIPTION, "x");
    type(DESCRIPTION, "");
    expect(shownErrors()).toEqual([RESX.inputBlank]);
    fireEvent.click(screen.getByTestId("panel-cancel"));
    await waitFor(() => expect(screen.queryByTestId(DESCRIPTION)).toBeNull());
    fireEvent.click(screen.getByTestId("command-newDevContarct"));
    await screen.findByTestId(DESCRIPTION);
    expect(shownErrors()).toEqual([]);
  });
});

describe("Add Period panel: the same rule (D61)", () => {
  async function openAddPeriod() {
    mount();
    fireEvent.click(screen.getByTestId("img_Contracts_List_CardHeaderRadioSelection-c-1"));
    fireEvent.click(screen.getByTestId("ico_Contracts_List_CardHeader_Down-c-1"));
    fireEvent.click(await screen.findByTestId("contracts-add-target-c-1"));
    await screen.findByTestId("txt_Contracts_RightPanel_NewEdit_PaymentTarget_Description");
  }

  it("UT-CONPANEL-009 opens with no error, and a bad payment date flags only the payment date", async () => {
    await openAddPeriod();
    expect(shownErrors()).toEqual([]);
    fireEvent.change(screen.getByTestId("txt_Contracts_RightPanel_NewEdit_PaymentTarget_PaymentDate"), {
      target: { value: "13/2026" },
    });
    const errs = shownErrors();
    expect(errs).toHaveLength(1);
    const dateField = screen.getByTestId("txt_Contracts_RightPanel_NewEdit_PaymentTarget_PaymentDate")
      .closest(".canvas-field") as HTMLElement;
    expect(dateField.querySelector(".canvas-field-error")).not.toBeNull();
  });

  it("UT-CONPANEL-010 leaving the empty percentage box flags it, and not the Description beside it", async () => {
    await openAddPeriod();
    fireEvent.blur(screen.getByTestId("txt_Contracts_Payment_Targets_RightPanel_TotalCosts"));
    expect(shownErrors()).toEqual([RESX.inputBlank]);
    const percentField = screen.getByTestId("txt_Contracts_Payment_Targets_RightPanel_TotalCosts")
      .closest(".canvas-field") as HTMLElement;
    expect(percentField.querySelector(".canvas-field-error")).not.toBeNull();
  });
});

// Keeps `CONTRACT` referenced for readers: the mocked `useContracts` returns the same shape.
void CONTRACT;
