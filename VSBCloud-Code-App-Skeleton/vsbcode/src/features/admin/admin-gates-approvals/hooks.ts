/**
 * Admin Project Gates Approvals Screen — queries and mutations.
 *
 * Canvas screen: `Admin Project Gates Approvals Screen` (PM app)
 *   114 controls · 3 305 lines of Power Fx · 41 substantive blocks · band M
 *
 * The canvas galleries `Filter` both approval tables CLIENT-SIDE after an `AddColumns`;
 * every filter here is a server-side `$filter` on the lookup navigation properties, and
 * the checklist sub-gallery is ordered by the parent template's `Order` server-side.
 */
import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  countryRepo, projectStateRepo, checklistCountryTechRepo, adminDefaultChecklistRepo,
  adminProjectDefaultApprovalRepo, adminCheckListDefaultApprovalRepo, adminEntraIdRepo,
} from "@/data/repos";
import { dataClient } from "@/platform/dataClient";
import { f, asc } from "@/platform/odata";
import { toAppError, ok, err, type Result } from "@/platform/errors";
import { trace } from "@/platform/telemetry";
import {
  GATE_APPROVAL_COL, CHECKLIST_APPROVAL_COL, ENTRA_COL, entraSearchFilter,
  shouldSearchPeople, technologyValue,
  type GateState, type GateApproval, type ChecklistApproval, type ChecklistItem,
  type Persona, type Scope, type WritePlan, type CountryRef,
} from "./rules";

const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" ? v : null);

/* ══════════════════════════════════════════════════════════════════ mapping ════ */

export const toGateState = (r: Record<string, unknown>): GateState => ({
  id: String(r["vsb_projectstateid"] ?? ""),
  name: String(r["vsb_name"] ?? ""),
  order: num(r["vsb_order"]) ?? 0,
  isVisibleOnChecklist: r["vsb_isvisibleonchecklist"] === true,
  owningBusinessUnitId: str(r["_owningbusinessunit_value"]),
});

export const toGateApproval = (r: Record<string, unknown>): GateApproval => ({
  id: String(r[GATE_APPROVAL_COL.id] ?? ""),
  name: str(r[GATE_APPROVAL_COL.name]),
  approvalMode: num(r[GATE_APPROVAL_COL.approvalMode]),
  gateActive: r[GATE_APPROVAL_COL.gateActive] === true,
  clusterStateId: str(r[GATE_APPROVAL_COL.clusterState]),
  countryId: str(r[GATE_APPROVAL_COL.country]),
  technology: num(r[GATE_APPROVAL_COL.technology]),
  portfolioManagerId: str(r[GATE_APPROVAL_COL.portfolioManager]),
  defaultApprovals: str(r[GATE_APPROVAL_COL.defaultApprovals]),
  defaultContributors: str(r[GATE_APPROVAL_COL.defaultContributors]),
  defaultNotifications: str(r[GATE_APPROVAL_COL.defaultNotifications]),
});

export const toChecklistApproval = (r: Record<string, unknown>): ChecklistApproval => ({
  id: String(r[CHECKLIST_APPROVAL_COL.id] ?? ""),
  name: str(r[CHECKLIST_APPROVAL_COL.name]),
  approvalMode: num(r[CHECKLIST_APPROVAL_COL.approvalMode]),
  gateActive: r[CHECKLIST_APPROVAL_COL.gateActive] === true,
  projectDefaultChecklistId: str(r[CHECKLIST_APPROVAL_COL.projectDefaultChecklist]),
  portfolioManagerId: str(r[CHECKLIST_APPROVAL_COL.portfolioManager]),
  defaultApprovers: str(r[CHECKLIST_APPROVAL_COL.defaultApprovers]),
  defaultContributors: str(r[CHECKLIST_APPROVAL_COL.defaultContributors]),
  defaultNotifications: str(r[CHECKLIST_APPROVAL_COL.defaultNotifications]),
});

export const toChecklistItem = (r: Record<string, unknown>): ChecklistItem => ({
  id: String(r["vsb_projectdefaultchecklistid"] ?? ""),
  name: String(r["vsb_name"] ?? ""),
  order: num(r["vsb_order"]) ?? 0,
  countryTechId: str(r["_vsb_associatedcountryandtechnology_value"]),
  clusterStateId: str(r["_vsb_clusterstate_value"]),
});

export const toPersonaFromEntra = (r: Record<string, unknown>): Persona => ({
  id: String(r[ENTRA_COL.uniqueId] ?? r[ENTRA_COL.id] ?? ""),
  displayName: String(r[ENTRA_COL.displayName] ?? ""),
  mail: String(r[ENTRA_COL.mail] ?? ""),
});

/* ══════════════════════════════════════════════════════════════════ query keys ════ */

const scopeKey = (s: Scope) => `${s.country?.id ?? "none"}:${s.technology ?? "none"}`;

export const adminGateKeys = {
  countries: ["admin", "countries"] as const,
  states: ["admin", "projectStates"] as const,
  scopes: ["admin", "checklistScopes"] as const,
  approvals: (s: Scope) => ["admin", "gateApprovals", scopeKey(s)] as const,
  checklistItems: (s: Scope) => ["admin", "checklistItems", scopeKey(s)] as const,
  checklistApprovals: (s: Scope) => ["admin", "checklistApprovals", scopeKey(s)] as const,
  people: (term: string) => ["admin", "entraSearch", term] as const,
} as const;

/* ═════════════════════════════════════════════════════════════════════ queries ════ */

export function useAdminCountries() {
  const q = useQuery({
    queryKey: adminGateKeys.countries,
    staleTime: 30 * 60 * 1000,
    queryFn: async (): Promise<CountryRef[]> =>
      (await countryRepo.listAll({ orderBy: [asc("vsb_name")] }))
        .map((r) => ({ id: r.vsb_countryid, name: r.vsb_name })),
  });
  return { countries: q.data ?? [], isLoading: q.isLoading };
}

export function useGateStates() {
  const q = useQuery({
    queryKey: adminGateKeys.states,
    staleTime: 30 * 60 * 1000,
    queryFn: async () =>
      (await projectStateRepo.listAll({
        select: [
          "vsb_projectstateid", "vsb_name", "vsb_order", "vsb_isvisibleonchecklist",
          "_owningbusinessunit_value",
        ],
        orderBy: [asc("vsb_order")],
      })).map(toGateState),
  });
  return { states: q.data ?? [], isLoading: q.isLoading };
}

/** Rule 1's source, scoped server-side by country and technology. */
export function useGateApprovals(scope: Scope) {
  const enabled = Boolean(scope.country?.id && scope.technology);
  const q = useQuery({
    queryKey: adminGateKeys.approvals(scope),
    enabled,
    queryFn: async () =>
      (await adminProjectDefaultApprovalRepo.listAll({
        filter: f.and(
          f.guid(GATE_APPROVAL_COL.country, scope.country!.id),
          f.eq(GATE_APPROVAL_COL.technology, technologyValue(scope.technology) ?? -1),
        ),
      })).map(toGateApproval),
  });
  return { approvals: q.data ?? [], isLoading: q.isLoading };
}

/** The scope row id for `Checklist Country And Technologies`, used by rules 17 and 18. */
export function useScopeCountryTechId(scope: Scope) {
  const enabled = Boolean(scope.country?.id && scope.technology);
  const q = useQuery({
    queryKey: [...adminGateKeys.scopes, scopeKey(scope)],
    enabled,
    staleTime: 30 * 60 * 1000,
    queryFn: async () => {
      const row = await checklistCountryTechRepo.getOne(
        f.and(
          f.guid("_vsb_country_value", scope.country!.id),
          f.eq("vsb_technology", technologyValue(scope.technology) ?? -1),
        ) ?? "",
      );
      return row ? String(row["vsb_checklistcountryandtechnologyid"] ?? "") : null;
    },
  });
  return q.data ?? null;
}

/** The check-list templates in scope, ordered server-side by `vsb_order`. */
export function useChecklistItems(scope: Scope, countryTechId: string | null) {
  const q = useQuery({
    queryKey: adminGateKeys.checklistItems(scope),
    enabled: Boolean(countryTechId),
    queryFn: async () =>
      (await adminDefaultChecklistRepo.listAll({
        filter: f.and(
          f.guid("_vsb_associatedcountryandtechnology_value", countryTechId!),
          f.ne("vsb_todelete", 1),
        ),
        orderBy: [asc("vsb_order")],
      })).map(toChecklistItem),
  });
  return { items: q.data ?? [], isLoading: q.isLoading };
}

/**
 * The check-list approvals in scope.
 *
 * Rule 18's cross-country bug is FIXED at this seam as well as in `rules.ts`: only
 * approvals whose parent template is inside the current scope are fetched, so the
 * "already approved" set can never contain another country's row.
 */
export function useChecklistApprovals(scope: Scope, itemIds: string[]) {
  const q = useQuery({
    queryKey: [...adminGateKeys.checklistApprovals(scope), itemIds.length],
    enabled: itemIds.length > 0,
    queryFn: async () =>
      (await adminCheckListDefaultApprovalRepo.listAll({
        filter: f.inList(CHECKLIST_APPROVAL_COL.projectDefaultChecklist, itemIds),
      })).map(toChecklistApproval),
  });
  return { approvals: q.data ?? [], isLoading: q.isLoading };
}

/** Rule 15 — enabled accounts only; a blank term issues no request at all. */
export function usePeopleSearch(term: string) {
  const q = useQuery({
    queryKey: adminGateKeys.people(term.trim()),
    enabled: shouldSearchPeople(term),
    queryFn: async () =>
      (await adminEntraIdRepo.listAll({ filter: entraSearchFilter(term), top: 25 }))
        .map(toPersonaFromEntra),
  });
  return { people: useMemo(() => q.data ?? [], [q.data]), isLoading: q.isLoading };
}

/**
 * GUIDE p18 — resolves the table's "Portfolio Manager" column. That field is a plain
 * lookup (`_vsb_approvalparticipant1_value` / `_vsb_portfoliomanagerid_value`) pointing at
 * the ENTRA ID row's OWN primary key, not the `PersonaKey` (Entra object id) the three JSON
 * persona lists carry — so this is keyed on `ENTRA_COL.id`, not `toPersonaFromEntra`'s `id`.
 */
export function usePortfolioManagerPersonas(ids: readonly (string | null)[]) {
  const uniqueIds = useMemo(
    () => [...new Set(ids.filter((id): id is string => Boolean(id)))].sort(),
    [ids],
  );
  const q = useQuery({
    queryKey: ["admin", "portfolioManagers", uniqueIds.join(",")],
    enabled: uniqueIds.length > 0,
    queryFn: async () =>
      adminEntraIdRepo.listAll({ filter: f.inList(ENTRA_COL.id, uniqueIds) }),
  });
  const map = useMemo(() => {
    const m = new Map<string, Persona>();
    for (const r of q.data ?? []) m.set(String(r[ENTRA_COL.id] ?? ""), toPersonaFromEntra(r));
    return m;
  }, [q.data]);
  return {
    resolvePerson: useMemo(
      () => (id: string | null): Persona[] => (id && map.has(id) ? [map.get(id)!] : []),
      [map],
    ),
    isLoading: q.isLoading,
  };
}

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

export function useRunGatePlan(source: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { plan: WritePlan; scope: Scope }) => {
      const res = await runPlan(args.plan, source);
      if (!res.ok) throw res.error;
      return res.value;
    },
    onSuccess: (_n, args) => {
      void qc.invalidateQueries({ queryKey: adminGateKeys.approvals(args.scope) });
      void qc.invalidateQueries({ queryKey: adminGateKeys.checklistApprovals(args.scope) });
    },
  });
}
