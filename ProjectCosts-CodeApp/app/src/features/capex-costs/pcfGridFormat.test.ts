// @vitest-environment jsdom
/**
 * The pooled cost formatter in the PCF port still answers exactly as upstream does.
 *
 * `formatCostValue` is the one place the vendored renderer diverges from
 * `Existing Solution/PCF Git Repo Clones/DevexCapexSummaryPCF` for performance rather than
 * integration: upstream builds an `Intl.NumberFormat` per grid cell, which is ~27
 * constructions per row. `scripts/read-pcf-port.mjs` reapplies the pooling on every
 * regeneration; this pins the thing that matters — that the output did not move.
 */
import { describe, it, expect } from "vitest";
import { GridRenderer } from "./pcf/ui/GridRenderer";

/*
 * `formatCostValue` is `private` upstream and so is absent from `GridRenderer.d.ts`, which
 * types only the React-facing boundary. Reaching it needs a cast; widening the declaration
 * file would publish an internal.
 */
type CostFormatter = { formatCostValue(value: number): string };

/** The upstream implementation, verbatim, as the oracle. */
function upstreamFormat(value: number): string {
  const browserLocales = navigator.languages && navigator.languages.length > 0
    ? navigator.languages : [navigator.language];
  return new Intl.NumberFormat(browserLocales, {
    minimumFractionDigits: 0, maximumFractionDigits: 3,
  }).format(value);
}

describe("GridRenderer.formatCostValue pooling", () => {
  const prototype = GridRenderer.prototype as unknown as CostFormatter;
  const format = (v: number) => prototype.formatCostValue(v);

  it("matches the upstream formatter for every shape of value", () => {
    const values = [
      0, -0, 1, -1, 0.5, -0.5, 0.0005, -0.0005, 1.2345, 999.9995,
      1234.5, -987654.321, 1e6, 1e9, 1e15, -1e15, 0.001, 0.0001,
      Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER,
      Infinity, -Infinity, NaN,
    ];
    for (const v of values) expect(format(v)).toBe(upstreamFormat(v));
  });

  it("stays correct over many calls (the pooled instance is reused)", () => {
    for (let i = 0; i < 2000; i++) {
      const v = (i - 1000) * 13.77;
      expect(format(v)).toBe(upstreamFormat(v));
    }
  });

  it("rebuilds when the browser language list changes", () => {
    const original = Object.getOwnPropertyDescriptor(navigator, "languages");
    const set = (langs: string[]) =>
      Object.defineProperty(navigator, "languages", { value: langs, configurable: true });
    try {
      set(["en-GB"]);
      const en = format(1234567.891);
      set(["de-DE"]);
      const de = format(1234567.891);
      expect(en).toBe("1,234,567.891");
      expect(de).toBe("1.234.567,891");
      set(["en-GB"]);
      expect(format(1234567.891)).toBe(en);
    } finally {
      if (original) Object.defineProperty(navigator, "languages", original);
    }
  });
});
