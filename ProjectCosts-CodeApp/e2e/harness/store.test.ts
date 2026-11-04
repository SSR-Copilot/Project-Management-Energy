/**
 * UT-PHSTORE: the parity harness's fact store (`store.ts`). Node only, a temp directory as the repo root.
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Layer, RunEnv } from "./contract";
import { resolveRunEnv } from "./env";
import {
  factFileName, laneStartedAt, promoteReference, readFacts, readReferenceMeta, referenceDir, runJson, writeFact, writeRunJson,
} from "./store";

let root: string;
let env: RunEnv;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "phstore-"));
  env = resolveRunEnv({ PARITY_RUN_ID: "r1", PARITY_SCREEN: "land-lease" }, root);
});
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

describe("facts", () => {
  it("UT-PHSTORE-001 writeFact writes <runDir>/facts/<kind>/<layer>/<key>.json with the original key", () => {
    const path = writeFact(env, "canvas", "visual", "resting", [{ t: "Land Lease" }]);
    expect(path).toBe(join(root, "e2e", "runs", "r1", "land-lease", "facts", "canvas", "visual", "resting.json"));
    const fact = JSON.parse(readFileSync(path, "utf8"));
    expect(fact).toMatchObject({ screen: "land-lease", kind: "canvas", layer: "visual", key: "resting", data: [{ t: "Land Lease" }] });
    expect(Number.isNaN(Date.parse(fact.recordedAt))).toBe(false);
  });

  it("UT-PHSTORE-002 factFileName keeps a safe key, and makes any other key safe and unique", () => {
    expect(factFileName("card-open_2.v1")).toBe("card-open_2.v1");
    const a = factFileName("a/b");
    const b = factFileName("a:b");
    expect(a).toMatch(/^a_b-[0-9a-f]{8}$/);
    expect(a).not.toBe(b);
    expect(factFileName("con")).not.toBe("con");
    expect(factFileName("..")).not.toMatch(/^\./);
    expect(factFileName("x".repeat(200)).length).toBeLessThanOrEqual(89);
  });

  it("UT-PHSTORE-003 an unsafe key is stored under its safe name and read back with the original key", () => {
    const path = writeFact(env, "code", "validation", "Contract Name: <empty>", { a: 1 });
    expect(path.endsWith(".json")).toBe(true);
    expect(readFacts(env.runDir, "code", "validation").map((f) => f.key)).toEqual(["Contract Name: <empty>"]);
  });

  it("UT-PHSTORE-004 the same key is overwritten, not duplicated, and no temp file is left", () => {
    writeFact(env, "code", "gates", "rest", { Edit: false });
    writeFact(env, "code", "gates", "rest", { Edit: true });
    const facts = readFacts(env.runDir, "code", "gates");
    expect(facts).toHaveLength(1);
    expect(facts[0]?.data).toEqual({ Edit: true });
    expect(readdirSync(join(env.runDir, "facts", "code", "gates"))).toEqual(["rest.json"]);
  });

  it("UT-PHSTORE-005 an unknown layer or an empty key throws", () => {
    expect(() => writeFact(env, "code", "nope" as Layer, "k", 1)).toThrow(/layer/);
    expect(() => writeFact(env, "code", "visual", "", 1)).toThrow(/key/);
    expect(() => readFacts(env.runDir, "code", "nope" as Layer)).toThrow(/layer/);
  });

  it("UT-PHSTORE-006 readFacts: one app, sorted by layer then key, one layer or all, [] when nothing was recorded", () => {
    expect(readFacts(env.runDir, "code")).toEqual([]);
    writeFact(env, "code", "gates", "b", 1);
    writeFact(env, "code", "visual", "z", 2);
    writeFact(env, "code", "visual", "a", 3);
    writeFact(env, "canvas", "visual", "a", 4);
    expect(readFacts(env.runDir, "code").map((f) => `${f.layer}.${f.key}`)).toEqual(["visual.a", "visual.z", "gates.b"]);
    expect(readFacts(env.runDir, "code", "visual").map((f) => f.data)).toEqual([3, 2]);
    expect(readFacts(env.runDir, "canvas").map((f) => f.data)).toEqual([4]);
  });

  it("UT-PHSTORE-007 readFacts skips leftover temp files and throws on a malformed fact, naming the file", () => {
    writeFact(env, "code", "ux", "zoom", true);
    const folder = join(env.runDir, "facts", "code", "ux");
    writeFileSync(join(folder, "zoom.json.1.2.0.tmp"), "half");
    expect(readFacts(env.runDir, "code", "ux")).toHaveLength(1);
    writeFileSync(join(folder, "broken.json"), "{ half");
    expect(() => readFacts(env.runDir, "code", "ux")).toThrow(/broken\.json/);
  });
});

describe("the Canvas reference", () => {
  const FP = { costs: 12, latest: "2026-11-03T08:00:00Z" };

  it("UT-PHSTORE-008 referenceDir is e2e/reference/<screen>/ and refuses a non-slug", () => {
    expect(referenceDir("land-lease", root)).toBe(join(root, "e2e", "reference", "land-lease"));
    expect(() => referenceDir("../x", root)).toThrow(/slug/);
  });

  it("UT-PHSTORE-009 readReferenceMeta: null when missing or incomplete", () => {
    expect(readReferenceMeta("land-lease", root)).toBeNull();
    mkdirSync(referenceDir("land-lease", root), { recursive: true });
    writeFileSync(join(referenceDir("land-lease", root), "meta.json"), JSON.stringify({ canvasVersion: "1.21.709" }));
    expect(readReferenceMeta("land-lease", root)).toBeNull();
  });

  it("UT-PHSTORE-010 promoteReference copies this run's Canvas facts and writes meta.json", () => {
    writeFact(env, "canvas", "visual", "resting", ["a"]);
    writeFact(env, "canvas", "gates", "rest", { Edit: false });
    writeFact(env, "code", "visual", "resting", ["b"]);
    const ref = promoteReference(env, "1.21.709", FP, root);
    expect(ref).toBe(referenceDir("land-lease", root));
    expect(readFacts(ref, "canvas").map((f) => `${f.layer}.${f.key}`)).toEqual(["visual.resting", "gates.rest"]);
    expect(readFacts(ref, "code")).toEqual([]);
    expect(readReferenceMeta("land-lease", root)).toMatchObject({ canvasVersion: "1.21.709", fingerprint: FP, runId: "r1" });
  });

  it("UT-PHSTORE-011 promoteReference replaces the old reference: a state no longer recorded is gone", () => {
    writeFact(env, "canvas", "visual", "old-state", 1);
    promoteReference(env, "1.21.709", FP, root);
    const next = resolveRunEnv({ PARITY_RUN_ID: "r2", PARITY_SCREEN: "land-lease" }, root);
    writeFact(next, "canvas", "visual", "new-state", 2);
    promoteReference(next, "1.21.710", FP, root);
    expect(readFacts(referenceDir("land-lease", root), "canvas").map((f) => f.key)).toEqual(["new-state"]);
    expect(readReferenceMeta("land-lease", root)).toMatchObject({ canvasVersion: "1.21.710", runId: "r2" });
  });

  it("UT-PHSTORE-012 promoteReference with no Canvas facts throws and leaves the reference as it was", () => {
    writeFact(env, "canvas", "visual", "kept", 1);
    promoteReference(env, "1.21.709", FP, root);
    const empty = resolveRunEnv({ PARITY_RUN_ID: "r3", PARITY_SCREEN: "land-lease" }, root);
    expect(() => promoteReference(empty, "1.21.710", FP, root)).toThrow(/no Canvas facts/);
    expect(readFacts(referenceDir("land-lease", root), "canvas").map((f) => f.key)).toEqual(["kept"]);
    expect(readReferenceMeta("land-lease", root)?.runId).toBe("r1");
  });

  it("UT-PHSTORE-013 the old flat e2e/reference/*.json files and other screens' references are not touched", () => {
    const flat = join(root, "e2e", "reference", "landlease.resting.canvas.texts.json");
    mkdirSync(join(root, "e2e", "reference"), { recursive: true });
    writeFileSync(flat, "[]");
    const other = resolveRunEnv({ PARITY_RUN_ID: "r1", PARITY_SCREEN: "opex" }, root);
    writeFact(other, "canvas", "visual", "opex-state", 1);
    promoteReference(other, "1.21.709", FP, root);
    writeFact(env, "canvas", "visual", "lease-state", 2);
    promoteReference(env, "1.21.709", FP, root);
    expect(readFileSync(flat, "utf8")).toBe("[]");
    expect(readFacts(referenceDir("opex", root), "canvas").map((f) => f.key)).toEqual(["opex-state"]);
  });

  it("UT-PHSTORE-017 promoteReference on the same canvas version replaces only the layers this run recorded", () => {
    writeFact(env, "canvas", "visual", "old-state", 1);
    writeFact(env, "canvas", "flows", "contract", { create: { costs: [] } });
    promoteReference(env, "1.21.709", FP, root);
    const readRun = resolveRunEnv({ PARITY_RUN_ID: "r2", PARITY_SCREEN: "land-lease" }, root);
    writeFact(readRun, "canvas", "visual", "new-state", 2); // a read-tier run: no flows recorded
    promoteReference(readRun, "1.21.709", FP, root);
    expect(readFacts(referenceDir("land-lease", root), "canvas").map((f) => `${f.layer}.${f.key}`))
      .toEqual(["visual.new-state", "flows.contract"]);
    expect(readReferenceMeta("land-lease", root)?.runId).toBe("r2");
  });
});

describe("run state", () => {
  it("UT-PHSTORE-014 runJson is null until writeRunJson writes <runDir>/run.json", () => {
    expect(runJson(env)).toBeNull();
    const path = writeRunJson(env, { startedAt: "2026-11-03T08:00:00.000Z", canvasVersion: "1.21.709" });
    expect(path).toBe(join(env.runDir, "run.json"));
    expect(runJson(env)).toEqual({ startedAt: "2026-11-03T08:00:00.000Z", canvasVersion: "1.21.709" });
  });

  it("UT-PHSTORE-015 laneStartedAt keeps a lane's start across workers of one runner, and restarts for another runner", () => {
    expect(laneStartedAt(env.runDir, "code-A", 111, 1000)).toBe(1000);
    expect(laneStartedAt(env.runDir, "code-A", 111, 5000)).toBe(1000); // a restarted worker, same runner
    expect(laneStartedAt(env.runDir, "code-B", 111, 7000)).toBe(7000); // another lane, its own clock
    expect(laneStartedAt(env.runDir, "code-A", 222, 9000)).toBe(9000); // the re-run pass: a new invocation
    expect(existsSync(join(env.runDir, "lanes", "code-A.clock.json"))).toBe(true);
  });

  it("UT-PHSTORE-016 laneStartedAt replaces a malformed clock file", () => {
    mkdirSync(join(env.runDir, "lanes"), { recursive: true });
    writeFileSync(join(env.runDir, "lanes", "canvas-A.clock.json"), "{ half");
    expect(laneStartedAt(env.runDir, "canvas-A", 111, 4242)).toBe(4242);
    expect(laneStartedAt(env.runDir, "canvas-A", 111, 9999)).toBe(4242);
  });
});
