/**
 * V-1 (shared, `09-upsert-risk.md` P7 / P8): the General Data save PATCHes `vsb_projects` through
 * `updateRecordIfExists`. Project Overview deletes projects, and the SDK 1.3.1's If-Match-less PATCH
 * would otherwise recreate a deleted project holding only the General Data columns.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const log: string[] = [];

vi.mock("@microsoft/power-apps/data", async () => (await import("./testing/guardedSdkFake")).sdkModule);
vi.mock("@/generated/services/Vsb_projectsService", () => ({
  Vsb_projectsService: {
    create: async () => {
      log.push("create project");
      return { success: true, data: { vsb_projectid: NEW_PROJECT } };
    },
    get: async () => ({ success: true, data: { vsb_projectid: NEW_PROJECT, vsb_name: "P-0001" } }),
    update: async () => { throw new Error("unguarded update must not be used"); },
  },
}));
vi.mock("@/generated/services/Vsb_shareholderentitiiesService", () => ({
  Vsb_shareholderentitiiesService: {
    delete: async (id: string) => { log.push(`delete shareholder ${id}`); },
  },
}));
vi.mock("./bulkWrite", () => ({
  createAndUpdateMultiple: async () => { log.push("shareholders bulk"); },
}));

import { guardedSdk, resetGuardedSdk } from "./testing/guardedSdkFake";
import { RecordGoneError } from "@/platform/errors";

const { saveGeneralData } = await import("./generalData");

const PROJECT = "ac3168e6-2b7c-ef11-ac20-6045bda08851";
const NEW_PROJECT = "910d8ed0-282a-ef11-840a-6045bd9e5ce7";
const SHAREHOLDER = "61a30faa-b7e1-eddc-a5b5-fc1376f538f5";

const project = { id: PROJECT, projectName: "Quellendorf I", internalProjectId: "Q-1" } as never;
const args = {
  project,
  shareholders: [{ id: SHAREHOLDER, name: "A", customName: "", ownership: 100, shareholderType: 1 }] as never,
  deletedShareholderIds: [SHAREHOLDER],
};

beforeEach(() => {
  resetGuardedSdk();
  log.length = 0;
  guardedSdk.onUpdate = (u) => { log.push(`update ${u.table}`); };
});

describe("saveGeneralData — V-1 guard", () => {
  it("UT-GD-V1-001 a project deleted meanwhile: NOTHING is written and RecordGoneError surfaces", async () => {
    guardedSdk.gone.add(PROJECT);
    const error = await saveGeneralData(args).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RecordGoneError);
    expect(guardedSdk.updates).toEqual([]);
    // No shareholder write either: the guarded PATCH runs first.
    expect(log).toEqual([]);
  });

  it("UT-GD-V1-002 an existing project is checked, PATCHed, then the shareholders written", async () => {
    const result = await saveGeneralData(args);
    expect(guardedSdk.reads).toEqual([{ table: "vsb_projects", id: PROJECT }]);
    expect(guardedSdk.updates[0]?.body.vsb_projectname).toBe("Quellendorf I");
    expect(log).toEqual(["update vsb_projects", "shareholders bulk", `delete shareholder ${SHAREHOLDER}`]);
    expect(result).toEqual({ projectId: PROJECT, internalProjectId: "Q-1" });
  });

  it("UT-GD-V1-003 a NEW project: the Internal Project ID copy-back is guarded too", async () => {
    const result = await saveGeneralData({
      project: { id: null, projectName: "New" } as never, shareholders: [], deletedShareholderIds: [],
    });
    expect(log).toEqual(["create project", "update vsb_projects"]);
    expect(guardedSdk.reads).toEqual([{ table: "vsb_projects", id: NEW_PROJECT }]);
    expect(guardedSdk.updates[0]?.body).toEqual({ vsb_internalprojectid: "P-0001" });
    expect(result.internalProjectId).toBe("P-0001");
  });
});
