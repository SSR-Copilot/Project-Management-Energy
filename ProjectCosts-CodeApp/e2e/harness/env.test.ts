/**
 * UT-PHENV: the parity harness's run settings (`env.ts`). Node only, a temp directory as the repo root; fake GUIDs only.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { OpenSpec, RunEnv, ScreenManifest } from "./contract";
import {
  laneOf, laneOfTitle, listScreens, newRunId, opensWithProject, overBudget, requireProjectId, resolveRunEnv, resolveRunId, screenRequired,
} from "./env";

const READ = "00000000-0000-4000-8000-000000000001";
const CANVAS_W = "00000000-0000-4000-8000-000000000002";
const CODE_W = "00000000-0000-4000-8000-000000000003";
const NOW = new Date(2026, 10, 3, 9, 5); // local time, 3 Nov 2026 09:05

let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), "phenv-")); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

const env = (vars: Record<string, string | undefined>): RunEnv => resolveRunEnv({ PARITY_RUN_ID: "r1", PARITY_SCREEN: "land-lease", ...vars }, root, NOW);
const screen = (open: OpenSpec): Pick<ScreenManifest, "slug" | "open"> => ({ slug: "some-screen", open });
const COST: OpenSpec = { app: "cost", canvasMenu: "Land Lease", codeRoute: "landlease" };
const ADMIN: OpenSpec = { app: "admin", leftMenuLabel: "Milestones", codeRoute: "/admin/milestones" };

describe("resolveRunEnv", () => {
  it("UT-PHENV-001 defaults: full, full, 5 lanes, run folder per screen", () => {
    const e = env({ PARITY_READ_PROJECT_ID: READ });
    expect(e).toMatchObject({ screen: "land-lease", mode: "full", tier: "full", lanes: 5, runId: "r1" });
    expect(e.runDir).toBe(join(root, "e2e", "runs", "r1", "land-lease"));
  });

  it("UT-PHENV-024 no default screen: PARITY_SCREEN unset or blank throws, listing the screens of <root>/e2e/screens", () => {
    expect(() => resolveRunEnv({ PARITY_RUN_ID: "r1" }, root, NOW)).toThrow("set PARITY_SCREEN to one of: (no e2e/screens/<slug>/manifest.ts yet)");
    for (const s of ["opex", "land-lease"]) {
      mkdirSync(join(root, "e2e", "screens", s), { recursive: true });
      writeFileSync(join(root, "e2e", "screens", s, "manifest.ts"), "export {}");
    }
    mkdirSync(join(root, "e2e", "screens", "draft-only"), { recursive: true });
    expect(() => resolveRunEnv({ PARITY_RUN_ID: "r1", PARITY_SCREEN: "  " }, root, NOW)).toThrow("set PARITY_SCREEN to one of: land-lease, opex");
    expect(listScreens(join(root, "e2e", "screens"))).toEqual(["land-lease", "opex"]);
    expect(screenRequired([])).toMatch(/^set PARITY_SCREEN to one of: /);
  });

  it("UT-PHENV-002 reads PARITY_SCREEN / MODE / TIER / LANES", () => {
    const e = env({ PARITY_SCREEN: "admin-milestones", PARITY_MODE: "compare", PARITY_TIER: "smoke", PARITY_LANES: "3" });
    expect(e).toMatchObject({ screen: "admin-milestones", mode: "compare", tier: "smoke", lanes: 3 });
    expect(e.runDir).toBe(join(root, "e2e", "runs", "r1", "admin-milestones"));
  });

  it("UT-PHENV-003 two screens of one batch share the run id, each in its own folder", () => {
    // No PARITY_RUN_ID here on purpose: both read the id the first one wrote to e2e/runs/latest.json.
    const a = resolveRunEnv({ PARITY_SCREEN: "land-lease" }, root, NOW);
    const b = resolveRunEnv({ PARITY_SCREEN: "opex" }, root, new Date(2026, 10, 3, 9, 47)); // a later minute: still latest.json's id
    expect(a.runId).toBe(b.runId);
    expect(a.runDir).not.toBe(b.runDir);
  });

  it("UT-PHENV-004 a wrong mode, tier or lane count throws naming the variable", () => {
    expect(() => env({ PARITY_MODE: "fast" })).toThrow(/PARITY_MODE/);
    expect(() => env({ PARITY_TIER: "all" })).toThrow(/PARITY_TIER/);
    expect(() => env({ PARITY_LANES: "0" })).toThrow(/PARITY_LANES/);
    expect(() => env({ PARITY_LANES: "2.5" })).toThrow(/PARITY_LANES/);
  });

  it("UT-PHENV-005 a screen that is not a lower-case slug throws (it becomes a folder name)", () => {
    expect(() => env({ PARITY_SCREEN: "../x" })).toThrow(/PARITY_SCREEN/);
    expect(() => env({ PARITY_SCREEN: "Land Lease" })).toThrow(/PARITY_SCREEN/);
  });

  it("UT-PHENV-006 no project set: the read project is empty and nothing throws (a screen without a project)", () => {
    const e = env({});
    expect(e.readProjectId).toBe("");
    expect(e.writeProjectCanvas).toBe("");
    expect(e.writeProjectCode).toBe("");
    expect(e.writesInParallel).toBe(false);
  });

  it("UT-PHENV-007 the read project: PARITY_READ_PROJECT_ID only, lower-cased; the old specs' LANDLEASE_PROJECT_ID is not read", () => {
    expect(env({ LANDLEASE_PROJECT_ID: READ }).readProjectId).toBe("");
    expect(env({ PARITY_READ_PROJECT_ID: CODE_W, LANDLEASE_PROJECT_ID: READ }).readProjectId).toBe(CODE_W);
    expect(env({ PARITY_READ_PROJECT_ID: READ.toUpperCase() }).readProjectId).toBe(READ);
    expect(() => env({ LANDLEASE_PROJECT_ID: "not-a-guid" })).not.toThrow();
  });

  it("UT-PHENV-008 a project variable that is not a GUID throws naming the variable, never the value", () => {
    let message = "";
    try { env({ PARITY_READ_PROJECT_ID: "secret-value" }); } catch (e) { message = (e as Error).message; }
    expect(message).toMatch(/PARITY_READ_PROJECT_ID/);
    expect(message).not.toContain("secret-value");
    expect(() => env({ PARITY_WRITE_PROJECT_CODE: "nope" })).toThrow(/PARITY_WRITE_PROJECT_CODE/);
  });

  it("UT-PHENV-009 write projects fall back to the read project; writes then run after the read lanes", () => {
    const e = env({ PARITY_READ_PROJECT_ID: READ });
    expect(e.writeProjectCanvas).toBe(READ);
    expect(e.writeProjectCode).toBe(READ);
    expect(e.writesInParallel).toBe(false);
  });

  it("UT-PHENV-010 writesInParallel only when both write projects are set, differ, and differ from the read project", () => {
    expect(env({ PARITY_READ_PROJECT_ID: READ, PARITY_WRITE_PROJECT_CANVAS: CANVAS_W, PARITY_WRITE_PROJECT_CODE: CODE_W }).writesInParallel).toBe(true);
    expect(env({ PARITY_READ_PROJECT_ID: READ, PARITY_WRITE_PROJECT_CANVAS: CANVAS_W }).writesInParallel).toBe(false);
    expect(env({ PARITY_READ_PROJECT_ID: READ, PARITY_WRITE_PROJECT_CANVAS: CANVAS_W, PARITY_WRITE_PROJECT_CODE: CANVAS_W }).writesInParallel).toBe(false);
    expect(env({ PARITY_READ_PROJECT_ID: READ, PARITY_WRITE_PROJECT_CANVAS: READ, PARITY_WRITE_PROJECT_CODE: CODE_W }).writesInParallel).toBe(false);
  });
});

describe("resolveRunId", () => {
  const latest = () => join(root, "e2e", "runs", "latest.json");

  it("UT-PHENV-011 newRunId is local time YYYYMMDD-HHmm", () => {
    expect(newRunId(NOW)).toBe("20261103-0905");
  });

  it("UT-PHENV-012 no PARITY_RUN_ID and no latest.json: a new id, written to e2e/runs/latest.json", () => {
    expect(resolveRunId({}, root, NOW)).toBe("20261103-0905");
    expect(JSON.parse(readFileSync(latest(), "utf8"))).toEqual({ runId: "20261103-0905" });
  });

  it("UT-PHENV-013 no PARITY_RUN_ID: the id in latest.json is used, so every worker agrees", () => {
    mkdirSync(join(root, "e2e", "runs"), { recursive: true });
    writeFileSync(latest(), JSON.stringify({ runId: "20261101-1200" }));
    expect(resolveRunId({}, root, NOW)).toBe("20261101-1200");
  });

  it("UT-PHENV-014 a malformed latest.json is replaced with a new id", () => {
    mkdirSync(join(root, "e2e", "runs"), { recursive: true });
    writeFileSync(latest(), "{ not json");
    expect(resolveRunId({}, root, NOW)).toBe("20261103-0905");
    expect(JSON.parse(readFileSync(latest(), "utf8")).runId).toBe("20261103-0905");
  });

  it("UT-PHENV-015 PARITY_RUN_ID wins and must be a safe folder name", () => {
    expect(resolveRunId({ PARITY_RUN_ID: " 20261103-1712 " }, root, NOW)).toBe("20261103-1712");
    expect(() => resolveRunId({ PARITY_RUN_ID: "../up" }, root, NOW)).toThrow(/PARITY_RUN_ID/);
    expect(() => resolveRunId({ PARITY_RUN_ID: ".hidden" }, root, NOW)).toThrow(/PARITY_RUN_ID/);
  });
});

describe("requireProjectId", () => {
  it("UT-PHENV-016 opensWithProject: cost and pm yes, admin no, custom as it says", () => {
    expect(opensWithProject(COST)).toBe(true);
    expect(opensWithProject({ app: "pm", canvasScreen: "Team", codeRoute: "/project/team" })).toBe(true);
    expect(opensWithProject(ADMIN)).toBe(false);
    const open = async () => { throw new Error("not called"); };
    expect(opensWithProject({ app: "custom", projectScoped: false, open })).toBe(false);
    expect(opensWithProject({ app: "custom", projectScoped: true, open })).toBe(true);
  });

  it("UT-PHENV-017 a screen without a project gets null, with or without a project set", () => {
    expect(requireProjectId(env({}), screen(ADMIN), "read")).toBeNull();
    expect(requireProjectId(env({ PARITY_READ_PROJECT_ID: READ }), screen(ADMIN), "write", "code")).toBeNull();
  });

  it("UT-PHENV-018 a project-scoped screen without a project throws naming the screen and the variable, no value", () => {
    expect(() => requireProjectId(env({}), screen(COST), "read")).toThrow(/some-screen.*PARITY_READ_PROJECT_ID/);
    expect(() => requireProjectId(env({}), screen(COST), "read")).not.toThrow(/LANDLEASE/);
    expect(() => requireProjectId(env({}), screen(COST), "write", "canvas")).toThrow(/PARITY_WRITE_PROJECT_CANVAS/);
    expect(() => requireProjectId(env({}), screen(COST), "write", "code")).toThrow(/PARITY_WRITE_PROJECT_CODE/);
  });

  it("UT-PHENV-019 read gives the read project; write gives each app's own write project", () => {
    const e = env({ PARITY_READ_PROJECT_ID: READ, PARITY_WRITE_PROJECT_CANVAS: CANVAS_W, PARITY_WRITE_PROJECT_CODE: CODE_W });
    expect(requireProjectId(e, screen(COST), "read")).toBe(READ);
    expect(requireProjectId(e, screen(COST), "read", "canvas")).toBe(READ);
    expect(requireProjectId(e, screen(COST), "write", "canvas")).toBe(CANVAS_W);
    expect(requireProjectId(e, screen(COST), "write", "code")).toBe(CODE_W);
  });

  it("UT-PHENV-020 write without the app kind throws (it cannot pick a write project)", () => {
    expect(() => requireProjectId(env({ PARITY_READ_PROJECT_ID: READ }), screen(COST), "write")).toThrow(/kind/);
  });
});

describe("lanes", () => {
  it("UT-PHENV-021 laneOfTitle finds the @<lane> tag, and only a whole tag", () => {
    expect(laneOfTitle("visual @canvas-A resting")).toBe("canvas-A");
    expect(laneOfTitle("lanes/visual.lane.ts land-lease (@code-B) gates")).toBe("code-B");
    expect(laneOfTitle("@write-canvas flows")).toBe("write-canvas");
    expect(laneOfTitle("x @code-Ab")).toBeUndefined();
    expect(laneOfTitle("mail@code-A")).toBeUndefined();
    expect(laneOfTitle("@canvas-D")).toBeUndefined();
    expect(laneOfTitle("no tag")).toBeUndefined();
  });

  it("UT-PHENV-022 laneOf reads the title path, then the tag option, then falls back to the project name", () => {
    expect(laneOf({ titlePath: ["a.lane.ts", "visual @code-A"], project: { name: "p" } })).toBe("code-A");
    expect(laneOf({ titlePath: ["a.lane.ts", "visual"], tags: ["@canvas-C"], project: { name: "p" } })).toBe("canvas-C");
    expect(laneOf({ titlePath: ["a.lane.ts", "visual"], tags: [], project: { name: "code-B" } })).toBe("code-B");
  });

  it("UT-PHENV-023 overBudget stops a lane only past its budget plus 20 %", () => {
    expect(overBudget("code-A", 11.9 * 60_000, 10)).toBeNull();
    expect(overBudget("code-A", 12 * 60_000, 10)).toBeNull();
    expect(overBudget("code-A", 12.5 * 60_000, 10)).toBe("lane code-A over budget: 12.5 of 10 min");
    expect(overBudget("code-A", 99 * 60_000, 0)).toBeNull();
    expect(overBudget("code-A", 99 * 60_000, Number.NaN)).toBeNull();
  });
});
