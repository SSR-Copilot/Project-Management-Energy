/** UT-DELFLAG-001.. — the shape and the live defaults of the Generators delete flags (DEL-1). */
import { describe, expect, it } from "vitest";
import { GENERATORS_DELETE, type DeleteFlagOverrides, type GeneratorsDeleteFlags } from "./generatorsDeleteFlags";

describe("GENERATORS_DELETE", () => {
  it("UT-DELFLAG-001 has exactly the four flags", () => {
    expect(Object.keys(GENERATORS_DELETE).sort()).toEqual(["guardedUpdates", "parentOrder", "tieredDeletes", "verifyDeletes"]);
  });

  it("UT-DELFLAG-002 tieredDeletes is the live behaviour; the other three wait for their DEV check", () => {
    expect(GENERATORS_DELETE).toEqual({
      tieredDeletes: true, verifyDeletes: false, parentOrder: false, guardedUpdates: false,
    });
  });

  it("UT-DELFLAG-003 every flag is a boolean and overrides merge over the defaults", () => {
    for (const value of Object.values(GENERATORS_DELETE)) expect(typeof value).toBe("boolean");
    const overrides: DeleteFlagOverrides = { verifyDeletes: true };
    const merged: GeneratorsDeleteFlags = { ...GENERATORS_DELETE, ...overrides };
    expect(merged).toEqual({ tieredDeletes: true, verifyDeletes: true, parentOrder: false, guardedUpdates: false });
  });
});
