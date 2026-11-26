/**
 * O&M / Other OPEX / Land Lease period writes against Dataverse.
 *
 * Mirrors `capexWrites.ts`'s shape (targeted create/update/delete, not a whole-book diff against
 * Dataverse) and its two conventions: every CREATE binds the project's owning business unit, and
 * deletes are ordered so an interrupted save leaves the more recoverable state.
 *
 * THE CHAIN, which is the thing this module exists to get right. A cost on these screens is a
 * contract of 1..N consecutive periods — see `CostPeriod` in `features/costing/model.ts` — and
 * each screen stores it differently:
 *
 *   O&M / Other OPEX   `vsb_opexprojectcosts`, one row per period, every period after the first
 *                      carrying `vsb_parentcost` -> the FIRST row.
 *                      · SAVE  `OpexCostScreenCode.txt:8695` patches the row and then
 *                        `ForAll(Filter(costs, 'Parent Cost' = saved), Patch(child, {…}))` —
 *                        ten fields cascade from a head onto every period under it.
 *                      · DELETE `:8861-8874` — a HEAD takes its whole chain with it
 *                        (`RemoveIf(Or('Parent Cost' = X, id = X))`); a later period goes alone.
 *   Land Lease         `vsb_landleaseprojectcosts` header + `vsb_landleaseperiods` children.
 *                      · SAVE  `LandLeaseCostScreenCode.txt:5895` patches the HEADER only when
 *                        the contract is new OR the edited period is Period 1
 *                        (`If(IsBlank(locSelectedLandLeaseCost) || period = 'Period 1', …)`),
 *                        then always patches the period. A new period takes its predecessor's
 *                        slot + 1 — `Switch(locParentLandLeasePeriod.Period, Period1, Period2, …)`.
 *                      · DELETE `:360-384` routes on the slot: Period 1 opens the
 *                        "delete the whole Land Lease" confirm, which removes the contract's
 *                        `Land Lease Allocation WTGS`, then its periods, then the header
 *                        (`:6076-6087`); any other slot removes just that one period (`:6041`).
 *
 * "ADD CONTRACT TYPE" IS NOT A NEW SUB-ACCOUNT. `vsb_landleasesubaccounts` is shared reference
 * data — nine rows, `Locations` plus the eight locations, the same for every project. The canvas
 * command (`newLandLeaseContractKey`, `:388`) only opens the panel with a blank cost; the SAVE
 * then creates a new `vsb_landleaseprojectcosts` HEADER under the sub-account the card belongs
 * to. A sub-account therefore holds MANY contracts — measured on VSBCloud_Dev, 16 Sep, Project
 * New Data (`910d8ed0-…`) has twelve headers under `Locations` alone — which is why
 * `saveLandLeasePeriod` keys off `period.contractId` and never off the group name.
 *
 * NO `$batch`. `convertOptionsToQueryString` in `@microsoft/power-apps` serialises only
 * `$select/$filter/$orderby/$top/$skip/$count/$skiptoken`, and the SDK exposes no changeset, so
 * every multi-row operation here is sequential. Where that matters the ORDER is chosen so an
 * interruption leaves recoverable state: children before parents on delete, parent before
 * children on create.
 *
 * **Resolving a group name back to Dataverse ids.** The screen's `CostPeriod.group` is a plain
 * display string (device name / subaccount name / location name). Every save therefore starts
 * with a small lookup against the relevant reference table(s), scoped to the project where the
 * table has a project link. This is not cached across calls — periods are saved one at a time
 * from the panel, not in bulk, so the extra round trip per save is the honest cost of keeping
 * every save call self-contained and correct rather than reusing a maybe-stale cache.
 */
import { Vsb_opexprojectcostsService } from "@/generated/services/Vsb_opexprojectcostsService";
import { Vsb_opexaccountsService } from "@/generated/services/Vsb_opexaccountsService";
import { Vsb_opexsubaccountsService } from "@/generated/services/Vsb_opexsubaccountsService";
import { Vsb_devicetypesinprojectsService } from "@/generated/services/Vsb_devicetypesinprojectsService";
import { Vsb_generatortypeinprojectsService } from "@/generated/services/Vsb_generatortypeinprojectsService";
import { Vsb_pvmoduletypeinprojectsService } from "@/generated/services/Vsb_pvmoduletypeinprojectsService";
import { Vsb_opexlandleasestandardassumptionsesService } from "@/generated/services/Vsb_opexlandleasestandardassumptionsesService";
import { unwrap } from "@/platform/errors";
import { loggedCall } from "@/platform/requestLog";
import { OPEX_MSG, planFollowingPeriodStarts, type ChainPeriod, type OpexAccount, type OpexSubaccount } from "@/features/cost/periods/opexRules";
import type { CostPeriod, PeriodMode } from "@/features/cost/costing/model";
import type { IOperationResult } from "@microsoft/power-apps/data";
import { deleteIfExists, deleteRecord, fetchAll } from "./client";
import { assertRowsExist } from "./costUpdateGuard";
import { GONE_AS_DONE_LEASE_OPEX, OPEX_GUARD } from "./leaseOpexFlags";
import { createWithStableId } from "./stableCreateId";
import { mapLimit, mapLimitFirstFailure, WRITE_CONCURRENCY } from "./concurrency";
import { loadActiveCurrencies } from "./currencies";
import { ES_PLANT } from "./dataverseNames";
import { ACTIVE, and, bind, dateOnly, eq, lookupEq, lookupIn, money } from "./odata";
import { addMonths as addMonthsOnDate } from "@/domain/dates";
import { THRESHOLD_TYPE_VALUE, readAggregation, writeAggregation } from "./costBook";

/** `Opex Accounts.Name` — the literal strings the O&M / Other OPEX tables compare against. */
const OPEX_MODE_NAME = { om: "Operation & Maintenance", other: "Other OPEX Costs" } as const;

/**
 * `vsb_opexprojectcostsvsb_thresholdtype` — measured 16 Sep: p75 952850000, p90 952850001,
 * Individual 952850002.
 *
 * The default when the toggle is on and the panel sent no choice, NOT a hard-coded answer: the
 * radio group is `Items: Choices(Thresholds)` (`OpexCostScreenCode.txt:8302`) and the save writes
 * `rdg_….Selected.Value` (`:8695`), so p75 and p90 are reachable and must survive. Writing
 * Individual unconditionally — which is what this did — made every p75/p90 choice read back as
 * Individual.
 */
const THRESHOLD_TYPE_INDIVIDUAL = THRESHOLD_TYPE_VALUE.individual;

/**
 * A nullable money / numeric column on the way OUT.
 *
 * `'Fix Costs': Value(txt.Value)` (`:8695`) and `Value("")` is `Blank()`, so an empty box stores
 * NOTHING. `undefined` would omit the property from the PATCH and leave a stale figure behind,
 * which is why this normalises to an explicit `null`.
 */
/** An option-set column, which arrives as a number or as its string form. */
function numberOfOption(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

/**
 * `vsb_opexlandleasestandardassumptionsesvsb_typeofcontract` — measured 16 Sep:
 * Landlease 952850000, Opex O&M 952850001, Opex Other 952850002, DEVEX/CAPEX 952850003,
 * BoP 128470001. The canvas names them `'Contract Types'.Landlease` / `.'Opex O&M'` /
 * `.'Opex Other'` (`OpexCostScreenCode.txt:656`, `:3044`; `LandLeaseCostScreenCode.txt:388`).
 */
const CONTRACT_TYPE = { om: 952850001, other: 952850002 } as const;

/** `'Time Zone Rule Version Number': 4` in the OPEX Save Patch (`Opex Costs Screen.pa.yaml:8703`). */
export const OPEX_TIME_ZONE_RULE_VERSION_NUMBER = 4;

/**
 * `Name` of a standard-imported OPEX row: `"Operation & Maintenance" & "-" & locSelectedSubaccount.Name
 * & "-" & Description` (`:3088`, `:3227`) and `"Other OPEX Costs" & "-" & subaccount.Name & "-" &
 * Description` (`:697`, `:839`), with the RAW assumption description. Pinned equal to
 * `standardCostName` (opexRules) by UT-PWRITE-OPEX-NAME.
 */
export function opexStandardName(
  mode: "om" | "other",
  subaccountName: string,
  rawDescription: string,
): string {
  return `${OPEX_MODE_NAME[mode]}-${subaccountName}-${rawDescription}`;
}

/** `vsb_opexlandleasestandardassumptionsesvsb_period` — Period1 is the chain head. */
const ASSUMPTION_PERIOD_1 = 952850000;

export interface PeriodWriteContext {
  projectId: string;
  owningBusinessUnitId?: string;
  /**
   * `gblSelectedProject.'Project Name'` — the first segment of a Land Lease header's `vsb_name`
   * (`LandLeaseCostScreenCode.txt:5895`, `Name: gblSelectedProject.'Project Name' & "-" & …`).
   * Absent only in tests and on a project whose name failed to load; the name then starts at the
   * sub-account, which is cosmetic — nothing reads a header's `vsb_name` back.
   */
  projectName?: string;
  /**
   * OPT-11 (B3): the OPEX accounts and sub-accounts the screen already holds (`useOpexCatalog`: ACTIVE rows, cached 30 minutes).
   * Given, a save or an import resolves its account and sub-account from them instead of reading both tables again; omitted (or
   * only one of the two), it reads them as before.
   */
  opexCatalog?: { accounts: readonly OpexAccount[]; subaccounts: readonly OpexSubaccount[] };
}

/* ══════════════════════════════════════════════════════ group -> id lookups ══ */

async function resolveCurrencyId(currencyName: string): Promise<string | undefined> {
  const name = currencyName.trim();
  if (!name) return undefined;
  // OPT-11: the ACTIVE rows of the shared currency read (`data/currencies.ts`), not a request per save. Same rule as before:
  // active currencies only, the first whose name matches without regard to case.
  const rows = await loadActiveCurrencies();
  const match = rows.find((r) => r.name.toLowerCase() === name.toLowerCase());
  return match?.id;
}

interface OpexGroupTarget {
  accountName: string;
  subaccountId: string;
  subaccountName: string;
  deviceTypeInProjectId?: string;
  deviceName?: string;
}

/** O&M binds one shared "Operation & Maintenance" sub-account plus the chosen device type. */
async function resolveOpexGroupTarget(
  projectId: string,
  mode: "om" | "other",
  group: string,
  deviceId?: string,
  catalog?: PeriodWriteContext["opexCatalog"],
): Promise<OpexGroupTarget> {
  // OPT-11: the screen's own ACTIVE accounts and sub-accounts when the caller has them (same select, same filter as the two reads
  // below, so the same rows); otherwise the two reads, exactly as before.
  const [accounts, subaccounts] = catalog
    ? [
      // The catalogue turned a null name into "" (`loadOpexAccounts`); turned back, so `?? fallback` below reads the same.
      catalog.accounts.map((a) => ({ vsb_opexaccountid: a.id, vsb_name: a.name === "" ? null : a.name, vsb_order: a.order })),
      catalog.subaccounts.map((s) => ({
        vsb_opexsubaccountid: s.id, vsb_name: s.name === "" ? null : s.name, vsb_order: s.order, _vsb_account_value: s.accountId,
      })),
    ]
    : await Promise.all([
      fetchAll(
        "list OPEX accounts",
        (o) => Vsb_opexaccountsService.getAll(o),
        { select: ["vsb_opexaccountid", "vsb_name", "vsb_order"], filter: ACTIVE },
      ),
      fetchAll(
        "list OPEX subaccounts for a period save",
        (o) => Vsb_opexsubaccountsService.getAll(o),
        { select: ["vsb_opexsubaccountid", "vsb_name", "vsb_order", "_vsb_account_value"], filter: ACTIVE },
      ),
    ]);
  const byOrder = (a: { vsb_order: number }, b: { vsb_order: number }) => a.vsb_order - b.vsb_order;
  const account = accounts.find((a) => a.vsb_name === OPEX_MODE_NAME[mode])
    ?? [...accounts].sort(mode === "om" ? byOrder : (a, b) => byOrder(b, a))[0];
  if (!account) throw new Error(`No "${OPEX_MODE_NAME[mode]}" OPEX account is configured.`);
  const accountName = account.vsb_name ?? OPEX_MODE_NAME[mode];

  if (mode === "other") {
    const match = subaccounts.find(
      (s) => s._vsb_account_value === account.vsb_opexaccountid
        && (s.vsb_name ?? "").toLowerCase() === group.toLowerCase(),
    );
    if (!match) throw new Error(`Unknown Other OPEX Costs group "${group}".`);
    return {
      accountName,
      subaccountId: match.vsb_opexsubaccountid,
      subaccountName: match.vsb_name ?? group,
    };
  }

  const omSubaccount = subaccounts
    .filter((s) => s._vsb_account_value === account.vsb_opexaccountid)
    .sort(byOrder)[0];
  if (!omSubaccount) throw new Error(`No sub-account is configured under "${OPEX_MODE_NAME.om}".`);

  // The card's own device id when it has one: two devices can share a `vsb_name`, and resolving
  // by name bound a save from the second card to the first device.
  const device = deviceId ? { id: deviceId, name: group } : await resolveDeviceType(projectId, group);
  return {
    accountName,
    subaccountId: omSubaccount.vsb_opexsubaccountid,
    subaccountName: omSubaccount.vsb_name ?? OPEX_MODE_NAME.om,
    deviceTypeInProjectId: device.id,
    deviceName: device.name,
  };
}

async function resolveDeviceType(
  projectId: string,
  deviceName: string,
): Promise<{ id: string; name: string }> {
  const [generators, pvTypes] = await Promise.all([
    fetchAll(
      "list generator types in project for a period save",
      (o) => Vsb_generatortypeinprojectsService.getAll(o),
      { select: ["vsb_generatortypeinprojectid"], filter: and(lookupEq("vsb_project", projectId), ACTIVE) },
    ),
    fetchAll(
      "list PV module types in project for a period save",
      (o) => Vsb_pvmoduletypeinprojectsService.getAll(o),
      { select: ["vsb_pvmoduletypeinprojectid"], filter: and(lookupEq("vsb_project", projectId), ACTIVE) },
    ),
  ]);
  const typeIds = [
    ...generators.map((g) => g.vsb_generatortypeinprojectid),
    ...pvTypes.map((p) => p.vsb_pvmoduletypeinprojectid),
  ];
  if (typeIds.length === 0) {
    throw new Error(`No generators or PV modules are set up on this project for "${deviceName}".`);
  }
  const devices = await fetchAll(
    "list device types in project for a period save",
    (o) => Vsb_devicetypesinprojectsService.getAll(o),
    { select: ["vsb_devicetypesinprojectid", "vsb_name"], filter: lookupIn("vsb_typeinprojectid", typeIds) },
  );
  const match = devices.find((d) => (d.vsb_name ?? "").toLowerCase() === deviceName.toLowerCase());
  if (!match) throw new Error(`Unknown Operation & Maintenance device type "${deviceName}".`);
  return { id: match.vsb_devicetypesinprojectid, name: match.vsb_name ?? deviceName };
}

/* ══════════════════════════════════════════════════════════════ O&M / Other OPEX ══ */

/**
 * `vsb_name` exactly as the canvas composes it (`OpexCostScreenCode.txt:8695`):
 *
 *     If(IsBlank(DeviceTypeInProject),
 *        account.Name & "-" & subaccount.Name & "-" & Description,     // Other OPEX
 *        subaccount.Name & "-" & device.Name & "-" & Description)      // O&M
 *
 * It is not decoration: the chain order the canvas reads back is `Sort(children, Name, Ascending)`
 * over exactly this string, so a different composition reorders the periods of every chain.
 */
export function opexRowName(target: OpexGroupTarget, description: string): string {
  const parts = target.deviceTypeInProjectId
    ? [target.subaccountName, target.deviceName ?? ""]
    : [target.accountName, target.subaccountName];
  return [...parts, description].join("-");
}

/**
 * The ten fields a HEAD cascades onto every period under it.
 *
 * `OpexCostScreenCode.txt:8695` — after the row is patched, `ForAll(Filter('Opex Project Costs',
 * 'Parent Cost'.'Opex Project Cost' = saved), Patch(child, {…}))`. Inflation, threshold, align
 * and external are properties of the CONTRACT, so they may not differ between its periods; every
 * other field (dates, durations, money, aggregation, frequency) is per period and is NOT here.
 */
function cascadeFields(fields: Record<string, unknown>): Record<string, unknown> {
  return {
    vsb_useinflationprofile: fields.vsb_useinflationprofile,
    vsb_usecountryinflationprofile: fields.vsb_usecountryinflationprofile,
    vsb_inflationprofile: fields.vsb_inflationprofile,
    vsb_inflationstartyear: fields.vsb_inflationstartyear,
    vsb_inflationcountryarea: fields.vsb_inflationcountryarea,
    vsb_threshold: fields.vsb_threshold,
    vsb_thresholdindividual: fields.vsb_thresholdindividual,
    vsb_thresholdtype: fields.vsb_thresholdtype,
    // Edited canvas: `IsStartDateStandardAssumption: locSelectedOpexCost.IsStartDateStandardAssumption`.
    vsb_isstartdatestandardassumption: fields.vsb_isstartdatestandardassumption,
    vsb_alignwithprojectduration: fields.vsb_alignwithprojectduration,
    vsb_externalcontract: fields.vsb_externalcontract,
  };
}

/** Every row whose `vsb_parentcost` is `headId`, in the canvas' `Name` ascending chain order. */
async function childrenOfChain(headId: string): Promise<{ id: string; name: string }[]> {
  const rows = await fetchAll(
    "list OPEX chain children",
    (o) => Vsb_opexprojectcostsService.getAll(o),
    {
      select: ["vsb_opexprojectcostid", "vsb_name"],
      filter: lookupEq("vsb_parentcost", headId),
    },
  );
  return rows
    .map((r) => ({ id: r.vsb_opexprojectcostid, name: r.vsb_name ?? "" }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** The writable column bag for one `vsb_opexprojectcosts` row, straight off the canvas' Patch. */
function opexFields(
  period: CostPeriod,
  target: OpexGroupTarget,
  currencyId: string | undefined,
): Record<string, unknown> {
  return {
    // The canvas interpolates the RAW text into `Name` and trims only `Description` (`:8695`).
    vsb_name: opexRowName(target, period.rawDescription ?? period.description.trim()),
    vsb_description: period.description.trim(),
    vsb_startdate: period.startDate,
    vsb_opexprojectdurationyears: period.years,
    vsb_opexprojectdurationmonths: period.months,
    // `Value(txt.Value)`: an empty box stores Blank, not 0. See `CostPeriod`'s money fields.
    vsb_fixcosts: money(period.fixed),
    vsb_ofrevenues: money(period.revenue),
    vsb_eurmwh: money(period.perMwh),
    vsb_eurmw: money(period.perMw),
    vsb_eurwtg: money(period.perWtg),
    // All THREE options, not MAX-or-else-SUM: the dropdown is `Choices('Opex Aggregation')` and
    // four live rows carry MIN, which the old map silently rewrote to SUM on save.
    vsb_aggregation: writeAggregation(period.aggregation),
    vsb_distributionfrequency: period.frequency,
    vsb_threshold: period.threshold,
    // Written on BOTH branches, `null` when the toggle is off. Omitting them instead — which is
    // what this did — left a stale Individual threshold on a row the user had just switched off,
    // and the cascade then copied it onto every period of the chain.
    //
    // The TYPE is the panel's own radio selection (`rdg_….Selected.Value`), defaulting to
    // Individual only when the caller sent none; the VALUE is the panel's Individual box
    // (`Value(txt_…_Threshold_Individual.Value)`) and NOT `vsb_eurmwh`. Copying `perMwh` in here
    // — which is what this did — would have overwritten the stored threshold on all 8 live rows
    // that carry one: measured 16 Sep, every one of them has `vsb_thresholdindividual` 222.00
    // against a `vsb_eurmwh` of 33.00 or 990.00.
    //
    // Run 3 (FT-BR-OPEX-079): the canvas writes `rdg.Selected.Value` and
    // `Value(txt_Individual.Value)` whatever the toggle says (`:8703`), so a row saved with the
    // toggle off keeps the type and the Individual figure the (reset) controls held.
    vsb_thresholdtype: period.thresholdType
      ?? (period.threshold ? THRESHOLD_TYPE_INDIVIDUAL : null),
    vsb_thresholdindividual: money(period.thresholdIndividual),
    vsb_useinflationprofile: period.inflation,
    vsb_usecountryinflationprofile: period.countryInflation,
    /*
     * `'Inflation Profile': If(tgl_InflationProfile.Checked, Value(txt_InflationProfile.Value),
     * Blank())` — `:8695`, gated on the INFLATION toggle alone.
     *
     * The country-profile case is NOT excluded. `txt_…_InflationProfile` is hidden while the
     * country toggle is on (`Visible: =Not(tgl_CountryInflationProfile.Checked)`) but a hidden
     * Power Fx control still evaluates its `Value`, and that formula's two country arms are
     * `Max(LookUp('Country Inflation Profiles', country && year [&& area]).Inflation, 0)`
     * (`:7822-7847`) — so the canvas STORES the resolved country percentage on the row.
     * Writing `null` there, which is what this did, left every country-profile row with no
     * percentage at all and made the resolved figure unreadable by anything downstream.
     */
    vsb_inflationprofile: period.inflation ? money(period.inflationPercent) : null,
    vsb_inflationstartyear: period.inflation ? period.inflationYear : null,
    // `If(countryInflationToggle, areaDropdown.Selected.Value, Blank())` — a TEXT column whose
    // values come from `Country Inflation Profiles.Area` ("North", "Centre - North").
    vsb_inflationcountryarea:
      period.countryInflation ? (period.inflationCountryArea ?? "") || null : null,
    vsb_alignwithprojectduration: period.align,
    vsb_externalcontract: period.external,
    // Never part of a hand-saved Patch (`:8703`); only the standard import sets it.
    ...(period.standard ? { vsb_isstandardcontract: true } : {}),
    // Blank stays Blank: `Coalesce(parent flag, locIsStartDateStandardAssumption)` of a root whose
    // stored flag is Blank is Blank, so null is written and cascaded, never false (UT-PWRITE-048).
    vsb_isstartdatestandardassumption: period.isStartDateStandard ?? null,
    ...(currencyId ? { "vsb_Currency@odata.bind": bind("transactioncurrencies", currencyId) } : {}),
  };
}

/**
 * What the OPEX Save needs from the screen beyond the row itself (all optional, additive).
 *
 * The canvas remembers `locWasExisting` / `locPrevStartDate` / `locPrevDurationMonths` before the
 * Patch and orders the chain from `colOpexProjectCosts` as loaded BEFORE the save; `before` and
 * `bookPeriods` carry exactly those. `warnings` receives the two non-fatal `Notify` texts (the
 * canvas shows them and carries on), so the caller can show them without failing the save.
 */
export interface OpexSaveExtras {
  /** The period as it was before this save, or null for an Add. */
  before: CostPeriod | null;
  /** Every period of the book as loaded before the save. */
  bookPeriods: readonly CostPeriod[];
  warnings?: string[];
}

const messageOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/**
 * Runs `task` for every item, `WRITE_CONCURRENCY` at a time, EVERY item whatever happens to the others, and returns the message of the
 * first failure in ITEM order (null when none). The canvas' `ForAll` inside `IfError` tries each row and shows the first error
 * (OPT-11: the loops that did that one row at a time).
 */
async function firstFailureOf<T>(items: readonly T[], task: (item: T) => Promise<unknown>): Promise<string | null> {
  const failures: (string | undefined)[] = [];
  await mapLimit(items, async (item, index) => {
    try { await task(item); } catch (e) { failures[index] = messageOf(e); }
  }, WRITE_CONCURRENCY);
  for (let i = 0; i < items.length; i += 1) if (failures[i] !== undefined) return failures[i] as string;
  return null;
}

/** The periods of one chain: its head and the rows that point at it (shared by the re-chain plan and its guard, dvopt CB-01). */
const inChainOf = (rootId: string) => (p: CostPeriod): boolean => p.id === rootId || p.parentId === rootId;
const toChainPeriod = (p: CostPeriod): ChainPeriod => ({
  id: p.id, startDate: p.startDate || null, durationYears: p.years, durationMonths: p.months,
});

/** dvopt CB-01, `OPEX_GUARD`: one existence read of the row an edit updates and the followers it re-chains; `RecordGoneError`, nothing sent. */
async function guardOpexUpdates(rowId: string, followerIds: readonly string[], enabled: boolean = OPEX_GUARD): Promise<void> {
  if (!enabled) return;
  await assertRowsExist("update OPEX period", ES_PLANT.opexProjectCosts, [rowId, ...followerIds]);
}

export async function saveOpexPeriod(
  ctx: PeriodWriteContext,
  period: CostPeriod,
  isNew: boolean,
  extras?: OpexSaveExtras,
): Promise<CostPeriod> {
  const mode = period.mode as "om" | "other";
  const [currencyId, target] = await Promise.all([
    resolveCurrencyId(period.currency),
    resolveOpexGroupTarget(ctx.projectId, mode, period.group, period.deviceId, ctx.opexCatalog),
  ]);
  // `'Time Zone Rule Version Number': 4` is in every hand-saved Patch (`:8703`); the standard
  // import does not set it. Not part of `cascadeFields`, which copies ten named columns only.
  const fields = {
    ...opexFields(period, target, currencyId),
    timezoneruleversionnumber: OPEX_TIME_ZONE_RULE_VERSION_NUMBER,
  };

  // The canvas re-binds Subaccount and DeviceTypeInProject on every save, not only on create
  // (`:8695` patches them unconditionally). That is what lets a period follow its group when the
  // panel is reopened on a different card, and it is idempotent when it has not moved.
  const bindings = {
    "vsb_Subaccount@odata.bind": bind("vsb_opexsubaccounts", target.subaccountId),
    ...(target.deviceTypeInProjectId
      ? { "vsb_DeviceTypeInProject@odata.bind": bind("vsb_devicetypesinprojects", target.deviceTypeInProjectId) }
      : {}),
    // `'Owning Business Unit': gblSelectedProject.'Besitzer (Unternehmenseinheit)'` is in the same unconditional
    // Patch (`:8794`), so an Edit re-binds it too and a cost follows its project's business unit (D123; it was
    // written on create only).
    ...(ctx.owningBusinessUnitId
      ? { "owningbusinessunit@odata.bind": bind("businessunits", ctx.owningBusinessUnitId) } : {}),
  };

  // dvopt CB-01: the periods that follow the edited one are re-chained further down. The plan is pure (it reads `extras` and `period`
  // only), so it is worked out HERE, so that the row, its followers and nothing else are checked in ONE read before the first write.
  const rechainPlan = extras && !isNew && extras.before
    ? planFollowingPeriodStarts({
      chain: extras.bookPeriods.filter(inChainOf(period.parentId ?? period.id)).map(toChainPeriod),
      saved: toChainPeriod(period),
      previous: toChainPeriod(extras.before),
    })
    : [];
  // An UPDATE is a PATCH with no If-Match (an upsert): on a row another user deleted it would create a project-less row. Refused first.
  if (!isNew) await guardOpexUpdates(period.id, rechainPlan.map((step) => step.id));

  let savedId = period.id;
  if (isNew) {
    const created = await createWithStableId({
      operation: "create OPEX period",
      entitySet: ES_PLANT.opexProjectCosts,
      idField: "vsb_opexprojectcostid",
      payload: {
        ...fields,
        ...bindings,
        "vsb_Project@odata.bind": bind("vsb_projects", ctx.projectId),
        // The chain link. A period added to an existing contract points at that contract's HEAD,
        // never at the period before it — the canvas resolves the parent as
        // `Coalesce(LookUp(costs, id = selected.'Parent Cost'), selected)` (`:609`), i.e. the head
        // whichever period the user had selected.
        ...(period.parentId
          ? { "vsb_ParentCost@odata.bind": bind("vsb_opexprojectcosts", period.parentId) }
          : {}),
      },
      create: (p) => Vsb_opexprojectcostsService.create(p as never) as unknown as Promise<IOperationResult<Record<string, unknown>>>,
    });
    savedId = created.id;
  } else {
    unwrap(
      await Vsb_opexprojectcostsService.update(period.id, { ...fields, ...bindings } as never),
      "update OPEX period",
    );
  }

  // Rule 12's cascade. Run for every save, exactly as the canvas does: on a later period the
  // filter simply returns nothing, because the chain is a star and only heads have children.
  // OPT-11: a period that points at a head (`parentId`), and a row created a moment ago, have no children of their own, so the query
  // is not sent for them (it always came back empty: the chain is a star). Only an existing head asks.
  const children = period.parentId || isNew ? [] : await childrenOfChain(savedId);
  const cascade = cascadeFields(fields);
  // The canvas wraps the ForAll in `IfError(…, Notify("Error: the child periods could not be
  // updated. …"); Blank())`: every child is tried, the first failure is shown, the save goes on.
  // OPT-11: the children are patched side by side (`WRITE_CONCURRENCY`); each is still tried, and the failure shown is the first IN ORDER.
  const childFailure = await firstFailureOf(children, async (child) => {
    unwrap(
      await Vsb_opexprojectcostsService.update(child.id, cascade as never),
      "cascade OPEX inflation to a child period",
    );
  });
  if (childFailure !== null) {
    extras?.warnings?.push(OPEX_MSG.childPeriodsFailed("Save", childFailure));
    if (!extras?.warnings) throw new Error(OPEX_MSG.childPeriodsFailed("Save", childFailure));
  }

  // Where the saved row now sits in its chain, read back rather than assumed: the slot depends on
  // `vsb_name` ordering, and the name is composed from a description the panel may have changed.
  // OPT-11: it reads only the head's children by name, which the row's own write has already set and neither the cascade nor the
  // re-chain below touches (they write other columns), so it starts here, beside the re-chain, instead of after it. A failure of it
  // still surfaces after the re-chain's own outcome, as before.
  const siblingsRead = period.parentId ? childrenOfChain(period.parentId) : null;
  siblingsRead?.catch(() => undefined); // a throw of the re-chain below must not leave this one unhandled

  // Edited canvas: when an EXISTING period's Start Date or total months changed, re-chain the
  // periods that follow it (`planFollowingPeriodStarts`), one PATCH per period (side by side, OPT-11).
  if (extras && !isNew && extras.before) {
    const plan = rechainPlan;
    const rechainFailure = await firstFailureOf(plan, (step) => loggedCall(
      "update", `${ES_PLANT.opexProjectCosts} (re-chain start date)`,
      async () => unwrap(
        await Vsb_opexprojectcostsService.update(step.id, { vsb_startdate: step.startDate } as never),
        "re-chain a following OPEX period",
      ),
      () => 1,
    ));
    if (rechainFailure !== null) {
      extras.warnings?.push(OPEX_MSG.followingPeriodsFailed("Save", rechainFailure));
      if (!extras.warnings) throw new Error(OPEX_MSG.followingPeriodsFailed("Save", rechainFailure));
    }
  }

  let periodIndex = 1;
  if (siblingsRead) {
    const siblings = await siblingsRead;
    const at = siblings.findIndex((s) => s.id === savedId);
    periodIndex = at === -1 ? (period.periodIndex ?? siblings.length + 1) : at + 2;
  }

  return {
    ...period,
    id: savedId,
    contractId: period.parentId ?? savedId,
    periodIndex,
  };
}

/**
 * Deletes one period, and — when it is a chain HEAD — every period under it.
 *
 * `OpexCostScreenCode.txt:8861-8874`: `If(IsBlank('Parent Cost'), RemoveIf(Or('Parent Cost' = X,
 * id = X)), RemoveIf(id = X))`. Rather than trusting the caller's `parentId` this asks Dataverse
 * which rows point at `X`: on a later period that query is empty, so the two branches collapse
 * into one and a stale in-memory period cannot orphan a chain.
 *
 * Children go FIRST. An interrupted delete then leaves a head with fewer periods — a state the
 * screen renders and the user can finish — instead of orphan rows whose parent no longer exists
 * and which no card would ever show.
 */
export async function deleteOpexPeriod(period: CostPeriod): Promise<void> {
  const children = await childrenOfChain(period.id);
  // Through `deleteRecord` (rule 14, CA-27): the generated `delete()` returns nothing, so a refusal looked like success.
  // OPT-11: the children go side by side (`WRITE_CONCURRENCY`), the head only after every one has settled, so the head is never gone
  // while a child still points at it. A failing child stops the rest from starting and the error is the first one IN ORDER, as the loop's.
  // dvopt CB-03, `GONE_AS_DONE_LEASE_OPEX`: a row already gone (a 404) is a delete that is done, so a retry after a partial delete finishes.
  const remove = GONE_AS_DONE_LEASE_OPEX ? deleteIfExists : deleteRecord;
  await mapLimitFirstFailure(
    children,
    (child) => remove("delete OPEX period", ES_PLANT.opexProjectCosts, child.id),
    WRITE_CONCURRENCY,
  );
  await remove("delete OPEX period", ES_PLANT.opexProjectCosts, period.id);
}

/* ══════════════════════════════════════════════ Add Standard Contract ══ */

/**
 * One `vsb_opexlandleasestandardassumptionses` row, as the seeding path reads it.
 *
 * The same table backs all three modes; `vsb_typeofcontract` picks which, and `vsb_period`
 * (Period1..Period10) turns a set of rows into a chain.
 */
interface AssumptionRow {
  vsb_opexlandleasestandardassumptionsid: string;
  vsb_name?: string;
  vsb_description?: string;
  vsb_period?: number;
  _vsb_currency_value?: string;
  _vsb_opexsubaccount_value?: string;
  _vsb_landleasesubaccount_value?: string;
  vsb_durationinyears?: number;
  vsb_durationinmonths?: number;
  vsb_fixcosts?: number;
  vsb_ofrevenues?: number;
  vsb_eurmwh?: number;
  vsb_eurmw?: number;
  vsb_eurwtg?: number;
  vsb_aggregation?: number;
  vsb_distributionfrequency?: number;
  vsb_threshold?: boolean;
  vsb_thresholdtype?: number;
  vsb_thresholdindividual?: number;
  vsb_useinflationprofile?: boolean;
  vsb_usecountryinflationprofile?: boolean;
  vsb_inflationprofile?: number;
  vsb_inflationcountryarea?: string;
  vsb_alignwithprojectduration?: boolean;
  vsb_externalcontract?: boolean;
  vsb_allwtgallocated?: boolean;
  vsb_secured?: boolean;
  vsb_amountonetimepayment?: number;
  vsb_amountonetimepayment2?: number;
  vsb_amountonetimepayment3?: number;
  vsb_duedateonetimepayment?: string;
  vsb_duedateonetimepayment2?: string;
  vsb_duedateonetimepayment3?: string;
}

const ASSUMPTION_SELECT = [
  "vsb_opexlandleasestandardassumptionsid", "vsb_name", "vsb_description", "vsb_period",
  "_vsb_currency_value", "_vsb_opexsubaccount_value", "_vsb_landleasesubaccount_value",
  "vsb_durationinyears", "vsb_durationinmonths",
  "vsb_fixcosts", "vsb_ofrevenues", "vsb_eurmwh", "vsb_eurmw", "vsb_eurwtg",
  "vsb_aggregation", "vsb_distributionfrequency",
  "vsb_threshold", "vsb_thresholdtype", "vsb_thresholdindividual",
  "vsb_useinflationprofile", "vsb_usecountryinflationprofile", "vsb_inflationprofile",
  "vsb_inflationcountryarea", "vsb_alignwithprojectduration", "vsb_externalcontract",
  "vsb_allwtgallocated", "vsb_secured",
  "vsb_amountonetimepayment", "vsb_amountonetimepayment2", "vsb_amountonetimepayment3",
  "vsb_duedateonetimepayment", "vsb_duedateonetimepayment2", "vsb_duedateonetimepayment3",
];

export interface StandardContractArgs {
  mode: PeriodMode;
  /** The card the command was pressed on: device name (O&M) or sub-account name (the other two). */
  group: string;
  /** O&M: the card's device row id — the name in `group` is not unique. */
  deviceId?: string;
  /** `gblSelectedProject.Country.Country` — `_vsb_country_value` on the project row. */
  countryId?: string;
  /** `gblSelectedProject.Technology` — the same global option set on both tables. */
  technology?: number;
  /** `gblSelectedProject.'Operations start date (COD)'`, `yyyy-mm-dd`. Period 1 starts here. */
  codDate: string;
  /**
   * `LookUp('Country Inflation Profiles', Country = project's country && Year = COD year + 1)
   * .Inflation` — the percentage a "use the country profile" assumption resolves to. The caller
   * looks it up because it already has the country and this module has no business holding a
   * second copy of that query.
   */
  countryInflationPercent?: number;
}

/** `startDate` + `years*12 + months` months, clamping the day like `periodEnd` does. */
function addMonths(iso: string, months: number): string {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return dateOnly(addMonthsOnDate(d, months));   // D159: the shared clamping and the shared local date text (rule 18)
}

async function loadAssumptions(
  typeOfContract: number,
  args: StandardContractArgs,
  subaccountColumn: "vsb_opexsubaccount" | "vsb_landleasesubaccount" | undefined,
  subaccountId: string | undefined,
): Promise<AssumptionRow[]> {
  const rows = await fetchAll(
    "list OPEX / Land Lease standard assumptions",
    (o) => Vsb_opexlandleasestandardassumptionsesService.getAll(o),
    {
      select: ASSUMPTION_SELECT,
      filter: and(
        eq("vsb_typeofcontract", typeOfContract),
        args.countryId ? lookupEq("vsb_country", args.countryId) : undefined,
        args.technology !== undefined ? eq("vsb_technology", args.technology) : undefined,
        subaccountColumn && subaccountId ? lookupEq(subaccountColumn, subaccountId) : undefined,
        ACTIVE,
      ),
    },
  ) as AssumptionRow[];
  // `Sort(…, Description, SortOrder.Ascending)` then the `Period` chain order. The canvas sorts
  // by Description for the Period-1 pick and walks the rest in `Period` order; doing both here
  // means a catalogue with two contracts per sub-account still chains each one correctly.
  return [...rows].sort(
    (a, b) =>
      (a.vsb_description ?? "").localeCompare(b.vsb_description ?? "")
      || (a.vsb_period ?? 0) - (b.vsb_period ?? 0),
  );
}

/**
 * "Add Standard Contract" — seeds a real assumption-driven chain, not a placeholder.
 *
 * `OpexCostScreenCode.txt:631-916` (Other OPEX), `:3019-3300` (O&M) and
 * `LandLeaseCostScreenCode.txt:388` (Land Lease) are the same shape three times:
 *
 *   1. refuse if the scope already has a standard contract
 *      (`If(CountRows(Filter(costs, project && 'Is Standard Contract?' = Yes && scope)) = 0, …)`);
 *   2. create the Period-1 row from the `Period 1` assumption, starting at COD;
 *   3. create each later assumption as a period whose start is the previous period's start plus
 *      the previous period's duration, linked to the Period-1 row.
 *
 * Returns the created periods in chain order so the caller can put them straight into the book.
 * Sequential, parent first: there is no `$batch`, and a later period cannot be written before
 * the row it points at exists.
 */
export async function addStandardContract(
  ctx: PeriodWriteContext,
  args: StandardContractArgs,
): Promise<CostPeriod[]> {
  if (args.mode === "land") throw new Error(NOT_HERE);
  return addOpexStandardContract(ctx, args);
}

/**
 * OPT-11 (B3) — `true`: the rows of an OPEX standard import after the first go through a bounded pool; `false`: one request
 * after the other, as before. DIVERGENCE: the rows are created in a different order, so their `createdon` order is no longer the
 * assumptions' order. Nothing in this app reads it for these rows (the book has no created-on column and the add-period start date is
 * `startDateDefault` with `deviceCosts: []`); the canvas' own "last created period on the card" rule does.
 */
export const OPEX_IMPORT_PARALLEL = true;

/** One row of the import, fully worked out before anything is sent. */
interface OpexImportSeed {
  a: AssumptionRow;
  period: CostPeriod;
  rawDescription: string;
  profile: number | null;
  isFirst: boolean;
  contractName: string;
  periodIndex: number;
}

async function addOpexStandardContract(
  ctx: PeriodWriteContext,
  args: StandardContractArgs,
): Promise<CostPeriod[]> {
  const mode = args.mode as "om" | "other";
  const target = await resolveOpexGroupTarget(ctx.projectId, mode, args.group, args.deviceId, ctx.opexCatalog);

  const existing = await fetchAll(
    "check for an existing OPEX standard contract",
    (o) => Vsb_opexprojectcostsService.getAll(o),
    {
      select: ["vsb_opexprojectcostid"],
      filter: and(
        lookupEq("vsb_project", ctx.projectId),
        eq("vsb_isstandardcontract", true),
        mode === "om"
          ? lookupEq("vsb_devicetypeinproject", target.deviceTypeInProjectId as string)
          : lookupEq("vsb_subaccount", target.subaccountId),
        ACTIVE,
      ),
    },
  );
  if (existing.length > 0) {
    throw new Error(`"${args.group}" already has a standard contract.`);
  }

  const assumptions = await loadAssumptions(
    CONTRACT_TYPE[mode],
    args,
    // O&M's catalogue is NOT scoped by sub-account — `:3038-3046` filters on country, technology
    // and contract type only, because every O&M assumption belongs to the one O&M sub-account.
    mode === "other" ? "vsb_opexsubaccount" : undefined,
    mode === "other" ? target.subaccountId : undefined,
  );
  if (assumptions.length === 0) {
    throw new Error(`No standard assumptions are configured for "${args.group}".`);
  }

  /*
   * Run 3 (FT-BR-OPEX-089/091): the canvas makes ONE contract per Period-1 assumption
   * (`ForAll(recStandardAssumptionContracts, …)`, `:3066-3077`), then every later period is
   * parented on the FIRST contract (`LookUp(colContract, …)`, `:3169-3175`). Period 2 starts when
   * that contract ends; a later period starts when the last period created so far ends (sorted by
   * Description for O&M, `:3189-3215`; by Period for Other OPEX, `:801-827`).
   */
  /*
   * OPT-11: the payloads of EVERY row are worked out first. Nothing in a row's own columns needs the id of another row except the
   * parent bind of the later periods (the Period-1 row's id), and the start dates, slots and names come from the assumptions alone, so
   * this pass is pure and runs in the canvas' order. Then the Period-1 row is created (its id is the only thing the rest waits for)
   * and the other rows go through a bounded pool, instead of one request after the other.
   */
  const seeds: OpexImportSeed[] = [];
  const heads: CostPeriod[] = [];
  const later: { period: CostPeriod; order: number }[] = [];
  const codYear = new Date(`${args.codDate}T12:00:00`).getFullYear() + 1;

  for (const a of assumptions) {
    const isFirst = Number(a.vsb_period ?? ASSUMPTION_PERIOD_1) === ASSUMPTION_PERIOD_1;
    if (!isFirst && heads.length === 0) continue; // a chain with no head is not one this command can seed.
    let startDate = args.codDate;
    if (!isFirst) {
      const periodNo = Number(a.vsb_period ?? 0) - ASSUMPTION_PERIOD_1;
      const sorted = [...later].sort((x, y) => mode === "om"
        ? x.period.description.localeCompare(y.period.description)
        : x.order - y.order);
      const previous = periodNo === 1 || sorted.length === 0
        ? heads[0] : sorted[sorted.length - 1]?.period;
      if (previous) startDate = addMonths(previous.startDate, (previous.years ?? 0) * 12 + (previous.months ?? 0));
    }

    const rawDescription = a.vsb_description ?? "";
    const description = rawDescription.trim();
    // `Switch(true, inflation && country → LookUp(...).Inflation, inflation && !country →
    // assumption's profile, Blank())` — Blank (null), not 0, when nothing matches.
    const profile = a.vsb_useinflationprofile !== true
      ? null
      : a.vsb_usecountryinflationprofile === true
        ? args.countryInflationPercent ?? null
        : a.vsb_inflationprofile ?? null;
    const period: CostPeriod = {
      id: "",
      group: args.group,
      deviceId: target.deviceTypeInProjectId,
      mode,
      description,
      startDate,
      years: a.vsb_durationinyears ?? 0,
      months: a.vsb_durationinmonths ?? 0,
      currency: "",
      fixed: money(a.vsb_fixcosts),
      revenue: money(a.vsb_ofrevenues),
      perMwh: money(a.vsb_eurmwh),
      perMw: money(a.vsb_eurmw),
      perWtg: money(a.vsb_eurwtg),
      aggregation: readAggregation(a.vsb_aggregation),
      frequency: a.vsb_distributionfrequency ?? 1,
      inflation: a.vsb_useinflationprofile === true,
      countryInflation: a.vsb_usecountryinflationprofile === true,
      // `'Inflation Start Year': recCODYear` — COD year + 1, on every seeded row.
      inflationYear: codYear,
      inflationPercent: profile ?? 0,
      inflationCountryArea: a.vsb_inflationcountryarea ?? "",
      threshold: a.vsb_threshold === true,
      // `'Threshold Type': StandardAssumptionContractRecord.'Threshold Type'` and
      // `'Threshold individual': …'Threshold Individual'` (`:702-703`, `:3101-3102`) — copied from
      // the assumption whatever its Threshold toggle says.
      thresholdType: numberOfOption(a.vsb_thresholdtype),
      thresholdIndividual: money(a.vsb_thresholdindividual),
      align: a.vsb_alignwithprojectduration === true,
      external: a.vsb_externalcontract === true,
      standard: true,
      isStartDateStandard: true,
    };

    seeds.push({
      a, period, rawDescription, profile, isFirst,
      contractName: heads[0]?.description ?? description,
      periodIndex: isFirst ? 1 : later.length + 2,
    });
    if (isFirst) heads.push(period);
    else later.push({ period, order: Number(a.vsb_period ?? 0) });
  }
  if (seeds.length === 0) return [];

  const createSeed = async (seed: OpexImportSeed, headId: string | undefined): Promise<CostPeriod> => {
    const { a, period, rawDescription, profile } = seed;
    const created = unwrap(
      await Vsb_opexprojectcostsService.create({
        // The assumption's own threshold type and individual value ride on the period and are
        // written by `opexFields`, so there is no longer a second, overriding copy here.
        ...opexFields(period, target, a._vsb_currency_value),
        // What the canvas import writes that the hand-save fields do not (run 3):
        // the raw description in `Name` with the account display name (no device name), the
        // profile as Blank when nothing resolves, COD year + 1 and the assumption's area on
        // every row whatever the toggles say. No `Time Zone Rule Version Number`.
        vsb_name: opexStandardName(mode, target.subaccountName, rawDescription),
        vsb_inflationprofile: profile,
        vsb_inflationstartyear: codYear,
        vsb_inflationcountryarea: a.vsb_inflationcountryarea || null,
        "vsb_Project@odata.bind": bind("vsb_projects", ctx.projectId),
        "vsb_Subaccount@odata.bind": bind("vsb_opexsubaccounts", target.subaccountId),
        ...(target.deviceTypeInProjectId
          ? { "vsb_DeviceTypeInProject@odata.bind": bind("vsb_devicetypesinprojects", target.deviceTypeInProjectId) }
          : {}),
        ...(headId ? { "vsb_ParentCost@odata.bind": bind("vsb_opexprojectcosts", headId) } : {}),
        ...(ctx.owningBusinessUnitId
          ? { "owningbusinessunit@odata.bind": bind("businessunits", ctx.owningBusinessUnitId) } : {}),
      } as never),
      "create a standard OPEX period",
    );
    const id = created.vsb_opexprojectcostid;
    return {
      ...period,
      id,
      parentId: headId,
      contractId: headId ?? id,
      contractName: seed.contractName,
      periodIndex: seed.periodIndex,
    };
  };

  // The first row is always a Period-1 row (a later one is skipped until one exists) and every later row binds to ITS id.
  const first = await createSeed(seeds[0] as OpexImportSeed, undefined);
  const rest = seeds.slice(1);
  const createRest = (seed: OpexImportSeed): Promise<CostPeriod> => createSeed(seed, seed.isFirst ? undefined : first.id);
  let others: CostPeriod[];
  if (OPEX_IMPORT_PARALLEL) {
    // First failure IN ORDER, nothing started after a failure: the loop's behaviour; rows already in flight may have landed.
    others = await mapLimitFirstFailure(rest, createRest, WRITE_CONCURRENCY);
  } else {
    others = [];
    for (const seed of rest) others.push(await createRest(seed));
  }
  const out: CostPeriod[] = [first, ...others];
  return out;
}

/* ══════════════════════════════════════════════════════════════════════ dispatch ══ */

/**
 * OPT-34 (B3): Land Lease is no longer written here. Its Save, Delete and Add Standard Contract are plans of writes
 * (`planLeaseSave` / `planLeaseDelete` / `planStandardImport`) that `data/landLease.ts`' `applyLeaseWrites` runs, and since B2 the OPEX book
 * never holds a Land Lease period, so nothing could reach the old slot-based Land Lease path (about 450 lines, with its own,
 * different rules) through these three entry points. A `land` period here is a caller bug and is refused, not written by a second implementation.
 */
const NOT_HERE = "Land Lease periods are written through applyLeaseWrites (data/landLease.ts), not through the OPEX period writes.";

export async function savePeriod(
  ctx: PeriodWriteContext,
  period: CostPeriod,
  isNew: boolean,
  extras?: OpexSaveExtras,
): Promise<CostPeriod> {
  if (period.mode === "land") throw new Error(NOT_HERE);
  return saveOpexPeriod(ctx, period, isNew, extras);
}

export async function deletePeriod(period: CostPeriod): Promise<void> {
  if (period.mode === "land") throw new Error(NOT_HERE);
  await deleteOpexPeriod(period);
}
