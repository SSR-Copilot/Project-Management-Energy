/**
 * The Application Settings picker options appended to `domain/technology.ts`. UT-TECHOPT-nnn.
 */
import { describe, expect, it } from "vitest";
import { Vsb_bopcontractsstandardassumptionsesvsb_technology as ContractTechnologyMap } from "@/generated/models/Vsb_bopcontractsstandardassumptionsesModel";
import { TECHNOLOGY as COSTS_TECHNOLOGY } from "@/domain/costStandards";
import {
  CONTRACT_TECHNOLOGIES, COST_TECHNOLOGIES, GATE_TECHNOLOGIES, TECHNOLOGY, TECHNOLOGY_LABEL,
  technologyOptionLabel,
} from "./technology";

describe("Technology options", () => {
  it("UT-TECHOPT-001 every Contract code exists in the generated choice map (values, not labels)", () => {
    for (const t of CONTRACT_TECHNOLOGIES) {
      expect(t.code in (ContractTechnologyMap as Record<number, string>)).toBe(true);
    }
  });
  it("UT-TECHOPT-002 match the Cost data module and Gates' codes", () => {
    expect(COST_TECHNOLOGIES.map((t) => t.code)).toEqual([COSTS_TECHNOLOGY.wind, COSTS_TECHNOLOGY.pv]);
    expect(GATE_TECHNOLOGIES.map((t) => [t.label, t.code])).toEqual([["Wind", 952850000], ["PV", 952850001]]);
  });
  it("UT-TECHOPT-003 Contract adds BESS; labels come from master's TECHNOLOGY_LABEL", () => {
    expect(CONTRACT_TECHNOLOGIES.map((t) => t.label)).toEqual(["Wind", "PV", "BESS"]);
    expect(CONTRACT_TECHNOLOGIES.map((t) => TECHNOLOGY_LABEL[t.code])).toEqual(["Wind", "PV", "BESS"]);
  });
});

describe("Helpers", () => {
  it("UT-TECHOPT-004 labels codes and never shows the integer", () => {
    expect(technologyOptionLabel(TECHNOLOGY.pv)).toBe("PV");
    expect(technologyOptionLabel(123)).toBe("");
    expect(technologyOptionLabel(undefined)).toBe("");
  });
});
