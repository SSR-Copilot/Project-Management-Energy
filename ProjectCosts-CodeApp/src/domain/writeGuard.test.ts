import { describe, expect, it } from "vitest";
import {
  COST_WRITE_MSG, costWriteKey, costWriteStatusLabel, leftScreenFailureToast,
  writeCommandsDisabled, writeFailureSurface,
} from "./writeGuard";

describe("writeCommandsDisabled (D57)", () => {
  it("UT-WGUARD-NOSPIN-001 idle: write commands are enabled", () => {
    expect(writeCommandsDisabled({ loading: false, writePending: false })).toBe(false);
  });

  it("UT-WGUARD-NOSPIN-002 a pending write disables them", () => {
    expect(writeCommandsDisabled({ loading: false, writePending: true })).toBe(true);
  });

  it("UT-WGUARD-NOSPIN-003 a first load disables them, with or without a pending write", () => {
    expect(writeCommandsDisabled({ loading: true, writePending: false })).toBe(true);
    expect(writeCommandsDisabled({ loading: true, writePending: true })).toBe(true);
  });

  it("UT-WGUARD-FLIGHT-001 a write still in flight from another screen disables them (CA-15)", () => {
    expect(writeCommandsDisabled({ loading: false, writePending: false, writeInFlight: true })).toBe(true);
    expect(writeCommandsDisabled({ loading: false, writePending: false, writeInFlight: false })).toBe(false);
  });
});

describe("costWriteKey (CA-15)", () => {
  it("UT-WGUARD-FLIGHT-002 the project key is a prefix of every family's key", () => {
    const base = costWriteKey("p1");
    expect(base).toEqual(["cost-write", "p1"]);
    for (const family of ["capex", "capex-comments", "periods", "land-lease", "contracts", "add-cost-sheet"] as const) {
      const key = costWriteKey("p1", family);
      expect(key.slice(0, base.length)).toEqual(base);
      expect(key[2]).toBe(family);
    }
  });

  it("UT-WGUARD-FLIGHT-003 different projects never share a key; no project is `none`", () => {
    expect(costWriteKey("p1")).not.toEqual(costWriteKey("p2"));
    expect(costWriteKey(undefined, "capex")).toEqual(["cost-write", "none", "capex"]);
  });
});

describe("writeFailureSurface (CA-15)", () => {
  it("UT-WGUARD-FLIGHT-004 a mounted screen with a banner shows it there", () => {
    expect(writeFailureSurface({ screenMounted: true, hasScreenSurface: true })).toBe("screen");
  });

  it("UT-WGUARD-FLIGHT-005 a screen that is gone, or has no surface, raises the toast", () => {
    expect(writeFailureSurface({ screenMounted: false, hasScreenSurface: true })).toBe("toast");
    expect(writeFailureSurface({ screenMounted: true, hasScreenSurface: false })).toBe("toast");
    expect(writeFailureSurface({ screenMounted: false, hasScreenSurface: false })).toBe("toast");
  });
});

describe("leftScreenFailureToast (CA-15)", () => {
  it("UT-WGUARD-FLIGHT-006 names the screen and reuses the screen's own error text", () => {
    expect(leftScreenFailureToast("Land Lease", "Error: Land Lease could not be saved. 403")).toEqual({
      message: "A change on the Land Lease screen could not be saved.",
      detail: "Error: Land Lease could not be saved. 403",
    });
  });

  it("UT-WGUARD-FLIGHT-007 falls back to the NEW detail when the screen has no text", () => {
    expect(leftScreenFailureToast("Contracts", "  ").detail).toBe(COST_WRITE_MSG.failedNoDetail);
    expect(leftScreenFailureToast("Contracts", null).detail).toBe(COST_WRITE_MSG.failedNoDetail);
  });
});

describe("costWriteStatusLabel (CA-15)", () => {
  it("UT-WGUARD-FLIGHT-008 the screen's own write text wins", () => {
    expect(costWriteStatusLabel({ ownLabel: "Saving Contract data...", ownPending: true, writeInFlight: true }))
      .toBe("Saving Contract data...");
  });

  it("UT-WGUARD-FLIGHT-009 a write from elsewhere shows the NEW line; idle shows none", () => {
    expect(costWriteStatusLabel({ ownLabel: null, ownPending: false, writeInFlight: true }))
      .toBe(COST_WRITE_MSG.writeRunningElsewhere);
    expect(costWriteStatusLabel({ ownLabel: null, ownPending: false, writeInFlight: false })).toBeNull();
  });

  it("UT-WGUARD-FLIGHT-010 the screen's own pending write with no label shows no 'elsewhere' line", () => {
    expect(costWriteStatusLabel({ ownLabel: null, ownPending: true, writeInFlight: true })).toBeNull();
  });
});
