/**
 * The CAPEX cluster timeline and the year window.
 *
 * Stage 2.1. Replaces the six hard-coded dates that `rules.ts` carried as `CLUSTER_DATES` and
 * the fixed 2015–2030 stepper.
 *
 * `gblClusterDurations` in `OnStart.txt` builds six clusters by chaining the project's own
 * milestone columns — there is no milestones table involved:
 *
 *     C1  1-Feasibility studies          -> 2-Project development started
 *     C2  2-Project development started  -> 3-Application submitted
 *     C3  3-Application submitted        -> 4-Legally binding permits
 *     C4  4-Legally binding permits      -> 5-Construction
 *     C5  5-Construction                 -> Operations start date (COD)
 *     C6  Operations start date (COD)    -> End Date
 *
 * Real projects have gaps in that chain, so every function here treats a missing date as
 * "unknown" rather than as a zero — a cluster with no boundary is simply absent, and the year
 * window falls back to the project's own dates.
 *
 * The gaps are not all irreducible, though. A project ACQUIRED at a cluster beyond Greenfield
 * never had the earlier milestones, and for those the canvas back-computes dates from
 * `Milestones Standard Assumptions` — see `synthesiseClusterDates` below, which produces a
 * `ProjectMilestones` for `clusterDurations` and `clusterBoundaries` to consume unchanged.
 */
import type { ProjectContext, ProjectMilestones } from "../contracts/rules";

/**
 * Dataverse stores "no date" as a year-1 sentinel in places, and the canvas guards against it
 * with `Year(x) > 1900`. A date below this is treated as absent.
 */
export const SENTINEL_YEAR = 1900;

export interface ClusterDuration {
  order: number;
  name: string;
  startYear: number;
  startMonth: number;
  endYear: number;
  endMonth: number;
}

const live = (d: Date | undefined): d is Date =>
  d !== undefined && !Number.isNaN(d.getTime()) && d.getFullYear() > SENTINEL_YEAR;

/**
 * The six clusters, in order.
 *
 * A cluster is emitted only when BOTH its boundaries are known — a half-open cluster has no
 * meaningful span, and the canvas' `Month()`/`Year()` of a blank date yields 0, which would put
 * a cost in year 0. Callers therefore cannot assume six rows, or contiguous `order` values.
 *
 * Pass `synthesiseClusterDates(project, durations)` rather than `project.milestones` to fill the
 * gaps an acquired project has before the cluster it was bought at.
 */
export function clusterDurations(milestones: ProjectMilestones | undefined): ClusterDuration[] {
  if (!milestones) return [];
  const chain: [Date | undefined, Date | undefined][] = [
    [milestones.feasibilityStudies, milestones.developmentStarted],
    [milestones.developmentStarted, milestones.applicationSubmitted],
    [milestones.applicationSubmitted, milestones.legallyBindingPermits],
    [milestones.legallyBindingPermits, milestones.construction],
    [milestones.construction, milestones.operationsStartCod],
    [milestones.operationsStartCod, milestones.endDate],
  ];
  const out: ClusterDuration[] = [];
  chain.forEach(([from, to], i) => {
    if (!live(from) || !live(to)) return;
    out.push({
      order: i + 1,
      name: `Cluster ${i + 1}`,
      startYear: from.getFullYear(), startMonth: from.getMonth() + 1,
      endYear: to.getFullYear(), endMonth: to.getMonth() + 1,
    });
  });
  return out;
}

/**
 * The boundary dates the Add/Edit panel distributes across, as `YYYY-MM-DD`.
 *
 * Seven entries for six clusters — cluster `n` runs from index `n-1` to index `n`. A cluster the
 * project has no dates for yields `undefined` at its boundary, and the panel skips it.
 */
export function clusterBoundaries(
  milestones: ProjectMilestones | undefined,
): (string | undefined)[] {
  const iso = (d: Date | undefined) =>
    live(d) ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01` : undefined;
  return [
    iso(milestones?.feasibilityStudies),
    iso(milestones?.developmentStarted),
    iso(milestones?.applicationSubmitted),
    iso(milestones?.legallyBindingPermits),
    iso(milestones?.construction),
    iso(milestones?.operationsStartCod),
    iso(milestones?.endDate),
  ];
}

/**
 * `locCostAllowedStartYear` — the first year a cost may be booked in.
 *
 * January of the acquisition date when the project started at a cluster beyond Greenfield,
 * otherwise January of the project start date. Falls back through both, then to today, and
 * ignores the year-1 sentinel.
 */
export function costAllowedStart(
  project: Pick<ProjectContext, "acquisitionDate" | "startDate">,
  startClusterNo = 0,
  today: Date = new Date(),
): { year: number; date: Date } {
  const preferred = startClusterNo > 0 ? project.acquisitionDate : project.startDate;
  const base = [preferred, project.acquisitionDate, project.startDate].find(live) ?? today;
  const raw = base.getFullYear();
  const year = raw > SENTINEL_YEAR ? raw : today.getFullYear();
  return { year, date: new Date(year, 0, 1) };
}

/**
 * The year range the stepper may move through.
 *
 * Widest of everything known: the earliest of acquisition, the cluster starts and the
 * cost-allowed start; the latest of COD, the end date, the cluster ends and whatever year is
 * currently selected — so a cost already booked outside the window stays reachable.
 */
export function navigationWindow(
  project: Pick<ProjectContext, "acquisitionDate" | "endDate" | "milestones">,
  clusters: readonly ClusterDuration[],
  costAllowedStartYear: number,
  selectedYear: number | null,
  today: Date = new Date(),
): { min: number; max: number } {
  const usable = (n: number | null | undefined): n is number =>
    typeof n === "number" && Number.isFinite(n) && n > SENTINEL_YEAR;

  const acquisitionDate = project.acquisitionDate;
  const codDate = project.milestones?.operationsStartCod;
  const endDate = project.endDate;
  const acquisitionYear = live(acquisitionDate) ? acquisitionDate.getFullYear() : null;
  const codYear = live(codDate) ? codDate.getFullYear() : null;
  const endYear = live(endDate) ? endDate.getFullYear() : null;

  const mins = [acquisitionYear, ...clusters.map((c) => c.startYear), costAllowedStartYear]
    .filter(usable);
  const maxes = [codYear, endYear, ...clusters.map((c) => c.endYear), selectedYear]
    .filter(usable);

  const min = mins.length > 0 ? Math.min(...mins) : today.getFullYear();
  const max = maxes.length > 0 ? Math.max(...maxes) : today.getFullYear();
  // A window can never be inverted, however odd the data.
  return { min, max: Math.max(min, max) };
}

/* ═══════════════════════════════════════════ synthesised cluster dates ══ */

/**
 * One `Milestones Standard Assumptions` row, `Name = "average duration [months]"`.
 *
 * `vsb_cluster1..5` and `vsb_finalinvestmentdecision`, all decimals, all in MONTHS. The row is
 * chosen by Country + Technology; there is one per pair.
 *
 * MEASURED, 16 Sep, VSBCloud_Dev — Germany/Wind (`94cd9dcb-8123-ef11-840a-000d3aab6b54`):
 * `cluster1: 17, cluster2: 18, cluster3: 30, cluster4: 6, cluster5: 12,
 * finalInvestmentDecision: 12`. 19 such rows exist, covering DE/IT/PL/ES/FR/FI/HR/GR/RO across
 * Wind/PV/BESS.
 */
export interface MilestoneDurations {
  cluster1: number;
  cluster2: number;
  cluster3: number;
  cluster4: number;
  cluster5: number;
  finalInvestmentDecision: number;
}

/**
 * How many months each STEP of the cluster chain takes, 1→2 … 5→6.
 *
 * Read off the canvas' back-computation rather than assumed: `varC1Date` for a project starting
 * at cluster 6 is `varStartReferenceDate - (d5 + dFID + d4 + d3 + d2 + d1)`, and peeling one
 * cluster off at a time (`CapexScreenCode.txt:18210-18356`) gives
 *
 *     1→2 = d1 · 2→3 = d2 · 3→4 = d3 · 4→5 = d4 + dFID · 5→6 = d5
 *
 * The Final Investment Decision sits INSIDE the 4→5 step — it is not a cluster of its own, which
 * is why there are six duration columns for five steps. `Coalesce(…, 0)` on each, as the canvas
 * does, so a row missing a column contributes nothing rather than blanking the whole chain.
 */
function chainSteps(d: MilestoneDurations | undefined): number[] {
  const n = (value: number | undefined | null) =>
    typeof value === "number" && Number.isFinite(value) ? value : 0;
  return d
    ? [n(d.cluster1), n(d.cluster2), n(d.cluster3), n(d.cluster4) + n(d.finalInvestmentDecision), n(d.cluster5)]
    : [0, 0, 0, 0, 0];
}

/** `DateAdd(date, -months, TimeUnit.Months)` — the day clamps to the target month's length. */
function minusMonths(date: Date, months: number): Date {
  const day = date.getDate();
  const shifted = new Date(date.getFullYear(), date.getMonth() - Math.round(months), 1);
  const lastDay = new Date(shifted.getFullYear(), shifted.getMonth() + 1, 0).getDate();
  shifted.setDate(Math.min(day, lastDay));
  return shifted;
}

/**
 * `varStartReferenceDate` — the one date the whole back-computation hangs off.
 *
 * `CapexScreenCode.txt:18142-18178`: the milestone of the cluster the project was ACQUIRED at,
 * falling back to the acquisition date; for a Greenfield project (cluster 0) the project start
 * date, falling back to the acquisition date. Every arm is a `Coalesce(milestone, 'Acquisition
 * date')`, so a project bought at cluster 3 with no "3-Application submitted" on the row still
 * has a reference point.
 */
function startReferenceDate(
  project: Pick<ProjectContext, "acquisitionDate" | "startDate" | "milestones">,
  startClusterNo: number,
): Date | undefined {
  const m = project.milestones;
  const own = [
    project.startDate, // 0 — Greenfield: 'Project Start Date'
    m?.feasibilityStudies,
    m?.developmentStarted,
    m?.applicationSubmitted,
    m?.legallyBindingPermits,
    m?.construction,
    m?.operationsStartCod,
  ][startClusterNo];
  return [own, project.acquisitionDate].find(live);
}

/**
 * The project's milestone chain with clusters 1–4 BACK-COMPUTED when the project started beyond
 * Greenfield — `CapexScreenCode.txt:18208-18356`, the `With({varC1Date … varC6Date})` block.
 *
 * A project acquired at, say, cluster 3 has no "1-Feasibility studies" or "2-Project development
 * started" on its row, so `clusterDurations` emits neither cluster 1 nor cluster 2 and they
 * disappear from the cluster picker, from `navigationWindow` and from `buildStandardOptions`.
 * The canvas does not leave them missing: it walks BACKWARDS from the start reference date with
 * `DateAdd(varStartReferenceDate, -(d1 + d2 + …), TimeUnit.Months)` over the country's and
 * technology's average durations.
 *
 * Per target cluster, transcribed rather than generalised into a single rule, because the four
 * are not written identically in the source:
 *
 *   n = 0 (Greenfield)  every cluster keeps the project's own milestone. No synthesis at all.
 *   n > c               `ref - offset(c, n)`, the sum of the chain steps between them.
 *   n = c               `varStartReferenceDate` … EXCEPT for cluster 1, see below.
 *   n < c               the project's own milestone — the project has reached it for real.
 *
 * CLUSTER 1 AT n = 1 IS THE ODD ONE. `varC1Date`'s final branch is a bare
 * `gblSelectedProject.'1-Feasibility studies'` (`:18248`), where `varC2Date`…`varC4Date` each end
 * in `If(varStartClusterNo = N, varStartReferenceDate, milestone)`. The two differ only when the
 * milestone is blank: a project acquired at cluster 1 with no feasibility date gets a BLANK
 * cluster 1 from the canvas, not its acquisition date. Reproduced.
 *
 * CLUSTERS 5 AND 6 ARE NEVER SYNTHESISED. The source says so in as many words —
 * "Cluster 5 should not be calculated from standard assumptions. Use actual project value only."
 * (`:18344`) and the same for cluster 6 / COD (`:18351`) — so both are only
 * `If(varStartClusterNo = N, varStartReferenceDate, milestone)`, no arithmetic. `endDate` is not
 * in the canvas block at all and passes through untouched.
 *
 * WITH NO MATCHING ASSUMPTION ROW the canvas' `d1…d5`/`dFID` all coalesce to 0, every `DateAdd`
 * shifts by nothing, and clusters 1..n collapse onto the start reference date — zero-length but
 * PRESENT, where before they were absent. That is the canvas' behaviour, not a fallback chosen
 * here, and it is why `durations` is optional.
 */
export function synthesiseClusterDates(
  project: Pick<
    ProjectContext, "acquisitionDate" | "startDate" | "endDate" | "milestones" | "startClusterNo"
  >,
  durations?: MilestoneDurations,
): ProjectMilestones {
  const m = project.milestones ?? {};
  const raw = project.startClusterNo ?? 0;
  const n = Number.isInteger(raw) && raw >= 0 && raw <= 6 ? raw : 0;
  if (n === 0) return { ...m, endDate: m.endDate ?? project.endDate };

  const ref = startReferenceDate(project, n);
  const steps = chainSteps(durations);
  /** The months between cluster `c` and cluster `n`, `n > c`. */
  const offset = (c: number) => steps.slice(c - 1, n - 1).reduce((a, b) => a + b, 0);

  const own: (Date | undefined)[] = [
    undefined,
    m.feasibilityStudies, m.developmentStarted, m.applicationSubmitted,
    m.legallyBindingPermits, m.construction, m.operationsStartCod,
  ];

  const at = (c: number): Date | undefined => {
    // Clusters 5 and 6: no arithmetic, ever.
    if (c > 4) return n === c ? ref : own[c];
    if (n > c) return ref ? minusMonths(ref, offset(c)) : undefined;
    // `varC1Date`'s last branch is the milestone, not the reference date. See the doc comment.
    if (n === c) return c === 1 ? own[1] : ref;
    return own[c];
  };

  return {
    feasibilityStudies: at(1),
    developmentStarted: at(2),
    applicationSubmitted: at(3),
    legallyBindingPermits: at(4),
    construction: at(5),
    operationsStartCod: at(6),
    endDate: m.endDate ?? project.endDate,
  };
}

export const clampSelectedYear = (year: number, min: number, max: number): number =>
  Math.min(Math.max(year, min), max);

export const canGoPreviousYear = (selected: number, min: number): boolean => selected > min;
export const canGoNextYear = (selected: number, max: number): boolean => selected < max;

/** Every year in the window, for the stepper's dropdown. */
export function projectPeriods(min: number, max: number): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max < min) return [];
  return Array.from({ length: max - min + 1 }, (_, i) => min + i);
}
