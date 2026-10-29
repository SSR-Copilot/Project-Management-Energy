import { describe, expect, it } from "vitest";
import { writeCommandsDisabled } from "./writeGuard";

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
});
