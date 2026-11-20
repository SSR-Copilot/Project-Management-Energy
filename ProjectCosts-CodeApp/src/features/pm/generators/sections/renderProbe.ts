/**
 * Test seam (D143, UT-GENPERF-3xx): each memoized section reports when it renders, so a test can prove that one family's update
 * does not re-render the others. `null` in production, so a render costs one property read.
 */
export const sectionRenderProbe: { current: ((name: string) => void) | null } = { current: null };

/** Called from the body of each memoized section. */
export const probeRender = (name: string): void => { sectionRenderProbe.current?.(name); };
