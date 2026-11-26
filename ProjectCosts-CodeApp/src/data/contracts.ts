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
import type { Vsb_capexprojectcontracts } from "@/generated/models/Vsb_capexprojectcontractsModel";
import { DataError, unwrap } from "@/platform/errors";
import { logAction, loggedCall } from "@/platform/requestLog";
import { trace } from "@/platform/telemetry";
import type { IOperationResult } from "@microsoft/power-apps/data";
import { createWithStableId } from "./stableCreateId";
import { deleteIfExists, fetchAll, isAlreadyGone, updateRecordIfExists } from "./client";
import { listActiveCapexAccounts, toAccountRow } from "./capexAccounts";
import { DELETE_CONCURRENCY, WRITE_CONCURRENCY, mapLimit } from "./concurrency";
import { ACTIVE, and, chunk, dateOnly, eq, idIn, lookupEq, lookupIn, numberOf, or } from "./odata";
import { costWrite } from "./costWritePolicy";
import {
  COST_TYPE, CLOSING_DATE_TYPE, CONTRACT_TYPE, TOTAL_COSTS_TYPE, MARGIN_TYPE,
  type AccountRow, type BopContract, type CapexCostRow, type CapexProjectContract,
  type ClosingDateType,
  planDevCoLinks,
  type ContractType, type MarginType, type PaymentTarget, type TotalCostsType,
} from "@/features/cost/contracts/rules";

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
/**
 * A Dataverse date into a local `Date`.
 *
 * A Date-Only column comes back bare (`"2026-09-18"`), and `new Date("2026-09-18")` is defined to
 * parse that as UTC midnight — which renders as the 17th everywhere west of Greenwich. Splitting
 * the parts and using the local constructor keeps the calendar day the user picked. Full
 * timestamps still go through `new Date` unchanged.
 */
function toDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const dateOnlyParts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const d = dateOnlyParts
    ? new Date(Number(dateOnlyParts[1]), Number(dateOnlyParts[2]) - 1, Number(dateOnlyParts[3]))
    : new Date(value);
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
function toPaymentTarget(row: Vsb_bopcontractspaymenttargetses): PaymentTarget {
  return {
    id: row.vsb_bopcontractspaymenttargetsid,
    contractId: row._vsb_bopprojectcontract_value ?? "",
    createdOn: row.createdon,
    description: row.vsb_description,
    // vsb_paymentdate is an `nvarchar` column — the canvas app stores "MM/YYYY" as text.
    paymentDate: row.vsb_paymentdate,
    totalCostsContract: row.vsb_totalcostscontract,
    note: row.vsb_note,
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

/**
 * `ClearCollect(colBoPContracts, Filter('BoP Projects Contracts', Project.Project = …))`
 *
 * PRODUCT DECISION, left as is (CONTR-005): the canvas filter has NO state condition, so it also lists
 * INACTIVE contracts; this read keeps `statecode eq 0` (same shape as D45 G2). Not changed here.
 */
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
            "vsb_totalcostscontract", "vsb_note", "_vsb_bopprojectcontract_value", "createdon",
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
export interface DevCoLinkRow { id: string; accountId: string; contractId: string }

export async function listDevCoLinks(
  contractIds: readonly string[],
): Promise<DevCoLinkRow[]> {
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
export async function listCapexCostRows(
  projectId: string,
  /**
   * B2 (S1-07): the project's DevCo CAPEX contracts, when the caller already has them (or their read in flight): the Contracts
   * screen reads them under their own query key at the same moment, and this function read them a second time. Omitted, it reads them.
   */
  devCoContracts?: readonly CapexProjectContract[] | Promise<readonly CapexProjectContract[]>,
): Promise<CapexCostRow[]> {
  const contracts = devCoContracts ? await devCoContracts : await listDevCoCapexContracts(projectId);
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
          // B2 (OPT-08a): five narrow columns at the platform's page ceiling: one request per chunk instead of one per
          // 500 rows. Same rows, same order; only the number of round trips changes (as `loadContractCostSums`).
          maxPageSize: 5000,
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

/**
 * `ClearCollect(colCapexAllAccountsTemporary, 'CAPEX Account Lists')` — the chart of accounts.
 *
 * The canvas reads ALL states (no filter). By default this read keeps `statecode eq 0` (the Contracts
 * settings screen's chart of accounts, CONTR-057). `includeInactive` reads every state, as the canvas:
 * the project Contracts screen's DevCo picker uses it, so an inactive subaccount is listed there too
 * (the user, 23 Nov 2026 — it showed on the canvas and not in the code app; CONTR-057 lifted for that picker).
 */
export async function listCapexAccounts(options: { includeInactive?: boolean } = {}): Promise<AccountRow[]> {
  // B2 (OPT-07c): the default read is the one shared chart read (`./capexChart`: the same select, ACTIVE filter and `vsb_number asc`
  // order), shared with the cost book, the tab strip, the Summary totals and Add Cost from Table, and dropped after any admin account
  // write. `includeInactive` (the project Contracts screen's DevCo picker, 23 Nov 2026) needs every state, which the shared read does
  // not hold, so it keeps its own unfiltered read exactly as before. The default path and `toAccountRow` live in `./capexAccounts`
  // (D162 FE-AD-07), which the Application Settings Contracts screen imports without this module.
  if (!options.includeInactive) return listActiveCapexAccounts();
  const rows = await fetchAll(
    "list CAPEX accounts",
    (o) => Vsb_capexaccountlistsService.getAll(o),
    {
      select: [
        "vsb_capexaccountlistid", "vsb_number", "vsb_name", "vsb_order",
        "_vsb_parentaccount_value", "vsb_accountcategory",
      ],
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
  const rows = await readBopStandardAssumptions(args.countryId, args.technology, [args.contractType], 1);
  return rows[0];
}

/**
 * dvopt CB-13 (`BOP_ASSUMPTIONS_ONE_READ`): the Development AND the Construction standard assumption of one country and technology in ONE
 * request (`vsb_contracttypes eq Development or eq Construction`, oldest first), where the screen made two `top 1` reads on every mount.
 * The same rule per type as `findBopStandardAssumption` (TS-13: the OLDEST ACTIVE row of that type), taken on the client. The Map has no
 * entry for a type with no row. Without a country or a technology: an empty Map and no request.
 */
export async function findBopStandardAssumptions(args: {
  countryId: string | undefined;
  technology: number | undefined;
}): Promise<Map<number, Vsb_bopcontractsstandardassumptionses>> {
  const out = new Map<number, Vsb_bopcontractsstandardassumptionses>();
  if (!args.countryId || args.technology === undefined) return out;
  const rows = await readBopStandardAssumptions(
    args.countryId, args.technology, [CONTRACT_TYPE.Development, CONTRACT_TYPE.Construction],
  );
  for (const row of rows) {
    const type = Number(row.vsb_contracttypes);
    if (!out.has(type)) out.set(type, row); // oldest first: the first row of a type wins
  }
  return out;
}

/** The one read behind both: ACTIVE rows of the scope for one or more contract types, oldest first, optionally capped. */
function readBopStandardAssumptions(countryId: string, technology: number, types: readonly ContractType[], top?: number) {
  return fetchAll(
    "find BoP standard assumption",
    (o) => Vsb_bopcontractsstandardassumptionsesService.getAll(o),
    {
      select: [
        "vsb_bopcontractsstandardassumptionsid", "vsb_contracttypes", "vsb_margin",
        "vsb_margintype", "vsb_marginpercentage", "vsb_marginfixedvalue",
      ],
      filter: and(
        lookupEq("vsb_country", countryId),
        eq("vsb_technology", technology),
        types.length === 1 ? eq("vsb_contracttypes", types[0] as ContractType) : or(...types.map((t) => eq("vsb_contracttypes", t))),
        ACTIVE,
      ),
      // Deterministic when two rows match (a data-quality slip): the OLDEST one, not whichever the server returns first.
      orderBy: ["createdon asc"],
      ...(top !== undefined ? { top } : {}),
    },
  );
}

/* ══════════════════════════════════════════════════════════════════ writes */

/**
 * CONVENTIONS rule 4: a create on a project-scoped table writes `owningbusinessunit@odata.bind`. Leaving it out never
 * errors; Dataverse then owns the row by the CALLER's business unit and a colleague of another unit cannot see it. The
 * write still goes ahead (the canvas wrote what it had), but it is traced, so the gap is visible in the console
 * (`[VSB] ACTION`, warn) and in the trace buffer (RB-14). Counts and names only.
 */
function warnNoOwningBusinessUnit(entitySet: string): void {
  const text = `create on ${entitySet} has no owning business unit: the row will be owned by the caller's unit (CONVENTIONS rule 4)`;
  trace("warning", text);
  logAction(text, "warn");
}


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
 * later. The write form is `owningbusinessunit@odata.bind`, LOWER-case.
 *
 * The casing is not cosmetic and not a matter of taste. `@odata.bind` must name the OData
 * NAVIGATION PROPERTY, and for the system-owned lookups Dataverse declares those in lower case
 * (`owningbusinessunit`), while custom lookups keep their schema-name casing — which is why
 * `vsb_Project@odata.bind` above is capitalised and this one is not. The generated TypeScript
 * model spells the field `OwningBusinessUnit` because the generator uses schema names; binding
 * that spelling makes the Web API reject the whole request:
 *
 *   An undeclared property 'OwningBusinessUnit' which only has property annotations in the
 *   payload but no property value was found in the payload.
 *
 * Every other write in this app (`capexWrites`, `addCostSheet`, `comments`) already uses the
 * lower-case form.
 *
 * It is also written on CREATE ONLY. Ownership is not an editable field on an existing row —
 * re-sending the bind on every update asks Dataverse to reassign the record on each save, which
 * is what `Assign` is for. `comments.ts` places the bind inside its create branch for the same
 * reason; here the payload is shared by both calls, so it is gated on `w.id` instead.
 *
 * The canvas Save also wrote two constants that are reproduced here:
 *   'BoP Standard Assumption Contract': Blank()   — the link is never persisted, even when
 *                                                   the margin came from an assumption
 *   'Is Standard Contract': No                    — always, for the same reason
 * Both are on the open-decision list; they are copied unchanged for now.
 */
export function contractPayload(w: ContractWrite) {
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
    vsb_closingdate: dateOnly(w.closingDate),
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
    // CREATE only — see the note above `contractPayload`.
    ...(w.owningBusinessUnitId && !w.id
      ? { "owningbusinessunit@odata.bind": `/${ES.businessUnits}(${w.owningBusinessUnitId})` }
      : {}),
  };
}

/**
 * The Project Rights `Patch` (`:3744-3759`) writes SEVEN columns only: Name, Project, Description,
 * Closing Date, Contract Types, `Total cost of contract [EUR]` and the Owning Business Unit. None of
 * the cost-type, margin, comment or standard columns is touched (CONTR-091). The description is trimmed
 * here as everywhere (the canvas writes it untrimmed; harmless).
 */
export function rightsContractPayload(w: ContractWrite) {
  return {
    vsb_name: w.name,
    "vsb_Project@odata.bind": `/${ES.projects}(${w.projectId})`,
    vsb_description: w.description.trim(),
    vsb_closingdate: dateOnly(w.closingDate),
    vsb_contracttypes: w.contractType,
    vsb_totalcostofcontract: w.totalCostOfContract,
    ...(w.owningBusinessUnitId && !w.id
      ? { "owningbusinessunit@odata.bind": `/${ES.businessUnits}(${w.owningBusinessUnitId})` }
      : {}),
  };
}

export async function saveContract(w: ContractWrite): Promise<BopContract> {
  const payload = w.contractType === CONTRACT_TYPE.ProjectRights
    ? rightsContractPayload(w)
    : contractPayload(w);
  if (!w.id && !w.owningBusinessUnitId) warnNoOwningBusinessUnit(ES.bopContracts);
  if (w.id) {
    // An UPDATE reads the row by primary key first (`updateRecordIfExists`): the SDK sends the PATCH without
    // `If-Match`, so against a contract another user deleted it would CREATE a new row holding only these columns,
    // without the owning business unit (rule 4). A deleted row now fails with `RecordGoneError`, nothing sent.
    const id = w.id;
    return toContract(
      await costWrite("patchAbsolute", ES.bopContracts, () => updateRecordIfExists<typeof payload, Vsb_bopprojectscontractses>(
        "update BoP contract", ES.bopContracts, id, payload,
      )),
    );
  }
  // dvopt CB-14 (`STABLE_CREATE_IDS`): the create carries a client id that a retry of the same save keeps, and a retried id is read
  // back first, so a POST that landed but looked failed (network drop, gateway timeout) cannot create a second contract.
  const created = await loggedCall(
    "create", ES.bopContracts,
    () => createWithStableId({
      operation: "create BoP contract", entitySet: ES.bopContracts, idField: "vsb_bopprojectscontractsid", payload: payload as Record<string, unknown>,
      create: (p) => costWrite("create", ES.bopContracts, () =>
        Vsb_bopprojectscontractsesService.create(p as never) as unknown as Promise<IOperationResult<Record<string, unknown>>>),
    }),
    (r) => (r.reused ? 0 : 1),
  );
  if (created.row) return toContract(created.row as unknown as Vsb_bopprojectscontractses);
  // An earlier attempt of this save had landed: that row is the result.
  const [existing] = await fetchAll(
    "read back BoP contract",
    (o) => Vsb_bopprojectscontractsesService.getAll(o),
    { select: CONTRACT_SELECT, filter: idIn("vsb_bopprojectscontractsid", [created.id]) },
  );
  if (!existing) throw new DataError("create BoP contract", `the contract saved by the earlier attempt could not be read back`);
  return toContract(existing);
}

/** `isAlreadyGone` / `deleteIfExists` live in `./client` (dvopt CB-03); re-exported so existing imports keep working. */
export { isAlreadyGone };

/** Through `deleteRecord` (rule 14, CA-27): the generated `delete()` returns nothing, so a refusal looked like success. */
export async function deleteContract(id: string): Promise<void> {
  await costWrite("delete", ES.bopContracts, () => deleteIfExists("delete BoP contract", ES.bopContracts, id));
}

/**
 * The contract was saved, but its DevCo links were not (all of them). Carries the saved contract's id so a retry
 * UPDATES that contract instead of creating a second one (the form still has no id after a create).
 */
export class ContractLinksError extends DataError {
  readonly contractId: string;

  constructor(contractId: string, cause: unknown) {
    super("save the DevCo cost links", cause, cause instanceof DataError ? cause.status : undefined);
    this.name = "ContractLinksError";
    this.contractId = contractId;
  }
}

/**
 * Brings a contract's DevCo-cost links to the ticked set.
 *
 * The canvas Save deletes every row for the contract and re-creates the selected set:
 *
 *   RemoveIf('BoP Contracts DevCo Costs', 'BoP Contract'.… = locSelectedContract.…);
 *   Patch('BoP Contracts DevCo Costs', colContractsDevCoCostsToUpdate)
 *
 * DIVERGENCE (D120 §2, proposed): this app writes only the DIFFERENCE (`planDevCoLinks`). A link that is
 * ticked and already stored is left alone, a stored link that is no longer ticked is deleted, and a ticked account
 * with no link gets one. The end state is the canvas's (one link per ticked account). An unchanged selection costs
 * one read and no write instead of N deletes and N creates, and a link row keeps its id and its created-on.
 * The creates run FIRST, so a failure part-way leaves the contract with its old links (plus some new ones), never
 * with none; pressing Save again repeats the same difference and finishes it. A delete that finds the row already
 * gone counts as done. Writes run in bounded pools (`WRITE_CONCURRENCY`, `DELETE_CONCURRENCY`) and the call returns
 * only after every started request has settled, so a second Save can never overlap the first.
 *
 * Still NOT transactional, as the canvas was: separate requests (no changeset on the SDK).
 *
 * One real fix over the canvas: its `RemoveIf(… = locSelectedContract.…)` also runs when CREATING, where
 * `locSelectedContract` is Blank. Here nothing is read or deleted for a new contract.
 */
export async function replaceDevCoLinks(args: {
  contractId: string;
  isNewContract: boolean;
  owningBusinessUnitId?: string;
  accounts: readonly { id: string; name: string }[];
  /** The level-3 accounts the picker showed; a stored link to any other account is left alone (D120 §2, N1). */
  visibleAccountIds?: readonly string[];
  /**
   * dvopt CB-11 (`CONTRACT_LINKS_WITH_PATCH`): the contract's stored links, ALREADY being read (started beside the contract save, which never
   * changes them). Awaited here in place of the read this function would start itself. Ignored for a new contract.
   */
  existingLinks?: Promise<readonly DevCoLinkRow[]>;
}): Promise<void> {
  const existing = args.isNewContract ? [] : await (args.existingLinks ?? listDevCoLinks([args.contractId]));
  const { create, remove } = planDevCoLinks(existing, args.accounts, args.visibleAccountIds);
  if (create.length > 0 && !args.owningBusinessUnitId) warnNoOwningBusinessUnit(ES.devCoCosts);
  // The SDK never throws on a refusal: every create is checked (CONVENTIONS rule 3, CONTR-081), so
  // a refused link reaches the save's error banner like the canvas `IfError(... Notify(...))`.
  await mapLimit(create, (account) =>
    loggedCall("create", ES.devCoCosts, async () => unwrap(
      await costWrite("create", ES.devCoCosts, () => Vsb_bopcontractsdevcocostsesService.create({
        vsb_name: account.name,
        "vsb_BoPContract@odata.bind": `/${ES.bopContracts}(${args.contractId})`,
        "vsb_Account@odata.bind": `/${ES.capexAccounts}(${account.id})`,
        ...(args.owningBusinessUnitId
          ? { "owningbusinessunit@odata.bind": `/${ES.businessUnits}(${args.owningBusinessUnitId})` }
          : {}),
      } as never)),
      "create DevCo cost link",
    ), () => 1), WRITE_CONCURRENCY);
  await mapLimit(
    remove,
    (id) => costWrite("delete", ES.devCoCosts, () => deleteIfExists("delete a contract's DevCo-cost link", ES.devCoCosts, id)),
    DELETE_CONCURRENCY,
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
    // CREATE only, same rule as the contract itself.
    ...(w.owningBusinessUnitId && !w.id
      ? { "owningbusinessunit@odata.bind": `/${ES.businessUnits}(${w.owningBusinessUnitId})` }
      : {}),
  };
  if (!w.id && !w.owningBusinessUnitId) warnNoOwningBusinessUnit(ES.paymentTargets);
  if (w.id) {
    // Same upsert guard as `saveContract`: never re-create a payment target another user deleted.
    const id = w.id;
    return toPaymentTarget(
      await costWrite("patchAbsolute", ES.paymentTargets, () => updateRecordIfExists<typeof payload, Vsb_bopcontractspaymenttargetses>(
        "update payment target", ES.paymentTargets, id, payload,
      )),
    );
  }
  const result = await loggedCall(
    "create", ES.paymentTargets,
    async () => unwrap(
      await costWrite("create", ES.paymentTargets, () => Vsb_bopcontractspaymenttargetsesService.create(payload as never)),
      "create payment target",
    ),
    () => 1,
  );
  return toPaymentTarget(result);
}

export async function deletePaymentTarget(id: string): Promise<void> {
  await costWrite("delete", ES.paymentTargets, () => deleteIfExists("delete payment target", ES.paymentTargets, id));
}
