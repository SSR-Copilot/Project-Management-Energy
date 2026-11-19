/**
 * D138 (B1): the switch for the Cluster Check List's bulk create. OFF = the plan is exactly what it was (one create per
 * template, eight in flight at a time); ON = one `CreateMultiple` step for the cluster's templates (`data/checklistBulk.ts`).
 * Kept apart from `generatorsBulkFlags.ts` (whose keys must not change) and treated like `CANVAS_PARITY_DELETION`: a live product
 * decision, not dead code (CONVENTIONS rule 15). Ships OFF until the DEV test of D138 has been run.
 */
export const CHECKLIST_BULK = Object.freeze({
  /** First visit to a cluster: copy the default templates as ONE bulk create instead of N single creates. */
  materialise: false,
} as const);
