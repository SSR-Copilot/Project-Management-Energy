// @vitest-environment jsdom
/**
 * Render tests for the Admin Project Default Checklists Screen with no rows loaded yet.
 *
 * `rules.test.ts` covers the rules (UT-ADCHK-0NN); `Screen.behaviour.test.tsx` covers the screen
 * with rows. This file covers the empty structure: the canvas captions, and that the gate-less
 * placeholder section offers no write command.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { FluentProvider } from "@fluentui/react-components";
import { MemoryRouter } from "react-router-dom";
import { vsbTheme } from "@/theme/fluent";
import { LABELS, MSG } from "./rules";
import AdminDefaultChecklistsScreen from "./Screen";

/*
 * Not used by the screen (master data, not project-scoped); mocked only because
 * `@/components` re-exports LeftNav, which imports the session module and, through it, the
 * generated services that need the absent `.power/` folder.
 */
vi.mock("@/app/SessionContext", () => ({
  useSession: () => ({ locale: "en-GB", loading: false }),
}));
vi.mock("@/app/useCurrentUser", () => ({ useAdminAccess: () => true }));
vi.mock("./hooks", () => {
  const ok = <T,>(data: T) => ({ data, isLoading: false, error: undefined, connected: true });
  return {
    TABLES: [],
    useChecklistScopes: () => ok([]),
    useChecklistGates: () => ok([]),
    useScopeTasks: () => ok([]),
    useBlockingApprovals: () => ok(new Set<string>()),
    useChecklistWrites: () => ({ run: async () => [], progress: null, error: null, success: null, clear: () => undefined }),
    highestTaskOrder: async () => null,
  };
});

function renderScreen() {
  return render(
    <FluentProvider theme={vsbTheme}>
      <MemoryRouter>
        <AdminDefaultChecklistsScreen />
      </MemoryRouter>
    </FluentProvider>,
  );
}

describe("AdminDefaultChecklistsScreen (no rows)", () => {
  it("UT-ADCHK-901 shows no not-connected notice now that the screen is connected", () => {
    renderScreen();
    expect(screen.queryByTestId("not-connected-notice")).toBeNull();
  });

  it("UT-ADCHK-902 renders the canvas page title", () => {
    renderScreen();
    expect(screen.getByRole("heading", { name: MSG.pageTitle })).toBeInTheDocument();
  });

  it("UT-ADCHK-903 renders the task grid's canvas column headers in order", () => {
    renderScreen();
    const table = screen.getByTestId("gal_TasksInClusterDefaultChecklist_AdminScreen");
    const headers = within(table).getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers.slice(0, 5)).toEqual([
      LABELS.colDescription, LABELS.colHoldingDescription, LABELS.colGateRelevance,
      LABELS.colCompletionDate, LABELS.colActive,
    ]);
  });

  it("UT-ADCHK-904 the placeholder section (no gate loaded) renders Add Task and Reorder disabled", () => {
    renderScreen();
    const add = screen.getByRole("button", { name: LABELS.addTask });
    const reorder = screen.getByRole("button", { name: LABELS.reorder });
    expect(add).toBeDisabled();
    expect(reorder).toBeDisabled();
    expect(add).toHaveAttribute("data-testid", "command-addNewChecklistEntity");
    expect(reorder).toHaveAttribute("data-testid", "command-reorderChecklist");
  });

  it("UT-ADCHK-905 shows no rows and no tabs while nothing is loaded", () => {
    renderScreen();
    const table = screen.getByTestId("gal_TasksInClusterDefaultChecklist_AdminScreen");
    expect(within(table).getAllByRole("row")).toHaveLength(1);
    expect(screen.queryAllByRole("tab")).toHaveLength(0);
  });
});
