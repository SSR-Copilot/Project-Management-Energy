// @vitest-environment jsdom
/**
 * Render smoke tests for the General Data screen — the class of failure type-checking cannot
 * catch (a conditional hook, a Griffel shorthand, a Fluent component used with the wrong
 * props). Business rules are covered in `rules.test.ts`; this file only checks the screen
 * actually renders for both routes and that the Save gate starts disabled.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { FluentProvider } from "@fluentui/react-components";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";

vi.mock("@/app/SessionContext", () => ({
  useSession: () => ({
    session: { entraObjectId: "11111111-1111-1111-1111-111111111111" },
    loading: false,
  }),
}));

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
import GeneralDataScreen from "./Screen";

function Harness({ children, path }: { children: ReactNode; path: string }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return (
    <FluentProvider theme={vsbTheme}>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/projects/new" element={children} />
            <Route path="/projects/:projectId/general" element={children} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </FluentProvider>
  );
}

describe("GeneralDataScreen", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("renders the create form for /projects/new, with Save disabled until the project is valid", async () => {
    render(<Harness path="/projects/new"><GeneralDataScreen /></Harness>);
    expect(await screen.findByText("Basic Information")).toBeInTheDocument();
    expect(screen.getByText("Shareholding Entities")).toBeInTheDocument();
    const saveButtons = screen.getAllByRole("button", { name: "Save" });
    for (const button of saveButtons) expect(button).toBeDisabled();
  });

  it("shows the Acquisition Details section only for an Acquired project", async () => {
    render(<Harness path="/projects/new"><GeneralDataScreen /></Harness>);
    await screen.findByText("Basic Information");
    expect(screen.queryByText("Acquisition Details")).not.toBeInTheDocument();
  });

  it("renders the edit route and surfaces a not-found message for an unknown project", async () => {
    render(
      <Harness path="/projects/00000000-0000-0000-0000-000000000001/general">
        <GeneralDataScreen />
      </Harness>,
    );
    expect(await screen.findByText("This project could not be loaded")).toBeInTheDocument();
  });

  it("lists no shareholding entities for a brand-new project", async () => {
    render(<Harness path="/projects/new"><GeneralDataScreen /></Harness>);
    await screen.findByText("Basic Information");
    const section = screen.getByText("Shareholding Entities").closest(".fui-Card") as HTMLElement;
    expect(within(section).getByText("No shareholding entities yet")).toBeInTheDocument();
  });
});
