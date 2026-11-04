// @vitest-environment jsdom
/**
 * UT-PHREAD-DOM: `readers.ts` findShownTexts, the in-page half of `visibleMessages`, on a real DOM. It must find what the old
 * lookup per message found (`getByText(text, { exact: true })`): an element whose WHOLE text, whitespace collapsed, is the
 * message, also when the text is split over child elements; not a longer text that only contains it. jsdom has no layout,
 * so the box check (`requireBox`) is covered by its `false` branch here and by the live runs.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { collectPageTexts } from "../lib/texts";
import { findShownTexts, selectValuePageTexts } from "./readers";

function page(html: string): Element {
  document.body.innerHTML = html;
  return document.documentElement;
}

/* ── a laid-out page, by hand: jsdom has no layout, so boxes and computed styles are given per element ── */

type Style = Record<string, string>;
const BASE: Style = {
  display: "block", visibility: "visible", opacity: "1", overflowX: "visible", overflowY: "visible", alignItems: "normal",
  paddingLeft: "0px", paddingRight: "0px", paddingTop: "0px", borderLeftWidth: "0px", borderRightWidth: "0px", borderTopWidth: "0px",
  fontSize: "14px", fontWeight: "400", color: "rgb(0, 0, 0)", lineHeight: "normal", font: "",
  content: "none", position: "static", left: "auto", right: "auto", top: "auto", bottom: "auto",
};
const rect = (x: number, y: number, width: number, height: number): DOMRect =>
  ({ x, y, width, height, left: x, top: y, right: x + width, bottom: y + height, toJSON: () => ({}) }) as DOMRect;
const box = (el: Element, r: DOMRect): void => { (el as HTMLElement).getBoundingClientRect = () => r; };
const WIN = { minX: 210, minY: 50 };

/** Computed styles by element id and pseudo (`"#desc::before"`), on top of `BASE`; a text range box for text nodes. */
function layOut(styles: Record<string, Style>, textRange: DOMRect = rect(0, 0, 0, 0)): void {
  vi.stubGlobal("getComputedStyle", (el: Element, pseudo?: string | null) =>
    ({ ...BASE, ...(styles[`#${el.id}${pseudo ?? ""}`] ?? {}) }) as unknown as CSSStyleDeclaration);
  Object.defineProperty(Range.prototype, "getBoundingClientRect", { value: () => textRange, configurable: true, writable: true });
  // No 2D canvas in jsdom: the readers then size a text at 0.6 em per character.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation((() => null) as never);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

const find = (html: string, wanted: string[]) => findShownTexts(page(html), { wanted, requireBox: false }).sort();

describe("findShownTexts", () => {
  it("UT-PHREAD-DOM-001 a whole text matches, whitespace collapsed; a text that only contains it does not", () => {
    expect(find("<div><span>Value must be a number</span></div><p>Note: Year value must be in format YYYY.</p>",
      ["Value must be a number", "Year value must be in format YYYY."])).toEqual(["Value must be a number"]);
    expect(find("<div>  Value   must\n be a number </div>", ["Value must be a number"])).toEqual(["Value must be a number"]);
  });

  it("UT-PHREAD-DOM-002 a message split over spans counts once; a message absent from the page is not returned", () => {
    expect(find('<label><span>Due Date must be in </span><b>format MM/YYYY.</b></label><div>other</div>',
      ["Due Date must be in format MM/YYYY.", "Value must be a number"])).toEqual(["Due Date must be in format MM/YYYY."]);
    expect(find("<div>x</div>", [])).toEqual([]);
  });

  it("UT-PHREAD-DOM-003 the same message twice on the page is returned once", () => {
    expect(find("<div>Value must be a number</div><div>Value must be a number</div>", ["Value must be a number"])).toEqual(["Value must be a number"]);
  });
});

describe("collectPageTexts", () => {
  it("UT-PHREAD-DOM-004 a CSS-drawn '*' (absolute ::before) is a text at the host's box plus left/top, in its own style", () => {
    page('<span id="desc" data-required="true">Description</span><span id="glyph">x</span><span id="empty">y</span>');
    const desc = document.getElementById("desc")!;
    box(desc, rect(300, 56, 80, 32));
    box(document.getElementById("glyph")!, rect(300, 200, 20, 20));
    box(document.getElementById("empty")!, rect(300, 240, 20, 20));
    layOut({
      "#desc": { display: "flex", alignItems: "center" },
      // `LandLeaseScreen.tsx`: `.canvas-field > span[data-required]::before`, absolute at left -10 px, top 2 px, Semibold.
      "#desc::before": { content: '"*"', position: "absolute", left: "-10px", top: "2px", lineHeight: "20px", fontSize: "14.6667px", fontWeight: "600", color: "rgb(178, 39, 39)" },
      // An icon-font glyph and Fluent's empty `::after` are not texts.
      "#glyph::before": { content: '""' },
      "#empty::after": { content: '""' },
    }, rect(300, 62, 74, 20));

    const facts = collectPageTexts(document.body, WIN);
    expect(facts.map((f) => f.text)).toEqual(["*", "Description", "x", "y"]);
    expect(facts[0]).toEqual({ text: "*", x: 290, y: 58, w: 9, h: 20, fontSize: "14.6667px", fontWeight: "600", color: "rgb(178, 39, 39)" });
    // The text node keeps its own range box and style.
    expect(facts[1]).toMatchObject({ text: "Description", x: 300, y: 62, w: 74, h: 20, fontWeight: "400" });
  });

  it("UT-PHREAD-DOM-005 an in-flow ::before starts at the host's content box; an ::after ends at it; right/bottom place an absolute one", () => {
    page('<span id="flow">Name</span><span id="tail">Tail</span><span id="corner">C</span><div id="hidden">h</div>');
    box(document.getElementById("flow")!, rect(400, 100, 60, 20));
    box(document.getElementById("tail")!, rect(500, 150, 100, 20));
    box(document.getElementById("corner")!, rect(600, 300, 100, 40));
    box(document.getElementById("hidden")!, rect(600, 400, 100, 40));
    layOut({
      "#flow": { paddingLeft: "4px", borderLeftWidth: "1px" },
      "#flow::before": { content: "'* '" }, // canvas.css: `content: '* '`, trimmed to "*"
      "#tail": { paddingRight: "2px" },
      "#tail::after": { content: '"!"' },
      "#corner::after": { content: '"a" "b"', position: "absolute", right: "10px", bottom: "4px", lineHeight: "16px" },
      "#hidden::before": { content: '"no"', display: "none" },
    });

    const facts = collectPageTexts(document.body, WIN).filter((f) => f.text !== "Name" && f.text !== "Tail" && f.text !== "C" && f.text !== "h");
    // "*": 1 character at 0.6 em of 14 px = 8 px wide, 19 px high (4/3 of the font size).
    expect(facts.find((f) => f.text === "*")).toMatchObject({ x: 405, y: 100, w: 8, h: 19 });
    expect(facts.find((f) => f.text === "!")).toMatchObject({ x: 590, y: 150, w: 8 });
    // "ab" is 17 px wide: 700 - 10 - 17 = 673; 340 - 4 - 16 = 320.
    expect(facts.find((f) => f.text === "ab")).toMatchObject({ x: 673, y: 320, w: 17, h: 16 });
    expect(facts.find((f) => f.text === "no")).toBeUndefined();
  });
});

describe("selectValuePageTexts", () => {
  it("UT-PHREAD-DOM-006 a native select's value is placed where its text starts: after the border and padding, centred in the box", () => {
    page('<select id="years"><option>1 year</option><option selected>5 years</option></select><select id="blank"><option value=""></option></select>');
    box(document.getElementById("years")!, rect(289, 240, 100, 32));
    box(document.getElementById("blank")!, rect(289, 300, 100, 32));
    layOut({ "#years": { paddingLeft: "10px", borderLeftWidth: "1px", lineHeight: "20px", color: "rgb(36, 36, 36)" } });

    const facts = selectValuePageTexts(document.body, WIN);
    // 7 characters at 0.6 em of 14 px = 59 px; y = 240 + (32 - 20) / 2.
    expect(facts).toEqual([{ text: "5 years", x: 300, y: 246, w: 59, h: 20, fontSize: "14px", fontWeight: "400", color: "rgb(36, 36, 36)" }]);
  });
});
