/**
 * The parity harness: run settings from the environment (D80, contract `RunEnv`). Screen-agnostic: nothing here knows a
 * screen; the screen is a slug, and whether it needs a project comes from its manifest's `open` (`requireProjectId`).
 *
 *   PARITY_SCREEN                 manifest slug (`e2e/screens/<slug>/`)  REQUIRED: there is no default screen; unset, the
 *                                                                        error lists the screens on disk (`screenRequired`)
 *   PARITY_MODE                   full | compare                         default full
 *   PARITY_TIER                   smoke | read | full                    default full
 *   PARITY_LANES                  read lanes run at once (1..20)         default 5
 *   PARITY_RUN_ID                 run id (run.mjs sets it). Unset: `e2e/runs/latest.json` {runId}; missing too: a new
 *                                 local-time id YYYYMMDD-HHmm, written to `e2e/runs/latest.json` so every worker agrees
 *   PARITY_READ_PROJECT_ID        the read project (never written). Required only for a project-scoped screen
 *                                 (`requireProjectId`); an Application Settings screen runs without it. The old Land Lease
 *                                 specs' LANDLEASE_PROJECT_ID is NOT read here: the harness has no screen-named variable
 *   PARITY_WRITE_PROJECT_CANVAS   the Canvas write sandbox; falls back to the read project
 *   PARITY_WRITE_PROJECT_CODE     the code app write sandbox; falls back to the read project
 *
 * Run folder: `e2e/runs/<runId>/<screen>/`, one folder per screen, so a multi-screen batch (`--screen a,b`) shares one run id.
 *
 * Project ids come ONLY from these variables and are never written to a file, and never echoed in an error message
 * (error messages end up in reports). `resolveRunEnv` is the pure, testable part; `runEnv()` binds it to `process.env`
 * and the repo root.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Kind, Lane, Mode, OpenSpec, RunEnv, ScreenManifest, Tier } from "./contract";

/** The code repo root: the directory holding `playwright.config.ts` (walked up from this file; `../..` as a fallback). */
export const REPO_ROOT: string = (() => {
  const here = dirname(fileURLToPath(import.meta.url));
  for (let d = here, i = 0; i < 6; i++, d = dirname(d)) {
    if (existsSync(join(d, "playwright.config.ts"))) return d;
  }
  return resolve(here, "..", "..");
})();

export const LANES: readonly Lane[] = ["canvas-A", "canvas-B", "canvas-C", "code-A", "code-B", "write-canvas", "write-code"];
const MODES: readonly Mode[] = ["full", "compare"];
const TIERS: readonly Tier[] = ["smoke", "read", "full"];

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** A run id becomes a directory name: letters, digits, dot, dash and underscore only, no leading dot. */
const RUN_ID = /^[A-Za-z0-9_-][A-Za-z0-9._-]{0,63}$/;
const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;

type Vars = Readonly<Record<string, string | undefined>>;

/* ──────────────────────────────────────────────────────────── screens ── */

/** `e2e/screens/`, the one place screens live (`screens.ts` re-exports it). */
export const SCREENS_DIR = join(REPO_ROOT, "e2e", "screens");

/**
 * The screen slugs: every folder of `dir` (default `e2e/screens`) that holds a `manifest.ts`, sorted. Here, not in
 * `screens.ts`, so `resolveRunEnv` can name them without an import cycle; `screens.ts` re-exports it.
 */
export function listScreens(dir: string = SCREENS_DIR): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && SLUG.test(d.name) && existsSync(join(dir, d.name, "manifest.ts")))
    .map((d) => d.name)
    .sort();
}

/**
 * The error text when no screen is selected: there is no default screen (a run is always about a screen someone chose).
 * `runPlan.mjs` screenRequiredMessage words the same rule for `--screen` (pinned together by UT-PHRUN-025).
 */
export function screenRequired(available: readonly string[]): string {
  return `set PARITY_SCREEN to one of: ${available.length ? available.join(", ") : "(no e2e/screens/<slug>/manifest.ts yet)"}`;
}

/** A trimmed variable, or undefined when unset or blank. */
const read = (vars: Vars, name: string): string | undefined => {
  const v = vars[name]?.trim();
  return v ? v : undefined;
};

function oneOf<T extends string>(vars: Vars, name: string, allowed: readonly T[], fallback: T): T {
  const v = read(vars, name);
  if (v === undefined) return fallback;
  if (!(allowed as readonly string[]).includes(v)) throw new Error(`${name} must be one of ${allowed.join(" | ")} (got "${v}")`);
  return v as T;
}

/** A project id from `name`; throws naming the variable (not the value) when it is not a GUID. */
function projectId(vars: Vars, name: string): string | undefined {
  const v = read(vars, name);
  if (v !== undefined && !GUID.test(v)) throw new Error(`${name} is set but is not a GUID`);
  return v?.toLowerCase();
}

/** Local time as YYYYMMDD-HHmm (the run id form). */
export function newRunId(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}`;
}

/**
 * The run id: `PARITY_RUN_ID`, else `<root>/e2e/runs/latest.json`, else a new one written there. The new file is created
 * exclusively (`wx`), so two workers that start together without a run id end up with the same one: the loser reads the
 * winner's file. `run.mjs` always sets `PARITY_RUN_ID`, so the file matters only for a lane started by hand.
 */
export function resolveRunId(vars: Vars, root: string, now: Date = new Date()): string {
  const given = read(vars, "PARITY_RUN_ID");
  if (given !== undefined) {
    if (!RUN_ID.test(given)) throw new Error(`PARITY_RUN_ID must match ${RUN_ID} (got "${given}")`);
    return given;
  }
  const latest = join(root, "e2e", "runs", "latest.json");
  const fromFile = (): string | undefined => {
    try {
      const id = (JSON.parse(readFileSync(latest, "utf8")) as { runId?: unknown }).runId;
      return typeof id === "string" && RUN_ID.test(id) ? id : undefined;
    } catch {
      return undefined; // missing or malformed: treated as missing
    }
  };
  const existing = fromFile();
  if (existing !== undefined) return existing;
  const id = newRunId(now);
  mkdirSync(dirname(latest), { recursive: true });
  const body = `${JSON.stringify({ runId: id }, null, 2)}\n`;
  try {
    writeFileSync(latest, body, { flag: existsSync(latest) ? "w" : "wx" });
  } catch (e) {
    // Another worker created it between our read and our write: use its id.
    if ((e as NodeJS.ErrnoException).code === "EEXIST") return fromFile() ?? id;
    throw e;
  }
  return id;
}

/** The pure part of `runEnv()`: settings from `vars`, run directory under `root`. */
export function resolveRunEnv(vars: Vars, root: string, now: Date = new Date()): RunEnv {
  const screen = read(vars, "PARITY_SCREEN");
  if (screen === undefined) throw new Error(screenRequired(listScreens(join(root, "e2e", "screens"))));
  if (!SLUG.test(screen)) throw new Error(`PARITY_SCREEN must be a lower-case slug such as "land-lease" (got "${screen}")`);
  const mode = oneOf(vars, "PARITY_MODE", MODES, "full");
  const tier = oneOf(vars, "PARITY_TIER", TIERS, "full");

  const lanesRaw = read(vars, "PARITY_LANES");
  const lanes = lanesRaw === undefined ? 5 : Number(lanesRaw);
  if (!Number.isInteger(lanes) || lanes < 1 || lanes > 20) throw new Error(`PARITY_LANES must be a whole number from 1 to 20 (got "${lanesRaw}")`);

  // "" when unset: a screen without a project needs none; `requireProjectId` enforces it for a project-scoped screen.
  const readProjectId = projectId(vars, "PARITY_READ_PROJECT_ID") ?? "";
  const canvasW = projectId(vars, "PARITY_WRITE_PROJECT_CANVAS");
  const codeW = projectId(vars, "PARITY_WRITE_PROJECT_CODE");
  const writesInParallel = canvasW !== undefined && codeW !== undefined
    && canvasW !== codeW && canvasW !== readProjectId && codeW !== readProjectId;

  const runId = resolveRunId(vars, root, now);
  return {
    screen,
    runId,
    runDir: join(root, "e2e", "runs", runId, screen),
    mode,
    tier,
    readProjectId,
    writeProjectCanvas: canvasW ?? readProjectId,
    writeProjectCode: codeW ?? readProjectId,
    writesInParallel,
    lanes,
  };
}

/** The run settings for this process (contract `RunEnv`). Throws with a clear message when a variable is wrong. */
export function runEnv(): RunEnv {
  return resolveRunEnv(process.env, REPO_ROOT);
}

/**
 * Whether a screen opened this way needs a project: `cost` and `pm` do, `admin` does not, `custom` says so itself.
 * Pure, so it is testable without a browser; `openers.ts` `isProjectScoped(manifest)` should answer the same.
 */
export function opensWithProject(open: OpenSpec): boolean {
  switch (open.app) {
    case "cost":
    case "pm":
      return true;
    case "admin":
      return false;
    case "custom":
      return open.projectScoped;
  }
}

/** Which project a lane opens: the read project, or one app's write project. */
export type ProjectTarget = "read" | "write";

/**
 * The project id a lane opens the screen with, or null for a screen without a project. Throws naming the variables to set
 * (never a value) when a project-scoped screen has none. `kind` picks the write project for `target` "write".
 */
export function requireProjectId(
  env: RunEnv, manifest: Pick<ScreenManifest, "slug" | "open">, target: ProjectTarget, kind?: Kind,
): string | null {
  if (!opensWithProject(manifest.open)) return null;
  if (target === "read") {
    if (env.readProjectId) return env.readProjectId;
    throw new Error(`Screen "${manifest.slug}" is project-scoped: set PARITY_READ_PROJECT_ID to the read project's GUID`);
  }
  if (kind === undefined) throw new Error(`requireProjectId: target "write" needs the app kind (canvas or code)`);
  const id = kind === "canvas" ? env.writeProjectCanvas : env.writeProjectCode;
  if (id) return id;
  const own = kind === "canvas" ? "PARITY_WRITE_PROJECT_CANVAS" : "PARITY_WRITE_PROJECT_CODE";
  throw new Error(`Screen "${manifest.slug}" is project-scoped: set ${own}, or PARITY_READ_PROJECT_ID, to a project GUID for the ${kind} write lane`);
}

/**
 * The lane a test belongs to, from its `@<lane>` tag (in a title, a title path joined with spaces, or a tag list joined).
 * `@code-A` matches; `@code-Ab` and `email@code-A.x`-like text without a word boundary before `@` do not.
 */
export function laneOfTitle(title: string): Lane | undefined {
  const m = /(?:^|[\s([{,;])@(canvas-[ABC]|code-[AB]|write-canvas|write-code)(?![\w-])/.exec(title);
  return m ? (m[1] as Lane) : undefined;
}

/** The lane of a Playwright test: its `@<lane>` tag in the title path or the `tag` option, else the project name. */
export function laneOf(info: { titlePath: readonly string[]; tags?: readonly string[]; project: { name: string } }): string {
  return laneOfTitle([...info.titlePath, ...(info.tags ?? [])].join(" ")) ?? info.project.name;
}

/**
 * "lane <lane> over budget: <m> of <b> min" when `elapsedMs` is past the lane's budget plus 20 % (plan section 4), else null.
 * A budget that is not a positive number never stops a lane.
 */
export function overBudget(lane: string, elapsedMs: number, budgetMin: number): string | null {
  const m = elapsedMs / 60_000;
  if (!(budgetMin > 0) || m <= budgetMin * 1.2) return null;
  return `lane ${lane} over budget: ${m.toFixed(1)} of ${budgetMin} min`;
}
