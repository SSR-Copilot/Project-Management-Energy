/**
 * Admin CAPEX Accounts — the data layer (connected 19 Oct 2026, decision D19).
 *
 * Canvas screen: `Admin CAPEX Accounts` (PM app). All three tables are registered in
 * `power.config.json` with generated services; the reads live in `data/adminCapexAccounts.ts`.
 *
 *   useCapexTree()        `vsb_capexaccountlists` — every row, any status, ordered by `vsb_order`.
 *   useCapexContracts()   `vsb_capexprojectcontracts` — id + account, for the delete gates.
 *   useCapexPrivileges()  `platform/privileges.ts` `serverEnforcedProvider`: every command is
 *                         offered, Dataverse decides, and a refusal becomes a message
 *                         (`permissionMessage`). The SDK has no `DataSourceInfo` equivalent.
 *   useCapexWrites()      runs one `WritePlan` from `rules.ts` through `data/executePlan.ts`, in
 *                         order, then refreshes the admin tree AND the cost screens' cached chart
 *                         (`qk.capexAccounts`), so neither shows a stale account list.
 *
 * Two plans need a read first, and both are built here:
 *   - a create re-checks the number on the SERVER (`capexNumberExists`) before writing;
 *   - a deactivation reads the forecast costs in the cascade window (`listCascadeCosts`).
 * No flow or plugin fires on these tables (04-flow-inventory.md, verified 19 Oct 2026).
 */
import { useQuery } from "@tanstack/react-query";
import { ES, ES_ADMIN } from "@/data/dataverseNames";
import { qk } from "@/data/keys";
import type { ScreenData } from "@/data/notConnected";
import { usePlanWrite } from "@/data/usePlanWrite";
import {
  capexNumberExists, listAllCapexAccounts, listCapexContractRefs, listCascadeCosts,
} from "@/data/adminCapexAccounts";
import { serverEnforcedProvider } from "@/platform/privileges";
import {
  MSG, composeSubaccountNumber, costCascadeWindow, planDeactivateAccount, planSaveAccount,
  type CapexAccount, type CapexContractRef, type DeactivateArgs, type Privileges, type WritePlan,
} from "./rules";

/** Entity sets this screen reads and writes. */
export const TABLES: readonly string[] = [
  ES_ADMIN.capexAccountLists,
  ES.capexProjectContracts,
  ES_ADMIN.capexCosts,
];

const NO_ACCOUNTS: CapexAccount[] = [];
const NO_CONTRACTS: CapexContractRef[] = [];
/** Master data maintained here; refetched after every write anyway. */
const STALE_MS = 5 * 60 * 1000;

/** The whole `CAPEX Account Lists` table, ordered by `Order`. */
export function useCapexTree(): ScreenData<CapexAccount[]> {
  const q = useQuery({ queryKey: qk.adminCapexAccounts, queryFn: listAllCapexAccounts, staleTime: STALE_MS });
  return { data: q.data ?? NO_ACCOUNTS, isLoading: q.isLoading, error: q.error ?? undefined, connected: true };
}

/** `CAPEX Project Contracts` — only the id and the account each one references. */
export function useCapexContracts(): ScreenData<CapexContractRef[]> {
  const q = useQuery({ queryKey: qk.adminCapexContractRefs, queryFn: listCapexContractRefs, staleTime: STALE_MS });
  return { data: q.data ?? NO_CONTRACTS, isLoading: q.isLoading, error: q.error ?? undefined, connected: true };
}

/** Table privileges — server-enforced (see the header). */
export function useCapexPrivileges(): ScreenData<Privileges> {
  const p = serverEnforcedProvider.forTable(ES_ADMIN.capexAccountLists);
  return {
    data: { canCreate: p.canCreate, canWrite: p.canWrite, canDelete: p.canDelete },
    isLoading: false, error: undefined, connected: true,
  };
}

/** Runs write plans; refreshes the admin tree, the contract refs, and the cost screens' chart. */
export function useCapexWrites() {
  return usePlanWrite({
    invalidate: [qk.adminCapexAccounts, qk.adminCapexContractRefs, qk.capexAccounts],
    action: "change CAPEX accounts",
  });
}

/**
 * The save plan, with the canvas uniqueness test asked of the server just before a create
 * (`LookUp('CAPEX Account Lists', Number = …)`), so a number someone else added meanwhile is
 * still refused.
 */
export async function checkedSavePlan(
  form: Parameters<typeof planSaveAccount>[0],
  opts: Parameters<typeof planSaveAccount>[1],
): Promise<WritePlan> {
  const plan = planSaveAccount(form, opts);
  if (plan.refusedReason || opts.isEdit) return plan;
  const number = opts.isSubaccount && opts.parent
    ? composeSubaccountNumber(opts.parent.number, form.number)
    : form.number.trim();
  if (await capexNumberExists(number)) {
    return { writes: [], log: [], refusedReason: opts.isSubaccount ? MSG.duplicateSubaccount : MSG.duplicateAccount };
  }
  return plan;
}

/** The deactivation cascade: reads the forecast costs in the window, then builds the plan. */
export async function cascadeDeactivatePlan(args: Omit<DeactivateArgs, "costs">): Promise<WritePlan> {
  const affected = new Set([args.account.id, ...args.subaccounts.map((s) => s.id)]);
  const contractIds = args.contracts
    .filter((c) => c.accountId !== null && affected.has(c.accountId))
    .map((c) => c.id);
  const costs = await listCascadeCosts(contractIds, costCascadeWindow(args.today));
  return planDeactivateAccount({ ...args, costs });
}
