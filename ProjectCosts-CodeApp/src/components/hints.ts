/**
 * The hover text of the buttons and icons that act the same on every screen, in one place so
 * they read the same everywhere (27 Oct 2026).
 *
 *   cancel  the ✕ of every panel and dialog: canvas `ico_…_BodyHeaderCancel` / `ico_PopUpConfirmation_BodyHeader*`
 *           (`Tooltip: ="Cancel"`, 33 controls). A panel whose canvas ✕ says otherwise passes its own
 *           (`FormPanel closeTooltip`, e.g. the cluster-change panel's "Close").
 *   close   `ico_ClusterChange_RightPanel_Header_Close` / `pcf_btn_GeneratorData_RightPanel_Form_Buttons_Cancel`.
 *   save    a Save button whose canvas `Tooltip` was the copy-pasted "Filter projects details list view."
 *           (12 buttons). SOURCE DEFECT: the hint is wrong, so Save says "Save" (UT-HINTS-001).
 */
export const HINTS = {
  cancel: "Cancel",
  close: "Close",
  save: "Save",
} as const;
