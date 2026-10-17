// @vitest-environment jsdom
/**
 * The app frame on settings routes: the header way out (G7) and the page title (05-gap-analysis M1),
 * without changing the cost screens.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FluentProvider } from "@fluentui/react-components";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";

vi.mock("@/app/SessionContext", () => ({
  useSession: () => ({
    session: { entraObjectId: "11111111-1111-1111-1111-111111111111", fullName: "Ada" },
    project: { projectId: "p1", projectName: "Selected Project", approvalState: "Draft" },
    envVars: {}, loading: false, error: undefined,
  }),
}));
vi.mock("@/app/routes", () => ({ AppRoutes: () => <Where /> }));
vi.mock("@/features/report-problem/ReportProblemPanel", () => ({ ReportProblemPanel: () => null }));
const roles = { isApplicationAdministrator: true };
vi.mock("@/data/currentUser", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/data/currentUser")>()),
  loadCurrentUser: vi.fn(async () => ({
    editableCountries: [], isProjectDataAllCountries: false,
    isApplicationAdministrator: roles.isApplicationAdministrator, isControllerOwnData: false, rolesResolved: true,
  })),
}));

function Where() {
  return <output data-testid="location">{useLocation().pathname}</output>;
}

import { vsbTheme } from "@/theme/fluent";
import { HOME_LABEL } from "@/components";
import App from "./App";

function mount(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const view = render(
    <FluentProvider theme={vsbTheme}>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[path]}>
          <App />
        </MemoryRouter>
      </QueryClientProvider>
    </FluentProvider>,
  );
  return { ...view, client };
}

beforeEach(() => {
  document.title = "Project Costs";
  roles.isApplicationAdministrator = true;
});

describe("App frame on Application Settings routes", () => {
  it("UT-APP-001 /settings/costs: page title, no approval bar, logo and back arrow lead to /projects", async () => {
    const user = userEvent.setup();
    const { container, unmount } = mount("/settings/costs");
    // G-2: the title and rail wait until the user is known to be allowed.
    expect(await screen.findByRole("heading", { level: 1, name: "Costs" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Application settings sections" })).toBeInTheDocument();
    expect(container.querySelector(".canvas-project-state")).toBeNull();
    expect(document.title).toBe("Costs · Application Settings");

    const home = screen.getAllByRole("button", { name: HOME_LABEL });
    expect(home).toHaveLength(2);
    await user.click(home[0]!);
    expect(screen.getByTestId("location")).toHaveTextContent("/projects");
    // Left the settings area: the tab title comes back and the way-out buttons go.
    expect(document.title).toBe("Project Costs");
    expect(screen.queryByRole("button", { name: HOME_LABEL })).toBeNull();
    unmount();
  });

  it("UT-APP-002 each settings screen gets its own title", async () => {
    mount("/settings/checklists");
    expect(await screen.findByRole("heading", { level: 1, name: "Checklist settings" })).toBeInTheDocument();
  });

  it("UT-APP-004 (G-2) a non-admin on a settings URL sees no settings rail and no settings title", async () => {
    roles.isApplicationAdministrator = false;
    const { client } = mount("/settings/costs");
    // Wait until the current-user query has settled (an admin would have the title by now).
    await waitFor(() => expect(client.getQueryCache().getAll().some((q) => q.state.status === "success")).toBe(true));
    expect(screen.queryByRole("navigation", { name: "Application settings sections" })).toBeNull();
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    expect(document.title).toBe("Project Costs");
    // The way out stays.
    expect(screen.getAllByRole("button", { name: HOME_LABEL })).toHaveLength(2);
  });

  it("UT-APP-003 cost screens are unchanged: project name with its approval bar, plain logo", () => {
    const { container } = mount("/costs/capex");
    expect(screen.getByText("Selected Project")).toBeInTheDocument();
    expect(container.querySelector(".canvas-project-state")).not.toBeNull();
    expect(screen.queryByRole("button", { name: HOME_LABEL })).toBeNull();
    expect(document.title).toBe("Project Costs");
  });
});
