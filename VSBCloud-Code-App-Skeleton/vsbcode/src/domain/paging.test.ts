/**
 * Paging arithmetic — the Project Main Screen's paging block.
 *
 * The two footer strings are asserted character-for-character, because "Total Rows: 1127" and
 * "Page: 1 from 6" are what the reference screenshot shows and a pure function is the only
 * part of that match that can be pinned by CI rather than by eye.
 */
import { describe, it, expect } from "vitest";
import {
  computePaging,
  skipFor,
  pagerVisible,
  firstDisabled,
  prevDisabled,
  nextDisabled,
  lastDisabled,
  totalRowsLabel,
  pagerLabel,
  DEFAULT_PAGE_SIZE,
} from "./paging";

describe("computePaging", () => {
  it("reproduces the screenshot: 1127 rows at 200 a page is 6 pages", () => {
    const p = computePaging(1127, DEFAULT_PAGE_SIZE, 1);
    expect(p.totalPages).toBe(6);
    expect(p.page).toBe(1);
    expect(p.totalRows).toBe(1127);
    expect(p.skip).toBe(0);
  });

  it("gives an empty result ONE page, not zero", () => {
    // The canvas `+ If(totalRows = 0, 1, 0)`. An empty grid still reads "Page: 1 from 1".
    const p = computePaging(0, 200, 1);
    expect(p.totalPages).toBe(1);
    expect(p.page).toBe(1);
    expect(pagerLabel(p)).toBe("Page: 1 from 1");
  });

  it("resets a page beyond the end to 1, rather than clamping to the last", () => {
    // `If(currentPage > totalPages, 1, currentPage)` — the distinction matters: filtering
    // while on page 4 of 6 down to a 2-page result lands on page 1, not page 2.
    expect(computePaging(100, 200, 3).page).toBe(1);
    expect(computePaging(1127, 200, 99).page).toBe(1);
  });

  it("keeps a page that is still in range", () => {
    const p = computePaging(1127, 200, 4);
    expect(p.page).toBe(4);
    expect(p.skip).toBe(600);
  });

  it("computes skip as a 0-based offset", () => {
    expect(computePaging(1127, 200, 1).skip).toBe(0);
    expect(computePaging(1127, 200, 2).skip).toBe(200);
    expect(computePaging(1127, 200, 6).skip).toBe(1000);
  });

  it("divides exactly when the total is a multiple of the page size", () => {
    expect(computePaging(400, 200, 1).totalPages).toBe(2);
    expect(computePaging(200, 200, 1).totalPages).toBe(1);
  });

  it("rounds a partial last page up", () => {
    expect(computePaging(201, 200, 1).totalPages).toBe(2);
    expect(computePaging(1, 200, 1).totalPages).toBe(1);
  });

  it("degrades a nonsensical page size to 1 instead of producing infinity", () => {
    // `Coalesce(PageSize, 1)`. Without this a zero page size makes totalPages Infinity and
    // the pager renders "Page: 1 from Infinity".
    for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const p = computePaging(10, bad, 1);
      expect(p.pageSize).toBe(1);
      expect(p.totalPages).toBe(10);
    }
  });

  it("degrades a nonsensical page number to 1", () => {
    for (const bad of [0, -3, Number.NaN]) {
      expect(computePaging(1127, 200, bad).page).toBe(1);
    }
  });

  it("treats a negative or non-finite total as empty", () => {
    expect(computePaging(-10, 200, 1).totalRows).toBe(0);
    expect(computePaging(Number.NaN, 200, 1).totalPages).toBe(1);
  });
});

describe("skipFor", () => {
  it("matches computePaging's skip without building the model", () => {
    for (const page of [1, 2, 3, 6]) {
      expect(skipFor(page, 200)).toBe(computePaging(1127, 200, page).skip);
    }
  });

  it("never returns a negative offset", () => {
    expect(skipFor(0, 200)).toBe(0);
    expect(skipFor(-4, 200)).toBe(0);
  });
});

describe("pager button state", () => {
  const p1 = computePaging(1127, 200, 1);
  const p4 = computePaging(1127, 200, 4);
  const p6 = computePaging(1127, 200, 6);

  it("disables first and previous on page 1 — the screenshot's state", () => {
    expect(firstDisabled(p1)).toBe(true);
    expect(prevDisabled(p1)).toBe(true);
    expect(nextDisabled(p1)).toBe(false);
  });

  it("enables everything in the middle", () => {
    expect(firstDisabled(p4)).toBe(false);
    expect(prevDisabled(p4)).toBe(false);
    expect(nextDisabled(p4)).toBe(false);
    expect(lastDisabled(p4)).toBe(false);
  });

  it("disables next and last on the final page", () => {
    expect(nextDisabled(p6)).toBe(true);
    expect(lastDisabled(p6)).toBe(true);
    expect(prevDisabled(p6)).toBe(false);
  });

  it("hides the pager entirely for a single page", () => {
    expect(pagerVisible(computePaging(0, 200, 1))).toBe(false);
    expect(pagerVisible(computePaging(150, 200, 1))).toBe(false);
    expect(pagerVisible(p1)).toBe(true);
  });
});

describe("footer labels", () => {
  it("renders the screenshot's two strings exactly", () => {
    const p = computePaging(1127, DEFAULT_PAGE_SIZE, 1);
    expect(totalRowsLabel(p)).toBe("Total Rows: 1127");
    expect(pagerLabel(p)).toBe("Page: 1 from 6");
  });

  it("does not group the total — the canvas prints it bare", () => {
    // "Total Rows: 1127", not "1,127".
    expect(totalRowsLabel(computePaging(1127, 200, 1))).not.toContain(",");
  });

  it("tracks the current page", () => {
    expect(pagerLabel(computePaging(1127, 200, 3))).toBe("Page: 3 from 6");
  });

  it("reads sensibly when empty", () => {
    const p = computePaging(0, 200, 1);
    expect(totalRowsLabel(p)).toBe("Total Rows: 0");
    expect(pagerLabel(p)).toBe("Page: 1 from 1");
  });
});
