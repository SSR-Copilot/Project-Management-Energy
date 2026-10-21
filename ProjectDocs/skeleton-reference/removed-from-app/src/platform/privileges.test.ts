/**
 * `platform/privileges` — `DataSourceInfo` / `RecordInfo`, ported. Unit tests.
 *
 * New prefix (`UT-PRIV-nnn`). This module replaced three screens' habit of deriving edit
 * rights from role names, so the properties worth pinning are not "the admin can write"
 * but the FAIL-SAFE ones: an unmodelled table denies, an unmodelled role grants nothing,
 * a table denies until the platform read lands, and every error path returns a deny
 * instead of throwing. Each of those is a path that, if it fails open, fails open silently.
 *
 * HOW THE TWO MODES ARE TESTED. `dataMode` is a module-level `const` read from
 * `import.meta.env` in `./powerClient`, so it cannot be reassigned from a test, and this
 * module also holds session state (role names, the privilege-name cache, the record cache)
 * in module-level variables. The repo's existing tests take the lightest tool that works —
 * `projectQueries.test.ts` uses `vi.spyOn(dataClient, "list")` and leaves the module graph
 * alone — but a spy cannot change a `const` binding, and `reset()` cannot change a mode.
 * So this file goes one step further and no further: `vi.resetModules()` plus `vi.doMock`
 * (the un-hoisted form, so each test picks its own mode) and a dynamic `import()`. Every
 * test therefore gets a FRESH copy of the module with its own empty caches, which is also
 * what makes the cache assertions meaningful.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { privilegeName, ROLES, SPELLING_CONFLICTS } from "@/security";
import { ES } from "@/data/entities";
import type { RecordPrivileges, TablePrivileges } from "./privileges";

type Mod = typeof import("./privileges");
/**
 * The module namespace merged with its own `privileges` facade, so a test can reach both
 * `DENY_TABLE` (a module export) and `ensure` / `reset` (the facade's aliases for
 * `ensurePrivileges` / `resetPrivileges`) through one object — which is also how a screen
 * sees this module, since screens import the facade.
 */
type Api = Mod & Mod["privileges"];

interface ClientStub {
  callAction: ReturnType<typeof vi.fn>;
  list: ReturnType<typeof vi.fn>;
}

/**
 * Load a fresh `./privileges` in the requested data mode, with `./dataClient` stubbed.
 *
 * `powerClient` is replaced wholesale because `dataMode` is the only thing this module
 * imports from it, and replacing the binding is the only way to reach the `power` branch.
 */
async function load(
  mode: "mock" | "power",
  client: Partial<ClientStub> = {},
): Promise<{ privileges: Api; client: ClientStub }> {
  vi.resetModules();
  const stub: ClientStub = {
    callAction: vi.fn(async () => ({})),
    list: vi.fn(async () => ({ rows: [] })),
    ...client,
  };
  vi.doMock("./powerClient", () => ({ dataMode: mode }));
  vi.doMock("./dataClient", () => ({ dataClient: stub }));
  const mod = (await import("./privileges")) as Mod;
  return { privileges: { ...mod, ...mod.privileges } as Api, client: stub };
}

const ROLE = {
  admin: ROLES.applicationAdministrator.name,
  controller: ROLES.controllerOwnData.name,
  allCountries: ROLES.projectDataAllCountries.name,
  ownCountry: ROLES.projectDataOwnCountry.name,
  pm: ROLES.projectManagerOwnProjects.name,
} as const;

/** A master-data table and a project table, by entity set. */
const MASTER_SET = "vsb_capexaccountlists";
const PROJECT_SET = ES.projects;

/** `RetrieveUserPrivileges` shaped as the platform returns it. */
const rolePrivileges = (names: string[]) => ({
  RolePrivileges: names.map((privilegename) => ({ privilegename })),
});

const deferred = <T>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
};

beforeEach(() => {
  // `telemetry.trace` mirrors every deny to the console under DEV, and these tests deny a
  // lot on purpose.
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.doUnmock("./powerClient");
  vi.doUnmock("./dataClient");
});

/* ══════════════════════════════════════════════════════════════════ mock mode ══ */

describe("UT-PRIV mock mode — resolved from the matrix", () => {
  it("UT-PRIV-001 an unmodelled table denies every privilege and never guesses", async () => {
    // A table missing from `security/matrix.json` is a GAP IN THE MATRIX. A permissive
    // default would offer the command, the server would refuse it, and the gap would
    // survive because nothing looks broken until a user clicks.
    const { privileges } = await load("mock");
    privileges.setSessionRoles([ROLE.admin]);
    const p = privileges.forTable("vsb_nosuchtable");
    expect(p).toEqual(privileges.DENY_TABLE);
    expect(p).toBe(privileges.DENY_TABLE);
    // Even for the role that holds everything on every table it does know about.
    expect(privileges.forTable(MASTER_SET).canDelete).toBe(true);
  });

  it("UT-PRIV-002 an unmodelled ROLE NAME grants nothing and does not throw", async () => {
    const { privileges } = await load("mock");
    expect(() => privileges.setSessionRoles(["VSB - Not A Real Role", "Typo"])).not.toThrow();
    const p = privileges.forTable(PROJECT_SET);
    expect(p).toEqual({ canCreate: false, canRead: false, canWrite: false, canDelete: false });
    // And it is REPORTED rather than swallowed: bootstrap traces this list, because a role
    // name that grants nothing is either a typo or a role somebody forgot to model.
    expect(privileges.unmodelledRoles()).toEqual(["VSB - Not A Real Role", "Typo"]);
    // A record probe on the same session is equally empty, and equally quiet.
    await expect(privileges.forRecord(PROJECT_SET, "p-1")).resolves.toEqual(privileges.DENY_RECORD);
  });

  it("UT-PRIV-003 a modelled role gets exactly the matrix answer", async () => {
    const { privileges } = await load("mock");

    privileges.setSessionRoles([ROLE.pm]);
    expect(privileges.forTable(MASTER_SET)).toEqual({
      canCreate: false, canRead: true, canWrite: false, canDelete: false,
    });
    expect(privileges.forTable(PROJECT_SET)).toEqual({
      canCreate: true, canRead: true, canWrite: true, canDelete: true,
    });
    expect(privileges.unmodelledRoles()).toEqual([]);

    privileges.setSessionRoles([ROLE.controller]);
    // The controller maintains master data and may not delete it, and holds no project write.
    expect(privileges.forTable(MASTER_SET)).toEqual({
      canCreate: true, canRead: true, canWrite: true, canDelete: false,
    });
    expect(privileges.forTable(PROJECT_SET)).toEqual({
      canCreate: false, canRead: true, canWrite: false, canDelete: false,
    });
  });

  it("UT-PRIV-004 two roles get the WIDER answer, not the first or the last", async () => {
    const { privileges } = await load("mock");

    // The controller cannot write project data; the country role can. The union can.
    privileges.setSessionRoles([ROLE.controller, ROLE.ownCountry]);
    expect(privileges.forTable(PROJECT_SET).canWrite).toBe(true);
    // …and the same in the other order, which is the bug a union written as a lookup makes.
    privileges.setSessionRoles([ROLE.ownCountry, ROLE.controller]);
    expect(privileges.forTable(PROJECT_SET).canWrite).toBe(true);

    // The other direction: master-data delete comes only from the administrator, so the
    // union of a project role with the admin must still allow it.
    privileges.setSessionRoles([ROLE.pm, ROLE.admin]);
    expect(privileges.forTable(MASTER_SET).canDelete).toBe(true);
    privileges.setSessionRoles([ROLE.admin, ROLE.pm]);
    expect(privileges.forTable(MASTER_SET).canDelete).toBe(true);
    // And a union of two roles that both lack it still lacks it.
    privileges.setSessionRoles([ROLE.pm, ROLE.ownCountry]);
    expect(privileges.forTable(MASTER_SET).canDelete).toBe(false);
  });

  it("UT-PRIV-005 forTable takes an entity set OR a logical name", async () => {
    const { privileges } = await load("mock");
    privileges.setSessionRoles([ROLE.allCountries]);
    // Repositories know tables by entity set; the platform's privilege names use the
    // logical name. Callers have whichever one they have.
    expect(privileges.forTable("vsb_projects")).toEqual(privileges.forTable("vsb_project"));
    expect(privileges.forTable("vsb_project").canWrite).toBe(true);
  });

  it("UT-PRIV-006 no session roles at all denies everything", async () => {
    const { privileges } = await load("mock");
    // The state before bootstrap has run. It must not be a permissive one.
    expect(privileges.forTable(PROJECT_SET)).toEqual(privileges.DENY_TABLE);
    expect(privileges.forTable(MASTER_SET)).toEqual(privileges.DENY_TABLE);
  });

  it("UT-PRIV-007 the mock record probe approximates from the table, including assign and share", async () => {
    const { privileges } = await load("mock");
    privileges.setSessionRoles([ROLE.allCountries]);
    // `assign` and `share` are not in `TablePrivileges`, so this is the only place they
    // are read — a record probe that dropped them would silently hide the Assign command.
    await expect(privileges.forRecord(PROJECT_SET, "p-1")).resolves.toEqual({
      canRead: true, canWrite: true, canDelete: true, canAssign: true, canShare: true,
    });

    privileges.setSessionRoles([ROLE.pm]);
    // The project manager holds share at `user` and assign at `none`.
    const p = await privileges.forRecord(PROJECT_SET, "p-1");
    expect(p.canAssign).toBe(false);
    expect(p.canShare).toBe(true);
  });

  it("UT-PRIV-008 forRecord denies for an unmodelled table and for a blank id", async () => {
    const { privileges } = await load("mock");
    privileges.setSessionRoles([ROLE.admin]);
    await expect(privileges.forRecord("vsb_nosuchtable", "id-1")).resolves.toBe(privileges.DENY_RECORD);
    await expect(privileges.forRecord(PROJECT_SET, "")).resolves.toBe(privileges.DENY_RECORD);
  });

  it("UT-PRIV-009 setSessionRoles clears the record cache", async () => {
    const { privileges } = await load("mock");

    privileges.setSessionRoles([ROLE.pm]);
    const before = await privileges.forRecord(MASTER_SET, "acc-1");
    expect(before.canWrite).toBe(false);

    // Same table, same id — a cache that survived the role change would answer `false`
    // for the rest of the session, which is exactly the stale-permission bug the cache
    // could introduce.
    privileges.setSessionRoles([ROLE.admin]);
    const after = await privileges.forRecord(MASTER_SET, "acc-1");
    expect(after.canWrite).toBe(true);
    expect(after.canDelete).toBe(true);
  });

  it("UT-PRIV-010 reset() clears the roles as well as the caches", async () => {
    const { privileges } = await load("mock");
    privileges.setSessionRoles([ROLE.admin]);
    expect(privileges.forTable(PROJECT_SET).canWrite).toBe(true);
    privileges.reset();
    expect(privileges.forTable(PROJECT_SET)).toEqual(privileges.DENY_TABLE);
    expect(privileges.unmodelledRoles()).toEqual([]);
    await expect(privileges.forRecord(PROJECT_SET, "p-1")).resolves.toEqual(privileges.DENY_RECORD);
  });

  it("UT-PRIV-011 ensure() is a no-op in mock mode and touches no client", async () => {
    const { privileges, client } = await load("mock");
    privileges.setSessionRoles([ROLE.admin]);
    await expect(privileges.ensure()).resolves.toBeUndefined();
    expect(client.callAction).not.toHaveBeenCalled();
    expect(client.list).not.toHaveBeenCalled();
  });

  it("UT-PRIV-024 a readOnly table reports read and refuses all three writes", async () => {
    /*
     * The `readOnly` mask reaching the UI. `vsb_countries` is a `reference` list: every
     * role must READ it or the Country rail is empty, and no role may create, write or
     * delete it — including the administrator, whose `_masterData` default would otherwise
     * grant all three at organization depth. A command bar that offers New on a reference
     * list is offering a request the server refuses.
     */
    const { privileges } = await load("mock");
    for (const role of [ROLE.admin, ROLE.controller, ROLE.pm]) {
      privileges.setSessionRoles([role]);
      expect(privileges.forTable("vsb_countries"), role).toEqual({
        canCreate: false, canRead: true, canWrite: false, canDelete: false,
      });
    }
    // A `platform` table behaves the same way, and the read is what bootstrap depends on.
    privileges.setSessionRoles([ROLE.admin]);
    expect(privileges.forTable("systemusers")).toEqual({
      canCreate: false, canRead: true, canWrite: false, canDelete: false,
    });
    // The union of every role does not add a write either.
    privileges.setSessionRoles(Object.values(ROLE));
    expect(privileges.forTable("vsb_countries").canWrite).toBe(false);
    expect(privileges.forTable("vsb_countries").canRead).toBe(true);
    // The contrast: a master-data table of the same `isMasterData` flag IS writable, so the
    // denials above come from the mask and not from an empty grant.
    expect(privileges.forTable(MASTER_SET).canWrite).toBe(true);
  });

  it("UT-PRIV-025 forTable resolves an aliased entity-set spelling", async () => {
    /*
     * Six tables are declared twice in `entities.ts` under different plurals and one
     * spelling of each pair is wrong. A repository built on the losing spelling has to get
     * the same answer as one built on the winning spelling — otherwise `forTable` denies it
     * everything and the screen goes quietly read-only, which is exactly the failure the
     * 86-table model was written to end.
     */
    const { privileges } = await load("mock");
    privileges.setSessionRoles([ROLE.admin]);
    // `vsb_projectdefaultchecklistses` is canonical; `vsb_projectdefaultchecklists` is the
    // alias `ES.projectDefaultChecklists` still carries.
    const canonical = privileges.forTable("vsb_projectdefaultchecklistses");
    const alias = privileges.forTable("vsb_projectdefaultchecklists");
    expect(alias).toEqual(canonical);
    expect(alias.canWrite).toBe(true);
    expect(alias).not.toEqual(privileges.DENY_TABLE);

    // Every declared conflict, both ways round, for every role — the answer must never
    // depend on which spelling the caller happened to import.
    for (const role of [ROLE.admin, ROLE.controller, ROLE.pm]) {
      privileges.setSessionRoles([role]);
      for (const c of SPELLING_CONFLICTS) {
        expect(privileges.forTable(c.alias), `${role}: ${c.alias}`)
          .toEqual(privileges.forTable(c.canonical));
      }
    }
  });

  it("UT-PRIV-012 expectedPrivilegeNames lists all eight for a table", async () => {
    const { privileges } = await load("mock");
    expect(privileges.expectedPrivilegeNames("projects")).toEqual([
      "prvCreatevsb_project", "prvReadvsb_project", "prvWritevsb_project",
      "prvDeletevsb_project", "prvAppendvsb_project", "prvAppendTovsb_project",
      "prvAssignvsb_project", "prvSharevsb_project",
    ]);
  });
});

/* ═════════════════════════════════════════════════════════════════ power mode ══ */

describe("UT-PRIV power mode — read from Dataverse, deny until it lands", () => {
  it("UT-PRIV-013 forTable denies before ensure() resolves, then answers", async () => {
    // The window this closes: twenty command bars render synchronously while the privilege
    // read is still in flight. Denying is the right answer for that render — offering a
    // command and then withdrawing it reads as a permissions bug, and offering one the
    // server will refuse is worse.
    const gate = deferred<{ RolePrivileges: { privilegename: string }[] }>();
    const { privileges } = await load("power", { callAction: vi.fn(() => gate.promise) });
    privileges.setSessionRoles([ROLE.admin]);

    expect(privileges.forTable(PROJECT_SET)).toEqual(privileges.DENY_TABLE);
    const pending = privileges.ensure();
    // Still denied while the request is outstanding, even though the session role is the
    // administrator — power mode never falls back to the matrix.
    expect(privileges.forTable(PROJECT_SET)).toEqual(privileges.DENY_TABLE);

    gate.resolve(rolePrivileges([privilegeName("projects", "read"), privilegeName("projects", "write")]));
    await pending;
    expect(privileges.forTable(PROJECT_SET)).toEqual({
      canCreate: false, canRead: true, canWrite: true, canDelete: false,
    });
  });

  it("UT-PRIV-014 the answer comes from the platform's privilege NAMES, not from the roles", async () => {
    // The whole point of `power` mode. The session role here is the project manager, whose
    // matrix grant has no master-data write; the platform says otherwise, and the platform
    // wins, because a role name is a label and the privilege list is the fact.
    const { privileges } = await load("power", {
      callAction: vi.fn(async () => rolePrivileges([
        privilegeName("capexAccountLists", "read"),
        privilegeName("capexAccountLists", "write"),
        privilegeName("capexAccountLists", "delete"),
      ])),
    });
    privileges.setSessionRoles([ROLE.pm]);
    await privileges.ensure();

    expect(privileges.forTable(MASTER_SET)).toEqual({
      canCreate: false, canRead: true, canWrite: true, canDelete: true,
    });
    // And a table the platform said nothing about is denied, not inherited.
    expect(privileges.forTable(PROJECT_SET)).toEqual(privileges.DENY_TABLE);
  });

  it("UT-PRIV-015 an empty RetrieveUserPrivileges falls back to the roleprivileges join", async () => {
    const callAction = vi.fn(async () => ({ RolePrivileges: [] }));
    const list = vi.fn(async () => ({
      rows: [{ privilegename: privilegeName("projects", "read") }],
    }));
    const { privileges } = await load("power", { callAction, list });
    privileges.setSessionRoles([ROLE.ownCountry]);
    await privileges.ensure();

    expect(callAction).toHaveBeenCalledWith("RetrieveUserPrivileges", {});
    expect(list).toHaveBeenCalledTimes(1);
    expect(privileges.forTable(PROJECT_SET)).toEqual({
      canCreate: false, canRead: true, canWrite: false, canDelete: false,
    });
  });

  it("UT-PRIV-016 a throwing action falls back, and a throwing fallback denies", async () => {
    // Deny on error, always. `undefined` means deny — never "assume allowed".
    const callAction = vi.fn(async () => { throw new Error("action unavailable"); });
    const list = vi.fn(async () => { throw new Error("no read"); });
    const { privileges } = await load("power", { callAction, list });
    privileges.setSessionRoles([ROLE.admin]);

    await expect(privileges.ensure()).resolves.toBeUndefined();
    expect(callAction).toHaveBeenCalledTimes(1);
    expect(list).toHaveBeenCalledTimes(1);
    expect(privileges.forTable(PROJECT_SET)).toEqual(privileges.DENY_TABLE);
    expect(privileges.forTable(MASTER_SET)).toEqual(privileges.DENY_TABLE);
  });

  it("UT-PRIV-017 ensure() is single-flight and then cached", async () => {
    // Twenty screens mounting at once must make one request, and a screen mounting later
    // must make none.
    const callAction = vi.fn(async () => rolePrivileges([privilegeName("projects", "read")]));
    const { privileges } = await load("power", { callAction });
    privileges.setSessionRoles([ROLE.ownCountry]);

    await Promise.all(Array.from({ length: 20 }, () => privileges.ensure()));
    expect(callAction).toHaveBeenCalledTimes(1);
    await privileges.ensure();
    expect(callAction).toHaveBeenCalledTimes(1);
    expect(privileges.forTable(PROJECT_SET).canRead).toBe(true);
  });

  it("UT-PRIV-018 setSessionRoles drops the platform read as well as the record cache", async () => {
    const callAction = vi.fn(async (action: string) =>
      action === "RetrieveUserPrivileges"
        ? rolePrivileges([privilegeName("projects", "read")])
        : { AccessRights: "ReadAccess" });
    const { privileges } = await load("power", { callAction });

    privileges.setSessionRoles([ROLE.ownCountry]);
    await privileges.ensure();
    expect(privileges.forTable(PROJECT_SET).canRead).toBe(true);

    // A re-resolved session is a different user's privileges. Keeping the old ones would
    // be the worst kind of stale cache.
    privileges.setSessionRoles([ROLE.pm]);
    expect(privileges.forTable(PROJECT_SET)).toEqual(privileges.DENY_TABLE);
    await privileges.ensure();
    expect(callAction).toHaveBeenCalledWith("RetrieveUserPrivileges", {});
    expect(callAction.mock.calls.filter((c) => c[0] === "RetrieveUserPrivileges")).toHaveLength(2);
  });

  it("UT-PRIV-019 forRecord parses a realistic AccessRights string", async () => {
    // `RetrievePrincipalAccess` answers with a comma-separated flag list, spaces included.
    // `AppendToAccess` is in the string and is NOT one of the five the UI branches on, so
    // it must be ignored rather than mistaken for a write.
    const callAction = vi.fn(async (action: string, _body?: unknown) =>
      action === "RetrieveUserPrivileges"
        ? rolePrivileges([privilegeName("projects", "read")])
        : { AccessRights: "ReadAccess, WriteAccess, AppendToAccess" });
    const { privileges } = await load("power", { callAction });
    privileges.setSessionRoles([ROLE.pm]);
    await privileges.ensure();

    await expect(privileges.forRecord(PROJECT_SET, "p-1")).resolves.toEqual({
      canRead: true, canWrite: true, canDelete: false, canAssign: false, canShare: false,
    });

    const probe = callAction.mock.calls.find((c) => c[0] === "RetrievePrincipalAccess");
    expect(probe).toBeDefined();
    const { Target } = probe?.[1] as { Target: Record<string, unknown> };
    expect(Target["@odata.type"]).toBe("Microsoft.Dynamics.CRM.vsb_project");
    expect(Target.vsb_projectid).toBe("p-1");
  });

  it("UT-PRIV-020 an absent or empty AccessRights denies everything", async () => {
    const callAction = vi.fn(async (action: string) =>
      action === "RetrieveUserPrivileges" ? rolePrivileges(["prvReadvsb_project"]) : {});
    const { privileges } = await load("power", { callAction });
    privileges.setSessionRoles([ROLE.pm]);
    await privileges.ensure();
    await expect(privileges.forRecord(PROJECT_SET, "p-1")).resolves.toEqual(privileges.DENY_RECORD);
  });

  it("UT-PRIV-021 forRecord caches per row, and invalidateRecord drops exactly one entry", async () => {
    const seen: string[] = [];
    const callAction = vi.fn(async (action: string, body?: unknown) => {
      if (action === "RetrieveUserPrivileges") return rolePrivileges([privilegeName("projects", "read")]);
      const target = (body as { Target: Record<string, string> }).Target;
      seen.push(target.vsb_projectid);
      return { AccessRights: "ReadAccess, WriteAccess" };
    });
    const { privileges } = await load("power", { callAction });
    privileges.setSessionRoles([ROLE.pm]);
    await privileges.ensure();

    await privileges.forRecord(PROJECT_SET, "p-1");
    await privileges.forRecord(PROJECT_SET, "p-2");
    await privileges.forRecord(PROJECT_SET, "p-1");
    await privileges.forRecord(PROJECT_SET, "p-2");
    // Four asks, two rows, two requests: a command bar re-rendering must not re-probe.
    expect(seen).toEqual(["p-1", "p-2"]);

    // A write can change ownership, which changes the answer for THAT row only.
    privileges.invalidateRecord(PROJECT_SET, "p-1");
    await privileges.forRecord(PROJECT_SET, "p-1");
    await privileges.forRecord(PROJECT_SET, "p-2");
    expect(seen).toEqual(["p-1", "p-2", "p-1"]);

    // An id that was never cached is a no-op, not a throw.
    expect(() => privileges.invalidateRecord(PROJECT_SET, "p-999")).not.toThrow();
  });

  it("UT-PRIV-022 a throwing dataClient yields DENY_RECORD rather than propagating", async () => {
    const callAction = vi.fn(async (action: string) => {
      if (action === "RetrieveUserPrivileges") return rolePrivileges([privilegeName("projects", "read")]);
      throw new Error("RetrievePrincipalAccess: 403");
    });
    const { privileges } = await load("power", { callAction });
    privileges.setSessionRoles([ROLE.pm]);
    await privileges.ensure();

    // `Coalesce(RecordInfo(...), false)` — the canvas idiom, the right way round.
    const p: RecordPrivileges = await privileges.forRecord(PROJECT_SET, "p-1");
    expect(p).toBe(privileges.DENY_RECORD);
    // And the failure is NOT cached as a deny, so a transient 403 does not lock the row
    // for the rest of the session.
    await privileges.forRecord(PROJECT_SET, "p-1");
    expect(callAction.mock.calls.filter((c) => c[0] === "RetrievePrincipalAccess")).toHaveLength(2);
  });

  it("UT-PRIV-023 the deny constants are frozen, so a caller cannot widen them", async () => {
    const { privileges } = await load("power");
    const table: TablePrivileges = privileges.forTable("vsb_nosuchtable");
    expect(Object.isFrozen(table)).toBe(true);
    expect(Object.isFrozen(privileges.DENY_RECORD)).toBe(true);
    // Every consumer receives the SAME object, so one screen mutating it would grant every
    // other screen the same right. Frozen means the attempt fails instead.
    expect(() => {
      (table as { canWrite: boolean }).canWrite = true;
    }).toThrow();
    expect(privileges.forTable("vsb_nosuchtable").canWrite).toBe(false);
  });
});
