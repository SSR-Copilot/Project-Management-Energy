/**
 * UT-POWERSRC: the `environment_<id>` entry of power.config.json is REQUIRED while the bulk Dataverse
 * actions are registered. Losing it answers HTTP 501 to every bulk Save and silently drops each tab to one
 * request per row (D51, 27 Oct 2026); nothing else in the gate or the suite notices.
 */
import { describe, expect, it } from "vitest";
import { bulkEnvironmentProblems, checkPowerSources } from "../../scripts/check-power-sources.mjs";

const ENTRY = { environment_39a902ba: { entitySetName: "Environment" } };

describe("bulkEnvironmentProblems (UT-POWERSRC)", () => {
  it("UT-POWERSRC-001 is clean when the actions are registered and the environment entry exists", () => {
    expect(bulkEnvironmentProblems(new Set(["createmultiple", "updatemultiple"]), ENTRY)).toEqual([]);
  });

  it("UT-POWERSRC-002 fails when an action is registered and the entry is missing", () => {
    const p = bulkEnvironmentProblems(new Set(["createmultiple", "updatemultiple", "upsertmultiple"]), {});
    expect(p).toHaveLength(1);
    expect(p[0]).toMatch(/environment_<id>/);
    expect(p[0]).toMatch(/createmultiple, updatemultiple, upsertmultiple are registered/);
    expect(p[0]).toMatch(/501/);
  });

  it("UT-POWERSRC-003 one registered action is enough to require the entry", () => {
    const p = bulkEnvironmentProblems(new Set(["updatemultiple"]), undefined);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatch(/updatemultiple is registered/);
  });

  it("UT-POWERSRC-004 needs nothing while no bulk action is registered", () => {
    expect(bulkEnvironmentProblems(new Set(["vsb_projects"]), {})).toEqual([]);
  });

  it("UT-POWERSRC-005 a table whose key merely starts with environment_ does not count; the entity set must be Environment", () => {
    const p = bulkEnvironmentProblems(new Set(["createmultiple"]), { environment_x: { entitySetName: "vsb_projects" } });
    expect(p).toHaveLength(1);
  });

  it("UT-POWERSRC-006 the real power.config.json and .power/ pass the gate", () => {
    const r = checkPowerSources();
    expect(r.problems).toEqual([]);
    expect(r.registered).toBeGreaterThan(0);
  });
});
