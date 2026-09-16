/**
 * Shared test setup.
 *
 * The default environment is `node` (see `vite.config.ts`), so the jest-dom matchers are
 * loaded only when a file has opted into jsdom with `// @vitest-environment jsdom`.
 * Importing them unconditionally throws in a node environment.
 */
if (typeof document !== "undefined") {
  await import("@testing-library/jest-dom/vitest");
}
