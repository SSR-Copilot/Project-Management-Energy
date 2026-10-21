#!/usr/bin/env node
/**
 * gsec.mjs — the G-SEC gate. Node 22, ESM, standard library only.
 *
 * THE RULE IT ENFORCES
 *   **An authenticated user holding no VSB master-data role is refused BY DATAVERSE — not
 *   by the UI — on a direct Web API write to each of the master-data tables.**
 *
 *   That sentence is the exit condition for Phase 1 of the migration and it is not
 *   satisfiable from a repository. The app's admin screens have no server-side permission
 *   check at all: entry is gated by hiding nav items on
 *   `Or(IsApplicationAdministrator, IsControllerOwnData)`, and in a code app the bundle is
 *   public, so that condition is readable as well as bypassable. A route guard is not
 *   security. `src/platform/privileges.ts` says as much in its own header — it reports
 *   security the platform has already applied, and it "exists so the UI can hide a command
 *   the user cannot use, which is a courtesy, not a control."
 *
 *   So this harness does the only thing that can settle the question: it takes a real token
 *   for a real unprivileged identity and attempts a real create against every table
 *   `src/security/matrix.json` marks `isMasterData`, and asserts the platform says no.
 *
 * WHY IT SKIPS, AND WHY A SKIP IS NOT A PASS
 *   This package ships deliberately NOT CONNECTED to an environment. Nothing in it has ever
 *   run against Dataverse. That is the normal state of the repository, so an unconfigured
 *   run exits 0 — a red build on every developer's machine for a gate that cannot run there
 *   would be ignored within a week, and an ignored gate is worse than no gate. But the
 *   output says SKIPPED in the strongest terms available and never uses the word pass,
 *   because "1,720 tests green" has already been mistaken for "security is demonstrated"
 *   once. Not one of those tests shows Dataverse refusing anything, because Dataverse was
 *   not there.
 *
 * WHAT IT REFUSES TO CALL A PASS
 *   A 403 with a privilege-denied fault is the only pass. Specifically NOT passes:
 *     · 404 — the entity set does not exist here. The table is not deployed, so nothing was
 *       tested. Reported as MISSING, exit 3.
 *     · 400 — the request was rejected before authorization. Reported as INCONCLUSIVE.
 *     · 401 — the token is invalid or expired. The whole run is meaningless; exit 3.
 *     · a transport failure — a network error looks exactly like security from a distance
 *       and is the easiest false pass in the business. Reported as INCONCLUSIVE.
 *     · 429/503 after retries — throttled, not refused.
 *   A 2xx is a FAILURE: the write landed and the gate is not met.
 *
 * IT WRITES TO A REAL ENVIRONMENT
 *   The probe body is EMPTY — `POST /api/data/v9.2/<entityset>` with `{}`. That is the
 *   minimal possible write, and it is deliberately minimal in a way that matters: a body
 *   naming no columns cannot be rejected for naming a column wrongly, so a 400 here is
 *   never an artefact of this script guessing a schema. `matrix.json` records no primary
 *   name column, so guessing one would be the only alternative.
 *
 *   If a create nevertheless SUCCEEDS, the row id comes back in the `OData-EntityId` header
 *   and this script deletes it immediately, then re-reads to confirm the delete. If it
 *   cannot delete — likely, since an identity may hold create without delete — it prints
 *   the entity set and the id in a block designed to be impossible to skim past, and exits
 *   non-zero on that account alone. A test harness that leaves rows in a customer
 *   environment and does not say so is a liability.
 *
 * PRE-FLIGHT, so a green run cannot be an accident
 *   1. `WhoAmI` — proves the token authenticates and names the identity.
 *   2. `--identity <upn>` is compared against that identity's `domainname`. An operator who
 *      pasted the wrong token is stopped here rather than shown a false refusal.
 *   3. The identity's security roles are read and checked against the matrix: if it holds
 *      ANY role that the matrix grants create, write or delete on master data, the run
 *      ABORTS. A refusal proves nothing about a user who was never supposed to be refused,
 *      and a green G-SEC obtained that way is the exact failure this gate exists to
 *      prevent.
 *
 * ENVIRONMENT
 *   VSB_GSEC_URL       the environment. Falls back to VSB_DATAVERSE_URL.
 *   VSB_GSEC_TOKEN     bearer token for the UNPRIVILEGED identity. NO FALLBACK — it is
 *                      deliberately not read from VSB_DATAVERSE_TOKEN, because that
 *                      variable holds the deployment token and running this gate as the
 *                      administrator would report every table as a FAILURE and waste a day.
 *   VSB_GSEC_CLEANUP_TOKEN
 *                      optional. A privileged token used ONLY to delete a row that should
 *                      never have been created. Set it if the identity under test may hold
 *                      create without delete.
 *
 *   export VSB_GSEC_URL=https://org.crm4.dynamics.com
 *   export VSB_GSEC_TOKEN=$(az account get-access-token --resource "$VSB_GSEC_URL" \
 *       --query accessToken -o tsv)        # signed in AS THE UNPRIVILEGED USER
 *
 * USAGE
 *   node scripts/gsec.mjs
 *   node scripts/gsec.mjs --identity tester@vsb.energy
 *   node scripts/gsec.mjs --table capexAccountLists
 *   node scripts/gsec.mjs --list            # what it would probe. Offline.
 *   node scripts/gsec.mjs --json
 *
 * EXIT CODES
 *   0  every master-data write was refused with 403 — G-SEC met.
 *      ALSO 0 when no environment is configured, in which case the output says SKIPPED and
 *      the word "pass" appears nowhere.
 *   1  a write SUCCEEDED that should have been refused. G-SEC is NOT met.
 *   2  the harness itself broke.
 *   3  inconclusive: a table is not deployed, the token is bad, the identity holds a
 *      master-data role, or the network failed. Not a pass and not a proof of failure.
 *   4  a row this script created could not be deleted. Read the output and clean it up.
 */
import {
  loadMatrix, masterDataTableKeys, depthFor, parseArgs, resolveEnv,
  makeClient, faultMessage, printHelpAndExit, die, fatal,
} from "../solution/lib/dataverse.mjs";

const HELP = `gsec.mjs — the G-SEC gate: prove DATAVERSE refuses a non-admin's master-data write.

  --identity <upn>   the identity the token is expected to belong to. Checked against
                     WhoAmI; a mismatch aborts. Strongly recommended.
  --table <key>      probe one master-data table key from matrix.json
  --list             print what would be probed and stop. No environment, no network.
  --json             machine-readable result on stdout
  --help, -h         this text

Environment:
  VSB_GSEC_URL     the environment (falls back to VSB_DATAVERSE_URL)
  VSB_GSEC_TOKEN   token for the UNPRIVILEGED identity. No fallback, on purpose.
  VSB_GSEC_CLEANUP_TOKEN   optional privileged token, used only to delete a row that
                           should never have been created.

Exit: 0 refused everywhere (or SKIPPED, unconfigured) · 1 a write succeeded · 2 harness
broke · 3 inconclusive · 4 a created row could not be deleted.`;

const SPEC = {
  help: { type: "boolean" }, list: { type: "boolean" }, json: { type: "boolean" },
  identity: { type: "string" }, table: { type: "string" },
};

/** The three privileges that make a role a master-data writer. Read, alone, is fine. */
const WRITING_PRIVILEGES = ["create", "write", "delete"];

const VERDICT = {
  refused: "REFUSED",           // 403 — the only pass
  succeeded: "WRITE SUCCEEDED", // 2xx — the gate fails
  missing: "TABLE NOT FOUND",   // 404 — nothing was tested
  inconclusive: "INCONCLUSIVE", // 400 / 0 / 429 / anything else
};

async function main() {
  const args = parseArgs(process.argv.slice(2), SPEC);
  if (args.help) printHelpAndExit(HELP);

  const matrix = loadMatrix();
  const allMaster = masterDataTableKeys(matrix);
  if (allMaster.length === 0) {
    die(`G-SEC: matrix.json marks no table isMasterData, so there is nothing to prove. `
      + `That is a matrix defect, not a pass.`, 2);
  }
  if (args.table && !allMaster.includes(args.table)) {
    die(`--table "${args.table}" is not a master-data table key. Master-data keys:\n  `
      + allMaster.join("\n  "), 2);
  }
  const targets = (args.table ? [args.table] : allMaster)
    .map((k) => ({ key: k, ...matrix.tables[k] }));

  /* ── the roles that must NOT be held, derived from the matrix ──────────────── */
  const writerRoles = Object.keys(matrix.roles).filter((roleKey) =>
    allMaster.some((t) => WRITING_PRIVILEGES.some((p) => depthFor(matrix, roleKey, t, p) !== "none")));
  const writerRoleNames = writerRoles.map((k) => matrix.roles[k].name);

  if (args.list) {
    const payload = {
      matrixVersion: matrix.version,
      masterDataTables: targets.map((t) => ({ key: t.key, entitySet: t.entitySet,
        logicalName: t.logicalName, ownedByScreen: t.ownedByScreen })),
      disqualifyingRoles: writerRoleNames,
      probe: "POST /api/data/v9.2/<entitySet> with an empty body {}",
    };
    if (args.json) { process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`); process.exit(0); }
    const out = [
      `G-SEC — what would be probed. matrix ${matrix.version}. Nothing was contacted.`, "",
      `  ${targets.length} master-data table(s); each gets POST <entitySet> {} and must answer 403:`, "",
    ];
    for (const t of targets) {
      out.push(`      ${t.entitySet.padEnd(46)} ${t.key}   (maintained by ${t.ownedByScreen})`);
    }
    out.push("", `  The identity under test must hold NONE of these roles, because the matrix`);
    out.push(`  grants each of them create, write or delete on master data:`);
    for (const n of writerRoleNames) out.push(`      ${n}`);
    process.stdout.write(`${out.join("\n")}\n`);
    process.exit(0);
  }

  /* ── the deliberate, loud skip ──────────────────────────────────────────────── */
  const env = resolveEnv(process.env, { urlVar: "VSB_GSEC_URL", tokenVar: "VSB_GSEC_TOKEN" });
  const url = env.url || (process.env.VSB_DATAVERSE_URL ?? "").trim().replace(/\/+$/, "");
  const token = env.token;
  if (!url || !token) {
    const missing = [
      ...(url ? [] : ["VSB_GSEC_URL (or VSB_DATAVERSE_URL)"]),
      ...(token ? [] : ["VSB_GSEC_TOKEN"]),
    ];
    if (args.json) {
      process.stdout.write(`${JSON.stringify({
        gate: "G-SEC", result: "SKIPPED", passed: false, proven: false,
        reason: "no environment configured", missing,
        note: "A skip is not a pass. G-SEC is a statement about an environment and cannot "
          + "be satisfied from a repository.",
        matrixVersion: matrix.version, masterDataTables: targets.length, exit: 0,
      }, null, 2)}\n`);
      process.exit(0);
    }
    process.stdout.write([
      ``,
      `  ####################################################################`,
      `  #                                                                  #`,
      `  #   G-SEC  ==  S K I P P E D  ==  NOT RUN, AND NOT A PASS          #`,
      `  #                                                                  #`,
      `  ####################################################################`,
      ``,
      `  No environment is configured, so NOTHING WAS TESTED. Missing:`,
      ...missing.map((m) => `      ${m}`),
      ``,
      `  This package ships deliberately not connected, so this is the normal`,
      `  state of the repository and the exit code is 0 on purpose — a gate`,
      `  that fails on every developer's machine gets ignored, and an ignored`,
      `  gate is worse than no gate.`,
      ``,
      `  But be exact about what this run established: nothing. G-SEC asks`,
      `  whether DATAVERSE refuses an authenticated non-admin a direct Web API`,
      `  write to each of the ${String(targets.length).padStart(2)} master-data tables. That is a statement`,
      `  about an environment. It cannot be satisfied from a repository, and`,
      `  it is the gate that closes Phase 1 of the migration.`,
      ``,
      `  To actually run it, as the UNPRIVILEGED user:`,
      ``,
      `      export VSB_GSEC_URL=https://<org>.crm4.dynamics.com`,
      `      export VSB_GSEC_TOKEN=$(az account get-access-token \\`,
      `          --resource "$VSB_GSEC_URL" --query accessToken -o tsv)`,
      `      node scripts/gsec.mjs --identity <that user's upn>`,
      ``,
      `  VSB_GSEC_TOKEN is deliberately NOT read from VSB_DATAVERSE_TOKEN: that`,
      `  variable holds the deployment token, and running this gate as the`,
      `  administrator reports every table as a FAILURE.`,
      ``,
      `  node scripts/gsec.mjs --list   shows exactly what would be probed.`,
      ``,
    ].join("\n"));
    process.exit(0);
  }
  if (env.error) die(`G-SEC: ${env.error}`, 2);

  const client = makeClient({ url, token, apiVersion: env.apiVersion });
  const cleanupToken = (process.env.VSB_GSEC_CLEANUP_TOKEN ?? "").trim();
  const cleanupClient = cleanupToken
    ? makeClient({ url, token: cleanupToken, apiVersion: env.apiVersion })
    : null;

  /* ── pre-flight 1: WhoAmI ───────────────────────────────────────────────────── */
  const who = await client.get("WhoAmI");
  if (!who.ok) {
    return report({
      args, matrix, url, targets, results: [], identity: null, roles: null,
      fatal: `WhoAmI failed (HTTP ${who.status}): ${faultMessage(who)}. `
        + `The token in VSB_GSEC_TOKEN does not authenticate against ${url}. Nothing was `
        + `tested — this is not a pass and not a failure.`,
      exit: 3,
    });
  }
  const userId = who.json?.UserId;

  const me = await client.get(`systemusers(${userId})?$select=domainname,fullname,isdisabled`);
  const identity = {
    userId,
    domainname: me.ok ? me.json?.domainname ?? null : null,
    fullname: me.ok ? me.json?.fullname ?? null : null,
    isdisabled: me.ok ? me.json?.isdisabled ?? null : null,
    readable: me.ok,
  };

  /* ── pre-flight 2: is this the identity the operator meant? ─────────────────── */
  if (args.identity) {
    if (!identity.readable) {
      return report({
        args, matrix, url, targets, results: [], identity, roles: null,
        fatal: `--identity ${args.identity} was supplied but this token cannot read its own `
          + `systemuser row (HTTP ${me.status}), so the claim cannot be checked. Refusing to `
          + `run a security gate on an unverified identity.`,
        exit: 3,
      });
    }
    if ((identity.domainname ?? "").toLowerCase() !== args.identity.toLowerCase()) {
      return report({
        args, matrix, url, targets, results: [], identity, roles: null,
        fatal: `--identity ${args.identity} does not match the token's identity `
          + `"${identity.domainname}". Somebody has the wrong token in the wrong variable. `
          + `Nothing was tested.`,
        exit: 3,
      });
    }
  }

  /* ── pre-flight 3: the identity must hold no master-data-writing role ───────── */
  const roleRead = await client.all(
    `systemusers(${userId})/systemuserroles_association?$select=roleid,name`,
  );
  const teamRoleRead = await client.all(
    `systemusers(${userId})/teammembership_association?$select=teamid,name`
    + `&$expand=teamroles_association($select=roleid,name)`,
  );
  const heldRoleNames = new Set();
  if (roleRead.ok) for (const r of roleRead.rows) if (r.name) heldRoleNames.add(r.name);
  if (teamRoleRead.ok) {
    for (const t of teamRoleRead.rows) {
      for (const r of t.teamroles_association ?? []) if (r.name) heldRoleNames.add(r.name);
    }
  }
  const roles = {
    readable: roleRead.ok,
    teamRolesReadable: teamRoleRead.ok,
    held: [...heldRoleNames].sort(),
    disqualifying: [...heldRoleNames].filter((n) => writerRoleNames.includes(n)),
  };
  if (roles.disqualifying.length > 0) {
    return report({
      args, matrix, url, targets, results: [], identity, roles,
      fatal: `The identity holds ${roles.disqualifying.join(", ")}, which the matrix grants `
        + `create/write/delete on master data. A refusal would prove nothing about a user who `
        + `was never meant to be refused, and a green G-SEC obtained this way is exactly the `
        + `false assurance this gate exists to prevent. Use an identity with none of: `
        + `${writerRoleNames.join(", ")}. Nothing was tested.`,
      exit: 3,
    });
  }

  /* ── the probe ──────────────────────────────────────────────────────────────── */
  const results = [];
  const leftBehind = [];
  for (const t of targets) {
    // An EMPTY body: the minimal possible write, and one that cannot be rejected for
    // naming a column wrongly. matrix.json records no primary name column, and guessing
    // one would turn a schema guess into a fake INCONCLUSIVE.
    const res = await client.post(t.entitySet, {});
    const r = {
      table: t.key, entitySet: t.entitySet, logicalName: t.logicalName,
      status: res.status, verdict: null, detail: null,
      expectedPrivilege: `prvCreate${t.logicalName}`,
      createdId: null, cleanedUp: null,
    };

    if (res.status === 403) {
      r.verdict = VERDICT.refused;
      r.detail = faultMessage(res);
      // Advisory only: the fault text is not a contract, so a missing mention is a note,
      // never a downgrade. A 403 from Dataverse on a create IS a refusal.
      r.mentionsPrivilege = String(r.detail).includes(r.expectedPrivilege)
        || /privilege/i.test(String(r.detail));
    } else if (res.ok) {
      r.verdict = VERDICT.succeeded;
      r.createdId = res.entityId;
      r.detail = `HTTP ${res.status}. THE WRITE LANDED. This identity can create rows in `
        + `${t.entitySet} over the Web API. Whatever the UI shows, the table is unprotected.`;
      const cleanup = await deleteRow(client, cleanupClient, t.entitySet, res.entityId);
      r.cleanedUp = cleanup.ok;
      r.cleanupDetail = cleanup.detail;
      if (!cleanup.ok) leftBehind.push({ entitySet: t.entitySet, id: res.entityId, detail: cleanup.detail });
    } else if (res.status === 404) {
      r.verdict = VERDICT.missing;
      r.detail = `the entity set ${t.entitySet} does not exist in this environment, so `
        + `NOTHING WAS TESTED for this table. Either it is not deployed or matrix.json spells `
        + `it differently from the environment. ${faultMessage(res)}`;
    } else if (res.status === 401) {
      r.verdict = VERDICT.inconclusive;
      r.detail = `HTTP 401 — the token is invalid or has expired mid-run. Nothing after this `
        + `point is meaningful. ${faultMessage(res)}`;
    } else if (res.status === 0) {
      r.verdict = VERDICT.inconclusive;
      r.detail = `no response: ${faultMessage(res)}. A network failure looks like security `
        + `from a distance and is the easiest false pass there is. NOT counted as a refusal.`;
    } else {
      r.verdict = VERDICT.inconclusive;
      r.detail = `HTTP ${res.status} — rejected, but not by the privilege check. `
        + `${faultMessage(res)}`;
    }
    results.push(r);
  }

  const succeeded = results.filter((r) => r.verdict === VERDICT.succeeded);
  const refused = results.filter((r) => r.verdict === VERDICT.refused);
  const unclear = results.filter((r) =>
    r.verdict === VERDICT.missing || r.verdict === VERDICT.inconclusive);

  let exit = 0;
  if (succeeded.length > 0) exit = 1;
  else if (leftBehind.length > 0) exit = 4;
  else if (unclear.length > 0) exit = 3;

  return report({ args, matrix, url, targets, results, identity, roles, leftBehind, exit,
    counts: { refused: refused.length, succeeded: succeeded.length, unclear: unclear.length } });
}

/**
 * Delete a row that should never have existed, and prove it is gone.
 *
 * Tries the identity under test first — it is the one that created the row — then the
 * optional privileged cleanup token. A delete that answers 204 is then RE-READ, because
 * "the delete request was accepted" and "the row is gone" are different claims and this
 * script is not allowed to make the weaker one and print the stronger.
 */
async function deleteRow(client, cleanupClient, entitySet, id) {
  if (!id) {
    return { ok: false, detail:
      `the create succeeded but no OData-EntityId came back, so the row CANNOT BE FOUND `
      + `to delete it. Search ${entitySet} for a row created just now with no field values.` };
  }
  const tries = [
    { who: "the identity under test", c: client },
    ...(cleanupClient ? [{ who: "VSB_GSEC_CLEANUP_TOKEN", c: cleanupClient }] : []),
  ];
  const notes = [];
  for (const t of tries) {
    const res = await t.c.del(`${entitySet}(${id})`);
    if (res.ok || res.status === 404) {
      const check = await (cleanupClient ?? client).get(`${entitySet}(${id})?$select=${idColumn(entitySet)}`);
      if (check.status === 404) return { ok: true, detail: `deleted by ${t.who} and confirmed gone` };
      if (!check.ok) {
        notes.push(`${t.who}: delete answered ${res.status} but the confirming read answered `
          + `${check.status}, so the delete is UNCONFIRMED`);
        continue;
      }
      notes.push(`${t.who}: delete answered ${res.status} but the row is STILL THERE`);
      continue;
    }
    notes.push(`${t.who}: HTTP ${res.status} — ${faultMessage(res)}`);
  }
  return { ok: false, detail: notes.join(" | ")
    + (cleanupClient ? "" : " | set VSB_GSEC_CLEANUP_TOKEN to a privileged token so this "
      + "script can clean up after itself") };
}

/** Best guess at the primary key column, used only for a confirming read. */
const idColumn = (entitySet) => `${entitySet.replace(/(es|s)$/, "")}id`;

/* ══════════════════════════════════════════════════════════════════════ report ════ */

function report(o) {
  const { args, matrix, url, targets, results, identity, roles, leftBehind = [], exit } = o;
  if (args.json) {
    process.stdout.write(`${JSON.stringify({
      gate: "G-SEC",
      result: o.fatal ? "INCONCLUSIVE" : exit === 0 ? "MET" : exit === 1 ? "NOT MET" : "INCONCLUSIVE",
      passed: exit === 0 && !o.fatal && results.length > 0,
      proven: exit === 0 && !o.fatal && results.length > 0,
      matrixVersion: matrix.version, environment: url,
      identity, roles, masterDataTables: targets.length,
      counts: o.counts ?? null, results, leftBehind, fatal: o.fatal ?? null, exit,
    }, null, 2)}\n`);
    process.exit(exit);
  }

  const out = [`G-SEC — Dataverse must refuse a non-admin's master-data write`];
  out.push(`  matrix          ${matrix.version}`);
  out.push(`  environment     ${url}`);
  out.push(`  identity        ${identity?.domainname ?? identity?.userId ?? "unknown"}`
    + `${identity?.fullname ? ` (${identity.fullname})` : ""}`);
  if (roles) {
    out.push(`  roles held      ${roles.held.length ? roles.held.join(", ") : "none"}`
      + `${roles.readable ? "" : "   [direct roles NOT readable by this token]"}`
      + `${roles.teamRolesReadable ? "" : "   [team roles NOT readable by this token]"}`);
  }
  out.push("");

  if (o.fatal) {
    out.push(`  x INCONCLUSIVE — NOTHING WAS TESTED.`, "");
    for (const line of wrap(o.fatal, 74)) out.push(`      ${line}`);
    out.push("", `  This is not a pass. Exit ${exit}.`);
    process.stdout.write(`${out.join("\n")}\n`);
    process.exit(exit);
  }

  for (const r of results) {
    const mark = r.verdict === VERDICT.refused ? "ok "
      : r.verdict === VERDICT.succeeded ? "X  "
      : r.verdict === VERDICT.missing ? "?  " : "?  ";
    out.push(`  ${mark}${r.entitySet.padEnd(46)} ${String(r.status).padStart(3)}  ${r.verdict}`);
    if (r.verdict !== VERDICT.refused) {
      for (const line of wrap(r.detail, 68)) out.push(`         ${line}`);
      if (r.createdId) {
        out.push(`         row id ${r.createdId} — cleanup: `
          + `${r.cleanedUp ? "OK" : "FAILED"}${r.cleanupDetail ? ` (${r.cleanupDetail})` : ""}`);
      }
    } else if (r.mentionsPrivilege === false) {
      out.push(`         refused, but the fault text does not mention a privilege. `
        + `Advisory only: a 403 on a create is a refusal.`);
    }
  }

  const c = o.counts ?? { refused: 0, succeeded: 0, unclear: 0 };
  out.push("");
  out.push(`  ${c.refused}/${results.length} refused · ${c.succeeded} SUCCEEDED · ${c.unclear} inconclusive or missing`);

  if (leftBehind.length > 0) {
    out.push("",
      `  ####################################################################`,
      `  #  ROWS WERE CREATED AND COULD NOT BE DELETED. CLEAN THEM UP.      #`,
      `  ####################################################################`);
    for (const l of leftBehind) {
      out.push(`      ${l.entitySet}(${l.id})`);
      for (const line of wrap(l.detail, 68)) out.push(`         ${line}`);
    }
  }

  out.push("");
  if (exit === 0) {
    out.push(`  G-SEC MET. Every master-data table refused a direct Web API create by an`);
    out.push(`  authenticated identity holding no master-data role. The refusal came from`);
    out.push(`  Dataverse, not from the app.`);
  } else if (exit === 1) {
    out.push(`  G-SEC NOT MET. ${c.succeeded} master-data table(s) accepted a write from an`);
    out.push(`  identity that must not be able to write them. The admin screens' nav-item`);
    out.push(`  gating is the only thing standing in the way, and it is client-side.`);
    out.push(`  Run: node solution/security/apply-roles.mjs --apply, then re-run this.`);
  } else if (exit === 4) {
    out.push(`  G-SEC INCONCLUSIVE — and this run left rows behind. See the block above.`);
  } else {
    out.push(`  G-SEC INCONCLUSIVE. Some tables were not tested at all. A table that is not`);
    out.push(`  deployed cannot refuse anything, and counting that as a pass is how an`);
    out.push(`  unprotected table ships. apply-roles.mjs reports the same gap as its list of`);
    out.push(`  privileges the matrix wants and the environment does not have.`);
  }
  process.stdout.write(`${out.join("\n")}\n`);
  process.exit(exit);
}

function wrap(text, width) {
  const words = String(text ?? "").split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const w of words) {
    if (line && line.length + 1 + w.length > width) { lines.push(line); line = w; }
    else line = line ? `${line} ${w}` : w;
  }
  if (line) lines.push(line);
  return lines;
}

main().catch(fatal("gsec.mjs"));
