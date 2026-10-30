/**
 * UT-LOCALE: numbers follow the user's language (D64).
 *
 * The canvas formats and reads numbers with `Language()`: a German user types and sees "1,5", an English user "1.5". The code app
 * validated in the user's language but several screens still OPENED their boxes in US text, so a German user's untouched
 * "1.50" failed the "," validator. The rule these tests pin: **a box's opening text passes its own validator, in every language**,
 * plus the exact separators of cards and messages. The default language stays en-US everywhere, so nothing changes unless a
 * language is passed.
 */
import { describe, expect, it } from "vitest";
import {
  forLanguage, fmtCapacity, fmtHubHeight, inverterFormDefaults, inverterLargeRange, simpleCardValues, simpleFormDefaults,
  textFormat, turbineFormDefaults, validateEffectiveCapacity, validateEffectiveHubHeight, validateFoundationPlinth,
  validateInverterForm, validateSimpleForm, type SimpleTypeRow, type TurbineRow,
} from "@/features/pm/generators/rules";
import { formatOneToTwoPlaces, validateHeightLimit } from "@/features/pm/planning/rules";
import {
  GRID_OPERATOR_COL, buildPayload, toForm, validateDiameter, validateLength, validateVoltage,
  type GridOperatorProject, type GridOperatorRecord,
} from "@/features/pm/grid-operator/rules";
import { formatDscr, formatUpfrontFee, stepUpFromStorage, validateDscr } from "@/features/pm/finance/rules";
import { fmtPrice, fmtSiteQualityCell, fmtTariffCell, localizeContractForm, type RevenueFormState } from "@/features/pm/revenues/rules";
import { betweenMessage } from "@/features/cost/contracts/rules";
import { validateTotalCost } from "@/features/cost/capex-costs/rules";
import { CHOICE_FINANCE } from "@/data/dataverseNames";

const LANGS = ["en-US", "en-GB", "de-DE", "pl-PL", "fr-FR"] as const;

describe("UT-LOCALE — the shared formatter", () => {
  it("UT-LOCALE-001 the default is unchanged (en-US): the same text as before this change", () => {
    expect(textFormat(1234.5, "#,##0.00")).toBe("1,234.50");
    expect(textFormat(1.5, "#0.0#")).toBe("1.5");
    expect(forLanguage("1,234.50")).toBe("1,234.50");
    expect(forLanguage("1,234.50", "en-GB")).toBe("1,234.50");
  });

  it("UT-LOCALE-002 a comma-decimal language swaps the separators (the canvas `Text(n, fmt, Language())`)", () => {
    expect(textFormat(1234.5, "#,##0.00", "de-DE")).toBe("1.234,50");
    expect(textFormat(1.5, "#0.0#", "de-DE")).toBe("1,5");
    expect(textFormat(-1.5, "#0.0#", "pl-PL")).toBe("-1,5");
    expect(forLanguage("1,234.50", "de-DE")).toBe("1.234,50");
    // Only the primary subtag decides, as `Lower(First(Split(Language(), "-")))` does.
    expect(forLanguage("1.5", "en-ZA")).toBe("1.5");
    expect(forLanguage("1.5", "de-CH")).toBe("1,5");
  });
});

describe("UT-LOCALE — Generators: the boxes open in the language their validators read", () => {
  const turbine = { index: 3, effectiveCapacity: 4.25, hubHeightExclPlinth: 99.5, foundationPlinth: -1.5 } as unknown as TurbineRow;
  const model = { specificCapacity: 3.5, hubHeight: 120.25 };

  it("UT-LOCALE-010 the turbine panel's opening text passes its own validators in every language", () => {
    for (const lang of LANGS) {
      for (const t of [null, turbine]) {
        const f = turbineFormDefaults({ turbine: t, model, nextIndex: 1, lang });
        expect(validateEffectiveCapacity(f.effectiveCapacity, 10, lang), `${lang} capacity "${f.effectiveCapacity}"`).toBeNull();
        expect(validateEffectiveHubHeight(f.effectiveHubHeight, lang), `${lang} hub height "${f.effectiveHubHeight}"`).toBeNull();
        expect(validateFoundationPlinth(f.foundationPlinth, lang), `${lang} plinth "${f.foundationPlinth}"`).toBeNull();
      }
    }
  });

  it("UT-LOCALE-011 the German text is comma text, the English text is dot text", () => {
    const de = turbineFormDefaults({ turbine, model, nextIndex: 1, lang: "de-DE" });
    expect([de.effectiveCapacity, de.effectiveHubHeight, de.foundationPlinth]).toEqual(["4,25", "99,50", "-1,5"]);
    const en = turbineFormDefaults({ turbine, model, nextIndex: 1 });
    expect([en.effectiveCapacity, en.effectiveHubHeight, en.foundationPlinth]).toEqual(["4.25", "99.50", "-1.5"]);
  });

  it("UT-LOCALE-012 a German user's dot is refused where a comma is the separator, and the reverse for English", () => {
    expect(validateEffectiveCapacity("3,5", 5, "de-DE")).toBeNull();
    expect(validateEffectiveCapacity("3.5", 5, "de-DE")).not.toBeNull();
    expect(validateEffectiveCapacity("3.5", 5, "en-US")).toBeNull();
    expect(validateEffectiveCapacity("3,5", 5, "en-US")).not.toBeNull();
  });

  it("UT-LOCALE-013 the range message writes its number in the user's language", () => {
    expect(validateEffectiveCapacity("9", 3.5, "de-DE")).toBe("Please select a value between 0.01 and 3,5 MW max.");
    expect(validateEffectiveCapacity("9", 3.5)).toBe("Please select a value between 0.01 and 3.5 MW max.");
    expect(inverterLargeRange()).toBe("Please select a value between 0 and 1,000,000.0.");
    expect(inverterLargeRange("de-DE")).toBe("Please select a value between 0 and 1.000.000,0.");
  });

  it("UT-LOCALE-014 simple (storage / hydrogen / substation) and inverter panels open in the language", () => {
    const row = { capacity: 12.5, energyCapacity: 2000.25, nominalPower: 33.5 } as unknown as SimpleTypeRow;
    for (const lang of LANGS) {
      const storage = simpleFormDefaults("storage", row, lang);
      expect(validateSimpleForm("storage", storage, lang).capacity, `${lang} storage "${storage.capacity}"`).toBeNull();
      const hydrogen = simpleFormDefaults("hydrogen", row, lang);
      expect(validateSimpleForm("hydrogen", hydrogen, lang).capacity, `${lang} hydrogen "${hydrogen.capacity}"`).toBeNull();
      const inverter = inverterFormDefaults(row, lang);
      expect(validateInverterForm(inverter, { otherSupplierChosen: false }, lang).nominalPower, `${lang} nominal "${inverter.nominalPower}"`).toBeNull();
    }
    expect(simpleFormDefaults("storage", row, "de-DE").capacity).toBe("12,50");
    expect(inverterFormDefaults(row, "de-DE").nominalPower).toBe("33,5");
  });

  it("UT-LOCALE-015 the read-only card and grid text follows the language", () => {
    expect(simpleCardValues("storage", { capacity: 1234.5, energyCapacity: 2000, supplier: "X" } as unknown as SimpleTypeRow, "de-DE"))
      .toEqual(["1.234,50", "2.000,00", "X"]);
    expect(simpleCardValues("storage", { capacity: 1234.5, energyCapacity: 2000, supplier: "X" } as unknown as SimpleTypeRow))
      .toEqual(["1,234.50", "2,000.00", "X"]);
    expect(fmtCapacity(3.5, "de-DE")).toBe("3,5");
    expect(fmtHubHeight(120.25, "de-DE")).toBe("120,25");
    expect(fmtCapacity(3.5)).toBe("3.5");
  });
});

describe("UT-LOCALE — Planning and Grid Operator", () => {
  it("UT-LOCALE-020 the Planning height-limit box opens in the language and is accepted by its validator", () => {
    expect(formatOneToTwoPlaces(1.5)).toBe("1.5");
    expect(formatOneToTwoPlaces(1.5, "de-DE")).toBe("1,5");
    expect(formatOneToTwoPlaces(0, "de-DE")).toBe("0");
    for (const lang of LANGS) {
      expect(validateHeightLimit(formatOneToTwoPlaces(12.25, lang), lang).valid, lang).toBe(true);
    }
  });

  const record = {
    id: "r", operator: "Op", voltageLevel: 110.5, expansionRequired: null, expansionDetails: null,
    substationConstructionRequired: null, substationOperator: null,
    lengthInternal: 1.25, diameterInternal: 2.5, lengthExternal: 3.125, diameterExternal: 0.5,
  } as GridOperatorRecord;

  it("UT-LOCALE-021 Grid Operator: lengths and diameters open in the language; the voltage stays dot-only (the canvas bans its comma)", () => {
    const de = toForm(record, "de-DE");
    expect([de.lengthInternal, de.diameterInternal, de.lengthExternal, de.diameterExternal]).toEqual(["1,25", "2,5", "3,125", "0,5"]);
    expect(de.voltageLevel).toBe("110.5");
    expect(validateVoltage(de.voltageLevel).valid).toBe(true);
    for (const lang of LANGS) {
      const f = toForm(record, lang);
      expect(validateLength(f.lengthInternal, lang).valid, `${lang} length "${f.lengthInternal}"`).toBe(true);
      expect(validateDiameter(f.diameterInternal, lang).valid, `${lang} diameter "${f.diameterInternal}"`).toBe(true);
      expect(validateVoltage(f.voltageLevel).valid, `${lang} voltage "${f.voltageLevel}"`).toBe(true);
    }
  });

  it("UT-LOCALE-022 the saved numbers are the same whatever the language (110.5 kV, 1.25 m)", () => {
    const project = { id: "p", owningBusinessUnitId: null } as unknown as GridOperatorProject;
    for (const lang of LANGS) {
      const payload = buildPayload(toForm(record, lang), project, lang);
      expect(payload[GRID_OPERATOR_COL.voltageLevel], lang).toBe(110.5);
      expect(payload[GRID_OPERATOR_COL.lengthInternal], lang).toBe(1.25);
      expect(payload[GRID_OPERATOR_COL.diameterInternal], lang).toBe(2.5);
    }
  });
});

describe("UT-LOCALE — Finance", () => {
  it("UT-LOCALE-030 the DSCR box opens as the validator reads it, in every language", () => {
    expect(formatDscr(1.8)).toBe("1.80x");
    expect(formatDscr(1.8, "de-DE")).toBe("1,80x");
    for (const lang of LANGS) {
      expect(validateDscr(formatDscr(1.8, lang), lang).valid, `${lang} "${formatDscr(1.8, lang)}"`).toBe(true);
      expect(validateDscr(formatDscr(2.5, lang), lang).valid, lang).toBe(true);
    }
    expect(formatDscr(null, "de-DE")).toBe("");
  });

  it("UT-LOCALE-031 step-up margins and the upfront fee follow the language", () => {
    const rows = [{ id: "a", order: 1, startYear: 2030, duration: 5, margin: 1.25 }] as never;
    expect(stepUpFromStorage(rows)[0]?.margin).toBe("1.25");
    expect(stepUpFromStorage(rows, "de-DE")[0]?.margin).toBe("1,25");
    expect(formatUpfrontFee(CHOICE_FINANCE.upfrontFee.percentageOfDebt, 1.5)).toBe("1.5");
    expect(formatUpfrontFee(CHOICE_FINANCE.upfrontFee.percentageOfDebt, 1.5, "de-DE")).toBe("1,5");
  });
});

describe("UT-LOCALE — Revenues, Contracts and Capex", () => {
  it("UT-LOCALE-040 Revenues card cells follow the language (`Text(x, \"#,##0.00\", Language())`)", () => {
    expect(fmtPrice(1.5)).toBe("1.50");
    expect(fmtPrice(1.5, "de-DE")).toBe("1,50");
    expect(fmtTariffCell(1234.5)).toBe("1,234.50");
    expect(fmtTariffCell(1234.5, "de-DE")).toBe("1.234,50");
    expect(fmtSiteQualityCell(1.25, "de-DE")).toBe("1,25");
    expect(fmtSiteQualityCell(1.25)).toBe("1.25");
  });

  it("UT-LOCALE-041 a Revenues form is localised once: plain numbers swap, text and already-localised numbers do not", () => {
    const base = {
      description: "Standard 1.5", tariff: "12.50", tariffP90: "", biddingPrice: "1,5", siteQuality: "0.9", siteQualityP90: "",
      correctionFactor: "1.000", correctionFactorP90: "", inflationProfile: "2.00", inflationStartYear: "2030",
      hedge: { type: "percentage", percentage: { value: "62.5" }, fixed: { value: "1000" }, individual: [] },
    } as unknown as RevenueFormState;
    const de = localizeContractForm(base, "de-DE");
    expect([de.tariff, de.siteQuality, de.correctionFactor, de.inflationProfile, de.hedge.percentage.value])
      .toEqual(["12,50", "0,9", "1,000", "2,00", "62,5"]);
    expect(de.description).toBe("Standard 1.5");
    expect(de.biddingPrice).toBe("1,5");
    expect(de.inflationStartYear).toBe("2030");
    expect(localizeContractForm(de, "de-DE")).toEqual(de);
    expect(localizeContractForm(base).tariff).toBe("12.50");
    expect(localizeContractForm(base, "en-GB").tariff).toBe("12.50");
  });

  it("UT-LOCALE-042 Contracts range messages group in the user's language (they always used German grouping)", () => {
    expect(betweenMessage(0, 1_000_000, "en-US")).toBe("Please select a value between 0 and 1,000,000");
    expect(betweenMessage(0, 1_000_000, "de-DE")).toBe("Please select a value between 0 and 1.000.000");
    // No language given: the earlier default is kept.
    expect(betweenMessage(0, 1_000_000)).toBe("Please select a value between 0 and 1.000.000");
  });

  it("UT-LOCALE-043 Capex total-cost message: comma grouping for English, dots for the other languages, as the canvas branches", () => {
    const poland = (locale?: string) => validateTotalCost("9999999999", "Poland", locale).message;
    expect(poland("en-US")).toContain("2,250,000,000");
    expect(poland("de-DE")).toContain("2.250.000.000");
    expect(poland("en-GB")).toContain("2,250,000,000");
  });
});
