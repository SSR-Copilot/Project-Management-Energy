/**
 * UT-VGPOL-001.. — `verifyGone`'s read-back through the request policy (dvopt T-11, CA-01, CA-17; switch `POLICY_VERIFY_READS`).
 * A 429 or a transient failure is tried again; a read that keeps failing still THROWS (never "gone"); 400, 403 and 404 are sent once.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ flags: { POLICY_VERIFY_READS: true } }));
vi.mock("@microsoft/power-apps/data", () => ({ getClient: () => ({}) }));
vi.mock("./requestFlags", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./requestFlags")>();
  return { ...actual, get POLICY_VERIFY_READS() { return h.flags.POLICY_VERIFY_READS; } };
});

import { DataError } from "@/platform/errors";
import { setPolicyTestSeams } from "./requestPolicy";
import { verifyGone, type VerifyClient } from "./verifyGone";

const SET = "vsb_capexaccountlists";
const PK = "vsb_capexaccountlistid";
const g = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const bad = (status: number) => ({ success: false as const, error: Object.assign(new Error(`HTTP ${status}`), { status }) });
const rows = (...ids: string[]) => ({ success: true as const, data: ids.map((id) => ({ [PK]: id })) });
const waits: number[] = [];

function client(answers: unknown[]) {
  let n = 0;
  const raw = { retrieveMultipleRecordsAsync: vi.fn(async () => answers[Math.min(n++, answers.length - 1)]) };
  return { client: raw as unknown as VerifyClient, raw };
}

beforeEach(() => {
  h.flags.POLICY_VERIFY_READS = true;
  waits.length = 0;
  setPolicyTestSeams({ sleep: async (ms) => { waits.push(ms); }, random: () => 0.5 });
});
afterEach(() => setPolicyTestSeams(null));

describe("verifyGone through the policy", () => {
  it("UT-VGPOL-001 a 429 then a 503 on the read-back are retried; the answer is the still-present ids", async () => {
    const { client: c, raw } = client([bad(429), bad(503), rows(g(2))]);
    await expect(verifyGone(c, SET, [g(1), g(2)])).resolves.toEqual([g(2)]);
    expect(raw.retrieveMultipleRecordsAsync).toHaveBeenCalledTimes(3);
    expect(waits).toHaveLength(2);
  });

  it("UT-VGPOL-002 a read that keeps failing THROWS (never 'gone'): 3 tries for a 503, once for a 403", async () => {
    const a = client([bad(503)]);
    await expect(verifyGone(a.client, SET, [g(1)])).rejects.toBeInstanceOf(DataError);
    expect(a.raw.retrieveMultipleRecordsAsync).toHaveBeenCalledTimes(3);
    const b = client([bad(403)]);
    await expect(verifyGone(b.client, SET, [g(1)])).rejects.toBeInstanceOf(DataError);
    expect(b.raw.retrieveMultipleRecordsAsync).toHaveBeenCalledTimes(1);
  });

  it("UT-VGPOL-003 the switch OFF: one attempt, the same DataError", async () => {
    h.flags.POLICY_VERIFY_READS = false;
    const { client: c, raw } = client([bad(503), rows()]);
    await expect(verifyGone(c, SET, [g(1)])).rejects.toBeInstanceOf(DataError);
    expect(raw.retrieveMultipleRecordsAsync).toHaveBeenCalledTimes(1);
    expect(waits).toEqual([]);
  });

  it("UT-VGPOL-004 with no failure the result and the number of reads are the same ON and OFF (differential)", async () => {
    const run = async (on: boolean) => {
      h.flags.POLICY_VERIFY_READS = on;
      const { client: c, raw } = client([rows(g(3))]);
      const present = await verifyGone(c, SET, [g(1), g(2), g(3)]);
      return { present, calls: raw.retrieveMultipleRecordsAsync.mock.calls.length };
    };
    expect(await run(true)).toEqual(await run(false));
  });
});
