/**
 * Shared test setup.
 *
 * The default environment is `node` (see `vite.config.ts`), so the jest-dom matchers are
 * loaded only when a file has opted into jsdom with `// @vitest-environment jsdom`.
 * Importing them unconditionally throws in a node environment.
 */
if (typeof document !== "undefined") {
  await import("@testing-library/jest-dom/vitest");

  /**
   * jsdom ships no `ResizeObserver`, and Fluent's `MessageBar` constructs one to decide
   * whether to reflow its actions onto a second line. Without this a render that includes one
   * throws `win.ResizeObserver is not a constructor` from inside a layout effect, which
   * surfaces as a failure in whatever test happened to mount it.
   *
   * A no-op is the right stub: nothing under test depends on a resize ever being reported,
   * and a stub that fired callbacks would make layout-dependent components behave differently
   * in tests than in a browser.
   */
  if (!("ResizeObserver" in globalThis)) {
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
}
