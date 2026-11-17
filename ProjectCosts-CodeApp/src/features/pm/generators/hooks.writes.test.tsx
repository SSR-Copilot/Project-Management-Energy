// @vitest-environment jsdom
/**
 * UT-GENHOOK-001.. — the REAL `useGeneratorWrites` and `useModulePermissionFlows` of `hooks.ts` (generators fix F8, GT-2 / GT-3).
 * Until now every Screen test mocked `./hooks` whole, so the cache invalidation after a failed or part-way write and the
 * "set-up is missing" refusals of the approval flows were never run. `executePlan`, the session and the two cloud flows are stubbed;
 * `usePlanWrite`, `qk` and the hooks are the real ones.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { WritePlan } from "@/data/writePlan";

const h = vi.hoisted(() => ({
  queue: [] as (() => unknown)[],
  session: { session: { userPrincipalName: "pm@vsb.example" } as { userPrincipalName?: string | null } | null, envVars: {} as Record<string, string | undefined> },
  request: vi.fn(async () => ({ runid: "run", approvalid: "ap" })),
  cancel: vi.fn(async () => {}),
}));
vi.mock("@/data/executePlan", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/data/executePlan")>();
  return { ...mod, executePlan: vi.fn(async () => h.queue.shift()!()) };
});
vi.mock("@/app/SessionContext", () => ({ useSession: () => h.session }));
vi.mock("@/data/flows", () => ({ requestModulePermission: h.request, cancelModulePermission: h.cancel }));

import { PlanError } from "@/data/executePlan";
import { qk } from "@/data/keys";
import { PERMISSION_MSG } from "./rules";
import { useGeneratorWrites, useModulePermissionFlows } from "./hooks";

const PROJECT = "11111111-1111-1111-1111-111111111111";
const plan = (reason: string): WritePlan => ({ writes: [{ op: "update", entitySet: "vsb_xs", id: "1", data: {}, reason }], log: [] });
const done = () => ({ done: 1, createdIds: [], createdRows: {}, landed: [], deleted: [], maybeLanded: [] });

function writesHook() {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const spy = vi.spyOn(qc, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  return { ...renderHook(() => useGeneratorWrites(PROJECT), { wrapper }), spy };
}
const invalidatedKeys = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls.map((c) => (c[0] as { queryKey: unknown }).queryKey);

beforeEach(() => {
  h.queue = [];
  h.session = { session: { userPrincipalName: "pm@vsb.example" }, envVars: {
    vsb_ProjectManagementAppID: "app-1", vsb_PrimarilyApprovalGroupID: "group-1",
  } };
  h.request.mockClear();
  h.cancel.mockClear();
});

describe("useGeneratorWrites", () => {
  const KEYS = [qk.generatorsAll(PROJECT), qk.project(PROJECT), qk.milestoneProject(PROJECT), qk.generalDataProject(PROJECT)];

  it("UT-GENHOOK-001 a write that lands refreshes the screen, the session header and the other screens' copies of the project", async () => {
    h.queue = [done];
    const { result, spy } = writesHook();
    let ids: string[] | null = null;
    await act(async () => { ids = await result.current.run({ progress: "go", plan: plan("one") }); });
    expect(ids).toEqual([]);
    expect(invalidatedKeys(spy)).toEqual(KEYS);
    await waitFor(() => expect(result.current.refreshing).toBe(false));
  });

  it("UT-GENHOOK-002 a write that FAILS still refreshes all four keys (the screen must not keep showing rows the failure changed)", async () => {
    h.queue = [() => { throw new PlanError(0, 1, "the type", new Error("HTTP 400")); }];
    const { result, spy } = writesHook();
    let ids: string[] | null = ["untouched"];
    await act(async () => { ids = await result.current.run({ progress: "go", plan: plan("one") }); });
    expect(ids).toBeNull();
    expect(result.current.error).toContain("HTTP 400");
    expect(invalidatedKeys(spy)).toEqual(KEYS);
  });

  it("UT-GENHOOK-003 a job that stops part-way (second plan fails) refreshes, reports the whole job's count and names the permission text for a 403", async () => {
    h.queue = [done, () => { throw new PlanError(0, 2, "device type row", new Error("boom")); }];
    const { result, spy } = writesHook();
    await act(async () => { await result.current.run({ progress: "go", plan: plan("first"), then: async () => plan("second") }); });
    expect(result.current.error).toContain("1 of 3 changes had already been saved");
    expect(invalidatedKeys(spy)).toEqual(KEYS);

    h.queue = [() => { throw new PlanError(0, 1, "x", Object.assign(new Error("Forbidden"), { status: 403 })); }];
    await act(async () => { await result.current.run({ progress: "go", plan: plan("again") }); });
    expect(result.current.error).toBeTruthy();
    expect(spy).toHaveBeenCalledTimes(8);
  });

  it("UT-GENHOOK-004 the hook's writes run in the background: `refreshing` is the Screen's signal to hold its actions back", async () => {
    h.queue = [done];
    const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    let finish: () => void = () => {};
    const reload = new Promise<void>((resolve) => { finish = resolve; });
    vi.spyOn(qc, "invalidateQueries").mockReturnValue(reload);
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => useGeneratorWrites(PROJECT), { wrapper });
    await act(async () => { await result.current.run({ progress: "go", plan: plan("one") }); });
    expect(result.current.progress).toBeNull();
    expect(result.current.refreshing).toBe(true);
    await act(async () => { finish(); await reload; });
    await waitFor(() => expect(result.current.refreshing).toBe(false));
  });
});

describe("useModulePermissionFlows", () => {
  const payload = { id: "t1" } as never;
  const row = { id: "t1", flowRunId: "run-1", flowApprovalId: "ap-1", generatorDisplayName: "Vestas V150" };
  /** A fresh render reads the session as it is NOW (the hook closes over it per render). */
  const flows = () => renderHook(() => useModulePermissionFlows()).result.current;

  it("UT-GENHOOK-010 request sends the signed-in e-mail, the approval group and the app id with the payload", async () => {
    const f = flows();
    await act(async () => { await f.request(payload); });
    expect(h.request).toHaveBeenCalledWith({
      requesterEmail: "pm@vsb.example", approvalGroupId: "group-1", appId: "app-1", project: payload,
    });
  });

  it("UT-GENHOOK-011 a blank e-mail, approval group or app id throws the set-up message (synchronously, from the job's plan / then) and sends nothing", async () => {
    h.session = { session: { userPrincipalName: "  " }, envVars: { vsb_ProjectManagementAppID: "a", vsb_PrimarilyApprovalGroupID: "g" } };
    expect(() => flows().request(payload)).toThrow(PERMISSION_MSG.setupMissing("your e-mail address"));
    h.session = { session: null, envVars: { vsb_ProjectManagementAppID: "a", vsb_PrimarilyApprovalGroupID: "g" } };
    expect(() => flows().request(payload)).toThrow(PERMISSION_MSG.setupMissing("your e-mail address"));
    h.session = { session: { userPrincipalName: "pm@vsb.example" }, envVars: { vsb_ProjectManagementAppID: "a" } };
    expect(() => flows().request(payload)).toThrow(
      PERMISSION_MSG.setupMissing("the environment variable vsb_PrimarilyApprovalGroupID"),
    );
    h.session = { session: { userPrincipalName: "pm@vsb.example" }, envVars: { vsb_PrimarilyApprovalGroupID: "g" } };
    expect(() => flows().request(payload)).toThrow(
      PERMISSION_MSG.setupMissing("the environment variable vsb_ProjectManagementAppID"),
    );
    expect(h.request).not.toHaveBeenCalled();
  });

  it("UT-GENHOOK-012 cancel needs the e-mail and the app id (not the approval group) and sends the module payload", async () => {
    h.session = { session: { userPrincipalName: "pm@vsb.example" }, envVars: { vsb_ProjectManagementAppID: "app-1" } };
    const f = flows();
    await act(async () => { await f.cancel("wtg", row); });
    expect(h.cancel).toHaveBeenCalledTimes(1);
    expect(h.cancel).toHaveBeenCalledWith(expect.objectContaining({ requesterEmail: "pm@vsb.example", appId: "app-1" }));

    h.session = { session: { userPrincipalName: "pm@vsb.example" }, envVars: {} };
    expect(() => flows().cancel("wtg", row)).toThrow(
      PERMISSION_MSG.setupMissing("the environment variable vsb_ProjectManagementAppID"),
    );
  });

  it("UT-GENHOOK-013 cancelIfOpen cancels only a row with a FlowRunId (the canvas If(Not(IsBlank(FlowRunId)), …))", async () => {
    const f = flows();
    await act(async () => { await f.cancelIfOpen("pv", { ...row, flowRunId: null }); });
    expect(h.cancel).not.toHaveBeenCalled();
    await act(async () => { await f.cancelIfOpen("pv", row); });
    expect(h.cancel).toHaveBeenCalledTimes(1);
  });
});
