/**
 * Text-based comparison of a screen in the two apps.
 *
 * Every visible piece of text in the content area (right of the left menu, below the header) is read with its box and style, in both apps,
 * and paired by its words. It does not depend on how either app names its controls, so it works where a by-name comparison has no match.
 */
import type { FrameLocator } from "@playwright/test";

export interface TextFact { text: string; x: number; y: number; w: number; h: number; fontSize: string; fontWeight: string; color: string }

export async function collectTexts(app: FrameLocator): Promise<TextFact[]> {
  return app.locator("body").evaluate((body) => {
    const out: { x: number; y: number }[] = [];
    const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
    const seen = new Set<Element>();
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const text = (n.textContent ?? "").replace(/\s+/g, " ").trim();
      const el = n.parentElement;
      if (!text || !el || seen.has(el) || ["SCRIPT", "STYLE", "NOSCRIPT"].includes(el.tagName)) continue;
      // The box of the text itself (not of its element), so the two apps are compared glyph to glyph.
      const range = document.createRange();
      range.selectNodeContents(n);
      const r = range.getBoundingClientRect();
      // Only what is inside the window: the canvas also lays out gallery content for other tabs far outside it.
      if (r.width <= 0 || r.height <= 0 || r.x < 210 || r.y < 128 || r.x > window.innerWidth - 4 || r.y > window.innerHeight - 4) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) === 0) continue;
      // The canvas stacks the content of folded sections inside each row and hides it by clipping: skip what a clipping ancestor cuts off.
      let clipped = false;
      const cx = r.x + r.width / 2;
      const cy = r.y + r.height / 2;
      for (let a = el.parentElement; a && a !== document.body && !clipped; a = a.parentElement) {
        const as = getComputedStyle(a);
        if (!/(hidden|clip|auto|scroll)/.test(as.overflowX + as.overflowY)) continue;
        const ar = a.getBoundingClientRect();
        if (cx < ar.left || cx > ar.right || cy < ar.top || cy > ar.bottom) clipped = true;
      }
      if (clipped) continue;
      seen.add(el);
      out.push({
        text, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
        fontSize: cs.fontSize,
        fontWeight: cs.fontWeight === "normal" ? "400" : cs.fontWeight === "bold" ? "700" : cs.fontWeight,
        color: cs.color,
      } as { x: number; y: number });
    }
    return out.sort((a, b) => a.y - b.y || a.x - b.x);
  }) as Promise<TextFact[]>;
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
