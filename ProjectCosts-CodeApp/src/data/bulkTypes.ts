/**
 * Shared shapes for the Dataverse bulk-message save path (`UpsertMultiple`).
 *
 * The planner (`features/cost/add-costs-from-table/savePlan.ts`) produces these, the bulk
 * executor (`./bulkWrites.ts`) sends them, and the save orchestrator
 * (`./addCostSheetBulk.ts`) sequences them. They live here so none of the three owns a
 * definition the others copy (CONVENTIONS rule 17).
 */
import type { IOperationResult } from "@microsoft/power-apps/data";

/**
 * One row for an `UpsertMultiple` call.
 *
 * `id` is always set: a new row gets a client-generated GUID from the planner, so a cost row
 * can bind to a brand-new contract in the same plan without waiting for a create round trip.
 * `fields` never carries the primary key, `@odata.type` or `@odata.id`; the executor adds
 * those, in one place, from `BulkTableInfo`.
 */
export interface UpsertTarget {
  id: string;
  /** True when the planner believes the row does not exist yet (drives the owning-BU bind). */
  isNew: boolean;
  fields: Readonly<Record<string, unknown>>;
}

/**
 * The local collection a sheet Save is reduced to, in execution order.
 *
 * Phase 1 `contractUpserts` → phase 2 `costUpserts` → phase 3 `costDeletes` → phase 4
 * `contractDeletes`. Contracts go first because a cost row binds to its contract. Phase 3 holds
 * ONLY cost rows whose contract survives: a deleted contract's cost rows and comments go by the
 * Dataverse cascade (contract → cost and contract → comment are both Cascade).
 */
export interface SaveBuildPlan {
  contractUpserts: readonly UpsertTarget[];
  costUpserts: readonly UpsertTarget[];
  costDeletes: readonly string[];
  /**
   * Cost ids a PREVIOUS failed attempt may have created for cells that are blank now. The sheet
   * snapshot has no row for them, so they are deleted only if the pre-write check finds them.
   */
  costDeletesIfExist: readonly string[];
  contractDeletes: readonly string[];
  /**
   * Contract id → the `vsb_totalcost` phase 1 writes. It is computed from the FINAL state:
   * existing costs, then this save's upserts, minus this save's deletes. It is kept here so a
   * failed later phase can be reconciled against what actually landed.
   */
  totals: ReadonlyMap<string, number>;
  stats: Readonly<{
    contractsCreated: number;
    contractsUpdated: number;
    costsCreated: number;
    costsUpdated: number;
    costsDeleted: number;
    contractsDeleted: number;
    /** Changed cells whose value equals the stored one, so nothing was written for them. */
    noOpCells: number;
  }>;
}

/**
 * The columns a sheet Save wrote on one contract, in DOMAIN terms (the `CostLine` vocabulary of
 * `features/cost/costing/model.ts`), never as a Dataverse field bag. D51 §11.19.
 *
 * Exactly the columns `contractFields` writes that the DEVEX/CAPEX book reads back; the account
 * (`subaccountId`) is bound only on a CREATE, so it means something only when `isNew`.
 * `name` is `vsb_name`; the book's `description` is `vsb_description ?? vsb_name`, and the sheet
 * never writes `vsb_description`, so `name` is the book's description only for a NEW contract.
 */
export interface SavedContractColumns {
  subaccountId: string | null;
  name: string;
  payer: "DevCo" | "SPV";
  depreciation: boolean;
  vat: boolean;
  distribution: "equal" | "individual";
  distributionScheme: "percent" | "absolute";
}

/** One contract a successful Save left in Dataverse (created, changed, or its total rewritten). */
export interface SavedContract {
  id: string;
  /** Planned as a create: the sheet had no contract for it. */
  isNew: boolean;
  /** The contract's `vsb_totalcost` after the save (already rounded, `recomputeContractTotal`). */
  totalCost: number;
  /**
   * The columns written. `null` when this save wrote at most the total (the stored columns already
   * matched, or the contract was only touched through its cells).
   */
  columns: SavedContractColumns | null;
}

/** One month cell a successful Save left in Dataverse (`vsb_capexcosts`). */
export interface SavedCost {
  id: string;
  contractId: string;
  year: number;
  /** 1-12. */
  month: number;
  amount: number;
  /** Created by this save. A create writes no `vsb_costpaid`, so the row is not paid. */
  isNew: boolean;
}

/**
 * What a successful sheet Save applied, in domain terms — the input of the DEVEX/CAPEX book's
 * optimistic patch (`applySavedSheetToBook`). Deletes are listed whether or not they were
 * deferred; a deferred one is ALSO in `SaveAddCostSheetResult.deferred*Ids`.
 *
 * `costs` includes no-op cells (value equal to the stored one): writing their value back into the
 * book changes nothing, and leaving them out would make the description depend on the snapshot.
 */
export interface SavedSheetChanges {
  contracts: readonly SavedContract[];
  costs: readonly SavedCost[];
  /** The removed contracts; their cost rows go with them (cascade). */
  deletedContractIds: readonly string[];
  /** Cleared cells of surviving contracts (`costDeletes` and `costDeletesIfExist`). */
  deletedCostIds: readonly string[];
}

/** `buildSavePlan`'s result: the plan the orchestrator sends, plus what it means in domain terms. */
export interface SheetSavePlan extends SaveBuildPlan {
  applied: SavedSheetChanges;
}

/** What the executor needs to address one table. */
export interface BulkTableInfo {
  /** e.g. `vsb_capexcosts`. */
  entitySetName: string;
  /** e.g. `vsb_capexcost`; used for `@odata.type`. */
  logicalName: string;
  /** e.g. `vsb_capexcostid`. */
  primaryKey: string;
}

/**
 * Sends ONE `UpsertMultiple` request for one table. The real implementation adapts the
 * generated `UpsertMultiple` service; tests inject a fake.
 */
export type BulkUpsertTransport = (
  entitySetName: string,
  targets: readonly Record<string, unknown>[],
) => Promise<IOperationResult<unknown>>;

/**
 * Which of `ids` still exist in `table` (a server read, `$select` primary key only). Used before
 * any write so an upsert never re-creates a row another user deleted.
 */
export type ExistingIdsReader = (table: BulkTableInfo, ids: readonly string[]) => Promise<ReadonlySet<string>>;

/** Deletes one record and throws on refusal (the `deleteRecord` contract, CONVENTIONS rule 14). */
export type RecordDeleter = (tableName: string, recordId: string) => Promise<void>;
