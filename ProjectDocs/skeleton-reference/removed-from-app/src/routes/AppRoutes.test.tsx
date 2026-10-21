// @vitest-environment jsdom
/**
 * UT-ROUTES — the Administration and Project Management screens ported from
 * `VSBCloud-Code-App-Skeleton` are reachable through THIS app's router and mount without
 * tripping the error boundary.
 *
 * Runs in test mode, where `@/platform/skeleton/powerClient` selects the in-memory backend
 * (`@/data/mock`), so every screen reads the seeded fixture rather than Dataverse.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { FluentProvider } from "@fluentui/react-components";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { vsbTheme } from "@/theme/fluent";
import { useAppStore } from "@/store/appStore";
import { projectFullRepo } from "@/data/repos";
import { toSelectedProject } from "@/features/shared/useProjectContext";
import { AdminRoutes, ProjectManagementRoutes } from "./AppRoutes";

const ADMIN = [
  "default-checklists", "gates-approvals", "capex-accounts", "milestones", "cost", "contract",
];
const PROJECT = [
  "general", "milestones", "generators", "production", "checklist", "team", "planning",
  "grid-operator", "revenues", "finance",
];

function renderAt(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <FluentProvider theme={vsbTheme}>
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/admin/*" element={<AdminRoutes />} />
            <Route path="/project/*" element={<ProjectManagementRoutes />} />
            <Route path="/projects" element={<h1>Project Overview</h1>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </FluentProvider>,
  );
}

/**
 * Mounted = bootstrap finished, the right rail is drawn, the lazy screen resolved, the guards
 * passed, and no error boundary fallback. (The first render is always "Signing you in…" —
 * bootstrap is async even against the mock backend — so the wait below is never vacuous.)
 */
async function expectMounted(railItem: string) {
  await waitFor(() => {
    expect(screen.queryByText("Signing you in…")).toBeNull();
    expect(screen.queryByText("Loading screen…")).toBeNull();
    expect(screen.queryAllByText(railItem).length).toBeGreaterThan(0);
  }, { timeout: 15_000 });
  expect(screen.queryByText("This screen could not be displayed")).toBeNull();
  expect(screen.queryByText("Administration is not available to your account")).toBeNull();
  expect(screen.queryByText("No project selected")).toBeNull();
}

describe("UT-ROUTES — Administration (/admin/*)", () => {
  ADMIN.forEach((slug, i) => {
    it(`UT-ROUTES-${String(i + 1).padStart(3, "0")} /admin/${slug} mounts`, async () => {
      renderAt(`/admin/${slug}`);
      await expectMounted("Check List Settings");
    }, 30_000);
  });

  it("UT-ROUTES-007 an unknown admin path falls back to Check List Settings", async () => {
    renderAt("/admin/nope");
    await expectMounted("Check List Settings");
  }, 30_000);
});

describe("UT-ROUTES — Project Management (/project/*)", () => {
  beforeAll(async () => {
    const [row] = (await projectFullRepo.list({ top: 1 })).rows;
    useAppStore.getState().selectProject(toSelectedProject(row!));
  });

  PROJECT.forEach((slug, i) => {
    it(`UT-ROUTES-${String(i + 8).padStart(3, "0")} /project/${slug} mounts`, async () => {
      renderAt(`/project/${slug}`);
      await expectMounted("Grid Operator");
    }, 30_000);
  });

  it("UT-ROUTES-018 without a selected project a project screen asks for one", async () => {
    useAppStore.getState().clearProject();
    renderAt("/project/milestones");
    expect(await screen.findByText("No project selected", {}, { timeout: 15_000 })).toBeTruthy();
  }, 30_000);
});
