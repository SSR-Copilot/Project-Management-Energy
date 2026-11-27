// Throwaway config for the RND bench files (read-only audit; never part of the app's suite).
// Run from ProjectCosts-CodeApp/:  npx vitest run --config ../ProjectDocs/bottleneck-identification/_bench/RND/vitest.config.mts <file>
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { defineConfig } from "../../../../ProjectCosts-CodeApp/node_modules/vitest/dist/config.js";
import base from "../../../../ProjectCosts-CodeApp/vite.config";

const app = (p: string) => fileURLToPath(new URL(`../../../../ProjectCosts-CodeApp/${p}`, import.meta.url));
const here = fileURLToPath(new URL("./", import.meta.url));
const req = createRequire(app("package.json"));
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\/]/g, "\$&");
const baseAlias = (base as any).resolve.alias as Record<string, string>;

// The bench files live outside the app folder, so bare imports from them are mapped to the app's node_modules.
const EXACT = [
  "react", "react/jsx-runtime", "react/jsx-dev-runtime", "react-dom", "react-dom/client",
  "@testing-library/react", "react-router-dom",
].map((id) => ({ find: new RegExp("^" + esc(id) + "$"), replacement: req.resolve(id) }))
  // ESM entries (the app resolves these too), so there is one instance of each.
  .concat([
    { find: /^@fluentui\/react-components$/, replacement: app("node_modules/@fluentui/react-components/lib/index.js") },
    { find: /^@tanstack\/react-query$/, replacement: app("node_modules/@tanstack/react-query/build/modern/index.js") },
  ]);

export default defineConfig({
  root: here,
  plugins: (base as any).plugins,
  define: (base as any).define,
  resolve: {
    alias: [
      ...Object.entries(baseAlias).map(([find, replacement]) => ({ find: new RegExp("^" + esc(find) + (find === "@" ? "(?=/)" : "$")), replacement })),
      ...EXACT,
    ],
  },
  server: { fs: { strict: false } },
  test: {
    pool: "threads",
    environment: "node",
    globals: true,
    include: ["*.bench.test.{ts,tsx}"],
    setupFiles: [fileURLToPath(new URL("./setup.bench.ts", import.meta.url))],
    testTimeout: 120_000,
  },
});
