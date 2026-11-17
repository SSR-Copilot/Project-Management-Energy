/**
 * Bug 15333 — an Excel row pasted into the Add Costs grid showed as two rows. Kept out of `SpreadSheet.tsx` so
 * that file exports components only (fast refresh).
 */
import * as React from "react";

/**
 * Excel ends a copied range with ONE line break after its last row ("72000\t…\t72000\r\n"). react-spreadsheet
 * 0.9.5 splits a paste on every break (`split`, `/\r\n|\n|\r/`), so that break became a second, empty row: a
 * one-row paste selected two rows, wrote an empty value into the cell under the first pasted cell, and grew the
 * grid when pasted into the last row. The final break is a terminator, not a row, so exactly one is dropped —
 * a range that really ends in an empty row still keeps it.
 */
export const trimTrailingLineBreak = (text: string): string => text.replace(/(\r\n|\n|\r)$/, "");

/**
 * The capture-phase `paste` listener that hands react-spreadsheet the trimmed text. The library listens on
 * `document` in the BUBBLE phase, and only while the grid has focus and no cell is being edited; this runs
 * first, on the same condition, stops the original event and re-dispatches it with `trimTrailingLineBreak`'s
 * text. A paste into a cell editor (an input) is the browser's own and is left alone.
 */
export function useTrimmedGridPaste(gridRef: React.RefObject<HTMLElement | null>): void {
  React.useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const root = gridRef.current;
      const target = event.target;
      if (!root || !(target instanceof Node) || !root.contains(target)) return;
      if (target instanceof HTMLElement
        && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      // No way to build the replacement event (an old engine): the library takes the paste as before.
      if (typeof ClipboardEvent === "undefined" || typeof DataTransfer === "undefined") return;
      const text = event.clipboardData?.getData("text/plain") ?? "";
      const trimmed = trimTrailingLineBreak(text);
      if (trimmed === text) return;
      event.preventDefault();
      event.stopPropagation();
      const data = new DataTransfer();
      data.setData("text/plain", trimmed);
      target.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
    };
    document.addEventListener("paste", onPaste, true);
    return () => document.removeEventListener("paste", onPaste, true);
  }, [gridRef]);
}
