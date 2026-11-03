/**
 * Read (and clean up) Land Lease rows for the write layer (E2E-PARITY-PROMPT.md section 4.5, "Data integrity").
 *
 * No second login and no app change: during a parity run the code app is served by `npm run dev`, so the code-app frame can import
 * the app's OWN modules (`/src/generated/services/…`, `/src/data/client.ts`). The reads then go through the app's real SDK connection
 * as the signed-in user and return RAW Dataverse values (not the formatted text `pac org fetch` prints). Cleanup uses the app's
 * `deleteRecord`, which surfaces a refused delete (CONVENTIONS rule 14), never the generated `delete()`.
 *
 * Only rows whose Name carries this run's `PW-` tag are ever touched.
 */
import type { Page } from "@playwright/test";

export interface LeaseRows { costs: Record<string, unknown>[]; periods: Record<string, unknown>[]; allocations: Record<string, unknown>[] }

const codeFrame = (page: Page) => {
  const frame = page.frames().find((f) => f.url().includes("localhost:3000"));
  if (!frame) throw new Error("The code app frame (localhost:3000) is not open on this page");
  return frame;
};

const assertTag = (tag: string): void => {
  if (!/^PW-[A-Za-z0-9-]{6,}$/.test(tag)) throw new Error(`Refusing to touch rows for a tag that is not a PW- run tag: ${tag}`);
};

/** The header rows whose Name contains `tag`, with their periods and WTG allocations. */
export async function readLeaseByTag(page: Page, tag: string): Promise<LeaseRows> {
  assertTag(tag);
  return codeFrame(page).evaluate(async (t) => {
    const unwrap = (r: { success?: boolean; data?: unknown; error?: unknown }) => {
      if (r?.success === false) throw new Error(`read failed: ${JSON.stringify(r.error).slice(0, 300)}`);
      return (r?.data ?? []) as Record<string, unknown>[];
    };
    // A variable path: these modules exist only on the dev server, inside the frame (not to the type checker).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const load = (path: string) => import(/* @vite-ignore */ path) as Promise<any>;
    const { Vsb_landleaseprojectcostsService: Costs } = await load("/src/generated/services/Vsb_landleaseprojectcostsService.ts");
    const { Vsb_landleaseperiodsService: Periods } = await load("/src/generated/services/Vsb_landleaseperiodsService.ts");
    const { Vsb_landleaseallocationwtgsService: Allocs } = await load("/src/generated/services/Vsb_landleaseallocationwtgsService.ts");
    const costs = unwrap(await Costs.getAll({ filter: `contains(vsb_name,'${t}')` }));
    const periods: Record<string, unknown>[] = [];
    const allocations: Record<string, unknown>[] = [];
    for (const c of costs) {
      const id = String(c.vsb_landleaseprojectcostid);
      periods.push(...unwrap(await Periods.getAll({ filter: `_vsb_projectcost_value eq ${id}` })));
      allocations.push(...unwrap(await Allocs.getAll({ filter: `_vsb_projectcost_value eq ${id}` })));
    }
    return { costs, periods, allocations };
  }, tag);
}

/** Deletes every row of this run's tag (allocations, periods, then the header) and returns what could NOT be deleted. */
export async function deleteLeaseByTag(page: Page, tag: string): Promise<string[]> {
  assertTag(tag);
  const rows = await readLeaseByTag(page, tag);
  return codeFrame(page).evaluate(async (r) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { deleteRecord } = await (import(/* @vite-ignore */ "/src/data/client.ts" as string) as Promise<any>);
    const left: string[] = [];
    const del = async (table: string, key: string, list: Record<string, unknown>[]) => {
      for (const row of list) {
        try { await deleteRecord("parity cleanup", table, String(row[key])); } catch (e) { left.push(`${table} ${String(row[key])}: ${String(e).slice(0, 160)}`); }
      }
    };
    await del("vsb_landleaseallocationwtgs", "vsb_landleaseallocationwtgid", r.allocations);
    await del("vsb_landleaseperiods", "vsb_landleaseperiodid", r.periods);
    await del("vsb_landleaseprojectcosts", "vsb_landleaseprojectcostid", r.costs);
    return left;
  }, rows);
}

/** Keys that differ by nature between two runs (ids, audit stamps, annotations) and are left out of a comparison. */
const VOLATILE = /(^@|@|^_?(createdby|createdonbehalfby|modifiedby|modifiedonbehalfby|owninguser|owningteam|ownerid)(_value)?$|^(createdon|modifiedon|versionnumber|overriddencreatedon|importsequencenumber|timezoneruleversionnumber|utcconversiontimezonecode)$|id$|^_vsb_projectcost_value$)/;

/** A row with its run tag replaced by `<tag>` and its volatile keys removed, keys sorted: what two apps must write the same. */
export function normalizeRow(row: Record<string, unknown>, tag: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(row).sort()) {
    if (VOLATILE.test(key)) continue;
    const v = row[key];
    out[key] = typeof v === "string" ? v.split(tag).join("<tag>") : v;
  }
  return out;
}
