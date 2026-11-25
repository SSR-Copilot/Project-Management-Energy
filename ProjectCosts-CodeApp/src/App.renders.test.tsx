// @vitest-environment jsdom
/**
 * D162 B1 — the shell's own re-renders (FE-SH-02, FE-SH-06, FE-SH-08). Same doubles as `App.test.tsx`; own ids (UT-SHELLRENDER-).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { FluentProvider } from "@fluentui/react-components";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DataMemoryRouter as MemoryRouter } from "@/test/DataMemoryRouter";
import { vsbTheme } from "@/theme/fluent";
import { clearTraces, trace } from "@/platform/telemetry";
import { countRenders, type RenderCounts } from "@/test/renderCounts";
import { CommandSlot, CommandSlotProvider } from "@/components/CommandSlot";

const state = { loading: false, projectId: undefined as string | undefined };
// Stable, as the real session's are: a new `envVars` per call would refresh the report's snapshot and hide FE-SH-08.
const ENV_VARS = {};
vi.mock("@/app/SessionContext", () => ({
  useSession: () => ({ ...state, session: undefined, locale: "en-GB", envVars: ENV_VARS }),
  useProject: () => undefined,
}));
vi.mock("@/app/useCurrentUser", () => ({
  useAdminAccess: () => false,
  useCurrentUser: () => ({ data: undefined }),
}));
/* UT-SHELLRENDER-006: the screen can trace while it renders, as `QueryStates` does through `userErrorText`. */
const screenFlags = vi.hoisted(() => ({ traceInRender: false }));
vi.mock("@/features/pm/project-main/Screen", async () => {
  const { trace: traceNow } = await import("@/platform/telemetry");
  return { default: () => {
    if (screenFlags.traceInRender) traceNow("error", "load the gate approvals failed", undefined, true);
    return <h1>Project Overview</h1>;
  } };
});

import App from "./App";

const mount = () => render(
  <FluentProvider theme={vsbTheme}>
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}>
      <MemoryRouter initialEntries={["/projects"]}><App /></MemoryRouter>
    </QueryClientProvider>
  </FluentProvider>,
);

let renders: RenderCounts;
beforeEach(() => {
  clearTraces();
  renders = countRenders();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  renders.stop();
  clearTraces();
  vi.restoreAllMocks();
});

describe("shell re-renders (D162 B1)", () => {
  it("UT-SHELLRENDER-001 a traced error shows the header icon at once (FE-SH-08)", async () => {
    mount();
    await screen.findByRole("heading", { name: "Project Overview" });
    expect(screen.queryByTestId("header-error")).toBeNull();
    await act(async () => { trace("error", "Save failed: 403", undefined, true); });
    expect(screen.getByTestId("header-error")).toBeTruthy();
  });

  it("UT-SHELLRENDER-002 opening and closing the report panel does not re-render the routes (FE-SH-02)", async () => {
    mount();
    await screen.findByRole("heading", { name: "Project Overview" });
    await act(async () => { trace("error", "Save failed: 403", undefined, true); });
    renders.reset();
    fireEvent.click(screen.getByTestId("header-error"));
    expect(await screen.findByText(/Save failed: 403/)).toBeTruthy();
    expect(renders.of("AppRoutes")).toBe(0);
  });

  it("UT-SHELLRENDER-003 the report holds the error traced after the app loaded (FE-SH-08)", async () => {
    mount();
    await screen.findByRole("heading", { name: "Project Overview" });
    await act(async () => { trace("error", "first", undefined, true); });
    await act(async () => { trace("critical", "the one the user saw", undefined, true); });
    fireEvent.click(screen.getByTestId("header-error"));
    expect(await screen.findByText(/Last error:\s+\[critical\] the one the user saw/)).toBeTruthy();
  });

  it("UT-SHELLRENDER-004 with the slot already in place the command bar mounts once, in the slot (FE-SH-06)", () => {
    const slot = document.createElement("div");
    document.body.appendChild(slot);
    let mounts = 0;
    function Bar() {
      useEffect(() => { mounts += 1; }, []);
      return <span data-testid="bar">bar</span>;
    }
    render(<CommandSlotProvider element={slot}><CommandSlot><Bar /></CommandSlot></CommandSlotProvider>);
    expect(mounts).toBe(1);
    expect(slot.querySelector("[data-testid='bar']")).not.toBeNull();
    slot.remove();
  });

  it("UT-SHELLRENDER-005 without a slot it still renders in place (a screen never loses its bar)", () => {
    render(<CommandSlotProvider element={null}><CommandSlot><span data-testid="bar2">bar</span></CommandSlot></CommandSlotProvider>);
    expect(screen.getByTestId("bar2")).toBeTruthy();
  });
});

describe("the error icon and a trace during another component's render (D162 review)", () => {
  afterEach(() => { screenFlags.traceInRender = false; });

  it("UT-SHELLRENDER-006 a screen that traces while it renders causes no cross-component update warning", async () => {
    const errors = vi.mocked(console.error);
    screenFlags.traceInRender = true;
    mount();
    await screen.findByRole("heading", { name: "Project Overview" });
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByTestId("header-error")).toBeTruthy();
    expect(errors.mock.calls.map((c) => String(c[0])).join(" | ")).not.toMatch(/Cannot update a component/);
  });
});
