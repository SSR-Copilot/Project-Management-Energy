#!/usr/bin/env node
/**
 * apply-roles.mjs — write `src/security/matrix.json` into a Dataverse environment's
 * security roles. Node 22, ESM, standard library only. DRY RUN BY DEFAULT.
 *
 * WHAT IT IS FOR, stated so the script can be argued with
 *   The app's admin screens have no server-side permission check. Entry to them is gated
 *   by hiding nav items on `Or(IsApplicationAdministrator, IsControllerOwnData)`, and in a
 *   code app the bundle is public, so that condition is readable as well as bypassable.
 *   **A route guard is not security.** The only thing that stops a non-admin writing master
 *   data is Dataverse refusing the request, and the only thing that makes Dataverse refuse
 *   is the absence of a privilege on that user's roles. This script is what puts the
 *   privileges where the matrix says they belong; `scripts/gsec.mjs` is what proves the
 *   refusal actually happens. Neither is optional and neither substitutes for the other.
 *
 * HOW CLIENT AND SERVER STAY IN AGREEMENT
 *   `src/security/matrix.json` is read by two independent consumers: the app, through
 *   `src/platform/privileges.ts`, to decide what the UI offers; and this script, to decide
 *   what Dataverse permits. Nothing here duplicates the matrix — no table list, no depth
 *   table, no role name is spelled in this file. Change the matrix, re-run this, re-run
 *   G-SEC. Absent means none: a grant not written in the matrix is not requested here.
 *
 * NO GUID IS EVER HARD-CODED
 *   Privilege ids are resolved AT RUNTIME by querying the `privileges` table for the
 *   names `privilegeName()` generates — `prvCreatevsb_project`, `prvAppendTovsb_project`
 *   and so on — using the same function the app matches against. Role ids are resolved by
 *   `name` from the matrix. If a name does not resolve, that is reported as a finding and
 *   nothing is written for it.
 *
 * ROLEPRIVILEGES AND DEPTH
 *   The association this creates is a `roleprivileges` row carrying a `privilegedepthmask`
 *   — 1 Basic / 2 Local / 4 Deep / 8 Global, exactly the numbers in the matrix's `depths`
 *   and in `DEPTH_MASK`. The Web API does not accept a direct create on that intersect
 *   table with a depth, so the depth-carrying messages are used instead:
 *     read    RetrieveRolePrivilegesRole   (falls back to querying roleprivilegescollection)
 *     add     AddPrivilegesRole            — also the way an existing row's depth is changed
 *     remove  RemovePrivilegeRole          — only under --prune, see below
 *   The plan prints the mask AND the SDK depth name for every line so the two can be
 *   checked against each other by eye.
 *
 * ROLES ARE APPLIED TO THE ROOT BUSINESS UNIT
 *   Dataverse copies a role into every business unit. Privileges belong on the root copy
 *   and the children inherit. This script targets the copy whose `parentrootroleid` is
 *   itself, and refuses to guess when several roles share a name ambiguously.
 *
 * WHAT IT WILL NEVER TOUCH
 *   Only privileges the matrix NAMES — `prv{Verb}{logicalName}` for the 32 tables in it.
 *   A VSB role that also holds `prvReadaccount` keeps it: this script has no opinion about
 *   privileges outside its own source of truth, and removing one it does not understand
 *   would be vandalism. Removals are reported by default and performed only with --prune.
 *
 * USAGE
 *   node solution/security/apply-roles.mjs                    # dry run, whole matrix
 *   node solution/security/apply-roles.mjs --apply
 *   node solution/security/apply-roles.mjs --role controllerOwnData --table projects
 *   node solution/security/apply-roles.mjs --json > plan.json
 *   node solution/security/apply-roles.mjs --offline           # no environment needed
 *
 * ENVIRONMENT
 *   VSB_DATAVERSE_URL     https://<org>.crm4.dynamics.com
 *   VSB_DATAVERSE_TOKEN   bearer token for that environment (see solution/lib/dataverse.mjs)
 *   VSB_DATAVERSE_API     optional, default v9.2
 *
 * EXIT CODES
 *   0  the environment matches the matrix (dry run), or --apply finished with no failures
 *      and nothing missing
 *   1  drift or gaps: changes are pending, or a privilege / role the matrix wants does not
 *      exist, or a depth the matrix wants is not grantable on that privilege
 *   2  the script itself broke
 *   3  no environment configured (VSB_DATAVERSE_URL / VSB_DATAVERSE_TOKEN unset)
 *   4  a write failed during --apply
 */
import {
  loadMatrix, PRIVILEGES, DEPTH_MASK, DEPTH_SDK_NAME, DEPTH_CAPABILITY_COLUMN,
  privilegeName, depthFor, parseArgs, resolveEnv, missingEnvMessage, makeClient,
  faultMessage, orFilterChunks, printHelpAndExit, die, fatal,
} from "../lib/dataverse.mjs";

const HELP = `apply-roles.mjs — apply src/security/matrix.json to a Dataverse environment.

  --apply              actually write. Without it this is a DRY RUN and prints the plan.
  --prune              also REMOVE matrix-named privileges the environment holds and the
                       matrix does not. Off by default; the removals are always reported.
  --role <key>         narrow to one role key from matrix.json "roles"
  --table <key>        narrow to one table key from matrix.json "tables"
  --offline            print what the matrix wants and stop. No environment, no network.
  --json               machine-readable output on stdout, nothing else on stdout
  --help, -h           this text

Environment: VSB_DATAVERSE_URL, VSB_DATAVERSE_TOKEN, optional VSB_DATAVERSE_API (v9.2).
Exit: 0 in agreement · 1 drift or gaps · 2 script broke · 3 no environment · 4 write failed.`;

const SPEC = {
  help: { type: "boolean" }, apply: { type: "boolean" }, prune: { type: "boolean" },
  offline: { type: "boolean" }, json: { type: "boolean" },
  role: { type: "string" }, table: { type: "string" },
};

/* ═════════════════════════════════════════════════════════════════════ the plan ════ */

/** Every (role, table, privilege, depth) the matrix asks for. Depth `none` is not asked. */
function wanted(matrix, roleKeys, tableKeys) {
  const out = [];
  for (const roleKey of roleKeys) {
    for (const tableKey of tableKeys) {
      for (const priv of PRIVILEGES) {
        const depth = depthFor(matrix, roleKey, tableKey, priv);
        if (depth === "none") continue;
        if (!(depth in DEPTH_MASK)) {
          throw new Error(
            `matrix.grants.${roleKey}.${tableKey}.${priv} = "${depth}", which is not one of `
            + Object.keys(DEPTH_MASK).join(", "),
          );
        }
        out.push({
          roleKey, roleName: matrix.roles[roleKey].name, tableKey, priv, depth,
          mask: DEPTH_MASK[depth], sdkDepth: DEPTH_SDK_NAME[depth],
          privilege: privilegeName(matrix.tables, tableKey, priv),
        });
      }
    }
  }
  return out;
}

/* ══════════════════════════════════════════════════════════════════ resolution ════ */

async function resolveRoles(client, names) {
  const byName = new Map();
  const problems = [];
  for (const chunk of orFilterChunks("name", names)) {
    const res = await client.all(
      `roles?$select=roleid,name,_businessunitid_value,_parentrootroleid_value`
      + `&$filter=${encodeURIComponent(chunk)}`,
    );
    if (!res.ok) {
      throw new Error(`could not read the roles table: ${faultMessage(res.res)}`);
    }
    for (const r of res.rows) {
      const list = byName.get(r.name) ?? [];
      list.push(r);
      byName.set(r.name, list);
    }
  }
  const resolved = new Map();
  for (const name of names) {
    const list = byName.get(name) ?? [];
    if (list.length === 0) { problems.push({ kind: "role-missing", name }); continue; }
    // The root copy: parentrootroleid points at itself. Children inherit from it.
    const roots = list.filter(
      (r) => !r._parentrootroleid_value || r._parentrootroleid_value === r.roleid,
    );
    if (roots.length !== 1) {
      problems.push({
        kind: "role-ambiguous", name,
        detail: `${list.length} role rows named "${name}", ${roots.length} of them root `
          + `copies. Privileges belong on exactly one root copy; resolve this in the maker `
          + `portal before applying.`,
      });
      continue;
    }
    resolved.set(name, roots[0]);
  }
  return { resolved, problems };
}

async function resolvePrivileges(client, names) {
  const byName = new Map();
  for (const chunk of orFilterChunks("name", names)) {
    const res = await client.all(
      `privileges?$select=privilegeid,name,accessright,canbebasic,canbelocal,canbedeep,`
      + `canbeglobal&$filter=${encodeURIComponent(chunk)}`,
    );
    if (!res.ok) throw new Error(`could not read the privileges table: ${faultMessage(res.res)}`);
    for (const p of res.rows) byName.set(p.name, p);
  }
  return byName;
}

/**
 * What the role holds today, as `privilegeid -> mask`.
 *
 * Three sources, tried in order, because tenants differ and a script that cannot read the
 * current state cannot claim to be idempotent. The source that answered is reported.
 */
async function readRolePrivileges(client, roleId) {
  const attempts = [
    { source: "RetrieveRolePrivilegesRole (bound)",
      path: `roles(${roleId})/Microsoft.Dynamics.CRM.RetrieveRolePrivilegesRole()` },
    { source: "RetrieveRolePrivilegesRole (unbound)",
      path: `RetrieveRolePrivilegesRole(RoleId=${roleId})` },
  ];
  for (const a of attempts) {
    const res = await client.get(a.path);
    if (res.ok && Array.isArray(res.json?.RolePrivileges)) {
      const held = new Map();
      for (const rp of res.json.RolePrivileges) {
        const id = String(rp.PrivilegeId ?? "").toLowerCase();
        if (id) held.set(id, maskFromSdkDepth(rp.Depth));
      }
      return { ok: true, source: a.source, held };
    }
  }
  // Last resort: the intersect table itself. It carries `privilegedepthmask` directly,
  // which is the number this script reasons about, so this path is the most literal one.
  const res = await client.all(
    `roleprivilegescollection?$select=privilegedepthmask,_privilegeid_value,_roleid_value`
    + `&$filter=_roleid_value eq ${roleId}`,
  );
  if (res.ok) {
    const held = new Map();
    for (const rp of res.rows) {
      const id = String(rp._privilegeid_value ?? "").toLowerCase();
      if (id) held.set(id, Number(rp.privilegedepthmask ?? 0));
    }
    return { ok: true, source: "roleprivilegescollection", held };
  }
  return { ok: false, source: null, held: new Map(), error: faultMessage(res.res) };
}

const SDK_TO_MASK = { Basic: 1, Local: 2, Deep: 4, Global: 8 };
const maskFromSdkDepth = (d) =>
  typeof d === "number" ? d : (SDK_TO_MASK[String(d)] ?? (Number(d) || 0));

/* ══════════════════════════════════════════════════════════════════════ main ════ */

async function main() {
  const args = parseArgs(process.argv.slice(2), SPEC);
  if (args.help) printHelpAndExit(HELP);

  const matrix = loadMatrix();
  const roleKeys = Object.keys(matrix.roles);
  const tableKeys = Object.keys(matrix.tables);

  if (args.role && !roleKeys.includes(args.role)) {
    die(`--role "${args.role}" is not a role key. Keys: ${roleKeys.join(", ")}`, 2);
  }
  if (args.table && !tableKeys.includes(args.table)) {
    die(`--table "${args.table}" is not a table key. Keys:\n  ${tableKeys.join("\n  ")}`, 2);
  }

  const scopeRoles = args.role ? [args.role] : roleKeys;
  const scopeTables = args.table ? [args.table] : tableKeys;
  const want = wanted(matrix, scopeRoles, scopeTables);

  if (args.offline) {
    const payload = {
      mode: "offline", matrixVersion: matrix.version,
      roles: scopeRoles, tables: scopeTables.length, wanted: want.length,
      grants: want.map(({ roleName, tableKey, priv, depth, mask, privilege }) =>
        ({ roleName, tableKey, priv, depth, mask, privilege })),
    };
    if (args.json) { process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`); process.exit(0); }
    process.stdout.write(
      `apply-roles — OFFLINE. matrix ${matrix.version}: ${want.length} grants wanted across `
      + `${scopeRoles.length} role(s) and ${scopeTables.length} table(s). No environment read.\n\n`,
    );
    for (const w of want) {
      process.stdout.write(
        `  ${w.roleName.padEnd(38)} ${w.privilege.padEnd(46)} ${String(w.mask).padStart(2)} `
        + `${w.sdkDepth}\n`,
      );
    }
    process.exit(0);
  }

  const env = resolveEnv();
  if (!env.ok || env.error) {
    die(env.error ?? missingEnvMessage(env.missing,
      `\nTo review the plan without an environment: --offline.`), 3);
  }

  const client = makeClient(env);

  /* -------------------------------------------------------------- resolve names */
  const roleNames = [...new Set(want.map((w) => w.roleName))];
  const privNames = [...new Set(want.map((w) => w.privilege))];
  const roles = await resolveRoles(client, roleNames);
  const privs = await resolvePrivileges(client, privNames);

  const missingPrivileges = privNames.filter((n) => !privs.has(n)).sort();
  const findings = [...roles.problems];

  /* --------------------------------------------------------------------- diff */
  const heldByRole = new Map();
  const readSources = new Map();
  for (const [name, role] of roles.resolved) {
    const r = await readRolePrivileges(client, role.roleid);
    if (!r.ok) {
      findings.push({
        kind: "roleprivileges-unreadable", name,
        detail: `${r.error}. Without the current state this script cannot be idempotent, `
          + `so no write is planned for this role.`,
      });
      continue;
    }
    heldByRole.set(name, r.held);
    readSources.set(name, r.source);
  }

  const plan = { add: [], change: [], same: [], remove: [], blocked: [] };
  for (const w of want) {
    const role = roles.resolved.get(w.roleName);
    const priv = privs.get(w.privilege);
    if (!role || !priv) continue;                    // already a finding
    const held = heldByRole.get(w.roleName);
    if (!held) continue;                             // unreadable; already a finding
    const capability = DEPTH_CAPABILITY_COLUMN[w.depth];
    if (priv[capability] === false) {
      plan.blocked.push({ ...w, reason:
        `the privilege exists but ${capability} is false, so depth ${w.depth} `
        + `(${w.sdkDepth}/${w.mask}) cannot be granted. On an organization-owned table only `
        + `Global is grantable; check "ownership" for ${w.tableKey} in the matrix.` });
      continue;
    }
    const current = held.get(String(priv.privilegeid).toLowerCase());
    const line = { ...w, roleId: role.roleid, privilegeId: priv.privilegeid, current: current ?? 0 };
    if (current === undefined) plan.add.push(line);
    else if (current === w.mask) plan.same.push(line);
    else plan.change.push(line);
  }

  // Removals: only ever among privileges the MATRIX NAMES. Everything else is left alone.
  const matrixPrivilegeNames = new Set();
  for (const tk of Object.keys(matrix.tables)) {
    for (const p of PRIVILEGES) matrixPrivilegeNames.add(privilegeName(matrix.tables, tk, p));
  }
  const idToName = new Map([...privs.values()].map((p) => [String(p.privilegeid).toLowerCase(), p.name]));
  for (const [roleName, held] of heldByRole) {
    const wantedIds = new Set(
      want.filter((w) => w.roleName === roleName)
        .map((w) => String(privs.get(w.privilege)?.privilegeid ?? "").toLowerCase()),
    );
    for (const [id, mask] of held) {
      if (wantedIds.has(id)) continue;
      const name = idToName.get(id);
      // A name we did not resolve is a privilege outside this run's scope. Not ours.
      if (!name || !matrixPrivilegeNames.has(name)) continue;
      plan.remove.push({
        roleName, roleId: roles.resolved.get(roleName).roleid,
        privilege: name, privilegeId: id, current: mask,
      });
    }
  }

  /* -------------------------------------------------------------------- apply */
  const writes = [];
  let writeFailures = 0;
  if (args.apply) {
    const byRole = new Map();
    for (const line of [...plan.add, ...plan.change]) {
      const list = byRole.get(line.roleId) ?? [];
      list.push(line);
      byRole.set(line.roleId, list);
    }
    for (const [roleId, lines] of byRole) {
      const res = await client.post(
        `roles(${roleId})/Microsoft.Dynamics.CRM.AddPrivilegesRole`,
        { Privileges: lines.map((l) => ({ PrivilegeId: l.privilegeId, Depth: l.sdkDepth })) },
      );
      writes.push({ op: "AddPrivilegesRole", roleId, count: lines.length,
        ok: res.ok, status: res.status, error: res.ok ? null : faultMessage(res) });
      if (!res.ok) writeFailures++;
    }
    if (args.prune) {
      for (const r of plan.remove) {
        const res = await client.post(
          `roles(${r.roleId})/Microsoft.Dynamics.CRM.RemovePrivilegeRole`,
          { PrivilegeId: r.privilegeId },
        );
        writes.push({ op: "RemovePrivilegeRole", roleId: r.roleId, privilege: r.privilege,
          ok: res.ok, status: res.status, error: res.ok ? null : faultMessage(res) });
        if (!res.ok) writeFailures++;
      }
    }
  }

  /* ------------------------------------------------------------------- report */
  const pendingRemovals = args.prune ? 0 : plan.remove.length;
  const drift = plan.add.length + plan.change.length;
  const gaps = missingPrivileges.length + findings.length + plan.blocked.length;

  const payload = {
    matrixVersion: matrix.version,
    environment: env.url,
    mode: args.apply ? "apply" : "dry-run",
    scope: { roles: scopeRoles, tables: scopeTables.length, wanted: want.length },
    readSources: Object.fromEntries(readSources),
    plan: {
      add: plan.add.map(short), change: plan.change.map(short),
      unchanged: plan.same.length,
      remove: plan.remove.map((r) => ({ role: r.roleName, privilege: r.privilege, mask: r.current })),
      blocked: plan.blocked.map((b) => ({ role: b.roleName, privilege: b.privilege, depth: b.depth, reason: b.reason })),
    },
    writes,
    findings,
    /* The table-not-deployed check. More useful than a stack trace, and the reason this
     * report exists: a privilege name that does not resolve means the TABLE is not in the
     * environment (or is spelled differently there), not that the script is broken. */
    missingPrivileges,
    exit: 0,
  };

  let exit = 0;
  if (writeFailures > 0) exit = 4;
  else if (gaps > 0) exit = 1;
  else if (!args.apply && (drift > 0 || pendingRemovals > 0)) exit = 1;
  payload.exit = exit;

  if (args.json) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    process.exit(exit);
  }

  const out = [];
  out.push(`apply-roles — ${args.apply ? "APPLY" : "DRY RUN (nothing was written)"}`);
  out.push(`  matrix          ${matrix.version}`);
  out.push(`  environment     ${env.url}`);
  out.push(`  scope           ${scopeRoles.length} role(s), ${scopeTables.length} table(s), ${want.length} grant(s) wanted`);
  for (const [role, src] of readSources) out.push(`  current state    ${role}: ${src}`);
  out.push("");
  for (const l of plan.add) out.push(`  + ${line(l)}`);
  for (const l of plan.change) out.push(`  ~ ${line(l)}   (was mask ${l.current})`);
  for (const r of plan.remove) {
    out.push(`  - ${r.roleName.padEnd(38)} ${r.privilege.padEnd(46)} mask ${r.current}`
      + `${args.prune ? "" : "   NOT removed (pass --prune)"}`);
  }
  out.push("");
  out.push(`  ${plan.add.length} to add · ${plan.change.length} depth change(s) · `
    + `${plan.same.length} already correct · ${plan.remove.length} not in the matrix`);

  if (plan.blocked.length) {
    out.push("", `  ! ${plan.blocked.length} grant(s) the environment cannot hold at the requested depth:`);
    for (const b of plan.blocked) out.push(`      ${b.roleName} / ${b.privilege}: ${b.reason}`);
  }
  if (findings.length) {
    out.push("", `  ! ${findings.length} finding(s):`);
    for (const f of findings) out.push(`      [${f.kind}] ${f.name}${f.detail ? ` — ${f.detail}` : ""}`);
  }

  out.push("", `  PRIVILEGES THE MATRIX WANTS AND THIS ENVIRONMENT DOES NOT HAVE: ${missingPrivileges.length}`);
  if (missingPrivileges.length === 0) {
    out.push(`      none — every table in the matrix is deployed here.`);
  } else {
    out.push(`      Each line is a TABLE THAT IS NOT DEPLOYED (or is deployed under a`);
    out.push(`      different logical name). Import the table, then re-run.`);
    for (const n of missingPrivileges) out.push(`      ${n}`);
  }

  if (writes.length) {
    out.push("", `  writes: ${writes.filter((w) => w.ok).length}/${writes.length} succeeded`);
    for (const w of writes.filter((x) => !x.ok)) {
      out.push(`      x ${w.op} ${w.roleId} — HTTP ${w.status}: ${w.error}`);
    }
  }
  if (!args.apply && (drift > 0 || pendingRemovals > 0)) {
    out.push("", `  Re-run with --apply to write these ${drift} change(s).`);
  }
  process.stdout.write(`${out.join("\n")}\n`);
  process.exit(exit);
}

const line = (l) =>
  `${l.roleName.padEnd(38)} ${l.privilege.padEnd(46)} mask ${String(l.mask).padStart(2)} `
  + `(${l.sdkDepth}/${l.depth})`;

const short = (l) => ({
  role: l.roleName, table: l.tableKey, privilege: l.privilege,
  depth: l.depth, mask: l.mask, sdkDepth: l.sdkDepth, current: l.current,
});

main().catch(fatal("apply-roles.mjs"));
