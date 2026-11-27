// @vitest-environment jsdom
/**
 * UT-INTENT-0xx — T-C03 (BND-17, SPA-09): the in-app intent prefetch of the navigation rail.
 *
 * Hover or focus on a rail entry for `INTENT_DWELL_MS` starts that screen's chunk (`INTENT_PREFETCH_CHUNKS`) and, only behind
 * `INTENT_PREFETCH_DATA` (OFF by default), its first reads through the boot's own prefetchers. Bounded: a dwell, a number in flight, a
 * dedupe window, never hidden, never the heavy reads, never the screen already open; one `[VSB]` line per start.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const s = vi.hoisted(() => ({
  chunks: [] as string[], reads: [] as string[], actions: [] as string[], release: [] as (() => void)[], hold: false,
  /** UT-INTENT-014: a plan whose prefetch the test controls directly (no dynamic import in the way). */
  plan: undefined as undefined | { loaders: []; prefetch: (qc: unknown, id: string) => Promise<unknown>; heavy: false },
}));

vi.mock("./screenLoaders", () => {
  const chunk = (name: string) => vi.fn(async () => { s.chunks.push(name); return {}; });
  return {
    loadGeneratorsScreen: chunk("generators"),
    COST_SCREEN_LOADERS: {
      "/costs/land-lease": [chunk("land-lease")], "/costs/capex": [chunk("capex")], "/costs/contracts": [chunk("contracts")],
    },
    PM_SCREEN_LOADERS: { team: chunk("team"), general: chunk("general"), planning: chunk("planning") },
    ADMIN_SCREEN_LOADERS: { "/admin/cost": chunk("admin-cost") },
  };
});
vi.mock("./screenPrefetch", async (original) => {
  const real = await original<typeof import("./screenPrefetch")>();
  return { ...real, screenPlanFor: (path: string) => s.plan ?? real.screenPlanFor(path) };
});
vi.mock("./pmScreenPrefetch", () => ({
  prefetchPmScreenReads: vi.fn(async (_qc: unknown, slug: string, id: string) => {
    s.reads.push(`pm:${slug}:${id}`);
    if (s.hold) await new Promise<void>((r) => { s.release.push(r); });
  }),
}));
vi.mock("./costScreenPrefetch", () => ({
  prefetchCostScreenReads: vi.fn(async (_qc: unknown, path: string, id: string, ctx: { mode: string }) => {
    s.reads.push(`cost:${path}:${id}:${ctx.mode}`);
  }),
}));
vi.mock("@/platform/requestLog", async (original) => ({
  ...(await original<typeof import("@/platform/requestLog")>()),
  actionLog: vi.fn(async (name: string, fn: () => Promise<unknown>) => { s.actions.push(name); return fn(); }),
}));

import { INTENT_DWELL_MS } from "./intentPrefetch";
import { useRailIntentPrefetch } from "./useRailIntent";
import { INTENT_DEDUPE_MS, INTENT_MAX_IN_FLIGHT, mayStartIntentData, resetIntentPrefetch, startScreenIntent } from "./intentStart";
// The prefetchers are loaded on demand (dynamic imports); loading them first keeps concurrent starts independent of module-load timing.
await Promise.all([import("./pmScreenPrefetch"), import("./costScreenPrefetch"), import("./intentStart"), import("./intentPrefetch")]);
import { screenPlanFor } from "./screenPrefetch";
import { railEntryOf } from "./generatorsWarmup";
import { entryPrefetch, resetEntryPrefetch, setEntryPrefetchForTests } from "@/data/entryPrefetchFlags";

const PID = "11111111-1111-1111-1111-111111111111";
const client = () => new QueryClient();

function Rail({ pathname, projectId = PID }: { pathname: string; projectId?: string | undefined }) {
  useRailIntentPrefetch(projectId, pathname);
  const link = (key: string, path: string, label: string) => (
    <a href={`#${path}`} data-testid={`rail-${key}`} aria-label={label} data-nav-path={path}><span data-testid={`rail-icon-${key}`}>{label}</span></a>
  );
  return (
    <nav aria-label="rail">
      {link("TeamKey", "/project/team", "Team")}
      {link("PlanningKey", "/project/planning", "Planning")}
      {link("CostKey", "/admin/cost", "Costs")}
      {link("LandLeaseKey", "/costs/land-lease", "Land Lease")}
      {link("CapexKey", "/costs/capex", "CAPEX")}
      {link("ContractsKey", "/costs/contracts", "Contracts")}
    </nav>
  );
}
const wrap = (qc: QueryClient, ui: ReactNode) => render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
const el = (testId: string) => document.querySelector(`[data-testid="${testId}"]`) as HTMLElement;
const fire = (target: Element, type: string, init: Record<string, unknown> = {}) =>
  act(async () => { const event = new Event(type, { bubbles: true }); Object.assign(event, init); target.dispatchEvent(event); });
const wait = (ms: number) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });

beforeEach(() => {
  s.chunks.length = 0; s.reads.length = 0; s.actions.length = 0; s.release.length = 0; s.hold = false;
  resetIntentPrefetch(); resetEntryPrefetch(); s.plan = undefined;
});
afterEach(() => { cleanup(); vi.useRealTimers(); resetEntryPrefetch(); });

describe("flags and defaults", () => {
  it("UT-INTENT-001 defaults: the chunk intent is ON, the data intent is OFF (the owner has not approved the extra Dataverse traffic)", () => {
    expect(entryPrefetch().intentChunks).toBe(true);
    expect(entryPrefetch().intentData).toBe(false);
  });
});

describe("the dwell and the chunk", () => {
  it("UT-INTENT-002 a hover that lasts the dwell starts the screen's chunk and, with the data switch OFF, no read", async () => {
    wrap(client(), <Rail pathname="/project/general" />); await wait(40);
    await fire(el("rail-TeamKey"), "pointerover");
    expect(s.chunks).toEqual([]); // not yet: a sweep over the rail starts nothing
    await wait(INTENT_DWELL_MS + 200);
    expect(s.chunks).toEqual(["team"]);
    expect(s.reads).toEqual([]);
  });

  it("UT-INTENT-003 a pointer that leaves before the dwell, or moves over the entry's own icon, starts nothing / starts once", async () => {
    wrap(client(), <Rail pathname="/project/general" />); await wait(40);
    await fire(el("rail-TeamKey"), "pointerover");
    await wait(40);
    await fire(el("rail-TeamKey"), "pointerout", { relatedTarget: document.body });
    await wait(INTENT_DWELL_MS + 200);
    expect(s.chunks).toEqual([]);
    // Moving from the anchor onto its icon is the same hover: one start.
    await fire(el("rail-PlanningKey"), "pointerover");
    await fire(el("rail-icon-PlanningKey"), "pointerout", { relatedTarget: el("rail-PlanningKey") });
    await fire(el("rail-icon-PlanningKey"), "pointerover");
    await wait(INTENT_DWELL_MS + 200);
    expect(s.chunks).toEqual(["planning"]);
  });

  it("UT-INTENT-004 keyboard focus counts like a hover, and a press starts at once", async () => {
    wrap(client(), <Rail pathname="/project/general" />); await wait(40);
    await fire(el("rail-TeamKey"), "focusin");
    await wait(INTENT_DWELL_MS + 200);
    expect(s.chunks).toEqual(["team"]);
    await fire(el("rail-PlanningKey"), "pointerdown");
    await vi.waitFor(() => expect(s.chunks).toEqual(["team", "planning"]));
  });

  it("UT-INTENT-005 the screen already open and an element outside the rail start nothing", async () => {
    wrap(client(), <Rail pathname="/project/team" />); await wait(40);
    await fire(el("rail-TeamKey"), "pointerover");
    await fire(document.body, "pointerover");
    await wait(INTENT_DWELL_MS + 200);
    expect(s.chunks).toEqual([]);
  });

  it("UT-INTENT-006 the admin entries start their chunk (BND-17) through the same function the router's lazy() uses; the real loader map covers every admin route", async () => {
    wrap(client(), <Rail pathname="/project/general" projectId={undefined} />); await wait(40);
    await fire(el("rail-CostKey"), "pointerover");
    await wait(INTENT_DWELL_MS + 200);
    expect(s.chunks).toEqual(["admin-cost"]);
    expect(s.reads).toEqual([]);
    const real = await vi.importActual<typeof import("./screenLoaders")>("./screenLoaders");
    expect(Object.keys(real.ADMIN_SCREEN_LOADERS).sort()).toEqual([
      "/admin/capex-accounts", "/admin/contract", "/admin/cost", "/admin/default-checklists", "/admin/gates-approvals", "/admin/milestones",
    ]);
  });

  it("UT-INTENT-007 INTENT_PREFETCH_CHUNKS OFF (and the data switch OFF) registers no listener and starts nothing", async () => {
    setEntryPrefetchForTests({ intentChunks: false });
    const add = vi.spyOn(document, "addEventListener");
    wrap(client(), <Rail pathname="/project/general" />); await wait(40);
    expect(add.mock.calls.filter(([type]) => ["pointerover", "focusin", "pointerdown"].includes(type as string))).toEqual([]);
    await fire(el("rail-TeamKey"), "pointerover");
    await wait(INTENT_DWELL_MS + 200);
    expect(s.chunks).toEqual([]);
    add.mockRestore();
  });

  it("UT-INTENT-008 the listeners are removed on unmount", async () => {
    const view = wrap(client(), <Rail pathname="/project/general" />); await wait(40);
    view.unmount();
    document.body.insertAdjacentHTML("beforeend", `<a data-nav-path="/project/team" data-testid="rail-late" aria-label="late" href="#x">late</a>`);
    await fire(el("rail-late"), "pointerover");
    await wait(INTENT_DWELL_MS + 200);
    expect(s.chunks).toEqual([]);
    el("rail-late").remove();
  });
});

describe("the data intent (switch ON)", () => {
  beforeEach(() => { setEntryPrefetchForTests({ intentData: true }); });

  it("UT-INTENT-010 a PM entry starts the boot's own prefetcher for that screen and project, traced as one [VSB] action", async () => {
    wrap(client(), <Rail pathname="/project/general" />); await wait(40);
    await fire(el("rail-TeamKey"), "pointerover");
    await wait(INTENT_DWELL_MS + 200);
    expect(s.reads).toEqual([`pm:team:${PID}`]);
    expect(s.actions).toEqual(["prefetch hover /project/team"]);
  });

  it("UT-INTENT-011 a Cost entry starts the Cost prefetcher in intent mode; the CAPEX Summary (heavy) never starts on a hover", async () => {
    wrap(client(), <Rail pathname="/project/general" />); await wait(40);
    await fire(el("rail-LandLeaseKey"), "pointerover");
    await wait(INTENT_DWELL_MS + 200);
    await fire(el("rail-CapexKey"), "pointerover");
    await wait(INTENT_DWELL_MS + 200);
    expect(s.reads).toEqual([`cost:/costs/land-lease:${PID}:intent`]);
    // The chunk of the heavy screen still starts.
    expect(s.chunks).toContain("capex");
    expect(screenPlanFor("/costs/capex")?.heavy).toBe(true);
    expect(screenPlanFor("/costs/add-from-table")?.heavy).toBe(true);
    expect(screenPlanFor("/costs/contracts")?.heavy).toBe(false);
  });

  it("UT-INTENT-012 one start per project and screen inside the dedupe window; a second window starts again", () => {
    const qc = client();
    let now = 1_000;
    const clock = { now: () => now, hidden: () => false };
    startScreenIntent(qc, "/project/team", PID, "hover", clock);
    startScreenIntent(qc, "/project/team", PID, "hover", clock);
    now += INTENT_DEDUPE_MS - 1;
    startScreenIntent(qc, "/project/team", PID, "press", clock);
    return vi.waitFor(() => expect(s.reads).toEqual([`pm:team:${PID}`])).then(async () => {
      now += 2;
      startScreenIntent(qc, "/project/team", PID, "hover", clock);
      await vi.waitFor(() => expect(s.reads).toHaveLength(2));
    });
  });

  it("UT-INTENT-013 never while the page is hidden, never without a project", () => {
    expect(mayStartIntentData({ now: 5, lastStartedAt: undefined, hidden: true, inFlight: 0 })).toBe(false);
    const qc = client();
    startScreenIntent(qc, "/project/team", undefined, "hover", { now: () => 1, hidden: () => false });
    startScreenIntent(qc, "/project/team", PID, "hover", { now: () => 1, hidden: () => true });
    expect(s.actions).toEqual([]);
  });

  it("UT-INTENT-014 at most INTENT_MAX_IN_FLIGHT screens are prefetched at once; a further intent is dropped, not queued", async () => {
    s.plan = {
      loaders: [], heavy: false,
      prefetch: async (_qc, id) => { s.reads.push(id); await new Promise<void>((r) => { s.release.push(r); }); },
    };
    const qc = client();
    const clock = { now: () => 1, hidden: () => false };
    const projects = Array.from({ length: INTENT_MAX_IN_FLIGHT + 2 }, (_, i) => `00000000-0000-0000-0000-00000000000${i}`);
    for (const id of projects) startScreenIntent(qc, "/project/team", id, "hover", clock);
    await vi.waitFor(() => expect(s.reads).toHaveLength(INTENT_MAX_IN_FLIGHT));
    await wait(30);
    expect(s.reads).toHaveLength(INTENT_MAX_IN_FLIGHT);
    // A slot frees up: a new intent is served (the dropped ones are not remembered).
    s.release.shift()?.();
    await wait(30);
    startScreenIntent(qc, "/project/team", projects[INTENT_MAX_IN_FLIGHT]!, "hover", clock);
    await vi.waitFor(() => expect(s.reads).toHaveLength(INTENT_MAX_IN_FLIGHT + 1));
    s.release.forEach((r) => r());
    s.plan = undefined;
  });

  it("UT-INTENT-015 the data switch OFF again: nothing reads, the chunk still starts", () => {
    setEntryPrefetchForTests({ intentData: false });
    startScreenIntent(client(), "/project/team", PID, "press", { now: () => 1, hidden: () => false });
    expect(s.actions).toEqual([]);
    return vi.waitFor(() => expect(s.chunks).toEqual(["team"]));
  });
});

describe("the shared delegation", () => {
  it("UT-INTENT-020 the rail entry is found from any element inside it, and only from there (the one helper generatorsWarmup.ts exports)", () => {
    document.body.innerHTML = `<a data-nav-path="/project/team"><span id="in">x</span></a><span id="out">y</span>`;
    expect(railEntryOf(document.getElementById("in"))?.getAttribute("data-nav-path")).toBe("/project/team");
    expect(railEntryOf(document.getElementById("out"))).toBeNull();
    expect(railEntryOf(null)).toBeNull();
    document.body.innerHTML = "";
  });

  it("UT-INTENT-021 the route table: each kind of path has a plan, an unknown one has none", () => {
    expect(screenPlanFor("/project/team")?.prefetch).toBeTypeOf("function");
    expect(screenPlanFor("/project/general")?.prefetch).toBeUndefined();
    expect(screenPlanFor("/admin/cost")?.prefetch).toBeUndefined();
    expect(screenPlanFor("/projects")).toBeUndefined();
    expect(screenPlanFor("/project/nowhere")).toBeUndefined();
  });
});
