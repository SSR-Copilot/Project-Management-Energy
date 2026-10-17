/**
 * `vsb_milestonesstandardassumptions.vsb_name` values that classify a row (M13 / R8).
 *
 * The table holds two kinds of row per country × technology with the same numeric columns
 * meaning entirely different things (17 months vs 0.2 probability), told apart only by
 * `vsb_name`, matched exactly. Shared by the project cost book (`data/costBook.ts`
 * `loadMilestoneDurations`) and the Milestones settings screen (`milestones/constants.ts`
 * `MSA_KIND`, which adopts this in batch 2b), so the two can never drift.
 */
export const MILESTONE_ASSUMPTION_KIND = {
  months: "average duration [months]",
  successRate: "success rate [-]",
} as const;
