// @vitest-environment jsdom
/**
 * The environment variables no longer hold the first paint (D119): `loading` follows
 * the session (and the project), not the two environment-variable reads, unless the switch is back on.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { startupFlags } from "./startupFlags";

const env = vi.hoisted(() => ({ release: undefined as undefined | ((v: Record<string, string>) => void) }));

vi.mock("@/platform/powerClient", async (original) => ({
  ...(await original<typeof import("@/platform/powerClient")>()),
  readSession: vi.fn(async () => ({ environmentId: "e", appId: "a", launchParams: {} })),
}));
vi.mock("@/data/project", () => ({
  loadEnvironmentVariables: vi.fn(() => new Promise<Record<string, string>>((resolve) => { env.release = resolve; })),
  loadProject: vi.fn(async () => undefined),
}));

import { SessionProvider, useSession } from "./SessionContext";

function Probe() {
  const { loading, envVars } = useSession();
  return <output data-testid="probe">{`${loading ? "loading" : "ready"}|${envVars.vsb_AppVersion ?? "-"}`}</output>;
}

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/projects"]}><SessionProvider><Probe /></SessionProvider></MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  env.release = undefined;
  startupFlags.envVarsBlockFirstPaint = false;
});

describe("the session's loading state", () => {
  it("UT-BOOT-040 is ready once the session is, while the environment variables are still loading", async () => {
    mount();
    await waitFor(() => expect(screen.getByTestId("probe")).toHaveTextContent("ready|-"));
    // They arrive later and fill in without a reload of anything.
    await act(async () => { env.release?.({ vsb_AppVersion: "1.2.3" }); });
    await waitFor(() => expect(screen.getByTestId("probe")).toHaveTextContent("ready|1.2.3"));
  });

  it("UT-BOOT-041 with the switch on, the old behaviour: loading until the environment variables are in", async () => {
    startupFlags.envVarsBlockFirstPaint = true;
    mount();
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(screen.getByTestId("probe")).toHaveTextContent("loading|-");
    await act(async () => { env.release?.({ vsb_AppVersion: "1.2.3" }); });
    await waitFor(() => expect(screen.getByTestId("probe")).toHaveTextContent("ready|1.2.3"));
  });
});
