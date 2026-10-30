/**
 * Add Cost from Table — the read and write side against Dataverse.
 *
 * The read half assembles exactly what `buildInitialSheet` (in
 * `src/features/add-costs-from-table/rules.ts`) needs to hydrate the sheet: the category's
 * sub-accounts, their existing `vsb_capexprojectcontracts` rows (with the two fields
 * `loadCostLines` in `costBook.ts` does not fetch — `vsb_initialcontractsource` and
 * `vsb_iseditedfrompcf` — because the DEVEX/CAPEX grid never needed them, and this screen's
 * `contractUpserts` does), and every `vsb_capexcosts` row under those contracts, for EVERY
 * year — not just the sheet's visible range, because `planContractDeletions`' past-cost guard
 * has to see history outside that range too.
 *
 * The LEGACY write half (`saveAddCostSheetLegacy`) awaits each PHASE before the next begins; the
 * writes WITHIN a phase are independent of one another and run through the bounded pool in
 * `./concurrency` instead of one at a time. A full sheet is one `vsb_capexcosts` write per changed
 * month cell, several hundred of them, and serialised round trips made saving take minutes. There
 * the ordering BETWEEN phases carries the safety guarantees, never the ordering inside them.
 *
 * The legacy write half follows `src/data/capexWrites.ts`'s ordering convention: contract writes
 * first, then cost writes, cost deletes, contract-total recompute, and contract deletes last
 * (a delete removes the contract's own comments, then its cost rows, then the contract, so an
 * interrupted save cannot orphan a comment or a cost row pointing at a deleted contract — the
 * same order `deleteCostLine` in `capexWrites.ts` uses). It is NOT transactional, for
 * the same reason `capexWrites.ts` is not: the SDK exposes create/update/delete per record and
 * no changeset.
 *
 * Since D51 that per-row write half is the LEGACY path (`saveAddCostSheetLegacy`). `BULK_SAVE`
 * routes the Save through `saveAddCostSheetBulk` instead: the same final rows, planned by
 * `buildSavePlan` and sent by `executeSavePlan` (`./addCostSheetBulk.ts`) as four operations
 * (contract upserts, cost upserts, cost deletes, contract deletes) that run CONCURRENTLY, as a
 * graph rather than in strict order. Each upsert goes out as `CreateMultiple` (new rows) and
 * `UpdateMultiple` (existing rows) in parallel — see `upsertRowsByAction`. `UpsertMultiple` is
 * not used.
 */
import { Vsb_capexprojectcontractsService } from "@/generated/services/Vsb_capexprojectcontractsService";
import { Vsb_capexcostsService } from "@/generated/services/Vsb_capexcostsService";
import { CreateMultipleService } from "@/generated/services/CreateMultipleService";
import { UpdateMultipleService } from "@/generated/services/UpdateMultipleService";
import { DataError, RecordGoneError, isRecordGone, unwrap } from "@/platform/errors";
import { deleteRecord, fetchAll } from "./client";
import { ACTIVE, and, bind, chunk, idIn, lookupEq, lookupIn, numberOf } from "./odata";
import { DELETE_CONCURRENCY, createGate, forEachLimit, mapLimit } from "./concurrency";
import { loadCostAccounts, loadPayerDefaults } from "./costBook";
import {
  excludePendingCosts, excludePendingFromSheet, pendingDeletes, pendingExcept,
} from "./pendingDeletes";
import { deleteComment, loadComments } from "./comments";
import {
  BulkDeleteError, BulkWriteError, deleteMany, parallelChunkSize, toUpsertTargets, upsertMultiple,
} from "./bulkWrites";
import type {
  BulkTableInfo, BulkUpsertTransport, ExistingIdsReader, SavedSheetChanges, UpsertTarget,
} from "./bulkTypes";
import {
  CAPEX_CONTRACTS, CAPEX_COSTS, RowsGoneError, SavePlanError, executeSavePlan,
  type BackgroundOutcome, type SavePlanDeps,
} from "./addCostSheetBulk";
import { planDeleteContract } from "@/features/cost/capex-costs/rules";
import { logAction } from "@/platform/requestLog";
import {
  contractUpserts, costWrites, recomputeContractTotal,
  type ExistingContract, type ExistingCost, type SaveFailure, type SheetRow,
} from "@/features/cost/add-costs-from-table/rules";
import {
  SheetConflictError, buildSavePlan, contractFields,
} from "@/features/cost/add-costs-from-table/savePlan";

/* ══════════════════════════════════════════════════════════════════ the read ══ */

export interface AddCostSheetSubaccount { id: string; number: string; name: string }

/**
 * One ACCOUNT (chart level 2) with the SUB-accounts (level 3) hanging off it, in chart order.
 *
 * The sheet is not a flat list of sub-accounts: the canvas builds `colAllGroupedAccounts` as
 * account row -> its sub-account rows -> each sub-account's contracts
 * (`CapexScreenCode.txt:1200-1260`), so the grid needs the hierarchy, not just the leaves.
 */
export interface AddCostSheetAccount extends AddCostSheetSubaccount {
  subaccounts: AddCostSheetSubaccount[];
}

export interface AddCostSheetData {
  /** The category's ACCOUNTS, each carrying its own sub-accounts — what the grid is laid out from. */
  accounts: AddCostSheetAccount[];
  /** The same sub-accounts, flattened — what `buildInitialSheet`/`resolveRow` match against. */
  subaccounts: AddCostSheetSubaccount[];
  contracts: ExistingContract[];
  costs: ExistingCost[];
  /** Sub-account id -> "DevCo" | "SPV". */
  payerDefaults: Map<string, string>;
}

const CONTRACT_SELECT = [
  "vsb_capexprojectcontractid", "_vsb_account_value", "vsb_name",
  "vsb_costtype", "vsb_depreciation", "vsb_applyvat", "vsb_isstandardcontract",
  "vsb_distribution", "vsb_distributionscheme", "vsb_initialcontractsource",
  "vsb_iseditedfrompcf",
  // The stored total, so the bulk planner can leave a contract alone when it would not change.
  "vsb_totalcost",
];

export async function loadAddCostSheetData(
  projectId: string,
  category: number,
): Promise<AddCostSheetData> {
  const chart = await loadCostAccounts();
  const inCategory = chart.filter((a) => a.category === category);
  // `loadCostAccounts` returns level 2 (accounts, no `parentId`) and level 3 (sub-accounts)
  // interleaved and already in chart order, so a single pass preserves that order.
  const named = ({ id, number, name }: { id: string; number: string; name: string }) =>
    ({ id, number, name });
  const subaccounts: AddCostSheetSubaccount[] = inCategory.filter((a) => a.parentId).map(named);
  const accounts: AddCostSheetAccount[] = inCategory
    .filter((a) => !a.parentId)
    .map((a) => ({
      ...named(a),
      subaccounts: inCategory.filter((s) => s.parentId === a.id).map(named),
    }));

  if (subaccounts.length === 0) {
    return { accounts, subaccounts: [], contracts: [], costs: [], payerDefaults: new Map() };
  }

  const subIds = subaccounts.map((s) => s.id);
  const [payerDefaults, contracts] = await Promise.all([
    loadPayerDefaults(),
    loadContracts(
      "list Add Cost from Table contracts",
      chunk(subIds).map((ids) =>
        and(lookupEq("vsb_project", projectId), lookupIn("vsb_account", ids), ACTIVE)),
    ),
  ]);

  const costs = await loadCostsForContracts(contracts.map((c) => c.id));

  return { accounts, subaccounts, contracts, costs, payerDefaults };
}

/**
 * The ONE contract read of this screen (CONVENTIONS rule 17): one `fetchAll` per filter, all in
 * parallel, `CONTRACT_SELECT` only, mapped to `ExistingContract`. The sheet load filters by
 * sub-account; the bulk save's `refreshBeforePlan` re-read filters by id.
 */
async function loadContracts(
  label: string, filters: readonly (string | undefined)[],
): Promise<ExistingContract[]> {
  const batches = await Promise.all(filters.map((filter) =>
    fetchAll(label, (o) => Vsb_capexprojectcontractsService.getAll(o), { select: CONTRACT_SELECT, filter })));
  return batches.flat().map((c) => ({
    id: c.vsb_capexprojectcontractid,
    name: c.vsb_name ?? "",
    subaccountId: c._vsb_account_value ?? null,
    isStandardContract: c.vsb_isstandardcontract === true,
    initialContractSource: numberOf(c.vsb_initialcontractsource) ?? null,
    distribution: numberOf(c.vsb_distribution) ?? null,
    distributionScheme: numberOf(c.vsb_distributionscheme) ?? null,
    isEditedFromPcf: c.vsb_iseditedfrompcf === true,
    costType: numberOf(c.vsb_costtype) ?? null,
    depreciation: c.vsb_depreciation === true ? true : c.vsb_depreciation === false ? false : null,
    applyVat: c.vsb_applyvat === true ? true : c.vsb_applyvat === false ? false : null,
    // Blank stays null (never 0): the planner treats an unknown total as "write it".
    totalCost: numberOf(c.vsb_totalcost) ?? null,
  }));
}

/**
 * The bulk save's `refreshBeforePlan` re-read (F-A): the sheet's existing contracts by id and
 * every cost row under them, fresh from the server, so a retry after a partly-landed save plans
 * against what Dataverse holds now, not the pre-save snapshot. Both reads run in parallel; each is
 * one request per `CHUNK` ids (`requests`; a page beyond the first is not counted). Same columns,
 * same mapping and the same active-only filter as the sheet load, so a contract deleted (or
 * deactivated) since is simply absent, exactly as a fresh load would show it.
 */
async function refreshSnapshot(contractIds: readonly string[]): Promise<{
  contracts: ExistingContract[]; costs: ExistingCost[]; requests: number;
}> {
  const batches = chunk(contractIds);
  const [contracts, costs] = await Promise.all([
    loadContracts(
      "refresh Add Cost from Table contracts",
      batches.map((ids) => and(idIn(CAPEX_CONTRACTS.primaryKey, ids), ACTIVE)),
    ),
    loadCostsForContracts(contractIds),
  ]);
  return { contracts, costs, requests: batches.length * 2 };
}

/**
 * Every active `vsb_capexcosts` row under these contracts, all years, in `lookupIn` batches.
 *
 * The ONE cost read of this screen (CONVENTIONS rule 17): the sheet load uses it, and so does
 * the bulk save's reconcile (`SavePlanDeps.loadCosts`), which needs the same shape fresh from
 * the server after a failed phase.
 */
async function loadCostsForContracts(contractIds: readonly string[]): Promise<ExistingCost[]> {
  if (contractIds.length === 0) return [];
  const costBatches = await Promise.all(
    chunk([...contractIds]).map((ids) =>
      fetchAll(
        "list Add Cost from Table costs",
        (o) => Vsb_capexcostsService.getAll(o),
        {
          select: ["vsb_capexcostid", "_vsb_contract_value", "vsb_year", "vsb_month", "vsb_cost"],
          filter: and(lookupIn("vsb_contract", ids), ACTIVE),
        },
      ),
    ),
  );
  return costBatches.flat().map((r) => ({
    id: r.vsb_capexcostid,
    contractId: r._vsb_contract_value ?? "",
    year: Number(r.vsb_year ?? 0),
    month: Number(numberOf(r.vsb_month) ?? 0),
    cost: r.vsb_cost ?? null,
  }));
}

/** Every row of one id batch of `table`, primary key only. The two tables the bulk save writes. */
async function idRows(table: BulkTableInfo, batch: readonly string[]): Promise<readonly object[]> {
  const options = { select: [table.primaryKey], filter: idIn(table.primaryKey, batch) };
  const label = `check existing ${table.entitySetName}`;
  if (table.entitySetName === CAPEX_CONTRACTS.entitySetName) {
    return fetchAll(label, (o) => Vsb_capexprojectcontractsService.getAll(o), options);
  }
  if (table.entitySetName === CAPEX_COSTS.entitySetName) {
    return fetchAll(label, (o) => Vsb_capexcostsService.getAll(o), options);
  }
  throw new Error(`existingIds: no reader for ${table.entitySetName}`);
}

/**
 * Which of `ids` still exist in `table` — the bulk save's phase-0 check (`SavePlanDeps.existingIds`).
 *
 * A server read with `$select` = the primary key only (rule 1), the ids filtered on the server in
 * `chunk` batches of `CHUNK` (rule 2), every page through `fetchAll`, which unwraps (rule 3). No
 * state filter: an inactive row still exists, and an upsert of it updates rather than re-creates.
 * Ids come back lower-cased so the caller can match case-insensitively.
 */
const existingIds: ExistingIdsReader = async (table, ids) => {
  const batches = await Promise.all(chunk(ids).map((batch) => idRows(table, batch)));
  const found = new Set<string>();
  for (const row of batches.flat()) {
    const id = (row as Record<string, unknown>)[table.primaryKey];
    if (typeof id === "string") found.add(id.toLowerCase());
  }
  return found;
};

/* ═════════════════════════════════════════════════════════════════ the write ══ */

export interface SaveAddCostSheetArgs {
  projectId: string;
  owningBusinessUnitId?: string;
  /** `diffRows(rows, originalRows)` — only what actually changed. */
  changedRows: SheetRow[];
  existingContracts: ExistingContract[];
  /** Every existing cost row for every contract in the category — not just this sheet's years. */
  existingCosts: ExistingCost[];
  /** `planContractDeletions(...).deleteIds`. */
  contractDeleteIds: string[];
  /**
   * Identity key → id of the NEW rows a previous attempt of this same sheet sent (bulk path
   * only). The caller keeps one map per loaded sheet and clears it after a successful save or a
   * fresh load, never after a failure: a retry then sends the same ids, so the retry updates
   * what the failed attempt created instead of duplicating it (the orchestrator's phase-0 check
   * turns such an id into an update). Mutated in place.
   */
  idCache?: Map<string, string>;
  /**
   * Bulk path only. Re-read `existingContracts` (by id) and their costs from the server before
   * planning, and plan against that instead of the snapshot passed in (F-A). The screen sets it
   * on the save after a failed one: a partly-landed save leaves the snapshot stale, and a value
   * the user sets back to its old number would otherwise plan as a no-op and never be written.
   * The legacy path ignores it.
   */
  refreshBeforePlan?: boolean;
  /**
   * Bulk path only: overrides `DEFER_CONTRACT_DELETES` for this one call. The screen never sets
   * it; it lets the suite pin both halves of the decision (`false` = Save waits for the cascade).
   */
  deferContractDeletes?: boolean;
  /**
   * Bulk path only: overrides `DEFER_COST_DELETES` for this one call. The screen never sets it;
   * it lets the suite pin both halves of the decision (`false` = Save waits for the deletes of
   * cleared cells).
   */
  deferCostDeletes?: boolean;
}

/**
 * What a Save resolves to. `background` is set only when the bulk path returned before its
 * deferred deletes finished (`DEFER_CONTRACT_DELETES`, `DEFER_COST_DELETES`): ONE promise for
 * both kinds, which resolves, NEVER rejects, once they (and any background reconcile) settle,
 * with `costDeleteError` / `contractDeleteError` set for the group that failed.
 * `deferredContracts` / `deferredCosts` are how many contract / cost rows were still being
 * deleted when the Save returned, and `deferredContractIds` / `deferredCostIds` the ids
 * themselves (the hook hides them from CAPEX reads until `background` settles,
 * `./pendingDeletes.ts`). `applied` is what the bulk Save wrote, in domain terms, for the
 * optimistic patch of the DEVEX/CAPEX book (D51 §11.19); it is set on every successful bulk Save.
 * The legacy path resolves `{}`: no patch, the CAPEX queries are only refetched.
 */
export interface SaveAddCostSheetResult {
  background?: Promise<BackgroundOutcome>;
  deferredContracts?: number;
  deferredCosts?: number;
  deferredContractIds?: readonly string[];
  /** `costDeletes` and `costDeletesIfExist` (the latter only exist on a retry). */
  deferredCostIds?: readonly string[];
  applied?: SavedSheetChanges;
}

/**
 * Bulk requests per upsert group sent AT ONCE (`upsertMultiple`'s `parallel`).
 *
 * Microsoft's bulk guidance is to send bulk messages in parallel: the server processes the rows
 * of ONE request in sequence (D51 §11 measured a 1,000-row `CreateMultiple` of costs at
 * ~3.3 s), so a big group split into 4 requests sent together finishes in about a quarter of the
 * time. It cannot overload Dataverse: every bulk request still passes the shared `saveGate`, which
 * caps the write requests in flight at `SAVE_REQUEST_LIMIT`. A group under 50 rows stays one
 * request (`MIN_PARALLEL_CHUNK`). "4" holds up to 4 × 500 = 2,000 rows; a bigger group is one
 * request per 500 rows, all sent at once (`parallelChunkSize`). The 501 fallback still holds: when every parallel request answers
 * 501, `upsertMultiple` throws a `BulkWriteError` with 0 committed, as the sequential path does.
 */
export const BULK_PARALLEL_CHUNKS = 4;

/**
 * D51 option A (§11.14): Save returns as soon as every operation EXCEPT the contract deletes has
 * succeeded, and the contract deletes (whose server cascade measured 5.2 s, the whole critical
 * path of the measured save) finish in the background (`SaveAddCostSheetResult.background`).
 *
 * A live product decision with the same status as `BULK_SAVE`: do not flip or remove it without
 * checking `ProjectDocs/app-docs/02-OPEN-DECISIONS.md` (D51) first. `false` makes Save wait for
 * the server cascade again, exactly as before.
 *
 * Why it is safe: a deferred delete affects no contract total. A deleted contract is never in the
 * plan's totals, and its cost rows go by its own cascade, so a failed background delete leaves
 * every surviving total true; it only leaves the contract itself in place, which the user is told
 * (`BACKGROUND_DELETE_FAILED`). Any failure of the rest of the save still waits for the deletes.
 */
export const DEFER_CONTRACT_DELETES = true;

/**
 * D51 option A extended (§11.15): Save also returns before the deletes of CLEARED CELLS (phase 3,
 * one request per cost row) finish; they settle in the same `background` promise as the contract
 * deletes. Measured on DEV, 27 Oct: a save with 16 cost deletes took 7.3 s, and the deletes alone
 * ran from t = 0 to 4.2 s.
 *
 * A live product decision of the same kind as `DEFER_CONTRACT_DELETES`: do not flip or remove it
 * without checking `ProjectDocs/app-docs/02-OPEN-DECISIONS.md` (D51) first. `false` makes Save wait
 * for the deletes of cleared cells again, exactly as before.
 *
 * Unlike a contract delete, a cost delete DOES feed a total: the contract upsert has already
 * written the total assuming the cell is gone. So when a deferred cost delete fails, the
 * orchestrator reconciles the surviving contracts' totals in the background, and the outcome says
 * whether that worked (`reconciled` / `reconcileError`), which picks the toast
 * (`COST_DELETE_FAILED_RECONCILED` / `COST_DELETE_FAILED_NOT_RECONCILED`).
 */
export const DEFER_COST_DELETES = true;

/**
 * The toast when deferred contract deletes failed. NEW text with no canvas equivalent: the canvas
 * Save waits for every delete, so it has no "after the save" failure to report. Kept here, not in
 * `rules.ts`, until that file's owner moves it into `ADDCOST_MSG`.
 */
export const BACKGROUND_DELETE_FAILED = (n: number): string =>
  `Removing ${n} contract(s) did not finish. Open Add Costs from Table again and remove them once more.`;

/**
 * The toast when deferred COST deletes (cleared cells) failed and the background reconcile put
 * the contract totals right. NEW text with no canvas equivalent, for the same reason as
 * `BACKGROUND_DELETE_FAILED`.
 */
export const COST_DELETE_FAILED_RECONCILED =
  "Some cleared cells could not be removed. Totals were corrected; open Add Costs from Table again and clear them once more.";

/**
 * The same failure when the totals could NOT be confirmed (the reconcile failed, or could not
 * vouch for every contract). NEW text, no canvas equivalent. "Totals were corrected" would be
 * untrue here, so that clause is dropped and the warning about the totals is appended.
 */
export const COST_DELETE_FAILED_NOT_RECONCILED =
  "Some cleared cells could not be removed. Open Add Costs from Table again and clear them once more. "
  + "Contract totals may not match: reload the CAPEX screen.";

/** How many rows of each kind the background work was still deleting (`SaveAddCostSheetResult`). */
export interface DeferredCounts {
  deferredContracts?: number;
  deferredCosts?: number;
}

/**
 * The toast texts for a settled background delete, in display order: the cost text first (it is
 * the one that may concern totals), then the contract text. Empty when everything succeeded.
 *
 * Both failed: TWO toasts, not one joined message. Each text stays a whole, separately worded
 * instruction (one says "clear them once more", the other "remove them once more"), and the
 * contract one is exactly the text users already see; joining them would make a third string
 * that no single failure produces.
 *
 * - Cost group: `costDeleteError`. Reconciled when `reconciled === true` and no `reconcileError`;
 *   anything else is "may not match".
 * - Contract group: `contractDeleteError`. `n` is the contracts still present:
 *   `BulkDeleteError.failedIds` when the deleter says, else every deferred contract.
 * - Only the generic `error` set (an outcome from the safety net, or an older shape): it is
 *   blamed on every group that had deferred rows, cost totals reported as unconfirmed.
 */
export function backgroundDeleteFailureTexts(outcome: BackgroundOutcome, counts: DeferredCounts): string[] {
  const deferredContracts = counts.deferredContracts ?? 0;
  const deferredCosts = counts.deferredCosts ?? 0;
  const specific = outcome.costDeleteError !== undefined || outcome.contractDeleteError !== undefined;
  const unattributed = !specific && outcome.error !== undefined;
  const costFailed = outcome.costDeleteError !== undefined || (unattributed && deferredCosts > 0);
  const contractError = outcome.contractDeleteError
    ?? (unattributed && (deferredContracts > 0 || deferredCosts === 0) ? outcome.error : undefined);
  const texts: string[] = [];
  if (costFailed) {
    const reconciled = !unattributed && outcome.reconciled === true && outcome.reconcileError === undefined;
    texts.push(reconciled ? COST_DELETE_FAILED_RECONCILED : COST_DELETE_FAILED_NOT_RECONCILED);
  }
  if (contractError !== undefined) {
    const n = contractError instanceof BulkDeleteError && contractError.failedIds.length > 0
      ? contractError.failedIds.length
      : deferredContracts;
    texts.push(BACKGROUND_DELETE_FAILED(Math.max(1, n)));
  }
  return texts;
}

/**
 * `Add Cost from Table background deletes: costs N req, contracts M req, T ms[, failed][, totals
 * reconciled|totals NOT reconciled]`. `T` counts from the start of the save (when the deletes were
 * sent). The totals clause appears only when a background reconcile ran.
 */
export function backgroundDeleteLogLine(
  outcome: BackgroundOutcome, requests: { costs: number; contracts: number }, ms: number,
): string {
  const failed = outcome.error !== undefined || outcome.costDeleteError !== undefined
    || outcome.contractDeleteError !== undefined;
  const reconcileRan = outcome.reconciled !== undefined || outcome.reconcileError !== undefined;
  const reconciled = outcome.reconciled === true && outcome.reconcileError === undefined;
  return `Add Cost from Table background deletes: costs ${requests.costs} req, `
    + `contracts ${requests.contracts} req, ${Math.round(ms)} ms`
    + (failed ? ", failed" : "")
    + (reconcileRan ? (reconciled ? ", totals reconciled" : ", totals NOT reconciled") : "");
}

/**
 * `Add Cost from Table background deletes started: costs 16 row(s) at 2345 ms, delete gate 0/4
 * busy` — logged when a DEFERRED kind of delete is sent (after the writes settled; on the early
 * path that is just before the save line). Diagnostic only: when a live log has the save line's
 * `delete … deferred` but no `background deletes: …` line, this says whether the deferred deletes
 * started at all, and `busy` (slots of that kind's gate already held, usually by an earlier save's
 * background deletes that have not answered; on a retry it can also count this save's own
 * cost-delete slots) whether they queued behind requests that never came back. `ms` counts from
 * the start of the save, as in `backgroundDeleteLogLine`. Logged on every path that sends a
 * deferred kind, including one where the save then waits for it (a failure).
 */
function backgroundDeleteStartLine(
  kind: "costs" | "contracts", rows: number, ms: number, busy: number, limit: number,
): string {
  return `Add Cost from Table background deletes started: ${kind} ${rows} row(s) at ${Math.round(ms)} ms, `
    + `delete gate ${busy}/${limit} busy`;
}

/**
 * How many slots of `gate` are held right now. `reset()` restarts `peak()` from the in-flight
 * count, so reading `peak()` straight after it gives that count. Used only on the two delete
 * gates, whose peak nothing else reads (the save line's gate peak is `saveGate`'s).
 */
function busySlots(gate: ReturnType<typeof createGate>): number {
  gate.reset();
  return gate.peak();
}

/**
 * The Save's write path: the bulk save (D51, §11) when `true` — `CreateMultiple` for new rows and
 * `UpdateMultiple` for existing ones, the four operations run as `executeSavePlan`'s concurrent
 * graph, `UpsertMultiple` unused; `false` restores the per-row legacy save as an instant rollback,
 * with no other change.
 *
 * A live product decision, like `CANVAS_PARITY_DELETION` in the screen: do not flip or remove
 * it without checking `ProjectDocs/app-docs/02-OPEN-DECISIONS.md` (D51) first.
 */
export const BULK_SAVE = true;

/** Saves a diffed sheet through whichever path `BULK_SAVE` selects. Callers never change. */
export async function saveAddCostSheet(args: SaveAddCostSheetArgs): Promise<SaveAddCostSheetResult> {
  if (BULK_SAVE) return saveAddCostSheetBulk(args);
  await saveAddCostSheetLegacy(args);
  return {};
}

/**
 * The bulk save (D51, §11): `buildSavePlan` reduces the sheet to four in-memory collections and
 * `executeSavePlan` sends them as a CONCURRENT graph, not in strict order: contract deletes,
 * contract upserts, the cost upserts of existing contracts and the cost deletes start together,
 * and the cost rows of the plan's new contracts follow as soon as the contract upsert landed (the
 * graph and why it is safe: the module note of `./addCostSheetBulk.ts`). Each upsert is one
 * `CreateMultiple` request per 500 new rows and one `UpdateMultiple` request per 500 existing
 * rows, the two sent in parallel (`upsertRowsByAction`), and a group of 50 rows or more split into
 * requests sent at once: up to `BULK_PARALLEL_CHUNKS` of them up to 2,000 rows, one per 500 rows
 * above that (`parallelChunkSize`); `UpsertMultiple` is not used. Each
 * delete is one request per record. Every write request passes one shared gate of
 * `SAVE_REQUEST_LIMIT`; contract deletes and cost deletes each pass their own gate of 4
 * (`CONTRACT_DELETE_LIMIT`, `COST_DELETE_LIMIT`), so a delete never holds a write slot.
 *
 * REFRESH (`args.refreshBeforePlan`): before planning, the existing contracts and their costs are
 * re-read (`refreshSnapshot`) and replace `existingContracts` / `existingCosts`; logged as
 * `refresh N req M ms`.
 *
 * A DELETE ANSWERING 404 is success: the row is already gone, which is what the delete wanted
 * (the orchestrator starts deletes without reading them first). But a 404 from a host or route
 * says nothing about the row, so after each delete batch the ids that answered 404 are read back
 * once (`existingIds`, one read per `CHUNK` ids, counted in that delete's requests). Only the ones
 * the read does not find are "already gone" in the log; one that still exists (or a failed
 * read-back) makes the batch throw a `BulkDeleteError` naming it, which the orchestrator reports
 * as that delete's phase (3 or 4) — see `verifiedDeleteMany`. Every other refusal still rejects
 * (CONVENTIONS rule 14).
 *
 * VERIFY. `verifyUpserts` is `false` (no phase-0 existence read of the upsert targets) only on a
 * first attempt with both bulk actions available — see `skipUpsertVerify`. When it was skipped
 * and `UpdateMultiple` still has to fall back to per-row PATCHes (a 501 mid-save), the fallback
 * re-checks those ids first (`upsertEachRow`'s guard), because a PATCH is an upsert.
 *
 * LOG. One `[VSB] ACTION` console line per save (`platform/requestLog.ts`): total ms, requests, per-step timings (each bulk request's own
 * server duration in brackets, e.g. `upsert contracts (create 1 req bulk [980 ms], update 1 req
 * bulk [10.7 s])`), then the gate's peak
 * in-flight count, the average and maximum gated request duration, whether verify ran, and how
 * many deletes found their row already gone.
 *
 * DIVERGENCE: the canvas (and `saveAddCostSheetLegacy`) write one record per request: contract
 * creates/updates, cost creates/updates, cost deletes, a separate total update per contract,
 * then per deleted contract its comments, cost rows and the contract. Here the WRITE ORDER and
 * the REQUEST COUNT differ — totals travel with the contract upsert, no-op cells are skipped,
 * and a deleted contract's cost rows and comments go by the Dataverse cascade (contract → cost
 * and contract → comment are both Cascade, `ProjectDocs/Capex Cost Screen/11-DATAVERSE-TABLES.md`
 * §3) — but the final rows and columns are the same (D51). So this path reads no comments and
 * deletes no comment or cost row of a deleted contract itself.
 *
 * STABLE IDS. A new row's id comes from `args.idCache` (keyed by the planner's identity key) and
 * is added to it when first issued, so a retry of the same sheet after a failure sends the same
 * ids. The cache is also the planner's `pendingIds`, which turns ids of cells that are blank
 * now into `costDeletesIfExist`. Without a cache each call gets a throwaway one.
 *
 * DEFERRED DELETES (`DEFER_CONTRACT_DELETES`, `DEFER_COST_DELETES`, D51 option A and its
 * extension): when the rest of the save succeeded, it resolves before those deletes finish, with
 * one `background` promise (never rejects); the save line then says `delete costs deferred` /
 * `delete contracts deferred` for each kind still running, and a second line,
 * `Add Cost from Table background deletes: costs N req, contracts M req, T ms[, failed][, totals
 * reconciled|totals NOT reconciled]` (`backgroundDeleteLogLine`), is logged when they settle
 * (T counted from the start of the save). A deferred kind is SENT only once every write has
 * settled (`executeSavePlan`'s late start), not at t = 0; when it is sent,
 * `Add Cost from Table background deletes started: …` (`backgroundDeleteStartLine`) is logged, so
 * a live log shows whether the deferred deletes began even if they never settle. The
 * `background deletes: …` line is attached here, before this function returns, so it does not
 * depend on the caller (the hook, or whether the screen is still mounted) doing anything with
 * `background`; it is missing only while some deferred request has not answered.
 *
 * Throws `SheetConflictError` (nothing written), `RowsGoneError` (no upsert sent; deletes started
 * beside phase 0 may have landed, `committedBefore`), `SavePlanError`, or the refresh read's own
 * error (nothing written); `toSaveFailure` classifies any of them for the screen.
 */
export async function saveAddCostSheetBulk(args: SaveAddCostSheetArgs): Promise<SaveAddCostSheetResult> {
  const {
    idCache = new Map<string, string>(), refreshBeforePlan = false,
    deferContractDeletes = DEFER_CONTRACT_DELETES, deferCostDeletes = DEFER_COST_DELETES, ...input
  } = args;
  // Ids issued by an EARLIER attempt (only those can already exist in Dataverse); taken before
  // planning, so ids minted for this save are not read back in phase 0.
  const priorIds = new Set([...idCache.values()].map((id) => id.toLowerCase()));
  const newId = (key: string): string => {
    const cached = idCache.get(key);
    if (cached !== undefined) return cached;
    const id = crypto.randomUUID();
    idCache.set(key, id);
    return id;
  };
  const verifyUpserts = !skipUpsertVerify(priorIds.size === 0);
  // Two Saves never overlap (the button is disabled while one runs), but an earlier save's
  // BACKGROUND work can still be running when this one starts: its deferred deletes (their own
  // module gates, `contractDeleteGate` / `costDeleteGate`, shared by every save) and, after a
  // failed background cost delete, its reconcile upsert, which passes `saveGate` like any write.
  // So what is reset here measures, from this point on: `peak()` the most WRITE requests in
  // flight at once (starting from any write already in flight), and `requestStats` every gated
  // write request that finished (bulk calls and per-row upserts; never a delete or a read). Either
  // can include that rare background reconcile write of an earlier save.
  saveGate.reset();
  resetRequestStats();
  let alreadyGone = 0;
  const started = performance.now();
  const timings: string[] = [];
  const elapsed = (t0: number) => Math.round(performance.now() - t0);
  /** `gate peak 9/16, req avg 380 ms max 1200 ms, verify skipped, 2 already gone`. */
  const measures = () => {
    const avg = requestStats.count === 0 ? 0 : Math.round(requestStats.totalMs / requestStats.count);
    return `gate peak ${saveGate.peak()}/${SAVE_REQUEST_LIMIT}, `
      + `req avg ${avg} ms max ${Math.round(requestStats.maxMs)} ms, `
      + `verify ${verifyUpserts ? "ran" : "skipped"}, ${alreadyGone} already gone`;
  };
  /**
   * `SavePlanDeps.deleteMany`: `deleteMany` with a deleter that resolves on 404, then the 404s
   * checked (`verifyNotFound`). Confirmed ones are counted as already gone for the log.
   */
  /**
   * Per kind of delete: the requests SENT (each delete call, plus 404 read-backs), counted as they
   * go so a failed batch still reports them (the background line), and the timing entries of its
   * batches, kept apart from `timings` because a DEFERRED kind is shown as `delete … deferred` in
   * the save line instead, even when it happened to finish before the Save returned.
   */
  const deletes = {
    costs: { sent: 0, entries: [] as string[] },
    contracts: { sent: 0, entries: [] as string[] },
  };
  const deleteKind = (table: BulkTableInfo) =>
    (table.entitySetName === CAPEX_CONTRACTS.entitySetName ? deletes.contracts : deletes.costs);
  const verifiedDeleteMany = async (table: BulkTableInfo, ids: readonly string[], label: string) => {
    const kind = deleteKind(table);
    const notFound = new Map<string, DataError>();
    let sent: { requests: number } | undefined;
    let failure: unknown;
    try {
      try {
        sent = await deleteMany(table, ids, async (tableName, id) => {
          kind.sent += 1;
          const answer = await deleteOr404(label, tableName, id);
          if (answer) notFound.set(id, answer);
        }, { label, limit: deleteLimit(table) });
      } catch (error) {
        failure = error;
      }
      const checked = await verifyNotFound(table, ids, label, notFound, sent, failure);
      alreadyGone += checked.confirmed;
      kind.sent += checked.readBack;
      return { requests: checked.requests, readBack: checked.readBack, removed: checked.removed };
    } catch (error) {
      // A read-back sent before failing is still a request sent.
      if (notFound.size > 0) kind.sent += chunk([...notFound.keys()]).length;
      throw error;
    }
  };
  /** One timing entry per call: `<name> <detail of the result, or "failed"> <ms> ms`. */
  const timed = <A extends unknown[], R>(
    name: (...a: NoInfer<A>) => string, fn: (...a: A) => Promise<R>, detail?: (result: R) => string,
  ) =>
    async (...a: A): Promise<R> => {
      const t0 = performance.now();
      let outcome = "failed";
      try {
        const result = await fn(...a);
        outcome = detail ? detail(result) : "";
        return result;
      } finally {
        timings.push(`${[name(...a), outcome].filter(Boolean).join(" ")} ${elapsed(t0)} ms`);
      }
    };
  /**
   * `<label> (create N req bulk [980 ms], update M req per-row after 501) <ms> ms`. A bulk group
   * names each request's own server duration in brackets (`gated`: inside the gate, so queueing
   * is excluded), which shows contention that the group's wall time alone hides. The
   * orchestrator's labels already carry the verb ("upsert contracts", "reconcile totals").
   */
  const upsert = async (table: BulkTableInfo, rows: readonly UpsertTarget[], label: string) => {
    const t0 = performance.now();
    let groups = "not sent";
    try {
      return await upsertRowsByAction(
        table, rows, label, (summary) => { groups = summary; }, { guardPerRowUpdates: !verifyUpserts },
      );
    } finally {
      timings.push(`${label} (${groups}) ${elapsed(t0)} ms`);
    }
  };
  const logFailure = () => logAction(
    `Add Cost from Table save failed after ${elapsed(started)} ms (${timings.join(", ")}); ${measures()}`,
  );
  if (refreshBeforePlan) {
    const t0 = performance.now();
    try {
      // Rows an EARLIER Save is still deleting in the background stay out of the re-read, exactly
      // as they stay out of the sheet load (D51 §11.19, review finding 1): planned against them, a
      // value typed into such a cell would become an UPDATE of a row about to be deleted.
      const fresh = excludePendingFromSheet(
        await refreshSnapshot(input.existingContracts.map((c) => c.id)), pendingDeletes.snapshot(),
      );
      input.existingContracts = fresh.contracts;
      input.existingCosts = fresh.costs;
      timings.push(`refresh ${fresh.requests} req ${elapsed(t0)} ms`);
    } catch (error) {
      timings.push(`refresh failed ${elapsed(t0)} ms`);
      logFailure();
      throw error;
    }
  }
  const planStarted = performance.now();
  const plan = buildSavePlan({ ...input, pendingIds: idCache }, { newId });
  timings.push(`plan ${elapsed(planStarted)} ms`);
  const deps: SavePlanDeps = {
    upsert,
    // `timed`'s entry, also filed under its kind (`deletes.*.entries`) for the save line.
    deleteMany: async (table, ids, label) => {
      const isContracts = table.entitySetName === CAPEX_CONTRACTS.entitySetName;
      if (isContracts ? deferContractDeletes : deferCostDeletes) {
        // Only a deferred kind: `executeSavePlan` sends it after the writes settled.
        logAction(backgroundDeleteStartLine(
          isContracts ? "contracts" : "costs", ids.length, elapsed(started),
          busySlots(isContracts ? contractDeleteGate : costDeleteGate),
          isContracts ? CONTRACT_DELETE_LIMIT : COST_DELETE_LIMIT,
        ));
      }
      const t0 = performance.now();
      let outcome = "failed";
      try {
        const r = await verifiedDeleteMany(table, ids, label);
        outcome = `${r.requests} req${r.readBack > 0 ? ` (${r.readBack} 404 read-back)` : ""}`;
        return r;
      } finally {
        const entry = `${label} ${outcome} ${elapsed(t0)} ms`;
        deleteKind(table).entries.push(entry);
        timings.push(entry);
      }
    },
    // The reconcile sums what the contracts will hold once every pending delete landed: rows an
    // EARLIER Save is still deleting are left out (D51 §11.19, review finding 1). This save's OWN
    // deletes are not: when its background reconcile runs they are still registered, and a row
    // whose own delete failed still exists and must be summed.
    loadCosts: timed(() => "reconcile read", async (contractIds: readonly string[]) => [
      ...excludePendingCosts(await loadCostsForContracts(contractIds), pendingExcept(pendingDeletes.snapshot(), {
        contractIds: plan.contractDeletes,
        costIds: [...plan.costDeletes, ...plan.costDeletesIfExist],
      })),
    ]),
    existingIds: timed(
      (t: BulkTableInfo, _ids: readonly string[]) => `verify ${t.entitySetName}`, existingIds,
    ),
    mayExist: (id) => priorIds.has(id.toLowerCase()),
    verifyUpserts,
    deferContractDeletes,
    deferCostDeletes,
  };
  let result: Awaited<ReturnType<typeof executeSavePlan>>;
  try {
    result = await executeSavePlan(plan, deps);
  } catch (error) {
    logFailure();
    throw error;
  }
  // A kind is deferred exactly when the orchestrator holds it back (its flag on, something to
  // delete, and the save returned early): its requests are then outside `requests.total`, so its
  // timing entries are left out of this line too, even ones that settled before the return, and
  // `delete … deferred` stands in their place. Its counts come in the background line.
  const deferredCosts = result.background && deferCostDeletes
    ? plan.costDeletes.length + plan.costDeletesIfExist.length : 0;
  const deferredContracts = result.background && deferContractDeletes ? plan.contractDeletes.length : 0;
  const hidden = new Set([
    ...(deferredCosts > 0 ? deletes.costs.entries : []),
    ...(deferredContracts > 0 ? deletes.contracts.entries : []),
  ]);
  const shown = timings.filter((entry) => !hidden.has(entry));
  if (deferredCosts > 0) shown.push("delete costs deferred");
  if (deferredContracts > 0) shown.push("delete contracts deferred");
  logAction(
    `Add Cost from Table save: ${elapsed(started)} ms, `
      + `${result.requests.total} requests (${shown.join(", ")}); ${measures()}`,
  );
  const applied = plan.applied;
  if (!result.background) return { applied };
  // The orchestrator's promise never rejects; the second handler keeps that true regardless.
  const settled = result.background.then(
    (outcome) => outcome,
    (error: unknown): BackgroundOutcome => ({ requests: 0, error }),
  );
  const background = settled.then((outcome) => {
    try {
      logAction(backgroundDeleteLogLine(
        outcome, { costs: deletes.costs.sent, contracts: deletes.contracts.sent }, elapsed(started),
      ));
    } catch {
      // Logging must never turn the background outcome into a rejection.
    }
    return outcome;
  });
  return {
    background,
    deferredContracts,
    deferredCosts,
    deferredContractIds: deferredContracts > 0 ? plan.contractDeletes : [],
    deferredCostIds: deferredCosts > 0 ? [...plan.costDeletes, ...plan.costDeletesIfExist] : [],
    applied,
  };
}

/**
 * The bulk deleter's per-row call: resolves `undefined` when the row was deleted, resolves the
 * `DataError` when the delete answered 404 (to be confirmed by `verifyNotFound`), and throws any
 * other refusal unchanged (rule 14).
 */
async function deleteOr404(label: string, tableName: string, id: string): Promise<DataError | undefined> {
  try {
    // Never `gated`: deletes have their own gates, so they never hold a write slot, and the
    // request stats (`gated`) measure writes only.
    await (tableName === CAPEX_CONTRACTS.entitySetName
      ? contractDeleteGate(() => deleteRecord(label, tableName, id))
      : costDeleteGate(() => deleteRecord(label, tableName, id)));
    return undefined;
  } catch (error) {
    if (error instanceof DataError && error.status === 404) return error;
    throw error;
  }
}

/**
 * F-C: a delete batch's 404s, confirmed. A 404 is "already gone" only if the row really is gone;
 * a host or route 404 would otherwise turn every delete into a silent success. So the ids that
 * answered 404 are read back ONCE, after the batch (`existingIds`: one read per `CHUNK` ids).
 *
 * - None answered 404: the batch's own result or error, unchanged, no read.
 * - All confirmed gone: the batch's own result (`requests` + the read-backs) or error.
 * - Any still there, or the read-back failed: a `BulkDeleteError` for the batch. Its `failedIds`
 *   are the batch's own failures (if `deleteMany` threw one) followed by the unconfirmed ids in
 *   input order; `deletedCount` excludes them, so the orchestrator's `committedBefore` stays
 *   true to what landed. Each unconfirmed id's cause is a status-less `DataError` (never a 404
 *   or a `RecordGoneError`, so it is never read as "gone") wrapping the 404, or the read's error.
 *
 * `removed` (L2 / F5): the rows this batch really deleted itself — the deletes that resolved
 * WITHOUT a 404. A row confirmed already gone was removed by someone (or something) else, so a
 * batch of nothing but confirmed 404s removed 0 and the orchestrator does not report "some of
 * your changes were already saved" for it. On a failure the same number travels as the
 * `BulkDeleteError`'s `removedCount` (an error of the batch with confirmed 404s is re-thrown as a
 * copy carrying it); `deletedCount` keeps its meaning, so the reconcile is unchanged.
 *
 * Thrown from the `deleteMany` dep rather than from the per-row deleter, because only after the
 * batch are all its 404s known, so the check is one read per 40 ids instead of one per row. The
 * orchestrator then reports it like any refused delete: a `SavePlanError` on phase 3 or 4.
 */
async function verifyNotFound(
  table: BulkTableInfo, ids: readonly string[], label: string,
  notFound: ReadonlyMap<string, DataError>, sent: { requests: number } | undefined, failure: unknown,
): Promise<{ requests: number; readBack: number; confirmed: number; removed: number }> {
  const settled = () => {
    if (failure !== undefined || sent === undefined) throw failure;
    return sent;
  };
  if (notFound.size === 0) {
    // Every delete that resolved removed its row (`deleteMany` counts one request per id).
    const ok = settled();
    return { requests: ok.requests, readBack: 0, confirmed: 0, removed: ok.requests };
  }
  // The deletes that resolved, minus every one that resolved only because it answered 404.
  const removedOf = (resolved: number) => Math.max(0, resolved - notFound.size);

  const order = new Map(ids.map((id, i) => [id, i] as const));
  const candidates = [...notFound.keys()].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
  const readBack = chunk(candidates).length;
  let unconfirmed: { id: string; cause: DataError }[];
  try {
    const found = await existingIds(table, candidates);
    unconfirmed = candidates
      .filter((id) => found.has(id.toLowerCase()))
      .map((id) => ({
        id,
        cause: new DataError(
          `${label}: ${table.entitySetName} row ${id} answered 404 to its delete but still exists `
            + "(a host or route 404, not a deleted row)",
          notFound.get(id),
        ),
      }));
  } catch (readError) {
    unconfirmed = candidates.map((id) => ({
      id,
      cause: new DataError(
        `${label}: ${table.entitySetName} row ${id} answered 404 to its delete and could not be read back`,
        readError,
      ),
    }));
  }
  if (unconfirmed.length === 0) {
    if (failure instanceof BulkDeleteError) {
      // The batch's own refusal, unchanged except that it now says what it removed itself.
      throw new BulkDeleteError(
        failure.label, failure.table, failure.failedIds, failure.deletedCount, failure.causes,
        removedOf(failure.deletedCount),
      );
    }
    const ok = settled();
    return {
      requests: ok.requests + readBack, readBack, confirmed: candidates.length, removed: removedOf(ok.requests),
    };
  }
  if (failure !== undefined && !(failure instanceof BulkDeleteError)) throw failure;
  const prior = failure instanceof BulkDeleteError ? failure : undefined;
  const succeeded = prior ? prior.deletedCount : (sent?.requests ?? 0);
  throw new BulkDeleteError(
    label, table.entitySetName,
    [...(prior?.failedIds ?? []), ...unconfirmed.map((u) => u.id)],
    Math.max(0, succeeded - unconfirmed.length),
    [...(prior?.causes ?? []), ...unconfirmed.map((u) => u.cause)],
    removedOf(succeeded),
  );
}

/**
 * Whether this save may skip phase 0's existence read of the upsert targets
 * (`SavePlanDeps.verifyUpserts: false`). Only when BOTH hold:
 *  - `firstAttempt`: the id cache was empty before planning, so every new id was minted for this
 *    save and cannot exist yet — `CreateMultiple` cannot collide with an earlier attempt's row;
 *  - neither bulk action is flagged per-row for this session. Then every existing row goes out
 *    through `UpdateMultiple`, which REFUSES a row that no longer exists instead of re-creating
 *    it, so the read would only repeat a check the server makes anyway.
 * A per-row PATCH is an upsert (the SDK sends no `If-Match`): it would resurrect a row deleted
 * since the sheet loaded, so with either flag set the verify stays on. A 501 that arrives in the
 * middle of a save whose verify was skipped is covered by `upsertEachRow`'s guard.
 */
function skipUpsertVerify(firstAttempt: boolean): boolean {
  return firstAttempt && !bulkUnavailable.create && !bulkUnavailable.update;
}

/** The two bulk actions an upsert phase is split into (`upsertRowsByAction`). */
type BulkAction = "create" | "update";

/**
 * The gated transport of one bulk action. `onDuration` receives each request's own server time,
 * measured inside the gate (from the moment it holds a slot, so queueing is excluded), for the
 * per-request durations in the save line.
 */
function bulkTransport(action: BulkAction, onDuration?: (ms: number) => void): BulkUpsertTransport {
  return action === "create"
    ? (es, targets) => gated(() => CreateMultipleService.CreateMultiple(es, [...targets]), onDuration)
    : (es, targets) => gated(() => UpdateMultipleService.UpdateMultiple(es, [...targets]), onDuration);
}

/**
 * One request's duration for the log: `980 ms` under a second, else seconds with one decimal
 * (`10.7 s`), so a slow, contended request stands out in the save line.
 */
export function formatRequestDuration(ms: number): string {
  const rounded = Math.round(ms);
  return rounded < 1000 ? `${rounded} ms` : `${(ms / 1000).toFixed(1)} s`;
}

const BULK_ACTION_NAME: Readonly<Record<BulkAction, string>> = {
  create: "CreateMultiple",
  update: "UpdateMultiple",
};

/**
 * Set PER ACTION for the rest of the session once that action is refused with HTTP 501 Not
 * Implemented (`UpsertMultiple` did that against VSBCloud_Dev, 27 Oct 2026, D51): later phases
 * and saves then send that action's rows per row straight away instead of paying for a refused
 * request first. A 501 on one action says nothing about the other, so each has its own flag.
 */
const BULK_501_KEY: Readonly<Record<BulkAction, string>> = {
  create: "vsb.addCostSheet.createMultiple501",
  update: "vsb.addCostSheet.updateMultiple501",
};

/** The flag the retired `UpsertMultiple` path wrote; only ever removed now. */
const RETIRED_UPSERT_501_KEY = "vsb.addCostSheet.upsertMultiple501";

/** Also kept in `sessionStorage`, so a page reload does not pay for the refused request again. */
const bulkUnavailable: Record<BulkAction, boolean> = {
  create: readBulk501("create"),
  update: readBulk501("update"),
};

function readBulk501(action: BulkAction): boolean {
  try {
    return globalThis.sessionStorage?.getItem(BULK_501_KEY[action]) === "1";
  } catch {
    return false;
  }
}

function rememberBulk501(action: BulkAction): void {
  bulkUnavailable[action] = true;
  try {
    globalThis.sessionStorage?.setItem(BULK_501_KEY[action], "1");
  } catch {
    // Storage blocked (private window, policy): the in-memory flag still covers this page.
  }
}

/** Test seam: forget every 501 seen earlier in the session, for both actions. */
export function resetBulkWriteAvailability(): void {
  for (const action of ["create", "update"] as const) {
    bulkUnavailable[action] = false;
    try {
      globalThis.sessionStorage?.removeItem(BULK_501_KEY[action]);
    } catch {
      // See `rememberBulk501`.
    }
  }
  try {
    globalThis.sessionStorage?.removeItem(RETIRED_UPSERT_501_KEY);
  } catch {
    // See `rememberBulk501`.
  }
}

/**
 * Per-row fallback writes in flight at once. Dataverse allows 52 concurrent requests per user
 * (service protection); 16 matches `DELETE_CONCURRENCY` and halves the round trips of the old 8.
 */
const ROW_WRITE_CONCURRENCY = DELETE_CONCURRENCY;

/**
 * One ceiling for EVERY write request of a save — bulk calls and per-row upserts (deletes have
 * their own gates, `contractDeleteGate` and `costDeleteGate`). The
 * orchestrator runs up to five operations at once, each with its own pool of 16, which could put
 * ~100 requests in flight, past Dataverse's 52-per-user service-protection limit; writes are not
 * retried on 429. One module gate serves every save: two Saves never overlap (the button is
 * disabled while one runs), and the one write an earlier save can still send in the background
 * (the reconcile after a failed deferred cost delete) passes this same gate, so the cap holds
 * across them. The deferred deletes themselves run on their own module gates, which every save
 * and its background share in the same way.
 */
const SAVE_REQUEST_LIMIT = 16;
const saveGate = createGate(SAVE_REQUEST_LIMIT);

/**
 * Contract deletes have their OWN small gate, outside `saveGate`. Each one is a server-side
 * cascade (measured 5.2 s for one contract, D51 §11.14) and they may run on in the background
 * after Save returns (`DEFER_CONTRACT_DELETES`). Inside the shared gate, 16 slow cascades would
 * hold every slot and stall the upserts — cancelling the deferral — and would leak into the next
 * save's gate peak and request stats. Peak in flight is therefore 16 (writes) + 4 (cascades), well
 * under Dataverse's 52-per-user limit.
 */
export const CONTRACT_DELETE_LIMIT = 4;
const contractDeleteGate = createGate(CONTRACT_DELETE_LIMIT);

/**
 * Cost deletes (cleared cells, phase 3 and 3') have their OWN gate too, outside `saveGate`.
 *
 * Measured on DEV, 27 Oct (D51 §11.15): 16 per-row cost deletes went through `saveGate` with a
 * pool of `DELETE_CONCURRENCY` (16). They took all 16 slots at t = 0 (`gate peak 16/16`), so
 * every upsert queued about 4 s behind them: the contract upsert finished at 4.7 s and the save at
 * 7.3 s, with the server load pushing each request to about 3 s (`req avg 2971 ms`). With 4
 * slots of their own the deletes can never delay a write.
 *
 * Peak in flight is therefore 16 (writes) + 4 (contract cascades) + 4 (cost deletes) = 24, well
 * under Dataverse's 52-per-user limit. Not counted in `requestStats` either: the log's gate peak
 * and request stats describe the writes only; the delete counts are their own log entries.
 */
export const COST_DELETE_LIMIT = 4;
const costDeleteGate = createGate(COST_DELETE_LIMIT);

/** `deleteMany`'s pool for a table: the same size as that table's gate, so no task waits twice. */
function deleteLimit(table: BulkTableInfo): number {
  return table.entitySetName === CAPEX_CONTRACTS.entitySetName ? CONTRACT_DELETE_LIMIT : COST_DELETE_LIMIT;
}

/** Duration of the gated requests of the current save (time inside the gate, not queueing), for the log. */
const requestStats = { count: 0, totalMs: 0, maxMs: 0 };

function resetRequestStats(): void {
  requestStats.count = 0;
  requestStats.totalMs = 0;
  requestStats.maxMs = 0;
}

/**
 * `saveGate(task)`, timing the task once it holds a slot. Every write request of a save (never a
 * delete) goes through here. `onDuration` also receives that one request's duration (the bulk
 * requests' per-request entries in the save line).
 */
function gated<T>(task: () => Promise<T>, onDuration?: (ms: number) => void): Promise<T> {
  return saveGate(async () => {
    const t0 = performance.now();
    try {
      return await task();
    } finally {
      const ms = performance.now() - t0;
      requestStats.count += 1;
      requestStats.totalMs += ms;
      if (ms > requestStats.maxMs) requestStats.maxMs = ms;
      onDuration?.(ms);
    }
  });
}

/**
 * A 501 on the FIRST chunk: the bulk action itself is not available on this route, and nothing
 * was written (each chunk is all-or-nothing), so falling back to per-row upserts is safe. Any
 * other failure, or a 501 after a chunk landed, is a real error and is rethrown.
 */
function isBulkNotImplemented(error: unknown): boolean {
  if (!(error instanceof BulkWriteError) || error.chunksCommitted !== 0) return false;
  let current: unknown = error;
  for (let depth = 0; depth < 8 && current; depth += 1) {
    if (current instanceof DataError && current.status === 501) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

const ROW_UPSERT: Readonly<Record<string, (id: string, fields: Readonly<Record<string, unknown>>) => Promise<unknown>>> = {
  [CAPEX_CONTRACTS.entitySetName]: async (id, fields) =>
    Vsb_capexprojectcontractsService.update(id, fields as never),
  [CAPEX_COSTS.entitySetName]: async (id, fields) => Vsb_capexcostsService.update(id, fields as never),
};

/**
 * The same plan rows as one PATCH `<set>(<id>)` each. The SDK sends no `If-Match`, so Dataverse
 * treats each as an UPSERT: it creates the row with the planner's id when absent and updates it
 * otherwise, which keeps the stable retry ids (D51 §3a) and the phase-0 existence check valid.
 * Not atomic: a failure throws a plain `DataError` without commit counts, which the orchestrator
 * treats as "may have committed" and reconciles cautiously.
 *
 * GUARD (`guard: true`, only for UPDATE rows of a save whose phase-0 upsert verify was skipped,
 * `skipUpsertVerify`): nothing has proved those rows still exist, and a PATCH would re-create one
 * another user deleted since the sheet loaded. So their ids are read back first (`existingIds`,
 * one read per `CHUNK` ids, counted as requests). If ANY is missing, NONE of the group is sent: a
 * `BulkWriteError` with 0 committed is thrown, its cause a `RecordGoneError` naming the first
 * missing id — the same "deleted by someone else, nothing of it written" meaning as phase 0's
 * `RowsGoneError`, reported through the orchestrator's `SavePlanError` (other operations of the
 * save may have landed by then, so it cannot be the zero-write `RowsGoneError` itself).
 */
async function upsertEachRow(
  table: BulkTableInfo, rows: readonly UpsertTarget[], label: string, guard = false,
): Promise<{ requests: number }> {
  const send = ROW_UPSERT[table.entitySetName];
  if (!send) throw new Error(`${label}: no per-row upsert for ${table.entitySetName}`);
  let checks = 0;
  if (guard && rows.length > 0) {
    const ids = rows.map((r) => r.id);
    const found = await existingIds(table, ids);
    checks = chunk(ids).length;
    const missing = rows.filter((r) => !found.has(r.id.toLowerCase()));
    const first = missing[0];
    if (first) {
      throw new BulkWriteError(label, table.entitySetName, 0, 0, 0, new RecordGoneError(
        `${label}: ${missing.length} of ${rows.length} row(s) no longer exist; the per-row fallback did not re-create them`,
        table.entitySetName, first.id,
      ));
    }
  }
  await forEachLimit(rows, async (row) => {
    unwrap((await gated(() => send(row.id, row.fields))) as Parameters<typeof unwrap>[0], label);
  }, ROW_WRITE_CONCURRENCY);
  return { requests: checks + rows.length };
}

/** How one action's group of rows actually went out, for the save's timing log. */
type GroupPath = "bulk" | "per-row after 501" | "per-row since an earlier 501";

/**
 * One action's group, for the log: its path, and on the bulk path each bulk request's own server
 * duration in completion order (`gated`, queueing excluded).
 */
interface GroupTrack { path?: GroupPath; durations?: number[] }

/** `bulk [980 ms, 10.7 s]` on the bulk path (one entry per request); the path alone otherwise. */
function groupPathText(track: GroupTrack): string {
  const path = track.path ?? "bulk";
  const durations = path === "bulk" ? track.durations ?? [] : [];
  return durations.length === 0 ? path : `${path} [${durations.map(formatRequestDuration).join(", ")}]`;
}

/**
 * One action's group: the bulk message first, per-row upserts when that action answers 501 on
 * its first chunk (nothing was written then, so the fallback is safe). Any other refusal, or a
 * 501 after a chunk landed, propagates unchanged. The refused 501 request counts as a request.
 * `guardPerRowUpdates`: the update group's per-row path re-checks its ids first (`upsertEachRow`).
 */
async function sendGroup(
  action: BulkAction, table: BulkTableInfo, rows: readonly UpsertTarget[], label: string,
  track: GroupTrack, guardPerRowUpdates = false,
): Promise<number> {
  if (rows.length === 0) return 0;
  const groupLabel = `${label} (${action})`;
  const guard = action === "update" && guardPerRowUpdates;
  if (bulkUnavailable[action]) {
    // Reached in a skipped-verify save only when another operation of THIS save set the flag.
    track.path = "per-row since an earlier 501";
    return (await upsertEachRow(table, rows, groupLabel, guard)).requests;
  }
  track.path = "bulk";
  const durations: number[] = (track.durations = []);
  try {
    // Parallel chunks (`BULK_PARALLEL_CHUNKS`): each one still passes `saveGate` through
    // `bulkTransport`, so the save's in-flight cap is unchanged.
    return (await upsertMultiple(table, rows, bulkTransport(action, (ms) => { durations.push(ms); }), {
      label: groupLabel, parallel: BULK_PARALLEL_CHUNKS,
    })).requests;
  } catch (error) {
    if (!isBulkNotImplemented(error)) throw error;
    rememberBulk501(action);
    console.warn(`${BULK_ACTION_NAME[action]} answered 501 Not Implemented; ${groupLabel} continues row by row.`);
  }
  track.path = "per-row after 501";
  return refusedBulkRequests(rows.length) + (await upsertEachRow(table, rows, groupLabel, guard)).requests;
}

/**
 * How many bulk requests a group of `rowCount` rows sent before its 501 fallback: every parallel
 * chunk when the group was split (all of them answered 501, or it would not have fallen back),
 * else the one sequential first chunk.
 */
function refusedBulkRequests(rowCount: number): number {
  const parallelRequests = Math.ceil(rowCount / parallelChunkSize(rowCount, BULK_PARALLEL_CHUNKS));
  return parallelRequests > 1 ? parallelRequests : 1;
}

/** The innermost `DataError` status in an error's `cause` chain, if any. */
function dataStatus(error: unknown): number | undefined {
  let status: number | undefined;
  let current: unknown = error;
  for (let depth = 0; depth < 8 && current; depth += 1) {
    if (current instanceof DataError && current.status !== undefined) status = current.status;
    current = (current as { cause?: unknown }).cause;
  }
  return status;
}

/**
 * The Save's upsert adapter (`SavePlanDeps.upsert`): Microsoft's bulk guidance is that Upsert is
 * slower than Create or Update and that a caller who knows whether a record exists should say so.
 * The planner knows, per row (`UpsertTarget.isNew`), and the orchestrator's phase-0 check turns
 * a "new" id that already exists into `isNew: false`, so `CreateMultiple` never gets an id that
 * exists. So the rows are split, in input order, into `creates` and `updates`, and the two
 * groups go out IN PARALLEL — one `CreateMultiple` / `UpdateMultiple` request per 500 rows each
 * (`upsertMultiple` chunks, validates and unwraps). `UpsertMultiple` is no longer used: it
 * answered 501 against VSBCloud_Dev (D51).
 *
 * VALIDATION first, over ALL the rows, before either group sends anything: a duplicate id across
 * the two groups, an empty id or a reserved key throws `BulkValidationError` (0 committed).
 *
 * 501 FALLBACK PER ACTION: see `sendGroup`. One action's 501 leaves the other on its bulk path.
 *
 * FAILURE. Both groups are awaited to the end (`allSettled`) before anything is thrown, so no
 * request is still in flight when the orchestrator starts reconciling. Then:
 * - only one group had rows: its own error is rethrown unchanged. That group IS `rows` in input
 *   order, so a `BulkWriteError`'s `rowsCommitted` still means "this prefix of `rows` landed";
 * - both groups had rows: neither group's rows are a prefix of `rows` (creates and updates
 *   interleave in the input), so no commit count can keep that meaning. The adapter throws a
 *   plain `DataError` with NO `rowsCommitted` / `chunksCommitted`, its `cause` the first failure
 *   (create before update) and its `status` that failure's innermost Dataverse status. The
 *   orchestrator reads "counts unknown" as "may have committed" and reconciles cautiously;
 * - EXCEPT both groups failed and each error reports 0 rows committed: then nothing of `rows`
 *   landed, and the adapter throws a `BulkWriteError` with 0 committed (its `cause` that same
 *   `DataError`), so the orchestrator neither says "some of your changes were already saved"
 *   nor treats this phase as possibly landed (L2 / F5).
 *
 * `requests` is the sum of both groups. `report` receives the per-action summary for the log,
 * also on failure. `opts.guardPerRowUpdates` is set when this save skipped the phase-0 upsert
 * verify: see `upsertEachRow`'s guard.
 */
async function upsertRowsByAction(
  table: BulkTableInfo, rows: readonly UpsertTarget[], label: string,
  report?: (summary: string) => void, opts: { guardPerRowUpdates?: boolean } = {},
): Promise<{ requests: number }> {
  toUpsertTargets(table, rows, label);
  const groups: Record<BulkAction, readonly UpsertTarget[]> = {
    create: rows.filter((r) => r.isNew),
    update: rows.filter((r) => !r.isNew),
  };
  const tracks: Record<BulkAction, GroupTrack> = { create: {}, update: {} };
  const actions = ["create", "update"] as const;
  const settled = await Promise.allSettled(
    actions.map((action) => sendGroup(
      action, table, groups[action], label, tracks[action], opts.guardPerRowUpdates === true,
    )),
  );

  report?.(actions
    .map((action, i) => {
      if (groups[action].length === 0) return null;
      const s = settled[i] as PromiseSettledResult<number>;
      return s.status === "fulfilled"
        ? `${action} ${s.value} req ${groupPathText(tracks[action])}`
        : `${action} failed ${groupPathText(tracks[action])}`;
    })
    .filter((part): part is string => part !== null)
    .join(", ") || "nothing to send");

  const failed = actions.flatMap((action, i) => {
    const s = settled[i] as PromiseSettledResult<number>;
    return s.status === "rejected" ? [{ action, reason: s.reason as unknown }] : [];
  });
  const [first, second] = failed;
  if (!first) {
    return { requests: settled.reduce((n, s) => n + (s.status === "fulfilled" ? s.value : 0), 0) };
  }
  if (groups.create.length === 0 || groups.update.length === 0) throw first.reason;

  const detail = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason));
  const other: BulkAction = first.action === "create" ? "update" : "create";
  const operation = second
    ? `${label}: both the create and the update group failed (update: ${detail(second.reason)})`
    : `${label}: the ${first.action} group failed while the ${other} group (${groups[other].length} row(s)) was saved`;
  const wrapped = new DataError(operation, first.reason, dataStatus(first.reason));
  // L2 / F5: both groups failed and BOTH report exactly 0 rows committed (a refused single
  // request, a 501 on every chunk, the per-row guard), so nothing of `rows` landed and 0 is a
  // true prefix count of them. Say so — a `BulkWriteError` with 0 committed around the same
  // detail — instead of the count-less error, which the orchestrator must read as "may have
  // committed". Any group that fulfilled, or reports rows, or reports no counts at all (a
  // per-row failure, a partial parallel split) keeps the count-less error below.
  if (second && reportsNothingCommitted(first.reason) && reportsNothingCommitted(second.reason)) {
    throw new BulkWriteError(label, table.entitySetName, 0, 0, 0, wrapped);
  }
  throw wrapped;
}

/**
 * The error says, with counts, that its group committed nothing: `rowsCommitted` is 0 and
 * `chunksCommitted` (when present) is 0. `BulkWriteError` / `BulkValidationError` carry them; a
 * plain or `BulkPartialWriteError` does not, and so never qualifies.
 */
function reportsNothingCommitted(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const { rowsCommitted, chunksCommitted } = error as { rowsCommitted?: unknown; chunksCommitted?: unknown };
  return rowsCommitted === 0 && (chunksCommitted === undefined || chunksCommitted === 0);
}

/**
 * Classifies a failed Save, bulk or legacy, for the screen. The words live in the rules
 * (`saveFailureText`); this only reads the error types the data layer throws.
 */
export function toSaveFailure(error: unknown): SaveFailure {
  if (error instanceof SheetConflictError) return { kind: "conflict", detail: error.detail };
  // Deletes start at t = 0 beside phase 0, so they can land before it reports rows gone (F-B).
  if (error instanceof RowsGoneError) {
    return { kind: "gone", ...error.gone, committedBefore: error.committedBefore };
  }
  // A phase stopped by a row deleted by someone else (e.g. `upsertEachRow`'s guard). No counts:
  // 0 / 0 is "unknown" in the wording.
  if (error instanceof SavePlanError && isRecordGone(error.cause)) {
    return { kind: "gone", contracts: 0, costs: 0, committedBefore: error.committedBefore };
  }
  if (error instanceof SavePlanError) {
    return {
      kind: "phase", phase: error.phase, reconciled: error.reconciled, committedBefore: error.committedBefore,
    };
  }
  return { kind: "other" };
}

/**
 * The legacy per-row save (`BULK_SAVE = false`). Writes a diffed sheet: contract upserts, then
 * cost upserts, then cost deletes, then the touched contracts' totals, then contract deletes
 * (their comments and cost rows first).
 *
 * A new contract has no id until the create round-trips, so `contractUpserts`' `contractId:
 * null` rows are created here FIRST and the resulting ids are threaded back onto the changed
 * rows (keyed by `subaccountId|description`, which is exactly how `contractUpserts` groups
 * them) before `costWrites` runs — otherwise every cost row under a brand-new contract would
 * have nothing to bind to.
 *
 * Every delete goes through `deleteRecord`, so a refused delete rejects the save instead of
 * resolving like a success (CONVENTIONS rule 14).
 */
export async function saveAddCostSheetLegacy(args: SaveAddCostSheetArgs): Promise<void> {
  const { projectId, owningBusinessUnitId, changedRows, existingContracts, existingCosts } = args;

  const upserts = contractUpserts(changedRows, existingContracts);

  // One contract's write says nothing about another's, so the whole phase goes through the pool.
  // The ids come back in INPUT order, and the map is built from them afterwards, so both its
  // contents and its insertion order are what the sequential loop produced.
  const resolved = await mapLimit(upserts, async (u) => {
    const groupKey = `${u.subaccountId}|${u.name}`;
    if (u.contractId) {
      unwrap(
        await Vsb_capexprojectcontractsService.update(u.contractId, contractFields(u) as never),
        "update CAPEX contract",
      );
      return [groupKey, u.contractId] as const;
    }
    const created = unwrap(
      await Vsb_capexprojectcontractsService.create({
        ...contractFields(u),
        "vsb_Project@odata.bind": bind("vsb_projects", projectId),
        "vsb_Account@odata.bind": bind("vsb_capexaccountlists", u.subaccountId ?? ""),
        ...(owningBusinessUnitId
          ? { "owningbusinessunit@odata.bind": bind("businessunits", owningBusinessUnitId) }
          : {}),
      } as never),
      "create CAPEX contract",
    );
    return [groupKey, created.vsb_capexprojectcontractid] as const;
  });
  const resolvedIdByGroup = new Map<string, string>(resolved);

  const resolvedRows = changedRows.map((r) => (
    r.projectContractId
      ? r
      : { ...r, projectContractId: resolvedIdByGroup.get(`${r.subAccountId}|${r.description}`) ?? null }
  ));

  const plan = costWrites(resolvedRows, existingCosts);

  // The bulk of a save: one write per changed month cell. Every entry names a distinct cost row
  // — `costWrites` plans at most one per (contract, year, month) — so nothing here waits on
  // anything else here, and this is the phase the pool actually buys the time back on.
  await forEachLimit(plan.upserts, async (u) => {
    if (u.costId) {
      unwrap(await Vsb_capexcostsService.update(u.costId, { vsb_cost: u.cost }), "update CAPEX cost");
    } else if (u.contractId) {
      unwrap(
        await Vsb_capexcostsService.create({
          vsb_cost: u.cost,
          vsb_year: u.year,
          vsb_month: u.month,
          "vsb_Contract@odata.bind": bind("vsb_capexprojectcontracts", u.contractId),
          ...(owningBusinessUnitId
            ? { "owningbusinessunit@odata.bind": bind("businessunits", owningBusinessUnitId) }
            : {}),
        } as never),
        "create CAPEX cost",
      );
    }
  });

  // Deletes before the total recompute below, so the sum reflects the sheet's final state. That
  // is why they stay a separate AWAITED phase rather than joining the upserts above.
  await forEachLimit(
    plan.deletes,
    (costId) => deleteRecord("delete CAPEX cost", CAPEX_COSTS.entitySetName, costId),
  );

  const touchedContractIds = [...new Set<string>([
    ...resolvedIdByGroup.values(),
    ...upserts.map((u) => u.contractId).filter((id): id is string => id !== null),
  ])];

  /*
   * Indexed once instead of re-scanned per contract. This loop used to walk ALL of `existingCosts`
   * and ALL of `plan.upserts` for every touched contract, with an `existingCosts.find` per deleted
   * row inside that — quadratic in a category that can hold thousands of cost rows. The merge and
   * its precedence are unchanged: existing values, then this save's, then the deletions.
   */
  const group = <T>(rows: readonly T[], key: (row: T) => string) => {
    const out = new Map<string, T[]>();
    for (const row of rows) {
      const k = key(row);
      const bucket = out.get(k);
      if (bucket) bucket.push(row); else out.set(k, [row]);
    }
    return out;
  };
  const existingByContract = group(existingCosts, (c) => c.contractId);
  const upsertsByContract = group(plan.upserts, (u) => u.contractId ?? "");
  const existingById = new Map(existingCosts.map((c) => [c.id, c]));
  const deletedByContract = group(
    plan.deletes.map((id) => existingById.get(id)).filter((c): c is ExistingCost => c !== undefined),
    (c) => c.contractId,
  );

  // One contract's total has no bearing on another's.
  // Unwrapped (rule 3): the SDK resolves a refused update as `{ success: false }`, never a throw.
  await forEachLimit(touchedContractIds, async (contractId) => {
    const merged = new Map<string, number>();
    for (const c of existingByContract.get(contractId) ?? []) merged.set(`${c.year}-${c.month}`, c.cost ?? 0);
    for (const u of upsertsByContract.get(contractId) ?? []) merged.set(`${u.year}-${u.month}`, u.cost);
    for (const c of deletedByContract.get(contractId) ?? []) merged.delete(`${c.year}-${c.month}`);
    const total = recomputeContractTotal([...merged.values()].map((cost) => ({ cost })));
    unwrap(
      await Vsb_capexprojectcontractsService.update(contractId, { vsb_totalcost: total } as never),
      "update CAPEX contract total",
    );
  });

  /*
   * Deletes last, CHILDREN BEFORE PARENTS: comments, then cost rows, then the contract.
   *
   * The comment half was missing here exactly as it was in `deleteCostLine`
   * (`capexWrites.ts`) before it was fixed — the canvas runs `RemoveIf('Capex Comments', …)` as
   * part of contract deletion, and without it every contract this sheet removed left its whole
   * thread behind: invisible in the app, and counted by the next `loadComments` for any contract
   * that reused the id.
   *
   * A `vsb_capexcomments` row points at BOTH the contract (`vsb_CapexContract`) and, for a
   * payment-date comment, the month's cost row (`vsb_CapexCost`), so it is a child of both and
   * has to go before either — hence comments first, not merely "before the contract".
   *
   * One `loadComments` for ALL the doomed contracts rather than one per contract: it already
   * chunks its `lookupIn` at 40 ids, and this screen can delete a whole category's worth at once.
   * It is hoisted out of the loop so the single round trip happens before any delete does.
   */
  if (args.contractDeleteIds.length > 0) {
    const comments = await loadComments(args.contractDeleteIds);
    const flattened = comments.map((c) => ({ id: c.id, contractId: c.contractId ?? "" }));
    for (const contractId of args.contractDeleteIds) {
      const plan = planDeleteContract(contractId, flattened);
      for (const commentId of plan.commentIds) await deleteComment(commentId);
      /*
       * A contract's cost rows are siblings of one another and children of nothing but that
       * contract, so they may go together — but the three STEPS stay strictly ordered, and so do
       * the contracts against each other. This is the one place where the ordering IS the
       * guarantee: the writes are not transactional, so an interrupted delete must never leave a
       * comment or a cost row pointing at a contract that is already gone.
       */
      await forEachLimit(
        existingCosts.filter((c) => c.contractId === contractId),
        (c) => deleteRecord("delete CAPEX cost", CAPEX_COSTS.entitySetName, c.id),
      );
      await deleteRecord("delete CAPEX contract", CAPEX_CONTRACTS.entitySetName, plan.contractId);
    }
  }
}
