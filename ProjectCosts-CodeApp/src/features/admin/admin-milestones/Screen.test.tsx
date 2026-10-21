// @vitest-environment jsdom
/**
 * Render and behaviour tests for the Admin Milestones Screen, with `hooks.ts` mocked by fixed
 * rows (no Dataverse). Apply / Apply All are out of scope (D20) and must not render.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FluentProvider } from "@fluentui/react-components";
import { MemoryRouter } from "react-router-dom";
import { vsbTheme } from "@/theme/fluent";
import { MILESTONE_SCREEN_TEXT as T } from "./rules";
import AdminMilestonesScreen from "./Screen";

vi.mock("@/app/SessionContext", () => ({
  useSession: () => ({ project: undefined, projectId: undefined, locale: "en-GB", loading: false }),
}));
vi.mock("@/app/useCurrentUser", () => ({ useAdminAccess: () => true }));

const run = vi.fn(async () => []);

vi.mock("./hooks", () => {
  const ok = <V,>(data: V) => ({ data, isLoading: false, error: undefined, connected: true });
  return {
    TABLES: [],
    useMilestoneCountries: () => ok([{ id: "de", name: "Germany", order: 1, key: 1 }]),
    useCountryAssumptions: (id: string | null) => ok(id ? [
      { id: "d-wind", name: "average duration [months]", technology: 952850000, countryId: "de",
        values: { vsb_cluster1: 6, vsb_cluster2: 9, vsb_cluster3: 12, vsb_cluster4: 15 } },
      { id: "s-wind", name: "success rate [-]", technology: 952850000, countryId: "de",
        values: { vsb_cluster1: 0.8, vsb_cluster2: 0.7, vsb_cluster3: 0.6, vsb_cluster4: 0.5 } },
    ] : []),
    useMilestoneWrites: () => ({ run, progress: null, error: null, success: null, clear: () => undefined }),
  };
});

function renderScreen() {
  return render(
    <FluentProvider theme={vsbTheme}>
      <MemoryRouter>
        <AdminMilestonesScreen />
      </MemoryRouter>
    </FluentProvider>,
  );
}

beforeEach(() => run.mockClear());

describe("Admin Milestones screen", () => {
  it("UT-ADMILE-901 renders the heading and the country card, with no Apply / Apply All (D20)", () => {
    renderScreen();
    expect(screen.getByRole("heading", { name: T.title })).toBeTruthy();
    expect(screen.getByTestId("lbl_ClusterName_MilestonesStandardAssumptions_AdminScreen")).toHaveTextContent("Germany");
    expect(screen.queryByText("Apply All")).toBeNull();
    expect(screen.queryByText("Apply")).toBeNull();
    expect(screen.queryByTestId("not-connected-notice")).toBeNull();
  });

  it("UT-ADMILE-902 the grid shows the canvas cell text (FID 0.75 / 1, Cluster 5 / 1, dashes)", async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(screen.getByTestId("ico_Down_MilestonesStandardAssumptions_AdminScreen"));
    const grid = screen.getByTestId("gal_MilestonesStandardAssumptions_AdminScreen");
    const cells = within(grid).getAllByRole("cell").map((c) => c.textContent);
    expect(cells[0]).toBe("Wind");
    expect(cells.slice(2)).toEqual([
      "6\n0.8", "9\n0.7", "12\n0.6", "15\n0.5", "0.75\n1", "\n1", "-\n-", "-\n-", "-\n-",
    ]);
  });

  it("UT-ADMILE-903 the editor uses the canvas input names, pre-fills 0 and saves only the changed column", async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(screen.getByTestId("ico_Down_MilestonesStandardAssumptions_AdminScreen"));
    await user.click(screen.getByTestId("command-editCountryMilestoneAssumtions"));
    const fid = await screen.findByTestId("txt_Admin_MilestoneAssumption_Form_Fields_Durations_FID_Input", {}, { timeout: 5000 });
    expect(fid).toHaveValue("0");
    expect(fid).toHaveAttribute("maxlength", "256");
    const c2 = screen.getAllByTestId("txt_Admin_MilestoneAssumption_Form_Fields_Durations_Cluster2_Input")[0]!;
    await user.clear(c2);
    await user.type(c2, "10");
    await user.click(screen.getByTestId("pcf_but_Admin_MilestoneAssumption_Form_Buttons_Save"));
    expect(run).toHaveBeenCalledTimes(1);
    const job = (run.mock.calls[0] as unknown as [{ progress: string; plan: { writes: { id: string; data: unknown }[] } }])[0];
    expect(job.progress).toBe("Milestone Standard Assumptions for 'Germany' will be saved, please wait...");
    expect(job.plan.writes).toEqual([expect.objectContaining({ id: "d-wind", data: { vsb_cluster2: 10 } })]);
  });

  it("UT-ADMILE-904 an invalid duration shows the canvas message and blocks Save", async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(screen.getByTestId("ico_Down_MilestonesStandardAssumptions_AdminScreen"));
    await user.click(screen.getByTestId("command-editCountryMilestoneAssumtions"));
    const c1 = (await screen.findAllByTestId("txt_Admin_MilestoneAssumption_Form_Fields_Durations_Cluster1_Input", {}, { timeout: 5000 }))[0]!;
    await user.clear(c1);
    await user.type(c1, "1.5");
    expect(screen.getByTestId("lbl_Admin_MilestoneAssumption_Form_Fields_Durations_InvalidMessage"))
      .toHaveTextContent("Enter a positive value without decimals");
    expect(screen.getByTestId("pcf_but_Admin_MilestoneAssumption_Form_Buttons_Save")).toBeDisabled();
  });
});
