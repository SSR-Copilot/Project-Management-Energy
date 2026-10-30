// @vitest-environment jsdom
/**
 * UT-SHELL-NOSPIN — the app frame while the session loads (D58).
 *
 * On a Cost route (`/costs/*`) the blocking "Please wait..." overlay is skipped: the shell renders,
 * `CostProjectGate` holds an empty `cost-project-loading` placeholder, and no Cost screen mounts.
 * Every other route keeps the blocking overlay. Once loaded, the Cost subtree's lazy chunk waits
 * behind its own empty `cost-screen-loading` fallback, never the shared "Loading screen…" spinner.
 *
 * The session, the current user and the screens are mocked; what is under test is `App` and the
 * route gate, not the screens.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { FluentProvider } from "@fluentui/react-components";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DataMemoryRouter as MemoryRouter } from "@/test/DataMemoryRouter";
import { vsbTheme } from "@/theme/fluent";

const PROJECT_ID = "11111111-2222-3333-4444-555555555555";
const PROJECT = { projectId: PROJECT_ID, projectName: "Selected Project", projectIdCode: "P-1" };

let state: { loading: boolean; project?: typeof PROJECT; projectId?: string; error?: unknown };
const mounted = vi.fn();

vi.mock("@/app/SessionContext", () => ({
  useSession: () => ({ ...state, session: undefined, locale: "en-GB", envVars: {} }),
  useProject: () => state.project,
}));
vi.mock("@/app/useCurrentUser", () => ({
  useAdminAccess: () => false,
  useCurrentUser: () => ({ data: undefined }),
}));

/** A Cost screen double that records that it mounted (and so would have started its queries). */
function costScreen(name: string) {
  return { default: () => { mounted(name); return <h1>{name}</h1>; } };
}
vi.mock("@/features/cost/capex-costs/Screen", () => costScreen("CAPEX screen"));
vi.mock("@/features/cost/contracts/Screen", () => costScreen("Contracts screen"));
vi.mock("@/features/cost/opex-costs/Screen", () => costScreen("OPEX screen"));
vi.mock("@/features/cost/land-lease/Screen", () => costScreen("Land Lease screen"));
vi.mock("@/features/cost/add-costs-from-table/Screen", () => costScreen("Add Costs screen"));
vi.mock("@/features/pm/project-main/Screen", () => ({ default: () => <h1>Project Overview</h1> }));
vi.mock("@/features/pm/general-data/Screen", () => ({ default: () => <h1>General Data</h1> }));

import App from "./App";

function mount(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <FluentProvider theme={vsbTheme}>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[path]}><App /></MemoryRouter>
      </QueryClientProvider>
    </FluentProvider>,
  );
}

beforeEach(() => {
  state = { loading: true, projectId: PROJECT_ID };
  mounted.mockClear();
});

describe("App shell while the session loads (D58)", () => {
  it("UT-SHELL-NOSPIN-001 a Cost route shows the inline 'Loading project…' spinner (not the blocking overlay) and mounts no Cost screen", async () => {
    mount(`/costs/capex?projectId=${PROJECT_ID}`);
    const placeholder = await screen.findByTestId("cost-project-loading");
    expect(placeholder.getAttribute("aria-busy")).toBe("true");
    // D60: never a blank body while the session loads.
    expect(placeholder).toHaveTextContent("Loading project…");
    expect(placeholder.querySelector(".fui-Spinner")).not.toBeNull();
    // The shell's blocking overlay is still skipped on Cost routes (the rail stays visible).
    expect(screen.queryByText("Please wait...")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("heading", { name: "CAPEX screen" })).toBeNull();
    expect(mounted).not.toHaveBeenCalled();
  });

  it("UT-SHELL-NOSPIN-002 every Cost route holds its screen back the same way", async () => {
    for (const path of ["contracts", "opex/om", "land-lease", "add-from-table"]) {
      const view = mount(`/costs/${path}?projectId=${PROJECT_ID}`);
      await screen.findByTestId("cost-project-loading");
      expect(screen.queryByText("Please wait...")).toBeNull();
      view.unmount();
    }
    expect(mounted).not.toHaveBeenCalled();
  });

  it("UT-SHELL-NOSPIN-003 the project list keeps the blocking 'Please wait...' overlay", async () => {
    mount("/projects");
    expect(await screen.findByText("Please wait...")).toBeInTheDocument();
    expect(screen.queryByTestId("cost-project-loading")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Project Overview" })).toBeNull();
  });

  it("UT-SHELL-NOSPIN-004 a Project Management route keeps the blocking 'Please wait...' overlay", async () => {
    mount(`/project/general?projectId=${PROJECT_ID}`);
    expect(await screen.findByText("Please wait...")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "General Data" })).toBeNull();
  });

  it("UT-SHELL-NOSPIN-005 once the project is loaded the Cost screen mounts", async () => {
    state = { loading: false, projectId: PROJECT_ID, project: PROJECT };
    mount(`/costs/contracts?projectId=${PROJECT_ID}`);
    expect(await screen.findByRole("heading", { name: "Contracts screen" })).toBeInTheDocument();
    expect(screen.queryByTestId("cost-project-loading")).toBeNull();
    expect(screen.queryByText("Loading screen…")).toBeNull();
  });

  it("UT-SHELL-NOSPIN-007 a Cost screen's lazy chunk waits behind a 'Loading screen…' spinner, never a blank body", async () => {
    state = { loading: false, projectId: PROJECT_ID, project: PROJECT };
    mount(`/costs/land-lease?projectId=${PROJECT_ID}`);
    // The first render: the lazy import has not resolved yet.
    const fallback = screen.getByTestId("cost-screen-loading");
    expect(fallback.getAttribute("aria-busy")).toBe("true");
    expect(fallback).toHaveTextContent("Loading screen…");
    expect(fallback.querySelector(".fui-Spinner")).not.toBeNull();
    expect(await screen.findByRole("heading", { name: "Land Lease screen" })).toBeInTheDocument();
  });

  it("UT-SHELL-NOSPIN-006 a start-up error on a Cost route still renders the error state", async () => {
    state = { loading: false, projectId: PROJECT_ID, error: new Error("boom") };
    mount(`/costs/capex?projectId=${PROJECT_ID}`);
    expect(await screen.findByText("The app could not finish starting")).toBeInTheDocument();
    expect(mounted).not.toHaveBeenCalled();
  });
});
