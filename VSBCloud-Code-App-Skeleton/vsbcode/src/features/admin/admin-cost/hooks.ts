/**
 * Admin Cost Screen — queries and mutations.
 *
 * Canvas screen: `Admin Cost Screen` (PM app)
 *   352 controls · 9 286 lines of Power Fx · 117 substantive blocks · band XL
 *
 * `OnVisible` is a `Concurrent(...)` of NINE `ClearCollect`s followed by a sequential chain
 * that rebuilds the whole CAPEX tree, re-run on every navigation. Here there are three
 * long-`staleTime` queries — `['capexTree']`, `['opexAssumptions', scope]`,
 * `['devexCapex', scope]` — invalidated only by this screen's own mutations.
 */
import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  countryRepo, capexAccountListRepo, adminOpexLandLeaseAssumptionRepo,
  devexCapexAssumptionRepo, applyTrackingRepo, adminOpexSubaccountRepo, landLeaseSubaccountRepo,
} from "@/data/repos";
import { CAPEX_ROOT_NUMBER } from "@/data/entities";
import { dataClient } from "@/platform/dataClient";
import { f, asc } from "@/platform/odata";
import { toAppError, ok, err, type Result } from "@/platform/errors";
import { trace } from "@/platform/telemetry";
import { useAppStore } from "@/store/appStore";
import { privileges } from "@/platform/privileges";
import { ES_ADMIN } from "@/data/entities";
import {
  OPEX_COL, DEVEX_COL, APPLY_TRACKING_COL,
  type CostScope, type OpexPeriodRow, type OpexSubaccount, type DevexCost,
  type CategoryRef, type ApplyTrackingRow, type WritePlan,
} from "./rules";

const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" ? v : null);
const bool = (v: unknown): boolean => v === true;

/* ══════════════════════════════════════════════════════════════════ mapping ════ */

const OPEX_VALUE_COLUMNS = Object.values(OPEX_COL);

export function toOpexPeriodRow(r: Record<string, unknown>): OpexPeriodRow {
  const values: Record<string, unknown> = {};
  for (const c of OPEX_VALUE_COLUMNS) values[c] = r[c];
  return {
    id: String(r[OPEX_COL.id] ?? ""),
    description: str(r[OPEX_COL.description]),
    countryId: str(r[OPEX_COL.country]),
    technology: num(r[OPEX_COL.technology]),
    typeOfContract: num(r[OPEX_COL.typeOfContract]),
    period: num(r[OPEX_COL.period]),
    opexSubaccountId: str(r[OPEX_COL.opexSubaccount]),
    landLeaseSubaccountId: str(r[OPEX_COL.landLeaseSubaccount]),
    isLastPeriod: bool(r[OPEX_COL.isLastPeriod]),
    values,
  };
}

/**
 * Rule 23's raw `vsb_*` shape is normalised HERE, at the repository boundary, so nothing
 * downstream sees the mixed parent/child row model the canvas gallery rendered.
 */
export function toDevexCost(r: Record<string, unknown>): DevexCost {
  return {
    id: String(r[DEVEX_COL.id] ?? ""),
    name: str(r[DEVEX_COL.name]),
    description: str(r[DEVEX_COL.description]),
    descriptionInput: str(r[DEVEX_COL.descriptionInput]),
    costAmount: num(r[DEVEX_COL.costAmount]),
    unit: num(r[DEVEX_COL.unit]),
    costPaidBy: num(r[DEVEX_COL.costPaidBy]),
    comment: str(r[DEVEX_COL.comment]),
    technology: num(r[DEVEX_COL.technology]),
    countryId: str(r[DEVEX_COL.country]),
    categoryId: str(r[DEVEX_COL.category]),
    subaccountId: str(r[DEVEX_COL.subaccount]),
    distributionFrequency: num(r[DEVEX_COL.distributionFrequency]),
    clusters: [
      bool(r[DEVEX_COL.cluster1]), bool(r[DEVEX_COL.cluster2]), bool(r[DEVEX_COL.cluster3]),
      bool(r[DEVEX_COL.cluster4]), bool(r[DEVEX_COL.cluster5]),
    ],
  };
}

export const toApplyTracking = (r: Record<string, unknown>): ApplyTrackingRow => ({
  id: String(r[APPLY_TRACKING_COL.id] ?? ""),
  countryId: str(r[APPLY_TRACKING_COL.country]),
  technology: num(r[APPLY_TRACKING_COL.technology]),
  action: num(r[APPLY_TRACKING_COL.action]),
  contractType: num(r[APPLY_TRACKING_COL.contractType]),
  bopStandardContractId: str(r[APPLY_TRACKING_COL.bopStandardContract]),
  modifiedOn: str(r[APPLY_TRACKING_COL.modifiedOn]),
  modifiedByName: str(
    r[`${APPLY_TRACKING_COL.modifiedBy}@OData.Community.Display.V1.FormattedValue`],
  ),
});

const toSubaccount = (r: Record<string, unknown>, idColumn: string): OpexSubaccount => ({
  id: String(r[idColumn] ?? ""),
  name: String(r["vsb_name"] ?? ""),
  order: num(r["vsb_order"]) ?? 0,
  accountOrder: num(r["_vsb_account_value@OData.Community.Display.V1.FormattedValue"]) ?? null,
});

/* ══════════════════════════════════════════════════════════════════ query keys ════ */

const key = (s: CostScope) => `${s.countryId ?? "none"}:${s.technology ?? "none"}`;

export const costKeys = {
  countries: ["admin", "costCountries"] as const,
  capexTree: ["capexTree"] as const,
  opex: (s: CostScope, contractType: number) =>
    ["opexAssumptions", key(s), contractType] as const,
  opexAll: (s: CostScope) => ["opexAssumptions", key(s)] as const,
  devex: (s: CostScope) => ["devexCapex", key(s)] as const,
  applyTracking: (s: CostScope) => ["applyTracking", key(s)] as const,
  opexSubaccounts: ["admin", "opexSubaccounts"] as const,
  landLeaseSubaccounts: ["admin", "landLeaseSubaccounts"] as const,
} as const;

/* ═════════════════════════════════════════════════════════════════════ queries ════ */

export function useCostCountries() {
  const q = useQuery({
    queryKey: costKeys.countries,
    staleTime: 30 * 60 * 1000,
    queryFn: async () =>
      (await countryRepo.listAll({ orderBy: [asc("vsb_name")] }))
        .map((r) => ({ id: r.vsb_countryid, name: r.vsb_name })),
  });
  return { countries: q.data ?? [], isLoading: q.isLoading };
}

/**
 * Rule 3's divergence, made EXPLICIT: this screen excludes the `Overleveraging` category,
 * Admin CAPEX Accounts does not. The flag is a parameter, not an accident.
 */
export function useCostCategories(opts: { excludeOverleveraging?: boolean } = {}) {
  const q = useQuery({
    queryKey: [...costKeys.capexTree, "categories", opts.excludeOverleveraging === true],
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<CategoryRef[]> => {
      const all = await capexAccountListRepo.listAll({ orderBy: [asc("vsb_order")] });
      const root = all.find((a) => a["vsb_number"] === CAPEX_ROOT_NUMBER);
      if (!root) return [];
      const rootId = String(root["vsb_capexaccountlistid"]);
      return all
        .filter((a) => str(a["_vsb_parentaccount_value"]) === rootId)
        .filter((a) => !(opts.excludeOverleveraging && a["vsb_name"] === "Overleveraging"))
        .map((a) => ({
          id: String(a["vsb_capexaccountlistid"] ?? ""),
          name: String(a["vsb_name"] ?? ""),
          order: num(a["vsb_order"]) ?? 0,
        }));
    },
  });
  return { categories: q.data ?? [], isLoading: q.isLoading };
}

/** The subaccounts a DEVEX/CAPEX standard cost can be booked to (level 3 of the tree). */
export function useCapexSubaccounts() {
  const q = useQuery({
    queryKey: [...costKeys.capexTree, "subaccounts"],
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const all = await capexAccountListRepo.listAll({ orderBy: [asc("vsb_order")] });
      const byId = new Map(all.map((a) => [String(a["vsb_capexaccountlistid"]), a]));
      const root = all.find((a) => a["vsb_number"] === CAPEX_ROOT_NUMBER);
      const rootId = root ? String(root["vsb_capexaccountlistid"]) : null;
      // A subaccount is a node whose grandparent is the root — i.e. level 3.
      return all
        .map((a) => {
          const parentId = str(a["_vsb_parentaccount_value"]);
          const parent = parentId ? byId.get(parentId) : undefined;
          const grandParentId = parent ? str(parent["_vsb_parentaccount_value"]) : null;
          return { row: a, parent, isLevel3: grandParentId !== null && grandParentId === rootId };
        })
        .filter((x) => x.isLevel3)
        .map((x) => ({
          id: String(x.row["vsb_capexaccountlistid"] ?? ""),
          name: String(x.row["vsb_name"] ?? ""),
          number: String(x.row["vsb_number"] ?? ""),
          parentId: str(x.row["_vsb_parentaccount_value"]),
          parentName: String(x.parent?.["vsb_name"] ?? ""),
          /** The CATEGORY — the subaccount's parent's parent (rule 30). */
          categoryId: x.parent ? str(x.parent["_vsb_parentaccount_value"]) : null,
        }));
    },
  });
  return { subaccounts: q.data ?? [], isLoading: q.isLoading };
}

export function useOpexSubaccounts() {
  const q = useQuery({
    queryKey: costKeys.opexSubaccounts,
    staleTime: 30 * 60 * 1000,
    queryFn: async () =>
      (await adminOpexSubaccountRepo.listAll({ orderBy: [asc("vsb_order")] }))
        .map((r) => toSubaccount(r, "vsb_opexsubaccountid")),
  });
  return { subaccounts: q.data ?? [], isLoading: q.isLoading };
}

export function useLandLeaseSubaccounts() {
  const q = useQuery({
    queryKey: costKeys.landLeaseSubaccounts,
    staleTime: 30 * 60 * 1000,
    queryFn: async () =>
      (await landLeaseSubaccountRepo.listAll({ orderBy: [asc("vsb_order")] }))
        .map((r) => toSubaccount(r, "vsb_landleasesubaccountid")),
  });
  return { subaccounts: q.data ?? [], isLoading: q.isLoading };
}

/** Rule 7's scope triple, ALL THREE terms in `$filter` — never a client-side scan. */
export function useOpexAssumptions(scope: CostScope, contractType: number) {
  const enabled = Boolean(scope.countryId && scope.technologyValue !== null);
  const q = useQuery({
    queryKey: costKeys.opex(scope, contractType),
    enabled,
    queryFn: async () =>
      (await adminOpexLandLeaseAssumptionRepo.listAll({
        filter: f.and(
          f.guid(OPEX_COL.country, scope.countryId!),
          f.eq(OPEX_COL.technology, scope.technologyValue!),
          f.eq(OPEX_COL.typeOfContract, contractType),
        ),
        orderBy: [asc(OPEX_COL.period)],
      })).map(toOpexPeriodRow),
  });
  return { rows: q.data ?? [], isLoading: q.isLoading, isError: q.isError };
}

/** Rule 21's replacement — a flat scoped query; the grouping is a selector. */
export function useDevexCosts(scope: CostScope) {
  const enabled = Boolean(scope.countryId && scope.technologyValue !== null);
  const q = useQuery({
    queryKey: costKeys.devex(scope),
    enabled,
    queryFn: async () =>
      (await devexCapexAssumptionRepo.listAll({
        filter: f.and(
          f.guid(DEVEX_COL.country, scope.countryId!),
          f.eq(DEVEX_COL.technology, scope.technologyValue!),
        ),
      })).map(toDevexCost),
  });
  return { costs: q.data ?? [], isLoading: q.isLoading, isError: q.isError };
}

/** Rule 36's badge source, filtered server-side by scope rather than pulled whole. */
export function useApplyTracking(scope: CostScope) {
  const enabled = Boolean(scope.countryId && scope.technologyValue !== null);
  const q = useQuery({
    queryKey: costKeys.applyTracking(scope),
    enabled,
    queryFn: async () =>
      (await applyTrackingRepo.listAll({
        filter: f.and(
          f.guid(APPLY_TRACKING_COL.country, scope.countryId!),
          f.eq(APPLY_TRACKING_COL.technology, scope.technologyValue!),
        ),
      })).map(toApplyTracking),
  });
  return { rows: q.data ?? [], isLoading: q.isLoading };
}

/**
 * Privileges for the two assumption tables, per family.
 *
 * The DEVEX/CAPEX panel writes `Devex/Capex Standard Assumptions`; the three OPEX families
 * write `OPEX & Land Lease Standard Assumptions`. They are separate tables and a role can
 * hold different privileges on each, so this takes the family rather than answering once for
 * both — the previous single answer could only be right by coincidence.
 *
 * WHAT THIS REPLACED. The old body read
 * `user.isApplicationAdministrator || user.isControllerOwnData` — privileges from ROLE NAMES,
 * against `CONVENTIONS.md` rule 4. It also granted Delete to a controller, which
 * `matrix.json` does not: master data may be deleted by the administrator alone.
 *
 * The OPEX family has NO privilege check at all in the canvas. Having one is still a
 * deliberate TIGHTENING, and it is now a tightening the server can be made to agree with.
 */
export type CostFamily = "devex" | "opex";

const COST_FAMILY_TABLE: Record<CostFamily, string> = {
  devex: ES_ADMIN.devexCapexStandardAssumptions,
  opex: ES_ADMIN.opexLandLeaseStandardAssumptions,
};

export function useCostPrivileges(family: CostFamily) {
  const user = useAppStore((s) => s.session.user);
  return useMemo(() => {
    /*
     * `user` is the CACHE KEY, not an input. `privileges.forTable` answers from the
     * session-scoped cache `platform/bootstrap` filled for this user, so the memo has to
     * recompute when the identity changes and never otherwise. Referencing it explicitly
     * keeps that intent visible to the exhaustive-deps rule and to the next reader.
     */
    void user;
    const p = privileges.forTable(COST_FAMILY_TABLE[family]);
    return { canCreate: p.canCreate, canWrite: p.canWrite, canDelete: p.canDelete };
  }, [family, user]);
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

/** One mutation for both families — the plan already knows which entity set it targets. */
export function useRunCostPlan(source: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { plan: WritePlan; scope: CostScope }) => {
      const res = await runPlan(args.plan, source);
      if (!res.ok) throw res.error;
      return res.value;
    },
    onSuccess: (_n, args) => {
      void qc.invalidateQueries({ queryKey: costKeys.opexAll(args.scope) });
      void qc.invalidateQueries({ queryKey: costKeys.devex(args.scope) });
      void qc.invalidateQueries({ queryKey: costKeys.applyTracking(args.scope) });
    },
  });
}
