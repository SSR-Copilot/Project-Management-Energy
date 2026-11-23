/**
 * Optimization programme B7, OPT-27(a) (S6-06): the Project Gates grid derives its rows from ONE index per dataset
 * (`buildTaskIndex`) and parses each participant JSON once (`createPeopleParser`), instead of `checklists.find(sameId)` per
 * approval and `approvals.some(sameId)` per checklist for every gate row on every render.
 *
 * The OLD functions are copied below verbatim as the oracle (differential test over a large generated dataset with mixed-case
 * ids, empty ids, duplicates, dangling references, null orders, inactive and "To Delete" tasks); the recompute counters count
 * element reads on the dataset arrays (as UT-ADDPERF-002/003 do), which does not depend on the machine. Ids: UT-ADGATE-OPT-NNN.
 */
import { describe, expect, it } from "vitest";
import type { DefaultChecklist, GateTaskApproval, GatesDataset, PersonRef, ProjectState } from "@/data/adminGatesApprovals";
import { buildTaskIndex, createPeopleParser, isShownChecklist, parsePeople, taskCandidates, tasksOfGate, canAddTask } from "./rules";

/* ── the OLD implementation, verbatim (oracle) ── */
const sameId = (a: string | null | undefined, b: string | null | undefined) =>
  Boolean(a && b && a.toLowerCase() === b.toLowerCase());
const byOrder = (a: { order: number | null }, b: { order: number | null }) =>
  (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER);
type Data = Pick<GatesDataset, "checklists" | "approvals">;
function oldTasksOfGate(data: Data, state: ProjectState) {
  const out: { approval: GateTaskApproval; checklist: DefaultChecklist }[] = [];
  for (const approval of data.approvals) {
    const checklist = data.checklists.find((c) => sameId(c.id, approval.checklistId));
    if (checklist && isShownChecklist(checklist) && sameId(checklist.stateId, state.id)) out.push({ approval, checklist });
  }
  return out.sort((a, b) => byOrder(a.checklist, b.checklist));
}
function oldTaskCandidates(data: Data, state: ProjectState): DefaultChecklist[] {
  return data.checklists
    .filter(isShownChecklist)
    .filter((c) => sameId(c.stateId, state.id))
    .filter((c) => !data.approvals.some((a) => sameId(a.checklistId, c.id)))
    .sort(byOrder);
}
const oldCanAddTask = (data: Data, state: ProjectState) => oldTaskCandidates(data, state).length > 0;

/* ── a seeded generator ── */
function rng(seed: number) {
  let x = seed >>> 0;
  return () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 2 ** 32; };
}
const STATES: ProjectState[] = Array.from({ length: 6 }, (_, i) => ({
  id: `10000000-0000-0000-0000-00000000000${i}`, name: `S${i}`, order: i, visibleOnChecklist: true, businessUnitId: null,
}));
const cid = (n: number) => `c0000000-0000-0000-0000-${String(n).padStart(12, "0")}`;

function generate(seed: number, checklists = 150, approvals = 100): Data {
  const r = rng(seed);
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)]!;
  const cl: DefaultChecklist[] = Array.from({ length: checklists }, (_, i) => {
    const id = r() < 0.03 ? "" : r() < 0.04 ? cid(Math.floor(r() * checklists)) : cid(i); // empty ids and duplicate ids
    const stateId = r() < 0.05 ? null : pick(STATES).id;
    return {
      id: r() < 0.3 ? id.toUpperCase() : id, name: `Task ${i}`, order: r() < 0.1 ? null : Math.floor(r() * 12),
      stateId: stateId && r() < 0.3 ? stateId.toUpperCase() : stateId,
      active: r() > 0.1, toDelete: r() < 0.1,
    };
  });
  const ap: GateTaskApproval[] = Array.from({ length: approvals }, (_, i) => {
    const ref = r() < 0.05 ? null : r() < 0.08 ? cid(9999 + i) : cid(Math.floor(r() * checklists));
    return {
      id: `a${i}`, name: `A${i}`, mode: 952850000, gateActive: true, pmId: null, contributors: null, approvers: null, notifications: null,
      checklistId: ref && r() < 0.3 ? ref.toUpperCase() : ref,
    };
  });
  return { checklists: cl, approvals: ap };
}

/** Wraps the dataset arrays so every element read is counted. */
function counted(data: Data) {
  const counter = { reads: 0 };
  const wrap = <T,>(xs: T[]) => new Proxy(xs, {
    get(target, prop, receiver) {
      if (typeof prop === "string" && /^\d+$/.test(prop)) counter.reads += 1;
      return Reflect.get(target, prop, receiver);
    },
  });
  return { data: { checklists: wrap(data.checklists), approvals: wrap(data.approvals) } as Data, counter };
}

describe("OPT-27(a) the task index equals the old per-gate functions", () => {
  it("UT-ADGATE-OPT-020 tasksOfGate, taskCandidates and canAddTask: identical output for every gate over 40 generated datasets", () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const data = generate(seed);
      const index = buildTaskIndex(data);
      for (const state of [...STATES, { ...STATES[0]!, id: "" }, { ...STATES[0]!, id: "ffffffff-0000-0000-0000-000000000000" }]) {
        expect(index.tasksOf(state)).toEqual(oldTasksOfGate(data, state));
        expect(index.candidatesOf(state)).toEqual(oldTaskCandidates(data, state));
        expect(index.canAdd(state)).toBe(oldCanAddTask(data, state));
        // the exported single-call functions keep their signature and results
        expect(tasksOfGate(data, state)).toEqual(oldTasksOfGate(data, state));
        expect(taskCandidates(data, state)).toEqual(oldTaskCandidates(data, state));
        expect(canAddTask(data, state)).toBe(oldCanAddTask(data, state));
      }
    }
  });

  it("UT-ADGATE-OPT-021 the first checklist wins for a duplicated id; ties on Order keep approval order (stable sort); ids compare case-insensitively", () => {
    const state = STATES[1]!;
    const base = { name: "x", order: 3, stateId: state.id, active: true, toDelete: false } as const;
    const data: Data = {
      checklists: [{ ...base, id: "AA", name: "first" }, { ...base, id: "aa", name: "second", order: 1 }, { ...base, id: "bb", name: "b" }],
      approvals: [
        { id: "1", checklistId: "bb" }, { id: "2", checklistId: "aA" }, { id: "3", checklistId: "AA" },
      ] as GateTaskApproval[],
    };
    const got = buildTaskIndex(data).tasksOf(state).map((t) => `${t.approval.id}:${t.checklist.name}`);
    expect(got).toEqual(["1:b", "2:first", "3:first"]);
    expect(got).toEqual(oldTasksOfGate(data, state).map((t) => `${t.approval.id}:${t.checklist.name}`));
  });

  it("UT-ADGATE-OPT-022 an empty checklist id is never 'approved' (sameId needs both ids), so it stays an Add Task candidate", () => {
    const state = STATES[0]!;
    const data: Data = {
      checklists: [{ id: "", name: "no id", order: 1, stateId: state.id, active: true, toDelete: false }],
      approvals: [{ id: "a", checklistId: "" }, { id: "b", checklistId: null }] as GateTaskApproval[],
    };
    expect(buildTaskIndex(data).candidatesOf(state)).toEqual(oldTaskCandidates(data, state));
    expect(buildTaskIndex(data).canAdd(state)).toBe(true);
  });
});

describe("OPT-27(a) recomputation counters (element reads on the dataset arrays)", () => {
  it("UT-ADGATE-OPT-023 6 gates over 150 tasks x 100 approvals: old = quadratic per render, new = one linear pass, then no reads at all", () => {
    const source = generate(7);
    const old = counted(source);
    for (const state of STATES) { oldTasksOfGate(old.data, state); oldCanAddTask(old.data, state); }

    const now = counted(source);
    const index = buildTaskIndex(now.data);
    const build = now.counter.reads;
    for (let render = 0; render < 5; render += 1) for (const state of STATES) { index.tasksOf(state); index.canAdd(state); }

    expect(old.counter.reads).toBeGreaterThan(30_000); // measured on the old code: tens of thousands per render
    expect(build).toBeLessThanOrEqual(2 * (150 + 100) + 10); // at most two passes over each array
    expect(now.counter.reads).toBe(build); // the later renders read the arrays zero times
  });
});

describe("OPT-27(a) participant JSON is parsed once per distinct text", () => {
  const people: PersonRef[] = [{ entraId: "k1", name: "Pat", mail: "p@vsb.energy" }];
  const text = JSON.stringify([{ PersonaKey: "k1", PersonaName: "Pat", PersonaRole: "p@vsb.energy" }]);

  it("UT-ADGATE-OPT-024 same results as parsePeople; each distinct string parsed once however often it is asked", () => {
    let parses = 0;
    const parse = createPeopleParser((json) => { parses += 1; return parsePeople(json); });
    for (let render = 0; render < 20; render += 1) {
      expect(parse(text)).toEqual(people);
      expect(parse(null)).toEqual([]);
      expect(parse(undefined)).toEqual([]);
      expect(parse("  ")).toEqual([]);
      expect(parse("not json")).toEqual([]);
    }
    expect(parses).toBe(3); // text, "  " (blank is a distinct string), "not json"; null/undefined never reach the parser
    for (const input of [text, null, undefined, "", "[]", "{}", "[1,{\"PersonaKey\":2}]"]) {
      expect(createPeopleParser()(input)).toEqual(parsePeople(input));
    }
  });
});
