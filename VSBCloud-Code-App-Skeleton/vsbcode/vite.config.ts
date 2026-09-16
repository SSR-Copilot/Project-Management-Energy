import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [react()],
  base: "./",
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  server: { port: 3000, host: true },
  build: {
    outDir: "dist",
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          fluent: ["@fluentui/react-components", "@fluentui/react-icons"],
          query: ["@tanstack/react-query", "@tanstack/react-virtual"],
        },
      },
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    css: false,
    /**
     * `tabster` is Fluent v9's focus manager, reached through `FluentProvider`. Its
     * package.json declares `"type": "module"` but points `main` at a **CJS** build and ships
     * no `exports` map, so Node's resolver hands Vitest the `.cjs` file and the named import
     * `createTabster` then does not exist. Pointing at the ESM build it also ships is the
     * whole fix.
     *
     * Test-scoped: the app build resolves this correctly on its own, so `resolve.alias` above
     * is deliberately left alone.
     */
    alias: [{ find: /^tabster$/, replacement: "tabster/dist/esm/index.js" }],
    server: {
      deps: {
        // The alias above only takes effect on code Vite transforms. Fluent is externalised
        // by default, so its own `import { createTabster } from "tabster"` would be resolved
        // by Node and bypass the alias entirely — both halves are required.
        inline: [/@fluentui\//],
      },
    },
  },
});
