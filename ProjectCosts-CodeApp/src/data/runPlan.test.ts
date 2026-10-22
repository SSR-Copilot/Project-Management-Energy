/**
 * UT-RUNPLAN — the adapter the Application Settings screens use to run a `WritePlan` while keeping
 * their own busy / toast / panel feedback: a part-way failure is rethrown as the failed write's own
 * error so `instanceof` checks and `userErrorText` keep working.
 */
import { describe, expect, it, vi } from "vitest";
import { DataError, RecordGoneError } from "@/platform/errors";
import { PlanError, PlanRefusedError, type PlanClient } from "./executePlan";
import { runPlan } from "./runPlan";
import { emptyPlan, guardedUpdate, refusePlan } from "./writePlan";

const ok = <T,>(data: T) => ({ success: true as const, data });
const SET = "vsb_capexaccountlists";
const PK = "vsb_capexaccountlistid";
const ROW = "50000000-0000-0000-0000-000000000001";

function client(opts: { gone?: boolean; status?: number } = {}) {
  const raw = {
    retrieveMultipleRecordsAsync: vi.fn(async () => ok(opts.gone ? [] : [{ [PK]: ROW }])),
    createRecordAsync: vi.fn(async () => ok({ [PK]: ROW })),
    updateRecordAsync: vi.fn(async () => (opts.status
      ? { success: false as const, data: undefined, error: { message: `HTTP ${opts.status}`, status: opts.status } }
      : ok({}))),
    deleteRecordAsync: vi.fn(async () => ok(undefined)),
  };
  return { client: raw as unknown as PlanClient, raw };
}

const onePatch = () => {
  const plan = emptyPlan();
  plan.writes.push(guardedUpdate(SET, ROW, { vsb_name: "A" }, "rename", "rename account"));
  return plan;
};

describe("runPlan", () => {
  it("UT-RUNPLAN-001 resolves with the PlanResult when every write lands", async () => {
    const { client: c } = client();
    await expect(runPlan(onePatch(), "test", { client: c })).resolves.toEqual({ done: 1, createdIds: [] });
  });

  it("UT-RUNPLAN-002 a part-way failure is rethrown as the failed write's own error (a RecordGoneError for a gone row)", async () => {
    const { client: c, raw } = client({ gone: true });
    const err = await runPlan(onePatch(), "test", { client: c }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RecordGoneError);
    expect(err).not.toBeInstanceOf(PlanError);
    expect(raw.updateRecordAsync).not.toHaveBeenCalled();
  });

  it("UT-RUNPLAN-003 any other write failure surfaces as its DataError, with its text and status", async () => {
    const { client: c } = client({ status: 403 });
    const err = (await runPlan(onePatch(), "test", { client: c }).catch((e: unknown) => e)) as DataError;
    expect(err).toBeInstanceOf(DataError);
    expect(err.isForbidden).toBe(true);
    expect(err.message).toBe("rename account failed: HTTP 403");
  });

  it("UT-RUNPLAN-004 mapError decides what is thrown; returning undefined falls back to the cause", async () => {
    const { client: c } = client({ status: 500 });
    class Custom extends Error {}
    const mapped = await runPlan(onePatch(), "test", { client: c, mapError: (e) => new Custom(`done ${e.done}`) }).catch((e: unknown) => e);
    expect(mapped).toBeInstanceOf(Custom);
    expect((mapped as Error).message).toBe("done 0");
    const fallback = await runPlan(onePatch(), "test", { client: c, mapError: () => undefined }).catch((e: unknown) => e);
    expect(fallback).toBeInstanceOf(DataError);
  });

  it("UT-RUNPLAN-005 a refused plan passes through as PlanRefusedError and sends nothing", async () => {
    const { client: c, raw } = client();
    const err = await runPlan(refusePlan("not allowed"), "test", { client: c }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PlanRefusedError);
    expect((err as Error).message).toBe("not allowed");
    expect(raw.retrieveMultipleRecordsAsync).not.toHaveBeenCalled();
    expect(raw.updateRecordAsync).not.toHaveBeenCalled();
  });
});
