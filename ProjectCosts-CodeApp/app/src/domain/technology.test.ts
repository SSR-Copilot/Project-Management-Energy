import { describe, expect, it } from "vitest";
import { Vsb_bopcontractsstandardassumptionsesvsb_technology as ContractTechnologyMap } from "@/generated/models/Vsb_bopcontractsstandardassumptionsesModel";
import { TECHNOLOGY as COSTS_TECHNOLOGY } from "@/data/settings/costs";
import {
  CONTRACT_TECHNOLOGIES, COST_TECHNOLOGIES, GATE_TECHNOLOGIES, TECHNOLOGY,
  parseTechnologyParam, technologyCodeByLabel, technologyOptionLabel,
} from "./technology";

describe("technology options", () => {
  it("match the generated choice map (the Contracts source)", () => {
    for (const t of CONTRACT_TECHNOLOGIES) {
      expect((ContractTechnologyMap as Record<number, string>)[t.code]).toBe(t.label);
    }
  });
  it("match the Costs data module and Project Gates' TECH codes", () => {
    expect(COST_TECHNOLOGIES.map((t) => t.code)).toEqual([COSTS_TECHNOLOGY.wind, COSTS_TECHNOLOGY.pv]);
    // project-gates/rules.ts TECH = { Wind: 952850000, PV: 952850001 }
    expect(GATE_TECHNOLOGIES.map((t) => [t.label, t.code])).toEqual([["Wind", 952850000], ["PV", 952850001]]);
  });
  it("Contracts adds BESS", () => {
    expect(CONTRACT_TECHNOLOGIES.map((t) => t.label)).toEqual(["Wind", "PV", "BESS"]);
  });
});

describe("helpers", () => {
  it("labels codes and never shows the integer", () => {
    expect(technologyOptionLabel(TECHNOLOGY.pv)).toBe("PV");
    expect(technologyOptionLabel(123)).toBe("");
    expect(technologyOptionLabel(undefined)).toBe("");
  });
  it("parses a URL code restricted to the offered set", () => {
    expect(parseTechnologyParam(" 952850003 ", CONTRACT_TECHNOLOGIES)).toBe(TECHNOLOGY.bess);
    expect(parseTechnologyParam("952850003", GATE_TECHNOLOGIES)).toBeUndefined();
    expect(parseTechnologyParam("1.5", GATE_TECHNOLOGIES)).toBeUndefined();
    expect(parseTechnologyParam(null, GATE_TECHNOLOGIES)).toBeUndefined();
  });
  it("maps Project Gates' TechKey label to a code", () => {
    expect(technologyCodeByLabel("pv", GATE_TECHNOLOGIES)).toBe(TECHNOLOGY.pv);
    expect(technologyCodeByLabel("BESS", GATE_TECHNOLOGIES)).toBeUndefined();
  });
});
