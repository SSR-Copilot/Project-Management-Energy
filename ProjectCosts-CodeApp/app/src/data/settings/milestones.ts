/**
 * Application Settings › Milestones — Dataverse reads and writes.
 *
 * Replaces the canvas 'Admin Milestones Screen' data access
 * (`codeapp-knowledge-base/screens/application-settings/milestones/04-data/02-operations-performed.md`):
 *
 *   R-1  countries (accordion sections)            → the shared `useActiveCountries` (`data/countries.ts`, M6)
 *   R-2  per-country grid rows, one query PER ROW  → `listMilestoneAssumptions`, ONE query (DR-2)
 *   R-4/R-5 panel snapshot + re-reads              → none: pure selectors over the R-2 cache
 *   W-1  ForAll(Patch) over every row of a country → `saveMilestonePatches`, changed rows only (DR-4)
 *
 * The screen has no create and no delete, and this module issues none.
 */
import { Vsb_milestonesstandardassumptionsesService } from "@/generated/services/Vsb_milestonesstandardassumptionsesService";
import type { Vsb_milestonesstandardassumptionses } from "@/generated/models/Vsb_milestonesstandardassumptionsesModel";
import { fetchAll, updateRecordIfExists } from "../client";
import { ACTIVE } from "../odata";
import { bulkWithFallback, updateMultiple } from "../bulkWrite";

/* ════════════════════════════════════════════════════════════════ contract ══ */

export const MSA_ENTITY_SET = "vsb_milestonesstandardassumptionses";
/** `@odata.type` suffix for `UpdateMultiple` targets (logical name, singular). */
export const MSA_ODATA_TYPE = "vsb_milestonesstandardassumptions";
export const MSA_PRIMARY_KEY = "vsb_milestonesstandardassumptionsid";

/** DR-2 — the id, the kind discriminator, the two keys and the nine numeric columns. */
export const MSA_SELECT = [
  MSA_PRIMARY_KEY, "vsb_name", "_vsb_country_value", "vsb_technology",
  "vsb_cluster1", "vsb_cluster2", "vsb_cluster3", "vsb_cluster4", "vsb_cluster5",
  "vsb_finalinvestmentdecision", "vsb_operationallifetime", "vsb_salesstart", "vsb_salesduration",
];

/** The nine editable/displayed values, in the panel's row order (AMS:1183-1308). */
export type MilestoneField =
  | "cluster1" | "cluster2" | "cluster3" | "cluster4"
  | "fid" | "cluster5" | "operationalLifetime" | "salesStart" | "salesEnd";

export const MILESTONE_FIELDS: readonly MilestoneField[] = [
  "cluster1", "cluster2", "cluster3", "cluster4",
  "fid", "cluster5", "operationalLifetime", "salesStart", "salesEnd",
];

type MsaNumericColumn =
  | "vsb_cluster1" | "vsb_cluster2" | "vsb_cluster3" | "vsb_cluster4" | "vsb_cluster5"
  | "vsb_finalinvestmentdecision" | "vsb_operationallifetime" | "vsb_salesstart"
  | "vsb_salesduration";

/**
 * DR-4 column map. "Sales End" is the display name of `vsb_salesduration` (CX:80774); the canvas
 * also called it "Sales Duration" (grid entry, AMS:524) and "Sales Completion" (edit key,
 * AMS:1861). There is no `vsb_salesend` column (D-DATA-2).
 */
export const FIELD_COLUMNS: Record<MilestoneField, MsaNumericColumn> = {
  cluster1: "vsb_cluster1",
  cluster2: "vsb_cluster2",
  cluster3: "vsb_cluster3",
  cluster4: "vsb_cluster4",
  cluster5: "vsb_cluster5",
  fid: "vsb_finalinvestmentdecision",
  operationalLifetime: "vsb_operationallifetime",
  salesStart: "vsb_salesstart",
  salesEnd: "vsb_salesduration",
};

/** An accordion section; built from the shared country read by `toMilestoneCountries`. */
export interface MilestoneCountry {
  id: string;
  name: string;
  /** `vsb_title` — the canvas "Key", sorted numerically (FR-2). */
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
 * R-2 as ONE query for every country (the canvas sent one per gallery row, D-PERF-1). Ordered
 * by `createdon` then id so "the first row of a kind" (DR-3 duplicate handling) is stable.
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
 * W-1, changed rows and changed columns only.
 *
 * First choice is ONE `UpdateMultiple` request (all targets exist, so the id is known). On a
 * standard table that request is all-or-nothing, and its error cannot say WHICH row Dataverse
 * refused. Because the canvas save was a sequential, non-transactional `ForAll(Patch)` whose
 * successful rows stayed written, the fallback re-sends each row on its own (shared
 * `bulkWithFallback`, `WRITE_CONCURRENCY` wide, every result through `unwrap`). That keeps
 * canvas parity for the rows that are fine AND tells the user exactly which rows failed
 * (FR-8 step 4, D-SAVE-2). No `If-Match` on the version: last write wins (DR-5, D-SAVE-4).
 *
 * Never throws for a refused row: the outcome lists saved and failed rows, so the caller can
 * invalidate when something was written and still report what was not.
 */
export async function saveMilestonePatches(
  patches: readonly MilestonePatch[],
): Promise<MilestoneSaveOutcome> {
  const real = patches.filter((p) => Object.keys(p.changes).length > 0);
  if (real.length === 0) return { saved: [], failed: [] };

  // Shared E15: bulk first; ANY bulk error (already logged by `bulkWrite`) falls back to per-row
  // writes, `WRITE_CONCURRENCY` wide, every row attempted and its failure collected.
  const outcome = await bulkWithFallback<MilestonePatch>({
    rows: real,
    bulk: (rows) => updateMultiple(
      MSA_ENTITY_SET,
      MSA_ODATA_TYPE,
      rows.map((p) => ({ [MSA_PRIMARY_KEY]: p.id, ...p.changes })),
    ),
    // V-1 (S5): a missing id is exactly what fails `UpdateMultiple`, and a plain PATCH would
    // then UPSERT (recreate) it. The guarded update reads the row first; a deleted row comes
    // back as a failed row (`RecordGoneError`) with nothing sent.
    perRow: async (patch) => {
      await updateRecordIfExists(`save milestone assumptions (${patch.label})`, MSA_ENTITY_SET, patch.id, patch.changes, {
        primaryKey: MSA_PRIMARY_KEY,
      });
    },
    fallback: () => true,
  });

  return {
    saved: outcome.saved,
    failed: outcome.failed.map((f) => ({ patch: f.row, error: f.error })),
  };
}
