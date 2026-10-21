/**
 * Server-side paging arithmetic.
 *
 * A transcription of the Project Main Screen's paging block, which the canvas recomputed into
 * `colFiltersOverview` after every filter apply:
 *
 *   pageSize            : Coalesce(locFilterValues.PageSize, 1)
 *   calculatedTotalPages: RoundUp(totalRows / pageSize, 0) + If(totalRows = 0, 1, 0)
 *   adjustedPage        : If(currentPage > <totalPages>, 1, currentPage)
 *
 * Two of those are easy to get wrong and both are pinned by tests: an empty result yields
 * **one** page rather than zero, and a page beyond the end resets to 1 rather than clamping to
 * the last page.
 *
 * This lives in `domain/` rather than in a feature because the pager is shared chrome —
 * `GridPager` renders it and any future paged grid needs the same arithmetic.
 *
 * `roundUp` is the Power Fx one from `@/domain/numeric`, not `Math.ceil`, so the semantics
 * under test are the canvas's.
 */
import { roundUp } from "./numeric";

export interface Paging {
  /** 1-based, as the canvas stored it. */
  page: number;
  pageSize: number;
  totalPages: number;
  totalRows: number;
  /** 0-based offset for OData `$skip`. */
  skip: number;
}

/** The canvas `PageSize`. Kept here so the store, the query and the tests share one number. */
export const DEFAULT_PAGE_SIZE = 200;

/**
 * `Coalesce(PageSize, 1)` — a zero, negative or non-finite page size would make `totalPages`
 * infinite, so it degrades to 1 exactly as the canvas `Coalesce` did.
 */
function safePageSize(pageSize: number): number {
  return Number.isFinite(pageSize) && pageSize >= 1 ? Math.floor(pageSize) : 1;
}

export function computePaging(totalRows: number, pageSize: number, page: number): Paging {
  const size = safePageSize(pageSize);
  const rows = Number.isFinite(totalRows) && totalRows > 0 ? Math.floor(totalRows) : 0;

  // The canvas `+ If(totalRows = 0, 1, 0)`: an empty grid still shows "Page: 1 from 1", never
  // "from 0".
  const totalPages = roundUp(rows / size, 0) + (rows === 0 ? 1 : 0);

  const requested = Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1;
  // `If(currentPage > totalPages, 1, currentPage)` — resets to the first page, deliberately
  // not clamped to the last. Changing a filter while deep in a result set lands you back at
  // the top, which is what the canvas did.
  const current = requested > totalPages ? 1 : requested;

  return { page: current, pageSize: size, totalPages, totalRows: rows, skip: (current - 1) * size };
}

/** `$skip` for a given page, without building the whole model. */
export const skipFor = (page: number, pageSize: number): number =>
  Math.max(0, (Math.max(1, Math.floor(page)) - 1) * safePageSize(pageSize));

/* ── pager button state ─────────────────────────────────────────────────────── */

/** The canvas hides the whole pager container when there is only one page. */
export const pagerVisible = (p: Paging): boolean => p.totalPages > 1;
export const firstDisabled = (p: Paging): boolean => p.page <= 1;
export const prevDisabled = (p: Paging): boolean => p.page <= 1;
/** `Page < TotalPages` — note the canvas expressed next/last as a positive test. */
export const nextDisabled = (p: Paging): boolean => !(p.page < p.totalPages);
export const lastDisabled = (p: Paging): boolean => !(p.page < p.totalPages);

/* ── the two footer strings ─────────────────────────────────────────────────── */

/**
 * Pure functions rather than JSX so the screenshot match is *tested* rather than eyeballed:
 * `pagerLabel(computePaging(1127, 200, 1))` is asserted to be exactly "Page: 1 from 6".
 */
export const totalRowsLabel = (p: Paging): string => `Total Rows: ${p.totalRows}`;
export const pagerLabel = (p: Paging): string => `Page: ${p.page} from ${p.totalPages}`;
