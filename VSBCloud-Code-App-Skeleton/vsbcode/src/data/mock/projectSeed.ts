/**
 * Project portfolio fixture — 1,127 rows over 6 pages of 200.
 *
 * Split deliberately in two:
 *
 *  - `SCREENSHOT_PROJECTS` — 15 rows transcribed field-for-field from the reference
 *    screenshot of the live Project Main Screen. These are the only rows anyone compares
 *    against a picture, so they are literals, never derived.
 *  - the filler — 1,102 rows generated from a seeded PRNG so the fixture is byte-identical on
 *    every machine and every run, which is what lets tests assert on it.
 *
 * Ordering matters and is load-bearing. The grid's default sort is Project Name ascending,
 * and the mock sorts by UTF-16 code unit (`av > bv`), NOT by locale. The screenshot's row
 * order is exactly that ordering — verified pair by pair — so every screenshot name begins
 * with a digit (0x30-0x39) and every filler and legacy name begins with an uppercase letter
 * (0x41+). Page 1 therefore opens with the 15 screenshot rows in the screenshot's order.
 * Do not "improve" the mock's comparator to `localeCompare`: it would reorder page 1.
 *
 * The fixture is INVENTED sample data shaped to look like the real screen. It is not VSB's
 * data.
 */
import { CHOICE, CHOICE_PROCESS } from "../entities";

type Row = Record<string, unknown>;

/** `colFiltersOverview.PageSize` from `App.OnStart`. */
export const PAGE_SIZE = 200;
/** Matches the screenshot's "Total Rows: 1127" and therefore its "Page: 1 from 6". */
export const TOTAL_PROJECTS = 1127;

const FV = "@OData.Community.Display.V1.FormattedValue";
/** `<col>@OData.Community.Display.V1.FormattedValue` — a lookup or choice label. */
export const fv = (col: string) => `${col}${FV}`;

/* ═══════════════════════════════════════════════════════ dates ═══ */

const EPOCH = Date.UTC(2024, 0, 1);
/**
 * ISO instant N days after 2024-01-01.
 *
 * Every date in this file goes through here. The previous fixture string-templated its
 * `modifiedon` as `2026-0${(i % 8) + 1}-12T…`, which emitted the invalid literal
 * `2026-010-12T…` as soon as the index reached 9 — a bug that only surfaced when the seed
 * array grew. Arithmetic on a Date cannot do that.
 */
const isoAt = (dayOffset: number): string => new Date(EPOCH + dayOffset * 86_400_000).toISOString();
/** Date-only, for the milestone columns. */
const dayAt = (dayOffset: number): string => isoAt(dayOffset).slice(0, 10);

/* ═══════════════════════════════════════════════════════ reference data ═══ */

/**
 * Country -> areas. The eight areas the screenshot shows are here verbatim; the rest pad the
 * list out so the country -> area cascade is observably doing something (a country with one
 * area proves nothing).
 */
export const COUNTRY_AREAS: readonly Row[] = [
  // Germany — the screenshot's five, plus three
  { vsb_countryareaid: "ca-de-bb", vsb_name: "Brandenburg", _vsb_country_value: "c-de" },
  { vsb_countryareaid: "ca-de-by", vsb_name: "Bavaria", _vsb_country_value: "c-de" },
  { vsb_countryareaid: "ca-de-rp", vsb_name: "Rhineland-Palatinate", _vsb_country_value: "c-de" },
  { vsb_countryareaid: "ca-de-he", vsb_name: "Hesse", _vsb_country_value: "c-de" },
  { vsb_countryareaid: "ca-de-bw", vsb_name: "Baden-Württemberg", _vsb_country_value: "c-de" },
  { vsb_countryareaid: "ca-de-sn", vsb_name: "Saxony", _vsb_country_value: "c-de" },
  { vsb_countryareaid: "ca-de-ni", vsb_name: "Lower Saxony", _vsb_country_value: "c-de" },
  { vsb_countryareaid: "ca-de-st", vsb_name: "Saxony-Anhalt", _vsb_country_value: "c-de" },
  // Italy — the screenshot's two, plus three. Valle d'Aosta carries an apostrophe on purpose:
  // it is the value that exposed the mock's `contains()` escaping bug.
  { vsb_countryareaid: "ca-it-pu", vsb_name: "Puglia", _vsb_country_value: "c-it" },
  { vsb_countryareaid: "ca-it-va", vsb_name: "Valle d'Aosta", _vsb_country_value: "c-it" },
  { vsb_countryareaid: "ca-it-lo", vsb_name: "Lombardia", _vsb_country_value: "c-it" },
  { vsb_countryareaid: "ca-it-si", vsb_name: "Sicilia", _vsb_country_value: "c-it" },
  { vsb_countryareaid: "ca-it-la", vsb_name: "Lazio", _vsb_country_value: "c-it" },
  // Poland — the screenshot's one, plus three
  { vsb_countryareaid: "ca-pl-ld", vsb_name: "Łódzkie Voivodeship", _vsb_country_value: "c-pl" },
  { vsb_countryareaid: "ca-pl-pm", vsb_name: "Pomeranian Voivodeship", _vsb_country_value: "c-pl" },
  { vsb_countryareaid: "ca-pl-wp", vsb_name: "Greater Poland Voivodeship", _vsb_country_value: "c-pl" },
  { vsb_countryareaid: "ca-pl-ds", vsb_name: "Lower Silesian Voivodeship", _vsb_country_value: "c-pl" },
  // France
  { vsb_countryareaid: "ca-fr-cvl", vsb_name: "Centre-Val de Loire", _vsb_country_value: "c-fr" },
  { vsb_countryareaid: "ca-fr-bfc", vsb_name: "Bourgogne-Franche-Comté", _vsb_country_value: "c-fr" },
  { vsb_countryareaid: "ca-fr-occ", vsb_name: "Occitanie", _vsb_country_value: "c-fr" },
  { vsb_countryareaid: "ca-fr-hdf", vsb_name: "Hauts-de-France", _vsb_country_value: "c-fr" },
  // Finland
  { vsb_countryareaid: "ca-fi-ob", vsb_name: "Ostrobothnia", _vsb_country_value: "c-fi" },
  { vsb_countryareaid: "ca-fi-nk", vsb_name: "North Karelia", _vsb_country_value: "c-fi" },
  { vsb_countryareaid: "ca-fi-la", vsb_name: "Lapland", _vsb_country_value: "c-fi" },
].map((a) => ({ ...a, [fv("_vsb_country_value")]: COUNTRY_NAME(a._vsb_country_value) }));

function COUNTRY_NAME(id: string): string {
  return (
    { "c-de": "Germany", "c-fr": "France", "c-pl": "Poland", "c-it": "Italy", "c-fi": "Finland" }[
      id
    ] ?? ""
  );
}

/**
 * `Project States` — the Status dropdown's source, `Sort('Project States', Order, Ascending)`.
 * Draft plus Cluster 1-6, which is what the screenshot's Status column shows.
 */
export const PROJECT_STATES: readonly Row[] = [
  { vsb_projectstateid: "ps-draft", vsb_name: "Draft", vsb_order: 0, vsb_isvisibleonchecklist: false, vsb_clusterdescription: "Draft", statecode: 0 },
  ...Array.from({ length: 6 }, (_, i) => ({
    vsb_projectstateid: `ps-c${i + 1}`,
    vsb_name: `Cluster ${i + 1}`,
    vsb_order: i + 1,
    vsb_isvisibleonchecklist: true,
    vsb_clusterdescription: `Cluster ${i + 1}`,
    statecode: 0,
  })),
];

/**
 * `Microsoft Entra IDs` — the Project Manager people-picker's source and the origin of the
 * manager display name.
 *
 * Two rows are the screenshot's managers, verbatim. Two are deliberately
 * `vsb_accountenabled: false` so the enabled-account filter is observably doing work rather
 * than being a no-op nobody would notice.
 *
 * Note `vsb_entraid` (the AAD object id) is a DIFFERENT guid from `vsb_microsoftentraidid`
 * (the Dataverse row id) on purpose. The canvas people-picker compares the AAD object id
 * while the project's lookup stores the row id; conflating them is a real trap, and seeding
 * them equal would hide it.
 */
export const ENTRA_IDS: readonly Row[] = [
  { id: "eid-georg", entra: "aad-georg-0001", name: "Georg, Lucas (external)", given: "Lucas", sur: "Georg", mail: "lucas.georg@external.vsb.energy", on: true },
  { id: "eid-shakti", entra: "aad-shakti-0002", name: "Singh Rajput, Shakti (external)", given: "Shakti", sur: "Singh Rajput", mail: "shakti.singh@external.vsb.energy", on: true },
  { id: "eid-rohit", entra: "aad-rohit-0003", name: "Rohit Revnath Somase", given: "Rohit", sur: "Somase", mail: "rohit.somase@vsb.energy", on: true },
  { id: "eid-weber", entra: "aad-weber-0004", name: "Weber, Anna", given: "Anna", sur: "Weber", mail: "anna.weber@vsb.energy", on: true },
  { id: "eid-dubois", entra: "aad-dubois-0005", name: "Dubois, Marie", given: "Marie", sur: "Dubois", mail: "marie.dubois@vsb.energy", on: true },
  { id: "eid-nowak", entra: "aad-nowak-0006", name: "Nowak, Piotr", given: "Piotr", sur: "Nowak", mail: "piotr.nowak@vsb.energy", on: true },
  { id: "eid-rossi", entra: "aad-rossi-0007", name: "Rossi, Giulia", given: "Giulia", sur: "Rossi", mail: "giulia.rossi@vsb.energy", on: true },
  { id: "eid-virta", entra: "aad-virta-0008", name: "Virtanen, Aino", given: "Aino", sur: "Virtanen", mail: "aino.virtanen@vsb.energy", on: true },
  { id: "eid-schmidt", entra: "aad-schmidt-0009", name: "Schmidt, Jonas", given: "Jonas", sur: "Schmidt", mail: "jonas.schmidt@vsb.energy", on: true },
  { id: "eid-koch", entra: "aad-koch-0010", name: "Koch, Lena", given: "Lena", sur: "Koch", mail: "lena.koch@vsb.energy", on: true },
  { id: "eid-left1", entra: "aad-left-0011", name: "Bauer, Ex-Employee", given: "Ex", sur: "Bauer", mail: "ex.bauer@vsb.energy", on: false },
  { id: "eid-left2", entra: "aad-left-0012", name: "Fischer, Ex-Contractor", given: "Ex", sur: "Fischer", mail: "ex.fischer@vsb.energy", on: false },
].map((u) => ({
  vsb_microsoftentraidid: u.id,
  vsb_entraid: u.entra,
  vsb_displayname: u.name,
  vsb_givenname: u.given,
  vsb_surname: u.sur,
  vsb_mail: u.mail,
  vsb_accountenabled: u.on,
  statecode: 0,
}));

const ENABLED_MANAGERS = ENTRA_IDS.filter((u) => u.vsb_accountenabled === true);

/* ═══════════════════════════════════════════════════════ the fixture rows ═══ */

const A = CHOICE.approvalState;
const T = CHOICE_PROCESS.technology;

export interface ProjectSeed {
  name: string;
  shortName: string;
  /** The 8-digit human-readable key the screenshot's "Project ID" column shows. */
  projectNumber: string;
  /** `vsb_clusterstates` row id. */
  clusterStateId: string;
  /** `vsb_microsoftentraids` row id. */
  managerId: string;
  countryId: string;
  /** `vsb_countryareas` row id, or null — the screenshot has one row with a blank area. */
  areaId: string | null;
  technology: number;
  capacity: number;
  approvalState: number;
}

/**
 * The 15 rows visible on page 1 of the screenshot, in the screenshot's order.
 *
 * Two rows genuinely share the name `0 Test Lucas` with different short names — that is what
 * the image shows, and duplicate display names are exactly the case a portfolio grid has to
 * survive, so it is preserved rather than tidied away.
 */
export const SCREENSHOT_PROJECTS: readonly ProjectSeed[] = [
  { name: "0 0 0 0", shortName: "500", projectNumber: "24100007", clusterStateId: "cs-dev", managerId: "eid-georg", countryId: "c-it", areaId: "ca-it-pu", technology: T.wind, capacity: 136.0, approvalState: A.approved },
  { name: "0 Test Lucas", shortName: "0tl", projectNumber: "20100479", clusterStateId: "cs-rtb", managerId: "eid-georg", countryId: "c-de", areaId: "ca-de-bb", technology: T.pv, capacity: 13.6, approvalState: A.approved },
  { name: "0 Test Lucas", shortName: "000", projectNumber: "24100002", clusterStateId: "cs-dev", managerId: "eid-shakti", countryId: "c-it", areaId: "ca-it-va", technology: T.wind, capacity: 559.8, approvalState: A.approved },
  { name: "00 0 LG", shortName: "LG0", projectNumber: "24100001", clusterStateId: "cs-permit", managerId: "eid-georg", countryId: "c-it", areaId: null, technology: T.wind, capacity: 47.13, approvalState: A.approved },
  { name: "00 LG", shortName: "0LG", projectNumber: "20100476", clusterStateId: "cs-dev", managerId: "eid-georg", countryId: "c-de", areaId: "ca-de-by", technology: T.wind, capacity: 290.0, approvalState: A.approved },
  { name: "00 PO Wind", shortName: "0PW", projectNumber: "25100002", clusterStateId: "cs-dev", managerId: "eid-georg", countryId: "c-pl", areaId: "ca-pl-ld", technology: T.wind, capacity: 14.0, approvalState: A.approved },
  { name: "0000000", shortName: "0lg", projectNumber: "20100499", clusterStateId: "cs-permit", managerId: "eid-georg", countryId: "c-de", areaId: "ca-de-rp", technology: T.wind, capacity: 0.0, approvalState: A.approved },
  { name: "0000LG", shortName: "0LG", projectNumber: "20100485", clusterStateId: "cs-permit", managerId: "eid-georg", countryId: "c-de", areaId: "ca-de-bb", technology: T.wind, capacity: 178.5, approvalState: A.approved },
  { name: "000TestingRRS", shortName: "rrs", projectNumber: "20100510", clusterStateId: "cs-permit", managerId: "eid-rohit", countryId: "c-de", areaId: "ca-de-he", technology: T.wind, capacity: 5.0, approvalState: A.rejected },
  { name: "0123456", shortName: "123", projectNumber: "20110015", clusterStateId: "cs-constr", managerId: "eid-georg", countryId: "c-de", areaId: "ca-de-bw", technology: T.wind, capacity: 6.6, approvalState: A.approved },
  { name: "11111", shortName: "111", projectNumber: "20110016", clusterStateId: "cs-rtb", managerId: "eid-georg", countryId: "c-de", areaId: "ca-de-bb", technology: T.wind, capacity: 14.0, approvalState: A.rejected },
  { name: "123 Lucas", shortName: "123", projectNumber: "20100477", clusterStateId: "cs-permit", managerId: "eid-georg", countryId: "c-de", areaId: "ca-de-bb", technology: T.wind, capacity: 13.2, approvalState: A.approved },
  { name: "12345", shortName: "123", projectNumber: "20110023", clusterStateId: "cs-dev", managerId: "eid-georg", countryId: "c-de", areaId: "ca-de-bb", technology: T.wind, capacity: 120.0, approvalState: A.approved },
  { name: "22222", shortName: "222", projectNumber: "10007080", clusterStateId: "cs-draft", managerId: "eid-georg", countryId: "c-de", areaId: "ca-de-bb", technology: T.wind, capacity: 14.4, approvalState: A.notStarted },
  { name: "2402 - Test Shakti", shortName: "2402TS", projectNumber: "20110012", clusterStateId: "cs-dev", managerId: "eid-shakti", countryId: "c-de", areaId: "ca-de-bw", technology: T.wind, capacity: 24.0, approvalState: A.approved },
];

/* ═══════════════════════════════════════════════════════ filler ═══ */

/** mulberry32 — deterministic, so the fixture is identical on every machine and every run. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Every entry starts with an uppercase letter, so the filler always sorts after page 1. */
const TOWNS = [
  "Altmark", "Bornholm", "Cottbus", "Dessau", "Emsland", "Flensburg", "Görlitz", "Havelland",
  "Ilmenau", "Jena", "Kyritz", "Lausitz", "Meißen", "Nordhausen", "Oderbruch", "Prignitz",
  "Quedlinburg", "Rügen", "Salzwedel", "Torgau", "Uckermark", "Vogtland", "Wittenberg",
  "Xanten", "Ystad", "Zerbst",
];
const KINDS = ["Windpark", "Solarpark", "Hybridpark", "Speicherpark"];

const CLUSTER_IDS = ["cs-draft", "cs-dev", "cs-permit", "cs-rtb", "cs-constr", "cs-ops", "cs-c6"];
const COUNTRY_IDS = ["c-de", "c-fr", "c-pl", "c-it", "c-fi"];
const APPROVALS = [A.approved, A.approved, A.approved, A.inProgress, A.rejected, A.notStarted, A.cancelled];

function areasFor(countryId: string): Row[] {
  return COUNTRY_AREAS.filter((a) => a._vsb_country_value === countryId);
}

function buildFiller(count: number, startIndex: number): ProjectSeed[] {
  const rand = rng(0x5f5b1127); // any fixed value; the point is that it never changes
  const out: ProjectSeed[] = [];
  for (let i = 0; i < count; i++) {
    const n = startIndex + i;
    const countryId = COUNTRY_IDS[n % COUNTRY_IDS.length];
    const areas = areasFor(countryId);
    const isWind = n % 3 !== 1;
    out.push({
      name: `${KINDS[n % KINDS.length]} ${TOWNS[n % TOWNS.length]} ${String(n).padStart(4, "0")}`,
      shortName: `${TOWNS[n % TOWNS.length].slice(0, 3).toUpperCase()}${String(n % 1000).padStart(3, "0")}`,
      projectNumber: String(20100000 + n),
      clusterStateId: CLUSTER_IDS[n % CLUSTER_IDS.length],
      managerId: String(ENABLED_MANAGERS[n % ENABLED_MANAGERS.length].vsb_microsoftentraidid),
      countryId,
      areaId: areas.length ? String(areas[n % areas.length].vsb_countryareaid) : null,
      technology: isWind ? T.wind : T.pv,
      capacity: +(rand() * 320).toFixed(2),
      approvalState: APPROVALS[n % APPROVALS.length],
    });
  }
  return out;
}

/* ═══════════════════════════════════════════════════════ row projection ═══ */

const AREA_NAME = new Map(COUNTRY_AREAS.map((a) => [a.vsb_countryareaid, String(a.vsb_name)]));
const MANAGER_NAME = new Map(
  ENTRA_IDS.map((u) => [u.vsb_microsoftentraidid, String(u.vsb_displayname)]),
);
const CLUSTER_NAME = new Map([
  ["cs-draft", "Draft"],
  ["cs-dev", "Cluster 1"],
  ["cs-permit", "Cluster 2"],
  ["cs-rtb", "Cluster 3"],
  ["cs-constr", "Cluster 4"],
  ["cs-ops", "Cluster 5"],
  ["cs-c6", "Cluster 6"],
]);
const APPROVAL_NAME = new Map<number, string>([
  [A.notStarted, "Draft"],
  [A.inProgress, "Approving"],
  [A.approved, "Approved"],
  [A.rejected, "Rejected"],
  [A.cancelled, "Canceled"],
]);
const TECH_NAME = new Map<number, string>([
  [T.wind, "Wind"],
  [T.pv, "PV"],
]);

/**
 * `ProjectSeed` -> a Dataverse-shaped row.
 *
 * Every lookup and choice gets its `@OData…FormattedValue` sibling, because that is how the
 * real service returns a label and it is what lets the grid render Country / Area / Status /
 * Project Manager without an `$expand` — which the mock does not implement.
 */
function toRow(s: ProjectSeed, i: number): Row {
  const isWind = s.technology === T.wind;
  // Milestone dates march forward so the five date columns are visibly ordered, and so a
  // project's own chain is internally consistent.
  const base = 120 + (i % 900);
  return {
    vsb_projectid: `p-${String(i + 1).padStart(5, "0")}`,
    // 'Project Name'. `vsb_name` is the auto-numbered primary column, seeded alongside it
    // because the canvas reads it as the fallback seed for 'Internal Project ID'.
    vsb_projectname: s.name,
    vsb_name: s.projectNumber,
    vsb_shortname: s.shortName,
    // A STRING, not a number: `contains()` on a numeric column is a 400 against live
    // Dataverse, and the keyword filter searches this column. Seeding it as text keeps the
    // mock honest about what the live service will accept.
    vsb_internalprojectid: s.projectNumber,
    vsb_technology: s.technology,
    [fv("vsb_technology")]: TECH_NAME.get(s.technology) ?? "",
    vsb_totalcapacity: s.capacity,
    vsb_plantwtgcapacity: isWind ? s.capacity : 0,
    vsb_plantwtgcost: isWind ? Math.round(s.capacity * 900_000) : 0,
    vsb_weightedmw: +(s.capacity * 0.92).toFixed(2),
    vsb_netyieldp50: s.capacity > 0 ? Math.round(s.capacity * 2_400) : null,
    vsb_approvalstates: s.approvalState,
    [fv("vsb_approvalstates")]: APPROVAL_NAME.get(s.approvalState) ?? "",
    // Croatia is the only country the canvas wires SPO/Teams provisioning for, so these are
    // null everywhere in this fixture and the two command-bar items stay correctly hidden.
    vsb_sposharepointurl: null,
    vsb_spoteamsurl: null,

    /* the milestone chain — the five columns the grid shows, plus the ones the lock reads */
    vsb_projectstartdate: s.capacity > 0 ? dayAt(base) : null,
    vsb_feasibilitystudies: s.capacity > 0 ? dayAt(base + 60) : null,
    vsb_projectdevelopmentstarted: s.capacity > 0 ? dayAt(base + 150) : null,
    vsb_applicationsubmitted: s.capacity > 0 ? dayAt(base + 300) : null,
    vsb_legallybindingpermits: s.capacity > 0 ? dayAt(base + 520) : null,
    vsb_construction: s.capacity > 0 ? dayAt(base + 700) : null,
    vsb_finalinvestmentdecision: s.capacity > 0 ? dayAt(base + 610) : null,
    vsb_operationsstartdatecod: s.capacity > 0 ? dayAt(base + 900) : null,
    vsb_enddate: s.capacity > 0 ? dayAt(base + 900 + 365 * 25) : null,

    _vsb_country_value: s.countryId,
    [fv("_vsb_country_value")]: COUNTRY_NAME(s.countryId),
    _vsb_countryarea_value: s.areaId,
    [fv("_vsb_countryarea_value")]: s.areaId ? AREA_NAME.get(s.areaId) ?? "" : "",
    _vsb_clusterstate_value: s.clusterStateId,
    [fv("_vsb_clusterstate_value")]: CLUSTER_NAME.get(s.clusterStateId) ?? "",
    _vsb_projectmanager_value: s.managerId,
    [fv("_vsb_projectmanager_value")]: MANAGER_NAME.get(s.managerId) ?? "",
    _owningbusinessunit_value: `bu-${s.countryId}`,

    statecode: CHOICE.statecode.active,
    createdon: isoAt(i % 300),
    modifiedon: isoAt(400 + (i % 700)),
  };
}

/**
 * The rows to append after the hand-authored legacy fixture, bringing the projects table to
 * exactly `TOTAL_PROJECTS`.
 *
 * `legacyCount` rows are left untouched at the head of the table on purpose: the child-fixture
 * loop in `mockBackend` keys generator, turbine, energy-yield and revenue rows to its `SEEDS`
 * array **by index**, so reordering or replacing that prefix would silently detach the
 * Generators, Production, Finance and Revenues screens from their data. Array order is
 * otherwise irrelevant — the grid always sorts server-side.
 *
 * The filler count is derived, never hard-coded, so editing `SCREENSHOT_PROJECTS` cannot
 * silently change the total or the page count.
 */
export function buildAppendedProjects(legacyCount: number): Row[] {
  const fillerCount = TOTAL_PROJECTS - legacyCount - SCREENSHOT_PROJECTS.length;
  if (fillerCount < 0) {
    throw new Error(
      `projectSeed: ${legacyCount} legacy + ${SCREENSHOT_PROJECTS.length} screenshot rows ` +
        `exceed TOTAL_PROJECTS (${TOTAL_PROJECTS}).`,
    );
  }
  const seeds: ProjectSeed[] = [
    ...SCREENSHOT_PROJECTS,
    ...buildFiller(fillerCount, legacyCount + SCREENSHOT_PROJECTS.length),
  ];
  return seeds.map((s, i) => toRow(s, legacyCount + i));
}
