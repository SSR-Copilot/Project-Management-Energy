/**
 * T-C05: the adopted call sites give the SAME rows and the SAME requests with the read lane on and off (differential on randomised
 * id lists, 1 to 45 chunks). Only the order in which a queued chunk STARTS may differ above 16 chunks, so the requests are compared
 * as sorted lists. Ids: UT-READLANE-SITE-NNN.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

interface Call { label: string; filter?: string }
const h = vi.hoisted(() => ({ calls: [] as { label: string; filter?: string }[] }));

vi.mock("./client", () => ({
  // One row per id found in the filter: enough to exercise each site's mapping, and the answer depends only on the request.
  fetchAll: async (label: string, _page: unknown, options?: { filter?: string }) => {
    h.calls.push({ label, filter: options?.filter });
    await Promise.resolve();
    const found = [...(options?.filter ?? "").matchAll(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g)].map((m) => m[0]);
    return found.map((id, i) => ({
      vsb_capexcommentsid: `cm-${id}`, vsb_comment: `t${i}`, _vsb_capexcontract_value: id,
      vsb_bopcontractsdevcocostsid: `dv-${id}`, _vsb_account_value: `acc-${i}`, _vsb_bopcontract_value: id,
      vsb_devexcapexstandardassumptionsid: `sa-${id}`, _vsb_subaccount_value: id, vsb_costamount: i,
      vsb_bopcontractspaymenttargetsid: `pt-${id}`, vsb_description: `d${i}`, _vsb_bopprojectcontract_value: id,
    }));
  },
  deleteRecord: async () => undefined,
}));
vi.mock("@/platform/errors", async (orig) => ({ ...(await orig<object>()), unwrap: (x: unknown) => x }));

const { loadComments } = await import("./comments");
const { listDevCoLinks, listPaymentTargets } = await import("./contracts");
const { loadStandardAssumptions } = await import("./standardContracts");
const flags = await import("./readLaneFlags");

function rng(seed: number) {
  let x = seed >>> 0;
  return () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 2 ** 32; };
}
const guid = (n: number) => `${(0xa0000000 + n).toString(16)}-0000-4000-8000-000000000000`;
const sorted = (calls: Call[]) => calls.map((c) => `${c.label}|${c.filter}`).sort();

const SITES: Record<string, (ids: string[]) => Promise<unknown>> = {
  loadComments: (ids) => loadComments(ids),
  listDevCoLinks: (ids) => listDevCoLinks(ids),
  listPaymentTargets: (ids) => listPaymentTargets("p", ids),
  loadStandardAssumptions: (ids) => loadStandardAssumptions(ids),
};

beforeEach(() => { h.calls.length = 0; flags.resetReadLaneFlags(); });

describe("adopted read sites: lane on = lane off", () => {
  for (const [name, run] of Object.entries(SITES)) {
    it(`UT-READLANE-SITE-00${Object.keys(SITES).indexOf(name) + 1} ${name}: same rows, same requests for randomised id lists of 0 to 1,800 ids`, async () => {
      const next = rng(7 + name.length);
      for (let round = 0; round < 12; round += 1) {
        const n = Math.floor(next() * 1800);
        const ids = Array.from({ length: n }, (_, i) => guid(i));
        flags.setReadLaneFlagsForTests({ enabled: false });
        h.calls.length = 0;
        const old = await run(ids);
        const oldCalls = sorted(h.calls);
        flags.setReadLaneFlagsForTests({ enabled: true });
        h.calls.length = 0;
        const lane = await run(ids);
        expect(JSON.stringify(lane)).toBe(JSON.stringify(old)); // byte-identical output
        expect(sorted(h.calls)).toEqual(oldCalls);
        expect(oldCalls).toHaveLength(Math.ceil(n / 40));
      }
    });
  }
});
