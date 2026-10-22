/**
 * Application Settings › Milestones — Dataverse reads and writes.
 *
 * Replaces the canvas 'Admin Milestones Screen' data access:
 *
 *   countries (accordion sections)           → the shared `useActiveCountries` (`data/countries.ts`)
 *   per-country grid rows, one query PER ROW → `listMilestoneAssumptions`, ONE query
 *   panel snapshot + re-reads                → none: pure selectors over the assumptions cache
 *   ForAll(Patch) over every row of a country → `saveMilestonePatches`, changed rows only
 *
 * The screen has no create and no delete, and this module issues none.
 */
import { Vsb_milestonesstandardassumptionsesService } from "@/generated/services/Vsb_milestonesstandardassumptionsesService";
import type { Vsb_milestonesstandardassumptionses } from "@/generated/models/Vsb_milestonesstandardassumptionsesModel";
import { FIELD_COLUMNS, MILESTONE_FIELDS, type MilestoneField, type MsaNumericColumn } from "@/domain/milestones";
import { fetchAll, updateRecordIfExists } from "./client";
import { ACTIVE } from "./odata";
import { WRITE_CONCURRENCY, mapLimit } from "./concurrency";

/* ════════════════════════════════════════════════════════════════ contract ══ */

export const MSA_ENTITY_SET = "vsb_milestonesstandardassumptionses";
export const MSA_PRIMARY_KEY = "vsb_milestonesstandardassumptionsid";

/** The id, the kind discriminator, the two keys and the nine numeric columns. */
export const MSA_SELECT = [
  MSA_PRIMARY_KEY, "vsb_name", "_vsb_country_value", "vsb_technology",
  "vsb_cluster1", "vsb_cluster2", "vsb_cluster3", "vsb_cluster4", "vsb_cluster5",
  "vsb_finalinvestmentdecision", "vsb_operationallifetime", "vsb_salesstart", "vsb_salesduration",
];

/** An accordion section; built from the shared country read by `toMilestoneCountries`. */
export interface MilestoneCountry {
  id: string;
  name: string;
  /** `vsb_title` — the canvas "Key", sorted numerically. */
  key: string | undefined;
}

export interface MilestoneAssumption {
  id: string;
  /** The kind discriminator: "average duration [months]" or "success rate [-]". */
  name: string;
  countryId: string | undefined;
  technology: number | undefined;
  values: Record<MilestoneField, number | undefined>;
}

/** One row's changed columns. `label` names the row (technology + kind) for save messages. */
export interface MilestonePatch {
  id: string;
  changes: Partial<Record<MsaNumericColumn, number>>;
  label: string;
}

export interface MilestoneSaveOutcome {
  saved: MilestonePatch[];
  failed: { patch: MilestonePatch; error: unknown }[];
}

/* ═══════════════════════════════════════════════════════════════════ reads ══ */

/** Only the selected columns are present at runtime, whatever the generated type claims. */
type RawAssumption = Pick<Vsb_milestonesstandardassumptionses, "vsb_milestonesstandardassumptionsid">
  & Partial<Vsb_milestonesstandardassumptionses>;

const num = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;

/**
 * As ONE query for every country (the canvas sent one per gallery row). Ordered
 * by `createdon` then id so "the first row of a kind" (duplicate handling) is stable.
 */
export async function listMilestoneAssumptions(): Promise<MilestoneAssumption[]> {
  const rows: RawAssumption[] = await fetchAll(
    "list milestone standard assumptions",
    (o) => Vsb_milestonesstandardassumptionsesService.getAll(o),
    {
      select: MSA_SELECT,
      filter: ACTIVE,
      orderBy: ["createdon asc", `${MSA_PRIMARY_KEY} asc`],
    },
  );
  return rows.map(toAssumption);
}

function toAssumption(r: RawAssumption): MilestoneAssumption {
  const values = {} as Record<MilestoneField, number | undefined>;
  for (const field of MILESTONE_FIELDS) values[field] = num(r[FIELD_COLUMNS[field]]);
  return {
    id: r.vsb_milestonesstandardassumptionsid,
    name: r.vsb_name ?? "",
    countryId: r._vsb_country_value ?? undefined,
    technology: num(r.vsb_technology),
    values,
  };
}

/* ══════════════════════════════════════════════════════════════════ writes ══ */

/**
 * Changed rows and changed columns only.
 *
 * Every changed row is its own guarded update (`updateRecordIfExists`), `WRITE_CONCURRENCY` wide,
 * every row attempted and its failure collected. (Master has no bulk services, so
 * the per-row path is the only one.) The canvas save was a sequential, non-transactional
 * `ForAll(Patch)` whose successful rows stayed written, so this keeps canvas parity for the rows
 * that are fine AND tells the user exactly which rows failed. No
 * `If-Match` on the version: last write wins.
 *
 * Never throws for a refused row: the outcome lists saved and failed rows, so the caller can
 * invalidate when something was written and still report what was not.
 */
export async function saveMilestonePatches(
  patches: readonly MilestonePatch[],
): Promise<MilestoneSaveOutcome> {
  const real = patches.filter((p) => Object.keys(p.changes).length > 0);
  if (real.length === 0) return { saved: [], failed: [] };

  // a plain PATCH would UPSERT (recreate) a deleted row. The guarded update reads the
  // row first; a deleted row comes back as a failed row (`RecordGoneError`) with nothing sent.
  const outcomes = await mapLimit(real, async (patch) => {
    try {
      await updateRecordIfExists(`save milestone assumptions (${patch.label})`, MSA_ENTITY_SET, patch.id, patch.changes, {
        primaryKey: MSA_PRIMARY_KEY,
      });
      return { patch, error: undefined as unknown, ok: true as const };
    } catch (error) {
      return { patch, error, ok: false as const };
    }
  }, WRITE_CONCURRENCY);

  return {
    saved: outcomes.filter((o) => o.ok).map((o) => o.patch),
    failed: outcomes.filter((o) => !o.ok).map((o) => ({ patch: o.patch, error: o.error })),
  };
}
