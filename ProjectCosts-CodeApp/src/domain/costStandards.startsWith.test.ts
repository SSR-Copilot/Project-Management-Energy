/**
 * OPT-33 (B8): the case-insensitive `StartsWith(x, "Standard")` predicate was spelled out five times (Land Lease x2, OPEX x2,
 * Revenues). One `startsWithStandard` now; the old body is the oracle over a string table. The case-SENSITIVE "Standard " strip in
 * Revenues and Contracts' flag are different rules and are not touched.
 */
import { describe, expect, it } from "vitest";
import { startsWithStandard } from "./costStandards";
import { isStandardPeriodName, isStandardPeriodNameLower } from "@/features/cost/periods/landLeaseRules";
import { isStandardByDescription, isStandardLocked } from "@/features/cost/periods/opexRules";
import { rehydrateForEdit } from "@/features/pm/revenues/rules";

const old = (text: string): boolean => text.toLowerCase().startsWith("standard");

const STRINGS = [
  "", "Standard", "standard", "STANDARD", "StAnDaRd contract", "Standard Contract", "Standardized", "standard-x", "Standar", "Standar d",
  " Standard", "Non-standard", "A Standard", "standards", "Stándard", "İstandard", "ſtandard", "STANDARD\u00a0x", "Standard\n", "1 Standard",
  "standa", "Standard Land Lease Contract", "StandardStandard",
];

describe("OPT-33 startsWithStandard", () => {
  it("UT-STANDARD-OPT-001 equals the old predicate over a string table", () => {
    for (const s of STRINGS) expect(startsWithStandard(s), JSON.stringify(s)).toBe(old(s));
    expect(startsWithStandard("STANDARD x")).toBe(true);
    expect(startsWithStandard(" Standard")).toBe(false);
  });

  it("UT-STANDARD-OPT-002 the Land Lease, OPEX and Revenues predicates built on it answer as before", () => {
    for (const s of STRINGS) {
      expect(isStandardPeriodName(s), s).toBe(old(s));
      expect(isStandardPeriodNameLower(s), s).toBe(old(s));
      expect(isStandardByDescription({ description: s }), s).toBe(old(s));
      expect(isStandardLocked({ isStandardContract: false, name: s }), s).toBe(old(s));
      expect(isStandardLocked({ isStandardContract: true, name: s }), s).toBe(true);
      expect(rehydrateForEdit({ description: s, label: null, biddingPrice: null, tariffPrice: null } as never, null, "Wind").isStandardContract, s).toBe(old(s));
    }
  });
});
