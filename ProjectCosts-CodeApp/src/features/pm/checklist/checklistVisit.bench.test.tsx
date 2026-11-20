// @vitest-environment jsdom
/**
 * UT-CHKPERF-060.. — END-TO-END cost of the Cluster Check List's visit and writes (D150), MODELLED, never measured on Dataverse.
 *
 * WHAT IS REAL: the screen, `hooks.ts`, TanStack Query, `usePlanWrite` (its reload), `rules.ts`, the plan builders and the plan
 * engine `executePlan`. WHAT IS STUBBED: the SDK edge only — the loaders of `data/checklist.ts` and the PlanClient the engine writes
 * through. Every stubbed request takes `LAT` ms of wall time and is counted.
 *
 * THE METRIC: `rounds` = the critical path in round trips. A request's depth is one more than the deepest request that had
 * COMPLETED when it started, so a request that waits for an answer is one round deeper and requests started together share a depth.
 * It is logical, therefore deterministic (the same on any machine and at any `LAT`): a modelled duration is `rounds × RTT`, and is
 * only that. It is NOT a Dataverse measurement: server time, throttling, Entra latency and the server-side flows are not modelled.
 * Hops per loader follow the code (`gates` = rows then one Entra lookup, `approvals` = rows then Entra, `templates` = scope then
 * templates, the session project = the project read then three parallel reads, `data/project.ts:131-189`). The session project
 * query (`qk.project`) is not part of this screen but IS reloaded by a write, so a probe stands in for it.
 *
 * CPU: React commits and their render time per comment keystroke, from a `<Profiler>` (jsdom + the dev build: RELATIVE only).
 * `CHKBENCH_OUT=<file>` writes the results as JSON; nothing is written otherwise.
 *
 * OPT-IN: it takes about a minute and is timing-sensitive under a loaded machine (a logical depth needs the stubbed hops to stay
 * longer than a React commit), so a normal `vitest run` skips it. Run it alone, one worker, nothing else running:
 *   PowerShell:  $env:CHKBENCH = "1"; npx vitest run src/features/pm/checklist/checklistVisit.bench.test.tsx --maxWorkers=1
 * The always-on guards for the same behaviour are request-count and ordering tests with no timing in them
 * (`hooks.perf.test.tsx`, `Screen.early.test.tsx`, `checklistPerf.test.ts`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FluentProvider } from "@fluentui/react-components";
import { MemoryRouter } from "react-router-dom";
import { Profiler, type ReactNode } from "react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { writeFileSync } from "node:fs";
import { vsbTheme } from "@/theme/fluent";
import { CHOICE_PROCESS, ES } from "@/data/dataverseNames";
import { qk } from "@/data/keys";
import { CHECKLIST_PERF_ALL_OFF, setChecklistPerfFlags } from "@/data/checklistPerfFlags";
import type { WritePlan } from "@/data/writePlan";
import type { PlanClient } from "@/data/executePlan";
import { dataSourcesInfo } from "../../../../.power/schemas/appschemas/dataSourcesInfo";

const LAT = 120;
const BENCH = process.env["CHKBENCH"] === "1";

const T = vi.hoisted(() => {
  const s = { log: [] as { label: string; depth: number }[], inFlight: 0, maxDone: 0 };
  const sleep = (ms: number) => new Promise<void>((r) => { setTimeout(r, ms); });
  /** `hops`: the requests of each SEQUENTIAL hop (`[1, 3]` = one request, then three in parallel). */
  const hit = async (label: string, hops: number[] = [1]) => {
    for (const [i, n] of hops.entries()) {
      const depth = s.maxDone + 1;
      for (let k = 0; k < n; k += 1) s.log.push({ label: hops.length > 1 ? `${label}#${i + 1}` : label, depth });
      s.inFlight += n;
      await sleep(120);
      s.inFlight -= n;
      s.maxDone = Math.max(s.maxDone, depth);
    }
  };
  const reset = () => { s.log = []; s.inFlight = 0; s.maxDone = 0; };
  return { s, hit, reset, sleep };
});
const H = vi.hoisted(() => ({ client: null as unknown as PlanClient }));

const uuid = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const ACS = CHOICE_PROCESS.approvalClusterState;
const NAMES = ["Draft", "Cluster 1", "Cluster 2", "Cluster 3", "Cluster 4", "Cluster 5", "Cluster 6"];
const STATES = NAMES.map((name, i) => ({ id: uuid(10 + i), name, order: i, isVisibleOnChecklist: true, clusterDescription: null }));
const PROJECT_ID = "p1";
const PROJECT = {
  id: PROJECT_ID, projectName: "Windpark Nord", projectNumber: "DE-0001", startCluster: 0, clusterStateId: STATES[0]!.id, clusterStateName: "Draft",
  approvalState: null, countryId: uuid(5), technology: CHOICE_PROCESS.technology.wind, owningBusinessUnitId: uuid(6), totalCapacity: 20,
  netYieldP50: 1000,
  milestones: {
    projectStartDate: "2026-01-01", feasibilityStudies: "2026-03-01", projectDevelopmentStarted: null, applicationSubmitted: null,
    legallyBindingPermits: null, fid: null, construction: null, cod: null,
  },
};
const tracking = (i: number, state: number) => ({
  id: uuid(200 + i), name: NAMES[i]!, clusterStateId: STATES[i]!.id, clusterStateName: NAMES[i]!, approvalClusterState: state,
  clusterStepState: null, approvalComment: i === 0 ? "Ready" : null, approvalDueDate: null, flowRunId: null, flowApprovalId: null,
});
const task = (clusterIndex: number, i: number) => ({
  id: uuid(1000 + i), title: `Task ${i}`, clusterStateId: STATES[clusterIndex]!.id, gateRelevance: false, holdingDescription: null,
  isCompletionDate: false, completionDate: null, taskState: CHOICE_PROCESS.taskState.none, approvalChecklistState: null, note: null,
  sort: i, projectDefaultChecklistId: uuid(3000 + i), flowRunId: null, flowApprovalId: null,
});

/** The fake store the stubbed loaders read and the stubbed client writes (only what the screen branches on). */
const db = {
  trackings: [] as ReturnType<typeof tracking>[],
  rows: {} as Record<string, ReturnType<typeof task>[]>,
  count: {} as Record<string, number>,
  templates: 0,
};

vi.mock("@/app/SessionContext", () => ({
  useSession: () => ({
    projectId: "p1", locale: "en-US", loading: false, envVars: { vsb_ProjectManagementAppID: "app-1" }, session: { fullName: "Ada Lovelace" },
  }),
}));
vi.mock("@/data/executePlan", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/data/executePlan")>();
  return {
    ...mod,
    executePlan: (plan: WritePlan, label: string) => mod.executePlan(plan, label, H.client),
  };
});
vi.mock("@/data/flows", () => ({
  requestGateApproval: vi.fn(), requestChecklistApproval: vi.fn(), cancelGateApproval: vi.fn(), cancelChecklistApproval: vi.fn(),
}));
vi.mock("@/data/checklist", () => ({
  loadChecklistProject: async () => { await T.hit("read project"); return PROJECT; },
  listChecklistProjectStates: async () => { await T.hit("read states"); return STATES; },
  listChecklistTrackings: async () => { await T.hit("read trackings"); return db.trackings.map((t) => ({ ...t })); },
  listChecklistGates: async () => { await T.hit("read gates", [1, 1]); return []; },
  listClusterChecklist: async (_p: string, state: string) => { await T.hit("read rows"); return (db.rows[state] ?? []).map((r) => ({ ...r })); },
  listChecklistApprovalSettings: async () => { await T.hit("read approvals", [1, 1]); return []; },
  countClusterChecklistRows: async (_p: string, state: string) => { await T.hit("read count"); return db.count[state] ?? 0; },
  listClusterTemplates: async (_p: unknown, state: string) => {
    await T.hit("read templates", [1, 1]);
    return Array.from({ length: db.templates }, (_, i) => ({
      id: uuid(3000 + i), name: `Task ${i}`, clusterStateId: state, gateRelevance: false, holdingTaskDescription: null, isCompletionDate: false, order: i,
    }));
  },
  listHistory: async () => { await T.hit("read history"); return []; },
}));

import CheckListScreen from "./Screen";

const pkOf = (set: string): string => (dataSourcesInfo as Record<string, { primaryKey: string }>)[set]!.primaryKey;
const ok = <D,>(data: D) => ({ success: true as const, data });
let createSeq = 0;
function makeClient(): PlanClient {
  return {
    retrieveMultipleRecordsAsync: async (table: string, o: { filter?: string }) => {
      await T.hit(`read ${table}`);
      const id = /eq ([0-9a-f-]{36})$/i.exec(o.filter ?? "")?.[1] ?? "";
      return ok([{ [pkOf(table)]: id }]);
    },
    createRecordAsync: async (table: string, data: Record<string, unknown> = {}) => {
      await T.hit(`create ${table}`);
      createSeq += 1;
      const id = uuid(90000 + createSeq);
      if (table === ES.projectChecklists) {
        // The store keeps what the screen reads back: the copied task, in its cluster, with its template (so the approval settings are read for it).
        const bind = Object.entries(data).find(([k, v]) => k.endsWith("@odata.bind") && String(v).startsWith(`/${ES.projectStates}(`));
        const cluster = /\(([^)]+)\)/.exec(String(bind?.[1] ?? ""))?.[1] ?? "";
        const n = Number(data["vsb_order"] ?? createSeq);
        (db.rows[cluster] ??= []).push({ ...task(0, n), id, clusterStateId: cluster, title: String(data["vsb_name"] ?? `Task ${n}`), projectDefaultChecklistId: String(data["vsb_projectdefaultchecklist"] ?? "") });
      }
      return ok({ [pkOf(table)]: id });
    },
    updateRecordAsync: async (table: string, id: string, data: Record<string, unknown>) => {
      await T.hit(`update ${table}`);
      if (table === ES.projectStateTrackings && data["vsb_approvalclusterstate"] !== undefined) {
        const t = db.trackings.find((x) => x.id === id);
        if (t) t.approvalClusterState = data["vsb_approvalclusterstate"] as number;
      }
      return ok({});
    },
    deleteRecordAsync: async (table: string) => { await T.hit(`delete ${table}`); return ok(undefined); },
  } as unknown as PlanClient;
}

/** Stands in for the session's own project query, which a checklist write reloads (`qk.project`, 4 requests in 2 hops). */
function SessionProjectProbe(): ReactNode {
  // Seeded before the mount with an infinite `staleTime`: in the app the session loads BEFORE the screen mounts, so only the
  // RELOAD after a write is part of a visit's cost.
  useQuery({ queryKey: qk.project(PROJECT_ID), staleTime: Infinity, queryFn: async () => { await T.hit("session project", [1, 3]); return {}; } });
  return null;
}

const COMPLETE = "but_Checklist_DisplayProject_Body_Content_ListRow_Complete";
const NEXT = "pcf_Checklist_DisplayProject_Body_Content_Buttons_NextCluster";
const SAVE = "pcf_CheckList_RightPanel_ChangeCluster_Form_Buttons_Save";
const REFRESH = "but_Project_States_CheckList_Refresh";
const busyOverlay = () => document.querySelector("[role='dialog'][aria-busy='true']");

const commits = { n: 0, ms: 0 };
function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false, staleTime: 30_000 }, mutations: { retry: false } } }); // staleTime as `app/Providers.tsx`
  qc.setQueryData(qk.project(PROJECT_ID), {});
  return render(
    <QueryClientProvider client={qc}>
      <FluentProvider theme={vsbTheme}>
        <MemoryRouter>
          <SessionProjectProbe />
          <Profiler id="chk" onRender={(_id, _phase, actual) => { commits.n += 1; commits.ms += actual; }}>
            <CheckListScreen />
          </Profiler>
        </MemoryRouter>
      </FluentProvider>
    </QueryClientProvider>,
  );
}

/**
 * No request in flight and none new for 150 ms. NOT inside `act()`: React queues renders and effects until an `act` scope ends, so a
 * request that waits for a render (the visit's prepare reads, a reload) would only start after the measurement had finished.
 */
async function settle(): Promise<void> {
  const env = globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const was = env.IS_REACT_ACT_ENVIRONMENT;
  env.IS_REACT_ACT_ENVIRONMENT = false;
  try {
    let last = T.s.log.length;
    let quiet = Date.now();
    for (;;) {
      await T.sleep(10);
      if (T.s.inFlight > 0 || T.s.log.length !== last) { last = T.s.log.length; quiet = Date.now(); continue; }
      if (Date.now() - quiet >= 150) return;
    }
  } finally {
    env.IS_REACT_ACT_ENVIRONMENT = was;
  }
}
const usable = () => waitFor(() => {
  expect(screen.queryByTestId("checklist-loading")).toBeNull();
  const b = screen.queryAllByTestId(COMPLETE)[0] as HTMLButtonElement | undefined;
  expect(b !== undefined && !b.disabled).toBe(true);
}, { timeout: 10_000, interval: 2 });
const loaded = () => waitFor(() => { expect(screen.queryByTestId("checklist-loading")).toBeNull(); expect(screen.queryByTestId("gal_Checklist_DisplayProject_Body_General_Content")).not.toBeNull(); }, { timeout: 10_000, interval: 2 });

interface Result { order?: string; scenario: string; variant: string; rounds: number; requests: number; uiRounds?: number; usableRounds?: number; extra?: Record<string, number | string> }
const results: Result[] = [];
const summarise = (scenario: string, variant: string, extra: Partial<Result> = {}): Result => ({
  scenario, variant, rounds: T.s.maxDone, requests: T.s.log.length, ...extra,
  // The requests in the order they started, with their depth: what the critical path is made of.
  order: T.s.log.map((r) => `${r.label}@${r.depth}`).join(";"),
});
/** The repeats of one scenario must agree: a logical metric that varies would be noise, not a measurement. */
const same = (runs: Result[]) => {
  const key = (r: Result) => `${r.rounds}/${r.requests}/${r.usableRounds ?? "-"}/${r.uiRounds ?? "-"}`;
  const keys = runs.map(key);
  if (new Set(keys).size !== 1) {
    throw new Error(["repeats differ: " + keys.join(" | "), ...runs.map((r) => JSON.stringify(r.extra))].join("\n"));
  }
};
const histogram = () => {
  const h: Record<string, number> = {};
  for (const r of T.s.log) h[r.label] = (h[r.label] ?? 0) + 1;
  return h;
};

/** The two columns of the table: every D150 switch off (the behaviour of `7a332b8`, pinned by the baseline recorded before the change) and as shipped. */
const VARIANTS = [
  { name: "OFF", flags: CHECKLIST_PERF_ALL_OFF },
  { name: "ON", flags: null },
];

beforeEach(() => {
  T.reset();
  createSeq = 0;
  H.client = makeClient();
  db.trackings = STATES.map((_, i) => tracking(i, i === 0 ? ACS.inProgress : ACS.notStarted));
  db.rows = { [STATES[0]!.id]: Array.from({ length: 40 }, (_, i) => task(0, i)) };
  db.count = { [STATES[0]!.id]: 40 };
  db.templates = 10;
  commits.n = 0; commits.ms = 0;
});
afterEach(() => { cleanup(); setChecklistPerfFlags(null); });

for (const v of VARIANTS) {
  describe.skipIf(!BENCH)(`Cluster Check List — modelled visit cost [${v.name}] (LAT ${LAT} ms per hop, logical rounds)`, () => {
    beforeEach(() => { setChecklistPerfFlags(v.flags); });
    it("UT-CHKPERF-060 S1 a usual visit: mount to a usable screen (40 tasks), then everything quiet", async () => {
      const runs: Result[] = [];
      for (let k = 0; k < 3; k += 1) {
        cleanup(); T.reset();
        mount();
        await usable();
        const usableRounds = T.s.maxDone;
        await settle();
        runs.push(summarise("S1 usual visit (mount)", v.name, { usableRounds, extra: { ...histogram() } }));
      }
      same(runs);
      results.push(runs[0]!);
    });

    it.each([[10], [40]])("UT-CHKPERF-061 S2 first visit to an empty cluster with %i templates: mount, copy, reload, quiet", async (n) => {
      const runs: Result[] = [];
      for (let k = 0; k < 3; k += 1) {
        cleanup(); T.reset();
        db.rows = {}; db.count = {}; db.templates = n;
        mount();
        await loaded();
        await settle();
        runs.push(summarise(`S2 first visit, ${n} templates`, v.name, { extra: { ...histogram() } }));
      }
      same(runs);
      results.push(runs[0]!);
    });

    it("UT-CHKPERF-063 S3 Complete one task (40 tasks): click to the overlay gone, then quiet", async () => {
      const runs: Result[] = [];
      for (let k = 0; k < 3; k += 1) {
        cleanup(); T.reset();
        db.rows = { [STATES[0]!.id]: Array.from({ length: 40 }, (_, i) => task(0, i)) };
        mount();
        await usable();
        await settle();
        T.reset();
        fireEvent.click(screen.getAllByTestId(COMPLETE)[0]!);
        await waitFor(() => expect(busyOverlay()).not.toBeNull(), { timeout: 5000, interval: 1 });
        await waitFor(() => expect(busyOverlay()).toBeNull(), { timeout: 10_000, interval: 1 });
        const uiRounds = T.s.maxDone;
        await settle();
        runs.push(summarise("S3 Complete a task", v.name, { uiRounds, extra: { ...histogram() } }));
      }
      same(runs);
      results.push(runs[0]!);
    });

    it("UT-CHKPERF-064 S4 Move to next cluster (no gate; the next cluster is empty, 10 templates): Save to a settled screen", async () => {
      const runs: Result[] = [];
      for (let k = 0; k < 3; k += 1) {
        cleanup(); T.reset();
        db.trackings = STATES.map((_, i) => tracking(i, i === 0 ? ACS.inProgress : ACS.notStarted));
        db.rows = { [STATES[0]!.id]: Array.from({ length: 40 }, (_, i) => task(0, i)) };
        db.count = { [STATES[0]!.id]: 40 }; db.templates = 10;
        mount();
        await usable();
        await settle();
        T.reset();
        fireEvent.click(screen.getByTestId(NEXT));
        fireEvent.click(await screen.findByTestId(SAVE));
        await waitFor(() => expect(busyOverlay()).not.toBeNull(), { timeout: 5000, interval: 1 });
        // No "overlay gone" depth here: the Move job's overlay and the next cluster's visit job can follow each other without a gap the poll sees.
        await settle();
        runs.push(summarise("S4 Move to next cluster", v.name, { extra: { ...histogram() } }));
      }
      same(runs);
      results.push(runs[0]!);
    });

    it("UT-CHKPERF-065 S5 the Refresh icon (40 tasks): click to a quiet screen", async () => {
      const runs: Result[] = [];
      for (let k = 0; k < 3; k += 1) {
        cleanup(); T.reset();
        mount();
        await usable();
        await settle();
        T.reset();
        fireEvent.click(screen.getByTestId(REFRESH));
        await settle();
        runs.push(summarise("S5 Refresh", v.name, { extra: { ...histogram() } }));
      }
      // INFORMATIONAL: the depth of a Refresh flips between 2 and 3 under CPU load even with every switch off (its visit effects start in
      // the same commit as the reload), so only the request count is held to be stable; no improvement is claimed for it.
      expect(new Set(runs.map((r) => r.requests)).size).toBe(1);
      results.push(runs[0]!);
    });

    it("UT-CHKPERF-066 S6 typing 20 characters into a task's comment box (40 tasks): React commits and render time per keystroke", async () => {
      mount();
      await usable();
      await settle();
      fireEvent.click(screen.getAllByTestId("ico_Checklist_DisplayProject_Body_Content_ListRow_Comments")[0]!);
      const box = await screen.findByTestId("txt_CheckList_RightPanel_BodyForm_Comments");
      const perKey: { n: number; ms: number }[] = [];
      for (let i = 1; i <= 25; i += 1) {
        const before = { ...commits };
        await act(async () => { fireEvent.change(box, { target: { value: "x".repeat(i) } }); });
        if (i > 5) perKey.push({ n: commits.n - before.n, ms: commits.ms - before.ms }); // the first five warm up
      }
      const sorted = (xs: number[]) => [...xs].sort((a, b) => a - b);
      const q = (xs: number[], p: number) => sorted(xs)[Math.min(xs.length - 1, Math.ceil(p * xs.length) - 1)]!;
      const n = perKey.map((k) => k.n); const ms = perKey.map((k) => k.ms);
      results.push({
        scenario: "S6 typing (per keystroke)", variant: v.name, rounds: 0, requests: 0,
        extra: { samples: perKey.length, commitsMedian: q(n, 0.5), commitsP95: q(n, 0.95), renderMsMedian: +q(ms, 0.5).toFixed(2), renderMsP95: +q(ms, 0.95).toFixed(2) },
      });
      expect(perKey.length).toBe(20);
    });
  });
}

describe.skipIf(!BENCH)("Cluster Check List — modelled visit cost: the table", () => {
  it("UT-CHKPERF-099 prints the results (MODELLED: logical round trips, no server time; CPU is jsdom + dev build, relative only)", () => {
    const lines = results.map((r) => {
      const x = r.extra ?? {};
      return `${r.variant.padEnd(8)} ${r.scenario.padEnd(34)} rounds=${String(r.rounds).padStart(2)}  requests=${String(r.requests).padStart(3)}`
        + `${r.usableRounds !== undefined ? `  usable@${r.usableRounds}` : ""}${r.uiRounds !== undefined ? `  overlay-gone@${r.uiRounds}` : ""}`
        + (r.scenario.startsWith("S6") ? `  ${JSON.stringify(x)}` : "");
    });
    // eslint-disable-next-line no-console
    console.log(`\nCHECKLIST VISIT BENCH (modelled, LAT ${LAT} ms/hop)\n${lines.join("\n")}\n`);
    const out = process.env["CHKBENCH_OUT"];
    if (out) writeFileSync(out, JSON.stringify(results, null, 2));
    expect(results.length).toBeGreaterThan(0);
  });
});
