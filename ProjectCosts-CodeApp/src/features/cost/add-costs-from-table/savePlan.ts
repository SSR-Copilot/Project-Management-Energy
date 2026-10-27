/**
 * Add Cost from Table — the bulk save, PLANNED as a pure function.
 *
 * `buildSavePlan` reduces one sheet Save to a `SaveBuildPlan` (`@/data/bulkTypes`): four
 * in-memory collections that `data/addCostSheetBulk.ts` sends as `CreateMultiple` /
 * `UpdateMultiple` (chosen per row by `isNew`) and delete phases, in this order:
 *
 *   1. contract upserts — new contracts, changed contracts, and every touched contract's total
 *      that differs from the stored one (or whose stored total is unknown). A touched contract
 *      with matching columns AND total gets no target, but keeps its entry in `totals`;
 *   2. cost upserts — one per changed month cell (no-op cells are left out);
 *   3. cost deletes — blanked months, ONLY under contracts that survive this save;
 *   4. contract deletes — their cost rows and comments go by the Dataverse cascade.
 *
 * The final Dataverse state is the one `saveAddCostSheet` (`data/addCostSheet.ts`) leaves
 * behind: the same `contractUpserts` / `costWrites` rules decide what is written. The plan only
 * differs in HOW MANY writes it takes to get there (see the no-op notes below), plus one
 * correction, flagged `DIVERGENCE` at the totals.
 *
 * The plan also carries `applied` (`SavedSheetChanges`, D51 §11.19): the same final state in the
 * DEVEX/CAPEX book's own terms, so the hook can patch the cached book the moment the Save
 * resolves without reading Dataverse field bags.
 *
 * No React, no SDK, no clock and no randomness: a new row's id comes from the injected
 * `deps.newId`, so a cost row can bind to a brand-new contract in the same plan and a test can
 * pin every id (CONVENTIONS rule 5).
 *
 * STABLE IDS ACROSS A RETRY. `newId` is called with an identity key (`contractIdentityKey` /
 * `costIdentityKey`), never bare. The caller keeps one `Map<key, id>` across attempts of the
 * same sheet, so a retry after a failed save sends the SAME ids again and never creates a
 * duplicate of what the failed attempt already created: on a retry the upsert verify reads
 * which of those ids exist, and each row goes as an update (`UpdateMultiple`) or a create
 * (`CreateMultiple`) accordingly (D51 §11.12). Cost
 * ids a failed attempt may have created for cells that are blank now arrive as
 * `input.pendingIds` and leave as `costDeletesIfExist`.
 *
 * CAVEAT (D51): a NEW contract created by a failed attempt and then removed from the sheet
 * before the retry is NOT cleaned up. The retry's sheet no longer names it, so nothing plans
 * its delete, and its pending costs are left with it so its stored total stays consistent
 * with them. It survives as an orphan contract until someone deletes it.
 *
 * Complexity is O(rows × 12 + costs). Every lookup goes through a `Map`/`Set` built once; there
 * is no `find`, `filter` or `includes` inside a loop.
 */
import type {
  SavedContract, SavedContractColumns, SavedCost, SheetSavePlan, UpsertTarget,
} from "@/data/bulkTypes";
import { bind, OWNING_BU_BIND } from "@/data/odata";
import {
  ADDCOST_SAVE_MSG, CHOICE, contractUpserts, costCellKey, costPaidByText, costWrites, recomputeContractTotal,
  type ContractUpsert, type ExistingContract, type ExistingCost, type SheetRow,
} from "./rules";

/**
 * The sheet cannot be saved as it stands: it is ambiguous about which row a contract or a cell
 * belongs to. Thrown BEFORE anything is written. `detail` is a short sentence for the user,
 * built from row data (description, account name, year), never from ids. `message` keeps the
 * technical reason (ids included) for the log; only `detail` is shown to the user.
 */
export class SheetConflictError extends Error {
  readonly detail: string;
  constructor(detail: string, technical: string) {
    super(`buildSavePlan: ${technical} ${detail}`);
    this.name = "SheetConflictError";
    this.detail = detail;
  }
}

/** The identity of a NEW contract: the (sub-account, name) group the planner threads ids by. */
export const contractIdentityKey = (subaccountId: string | null, name: string): string =>
  `contract:${subaccountId}|${name}`;

/**
 * The identity of a NEW cost cell. `contractRef` is the existing contract's id, or the
 * `contractIdentityKey` when the contract is new in this save — so the key never depends on a
 * freshly issued id.
 */
export const costIdentityKey = (contractRef: string, year: number, month: number): string =>
  `cost:${contractRef}|${year}|${month}`;

const CONTRACT_KEY_PREFIX = "contract:";
const COST_KEY_PREFIX = "cost:";

/** The inverse of `costIdentityKey`; null for any other key. Year and month are parsed from the right. */
function parseCostIdentityKey(key: string): { contractRef: string; year: number; month: number } | null {
  if (!key.startsWith(COST_KEY_PREFIX)) return null;
  const mBar = key.lastIndexOf("|");
  const yBar = mBar > 0 ? key.lastIndexOf("|", mBar - 1) : -1;
  if (yBar < COST_KEY_PREFIX.length) return null;
  const year = Number(key.slice(yBar + 1, mBar));
  const month = Number(key.slice(mBar + 1));
  if (!Number.isInteger(year) || !Number.isInteger(month)) return null;
  return { contractRef: key.slice(COST_KEY_PREFIX.length, yBar), year, month };
}

export interface SavePlanInput {
  projectId: string;
  owningBusinessUnitId?: string;
  /** `diffRows` output (plus the Screen's orphan-cleanup rows). */
  changedRows: readonly SheetRow[];
  existingContracts: readonly ExistingContract[];
  /** Every cost row of the category's contracts, all years. */
  existingCosts: readonly ExistingCost[];
  /** `planContractDeletions(...).deleteIds` (or the canvas-parity twin). */
  contractDeleteIds: readonly string[];
  /**
   * Identity key → id that a PREVIOUS failed attempt of this sheet may have created (the
   * caller's id cache). A cost id here that this plan neither writes nor finds stored is a row
   * the failed attempt may have left behind for a cell that is blank now: it goes to
   * `costDeletesIfExist`, never to `costDeletes`. Contract keys are ignored.
   */
  pendingIds?: ReadonlyMap<string, string>;
}

interface BuildSavePlanDeps {
  /**
   * The id for the new row with this identity key. The caller returns the SAME id for the same
   * key across attempts (see the module note); injected so the planner stays pure.
   */
  newId: (identityKey: string) => string;
}

/**
 * The contract columns a sheet edit writes. The ONE definition: the legacy per-row save's
 * `contractPayload` carries exactly these columns.
 */
export function contractFields(u: ContractUpsert): Record<string, unknown> {
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
 * `contractFields(u)` in the DEVEX/CAPEX book's vocabulary (D51 §11.19): the same option-set
 * readings `loadCostLines` (`data/costBook.ts`) applies to the stored row — `resolvePayer` (a
 * sheet always writes DevCo or SPV, so the sub-account mapping is never consulted), Equal only
 * for the Equal value, % only for the % value.
 */
function savedContractColumns(u: ContractUpsert): SavedContractColumns {
  return {
    subaccountId: u.subaccountId,
    name: u.name,
    payer: costPaidByText(u.costType) === "SPV" ? "SPV" : "DevCo",
    depreciation: u.depreciation,
    vat: u.applyVat,
    distribution: u.distribution === CHOICE.distributionType.equal ? "equal" : "individual",
    distributionScheme: u.distributionScheme === CHOICE.distributionScheme.percent ? "percent" : "absolute",
  };
}

/** True when writing `contractFields(u)` would leave the stored contract exactly as it is. */
function contractUnchanged(u: ContractUpsert, c: ExistingContract): boolean {
  return c.name === u.name
    && c.applyVat === u.applyVat
    && c.depreciation === u.depreciation
    && c.costType === u.costType
    && c.distribution === u.distribution
    && c.distributionScheme === u.distributionScheme
    && c.isEditedFromPcf === u.isEditedFromPcf
    && c.initialContractSource === u.initialContractSource;
}

/** True when the stored `vsb_totalcost` is known and already equals `total` (rounded). */
function totalUnchanged(c: ExistingContract | undefined, total: number): boolean {
  const stored = c?.totalCost;
  return typeof stored === "number" && Number.isFinite(stored) && stored === total;
}

/** A contract target while the plan is being built; `fields: null` means "total only". */
interface PendingContract {
  id: string;
  isNew: boolean;
  fields: Record<string, unknown> | null;
  /** `fields` in domain terms (`SavedSheetChanges`); null exactly when `fields` is. */
  columns: SavedContractColumns | null;
}

/** The `${year}-${month}` key the legacy total merge used, within one contract. */
const monthKey = (year: number, month: number): string => `${year}-${month}`;

/** Distinct values, in first-seen order, quoted and joined for a sentence. */
const quotedList = (values: readonly string[]): string[] => [...new Set(values)].map((v) => `"${v}"`);

export function buildSavePlan(input: SavePlanInput, deps: BuildSavePlanDeps): SheetSavePlan {
  const { projectId, owningBusinessUnitId, changedRows, existingContracts, existingCosts } = input;
  // Rule 4: only a CREATE carries the owning-BU bind; an update must not move the row.
  const buBind = owningBusinessUnitId ? bind("businessunits", owningBusinessUnitId) : null;

  /* ── indexes, each built once ── */
  const doomed = new Set<string>(input.contractDeleteIds);
  const contractById = new Map<string, ExistingContract>();
  for (const c of existingContracts) if (!contractById.has(c.id)) contractById.set(c.id, c);
  // First occurrence wins, matching `costWrites`' cell index (`indexCostsByCell`).
  const costById = new Map<string, ExistingCost>();
  const costsByContract = new Map<string, ExistingCost[]>();
  for (const c of existingCosts) {
    if (!costById.has(c.id)) costById.set(c.id, c);
    const bucket = costsByContract.get(c.contractId);
    if (bucket) bucket.push(c); else costsByContract.set(c.contractId, [c]);
  }

  const issued = new Set<string>();
  /** A repeating `newId` is a programming error, not a sheet conflict: a plain `Error`. */
  const freshId = (identityKey: string): string => {
    const id = deps.newId(identityKey);
    if (issued.has(id) || contractById.has(id) || costById.has(id) || doomed.has(id)) {
      throw new Error(`buildSavePlan: newId("${identityKey}") returned "${id}", but that id is already in use.`);
    }
    issued.add(id);
    return id;
  };

  /* ── phase 1: contracts ── */
  const upserts = contractUpserts(changedRows, existingContracts);
  // `contractIdentityKey` → id: the key the legacy save threads ids by, existing ids included.
  const idByGroup = new Map<string, string>();
  // A NEW contract's id → its identity key, so its cost keys never depend on the issued id.
  const newContractRef = new Map<string, string>();
  const nameById = new Map<string, string>();
  const contracts = new Map<string, PendingContract>(); // insertion order = output order
  let contractsCreated = 0;

  for (const u of upserts) {
    const groupKey = contractIdentityKey(u.subaccountId, u.name);
    if (idByGroup.has(groupKey)) {
      // Error path only, so a scan of the rows is fine here.
      const accounts = quotedList(changedRows
        .filter((r) => r.subAccountId === u.subaccountId && r.description === u.name)
        .map((r) => r.accountName));
      throw new SheetConflictError(
        ADDCOST_SAVE_MSG.conflictSameGroup(u.name, accounts),
        `two contract groups resolve to sub-account "${u.subaccountId}" and name "${u.name}";`,
      );
    }
    const id = u.contractId ?? freshId(groupKey);
    if (u.contractId === null) newContractRef.set(id, groupKey);
    idByGroup.set(groupKey, id);
    if (doomed.has(id)) continue; // deletion wins

    if (contracts.has(id)) {
      const account = changedRows.find((r) => r.projectContractId === id)?.accountName ?? "";
      throw new SheetConflictError(
        ADDCOST_SAVE_MSG.conflictSameContract(quotedList([nameById.get(id) ?? "", u.name]), account),
        `contract ${id} would be upserted twice; a bulk request refuses duplicate keys.`,
      );
    }
    nameById.set(id, u.name);
    if (u.contractId === null) {
      const fields = contractFields(u);
      fields["vsb_Project@odata.bind"] = bind("vsb_projects", projectId);
      fields["vsb_Account@odata.bind"] = bind("vsb_capexaccountlists", u.subaccountId ?? "");
      if (buBind) fields[OWNING_BU_BIND] = buBind;
      contracts.set(id, { id, isNew: true, fields, columns: savedContractColumns(u) });
      contractsCreated += 1;
    } else {
      // An existing contract whose stored columns already equal the upsert gets its total only.
      // Same final state as the legacy save's unconditional update, one fewer column set.
      const existing = contractById.get(id);
      const fields = existing && contractUnchanged(u, existing) ? null : contractFields(u);
      contracts.set(id, { id, isNew: false, fields, columns: fields === null ? null : savedContractColumns(u) });
    }
  }

  /* ── thread the resolved ids onto the rows, exactly as the legacy save does ── */
  const resolvedRows: SheetRow[] = new Array<SheetRow>(changedRows.length);
  for (let i = 0; i < changedRows.length; i += 1) {
    const r = changedRows[i] as SheetRow;
    resolvedRows[i] = r.projectContractId ? r : {
      rowId: r.rowId, accountNumber: r.accountNumber, accountName: r.accountName,
      description: r.description, year: r.year, costPaidBy: r.costPaidBy,
      depreciation: r.depreciation, applyVat: r.applyVat, months: r.months,
      subAccountId: r.subAccountId,
      projectContractId: idByGroup.get(contractIdentityKey(r.subAccountId, r.description)) ?? null,
    };
  }

  /* ── phases 2 and 3: costs ── */
  const writes = costWrites(resolvedRows, existingCosts);
  const costUpserts: UpsertTarget[] = [];
  // Every cell this save leaves holding a value, no-ops included (`SavedSheetChanges.costs`).
  const savedCosts: SavedCost[] = [];
  const costDeletes: string[] = [];
  const seenCells = new Set<string>();
  const seenCostIds = new Set<string>();
  // Per contract, the cell values this save leaves behind (no-ops included, as in the legacy
  // merge) and the cells it empties.
  const overlay = new Map<string, Map<string, number>>();
  const emptied = new Map<string, Set<string>>();
  let costsCreated = 0;
  let costsUpdated = 0;
  let noOpCells = 0;

  const claimCell = (contractId: string, year: number, month: number) => {
    const k = costCellKey(contractId, year, month);
    if (seenCells.has(k)) {
      // Error path only. A bulk request refuses duplicate keys, and the sheet is ambiguous.
      const r = resolvedRows.find((x) => x.projectContractId === contractId && x.year === year);
      throw new SheetConflictError(ADDCOST_SAVE_MSG.conflictSameCell(
        r?.description ?? nameById.get(contractId) ?? contractById.get(contractId)?.name ?? "",
        r?.accountName ?? "", year,
      ), `contract ${contractId} has more than one sheet row writing ${year}-${month};`);
    }
    seenCells.add(k);
  };
  const claimCostId = (costId: string) => {
    if (seenCostIds.has(costId)) {
      // Unreachable through a sheet (one stored row per cell is enforced above); a guard only.
      throw new Error(`buildSavePlan: cost row ${costId} would be written twice in one save.`);
    }
    seenCostIds.add(costId);
  };
  /** A cost-touched contract with no contract upsert of its own still gets its total. */
  const touch = (contractId: string) => {
    if (!contracts.has(contractId)) {
      contracts.set(contractId, { id: contractId, isNew: false, fields: null, columns: null });
    }
  };

  for (const w of writes.upserts) {
    // The legacy save skips a cell with neither a cost row nor a contract to bind to.
    if (w.costId === null && w.contractId === null) continue;
    const contractId = w.contractId as string;
    if (doomed.has(contractId)) continue; // deletion wins
    claimCell(contractId, w.year, w.month);

    let cells = overlay.get(contractId);
    if (!cells) { cells = new Map(); overlay.set(contractId, cells); }
    cells.set(monthKey(w.year, w.month), w.cost);
    touch(contractId);

    if (w.costId !== null) {
      claimCostId(w.costId);
      savedCosts.push({ id: w.costId, contractId, year: w.year, month: w.month, amount: w.cost, isNew: false });
      // No-op skip: the stored value already equals the cell, so nothing is written. This
      // differs from the legacy save in write COUNT only, never in final state.
      if (costById.get(w.costId)?.cost === w.cost) { noOpCells += 1; continue; }
      costUpserts.push({ id: w.costId, isNew: false, fields: Object.freeze({ vsb_cost: w.cost }) });
      costsUpdated += 1;
      continue;
    }

    const fields: Record<string, unknown> = {
      vsb_cost: w.cost,
      vsb_year: w.year,
      vsb_month: w.month,
      "vsb_Contract@odata.bind": bind("vsb_capexprojectcontracts", contractId),
    };
    if (buBind) fields[OWNING_BU_BIND] = buBind;
    const contractRef = newContractRef.get(contractId) ?? contractId;
    const costId = freshId(costIdentityKey(contractRef, w.year, w.month));
    costUpserts.push({ id: costId, isNew: true, fields: Object.freeze(fields) });
    savedCosts.push({ id: costId, contractId, year: w.year, month: w.month, amount: w.cost, isNew: true });
    costsCreated += 1;
  }

  for (const costId of writes.deletes) {
    const c = costById.get(costId) as ExistingCost; // `costWrites` only deletes rows it was given
    if (doomed.has(c.contractId)) continue; // the cascade takes it
    claimCell(c.contractId, c.year, c.month);
    claimCostId(costId);
    let cells = emptied.get(c.contractId);
    if (!cells) { cells = new Set(); emptied.set(c.contractId, cells); }
    cells.add(monthKey(c.year, c.month));
    touch(c.contractId);
    costDeletes.push(costId);
  }

  /*
   * Phase 3b: cost rows a previous failed attempt may have created, for cells this plan no
   * longer writes (blank now, or the row was reverted). Only the orchestrator can tell whether
   * they exist, so they go to `costDeletesIfExist`, never to `costDeletes`. Skipped:
   *  - an id this plan writes (same key, same id: the upsert updates it);
   *  - an id the snapshot holds (the stored-row path above owns it);
   *  - a doomed contract's cell (the cascade takes it);
   *  - a contract this plan cannot place: an existing id outside the snapshot, or a new
   *    contract's identity key no row names any more (the CAVEAT in the module note).
   * Its contract is touched so its total is rewritten without the row.
   */
  const costDeletesIfExist: string[] = [];
  const seenPending = new Set<string>();
  for (const [key, id] of input.pendingIds ?? []) {
    const cell = parseCostIdentityKey(key);
    if (cell === null || issued.has(id) || costById.has(id) || seenPending.has(id)) continue;
    const contractId = cell.contractRef.startsWith(CONTRACT_KEY_PREFIX)
      ? idByGroup.get(cell.contractRef)
      : (contractById.has(cell.contractRef) ? cell.contractRef : undefined);
    if (contractId === undefined || doomed.has(contractId)) continue;
    seenPending.add(id);
    touch(contractId);
    costDeletesIfExist.push(id);
  }

  /*
   * Totals, from the FINAL state: stored values, then this save's cells, minus its deletes.
   * The merge and its precedence are the legacy save's (keyed by year-month within a contract).
   *
   * DIVERGENCE: the legacy save recomputes the total only for contracts named by
   * `contractUpserts`. A contract whose costs change through a row that is not its group's
   * representative (a row whose `projectContractId` differs from the row `contractUpserts`
   * kept) kept a stale total there. Here every touched surviving contract gets one.
   */
  const totals = new Map<string, number>();
  const contractTargets: UpsertTarget[] = [];
  const savedContracts: SavedContract[] = [];
  let contractsUpdated = 0;
  for (const p of contracts.values()) {
    const merged = new Map<string, number>();
    for (const c of costsByContract.get(p.id) ?? []) merged.set(monthKey(c.year, c.month), c.cost ?? 0);
    for (const [k, v] of overlay.get(p.id) ?? []) merged.set(k, v);
    for (const k of emptied.get(p.id) ?? []) merged.delete(k);
    const values: { cost: number }[] = [];
    for (const v of merged.values()) values.push({ cost: v });
    const total = recomputeContractTotal(values);
    // Kept even when no target is sent: the orchestrator's reconcile keys on `totals`.
    totals.set(p.id, total);
    // Also kept without a target: the stored total then already equals `total`.
    savedContracts.push({ id: p.id, isNew: p.isNew, totalCost: total, columns: p.columns });

    // Nothing to write: an existing contract whose columns already match (`fields: null`) and
    // whose STORED total already equals this one. `recomputeContractTotal` has already rounded
    // `total`; the stored value is compared exactly, so a stored 100.4 against a total of 100 is
    // still written (it would change). An unknown stored total (null / undefined) is written.
    if (!p.isNew && p.fields === null && totalUnchanged(contractById.get(p.id), total)) continue;

    const fields = p.fields ?? {};
    fields.vsb_totalcost = total;
    contractTargets.push({ id: p.id, isNew: p.isNew, fields: Object.freeze(fields) });
    if (!p.isNew) contractsUpdated += 1;
  }

  const contractDeletes = Object.freeze(Array.from(doomed));
  return {
    contractUpserts: Object.freeze(contractTargets),
    costUpserts: Object.freeze(costUpserts),
    costDeletes: Object.freeze(costDeletes),
    costDeletesIfExist: Object.freeze(costDeletesIfExist),
    contractDeletes,
    totals,
    stats: Object.freeze({
      contractsCreated,
      contractsUpdated,
      costsCreated,
      costsUpdated,
      costsDeleted: costDeletes.length,
      contractsDeleted: contractDeletes.length,
      noOpCells,
    }),
    applied: Object.freeze({
      contracts: Object.freeze(savedContracts),
      costs: Object.freeze(savedCosts),
      deletedContractIds: contractDeletes,
      deletedCostIds: Object.freeze([...costDeletes, ...costDeletesIfExist]),
    }),
  };
}
