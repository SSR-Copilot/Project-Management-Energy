import { describe, expect, it } from "vitest";
import { isDirty } from "./form";

describe("isDirty (H7)", () => {
  it("equal values are clean; any change is dirty", () => {
    expect(isDirty({ a: "x", b: [1, 2] }, { a: "x", b: [1, 2] })).toBe(false);
    expect(isDirty({ a: "y", b: [1, 2] }, { a: "x", b: [1, 2] })).toBe(true);
    expect(isDirty({ a: "x", b: [2, 1] }, { a: "x", b: [1, 2] })).toBe(true);
    expect(isDirty("a", "a")).toBe(false);
  });

  it("the normaliser compares a canonical form", () => {
    const normalize = (f: { name: string; ids: string[] }) => ({ name: f.name.trim(), ids: [...f.ids].sort() });
    expect(isDirty({ name: " A ", ids: ["2", "1"] }, { name: "A", ids: ["1", "2"] }, normalize)).toBe(false);
    expect(isDirty({ name: "B", ids: ["1"] }, { name: "A", ids: ["1"] }, normalize)).toBe(true);
  });

  it("key order matters (same constructor, same order)", () => {
    expect(isDirty({ a: 1, b: 2 } as Record<string, number>, { b: 2, a: 1 })).toBe(true);
  });

  it("undefined fields are dropped by JSON, as on every screen today", () => {
    expect(isDirty({ a: 1, b: undefined } as { a: number; b?: number }, { a: 1 })).toBe(false);
  });
});
