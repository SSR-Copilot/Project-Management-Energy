/**
 * `bulkWrite.ts` — chunking, `@odata.type` stamping, and the `partial` flag that lets a caller
 * tell an honest "nothing was saved" from an honest "something was saved before this failed".
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

/** Every call any of the three generated services received, as `[entitySetName, Targets]`. */
let calls: { service: string; entitySetName: string; targets: Record<string, unknown>[] }[] = [];

/** What the next call to each service should resolve/reject with. Replayed in call order. */
let createQueue: { success: boolean; data?: unknown; error?: unknown }[] = [];
let updateQueue: { success: boolean; error?: unknown }[] = [];
let upsertQueue: { success: boolean; error?: unknown }[] = [];

vi.mock("@/generated/services/CreateMultipleService", () => ({
  CreateMultipleService: {
    CreateMultiple: async (entitySetName: string, targets: Record<string, unknown>[]) => {
      calls.push({ service: "create", entitySetName, targets });
      return createQueue.shift() ?? { success: true, data: { Ids: [] } };
    },
  },
}));
vi.mock("@/generated/services/UpdateMultipleService", () => ({
  UpdateMultipleService: {
    UpdateMultiple: async (entitySetName: string, targets: Record<string, unknown>[]) => {
      calls.push({ service: "update", entitySetName, targets });
      return updateQueue.shift() ?? { success: true, data: null };
    },
  },
}));
vi.mock("@/generated/services/UpsertMultipleService", () => ({
  UpsertMultipleService: {
    UpsertMultiple: async (entitySetName: string, targets: Record<string, unknown>[]) => {
      calls.push({ service: "upsert", entitySetName, targets });
      return upsertQueue.shift() ?? { success: true, data: null };
    },
  },
}));

const {
  BulkWriteError, BULK_CHUNK_SIZE, createAndUpdateMultiple, createMultiple, updateMultiple,
  upsertMultiple,
} = await import("./bulkWrite");

beforeEach(() => {
  calls = [];
  createQueue = [];
  updateQueue = [];
  upsertQueue = [];
});

describe("upsertMultiple", () => {
  it("UT-BULK-001 does nothing, and calls nothing, for an empty row list", async () => {
    await upsertMultiple("vsb_capexcosts", "vsb_capexcost", []);
    expect(calls).toEqual([]);
  });

  it("UT-BULK-002 stamps @odata.type on every row and sends them in one call under the limit", async () => {
    await upsertMultiple("vsb_capexcosts", "vsb_capexcost", [
      { vsb_capexcostid: "a", vsb_cost: 1 },
      { vsb_capexcostid: "b", vsb_cost: 2 },
    ]);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.service).toBe("upsert");
    expect(calls[0]?.entitySetName).toBe("vsb_capexcosts");
    expect(calls[0]?.targets).toEqual([
      { vsb_capexcostid: "a", vsb_cost: 1, "@odata.type": "Microsoft.Dynamics.CRM.vsb_capexcost" },
      { vsb_capexcostid: "b", vsb_cost: 2, "@odata.type": "Microsoft.Dynamics.CRM.vsb_capexcost" },
    ]);
  });

  it("UT-BULK-003 splits a list bigger than BULK_CHUNK_SIZE into several calls, in order", async () => {
    const rows = Array.from({ length: BULK_CHUNK_SIZE + 5 }, (_, i) => ({ id: `r${i}` }));
    await upsertMultiple("vsb_capexcosts", "vsb_capexcost", rows);
    expect(calls).toHaveLength(2);
    expect(calls[0]?.targets).toHaveLength(BULK_CHUNK_SIZE);
    expect(calls[1]?.targets).toHaveLength(5);
    expect(calls[0]?.targets[0]).toMatchObject({ id: "r0" });
    expect(calls[1]?.targets[0]).toMatchObject({ id: `r${BULK_CHUNK_SIZE}` });
  });

  it("UT-BULK-004 throws BulkWriteError with partial=false when the FIRST (only) chunk fails", async () => {
    upsertQueue = [{ success: false, error: { message: "boom" } }];
    await expect(upsertMultiple("t", "t", [{ id: "a" }])).rejects.toMatchObject({
      name: "BulkWriteError", partial: false, cause: { message: "boom" },
    });
  });

  it("UT-BULK-005 throws BulkWriteError with partial=true when a LATER chunk fails after an earlier one succeeded", async () => {
    upsertQueue = [{ success: true }, { success: false, error: "second chunk rejected" }];
    const rows = Array.from({ length: BULK_CHUNK_SIZE + 1 }, (_, i) => ({ id: `r${i}` }));
    await expect(upsertMultiple("t", "t", rows)).rejects.toMatchObject({
      name: "BulkWriteError", partial: true,
    });
    // The second chunk must actually have been attempted — the failure is real, not inferred.
    expect(calls).toHaveLength(2);
  });

  it("UT-BULK-006 never sends a third chunk once the second one has failed", async () => {
    upsertQueue = [{ success: true }, { success: false, error: "stop here" }];
    const rows = Array.from({ length: BULK_CHUNK_SIZE * 2 + 1 }, (_, i) => ({ id: `r${i}` }));
    await expect(upsertMultiple("t", "t", rows)).rejects.toThrow();
    expect(calls).toHaveLength(2);
  });
});

describe("updateMultiple", () => {
  it("UT-BULK-007 behaves like upsertMultiple but calls UpdateMultipleService", async () => {
    await updateMultiple("vsb_capexprojectcontracts", "vsb_capexprojectcontract", [
      { vsb_capexprojectcontractid: "c1", vsb_totalcost: 100 },
    ]);
    expect(calls).toEqual([{
      service: "update",
      entitySetName: "vsb_capexprojectcontracts",
      targets: [{
        vsb_capexprojectcontractid: "c1", vsb_totalcost: 100,
        "@odata.type": "Microsoft.Dynamics.CRM.vsb_capexprojectcontract",
      }],
    }]);
  });

  it("UT-BULK-008 reports partial=false on a lone failing chunk", async () => {
    updateQueue = [{ success: false, error: "nope" }];
    await expect(updateMultiple("t", "t", [{ id: "a" }])).rejects.toMatchObject({ partial: false });
  });
});

describe("createMultiple", () => {
  it("UT-BULK-009 returns the server's Ids, in input order, across chunks", async () => {
    createQueue = [
      { success: true, data: { Ids: ["id-0", "id-1"] } },
      { success: true, data: { Ids: ["id-2"] } },
    ];
    const rows = Array.from({ length: BULK_CHUNK_SIZE + 1 }, (_, i) => ({ n: i }));
    const ids = await createMultiple("t", "t", rows);
    expect(ids).toEqual(["id-0", "id-1", "id-2"]);
  });

  it("UT-BULK-010 does nothing for an empty list and returns no ids", async () => {
    const ids = await createMultiple("t", "t", []);
    expect(ids).toEqual([]);
    expect(calls).toEqual([]);
  });

  it("UT-BULK-011 throws BulkWriteError, not a raw error, on failure", async () => {
    createQueue = [{ success: false, error: "denied" }];
    await expect(createMultiple("t", "t", [{ id: "a" }]))
      .rejects.toBeInstanceOf(BulkWriteError);
  });

  it("UT-BULK-012 drops a stray primary-key value before sending, when told the field name", async () => {
    await createMultiple("t", "t", [{ myid: "should-not-be-sent", name: "x" }], "myid");
    const sent = calls[0]?.targets[0] as Record<string, unknown>;
    expect(sent).not.toHaveProperty("myid");
    expect(sent["name"]).toBe("x");
  });

  it("UT-BULK-013 sends the id unchanged when no primary-key field name is given", async () => {
    await createMultiple("t", "t", [{ myid: "kept" }]);
    expect(calls[0]?.targets[0]).toMatchObject({ myid: "kept" });
  });
});

describe("createAndUpdateMultiple", () => {
  /** `calls` entries for one service, regardless of which ran first — they run CONCURRENTLY. */
  const callsFor = (service: string) => calls.filter((c) => c.service === service);

  it("UT-BULK-014 splits by whether the primary-key field is present, both calls run", async () => {
    await createAndUpdateMultiple("vsb_capexcosts", "vsb_capexcost", [
      { vsb_capexcostid: "existing-1", vsb_cost: 1 },
      { vsb_cost: 2 }, // new — no id at all
      { vsb_capexcostid: "existing-2", vsb_cost: 3 },
    ], "vsb_capexcostid");

    expect(calls).toHaveLength(2);
    expect(callsFor("create")[0]?.targets).toEqual([
      { vsb_cost: 2, "@odata.type": "Microsoft.Dynamics.CRM.vsb_capexcost" },
    ]);
    expect(callsFor("update")[0]?.targets).toEqual([
      { vsb_capexcostid: "existing-1", vsb_cost: 1, "@odata.type": "Microsoft.Dynamics.CRM.vsb_capexcost" },
      { vsb_capexcostid: "existing-2", vsb_cost: 3, "@odata.type": "Microsoft.Dynamics.CRM.vsb_capexcost" },
    ]);
  });

  it("UT-BULK-015 returns the new rows' ids, in their own input order, ignoring existing rows", async () => {
    createQueue = [{ success: true, data: { Ids: ["new-a", "new-b"] } }];
    const result = await createAndUpdateMultiple("t", "t", [
      { id: "old-1" },
      {},
      {},
    ], "id");
    expect(result.createdIds).toEqual(["new-a", "new-b"]);
  });

  it(
    "UT-BULK-016 a failed create does NOT prevent the independent update from running — both " +
      "are attempted, since they touch disjoint rows",
    async () => {
      createQueue = [{ success: false, error: "denied" }];
      await expect(createAndUpdateMultiple("t", "t", [{ id: "old" }, {}], "id"))
        .rejects.toBeInstanceOf(BulkWriteError);
      // The update ran too, concurrently, and (by the default mock reply) succeeded.
      expect(callsFor("create")).toHaveLength(1);
      expect(callsFor("update")).toHaveLength(1);
    },
  );

  it(
    "UT-BULK-017 reports partial=true when create fails but the concurrent update actually wrote something",
    async () => {
      createQueue = [{ success: false, error: "denied" }];
      await expect(createAndUpdateMultiple("t", "t", [{ id: "old" }, {}], "id"))
        .rejects.toMatchObject({ partial: true });
    },
  );

  it(
    "UT-BULK-017b reports partial=true when update fails but the concurrent create actually wrote something",
    async () => {
      updateQueue = [{ success: false, error: "denied" }];
      await expect(createAndUpdateMultiple("t", "t", [{ id: "old" }, {}], "id"))
        .rejects.toMatchObject({ partial: true });
    },
  );

  it(
    "UT-BULK-018 a failed update keeps its OWN partial flag when there was nothing to create",
    async () => {
      // Two existing rows, enough to span two chunks, so the update's own second-chunk failure
      // is genuinely partial on its own terms — not forced true by an unrelated create.
      const rows = Array.from({ length: BULK_CHUNK_SIZE + 1 }, (_, i) => ({ id: `r${i}` }));
      updateQueue = [{ success: true }, { success: false, error: "denied" }];
      await expect(createAndUpdateMultiple("t", "t", rows, "id"))
        .rejects.toMatchObject({ partial: true });
      expect(callsFor("update")).toHaveLength(2);
    },
  );

  it(
    "UT-BULK-019 reports partial=false when nothing was created, nothing existing, and the " +
      "lone update chunk fails outright",
    async () => {
      updateQueue = [{ success: false, error: "denied" }];
      await expect(createAndUpdateMultiple("t", "t", [{ id: "old-only" }], "id"))
        .rejects.toMatchObject({ partial: false });
    },
  );

  it("UT-BULK-019b reports partial=false when both calls fail and neither wrote anything", async () => {
    createQueue = [{ success: false, error: "create denied" }];
    updateQueue = [{ success: false, error: "update denied" }];
    await expect(createAndUpdateMultiple("t", "t", [{ id: "old" }, {}], "id"))
      .rejects.toMatchObject({ partial: false });
  });

  it("UT-BULK-020 an all-new batch calls create and never calls update at all", async () => {
    await createAndUpdateMultiple("t", "t", [{}, {}], "id");
    expect(calls.every((c) => c.service === "create")).toBe(true);
  });

  it("UT-BULK-021 an all-existing batch calls update and never calls create at all", async () => {
    await createAndUpdateMultiple("t", "t", [{ id: "a" }, { id: "b" }], "id");
    expect(calls.every((c) => c.service === "update")).toBe(true);
  });
});
