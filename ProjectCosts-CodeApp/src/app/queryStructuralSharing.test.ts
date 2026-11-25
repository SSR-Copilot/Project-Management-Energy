import { describe, expect, it } from "vitest";
import { QueryClient, QueryObserver, replaceEqualDeep } from "@tanstack/react-query";
import { replaceEqualDeepWithDates, structuralSharingWithDates } from "./queryStructuralSharing";
import { queryClient } from "./Providers";

const project = () => ({
  projectId: "p-1", name: "Wirmighausen", startDate: new Date(2026, 0, 1), endDate: undefined,
  milestones: { construction: new Date(2027, 2, 1), cod: null as Date | null },
  tags: ["a", "b"],
});

describe("Date-aware structural sharing (D162, FE-SH-01)", () => {
  it("UT-QSHARE-001 an equal refetch with new Date objects keeps the cached object", () => {
    const old = project();
    expect(replaceEqualDeepWithDates(old, project())).toBe(old);
    // TanStack's own function does not: this is the defect being fixed.
    expect(replaceEqualDeep(old, project())).not.toBe(old);
  });

  it("UT-QSHARE-002 a changed Date replaces only its branch", () => {
    const old = project();
    const next = project();
    next.milestones.construction = new Date(2027, 3, 1);
    const out = replaceEqualDeepWithDates(old, next) as ReturnType<typeof project>;
    expect(out).not.toBe(old);
    expect(out.milestones).not.toBe(old.milestones);
    expect(out.milestones.construction).toBe(next.milestones.construction);
    expect(out.startDate).toBe(old.startDate);
    expect(out.tags).toBe(old.tags);
  });

  it("UT-QSHARE-003 Dates: equal times, invalid dates, a Date against a non-Date", () => {
    const d = new Date(2026, 5, 1);
    expect(replaceEqualDeepWithDates(d, new Date(d.getTime()))).toBe(d);
    const bad = new Date("x");
    expect(replaceEqualDeepWithDates(bad, new Date("y"))).toBe(bad);
    const later = new Date(2026, 5, 2);
    expect(replaceEqualDeepWithDates(d, later)).toBe(later);
    expect(replaceEqualDeepWithDates(d, d.toISOString())).toBe(d.toISOString());
    expect(replaceEqualDeepWithDates({ at: d }, { at: null })).toEqual({ at: null });
  });

  it("UT-QSHARE-004 Maps, Sets and class instances are still replaced, as TanStack does", () => {
    class Box { v: number; constructor(v: number) { this.v = v; } }
    const old = { m: new Map([["a", 1]]), s: new Set([1]), b: new Box(1) };
    const next = { m: new Map([["a", 1]]), s: new Set([1]), b: new Box(1) };
    const out = replaceEqualDeepWithDates(old, next) as typeof old;
    expect(out.m).toBe(next.m);
    expect(out.s).toBe(next.s);
    expect(out.b).toBe(next.b);
  });

  it("UT-QSHARE-005 on Date-free data it is TanStack's replaceEqualDeep (400 random pairs, identity of every branch)", () => {
    let seed = 7;
    const rnd = () => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return seed / 2 ** 31; };
    const gen = (depth: number): unknown => {
      const r = rnd();
      if (depth > 3 || r < 0.35) return [null, undefined, 0, 1, "x", "y", true][Math.floor(rnd() * 7)];
      if (r < 0.65) return Array.from({ length: Math.floor(rnd() * 4) }, () => gen(depth + 1));
      return Object.fromEntries(Array.from({ length: Math.floor(rnd() * 4) }, (_, i) => [`k${Math.floor(rnd() * 5)}${i % 2}`, gen(depth + 1)]));
    };
    const mutate = (v: unknown): unknown => (rnd() < 0.5 ? JSON.parse(JSON.stringify(v ?? null)) : gen(0));
    /** Same value AND the same object-identity pattern against the inputs. */
    const shape = (out: unknown, a: unknown, b: unknown): unknown => {
      if (out === a) return "A";
      if (out === b && typeof out === "object" && out !== null) return "B";
      if (out === null || typeof out !== "object") return out;
      const ao = (a ?? {}) as Record<string, unknown>;
      const bo = (b ?? {}) as Record<string, unknown>;
      return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, shape(v, ao[k], bo[k])]));
    };
    for (let i = 0; i < 400; i += 1) {
      const a = gen(0);
      const b = mutate(a);
      const theirs = replaceEqualDeep(a, b);
      const ours = replaceEqualDeepWithDates(a, b);
      expect(ours).toEqual(theirs);
      expect(shape(ours, a, b)).toEqual(shape(theirs, a, b));
    }
  });

  it("UT-QSHARE-006 the app's QueryClient uses it by default", () => {
    expect(queryClient.getDefaultOptions().queries?.structuralSharing).toBe(structuralSharingWithDates);
  });

  it("UT-QSHARE-007 end to end: an observer keeps the same data object across an equal refetch", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { structuralSharing: structuralSharingWithDates, retry: false } } });
    const observer = new QueryObserver(client, { queryKey: ["project", "p-1"], queryFn: async () => project() });
    const first = await observer.refetch();
    const second = await observer.refetch();
    expect(second.data).toBe(first.data);
    client.clear();
  });
});
