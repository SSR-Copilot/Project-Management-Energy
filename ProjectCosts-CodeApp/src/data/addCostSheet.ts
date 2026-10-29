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
 *
 * The generic bulk SENDER (`upsertRowsByAction` with its per-action 501 fallback and session
 * flags, the module gates `saveGate` / `contractDeleteGate` / `costDeleteGate`, the request stats
 * and `existingIds`) lives in `./bulkSend.ts`, shared with the CAPEX Add/Edit Cost panel's save
 * (`./capexWrites.ts`), so both saves pass the same gates. What stays here is the sheet save's
 * own: `skipUpsertVerify`, the delete pools (`deleteLimit`), the 404 read-back
 * (`deleteOr404`, `verifyNotFound`) and the orchestration and log of `saveAddCostSheetBulk`.
 */
import { Vsb_capexprojectcontractsService } from "@/generated/services/Vsb_capexprojectcontractsService";
import { Vsb_capexcostsService } from "@/generated/services/Vsb_capexcostsService";
import { DataError, isRecordGone, unwrap } from "@/platform/errors";
import { deleteRecord, fetchAll } from "./client";
import { ACTIVE, and, bind, chunk, idIn, lookupEq, lookupIn, numberOf } from "./odata";
import { forEachLimit, mapLimit } from "./concurrency";
import { loadCostAccounts, loadPayerDefaults } from "./costBook";
import {
  excludePendingCosts, excludePendingFromSheet, pendingDeletes, pendingExcept,
} from "./pendingDeletes";
import { deleteComment, loadComments } from "./comments";
import { BulkDeleteError, deleteMany } from "./bulkWrites";
import type { BulkTableInfo, SaveBuildPlan, SavedSheetChanges, UpsertTarget } from "./bulkTypes";
import {
  CONTRACT_DELETE_LIMIT, COST_DELETE_LIMIT, contractDeleteGate, costDeleteGate, createRequestMeter,
  existingIds, formatMs, formatRequestDuration, isBulkUnavailable, upsertRowsByAction,
  type RequestMeter, type UpsertGroupReport,
} from "./bulkSend";
import {
  emitSaveLog, errorChainLines, failureSection, gateTail, groupsText, inStartOrder, messageOf, plural,
  rawErrorSection, requestsSection, rootMessageOf, stepsSection,
  type SaveLogReport, type SaveLogRow, type SaveLogSection, type SaveLogStep,
} from "./saveLog";
import {
  CAPEX_CONTRACTS, CAPEX_COSTS, RowsGoneError, SavePlanError, executeSavePlan,
  type BackgroundOutcome, type SavePlanDeps,
} from "./addCostSheetBulk";
import { planDeleteContract } from "@/features/cost/capex-costs/rules";
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

/* ═══════════════════════════════════════════════════════════ the save log (D58) ══ */

/** Whether the background deletes failed (any group, or the generic error). */
function backgroundFailed(outcome: BackgroundOutcome): boolean {
  return outcome.error !== undefined || outcome.costDeleteError !== undefined
    || outcome.contractDeleteError !== undefined;
}

/** The first background error to name in the one-liner: cost, contract, reconcile, then the generic one. */
function backgroundErrorOf(outcome: BackgroundOutcome): unknown {
  return outcome.costDeleteError ?? outcome.contractDeleteError ?? outcome.reconcileError ?? outcome.error;
}

/**
 * `Add Cost from Table background deletes: costs N req, contracts M req, 7,412 ms[, failed][, totals
 * reconciled|totals NOT reconciled][; error: <the root Dataverse message, ids replaced>]`. `T`
 * counts from the start of the save (when the deletes were sent). The totals clause appears only
 * when a background reconcile ran; the error clause when something failed.
 */
export function backgroundDeleteLogLine(
  outcome: BackgroundOutcome, requests: { costs: number; contracts: number }, ms: number,
): string {
  const failed = backgroundFailed(outcome);
  const state = reconcileStateOf(outcome);
  const error = backgroundErrorOf(outcome);
  return `Add Cost from Table background deletes: costs ${requests.costs} req, `
    + `contracts ${requests.contracts} req, ${formatMs(ms)}`
    + (failed ? ", failed" : "")
    + (state === "reconciled" ? ", totals reconciled" : state === "not reconciled" ? ", totals NOT reconciled" : "")
    + (error !== undefined ? `; error: ${readableRoot(error)}` : "");
}

/**
 * The background reconcile's state, the one rule for both the A5 line and its group: it ran when
 * the outcome carries `reconciled` or a `reconcileError`; it reconciled only when `reconciled` is
 * true and nothing failed.
 */
function reconcileStateOf(outcome: BackgroundOutcome): "reconciled" | "not reconciled" | "not run" {
  if (outcome.reconciled === undefined && outcome.reconcileError === undefined) return "not run";
  return outcome.reconciled === true && outcome.reconcileError === undefined ? "reconciled" : "not reconciled";
}

/**
 * The plan-refusal wording (D58 decision 3): a `SheetConflictError`'s message and detail carry
 * contract and account names (`ADDCOST_SAVE_MSG.conflict*`), so every READABLE line names the
 * refusal with this fixed text instead; the detail stays in the raw error group only.
 */
const CONFLICT_TEXT = "refused while planning (conflict between sheet rows)";

/**
 * The error to print readably: a name-free stand-in for a `SheetConflictError`, the error itself
 * otherwise. Pass the REAL error to `rawErrorSection`.
 */
function readableError(error: unknown): unknown {
  if (!(error instanceof SheetConflictError)) return error;
  const standIn = new Error(`${CONFLICT_TEXT}; the rows' detail is in the raw error group`);
  standIn.name = "SheetConflictError";
  return standIn;
}

/** `rootMessageOf` of `readableError`. */
function readableRoot(error: unknown): string {
  return rootMessageOf(readableError(error));
}

/**
 * The Requests group's verify and 404 lines, and what the counts leave out (shared by the success
 * and the failure report).
 */
function verifyLines(verifyRan: boolean, alreadyGone: number): string[] {
  return [
    `Existence check before writing: ${verifyRan ? "ran" : "skipped (first attempt)"}`,
    `Deletes whose row was already gone (confirmed by a read-back): ${alreadyGone}`,
    "Not counted as requests: the reconcile's cost reads and the per-row fallback's existence check",
  ];
}

/**
 * `Add Cost from Table background deletes started: costs 16 rows at 2,345 ms, delete gate 0/4
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
  return `Add Cost from Table background deletes started: ${kind} ${plural(rows, "row")} at ${formatMs(ms)}, `
    + `delete gate ${busy}/${limit} busy`;
}

/** One delete batch of a save, for the logs (D58: the background group's table). */
interface DeleteBatch {
  label: string;
  /** From the start of the save. */
  startMs: number;
  ms: number;
  /** Requests sent, delete calls plus 404 read-backs. */
  requests: number;
  /** 404 read-back requests among them. */
  readBack: number;
  /** Deletes whose row was confirmed already gone. */
  alreadyGone: number;
  ok: boolean;
}

/** The background group's batch table (pure). */
function deleteBatchRows(batches: readonly DeleteBatch[]): SaveLogRow[] {
  return [...batches].sort((a, b) => a.startMs - b.startMs).map((b) => ({
    Batch: b.label,
    Started: formatRequestDuration(b.startMs),
    Took: formatRequestDuration(b.ms),
    Requests: b.requests,
    "404 read-backs": b.readBack,
    "Already gone": b.alreadyGone,
    Result: b.ok ? "ok" : "FAILED",
  }));
}

/** The "Plan" group: what `buildSavePlan` decided, counts only (no ids, no names). */
function planSection(plan: Pick<SaveBuildPlan,"stats" | "contractDeletes" | "costDeletes" | "costDeletesIfExist" | "totals">): SaveLogSection {
  const s = plan.stats;
  return {
    title: "Plan",
    lines: [
      `Contracts: ${s.contractsCreated} created, ${s.contractsUpdated} updated, ${s.contractsDeleted} deleted`,
      `Cost rows: ${s.costsCreated} created, ${s.costsUpdated} updated, ${s.costsDeleted} deleted`,
      `Changed cells equal to the stored value (nothing written): ${s.noOpCells}`,
      `Cost deletes planned: ${plan.costDeletes.length}; only if they still exist (left by a failed attempt): ${plan.costDeletesIfExist.length}`,
      `Contract deletes planned: ${plan.contractDeletes.length} (their cost rows and comments go by the Dataverse cascade)`,
      `Contract totals planned: ${plan.totals.size}`,
    ],
  };
}

/** The facts a save error carries, in words (counts and flags only). */
function failureFacts(error: unknown): string[] {
  const facts: string[] = [];
  if (error instanceof SavePlanError) {
    facts.push(
      `Phase: ${error.phase}`,
      `Operations failed: ${error.failures.length} (phases ${error.failures.map((f) => f.phase).join(", ")})`,
      `Something reached Dataverse before the failure: ${error.committedBefore ? "yes (or may have)" : "no"}`,
      `Contract totals: ${error.reconcileError !== undefined ? "could NOT be reconciled" : error.reconciled ? "consistent with what landed" : "may not match"}`,
    );
    if (error.unverifiedContractIds.length > 0) facts.push(`New contracts with an unknown outcome (never reconciled): ${error.unverifiedContractIds.length}`);
  } else if (error instanceof RowsGoneError) {
    facts.push(
      `Rows deleted by someone else since the sheet loaded: ${plural(error.gone.contracts, "contract")}, ${plural(error.gone.costs, "cost row")}; no upsert was sent`,
      `Deletes sent alongside the check landed: ${error.committedBefore ? "yes (or may have)" : "no"}`,
    );
  } else if (error instanceof SheetConflictError) {
    facts.push("Refused while planning: nothing was sent");
  }
  return facts;
}

/**
 * The screen's message, when it may be printed readably. A conflict's message names contracts and
 * accounts (`ADDCOST_SAVE_MSG.conflict*`), so it is never printed; the general rule is that a
 * message built from record names is left out. Every other kind's text is fixed wording with counts.
 */
function screenTextOf(kind: SaveFailure["kind"], userText: string): string {
  return kind === "conflict"
    ? `the screen shows the conflict message (it names the rows, so it is left out; see the raw error)`
    : `the screen shows: "${messageOf(userText)}"`;
}

/** The Failure group of `error`, readable and name-free (`readableError`). */
function readableFailure(error: unknown, steps: readonly SaveLogStep[] = []): SaveLogSection {
  return failureSection(readableError(error), steps, failureFacts(error));
}


/** The requests a save error knows it sent (`SavePlanError` / `RowsGoneError`), else undefined. */
function requestsOf(error: unknown): number | undefined {
  const total = (error as { requests?: { total?: unknown } } | null)?.requests?.total;
  return typeof total === "number" ? total : undefined;
}

/** The prepare timings the screen logs (`prepareSheetSave`'s `timings`). */
interface PrepareLogTimings {
  total: number; roundTripCheck: number; align: number; diff: number; deletions: number; orphans: number;
}

/**
 * A1, the screen's prepare line and group: `Add Cost from Table prepare: 4.2 ms (round-trip check
 * 0.3 ms, …; 96 rows)`. Timings keep one decimal: these client steps are often under 1 ms.
 */
export function prepareLogReport(
  t: PrepareLogTimings, readBackMs: number, validationMs: number, rows: number,
): SaveLogReport {
  const d = (n: number) => formatMs(n, 1);
  return {
    summary: `Add Cost from Table prepare: ${d(t.total)} (round-trip check ${d(t.roundTripCheck)}, `
      + `align ${d(t.align)}, diff ${d(t.diff)}, deletions ${d(t.deletions)}, `
      + `orphans ${d(t.orphans)}; last edit's grid read-back ${d(readBackMs)}, `
      + `validation ${d(validationMs)}; ${plural(rows, "row")})`,
    sections: [{
      title: "Prepare (client side)",
      lines: [
        `Total ${d(t.total)}, before any request is sent`,
        `Round-trip check ${d(t.roundTripCheck)}: every contract the sheet was built from is still matched`,
        `Align ${d(t.align)}, diff ${d(t.diff)}, deletions ${d(t.deletions)}, orphan clean-up ${d(t.orphans)}`,
        `The last edit's grid read-back took ${d(readBackMs)} and its validation ${d(validationMs)}`,
        `Rows on the sheet: ${rows.toLocaleString("en-US")}`,
      ],
    }],
  };
}

/**
 * A7, the screen's catch: what the screen classified and showed, then the readable chain, then the
 * raw error object (kept for support, collapsed). `kind` is `toSaveFailure`'s.
 */
export function screenSaveFailureReport(error: unknown, kind: SaveFailure["kind"], userText: string): SaveLogReport {
  return {
    summary: `Add Cost from Table save failed: ${kind}; ${screenTextOf(kind, userText)}`,
    sections: [readableFailure(error), rawErrorSection(error)],
  };
}

/** A8: the cached-book patch after a successful Save threw (the Save stands; the refetch repairs). */
export function bookPatchFailureReport(error: unknown): SaveLogReport {
  return {
    summary: "Add Cost from Table: patching the DEVEX/CAPEX book failed; the save itself succeeded "
      + `and the refetch brings the saved state: ${readableRoot(error)}`,
    sections: [readableFailure(error), rawErrorSection(error)],
  };
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
 * rows, the two sent in parallel (`upsertRowsByAction`, `./bulkSend.ts`), and a group of 50 rows or more split into
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
 * LOG (D58, `./saveLog.ts`). One summary line per save through `console.info`: total ms, requests,
 * per-step timings IN START ORDER (each bulk request's own server duration in brackets, e.g.
 * `upsert contracts (create 1 req bulk [980 ms], update 1 req bulk [10,740 ms])`; the two cost
 * stages named `upsert costs (existing contracts)` / `(new contracts)` in the log only), then
 * THIS save's gate peak and request statistics (its own `RequestMeter`; the shared gate's peak
 * only when other work raised it), whether verify ran, and how many deletes found their row
 * already gone. Every duration in exact ms with a thousands separator (`formatMs`). Below the
 * line, collapsed groups: Plan, Steps, Deferred deletes, Requests. A failure (including a refused
 * plan, `SheetConflictError`) logs `Add Cost from Table save failed after …` with its request
 * count and root error, and a Failure group with the readable chain.
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
  // So this save counts its OWN write requests on its own meter (D58, measurement only): `meters.save`
  // until the save line is printed, then `meters.background` for this save's background reconcile,
  // so that never lands in the save line either. Another caller's writes are not counted; they
  // show only as the shared gate peak.
  const meters = { save: createRequestMeter(), background: createRequestMeter() };
  let meter = meters.save;
  let alreadyGone = 0;
  let refreshRequests = 0;
  const started = performance.now();
  const elapsed = (t0: number) => performance.now() - t0;
  /** One timed step: its text in the one-liner and its row in the steps table. */
  interface Entry { text: string; step: SaveLogStep }
  // Steps of the save itself, and the ones that finish after the save line (background reconcile).
  let printed = false;
  const entries: Entry[] = [];
  const backgroundEntries: Entry[] = [];
  const record = (entry: Entry) => { (printed ? backgroundEntries : entries).push(entry); };
  /** `gate peak 4/16, req avg 1,240 ms max 1,900 ms, verify skipped, 0 already gone`. */
  const measures = () => `${gateTail(meters.save)}, verify ${verifyUpserts ? "ran" : "skipped"}, ${alreadyGone} already gone`;
  /**
   * Per kind of delete: the requests SENT (each delete call, plus 404 read-backs), counted as they
   * go so a failed batch still reports them (the background line), the entries of its batches
   * (kept apart because a DEFERRED kind is shown as `delete … deferred` in the save line instead,
   * even when it happened to finish before the Save returned), and its batches for the logs.
   */
  const deletes = {
    costs: { sent: 0, entries: new Set<Entry>(), batches: [] as DeleteBatch[] },
    contracts: { sent: 0, entries: new Set<Entry>(), batches: [] as DeleteBatch[] },
  };
  const deleteKind = (table: BulkTableInfo) =>
    (table.entitySetName === CAPEX_CONTRACTS.entitySetName ? deletes.contracts : deletes.costs);
  /**
   * `SavePlanDeps.deleteMany`: `deleteMany` with a deleter that resolves on 404, then the 404s
   * checked (`verifyNotFound`). Confirmed ones are counted as already gone for the log; `track`
   * receives the read-backs and confirmations, also when the batch then throws.
   */
  const verifiedDeleteMany = async (
    table: BulkTableInfo, ids: readonly string[], label: string,
    track: { sent: number; readBack: number; confirmed: number },
  ) => {
    const kind = deleteKind(table);
    const notFound = new Map<string, DataError>();
    let sent: { requests: number } | undefined;
    let failure: unknown;
    try {
      try {
        sent = await deleteMany(table, ids, async (tableName, id) => {
          kind.sent += 1;
          track.sent += 1;
          const answer = await deleteOr404(label, tableName, id);
          if (answer) notFound.set(id, answer);
        }, { label, limit: deleteLimit(table) });
      } catch (error) {
        failure = error;
      }
      const checked = await verifyNotFound(table, ids, label, notFound, sent, failure);
      alreadyGone += checked.confirmed;
      kind.sent += checked.readBack;
      track.sent += checked.readBack;
      track.readBack = checked.readBack;
      track.confirmed = checked.confirmed;
      return { requests: checked.requests, readBack: checked.readBack, removed: checked.removed };
    } catch (error) {
      // A read-back sent before failing is still a request sent.
      if (notFound.size > 0) {
        const readBack = chunk([...notFound.keys()]).length;
        kind.sent += readBack;
        track.sent += readBack;
        track.readBack = readBack;
      }
      throw error;
    }
  };
  /** One entry per call: `<name> <detail of the result, or "failed"> <ms>`. */
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
        const ms = elapsed(t0);
        const label = name(...a);
        record({
          text: `${[label, outcome].filter(Boolean).join(" ")} ${formatMs(ms)}`,
          step: { label, startMs: t0 - started, ms, status: outcome === "failed" ? "failed" : "ok" },
        });
      }
    };
  /**
   * `<step> (create N req bulk [980 ms], update M req per-row after 501) <ms>`. A bulk group names
   * each request's own server duration in brackets (`gated`: inside the gate, so queueing is
   * excluded), which shows contention that the group's wall time alone hides. The orchestrator's
   * labels already carry the verb ("upsert contracts", "reconcile totals"); `step` names the two
   * cost stages in the log only (D58), `label` stays the phase label every error carries.
   */
  const upsert = async (table: BulkTableInfo, rows: readonly UpsertTarget[], label: string, step?: string) => {
    const t0 = performance.now();
    const name = step ?? label;
    const counted = meter;
    let groups = "not sent";
    let reports: readonly UpsertGroupReport[] = [];
    let requests: number | undefined;
    try {
      const result = await upsertRowsByAction(
        table, rows, label, (summary, g) => { groups = summary; reports = g; },
        { guardPerRowUpdates: !verifyUpserts, meter: counted },
      );
      requests = result.requests;
      return result;
    } finally {
      const ms = elapsed(t0);
      record({
        text: `${name} (${groups}) ${formatMs(ms)}`,
        step: {
          label: name, startMs: t0 - started, ms, detail: groupsText(reports),
          status: requests === undefined ? "failed" : "ok",
          ...(requests === undefined ? {} : { requests }),
        },
      });
    }
  };
  const entryText = (list: readonly Entry[]) => inStartOrder(list.map((e) => ({ startMs: e.step.startMs, e })))
    .map(({ e }) => e.text).join(", ");
  const countedRequests = () => refreshRequests + meters.save.count + deletes.costs.sent + deletes.contracts.sent;
  /**
   * The requests a FAILED save sent, failing ones included (D58): the error's own `requests.total`
   * counts only the operations that succeeded, so the log takes this save's counted requests
   * (refresh reads, every gated write, every delete and 404 read-back) plus the error's verify
   * reads, and never less than the error's total.
   */
  const failedRequests = (error: unknown) => {
    const reported = requestsOf(error);
    const verify = (error as { requests?: { verify?: unknown } } | null)?.requests?.verify;
    return Math.max(reported ?? 0, countedRequests() + (typeof verify === "number" ? verify : 0));
  };
  /**
   * A3: the failure line and its groups. `opts.note` says what the line cannot (e.g. nothing
   * written); `opts.count` replaces the request count when it is not known (a failed refresh read
   * sent reads nobody counted); `opts.raw` adds the raw error group (a refused plan, whose readable
   * text leaves the rows' names out). Readable text never carries a conflict's names
   * (`readableError`).
   */
  const logFailure = (
    error: unknown, opts: { planned?: SaveBuildPlan; note?: string; count?: string; raw?: boolean } = {},
  ) => {
    emitSaveLog(() => {
      const steps = entries.map((e) => e.step);
      const reported = requestsOf(error);
      return {
        summary: `Add Cost from Table save failed after ${formatMs(elapsed(started))}, `
          + `${opts.count ?? plural(failedRequests(error), "request")} (${entryText(entries)}); ${measures()}`
          + `${opts.note ? `; ${opts.note}` : ""}; error: ${readableRoot(error)}`,
        sections: [
          readableFailure(error, steps),
          ...(opts.planned ? [planSection(opts.planned)] : []),
          stepsSection(steps),
          requestsSection(meters.save, [
            ...(reported === undefined ? [] : [`Requests of the operations that succeeded (the error's own count): ${reported}`]),
            ...verifyLines(verifyUpserts, alreadyGone),
          ]),
          ...(opts.raw ? [rawErrorSection(error)] : []),
        ],
      };
    });
  };
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
      refreshRequests = fresh.requests;
      const ms = elapsed(t0);
      record({
        text: `refresh ${fresh.requests} req ${formatMs(ms)}`,
        step: { label: "refresh", startMs: t0 - started, ms, requests: fresh.requests, detail: "re-read before planning", status: "ok" },
      });
    } catch (error) {
      const ms = elapsed(t0);
      record({ text: `refresh failed ${formatMs(ms)}`, step: { label: "refresh", startMs: t0 - started, ms, status: "failed" } });
      // The refresh reads run in parallel and a failed one does not say how many were sent.
      logFailure(error, { note: "nothing was written", count: "refresh read failed" });
      throw error;
    }
  }
  const planStarted = performance.now();
  let plan: ReturnType<typeof buildSavePlan>;
  try {
    plan = buildSavePlan({ ...input, pendingIds: idCache }, { newId });
  } catch (error) {
    // A refused plan (`SheetConflictError`) sends nothing: say so, then rethrow it unchanged.
    const ms = elapsed(planStarted);
    record({ text: `plan failed ${formatMs(ms)}`, step: { label: "plan", startMs: planStarted - started, ms, status: "failed" } });
    logFailure(error, { note: "nothing was written", raw: true });
    throw error;
  }
  {
    const ms = elapsed(planStarted);
    record({ text: `plan ${formatMs(ms)}`, step: { label: "plan", startMs: planStarted - started, ms, status: "ok" } });
  }
  const deps: SavePlanDeps = {
    upsert,
    // `timed`'s entry, also filed under its kind (`deletes.*`) for the save line and the logs.
    deleteMany: async (table, ids, label, step) => {
      const isContracts = table.entitySetName === CAPEX_CONTRACTS.entitySetName;
      if (isContracts ? deferContractDeletes : deferCostDeletes) {
        // Only a deferred kind: `executeSavePlan` sends it after the writes settled.
        console.info(backgroundDeleteStartLine(
          isContracts ? "contracts" : "costs", ids.length, elapsed(started),
          (isContracts ? contractDeleteGate : costDeleteGate).inFlight(),
          isContracts ? CONTRACT_DELETE_LIMIT : COST_DELETE_LIMIT,
        ));
      }
      const kind = deleteKind(table);
      const t0 = performance.now();
      // This call's own requests: two batches of one kind (`costDeletes` and the retry-only
      // `costDeletesIfExist`) can be in flight together, so `kind.sent` cannot be diffed.
      const track = { sent: 0, readBack: 0, confirmed: 0 };
      const name = step ?? label;
      let outcome = "failed";
      let ok = false;
      try {
        const r = await verifiedDeleteMany(table, ids, label, track);
        outcome = `${r.requests} req${r.readBack > 0 ? ` (${r.readBack} 404 read-back)` : ""}`;
        ok = true;
        return r;
      } finally {
        const ms = elapsed(t0);
        const requests = track.sent;
        const entry: Entry = {
          text: `${name} ${outcome} ${formatMs(ms)}`,
          step: {
            label: name, startMs: t0 - started, ms, requests, status: ok ? "ok" : "failed",
            detail: `${plural(ids.length, "row")}${track.readBack > 0 ? `, ${track.readBack} 404 read-back, ${track.confirmed} already gone` : ""}`,
          },
        };
        kind.entries.add(entry);
        kind.batches.push({
          label: name, startMs: t0 - started, ms, requests, readBack: track.readBack, alreadyGone: track.confirmed, ok,
        });
        // A delete never lands among the background reconcile's steps: its batch is in `batches`.
        if (!printed) entries.push(entry);
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
    logFailure(error, { planned: plan });
    throw error;
  }
  // A kind is deferred exactly when the orchestrator holds it back (its flag on, something to
  // delete, and the save returned early): its requests are then outside `requests.total`, so its
  // timing entries are left out of this line too, even ones that settled before the return, and
  // `delete … deferred` stands in their place. Its counts come in the background line.
  const deferredCosts = result.background && deferCostDeletes
    ? plan.costDeletes.length + plan.costDeletesIfExist.length : 0;
  const deferredContracts = result.background && deferContractDeletes ? plan.contractDeletes.length : 0;
  const hidden = new Set<Entry>([
    ...(deferredCosts > 0 ? deletes.costs.entries : []),
    ...(deferredContracts > 0 ? deletes.contracts.entries : []),
  ]);
  const shown = entries.filter((entry) => !hidden.has(entry));
  const deferredSteps: SaveLogStep[] = [
    ...(deferredCosts > 0 ? [{ label: "delete costs", detail: `${plural(deferredCosts, "row")}, deleted after Save returned`, status: "deferred" as const }] : []),
    ...(deferredContracts > 0 ? [{ label: "delete contracts", detail: `${plural(deferredContracts, "contract")}, deleted after Save returned`, status: "deferred" as const }] : []),
  ];
  const line = [
    entryText(shown),
    ...(deferredCosts > 0 ? ["delete costs deferred"] : []),
    ...(deferredContracts > 0 ? ["delete contracts deferred"] : []),
  ].filter(Boolean).join(", ");
  const saveMs = elapsed(started);
  try {
    emitSaveLog(() => ({
      summary: `Add Cost from Table save: ${formatMs(saveMs)}, `
        + `${plural(result.requests.total, "request")} (${line}); ${measures()}`,
      sections: [
        planSection(plan),
        stepsSection([...shown.map((e) => e.step), ...deferredSteps]),
        ...(deferredSteps.length > 0 ? [{
          title: "Deferred deletes",
          lines: [
            `Cost rows deleted in the background: ${deferredCosts}`,
            `Contracts deleted in the background: ${deferredContracts} (their cost rows and comments go by the Dataverse cascade)`,
            "Their outcome follows on an \"Add Cost from Table background deletes:\" line once they settle.",
          ],
        }] : []),
        requestsSection(meters.save, [
          `Requests in all, reads and deletes included: ${result.requests.total.toLocaleString("en-US")}`,
          ...verifyLines(verifyUpserts, alreadyGone),
        ]),
      ],
    }));
  } catch {
    // Logging must never change the save's result.
  }
  // From here on, a write of this save (the background reconcile) is counted apart.
  printed = true;
  meter = meters.background;
  const applied = plan.applied;
  if (!result.background) return { applied };
  // The orchestrator's promise never rejects; the second handler keeps that true regardless.
  const settled = result.background.then(
    (outcome) => outcome,
    (error: unknown): BackgroundOutcome => ({ requests: 0, error }),
  );
  const background = settled.then((outcome) => {
    try {
      emitSaveLog(() => backgroundLogReport(
        outcome, deletes, backgroundEntries.map((e) => e.step), meters.background, elapsed(started), saveMs,
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
 * A5: the background deletes once they settled — the one-liner (`backgroundDeleteLogLine`), then
 * the batches (per-batch timing, requests, 404 read-backs), the background reconcile's read and
 * write steps and its own meter, and each error's readable chain. Pure.
 */
function backgroundLogReport(
  outcome: BackgroundOutcome,
  deletes: { costs: { sent: number; batches: readonly DeleteBatch[] }; contracts: { sent: number; batches: readonly DeleteBatch[] } },
  reconcileSteps: readonly SaveLogStep[],
  reconcileMeter: RequestMeter,
  ms: number,
  saveMs: number,
): SaveLogReport {
  const batches = [...deletes.costs.batches, ...deletes.contracts.batches];
  const state = reconcileStateOf(outcome);
  const sections: SaveLogSection[] = [{
    title: "Background deletes",
    lines: [
      `Settled ${formatRequestDuration(ms)} after the Save started, ${formatRequestDuration(Math.max(0, ms - saveMs))} after it returned`,
      `Requests: ${deletes.costs.sent} for cost rows, ${deletes.contracts.sent} for contracts (delete calls and 404 read-backs)`,
      `Result: ${backgroundFailed(outcome) ? "FAILED" : "every deferred delete succeeded"}`,
    ],
    table: deleteBatchRows(batches),
  }];
  if (state !== "not run" || reconcileSteps.length > 0) {
    const steps = stepsSection(reconcileSteps, "Background reconcile");
    sections.push({
      ...steps,
      lines: [
        `Contract totals: ${state === "reconciled" ? "reconciled (they match what landed)" : state === "not reconciled" ? "NOT reconciled (they may not match)" : "no reconcile needed"}`,
        ...requestsSection(reconcileMeter, [], "the background reconcile").lines,
        ...steps.lines,
      ],
    });
  }
  const errors: [string, unknown][] = [
    ["Cost delete", outcome.costDeleteError],
    ["Contract delete", outcome.contractDeleteError],
    ["Totals reconcile", outcome.reconcileError],
    ...(outcome.costDeleteError === undefined && outcome.contractDeleteError === undefined
      ? [["Background work", outcome.error] as [string, unknown]] : []),
  ];
  const errorLines = errors.filter(([, e]) => e !== undefined)
    .flatMap(([what, e]) => errorChainLines(readableError(e)).map((line, i) => (i === 0 ? `${what}: ${line}` : `  ${line}`)));
  if (errorLines.length > 0) sections.push({ title: "Errors", lines: errorLines });
  return {
    summary: backgroundDeleteLogLine(outcome, { costs: deletes.costs.sent, contracts: deletes.contracts.sent }, ms),
    sections,
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
  return firstAttempt && !isBulkUnavailable("create") && !isBulkUnavailable("update");
}

/** `deleteMany`'s pool for a table: the same size as that table's gate, so no task waits twice. */
function deleteLimit(table: BulkTableInfo): number {
  return table.entitySetName === CAPEX_CONTRACTS.entitySetName ? CONTRACT_DELETE_LIMIT : COST_DELETE_LIMIT;
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
