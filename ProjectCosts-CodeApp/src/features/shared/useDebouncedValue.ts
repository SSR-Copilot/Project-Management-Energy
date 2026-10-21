import { useEffect, useState } from "react";

/**
 * Delays a value so a keystroke does not become a Dataverse query.
 *
 * The canvas app bound gallery `Items` straight to a `Filter(...)` over the typed text, so
 * every character issued a request. This is the one legitimate `setState` in an effect: a
 * timer is an external system.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
