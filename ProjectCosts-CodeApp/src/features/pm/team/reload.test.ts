/**
 * UT-TEAM-OPT-2xx — the Team reload safety net (OPT-13). Every table a Team plan writes must refresh every query that reads it.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ES } from "@/data/dataverseNames";
import { qk } from "@/data/keys";
import { TEAM_TABLE_READERS, TEAM_WRITE_TABLES, teamReloadKeys } from "./reload";
import { planDeleteMember, planSaveMember, type MemberDraft, type TeamProject } from "./rules";

const PID = "11111111-1111-1111-1111-111111111111";
const text = (keys: readonly unknown[]) => keys.map((k) => JSON.stringify(k));

const project: TeamProject = {
  id: PID, projectNumber: "DE-1", endDate: null, projectStartDate: null, totalCapacity: null, netYieldP50: null,
  clusterStateName: null, owningBusinessUnitId: "bu-1", projectManager: null, deputyProjectManager: null,
};
const draft: MemberDraft = {
  memberId: null, person: { rowId: "e-1", displayName: "Cara", mail: "c@x" }, descriptionId: "d-1", comment: "",
} as MemberDraft;

describe("Team reload (OPT-13)", () => {
  it("UT-TEAM-OPT-201 a write refreshes the members query only: not the project, not the descriptions", () => {
    expect(text(teamReloadKeys(PID))).toEqual(text([qk.team(PID, "members")]));
  });

  it("UT-TEAM-OPT-202 every table a real Team plan writes has all its readers in the reload list", () => {
    const plans = [
      planSaveMember(draft, project, []),
      planSaveMember({ ...draft, memberId: "m-1" }, project, []),
      planDeleteMember("m-1"),
    ];
    const written = new Set(plans.flatMap((p) => p.writes.map((w) => w.entitySet)));
    expect([...written]).toEqual([ES.projectMembers]);
    for (const table of written) {
      const readers = text(TEAM_TABLE_READERS[table]!(PID));
      expect(readers.length).toBeGreaterThan(0);
      for (const reader of readers) expect(text(teamReloadKeys(PID))).toContain(reader);
    }
    expect(TEAM_WRITE_TABLES).toEqual([...written]);
  });

  it("UT-TEAM-OPT-203 every query hooks.ts defines is mapped to a table (a new query fails here until it is mapped)", () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "hooks.ts"), "utf8");
    const used = new Set([...src.matchAll(/queryKey:\s*qk\.(\w+)\(?([^)]*)\)?/g)].map((m) => `${m[1]}${m[1] === "team" ? `:${m[2]!.split(",")[1]!.trim()}` : ""}`));
    const mapped = new Set(Object.values(TEAM_TABLE_READERS).flatMap((f) => f(PID).map((k) => {
      const [, , part] = k as readonly unknown[];
      return k[0] === "pmTeam" ? `team:${JSON.stringify(part)}` : "teamMemberDescriptions";
    })));
    // The people search (`entraPeopleSearch`) reads `aadusers`, which nothing here writes.
    used.delete("entraPeopleSearch");
    for (const u of used) expect(mapped).toContain(u);
  });
});
