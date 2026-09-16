/**
 * `security/matrix.json` — tests over the matrix AS DATA, plus the accessors in `index.ts`.
 *
 * New prefix (`UT-SEC-nnn`). This file exists because `matrix.json` is edited by hand and
 * read by two independent consumers — this app through `@/platform/privileges`, and
 * `solution/security/apply-roles.mjs` when it writes the privileges into Dataverse. A typo
 * here does not fail: it silently gives somebody a privilege, or silently takes one away,
 * and the client and the server go on agreeing with each other about the wrong thing.
 *
 * So the tests come in two kinds, and the second kind is the valuable one:
 *
 *   SCHEMA (UT-SEC-001..027) — the mistakes a hand edit actually makes. A copied table
 *   block whose `logicalName` still names the row it was copied from. A per-table override
 *   keyed by an entity set instead of a table key, which then silently never applies. A
 *   depth written `"businessunit"` instead of `"businessUnit"`. A privilege spelled
 *   `"appendto"`. Every one of those is invisible at runtime because "absent means none".
 *
 *   POLICY (UT-SEC-028..036) — the sentences the matrix is supposed to express. The whole
 *   point of writing the grants as two defaults plus overrides is that the interesting
 *   property is a sentence ("no role writes both master data and project data except the
 *   administrator"), not a table. A sentence that is not asserted is a comment, and this
 *   file is where each one becomes a test.
 *
 * ONE SENTENCE DID NOT SURVIVE CONTACT WITH THE DATA, and it is recorded here rather than
 * bent to fit: `controllerOwnData` was described as unable to CREATE OR WRITE project
 * data. It cannot write any project data, and it cannot create any project data — except
 * `applyAndApplyAllTrackings`, where its per-table override grants
 * `create: "organization"`. That is deliberate (the controller performs the Apply, and the
 * audit row records that it did), but the audit trail is `kind: "projectData"`, so it is
 * project data by the matrix's own classification and the blanket sentence is false.
 * `UT-SEC-033` asserts what the file says, and names the exception.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────
 * THE MATRIX GREW FROM 32 TO 85 TABLES, and the reason changes what these tests have to
 * say. `forTable()` denies anything the matrix does not model, so every unmodelled table
 * was silently read-only in `power` mode — a permissions bug wearing a UI bug's clothes.
 * Every referenced entity set is now modelled, and three things follow that the tests
 * below are built around:
 *
 *   `kind` REPLACED A BOOLEAN WITH FIVE CASES, and `isMasterData` did not keep up: it is
 *   true for everything that is not `projectData`, because it selects the grant default —
 *   so it means "not project data", not "master data". Two exports now separate those:
 *   `MASTER_DATA_TABLES` is the 13 `masterData` tables (the G-SEC surface) and
 *   `NON_PROJECT_DATA_TABLES` is the 47-table `isMasterData` set. Every policy assertion
 *   below is scoped with `TABLES_BY_KIND("masterData")` all the same, because the scope
 *   should say which surface it means rather than rely on which export was picked —
 *   scoping them by `isMasterData` would quietly widen six sentences about the admin
 *   surface to cover Dataverse's `systemusers` table.
 *
 *   `readOnly` IS A HARD MASK, applied in `grantFor` after defaults and overrides resolve.
 *   That is a claim about resolution ORDER, not about the data, so `UT-SEC-042` builds a
 *   matrix in which a per-table override tries to re-open a write on a read-only table and
 *   asserts the mask still wins. The data cannot express that case today, which is the
 *   whole point of testing it.
 *
 *   `entitySetAliases` MEANS ONE TABLE HAS TWO SPELLINGS. Seven tables are declared twice
 *   in `src/data/entities.ts` — six under different plurals and one under a wrong singular
 *   that `entities.ts` has already adjudicated — so a distinct-spelling count is 92 against
 *   85 tables and `UT-SEC-001` has to count both.
 */
import { describe, it, expect, vi } from "vitest";
import raw from "./matrix.json";
import entitiesSource from "@/data/entities.ts?raw";
import {
  PRIVILEGES, DEPTH_MASK, ROLES, TABLES, GRANTS, COLUMN_SECURITY, MATRIX_VERSION,
  ROLE_KEYS, TABLE_KEYS, ROLE_BY_NAME, TABLE_BY_ENTITY_SET, TABLE_BY_LOGICAL_NAME,
  MASTER_DATA_TABLES, NON_PROJECT_DATA_TABLES, OWNING_BU_TABLES, SECURED_COLUMNS,
  READ_ONLY_TABLES, UNVERIFIED_TABLES, SPELLING_CONFLICTS, TABLES_BY_KIND,
  grantFor, depthFor, effectiveDepth, allows, roleKeysFromNames, tableKeyOf, privilegeName,
  type Depth, type Privilege, type RoleKey, type TableKey, type TableKind,
} from "./index";

/** The five depth names, in width order. Anything outside this set is a typo. */
const DEPTH_NAMES: Depth[] = ["none", "user", "businessUnit", "parentChildBusinessUnit", "organization"];

/** The five table kinds. */
const KINDS: TableKind[] = ["masterData", "projectData", "reference", "platform", "connected"];

/** The three kinds this app can only read. `grantFor` masks their writes. */
const READ_ONLY_KINDS: TableKind[] = ["reference", "platform", "connected"];

/** The three roles whose job is project data, not master data. */
const PROJECT_DATA_ROLES: RoleKey[] = [
  "projectDataAllCountries", "projectDataOwnCountry", "projectManagerOwnProjects",
];

/**
 * The MASTER-DATA SURFACE, which is the 13 tables the six admin screens maintain — NOT
 * `MASTER_DATA_TABLES`, which is derived from `isMasterData` and now means "not project
 * data". Every policy assertion in the last block is scoped with this.
 */
const MASTER = TABLES_BY_KIND("masterData");
const PROJECT = TABLES_BY_KIND("projectData");

const name = (r: RoleKey) => ROLES[r].name;
const kindOf = (k: TableKey) => TABLES[k].kind;

/** Privileges the read-only mask removes. */
const WRITES: Privilege[] = ["create", "write", "delete"];

/* ────────────────────────────────────────────────── the entity sets `src/` uses ── */

/**
 * Every non-test source file under `src/`, as text.
 *
 * `import.meta.glob` rather than `node:fs` because this repo's `tsconfig` does not pull in
 * `@types/node` (its `types` array is `["vitest/globals"]`), so a `readFileSync` here would
 * not type-check. Vite's own resolution is the better tool anyway: it sees exactly the
 * files the bundle sees.
 */
const SOURCES: Record<string, string> = import.meta.glob("/src/**/*.{ts,tsx}", {
  query: "?raw",
  import: "default",
  eager: true,
});

/** Comments are not references. See the note on `entitySetsReferenced`. */
const stripComments = (t: string) =>
  t.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

/**
 * `(group, key) -> entitySet` for every `export const ES… = { … } as const` block in
 * `src/data/entities.ts`. Parsed from the file rather than imported so that a member added
 * to `ES_PLANT` and never modelled is still visible to `UT-SEC-048`.
 */
function entitySetsDeclared(): Map<string, string> {
  const src = entitiesSource;
  const out = new Map<string, string>();
  const blocks = /export const (ES[A-Z_]*)\s*=\s*\{/g;
  let block: RegExpExecArray | null;
  while ((block = blocks.exec(src))) {
    const open = src.indexOf("{", block.index + block[0].length - 1);
    let depth = 0;
    let close = open;
    for (let i = open; i < src.length; i += 1) {
      if (src[i] === "{") depth += 1;
      else if (src[i] === "}") {
        depth -= 1;
        if (depth === 0) { close = i; break; }
      }
    }
    const body = src.slice(open + 1, close);
    for (const m of body.matchAll(/^\s*([A-Za-z_$][\w$]*)\s*:\s*"([^"]+)"/gm)) {
      out.set(`${block[1]}.${m[1]}`, m[2]);
    }
    blocks.lastIndex = close;
  }
  return out;
}

/** The files the scan reads: no tests, and not the mock backend. */
function sourceFiles(): [string, string][] {
  return Object.entries(SOURCES)
    .filter(([path]) => !/\.test\.tsx?$/.test(path))
    // The mock backend fabricates tables no real environment has.
    .filter(([path]) => !path.includes("/src/data/mock/"))
    .sort(([a], [b]) => a.localeCompare(b));
}

/**
 * Every entity set a non-test, non-mock file under `src/` actually reaches for, resolved
 * through `entities.ts` the way the code does.
 *
 * COMMENTS ARE STRIPPED FIRST, and that is not a detail: `entities.ts` documents the
 * wrong spelling of one table INSIDE A DOC COMMENT (`ES.substructureTypesInProjects`
 * above is …), and a scan that counts a mention in prose as a call site concludes that a
 * table nothing uses is in use. That is how a phantom table gets modelled — see
 * `UT-SEC-049`.
 */
function entitySetsReferenced(): Map<string, string[]> {
  const declared = entitySetsDeclared();
  const out = new Map<string, string[]>();
  const member = /\b(ES|ES_PROCESS|ES_PLANT|ES_PRODUCTION|ES_FINANCE|ES_ADMIN|ES_COST)\.([A-Za-z0-9_]+)/g;
  for (const [path, source] of sourceFiles()) {
    const text = stripComments(source);
    for (const m of text.matchAll(member)) {
      const set = declared.get(`${m[1]}.${m[2]}`);
      if (!set) continue;
      const at = path.replace(/^\//, "");
      const list = out.get(set) ?? [];
      if (!list.includes(at)) list.push(at);
      out.set(set, list);
    }
  }
  return out;
}

/** Every spelling the matrix answers to: canonical entity sets plus declared aliases. */
const MODELLED_SPELLINGS = new Map<string, { key: TableKey; alias: boolean }>(
  TABLE_KEYS.flatMap((k) => [
    [TABLES[k].entitySet, { key: k, alias: false }] as const,
    ...(TABLES[k].entitySetAliases ?? []).map(
      (a) => [a, { key: k, alias: true }] as const,
    ),
  ]),
);

/* ═══════════════════════════════════════════════════════════════════════ schema ══ */

describe("UT-SEC schema — the mistakes a hand edit makes", () => {
  it("UT-SEC-001 every table's entitySet and logicalName are non-empty, differ, and are unique", () => {
    for (const k of TABLE_KEYS) {
      const t = TABLES[k];
      expect(t.entitySet, `${k}.entitySet`).toBeTruthy();
      expect(t.logicalName, `${k}.logicalName`).toBeTruthy();
      // A copied table block that kept the set as the logical name is the classic edit
      // slip, and it makes `privilegeName` emit `prvCreatevsb_projects` — a privilege that
      // does not exist, so `apply-roles.mjs` writes nothing and nobody notices.
      expect(t.entitySet, `${k}: set and logical name are the same string`).not.toBe(t.logicalName);
    }
    expect(new Set(TABLE_KEYS.map((k) => TABLES[k].entitySet)).size).toBe(TABLE_KEYS.length);
    expect(new Set(TABLE_KEYS.map((k) => TABLES[k].logicalName)).size).toBe(TABLE_KEYS.length);
    expect(Object.keys(TABLE_BY_LOGICAL_NAME)).toHaveLength(TABLE_KEYS.length);

    /*
     * `TABLE_BY_ENTITY_SET` is WIDER than the table count, and deliberately: it folds in
     * `entitySetAliases`, so it holds one entry per distinct SPELLING. Six tables carry an
     * alias, so 86 tables answer to 92 spellings. Asserting `=== TABLE_KEYS.length` here
     * would be the natural thing to write and would forbid the alias mechanism.
     */
    const aliases = TABLE_KEYS.flatMap((k) => [...(TABLES[k].entitySetAliases ?? [])]);
    expect(Object.keys(TABLE_BY_ENTITY_SET)).toHaveLength(TABLE_KEYS.length + aliases.length);
    // No spelling may appear twice, canonical or alias — two tables answering to one
    // entity set means one of them silently never receives a privilege.
    const spellings = [...TABLE_KEYS.map((k) => TABLES[k].entitySet), ...aliases];
    expect(new Set(spellings).size).toBe(spellings.length);
    expect(MODELLED_SPELLINGS.size).toBe(spellings.length);
  });

  it("UT-SEC-002 every logicalName carries the same publisher prefix as its entity set", () => {
    /*
     * The `vsb_` pattern holds for everything the publisher owns, which is every kind
     * except `platform`: Dataverse's own tables are `systemuser`, `team`, `role`, and a
     * `vsb_` prefix on one of those would be a hand-typed name for a table that exists
     * under a different one. So the strict pattern is KEPT for the other four kinds and
     * the five platform tables are pinned by name instead — they are a fixed set, so
     * naming them is stronger than a pattern.
     */
    for (const k of TABLE_KEYS) {
      const t = TABLES[k];
      if (t.kind === "platform") {
        expect(t.logicalName, `${k}`).toMatch(/^[a-z][a-z0-9]+$/);
        expect(t.logicalName, `${k}: a Dataverse system table is not publisher-prefixed`)
          .not.toMatch(/^vsb_/);
        expect(t.entitySet, `${k}`).not.toMatch(/^vsb_/);
        continue;
      }
      expect(t.logicalName, `${k}`).toMatch(/^vsb_[a-z0-9]+$/);
      expect(t.entitySet, `${k}`).toMatch(/^vsb_[a-z0-9]+$/);
    }
    expect([...TABLES_BY_KIND("platform")].map((k) => TABLES[k].logicalName).sort()).toEqual([
      "environmentvariabledefinition", "environmentvariablevalue", "role", "systemuser", "team",
    ]);
  });

  it("UT-SEC-003 every entitySet is a prefix-consistent plural of its logicalName", () => {
    // Dataverse builds the set name from the logical name: `+s`, `+es` for a name already
    // ending in `s`, and `y -> ies`. Anything else means one of the two was hand-typed and
    // the pair no longer describes the same table.
    for (const k of TABLE_KEYS) {
      const { entitySet: es, logicalName: ln } = TABLES[k];
      const plurals = [`${ln}s`, `${ln}es`, ln.endsWith("y") ? `${ln.slice(0, -1)}ies` : null];
      expect(plurals, `${k}: ${es} is not a plural of ${ln}`).toContain(es);
    }
  });

  it("UT-SEC-004 the roles in `grants` are exactly the roles in `roles`", () => {
    // Both directions. A grant block for a role that does not exist is dead, and a role
    // with no grant block silently holds nothing at all — the second is the dangerous one,
    // because "absent means none" makes it look like a deliberate lockout.
    expect(Object.keys(GRANTS).sort()).toEqual([...ROLE_KEYS].sort());
    for (const r of ROLE_KEYS) expect(GRANTS[r], `grants.${r}`).toBeDefined();
  });

  it("UT-SEC-005 every role has a unique Dataverse name and a plausible flag", () => {
    const names = ROLE_KEYS.map(name);
    expect(new Set(names).size).toBe(names.length);
    for (const r of ROLE_KEYS) {
      expect(ROLES[r].name, r).toMatch(/^VSB - \S/);
      expect(ROLES[r].description.length, r).toBeGreaterThan(20);
      const flag = ROLES[r].flag;
      if (flag !== null) expect(flag, r).toMatch(/^is[A-Z]/);
      expect(ROLE_BY_NAME[ROLES[r].name]).toBe(r);
    }
  });

  it("UT-SEC-006 every per-table override key is a real table key", () => {
    // The slip this catches: keying an override by ENTITY SET (`vsb_applyandapplyalltrackings`)
    // instead of by table key (`applyAndApplyAllTrackings`). `grantFor` then never finds it,
    // falls back to the default, and the override is silently inert.
    for (const r of ROLE_KEYS) {
      for (const key of Object.keys(GRANTS[r])) {
        if (key === "_masterData" || key === "_projectData") continue;
        expect(TABLE_KEYS, `grants.${r}.${key} is not a table key`).toContain(key);
      }
    }
  });

  it("UT-SEC-007 every privilege named in every grant is one of the eight", () => {
    for (const r of ROLE_KEYS) {
      for (const [block, grant] of Object.entries(GRANTS[r])) {
        for (const priv of Object.keys(grant)) {
          expect(PRIVILEGES, `grants.${r}.${block}.${priv}`).toContain(priv);
        }
      }
    }
    expect([...PRIVILEGES]).toEqual(raw.privileges);
  });

  it("UT-SEC-008 every depth value is one of the five depth names", () => {
    for (const r of ROLE_KEYS) {
      for (const [block, grant] of Object.entries(GRANTS[r])) {
        for (const [priv, depth] of Object.entries(grant)) {
          // `"businessunit"` and `"parentChildBU"` are the ones that get typed, and both
          // fall through `?? "none"` to a silent denial.
          expect(DEPTH_NAMES, `grants.${r}.${block}.${priv} = ${depth}`).toContain(depth);
        }
      }
    }
  });

  it("UT-SEC-009 DEPTH_MASK is the platform's bit mask and matrix.json agrees with it", () => {
    // These are sent to the Web API as numbers. 3 and 4 for the last two would compile,
    // pass every client-side test, and grant the wrong depth in Dataverse.
    expect(DEPTH_MASK).toEqual({
      none: 0, user: 1, businessUnit: 2, parentChildBusinessUnit: 4, organization: 8,
    });
    expect(raw.depths).toEqual(DEPTH_MASK);
    for (const d of DEPTH_NAMES.slice(1)) {
      const v = DEPTH_MASK[d];
      expect(v, `${d} must be a single bit`).toBe(v & -v);
    }
  });

  it("UT-SEC-010 every role declares both defaults, so no table is unreachable", () => {
    for (const r of ROLE_KEYS) {
      expect(GRANTS[r]._masterData, `grants.${r}._masterData`).toBeDefined();
      expect(GRANTS[r]._projectData, `grants.${r}._projectData`).toBeDefined();
    }
  });

  it("UT-SEC-011 every table declares ownership, phase and the screen that maintains it", () => {
    for (const k of TABLE_KEYS) {
      const t = TABLES[k];
      expect(["user", "organization"], `${k}.ownership`).toContain(t.ownership);
      expect([1, 2, 3], `${k}.phase`).toContain(t.phase);
      expect(typeof t.isMasterData, `${k}.isMasterData`).toBe("boolean");

      /*
       * `ownedByScreen` names a screen, or the sentinel `-` for a table no screen owns.
       * The strict screen pattern is KEPT for everything that is not `platform`, and
       * `platform` must use the sentinel: `systemusers` is read by the session bootstrap,
       * which is not a screen, so any screen name there would be fiction. The sentinel is
       * also legitimate for the plant/finance satellite tables a screen writes THROUGH its
       * parent, and for the Fabric mirrors.
       */
      if (t.kind === "platform") {
        expect(t.ownedByScreen, `${k}: a Dataverse system table is owned by no screen`).toBe("-");
      } else {
        expect(t.ownedByScreen, `${k}.ownedByScreen`).toMatch(/^(-|[a-z][a-z-]+)$/);
      }
      // Master data is the one kind that MUST name a real screen, and an admin one: "it is
      // maintained through an admin screen" is the definition of the kind.
      if (t.kind === "masterData") {
        expect(t.ownedByScreen, `${k}: master data is maintained by an admin screen`)
          .toMatch(/^admin-[a-z-]+$/);
      }

      // Project data is user-owned and everything else is organization-owned; the pairing
      // is what makes the two grant defaults mean anything.
      expect(t.ownership, `${k}: ownership contradicts kind ${t.kind}`)
        .toBe(t.kind === "projectData" ? "user" : "organization");
      if (t.columnSecured) {
        expect(t.columnSecured.length, `${k}.columnSecured`).toBeGreaterThan(0);
        expect(new Set(t.columnSecured).size).toBe(t.columnSecured.length);
        for (const c of t.columnSecured) expect(c, `${k}.columnSecured`).toMatch(/^vsb_[a-z0-9]+$/);
      }
    }
  });

  it("UT-SEC-012 the column-security profile and the tables' columnSecured lists agree", () => {
    // Two places record the same fact, so they can drift. The profile is what Dataverse is
    // configured from; the table list is what the UI and the tests read.
    expect(Object.keys(COLUMN_SECURITY).length).toBeGreaterThan(0);
    for (const [profileKey, profile] of Object.entries(COLUMN_SECURITY)) {
      expect(profile.name, profileKey).toMatch(/^VSB - \S/);
      expect(profile.description.length, profileKey).toBeGreaterThan(20);
      for (const [logicalName, columns] of Object.entries(profile.columns)) {
        const key = tableKeyOf(logicalName);
        expect(key, `${profileKey} names ${logicalName}, which is not in the matrix`).toBeDefined();
        expect([...(TABLES[key as TableKey].columnSecured ?? [])].sort()).toEqual([...columns].sort());
      }
    }
    // And the other way: a table that declares secured columns must appear in a profile.
    const inProfiles = new Set(
      Object.values(COLUMN_SECURITY).flatMap((p) => Object.keys(p.columns)),
    );
    for (const k of TABLE_KEYS) {
      if (!TABLES[k].columnSecured) continue;
      expect(inProfiles, `${k} has columnSecured but no profile covers it`)
        .toContain(TABLES[k].logicalName);
    }
  });

  it("UT-SEC-013 the approvalStateWriters profile has NO ordinary member, deliberately", () => {
    // This empty array IS the mechanism: the 17 approval flows are the only path to an
    // approval-state transition because Write is removed from everybody else. A member
    // added here quietly re-opens every transition the flows are supposed to own.
    expect(COLUMN_SECURITY.approvalStateWriters.members).toEqual([]);
  });

  it("UT-SEC-014 the matrix declares a version", () => {
    expect(MATRIX_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

/* ══════════════════════════════════════════════════════════════════ accessors ══ */

describe("UT-SEC accessors — resolution, unions and names", () => {
  it("UT-SEC-015 grantFor resolves the master-data default for master data", () => {
    const g = grantFor("controllerOwnData", "capexAccountLists");
    expect(g).toBe(GRANTS.controllerOwnData._masterData);
    expect(g.write).toBe("organization");
    expect(g.delete).toBe("none");
  });

  it("UT-SEC-016 grantFor resolves the project-data default for project data", () => {
    const g = grantFor("projectDataOwnCountry", "projects");
    expect(g).toBe(GRANTS.projectDataOwnCountry._projectData);
    expect(g.write).toBe("businessUnit");
  });

  it("UT-SEC-017 a per-table override REPLACES the default, it does not merge with it", () => {
    // `applyAndApplyAllTrackings` is the only override in the file. The admin's project
    // default grants `assign` and `share`; the override does not, so the override must not
    // inherit them — a merge would hand out two privileges nobody wrote down.
    const def = grantFor("applicationAdministrator", "projects");
    const override = grantFor("applicationAdministrator", "applyAndApplyAllTrackings");
    expect(def.assign).toBe("organization");
    expect(override.assign).toBeUndefined();
    expect(depthFor("applicationAdministrator", "applyAndApplyAllTrackings", "assign")).toBe("none");
    expect(override.write).toBe("none");
  });

  it("UT-SEC-018 depthFor returns none for a privilege the grant does not name", () => {
    // Absent means none. `projectDataAllCountries._masterData` names only read and appendTo.
    expect(depthFor("projectDataAllCountries", "capexAccountLists", "read")).toBe("organization");
    expect(depthFor("projectDataAllCountries", "capexAccountLists", "create")).toBe("none");
    expect(depthFor("projectDataAllCountries", "capexAccountLists", "write")).toBe("none");
    expect(depthFor("projectDataAllCountries", "capexAccountLists", "delete")).toBe("none");
  });

  it("UT-SEC-019 effectiveDepth returns the WIDEST depth in a union, in either order", () => {
    // The bug this pins is taking the first or the last role instead of the widest, which
    // under-reports a privilege and hides a control from somebody entitled to use it.
    const wide: RoleKey[] = ["projectManagerOwnProjects", "projectDataAllCountries"];
    expect(effectiveDepth(wide, "projects", "write")).toBe("organization");
    expect(effectiveDepth([...wide].reverse(), "projects", "write")).toBe("organization");

    // user (1) vs businessUnit (2): the wider one wins whichever way round it is listed.
    const mid: RoleKey[] = ["projectManagerOwnProjects", "projectDataOwnCountry"];
    expect(effectiveDepth(mid, "projects", "write")).toBe("businessUnit");
    expect(effectiveDepth([...mid].reverse(), "projects", "write")).toBe("businessUnit");

    // A role holding nothing must not drag the union down.
    expect(effectiveDepth(["controllerOwnData", "projectDataOwnCountry"], "projects", "write"))
      .toBe("businessUnit");
    expect(effectiveDepth(["projectDataOwnCountry", "controllerOwnData"], "projects", "write"))
      .toBe("businessUnit");
  });

  it("UT-SEC-020 effectiveDepth of no roles is none, for every privilege on every table", () => {
    for (const t of TABLE_KEYS) {
      for (const p of PRIVILEGES) expect(effectiveDepth([], t, p), `${t}.${p}`).toBe("none");
    }
  });

  it("UT-SEC-021 allows is false for anything absent, and true only above none", () => {
    // Absent on the grant …
    expect(allows(["projectDataAllCountries"], "capexAccountLists", "write")).toBe(false);
    expect(allows(["projectManagerOwnProjects"], "capexAccountLists", "delete")).toBe(false);
    // … explicitly `none` on the grant …
    expect(depthFor("controllerOwnData", "capexAccountLists", "delete")).toBe("none");
    expect(allows(["controllerOwnData"], "capexAccountLists", "delete")).toBe(false);
    // … and no roles at all.
    expect(allows([], "projects", "read")).toBe(false);
    // True exactly when the depth is not none, at the narrowest depth there is.
    expect(depthFor("projectManagerOwnProjects", "projects", "write")).toBe("user");
    expect(allows(["projectManagerOwnProjects"], "projects", "write")).toBe(true);
    for (const r of ROLE_KEYS) {
      for (const t of TABLE_KEYS) {
        for (const p of PRIVILEGES) {
          expect(allows([r], t, p), `${r}/${t}/${p}`).toBe(depthFor(r, t, p) !== "none");
        }
      }
    }
  });

  it("UT-SEC-022 roleKeysFromNames drops names that are not in the matrix", () => {
    expect(roleKeysFromNames(["VSB - Nope"])).toEqual([]);
    expect(roleKeysFromNames([])).toEqual([]);
    expect(roleKeysFromNames(["VSB - Nope", name("projectDataOwnCountry"), ""]))
      .toEqual(["projectDataOwnCountry"]);
    // Names are matched exactly: case and spacing are part of the Dataverse role name.
    expect(roleKeysFromNames(["vsb - project data own country"])).toEqual([]);
    expect(roleKeysFromNames([" VSB - Project Data Own Country"])).toEqual([]);
  });

  it("UT-SEC-023 roleKeysFromNames de-duplicates and keeps first-seen order", () => {
    // The session hands over the UNION of direct and team-derived roles, so the same role
    // name arrives twice whenever a user holds it both ways.
    const names = [
      name("projectDataOwnCountry"),
      name("applicationAdministrator"),
      name("projectDataOwnCountry"),
    ];
    expect(roleKeysFromNames(names)).toEqual(["projectDataOwnCountry", "applicationAdministrator"]);
    expect(roleKeysFromNames(ROLE_KEYS.map(name))).toEqual(ROLE_KEYS);
  });

  it("UT-SEC-024 roleKeysFromNames answers only from own properties", () => {
    // `ROLE_BY_NAME` is a plain object, so `map["constructor"]` used to return the `Object`
    // constructor — truthy, and therefore accepted as a role key.
    expect(roleKeysFromNames(["constructor", "toString", "__proto__", "valueOf"])).toEqual([]);
  });

  it("UT-SEC-025 privilegeName produces prvCreatevsb_project and prvAppendTovsb_project", () => {
    // Casing matters: these strings are resolved against the `privileges` table by name.
    expect(privilegeName("projects", "create")).toBe("prvCreatevsb_project");
    expect(privilegeName("projects", "appendTo")).toBe("prvAppendTovsb_project");
    expect(privilegeName("projects", "read")).toBe("prvReadvsb_project");
    expect(privilegeName("projects", "append")).toBe("prvAppendvsb_project");
  });

  it("UT-SEC-026 privilegeName covers all eight privileges for every table", () => {
    const expected: Record<Privilege, string> = {
      create: "Create", read: "Read", write: "Write", delete: "Delete",
      append: "Append", appendTo: "AppendTo", assign: "Assign", share: "Share",
    };
    for (const t of TABLE_KEYS) {
      for (const p of PRIVILEGES) {
        expect(privilegeName(t, p), `${t}.${p}`).toBe(`prv${expected[p]}${TABLES[t].logicalName}`);
      }
      // Distinct per table, so no two privileges collide on one name.
      expect(new Set(PRIVILEGES.map((p) => privilegeName(t, p))).size).toBe(PRIVILEGES.length);
    }
  });

  it("UT-SEC-027 tableKeyOf resolves an entity set, a logical name, and nothing else", () => {
    expect(tableKeyOf("vsb_projects")).toBe("projects");
    expect(tableKeyOf("vsb_project")).toBe("projects");
    expect(tableKeyOf("vsb_applyandapplyalltrackings")).toBe("applyAndApplyAllTrackings");
    expect(tableKeyOf("vsb_applyandapplyalltracking")).toBe("applyAndApplyAllTrackings");
    expect(tableKeyOf("vsb_nosuchtable")).toBeUndefined();
    expect(tableKeyOf("")).toBeUndefined();
    for (const k of TABLE_KEYS) {
      expect(tableKeyOf(TABLES[k].entitySet)).toBe(k);
      expect(tableKeyOf(TABLES[k].logicalName)).toBe(k);
    }
  });

  it("UT-SEC-028 tableKeyOf answers only from own properties", () => {
    // Same defect as UT-SEC-024, and worse here: a truthy non-key reached `grantFor`,
    // where `TABLES[table].isMasterData` threw — turning `privileges.forTable` from
    // "deny and trace" into an exception, which is the one thing it promises never to do.
    for (const probe of ["constructor", "toString", "__proto__", "valueOf", "hasOwnProperty"]) {
      expect(tableKeyOf(probe), probe).toBeUndefined();
    }
    // And the defensive path in `grantFor` itself: an unknown key resolves to no grant
    // rather than throwing.
    expect(grantFor("applicationAdministrator", "nosuch" as TableKey)).toEqual({});
    expect(depthFor("applicationAdministrator", "nosuch" as TableKey, "read")).toBe("none");
  });

  it("UT-SEC-029 MASTER_DATA_TABLES is the admin surface, NON_PROJECT_DATA_TABLES is not", () => {
    /*
     * TWO EXPORTS, TWO MEANINGS, AND THE DIFFERENCE IS 34 TABLES — which is why both are
     * asserted here rather than whichever one a caller happens to reach for.
     *
     * `MASTER_DATA_TABLES` is the 13 tables the six admin screens maintain: the G-SEC
     * surface, the thing its name and doc comment claim. `NON_PROJECT_DATA_TABLES` is the
     * `isMasterData` set — 47 tables, because `isMasterData` selects the grant default and
     * is therefore true for the 22 reference lists, the 5 Dataverse system tables and the
     * 7 Fabric mirrors as well. NOTHING SHOULD READ THAT LIST AS THE ADMIN SURFACE: a
     * G-SEC run scoped by it would attempt a write probe against `systemusers`, which is
     * exactly what this pair of names exists to prevent.
     */
    expect([...MASTER_DATA_TABLES].sort()).toEqual([...TABLES_BY_KIND("masterData")].sort());
    expect(MASTER_DATA_TABLES).toHaveLength(13);
    expect([...NON_PROJECT_DATA_TABLES].sort())
      .toEqual([...TABLE_KEYS.filter((k) => kindOf(k) !== "projectData")].sort());
    expect([...NON_PROJECT_DATA_TABLES].sort())
      .toEqual([...TABLE_KEYS.filter((k) => TABLES[k].isMasterData)].sort());

    // They are NOT the same list, and the wider one strictly contains the narrower — so a
    // future edit that collapses them back into one fails here.
    expect(NON_PROJECT_DATA_TABLES.length).toBeGreaterThan(MASTER_DATA_TABLES.length);
    for (const k of MASTER_DATA_TABLES) expect(NON_PROJECT_DATA_TABLES).toContain(k);
    for (const kind of READ_ONLY_KINDS) {
      for (const k of TABLES_BY_KIND(kind)) {
        expect(NON_PROJECT_DATA_TABLES, `${k}`).toContain(k);
        expect(MASTER_DATA_TABLES, `${k}: a ${kind} table is not the admin surface`)
          .not.toContain(k);
      }
    }

    // Both are disjoint from the owning-BU set, and the data implies it: nothing outside
    // `projectData` is user-owned, so it has no owning-BU rule to break.
    expect(OWNING_BU_TABLES.length).toBeGreaterThan(0);
    for (const k of OWNING_BU_TABLES) {
      expect(TABLES[k].isMasterData, `${k}`).toBe(false);
      expect(MASTER_DATA_TABLES, `${k}`).not.toContain(k);
      expect(NON_PROJECT_DATA_TABLES, `${k}`).not.toContain(k);
    }
    for (const k of NON_PROJECT_DATA_TABLES) expect(OWNING_BU_TABLES).not.toContain(k);

    // `NON_PROJECT_DATA_TABLES` and `OWNING_BU_TABLES` partition the matrix: every
    // project-data table requires the owning BU, which is G-OWN's premise.
    expect(NON_PROJECT_DATA_TABLES.length + OWNING_BU_TABLES.length).toBe(TABLE_KEYS.length);
    expect([...OWNING_BU_TABLES].sort()).toEqual([...PROJECT].sort());
  });

  it("UT-SEC-030 SECURED_COLUMNS flattens every profile against a real table", () => {
    expect(SECURED_COLUMNS.length).toBeGreaterThan(0);
    for (const s of SECURED_COLUMNS) {
      expect(tableKeyOf(s.logicalName), s.logicalName).toBeDefined();
      expect(s.column).toMatch(/^vsb_[a-z0-9]+$/);
      expect(COLUMN_SECURITY[s.profile], s.profile).toBeDefined();
      expect(TABLES[tableKeyOf(s.logicalName) as TableKey].columnSecured).toContain(s.column);
    }
    const total = Object.values(COLUMN_SECURITY)
      .flatMap((p) => Object.values(p.columns))
      .reduce((n, cols) => n + cols.length, 0);
    expect(SECURED_COLUMNS).toHaveLength(total);
  });
});

/* ════════════════════════════════════════════════════════════════════════ policy ══ */

/*
 * ALL SIX ARE SCOPED WITH `TABLES_BY_KIND("masterData")`, not `MASTER_DATA_TABLES`.
 *
 * When the matrix held 32 tables the two were the same 13 rows and the distinction did not
 * arise. At 86 they differ by 34: `isMasterData` is true for reference lists, Dataverse
 * system tables and Fabric mirrors too. Scoped by `isMasterData`, "no role but the
 * administrator deletes master data" would have become a sentence about `systemusers` —
 * and it would have FAILED, correctly, because the read-only mask denies the administrator
 * that delete. The sentences are about the admin surface, so they are scoped to it.
 *
 * NONE OF THE SIX BECAME VACUOUS: the 13 master-data tables are the only non-read-only
 * organization-owned kind, so every write, delete and read term below still has something
 * to range over. Each test asserts the size of the set it scopes to, so a re-classification
 * that empties the surface fails here rather than passing quietly.
 */
describe("UT-SEC policy — the sentences the matrix is supposed to express", () => {
  it("UT-SEC-037 the scoped surfaces are populated, so no sentence below is vacuous", () => {
    expect(MASTER).toHaveLength(13);
    expect(PROJECT).toHaveLength(38);
    // Master data is the writable admin surface: none of it may be read-only, or every
    // write assertion below would pass by the mask rather than by the policy.
    for (const k of MASTER) expect(TABLES[k].readOnly, `${k}`).toBeUndefined();
  });

  it("UT-SEC-031 no role except applicationAdministrator holds Delete on master data", () => {
    for (const r of ROLE_KEYS) {
      for (const t of MASTER) {
        const d = depthFor(r, t, "delete");
        if (r === "applicationAdministrator") expect(d, `${r}/${t}`).toBe("organization");
        else expect(d, `${r}/${t} must not delete master data`).toBe("none");
      }
    }
    // Stated the other way round, so a sixth role added to the file has to break one of
    // these two assertions rather than slipping between them.
    const deleters = ROLE_KEYS.filter((r) => MASTER.some((t) => allows([r], t, "delete")));
    expect(deleters).toEqual(["applicationAdministrator"]);
  });

  it("UT-SEC-032 no role writes both master data and project data except applicationAdministrator", () => {
    const writesMaster = (r: RoleKey) => MASTER.some((t) => allows([r], t, "write"));
    const writesProject = (r: RoleKey) => PROJECT.some((t) => allows([r], t, "write"));
    const both = ROLE_KEYS.filter((r) => writesMaster(r) && writesProject(r));
    expect(both).toEqual(["applicationAdministrator"]);
    // And each side is actually populated, so the sentence is not true by nobody writing.
    expect(ROLE_KEYS.filter(writesMaster)).toEqual(["applicationAdministrator", "controllerOwnData"]);
    expect(ROLE_KEYS.filter(writesProject)).toEqual(["applicationAdministrator", ...PROJECT_DATA_ROLES]);
  });

  it("UT-SEC-033 controllerOwnData writes no project data, and creates only the audit trail", () => {
    /*
     * THE SENTENCE AS GIVEN — "controllerOwnData cannot create or write project data" — is
     * FALSE for one table, and the file means it to be: the per-table override grants
     * `create: "organization"` on `applyAndApplyAllTrackings`, because the controller is
     * one of the two roles that performs an Apply and the audit row records that it did.
     * The audit trail is `isMasterData: false`, so it is project data by the matrix's own
     * classification. Asserted as it is, with the exception named.
     */
    for (const t of PROJECT) {
      expect(depthFor("controllerOwnData", t, "write"), `${t}`).toBe("none");
      expect(depthFor("controllerOwnData", t, "delete"), `${t}`).toBe("none");
    }
    const creatable = PROJECT.filter((t) => allows(["controllerOwnData"], t, "create"));
    expect(creatable).toEqual(["applyAndApplyAllTrackings"]);
    expect(depthFor("controllerOwnData", "applyAndApplyAllTrackings", "create")).toBe("organization");
    // Create without Write: the controller can record an Apply and can never amend one.
    expect(depthFor("controllerOwnData", "applyAndApplyAllTrackings", "write")).toBe("none");
  });

  it("UT-SEC-034 the three project-data roles read master data and never write it", () => {
    for (const r of PROJECT_DATA_ROLES) {
      for (const t of MASTER) {
        expect(depthFor(r, t, "read"), `${r}/${t} read`).toBe("organization");
        for (const p of ["create", "write", "delete"] as Privilege[]) {
          expect(depthFor(r, t, p), `${r}/${t} ${p}`).toBe("none");
        }
        // `appendTo` is not a write to the row: it is the right to be the TARGET of a
        // lookup, which every project-data role needs to point a project row at a
        // master-data row. Kept, and kept distinct from Write.
        expect(depthFor(r, t, "appendTo"), `${r}/${t} appendTo`).toBe("organization");
      }
    }
    // Reading master data at organization depth is what makes the country rails work, so
    // it must be all three roles and not two.
    expect(PROJECT_DATA_ROLES).toHaveLength(3);
  });

  it("UT-SEC-035 every role's grant on applyAndApplyAllTrackings has write: none", () => {
    // It is an audit trail. A row records who applied a standard assumption and when; a
    // Write anywhere here would let the record of an Apply be edited after the fact, and
    // that is the whole value of the table.
    for (const r of ROLE_KEYS) {
      expect(depthFor(r, "applyAndApplyAllTrackings", "write"), `${r}`).toBe("none");
      expect(depthFor(r, "applyAndApplyAllTrackings", "delete"), `${r}`).toBe("none");
    }
    expect(effectiveDepth(ROLE_KEYS, "applyAndApplyAllTrackings", "write")).toBe("none");
    expect(allows(ROLE_KEYS, "applyAndApplyAllTrackings", "write")).toBe(false);
    // Append-only, and readable: the union can create it and read it, never change it.
    expect(allows(ROLE_KEYS, "applyAndApplyAllTrackings", "create")).toBe(true);
    expect(allows(ROLE_KEYS, "applyAndApplyAllTrackings", "read")).toBe(true);
    expect(TABLES.applyAndApplyAllTrackings.isAuditTrail).toBe(true);
  });

  it("UT-SEC-036 projectManagerOwnProjects writes project data at user depth and no wider", () => {
    const written = PROJECT.filter((t) => allows(["projectManagerOwnProjects"], t, "write"));
    expect(written.length).toBeGreaterThan(0);
    for (const t of PROJECT) {
      const d = depthFor("projectManagerOwnProjects", t, "write");
      // `user` on every project table, and `none` on the audit trail — never `businessUnit`
      // or wider, which would make "own projects" a lie.
      expect(["user", "none"], `${t} write = ${d}`).toContain(d);
    }
    expect(depthFor("projectManagerOwnProjects", "projects", "write")).toBe("user");
    // Read is deliberately WIDER than write — a project manager sees the country's
    // portfolio and edits only their own rows. That asymmetry is the design, so it is
    // pinned here too; collapsing read to `user` would empty the portfolio grid.
    expect(depthFor("projectManagerOwnProjects", "projects", "read")).toBe("businessUnit");
    expect(depthFor("projectManagerOwnProjects", "projects", "create")).toBe("user");
    expect(depthFor("projectManagerOwnProjects", "projects", "assign")).toBe("none");
  });
});

/* ══════════════════════════════════════════════════════════════════ the 85-table model ══ */

/*
 * The tests that stop the coverage hole reopening.
 *
 * The hole was this: the app referenced 92 entity-set spellings and the matrix modelled 32,
 * and `forTable()` denies anything unmodelled — so in `power` mode 60 tables were read-only
 * and nothing said so. Every screen looked like it had a UI bug. Three of the assertions
 * below are about the classification being coherent, one is about resolution order, and the
 * last two are about coverage, which is the property that actually failed.
 */
describe("UT-SEC the 85-table model — kinds, the read-only mask and coverage", () => {
  it("UT-SEC-038 every table declares one of the five kinds, and kind agrees with isMasterData", () => {
    for (const k of TABLE_KEYS) {
      const t = TABLES[k];
      expect(KINDS, `${k}.kind`).toContain(t.kind);
      /*
       * `isMasterData` survived the growth as a derived flag and now means NOT PROJECT
       * DATA. Pinned in both directions because it is load-bearing in `grantFor`: it
       * chooses between the `_masterData` and `_projectData` defaults, so a reference list
       * flagged `isMasterData: false` would silently be handed the project-data grant —
       * `create: "businessUnit"` for `projectDataOwnCountry` on the country list.
       */
      expect(t.isMasterData, `${k}: kind ${t.kind} contradicts isMasterData`)
        .toBe(t.kind !== "projectData");
    }
    // The derived export that carries this flag is `NON_PROJECT_DATA_TABLES`, not
    // `MASTER_DATA_TABLES` — see UT-SEC-029 for why the two are kept apart.
    expect([...NON_PROJECT_DATA_TABLES].sort())
      .toEqual([...TABLE_KEYS.filter((k) => kindOf(k) !== "projectData")].sort());
    expect(MASTER_DATA_TABLES).not.toEqual(NON_PROJECT_DATA_TABLES);
  });

  it("UT-SEC-039 the five kinds partition the matrix and every one of them is populated", () => {
    const counted = KINDS.flatMap((kind) => [...TABLES_BY_KIND(kind)]);
    expect(counted).toHaveLength(TABLE_KEYS.length);
    expect([...counted].sort()).toEqual([...TABLE_KEYS].sort());
    for (const kind of KINDS) {
      expect(TABLES_BY_KIND(kind).length, `${kind} is empty`).toBeGreaterThan(0);
    }
    // An unknown kind returns nothing rather than throwing.
    expect(TABLES_BY_KIND("nosuchkind" as TableKind)).toEqual([]);
  });

  it("UT-SEC-040 readOnly is exactly the reference, platform and connected kinds", () => {
    for (const k of TABLE_KEYS) {
      const t = TABLES[k];
      const expected = READ_ONLY_KINDS.includes(t.kind);
      expect(t.readOnly === true, `${k}: kind ${t.kind}, readOnly ${String(t.readOnly)}`)
        .toBe(expected);
      // Absent, never `false`: "absent means none" is the file's convention and a written
      // `readOnly: false` on a writable table would read as a decision rather than a default.
      if (!expected) expect(t.readOnly, `${k}`).toBeUndefined();
    }
    expect([...READ_ONLY_TABLES].sort())
      .toEqual([...TABLE_KEYS.filter((k) => TABLES[k].readOnly === true)].sort());
    expect([...READ_ONLY_TABLES].sort())
      .toEqual([...READ_ONLY_KINDS.flatMap((kind) => [...TABLES_BY_KIND(kind)])].sort());
    // The two writable kinds are never masked.
    for (const k of [...MASTER, ...PROJECT]) expect(READ_ONLY_TABLES, `${k}`).not.toContain(k);
  });

  it("UT-SEC-041 no role holds create, write or delete on any readOnly table — the administrator included", () => {
    /*
     * The mask is what makes `readOnly` a fact rather than a label. Without it the
     * `_masterData` default would hand `applicationAdministrator` and `controllerOwnData`
     * `create`/`write`/`delete` at organization depth on all 34 read-only tables — every
     * reference list, `systemusers`, and the Fabric mirrors whose real write path is the
     * pipeline. `apply-roles.mjs` reads the same masked grant, so this is not cosmetic.
     */
    expect(READ_ONLY_TABLES.length).toBe(34);
    for (const k of READ_ONLY_TABLES) {
      for (const r of ROLE_KEYS) {
        const g = grantFor(r, k);
        for (const p of WRITES) {
          expect(g[p], `${r}/${k}.${p} must be masked away entirely`).toBeUndefined();
          expect(depthFor(r, k, p), `${r}/${k}.${p}`).toBe("none");
          expect(allows([r], k, p), `${r}/${k}.${p}`).toBe(false);
        }
      }
      // Not even the union of every role, which is the widest answer the app can compute.
      for (const p of WRITES) expect(allows(ROLE_KEYS, k, p), `${k}.${p}`).toBe(false);
    }
    // The administrator explicitly, because "the admin can do anything" is the assumption
    // this mask exists to break.
    for (const p of WRITES) {
      expect(depthFor("applicationAdministrator", "countries", p)).toBe("none");
      expect(depthFor("applicationAdministrator", "systemusers", p)).toBe("none");
    }
    // And the mask takes ONLY those three: read and the relationship privileges survive.
    expect(depthFor("applicationAdministrator", "countries", "read")).toBe("organization");
    expect(depthFor("applicationAdministrator", "countries", "appendTo")).toBe("organization");
  });

  it("UT-SEC-042 the read-only mask survives a per-table override", async () => {
    /*
     * THE SPECIFIC DRIFT THE MASK EXISTS TO STOP, and the one case the real data cannot
     * express: somebody adds a per-table override that grants a write on a reference list.
     * `grantFor` resolves defaults, then overrides, then masks — and the ORDER is the whole
     * claim. Applying the mask before the override, or at the call sites instead of here,
     * would let the override win, and it would look like a deliberate exception.
     *
     * So the matrix is replaced with one that contains exactly that case. This is the only
     * way to test resolution order without writing a bad override into the real file, where
     * it would be a real privilege escalation for as long as it sat there.
     */
    vi.resetModules();
    vi.doMock("./matrix.json", () => ({
      default: {
        version: "9.9.9",
        note: "synthetic",
        depths: raw.depths,
        privileges: raw.privileges,
        roles: {
          applicationAdministrator: { name: "VSB - Application Administrator", flag: null, description: "x" },
        },
        tables: {
          aReferenceList: {
            entitySet: "vsb_reflists", logicalName: "vsb_reflist", displayName: "Ref",
            kind: "reference", ownership: "organization", phase: 1, ownedByScreen: "-",
            isMasterData: true, readOnly: true, verified: true,
          },
          aMasterTable: {
            entitySet: "vsb_masters", logicalName: "vsb_master", displayName: "Master",
            kind: "masterData", ownership: "organization", phase: 1, ownedByScreen: "admin-cost",
            isMasterData: true, verified: true,
          },
        },
        grants: {
          applicationAdministrator: {
            _masterData: { read: "organization" },
            _projectData: {},
            // The override under test: an explicit, wide write on a read-only table.
            aReferenceList: {
              create: "organization", read: "organization", write: "organization",
              delete: "organization", appendTo: "organization",
            },
            // The same override shape on a writable table, as the control.
            aMasterTable: { create: "organization", write: "organization", read: "organization" },
          },
        },
        columnSecurityProfiles: {},
        spellingConflicts: [],
      },
    }));

    type SecurityModule = typeof import("./index");
    const mod = (await import("./index")) as unknown as SecurityModule;
    const admin = "applicationAdministrator" as RoleKey;
    const refList = "aReferenceList" as TableKey;
    const master = "aMasterTable" as TableKey;

    const masked = mod.grantFor(admin, refList);
    expect(masked.create, "an override cannot re-open create on a read-only table").toBeUndefined();
    expect(masked.write, "an override cannot re-open write on a read-only table").toBeUndefined();
    expect(masked.delete, "an override cannot re-open delete on a read-only table").toBeUndefined();
    // What the override legitimately carries is untouched, so the mask is surgical and not
    // a blanket "ignore the override".
    expect(masked.read).toBe("organization");
    expect(masked.appendTo).toBe("organization");
    expect(mod.depthFor(admin, refList, "write")).toBe("none");
    expect(mod.allows([admin], refList, "write")).toBe(false);
    expect(mod.READ_ONLY_TABLES).toEqual([refList]);

    // The control: on a table that is not read-only the identical override DOES grant the
    // write, which is what proves the mask and not some unrelated bug produced the denials.
    expect(mod.depthFor(admin, master, "write")).toBe("organization");
    expect(mod.allows([admin], master, "create")).toBe(true);

    vi.doUnmock("./matrix.json");
    vi.resetModules();
  });

  it("UT-SEC-043 read is granted to every role on every reference and platform table", () => {
    /*
     * LOAD-BEARING, and it fails quietly if it ever stops holding. A denied read on a
     * reference list is a blank dropdown — the Country rail, the cluster-state chips, the
     * contract-type picker — and a denied read on a `platform` table is worse: the session
     * bootstrap resolves the signed-in user's roles through `systemusers`/`roles` and reads
     * the environment variables for the version badge and the app links, so a denial there
     * takes out the whole app rather than one control, and it takes it out with an empty
     * screen rather than an error.
     */
    for (const kind of ["reference", "platform"] as TableKind[]) {
      const tables = TABLES_BY_KIND(kind);
      expect(tables.length, `${kind} is empty, so this assertion would be vacuous`).toBeGreaterThan(0);
      for (const k of tables) {
        for (const r of ROLE_KEYS) {
          expect(depthFor(r, k, "read"), `${r} must read ${kind} table ${k}`).not.toBe("none");
          expect(allows([r], k, "read"), `${r}/${k}`).toBe(true);
        }
        // At organization depth: a reference list is not business-unit scoped, and reading
        // it at `businessUnit` would make a country's dropdown depend on the reader's BU.
        expect(effectiveDepth(ROLE_KEYS, k, "read"), `${k}`).toBe("organization");
      }
    }
    // The Fabric mirrors are read by the assumption seeds on Finance, Revenues and
    // General Data, so they are readable too — same reason, one step less catastrophic.
    for (const k of TABLES_BY_KIND("connected")) {
      for (const r of ROLE_KEYS) expect(allows([r], k, "read"), `${r}/${k}`).toBe(true);
    }
  });

  it("UT-SEC-044 both spellings of every declared conflict resolve to the SAME table key", () => {
    /*
     * Six tables are declared twice in `entities.ts` under different plurals — the
     * `…es`/`…ses` double-plural trap — and one spelling of each pair is wrong. Until the
     * metadata endpoint says which, a repository built on the losing spelling must still
     * resolve, or `forTable` denies it every privilege and the screen goes quietly
     * read-only. That is the 60-table failure in miniature.
     */
    expect(SPELLING_CONFLICTS.length).toBeGreaterThan(0);
    for (const c of SPELLING_CONFLICTS) {
      const viaCanonical = tableKeyOf(c.canonical);
      const viaAlias = tableKeyOf(c.alias);
      expect(viaCanonical, `${c.canonical} does not resolve`).toBeDefined();
      expect(viaAlias, `${c.alias} does not resolve`).toBeDefined();
      expect(viaAlias, `${c.canonical} and ${c.alias} must be one table`).toBe(viaCanonical);
      // Modelled ONCE: the alias must not be a table in its own right, which is the
      // mistake that gives one table two independent grants.
      expect(TABLE_KEYS.map((k) => TABLES[k].entitySet)).not.toContain(c.alias);
      expect(TABLES[viaCanonical as TableKey].entitySet).toBe(c.canonical);
      expect(TABLES[viaCanonical as TableKey].entitySetAliases, `${c.canonical}`)
        .toContain(c.alias);
      expect(c.declaredIn).toBe("src/data/entities.ts");
      expect(c.note.length).toBeGreaterThan(20);
    }
    // Every alias in the tables is accounted for by a declared conflict, and vice versa —
    // an alias with no conflict entry is an undocumented spelling decision.
    const aliasesInTables = TABLE_KEYS.flatMap((k) => [...(TABLES[k].entitySetAliases ?? [])]);
    expect([...aliasesInTables].sort()).toEqual([...SPELLING_CONFLICTS.map((c) => c.alias)].sort());
  });

  it("UT-SEC-045 every entitySetAliases entry is a real entities.ts spelling and collides with nothing", () => {
    const declared = new Set(entitySetsDeclared().values());
    const canonical = new Set(TABLE_KEYS.map((k) => TABLES[k].entitySet));
    const seen = new Set<string>();
    for (const k of TABLE_KEYS) {
      for (const a of TABLES[k].entitySetAliases ?? []) {
        // An alias that is not declared anywhere is a guess, and a guess here silently
        // makes a real spelling unmodelled.
        expect(declared, `${k}: alias ${a} is not declared in src/data/entities.ts`).toContain(a);
        expect(canonical, `${k}: alias ${a} is another table's canonical entity set`)
          .not.toContain(a);
        expect(seen, `${a} is an alias of two tables`).not.toContain(a);
        seen.add(a);
        expect(a, `${k}: an alias must differ from its own entity set`).not.toBe(TABLES[k].entitySet);
        expect(tableKeyOf(a)).toBe(k);
      }
    }
    expect(seen.size).toBe(SPELLING_CONFLICTS.length);
  });

  it("UT-SEC-046 UNVERIFIED_TABLES is exactly the tables whose logical name was never checked", () => {
    /*
     * `verified: false` means the logical name was DERIVED by de-pluralising the entity set.
     * It matters more than it looks: the logical name is what `privilegeName` builds
     * `prv…` strings from, so a wrong one makes `apply-roles.mjs` write privileges for a
     * table that does not exist AND makes `forTable` deny a table the user can write. Both
     * ends fail, which is the only merciful thing about it.
     */
    expect([...UNVERIFIED_TABLES].sort())
      .toEqual([...TABLE_KEYS.filter((k) => TABLES[k].verified !== true)].sort());
    for (const k of UNVERIFIED_TABLES) expect(TABLES[k].verified, `${k}`).not.toBe(true);
    for (const k of TABLE_KEYS) {
      if (UNVERIFIED_TABLES.includes(k)) continue;
      expect(TABLES[k].verified, `${k} is not in UNVERIFIED_TABLES so it must be verified`)
        .toBe(true);
    }
    // Non-empty and not everything: an all-verified list would mean the flag is unused, and
    // an all-unverified one that nobody has started.
    expect(UNVERIFIED_TABLES.length).toBeGreaterThan(0);
    expect(UNVERIFIED_TABLES.length).toBeLessThan(TABLE_KEYS.length);
    // The 13 master-data tables carry the privileges the admin screens depend on, so their
    // logical names are the ones that must be right first. They are.
    for (const k of MASTER) expect(TABLES[k].verified, `${k}`).toBe(true);
  });

  it("UT-SEC-047 requiresOwningBusinessUnit is exactly the projectData kind", () => {
    // The premise the G-OWN gate is built on: if a projectData table lost the flag, the
    // gate would stop checking its creates and the omission would be invisible again.
    for (const k of TABLE_KEYS) {
      expect(TABLES[k].requiresOwningBusinessUnit === true, `${k}: kind ${kindOf(k)}`)
        .toBe(kindOf(k) === "projectData");
    }
    expect([...OWNING_BU_TABLES].sort()).toEqual([...PROJECT].sort());
    // Read-only tables can have no create at all, so they cannot carry the rule.
    for (const k of READ_ONLY_TABLES) {
      expect(TABLES[k].requiresOwningBusinessUnit, `${k}`).toBeUndefined();
    }
  });

  it("UT-SEC-048 every entity set src/ references is modelled in the matrix", () => {
    /*
     * THE TEST THAT STOPS THE HOLE REOPENING. `forTable()` denies an unmodelled table, so
     * the next screen to touch a new table gets a silently read-only grid unless the matrix
     * grows with it. This is the assertion that makes that a red build instead of a bug
     * report, and it is the reason the matrix went from 32 tables to 86.
     *
     * Resolution follows the code: `(group, key)` pairs out of the `ES…` blocks in
     * `entities.ts`, then every `ES*.member` reference under `src/`, minus the mock backend
     * (which fabricates tables no environment has) and the test files.
     */
    const referenced = entitySetsReferenced();
    expect(referenced.size, "the scan found nothing, so it is broken rather than clean")
      .toBeGreaterThan(80);

    const unmodelled = [...referenced.entries()]
      .filter(([set]) => !MODELLED_SPELLINGS.has(set))
      .map(([set, files]) => `${set} (referenced from ${files.join(", ")})`);
    expect(unmodelled, `unmodelled entity sets — add them to src/security/matrix.json:\n  ${unmodelled.join("\n  ")}`)
      .toEqual([]);

    // And each one resolves through the accessor the app actually calls, not just through
    // the map: an entry in `TABLE_BY_ENTITY_SET` that `tableKeyOf` cannot reach is no use.
    for (const set of referenced.keys()) expect(tableKeyOf(set), set).toBeDefined();
  });

  it("UT-SEC-049 a modelled spelling that no call site uses is an alias, never a table", () => {
    /*
     * THE REVERSE DIRECTION OF UT-SEC-048, which is where a phantom table shows up.
     *
     * An alias is EXPECTED to be unreferenced — that is its whole job, to catch the
     * spelling the code does not use. A canonical `entitySet` that nothing references is a
     * different thing: it is a table modelled for a set that does not exist, and it costs
     * real work, because `apply-roles.mjs` resolves `prv…` names for it and finds none.
     *
     * THIS TEST USED TO CARRY A NAMED EXCEPTION and no longer does.
     * `vsb_substructuretypesinprojects` was modelled as its own `projectData` table while
     * `entities.ts` documented it as the wrong spelling of `vsb_substructuretypeinprojects`
     * — so the matrix held a table and its phantom twin. It got there because the only
     * mention of the losing spelling anywhere in `src/` is INSIDE A DOC COMMENT, and a scan
     * that does not strip comments reads prose as a call site (which is why
     * `entitySetsReferenced` strips them first). It is now an alias of the real table.
     *
     * THE EXCEPTION MECHANISM IS DELETED RATHER THAN LEFT EMPTY, deliberately. It existed to
     * fail both when a second phantom appeared and when this one was fixed, and it has now
     * done the second thing — that was its terminal state, not a resting state. An empty
     * allow-list left behind invites the next contributor to append a name to it instead of
     * fixing the data, and unlike `reference/ownership-baseline.json` it has no `owner` or
     * `reason` discipline to make such an addition auditable. The next phantom should fail
     * the build, and if one ever needs to be tolerated, the baseline convention this repo
     * already uses is the right shape for it.
     */
    const referenced = entitySetsReferenced();
    const orphans = [...MODELLED_SPELLINGS.entries()]
      .filter(([set, { alias }]) => !alias && !referenced.has(set))
      .map(([set]) => `${set} (table ${MODELLED_SPELLINGS.get(set)?.key})`);
    expect(
      orphans,
      "a canonical entity set that no call site reaches — model it as an entitySetAlias of "
        + "the real table, or delete it",
    ).toEqual([]);

    // The formerly-phantom spelling now resolves to the real table, not to one of its own.
    expect(tableKeyOf("vsb_substructuretypesinprojects")).toBe("substructuretypeinprojects");
    expect(tableKeyOf("vsb_substructuretypeinprojects")).toBe("substructuretypeinprojects");
    expect(TABLES.substructuretypeinprojects.entitySetAliases)
      .toContain("vsb_substructuretypesinprojects");

    // Every alias, by contrast, may be unreferenced without comment — and at least one IS
    // referenced, which is what makes the alias mechanism load-bearing rather than dead
    // weight the app never exercises.
    const aliasSets = [...MODELLED_SPELLINGS.entries()].filter(([, v]) => v.alias);
    expect(aliasSets.length).toBe(SPELLING_CONFLICTS.length);
    expect(
      aliasSets.some(([set]) => referenced.has(set)),
      "no alias is referenced, so the alias mechanism is untested by the app itself",
    ).toBe(true);
  });

  it("UT-SEC-050 a conflict whose note says it is settled points the alias the right way", () => {
    /*
     * Six of the seven conflicts are open questions — the `…es`/`…ses` double plural, where
     * only the metadata endpoint can say which spelling is real, so `canonical` is a guess
     * held until `pac code add-data-source` settles it.
     *
     * THE SEVENTH IS NOT, and its note says so: `entities.ts` states outright that
     * `ES.substructureTypesInProjects` is wrong and `ES_PLANT` is authoritative. That makes
     * the direction of the alias a FACT rather than a guess, and getting it backwards would
     * put every privilege on the spelling that does not exist — the phantom defect again,
     * one indirection further in. So the settled one is pinned by direction, and the note
     * has to keep saying which it is, because the note is what tells an operator working
     * the `pac` list that this entry needs no lookup.
     */
    const settled = SPELLING_CONFLICTS.filter((c) => /not an open question/i.test(c.note));
    expect(settled, "the settled conflict lost the note that says it is settled").toHaveLength(1);
    expect(settled[0].canonical).toBe("vsb_substructuretypeinprojects");
    expect(settled[0].alias).toBe("vsb_substructuretypesinprojects");
    // It names the authority and the way to retire itself, which is what makes it actionable.
    expect(settled[0].note).toMatch(/ES_PLANT/);
    expect(settled[0].note).toMatch(/delete/i);

    // The other six are the double-plural shape: the alias is the canonical minus a
    // trailing `es`. Pinned so a third shape of conflict cannot be filed under it silently.
    for (const c of SPELLING_CONFLICTS.filter((x) => x !== settled[0])) {
      expect(c.canonical, `${c.canonical} is not the …es spelling of ${c.alias}`)
        .toBe(`${c.alias}es`);
    }
  });
});
