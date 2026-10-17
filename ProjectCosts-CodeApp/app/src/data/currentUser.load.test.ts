/**
 * `loadCurrentUser` — the role-read failure handling behind `SettingsGate` (G4, 05-gap-analysis M2):
 * every failed read is traced, the flags stay fail-closed, and `rolesResolved` tells the gate
 * whether "not an admin" is a fact or a read failure.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

let behaviour: Record<string, unknown[] | Error> = {};

vi.mock("./client", () => ({
  fetchAll: async (label: string) => {
    const result = behaviour[label] ?? [];
    if (result instanceof Error) throw result;
    return result;
  },
}));
vi.mock("@/generated/services/AadusersService", () => ({ AadusersService: {} }));
vi.mock("@/generated/services/RolesService", () => ({ RolesService: {} }));
vi.mock("@/generated/services/SystemusersService", () => ({ SystemusersService: {} }));
vi.mock("@/generated/services/TeamsService", () => ({ TeamsService: {} }));
vi.mock("@/generated/services/Vsb_countriesService", () => ({ Vsb_countriesService: {} }));
vi.mock("@/platform/telemetry", () => ({ trace: vi.fn() }));

import { trace } from "@/platform/telemetry";
import { loadCurrentUser, ROLE_APPLICATION_ADMINISTRATOR } from "./currentUser";

const OID = "11111111-1111-1111-1111-111111111111";
const USER = { systemuserid: "22222222-2222-2222-2222-222222222222", fullname: "Ada Admin" };
const ADMIN_ROLE = { roleid: "r1", name: ROLE_APPLICATION_ADMINISTRATOR };

const L = {
  user: "look up the signed-in user",
  direct: "read the signed-in user's security roles",
  teams: "read the signed-in user's teams",
  teamRoles: "read the roles of the signed-in user's teams",
  countries: "read the country list for the user's business units",
};

beforeEach(() => {
  behaviour = { [L.user]: [USER] };
  vi.mocked(trace).mockClear();
});

describe("loadCurrentUser — role resolution", () => {
  it("UT-CU-030 all reads succeed: roles resolved, nothing traced", async () => {
    behaviour[L.direct] = [ADMIN_ROLE];
    const user = await loadCurrentUser(OID);
    expect(user.isApplicationAdministrator).toBe(true);
    expect(user.rolesResolved).toBe(true);
    expect(trace).not.toHaveBeenCalled();
  });

  it("UT-CU-031 a failed role read is traced and leaves roles unresolved (fail-closed)", async () => {
    behaviour[L.direct] = new Error("403 role");
    const user = await loadCurrentUser(OID);
    expect(user.isApplicationAdministrator).toBe(false);
    expect(user.rolesResolved).toBe(false);
    expect(trace).toHaveBeenCalledWith("warning", expect.stringContaining("security roles"), expect.any(Error));
  });

  it("UT-CU-032 a failed team read keeps a directly held admin role but marks roles unresolved", async () => {
    behaviour[L.direct] = [ADMIN_ROLE];
    behaviour[L.teams] = new Error("403 team");
    const user = await loadCurrentUser(OID);
    expect(user.isApplicationAdministrator).toBe(true);
    expect(user.rolesResolved).toBe(false);
    expect(trace).toHaveBeenCalledWith("warning", expect.stringContaining("team memberships"), expect.any(Error));
  });

  it("UT-CU-033 a failed country read costs the country row only — roles stay resolved", async () => {
    behaviour[L.direct] = [ADMIN_ROLE];
    behaviour[L.countries] = new Error("timeout");
    const user = await loadCurrentUser(OID);
    expect(user.rolesResolved).toBe(true);
    expect(trace).toHaveBeenCalledTimes(1);
  });

  it("UT-CU-034 a missing or unreadable user row leaves roles unresolved and is traced", async () => {
    behaviour[L.user] = [];
    expect((await loadCurrentUser(OID)).rolesResolved).toBe(false);
    behaviour[L.user] = new Error("network");
    const user = await loadCurrentUser(OID);
    expect(user.rolesResolved).toBe(false);
    expect(user.fullName).toBeUndefined();
    expect(trace).toHaveBeenCalledWith("warning", expect.stringContaining("systemuser"), expect.any(Error));
  });

  it("UT-CU-035 no session id: nothing is read and roles are not resolved", async () => {
    const user = await loadCurrentUser(undefined);
    expect(user.rolesResolved).toBe(false);
    expect(user.isApplicationAdministrator).toBe(false);
  });
});
