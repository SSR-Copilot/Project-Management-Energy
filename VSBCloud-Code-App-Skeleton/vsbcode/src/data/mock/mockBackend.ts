/**
 * In-memory Dataverse stand-in.
 *
 * Exists so the app runs, demos and is testable with no environment attached
 * (`VITE_DATA_MODE=mock`). It speaks enough OData to serve `$select`, `$filter`,
 * `$orderby`, `$top`, `$skip` and `$count`, so the screens exercise the same code paths
 * they will against real Dataverse.
 *
 * NOT supported, deliberately: `$expand` (so filter and sort must use lookup GUIDs, never
 * related-entity names) and `$skiptoken`/`@odata.nextLink` (the live path only uses tokens
 * under `all: true`, which the paged screens never set). Semantics are pinned by
 * `mockBackend.test.ts` — read it before changing `evalFilter` or the sort.
 *
 * The fixture data is INVENTED sample data for a demo. It is not VSB's data.
 */
import { ES, CHOICE, CHOICE_PROCESS } from "../entities";
import {
  buildAppendedProjects,
  COUNTRY_AREAS,
  ENTRA_IDS,
  PROJECT_STATES,
} from "./projectSeed";
import { buildAutoFixture } from "./autoFixture";

type Row = Record<string, unknown>;

/**
 * `vsb_technology` is an option set in real Dataverse (`952850000` Wind, `952850001` PV) but
 * the original fixture stored the label string. The portfolio grid filters this column
 * server-side, and `vsb_technology eq 'Wind'` is a 400 against live Dataverse, so new rows
 * carry the integer.
 *
 * This predicate accepts both. It matters more than it looks: the child-fixture loop gates
 * generator, turbine, energy-yield and revenue generation on it, and no test covers the mock,
 * so a strict comparison here would silently empty the Generators, Production, Finance and
 * Revenues screens.
 */
const isWindTech = (v: unknown): boolean =>
  v === CHOICE_PROCESS.technology.wind || v === "Wind";

const uuid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `id-${Math.random().toString(36).slice(2)}`;

const COUNTRIES = [
  { vsb_countryid: "c-de", vsb_name: "Germany", vsb_code: "DE", vsb_lastprojectid: 1042 },
  { vsb_countryid: "c-fr", vsb_name: "France", vsb_code: "FR", vsb_lastprojectid: 318 },
  { vsb_countryid: "c-pl", vsb_name: "Poland", vsb_code: "PL", vsb_lastprojectid: 204 },
  { vsb_countryid: "c-it", vsb_name: "Italy", vsb_code: "IT", vsb_lastprojectid: 96 },
  { vsb_countryid: "c-fi", vsb_name: "Finland", vsb_code: "FI", vsb_lastprojectid: 47 },
];

/**
 * The row ids are unchanged — the legacy project seeds reference them by id — but the labels
 * are now the ones the real app shows: `Draft` plus `Cluster 1`-`Cluster 6`. The previous
 * invented labels (`Development`, `Permitting`, `Ready to Build`, …) appear nowhere in the
 * canvas app and had no colour in `theme/tokens.ts::stateColor`, so nothing depended on them.
 * `Draft` is load-bearing — several screens' page-lock rules compare against it by name.
 */
const CLUSTER_STATES = [
  { vsb_clusterstateid: "cs-draft", vsb_name: "Draft", vsb_order: 0 },
  { vsb_clusterstateid: "cs-dev", vsb_name: "Cluster 1", vsb_order: 1 },
  { vsb_clusterstateid: "cs-permit", vsb_name: "Cluster 2", vsb_order: 2 },
  { vsb_clusterstateid: "cs-rtb", vsb_name: "Cluster 3", vsb_order: 3 },
  { vsb_clusterstateid: "cs-constr", vsb_name: "Cluster 4", vsb_order: 4 },
  { vsb_clusterstateid: "cs-ops", vsb_name: "Cluster 5", vsb_order: 5 },
  { vsb_clusterstateid: "cs-c6", vsb_name: "Cluster 6", vsb_order: 6 },
];

interface Seed {
  name: string; num: string; tech: string; country: string; cluster: string;
  cap: number; wtgCap: number; wtgCost: number; yield: number | null;
  start: string | null; fid: string | null; cod: string | null; muni: string;
}

const SEEDS: Seed[] = [
  { name: "Windpark Hohenstein", num: "DE-1021", tech: "Wind", country: "c-de", cluster: "cs-constr", cap: 42.5, wtgCap: 42.5, wtgCost: 38_250_000, yield: 112_400, start: "2024-03-01", fid: "2025-11-01", cod: "2027-06-30", muni: "Hohenstein" },
  { name: "Solarpark Lausitz II", num: "DE-1024", tech: "PV", country: "c-de", cluster: "cs-rtb", cap: 88.0, wtgCap: 0, wtgCost: 0, yield: 96_800, start: "2024-09-15", fid: "2026-02-01", cod: "2027-12-01", muni: "Cottbus" },
  { name: "Parc éolien de Beauce", num: "FR-0312", tech: "Wind", country: "c-fr", cluster: "cs-permit", cap: 24.0, wtgCap: 24.0, wtgCost: 21_600_000, yield: 61_200, start: "2025-01-20", fid: null, cod: "2028-03-31", muni: "Chartres" },
  { name: "Wind Pomorskie", num: "PL-0198", tech: "Wind", country: "c-pl", cluster: "cs-dev", cap: 60.0, wtgCap: 60.0, wtgCost: 51_000_000, yield: 158_000, start: "2025-04-02", fid: null, cod: "2029-01-31", muni: "Gdańsk" },
  { name: "Parco Solare Puglia", num: "IT-0091", tech: "PV", country: "c-it", cluster: "cs-dev", cap: 35.4, wtgCap: 0, wtgCost: 0, yield: 54_900, start: "2025-06-11", fid: null, cod: "2028-09-30", muni: "Foggia" },
  { name: "Tuulipuisto Ostrobothnia", num: "FI-0044", tech: "Wind", country: "c-fi", cluster: "cs-permit", cap: 108.0, wtgCap: 108.0, wtgCost: 97_200_000, yield: 342_000, start: "2024-11-04", fid: null, cod: "2029-06-30", muni: "Vaasa" },
  { name: "Windpark Altmark Nord", num: "DE-1031", tech: "Wind", country: "c-de", cluster: "cs-ops", cap: 30.0, wtgCap: 30.0, wtgCost: 26_400_000, yield: 78_300, start: "2021-05-10", fid: "2022-08-01", cod: "2024-04-30", muni: "Salzwedel" },
  { name: "Hybridpark Sachsen", num: "DE-1035", tech: "Wind", country: "c-de", cluster: "cs-draft", cap: 0, wtgCap: 0, wtgCost: 0, yield: null, start: null, fid: null, cod: null, muni: "Meißen" },
  { name: "Solarpark Nièvre", num: "FR-0316", tech: "PV", country: "c-fr", cluster: "cs-draft", cap: 0, wtgCap: 0, wtgCost: 0, yield: null, start: null, fid: null, cod: null, muni: "Nevers" },
  { name: "Wind Wielkopolska", num: "PL-0203", tech: "Wind", country: "c-pl", cluster: "cs-rtb", cap: 45.6, wtgCap: 45.6, wtgCost: 40_128_000, yield: 121_500, start: "2023-08-21", fid: "2025-05-15", cod: "2027-03-31", muni: "Poznań" },
];

function buildProjects(): Row[] {
  return SEEDS.map((s, i) => ({
    vsb_projectid: `p-${String(i + 1).padStart(3, "0")}`,
    // 'Project Name'; `vsb_name` is the auto-numbered primary column.
    vsb_projectname: s.name,
    vsb_name: s.num,
    vsb_internalprojectid: s.num,
    // The option-set integer, not the label: `vsb_technology` is a picklist in real
    // Dataverse, and the portfolio grid filters it server-side, where
    // `vsb_technology eq 'Wind'` would be a 400. The label rides along as the
    // FormattedValue sibling, exactly as the service returns it.
    vsb_technology: s.tech === "Wind" ? CHOICE_PROCESS.technology.wind : CHOICE_PROCESS.technology.pv,
    "vsb_technology@OData.Community.Display.V1.FormattedValue": s.tech,
    vsb_totalcapacity: s.cap,
    vsb_plantwtgcapacity: s.wtgCap,
    vsb_plantwtgcost: s.wtgCost,
    vsb_projectstartdate: s.start,
    vsb_netyieldp50: s.yield,
    vsb_finalinvestmentdecision: s.fid,
    vsb_operationsstartdatecod: s.cod,
    vsb_municipality: s.muni,
    vsb_latitude: 51 + i * 0.3,
    vsb_longitude: 10 + i * 0.4,
    vsb_financingoptions: "Debt Financing",
    // The plant/production screens read the project's end date and the human-readable
    // Project ID under these logical names.
    vsb_enddate: s.cod
      ? new Date(new Date(s.cod).setFullYear(new Date(s.cod).getFullYear() + 25))
          .toISOString().slice(0, 10)
      : null,
    vsb_projectid_text: s.num,
    vsb_projectidtext: s.num,
    // Columns the portfolio grid projects. The legacy seeds predate them, so they get
    // plausible values rather than being left undefined and rendering as blank cells.
    vsb_shortname: s.num.replace("-", ""),
    vsb_weightedmw: +(s.cap * 0.92).toFixed(2),
    vsb_approvalstates: s.cap > 0 ? CHOICE.approvalState.approved : CHOICE.approvalState.notStarted,
    "vsb_approvalstates@OData.Community.Display.V1.FormattedValue":
      s.cap > 0 ? "Approved" : "Draft",
    vsb_sposharepointurl: null,
    vsb_spoteamsurl: null,
    _vsb_country_value: s.country,
    "_vsb_country_value@OData.Community.Display.V1.FormattedValue":
      COUNTRIES.find((c) => c.vsb_countryid === s.country)?.vsb_name ?? "",
    _vsb_clusterstate_value: s.cluster,
    "_vsb_clusterstate_value@OData.Community.Display.V1.FormattedValue":
      CLUSTER_STATES.find((c) => c.vsb_clusterstateid === s.cluster)?.vsb_name ?? "",
    _vsb_projectmanager_value: "u-1",
    _owningbusinessunit_value: `bu-${s.country}`,
    statecode: CHOICE.statecode.active,
    createdon: "2024-01-15T09:00:00Z",
    // Built from a Date, not string-templated. The previous form
    // `2026-0${(i % 8) + 1}-12T…` emitted the invalid literal `2026-010-12T…` from index 9
    // onward — latent while SEEDS held ten rows, a hard break the moment it grew.
    modifiedon: new Date(Date.UTC(2026, i % 12, 12, 14, 32)).toISOString(),
  }));
}

const WTG_TYPES = [
  { n: "Vestas V162-6.2", cap: 6.2, hub: 169, rotor: 162, mk: "Vestas" },
  { n: "Nordex N163/6.X", cap: 6.8, hub: 164, rotor: 163, mk: "Nordex" },
  { n: "Enercon E-160 EP5", cap: 5.56, hub: 166, rotor: 160, mk: "Enercon" },
  { n: "Siemens Gamesa SG 6.6-170", cap: 6.6, hub: 165, rotor: 170, mk: "Siemens Gamesa" },
  { n: "GE Cypress 6.0-164", cap: 6.0, hub: 161, rotor: 164, mk: "GE Vernova" },
];

const CAPEX_ACCOUNTS = [
  { code: "1000", name: "WTG supply", parent: null },
  { code: "1100", name: "WTG transport", parent: "1000" },
  { code: "1200", name: "WTG erection", parent: "1000" },
  { code: "2000", name: "Balance of plant", parent: null },
  { code: "2100", name: "Foundations", parent: "2000" },
  { code: "2200", name: "Internal roads", parent: "2000" },
  { code: "2300", name: "Cabling", parent: "2000" },
  { code: "3000", name: "Grid connection", parent: null },
  { code: "4000", name: "Development costs", parent: null },
  { code: "5000", name: "Other OPEX Costs", parent: null },
];

function seedDb(): Record<string, Row[]> {
  // The ten hand-authored seeds stay at the head of the table: the child-fixture loop below
  // keys generator, turbine, energy-yield and revenue rows to `SEEDS` by index. Everything
  // after them is the portfolio fixture, bringing the table to 1,127 rows so the grid's
  // footer and pager have something real to page through.
  const legacyProjects = buildProjects();
  const projects = [...legacyProjects, ...buildAppendedProjects(legacyProjects.length)];
  const db: Record<string, Row[]> = {
    [ES.projects]: projects,
    [ES.countries]: COUNTRIES as Row[],
    [ES.clusterStates]: CLUSTER_STATES as Row[],
    // Three reference tables that were declared but never seeded, so every dropdown built on
    // them rendered empty in mock mode.
    [ES.countryAreas]: COUNTRY_AREAS as Row[],
    [ES.projectStates]: PROJECT_STATES as Row[],
    [ES.microsoftEntraIds]: ENTRA_IDS as Row[],
    [ES.generatorTypes]: WTG_TYPES.map((t, i) => ({
      vsb_generatortypeid: `gt-${i}`,
      vsb_name: t.n,
      vsb_shortname: t.n.split(" ")[0],
      vsb_ratedcapacitymw: t.cap,
      vsb_hubheightm: t.hub,
      vsb_rotordiameterm: t.rotor,
      vsb_manufacturer: t.mk,
      vsb_earliestphaseout: "2032-12-31",
      vsb_isavailable: true,
      vsb_price1wtg: t.cap * 1_150_000,
      vsb_price2wtg: t.cap * 1_105_000,
      vsb_price3wtg: t.cap * 1_070_000,
      vsb_price4wtg: t.cap * 1_045_000,
      vsb_price5wtg: t.cap * 1_020_000,
      statecode: 0,
    })),
    [ES.capexAccountLists]: CAPEX_ACCOUNTS.map((a, i) => ({
      vsb_capexaccountlistid: `ca-${i}`,
      vsb_accountcode: a.code,
      vsb_name: a.name,
      vsb_parentcode: a.parent,
      vsb_order: i + 1,
      statecode: 0,
    })),
    [ES.milestones]: [
      "Project start", "Land secured", "Permit application", "Permit granted",
      "FID", "Notice to proceed", "Turbine delivery", "Commissioning", "COD",
    ].map((m, i) => ({
      vsb_milestoneid: `ms-${i}`, vsb_name: m, vsb_order: i + 1, statecode: 0,
    })),
    [ES.contractTypes]: ["Capex BoP", "Opex O&M", "Opex Other", "Land Lease"].map((n, i) => ({
      vsb_contracttypeid: `ct-${i}`, vsb_name: n, statecode: 0,
    })),
    [ES.users]: [
      {
        systemuserid: "u-1", fullname: "Demo User",
        internalemailaddress: "demo.user@vsb.energy",
        azureactivedirectoryobjectid: "11111111-1111-1111-1111-111111111111",
        jobtitle: "Project Manager",
      },
    ],
  };

  // per-project children
  db[ES.generatorTypeInProjects] = [];
  db[ES.generatorInProjects] = [];
  db[ES.energyYields] = [];
  db[ES.capexCosts] = [];
  db[ES.opexProjectCosts] = [];
  db[ES.projectChecklists] = [];
  db[ES.projectStateTrackings] = [];
  db[ES.projectMembers] = [];
  db[ES.financingInputs] = [];
  db[ES.projectRevenues] = [];
  db[ES.gridOperators] = [];
  db[ES.projectPlannings] = [];
  db[ES.landLeaseProjectCosts] = [];
  db[ES.capexProjectContracts] = [];

  projects.forEach((p, pi) => {
    const s = SEEDS[pi];
    // The child fixtures (generator types, turbines, yields, revenues, …) are keyed to the
    // hand-authored SEEDS by index. The projects table is larger than SEEDS — the portfolio
    // grid needs ~1,127 rows — so anything past the seeded prefix simply has no children.
    // Without this guard `s.tech` below throws for every generated row.
    if (!s) return;
    const pid = p.vsb_projectid as string;
    const isWind = isWindTech(p.vsb_technology);
    if (isWind && (p.vsb_plantwtgcapacity as number) > 0) {
      const t = WTG_TYPES[pi % WTG_TYPES.length];
      const count = Math.max(1, Math.round((p.vsb_plantwtgcapacity as number) / t.cap));
      const costPerWtg = t.cap * 1_020_000;
      db[ES.generatorTypeInProjects].push({
        vsb_generatortypeinprojectid: `gtp-${pi}`,
        vsb_name: t.n,
        _vsb_project_value: pid,
        // both spellings: the hand-written repo uses _vsb_generatortype_value, the
        // metadata-corrected one uses _vsb_generator_value
        _vsb_generatortype_value: `gt-${pi % WTG_TYPES.length}`,
        _vsb_generator_value: `gt-${pi % WTG_TYPES.length}`,
        "_vsb_generatortype_value@OData.Community.Display.V1.FormattedValue": t.n,
        "_vsb_generator_value@OData.Community.Display.V1.FormattedValue": t.n,
        vsb_count: count,
        vsb_numberofgenerators: count,
        vsb_ratedcapacitymw: t.cap,
        vsb_totalcapacitymw: +(t.cap * count).toFixed(2),
        vsb_generatorscapacity: +(t.cap * count).toFixed(2),
        vsb_costpergeneratoreur: costPerWtg,
        vsb_costperwtg: costPerWtg,
        vsb_totalcosteur: Math.round(costPerWtg * count),
        vsb_generatorscost: Math.round(costPerWtg * count),
        vsb_hubheightm: t.hub,
        vsb_permissionstate: null,
        vsb_requestpermissionstate: null,
        _owningbusinessunit_value: `bu-${s.country}`,
        statecode: 0,
      });
      for (let k = 1; k <= count; k++) {
        db[ES.generatorInProjects].push({
          vsb_generatorinprojectid: `gip-${pi}-${k}`,
          _vsb_project_value: pid,
          vsb_name: `WTG ${t.n.split(" ")[0]}_${k}`,
          _vsb_generatortypeinproject_value: `gtp-${pi}`,
          _vsb_moduletypeinprojectid_value: `gtp-${pi}`,
          vsb_effectivecapacity: t.cap,
          vsb_effectivehubheight: t.hub,
          vsb_effectivehubheightchanged: false,
          vsb_foundationplinthm: 2.5,
          vsb_hubheightexclfoundationplinthm: t.hub - 2.5,
          vsb_totalheight: +(t.hub + t.rotor / 2).toFixed(1),
          vsb_latitude: 51 + pi * 0.3 + k * 0.004,
          vsb_longitude: 10 + pi * 0.4 + k * 0.004,
          _owningbusinessunit_value: `bu-${s.country}`,
          statecode: 0,
        });
      }
    }
    if (p.vsb_netyieldp50) {
      const p50 = p.vsb_netyieldp50 as number;
      const p75v = Math.round(p50 * (1 - 0.674490 * 0.11));
      const p90v = Math.round(p50 * (1 - 1.281551 * 0.11));
      db[ES.energyYields].push({
        vsb_energyyieldid: `ey-${pi}`,
        _vsb_project_value: pid,
        vsb_name: `${p.vsb_internalprojectid} EYA rev.C`,
        vsb_description: "Independent energy yield assessment, revision C",
        vsb_type: s.tech === "Wind" ? 952850000 : 952850001,
        vsb_energyyieldassessment: "TÜV SÜD",
        vsb_allocation: 100,
        vsb_productionallocation: 100,
        vsb_windspeedathubheight: s.tech === "Wind" ? 6.9 : null,
        vsb_irradiationkwhkwp: s.tech === "PV" ? 1180 : null,
        vsb_grossyieldmwh: Math.round(p50 * 1.14),
        vsb_totallosses: 12.3,
        vsb_productionlossesp50: 12.3,
        vsb_netyieldp50: p50,
        vsb_netyieldp50mwh: p50,
        vsb_uncertainty: 0.11,
        vsb_productionuncertaintyp75andp90: 0.11,
        vsb_netyieldp75: p75v,
        vsb_netyieldp75mwh: p75v,
        vsb_netyieldp90: p90v,
        vsb_netyieldp90mwh: p90v,
        vsb_considerseasonality: false,
        vsb_isactive: true,
        vsb_assessor: "TÜV SÜD",
        vsb_assessmentdate: "2025-09-18",
        _owningbusinessunit_value: `bu-${s.country}`,
        statecode: 0,
      });
    }
    CAPEX_ACCOUNTS.forEach((a, ai) => {
      if (a.parent === null) return;
      db[ES.capexCosts].push({
        vsb_capexcostid: `cc-${pi}-${ai}`,
        _vsb_project_value: pid,
        _vsb_capexaccount_value: `ca-${ai}`,
        "_vsb_capexaccount_value@OData.Community.Display.V1.FormattedValue": a.name,
        vsb_accountcode: a.code,
        vsb_year: 2026 + (ai % 3),
        vsb_amounteur: Math.round(250_000 + ai * 137_500 + pi * 41_000),
        vsb_isstandardassumption: ai % 2 === 0,
        vsb_distributionfrequency: [1, 3, 6, 12][ai % 4],
        statecode: 0,
      });
    });
    ["Operation & Maintenance", "Other OPEX Costs"].forEach((acct, ai) => {
      db[ES.opexProjectCosts].push({
        vsb_opexprojectcostid: `op-${pi}-${ai}`,
        _vsb_project_value: pid,
        _vsb_subaccount_value: `osa-${ai}`,
        "_vsb_subaccount_value@OData.Community.Display.V1.FormattedValue": acct,
        vsb_name: acct,
        vsb_description: acct,
        vsb_accountname: acct,
        vsb_startdate: p.vsb_operationsstartdatecod,
        vsb_opexprojectdurationyears: 20,
        vsb_opexprojectdurationmonths: 0,
        vsb_fixcosts: Math.round(48_000 + ai * 21_000 + pi * 3_400),
        vsb_amounteurperyear: Math.round(48_000 + ai * 21_000 + pi * 3_400),
        vsb_ofrevenues: null,
        vsb_eurmw: null, vsb_eurmwh: null, vsb_eurwtg: null,
        vsb_useinflationprofile: true,
        vsb_usecountryinflationprofile: false,
        vsb_escalationpercent: 1.8,
        vsb_isstandardassumption: true,
        _owningbusinessunit_value: `bu-${s.country}`,
        statecode: 0,
      });
    });
    ["Land secured", "Permit application", "Permit granted", "FID"].forEach((m, mi) => {
      const done = mi < 2;
      db[ES.projectChecklists].push({
        vsb_projectchecklistid: `pc-${pi}-${mi}`,
        _vsb_project_value: pid,
        _vsb_clusterstate_value: s.cluster,
        "_vsb_clusterstate_value@OData.Community.Display.V1.FormattedValue":
          CLUSTER_STATES.find((c) => c.vsb_clusterstateid === s.cluster)?.vsb_name ?? "",
        vsb_name: `${m} evidence pack`,
        vsb_holdingtaskdescription: `${m} evidence pack`,
        vsb_gaterelevance: done,
        vsb_gatemeetingcompleted: done,
        vsb_approvalcheckliststate: done ? 952850002 : 952850000,
        vsb_approvalstepstatecode: done ? 952850002 : 952850000,
        vsb_taskstate: done ? 952850003 : 952850000,
        vsb_approvalstate: done ? CHOICE.approvalState.approved : CHOICE.approvalState.notStarted,
        vsb_approvalcomment: "",
        vsb_approvalduedate: null,
        vsb_comments: "",
        vsb_completiondate: done ? "2026-04-02" : null,
        vsb_iscompletiondate: done,
        vsb_order: mi + 1,
        _owningbusinessunit_value: `bu-${s.country}`,
        statecode: 0,
      });
    });
    const operator = ["50Hertz", "TenneT", "Amprion", "RTE", "PSE"][pi % 5];
    db[ES.gridOperators].push({
      vsb_gridoperatorid: `go-${pi}`,
      _vsb_project_value: pid,
      _vsb_projectid_value: pid,
      vsb_name: operator,
      vsb_operator: operator,
      vsb_voltagelevel: [110, 220, 380][pi % 3],
      vsb_connectionvoltagekv: [110, 220, 380][pi % 3],
      vsb_expansionrequired: pi % 3 === 0,
      vsb_gridexpansionrequired: pi % 3 === 0,
      vsb_expansiondetails: pi % 3 === 0 ? "New 110 kV bay required at the substation." : "",
      vsb_substationconstructionrequired: pi % 2 === 0,
      vsb_substationoperator: operator,
      vsb_lengthinternalcabeling: 4.2 + pi * 0.3,
      vsb_diameterinternalcabeling: 1.5,
      vsb_lengthexternalcabeling: 11.8 + pi * 0.6,
      vsb_diameterexternalcabeling: 2.5,
      vsb_connectionpoint: `SS-${100 + pi}`,
      vsb_applicationdate: "2025-02-11",
      _owningbusinessunit_value: `bu-${s.country}`,
      statecode: 0,
    });
    db[ES.financingInputs].push(
      ...["Senior debt", "Equity", "VAT facility", "DSRA", "Decommissioning"].map((n, fi) => ({
        vsb_financinginputid: `fi-${pi}-${fi}`,
        _vsb_project_value: pid,
        _vsb_financingcategory_value: `fc-${fi}`,
        "_vsb_financingcategory_value@OData.Community.Display.V1.FormattedValue": n,
        vsb_name: n,
        vsb_uniquekeystring: `${n}|${pi}`,
        vsb_isfolded: false,
        vsb_amounteur: Math.round((p.vsb_plantwtgcost as number) * [0.7, 0.3, 0.05, 0.02, 0.01][fi]),
        vsb_freeequity: fi === 1,
        vsb_freeequityvalue: fi === 1 ? Math.round((p.vsb_plantwtgcost as number) * 0.3) : null,
        vsb_shareholderloanvalue: null,
        vsb_baserate: [2.45, 0, 2.45, 0, 0][fi],
        vsb_bankmargin: [1.85, 0, 1.2, 0, 0][fi],
        vsb_marginpercent: [1.85, 0, 1.2, 0, 0][fi],
        vsb_vatfacilityamount: fi === 2,
        vsb_vatfacilityamountvalue: fi === 2 ? 4_200_000 : null,
        vsb_isdeactivatedbybutton: false,
        vsb_tranchestatus: 952850000,
        vsb_bank: fi === 0 ? "KfW IPEX-Bank" : "",
        vsb_otherbankname: "",
        vsb_kfwtranche: fi === 0,
        vsb_tenoryears: [18, 0, 2, 0, 25][fi],
        vsb_isstandardassumption: true,
        _owningbusinessunit_value: `bu-${s.country}`,
        statecode: 0,
      })),
    );
    db[ES.projectRevenues].push({
      vsb_projectrevenueid: `pr-${pi}`,
      _vsb_project_value: pid,
      vsb_name: isWind ? "EEG Feed-in Tariff" : "Corporate PPA",
      vsb_description: isWind ? "EEG Feed-in Tariff" : "Corporate PPA",
      vsb_label: isWind ? "EEG" : "PPA",
      vsb_revenuetype: isWind ? "EEG Feed-in Tariff" : "PPA",
      vsb_tariffprice: isWind ? 73.5 : 58.2,
      vsb_tariffpricep90: isWind ? 71.2 : 56.4,
      vsb_biddingprice: isWind ? 68.9 : null,
      vsb_correctionfactor: isWind ? 1.0672 : null,
      vsb_correctionfactorp90: isWind ? 1.0512 : null,
      vsb_sitequality: isWind ? 82.4 : null,
      vsb_sitequalityp90: isWind ? 79.8 : null,
      vsb_priceeurpermwh: isWind ? 73.5 : 58.2,
      vsb_contractstartdate: p.vsb_operationsstartdatecod,
      vsb_contractdurationyears: 20,
      vsb_contractdurationmonths: 0,
      vsb_durationyears: 20,
      vsb_inflationpercent: 1.9,
      vsb_isstandardassumption: true,
      vsb_hedgingmode: "None",
      _owningbusinessunit_value: `bu-${s.country}`,
      statecode: 0,
    });
    db[ES.projectMembers].push({
      vsb_projectmemberid: `pm-${pi}`,
      _vsb_project_value: pid,
      _vsb_user_value: "u-1",
      _vsb_member_value: "u-1",
      "_vsb_user_value@OData.Community.Display.V1.FormattedValue": "Demo User",
      "_vsb_member_value@OData.Community.Display.V1.FormattedValue": "Demo User",
      _vsb_projectmemberdescription_value: "pmd-1",
      "_vsb_projectmemberdescription_value@OData.Community.Display.V1.FormattedValue": "Project Manager",
      vsb_name: "Demo User",
      vsb_position: 1,
      vsb_role: "Project Manager",
      vsb_comment: "",
      _owningbusinessunit_value: `bu-${s.country}`,
      statecode: 0,
    });
    db[ES.projectPlannings].push({
      vsb_projectplanningid: `pp-${pi}`,
      _vsb_project_value: pid,
      vsb_name: `${p.vsb_internalprojectid} planning`,
      vsb_cooperation: pi % 2 === 0,
      vsb_cooperationpartner: pi % 2 === 0 ? "Stadtwerke Salzwedel" : "",
      vsb_cooperationdetails: "",
      vsb_planningbasiscategory: 952850000,
      vsb_planningbasisdetails: "",
      vsb_repowering: pi % 4 === 0,
      vsb_repoweringdetails: "",
      vsb_securedaccess: 60 + pi * 3,
      vsb_isheightlimitationforwtg: pi % 3 === 0,
      vsb_heightlimitationm: pi % 3 === 0 ? 250 : null,
      vsb_heightlimitm: 250,
      vsb_securedpercent: 60 + pi * 3,
      vsb_terrainsizeha: 120 + pi * 8,
      _owningbusinessunit_value: `bu-${s.country}`,
      statecode: 0,
    });
  });

  db[ES.environmentVariableValues] = [
    { key: "vsb_AppVersion", value: "2.0.0-code-app" },
    { key: "vsb_EnvironmentName", value: "Dev" },
    { key: "vsb_VSBCloudInfoCenterUrl", value: "https://vsb.energy" },
    { key: "vsb_EnvironmentID", value: "mock-env" },
    { key: "vsb_TenantID", value: "mock-tenant" },
    { key: "vsb_ProjectManagementAppID", value: "pm-app" },
    { key: "vsb_ProjectCostsAppID", value: "cost-app" },
  ].map((r, i) => ({
    environmentvariablevalueid: `ev-${i}`,
    value: r.value,
    "vsb_schemaname": r.key,
  }));

  return db;
}

let DB = seedDb();

/**
 * The entity sets `seedDb` owns.
 *
 * A table in this set that comes back empty is genuinely empty — a project with no costs, say
 * — and must stay that way, or a real bug hides behind invented rows. Every OTHER table gets
 * demo rows on demand from `buildAutoFixture`; see that file for why.
 */
let SEEDED = new Set(Object.keys(DB));

export const resetMockDb = () => {
  DB = seedDb();
  SEEDED = new Set(Object.keys(DB));
};

/** True for a table the hand-written seed never covers. */
export const isAutoFixtureTable = (entitySet: string): boolean => !SEEDED.has(entitySet);

/* --------------------------------------------------------------- OData-ish engine */

function tokenizeFilter(filter: string): string[] {
  // Split on top-level " and " / " or ", respecting parentheses.
  const parts: string[] = [];
  let depth = 0, cur = "";
  const src = filter.trim();
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === "(") depth++;
    if (c === ")") depth--;
    if (depth === 0) {
      if (src.startsWith(" and ", i)) { parts.push(cur, "and"); cur = ""; i += 4; continue; }
      if (src.startsWith(" or ", i)) { parts.push(cur, "or"); cur = ""; i += 3; continue; }
    }
    cur += c;
  }
  parts.push(cur);
  return parts.map((p) => p.trim()).filter(Boolean);
}

function evalLeaf(row: Row, leaf: string): boolean {
  let s = leaf.trim();
  while (s.startsWith("(") && s.endsWith(")")) {
    // only strip when balanced
    let d = 0, balanced = true;
    for (let i = 0; i < s.length; i++) {
      if (s[i] === "(") d++;
      if (s[i] === ")") d--;
      if (d === 0 && i < s.length - 1) { balanced = false; break; }
    }
    if (!balanced) break;
    s = s.slice(1, -1).trim();
  }
  if (s.includes(" and ") || s.includes(" or ")) return evalFilter(row, s);

  // Boolean literals. `f.inList(col, [])` emits "false", and without this the unmatched
  // leaf fell through to `return true` — matching every row here while matching none
  // against live Dataverse.
  if (s === "false") return false;
  if (s === "true") return true;

  let m = /^not\s+(.+)$/i.exec(s);
  if (m) return !evalLeaf(row, m[1]);

  m = /^(contains|startswith|endswith)\(([^,]+),'(.*)'\)$/i.exec(s);
  if (m) {
    const v = String(row[m[2].trim()] ?? "").toLowerCase();
    // `f.contains` doubles apostrophes, as OData requires. Undo that before comparing, or
    // searching for `Valle d'Aosta` sends `d''aosta` and matches nothing here while
    // matching correctly against live Dataverse.
    const needle = m[3].replace(/''/g, "'").toLowerCase();
    if (m[1].toLowerCase() === "contains") return v.includes(needle);
    if (m[1].toLowerCase() === "startswith") return v.startsWith(needle);
    return v.endsWith(needle);
  }

  m = /^(\S+)\s+(eq|ne|gt|ge|lt|le)\s+(.+)$/.exec(s);
  if (!m) return true;
  const [, col, op, rawVal] = m;
  const left = row[col];
  let right: unknown = rawVal.trim();
  if (right === "null") right = null;
  else if (typeof right === "string" && right.startsWith("'")) right = right.slice(1, -1).replace(/''/g, "'");
  else if (!Number.isNaN(Number(right))) right = Number(right);

  const l = left === undefined ? null : left;
  switch (op) {
    case "eq": return String(l) === String(right) || l === right;
    case "ne": return !(String(l) === String(right) || l === right);
    case "gt": return (l as number) > (right as number);
    case "ge": return (l as number) >= (right as number);
    case "lt": return (l as number) < (right as number);
    case "le": return (l as number) <= (right as number);
    default: return true;
  }
}

function evalFilter(row: Row, filter: string): boolean {
  const toks = tokenizeFilter(filter);
  let acc = evalLeaf(row, toks[0]);
  for (let i = 1; i < toks.length; i += 2) {
    const op = toks[i], next = evalLeaf(row, toks[i + 1]);
    acc = op === "and" ? acc && next : acc || next;
  }
  return acc;
}

function project(row: Row, select: string[] | null): Row {
  if (!select?.length) return { ...row };
  const out: Row = {};
  for (const c of select) {
    out[c] = row[c] ?? null;
    const fv = `${c}@OData.Community.Display.V1.FormattedValue`;
    if (fv in row) out[fv] = row[fv];
  }
  const idKey = Object.keys(row).find((k) => k.endsWith("id") && !k.startsWith("_"));
  if (idKey && !(idKey in out)) out[idKey] = row[idKey];
  return out;
}

/**
 * Artificial latency, so `npm run dev` shows the same spinners and `keepPreviousData`
 * behaviour a real service produces.
 *
 * Skipped under test. It bought nothing there and cost a great deal: a debounced filter
 * interaction pays it several times over, which is what pushed the portfolio screen's
 * interaction tests past the 5s default and made them flaky.
 */
const IS_TEST = import.meta.env.MODE === "test";
const delay = () =>
  IS_TEST ? Promise.resolve() : new Promise((r) => setTimeout(r, 40 + Math.random() * 90));

export async function mockFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  await delay();
  const method = (init.method ?? "GET").toUpperCase();
  const [pathPart, qs] = path.split("?");
  const params = new URLSearchParams(qs ?? "");

  // entity set, optionally with (id)
  const m = /^([A-Za-z0-9_]+)(?:\(([^)]+)\))?$/.exec(pathPart);
  if (!m) {
    if (pathPart === "$batch") return undefined as T;
    throw Object.assign(new Error(`mock: unsupported path ${pathPart}`), { status: 400 });
  }
  const [, entitySet, id] = m;
  DB[entitySet] ??= [];
  const table = DB[entitySet];
  const idKey =
    Object.keys(table[0] ?? {}).find((k) => k.endsWith("id") && !k.startsWith("_")) ??
    `${entitySet.replace(/s$/, "")}id`;

  if (method === "GET") {
    if (id) {
      const row = table.find((r) => String(r[idKey]) === id);
      if (!row) throw Object.assign(new Error("Not found"), { status: 404 });
      return project(row, params.get("$select")?.split(",") ?? null) as T;
    }
    const filter = params.get("$filter");
    const select = params.get("$select")?.split(",") ?? null;

    // Demo rows for a table the hand seed does not cover, generated the first time a screen
    // asks for one and then kept, so paging and counts stay stable within a session.
    if (isAutoFixtureTable(entitySet)) {
      const matches = filter ? table.filter((r) => evalFilter(r, filter)).length : table.length;
      if (matches === 0) {
        table.push(...buildAutoFixture({
          entitySet,
          select: select ?? [],
          filter,
          existing: table.length,
        }));
      }
    }

    let rows = [...table];
    if (filter) rows = rows.filter((r) => evalFilter(r, filter));
    const orderBy = params.get("$orderby");
    if (orderBy) {
      for (const clause of orderBy.split(",").reverse()) {
        const [col, dir = "asc"] = clause.trim().split(/\s+/);
        rows.sort((a, b) => {
          const av = a[col], bv = b[col];
          if (av === bv) return 0;
          if (av === null || av === undefined) return 1;
          if (bv === null || bv === undefined) return -1;
          const c = av > bv ? 1 : -1;
          return dir.toLowerCase() === "desc" ? -c : c;
        });
      }
    }
    // Post-filter, pre-page — that is what the OData annotation means and what a grid
    // footer's "Total Rows" needs. `$skip` before `$top`, as OData applies them.
    const total = rows.length;
    const skip = Number(params.get("$skip") ?? 0);
    if (skip > 0) rows = rows.slice(skip);
    const top = Number(params.get("$top") ?? 0);
    if (top) rows = rows.slice(0, top);
    const body: Row = { value: rows.map((r) => project(r, select)) };
    // Live Dataverse annotates the count only when asked. Returning it unconditionally let a
    // screen depend on a number it would not get in "power" mode.
    if (params.get("$count") === "true") body["@odata.count"] = total;
    return body as T;
  }

  if (method === "POST") {
    const body = JSON.parse(String(init.body ?? "{}")) as Row;
    const newId = uuid();
    const row: Row = { [idKey]: newId, statecode: 0, createdon: new Date().toISOString(), ...body };
    table.push(row);
    return row as T;
  }

  if (method === "PATCH") {
    const i = table.findIndex((r) => String(r[idKey]) === id);
    if (i < 0) throw Object.assign(new Error("Not found"), { status: 404 });
    const body = JSON.parse(String(init.body ?? "{}")) as Row;
    table[i] = { ...table[i], ...body, modifiedon: new Date().toISOString() };
    return undefined as T;
  }

  if (method === "DELETE") {
    const i = table.findIndex((r) => String(r[idKey]) === id);
    if (i >= 0) table.splice(i, 1);
    return undefined as T;
  }

  throw Object.assign(new Error(`mock: ${method} not supported`), { status: 400 });
}
