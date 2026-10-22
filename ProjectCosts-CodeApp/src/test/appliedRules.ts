/**
 * Read back the CSS declarations Griffel actually applied to an element in jsdom.
 *
 * jsdom has no layout engine — `offsetHeight` and `getBoundingClientRect()` are always `0`,
 * so a test of the form `expect(picker.offsetHeight).toBe(rail.offsetHeight)` passes
 * `0 === 0` and keeps passing after the change it guards is reverted. Griffel's DOM renderer
 * does inject real `<style>` elements, though, so the *rules* can be asserted: every atomic
 * class on the element is looked up in `document.styleSheets` and its declarations merged.
 *
 * Only top-level single-class rules are collected; `@media` blocks are deliberately skipped
 * (jsdom resolves no media queries, so the wide/desktop declarations are the ones that apply).
 */
export function appliedRules(el: Element): Record<string, string> {
  return collect(el, "", undefined);
}

/**
 * The same read-back for a pseudo-element or pseudo-class selector on the element's classes,
 * e.g. `appliedPseudoRules(el, "::before")` or `":hover"`. Rules are collected in sheet order, so
 * a later atomic class wins as it does in the cascade for the same property.
 */
export function appliedPseudoRules(el: Element, pseudo: string): Record<string, string> {
  return collect(el, pseudo, undefined);
}

/**
 * The declarations the element's classes get INSIDE an `@media` block whose condition text
 * contains `condition` (e.g. `"max-width: 899px"`), top-level single-class selectors only.
 */
export function appliedMediaRules(el: Element, condition: string): Record<string, string> {
  return collect(el, "", condition);
}

function collect(el: Element, pseudo: string, media: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  const visit = (rules: CSSRule[]) => {
    for (const rule of rules) {
      if (rule instanceof CSSStyleRule) {
        const sel = rule.selectorText;
        if (!sel.startsWith(".") || !sel.endsWith(pseudo)) continue;
        const cls = sel.slice(1, sel.length - pseudo.length);
        if (!el.classList.contains(cls)) continue;
        for (const prop of Array.from(rule.style)) out[prop] = rule.style.getPropertyValue(prop);
      }
    }
  };
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRule[] = [];
    try { rules = Array.from(sheet.cssRules ?? []); } catch { continue; } // cross-origin sheet
    if (media === undefined) { visit(rules); continue; }
    for (const rule of rules) {
      if (rule instanceof CSSMediaRule && rule.conditionText.includes(media)) visit(Array.from(rule.cssRules));
    }
  }
  return out;
}
