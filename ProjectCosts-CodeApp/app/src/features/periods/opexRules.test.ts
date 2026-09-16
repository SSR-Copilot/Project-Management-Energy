/**
 * OPEX — unit tests for `opexRules.ts`. Both rail destinations are covered: every
 * mode-dependent rule is asserted twice, once as `om` ("Operation & Maintenance") and once as
 * `other` ("Other OPEX Costs").
 *
 * Cases ported from `VSBCloud-Code-App-Skeleton/vsbcode/src/features/cost/opex-costs/rules.test.ts`
 * cite it as `SKEL-OPEX-nnn`, which is that file's own `UT-OPEX-nnn`. The prefix is rewritten so
 * a citation cannot be mistaken for one of OUR ids — the two numbering schemes are unrelated.
 * Where the skeleton's ASSERTION disagreed with `OpexCostScreenCode.txt`, the canvas is asserted
 * and the disagreement is named in the test.
 */
import { describe, expect, it } from "vitest";
import {
  CASCADED_FIELDS,
  DELETE_DIALOG,
  DURATION_BADGE_TEXT,
  DURATION_MONTH_OPTIONS,
  DURATION_YEAR_OPTIONS,
  ITALY_AREA_BY_REGION,
  MODE_DISPLAY_NAME,
  NAV_KEY_TO_MODE,
  OPEX_AGGREGATION,
  OPEX_COMMAND_LABELS,
  OPEX_DESCRIPTION_MSG,
  OPEX_DISTRIBUTION_FREQUENCY,
  OPEX_MSG,
  OPEX_PANEL_LABELS,
  STANDARD_PERIOD,
  STANDARD_STAMP,
  THRESHOLD_TYPE,
  TIME_ZONE_RULE_VERSION_NUMBER,
  TYPE_OF_CONTRACT,
  addMonths,
  addPeriodRecordType,
  alignWithProjectDurationDefault,
  areaFieldVisible,
  areaFieldVisibleIntended,
  areaWithRegion,
  countryInflationPercent,
  canAddContractType,
  canAddPeriod,
  canAddStandardContract,
  canDeleteCost,
  canDeleteCostCanvasParity,
  canEditCost,
  canEditCostCanvasParity,
  canSaveOpexCost,
  cascadeToChildren,
  chainHead,
  chainOf,
  childrenOf,
  commandsInScope,
  costName,
  costsForDevice,
  costsForSubaccount,
  costsInScope,
  defaultCurrencyCode,
  defaultSubaccount,
  deleteDialogCascadeText,
  deleteDialogSingleText,
  deleteDialogText,
  deleteDialogTextCanvasParity,
  descriptionError,
  descriptionHasReservedStandard,
  descriptionIsFree,
  deviceTypeForSave,
  deviceTypeList,
  durationBadge,
  externalContractDefault,
  formatOneDecimalPercent,
  formatRevenuePercent,
  formatTableDate,
  formatWholeNumber,
  groupChains,
  inflationColumnText,
  inflationProfileCountryText,
  inflationProfileDefault,
  inflationStartYear,
  inflationStartYearDefault,
  inheritStartDateStandard,
  isOandMSubaccount,
  isStandardByDescription,
  isStandardLocked,
  italyZone,
  lastPeriod,
  lastPeriodByStartDate,
  modeFromNavKey,
  nextPeriodDescription,
  nextPeriodDescriptionPanel,
  nextStartDate,
  omAlignWarningVisible,
  omDurationBadge,
  opexColumns,
  opexCommands,
  opexCostWrite,
  opexFormErrors,
  otherAlignWarningVisible,
  panelFieldModes,
  panelRateLabel,
  panelRequiredMarkers,
  panelTitle,
  periodEndDate,
  planDeleteCost,
  planStandardImport,
  rangeMessage,
  resetStartDateFlag,
  resetStartDateVisible,
  resolveInflationProfile,
  selectedAccount,
  selectedAccountByName,
  showAtLeastOneFigureHint,
  showEurPerWtgField,
  showThresholdColumn,
  sortCosts,
  standardAssumptionFilter,
  standardCostName,
  standardPeriodStarts,
  startDateDefault,
  startDateError,
  startDateErrorVisibleCanvasParity,
  startDateStandardFlagAfterManualChange,
  subaccountsForMode,
  thresholdColumnText,
  thresholdToggleLabel,
  thresholdTypeError,
  toOpexRow,
  toggleRowSelection,
  validateInflationStartYear,
  validateOpexNumber,
  visibleCommands,
  type CommandArgs,
  type OpexAssumption,
  type OpexCost,
  type OpexForm,
  type OpexSubaccount,
  type PanelContext,
  matchesStandardAssumption,
} from "./opexRules";

/* ─────────────────────────────────────────────────────────────────── fixtures */

const cost = (o: Partial<OpexCost> = {}): OpexCost => ({
  id: "p1", name: "Operation & Maintenance-WTG 1-Service", description: "Service",
  parentCostId: null, subaccountId: "sub-om", deviceTypeInProjectId: null,
  startDate: "2027-01-01", durationYears: 5, durationMonths: 0,
  currencyId: "eur", currencyName: "Euro", fixCosts: 1000, percentOfRevenues: null,
  eurPerMwh: null, eurPerMw: null, eurPerWtg: null,
  aggregation: OPEX_AGGREGATION.sum, distributionFrequency: 12,
  threshold: false, thresholdType: null, thresholdIndividual: null,
  useInflationProfile: false, useCountryInflationProfile: false, inflationProfile: null,
  inflationStartYear: null, inflationCountryArea: null,
  alignWithProjectDuration: false, externalContract: false,
  isStandardContract: false, isStartDateStandardAssumption: false, createdOn: "2026-01-01T00:00:00Z",
  ...o,
});

const sub = (o: Partial<OpexSubaccount> = {}): OpexSubaccount => ({
  id: "sub-om", name: "Operation & Maintenance", order: 1, accountId: "acc-om",
  accountName: MODE_DISPLAY_NAME.om, ...o,
});

const assumption = (o: Partial<OpexAssumption> = {}): OpexAssumption => ({
  id: "a-1", period: STANDARD_PERIOD.period1, description: "Standard Operation & Maintenance",
  durationYears: 5, durationMonths: 0,
  typeOfContract: TYPE_OF_CONTRACT.opexOandM, countryId: "de", technology: 952850000,
  opexSubaccountId: null, currencyId: "eur",
  fixCosts: 1000, percentOfRevenues: null, eurPerMwh: null, eurPerMw: null, eurPerWtg: null,
  aggregation: OPEX_AGGREGATION.sum, distributionFrequency: 12,
  threshold: false, thresholdType: null, thresholdIndividual: null,
  useInflationProfile: false, useCountryInflationProfile: false, inflationProfile: null,
  inflationCountryArea: null, alignWithProjectDuration: false, externalContract: false,
  ...o,
});

const form = (o: Partial<OpexForm> = {}): OpexForm => ({
  description: "Service", startDate: "2027-01-01", durationYears: 5, durationMonths: 0,
  currencyId: "eur", aggregation: OPEX_AGGREGATION.sum, distributionFrequency: 12,
  fixCosts: "1000.00", percentOfRevenues: "", eurPerMwh: "", eurPerMw: "", eurPerWtg: "",
  thresholdOn: false, thresholdType: null, thresholdIndividual: "",
  inflationOn: false, useCountryInflationProfile: false, inflationStartYear: "",
  inflationProfile: "", inflationCountryArea: null,
  alignWithProjectDuration: true, externalContract: true,
  ...o,
});

const accounts = [
  { id: "acc-om", name: MODE_DISPLAY_NAME.om, order: 1 },
  { id: "acc-other", name: MODE_DISPLAY_NAME.other, order: 2 },
];

const perms = { canCreate: true, canEditRecord: true, canDeleteRecord: true };

const project = {
  codDate: "2027-04-01", projectStartDate: "2026-01-01", endDate: "2049-12-31",
  countryName: "Germany", countryId: "de", technology: 952850000,
  areaStateProvince: null, isoCurrencyCode: "EUR", owningBusinessUnitId: "bu-1",
};

const commandArgs = (o: Partial<CommandArgs> = {}): CommandArgs => ({
  mode: "other", cardScopeId: "card-1", selectedScopeId: "card-1", selected: null,
  allCosts: [], cardCosts: [], candidateDescription: "Service - 2",
  hasStandardAssumption: true, permissions: perms, ...o,
});

const panelCtx = (o: Partial<PanelContext> = {}): PanelContext => ({
  mode: "om", selected: null, parent: null, isFirstAccount: true,
  deviceLabel: "V150-6.0", recordType: "Generator", countryName: "Germany", ...o,
});

const iso = (d: Date | null) => (d === null ? null : d.toISOString().slice(0, 10));

/* ══════════════════════════════════════════════════ one screen, two rail items ══ */

describe("OPEX — the two rail destinations", () => {
  it("UT-OPEX-001 the O&M rail item takes the FIRST account by Order", () => {
    // Ported from skeleton SKEL-OPEX-001.
    expect(modeFromNavKey("O&MKey")).toBe("om");
    expect(NAV_KEY_TO_MODE["O&MKey"]).toBe("om");
    expect(selectedAccount(accounts, "om")?.id).toBe("acc-om");
    expect(MODE_DISPLAY_NAME.om).toBe("Operation & Maintenance");
  });

  it("UT-OPEX-002 the Other OPEX rail item takes the LAST account by Order", () => {
    // Ported from skeleton SKEL-OPEX-002.
    expect(modeFromNavKey("OtherOpexCostsKey")).toBe("other");
    expect(selectedAccount(accounts, "other")?.id).toBe("acc-other");
    expect(MODE_DISPLAY_NAME.other).toBe("Other OPEX Costs");
  });

  it("UT-OPEX-003 the account rule is POSITIONAL, not a name match", () => {
    // CANVAS DIVERGENCE FROM THE SKELETON — skeleton SKEL-OPEX-002b asserts the opposite, that a
    // name match wins over First/Last. `OnVisible:9-14` has no name match at all.
    const reordered = [
      { id: "acc-other", name: MODE_DISPLAY_NAME.other, order: 1 },
      { id: "acc-om", name: MODE_DISPLAY_NAME.om, order: 2 },
    ];
    expect(selectedAccount(reordered, "om")?.id).toBe("acc-other");
    expect(selectedAccount(reordered, "other")?.id).toBe("acc-om");
    // The skeleton's behaviour stays reachable for a side-by-side review.
    expect(selectedAccountByName(reordered, "om")?.id).toBe("acc-om");
    expect(selectedAccount([], "om")).toBeNull();
  });

  it("UT-OPEX-004 switching rail items re-derives the mode", () => {
    // Ported from skeleton SKEL-OPEX-003.
    expect(modeFromNavKey("LandLeaseKey")).toBeNull();
    expect(modeFromNavKey(null)).toBeNull();
    expect(modeFromNavKey("")).toBeNull();
  });

  it("UT-OPEX-005 the Threshold column exists only in O&M mode", () => {
    // Ported from skeleton SKEL-OPEX-004.
    expect(showThresholdColumn("om")).toBe(true);
    expect(showThresholdColumn("other")).toBe(false);
    expect(isOandMSubaccount(sub())).toBe(true);
    expect(isOandMSubaccount(sub({ name: "Insurance" }))).toBe(false);
    expect(isOandMSubaccount(null)).toBe(false);
  });

  it("UT-OPEX-006 Other OPEX lists only Other-OPEX sub-accounts, ordered by vsb_order", () => {
    // Ported from skeleton SKEL-OPEX-005. Order is master data, never alphabetical: the real
    // rows are TCMA(1), Environmental(2), Administration(3) … measured on VSBCloud_Dev.
    const all = [
      sub({ id: "s-om", accountName: MODE_DISPLAY_NAME.om, order: 1 }),
      sub({ id: "s-admin", name: "Administration", accountName: MODE_DISPLAY_NAME.other, order: 3 }),
      sub({ id: "s-tcma", name: "TCMA", accountName: MODE_DISPLAY_NAME.other, order: 1 }),
      sub({ id: "s-env", name: "Environmental", accountName: MODE_DISPLAY_NAME.other, order: 2 }),
    ];
    expect(subaccountsForMode(all, "other").map((s) => s.id))
      .toEqual(["s-tcma", "s-env", "s-admin"]);
    expect(subaccountsForMode(all, "om")).toHaveLength(4);
  });

  it("UT-OPEX-007 locSelectedSubaccount is the account's lowest-Order sub-account", () => {
    const all = [
      sub({ id: "s-admin", name: "Administration", accountId: "acc-other", order: 3 }),
      sub({ id: "s-tcma", name: "TCMA", accountId: "acc-other", order: 1 }),
      sub({ id: "s-om", accountId: "acc-om", order: 1 }),
    ];
    expect(defaultSubaccount(all, accounts[1]!)?.id).toBe("s-tcma");
    expect(defaultSubaccount(all, accounts[0]!)?.id).toBe("s-om");
    expect(defaultSubaccount(all, null)).toBeNull();
  });

  it("UT-OPEX-008 O&M lists WTG types by the generator's Created On, then PV", () => {
    // Ported from skeleton SKEL-OPEX-006.
    const list = deviceTypeList(
      [
        { id: "g2", name: "WTG 2", typeInProjectId: "t2", createdOn: "2026-02-01", displayName: "V150-6.0" },
        { id: "g1", name: "WTG 1", typeInProjectId: "t1", createdOn: "2026-01-01", displayName: "V162-6.2" },
      ],
      [{ id: "p1", name: "PV 1", typeInProjectId: "t3", createdOn: null, displayName: "Modul A" }],
    );
    expect(list.map((d) => d.id)).toEqual(["g1", "g2", "p1"]);
    expect(list.every((d) => d.isFolded)).toBe(true);
    expect(list[2]?.kind).toBe("pv");
    expect(deviceTypeList([], [])).toHaveLength(0);
  });

  it("UT-OPEX-009 the O&M empty state is the canvas wording, verbatim", () => {
    // CANVAS DIVERGENCE FROM THE SKELETON — skeleton SKEL-OPEX-007 reworded this to point at a
    // "Generators screen". `lbl_..._GeneratorsInProject_Instruction.Text:309` is transcribed.
    expect(OPEX_MSG.noGenerators)
      .toBe("Please add a generator and refresh this page to enter Operation & Maintenance costs");
  });

  it("UT-OPEX-010 the record type keys off the device row's name, and gates EUR/WTG", () => {
    expect(addPeriodRecordType("WTG 1")).toBe("Generator");
    expect(addPeriodRecordType("PV Module 1")).toBe("PVModule");
    // SOURCE DEFECT O-13: a generator row named anything but `WTG…` loses its EUR/WTG field.
    expect(addPeriodRecordType("Turbine 1")).toBe("PVModule");
    expect(showEurPerWtgField("Generator")).toBe(true);
    expect(showEurPerWtgField("PVModule")).toBe(false);
    // Blank means the Other-OPEX bar opened the panel, which resets it (`:577`).
    expect(showEurPerWtgField(null)).toBe(true);
  });

  it("UT-OPEX-011 costs are scoped by device or sub-account and sorted", () => {
    // Ported from skeleton SKEL-OPEX-008/009.
    const costs = [
      cost({ id: "1", deviceTypeInProjectId: "dev-A", description: "Z", startDate: "2027-01-01" }),
      cost({ id: "2", deviceTypeInProjectId: "dev-A", description: "A", startDate: "2028-01-01" }),
      cost({ id: "3", deviceTypeInProjectId: "dev-B", description: "M" }),
      cost({ id: "4", deviceTypeInProjectId: null, subaccountId: "sub-9", description: "Q" }),
    ];
    expect(costsForDevice(costs, "dev-A").map((c) => c.id)).toEqual(["2", "1"]);
    expect(costsForSubaccount(costs, "sub-9").map((c) => c.id)).toEqual(["4"]);
    expect(costsInScope(costs, "om", "dev-B").map((c) => c.id)).toEqual(["3"]);
    expect(costsInScope(costs, "other", "sub-9").map((c) => c.id)).toEqual(["4"]);
    expect(costsInScope(costs, "om", null)).toEqual([]);
  });

  it("UT-OPEX-012 the outer sort is Description, with Start Date as the tie-break", () => {
    const sorted = sortCosts([
      cost({ id: "b", description: "Same", startDate: "2029-01-01" }),
      cost({ id: "a", description: "Same", startDate: "2027-01-01" }),
    ]);
    expect(sorted.map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("UT-OPEX-013 the table header differs by mode and carries the ISO currency code", () => {
    const om = opexColumns("om", "PLN").map((c) => c.label);
    expect(om).toContain("Fix Costs p.a. [PLN]");
    expect(om).toContain("Threshold for PLN/MWh p.a.");
    expect(om).toContain("PLN/WTG p.a.");
    const other = opexColumns("other", "EUR").map((c) => c.label);
    expect(other).not.toContain("Threshold [MWh]");
    expect(other.some((l) => l.startsWith("Threshold"))).toBe(false);
    // The rate columns fall back to "Cur." and Fix Costs to "EUR" — the canvas' own mismatch.
    const blank = opexColumns("om", null).map((c) => c.label);
    expect(blank).toContain("Fix Costs p.a. [EUR]");
    expect(blank).toContain("Cur./MWh p.a.");
  });
});

/* ══════════════════════════════════════════════════════════════ period chains ══ */

describe("OPEX — period chains", () => {
  const root = cost({ id: "r", name: "Sub-Dev-Service", description: "Service" });
  const p2 = cost({
    id: "p2", name: "Sub-Dev-Service - 2", description: "Service - 2", parentCostId: "r",
    startDate: "2032-01-01",
  });
  const p3 = cost({
    id: "p3", name: "Sub-Dev-Service - 3", description: "Service - 3", parentCostId: "r",
    startDate: "2037-01-01",
  });
  const chain = groupChains([p3, root, p2])[0]!;

  it("UT-OPEX-014 chains group by Parent Cost with the root first", () => {
    expect(chain.root.id).toBe("r");
    expect(chain.periods.map((p) => p.id)).toEqual(["r", "p2", "p3"]);
    expect(lastPeriod(chain).id).toBe("p3");
    expect(chainOf([chain], "p2")?.root.id).toBe("r");
    expect(chainOf([chain], "nope")).toBeNull();
    expect(childrenOf([root, p2, p3], "r").map((c) => c.id)).toEqual(["p2", "p3"]);
  });

  it("UT-OPEX-015 the chain is two levels deep and chainHead resolves either way", () => {
    expect(chainHead([root, p2, p3], p3).id).toBe("r");
    expect(chainHead([root, p2, p3], root).id).toBe("r");
    // An orphan whose parent is not loaded falls back to itself, as Coalesce does.
    expect(chainHead([p2], p2).id).toBe("p2");
  });

  it("UT-OPEX-016 the two 'last period' rules use different sort keys", () => {
    // `lastPeriod` sorts by Name (the command bars); `lastPeriodByStartDate` by Start Date
    // (the sub-account duration badge). They disagree once a date is edited by hand.
    const edited = groupChains([
      root,
      cost({ id: "p2", name: "Sub-Dev-Service - 2", parentCostId: "r", startDate: "2040-01-01" }),
      cost({ id: "p3", name: "Sub-Dev-Service - 3", parentCostId: "r", startDate: "2033-01-01" }),
    ])[0]!;
    expect(lastPeriod(edited).id).toBe("p3");
    expect(lastPeriodByStartDate(edited).id).toBe("p2");
  });

  it("UT-OPEX-017 a new period starts where the previous one ended", () => {
    // Ported from skeleton SKEL-OPEX-010.
    const start = nextStartDate(
      { startDate: "2027-01-01", durationYears: 2, durationMonths: 6 }, null,
    );
    expect(iso(start)).toBe("2029-07-01");
  });

  it("UT-OPEX-018 a brand-new cost type defaults to COD", () => {
    // Ported from skeleton SKEL-OPEX-011.
    expect(iso(nextStartDate(null, "2027-04-01"))).toBe("2027-04-01");
    expect(nextStartDate(null, null)).toBeNull();
  });

  it("UT-OPEX-019 DateAdd clamps the day to the end of a short month", () => {
    expect(iso(addMonths(new Date("2027-01-31T12:00:00"), 1))).toBe("2027-02-28");
    expect(iso(periodEndDate({ startDate: "2027-01-01", durationYears: 23, durationMonths: 0 })))
      .toBe("2049-12-31");
    expect(periodEndDate({ startDate: null, durationYears: 1, durationMonths: 0 })).toBeNull();
  });

  it("UT-OPEX-020 the start-date picker walks five branches, months and all", () => {
    const base = {
      selected: null, parent: null, next: null, deviceId: null,
      deviceCosts: [] as OpexCost[], codDate: "2027-04-01", resetStartDate: false,
    };
    // 1 — editing, or a reset, goes to locCODDate.
    expect(iso(startDateDefault({ ...base, selected: cost() }).date)).toBe("2027-04-01");
    expect(iso(startDateDefault({ ...base, resetStartDate: true }).date)).toBe("2027-04-01");
    // 2 — adding a period continues the previous one.
    expect(iso(startDateDefault({
      ...base,
      parent: cost({ id: "r" }),
      next: cost({ startDate: "2027-01-01", durationYears: 5, durationMonths: 0 }),
    }).date)).toBe("2032-01-01");
    // 4 — nothing selected at all.
    expect(iso(startDateDefault(base).date)).toBe("2027-04-01");
    // 3 with no rows on the card.
    expect(iso(startDateDefault({ ...base, deviceId: "dev-A" }).date)).toBe("2027-04-01");
  });

  it("UT-OPEX-021 SOURCE DEFECT O-6 — the device branch drops the months", () => {
    // `:5862-5864` reads the MONTHS off `locSelectedOpexCostParent`, which is blank in this
    // branch, so a 5-year-6-month period advances the date by 5 years only.
    const result = startDateDefault({
      selected: null, parent: null, next: null, deviceId: "dev-A",
      deviceCosts: [cost({
        startDate: "2027-01-01", durationYears: 5, durationMonths: 6, createdOn: "2026-05-01",
      })],
      codDate: "2027-04-01", resetStartDate: false,
    });
    expect(iso(result.date)).toBe("2032-01-01");
    expect(result.defectiveMonths).toBe(6);
  });

  it("UT-OPEX-022 the device branch takes the LAST-CREATED row, not the latest-starting", () => {
    const result = startDateDefault({
      selected: null, parent: null, next: null, deviceId: "dev-A",
      deviceCosts: [
        cost({ id: "late", startDate: "2040-01-01", durationYears: 1, createdOn: "2026-01-01" }),
        cost({ id: "new", startDate: "2028-01-01", durationYears: 1, createdOn: "2026-09-01" }),
      ],
      codDate: "2027-04-01", resetStartDate: false,
    });
    expect(iso(result.date)).toBe("2029-01-01");
  });

  it("UT-OPEX-023 the period description auto-numbers, and the two canvas formulas disagree", () => {
    expect(nextPeriodDescription("Service")).toBe("Service - 2");
    expect(nextPeriodDescription("Service - 2")).toBe("Service - 3");
    expect(nextPeriodDescriptionPanel(
      { description: "Service - 2" }, { description: "Service" },
    )).toBe("Service - 3");
    // SOURCE DEFECT O-7 — the row-select version anchors on the FIRST " - " and loses the rest
    // of the stem; the panel's own version, which finds the whole " - <n>" suffix, does not.
    expect(nextPeriodDescription("A - B - 2")).toBe("A - 3");
    expect(nextPeriodDescriptionPanel(
      { description: "A - B - 2" }, { description: "A - B" },
    )).toBe("A - B - 3");
    // The panel only increments when the previous period differs from the chain root.
    expect(nextPeriodDescriptionPanel(
      { description: "Service - 2" }, { description: "Service - 2" },
    )).toBe("Service - 2 - 2");
    expect(nextPeriodDescriptionPanel(null, null)).toBe(" - 2");
  });

  it("UT-OPEX-024 selecting a row toggles, and recomputes the candidate description", () => {
    const empty = { selectedId: null, scopeId: null, candidateDescription: "", parentCostId: null };
    const picked = toggleRowSelection({ current: empty, row: p2, cardScopeId: "card-1" });
    expect(picked).toEqual({
      selectedId: "p2", scopeId: "card-1",
      candidateDescription: "Service - 3", parentCostId: "r",
    });
    expect(toggleRowSelection({ current: picked, row: p2, cardScopeId: "card-1" })).toEqual(empty);
  });
});

/* ═══════════════════════════════════════════════════════════════ command bars ══ */

describe("OPEX — the two command bars", () => {
  const root = cost({ id: "r", name: "Sub-Dev-Service", description: "Service" });
  const p2 = cost({
    id: "p2", name: "Sub-Dev-Service - 2", description: "Service - 2", parentCostId: "r",
  });
  const p3 = cost({
    id: "p3", name: "Sub-Dev-Service - 3", description: "Service - 3", parentCostId: "r",
  });

  it("UT-OPEX-025 the O&M bar has four commands and no Add Contract Type", () => {
    // Ported from skeleton SKEL-OPEX-044's second half.
    expect(visibleCommands("om")).toEqual([
      "newOpexProjectCost", "addStandardContract", "editOpexProjectCost", "deleteOpexProjectCost",
    ]);
    expect(visibleCommands("other")).toHaveLength(5);
    expect(visibleCommands("other")[0]).toBe("newOpexProjectCostType");
    expect(OPEX_COMMAND_LABELS.newOpexProjectCostType).toBe("Add Contract Type");
    expect(OPEX_COMMAND_LABELS.newOpexProjectCost).toBe("Add Period");
    expect(OPEX_COMMAND_LABELS.addStandardContract).toBe("Add Standard Contract");
    expect(OPEX_COMMAND_LABELS.editOpexProjectCost).toBe("Edit");
    expect(OPEX_COMMAND_LABELS.deleteOpexProjectCost).toBe("Delete");
  });

  it("UT-OPEX-026 Add Contract Type needs the selection cleared on its OWN card only", () => {
    expect(canAddContractType(commandArgs())).toBe(true);
    expect(canAddContractType(commandArgs({ selected: root }))).toBe(false);
    // A selection on another card does not block it.
    expect(canAddContractType(commandArgs({ selected: root, selectedScopeId: "card-2" })))
      .toBe(true);
    // A standard contract in the sub-account blocks it outright.
    expect(canAddContractType(commandArgs({
      cardCosts: [cost({ isStandardContract: true })],
    }))).toBe(false);
    expect(canAddContractType(commandArgs({ permissions: { ...perms, canCreate: false } })))
      .toBe(false);
    // O&M has no such command.
    expect(canAddContractType(commandArgs({ mode: "om" }))).toBe(false);
  });

  it("UT-OPEX-027 O&M Add Period doubles as Add Contract Type on an EMPTY device card", () => {
    // The canvas' first disjunct (`:2780-2787`). The skeleton has no equivalent, so a
    // brand-new device type could never get its first cost.
    expect(canAddPeriod(commandArgs({ mode: "om", selected: null, cardCosts: [] }))).toBe(true);
    expect(canAddPeriod(commandArgs({ mode: "om", selected: null, cardCosts: [root] })))
      .toBe(false);
    expect(canAddPeriod(commandArgs({
      mode: "om", selected: null, cardCosts: [], permissions: { ...perms, canCreate: false },
    }))).toBe(false);
  });

  it("UT-OPEX-028 O&M Add Period is only enabled on the chain's LAST period", () => {
    // Ported from skeleton SKEL-OPEX-012.
    const cardCosts = [root, p2, p3];
    expect(canAddPeriod(commandArgs({ mode: "om", selected: p2, cardCosts }))).toBe(false);
    expect(canAddPeriod(commandArgs({ mode: "om", selected: p3, cardCosts }))).toBe(true);
    expect(canAddPeriod(commandArgs({
      mode: "om", selected: p3, cardCosts, selectedScopeId: "card-2",
    }))).toBe(false);
    // A one-period cost type is its own last period.
    expect(canAddPeriod(commandArgs({ mode: "om", selected: root, cardCosts: [root] })))
      .toBe(true);
  });

  it("UT-OPEX-029 Other-OPEX Add Period has NO last-period rule", () => {
    // CANVAS DIVERGENCE FROM THE SKELETON — skeleton SKEL-OPEX-012 applies the last-period rule
    // to both modes. `:438-468` has no such clause on the sub-account bar.
    expect(canAddPeriod(commandArgs({ selected: p2, cardCosts: [root, p2, p3] }))).toBe(true);
  });

  it("UT-OPEX-030 SOURCE DEFECT O-8 — the duplicate guard is not scoped to the card", () => {
    // In Other OPEX mode both sides of the device comparison are blank, so `Blank() = Blank()`
    // is true for every Other-OPEX row in the project.
    const elsewhere = cost({ id: "x", subaccountId: "sub-other", description: "Service - 2" });
    expect(descriptionIsFree("Service - 2", [elsewhere], null)).toBe(false);
    expect(canAddPeriod(commandArgs({ selected: root, allCosts: [elsewhere] }))).toBe(false);
    expect(canAddPeriod(commandArgs({ selected: root, allCosts: [] }))).toBe(true);
    // A cost on a DEVICE is invisible to the Other-OPEX guard.
    const onDevice = cost({ description: "Service - 2", deviceTypeInProjectId: "dev-A" });
    expect(descriptionIsFree("Service - 2", [onDevice], null)).toBe(true);
  });

  it("UT-OPEX-031 Add Standard Contract needs an assumption and an EMPTY scope", () => {
    // Ported from skeleton SKEL-OPEX-018/019.
    expect(canAddStandardContract(commandArgs())).toBe(true);
    expect(canAddStandardContract(commandArgs({ cardCosts: [cost()] }))).toBe(false);
    expect(canAddStandardContract(commandArgs({ hasStandardAssumption: false }))).toBe(false);
    expect(canAddStandardContract(commandArgs({
      cardCosts: [cost({ isStandardContract: true })],
    }))).toBe(false);
    // CANVAS DIVERGENCE FROM THE SKELETON — the canvas carries NO CreatePermission check on
    // this command in either mode; the skeleton adds one. It is opt-in here.
    expect(canAddStandardContract(commandArgs(), true, false)).toBe(false);
    expect(canAddStandardContract(commandArgs(), false, false)).toBe(true);
  });

  it("UT-OPEX-032 standard-created costs cannot be edited or extended", () => {
    // Ported from skeleton SKEL-OPEX-013/014.
    const std = cost({ id: "s", isStandardContract: true });
    expect(isStandardLocked(std)).toBe(true);
    expect(isStandardLocked(cost({ name: "Standard O&M", isStandardContract: false }))).toBe(true);
    expect(canEditCost(commandArgs({ selected: std }))).toBe(false);
    expect(canAddPeriod(commandArgs({ mode: "om", selected: std, cardCosts: [std] })))
      .toBe(false);
    expect(canEditCost(commandArgs({ selected: cost() }))).toBe(true);
  });

  it("UT-OPEX-033 Edit and Delete honour the record privileges — in the code app", () => {
    // Ported from skeleton SKEL-OPEX-044.
    const noEdit = { canCreate: true, canEditRecord: false, canDeleteRecord: true };
    const noDelete = { canCreate: true, canEditRecord: true, canDeleteRecord: false };
    for (const mode of ["om", "other"] as const) {
      expect(canEditCost(commandArgs({ mode, selected: cost(), permissions: noEdit })))
        .toBe(false);
      expect(canDeleteCost(commandArgs({
        mode, selected: cost(), cardCosts: [cost()], permissions: noDelete,
      }))).toBe(false);
    }
  });

  it("UT-OPEX-034 SOURCE DEFECT O-1 — the O&M bar checks neither blankness nor RecordInfo", () => {
    const noEdit = { canCreate: true, canEditRecord: false, canDeleteRecord: false };
    // With a card selected and NO row, the canvas' O&M Edit renders enabled.
    expect(canEditCostCanvasParity(commandArgs({ mode: "om", selected: null }))).toBe(true);
    expect(canEditCost(commandArgs({ mode: "om", selected: null }))).toBe(false);
    // And a read-only row still offers Edit and Delete.
    expect(canEditCostCanvasParity(commandArgs({
      mode: "om", selected: cost(), permissions: noEdit,
    }))).toBe(true);
    expect(canDeleteCostCanvasParity(commandArgs({
      mode: "om", selected: cost(), cardCosts: [cost()], permissions: noEdit,
    }))).toBe(true);
    // The Other-OPEX bar is unaffected — the parity twin delegates.
    expect(canEditCostCanvasParity(commandArgs({
      mode: "other", selected: cost(), permissions: noEdit,
    }))).toBe(false);
  });

  it("UT-OPEX-035 a standard chain can only be deleted from its root", () => {
    // Ported from skeleton SKEL-OPEX-015.
    const stdRoot = cost({ id: "sr", description: "Standard O&M" });
    const stdChild = cost({
      id: "sc", name: "Sub-Dev-Standard O&M - 2", description: "Standard O&M - 2",
      parentCostId: "sr",
    });
    expect(isStandardByDescription(stdRoot)).toBe(true);
    expect(isStandardByDescription(cost({ description: "standard cover" }))).toBe(true);
    const cardCosts = [stdRoot, stdChild];
    expect(canDeleteCost(commandArgs({ selected: stdChild, cardCosts }))).toBe(false);
    expect(canDeleteCost(commandArgs({ selected: stdRoot, cardCosts }))).toBe(true);
  });

  it("UT-OPEX-036 a non-root period may only be deleted when it is the chain's LAST", () => {
    // CANVAS DIVERGENCE FROM THE SKELETON — skeleton SKEL-OPEX-015 asserts any non-standard leaf
    // deletes freely. `:546-571` requires `IsBlank('Parent Cost') OR selected = locLastPeriod`.
    const cardCosts = [root, p2, p3];
    expect(canDeleteCost(commandArgs({ selected: p2, cardCosts }))).toBe(false);
    expect(canDeleteCost(commandArgs({ selected: p3, cardCosts }))).toBe(true);
    expect(canDeleteCost(commandArgs({ selected: root, cardCosts }))).toBe(true);
    expect(canDeleteCost(commandArgs({ selected: null, cardCosts }))).toBe(false);
  });

  it("UT-OPEX-037 commands do not leak across cards", () => {
    expect(commandsInScope("card-A", "card-A")).toBe(true);
    expect(commandsInScope("card-A", "card-B")).toBe(false);
    expect(commandsInScope(null, "card-A")).toBe(false);
    const gates = opexCommands(commandArgs({
      selected: cost(), cardCosts: [cost()], selectedScopeId: "card-2",
    }));
    expect(gates.editOpexProjectCost).toBe(false);
    expect(gates.deleteOpexProjectCost).toBe(false);
    expect(gates.newOpexProjectCost).toBe(false);
  });
});

/* ══════════════════════════════════════════════════════ standard-assumption load ══ */

describe("OPEX — standard assumption import", () => {
  it("UT-OPEX-038 the assumption filter differs by mode", () => {
    // Ported from skeleton SKEL-OPEX-020.
    const scope = { countryId: "de", technology: 952850000, subaccountId: "sub-9" };
    const om = standardAssumptionFilter("om", scope);
    expect(om.typeOfContract).toBe(TYPE_OF_CONTRACT.opexOandM);
    expect(om.opexSubaccountId).toBeNull();
    const other = standardAssumptionFilter("other", scope);
    expect(other.typeOfContract).toBe(TYPE_OF_CONTRACT.opexOther);
    expect(other.opexSubaccountId).toBe("sub-9");
    expect(matchesStandardAssumption(assumption(), om)).toBe(true);
    expect(matchesStandardAssumption(assumption(), other)).toBe(false);
    expect(matchesStandardAssumption(assumption({
      typeOfContract: TYPE_OF_CONTRACT.opexOther, opexSubaccountId: "sub-9",
    }), other)).toBe(true);
    expect(matchesStandardAssumption(assumption({ countryId: "pl" }), om)).toBe(false);
    // CANVAS DIVERGENCE FROM THE SKELETON — Technology is an option-set VALUE, not a string.
    expect(matchesStandardAssumption(assumption({ technology: 952850001 }), om)).toBe(false);
  });

  it("UT-OPEX-039 the load chains the period start dates from COD", () => {
    // Ported from skeleton SKEL-OPEX-021.
    const starts = standardPeriodStarts("2027-04-01", [
      assumption({ id: "a1", description: "S", period: STANDARD_PERIOD.period1, durationYears: 5 }),
      assumption({
        id: "a2", description: "S - 2", period: STANDARD_PERIOD.period2, durationYears: 5,
      }),
      assumption({
        id: "a3", description: "S - 3", period: STANDARD_PERIOD.period3, durationYears: 10,
      }),
    ]);
    expect(starts.map((s) => iso(s.startDate)))
      .toEqual(["2027-04-01", "2032-04-01", "2037-04-01"]);
  });

  it("UT-OPEX-040 SOURCE DEFECT O-10 — the O&M loader sorts the chain by Description", () => {
    // `:3184-3186` sorts the growing collection by `Description`, `:796-798` by `Period`. With
    // ten periods the two answer differently, because "S - 10" sorts before "S - 2".
    const set = [
      assumption({ id: "a1", description: "S", period: STANDARD_PERIOD.period1, durationYears: 1 }),
      assumption({
        id: "a2", description: "S - 2", period: STANDARD_PERIOD.period2, durationYears: 1,
      }),
      assumption({
        id: "a3", description: "S - 3", period: STANDARD_PERIOD.period3, durationYears: 1,
      }),
      assumption({
        id: "a10", description: "S - 10", period: STANDARD_PERIOD.period10, durationYears: 1,
      }),
    ];
    const byPeriod = standardPeriodStarts("2027-04-01", set, "period");
    const byDescription = standardPeriodStarts("2027-04-01", set, "description");
    const pick = (rows: typeof byPeriod, id: string) =>
      iso(rows.find((r) => r.id === id)?.startDate ?? null);
    expect(pick(byPeriod, "a2")).toBe("2028-04-01");
    expect(pick(byDescription, "a2")).toBe("2028-04-01");
    // Period 3's start is computed off a different row under each sort key.
    expect(pick(byPeriod, "a3")).not.toBe(pick(byDescription, "a3"));
    expect(pick(byDescription, "a3")).toBe("2029-04-01");
  });

  it("UT-OPEX-041 the inflation start year is COD year + 1", () => {
    // Ported from skeleton SKEL-OPEX-022.
    expect(inflationStartYear("2027-04-01")).toBe(2028);
    expect(inflationStartYear(null)).toBeNull();
    expect(inflationStartYear("not a date")).toBeNull();
  });

  it("UT-OPEX-042 the country profile wins when both inflation flags are Yes", () => {
    // Ported from skeleton SKEL-OPEX-022/023/024.
    expect(resolveInflationProfile({
      useInflationProfile: true, useCountryInflationProfile: true, inflationProfile: 1.8,
    }, 2.4)).toBe(2.4);
    expect(resolveInflationProfile({
      useInflationProfile: true, useCountryInflationProfile: false, inflationProfile: 1.8,
    }, 2.4)).toBe(1.8);
    expect(resolveInflationProfile({
      useInflationProfile: false, useCountryInflationProfile: true, inflationProfile: 1.8,
    }, 2.4)).toBeNull();
  });

  it("UT-OPEX-043 every standard-created row is stamped", () => {
    // Ported from skeleton SKEL-OPEX-025.
    expect(STANDARD_STAMP).toEqual({
      isStandardContract: true, isStartDateStandardAssumption: true,
    });
  });

  it("UT-OPEX-044 the import seeds the assumption's figures and DERIVES the rest", () => {
    const rows = planStandardImport({
      mode: "other",
      assumptions: [
        assumption({
          id: "a1", description: " Standard Opex Insurance ", period: STANDARD_PERIOD.period1,
          typeOfContract: TYPE_OF_CONTRACT.opexOther, opexSubaccountId: "sub-ins",
          durationYears: 5, durationMonths: 0, fixCosts: 4200, eurPerWtg: 900,
          useInflationProfile: true, useCountryInflationProfile: true, inflationProfile: 1.8,
          alignWithProjectDuration: true, externalContract: true,
          distributionFrequency: 6, aggregation: OPEX_AGGREGATION.sum,
          threshold: true, thresholdType: THRESHOLD_TYPE.individual, thresholdIndividual: 500,
        }),
        assumption({
          id: "a2", description: "Standard Opex Insurance - 2", period: STANDARD_PERIOD.period2,
          typeOfContract: TYPE_OF_CONTRACT.opexOther, opexSubaccountId: "sub-ins",
          durationYears: 10, durationMonths: 0,
        }),
      ],
      subaccount: sub({ id: "sub-ins", name: "Insurance", accountName: MODE_DISPLAY_NAME.other }),
      deviceTypeInProjectId: null,
      project,
      countryProfile: 2.4,
    });
    const [first, second] = rows;
    // Derived, not copied.
    expect(first?.name).toBe("Other OPEX Costs-Insurance- Standard Opex Insurance ");
    expect(first?.description).toBe("Standard Opex Insurance");
    expect(iso(first?.startDate ?? null)).toBe("2027-04-01");
    expect(first?.inflationProfile).toBe(2.4); // the COUNTRY profile, not the assumption's 1.8
    expect(first?.inflationStartYear).toBe(2028);
    expect(first?.parentKey).toBeNull();
    expect(first?.owningBusinessUnitId).toBe("bu-1");
    expect(first?.deviceTypeInProjectId).toBeNull();
    // Seeded verbatim.
    expect(first?.fixCosts).toBe(4200);
    expect(first?.eurPerWtg).toBe(900);
    expect(first?.threshold).toBe(true);
    expect(first?.thresholdType).toBe(THRESHOLD_TYPE.individual);
    expect(first?.thresholdIndividual).toBe(500);
    expect(first?.distributionFrequency).toBe(6);
    expect(first?.alignWithProjectDuration).toBe(true);
    expect(first?.externalContract).toBe(true);
    expect(first?.isStandardContract).toBe(true);
    expect(first?.isStartDateStandardAssumption).toBe(true);
    // Period 2 hangs off period 1 and continues its dates.
    expect(second?.parentKey).toBe("a1");
    expect(iso(second?.startDate ?? null)).toBe("2032-04-01");
  });

  it("UT-OPEX-045 O&M imports against the device and names off the account", () => {
    // Ported from skeleton SKEL-OPEX-028/029.
    const rows = planStandardImport({
      mode: "om",
      assumptions: [assumption({ description: "Standard Operation & Maintenance" })],
      subaccount: sub(),
      deviceTypeInProjectId: "dev-A",
      project,
      countryProfile: null,
    });
    expect(rows[0]?.deviceTypeInProjectId).toBe("dev-A");
    expect(rows[0]?.subaccountId).toBe("sub-om");
    expect(rows[0]?.name)
      .toBe("Operation & Maintenance-Operation & Maintenance-Standard Operation & Maintenance");
    expect(standardCostName("other", "Insurance", "Standard cover"))
      .toBe("Other OPEX Costs-Insurance-Standard cover");
    expect(deviceTypeForSave("om", "dev-1")).toBe("dev-1");
    expect(deviceTypeForSave("other", "dev-1")).toBeNull();
  });
});

/* ════════════════════════════════════════════════════════════ the save cascade ══ */

describe("OPEX — save and cascade", () => {
  const parent = cost({
    id: "r", useInflationProfile: true, useCountryInflationProfile: true, inflationProfile: 2.4,
    inflationStartYear: 2028, inflationCountryArea: "Centre - South",
    threshold: true, thresholdType: THRESHOLD_TYPE.individual, thresholdIndividual: 500,
    externalContract: true, alignWithProjectDuration: true, fixCosts: 9999, durationYears: 7,
  });
  const kids = [
    cost({ id: "c1", parentCostId: "r", fixCosts: 1, durationYears: 1 }),
    cost({ id: "c2", parentCostId: "r", fixCosts: 2, durationYears: 2 }),
  ];

  it("UT-OPEX-046 saving a parent cascades exactly ten fields to every child", () => {
    // Ported from skeleton SKEL-OPEX-026.
    const plan = cascadeToChildren(parent, kids);
    expect(plan.map((p) => p.id)).toEqual(["c1", "c2"]);
    expect(Object.keys(plan[0]!.payload).sort()).toEqual([...CASCADED_FIELDS].sort());
    expect(plan[0]!.payload.inflationProfile).toBe(2.4);
    expect(plan[0]!.payload.inflationCountryArea).toBe("Centre - South");
    expect(plan[0]!.payload.thresholdIndividual).toBe(500);
    expect(plan[0]!.payload.externalContract).toBe(true);
    // Rates, dates and durations are NOT cascaded.
    expect(Object.keys(plan[0]!.payload)).not.toContain("fixCosts");
    expect(Object.keys(plan[0]!.payload)).not.toContain("startDate");
    expect(Object.keys(plan[0]!.payload)).not.toContain("durationYears");
  });

  it("UT-OPEX-047 the cascade does not run without children, and takes the panel toggles", () => {
    // Ported from skeleton SKEL-OPEX-027. The canvas reads the last two from the CONTROLS.
    expect(cascadeToChildren(parent, [])).toEqual([]);
    const plan = cascadeToChildren(parent, kids, {
      alignWithProjectDuration: false, externalContract: false,
    });
    expect(plan[0]!.payload.alignWithProjectDuration).toBe(false);
    expect(plan[0]!.payload.externalContract).toBe(false);
  });

  it("UT-OPEX-048 the Time Zone Rule Version Number is written literally", () => {
    expect(TIME_ZONE_RULE_VERSION_NUMBER).toBe(4);
  });

  it("UT-OPEX-049 the saved Name differs by mode and keeps the untrimmed description", () => {
    // Ported from skeleton SKEL-OPEX-028.
    const parts = {
      accountName: "Other OPEX Costs", subaccountName: "Insurance", deviceName: "WTG 1",
    };
    expect(costName(parts, "Service")).toBe("Insurance-WTG 1-Service");
    expect(costName({ ...parts, deviceName: null }, "Service"))
      .toBe("Other OPEX Costs-Insurance-Service");
    // `Name` interpolates the RAW value while `Description` is trimmed.
    expect(costName(parts, "Service ")).toBe("Insurance-WTG 1-Service ");
  });

  it("UT-OPEX-050 the save payload blanks the inflation fields when the toggles are off", () => {
    const base = {
      mode: "other" as const, accountName: "Other OPEX Costs",
      subaccount: sub({ id: "sub-ins", name: "Insurance" }),
      deviceTypeInProjectId: null, deviceName: null, parent: null,
      isStartDateStandardAssumption: false, owningBusinessUnitId: "bu-1",
    };
    const off = opexCostWrite(form({
      description: " Service ", inflationOn: false, useCountryInflationProfile: false,
      inflationStartYear: "2028", inflationProfile: "2.4", inflationCountryArea: "North",
    }), base);
    expect(off.description).toBe("Service");
    expect(off.name).toBe("Other OPEX Costs-Insurance- Service ");
    expect(off.inflationProfile).toBeNull();
    expect(off.inflationStartYear).toBeNull();
    expect(off.inflationCountryArea).toBeNull();
    expect(off.startDate).toBe("2027-01-01");
    expect(off.timeZoneRuleVersionNumber).toBe(4);
    expect(off.parentCostId).toBeNull();

    const on = opexCostWrite(form({
      inflationOn: true, useCountryInflationProfile: true,
      inflationStartYear: "2028", inflationProfile: "2.4", inflationCountryArea: "North",
    }), base);
    expect(on.inflationProfile).toBe(2.4);
    expect(on.inflationStartYear).toBe(2028);
    expect(on.inflationCountryArea).toBe("North");
  });

  it("UT-OPEX-051 a blank money field saves as Blank(), not zero", () => {
    const write = opexCostWrite(form({ fixCosts: "", eurPerMwh: "12.50" }), {
      mode: "om", accountName: "Operation & Maintenance", subaccount: sub(),
      deviceTypeInProjectId: "dev-A", deviceName: "WTG 1", parent: null,
      isStartDateStandardAssumption: true, owningBusinessUnitId: "bu-1",
    });
    expect(write.fixCosts).toBeNull();
    expect(write.eurPerMwh).toBe(12.5);
    expect(write.deviceTypeInProjectId).toBe("dev-A");
    expect(write.name).toBe("Operation & Maintenance-WTG 1-Service");
    expect(write.isStartDateStandardAssumption).toBe(true);
  });

  it("UT-OPEX-052 a child period inherits its parent's start-date standard flag", () => {
    expect(inheritStartDateStandard({ isStartDateStandardAssumption: true }, false)).toBe(true);
    expect(inheritStartDateStandard(null, true)).toBe(true);
    expect(startDateStandardFlagAfterManualChange(null)).toBe(false);
    expect(startDateStandardFlagAfterManualChange("parent")).toBe(true);
    expect(startDateStandardFlagAfterManualChange(undefined)).toBe(false);
  });

  it("UT-OPEX-053 the refresh icon appears on a chain root only, and re-sets the flag", () => {
    expect(resetStartDateVisible({ selected: null, parent: null })).toBe(true);
    expect(resetStartDateVisible({ selected: cost({ parentCostId: null }), parent: null }))
      .toBe(true);
    expect(resetStartDateVisible({ selected: cost({ parentCostId: "r" }), parent: null }))
      .toBe(false);
    expect(resetStartDateVisible({ selected: null, parent: cost() })).toBe(false);
    expect(resetStartDateFlag({ selected: null, parent: null, next: null })).toBe(true);
    expect(resetStartDateFlag({
      selected: cost({ parentCostId: null }), parent: null, next: null,
    })).toBe(true);
    expect(resetStartDateFlag({
      selected: cost({ parentCostId: "r" }), parent: cost(), next: cost(),
    })).toBe(false);
  });
});

/* ══════════════════════════════════════════════════════════════════ deleting ══ */

describe("OPEX — deleting", () => {
  const root = cost({ id: "r", description: "Service" });
  const p2 = cost({ id: "p2", description: "Service - 2", parentCostId: "r" });
  const p3 = cost({ id: "p3", description: "Service - 3", parentCostId: "r" });

  it("UT-OPEX-054 deleting a chain root deletes every period", () => {
    // Ported from skeleton SKEL-OPEX-016.
    const plan = planDeleteCost([root, p2, p3], root);
    expect(plan.ids).toEqual(["r", "p2", "p3"]);
    expect(plan.cascades).toBe(true);
  });

  it("UT-OPEX-055 deleting a period deletes only that row", () => {
    // Ported from skeleton SKEL-OPEX-017.
    const plan = planDeleteCost([root, p2, p3], p3);
    expect(plan.ids).toEqual(["p3"]);
    expect(plan.cascades).toBe(false);
  });

  it("UT-OPEX-056 the confirmation strings are transcribed verbatim", () => {
    expect(DELETE_DIALOG.title).toBe("Delete OPEX cost?");
    expect(DELETE_DIALOG.confirm).toBe("Delete");
    expect(DELETE_DIALOG.cancel).toBe("Cancel");
    expect(deleteDialogSingleText("Service"))
      .toBe('Are you sure that you want to permanently delete "Service" cost?');
    // The cascade wording is missing its space before "Cost" — reproduced, not corrected.
    expect(deleteDialogCascadeText("Service"))
      .toBe('Are you sure that you want to permanently delete "Service"Cost and all its related periods?');
  });

  it("UT-OPEX-057 SOURCE DEFECT O-3 — the canvas dialog never warns about the cascade", () => {
    // Ported from skeleton SKEL-OPEX-047.
    expect(deleteDialogText(root)).toBe(deleteDialogCascadeText("Service"));
    expect(deleteDialogText(p3)).toBe(deleteDialogSingleText("Service - 3"));
    // `.Description` tests the SELECTION, which is never blank when the dialog opens, so the
    // cascade branch is unreachable while `OnConfirm` cascades anyway.
    expect(deleteDialogTextCanvasParity(root)).toBe(deleteDialogSingleText("Service"));
    expect(deleteDialogTextCanvasParity(null)).toBe(deleteDialogCascadeText(""));
  });
});

/* ═════════════════════════════════════════════════════════════ duration badge ══ */

describe("OPEX — duration badges", () => {
  const lands = (o: Partial<OpexCost> = {}) =>
    cost({ startDate: "2027-01-01", durationYears: 23, durationMonths: 0, ...o });
  const misses = (o: Partial<OpexCost> = {}) =>
    cost({ startDate: "2027-01-01", durationYears: 20, durationMonths: 0, ...o });

  it("UT-OPEX-058 the badge matches when every aligned cost type lands on the project end", () => {
    // Ported from skeleton SKEL-OPEX-041.
    expect(iso(periodEndDate(lands()))).toBe("2049-12-31");
    expect(durationBadge([lands({ id: "r", alignWithProjectDuration: true })], project))
      .toBe("match");
    expect(DURATION_BADGE_TEXT.match).toBe("Duration Match");
  });

  it("UT-OPEX-059 an aligned cost type that ends early is a mismatch", () => {
    // Ported from skeleton SKEL-OPEX-042.
    expect(durationBadge([misses({ id: "r", alignWithProjectDuration: true })], project))
      .toBe("mismatch");
    expect(DURATION_BADGE_TEXT.mismatch).toBe("Duration Mismatch");
  });

  it("UT-OPEX-060 the badge is none with nothing to judge", () => {
    // Ported from skeleton SKEL-OPEX-043.
    expect(durationBadge([], project)).toBe("none");
    expect(durationBadge([cost()], { projectStartDate: null, endDate: null })).toBe("none");
    expect(DURATION_BADGE_TEXT.none).toBe("");
  });

  it("UT-OPEX-061 an UNALIGNED cost type that misses leaves the badge neutral", () => {
    expect(durationBadge([misses({ id: "r", alignWithProjectDuration: false })], project))
      .toBe("none");
    // ... but an unaligned one that happens to land still reads Duration Match (arm 6).
    expect(durationBadge([lands({ id: "r", alignWithProjectDuration: false })], project))
      .toBe("match");
  });

  it("UT-OPEX-062 CANVAS DIVERGENCE — one aligned landing beats an unaligned miss", () => {
    // Arm 9 (`:2665-2666`), added deliberately per the comment in the source. The skeleton's
    // `durationBadge` answers "none" here; the canvas answers "Duration Match".
    expect(durationBadge([
      lands({ id: "a", description: "A", alignWithProjectDuration: true }),
      misses({ id: "b", description: "B", alignWithProjectDuration: false }),
    ], project)).toBe("match");
    // With the aligned one ALSO missing it falls to arm 8.
    expect(durationBadge([
      misses({ id: "a", description: "A", alignWithProjectDuration: true }),
      misses({ id: "b", description: "B", alignWithProjectDuration: false }),
    ], project)).toBe("mismatch");
  });

  it("UT-OPEX-063 only the LAST period of each cost type is judged", () => {
    const costs = [
      cost({ id: "r", startDate: "2027-01-01", durationYears: 2 }),
      cost({
        id: "p2", name: "Sub-Dev-Service - 2", parentCostId: "r", startDate: "2029-01-01",
        durationYears: 21, alignWithProjectDuration: true,
      }),
    ];
    expect(durationBadge(costs, project)).toBe("match");
  });

  it("UT-OPEX-064 SOURCE DEFECT O-4 — the O&M badge judges ONE row for the whole card", () => {
    // `:5222-5297` takes `Last(Sort(Sort(cardCosts, 'Start Date'), Description))`, so a second
    // cost type on the same device is ignored entirely.
    const costs = [
      lands({ id: "a", description: "A", alignWithProjectDuration: true }),
      misses({ id: "z", description: "Z", alignWithProjectDuration: true }),
    ];
    expect(omDurationBadge(costs, project)).toBe("mismatch");
    // The sub-account algorithm sees both and still says mismatch — but for a different reason.
    expect(durationBadge(costs, project)).toBe("mismatch");
    // Reversed, the O&M badge reports the LAST row by description and forgets the miss.
    expect(omDurationBadge([
      misses({ id: "a", description: "A", alignWithProjectDuration: true }),
      lands({ id: "z", description: "Z", alignWithProjectDuration: true }),
    ], project)).toBe("match");
    expect(omDurationBadge([], project)).toBe("none");
  });

  it("UT-OPEX-065 the row alignment warning differs between the two galleries", () => {
    const root = misses({ id: "r", description: "Service", alignWithProjectDuration: true });
    const p2 = misses({
      id: "p2", name: "Sub-Dev-Service - 2", description: "Service - 2", parentCostId: "r",
      alignWithProjectDuration: true,
    });
    // Other OPEX: only the chain's last period carries the icon.
    expect(otherAlignWarningVisible(root, [root, p2], project)).toBe(false);
    expect(otherAlignWarningVisible(p2, [root, p2], project)).toBe(true);
    // SOURCE DEFECT O-4b — the O&M icon has no per-row term, so it is on or off for the card.
    expect(omAlignWarningVisible([root, p2], project)).toBe(true);
    expect(omAlignWarningVisible([
      cost({ startDate: "2027-01-01", durationYears: 23, alignWithProjectDuration: true }),
    ], project)).toBe(false);
  });
});

/* ══════════════════════════════════════════════════════════════════ inflation ══ */

describe("OPEX — inflation resolution", () => {
  it("UT-OPEX-066 the Italy region map covers twenty regions and is Italy-only", () => {
    expect(Object.keys(ITALY_AREA_BY_REGION)).toHaveLength(20);
    expect(areaWithRegion("Italy", "Lazio")).toBe("Italy_Centre - South");
    expect(areaWithRegion("Italy", " Sicilia ")).toBe("Italy_Sicily");
    expect(areaWithRegion("Italy", "Calabria")).toBe("Italy_Calabria");
    expect(areaWithRegion("Italy", "Sardegna")).toBe("Italy_Sardinia");
    // The apostrophe is U+2019 in the canvas `Switch`; a plain one does not match.
    expect(areaWithRegion("Italy", "Valle d’Aosta")).toBe("Italy_North");
    expect(areaWithRegion("Italy", "Valle d'Aosta")).toBeNull();
    expect(areaWithRegion("Italy", "Nowhere")).toBeNull();
    expect(areaWithRegion("Germany", "Bayern")).toBeNull();
    expect(italyZone("Italy_Centre - South")).toBe("Centre - South");
    expect(italyZone(null)).toBe("");
  });

  it("UT-OPEX-067 the Inflation Profile column shows the country, the zone, or a percentage", () => {
    const country = cost({ useInflationProfile: true, useCountryInflationProfile: true });
    expect(inflationColumnText(country, { countryName: "Germany", areaStateProvince: null }))
      .toBe("Germany");
    expect(inflationColumnText(country, { countryName: "Italy", areaStateProvince: "Lazio" }))
      .toBe("Italy - Centre - South");
    expect(inflationColumnText(
      cost({ useInflationProfile: true, inflationProfile: 2 }),
      { countryName: "Germany", areaStateProvince: null },
    )).toBe("2.0 %");
    // SOURCE DEFECT O-9 — inflation OFF falls into the percentage branch and renders blank.
    expect(inflationColumnText(cost(), { countryName: "Germany", areaStateProvince: null }))
      .toBe("");
  });

  it("UT-OPEX-068 the panel's inflation defaults follow the parent, then the row", () => {
    const parent = cost({ id: "r", inflationProfile: 1.8, inflationStartYear: 2029 });
    expect(inflationProfileDefault({
      selected: null, parent, useCountryInflationProfile: false,
      countryName: "Germany", countryProfile: 2.4,
    })).toBe(1.8);
    expect(inflationProfileDefault({
      selected: cost({ inflationProfile: 1.2 }), parent: null,
      useCountryInflationProfile: false, countryName: "Germany", countryProfile: 2.4,
    })).toBe(1.2);
    // With the country toggle on, `Max(lookup, 0)` coerces a missing profile to 0.
    expect(inflationProfileDefault({
      selected: null, parent: null, useCountryInflationProfile: true,
      countryName: "Germany", countryProfile: null,
    })).toBe(0);
    expect(inflationStartYearDefault({ selected: null, parent, startDate: "2027-01-01" }))
      .toBe(2029);
    // A stored 0 means "inflation was off", so the picker falls through to the start date.
    expect(inflationStartYearDefault({
      selected: cost({ inflationStartYear: 0 }), parent: null, startDate: "2030-06-01",
    })).toBe(2031);
    expect(inflationProfileCountryText({ countryName: "Italy", areaStateProvince: "Puglia" }))
      .toBe("Italy - South");
    expect(inflationProfileCountryText({ countryName: "Germany", areaStateProvince: null }))
      .toBe("Germany");
  });

  it("UT-OPEX-069 SOURCE DEFECT O-2 — the Italy Area dropdown is hard-hidden", () => {
    // `con_..._AreaInflationProfile.Visible: =false` (`:7576`), with the real condition
    // commented out directly above it — while the Save gate still requires a selection.
    expect(areaFieldVisible()).toBe(false);
    expect(areaFieldVisibleIntended({
      inflationOn: true, useCountryInflationProfile: true, countryName: "Italy",
    })).toBe(true);
    expect(areaFieldVisibleIntended({
      inflationOn: true, useCountryInflationProfile: true, countryName: "Germany",
    })).toBe(false);
    // The consequence: an Italian project can never satisfy the gate.
    expect(canSaveOpexCost(form({
      inflationOn: true, useCountryInflationProfile: true,
      inflationStartYear: "2028", inflationProfile: "2.4", inflationCountryArea: null,
    }), { selected: null, costsInScope: [], countryName: "Italy" })).toBe(false);
  });
});

/* ══════════════════════════════════════════════════════════ panel and validation ══ */

describe("OPEX — panel behaviour and validation", () => {
  const ctx = { selected: null, costsInScope: [] as OpexCost[], countryName: "Germany" };

  it("UT-OPEX-070 the panel title switches between Cost Type and Period", () => {
    // "Cost Type" only in Other OPEX (the selected account is not the first) and only on a root.
    expect(panelTitle(panelCtx({ isFirstAccount: false, deviceLabel: "Insurance" })))
      .toBe("Add Cost Type - Insurance");
    expect(panelTitle(panelCtx({
      isFirstAccount: false, deviceLabel: "Insurance", selected: cost(),
    }))).toBe("Edit Cost Type - Insurance");
    expect(panelTitle(panelCtx({ deviceLabel: "V150-6.0" }))).toBe("Add Period - V150-6.0");
    expect(panelTitle(panelCtx({ deviceLabel: "V150-6.0", selected: cost() })))
      .toBe("Edit Period - V150-6.0");
    // A period under an existing chain is always "Period", even in Other OPEX.
    expect(panelTitle(panelCtx({
      isFirstAccount: false, deviceLabel: "Insurance", parent: cost(),
    }))).toBe("Add Period - Insurance");
  });

  it("UT-OPEX-071 the panel labels are transcribed verbatim", () => {
    expect(OPEX_PANEL_LABELS.individualThreshold).toBe("Individual Threshold [MWh p.a.]");
    expect(OPEX_PANEL_LABELS.customInflationProfile).toBe("Custom Inflation Profile [%]");
    expect(OPEX_PANEL_LABELS.alignWithProjectDuration).toBe("Align with Project Duration");
    expect(OPEX_PANEL_LABELS.externalContract).toBe("External Contract");
    expect(OPEX_PANEL_LABELS.inflationStartYearPlaceholder).toBe("YYYY");
    expect(thresholdToggleLabel("PLN")).toBe("Threshold for PLN/MWh p.a.");
    expect(thresholdToggleLabel(null)).toBe("Threshold for EUR/MWh p.a.");
    expect(panelRateLabel("PLN", "MWh")).toBe("PLN/MWh p.a.");
    expect(panelRateLabel("CZK", "WTG")).toBe("EUR/WTG p.a.");
    expect(defaultCurrencyCode("Poland")).toBe("PLN");
    expect(defaultCurrencyCode("Germany")).toBe("EUR");
  });

  it("UT-OPEX-072 the duration dropdowns are 0-35 years and 0-11 months", () => {
    // `Sequence(36)` and `Sequence(12)` — NOT 0..50 as `periods/rules.ts` has it.
    expect(DURATION_YEAR_OPTIONS).toHaveLength(36);
    expect(DURATION_YEAR_OPTIONS.at(-1)?.value).toBe(35);
    expect(DURATION_MONTH_OPTIONS).toHaveLength(12);
    expect(DURATION_MONTH_OPTIONS.at(-1)?.value).toBe(11);
    // SOURCE DEFECT O-11 — the years label tests the 1-based sequence index, so "0 year" and
    // "1 years". The months label tests the value and is correct.
    expect(DURATION_YEAR_OPTIONS[0]?.name).toBe("0 year");
    expect(DURATION_YEAR_OPTIONS[1]?.name).toBe("1 years");
    expect(DURATION_MONTH_OPTIONS[0]?.name).toBe("0 months");
    expect(DURATION_MONTH_OPTIONS[1]?.name).toBe("1 month");
  });

  it("UT-OPEX-073 the distribution frequency options are 1, 2, 3, 6 and 12 months", () => {
    // Ported from skeleton SKEL-OPEX-048 — but the canvas' `locColDistributionFrequency` is a
    // plain Name/Value table declared in `OnVisible`; there is no separate id column.
    expect(OPEX_DISTRIBUTION_FREQUENCY.map((x) => x.value)).toEqual([1, 2, 3, 6, 12]);
    expect(OPEX_DISTRIBUTION_FREQUENCY.map((x) => x.name))
      .toEqual(["1 month", "2 months", "3 months", "6 months", "12 months"]);
  });

  it("UT-OPEX-074 a child period locks the inflation, threshold and contract toggles", () => {
    const base = { eurPerMwh: "12.00", useCountryInflationProfile: false };
    const root = panelFieldModes(panelCtx(), base);
    expect(root.description).toBe("edit");
    expect(root.inflationProfileToggle).toBe("edit");
    expect(root.threshold).toBe("edit");
    expect(root.alignWithProjectDuration).toBe("edit");
    expect(root.externalContract).toBe("edit");
    expect(root.currency).toBe("disabled");

    const child = panelFieldModes(panelCtx({ parent: cost({ id: "r" }) }), base);
    expect(child.description).toBe("disabled");
    expect(child.countryInflationProfile).toBe("view");
    expect(child.inflationProfileToggle).toBe("view");
    expect(child.inflationStartYear).toBe("disabled");
    expect(child.inflationProfile).toBe("disabled");
    expect(child.threshold).toBe("view");
    expect(child.thresholdType).toBe("view");
    expect(child.alignWithProjectDuration).toBe("view");
    expect(child.externalContract).toBe("view");
    // Money and dates stay editable on a child — which is why they are not cascaded.
    expect(child.fixCosts).toBe("edit");
    expect(child.startDate).toBe("edit");
    expect(child.durationYears).toBe("edit");
  });

  it("UT-OPEX-075 the Threshold toggle needs a non-blank EUR/MWh, and the country toggle wins", () => {
    const noMwh = panelFieldModes(panelCtx(), {
      eurPerMwh: "", useCountryInflationProfile: false,
    });
    expect(noMwh.threshold).toBe("view");
    expect(noMwh.thresholdType).toBe("view");
    const countryOn = panelFieldModes(panelCtx(), {
      eurPerMwh: "1.00", useCountryInflationProfile: true,
    });
    expect(countryOn.inflationProfile).toBe("disabled");
  });

  it("UT-OPEX-076 the red asterisks are conditional, not fixed", () => {
    const adding = panelRequiredMarkers(panelCtx(), { useCountryInflationProfile: false });
    expect(adding.description).toBe(true);
    expect(adding.thresholdIndividual).toBe(true);
    expect(adding.inflationStartYear).toBe(true);
    // The Inflation Profile toggle's own asterisk is declared `Visible: =false`.
    expect(adding.inflationProfileToggle).toBe(false);

    const editing = panelRequiredMarkers(panelCtx({ selected: cost(), parent: cost({ id: "r" }) }), {
      useCountryInflationProfile: true,
    });
    expect(editing.description).toBe(false);
    expect(editing.thresholdIndividual).toBe(false);
    expect(editing.countryInflationProfile).toBe(false);
    expect(editing.inflationProfile).toBe(false);
    // Always marked.
    expect(editing.startDate).toBe(true);
    expect(editing.duration).toBe(true);
    expect(editing.currency).toBe(true);
    expect(editing.aggregation).toBe(true);
    expect(editing.distributionFrequency).toBe(true);
  });

  it('UT-OPEX-077 "standard" is a reserved word anywhere in the description', () => {
    expect(descriptionHasReservedStandard("Standard cover")).toBe(true);
    expect(descriptionHasReservedStandard("Non-standard cover")).toBe(true);
    expect(descriptionHasReservedStandard("")).toBe(false);
    expect(descriptionHasReservedStandard("Service")).toBe(false);
    expect(descriptionError("A standard clause")).toBe(OPEX_MSG.descriptionStandardReserved);
    expect(OPEX_MSG.descriptionStandardReserved)
      .toBe('The term "Standard" is applicable only for system-prefilled contracts.');
    expect(canSaveOpexCost(form({ description: "Standard cover" }), ctx)).toBe(false);
  });

  it("UT-OPEX-078 Fix Costs is two decimals, 0 to 1 000 000 000", () => {
    // Ported from skeleton SKEL-OPEX-032/033.
    expect(validateOpexNumber("fixCosts", "12.345")).toBe(OPEX_MSG.twoDecimal);
    expect(validateOpexNumber("fixCosts", "12.34")).toBeNull();
    expect(validateOpexNumber("fixCosts", "1000000001")).toBe(rangeMessage(1_000_000_000));
    expect(validateOpexNumber("fixCosts", "1000000000")).toBeNull();
    expect(validateOpexNumber("fixCosts", "")).toBeNull();
    expect(rangeMessage(1_000_000_000)).toBe("Value must be between 0 and 1,000,000,000.0.");
    expect(OPEX_MSG.twoDecimal).toBe("Value must be a numeric with two decimal place.");
  });

  it("UT-OPEX-079 % of Revenues is bounded at 10 000 and has its OWN message", () => {
    // Ported from skeleton SKEL-OPEX-034. CANVAS DIVERGENCE FROM THE SKELETON — the skeleton
    // reuses `twoDecimal` here; `:6504` is worded completely differently.
    expect(validateOpexNumber("percentOfRevenues", "12.345"))
      .toBe("Enter a number with no more than two decimal places.");
    expect(validateOpexNumber("percentOfRevenues", "10001")).toBe(rangeMessage(10_000));
    expect(validateOpexNumber("percentOfRevenues", "10000")).toBeNull();
  });

  it("UT-OPEX-080 the three rate fields share the two-decimal rule", () => {
    for (const f of ["eurPerMwh", "eurPerMw", "eurPerWtg"] as const) {
      expect(validateOpexNumber(f, "1.234")).toBe(OPEX_MSG.twoDecimal);
      expect(validateOpexNumber(f, "1000000001")).toBe(rangeMessage(1_000_000_000));
      expect(validateOpexNumber(f, "67500.00")).toBeNull();
    }
  });

  it("UT-OPEX-081 the Individual Threshold is ONE decimal, 0 to 10 000 000", () => {
    // CANVAS DIVERGENCE FROM THE SKELETON — the skeleton has it at two decimals against
    // `OPEX_MSG.range`. `:8174-8191` uses `IsOneDecimal` and two bespoke messages.
    expect(validateOpexNumber("thresholdIndividual", "12.34"))
      .toBe("Numeric value with maximum of one decimals");
    expect(validateOpexNumber("thresholdIndividual", "12.3")).toBeNull();
    expect(validateOpexNumber("thresholdIndividual", "10000001"))
      .toBe("Please select a value between 0 and 10000000");
    expect(validateOpexNumber("thresholdIndividual", "")).toBeNull();
  });

  it("UT-OPEX-082 the custom Inflation Profile is ONE decimal, 0 to 100", () => {
    expect(validateOpexNumber("inflationProfile", "2.45"))
      .toBe("Value must be a numeric with 1 decimal place");
    expect(validateOpexNumber("inflationProfile", "2.4")).toBeNull();
    expect(validateOpexNumber("inflationProfile", "101"))
      .toBe("Please select a value between 0 and 100.");
    expect(validateOpexNumber("inflationProfile", "")).toBeNull();
  });

  it("UT-OPEX-083 the Inflation Start Year must be exactly four digits", () => {
    expect(validateInflationStartYear("2028")).toBeNull();
    expect(validateInflationStartYear("28")).toBe("Year value must be in format YYYY.");
    expect(validateInflationStartYear("20281")).toBe("Year value must be in format YYYY.");
    expect(validateInflationStartYear("")).toBeNull();
  });

  it("UT-OPEX-084 SOURCE DEFECT O-12 — the start-date error is inverted", () => {
    // Ported from skeleton SKEL-OPEX-046.
    expect(startDateError(null)).toBe("Value cannot be blank");
    expect(startDateError("2027-01-01")).toBeNull();
    expect(startDateErrorVisibleCanvasParity(null)).toBe(false);
    expect(startDateErrorVisibleCanvasParity("2027-01-01")).toBe(true);
  });

  it("UT-OPEX-085 at least one commercial figure is required", () => {
    // Ported from skeleton SKEL-OPEX-030.
    expect(canSaveOpexCost(form({ fixCosts: "" }), ctx)).toBe(false);
    expect(canSaveOpexCost(form({ fixCosts: "12.00" }), ctx)).toBe(true);
    expect(canSaveOpexCost(form({ fixCosts: "", eurPerMwh: "3.00" }), ctx)).toBe(true);
    expect(showAtLeastOneFigureHint(form({ fixCosts: "" }))).toBe(true);
    expect(showAtLeastOneFigureHint(form())).toBe(false);
    expect(OPEX_MSG.atLeastOneFigure).toBe("Please fill in at least one commercial figure");
  });

  it("UT-OPEX-086 duration cannot be zero years AND zero months", () => {
    // Ported from skeleton SKEL-OPEX-031.
    expect(canSaveOpexCost(form({ durationYears: 0, durationMonths: 0 }), ctx)).toBe(false);
    expect(canSaveOpexCost(form({ durationYears: 0, durationMonths: 6 }), ctx)).toBe(true);
    expect(canSaveOpexCost(form({ durationYears: null }), ctx)).toBe(false);
    expect(canSaveOpexCost(form({ durationMonths: null }), ctx)).toBe(false);
  });

  it("UT-OPEX-087 the three dropdowns and the start date are all required", () => {
    expect(canSaveOpexCost(form({ currencyId: null }), ctx)).toBe(false);
    expect(canSaveOpexCost(form({ aggregation: null }), ctx)).toBe(false);
    expect(canSaveOpexCost(form({ distributionFrequency: null }), ctx)).toBe(false);
    expect(canSaveOpexCost(form({ startDate: null }), ctx)).toBe(false);
    expect(canSaveOpexCost(form({ description: "   " }), ctx)).toBe(false);
  });

  it("UT-OPEX-088 the threshold clauses gate Save independently of the toggle", () => {
    // Ported from skeleton SKEL-OPEX-035/036.
    expect(canSaveOpexCost(form({ thresholdOn: true, thresholdType: null }), ctx)).toBe(false);
    expect(canSaveOpexCost(form({
      thresholdOn: true, thresholdType: THRESHOLD_TYPE.individual, thresholdIndividual: "",
    }), ctx)).toBe(false);
    expect(canSaveOpexCost(form({
      thresholdOn: true, thresholdType: THRESHOLD_TYPE.individual, thresholdIndividual: "500.0",
    }), ctx)).toBe(true);
    expect(canSaveOpexCost(form({ thresholdOn: false, thresholdType: null }), ctx)).toBe(true);
    // Clause 18 carries NO `thresholdOn` guard: a stale Individual selection still blocks.
    expect(canSaveOpexCost(form({
      thresholdOn: false, thresholdType: THRESHOLD_TYPE.individual, thresholdIndividual: "",
    }), ctx)).toBe(false);
    expect(thresholdTypeError(null)).toBe("Please select a threshold option.");
    expect(thresholdTypeError(THRESHOLD_TYPE.netYieldP75)).toBeNull();
  });

  it("UT-OPEX-089 inflation on requires a valid start year and a valid profile", () => {
    // Ported from skeleton SKEL-OPEX-037.
    expect(canSaveOpexCost(form({ inflationOn: true, inflationStartYear: "" }), ctx)).toBe(false);
    expect(canSaveOpexCost(form({
      inflationOn: true, inflationStartYear: "28", inflationProfile: "2.4",
    }), ctx)).toBe(false);
    expect(canSaveOpexCost(form({
      inflationOn: true, inflationStartYear: "2028", inflationProfile: "",
    }), ctx)).toBe(false);
    expect(canSaveOpexCost(form({
      inflationOn: true, inflationStartYear: "2028", inflationProfile: "2.45",
    }), ctx)).toBe(false);
    expect(canSaveOpexCost(form({
      inflationOn: true, inflationStartYear: "2028", inflationProfile: "2.4",
    }), ctx)).toBe(true);
  });

  it("UT-OPEX-090 a non-Italian project never needs an Area", () => {
    // Ported from skeleton SKEL-OPEX-038/039.
    expect(canSaveOpexCost(form({
      inflationOn: true, useCountryInflationProfile: true,
      inflationStartYear: "2028", inflationProfile: "2.4", inflationCountryArea: null,
    }), ctx)).toBe(true);
    expect(canSaveOpexCost(form({
      inflationOn: true, useCountryInflationProfile: true,
      inflationStartYear: "2028", inflationProfile: "2.4", inflationCountryArea: "North",
    }), { ...ctx, countryName: "Italy" })).toBe(true);
    // Italy with the country toggle OFF does not need one either.
    expect(canSaveOpexCost(form({
      inflationOn: true, useCountryInflationProfile: false,
      inflationStartYear: "2028", inflationProfile: "2.4", inflationCountryArea: null,
    }), { ...ctx, countryName: "Italy" })).toBe(true);
  });

  it("UT-OPEX-091 a duplicate description within the CARD is rejected on create only", () => {
    // Ported from skeleton SKEL-OPEX-040. The scope is `locSelectedProjectCosts`, the card's rows.
    const scope = [cost({ id: "other", description: "Service" })];
    expect(canSaveOpexCost(form({ description: "Service" }), { ...ctx, costsInScope: scope }))
      .toBe(false);
    expect(canSaveOpexCost(form({ description: "Service" }), {
      ...ctx, costsInScope: scope, selected: cost({ id: "other" }),
    })).toBe(true);
    expect(canSaveOpexCost(form({ description: " Service " }), { ...ctx, costsInScope: scope }))
      .toBe(false);
  });

  it("UT-OPEX-092 the error list reports blank required fields the canvas left silent", () => {
    // NEW — no canvas equivalent; the canvas' own messages are reused. Nothing here changes
    // what saves: `canSaveOpexCost` is the gate.
    const errors = opexFormErrors(form({ description: "", startDate: null, fixCosts: "1.234" }), ctx);
    expect(errors.map((e) => e.field)).toContain("description");
    expect(errors.map((e) => e.field)).toContain("startDate");
    expect(errors.find((e) => e.field === "fixCosts")?.message).toBe(OPEX_MSG.twoDecimal);
    expect(OPEX_DESCRIPTION_MSG.blank).toBe("Value cannot be blank");
    expect(OPEX_DESCRIPTION_MSG.duplicate)
      .toBe("A period with the same description already exists.");
    expect(opexFormErrors(form(), ctx)).toEqual([]);
  });

  it("UT-OPEX-093 a save failure keeps the canvas' own Notify wording", () => {
    // Ported from skeleton SKEL-OPEX-045 — but the skeleton reworded it. `:8695` is transcribed.
    expect(OPEX_MSG.saveFailed("Patch", "Conflict", " 409"))
      .toBe("Error: OPEX cost could not be saved correctly. Internal error: originated on "
        + "Patch. Message: Conflict 409");
    expect(OPEX_MSG.savingCost).toBe("Saving OPEX cost...");
    expect(OPEX_MSG.deletingCost).toBe("Deleting OPEX cost...");
    expect(OPEX_MSG.updatingChildCosts).toBe("Updating inflation profiles on child costs...");
    expect(OPEX_MSG.loadingStandardContract)
      .toBe("Please wait, loading Standard Assumption Contract...");
  });

  it("UT-OPEX-094 the External Contract default is Yes except on the first Other-OPEX sub-account", () => {
    expect(externalContractDefault({
      selected: null, parent: null, mode: "other", subaccountOrder: 1,
    })).toBe(false);
    expect(externalContractDefault({
      selected: null, parent: null, mode: "other", subaccountOrder: 2,
    })).toBe(true);
    // O&M's sub-account is also Order 1, but the mode test excludes it.
    expect(externalContractDefault({
      selected: null, parent: null, mode: "om", subaccountOrder: 1,
    })).toBe(true);
    expect(externalContractDefault({
      selected: null, parent: cost({ externalContract: false }), mode: "other", subaccountOrder: 5,
    })).toBe(false);
    expect(externalContractDefault({
      selected: cost({ externalContract: true }), parent: null, mode: "other", subaccountOrder: 1,
    })).toBe(true);
  });

  it("UT-OPEX-095 Align with Project Duration defaults to Yes on a brand-new cost type", () => {
    expect(alignWithProjectDurationDefault({ selected: null, parent: null })).toBe(true);
    expect(alignWithProjectDurationDefault({
      selected: null, parent: cost({ alignWithProjectDuration: false }),
    })).toBe(false);
    expect(alignWithProjectDurationDefault({
      selected: cost({ alignWithProjectDuration: false }), parent: null,
    })).toBe(false);
  });
});

/* ════════════════════════════════════════════════════════════════ the table row ══ */

describe("OPEX — rendered rows", () => {
  it("UT-OPEX-096 the number and date formats follow the canvas Text() masks", () => {
    expect(formatTableDate("2027-08-30")).toBe("30.08.27");
    expect(formatTableDate(null)).toBe("");
    expect(formatWholeNumber(67500)).toBe("67,500");
    expect(formatWholeNumber(null)).toBe("");
    expect(formatRevenuePercent(2)).toBe("2.00 %");
    expect(formatOneDecimalPercent(2)).toBe("2.0 %");
    // A zero is a zero, not a blank — the canvas masks print it.
    expect(formatWholeNumber(0)).toBe("0");
  });

  it("UT-OPEX-097 the Threshold cell renders p75, p90 or the individual value", () => {
    expect(thresholdColumnText(cost({ threshold: false }))).toBe("");
    expect(thresholdColumnText(cost({
      threshold: true, thresholdType: THRESHOLD_TYPE.netYieldP75,
    }))).toBe("p75");
    expect(thresholdColumnText(cost({
      threshold: true, thresholdType: THRESHOLD_TYPE.netYieldP90,
    }))).toBe("p90");
    expect(thresholdColumnText(cost({
      threshold: true, thresholdType: THRESHOLD_TYPE.individual, thresholdIndividual: 1234.5,
    }))).toBe("1,234.5");
  });

  it("UT-OPEX-098 a row whose DESCRIPTION starts with Standard renders as standard", () => {
    const row = toOpexRow({
      cost: cost({
        description: "Standard Operation & Maintenance", isStandardContract: false,
        durationYears: 5, durationMonths: 0, eurPerWtg: 67500, aggregation: OPEX_AGGREGATION.sum,
      }),
      mode: "om", selectedId: null, project, cardCosts: [],
    });
    // `Italic: StartsWith(ThisItem.Description, "Standard")` — independent of the flag.
    expect(row.standard).toBe(true);
    expect(row.cells.durationYears).toBe("5 years");
    expect(row.cells.durationMonths).toBe("0 months");
    expect(row.cells.startDate).toBe("01.01.27");
    expect(row.cells.endDate).toBe("31.12.31");
    expect(row.cells.eurPerWtg).toBe("67,500");
    expect(row.cells.aggregation).toBe("SUM");
    expect(row.cells.currency).toBe("Euro");
    expect(row.cells.distributionFrequency).toBe("12");
    expect(toOpexRow({
      cost: cost({ description: "Service" }), mode: "om", selectedId: "p1",
      project, cardCosts: [],
    }).selected).toBe(true);
  });

  it("UT-OPEX-100 resolves the country inflation percentage, with Italy's Area term only", () => {
    /*
     * `LookUp('Country Inflation Profiles', Country && Year [&& Area]).Inflation`.
     *
     * The panel's percentage box adds `Area = drp_…_AreaInflationProfile.Selected.Value` **for
     * Italy only** (`OpexCostScreenCode.txt:7822-7847`); `Add Standard Contract` uses no Area
     * term at all, on any country (`:726-728`).
     *
     * MEASURED, VSBCloud_Dev 16 Sep: Italy has SEVEN rows per year, one per price zone (North ·
     * Centre - North · Centre - South · South · Sicily · Sardinia · Calabria), and every other
     * country exactly one per year with `vsb_area` blank. Applying the Area term outside Italy
     * would match nothing; omitting it inside Italy picks an arbitrary zone.
     */
    const rows = [
      { year: 2026, area: "North", inflation: 2.0 },
      { year: 2027, area: "North", inflation: 2.2 },
      { year: 2027, area: "South", inflation: 2.6 },
      { year: 2027, area: "", inflation: 1.8 },
    ];

    // Italy: the Area narrows the year's seven rows to one.
    expect(countryInflationPercent(rows, {
      year: 2027, countryName: "Italy", area: "South",
    })).toBe(2.6);
    expect(countryInflationPercent(rows, {
      year: 2027, countryName: "Italy", area: "North",
    })).toBe(2.2);
    // Italy with no Area chosen — the canvas' Add Standard Contract lookup — takes the year's
    // first row rather than matching nothing.
    expect(countryInflationPercent(rows, {
      year: 2027, countryName: "Italy", area: null,
    })).toBe(2.2);
    // Germany: the Area is IGNORED, because every German row has a blank one.
    expect(countryInflationPercent(rows, {
      year: 2027, countryName: "Germany", area: "South",
    })).toBe(2.2);
    // No row for the year, and no year at all, are both "no profile" rather than zero.
    expect(countryInflationPercent(rows, {
      year: 2040, countryName: "Germany", area: null,
    })).toBeNull();
    expect(countryInflationPercent(rows, {
      year: null, countryName: "Germany", area: null,
    })).toBeNull();
    expect(countryInflationPercent([], {
      year: 2027, countryName: "Italy", area: "South",
    })).toBeNull();
  });

  it("UT-OPEX-101 feeds the resolved percentage into the panel's inflation default", () => {
    // The two call sites the lookup exists for. `inflationProfileDefault` used to be handed
    // `countryProfile: null` unconditionally, so the read-only country branch always showed 0.0.
    const rows = [{ year: 2028, area: "Centre - South", inflation: 3.1 }];
    const profile = countryInflationPercent(rows, {
      year: 2028, countryName: "Italy", area: italyZone(areaWithRegion("Italy", "Lazio")),
    });
    expect(profile).toBe(3.1);
    expect(inflationProfileDefault({
      selected: null, parent: null, useCountryInflationProfile: true,
      countryName: "Italy", countryProfile: profile,
    })).toBe(3.1);
  });

  it("UT-OPEX-099 a blank duration column renders empty rather than as zero", () => {
    const row = toOpexRow({
      cost: cost({ durationYears: null, durationMonths: null, aggregation: null }),
      mode: "other", selectedId: null, project, cardCosts: [],
    });
    expect(row.cells.durationYears).toBe("");
    expect(row.cells.durationMonths).toBe("");
    expect(row.cells.aggregation).toBe("");
    expect(row.cells.endDate).toBe("31.12.26");
  });
});
