/**
 * The signed-in user's lookups at start-up (D119): how many reads there are, which of
 * them wait for which, what they ask the server for, and that the answer is the same as before.
 *
 * The services are replaced by gated fakes, so every test controls when each read finishes and can
 * see which reads had STARTED by then. That is the measurable form of "round trips on the critical
 * path": a read that has started before another finishes does not wait for it.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { startupFlags } from "@/app/startupFlags";

interface Call { name: string; filter: string | undefined; release: (rows: unknown[]) => void }
const log = vi.hoisted(() => ({ calls: [] as Call[], auto: undefined as undefined | ((c: { name: string; filter?: string }) => unknown[]) }));

function fake(name: string) {
  return {
    getAll: (options: { filter?: string }) => new Promise((resolve) => {
      const finish = (rows: unknown[]) => resolve({ success: true, data: rows, skipToken: undefined });
      const call = { name, filter: options.filter, release: finish };
      log.calls.push(call);
      if (log.auto) finish(log.auto({ name, ...(options.filter === undefined ? {} : { filter: options.filter }) }));
    }),
  };
}

vi.mock("@/generated/services/SystemusersService", () => ({ SystemusersService: fake("systemusers") }));
vi.mock("@/generated/services/AadusersService", () => ({ AadusersService: fake("aadusers") }));
vi.mock("@/generated/services/RolesService", () => ({ RolesService: fake("roles") }));
vi.mock("@/generated/services/TeamsService", () => ({ TeamsService: fake("teams") }));
vi.mock("@/generated/services/Vsb_countriesService", () => ({ Vsb_countriesService: fake("countries") }));

import {
  BADGE_ROLE_NAMES, badgeRolesFilter, loadCurrentUser,
  ROLE_ALL_COUNTRIES, ROLE_APPLICATION_ADMINISTRATOR, ROLE_CONTROLLER_OWN_DATA,
} from "./currentUser";

const ENTRA = "01213410-77e7-4122-b291-89e8f04d9dfd";
const USER_ID = "c76bb8c9-bb08-f011-bae2-6045bd9a4b33";
const TEAM_ID = "ccdf7563-89ef-ef11-be20-000d3a22ea8e";
const flush = () => new Promise((r) => setTimeout(r, 0));
const started = () => log.calls.map((c) => c.name);
const release = (name: string, rows: unknown[]) => log.calls.filter((c) => c.name === name).forEach((c) => c.release(rows));

const optimised = startupFlags.parallelUserLookups;
beforeEach(() => {
  log.calls.length = 0;
  log.auto = undefined;
  startupFlags.parallelUserLookups = optimised;
});

describe("the signed-in user's start-up lookups", () => {
  it("UT-CU-100 starts the directory entry and the country map with the user row, not after it", async () => {
    startupFlags.parallelUserLookups = true;
    const done = loadCurrentUser(ENTRA);
    await flush();
    // Nothing has finished, and three reads are already out.
    expect(started().sort()).toEqual(["aadusers", "countries", "systemusers"]);
    log.auto = () => [];
    log.calls.forEach((c) => c.release([]));
    await done;
  });

  it("UT-CU-101 the critical path is three round trips: user, then teams, then the team's roles", async () => {
    startupFlags.parallelUserLookups = true;
    const done = loadCurrentUser(ENTRA);
    await flush();
    release("aadusers", [{ companyname: "Xebia" }]);
    release("countries", []);
    await flush();
    // The user row has not come back, so no role or team read can have started: they need its id.
    expect(started()).not.toContain("teams");
    expect(started()).not.toContain("roles");

    release("systemusers", [{ systemuserid: USER_ID, fullname: "A B", internalemailaddress: "a@b.c" }]);
    await flush();
    // Round trip 2: the direct roles and the teams START TOGETHER.
    expect(started().filter((n) => n === "roles")).toHaveLength(1);
    expect(started()).toContain("teams");

    release("teams", [{ teamid: TEAM_ID }]);
    await flush();
    // Round trip 3: the team's roles, the only read left that depends on another.
    expect(started().filter((n) => n === "roles")).toHaveLength(2);
    release("roles", []);
    const user = await done;
    expect(user.fullName).toBe("A B");
    expect(user.companyName).toBe("Xebia");
    // Six reads in all (user, directory, countries, direct roles, teams, team roles): as before; only their order changed.
    expect(log.calls).toHaveLength(6);
  });

  it("UT-CU-102 with the switch off the old chain is back: the directory entry waits for the user row", async () => {
    startupFlags.parallelUserLookups = false;
    const done = loadCurrentUser(ENTRA);
    await flush();
    expect(started()).toEqual(["systemusers"]);
    release("systemusers", [{ systemuserid: USER_ID }]);
    await flush();
    expect(started()).toEqual(["systemusers", "aadusers"]);
    release("aadusers", []);
    await flush();
    // Teams and direct roles, then the team roles, then (last) the country map: five deep.
    release("teams", [{ teamid: TEAM_ID }]);
    await flush();
    expect(started()).not.toContain("countries");
    release("roles", []);
    await flush();
    release("countries", []);
    await done;
  });

  it("UT-CU-103 asks the server only for the roles the badge reads, and keeps the association", () => {
    startupFlags.parallelUserLookups = true;
    const filter = badgeRolesFilter("systemuserroles_association/any(o:o/systemuserid eq x)")!;
    for (const name of BADGE_ROLE_NAMES) expect(filter).toContain(`name eq '${name}'`);
    expect(filter).toContain("systemuserroles_association/any(o:o/systemuserid eq x)");
    expect(BADGE_ROLE_NAMES).toEqual(expect.arrayContaining([
      ROLE_ALL_COUNTRIES, ROLE_APPLICATION_ADMINISTRATOR, ROLE_CONTROLLER_OWN_DATA,
      "VSB - Project Manager Own Projects", "VSB - Project Data Own Country",
    ]));
    // Off: exactly the old filter.
    startupFlags.parallelUserLookups = false;
    expect(badgeRolesFilter("assoc")).toBe("assoc");
  });

  it("UT-CU-104 both role reads (direct and via teams) carry the name filter", async () => {
    startupFlags.parallelUserLookups = true;
    log.auto = ({ name }) => name === "systemusers" ? [{ systemuserid: USER_ID }] : name === "teams" ? [{ teamid: TEAM_ID }] : [];
    await loadCurrentUser(ENTRA);
    const roleReads = log.calls.filter((c) => c.name === "roles");
    expect(roleReads).toHaveLength(2);
    for (const r of roleReads) expect(r.filter).toContain(`name eq '${ROLE_ALL_COUNTRIES}'`);
  });

  it("UT-CU-105 the answer is the same either way, whatever roles the user holds", async () => {
    // A server that honours the name filter returns a SUBSET of what the old read returned; the badge
    // reads only that subset. Simulated with a role set mixing read and unread names and both reach paths.
    const BU = { fr: "bu-fr", de: "bu-de" };
    const roleRows = [
      { roleid: "r1", name: "VSB - Project Manager Own Projects", _businessunitid_value: BU.fr },
      { roleid: "r2", name: "VSB - Project Data Own Country", _businessunitid_value: BU.de },
      { roleid: "r3", name: "VSB - Application Administrator", _businessunitid_value: BU.fr },
      { roleid: "r4", name: "VSB - Something Else", _businessunitid_value: BU.fr },
      { roleid: "r5", name: "System Administrator", _businessunitid_value: BU.fr },
      { roleid: "r6", name: "vsb - controller own data", _businessunitid_value: BU.fr }, // case differs: never matched
      { roleid: "r7", name: ROLE_CONTROLLER_OWN_DATA },
    ];
    const serve = (filtered: boolean) => ({ name, filter }: { name: string; filter?: string }) => {
      if (name === "systemusers") return [{ systemuserid: USER_ID, fullname: "A", internalemailaddress: "a@x" }];
      if (name === "aadusers") return [{ companyname: "Xebia" }];
      if (name === "teams") return [{ teamid: TEAM_ID }];
      if (name === "countries") return [{ vsb_name: "France", _vsb_businessunit_value: BU.fr }, { vsb_name: "Germany", _vsb_businessunit_value: BU.de }];
      if (name !== "roles") return [];
      return filtered ? roleRows.filter((r) => filter?.includes(`name eq '${r.name}'`)) : roleRows;
    };

    startupFlags.parallelUserLookups = false;
    log.auto = serve(false);
    const before = await loadCurrentUser(ENTRA);
    startupFlags.parallelUserLookups = true;
    log.calls.length = 0;
    log.auto = serve(true);
    const after = await loadCurrentUser(ENTRA);

    expect(after).toEqual(before);
    expect(after.isApplicationAdministrator).toBe(true);
    expect(after.isControllerOwnData).toBe(true);
    // Own-country roles: France (r1) and Germany (r2), once each via the direct read and once via the
    // team read, deduped by role id.
    expect(after.editableCountries.sort()).toEqual(["France", "Germany"]);
  });

  it("UT-CU-106 a failing directory read costs the company row only, as before", async () => {
    startupFlags.parallelUserLookups = true;
    log.auto = ({ name }) => {
      if (name === "aadusers") throw new Error("Graph is down");
      return name === "systemusers" ? [{ systemuserid: USER_ID, fullname: "A" }] : [];
    };
    // `fake().getAll` throws inside the promise executor: that rejects the read, which is caught per read.
    const user = await loadCurrentUser(ENTRA);
    expect(user.fullName).toBe("A");
    expect(user.companyName).toBeUndefined();
  });
});
