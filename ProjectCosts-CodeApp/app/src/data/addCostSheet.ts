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
 * Each PHASE is awaited before the next begins; ordering BETWEEN phases is what carries the
 * safety guarantees here, same as it always was. WITHIN the contract, cost-cell and
 * contract-total phases, the writes are no longer one row at a time, pooled or otherwise — they
 * go through `bulkWrite.ts`'s `UpsertMultiple`/`UpdateMultiple`, one Dataverse round trip per
 * PHASE (chunked only if the phase is unusually large) instead of one per row. A full sheet is
 * easily several hundred changed month cells; that used to be several hundred round trips run
 * eight at a time through `./concurrency`, now it is one or two. See `bulkWrite.ts`'s module
 * comment for how that is reachable at all without a raw Web API call, and why it is
 * all-or-nothing PER PHASE rather than per row — which is also why each of those three phases
 * is wrapped to turn a failure into a message naming exactly what the user can trust survived.
 * Cost deletes and the contract-delete cascade still go one row at a time: there is no bulk
 * delete for a standard table (`DeleteMultiple` is elastic-tables-only). They run through a
 * wider pool (`DELETE_CONCURRENCY`), and the cascade starts with the first phase rather than
 * after the cost writes, since it touches only contracts no other phase writes.
 *
 * The write half follows `src/data/capexWrites.ts`'s ordering convention: contract writes
 * first, then cost writes, cost deletes and the contract-total recompute; contract deletes run
 * alongside all of it, on disjoint contracts (a delete removes the contract's own comments, then its cost rows, then the contract, so an
 * interrupted save cannot orphan a comment or a cost row pointing at a deleted contract — the
 * same order `deleteCostLine` in `capexWrites.ts` uses). None of it is transactional: Dataverse's
 * bulk messages are all-or-nothing per request, not across requests, and the per-row calls that
 * remain (deletes) never were transactional either.
 */
import { Vsb_capexprojectcontractsService } from "@/generated/services/Vsb_capexprojectcontractsService";
import { Vsb_capexcostsService } from "@/generated/services/Vsb_capexcostsService";
import { deleteRecord, fetchAll } from "./client";
import { ACTIVE, and, chunk, lookupEq, lookupIn } from "./odata";
import { DELETE_CONCURRENCY, forEachLimit } from "./concurrency";
import { BulkWriteError, createAndUpdateMultiple, updateMultiple } from "./bulkWrite";
import { loadCostAccounts, loadPayerDefaults } from "./costBook";
import { loadComments } from "./comments";
import { DataError } from "@/platform/errors";
import { planDeleteContract } from "@/features/capex-costs/rules";
import {
  contractUpserts, costWrites, recomputeContractTotal,
  type ContractUpsert, type ExistingContract, type ExistingCost, type SheetRow,
} from "@/features/add-costs-from-table/rules";

const bind = (entitySet: string, id: string) => `/${entitySet}(${id})`;

/**
 * Wall time per save phase, logged ONCE per successful save as a single console line with the
 * row counts beside it. Purely diagnostic — nothing reads it — so a slow save in a live
 * environment says which phase was slow and for how many rows, instead of being guessed at.
 */
function phaseTimer() {
  const started = performance.now();
  let last = started;
  const phases: Record<string, number> = {};
  return {
    lap(name: string) {
      const now = performance.now();
      phases[name] = Math.round(now - last);
      last = now;
    },
    done(counts: Record<string, number>) {
      // eslint-disable-next-line no-console -- deliberate: the one place save timing is surfaced.
      console.info("Add Cost from Table save timings (ms)", {
        ...phases, total: Math.round(performance.now() - started), ...counts,
      });
    },
  };
}

/** Option sets arrive as a number or as its string form depending on the column. */
function numberOf(value: unknown): number | undefined {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

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
  "vsb_iseditedfrompcf", "vsb_totalcost",
];

export async function loadAddCostSheetData(
  projectId: string,
  category: number,
): Promise<AddCostSheetData> {
  // Neither of these needs the other's result, so they go in flight together rather than one
  // waiting on the other — `payerDefaults` used to start only after `chart` resolved, for no
  // reason tied to what either of them actually reads.
  const [chart, payerDefaults] = await Promise.all([loadCostAccounts(), loadPayerDefaults()]);
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
  const contractBatches = await Promise.all(
    chunk(subIds).map((ids) =>
      fetchAll(
        "list Add Cost from Table contracts",
        (o) => Vsb_capexprojectcontractsService.getAll(o),
        {
          select: CONTRACT_SELECT,
          filter: and(lookupEq("vsb_project", projectId), lookupIn("vsb_account", ids), ACTIVE),
        },
      ),
    ),
  );

  const rawContracts = contractBatches.flat();
  const contracts: ExistingContract[] = rawContracts.map((c) => ({
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
    totalCost: typeof c.vsb_totalcost === "number" ? c.vsb_totalcost : null,
  }));

  const contractIds = contracts.map((c) => c.id);
  const costBatches = contractIds.length === 0 ? [] : await Promise.all(
    chunk(contractIds).map((ids) =>
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

  const costs: ExistingCost[] = costBatches.flat().map((r) => ({
    id: r.vsb_capexcostid,
    contractId: r._vsb_contract_value ?? "",
    year: Number(r.vsb_year ?? 0),
    month: Number(numberOf(r.vsb_month) ?? 0),
    cost: r.vsb_cost ?? null,
  }));

  return { accounts, subaccounts, contracts, costs, payerDefaults };
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
}

function contractPayload(u: ContractUpsert) {
  return {
    vsb_name: u.name,
    vsb_applyvat: u.applyVat,
    vsb_depreciation: u.depreciation,
    vsb_costtype: u.costType,
    vsb_distribution: u.distribution,
    vsb_distributionscheme: u.distributionScheme,
    vsb_iseditedfrompcf: u.isEditedFromPcf,
    vsb_initialcontractsource: u.initialContractSource,
  };
}

/**
 * Existing contracts this save will NOT change any stored setting of — every field
 * `contractPayload` would send already equals what Dataverse holds — so they are not sent a
 * settings update at all.
 *
 * Compared against the PAYLOAD's own keys, so a field added to `contractPayload` later and not
 * here reads as "changed" (the safe direction). Two loaded fields lose a stored null on the way
 * in — `isEditedFromPcf` (null -> false) and `name` (null -> "") — so a contract only counts as
 * unchanged when those were genuinely `true` and non-empty, never on a coincidence with null.
 */
function contractsWithUnchangedSettings(
  existingUpserts: readonly ContractUpsert[],
  existingContracts: readonly ExistingContract[],
): Set<string> {
  const byId = new Map(existingContracts.map((c) => [c.id, c]));
  const stable = new Set<string>();
  for (const u of existingUpserts) {
    const stored = u.contractId ? byId.get(u.contractId) : undefined;
    if (!stored || stored.isEditedFromPcf !== true || stored.name === "") continue;
    const storedPayload: Record<string, unknown> = {
      vsb_name: stored.name,
      vsb_applyvat: stored.applyVat,
      vsb_depreciation: stored.depreciation,
      vsb_costtype: stored.costType,
      vsb_distribution: stored.distribution,
      vsb_distributionscheme: stored.distributionScheme,
      vsb_iseditedfrompcf: stored.isEditedFromPcf,
      vsb_initialcontractsource: stored.initialContractSource,
    };
    const sent = contractPayload(u) as Record<string, unknown>;
    if (Object.keys(sent).every((k) => k in storedPayload && storedPayload[k] === sent[k])) {
      stable.add(u.contractId as string);
    }
  }
  return stable;
}

/**
 * A thrown error from one bulk phase, reworded into the one thing the end user needs to know:
 * what this save step was for, and — honestly, not optimistically — whether anything from it
 * might already be sitting in Dataverse. There is no automatic undo of a partially-written
 * phase: a compensating bulk delete is itself a bulk call that can fail, which would leave the
 * user worse off than an accurate message and a safe retry. Reopening the sheet after a failure
 * re-reads the real state from Dataverse, so a retry is always starting from what is actually
 * true, never from stale in-memory data.
 */
function bulkStepError(
  step: string,
  /** What EARLIER phases of this save already wrote, as a full sentence — or "" for the first. */
  earlierPhasesSaved: string,
  whatDidNotHappen: string,
  error: unknown,
  /**
   * True when something ELSE running concurrently with this step may already have written —
   * so "nothing was written" can no longer be claimed, whatever this step's own error says.
   */
  concurrentLegMayHaveWritten = false,
) {
  if (concurrentLegMayHaveWritten || (error instanceof BulkWriteError && error.partial)) {
    return new Error(
      `${step} stopped partway through. ${earlierPhasesSaved ? `${earlierPhasesSaved} ` : ""}` +
      "Some changes may already have been written. Reopen this sheet to see the real current " +
      "state before retrying.",
      { cause: error },
    );
  }
  return new Error(`${step} failed — ${whatDidNotHappen}. Please retry.`, { cause: error });
}

/**
 * Writes a diffed sheet: contract upserts, then cost upserts, then cost deletes, then the
 * touched contracts' totals, then contract deletes (their cost rows first).
 *
 * Contracts, cost cells and totals go through `UpsertMultiple`/`UpdateMultiple` — one Dataverse
 * round trip per PHASE instead of one per ROW — chunked by `bulkWrite.ts` if a phase is large.
 * See that module's comment for why this is reachable at all (the CLI-generated services, not a
 * raw Web API call) and for the all-or-nothing-per-chunk failure shape `bulkStepError` reports.
 *
 * A new contract's id comes back from `CreateMultiple`'s response, same as the server-assigned
 * id the old per-row `create()` call used to return — the cost-cell phase waits for this call to
 * settle before it binds anything to a brand-new contract, same ordering as before. Existing
 * contracts are addressed by the id they already have, through `UpdateMultiple`.
 */
export async function saveAddCostSheet(args: SaveAddCostSheetArgs): Promise<void> {
  const { projectId, owningBusinessUnitId, changedRows, existingContracts, existingCosts } = args;

  const upserts = contractUpserts(changedRows, existingContracts);
  const newUpserts = upserts.filter((u) => !u.contractId);
  const existingUpserts = upserts.filter((u) => u.contractId);
  const stableContractIds = contractsWithUnchangedSettings(existingUpserts, existingContracts);
  const contractRows = [
    ...newUpserts.map((u) => ({
      ...contractPayload(u),
      "vsb_Project@odata.bind": bind("vsb_projects", projectId),
      "vsb_Account@odata.bind": bind("vsb_capexaccountlists", u.subaccountId ?? ""),
      ...(owningBusinessUnitId
        ? { "owningbusinessunit@odata.bind": bind("businessunits", owningBusinessUnitId) }
        : {}),
    })),
    /*
     * An existing contract whose stored settings already equal everything this update would
     * send (`contractsWithUnchangedSettings`) is NOT sent it: the write could change no value.
     * Its total is still written at the end of the save whenever that total changes.
     */
    ...existingUpserts
      .filter((u) => !stableContractIds.has(u.contractId as string))
      .map((u) => ({
        vsb_capexprojectcontractid: u.contractId as string,
        ...contractPayload(u),
      })),
  ];

  // A row with neither an existing id nor a contract to create under cannot be written — this
  // mirrors the original `if (u.costId) {…} else if (u.contractId) {…}`, which silently skipped
  // exactly that case rather than sending a half-formed row.
  const costRowsFor = (writes: ReturnType<typeof costWrites>["upserts"]) => writes
    .filter((u) => u.costId || u.contractId !== null)
    .map((u) => (
      u.costId
        ? { vsb_capexcostid: u.costId, vsb_cost: u.cost }
        : {
          vsb_cost: u.cost,
          vsb_year: u.year,
          vsb_month: u.month,
          // `u.contractId` is non-null here: the filter above only lets a costId-less row
          // through when it is.
          "vsb_Contract@odata.bind": bind("vsb_capexprojectcontracts", u.contractId as string),
          ...(owningBusinessUnitId
            ? { "owningbusinessunit@odata.bind": bind("businessunits", owningBusinessUnitId) }
            : {}),
        }
    ));
  /*
   * `deleteRecord` rather than the generated services' `delete`, which discards the SDK's result
   * and so reports a refused delete (403, cascade block) as a success.
   */
  const deleteRows = (table: string, ids: readonly string[]) => forEachLimit(
    ids,
    (id) => deleteRecord(`delete ${table} row`, table, id).catch((error: unknown) => {
      // Already gone (another user, or a server cascade) is the state this delete wanted.
      if (error instanceof DataError && error.status === 404) return;
      throw error;
    }),
    DELETE_CONCURRENCY,
  );
  const deleteCostRows = (ids: readonly string[]) => deleteRows("vsb_capexcosts", ids);

  /*
   * The contract-delete cascade STARTS NOW, alongside every other phase, and is awaited with the
   * totals at the end. It needs nothing those phases write: `Screen.tsx` drops every row of a
   * doomed contract from `changedRows` before calling this, so the contracts it deletes are
   * provably disjoint from every contract, cost cell and total written here.
   *
   * Deletes within the cascade go CHILDREN BEFORE PARENTS, in three global phases each fully
   * awaited before the next: every comment of every doomed contract, then every cost row, then
   * the contracts. No contract row is touched until every child of EVERY doomed contract is gone,
   * so an interrupted delete can never leave a comment or cost row pointing at a deleted contract.
   * A `vsb_capexcomments` row points at BOTH the contract and, for a payment-date comment, the
   * month's cost row, so comments go first. One `loadComments` covers all doomed contracts.
   */
  const deletesRequested = args.contractDeleteIds.length > 0;
  const deleteCascade = async () => {
    if (!deletesRequested) return;
    const comments = await loadComments(args.contractDeleteIds);
    const flattened = comments.map((c) => ({ id: c.id, contractId: c.contractId ?? "" }));
    const plans = args.contractDeleteIds.map((id) => planDeleteContract(id, flattened));
    const doomed = new Set(args.contractDeleteIds);
    await deleteRows("vsb_capexcommentses", plans.flatMap((p) => p.commentIds));
    await deleteRows(
      "vsb_capexcosts", existingCosts.filter((c) => doomed.has(c.contractId)).map((c) => c.id),
    );
    await deleteRows("vsb_capexprojectcontracts", plans.map((p) => p.contractId));
  };
  let cascadeError: unknown;
  const cascadeSettled = deleteCascade().catch((error: unknown) => { cascadeError = error; });
  const cascadeFailure = () => (cascadeError === undefined ? undefined : new Error(
    "Removing one or more deleted contracts failed partway through. Reopen this sheet to see " +
    "which of them, if any, were actually removed before retrying.",
    { cause: cascadeError },
  ));
  /** An earlier phase failed: let the cascade finish so its outcome is reported too. */
  const failWith = async (failures: (Error | undefined)[]) => {
    if (failures.every((f) => f === undefined)) return;
    await cascadeSettled;
    throwFailures([...failures, cascadeFailure()]);
  };

  /*
   * EARLY cost writes: every row whose contract already exists. Its id is already known, so it
   * goes out ALONGSIDE the contracts step instead of after it — including a contract whose
   * settings this save changes: no plug-in, workflow or rollup is registered on
   * `vsb_capexcost` or `vsb_capexprojectcontract` (the VSBCloud solution's customizations),
   * so nothing reads a contract's settings while its cost rows are written. Only rows of NEW
   * contracts are LATE: they bind to the id `CreateMultiple` returns, the one real dependency.
   *
   * `costWrites` works row by row with no cross-row de-duplication, so planning the two groups
   * separately produces exactly the plan one call over all rows would have.
   */
  const isEarly = (r: SheetRow) => r.projectContractId !== null;
  const earlyPlan = costWrites(changedRows.filter(isEarly), existingCosts);
  const earlyCostRows = costRowsFor(earlyPlan.upserts);
  const earlyWritesSent = earlyCostRows.length > 0 || earlyPlan.deletes.length > 0;

  const timer = phaseTimer();
  let createdContractIds: string[] = [];
  let contractError: unknown;
  let earlyUpsertError: unknown;
  let earlyDeleteError: unknown;
  await Promise.all([
    createAndUpdateMultiple(
      "vsb_capexprojectcontracts", "vsb_capexprojectcontract",
      contractRows, "vsb_capexprojectcontractid",
    )
      .then((r) => { createdContractIds = r.createdIds; })
      .catch((error: unknown) => { contractError = error; }),
    createAndUpdateMultiple("vsb_capexcosts", "vsb_capexcost", earlyCostRows, "vsb_capexcostid")
      .catch((error: unknown) => { earlyUpsertError = error; }),
    deleteCostRows(earlyPlan.deletes).catch((error: unknown) => { earlyDeleteError = error; }),
  ]);
  await failWith([
    contractError === undefined ? undefined : bulkStepError(
      "Saving contracts", "", "no contracts were saved", contractError,
      // Existing contracts' cost writes and the contract deletes ran alongside.
      earlyWritesSent || deletesRequested,
    ),
    earlyUpsertError === undefined ? undefined : bulkStepError(
      "Saving cost values", contractError === undefined ? "Contracts were saved." : "",
      contractError === undefined && contractRows.length > 0
        ? "contracts were saved, but no cost values were written"
        : "no cost values were written",
      earlyUpsertError,
      // Contract writes are described on their own; only other COST-side writes running
      // alongside (cleared-cell deletes, contract deletes) make "no cost values" unsafe to claim.
      earlyPlan.deletes.length > 0 || deletesRequested,
    ),
    earlyDeleteError === undefined ? undefined : new Error(
      "Removing the cleared cost cells failed — some cells you cleared may still show their " +
      "old value. Reopen this sheet and clear them again.",
      { cause: earlyDeleteError },
    ),
  ]);
  timer.lap("contractsAndEarlyCosts");

  const resolvedIdByGroup = new Map<string, string>([
    ...newUpserts.map((u, i) => (
      [`${u.subaccountId}|${u.name}`, createdContractIds[i] as string] as const
    )),
    ...existingUpserts.map((u) => [`${u.subaccountId}|${u.name}`, u.contractId as string] as const),
  ]);

  const lateRows = changedRows.filter((r) => !isEarly(r)).map((r) => (
    r.projectContractId
      ? r
      : { ...r, projectContractId: resolvedIdByGroup.get(`${r.subAccountId}|${r.description}`) ?? null }
  ));
  const latePlan = costWrites(lateRows, existingCosts);
  const lateCostRows = costRowsFor(latePlan.upserts);

  /*
   * LATE cost writes. The upsert (changed cells) and the deletes (blanked cells) never touch the
   * same row — `costWrites` assigns a given (contract, year, month) to exactly one of the two
   * plans, never both — so they run CONCURRENTLY. Each leg's failure is caught on its OWN, so a
   * delete failure is never reported as an upsert failure or vice versa. There is no
   * standard-table bulk delete (`DeleteMultiple` is elastic-table-only), so deletes stay per
   * row, through the bounded pool.
   */
  let costUpsertError: unknown;
  let costDeleteError: unknown;
  await Promise.all([
    createAndUpdateMultiple("vsb_capexcosts", "vsb_capexcost", lateCostRows, "vsb_capexcostid")
      .catch((error: unknown) => { costUpsertError = error; }),
    deleteCostRows(latePlan.deletes).catch((error: unknown) => { costDeleteError = error; }),
  ]);
  await failWith([
    costUpsertError === undefined ? undefined : bulkStepError(
      "Saving cost values",
      earlyWritesSent
        ? "Contracts, and the cost values for existing contracts, were saved."
        : "Contracts were saved.",
      "contracts were saved, but no cost values were written", costUpsertError,
      // Earlier cost writes, or the deletes running alongside, may have landed.
      earlyWritesSent || latePlan.deletes.length > 0 || deletesRequested,
    ),
    costDeleteError === undefined ? undefined : new Error(
      "Removing the cleared cost cells failed — some cells you cleared may still show their " +
      "old value. Reopen this sheet and clear them again.",
      { cause: costDeleteError },
    ),
  ]);
  timer.lap("lateCosts");

  // The whole save's cost plan, for the totals below — early and late together.
  const plan = {
    upserts: [...earlyPlan.upserts, ...latePlan.upserts],
    deletes: [...earlyPlan.deletes, ...latePlan.deletes],
  };
  const costRows = [...earlyCostRows, ...lateCostRows];

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

  /*
   * One contract's total has no bearing on another's, so all of them go in one call. A total
   * equal to the value already stored is not re-sent: the write could change nothing, and when
   * every total is unchanged this whole step makes no request. A missing stored value (null)
   * is always written.
   */
  const storedTotalById = new Map(existingContracts.map((c) => [c.id, c.totalCost]));
  let totalsUnchanged = 0;
  const totalsRows = touchedContractIds.flatMap((contractId) => {
    const merged = new Map<string, number>();
    for (const c of existingByContract.get(contractId) ?? []) merged.set(`${c.year}-${c.month}`, c.cost ?? 0);
    for (const u of upsertsByContract.get(contractId) ?? []) merged.set(`${u.year}-${u.month}`, u.cost);
    for (const c of deletedByContract.get(contractId) ?? []) merged.delete(`${c.year}-${c.month}`);
    const total = recomputeContractTotal([...merged.values()].map((cost) => ({ cost })));
    const stored = storedTotalById.get(contractId);
    if (typeof stored === "number" && stored === total) {
      totalsUnchanged += 1;
      return [];
    }
    return [{ vsb_capexprojectcontractid: contractId, vsb_totalcost: total }];
  });

  // The totals and the already-running delete cascade touch provably disjoint contracts.
  let totalsError: unknown;
  await Promise.all([
    updateMultiple("vsb_capexprojectcontracts", "vsb_capexprojectcontract", totalsRows)
      .catch((error: unknown) => { totalsError = error; }),
    cascadeSettled,
  ]);
  throwFailures([
    totalsError === undefined ? undefined : bulkStepError(
      "Updating contract totals", "Contracts and cost values were saved.",
      "contracts and cost values were saved, but totals were not updated — reopen this sheet " +
      "and save again to recalculate them",
      totalsError,
    ),
    cascadeFailure(),
  ]);
  timer.lap("totalsAndContractDeletes");
  timer.done({
    newContracts: newUpserts.length,
    updatedContracts: existingUpserts.length - stableContractIds.size,
    unchangedContractsNotResent: stableContractIds.size,
    costRowsWritten: costRows.length,
    costRowsWrittenEarly: earlyCostRows.length,
    costCellsCleared: plan.deletes.length,
    contractTotals: totalsRows.length,
    contractTotalsUnchangedNotResent: totalsUnchanged,
    contractsDeleted: args.contractDeleteIds.length,
  });
}

/**
 * Throws whatever failed out of two CONCURRENT legs of one phase — both messages if both failed,
 * so neither failure is ever hidden behind the other.
 */
function throwFailures(failures: (Error | undefined)[]): void {
  const real = failures.filter((f): f is Error => f !== undefined);
  if (real.length === 1) throw real[0];
  if (real.length > 1) {
    throw new Error(real.map((f) => f.message).join(" "), { cause: real });
  }
}
