/**
 * dataverse.mjs — the one Web API client, argument parser and matrix reader that every
 * script under `solution/` and `scripts/gsec.mjs` shares. Node 22, ESM, standard library
 * only. NOTHING here touches the network at import time, so `node --check` and `--help`
 * work on a machine with no environment and no token.
 *
 * WHY A SHARED FILE. Three scripts write to Dataverse and one writes to it deliberately
 * expecting to be refused. If each carried its own copy of "how do I spell a privilege
 * name" or "which depth mask is Local", the four copies would drift and the drift would
 * be invisible until an operator applied the wrong depth to production. There is one
 * copy, and it is checked against `src/security/index.ts` by eye at review time — see
 * `privilegeName()` below, which is a transcription of the function of the same name.
 *
 * ENVIRONMENT VARIABLES (documented once, here; every script repeats them in its --help)
 *   VSB_DATAVERSE_URL     https://<org>.crm<n>.dynamics.com  — no trailing path
 *   VSB_DATAVERSE_TOKEN   a bearer access token for that environment, aud = the URL above
 *   VSB_DATAVERSE_API     optional, default "v9.2"
 *
 * HOW TO GET A TOKEN. Deliberately not implemented here: an interactive login inside a
 * deployment script is a way to run the wrong thing against the wrong tenant.
 *
 *   pac auth create --environment https://<org>.crm4.dynamics.com
 *   pac auth list                                  # confirm the right profile is *
 *   # Power Platform CLI does not print the raw token; use Azure CLI for that:
 *   az login --tenant <tenant-id>
 *   export VSB_DATAVERSE_URL=https://<org>.crm4.dynamics.com
 *   export VSB_DATAVERSE_TOKEN=$(az account get-access-token \
 *       --resource "$VSB_DATAVERSE_URL" --query accessToken -o tsv)
 *
 * The token carries the identity. Everything these scripts do, they do AS THAT USER —
 * which is the whole reason `scripts/gsec.mjs` is credible: it uses a second, deliberately
 * unprivileged token and shows Dataverse refusing it.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const MATRIX_PATH = resolve(REPO_ROOT, "src/security/matrix.json");

/* ═══════════════════════════════════════════════════════════════════ the matrix ════ */

/**
 * `src/security/matrix.json`, read from disk. The SINGLE SOURCE OF TRUTH; never copied
 * into this folder, never re-keyed, never defaulted. If it will not parse, we stop —
 * a security script that guesses is worse than one that refuses.
 */
export function loadMatrix(path = MATRIX_PATH) {
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch (e) {
    throw new Error(
      `cannot read the security matrix at ${path}: ${e.message}\n`
      + `  These scripts are meant to run from inside the code-app repository, because the\n`
      + `  matrix is the contract between the client and the server. Run them from there.`,
      { cause: e },
    );
  }
  const m = JSON.parse(raw);
  for (const k of ["depths", "privileges", "roles", "tables", "grants", "columnSecurityProfiles"]) {
    if (!m[k]) throw new Error(`the security matrix is missing its "${k}" section`);
  }
  return m;
}

/** The eight privileges, in the platform's order. Mirrors `PRIVILEGES` in `src/security`. */
export const PRIVILEGES = [
  "create", "read", "write", "delete", "append", "appendTo", "assign", "share",
];

/**
 * `PrivilegeDepthMask`, transcribed from `DEPTH_MASK` in `src/security/index.ts`.
 * These are a BIT MASK: parentChildBusinessUnit is 4 and organization is 8, not 3 and 4.
 */
export const DEPTH_MASK = {
  none: 0, user: 1, businessUnit: 2, parentChildBusinessUnit: 4, organization: 8,
};

/**
 * The same five depths as the SDK's `PrivilegeDepth` enum names.
 *
 * Both spellings are needed. `privilegedepthmask` on a `roleprivileges` row is the NUMBER;
 * the `AddPrivilegesRole` message that creates that row takes the NAME. Printing both in
 * the plan is what lets a reviewer check one against the other.
 */
export const DEPTH_SDK_NAME = {
  user: "Basic", businessUnit: "Local", parentChildBusinessUnit: "Deep",
  organization: "Global",
};

/** Which `privilege` metadata flag has to be true for a depth to be grantable at all. */
export const DEPTH_CAPABILITY_COLUMN = {
  user: "canbebasic", businessUnit: "canbelocal",
  parentChildBusinessUnit: "canbedeep", organization: "canbeglobal",
};

/**
 * The platform's privilege name, e.g. `prvCreatevsb_project`, `prvAppendTovsb_project`.
 *
 * TRANSCRIBED from `privilegeName()` in `src/security/index.ts`. The two must agree
 * exactly: the app matches these strings when it reads the caller's effective privileges
 * back out of Dataverse, and this file is what put them there. `appendTo` is the only
 * privilege whose verb is not a simple capitalisation, and the casing matters.
 */
export function privilegeName(tables, tableKey, priv) {
  const t = tables[tableKey];
  if (!t) throw new Error(`no table "${tableKey}" in the matrix`);
  const verb = priv === "appendTo" ? "AppendTo" : priv[0].toUpperCase() + priv.slice(1);
  return `prv${verb}${t.logicalName}`;
}

/** The grant one role holds on one table: per-table override, else the family default. */
export function grantFor(matrix, roleKey, tableKey) {
  const g = matrix.grants[roleKey];
  if (!g) return {};
  if (g[tableKey]) return g[tableKey];
  return (matrix.tables[tableKey].isMasterData ? g._masterData : g._projectData) ?? {};
}

/** Absent means none. A grant not written in the matrix is denied. */
export function depthFor(matrix, roleKey, tableKey, priv) {
  return grantFor(matrix, roleKey, tableKey)[priv] ?? "none";
}

/**
 * The tables maintained through the six admin screens. **This is the G-SEC surface.**
 *
 * Selected on `kind === "masterData"`, NOT on `isMasterData`. The two are different sets and
 * the difference matters here: `isMasterData` is true for reference lists, Dataverse system
 * tables and Fabric mirrors as well, because it selects which grant default applies. Reading
 * it gave 47 tables, so G-SEC spent 34 of its 47 probes attempting a write to things like
 * `systemusers` — proving nothing about the admin screens, which is the only thing the gate
 * exists to prove. `src/security/index.ts` makes the same distinction with the same names.
 */
export const masterDataTableKeys = (matrix) =>
  Object.keys(matrix.tables).filter((k) => matrix.tables[k].kind === "masterData");

/** Everything that is not one project's own rows. Not the G-SEC surface; see above. */
export const nonProjectDataTableKeys = (matrix) =>
  Object.keys(matrix.tables).filter((k) => matrix.tables[k].isMasterData === true);

/* ══════════════════════════════════════════════════════════════════ arguments ════ */

/**
 * A deliberately small flag parser: `--flag`, `--key value`, `--key=value`, `-h`.
 * Unknown flags are an ERROR, not a shrug — a misspelt `--aply` must never dry-run
 * silently and be read as "nothing to do".
 */
export function parseArgs(argv, spec) {
  const out = { _: [] };
  for (const [k, v] of Object.entries(spec)) out[k] = v.default ?? (v.type === "boolean" ? false : null);
  const alias = { h: "help" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("-")) { out._.push(a); continue; }
    let name = a.replace(/^--?/, "");
    let inline = null;
    const eq = name.indexOf("=");
    if (eq !== -1) { inline = name.slice(eq + 1); name = name.slice(0, eq); }
    name = alias[name] ?? name;
    const s = spec[name];
    if (!s) {
      throw usage(`unknown option "${a}". Run with --help for the accepted options.`);
    }
    if (s.type === "boolean") {
      if (inline !== null && !/^(true|false)$/.test(inline)) {
        throw usage(`--${name} is a flag and takes no value (got "${inline}")`);
      }
      out[name] = inline === null ? true : inline === "true";
    } else {
      const value = inline !== null ? inline : argv[++i];
      if (value === undefined) throw usage(`--${name} needs a value`);
      out[name] = value;
    }
  }
  return out;
}

/* ═══════════════════════════════════════════════════════════════ environment ════ */

/**
 * Resolve the environment URL and token.
 *
 * Returns `{ ok, url, token, apiVersion, missing }` and never throws, so a caller can
 * decide whether an absent environment is a failure (`apply-*`) or the expected, loudly
 * announced skip (`gsec`). `missing` names the variables, because "authentication failed"
 * is a useless message when the real problem is an unset shell variable.
 */
export function resolveEnv(env = process.env, opts = {}) {
  const urlVar = opts.urlVar ?? "VSB_DATAVERSE_URL";
  const tokenVar = opts.tokenVar ?? "VSB_DATAVERSE_TOKEN";
  const missing = [];
  let url = (env[urlVar] ?? "").trim();
  const token = (env[tokenVar] ?? "").trim();
  if (!url) missing.push(urlVar);
  if (!token) missing.push(tokenVar);
  if (url) {
    url = url.replace(/\/+$/, "");
    if (!/^https:\/\/[^/]+$/.test(url)) {
      return {
        ok: false, url, token, missing,
        error: `${urlVar} must be just the origin, e.g. https://org.crm4.dynamics.com `
          + `(got "${url}")`,
      };
    }
  }
  return {
    ok: missing.length === 0,
    url, token, missing,
    apiVersion: (env.VSB_DATAVERSE_API ?? "v9.2").trim(),
  };
}

/** The message every script prints when the environment is absent. One wording, once. */
export function missingEnvMessage(missing, extra = "") {
  return [
    `No Dataverse environment is configured. Missing: ${missing.join(", ")}.`,
    ``,
    `  export VSB_DATAVERSE_URL=https://<org>.crm4.dynamics.com`,
    `  export VSB_DATAVERSE_TOKEN=$(az account get-access-token \\`,
    `      --resource "$VSB_DATAVERSE_URL" --query accessToken -o tsv)`,
    ``,
    `Use \`pac auth create --environment <url>\` to confirm which environment you mean;`,
    `\`az account get-access-token\` is what prints a raw bearer token. These scripts do`,
    `not log in for you, on purpose.`,
    extra,
  ].filter((l) => l !== null).join("\n");
}

/* ══════════════════════════════════════════════════════════════════ the client ════ */

const RETRYABLE = new Set([429, 502, 503, 504]);

/**
 * A thin Web API client. It does NOT throw on an HTTP error status — every caller here
 * needs to branch on the status itself, and `gsec.mjs` exists precisely to tell a 403
 * apart from a 404. `res.json` is parsed when the body is JSON, `res.text` always.
 */
export function makeClient({ url, token, apiVersion = "v9.2", fetchImpl = globalThis.fetch }) {
  const base = `${url}/api/data/${apiVersion}`;
  const baseHeaders = {
    "Accept": "application/json",
    "OData-MaxVersion": "4.0",
    "OData-Version": "4.0",
    "If-None-Match": "null",
    "Authorization": `Bearer ${token}`,
  };

  async function request(method, path, body, extraHeaders = {}) {
    const target = path.startsWith("http") ? path : `${base}/${path.replace(/^\//, "")}`;
    const headers = { ...baseHeaders, ...extraHeaders };
    if (body !== undefined && body !== null) headers["Content-Type"] = "application/json; charset=utf-8";
    let attempt = 0;
    for (;;) {
      let raw;
      try {
        raw = await fetchImpl(target, {
          method, headers,
          body: body === undefined || body === null ? undefined : JSON.stringify(body),
        });
      } catch (e) {
        // A transport failure is NOT a refusal and must never be reported as one.
        return { ok: false, status: 0, transportError: String(e?.message ?? e), text: "", json: null, target, method };
      }
      const text = await raw.text();
      let json = null;
      if (text) { try { json = JSON.parse(text); } catch { /* not JSON; keep the text */ } }
      if (RETRYABLE.has(raw.status) && attempt < 3) {
        const wait = Number(raw.headers.get("Retry-After")) || (2 ** attempt);
        await new Promise((r) => setTimeout(r, Math.min(wait, 20) * 1000));
        attempt++;
        continue;
      }
      return {
        ok: raw.ok, status: raw.status, text, json, target, method,
        entityId: entityIdFrom(raw.headers.get("OData-EntityId")),
        error: json?.error ?? null,
      };
    }
  }

  return {
    base,
    get: (p, h) => request("GET", p, undefined, h),
    post: (p, b, h) => request("POST", p, b ?? {}, h),
    patch: (p, b, h) => request("PATCH", p, b, h),
    del: (p, h) => request("DELETE", p, undefined, h),
    request,
    /** Follow `@odata.nextLink` and return every row. */
    async all(p, h) {
      const rows = [];
      let next = p;
      for (let guard = 0; next && guard < 200; guard++) {
        const res = await request("GET", next, undefined, h);
        if (!res.ok) return { ok: false, res, rows };
        rows.push(...(res.json?.value ?? []));
        next = res.json?.["@odata.nextLink"] ?? null;
      }
      return { ok: true, rows };
    },
  };
}

const entityIdFrom = (header) => {
  if (!header) return null;
  const m = /\(([0-9a-fA-F-]{36})\)\s*$/.exec(header);
  return m ? m[1] : null;
};

/** The human-readable half of a Dataverse fault, for a one-line report. */
export const faultMessage = (res) =>
  res.transportError
    ? `transport: ${res.transportError}`
    : (res.error?.message ?? res.text?.slice(0, 300) ?? `HTTP ${res.status}`);

/** `$filter=name eq 'a' or name eq 'b'`, chunked so the URL cannot grow unbounded. */
export function orFilterChunks(column, values, perChunk = 40) {
  const out = [];
  for (let i = 0; i < values.length; i += perChunk) {
    out.push(values.slice(i, i + perChunk).map((v) => `${column} eq '${v}'`).join(" or "));
  }
  return out;
}

/* ══════════════════════════════════════════════════════════════════════ output ════ */

export const symbol = { add: "+", same: "=", change: "~", drop: "-", warn: "!", stop: "x" };

export function printHelpAndExit(text) {
  process.stdout.write(text.endsWith("\n") ? text : `${text}\n`);
  process.exit(0);
}

/**
 * A bad command line is the operator's mistake, not a crash. Marked so the top-level
 * handler prints one line instead of a stack trace — a stack trace for a misspelt flag
 * teaches the reader to ignore stack traces.
 */
export function usage(message) {
  const e = new Error(message);
  e.isUsage = true;
  return e;
}

/** The one top-level handler every script uses. Exit 2 = "the script itself broke". */
export function fatal(scriptName) {
  return (e) => {
    if (e?.isUsage) die(`${scriptName}: ${e.message}`, 2);
    die(`${scriptName} failed: ${e?.stack ?? e}`, 2);
  };
}

/** Exit 2 is reserved, in every script here, for "the script itself broke". */
export function die(message, code = 2) {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}
