/**
 * UT-TEAM-OPT-0xx — Team reads (optimization programme B5a, OPT-14).
 *
 * The readers and Entra are counted through fakes: `fetchAll` by label, `getEntraPeople` by id. The BEFORE numbers
 * (recorded on the unmodified tree: 1 members read + 1 descriptions read + 20 Entra lookups, 20 in flight at once for a team
 * of 20) are in the title of UT-TEAM-OPT-001.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  fetchAllLabels: [] as string[],
  entraCalls: [] as string[][],
  members: [] as Record<string, unknown>[],
  descriptions: [] as Record<string, unknown>[],
  projects: [] as Record<string, unknown>[],
  /** Ids whose Entra lookup fails. */
  failing: new Set<string>(),
  inFlight: 0,
  peak: 0,
}));

vi.mock("./client", () => ({
  fetchAll: async (label: string) => {
    h.fetchAllLabels.push(label);
    return label === "load the project members" ? h.members : h.descriptions;
  },
  fetchPage: async () => h.projects,
}));

vi.mock("./adminGatesApprovals", () => ({
  getEntraPeople: async (ids: readonly string[]) => {
    h.entraCalls.push([...ids]);
    h.inFlight += 1; h.peak = Math.max(h.peak, h.inFlight);
    await new Promise((r) => setTimeout(r, 1));
    h.inFlight -= 1;
    const out = new Map<string, { displayName: string; mail: string }>();
    for (const id of ids) {
      if (h.failing.has(id)) throw new Error(`no directory entry for ${id}`);
      out.set(id, { displayName: `Name ${id}`, mail: `${id}@vsb.energy` });
    }
    return out;
  },
}));

import { listMemberDescriptions, listTeamMembers } from "./team";
import { lookupPersonCached, PERSON_CACHE_MS, PERSON_LOOKUP_CONCURRENCY, resetPersonCache, setPersonCacheMs } from "./personCache";
import { memberDescription, teamTableRows, type ProjectMemberRow } from "@/features/pm/team/rules";

const PID = "11111111-1111-1111-1111-111111111111";
const FORMATTED = "_vsb_member_value@OData.Community.Display.V1.FormattedValue";

const MEMBER = (i: number, description: string | null = "d-1"): Record<string, unknown> => ({
  vsb_projectmembersid: `m-${i}`, vsb_name: `MBR-${i}`, vsb_comment: null, _vsb_member_value: `e-${i}`,
  _vsb_projectdescription_value: description,
  "vsb_position@OData.Community.Display.V1.FormattedValue": null,
});

beforeEach(() => {
  resetPersonCache(); setPersonCacheMs(null); vi.useRealTimers();
  h.fetchAllLabels = []; h.entraCalls = []; h.failing = new Set(); h.inFlight = 0; h.peak = 0;
  h.members = Array.from({ length: 20 }, (_, i) => MEMBER(i + 1));
  h.descriptions = [
    { vsb_projectmemberdescriptionsid: "d-1", vsb_name: "Properties", vsb_projectdescription: "Site lead" },
    { vsb_projectmemberdescriptionsid: "d-2", vsb_name: "Legal", vsb_projectdescription: null },
  ];
});

/** The row building of the code BEFORE OPT-14 (descriptions read inside, every person asked at once), kept as the oracle. */
function oldRows(
  members: Record<string, unknown>[], descriptions: { id: string; description: string | null }[],
  names: Map<string, { displayName: string; mail: string }>,
): ProjectMemberRow[] {
  const byId = new Map(descriptions.map((d) => [d.id, d]));
  const str = (v: unknown) => (typeof v === "string" && v !== "" ? v : null);
  return members.map((r) => {
    const id = str(r._vsb_member_value);
    const p = id ? names.get(id) : undefined;
    const descriptionId = str(r._vsb_projectdescription_value);
    return {
      id: String(r.vsb_projectmembersid),
      displayName: id ? p?.displayName || str(r[FORMATTED]) || "" : "",
      memberRowId: id, mail: id ? p?.mail || null : null, descriptionId,
      description: descriptionId ? byId.get(descriptionId)?.description ?? null : null,
      positionLabel: str(r["vsb_position@OData.Community.Display.V1.FormattedValue"]),
      comment: str(r.vsb_comment) ?? "",
    };
  });
}

describe("listTeamMembers (OPT-14)", () => {
  it("UT-TEAM-OPT-001 a team of 20, descriptions handed over: 1 members read, 0 descriptions reads, 20 Entra lookups, 6 at once (BEFORE: 1 + 1 + 20, 20 at once)", async () => {
    const rows = await listTeamMembers(PID, [{ id: "d-1", name: "Properties", description: "Site lead" }]);
    expect(rows).toHaveLength(20);
    expect(h.fetchAllLabels).toEqual(["load the project members"]);
    expect(h.entraCalls).toHaveLength(20);
    expect(h.peak).toBe(PERSON_LOOKUP_CONCURRENCY);
  });

  it("UT-TEAM-OPT-002 without descriptions handed over the loader still reads them itself (usable alone)", async () => {
    await listTeamMembers(PID);
    expect(h.fetchAllLabels.filter((l) => l === "load the project member descriptions")).toHaveLength(1);
  });

  it("UT-TEAM-OPT-003 a second load (a reload after a save) asks Entra for nobody it has seen: 0 requests (BEFORE: 20)", async () => {
    await listTeamMembers(PID, []);
    h.entraCalls = [];
    await listTeamMembers(PID, []);
    expect(h.entraCalls).toHaveLength(0);
  });

  it("UT-TEAM-OPT-004 a newly added member is the only new Entra lookup", async () => {
    await listTeamMembers(PID, []);
    h.entraCalls = [];
    h.members = [...h.members, MEMBER(21)];
    await listTeamMembers(PID, []);
    expect(h.entraCalls).toEqual([["e-21"]]);
  });

  it("UT-TEAM-OPT-005 two loads started together share the in-flight lookups", async () => {
    await Promise.all([listTeamMembers(PID, []), listTeamMembers(PID, [])]);
    expect(h.entraCalls).toHaveLength(20);
  });

  it("UT-TEAM-OPT-006 the answer is reused for 30 minutes and asked again after that (fake clock)", async () => {
    expect(PERSON_CACHE_MS).toBe(30 * 60_000);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-23T10:00:00Z"));
    h.members = [MEMBER(1)];
    await listTeamMembers(PID, []);
    vi.setSystemTime(new Date("2026-11-23T10:29:00Z"));
    await listTeamMembers(PID, []);
    expect(h.entraCalls).toHaveLength(1);
    vi.setSystemTime(new Date("2026-11-23T10:31:00Z"));
    await listTeamMembers(PID, []);
    expect(h.entraCalls).toHaveLength(2);
  });

  it("UT-TEAM-OPT-007 the switch: PERSON_CACHE_MS = 0 asks for every person on every load (the old behaviour)", async () => {
    setPersonCacheMs(0);
    h.members = [MEMBER(1), MEMBER(2)];
    await listTeamMembers(PID, []);
    await listTeamMembers(PID, []);
    expect(h.entraCalls).toHaveLength(4);
  });

  it("UT-TEAM-OPT-008 a failed lookup blanks that person only, is not remembered, and the others are unaffected", async () => {
    h.members = [MEMBER(1), { ...MEMBER(2), [FORMATTED]: "Formatted Two" }, MEMBER(3)];
    h.failing = new Set(["e-2"]);
    const rows = await listTeamMembers(PID, []);
    expect(rows.map((r) => r.displayName)).toEqual(["Name e-1", "Formatted Two", "Name e-3"]);
    expect(rows[1]!.mail).toBeNull();
    h.failing = new Set(); h.entraCalls = [];
    const again = await listTeamMembers(PID, []);
    expect(again[1]!.displayName).toBe("Name e-2");
    expect(h.entraCalls).toEqual([["e-2"]]);
  });

  it("UT-TEAM-OPT-009 DIFFERENTIAL: the rows and the merged table equal the pre-OPT-14 row building, with a value, a promise and no hand-over", async () => {
    const descriptions = [{ id: "d-1", name: "Properties", description: "Site lead" }, { id: "d-2", name: "Legal", description: null }];
    h.members = [
      MEMBER(1, "d-1"), MEMBER(2, "d-2"), MEMBER(3, null), MEMBER(4, "d-unknown"),
      { ...MEMBER(5), _vsb_member_value: null, vsb_comment: "note", "vsb_position@OData.Community.Display.V1.FormattedValue": "Owner" },
    ];
    h.descriptions = descriptions.map((d) => ({ vsb_projectmemberdescriptionsid: d.id, vsb_name: d.name, vsb_projectdescription: d.description }));
    h.failing = new Set(["e-4"]);
    const names = new Map([1, 2, 3].map((i) => [`e-${i}`, { displayName: `Name e-${i}`, mail: `e-${i}@vsb.energy` }]));
    const expected = oldRows(h.members, descriptions, names);
    for (const handed of [descriptions, Promise.resolve(descriptions), undefined]) {
      resetPersonCache();
      const rows = await listTeamMembers(PID, handed);
      expect(rows).toEqual(expected);
      expect(rows.map(memberDescription)).toEqual(expected.map(memberDescription));
      expect(teamTableRows([], rows)).toEqual(teamTableRows([], expected));
    }
  });

  it("UT-TEAM-OPT-010 listMemberDescriptions is still the whole table (the dropdown)", async () => {
    expect(await listMemberDescriptions()).toHaveLength(2);
  });

  it("UT-TEAM-OPT-901 an EMPTY answer is not remembered: the next call within the window asks again, and then the person is remembered", async () => {
    const person = { id: "e-1", displayName: "Ann", mail: "ann@vsb.energy" };
    const answers = [new Map<string, typeof person>(), new Map([["e-1", person]])];
    const ask = vi.fn(async () => answers.shift()!);
    expect((await lookupPersonCached("e-1", ask)).size).toBe(0);
    const second = await lookupPersonCached("e-1", ask);
    expect(ask).toHaveBeenCalledTimes(2);
    expect(second.get("e-1")).toEqual(person);
    await lookupPersonCached("e-1", ask);
    expect(ask).toHaveBeenCalledTimes(2);
  });

  it("UT-TEAM-OPT-902 a non-empty answer is remembered for the window and asked again after it; the switch (0) still never remembers", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-23T10:00:00Z"));
    const ask = vi.fn(async (id: string) => new Map([[id, { id, displayName: id, mail: `${id}@vsb.energy` }]]));
    await lookupPersonCached("e-1", ask);
    vi.setSystemTime(new Date("2026-11-23T10:29:00Z"));
    await lookupPersonCached("e-1", ask);
    expect(ask).toHaveBeenCalledTimes(1);
    vi.setSystemTime(new Date("2026-11-23T10:31:00Z"));
    await lookupPersonCached("e-1", ask);
    expect(ask).toHaveBeenCalledTimes(2);
    setPersonCacheMs(0);
    await lookupPersonCached("e-2", ask);
    await lookupPersonCached("e-2", ask);
    expect(ask).toHaveBeenCalledTimes(4);
  });
});
