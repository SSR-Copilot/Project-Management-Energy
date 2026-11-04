/**
 * Text-based comparison of a screen in the two apps.
 *
 * Every visible piece of text in the content area (right of the left menu, below the header) is read with its box and style, in both apps,
 * and paired by its words. It does not depend on how either app names its controls, so it works where a by-name comparison has no match.
 */
import type { FrameLocator } from "@playwright/test";

export interface TextFact { text: string; x: number; y: number; w: number; h: number; fontSize: string; fontWeight: string; color: string }

/** The content area a text must start in: right of `minX` (the left menu) and below `minY` (the header), in frame pixels. */
export interface TextWindow { minX: number; minY: number }

/**
 * The one definition of the app shell's content window: x below 210 is the left menu, y below 128 the header (both apps lay
 * out the same shell). `collectTexts` and the harness's `readers.ts` use it; a manifest overrides it with `textWindow`.
 */
export const SHELL_TEXT_WINDOW: Readonly<TextWindow> = { minX: 210, minY: 128 };

/**
 * The in-page half of `collectTexts`: every visible text under `body` inside `win`, with its box and style. It runs INSIDE
 * the page (`evaluate`), so it is self-contained: no outer identifier, no import.
 *
 * Two kinds of text:
 *  - a text node, measured by its own range (not its element), so the two apps are compared glyph to glyph;
 *  - a CSS-drawn text, a `::before` / `::after` whose `content` is a quoted string (the code app's required-field `*`,
 *    `canvas.css` `.canvas-field > span[data-required]::before`). The Canvas never draws a text this way, and before
 *    these were read the n-th `*` of one app paired with a different `*` of the other (D80 live runs, 4 Nov 2026: the
 *    Description asterisk reported at weight 700 against the canvas 600, which was the weight of the NEXT asterisk).
 *    A pseudo-element has no range: its box is placed from its own computed style on the host's box. Absolutely
 *    positioned, it sits at the host's box plus `left` / `top` (or `right`, from the host's right edge): right for a host
 *    that is itself positioned, which is how the app draws them. In flow, a `::before` starts at the host's content box
 *    (`::after` ends at it), vertically centred when the host is a flex row that centres its items, else at its top.
 *    Its width is the text measured in its own font. Glyph-only content (icon fonts) and empty content are not texts.
 */
export function collectPageTexts(body: HTMLElement, win: { minX: number; minY: number }): TextFact[] {
  const out: TextFact[] = [];
  const weightOf = (w: string): string => (w === "normal" ? "400" : w === "bold" ? "700" : w);
  const inWindow = (r: { x: number; y: number; width: number; height: number }): boolean =>
    r.width > 0 && r.height > 0 && r.x >= win.minX && r.y >= win.minY && r.x <= window.innerWidth - 4 && r.y <= window.innerHeight - 4;
  const hidden = (cs: CSSStyleDeclaration): boolean => cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) === 0;
  // The canvas stacks the content of folded sections inside each row and hides it by clipping: skip what a clipping ancestor cuts off.
  const clippedBy = (from: Element | null, cx: number, cy: number): boolean => {
    for (let a = from; a && a !== document.body; a = a.parentElement) {
      const as = getComputedStyle(a);
      if (!/(hidden|clip|auto|scroll)/.test(as.overflowX + as.overflowY)) continue;
      const ar = a.getBoundingClientRect();
      if (cx < ar.left || cx > ar.right || cy < ar.top || cy > ar.bottom) return true;
    }
    return false;
  };
  const push = (text: string, r: { x: number; y: number; width: number; height: number }, cs: CSSStyleDeclaration): void => {
    out.push({
      text, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
      fontSize: cs.fontSize, fontWeight: weightOf(cs.fontWeight), color: cs.color,
    });
  };

  const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
  const seen = new Set<Element>();
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = (n.textContent ?? "").replace(/\s+/g, " ").trim();
    const el = n.parentElement;
    if (!text || !el || seen.has(el) || ["SCRIPT", "STYLE", "NOSCRIPT"].includes(el.tagName)) continue;
    const range = document.createRange();
    range.selectNodeContents(n);
    const r = range.getBoundingClientRect();
    // Only what is inside the window: the canvas also lays out gallery content for other tabs far outside it.
    if (!inWindow(r)) continue;
    const cs = getComputedStyle(el);
    if (hidden(cs) || clippedBy(el.parentElement, r.x + r.width / 2, r.y + r.height / 2)) continue;
    seen.add(el);
    push(text, r, cs);
  }

  // CSS-drawn texts. The text's width in its own font (a canvas; without one, 0.6 em per character).
  const measure = (text: string, ps: CSSStyleDeclaration): number => {
    const c = document.createElement("canvas").getContext("2d");
    if (!c) return Math.round(text.length * (parseFloat(ps.fontSize) || 14) * 0.6);
    c.font = ps.font || `${ps.fontWeight} ${ps.fontSize} ${ps.fontFamily}`;
    return Math.round(c.measureText(text).width);
  };
  const px = (v: string): number | null => (/^-?\d/.test(v) ? parseFloat(v) : null);
  for (const el of Array.from(body.querySelectorAll<HTMLElement>("*"))) {
    if (["SCRIPT", "STYLE", "NOSCRIPT"].includes(el.tagName)) continue;
    for (const pseudo of ["::before", "::after"] as const) {
      const ps = getComputedStyle(el, pseudo);
      const content = ps.content;
      if (!content || content === "none" || content === "normal") continue;
      // Only quoted strings are texts (`"* "`, `'*'`, `"a" "b"`); counters, `attr()` and `url()` are not.
      const parts = content.match(/"[^"]*"|'[^']*'/g);
      if (!parts) continue;
      const text = parts.map((p) => p.slice(1, -1)).join("").replace(/\s+/g, " ").trim();
      // Nothing left once icon-font glyphs (private use) and zero-width characters are removed: an icon, not a text.
      if (!text || !text.replace(/[-​-‍﻿]/g, "").trim()) continue;
      if (hidden(ps)) continue;
      const hs = getComputedStyle(el);
      if (hidden(hs)) continue;
      const host = el.getBoundingClientRect();
      if (host.width <= 0 && host.height <= 0) continue;
      const fontSize = parseFloat(ps.fontSize) || 14;
      const height = px(ps.lineHeight) ?? Math.round(fontSize * 4 / 3);
      const width = measure(text, ps);
      let x: number;
      let y: number;
      if (ps.position === "absolute" || ps.position === "fixed") {
        const left = px(ps.left);
        const right = px(ps.right);
        x = left !== null ? host.x + left : right !== null ? host.right - right - width : host.x;
        const top = px(ps.top);
        const bottom = px(ps.bottom);
        y = top !== null ? host.y + top : bottom !== null ? host.bottom - bottom - height : host.y;
      } else {
        const padLeft = (px(hs.paddingLeft) ?? 0) + (px(hs.borderLeftWidth) ?? 0);
        const padRight = (px(hs.paddingRight) ?? 0) + (px(hs.borderRightWidth) ?? 0);
        x = pseudo === "::before" ? host.x + padLeft : host.right - padRight - width;
        const centred = /flex/.test(hs.display) && hs.alignItems === "center";
        y = centred ? host.y + (host.height - height) / 2 : host.y + (px(hs.paddingTop) ?? 0) + (px(hs.borderTopWidth) ?? 0);
      }
      const r = { x, y, width, height };
      if (!inWindow(r) || clippedBy(el.parentElement, x + width / 2, y + height / 2)) continue;
      push(text, r, ps);
    }
  }
  return out.sort((a, b) => a.y - b.y || a.x - b.x);
}

export async function collectTexts(app: FrameLocator, textWindow: TextWindow = SHELL_TEXT_WINDOW): Promise<TextFact[]> {
  return app.locator("body").evaluate(collectPageTexts, { minX: textWindow.minX, minY: textWindow.minY });
}

export interface TextDiff { text: string; property: string; canvas: unknown; code: unknown }
export interface TextCompare { matched: number; diffs: TextDiff[]; missingInCode: string[]; extraInCode: string[] }

/** The nth Canvas text is paired with the nth code app text of the same words; size, weight, colour and position are compared. */
export function compareTexts(canvas: TextFact[], code: TextFact[], move = 6): TextCompare {
  // The two frames sit at different heights, so a vertical difference is how far a text is from the typical shift (the median), not from zero.
  const shifts: number[] = [];
  {
    const probe = new Map<string, TextFact[]>();
    for (const c of code) probe.set(c.text, [...(probe.get(c.text) ?? []), c]);
    for (const a of canvas) { const b = probe.get(a.text)?.shift(); if (b) shifts.push(b.y - a.y); }
  }
  shifts.sort((p, q) => p - q);
  const median = shifts.length ? shifts[Math.floor(shifts.length / 2)]! : 0;
  const pool = new Map<string, TextFact[]>();
  for (const c of code) pool.set(c.text, [...(pool.get(c.text) ?? []), c]);
  const diffs: TextDiff[] = [];
  const missingInCode: string[] = [];
  let matched = 0;
  for (const a of canvas) {
    const b = pool.get(a.text)?.shift();
    if (!b) { missingInCode.push(a.text); continue; }
    matched++;
    if (a.fontSize !== b.fontSize) diffs.push({ text: a.text, property: "fontSize", canvas: a.fontSize, code: b.fontSize });
    if (a.fontWeight !== b.fontWeight) diffs.push({ text: a.text, property: "fontWeight", canvas: a.fontWeight, code: b.fontWeight });
    if (a.color !== b.color) diffs.push({ text: a.text, property: "color", canvas: a.color, code: b.color });
    if (Math.abs(a.x - b.x) > move) diffs.push({ text: a.text, property: "x", canvas: a.x, code: b.x });
    if (Math.abs(b.y - a.y - median) > move) diffs.push({ text: a.text, property: "y", canvas: a.y, code: `${b.y} (shift ${b.y - a.y - median} from the typical ${median})` });
  }
  const extraInCode = [...pool.values()].flat().map((f) => f.text);
  return { matched, diffs, missingInCode, extraInCode };
}
