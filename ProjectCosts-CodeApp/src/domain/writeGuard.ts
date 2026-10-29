/**
 * The one write guard shared by the Cost screens (D58, PROPOSED; CONVENTIONS rule 17).
 *
 * DIVERGENCE (D58): the canvas blocked a second write by covering the screen with its
 * `cmp_*_PopUpLoading` pop-up (`Visible: =locIsVisiblePopUpSpinner`) and blocked the first paint
 * with its loading spinner. Both are gone, so the write-starting commands are disabled instead:
 * while the screen's data is still on its first load (there is nothing to write against yet, and
 * a draft started then would be overwritten when the rows land) and while any write is pending.
 * Read-only actions (selecting, expanding, tabs, filters) are never gated by this.
 *
 * `writeInFlight` (CA-15) is the project-wide "a Cost write is still running" flag that outlives
 * the screen which started the write (`useCostWriteInFlight`, `costWriteKey` below). The scrim
 * also covered the rail and the header, so with it no second write could start ANYWHERE while one
 * ran; a screen re-opened mid-write has a fresh mutation observer, so its own `writePending` alone
 * reads "nothing pending".
 *
 * Each screen maps the result onto its own commands locally (`guardLeaseCommands`,
 * `guardOpexCommands`, `gatedContractCommands`, `gridActionAllowed`, the comments panel).
 */
export function writeCommandsDisabled(args: {
  loading: boolean;
  writePending: boolean;
  /** CA-15 — a Cost write on this project is still running, started on any screen. */
  writeInFlight?: boolean;
}): boolean {
  return args.loading || args.writePending || args.writeInFlight === true;
}

/* ═══════════════════════════════════════════════ CA-15 · a write that outlives its screen ══ */

/**
 * The families of Cost writes, one per screen that starts them. Only used to name the write in
 * its mutation key; the guard matches the whole project prefix, so every family blocks every
 * other one, exactly as the canvas scrim did.
 */
export type CostWriteFamily =
  | "capex" | "capex-comments" | "periods" | "land-lease" | "contracts" | "add-cost-sheet";

/**
 * The TanStack `mutationKey` every Cost write carries (CA-15). The mutation cache lives in the
 * app's one `QueryClient`, so `useIsMutating({ mutationKey: costWriteKey(projectId) })` still
 * counts a write whose screen has unmounted. Filters match by prefix: the two-part key covers
 * every family of the project.
 */
export function costWriteKey(
  projectId: string | undefined, family?: CostWriteFamily,
): readonly string[] {
  const base = ["cost-write", projectId ?? "none"];
  return family ? [...base, family] : base;
}

/** The screens a failed Cost write can be named after in its toast. */
export type CostScreenName =
  | "DEVEX/CAPEX" | "DEVEX/CAPEX comments" | "O&M" | "Other OPEX" | "Land Lease" | "Contracts"
  | "Add Costs from Table";

/**
 * NEW TEXT (CA-15) — no canvas source: the canvas could not leave a screen mid-write (its pop-up
 * scrim covered the navigation), so it never needed to say either of these.
 */
export const COST_WRITE_MSG = {
  /** NEW — the status line on a Cost screen whose commands are greyed by another screen's write. */
  writeRunningElsewhere: "Please wait, a change started on another screen is still being saved...",
  /** NEW — the error toast's title when a write fails after its screen was left. */
  failedAfterLeaving: (screen: CostScreenName) =>
    `A change on the ${screen} screen could not be saved.`,
  /** NEW — the detail when the screen has no error text of its own for the failure. */
  failedNoDetail: "The change may have been saved in part. Reopen the screen to check.",
} as const;

/**
 * Where a failed Cost write is shown (CA-15). The screen's own banner while that screen is still
 * mounted and has one; otherwise the app-wide error toast (`<AppToaster />` outlives every
 * route), so a failure is never shown nowhere.
 */
export function writeFailureSurface(args: {
  screenMounted: boolean;
  hasScreenSurface: boolean;
}): "screen" | "toast" {
  return args.screenMounted && args.hasScreenSurface ? "screen" : "toast";
}

/**
 * The toast for a write that failed after its screen was left: a NEW title naming the screen, and
 * the screen's OWN error text (what its banner would have said) as the detail.
 */
export function leftScreenFailureToast(
  screen: CostScreenName, screenText: string | null | undefined,
): { message: string; detail: string } {
  const detail = (screenText ?? "").trim();
  return {
    message: COST_WRITE_MSG.failedAfterLeaving(screen),
    detail: detail === "" ? COST_WRITE_MSG.failedNoDetail : detail,
  };
}

/**
 * The `WriteStatus` line with CA-15 applied: the screen's own write text while its own write
 * runs, else `writeRunningElsewhere` while a write started elsewhere (or on an earlier visit of
 * this screen) is still in flight, else nothing.
 */
export function costWriteStatusLabel(args: {
  ownLabel: string | null;
  ownPending: boolean;
  writeInFlight: boolean;
}): string | null {
  if (args.ownLabel !== null) return args.ownLabel;
  return args.writeInFlight && !args.ownPending ? COST_WRITE_MSG.writeRunningElsewhere : null;
}
