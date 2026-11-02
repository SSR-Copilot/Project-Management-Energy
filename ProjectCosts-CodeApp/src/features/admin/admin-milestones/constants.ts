/**
 * Milestones settings — constants and the screen's visible strings (CONVENTIONS rule 7).
 * Citations `AMS:<line>` point into
 * `ProjectDocs/_extracted/msapp/projectmanagement/Src/Admin Milestones Screen.pa.yaml`.
 *
 * The kind names live in `@/domain/milestones`, shared with `data/costBook.ts`
 * `loadMilestoneDurations`, so the screen and the project cost book can never drift.
 */
import { Vsb_milestonesstandardassumptionsesvsb_technology } from "@/generated/models/Vsb_milestonesstandardassumptionsesModel";
import type { MilestoneField } from "@/domain/milestones";
import { tokens } from "@fluentui/react-components";
import { palette } from "@/theme/tokens";

/** `vsb_name` values that classify an MSA row. Matched exactly. */
export { MILESTONE_ASSUMPTION_KIND as MSA_KIND } from "@/domain/milestones";

/**
 * Visible choice label for a `vsb_technology` value. A blank Technology shows as an EMPTY label,
 * exactly as the canvas does: `lbl_TechnologyValue_MilestonesStandardAssumptions_AdminScreen.Text =
 * Text(ThisItem.Technology)` (AMS:767) and `lb_Admin_MilestoneAssumption_Form_Fields_Durations_TechniqueLabel.Text
 * = ThisItem.Technology` (AMS:1900) both render "" for a blank choice. An option value the
 * generated model does not know shows `Technology <value>` (no canvas equivalent).
 */
export function technologyLabel(value: number | undefined): string {
  if (value === undefined) return "";
  return (Vsb_milestonesstandardassumptionsesvsb_technology as Record<number, string>)[value]
    ?? `Technology ${value}`;
}

/** NEW — no canvas equivalent: a blank Technology in accessible names and messages, where "" would read as nothing. */
export const BLANK_TECHNOLOGY_NAME = "No technology";

/** `technologyLabel`, but never empty: for aria-labels, warnings and save messages. */
export function technologyName(value: number | undefined): string {
  return value === undefined ? BLANK_TECHNOLOGY_NAME : technologyLabel(value);
}

/**
 * Canvas typography of the screen. `gblAppSizes.Font` (App:1148-1156): Small 10, Medium 11, Large 12,
 * ExtraLarge 14. The matrix labels are modern `Text@0.0.51` controls, whose `Size` is in px (28 Oct 2026,
 * D68); only `lbl_ClusterName_…` is a classic Label (Medium, pt ≈ 14.7px, nearest ramp step 300).
 * All weights Regular, default colours.
 */
export const TYPOGRAPHY = {
  /** `lbl_ClusterName_…`: Medium, `FontWeight.Normal`, `gblAppColors.Label.Color` = black (AMS:814, 822-824, 833). */
  // Measured in the Canvas run: 14.6667px (Medium 11pt), Open Sans, rgb(11, 11, 11). The font family stays the app-wide Open Sans decision.
  countryName: { fontSize: "14.6667px", fontWeight: tokens.fontWeightRegular, color: palette.black },
  /** `lbl_TechnologyValue_…`: modern Text, ExtraLarge = 14px, Regular (AMS:766, 769). */
  technology: { fontSize: "14px", fontWeight: tokens.fontWeightRegular },
  /** `lbl_SubLabelsValue_…`: modern Text, Large = 12px, Regular, default font colour (AMS:751, 756; no FontColor set). */
  subLabel: { fontSize: "12px", fontWeight: tokens.fontWeightRegular, color: tokens.colorNeutralForeground1 },
  /** `lbl_*Value_…`: modern Text, Large = 12px, Regular (AMS:560, 573 … 780, 793). */
  value: { fontSize: "12px", fontWeight: tokens.fontWeightRegular },
  /**
   * Edit-panel section headings: ExtraLarge, `'TextCanvas.Weight'.Bold` (AMS:1140-1143,
   * 1927-1930): modern Text, ExtraLarge = 14px.
   */
  panelHeading: { fontSize: "14px", fontWeight: tokens.fontWeightBold },
  /**
   * Edit-panel row labels and technology column headers: modern Text, ExtraLarge = 14px, Semibold
   * (AMS:1191-1194 … 2020; 1899-1902, 2357-2360).
   */
  panelLabel: { fontSize: "14px", fontWeight: tokens.fontWeightSemibold },
  /**
   * Edit-panel section validation messages: modern Text, `gblAppSizes.Font.Small` = 10px (AMS:1914, 2372).
   */
  panelMessage: { fontSize: "10px" },
} as const;

/** The two edit-panel matrices. */
export type MatrixKind = "durations" | "successRates";

/** NEW — no canvas equivalent: the matrix names in the duplicate-row warning and the save messages. */
export const KIND_LABEL: Record<MatrixKind, string> = {
  durations: "Cluster Durations",
  successRates: "Success Rates",
};

/**
 * Edit-panel section headings, verbatim from the canvas — ASCII only: the success-rate heading
 * uses a plain hyphen-minus, not an en dash.
 */
export const HEADING: Record<MatrixKind, string> = {
  /** `lbl_Admin_MilestoneAssumption_Form_SubHeader_ClusterDurations.Text` (AMS:1141) — verbatim. */
  durations: "Cluster Durations [months]",
  /** `lbl_Admin_MilestoneAssumption_Form_SubHeader_ClusterSuccessRates.Text` (AMS:1928) — verbatim. */
  successRates: "Cluster Probabilities - Success Rate [-]",
};

/** The edit-panel canvas control names per matrix (`data-testid`s, CONVENTIONS rule 16). */
export const PANEL_TEST_ID: Record<MatrixKind, {
  section: string; heading: string; gallery: string; message: string; techLabel: string; part: string;
}> = {
  durations: {
    section: "con_Admin_MilestoneAssumption_Form_Fields_Durations",
    heading: "lbl_Admin_MilestoneAssumption_Form_SubHeader_ClusterDurations",
    gallery: "gal_Admin_MilestoneAssumption_Form_Fields_Durations_MilestoneInputs",
    message: "lbl_Admin_MilestoneAssumption_Form_Fields_Durations_InvalidMessage",
    techLabel: "lb_Admin_MilestoneAssumption_Form_Fields_Durations_TechniqueLabel",
    part: "Durations",
  },
  successRates: {
    section: "con_Admin_MilestoneAssumption_Form_Fields_SuccessRates",
    heading: "lbl_Admin_MilestoneAssumption_Form_SubHeader_ClusterSuccessRates",
    gallery: "gal_Admin_MilestoneAssumption_Form_Fields_SuccessRates_MilestoneInputs",
    message: "lbl_Admin_MilestoneAssumption_Form_Fields_SuccessRates_InvalidMessage",
    techLabel: "lb_Admin_MilestoneAssumption_Form_Fields_SuccessRates_TechniqueLabel",
    part: "SuccessRates",
  },
};

/**
 * The canvas name part of each field: the row label is
 * `lbl_Admin_MilestoneAssumption_Form_Fields_<Section>_<part>`, the input
 * `txt_Admin_MilestoneAssumption_Form_Fields_<Section>_<part>_Input`.
 */
export const PANEL_FIELD_PART: Record<MilestoneField, string> = {
  cluster1: "Cluster1", cluster2: "Cluster2", cluster3: "Cluster3", cluster4: "Cluster4",
  fid: "FID", cluster5: "Cluster5", operationalLifetime: "OperationalLifetime",
  salesStart: "SalesStart", salesEnd: "SalesEnd",
};

export interface DurationFieldDef {
  field: MilestoneField;
  /** Edit-panel row label, `lbl_Admin_MilestoneAssumption_Form_Fields_Durations_<part>.Text` (AMS:1183-1308) — verbatim. */
  label: string;
  /**
   * Dataverse column maximum. All columns have minimum 0.
   * DIVERGENCE: the canvas checks only `IsMatch(Self.Value, "^\d+$")`; here a value above the
   * column maximum is refused in the panel ("Enter a value of at most N months", no canvas text)
   * instead of failing on the server.
   */
  max: number;
  /**
   * The canvas input `Value` is `Coalesce(ThisItem.'<column>', "0")` (AMS:1650-1890).
   * DIVERGENCE: here the "0" is a placeholder, not the value, so a typed "0" turns a blank into a
   * stored 0 (with "0" as the value it equalled the start text and was never saved).
   */
  blankAsZero: boolean;
}

/**
 * Duration rows of the edit panel, in order.
 *
 * `blankAsZero` applies to Cluster 5, Operational Lifetime, Sales Start and Sales End.
 * DIVERGENCE (product decision): FID is the exception. A blank FID shows blank both in the matrix
 * and in the panel; the canvas showed `Coalesce(Duration, 0.75)` in the matrix
 * (`lbl_FidValue_MilestonesStandardAssumptions_AdminScreen`) and `Coalesce(…, "0")` in the panel.
 */
export const DURATION_FIELDS: readonly DurationFieldDef[] = [
  { field: "cluster1", label: "Cluster 1", max: 100, blankAsZero: false },
  { field: "cluster2", label: "Cluster 2", max: 100, blankAsZero: false },
  { field: "cluster3", label: "Cluster 3", max: 100, blankAsZero: false },
  { field: "cluster4", label: "Cluster 4", max: 100, blankAsZero: false },
  { field: "fid", label: "Final Investment Decision", max: 1000, blankAsZero: false },
  { field: "cluster5", label: "Cluster 5", max: 100, blankAsZero: true },
  { field: "operationalLifetime", label: "Operational Lifetime", max: 1000, blankAsZero: true },
  { field: "salesStart", label: "Sales Start", max: 1000, blankAsZero: true },
  { field: "salesEnd", label: "Sales End", max: 1000, blankAsZero: true },
];

/**
 * Success-rate rows of the edit panel: Cluster 1–4 only (AMS:1970-2024),
 * `lbl_Admin_MilestoneAssumption_Form_Fields_SuccessRates_<part>.Text` — verbatim.
 */
export const RATE_FIELDS: readonly { field: MilestoneField; label: string }[] = [
  { field: "cluster1", label: "Cluster 1" },
  { field: "cluster2", label: "Cluster 2" },
  { field: "cluster3", label: "Cluster 3" },
  { field: "cluster4", label: "Cluster 4" },
];

/**
 * Read-only matrix columns after Technology and the sub-label column (AMS:326-447). `label` is
 * the header label's `Text`, verbatim; `headerTestId` / `valueTestId` are the canvas header and
 * value label names (the value label is row-suffixed with the technology).
 */
export const MATRIX_COLUMNS: readonly { key: string; label: string; width: number; headerTestId: string; valueTestId: string }[] = [
  { key: "cluster1", label: "Cluster 1", width: 80, headerTestId: "lbl_Cluster1_MilestonesStandardAssumptions_AdminScreen", valueTestId: "lbl_Cluster1Value_MilestonesStandardAssumptions_AdminScreen" },
  { key: "cluster2", label: "Cluster 2", width: 80, headerTestId: "lbl_Cluster2_MilestonesStandardAssumptions_AdminScreen", valueTestId: "lbl_Cluster2Value_MilestonesStandardAssumptions_AdminScreen" },
  { key: "cluster3", label: "Cluster 3", width: 80, headerTestId: "lbl_Cluster3_MilestonesStandardAssumptions_AdminScreen", valueTestId: "lbl_Cluster3Value_MilestonesStandardAssumptions_AdminScreen" },
  { key: "cluster4", label: "Cluster 4", width: 80, headerTestId: "lbl_Cluster4_MilestonesStandardAssumptions_AdminScreen", valueTestId: "lbl_Cluster4Value_MilestonesStandardAssumptions_AdminScreen" },
  { key: "fid", label: "FID", width: 60, headerTestId: "lbl_FID_MilestonesStandardAssumptions_AdminScreen", valueTestId: "lbl_FidValue_MilestonesStandardAssumptions_AdminScreen" },
  { key: "cluster5", label: "Cluster 5", width: 80, headerTestId: "lbl_Cluster5_MilestonesStandardAssumptions_AdminScreen", valueTestId: "lbl_Cluster5Value_MilestonesStandardAssumptions_AdminScreen" },
  { key: "operationalLifetime", label: "Operational Lifetime", width: 160, headerTestId: "lbl_OperationalLifetime_MilestonesStandardAssumptions_AdminScreen", valueTestId: "lbl_OperationalLifetimeValue_MilestonesStandardAssumptions_AdminScreen" },
  { key: "salesStart", label: "Sales Start", width: 80, headerTestId: "lbl_SalesStartDate_MilestonesStandardAssumptions_AdminScreen", valueTestId: "lbl_SalesStartDateValue_MilestonesStandardAssumptions_AdminScreen" },
  { key: "salesEnd", label: "Sales End", width: 100, headerTestId: "lbl_SalesCompletionDate_MilestonesStandardAssumptions_AdminScreen", valueTestId: "lbl_SalesCompletionDateValue_MilestonesStandardAssumptions_AdminScreen" },
];

/** The matrix's other captions, verbatim. */
export const MATRIX_TEXT = {
  /** `lbl_Technology_MilestonesStandardAssumptions_AdminScreen.Text` — verbatim. */
  technology: "Technology",
  /** `lbl_SubLabelsValue_MilestonesStandardAssumptions_AdminScreen.Text`, first line — verbatim. */
  subLabelDuration: "Duration [months]",
  /** `lbl_SubLabelsValue_MilestonesStandardAssumptions_AdminScreen.Text`, second line — verbatim. */
  subLabelSuccessRate: "Success Rate [-]",
} as const;

export const MSG = {
  /** `cmp_Admin_Milestones_Header.Project` → `Name: "Milestones"` (the in-page h1) — verbatim. */
  title: "Milestones",
  /** `cmd_MilestoneStandardAssumptionsDetails_Country_CommandBar.Items` → `ItemDisplayName: "Edit"` — verbatim. */
  edit: "Edit",
  /** `lbl_Admin_MilestoneAssumption_Form_Fields_Durations_InvalidMessage.Text` — verbatim. */
  durationInvalid: "Enter a positive value without decimals",
  /** `lbl_Admin_MilestoneAssumption_Form_Fields_SuccessRates_InvalidMessage.Text` — verbatim. */
  rateInvalid: "Enter a value between 0 and 1 with a maximum of 2 decimals",
  /** `lblAdmin_ProjectGates_Approvals_Form_Title_2.Text` — `$"Edit Milestones for {Name}"`, verbatim. */
  panelTitle: (country: string) => `Edit Milestones for ${country}`,
  /**
   * `pcf_but_Admin_MilestoneAssumption_Form_Buttons_Save.OnChange` → `locAdminLoadingDialogText`
   * (AMS:2447). SOURCE DEFECT (fixed): the canvas spells "Standart"
   * (`$"Milestone Standart Assumptions for '{Name}' will be saved, please wait..."`); corrected
   * to "Standard" here, otherwise verbatim.
   */
  saving: (country: string) =>
    `Milestone Standard Assumptions for '${country}' will be saved, please wait...`,
  /**
   * The same handler's success text (AMS:2617), "Standart" corrected as above. SOURCE DEFECT
   * (fixed): the canvas clears the text in the same step, so it was never seen; this app shows
   * it as a toast.
   */
  saved: "Milestone Standard Assumptions were successfully saved.",
  /**
   * The prefix of the same handler's error text (AMS:2619), "Standart" corrected.
   * DIVERGENCE: the canvas continues `Internal error: originated on {FirstError.Source}. Message:
   * {FirstError.Message} {FirstError.Details.HttpResponse}`; here a user-safe reason and the rows
   * that were and were not saved follow (`saveFailureMessage`).
   */
  saveFailed: "Error: Milestone Standard Assumptions could not be saved.",
  /** NEW — no canvas equivalent: the action named in the shared permission message. */
  permissionAction: "save milestone assumptions",
  /** NEW — no canvas equivalent: the save is refused for a user without the admin rule. */
  noPermission: "You do not have permission to change the milestone assumptions.",
  /** NEW — no canvas equivalent: a background refetch failed while cached rows are still shown. */
  staleData: "The latest milestone assumptions could not be loaded. Values may be out of date.",
  /** NEW — no canvas equivalent: the refetch that Edit runs failed, so the panel is not opened on stale values. */
  editRefetchFailed: "Current values could not be loaded; try again.",
} as const;
