import { describe, expect, it } from "vitest";
import { powerFxTrim } from "./powerFx";

/** The Contracts `powerFxTrim.test.ts` cases, copied verbatim (the CO copy goes in Wave B). */
describe("PowerFxTrim (Power Fx Trim semantics)", () => {
  it("UT-POWERFX-001 Removes leading and trailing spaces", () => {
    expect(powerFxTrim("  ab  ")).toBe("ab");
    expect(powerFxTrim("   ")).toBe("");
    expect(powerFxTrim("")).toBe("");
  });

  it("UT-POWERFX-002 Collapses each inner run of spaces to one", () => {
    expect(powerFxTrim("a  b")).toBe("a b");
    expect(powerFxTrim("  a   b    c  ")).toBe("a b c");
    expect(powerFxTrim("a b")).toBe("a b");
  });

  it("UT-POWERFX-003 Touches spaces only: tabs, newlines and non-breaking spaces are kept", () => {
    expect(powerFxTrim("\ta\t")).toBe("\ta\t");
    expect(powerFxTrim("a\n\nb")).toBe("a\n\nb");
    expect(powerFxTrim(" a ")).toBe(" a ");
    expect(powerFxTrim(" a \n  b ")).toBe("a \n b");
  });
});
