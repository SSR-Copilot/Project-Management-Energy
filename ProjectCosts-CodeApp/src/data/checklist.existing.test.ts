/**
 * UT-CHKEXIST-DVOPT-NNN — PB-14: `existingTrackingIds`, the key-only existence read behind the Check List back-fill guard.
 * Recorded shape: one request per chunk of ids, `$select` is the key only, `idIn` on the key, no state filter.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const svc = vi.hoisted(() => ({ calls: [] as { select?: string[]; filter?: string }[], present: new Set<string>(), fail: false }));
vi.mock("@/generated/services/Vsb_projectstatetrackingsService", () => ({
  Vsb_projectstatetrackingsService: {
    getAll: async (o: { select?: string[]; filter?: string }) => {
      svc.calls.push(o);
      if (svc.fail) return { success: false, data: undefined, error: { message: "down", status: 500 } };
      const ids = [...(o.filter ?? "").matchAll(/[0-9a-f]{8}-[0-9a-f-]{27}/gi)].map((m) => m[0]);
      return { success: true, data: ids.filter((i) => svc.present.has(i.toLowerCase())).map((i) => ({ vsb_projectstatetrackingid: i.toUpperCase() })) };
    },
  },
}));
vi.mock("@/generated/services/Vsb_projectsService", () => ({ Vsb_projectsService: { getAll: async () => ({ success: true, data: [] }) } }));
vi.mock("@/generated/services/Vsb_projectchecklistsService", () => ({ Vsb_projectchecklistsService: { getAll: async () => ({ success: true, data: [] }) } }));
vi.mock("@/generated/services/Vsb_projectdefaultchecklistsesService", () => ({ Vsb_projectdefaultchecklistsesService: { getAll: async () => ({ success: true, data: [] }) } }));
vi.mock("@/generated/services/Vsb_projectdefaultapprovalsesService", () => ({ Vsb_projectdefaultapprovalsesService: { getAll: async () => ({ success: true, data: [] }) } }));
vi.mock("@/generated/services/Vsb_projectstatetrackingnotesService", () => ({ Vsb_projectstatetrackingnotesService: { getAll: async () => ({ success: true, data: [] }) } }));
vi.mock("@/generated/services/Vsb_projectchecklisttrackingnotesService", () => ({ Vsb_projectchecklisttrackingnotesService: { getAll: async () => ({ success: true, data: [] }) } }));
vi.mock("./adminGatesApprovals", () => ({
  findScopeCountryTechId: async () => null, getEntraPeople: async () => new Map(), listChecklistApprovals: async () => [], listGateApprovals: async () => [],
}));
vi.mock("./generalData", () => ({ listProjectStates: async () => [] }));

import { existingTrackingIds } from "./checklist";

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
beforeEach(() => { svc.calls = []; svc.present = new Set(); svc.fail = false; });

describe("UT-CHKEXIST-DVOPT existingTrackingIds", () => {
  it("UT-CHKEXIST-DVOPT-001 seven ids = ONE request, key-only $select, an OR of key equalities, no state filter", async () => {
    const ids = [1, 2, 3, 4, 5, 6, 7].map(id);
    ids.forEach((i) => svc.present.add(i));
    const found = await existingTrackingIds(ids);
    expect(svc.calls).toHaveLength(1);
    expect(svc.calls[0]!.select).toEqual(["vsb_projectstatetrackingid"]);
    expect(svc.calls[0]!.filter).toContain("vsb_projectstatetrackingid eq");
    expect(svc.calls[0]!.filter).not.toContain("statecode");
    expect([...found].sort()).toEqual(ids.slice().sort());
  });

  it("UT-CHKEXIST-DVOPT-002 only the rows that exist come back (a deleted tracking is missing), lower-cased; duplicates are asked once", async () => {
    svc.present.add(id(1)); svc.present.add(id(3));
    const found = await existingTrackingIds([id(1), id(2), id(3), id(1)]);
    expect(found.has(id(1))).toBe(true);
    expect(found.has(id(2))).toBe(false);
    expect(found.has(id(3))).toBe(true);
    expect((svc.calls[0]!.filter!.match(/eq/g) ?? []).length).toBe(3);
  });

  it("UT-CHKEXIST-DVOPT-003 more ids than one chunk (40): one request per chunk", async () => {
    const ids = Array.from({ length: 85 }, (_, i) => id(i + 1));
    ids.forEach((i) => svc.present.add(i));
    const found = await existingTrackingIds(ids);
    expect(svc.calls).toHaveLength(3);
    expect(found.size).toBe(85);
  });

  it("UT-CHKEXIST-DVOPT-004 no ids = no request; a failed read rejects (the job's error, nothing written)", async () => {
    expect((await existingTrackingIds([])).size).toBe(0);
    expect(svc.calls).toHaveLength(0);
    svc.fail = true;
    await expect(existingTrackingIds([id(1)])).rejects.toThrow();
  });
});
