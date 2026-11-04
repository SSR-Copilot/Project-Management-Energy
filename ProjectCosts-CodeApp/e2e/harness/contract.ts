/**
 * The one-hour parity harness: the shared contract (D80, 3 Nov 2026).
 *
 * Every harness module and every screen's lanes are written against these types. Plan:
 * `ProjectDocs/app-docs/e2e/PARITY-ONE-HOUR-PLAN.md`. Change a type here only together with every user of it.
 *
 * The run, end to end (`e2e/harness/run.mjs`):
 *   phase 1  read lanes, in parallel (one Playwright worker per lane, one page per app per lane)
 *   phase 2  write lanes (after phase 1 on a shared project; beside it when each app has its own sandbox project)
 *   phase 3  the `report` project: offline comparison of the recorded facts, `summary.md` / `summary.json`
 * Facts are recorded per app; nothing compares inside a lane. The Canvas stays the reference.
 */
import type { FrameLocator, Page } from "@playwright/test";
import type { TextFact, TextWindow } from "../lib/texts";

export type Kind = "canvas" | "code";

/** A parity layer (plan section 2). */
export type Layer = "static" | "rules" | "visual" | "ux" | "validation" | "gates" | "flows" | "data" | "platform";

/** Lane ids. A lane is ONE serial Playwright describe on ONE worker, tagged `@<lane>` in its test titles. */
export type ReadLane = "canvas-A" | "canvas-B" | "canvas-C" | "code-A" | "code-B";
export type WriteLane = "write-canvas" | "write-code";
export type Lane = ReadLane | WriteLane;

/** `PARITY_MODE`: `full` records both apps; `compare` records the code app only and compares with the cached Canvas reference. */
export type Mode = "full" | "compare";

/** `PARITY_TIER`: which tests run. `smoke` = code app platform checks only; `read` = phase 1; `full` = phases 1 + 2. */
export type Tier = "smoke" | "read" | "full";

/** Resolved run settings (`env.ts` `runEnv()`). Project ids come ONLY from environment variables, never from a file. */
export interface RunEnv {
  screen: string;              // manifest slug, e.g. "land-lease" (`PARITY_SCREEN`, required: there is no default screen)
  runId: string;               // `PARITY_RUN_ID` (set by run.mjs), e.g. "20261103-1712"
  runDir: string;              // `e2e/runs/<runId>/<screen>` (a batch of screens shares one run id)
  mode: Mode;
  tier: Tier;
  readProjectId: string;       // `PARITY_READ_PROJECT_ID` ("" when unset: a screen without a project needs none)
  writeProjectCanvas: string;  // `PARITY_WRITE_PROJECT_CANVAS`, falling back to readProjectId
  writeProjectCode: string;    // `PARITY_WRITE_PROJECT_CODE`, falling back to readProjectId
  /** True only when both write projects are set and differ from each other and from the read project. */
  writesInParallel: boolean;
  lanes: number;               // `PARITY_LANES`, default 5 (read lanes run at once)
}

/* ───────────────────────────────────────────────────────────── facts ── */

/** One recorded fact file: `<runDir>/facts/<kind>/<layer>/<key>.json`. */
export interface FactFile<T = unknown> {
  screen: string;
  kind: Kind;
  layer: Layer;
  key: string;                 // state / group / flow-step name, kebab-case, stable across runs
  recordedAt: string;          // ISO time
  data: T;
}

/** Layer payloads. */
export type VisualFacts = TextFact[];
export interface ValidationOutcome { messages: string[]; save: boolean }
/** group key -> typed input -> outcome. */
export type ValidationFacts = Record<string, Record<string, ValidationOutcome>>;
/** state name -> command caption -> enabled. */
export type GateFacts = Record<string, Record<string, boolean>>;
/** check name -> any JSON value (focus order, hover text, accessible name list, zoom flags, ...). */
export type UxFacts = Record<string, unknown>;
/** flow step -> table -> normalised rows (ids, audit stamps and the run tag masked). */
export type RowFacts = Record<string, Record<string, Record<string, unknown>[]>>;

/* ─────────────────────────────────────────────────────── the comparison ── */

/** How a difference is classed in the summary (plan section 5). */
export type DiffClass = "new" | "known" | "stale" | "artefact" | "not-captured";

/** One difference. `key` uses the KNOWN key form `<layer>.<key>[<detail>].<property>` (see `lib/known.ts`). */
export interface ClassedDiff {
  key: string;
  layer: Layer;
  cls: DiffClass;
  canvas: unknown;
  code: unknown;
  note?: string;               // the KNOWN reason, or the artefact rule that matched
}

/** A rule that marks a difference as a tool artefact, not an app difference. */
export interface ArtefactRule { id: string; layer: Layer; test: (d: Omit<ClassedDiff, "cls">) => boolean; reason: string }

/** Timing of one test, from the harness reporter (`reporter.ts`) -> `<runDir>/timings.json`. */
export interface TestTiming { lane: string; title: string; status: string; ms: number; retry: number }

export interface LaneSummary { lane: string; tests: number; failed: number; flaky: number; ms: number; budgetMs: number; overBudget: boolean }

/** `<runDir>/summary.json`; `summary.md` is the same, as tables. */
export interface RunSummary {
  screen: string;
  runId: string;
  mode: Mode;
  tier: Tier;
  startedAt: string;
  wallClockMs: number;
  lanes: LaneSummary[];
  counts: Record<DiffClass, number>;
  diffs: ClassedDiff[];
  /** States / groups the manifest lists that one app did not record (e.g. an env var not set). */
  notCaptured: string[];
}

/* ──────────────────────────────────────────────────────────── a screen ── */

/*
 * DYNAMIC SCREENS (user requirement, 3 Nov 2026): the harness is screen-agnostic. A new screen is ONE folder
 * `e2e/screens/<slug>/` holding `manifest.ts` (export const manifest: ScreenManifest), found by `e2e/harness/screens.ts`
 * WITHOUT any registry edit. The generic lanes in `e2e/harness/lanes/*.lane.ts` run every layer from the manifest of
 * `PARITY_SCREEN`; a screen adds its own `e2e/screens/<slug>/*.lane.ts` only for checks no layer can express.
 * Nothing under `e2e/harness/` may import a screen's code or a screen-specific helper (e.g. `lib/leaseFlows.ts`).
 */

/**
 * A control in both apps. `canvas` is the canvas control name (`data-control-name`) or, with `by: "caption"`, its visible text.
 * `code` is the code app's `data-testid`: the whole id (`codeMatch: "exact"`, the default), or, with `codeMatch: "prefix"`, the
 * start of it (`[data-testid^='<code>']`, e.g. "leasecard-" for a repeated card whose id ends in its row), first visible match.
 */
export interface ControlRef { canvas: string; code: string; by?: "name" | "caption"; codeMatch?: "exact" | "prefix" }

/** How the harness opens a screen (`e2e/harness/openers.ts` maps each to the existing helpers). */
export type OpenSpec =
  /** A project-scoped Cost screen: `lib/cost.ts` openCanvasCost(menu) / openCodeCost(route). */
  | { app: "cost"; canvasMenu: string; codeRoute: string }
  /** A project-scoped Project Management screen: the PM canvas app, then its screen; the code app route with ?projectId=. */
  | { app: "pm"; canvasScreen: string; codeRoute: string }
  /** An Application Settings screen (no project): `lib/parity.ts` openCanvas / openCode + openSettingsScreen(leftMenuLabel). */
  | { app: "admin"; leftMenuLabel: string; codeRoute: string }
  /** Anything else: the screen opens itself. `projectId` is null for a screen without a project. */
  | { app: "custom"; projectScoped: boolean; open: (kind: Kind, page: Page, projectId: string | null) => Promise<FrameLocator> };

/**
 * A Dataverse table the screen writes, for the generic data layer (`e2e/harness/data.ts`): row read-back by run tag,
 * cleanup, and the fingerprint. Reads go through the code app's own generated service on the Vite dev server, as
 * `lib/dataverse.ts` does today.
 */
export interface TableSpec {
  name: string;                // short name used in fact keys, e.g. "costs"
  service: string;             // generated service export, e.g. "Vsb_landleaseprojectcostsService"
  serviceModule: string;       // its module path on the dev server, e.g. "/src/generated/services/Vsb_landleaseprojectcostsService.ts"
  entitySet: string;           // for deleteRecord, e.g. "vsb_landleaseprojectcosts"
  primaryKey: string;          // e.g. "vsb_landleaseprojectcostid"
  /** Column that carries the PW-<run> tag on rows this run creates (string column); omit for child rows reached by `parent`. */
  tagColumn?: string;
  /** Child table: reached through a lookup to a parent table's primary key, e.g. { table: "costs", lookup: "_vsb_projectcost_value" }. */
  parent?: { table: string; lookup: string };
  /** Lookup column filtering the table to the project (fingerprint), e.g. "_vsb_project_value". */
  projectLookup?: string;
  /** Columns to leave out of the row comparison (besides ids, audit stamps and the tag, which are always masked). */
  ignoreColumns?: string[];
  /**
   * Columns of the NORMALISED row (`data.ts` normaliseRows: a lookup's name is `_x_value@name`) that order the rows, first
   * column first, so the n-th row of one app is compared with the n-th of the other by meaning, not by masked JSON. Ties, and
   * a table without `sortKey`, fall back to the normalised JSON.
   */
  sortKey?: string[];
  /** Delete order: children first. Lower runs first. */
  deleteOrder: number;
}

/** Which lane runs a layer for each app. Defaults: `DEFAULT_LANES` in `e2e/harness/screens.ts`. */
export type LaneMap = Partial<Record<Layer, { canvas: Lane; code: Lane }>>;

/** What a lane test gets: the app's page and frame, opened ONCE per lane (worker-scoped). */
export interface AppHandle {
  kind: Kind;
  page: Page;
  frame: FrameLocator;
  /** Back to the screen's resting state without a reload (close panels / pop-ups, deselect, fold cards). */
  reset(): Promise<void>;
  /** Reload the screen (after a write, or for the deep-link and refresh checks). */
  reload(): Promise<void>;
}

/**
 * One visual state: steps from the resting state; `needsEnv` names an env var without which the state is skipped. `until`: a
 * control that must show before the state is read (e.g. a panel's Save). The Canvas player shows no busy sign while a
 * command's OnSelect loads data before it opens its panel, so without it the panel can be read before it is there (live run
 * 2, 3 Nov 2026: Land Lease's Edit and Add Period panels).
 */
export interface VisualState { name: string; needsEnv?: string; until?: ControlRef; steps: (app: AppHandle) => Promise<void> }

/** One validation group: a baseline reached once, then every input typed into one field in order. */
export interface ValidationGroup {
  key: string;
  field: string;               // canvas control name; the code app uses the same as its test id unless `codeField` says otherwise
  codeField?: string;
  baseline: (app: AppHandle) => Promise<void>;
  inputs: string[];
}

/** One gates state: steps from rest, then the command states are read. */
export interface GateState { name: string; steps: (app: AppHandle) => Promise<void> }

/** One UX check: returns a JSON value that must be equal in both apps (or match `expect` on the code app only). */
export interface UxCheck { name: string; lane?: ReadLane; run: (app: AppHandle) => Promise<unknown> }

/**
 * What a flow step gets from the flows lane besides the app and its tag:
 *   record  records an extra fact for this app (e.g. a step's gates and prompts as `flows/<flow>.<step>.ui`)
 *   rows    the raw rows of `tag` in the manifest's `tables`, read once (not settled) through the lane's code-app reader page
 */
export interface FlowContext {
  record(layer: Layer, key: string, data: unknown): void;
  rows(tag: string): Promise<Record<string, Record<string, unknown>[]>>;
}

/** One write flow step: acts in one app, then the rows are read back by tag. */
export interface FlowStep { name: string; run: (app: AppHandle, tag: string, ctx: FlowContext) => Promise<void> }
export interface Flow {
  name: string;
  steps: FlowStep[];
  cleanup: (app: AppHandle, tag: string) => Promise<void>;
  /** The flow test's timeout in minutes (default 30, `screens.ts` DEFAULT_FLOW_TIMEOUT_MIN). Cleanup has its own on top. */
  timeoutMin?: number;
}

/** How the validation lane waits after each typed input: `settle` (`waits.ts`) or `stable` (`lib/appFrame.ts` waitForStable, 400 / 10 000 ms). */
/** "outcome": re-read the recorded outcome until three reads agree (the Canvas default since the first live run, 3 Nov 2026). */
export type ValidationWait = "settle" | "stable" | "outcome";

/**
 * A screen's manifest: everything a run needs. Every layer is optional data; the harness supplies generic defaults
 * (`e2e/harness/readers.ts`) so a first manifest can be little more than `open`, `controls` and `visual`.
 */
export interface ScreenManifest {
  slug: string;                       // folder name, kebab-case, e.g. "land-lease"
  title: string;                      // "Land Lease"
  /** The canvas app and its source on disk: e.g. { app: "projectcosts", yaml: "Land Lease Costs Screen.pa.yaml" }. */
  canvasSource: { app: "projectcosts" | "projectmanagement"; yaml: string };
  canvasVersion: string;              // the canvas solution the reference was recorded against, e.g. "1.21.709"
  open: OpenSpec;
  /** Tables the screen writes (data layer, fingerprint, cleanup). Empty for a read-only screen. */
  tables: TableSpec[];
  /** Read once in preflight; a change invalidates the cached Canvas reference. Default: row counts + latest modifiedon of `tables` for the project. */
  fingerprint?: (codePage: Page, projectId: string | null) => Promise<Record<string, number | string>>;
  /** Back to rest without a reload. Default: Escape, then `controls.cancel` if visible, then a reload if `controls.restMarker` is not visible. */
  reset?: (kind: Kind, page: Page, frame: FrameLocator) => Promise<void>;
  /** Named controls the generic readers use. */
  controls: {
    save?: ControlRef;                // the panel's Save (validation layer reads its enabled state)
    cancel?: ControlRef;
    restMarker?: ControlRef;          // a control visible only at rest (reset checks it)
    commands?: Record<string, ControlRef>;   // caption -> control (gates layer reads enabled states)
  };
  /** Every verbatim validation / error message of the screen (generated from the canvas *_ErrorMessage_* labels). */
  messages: string[];
  visual: VisualState[];
  /** The text window of the visual reads (`lib/texts.ts` SHELL_TEXT_WINDOW by default: right of the left menu, below the header). */
  textWindow?: TextWindow;
  /**
   * The visual state the smoke tier opens to check aria-label + data-testid beyond the rest state (E2E-LANDLEASE-003 checked
   * one open card). Default: the first `visual` state.
   */
  smokeState?: string;
  validation: ValidationGroup[];
  /** Default: the visible `messages` (verbatim, sorted) and `controls.save` enabled. */
  readValidation?: (app: AppHandle) => Promise<{ messages: string[]; save: boolean }>;
  /**
   * The wait after each typed validation input. One value for both apps, or per app. Default: "stable" on the Canvas (the old
   * suite's wait: a late message is not read as absent) and "settle" in the code app (`screens.ts` validationWaitFor).
   */
  validationWait?: ValidationWait | Partial<Record<Kind, ValidationWait>>;
  gates: GateState[];
  /** Default: enabled state of every `controls.commands` entry. */
  readGates?: (app: AppHandle) => Promise<Record<string, boolean>>;
  ux: UxCheck[];
  flows: Flow[];
  /** Override which lane runs a layer (default `DEFAULT_LANES`). */
  lanes?: LaneMap;
  /** Accepted differences (`lib/known.ts` form) and tool artefacts for this screen (the harness adds common artefacts). */
  known: Readonly<Record<string, string>>;
  artefacts: ArtefactRule[];
  /** Per-lane wall-clock budgets in minutes (plan section 4); lanes not listed get the harness default. */
  budgets: Partial<Record<Lane, number>>;
  /** Source edits for the mutation proof (`scripts/parity-mutate.mjs`), each an exact replacement found exactly once. */
  mutations?: { id: string; layer: Layer; file: string; find: string; replace: string; expectKey: string /* RegExp source */ }[];
}
