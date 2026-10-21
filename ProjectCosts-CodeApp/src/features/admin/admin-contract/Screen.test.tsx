// @vitest-environment jsdom
/**
 * Render and behaviour tests for the connected Admin Contract screen, with `hooks.ts` mocked by
 * fixed rows (no Dataverse). `rules.test.ts` covers the rules; this file covers the composition:
 * canvas captions and test ids, and the write job handed to `run`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FluentProvider } from "@fluentui/react-components";
import { MemoryRouter } from "react-router-dom";
import { vsbTheme } from "@/theme/fluent";
import { CONTRACT_SCREEN_TEXT as T, MSG } from "./rules";
import AdminContractScreen from "./Screen";

vi.mock("@/app/SessionContext", () => ({
  useSession: () => ({ locale: "en-GB", loading: false }),
}));
vi.mock("@/app/useCurrentUser", () => ({ useAdminAccess: () => true }));

const run = vi.fn(async () => ["new-contract"]);

vi.mock("./hooks", () => {
  const ok = <V,>(data: V) => ({ data, isLoading: false, error: undefined, connected: true });
  const a = (id: string, number: string, name: string, parentId: string | null, order = 1) =>
    ({ id, number, name, parentId, order, status: 0, owningBusinessUnitId: null });
  return {
    TABLES: [],
    useContractCountries: () => ok([
      { id: "fr", name: "France", isoCurrencyCode: "EUR" },
      { id: "de", name: "Germany", isoCurrencyCode: "EUR" },
      { id: "es", name: "Spain", isoCurrencyCode: "EUR" },
    ]),
    useContractAccountTree: () => ok([
      a("root", "00001", "Root", null),
      a("cat1", "10000", "Development Expenses", "root", 1),
      a("acc1", "10001", "Grid", "cat1"),
      a("s1", "10001_01", "Cabling", "acc1", 1),
      a("s2", "10001_02", "Transformer", "acc1", 2),
    ]),
    useBopContracts: () => ok([{
      id: "c1", name: "Development Contract - BoP", description: "BoP", countryId: "de",
      technology: 952850000, contractType: 952850001, closingDateReference: 952850001,
      monthDifference: -3, margin: true, marginType: 952850001, marginPercentage: null,
      marginFixedValue: 1500, comment: null,
    }]),
    useDevCoCosts: () => ok([{ id: "dc1", contractId: "c1", capexAccountId: "s1", rootAccountId: "cat1" }]),
    useContractWrites: () => ({ run, progress: null, error: null, success: null, clear: () => undefined }),
  };
});

function renderScreen() {
  return render(
    <FluentProvider theme={vsbTheme}>
      <MemoryRouter>
        <AdminContractScreen />
      </MemoryRouter>
    </FluentProvider>,
  );
}

type Job = { progress: string; plan: { writes: { op: string; entitySet: string; id?: string; data?: Record<string, unknown> }[] } };
const lastJob = (): Job => (run.mock.calls.at(-1) as unknown as [Job])[0];

beforeEach(() => run.mockClear());

describe("Admin Contract screen (connected)", () => {
  it("UT-ADCONTR-901 renders the title, the rail without Spain, the Germany / Wind scope and no notice", () => {
    renderScreen();
    expect(screen.getByText(T.title)).toBeTruthy();
    expect(screen.queryByTestId("not-connected-notice")).toBeNull();
    expect(screen.getByTestId("lbl_AdminContract_Selected_Country_Technology").textContent)
      .toBe("Contracts / Germany / Wind");
    expect(screen.queryByRole("button", { name: "Spain" })).toBeNull();
    const rail = screen.getByTestId("cmp_AdminContraacts_NestedCountryPickerColumn");
    expect(within(rail).getByRole("button", { name: "BESS" })).toBeTruthy();
  });

  it("UT-ADCONTR-902 the Add buttons carry the canvas ids; Apply is not rendered (D20)", () => {
    renderScreen();
    expect((screen.getByTestId("btn_AdminContract_Add_Development_Contract") as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByTestId("btn_AdminContract_Add_Construction_Contract") as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByTestId("btn_AdminContract_ApplyAll")).toBeNull();
    expect(screen.queryByText("Apply to All")).toBeNull();
  });

  it("UT-ADCONTR-903 a card opens with its grids, ISO-currency heading and DevCo groups", async () => {
    renderScreen();
    expect(screen.getAllByTestId("con_Card_Root")).toHaveLength(1);
    await userEvent.click(screen.getByTestId("ico_Chevron_Expand_Collapse_AdminContracrs"));
    expect(screen.getByText("FID - 3 months")).toBeTruthy();
    expect(screen.getByText("Margin Fixed Value [EUR]")).toBeTruthy();
    expect(screen.getByText("1500")).toBeTruthy();
    expect(screen.getByText("Development Expenses :")).toBeTruthy();
    expect(screen.getByText("Cabling")).toBeTruthy();
    expect(screen.queryByTestId("btn_Apply_Individual_AdminContracts")).toBeNull();
  });

  it("UT-ADCONTR-904 Delete confirms with the canvas text and deletes the contract only", async () => {
    renderScreen();
    await userEvent.click(screen.getByTestId("ico_Chevron_Expand_Collapse_AdminContracrs"));
    await userEvent.click(screen.getByTestId("btn_Delete_AdminContracts"));
    expect(await screen.findByText('Are you sure that you want to permanently delete "Development Contract - BoP" contract?')).toBeTruthy();
    await userEvent.click(await screen.findByRole("button", { name: T.confirm, hidden: true }, { timeout: 10_000 }));
    await waitFor(() => expect(run).toHaveBeenCalled());
    const job = lastJob();
    expect(job.progress).toBe(MSG.deleting);
    expect(job.plan.writes.map((w) => `${w.op} ${w.id}`)).toEqual(["delete c1"]);
  });

  it("UT-ADCONTR-905 a new Development contract: Cluster 4 default, used account locked, one create plan", async () => {
    renderScreen();
    await userEvent.click(screen.getByTestId("btn_AdminContract_Add_Development_Contract"));
    expect(await screen.findByText("New Development Contract")).toBeTruthy();
    expect(screen.getByTestId("ico_Add_Edit_AdminContracts_Close")).toBeTruthy();
    const cluster4 = screen.getByTestId("rad_Contracts_RightPanel_NewEdit_CostsUntilClosingDate-cluster-4") as HTMLInputElement;
    expect(cluster4.checked).toBe(true);

    await userEvent.type(screen.getByTestId("txt_Add_Edit_AdminContracts_Description"), "Roads");
    await userEvent.type(screen.getByTestId("txt_Add_Edit_AdminContracts_MonthDifference_Month"), "4");
    await userEvent.click(screen.getByTestId("btn_Add_Edit_AdminContract_Right_Panel_DevCoCostForm_Transparent-cat1"));
    const rows = await screen.findAllByTestId("chb_Contracts_RightPanel_NewEdit_CostssRow");
    const used = rows.find((r) => r.getAttribute("value") === "s1") as HTMLInputElement;
    const free = rows.find((r) => r.getAttribute("value") === "s2") as HTMLInputElement;
    expect(used.checked).toBe(true);
    expect(used.disabled).toBe(true);
    await userEvent.click(free);

    const save = screen.getByTestId("ico_AdminContracts_Save") as HTMLButtonElement;
    await waitFor(() => expect(save.disabled).toBe(false));
    await userEvent.click(save);
    await waitFor(() => expect(run).toHaveBeenCalled());
    const job = lastJob();
    expect(job.progress).toBe(MSG.saving);
    expect(job.plan.writes.map((w) => w.op)).toEqual(["create", "create"]);
    expect(job.plan.writes[0]!.data).toMatchObject({
      vsb_name: "Development Contract - Roads", vsb_contracttypes: 952850001,
      vsb_closingdatereference: 952850000, vsb_monthdifference: 4,
    });
    expect(job.plan.writes[1]!.data).toMatchObject({ vsb_name: "10001_02-Transformer" });
  });
});
