// @vitest-environment jsdom
/**
 * Render smoke tests for the Contracts screen.
 *
 * These exist to catch the class of failure that type-checking cannot: a conditional hook, a
 * Griffel shorthand that throws at runtime, a Fluent component used with the wrong props.
 * The canvas app had no equivalent safety net at all — a broken `Visible` formula simply
 * rendered nothing.
 *
 * `@microsoft/power-apps` is mocked because `getContext()` needs a Power Platform host; what
 * is under test here is the component tree, not the SDK.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { FluentProvider } from "@fluentui/react-components";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";

vi.mock("@microsoft/power-apps/app", () => ({
  setConfig: vi.fn(),
  getContext: vi.fn().mockResolvedValue({
    app: {
      appId: "app", environmentId: "env", appSettings: {},
      queryParams: {}, dataverseOrgUrl: undefined, appUrl: undefined,
    },
    host: { sessionId: "s" },
    user: {
      fullName: "Demo User", objectId: "11111111-1111-1111-1111-111111111111",
      tenantId: "tenant", userPrincipalName: "demo.user@vsb.energy",
    },
  }),
}));

vi.mock("@microsoft/power-apps/data", () => ({
  getClient: () => ({
    retrieveMultipleRecordsAsync: vi.fn().mockResolvedValue({ success: true, data: [] }),
    retrieveRecordAsync: vi.fn().mockResolvedValue({ success: true, data: {} }),
    createRecordAsync: vi.fn(),
    updateRecordAsync: vi.fn(),
    deleteRecordAsync: vi.fn(),
    executeAsync: vi.fn(),
  }),
}));

import { vsbTheme } from "@/theme/fluent";
import { SessionProvider } from "@/app/SessionContext";
import ContractsScreen from "./Screen";

function Harness({ children, search = "" }: { children: ReactNode; search?: string }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return (
    <FluentProvider theme={vsbTheme}>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[`/costs/contracts${search}`]}>
          <SessionProvider>{children}</SessionProvider>
        </MemoryRouter>
      </QueryClientProvider>
    </FluentProvider>
  );
}

describe("ContractsScreen", () => {
  beforeEach(() => vi.clearAllMocks());

  it("UT-CONUI-001 sends you to the project list when the deep link carries no projectId", async () => {
    // The canvas app substituted a hard-coded test project here (docs/01-BUGS-FOUND.md A-2),
    // so this state is new and must actually render.
    render(<Harness><ContractsScreen /></Harness>);
    expect(await screen.findByText("No project selected")).toBeInTheDocument();
  });

  it("UT-CONUI-002 ignores a projectId that is not a GUID", async () => {
    // readProjectId validates before use; a junk value must not reach a $filter.
    render(<Harness search="?projectId=1%20or%201%20eq%201"><ContractsScreen /></Harness>);
    expect(await screen.findByText("No project selected")).toBeInTheDocument();
  });

  it("UT-CONUI-003 renders without a Griffel or hook-order failure", async () => {
    // A conditional hook surfaces as React #185 at runtime and as nothing at build time.
    const errors: unknown[] = [];
    const spy = vi.spyOn(console, "error").mockImplementation((...args) => { errors.push(args); });
    render(<Harness><ContractsScreen /></Harness>);
    await screen.findByText("No project selected");
    spy.mockRestore();
    expect(errors).toEqual([]);
  });
});
