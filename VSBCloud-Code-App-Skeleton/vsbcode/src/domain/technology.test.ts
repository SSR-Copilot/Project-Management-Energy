/**
 * `@/domain/technology`.
 *
 * These tests exist because the `vsb_technology` column is a Dataverse *choice* that four
 * screens had been treating as a label string. The migration of the mock fixture to the
 * option-set integers exposed that, and these assertions are what stop it coming back:
 * a raw integer must never reach a display path, and a label must never reach a `$filter`.
 */
import { describe, it, expect } from "vitest";
import { CHOICE_PROCESS } from "@/data/entities";
import { TECHNOLOGY_LABEL, technologyLabel, technologyValue } from "./technology";

describe("UT-TECH — the technology option set", () => {
  it("UT-TECH-001 covers every member of CHOICE_PROCESS.technology, and nothing else", () => {
    const declared = Object.values(CHOICE_PROCESS.technology).sort((a, b) => a - b);
    const mapped = Object.keys(TECHNOLOGY_LABEL).map(Number).sort((a, b) => a - b);
    expect(mapped).toEqual(declared);
  });

  it("UT-TECH-002 transcribes the labels the canvas app shows", () => {
    expect(TECHNOLOGY_LABEL[CHOICE_PROCESS.technology.wind]).toBe("Wind");
    expect(TECHNOLOGY_LABEL[CHOICE_PROCESS.technology.pv]).toBe("PV");
    expect(TECHNOLOGY_LABEL[CHOICE_PROCESS.technology.hybrid]).toBe("Hybrid");
    expect(TECHNOLOGY_LABEL[CHOICE_PROCESS.technology.bess]).toBe("BESS");
    expect(TECHNOLOGY_LABEL[CHOICE_PROCESS.technology.hydrogen]).toBe("Hydrogen");
    expect(TECHNOLOGY_LABEL[CHOICE_PROCESS.technology.hydro]).toBe("Hydro");
    expect(TECHNOLOGY_LABEL[CHOICE_PROCESS.technology.substation]).toBe("Substation");
  });

  it("UT-TECH-003 has no duplicate label, so the reverse lookup is unambiguous", () => {
    const labels = Object.values(TECHNOLOGY_LABEL);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("UT-TECH-004 resolves the option-set integer", () => {
    expect(technologyValue(CHOICE_PROCESS.technology.wind)).toBe(952850000);
    expect(technologyValue(952850006)).toBe(952850006);
  });

  it("UT-TECH-005 resolves the integer arriving as a string, as it does on a URL param", () => {
    expect(technologyValue("952850001")).toBe(CHOICE_PROCESS.technology.pv);
  });

  it("UT-TECH-006 resolves a label, case-insensitively and trimmed", () => {
    expect(technologyValue("Wind")).toBe(CHOICE_PROCESS.technology.wind);
    expect(technologyValue("wind")).toBe(CHOICE_PROCESS.technology.wind);
    expect(technologyValue("  pv  ")).toBe(CHOICE_PROCESS.technology.pv);
    expect(technologyValue("BESS")).toBe(CHOICE_PROCESS.technology.bess);
  });

  it("UT-TECH-007 returns null for blanks and for values outside the option set", () => {
    expect(technologyValue(null)).toBeNull();
    expect(technologyValue(undefined)).toBeNull();
    expect(technologyValue("")).toBeNull();
    expect(technologyValue("   ")).toBeNull();
    // The literal the General Data dropdown used to offer. It is not a member of the option
    // set, which is exactly why that hand-written list had to go.
    expect(technologyValue("Storage")).toBeNull();
    expect(technologyValue(1)).toBeNull();
    expect(technologyValue(952859999)).toBeNull();
    expect(technologyValue({})).toBeNull();
  });

  it("UT-TECH-008 prefers the row's own FormattedValue over the transcribed map", () => {
    // The environment's localisation wins — a German org may return "Windkraft".
    expect(technologyLabel(CHOICE_PROCESS.technology.wind, "Windkraft")).toBe("Windkraft");
  });

  it("UT-TECH-009 falls back to the map when there is no FormattedValue", () => {
    expect(technologyLabel(CHOICE_PROCESS.technology.hybrid)).toBe("Hybrid");
    expect(technologyLabel(CHOICE_PROCESS.technology.hybrid, "")).toBe("Hybrid");
    expect(technologyLabel(CHOICE_PROCESS.technology.hybrid, null)).toBe("Hybrid");
  });

  it("UT-TECH-010 never returns the raw integer — the header defect this module prevents", () => {
    for (const v of Object.values(CHOICE_PROCESS.technology)) {
      expect(technologyLabel(v)).not.toMatch(/^\d+$/);
    }
    // And an unknown value degrades to blank rather than to its own digits.
    expect(technologyLabel(952859999)).toBe("");
    expect(technologyLabel(null)).toBe("");
  });

  it("UT-TECH-011 round-trips label -> value -> label for every member", () => {
    for (const label of Object.values(TECHNOLOGY_LABEL)) {
      const v = technologyValue(label);
      expect(v).not.toBeNull();
      expect(technologyLabel(v)).toBe(label);
    }
  });
});
