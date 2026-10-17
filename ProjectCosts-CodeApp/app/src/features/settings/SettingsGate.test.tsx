// @vitest-environment jsdom
/**
 * The Application Settings route gate: loading → access, loading → denial, and a role-read
 * failure → a Retry state (not the denial text) — 05-gap-analysis M2.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FluentProvider } from "@fluentui/react-components";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const OBJECT_ID = "11111111-1111-1111-1111-111111111111";
const sessionState: { entraObjectId: string | undefined } = { entraObjectId: OBJECT_ID };
vi.mock("@/app/SessionContext", () => ({
  useSession: () => ({ session: { entraObjectId: sessionState.entraObjectId } }),
}));
const loadCurrentUser = vi.fn();
vi.mock("@/data/currentUser", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/data/currentUser")>()),
  loadCurrentUser: (...args: unknown[]) => loadCurrentUser(...args),
}));

import { vsbTheme } from "@/theme/fluent";
import { ROLES_UNREADABLE_TITLE, SettingsGate } from "./SettingsGate";

const user = (over: Record<string, unknown>) => ({
  editableCountries: [], isProjectDataAllCountries: false,
  isApplicationAdministrator: false, isControllerOwnData: false, rolesResolved: true, ...over,
});

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <FluentProvider theme={vsbTheme}>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/settings/costs"]}>
          <Routes>
            <Route path="/projects" element={<h1>Project Overview</h1>} />
            <Route path="/settings" element={<SettingsGate />}>
              <Route path="costs" element={<h1>Costs settings</h1>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </FluentProvider>,
  );
}

beforeEach(() => {
  loadCurrentUser.mockReset();
  sessionState.entraObjectId = OBJECT_ID;
});

describe("SettingsGate", () => {
  it("UT-GATE-001 loading, then access for an Application Administrator", async () => {
    loadCurrentUser.mockResolvedValue(user({ isApplicationAdministrator: true }));
    mount();
    expect(screen.getByText("Checking access…")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Costs settings" })).toBeInTheDocument();
  });

  it("UT-GATE-002 loading, then the denial for a user whose roles were read and are not admin", async () => {
    loadCurrentUser.mockResolvedValue(user({}));
    mount();
    expect(await screen.findByText("Application Settings are not available")).toBeInTheDocument();
    expect(screen.queryByText(ROLES_UNREADABLE_TITLE)).toBeNull();
  });

  it("UT-GATE-003 a role-read failure offers Retry, not the denial, and Retry re-reads", async () => {
    const u = userEvent.setup();
    loadCurrentUser.mockResolvedValueOnce(user({ rolesResolved: false }));
    mount();
    expect(await screen.findByText(ROLES_UNREADABLE_TITLE)).toBeInTheDocument();
    expect(screen.queryByText("Application Settings are not available")).toBeNull();

    loadCurrentUser.mockResolvedValueOnce(user({ isControllerOwnData: true }));
    await u.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("heading", { name: "Costs settings" })).toBeInTheDocument();
    expect(loadCurrentUser).toHaveBeenCalledTimes(2);
  });

  it("UT-GATE-004 an admin role that WAS read gets in even if another role read failed", async () => {
    loadCurrentUser.mockResolvedValue(user({ isApplicationAdministrator: true, rolesResolved: false }));
    mount();
    expect(await screen.findByRole("heading", { name: "Costs settings" })).toBeInTheDocument();
  });

  it("UT-GATE-005 Back to Projects leaves the retry state", async () => {
    const u = userEvent.setup();
    loadCurrentUser.mockResolvedValue(user({ rolesResolved: false }));
    mount();
    await screen.findByText(ROLES_UNREADABLE_TITLE);
    await u.click(screen.getByRole("button", { name: "Back to Projects" }));
    expect(await screen.findByRole("heading", { name: "Project Overview" })).toBeInTheDocument();
  });

  it("UT-GATE-006 (G-3, NG-3) no user object id in the session: roles-unreadable, no Retry, not the denial", async () => {
    const u = userEvent.setup();
    sessionState.entraObjectId = undefined;
    mount();
    expect(await screen.findByText(ROLES_UNREADABLE_TITLE)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
    expect(screen.getByText(/reopen the app/)).toBeInTheDocument();
    expect(screen.queryByText("Application Settings are not available")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Costs settings" })).toBeNull();
    expect(loadCurrentUser).not.toHaveBeenCalled();
    await u.click(screen.getByRole("button", { name: "Back to Projects" }));
    expect(await screen.findByRole("heading", { name: "Project Overview" })).toBeInTheDocument();
  });

  it("UT-GATE-007 (NG-3) a real read failure with an object id keeps Retry", async () => {
    loadCurrentUser.mockRejectedValue(new Error("read failed"));
    mount();
    expect(await screen.findByText(ROLES_UNREADABLE_TITLE)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.queryByText(/reopen the app/)).toBeNull();
  });
});
