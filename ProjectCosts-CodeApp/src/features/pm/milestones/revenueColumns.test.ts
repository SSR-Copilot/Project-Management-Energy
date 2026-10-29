import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { REVENUE_COL } from "./rules";

describe("REVENUE_COL (the default revenue seed)", () => {
  it("UT-MSTONE-COL-001 every seeded column exists on vsb_projectrevenue (the generated model)", () => {
    const model = readFileSync(
      fileURLToPath(new URL("../../../generated/models/Vsb_projectrevenuesModel.ts", import.meta.url)), "utf8");
    const missing = Object.values(REVENUE_COL).filter((col) => !new RegExp(`\\b${col}\\??:`).test(model));
    expect(missing).toEqual([]);
  });
});