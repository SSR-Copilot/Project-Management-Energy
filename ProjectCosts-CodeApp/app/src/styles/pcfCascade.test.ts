/// <reference types="node" />
/**
 * Guards the DEVEX/CAPEX grid's typography against the two ways it can silently drift.
 *
 * 1. `features/capex-costs/pcf/css/TableConnectedToDataversePCF.css` is a VERBATIM copy of
 *    the shipped PCF control's stylesheet. It is the authoritative source for every font
 *    size, weight and colour in the grid, so it must never be hand-edited — a mismatch
 *    against the vendor clone is a bug, not a customisation.
 *
 * 2. That stylesheet was written for a Power Apps host and leaves two things to be
 *    inherited that FluentProvider supplies differently. `styles/canvas.css` and
 *    `styles/global.css` compensate; if those rules are deleted the grid regresses
 *    (contract rows grow past 40px, the ••• menu falls back to the UA serif font) with no
 *    other test noticing, because neither is a behavioural change.
 *
 * The stylesheets are read with `node:fs`, not `import ... from "x.css?raw"`: Vitest stubs
 * every CSS import to the empty string unless `test.css` is turned on. The triple-slash
 * reference above pulls in `@types/node` for this file alone — `tsconfig.app.json` types
 * the `src` tree with `vite/client` only, and widening that for one test is not worth it.
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (relative: string) =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");

const pcfCss = read("../features/capex-costs/pcf/css/TableConnectedToDataversePCF.css");
const canvasCss = read("./canvas.css");
const globalCss = read("./global.css");

/** The declaration block of the first rule whose selector list contains `selector`. */
function block(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const body = new RegExp(`(^|[,}\\s])${escaped}\\s*\\{([^}]*)\\}`, "m").exec(css)?.[2];
  if (body === undefined) throw new Error(`no rule for ${selector}`);
  return body;
}

describe("PCF grid stylesheet", () => {
  it("is identical to the vendor control's stylesheet", () => {
    // The vendor clone sits outside the app package, so it is not guaranteed to be on disk
    // in every checkout. Assert only when it is there rather than failing the suite.
    const vendor = fileURLToPath(
      new URL(
        "../../../../Existing Solution/PCF Git Repo Clones/DevexCapexSummaryPCF/TableConnectedToDataversePCF/css/TableConnectedToDataversePCF.css",
        import.meta.url,
      ),
    );
    if (!existsSync(vendor)) return;
    const normalise = (s: string) => s.replace(/\r\n/g, "\n");
    expect(normalise(pcfCss)).toBe(normalise(readFileSync(vendor, "utf8")));
  });

  it("keeps the canvas-sourced type ramp on the rows the client compared", () => {
    // Every value below was sampled pixel-wise from `UI Screenshots/Cost App Landing
    // Screen - Devex Capex Screen - Expanded Account Rows.png`.
    expect(block(pcfCss, ".pcf-table th")).toMatch(/color:\s*#595959/);
    expect(block(pcfCss, ".pcf-table th")).toMatch(/font-weight:\s*600/);
    expect(block(pcfCss, ".pcf-row-account td")).toMatch(/font-weight:\s*700/);
    expect(block(pcfCss, ".pcf-row-sub td")).toMatch(/color:\s*#333/);
    expect(block(pcfCss, ".pcf-name-main")).toMatch(/color:\s*#242424/);
    expect(block(pcfCss, ".pcf-meta-tag-spv")).toMatch(/color:\s*#767676/);
    expect(block(pcfCss, ".pcf-contract-link")).toMatch(/font-style:\s*italic/);
    expect(block(pcfCss, ".pcf-contract-link")).toMatch(/color:\s*#006EB9/);
    expect(block(pcfCss, ".pcf-grand-label")).toMatch(/background:\s*#595959/);
    expect(block(pcfCss, ".pcf-row-grand td")).toMatch(/font-weight:\s*700/);
  });
});

describe("host-cascade compensation", () => {
  it("supplies the line-height the control assumed it would inherit", () => {
    // The control root deliberately re-declares font-family/size/colour but NOT
    // line-height — under FluentProvider that inherits 20px instead of `normal`, which
    // pushes `.pcf-name-block` (12px name + 1px gap + 10px sub-label) past the 40px
    // `.pcf-row-contract td`. If the control ever starts declaring it, drop our rule.
    expect(block(pcfCss, ".pcf-budget-grid")).not.toMatch(/line-height/);
    expect(
      block(
        canvasCss,
        ".canvas-pcf-host, .pcf-dropdown, .pcf-add-dropdown, .pcf-month-dropdown, .pcf-comment-tooltip-floating",
      ),
    ).toMatch(/line-height:\s*normal/);
  });

  it("gives the contract ••• menu a font-family", () => {
    // ActionDropdown mounts `.pcf-dropdown` on document.body, and unlike its siblings
    // `.pcf-add-dropdown` / `.pcf-month-dropdown-item` the control never names a font for
    // it — `.pcf-dropdown-item` just says `inherit`. Without a body font that resolved to
    // the UA serif default.
    expect(block(pcfCss, ".pcf-dropdown")).not.toMatch(/font-family/);
    expect(block(pcfCss, ".pcf-dropdown-item")).toMatch(/font-family:\s*inherit/);
    expect(block(pcfCss, ".pcf-add-dropdown")).toMatch(/font-family:\s*'Segoe UI'/);
    expect(canvasCss).toMatch(/\.pcf-dropdown\s*\{\s*font-family:\s*'Segoe UI', sans-serif;\s*\}/);
    expect(block(globalCss, "body")).toMatch(/font-family:/);
  });
});
