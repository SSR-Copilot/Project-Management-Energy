/**
 * Admin Cost Screen — the shared rules: scope, the four categories, the Apply audit trail
 * and the dead Fabric path. The two cost families live in `opexRules.ts` and
 * `devexRules.ts`; both are re-exported at the bottom so callers have one import point.
 *
 * Canvas screen: `Admin Cost Screen` (PM app)
 *   352 controls · 9 286 lines of Power Fx · 117 substantive blocks · band XL
 *
 * The largest screen in the solution and the master-data source for the Project Costs app.
 * One country × technology picker fixes the scope; a four-row accordion (DEVEX/CAPEX,
 * Operation & Maintenance, Land Lease, Other OPEX Costs) each expands into a different
 * editor.
 *
 * ┌────────────────────────────────────────────────────────────────────────────────┐
 * │ SOURCE DEFECT — NO SCREEN-LEVEL OR SERVER-SIDE PERMISSION CHECK.               │
 * │                                                                                │
 * │ The ONE `DataSourceInfo` on 9 286 lines gates the DEVEX/CAPEX "Add Cost"        │
 * │ button. The OPEX/Land Lease family has NO privilege check at all — any of its   │
 * │ actions is available to anyone who reaches the screen. `OnVisible` never        │
 * │ evaluates `gblCurrentUser`; entry is gated only by                              │
 * │     ItemVisible: Or(gblCurrentUser.IsApplicationAdministrator,                  │
 * │                     gblCurrentUser.IsControllerOwnData)                         │
 * │ on the nav items — CLIENT-SIDE HIDING ONLY.                                     │
 * │                                                                                │
 * │ Worse, the row-level checks that DO exist FAIL OPEN: the DEVEX/CAPEX row Edit   │
 * │ and Delete wrap `RecordInfo(LookUp(…), …)` in an `IsBlank(...)` short-circuit   │
 * │ that yields `DisplayMode.Edit` when the lookup misses. See `rowActionEnabled`   │
 * │ in devexRules.ts, which closes it.                                              │
 * │                                                                                │
 * │ WHAT WE DID: `RequireAdmin` guards the route; `canEditScope` gates every write  │
 * │ plan on `canEditCountry`; a privilege gate was ADDED to the OPEX family, which  │
 * │ is a deliberate TIGHTENING over the shipped app. THE ROUTE GUARD IS NOT         │
 * │ SECURITY — the server must reject writes to                                     │
 * │ `vsb_devexcapexstandardassumptionses` and                                       │
 * │ `vsb_opexlandleasestandardassumptionses`, and today it does not.                │
 * └────────────────────────────────────────────────────────────────────────────────┘
 *
 * COUNTRY SCOPING IS HARD-CODED PICKER LITERALS. `gblCurrentUser.EditableCounties` is
 * never read. `cmp_NestedCountryPickerColumn` is fed
 * `Filter(col_cmpCountryPickerItems, !(Name in ["Spain","Greece","Romania"]))` and a
 * technology nesting of Wind and PV ONLY, so BESS, Hydro and Substation standard costs
 * cannot be authored even though every save `Switch` handles them. Row security is
 * anchored by `'Owning Business Unit'` written on save.
 *
 * DEAD CODE, REPRODUCED AS DEAD — do not switch it on silently:
 *  - Both `Patch('Fabric Sync Jobs', …)` blocks (lines 417 and 4619) are inside
 *    `/* … *\/` comments, together with the `SynchronizeStandardAssumptionCosts.Run(...)`
 *    that follows each and its `Notify`.
 *  - `btn_Admin_Cost_Landlease_ApplyToLandlease` and the Apply-to-All button both ship
 *    `DisplayMode: =DisplayMode.Disabled`. As shipped, NO Apply can be triggered.
 *  - `SynchronizeStandardAssumptionCosts` IS NOT IN THE SOLUTION EXPORT.
 *    `@/flows/flowClient` exports a typed wrapper that throws; the disabled commands call
 *    it so the intent is in the code and its internals are never invented.
 *  - AND YET `Apply and Apply All Trackings` ROWS ARE STILL WRITTEN. The audit row records
 *    a recalculation that never runs, and the "last applied" badges read those rows back.
 *    See `planApplyTracking`, which reproduces the write behind an explicit flag and
 *    explains why the code app should not do it.
 *
 * GUIDE p24 — one screenshot in the step-by-step guide shows the LEFT ADMIN RAIL'S
 * "Contracts" item highlighted while the page title and breadcrumb both still read "Costs"
 * / ".../Costs/...", with a new "DEVEX/CAPEX" wrapper header and every CAPEX group
 * collapsed. Recorded here as a transitional/loading state the guide happened to catch
 * mid-navigation, NOT a distinct "Contracts" view — this screen does not attempt to model a
 * Contracts screen, and the "DEVEX/CAPEX" wrapper it does show is just this screen's own
 * `COST_CATEGORIES[0]` accordion header, already present below.
 */
import { ES_ADMIN, CHOICE_ADMIN, CHOICE_PRODUCTION } from "@/data/entities";
import { canEditCountry, type CurrentUser } from "@/domain/session";
import { emptyPlan, type WritePlan } from "./plan";
import {
  COUNTRY_PICKER_ORDER, COST_CONTRACT_EXCLUDED_COUNTRIES, PICKER_TECHNOLOGIES,
  buildCountryPicker, technologyValue, technologyLabel,
} from "@/features/admin/admin-gates-approvals/rules";

export {
  COUNTRY_PICKER_ORDER, COST_CONTRACT_EXCLUDED_COUNTRIES, PICKER_TECHNOLOGIES,
  buildCountryPicker, technologyValue, technologyLabel,
};

export * from "./plan";
export * from "./opexRules";
export * from "./devexRules";

/* ═══════════════════════════════════════════════════════════════ the four rows ════ */

export interface CostCategoryRow {
  /** The accordion label, verbatim from `colAdminCostCategories`. */
  category: string;
  /** `TypeOfCategory` — the `'Contract Types'` option-set value. */
  typeOfCategory: number;
  family: "devex" | "opex" | "landLease";
}

/**
 * Rule 1 — `colAdminCostCategories` is a HARD-CODED FOUR-ROW TABLE built in `OnVisible`,
 * in this order. The order is the render order, so it is data, not styling.
 */
export const COST_CATEGORIES: readonly CostCategoryRow[] = [
  {
    /**
     * `Admin Cost Screen.OnVisible.Category` — verbatim (the canvas literal lives in that
     * formula’s record field).
     */
    category: "DEVEX/CAPEX",
    typeOfCategory: CHOICE_ADMIN.contractTypes.devexCapex,
    family: "devex",
  },
  {
    /**
     * `Admin Cost Screen.OnVisible.Category` — verbatim (the canvas literal lives in that
     * formula’s record field).
     */
    category: "Operation & Maintenance",
    typeOfCategory: CHOICE_ADMIN.contractTypes.opexOandM,
    family: "opex",
  },
  {
    /**
     * `Admin Cost Screen.OnVisible.Category` — verbatim (the canvas literal lives in that
     * formula’s record field).
     */
    category: "Land Lease",
    typeOfCategory: CHOICE_ADMIN.contractTypes.landlease,
    family: "landLease",
  },
  {
    /**
     * `Admin Cost Screen.OnVisible.Category` — verbatim (the canvas literal lives in that
     * formula’s record field).
     */
    category: "Other OPEX Costs",
    typeOfCategory: CHOICE_ADMIN.contractTypes.opexOther,
    family: "opex",
  },
];

/** `Not(ThisItem.TypeOfCategory = 'Contract Types'.'DEVEX/CAPEX')` — the Add-Contract menu. */
export const showAddContractType = (row: CostCategoryRow): boolean => row.family !== "devex";

/** `ThisItem.TypeOfCategory = 'Contract Types'.'DEVEX/CAPEX'` — the Add-Cost button. */
export const showAddCost = (row: CostCategoryRow): boolean => row.family === "devex";

/* ═════════════════════════════════════════════════════════════════════ scope ════ */

export interface CostScope {
  countryId: string | null;
  countryName: string | null;
  technology: string | null;
  technologyValue: number | null;
}

export const emptyScope = (): CostScope => ({
  countryId: null, countryName: null, technology: null, technologyValue: null,
});

/** Country scope, applied here and absent from the canvas. */
export function canEditScope(user: CurrentUser | null, scope: CostScope): boolean {
  if (!user) return false;
  return canEditCountry(user, scope.countryId ?? undefined);
}

/* ═══════════════════════════════════════════════════ GUIDE p23/p24 — rail + breadcrumb ════ */

/**
 * GUIDE p23 — the middle rail here is the FLAG TREE (`CountryRail variant="tree"`), the
 * same shape Project Gates uses and deliberately different from the flat list Milestones
 * renders (p22). A leaf is one country's one technology, so the rail's own leaf key packs
 * both; `costRailLeafKey`/`parseCostRailLeafKey` are the one place that format is spelled
 * out, so the two ends of a click cannot silently drift apart.
 */
const COST_RAIL_KEY_SEPARATOR = "::";

export const costRailLeafKey = (countryId: string, technology: string): string =>
  `${countryId}${COST_RAIL_KEY_SEPARATOR}${technology}`;

export function parseCostRailLeafKey(key: string): { countryId: string; technology: string } | null {
  const i = key.indexOf(COST_RAIL_KEY_SEPARATOR);
  if (i < 0) return null;
  return { countryId: key.slice(0, i), technology: key.slice(i + COST_RAIL_KEY_SEPARATOR.length) };
}

/**
 * GUIDE p23/p24 — "Standard Assumptions / Costs / Germany / Wind", a slash breadcrumb whose
 * last two segments are blank until a country and a technology are picked. `Breadcrumb`
 * itself drops blank segments, so passing them through unfiltered is safe.
 */
export function costBreadcrumb(scope: CostScope): string[] {
  return ["Standard Assumptions", "Costs", scope.countryName ?? "", scope.technology ?? ""];
}

/**
 * GUIDE p23 — the caption repeated beside BOTH "Apply to All" and the per-category "Apply"
 * button, verbatim.
 */
export const APPLY_OVERRIDE_CAPTION =
  "Apply standard cost to relevant projects, this will override existing standard assumption cost.";

/**
 * Rule 4 — `colCapexSubaccounts` adds four derived columns and sorts by
 * `CategoryOrder, AccountOrder, vsb_order`. `AggregatedName` is a DISPLAY string, derived
 * here rather than baked into the query.
 */
export const aggregatedSubaccountName = (
  parentName: string, name: string, number: string,
): string => `${parentName} / ${name} ${number}`;

/* ═══════════════════════════════════════════════════════════ the apply tracking ════ */

export const APPLY_TRACKING_COL = {
  id: "vsb_applyandapplyalltrackingid",
  name: "vsb_name",
  country: "_vsb_country_value",
  technology: "vsb_technology",
  action: "vsb_action",
  appliedByEmail: "vsb_appliedbyemail",
  appliedByFullName: "vsb_appliedbyfullname",
  contractType: "vsb_contracttype",
  bopStandardContract: "_vsb_bopstandardcontract_value",
  modifiedOn: "modifiedon",
  modifiedBy: "_modifiedby_value",
} as const;

export const APPLY_TRACKING_LOOKUP = {
  country: "vsb_Country",
  bopStandardContract: "vsb_BoPStandardContract",
} as const;

export const APPLY_TRACKING_ENTITY_SET = ES_ADMIN.applyAndApplyAllTrackings;

export interface ApplyTrackingRow {
  id: string;
  countryId: string | null;
  technology: number | null;
  action: number | null;
  contractType: number | null;
  bopStandardContractId: string | null;
  modifiedOn: string | null;
  modifiedByName: string | null;
}

/**
 * Rule 34/35 — the audit row is an UPSERT keyed on
 * (country, technology, contract type, action), so the table records "LAST APPLIED", not
 * a history. Deleting a standard cost writes one too — see rule 37 in `devexRules.ts`.
 */
export function findLastApply(
  rows: ApplyTrackingRow[],
  scope: CostScope,
  contractType: number,
  action: number,
): ApplyTrackingRow | null {
  return rows.find((r) =>
    r.countryId === scope.countryId
    && r.technology === scope.technologyValue
    && r.contractType === contractType
    && r.action === action) ?? null;
}

/**
 * Rule 36 — the "last applied" label:
 * `$"{Text(row.'Modified On', "dd.mm.yyyy")} Apply was made by {row.'Modified By'.'Full Name'}"`
 * and the container's `Visible`/`Height` are driven by `Len(<that label>.Text) > 0`.
 */
export function lastAppliedLabel(row: ApplyTrackingRow | null): string {
  if (!row || !row.modifiedOn) return "";
  const d = new Date(row.modifiedOn);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
  return `${stamp} Apply was made by ${row.modifiedByName ?? ""}`.trimEnd();
}

export const showLastApplied = (row: ApplyTrackingRow | null): boolean =>
  lastAppliedLabel(row).length > 0;

/**
 * Rule 34 — the Apply audit row.
 *
 * `locAction: If(IsBlank(locSelectedCategory), 'Apply All', Apply)` then a `Patch` upsert
 * carrying Name, Country, Technology, `'Action?'`, `'Applied By Email'` (= `User().Email`),
 * `'Applied By Full Name'` (= `User().FullName`) and `'Contract Type'`.
 *
 * ┌──────────────────────────────────────────────────────────────────────────────┐
 * │ WE DO NOT WRITE THIS ROW FROM THE CLIENT.                                    │
 * │                                                                              │
 * │ In the shipped app the row IS written and NOTHING is recalculated, because   │
 * │ the `Fabric Sync Jobs` patch and the flow call that follow it are inside a   │
 * │ `/* … *\/` comment. The result is an audit trail of work that never          │
 * │ happened, which the "last applied" badges then present as fact.               │
 * │                                                                              │
 * │ `planApplyTracking` therefore returns the write ONLY when explicitly asked    │
 * │ (`mode: "canvasParity"`). The default, `mode: "correct"`, returns an empty    │
 * │ plan with a reason: the tracking row belongs to the custom API that actually  │
 * │ runs the recalculation, written server-side when the work completes.          │
 * └──────────────────────────────────────────────────────────────────────────────┘
 */

export const APPLY_NOT_RUN_REASON =
  "No tracking row is written: the recalculation this row would claim to record is not "
  + "enabled. SynchronizeStandardAssumptionCosts is not in the solution export and both "
  + "Apply buttons ship disabled.";

export function planApplyTracking(args: {
  scope: CostScope;
  /** `null` means Apply ALL (rule 34's `IsBlank(locSelectedCategory)`). */
  contractType: number | null;
  existing: ApplyTrackingRow | null;
  user: { mail: string; displayName: string };
  bopStandardContractId?: string | null;
  mode?: "correct" | "canvasParity";
}): WritePlan {
  if ((args.mode ?? "correct") === "correct") {
    return { writes: [], log: [APPLY_NOT_RUN_REASON], refusedReason: APPLY_NOT_RUN_REASON };
  }

  const action = args.contractType === null
    ? CHOICE_ADMIN.applyAction.applyAll
    : CHOICE_ADMIN.applyAction.apply;
  const actionText = action === CHOICE_ADMIN.applyAction.applyAll ? "Apply All" : "Apply";

  const data: Record<string, unknown> = {
    [APPLY_TRACKING_COL.name]:
      `${args.scope.countryName ?? ""} - ${args.scope.technology ?? ""} - ${actionText}`,
    [APPLY_TRACKING_COL.technology]: args.scope.technologyValue,
    [APPLY_TRACKING_COL.action]: action,
    [APPLY_TRACKING_COL.appliedByEmail]: args.user.mail,
    [APPLY_TRACKING_COL.appliedByFullName]: args.user.displayName,
    [APPLY_TRACKING_COL.contractType]: args.contractType,
  };
  if (args.scope.countryId) {
    data[`${APPLY_TRACKING_LOOKUP.country}@odata.bind`] =
      `/vsb_countries(${args.scope.countryId})`;
  }
  if (args.bopStandardContractId !== undefined) {
    // The Contract screen's extra column; blank there means "Apply All".
    data[`${APPLY_TRACKING_LOOKUP.bopStandardContract}@odata.bind`] =
      args.bopStandardContractId
        ? `/vsb_bopcontractsstandardassumptionses(${args.bopStandardContractId})`
        : null;
  }

  const plan = emptyPlan();
  plan.writes.push(
    args.existing
      ? {
          op: "update", entitySet: APPLY_TRACKING_ENTITY_SET, id: args.existing.id, data,
          reason: `${actionText} recorded (canvas parity — nothing was recalculated)`,
        }
      : {
          op: "create", entitySet: APPLY_TRACKING_ENTITY_SET, data,
          reason: `${actionText} recorded (canvas parity — nothing was recalculated)`,
        },
  );
  return plan;
}

/* ══════════════════════════════════════════════════════════════════ the Apply ════ */

export interface ApplyCommandState {
  enabled: false;
  disabledReason: string;
  confirmation: string;
}

export const APPLY_DISABLED_REASON =
  "Apply is disabled in the shipped app: both buttons carry DisplayMode.Disabled, the "
  + "Fabric Sync Job write is commented out, and SynchronizeStandardAssumptionCosts is not "
  + "present in the solution export.";

export const APPLY_CONFIRMATION =
  "Are you sure you want to apply these standard assumptions to all relevant projects? "
  + "This will override existing standard assumptions.";

/**
 * The Apply / Apply-to-All command state. `enabled` is the literal `false` in the TYPE, so
 * a later edit cannot flip it by accident: turning the feature on means changing this
 * function deliberately AND landing the custom API.
 */
export function applyCommandState(): ApplyCommandState {
  return {
    enabled: false,
    disabledReason: APPLY_DISABLED_REASON,
    confirmation: APPLY_CONFIRMATION,
  };
}

/**
 * `SynchronizeStandardAssumptionCosts`'s call signature, from the two COMMENTED call sites
 * (lines 458 and 4659):
 *
 *   SynchronizeStandardAssumptionCosts.Run(
 *       locFabricSyncCostJob.'Cost Type',       // "All" or "952850000".."952850003" AS A STRING
 *       locFabricSyncCostJob.Country.Country,   // country GUID
 *       Int(locFabricSyncCostJob.Technology),   // option-set value as an integer
 *       locFabricSyncCostJob.'Fabric Sync Job'  // job row id
 *   )
 *
 * THE FLOW IS NOT IN `sol/Workflows/`. Its internals cannot be described from these
 * sources and are NOT invented here; this function only shapes the arguments, and the
 * wrapper in `@/flows/flowClient` throws a clear "not present in the export" error.
 *
 * Two defects visible at the call site, both to be fixed in the replacement:
 *  (a) the job row is created and the flow called as TWO operations, so a failure leaves
 *      an orphan `Dirty` job;
 *  (b) `'Cost Type'` is passed as a STRING CONTAINING AN OPTION-SET NUMBER — a
 *      serialisation accident, not a contract. `costTypeWireValue` reproduces it exactly
 *      so the eventual custom API can accept the legacy shape while taking an enum.
 */
export type CostTypeArg = "All" | "Landlease" | "OpexOandM" | "OpexOther" | "DevexCapex" | "BoP";

export function costTypeWireValue(costType: CostTypeArg): string {
  switch (costType) {
    case "All": return "All";
    case "Landlease": return CHOICE_ADMIN.costTypeWireValue.landlease;
    case "OpexOandM": return CHOICE_ADMIN.costTypeWireValue.opexOandM;
    case "OpexOther": return CHOICE_ADMIN.costTypeWireValue.opexOther;
    case "DevexCapex": return CHOICE_ADMIN.costTypeWireValue.devexCapex;
    // The Contract screen passes the literal "BoP" as the first argument.
    case "BoP": return "BoP";
  }
}

export function costTypeForContractType(contractType: number | null): CostTypeArg {
  if (contractType === null) return "All";
  switch (contractType) {
    case CHOICE_ADMIN.contractTypes.landlease: return "Landlease";
    case CHOICE_ADMIN.contractTypes.opexOandM: return "OpexOandM";
    case CHOICE_ADMIN.contractTypes.opexOther: return "OpexOther";
    case CHOICE_ADMIN.contractTypes.devexCapex: return "DevexCapex";
    case CHOICE_ADMIN.contractTypes.bop: return "BoP";
    default: return "All";
  }
}

export function synchronizeArgs(args: {
  scope: CostScope;
  contractType: number | null;
}): { costType: string; countryId: string | null; technology: number | null } {
  return {
    costType: costTypeWireValue(costTypeForContractType(args.contractType)),
    countryId: args.scope.countryId,
    technology: args.scope.technologyValue,
  };
}

/** `'Job Type'` name on the (commented-out) Fabric job both Apply paths would create. */
/**
 * @labels-not-in-corpus — a `'Job Type'`.`Name` DATA value the canvas compares against when it
 * polls the Fabric sync job
 */
export const COST_JOB_TYPE_NAME = "Apply Standard Assumption for Cost";

/** Re-exported so the OPEX period grid can label the ten periods without importing twice. */
export const OPEX_PERIOD_VALUES = CHOICE_PRODUCTION.opexLandLeasePeriod;
