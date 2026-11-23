/**
 * UT-MSTONE-OPT-0xx — two Milestones reads (optimization programme B5a, OPT-07a loader part and OPT-07e job type).
 *
 * BEFORE (the loader without the new option, which is unchanged; and a call right after `resetMilestoneJobTypeMemo`):
 * `loadMilestoneProject` = 2 requests (project, then country); `isMilestoneRecalculationRunning` = 2 requests (job type by name,
 * then the jobs), on every call.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  pages: [] as string[],
  project: { vsb_projectid: "p-1", _vsb_country_value: "11111111-1111-1111-1111-1111111111c1" } as Record<string, unknown>,
  jobTypes: [{ vsb_fabricjobtypeid: "22222222-2222-2222-2222-2222222222a1" }] as Record<string, unknown>[],
  jobs: [] as Record<string, unknown>[],
  jobTypeFails: false,
}));

vi.mock("./client", () => ({
  fetchAll: async () => [],
  fetchPage: async (label: string) => {
    h.pages.push(label);
    if (label === "load the project's milestones") return [h.project];
    if (label === "load the project's country") return [{ vsb_countryid: "c", _vsb_businessunit_value: "bu-from-read" }];
    if (label === "find the milestone Fabric job type") { if (h.jobTypeFails) throw new Error("boom"); return h.jobTypes; }
    if (label === "check for a running milestone recalculation") return h.jobs;
    return [];
  },
}));

import { isMilestoneRecalculationRunning, loadMilestoneProject, resetMilestoneJobTypeMemo } from "./milestones";

const PID = "11111111-1111-1111-1111-111111111111";
const COUNTRY = "11111111-1111-1111-1111-1111111111c1";

beforeEach(() => { h.pages = []; h.jobs = []; h.jobTypeFails = false; resetMilestoneJobTypeMemo(); vi.useRealTimers(); });

describe("loadMilestoneProject (OPT-07a)", () => {
  it("UT-MSTONE-OPT-001 without the option: 2 requests (project, country) and the business unit from the country row (the old behaviour)", async () => {
    const p = await loadMilestoneProject(PID);
    expect(h.pages).toEqual(["load the project's milestones", "load the project's country"]);
    expect(p?.countryBusinessUnitId).toBe("bu-from-read");
  });

  it("UT-MSTONE-OPT-002 with a business unit from the cached list: 1 request, same business unit", async () => {
    const p = await loadMilestoneProject(PID, { businessUnitOf: async (id) => (id === COUNTRY ? "bu-from-list" : undefined) });
    expect(h.pages).toEqual(["load the project's milestones"]);
    expect(p?.countryBusinessUnitId).toBe("bu-from-list");
  });

  it("UT-MSTONE-OPT-003 a country the list does not know (undefined) falls back to the read; a country with no business unit (null) stays null without a read", async () => {
    const fallback = await loadMilestoneProject(PID, { businessUnitOf: async () => undefined });
    expect(h.pages).toEqual(["load the project's milestones", "load the project's country"]);
    expect(fallback?.countryBusinessUnitId).toBe("bu-from-read");
    h.pages = [];
    const none = await loadMilestoneProject(PID, { businessUnitOf: async () => null });
    expect(h.pages).toEqual(["load the project's milestones"]);
    expect(none?.countryBusinessUnitId).toBeNull();
  });

  it("UT-MSTONE-OPT-004 a project without a country never asks for a business unit", async () => {
    h.project = { vsb_projectid: "p-1", _vsb_country_value: null };
    const ask = vi.fn(async () => "x");
    const p = await loadMilestoneProject(PID, { businessUnitOf: ask });
    expect(ask).not.toHaveBeenCalled();
    expect(p?.countryBusinessUnitId).toBeNull();
    h.project = { vsb_projectid: "p-1", _vsb_country_value: COUNTRY };
  });
});

describe("isMilestoneRecalculationRunning (OPT-07e)", () => {
  it("UT-MSTONE-OPT-010 the job type is resolved once: the first check is 2 requests, every later one is 1 (BEFORE: 2 each)", async () => {
    await isMilestoneRecalculationRunning(PID);
    expect(h.pages).toEqual(["find the milestone Fabric job type", "check for a running milestone recalculation"]);
    h.pages = [];
    await isMilestoneRecalculationRunning(PID);
    await isMilestoneRecalculationRunning(PID);
    expect(h.pages).toEqual(["check for a running milestone recalculation", "check for a running milestone recalculation"]);
  });

  it("UT-MSTONE-OPT-011 the answer is unchanged: running when a job exists, not running otherwise, false without a job type", async () => {
    expect(await isMilestoneRecalculationRunning(PID)).toBe(false);
    h.jobs = [{ vsb_fabricsyncjobid: "j-1" }];
    expect(await isMilestoneRecalculationRunning(PID)).toBe(true);
    h.jobTypes = [];
    resetMilestoneJobTypeMemo();
    expect(await isMilestoneRecalculationRunning(PID)).toBe(false);
    h.jobTypes = [{ vsb_fabricjobtypeid: "22222222-2222-2222-2222-2222222222a1" }];
  });

  it("UT-MSTONE-OPT-012 an empty answer and a failed read are not remembered; the id is read again after 30 minutes (fake clock)", async () => {
    h.jobTypes = [];
    await isMilestoneRecalculationRunning(PID);
    await isMilestoneRecalculationRunning(PID);
    expect(h.pages.filter((p) => p === "find the milestone Fabric job type")).toHaveLength(2);
    h.jobTypes = [{ vsb_fabricjobtypeid: "22222222-2222-2222-2222-2222222222a1" }];
    h.jobTypeFails = true;
    await expect(isMilestoneRecalculationRunning(PID)).rejects.toThrow("boom");
    h.jobTypeFails = false; h.pages = [];
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-23T10:00:00Z"));
    await isMilestoneRecalculationRunning(PID);
    vi.setSystemTime(new Date("2026-11-23T10:29:00Z"));
    await isMilestoneRecalculationRunning(PID);
    expect(h.pages.filter((p) => p === "find the milestone Fabric job type")).toHaveLength(1);
    vi.setSystemTime(new Date("2026-11-23T10:31:00Z"));
    await isMilestoneRecalculationRunning(PID);
    expect(h.pages.filter((p) => p === "find the milestone Fabric job type")).toHaveLength(2);
  });
});
