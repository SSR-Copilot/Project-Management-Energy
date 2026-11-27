/**
 * T-C04 (NET-08): the reference tier of the query cache (`data/queryPolicy.ts`). Ids: UT-QPOL-NNN.
 *
 * The bug it fixes: a list declared fresh for 30 minutes (`staleTime`) is still dropped 5 minutes after its screen unmounted
 * (TanStack's default `gcTime`), so a return visit after 6 minutes re-reads it. The staleness rule itself is unchanged.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { REFERENCE, REFERENCE_GC } from "./queryPolicy";
import { countriesQueryOptions } from "./countries";
import {
  generalDataAreasQueryOptions, generalDataCountriesQueryOptions, generalDataProjectStatesQueryOptions, generalDataUtilizationsQueryOptions,
} from "@/features/pm/general-data/queries";

const MIN = 60 * 1000;
const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== "generated" && name !== "node_modules") walk(p, out); } else if (/\.(ts|tsx)$/.test(name) && !/\.test\./.test(name)) out.push(p);
  }
  return out;
}
const sources = walk(SRC).map((p) => ({ path: relative(SRC, p).split("\\").join("/"), text: readFileSync(p, "utf8") }));

describe("the REFERENCE preset", () => {
  it("UT-QPOL-001 is 30 minutes fresh and, with the switch on, kept 30 minutes after its last observer left (gcTime = staleTime)", () => {
    expect(REFERENCE.staleTime).toBe(30 * MIN);
    if (REFERENCE_GC) {
      expect(REFERENCE.gcTime).toBe(REFERENCE.staleTime);
      expect(REFERENCE.gcTime as number).toBeGreaterThanOrEqual(REFERENCE.staleTime);
    } else {
      expect(REFERENCE).toEqual({ staleTime: 30 * MIN });
    }
    expect(REFERENCE_GC).toBe(true); // the shipped default
  });

  it("UT-QPOL-002 no reference-staleness constant is declared outside queryPolicy.ts (the 7 local REFERENCE_STALE constants and COUNTRIES_STALE_MS import it)", () => {
    const offenders = sources
      .filter((s) => s.path !== "data/queryPolicy.ts")
      .filter((s) => /\b(?:REFERENCE_STALE|COUNTRIES_STALE_MS)\s*=\s*30\s*\*\s*60\s*\*\s*1000/.test(s.text))
      .map((s) => s.path);
    expect(offenders).toEqual([]);
  });

  it("UT-QPOL-003 the shared countries query options carry the preset (a stale window of 30 minutes AND a gc of 30 minutes)", () => {
    expect(countriesQueryOptions.staleTime).toBe(30 * MIN);
    expect((countriesQueryOptions as { gcTime?: number }).gcTime).toBe(30 * MIN);
  });

  it("UT-QPOL-009 the General Data reference lists (countries, states, areas, utilizations) carry the preset", () => {
    for (const o of [
      generalDataCountriesQueryOptions(), generalDataProjectStatesQueryOptions(), generalDataAreasQueryOptions("c1"), generalDataUtilizationsQueryOptions("c1"),
    ]) {
      expect(o.staleTime).toBe(30 * MIN);
      expect(o.gcTime).toBe(30 * MIN);
    }
  });

  it("UT-QPOL-004 no Cost screen hook or Cost data module uses the preset: the Cost books and totals stay on the global defaults (D51 patching of an unmounted book)", () => {
    const users = sources.filter((s) => /@\/data\/queryPolicy|\.\/queryPolicy/.test(s.text)).map((s) => s.path);
    expect(users.length).toBeGreaterThan(0);
    expect(users.filter((p) => p.startsWith("features/cost/") || /^data\/(costBook|costRepository|addCostSheet|capex|contracts|comments)/.test(p))).toEqual([]);
  });
});

/** A client with the browser default `gcTime` (5 minutes); under Node TanStack's default is Infinity, which would hide the defect. */
const browserClient = () => new QueryClient({ defaultOptions: { queries: { gcTime: 5 * MIN } } });

describe("reference data after its screen unmounted (acceptance: no re-read inside the stale time)", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  async function visit(client: QueryClient, options: { staleTime: number; gcTime?: number }, queryFn: () => Promise<string[]>) {
    const observer = new QueryObserver(client, { queryKey: ["ref", "list"], queryFn, ...options });
    const unsubscribe = observer.subscribe(() => undefined);
    await vi.advanceTimersByTimeAsync(0);
    const data = observer.getCurrentResult().data;
    unsubscribe(); // the screen unmounts
    return data;
  }

  it("UT-QPOL-005 with REFERENCE a return visit after 6 and after 29 minutes is served from the cache: one read in total", async () => {
    const client = browserClient();
    const queryFn = vi.fn(async () => ["DE", "NL"]);
    await visit(client, REFERENCE, queryFn);
    await vi.advanceTimersByTimeAsync(6 * MIN);
    expect(client.getQueryData(["ref", "list"])).toEqual(["DE", "NL"]); // not garbage-collected
    expect(await visit(client, REFERENCE, queryFn)).toEqual(["DE", "NL"]);
    await vi.advanceTimersByTimeAsync(23 * MIN);
    await visit(client, REFERENCE, queryFn);
    expect(queryFn).toHaveBeenCalledTimes(1);
  });

  it("UT-QPOL-006 the same list WITHOUT gcTime (the old options) is dropped at 5 minutes and read again on the return visit (the NET-08 defect)", async () => {
    const client = browserClient();
    const queryFn = vi.fn(async () => ["DE", "NL"]);
    await visit(client, { staleTime: 30 * MIN }, queryFn);
    await vi.advanceTimersByTimeAsync(6 * MIN);
    expect(client.getQueryData(["ref", "list"])).toBeUndefined();
    await visit(client, { staleTime: 30 * MIN }, queryFn);
    expect(queryFn).toHaveBeenCalledTimes(2);
  });

  it("UT-QPOL-007 the stale window is unchanged: after 31 minutes a return visit reads again, and the old entry is gone after 30 minutes unobserved", async () => {
    const client = browserClient();
    const queryFn = vi.fn(async () => ["DE"]);
    await visit(client, REFERENCE, queryFn);
    await vi.advanceTimersByTimeAsync(31 * MIN);
    expect(client.getQueryData(["ref", "list"])).toBeUndefined(); // gc after 30 minutes
    await visit(client, REFERENCE, queryFn);
    expect(queryFn).toHaveBeenCalledTimes(2);
  });

  it("UT-QPOL-008 a write that invalidates a reference list still re-reads it on the next visit (the preset changes memory, not invalidation)", async () => {
    const client = browserClient();
    const queryFn = vi.fn(async () => ["DE"]);
    await visit(client, REFERENCE, queryFn);
    await client.invalidateQueries({ queryKey: ["ref"] });
    await vi.advanceTimersByTimeAsync(0);
    await visit(client, REFERENCE, queryFn);
    expect(queryFn).toHaveBeenCalledTimes(2);
  });
});
