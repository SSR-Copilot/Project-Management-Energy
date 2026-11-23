/**
 * UT-WAVE-001…005 — the wave recorder itself (optimization programme B0). A harness that miscounts would make every later
 * "N waves → M waves" claim worthless, so it is pinned first.
 */
import { describe, expect, it } from "vitest";
import { createWaveClient, startedTogether, waveOf } from "./waveClient";

const read = (c: ReturnType<typeof createWaveClient>, label: string) => c.fetchAll(label, undefined, {});

describe("wave recorder", () => {
  it("UT-WAVE-001 independent reads started together are ONE wave", async () => {
    const c = createWaveClient(() => []);
    const { waves, calls } = await c.run(() => Promise.all([read(c, "a"), read(c, "b"), read(c, "c")]));
    expect(waves).toBe(1);
    expect(startedTogether(calls, ["a", "b", "c"])).toBe(true);
  });

  it("UT-WAVE-002 a chain of awaited reads is one wave per link", async () => {
    const c = createWaveClient(() => []);
    const { waves, calls } = await c.run(async () => { await read(c, "a"); await read(c, "b"); await read(c, "c"); });
    expect(waves).toBe(3);
    expect([waveOf(calls, "a"), waveOf(calls, "b"), waveOf(calls, "c")]).toEqual([0, 1, 2]);
  });

  it("UT-WAVE-003 a dependent read starts in the wave after the one it waits for, beside its siblings", async () => {
    const c = createWaveClient(() => []);
    const { waves, calls } = await c.run(async () => {
      await Promise.all([read(c, "a"), read(c, "b")]);
      await Promise.all([read(c, "c"), read(c, "d")]);
    });
    expect(waves).toBe(2);
    expect(startedTogether(calls, ["a", "b"])).toBe(true);
    expect(startedTogether(calls, ["c", "d"])).toBe(true);
    expect(startedTogether(calls, ["a", "c"])).toBe(false);
  });

  it("UT-WAVE-004 answers come from the answer function and the work's value is returned", async () => {
    const c = createWaveClient((label) => (label === "x" ? [1, 2, 3] : []));
    const { value } = await c.run(async () => (await read(c, "x")).length);
    expect(value).toBe(3);
  });

  it("UT-WAVE-005 a failure in the work rejects with its own error", async () => {
    const c = createWaveClient(() => []);
    await expect(c.run(async () => { await read(c, "a"); throw new Error("boom"); })).rejects.toThrow("boom");
  });
});
