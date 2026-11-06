// @vitest-environment jsdom
/**
 * UT-CONTR — the Contracts screen's Canvas-parity wiring of test run 3 (FT-BR-CONTR-xxx).
 *
 * The data hooks are mocked (as `Screen.panel.test.tsx` does); what is under test is how the screen
 * wires the pure rules in `rules.ts`: the period bar's gates, the selection clicks, the Add Period
 * description, Cancel, the Dirty flag, and what a save leaves behind.
 */
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FluentProvider } from "@fluentui/react-components";
import { MemoryRouter } from "react-router-dom";
import { vsbTheme } from "@/theme/fluent";
import {
  CLOSING_DATE_TYPE, CONTRACT_TYPE, MARGIN_TYPE, TOTAL_COSTS_TYPE,
  type AccountNode, type BopContract, type PaymentTarget,
} from "./rules";

const PROJECT_ID = "11111111-2222-3333-4444-555555555555";

interface Data {
  contracts: BopContract[];
  targets: PaymentTarget[];
  links: { id: string; accountId: string; contractId: string }[];
  saveTarget: Mock<(...args: unknown[]) => Promise<unknown>>;
  saveContract: Mock<(...args: unknown[]) => Promise<unknown>>;
}
const data = (): Data => (globalThis as { __D__?: Data }).__D__!;

const node = (over: Partial<AccountNode> & Pick<AccountNode, "id" | "level" | "number" | "name">): AccountNode => ({
  order: 1, childCount: 0, totalCost: 0, selected: false, used: false, ...over,
});
const TREE: AccountNode[] = [
  node({ id: "p1", level: 1, number: "81000", name: "Planning", childCount: 1 }),
  node({ id: "l1", level: 3, number: "81000_0_1", name: "Design works", parentId: "p1", totalCost: 100 }),
];

vi.mock("@/app/SessionContext", () => {
  const session = {
    projectId: "11111111-2222-3333-4444-555555555555",
    project: { projectId: "11111111-2222-3333-4444-555555555555", projectIdCode: "P-1", projectName: "P" },
    projectNotFound: false,
    locale: "en-US",
  };
  return { useSession: () => session };
});

vi.mock("@/platform/privileges", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/platform/privileges")>()),
  serverEnforcedProvider: { forTable: () => ({ canCreate: true, canWrite: true, canDelete: true }) },
}));

vi.mock("./hooks", () => {
  const query = (d: unknown) => ({ data: d, isLoading: false, error: null });
  const trees = new Map<string, unknown>();
  return {
    useContracts: () => query((globalThis as { __D__?: Data }).__D__!.contracts),
    usePaymentTargets: () => {
      const byContract = new Map<string, PaymentTarget[]>();
      for (const t of (globalThis as { __D__?: Data }).__D__!.targets) {
        byContract.set(t.contractId, [...(byContract.get(t.contractId) ?? []), t]);
      }
      return { byContract };
    },
    useCapexAccounts: () => query([]),
    useDevCoCapexContracts: () => query([]),
    useDevCoLinks: () => query((globalThis as { __D__?: Data }).__D__!.links),
    useProjectExtras: () => query({}),
    useCapexCostRows: () => query([]),
    useAccountTree: (args: { selectedAccountIds: readonly string[] }) => {
      const key = args.selectedAccountIds.join(",");
      if (!trees.has(key)) {
        trees.set(key, (globalThis as { __TREE__?: AccountNode[] }).__TREE__!
          .map((n) => ({ ...n, selected: args.selectedAccountIds.includes(n.id) })));
      }
      return trees.get(key);
    },
    useBopStandardAssumption: () => query(undefined),
    useSaveContract: () => ({
      mutateAsync: (...a: unknown[]) => (globalThis as { __D__?: Data }).__D__!.saveContract(...a),
      isPending: false,
    }),
    useDeleteContract: () => ({ mutateAsync: vi.fn(() => Promise.resolve()), isPending: false }),
    useSavePaymentTarget: () => ({
      mutateAsync: (...a: unknown[]) => (globalThis as { __D__?: Data }).__D__!.saveTarget(...a),
      isPending: false,
    }),
    useDeletePaymentTarget: () => ({ mutateAsync: vi.fn(() => Promise.resolve()), isPending: false }),
  };
});

vi.mock("@/features/cost/costing/useCostWriteFlight", () => ({
  useCostWriteInFlight: () => false,
  useWriteFailureReport: () => (text: string, show?: (t: string) => void) => { show?.(text); },
}));

import ContractsScreen from "./Screen";

const DEV = {
  id: "c-1", description: "Grid works", contractType: CONTRACT_TYPE.Development,
  closingDate: new Date(2026, 5, 15),
  costsUntilClosingType: CLOSING_DATE_TYPE.Plan, costsUntilClosingPlan: 1235,
  costsAfterClosingType: CLOSING_DATE_TYPE.Plan, costsAfterClosingPlan: 10,
  totalCostsType: TOTAL_COSTS_TYPE.Calculated, totalCostsCalculated: 1245,
  margin: true, marginType: MARGIN_TYPE.Percentage, marginPercentage: 2.5,
  totalCostOfContract: 112500.5, isStandardContract: false, isMarginStandardAssumption: false,
} as unknown as BopContract;

const RIGHTS = {
  id: "c-2", description: "Land rights", contractType: CONTRACT_TYPE.ProjectRights,
  closingDate: new Date(2026, 5, 15), margin: false, totalCostOfContract: 5000,
  isStandardContract: false, isMarginStandardAssumption: false,
} as unknown as BopContract;

const tgt = (id: string, pct: number, createdOn: string, description: string): PaymentTarget => ({
  id, contractId: "c-1", totalCostsContract: pct, createdOn, description, paymentDate: "01/2030",
});

beforeEach(() => {
  (globalThis as { __TREE__?: AccountNode[] }).__TREE__ = TREE;
  (globalThis as { __D__?: Data }).__D__ = {
    contracts: [{ ...DEV }],
    targets: [],
    links: [{ id: "k1", accountId: "l1", contractId: "c-1" }],
    saveTarget: vi.fn(() => Promise.resolve()),
    saveContract: vi.fn((arg: unknown) =>
      Promise.resolve({ id: (arg as { write: { id?: string } }).write.id ?? "c-1" })),
  };
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
const byId = (id: string) => screen.getByTestId(id);
const select = (contractId: string) => fireEvent.click(byId(`img_Contracts_List_CardHeaderRadioSelection-${contractId}`));
const header = (contractId: string) => fireEvent.click(byId(`btn_Contracts_List_CardHeader_TransparentButton-${contractId}`));
const expand = (contractId: string) => fireEvent.click(byId(`ico_Contracts_List_CardHeader_Down-${contractId}`));
const row = (id: string) => byId(`btn_Contracts_List_Card_Body_PaymentTargetsRow_TransparentButton-${id}`);

describe("card figures (CONTR-016/020/021/022/023/024/028)", () => {
  it("UT-CONTR-100 the header button carries the title as its tooltip (CONTR-016)", () => {
    mount();
    expect(byId("btn_Contracts_List_CardHeader_TransparentButton-c-1")).toHaveAttribute("title", "Development Contract - Grid works");
  });

  it("UT-CONTR-101 the card figures use '###,##0' and one decimal for the margin (CONTR-020/021/022/024)", () => {
    (data().contracts[0] as { isMarginStandardAssumption: boolean }).isMarginStandardAssumption = true;
    mount();
    expand("c-1");
    expect(byId("txt_Contracts_List_Card_Body_Fields_CostsUntilClosing")).toHaveValue("1,235");
    expect(byId("txt_Contracts_List_Card_Body_Fields_CostsAfterClosing")).toHaveValue("10");
    expect(byId("txt_Contracts_List_Card_Body_Fields_TotalCosts")).toHaveValue("1,245");
    expect(byId("txt_Contracts_List_Card_Body_Fields_Margins")).toHaveValue("2.5");
    expect(byId("txt_Contracts_List_Card_Body_Fields_TotalDevContract")).toHaveValue("112,501");
  });

  it("UT-CONTR-102 the Margin shows 0.0 when Margin is No, whatever is stored (CONTR-022)", () => {
    (data().contracts[0] as { margin: boolean }).margin = false;
    mount();
    expand("c-1");
    expect(byId("txt_Contracts_List_Card_Body_Fields_Margins")).toHaveValue("0.0");
  });

  it("UT-CONTR-103 a plain margin carries no standard style (CONTR-023)", () => {
    mount();
    expand("c-1");
    expect(byId("txt_Contracts_List_Card_Body_Fields_Margins").className)
      .toBe(byId("txt_Contracts_List_Card_Body_Fields_CostsAfterClosing").className);
  });

  it("UT-CONTR-104 a standard margin differs in class from a plain one (CONTR-023)", () => {
    (data().contracts[0] as { isMarginStandardAssumption: boolean }).isMarginStandardAssumption = true;
    mount();
    expand("c-1");
    expect(byId("txt_Contracts_List_Card_Body_Fields_Margins").className)
      .not.toBe(byId("txt_Contracts_List_Card_Body_Fields_CostsAfterClosing").className);
  });

  it("UT-CONTR-105 a payment target row shows one decimal and the note as a tooltip (CONTR-028)", () => {
    data().targets = [{ ...tgt("t-1", 30, "2026-01-01", "Advance"), note: "Paid on site" }];
    mount();
    expand("c-1");
    expect(row("t-1")).toHaveTextContent("30.0");
    expect(row("t-1").querySelector("td[title]")).toHaveAttribute("title", "Paid on site");
  });
});

describe("the period bar and the selection (CONTR-017/029/030/031/032/046)", () => {
  beforeEach(() => {
    data().targets = [tgt("t-1", 60, "2026-01-01", "Advance")];
  });

  it("UT-CONTR-110 Add Period is disabled until the card's contract is selected (CONTR-030)", () => {
    mount();
    expand("c-1");
    expect(byId("contracts-add-target-c-1")).toBeDisabled();
    select("c-1");
    expect(byId("contracts-add-target-c-1")).toBeEnabled();
  });

  it("UT-CONTR-111 Add Period is disabled once the targets total 100 (CONTR-031)", () => {
    data().targets = [tgt("t-1", 60, "2026-01-01", "Advance"), tgt("t-2", 40, "2026-02-01", "Advance - 2")];
    mount();
    expand("c-1");
    select("c-1");
    expect(byId("contracts-add-target-c-1")).toBeDisabled();
  });

  it("UT-CONTR-112 a target row selects its contract and enables Edit and Delete; a second click clears it (CONTR-029/032)", () => {
    mount();
    expand("c-1");
    expect(byId("contracts-edit-target-c-1")).toBeDisabled();
    fireEvent.click(row("t-1"));
    expect(byId("img_Contracts_List_CardHeaderRadioSelection-c-1")).toBeChecked();
    expect(byId("contracts-edit-target-c-1")).toBeEnabled();
    expect(byId("contracts-delete-target-c-1")).toBeEnabled();
    fireEvent.click(row("t-1"));
    expect(byId("contracts-edit-target-c-1")).toBeDisabled();
    // The contract stays selected.
    expect(byId("img_Contracts_List_CardHeaderRadioSelection-c-1")).toBeChecked();
  });

  it("UT-CONTR-113 a header click clears the selected target (CONTR-017/032)", () => {
    mount();
    expand("c-1");
    fireEvent.click(row("t-1"));
    expect(byId("contracts-edit-target-c-1")).toBeEnabled();
    header("c-1"); // the same contract: deselects it and clears the target
    expect(byId("contracts-edit-target-c-1")).toBeDisabled();
    header("c-1"); // selects it again, with no target
    expect(byId("img_Contracts_List_CardHeaderRadioSelection-c-1")).toBeChecked();
    expect(byId("contracts-edit-target-c-1")).toBeDisabled();
  });

  it("UT-CONTR-114 clicking the checked radio deselects the contract (CONTR-017)", () => {
    mount();
    select("c-1");
    expect(byId("img_Contracts_List_CardHeaderRadioSelection-c-1")).toBeChecked();
    select("c-1");
    expect(byId("img_Contracts_List_CardHeaderRadioSelection-c-1")).not.toBeChecked();
  });

  it("UT-CONTR-115 Cancel on the period panel clears the selected target (CONTR-046)", async () => {
    mount();
    expand("c-1");
    fireEvent.click(row("t-1"));
    fireEvent.click(byId("contracts-edit-target-c-1"));
    await screen.findByTestId("txt_Contracts_RightPanel_NewEdit_PaymentTarget_Description");
    fireEvent.click(byId("panel-cancel"));
    await waitFor(() => expect(screen.queryByTestId("txt_Contracts_RightPanel_NewEdit_PaymentTarget_Description")).toBeNull());
    expect(byId("contracts-edit-target-c-1")).toBeDisabled();
  });
});

describe("Add / Edit Period (CONTR-033/034/035/044)", () => {
  const DESCRIPTION = "txt_Contracts_RightPanel_NewEdit_PaymentTarget_Description";

  it("UT-CONTR-120 Add Period opens with the newest period numbered on, locked (CONTR-033)", async () => {
    data().targets = [tgt("t-1", 30, "2026-01-01", "Advance"), tgt("t-2", 30, "2026-02-01", "Advance - 2")];
    mount();
    expand("c-1");
    select("c-1");
    fireEvent.click(byId("contracts-add-target-c-1"));
    const box = await screen.findByTestId(DESCRIPTION);
    expect(box).toHaveValue("Advance - 3");
    expect(box).toBeDisabled();
    expect(box).toHaveAttribute("maxlength", "55");
  });

  it("UT-CONTR-121 the first period of a contract has an empty, editable Description (CONTR-033)", async () => {
    mount();
    expand("c-1");
    select("c-1");
    fireEvent.click(byId("contracts-add-target-c-1"));
    const box = await screen.findByTestId(DESCRIPTION);
    expect(box).toHaveValue("");
    expect(box).toBeEnabled();
  });

  it("UT-CONTR-122 Edit Period keeps the Description disabled (CONTR-034)", async () => {
    data().targets = [tgt("t-1", 30, "2026-01-01", "Advance")];
    mount();
    expand("c-1");
    fireEvent.click(row("t-1"));
    fireEvent.click(byId("contracts-edit-target-c-1"));
    const box = await screen.findByTestId(DESCRIPTION);
    expect(box).toHaveValue("Advance");
    expect(box).toBeDisabled();
  });

  it("UT-CONTR-123 a failed period save names the payment target (CONTR-044)", async () => {
    data().targets = [tgt("t-1", 30, "2026-01-01", "Advance")];
    data().saveTarget = vi.fn(() => Promise.reject(new Error("boom")));
    mount();
    expand("c-1");
    select("c-1");
    fireEvent.click(byId("contracts-add-target-c-1"));
    await screen.findByTestId(DESCRIPTION);
    fireEvent.change(byId("txt_Contracts_RightPanel_NewEdit_PaymentTarget_PaymentDate"), { target: { value: "02/2030" } });
    fireEvent.change(byId("txt_Contracts_Payment_Targets_RightPanel_TotalCosts"), { target: { value: "10" } });
    fireEvent.click(byId("panel-save"));
    expect(await screen.findByText("Error: BoP Contract payment target could not be saved correctly.")).toBeInTheDocument();
  });
});

describe("Edit Contract panel (CONTR-054/055/056/076/077/078/079/082)", () => {
  async function openEdit(contractId = "c-1") {
    mount();
    select(contractId);
    fireEvent.click(byId("command-editContarct"));
    await screen.findByTestId("panel-save");
  }

  it("UT-CONTR-130 Save stays disabled on an untouched Edit and a Comment change enables it (CONTR-077)", async () => {
    await openEdit();
    expect(byId("panel-save")).toBeDisabled();
    fireEvent.change(byId("contract-comment"), { target: { value: "note" } });
    expect(byId("panel-save")).toBeEnabled();
  });

  it("UT-CONTR-131 a Description change enables Save too (CONTR-077)", async () => {
    await openEdit();
    fireEvent.change(byId("txt_Contracts_RightPanel_NewEdit_Description"), { target: { value: "Grid works 2" } });
    expect(byId("panel-save")).toBeEnabled();
  });

  it("UT-CONTR-132 the Comment counter counts the trimmed text (CONTR-078)", async () => {
    await openEdit();
    fireEvent.change(byId("contract-comment"), { target: { value: "  abc  " } });
    expect(byId("contract-comment").closest("label")).toHaveTextContent("3/255");
  });

  it("UT-CONTR-133 the margin boxes take the standard style from 'Is Standard Contract', not the stored margin flag (CONTR-055)", async () => {
    (data().contracts[0] as { isStandardContract: boolean }).isStandardContract = true;
    await openEdit();
    const standard = byId("txt_Contracts_RightPanel_NewEdit_MarginPercentage").className;
    fireEvent.change(byId("txt_Contracts_RightPanel_NewEdit_MarginPercentage"), { target: { value: "3" } });
    // Editing the value clears the flag (`OnChange: locIsStandardAssumtions: false`).
    expect(byId("txt_Contracts_RightPanel_NewEdit_MarginPercentage").className).not.toBe(standard);
  });

  it("UT-CONTR-134 flipping Margin zeroes both boxes (CONTR-076/054)", async () => {
    await openEdit();
    fireEvent.click(screen.getByRole("radio", { name: "No" }));
    fireEvent.click(screen.getByRole("radio", { name: "Yes" }));
    expect(byId("txt_Contracts_RightPanel_NewEdit_MarginPercentage")).toHaveValue("0");
    fireEvent.click(screen.getByRole("radio", { name: "Fixed Value" }));
    expect(byId("txt_Contracts_RightPanel_NewEdit_MarginFixedValues")).toHaveValue("0");
  });

  it("UT-CONTR-135 the contract total shows the RoundUp figure (CONTR-075)", async () => {
    await openEdit();
    // 1,245 calculated at 2.5 % margin: 1,276.125 -> 1,277.
    expect(byId("txt_Contracts_RightPanel_NewEdit_TotalCosts_Contract")).toHaveValue("1,277");
  });

  it("UT-CONTR-137 an invalid Plan figure shows its message under the read-only Plan box (CONTR-069)", async () => {
    (data().contracts[0] as { costsUntilClosingPlan: number }).costsUntilClosingPlan = 2_000_000_000;
    await openEdit();
    const plan = byId("txt_Contracts_RightPanel_NewEdit_CostsUntilClosingDate_Plan");
    expect(plan).toBeDisabled();
    expect(plan.closest("label")).toHaveTextContent("Please select a value between 0 and 1,000,000,000");
  });

  it("UT-CONTR-136 after a save the card stands open and the contract is deselected (CONTR-079/082)", async () => {
    await openEdit();
    fireEvent.change(byId("contract-comment"), { target: { value: "note" } });
    fireEvent.click(byId("panel-save"));
    await waitFor(() => expect(data().saveContract).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId("ico_Contracts_List_CardHeader_Up-c-1")).toBeInTheDocument());
    expect(byId("img_Contracts_List_CardHeaderRadioSelection-c-1")).not.toBeChecked();
  });
});

describe("Project Rights panel (CONTR-056/079/090/091)", () => {
  beforeEach(() => {
    data().contracts = [{ ...DEV }, { ...RIGHTS }];
  });

  it("UT-CONTR-140 Edit opens with the total read from 'Total cost of contract' and Save enabled (CONTR-056)", async () => {
    mount();
    select("c-2");
    fireEvent.click(byId("command-editContarct"));
    const total = await screen.findByTestId("txt_Contracts_RightPanel_NewEdit_RightsContract_Content_TotalCosts");
    expect(total).toHaveValue("5000");
    expect(byId("panel-save")).toBeEnabled();
  });

  it("UT-CONTR-141 a negative or large total is accepted, a decimal one is not (CONTR-090)", async () => {
    mount();
    select("c-2");
    fireEvent.click(byId("command-editContarct"));
    const total = await screen.findByTestId("txt_Contracts_RightPanel_NewEdit_RightsContract_Content_TotalCosts");
    fireEvent.change(total, { target: { value: "20000000" } });
    expect(byId("panel-save")).toBeEnabled();
    fireEvent.change(total, { target: { value: "-1" } });
    expect(byId("panel-save")).toBeEnabled();
    fireEvent.change(total, { target: { value: "1.5" } });
    expect(byId("panel-save")).toBeDisabled();
  });

  it("UT-CONTR-142 the Save writes the canvas name and the typed total, and keeps an edited rights contract selected (CONTR-079/091)", async () => {
    mount();
    select("c-2");
    fireEvent.click(byId("command-editContarct"));
    const total = await screen.findByTestId("txt_Contracts_RightPanel_NewEdit_RightsContract_Content_TotalCosts");
    fireEvent.change(total, { target: { value: "7000" } });
    fireEvent.click(byId("panel-save"));
    await waitFor(() => expect(data().saveContract).toHaveBeenCalledTimes(1));
    const arg = data().saveContract.mock.calls[0]![0] as { write: { name: string; totalCostOfContract: number } };
    expect(arg.write.name).toBe("BoP RC-P-1-");
    expect(arg.write.totalCostOfContract).toBe(7000);
    await waitFor(() => expect(screen.getByTestId("ico_Contracts_List_CardHeader_Up-c-2")).toBeInTheDocument());
    expect(byId("img_Contracts_List_CardHeaderRadioSelection-c-2")).toBeChecked();
  });

  it("UT-CONTR-143 the rights card total uses '###,###' (CONTR-024)", () => {
    mount();
    expand("c-2");
    expect(byId("txt_Contracts_List_Card_Body_Fields_TotalCosts_RC")).toHaveValue("5,000");
  });
});
