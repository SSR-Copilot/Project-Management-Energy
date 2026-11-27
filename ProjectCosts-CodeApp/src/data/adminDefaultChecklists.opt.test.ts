/**
 * Optimization programme B7, OPT-07d (admin part): Check List Settings' clusters come from the ONE shared `Project States` read
 * (`projectStatesQueryOptions`, D159) through a view, instead of a read of their own (`vsb_isvisibleonchecklist eq true`,
 * `vsb_order asc`). The OLD result is modelled as the server gave it: the visible rows, ordered by `vsb_order` ASCENDING WITH NULLS
 * FIRST (SQL), ties in row order. The view must give the same list for ties, a null order, an inactive row. Ids: UT-ADCHK-OPT-NNN.
 *
 * Not provable from a repository: the order of TIED rows when the server answers an `orderby` read (unspecified by SQL) against the
 * shared read (no `orderby`, a stable client sort over the rows as they arrive). Both are in practice the table's key order.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[] }));
vi.mock("./client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./client")>()),
  fetchAll: async () => h.rows,
}));

const { listProjectStates } = await import("./projectStatesRead");
const { checklistClusterView } = await import("./adminDefaultChecklists");

type Raw = { vsb_projectstateid: string; vsb_name: string | null; vsb_order: number | null; vsb_isvisibleonchecklist: boolean | null; statecode: number };

/** The OLD read: server filter (visible), `vsb_order asc` with NULLS FIRST and a stable tie order, mapped as `listClusters` did. */
function oldClusters(rows: readonly Raw[]) {
  return rows
    .filter((r) => r.vsb_isvisibleonchecklist === true)
    .map((r, i) => ({ r, i }))
    .sort((a, b) => {
      const ka = a.r.vsb_order ?? Number.NEGATIVE_INFINITY;
      const kb = b.r.vsb_order ?? Number.NEGATIVE_INFINITY;
      return ka === kb ? a.i - b.i : ka < kb ? -1 : 1;
    })
    .map(({ r }) => ({ id: r.vsb_projectstateid, name: r.vsb_name ?? "", order: r.vsb_order ?? null }));
}

function rng(seed: number) {
  let x = seed >>> 0;
  return () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 2 ** 32; };
}
function generate(seed: number, count = 12): Raw[] {
  const r = rng(seed);
  return Array.from({ length: count }, (_, i) => ({
    vsb_projectstateid: `s${i}`,
    vsb_name: r() < 0.1 ? null : `State ${i}`,
    vsb_order: r() < 0.2 ? null : Math.floor(r() * 5), // ties and nulls
    vsb_isvisibleonchecklist: r() < 0.15 ? null : r() < 0.7,
    statecode: r() < 0.2 ? 1 : 0, // inactive rows are NOT filtered by the old read
  }));
}

beforeEach(() => { h.rows = []; });

describe("OPT-07d checklistClusterView equals the old dedicated read", () => {
  it("UT-ADCHK-OPT-001 same clusters, same order over 60 generated tables (ties, null orders, inactive rows, null names, non-visible rows)", async () => {
    for (let seed = 1; seed <= 60; seed += 1) {
      h.rows = generate(seed, 3 + (seed % 14));
      const shared = await listProjectStates();
      expect(checklistClusterView(shared)).toEqual(oldClusters(h.rows as unknown as Raw[]));
    }
  });

  it("UT-ADCHK-OPT-002 a null Order sorts FIRST (SQL NULLS FIRST), not as 0 (the shared list maps null to 0) and keeps order: null", async () => {
    h.rows = [
      { vsb_projectstateid: "zero", vsb_name: "Zero", vsb_order: 0, vsb_isvisibleonchecklist: true, statecode: 0 },
      { vsb_projectstateid: "none", vsb_name: "None", vsb_order: null, vsb_isvisibleonchecklist: true, statecode: 0 },
      { vsb_projectstateid: "one", vsb_name: "One", vsb_order: 1, vsb_isvisibleonchecklist: true, statecode: 0 },
    ];
    expect(checklistClusterView(await listProjectStates())).toEqual([
      { id: "none", name: "None", order: null }, { id: "zero", name: "Zero", order: 0 }, { id: "one", name: "One", order: 1 },
    ]);
  });

  it("UT-ADCHK-OPT-003 an inactive but visible state is kept, a non-visible active one is not, ties keep the table's row order", async () => {
    h.rows = [
      { vsb_projectstateid: "b", vsb_name: "B", vsb_order: 2, vsb_isvisibleonchecklist: true, statecode: 1 },
      { vsb_projectstateid: "a", vsb_name: "A", vsb_order: 2, vsb_isvisibleonchecklist: true, statecode: 0 },
      { vsb_projectstateid: "hidden", vsb_name: "H", vsb_order: 1, vsb_isvisibleonchecklist: false, statecode: 0 },
    ];
    expect(checklistClusterView(await listProjectStates()).map((c) => c.id)).toEqual(["b", "a"]);
  });
});
