/**
 * UT-COSTPOLICY-001..008 — `costWrite` (dvopt T-11 adoption): the Cost screens' single-row writes go through `sendWithPolicy` by kind.
 * The matrix itself is pinned in `requestPolicy.test.ts` (UT-REQPOL-*); this pins the adoption: the switch, the kinds, the label.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DataError } from "@/platform/errors";

const flags = vi.hoisted(() => ({ policy: true }));
vi.mock("./leaseOpexFlags", () => ({ get COST_WRITES_POLICY() { return flags.policy; } }));
const logged = vi.hoisted(() => ({ lines: [] as string[] }));
vi.mock("@/platform/requestLog", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/platform/requestLog")>()),
  logAction: (line: string) => { logged.lines.push(line); },
}));

import { costWrite } from "./costWritePolicy";

const refused = (status: number) => ({ success: false as const, error: Object.assign(new Error(`HTTP ${status}`), { status }) });

async function settle<T>(work: () => Promise<T>): Promise<PromiseSettledResult<T>> {
  vi.useFakeTimers();
  const run = work().then((value) => ({ status: "fulfilled", value }) as const, (reason: unknown) => ({ status: "rejected", reason }) as const);
  await vi.advanceTimersByTimeAsync(60_000);
  return run;
}

beforeEach(() => { flags.policy = true; logged.lines = []; });
afterEach(() => { vi.useRealTimers(); });

describe("costWrite", () => {
  it("UT-COSTPOLICY-001 create: a 429 is retried, a 503 is not", async () => {
    const throttled = vi.fn().mockResolvedValueOnce(refused(429)).mockResolvedValue({ success: true as const });
    expect((await settle(() => costWrite("create", "vsb_x", throttled)) as { status: string }).status).toBe("fulfilled");
    expect(throttled).toHaveBeenCalledTimes(2);
    const down = vi.fn().mockResolvedValue(refused(503));
    const out = await settle(() => costWrite("create", "vsb_x", down));
    expect(down).toHaveBeenCalledTimes(1);
    expect((out as PromiseFulfilledResult<{ success: boolean }>).value.success).toBe(false); // handed back unchanged for the caller's unwrap
  });

  it("UT-COSTPOLICY-002 patchAbsolute and delete: a 503 is retried and the second answer is the result", async () => {
    for (const kind of ["patchAbsolute", "delete"] as const) {
      const fn = vi.fn().mockResolvedValueOnce(refused(503)).mockResolvedValue({ success: true as const, data: kind });
      const out = await settle(() => costWrite(kind, "vsb_x", fn));
      expect((out as PromiseFulfilledResult<{ data: string }>).value.data).toBe(kind);
      expect(fn).toHaveBeenCalledTimes(2);
    }
  });

  it("UT-COSTPOLICY-003 a thrown DataError is classified by its status: 403 once, 500 again", async () => {
    const forbidden = vi.fn().mockRejectedValue(new DataError("update x", "no privilege", 403));
    expect((await settle(() => costWrite("patchAbsolute", "vsb_x", forbidden))).status).toBe("rejected");
    expect(forbidden).toHaveBeenCalledTimes(1);
    const flaky = vi.fn().mockRejectedValueOnce(new DataError("update x", "boom", 500)).mockResolvedValue("ok");
    expect((await settle(() => costWrite("patchAbsolute", "vsb_x", flaky))).status).toBe("fulfilled");
    expect(flaky).toHaveBeenCalledTimes(2);
  });

  it("UT-COSTPOLICY-004 the switch off runs the call exactly once and returns its answer, whatever the status", async () => {
    flags.policy = false;
    const fn = vi.fn().mockResolvedValue(refused(429));
    const out = await settle(() => costWrite("delete", "vsb_x", fn));
    expect(fn).toHaveBeenCalledTimes(1);
    expect((out as PromiseFulfilledResult<{ success: boolean }>).value.success).toBe(false);
  });

  it("UT-COSTPOLICY-005 the retry line names the entity set and the kind, and carries no id or value", async () => {
    const fn = vi.fn().mockResolvedValueOnce(refused(503)).mockResolvedValue({ success: true as const });
    await settle(() => costWrite("delete", "vsb_landleaseperiods", fn));
    expect(logged.lines).toHaveLength(1);
    expect(logged.lines[0]).toContain("vsb_landleaseperiods");
    expect(logged.lines[0]).toContain("delete");
    expect(logged.lines[0]).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/i);
  });

  it("UT-COSTPOLICY-006 the SAME call is repeated (a retry never changes the payload)", async () => {
    const payloads: unknown[] = [];
    const payload = { vsb_name: "n", nested: { a: 1 } };
    const fn = vi.fn(async () => { payloads.push(payload); return payloads.length === 1 ? refused(503) : { success: true as const }; });
    await settle(() => costWrite("patchAbsolute", "vsb_x", fn));
    expect(payloads).toHaveLength(2);
    expect(payloads[1]).toBe(payloads[0]);
  });

  it("UT-COSTPOLICY-007 a success is returned at once with no wait and no log line", async () => {
    const fn = vi.fn().mockResolvedValue({ success: true as const, data: 1 });
    const out = await costWrite("create", "vsb_x", fn);
    expect(out).toEqual({ success: true, data: 1 });
    expect(logged.lines).toEqual([]);
  });

  it("UT-COSTPOLICY-008 a 404 on a delete is not retried (the caller's deleteIfExists reads it as done)", async () => {
    const fn = vi.fn().mockRejectedValue(new DataError("delete x", "gone", 404));
    expect((await settle(() => costWrite("delete", "vsb_x", fn))).status).toBe("rejected");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
