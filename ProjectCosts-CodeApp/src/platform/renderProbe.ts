/**
 * Test seam for render counts (D143, generalised in D162).
 *
 * A component that a test must prove is NOT re-rendered calls `probeRender("<name>")` in its body. In production `renderProbe.current`
 * is `null`, so a render costs one property read. A test sets it (see `src/test/renderCounts.ts`) and counts the calls per name.
 * Generators' `sections/renderProbe.ts` re-exports this one object, so there is one probe in the app.
 */
export const renderProbe: { current: ((name: string) => void) | null } = { current: null };

/** Called from the body of a component whose renders a test counts. */
export const probeRender = (name: string): void => { renderProbe.current?.(name); };
