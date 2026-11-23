/**
 * A function whose identity never changes and that always calls the LATEST one it was given (D143).
 *
 * The Generators screen passes its handlers to memoized sections and panels. Most handlers close over screen state (the forms,
 * the selection, the reads), so a plain `useCallback` would change on nearly every render and defeat `React.memo`. This keeps
 * the identity fixed and reads the newest closure when the handler is CALLED (always from an event, after the commit, so it
 * sees the same state the inline arrow function it replaces would have seen).
 */
import { useCallback, useLayoutEffect, useRef } from "react";

export function useStableCallback<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  const ref = useRef(fn);
  useLayoutEffect(() => { ref.current = fn; });
  return useCallback((...args: A) => ref.current(...args), []);
}
