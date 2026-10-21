/**
 * DEVEX/CAPEX — the Add/Edit Costs panel and the year toolbar, as pure functions.
 *
 * `./rules.ts` is the screen's main rule set and already carries everything the SAVE path
 * needs. What lives here is the presentation-layer arithmetic the panel rebuild needed and
 * that `rules.ts` had no equivalent for: the cluster-checkbox gate, the two label formats the
 * year gallery uses, the `MM/YYYY` boundary the canvas' date boxes sit on, and the two year
 * defaults the stepper is built from.
 *
 * Same convention as everywhere else in this feature — `Screen.tsx` is composition only, so
 * none of this may be inlined there.
 */
import { round } from "@/domain/numeric";
import type { CostLine, Payment } from "../costing/model";

/* ═════════════════════════════════════════════ cluster checkboxes (G12) ══ */

/**
 * `chk_AddContract_RightPanel_SelectClusterN_1`.
 *
 * `CapexScreenCode.txt:10930-10945`, transcribed:
 *
 *     Checked:     =Coalesce(locClusterRecord.ClusterN, false) &&
 *                   Coalesce(locProjectStartClusterNo, 0) <= N
 *     DisplayMode: =If(Coalesce(locProjectStartClusterNo, 0) <= N,
 *                      DisplayMode.Edit, DisplayMode.Disabled)
 *
 * The gate is on BOTH properties, not just the display mode: a cluster the project has
 * already passed reads back UNTICKED even when the stored JSON says otherwise, which is
 * exactly what `byClusterJson` relies on when it re-serialises (`rules.ts`, "a cluster that
 * is ticked but DISABLED serialises as `false`").
 */
export function clusterCheckboxState(
  clusterNo: number,
  startClusterNo: number | undefined,
  stored: boolean,
): { checked: boolean; enabled: boolean } {
  const floor = startClusterNo ?? 0;
  const enabled = floor <= clusterNo;
  return { checked: stored && enabled, enabled };
}

/**
 * The clusters that survive the gate — what the panel may actually save.
 *
 * A contract opened on a project that has since moved past cluster 2 must not silently keep
 * writing money into clusters 1 and 2 just because they were ticked when it was created.
 */
export const enabledClusters = (
  clusters: readonly number[],
  startClusterNo: number | undefined,
): number[] => clusters.filter((n) => (startClusterNo ?? 0) <= n);

/* ═══════════════════════════════════════════════════ year gallery labels ══ */

/**
 * `lbl_..._AllocatedCost.Text` — `Capex Costs Screen.pa.yaml:13211-13226`:
 *
 *     $"Allocated Cost: {If(
 *         scheme = 'Distribution Scheme'.'% Values',
 *         Round(ThisItem.TotalUI, 1) & " %",
 *         Round(ThisItem.TotalSave, 0) & " " &
 *             Coalesce(gblRecordSelectedProjectCountry.'ISO Currency Code', "EUR")
 *     )}"
 *
 * Note which total each branch reads: the percent branch shows the raw figures the user typed
 * (`TotalUI`), the money branch shows the resolved ones (`TotalSave`). They are different
 * numbers for an individual/percent contract, which is the whole reason the canvas keeps two.
 */
export function allocatedCostLabel(
  value: number,
  scheme: "percent" | "absolute",
  isoCurrencyCode: string,
): string {
  return scheme === "percent"
    ? `Allocated Cost: ${round(value, 1)} %`
    : `Allocated Cost: ${round(value, 0)} ${isoCurrencyCode}`;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * `lbl_..._BodyContent_Month..._Label.Text` — `="January "&ThisItem.Year`
 * (`Capex Costs Screen.pa.yaml:13652`). Full month name AND year on every row, not `Jan`.
 */
export function monthYearLabel(month: number, year: number): string {
  const name = MONTH_NAMES[month - 1];
  return name === undefined ? String(year) : `${name} ${year}`;
}

/* ══════════════════════════════════════════════ MM/YYYY date boxes (G17) ══ */

const ISO_MONTH = /^(\d{4})-(0[1-9]|1[0-2])(?:-\d{2})?$/;
const MONTH_YEAR = /^(0[1-9]|1[0-2])\/(\d{4})$/;

/**
 * What the panel's Start/End boxes DISPLAY.
 *
 * The canvas controls are `TextInput`s with `Placeholder: "MM/YYYY"`
 * (`CapexScreenCode.txt:11420-11445`), never date pickers — there is no day component
 * anywhere in this feature. `CostLine.startDate` is still carried as `YYYY-MM-01` because
 * that is what `equalPayments`/`startEndJson` in `rules.ts` consume, so the conversion
 * happens at the control boundary and nowhere else.
 */
export function isoToMonthYear(iso: string | undefined | null): string {
  const value = (iso ?? "").trim();
  if (value === "") return "";
  if (MONTH_YEAR.test(value)) return value;
  const m = ISO_MONTH.exec(value);
  return m ? `${m[2]}/${m[1]}` : "";
}

/** The inverse — anything that is not a complete `MM/YYYY` yields `""`, i.e. "no date yet". */
export function monthYearToIso(value: string | undefined | null): string {
  const m = MONTH_YEAR.exec((value ?? "").trim());
  return m ? `${m[2]}-${m[1]}-01` : "";
}

/* ══════════════════════════════════════════════════ year navigation (G19/G20) ══ */

const firstUsable = (...years: (number | null | undefined)[]): number | undefined =>
  years.find((y): y is number => typeof y === "number" && Number.isFinite(y));

/**
 * `gblSelectedProjectYear`'s default — `CapexScreenCode.txt:230-249`:
 *
 *     varDefaultYear: Coalesce(gblSelectedProjectYear, locCostAllowedStartYear,
 *                              locNavigationMinYear, Year(Today()))
 *     Set(gblSelectedProjectYear, Min(Max(varDefaultYear, locNavigationMinYear),
 *                                     locNavigationMaxYear))
 *
 * Defaulting to `Year(Today())` alone — which is what the screen did — opens a 2015-2019
 * project on a year it has no periods for at all, so the grid comes up empty and the user has
 * to step back four times to find their own costs.
 */
export function defaultSelectedYear(args: {
  selectedYear: number | null;
  costAllowedStartYear?: number;
  navigationMinYear?: number;
  navigationMaxYear?: number;
  today?: Date;
}): number {
  const today = args.today ?? new Date();
  const preferred = firstUsable(
    args.selectedYear,
    args.costAllowedStartYear,
    args.navigationMinYear,
    today.getFullYear(),
  ) as number;
  const min = firstUsable(args.navigationMinYear, preferred) as number;
  const max = firstUsable(args.navigationMaxYear, preferred) as number;
  return Math.min(Math.max(preferred, min), Math.max(min, max));
}

/**
 * The floor the ◀ button stops at — `CapexScreenCode.txt:2833-2845`:
 *
 *     varMinSelectableYear: Coalesce(locCostAllowedStartYear,
 *                                    Min(colProjectPeriods, Year), Year(Today()))
 *
 * DELIBERATELY not the same as the dropdown's minimum. `colProjectPeriods` spans every year
 * the project touches, but a cost may not be booked before `locCostAllowedStartYear`, so the
 * stepper stops earlier than the list does. Using the navigation minimum for both let users
 * arrow back into years the canvas app refuses to open.
 */
export function previousYearFloor(args: {
  costAllowedStartYear?: number;
  navigationMinYear?: number;
  today?: Date;
}): number {
  const today = args.today ?? new Date();
  return firstUsable(
    args.costAllowedStartYear,
    args.navigationMinYear,
    today.getFullYear(),
  ) as number;
}

/* ═════════════════════════════════════════════════════ spinner text (G21) ══ */

/** `locSpinnerInformationText` — `CapexScreenCode.txt:2434`. */
export const LOADING_COST = "Please wait, loading cost ...";

/**
 * What the save spinner says — and it is NOT one string.
 *
 * The Save button's `OnSelect` (`CapexScreenCode.txt:17413`) is one `If` on the distribution
 * type with two entirely separate bodies, and each sets its own `locSpinnerInformationText`
 * before closing the panel:
 *
 *     // Individual Distribution branch (extracted OnSelect, lines 717-721)
 *     UpdateContext({ locIsVisiblePopUpSpinner: true,
 *                     locSpinnerInformationText: "Please wait, saving the cost...",
 *                     locIsVisibleRightPanelAddContract: false, ... })
 *
 *     // Equal Distribution branch (extracted OnSelect, lines 1487-1493)
 *     UpdateContext({ locIsVisiblePopUpSpinner: true,
 *                     locSpinnerInformationText: "Please wait, saving costs...",
 *                     locIsVisibleRightPanelAddContract: false })
 *
 * Singular for the individual distribution, plural for the equal one. The client's reference
 * shot (`Cost App - Loading Spinner Design - Panel Closes and Spinner is shown..png`) is of an
 * individual contract, which is why it reads "the cost".
 *
 * Note `locIsVisibleRightPanelAddContract: false` in BOTH: the panel is dismissed in the same
 * update that raises the spinner, so the spinner is never drawn over an open panel. See
 * `Screen.tsx`'s `persist()`.
 */
export const SAVING_COST = "Please wait, saving the cost...";
export const SAVING_COSTS = "Please wait, saving costs...";

export const savingCostLabel = (distribution: CostLine["distribution"]): string =>
  distribution === "individual" ? SAVING_COST : SAVING_COSTS;

/** `CapexScreenCode.txt:18052` — what the Summary tab shows before its totals land. */
export const LOADING_DATA = "Please wait, loading data...";

/**
 * `$"Please wait, loading standard contract : '{varStandardContractAssumption.Description}'
 * ..."` — `CapexScreenCode.txt:18076`. Creating a standard contract is two round trips here
 * (the contract row, then its months), so the user is told which one is running.
 */
export const standardContractLoadingLabel = (description: string): string =>
  `Please wait, loading standard contract : '${description}' ...`;

/* ══════════════════════════════════════════════════════ paid toggle (G11) ══ */

/** `cmp_PopUp_Confirmation_For_SetasPaidUnpaidCostConfirmation` — `CapexScreenCode.txt:19833`. */
export const PAID_CONFIRM_TITLE = "Cluster-linked Costs";
export const PAID_CONFIRM_DESCRIPTION =
  "Setting the cluster-linked cost to ‘Paid’ will remove the cluster link for all "
  + "costs in the contract. Do you want to proceed?";

/* ══════════════════════════════════════════ the relink confirmation's chrome ══ */

/**
 * `WidthConfirmButton` on `cmp_PopUp_Confirmation_For_SetClusterLinkingConfirmationPopup`
 * (`CapexScreenCode.txt:19971-19980`):
 *
 *     =If(locCostPaidByChanged && locClusterLinkageChanged
 *         && CountRows(colOtherClusterHavingCost) > 0
 *         && !IsBlank(drp_…_Link_to_Cluster.Selected.Name)
 *         && drp_…_Link_to_Cluster.Selected.Name <> "None",
 *         120, 96)
 *
 * That predicate is character-for-character the one `TextConfirmButton` uses (`:19929-19935`)
 * to choose between "Confirm All" and "Confirm", so the width is a function of the label and
 * needs no second copy of the conditions. 96 is the component default (`WidthConfirmButton`
 * `Default: =96`) and the width the Cancel button is hard-coded to.
 */
export const CONFIRM_BUTTON_WIDTH = 96;
export const confirmButtonWidth = (confirmLabel: string): number =>
  (confirmLabel === "Confirm All" ? 120 : CONFIRM_BUTTON_WIDTH);

/* ═══════════════════════════════════ Recalculate Allocated Cost (footer) ══ */

/**
 * `btn_Right_Panel_Add_Contract_Calculate_Allocated_Cost.Visible`
 * (`CapexScreenCode.txt:17992`):
 *
 *     =rad_AddContract_RightPanel_DistributionType_1.Selected.Value
 *          = 'Distribution Type'.'Individual Distribution'
 *
 * An equal distribution computes its months from the total, the clusters/dates and the
 * frequency, so there is nothing for the user to recalculate — the button is simply absent.
 */
export const recalculateVisible = (line: CostLine | null): boolean =>
  line?.distribution === "individual";

/**
 * `Text: ="Recalculate Allocated Cost "` — `CapexScreenCode.txt:17991`. The canvas string has
 * a trailing space; this does not, because it is centred in a fixed 220 px button either way
 * and the space would only show up in the accessible name.
 */
export const RECALCULATE_ALLOCATED_COST = "Recalculate Allocated Cost";

/**
 * …and its `DisplayMode` (`CapexScreenCode.txt:17541-17555`):
 *
 *     =If(And(Or(Not(IsBlank(Value(txt_AddContract_RightPanel_TotalCost_1.Value))),
 *                And(DistributionType = 'Individual Distribution',
 *                    DistributionScheme = 'Absolute Values')),
 *             locEditSaveButtonEnabled),
 *         DisplayMode.Edit, DisplayMode.Disabled)
 *
 * `locEditSaveButtonEnabled` is the canvas' dirty flag, and it is the SAME final clause the
 * Save button's own `DisplayMode` ends on (`:17387`) — so `saveEnabled` here is this app's
 * Save gate (`canSaveContract` + the inline validators), which plays that role.
 *
 * The `Or` matters: an absolute individual distribution needs no total at all, because its
 * money is typed month by month, so it may be recalculated with the Total Costs box empty.
 */
export function recalculateEnabled(args: {
  line: CostLine | null;
  costValue: string;
  saveEnabled: boolean;
}): boolean {
  if (!args.line) return false;
  const hasTotal = Number.isFinite(Number(args.costValue)) && args.costValue.trim() !== "";
  const absoluteIndividual =
    args.line.distribution === "individual" && args.line.distributionScheme === "absolute";
  return (hasTotal || absoluteIndividual) && args.saveEnabled;
}

/**
 * What pressing it DOES — `colNewEditPanelCostProcessed` (`CapexScreenCode.txt:17558-17990`).
 *
 * The canvas button walks `gal_IndividualCost_Items_1.AllItems`, reads the twelve month text
 * boxes of every year row and rebuilds the gallery's backing collection from them:
 *
 *     JanUIv: If(IsBlank(G.txt_…_FirstMonth_24.Value) || !IsNumeric(G.txt_…_FirstMonth_24.Value),
 *                Blank(), Value(G.txt_…_FirstMonth_24.Value))          // :17624-17630
 *     JanSv:  If(IsBlank(JanUIv), Blank(),
 *                If(isPctScheme && totalCostForPct <> 0,
 *                   Round(totalCostForPct * JanUIv / 100, 0),
 *                   Round(JanUIv, 0)))                                  // :17664-17677
 *     TotalUI: Sum(Coalesce(JanUIv, 0), …)   TotalSave: Sum(Coalesce(JanSv, 0), …)
 *     ClearCollect(colNewEditPanelCost, colNewEditPanelCostProcessed)   // :17987-17990
 *
 * It is a SANITISE-AND-ROUND pass, not a redistribution: nothing moves between months. Two
 * things actually change, and this reproduces both:
 *
 *   - a month whose box is empty or not a number becomes `Blank()`, i.e. it stops being a row
 *     at all (`reconcilePayments` then emits the delete for it);
 *   - for an ABSOLUTE scheme the kept months are `Round(·, 0)` — whole currency units.
 *
 * A PERCENT scheme's months are deliberately left alone: the canvas stores the typed figure
 * raw in `JanUI` and rounds only the `JanSv` mirror, which `resolvedPayments` in `rules.ts`
 * already computes on every render. Rounding the percentages here would change what the user
 * sees in the boxes, which the canvas does not do.
 *
 * `TotalUI`/`TotalSave` are the two numbers the `Allocated Cost:` labels read, and this app
 * derives them per render from the same payments — so re-deriving them is the assignment.
 */
export function recalculatedPayments(
  payments: readonly Payment[],
  distributionScheme: CostLine["distributionScheme"],
): Payment[] {
  return payments
    .filter((p) => Number.isFinite(p.amount))
    .map((p) => (distributionScheme === "absolute"
      ? { ...p, amount: Math.round(p.amount) }
      : { ...p }));
}

/* ═══════════════════════════════════ Distribution / Distribution Scheme ══ */

/**
 * Both radio groups go read-only once the panel is opened on an EXISTING contract —
 * `rad_AddContract_RightPanel_DistributionType_1.DisplayMode` (`CapexScreenCode.txt:10445`)
 * and `rad_AddContract_RightPanel_DistributionScheme_1.DisplayMode` (`:10585`), which are the
 * same expression:
 *
 *     =If(Not(locSelectedCostRow.IsContract), DisplayMode.Edit, DisplayMode.View)
 *
 * They are the only two. `rad_AddContract_RightPanel_DistributionBy_1` (our "Equal
 * Distribution") carries the identical formula COMMENTED OUT followed by a bare
 * `DisplayMode.Edit` (`:10697`), so By Cluster / By Start and End Date stays editable; and
 * Link to Milestone, Cost Paid By, Apply VAT and Depreciation set no `DisplayMode` at all.
 *
 * Changing a stored contract's distribution would strand its existing `CAPEX Costs` rows under
 * a schedule that can no longer regenerate them, which is why the canvas locks it.
 */
export const distributionLocked = (isExistingContract: boolean): boolean => isExistingContract;
