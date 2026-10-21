#!/usr/bin/env node
/**
 * apply-customapis.mjs — create or update the `customapi`,
 * `customapirequestparameter` and `customapiresponseproperty` rows described by the JSON
 * files beside this script. Node 22, ESM, standard library only. DRY RUN BY DEFAULT.
 *
 * THE DEFINITIONS ARE DATA, NOT CODE
 *   One `.json` file per API, each self-describing: the message, its parameters, its
 *   response properties, the writes it performs, the TypeScript functions its behaviour is
 *   ported from, and the unit-test IDs that already pin that behaviour. They are meant to
 *   be READ during review by someone who will never run this script. This file only turns
 *   them into rows; every judgement about shape lives in the JSON, next to its provenance.
 *
 * WHAT A CUSTOM API IS FOR HERE, precisely
 *   Each of these five messages exists because a sequence of Dataverse writes has to be
 *   ATOMIC and the code app cannot make it so. `dataClient.batch()` bounds concurrency over
 *   individual writes; it is not a transactional `$batch` changeset, so any plan with two
 *   or more writes can half-apply. Three of the five replace short synchronous flows for
 *   exactly that reason, one is a write the app computes and tests but has never been able
 *   to make, and one closes a lost-update race a flow cannot lock its way out of.
 *
 *   A custom API is NOT a way to bypass security. The plugin runs in the calling user's
 *   context, so table and column security still apply to every write it makes — which is
 *   why these messages are safe to leave callable by any authenticated user and why
 *   `apply-roles.mjs` is still the thing that decides who can do what.
 *
 * WHAT THIS SCRIPT DOES NOT DO
 *   It does not register a plugin. `customapi.plugintypeid` is left alone: the assembly has
 *   to be built and registered first (see `solution/plugins/README.md`), and only then is
 *   the plugin type bound to the message — a step done once per environment in the Plugin
 *   Registration Tool or the maker portal. Until then each message exists and answers with
 *   its declared response properties unpopulated, which is the correct intermediate state
 *   and is reported as such.
 *
 * USAGE
 *   node solution/customapi/apply-customapis.mjs                  # dry run, all files
 *   node solution/customapi/apply-customapis.mjs --apply
 *   node solution/customapi/apply-customapis.mjs --api vsb_CancelGateApproval
 *   node solution/customapi/apply-customapis.mjs --offline --json
 *
 * ENVIRONMENT
 *   VSB_DATAVERSE_URL, VSB_DATAVERSE_TOKEN, optional VSB_DATAVERSE_API (default v9.2).
 *   VSB_SOLUTION_UNIQUENAME  optional. When set, rows are created inside that unmanaged
 *                            solution via the MSCRM.SolutionUniqueName header, which is
 *                            the only way a Web API create lands in a solution rather than
 *                            in Default. Strongly recommended; see solution/README.md.
 *
 * EXIT CODES
 *   0  the environment matches the definitions, or --apply finished with no failures
 *   1  drift: rows are missing or differ from the definitions
 *   2  the script itself broke (including an invalid definition file)
 *   3  no environment configured
 *   4  a write failed during --apply
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseArgs, resolveEnv, missingEnvMessage, makeClient, faultMessage,
  printHelpAndExit, die, fatal,
} from "../lib/dataverse.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

const HELP = `apply-customapis.mjs — apply solution/customapi/*.json to a Dataverse environment.

  --apply              actually write. Without it this is a DRY RUN and prints the plan.
  --api <uniquename>   narrow to one definition, e.g. vsb_CancelGateApproval
  --offline            validate the definition files and print them. No environment.
  --json               machine-readable output on stdout
  --help, -h           this text

Environment: VSB_DATAVERSE_URL, VSB_DATAVERSE_TOKEN, optional VSB_DATAVERSE_API,
optional VSB_SOLUTION_UNIQUENAME (so the rows land in your solution, not in Default).
Exit: 0 in agreement · 1 drift · 2 script or definition broke · 3 no environment · 4 write failed.`;

const SPEC = {
  help: { type: "boolean" }, apply: { type: "boolean" }, offline: { type: "boolean" },
  json: { type: "boolean" }, api: { type: "string" },
};

/* ═══════════════════════════════════════════════════════════════════ the enums ════ */

/**
 * `customapifieldtype`. The definitions spell these as names so they can be reviewed;
 * the platform wants the number.
 */
const FIELD_TYPE = {
  Boolean: 0, DateTime: 1, Decimal: 2, Entity: 3, EntityCollection: 4, EntityReference: 5,
  Float: 6, Integer: 7, Money: 8, Picklist: 9, String: 10, StringArray: 11, Guid: 12,
};
/** `customapi_bindingtype`. */
const BINDING_TYPE = { Global: 0, Entity: 1, EntityCollection: 2 };
/** `customapi_allowedcustomprocessingsteptype`. */
const STEP_TYPE = { None: 0, AsyncOnly: 1, SyncAndAsync: 2 };

/* ═════════════════════════════════════════════════════════════ the definitions ════ */

function loadDefinitions(only) {
  const files = readdirSync(HERE).filter((f) => f.endsWith(".json")).sort();
  if (files.length === 0) die(`no *.json definitions found in ${HERE}`, 2);
  const defs = [];
  for (const f of files) {
    let d;
    try {
      d = JSON.parse(readFileSync(join(HERE, f), "utf8"));
    } catch (e) {
      die(`${f} is not valid JSON: ${e.message}`, 2);
    }
    validate(d, f);
    if (only && d.uniquename !== only) continue;
    defs.push({ file: f, def: d });
  }
  if (only && defs.length === 0) {
    die(`--api "${only}" matched none of: ${files.map((f) => basename(f, ".json")).join(", ")}`, 2);
  }
  return defs;
}

/**
 * Validation is strict on purpose. A definition with a mistyped parameter would create a
 * message whose signature silently disagrees with the plugin that implements it, and the
 * symptom would be a null argument at runtime rather than an error here.
 */
function validate(d, f) {
  const bad = (m) => die(`${f}: ${m}`, 2);
  if (!d.uniquename) bad(`no "uniquename"`);
  if (!/^[a-z0-9]+_[A-Za-z0-9]+$/.test(d.uniquename)) {
    bad(`uniquename "${d.uniquename}" must be publisher-prefixed, e.g. vsb_DoTheThing`);
  }
  if (basename(f, ".json") !== d.uniquename) {
    bad(`the file name must be the uniquename, so a reviewer can find it: expected `
      + `${d.uniquename}.json`);
  }
  if (!d.description || d.description.length < 80) {
    bad(`the description must say WHY the message exists — a custom API without a stated `
      + `reason is a place for logic to hide`);
  }
  if (!(d.bindingtype in BINDING_TYPE)) bad(`bindingtype must be one of ${Object.keys(BINDING_TYPE)}`);
  if (!(d.allowedcustomprocessingsteptype in STEP_TYPE)) {
    bad(`allowedcustomprocessingsteptype must be one of ${Object.keys(STEP_TYPE)}`);
  }
  if (d.bindingtype !== "Global" && !d.boundentitylogicalname) {
    bad(`a bound message needs boundentitylogicalname`);
  }
  const seen = new Set();
  for (const p of [...(d.requestParameters ?? []), ...(d.responseProperties ?? [])]) {
    if (!p.uniquename) bad(`a parameter or property has no uniquename`);
    if (!(p.type in FIELD_TYPE)) bad(`${p.uniquename}: type "${p.type}" is not one of ${Object.keys(FIELD_TYPE)}`);
    if (!p.description) bad(`${p.uniquename}: no description. Every argument has to say where it came from.`);
    const key = `${p.uniquename}`;
    if (seen.has(key)) bad(`${p.uniquename} is declared twice`);
    seen.add(key);
    if ((p.type === "Entity" || p.type === "EntityCollection" || p.type === "EntityReference")
        && !p.logicalentityname) {
      bad(`${p.uniquename}: type ${p.type} needs logicalentityname`);
    }
  }
}

const apiRow = (d) => ({
  uniquename: d.uniquename,
  name: d.name ?? d.uniquename,
  displayname: d.displayname ?? d.uniquename,
  description: d.description,
  bindingtype: BINDING_TYPE[d.bindingtype],
  boundentitylogicalname: d.boundentitylogicalname ?? null,
  isfunction: d.isfunction === true,
  enabledforworkflow: d.enabledforworkflow === true,
  allowedcustomprocessingsteptype: STEP_TYPE[d.allowedcustomprocessingsteptype],
  isprivate: d.isprivate === true,
  executeprivilegename: d.executeprivilegename ?? null,
});

const childRow = (d, p, kind) => ({
  uniquename: p.uniquename,
  name: p.name ?? `${d.uniquename}.${p.uniquename}`,
  displayname: p.displayname ?? p.uniquename,
  description: p.description,
  type: FIELD_TYPE[p.type],
  logicalentityname: p.logicalentityname ?? null,
  ...(kind === "request" ? { isoptional: p.isoptional === true } : {}),
});

/* ══════════════════════════════════════════════════════════════════════ main ════ */

const COMPARE_API = [
  "name", "displayname", "description", "bindingtype", "boundentitylogicalname",
  "isfunction", "enabledforworkflow", "allowedcustomprocessingsteptype", "isprivate",
  "executeprivilegename",
];
const COMPARE_REQ = ["name", "displayname", "description", "type", "isoptional", "logicalentityname"];
const COMPARE_RES = ["name", "displayname", "description", "type", "logicalentityname"];

async function main() {
  const args = parseArgs(process.argv.slice(2), SPEC);
  if (args.help) printHelpAndExit(HELP);

  const defs = loadDefinitions(args.api);

  if (args.offline) {
    const payload = defs.map(({ file, def }) => ({
      file, uniquename: def.uniquename, bindingtype: def.bindingtype,
      request: (def.requestParameters ?? []).map((p) =>
        ({ name: p.uniquename, type: p.type, optional: p.isoptional === true })),
      response: (def.responseProperties ?? []).map((p) => ({ name: p.uniquename, type: p.type })),
      replaces: def.replaces ?? null, portFrom: def.portFrom ?? null,
    }));
    if (args.json) { process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`); process.exit(0); }
    const out = [`apply-customapis — OFFLINE. ${defs.length} definition(s), all valid.`, ""];
    for (const d of payload) {
      out.push(`  ${d.uniquename}   [${d.bindingtype}]`);
      for (const p of d.request) {
        out.push(`      in   ${p.name.padEnd(24)} ${p.type}${p.optional ? " (optional)" : ""}`);
      }
      for (const p of d.response) out.push(`      out  ${p.name.padEnd(24)} ${p.type}`);
      if (d.replaces) out.push(`      replaces flow ${d.replaces.flow} (${d.replaces.actions} actions)`);
      if (d.portFrom?.tests?.length) out.push(`      pinned by ${d.portFrom.tests.join(", ")}`);
      out.push("");
    }
    process.stdout.write(`${out.join("\n")}\n`);
    process.exit(0);
  }

  const env = resolveEnv();
  if (!env.ok || env.error) {
    die(env.error ?? missingEnvMessage(env.missing,
      `\nTo validate and print the definitions without an environment: --offline.`), 3);
  }
  const client = makeClient(env);
  const solution = (process.env.VSB_SOLUTION_UNIQUENAME ?? "").trim();
  const solutionHeader = solution ? { "MSCRM.SolutionUniqueName": solution } : {};

  const plan = [];
  const writes = [];
  let failures = 0;

  for (const { def } of defs) {
    const want = apiRow(def);
    const found = await client.all(
      `customapis?$select=${["customapiid", "uniquename", ...COMPARE_API].join(",")},_plugintypeid_value`
      + `&$filter=uniquename eq '${def.uniquename}'`,
    );
    if (!found.ok) die(`could not read customapis: ${faultMessage(found.res)}`, 2);
    if (found.rows.length > 1) {
      die(`${found.rows.length} customapi rows have uniquename ${def.uniquename}; `
        + `resolve that in the maker portal before running this`, 2);
    }
    let apiId = found.rows[0]?.customapiid ?? null;
    const entry = {
      uniquename: def.uniquename, api: "unchanged", request: [], response: [],
      pluginBound: Boolean(found.rows[0]?._plugintypeid_value),
    };

    if (!apiId) {
      entry.api = "create";
      if (args.apply) {
        const res = await client.post("customapis", want,
          { ...solutionHeader, Prefer: "return=representation" });
        writes.push({ op: "create customapi", uniquename: def.uniquename, ok: res.ok,
          status: res.status, error: res.ok ? null : faultMessage(res) });
        if (res.ok) apiId = res.json?.customapiid ?? res.entityId;
        else { failures++; plan.push(entry); continue; }
      }
    } else {
      const drift = COMPARE_API.filter((k) => normalise(found.rows[0][k]) !== normalise(want[k]));
      if (drift.length) {
        entry.api = "update";
        entry.apiDrift = drift;
        if (args.apply) {
          const res = await client.patch(`customapis(${apiId})`,
            Object.fromEntries(drift.map((k) => [k, want[k]])), solutionHeader);
          writes.push({ op: "update customapi", uniquename: def.uniquename, fields: drift,
            ok: res.ok, status: res.status, error: res.ok ? null : faultMessage(res) });
          if (!res.ok) failures++;
        }
      }
    }

    // Children are only reconcilable once the parent id is known. In a dry run against an
    // API that does not exist yet there is no id, so the children are reported as pending
    // rather than diffed — inventing an id to diff against would be a lie.
    if (!apiId) {
      entry.request = (def.requestParameters ?? []).map((p) => ({ uniquename: p.uniquename, op: "create" }));
      entry.response = (def.responseProperties ?? []).map((p) => ({ uniquename: p.uniquename, op: "create" }));
      plan.push(entry);
      continue;
    }

    await reconcileChildren({
      client, apiId, solutionHeader, apply: args.apply, writes,
      set: "customapirequestparameters",
      idColumn: "customapirequestparameterid",
      compare: COMPARE_REQ,
      want: (def.requestParameters ?? []).map((p) => childRow(def, p, "request")),
      into: entry.request,
      onFailure: () => failures++,
    });
    await reconcileChildren({
      client, apiId, solutionHeader, apply: args.apply, writes,
      set: "customapiresponseproperties",
      idColumn: "customapiresponsepropertyid",
      compare: COMPARE_RES,
      want: (def.responseProperties ?? []).map((p) => childRow(def, p, "response")),
      into: entry.response,
      onFailure: () => failures++,
    });
    plan.push(entry);
  }

  const pending = plan.filter((e) =>
    e.api !== "unchanged"
    || e.request.some((r) => r.op !== "unchanged")
    || e.response.some((r) => r.op !== "unchanged")).length;

  let exit = 0;
  if (failures > 0) exit = 4;
  else if (!args.apply && pending > 0) exit = 1;

  const payload = {
    environment: env.url, solution: solution || null,
    mode: args.apply ? "apply" : "dry-run", plan, writes, exit,
  };
  if (args.json) { process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`); process.exit(exit); }

  const out = [`apply-customapis — ${args.apply ? "APPLY" : "DRY RUN (nothing was written)"}`];
  out.push(`  environment     ${env.url}`);
  out.push(`  solution        ${solution || "NONE — rows will land in Default. Set VSB_SOLUTION_UNIQUENAME."}`);
  out.push("");
  for (const e of plan) {
    const mark = e.api === "unchanged" ? "=" : e.api === "create" ? "+" : "~";
    out.push(`  ${mark} ${e.uniquename}${e.apiDrift ? `   fields: ${e.apiDrift.join(", ")}` : ""}`);
    for (const c of e.request.filter((x) => x.op !== "unchanged")) {
      out.push(`      ${c.op === "create" ? "+" : c.op === "update" ? "~" : "-"} in  ${c.uniquename}`
        + `${c.drift ? `  (${c.drift.join(", ")})` : ""}`);
    }
    for (const c of e.response.filter((x) => x.op !== "unchanged")) {
      out.push(`      ${c.op === "create" ? "+" : c.op === "update" ? "~" : "-"} out ${c.uniquename}`
        + `${c.drift ? `  (${c.drift.join(", ")})` : ""}`);
    }
    if (!e.pluginBound) {
      out.push(`      ! no plugintypeid bound — the message will accept a call and do nothing.`);
      out.push(`        Build and register the assembly (solution/plugins/README.md), then`);
      out.push(`        bind the plugin type to this message. That step is not scriptable here.`);
    }
  }
  if (writes.length) {
    out.push("", `  writes: ${writes.filter((w) => w.ok).length}/${writes.length} succeeded`);
    for (const w of writes.filter((x) => !x.ok)) {
      out.push(`      x ${w.op} ${w.uniquename ?? ""} — HTTP ${w.status}: ${w.error}`);
    }
  }
  if (!args.apply && pending > 0) out.push("", `  Re-run with --apply to write these changes.`);
  process.stdout.write(`${out.join("\n")}\n`);
  process.exit(exit);
}

async function reconcileChildren(o) {
  const found = await o.client.all(
    `${o.set}?$select=${[o.idColumn, "uniquename", ...o.compare].join(",")}`
    + `&$filter=_customapiid_value eq ${o.apiId}`,
  );
  if (!found.ok) die(`could not read ${o.set}: ${faultMessage(found.res)}`, 2);
  const have = new Map(found.rows.map((r) => [r.uniquename, r]));

  for (const w of o.want) {
    const row = have.get(w.uniquename);
    if (!row) {
      o.into.push({ uniquename: w.uniquename, op: "create" });
      if (o.apply) {
        const res = await o.client.post(o.set,
          { ...w, "CustomAPIId@odata.bind": `/customapis(${o.apiId})` }, o.solutionHeader);
        o.writes.push({ op: `create ${o.set}`, uniquename: w.uniquename, ok: res.ok,
          status: res.status, error: res.ok ? null : faultMessage(res) });
        if (!res.ok) o.onFailure();
      }
      continue;
    }
    const drift = o.compare.filter((k) => normalise(row[k]) !== normalise(w[k]));
    if (drift.length === 0) { o.into.push({ uniquename: w.uniquename, op: "unchanged" }); continue; }
    o.into.push({ uniquename: w.uniquename, op: "update", drift });
    if (o.apply) {
      const res = await o.client.patch(`${o.set}(${row[o.idColumn]})`,
        Object.fromEntries(drift.map((k) => [k, w[k]])), o.solutionHeader);
      o.writes.push({ op: `update ${o.set}`, uniquename: w.uniquename, fields: drift,
        ok: res.ok, status: res.status, error: res.ok ? null : faultMessage(res) });
      if (!res.ok) o.onFailure();
    }
  }
  // A parameter in the environment and not in the definition is REPORTED, not deleted.
  // Deleting one silently would change a message's signature under a plugin that may
  // still read it; the operator decides.
  for (const [name] of have) {
    if (o.want.some((w) => w.uniquename === name)) continue;
    o.into.push({ uniquename: name, op: "extra-not-removed" });
  }
}

/** `null`, `""` and an absent column all mean the same thing to Dataverse. */
const normalise = (v) => (v === null || v === undefined || v === "" ? null : v);

main().catch(fatal("apply-customapis.mjs"));
