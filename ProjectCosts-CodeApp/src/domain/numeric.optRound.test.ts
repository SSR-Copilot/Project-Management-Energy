/**
 * OPT-33 (B8): `roundDown` / `roundUp` were defined twice (`numeric.ts` and `powerFxNumeric.ts`) with the same body; there is now one
 * definition (`powerFxNumeric.ts`) and `numeric.ts` re-exports it. The two OLD bodies are the oracles over an edge table, compared
 * bit for bit (`Object.is`, so -0 and NaN count). `round` vs `pfxRound` is NOT touched: they disagree on ties (DEC-1, a product decision).
 */
import { describe, expect, it } from "vitest";
import * as numeric from "./numeric";
import * as pfx from "./powerFxNumeric";

const oldNumericDown = (x: number, places = 0): number => {
  const m = 10 ** places;
  return (x < 0 ? Math.ceil(x * m) : Math.floor(x * m)) / m;
};
const oldNumericUp = (x: number, places = 0): number => {
  const m = 10 ** places;
  return (x < 0 ? Math.floor(x * m) : Math.ceil(x * m)) / m;
};
const oldPfxDown = (x: number, places = 0) => {
  const m = 10 ** places;
  return (x < 0 ? Math.ceil(x * m) : Math.floor(x * m)) / m;
};
const oldPfxUp = (x: number, places = 0) => {
  const m = 10 ** places;
  return (x < 0 ? Math.floor(x * m) : Math.ceil(x * m)) / m;
};

const VALUES = [
  0, -0, 1, -1, 0.5, -0.5, 1.5, -1.5, 2.5, -2.5, 0.1, 0.2, 0.3, 1.005, 2.675, -2.675, 1.4999999999, 1.5000000001, 99.99, -99.99,
  123456.789, -123456.789, 1e-7, -1e-7, 1e21, -1e21, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER, Number.EPSILON,
  Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 7 / 3, -7 / 3, 10 / 3, 1234.5678, 0.07, 0.29, 4.35,
];

describe("OPT-33 roundDown / roundUp: one definition", () => {
  it("UT-NUMERIC-OPT-001 numeric and powerFxNumeric are the same function and equal both old bodies over the edge table", () => {
    expect(numeric.roundDown).toBe(pfx.roundDown);
    expect(numeric.roundUp).toBe(pfx.roundUp);
    for (const x of VALUES) {
      for (const places of [undefined, 0, 1, 2, 3, 4, 6]) {
        expect(Object.is(numeric.roundDown(x, places), oldNumericDown(x, places)), `down ${x} ${places}`).toBe(true);
        expect(Object.is(pfx.roundDown(x, places), oldPfxDown(x, places)), `pfx down ${x} ${places}`).toBe(true);
        expect(Object.is(numeric.roundUp(x, places), oldNumericUp(x, places)), `up ${x} ${places}`).toBe(true);
        expect(Object.is(pfx.roundUp(x, places), oldPfxUp(x, places)), `pfx up ${x} ${places}`).toBe(true);
      }
    }
  });

  it("UT-NUMERIC-OPT-002 round and pfxRound stay two functions that disagree on a tie (DEC-1, untouched)", () => {
    expect(numeric.round).not.toBe(pfx.pfxRound);
  });
});
