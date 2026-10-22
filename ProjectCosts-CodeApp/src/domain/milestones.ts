/**
 * `vsb_milestonesstandardassumptions.vsb_name` values that classify a row.
 *
 * The table holds two kinds of row per country × technology with the same numeric columns
 * meaning entirely different things (17 months vs 0.2 probability), told apart only by
 * `vsb_name`, matched exactly. Shared by the project cost book (`data/costBook.ts`
 * `loadMilestoneDurations`) and the Milestones settings screen (`milestones/constants.ts`
 * `MSA_KIND`, which adopts this), so the two can never drift.
 */
export const MILESTONE_ASSUMPTION_KIND = {
  months: "average duration [months]",
  successRate: "success rate [-]",
} as const;

/** The nine editable/displayed values of a Milestones settings row, in the panel's row order (AMS:1183-1308). */
export type MilestoneField =
  | "cluster1" | "cluster2" | "cluster3" | "cluster4"
  | "fid" | "cluster5" | "operationalLifetime" | "salesStart" | "salesEnd";

export const MILESTONE_FIELDS: readonly MilestoneField[] = [
  "cluster1", "cluster2", "cluster3", "cluster4",
  "fid", "cluster5", "operationalLifetime", "salesStart", "salesEnd",
];

export type MsaNumericColumn =
  | "vsb_cluster1" | "vsb_cluster2" | "vsb_cluster3" | "vsb_cluster4" | "vsb_cluster5"
  | "vsb_finalinvestmentdecision" | "vsb_operationallifetime" | "vsb_salesstart"
  | "vsb_salesduration";

/**
 * Column map. "Sales End" is the display name of `vsb_salesduration` (CX:80774); the canvas
 * also called it "Sales Duration" (grid entry, AMS:524) and "Sales Completion" (edit key,
 * AMS:1861). There is no `vsb_salesend` column.
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
