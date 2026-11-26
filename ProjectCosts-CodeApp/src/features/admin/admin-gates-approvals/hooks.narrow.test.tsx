// @vitest-environment jsdom
/**
 * Project Gates: the Active-pill toggle reloads only the slice it changed, and overlapping clicks do not stack reloads
 * (dvopt AD-06, `ADMIN_GATES_NARROW_RELOAD`). UT-ADGATE-NARROW-nnn.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const repo = vi.hoisted(() => ({ loadDataset: vi.fn(), searchPeople: vi.fn(), resolvePeople: vi.fn(), reloadSlice: vi.fn() }));
vi.mock("@/data/adminGatesApprovals", () => ({ projectGatesRepository: repo }));
const exec = vi.hoisted(() => vi.fn());
vi.mock("@/data/executePlan", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/data/executePlan")>()),
  executePlan: exec,
}));

import { qk } from "@/data/keys";
import { ADMIN_OPT } from "@/data/adminFlags";
import { TECHNOLOGY } from "@/domain/technology";
import { useToggleActive } from "./hooks";

const COUNTRY = "00000000-0000-0000-0000-0000000000de";
const WIND = TECHNOLOGY.wind;
const KEY = qk.adminGateDataset(COUNTRY, WIND);
const DEFAULTS = { ...ADMIN_OPT };
const G1 = "40000000-0000-0000-0000-000000000001";
const G2 = "40000000-0000-0000-0000-000000000002";
const A1 = "60000000-0000-0000-0000-000000000001";

const dataset = () => ({
  templates: [{ id: G1, gateActive: true }, { id: G2, gateActive: true }],
  checklistHeaderId: "h1", checklists: [{ id: "c1" }],
  approvals: [{ id: A1, gateActive: true }],
  people: { p1: { entraId: "p1", name: "Pat", mail: "p@x" } }, checklistError: null, peopleError: null,
});

function setup(seed = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  if (seed) client.setQueryData(KEY, dataset());
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, invalidate, wrapper };
}
const invalidatedKeys = (spy: ReturnType<typeof setup>["invalidate"]) =>
  spy.mock.calls.map((c) => (c[0] as { queryKey: readonly unknown[] }).queryKey);

beforeEach(() => {
  Object.assign(ADMIN_OPT, DEFAULTS);
  vi.clearAllMocks();
  exec.mockReset();
  exec.mockResolvedValue({ done: 1, createdIds: [] });
  repo.reloadSlice.mockReset();
  repo.reloadSlice.mockImplementation(async (kind: "gate" | "task", _c: string, _t: number, current: ReturnType<typeof dataset>) => (
    kind === "gate"
      ? { ...current, templates: [{ id: G1, gateActive: false }, { id: G2, gateActive: true }] }
      : { ...current, approvals: [{ id: A1, gateActive: false }] }
  ));
});
afterEach(() => { cleanup(); Object.assign(ADMIN_OPT, DEFAULTS); });

describe("AD-06 narrow reload", () => {
  it("UT-ADGATE-NARROW-001 a gate toggle re-reads only the templates; the header, tasks and approvals are reused and no full load runs", async () => {
    const { client, invalidate, wrapper } = setup();
    const toggle = renderHook(() => useToggleActive(COUNTRY, WIND, true), { wrapper });
    await act(() => toggle.result.current.mutateAsync({ kind: "gate", id: G1, active: false }));
    expect(repo.reloadSlice).toHaveBeenCalledTimes(1);
    expect(repo.reloadSlice.mock.calls[0]!.slice(0, 3)).toEqual(["gate", COUNTRY, WIND]);
    expect(repo.loadDataset).not.toHaveBeenCalled();
    const cached = client.getQueryData<ReturnType<typeof dataset>>(KEY)!;
    expect(cached.templates[0]).toEqual({ id: G1, gateActive: false });
    expect(cached.approvals).toEqual([{ id: A1, gateActive: true }]);
    expect(cached.checklists).toEqual([{ id: "c1" }]);
    expect(invalidatedKeys(invalidate)).not.toContainEqual(KEY);
  });

  it("UT-ADGATE-NARROW-002 a task toggle re-reads only the approvals", async () => {
    const { client, wrapper } = setup();
    const toggle = renderHook(() => useToggleActive(COUNTRY, WIND, true), { wrapper });
    await act(() => toggle.result.current.mutateAsync({ kind: "task", id: A1, active: false }));
    expect(repo.reloadSlice.mock.calls.map((c) => c[0])).toEqual(["task"]);
    const cached = client.getQueryData<ReturnType<typeof dataset>>(KEY)!;
    expect(cached.approvals).toEqual([{ id: A1, gateActive: false }]);
    expect(cached.templates).toHaveLength(2);
  });

  it("UT-ADGATE-NARROW-003 the Check List Settings locks query is still marked stale (no read while that screen is unmounted)", async () => {
    const { invalidate, wrapper } = setup();
    const toggle = renderHook(() => useToggleActive(COUNTRY, WIND, true), { wrapper });
    await act(() => toggle.result.current.mutateAsync({ kind: "task", id: A1, active: true }));
    expect(invalidatedKeys(invalidate)).toContainEqual(qk.adminChecklistLocks);
  });

  it("UT-ADGATE-NARROW-004 three quick toggles send three guarded updates but reload once per slice (two gate clicks and one task click: 1 gate read + 1 task read)", async () => {
    const { wrapper } = setup();
    const toggle = renderHook(() => useToggleActive(COUNTRY, WIND, true), { wrapper });
    await act(async () => {
      await Promise.all([
        toggle.result.current.mutateAsync({ kind: "gate", id: G1, active: false }),
        toggle.result.current.mutateAsync({ kind: "gate", id: G2, active: false }),
        toggle.result.current.mutateAsync({ kind: "task", id: A1, active: false }),
      ]);
    });
    expect(exec).toHaveBeenCalledTimes(3);
    expect(repo.reloadSlice.mock.calls.map((c) => c[0]).sort()).toEqual(["gate", "task"]);
    expect(repo.loadDataset).not.toHaveBeenCalled();
  });

  it("UT-ADGATE-NARROW-005 a toggle that settles while a reload is running does not start a second one beside it; its slice is reloaded after the first finishes", async () => {
    const { wrapper } = setup();
    const toggle = renderHook(() => useToggleActive(COUNTRY, WIND, true), { wrapper });
    let inFlight = 0; let peak = 0;
    const releases: (() => void)[] = [];
    repo.reloadSlice.mockImplementation(async (kind: "gate" | "task", _c: string, _t: number, current: ReturnType<typeof dataset>) => {
      inFlight += 1; peak = Math.max(peak, inFlight);
      await new Promise<void>((resolve) => { releases.push(resolve); });
      inFlight -= 1;
      return { ...current, ...(kind === "gate" ? { templates: [] } : { approvals: [] }) };
    });
    let first!: Promise<unknown>; let second!: Promise<unknown>;
    await act(async () => {
      first = toggle.result.current.mutateAsync({ kind: "gate", id: G1, active: false });
      await waitFor(() => expect(releases).toHaveLength(1));
      second = toggle.result.current.mutateAsync({ kind: "task", id: A1, active: false });
      await waitFor(() => expect(exec).toHaveBeenCalledTimes(2));
      releases[0]!();
      await waitFor(() => expect(releases).toHaveLength(2));
      releases[1]!();
      await Promise.all([first, second]);
    });
    expect(repo.reloadSlice.mock.calls.map((c) => c[0])).toEqual(["gate", "task"]);
    expect(peak).toBe(1);
  });

  it("UT-ADGATE-NARROW-006 a failed slice read falls back to the full reload of before", async () => {
    const { invalidate, wrapper } = setup();
    repo.reloadSlice.mockRejectedValueOnce(new Error("directory down"));
    const toggle = renderHook(() => useToggleActive(COUNTRY, WIND, true), { wrapper });
    await act(() => toggle.result.current.mutateAsync({ kind: "gate", id: G1, active: false }));
    expect(invalidatedKeys(invalidate)).toContainEqual(KEY);
  });

  it("UT-ADGATE-NARROW-007 with no cached dataset the full reload runs, as before", async () => {
    const { invalidate, wrapper } = setup(false);
    const toggle = renderHook(() => useToggleActive(COUNTRY, WIND, true), { wrapper });
    await act(() => toggle.result.current.mutateAsync({ kind: "task", id: A1, active: true }));
    expect(repo.reloadSlice).not.toHaveBeenCalled();
    expect(invalidatedKeys(invalidate)).toContainEqual(KEY);
  });

  it("UT-ADGATE-NARROW-008 a failed toggle still rolls the pill back and reloads the slice", async () => {
    const { client, wrapper } = setup();
    exec.mockRejectedValueOnce(new Error("boom"));
    const toggle = renderHook(() => useToggleActive(COUNTRY, WIND, true), { wrapper });
    await act(async () => { await toggle.result.current.mutateAsync({ kind: "gate", id: G1, active: false }).catch(() => undefined); });
    expect(repo.reloadSlice).toHaveBeenCalledTimes(1);
    expect(client.getQueryData<ReturnType<typeof dataset>>(KEY)!.templates).toHaveLength(2);
  });

  it("UT-ADGATE-NARROW-009 with ADMIN_GATES_NARROW_RELOAD off every toggle invalidates the whole dataset and reads no slice", async () => {
    ADMIN_OPT.ADMIN_GATES_NARROW_RELOAD = false;
    const { invalidate, wrapper } = setup();
    const toggle = renderHook(() => useToggleActive(COUNTRY, WIND, true), { wrapper });
    await act(() => toggle.result.current.mutateAsync({ kind: "gate", id: G1, active: false }));
    expect(repo.reloadSlice).not.toHaveBeenCalled();
    expect(invalidatedKeys(invalidate)).toContainEqual(KEY);
    expect(invalidatedKeys(invalidate)).toContainEqual(qk.adminChecklistLocks);
  });
});
