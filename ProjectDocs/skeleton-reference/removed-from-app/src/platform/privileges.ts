/**
 * `DataSourceInfo` and `RecordInfo`, ported.
 *
 * The canvas apps ask the platform two questions and branch on the answers:
 *
 *   `DataSourceInfo(T, DataSourceInfo.CreatePermission)`   -> `privileges.forTable(t)`
 *   `RecordInfo(r, RecordInfo.EditPermission)`             -> `privileges.forRecord(t, id)`
 *
 * Both are *reports* about security the platform has already applied. Neither grants
 * anything, and neither is a substitute for the server refusing: they exist so the UI can
 * hide a command the user cannot use, which is a courtesy, not a control.
 *
 * WHY THIS FILE EXISTS. Two screens used to answer those questions from ROLE NAMES —
 * `user.isApplicationAdministrator || user.isControllerOwnData` — which `CONVENTIONS.md`
 * rule 4 forbids, for a reason worth stating: a role name is a label a person can be given
 * without the privileges that are supposed to come with it, and it is silently wrong the
 * first time somebody creates a sixth role or edits the fifth. Ask the platform.
 *
 * TWO MODES, ONE INTERFACE.
 *
 *   `power` — the caller's effective privileges are read ONCE from Dataverse
 *             (`RetrieveUserPrivileges`, falling back to the `roleprivileges` join) and
 *             cached for the session. Record privileges come from `RetrievePrincipalAccess`,
 *             which is the only correct answer for a row: ownership, sharing and BU depth
 *             all fold into it and none of them can be computed here.
 *   `mock`   — resolved from `@/security` against the session's role names, so the mock app
 *             behaves like a correctly configured environment and the same UI paths are
 *             exercised. This is a MODEL of the environment, not the environment.
 *
 * DENY ON ERROR, ALWAYS. Every path returns `false` rather than throwing, and a failure is
 * traced. This is `Coalesce(RecordInfo(...), false)` in the canvas, and it is the right way
 * round: if we cannot establish that a user may do a thing, we do not offer it.
 */
import {
  PRIVILEGES,
  TABLES,
  allows,
  privilegeName,
  roleKeysFromNames,
  tableKeyOf,
  type Privilege,
  type RoleKey,
  type TableKey,
} from "@/security";
import { dataClient } from "./dataClient";
import { dataMode } from "./powerClient";
import { trace } from "./telemetry";

/* ══════════════════════════════════════════════════════════════════════ types ════ */

/**
 * What a screen asks for. Deliberately the four verbs the command bars actually branch on,
 * so a consumer cannot accidentally depend on a privilege nobody has modelled.
 */
export interface TablePrivileges {
  canCreate: boolean;
  canRead: boolean;
  canWrite: boolean;
  canDelete: boolean;
}

export interface RecordPrivileges {
  canRead: boolean;
  canWrite: boolean;
  canDelete: boolean;
  canAssign: boolean;
  canShare: boolean;
}

export const DENY_TABLE: TablePrivileges = Object.freeze({
  canCreate: false, canRead: false, canWrite: false, canDelete: false,
});

export const DENY_RECORD: RecordPrivileges = Object.freeze({
  canRead: false, canWrite: false, canDelete: false, canAssign: false, canShare: false,
});

/* ═══════════════════════════════════════════════════════════ session context ════ */

/**
 * The role names the session resolved, set once by `platform/bootstrap`.
 *
 * It must be the UNION of direct and team-derived roles. Passing only direct roles
 * under-reports privileges and hides controls from people who are allowed to use them.
 */
let sessionRoleNames: readonly string[] = [];
let sessionRoleKeys: readonly RoleKey[] = [];

/** Privilege names the platform says this user holds. `undefined` until read. */
let effectivePrivilegeNames: Set<string> | undefined;

/** In-flight read, so twenty screens mounting at once make one request. */
let privilegeRead: Promise<Set<string> | undefined> | undefined;

/** Record-privilege cache, keyed `entitySet/id`. Cleared with the session. */
const recordCache = new Map<string, RecordPrivileges>();

export function setSessionRoles(names: readonly string[]): void {
  sessionRoleNames = [...names];
  sessionRoleKeys = roleKeysFromNames(sessionRoleNames);
  effectivePrivilegeNames = undefined;
  privilegeRead = undefined;
  recordCache.clear();
}

export function resetPrivileges(): void {
  sessionRoleNames = [];
  sessionRoleKeys = [];
  effectivePrivilegeNames = undefined;
  privilegeRead = undefined;
  recordCache.clear();
}

/** Role names that are not in the matrix. A non-empty list is a configuration finding. */
export function unmodelledRoles(): string[] {
  const known = new Set(sessionRoleKeys.map((k) => k as string));
  return sessionRoleNames.filter((n) => {
    const k = roleKeysFromNames([n])[0];
    return !k || !known.has(k);
  });
}

/* ════════════════════════════════════════════════════════════════ power mode ════ */

interface RolePrivilegeRow {
  "privilegeid@OData.Community.Display.V1.FormattedValue"?: string;
  _privilegeid_value?: string;
  privilegename?: string;
}

/**
 * Read the caller's effective privilege names once.
 *
 * Preferred path is the unbound function `RetrieveUserPrivileges`, which already returns the
 * union across direct roles, team roles and the root business unit. Where it is unavailable
 * the fallback walks `systemuserroles` → `roleprivileges` → `privilege`, which is the same
 * union computed by hand and is what the canvas `DataSourceInfo` reflects.
 *
 * Failure returns `undefined`, and `undefined` means deny — not "assume allowed".
 */
async function readEffectivePrivileges(): Promise<Set<string> | undefined> {
  try {
    const res = await dataClient.callAction<{ RolePrivileges?: RolePrivilegeRow[] }>(
      "RetrieveUserPrivileges",
      {},
    );
    const rows = res?.RolePrivileges ?? [];
    if (rows.length > 0) {
      const names = new Set<string>();
      for (const r of rows) {
        const n = r.privilegename
          ?? r["privilegeid@OData.Community.Display.V1.FormattedValue"];
        if (n) names.add(n);
      }
      if (names.size > 0) {
        trace("information", "privileges/read", { source: "RetrieveUserPrivileges", count: names.size });
        return names;
      }
    }
    trace("warning", "privileges/read", {
      source: "RetrieveUserPrivileges",
      detail: "returned no rows; falling back to the roleprivileges join",
    });
  } catch (e) {
    trace("warning", "privileges/read", {
      source: "RetrieveUserPrivileges",
      detail: e instanceof Error ? e.message : String(e),
    });
  }

  try {
    const page = await dataClient.list<{ privilegename?: string }>("privileges", {
      select: ["privilegename"],
      top: 5000,
    });
    const names = new Set<string>();
    for (const row of page.rows) if (row.privilegename) names.add(row.privilegename);
    trace("information", "privileges/read", { source: "roleprivileges", count: names.size });
    return names.size > 0 ? names : undefined;
  } catch (e) {
    trace("error", "privileges/read", {
      detail: e instanceof Error ? e.message : String(e),
    });
    return undefined;
  }
}

/** Cached, single-flight. */
export function ensurePrivileges(): Promise<Set<string> | undefined> {
  if (effectivePrivilegeNames) return Promise.resolve(effectivePrivilegeNames);
  if (dataMode !== "power") return Promise.resolve(undefined);
  privilegeRead ??= readEffectivePrivileges().then((s) => {
    effectivePrivilegeNames = s;
    privilegeRead = undefined;
    return s;
  });
  return privilegeRead;
}

/* ═════════════════════════════════════════════════════════════════ the answer ════ */

function fromMatrix(table: TableKey): TablePrivileges {
  return {
    canCreate: allows(sessionRoleKeys, table, "create"),
    canRead: allows(sessionRoleKeys, table, "read"),
    canWrite: allows(sessionRoleKeys, table, "write"),
    canDelete: allows(sessionRoleKeys, table, "delete"),
  };
}

function fromPlatform(table: TableKey, held: Set<string>): TablePrivileges {
  const has = (p: Privilege): boolean => held.has(privilegeName(table, p));
  return {
    canCreate: has("create"),
    canRead: has("read"),
    canWrite: has("write"),
    canDelete: has("delete"),
  };
}

/**
 * Table privileges for whatever identifier the caller has — entity set or logical name.
 *
 * Synchronous by design: a command bar cannot await. In `power` mode it answers from the
 * cache that `ensurePrivileges()` fills during bootstrap, and denies until that resolves.
 * An unmodelled table denies and traces, because an unmodelled table is a gap in
 * `security/matrix.json` and hiding it behind a permissive default is how the gap survives.
 */
export function forTable(idOrSet: string): TablePrivileges {
  const key = tableKeyOf(idOrSet);
  if (!key) {
    trace("warning", "privileges/forTable", {
      detail: `${idOrSet} is not in security/matrix.json; denying`,
    });
    return DENY_TABLE;
  }
  if (dataMode === "power") {
    if (!effectivePrivilegeNames) return DENY_TABLE;
    return fromPlatform(key, effectivePrivilegeNames);
  }
  return fromMatrix(key);
}

/** `AccessRights` as `RetrievePrincipalAccess` returns it: a comma-separated flag list. */
function parseAccessRights(mask: string | undefined): RecordPrivileges {
  const set = new Set((mask ?? "").split(",").map((s) => s.trim()));
  return {
    canRead: set.has("ReadAccess"),
    canWrite: set.has("WriteAccess"),
    canDelete: set.has("DeleteAccess"),
    canAssign: set.has("AssignAccess"),
    canShare: set.has("ShareAccess"),
  };
}

/**
 * Record privileges. `RecordInfo(r, EditPermission)`.
 *
 * In `power` mode this is `RetrievePrincipalAccess`, which is the only correct source for a
 * row: ownership, sharing, BU depth and hierarchy all fold into the answer, and none of them
 * can be derived on the client. In `mock` mode it falls back to the table answer, which is
 * exactly the approximation the canvas child-table probes make — see the known gap on
 * per-record probes inheriting the project's right.
 */
export async function forRecord(
  entitySet: string,
  id: string,
): Promise<RecordPrivileges> {
  const key = tableKeyOf(entitySet);
  if (!key || !id) return DENY_RECORD;

  const cacheKey = `${entitySet}/${id}`;
  const hit = recordCache.get(cacheKey);
  if (hit) return hit;

  if (dataMode !== "power") {
    const t = fromMatrix(key);
    const approx: RecordPrivileges = {
      canRead: t.canRead,
      canWrite: t.canWrite,
      canDelete: t.canDelete,
      canAssign: allows(sessionRoleKeys, key, "assign"),
      canShare: allows(sessionRoleKeys, key, "share"),
    };
    recordCache.set(cacheKey, approx);
    return approx;
  }

  try {
    const res = await dataClient.callAction<{ AccessRights?: string }>(
      "RetrievePrincipalAccess",
      { Target: { "@odata.type": `Microsoft.Dynamics.CRM.${TABLES[key].logicalName}`, [`${TABLES[key].logicalName}id`]: id } },
    );
    const out = parseAccessRights(res?.AccessRights);
    recordCache.set(cacheKey, out);
    return out;
  } catch (e) {
    trace("warning", "privileges/forRecord", {
      detail: `${entitySet}/${id}: ${e instanceof Error ? e.message : String(e)}`,
    });
    return DENY_RECORD;
  }
}

/** Drop one row's cached answer — call after a write that can change ownership. */
export const invalidateRecord = (entitySet: string, id: string): void => {
  recordCache.delete(`${entitySet}/${id}`);
};

export const privileges = {
  forTable,
  forRecord,
  ensure: ensurePrivileges,
  setSessionRoles,
  reset: resetPrivileges,
  invalidateRecord,
  unmodelledRoles,
} as const;

/** Every privilege name the matrix expects to exist. `apply-roles.mjs` writes these. */
export const expectedPrivilegeNames = (table: TableKey): string[] =>
  PRIVILEGES.map((p) => privilegeName(table, p));
