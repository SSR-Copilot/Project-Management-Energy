import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
// `vitest/config` re-exports Vite's defineConfig with the `test` block typed.
import { defineConfig } from "vitest/config";

/**
 * `power.config.json` declares `buildPath: "dist"`, `buildEntryPoint: "index.html"` and
 * `localAppUrl: "http://localhost:3000"` — so the dev server MUST be on 3000 and the build
 * MUST land in `dist`, or `pac code run` / `pac code push` will not find the app.
 *
 * `base: "./"` matters: a published code app is served from a path under the Power Platform
 * host, not from the domain root, so absolute `/assets/...` URLs 404 there.
 */
/** D162 (FE-SH-05): the Fluent packages and their helpers the app shell needs at start-up (see `manualChunks`). */
const STARTUP_FLUENT = new Set([
  "keyboard-keys", "react-aria", "react-button", "react-combobox", "react-context-selector", "react-dialog", "react-drawer",
  "react-field", "react-icons", "react-input", "react-jsx-runtime", "react-label", "react-link", "react-menu", "react-message-bar",
  "react-motion", "react-motion-components-preview", "react-portal", "react-positioning", "react-provider", "react-shared-contexts",
  "react-spinner", "react-tabster", "react-text", "react-textarea", "react-toast", "react-tooltip", "react-utilities", "tokens",
]);
const STARTUP_FLUENT_HELPERS = /node_modules\/(@griffel\/|tabster\/|keyborg\/|@floating-ui\/|rtl-css-js\/|stylis\/|@emotion\/hash\/)/;

function isStartupFluent(id: string): boolean {
  const path = id.split("\\").join("/");
  const fluent = path.match(/node_modules\/@fluentui\/([^/]+)\//);
  return fluent ? STARTUP_FLUENT.has(fluent[1]!) : STARTUP_FLUENT_HELPERS.test(path);
}

export default defineConfig({
  plugins: [react()],
  base: "./",
  // The build this code came from. A new build changes it, which drops the reference data a previous build kept in IndexedDB
  // (`data/persistedReference.ts`, D142). It is also set under Vitest (the time the config loaded).
  define: { __APP_BUILD__: JSON.stringify(new Date().toISOString()) },
  server: {
    port: 3000,
    strictPort: true,
    // The Playwright parity suite writes its traces, reports and sessions under `e2e/` while it drives this dev server. Watching
    // them made Vite reload the app in the browser mid-test, for every trace snapshot written (Land Lease run, 3 Nov 2026). The
    // app never imports from `e2e/`, so it is left out of the watcher.
    watch: { ignored: ["**/e2e/**"] },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      /*
       * D140: `react-spreadsheet` (the Add Cost from Table grid) is the only package that uses
       * `use-context-selector`; under React 19 it rendered all ~28,000 cells on every keystroke.
       * `src/platform/useContextSelector.ts` implements the same two exports on
       * `useSyncExternalStore`, so only the cells whose state changed render.
       */
      "use-context-selector": fileURLToPath(new URL("./src/platform/useContextSelector.ts", import.meta.url)),
      /*
       * D162 (FE-C1-01): the same grid imports a formula engine (fast-formula-parser + chevrotain + jstat, 278 kB of the
       * screen's 360 kB) that this app never uses. `src/platform/formulaParserStub.ts` provides the three exports it needs;
       * the DIVERGENCE (a typed `=x` shows as typed) is recorded there and in D162.
       */
      "fast-formula-parser": fileURLToPath(new URL("./src/platform/formulaParserStub.ts", import.meta.url)),
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
    rollupOptions: {
      /*
       * D162 (FE-SH-04): the shared components and the domain helpers have no import-time side effects (no CSS, no globals:
       * checked 25 Nov 2026), but their top-level `makeStyles(...)` calls look like side effects to the bundler, so every member
       * of the `@/components` barrel landed in the start-up chunk whether the shell used it or not (about 35–40 kB). A module
       * here that ever needs to run on import must be imported for a value, or this rule must exclude it.
       */
      treeshake: {
        moduleSideEffects: (id: string) => !/[\\/]src[\\/](components|domain)[\\/]/.test(id),
      },
      output: {
        /**
         * The Fluent the app shell needs at start-up, in one chunk of its own, so a screen-level change does not invalidate it in
         * the browser cache.
         *
         * D162 (FE-SH-05): this used to take EVERY Fluent package any screen uses (760 kB, preloaded by `index.html`), so the date
         * picker's calendar, tabs, tags, tables, avatars … were downloaded and parsed before the first paint. Now only the
         * packages the start-up files need: the list is what a build without this rule puts in them (25 Nov 2026). The rest
         * split with the screens that use them. If the shell later needs another package, it loads as one more small file at
         * start-up; nothing breaks, re-derive the list with `node scripts/bundle-report.mjs` when it grows.
         */
        manualChunks: (id: string) => (isStartupFluent(id) ? "fluent" : undefined),
      },
    },
  },
  test: {
    /**
     * `forks` (the Vitest 5 default) times out spawning workers on this checkout — the
     * project lives under a OneDrive-synced path with spaces, and the fork handshake never
     * completes. `threads` works and is faster here anyway.
     */
    pool: "threads",
    /**
     * Node by default: `rules.ts` / `domain` tests are pure logic and jsdom was over half
     * the run time. A component test opts in with `// @vitest-environment jsdom` at the top
     * of the file.
     */
    environment: "node",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    // `e2e/harness/**/*.test.ts`: the parity harness's pure modules (D80); they never start a browser.
    include: ["src/**/*.test.{ts,tsx}", "e2e/harness/**/*.test.ts"],
    /**
     * Pre-bundle node_modules for the test workers.
     *
     * Without this, a jsdom test that imports Fluent UI makes the worker transform ~2,300
     * modules one file at a time. On this checkout — under OneDrive, on Windows — that
     * exceeds the pool's worker-handshake budget and the run fails with
     * "Timeout waiting for worker to respond" rather than a test failure.
     */
    deps: { optimizer: { web: { enabled: true, exclude: ["react-spreadsheet"] } } },
    /*
     * D162: react-spreadsheet goes through Vite's own transform in tests, so the two aliases it is BUILT with
     * (`use-context-selector`, D140; `fast-formula-parser`, D162) apply to it here too. Pre-bundled or externalised, it ran on
     * the original packages in tests only, so the Add Cost grid tests did not run the code users run.
     */
    server: { deps: { inline: ["react-spreadsheet"] } },
    // Its `main` is a CommonJS build whose `require()`s no alias reaches; the browser build uses `module` (the ES build). Same file here.
    alias: {
      "react-spreadsheet": fileURLToPath(new URL("./node_modules/react-spreadsheet/dist/es/index.js", import.meta.url)),
    },
    /**
     * 30 s per test, not Vitest's 5 s default. Under a full run on this OneDrive checkout the
     * jsdom screen tests that open panels and dialogs sometimes need longer than 5 s, and one
     * random test timed out per `npm run verify`. A real failure still fails; it is only
     * given time to render. Approved by the product owner, 20 Oct 2026 (X4).
     */
    testTimeout: 30_000,
  },
});
