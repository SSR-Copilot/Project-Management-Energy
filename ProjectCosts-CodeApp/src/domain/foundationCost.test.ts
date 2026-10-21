import { describe, expect, it } from "vitest";
import { foundationCostAdded, foundationCostAddedBooleanReading } from "./foundationCost";

describe("foundationCost (PO M4)", () => {
  it("UT-FOUND-001 canvas behaviour: Text(Yes/No) is never \"Yes\", so the foundation cost is always added", () => {
    expect(foundationCostAdded(true)).toBe(true);
    expect(foundationCostAdded(false)).toBe(true);
  });

  it("UT-FOUND-002 twin (not live): the boolean reading adds it only when not included", () => {
    expect(foundationCostAddedBooleanReading(true)).toBe(false);
    expect(foundationCostAddedBooleanReading(false)).toBe(true);
  });
});
