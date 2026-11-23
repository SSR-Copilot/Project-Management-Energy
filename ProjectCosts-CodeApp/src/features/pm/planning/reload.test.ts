/**
 * UT-PLAN-OPT-2xx — the Planning reload safety net (OPT-13). Every table a Planning plan builder writes must refresh every query that
 * reads it. BEFORE (unmodified tree): every kind invalidated `qk.planningAll` (project, row, permits, acquisition).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ES } from "@/data/dataverseNames";
import { qk } from "@/data/keys";
import {
  PLANNING_KIND_TABLES, PLANNING_TABLE_READERS, planningReloadKeys, type PlanningWriteKind,
} from "./reload";
import {
  clearAquisitionJob, deletePermitJob, emptyPlanningForm, saveAquisitionJob, savePermitJob, savePlanningJob,
  type AquisitionStatusRow, type PermitDraft, type PlanningProject, type PlanningRecord,
} from "./rules";
import type { PlanJob } from "@/data/usePlanWrite";
import type { WritePlan } from "@/data/writePlan";

const PID = "11111111-1111-1111-1111-111111111111";
const text = (keys: readonly unknown[]) => keys.map((k) => JSON.stringify(k));
const project: PlanningProject = {
  id: PID, projectNumber: "DE-1", projectName: "N", endDate: null, projectStartDate: null, totalCapacity: null, netYieldP50: null,
  clusterStateName: null, countryId: "c-1", owningBusinessUnitId: "bu-1",
};
const planning = { id: "pp-1", owningBusinessUnitId: "bu-1" } as PlanningRecord;
const draft: PermitDraft = { name: "BImSchG", submissionDate: "2026-04-01", submissionDateType: 1, approvalDate: "2027-02-01", approvalDateType: 1 };
const row = { id: "as-1", typeId: "at-1", typeName: "x", typeOrder: 1, typeKind: 1, secured: 1, required: 2, percentage: 0.5 } as AquisitionStatusRow;

const JOBS: Record<PlanningWriteKind, PlanJob[]> = {
  planning: [savePlanningJob(emptyPlanningForm(), project, planning), savePlanningJob(emptyPlanningForm(), project, null)],
  permit: [savePermitJob(draft, null, planning), savePermitJob(draft, "pm-1", planning), deletePermitJob("pm-1")],
  aquisition: [saveAquisitionJob({ secured: "1", required: "2" }, row, project), clearAquisitionJob(row)],
};
const tablesOf = (jobs: PlanJob[]) => new Set(jobs.flatMap((j) => (j.plan as WritePlan).writes.map((w) => w.entitySet)));

describe("Planning reload (OPT-13)", () => {
  it("UT-PLAN-OPT-201 the keys per kind: permit -> permits, acquisition -> acquisition, planning -> row + project", () => {
    expect(text(planningReloadKeys(PID, "permit"))).toEqual(text([qk.planning(PID, "permits")]));
    expect(text(planningReloadKeys(PID, "aquisition"))).toEqual(text([qk.planning(PID, "aquisition")]));
    expect(text(planningReloadKeys(PID, "planning"))).toEqual(text([qk.planning(PID, "row"), qk.planning(PID, "project")]));
  });

  it("UT-PLAN-OPT-202 every table a real plan builder writes is in its kind's table list, and all that table's readers are refreshed", () => {
    for (const kind of Object.keys(JOBS) as PlanningWriteKind[]) {
      const written = tablesOf(JOBS[kind]);
      expect(written.size).toBeGreaterThan(0);
      for (const table of written) {
        expect(PLANNING_KIND_TABLES[kind]).toContain(table);
        for (const reader of text(PLANNING_TABLE_READERS[table]!(PID))) expect(text(planningReloadKeys(PID, kind))).toContain(reader);
      }
    }
  });

  it("UT-PLAN-OPT-203 rules.ts writes no table that is not mapped (a table added to a builder fails here until it is mapped)", () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "rules.ts"), "utf8");
    const sets = new Set([...src.matchAll(/entitySet:\s*ES\.(\w+)/g)].map((m) => (ES as Record<string, string>)[m[1]!]));
    for (const set of sets) expect(Object.keys(PLANNING_TABLE_READERS)).toContain(set);
  });

  it("UT-PLAN-OPT-204 every query hooks.ts defines is mapped to a table; the permit key is a prefix of the planning-id key", () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "hooks.ts"), "utf8");
    const parts = [...src.matchAll(/queryKey:\s*qk\.planning\([^,]+,\s*"(\w+)"/g)].map((m) => m[1]);
    const mapped = Object.values(PLANNING_TABLE_READERS).flatMap((f) => f(PID).map((k) => (k as readonly unknown[])[2]));
    expect(parts.sort()).toEqual(["aquisition", "permits", "project", "row"]);
    for (const p of parts) expect(mapped).toContain(p);
    const [prefix] = planningReloadKeys(PID, "permit") as readonly (readonly unknown[])[];
    expect(qk.planning(PID, "permits", "pp-1").slice(0, prefix!.length)).toEqual([...prefix!]);
  });

  it("UT-PLAN-OPT-205 the permit Save is only the permit key, so it no longer re-runs the acquisition seed check (BEFORE: it refetched the acquisition query too)", () => {
    expect(text(planningReloadKeys(PID, "permit"))).not.toContain(JSON.stringify(qk.planning(PID, "aquisition")));
    expect(ES.permits).toBe("vsb_permits");
  });
});
