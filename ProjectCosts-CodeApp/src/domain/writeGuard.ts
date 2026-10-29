/**
 * The one write guard shared by the Cost screens (D57, PROPOSED; CONVENTIONS rule 17).
 *
 * DIVERGENCE (D57): the canvas blocked a second write by covering the screen with its
 * `cmp_*_PopUpLoading` pop-up (`Visible: =locIsVisiblePopUpSpinner`) and blocked the first paint
 * with its loading spinner. Both are gone, so the write-starting commands are disabled instead:
 * while the screen's data is still on its first load (there is nothing to write against yet, and
 * a draft started then would be overwritten when the rows land) and while any write is pending.
 * Read-only actions (selecting, expanding, tabs, filters) are never gated by this.
 *
 * Each screen maps the result onto its own commands locally (`guardLeaseCommands`,
 * `guardOpexCommands`, `gatedContractCommands`, `gridActionAllowed`, the comments panel).
 */
export function writeCommandsDisabled(args: { loading: boolean; writePending: boolean }): boolean {
  return args.loading || args.writePending;
}
