/**
 * The migration plan, as data the code can be checked against.
 *
 * `VSBCloud-Harness-Plan.md` sequences 23 screens in three phases — Admin, then Project
 * Management, then Project Costs — and every screen carries dependencies and an exit gate.
 * A plan that lives only in a document drifts from the tree it describes within a sprint, so
 * it lives here as well, and `src/app/buildPlan.test.ts` asserts the two agree: every entry
 * points at a real feature folder, and every feature folder has an entry.
 *
 * WHY THE ORDER IS WHAT IT IS. All five Project Costs screens and four Project Management
 * screens read tables an admin screen owns. Build the Cost app first and every one of them
 * is developed against fixtures whose shape is a guess. Build the admin screens first and
 * they are developed against master data a person entered through the screen that will
 * maintain it in production. That is the whole argument, and `dependsOn` below is its
 * evidence rather than its restatement.
 *
 * `order` is the recommended BUILD order and is deliberately not the document order:
 * dependencies inside a phase are real. Screens 1 and 6 reference each other's tables and
 * cannot be strictly ordered — they share an `order` and are one unit of work.
 */

export type Phase = 1 | 2 | 3;
export type Band = "XS" | "S" | "M" | "L" | "XL";

export interface ScreenPlan {
  /** Sequence number in the plan document, 1-23. Stable; quote it in tickets. */
  seq: number;
  /** Feature folder under `src/features/{admin,pm,cost}/`. */
  slug: string;
  /** Canvas screen name, exactly as it appears in the `.msapp` source. */
  canvasScreen: string;
  phase: Phase;
  band: Band;
  /** Complexity score from `vsbcloud-screen-complexity-matrix.md`. */
  score: number;
  /** Build-days from the same matrix. */
  days: number;
  /** Power Fx logic blocks of three lines or more. */
  blocks: number;
  /** Recommended build position inside the phase. Equal values run together. */
  order: number;
  /** Screens that must be finished first, by slug. */
  dependsOn: readonly string[];
  /** The measurable thing that closes this screen. */
  exitGate: string;
  /** Built against a screenshot, or inferred from the `.msapp` alone. */
  parity: "screenshot" | "inferred";
  /** Known incompleteness a reader should not have to discover. */
  caveat?: string;
}

const S = (p: ScreenPlan): ScreenPlan => p;

/* ═══════════════════════════════════════════════════ phase 1 — admin screens ════ */

export const PHASE_1: readonly ScreenPlan[] = [
  S({
    seq: 6, slug: "admin-default-checklists",
    canvasScreen: "Admin Project Default Checklists Screen",
    phase: 1, band: "S", score: 11.7, days: 4, blocks: 44, order: 1,
    dependsOn: ["admin-gates-approvals"],
    exitGate:
      "The vertical slice. One screen proves the whole stack end to end: repository read, "
      + "create, update, a privilege refusal from Dataverse, an AppError surfaced in the UI, "
      + "and a telemetry trace. G-SEC passes for this screen's tables before any other "
      + "Phase 1 screen starts.",
    parity: "screenshot",
    caveat:
      "Mutually dependent with admin-gates-approvals: it references Project Default "
      + "Approvals and that screen references Project Default Checklists. One 13-day unit of "
      + "work, one pair of developers, one branch.",
  }),
  S({
    seq: 3, slug: "admin-capex-accounts", canvasScreen: "Admin CAPEX Accounts",
    phase: 1, band: "S", score: 10.8, days: 5, blocks: 68, order: 2,
    dependsOn: [],
    exitGate:
      "Privileges come from the platform, not from a role name: `useCapexPrivileges` calls "
      + "`privileges.forTable` and a grep for `isApplicationAdministrator` in this folder "
      + "returns nothing. A user whose CAPEX Account Lists privilege is revoked loses the "
      + "command, and Dataverse refuses the direct write.",
    parity: "screenshot",
  }),
  S({
    seq: 2, slug: "admin-milestones", canvasScreen: "Admin Milestones Screen",
    phase: 1, band: "S", score: 17.0, days: 7, blocks: 72, order: 3,
    dependsOn: [],
    exitGate:
      "The standard durations this screen writes drive every project's assumed milestone "
      + "dates, so calendar correctness is the gate: `DateAddYears` is calendar-correct and "
      + "the canvas 360-day version is reachable only as `addYears360`.",
    parity: "screenshot",
  }),
  S({
    seq: 1, slug: "admin-gates-approvals",
    canvasScreen: "Admin Project Gates Approvals Screen",
    phase: 1, band: "S", score: 18.2, days: 9, blocks: 89, order: 4,
    dependsOn: ["admin-default-checklists"],
    exitGate:
      "An authenticated user with no VSB admin role is refused by Dataverse on a direct Web "
      + "API write to Project Default Approvals and Check List Default Approvals. Refused by "
      + "the server, with the route guard removed for the test.",
    parity: "screenshot",
  }),
  S({
    seq: 5, slug: "admin-contract", canvasScreen: "Admin Contract Screen",
    phase: 1, band: "M", score: 22.7, days: 9, blocks: 88, order: 4,
    dependsOn: ["admin-capex-accounts"],
    exitGate:
      "Up to ten development and ten construction standard contracts round-trip with their "
      + "DevCo cost children, and the Apply audit row is written or the Apply command is "
      + "removed — not written while the pipeline behind it stays commented out.",
    parity: "screenshot",
  }),
  S({
    seq: 4, slug: "admin-cost", canvasScreen: "Admin Cost Screen",
    phase: 1, band: "M", score: 39.4, days: 21, blocks: 193, order: 5,
    dependsOn: ["admin-capex-accounts"],
    exitGate:
      "The largest screen in Phase 1 and the master-data source for the whole Cost app. "
      + "`useCostPrivileges` answers per table for the DEVEX and OPEX families separately, "
      + "and Dataverse refuses a non-admin write to both assumption tables.",
    parity: "screenshot",
    caveat:
      "21 of Phase 1's 55 days. Bigger than nine of the twelve Project Management screens.",
  }),
];

/* ══════════════════════════════════════ phase 2 — Project Management screens ════ */

export const PHASE_2: readonly ScreenPlan[] = [
  S({ seq: 7, slug: "app-loading", canvasScreen: "App Loading Screen",
    phase: 2, band: "XS", score: 2.0, days: 2, blocks: 10, order: 1, dependsOn: [],
    exitGate:
      "`src/platform/dataClient.test.ts` and `src/platform/bootstrap.test.ts` exist. The "
      + "removal of the canvas launch batching and the `gblAppStarted` to `isSuccess` change "
      + "are unpinned until they do, and both files are at 0 per cent coverage today.",
    parity: "inferred",
    caveat: "No rules module: everything this screen did became routing and bootstrap." }),
  S({ seq: 8, slug: "project-main", canvasScreen: "Project Main Screen",
    phase: 2, band: "S", score: 11.3, days: 5, blocks: 54, order: 2, dependsOn: ["app-loading"],
    exitGate:
      "The create path is reachable and walked: `+ Add Project` reaches the form rather than "
      + "the RequireProject guard, asserted by UT-NAV-015 to 017 and by the scenario walk.",
    parity: "screenshot" }),
  S({ seq: 9, slug: "general-data", canvasScreen: "Project General Data Screen",
    phase: 2, band: "M", score: 34.3, days: 17, blocks: 177, order: 3, dependsOn: ["project-main", "admin-gates-approvals"],
    exitGate: "Every create writes the owning business unit — G-OWN passes for this folder with no baseline entry.",
    parity: "screenshot" }),
  S({ seq: 10, slug: "milestones", canvasScreen: "Project General Milestones Screen",
    phase: 2, band: "M", score: 22.1, days: 11, blocks: 85, order: 4, dependsOn: ["general-data", "admin-milestones"],
    exitGate: "The date chain is calendar-correct and the rail unlocks Generator only once Project Start Date is set.",
    parity: "screenshot" }),
  S({ seq: 15, slug: "generators", canvasScreen: "Project Generators Screen",
    phase: 2, band: "XL", score: 72.7, days: 30, blocks: 359, order: 5, dependsOn: ["milestones"],
    exitGate:
      "The five stub equipment panels write real fields, or the plan records which of them "
      + "ship stubbed. A panel that saves `fields: {}` is not done.",
    parity: "screenshot",
    caveat:
      "Largest UI rebuild in the solution: 642 controls, 33 PCF instances. Five equipment "
      + "panels — inverter, substructure, storage, hydrogen, substation — share one panel that "
      + "saves an empty field set. Rules are complete; the form fields are not." }),
  S({ seq: 16, slug: "production", canvasScreen: "Project Production Screen",
    phase: 2, band: "M", score: 43.8, days: 17, blocks: 150, order: 6, dependsOn: ["generators"],
    exitGate:
      "Every mutation refuses with a 403 before issuing a request, matching grid-operator, "
      + "and Net Yield p50 above zero unlocks the Cluster Check List rail item.",
    parity: "screenshot" }),
  S({ seq: 12, slug: "checklist", canvasScreen: "Project General CheckList Screen",
    phase: 2, band: "M", score: 39.2, days: 14, blocks: 115, order: 7, dependsOn: ["production", "admin-default-checklists", "admin-gates-approvals"],
    exitGate:
      "Every flow the screen calls is registered in FLOW_REGISTER, and an unregistered action "
      + "name cannot be invoked at all. The two-write cancellation is either a custom API or a "
      + "documented reconciliation — not an unguarded pair of writes.",
    parity: "screenshot",
    caveat:
      "First on data complexity: nine tables and four flow calls. `dataClient.batch` is not a "
      + "transactional changeset, so a cancellation can half-apply." }),
  S({ seq: 11, slug: "team", canvasScreen: "Project General Team Screen",
    phase: 2, band: "S", score: 9.7, days: 4, blocks: 29, order: 8, dependsOn: ["general-data"],
    exitGate: "Manager, deputy and members round-trip; the locked-page banner names the missing prerequisite.",
    parity: "screenshot" }),
  S({ seq: 13, slug: "planning", canvasScreen: "Project Planning Screen",
    phase: 2, band: "M", score: 22.8, days: 9, blocks: 84, order: 9, dependsOn: ["general-data"],
    exitGate: "Permits, acquisition and repowering round-trip, and every create binds the owning business unit.",
    parity: "screenshot",
    caveat:
      "There is no YearGrid or PeriodMatrix component anywhere in this repository. The earlier "
      + "plan named one as the largest UI rebuild risk; this screen uses an auto-fit CSS grid "
      + "with DataGrid for the permits sub-grid instead." }),
  S({ seq: 14, slug: "grid-operator", canvasScreen: "Grid Operator Screen",
    phase: 2, band: "XS", score: 6.3, days: 4, blocks: 47, order: 10, dependsOn: ["general-data"],
    exitGate: "Eleven writable columns upsert; the 403 refusal fires before any request. This screen is the reference implementation of a guarded mutation.",
    parity: "inferred" }),
  S({ seq: 17, slug: "revenues", canvasScreen: "Project Revenues Screen",
    phase: 2, band: "L", score: 45.4, days: 23, blocks: 216, order: 11, dependsOn: ["production", "admin-cost"],
    exitGate: "The price fallback matches on year and the divergence from the canvas is asserted both ways.",
    parity: "screenshot" }),
  S({ seq: 18, slug: "finance", canvasScreen: "Project Finance Screen",
    phase: 2, band: "L", score: 62.1, days: 30, blocks: 321, order: 12, dependsOn: ["revenues"],
    exitGate:
      "Opening the screen does not overwrite an existing financing choice, and the canvas "
      + "behaviour is reachable only through `unconditionalDebtFinancingCanvasParity`.",
    parity: "screenshot",
    caveat:
      "Carries the load-bearing documented source defect: the canvas overwrites Debt "
      + "Financing on every visit. The rebuild does not. That is a decision already taken." }),
];

/* ═══════════════════════════════════════════ phase 3 — Project Costs screens ════ */

export const PHASE_3: readonly ScreenPlan[] = [
  S({ seq: 19, slug: "capex-costs", canvasScreen: "Capex Costs Screen",
    phase: 3, band: "XL", score: 70.8, days: 27, blocks: 294, order: 1,
    dependsOn: ["admin-capex-accounts", "admin-cost", "admin-milestones"],
    exitGate:
      "Standard-contract instantiation WRITES. `vsb_CreateCapexStandardContract` exists as a "
      + "custom API and the screen calls it; a computed result that reaches only `setNotice` "
      + "is not done.",
    parity: "screenshot",
    caveat:
      "Densest logic in the solution: 107 blocks of 30 lines or more. Cluster durations pass "
      + "an empty array pending a milestone query." }),
  S({ seq: 20, slug: "contracts", canvasScreen: "Contracts Screen",
    phase: 3, band: "M", score: 32.5, days: 15, blocks: 149, order: 2,
    dependsOn: ["capex-costs", "admin-contract"],
    exitGate: "Delete checks the Delete privilege, `Margin = No` adds nothing, and the numeric regexes are anchored.",
    parity: "screenshot" }),
  S({ seq: 21, slug: "opex-costs", canvasScreen: "Opex Costs Screen",
    phase: 3, band: "M", score: 34.1, days: 13, blocks: 163, order: 3,
    dependsOn: ["capex-costs", "admin-cost"],
    exitGate:
      "Both command bars carry a privilege test — the O&M bar has one only on Add Period "
      + "today, and Add Standard Contract has none on either. Layout is DECLARED inferred, "
      + "not claimed as parity.",
    parity: "inferred",
    caveat: "Built from the .msapp alone: no screen recording exists, so visual parity cannot be demonstrated." }),
  S({ seq: 22, slug: "land-lease", canvasScreen: "Land Lease Costs Screen",
    phase: 3, band: "S", score: 18.6, days: 12, blocks: 156, order: 4,
    dependsOn: ["capex-costs", "admin-cost"],
    exitGate: "Period 9 refuses to wrap instead of silently creating a duplicate, with both halves asserted.",
    parity: "inferred",
    caveat: "Built from the .msapp alone: no screen recording exists." }),
  S({ seq: 23, slug: "add-costs-from-table", canvasScreen: "Add Costs from Table",
    phase: 3, band: "XS", score: 0.3, days: 4, blocks: 9, order: 5,
    dependsOn: ["capex-costs"],
    exitGate:
      "No timer polls for changes: a grep for `setInterval`, `setTimeout`, `ParseJSON` and "
      + "`jsonData` in this folder returns nothing.",
    parity: "inferred",
    caveat:
      "The canvas drives this screen from ONE 1,150-line `OnTimerEnd` formula of about 46 KB, "
      + "polling a timer to detect spreadsheet changes. Also inferred: no recording." }),
];

/* ═══════════════════════════════════════════════════════════════════ the plan ════ */

export const BUILD_PLAN: readonly ScreenPlan[] = [...PHASE_1, ...PHASE_2, ...PHASE_3];

/** Which parent folder a phase lives in. */
export const PHASE_DIR: Readonly<Record<Phase, "admin" | "pm" | "cost">> = {
  1: "admin", 2: "pm", 3: "cost",
};

export const PHASE_NAME: Readonly<Record<Phase, string>> = {
  1: "Admin",
  2: "Project Management",
  3: "Project Costs",
};

export const screensInPhase = (p: Phase): readonly ScreenPlan[] =>
  BUILD_PLAN.filter((s) => s.phase === p).slice().sort((a, b) => a.order - b.order || a.seq - b.seq);

export const screenBySlug = (slug: string): ScreenPlan | undefined =>
  BUILD_PLAN.find((s) => s.slug === slug);

/** Feature-folder path for a planned screen, e.g. `admin/admin-cost`. */
export const featurePath = (s: ScreenPlan): string => `${PHASE_DIR[s.phase]}/${s.slug}`;

export const phaseDays = (p: Phase): number =>
  BUILD_PLAN.filter((s) => s.phase === p).reduce((n, s) => n + s.days, 0);

export const TOTAL_DAYS: number = BUILD_PLAN.reduce((n, s) => n + s.days, 0);

/** Screens whose layout is inferred from the `.msapp` because no recording exists. */
export const INFERRED_SCREENS: readonly ScreenPlan[] = BUILD_PLAN.filter(
  (s) => s.parity === "inferred",
);
