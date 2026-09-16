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
export default defineConfig({
  plugins: [react()],
  base: "./",
  server: { port: 3000, strictPort: true },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
    rollupOptions: {
      output: {
        /**
         * Fluent v9 is ~630 kB on its own. Keeping it in its own chunk means a screen-level
         * change does not invalidate it in the browser cache.
         *
         * Rollup 4 types `manualChunks` as a function here, so the record form is expressed
         * as one.
         */
        manualChunks: (id: string) =>
          id.includes("node_modules/@fluentui") || id.includes("node_modules/@griffel")
            ? "fluent"
            : undefined,
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
    include: ["src/**/*.test.{ts,tsx}"],
    /**
     * Pre-bundle node_modules for the test workers.
     *
     * Without this, a jsdom test that imports Fluent UI makes the worker transform ~2,300
     * modules one file at a time. On this checkout — under OneDrive, on Windows — that
     * exceeds the pool's worker-handshake budget and the run fails with
     * "Timeout waiting for worker to respond" rather than a test failure.
     */
    deps: { optimizer: { web: { enabled: true } } },
  },
});
