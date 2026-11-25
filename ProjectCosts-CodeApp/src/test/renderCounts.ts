/**
 * Render counting for tests (D162 B0). Switches on the `probeRender` seam (`platform/renderProbe.ts`) and counts the calls per name.
 *
 *   const renders = countRenders();
 *   ... act ...
 *   expect(renders.of("GateTaskRow")).toBe(1);
 *   renders.reset();   // count the next interaction from zero
 *   renders.stop();    // in afterEach
 */
import { renderProbe } from "@/platform/renderProbe";

export interface RenderCounts {
  /** Renders of `name` since start or the last `reset()`. */
  of(name: string): number;
  /** Renders of every name starting with `prefix` (e.g. all rows `GateTaskRow:`). */
  ofPrefix(prefix: string): number;
  /** A copy of all counts. */
  snapshot(): Record<string, number>;
  reset(): void;
  stop(): void;
}

export function countRenders(): RenderCounts {
  const counts = new Map<string, number>();
  renderProbe.current = (name) => { counts.set(name, (counts.get(name) ?? 0) + 1); };
  return {
    of: (name) => counts.get(name) ?? 0,
    ofPrefix: (prefix) => [...counts].reduce((n, [k, v]) => (k.startsWith(prefix) ? n + v : n), 0),
    snapshot: () => Object.fromEntries(counts),
    reset: () => { counts.clear(); },
    stop: () => { renderProbe.current = null; counts.clear(); },
  };
}
