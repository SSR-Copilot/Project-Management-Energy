/// <reference types="node" />
/**
 * The settings page scroller, and the promise that it is SCOPED.
 *
 * Work order `13-reusable-components/09-picker-height-change.md` (Option 4): the Country /
 * Technology picker now stretches to the left navigation's height and no longer scrolls
 * inside itself. A picker list that is genuinely taller than the viewport therefore has to
 * grow and let the PAGE scroll — otherwise `.canvas-shell main { overflow: hidden }` clips it
 * and the countries past the fold become unreachable, which is the defect this change fixes.
 *
 * The scroller is added for `.canvas-settings-shell` only. The broader
 * `.canvas-shell main { … overflow: hidden }` must stay exactly as it is: the cost screens
 * (`.canvas-cost-screen`) and the PCF grid host own their internal scrollers and depend on
 * `main` NOT scrolling. The two assertions below document both halves of that promise.
 *
 * Read with `node:fs` rather than a `?raw` import for the reason given in
 * `pcfCascade.test.ts:16-19` — Vitest stubs CSS imports to the empty string.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const canvasCss = readFileSync(fileURLToPath(new URL("./canvas.css", import.meta.url)), "utf8");

describe("Application Settings page scroller", () => {
  it("gives the settings shell's main a vertical scroller", () => {
    expect(canvasCss).toMatch(/\.canvas-settings-shell\s+main\s*\{[^}]*overflow-y:\s*auto[^}]*\}/);
  });

  it("leaves the shared `.canvas-shell main` clip rule unchanged", () => {
    // Scoped, not global: the cost and PM shells keep `overflow: hidden`.
    expect(canvasCss).toMatch(
      /\.canvas-shell\s+main\s*\{\s*padding:\s*0;\s*gap:\s*0;\s*background:\s*#fff;\s*border:\s*1px solid #dedede;\s*border-radius:\s*4px;\s*overflow:\s*hidden;\s*\}/,
    );
    // And the settings rule must not have been widened to every shell.
    expect(canvasCss).not.toMatch(/^\.canvas-shell\s+main\s*\{[^}]*overflow-y:\s*auto/m);
  });
});
