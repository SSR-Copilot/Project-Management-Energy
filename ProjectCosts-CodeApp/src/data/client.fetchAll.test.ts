/**
 * UT-FETCHALL-001.. — `fetchAll` (D157): a read that was meant to be complete must not return a short list as a success.
 * The pages are faked, so no SDK is needed; only the paging logic is under test.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@microsoft/power-apps/data", () => ({ getClient: vi.fn() }));
vi.mock("../../.power/schemas/appschemas/dataSourcesInfo", () => ({ dataSourcesInfo: {} }));

import { DataError } from "@/platform/errors";
import { fetchAll } from "./client";

/** A table of `pages` pages, one row each; every page but the last carries a skip token. */
const table = (pages: number) => {
  const calls: Array<Record<string, unknown>> = [];
  const page = vi.fn(async (options: Record<string, unknown>) => {
    calls.push(options);
    const n = options.skipToken ? Number(String(options.skipToken).slice(1)) : 0;
    return {
      success: true as const,
      data: [{ n }],
      ...(n + 1 < pages ? { skipToken: `t${n + 1}` } : {}),
    };
  });
  return { page: page as never, calls };
};

describe("fetchAll (D157)", () => {
  it("UT-FETCHALL-001 a table that fits in the default cap is read whole, page after page", async () => {
    const t = table(7);
    const rows = await fetchAll("read the thing", t.page, { select: ["n"] });
    expect(rows).toHaveLength(7);
    expect(t.calls).toHaveLength(7);
  });

  it("UT-FETCHALL-002 a table longer than the default cap (50 pages) FAILS, it does not return the first 50 pages as a success", async () => {
    const t = table(80);
    await expect(fetchAll("read the thing", t.page, { select: ["n"] })).rejects.toBeInstanceOf(DataError);
    // it stopped at the cap: no further pages were pulled
    expect(t.calls).toHaveLength(50);
  });

  it("UT-FETCHALL-003 the failure says the read is incomplete and how far it got", async () => {
    const t = table(80);
    await expect(fetchAll("read the thing", t.page, { select: ["n"] })).rejects.toThrow(/more than 50 rows.*incomplete/);
  });

  it("UT-FETCHALL-004 exactly 50 pages is complete (the 50th page has no token), so it succeeds", async () => {
    const t = table(50);
    const rows = await fetchAll("read the thing", t.page, { select: ["n"] });
    expect(rows).toHaveLength(50);
  });

  it("UT-FETCHALL-005 a caller that names its own maxPages (a search box reading one page) gets that slice, with no failure", async () => {
    const t = table(80);
    const rows = await fetchAll("search people", t.page, { select: ["n"], maxPages: 1 });
    expect(rows).toHaveLength(1);
    expect(t.calls).toHaveLength(1);
    const three = await fetchAll("search people", table(80).page, { select: ["n"], maxPages: 3 });
    expect(three).toHaveLength(3);
  });
});
