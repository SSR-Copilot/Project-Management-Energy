/**
 * The shared guard (`updateRecordIfExists`) against the test-only SDK fake, as the data-module
 * tests use it. UT-GUARDFAKE-nnn.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@microsoft/power-apps/data", async () => (await import("@/test/guardedSdkFake")).sdkModule);

import { guardedSdk, resetGuardedSdk } from "@/test/guardedSdkFake";
import { updateRecordIfExists } from "@/data/client";
import { RecordGoneError } from "@/platform/errors";

const ID = "00000000-0000-0000-0000-0000000000aa";

beforeEach(() => resetGuardedSdk());

describe("GuardedSdkFake + updateRecordIfExists", () => {
  it("UT-GUARDFAKE-001 reads the row, then PATCHes it", async () => {
    await updateRecordIfExists("rename", "vsb_capexaccountlists", ID, { vsb_name: "x" }, { primaryKey: "vsb_capexaccountlistid" });
    expect(guardedSdk.reads).toEqual([{ table: "vsb_capexaccountlists", id: ID }]);
    expect(guardedSdk.updates).toEqual([{ table: "vsb_capexaccountlists", id: ID, body: { vsb_name: "x" } }]);
  });

  it("UT-GUARDFAKE-002 a deleted row raises RecordGoneError and nothing is sent", async () => {
    guardedSdk.gone.add(ID);
    await expect(updateRecordIfExists("rename", "vsb_capexaccountlists", ID, { vsb_name: "x" }, { primaryKey: "vsb_capexaccountlistid" }))
      .rejects.toBeInstanceOf(RecordGoneError);
    expect(guardedSdk.updates).toEqual([]);
  });
});
