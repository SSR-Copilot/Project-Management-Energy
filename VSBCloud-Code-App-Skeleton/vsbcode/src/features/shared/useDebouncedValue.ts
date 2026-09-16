/**
 * `useDebouncedValue` — trail a value behind its source by a fixed delay.
 *
 * Needed because the portfolio filter now runs on the *server*. Every keystroke in the
 * Project box would otherwise be one Dataverse request against a 1,127-row table. The canvas
 * screen solved the same problem with a delayed `OnChange` trigger on `txt_Filter_Project`.
 *
 * Deliberately not `useDeferredValue`: that yields to rendering pressure, which is a
 * different thing from rate-limiting the network, and it gives no guarantee about how many
 * distinct values a caller observes.
 */
import { useEffect, useState } from "react";

export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    // A zero or negative delay means "no debounce" — settle synchronously on the next tick
    // rather than scheduling a timer that fires immediately anyway.
    if (delayMs <= 0) {
      setDebounced(value);
      return;
    }
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);

  return debounced;
}
