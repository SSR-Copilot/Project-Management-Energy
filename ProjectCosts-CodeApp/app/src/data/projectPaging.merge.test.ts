import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Continuous paging across the named / blank-tail boundary, run through the REAL `countedPage`
 * and `loadProjectPage` against a Dataverse-faithful fake (skip-token server, `maxPageSize` from
 * the Prefer header honoured, `$top` ignored, a token valid only for the page size that issued it).
 *
 * For N named rows, B blank rows, T = N + B, page size S the list is ONE sequence (named, then
 * blank by name) cut into pages of S: totalPages = max(1, ceil(T / S)), every page but the last is
 * full, and the pages concatenated are the N named ids then the B blank ids, each exactly once.
 * The old code paged each segment separately (ceil(N/S) + ceil(B/S)), which is one too many
 * whenever neither N nor B is a multiple of S.
 */

let namedCount = 0;
let blankCount = 0;

const SDK_DEFAULT_MAX_PAGE_SIZE = 500;

function fakeServer(options: Record<string, unknown>) {
  const isBlank = String(options.filter ?? "").includes(" eq null");
  const total = isBlank ? blankCount : namedCount;
  const prefix = isBlank ? "b" : "n";

  // Dataverse ignores `$top` when `Prefer: odata.maxpagesize` is present; the page size is maxPageSize.
  const size = (options.maxPageSize as number | undefined) ?? SDK_DEFAULT_MAX_PAGE_SIZE;

  // Token = "<offset>@<page size it was issued under>"; replaying it at another size is rejected.
  let offset = 0;
  if (typeof options.skipToken === "string") {
    const [o, issuedFor] = options.skipToken.split("@");
    if (Number(issuedFor) !== size) {
      return { success: false, error: new Error(`token issued for page size ${issuedFor}, used with ${size}`) };
    }
    offset = Number(o);
  }

  const end = Math.min(total, offset + size);
  const data = Array.from({ length: end - offset }, (_, i) => ({
    vsb_projectid: `${prefix}${String(offset + i + 1).padStart(5, "0")}`,
    vsb_projectname: isBlank ? null : `${prefix}${String(offset + i + 1).padStart(5, "0")}`,
  }));
  return {
    success: true,
    data,
    ...(end < total ? { skipToken: `${end}@${size}` } : {}),
    ...(options.count ? { count: total } : {}),
  };
}

vi.mock("@microsoft/power-apps/data", () => ({
  getClient: () => ({
    retrieveMultipleRecordsAsync: vi.fn(async (_table: string, options: Record<string, unknown>) =>
      fakeServer(options)),
  }),
}));

import { loadProjectPage, resetProjectPageCache } from "./projects";
import { EMPTY_FILTER, DEFAULT_SORT } from "@/features/project-overview/rules";

const load = (page: number, pageSize: number) =>
  loadProjectPage({ filter: EMPTY_FILTER, sort: DEFAULT_SORT, page, pageSize });

const ids = (prefix: string, n: number) =>
  Array.from({ length: n }, (_, i) => `${prefix}${String(i + 1).padStart(5, "0")}`);

beforeEach(() => {
  namedCount = 0;
  blankCount = 0;
  resetProjectPageCache();
});

/** Walks pages 1..totalPages and asserts the whole continuous-paging contract. */
async function assertContinuous(n: number, b: number, size: number) {
  namedCount = n;
  blankCount = b;
  const total = n + b;
  const expectedPages = Math.max(1, Math.ceil(total / size));

  const first = await load(1, size);
  expect(first.totalPages, "totalPages").toBe(expectedPages);
  expect(first.totalRows, "totalRows").toBe(total);

  const seen: string[] = [];
  for (let p = 1; p <= expectedPages; p++) {
    const r = p === 1 ? first : await load(p, size);
    expect(r.page, `page ${p}: page`).toBe(p);
    expect(r.totalPages, `page ${p}: totalPages`).toBe(expectedPages);
    expect(r.totalRows, `page ${p}: totalRows`).toBe(total);
    expect(r.hasNext, `page ${p}: hasNext`).toBe(p < expectedPages);
    const expectedLen = p < expectedPages ? size : total - (expectedPages - 1) * size;
    expect(r.rows.length, `page ${p}: rows.length`).toBe(expectedLen);
    seen.push(...r.rows.map((x) => x.id));
  }
  expect(seen.length, "total ids").toBe(total);
  expect(new Set(seen).size, "distinct ids").toBe(total);
  expect(seen).toEqual([...ids("n", n), ...ids("b", b)]);
}

const SMALL = 7;
const CASES: Array<[number, number]> = [
  [0, 0], [0, 5], [0, 7], [0, 8], [5, 0], [7, 0], [7, 1], [6, 1],
  [6, 2], [13, 1], [14, 0], [14, 14], [15, 14], [20, 29], [1, 0], [0, 1],
];

describe("loadProjectPage — pages are continuous across the named / blank boundary", () => {
  it.each(CASES.map(([n, b], i) => ({ id: `UT-PROJMERGE-${String(i + 1).padStart(3, "0")}`, n, b })))(
    "$id N=$n named + B=$b blank at pageSize 7 pages as one continuous list",
    async ({ n, b }) => {
      await assertContinuous(n, b, SMALL);
    },
  );

  it("UT-PROJMERGE-017 1,100 named + 29 blank at pageSize 200 is 6 pages, the last holding 100 named + 29 blank", async () => {
    await assertContinuous(1100, 29, 200);
    const last = await load(6, 200);
    expect(last.totalPages).toBe(6);
    expect(last.rows).toHaveLength(129);
    expect(last.rows.slice(0, 100).map((r) => r.id)).toEqual(ids("n", 1100).slice(1000));
    expect(last.rows.slice(100).map((r) => r.id)).toEqual(ids("b", 29));
  });

  it("UT-PROJMERGE-018 a page past the end does not throw and resets to page 1", async () => {
    namedCount = 20;
    blankCount = 29; // T = 49, 7 pages at size 7
    const r = await load(99, SMALL);
    expect(r.rows.length).toBeLessThanOrEqual(SMALL);
    expect(r.page).toBe(1);
    expect(r.page).toBeLessThanOrEqual(r.totalPages);
    expect(r.totalPages).toBe(7);
    expect(r.rows.map((x) => x.id)).toEqual(ids("n", SMALL));
  });
});
