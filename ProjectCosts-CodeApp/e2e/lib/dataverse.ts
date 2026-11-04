/**
 * Read (and clean up) Land Lease rows for the write layer (E2E-PARITY-PROMPT.md section 4.5, "Data integrity").
 *
 * Thin wrappers over the harness's generic data layer (`e2e/harness/data.ts`, D80) with the Land Lease tables as a
 * `TableSpec` list (`LAND_LEASE_TABLES`), so the older Land Lease specs keep their functions and results. The technique is
 * unchanged: during a parity run the code app is served by `npm run dev`, so the code-app frame imports the app's OWN
 * modules (`/src/generated/services/…`, `/src/data/client.ts`); reads go through the app's real SDK connection as the
 * signed-in user and return RAW Dataverse values. Cleanup uses the app's `deleteRecord`, which surfaces a refused delete
 * (CONVENTIONS rule 14), never the generated `delete()`.
 *
 * Only rows whose Name carries this run's `PW-` tag are ever touched.
 */
import type { Page } from "@playwright/test";
import type { TableSpec } from "../harness/contract";
import { deleteRows, readByTag, readCreatedSince } from "../harness/data";

export interface LeaseRows { costs: Record<string, unknown>[]; periods: Record<string, unknown>[]; allocations: Record<string, unknown>[] }

/** The Land Lease tables: the contract header (tagged by its Name) and its periods and WTG allocations. Deleted allocations, periods, header. */
export const LAND_LEASE_TABLES: readonly TableSpec[] = [
  {
    name: "costs", service: "Vsb_landleaseprojectcostsService", serviceModule: "/src/generated/services/Vsb_landleaseprojectcostsService.ts",
    entitySet: "vsb_landleaseprojectcosts", primaryKey: "vsb_landleaseprojectcostid", tagColumn: "vsb_name", projectLookup: "_vsb_project_value",
    deleteOrder: 3,
  },
  {
    name: "periods", service: "Vsb_landleaseperiodsService", serviceModule: "/src/generated/services/Vsb_landleaseperiodsService.ts",
    entitySet: "vsb_landleaseperiods", primaryKey: "vsb_landleaseperiodid", parent: { table: "costs", lookup: "_vsb_projectcost_value" },
    deleteOrder: 2,
  },
  {
    name: "allocations", service: "Vsb_landleaseallocationwtgsService", serviceModule: "/src/generated/services/Vsb_landleaseallocationwtgsService.ts",
    entitySet: "vsb_landleaseallocationwtgs", primaryKey: "vsb_landleaseallocationwtgid", parent: { table: "costs", lookup: "_vsb_projectcost_value" },
    deleteOrder: 1,
  },
];

const asLease = (rows: Record<string, Record<string, unknown>[]>): LeaseRows => ({
  costs: rows.costs ?? [], periods: rows.periods ?? [], allocations: rows.allocations ?? [],
});

/** The header rows whose Name contains `tag`, with their periods and WTG allocations. */
export async function readLeaseByTag(page: Page, tag: string): Promise<LeaseRows> {
  return asLease(await readByTag(page, LAND_LEASE_TABLES, tag));
}

/** Deletes every row of this run's tag (allocations, periods, then the header) and returns what could NOT be deleted. */
export async function deleteLeaseByTag(page: Page, tag: string): Promise<string[]> {
  return deleteLeaseRows(page, await readLeaseByTag(page, tag));
}

/**
 * For rows a run creates WITHOUT its tag (the standard-contract import, F8, names its contracts after the assumptions): the
 * headers of this project created at or after `sinceIso`, optionally under one sub-account, with their periods and allocations.
 * Narrow on purpose — a cleanup built on this deletes only what this run itself created.
 */
export async function readLeaseCreatedSince(page: Page, projectId: string, sinceIso: string, subaccountId?: string): Promise<LeaseRows> {
  return asLease(await readCreatedSince(page, LAND_LEASE_TABLES, projectId, sinceIso, subaccountId ? { _vsb_subaccount_value: subaccountId } : {}));
}

/** Deletes the given rows (allocations, periods, then headers) through `deleteRecord`; returns what could NOT be deleted. */
export async function deleteLeaseRows(page: Page, rows: LeaseRows): Promise<string[]> {
  return deleteRows(page, LAND_LEASE_TABLES, { ...rows });
}

/** Keys that differ by nature between two runs (ids, audit stamps, annotations) and are left out of a comparison. */
const VOLATILE = /(^@|@|^_?(createdby|createdonbehalfby|modifiedby|modifiedonbehalfby|owninguser|owningteam|ownerid)(_value)?$|^(createdon|modifiedon|versionnumber|overriddencreatedon|importsequencenumber|timezoneruleversionnumber|utcconversiontimezonecode)$|id$|^_vsb_projectcost_value$)/;

/**
 * A row with its run tag replaced by `<tag>` and its volatile keys removed, keys sorted: what two apps must write the same.
 * The older Land Lease specs' form; the harness uses `harness/data.ts` `normaliseRows` (masks instead of removing).
 */
export function normalizeRow(row: Record<string, unknown>, tag: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(row).sort()) {
    if (VOLATILE.test(key)) continue;
    const v = row[key];
    out[key] = typeof v === "string" ? v.split(tag).join("<tag>") : v;
  }
  return out;
}
