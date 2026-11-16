/** UT-CONC-020.. — `createSerialRunner`: tasks with the same key one after another, others free (DEL-4). */
import { describe, expect, it } from "vitest";
import { createGate, createSerialRunner } from "./concurrency";

const wait = (ms: number) => new Promise<void>((r) => { setTimeout(r, ms); });

describe("createSerialRunner", () => {
  it("UT-CONC-020 same key: strictly in call order, never overlapping; the result of each task is returned", async () => {
    const serial = createSerialRunner();
    const log: string[] = [];
    const task = (n: number) => async () => { log.push(`s${n}`); await wait(5 - n); log.push(`e${n}`); return n; };
    const results = await Promise.all([1, 2, 3].map((n) => serial("k", task(n))));
    expect(results).toEqual([1, 2, 3]);
    expect(log).toEqual(["s1", "e1", "s2", "e2", "s3", "e3"]);
  });

  it("UT-CONC-021 different keys and no key run in parallel", async () => {
    const serial = createSerialRunner();
    let inFlight = 0;
    let peak = 0;
    const task = async () => { inFlight += 1; peak = Math.max(peak, inFlight); await wait(10); inFlight -= 1; };
    await Promise.all([serial("a", task), serial("b", task), serial(undefined, task), serial("", task), serial(undefined, task)]);
    expect(peak).toBe(5);
  });

  it("UT-CONC-022 a failed task does not stop the next one of its key, and its rejection reaches only its own caller", async () => {
    const serial = createSerialRunner();
    const first = serial("k", async () => { throw new Error("boom"); });
    const second = serial("k", async () => "after");
    await expect(first).rejects.toThrow("boom");
    await expect(second).resolves.toBe("after");
  });

  it("UT-CONC-023 a later call after the chain has drained starts at once", async () => {
    const serial = createSerialRunner();
    await serial("k", async () => wait(2));
    await wait(1);
    await expect(serial("k", async () => "again")).resolves.toBe("again");
  });

  it("UT-CONC-024 outside a gate slot: a long queue on one key never holds the slots the other keys need", async () => {
    const serial = createSerialRunner();
    const gate = createGate(2);
    const order: string[] = [];
    const send = (name: string) => () => gate(async () => { await wait(4); order.push(name); });
    await Promise.all([
      ...["a1", "a2", "a3", "a4"].map((n) => serial("A", send(n))),
      serial("B", send("b1")),
    ]);
    expect(order.indexOf("b1")).toBeLessThan(order.indexOf("a4"));
    expect(order.filter((n) => n.startsWith("a"))).toEqual(["a1", "a2", "a3", "a4"]);
    expect(gate.peak()).toBeLessThanOrEqual(2);
  });
});
