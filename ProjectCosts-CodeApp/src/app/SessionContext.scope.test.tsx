// @vitest-environment jsdom
/**
 * OPT-01 (B5b): which scope the session project is loaded with, per route, and that the two scopes never share a cache entry while a
 * `qk.project(id)` invalidation (every Project Management save) still reaches both. `loadProject` is a recording fake.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { qk } from "@/data/keys";

const h = vi.hoisted(() => ({ launchParams: {} as Record<string, string>, found: true }));

vi.mock("@/platform/powerClient", async (original) => ({
  ...(await original<typeof import("@/platform/powerClient")>()),
  readSession: vi.fn(async () => ({ environmentId: "e", appId: "a", launchParams: h.launchParams })),
}));
vi.mock("@/data/project", () => ({
  loadEnvironmentVariables: vi.fn(async () => ({})),
  loadProject: vi.fn(async (id: string, options?: { scope?: string }) =>
    (h.found ? { projectId: id, projectIdCode: "1", projectName: `name-${options?.scope}`, approvalState: "Draft" } : undefined)),
}));

import { loadProject } from "@/data/project";
import { SessionProvider, sessionProjectQueryOptions, useSession } from "./SessionContext";
import { sessionProjectScope } from "./bootPlan";

const ID = "9f5aade5-2b7c-ef11-ac20-000d3a466ab7";

function Probe() {
  const { project, projectNotFound, loading } = useSession();
  return <output data-testid="probe">{`${loading ? "loading" : "ready"}|${project?.projectName ?? "-"}|${projectNotFound ? "notfound" : "ok"}`}</output>;
}

function mount(path: string, client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}><SessionProvider><Probe /></SessionProvider></MemoryRouter>
    </QueryClientProvider>,
  );
  return client;
}

beforeEach(() => {
  h.launchParams = {};
  h.found = true;
  vi.mocked(loadProject).mockClear();
});

describe("the session project's scope", () => {
  it("UT-SESSION-OPT-001 a Project Management route loads the row-only scope, and the header gets that context", async () => {
    mount(`/project/team?projectId=${ID}`);
    await waitFor(() => expect(screen.getByTestId("probe")).toHaveTextContent("ready|name-pm|ok"));
    expect(loadProject).toHaveBeenCalledTimes(1);
    expect(loadProject).toHaveBeenCalledWith(ID, expect.objectContaining({ scope: "pm" }));
  });

  it("UT-SESSION-OPT-002 a Cost route keeps the full load", async () => {
    mount(`/costs/capex?projectId=${ID}`);
    await waitFor(() => expect(screen.getByTestId("probe")).toHaveTextContent("ready|name-full|ok"));
    expect(loadProject).toHaveBeenCalledWith(ID, expect.objectContaining({ scope: "full" }));
  });

  it("UT-SESSION-OPT-003 Edit Project at the root (pmScreen + projectId) loads the PM scope, as the boot prefetch does", async () => {
    h.launchParams = { projectId: ID, pmScreen: "/project/general" };
    mount("/");
    await waitFor(() => expect(loadProject).toHaveBeenCalled());
    expect(loadProject).toHaveBeenCalledWith(ID, expect.objectContaining({ scope: "pm" }));
  });

  it("UT-SESSION-OPT-004 the scope is a pure function of the route", () => {
    expect(sessionProjectScope("/project/general", false)).toBe("pm");
    expect(sessionProjectScope("/project/finance", false)).toBe("pm");
    expect(sessionProjectScope("/costs/capex", false)).toBe("full");
    expect(sessionProjectScope("/costs/capex", true)).toBe("full");
    expect(sessionProjectScope("/", false)).toBe("full");
    expect(sessionProjectScope("/", true)).toBe("pm");
    expect(sessionProjectScope("/projects", true)).toBe("full");
  });

  it("UT-SESSION-OPT-005 the two scopes have different keys, both under qk.project(id): one invalidation reaches both", async () => {
    const pm = sessionProjectQueryOptions(ID, "pm").queryKey;
    const full = sessionProjectQueryOptions(ID, "full").queryKey;
    expect(pm).not.toEqual(full);
    expect(full).toEqual(qk.project(ID));
    expect(pm.slice(0, 2)).toEqual([...qk.project(ID)]);
    const qc = new QueryClient();
    await qc.fetchQuery(sessionProjectQueryOptions(ID, "pm"));
    await qc.fetchQuery(sessionProjectQueryOptions(ID, "full"));
    await qc.invalidateQueries({ queryKey: qk.project(ID), refetchType: "none" });
    expect(qc.getQueryState(pm)?.isInvalidated).toBe(true);
    expect(qc.getQueryState(full)?.isInvalidated).toBe(true);
  });

  it("UT-SESSION-OPT-006 a PM save's invalidation of qk.project(id) refetches the mounted PM load once (1 request-set, not a second scope)", async () => {
    const qc = mount(`/project/finance?projectId=${ID}`);
    await waitFor(() => expect(screen.getByTestId("probe")).toHaveTextContent("ready|name-pm|ok"));
    await qc.invalidateQueries({ queryKey: qk.project(ID) });
    await waitFor(() => expect(loadProject).toHaveBeenCalledTimes(2));
    expect(vi.mocked(loadProject).mock.calls.every(([, o]) => o?.scope === "pm")).toBe(true);
  });

  it("UT-SESSION-OPT-007 a missing project is not-found on a PM route exactly as on a Cost route", async () => {
    h.found = false;
    mount(`/project/team?projectId=${ID}`);
    await waitFor(() => expect(screen.getByTestId("probe")).toHaveTextContent("ready|-|notfound"));
  });
});
