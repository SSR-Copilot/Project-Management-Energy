/**
 * Rollout switches of the Generators bulk programme (ProjectDocs/app-docs/GENERATORS-BULK-IMPLEMENTATION-PLAN.md).
 *
 * EVERY flag starts `false` and becomes `true` only AFTER its own check on DEV has passed (the
 * live probe of that write path against VSBCloud_Dev, run by a person with a signed-in browser).
 * Flipping one is a deliberate one-line change in its own commit, with the DEV result recorded in
 * `ProjectDocs/app-docs/02-OPEN-DECISIONS.md`; it is the rollback as well (set it back to `false`).
 * Treat each like `BULK_SAVE` or `CANVAS_PARITY_DELETION`: a live product decision, not dead code.
 *
 * The names and the shape are a contract other work packages import; do not rename or reshape.
 *  - `allocations`: Land Lease allocation rows through `createMany` / `updateMany`.
 *  - `status`: the Generators status writes.
 *  - `applyAll`: the "apply to all" writes of the Generators screen.
 *  - `turbines`: turbine (generator in project) creates and updates.
 *  - `replace`: replacing generators of a project in one pass.
 *  - `createRollback`: removing the rows a failed bulk create left behind.
 */
export const GENERATORS_BULK = {
  allocations: false,
  status: false,
  applyAll: false,
  turbines: false,
  replace: false,
  createRollback: false,
} as const;
