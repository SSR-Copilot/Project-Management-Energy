#!/usr/bin/env node
/**
 * check-test-ids.mjs — the G-IDS gate. `node scripts/check-test-ids.mjs`, no arguments,
 * no network. Exit 0 = clean, 1 = findings, 2 = the gate itself broke (which includes
 * being passed an argument: there is nothing to configure, and a flag would only ever be
 * an attempt to narrow the scan, which is the one thing a repo-wide uniqueness check
 * cannot allow).
 *
 * THE RULE IT ENFORCES
 *   A `UT-<PREFIX>-NNN` id names exactly one test, and every id anyone cites is a test
 *   that exists. Those two properties are what make the ids usable as a currency: a spec
 *   case, a `// see UT-X-012` in production code, a review comment and a CI failure all
 *   have to point at the same `it()`. When they stop doing that the ids look like
 *   coverage and are not — which is the failure this repo has already had once, when a
 *   renumbering pass left two tests sharing an id and five comments citing ids that no
 *   `it()` carried.
 *
 * WHAT AN ID IS ATTACHED TO
 *   A DECLARATION is an id inside the title string of a `describe(...)`, `it(...)` or
 *   `test(...)` call (including `.each` / `.skip` / `.only` variants), anywhere under
 *   `src/`. Both block kinds count as declarations because this repo uses both: most
 *   files put the id on the `it()`, `project-main/rules.test.ts` groups several
 *   assertions per case and puts the id on the `describe()`. Either way the id names a
 *   run of assertions, which is what a citation needs to reach.
 *
 *   A CITATION is any other occurrence of an id — a doc comment, a `//` note, a header
 *   coverage list, a string in non-test code. Citations are not declarations: a file full
 *   of cited ids proves nothing about what runs.
 *
 * THE THREE FINDINGS
 *   1. duplicate-id — one id on more than one `it()` / `test()` title, anywhere under
 *      `src/`. This is measured on `it()`/`test()` only, not on `describe()`: a
 *      `describe("UT-X-001 …")` that wraps a single `it("UT-X-001 …")` is one case
 *      written in two lines, not two cases sharing an id, and flagging it would punish a
 *      house style rather than find a defect. Two `it()`s under one id is the real
 *      defect: `vitest -t UT-X-001` then runs two different cases and a report that says
 *      "UT-X-001 passed" is ambiguous.
 *
 *   2. phantom-citation — an id cited in a comment or a header list that sits on no
 *      declaration at all. A cited id is a promise that a test pins the behaviour; when
 *      the test was renumbered or struck and the comment was not, the promise is false
 *      and the reader cannot tell which way round it is.
 *
 *      THE ESCAPE HATCH — `@ut-ref <reason>`. Some citations are deliberate references
 *      to an id that this repo does NOT implement: a spec case whose HTTP wiring has no
 *      test, or an id struck by a renumber whose history is worth keeping in the comment
 *      that explains the code. Write the marker on the same line as the citation, with a
 *      mandatory reason after it:
 *
 *          // UT-FIN-020 @ut-ref spec case; the mutation's HTTP wiring has no it()
 *
 *      The marker exempts every id on its line and is COUNTED IN THE SUMMARY, so each
 *      exemption stays visible on every run instead of disappearing into this script.
 *
 *      A cross-FILE citation of an id that IS declared somewhere needs no marker and
 *      never has: `src/features/pm/production/rules.test.ts` cites `UT-GRIDOP-027`,
 *      which is declared on an `it()` in `src/features/pm/grid-operator/rules.test.ts`,
 *      because the production screen's write-permission case mirrors the grid operator's.
 *      That is exactly the deliberate cross-reference the ids exist to make possible, and
 *      the gate resolves it by looking for the declaration repo-wide rather than in the
 *      citing file. The marker is only for ids that are declared NOWHERE.
 *
 *   3. bad-renumber — a prefix that has BOTH a numbering gap AND a duplicate id. Either
 *      alone is innocent: a gap is usually an id deliberately struck (a spec case with no
 *      implementation), and this repo has many. Together they are the signature of a
 *      half-finished renumber — a block of tests was shifted, one landed on a number that
 *      was already taken, and the number it vacated is now empty. Reported separately
 *      from the duplicates themselves because the fix is different: the duplicate needs a
 *      new id, and the gap tells you which one was meant.
 *
 * WHAT IS NOT A FINDING
 *   A numbering gap on its own, a prefix that does not start at 001, an id on a
 *   `describe()` with no `it()` of its own, and ids out of source order. All of those are
 *   printed in the per-prefix summary so a renumber can be reviewed, none of them fails
 *   the run. A gate that fails on a deliberately struck id trains people to renumber
 *   whole files to close a hole, which is how duplicates get made in the first place.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(REPO_ROOT, "src");

/** `UT-PREFIX-NNN`. The prefix is upper-case; the number keeps its written width. */
const ID_RE = /\bUT-([A-Z][A-Z0-9]*)-(\d+)\b/g;

/**
 * A test-block call at the start of a line, with a single-quoted / double-quoted /
 * backticked title. `describe.each([...])("…")` is matched by allowing a bracketed
 * argument list before the title.
 */
const BLOCK_RE =
  /^\s*(describe|it|test)(?:\.(?:only|skip|todo|concurrent|sequential|failing|each))*\s*(?:\([^)]*\)\s*)?\(\s*(["'`])((?:\\.|(?!\2).)*)\2/;

/** The deliberate-cross-reference marker, with its mandatory reason. */
const REF_MARKER = /@ut-ref(\s+\S[^\n]*)?/;

function walk(dir, out = []) {
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

function collect() {
  /** id -> [{ file, line, kind }] for `describe` / `it` / `test` titles. */
  const declarations = new Map();
  /** id -> [{ file, line, text, marker }] for every other occurrence. */
  const citations = new Map();
  const files = walk(SRC);

  for (const file of files) {
    const rel = relative(REPO_ROOT, file);
    const lines = readFileSync(file, "utf8").split("\n");

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      const block = BLOCK_RE.exec(line);

      if (block) {
        const [, kind, , title] = block;
        for (const m of title.matchAll(ID_RE)) {
          const id = m[0];
          if (!declarations.has(id)) declarations.set(id, []);
          declarations.get(id).push({ file: rel, line: i + 1, kind, title });
        }
        // A title line can also carry a trailing comment; ignore it. The id belongs to
        // the title, and double-counting it as a citation of itself proves nothing.
        continue;
      }

      const marker = REF_MARKER.exec(line);
      for (const m of line.matchAll(ID_RE)) {
        const id = m[0];
        if (!citations.has(id)) citations.set(id, []);
        citations.get(id).push({
          file: rel,
          line: i + 1,
          text: line.trim().slice(0, 120),
          marker: marker ? (marker[1] ?? "").trim() : null,
        });
      }
    }
  }

  return { declarations, citations, fileCount: files.length };
}

/** Per prefix: the declared numbers, so the summary can show count / min / max / gaps. */
function byPrefix(declarations) {
  const out = new Map();
  for (const [id, sites] of declarations) {
    const m = /^UT-([A-Z][A-Z0-9]*)-(\d+)$/.exec(id);
    if (!m) continue;
    const [, prefix, digits] = m;
    if (!out.has(prefix)) out.set(prefix, { numbers: new Map(), duplicates: [] });
    const entry = out.get(prefix);
    entry.numbers.set(Number(digits), id);
    if (sites.filter((s) => s.kind !== "describe").length > 1) entry.duplicates.push(id);
  }
  for (const entry of out.values()) {
    const ns = [...entry.numbers.keys()].sort((a, b) => a - b);
    entry.sorted = ns;
    entry.min = ns[0];
    entry.max = ns[ns.length - 1];
    entry.gaps = [];
    for (let n = entry.min; n <= entry.max; n += 1) {
      if (!entry.numbers.has(n)) entry.gaps.push(n);
    }
  }
  return out;
}

function main() {
  if (process.argv.length > 2) {
    throw new Error(`check-test-ids.mjs takes no arguments (got ${process.argv.slice(2).join(" ")})`);
  }

  const { declarations, citations, fileCount } = collect();
  const prefixes = byPrefix(declarations);
  const findings = [];

  /* 1. one id, two `it()`s. */
  for (const [id, sites] of [...declarations].sort(([a], [b]) => a.localeCompare(b))) {
    const tests = sites.filter((s) => s.kind !== "describe");
    if (tests.length > 1) {
      findings.push({
        check: "duplicate-id",
        id,
        where: tests.map((s) => `${s.file}:${s.line}`),
        message:
          `${id} is on ${tests.length} test titles — `
          + tests.map((s) => `${s.file}:${s.line}`).join(", ")
          + `. One id must name one \`it()\`: give the later one the next free number for its prefix`
          + `${prefixes.get(id.split("-")[1])?.gaps.length ? ` (free in this prefix: ${prefixes.get(id.split("-")[1]).gaps.join(", ")})` : ""}.`,
      });
    }
  }

  /* 2. cited but declared nowhere. */
  let exempted = 0;
  for (const [id, sites] of [...citations].sort(([a], [b]) => a.localeCompare(b))) {
    if (declarations.has(id)) continue;
    const marked = sites.filter((s) => s.marker !== null);
    const bare = sites.filter((s) => s.marker === null);
    exempted += marked.length;

    for (const s of marked) {
      if (!s.marker) {
        findings.push({
          check: "ref-without-reason",
          id,
          where: [`${s.file}:${s.line}`],
          message:
            `${s.file}:${s.line} marks ${id} with @ut-ref but gives no reason. `
            + `Write \`@ut-ref <why this id has no it()>\` — an unexplained exemption is `
            + `indistinguishable from a stale comment.`,
        });
      }
    }
    if (bare.length) {
      findings.push({
        check: "phantom-citation",
        id,
        where: bare.map((s) => `${s.file}:${s.line}`),
        message:
          `${id} is cited at ${bare.map((s) => `${s.file}:${s.line}`).join(", ")} but sits on no `
          + `describe/it/test title anywhere under src/. Either repoint the comment at the id that `
          + `now carries the case, or declare it deliberate with \`@ut-ref <reason>\` on the line.`,
      });
    }
  }

  /* 3. gap + duplicate in one prefix = a half-finished renumber. */
  for (const [prefix, entry] of [...prefixes].sort(([a], [b]) => a.localeCompare(b))) {
    if (entry.duplicates.length && entry.gaps.length) {
      findings.push({
        check: "bad-renumber",
        id: `UT-${prefix}`,
        where: [],
        message:
          `UT-${prefix} has both a duplicate (${entry.duplicates.join(", ")}) and a gap `
          + `(${entry.gaps.join(", ")}). That pair is the signature of a renumber that landed a `
          + `test on a taken number and left the vacated one empty — the gap is almost certainly `
          + `the number the duplicate was meant to have.`,
      });
    }
  }

  /* ─────────────────────────────────────────────────────────────────── report ── */

  const declaredOnIt = [...declarations.values()].filter((s) =>
    s.some((x) => x.kind !== "describe"),
  ).length;

  console.log("G-IDS — test-id integrity gate");
  console.log(`  files scanned            ${fileCount} under ${relative(REPO_ROOT, SRC)}/`);
  console.log(`  ids declared             ${declarations.size} (${declaredOnIt} on an it()/test(), ${declarations.size - declaredOnIt} on a describe() only)`);
  console.log(`  ids cited elsewhere      ${citations.size}`);
  console.log(`  @ut-ref exemptions       ${exempted}`);
  console.log("");
  console.log("  prefix        count  min  max  gaps");
  for (const [prefix, entry] of [...prefixes].sort(([a], [b]) => a.localeCompare(b))) {
    console.log(
      `  ${`UT-${prefix}`.padEnd(13)} ${String(entry.numbers.size).padStart(5)}`
      + `${String(entry.min).padStart(5)}${String(entry.max).padStart(5)}  `
      + (entry.gaps.length ? entry.gaps.join(",") : "—"),
    );
  }
  console.log("");

  if (!findings.length) {
    console.log(
      `G-IDS: 0 findings — ${declarations.size} ids, none duplicated, every citation resolves`
      + `${exempted ? ` (${exempted} declared @ut-ref)` : ""}.`,
    );
    process.exit(0);
  }

  for (const f of findings) console.log(`  [${f.check}] ${f.message}`);
  console.log("");
  const counts = {};
  for (const f of findings) counts[f.check] = (counts[f.check] ?? 0) + 1;
  console.log(
    `G-IDS FAIL: ${findings.length} finding${findings.length === 1 ? "" : "s"} — `
    + Object.entries(counts).map(([k, n]) => `${k}: ${n}`).join(", "),
  );
  process.exit(1);
}

try {
  main();
} catch (err) {
  console.error(`check-test-ids.mjs failed: ${err.stack}`);
  process.exit(2);
}
