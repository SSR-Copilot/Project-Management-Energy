/**
 * Add Cost from Table — the bulk save orchestrator: runs one `SaveBuildPlan` as an optional
 * verify read and the write operations around it, and keeps every contract's `vsb_totalcost`
 * true to what actually landed.
 *
 * THE FOUR OPERATIONS keep their phase numbers for messages: (1) contract upserts, (2) cost
 * upserts, (3) cost deletes, (4) contract deletes. They are not sequenced by phase (D51 §2,
 * §11.12): the host runs only a few requests at once, so idle time on the critical path is the
 * largest cost of a save. The execution graph is
 *
 *   t = 0     (4) contract deletes ‖ (3) cost deletes                 (never wait for anything)
 *             ‖ phase 0, verify — only what needs it, both tables at once
 *   then      (1) contracts ‖ (2a) costs of contracts that already exist
 *             — right after verify, or at t = 0 when upsert verification is off
 *   then      (2b) costs of the NEW contracts of this plan, when (1) succeeded and no other
 *             operation has failed by then (it overlaps whatever still runs)
 *             (3') the `costDeletesIfExist` ids verify found, when verify answered (phase 3)
 *   finally   wait for ALL of the above to settle → on any failure, reconcile, then throw
 *
 * A DEFERRED delete group (either flag below) is the exception to "t = 0": it starts only once
 * every WRITE has settled — verify, (1), (2a) and (2b) — so its server cascade never contends with
 * the writes for locks (measured on DEV, 27 Oct: see the note at the late start). (3') follows
 * (3): with `deferCostDeletes` it also waits for the writes.
 *
 * DEFERRED CONTRACT DELETES (`SavePlanDeps.deferContractDeletes`, D51 option A, default off).
 * (4) starts after the writes settled. Once every operation except (4) has settled, a save with no
 * failure and nothing to reconcile returns at once; (4) finishes in the background and is reported
 * through `SavePlanResult.background`, not in `requests` / `timings`. Any failure or a
 * `RowsGoneError` waits for (4) and ends exactly as without the flag. A background (4) failure
 * never triggers a reconcile: a deleted contract has no total in the plan.
 *
 * DEFERRED COST DELETES (`SavePlanDeps.deferCostDeletes`, default off). The same idea for (3) and
 * (3'), which also start after the writes settled: once every operation that is not deferred has
 * settled with no failure and nothing to reconcile (and no deferred cost delete has already
 * failed), the save returns at once. With both
 * flags there is ONE `background`. Unlike (4), a cost delete DOES feed a total — (1) wrote the
 * totals assuming it landed — so when one fails in the background, the surviving contracts'
 * totals are reconciled in the background too, after every deferred operation settled, and the
 * outcome says how that ended (`BackgroundOutcome`).
 *
 * Why the operations may overlap:
 *  - (3) holds ONLY cost rows whose contract survives, and (2) never writes a doomed contract's
 *    cells (the planner's "deletion wins"), so (3) and (4)'s cascade never meet (2);
 *  - (3) and (2) never name the same cost id (the planner's `claimCostId`);
 *  - (2a) binds only to contracts that exist already, so it needs nothing from (1);
 *  - (2b) waits for (1): a cost row cannot bind to a contract that does not exist yet.
 * Deletes need no verify: the deleter (`SavePlanDeps.deleteMany`) treats a 404 as success — the
 * goal, "this row is gone", is already reached — so an id someone else deleted first is harmless,
 * and a delete refused for a row that DOES exist still fails loudly (rule 14). (4) is started
 * first because the cascade makes each contract delete the slowest request.
 *
 * PHASE 0, VERIFY (`SavePlanDeps.existingIds`, one read per table, both at once). It reads only:
 *  - the upsert targets, unless `verifyUpserts` is `false`. A stored (`isNew: false`) target that
 *    is missing ends the save with `RowsGoneError`: no upsert is sent. A NEW target that already
 *    exists was created by an earlier failed attempt (the retry reuses its ids, D51 §3a); it is
 *    sent as `isNew: false` without the owning-BU bind, so `CreateMultiple` never refuses it as a
 *    duplicate and an update never moves its BU (CONVENTIONS rule 4). `mayExist` leaves out new
 *    ids minted for this save: they cannot exist.
 *  - the `costDeletesIfExist` ids, always: they are retry-only ids of cells that are blank now,
 *    deleted only if they exist, as a separate small delete (3') once the read answers.
 * Skipping the upsert check (`verifyUpserts: false`, a FIRST attempt whose writes all go out as
 * `CreateMultiple` / `UpdateMultiple`) is safe: `UpdateMultiple` refuses a missing row, so
 * nothing is resurrected, and every new id was minted for this save, so none can exist. A gone
 * update target is then an ordinary failure of its phase, handled by the reconcile below.
 *
 * Because the deletes run while verify reads, a verify that stops the save (`RowsGoneError`, or a
 * failed read) no longer means "nothing written": the deletes are awaited to the end, and when
 * cost deletes landed the totals they feed are reconciled before the error is thrown. A failed
 * read with nothing landed still propagates as it is.
 *
 * It is NOT transactional — the SDK has no changeset (KNOWN-RISKS). (1) writes the plan's FINAL
 * totals before the cost rows they sum exist, so any operation of (1)–(3) that fails, or a (2b)
 * that never starts, can leave totals lying. That is repaired only after EVERY operation has
 * settled (never while writes are in flight): the surviving contracts' cost rows are re-read,
 * each total is recomputed with `recomputeContractTotal`, and the totals that may be wrong are
 * written back. A save where only (4) failed and everything else landed needs none.
 *
 * Everything that touches the network is injected (`SavePlanDeps`), so this module imports no
 * SDK. Nothing is swallowed — every write failure ends in a `SavePlanError` (or a `RowsGoneError`
 * that carries the outcome of the deletes) with its cause (CONVENTIONS rules 3 and 14).
 */
import { ES, ES_ADMIN } from "./dataverseNames";
import type { BulkTableInfo, ExistingIdsReader, SaveBuildPlan, UpsertTarget } from "./bulkTypes";
import { BulkValidationError } from "./bulkWrites";
import { chunk, OWNING_BU_BIND } from "./odata";
import {
  recomputeContractTotal, type ExistingCost,
} from "@/features/cost/add-costs-from-table/rules";

/* ═════════════════════════════════════════════════════════════════════ tables ══ */

export const CAPEX_CONTRACTS: BulkTableInfo = {
  entitySetName: ES.capexProjectContracts,
  logicalName: "vsb_capexprojectcontract",
  primaryKey: "vsb_capexprojectcontractid",
};

export const CAPEX_COSTS: BulkTableInfo = {
  entitySetName: ES_ADMIN.capexCosts,
  logicalName: "vsb_capexcost",
  primaryKey: "vsb_capexcostid",
};

/** The cost row's contract bind, as the planner writes it on a new cost row. */
const CONTRACT_BIND = "vsb_Contract@odata.bind";

/* ═══════════════════════════════════════════════════════════════════ contract ══ */

export interface SavePlanDeps {
  /**
   * One upsert of `rows` into `table` (split into `CreateMultiple`/`UpdateMultiple` by the adapter); throws on failure.
   * `step` (optional, LOG ONLY, D58): the step's name in the save log when it differs from `label`
   * — the two phase-2 stages, `upsert costs (existing contracts)` / `upsert costs (new contracts)`.
   * `label` stays the phase label, which every error message carries.
   */
  upsert: (table: BulkTableInfo, rows: readonly UpsertTarget[], label: string, step?: string) => Promise<{ requests: number }>;
  /**
   * Deletes every id, attempting all of them; throws when any failed (A2's `deleteMany`). A row
   * that is already gone (404) must count as deleted: the orchestrator sends the plan's delete
   * ids without checking them first.
   *
   * `removed` (optional): how many rows THIS call actually removed, leaving out the ones that
   * were confirmed already gone (404). Used only for `committedBefore`, so a batch of nothing but
   * confirmed 404s does not count as "something was saved". Omitted: every id counts as removed.
   * A failure says the same through the error's `removedCount` (`BulkDeleteError`).
   * `step` (optional, LOG ONLY, D58): the batch's name in the save log, as for `upsert`.
   */
  deleteMany: (table: BulkTableInfo, ids: readonly string[], label: string, step?: string) =>
    Promise<{ requests: number; removed?: number }>;
  /** Fresh server read of the cost rows of these contracts (for reconciliation). */
  loadCosts: (contractIds: readonly string[]) => Promise<ExistingCost[]>;
  /**
   * Which of these ids exist (phase 0). The reader filters on the server in `chunk` batches of
   * `CHUNK` ids, which is how `requests.verify` is counted.
   */
  existingIds: ExistingIdsReader;
  /**
   * Could this NEW target's id already exist? Only an id issued by an earlier, failed attempt
   * can; one minted for this save cannot, so reading it back is a wasted request. Omitted: every
   * new id is checked.
   */
  mayExist?: (id: string) => boolean;
  /**
   * Read the upsert targets back before writing them (phase 0's `RowsGoneError` check and retry
   * flip). Default `true`. Pass `false` only when no target can already exist as a "new" one and
   * every write goes through `CreateMultiple` / `UpdateMultiple` (a first attempt): then the
   * upserts start at once. `costDeletesIfExist` is verified either way.
   */
  verifyUpserts?: boolean;
  /**
   * D51 option A. Default `false`: (4) starts at t = 0 and the save waits for every operation, as
   * before. When `true`, (4) starts only once every write (verify, (1), (2a), (2b)) has settled,
   * and once every OTHER operation has settled with no failure and nothing to reconcile, the save
   * returns at once and (4) finishes in the background (`SavePlanResult.background`). Any failure
   * or a `RowsGoneError` still waits for (4) and then behaves exactly as with `false`.
   */
  deferContractDeletes?: boolean;
  /**
   * Default `false`: (3) starts at t = 0, (3') when verify answered, and the save waits for them,
   * as before. When `true`, (3) and (3') start only once every write has settled, and once every
   * operation that is not deferred has settled with
   * no failure and nothing to reconcile, the save returns without waiting for them; they finish in
   * the background (`SavePlanResult.background`). A background cost-delete failure triggers a
   * background reconcile of the surviving contracts' totals. Any failure known before the save
   * would return still waits for everything and behaves exactly as with `false`.
   */
  deferCostDeletes?: boolean;
}

/**
 * How the deferred deletes ended, and the background reconcile when one ran. Never a rejection.
 *  - `requests`: what the deferred deletes that succeeded sent, plus the background reconcile's
 *    upsert (a failing operation's requests are not known, as in `SavePlanError`).
 *  - `error`: the first failure, cost deletes before contract deletes (lowest phase first); the
 *    deleter's own error, e.g. `BulkDeleteError`. Absent when every deferred delete succeeded.
 *  - `costDeleteError` / `contractDeleteError`: the failure of that group, when it failed.
 *  - `reconciled`: set only when a cost delete failed and the reconcile therefore ran — `true`
 *    when the totals are known to match what landed, `false` when they may not.
 *  - `reconcileError`: the reconcile's own failure, when it failed.
 */
export interface BackgroundOutcome {
  requests: number;
  error?: unknown;
  costDeleteError?: unknown;
  contractDeleteError?: unknown;
  reconciled?: boolean;
  reconcileError?: unknown;
}

/** The earlier name of `BackgroundOutcome`, kept for existing callers. */
export type ContractDeleteOutcome = BackgroundOutcome;

type SavePhase = 1 | 2 | 3 | 4;

interface SavePlanRequests {
  /** Phase 0 existence reads: one per `chunk` of ids per table; 0 when nothing was verified. */
  verify: number;
  contracts: number;
  /** Both cost upserts: (2a) and (2b). */
  costs: number;
  /** Phase 3: `costDeletes` and the `costDeletesIfExist` ids that existed. */
  costDeletes: number;
  contractDeletes: number;
  /** Requests the reconcile upsert sent (the `loadCosts` read is not counted: its cost is the reader's). */
  reconcile: number;
  total: number;
}

/**
 * Wall-clock milliseconds per step; a step that did not run is absent. For logging only.
 * `costDeletes` spans both phase-3 deletes (the immediate one and the `costDeletesIfExist` one).
 */
type SavePlanTimings = Partial<Record<"verify" | TimingKey | "reconcile" | "total", number>>;

interface SavePlanResult {
  /**
   * When deletes were deferred (`background` set), their counter (`contractDeletes` and/or
   * `costDeletes`) is 0 and `total` leaves them out: their requests are in the background outcome.
   */
  requests: SavePlanRequests;
  stats: SaveBuildPlan["stats"];
  /** `contractDeletes` / `costDeletes` are absent when that group was deferred. */
  timings: SavePlanTimings;
  /**
   * Set only when `deferContractDeletes` / `deferCostDeletes` let the save return before the
   * deferred deletes settled; undefined otherwise (flags off, nothing to defer, or a path that
   * waited). ONE promise for both groups. Resolves, never rejects, once every deferred delete and
   * any background reconcile settled. Nothing in this result changes afterwards.
   */
  background?: Promise<BackgroundOutcome>;
}

interface SavePlanErrorInit {
  phase: SavePhase;
  cause: unknown;
  /**
   * True when the stored totals are known to match what landed: the reconcile ran and
   * succeeded, or nothing needed reconciling.
   */
  reconciled: boolean;
  /**
   * True when something reached Dataverse, or may have: an operation of this save succeeded, or a
   * failing one reports committed rows (`rowsCommitted` / `chunksCommitted` for an upsert,
   * `removedCount` or else `deletedCount` for a delete). An error with no counts counts as "may
   * have". A delete that removed nothing itself (every id a confirmed 404: `removed` /
   * `removedCount` 0) and an error that reports 0 rows count as "no" (`committedSomething`).
   */
  committedBefore: boolean;
  /** Set only when the reconcile itself failed; `cause` is still the phase's own error. */
  reconcileError?: unknown;
  /**
   * NEW contracts (1) may or may not have created before it failed (the error did not say how
   * many rows committed). They are never reconciled — an upsert on an id that does not exist
   * would CREATE a bare contract — so their total may still be the plan's.
   */
  unverifiedContractIds?: readonly string[];
  /** Every operation that failed, lowest phase first; `phase` / `cause` are the first entry's. */
  failures?: readonly { phase: SavePhase; cause: unknown }[];
  /** Requests of the operations that succeeded, plus the reconcile's (a failing one's are not known). */
  requests: SavePlanRequests;
}

/**
 * A save that stopped part-way. `phase` is the lowest failed phase; `cause` its original error.
 * A failed verify read that stopped the upserts after deletes landed is reported on the phases
 * it stopped (1 and/or 2, or 3 for `costDeletesIfExist`), with the read's error as `cause`.
 */
export class SavePlanError extends Error {
  readonly phase: SavePhase;
  readonly reconciled: boolean;
  readonly committedBefore: boolean;
  readonly reconcileError?: unknown;
  readonly unverifiedContractIds: readonly string[];
  readonly failures: readonly { phase: SavePhase; cause: unknown }[];
  readonly requests: SavePlanRequests;

  constructor(init: SavePlanErrorInit) {
    super(
      `Save failed in phase ${init.phase} (${PHASE_LABEL[init.phase]}); ` +
        (init.reconcileError !== undefined
          ? "contract totals could NOT be reconciled."
          : init.reconciled
            ? "contract totals are consistent with what was saved."
            : "contract totals may be inconsistent."),
      { cause: init.cause },
    );
    this.name = "SavePlanError";
    this.phase = init.phase;
    this.reconciled = init.reconciled;
    this.committedBefore = init.committedBefore;
    this.reconcileError = init.reconcileError;
    this.unverifiedContractIds = init.unverifiedContractIds ?? [];
    this.failures = init.failures ?? [{ phase: init.phase, cause: init.cause }];
    this.requests = init.requests;
  }
}

/** What the deletes that ran alongside phase 0 did, when phase 0 then found rows gone. */
interface RowsGoneOutcome {
  /** A delete sent alongside the check landed (or may have). Default false. */
  committedBefore?: boolean;
  /** The totals those deletes feed are known to be true. Default true. */
  reconciled?: boolean;
  reconcileError?: unknown;
  /** Deletes that failed, lowest phase first. Default none. */
  failures?: readonly { phase: SavePhase; cause: unknown }[];
}

/**
 * Phase 0 found rows of this plan deleted by someone else since the sheet loaded, so NO upsert
 * was sent. The plan's deletes run alongside the check and were awaited to the end; whatever
 * they did is in `committedBefore` / `reconciled` / `failures`. A separate class rather than a
 * `SavePlanError` with a phase 0: keeping `SavePlanError.phase` to 1–4 lets it map onto
 * `SaveFailure`'s phase without a cast. `contracts` / `costs` count the missing `isNew: false`
 * upsert targets per table.
 */
export class RowsGoneError extends Error {
  readonly gone: Readonly<{ contracts: number; costs: number }>;
  readonly requests: SavePlanRequests;
  readonly committedBefore: boolean;
  readonly reconciled: boolean;
  readonly reconcileError?: unknown;
  readonly failures: readonly { phase: SavePhase; cause: unknown }[];

  constructor(gone: { contracts: number; costs: number }, requests: SavePlanRequests, outcome: RowsGoneOutcome = {}) {
    super(
      `Save refused before any upsert: ${gone.contracts} contract(s) and ${gone.costs} cost row(s) `
        + "of this sheet no longer exist."
        + (outcome.committedBefore
          ? outcome.reconcileError !== undefined
            ? " Deletes sent alongside the check ran; contract totals could NOT be reconciled."
            : outcome.reconciled === false
              ? " Deletes sent alongside the check ran; contract totals may be inconsistent."
              : " Deletes sent alongside the check ran; contract totals are consistent."
          : ""),
    );
    this.name = "RowsGoneError";
    this.gone = Object.freeze({ ...gone });
    this.requests = requests;
    this.committedBefore = outcome.committedBefore ?? false;
    this.reconciled = outcome.reconciled ?? true;
    this.reconcileError = outcome.reconcileError;
    this.failures = outcome.failures ?? [];
  }
}

const PHASE_LABEL: Record<SavePhase, string> = {
  1: "upsert contracts",
  2: "upsert costs",
  3: "delete costs",
  4: "delete contracts",
};

/**
 * The two phase-2 stages' names, and the retry-only phase-3 batch's, in the save LOG only (D58):
 * `PHASE_LABEL[2]` / `PHASE_LABEL[3]` stay their labels, so every error message and the screen's
 * technical line keep "upsert costs" / "delete costs".
 */
const STAGE_STEP = {
  costsA: "upsert costs (existing contracts)",
  costsB: "upsert costs (new contracts)",
  costDeletesIfExist: "delete costs (left by a failed attempt)",
} as const;

/* ══════════════════════════════════════════════════════════════════ operations ══ */

/**
 * The six write operations: `costsA` / `costsB` are both phase 2, `costDeletes` /
 * `costDeletesIfExist` both phase 3.
 */
type OpKey = "contracts" | "costsA" | "costsB" | "costDeletes" | "costDeletesIfExist" | "contractDeletes";

/** The timing key of each operation (the two phase-3 deletes share `costDeletes`). */
type TimingKey = Exclude<OpKey, "costDeletesIfExist">;

/** The groups that can be deferred, keyed like their `SavePlanRequests` / timing entries. */
type HeldKey = "costDeletes" | "contractDeletes";

const OP_PHASE: Record<OpKey, SavePhase> = {
  contracts: 1, costsA: 2, costsB: 2, costDeletes: 3, costDeletesIfExist: 3, contractDeletes: 4,
};

const OP_TIMING: Record<OpKey, TimingKey> = {
  contracts: "contracts", costsA: "costsA", costsB: "costsB",
  costDeletes: "costDeletes", costDeletesIfExist: "costDeletes", contractDeletes: "contractDeletes",
};

/**
 * How one operation ended. `empty`: nothing to send; `skipped`: not started (stage B after a
 * failure, or every upsert after `RowsGoneError`). A `failed` one with `nothingSent` never made
 * its call (the verify read it waited for failed).
 */
type OpOutcome =
  | { key: OpKey; size: number; status: "empty" | "skipped" }
  | { key: OpKey; size: number; status: "ok"; requests: number; removed?: number }
  | { key: OpKey; size: number; status: "failed"; cause: unknown; nothingSent?: boolean };

/** The three upsert operations, once they were started (or decided not to be). */
interface UpsertOps {
  contracts: Promise<OpOutcome>;
  costsA: Promise<OpOutcome>;
  costsB: Promise<OpOutcome>;
}

const now = (): number => (typeof performance !== "undefined" ? performance.now() : Date.now());

/* ══════════════════════════════════════════════════════════════════ execution ══ */

type Settled<T> = { ok: true; value: T } | { ok: false; error: unknown };

/**
 * Runs the plan as the module note draws it. An empty operation makes no call. Throws
 * `RowsGoneError` (no upsert sent), `SavePlanError`, or a failed verify read as it is when
 * nothing landed.
 */
export async function executeSavePlan(plan: SaveBuildPlan, deps: SavePlanDeps): Promise<SavePlanResult> {
  const started = now();
  const requests: SavePlanRequests = {
    verify: 0, contracts: 0, costs: 0, costDeletes: 0, contractDeletes: 0, reconcile: 0, total: 0,
  };
  const timings: SavePlanTimings = {};
  const spans = new Map<TimingKey, { start: number; end: number }>();

  // With `deferContractDeletes` / `deferCostDeletes`, a deferred group's requests and timing are
  // held apart until it is known whether the save waits for it: a result returned early must
  // never be mutated afterwards. A group with nothing to send is not deferred.
  const deferContracts = deps.deferContractDeletes === true && plan.contractDeletes.length > 0;
  const deferCosts = deps.deferCostDeletes === true
    && (plan.costDeletes.length > 0 || plan.costDeletesIfExist.length > 0);
  const isDeferred = (key: OpKey): boolean => (key === "contractDeletes" ? deferContracts
    : key === "costDeletes" || key === "costDeletesIfExist" ? deferCosts : false);
  const held: Partial<Record<HeldKey, { requests: number; timing?: number }>> = {};
  const heldOf = (key: OpKey) => (held[OP_TIMING[key] as HeldKey] ??= { requests: 0 });

  const run = async (
    key: OpKey, size: number, send: () => Promise<{ requests: number; removed?: number }>,
  ): Promise<OpOutcome> => {
    if (size === 0) return { key, size, status: "empty" };
    const t0 = now();
    const holdBack = isDeferred(key);
    try {
      const { requests: sent, removed } = await send();
      if (holdBack) heldOf(key).requests += sent;
      else addRequests(requests, key, sent);
      return removed === undefined
        ? { key, size, status: "ok", requests: sent }
        : { key, size, status: "ok", requests: sent, removed };
    } catch (cause) {
      return { key, size, status: "failed", cause };
    } finally {
      const tk = OP_TIMING[key];
      const prev = spans.get(tk);
      const span = { start: Math.min(prev?.start ?? t0, t0), end: Math.max(prev?.end ?? 0, now()) };
      spans.set(tk, span);
      if (holdBack) heldOf(key).timing = span.end - span.start;
      else timings[tk] = span.end - span.start;
    }
  };

  // A failure seen so far, of any operation. Stage B never starts once one is seen.
  let failureSeen = false;
  // A cost delete (3)/(3') failed already: the save never returns early then (it is a failure
  // path known before the return), even when the cost deletes are deferred.
  let costDeleteFailureSeen = false;
  const watch = (p: Promise<OpOutcome>) => p.then((o) => {
    if (o.status === "failed") {
      failureSeen = true;
      if (o.key === "costDeletes" || o.key === "costDeletesIfExist") costDeleteFailureSeen = true;
    }
    return o;
  });

  // The deletes. They need nothing from verify (the deleter treats a 404 as success). A group
  // that is NOT deferred starts at t = 0, contract deletes first (the cascade makes them the
  // slowest). A DEFERRED group starts late, once every write has settled (see below).
  const startContractDeletes = () => watch(run("contractDeletes", plan.contractDeletes.length,
    () => deps.deleteMany(CAPEX_CONTRACTS, plan.contractDeletes, PHASE_LABEL[4])));
  const startCostDeletes = () => watch(run("costDeletes", plan.costDeletes.length,
    () => deps.deleteMany(CAPEX_COSTS, plan.costDeletes, PHASE_LABEL[3])));
  const contractDeletesNow = deferContracts ? undefined : startContractDeletes();
  const costDeletesNow = deferCosts ? undefined : startCostDeletes();

  // t = 0: phase 0, only what needs it.
  const verifyUpserts = deps.verifyUpserts !== false;
  const verifyStart = now();
  const verification: Promise<Settled<Verified>> = verifyPlan(plan, deps, requests, verifyUpserts).then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  ).then((settledVerify) => {
    if (requests.verify > 0) timings.verify = now() - verifyStart;
    return settledVerify;
  });

  // The contract rows (1) actually sent, after the retry flip; the reconcile reads its prefix.
  let sentContracts: readonly UpsertTarget[] = plan.contractUpserts;

  const launch = (contractUpserts: readonly UpsertTarget[], costUpserts: readonly UpsertTarget[]): UpsertOps => {
    sentContracts = contractUpserts;
    const { stageA, stageB } = splitCostTargets(contractUpserts, costUpserts);
    const contracts = watch(run("contracts", contractUpserts.length,
      () => deps.upsert(CAPEX_CONTRACTS, contractUpserts, PHASE_LABEL[1])));
    const costsA = watch(run("costsA", stageA.length,
      () => deps.upsert(CAPEX_COSTS, stageA, PHASE_LABEL[2], STAGE_STEP.costsA)));
    // Stage B: the new contracts' cost rows, as soon as (1) succeeded — not after the slow (4) —
    // and only while no operation has failed. It overlaps whatever still runs.
    const costsB = contracts.then((c): OpOutcome | Promise<OpOutcome> => {
      if (stageB.length === 0) return { key: "costsB", size: 0, status: "empty" };
      if (c.status !== "ok" || failureSeen) return { key: "costsB", size: stageB.length, status: "skipped" };
      return run("costsB", stageB.length, () => deps.upsert(CAPEX_COSTS, stageB, PHASE_LABEL[2], STAGE_STEP.costsB));
    });
    return { contracts, costsA, costsB };
  };

  /** The upserts were never sent: rows gone (`skipped`), or the verify read failed. */
  const notLaunched = (verifyError: { cause: unknown } | undefined): UpsertOps => {
    const { stageA, stageB } = splitCostTargets(plan.contractUpserts, plan.costUpserts);
    const stopped = (key: OpKey, size: number): Promise<OpOutcome> => Promise.resolve(
      size === 0 ? { key, size, status: "empty" }
        : verifyError ? { key, size, status: "failed", cause: verifyError.cause, nothingSent: true }
          : { key, size, status: "skipped" },
    );
    return {
      contracts: stopped("contracts", plan.contractUpserts.length),
      costsA: stopped("costsA", stageA.length),
      costsB: Promise.resolve(stageB.length === 0
        ? { key: "costsB", size: 0, status: "empty" }
        : { key: "costsB", size: stageB.length, status: "skipped" }),
    };
  };

  // (1) and (2a): right after verify, or now when the upserts are not verified.
  const upsertOps: Promise<UpsertOps> = verifyUpserts
    ? verification.then((v) => (v.ok && !v.value.gone
      ? launch(v.value.contractUpserts, v.value.costUpserts)
      : notLaunched(v.ok ? undefined : { cause: v.error })))
    : Promise.resolve(launch(plan.contractUpserts, plan.costUpserts));

  // (3'): the retry-only ids verify found, as soon as it answered (deferred: after the writes).
  const startIfExistDeletes = () => watch(verification.then((v): OpOutcome | Promise<OpOutcome> => {
    const size = plan.costDeletesIfExist.length;
    if (!v.ok) {
      return size === 0 ? { key: "costDeletesIfExist", size, status: "empty" }
        : { key: "costDeletesIfExist", size, status: "failed", cause: v.error, nothingSent: true };
    }
    const ids = v.value.ifExistDeletes;
    if (v.value.gone) {
      return ids.length === 0 ? { key: "costDeletesIfExist", size: 0, status: "empty" }
        : { key: "costDeletesIfExist", size: ids.length, status: "skipped" };
    }
    return run("costDeletesIfExist", ids.length,
      () => deps.deleteMany(CAPEX_COSTS, ids, PHASE_LABEL[3], STAGE_STEP.costDeletesIfExist));
  }));
  const ifExistDeletesNow = deferCosts ? undefined : startIfExistDeletes();

  // Nothing is acted on until EVERY operation settled: no reconcile while a write is in flight.
  // `run` never rejects; `allSettled` keeps that true even for a defect in it.
  const ops = await upsertOps;

  // LATE START OF THE DEFERRED DELETES (D51, follow-up to §11.14 / §11.15). Measured on DEV, 27 Oct, with both groups
  // deferred but still sent at t = 0 beside the writes:
  //   save 13,421 ms, 8 requests; upsert contracts (create 1 + update 1 bulk) 10,751 ms;
  //   upsert costs (create 1 + update 1 bulk) 11,319 ms; stage B (4 req) 2,652 ms;
  //   gate peak 5/16, req avg 6,080 ms, max 11,319 ms; background deletes 16,542 ms
  // — against 1–3 s per bulk request in the run before, with nothing queued. The writes were not
  // waiting for a slot; they were slow on the SERVER, which points at lock contention between the
  // two contract cascades (and the cost deletes) and the writes on the same tables. So a deferred
  // group now starts only once every write has settled: verify, (1), (2a) and (2b). Trade-off:
  // the deferred deletes finish later, in the background, but the writes — the part the user
  // waits for — no longer contend with cascades for locks. A group that is NOT deferred keeps its
  // t = 0 start (the save waits for it anyway). They start right after the writes, before the
  // early-return decision, on every path: on the early path they run in the background; on every
  // other path the save waits for them and then behaves exactly as before.
  if (deferContracts || deferCosts) {
    await settleAll([["contracts", ops.contracts], ["costsA", ops.costsA], ["costsB", ops.costsB]]);
    await verification;
  }
  const contractDeletes = contractDeletesNow ?? startContractDeletes();
  const costDeletes = costDeletesNow ?? startCostDeletes();
  const ifExistDeletes = ifExistDeletesNow ?? startIfExistDeletes();
  // Every operation, in this order (it is the order of `failures` within a phase).
  const all: readonly OpEntry[] = [
    ["contractDeletes", contractDeletes], ["contracts", ops.contracts], ["costsA", ops.costsA],
    ["costDeletes", costDeletes], ["costDeletesIfExist", ifExistDeletes], ["costsB", ops.costsB],
  ];
  const effective = (): SaveBuildPlan => ({ ...plan, contractUpserts: sentContracts });

  if (deferContracts || deferCosts) {
    // D51 option A: settle everything that is NOT deferred first. Return early only when that all
    // succeeded and nothing needs reconciling; every other path falls through and waits for all.
    const others = await settleAll(all.filter(([key]) => !isDeferred(key)));
    const early = await verification;
    if (early.ok && !early.value.gone && !costDeleteFailureSeen
      && !others.some((o) => o.status === "failed") && !needsReconcile(others)) {
      // SAFETY, contract deletes: a deferred contract delete affects no total. A deleted contract
      // is never in `plan.totals`, and (3) holds none of its cost rows (its cascade removes them),
      // so its failure leaves every surviving total true; it is reported, never reconciled.
      // SAFETY, cost deletes: they DO feed totals, and (1) has already written the FINAL totals,
      // which assume the deletes landed. The mismatch is bounded: the totals are already what the
      // sheet will show once the deletes land, the deletes normally land within seconds, and a
      // delete that fails (or may have, partly) is reconciled in the background — re-read,
      // recompute, write back only the totals that differ — and reported in `background`
      // (`costDeleteError`, `reconciled`). A surviving cost row never disappears unreported.
      const background = backgroundOf(all.filter(([key]) => isDeferred(key)), others, effective(), deps);
      requests.total = sumRequests(requests);
      timings.total = now() - started;
      return { requests, stats: plan.stats, timings, background };
    }
  }

  const outcomes = await settleAll(all);
  // The save waited for the deferred groups after all: count them as without the flags.
  for (const [key, h] of Object.entries(held) as [HeldKey, { requests: number; timing?: number }][]) {
    requests[key] += h.requests;
    if (h.timing !== undefined) timings[key] = h.timing;
  }
  const verified = await verification;
  const plannedAsSent = effective();

  if (!verified.ok && !outcomes.some(mayHaveLanded)
    && outcomes.every((o) => o.status !== "failed" || o.nothingSent === true)) {
    // The read failed and nothing else happened: as before, it propagates as it is.
    throw verified.error;
  }
  if (verified.ok && verified.value.gone) {
    throw await goneAndReconcile(plannedAsSent, deps, outcomes, requests, timings, verified.value);
  }
  if (outcomes.some((o) => o.status === "failed")) {
    throw await failAndReconcile(plannedAsSent, deps, outcomes, requests, timings);
  }
  requests.total = sumRequests(requests);
  timings.total = now() - started;
  return { requests, stats: plan.stats, timings };
}

/** An operation and the promise of its outcome. */
type OpEntry = readonly [OpKey, Promise<OpOutcome>];

/**
 * Settles every entry. `run` never rejects; `allSettled` keeps that true even for a defect in it,
 * turning a rejection into a failure of that operation.
 */
async function settleAll(entries: readonly OpEntry[]): Promise<OpOutcome[]> {
  const settled = await Promise.allSettled(entries.map(([, p]) => p));
  return settled.map((s, i): OpOutcome => (s.status === "fulfilled"
    ? s.value
    : { key: (entries[i] as OpEntry)[0], size: 1, status: "failed", cause: s.reason }));
}

/**
 * The deferred deletes after an early return, as ONE promise that never rejects. It waits for
 * every deferred operation (never reconciling while one of them is in flight), then, when a cost
 * delete failed, reconciles the surviving contracts' totals. The plan carries no cost → contract
 * map, so the scope is every surviving contract of `plan.totals`, compared (not forced): heavier,
 * but this path runs only on a failure. Its requests go to the outcome, never into the returned
 * result, which must not change after it was returned.
 */
function backgroundOf(
  deferred: readonly OpEntry[], others: readonly OpOutcome[], plan: SaveBuildPlan, deps: SavePlanDeps,
): Promise<BackgroundOutcome> {
  const work = async (): Promise<BackgroundOutcome> => {
    const settled = await settleAll(deferred);
    const outcome: BackgroundOutcome = { requests: 0 };
    for (const o of settled) if (o.status === "ok") outcome.requests += o.requests;
    const failures = settled.filter((o): o is Extract<OpOutcome, { status: "failed" }> => o.status === "failed");
    // `settled` keeps `all`'s order, so (3) comes before (3'): the first cost failure is (3)'s.
    const costCause = failures.find((o) => o.key !== "contractDeletes");
    const contractCause = failures.find((o) => o.key === "contractDeletes");
    if (costCause) outcome.costDeleteError = costCause.cause;
    if (contractCause) outcome.contractDeleteError = contractCause.cause;
    const first = costCause ?? contractCause;
    if (first) outcome.error = first.cause;
    if (costCause) {
      // Any cost-delete failure, whatever its `deletedCount`: (1) wrote totals that assume every
      // delete landed, so a row that survived makes its contract's total too low.
      const bgRequests: SavePlanRequests = {
        verify: 0, contracts: 0, costs: 0, costDeletes: 0, contractDeletes: 0, reconcile: 0, total: 0,
      };
      const result = await reconcileTotals(plan, deps, [...others, ...settled], bgRequests, {}, new Set());
      outcome.requests += bgRequests.reconcile;
      outcome.reconciled = result.reconciled;
      if (result.reconcileError !== undefined) outcome.reconcileError = result.reconcileError;
    }
    return outcome;
  };
  return work().catch((error: unknown): BackgroundOutcome => ({ requests: 0, error }));
}

function addRequests(requests: SavePlanRequests, key: OpKey, sent: number): void {
  if (key === "contracts") requests.contracts += sent;
  else if (key === "costsA" || key === "costsB") requests.costs += sent;
  else if (key === "costDeletes" || key === "costDeletesIfExist") requests.costDeletes += sent;
  else requests.contractDeletes += sent;
}

/** The contract id a cost target binds to (`/<set>(<id>)`), or undefined for an update without one. */
function boundContractId(fields: Readonly<Record<string, unknown>>): string | undefined {
  const value = fields[CONTRACT_BIND];
  if (typeof value !== "string") return undefined;
  return /\(([^()]+)\)\s*$/.exec(value)?.[1];
}

/**
 * Stage A gets the cost targets whose contract already exists; stage B those bound to an
 * `isNew` contract target (after phase 0's retry flip, when it ran). A cost update carries no
 * bind: its row exists, so its contract does too.
 */
function splitCostTargets(
  contractUpserts: readonly UpsertTarget[], costUpserts: readonly UpsertTarget[],
): { stageA: UpsertTarget[]; stageB: UpsertTarget[] } {
  const newContracts = new Set(contractUpserts.filter((t) => t.isNew).map((t) => t.id.toLowerCase()));
  const stageA: UpsertTarget[] = [];
  const stageB: UpsertTarget[] = [];
  for (const target of costUpserts) {
    const contractId = boundContractId(target.fields);
    if (contractId !== undefined && newContracts.has(contractId.toLowerCase())) stageB.push(target);
    else stageA.push(target);
  }
  return { stageA, stageB };
}

/* ═════════════════════════════════════════════════════════════ phase 0: verify ══ */

/** `ids` without repeats, compared case-insensitively; first spelling kept. */
function distinct(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    const k = id.toLowerCase();
    if (!seen.has(k)) { seen.add(k); out.push(id); }
  }
  return out;
}

/** One existence read for `table`, or none when there is nothing to check. Lower-cased result. */
async function existingOf(
  deps: SavePlanDeps, table: BulkTableInfo, ids: readonly string[], requests: SavePlanRequests,
): Promise<ReadonlySet<string>> {
  if (ids.length === 0) return new Set();
  const found = await deps.existingIds(table, ids);
  requests.verify += chunk(ids).length;
  return new Set([...found].map((id) => id.toLowerCase()));
}

/** A "new" target that already exists (an earlier failed attempt created it): send it as an update. */
function asRetriedUpdate(target: UpsertTarget): UpsertTarget {
  const fields: Record<string, unknown> = { ...target.fields };
  delete fields[OWNING_BU_BIND];
  return { id: target.id, isNew: false, fields: Object.freeze(fields) };
}

/** What phase 0 found. */
interface Verified {
  /** The upsert targets to send: already-existing new ones flipped to updates (when verified). */
  contractUpserts: readonly UpsertTarget[];
  costUpserts: readonly UpsertTarget[];
  /** The `costDeletesIfExist` ids that exist (and are not already in `costDeletes`). */
  ifExistDeletes: string[];
  /** Missing stored upsert targets per table; absent when none (or upserts not verified). */
  gone?: { contracts: number; costs: number };
  /** The missing stored contract targets, lower-cased: never reconciled (it would re-create them). */
  goneContractIds: ReadonlySet<string>;
}

/**
 * Phase 0: reads the upsert targets (when `verifyUpserts`) and the `costDeletesIfExist` ids, both
 * tables at once. Rejects when a read failed (after both settled).
 */
async function verifyPlan(
  plan: SaveBuildPlan, deps: SavePlanDeps, requests: SavePlanRequests, verifyUpserts: boolean,
): Promise<Verified> {
  // A new target that cannot exist yet is not read back; it is simply absent from `found`.
  const toCheck = (targets: readonly UpsertTarget[]) => (verifyUpserts
    ? targets.filter((t) => !t.isNew || (deps.mayExist?.(t.id) ?? true)).map((t) => t.id)
    : []);
  const deletedNow = new Set(plan.costDeletes.map((id) => id.toLowerCase()));
  const ifExist = distinct(plan.costDeletesIfExist).filter((id) => !deletedNow.has(id.toLowerCase()));
  const [contractsRead, costsRead] = await Promise.allSettled([
    existingOf(deps, CAPEX_CONTRACTS, distinct(toCheck(plan.contractUpserts)), requests),
    existingOf(deps, CAPEX_COSTS, distinct([...toCheck(plan.costUpserts), ...ifExist]), requests),
  ]);
  if (contractsRead.status === "rejected") throw contractsRead.reason;
  if (costsRead.status === "rejected") throw costsRead.reason;
  const contractsFound = contractsRead.value;
  const costsFound = costsRead.value;
  const exists = (found: ReadonlySet<string>) => (id: string) => found.has(id.toLowerCase());
  const ifExistDeletes = ifExist.filter(exists(costsFound));

  if (!verifyUpserts) {
    return { contractUpserts: plan.contractUpserts, costUpserts: plan.costUpserts, ifExistDeletes, goneContractIds: new Set() };
  }

  const missing = (targets: readonly UpsertTarget[], found: ReadonlySet<string>) =>
    targets.filter((t) => !t.isNew && !exists(found)(t.id));
  const goneContracts = missing(plan.contractUpserts, contractsFound);
  const goneCosts = missing(plan.costUpserts, costsFound);
  const goneContractIds = new Set(goneContracts.map((t) => t.id.toLowerCase()));
  if (goneContracts.length > 0 || goneCosts.length > 0) {
    return {
      contractUpserts: plan.contractUpserts, costUpserts: plan.costUpserts, ifExistDeletes,
      gone: { contracts: goneContracts.length, costs: goneCosts.length }, goneContractIds,
    };
  }

  const settle = (targets: readonly UpsertTarget[], found: ReadonlySet<string>) =>
    targets.map((t) => (t.isNew && exists(found)(t.id) ? asRetriedUpdate(t) : t));
  return {
    contractUpserts: settle(plan.contractUpserts, contractsFound),
    costUpserts: settle(plan.costUpserts, costsFound),
    ifExistDeletes,
    goneContractIds,
  };
}

function sumRequests(r: SavePlanRequests): number {
  return r.verify + r.contracts + r.costs + r.costDeletes + r.contractDeletes + r.reconcile;
}

/* ═════════════════════════════════════════════════════════════ reconciliation ══ */

/**
 * What an operation error says about how much of it committed, read duck-typed off
 * `BulkWriteError` (`rowsCommitted`, `chunksCommitted`) and `BulkDeleteError` (`deletedCount`).
 */
interface CommitProgress {
  rowsCommitted?: number;
  chunksCommitted?: number;
  deletedCount?: number;
  /** `BulkDeleteError.removedCount`: rows this delete removed itself (confirmed 404s left out). */
  removedCount?: number;
}

function commitProgress(error: unknown): CommitProgress {
  if (typeof error !== "object" || error === null) return {};
  const e = error as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
  return {
    rowsCommitted: num(e.rowsCommitted),
    chunksCommitted: num(e.chunksCommitted),
    deletedCount: num(e.deletedCount),
    removedCount: num(e.removedCount),
  };
}

const isDelete = (key: OpKey) => key === "costDeletes" || key === "costDeletesIfExist" || key === "contractDeletes";

/** A failure that sent nothing: a `BulkValidationError`, or a call never made (`nothingSent`). */
const sentNothing = (o: Extract<OpOutcome, { status: "failed" }>) =>
  o.nothingSent === true || o.cause instanceof BulkValidationError;

/**
 * Did this operation write, or may it have? A failure that sent nothing did not. An error that
 * reports no counts is treated as "may have" — one extra read is cheaper than a lying total.
 */
function mayHaveLanded(o: OpOutcome): boolean {
  if (o.status === "ok") return true;
  if (o.status !== "failed" || sentNothing(o)) return false;
  const p = commitProgress(o.cause);
  if (isDelete(o.key)) return p.deletedCount === undefined || p.deletedCount > 0;
  if (p.rowsCommitted === undefined && p.chunksCommitted === undefined) return true;
  return (p.rowsCommitted ?? 0) > 0 || (p.chunksCommitted ?? 0) > 0;
}

/**
 * Did this operation CHANGE something in Dataverse itself, or may it have? `committedBefore`
 * only (L2 / F5: "Some of your changes were already saved" must not be said when nothing was).
 * It is `mayHaveLanded`, except that a delete which removed nothing itself — every id a
 * confirmed 404 (`removed` 0 on success, `removedCount` 0 on a `BulkDeleteError`) — is "no".
 *
 * Not used for `needsReconcile` or the verify-failure propagation, which keep `mayHaveLanded`. It
 * does gate the reconcile as a whole (E6 #1): when no operation committed anything, no stored total
 * changed, so `reconcileTotals` writes nothing and `committedBefore` false stays true to Dataverse.
 */
function committedSomething(o: OpOutcome): boolean {
  if (!isDelete(o.key)) return mayHaveLanded(o);
  if (o.status === "ok") return o.removed === undefined || o.removed > 0;
  if (o.status === "failed" && !sentNothing(o)) {
    const removed = commitProgress(o.cause).removedCount;
    if (removed !== undefined) return removed > 0;
  }
  return mayHaveLanded(o);
}

/**
 * Totals can lie only when the writes that feed them — (1), (2a), (2b), (3), (3') — partly
 * landed: something of them landed (or may have) AND something of them did not. Nothing landed:
 * the stored totals and costs are as they were. Everything landed: the plan's totals are true.
 * (4) never matters: a deleted contract has no total, and (3) holds none of its rows.
 */
function needsReconcile(outcomes: readonly OpOutcome[]): boolean {
  const feeding = outcomes.filter((o) => o.key !== "contractDeletes");
  return feeding.some(mayHaveLanded) && feeding.some((o) => o.status === "failed" || o.status === "skipped");
}

/**
 * Which contracts to reconcile, and how.
 *  - `compare`: (1) is known to have written its row, so its stored total is the plan's; it is
 *    rewritten only when the actual sum differs.
 *  - `force`: an EXISTING contract whose (1) row did not land, or may not have. Its stored total
 *    is unknown (the old one, or the plan's) while (2a)/(3) may have changed its costs, so the
 *    actual sum is always written. An update of an existing contract is always safe.
 *  - `unverified`: a NEW contract (1) may or may not have created (no `rowsCommitted`). Never
 *    written: an upsert on an id that does not exist would CREATE a bare contract.
 * A new contract past `rowsCommitted` (or after a failure that sent nothing) definitely did not
 * land and is left out. The executor sends chunks in row order, so the first `rowsCommitted`
 * rows are the ones that landed. Deleted contracts, and `exclude` (contracts phase 0 found gone),
 * are left out in every case.
 */
function reconcileScope(
  plan: SaveBuildPlan, contracts: OpOutcome, exclude: ReadonlySet<string>,
): { ids: string[]; force: ReadonlySet<string>; unverified: string[] } {
  const deleted = new Set(plan.contractDeletes.map((id) => id.toLowerCase()));
  const candidates = [...plan.totals.keys()]
    .filter((id) => !deleted.has(id.toLowerCase()) && !exclude.has(id.toLowerCase()));
  const rows = plan.contractUpserts;
  const isNew = new Set(rows.filter((r) => r.isNew).map((r) => r.id.toLowerCase()));
  // Contracts with a planned total but NO target were skipped because their stored total already
  // equals the planned one (`buildSavePlan`), so compare-and-write is enough; forcing would rewrite
  // every skipped contract after any partial failure.
  const targeted = new Set(rows.map((r) => r.id.toLowerCase()));

  // How many of (1)'s rows are known to have landed; undefined = unknown.
  let landedCount: number | undefined;
  if (contracts.status === "ok") landedCount = rows.length;
  else if (contracts.status !== "failed") landedCount = 0;
  else if (sentNothing(contracts)) landedCount = 0;
  else landedCount = commitProgress(contracts.cause).rowsCommitted;
  const landed = new Set(rows.slice(0, landedCount ?? 0).map((r) => r.id.toLowerCase()));

  const ids: string[] = [];
  const force = new Set<string>();
  const unverified: string[] = [];
  for (const id of candidates) {
    const k = id.toLowerCase();
    if (landed.has(k) || !targeted.has(k)) ids.push(id);
    else if (!isNew.has(k)) { ids.push(id); force.add(id); }
    else if (landedCount === undefined) unverified.push(id);
  }
  return { ids, force, unverified };
}

interface ReconcileOutcome {
  reconciled: boolean;
  reconcileError?: unknown;
  unverifiedContractIds: readonly string[];
}

/** After every operation settled: re-reads, recomputes and writes back what may be wrong. */
async function reconcileTotals(
  plan: SaveBuildPlan, deps: SavePlanDeps, outcomes: readonly OpOutcome[], requests: SavePlanRequests,
  timings: SavePlanTimings, exclude: ReadonlySet<string>,
): Promise<ReconcileOutcome> {
  // Nothing of this save committed (every delete confirmed it removed 0 rows, every upsert reported
  // 0): no stored total changed, so there is nothing to repair. Without this the reconcile could
  // still force a no-op total write, and `committedBefore` would no longer be exact.
  if (!needsReconcile(outcomes) || !outcomes.some(committedSomething)) {
    return { reconciled: true, unverifiedContractIds: [] };
  }
  const contracts = outcomes.find((o) => o.key === "contracts") as OpOutcome;
  const { ids, force, unverified } = reconcileScope(plan, contracts, exclude);
  const t0 = now();
  try {
    if (ids.length > 0) {
      const actual = await deps.loadCosts(ids);
      const fixes = totalsToWrite(ids, actual, plan.totals, force);
      if (fixes.length > 0) {
        requests.reconcile = (await deps.upsert(CAPEX_CONTRACTS, fixes, "reconcile totals")).requests;
      }
    }
  } catch (reconcileError) {
    return { reconciled: false, reconcileError, unverifiedContractIds: unverified };
  } finally {
    timings.reconcile = now() - t0;
  }
  return { reconciled: unverified.length === 0, unverifiedContractIds: unverified };
}

/** Every failed operation, lowest phase first. */
function failuresOf(outcomes: readonly OpOutcome[]): { phase: SavePhase; cause: unknown }[] {
  return outcomes
    .filter((o): o is Extract<OpOutcome, { status: "failed" }> => o.status === "failed")
    .map((o) => ({ phase: OP_PHASE[o.key], cause: o.cause }))
    .sort((a, b) => a.phase - b.phase);
}

/** A failed operation: reconcile if needed, then build the error. */
async function failAndReconcile(
  plan: SaveBuildPlan, deps: SavePlanDeps, outcomes: readonly OpOutcome[], requests: SavePlanRequests,
  timings: SavePlanTimings,
): Promise<SavePlanError> {
  const failures = failuresOf(outcomes);
  const { phase, cause } = failures[0] as { phase: SavePhase; cause: unknown };
  // "May have" rather than "proved": an error without counts (creates and updates failing
  // together, or a per-row fallback) can still have landed rows, and the retry is safe either way
  // because the ids are stable. A delete of rows that were all confirmed already gone, or an
  // upsert error that reports 0 rows, changed nothing (`committedSomething`). The reconcile only
  // runs when something did, so it cannot make a "nothing committed" save write.
  const committedBefore = outcomes.some(committedSomething);
  const result = await reconcileTotals(plan, deps, outcomes, requests, timings, new Set());
  requests.total = sumRequests(requests);
  return new SavePlanError({ phase, cause, failures, requests, committedBefore, ...result });
}

/**
 * Phase 0 found stored targets gone: no upsert was sent, but the deletes ran alongside the check.
 * Cost deletes that landed change surviving contracts' sums, so those totals are reconciled; the
 * gone contracts are never written (an update of a missing id would fail, an upsert re-create it).
 */
async function goneAndReconcile(
  plan: SaveBuildPlan, deps: SavePlanDeps, outcomes: readonly OpOutcome[], requests: SavePlanRequests,
  timings: SavePlanTimings, verified: Verified,
): Promise<RowsGoneError> {
  const committedBefore = outcomes.some(committedSomething);
  const result = await reconcileTotals(plan, deps, outcomes, requests, timings, verified.goneContractIds);
  requests.total = sumRequests(requests);
  return new RowsGoneError(verified.gone as { contracts: number; costs: number }, requests, {
    committedBefore,
    reconciled: result.reconciled,
    reconcileError: result.reconcileError,
    failures: failuresOf(outcomes),
  });
}

/**
 * One `vsb_totalcost` update per contract whose actual total differs from the plan's, plus one
 * for every `force` contract (its stored total is not known).
 */
function totalsToWrite(
  ids: readonly string[], actual: readonly ExistingCost[], planned: ReadonlyMap<string, number>,
  force: ReadonlySet<string>,
): UpsertTarget[] {
  const byContract = new Map<string, ExistingCost[]>();
  for (const cost of actual) {
    const list = byContract.get(cost.contractId);
    if (list) list.push(cost);
    else byContract.set(cost.contractId, [cost]);
  }
  const fixes: UpsertTarget[] = [];
  for (const id of ids) {
    const total = recomputeContractTotal(byContract.get(id) ?? []);
    if (force.has(id) || total !== planned.get(id)) fixes.push({ id, isNew: false, fields: { vsb_totalcost: total } });
  }
  return fixes;
}
