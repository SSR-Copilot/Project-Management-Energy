/**
 * Skip-token paging (`countedPage`).
 *
 * Dataverse refuses `$skip` (`0x80060888 "Skip Clause is not supported in CRM"`), so reaching
 * page N means walking pages 1…N and caching each page's token. These tests pin the three
 * things that walk gets wrong when it is left unguarded:
 *
 * - P-5 the cache key must include the table, not just the caller-supplied signature;
 * - P-4 the walk must be capped, and must SAY it was capped (`limited`);
 * - P-1 a mutation must be able to invalidate the walk — `invalidatePageTokens` — because a
 *   delete leaves the signature unchanged while shifting every row across the page seams.
 *
 * The assertions are on the OPTIONS handed to the SDK, not only on the rows returned: the whole
 * defect class here is "the right-looking rows fetched with the wrong token".
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

/** Options as the SDK received them, in order, across every table. */
type SdkCall = {
  table: string;
  skipToken: string | undefined;
  count: unknown;
  top?: unknown;
  maxPageSize?: unknown;
  /** Whether the `top` key was present at all (even as undefined it would be a smell). */
  hasTop: boolean;
};

let calls: SdkCall[] = [];
/** Pages per table: how many pages of rows that table has. */
let pageCount: Record<string, number> = {};
/**
 * When true, the fake behaves like the Dataverse Web API (UT-PAGE-014): `$top` caps the WHOLE
 * result set, so a request carrying `top` gets no `@odata.nextLink` (no skip token), and a
 * request carrying both `top` and a skip token returns zero rows. Only `maxPageSize` pages.
 */
let realServer = false;
/** Rows the server reports as `@odata.count`, per table. Defaults to `pageCount * 2`. */
let totalFor: Record<string, number> = {};
/** When true, the server sends no `@odata.count` even when asked (UT-PAGE-018). */
let omitCount = false;
/**
 * Like Dataverse, the fake reports `@odata.count` ONLY when the request asked for it — so a
 * `totalRows` on a request that sent no `count` can only have come from the cache.
 */
const countFor = (table: string, options: Record<string, unknown>, total: number) =>
  options.count === true && !omitCount ? (totalFor[table] ?? total * 2) : undefined;

/**
 * Token scheme: the token that reaches 0-based page `i` is `<table>#<i>`. Encoding the table in
 * the token is what lets UT-PAGE-005 prove two tables never reuse each other's tokens.
 */
const tokenFor = (table: string, index: number) => `${table}#${index}`;

const fakeClient = {
  retrieveMultipleRecordsAsync: async (table: string, options: Record<string, unknown>) => {
    const skipToken = options.skipToken as string | undefined;
    calls.push({
      table,
      skipToken,
      count: options.count,
      top: options.top,
      maxPageSize: options.maxPageSize,
      hasTop: "top" in options,
    });
    const total = pageCount[table] ?? 1;
    const index = skipToken === undefined ? 0 : Number(skipToken.split("#")[1]);
    if (realServer && options.top !== undefined) {
      // `$top` capped the set: nothing to page past it.
      return {
        success: true,
        data: skipToken === undefined ? [{ id: `${table}-p0-r1` }, { id: `${table}-p0-r2` }] : [],
        count: countFor(table, options, total),
        skipToken: undefined,
      };
    }
    const last = index >= total - 1;
    return {
      success: true,
      data: [{ id: `${table}-p${index}-r1` }, { id: `${table}-p${index}-r2` }],
      count: countFor(table, options, total),
      skipToken: last ? undefined : tokenFor(table, index + 1),
    };
  },
};

vi.mock("@microsoft/power-apps/data", () => ({ getClient: () => fakeClient }));

import {
  DEFAULT_MAX_PAGE_WALK,
  countedPage,
  invalidatePageTokens,
  resetPageTokens,
} from "./client";

const base = { select: ["id"], top: 2 };

/** Every skip token the SDK was handed, in order — `undefined` meaning "page 1, no token". */
const tokens = () => calls.map((c) => c.skipToken);

beforeEach(() => {
  calls = [];
  pageCount = { alpha: 5, beta: 5 };
  realServer = false;
  totalFor = {};
  omitCount = false;
  resetPageTokens();
});

describe("countedPage — skip-token walk", () => {
  it("UT-PAGE-001 A cached token is reused: page 2 is one request, not a re-walk of page 1", async () => {
    const first = await countedPage("read alpha", "alpha", { ...base, page: 1, signature: "sig" });
    expect(first.page).toBe(1);
    expect(tokens()).toEqual([undefined]);

    calls = [];
    const second = await countedPage("read alpha", "alpha", { ...base, page: 2, signature: "sig" });
    // One request only, and it carried the token page 1 handed back.
    expect(tokens()).toEqual([tokenFor("alpha", 1)]);
    expect(second.page).toBe(2);
    expect(second.rows).toEqual([{ id: "alpha-p1-r1" }, { id: "alpha-p1-r2" }]);
  });

  it("UT-PAGE-002 Cold cache walks every page in order, forwarding each token", async () => {
    const result = await countedPage("read alpha", "alpha", { ...base, page: 3, signature: "sig" });
    expect(tokens()).toEqual([undefined, tokenFor("alpha", 1), tokenFor("alpha", 2)]);
    expect(result.page).toBe(3);
    expect(result.hasNext).toBe(true);
    expect(result.totalRows).toBe(10);
    expect(result.limited).toBe(false);
  });

  it("UT-PAGE-003 The data running out stops the walk early and reports the page actually reached", async () => {
    pageCount.alpha = 3;
    const result = await countedPage("read alpha", "alpha", { ...base, page: 9, signature: "sig" });
    // Three requests, then no token: the walk ends on the data, not on the cap.
    expect(calls).toHaveLength(3);
    expect(result.page).toBe(3);
    expect(result.hasNext).toBe(false);
    // Ran out of rows ≠ gave up walking.
    expect(result.limited).toBe(false);
  });

  it("UT-PAGE-004 `limited` is false on an ordinary walk that reaches the page it asked for", async () => {
    const result = await countedPage("read alpha", "alpha", { ...base, page: 2, signature: "sig" });
    expect(result.limited).toBe(false);
    expect(result.page).toBe(2);
  });

  it("UT-PAGE-005 `maxPages` caps the walk and sets `limited`", async () => {
    pageCount.alpha = 500;
    const result = await countedPage("read alpha", "alpha", {
      ...base,
      page: 400,
      signature: "sig",
      maxPages: 3,
    });
    // Three round trips, not 400.
    expect(calls).toHaveLength(3);
    expect(result.page).toBe(3);
    expect(result.limited).toBe(true);
    // `hasNext` keeps its meaning: the server did hand back a further token.
    expect(result.hasNext).toBe(true);
  });

  it("UT-PAGE-006 Without `maxPages` the walk is still capped, at DEFAULT_MAX_PAGE_WALK", async () => {
    expect(DEFAULT_MAX_PAGE_WALK).toBe(100);
    pageCount.alpha = 5000;
    const result = await countedPage("read alpha", "alpha", { ...base, page: 5000, signature: "sig" });
    expect(calls).toHaveLength(DEFAULT_MAX_PAGE_WALK);
    expect(result.page).toBe(DEFAULT_MAX_PAGE_WALK);
    expect(result.limited).toBe(true);
  });

  it("UT-PAGE-007 P-5: two tables with an IDENTICAL signature do not share tokens", async () => {
    await countedPage("read alpha", "alpha", { ...base, page: 2, signature: "same" });
    calls = [];

    // Same signature string, different table: this must start from no token, not from alpha's.
    const beta = await countedPage("read beta", "beta", { ...base, page: 2, signature: "same" });
    expect(tokens()).toEqual([undefined, tokenFor("beta", 1)]);
    expect(calls.every((c) => c.table === "beta")).toBe(true);
    expect(beta.rows).toEqual([{ id: "beta-p1-r1" }, { id: "beta-p1-r2" }]);
  });

  it("UT-PAGE-008 P-1: `invalidatePageTokens` makes the next request start with NO skipToken", async () => {
    await countedPage("read alpha", "alpha", { ...base, page: 2, signature: "sig" });
    calls = [];

    // A delete happened: the signature is unchanged, so only an explicit invalidation helps.
    invalidatePageTokens("alpha");

    const after = await countedPage("read alpha", "alpha", { ...base, page: 2, signature: "sig" });
    // Re-walked from page 1 — the first request carried no token at all.
    expect(tokens()).toEqual([undefined, tokenFor("alpha", 1)]);
    expect(after.page).toBe(2);
  });

  it("UT-PAGE-009 `invalidatePageTokens` drops EVERY signature on that table, and no other table", async () => {
    await countedPage("read alpha", "alpha", { ...base, page: 2, signature: "a" });
    await countedPage("read alpha", "alpha", { ...base, page: 2, signature: "b" });
    await countedPage("read beta", "beta", { ...base, page: 2, signature: "a" });
    calls = [];

    invalidatePageTokens("alpha");

    await countedPage("read alpha", "alpha", { ...base, page: 2, signature: "a" });
    await countedPage("read alpha", "alpha", { ...base, page: 2, signature: "b" });
    await countedPage("read beta", "beta", { ...base, page: 2, signature: "a" });
    expect(tokens()).toEqual([
      undefined, tokenFor("alpha", 1), // signature "a" re-walked
      undefined, tokenFor("alpha", 1), // signature "b" re-walked
      tokenFor("beta", 1),             // beta untouched: still one request
    ]);
  });

  it("UT-PAGE-010 `resetPageTokens(signature)` still clears that signature now the key is composite", async () => {
    await countedPage("read alpha", "alpha", { ...base, page: 2, signature: "sig" });
    calls = [];
    resetPageTokens("sig");
    await countedPage("read alpha", "alpha", { ...base, page: 2, signature: "sig" });
    expect(tokens()).toEqual([undefined, tokenFor("alpha", 1)]);
  });

  // Corrected: this used to assert `top` WAS forwarded (`calls[0].top === 2`) — the defect
  // itself, pinned as a test. `$top` caps the whole result set and stops Dataverse paging, so the
  // page size must reach the SDK as `maxPageSize` instead.
  // Corrected again (count caching): the title said `count: true` is "always" requested. It is
  // now requested only while the total is unknown — on the first request of a walk, as here.
  // UT-PAGE-015..018 pin the later requests.
  it("UT-PAGE-011 `count: true` is requested on a cold walk's first request, and the page size travels as `maxPageSize`, not `top`", async () => {
    await countedPage("read alpha", "alpha", { ...base, page: 1, signature: "sig" });
    expect(calls[0]?.count).toBe(true);
    expect(calls[0]?.maxPageSize).toBe(2);
    expect(calls[0]?.hasTop).toBe(false);
  });

  it("UT-PAGE-012 No SDK call ever carries a `top` option — on any walked page, or the 1-row probe", async () => {
    await countedPage("read alpha", "alpha", { ...base, page: 4, signature: "sig" });
    await countedPage("read beta", "beta", { select: ["id"], top: 1, page: 1, signature: "probe" });
    expect(calls.length).toBeGreaterThan(4);
    expect(calls.every((c) => !c.hasTop)).toBe(true);
  });

  it("UT-PAGE-013 `maxPageSize` equals the requested page size on every request, including 1 for the probe", async () => {
    await countedPage("read alpha", "alpha", { select: ["id"], top: 200, page: 3, signature: "big" });
    expect(calls.map((c) => c.maxPageSize)).toEqual([200, 200, 200]);

    calls = [];
    const probe = await countedPage("read beta", "beta", { select: ["id"], top: 1, page: 1, signature: "probe" });
    expect(calls.map((c) => c.maxPageSize)).toEqual([1]);
    // The probe still gets its total.
    expect(probe.totalRows).toBe(10);
  });

  it("UT-PAGE-014 Against a server that models `$top` vs `odata.maxpagesize`, the walk reaches page 2 with rows", async () => {
    realServer = true;
    const first = await countedPage("read alpha", "alpha", { ...base, page: 1, signature: "sig" });
    expect(first.hasNext).toBe(true);

    const second = await countedPage("read alpha", "alpha", { ...base, page: 2, signature: "sig" });
    expect(second.page).toBe(2);
    expect(second.rows).toEqual([{ id: "alpha-p1-r1" }, { id: "alpha-p1-r2" }]);
    expect(second.hasNext).toBe(true);
  });
});

describe("countedPage — `@odata.count` is requested once per walk", () => {
  /** The `count` option each SDK call carried, in order. */
  const counts = () => calls.map((c) => c.count);

  it("UT-PAGE-015 A 3-page walk sends `count` on the first request only, and every page reports the same total", async () => {
    // Cold walk to page 3: three requests, only the first asks for the count.
    const third = await countedPage("read alpha", "alpha", { ...base, page: 3, signature: "sig" });
    expect(counts()).toEqual([true, undefined, undefined]);
    expect(third.totalRows).toBe(10);

    // Previous / Next on the same query: no further recount, total still from the cache.
    calls = [];
    const first = await countedPage("read alpha", "alpha", { ...base, page: 1, signature: "sig" });
    const second = await countedPage("read alpha", "alpha", { ...base, page: 2, signature: "sig" });
    expect(counts()).toEqual([undefined, undefined]);
    expect([first.totalRows, second.totalRows, third.totalRows]).toEqual([10, 10, 10]);
  });

  it("UT-PAGE-016 After `invalidatePageTokens` the next request sends `count` again and picks up the new total", async () => {
    await countedPage("read alpha", "alpha", { ...base, page: 2, signature: "sig" });
    // A write in this tab deleted three rows; the server's total moves.
    totalFor.alpha = 7;
    invalidatePageTokens("alpha");

    calls = [];
    const after = await countedPage("read alpha", "alpha", { ...base, page: 2, signature: "sig" });
    expect(counts()).toEqual([true, undefined]);
    expect(after.totalRows).toBe(7);

    // `resetPageTokens` clears the total too.
    totalFor.alpha = 6;
    resetPageTokens("sig");
    calls = [];
    const reset = await countedPage("read alpha", "alpha", { ...base, page: 1, signature: "sig" });
    expect(counts()).toEqual([true]);
    expect(reset.totalRows).toBe(6);
  });

  it("UT-PAGE-017 Two keys (table or signature) cache their totals independently", async () => {
    totalFor = { alpha: 10, beta: 4 };
    await countedPage("read alpha", "alpha", { ...base, page: 1, signature: "a" });
    await countedPage("read beta", "beta", { ...base, page: 1, signature: "a" });
    // Same table, different signature: its own first request, its own count.
    totalFor.alpha = 3;
    const alphaB = await countedPage("read alpha", "alpha", { ...base, page: 1, signature: "b" });
    expect(counts()).toEqual([true, true, true]);
    expect(alphaB.totalRows).toBe(3);

    calls = [];
    const alphaA = await countedPage("read alpha", "alpha", { ...base, page: 2, signature: "a" });
    const beta = await countedPage("read beta", "beta", { ...base, page: 2, signature: "a" });
    expect(counts()).toEqual([undefined, undefined]);
    expect([alphaA.totalRows, beta.totalRows, alphaB.totalRows]).toEqual([10, 4, 3]);

    // Invalidating one table leaves the other's total cached.
    invalidatePageTokens("alpha");
    calls = [];
    await countedPage("read beta", "beta", { ...base, page: 1, signature: "a" });
    expect(counts()).toEqual([undefined]);
  });

  it("UT-PAGE-018 A fallback total (`rows.length`, no server count) is never cached", async () => {
    omitCount = true;
    const first = await countedPage("read alpha", "alpha", { ...base, page: 1, signature: "sig" });
    // No count came back: the first request falls back to the rows it holds.
    expect(first.totalRows).toBe(2);

    // The fallback was not stored as the total, so the next request asks again — and takes
    // the server's real count once it arrives.
    omitCount = false;
    calls = [];
    const second = await countedPage("read alpha", "alpha", { ...base, page: 2, signature: "sig" });
    expect(counts()).toEqual([true]);
    expect(second.totalRows).toBe(10);
  });
});
