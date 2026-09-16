#!/usr/bin/env node
/**
 * apply-columnsecurity.mjs — create or update the field-security profiles in
 * `src/security/matrix.json` → `columnSecurityProfiles`, and set `canread` / `canupdate` /
 * `cancreate` on every column each profile names. Node 22, ESM, standard library only.
 * DRY RUN BY DEFAULT.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────
 * WHY THE PROFILE HAS NO MEMBERS. READ THIS BEFORE CHANGING ANYTHING.
 *
 * The standing decision on the 17 Power Automate flows is that they stay exactly as they
 * are. None of them can be absorbed into app code: every one either suspends on an
 * approval webhook or is triggered by a Dataverse row change. That decision has a
 * consequence people keep trying to undo — if the flow is the only correct way to move an
 * approval from one state to the next, then *nothing else may be able to move it*.
 *
 * There are two ways to arrange that. One is to move the transition logic server-side into
 * a plugin and police it there. That was rejected: it would mean rewriting 499 actions of
 * approval orchestration that already work. The other is the one this script implements —
 * **leave the flows untouched and take Write away from everyone else.** The approval-state
 * columns become writable by exactly one principal: the flow's own connection identity.
 * The transition then becomes flow-only as a matter of Dataverse permissions, not as a
 * matter of the app being polite about it.
 *
 * That is why `members` is an empty list in the matrix and why this script writes no
 * members at all. The profile's job is to REMOVE access. A field-security profile grants
 * the columns it lists to its members and denies them to everyone who is not a member, so
 * an empty membership is the maximally restrictive configuration and is the intended one.
 * The single member that must exist — the flow connection's user or application user — is
 * added deliberately, once, in the maker portal, by whoever owns those flows. It is not
 * derivable from this repository, so this script will not invent it.
 *
 * **ADDING AN APP USER TO THIS PROFILE DEFEATS IT.** Not weakens: defeats. The moment an
 * ordinary user, a team every user belongs to, or the app's own service identity becomes a
 * member, that user can PATCH `vsb_approvalclusterstate` straight over the Web API and the
 * entire approval sequence — gate order, approver personas, due dates, the audit notes —
 * becomes advisory. The client-side gates in `features/pm/checklist/rules.ts` are a
 * courtesy to the user, not a control, exactly as `platform/privileges.ts` says. If a
 * screen appears to need write access to one of these columns, the screen is calling the
 * wrong thing: the transition belongs to a flow or to a custom API (see
 * `solution/customapi/`), never to a direct write.
 * ─────────────────────────────────────────────────────────────────────────────────────
 *
 * WHAT A FIELD PERMISSION CANNOT DO ON ITS OWN
 *   A `fieldpermission` row has NO EFFECT until the attribute's `IsSecured` metadata flag
 *   is true. An operator who runs only this script and then tests the restriction will find
 *   the column still writable and reasonably conclude that column security does not work.
 *   So this script always READS `IsSecured` for every column in the matrix and reports the
 *   ones that are false. It will set them, but only under `--secure-columns --apply`,
 *   because that is a metadata change to a managed table and it needs a publish afterwards.
 *
 * USAGE
 *   node solution/security/apply-columnsecurity.mjs                     # dry run
 *   node solution/security/apply-columnsecurity.mjs --apply
 *   node solution/security/apply-columnsecurity.mjs --apply --secure-columns
 *   node solution/security/apply-columnsecurity.mjs --profile approvalStateWriters --json
 *   node solution/security/apply-columnsecurity.mjs --offline
 *
 * ENVIRONMENT
 *   VSB_DATAVERSE_URL     https://<org>.crm4.dynamics.com
 *   VSB_DATAVERSE_TOKEN   bearer token for that environment
 *   VSB_DATAVERSE_API     optional, default v9.2
 *
 * EXIT CODES
 *   0  the environment matches the matrix, or --apply finished with no failures
 *   1  drift or gaps: changes pending, or columns that are not IsSecured, or a column the
 *      matrix names that does not exist on the table
 *   2  the script itself broke
 *   3  no environment configured
 *   4  a write failed during --apply
 */
import {
  loadMatrix, parseArgs, resolveEnv, missingEnvMessage, makeClient, faultMessage,
  printHelpAndExit, die, fatal,
} from "../lib/dataverse.mjs";

const HELP = `apply-columnsecurity.mjs — apply matrix.json columnSecurityProfiles to Dataverse.

  --apply              actually write. Without it this is a DRY RUN and prints the plan.
  --secure-columns     with --apply, also PATCH IsSecured=true on each named attribute.
                       Metadata change: run "Publish all customizations" afterwards.
  --profile <key>      narrow to one key from matrix.json "columnSecurityProfiles"
  --offline            print what the matrix wants and stop. No environment, no network.
  --json               machine-readable output on stdout
  --help, -h           this text

This script NEVER writes profile members. The profile is a deny mechanism and its only
member is the flow identity, added by hand once. See the header of this file for why.

Environment: VSB_DATAVERSE_URL, VSB_DATAVERSE_TOKEN, optional VSB_DATAVERSE_API (v9.2).
Exit: 0 in agreement · 1 drift or gaps · 2 script broke · 3 no environment · 4 write failed.`;

const SPEC = {
  help: { type: "boolean" }, apply: { type: "boolean" }, "secure-columns": { type: "boolean" },
  offline: { type: "boolean" }, json: { type: "boolean" }, profile: { type: "string" },
};

/**
 * `field_security_permission_type`: 0 = Not allowed, 4 = Allowed.
 *
 * The approval-state columns are readable by the app — the checklist screen renders the
 * state, the due date and the comment — and writable by nobody but the profile's members.
 * So read is Allowed and create/update are Not allowed ON THE PROFILE ITSELF; the flow
 * identity gets its write access from a second profile it alone belongs to, or from being
 * the only member of this one with the update flag flipped by its owner. This script
 * writes the restrictive shape and says so in the plan, because a script that silently
 * granted update to a profile's members would be the failure mode described in the header.
 */
const PERMISSION = { notAllowed: 0, allowed: 4 };
const WANTED_PERMISSION = {
  canread: PERMISSION.allowed,
  cancreate: PERMISSION.notAllowed,
  canupdate: PERMISSION.notAllowed,
};

async function main() {
  const args = parseArgs(process.argv.slice(2), SPEC);
  if (args.help) printHelpAndExit(HELP);

  const matrix = loadMatrix();
  const profileKeys = Object.keys(matrix.columnSecurityProfiles);
  if (args.profile && !profileKeys.includes(args.profile)) {
    die(`--profile "${args.profile}" is not a profile key. Keys: ${profileKeys.join(", ")}`, 2);
  }
  const scope = args.profile ? [args.profile] : profileKeys;

  // Flatten the matrix into the rows we intend to exist.
  const want = [];
  for (const key of scope) {
    const p = matrix.columnSecurityProfiles[key];
    for (const [logicalName, columns] of Object.entries(p.columns)) {
      for (const column of columns) want.push({ key, profileName: p.name, logicalName, column });
    }
  }

  if (args.offline) {
    const payload = {
      mode: "offline", matrixVersion: matrix.version,
      profiles: scope.map((k) => ({
        key: k, name: matrix.columnSecurityProfiles[k].name,
        members: matrix.columnSecurityProfiles[k].members,
        columns: want.filter((w) => w.key === k).length,
      })),
      permissions: WANTED_PERMISSION,
      rows: want,
    };
    if (args.json) { process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`); process.exit(0); }
    const out = [`apply-columnsecurity — OFFLINE. matrix ${matrix.version}.`, ""];
    for (const k of scope) {
      const p = matrix.columnSecurityProfiles[k];
      out.push(`  ${p.name}  (${want.filter((w) => w.key === k).length} column(s), `
        + `${p.members.length} member(s) — an empty membership is the point)`);
      for (const w of want.filter((x) => x.key === k)) {
        out.push(`      ${w.logicalName.padEnd(30)} ${w.column}`);
      }
    }
    out.push("", `  canread=${WANTED_PERMISSION.canread} cancreate=${WANTED_PERMISSION.cancreate} `
      + `canupdate=${WANTED_PERMISSION.canupdate}  (4 = Allowed, 0 = Not allowed)`);
    process.stdout.write(`${out.join("\n")}\n`);
    process.exit(0);
  }

  const env = resolveEnv();
  if (!env.ok || env.error) {
    die(env.error ?? missingEnvMessage(env.missing,
      `\nTo review the plan without an environment: --offline.`), 3);
  }
  const client = makeClient(env);

  const plan = { profiles: [], permissions: [], secured: [] };
  const findings = [];
  const writes = [];
  let failures = 0;

  /* ─────────────────────────────────────────────── 1. the profiles themselves */
  const profileIds = new Map();
  for (const key of scope) {
    const p = matrix.columnSecurityProfiles[key];
    const res = await client.all(
      `fieldsecurityprofiles?$select=fieldsecurityprofileid,name,description`
      + `&$filter=name eq '${p.name.replace(/'/g, "''")}'`,
    );
    if (!res.ok) die(`could not read fieldsecurityprofiles: ${faultMessage(res.res)}`, 2);
    if (res.rows.length > 1) {
      findings.push({ kind: "profile-ambiguous", profile: p.name,
        detail: `${res.rows.length} profiles share this name; resolve it in the maker portal.` });
      continue;
    }
    const existing = res.rows[0];
    if (!existing) {
      plan.profiles.push({ op: "create", key, name: p.name, description: p.description });
      if (args.apply) {
        const w = await client.post("fieldsecurityprofiles",
          { name: p.name, description: p.description }, { Prefer: "return=representation" });
        writes.push({ op: "create fieldsecurityprofile", name: p.name, ok: w.ok,
          status: w.status, error: w.ok ? null : faultMessage(w) });
        if (w.ok) profileIds.set(key, w.json?.fieldsecurityprofileid ?? w.entityId);
        else failures++;
      }
    } else {
      profileIds.set(key, existing.fieldsecurityprofileid);
      if ((existing.description ?? "") !== p.description) {
        plan.profiles.push({ op: "update-description", key, name: p.name,
          id: existing.fieldsecurityprofileid });
        if (args.apply) {
          const w = await client.patch(
            `fieldsecurityprofiles(${existing.fieldsecurityprofileid})`,
            { description: p.description },
          );
          writes.push({ op: "update fieldsecurityprofile", name: p.name, ok: w.ok,
            status: w.status, error: w.ok ? null : faultMessage(w) });
          if (!w.ok) failures++;
        }
      } else {
        plan.profiles.push({ op: "unchanged", key, name: p.name,
          id: existing.fieldsecurityprofileid });
      }
      // Report, never change, the membership. The header says why.
      const members = await client.all(
        `fieldsecurityprofiles(${existing.fieldsecurityprofileid})`
        + `/systemuserprofiles_association?$select=systemuserid,fullname`,
      );
      const teams = await client.all(
        `fieldsecurityprofiles(${existing.fieldsecurityprofileid})`
        + `/teamprofiles_association?$select=teamid,name`,
      );
      const userCount = members.ok ? members.rows.length : -1;
      const teamCount = teams.ok ? teams.rows.length : -1;
      plan.profiles[plan.profiles.length - 1].members = { users: userCount, teams: teamCount };
      if (userCount > 0 || teamCount > 0) {
        findings.push({
          kind: "profile-has-members", profile: p.name,
          detail: `${userCount} user(s) and ${teamCount} team(s) are members. The matrix `
            + `declares none. Every member can write the approval-state columns directly, `
            + `which is what this profile exists to prevent — verify each one is the flow `
            + `identity and nothing else. This script does not add or remove members.`,
          users: members.ok ? members.rows.map((r) => r.fullname ?? r.systemuserid) : [],
          teams: teams.ok ? teams.rows.map((r) => r.name ?? r.teamid) : [],
        });
      }
    }
  }

  /* ─────────────────────────────────────── 2. IsSecured on every named column */
  for (const w of want) {
    const res = await client.get(
      `EntityDefinitions(LogicalName='${w.logicalName}')/Attributes(LogicalName='${w.column}')`
      + `?$select=LogicalName,IsSecured,AttributeType`,
    );
    if (res.status === 404) {
      findings.push({ kind: "column-missing", table: w.logicalName, column: w.column,
        detail: `the matrix names this column but the table does not have it. Either the `
          + `table is not deployed here or the logical name in matrix.json is wrong — the `
          + `repository's own notes say the logical names still need regenerating with `
          + `\`pac code add-data-source\`.` });
      continue;
    }
    if (!res.ok) {
      findings.push({ kind: "column-unreadable", table: w.logicalName, column: w.column,
        detail: faultMessage(res) });
      continue;
    }
    if (res.json?.IsSecured === true) {
      plan.secured.push({ ...w, isSecured: true, op: "unchanged" });
      continue;
    }
    plan.secured.push({ ...w, isSecured: false, op: "set-IsSecured" });
    if (args.apply && args["secure-columns"]) {
      const p = await client.patch(
        `EntityDefinitions(LogicalName='${w.logicalName}')/Attributes(LogicalName='${w.column}')`,
        { "@odata.type": `#Microsoft.Dynamics.CRM.${res.json["@odata.type"]?.split(".").pop() ?? "AttributeMetadata"}`,
          LogicalName: w.column, IsSecured: true },
        { "MSCRM.MergeLabels": "true" },
      );
      writes.push({ op: "IsSecured", table: w.logicalName, column: w.column, ok: p.ok,
        status: p.status, error: p.ok ? null : faultMessage(p) });
      if (!p.ok) failures++;
    }
  }

  /* ──────────────────────────────────────────────── 3. the fieldpermission rows */
  for (const key of scope) {
    const profileId = profileIds.get(key);
    if (!profileId) continue;                      // not created (dry run) or a finding
    const existing = await client.all(
      `fieldpermissions?$select=fieldpermissionid,entityname,attributelogicalname,`
      + `canread,cancreate,canupdate&$filter=_fieldsecurityprofileid_value eq ${profileId}`,
    );
    if (!existing.ok) die(`could not read fieldpermissions: ${faultMessage(existing.res)}`, 2);
    const have = new Map(
      existing.rows.map((r) => [`${r.entityname}/${r.attributelogicalname}`, r]),
    );
    for (const w of want.filter((x) => x.key === key)) {
      const row = have.get(`${w.logicalName}/${w.column}`);
      if (!row) {
        plan.permissions.push({ op: "create", ...w, ...WANTED_PERMISSION });
        if (args.apply) {
          const res = await client.post("fieldpermissions", {
            entityname: w.logicalName,
            attributelogicalname: w.column,
            ...WANTED_PERMISSION,
            "fieldsecurityprofileid@odata.bind": `/fieldsecurityprofiles(${profileId})`,
          });
          writes.push({ op: "create fieldpermission", table: w.logicalName, column: w.column,
            ok: res.ok, status: res.status, error: res.ok ? null : faultMessage(res) });
          if (!res.ok) failures++;
        }
        continue;
      }
      const drift = Object.entries(WANTED_PERMISSION)
        .filter(([k, v]) => Number(row[k] ?? 0) !== v);
      if (drift.length === 0) {
        plan.permissions.push({ op: "unchanged", ...w });
        continue;
      }
      plan.permissions.push({ op: "update", ...w, id: row.fieldpermissionid,
        from: Object.fromEntries(drift.map(([k]) => [k, Number(row[k] ?? 0)])),
        to: Object.fromEntries(drift) });
      if (args.apply) {
        const res = await client.patch(`fieldpermissions(${row.fieldpermissionid})`,
          Object.fromEntries(drift));
        writes.push({ op: "update fieldpermission", table: w.logicalName, column: w.column,
          ok: res.ok, status: res.status, error: res.ok ? null : faultMessage(res) });
        if (!res.ok) failures++;
      }
    }
    // A permission in the profile that the matrix does not name is reported, not deleted.
    for (const [k, row] of have) {
      if (want.some((w) => w.key === key && `${w.logicalName}/${w.column}` === k)) continue;
      findings.push({ kind: "extra-fieldpermission", profile: matrix.columnSecurityProfiles[key].name,
        detail: `${k} is in the profile and not in the matrix. Left in place; add it to `
          + `matrix.json or remove it in the maker portal.`, id: row.fieldpermissionid });
    }
  }

  /* ──────────────────────────────────────────────────────────────────── report */
  const pending = [...plan.profiles, ...plan.permissions].filter((p) => p.op !== "unchanged").length
    + plan.secured.filter((s) => s.op !== "unchanged").length;
  let exit = 0;
  if (failures > 0) exit = 4;
  else if (findings.length > 0) exit = 1;
  else if (!args.apply && pending > 0) exit = 1;
  else if (args.apply && !args["secure-columns"] && plan.secured.some((s) => !s.isSecured)) exit = 1;

  const payload = {
    matrixVersion: matrix.version, environment: env.url,
    mode: args.apply ? "apply" : "dry-run", plan, writes, findings, exit,
    note: "members are never written by this script; see the file header",
  };
  if (args.json) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    process.exit(exit);
  }

  const out = [`apply-columnsecurity — ${args.apply ? "APPLY" : "DRY RUN (nothing was written)"}`];
  out.push(`  matrix          ${matrix.version}`);
  out.push(`  environment     ${env.url}`, "");
  for (const p of plan.profiles) {
    out.push(`  ${p.op === "unchanged" ? "=" : "+"} profile ${p.name} — ${p.op}`
      + (p.members ? `, members: ${p.members.users} user(s) / ${p.members.teams} team(s)` : ""));
  }
  out.push("");
  const notSecured = plan.secured.filter((s) => !s.isSecured);
  out.push(`  IsSecured: ${plan.secured.length - notSecured.length}/${plan.secured.length} columns already secured`);
  for (const s of notSecured) {
    out.push(`  ! ${s.logicalName}.${s.column} — IsSecured is FALSE. The field permission `
      + `has no effect until it is true.`);
  }
  if (notSecured.length && !args["secure-columns"]) {
    out.push(`    Pass --secure-columns --apply to set them, then publish customizations.`);
  }
  out.push("");
  for (const p of plan.permissions.filter((x) => x.op !== "unchanged")) {
    out.push(`  ${p.op === "create" ? "+" : "~"} ${p.logicalName}.${p.column} `
      + `canread=${WANTED_PERMISSION.canread} cancreate=${WANTED_PERMISSION.cancreate} `
      + `canupdate=${WANTED_PERMISSION.canupdate}`);
  }
  out.push(`  ${plan.permissions.filter((x) => x.op === "unchanged").length} field permission(s) already correct`);

  if (findings.length) {
    out.push("", `  ! ${findings.length} finding(s):`);
    for (const f of findings) {
      const subject = f.table ? `${f.table}.${f.column}` : (f.profile ?? "");
      out.push(`      [${f.kind}] ${subject} — ${f.detail}`);
    }
  }
  if (writes.length) {
    out.push("", `  writes: ${writes.filter((w) => w.ok).length}/${writes.length} succeeded`);
    for (const w of writes.filter((x) => !x.ok)) {
      out.push(`      x ${w.op} ${w.table ?? w.name}${w.column ? `.${w.column}` : ""} — `
        + `HTTP ${w.status}: ${w.error}`);
    }
  }
  out.push("", `  MEMBERS: none written, ever. The only member is the flow identity and it`);
  out.push(`  is added by hand in the maker portal. Adding an app user defeats the profile.`);
  process.stdout.write(`${out.join("\n")}\n`);
  process.exit(exit);
}

main().catch(fatal("apply-columnsecurity.mjs"));
