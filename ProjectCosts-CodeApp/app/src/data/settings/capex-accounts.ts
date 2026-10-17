/**
 * CAPEX Accounts (Application Settings) — every Dataverse read and write of the screen.
 *
 * Implements `codeapp-knowledge-base/screens/application-settings/capex-accounts/04-data/
 * 02-operations-performed.md` and DR-1..DR-9 of `06-code-app-requirements/01-build-requirements.md`.
 * The canvas rendered from App-start collections that other screens overwrote (D-STATE-1) and
 * filtered cost rows client-side against a truncated cache (D-STAT-3); everything here is a
 * server-side filter read to the last page.
 *
 * Writes go through `unwrap` (generated `create`/`update`), `deleteRecord` (never the generated
 * `delete`, which discards failures) and `updateMultiple` (bulk, chunked). Every single-row
 * `update` is the shared `updateRecordIfExists` (existence check, then PATCH; V-1); since SDK
 * 1.5.0 the PATCH itself also carries `If-Match: *`, so it can no longer upsert a deleted row.
 */
import { Vsb_capexaccountlistsService } from "@/generated/services/Vsb_capexaccountlistsService";
import { Vsb_capexprojectcontractsService } from "@/generated/services/Vsb_capexprojectcontractsService";
import { Vsb_capexcostsService } from "@/generated/services/Vsb_capexcostsService";
import type { Vsb_capexaccountlists } from "@/generated/models/Vsb_capexaccountlistsModel";
import { RecordGoneError, unwrap } from "@/platform/errors";
import { deleteRecord, fetchAll, fetchPage, updateRecordIfExists } from "../client";
import { and, chunk, eq, gt, isNull, lookupEq, lookupIn, or } from "../odata";
import { updateMultiple } from "../bulkWrite";
import { DELETE_CONCURRENCY, WRITE_CONCURRENCY, forEachLimit } from "../concurrency";
import { nextOrder } from "@/domain/reorder";

export const ACCOUNTS_TABLE = "vsb_capexaccountlists";
const ACCOUNT_TYPE = "vsb_capexaccountlist";
const COSTS_TABLE = "vsb_capexcosts";
const COST_TYPE = "vsb_capexcost";

/** One `vsb_capexaccountlists` row, any level, any status. */
export interface CapexAccountRow {
  id: string;
  number: string;
  name: string;
  order: number | null;
  active: boolean;
  parentId: string | null;
}

const STATE_INACTIVE = { statecode: 1, statuscode: 2 } as const;
const STATE_ACTIVE = { statecode: 0, statuscode: 1 } as const;

const bindAccount = (id: string) => `/${ACCOUNTS_TABLE}(${id})`;

/* ════════════════════════════════════════════════════════════════════ reads ══ */

/**
 * NG-3 (parity r2): `vsb_number` is kept exactly as stored — NOT trimmed. The canvas compares and
 * composes the raw value (`Number = "00001"`, App:1567-1580; `locSelectedAccount.Number & "_" & …`,
 * CA:1980); it trims only what the user types (CA:1436, CA:1980 suffix).
 */
function toRow(r: Vsb_capexaccountlists): CapexAccountRow {
  return {
    id: r.vsb_capexaccountlistid,
    number: r.vsb_number ?? "",
    name: r.vsb_name ?? "",
    order: typeof r.vsb_order === "number" ? r.vsb_order : null,
    active: Number(r.statecode) === 0,
    parentId: r._vsb_parentaccount_value ?? null,
  };
}

/**
 * DR-1: the whole table (it is small), every page, NO `statecode` filter — the admin screen
 * shows inactive rows, unlike `costBook.loadCostAccounts`.
 */
export async function loadCapexAccountRows(): Promise<CapexAccountRow[]> {
  const rows = await fetchAll(
    "list CAPEX account tree (admin)",
    (o) => Vsb_capexaccountlistsService.getAll(o),
    {
      select: [
        "vsb_capexaccountlistid", "vsb_number", "vsb_name", "vsb_order", "statecode",
        "_vsb_parentaccount_value",
      ],
    },
  );
  return rows.map(toRow);
}

/** DR-2: any row, any status, any level, with exactly this number. */
export async function numberExists(number: string): Promise<boolean> {
  const rows = await fetchPage(
    "check CAPEX account number",
    (o) => Vsb_capexaccountlistsService.getAll(o),
    { select: ["vsb_capexaccountlistid"], filter: eq("vsb_number", number), maxPageSize: 1 },
  );
  return rows.length > 0;
}

/** DR-8 guard: does the row have any child, any status? */
export async function hasChildren(accountId: string): Promise<boolean> {
  const rows = await fetchPage(
    "check CAPEX account children",
    (o) => Vsb_capexaccountlistsService.getAll(o),
    { select: ["vsb_capexaccountlistid"], filter: lookupEq("vsb_parentaccount", accountId), maxPageSize: 1 },
  );
  return rows.length > 0;
}

/**
 * DR-8 / FR-9 guard: is any CAPEX project contract (any status) booked on this (sub)account?
 * The lookup cascades on delete, so a "yes" here is what stops a delete taking contracts and
 * their cost rows with it (D-DEL-1, D-DEL-2).
 */
export async function hasContracts(accountId: string): Promise<boolean> {
  const rows = await fetchPage(
    "check CAPEX contracts on account",
    (o) => Vsb_capexprojectcontractsService.getAll(o),
    { select: ["vsb_capexprojectcontractid"], filter: lookupEq("vsb_account", accountId), maxPageSize: 1 },
  );
  return rows.length > 0;
}

/**
 * G9 / B9: every child id (any status) of an account, read live — server-filtered on the parent
 * lookup and paged to the last page — so a subaccount added since the tree was loaded is included.
 */
export async function listChildIds(accountId: string): Promise<string[]> {
  const rows = await fetchAll(
    "list CAPEX subaccounts to deactivate",
    (o) => Vsb_capexaccountlistsService.getAll(o),
    { select: ["vsb_capexaccountlistid"], filter: lookupEq("vsb_parentaccount", accountId) },
  );
  return rows.map((r) => r.vsb_capexaccountlistid);
}

/**
 * DR-3: live top `vsb_order` of a parent's children (fixes D-NEW-2's stale cache), as stored —
 * `null` when there are no children or the top order is blank. The canvas floor
 * (`Max(…, 0) + 1`) is applied by `nextOrder` (PC-1).
 */
export async function maxChildOrder(parentId: string): Promise<number | null> {
  const rows = await fetchPage(
    "read CAPEX sibling order",
    (o) => Vsb_capexaccountlistsService.getAll(o),
    {
      select: ["vsb_order"],
      filter: lookupEq("vsb_parentaccount", parentId),
      orderBy: ["vsb_order desc"],
      maxPageSize: 1,
    },
  );
  const top = rows[0]?.vsb_order;
  return typeof top === "number" ? top : null;
}

/**
 * V-1 (parity r2) — PATCH by id, refused (nothing sent) when the row is gone — never an upsert.
 *
 * Reusable-components E16: the shared `updateRecordIfExists` (`../client`). It reads the row by
 * primary key (one row, key only) immediately before the PATCH and throws `RecordGoneError` with
 * nothing sent when it is gone; the PATCH goes through the same SDK `updateRecordAsync`, which since
 * SDK 1.5.0 always sends `If-Match: *`, so a delete between the two calls fails with 404 (mapped to
 * `RecordGoneError`) instead of upserting. Same requests and same error class as the local copy it
 * replaced. The canvas `UpdateIf` matched nothing and changed nothing; this restores that.
 */
async function updateExisting(id: string, fields: Record<string, unknown>, operation: string): Promise<void> {
  await updateRecordIfExists(operation, ACCOUNTS_TABLE, id, fields);
}

/* ═══════════════════════════════════════════════════════════════════ errors ══ */

/**
 * V-1: the row the user acted on no longer exists (deleted by someone else since the screen
 * loaded). Nothing was written. The screen shows its "no longer exists" (`GONE`) text. This is the
 * app-wide `RecordGoneError` (`@/platform/errors`, a `DataError` with status 404), re-exported.
 */
export { RecordGoneError };

/** The number is taken — the panel stays open and shows the inline message. */
export class DuplicateNumberError extends Error {
  readonly number: string;
  constructor(number: string) {
    super(`CAPEX account number ${number} already exists`);
    this.name = "DuplicateNumberError";
    this.number = number;
  }
}

/** A delete guard refused at confirm time (AC-9.1, AC-10.2). `message` is user-facing. */
export class DeleteBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeleteBlockedError";
  }
}

/**
 * A multi-step operation stopped part-way (AC-12.3, D-ERR-1). `completed` lists the steps that
 * DID land, in user-facing words, so the message can say so honestly.
 */
export class PartialStepError extends Error {
  override readonly cause: unknown;
  readonly failedStep: string;
  readonly completed: string[];
  /**
   * What landed INSIDE the failed step, in user-facing words (gap G5), e.g.
   * "1 of 3 subaccounts were set to Inactive". Undefined when nothing in the step landed or the
   * step is a single write.
   */
  readonly detail: string | undefined;
  constructor(failedStep: string, completed: string[], cause: unknown, detail?: string) {
    super(`${failedStep} failed`);
    this.name = "PartialStepError";
    this.failedStep = failedStep;
    this.completed = completed;
    this.cause = cause;
    this.detail = detail;
  }
}

/* ═══════════════════════════════════════════════════════════════ create/edit ══ */

export interface CreateInput {
  parentId: string;
  /**
   * Full number exactly as it is to be stored — the caller applies the canvas trims (account:
   * `Trim(number)`, CA:1436; subaccount: `<parent number as stored>_<Trim(suffix)>`, CA:1980).
   * Not trimmed again here (NG-3): a legacy parent number with spaces composes as the canvas did.
   */
  number: string;
  name: string;
}

export interface CreateResult {
  id: string;
  /**
   * Set when the create landed but the follow-up "make it Inactive" PATCH failed (AC-13.2) —
   * the row exists and is still ACTIVE. Exception (R3-2): a `RecordGoneError` means the new row
   * was deleted before the PATCH, so it no longer exists at all.
   */
  inactiveError?: unknown;
}

/**
 * New account or subaccount (DR-2, DR-3, FR-13): uniqueness check at save time, live
 * `max + 1` order, POST, then PATCH Inactive (two writes, as the canvas — D-NEW-1 kept).
 */
export async function createCapexAccount(input: CreateInput): Promise<CreateResult> {
  const number = input.number;
  if (await numberExists(number)) throw new DuplicateNumberError(number);
  const order = nextOrder([await maxChildOrder(input.parentId)]);

  const created = unwrap(
    await Vsb_capexaccountlistsService.create({
      vsb_name: input.name.trim(),
      vsb_number: number,
      vsb_order: order,
      "vsb_ParentAccount@odata.bind": bindAccount(input.parentId),
    } as never),
    "create CAPEX account",
  );
  const id = created.vsb_capexaccountlistid;

  try {
    await updateExisting(id, STATE_INACTIVE, "set new CAPEX account inactive");
  } catch (inactiveError) {
    return { id, inactiveError };
  }
  return { id };
}

/**
 * DR-4: rename only — Number and Category are never sent (AC-6.3, AC-7.3). A row deleted since the
 * tree loaded is refused with `RecordGoneError`, never recreated (V-1).
 */
export async function renameCapexAccount(id: string, name: string): Promise<void> {
  await updateExisting(id, { vsb_name: name.trim() }, "rename CAPEX account");
}

/* ═══════════════════════════════════════════════════════════════════ reorder ══ */

/**
 * DR-6: one bulk call with only the changed rows (`BulkWriteError.partial` surfaces upward).
 * V-1: `UpdateMultiple` is the SDK `Update` message sent as a bound action (POST via the
 * `customapi` path), not a Web API PATCH, so it has no upsert semantics — a deleted id fails the
 * chunk (E11) instead of recreating the row. `UpsertMultiple` is the create-or-update message.
 */
export async function saveCapexOrder(changes: readonly { id: string; order: number }[]): Promise<void> {
  await updateMultiple(
    ACCOUNTS_TABLE, ACCOUNT_TYPE,
    changes.map((c) => ({ vsb_capexaccountlistid: c.id, vsb_order: c.order })),
  );
}

/* ═══════════════════════════════════════════════════════════════════ deletes ══ */

export const DELETE_BLOCKED = {
  subaccountHasContracts:
    "This subaccount cannot be deleted because CAPEX contracts are booked on it. Deactivate it instead.",
  accountHasChildren:
    "This account cannot be deleted because it has subaccounts.",
  accountHasContracts:
    "This account cannot be deleted because CAPEX contracts are booked on it. Deactivate it instead.",
} as const;

/** FR-9 / DR-8: re-check contracts server-side immediately before the DELETE (AC-9.1). */
export async function deleteCapexSubaccount(id: string): Promise<void> {
  if (await hasContracts(id)) throw new DeleteBlockedError(DELETE_BLOCKED.subaccountHasContracts);
  await deleteRecord("delete CAPEX subaccount", ACCOUNTS_TABLE, id);
}

/** FR-10 / DR-8: no children (any status) AND no contracts on the account itself (D-DEL-1). */
export async function deleteCapexAccount(id: string): Promise<void> {
  if (await hasChildren(id)) throw new DeleteBlockedError(DELETE_BLOCKED.accountHasChildren);
  if (await hasContracts(id)) throw new DeleteBlockedError(DELETE_BLOCKED.accountHasContracts);
  await deleteRecord("delete CAPEX account", ACCOUNTS_TABLE, id);
}

/* ═════════════════════════════════════════════════════ forecast cost clean-up ══ */

/**
 * D-STAT-7 paid-row exclusion, in ONE place so a "canvas parity" ruling can drop it here.
 * Null-safe (gap G1 / B4): Dataverse's `ne true` does not match a null `vsb_costpaid` (SQL `<>`),
 * so rows created before the column existed would silently escape the clean-up. Only rows
 * explicitly marked paid are spared.
 */
export const PAID_EXCLUSION = or(eq("vsb_costpaid", false), isNull("vsb_costpaid"));

/**
 * DR-7 step 2 filter: current year, months after the current one. Paid rows are skipped
 * (D-STAT-7 — the non-destructive default; canvas had no exception).
 */
export function zeroCostsFilter(contractIds: readonly string[], year: number, month: number): string | undefined {
  return and(lookupIn("vsb_contract", contractIds), eq("vsb_year", year), gt("vsb_month", month), PAID_EXCLUSION);
}

/** DR-7 step 3 filter: every later year. Paid rows skipped (D-STAT-7). */
export function deleteCostsFilter(contractIds: readonly string[], year: number): string | undefined {
  return and(lookupIn("vsb_contract", contractIds), gt("vsb_year", year), PAID_EXCLUSION);
}

/**
 * `forEachLimit` that counts what landed, so a failure can say how much of the step was done
 * (AC-12.3, gap G5). Tasks in flight when a sibling fails are allowed to finish (see
 * `concurrency.ts`), so the count is final once the pool settles.
 */
async function countedForEach<T>(
  items: readonly T[], fn: (item: T) => Promise<unknown>, limit: number,
  onFailure: (done: number, total: number, cause: unknown) => Error,
): Promise<void> {
  let done = 0;
  try {
    await forEachLimit(items, async (item) => { await fn(item); done += 1; }, limit);
  } catch (cause) {
    throw onFailure(done, items.length, cause);
  }
}

const rowsText = (n: number) => `${n} ${n === 1 ? "row" : "rows"}`;

export interface CleanupResult { contracts: number; zeroed: number; deleted: number }

/**
 * DR-7: for every contract (any status) on any of `accountIds`, zero current-year future months
 * and delete later years. Server-side filters, chunked, read to the last page — ALL matching
 * rows, not the first N the canvas happened to scan (D-STAT-3).
 */
export async function cleanUpForecastCosts(
  accountIds: readonly string[], year: number, month: number,
): Promise<CleanupResult> {
  const contractIds: string[] = [];
  for (const ids of chunk(accountIds)) {
    const rows = await fetchAll(
      "list CAPEX contracts for deactivated accounts",
      (o) => Vsb_capexprojectcontractsService.getAll(o),
      { select: ["vsb_capexprojectcontractid"], filter: lookupIn("vsb_account", ids) },
    );
    contractIds.push(...rows.map((r) => r.vsb_capexprojectcontractid));
  }
  if (contractIds.length === 0) return { contracts: 0, zeroed: 0, deleted: 0 };

  const toZero: string[] = [];
  const toDelete: string[] = [];
  for (const ids of chunk(contractIds)) {
    const zero = await fetchAll(
      "list current-year forecast CAPEX costs",
      (o) => Vsb_capexcostsService.getAll(o),
      { select: ["vsb_capexcostid"], filter: zeroCostsFilter(ids, year, month) },
    );
    toZero.push(...zero.map((r) => r.vsb_capexcostid));
    const later = await fetchAll(
      "list future-year forecast CAPEX costs",
      (o) => Vsb_capexcostsService.getAll(o),
      { select: ["vsb_capexcostid"], filter: deleteCostsFilter(ids, year) },
    );
    toDelete.push(...later.map((r) => r.vsb_capexcostid));
  }

  // Two labelled sub-steps, so "zeroed but a delete failed" is reported as such (AC-12.3, G5).
  const zeroLabel = `Future-month costs set to 0 (${rowsText(toZero.length)})`;
  const deleteLabel = `Later-year costs deleted (${rowsText(toDelete.length)})`;
  try {
    await updateMultiple(COSTS_TABLE, COST_TYPE, toZero.map((id) => ({ vsb_capexcostid: id, vsb_cost: 0 })));
  } catch (cause) {
    throw new PartialStepError(zeroLabel, [], cause);
  }
  await countedForEach(
    toDelete, (id) => deleteRecord("delete future CAPEX cost", COSTS_TABLE, id), DELETE_CONCURRENCY,
    (done, total, cause) => new PartialStepError(
      deleteLabel, [zeroLabel], cause, `${done} of ${total} later-year cost rows were deleted`,
    ),
  );
  return { contracts: contractIds.length, zeroed: toZero.length, deleted: toDelete.length };
}

/* ═══════════════════════════════════════════════════════════════════ status ══ */

/** Status PATCH of the row the user acted on; `RecordGoneError` when it was deleted (V-1). */
async function setState(id: string, active: boolean, operation: string): Promise<void> {
  await updateExisting(id, active ? STATE_ACTIVE : STATE_INACTIVE, operation);
}

/**
 * Cascade PATCH of a subaccount: a child deleted between the live child read and its PATCH is
 * SKIPPED (the canvas `UpdateIf` matched nothing), never recreated and never a failure (V-1).
 */
async function deactivateChildIfPresent(id: string): Promise<void> {
  try {
    await setState(id, false, "deactivate CAPEX subaccount");
  } catch (error) {
    if (!(error instanceof RecordGoneError)) throw error;
  }
}

/**
 * Runs labelled steps in order; a failure reports which steps already landed (AC-12.3). A step
 * that itself throws a `PartialStepError` (sub-steps, counted cascades) is merged: its failed
 * sub-step, completed sub-steps and in-step detail are kept (gap G5).
 */
async function runSteps(steps: readonly [label: string, run: () => Promise<unknown>][]): Promise<void> {
  const done: string[] = [];
  for (const [label, run] of steps) {
    try {
      await run();
    } catch (error) {
      // V-1: the target vanished before anything was written — surface it as such, unwrapped.
      if (error instanceof RecordGoneError && done.length === 0) throw error;
      if (error instanceof PartialStepError) {
        throw new PartialStepError(error.failedStep, [...done, ...error.completed], error.cause, error.detail);
      }
      throw new PartialStepError(label, done, error);
    }
    done.push(label);
  }
}

export interface DeactivateAccountInput {
  accountId: string;
  year: number;
  month: number;
}

/**
 * FR-12 deactivate (DR-5, DR-7): account Inactive → subaccounts Inactive (D-STAT-1: the dialog's
 * promise, not the canvas typo that set them Active) → cost clean-up for contracts on the
 * subaccounts AND on the account itself (D-STAT-5).
 *
 * G9: the subaccount list is read live from Dataverse at confirm time (`listChildIds`), not taken
 * from the screen's cached tree, so a subaccount another admin added since the last load is
 * deactivated and cleaned too. The read happens before any write, so a failed read changes nothing.
 */
export async function deactivateCapexAccount(input: DeactivateAccountInput): Promise<void> {
  const subaccountIds = await listChildIds(input.accountId);
  await runSteps([
    ["Account set to Inactive", () => setState(input.accountId, false, "deactivate CAPEX account")],
    ["Subaccounts set to Inactive", () => countedForEach(
      subaccountIds,
      deactivateChildIfPresent,
      WRITE_CONCURRENCY,
      (done, total, cause) => new PartialStepError(
        "Subaccounts set to Inactive", [], cause, `${done} of ${total} subaccounts were set to Inactive`,
      ),
    )],
    ["Forecast costs cleaned up", () => cleanUpForecastCosts(
      [input.accountId, ...subaccountIds], input.year, input.month,
    )],
  ]);
}

/** FR-12 activate: the account only; subaccounts unchanged (D-STAT-6), costs not restored. */
export async function activateCapexAccount(accountId: string): Promise<void> {
  await setState(accountId, true, "activate CAPEX account");
}

/** FR-11 deactivate: subaccount Inactive, then DR-7 for its contracts. */
export async function deactivateCapexSubaccount(id: string, year: number, month: number): Promise<void> {
  await runSteps([
    ["Subaccount set to Inactive", () => setState(id, false, "deactivate CAPEX subaccount")],
    ["Forecast costs cleaned up", () => cleanUpForecastCosts([id], year, month)],
  ]);
}

/** FR-11 activate: status only. */
export async function activateCapexSubaccount(id: string): Promise<void> {
  await setState(id, true, "activate CAPEX subaccount");
}
