/**
 * The OPEX screens' reference data — accounts, sub-accounts, device types, and which scopes
 * actually have a standard assumption behind them.
 *
 * WHY IT EXISTS. `features/periods/OpexScreen.tsx` carried three of these four as TRANSCRIBED
 * CONSTANTS (`OPEX_ACCOUNTS`, `OPEX_SUBACCOUNTS`, and `hasStandardAssumption: true`) because no
 * loader existed. Transcribed master data is correct exactly until an admin edits a row, and
 * then it is silently wrong with no error anywhere — the same failure mode `loadCapexCategories`
 * exists to remove for the CAPEX tab strip.
 *
 * MEASURED, VSBCloud_Dev 16 Sep — the constants were right, so this is a resilience fix and not
 * a visible one:
 *
 *   `vsb_opexaccount`      2 rows · Operation & Maintenance (Order 1, 00001)
 *                                 · Other OPEX Costs (Order 2, 00002)
 *   `vsb_opexsubaccount`   9 rows · O&M holds ONE sub-account, "Operation & Maintenance" Order 1
 *                                 · Other OPEX holds eight, Order 1..8: TCMA · Environmental and
 *                                   Compensation Meassures · Administration · Insurance · Own
 *                                   Power Consumption · Infrastructure · Municipality · Other
 *
 * ("Meassures" is the org's own spelling and is neither corrected here nor anywhere else.)
 */
import { Vsb_opexaccountsService } from "@/generated/services/Vsb_opexaccountsService";
import { Vsb_opexsubaccountsService } from "@/generated/services/Vsb_opexsubaccountsService";
import { Vsb_devicetypesinprojectsService } from "@/generated/services/Vsb_devicetypesinprojectsService";
import { Vsb_generatortypeinprojectsService } from "@/generated/services/Vsb_generatortypeinprojectsService";
import { Vsb_generatorsService } from "@/generated/services/Vsb_generatorsService";
import { Vsb_pvmoduletypeinprojectsService } from "@/generated/services/Vsb_pvmoduletypeinprojectsService";
import { Vsb_opexlandleasestandardassumptionsesService } from "@/generated/services/Vsb_opexlandleasestandardassumptionsesService";
import type {
  DeviceTypeInProject, OpexAccount, OpexSubaccount,
} from "@/features/periods/opexRules";
import { fetchAll } from "./client";
import { ACTIVE, and, chunk, eq, guid, lookupEq, lookupIn, or } from "./odata";

/** `column eq guid` for a PRIMARY KEY id list — `lookupIn` is for `_col_value` lookup columns. */
function idIn(column: string, ids: readonly string[]): string | undefined {
  if (ids.length === 0) return undefined;
  return or(...ids.map((id) => `${column} eq ${guid(id)}`));
}

/**
 * `colOpexAccounts = Sort('Opex Accounts', Order, Ascending)` (`OnStart.txt:622-629`).
 *
 * The order is the whole point: `selectedAccount` takes `First()` for O&M and `Last()` for Other
 * OPEX — positionally, not by name — so an unsorted list would put the two rail items on the
 * wrong accounts.
 */
export async function loadOpexAccounts(): Promise<OpexAccount[]> {
  const rows = await fetchAll(
    "list OPEX accounts",
    (o) => Vsb_opexaccountsService.getAll(o),
    { select: ["vsb_opexaccountid", "vsb_name", "vsb_order"], filter: ACTIVE },
  );
  return rows
    .map((r) => ({ id: r.vsb_opexaccountid, name: r.vsb_name ?? "", order: r.vsb_order ?? 0 }))
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

/**
 * `colOpexSubaccounts = AddColumns(Sort('Opex Subaccounts', Order, Ascending), IsFolded, true)`
 * (`OnStart.txt:631-640`).
 *
 * `accountName` is resolved here rather than read off `vsb_accountname`: that column is the
 * FetchXML-era lookup alias and the Web API does not return it on a plain `$select` — the same
 * trap `costBook.ts`'s header records for `vsb_currencyname`, which came back empty on every
 * row. `subaccountsForMode` filters the Other-OPEX gallery on this name.
 */
export async function loadOpexSubaccounts(
  accounts?: readonly OpexAccount[],
): Promise<OpexSubaccount[]> {
  const [rows, accountList] = await Promise.all([
    fetchAll(
      "list OPEX subaccounts",
      (o) => Vsb_opexsubaccountsService.getAll(o),
      {
        select: ["vsb_opexsubaccountid", "vsb_name", "vsb_order", "_vsb_account_value"],
        filter: ACTIVE,
      },
    ),
    accounts ? Promise.resolve(accounts) : loadOpexAccounts(),
  ]);
  const accountName = new Map(accountList.map((a) => [a.id, a.name]));
  return rows
    .map((r) => ({
      id: r.vsb_opexsubaccountid,
      name: r.vsb_name ?? "",
      order: r.vsb_order ?? 0,
      accountId: r._vsb_account_value ?? null,
      accountName: accountName.get(r._vsb_account_value ?? "") ?? null,
      // `AddColumns(…, IsFolded, true)` — every card starts collapsed in the canvas collection.
      isFolded: true,
    }))
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

/* ═══════════════════════════════════════════════════════════ device types ══ */

/**
 * `colDeviceTypesInProject` (`OpexCostScreenCode.txt:68-109`) — the O&M cards.
 *
 * Two `Collect`s into one collection:
 *
 *   1. `Filter(DeviceTypesInProjects, AsType(TypeInProject, GeneratorTypeInProjects).Project = P)`
 *      with `CreatedOnGenerator = LookUp(GeneratorTypeInProjects, Project = P && Name =
 *      DeviceItem.Name)`, **sorted by `CreatedOnGenerator.'Created On'` ascending**;
 *   2. `Filter(DeviceTypesInProjects, AsType(TypeInProject, PVModuleTypeInProjects).Project = P)`,
 *      appended in its natural order.
 *
 * Note the join in step 1: the canvas matches the generator type BY NAME, not by the
 * `TypeInProject` id it already has — reproduced here, because a project with two generator
 * types whose names collide would order differently otherwise. `deviceTypeList` in `opexRules`
 * owns the sort itself; this only has to supply `createdOn`.
 *
 * `displayName` is what the CARD HEADER renders (`lbl_…_SubaccountName_1.Text`, `:4800-4840`):
 * the PV module type's `Label`, or the generator type's `Generator.'Turbine Type'` — NOT the
 * device row's `vsb_name`. The device's own `name` is kept because three other rules read it:
 * `addPeriodRecordType` (`Left(Name, 3) = "WTG"`), the cost book's grouping, and the write
 * layer's `resolveDeviceType`.
 */
export type OpexDeviceType = Omit<DeviceTypeInProject, "kind" | "isFolded">;

export async function loadOpexDeviceTypes(
  projectId: string,
): Promise<[OpexDeviceType[], OpexDeviceType[]]> {
  const [generatorTypes, pvTypes] = await Promise.all([
    fetchAll(
      "list generator types in project for the O&M cards",
      (o) => Vsb_generatortypeinprojectsService.getAll(o),
      {
        select: [
          "vsb_generatortypeinprojectid", "vsb_name", "createdon", "_vsb_generator_value",
        ],
        filter: and(lookupEq("vsb_project", projectId), ACTIVE),
      },
    ),
    fetchAll(
      "list PV module types in project for the O&M cards",
      (o) => Vsb_pvmoduletypeinprojectsService.getAll(o),
      {
        select: ["vsb_pvmoduletypeinprojectid", "vsb_name", "vsb_label"],
        filter: and(lookupEq("vsb_project", projectId), ACTIVE),
      },
    ),
  ]);

  const generatorTypeIds = new Set(generatorTypes.map((g) => g.vsb_generatortypeinprojectid));
  const pvTypeIds = new Set(pvTypes.map((p) => p.vsb_pvmoduletypeinprojectid));
  const typeIds = [...generatorTypeIds, ...pvTypeIds];
  if (typeIds.length === 0) return [[], []];

  const generatorIds = [...new Set(
    generatorTypes.map((g) => g._vsb_generator_value).filter((v): v is string => Boolean(v)),
  )];

  const [deviceBatches, turbineTypeBatches] = await Promise.all([
    Promise.all(chunk(typeIds).map((ids) => fetchAll(
      "list device types in project",
      (o) => Vsb_devicetypesinprojectsService.getAll(o),
      {
        select: ["vsb_devicetypesinprojectid", "vsb_name", "_vsb_typeinprojectid_value"],
        filter: lookupIn("vsb_typeinprojectid", ids),
      },
    ))),
    generatorIds.length === 0 ? Promise.resolve([]) : Promise.all(
      chunk(generatorIds).map((ids) => fetchAll(
        "list generators for the O&M card headers",
        (o) => Vsb_generatorsService.getAll(o),
        {
          select: ["vsb_generatorid", "vsb_turbinetype", "vsb_name"],
          filter: idIn("vsb_generatorid", ids),
        },
      )),
    ),
  ]);

  const turbineType = new Map(
    turbineTypeBatches.flat().map((g) => [g.vsb_generatorid, g.vsb_turbinetype ?? g.vsb_name ?? ""]),
  );
  /** `LookUp(GeneratorTypeInProjects, Project = P && Name = DeviceItem.Name)` — BY NAME. */
  const generatorTypeByName = new Map(generatorTypes.map((g) => [g.vsb_name ?? "", g]));
  const generatorTypeById = new Map(
    generatorTypes.map((g) => [g.vsb_generatortypeinprojectid, g]),
  );
  const pvLabelById = new Map(
    pvTypes.map((p) => [p.vsb_pvmoduletypeinprojectid, p.vsb_label || p.vsb_name || ""]),
  );

  const generators: OpexDeviceType[] = [];
  const pvModules: OpexDeviceType[] = [];
  for (const d of deviceBatches.flat()) {
    const typeId = d._vsb_typeinprojectid_value ?? "";
    const name = d.vsb_name ?? "";
    if (generatorTypeIds.has(typeId)) {
      const byId = generatorTypeById.get(typeId);
      const byName = generatorTypeByName.get(name);
      generators.push({
        id: d.vsb_devicetypesinprojectid,
        name,
        typeInProjectId: typeId || null,
        createdOn: byName?.createdon ?? null,
        displayName: turbineType.get(byId?._vsb_generator_value ?? "") || name,
      });
    } else if (pvTypeIds.has(typeId)) {
      pvModules.push({
        id: d.vsb_devicetypesinprojectid,
        name,
        typeInProjectId: typeId || null,
        createdOn: null,
        displayName: pvLabelById.get(typeId) || name,
      });
    }
  }
  return [generators, pvModules];
}

/* ═══════════════════════════════════════════ standard-assumption existence ══ */

/**
 * One `vsb_opexlandleasestandardassumptionses` row, reduced to the four columns
 * `matchesStandardAssumption` (`opexRules.ts`) compares.
 *
 * `hasStandardAssumption` on the card toolbar was hard-coded `true`, so `Add Standard Contract`
 * was offered on every empty card and a scope with no catalogue failed at the server with an
 * inline error instead of arriving disabled — which is not what
 * `Filter('OPEX & Land Lease Standard Assumptions', Country && Technology && 'Type Of Contract'
 * [&& 'Opex Subaccount'])` does (`:650-662` Other OPEX, `:3038-3049` O&M).
 */
export interface OpexAssumptionScope {
  id: string;
  typeOfContract: number | null;
  countryId: string | null;
  technology: number | null;
  opexSubaccountId: string | null;
}

/**
 * The OPEX standard-assumption catalogue for a country and technology, both contract types.
 *
 * Scoped server-side on country and technology — the two clauses that narrow it most — and left
 * to the caller to test `typeOfContract` and `opexSubaccountId` with `matchesStandardAssumption`,
 * so ONE cached query answers the gate for every card on the screen instead of one per card.
 *
 * Returns `[]` when the project has no country or no technology, which is what the canvas'
 * `Filter` degenerates to: with a blank `gblSelectedProject.Country.Country` nothing matches.
 */
export async function loadOpexAssumptionScopes(
  countryId: string | undefined,
  technology: number | undefined,
): Promise<OpexAssumptionScope[]> {
  if (!countryId || technology === undefined) return [];
  const rows = await fetchAll(
    "list OPEX standard assumption scopes",
    (o) => Vsb_opexlandleasestandardassumptionsesService.getAll(o),
    {
      select: [
        "vsb_opexlandleasestandardassumptionsid", "vsb_typeofcontract",
        "_vsb_country_value", "vsb_technology", "_vsb_opexsubaccount_value",
      ],
      filter: and(
        lookupEq("vsb_country", countryId),
        eq("vsb_technology", technology),
        ACTIVE,
      ),
    },
  );
  const asNumber = (value: unknown): number | null => {
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (typeof value === "string" && value.trim() !== "") {
      const n = Number(value);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  };
  return rows.map((r) => ({
    id: r.vsb_opexlandleasestandardassumptionsid,
    typeOfContract: asNumber(r.vsb_typeofcontract),
    countryId: r._vsb_country_value ?? null,
    technology: asNumber(r.vsb_technology),
    opexSubaccountId: r._vsb_opexsubaccount_value ?? null,
  }));
}
