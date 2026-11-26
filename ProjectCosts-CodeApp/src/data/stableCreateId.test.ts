/**
 * UT-STABLEID-001..012 — a header create that survives an ambiguous failure (dvopt T-09 part, CB-14).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@microsoft/power-apps/data", () => ({ getClient: () => ({}) }));

import type { IOperationResult } from "@microsoft/power-apps/data";
import { createWithStableId, resetStableCreateIds } from "./stableCreateId";

const SET = "vsb_landleaseprojectcosts";
const KEY = "vsb_landleaseprojectcostid";

let sent: Record<string, unknown>[];
let outcome: "ok" | "fail" | "throw";
const create = async (payload: Record<string, unknown>): Promise<IOperationResult<Record<string, unknown>>> => {
  sent.push(payload);
  if (outcome === "throw") throw new Error("socket closed");
  if (outcome === "fail") return { success: false, error: new Error("gateway timeout") } as unknown as IOperationResult<Record<string, unknown>>;
  return { success: true, data: { [KEY]: String(payload[KEY] ?? "server-issued") } } as IOperationResult<Record<string, unknown>>;
};
let ids: string[];
const newId = () => ids.shift() ?? "id-x";
const input = (payload: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  operation: "create thing", entitySet: SET, idField: KEY, payload, create, newId, enabled: true, ...extra,
});

beforeEach(() => {
  sent = [];
  outcome = "ok";
  ids = ["id-1", "id-2", "id-3"];
  resetStableCreateIds();
});

describe("createWithStableId", () => {
  it("UT-STABLEID-001 the create carries a client id and returns it", async () => {
    const r = await createWithStableId(input({ vsb_name: "A" }));
    expect(sent).toEqual([{ vsb_name: "A", [KEY]: "id-1" }]);
    expect(r).toMatchObject({ id: "id-1", reused: false });
  });

  it("UT-STABLEID-002 the success path sends the same single POST as the old code, plus the id column (oracle)", async () => {
    const payload = { vsb_name: "A", "vsb_Project@odata.bind": "/vsb_projects(p)", n: 3 };
    await createWithStableId(input(payload, { enabled: false }));
    const legacy = sent.shift()!;
    await createWithStableId(input(payload));
    const stable = sent.shift()!;
    expect(legacy).toEqual(payload);
    expect(stable).toEqual({ ...payload, [KEY]: "id-1" });
  });

  it("UT-STABLEID-003 disabled: no id is sent and the server's id is returned", async () => {
    const r = await createWithStableId(input({ vsb_name: "A" }, { enabled: false }));
    expect(sent).toEqual([{ vsb_name: "A" }]);
    expect(r.id).toBe("server-issued");
  });

  it("UT-STABLEID-013 STABLE_CREATE_IDS ships OFF at integration (CB-14): with no override the old single POST is sent, with no id column", async () => {
    const r = await createWithStableId(input({ vsb_name: "A" }, { enabled: undefined }));
    expect(sent).toEqual([{ vsb_name: "A" }]);
    expect(r.id).toBe("server-issued");
  });

  it("UT-STABLEID-004 a failed create keeps its id: the SAME save retried (the row did not land) sends the same id", async () => {
    outcome = "fail";
    await expect(createWithStableId(input({ vsb_name: "A" }))).rejects.toThrow(/gateway timeout/);
    const exists = vi.fn(async () => false);
    outcome = "ok";
    const r = await createWithStableId(input({ vsb_name: "A" }, { exists }));
    expect(exists).toHaveBeenCalledWith("id-1");
    expect(sent.map((p) => p[KEY])).toEqual(["id-1", "id-1"]);
    expect(r.id).toBe("id-1");
  });

  it("UT-STABLEID-005 a THROWN create (network) keeps its id too", async () => {
    outcome = "throw";
    await expect(createWithStableId(input({ vsb_name: "A" }))).rejects.toThrow(/socket closed/);
    outcome = "ok";
    await createWithStableId(input({ vsb_name: "A" }, { exists: async () => false }));
    expect(sent.map((p) => p[KEY])).toEqual(["id-1", "id-1"]);
  });

  it("UT-STABLEID-006 when the earlier POST had landed, the retry reads it back and sends NOTHING (no duplicate)", async () => {
    outcome = "fail";
    await expect(createWithStableId(input({ vsb_name: "A" }))).rejects.toThrow();
    sent = [];
    outcome = "ok";
    const r = await createWithStableId(input({ vsb_name: "A" }, { exists: async () => true }));
    expect(sent).toEqual([]);
    expect(r).toEqual({ row: null, id: "id-1", reused: true });
  });

  it("UT-STABLEID-007 a confirmed create forgets its id: two deliberate identical creates make two rows", async () => {
    await createWithStableId(input({ vsb_name: "A" }));
    await createWithStableId(input({ vsb_name: "A" }));
    expect(sent.map((p) => p[KEY])).toEqual(["id-1", "id-2"]);
  });

  it("UT-STABLEID-008 an EDITED retry (a different payload) is a different save and gets a new id", async () => {
    outcome = "fail";
    await expect(createWithStableId(input({ vsb_name: "A" }))).rejects.toThrow();
    outcome = "ok";
    await createWithStableId(input({ vsb_name: "B" }, { exists: async () => { throw new Error("must not be asked"); } }));
    expect(sent.map((p) => p[KEY])).toEqual(["id-1", "id-2"]);
  });

  it("UT-STABLEID-009 the same payload with its keys in another order is the same save", async () => {
    outcome = "fail";
    await expect(createWithStableId(input({ a: 1, b: { y: 2, x: [1, 2] } }))).rejects.toThrow();
    outcome = "ok";
    await createWithStableId(input({ b: { x: [1, 2], y: 2 }, a: 1 }, { exists: async () => false }));
    expect(sent.map((p) => p[KEY])).toEqual(["id-1", "id-1"]);
  });

  it("UT-STABLEID-010 a failed READ-BACK throws and keeps the id: the retry fails visibly instead of guessing", async () => {
    outcome = "fail";
    await expect(createWithStableId(input({ vsb_name: "A" }))).rejects.toThrow();
    sent = [];
    outcome = "ok";
    await expect(createWithStableId(input({ vsb_name: "A" }, { exists: async () => { throw new Error("read failed"); } })))
      .rejects.toThrow(/read failed/);
    expect(sent).toEqual([]);
    const r = await createWithStableId(input({ vsb_name: "A" }, { exists: async () => false }));
    expect(r.id).toBe("id-1");
  });

  it("UT-STABLEID-011 a server that answers with another id (it ignored ours) wins: the returned id is used", async () => {
    const r = await createWithStableId({
      ...input({ vsb_name: "A" }),
      create: async () => ({ success: true, data: { [KEY]: "server-id" } }) as IOperationResult<Record<string, unknown>>,
    });
    expect(r.id).toBe("server-id");
  });

  it("UT-STABLEID-012 the registry is bounded (50), so a long session of failed saves cannot grow it without limit", async () => {
    outcome = "fail";
    ids = Array.from({ length: 60 }, (_, i) => `id-${i + 1}`);
    for (let i = 0; i < 60; i += 1) await createWithStableId(input({ n: i })).catch(() => undefined);
    outcome = "ok";
    sent = [];
    // The oldest save was dropped: its retry gets a NEW id and asks no read-back; a recent one is still remembered.
    const exists = vi.fn(async () => false);
    await createWithStableId(input({ n: 0 }, { exists }));
    expect(exists).not.toHaveBeenCalled();
    await createWithStableId(input({ n: 59 }, { exists }));
    expect(exists).toHaveBeenCalledWith("id-60");
  });
});
