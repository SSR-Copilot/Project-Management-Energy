/**
 * VSBCloud role security, as data.
 *
 * `matrix.json` is the SINGLE SOURCE OF TRUTH. Two independent consumers read it:
 *
 *   1. this application, through `@/platform/privileges`, to decide what the UI offers;
 *   2. `solution/security/apply-roles.mjs`, to write the privileges into Dataverse.
 *
 * They therefore agree by construction. That matters because of the rule this whole
 * workstream exists to enforce: **a restriction that exists only in the client is not a
 * restriction.** The client and the server are not allowed to hold two different opinions
 * about who may write what, and the only way to guarantee that is to give them one file.
 *
 * WHAT THIS MODULE IS NOT. It grants nothing. Dataverse has already applied table and row
 * security before any row reaches this process. These types describe the *intent* — what the
 * privileges are supposed to be — so the UI can hide what a user cannot do and so a test can
 * assert that the server actually refuses. The runtime truth comes from the platform, and
 * `@/platform/privileges` reads it from there in `power` mode.
 *
 * Absent means none. A grant that is not written in `matrix.json` is denied.
 */
import raw from "./matrix.json";

/* ══════════════════════════════════════════════════════════════════════ types ════ */

/** The eight Dataverse privileges, in the order the platform lists them. */
export const PRIVILEGES = [
  "create", "read", "write", "delete", "append", "appendTo", "assign", "share",
] as const;
export type Privilege = (typeof PRIVILEGES)[number];

/**
 * Privilege depth, with the platform's own `PrivilegeDepthMask` values.
 *
 * `parentChildBusinessUnit` is 4 and `organization` is 8 — deliberately not 3 and 4, because
 * these are a bit mask and `apply-roles.mjs` sends the number straight to the Web API.
 */
export const DEPTH_MASK = {
  none: 0,
  user: 1,
  businessUnit: 2,
  parentChildBusinessUnit: 4,
  organization: 8,
} as const;
export type Depth = keyof typeof DEPTH_MASK;

/** Ordering for a union of depths. A user's effective depth is the widest one they hold. */
const DEPTH_RANK: Record<Depth, number> = {
  none: 0, user: 1, businessUnit: 2, parentChildBusinessUnit: 3, organization: 4,
};

export type RoleKey = keyof typeof raw.roles;
export type TableKey = keyof typeof raw.tables;

export interface RoleDef {
  /** The security-role name exactly as it exists in Dataverse. */
  name: string;
  /** The `CurrentUser` boolean this role sets, where one exists. */
  flag: string | null;
  description: string;
}

/**
 * What a table is for. It decides how the grant defaults apply and whether writes are
 * possible at all — see `tableKinds` in `matrix.json` for the prose version.
 */
export type TableKind =
  | "masterData"
  | "projectData"
  | "reference"
  | "platform"
  | "connected";

export interface TableDef {
  entitySet: string;
  logicalName: string;
  displayName: string;
  kind: TableKind;
  ownership: "user" | "organization";
  /** Which phase of the build plan owns this table. */
  phase: 1 | 2 | 3;
  /** The screen that maintains it. Master data is maintained by an admin screen. */
  ownedByScreen: string;
  isMasterData: boolean;
  /** Owned tables break BU-scoped roles silently if a create omits the owning BU. */
  requiresOwningBusinessUnit?: boolean;
  /** Columns that must be column-secured, i.e. taken away from ordinary app users. */
  columnSecured?: readonly string[];
  isAuditTrail?: boolean;
  /**
   * A hard mask, not a hint. `grantFor` resolves create, write and delete to `none` for
   * every role on a read-only table, whatever the grant defaults say, and
   * `apply-roles.mjs` writes no write privilege for one either. Reference lists, Dataverse
   * system tables and Fabric mirrors are read-only *through this app*: something else owns
   * the write path.
   */
  readOnly?: boolean;
  /**
   * Other entity-set spellings that mean this same table.
   *
   * Seven tables are declared TWICE in `src/data/entities.ts` with different plurals — the
   * `…es` / `…ses` double-plural trap. One spelling of each pair is wrong and only the
   * metadata endpoint can say which, so the table is modelled once and the other spelling
   * resolves to it. Without this a repository using the losing spelling would be denied
   * every privilege and the screen would go quietly read-only.
   */
  entitySetAliases?: readonly string[];
  /**
   * `false` means the logical name was DERIVED from the entity set by de-pluralising it and
   * has never been checked against the metadata endpoint. Regenerate with
   * `pac code add-data-source`, then set this true. `scripts/check-matrix.mjs --unverified`
   * lists them, and it is the first thing to do on connecting to a real environment.
   */
  verified?: boolean;
}

/** A grant is a partial map: any privilege not named is `none`. */
export type Grant = Partial<Record<Privilege, Depth>>;

/**
 * Per role, a `_masterData` default, a `_projectData` default, and per-table overrides.
 *
 * The two defaults exist because the interesting property of this matrix is a sentence, not
 * a table: **no role writes both master data and project data except the administrator.**
 * Writing that as two defaults makes the exceptions visible; writing it as 32 × 5 explicit
 * rows would bury it.
 */
export type RoleGrants = { _masterData?: Grant; _projectData?: Grant } & Partial<
  Record<TableKey, Grant>
>;

export interface ColumnSecurityProfile {
  name: string;
  description: string;
  /** Deliberately empty for `approvalStateWriters`; see the note in `matrix.json`. */
  members: readonly string[];
  columns: Readonly<Record<string, readonly string[]>>;
}

/* ══════════════════════════════════════════════════════════════════════ data ════ */

export const ROLES = raw.roles as Readonly<Record<RoleKey, RoleDef>>;
export const TABLES = raw.tables as unknown as Readonly<Record<TableKey, TableDef>>;
export const GRANTS = raw.grants as unknown as Readonly<Record<RoleKey, RoleGrants>>;
export const COLUMN_SECURITY = raw.columnSecurityProfiles as unknown as Readonly<
  Record<string, ColumnSecurityProfile>
>;
export const MATRIX_VERSION: string = raw.version;

export const ROLE_KEYS = Object.keys(ROLES) as RoleKey[];
export const TABLE_KEYS = Object.keys(TABLES) as TableKey[];

/** Role name → role key. The app knows users by role *name*, the matrix by key. */
export const ROLE_BY_NAME: Readonly<Record<string, RoleKey>> = Object.freeze(
  Object.fromEntries(ROLE_KEYS.map((k) => [ROLES[k].name, k])),
);

/**
 * Entity set → table key. Repositories know tables by entity set.
 *
 * Aliases are folded in, so both spellings of the seven double-plural conflicts resolve to the
 * one table they describe.
 */
export const TABLE_BY_ENTITY_SET: Readonly<Record<string, TableKey>> = Object.freeze(
  Object.fromEntries(
    TABLE_KEYS.flatMap((k) => [
      [TABLES[k].entitySet, k] as const,
      ...(TABLES[k].entitySetAliases ?? []).map((a) => [a, k] as const),
    ]),
  ),
);

/** The seven tables declared under two different plurals. Six are a `pac` job; one is settled. */
export interface SpellingConflict {
  canonical: string;
  alias: string;
  declaredIn: string;
  note: string;
}
export const SPELLING_CONFLICTS: readonly SpellingConflict[] = raw.spellingConflicts;

/** Logical name → table key. The platform's privilege names use the logical name. */
export const TABLE_BY_LOGICAL_NAME: Readonly<Record<string, TableKey>> = Object.freeze(
  Object.fromEntries(TABLE_KEYS.map((k) => [TABLES[k].logicalName, k])),
);

/* ═════════════════════════════════════════════════════════════════ resolution ════ */

/**
 * An OWN-property lookup on one of the maps above.
 *
 * `Object.fromEntries` returns an ordinary object, so a plain `map[key]` also answers from
 * `Object.prototype`: `TABLE_BY_ENTITY_SET["constructor"]` is the `Object` constructor and
 * `ROLE_BY_NAME["toString"]` is a function. Both are truthy, so `tableKeyOf` used to hand
 * back a function as a `TableKey` and `roleKeysFromNames` used to accept `"valueOf"` as a
 * role — and `privileges.forTable("toString")` then THREW inside `grantFor` instead of
 * denying, which is the one thing that module promises never to do. These maps are indexed
 * with strings that come from callers, so the lookup has to be own-property only.
 */
const own = <T>(map: Readonly<Record<string, T>>, key: string): T | undefined =>
  Object.prototype.hasOwnProperty.call(map, key) ? map[key] : undefined;

/** Privileges a read-only table can never grant, whatever a role's defaults say. */
const WRITE_PRIVILEGES: readonly Privilege[] = ["create", "write", "delete"];

/**
 * The grant one role holds on one table: defaults resolved, overrides applied, and the
 * read-only mask enforced last.
 *
 * The mask is applied HERE rather than at each call site because there are three call sites
 * today and there will be more. A reference list becoming writable because somebody added a
 * per-table override is exactly the drift a single source of truth exists to prevent, so the
 * file is not able to express it.
 */
export function grantFor(role: RoleKey, table: TableKey): Grant {
  const g = GRANTS[role];
  const t = own(TABLES, table);
  if (!g || !t) return {};
  const override = own(g as Readonly<Record<string, Grant>>, table);
  const base = override ?? (t.isMasterData ? g._masterData : g._projectData) ?? {};
  if (!t.readOnly) return base;
  const masked: Grant = { ...base };
  for (const p of WRITE_PRIVILEGES) delete masked[p];
  return masked;
}

/** The depth one role holds for one privilege on one table. */
export function depthFor(role: RoleKey, table: TableKey, priv: Privilege): Depth {
  return grantFor(role, table)[priv] ?? "none";
}

/**
 * The widest depth a set of roles holds, which is how Dataverse itself resolves a union.
 *
 * The role set must be the union of direct and team-derived roles — see `domain/session`.
 * Taking only direct roles is the classic way to under-report a privilege and hide a control
 * from someone who is in fact allowed to use it.
 */
export function effectiveDepth(
  roles: readonly RoleKey[],
  table: TableKey,
  priv: Privilege,
): Depth {
  let best: Depth = "none";
  for (const r of roles) {
    const d = depthFor(r, table, priv);
    if (DEPTH_RANK[d] > DEPTH_RANK[best]) best = d;
  }
  return best;
}

/** Whether a set of roles holds a privilege at all, at any depth. */
export const allows = (
  roles: readonly RoleKey[],
  table: TableKey,
  priv: Privilege,
): boolean => effectiveDepth(roles, table, priv) !== "none";

/** Role names (as the session carries them) → matrix role keys. Unknown names are dropped. */
export function roleKeysFromNames(names: readonly string[]): RoleKey[] {
  const out: RoleKey[] = [];
  for (const n of names) {
    const k = own(ROLE_BY_NAME, n);
    if (k && !out.includes(k)) out.push(k);
  }
  return out;
}

/** Table key from whatever identifier the caller has. Returns `undefined` if unknown. */
export function tableKeyOf(idOrSet: string): TableKey | undefined {
  return own(TABLE_BY_ENTITY_SET, idOrSet) ?? own(TABLE_BY_LOGICAL_NAME, idOrSet);
}

/* ═════════════════════════════════════════════════════════ derived reference ════ */

/**
 * The 13 tables maintained through the six admin screens. **This is the G-SEC surface.**
 *
 * Derived from `kind`, not from `isMasterData`. `isMasterData` is true for reference lists,
 * Dataverse system tables and Fabric mirrors as well, because it selects the grant default —
 * so deriving this list from it gave 47 tables and a G-SEC run that would have tried a write
 * probe against `systemusers`. `NON_PROJECT_DATA_TABLES` below is the `isMasterData` set,
 * under a name that says what it is.
 */
export const MASTER_DATA_TABLES: readonly TableKey[] = TABLE_KEYS.filter(
  (k) => TABLES[k].kind === "masterData",
);

/** Everything that is not one project's own rows: master data, reference, platform, mirrors. */
export const NON_PROJECT_DATA_TABLES: readonly TableKey[] = TABLE_KEYS.filter(
  (k) => TABLES[k].isMasterData,
);


/** Tables whose every create must write `'Owning Business Unit'`. **G-OWN** tests these. */
export const OWNING_BU_TABLES: readonly TableKey[] = TABLE_KEYS.filter(
  (k) => TABLES[k].requiresOwningBusinessUnit === true,
);

/** Every column that must be column-secured, flattened. */
export const SECURED_COLUMNS: readonly { logicalName: string; column: string; profile: string }[] =
  Object.entries(COLUMN_SECURITY).flatMap(([profile, p]) =>
    Object.entries(p.columns).flatMap(([logicalName, cols]) =>
      cols.map((column) => ({ logicalName, column, profile })),
    ),
  );


/** Tables this app only reads. `grantFor` masks create, write and delete on all of them. */
export const READ_ONLY_TABLES: readonly TableKey[] = TABLE_KEYS.filter(
  (k) => TABLES[k].readOnly === true,
);

/** Tables by kind, for the gates and the operator reports. */
export const TABLES_BY_KIND = (kind: TableKind): readonly TableKey[] =>
  TABLE_KEYS.filter((k) => TABLES[k].kind === kind);

/**
 * Tables whose `logicalName` was derived by de-pluralising the entity set and never checked.
 *
 * This is the first list to work through on connecting to a real environment: a wrong
 * logical name makes every privilege name wrong, so `apply-roles.mjs` writes privileges that
 * do not exist and `forTable` denies a table the user can in fact write. It fails loudly on
 * both sides rather than quietly, which is the only good thing about it.
 */
export const UNVERIFIED_TABLES: readonly TableKey[] = TABLE_KEYS.filter(
  (k) => TABLES[k].verified !== true,
);

/**
 * The platform's privilege name for a table privilege, e.g. `prvCreatevsb_project`.
 *
 * This is the string `apply-roles.mjs` resolves against the `privileges` table, and the one
 * `platform/privileges.ts` matches when it reads the caller's effective privileges in
 * `power` mode. `appendTo` is `prvAppendTo…`, and the casing matters.
 */
export function privilegeName(table: TableKey, priv: Privilege): string {
  const verb = priv === "appendTo" ? "AppendTo" : priv[0].toUpperCase() + priv.slice(1);
  return `prv${verb}${TABLES[table].logicalName}`;
}
