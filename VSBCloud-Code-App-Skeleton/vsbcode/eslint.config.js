/**
 * Flat config. `.eslintrc.cjs` stopped being read at ESLint 9, so `npm run lint` had been
 * failing with "couldn't find an eslint.config.js" rather than linting anything — a broken
 * check reads as a passing one to everybody who never runs it, which is why this exists.
 *
 * Deliberately narrow. `tsc --noEmit` in strict mode already covers most of what a
 * TypeScript lint config is usually there for, and the type-aware rule set is slow enough to
 * discourage running the gate. What is left is the class of defect the compiler cannot see:
 * the rules-of-hooks violations that produce React error #185 at runtime and nothing at all
 * at build time.
 */
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**", "coverage/**", "*.cjs", "solution/plugins/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        window: "readonly", document: "readonly", navigator: "readonly",
        console: "readonly", fetch: "readonly", localStorage: "readonly",
        sessionStorage: "readonly", setTimeout: "readonly", clearTimeout: "readonly",
        setInterval: "readonly", clearInterval: "readonly", AbortController: "readonly",
        AbortSignal: "readonly", URL: "readonly", URLSearchParams: "readonly",
        Intl: "readonly", crypto: "readonly", performance: "readonly",
        HTMLElement: "readonly", Element: "readonly", Event: "readonly",
        KeyboardEvent: "readonly", MouseEvent: "readonly", ResizeObserver: "readonly",
        requestAnimationFrame: "readonly", matchMedia: "readonly", structuredClone: "readonly",
      },
    },
    rules: {
      // A conditional hook or a hook in a loop is a runtime crash the compiler allows.
      "react-hooks/rules-of-hooks": "error",
      // A warning, not an error: several dependency lists here are deliberately narrow and
      // carry a comment saying why. Read the comment before you "fix" one.
      "react-hooks/exhaustive-deps": "warn",
      // tsc's noUnusedLocals already does this, and better.
      "no-unused-vars": "off",
      // tsc's noUnusedLocals covers src/. It does not cover scripts/ and solution/, which
      // are plain .mjs outside the TypeScript project, so the rule is enabled for those in
      // the block below with the conventional `_`-prefix escape.
      "@typescript-eslint/no-unused-vars": "off",
      // Both are load-bearing in this codebase and each use is deliberate: `any` at the
      // Dataverse boundary where the row shape is genuinely unknown, and `!` where a query
      // guard has already established the value. Neither is worth a blanket ban.
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
  {
    files: ["scripts/**/*.mjs", "solution/**/*.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { process: "readonly", console: "readonly", fetch: "readonly", URL: "readonly",
                 AbortSignal: "readonly", setTimeout: "readonly", Buffer: "readonly" },
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
);
