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
import { Vsb_landleaseprojectcostsService } from "@/generated/services/Vsb_landleaseprojectcostsService";
import { Vsb_landleaseperiodsService } from "@/generated/services/Vsb_landleaseperiodsService";
import { Vsb_landleasesubaccountsService } from "@/generated/services/Vsb_landleasesubaccountsService";
import { Vsb_landleaseallocationwtgsService } from "@/generated/services/Vsb_landleaseallocationwtgsService";
import { Vsb_opexlandleasestandardassumptionsesService } from "@/generated/services/Vsb_opexlandleasestandardassumptionsesService";
import { TransactioncurrenciesService } from "@/generated/services/TransactioncurrenciesService";
import { unwrap } from "@/platform/errors";
import type { CostPeriod, PeriodMode } from "@/features/costing/model";
import { fetchAll } from "./client";
import { ACTIVE, and, eq, guid, lookupEq, lookupIn } from "./odata";
import {
  LAND_LEASE_PERIOD_CHOICE, LAND_LEASE_SECURED, THRESHOLD_TYPE_VALUE,
  landLeasePeriodIndex, readAggregation, writeAggregation,
} from "./costBook";

const bind = (entitySet: string, id: string) => `/${entitySet}(${id})`;

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
function money(value: number | null | undefined): number | null {
  return value === null || value === undefined || !Number.isFinite(value) ? null : value;
}

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
const CONTRACT_TYPE = { land: 952850000, om: 952850001, other: 952850002 } as const;

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
}

/* ══════════════════════════════════════════════════════ group -> id lookups ══ */

async function resolveCurrencyId(currencyName: string): Promise<string | undefined> {
  const name = currencyName.trim();
  if (!name) return undefined;
  const rows = await fetchAll(
    "list transaction currencies",
    (o) => TransactioncurrenciesService.getAll(o),
    { select: ["transactioncurrencyid", "currencyname"], filter: ACTIVE },
  );
  const match = rows.find((r) => (r.currencyname ?? "").toLowerCase() === name.toLowerCase());
  return match?.transactioncurrencyid;
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
): Promise<OpexGroupTarget> {
  const [accounts, subaccounts] = await Promise.all([
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

  const device = await resolveDeviceType(projectId, group);
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

async function resolveLandLeaseSubaccount(
  group: string,
): Promise<{ id: string; name: string }> {
  const rows = await fetchAll(
    "list Land Lease subaccounts for a period save",
    (o) => Vsb_landleasesubaccountsService.getAll(o),
    { select: ["vsb_landleasesubaccountid", "vsb_name"], filter: ACTIVE },
  );
  const match = rows.find((r) => (r.vsb_name ?? "").toLowerCase() === group.toLowerCase());
  if (!match) throw new Error(`Unknown Land Lease location "${group}".`);
  return { id: match.vsb_landleasesubaccountid, name: match.vsb_name ?? group };
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
    vsb_name: opexRowName(target, period.description.trim()),
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
    vsb_thresholdtype: period.threshold
      ? (period.thresholdType ?? THRESHOLD_TYPE_INDIVIDUAL) : null,
    vsb_thresholdindividual: period.threshold ? money(period.thresholdIndividual) : null,
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
    vsb_isstandardcontract: period.standard,
    vsb_isstartdatestandardassumption: period.isStartDateStandard === true,
    ...(currencyId ? { "vsb_Currency@odata.bind": bind("transactioncurrencies", currencyId) } : {}),
  };
}

export async function saveOpexPeriod(
  ctx: PeriodWriteContext,
  period: CostPeriod,
  isNew: boolean,
): Promise<CostPeriod> {
  const mode = period.mode as "om" | "other";
  const [currencyId, target] = await Promise.all([
    resolveCurrencyId(period.currency),
    resolveOpexGroupTarget(ctx.projectId, mode, period.group),
  ]);
  const fields = opexFields(period, target, currencyId);

  // The canvas re-binds Subaccount and DeviceTypeInProject on every save, not only on create
  // (`:8695` patches them unconditionally). That is what lets a period follow its group when the
  // panel is reopened on a different card, and it is idempotent when it has not moved.
  const bindings = {
    "vsb_Subaccount@odata.bind": bind("vsb_opexsubaccounts", target.subaccountId),
    ...(target.deviceTypeInProjectId
      ? { "vsb_DeviceTypeInProject@odata.bind": bind("vsb_devicetypesinprojects", target.deviceTypeInProjectId) }
      : {}),
  };

  let savedId = period.id;
  if (isNew) {
    const created = unwrap(
      await Vsb_opexprojectcostsService.create({
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
        ...(ctx.owningBusinessUnitId
          ? { "owningbusinessunit@odata.bind": bind("businessunits", ctx.owningBusinessUnitId) } : {}),
      } as never),
      "create OPEX period",
    );
    savedId = created.vsb_opexprojectcostid;
  } else {
    unwrap(
      await Vsb_opexprojectcostsService.update(period.id, { ...fields, ...bindings } as never),
      "update OPEX period",
    );
  }

  // Rule 12's cascade. Run for every save, exactly as the canvas does: on a later period the
  // filter simply returns nothing, because the chain is a star and only heads have children.
  const children = await childrenOfChain(savedId);
  const cascade = cascadeFields(fields);
  for (const child of children) {
    unwrap(
      await Vsb_opexprojectcostsService.update(child.id, cascade as never),
      "cascade OPEX inflation to a child period",
    );
  }

  // Where the saved row now sits in its chain, read back rather than assumed: the slot depends on
  // `vsb_name` ordering, and the name is composed from a description the panel may have changed.
  let periodIndex = 1;
  if (period.parentId) {
    const siblings = await childrenOfChain(period.parentId);
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
  for (const child of children) await Vsb_opexprojectcostsService.delete(child.id);
  await Vsb_opexprojectcostsService.delete(period.id);
}

/* ══════════════════════════════════════════════════════════════════ Land Lease ══ */

interface LandLeaseHeaderState {
  id: string;
  allWtgAllocated: boolean;
  hasOneTimePayment: boolean;
  secured: boolean;
}

/**
 * The header columns the panel's Description / Currency / Inflation / Secured controls own.
 *
 * `vsb_description` comes from the PERIOD's description box, not from `contractName`: the canvas
 * writes the one text input into both `'Land Lease Project Costs'.Description` and the period's
 * `Name` (`LandLeaseCostScreenCode.txt:5895`), so renaming Period 1 renames the contract. Reading
 * `contractName` instead would write back the value the loader put there and make the rename a
 * no-op on the contract.
 */
/**
 * The six one-time-payment columns, each written only when the caller supplied it.
 *
 * `vsb_amountonetimepayment` 1..3 are money; `vsb_duedateonetimepayment` 1..3 are FREE TEXT in
 * `MM/YYYY` (verified on the org — live values read `"12/2025"`), not dates, so they are written
 * as-is and blanked with `null` rather than being parsed.
 */
function oneTimePaymentFields(period: CostPeriod): Record<string, unknown> {
  const amount = (key: string, value: number | null | undefined) =>
    (value === undefined ? {} : { [key]: money(value) });
  const due = (key: string, value: string | null | undefined) =>
    (value === undefined ? {} : { [key]: value || null });
  return {
    ...amount("vsb_amountonetimepayment", period.amountOneTimePayment),
    ...amount("vsb_amountonetimepayment2", period.amountOneTimePayment2),
    ...amount("vsb_amountonetimepayment3", period.amountOneTimePayment3),
    ...due("vsb_duedateonetimepayment", period.dueDateOneTimePayment),
    ...due("vsb_duedateonetimepayment2", period.dueDateOneTimePayment2),
    ...due("vsb_duedateonetimepayment3", period.dueDateOneTimePayment3),
  };
}

function landLeaseHeaderFields(
  period: CostPeriod,
  currencyId: string | undefined,
  projectName: string | undefined,
  subaccountName: string,
): Record<string, unknown> {
  const description = period.description.trim() || subaccountName;
  return {
    vsb_name: [projectName, subaccountName, description].filter(Boolean).join("-"),
    vsb_description: description,
    // `Land Owner` and the three One-Time Payments live on the HEADER and are the panel's own
    // controls (`LandLeaseCostScreenCode.txt:5895`). They were neither selected on the way in nor
    // written on the way out, which made the whole One-Time Payment section cosmetic. Each is
    // written only when the caller has an opinion — `undefined` leaves the column alone, so a
    // save from a screen that does not edit them cannot blank a stored payment.
    ...(period.landOwner === undefined ? {} : { vsb_landowner: period.landOwner || null }),
    ...oneTimePaymentFields(period),
    vsb_useinflationprofile: period.inflation,
    vsb_usecountryinflationprofile: period.countryInflation,
    // The RESOLVED percentage, on the country branch too — the same rule `opexFields` states and
    // the same one `landLeaseRules.buildCostPayload` already follows
    // (`[LEASE_COST_COL.inflationProfile]: num(form.inflationProfile)`, written unconditionally).
    vsb_inflationprofile: period.inflation ? money(period.inflationPercent) : null,
    vsb_inflationstartyear: period.inflation ? period.inflationYear : null,
    vsb_inflationcountryarea:
      period.countryInflation ? (period.inflationCountryArea ?? "") || null : null,
    // `undefined` means "the caller has no opinion" and the column is left alone. Writing a
    // default would silently clear a Secured / Allocation flag another screen had set — the
    // failure mode this module's ordering rules exist to avoid.
    ...(period.secured === undefined
      ? {}
      : { vsb_secured: period.secured ? LAND_LEASE_SECURED.yes : LAND_LEASE_SECURED.no }),
    ...(period.allWtgAllocated === undefined
      ? {} : { vsb_allwtgallocated: period.allWtgAllocated }),
    ...(currencyId ? { "vsb_Currency@odata.bind": bind("transactioncurrencies", currencyId) } : {}),
  };
}

async function readLandLeaseHeader(id: string): Promise<LandLeaseHeaderState | undefined> {
  const rows = await fetchAll(
    "read a Land Lease header",
    (o) => Vsb_landleaseprojectcostsService.getAll(o),
    {
      select: [
        "vsb_landleaseprojectcostid", "vsb_allwtgallocated", "vsb_secured",
        "vsb_duedateonetimepayment", "vsb_amountonetimepayment",
      ],
      filter: `vsb_landleaseprojectcostid eq ${guid(id)}`,
    },
  );
  const row = rows.find((r) => r.vsb_landleaseprojectcostid === id);
  if (!row) return undefined;
  return {
    id: row.vsb_landleaseprojectcostid,
    allWtgAllocated: row.vsb_allwtgallocated === true,
    secured: Number(row.vsb_secured) === LAND_LEASE_SECURED.yes,
    hasOneTimePayment:
      row.vsb_duedateonetimepayment != null && row.vsb_amountonetimepayment != null,
  };
}

/**
 * The header half of a Land Lease save.
 *
 * `LandLeaseCostScreenCode.txt:5895` guards it with
 * `If(IsBlank(locSelectedLandLeaseCost) || locSelectedLandLeasePeriod.Period = 'Period 1', …)`:
 *
 *   no `contractId`   CREATE a new header — this is "Add Contract Type", and it is the only way
 *                     a Land Lease contract comes into existence.
 *   slot 1            UPDATE that header. Period 1 owns the contract's shared fields, which is
 *                     why the panel disables them on every later period.
 *   slot 2..9         LEAVE IT ALONE. Patching it here — which is what this did on every save —
 *                     let an edit to Period 3 rewrite the currency and inflation of Period 1.
 */
async function resolveLandLeaseHeader(
  ctx: PeriodWriteContext,
  period: CostPeriod,
  isNew: boolean,
): Promise<LandLeaseHeaderState> {
  if (period.contractId) {
    const existing = await readLandLeaseHeader(period.contractId);
    if (!existing) throw new Error("This Land Lease contract no longer exists.");
    // `IsBlank(locSelectedLandLeaseCost) || locSelectedLandLeasePeriod.Period = 'Period 1'`.
    // On "Add Period" the canvas' `locSelectedLandLeasePeriod` is Blank, so the second test is
    // false and the header is untouched — a NEW period under an EXISTING contract never rewrites
    // the contract, whatever slot it lands in.
    const ownsHeader = !isNew && (period.periodIndex ?? 1) === 1;
    if (!ownsHeader) return existing;
    const [currencyId, subaccount] = await Promise.all([
      resolveCurrencyId(period.currency),
      resolveLandLeaseSubaccount(period.group),
    ]);
    unwrap(
      await Vsb_landleaseprojectcostsService.update(
        existing.id,
        landLeaseHeaderFields(period, currencyId, ctx.projectName, subaccount.name) as never,
      ),
      "update Land Lease contract",
    );
    return {
      ...existing,
      secured: period.secured ?? existing.secured,
      allWtgAllocated: period.allWtgAllocated ?? existing.allWtgAllocated,
    };
  }

  if (!isNew) throw new Error("This Land Lease period is not attached to a contract.");

  const [currencyId, subaccount] = await Promise.all([
    resolveCurrencyId(period.currency),
    resolveLandLeaseSubaccount(period.group),
  ]);
  const created = unwrap(
    await Vsb_landleaseprojectcostsService.create({
      ...landLeaseHeaderFields(period, currencyId, ctx.projectName, subaccount.name),
      // `vsb_secured` is a REQUIRED picklist on this table, so a create must carry one even when
      // the panel has no control for it. "No" is the canvas' own unchecked-toggle answer.
      vsb_secured: period.secured ? LAND_LEASE_SECURED.yes : LAND_LEASE_SECURED.no,
      vsb_isstandardcontract: period.standard,
      vsb_isstartdatestandardassumption: period.isStartDateStandard === true,
      "vsb_Project@odata.bind": bind("vsb_projects", ctx.projectId),
      "vsb_Subaccount@odata.bind": bind("vsb_landleasesubaccounts", subaccount.id),
      ...(ctx.owningBusinessUnitId
        ? { "owningbusinessunit@odata.bind": bind("businessunits", ctx.owningBusinessUnitId) } : {}),
    } as never),
    "create Land Lease contract",
  );
  return {
    id: created.vsb_landleaseprojectcostid,
    allWtgAllocated: period.allWtgAllocated === true,
    secured: period.secured === true,
    // `Not(IsBlank(Due Date)) && Not(IsBlank(Amount))` on the FIRST payment
    // (`LandLeaseCostScreenCode.txt:1010`) — computed from what was just written, not assumed
    // false. It was hard-coded `false`, which reported "no OTP" on a contract created WITH one.
    hasOneTimePayment:
      (period.dueDateOneTimePayment ?? null) !== null
      && (period.amountOneTimePayment ?? null) !== null,
  };
}

/** The `vsb_period` slots already taken under a header, as 1-based indexes. */
async function usedLandLeaseSlots(headerId: string): Promise<number[]> {
  const rows = await fetchAll(
    "list Land Lease period slots",
    (o) => Vsb_landleaseperiodsService.getAll(o),
    { select: ["vsb_landleaseperiodid", "vsb_period"], filter: lookupEq("vsb_projectcost", headerId) },
  );
  return rows.map((r) => landLeasePeriodIndex(Number(r.vsb_period)));
}

/**
 * The slot a NEW period takes: its predecessor's + 1.
 *
 * `LandLeaseCostScreenCode.txt:5895` — `Switch(locParentLandLeasePeriod.Period, Period1, Period2,
 * Period2, Period3, … Period8, Period9, Period 1)`, where `locParentLandLeasePeriod` is the row
 * the user pressed Add Period on. That never collides, because Add Period is only enabled on the
 * LAST period of a contract (`:260-286`, `locSelectedLandLeasePeriod = varLastLandLeasePeriod`).
 * This reproduces the rule from the slots actually in use, so it holds even when the caller has
 * not tracked which period was selected — and it FILLS A GAP left by a delete rather than
 * running off the end of the nine, which is the one place it is deliberately kinder than canvas:
 * the canvas would hand out a duplicate slot there, and a duplicate `vsb_period` makes two
 * periods sort identically and the chain unreadable.
 */
export function nextLandLeaseSlot(used: readonly number[], preferred?: number): number {
  const taken = new Set(used);
  if (preferred !== undefined && preferred >= 1 && preferred <= 9 && !taken.has(preferred)) {
    return preferred;
  }
  for (let slot = 1; slot <= 9; slot += 1) if (!taken.has(slot)) return slot;
  throw new Error("This Land Lease contract already has the maximum of 9 periods.");
}

/** The writable column bag for one `vsb_landleaseperiods` row. */
function landLeasePeriodFields(period: CostPeriod): Record<string, unknown> {
  return {
    // The canvas writes the Description box straight into `Name` — and the table's Description
    // column reads it back (`Text: =ThisItem.Name`, `:1642`).
    vsb_name: period.description.trim(),
    vsb_startdate: period.startDate,
    vsb_landleasedurationyears: period.years,
    vsb_landleasedurationmonths: period.months,
    // Nullable, for the same reason OPEX's are: a blank rate is blank, and the Land Lease grid
    // prints a stored `0` but leaves a null cell empty.
    vsb_fixedcosts: money(period.fixed),
    vsb_ofrevenues: money(period.revenue),
    vsb_eurmwh: money(period.perMwh),
    vsb_eurmw: money(period.perMw),
    vsb_eurwtg: money(period.perWtg),
    vsb_aggregation: writeAggregation(period.aggregation),
    vsb_distributionfrequency: period.frequency,
  };
}

/**
 * Brings a contract's `vsb_landleaseallocationwtgs` rows in line with `allocatedGeneratorIds`.
 *
 * `undefined` means the caller has no opinion and NOTHING is touched — writing `[]` would delete
 * every allocation on the contract, and a lost or stranded allocation is the failure
 * `docs/01-BUGS-FOUND.md` S-5 records. Creates run before deletes so an interruption leaves an
 * over-allocated contract (visible, fixable) rather than an under-allocated one.
 */
async function reconcileLandLeaseAllocations(
  ctx: PeriodWriteContext,
  headerId: string,
  wanted: readonly string[] | undefined,
): Promise<void> {
  if (wanted === undefined) return;
  const rows = await fetchAll(
    "list Land Lease WTG allocations to reconcile",
    (o) => Vsb_landleaseallocationwtgsService.getAll(o),
    {
      select: [
        "vsb_landleaseallocationwtgid", "_vsb_projectcost_value",
        "_vsb_generatorinproject_value",
      ],
      filter: lookupEq("vsb_projectcost", headerId),
    },
  );
  const existing = new Map(
    rows
      .filter((r) => r._vsb_generatorinproject_value)
      .map((r) => [r._vsb_generatorinproject_value as string, r.vsb_landleaseallocationwtgid]),
  );
  const target = new Set(wanted);

  for (const generatorId of target) {
    if (existing.has(generatorId)) continue;
    unwrap(
      await Vsb_landleaseallocationwtgsService.create({
        "vsb_ProjectCost@odata.bind": bind("vsb_landleaseprojectcosts", headerId),
        "vsb_GeneratorInProject@odata.bind": bind("vsb_generatorinprojects", generatorId),
        ...(ctx.owningBusinessUnitId
          ? { "owningbusinessunit@odata.bind": bind("businessunits", ctx.owningBusinessUnitId) } : {}),
      } as never),
      "create a Land Lease WTG allocation",
    );
  }
  for (const [generatorId, rowId] of existing) {
    if (!target.has(generatorId)) await Vsb_landleaseallocationwtgsService.delete(rowId);
  }
}

export async function saveLandLeasePeriod(
  ctx: PeriodWriteContext,
  period: CostPeriod,
  isNew: boolean,
): Promise<CostPeriod> {
  const header = await resolveLandLeaseHeader(ctx, period, isNew);
  const fields = landLeasePeriodFields(period);

  // The WTG allocations belong to the CONTRACT, so they are reconciled on the same saves that own
  // the header: a create, or an edit of Period 1. A later period carries the same list only
  // because it inherited it on read, and must not write it back.
  if (isNew || (period.periodIndex ?? 1) === 1) {
    await reconcileLandLeaseAllocations(ctx, header.id, period.allocatedGeneratorIds);
  }

  if (!isNew) {
    // `vsb_period` is NOT re-written on an edit: the canvas keeps `locSelectedLandLeasePeriod
    // .Period` and only computes a new slot when `locRightPanelState = "New"`.
    unwrap(
      await Vsb_landleaseperiodsService.update(period.id, fields as never),
      "update Land Lease period",
    );
    return {
      ...period,
      contractId: header.id,
      secured: header.secured,
      allWtgAllocated: header.allWtgAllocated,
      hasOneTimePayment: header.hasOneTimePayment,
    };
  }

  const slot = nextLandLeaseSlot(await usedLandLeaseSlots(header.id), period.periodIndex);
  const created = unwrap(
    await Vsb_landleaseperiodsService.create({
      ...fields,
      vsb_period: LAND_LEASE_PERIOD_CHOICE[slot - 1] as never,
      "vsb_ProjectCost@odata.bind": bind("vsb_landleaseprojectcosts", header.id),
      ...(ctx.owningBusinessUnitId
        ? { "owningbusinessunit@odata.bind": bind("businessunits", ctx.owningBusinessUnitId) } : {}),
    } as never),
    "create Land Lease period",
  );
  return {
    ...period,
    id: created.vsb_landleaseperiodid,
    contractId: header.id,
    periodIndex: slot,
    secured: header.secured,
    allWtgAllocated: header.allWtgAllocated,
    hasOneTimePayment: header.hasOneTimePayment,
  };
}

/**
 * Deletes one Land Lease period — or, on Period 1, the whole contract.
 *
 * `LandLeaseCostScreenCode.txt:360-384` routes the Delete command on the slot, and the two
 * confirmations do different things:
 *
 *   slot 1     `:6076-6087` — "Delete Land Lease?": `RemoveIf('Land Lease Allocation WTGS', …)`,
 *              then `RemoveIf('Land Lease Periods', …)`, then `RemoveIf('Land Lease Project
 *              Costs', …)`. The WTG allocations FIRST — they are the rows `docs/01-BUGS-FOUND.md`
 *              S-5 records as the ones that get missed, and a stranded allocation points at a
 *              header that no longer exists.
 *   slot 2..9  `:6041` — `Remove('Land Lease Periods', period)`, and nothing else.
 *
 * NO RENUMBERING, deliberately: the canvas does not renumber either, and `nextLandLeaseSlot`
 * fills the gap the next time a period is added, so the nine slots never run short. Renumbering
 * would rewrite `vsb_period` on rows the user did not touch.
 */
export async function deleteLandLeasePeriod(period: CostPeriod): Promise<void> {
  const headerId = period.contractId;
  if (!headerId || (period.periodIndex ?? 1) !== 1) {
    await Vsb_landleaseperiodsService.delete(period.id);
    return;
  }

  const [allocations, periods] = await Promise.all([
    fetchAll(
      "list Land Lease WTG allocations to delete",
      (o) => Vsb_landleaseallocationwtgsService.getAll(o),
      {
        select: ["vsb_landleaseallocationwtgid"],
        filter: lookupEq("vsb_projectcost", headerId),
      },
    ),
    fetchAll(
      "list Land Lease periods to delete",
      (o) => Vsb_landleaseperiodsService.getAll(o),
      { select: ["vsb_landleaseperiodid"], filter: lookupEq("vsb_projectcost", headerId) },
    ),
  ]);

  for (const a of allocations) {
    await Vsb_landleaseallocationwtgsService.delete(a.vsb_landleaseallocationwtgid);
  }
  for (const p of periods) await Vsb_landleaseperiodsService.delete(p.vsb_landleaseperiodid);
  await Vsb_landleaseprojectcostsService.delete(headerId);
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
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * The assumption's inflation percentage, by the canvas' three-way `Switch`.
 *
 * `OpexCostScreenCode.txt:719-735` (and the identical block on the Land Lease screen):
 * inflation + country inflation -> the COUNTRY's profile for COD year + 1; inflation alone ->
 * the assumption's own `Inflation Profile`; neither -> blank.
 */
function assumptionInflation(a: AssumptionRow, countryPercent: number | undefined): number {
  if (a.vsb_useinflationprofile !== true) return 0;
  if (a.vsb_usecountryinflationprofile === true) return countryPercent ?? 0;
  return a.vsb_inflationprofile ?? 0;
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
  return args.mode === "land"
    ? addLandLeaseStandardContract(ctx, args)
    : addOpexStandardContract(ctx, args);
}

async function addOpexStandardContract(
  ctx: PeriodWriteContext,
  args: StandardContractArgs,
): Promise<CostPeriod[]> {
  const mode = args.mode as "om" | "other";
  const target = await resolveOpexGroupTarget(ctx.projectId, mode, args.group);

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

  const out: CostPeriod[] = [];
  let headId: string | undefined;
  let startDate = args.codDate;

  for (const a of assumptions) {
    const isFirst = Number(a.vsb_period ?? ASSUMPTION_PERIOD_1) === ASSUMPTION_PERIOD_1;
    if (isFirst && headId) break; // a second Period-1 row is a second contract; one per press.
    if (!isFirst && !headId) continue; // a chain with no head is not one this command can seed.
    const previous = out[out.length - 1];
    if (!isFirst && previous) {
      startDate = addMonths(previous.startDate, previous.years * 12 + previous.months);
    }

    const description = (a.vsb_description ?? "").trim();
    const period: CostPeriod = {
      id: "",
      group: args.group,
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
      inflationYear: new Date(`${args.codDate}T12:00:00`).getFullYear() + 1,
      inflationPercent: assumptionInflation(a, args.countryInflationPercent),
      inflationCountryArea: a.vsb_inflationcountryarea ?? "",
      threshold: a.vsb_threshold === true,
      // `'Threshold Type': StandardAssumptionContractRecord.'Threshold Type'` and
      // `'Threshold individual': …'Threshold Individual'` (`:702-703`) — the assumption's own,
      // which `opexFields` now writes straight through.
      thresholdType: a.vsb_threshold === true
        ? (numberOfOption(a.vsb_thresholdtype) ?? THRESHOLD_TYPE_INDIVIDUAL) : undefined,
      thresholdIndividual: a.vsb_threshold === true ? money(a.vsb_thresholdindividual) : null,
      align: a.vsb_alignwithprojectduration === true,
      external: a.vsb_externalcontract === true,
      standard: true,
      isStartDateStandard: true,
      parentId: headId,
    };

    const created = unwrap(
      await Vsb_opexprojectcostsService.create({
        // The assumption's own threshold type and individual value ride on the period and are
        // written by `opexFields`, so there is no longer a second, overriding copy here.
        ...opexFields(period, target, a._vsb_currency_value),
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
    if (!headId) headId = id;
    out.push({
      ...period,
      id,
      contractId: headId,
      contractName: out[0]?.description ?? description,
      periodIndex: out.length + 1,
    });
  }
  return out;
}

async function addLandLeaseStandardContract(
  ctx: PeriodWriteContext,
  args: StandardContractArgs,
): Promise<CostPeriod[]> {
  const subaccount = await resolveLandLeaseSubaccount(args.group);

  const existing = await fetchAll(
    "check for an existing Land Lease standard contract",
    (o) => Vsb_landleaseprojectcostsService.getAll(o),
    {
      select: ["vsb_landleaseprojectcostid"],
      filter: and(
        lookupEq("vsb_project", ctx.projectId),
        eq("vsb_isstandardcontract", true),
        lookupEq("vsb_subaccount", subaccount.id),
        ACTIVE,
      ),
    },
  );
  if (existing.length > 0) {
    throw new Error(`"${args.group}" already has a standard contract.`);
  }

  const assumptions = await loadAssumptions(
    CONTRACT_TYPE.land, args, "vsb_landleasesubaccount", subaccount.id,
  );
  const first = assumptions[0];
  if (!first) {
    throw new Error(`No standard assumptions are configured for "${args.group}".`);
  }

  const codYear = new Date(`${args.codDate}T12:00:00`).getFullYear() + 1;
  const header = unwrap(
    await Vsb_landleaseprojectcostsService.create({
      vsb_name: [ctx.projectName, subaccount.name, first.vsb_name ?? first.vsb_description ?? ""]
        .filter(Boolean).join("-"),
      vsb_description: (first.vsb_description ?? "").trim(),
      vsb_secured: first.vsb_secured === true ? LAND_LEASE_SECURED.yes : LAND_LEASE_SECURED.no,
      vsb_allwtgallocated: first.vsb_allwtgallocated === true,
      vsb_isstandardcontract: true,
      vsb_isstartdatestandardassumption: true,
      vsb_useinflationprofile: first.vsb_useinflationprofile === true,
      vsb_usecountryinflationprofile: first.vsb_usecountryinflationprofile === true,
      vsb_inflationprofile: assumptionInflation(first, args.countryInflationPercent) || null,
      vsb_inflationstartyear: codYear,
      vsb_inflationcountryarea: first.vsb_inflationcountryarea ?? null,
      // The three one-time payments come straight off the assumption (`:388`).
      vsb_amountonetimepayment: first.vsb_amountonetimepayment ?? null,
      vsb_amountonetimepayment2: first.vsb_amountonetimepayment2 ?? null,
      vsb_amountonetimepayment3: first.vsb_amountonetimepayment3 ?? null,
      vsb_duedateonetimepayment: first.vsb_duedateonetimepayment ?? null,
      vsb_duedateonetimepayment2: first.vsb_duedateonetimepayment2 ?? null,
      vsb_duedateonetimepayment3: first.vsb_duedateonetimepayment3 ?? null,
      "vsb_Project@odata.bind": bind("vsb_projects", ctx.projectId),
      "vsb_Subaccount@odata.bind": bind("vsb_landleasesubaccounts", subaccount.id),
      ...(first._vsb_currency_value
        ? { "vsb_Currency@odata.bind": bind("transactioncurrencies", first._vsb_currency_value) }
        : {}),
      ...(ctx.owningBusinessUnitId
        ? { "owningbusinessunit@odata.bind": bind("businessunits", ctx.owningBusinessUnitId) } : {}),
    } as never),
    "create a standard Land Lease contract",
  );
  const headerId = header.vsb_landleaseprojectcostid;

  const out: CostPeriod[] = [];
  let startDate = args.codDate;
  for (const [i, a] of assumptions.slice(0, LAND_LEASE_PERIOD_CHOICE.length).entries()) {
    const previous = out[out.length - 1];
    if (previous) {
      startDate = addMonths(previous.startDate, previous.years * 12 + previous.months);
    }
    const period: CostPeriod = {
      id: "",
      group: args.group,
      mode: "land",
      description: (a.vsb_description ?? "").trim(),
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
      inflation: first.vsb_useinflationprofile === true,
      countryInflation: first.vsb_usecountryinflationprofile === true,
      inflationYear: codYear,
      inflationPercent: assumptionInflation(first, args.countryInflationPercent),
      inflationCountryArea: first.vsb_inflationcountryarea ?? "",
      threshold: false,
      align: false,
      external: false,
      standard: true,
      isStartDateStandard: true,
      secured: first.vsb_secured === true,
      allWtgAllocated: first.vsb_allwtgallocated === true,
      hasOneTimePayment:
        first.vsb_duedateonetimepayment != null && first.vsb_amountonetimepayment != null,
      // The three one-time payments the header create above took off the assumption (`:388`),
      // carried back so the returned period reports what was actually stored.
      landOwner: null,
      amountOneTimePayment: money(first.vsb_amountonetimepayment),
      amountOneTimePayment2: money(first.vsb_amountonetimepayment2),
      amountOneTimePayment3: money(first.vsb_amountonetimepayment3),
      dueDateOneTimePayment: first.vsb_duedateonetimepayment ?? null,
      dueDateOneTimePayment2: first.vsb_duedateonetimepayment2 ?? null,
      dueDateOneTimePayment3: first.vsb_duedateonetimepayment3 ?? null,
    };
    const created = unwrap(
      await Vsb_landleaseperiodsService.create({
        ...landLeasePeriodFields(period),
        vsb_period: LAND_LEASE_PERIOD_CHOICE[i] as never,
        "vsb_ProjectCost@odata.bind": bind("vsb_landleaseprojectcosts", headerId),
        ...(ctx.owningBusinessUnitId
          ? { "owningbusinessunit@odata.bind": bind("businessunits", ctx.owningBusinessUnitId) } : {}),
      } as never),
      "create a standard Land Lease period",
    );
    out.push({
      ...period,
      id: created.vsb_landleaseperiodid,
      contractId: headerId,
      contractName: (first.vsb_description ?? "").trim(),
      periodIndex: i + 1,
    });
  }
  return out;
}

/* ══════════════════════════════════════════════════════════════════════ dispatch ══ */

export async function savePeriod(
  ctx: PeriodWriteContext,
  period: CostPeriod,
  isNew: boolean,
): Promise<CostPeriod> {
  return period.mode === "land"
    ? saveLandLeasePeriod(ctx, period, isNew)
    : saveOpexPeriod(ctx, period, isNew);
}

export async function deletePeriod(period: CostPeriod): Promise<void> {
  if (period.mode === "land") {
    await deleteLandLeasePeriod(period);
    return;
  }
  await deleteOpexPeriod(period);
}
