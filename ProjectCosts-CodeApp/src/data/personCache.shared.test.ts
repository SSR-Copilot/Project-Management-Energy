/**
 * UT-PERSON-DVOPT-NNN — PB-16: ONE per-person Entra cache for Team (`lookupPersonCached`), the Check List (`lookupPersonOnce`) and
 * General Data (`lookupPeopleAll`). Every caller keeps its own TTL and its own empty-answer rule.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Persona } from "./adminGatesApprovals";
import {
  PERSON_CACHE_MS, lookupPeopleAll, lookupPersonCached, resetPersonCache, setOnePersonCache, setPersonCacheMs,
} from "./personCache";
import { PEOPLE_FRESH_LONG_MS, PEOPLE_FRESH_MS, lookupPersonOnce, resetChecklistPeopleCache } from "./checklistPeople";
import { CHECKLIST_PERF, setChecklistPerfFlags } from "./checklistPerfFlags";

const persona = (id: string): Persona => ({ id, displayName: `N-${id}`, mail: `${id}@x` });
const empty = async () => new Map<string, Persona>();
const ask = vi.fn(async (id: string) => new Map([[id, persona(id)]]));

beforeEach(() => {
  resetPersonCache(); resetChecklistPeopleCache(); ask.mockClear();
  vi.useFakeTimers({ toFake: ["Date"] });
});
afterEach(() => {
  vi.useRealTimers(); setOnePersonCache(null); setPersonCacheMs(null); setChecklistPerfFlags(null);
});

describe("UT-PERSON-DVOPT one cache, three readers", () => {
  it("UT-PERSON-DVOPT-001 ON: a person Team looked up is not looked up again by the Check List or General Data", async () => {
    await lookupPersonCached("a", ask);
    await lookupPersonOnce("a", ask);
    await lookupPeopleAll(["a"], ask);
    expect(ask).toHaveBeenCalledTimes(1);
  });

  it("UT-PERSON-DVOPT-002 the other way round: the Check List's answer serves Team and General Data", async () => {
    await lookupPersonOnce("a", ask);
    await lookupPersonCached("a", ask);
    await lookupPeopleAll(["a", "a"], ask);
    expect(ask).toHaveBeenCalledTimes(1);
  });

  it("UT-PERSON-DVOPT-003 OFF: Team and the Check List keep separate stores, as before (one lookup each)", async () => {
    setOnePersonCache(false);
    await lookupPersonCached("a", ask);
    await lookupPersonOnce("a", ask);
    expect(ask).toHaveBeenCalledTimes(2);
    await lookupPersonCached("a", ask);
    await lookupPersonOnce("a", ask);
    expect(ask).toHaveBeenCalledTimes(2);
  });

  it("UT-PERSON-DVOPT-004 every TTL is kept: Team 30 minutes, the Check List 30 seconds with `longPeopleCache` OFF, 30 minutes with it ON", async () => {
    expect(PERSON_CACHE_MS).toBe(30 * 60_000);
    setChecklistPerfFlags({ ...CHECKLIST_PERF, longPeopleCache: false });
    await lookupPersonCached("a", ask);
    vi.setSystemTime(Date.now() + PEOPLE_FRESH_MS + 1);
    await lookupPersonOnce("a", ask); // 30 s window over: the Check List asks again ...
    expect(ask).toHaveBeenCalledTimes(2);
    await lookupPersonCached("a", ask); // ... and the answer it stored (just now) serves Team
    expect(ask).toHaveBeenCalledTimes(2);

    setChecklistPerfFlags(null); resetPersonCache(); ask.mockClear();
    await lookupPersonOnce("b", ask);
    vi.setSystemTime(Date.now() + PEOPLE_FRESH_LONG_MS - 1000);
    await lookupPersonOnce("b", ask);
    expect(ask).toHaveBeenCalledTimes(1);
    vi.setSystemTime(Date.now() + 2000);
    await lookupPersonOnce("b", ask);
    expect(ask).toHaveBeenCalledTimes(2);
  });

  it("UT-PERSON-DVOPT-005 Team's TTL applies to an entry the Check List stored: Team reuses it only while younger than 30 minutes", async () => {
    await lookupPersonOnce("a", ask);
    vi.setSystemTime(Date.now() + PERSON_CACHE_MS + 1);
    await lookupPersonCached("a", ask);
    expect(ask).toHaveBeenCalledTimes(2);
  });

  it("UT-PERSON-DVOPT-006 an EMPTY answer: the Check List keeps it (as before), Team and General Data never reuse it", async () => {
    const askEmpty = vi.fn(empty);
    await lookupPersonOnce("a", askEmpty);
    await lookupPersonOnce("a", askEmpty);
    expect(askEmpty).toHaveBeenCalledTimes(1); // kept for the Check List
    await lookupPersonCached("a", ask); // Team: not served from the empty entry
    expect(ask).toHaveBeenCalledTimes(1);
    resetPersonCache();
    await lookupPersonCached("b", askEmpty);
    await lookupPersonCached("b", askEmpty);
    expect(askEmpty).toHaveBeenCalledTimes(3); // Team's own empty answer is not kept (a member added a moment ago)
  });

  it("UT-PERSON-DVOPT-007 failure injection: a failed lookup is not remembered by any reader; the next read asks again", async () => {
    const boom = vi.fn(async () => { throw new Error("HTTP 503"); });
    await expect(lookupPersonOnce("a", boom)).rejects.toThrow();
    await expect(lookupPersonCached("a", boom)).rejects.toThrow();
    await expect(lookupPeopleAll(["a"], boom)).rejects.toThrow();
    expect(boom).toHaveBeenCalledTimes(3);
    await lookupPersonCached("a", ask);
    expect(ask).toHaveBeenCalledTimes(1);
  });

  it("UT-PERSON-DVOPT-008 the Check List's Refresh clears the answers (and, shared, Team's too: a freshness gain only)", async () => {
    await lookupPersonOnce("a", ask);
    resetChecklistPeopleCache();
    await lookupPersonOnce("a", ask);
    expect(ask).toHaveBeenCalledTimes(2);
    await lookupPersonCached("a", ask);
    expect(ask).toHaveBeenCalledTimes(2);
  });

  it("UT-PERSON-DVOPT-009 two readers asking together share ONE in-flight request across screens", async () => {
    const slow = vi.fn(() => new Promise<Map<string, Persona>>((res) => setTimeout(() => res(new Map([["a", persona("a")]])), 0)));
    vi.useRealTimers();
    const [x, y] = await Promise.all([lookupPersonCached("a", slow), lookupPersonOnce("a", slow)]);
    expect(slow).toHaveBeenCalledTimes(1);
    expect(x).toBe(y);
  });

  it("UT-PERSON-DVOPT-010 lookupPeopleAll returns the merged map in the shape getEntraPeople returns (id → persona), one lookup per unique id", async () => {
    const out = await lookupPeopleAll(["a", "b", "a"], ask);
    expect([...out.keys()]).toEqual(["a", "b"]);
    expect(out.get("b")).toEqual(persona("b"));
    expect(ask).toHaveBeenCalledTimes(2);
  });

  it("UT-PERSON-DVOPT-011 `PERSON_CACHE_MS = 0` still switches Team's caching off (no read, no store)", async () => {
    setPersonCacheMs(0);
    await lookupPersonCached("a", ask);
    await lookupPersonCached("a", ask);
    expect(ask).toHaveBeenCalledTimes(2);
  });
});
