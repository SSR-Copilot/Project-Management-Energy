/**
 * The parity harness: generic readers, the defaults a manifest gets without writing its own (D80, plan section 5a).
 *
 *   locate / fieldInput      a manifest `ControlRef` in either app (canvas `data-control-name` or caption; code `data-testid`,
 *                            whole or, with `codeMatch: "prefix"`, its start)
 *   shown                    the first match a user can SEE (not clipped), for the gates reader
 *   isEnabled                enabled state of a control, the rule both old suites used
 *   defaultReadValidation    the visible `manifest.messages` (verbatim, sorted) and whether `controls.save` is enabled (read
 *                            through `locate`, clipped or not, as the old validation spec read it)
 *   defaultReadGates         the enabled state of every visible `controls.commands` entry
 *   resetToRest              Escape, then `controls.cancel` if it shows, then a reload if `controls.restMarker` does not show
 *   readVisual               `lib/texts.ts` collectTexts, plus the Canvas's native `<select>` values (see `COMMON_ARTEFACTS`)
 *   unlabelledControls / displayValueTestIds / codeRoute   the platform layer's in-page reads (CONVENTIONS rule 16)
 *
 * The decisions are pure functions (`enabledFrom`, `pickVisibleMessages`, `isDisplayValueTestId`, `fromNames`) so
 * `readers.test.ts` (UT-PHREAD-*) pins them without a browser. Nothing here knows a screen.
 */
import type { FrameLocator, Locator, Page } from "@playwright/test";
import type { AppHandle, ControlRef, Kind, ScreenManifest, ValidationOutcome } from "./contract";
import { unclippedIndexesOf } from "../lib/appFrame";
import { codeFrame } from "./data";
import { collectTexts, SHELL_TEXT_WINDOW, type TextFact, type TextWindow } from "../lib/texts";

type AppView = Pick<AppHandle, "kind" | "frame">;

/* ──────────────────────────────────────────────────────────── locating ── */

/**
 * A control in one app, the first VISIBLE match (a gallery repeats a control; folded cards keep theirs laid out):
 *   canvas, by "name" (default)  `[data-control-name='<canvas>']`
 *   canvas, by "caption"         the exact visible text `<canvas>`
 *   code, codeMatch "exact"      `getByTestId(<code>)` (the default)
 *   code, codeMatch "prefix"     `[data-testid^='<code>']` (a repeated control whose id ends in its row id)
 */
export function locate(app: AppView, ref: ControlRef): Locator {
  return candidates(app, ref).filter({ visible: true }).first();
}

/** A CSS attribute value in single quotes. */
const cssValue = (s: string): string => `'${s.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;

/** The selector a `ControlRef` uses in the code app: `codeMatch` "prefix" -> `[data-testid^='…']`, else null (`getByTestId`). */
export function codeSelector(ref: Pick<ControlRef, "code" | "codeMatch">): string | null {
  return ref.codeMatch === "prefix" ? `[data-testid^=${cssValue(ref.code)}]` : null;
}

/** Every match of a `ControlRef`, shown or not. */
function candidates(app: AppView, ref: ControlRef): Locator {
  if (app.kind === "code") {
    const prefix = codeSelector(ref);
    return prefix ? app.frame.locator(prefix) : app.frame.getByTestId(ref.code);
  }
  if (ref.by === "caption") return app.frame.getByText(ref.canvas, { exact: true });
  return app.frame.locator(`[data-control-name=${cssValue(ref.canvas)}]`);
}

/**
 * The first match a user can actually SEE, or null. Stricter than `locate`: Playwright's "visible" ignores overflow
 * clipping, and the Canvas keeps the commands of a folded card laid out but clipped (`lib/cost.ts` unclippedIndexes), so a
 * reader of enabled states uses this.
 */
export async function shown(app: AppView, ref: ControlRef): Promise<Locator | null> {
  const all = candidates(app, ref);
  const [first] = await unclippedIndexesOf(all);
  return first === undefined ? null : all.nth(first);
}

/** The text box of a field: the control itself when it is an input / textarea, else the first one inside it. */
export function fieldInput(app: AppView, ref: ControlRef): Locator {
  return locate(app, ref).locator("xpath=descendant-or-self::input | descendant-or-self::textarea").first();
}

/** Interactive elements: a named canvas control or a caption wraps one of these, or sits inside one. */
const INTERACTIVE = "button, [role='button'], [role='menuitem'], [role='switch'], [role='checkbox'], [role='radio'], [role='tab'], [role='combobox'], input, select, textarea";

export interface EnabledAttrs { disabled: boolean; ariaDisabled: string | null; selfAriaDisabled: string | null }

/**
 * Enabled unless the interactive element is `disabled` or `aria-disabled="true"`, or the located element itself is
 * `aria-disabled="true"`. The Canvas's PCF CommandBar marks a disabled item ONLY with `aria-disabled` (`lib/cost.ts`
 * cardCommandEnabled); its classic buttons and the code app's Fluent buttons set `disabled` (`landlease.validation`'s
 * saveEnabled). Both rules hold in both apps, so one rule serves both.
 */
export function enabledFrom(a: EnabledAttrs): boolean {
  return !a.disabled && a.ariaDisabled !== "true" && a.selfAriaDisabled !== "true";
}

/** Enabled state of a located control: the element itself if interactive, else the one inside it, else the one around it. */
export async function isEnabled(locator: Locator): Promise<boolean> {
  const attrs = await locator.evaluate((e, sel) => {
    const host = (e.matches(sel) ? e : e.querySelector(sel) ?? e.closest(sel) ?? e) as HTMLButtonElement;
    return { disabled: host.disabled === true, ariaDisabled: host.getAttribute("aria-disabled"), selfAriaDisabled: e.getAttribute("aria-disabled") };
  }, INTERACTIVE);
  return enabledFrom(attrs);
}

/* ────────────────────────────────────────────────────── default readers ── */

/** Whitespace collapsed and trimmed (non-breaking spaces included): how a message is compared. */
export const normaliseText = (s: string): string => s.replace(/\s+/g, " ").trim();

/** The messages of `messages` found among the visible texts `shown` (each compared normalised), verbatim as listed, sorted, once each. */
export function pickVisibleMessages(shown: Iterable<string>, messages: readonly string[]): string[] {
  const seen = new Set([...shown].map(normaliseText));
  return [...new Set(messages.filter((m) => seen.has(normaliseText(m))))].sort();
}

/**
 * In the page: the `wanted` texts that some element shows as its whole text (whitespace collapsed, as
 * `getByText(text, { exact: true })` compares), with `requireBox` only an element that has a box and is not
 * `visibility: hidden` (Playwright's "visible"). Self-contained, because Playwright sends it to the page as source text.
 * Every text node's element and its ancestors are tried, up to the longest wanted text, so a message split over spans counts.
 */
export function findShownTexts(at: Element, arg: { wanted: readonly string[]; requireBox: boolean }): string[] {
  const { wanted, requireBox } = arg;
  const root = at.ownerDocument;
  const norm = (s: string): string => s.replace(/\s+/g, " ").trim();
  const want = new Set(wanted.map(norm));
  const longest = Math.max(0, ...[...want].map((w) => w.length));
  const found = new Set<string>();
  const tried = new Set<Element>();
  const view = root.defaultView;
  const visible = (el: Element): boolean => {
    if (!requireBox) return true;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 && r.height <= 0) return false;
    return view?.getComputedStyle(el).visibility !== "hidden";
  };
  const walker = root.createTreeWalker(root.body ?? root.documentElement, 4 /* NodeFilter.SHOW_TEXT */);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.nodeValue?.trim()) continue;
    for (let el = n.parentElement; el && !tried.has(el); el = el.parentElement) {
      tried.add(el);
      const text = norm(el.textContent ?? "");
      if (text.length > longest) break;
      if (want.has(text) && visible(el)) found.add(text);
    }
  }
  return [...found];
}

/**
 * The listed messages that show now. The same match as the old validation spec's lookup per message
 * (`getByText(text, { exact: true })`, visible only), made in ONE call in the page: one lookup per message cost 5-8 s per
 * read on the Canvas (about 30 messages; live run 2, 3 Nov 2026) and the "outcome" wait reads at least three times.
 */
export async function visibleMessages(app: AppView, messages: readonly string[]): Promise<string[]> {
  const shown = await app.frame.locator(":root").evaluate(findShownTexts, { wanted: [...new Set(messages)], requireBox: true });
  return pickVisibleMessages(shown, messages);
}

/** A button enabled: neither `disabled` nor `aria-disabled="true"` (the old validation spec's saveEnabled rule). */
export function buttonEnabledFrom(a: Pick<EnabledAttrs, "disabled" | "ariaDisabled">): boolean {
  return !a.disabled && a.ariaDisabled !== "true";
}

/**
 * `controls.save` enabled, read exactly as the old validation spec read it: the control through `locate()` (the first VISIBLE
 * match, whether or not an overflow ancestor clips it: a long panel scrolls its Save out of view), then its own button
 * (descendant-or-self), enabled unless `disabled` or `aria-disabled="true"`. False when the screen has no Save, or no button
 * is found within 5 s (the old `catch(() => true)`: disabled).
 */
async function saveEnabled(app: AppView, manifest: Pick<ScreenManifest, "controls">): Promise<boolean> {
  const save = manifest.controls.save;
  if (!save) return false;
  const button = locate(app, save).locator("xpath=descendant-or-self::button").first();
  return button.evaluate((b) => ({ disabled: (b as HTMLButtonElement).disabled === true, ariaDisabled: b.getAttribute("aria-disabled") }), undefined, { timeout: 5_000 })
    .then(buttonEnabledFrom, () => false);
}

/** Default validation reader (contract `readValidation`): the visible `messages`, verbatim and sorted, and Save enabled. */
export async function defaultReadValidation(app: AppView, manifest: Pick<ScreenManifest, "messages" | "controls">): Promise<ValidationOutcome> {
  return { messages: await visibleMessages(app, manifest.messages), save: await saveEnabled(app, manifest) };
}

/**
 * Default gates reader (contract `readGates`): caption -> enabled for every `controls.commands` entry that shows. A command
 * that does not show is left out, so the comparison reports it as missing in that app (null), not as disabled.
 */
export async function defaultReadGates(app: AppView, manifest: Pick<ScreenManifest, "controls">): Promise<Record<string, boolean>> {
  const out: Record<string, boolean> = {};
  for (const [caption, ref] of Object.entries(manifest.controls.commands ?? {})) {
    const l = await shown(app, ref);
    if (!l) continue;
    const enabled = await isEnabled(l).catch(() => null);
    if (enabled !== null) out[caption] = enabled;
  }
  return out;
}

/**
 * Back to the resting state without a reload where possible (contract `ScreenManifest.reset` default): Escape (closes a
 * pop-up or menu), then `controls.cancel` if it shows (closes a panel; the Canvas click is forced, its controls sit under
 * an invisible button), then a reload if `controls.restMarker` is set and still not showing. The caller settles.
 */
export async function resetToRest(app: Pick<AppHandle, "kind" | "page" | "frame" | "reload">, manifest: Pick<ScreenManifest, "controls">): Promise<void> {
  await app.page.keyboard.press("Escape").catch(() => {});
  const { cancel, restMarker } = manifest.controls;
  if (cancel) {
    const c = locate(app, cancel);
    if (await c.isVisible().catch(() => false)) await c.click({ force: app.kind === "canvas", timeout: 10_000 }).catch(() => {});
  }
  if (restMarker) {
    const marker = locate(app, restMarker);
    const atRest = await marker.waitFor({ state: "visible", timeout: 5_000 }).then(() => true, () => false);
    if (!atRest) await app.reload();
  }
}

/* ─────────────────────────────────────────────────────────────── visual ── */

/**
 * The in-page half of `selectValueTexts` (self-contained: it runs inside the page). The selected option of every visible
 * native `<select>` under `body`, as a text fact placed where its TEXT is drawn, not where the box is: x after the box's
 * left border and padding, the text's width in the select's font, the line height, vertically centred in the box. The
 * code app's Fluent dropdown value is read by its text range, so the box itself would put the Canvas value about
 * 13 px left of it (D80 live runs, 4 Nov 2026: every panel dropdown value reported as an x difference). Same window and
 * clipping rules as `collectPageTexts`.
 */
export function selectValuePageTexts(body: HTMLElement, win: { minX: number; minY: number }): TextFact[] {
  const out: TextFact[] = [];
  const px = (v: string): number => (/^-?\d/.test(v) ? parseFloat(v) : 0);
  const measure = (text: string, cs: CSSStyleDeclaration): number => {
    const c = document.createElement("canvas").getContext("2d");
    if (!c) return Math.round(text.length * (parseFloat(cs.fontSize) || 14) * 0.6);
    c.font = cs.font || `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    return Math.round(c.measureText(text).width);
  };
  for (const s of Array.from(body.querySelectorAll("select"))) {
    const text = (s.selectedOptions[0]?.textContent ?? "").replace(/\s+/g, " ").trim();
    if (!text) continue;
    const box = s.getBoundingClientRect();
    if (box.width <= 0 || box.height <= 0) continue;
    const cs = getComputedStyle(s);
    if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) === 0) continue;
    const fontSize = parseFloat(cs.fontSize) || 14;
    const height = /^\d/.test(cs.lineHeight) ? parseFloat(cs.lineHeight) : Math.round(fontSize * 4 / 3);
    const width = measure(text, cs);
    const x = box.x + px(cs.borderLeftWidth) + px(cs.paddingLeft);
    const y = box.y + (box.height - height) / 2;
    if (x < win.minX || y < win.minY || x > window.innerWidth - 4 || y > window.innerHeight - 4) continue;
    const cx = x + width / 2;
    const cy = y + height / 2;
    let clipped = false;
    for (let a = s.parentElement; a && a !== document.body && !clipped; a = a.parentElement) {
      const as = getComputedStyle(a);
      if (!/(hidden|clip|auto|scroll)/.test(as.overflowX + as.overflowY)) continue;
      const ar = a.getBoundingClientRect();
      if (cx < ar.left || cx > ar.right || cy < ar.top || cy > ar.bottom) clipped = true;
    }
    if (clipped) continue;
    out.push({
      text, x: Math.round(x), y: Math.round(y), w: width, h: Math.round(height), fontSize: cs.fontSize,
      fontWeight: cs.fontWeight === "normal" ? "400" : cs.fontWeight === "bold" ? "700" : cs.fontWeight, color: cs.color,
    });
  }
  return out;
}

/**
 * The selected option of every visible native `<select>` as a text fact (`selectValuePageTexts`). The Canvas's modern
 * dropdown is a native `<select>`: its option text has no box, so `collectTexts` never sees the value a user sees, while
 * the code app's Fluent dropdown shows it as button text.
 */
export async function selectValueTexts(frame: FrameLocator, textWindow: TextWindow = SHELL_TEXT_WINDOW): Promise<TextFact[]> {
  return frame.locator("body").evaluate(selectValuePageTexts, { minX: textWindow.minX, minY: textWindow.minY });
}

/**
 * The visual facts of one state: every visible text (`collectTexts`), plus, on the Canvas, its dropdown values; sorted as
 * `collectTexts` sorts. `textWindow`: the manifest's, else `lib/texts.ts` SHELL_TEXT_WINDOW (the one definition).
 */
export async function readVisual(app: AppView, textWindow: TextWindow = SHELL_TEXT_WINDOW): Promise<TextFact[]> {
  const texts = await collectTexts(app.frame, textWindow);
  if (app.kind !== "canvas") return texts;
  return [...texts, ...(await selectValueTexts(app.frame, textWindow))].sort((a, b) => a.y - b.y || a.x - b.x);
}

/* ───────────────────────────────────────────────────────────── platform ── */

/**
 * Every visible interactive control without an explicit `aria-label` (or `aria-labelledby`) or without a `data-testid`
 * (CONVENTIONS rule 16). A Fluent control puts the test id on its wrapper or its input; either counts. From
 * `landlease.codeapp.spec.ts` E2E-LANDLEASE-003.
 */
export async function unlabelledControls(frame: FrameLocator): Promise<string[]> {
  return frame.locator("body").evaluate((body) => {
    const sel = "button, input, select, textarea, a[href], [role='button'], [role='switch'], [role='checkbox'], [role='radio'], [role='combobox'], [role='tab'], [role='menuitem']";
    const out: string[] = [];
    for (const e of Array.from(body.querySelectorAll<HTMLElement>(sel))) {
      const r = e.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0 || getComputedStyle(e).visibility === "hidden") continue;
      const testId = e.getAttribute("data-testid") ?? e.closest("[data-testid]")?.getAttribute("data-testid");
      const label = e.getAttribute("aria-label") ?? e.getAttribute("aria-labelledby");
      if (!testId || !label) out.push(`${e.tagName.toLowerCase()}${e.id ? `#${e.id}` : ""} testid=${testId ?? "-"} label=${label ?? "-"} text="${(e.innerText || "").trim().slice(0, 30)}"`);
    }
    return out;
  });
}

/**
 * Whether a test id carries a display value instead of a row id (CONVENTIONS rule 16: `<base>-<row id>`, never a name).
 * Generalised from E2E-LANDLEASE-004 (which looked at `...card-` / `...row-` ids only): the part after the LAST "-" of a
 * canvas-named id (`btn_…-<suffix>`), or after the first "-" of a kebab id ending in `card` / `row`, is a display value
 * when it has a space, or is not a GUID / hex / number. A test id that is all kebab-case words (`lease-otp`) is a
 * configured id, not a row suffix, and is never flagged.
 */
export function isDisplayValueTestId(id: string): boolean {
  const rowSuffix = (s: string) => /^[0-9a-f-]+$/i.test(s) || /^\d+$/.test(s);
  const canvasNamed = /^[a-z]{2,4}_[A-Za-z0-9_]+-(.+)$/.exec(id);
  if (canvasNamed) return /\s/.test(canvasNamed[1]!) || !rowSuffix(canvasNamed[1]!);
  const kebab = /^[a-z]+(?:card|row)-(.+)$/i.exec(id);
  if (kebab) return /\s/.test(kebab[1]!) || !rowSuffix(kebab[1]!);
  return /\s/.test(id);
}

/** The distinct test ids of `ids` that carry a display value, sorted. */
export function fromNames(ids: readonly string[]): string[] {
  return [...new Set(ids.filter(isDisplayValueTestId))].sort();
}

/** Every `data-testid` in the frame. */
export async function displayValueTestIds(frame: FrameLocator): Promise<string[]> {
  return fromNames(await frame.locator("[data-testid]").evaluateAll((els) => els.map((e) => e.getAttribute("data-testid") ?? "")));
}

/** The code app's own route: the hash of its frame (the play page's URL never changes; the app routes by hash). */
export function codeRoute(page: Page): string {
  // `data.ts` codeFrame matches the frame by origin: the play page's own URL also contains "localhost:3000" (`_localAppUrl`).
  let frame;
  try { frame = codeFrame(page); } catch { return ""; }
  return new URL(frame.url()).hash.replace(/^#/, "");
}

/** The route without its query: `/costs/land-lease?projectId=…` -> `/costs/land-lease`. */
export const routePath = (route: string): string => route.split("?")[0] ?? "";

/** The kind's word in a message ("the Canvas" / "the code app"). */
export const appName = (kind: Kind): string => (kind === "canvas" ? "the Canvas" : "the code app");
