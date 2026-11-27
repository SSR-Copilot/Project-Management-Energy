/**
 * The ONE shared `'Project States'` read (D159) and the row it returns.
 *
 * Its own small module (BND-06, T-E01): it used to live in `data/generalData.ts`, so every screen that used the shared list
 * (the landing, the Cost screens, the admin gate screens) also downloaded General Data's rules and nine generated services.
 * The cache entry, its key and its freshness are in `data/projectStates.ts`; this module is only the read, so a test can
 * stub the read without stubbing the query options that wrap it.
 */
import { Vsb_projectstatesService } from "@/generated/services/Vsb_projectstatesService";
import type { ProjectStateRef } from "@/features/pm/general-data/rules";
import { fetchAll } from "./client";

/**
 * A `'Project States'` row as the ONE shared read returns it (D159). The first five fields are what General Data, the
 * Check List, Revenues and Milestones always used. `active` (statecode 0), `orderRaw` (null when the row has no `Order`) and
 * `businessUnitId` are what Project Overview, the Cost screens and the Admin gate screen each used to read through their own
 * query: they now take their own view of this one list (`data/projectStates.ts`) instead of reading the table again.
 */
export interface SharedProjectState extends ProjectStateRef {
  active: boolean;
  orderRaw: number | null;
  businessUnitId: string | null;
}

/** `'Project States'` — the panel labels and the tracking rebuild (Y:223-235, Y:5253), and (D159) every other screen's states. */
export async function listProjectStates(): Promise<SharedProjectState[]> {
  const rows = await fetchAll(
    "list project states",
    (o) => Vsb_projectstatesService.getAll(o),
    {
      select: [
        "vsb_projectstateid", "vsb_name", "vsb_order", "vsb_isvisibleonchecklist", "vsb_clusterdescription",
        "statecode", "_owningbusinessunit_value",
      ],
    },
  );
  return rows
    .map((r) => ({
      id: r.vsb_projectstateid,
      name: r.vsb_name ?? "",
      order: typeof r.vsb_order === "number" ? r.vsb_order : 0,
      isVisibleOnChecklist: r.vsb_isvisibleonchecklist === true,
      clusterDescription: r.vsb_clusterdescription ?? null,
      active: r.statecode === 0,
      orderRaw: typeof r.vsb_order === "number" ? r.vsb_order : null,
      businessUnitId: r._owningbusinessunit_value ?? null,
    }))
    .sort((a, b) => a.order - b.order);
}
