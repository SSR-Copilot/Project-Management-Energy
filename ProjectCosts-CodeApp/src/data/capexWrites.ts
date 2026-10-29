/**
 * CAPEX writes against Dataverse.
 *
 * Three operations, matching what the DEVEX/CAPEX screen actually does: mark a month paid or
 * unpaid, save a cost line, delete one.
 *
 * **Not transactional.** The SDK exposes create/update/delete per record and no changeset, so a
 * multi-row save can half-apply. The canvas has the same weakness — it patches inside `ForAll`
 * and removes in a second `ForAll` — and `ProjectDocs/app-docs/VSBCloud-Harness-Plan.md` §19 calls for one
 * `$batch` instead. Until that exists the writes are ordered so a failure leaves the most
 * recoverable state: the contract row first, then its cost rows, deletes last.
 *
 * **Owning business unit.** `vsb_capexprojectcontract` and `vsb_capexcost` are project data, so
 * every CREATE binds the project's business unit. Omitting it never errors — Dataverse derives
 * the BU from the caller — and the row simply becomes invisible later to a colleague scoped to a
 * different BU. The canvas does the same thing with
 * `'Owning Business Unit': gblSelectedProject.'Besitzer (Unternehmenseinheit)'`.
 *
 * **Two write paths for Save and Delete (D56, PROPOSED).** `PANEL_BULK_SAVE` routes them through
 * the bulk path: the month rows go out as `CreateMultiple` / `UpdateMultiple` through the same
 * sender, gates and per-action 501 fallback as Add Cost from Table (`./bulkSend.ts`, D51 §11.3),
 * and the independent requests run concurrently. `false` restores the per-row path below
 * (`saveCostLineLegacy`, `deleteCostLineLegacy`), unchanged. Both write the same columns, binds and
 * owning business unit; only the number and the order of the requests differ.
 */
import { Vsb_capexcostsService } from "@/generated/services/Vsb_capexcostsService";
import { Vsb_capexprojectcontractsService } from "@/generated/services/Vsb_capexprojectcontractsService";
import { unwrap } from "@/platform/errors";
import { capexWriteSet, type CostRowInput } from "@/features/cost/capex-costs/writeSet";
import { byClusterJson, planDeleteContract, startEndJson } from "@/features/cost/capex-costs/rules";
import {
  paidIdsToReset, paymentDateCommentIds, planPanelCostWrites,
} from "@/features/cost/capex-costs/savePlan";
import { deleteComment, loadComments } from "./comments";
import { deleteRecord } from "./client";
import { COMMENT_TYPE } from "@/features/cost/capex-costs/comments";
import { equalDistributionAmounts } from "@/features/cost/capex-costs/distribution";
import type { CostLine, Payment } from "@/features/cost/costing/model";
import { bind } from "./odata";
import { deleteMany } from "./bulkWrites";
import type { BulkTableInfo, UpsertTarget } from "./bulkTypes";
import { CAPEX_COSTS } from "./addCostSheetBulk";
import {
  createRequestMeter, formatMs, gatedWrite, upsertRowsByAction,
  type RequestMeter, type UpsertGroupReport,
} from "./bulkSend";
import { createGate } from "./concurrency";
import {
  emitSaveLog, failureSection, gateTail, groupsText, inStartOrder, plural, rawErrorSection, requestsSection,
  rootMessageOf, stepsSection, type SaveLogStep,
} from "./saveLog";

/** `vsb_costtype`, verified live: None 952850000 · DevCo 952850001 · SPV 952850002. */
const COST_TYPE = { devCo: 952850001, spv: 952850002 } as const;
/** `vsb_distribution`. */
const DISTRIBUTION = { equal: 952850000, individual: 952850001 } as const;
/** `vsb_distributionscheme`. */
const DISTRIBUTION_SCHEME = { percent: 952850000, absolute: 952850001 } as const;

export interface CapexWriteContext {
  projectId: string;
  /** From `session.project.owningBusinessUnitId`. */
  owningBusinessUnitId?: string;
}

/* ═══════════════════════════════════════════════════════════ paid toggle ══ */

/**
 * Mark one month paid or unpaid.
 *
 * A single field on a single row — the cheapest write in the module, and the one the grid
 * triggers most. The PCF only makes a cell clickable when it holds a cost, so `costId` is
 * always known by the time this is called.
 */
export async function setCostPaid(costId: string, paid: boolean): Promise<void> {
  unwrap(
    await Vsb_capexcostsService.update(costId, { vsb_costpaid: paid }),
    "set cost paid",
  );
}

/* ═════════════════════════════════════════════════════════════ save line ══ */

export interface SaveCostLineArgs extends CapexWriteContext {
  line: CostLine;
  /** The sub-account the cost is filed under. */
  accountId: string;
  /**
   * What the panel proposes for the twelve months, across every year it touches.
   *
   * `amount: null` means "this month had a row and no longer should" — `reconcilePayments`
   * appends one of those for every month the contract is losing, and `capexWriteSet` turns it
   * into a delete. A save that only ever passed the proposed months could never shrink a
   * contract's schedule.
   */
  payments: readonly { id?: string; year: number; month: number; amount: number | null }[];
  /**
   * Whether this is a create. Passed in rather than inferred: the panel mints a
   * `crypto.randomUUID()` for a new line, which is indistinguishable from a real Dataverse id.
   * The screen knows the answer — it opened the panel.
   */
  isNew: boolean;
  /**
   * `locMilestoneRelinkResetNeeded` — the relink confirmation was shown AND accepted.
   *
   * The canvas' `OnConfirm` (`CapexScreenCode.txt:19906-19925`) runs, BEFORE re-triggering the
   * save,
   *
   *     UpdateIf('CAPEX Costs', Contract = <this contract> && 'Cost Paid' = true,
   *              {'Cost Paid': false});
   *     RemoveIf('Capex Comments',
   *              'Capex Contract' = <this contract>
   *              && 'Comment Type' = 'Capex Comment Type'.'Comments to payment date')
   *
   * because "Paid" markers and payment-date comments are not supported on a milestone-linked
   * cost — which is exactly what the dialog's third bullet promises the user. Folding it into
   * the save keeps the promise and the write in one place; `needsClusterLinkageConfirmation`
   * (`features/capex-costs/rules.ts`) decides whether the dialog is shown at all.
   */
  resetPaidAndPaymentDateComments?: boolean;
  /**
   * The months the contract had when the panel opened (`storedLine.payments`). Read only by the
   * bulk path's unchanged-month skip (`SKIP_UNCHANGED_COSTS`); without it every month is written.
   */
  storedPayments?: readonly Payment[];
}

/* ═══════════════════════════════════════════════════════════ switches ══ */

/**
 * DIVERGENCE (D56, PROPOSED): the panel's Save and Delete use the bulk path. `false` restores the
 * per-row path exactly as it was before D56. Treat it like `BULK_SAVE` in `./addCostSheet.ts`: a
 * live product decision, not dead code.
 */
export const PANEL_BULK_SAVE = true;

/**
 * DIVERGENCE (D56 §3, PROPOSED): the bulk path does not write an existing month whose stored
 * amount already equals the new one (`planPanelCostWrites`). `false` writes every month, as the
 * per-row path does.
 */
export const SKIP_UNCHANGED_COSTS = true;

/**
 * Local measuring aid: in a DEV build (`npm run dev` behind `pac code run`), running
 * `sessionStorage.setItem("vsb.capexPanel.legacySave", "1")` in the console sends the next saves
 * through the per-row path, so before/after timings come from one build. Never read in a
 * deployed build.
 */
export const LEGACY_SAVE_OVERRIDE_KEY = "vsb.capexPanel.legacySave";

function bulkPathEnabled(): boolean {
  if (!PANEL_BULK_SAVE) return false;
  if (!import.meta.env.DEV) return true;
  try {
    return globalThis.sessionStorage?.getItem(LEGACY_SAVE_OVERRIDE_KEY) !== "1";
  } catch {
    return true;
  }
}

/* ═══════════════════════════════════════════════════════════════ timing ══ */

/** How one step counts its requests (`SaveLog.step`). */
interface StepOptions<T> {
  /**
   * Requests this step SENT, also when it failed (a refused request is still a request). Called
   * once the step settled. Absent for the one `rest` step (below).
   */
  count?: (result: T | undefined) => number;
  /**
   * The month writes (`costs`) of a bulk save: their requests pass this save's `RequestMeter`, and
   * so does every contract write (always exactly 1, `count`). At print time, when every request has
   * settled, `rest` = meter requests − the counted gated steps' requests. Exact on success AND on
   * failure (a refused `UpdateMultiple`, a 501 and its per-row fallback), with no race between
   * the two concurrent write steps. At most one `rest` step per log.
   */
  rest?: boolean;
  /** The request passes the meter (a contract write): its `count` is subtracted from `rest`. */
  gated?: boolean;
  /** The one-line summary's parenthesised detail (exact ms). */
  detail?: () => string;
  /** The steps table's "How" cell (readable durations). */
  how?: () => string;
}

interface RecordedStep {
  name: string;
  startMs: number;
  ms: number;
  failed: boolean;
  /** Undefined for the `rest` step until `print`. */
  requests?: number;
  rest: boolean;
  gated: boolean;
  detail?: string;
  how?: string;
}

/**
 * One panel save's or delete's steps for its console log (D59): the one-line summary
 * `CAPEX panel save (bulk): 1,312 ms, 2 requests; contract update 1 req 1,301 ms; …; gate peak …`,
 * then collapsed Steps / Requests (and on failure Failure / Raw error) groups, through
 * `emitSaveLog`. Steps are listed in START order; every request a step sent is counted, also when
 * it failed.
 *
 * GATE TAIL. Only the bulk SAVE sends its writes through the shared `saveGate` (each counted on
 * this save's own `meter`, D59 decision 4), so only its line ends in `gate peak …`. The per-row
 * path and the deletes pass no shared write gate; a tail there would read "0/16" and mislead.
 */
class SaveLog {
  private readonly t0 = performance.now();
  private readonly steps: RecordedStep[] = [];
  private readonly planned: string[] = [];
  private readonly path: "bulk" | "per-row";
  private readonly what: string;
  /** This save's gated write requests; read for the `rest` step and the gate tail. */
  readonly meter: RequestMeter = createRequestMeter();
  private readonly showsGate: boolean;

  constructor(path: "bulk" | "per-row", what: string, showsGate = false) {
    this.path = path;
    this.what = what;
    this.showsGate = showsGate;
  }

  /** Steps this run means to take, so a failure can list the ones never started as "not sent". */
  expect(...names: string[]): void {
    this.planned.push(...names);
  }

  /** Times `task` and records it; also on failure. */
  async step<T>(name: string, task: () => Promise<T>, opts: StepOptions<T> = {}): Promise<T> {
    const t = performance.now();
    let result: T | undefined;
    let failed = false;
    try {
      result = await task();
      return result;
    } catch (error) {
      failed = true;
      throw error;
    } finally {
      this.steps.push({
        name, startMs: t - this.t0, ms: performance.now() - t, failed,
        requests: opts.rest ? undefined : opts.count?.(result) ?? 0,
        rest: opts.rest === true, gated: opts.gated === true,
        detail: opts.detail?.() || undefined, how: opts.how?.() || undefined,
      });
    }
  }

  /** The recorded steps with every count settled, in start order. */
  private settled(): (RecordedStep & { requests: number })[] {
    const counted = this.steps.filter((s) => s.gated).reduce((n, s) => n + (s.requests ?? 0), 0);
    return inStartOrder(this.steps.map((s) => ({
      ...s, requests: s.rest ? Math.max(0, this.meter.count - counted) : s.requests ?? 0,
    })));
  }

  print(error?: { error: unknown }): void {
    try {
      const steps = this.settled();
      const requests = steps.reduce((n, s) => n + s.requests, 0);
      const summary = panelSaveLogLine({
        what: this.what, path: this.path, failed: error !== undefined, ms: performance.now() - this.t0,
        requests,
        steps: steps.map((s) => `${s.name} ${s.failed ? "FAILED" : `${s.requests} req`} ${formatMs(s.ms)}`
          + (s.detail ? ` (${s.detail})` : "")),
        ...(this.showsGate ? { gate: gateTail(this.meter) } : {}),
        ...(error ? { error: rootMessageOf(error.error) } : {}),
      });
      const recorded = new Set(steps.map((s) => s.name));
      const rows: SaveLogStep[] = [
        ...steps.map((s): SaveLogStep => ({
          label: s.name, startMs: s.startMs, ms: s.ms, requests: s.requests,
          ...(s.how ? { detail: s.how } : {}), status: s.failed ? "failed" : "ok",
        })),
        ...(error ? this.planned.filter((n) => !recorded.has(n)).map((label): SaveLogStep => ({ label, status: "skipped" })) : []),
      ];
      const requestsGroup = this.showsGate
        ? requestsSection(this.meter, [`Path: ${this.path}`])
        : { title: "Requests", lines: [`Requests sent: ${requests.toLocaleString("en-US")} (${this.path}); none pass the shared write gate`] };
      emitSaveLog({
        summary,
        sections: error
          ? [
            failureSection(error.error, rows, [`Requests sent before it stopped: ${requests.toLocaleString("en-US")}`]),
            stepsSection(rows), requestsGroup, rawErrorSection(error.error),
          ]
          : [stepsSection(rows), requestsGroup],
      });
    } catch {
      // Logging must never change the save's outcome.
    }
  }
}

/**
 * The one-line summary of one panel save or delete. Pure, so the format is pinned by a test.
 * `steps` are already in start order; `gate` is the bulk save's `gateTail`; `error` (failure
 * only) the innermost readable message, GUIDs replaced (`rootMessageOf`).
 */
export function panelSaveLogLine(s: {
  what: string; path: "bulk" | "per-row"; failed: boolean; ms: number; requests: number; steps: readonly string[];
  gate?: string; error?: string;
}): string {
  const parts = [
    `${s.what} (${s.path})${s.failed ? " FAILED after" : ":"} ${formatMs(s.ms)}, ${plural(s.requests, "request")}`,
    ...s.steps,
    ...(s.gate ? [s.gate] : []),
    ...(s.error !== undefined ? [`error: ${s.error}`] : []),
  ];
  return parts.join("; ");
}

/**
 * The second console line of a panel save or delete, from the hook: how long the action kept the
 * spinner up, split into the writes (the line above) and the refetch the hook awaits afterwards.
 * `CAPEX panel save busy: 2,118 ms (writes 1,312 ms, refetch 806 ms)`;
 * `CAPEX panel delete busy: 1,540 ms (deletes 1,120 ms, refetch 420 ms)` (D59).
 */
export function panelBusyLogLine(writesMs: number, refetchMs: number, kind: "save" | "delete" = "save"): string {
  return `CAPEX panel ${kind} busy: ${formatMs(writesMs + refetchMs)} `
    + `(${kind === "save" ? "writes" : "deletes"} ${formatMs(writesMs)}, refetch ${formatMs(refetchMs)})`;
}

/** Runs `task`, printing the save log whether it succeeds or fails. */
async function logged<T>(log: SaveLog, task: () => Promise<T>): Promise<T> {
  try {
    const result = await task();
    log.print();
    return result;
  } catch (error) {
    log.print({ error });
    throw error;
  }
}

/** A counting deleter: `sent` grows BEFORE each request, so a refused one is counted too. */
function counting<A extends unknown[], R>(fn: (...a: A) => Promise<R>): { run: (...a: A) => Promise<R>; sent: () => number } {
  let sent = 0;
  return { run: (...a: A) => { sent += 1; return fn(...a); }, sent: () => sent };
}

/* ═══════════════════════════════════════════════════════ contract payload ══ */

/**
 * The contract's field bag, shared by both paths so they cannot drift. `linkedCluster` is kept
 * apart because the create and the update treat its `null` differently (see below).
 */
function contractPayload(args: SaveCostLineArgs): {
  fields: Record<string, unknown>;
  linkedCluster: Record<string, string | null>;
} {
  const { line, payments, isNew } = args;

  const isEqual = line.distribution === "equal";
  // `locNumPayments` — the months the contract actually ends up with. The tombstones
  // (`amount: null`) are months being removed and are not payments.
  const numPayments = payments.filter((p) => p.amount !== null && p.amount !== undefined).length;

  const fields = {
    // The canvas writes the panel's Description box to BOTH `Name` and `Description`
    // (`CapexScreenCode.txt:1509` / `:1512`). Only `vsb_name` was written before, which is why
    // `vsb_description` is null across the dev org — and why `contractLabel` has to fall back
    // to the name. Writing both makes a row we save readable either way.
    vsb_name: line.description,
    vsb_description: line.description,
    vsb_costtype: line.payer === "DevCo" ? COST_TYPE.devCo : COST_TYPE.spv,
    vsb_applyvat: line.vat,
    vsb_depreciation: line.depreciation,
    vsb_distribution:
      line.distribution === "equal" ? DISTRIBUTION.equal : DISTRIBUTION.individual,
    /*
     * `% Values` 952850000 / `Absolute Values` 952850001 — confirmed against the generated
     * option set and against live rows, which read back as "Absolute Values".
     *
     * Written on EVERY save. The canvas only writes it from the individual-distribution branch
     * (`CapexScreenCode.txt:969`); in the equal branch the same assignment is commented out
     * (`:1513-1520`, and note the typo `'Absolut Values'` in the dead code, which is why it is
     * dead). Ours is a superset: `CostLine.distributionScheme` always carries a value, the
     * panel defaults it to `absolute`, and leaving the column untouched on an equal save would
     * strand whatever an earlier individual save had put there.
     */
    vsb_distributionscheme:
      line.distributionScheme === "percent"
        ? DISTRIBUTION_SCHEME.percent : DISTRIBUTION_SCHEME.absolute,
    vsb_distributionfrequency: line.frequency,
    // The contract's own stored total. The canvas keeps this independent of the monthly rows
    // and the panel reads it back on edit, so a save that omitted it would blank the box next
    // time the panel opened.
    ...(line.totalCost === undefined ? {} : { vsb_totalcost: line.totalCost }),
    /*
     * The two columns the panel's Select Cluster and Start/End Date controls live in.
     *
     * They were simply absent from this object, so neither control had anywhere to persist and
     * every reopen of the panel showed the stored row's old selection — the reported "Edit
     * panel is not saving Cluster / Start date / End date".
     *
     * Written only for an EQUAL distribution, which is the only branch the canvas writes them
     * in (`CapexScreenCode.txt:1544` / `:1555`; the individual-distribution Patch at `:963`
     * sets neither). An individual contract has no cluster or date controls on screen, so
     * writing them would be inventing a selection the user never made — and, worse, would make
     * `resolveEqualMode` claim a mode for a contract that has none.
     */
    ...(isEqual
      ? {
        vsb_byclusterjson: byClusterJson(line.equalMode === "cluster" ? line.clusters : []),
        vsb_bystartenddatejson: line.equalMode === "dates"
          ? startEndJson(line.startDate, line.endDate)
          : startEndJson("", ""),
        /*
         * `Average Payment` — `RoundDown('Total Cost' / locNumPayments, 0)`, patched by the
         * canvas right after the cost rows go in (`CapexScreenCode.txt:1846-1856`). It is the
         * rounded-down BASE, not the mean: 1000 over 3 stores 333 while paying 333/333/334.
         *
         * `vsb_averagepayment` is a TEXT column, not a decimal one — checked against
         * VSBCloud_Dev, where it holds "1276171" with no thousands separator while
         * `vsb_totalcost` on the same row formats as "8,933,200". Hence `String(...)`.
         */
        ...(line.totalCost === undefined || numPayments === 0
          ? {}
          : {
            vsb_averagepayment: String(
              equalDistributionAmounts(line.totalCost, numPayments).averagePayment,
            ),
          }),
      }
      : {}),
    vsb_isstandardcontract: line.standard,
    // Bound only on create — a standard contract's link to its assumption is set once, at
    // creation, exactly as `checkStandardContractClick` in `standardContracts.ts` assumes when
    // it treats "already has this assumption" as permanent.
    ...(isNew && line.standardAssumptionId
      ? { "vsb_CapexStandardAssumptionContract@odata.bind": bind("vsb_devexcapexstandardassumptionses", line.standardAssumptionId) }
      : {}),
  };

  /**
   * `'Linked Cluster'` — the panel's "Link to Milestone" dropdown.
   *
   * The canvas writes it on EVERY save, in both the individual and the equal branch, as
   *
   *     'Linked Cluster': If(drp_..._Link_to_Cluster.Selected.Name <> "None",
   *                          drp_..._Link_to_Cluster.Selected,
   *                          Blank())
   *
   * (`CapexScreenCode.txt:17413` and `:17526`). The `Blank()` half is the point: "None" has to
   * CLEAR an existing link, and omitting the column — which is what this function did — leaves
   * the old link in place. `_vsb_linkedcluster_value` is the READ form and Dataverse rejects it
   * in a write payload (`ProjectDocs/instructions/CONVENTIONS.md` rule 4), so `@odata.bind: null` is the only
   * disassociation available, exactly as `saveComment` in `./comments.ts` uses it.
   */
  const linkedCluster: Record<string, string | null> = {
    "vsb_LinkedCluster@odata.bind": line.linkedClusterId
      ? bind("vsb_projectstates", line.linkedClusterId)
      : null,
  };

  return { fields, linkedCluster };
}

/** The owning-business-unit bind every CREATE carries (rule 4), or nothing when it is unknown. */
function owningBu(owningBusinessUnitId: string | undefined): Record<string, string> {
  return owningBusinessUnitId
    ? { "owningbusinessunit@odata.bind": bind("businessunits", owningBusinessUnitId) }
    : {};
}

async function updateContract(args: SaveCostLineArgs): Promise<void> {
  const { fields, linkedCluster } = contractPayload(args);
  // UPDATE keeps the null. It is the whole point — see `linkedCluster` above.
  unwrap(
    await Vsb_capexprojectcontractsService.update(
      args.line.id, { ...fields, ...linkedCluster } as never,
    ),
    "update CAPEX contract",
  );
}

async function createContract(args: SaveCostLineArgs): Promise<string> {
  const { fields, linkedCluster } = contractPayload(args);
  const created = unwrap(
    await Vsb_capexprojectcontractsService.create({
      ...fields,
      // CREATE drops it when there is nothing to bind: a brand-new row has no link to clear,
      // and a null `@odata.bind` in a POST body is a null where OData expects an entity
      // reference, not a "clear this lookup" instruction. Same split as `saveComment`.
      ...(args.line.linkedClusterId ? linkedCluster : {}),
      "vsb_Project@odata.bind": bind("vsb_projects", args.projectId),
      "vsb_Account@odata.bind": bind("vsb_capexaccountlists", args.accountId),
      ...owningBu(args.owningBusinessUnitId),
    } as never),
    "create CAPEX contract",
  );
  return created.vsb_capexprojectcontractid;
}

/** A new month row's columns — the same bag on both paths. */
function newCostFields(
  contractId: string, owningBusinessUnitId: string | undefined,
  cost: { year: number; month: number; cost: number },
): Record<string, unknown> {
  return {
    vsb_cost: cost.cost,
    vsb_year: cost.year,
    vsb_month: cost.month,
    "vsb_Contract@odata.bind": bind("vsb_capexprojectcontracts", contractId),
    ...owningBu(owningBusinessUnitId),
  };
}

/**
 * Creates or updates the contract, then reconciles its cost rows.
 *
 * The cost half goes through `capexWriteSet`, which is where the canvas's "a typed zero is not a
 * blank" rule lives. Nothing here decides that; this function only carries out the plan.
 */
export async function saveCostLine(args: SaveCostLineArgs): Promise<string> {
  return bulkPathEnabled()
    ? saveCostLineBulk(args, SKIP_UNCHANGED_COSTS)
    : saveCostLineLegacy(args);
}

/**
 * The per-row path: every request awaited before the next, in the canvas' order. The rollback for
 * `PANEL_BULK_SAVE`; also the "before" of D56's measurements.
 */
export async function saveCostLineLegacy(args: SaveCostLineArgs): Promise<string> {
  const { line, owningBusinessUnitId, payments, isNew } = args;
  const log = new SaveLog("per-row", "CAPEX panel save");
  const reset = Boolean(args.resetPaidAndPaymentDateComments) && !isNew;
  log.expect(isNew ? "contract create" : "contract update", ...(reset ? ["paid reset", "payment-date comments"] : []),
    "costs", "cost deletes");
  return logged(log, async () => {
    let contractId = line.id;

    if (!isNew) {
      await log.step("contract update", () => updateContract(args), { count: () => 1 });
    } else {
      contractId = await log.step("contract create", () => createContract(args), { count: () => 1 });
    }

    // The relink reset, in the canvas' order: before the cost rows are reconciled, so a month
    // that survives the save is already unpaid rather than being patched twice.
    if (reset) {
      let paid = 0;
      await log.step("paid reset", async () => {
        for (const payment of line.payments) {
          if (payment.paid && payment.id) { paid += 1; await setCostPaid(payment.id, false); }
        }
      }, { count: () => paid });
      let read = 0;
      let removed = 0;
      await log.step("payment-date comments", async () => {
        read = 1;
        const existing = await loadComments([contractId]);
        for (const comment of existing) {
          if (comment.commentType === COMMENT_TYPE.paymentDate) { removed += 1; await deleteComment(comment.id); }
        }
      }, { count: () => read + removed, detail: () => `1 read, ${removed} deleted`, how: () => `1 read, ${plural(removed, "comment")} deleted` });
    }

    const rows: CostRowInput[] = payments.map((p) => ({
      year: p.year,
      month: p.month,
      cost: p.amount === null || p.amount === undefined ? null : p.amount,
      costId: p.id ?? null,
    }));
    const plan = capexWriteSet(rows);

    let created = 0;
    let updated = 0;
    // Attempts, counted before each request, so a refused one still counts (D59).
    let attempts = 0;
    await log.step("costs", async () => {
      for (const upsert of plan.upserts) {
        attempts += 1;
        if (upsert.costId) {
          unwrap(
            await Vsb_capexcostsService.update(upsert.costId, { vsb_cost: upsert.cost }),
            "update CAPEX cost",
          );
          updated += 1;
        } else {
          unwrap(
            await Vsb_capexcostsService.create(newCostFields(contractId, owningBusinessUnitId, upsert) as never),
            "create CAPEX cost",
          );
          created += 1;
        }
      }
    }, {
      count: () => attempts,
      detail: () => `create ${created}, update ${updated}`,
      how: () => `${plural(created, "row")} created, ${plural(updated, "row")} updated, one request each`,
    });

    // Deletes last: an interrupted save then leaves extra rows rather than missing money.
    // Through `deleteRecord`, not the generated service: the generated `delete()` discards the
    // `IOperationResult` and the SDK never throws, so a refusal would resolve exactly like a
    // success and the save would report a shrunk schedule that Dataverse never applied
    // (`ProjectDocs/instructions/CONVENTIONS.md` rule 14).
    let deleted = 0;
    await log.step("cost deletes", async () => {
      for (const costId of plan.deletes) {
        deleted += 1;
        await deleteRecord("delete CAPEX cost", "vsb_capexcosts", costId);
      }
    }, { count: () => deleted });

    return contractId;
  });
}

/** `vsb_capexcomments`, for `deleteMany`'s labels; the delete itself is `deleteComment`. */
const CAPEX_COMMENTS: BulkTableInfo = {
  entitySetName: "vsb_capexcommentses",
  logicalName: "vsb_capexcomments",
  primaryKey: "vsb_capexcommentsid",
};

/**
 * The panel's own delete gate (month rows and comments), apart from `costDeleteGate`: Add Cost
 * from Table's deferred background deletes can still hold that one for many seconds after its
 * Save returned (D51 §11.15), and a panel shrink or Delete right after must not queue behind
 * them (D56 review, finding 5). Peak in flight stays 16 (writes) + 4 + 4 (the sheet's delete
 * gates) + 4 (this) = 28, under Dataverse's 52-per-user limit.
 */
const PANEL_DELETE_LIMIT = 4;
const panelDeleteGate = createGate(PANEL_DELETE_LIMIT);

/** One gated cost delete (rule 14). */
const gatedCostDelete = (tableName: string, id: string) =>
  panelDeleteGate(() => deleteRecord("delete CAPEX cost", tableName, id));

/**
 * One gated comment delete. `deleteComment` goes through `deleteRecord` (CA-18, rule 14), so a
 * refused comment delete REJECTS: `deleteMany` attempts every id, then throws, and the phase that
 * follows is not sent. Same as the per-row path.
 */
const gatedCommentDelete = (_tableName: string, id: string) =>
  panelDeleteGate(() => deleteComment(id));

/**
 * The bulk path (D56). The requests that do not depend on each other run at once:
 *
 *   NEW contract:   contract create ─▶ CreateMultiple(months) ─▶ deletes (none on a create)
 *   EXISTING one:   ┌ contract update
 *                   └ CreateMultiple(new months) ∥ UpdateMultiple(changed months)
 *                   ─▶ (all settled, none failed) ─▶ month deletes, 4 at a time
 *   RELINK reset:   contract update ─▶ ┌ CreateMultiple ∥ UpdateMultiple(… + paid resets)
 *                                      └ comments read ─▶ payment-date comment deletes
 *                   ─▶ (all settled, none failed) ─▶ month deletes
 *
 * DIVERGENCE (D56 §2): the canvas runs the contract Patch, then the month Patch, then the
 * `Remove`s, one after another (`CapexScreenCode.txt:953`, `:1120`, `:1166`). On an existing
 * contract the contract row and its months are independent rows, so they go together; a new
 * contract's months still wait for the contract, because each binds `vsb_Contract` to it.
 * The cost of that: a REFUSED contract update can now leave the months written under the old
 * contract columns (total, average), where the per-row path stopped before any month. D56 §2.
 *
 * A RELINK save keeps the contract first (D56 review, finding 1): the reset clears paid flags and
 * deletes comments, which the user accepted only for the new link. If the contract update carrying
 * that link is refused, nothing of the reset may land.
 *
 * KEPT from the per-row path:
 *  - the deletes go LAST and only after everything else succeeded, so an interrupted save leaves
 *    extra rows rather than missing money, and the schedule never shows a delete Dataverse did not
 *    apply (they are awaited, not deferred as in D51 §11.15);
 *  - the payment-date comments go before any month row, because such a comment references its row;
 *  - a failure is the error of the first failed step in the canvas order (contract, months,
 *    comments), thrown only once every step has settled, so nothing is still in flight.
 *
 * A month row deleted by someone else since the panel opened is REFUSED by `UpdateMultiple`
 * (its whole request is not written) where the per-row PATCH re-created it (R-12). D56 §4.
 */
export async function saveCostLineBulk(args: SaveCostLineArgs, skipUnchanged: boolean): Promise<string> {
  const { line, owningBusinessUnitId, isNew } = args;
  const reset = Boolean(args.resetPaidAndPaymentDateComments) && !isNew;
  const plan = planPanelCostWrites({
    payments: args.payments,
    stored: args.storedPayments,
    paidIdsToReset: paidIdsToReset(line.payments, reset),
    skipUnchanged,
    newId: () => crypto.randomUUID(),
  });
  // The bulk SAVE is the only panel log with a gate tail: its writes pass the shared `saveGate`,
  // each counted on this save's own meter (D59).
  const log = new SaveLog("bulk", "CAPEX panel save", true);
  log.expect(isNew ? "contract create" : "contract update", "costs", ...(reset ? ["payment-date comments"] : []), "cost deletes");
  const meter = log.meter;

  return logged(log, async () => {
    const costs = async (contractId: string) => {
      const targets: UpsertTarget[] = [
        ...plan.creates.map((c) => ({ id: c.id, isNew: true, fields: newCostFields(contractId, owningBusinessUnitId, c) })),
        ...plan.updates.map((u) => ({
          id: u.id,
          isNew: false,
          fields: {
            ...(u.cost === undefined ? {} : { vsb_cost: u.cost }),
            ...(u.resetPaid ? { vsb_costpaid: false } : {}),
          },
        })),
      ];
      let summary = "";
      let groups: readonly UpsertGroupReport[] = [];
      const extras = () => [
        plan.paidResets > 0 ? `${plan.paidResets} paid reset` : "",
        plan.unchanged > 0 ? `${plan.unchanged} unchanged skipped` : "",
      ].filter(Boolean);
      await log.step("costs", async () => {
        await upsertRowsByAction(CAPEX_COSTS, targets, "save CAPEX costs", (s, g) => { summary = s; groups = g; }, { meter });
      }, {
        // Its requests are the meter's, less the contract write's (see `StepOptions.rest`).
        rest: true,
        detail: () => [summary, ...extras()].filter(Boolean).join(", "),
        how: () => groupsText(groups, extras().map((e) => e.replace("unchanged skipped", "unchanged months skipped"))),
      });
    };

    let contractId = line.id;
    if (isNew) {
      contractId = await log.step("contract create", () => gatedWrite(() => createContract(args), meter), { count: () => 1, gated: true });
      await costs(contractId);
    } else {
      const contract = () => log.step("contract update", () => gatedWrite(() => updateContract(args), meter), { count: () => 1, gated: true });
      const steps: (() => Promise<unknown>)[] = [() => costs(contractId)];
      if (reset) {
        await contract();
        steps.push(() => resetPaymentDateComments(contractId, log));
      } else {
        steps.unshift(contract);
      }
      const settled = await Promise.allSettled(steps.map((run) => run()));
      const failed = settled.find((s): s is PromiseRejectedResult => s.status === "rejected");
      if (failed) throw failed.reason;
    }

    const deleter = counting(gatedCostDelete);
    await log.step("cost deletes", () => deleteMany(CAPEX_COSTS, plan.deletes, deleter.run, {
      limit: PANEL_DELETE_LIMIT, label: "delete CAPEX cost",
    }), { count: () => deleter.sent(), how: () => deletesHow(deleter.sent()) });

    return contractId;
  });
}

/** A delete step's readable "How" cell. */
function deletesHow(n: number): string {
  return n === 0 ? "nothing to delete" : `${plural(n, "row")}, ${PANEL_DELETE_LIMIT} at a time`;
}

/** The relink's `RemoveIf('Capex Comments', … 'Comments to payment date')`, 4 deletes at a time. */
async function resetPaymentDateComments(contractId: string, log: SaveLog): Promise<void> {
  let read = 0;
  const deleter = counting(gatedCommentDelete);
  await log.step("payment-date comments", async () => {
    read = 1;
    const ids = paymentDateCommentIds(await loadComments([contractId]));
    await deleteMany(CAPEX_COMMENTS, ids, deleter.run, {
      limit: PANEL_DELETE_LIMIT, label: "delete CAPEX comment",
    });
  }, {
    count: () => read + deleter.sent(),
    detail: () => `1 read, ${deleter.sent()} deleted`,
    how: () => `1 read, ${plural(deleter.sent(), "comment")} deleted`,
  });
}

/* ═══════════════════════════════════════════════════════════ delete line ══ */

/**
 * Deletes a cost line, its comments and the cost rows beneath it.
 *
 * COMMENTS FIRST, then cost rows, then the contract — children before parents, the same rule as
 * the header states for saves. A `vsb_capexcomments` row points at BOTH the contract
 * (`vsb_CapexContract`) and, for a payment-date comment, the month's cost row
 * (`vsb_CapexCost`), so it is a child of both and has to go before either. Any other order
 * leaves a comment attached to a row that no longer exists.
 *
 * The comment half was simply missing: the canvas runs `RemoveIf('Capex Comments', …)` as part
 * of contract deletion, and without it every deleted contract left its whole thread behind —
 * invisible in the app, and counted by the next `loadComments` for any contract that reused the
 * id. `planDeleteContract` (`capex-costs/rules.ts`) is the rule; this is only the I/O.
 *
 * `loadComments` is asked for one contract, which is the narrow half of the query it already
 * serves the panel with, so this costs one extra request per delete.
 *
 * DIVERGENCE: the canvas does NOT delete the cost rows itself. In
 * `cmp_PopUp_SubaccountCostsDeletion_Confirmation.OnConfirm`
 * (`ProjectDocs/_extracted/msapp/projectcosts/Src/Capex Costs Screen.pa.yaml`, lines
 * 8122-8134) the `RemoveIf('CAPEX Costs', Contract.'CAPEX Project Contract' = …)` is
 * COMMENTED OUT; what runs is `RemoveIf('Capex Comments', …)` then
 * `Remove('CAPEX Project Contracts', locContractToDelete)`, leaving the cost rows to the
 * Dataverse cascade on `vsb_Contract`. This app deletes each cost row explicitly instead, for
 * the same reason `09-APPLICATION-SETTINGS-PORT-OPEN-POINTS.md` §8 lists cascade reliance as a
 * candidate deliberately not ported: the cascade behaviour is a server-side relationship
 * setting no test or type here can pin, and a cascade configured as Restrict would leave the
 * contract delete refused — now visibly, since all three deletes go through `deleteRecord`
 * (rule 14) rather than the generated `delete()`, which swallows a refusal. Deleting the
 * children first makes the outcome the same under either relationship setting.
 */
export async function deleteCostLine(line: CostLine): Promise<void> {
  if (bulkPathEnabled()) await deleteCostLineBulk(line);
  else await deleteCostLineLegacy(line);
}

/** The per-row delete: one request at a time. The rollback for `PANEL_BULK_SAVE`. */
export async function deleteCostLineLegacy(line: CostLine): Promise<void> {
  const log = new SaveLog("per-row", "CAPEX panel delete");
  log.expect(...DELETE_STEPS);
  await logged(log, async () => {
    const comments = await log.step("comments read", () => loadComments([line.id]), { count: () => 1 });
    const plan = planDeleteContract(
      line.id,
      comments.map((c) => ({ id: c.id, contractId: c.contractId ?? "" })),
    );

    const commentDelete = counting(deleteComment);
    await log.step("comment deletes", async () => {
      for (const commentId of plan.commentIds) await commentDelete.run(commentId);
    }, { count: () => commentDelete.sent() });
    const costIds = line.payments.flatMap((p) => (p.id ? [p.id] : []));
    const costDelete = counting(deleteRecord);
    await log.step("cost deletes", async () => {
      for (const id of costIds) await costDelete.run("delete CAPEX cost", "vsb_capexcosts", id);
    }, { count: () => costDelete.sent() });
    await log.step("contract delete", () => deleteRecord(
      "delete CAPEX contract", "vsb_capexprojectcontracts", plan.contractId,
    ), { count: () => 1 });
  });
}

/** The three delete phases after the comments read, in order (for "not sent" on a failure). */
const DELETE_STEPS = ["comments read", "comment deletes", "cost deletes", "contract delete"] as const;

/**
 * The same three phases in the same order — comments, then cost rows, then the contract — with the
 * deletes INSIDE a phase sent 4 at a time on the panel's delete gate (D56). Every id of a phase is
 * attempted (`deleteMany`); a refused COMMENT or COST delete stops the next phase (CA-18 for the
 * comments, see `gatedCommentDelete`), so the contract is never deleted while a child of it is
 * still there, exactly as the per-row loop's first throw stopped it.
 */
export async function deleteCostLineBulk(line: CostLine): Promise<void> {
  // No gate tail: a Delete sends nothing through the shared write gate (`SaveLog`).
  const log = new SaveLog("bulk", "CAPEX panel delete");
  log.expect(...DELETE_STEPS);
  await logged(log, async () => {
    const comments = await log.step("comments read", () => loadComments([line.id]), { count: () => 1 });
    const plan = planDeleteContract(
      line.id,
      comments.map((c) => ({ id: c.id, contractId: c.contractId ?? "" })),
    );
    const commentDelete = counting(gatedCommentDelete);
    await log.step("comment deletes", () => deleteMany(
      CAPEX_COMMENTS, plan.commentIds, commentDelete.run,
      { limit: PANEL_DELETE_LIMIT, label: "delete CAPEX comment" },
    ), { count: () => commentDelete.sent(), how: () => deletesHow(commentDelete.sent()) });
    const costIds = line.payments.flatMap((p) => (p.id ? [p.id] : []));
    const costDelete = counting(gatedCostDelete);
    await log.step("cost deletes", () => deleteMany(
      CAPEX_COSTS, costIds, costDelete.run, { limit: PANEL_DELETE_LIMIT, label: "delete CAPEX cost" },
    ), { count: () => costDelete.sent(), how: () => deletesHow(costDelete.sent()) });
    await log.step("contract delete", () => deleteRecord(
      "delete CAPEX contract", "vsb_capexprojectcontracts", plan.contractId,
    ), { count: () => 1 });
  });
}
