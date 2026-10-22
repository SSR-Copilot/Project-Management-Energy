/**
 * H6 — which panel fields the user has touched, and when a validation message may show.
 *
 * CAPEX Accounts (`Panels.tsx:89, 92`) shows the name error only once the field was typed in;
 * Check List Settings keeps one editor-wide `touched` flag; Contracts (`ContractPanel.tsx:82-87`)
 * holds back only the BLANK error until a field is touched — `shownError`.
 */
import { useCallback, useState } from "react";

export interface Touched<K extends string> {
  isTouched(k: K): boolean;
  touch(k: K): void;
  touchAll(ks: readonly K[]): void;
  reset(): void;
  /** Any field touched. */
  any: boolean;
}

export function useTouched<K extends string>(): Touched<K> {
  const [touched, setTouched] = useState<ReadonlySet<K>>(() => new Set());
  const isTouched = useCallback((k: K) => touched.has(k), [touched]);
  const touch = useCallback((k: K) => setTouched((prev) => (prev.has(k) ? prev : new Set([...prev, k]))), []);
  const touchAll = useCallback((ks: readonly K[]) => setTouched((prev) => {
    if (ks.every((k) => prev.has(k))) return prev;
    return new Set([...prev, ...ks]);
  }), []);
  const reset = useCallback(() => setTouched(new Set()), []);
  return { isTouched, touch, touchAll, reset, any: touched.size > 0 };
}

/**
 * The message to show for a field.
 *
 * Without `blankMessage` (CAPEX rule): the error shows only once the field is touched.
 * With `blankMessage` (Contracts rule): an error equal to it waits for the touch; any other
 * error (format, range) shows at once.
 */
export function shownError(error: string | undefined, touched: boolean, blankMessage?: string): string | undefined {
  if (!error) return undefined;
  if (blankMessage === undefined) return touched ? error : undefined;
  return error !== blankMessage || touched ? error : undefined;
}
