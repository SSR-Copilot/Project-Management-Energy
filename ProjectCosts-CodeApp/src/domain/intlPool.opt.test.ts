/**
 * OPT-29 (B8): per-cell `new Intl.NumberFormat(...)` calls now go through the pooled `numberFormat` (`domain/locale.ts`). Output is
 * compared with a fresh `new Intl.NumberFormat` (the OLD call) over a value table, and the constructions are counted:
 * OLD one per call, NEW at most one per (locale, options) pair.
 */
import { describe, expect, it } from "vitest";
import { formatInteger, formatWithSeparators, forLanguage } from "./powerFxNumeric";
import { fmtHedgeCell, fmtMwh, fmtTariffCell } from "@/features/pm/revenues/rules";
import { marginValue } from "@/features/admin/admin-contract/rules";

const VALUES: number[] = [0, -0, 0.5, 1, -1, 12.345, 999.995, 1234.5, -1234.567, 1e6, 123456789.123, 1e-7, 1e21, 0.1 + 0.2, 7 / 3, 2.675, -0.004];
const LANGS = ["en-US", "en-GB", "de-DE", "fr-FR", "pl-PL", "it-IT", "nl-NL", "en-IN"];

function countConstructions<T>(work: () => T): { value: T; constructed: number } {
  const Original = Intl.NumberFormat;
  let constructed = 0;
  const Counting = new Proxy(Original, { construct(target, args) { constructed += 1; return Reflect.construct(target, args); }, apply(target, _t, args) { constructed += 1; return Reflect.apply(target, undefined, args); } });
  (Intl as { NumberFormat: unknown }).NumberFormat = Counting;
  try { return { value: work(), constructed }; } finally { (Intl as { NumberFormat: unknown }).NumberFormat = Original; }
}

describe("OPT-29 pooled Intl.NumberFormat on the per-cell formatters", () => {
  it("UT-INTLPOOL-OPT-001 powerFxNumeric formatWithSeparators / formatInteger equal a fresh formatter over value x language x places", () => {
    for (const v of VALUES) for (const lang of LANGS) {
      for (const places of [0, 1, 2, 4]) {
        const old = new Intl.NumberFormat(lang, { minimumFractionDigits: places, maximumFractionDigits: places }).format(v);
        expect(formatWithSeparators(v, lang, places), `${v} ${lang} ${places}`).toBe(old);
      }
      expect(formatInteger(v, lang), `${v} ${lang}`).toBe(new Intl.NumberFormat(lang, { maximumFractionDigits: 0 }).format(v));
    }
    expect(formatWithSeparators(null)).toBe("");
    expect(formatInteger(Number.NaN)).toBe("");
  });

  it("UT-INTLPOOL-OPT-002 the Revenues cells equal a fresh formatter, and a column of 500 cells builds at most 3 formatters (OLD one per cell: 1500)", () => {
    const { constructed } = countConstructions(() => {
      for (let i = 0; i < 500; i++) { fmtMwh(i * 1234.5); fmtTariffCell(i * 0.37, "de-DE"); fmtHedgeCell({ hedgeType: 2, hedgedVolume: null, fixedContractedMwhPa: i * 1000 }, "de-DE"); }
    });
    expect(constructed).toBeLessThanOrEqual(3);
    for (const v of VALUES) {
      expect(fmtMwh(v), String(v)).toBe(new Intl.NumberFormat("en-GB").format(v));
      for (const lang of LANGS) {
        expect(fmtTariffCell(v, lang), `${v} ${lang}`).toBe(forLanguage(new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v), lang));
      }
    }
    expect(fmtMwh(null)).toBe("");
    expect(fmtTariffCell(null)).toBe("");
  });

  it("UT-INTLPOOL-OPT-003 the admin contract margin text equals a fresh formatter for each locale, including none", () => {
    for (const v of VALUES) for (const locale of [undefined, ...LANGS]) {
      const contract = { marginType: 0, marginPercentage: v } as never;
      const expected = new Intl.NumberFormat(locale, { maximumFractionDigits: 10, useGrouping: false }).format(v);
      expect(marginValue(contract, locale), `${v} ${locale}`).toBe(expected);
    }
  });
});
