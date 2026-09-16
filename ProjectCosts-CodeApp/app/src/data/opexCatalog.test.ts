/**
 * `opexCatalog.ts` — the OPEX screens' reference data.
 *
 * These exist because `OpexScreen.tsx` used to carry three of these four answers as hard-coded
 * constants: `OPEX_ACCOUNTS`, `OPEX_SUBACCOUNTS` and `hasStandardAssumption: true`. Transcribed
 * master data is correct until an admin edits a row and then silently wrong with no error, and
 * a hard-coded `true` on the `Add Standard Contract` gate turned "this scope has no catalogue"
 * from a disabled button into a server failure the user saw as an inline error.
 *
 * Every fixture is the SHAPE OF THE REAL DATA, read with `pac org fetch` on 16 Sep:
 *
 *   `vsb_opexaccount`     2 rows — Operation & Maintenance (Order 1) · Other OPEX Costs (Order 2)
 *   `vsb_opexsubaccount`  9 rows — one under O&M, eight under Other OPEX in Order 1..8
 *
 * `UT-OCAT-###` is its own series.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

let rowsByLabel: Record<string, unknown[]> = {};
let queriedBy: Record<string, unknown[]> = {};

vi.mock("./client", () => ({
  fetchAll: async (label: string, _page: unknown, options: unknown) => {
    (queriedBy[label] ??= []).push(options);
    return rowsByLabel[label] ?? [];
  },
}));

const service = () => ({ getAll: async () => ({ success: true, data: [] }) });
for (const name of [
  "Vsb_opexaccountsService", "Vsb_opexsubaccountsService", "Vsb_devicetypesinprojectsService",
  "Vsb_generatortypeinprojectsService", "Vsb_generatorsService",
  "Vsb_pvmoduletypeinprojectsService", "Vsb_opexlandleasestandardassumptionsesService",
]) {
  vi.doMock(`@/generated/services/${name}`, () => ({ [name]: service() }));
}

const {
  loadOpexAccounts, loadOpexAssumptionScopes, loadOpexDeviceTypes, loadOpexSubaccounts,
} = await import("./opexCatalog");

const PROJECT = "ac3168e6-2b7c-ef11-ac20-6045bda08851";
const GERMANY = "1cf4a2b6-d2d0-ee11-9079-000d3ab6fed7";
/** The real ids, from `pac org fetch` on 16 Sep. */
const OM_ACCOUNT = "66051022-5bc6-ee11-9079-000d3aa9048f";
const OTHER_ACCOUNT = "d92acc2d-5bc6-ee11-9079-000d3ab6f27e";
const INSURANCE = "8b20edfb-20c7-ee11-9079-000d3aa9048f";
const TCMA = "7e945dd2-20c7-ee11-9079-000d3ab6f27e";

beforeEach(() => { rowsByLabel = {}; queriedBy = {}; });

describe("loadOpexAccounts", () => {
  it("UT-OCAT-001 returns the two accounts in vsb_order, whatever order they arrive in", async () => {
    // `selectedAccount` takes `First()` for O&M and `Last()` for Other OPEX — POSITIONALLY,
    // not by name — so an unsorted list puts the two rail items on the wrong accounts.
    rowsByLabel = {
      "list OPEX accounts": [
        { vsb_opexaccountid: OTHER_ACCOUNT, vsb_name: "Other OPEX Costs", vsb_order: 2 },
        { vsb_opexaccountid: OM_ACCOUNT, vsb_name: "Operation & Maintenance", vsb_order: 1 },
      ],
    };
    await expect(loadOpexAccounts()).resolves.toEqual([
      { id: OM_ACCOUNT, name: "Operation & Maintenance", order: 1 },
      { id: OTHER_ACCOUNT, name: "Other OPEX Costs", order: 2 },
    ]);
  });

  it("UT-OCAT-002 asks only for active rows", async () => {
    await loadOpexAccounts();
    expect((queriedBy["list OPEX accounts"]?.[0] as { filter: string }).filter)
      .toBe("statecode eq 0");
  });
});

describe("loadOpexSubaccounts", () => {
  const SUBS = [
    { vsb_opexsubaccountid: INSURANCE, vsb_name: "Insurance", vsb_order: 4,
      _vsb_account_value: OTHER_ACCOUNT },
    { vsb_opexsubaccountid: TCMA,
      vsb_name: "Technical Commercial Management Agreement (TCMA)", vsb_order: 1,
      _vsb_account_value: OTHER_ACCOUNT },
    { vsb_opexsubaccountid: "4d1a2ac7-60dc-ee11-904b-6045bda09578",
      vsb_name: "Operation & Maintenance", vsb_order: 1, _vsb_account_value: OM_ACCOUNT },
  ];

  it("UT-OCAT-003 resolves the ACCOUNT NAME rather than reading the lookup alias", async () => {
    /*
     * `vsb_accountname` is the FetchXML-era alias and the Web API does not return it on a plain
     * `$select` — the trap `costBook.ts` records for `vsb_currencyname`, which came back EMPTY
     * on every row. `subaccountsForMode` filters the Other-OPEX gallery on this name, so an
     * empty one hides every card.
     */
    rowsByLabel = {
      "list OPEX accounts": [
        { vsb_opexaccountid: OM_ACCOUNT, vsb_name: "Operation & Maintenance", vsb_order: 1 },
        { vsb_opexaccountid: OTHER_ACCOUNT, vsb_name: "Other OPEX Costs", vsb_order: 2 },
      ],
      "list OPEX subaccounts": SUBS,
    };
    const subaccounts = await loadOpexSubaccounts();
    expect(subaccounts.find((s) => s.id === INSURANCE)?.accountName).toBe("Other OPEX Costs");
    const select = (queriedBy["list OPEX subaccounts"]?.[0] as { select: string[] }).select;
    expect(select).toContain("_vsb_account_value");
    expect(select).not.toContain("vsb_accountname");
  });

  it("UT-OCAT-004 sorts by vsb_order, never alphabetically", async () => {
    rowsByLabel = { "list OPEX subaccounts": SUBS };
    const subaccounts = await loadOpexSubaccounts([]);
    // Order 1, 1, 4 — the two Order-1 rows belong to DIFFERENT accounts and are only ever shown
    // apart, so the name is a stable tie-break rather than a meaningful one.
    expect(subaccounts.map((s) => s.name)).toEqual([
      "Operation & Maintenance",
      "Technical Commercial Management Agreement (TCMA)",
      "Insurance",
    ]);
    // `AddColumns(…, IsFolded, true)` — the canvas collection's own extra column.
    expect(subaccounts.every((s) => s.isFolded)).toBe(true);
  });
});

describe("loadOpexDeviceTypes", () => {
  const GEN_TYPE_A = "367d82b9-0643-e55f-b768-0436342290ba";
  const GEN_TYPE_B = "1b1cb4ed-0b64-effb-b30b-6212d05ad0ff";
  const PV_TYPE = "61a30faa-b7e1-eddc-a5b5-fc1376f538f5";
  const GENERATOR_A = "a24d0c2b-ed2a-ee52-ac21-b4b2eb73e752";
  const GENERATOR_B = "3a1e4d8f-1f57-ea11-a811-000d3a4a9d21";

  beforeEach(() => {
    rowsByLabel = {
      "list generator types in project for the O&M cards": [
        { vsb_generatortypeinprojectid: GEN_TYPE_B, vsb_name: "WTG-1632",
          createdon: "2025-06-01T00:00:00Z", _vsb_generator_value: GENERATOR_B },
        { vsb_generatortypeinprojectid: GEN_TYPE_A, vsb_name: "WTG-1630",
          createdon: "2023-01-01T00:00:00Z", _vsb_generator_value: GENERATOR_A },
      ],
      "list PV module types in project for the O&M cards": [
        { vsb_pvmoduletypeinprojectid: PV_TYPE, vsb_name: "PV-1", vsb_label: "JinkoSolar 555W" },
      ],
      "list device types in project": [
        { vsb_devicetypesinprojectid: "d-b", vsb_name: "WTG-1632",
          _vsb_typeinprojectid_value: GEN_TYPE_B },
        { vsb_devicetypesinprojectid: "d-a", vsb_name: "WTG-1630",
          _vsb_typeinprojectid_value: GEN_TYPE_A },
        { vsb_devicetypesinprojectid: "d-pv", vsb_name: "PV-1",
          _vsb_typeinprojectid_value: PV_TYPE },
      ],
      "list generators for the O&M card headers": [
        { vsb_generatorid: GENERATOR_A, vsb_turbinetype: "V150-6.0", vsb_name: "Vestas V150" },
        { vsb_generatorid: GENERATOR_B, vsb_turbinetype: "N149-5.7", vsb_name: "Nordex N149" },
      ],
    };
  });

  it("UT-OCAT-005 heads each card with the Turbine Type / PV Label, not the device name", async () => {
    // `lbl_…_SubaccountName_1.Text` (`OpexCostScreenCode.txt:4800-4840`) resolves
    // `Generator.'Turbine Type'` for a WTG and the PV module type's `Label` for a PV string.
    // The device's own `vsb_name` still has to survive: `Left(Name, 3) = "WTG"` is the record
    // type test and the write layer resolves a save's group by that string.
    const [generators, pvModules] = await loadOpexDeviceTypes(PROJECT);
    expect(generators.find((d) => d.name === "WTG-1630")?.displayName).toBe("V150-6.0");
    expect(generators.find((d) => d.name === "WTG-1632")?.displayName).toBe("N149-5.7");
    expect(pvModules[0]).toMatchObject({ name: "PV-1", displayName: "JinkoSolar 555W" });
  });

  it("UT-OCAT-006 carries the GENERATOR's Created On, matched by NAME as the canvas matches it", async () => {
    // `LookUp(GeneratorTypeInProjects, Project = P && Name = DeviceItem.Name)` (`:81-87`) — by
    // NAME, not by the `TypeInProject` id the device row already carries. `deviceTypeList` sorts
    // on what this returns, so the card order depends on it.
    const [generators] = await loadOpexDeviceTypes(PROJECT);
    expect(generators.find((d) => d.name === "WTG-1630")?.createdOn)
      .toBe("2023-01-01T00:00:00Z");
    expect(generators.find((d) => d.name === "WTG-1632")?.createdOn)
      .toBe("2025-06-01T00:00:00Z");
    // A PV type has no generator and therefore no `Created On` — the canvas appends that block
    // unsorted.
    const [, pvModules] = await loadOpexDeviceTypes(PROJECT);
    expect(pvModules[0]?.createdOn).toBeNull();
  });

  it("UT-OCAT-007 falls back to the device name when the turbine type is missing", async () => {
    rowsByLabel["list generators for the O&M card headers"] = [];
    const [generators] = await loadOpexDeviceTypes(PROJECT);
    // A blank header is worse than a slightly wrong one: the card would have no title at all.
    expect(generators.every((d) => d.displayName === d.name)).toBe(true);
  });

  it("UT-OCAT-008 asks for nothing at all on a project with no device types", async () => {
    rowsByLabel = {
      "list generator types in project for the O&M cards": [],
      "list PV module types in project for the O&M cards": [],
    };
    await expect(loadOpexDeviceTypes(PROJECT)).resolves.toEqual([[], []]);
    expect(queriedBy["list device types in project"]).toBeUndefined();
  });
});

describe("loadOpexAssumptionScopes", () => {
  it("UT-OCAT-009 scopes the catalogue on country and technology, server-side", async () => {
    // `Filter('OPEX & Land Lease Standard Assumptions', Country … && Technology … &&
    // 'Type Of Contract' … [&& 'Opex Subaccount' …])` — `:650-662` / `:3038-3049`. The last two
    // clauses are the CALLER's, so one cached query answers the gate for every card on screen.
    rowsByLabel = {
      "list OPEX standard assumption scopes": [
        { vsb_opexlandleasestandardassumptionsid: "a1", vsb_typeofcontract: 952850001,
          _vsb_country_value: GERMANY, vsb_technology: 952850000 },
        { vsb_opexlandleasestandardassumptionsid: "a2", vsb_typeofcontract: 952850002,
          _vsb_country_value: GERMANY, vsb_technology: 952850000,
          _vsb_opexsubaccount_value: INSURANCE },
      ],
    };
    const scopes = await loadOpexAssumptionScopes(GERMANY, 952850000);
    expect(scopes).toEqual([
      { id: "a1", typeOfContract: 952850001, countryId: GERMANY, technology: 952850000,
        opexSubaccountId: null },
      { id: "a2", typeOfContract: 952850002, countryId: GERMANY, technology: 952850000,
        opexSubaccountId: INSURANCE },
    ]);
    const filter = (queriedBy["list OPEX standard assumption scopes"]?.[0] as { filter: string })
      .filter;
    expect(filter).toContain(`_vsb_country_value eq ${GERMANY}`);
    expect(filter).toContain("vsb_technology eq 952850000");
    expect(filter).toContain("statecode eq 0");
  });

  it("UT-OCAT-010 queries nothing when the project has no country or no technology", async () => {
    // The canvas `Filter` with a blank `gblSelectedProject.Country.Country` matches nothing, so
    // "no catalogue" is the honest answer rather than "every assumption in the org".
    await expect(loadOpexAssumptionScopes(undefined, 952850000)).resolves.toEqual([]);
    await expect(loadOpexAssumptionScopes(GERMANY, undefined)).resolves.toEqual([]);
    expect(queriedBy["list OPEX standard assumption scopes"]).toBeUndefined();
  });

  it("UT-OCAT-011 reads an option set that arrives as a string", async () => {
    // The Web API returns some option sets as numbers and some as their string form; comparing
    // `"952850001" !== 952850001` in `matchesStandardAssumption` would disable every command.
    rowsByLabel = {
      "list OPEX standard assumption scopes": [
        { vsb_opexlandleasestandardassumptionsid: "a1", vsb_typeofcontract: "952850001",
          _vsb_country_value: GERMANY, vsb_technology: "952850000" },
      ],
    };
    const scopes = await loadOpexAssumptionScopes(GERMANY, 952850000);
    expect(scopes[0]).toMatchObject({ typeOfContract: 952850001, technology: 952850000 });
  });
});
