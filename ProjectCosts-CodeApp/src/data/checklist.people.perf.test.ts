/**
 * UT-CHKPERF-010.. — how many Entra (people) lookups one visit of the Cluster Check List makes. The gate rows and the
 * approval settings both resolve the Portfolio Manager's mail; before D138 each resolved it on its own.
 * BASELINE (dbc412d): 2 lookups for one manager across the two reads.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const svc = vi.hoisted(() => ({
  entra: vi.fn<(ids: readonly string[]) => Promise<Map<string, { mail?: string }>>>(),
  approvals: vi.fn<(ids: readonly string[]) => Promise<unknown[]>>(),
  gates: vi.fn<(c: string, t: number) => Promise<unknown[]>>(),
}));
vi.mock("./adminGatesApprovals", () => ({
  findScopeCountryTechId: vi.fn(), getEntraPeople: (ids: readonly string[]) => svc.entra(ids),
  listChecklistApprovals: (ids: readonly string[]) => svc.approvals(ids), listGateApprovals: (c: string, t: number) => svc.gates(c, t),
}));
vi.mock("./generalData", () => ({ listProjectStates: vi.fn() }));

import { listChecklistApprovalSettings, listChecklistGates } from "./checklist";
import { resetChecklistPeopleCache } from "./checklistPeople";

const MANAGER = "aaaaaaaa-0000-0000-0000-000000000001";
const OTHER = "aaaaaaaa-0000-0000-0000-000000000002";
const gate = (pm: string | null) => ({ id: `g-${pm}`, clusterStateId: "s", approvalMode: 1, gateActive: true, portfolioManagerId: pm,
  defaultApprovals: null, defaultContributors: null, defaultNotifications: null });
const approval = (pm: string | null) => ({ id: `a-${pm}`, projectDefaultChecklistId: "t1", approvalMode: 1, gateActive: true,
  portfolioManagerId: pm, defaultApprovers: null, defaultContributors: null, defaultNotifications: null });

beforeEach(() => {
  resetChecklistPeopleCache();
  for (const f of [svc.entra, svc.approvals, svc.gates]) f.mockReset();
  svc.entra.mockImplementation(async (ids) => new Map(ids.map((i) => [i, { mail: `${i}@x.test` }])));
});

describe("Cluster Check List — people lookups per visit", () => {
  it("UT-CHKPERF-010 one manager in the gates AND in the approvals is looked up once, and both reads still get the mail", async () => {
    svc.gates.mockResolvedValue([gate(MANAGER)]);
    svc.approvals.mockResolvedValue([approval(MANAGER)]);
    const g = await listChecklistGates({ countryId: "c", technology: 1 });
    const a = await listChecklistApprovalSettings(["t1"]);
    expect(g[0]!.portfolioManagerMail).toBe(`${MANAGER}@x.test`);
    expect(a[0]!.portfolioManagerMail).toBe(`${MANAGER}@x.test`);
    expect(svc.entra).toHaveBeenCalledTimes(1);
  });

  it("UT-CHKPERF-011 two different managers are two lookups (one request per person, as before)", async () => {
    svc.gates.mockResolvedValue([gate(MANAGER), gate(OTHER)]);
    svc.approvals.mockResolvedValue([approval(OTHER)]);
    await listChecklistGates({ countryId: "c", technology: 1 });
    await listChecklistApprovalSettings(["t1"]);
    expect(svc.entra.mock.calls.map((c) => c[0]).sort()).toEqual([[MANAGER], [OTHER]]);
  });

  it("UT-CHKPERF-012 a FAILED lookup is not remembered: the next read asks again, and only that person's mail was lost (D127 §2)", async () => {
    svc.gates.mockResolvedValue([gate(MANAGER), gate(OTHER)]);
    svc.approvals.mockResolvedValue([approval(MANAGER)]);
    svc.entra.mockImplementationOnce(async () => { throw new Error("graph 500"); });
    const g = await listChecklistGates({ countryId: "c", technology: 1 });
    expect(g.map((x) => x.portfolioManagerMail)).toEqual([null, `${OTHER}@x.test`]);
    const a = await listChecklistApprovalSettings(["t1"]);
    expect(a[0]!.portfolioManagerMail).toBe(`${MANAGER}@x.test`);
    expect(svc.entra).toHaveBeenCalledTimes(3);
  });

  it("UT-CHKPERF-013 resetChecklistPeopleCache (the screen's Refresh) makes the next read ask again", async () => {
    svc.gates.mockResolvedValue([gate(MANAGER)]);
    await listChecklistGates({ countryId: "c", technology: 1 });
    resetChecklistPeopleCache();
    await listChecklistGates({ countryId: "c", technology: 1 });
    expect(svc.entra).toHaveBeenCalledTimes(2);
  });

  it("UT-CHKPERF-014 an answer older than the 30 s the screen's queries stay fresh is not reused", async () => {
    vi.useFakeTimers();
    try {
      svc.gates.mockResolvedValue([gate(MANAGER)]);
      await listChecklistGates({ countryId: "c", technology: 1 });
      vi.advanceTimersByTime(31_000);
      await listChecklistGates({ countryId: "c", technology: 1 });
      expect(svc.entra).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
