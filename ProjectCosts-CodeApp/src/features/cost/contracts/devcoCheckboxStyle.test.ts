/**
 * The DevCo checkboxes' size, in the stylesheet (CA-22).
 *
 * The picker has two levels: the main gallery's parent row (a drawn SVG in a 32 px button) and the
 * nested gallery's leaf rows (a native checkbox). Each used to carry its own size, so one level's
 * box was bigger than the other's. Both now read the one variable `--devco-check`; these tests pin
 * that nothing else sets either size, that the drawn box really equals the variable, and that the two
 * columns still centre on the same line.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../../../styles/canvas.css", import.meta.url), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "");

/** The declarations of the rule whose selector is exactly `selector` (the last one wins), as a map. */
function rule(selector: string): Record<string, string> {
  const escaped = selector.replace(/[.[\]"=]/g, "\\$&");
  const re = new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`, "gm");
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

const px = (value: string | undefined) => {
  const m = /^(-?\d+(?:\.\d+)?)px$/.exec(value ?? "");
  if (!m) throw new Error(`not a px value: ${value}`);
  return Number(m[1]);
};

const LEAF = 'input[type="checkbox"]';
const leafRule = () => rule(`.canvas-devco-row ${LEAF}`);
const svgRule = () => rule(".canvas-devco-check svg");

describe("DevCo checkbox size", () => {
  it("UT-CONCHECK-001 one size variable is defined, in px, on the picker", () => {
    const size = px(rule(".canvas-devco")["--devco-check"]);
    expect(size).toBeGreaterThan(0);
  });

  it("UT-CONCHECK-002 the leaf checkbox takes its width and height from the variable, nothing else", () => {
    const leaf = leafRule();
    expect(leaf["width"]).toBe("var(--devco-check)");
    expect(leaf["height"]).toBe("var(--devco-check)");
  });

  it("UT-CONCHECK-003 the parent's SVG is sized from the same variable, scaled so its drawn box equals it", () => {
    const svg = svgRule();
    const scaled = "calc(var(--devco-check) * 24 / 22)";
    expect(svg["width"]).toBe(scaled);
    expect(svg["height"]).toBe(scaled);
    // The glyph draws its box 22 of 24 viewBox units wide (`ParentCheckbox` in Screen.tsx), so an
    // element 24/22 of the box draws a box exactly the size of the variable.
    const source = readFileSync(new URL("./Screen.tsx", import.meta.url), "utf8");
    expect(source).toMatch(/viewBox="0 0 24 24"/);
    expect(source).toMatch(/<rect\s+x="1" y="1" width="22" height="22"/);
  });

  it("UT-CONCHECK-004 both columns centre on the same line, 56 px from the row's right edge", () => {
    const size = px(rule(".canvas-devco")["--devco-check"]);
    // Parent: the button's centre, past the chevron's right gutter, width and left margin.
    const chevron = rule(".canvas-devco-chevron");
    const [, right = "", , left = ""] = (chevron["margin"] ?? "").split(/\s+/);
    const button = px(rule(".canvas-devco-check")["width"]);
    const parentCentre = px(right) + px(chevron["width"]) + px(left) + button / 2;
    // Leaf: its right margin is `C - box / 2` and its box is `size` wide, so its centre is `C`.
    const leafMargin = leafRule()["margin"] ?? "";
    const m = /^0 calc\((\d+)px - var\(--devco-check\) \/ 2\) 0 (\d+)px$/.exec(leafMargin);
    expect(m, `leaf margin was: ${leafMargin}`).not.toBeNull();
    const leafCentre = (Number(m![1]) - size / 2) + size / 2;
    expect(parentCentre).toBe(56);
    expect(leafCentre).toBe(parentCentre);
  });

  it("UT-CONCHECK-005 no other rule sets the size of the leaf checkbox or of the parent's SVG", () => {
    const stray = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)]
      .filter((m) => /canvas-devco/.test(m[1]!) && (/input\[type="checkbox"\]/.test(m[1]!) || /\bsvg\b/.test(m[1]!)))
      .filter((m) => /(^|;|\s)(width|height)\s*:/.test(m[2]!))
      .map((m) => m[1]!.trim());
    expect(stray.sort()).toEqual([
      ".canvas-devco-check svg",
      `.canvas-devco-row ${LEAF}`,
    ].sort());
  });
});
