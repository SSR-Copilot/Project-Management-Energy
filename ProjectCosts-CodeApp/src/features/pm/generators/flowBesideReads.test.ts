/**
 * UT-GENFLOW — PA-05 (dvopt T-22, `GENERATORS_PERF.flowBesideReads`): the permission-cancellation flow of a type delete / replace runs
 * BESIDE the Identify reads, and the plan is built only after both have settled (the D97 order: the flow completes before any delete).
 * The flow and the reads are fakes with explicit timing; the helper is the real one.
 */
import { afterEach, describe, expect, it } from "vitest";
import { GENERATORS_PERF_ALL_OFF, setGeneratorsPerfFlags } from "@/data/generatorsPerfFlags";
import { cancelBesideReads } from "./flowBesideReads";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** A flow and a read that log when they start and end, so overlap is a fact of the log, not of the clock. */
function rig(opts: { flowMs?: number; readMs?: number; flowFails?: boolean; readFails?: boolean } = {}) {
  const log: string[] = [];
  const cancel = async () => {
    log.push("flow:start"); await sleep(opts.flowMs ?? 20); log.push("flow:end");
    if (opts.flowFails) throw new Error("flow refused");
  };
  const read = async () => {
    log.push("reads:start"); await sleep(opts.readMs ?? 20); log.push("reads:end");
    if (opts.readFails) throw new Error("reads failed");
    return "inputs";
  };
  return { log, cancel, read };
}

afterEach(() => setGeneratorsPerfFlags(null));

describe("cancelBesideReads (PA-05)", () => {
  it("UT-GENFLOW-001 ON: the flow and the reads start together and the result comes back only after both ended", async () => {
    setGeneratorsPerfFlags({ flowBesideReads: true }); // ships OFF at integration (PA-05); this test exercises the switch ON
    const r = rig({ flowMs: 40, readMs: 10 });
    const out = await cancelBesideReads(r.cancel, r.read, "cancelFirst");
    expect(out).toBe("inputs");
    expect(r.log.slice(0, 2)).toEqual(["flow:start", "reads:start"]);
    expect(r.log.at(-1)).toBe("flow:end"); // the slow flow was awaited: no plan can be built before it completed
  });

  it("UT-GENFLOW-002 OFF, deletes: the flow first, the reads only after it (the old order)", async () => {
    setGeneratorsPerfFlags({ ...GENERATORS_PERF_ALL_OFF });
    const r = rig();
    expect(await cancelBesideReads(r.cancel, r.read, "cancelFirst")).toBe("inputs");
    expect(r.log).toEqual(["flow:start", "flow:end", "reads:start", "reads:end"]);
  });

  it("UT-GENFLOW-003 OFF, replaces: the reads first, the flow after them (the old order)", async () => {
    setGeneratorsPerfFlags({ ...GENERATORS_PERF_ALL_OFF });
    const r = rig();
    expect(await cancelBesideReads(r.cancel, r.read, "readFirst")).toBe("inputs");
    expect(r.log).toEqual(["reads:start", "reads:end", "flow:start", "flow:end"]);
  });

  it("UT-GENFLOW-004 the saving: with equal durations ON takes one duration, OFF two", async () => {
    setGeneratorsPerfFlags({ flowBesideReads: true }); // ships OFF at integration (PA-05); this test exercises the switch ON
    const time = async () => { const r = rig({ flowMs: 60, readMs: 60 }); const t = Date.now(); await cancelBesideReads(r.cancel, r.read, "cancelFirst"); return Date.now() - t; };
    const on = await time();
    setGeneratorsPerfFlags({ ...GENERATORS_PERF_ALL_OFF });
    const off = await time();
    expect(on).toBeLessThan(off - 30);
  });

  it("UT-GENFLOW-005 a refused flow fails the plan step (the delete is never planned), with the flow's error, even when the reads also failed", async () => {
    const r = rig({ flowFails: true, readFails: true });
    await expect(cancelBesideReads(r.cancel, r.read, "cancelFirst")).rejects.toThrow("flow refused");
    // Replace: the old order read first, so when both fail the reads' error is the one reported.
    const r2 = rig({ flowFails: true, readFails: true });
    await expect(cancelBesideReads(r2.cancel, r2.read, "readFirst")).rejects.toThrow("reads failed");
  });

  it("UT-GENFLOW-006 failure injection: failed reads with a flow that succeeded reject with the reads' error; nothing is left running", async () => {
    setGeneratorsPerfFlags({ flowBesideReads: true }); // ships OFF at integration (PA-05); this test exercises the switch ON
    const r = rig({ readFails: true, flowMs: 30, readMs: 5 });
    await expect(cancelBesideReads(r.cancel, r.read, "cancelFirst")).rejects.toThrow("reads failed");
    expect(r.log.at(-1)).toBe("flow:end"); // the flow had finished before the rejection surfaced: no dangling call
  });

  it("UT-GENFLOW-008 flowBesideReads ships OFF at integration until the owner approves (PA-05): with no override the old order runs", async () => {
    const r = rig();
    expect(await cancelBesideReads(r.cancel, r.read, "cancelFirst")).toBe("inputs");
    expect(r.log).toEqual(["flow:start", "flow:end", "reads:start", "reads:end"]);
  });

  it("UT-GENFLOW-007 a flow that is not needed (resolves at once) costs nothing: the result is the reads'", async () => {
    const out = await cancelBesideReads(async () => undefined, async () => 42, "cancelFirst");
    expect(out).toBe(42);
  });
});
