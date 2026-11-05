/**
 * The ✕ of every Cost side panel (D88): one shared hover, one shared position, no per-screen restyle.
 *
 * jsdom does not load `canvas.css`, so this reads the stylesheet and the Cost sources as text.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(__dirname, "..", "styles", "canvas.css"), "utf8");
const costDir = join(__dirname, "..", "features", "cost");

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sources(p);
    return /\.tsx?$/.test(name) && !/\.test\./.test(name) ? [p] : [];
  });
}

describe("Cost side-panel ✕ (D88)", () => {
  it("UT-COSTCLOSE-001 the shared ✕ hover is a translucent white fill that keeps the icon white", () => {
    expect(css).toMatch(/\.canvas-panel-header button:hover,[\s\S]*?\{\s*color: white;\s*background-color: rgba\(255, 255, 255, 0\.2\);/);
    expect(css).toMatch(/\.canvas-panel-header button:hover \.fui-Button__icon[\s\S]*?\{\s*color: white;/);
  });

  it("UT-COSTCLOSE-002 the canvas centring rule exists and fills the bar for the title row", () => {
    expect(css).toMatch(/\.canvas-panel\.canvas-panel-close-centered \.canvas-panel-header\s*\{[^}]*padding-top: 0;[^}]*padding-bottom: 0;/);
    expect(css).toMatch(/\.canvas-panel-close-centered \.canvas-panel-header \.fui-DrawerHeaderTitle\s*\{[^}]*flex: 1 1 auto;/);
  });

  it("UT-COSTCLOSE-003 every Cost FormPanel opts in to centerClose", () => {
    const found: string[] = [];
    let panels = 0;
    for (const file of sources(costDir)) {
      const text = readFileSync(file, "utf8");
      for (const m of text.matchAll(/<FormPanel(?=\s)([\s\S]*?)(?:\n\s*>|>\s*\n|>\s*<)/g)) {
        panels += 1;
        if (!/\bcenterClose\b/.test(m[1] ?? "")) found.push(file);
      }
    }
    expect(panels).toBe(8); // contracts x3, capex, comments, opex, land lease, add costs
    expect(found).toEqual([]);
  });

  it("UT-COSTCLOSE-004 no Cost screen restyles the ✕ (button, hover or icon) in its panel skin", () => {
    const offenders = sources(costDir).filter((f) => /canvas-panel-header\s+button/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});