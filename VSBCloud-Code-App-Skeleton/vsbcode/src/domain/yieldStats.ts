/**
 * Translation of `fn_Calculate_P75_P90` (PM).
 *
 * Source formulas, verbatim:
 *   p75 = If(And(IsNumeric(p50), IsNumeric(Uncertainty)),
 *            Round(Value(p50) + (-0.674490 * (Value(p50) * Value(Uncertainty))), 0), -1)
 *   p90 = same with -1.281551
 *
 * The `-1` sentinel is the canvas app's "not computable" marker; it is preserved because
 * screens test for it. Use `p75OrNull` when you want a real absent value.
 */
import { isNumeric, parseNumber, pfxRound } from "./numeric";

/** Standard-normal z-scores the canvas app hard-codes. */
export const Z = { p75: -0.674490, p90: -1.281551 } as const;

export const NOT_COMPUTABLE = -1;

function exceedance(p50: string | number, uncertainty: string | number, z: number): number {
  if (!isNumeric(p50) || !isNumeric(uncertainty)) return NOT_COMPUTABLE;
  const m = parseNumber(p50);
  const u = parseNumber(uncertainty);
  return pfxRound(m + z * (m * u), 0);
}

export const p75 = (p50: string | number, uncertainty: string | number) =>
  exceedance(p50, uncertainty, Z.p75);

export const p90 = (p50: string | number, uncertainty: string | number) =>
  exceedance(p50, uncertainty, Z.p90);

export const p75OrNull = (p50: string | number, u: string | number) => {
  const v = p75(p50, u);
  return v === NOT_COMPUTABLE ? null : v;
};
export const p90OrNull = (p50: string | number, u: string | number) => {
  const v = p90(p50, u);
  return v === NOT_COMPUTABLE ? null : v;
};

/**
 * Inverse: derive uncertainty from p50 and a measured p75 or p90.
 *
 * DEVIATION FROM SOURCE. The canvas `calculateUncertainty` is
 *   Round((Value(p50) - Value(p75) / Value(p50) * Value(0.674490)), 1)
 * which by operator precedence evaluates as p50 - ((p75/p50) * 0.674490) — dimensionally
 * wrong, and it never divides by p50 in the right place. Both call sites are commented out
 * in the source, so nothing depends on the broken result.
 *
 * The correct inverse of the p75/p90 formulas is u = (p50 - pX) / (|z| * p50).
 */
export function uncertaintyFrom(
  p50v: string | number,
  measured: { p75?: string | number; p90?: string | number },
): number | null {
  const m = parseNumber(p50v);
  if (!Number.isFinite(m) || m === 0) return null;
  if (measured.p75 !== undefined && isNumeric(measured.p75)) {
    return pfxRound((m - parseNumber(measured.p75)) / (Math.abs(Z.p75) * m), 4);
  }
  if (measured.p90 !== undefined && isNumeric(measured.p90)) {
    return pfxRound((m - parseNumber(measured.p90)) / (Math.abs(Z.p90) * m), 4);
  }
  return null;
}

/** Reproduces the shipped (incorrect) canvas formula, for parity testing only. */
export function calculateUncertaintyCanvasParity(
  p50v: string | number,
  p75v?: string | number,
  p90v?: string | number,
): number | null {
  const m = parseNumber(p50v);
  if (p75v !== undefined && p75v !== null && p75v !== "") {
    return pfxRound(m - (parseNumber(p75v) / m) * 0.674490, 1);
  }
  if (p90v !== undefined && p90v !== null && p90v !== "") {
    return pfxRound(m - (parseNumber(p90v) / m) * 1.281551, 1);
  }
  return null;
}
