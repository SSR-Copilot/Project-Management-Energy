// @vitest-environment jsdom
/**
 * Bug 15333 — an Excel row pasted into the Add Costs grid showed as two rows. Excel ends a copied range with one
 * line break, which react-spreadsheet 0.9.5 read as a second, empty row (a two-row selection, the cell under the
 * paste blanked, an extra row when pasted into the last one). Verified against the real library in Chrome; here
 * jsdom has no `ClipboardEvent` / `DataTransfer`, so minimal stand-ins carry the text, and a `document` bubble
 * listener plays the library's part.
 */
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { trimTrailingLineBreak, useTrimmedGridPaste } from "./pasteTrim";

class StubDataTransfer {
  private readonly items = new Map<string, string>();
  setData(type: string, value: string) { this.items.set(type, value); }
  getData(type: string) { return this.items.get(type) ?? ""; }
}
class StubClipboardEvent extends Event {
  readonly clipboardData: StubDataTransfer | null;
  constructor(type: string, init?: EventInit & { clipboardData?: StubDataTransfer }) {
    super(type, init);
    this.clipboardData = init?.clipboardData ?? null;
  }
}

const pasteOn = (target: Element, text: string) => {
  const data = new StubDataTransfer();
  data.setData("text/plain", text);
  target.dispatchEvent(new StubClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
};

function Grid() {
  const ref = React.useRef<HTMLDivElement>(null);
  useTrimmedGridPaste(ref);
  return (
    <div>
      <div ref={ref}>
        <div tabIndex={0} data-testid="cell">cell</div>
        <input data-testid="editor" />
      </div>
      <div tabIndex={0} data-testid="outside">outside</div>
    </div>
  );
}

describe("Bug 15333: a pasted Excel row is one row", () => {
  it("UT-ADDCOST-PASTE-001 drops the ONE line break Excel puts after the last row", () => {
    expect(trimTrailingLineBreak("72000\t72000\t72000\r\n")).toBe("72000\t72000\t72000");
    expect(trimTrailingLineBreak("1\t2\n")).toBe("1\t2");
    expect(trimTrailingLineBreak("1\t2\r")).toBe("1\t2");
    // Several rows: only the terminator goes, the breaks between rows stay.
    expect(trimTrailingLineBreak("1\t2\r\n3\t4\r\n")).toBe("1\t2\r\n3\t4");
    // A range that really ends in an empty row keeps it; text without a final break is untouched.
    expect(trimTrailingLineBreak("1\r\n\r\n")).toBe("1\r\n");
    expect(trimTrailingLineBreak("1\t2")).toBe("1\t2");
    // Trailing EMPTY CELLS are cells, not a break.
    expect(trimTrailingLineBreak("1\t\t\r\n")).toBe("1\t\t");
  });

  describe("the paste the grid's library receives", () => {
    let received: string[];
    const library = (e: Event) => { received.push((e as StubClipboardEvent).clipboardData?.getData("text/plain") ?? ""); };

    beforeEach(() => {
      vi.stubGlobal("ClipboardEvent", StubClipboardEvent);
      vi.stubGlobal("DataTransfer", StubDataTransfer);
      received = [];
      // react-spreadsheet listens on `document` in the bubble phase.
      document.addEventListener("paste", library);
      render(<Grid />);
    });
    afterEach(() => {
      document.removeEventListener("paste", library);
      cleanup();
      vi.unstubAllGlobals();
    });

    it("UT-ADDCOST-PASTE-002 a paste into the grid reaches the library once, without the final break", () => {
      pasteOn(screen.getByTestId("cell"), "72000\t72000\t72000\r\n");
      expect(received).toEqual(["72000\t72000\t72000"]);
    });

    it("UT-ADDCOST-PASTE-003 text with no final break, a cell editor's paste, and a paste outside the grid are left alone", () => {
      pasteOn(screen.getByTestId("cell"), "1\t2");
      pasteOn(screen.getByTestId("editor"), "typed\r\n");
      pasteOn(screen.getByTestId("outside"), "elsewhere\r\n");
      expect(received).toEqual(["1\t2", "typed\r\n", "elsewhere\r\n"]);
    });
  });
});
