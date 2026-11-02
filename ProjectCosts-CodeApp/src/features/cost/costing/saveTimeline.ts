/**
 * P0.1 — the Add Cost from Table Save's CLIENT timeline. Measurement only: nothing here changes
 * what the Save sends, when, or what the screen shows.
 *
 * The bulk save's own line (`saveAddCostSheetBulk`, D59) times the NETWORK side, from the moment
 * the data layer starts to its return. What it cannot see is the client work around it: the click
 * to the first request, and the Save's return to the DEVEX/CAPEX grid painting the saved state. This
 * module records those points and prints ONE line once the grid has painted (D59 style, through
 * `emitSaveLog`), for example
 *   `Add Cost from Table client: click→first request 9 ms (prepare 4.2 ms, then 4.8 ms), first
 *    request→resolved 1,607 ms, resolve→CAPEX painted 180 ms (onSuccess 8.1 ms, patch 6.0 ms,
 *    navigate→paint 171 ms); prepare log 12.0 ms, after the first request`
 * plus a collapsed "Client timeline" group with the steps table.
 *
 * THE POINTS (all `performance.now()`, the first mark of each wins):
 *  - `click`      `doSave` started (the Save button's handler);
 *  - `prepared`   `prepareSheetSave` returned;
 *  - `firstWrite` the save's first upsert started (`saveAddCostSheetBulk`'s `upsert`; the request
 *                 leaves in the same task, no timer in between). A delete-only Save, the legacy
 *                 path (`BULK_SAVE = false`) or a failure before any upsert leaves it unset;
 *  - `resolved`   the hook's `onSuccess` began (the data layer resolved);
 *  - `returned`   `mutateAsync` resolved in the screen (after `onSuccess`);
 *  - `navigated`  the screen called `navigate` back to DEVEX/CAPEX;
 *  - `painted`    the first frame after the DEVEX/CAPEX grid rendered the book
 *                 (`capexShown`: one animation frame, then one task);
 *  - `prepareLog` the deferred prepare log started printing (WS-E, `deferSaveLog`).
 *
 * WHEN IT PRINTS (decided here, P0.1): after the paint; after `PAINT_TIMEOUT_MS` when the grid does
 * not paint (an error state, the user went elsewhere), with `not painted within …`; at once when the
 * screen stays on the sheet (`blockedByPastCosts`), without the paint part; at once on a failed
 * Save, with `failed`. A refused Save that sent nothing (the round-trip check) prints nothing: the
 * prepare line already says why. A new click while one waits prints the old one as `superseded`.
 *
 * NEVER THROWS. Every entry point swallows its own errors: a broken clock, timer or console must not
 * turn a Save into a failure. The only module state is the one timeline in flight (two Saves never
 * overlap: the button is disabled while one runs, CA-15).
 */
import { formatMs } from "@/data/bulkSend";
import { emitSaveLog, stepsSection, type SaveLogReport, type SaveLogStep } from "@/data/saveLog";

export type TimelinePoint =
  | "click" | "prepared" | "firstWrite" | "resolved" | "returned" | "navigated" | "painted" | "prepareLog";
export type TimelineDuration = "prepareMs" | "prepareLogMs" | "patchMs" | "onSuccessMs";
/** How the timeline ended (see "WHEN IT PRINTS"). */
export type TimelineEnd = "painted" | "paintTimeout" | "stayed" | "failed" | "superseded";

export interface ClientTimeline {
  points: Partial<Record<TimelinePoint, number>>;
  durations: Partial<Record<TimelineDuration, number>>;
  end: TimelineEnd;
}

/**
 * How long after the navigation the timeline waits for the DEVEX/CAPEX grid to paint before it
 * prints without it. Long enough for a cold CAPEX load (no cached book: 1–3 s on DEV, D51 §11.19),
 * short enough that the line still comes while the user looks at the console.
 */
export const PAINT_TIMEOUT_MS = 10_000;

/* ═════════════════════════════════════════════════════════════ pure ══ */

const d1 = (ms: number) => formatMs(ms, 1);
const span = (t: ClientTimeline, from: TimelinePoint, to: TimelinePoint): number | undefined => {
  const a = t.points[from];
  const b = t.points[to];
  return a === undefined || b === undefined ? undefined : b - a;
};

/** `(prepare 4.2 ms, then 4.8 ms)` — the client work up to the first request. */
function sendPart(t: ClientTimeline): string {
  const toFirst = span(t, "click", "firstWrite");
  const prepare = t.durations.prepareMs;
  const after = span(t, "prepared", "firstWrite");
  const detail = [
    ...(prepare === undefined ? [] : [`prepare ${d1(prepare)}`]),
    ...(after === undefined ? [] : [`then ${d1(after)}`]),
  ].join(", ");
  if (toFirst !== undefined) return `click→first request ${formatMs(toFirst)}${detail ? ` (${detail})` : ""}`;
  const endPoint: TimelinePoint = t.points.resolved !== undefined ? "resolved" : "returned";
  const toEnd = span(t, "click", endPoint);
  const verb = t.end === "failed" ? "failed" : "resolved";
  return `click→${verb}${toEnd === undefined ? "" : ` ${formatMs(toEnd)}`} (no write request recorded`
    + `${detail ? `; ${detail}` : ""})`;
}

/** `(onSuccess 8.1 ms, patch 6.0 ms, navigate→paint 171 ms)`, the parts that are known. */
function returnDetail(t: ClientTimeline, withPaint: boolean): string {
  const parts = [
    ...(t.durations.onSuccessMs === undefined ? [] : [`onSuccess ${d1(t.durations.onSuccessMs)}`]),
    ...(t.durations.patchMs === undefined ? [] : [`patch ${d1(t.durations.patchMs)}`]),
  ];
  const toPaint = withPaint ? span(t, "navigated", "painted") : undefined;
  if (toPaint !== undefined) parts.push(`navigate→paint ${formatMs(toPaint)}`);
  return parts.length > 0 ? ` (${parts.join(", ")})` : "";
}

/** The part after the first request, by how the timeline ended. */
function returnPart(t: ClientTimeline): string {
  if (t.end === "failed") {
    // Without a first request, `sendPart` already said `click→failed …`.
    if (t.points.firstWrite === undefined) return "";
    const toFail = span(t, "click", "returned");
    return `save failed${toFail === undefined ? "" : ` ${formatMs(toFail)} after the click`}`;
  }
  const network = span(t, "firstWrite", "resolved");
  const head = network === undefined ? [] : [`first request→resolved ${formatMs(network)}`];
  const from: TimelinePoint = t.points.resolved !== undefined ? "resolved" : "returned";
  let tail: string;
  if (t.end === "painted") {
    const toPaint = span(t, from, "painted");
    tail = `resolve→CAPEX painted${toPaint === undefined ? "" : ` ${formatMs(toPaint)}`}${returnDetail(t, true)}`;
  } else if (t.end === "paintTimeout") {
    tail = `resolve→CAPEX painted: not within ${formatMs(PAINT_TIMEOUT_MS)}${returnDetail(t, false)}`;
  } else if (t.end === "stayed") {
    const toScreen = span(t, from, "returned");
    tail = `resolve→screen${toScreen === undefined ? "" : ` ${formatMs(toScreen)}`}${returnDetail(t, false)}; `
      + "stayed on the sheet, no CAPEX paint";
  } else {
    tail = `not finished: superseded by a newer Save${returnDetail(t, false)}`;
  }
  return [...head, tail].join(", ");
}

/** `; prepare log 12.0 ms, after the first request`, or nothing when it did not print. */
function logPart(t: ClientTimeline): string {
  const ms = t.durations.prepareLogMs;
  if (ms === undefined) return "";
  const logAt = t.points.prepareLog;
  const first = t.points.firstWrite;
  const when = logAt === undefined || first === undefined ? ""
    : logAt >= first ? ", after the first request" : ", BEFORE the first request";
  return `; prepare log ${d1(ms)}${when}`;
}

/** The steps table: one row per known interval, from the click. */
function timelineSteps(t: ClientTimeline): SaveLogStep[] {
  const click = t.points.click ?? 0;
  const at = (p: TimelinePoint) => (t.points[p] === undefined ? undefined : (t.points[p] as number) - click);
  const steps: SaveLogStep[] = [];
  const add = (label: string, from: TimelinePoint, to: TimelinePoint, detail?: string, status: SaveLogStep["status"] = "ok") => {
    const ms = span(t, from, to);
    if (ms === undefined) return;
    steps.push({ label, startMs: at(from), ms, status, ...(detail ? { detail } : {}) });
  };
  add("click → prepare done", "click", "prepared",
    t.durations.prepareMs === undefined ? undefined : `prepareSheetSave ${d1(t.durations.prepareMs)}`);
  add("prepare done → first write request", "prepared", "firstWrite", "save.reset, mutateAsync, the data layer's plan");
  if (t.end === "failed") {
    if (t.points.firstWrite !== undefined) add("first write request → Save failed", "firstWrite", "returned", undefined, "failed");
    else add("click → Save failed (no write request)", "click", "returned", undefined, "failed");
  } else {
    add("first write request → Save resolved", "firstWrite", "resolved", "the bulk save (its own line has the requests)");
  }
  if (t.durations.onSuccessMs !== undefined && t.points.resolved !== undefined) {
    steps.push({
      label: "onSuccess (book patch, invalidations)", startMs: at("resolved"), ms: t.durations.onSuccessMs, status: "ok",
      ...(t.durations.patchMs === undefined ? {} : { detail: `patch ${d1(t.durations.patchMs)}` }),
    });
  }
  add("resolved → back on the screen", "resolved", "returned");
  add("back on the screen → navigate", "returned", "navigated");
  add("navigate → DEVEX/CAPEX painted", "navigated", "painted", "first frame after the grid rendered the book");
  if (t.durations.prepareLogMs !== undefined && t.points.prepareLog !== undefined) {
    steps.push({ label: "prepare log (deferred)", startMs: at("prepareLog"), ms: t.durations.prepareLogMs, status: "ok" });
  }
  return steps;
}

/**
 * The timeline as a D59 report: the one line, then the "Client timeline" group. Pure; a missing
 * point leaves its part out rather than printing a wrong number.
 */
export function clientTimelineReport(t: ClientTimeline): SaveLogReport {
  const steps = stepsSection(timelineSteps(t), "Client timeline (from the click)");
  return {
    summary: `Add Cost from Table client: ${[sendPart(t), returnPart(t)].filter(Boolean).join(", ")}${logPart(t)}`,
    sections: [{
      ...steps,
      lines: [
        "Times from the Save click (performance.now). \"First write request\" is the save's first upsert "
          + "starting; the request leaves in the same task.",
        "Painted is the first frame after the DEVEX/CAPEX grid rendered the saved book.",
        ...steps.lines,
      ],
    }],
  };
}

/* ═══════════════════════════════════════════════════════════ store ══ */

interface Active {
  timeline: ClientTimeline;
  timer?: ReturnType<typeof setTimeout>;
  awaitingPaint: boolean;
}

let active: Active | null = null;
const clock = (): number => performance.now();

/** Runs `fn`, swallowing anything it throws (the timeline must never fail a Save). */
function guarded(fn: () => void): void {
  try { fn(); } catch { /* measurement only */ }
}

/** After the next paint: one animation frame, then one task. Without rAF, one task. */
function afterNextPaint(cb: () => void): void {
  const task = () => { setTimeout(cb, 0); };
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(task);
  else task();
}

function finish(end: TimelineEnd): void {
  const current = active;
  if (!current) return;
  if (current.timer !== undefined) clearTimeout(current.timer);
  current.awaitingPaint = false;
  current.timeline.end = end;
  try {
    // Still active while `emitSaveLog` first prints a deferred prepare log: its `onEmitted` then
    // lands in THIS timeline, which the builder reads only after that flush.
    emitSaveLog(() => clientTimelineReport(current.timeline));
  } finally {
    if (active === current) active = null;
  }
}

/**
 * The one timeline in flight. Every method is a no-op without one (a Save started before this
 * module existed, a test, the CAPEX screen opened normally) and never throws.
 */
export const addCostSaveTimeline = {
  /** The Save click. A timeline still waiting is printed first, as `superseded`. */
  begin(now?: number): void {
    guarded(() => {
      if (active) finish("superseded");
      active = { timeline: { points: { click: now ?? clock() }, durations: {}, end: "painted" }, awaitingPaint: false };
    });
  },
  /** Records `point` at `now`; the first mark of a point wins. */
  mark(point: TimelinePoint, now?: number): void {
    guarded(() => {
      if (!active || active.timeline.points[point] !== undefined) return;
      active.timeline.points[point] = now ?? clock();
    });
  },
  /** Records a duration (ms); the first one wins. */
  measure(name: TimelineDuration, ms: number): void {
    guarded(() => {
      if (!active || active.timeline.durations[name] !== undefined) return;
      active.timeline.durations[name] = ms;
    });
  },
  /** The screen is navigating to DEVEX/CAPEX: wait for `capexShown`, at most `PAINT_TIMEOUT_MS`. */
  awaitPaint(now?: number): void {
    guarded(() => {
      if (!active) return;
      addCostSaveTimeline.mark("navigated", now);
      active.awaitingPaint = true;
      const current = active;
      current.timer = setTimeout(() => { if (active === current) guarded(() => finish("paintTimeout")); }, PAINT_TIMEOUT_MS);
    });
  },
  /**
   * The DEVEX/CAPEX grid rendered a book (its commit). When a Save waits for that, the next
   * paint ends the timeline; otherwise nothing happens.
   */
  capexShown(): void {
    guarded(() => {
      if (!active || !active.awaitingPaint) return;
      const current = active;
      current.awaitingPaint = false;
      afterNextPaint(() => {
        if (active !== current) return;
        guarded(() => {
          addCostSaveTimeline.mark("painted");
          finish("painted");
        });
      });
    });
  },
  /** Prints now: the Save stayed on the sheet, or failed. */
  end(end: "stayed" | "failed"): void {
    guarded(() => finish(end));
  },
  /** Drops the timeline without a line (a Save that sent nothing). */
  cancel(): void {
    guarded(() => {
      if (active?.timer !== undefined) clearTimeout(active.timer);
      active = null;
    });
  },
};
