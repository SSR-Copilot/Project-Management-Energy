/**
 * The project name in the header, in the stylesheet (CA-21).
 *
 * `con_cmp_Header_HeaderText` is `Text@0.0.51`, `Size: =20`, `Weight: Semibold` in the `cmp_Header` of
 * BOTH canvas apps. The code app shows it on the Cost screens and on the Project Management screens
 * through ONE rule, `.canvas-project-title`; the PM-only rule may add spacing but must never restate
 * the typography, or the two headers can drift apart again (the Cost name had rendered at 16 px in
 * Fluent's grey while the PM name rendered at 20 px in black).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const raw = readFileSync(new URL("../styles/canvas.css", import.meta.url), "utf8");

/** The stylesheet without its comments, so a rule is `selector { declarations }` and nothing else. */
const css = raw.replace(/\/\*[\s\S]*?\*\//g, "");

/** The declarations of the (last) rule whose selector is exactly `selector`, as a property map. */
function rule(selector: string): Record<string, string> {
  const re = new RegExp(`(?:^|\\})\\s*${selector.replace(/[.]/g, "\\.")}\\s*\\{([^}]*)\\}`, "gm");
  let body: string | undefined;
  for (const m of css.matchAll(re)) body = m[1];
  if (body === undefined) throw new Error(`no rule for ${selector}`);
  const out: Record<string, string> = {};
  for (const decl of body.split(";")) {
    const i = decl.indexOf(":");
    if (i > 0) out[decl.slice(0, i).trim()] = decl.slice(i + 1).trim();
  }
  return out;
}

const TYPOGRAPHY = ["font-size", "line-height", "font-weight", "color"] as const;

describe("header project name typography", () => {
  it("UT-HEADERCSS-001 the shared rule is the canvas 20 px Semibold, black, single-line with an ellipsis", () => {
    const shared = rule(".canvas-project-title");
    expect(shared["font-size"]).toBe("20px");
    expect(shared["line-height"]).toBe("28px");
    expect(shared["font-weight"]).toBe("600");
    expect(shared["color"]).toBe("#000");
    expect(shared["white-space"]).toBe("nowrap");
    expect(shared["overflow"]).toBe("hidden");
    expect(shared["text-overflow"]).toBe("ellipsis");
    // A long name may shrink inside the header's flex row; there is no character cap (the old 28ch).
    expect(shared["min-width"]).toBe("0");
    expect(shared["max-width"]).toBe("none");
  });

  it("UT-HEADERCSS-002 the PM-only rule restates none of the typography, so it cannot drift from the Cost header", () => {
    const pm = rule(".canvas-pm-project-title");
    for (const prop of TYPOGRAPHY) expect(pm[prop], `${prop} must come from .canvas-project-title`).toBeUndefined();
    expect(pm["padding"]).toBe("0");
  });

  it("UT-HEADERCSS-003 no other rule restyles the title's font through a descendant or header selector", () => {
    const stray = [...css.matchAll(/([^{}]*\.canvas-project-title[^{}]*)\{([^}]*)\}/g)]
      .filter((m) => m[1]!.trim() !== ".canvas-project-title")
      .filter((m) => /font-size|font-weight|line-height|(?<!-)color\s*:/.test(m[2]!));
    expect(stray.map((m) => m[1]!.trim())).toEqual([]);
  });
});
