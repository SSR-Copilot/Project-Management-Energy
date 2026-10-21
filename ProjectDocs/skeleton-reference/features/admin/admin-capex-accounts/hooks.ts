/**
 * Admin CAPEX Accounts — queries, privileges and mutations.
 *
 * Canvas screen: `Admin CAPEX Accounts` (PM app)
 *   90 controls · 2 241 lines of Power Fx · 26 substantive blocks · band M
 *
 * The canvas built `colCapexAccounts`, `colCapexAccountCategories` and
 * `colCapexProjectContracts` in `App.OnStart` and never refreshed them, so this screen
 * showed stale data until the app restarted. One key, `['capexTree']`, invalidated by this
 * screen's own mutations, replaces all three.
 */
import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  capexAccountListRepo, adminCapexCostRepo, adminCapexProjectContractRepo,
} from "@/data/repos";
import { dataClient } from "@/platform/dataClient";
import { f, asc } from "@/platform/odata";
import { toAppError, ok, err, type Result } from "@/platform/errors";
import { trace } from "@/platform/telemetry";
import { useAppStore } from "@/store/appStore";
import { privileges } from "@/platform/privileges";
import { ES_ADMIN } from "@/data/entities";
import {
  CAPEX_ACCOUNT_COL, CAPEX_COST_COL, CAPEX_CONTRACT_COL, costCascadeWindow,
  buildAccountTree, numberExists,
  type CapexAccount, type CapexContractRef, type CapexCostRow, type Privileges,
  type WritePlan,
} from "./rules";

const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const num = (v: unknown, d = 0): number => (typeof v === "number" ? v : d);

/* ══════════════════════════════════════════════════════════════════ mapping ════ */

export const toCapexAccount = (r: Record<string, unknown>): CapexAccount => ({
  id: String(r[CAPEX_ACCOUNT_COL.id] ?? ""),
  name: String(r[CAPEX_ACCOUNT_COL.name] ?? ""),
  number: String(r[CAPEX_ACCOUNT_COL.number] ?? ""),
  order: num(r[CAPEX_ACCOUNT_COL.order]),
  parentId: str(r[CAPEX_ACCOUNT_COL.parentAccount]),
  status: num(r[CAPEX_ACCOUNT_COL.statecode]),
  owningBusinessUnitId: str(r[CAPEX_ACCOUNT_COL.owningBusinessUnit]),
});

export const toCapexCostRow = (r: Record<string, unknown>): CapexCostRow => ({
  id: String(r[CAPEX_COST_COL.id] ?? ""),
  contractId: str(r[CAPEX_COST_COL.contract]),
  year: num(r[CAPEX_COST_COL.year]),
  month: num(r[CAPEX_COST_COL.month]),
  cost: typeof r[CAPEX_COST_COL.cost] === "number" ? (r[CAPEX_COST_COL.cost] as number) : null,
});

export const toContractRef = (r: Record<string, unknown>): CapexContractRef => ({
  id: String(r[CAPEX_CONTRACT_COL.id] ?? ""),
  accountId: str(r[CAPEX_CONTRACT_COL.account]),
});

/* ══════════════════════════════════════════════════════════════════ query keys ════ */

export const capexKeys = {
  tree: ["capexTree"] as const,
  contracts: ["capexContracts"] as const,
  costs: (contractIds: string[]) => ["capexCosts", contractIds.join(",")] as const,
  privileges: ["privileges", "vsb_capexaccountlist"] as const,
} as const;

/* ═════════════════════════════════════════════════════════════════════ queries ════ */

/** The whole account table, once, ordered — the tree is derived client-side from it. */
export function useCapexTree() {
  const q = useQuery({
    queryKey: capexKeys.tree,
    staleTime: 10 * 60 * 1000,
    queryFn: async () =>
      (await capexAccountListRepo.listAll({ orderBy: [asc(CAPEX_ACCOUNT_COL.order)] }))
        .map(toCapexAccount),
  });
  /*
   * `q.data` directly, not `q.data ?? []`.
   *
   * The `?? []` allocated a NEW empty array on every render while the query was pending or
   * errored, so the memo below it re-ran every render and handed its consumers a new object
   * each time. TanStack Query keeps `q.data` referentially stable between fetches, so
   * depending on it and defaulting INSIDE the callback gives the memo a stable dependency.
   */
  const accounts = useMemo(() => q.data ?? [], [q.data]);
  return {
    accounts,
    tree: useMemo(() => buildAccountTree(accounts), [accounts]),
    isLoading: q.isLoading,
    isError: q.isError,
  };
}

export function useCapexContracts() {
  const q = useQuery({
    queryKey: capexKeys.contracts,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => (await adminCapexProjectContractRepo.listAll()).map(toContractRef),
  });
  return { contracts: q.data ?? [], isLoading: q.isLoading };
}

/**
 * The cascade's candidate rows, fetched with the WINDOW already in `$filter` — the canvas
 * pulled every `CAPEX Costs` row for the contracts and filtered client-side.
 */
export async function listCascadeCosts(
  contractIds: string[],
  today: Date,
): Promise<CapexCostRow[]> {
  if (contractIds.length === 0) return [];
  const w = costCascadeWindow(today);
  const inWindow = f.or(
    f.gt(CAPEX_COST_COL.year, w.deleteYearsAfter),
    f.and(
      f.eq(CAPEX_COST_COL.year, w.zeroYear),
      f.gt(CAPEX_COST_COL.month, w.zeroMonthExclusive),
    ),
  );
  const rows = await adminCapexCostRepo.listAll({
    filter: f.and(f.inList(CAPEX_COST_COL.contract, contractIds), inWindow),
  });
  return rows.map(toCapexCostRow);
}

/**
 * Table privileges from the platform, never re-derived from a role name.
 *
 * `DataSourceInfo('CAPEX Account Lists', DataSourceInfo.CreatePermission)` and its two
 * siblings, which is what the canvas command bar branches on. `platform/privileges` answers
 * from the caller's effective privileges in `power` mode and from `security/matrix.json` in
 * `mock` mode, so the same UI paths are exercised either way.
 *
 * WHAT THIS REPLACED, and why it mattered. The previous body read
 * `user.isApplicationAdministrator || user.isControllerOwnData` — privileges derived from
 * ROLE NAMES, which `CONVENTIONS.md` rule 4 forbids and which this file's own header claimed
 * not to do. It was wrong in both directions: a sixth role with the right privileges saw
 * nothing, and a renamed fifth role silently lost the UI. Delete is not special-cased here
 * any more either; `matrix.json` grants Delete on master data to the administrator alone, so
 * the platform's answer carries that intent instead of this function restating it.
 */
export function useCapexPrivileges(): Privileges {
  // The session's privilege set is read once at bootstrap and does not change mid-session,
  // so this needs no dependency beyond the user identity that established it.
  const user = useAppStore((s) => s.session.user);
  return useMemo(() => {
    /*
     * `user` is the CACHE KEY, not an input. `privileges.forTable` answers from the
     * session-scoped cache `platform/bootstrap` filled for this user, so the memo has to
     * recompute when the identity changes and never otherwise. Referencing it explicitly
     * keeps that intent visible to the exhaustive-deps rule and to the next reader.
     */
    void user;
    const p = privileges.forTable(ES_ADMIN.capexAccountLists);
    return { canCreate: p.canCreate, canWrite: p.canWrite, canDelete: p.canDelete };
  }, [user]);
}

/** Rule 8's pre-flight check, server-side: a `$filter` count, not a client `LookUp`. */
export async function existsByNumber(number: string): Promise<boolean> {
  const page = await capexAccountListRepo.list({
    select: [CAPEX_ACCOUNT_COL.id],
    filter: f.eq(CAPEX_ACCOUNT_COL.number, number.trim()),
    top: 1,
  });
  return page.rows.length > 0;
}

/** The client-side mirror, for when the tree is already loaded. */
export const numberTaken = numberExists;

/* ═══════════════════════════════════════════════════════════════════ mutations ════ */

export async function runPlan(plan: WritePlan, source: string): Promise<Result<number>> {
  if (plan.refusedReason) {
    return err(toAppError({ status: 403, message: plan.refusedReason }, source));
  }
  if (plan.writes.length === 0) return ok(0);
  try {
    trace("information", source, { writes: plan.writes.length, log: plan.log });
    await dataClient.batch(plan.writes.map((w) => ({
      op: w.op, entitySet: w.entitySet, id: w.id, data: w.data,
    })));
    return ok(plan.writes.length);
  } catch (e) {
    const appError = toAppError(e, source);
    trace("error", source, { status: appError.status, message: appError.message });
    return err(appError);
  }
}

export function useRunCapexPlan(source: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (plan: WritePlan) => {
      const res = await runPlan(plan, source);
      if (!res.ok) throw res.error;
      return res.value;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: capexKeys.tree });
      void qc.invalidateQueries({ queryKey: capexKeys.contracts });
    },
  });
}
