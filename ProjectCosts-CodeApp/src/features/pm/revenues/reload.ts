/**
 * What the Revenue screen refreshes after a write (D136).
 *
 * Before, every Save or Delete re-read everything under `["pmRevenues", projectId]`: the project and its project
 * states, the contracts, the balancing prices and the energy-yield check, and the spinner waited for all of them. The
 * screen writes none of the project, state or energy-yield data, so those reads could not return anything new. A job
 * now names only the data its own writes can change (`PlanJob.invalidate`, which `usePlanWrite` already honours):
 *
 *  - a contract Save / Delete changes `vsb_projectrevenues` and `vsb_revenueindividualhedgevolumes`;
 *  - a balancing Save / Delete changes `vsb_balancingprices`. It must still reload: the "Balancing-price period date
 *    sync" plugin computes each period's start and end date on the server, and the Save writes neither
 *    (`ProjectDocs/migration-plans/04-flow-inventory.md`).
 *
 * The volumes key stays in the contract list on purpose: the stored volumes of a contract are cached under it, and a
 * reopened contract must not show the rows a Save has just replaced (an inactive query is only marked stale).
 * Window focus still refetches the rest after 30 s (`app/Providers.tsx`), so another user's change is still picked up.
 */
import type { QueryKey } from "@tanstack/react-query";
import { qk } from "@/data/keys";

export type RevenueWriteKind = "contract" | "balancing";

export function revenueReloadKeys(projectId: string | undefined, kind: RevenueWriteKind): readonly QueryKey[] {
  const id = projectId ?? "";
  return kind === "contract"
    ? [qk.revenues(id, "contracts"), qk.revenues(id, "volumes")]
    : [qk.revenues(id, "balancing")];
}
