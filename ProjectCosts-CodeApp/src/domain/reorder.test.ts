import { describe, expect, it } from "vitest";
import { ORDER_BASE, moveAnnouncement, moveBy, moveItem, nextOrder, orderChanged, reorderDiff, reorderPatch } from "./reorder";

describe("MoveItem / moveBy", () => {
  it("UT-REORDER-001 Moves and returns a new array (CAPEX signature)", () => {
    const list = ["a", "b", "c", "d"];
    expect(moveItem(list, 0, 2)).toEqual(["b", "c", "a", "d"]);
    expect(moveItem(list, 3, 0)).toEqual(["d", "a", "b", "c"]);
    expect(list).toEqual(["a", "b", "c", "d"]);
  });
  it("UT-REORDER-002 Out-of-range moves return a copy", () => {
    const list = ["a", "b"];
    expect(moveItem(list, 0, 5)).toEqual(["a", "b"]);
    expect(moveItem(list, -1, 0)).toEqual(["a", "b"]);
    expect(moveItem(list, 1, 1)).not.toBe(list);
  });
  it("UT-REORDER-003 MoveBy ±1 (Check List Settings signature)", () => {
    expect(moveBy(["a", "b", "c"], 1, -1)).toEqual(["b", "a", "c"]);
    expect(moveBy(["a", "b", "c"], 2, 1)).toEqual(["a", "b", "c"]);
  });
});

describe("ReorderDiff / reorderPatch", () => {
  it("UT-REORDER-004 Writes 1-based positions for changed rows only", () => {
    expect(ORDER_BASE).toBe(1);
    expect(reorderDiff([{ id: "b", order: 2 }, { id: "a", order: 1 }, { id: "c", order: 3 }]))
      .toEqual([{ id: "b", order: 1 }, { id: "a", order: 2 }]);
  });
  it("UT-REORDER-005 Treats a null order as changed", () => {
    expect(reorderDiff([{ id: "a", order: null }])).toEqual([{ id: "a", order: 1 }]);
  });
  it("UT-REORDER-006 ReorderPatch takes the current rows and the new id order, ignoring unknown ids", () => {
    const current = [{ id: "a", order: 1 }, { id: "b", order: 2 }, { id: "c", order: 3 }];
    expect(reorderPatch(current, ["c", "a", "b"])).toEqual([
      { id: "c", order: 1 }, { id: "a", order: 2 }, { id: "b", order: 3 },
    ]);
    expect(reorderPatch(current, ["x", "a", "b", "c"])).toEqual([
      { id: "a", order: 2 }, { id: "b", order: 3 }, { id: "c", order: 4 },
    ]);
  });
});

describe("OrderChanged / moveAnnouncement", () => {
  it("UT-REORDER-007 Compares id sequences", () => {
    expect(orderChanged([{ id: "a" }, { id: "b" }], [{ id: "a" }, { id: "b" }])).toBe(false);
    expect(orderChanged([{ id: "a" }, { id: "b" }], [{ id: "b" }, { id: "a" }])).toBe(true);
    expect(orderChanged([{ id: "a" }], [])).toBe(true);
  });
  it("UT-REORDER-008 Announces with or without the period", () => {
    expect(moveAnnouncement("Task", 2, 5)).toBe("Task moved to position 2 of 5.");
    expect(moveAnnouncement("100 - Grid", 1, 3, false)).toBe("100 - Grid moved to position 1 of 3");
  });
});

describe("E10: orderChanged with string ids, nextOrder", () => {
  it("UT-REORDER-009 OrderChanged accepts plain id strings and mixed shapes", () => {
    expect(orderChanged(["a", "b"], ["a", "b"])).toBe(false);
    expect(orderChanged(["a", "b"], ["b", "a"])).toBe(true);
    expect(orderChanged(["a"], ["a", "b"])).toBe(true);
    expect(orderChanged([{ id: "a" }, { id: "b" }], ["a", "b"])).toBe(false);
  });

  it("UT-REORDER-010 NextOrder = max(0, …orders) + 1; null / undefined count as 0; empty → 1", () => {
    expect(nextOrder([])).toBe(1);
    expect(nextOrder([3, 1, 2])).toBe(4);
    expect(nextOrder([null, undefined])).toBe(1);
    expect(nextOrder([null, 5, undefined])).toBe(6);
    expect(nextOrder([-4])).toBe(1);
  });
});
