/**
 * Contracts standard assumptions (canvas `Admin Contract Screen`) — every Dataverse read and
 * write of `/settings/contracts`. No component calls a service directly.
 *
 * Tables (abbreviations used in this module):
 *   SA   `vsb_bopcontractsstandardassumptionses`            generated service
 *   SADC `vsb_bopcontractsstandardassumptiondevcocostses`   generated service
 *   CTY  `vsb_countries`                                    generated service
 *   CAL  `vsb_capexaccountlists` — read through `listCapexAccounts()` (`@/data/contracts`)
 *
 * `devCoRepository` reads and creates SADC rows through its generated service and unlinks with
 * `deleteRecord` (the generated `delete` discards its result). It still reports "unavailable"
 * (a typed error, never a crash) when the table is not registered in
 * `.power/schemas/appschemas/dataSourcesInfo.ts`. Do NOT confuse SADC with the per-project
 * `Vsb_bopcontractsdevcocostses` table.
 *
 * Countries are read through the shared `@/data/countries` (`useActiveCountries`);
 * query keys live in `qk.adminContract*` (`@/data/keys`).
 *
 * Every list read pages to completion (`fetchAll`) — the canvas stopped at 2,000 rows —
 * and no SA/SADC read is issued without a country/technology filter.
 */
import { dataSourcesInfo } from "../../.power/schemas/appschemas/dataSourcesInfo";
import { Vsb_bopcontractsstandardassumptionsesService } from "@/generated/services/Vsb_bopcontractsstandardassumptionsesService";
import { Vsb_bopcontractsstandardassumptiondevcocostsesService } from "@/generated/services/Vsb_bopcontractsstandardassumptiondevcocostsesService";
import type { Vsb_bopcontractsstandardassumptionses } from "@/generated/models/Vsb_bopcontractsstandardassumptionsesModel";
import type { Vsb_bopcontractsstandardassumptiondevcocostses } from "@/generated/models/Vsb_bopcontractsstandardassumptiondevcocostsesModel";
import { DataError, unwrap } from "@/platform/errors";
import { trace } from "@/platform/telemetry";
import { deleteRecord, fetchAll, guardedCall, guardedResult, updateRecordIfExists } from "@/data/client";
import { DELETE_CONCURRENCY, WRITE_CONCURRENCY, forEachLimit, mapLimit } from "@/data/concurrency";
import { and, eq, guid, lookupEq } from "@/data/odata";
import {
  buildParentPayload, findOwnershipConflicts, planDevCoDiff,
  type ContractForm, type DevCoRow, type StandardContract,
} from "@/domain/contractStandards";

/* ═══════════════════════════════════════════════════════════════════ names ══ */

export const ENTITY = {
  contracts: "vsb_bopcontractsstandardassumptionses",
  devCo: "vsb_bopcontractsstandardassumptiondevcocostses",
  countries: "vsb_countries",
  capexAccounts: "vsb_capexaccountlists",
} as const;

/* ═════════════════════════════════════════════════════════════════ errors ══ */

/** The SADC table is not registered in this app (missing from `dataSourcesInfo`). */
export class DevCoTableUnavailableError extends DataError {
  constructor(operation: string) {
    super(
      operation,
      `The table "${ENTITY.devCo}" is not registered in this app. ` +
      "Run `pac code add-data-source -a dataverse -t vsb_bopcontractsstandardassumptiondevcocosts`.",
    );
    this.name = "DevCoTableUnavailableError";
  }
}

/** A newly selected account is already linked to another standard contract. */
export class OwnershipConflictError extends Error {
  readonly accountIds: string[];
  constructor(accountIds: string[]) {
    super(`Account(s) ${accountIds.join(", ")} already linked to another standard contract`);
    this.name = "OwnershipConflictError";
    this.accountIds = accountIds;
  }
}

/** Which ordered phase of the contract save failed. */
export type SavePhase = "check" | "parent" | "removals" | "additions";

/**
 * The typed partial-failure result of `saveStandardContract`. `contractId` is set once the
 * parent exists, so the UI keeps the panel open and a retry UPDATES that row (never creates a
 * second one) and re-sends only what is still outstanding.
 */
export class ContractSaveError extends Error {
  readonly phase: SavePhase;
  readonly contractId?: string;
  override readonly cause: unknown;
  constructor(phase: SavePhase, contractId: string | undefined, cause: unknown) {
    super(`Saving the standard contract failed in phase "${phase}"`);
    this.name = "ContractSaveError";
    this.phase = phase;
    this.contractId = contractId;
    this.cause = cause;
  }
  /** True when the parent row was written before the failure. */
  get parentSaved(): boolean {
    return this.phase === "removals" || this.phase === "additions";
  }
}

/* ═══════════════════════════════════════════════════════════ mapping ══ */

function numberOf(value: unknown): number | undefined {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

const CLOSING_REF_FORMATTED = "vsb_closingdatereference@OData.Community.Display.V1.FormattedValue";

type ContractRow = Vsb_bopcontractsstandardassumptionses & { [CLOSING_REF_FORMATTED]?: string };

function toContract(row: ContractRow): StandardContract {
  return {
    id: row.vsb_bopcontractsstandardassumptionsid,
    name: row.vsb_name ?? "",
    description: row.vsb_description ?? "",
    countryId: row._vsb_country_value,
    technology: numberOf(row.vsb_technology),
    contractType: numberOf(row.vsb_contracttypes),
    closingRef: numberOf(row.vsb_closingdatereference),
    // the choice's own label, so an option this app does not know renders as the canvas does.
    closingRefText: row[CLOSING_REF_FORMATTED] ?? row.vsb_closingdatereferencename ?? undefined,
    monthDifference: numberOf(row.vsb_monthdifference),
    margin: row.vsb_margin === true,
    marginType: numberOf(row.vsb_margintype),
    marginPercentage: numberOf(row.vsb_marginpercentage),
    marginFixedValue: numberOf(row.vsb_marginfixedvalue),
    comment: row.vsb_comment ?? undefined,
    stateCode: numberOf(row.statecode),
  };
}

/* ═════════════════════════════════════════════════════════════ reads ══ */

export const CONTRACT_SELECT = [
  "vsb_bopcontractsstandardassumptionsid", "vsb_name", "vsb_description", "_vsb_country_value",
  "vsb_technology", "vsb_contracttypes", "vsb_closingdatereference", "vsb_monthdifference",
  "vsb_margin", "vsb_margintype", "vsb_marginpercentage", "vsb_marginfixedvalue", "vsb_comment",
  "statecode",
];

/**
 * No `statecode` filter: inactive standard contracts are listed and count toward the
 * limit, as in the canvas (an open product decision).
 */
export function contractFilter(countryId: string, technology: number): string | undefined {
  return and(lookupEq("vsb_country", countryId), eq("vsb_technology", technology));
}

export async function listStandardContracts(countryId: string, technology: number): Promise<StandardContract[]> {
  const rows = await fetchAll(
    "list BoP standard contracts",
    (o) => Vsb_bopcontractsstandardassumptionsesService.getAll(o),
    {
      select: CONTRACT_SELECT,
      filter: contractFilter(countryId, technology),
      orderBy: ["vsb_contracttypes asc", "vsb_name asc"],
    },
  );
  return rows.map(toContract);
}

/** The panel opens on a fresh copy of the row (`Refresh` in the canvas, ACS:1057). */
export async function getStandardContract(id: string): Promise<StandardContract> {
  const row = unwrap(
    await Vsb_bopcontractsstandardassumptionsesService.get(guid(id), { select: CONTRACT_SELECT }),
    "read BoP standard contract",
  );
  return toContract(row);
}

/* ════════════════════════════════════════════════════ DevCo repository ══ */

export const DEVCO_SELECT = [
  "vsb_bopcontractsstandardassumptiondevcocostsid",
  "_vsb_bopcontractstandardassumption_value",
  "_vsb_capexaccount_value",
  "_vsb_rootcapexaccount_value",
];

/**
 * Children filtered THROUGH the parent contract lookup (the navigation property is
 * exact, the denormalised `crc36_*` copies may be null on older rows).
 */
export function devCoFilter(countryId: string, technology: number): string | undefined {
  return and(
    `vsb_BoPContractStandardAssumption/_vsb_country_value eq ${guid(countryId)}`,
    eq("vsb_BoPContractStandardAssumption/vsb_technology", technology),
  );
}

/**
 * A SADC row: the generated model plus the formatted-value annotations Dataverse adds to lookups.
 * `_vsb_rootcapexaccount_value` is plugin-filled (`DevCoCostRootCapexPlugin`): read only, never
 * written by this app.
 */
type DevCoRecord = Vsb_bopcontractsstandardassumptiondevcocostses & {
  "_vsb_capexaccount_value@OData.Community.Display.V1.FormattedValue"?: string;
  "_vsb_rootcapexaccount_value@OData.Community.Display.V1.FormattedValue"?: string;
};

type DevCoServiceCreate = Parameters<typeof Vsb_bopcontractsstandardassumptiondevcocostsesService.create>[0];

/** The create shape. Deliberately has NO root CAPEX account field. */
export interface DevCoCreate {
  vsb_name: string;
  "vsb_BoPContractStandardAssumption@odata.bind": string;
  "vsb_CAPEXAccount@odata.bind": string;
  "crc36_Country@odata.bind": string;
  crc36_technology: number;
}

export interface DevCoRepository {
  /** False when the table is not registered — the screen then shows its error state. */
  isAvailable(): boolean;
  listByScope(countryId: string, technology: number): Promise<DevCoRow[]>;
  /** Returns the new ids. */
  createMany(rows: readonly DevCoCreate[]): Promise<string[]>;
  remove(id: string): Promise<void>;
}

function toDevCoRow(r: DevCoRecord): DevCoRow {
  return {
    id: r.vsb_bopcontractsstandardassumptiondevcocostsid,
    contractId: r._vsb_bopcontractstandardassumption_value ?? "",
    accountId: r._vsb_capexaccount_value ?? "",
    rootAccountId: r._vsb_rootcapexaccount_value ?? undefined,
    accountLabel: r["_vsb_capexaccount_value@OData.Community.Display.V1.FormattedValue"],
    rootLabel: r["_vsb_rootcapexaccount_value@OData.Community.Display.V1.FormattedValue"],
  };
}

/**
 * The repository over the SADC generated service: a thrown SDK failure or `success: false` both
 * become a `DataError`, and paging keeps the skip token. The service is only called inside each
 * operation, after the `isRegistered` check.
 */
export function createDevCoRepository(deps: {
  isRegistered: () => boolean;
}): DevCoRepository {
  const ensure = (operation: string) => {
    if (!deps.isRegistered()) throw new DevCoTableUnavailableError(operation);
  };

  return {
    isAvailable: () => deps.isRegistered(),

    async listByScope(countryId, technology) {
      const op = "list standard contract DevCo links";
      ensure(op);
      const rows = await fetchAll<DevCoRecord>(
        op,
        (o) => guardedResult(`read ${ENTITY.devCo}`, () => Vsb_bopcontractsstandardassumptiondevcocostsesService.getAll(o)),
        { select: DEVCO_SELECT, filter: devCoFilter(countryId, technology) },
      );
      return rows.map(toDevCoRow);
    },

    async createMany(rows) {
      const op = "link DevCo accounts to the standard contract";
      ensure(op);
      if (rows.length === 0) return [];
      // One create per row (master has no bulk services). Fail-fast as `mapLimit`: no new row
      // starts after a failure and the first error is rethrown.
      return mapLimit(rows, async (row) => {
        const created = await guardedCall(op, () =>
          Vsb_bopcontractsstandardassumptiondevcocostsesService.create({ ...row } as unknown as DevCoServiceCreate));
        return created.vsb_bopcontractsstandardassumptiondevcocostsid;
      }, WRITE_CONCURRENCY);
    },

    async remove(id) {
      const op = "unlink a DevCo account from the standard contract";
      ensure(op);
      await deleteRecord(op, ENTITY.devCo, id);
    },
  };
}

/** The live repository. */
export const devCoRepository: DevCoRepository = createDevCoRepository({
  isRegistered: () => Object.prototype.hasOwnProperty.call(dataSourcesInfo, ENTITY.devCo),
});

/** One query serves the tag groups and ownership. */
export function listContractDevCoRows(countryId: string, technology: number, repo: DevCoRepository = devCoRepository) {
  return repo.listByScope(countryId, technology);
}

/* ═════════════════════════════════════════════════════════════ writes ══ */

export interface SaveContractInput {
  /** Undefined for a new contract. */
  contractId?: string;
  contractType: number;
  countryId: string;
  technology: number;
  form: ContractForm;
  /** Number and name of every selected Level-3 account, for the child `vsb_name`. */
  accounts: ReadonlyMap<string, { number: string; name: string }>;
  lang: string;
}

export function buildDevCoCreate(args: {
  contractId: string; accountId: string; number: string; name: string;
  countryId: string; technology: number;
}): DevCoCreate {
  return {
    vsb_name: `${args.number}-${args.name}`,
    "vsb_BoPContractStandardAssumption@odata.bind": `/${ENTITY.contracts}(${args.contractId})`,
    "vsb_CAPEXAccount@odata.bind": `/${ENTITY.capexAccounts}(${args.accountId})`,
    "crc36_Country@odata.bind": `/${ENTITY.countries}(${args.countryId})`,
    crc36_technology: args.technology,
  };
}

type SaCreate = Parameters<typeof Vsb_bopcontractsstandardassumptionsesService.create>[0];
type SaUpdate = Parameters<typeof Vsb_bopcontractsstandardassumptionsesService.update>[1];

/**
 * The save, in order: re-check ownership → parent → removals → additions. Each phase that
 * fails throws `ContractSaveError` naming it. Removals and additions are planned from a FRESH
 * read of this contract's children, so a retry after a partial failure re-sends only what is
 * still missing, and a removal can never target another contract's row.
 */
export async function saveStandardContract(
  input: SaveContractInput, repo: DevCoRepository = devCoRepository,
): Promise<{ contractId: string }> {
  const { countryId, technology, form } = input;
  const selected = form.selectedAccountIds;

  let scope: DevCoRow[];
  try {
    scope = await repo.listByScope(countryId, technology);
  } catch (error) {
    throw new ContractSaveError("check", input.contractId, error);
  }
  const conflicts = findOwnershipConflicts(scope, input.contractId, selected);
  if (conflicts.length > 0) {
    throw new ContractSaveError("check", input.contractId, new OwnershipConflictError(conflicts));
  }

  const payload = buildParentPayload(form, {
    contractType: input.contractType, countryId, technology, lang: input.lang,
  });
  let contractId = input.contractId;
  try {
    if (contractId) {
      // guarded PATCH, the FIRST write of the save — a contract deleted meanwhile
      // raises RecordGoneError (wrapped as the "parent" phase) and nothing at all is written.
      await updateRecordIfExists("update BoP standard contract", ENTITY.contracts, contractId, payload as unknown as SaUpdate, {
        primaryKey: "vsb_bopcontractsstandardassumptionsid",
      });
    } else {
      const created = unwrap(
        await Vsb_bopcontractsstandardassumptionsesService.create(payload as unknown as SaCreate),
        "create BoP standard contract",
      );
      contractId = created?.vsb_bopcontractsstandardassumptionsid;
      if (!contractId) throw new DataError("create BoP standard contract", "no id was returned");
    }
  } catch (error) {
    throw new ContractSaveError("parent", input.contractId, error);
  }

  const own = scope.filter((r) => r.contractId === contractId);
  const diff = planDevCoDiff(own, selected);

  try {
    await forEachLimit(diff.toDelete, (id) => repo.remove(id), DELETE_CONCURRENCY);
  } catch (error) {
    throw new ContractSaveError("removals", contractId, error);
  }

  try {
    const rows = diff.toCreate.map((accountId) => {
      const account = input.accounts.get(accountId);
      return buildDevCoCreate({
        contractId: contractId as string, accountId,
        number: account?.number ?? "", name: account?.name ?? "",
        countryId, technology,
      });
    });
    await repo.createMany(rows);
  } catch (error) {
    throw new ContractSaveError("additions", contractId, error);
  }

  return { contractId };
}

/** What a delete achieved: `alreadyDeleted` when another user removed the row first. */
export interface DeleteContractResult { alreadyDeleted: boolean }

/**
 * Children cascade on the server; a plugin refusal surfaces as a `DataError`. A 404
 * means the row is already gone (another user deleted it), so the goal is met — it resolves with
 * `alreadyDeleted: true` instead of failing (the canvas `Remove` had no `IfError` and refreshed).
 */
export async function deleteStandardContract(id: string): Promise<DeleteContractResult> {
  try {
    await deleteRecord("delete BoP standard contract", ENTITY.contracts, id);
    return { alreadyDeleted: false };
  } catch (error) {
    if (error instanceof DataError && error.status === 404) {
      trace("warning","BoP standard contract was already deleted", error);
      return { alreadyDeleted: true };
    }
    throw error;
  }
}
