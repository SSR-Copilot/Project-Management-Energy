/**
 * Milestones settings — constants (DR-8).
 *
 * The kind names live in `@/domain/milestones` (M13), shared with `data/costBook.ts`
 * `loadMilestoneDurations`, so the screen and the project cost book can never drift.
 */
import { Vsb_milestonesstandardassumptionsesvsb_technology } from "@/generated/models/Vsb_milestonesstandardassumptionsesModel";
import type { MilestoneField } from "@/data/settings/milestones";
import { tokens } from "@fluentui/react-components";
import { palette } from "@/theme/tokens";

/** `vsb_name` values that classify an MSA row (DR-3). Matched exactly. */
export { MILESTONE_ASSUMPTION_KIND as MSA_KIND } from "@/domain/milestones";

/**
 * `vsb_jobstatecodes`. Unused while Apply / Apply All / the recalculation indicator are omitted
 * (FR-10 default); kept so the decision can be implemented without hunting for the codes.
 */
export const JOB_STATUS = {
  Dirty: 952850000,
  InDelay: 952850001,
  InProgress: 952850002,
  Finished: 952850003,
  Failed: 952850004,
  Cancelled: 952850005,
  Importing: 952850006,
} as const;

/**
 * Visible choice label for a `vsb_technology` value. A blank Technology shows as an EMPTY label,
 * exactly as the canvas does: `Text(ThisItem.Technology)` (AMS:767) and `ThisItem.Technology`
 * (AMS:1900) both render "" for a blank choice (parity R1 GAP-3).
 */
export function technologyLabel(value: number | undefined): string {
  if (value === undefined) return "";
  return (Vsb_milestonesstandardassumptionsesvsb_technology as Record<number, string>)[value]
    ?? `Technology ${value}`;
}

/** Name of a blank Technology in accessible names and messages, where "" would read as nothing. */
export const BLANK_TECHNOLOGY_NAME = "No technology";

/** `technologyLabel`, but never empty: for aria-labels, warnings and save messages. */
export function technologyName(value: number | undefined): string {
  return value === undefined ? BLANK_TECHNOLOGY_NAME : technologyLabel(value);
}

/**
 * Canvas typography of the screen (parity R1 GAP-2). `gblAppSizes.Font` (App:1134-1162):
 * Medium 11pt ≈ 14.7px, Large 12pt = 16px, ExtraLarge 14pt ≈ 18.7px — mapped to the nearest
 * Fluent ramp step (300 = 14px, 400 = 16px, 500 = 20px). All weights Regular, default colours.
 */
export const TYPOGRAPHY = {
  /** `lbl_ClusterName_…`: Medium, `FontWeight.Normal`, `gblAppColors.Label.Color` = black (AMS:814, 822-824, 833). */
  countryName: { fontSize: tokens.fontSizeBase300, fontWeight: tokens.fontWeightRegular, color: palette.black },
  /** `lbl_TechnologyValue_…`: ExtraLarge, Regular (AMS:766, 769). */
  technology: { fontSize: tokens.fontSizeBase500, fontWeight: tokens.fontWeightRegular },
  /** `lbl_SubLabelsValue_…`: Large, Regular, default font colour (AMS:751, 756; no FontColor set). */
  subLabel: { fontSize: tokens.fontSizeBase400, fontWeight: tokens.fontWeightRegular, color: tokens.colorNeutralForeground1 },
  /** `lbl_*Value_…`: Large, Regular (AMS:560, 573 … 780, 793). */
  value: { fontSize: tokens.fontSizeBase400, fontWeight: tokens.fontWeightRegular },
  /**
   * Edit-panel section headings: ExtraLarge, `'TextCanvas.Weight'.Bold` (AMS:1140-1143,
   * 1927-1930). Same ExtraLarge step as `technology` (parity R2 GAP-R2-1).
   */
  panelHeading: { fontSize: tokens.fontSizeBase500, fontWeight: tokens.fontWeightBold },
  /**
   * Edit-panel row labels and technology column headers: ExtraLarge, Semibold (AMS:1191-1194 …
   * 2020; 1899-1902, 2357-2360) (parity R2 GAP-R2-1).
   */
  panelLabel: { fontSize: tokens.fontSizeBase500, fontWeight: tokens.fontWeightSemibold },
  /**
   * Edit-panel section validation messages: `gblAppSizes.Font.Small` (AMS:1914, 2372).
   * Small 10pt ≈ 13.3px, nearest ramp step 300 (parity R3 GAP-R3-1).
   */
  panelMessage: { fontSize: tokens.fontSizeBase300 },
} as const;

/** The two edit-panel matrices. */
export type MatrixKind = "durations" | "successRates";

export const KIND_LABEL: Record<MatrixKind, string> = {
  durations: "Cluster Durations",
  successRates: "Success Rates",
};

/**
 * Edit-panel section headings, verbatim from the canvas — ASCII only: the success-rate heading
 * uses a plain hyphen-minus, not an en dash (parity R1 GAP-1).
 */
export const HEADING: Record<MatrixKind, string> = {
  /** `lbl_…_SubHeader_ClusterDurations.Text` (AMS:1141). */
  durations: "Cluster Durations [months]",
  /** `lbl_…_SubHeader_ClusterSuccessRates.Text` (AMS:1928). */
  successRates: "Cluster Probabilities - Success Rate [-]",
};

export interface DurationFieldDef {
  field: MilestoneField;
  /** Edit-panel row label (AMS:1183-1308). */
  label: string;
  /** Dataverse column maximum (04-data/01 §2.1). All columns have minimum 0. */
  max: number;
  /** Canvas prefills a blank stored value with "0" (AMS:1650-1890); shown as a placeholder (gap C-5). */
  blankAsZero: boolean;
}

/**
 * Duration rows of the edit panel, in order.
 *
 * `blankAsZero` follows FR-5 for Cluster 5, Operational Lifetime, Sales Start and Sales End.
 * FID is the exception by product decision: a blank FID shows blank both in the matrix and in
 * the panel (the canvas showed 0.75 in one and 0 in the other, D-DATA-3).
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

/** Success-rate rows of the edit panel: Cluster 1–4 only (AMS:1970-2024, D-DATA-6). */
export const RATE_FIELDS: readonly { field: MilestoneField; label: string }[] = [
  { field: "cluster1", label: "Cluster 1" },
  { field: "cluster2", label: "Cluster 2" },
  { field: "cluster3", label: "Cluster 3" },
  { field: "cluster4", label: "Cluster 4" },
];

/** Read-only matrix columns after Technology and the sub-label column (AMS:326-447). */
export const MATRIX_COLUMNS: readonly { key: string; label: string; width: number }[] = [
  { key: "cluster1", label: "Cluster 1", width: 80 },
  { key: "cluster2", label: "Cluster 2", width: 80 },
  { key: "cluster3", label: "Cluster 3", width: 80 },
  { key: "cluster4", label: "Cluster 4", width: 80 },
  { key: "fid", label: "FID", width: 60 },
  { key: "cluster5", label: "Cluster 5", width: 80 },
  { key: "operationalLifetime", label: "Operational Lifetime", width: 160 },
  { key: "salesStart", label: "Sales Start", width: 80 },
  { key: "salesEnd", label: "Sales End", width: 100 },
];

export const MSG = {
  durationInvalid: "Enter a positive value without decimals",
  rateInvalid: "Enter a value between 0 and 1 with a maximum of 2 decimals",
  saving: (country: string) =>
    `Milestone Standard Assumptions for '${country}' will be saved, please wait...`,
  saved: "Milestone Standard Assumptions were successfully saved.",
  saveFailed: "Error: Milestone Standard Assumptions could not be saved.",
  permissionAction: "save milestone assumptions",
  /** A background refetch failed while cached rows are still shown (gap C-1 / B1). */
  staleData: "The latest milestone assumptions could not be loaded. Values may be out of date.",
  /** The refetch that Edit runs failed, so the panel is not opened on stale values (C-1 / B2). */
  editRefetchFailed: "Current values could not be loaded; try again.",
} as const;
