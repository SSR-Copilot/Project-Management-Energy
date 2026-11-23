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
   * D157: `findBy*` and `waitFor` give up after 1 s by default. The jsdom screen tests that wait for a lazy chunk (the Generators
   * panels, D143) or a dialog passed alone and failed in a full run on a busy machine (UT-GEN-930 and 931, the "worker start"
   * timeouts), which taught people to rerun a red gate. A wait now has 5 s; a test that should fail still fails, only later, and
   * a passing one returns the moment its condition holds. The per-test limit stays 30 s (`vite.config.ts`).
   */
  const { configure } = await import("@testing-library/react");
  configure({ asyncUtilTimeout: 5_000 });

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
