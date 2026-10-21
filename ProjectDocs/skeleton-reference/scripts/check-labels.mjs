#!/usr/bin/env node
/**
 * check-labels.mjs — the G-LABEL gate. `node scripts/check-labels.mjs`, no arguments,
 * no network. Exit 0 = clean, 1 = violations, 2 = the gate itself broke.
 *
 * THE RULE IT ENFORCES
 *   Every user-visible string in the code app keeps the exact text the canvas app had,
 *   and every label constant says where its text came from. See docs/G-LABEL.md.
 *
 * THE BASELINE — reference/label-baseline.json
 *   The repo starts with known violations, and a gate that always exits 1 gets ignored.
 *   So the default run fails on DRIFT, not on the known set: every violation already in
 *   the baseline is reported as known, everything else is reported as [NEW] and fails.
 *   Each baseline entry carries an `owner` (`copy-owner` / `refactor` / `data-value`) and
 *   a mandatory `reason`; both are validated on load, and an entry that matches nothing
 *   any more FAILS the run — a stale entry would otherwise hide a fixed violation and
 *   leave its key free for a different one to slip in under.
 *
 *   The key is a hash of kind + file + constant path (or JSX slot) + the text itself, and
 *   is deliberately NOT line-numbered: it survives reformatting and moved code, but not a
 *   changed string — which is the point, since a changed string is a different violation.
 *
 *   --strict            count baselined violations as failures too. This is what a Phase
 *                       exit gate runs: it asks "is the app label-clean?", not "did we
 *                       make it worse?".
 *   --update-baseline   rewrite the baseline from the current violations, preserving the
 *                       `owner` and `reason` of every entry that survives. Run it when a
 *                       violation has genuinely been FIXED (to drop the stale entry), or
 *                       when a new known violation has been agreed with its owner. NEVER
 *                       run it to turn a red build green — the file is a to-do list, not
 *                       a permission, and every entry is work someone still owes.
 *
 *   `@labels-not-in-corpus` entries are NOT in the baseline: they are already declared at
 *   the point of use with a mandatory reason, the gate refuses one without a reason, and
 *   it prints the count on every run. Putting them in the baseline as well would record
 *   the same fact twice and let the two copies drift apart.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────
 * WHAT COUNTS AS A LABEL CONSTANT  (scope of checks 1-3)
 *   Files: `src/features/**\/rules.ts` and its siblings `*Rules.ts` / `plan.ts`.
 *   Entries: every `export const` string — a standalone `export const X = "…"` or a
 *   string-valued entry of an exported object/array literal — whose value is a
 *   USER-VISIBLE STRING, defined as: it contains at least one letter AND at least one
 *   uppercase letter AND it is not a Dataverse identifier (`vsb_…`, `…_value`,
 *   `@odata…`, `statecode`, `owningbusinessunit`, or a bare camelCase token).
 *   The uppercase requirement is what separates shipped text ("Delete Period?") from
 *   the lowercase choice/category keys this repo compares against
 *   ("bank margin construction"), and it is why a would-be label written entirely in
 *   lowercase is out of scope — there are none today.
 *
 *   OPT-OUT. `@labels-not-in-corpus <reason>` — on the entry, or on the whole constant —
 *   declares a string whose canvas home is NOT one of the seven label properties, so the
 *   corpus cannot adjudicate it: a Dataverse data value or option-set label the app
 *   compares against or renders (`'Hedging Type'.'Individual Volumes'`, a Job Type name),
 *   or a canvas literal that lives in a collection the screen builds
 *   (`ClearCollect(colTabsValues, ["Contracted Revenue", …])`). The reason is mandatory
 *   and must name where the string does come from. These entries are skipped by checks
 *   2-3 and COUNTED IN THE SUMMARY, so every exemption is visible on every run rather
 *   than hidden inside this script.
 *
 * WHAT COUNTS AS PROVENANCE  (check 1)
 *   A comment on the entry — the doc comment or `//` lines immediately above it, or a
 *   trailing `//` on the same line — that carries one of:
 *     a) a CITATION: a backticked `` `<Control>.<Property>` `` naming the canvas control
 *        and property the text came from. Claims the text is VERBATIM.
 *     b) `NEW — no canvas equivalent: <why>`
 *     c) `CANVAS DIVERGENCE — see <fn>; canvas text: "<exact canvas string>"`
 *     d) `SPELLING CORRECTED — canvas `<control>.<property>` reads "<exact canvas string>"`
 *     e) `INTERPOLATED — canvas `<control>.<property>` builds this from "<segment>" + …`
 *        for a canvas string assembled by `$"…{expr}…"`, where the code app stores the
 *        assembled form. This is NOT one of the three permitted deviations — the visible
 *        text is unchanged — so it is checked, not excused: every quoted segment must be
 *        recorded for that control+property in the corpus AND must appear inside the
 *        constant's own value.
 *   An em dash or a plain hyphen is accepted after the marker word.
 *
 * CORPUS CHECKS  (checks 2-3, need reference/canvas-labels.json)
 *   2. a cited `<Control>.<Property>` must exist in the corpus;
 *   3. a citation with no marker claims VERBATIM, so the constant's value must be one of
 *      the canvas strings recorded for that control+property. `CANVAS DIVERGENCE` and
 *      `SPELLING CORRECTED` entries are checked the other way round: the canvas string
 *      they quote must exist in the corpus (and, for SPELLING CORRECTED, under the cited
 *      control+property), and the constant's value must NOT equal it — otherwise the
 *      marker is stale.
 *   If `reference/canvas-labels.json` is missing, checks 2-3 are skipped and the run
 *   says so; checks 1 and 4 still run. Rebuild it with
 *   `node scripts/extract-canvas-labels.mjs`.
 *
 * INLINE-LITERAL CHECK  (check 4)  — the rule, stated so it can be argued with:
 *   In `src/features/**\/Screen.tsx`, an inline string literal is a MISPLACED LABEL when
 *   BOTH hold:
 *     · it reaches the user as text — it is a JSX text child (`>Some words<`) or the
 *       value of a `label` / `title` / `placeholder` / `aria-label` JSX prop; and
 *     · it is MESSAGE-SHAPED — two or more words containing a letter, and either it ends
 *       in sentence punctuation (`.`, `?`, `!`, `…`) or it runs to eight words or more.
 *
 *   WHY MESSAGE-SHAPED AND NOT SIMPLY "TWO WORDS". The rule the gate has to enforce is
 *   "a bare user-visible string that SHOULD BE IN `MSG`". `MSG` holds messages —
 *   validations, confirmations, guards, empty states, save failures. Captions do not
 *   live there and never did: this repo's own convention (CONVENTIONS.md) writes the
 *   page furniture inline, `<PageHeader eyebrow="…" title="…" description="…" />`, and
 *   puts field labels in a `*_LABELS` constant. Flagging every two-word caption would
 *   report ~400 lines of house style as violations and say nothing about label fidelity;
 *   flagging sentences finds the strings that escaped the rules layer. A caption that
 *   IS canvas text still gets its provenance the moment it moves into a constant — and
 *   `*_LABELS` / `*_COLUMNS` constants are checked by checks 1-3 like anything else.
 *
 *   Strings inside `//` or `/* … *\/` comments, and anything built from a template
 *   literal or an expression, are not literals for this purpose.
 */
import { readdirSync, readFileSync, statSync, existsSync, writeFileSync } from "node:fs";
import { join, relative, resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FEATURES = join(REPO_ROOT, "src/features");
const CORPUS = join(REPO_ROOT, "reference/canvas-labels.json");
const BASELINE = join(REPO_ROOT, "reference/label-baseline.json");

/** Which of the three owners a violation belongs to, by kind. */
const OWNER_BY_CHECK = {
  "text-mismatch": "copy-owner",
  "quoted-canvas-text-unknown": "copy-owner",
  "stale-marker": "copy-owner",
  "inline-literal": "refactor",
  "no-provenance": "refactor",
  "unknown-control": "refactor",
  "fragment-unknown": "refactor",
  "fragment-not-used": "refactor",
};
const OWNERS = ["copy-owner", "refactor", "data-value"];

/* ═════════════════════════════════════════════════════════════════════ helpers ══ */

const DATAVERSE_NAME = [
  /^_?vsb_/i,
  /_value$/,
  /^@odata/i,
  /^(statecode|statuscode|owningbusinessunit|createdon|modifiedon)$/i,
  /^[a-z][A-Za-z0-9]*$/, // bare camelCase token — an identifier, not shipped text
];

function isVisibleString(v) {
  if (!/[A-Za-z]/.test(v)) return false;
  if (!/[A-Z]/.test(v)) return false;
  if (DATAVERSE_NAME.some((r) => r.test(v))) return false;
  return true;
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

/** Decode a TS double-quoted literal body into the runtime string. */
function decodeTsString(body) {
  return body.replace(/\\(u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|.)/g, (_m, esc) => {
    if (esc[0] === "u") return String.fromCharCode(parseInt(esc.slice(1), 16));
    if (esc[0] === "x") return String.fromCharCode(parseInt(esc.slice(1), 16));
    return { n: "\n", t: "\t", r: "\r", "0": "\0" }[esc] ?? esc;
  });
}

/* ══════════════════════════════════════════════════ 1. collect label constants ══ */

/**
 * Returns `[{ file, line, constName, key, value, comment, exempt }]` for every
 * user-visible string exported from a rules file.
 */
function collectLabelConstants(files) {
  const found = [];
  for (const file of files) {
    const lines = readFileSync(file, "utf8").split("\n");

    for (let i = 0; i < lines.length; i += 1) {
      const decl = /^export const ([A-Za-z_$][\w$]*)/.exec(lines[i]);
      if (!decl) continue;

      // The declaration's own doc comment (used for the @labels-data-values opt-out).
      const declComment = flattenComment(commentAbove(lines, i));
      const declExempt = /@labels-not-in-corpus\s+\S/.test(declComment);

      // Extent of the statement: from the declaration until brackets balance again.
      let depth = 0;
      let end = i;
      for (let j = i; j < lines.length; j += 1) {
        for (const ch of stripStringsAndComments(lines[j])) {
          if (ch === "{" || ch === "[" || ch === "(") depth += 1;
          else if (ch === "}" || ch === "]" || ch === ")") depth -= 1;
        }
        end = j;
        if (depth <= 0) break;
      }

      for (let j = i; j <= end; j += 1) {
        const line = lines[j];
        const keyLine = j;
        let key = null;
        let raw = null;

        const standalone =
          j === i &&
          /^export const [A-Za-z_$][\w$]*(?:\s*:[^=]*)?\s*=\s*"((?:[^"\\]|\\.)*)"\s*(?:as const)?\s*;/.exec(
            line,
          );
        const standaloneSingle =
          j === i &&
          !standalone &&
          /^export const [A-Za-z_$][\w$]*(?:\s*:[^=]*)?\s*=\s*'((?:[^'\\]|\\.)*)'\s*(?:as const)?\s*;/.exec(
            line,
          );
        if (standalone || standaloneSingle) {
          key = decl[1];
          raw = (standalone ?? standaloneSingle)[1];
        } else {
          const entry = /^\s*(?:([A-Za-z_$][\w$]*)|"([^"]*)")\s*:\s*"((?:[^"\\]|\\.)*)"\s*,?\s*(?:\/\/.*)?$/.exec(
            line,
          );
          if (entry) {
            key = entry[1] ?? entry[2];
            raw = entry[3];
          } else {
            // A message that itself contains double quotes is written with '…' in this
            // repo: `securedTooHigh: '"Secured" has to be lower …'`.
            const single = /^\s*(?:([A-Za-z_$][\w$]*)|"([^"]*)")\s*:\s*'((?:[^'\\]|\\.)*)'\s*,?\s*(?:\/\/.*)?$/.exec(
              line,
            );
            if (single) {
              key = single[1] ?? single[2];
              raw = single[3];
            }
          }
        }
        // A message split over lines: `key:` then one or more `"…"` joined with `+`.
        if (raw === null) {
          const opener = /^\s*([A-Za-z_$][\w$]*)\s*:\s*$/.exec(line);
          const inlineStart = /^\s*([A-Za-z_$][\w$]*)\s*:\s*("(?:[^"\\]|\\.)*")\s*\+\s*$/.exec(
            line,
          );
          if (opener || inlineStart) {
            const parts = inlineStart ? [inlineStart[2]] : [];
            let k = j + 1;
            let ok = false;
            for (; k <= end && k < j + 8; k += 1) {
              const t = lines[k].trim();
              const piece = /^\+?\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')\s*(\+|,)?\s*$/.exec(t);
              if (!piece) break;
              parts.push(piece[1]);
              if (piece[2] === ",") {
                ok = true;
                break;
              }
              if (piece[2] !== "+") break;
            }
            if (ok && parts.length) {
              key = (opener ?? inlineStart)[1];
              raw = parts.map((p) => p.slice(1, -1)).join("");
              j = k;
            }
          }
        }
        if (raw === null) continue;
        const value = decodeTsString(raw);
        if (!isVisibleString(value)) continue;

        const trailing = /\/\/(.*)$/.exec(line.replace(/^[^"]*"(?:[^"\\]|\\.)*"/, ""));
        const comment = flattenComment(
          `${commentAbove(lines, keyLine)}\n${trailing ? trailing[1] : ""}`,
        );

        found.push({
          file,
          line: keyLine + 1,
          constName: decl[1],
          key,
          value,
          comment: keyLine === i ? flattenComment(`${declComment} ${comment}`) : comment,
          exempt: declExempt || /@labels-not-in-corpus\s+\S/.test(comment),
        });
      }
      i = end;
    }
  }
  return found;
}

/**
 * Flatten a comment block to one line so a provenance marker still parses when it is
 * wrapped over several lines: leading `*`/`//` furniture becomes a single space.
 */
function flattenComment(text) {
  return text
    .replace(/\r/g, "")
    .replace(/\n\s*(?:\*\/|\*|\/\/)?[ \t]?/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/** The contiguous comment block (block or `//`) directly above `index`. */
function commentAbove(lines, index) {
  const collected = [];
  let i = index - 1;
  // A one-line `/** … */` or a `//` run.
  while (i >= 0) {
    const t = lines[i].trim();
    if (t.endsWith("*/")) {
      const block = [];
      while (i >= 0) {
        block.unshift(lines[i]);
        if (lines[i].trim().startsWith("/*")) break;
        i -= 1;
      }
      collected.unshift(block.join("\n"));
      i -= 1;
      continue;
    }
    if (t.startsWith("//")) {
      collected.unshift(t);
      i -= 1;
      continue;
    }
    break;
  }
  return collected.join("\n");
}

function stripStringsAndComments(line) {
  return line
    .replace(/\/\/.*$/, "")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/`(?:[^`\\]|\\.)*`/g, "``");
}

/* ═════════════════════════════════════════════════════ 2. provenance grammar ══ */

const MARKER_NEW = /NEW\s*[—–-]\s*no canvas equivalent\s*:\s*(\S.*)/;
const MARKER_DIVERGENCE = /CANVAS DIVERGENCE\s*[—–-]\s*see\s+([^;]+);\s*canvas text\s*:\s*"((?:[^"\\]|\\.)*)"/;
const MARKER_SPELLING = /SPELLING CORRECTED\s*[—–-]\s*canvas\s+`([^`]+)`\s+reads\s+"((?:[^"\\]|\\.)*)"/;
const CITATION = /`([A-Za-z_][\w ]*(?:\.[A-Za-z_][\w]*)+)`/g; // the head may be a screen name, which has spaces
const MARKER_INTERPOLATED = /INTERPOLATED\s*[—–-]\s*canvas\s+`([^`]+)`\s+builds this from\s+((?:"(?:[^"\\]|\\.)*"\s*\+?\s*)+)/;

/**
 * A backticked dotted name is a CANVAS citation unless its first segment is one of THIS
 * repo's own exported constants — those are SCREAMING_SNAKE_CASE (`MSG_CANVAS.x`), which
 * no canvas control or global ever is.
 */
function isCanvasCitation(name) {
  const head = name.split(".")[0];
  return !/^[A-Z][A-Z0-9_]*$/.test(head);
}

function parseProvenance(comment) {
  const out = { kind: null, citations: [], why: null, canvasText: null, seeFn: null, fragments: [] };
  const interpolated = MARKER_INTERPOLATED.exec(comment);
  if (interpolated) {
    out.kind = "interpolated";
    out.citations = [interpolated[1]];
    out.fragments = [...interpolated[2].matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) =>
      decodeTsString(m[1]),
    );
    return out;
  }
  const spelling = MARKER_SPELLING.exec(comment);
  if (spelling) {
    out.kind = "spelling";
    out.citations = [spelling[1]];
    out.canvasText = decodeTsString(spelling[2]);
    return out;
  }
  const divergence = MARKER_DIVERGENCE.exec(comment);
  if (divergence) {
    out.kind = "divergence";
    out.seeFn = divergence[1].trim();
    out.canvasText = decodeTsString(divergence[2]);
    for (const m of comment.matchAll(CITATION)) if (isCanvasCitation(m[1])) out.citations.push(m[1]);
    return out;
  }
  const isNew = MARKER_NEW.exec(comment);
  if (isNew) {
    out.kind = "new";
    out.why = isNew[1].trim();
    return out;
  }
  const cites = [...comment.matchAll(CITATION)].map((m) => m[1]).filter(isCanvasCitation);
  if (cites.length) {
    out.kind = "citation";
    out.citations = cites;
  }
  return out;
}

/**
 * A citation is `Control.Property`, possibly with a longer dotted tail
 * (`cmp_X.Title.Default`). Match it against the corpus keys.
 */
function corpusStringsFor(corpus, citation) {
  if (corpus.byControlProperty[citation]) return corpus.byControlProperty[citation];
  return null;
}

/* ════════════════════════════════════════════════ 3. inline-literal detection ══ */

const TEXT_PROPS = ["label", "title", "placeholder", "aria-label"];

/**
 * Is this inline string a MESSAGE — the class of text that belongs in `rules.ts`?
 *
 * Two or more words with a letter in them, AND either it closes with sentence
 * punctuation (`.`, `?`, `!`, `…`) or it runs to eight words or more. A caption
 * ("Project team", "Show resolved comments") is composition and stays in the screen by
 * this repo's own convention (CONVENTIONS.md writes `<PageHeader title="…">` inline); a
 * sentence is a message the rules layer should own, next to a provenance comment.
 */
function isMisplacedMessage(text) {
  const t = text.trim();
  if (!/[A-Za-z]/.test(t)) return false;
  if (!/\S\s\S/.test(t)) return false;
  if (/[.?!…]$/.test(t)) return true;
  return t.split(/\s+/).length >= 8;
}

/** Strip `//` and block comments from a whole file, keeping line count stable. */
function blankComments(src) {
  let out = "";
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === "/" && src[i + 1] === "/") {
      while (i < src.length && src[i] !== "\n") {
        out += " ";
        i += 1;
      }
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) {
        out += src[i] === "\n" ? "\n" : " ";
        i += 1;
      }
      out += "  ";
      i += 2;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      out += c;
      i += 1;
      while (i < src.length) {
        if (src[i] === "\\") {
          out += src.slice(i, i + 2);
          i += 2;
          continue;
        }
        out += src[i];
        if (src[i] === quote) {
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

function lineOf(src, index) {
  let line = 1;
  for (let i = 0; i < index; i += 1) if (src[i] === "\n") line += 1;
  return line;
}

function findInlineLiterals(file) {
  const src = blankComments(readFileSync(file, "utf8"));
  const hits = [];

  // (a) text-carrying JSX props: label="…" / title={"…"}
  for (const prop of TEXT_PROPS) {
    const re = new RegExp(`\\b${prop}\\s*=\\s*(?:\\{\\s*)?"((?:[^"\\\\]|\\\\.)*)"`, "g");
    for (const m of src.matchAll(re)) {
      const text = decodeTsString(m[1]);
      if (isMisplacedMessage(text)) {
        hits.push({ file, line: lineOf(src, m.index), where: `${prop}=`, text });
      }
    }
  }

  // (b) JSX text children. A run between `>` and `<` that starts with a capital or a
  //     digit and carries no JS punctuation — that last condition is what keeps
  //     `a > b ? x : y` and generics out of the results.
  for (const m of src.matchAll(/>\s*([A-Z0-9][^<>{}"`\n]*?)\s*</g)) {
    const text = m[1];
    if (/[=|&?:()[\]]/.test(text)) continue;
    if (isMisplacedMessage(text)) {
      hits.push({ file, line: lineOf(src, m.index), where: "JSX text child", text });
    }
  }
  return hits;
}

/* ══════════════════════════════════════════════════════ violation identity ══ */

/**
 * The baseline key. Deliberately NOT line-numbered — a violation must survive
 * reformatting, a comment re-wrap and code moving up or down the file. It is the hash of
 *
 *     <kind> ␀ <repo-relative file> ␀ <constant path or JSX slot> ␀ <payload> ␀ <n>
 *
 * where `payload` is the text the violation is about (the app string, the citation, the
 * quoted canvas string) and `n` disambiguates the rare case of the same violation
 * appearing more than once in one file — the same message-shaped literal used twice, for
 * instance. Change the wording of a message and the key changes with it, which is the
 * point: the baseline can only cover the violation it was written for.
 */
function violationId(v) {
  const parts = [v.check, v.file, v.path, v.payload, String(v.occurrence ?? 1)];
  return createHash("sha1").update(parts.join("\u0000")).digest("hex").slice(0, 16);
}

/** Number repeats of an otherwise identical violation so each gets its own key. */
function numberOccurrences(violations) {
  const seen = new Map();
  for (const v of violations.sort((a, b) => (a.line ?? 0) - (b.line ?? 0))) {
    const k = `${v.check}\u0000${v.file}\u0000${v.path}\u0000${v.payload}`;
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
  if (!Array.isArray(entries)) throw new Error("reference/label-baseline.json has no `entries` array");
  for (const e of entries) {
    if (!e.id) throw new Error(`baseline entry without an id: ${JSON.stringify(e).slice(0, 120)}`);
    if (!OWNERS.includes(e.owner)) {
      throw new Error(`baseline entry ${e.id} has owner ${JSON.stringify(e.owner)}; use one of ${OWNERS.join(" / ")}`);
    }
    if (!e.reason || !String(e.reason).trim()) {
      throw new Error(`baseline entry ${e.id} has no reason — every baselined violation must say why it is still here`);
    }
  }
  return new Map(entries.map((e) => [e.id, e]));
}

/** Trigram similarity, used only to write a helpful `reason` into a new baseline entry. */
function similarity(a, b) {
  const grams = (s) => {
    const t = ` ${s.toLowerCase().replace(/\s+/g, " ").trim()} `;
    const out = new Set();
    for (let i = 0; i < t.length - 2; i += 1) out.add(t.slice(i, i + 3));
    return out;
  };
  const ga = grams(a);
  const gb = grams(b);
  let hit = 0;
  for (const g of ga) if (gb.has(g)) hit += 1;
  return (2 * hit) / (ga.size + gb.size);
}

/**
 * The `reason` a fresh `--update-baseline` writes. For an inline literal it consults the
 * corpus so that whoever moves the string is told up front whether citing it will pass
 * cleanly, or surface a second, PRE-EXISTING text-mismatch they did not cause.
 */
function draftReason(v, corpus) {
  if (v.check !== "inline-literal") return v.message.replace(/^\S+ /, "");
  const move = `Move into the feature's rules.ts and cite the canvas control; the string itself is not in question.`;
  if (!corpus) return move;
  const exact = corpus.byText[v.payload];
  if (exact) return `${move} Canvas match: \`${exact[0]}\` — citing it will pass verbatim.`;
  let best = null;
  for (const [text, where] of Object.entries(corpus.byText)) {
    const score = similarity(v.payload, text);
    if (!best || score > best.score) best = { text, where: where[0], score };
  }
  if (best && best.score >= 0.72) {
    return `${move} NOTE — the canvas reads ${JSON.stringify(best.text)} (\`${best.where}\`), so the move will surface a second, PRE-EXISTING text-mismatch: that wording gap is not a regression introduced by the move, it is finding it.`;
  }
  return `${move} No canvas string carries this text, so it will need a NEW marker.`;
}

function writeBaseline(violations, previous, corpus) {
  const entries = violations
    .slice()
    .sort((a, b) => a.check.localeCompare(b.check) || a.file.localeCompare(b.file) || a.path.localeCompare(b.path) || a.occurrence - b.occurrence)
    .map((v) => {
      const old = previous?.get(v.id);
      return {
        id: v.id,
        check: v.check,
        file: v.file,
        path: v.path,
        payload: v.payload,
        occurrence: v.occurrence,
        expected: v.expected ?? null,
        owner: old?.owner ?? OWNER_BY_CHECK[v.check] ?? "refactor",
        reason: old?.reason ?? draftReason(v, corpus),
      };
    });
  const doc = {
    $schema: "label-baseline/1",
    generatedBy: "node scripts/check-labels.mjs --update-baseline",
    note:
      "The known-violation set for G-LABEL. It is a TO-DO LIST, NOT A PERMISSION: every "
      + "entry is work someone still owes. The gate fails on anything not listed here, and "
      + "on any entry that no longer matches, so a fixed violation cannot leave a slot open "
      + "for a different one. Never run --update-baseline to make a red build green.",
    owners: {
      "copy-owner": "A wording decision: restore the canvas text, or record the source defect and add a `…CanvasParity` twin.",
      refactor: "The string is right, it is in the wrong place: move it into rules.ts and cite the canvas control from there.",
      "data-value": "Not canvas-authored text (a Dataverse data value or option-set label) and not resolvable from the corpus.",
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

/* ════════════════════════════════════════════════════════════════════ the gate ══ */

function main() {
  const argv = process.argv.slice(2);
  const mode = {
    strict: argv.includes("--strict"),
    update: argv.includes("--update-baseline"),
  };
  for (const a of argv) {
    if (!["--strict", "--update-baseline"].includes(a)) {
      throw new Error(`unknown argument ${a} — the gate takes --strict and --update-baseline`);
    }
  }

  const all = walk(FEATURES);
  const ruleFiles = all.filter((f) => /(?:^|\/)(rules|[A-Za-z]+Rules|plan)\.ts$/.test(f));
  const screenFiles = all.filter((f) => basename(f) === "Screen.tsx");

  let corpus = null;
  if (existsSync(CORPUS)) corpus = JSON.parse(readFileSync(CORPUS, "utf8"));

  const violations = [];
  const rel = (f) => relative(REPO_ROOT, f);

  const constants = collectLabelConstants(ruleFiles);
  const exemptCount = constants.filter((c) => c.exempt).length;
  const checked = constants.filter((c) => !c.exempt);

  for (const c of checked) {
    const prov = parseProvenance(c.comment);
    const at = `${rel(c.file)}:${c.line} ${c.constName}.${c.key}`;
    const where = { file: rel(c.file), path: `${c.constName}.${c.key}`, line: c.line };

    if (!prov.kind) {
      violations.push({
        ...where,
        check: "no-provenance",
        payload: c.value,
        message: `${at} — no provenance comment for ${JSON.stringify(c.value)}. Add a \`Control.Property\` citation, or one of NEW / CANVAS DIVERGENCE / SPELLING CORRECTED.`,
      });
      continue;
    }
    if (prov.kind === "new") continue;
    if (!corpus) continue;

    for (const citation of prov.citations) {
      if (!corpusStringsFor(corpus, citation)) {
        violations.push({
          ...where,
          check: "unknown-control",
          payload: citation,
          message: `${at} — provenance cites \`${citation}\`, which is not in reference/canvas-labels.json.`,
        });
      }
    }

    if (prov.kind === "citation") {
      const pool = prov.citations.flatMap((p) => corpusStringsFor(corpus, p) ?? []);
      if (pool.length && !pool.includes(c.value)) {
        violations.push({
          ...where,
          check: "text-mismatch",
          payload: c.value,
          expected: pool.slice(0, 4),
          message: `${at} — claimed verbatim from \`${prov.citations.join("`, `")}\` but the canvas string is ${pool
            .map((s) => JSON.stringify(s))
            .slice(0, 3)
            .join(" / ")}, not ${JSON.stringify(c.value)}.`,
        });
      }
    }

    if (prov.kind === "interpolated") {
      const pool = corpusStringsFor(corpus, prov.citations[0]) ?? [];
      for (const frag of prov.fragments) {
        if (pool.length && !pool.includes(frag)) {
          violations.push({
            ...where,
            check: "fragment-unknown",
            payload: frag,
            message: `${at} — \`${prov.citations[0]}\` has no interpolation segment ${JSON.stringify(frag)}.`,
          });
        }
        if (!c.value.includes(frag.trim()) || frag.trim() === "") {
          violations.push({
            ...where,
            check: "fragment-not-used",
            payload: frag,
            message: `${at} — declared canvas segment ${JSON.stringify(frag)} does not appear in ${JSON.stringify(c.value)}.`,
          });
        }
      }
    }

    if (prov.kind === "divergence" || prov.kind === "spelling") {
      const known = Object.prototype.hasOwnProperty.call(corpus.byText, prov.canvasText);
      if (!known) {
        violations.push({
          ...where,
          check: "quoted-canvas-text-unknown",
          payload: prov.canvasText,
          message: `${at} — the comment quotes canvas text ${JSON.stringify(prov.canvasText)}, which is not in reference/canvas-labels.json.`,
        });
      }
      if (prov.kind === "spelling") {
        const pool = corpusStringsFor(corpus, prov.citations[0]) ?? [];
        if (pool.length && !pool.includes(prov.canvasText)) {
          violations.push({
            ...where,
            check: "quoted-canvas-text-unknown",
            payload: `${prov.citations[0]}\u0000${prov.canvasText}`,
            message: `${at} — \`${prov.citations[0]}\` does not read ${JSON.stringify(prov.canvasText)}; it reads ${pool
              .map((s) => JSON.stringify(s))
              .slice(0, 3)
              .join(" / ")}.`,
          });
        }
      }
      if (prov.canvasText === c.value) {
        violations.push({
          ...where,
          check: "stale-marker",
          payload: prov.canvasText,
          message: `${at} — marked as a deviation but the value equals the canvas string ${JSON.stringify(prov.canvasText)}. Use a plain citation instead.`,
        });
      }
    }
  }

  let inlineHits = [];
  for (const f of screenFiles) inlineHits = inlineHits.concat(findInlineLiterals(f));
  for (const h of inlineHits) {
    violations.push({
      file: rel(h.file),
      path: h.where,
      line: h.line,
      check: "inline-literal",
      payload: h.text,
      message: `${rel(h.file)}:${h.line} — user-visible string ${JSON.stringify(h.text)} sits inline (${h.where}); move it to rules.ts with a provenance comment.`,
    });
  }

  /* ────────────────────────────────────────────────────────────────── report ── */
  numberOccurrences(violations);

  const baseline = mode.update ? null : loadBaseline();
  const known = baseline ?? new Map();
  const fresh = violations.filter((v) => !known.has(v.id));
  const baselined = violations.filter((v) => known.has(v.id));
  const seen = new Set(violations.map((v) => v.id));
  // Without the corpus, checks 2-3 cannot run, so their baseline entries cannot match —
  // that is a skipped check, not a fixed violation, and must not be reported as stale.
  const CORPUS_CHECKS = new Set([
    "text-mismatch",
    "unknown-control",
    "quoted-canvas-text-unknown",
    "stale-marker",
    "fragment-unknown",
    "fragment-not-used",
  ]);
  const stale = [...known.values()].filter(
    (e) => !seen.has(e.id) && (corpus || !CORPUS_CHECKS.has(e.check)),
  );
  const unverifiable = corpus
    ? 0
    : [...known.values()].filter((e) => !seen.has(e.id) && CORPUS_CHECKS.has(e.check)).length;

  const byOwner = (list) =>
    list.reduce((acc, v) => {
      const owner = known.get(v.id)?.owner ?? OWNER_BY_CHECK[v.check] ?? "refactor";
      acc[owner] = (acc[owner] ?? 0) + 1;
      return acc;
    }, {});
  const ownerSummary = (counts) =>
    OWNERS.filter((o) => counts[o]).map((o) => `${counts[o]} ${o}`).join(", ");

  if (mode.update) {
    const previous = existsSync(BASELINE) ? loadBaselineLoose() : null;
    const entries = writeBaseline(violations, previous, corpus);
    const counts = entries.reduce((acc, e) => {
      acc[e.owner] = (acc[e.owner] ?? 0) + 1;
      return acc;
    }, {});
    header();
    console.log(`WROTE ${relative(REPO_ROOT, BASELINE)} — ${entries.length} entries (${ownerSummary(counts)}).`);
    console.log("");
    console.log("!! WARNING — the baseline is a to-do list, not a permission. Do NOT run");
    console.log("!! --update-baseline to turn a red build green: that hides work someone owes.");
    console.log("!! Run it only when a violation has genuinely been FIXED, or when a new");
    console.log("!! known-and-owned violation has been agreed with the owner named in it.");
    process.exit(0);
  }

  if (!baseline) {
    // No baseline at all — the original behaviour.
    header();
    if (!violations.length) {
      console.log("PASS — every label constant carries provenance and no misplaced literals.");
      process.exit(0);
    }
    for (const v of violations) console.log(`  [${v.check}] ${v.message}`);
    console.log("");
    console.log(
      `FAIL — ${violations.length} violation${violations.length === 1 ? "" : "s"} and no baseline`
        + ` (${countsLine(violations)}). Fix them, or record the known set with --update-baseline.`,
    );
    process.exit(1);
  }

  if (mode.strict) {
    header();
    for (const v of fresh) console.log(`  [NEW] [${v.check}] ${v.message}`);
    for (const v of baselined) {
      const e = known.get(v.id);
      console.log(`  [baselined · ${e.owner}] [${v.check}] ${v.message}`);
    }
    for (const e of stale) console.log(`  [STALE BASELINE] ${staleLine(e)}`);
    console.log("");
    if (!violations.length && !stale.length) {
      console.log("STRICT PASS — no violations at all.");
      process.exit(0);
    }
    console.log(
      `STRICT FAIL — ${fresh.length} new, ${baselined.length} baselined (${ownerSummary(byOwner(baselined))})`
        + `${stale.length ? `, ${stale.length} stale baseline ${stale.length === 1 ? "entry" : "entries"}` : ""}.`
        + " --strict counts baselined violations as failures: this is the Phase exit gate.",
    );
    process.exit(1);
  }

  /* Default mode: new drift fails, the known set is reported loudly but does not fail. */
  if (fresh.length || stale.length) {
    header();
    for (const v of fresh) {
      console.log(`  [NEW] [${v.check}] ${v.message}`);
    }
    for (const e of stale) {
      console.log(`  [STALE BASELINE] ${staleLine(e)}`);
    }
    console.log("");
    if (stale.length) {
      console.log(
        "A stale baseline entry no longer matches any violation. Either it was FIXED — then",
      );
      console.log(
        "run --update-baseline to drop it — or it MOVED, and leaving the slot open would let a",
      );
      console.log("different violation slip in under the same key. Never leave it unresolved.");
      console.log("");
    }
    console.log(
      `G-LABEL FAIL: ${fresh.length} new, ${baselined.length} baselined`
        + `${stale.length ? `, ${stale.length} stale` : ""}`
        + `${fresh.length ? ` — new: ${countsLine(fresh)}` : ""}`,
    );
    process.exit(1);
  }

  console.log(
    `G-LABEL: 0 new, ${baselined.length} baselined (${ownerSummary(byOwner(baselined))})`
      + `${unverifiable ? ` — ${unverifiable} more not verifiable: no canvas corpus, so checks 2-3 were skipped` : ""}`,
  );
  process.exit(0);

  function header() {
    console.log("G-LABEL — label fidelity gate");
    console.log(`  rules files scanned      ${ruleFiles.length}`);
    console.log(`  Screen.tsx scanned       ${screenFiles.length}`);
    console.log(`  label constants checked  ${checked.length}`);
    console.log(`  exempt (@labels-not-in-corpus) ${exemptCount}`);
    if (corpus) {
      console.log(
        `  canvas corpus            ${relative(REPO_ROOT, CORPUS)} — ${corpus.counts.distinct} distinct strings, ${
          Object.keys(corpus.byControlProperty).length
        } control+property keys`,
      );
    } else {
      console.log(`  canvas corpus            MISSING — corpus checks (2,3) SKIPPED.`);
      console.log(`                           run: node scripts/extract-canvas-labels.mjs`);
    }
    console.log(
      `  baseline                 ${
        baseline ? `${relative(REPO_ROOT, BASELINE)} — ${known.size} known` : "none"
      }`,
    );
    console.log("");
  }
}

function countsLine(list) {
  const byCheck = {};
  for (const v of list) byCheck[v.check] = (byCheck[v.check] ?? 0) + 1;
  return Object.entries(byCheck)
    .map(([k, n]) => `${k}: ${n}`)
    .join(", ");
}

function staleLine(e) {
  return `${e.file} ${e.path} [${e.check}] ${JSON.stringify(String(e.payload).slice(0, 60))}`
    + ` (owner ${e.owner}) matches nothing any more.`;
}

/** The baseline as-is, without the owner/reason validation — used before rewriting it. */
function loadBaselineLoose() {
  const raw = JSON.parse(readFileSync(BASELINE, "utf8"));
  const entries = Array.isArray(raw) ? raw : (raw.entries ?? []);
  return new Map(entries.filter((e) => e.id).map((e) => [e.id, e]));
}

try {
  main();
} catch (err) {
  console.error(`check-labels.mjs failed: ${err.stack}`);
  process.exit(2);
}
