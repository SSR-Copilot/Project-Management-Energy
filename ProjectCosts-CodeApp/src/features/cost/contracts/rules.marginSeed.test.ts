/** UT-CONTR-219..222 — `shouldSeedMargin` and `patchEditsMargin`: when the standard assumption may seed the margin. */
import { describe, expect, it } from "vitest";
import { patchEditsMargin, shouldSeedMargin } from "./rules";

const OPEN = { panel: "contract", editing: false, seeded: false, marginTouched: false };

describe("shouldSeedMargin", () => {
  it("UT-CONTR-219 seeds a new contract's untouched margin once the panel is open", () => {
    expect(shouldSeedMargin(OPEN)).toBe(true);
  });

  it("UT-CONTR-220 never seeds a closed panel, the rights or payment-target panel, or an Edit", () => {
    expect(shouldSeedMargin({ ...OPEN, panel: "none" })).toBe(false);
    expect(shouldSeedMargin({ ...OPEN, panel: "rights" })).toBe(false);
    expect(shouldSeedMargin({ ...OPEN, panel: "target" })).toBe(false);
    expect(shouldSeedMargin({ ...OPEN, editing: true })).toBe(false);
  });

  it("UT-CONTR-221 seeds at most once per opened panel, and never after a margin field was written", () => {
    expect(shouldSeedMargin({ ...OPEN, seeded: true })).toBe(false);
    expect(shouldSeedMargin({ ...OPEN, marginTouched: true })).toBe(false);
  });
});

describe("patchEditsMargin", () => {
  it("UT-CONTR-222 is true only for a patch that writes a margin field", () => {
    for (const key of ["margin", "marginType", "marginPercentage", "marginFixedValue"]) {
      expect(patchEditsMargin({ [key]: 1 })).toBe(true);
    }
    expect(patchEditsMargin({ description: "x", comment: "y", closingDate: undefined })).toBe(false);
    expect(patchEditsMargin({})).toBe(false);
  });
});
