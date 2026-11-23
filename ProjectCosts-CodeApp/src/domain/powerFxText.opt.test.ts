/**
 * OPT-33 (B8): `forLanguage`, `textFormat` and `textIntOr` moved from `features/pm/generators/rulesCore.ts` to `domain/powerFxNumeric.ts`
 * (five PM screens imported them through the generators barrel), and Production's `pfxText` delegates to `textFormat`. The OLD bodies are
 * the oracles, compared over a value x pattern x language table.
 */
import { describe, expect, it } from "vitest";
import { decimalSeparator, forLanguage, pfxRound, textFormat, textIntOr, type Lang } from "./powerFxNumeric";
import * as generators from "@/features/pm/generators/rules";
import { pfxText, pfxTextIntOr } from "@/features/pm/production/rules";

/* ── the old bodies, verbatim ── */
function oldForLanguage(en: string, lang: Lang = "en-US"): string {
  return decimalSeparator(lang) === "." ? en : en.replace(/[.,]/g, (c) => (c === "." ? "," : "."));
}
function oldTextFormat(value: number | null | undefined, pattern: string, lang: Lang = "en-US"): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "";
  const [intPart = "", fracPart = ""] = pattern.split(".");
  const minFrac = (fracPart.match(/0/g) ?? []).length;
  const maxFrac = fracPart.length;
  const minInt = (intPart.match(/0/g) ?? []).length;
  const grouped = intPart.includes(",");
  const negative = value < 0;
  const rounded = pfxRound(Math.abs(value), maxFrac);
  const fixed = rounded.toFixed(maxFrac);
  let [whole = "", frac = ""] = fixed.split(".");
  while (frac.length > minFrac && frac.endsWith("0")) frac = frac.slice(0, -1);
  whole = whole.replace(/^0+/, "");
  while (whole.length < minInt) whole = `0${whole}`;
  if (grouped) whole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const body = frac ? `${whole}.${frac}` : whole;
  const text = negative && body !== "" && /[1-9]/.test(body) ? `-${body}` : body;
  return oldForLanguage(text, lang);
}
const oldTextIntOr = (value: number | null | undefined, alt: string, lang: Lang = "en-US"): string =>
  value === null || value === undefined ? "" : Number.isInteger(value) ? oldTextFormat(value, "#", lang) : oldTextFormat(value, alt, lang);
/** Production's old `pfxText`, verbatim (it used the en-US `textFormat` then swapped). */
function oldPfxText(value: number | null | undefined, pattern: string, lang: Lang = "en-US"): string {
  const en = oldTextFormat(value, pattern);
  if (decimalSeparator(lang) === ".") return en;
  return en.replace(/[.,]/g, (c) => (c === "." ? "," : "."));
}

const VALUES: (number | null | undefined)[] = [
  null, undefined, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 0, -0, 0.5, -0.5, 1, -1, 7, 12.5, 1234.5, -1234.567,
  1e6, 1234567.891, -0.004, 0.004, 0.005, 1.005, 2.675, 999999.995, 0.1 + 0.2, 169, 169.5, 3.14159, 100, 99.999, -99.999, 1e-7,
];
const PATTERNS = ["#", "#0.0#", "#0.00", "#.0", "#0.0", "0.0#", "0", "#,##0.00", "#,##0.0", "#,###.00", "#.0#", "#0.##", "###,###,###", "###,##0.0#", "#0.0##", "###,###", "###,##0.0##", ""];
const LANGS = ["en-US", "en-GB", "de-DE", "fr-FR", "nl-NL", "pl-PL", "it-IT", "de", "en", "es-ES"];

describe("OPT-33 Power Fx text formatting: one home (domain/powerFxNumeric)", () => {
  it("UT-PFXTEXT-OPT-001 the generators barrel re-exports the same functions", () => {
    expect(generators.forLanguage).toBe(forLanguage);
    expect(generators.textFormat).toBe(textFormat);
    expect(generators.textIntOr).toBe(textIntOr);
  });

  it("UT-PFXTEXT-OPT-002 forLanguage equals the old body", () => {
    for (const s of ["", "1,234.50", "1.234,50", "-12.5", "abc", "1,2,3.4.5"]) {
      for (const lang of [undefined, ...LANGS]) expect(forLanguage(s, lang), `${s} ${lang}`).toBe(oldForLanguage(s, lang));
    }
  });

  it("UT-PFXTEXT-OPT-003 textFormat equals the old body over value x pattern x language", () => {
    for (const v of VALUES) for (const p of PATTERNS) for (const lang of [undefined, ...LANGS]) {
      expect(Object.is(textFormat(v, p, lang), oldTextFormat(v, p, lang)) , `${v} ${p} ${lang}`).toBe(true);
    }
  });

  it("UT-PFXTEXT-OPT-004 textIntOr equals the old body", () => {
    for (const v of VALUES) for (const alt of PATTERNS) for (const lang of [undefined, ...LANGS]) {
      expect(textIntOr(v, alt, lang), `${v} ${alt} ${lang}`).toBe(oldTextIntOr(v, alt, lang));
    }
  });

  it("UT-PFXTEXT-OPT-005 Production's pfxText (now textFormat with the language) equals the old pfxText over the same table", () => {
    for (const v of VALUES) for (const p of PATTERNS) for (const lang of [undefined, ...LANGS]) {
      expect(pfxText(v, p, lang), `${v} ${p} ${lang}`).toBe(oldPfxText(v, p, lang));
    }
    // and its int-or variant, as the summary tiles use it
    for (const v of VALUES) for (const lang of LANGS) {
      const old = v === null || v === undefined ? "" : oldPfxText(v, Number.isInteger(v) ? "###,###,###" : "###,##0.0#", lang);
      expect(pfxTextIntOr(v, "###,###,###", "###,##0.0#", lang)).toBe(old);
    }
  });
});
