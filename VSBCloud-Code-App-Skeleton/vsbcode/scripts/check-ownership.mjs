#!/usr/bin/env node
/**
 * check-ownership.mjs — the G-OWN gate. `node scripts/check-ownership.mjs`, no network.
 * Exit 0 = clean, 1 = violations, 2 = the gate itself broke.
 *
 * THE RULE IT ENFORCES
 *   `src/security/matrix.json` marks 38 tables `requiresOwningBusinessUnit`. Every create
 *   on one of those tables must write the owning-business-unit column in its payload:
 *
 *       "owningbusinessunit@odata.bind": `/businessunits(${project.owningBusinessUnitId})`
 *
 *   WHY IT MATTERS, AND WHY IT IS A GATE AND NOT A CODE REVIEW. Omitting it does not
 *   fail. Dataverse creates the row and derives its owning BU from the CALLER's business
 *   unit, so on the developer's own tenant — where the developer is usually in the root
 *   BU, or in the same BU as the data — everything looks correct. The row only disappears
 *   later, for somebody else: `projectDataOwnCountry` reads project data at
 *   `businessUnit` depth, so a row created by a German user against a French project
 *   lands in the German BU and the French team simply never sees it. Nothing throws,
 *   nothing is logged, and the grid is not empty — it is short. That is the worst shape a
 *   defect can have, and it is invisible to every test that runs as one user.
 *
 *   The write form is `owningbusinessunit` (the lookup's navigation property, bound with
 *   `@odata.bind`). The READ form is `_owningbusinessunit_value`, and putting the read
 *   form in a create payload is its own violation: Dataverse rejects the unknown property
 *   or ignores it depending on the path, and the payload reads as if the rule were kept.
 *   `src/features/pm/planning/rules.ts` carries both — `PLANNING_COL.owningBusinessUnit`
 *   is the read form, `PLANNING_LOOKUP.owningBusinessUnit` the write form — and
 *   `UT-PLAN-001` asserts the seed payload carries the write form. That test is the
 *   pattern this gate generalises.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────
 * WHAT IT CHECKS  (be precise about this: a static check that overclaims gets muted)
 *
 *   A CREATE SITE is one of three syntactic shapes in a non-test file under
 *   `src/features/**`:
 *     (a) an object literal `{ op: "create", entitySet: <E>, data: <D> }` — a `WriteOp`
 *         in a plan handed to `dataClient.batch`;
 *     (b) an object literal `{ op: "create", data: <D> }` with no `entitySet` of its own,
 *         belonging to a `<repo>.saveMany(...)` call — `saveMany` pins the entity set.
 *         Either lexically inside the call, or one hop through the array variable the call
 *         is handed (`const ops = […]; await repo.saveMany(ops);`), where the variable must
 *         be the WHOLE argument so the literal cannot be attributed to the wrong table;
 *     (c) a call `<repo>.create(<D>)` or `dataClient.create(<E>, <D>)`.
 *
 *   The site is IN SCOPE only when its target table can be resolved to a
 *   `requiresOwningBusinessUnit` entity set — from a string literal, from an `ES.*` /
 *   `ES_ADMIN.*` / … member of `src/data/entities.ts`, from a feature-local
 *   `*_ENTITY_SET` alias, or from the repository's own `makeRepository(ES.x, …)`
 *   declaration in `src/data/repos.ts`.
 *
 *   The payload `<D>` is then resolved to a region of source text: the object literal
 *   itself; a local `const` whose declaration is in the same file (plus any later
 *   `payload[…] = …` assignments to it); or a same-file or same-feature builder function
 *   called as `buildXPayload(…)`, in which case the region is that function's body. A
 *   payload that cannot be resolved to one of those is NOT reported — it is counted as
 *   `unresolved` and listed in the summary, because a guess here is a false positive and
 *   false positives are how a gate gets ignored.
 *
 *   A resolved region satisfies the rule when it contains a key that resolves to
 *   `owningbusinessunit`: the literal string, or a computed key built from a constant
 *   such as `` [`${PLANNING_LOOKUP.owningBusinessUnit}@odata.bind`] ``, whose value the
 *   gate looks up in the `as const` maps of `src/data/entities.ts` and of the feature
 *   itself. Two findings come out of it:
 *     · `missing-owning-bu`  — in-scope, payload resolved, no such key.
 *     · `read-form-key`      — the payload writes `_owningbusinessunit_value`, which is
 *                              the read form and is not a write at all.
 *
 * WHAT IT DOES **NOT** CATCH — the blind spots, stated so nobody mistakes a pass for a proof
 *   · Payloads assembled somewhere the gate cannot follow: a mapper passed as a callback
 *     (`rows.map(toPayload)` where `toPayload` is imported), a payload spread from a
 *     variable computed in another module (`{ ...cost.fields }`, where `cost` came out of a
 *     rules-layer planner), an `Object.assign` chain, a field object built up across several
 *     functions. Each of those is counted `unresolved` and printed.
 *   · A `{ op: "create" }` literal whose plan crosses a module boundary before it reaches
 *     `saveMany` — `planning/rules.ts` returns plan entries that `planning/hooks.ts` hands
 *     to a repository. The gate cannot see which repository, so it does not guess.
 *   · Creates outside `src/features/**` — `src/data/repos.ts`, the mock backend, flows.
 *   · A create whose target table is chosen at runtime (`const repo = isWind ? a : b;
 *     repo.create(…)`) or whose `entitySet` is a conditional expression.
 *   · CONDITIONAL writes. `buildPlanningSeedPayload` sets the bind only
 *     `if (project.owningBusinessUnitId)`. The gate counts that as present, because it
 *     cannot know whether the guard can be false — the key IS in the region. So the gate
 *     proves the column is written on SOME path, never on every path.
 *   · Whether the bound business unit is the RIGHT one. `/businessunits(${x})` with the
 *     creating user's own BU passes this gate and still puts the row in the wrong place.
 *     Only a test with a fixture project in another BU catches that.
 *   · Updates and upserts. An update that changes the project's country without moving
 *     the child rows is the same class of defect and is out of scope here.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────
 * THE BASELINE — reference/ownership-baseline.json
 *   Same shape and same conventions as `reference/label-baseline.json`: a content-hashed
 *   key with NO line number (it survives reformatting and moved code, but not a changed
 *   payload — a changed payload is a different violation), a mandatory `owner` and a
 *   mandatory `reason`, and a STALE-ENTRY CHECK: an entry that matches nothing any more
 *   fails the run, so a fixed violation cannot leave its slot open for a different one to
 *   slip in under.
 *
 *   owners
 *     security-owner   A real omission. A BU-scoped role will lose the row. Someone owes
 *                      the fix; the reason must say what blocks it.
 *     platform-default The create deliberately relies on Dataverse deriving the owning BU
 *                      from the caller, and that has been reasoned about for THIS table —
 *                      the reason must say why the caller's BU is always the right one.
 *     refactor         The column IS written, but not where a static check can see it.
 *                      The fix is structural (move the builder next to the create), not a
 *                      security change.
 *
 *   --strict            count baselined violations as failures too — the Phase exit gate.
 *   --update-baseline   rewrite the baseline from the current violations, preserving the
 *                       `owner` and `reason` of every entry that survives. Run it when a
 *                       violation is genuinely FIXED, or when a new one has been agreed
 *                       with its owner. NEVER to turn a red build green.
 */
import { readdirSync, readFileSync, statSync, existsSync, writeFileSync } from "node:fs";
import { join, relative, resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FEATURES = join(REPO_ROOT, "src/features");
const ENTITIES = join(REPO_ROOT, "src/data/entities.ts");
const REPOS = join(REPO_ROOT, "src/data/repos.ts");
const MATRIX = join(REPO_ROOT, "src/security/matrix.json");
const BASELINE = join(REPO_ROOT, "reference/ownership-baseline.json");

/** The write form of the lookup, and the read form that is NOT a write. */
const WRITE_COLUMN = "owningbusinessunit";
const READ_COLUMN = "_owningbusinessunit_value";

const OWNER_BY_CHECK = {
  "missing-owning-bu": "security-owner",
  "read-form-key": "security-owner",
};
const OWNERS = ["security-owner", "platform-default", "refactor"];

/* ═════════════════════════════════════════════════════════════════════ helpers ══ */

function walk(dir, out = []) {
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

/**
 * The source with every string, template literal and comment replaced by spaces of the
 * same length. Bracket matching runs on this so a `"}"` inside a string cannot close a
 * block; offsets stay identical to the real source, so a match in the mask indexes it.
 */
function mask(src) {
  let out = "";
  let i = 0;
  const n = src.length;
  const blank = (s) => s.replace(/[^\n]/g, " ");
  while (i < n) {
    const c = src[i];
    if (c === "/" && src[i + 1] === "/") {
      const j = src.indexOf("\n", i);
      const e = j < 0 ? n : j;
      out += blank(src.slice(i, e));
      i = e;
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      const j = src.indexOf("*/", i + 2);
      const e = j < 0 ? n : j + 2;
      out += blank(src.slice(i, e));
      i = e;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < n) {
        if (src[j] === "\\") { j += 2; continue; }
        if (src[j] === c) break;
        j += 1;
      }
      const e = Math.min(j + 1, n);
      out += blank(src.slice(i, e));
      i = e;
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

/** Index of the bracket closing the one at `i`, on the masked source. -1 if unbalanced. */
function closingAt(m, i) {
  const open = m[i];
  const close = { "{": "}", "(": ")", "[": "]" }[open];
  if (!close) return -1;
  let depth = 0;
  for (let j = i; j < m.length; j += 1) {
    if (m[j] === open) depth += 1;
    else if (m[j] === close) {
      depth -= 1;
      if (depth === 0) return j;
    }
  }
  return -1;
}

/** Index of the `{` that lexically encloses `i`, on the masked source. -1 if none. */
function enclosingBrace(m, i) {
  let depth = 0;
  for (let j = i; j >= 0; j -= 1) {
    if (m[j] === "}") depth += 1;
    else if (m[j] === "{") {
      if (depth === 0) return j;
      depth -= 1;
    }
  }
  return -1;
}

const lineOf = (src, pos) => src.slice(0, pos).split("\n").length;

/* ══════════════════════════════════════════════════════════════ constant maps ══ */

/**
 * `X.key -> "value"` for every exported `as const` object of string (or resolvable
 * member) values, plus `X -> "value"` for the alias form `export const X = ES.y;`.
 *
 * Two consumers: resolving an `entitySet:` expression to an entity set, and resolving a
 * computed payload key such as `[PERMIT_LOOKUP.owningBusinessUnit]` to a column name.
 * Names collide across features (`OPEX_ENTITY` exists twice); a colliding key that
 * resolves to DIFFERENT values is dropped rather than guessed, and a site that needed it
 * then counts as unresolved.
 */
function collectConstants(files) {
  const map = new Map();
  const conflicted = new Set();
  const put = (k, v) => {
    if (v === undefined) return;
    if (map.has(k) && map.get(k) !== v) { conflicted.add(k); return; }
    if (conflicted.has(k)) return;
    map.set(k, v);
  };

  // Two passes: object members first (they define the values aliases point at), then
  // aliases, then object members again so `{ cost: SOME_ALIAS }` resolves too.
  for (const pass of [0, 1, 2]) {
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      const m = mask(src);

      if (pass !== 1) {
        const re = /(?:export\s+)?const ([A-Za-z_$][\w$]*)\s*(?::[^=\n]*)?=\s*\{/g;
        let mm;
        while ((mm = re.exec(m))) {
          const name = mm[1];
          const open = mm.index + mm[0].length - 1;
          const close = closingAt(m, open);
          if (close < 0) continue;
          const body = src.slice(open + 1, close);
          const bodyMask = mask(body);
          const lines = body.split("\n");
          const maskLines = bodyMask.split("\n");
          let depth = 0;
          for (let li = 0; li < lines.length; li += 1) {
            const atTop = depth === 0;
            for (const ch of maskLines[li]) {
              if ("{[(".includes(ch)) depth += 1;
              else if ("}])".includes(ch)) depth -= 1;
            }
            if (!atTop) continue;
            const kv =
              /^\s*(?:"([^"]+)"|'([^']+)'|([A-Za-z_$][\w$]*))\s*:\s*(?:"([^"]*)"|'([^']*)'|([A-Za-z_$][\w$]*\.[A-Za-z_$][\w$]*))\s*,?\s*(?:\/\/.*)?$/.exec(
                lines[li],
              );
            if (!kv) continue;
            const key = kv[1] ?? kv[2] ?? kv[3];
            const value = kv[4] ?? kv[5] ?? map.get(kv[6]);
            put(`${name}.${key}`, value);
          }
          re.lastIndex = close;
        }
      }

      if (pass !== 0) {
        const re =
          /(?:export\s+)?const ([A-Za-z_$][\w$]*)\s*(?::[^=\n]*)?=\s*(?:"([^"]*)"|'([^']*)'|([A-Za-z_$][\w$]*\.[A-Za-z_$][\w$]*))\s*;/g;
        let mm;
        while ((mm = re.exec(src))) {
          put(mm[1], mm[2] ?? mm[3] ?? map.get(mm[4]));
        }
      }
    }
  }
  for (const k of conflicted) map.delete(k);
  return map;
}

/** `repoName -> entitySet`, from `makeRepository<…>(ES.x, …)` in `src/data/repos.ts`. */
function collectRepos(constants) {
  const src = readFileSync(REPOS, "utf8");
  const out = new Map();
  const re =
    /export const ([A-Za-z_$][\w$]*)\s*=\s*makeRepository<[\s\S]*?>\(\s*(?:"([^"]*)"|([A-Za-z_$][\w$]*\.[A-Za-z_$][\w$]*))/g;
  let mm;
  while ((mm = re.exec(src))) {
    const v = mm[2] ?? constants.get(mm[3]);
    if (v) out.set(mm[1], v);
  }
  return out;
}

/** An expression that should name an entity set: a literal, `ES.x`, or a local alias. */
function resolveEntitySet(expr, constants) {
  const e = expr.trim().replace(/\s+as\s+const$/, "");
  const lit = /^(["'])([^"']*)\1$/.exec(e);
  if (lit) return lit[2];
  if (/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?$/.test(e)) return constants.get(e);
  return undefined;
}

/* ══════════════════════════════════════════════════════════════ the create sites ══ */

/** An object literal's top-level properties, as `{ key, value }` (value null = shorthand). */
function topLevelProperties(literal) {
  const inner = literal.slice(1, -1);
  const m = mask(inner);
  const chunks = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < inner.length; i += 1) {
    const ch = m[i];
    if ("{[(".includes(ch)) depth += 1;
    else if ("}])".includes(ch)) depth -= 1;
    else if (ch === "," && depth === 0) {
      chunks.push([start, i]);
      start = i + 1;
    }
  }
  chunks.push([start, inner.length]);

  const props = [];
  for (const [a, b] of chunks) {
    const text = inner.slice(a, b);
    if (!text.trim()) continue;
    // The property's own colon is the first `:` at depth 0 within the chunk.
    let d = 0;
    let colon = -1;
    for (let i = 0; i < text.length; i += 1) {
      const ch = mask(text)[i];
      if ("{[(".includes(ch)) d += 1;
      else if ("}])".includes(ch)) d -= 1;
      else if (ch === ":" && d === 0) { colon = i; break; }
    }
    if (colon < 0) {
      const sh = /^\s*(?:\.\.\.)?([A-Za-z_$][\w$]*)\s*$/.exec(text);
      if (sh) props.push({ key: sh[1], value: null });
      continue;
    }
    const rawKey = text.slice(0, colon).trim();
    const km = /^(?:"([^"]+)"|'([^']+)'|\[([^\]]+)\]|([A-Za-z_$][\w$]*))$/.exec(rawKey);
    props.push({
      key: km ? (km[1] ?? km[2] ?? km[3] ?? km[4]) : rawKey,
      value: text.slice(colon + 1),
    });
  }
  return props;
}

/**
 * The value expression of a top-level `key:` inside an object-literal text, or
 * `{ kind: "shorthand" }` when the key is written in shorthand (`{ op: "create", data }`).
 */
function propertyValue(literal, key) {
  for (const p of topLevelProperties(literal)) {
    if (p.key !== key) continue;
    return p.value === null ? { kind: "shorthand", name: key } : { kind: "expr", text: p.value };
  }
  return undefined;
}

/** Split a call's argument list at top level. */
function splitArgs(argText) {
  const m = mask(argText);
  const out = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < argText.length; i += 1) {
    const ch = m[i];
    if ("{[(".includes(ch)) depth += 1;
    else if ("}])".includes(ch)) depth -= 1;
    else if (ch === "," && depth === 0) {
      out.push(argText.slice(start, i));
      start = i + 1;
    }
  }
  out.push(argText.slice(start));
  return out.map((s) => s.trim()).filter((s) => s.length);
}

/**
 * The receiver of the `<x>.saveMany(...)` that this `{ op: "create" }` literal belongs to.
 *
 * Two shapes, because both are used here. Lexically inside the call — `repo.saveMany(
 * rows.map(r => ({ op: "create", … })))` — or one hop through the array variable the call
 * is given: `const ops = […]; await repo.saveMany(ops);`. The second requires the variable
 * to be the WHOLE argument, so `saveMany(ops)` resolves and `saveMany(a.concat(b))` does
 * not; anything looser would attribute a literal to the wrong table.
 */
function saveManyReceiver(m, src, pos) {
  let best = null;
  for (const call of m.matchAll(/([A-Za-z_$][\w$]*)\.saveMany\(/g)) {
    const open = call.index + call[0].length - 1;
    const close = closingAt(m, open);
    if (close < 0 || pos < open || pos > close) continue;
    if (!best || open > best.open) best = { open, recv: call[1] };
  }
  if (best) return best.recv;

  // The enclosing `const <name> = …;` statement, then the saveMany that is handed it.
  let enclosing = null;
  for (const decl of m.matchAll(/(?:const|let)\s+([A-Za-z_$][\w$]*)\b[^=;\n]*=/g)) {
    if (decl.index > pos) break;
    enclosing = decl;
  }
  if (!enclosing) return undefined;
  const name = enclosing[1];
  for (const call of src.matchAll(new RegExp(`([A-Za-z_$][\\w$]*)\\.saveMany\\(\\s*${name}\\s*\\)`, "g"))) {
    return call[1];
  }
  return undefined;
}

function findCreateSites(file, src, constants, repos) {
  const m = mask(src);
  const rel = relative(REPO_ROOT, file);
  const sites = [];

  /* (a)/(b) — a `{ op: "create" … }` object literal used as a value, not a type. */
  const opRe = /\bop:\s*(["'])create\1(?:\s+as\s+const)?\s*[,}]/g;
  let mm;
  while ((mm = opRe.exec(src))) {
    const open = enclosingBrace(m, mm.index);
    if (open < 0) continue;
    const close = closingAt(m, open);
    if (close < 0) continue;
    const literal = src.slice(open, close + 1);

    let target;
    const es = propertyValue(literal, "entitySet");
    if (es?.kind === "expr") {
      target = { how: "`entitySet:`", entitySet: resolveEntitySet(es.text, constants) };
    } else if (es?.kind === "shorthand") {
      // `{ op: "create", entitySet, data }` — resolve the local of that name.
      const decl = /(?:const|let)\s+entitySet\s*(?::[^=\n]*)?=\s*([^;\n]+)/.exec(src);
      target = {
        how: "`entitySet` shorthand → local",
        entitySet: decl ? resolveEntitySet(decl[1], constants) : undefined,
      };
    } else {
      // No `entitySet` at all — `saveMany` pins it. Find the innermost enclosing
      // `<repo>.saveMany(...)` whose argument range contains this literal.
      const recv = saveManyReceiver(m, src, open);
      target = {
        how: `\`${recv ?? "?"}.saveMany\` receiver`,
        entitySet: recv ? repos.get(recv) : undefined,
        recv,
      };
    }

    sites.push({
      file: rel,
      line: lineOf(src, mm.index),
      pos: mm.index,
      shape: "writeOp",
      literal,
      payloadExpr: propertyValue(literal, "data"),
      ...target,
    });
  }

  /* (c) — `<repo>.create(<D>)` and `dataClient.create(<E>, <D>)`. */
  const createRe = /\b([A-Za-z_$][\w$]*)\.create\(/g;
  while ((mm = createRe.exec(m))) {
    const open = mm.index + mm[0].length - 1;
    const close = closingAt(m, open);
    if (close < 0) continue;
    const args = splitArgs(src.slice(open + 1, close));
    const recv = mm[1];
    const isDataClient = recv === "dataClient";
    const entitySet = isDataClient
      ? resolveEntitySet(args[0] ?? "", constants)
      : repos.get(recv);
    sites.push({
      file: rel,
      line: lineOf(src, mm.index),
      pos: mm.index,
      shape: isDataClient ? "dataClient.create" : `${recv}.create`,
      how: isDataClient ? "first argument" : "repository declaration",
      recv,
      entitySet,
      payloadExpr: { kind: "expr", text: (isDataClient ? args[1] : args[0]) ?? "" },
    });
  }

  return sites;
}

/* ═══════════════════════════════════════════════════════════ payload resolution ══ */

/**
 * Resolve a payload expression to the region of source text that builds it.
 * Returns `{ text, how }`, or `null` when the gate cannot follow it — see the blind-spot
 * list in the header. `null` is deliberately not a violation.
 */
function resolvePayload(expr, file, src, siblings, sitePos = 0, seen = new Set(), depth = 0) {
  if (!expr || depth > 3) return null;
  // `{ op: "create", data }` — the shorthand names a local, so treat it as that identifier.
  const raw = expr.kind === "shorthand" ? expr.name : expr.text;
  if (typeof raw !== "string") return null;
  const e = raw.trim().replace(/\s+as\s+[A-Za-z_$][\w$<>,.\s[\]]*$/, "").trim();
  if (!e || seen.has(e)) return null;
  seen.add(e);
  const recur = (text) =>
    resolvePayload({ kind: "expr", text }, file, src, siblings, sitePos, seen, depth + 1);

  if (e.startsWith("{")) {
    const parts = [e];
    const how = ["object literal"];
    // Follow a spread of something we can also resolve — `{ ...bind(…), x: 1 }`.
    for (const sp of e.matchAll(/\.\.\.\s*([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*(?:\([^()]*\))?)/g)) {
      const inner = recur(sp[1]);
      if (inner) { parts.push(inner.text); how.push(`spread ${inner.how}`); }
    }
    return { text: parts.join("\n"), how: how.join(" + ") };
  }

  // A bare identifier: its declaration in this file, plus later assignments into it, plus
  // whatever its initialiser resolves to (`const data = buildMemberPayload(…)`).
  if (/^[A-Za-z_$][\w$]*$/.test(e)) {
    const decl = declarationRegion(e, src, sitePos);
    if (!decl) return null;
    const parts = [decl.text];
    const how = [`local \`${e}\``];
    const inner = decl.initialiser ? recur(decl.initialiser) : null;
    if (inner) { parts.push(inner.text); how.push(`from ${inner.how}`); }
    return { text: parts.join("\n"), how: how.join(" ← ") };
  }

  // A builder call: `buildXPayload(...)`, resolved in this file then in the feature dir.
  const call = /^([A-Za-z_$][\w$]*)\s*\(/.exec(e);
  if (call) {
    const body = functionBody(call[1], src) ?? siblingFunctionBody(call[1], siblings);
    if (body) return { text: body.text, how: `builder \`${call[1]}\`${body.where ? ` (${body.where})` : ""}` };
  }

  return null;
}

/**
 * `const x = <expr>;` in this file, plus every `x[...] = …` / `x.y = …` after it, and the
 * initialiser on its own so the caller can follow it one hop further.
 */
function declarationRegion(name, src, sitePos = 0) {
  const m = mask(src);
  const re = new RegExp(`(?:const|let|var)\\s+${name}\\b[^=;\\n]*=`, "g");
  // The NEAREST declaration at or before the create site. A file can declare `data` a
  // dozen times; taking the first one would read a different function's payload.
  const all = [...m.matchAll(re)];
  if (!all.length) return null;
  const before = all.filter((d) => d.index <= sitePos);
  const decl = before.length ? before[before.length - 1] : all[0];
  const valueStart = decl.index + decl[0].length;
  let end = valueStart;
  let depth = 0;
  for (let i = valueStart; i < src.length; i += 1) {
    const ch = m[i];
    if ("{[(".includes(ch)) depth += 1;
    else if ("}])".includes(ch)) depth -= 1;
    else if (ch === ";" && depth === 0) { end = i; break; }
    end = i;
  }
  const parts = [src.slice(decl.index, end + 1)];
  const assign = new RegExp(`^\\s*${name}\\s*(?:\\[[^\\]]*\\]|\\.[A-Za-z_$][\\w$]*)\\s*=[^;]*;`, "gm");
  for (const a of src.matchAll(assign)) parts.push(a[0]);
  return { text: parts.join("\n"), initialiser: src.slice(valueStart, end + 1).replace(/;$/, "").trim() };
}

/** The body text of `function name(...)` / `const name = (...) => {...}` in one source. */
function functionBody(name, src) {
  const m = mask(src);
  const patterns = [
    new RegExp(`function\\s+${name}\\s*(?:<[^>]*>)?\\s*\\(`, "g"),
    new RegExp(`const\\s+${name}\\s*(?::[^=\\n]*)?=\\s*(?:async\\s*)?\\(`, "g"),
  ];
  for (const re of patterns) {
    const hit = re.exec(m);
    if (!hit) continue;
    const paren = m.indexOf("(", hit.index + hit[0].length - 1);
    const parenEnd = closingAt(m, paren);
    if (parenEnd < 0) continue;
    const brace = m.indexOf("{", parenEnd);
    const arrow = m.indexOf("=>", parenEnd);
    if (brace >= 0 && (arrow < 0 || brace < arrow + 6)) {
      const end = closingAt(m, brace);
      if (end > 0) return { text: src.slice(brace, end + 1) };
    }
    if (arrow >= 0) {
      const b = m.indexOf("{", arrow);
      if (b >= 0 && b - arrow <= 3) {
        const end = closingAt(m, b);
        if (end > 0) return { text: src.slice(b, end + 1) };
      }
      // Concise arrow body: to the end of the statement.
      const semi = m.indexOf(";", arrow);
      if (semi > 0) return { text: src.slice(arrow, semi) };
    }
  }
  return null;
}

function siblingFunctionBody(name, siblings) {
  for (const [path, text] of siblings) {
    const body = functionBody(name, text);
    if (body) return { text: body.text, where: basename(path) };
  }
  return null;
}

/* ══════════════════════════════════════════════════════════════════ the verdict ══ */

/**
 * Does this region write the owning-BU column? Looks for the literal write form, and for
 * a computed key built from a constant whose value it resolves.
 */
function owningBuKey(region, constants) {
  if (region.includes(`${WRITE_COLUMN}@odata.bind`)) return { present: true, via: `"${WRITE_COLUMN}@odata.bind"` };
  if (new RegExp(`["'\`]${WRITE_COLUMN}["'\`]\\s*\\]?\\s*:`).test(region)) {
    return { present: true, via: `"${WRITE_COLUMN}"` };
  }

  let readForm = null;
  for (const m of region.matchAll(/([A-Za-z_$][\w$]*)\.(owningBusinessUnit|owningBu)\b/g)) {
    const value = constants.get(`${m[1]}.${m[2]}`);
    if (value === WRITE_COLUMN) return { present: true, via: `${m[1]}.${m[2]}` };
    if (value === READ_COLUMN) readForm = `${m[1]}.${m[2]}`;
  }
  if (new RegExp(`["'\`]${READ_COLUMN}["'\`]\\s*\\]?\\s*:`).test(region)) readForm = `"${READ_COLUMN}"`;

  return { present: false, readForm };
}

/* ═════════════════════════════════════════════════════════════ baseline plumbing ══ */

/**
 * The baseline key: the hash of check + file + entity set + the payload region's shape,
 * with NO line number, so it survives reformatting and moved code but not a changed
 * payload. `occurrence` disambiguates two identical creates in one file.
 */
function violationId(v) {
  const parts = [v.check, v.file, v.entitySet, v.fingerprint, String(v.occurrence ?? 1)];
  return createHash("sha1").update(parts.join(" ")).digest("hex").slice(0, 16);
}

/**
 * What the key hashes instead of a line number: the payload's top-level key names, in
 * order. Reformatting does not change it; adding or removing a field does, which is
 * right — a payload with different fields is a different create.
 */
function fingerprint(region) {
  const keys = new Set();
  const re = /[{,]\s*(?:\[([^\]]+)\]|"([^"]+)"|'([^']+)'|([A-Za-z_$][\w$]*))\s*:/g;
  for (const m of region.matchAll(re)) {
    keys.add((m[1] ?? m[2] ?? m[3] ?? m[4]).replace(/\s+/g, ""));
  }
  // Also an index assignment written after the declaration: `payload["x@odata.bind"] = …`.
  for (const m of region.matchAll(/\[\s*([^\]]+?)\s*\]\s*=/g)) keys.add(m[1].replace(/\s+/g, ""));
  return [...keys].sort().join("|").slice(0, 400);
}

function numberOccurrences(violations) {
  const seen = new Map();
  for (const v of violations.sort((a, b) => (a.line ?? 0) - (b.line ?? 0))) {
    const k = `${v.check} ${v.file} ${v.entitySet} ${v.fingerprint}`;
    const n = (seen.get(k) ?? 0) + 1;
    seen.set(k, n);
    v.occurrence = n;
    v.id = violationId(v);
  }
  return violations;
}

function loadBaseline() {
  if (!existsSync(BASELINE)) return null;
  const raw = JSON.parse(readFileSync(BASELINE, "utf8"));
  const entries = Array.isArray(raw) ? raw : raw.entries;
  if (!Array.isArray(entries)) throw new Error("reference/ownership-baseline.json has no `entries` array");
  for (const e of entries) {
    if (!e.id) throw new Error(`baseline entry without an id: ${JSON.stringify(e).slice(0, 120)}`);
    if (!OWNERS.includes(e.owner)) {
      throw new Error(`baseline entry ${e.id} has owner ${JSON.stringify(e.owner)}; use one of ${OWNERS.join(" / ")}`);
    }
    if (!e.reason || !String(e.reason).trim()) {
      throw new Error(`baseline entry ${e.id} has no reason — every baselined create must say why it is still here`);
    }
  }
  return new Map(entries.map((e) => [e.id, e]));
}

function loadBaselineLoose() {
  const raw = JSON.parse(readFileSync(BASELINE, "utf8"));
  const entries = Array.isArray(raw) ? raw : (raw.entries ?? []);
  return new Map(entries.filter((e) => e.id).map((e) => [e.id, e]));
}

function writeBaseline(violations, previous) {
  const entries = violations
    .slice()
    .sort((a, b) => a.check.localeCompare(b.check) || a.file.localeCompare(b.file) || a.entitySet.localeCompare(b.entitySet) || a.occurrence - b.occurrence)
    .map((v) => {
      const old = previous?.get(v.id);
      return {
        id: v.id,
        check: v.check,
        file: v.file,
        entitySet: v.entitySet,
        table: v.table,
        payload: v.how,
        fingerprint: v.fingerprint,
        occurrence: v.occurrence,
        owner: old?.owner ?? OWNER_BY_CHECK[v.check] ?? "security-owner",
        reason: old?.reason ?? v.draftReason,
      };
    });
  const doc = {
    $schema: "ownership-baseline/1",
    generatedBy: "node scripts/check-ownership.mjs --update-baseline",
    note:
      "The known set for G-OWN: creates on a `requiresOwningBusinessUnit` table whose payload "
      + "does not write the owning-BU column. It is a TO-DO LIST, NOT A PERMISSION — every entry "
      + "is a row that a business-unit-scoped role may never see. The gate fails on anything not "
      + "listed here, and on any entry that no longer matches, so a fixed create cannot leave a "
      + "slot open for a different one. Never run --update-baseline to make a red build green.",
    owners: {
      "security-owner":
        "A real omission: a BU-scoped role will lose the row. The reason must say what blocks the fix.",
      "platform-default":
        "Deliberately relies on Dataverse deriving the owning BU from the caller. The reason must say why the caller's BU is always the right one FOR THIS TABLE.",
      refactor:
        "The column is written, but not where a static check can see it. The fix is structural — move the payload builder next to the create — not a security change.",
    },
    counts: entries.reduce((acc, e) => {
      acc[e.owner] = (acc[e.owner] ?? 0) + 1;
      return acc;
    }, { total: entries.length }),
    entries,
  };
  writeFileSync(BASELINE, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
  return entries;
}

/* ════════════════════════════════════════════════════════════════════════ the gate ══ */

function main() {
  const argv = process.argv.slice(2);
  for (const a of argv) {
    if (!["--strict", "--update-baseline"].includes(a)) {
      throw new Error(`unknown argument ${a} — the gate takes --strict and --update-baseline`);
    }
  }
  const mode = { strict: argv.includes("--strict"), update: argv.includes("--update-baseline") };

  const matrix = JSON.parse(readFileSync(MATRIX, "utf8"));
  const owningBu = new Map();
  for (const [key, t] of Object.entries(matrix.tables)) {
    if (t.requiresOwningBusinessUnit === true) owningBu.set(t.entitySet, key);
  }
  if (owningBu.size === 0) {
    throw new Error("no table in security/matrix.json is marked requiresOwningBusinessUnit — the gate would pass vacuously");
  }

  const featureFiles = walk(FEATURES).filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f));
  const constants = collectConstants([ENTITIES, ...featureFiles]);
  const repos = collectRepos(constants);

  const byDir = new Map();
  for (const f of featureFiles) {
    const d = dirname(f);
    if (!byDir.has(d)) byDir.set(d, []);
    byDir.get(d).push(f);
  }

  const sites = [];
  for (const file of featureFiles) {
    const src = readFileSync(file, "utf8");
    for (const s of findCreateSites(file, src, constants, repos)) sites.push({ ...s, path: file, src });
  }

  const inScope = [];
  const unresolvedTarget = [];
  for (const s of sites) {
    if (s.entitySet && owningBu.has(s.entitySet)) inScope.push(s);
    else if (!s.entitySet) unresolvedTarget.push(s);
  }

  const violations = [];
  const unresolvedPayload = [];
  const satisfied = [];

  for (const s of inScope) {
    const siblings = (byDir.get(dirname(s.path)) ?? [])
      .filter((f) => f !== s.path)
      .map((f) => [f, readFileSync(f, "utf8")]);
    const region = resolvePayload(s.payloadExpr, s.path, s.src, siblings, s.pos ?? 0);
    if (!region) {
      unresolvedPayload.push(s);
      continue;
    }
    const verdict = owningBuKey(region.text, constants);
    const table = owningBu.get(s.entitySet);
    if (verdict.present) {
      satisfied.push({ ...s, via: verdict.via });
      continue;
    }
    const base = {
      file: s.file,
      line: s.line,
      entitySet: s.entitySet,
      table,
      how: region.how,
      fingerprint: fingerprint(region.text),
    };
    if (verdict.readForm) {
      violations.push({
        ...base,
        check: "read-form-key",
        message:
          `${s.file}:${s.line} creates \`${s.entitySet}\` (${table}) with ${verdict.readForm} — that is the `
          + `READ form \`${READ_COLUMN}\`, which is not a write. Bind the lookup: `
          + `\`"${WRITE_COLUMN}@odata.bind": "/businessunits(<id>)"\`.`,
        draftReason:
          `The payload names the read-only \`${READ_COLUMN}\` where the create needs the `
          + `\`${WRITE_COLUMN}@odata.bind\` navigation property. Swap the constant for the `
          + `feature's \`*_LOOKUP.owningBusinessUnit\`.`,
      });
    } else {
      violations.push({
        ...base,
        check: "missing-owning-bu",
        message:
          `${s.file}:${s.line} creates \`${s.entitySet}\` (${table}) and its payload (${region.how}) `
          + `writes no owning business unit. Dataverse will derive it from the CALLER's BU, so a `
          + `BU-scoped role working on another country's project silently never sees the row. `
          + `Add \`"${WRITE_COLUMN}@odata.bind": "/businessunits(<project BU id>)"\`.`,
        draftReason:
          `Create resolved via ${s.how}; payload resolved as ${region.how}. No owning-BU key in the `
          + `payload. Either bind the project's business unit, or record here why the caller's own `
          + `business unit is always correct for this table.`,
      });
    }
  }

  numberOccurrences(violations);

  const baseline = mode.update ? null : loadBaseline();
  const known = baseline ?? new Map();
  const seen = new Set(violations.map((v) => v.id));
  const fresh = violations.filter((v) => !known.has(v.id));
  const baselined = violations.filter((v) => known.has(v.id));
  const stale = [...known.values()].filter((e) => !seen.has(e.id));

  const byOwner = (list) =>
    list.reduce((acc, v) => {
      const owner = known.get(v.id)?.owner ?? OWNER_BY_CHECK[v.check] ?? "security-owner";
      acc[owner] = (acc[owner] ?? 0) + 1;
      return acc;
    }, {});
  const ownerSummary = (counts) =>
    OWNERS.filter((o) => counts[o]).map((o) => `${counts[o]} ${o}`).join(", ");

  const header = () => {
    console.log("G-OWN — owning-business-unit gate");
    console.log(`  tables requiring owning BU   ${owningBu.size} (security/matrix.json)`);
    console.log(`  feature files scanned        ${featureFiles.length}`);
    console.log(`  create sites found           ${sites.length}`);
    console.log(`  ├─ on a requiring table      ${inScope.length}`);
    console.log(`  │  ├─ writes the owning BU   ${satisfied.length}`);
    console.log(`  │  ├─ violations             ${violations.length}`);
    console.log(`  │  └─ payload not resolvable ${unresolvedPayload.length} (not checked — see the header's blind spots)`);
    console.log(`  └─ table not resolvable      ${unresolvedTarget.length} (not checked)`);
    console.log(
      `  baseline                     ${baseline ? `${relative(REPO_ROOT, BASELINE)} — ${known.size} known` : "none"}`,
    );
    console.log("");
    if (unresolvedPayload.length) {
      console.log("  Not checked — the payload could not be followed statically:");
      for (const s of unresolvedPayload) {
        console.log(`    ${s.file}:${s.line} ${s.shape} ${s.entitySet} — payload \`${(s.payloadExpr?.text ?? s.payloadExpr?.kind ?? "?").trim().replace(/\s+/g, " ").slice(0, 60)}\``);
      }
      console.log("");
    }
  };

  if (mode.update) {
    const previous = existsSync(BASELINE) ? loadBaselineLoose() : null;
    const entries = writeBaseline(violations, previous);
    const counts = entries.reduce((acc, e) => {
      acc[e.owner] = (acc[e.owner] ?? 0) + 1;
      return acc;
    }, {});
    header();
    console.log(`WROTE ${relative(REPO_ROOT, BASELINE)} — ${entries.length} entries (${ownerSummary(counts)}).`);
    console.log("");
    console.log("!! WARNING — the baseline is a to-do list, not a permission. Every entry is a row");
    console.log("!! a business-unit-scoped role may never see. Do NOT run --update-baseline to turn");
    console.log("!! a red build green: run it when a create has genuinely been FIXED, or when a new");
    console.log("!! one has been agreed with the owner named in it.");
    process.exit(0);
  }

  if (!baseline) {
    header();
    if (!violations.length) {
      console.log("PASS — every resolvable create on an owning-BU table writes the column.");
      process.exit(0);
    }
    for (const v of violations) console.log(`  [${v.check}] ${v.message}`);
    console.log("");
    console.log(
      `FAIL — ${violations.length} violation${violations.length === 1 ? "" : "s"} and no baseline.`
      + " Fix them, or record the known set with --update-baseline.",
    );
    process.exit(1);
  }

  if (mode.strict) {
    header();
    for (const v of fresh) console.log(`  [NEW] [${v.check}] ${v.message}`);
    for (const v of baselined) console.log(`  [baselined · ${known.get(v.id).owner}] [${v.check}] ${v.message}`);
    for (const e of stale) console.log(`  [STALE BASELINE] ${staleLine(e)}`);
    console.log("");
    if (!violations.length && !stale.length) {
      console.log("STRICT PASS — every create on an owning-BU table writes the column.");
      process.exit(0);
    }
    console.log(
      `STRICT FAIL — ${fresh.length} new, ${baselined.length} baselined (${ownerSummary(byOwner(baselined))})`
      + `${stale.length ? `, ${stale.length} stale baseline ${stale.length === 1 ? "entry" : "entries"}` : ""}.`
      + " --strict counts baselined creates as failures: this is the Phase exit gate.",
    );
    process.exit(1);
  }

  if (fresh.length || stale.length) {
    header();
    for (const v of fresh) console.log(`  [NEW] [${v.check}] ${v.message}`);
    for (const e of stale) console.log(`  [STALE BASELINE] ${staleLine(e)}`);
    console.log("");
    if (stale.length) {
      console.log("A stale baseline entry no longer matches any create. Either the create was FIXED —");
      console.log("then run --update-baseline to drop it — or it MOVED, and leaving the slot open would");
      console.log("let a different omission slip in under the same key. Never leave it unresolved.");
      console.log("");
    }
    console.log(
      `G-OWN FAIL: ${fresh.length} new, ${baselined.length} baselined${stale.length ? `, ${stale.length} stale` : ""}`
      + `${fresh.length ? ` — new: ${countsLine(fresh)}` : ""}`,
    );
    process.exit(1);
  }

  console.log(
    `G-OWN: 0 new, ${baselined.length} baselined (${ownerSummary(byOwner(baselined))})`
    + ` — ${satisfied.length}/${inScope.length} resolvable creates on the ${owningBu.size} owning-BU tables`
    + ` write the column, ${unresolvedPayload.length} not statically checkable.`,
  );
  process.exit(0);
}

function countsLine(list) {
  const byCheck = {};
  for (const v of list) byCheck[v.check] = (byCheck[v.check] ?? 0) + 1;
  return Object.entries(byCheck).map(([k, n]) => `${k}: ${n}`).join(", ");
}

function staleLine(e) {
  return `${e.file} ${e.entitySet} [${e.check}] (owner ${e.owner}) matches no create any more.`;
}

try {
  main();
} catch (err) {
  console.error(`check-ownership.mjs failed: ${err.stack}`);
  process.exit(2);
}
