// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FluentProvider } from "@fluentui/react-components";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { SessionProvider, useSession } from "./SessionContext";
import { AppRoutes, CostProjectGate } from "./routes";
import { LeftNav } from "@/components/LeftNav";
import { vsbTheme } from "@/theme/fluent";
import { loadProject } from "@/data/project";
import { readSession } from "@/platform/powerClient";

vi.mock("@/platform/powerClient", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/platform/powerClient")>(),
  readSession: vi.fn(),
}));
vi.mock("@/data/project", () => ({
  loadEnvironmentVariables: vi.fn().mockResolvedValue({}),
  loadProject: vi.fn(),
}));
vi.mock("@/features/project-overview/Screen", () => ({ default: () => <h1>Project Overview</h1> }));
vi.mock("@/features/capex-costs/Screen", () => ({ default: () => <CostContent /> }));
vi.mock("@/features/contracts/Screen", () => ({ default: () => <CostContent /> }));

const PROJECT = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const OLD_PROJECT = "11111111-2222-3333-4444-555555555555";
const project = { projectId: PROJECT, projectName: "Selected Project", projectIdCode: "P-42" };

function CostContent() {
  const { project } = useSession();
  const location = useLocation();
  return <>
    <h1>{project?.projectName}</h1>
    <output data-testid="cost-location">{location.pathname}{location.search}</output>
    <LeftNav />
  </>;
}

function mount(path: string, useAppRoutes = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<FluentProvider theme={vsbTheme}>
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <SessionProvider>
          {useAppRoutes ? <AppRoutes /> : <Routes>
            <Route path="/projects" element={<h1>Project Overview</h1>} />
            <Route path="/costs" element={<CostProjectGate />}>
              <Route path="*" element={<CostContent />} />
            </Route>
          </Routes>}
        </SessionProvider>
      </MemoryRouter>
    </QueryClientProvider>
  </FluentProvider>);
}

describe("Cost tab project lifecycle", () => {
  beforeEach(() => {
    vi.mocked(readSession).mockReset().mockResolvedValue({
      appId: "same-app", environmentId: "env", launchParams: {},
    });
    vi.mocked(loadProject).mockReset().mockResolvedValue(project);
  });

  it("loads a deep-linked project in a fresh tab and reloads it after remount", async () => {
    const first = mount(`/costs/capex?projectId=${PROJECT}`);
    await screen.findByRole("heading", { name: "Selected Project" });
    expect(loadProject).toHaveBeenCalledWith(PROJECT);
    first.unmount();
    vi.mocked(loadProject).mockClear();
    mount(`/costs/contracts?projectId=${PROJECT}`);
    await screen.findByRole("heading", { name: "Selected Project" });
    expect(loadProject).toHaveBeenCalledWith(PROJECT);
    expect(screen.getByTestId("cost-location")).toHaveTextContent(`/costs/contracts?projectId=${PROJECT}`);
  });

  it("keeps projectId on every rail destination, including after a click", async () => {
    const user = userEvent.setup();
    mount(`/costs/capex?projectId=${PROJECT}`);
    await screen.findByRole("heading", { name: "Selected Project" });
    for (const link of screen.getAllByRole("link")) {
      expect(link.getAttribute("href")).toContain(`projectId=${PROJECT}`);
    }
    expect(screen.queryByRole("link", { name: "Projects" })).toBeNull();
    await user.click(screen.getByRole("link", { name: "Land Lease" }));
    expect(screen.getByTestId("cost-location")).toHaveTextContent(`/costs/land-lease?projectId=${PROJECT}`);
    expect(screen.getByRole("link", { name: "Land Lease" })).toHaveAttribute("aria-current", "page");
  });

  it("uses the chosen route project instead of a stale host launch", async () => {
    vi.mocked(readSession).mockResolvedValue({
      appId: "same-app", environmentId: "env", launchParams: { projectId: OLD_PROJECT },
    });
    mount(`/costs/capex?projectId=${PROJECT}`);
    await screen.findByRole("heading", { name: "Selected Project" });
    expect(loadProject).toHaveBeenCalledWith(PROJECT);
    expect(loadProject).not.toHaveBeenCalledWith(OLD_PROJECT);
  });

  it.each([
    ["", "Select a project to open Costs"],
    ["?projectId=invalid", "This project link is invalid"],
  ])("does not fetch Cost data for an unusable link %s", async (search, message) => {
    mount(`/costs/capex${search}`);
    await screen.findByText(message);
    expect(loadProject).not.toHaveBeenCalled();
    expect(screen.queryByRole("navigation", { name: "Cost sections" })).toBeNull();
  });

  it("offers a working return to the overview when the project is missing or unreadable", async () => {
    const user = userEvent.setup();
    vi.mocked(loadProject).mockResolvedValue(undefined);
    mount(`/costs/capex?projectId=${PROJECT}`);
    await screen.findByText("Project unavailable");
    await user.click(screen.getByRole("button", { name: "Back to Projects" }));
    await screen.findByRole("heading", { name: "Project Overview" });
  });

  it("keeps backend errors out of the UI and allows returning to Projects", async () => {
    const user = userEvent.setup();
    vi.mocked(loadProject).mockRejectedValue(new Error("Internal Dataverse exception"));
    mount(`/costs/capex?projectId=${PROJECT}`);
    await screen.findByText("The project could not be loaded");
    expect(screen.queryByText("Internal Dataverse exception")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Back to Projects" }));
    await screen.findByRole("heading", { name: "Project Overview" });
  });

  it("does not load a stale host project when the user is on the overview", async () => {
    vi.mocked(readSession).mockResolvedValue({
      appId: "same-app", environmentId: "env", launchParams: { projectId: OLD_PROJECT },
    });
    mount("/projects");
    await waitFor(() => expect(readSession).toHaveBeenCalled());
    expect(loadProject).not.toHaveBeenCalled();
  });

  it("starts on Project Overview when no project was supplied", async () => {
    mount("/", true);
    await screen.findByRole("heading", { name: "Project Overview" });
    expect(loadProject).not.toHaveBeenCalled();
  });

  it("boots the requested Cost route from player query parameters when no hash was forwarded", async () => {
    vi.mocked(readSession).mockResolvedValue({
      appId: "same-app", environmentId: "env",
      launchParams: { projectId: PROJECT, costScreen: "/costs/contracts" },
    });
    mount("/", true);
    await screen.findByRole("heading", { name: "Selected Project" });
    expect(screen.getByTestId("cost-location")).toHaveTextContent(`/costs/contracts?projectId=${PROJECT}`);
  });
});
