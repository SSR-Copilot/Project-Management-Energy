/**
 * Admin Contract — the Dataverse reads behind `features/admin/admin-contract` (connected
 * 19 Oct 2026, D23). `vsb_bopcontractsstandardassumptiondevcocosts` was registered for this
 * screen; the other tables were already in `power.config.json`. The account chart is
 * `listAllCapexAccounts` (`data/adminCapexAccounts.ts`), shared with Admin CAPEX Accounts.
 *
 * Server automation on the writes (04-flow-inventory.md, verified 19 Oct 2026): the DevCo-cost
 * create plugin sets `vsb_rootcapexaccount`; the contract delete plugin removes the template and
 * project rows built from the contract. No flow fires.
 */
import { Vsb_bopcontractsstandardassumptiondevcocostsesService } from "@/generated/services/Vsb_bopcontractsstandardassumptiondevcocostsesService";
import { Vsb_bopcontractsstandardassumptionsesService } from "@/generated/services/Vsb_bopcontractsstandardassumptionsesService";
import { Vsb_countriesService } from "@/generated/services/Vsb_countriesService";
import {
  BOP_CONTRACT_COL, DEVCO_COST_COL,
  type BopContract, type ContractCountry, type DevCoCost,
} from "@/features/admin/admin-contract/rules";
import { fetchAll } from "./client";
import { and, chunk, eq, idIn, lookupEq, numberOf } from "./odata";

const num = (v: unknown): number | null => numberOf(v) ?? null;

/** `Countries` — the picker (`col_cmpCountryPickerItems`) and the card's `'ISO Currency Code'`. */
export async function listContractCountries(): Promise<ContractCountry[]> {
  const rows = await fetchAll(
    "list countries for BoP contracts",
    (o) => Vsb_countriesService.getAll(o),
    { select: ["vsb_countryid", "vsb_name", "vsb_isocurrencycode"] },
  );
  return rows.map((r) => ({
    id: r.vsb_countryid, name: r.vsb_name ?? "", isoCurrencyCode: r.vsb_isocurrencycode ?? null,
  }));
}

/**
 * `Filter(colAdminContracts, Country.Name = <country>, Text(Technology) = <tech>)`, sorted
 * `"vsb_contracttypes"` then `"vsb_name"` ascending. No status filter, as the canvas.
 */
export async function listBopContracts(countryId: string, technology: number): Promise<BopContract[]> {
  const C = BOP_CONTRACT_COL;
  const rows = await fetchAll(
    "list BoP standard contracts",
    (o) => Vsb_bopcontractsstandardassumptionsesService.getAll(o),
    {
      select: [
        C.id, C.name, C.description, C.country, C.technology, C.contractTypes,
        C.closingDateReference, C.monthDifference, C.margin, C.marginType, C.marginPercentage,
        C.marginFixedValue, C.comment,
      ],
      filter: and(lookupEq("vsb_country", countryId), eq(C.technology, technology)),
      orderBy: [`${C.contractTypes} asc`, `${C.name} asc`],
    },
  );
  return rows.map((r) => ({
    id: r.vsb_bopcontractsstandardassumptionsid,
    name: r.vsb_name ?? null,
    description: r.vsb_description ?? null,
    countryId: r._vsb_country_value ?? null,
    technology: num(r.vsb_technology),
    contractType: num(r.vsb_contracttypes),
    closingDateReference: num(r.vsb_closingdatereference),
    monthDifference: r.vsb_monthdifference ?? null,
    margin: r.vsb_margin ?? null,
    marginType: num(r.vsb_margintype),
    marginPercentage: r.vsb_marginpercentage ?? null,
    marginFixedValue: r.vsb_marginfixedvalue ?? null,
    comment: r.vsb_comment ?? null,
  }));
}

/**
 * The scope's `BoP Contracts Standard Assumption DevCo Costs` — the canvas filters them on
 * `'BoP Contract Standard Assumption'.Country` / `.Technology`, i.e. the children of the scope's
 * contracts, which is what this reads.
 */
export async function listDevCoCosts(contractIds: readonly string[]): Promise<DevCoCost[]> {
  if (contractIds.length === 0) return [];
  const C = DEVCO_COST_COL;
  const batches = await Promise.all(chunk(contractIds).map((ids) =>
    fetchAll(
      "list BoP contract DevCo costs",
      (o) => Vsb_bopcontractsstandardassumptiondevcocostsesService.getAll(o),
      {
        select: [C.id, C.contract, C.capexAccount, C.rootCapexAccount],
        filter: idIn(C.contract, ids),
        orderBy: ["createdon asc"],
      },
    )));
  return batches.flat().map((r) => ({
    id: r.vsb_bopcontractsstandardassumptiondevcocostsid,
    contractId: r._vsb_bopcontractstandardassumption_value ?? null,
    capexAccountId: r._vsb_capexaccount_value ?? null,
    rootAccountId: r._vsb_rootcapexaccount_value ?? null,
  }));
}
