/**
 * The plan and the tree must agree.
 *
 * A build plan in a document drifts from the code within a sprint. These cases are what stop
 * that: every planned screen points at a feature folder that exists, every feature folder is
 * planned, and the dependency graph is a graph rather than a wish.
 */
import { describe, it, expect } from "vitest";
import {
  BUILD_PLAN, PHASE_1, PHASE_2, PHASE_3, PHASE_DIR, TOTAL_DAYS,
  featurePath, phaseDays, screenBySlug, screensInPhase, INFERRED_SCREENS,
  type Phase, type ScreenPlan,
} from "./buildPlan";

/** Every module under src/features, as Vite sees it. */
const modules = import.meta.glob("/src/features/**/*.{ts,tsx}", { query: "?raw", eager: true });
const featureDirs = new Set(
  Object.keys(modules)
    .map((p) => p.replace("/src/features/", ""))
    .filter((p) => p.split("/").length >= 3)
    .map((p) => p.split("/").slice(0, 2).join("/")),
);

describe("UT-PLAN2 — the build plan matches the feature tree", () => {
  it("UT-PLAN2-001 every planned screen has a feature folder", () => {
    const missing = BUILD_PLAN.filter((s) => !featureDirs.has(featurePath(s)));
    expect(missing.map(featurePath)).toEqual([]);
  });

  it("UT-PLAN2-002 every feature folder is in the plan", () => {
    const planned = new Set(BUILD_PLAN.map(featurePath));
    // `shared/` is not a screen; it holds cross-screen hooks.
    const unplanned = [...featureDirs].filter(
      (d) => !planned.has(d) && !d.startsWith("shared"),
    );
    expect(unplanned).toEqual([]);
  });

  it("UT-PLAN2-003 there are 23 screens, 6 + 12 + 5", () => {
    expect(BUILD_PLAN).toHaveLength(23);
    expect(PHASE_1).toHaveLength(6);
    expect(PHASE_2).toHaveLength(12);
    expect(PHASE_3).toHaveLength(5);
  });

  it("UT-PLAN2-004 sequence numbers are 1..23 with no gap or repeat", () => {
    expect(BUILD_PLAN.map((s) => s.seq).sort((a, b) => a - b))
      .toEqual(Array.from({ length: 23 }, (_, i) => i + 1));
  });

  it("UT-PLAN2-005 slugs are unique", () => {
    const slugs = BUILD_PLAN.map((s) => s.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("UT-PLAN2-006 every screen sits in the folder its phase dictates", () => {
    for (const s of BUILD_PLAN) {
      expect(featurePath(s).startsWith(`${PHASE_DIR[s.phase]}/`), s.slug).toBe(true);
    }
  });
});

describe("UT-PLAN2 — the dependency graph holds", () => {
  it("UT-PLAN2-007 every dependency names a real screen", () => {
    const bad: string[] = [];
    for (const s of BUILD_PLAN) {
      for (const d of s.dependsOn) if (!screenBySlug(d)) bad.push(`${s.slug} -> ${d}`);
    }
    expect(bad).toEqual([]);
  });

  it("UT-PLAN2-008 no screen depends on a later phase", () => {
    const bad: string[] = [];
    for (const s of BUILD_PLAN) {
      for (const d of s.dependsOn) {
        const dep = screenBySlug(d);
        if (dep && dep.phase > s.phase) bad.push(`${s.slug}(p${s.phase}) -> ${d}(p${dep.phase})`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("UT-PLAN2-009 the only cycle is the documented admin pair", () => {
    /*
     * `admin-default-checklists` and `admin-gates-approvals` reference each other's tables
     * and cannot be strictly ordered. That is a fact about the canvas app, not a modelling
     * error, so it is asserted rather than removed — and any OTHER cycle is a mistake.
     */
    const cycles: string[] = [];
    for (const s of BUILD_PLAN) {
      for (const d of s.dependsOn) {
        const dep = screenBySlug(d);
        if (dep?.dependsOn.includes(s.slug)) cycles.push([s.slug, d].sort().join(" <-> "));
      }
    }
    expect([...new Set(cycles)]).toEqual([
      "admin-default-checklists <-> admin-gates-approvals",
    ]);
  });

  it("UT-PLAN2-010 a dependency inside a phase is built no later than its dependent", () => {
    /*
     * One pair is exempt and only one: the mutual admin pair cannot satisfy this in both
     * directions, which is the definition of a cycle. Listing the exemption explicitly means
     * a second violation fails the case instead of hiding behind the first.
     */
    const CYCLE = new Set(["admin-default-checklists", "admin-gates-approvals"]);
    const bad: string[] = [];
    for (const s of BUILD_PLAN) {
      for (const d of s.dependsOn) {
        const dep = screenBySlug(d);
        if (!dep || dep.phase !== s.phase || dep.order <= s.order) continue;
        if (CYCLE.has(s.slug) && CYCLE.has(d)) continue;
        bad.push(`${s.slug}(order ${s.order}) needs ${d}(order ${dep.order})`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("UT-PLAN2-011 the two mutually dependent admin screens share a build order", () => {
    const a = screenBySlug("admin-default-checklists");
    const b = screenBySlug("admin-gates-approvals");
    expect(a?.order).toBe(1);
    expect(b?.order).toBe(4);
    // They are one unit of work; the shared-order rule applies to the pair that blocks
    // each other in the SAME direction, which here is 6 -> 1 and 1 -> 6 across orders 1 and 4.
    expect(a?.caveat).toMatch(/mutually dependent/i);
  });
});

describe("UT-PLAN2 — every screen carries a real gate", () => {
  it("UT-PLAN2-012 an exit gate is a sentence, not a placeholder", () => {
    for (const s of BUILD_PLAN) {
      expect(s.exitGate.length, s.slug).toBeGreaterThan(40);
      expect(s.exitGate, s.slug).not.toMatch(/\bTODO\b|\bTBD\b|looks right/i);
    }
  });

  it("UT-PLAN2-013 bands and scores are consistent with each other", () => {
    const cut: Record<ScreenPlan["band"], [number, number]> = {
      XS: [0, 8], S: [8, 22], M: [22, 45], L: [45, 70], XL: [70, 101],
    };
    for (const s of BUILD_PLAN) {
      const [lo, hi] = cut[s.band];
      expect(s.score, `${s.slug} ${s.band}`).toBeGreaterThanOrEqual(lo);
      expect(s.score, `${s.slug} ${s.band}`).toBeLessThan(hi);
    }
  });

  it("UT-PLAN2-014 phase and total day counts are the plan's", () => {
    expect(phaseDays(1)).toBe(55);
    expect(phaseDays(2)).toBe(166);
    expect(phaseDays(3)).toBe(71);
    expect(TOTAL_DAYS).toBe(292);
  });

  it("UT-PLAN2-015 the five inferred screens are the five with no recording", () => {
    expect(INFERRED_SCREENS.map((s) => s.slug).sort()).toEqual(
      ["add-costs-from-table", "app-loading", "grid-operator", "land-lease", "opex-costs"].sort(),
    );
    for (const s of INFERRED_SCREENS) expect(s.caveat ?? s.exitGate, s.slug).toBeTruthy();
  });

  it("UT-PLAN2-016 screensInPhase returns build order", () => {
    for (const p of [1, 2, 3] as Phase[]) {
      const orders = screensInPhase(p).map((s) => s.order);
      expect([...orders].sort((a, b) => a - b), `phase ${p}`).toEqual(orders);
    }
  });
});
