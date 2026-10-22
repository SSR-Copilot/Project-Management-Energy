/**
 * CAPEX Accounts — the three writes that are `WritePlan`s (rename, activate account, activate
 * subaccount), end to end through the REAL `runPlan` / `executePlan` / `updateRecordIfExists`
 * against the guarded SDK fake: exactly one PATCH per action, the upsert guard, and the error
 * classes the screen and its dialog branch on.
 *
 * WIRE-EQUIVALENCE. Each of them used to be a function of `@/data/adminCapexAccounts`
 * (`renameCapexAccount`, `activateCapexAccount`, `activateCapexSubaccount`); it is now a one-write
 * `WritePlan` (`./rules`). `OLD_WIRE` is the request sequence those functions sent, RECORDED from
 * the code before it was changed (the same guarded SDK fake, the same arguments). Each test runs
 * the new plan and asserts the SAME sequence: method, entity set, id and body (JSON-compared, so
 * key order counts too), including the guard's existence read.
 *
 * UT-ADCAPEX-009, 010, 012, 013, 014 (its two activate cases), 032 and 037 moved here from
 * `@/data/adminCapexAccounts.test.ts` with their assertions. The KEEP flows (create, reorder,
 * delete, both deactivates) stay in the data layer and keep their tests there.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@microsoft/power-apps/data", async () => (await import("@/test/guardedSdkFake")).sdkModule);

import { executePlan, type PlanClient, PlanRefusedError } from "@/data/executePlan";
import { runPlan } from "@/data/runPlan";
import type { WritePlan } from "@/data/writePlan";
import { DataError, RecordGoneError } from "@/platform/errors";
import { guardedSdk, resetGuardedSdk, sdkModule } from "@/test/guardedSdkFake";
import { OUT_OF_SCOPE, planActivateAccount, planActivateSubaccount, planRenameAccount } from "./rules";

const G = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const ACCOUNT = G(2);
const SUB_A = G(3);
const ACCOUNTS = "vsb_capexaccountlists";
const admin = { canEdit: true } as const;

/** Request sequences of the OLD data-layer functions, recorded before the move (capex-golden-old-wire). */
const OLD_WIRE = {
  rename: [
    { method: "read", table: ACCOUNTS, id: ACCOUNT },
    { method: "update", table: ACCOUNTS, id: ACCOUNT, body: { vsb_name: "New name" } },
  ],
  activateAccount: [
    { method: "read", table: ACCOUNTS, id: ACCOUNT },
    { method: "update", table: ACCOUNTS, id: ACCOUNT, body: { statecode: 0, statuscode: 1 } },
  ],
  activateSubaccount: [
    { method: "read", table: ACCOUNTS, id: SUB_A },
    { method: "update", table: ACCOUNTS, id: SUB_A, body: { statecode: 0, statuscode: 1 } },
  ],
} as const;

/** Runs a plan through the real executor and returns what reached the SDK, JSON-normalised like the recording. */
async function wireOf(plan: WritePlan): Promise<string> {
  resetGuardedSdk();
  await executePlan(plan, "wire test");
  return JSON.stringify(guardedSdk.log);
}
const golden = (key: keyof typeof OLD_WIRE) => JSON.stringify(OLD_WIRE[key]);

/** Everything that was not the guard's existence read. */
const writes = () => guardedSdk.log.filter((r) => r.method !== "read");

beforeEach(() => resetGuardedSdk());

describe("Wire equivalence: each plan sends exactly what the data-layer function sent", () => {
  it("UT-ADCAPEX-W01 rename: existence read, then a PATCH of the trimmed name only", async () => {
    expect(await wireOf(planRenameAccount(ACCOUNT, "  New name  ", admin))).toBe(golden("rename"));
  });

  it("UT-ADCAPEX-W02 activate account: existence read, then a PATCH of statecode/statuscode in the old order", async () => {
    expect(await wireOf(planActivateAccount(ACCOUNT, admin))).toBe(golden("activateAccount"));
  });

  it("UT-ADCAPEX-W03 activate subaccount: existence read, then the same status PATCH", async () => {
    expect(await wireOf(planActivateSubaccount(SUB_A, admin))).toBe(golden("activateSubaccount"));
  });

  it("UT-ADCAPEX-W04 the operation text of a failure is the one the data layer used (the label is verbatim)", async () => {
    guardedSdk.writeFails = 500;
    const message = async (plan: WritePlan) => ((await runPlan(plan, "ignored").catch((e: unknown) => e)) as Error).message;
    expect(await message(planRenameAccount(ACCOUNT, "x", admin))).toBe("rename CAPEX account failed: HTTP 500");
    expect(await message(planActivateAccount(ACCOUNT, admin))).toBe("activate CAPEX account failed: HTTP 500");
    expect(await message(planActivateSubaccount(SUB_A, admin))).toBe("activate CAPEX subaccount failed: HTTP 500");
  });

  it("UT-ADCAPEX-W05 a gone row reads exactly as it did before, and is a DataError subclass", async () => {
    guardedSdk.gone.add(ACCOUNT);
    const error = await runPlan(planRenameAccount(ACCOUNT, "x", admin), "t").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RecordGoneError);
    expect(error).toBeInstanceOf(DataError);
    expect((error as RecordGoneError).message)
      .toBe(`rename CAPEX account failed: ${ACCOUNTS} row ${ACCOUNT} no longer exists`);
    expect((await runPlan(planActivateAccount(ACCOUNT, admin), "t").catch((e: unknown) => e) as Error).message)
      .toBe(`activate CAPEX account failed: ${ACCOUNTS} row ${ACCOUNT} no longer exists`);
  });
});

describe("Writes: exactly one guarded PATCH per action (relocated from the data-layer tests)", () => {
  it("UT-ADCAPEX-009 Sends only the trimmed name", async () => {
    await runPlan(planRenameAccount(ACCOUNT, " New name ", admin), "t");
    expect(writes()).toEqual([{ method: "update", table: ACCOUNTS, id: ACCOUNT, body: { vsb_name: "New name" } }]);
  });

  it("UT-ADCAPEX-010 A row deleted between the check and the PATCH (404 under If-Match: *) is RecordGoneError, not a generic failure", async () => {
    guardedSdk.writeFails = 404;
    const error = await runPlan(planRenameAccount(ACCOUNT, "x", admin), "t").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RecordGoneError);
    expect((error as RecordGoneError).id).toBe(ACCOUNT);
    expect(guardedSdk.reads).toHaveLength(1);
  });

  it("UT-ADCAPEX-012 Checks the row exists by primary key (1 row, key only) immediately before the rename PATCH", async () => {
    // The fake's ordered log keeps only table + id, so the read's OPTIONS are recorded here by a
    // client that delegates to it — the same requests, seen in full.
    const fake = sdkModule.getClient();
    const reads: unknown[] = [];
    const client = {
      ...fake,
      retrieveMultipleRecordsAsync: (table: string, options: unknown) => {
        reads.push(options);
        return fake.retrieveMultipleRecordsAsync(table, options as { filter?: string });
      },
    } as unknown as PlanClient;
    await runPlan(planRenameAccount(ACCOUNT, "x", admin), "t", { client });
    expect(reads).toEqual([{
      select: ["vsb_capexaccountlistid"], filter: `vsb_capexaccountlistid eq ${ACCOUNT}`, maxPageSize: 1,
    }]);
    expect(writes()).toHaveLength(1);
  });

  it("UT-ADCAPEX-013 Refuses a rename of a deleted row with RecordGoneError and sends no PATCH", async () => {
    guardedSdk.gone.add(ACCOUNT);
    await expect(runPlan(planRenameAccount(ACCOUNT, "x", admin), "t")).rejects.toBeInstanceOf(RecordGoneError);
    expect(writes()).toEqual([]);
  });

  it.each([
    ["activate account", () => planActivateAccount(ACCOUNT, admin)],
    ["activate subaccount", () => planActivateSubaccount(ACCOUNT, admin)],
  ])("UT-ADCAPEX-014 %s on a deleted row: RecordGoneError (unwrapped), no PATCH, no clean-up", async (_name, plan) => {
    guardedSdk.gone.add(ACCOUNT);
    const error = await runPlan(plan(), "t").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RecordGoneError);
    expect(writes()).toEqual([]);
  });

  it("UT-ADCAPEX-032 Activating an account touches only the account", async () => {
    await runPlan(planActivateAccount(ACCOUNT, admin), "t");
    expect(writes()).toEqual([
      { method: "update", table: ACCOUNTS, id: ACCOUNT, body: { statecode: 0, statuscode: 1 } },
    ]);
    expect(guardedSdk.reads).toEqual([{ table: ACCOUNTS, id: ACCOUNT }]);
  });

  it("UT-ADCAPEX-037 Activating a subaccount changes status only", async () => {
    await runPlan(planActivateSubaccount(SUB_A, admin), "t");
    expect(writes()).toEqual([
      { method: "update", table: ACCOUNTS, id: SUB_A, body: { statecode: 0, statuscode: 1 } },
    ]);
    expect(guardedSdk.reads).toEqual([{ table: ACCOUNTS, id: SUB_A }]);
  });
});

describe("The admin refusal is inside the plan too", () => {
  const refusals: [string, WritePlan][] = [
    ["rename", planRenameAccount(ACCOUNT, "x", { canEdit: false })],
    ["activate account", planActivateAccount(ACCOUNT, { canEdit: false })],
    ["activate subaccount", planActivateSubaccount(SUB_A, { canEdit: false })],
  ];

  it.each(refusals)("UT-ADCAPEX-W06 %s without admin access: refused with the screen's text, nothing sent", async (_name, plan) => {
    expect(plan).toEqual({ writes: [], log: [], refusedReason: OUT_OF_SCOPE });
    const error = await runPlan(plan, "t").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PlanRefusedError);
    expect((error as Error).message).toBe("This account is outside your editable country scope.");
    expect(guardedSdk.log).toEqual([]);
  });
});
