/**
 * Optimization programme B7, OPT-17 (b, c): sequential WAVES and request counts of the Project Gates dataset load, measured with the
 * wave recorder (`src/test/waveClient.ts`) over a label-keyed fake `fetchAll`. Each number marked OLD was recorded first against the
 * unmodified tree; the tests pin the new numbers. Ids: UT-ADGATE-OPT-NNN.
 *
 * Fixture: 3 gate templates (PMs P1..P3), one checklist header, 100 checklist tasks (3 approval chunks of 40/40/20), approvals
 * whose Portfolio Managers are either a subset of the templates' (scenario A) or include a new one (scenario B).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createWaveClient, waveOf, type WaveClient } from "@/test/waveClient";

const h = vi.hoisted(() => ({
  wave: undefined as unknown as WaveClient,
  /** `getEntraPeople`: one deferred answer per fetchPage call, in call order. */
  page: { inFlight: 0, peak: 0, started: [] as string[], release: [] as (() => void)[], failOn: null as string | null },
}));

vi.mock("./client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./client")>()),
  fetchAll: (label: string, page: unknown, options?: Record<string, unknown>) => h.wave.fetchAll(label, page, options),
  fetchPage: (_label: string, _page: unknown, options?: { filter?: string }) => {
    const id = /eq ([0-9a-f-]{36})/.exec(options?.filter ?? "")?.[1] ?? "?";
    h.page.started.push(id);
    h.page.inFlight += 1;
    h.page.peak = Math.max(h.page.peak, h.page.inFlight);
    return new Promise<unknown[]>((resolve, reject) => {
      h.page.release.push(() => {
        h.page.inFlight -= 1;
        if (h.page.failOn === id) reject(new Error(`lookup ${id} failed`));
        else resolve([{ aaduserid: id, id, displayname: `Name ${id.slice(-3)}`, mail: `${id.slice(-3)}@vsb.energy` }]);
      });
    });
  },
}));

const { projectGatesRepository: repo, getEntraPeople } = await import("./adminGatesApprovals");

const COUNTRY = "00000000-0000-0000-0000-0000000000de";
const HEADER = "70000000-0000-0000-0000-000000000001";
const pm = (n: number) => `30000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const task = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;

let templatePms: string[];
let approvalPms: (n: number) => string | null;
let peopleFail = false;

const answer = (label: string, options: Record<string, unknown>): unknown[] => {
  const filter = String(options["filter"] ?? "");
  switch (label) {
    case "list gate approval templates":
      return templatePms.map((p, i) => ({ vsb_projectdefaultapprovalsid: `t${i}`, _vsb_approvalparticipant1_value: p, createdon: `2024-0${i + 1}-01` }));
    case "read vsb_checklistcountryandtechnologies":
      return [{ vsb_checklistcountryandtechnologyid: HEADER }];
    case "read vsb_projectdefaultchecklistses":
      return Array.from({ length: 100 }, (_, i) => ({ vsb_projectdefaultchecklistsid: task(i + 1), vsb_name: `Task ${i + 1}`, vsb_order: i + 1 }));
    case "read vsb_checklistdefaultapprovalses":
      return Array.from({ length: 100 }, (_, i) => i + 1)
        .filter((n) => filter.includes(task(n)))
        .map((n) => ({ vsb_checklistdefaultapprovalsid: `a${n}`, _vsb_projectdefaultchecklistid_value: task(n), _vsb_portfoliomanagerid_value: approvalPms(n) }));
    case "resolve portfolio managers": {
      if (peopleFail) throw new Error("graph down");
      const ids = [...filter.matchAll(/'([^']+)'/g)].map((m) => m[1]!);
      return ids.map((id) => ({ aaduserid: id, id: id.toUpperCase(), displayname: `Name ${id.slice(-3)}`, mail: `${id.slice(-3)}@vsb.energy` }));
    }
    default:
      return [];
  }
};

const run = () => h.wave.run(() => repo.loadDataset(COUNTRY, 952850000));
const peopleCalls = (calls: { label: string }[]) => calls.filter((c) => c.label === "resolve portfolio managers") as { label: string; wave: number; filter?: string }[];

beforeEach(() => {
  h.wave = createWaveClient(answer);
  templatePms = [pm(1), pm(2), pm(3)];
  approvalPms = () => pm(1);
  peopleFail = false;
  Object.assign(h.page, { inFlight: 0, peak: 0, started: [], release: [], failOn: null });
});

describe("OPT-17(b) the gates load", () => {
  it("UT-ADGATE-OPT-001 scenario A (approval PMs already among the templates'): 3 waves, 7 requests", async () => {
    const { value, waves, calls } = await run();
    expect(calls).toHaveLength(7); // templates, header, tasks, 3 approval chunks, 1 template-PM chunk (+0 approval-only PMs)
    expect(peopleCalls(calls)).toHaveLength(1);
    expect(waves).toBe(3);
    expect(Object.keys(value.people).sort()).toEqual([pm(1), pm(2), pm(3)]);
  });

  it("UT-ADGATE-OPT-002 scenario B (an approval PM unknown to the templates): 4 waves", async () => {
    approvalPms = (n) => (n === 7 ? pm(4) : pm(1));
    const { value, waves, calls } = await run();
    expect(peopleCalls(calls)).toHaveLength(2);
    expect(waves).toBe(4);
    expect(Object.keys(value.people).sort()).toEqual([pm(1), pm(2), pm(3), pm(4)]);
  });

  it("UT-ADGATE-OPT-003 the template-PM resolution starts as soon as the template read returns, beside the checklist chain", async () => {
    const { calls } = await run();
    expect(peopleCalls(calls)[0]!.wave).toBe(1); // the wave after the templates answered; the approvals are still two waves away
    expect(waveOf(calls, "read vsb_checklistdefaultapprovalses")).toBe(2);
  });

  it("UT-ADGATE-OPT-004 31 distinct PMs: the 3 people chunks of 15/15/1 go out together", async () => {
    templatePms = Array.from({ length: 31 }, (_, i) => pm(i + 1));
    approvalPms = () => null;
    const { value, waves, calls } = await run();
    const people = peopleCalls(calls);
    expect(people).toHaveLength(3);
    expect(new Set(people.map((c) => c.wave)).size).toBe(1);
    expect(waves).toBe(3); // header/templates, tasks+people, approvals
    expect(Object.keys(value.people)).toHaveLength(31);
    expect(String(people[0]!.filter).split(" or ")).toHaveLength(15);
  });

  it("UT-ADGATE-OPT-005 a people failure stays non-fatal: peopleError set, no people, everything else loaded", async () => {
    peopleFail = true;
    const { value } = await run();
    expect(value.peopleError).toBe("graph down");
    expect(value.people).toEqual({});
    expect(value.templates).toHaveLength(3);
    expect(value.approvals).toHaveLength(100);
    expect(value.checklistError).toBeNull();
  });

  it("UT-ADGATE-OPT-006 `people` is keyed by LOWER-CASE Entra id even when the directory answers upper case", async () => {
    const { value } = await run();
    for (const key of Object.keys(value.people)) expect(key).toBe(key.toLowerCase());
    expect(value.people[pm(1)]!.entraId).toBe(pm(1).toUpperCase());
  });
});

describe("OPT-17(c) a reload carries the people already resolved", () => {
  it("UT-ADGATE-OPT-007 with every id known, the reload makes NO people request", async () => {
    const first = await run();
    h.wave.reset();
    const again = await h.wave.run(() => repo.loadDataset(COUNTRY, 952850000, first.value.people));
    expect(peopleCalls(again.calls)).toHaveLength(0);
    expect(again.waves).toBe(3);
    expect(again.value.people).toEqual(first.value.people);
  });

  it("UT-ADGATE-OPT-008 only ids not already known are requested, and unreferenced known entries are dropped", async () => {
    const first = await run();
    templatePms = [pm(1), pm(2), pm(9)]; // pm(3) left, pm(9) arrived
    h.wave.reset();
    const again = await h.wave.run(() => repo.loadDataset(COUNTRY, 952850000, first.value.people));
    const people = peopleCalls(again.calls);
    expect(people).toHaveLength(1);
    expect(String(people[0]!.filter)).toBe(`id eq '${pm(9)}'`);
    expect(Object.keys(again.value.people).sort()).toEqual([pm(1), pm(2), pm(9)]);
  });

  it("UT-ADGATE-OPT-009 known ids are matched case-insensitively (rows may carry any case)", async () => {
    templatePms = [pm(1).toUpperCase()];
    const known = { [pm(1)]: { entraId: pm(1), name: "Cached", mail: "c@vsb.energy" } };
    const again = await h.wave.run(() => repo.loadDataset(COUNTRY, 952850000, known));
    expect(peopleCalls(again.calls)).toHaveLength(0);
    expect(again.value.people[pm(1)]!.name).toBe("Cached");
  });

  it("UT-ADGATE-OPT-010 the freshness switch exists and is on (DIVERGENCE, reversible)", async () => {
    const { GATES_REUSE_PEOPLE } = await import("./adminGatesApprovals");
    expect(GATES_REUSE_PEOPLE).toBe(true);
  });

  it("UT-ADGATE-OPT-901 a known person with a BLANK name is asked again and the fresh name replaces it; a named known person is still reused", async () => {
    templatePms = [pm(1), pm(2)];
    approvalPms = () => null;
    const known = {
      [pm(1)]: { entraId: pm(1), name: "", mail: "" }, // a blank row from a transient directory answer
      [pm(2)]: { entraId: pm(2), name: "Cached Two", mail: "two@vsb.energy" },
    };
    const again = await h.wave.run(() => repo.loadDataset(COUNTRY, 952850000, known));
    const people = peopleCalls(again.calls);
    expect(people).toHaveLength(1);
    expect(String(people[0]!.filter)).toBe(`id eq '${pm(1)}'`);
    expect(again.value.people[pm(1)]!.name).toBe(`Name ${pm(1).slice(-3)}`);
    expect(again.value.people[pm(2)]!.name).toBe("Cached Two");
  });

  it("UT-ADGATE-OPT-902 every known person has a name: still 0 people requests (reuse unchanged)", async () => {
    templatePms = [pm(1)];
    approvalPms = () => null;
    const known = { [pm(1)]: { entraId: pm(1), name: "Cached", mail: "" } };
    const again = await h.wave.run(() => repo.loadDataset(COUNTRY, 952850000, known));
    expect(peopleCalls(again.calls)).toHaveLength(0);
  });
});

describe("OPT-17(b) getEntraPeople is bounded and keeps its result and failure behaviour", () => {
  const settle = () => new Promise((r) => setTimeout(r, 5));
  const releaseAll = async () => {
    for (let guard = 0; guard < 100; guard += 1) {
      await settle();
      const batch = h.page.release.splice(0);
      if (batch.length === 0 && h.page.inFlight === 0) return;
      batch.forEach((r) => r());
    }
  };

  it("UT-ADGATE-OPT-011 20 ids: at most 6 lookups in flight, result map in input order", async () => {
    const ids = Array.from({ length: 20 }, (_, i) => pm(i + 1));
    const pending = getEntraPeople(ids);
    await releaseAll();
    const map = await pending;
    expect(h.page.peak).toBe(6);
    expect(h.page.started).toHaveLength(20);
    expect([...map.keys()]).toEqual(ids);
  });

  it("UT-ADGATE-OPT-012 duplicate ids are looked up once", async () => {
    const pending = getEntraPeople([pm(1), pm(1), pm(2)]);
    await releaseAll();
    expect([...(await pending).keys()]).toEqual([pm(1), pm(2)]);
    expect(h.page.started).toEqual([pm(1), pm(2)]);
  });

  it("UT-ADGATE-OPT-013 one failing lookup rejects the whole call with that error (callers rely on it, as with Promise.all)", async () => {
    h.page.failOn = pm(2);
    const pending = getEntraPeople([pm(1), pm(2), pm(3)]).catch((e: unknown) => e);
    await releaseAll();
    expect(((await pending) as Error).message).toBe(`lookup ${pm(2)} failed`);
  });
});
