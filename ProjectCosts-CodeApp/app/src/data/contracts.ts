/**
 * The Contracts screen's data access.
 *
 * Every function here replaces a `ClearCollect(col, Filter(Table, …))` from
 * `Contracts Screen.OnVisible` or `cmd_Contracts_CommandBar.OnSelect`, with two differences
 * that matter:
 *
 *  - the filter runs on the SERVER, so nothing is capped at the canvas app's 2000-row
 *    `DefaultConnectedDataSourceMaxGetRowsCount`;
 *  - `$select` is always given, so a contract row costs 20 columns instead of the whole table
 *    plus its formatted-value annotations.
 *
 * The canvas app also fetched `'CAPEX Account Lists'` with NO filter at all
 * (`ClearCollect(colCapexAllAccountsTemporary, 'CAPEX Account Lists')`). That one stays a
 * full fetch — it is the chart of accounts, it is bounded, and the tree needs all of it —
 * but it is paged and narrowed to six columns.
 */
import { Vsb_bopprojectscontractsesService } from "@/generated/services/Vsb_bopprojectscontractsesService";
import { Vsb_bopcontractspaymenttargetsesService } from "@/generated/services/Vsb_bopcontractspaymenttargetsesService";
import { Vsb_bopcontractsdevcocostsesService } from "@/generated/services/Vsb_bopcontractsdevcocostsesService";
import { Vsb_bopcontractsstandardassumptionsesService } from "@/generated/services/Vsb_bopcontractsstandardassumptionsesService";
import { Vsb_capexaccountlistsService } from "@/generated/services/Vsb_capexaccountlistsService";
import { Vsb_capexprojectcontractsService } from "@/generated/services/Vsb_capexprojectcontractsService";
import { Vsb_capexcostsService } from "@/generated/services/Vsb_capexcostsService";
import type { Vsb_bopprojectscontractses } from "@/generated/models/Vsb_bopprojectscontractsesModel";
import type { Vsb_bopcontractspaymenttargetses } from "@/generated/models/Vsb_bopcontractspaymenttargetsesModel";
import type { Vsb_bopcontractsdevcocostses } from "@/generated/models/Vsb_bopcontractsdevcocostsesModel";
import type { Vsb_bopcontractsstandardassumptionses } from "@/generated/models/Vsb_bopcontractsstandardassumptionsesModel";
import type { Vsb_capexaccountlists } from "@/generated/models/Vsb_capexaccountlistsModel";
import type { Vsb_capexprojectcontracts } from "@/generated/models/Vsb_capexprojectcontractsModel";
import { unwrap } from "@/platform/errors";
import { fetchAll } from "./client";
import { ACTIVE, and, chunk, eq, lookupEq, lookupIn } from "./odata";
import {
  COST_TYPE, CLOSING_DATE_TYPE, CONTRACT_TYPE, TOTAL_COSTS_TYPE, MARGIN_TYPE,
  type AccountRow, type BopContract, type CapexCostRow, type CapexProjectContract,
  type ClosingDateType,
  type ContractType, type MarginType, type PaymentTarget, type TotalCostsType,
} from "@/features/contracts/rules";

/* ═══════════════════════════════════════════════════════════════ entity sets */

export const ES = {
  bopContracts: "vsb_bopprojectscontractses",
  paymentTargets: "vsb_bopcontractspaymenttargetses",
  devCoCosts: "vsb_bopcontractsdevcocostses",
  bopStandardAssumptions: "vsb_bopcontractsstandardassumptionses",
  capexAccounts: "vsb_capexaccountlists",
  capexProjectContracts: "vsb_capexprojectcontracts",
  projects: "vsb_projects",
  businessUnits: "businessunits",
} as const;

/* ═══════════════════════════════════════════════════════════════════ mapping */

/** Dataverse dates arrive as ISO strings; a blank column is absent, not empty. */
function toDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function toContract(row: Vsb_bopprojectscontractses): BopContract {
  return {
    id: row.vsb_bopprojectscontractsid,
    name: row.vsb_name,
    description: row.vsb_description,
    contractType: (numberOf(row.vsb_contracttypes) ?? CONTRACT_TYPE.None) as ContractType,
    closingDate: toDate(row.vsb_closingdate),
    costsUntilClosingType:
      (numberOf(row.vsb_costsuntilclosingdate) ?? CLOSING_DATE_TYPE.None) as ClosingDateType,
    costsUntilClosingPlan: row.vsb_costsuntilclosingdateplan,
    costsUntilClosingActual: row.vsb_costsuntilclosingdateactual,
    costsAfterClosingType:
      (numberOf(row.vsb_costsafterclosingdate) ?? CLOSING_DATE_TYPE.None) as ClosingDateType,
    costsAfterClosingPlan: row.vsb_costsafterclosingdateplan,
    costsAfterClosingActual: row.vsb_costsafterclosingdateactual,
    totalCostsType: (numberOf(row.vsb_totalcoststype) ?? TOTAL_COSTS_TYPE.None) as TotalCostsType,
    totalCostsCalculated: row.vsb_totalcostscalculated,
    totalCostsOverwrite: row.vsb_totalcostsoverwrite,
    margin: row.vsb_margin === true,
    marginType: numberOf(row.vsb_margintype) as MarginType | undefined,
    marginPercentage: row.vsb_marginpercentage,
    marginFixedValue: row.vsb_marginfixedvalue,
    totalCostOfContract: row.vsb_totalcostofcontract,
    comment: row.vsb_comment,
    isStandardContract: row.vsb_isstandardcontract === true,
    isMarginStandardAssumption: row.vsb_ismarginstandardassumption === true,
  };
}

/**
 * Option-set values come back as numbers, but the generated models type them as the KEY of
 * a const object, which TypeScript widens to `1 | 2 | …` string-ish unions in places. This
 * narrows once rather than casting at twenty call sites.
 */
function numberOf(value: unknown): number | undefined {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function toPaymentTarget(row: Vsb_bopcontractspaymenttargetses): PaymentTarget {
  return {
    id: row.vsb_bopcontractspaymenttargetsid,
    contractId: row._vsb_bopprojectcontract_value ?? "",
    description: row.vsb_description,
    // vsb_paymentdate is an `nvarchar` column — the canvas app stores "MM/YYYY" as text.
    paymentDate: row.vsb_paymentdate,
    totalCostsContract: row.vsb_totalcostscontract,
    note: row.vsb_note,
  };
}

function toAccountRow(row: Vsb_capexaccountlists): AccountRow {
  return {
    id: row.vsb_capexaccountlistid,
    number: row.vsb_number ?? "",
    name: row.vsb_name,
    order: row.vsb_order,
    parentId: row._vsb_parentaccount_value,
  };
}

function toCapexContract(row: Vsb_capexprojectcontracts): CapexProjectContract {
  return {
    id: row.vsb_capexprojectcontractid,
    accountId: row._vsb_account_value,
    totalCost: row.vsb_totalcost,
  };
}

/* ═══════════════════════════════════════════════════════════════════ reads */

const CONTRACT_SELECT = [
  "vsb_bopprojectscontractsid", "vsb_name", "vsb_description", "vsb_contracttypes",
  "vsb_closingdate", "vsb_costsuntilclosingdate", "vsb_costsuntilclosingdateplan",
  "vsb_costsuntilclosingdateactual", "vsb_costsafterclosingdate",
  "vsb_costsafterclosingdateplan", "vsb_costsafterclosingdateactual",
  "vsb_totalcoststype", "vsb_totalcostscalculated", "vsb_totalcostsoverwrite",
  "vsb_margin", "vsb_margintype", "vsb_marginpercentage", "vsb_marginfixedvalue",
  "vsb_totalcostofcontract", "vsb_comment", "vsb_isstandardcontract",
  "vsb_ismarginstandardassumption",
];

/** `ClearCollect(colBoPContracts, Filter('BoP Projects Contracts', Project.Project = …))` */
export async function listContracts(projectId: string): Promise<BopContract[]> {
  const rows = await fetchAll(
    "list BoP contracts",
    (o) => Vsb_bopprojectscontractsesService.getAll(o),
    { select: CONTRACT_SELECT, filter: and(lookupEq("vsb_project", projectId), ACTIVE) },
  );
  return rows.map(toContract);
}

/**
 * Payment targets for the whole project in one query.
 *
 * The canvas app read them per contract, inside the gallery — so the nested
 * `gal_..._PaymentTargets.Items` re-queried on every render of every card. One query,
 * grouped client-side, is the same data.
 */
export async function listPaymentTargets(
  projectId: string,
  contractIds: readonly string[],
): Promise<PaymentTarget[]> {
  if (contractIds.length === 0) return [];
  void projectId; // kept for the cache key's sake; the filter is by contract
  const batches = await Promise.all(
    chunk(contractIds).map((ids) =>
      fetchAll(
        "list payment targets",
        (o) => Vsb_bopcontractspaymenttargetsesService.getAll(o),
        {
          select: [
            "vsb_bopcontractspaymenttargetsid", "vsb_description", "vsb_paymentdate",
            "vsb_totalcostscontract", "vsb_note", "_vsb_bopprojectcontract_value",
          ],
          filter: and(lookupIn("vsb_bopprojectcontract", ids), ACTIVE),
        },
      ),
    ),
  );
  return batches.flat().map(toPaymentTarget);
}

/**
 * Which CAPEX account each contract has claimed.
 * `Filter('BoP Contracts DevCo Costs', 'BoP Contract'.'BoP Projects Contracts' in …)`
 */
export async function listDevCoLinks(
  contractIds: readonly string[],
): Promise<{ id: string; accountId: string; contractId: string }[]> {
  if (contractIds.length === 0) return [];
  const batches = await Promise.all(
    chunk(contractIds).map((ids) =>
      fetchAll(
        "list DevCo cost links",
        (o) => Vsb_bopcontractsdevcocostsesService.getAll(o),
        {
          select: [
            "vsb_bopcontractsdevcocostsid", "_vsb_account_value", "_vsb_bopcontract_value",
          ],
          filter: and(lookupIn("vsb_bopcontract", ids), ACTIVE),
        },
      ),
    ),
  );
  return batches
    .flat()
    .filter((r): r is Vsb_bopcontractsdevcocostses & { _vsb_account_value: string } =>
      Boolean(r._vsb_account_value))
    .map((r) => ({
      id: r.vsb_bopcontractsdevcocostsid,
      accountId: r._vsb_account_value,
      contractId: r._vsb_bopcontract_value ?? "",
    }));
}

/**
 * `ClearCollect(colSelectedProjectCapexContractsCosts, …)` — the monthly DevCo CAPEX costs that
 * Contracts recalculation sums.
 *
 * The canvas built this by filtering `'CAPEX Costs'` to the project's **DevCo** CAPEX Project
 * Contracts, then deriving `cn` / `mm` / `type` columns. Here the contract ids come from
 * `listDevCoCapexContracts` and the month arrives already numeric: `vsb_month` is a global
 * picklist whose option values are 1-12 in calendar order, so it maps straight onto
 * `CapexCostRow.month` with no name lookup — the canvas needed a twelve-branch `Switch` over
 * `Lower(Text(locCost.Month))` only because Power Fx handed it the label.
 *
 * `vsb_cost` is the decimal amount; a row with no cost is left as `undefined` rather than 0 so
 * `sum()` skips it, matching the canvas's `Blank()` handling.
 */
export async function listCapexCostRows(projectId: string): Promise<CapexCostRow[]> {
  const contracts = await listDevCoCapexContracts(projectId);
  const contractIds = contracts.map((c) => c.id);
  if (contractIds.length === 0) return [];

  const batches = await Promise.all(
    chunk(contractIds).map((ids) =>
      fetchAll(
        "list DevCo CAPEX costs",
        (o) => Vsb_capexcostsService.getAll(o),
        {
          select: ["vsb_capexcostid", "_vsb_contract_value", "vsb_year", "vsb_month", "vsb_cost"],
          filter: and(lookupIn("vsb_contract", ids), ACTIVE),
        },
      ),
    ),
  );

  return batches.flat().map((r) => ({
    contractId: r._vsb_contract_value ?? "",
    year: Number(r.vsb_year ?? 0),
    month: Number(r.vsb_month ?? 0),
    cost: r.vsb_cost,
  }));
}

/** `ClearCollect(colCapexAllAccountsTemporary, 'CAPEX Account Lists')` — the chart of accounts. */
export async function listCapexAccounts(): Promise<AccountRow[]> {
  const rows = await fetchAll(
    "list CAPEX accounts",
    (o) => Vsb_capexaccountlistsService.getAll(o),
    {
      select: [
        "vsb_capexaccountlistid", "vsb_number", "vsb_name", "vsb_order",
        "_vsb_parentaccount_value", "vsb_accountcategory",
      ],
      filter: ACTIVE,
      orderBy: ["vsb_number asc"],
    },
  );
  return rows.map(toAccountRow);
}

/**
 * `ClearCollect(colBoPCapexProjectContracts, Filter('CAPEX Project Contracts',
 *    Project.Project = …, 'Cost Type' = 'Cost paid type'.DevCo))`
 *
 * Only DevCo costs feed a BoP contract; SPV ones are excluded on the server here rather than
 * after the fact.
 */
export async function listDevCoCapexContracts(
  projectId: string,
): Promise<CapexProjectContract[]> {
  const rows = await fetchAll(
    "list DevCo CAPEX contracts",
    (o) => Vsb_capexprojectcontractsService.getAll(o),
    {
      select: ["vsb_capexprojectcontractid", "_vsb_account_value", "vsb_totalcost"],
      filter: and(
        lookupEq("vsb_project", projectId),
        eq("vsb_costtype", COST_TYPE.DevCo),
        ACTIVE,
      ),
    },
  );
  return rows.map(toCapexContract);
}

/**
 * The BoP standard assumption that seeds a new contract's margin.
 *
 * DIVERGENCE — the canvas app reads this from the FABRIC SQL mirror
 * (`Filter('Assumptions BoP Contracts', countryname = …, technology = …)`, connection
 * reference `vsb_VSBCloudFabricSQL`), not from Dataverse. The same data exists in
 * `vsb_bopcontractsstandardassumptionses`, and reading it here means:
 *   - no premium SQL connector and no `vsb_FabricSQLServer` / `vsb_FabricSQLDatabase`
 *     environment-variable indirection in the code app;
 *   - fresher numbers, because the Fabric copy lags by `vsb_FabricSyncDelayMinutes`.
 * If the Fabric table is deliberately allowed to differ from Dataverse, this has to move
 * back onto the SQL connector. ON THE OPEN-DECISION LIST.
 */
export async function findBopStandardAssumption(args: {
  countryId: string | undefined;
  technology: number | undefined;
  contractType: ContractType;
}): Promise<Vsb_bopcontractsstandardassumptionses | undefined> {
  if (!args.countryId || args.technology === undefined) return undefined;
  const rows = await fetchAll(
    "find BoP standard assumption",
    (o) => Vsb_bopcontractsstandardassumptionsesService.getAll(o),
    {
      select: [
        "vsb_bopcontractsstandardassumptionsid", "vsb_contracttypes", "vsb_margin",
        "vsb_margintype", "vsb_marginpercentage", "vsb_marginfixedvalue",
      ],
      filter: and(
        lookupEq("vsb_country", args.countryId),
        eq("vsb_technology", args.technology),
        eq("vsb_contracttypes", args.contractType),
        ACTIVE,
      ),
      top: 1,
    },
  );
  return rows[0];
}

/* ══════════════════════════════════════════════════════════════════ writes */

export interface ContractWrite {
  id?: string;
  projectId: string;
  owningBusinessUnitId?: string;
  name: string;
  description: string;
  contractType: ContractType;
  closingDate: Date;
  costsUntilClosingType: ClosingDateType;
  costsUntilClosingPlan?: number;
  costsUntilClosingActual?: number;
  costsAfterClosingType: ClosingDateType;
  costsAfterClosingPlan?: number;
  costsAfterClosingActual?: number;
  totalCostsType: TotalCostsType;
  totalCostsCalculated?: number;
  totalCostsOverwrite?: number;
  margin: boolean;
  marginType?: MarginType;
  marginPercentage?: number;
  marginFixedValue?: number;
  totalCostOfContract: number;
  comment: string;
  isMarginStandardAssumption: boolean;
}

/**
 * The `Patch('BoP Projects Contracts', …)` payload.
 *
 * Rule: EVERY create on a project-scoped table writes the owning business unit explicitly.
 * Omitting it never errors — Dataverse derives it from the CALLER — so a row created by a
 * German user on a French project simply becomes invisible to the French BU-scoped team
 * later. `OwningBusinessUnit@odata.bind` is the write form (note the casing: that is what
 * the generated model declares, not the lower-case spelling).
 *
 * The canvas Save also wrote two constants that are reproduced here:
 *   'BoP Standard Assumption Contract': Blank()   — the link is never persisted, even when
 *                                                   the margin came from an assumption
 *   'Is Standard Contract': No                    — always, for the same reason
 * Both are on the open-decision list; they are copied unchanged for now.
 */
function contractPayload(w: ContractWrite) {
  const untilPlan = w.costsUntilClosingType === CLOSING_DATE_TYPE.Plan;
  const untilActual = w.costsUntilClosingType === CLOSING_DATE_TYPE.Actual;
  const afterPlan = w.costsAfterClosingType === CLOSING_DATE_TYPE.Plan;
  const afterActual = w.costsAfterClosingType === CLOSING_DATE_TYPE.Actual;
  const calculated = w.totalCostsType === TOTAL_COSTS_TYPE.Calculated;
  const overwrite = w.totalCostsType === TOTAL_COSTS_TYPE.Overwrite;
  const pct = w.margin && w.marginType === MARGIN_TYPE.Percentage;
  const fixed = w.margin && w.marginType === MARGIN_TYPE.FixedValue;

  return {
    vsb_name: w.name,
    "vsb_Project@odata.bind": `/${ES.projects}(${w.projectId})`,
    vsb_description: w.description.trim(),
    vsb_closingdate: w.closingDate.toISOString(),
    vsb_contracttypes: w.contractType,
    vsb_costsuntilclosingdate: w.costsUntilClosingType,
    vsb_costsuntilclosingdateplan: untilPlan ? w.costsUntilClosingPlan ?? null : null,
    vsb_costsuntilclosingdateactual: untilActual ? w.costsUntilClosingActual ?? null : null,
    vsb_costsafterclosingdate: w.costsAfterClosingType,
    vsb_costsafterclosingdateplan: afterPlan ? w.costsAfterClosingPlan ?? null : null,
    vsb_costsafterclosingdateactual: afterActual ? w.costsAfterClosingActual ?? null : null,
    vsb_totalcoststype: w.totalCostsType,
    vsb_totalcostscalculated: calculated ? w.totalCostsCalculated ?? null : null,
    vsb_totalcostsoverwrite: overwrite ? w.totalCostsOverwrite ?? null : null,
    vsb_margin: w.margin,
    vsb_margintype: w.margin ? w.marginType ?? null : null,
    vsb_marginpercentage: pct ? w.marginPercentage ?? null : null,
    vsb_marginfixedvalue: fixed ? w.marginFixedValue ?? null : null,
    vsb_totalcostofcontract: w.totalCostOfContract,
    vsb_comment: w.comment.trim(),
    vsb_ismarginstandardassumption: w.isMarginStandardAssumption,
    vsb_isstandardcontract: false,
    ...(w.owningBusinessUnitId
      ? { "OwningBusinessUnit@odata.bind": `/${ES.businessUnits}(${w.owningBusinessUnitId})` }
      : {}),
  };
}

export async function saveContract(w: ContractWrite): Promise<BopContract> {
  const payload = contractPayload(w);
  const result = w.id
    ? await Vsb_bopprojectscontractsesService.update(w.id, payload as never)
    : await Vsb_bopprojectscontractsesService.create(payload as never);
  return toContract(unwrap(result, w.id ? "update BoP contract" : "create BoP contract"));
}

export async function deleteContract(id: string): Promise<void> {
  await Vsb_bopprojectscontractsesService.delete(id);
}

/**
 * Replaces a contract's DevCo-cost links.
 *
 * The canvas Save deletes every row for the contract and re-creates the selected set:
 *
 *   RemoveIf('BoP Contracts DevCo Costs', 'BoP Contract'.… = locSelectedContract.…);
 *   Patch('BoP Contracts DevCo Costs', colContractsDevCoCostsToUpdate)
 *
 * The delete-then-create shape is preserved because a DevCo link carries no state of its own
 * — but note it is NOT transactional here any more than it was there: these are individual
 * requests, so an interrupted save can leave a contract with fewer links than it had. That is
 * unchanged from the canvas app and is called out rather than silently inherited.
 *
 * One real fix: the canvas version runs `RemoveIf(… = locSelectedContract.…)` even when
 * CREATING, where `locSelectedContract` is Blank — so it issues a delete filtered on a blank
 * lookup. Here the delete is skipped entirely when there is no existing contract.
 */
export async function replaceDevCoLinks(args: {
  contractId: string;
  isNewContract: boolean;
  owningBusinessUnitId?: string;
  accounts: readonly { id: string; name: string }[];
}): Promise<void> {
  if (!args.isNewContract) {
    const existing = await listDevCoLinks([args.contractId]);
    await Promise.all(
      existing.map((row) => Vsb_bopcontractsdevcocostsesService.delete(row.id)),
    );
  }
  await Promise.all(
    args.accounts.map((account) =>
      Vsb_bopcontractsdevcocostsesService.create({
        vsb_name: account.name,
        "vsb_BoPContract@odata.bind": `/${ES.bopContracts}(${args.contractId})`,
        "vsb_Account@odata.bind": `/${ES.capexAccounts}(${account.id})`,
        ...(args.owningBusinessUnitId
          ? { "OwningBusinessUnit@odata.bind": `/${ES.businessUnits}(${args.owningBusinessUnitId})` }
          : {}),
      } as never),
    ),
  );
}

export interface PaymentTargetWrite {
  id?: string;
  contractId: string;
  owningBusinessUnitId?: string;
  name: string;
  description: string;
  /** Stored as text, "MM/YYYY". */
  paymentDate: string;
  totalCostsContract: number;
  note: string;
}

export async function savePaymentTarget(w: PaymentTargetWrite): Promise<PaymentTarget> {
  const payload = {
    vsb_name: w.name,
    "vsb_BoPProjectContract@odata.bind": `/${ES.bopContracts}(${w.contractId})`,
    vsb_description: w.description.trim(),
    vsb_paymentdate: w.paymentDate.trim(),
    vsb_totalcostscontract: w.totalCostsContract,
    vsb_note: w.note,
    ...(w.owningBusinessUnitId
      ? { "OwningBusinessUnit@odata.bind": `/${ES.businessUnits}(${w.owningBusinessUnitId})` }
      : {}),
  };
  const result = w.id
    ? await Vsb_bopcontractspaymenttargetsesService.update(w.id, payload as never)
    : await Vsb_bopcontractspaymenttargetsesService.create(payload as never);
  return toPaymentTarget(
    unwrap(result, w.id ? "update payment target" : "create payment target"),
  );
}

export async function deletePaymentTarget(id: string): Promise<void> {
  await Vsb_bopcontractspaymenttargetsesService.delete(id);
}
