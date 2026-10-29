/**
 * Project General Milestones Screen — composition only (connected 19 Oct 2026, D26).
 *
 * Canvas screen: `Project General Milestones Screen.pa.yaml` (PM app). The layout follows its
 * containers, top to bottom:
 *
 *   lock message   `con_Milestones_Page_LockMessage` (`Visible: IsBlank('Project ID')`)
 *   date chain     `…_Clusters_Date_1Column` (Project Start, Cluster 1–3) and
 *                  `…_Date_2Column` (Cluster 4, FID, Cluster 5, Cluster 6), each date with its
 *                  `*`, its `CalendarAdd` recalculate button and its error label
 *   separator      `rec_…_Sales_StartDate_Separator`
 *   sales dates    `…_Sales_Date_1C` (Sales Start Date) and `…_2C` (Sales Completion Date)
 *   farmdown       `…_Share_of_Farmdown_Card` — value, reset icon, ⓘ tooltip, error
 *   separator      `rec_…_Sales_OperatinalLifeTime_Separator`
 *   operation      `…_Lifetime` (Operational Lifetime: years, months) and `…_EndDate`
 *   footer         `…_Content_ProjectInfo` (Created By / Created / Modified By / Modified) and
 *                  `…_Content_Buttons` (recalculating notice, Required fields, Save, Cancel)
 *   dialogs        `cmp_PopUp_Confirmation_IndividualVolume_Review`, the saving overlay
 *                  (`cmp_PopUp_Milestones_Saving_Dialog` → `WriteFeedback`)
 *
 * The hidden subroutine buttons are functions here: `btn_Project_Milestone_Save` → `runSave`,
 * `btn_…_Buttons_Recalculate` / `…_Reset_Validation` → `validateMilestones` (re-run every render),
 * `btn_…_Buttons_Reset` (`OnHidden`) → unmounting.
 *
 * The unsaved-data leave dialog (`cmp_PopUp_Leave_Milestones_Confirmation`) is the shared
 * `UnsavedChangesGuard` (D35), armed by `shouldConfirmLeave(dirtyKeys)`. The default revenue contract
 * the save seeds needs Fabric SQL (D2): a notice says so while the seed would run.
 */
import { useMemo, useState } from "react";
import {
  Button, Field, Input, MessageBar, MessageBarBody, Text, Tooltip, makeStyles, mergeClasses, tokens,
} from "@fluentui/react-components";
import {
  ArrowClockwiseRegular, CalendarAddRegular, CheckmarkRegular, DismissRegular, InfoRegular,
  LockClosedRegular,
} from "@fluentui/react-icons";
import {
  ConfirmDialog, DateField, EmptyState, FIELD_APPEARANCE, LoadingOverlay, UnsavedChangesGuard, WriteFeedback,
  useCanvasRequiredMark, useFieldControlClass, useFieldSkin, useNoInvalidOutline, useStandardValueClass,
} from "@/components";
import { DATE_PICKER_FORMAT, MODERN_DATE_PICKER_FORMAT, type CanvasDateFormat } from "@/domain/canvasDate";
import type { Lang } from "@/domain/powerFxNumeric";
import { useSession } from "@/app/SessionContext";
import { palette, space } from "@/theme/tokens";
import { CANVAS_TEXT, usePmLayout } from "@/features/pm/general-data/pmLayout";
import { stepLogText } from "@/features/pm/general-data/rules";
import {
  MILESTONES_MSG, MILESTONES_SCREEN_TEXT, MILESTONE_FIELD_ERROR, cancelMilestones,
  canSaveMilestones, classifyDerivedMilestones, codChangeBlocksSave, editMilestone,
  emptyMilestoneDates, farmdownError, formatFarmdown, formatShortDateTime24, initialForm, invalidMessages,
  isMilestoneFieldErrorVisible, isMilestoneFieldVisible, isPageLocked, isRecalculateEnabled,
  isRecalculateVisible, milestoneMeta, needsPlantCostRecalculation, nextDirtyKeys,
  operationalLifetime, planSaveMilestones, recalculateMilestone, repriceGenerators,
  requiredFieldsContent, resetShareOfFarmdown, sameDate, validateMilestones,
  LEAVE_DIALOG, shouldConfirmLeave,
  type MilestoneKey, type MilestonesForm, type RecalcKey,
} from "./rules";
import {
  loadRepricing, loadRevenueSeed, useIndividualVolumeContractCount, useMilestoneAssumption,
  useMilestoneLabels, useMilestoneProject, useMilestoneWrites, useRecalculationRunning,
} from "./hooks";

type DateKey = Exclude<MilestoneKey, "ShareOfFarmdown">;

/** The canvas name segment of each date's controls (`dtp_…_<seg>`). */
const SEGMENT: Record<DateKey, string> = {
  StartDate: "StartDate",
  FeasibilityStudies: "Cluster1",
  ProjectDevelopmentStarted: "Cluster2",
  ApplicationSubmitted: "Cluster3",
  LegallyBindingPermits: "Cluster4",
  FinalInvestmentDecision: "FiD",
  Construction: "Cluster5",
  OperationsStartDate: "Cluster6",
  EndDate: "EndDate",
  SalesStartDate: "Sales_StartDate",
  StartCompleted: "Sales_CompletionDate",
};

/** The recalculate buttons the canvas has, by their own control-name segment (`but_…_<seg>`). */
const RECALC_SEGMENT: Partial<Record<DateKey, string>> = {
  ProjectDevelopmentStarted: "Cluster2",
  ApplicationSubmitted: "Cluster3",
  LegallyBindingPermits: "Cluster4",
  FinalInvestmentDecision: "FiD",
  Construction: "Cluster5",
  OperationsStartDate: "Cluster6",
  EndDate: "EndDate",
  SalesStartDate: "Sales_Start_Date",
  StartCompleted: "Sales_Completion_Date",
};

/** `Index(locRecordMilestoneNames, n).vsb_clusterdescription` — which label each cluster reads. */
const LABEL_INDEX: Partial<Record<DateKey, number>> = {
  FeasibilityStudies: 0, ProjectDevelopmentStarted: 1, ApplicationSubmitted: 2,
  LegallyBindingPermits: 3, Construction: 4, OperationsStartDate: 5,
};

/** `Placeholder` per date picker; the classic `DatePicker@0.0.46` controls have none. */
const PLACEHOLDER: Partial<Record<DateKey, string>> = {
  StartDate: MILESTONES_MSG.startDatePlaceholder,
  ApplicationSubmitted: MILESTONES_MSG.datePlaceholder,
  SalesStartDate: MILESTONES_MSG.salesStartPlaceholder,
  StartCompleted: MILESTONES_MSG.salesCompletionPlaceholder,
};

/**
 * Each picker's canvas control and so its box text (modern controls sweep, 20 Oct 2026): Project
 * Start and Cluster 3 are `ModernDatePicker@1.0.1` with no `Format` (the long date), the others
 * `DatePicker@0.0.46` with no `Format` (LongAbbreviated). Every one has `IsEditable: true` and
 * `StartOfWeek` Monday.
 */
const FORMAT: Partial<Record<DateKey, CanvasDateFormat>> = {
  StartDate: MODERN_DATE_PICKER_FORMAT,
  ApplicationSubmitted: MODERN_DATE_PICKER_FORMAT,
};
const formatOf = (k: DateKey): CanvasDateFormat => FORMAT[k] ?? DATE_PICKER_FORMAT;
/** The pickers that are the classic `DatePicker@0.0.46` (everything not a `ModernDatePicker`). */
const isClassicPicker = (k: DateKey): boolean => FORMAT[k] === undefined;

/** The classic controls' default outline / placeholder greys (Fluent UI v8 `neutralSecondaryAlt` …). */
const CLASSIC_BORDER = "#8A8886";
const CLASSIC_BORDER_DISABLED = "#C8C6C4";
const CLASSIC_PLACEHOLDER = "#A19F9D";
/** Plain marker classes for the classic boxes, so the screen-root rules can find them. */
const CLASSIC = "ms-classic-box";
const CLASSIC_DISABLED = "ms-classic-box-disabled";
const outline = (color: string) => ({
  borderTopWidth: "1px", borderRightWidth: "1px", borderBottomWidth: "1px", borderLeftWidth: "1px",
  borderTopStyle: "solid" as const, borderRightStyle: "solid" as const,
  borderBottomStyle: "solid" as const, borderLeftStyle: "solid" as const,
  borderTopColor: color, borderRightColor: color, borderBottomColor: color, borderLeftColor: color,
});

const COLUMN_1: DateKey[] = [
  "StartDate", "FeasibilityStudies", "ProjectDevelopmentStarted", "ApplicationSubmitted",
];
const COLUMN_2: DateKey[] = [
  "LegallyBindingPermits", "FinalInvestmentDecision", "Construction", "OperationsStartDate",
];

/**
 * A New Project (nothing saved in General yet): no record, so the form holds what the canvas
 * shows on a blank `gblRecordSelectedProject` — no dates and the standard farmdown,
 * `Coalesce('Share of Farmdown', 50)`, in the standard-value style.
 */
const emptyForm = (locale: Lang): MilestonesForm => ({
  dates: emptyMilestoneDates, standardAssumption: {}, shareOfFarmdown: formatFarmdown(50, locale),
  isStandardShareOfFarmdown: true,
});

const id = (seg: string) => `dtp_Milestones_DisplayProject_Body_General_Content_${seg}`;
const butId = (seg: string) => `but_Milestones_DisplayProject_Body_General_Content_${seg}`;
const FOOTER = "lbl_GeneralData_DisplayProject_Body_Content_Buttonscon_GeneralData_DisplayProject_Body_Content_";

/** `con_Milestones_Page_LockMessage.Fill` / the lock icon and text colour — transcribed (Y:1328-1404). */
const LOCK_FILL = "rgb(89, 89, 89)";
const LOCK_TEXT = "rgb(255, 255, 255)";

/** `gblAppColors.ButtonDisabledBg` (`App.pa.yaml`) — the two separators' Fill. */
const SEPARATOR_FILL = "#bdbdbd";

/*
 * Layout transcribed from the canvas containers (UI layout pass, 20 Oct 2026):
 *  - `con_…_Body_General_Content`: vertical, PaddingLeft 10, PaddingTop 10;
 *  - each group (`…_Clusters_Date`, `…_Sales_Date`, `…_ShareofFarmdown`, `…_Project_Operation`)
 *    is a horizontal, wrapping row of columns `Min(380, Parent.Width)` wide; the date-chain
 *    columns have PaddingTop 20 / PaddingBottom 10;
 *  - each date is a 70-high cell (the sales, farmdown and operation cells 90), its caption and
 *    picker at X 20, the 32-px CalendarAdd button 4 px right of the picker;
 *  - the separators are 1 px, as wide as the two columns.
 */
const useStyles = makeStyles({
  /**
   * The canvas page never scrolls: `…_Body_General_Content.Height = Parent.Height - Buttom.Height`,
   * so the form fills exactly the space above the bottom bar and only the date card scrolls.
   */
  fixedPage: { flex: "1 1 0px", minHeight: 0, overflow: "hidden" },
  body: {
    display: "flex", flexDirection: "column", flex: "1 1 0px", minHeight: 0, paddingLeft: "10px", paddingTop: "10px",
    /*
     * The `lbl_…_ErrorMessage` labels are classic `Label@2.5.1`: `Color: gblAppColors.Error`
     * (= `palette.akzent5`), `Size: 9` (12 px), `Height: 16` — one line, cut with an ellipsis —
     * and no icon; the label's own 5-px padding insets the text from the caption.
     */
    "& .fui-Field__validationMessage": {
      display: "block", minWidth: 0, maxWidth: "100%", paddingLeft: "5px",
      color: palette.akzent5, fontSize: "12px", lineHeight: "16px",
      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
    },
    "& .fui-Field__validationMessageIcon": { display: "none" },
    /*
     * `useNoInvalidOutline` clears every box's border on the screen root; the classic boxes keep
     * their grey outline, invalid or not (marker classes, one step more specific).
     */
    [`& .${CLASSIC}.fui-Input:not(:focus-within)`]: outline(CLASSIC_BORDER),
    [`& .${CLASSIC}.fui-Input:hover:not(:focus-within)`]: outline(CLASSIC_BORDER),
    [`& .${CLASSIC}.${CLASSIC_DISABLED}.fui-Input:not(:focus-within)`]: outline(CLASSIC_BORDER_DISABLED),
    [`& .${CLASSIC}.${CLASSIC_DISABLED}.fui-Input:hover:not(:focus-within)`]: outline(CLASSIC_BORDER_DISABLED),
  },
  /**
   * The classic `DatePicker@0.0.46` / `TextInput@0.0.54` box (every picker but Project Start and
   * Cluster 3, and Share of Farmdown) when DISABLED: white with a 1-px outline. Editable, it is
   * the filled grey box like every other field.
   */
  classicBox: {
    backgroundColor: palette.white,
    ...outline(CLASSIC_BORDER), ":hover": outline(CLASSIC_BORDER), ":focus-within": outline(CLASSIC_BORDER),
    "& input::placeholder": { color: CLASSIC_PLACEHOLDER },
  },
  /** `DisplayMode.Disabled`: the paler outline, and the text in `DisabledColor` (not the standard blue). */
  classicDisabled: {
    backgroundColor: palette.white,
    ...outline(CLASSIC_BORDER_DISABLED), ":hover": outline(CLASSIC_BORDER_DISABLED),
    "& input, & input:disabled": { color: CLASSIC_PLACEHOLDER, backgroundColor: "transparent" },
  },
  /**
   * `con_Milestones_DisplayProject_Body_General_Content_Scrollbar` — Width `Parent.Width-20`, below
   * the lock banner, with the `GroupContainer@1.5.0` defaults it never overrides: `DropShadow.Light`
   * and a 4-px radius, the frame round the dates that runs down to the bottom bar.
   */
  card: {
    // `LayoutOverflowY: Scroll` — the dates scroll inside the frame, which runs on into the bottom
    // bar (square bottom corners, no gap) instead of closing above it.
    display: "flex", flexDirection: "column", flex: "1 1 0px", minHeight: 0, overflowY: "auto",
    marginRight: "10px", paddingBottom: space.m,
    borderTopLeftRadius: "4px", borderTopRightRadius: "4px",
    boxShadow: tokens.shadow4, backgroundColor: palette.white,
  },
  /** `con_Milestones_DisplayProject_Body_Content_Buttom` keeps the default `DropShadow.Light` too — the rule above the stamp. */
  footer: { boxShadow: tokens.shadow4 },
  /** `con_Milestones_Page_LockMessage` — Fill RGB(89,89,89), MinHeight 50, PaddingLeft 20, LayoutGap 10. */
  lock: {
    // `LayoutMaxWidth: Parent.Width-20` — the banner spans the body, not just the two date columns.
    display: "flex", alignItems: "center", columnGap: "10px", alignSelf: "stretch",
    marginRight: "10px", boxSizing: "border-box", flexShrink: 0,
    minHeight: "50px", paddingLeft: "20px",
    // `GroupContainer@1.5.0` with no Radius override: the default 4-px corners.
    borderRadius: "4px",
    backgroundColor: LOCK_FILL, color: LOCK_TEXT,
  },
  /** `con_Milestones_pagelock_section` — Padding 8. */
  lockText: {
    display: "flex", flexDirection: "column", gap: space.xxs, color: LOCK_TEXT,
    paddingTop: "8px", paddingBottom: "8px", paddingLeft: "8px", paddingRight: "8px",
  },
  /** `Text@0.0.51` at its default size, which renders at 11 pt (14.67 px) on 20-px lines (`Height: 20`). */
  lockLine: { color: LOCK_TEXT, fontSize: "14.67px", lineHeight: "20px" },
  columns: { display: "flex", flexWrap: "wrap", alignItems: "flex-start" },
  column: {
    display: "flex", flexDirection: "column", boxSizing: "border-box",
    width: "380px", maxWidth: "100%", minWidth: 0,
  },
  /** `…_Clusters_Date_1Column` / `…_Date_2Column` — PaddingTop 20, PaddingBottom 10. */
  chainColumn: { paddingTop: "20px", paddingBottom: "10px" },
  /** A date cell: 70 high, contents inset 20 px. */
  row: {
    display: "flex", flexDirection: "row", alignItems: "flex-start", columnGap: "4px", minWidth: 0, boxSizing: "border-box",
    minHeight: "70px", paddingLeft: "20px", paddingRight: "20px",
  },
  /** The Sales, farmdown and operation cells are 90 high. */
  tallRow: { minHeight: "90px" },
  field: { flex: 1, minWidth: 0 },
  /**
   * `but_…_Cluster2` … — `Button@0.0.45`, `Appearance: Secondary` (the outlined box), `Layout:
   * IconOnly`, `Icon: "CalendarAdd"`, Width 32 (Height the default 32), `FontColor: themePrimary`,
   * 4 px right of the picker, at the picker's Y.
   */
  recalc: {
    marginTop: "26px", width: "32px", minWidth: "32px", height: "32px", flexShrink: 0,
    ":enabled": { color: palette.themePrimary },
  },
  /** The 32 px a button-less picker still leaves free (less the 4-px gap). */
  recalcSpacer: { width: "28px", flexShrink: 0 },
  /**
   * `but_…_farmdown_Reset` — a classic `Icon` (Reload), 18 × 18, no box, `RGBA(0, 120, 212, 1)`,
   * 4 px right of the input and centred on it.
   */
  resetIcon: {
    marginTop: "26px", width: "32px", minWidth: "32px", height: "32px", flexShrink: 0,
    ":enabled": { color: "rgb(0, 120, 212)" },
    "& .fui-Button__icon": { fontSize: "18px", width: "18px", height: "18px" },
  },
  /** `Icon1_2` — Information, 16 × 16, at X 178 / Y 6: right after the caption. */
  infoIcon: {
    minWidth: "16px", width: "16px", height: "16px", padding: 0, marginLeft: "6px", verticalAlign: "middle",
    ":enabled": { color: "rgb(0, 120, 212)" },
    "& .fui-Button__icon": { fontSize: "16px", width: "16px", height: "16px" },
  },
  separator: {
    height: "1px", width: "760px", maxWidth: "100%", backgroundColor: SEPARATOR_FILL, flexShrink: 0,
    marginTop: space.s, marginBottom: space.s,
  },
  /** `txt_…_Years` / `txt_…_Months` share the Lifetime cell. */
  lifetime: { display: "flex", gap: space.s, minWidth: 0, "& > *": { flex: 1, minWidth: 0 } },
  /** `con_…_Content_ProjectInfo` — Creator and Editor blocks side by side, each `Max(300, …)`. */
  audit: { display: "flex", flexWrap: "wrap", paddingLeft: "20px" },
  /**
   * The stamp labels: classic `Label`, ExtraSmall (9 pt), Width 80, `RGBA(50, 49, 48, 1)`. Row 1:
   * "Created By:" and the name; row 2: the date at X 80 — its "Created:" caption is `Visible: false`.
   */
  auditBlock: {
    display: "grid", gridTemplateColumns: "80px auto", alignContent: "center", rowGap: "2px",
    minWidth: "300px", fontSize: "12px", color: CANVAS_TEXT,
  },
  /** The date sits in the second column, under the name. */
  auditDate: { gridColumnStart: 2 },
  /**
   * `pcf_btn_…_Buttons_Save` — `cat_PowerCAT.Icon` ActionButton, Width 96, Height 32, FontSize 16:
   * `FillColor: themePrimary`, `FontColor: white`; hover `hoverButton` with themePrimary text.
   * Disabled it is the plain grey icon + caption (the locked page).
   */
  saveButton: {
    width: "96px", minWidth: "96px", height: "32px", fontSize: "16px", fontWeight: 400,
    ":enabled": {
      backgroundColor: palette.themePrimary, color: palette.white,
      "& .fui-Button__icon": { color: palette.white },
    },
    ":enabled:hover": {
      backgroundColor: palette.hoverButton, color: palette.themePrimary,
      "& .fui-Button__icon": { color: palette.themePrimary },
    },
  },
  /**
   * `pcf_btn_…_Buttons_Reset` ("Cancel") — Width 96, Height 32: `FillColor: white`, `BorderColor` and
   * `FontColor: themePrimary`; hover fill and border `hoverButton`.
   */
  cancelButton: {
    // Same 16 px caption as Save (PO, 27 Oct 2026; the YAML sets FontSize on Save only).
    width: "96px", minWidth: "96px", height: "32px", fontSize: "16px", fontWeight: 400,
    ":enabled": {
      backgroundColor: palette.white, color: palette.themePrimary,
      borderTopWidth: "1px", borderRightWidth: "1px", borderBottomWidth: "1px", borderLeftWidth: "1px",
      borderTopStyle: "solid", borderRightStyle: "solid", borderBottomStyle: "solid", borderLeftStyle: "solid",
      borderTopColor: palette.themePrimary, borderRightColor: palette.themePrimary,
      borderBottomColor: palette.themePrimary, borderLeftColor: palette.themePrimary,
      "& .fui-Button__icon": { color: palette.themePrimary },
    },
    ":enabled:hover": {
      backgroundColor: palette.hoverButton, color: palette.themePrimary,
      borderTopColor: palette.hoverButton, borderRightColor: palette.hoverButton,
      borderBottomColor: palette.hoverButton, borderLeftColor: palette.hoverButton,
    },
  },
  auditLabel: { fontWeight: 600 },
  /** `con_…_Content_Buttons` — fills the bar, LayoutJustifyContent End, LayoutGap 20, PaddingRight 10. */
  buttons: {
    flex: 1, display: "flex", alignItems: "center", justifyContent: "flex-end",
    columnGap: "20px", flexWrap: "wrap", paddingRight: "10px",
  },
  /** `ibtn_…_Requered_Fileds_1` / its label: `gblAppColors.Error` (= `palette.akzent5`), icon and text alike. */
  required: {
    color: palette.akzent5,
    ":hover": { color: palette.akzent5 }, "& .fui-Button__icon": { color: palette.akzent5 },
  },
  requiredText: { color: palette.akzent5, fontSize: "10.67px" },
  multiline: { whiteSpace: "pre-line" },
});

export default function MilestonesScreen() {
  const s = useStyles();
  const l = usePmLayout();
  const skin = useFieldSkin();
  const controlClass = useFieldControlClass();
  const noInvalidOutline = useNoInvalidOutline();
  const requiredMark = useCanvasRequiredMark();
  /* A date derived from a standard assumption renders italic theme-blue (GUIDE p16, rule 20). */
  const standardClass = useStandardValueClass();
  const { projectId, locale } = useSession();

  const projectQ = useMilestoneProject(projectId);
  const labelsQ = useMilestoneLabels();
  const project = projectQ.data;
  const assumptionQ = useMilestoneAssumption(project?.countryId, project?.technologyValue);
  const individualVolumes = useIndividualVolumeContractCount(projectId);

  const recalculating = useRecalculationRunning(projectId);
  const writes = useMilestoneWrites(projectId);

  const persisted = useMemo(() => (project ? initialForm(project, locale) : emptyForm(locale)), [project, locale]);
  const [edited, setEdited] = useState<MilestonesForm | null>(null);
  const [dirtyKeys, setDirtyKeys] = useState<MilestoneKey[]>([]);
  const [codReview, setCodReview] = useState(false);
  /** The last save could not read Fabric SQL, so it created no default revenue contract. */
  const [seedFailed, setSeedFailed] = useState(false);
  const form = edited ?? persisted;

  const saving = writes.progress !== null;
  const locked = isPageLocked(project);
  /** `DisplayMode: If(con_Milestones_Page_LockMessage.Visible, Disabled, Edit)`. */
  const editable = !locked && !saving;
  const validation = validateMilestones(form.dates, project?.startCluster, form.shareOfFarmdown, locale);
  // `con_…_Buttons_Reset.Visible: CountRows(Filter(colMilestonesFormValidation, Valid = false)) > 0`
  // — a New Project's blank dates are invalid too, so "Required fields" shows on the locked page.
  const problems = invalidMessages(validation);
  const derived = classifyDerivedMilestones(form);
  const lifetime = operationalLifetime(form.dates.OperationsStartDate, form.dates.EndDate);
  const recalcVisible = isRecalculateVisible(project?.technology);
  const farmdownMessage = farmdownError(form.shareOfFarmdown, locale);
  // `DataSourceInfo` / `RecordInfo` have no SDK equivalent: Dataverse decides (D1, serverEnforcedProvider).
  const perms = { canCreate: true, canEdit: true };
  const saveEnabled = !saving && canSaveMilestones({ perms, project, validation, dirtyKeys, locked });

  const setDate = (k: DateKey, raw: string) => {
    const value = raw || null;
    setEdited(editMilestone(form, k, value));
    setDirtyKeys((d) => nextDirtyKeys(d, k, {
      via: "edit", storedFid: project?.dates.FinalInvestmentDecision ?? null, value,
    }));
  };
  const recalc = (k: RecalcKey) => {
    setEdited(recalculateMilestone(form, k, assumptionQ.data));
    setDirtyKeys((d) => nextDirtyKeys(d, k, { via: "recalculate" }));
  };
  const markFarmdownDirty = () => setDirtyKeys((d) => nextDirtyKeys(d, "ShareOfFarmdown", { via: "edit" }));

  /** `btn_Project_Milestone_Save.OnSelect` (Y:280-1158). */
  const runSave = async () => {
    if (!project?.id) return;
    const p = project;
    const f = form;
    const fid = f.dates.FinalInvestmentDecision;
    let fabricFailed = false;
    setSeedFailed(false);
    const done = await writes.run({
      progress: MILESTONES_MSG.saving,
      // `Notify(Concat(colProcessingSteps, $"{Value} {Char(10)}"), Success)` (Y:501-508).
      success: (plan) => stepLogText(plan.log),
      plan: async () => {
        const repricing = fid && needsPlantCostRecalculation(p.dates.FinalInvestmentDecision, fid)
          ? await loadRepricing(p.id!, fid) : null;
        // The canvas seeds from the record it has just patched, so the saved dates.
        const seed = await loadRevenueSeed(p, f.dates);
        fabricFailed = seed.fabricFailed;
        return planSaveMilestones({
          project: p, form: f, language: locale, revenueDraft: seed.draft,
          repricedGenerators: repricing ? repriceGenerators(repricing.generators, repricing.index) : null,
        });
      },
    });
    if (done !== null) { setEdited(null); setDirtyKeys([]); setSeedFailed(fabricFailed); }
  };

  /** `pcf_btn_…_Save.OnChange` (Y:4774-4802) — the COD guard, then the save. */
  const onSave = () => {
    if (!project || !saveEnabled) return;
    if (codChangeBlocksSave(
      dirtyKeys.includes("OperationsStartDate"),
      !sameDate(project.dates.OperationsStartDate, form.dates.OperationsStartDate),
      individualVolumes.data,
    )) setCodReview(true);
    else void runSave();
  };
  const onCancel = () => {
    if (!project) return;
    const next = cancelMilestones(project, locale);
    setEdited(next.form);
    setDirtyKeys(next.dirtyKeys);
  };

  const labelFor = (k: DateKey): string => {
    const i = LABEL_INDEX[k];
    return (i === undefined ? undefined : labelsQ.data[i]) ?? milestoneMeta(k).label;
  };

  const loadError = projectQ.error ?? labelsQ.error;
  if (loadError) {
    return (
      <div className={l.page}>
        <EmptyState title={MILESTONES_SCREEN_TEXT.loadFailedTitle} description={MILESTONES_SCREEN_TEXT.loadFailedDescription} />
      </div>
    );
  }
  if (projectQ.isLoading) {
    return <LoadingOverlay mode="inline" label={MILESTONES_SCREEN_TEXT.loading} />;
  }

  const dateField = (k: DateKey) => {
    if (!isMilestoneFieldVisible(k, project?.startCluster)) return null;
    const label = labelFor(k);
    // The error labels' `Visible` reads only the dates, so a New Project shows them too.
    const error = isMilestoneFieldErrorVisible(k, form.dates, project?.startCluster)
      ? MILESTONE_FIELD_ERROR[k] : undefined;
    const recalcSeg = RECALC_SEGMENT[k];
    const isSales = k === "SalesStartDate" || k === "StartCompleted";
    const tall = isSales || k === "EndDate";
    const showRecalc = recalcSeg !== undefined && (isSales || recalcVisible);
    const recalcName = recalcSeg ? butId(recalcSeg) : "";
    return (
      <div key={k} className={mergeClasses(s.row, tall && s.tallRow)}>
        <DateField
          fieldClassName={s.field}
          label={label}
          required
          error={error}
          value={form.dates[k]}
          format={formatOf(k)}
          locale={locale}
          // `DatePicker@0.0.46` with no `Placeholder` shows the control's own "Select a date...".
          placeholder={PLACEHOLDER[k] ?? MILESTONES_MSG.datePlaceholder}
          disabled={!editable}
          onChange={(v) => setDate(k, v ?? "")}
          standard={derived[k]}
          // Editable, a classic picker is the same filled grey box as the modern ones; only
          // `DisplayMode.Disabled` (the locked page) draws it white with the grey outline.
          className={isClassicPicker(k) && !editable
            ? mergeClasses(CLASSIC, s.classicBox, CLASSIC_DISABLED, s.classicDisabled)
            : undefined}
          // The canvas `AccessibleLabel` is the control name (rule 16); the caption is the Field label.
          name={id(SEGMENT[k])}
        />
        {showRecalc ? (
          <Button
            className={s.recalc}
            appearance="secondary"
            icon={<CalendarAddRegular />}
            // `DisplayMode`: only the predecessor date — the canvas has no lock gate here.
            disabled={saving || !isRecalculateEnabled(k as RecalcKey, form.dates)}
            onClick={() => recalc(k as RecalcKey)}
            // The canvas `AccessibleLabel` is the control name; the button has no caption.
            aria-label={recalcName}
            data-testid={recalcName}
          />
        ) : recalcVisible ? (
          // Project Start / Cluster 1 have no button but the canvas still subtracts its 32 px
          // (`Width: =Parent.Width-Self.X*2-but_…_Cluster2.Width`), so every picker is as wide.
          <span className={s.recalcSpacer} aria-hidden />
        ) : null}
      </div>
    );
  };

  const createdOn = formatShortDateTime24(project?.createdOn ?? null, locale);
  const modifiedOn = formatShortDateTime24(project?.modifiedOn ?? null, locale);

  return (
    <div className={mergeClasses(l.page, s.fixedPage)}>
      <WriteFeedback progress={writes.progress} error={writes.error} success={writes.success} testIdPrefix="milestones" />
      {seedFailed ? (
        <MessageBar intent="warning" data-testid="milestones-revenue-seed-fabric-failed">
          <MessageBarBody>{MILESTONES_SCREEN_TEXT.revenueSeedFabricFailed}</MessageBarBody>
        </MessageBar>
      ) : null}

      <div className={mergeClasses(s.body, l.fieldLabels, noInvalidOutline.root, requiredMark.root)}>
        {locked ? (
          <div className={s.lock} data-testid="con_Milestones_Page_LockMessage">
            {/* `icon_milestones_lock` — Classic `Icon.Lock` in a 20 × 20 box; Fluent's glyph needs 24 px to match it. */}
            <LockClosedRegular aria-hidden fontSize={24} color={LOCK_TEXT} />
            <div className={s.lockText}>
              <Text className={s.lockLine}>{MILESTONES_MSG.lockMessage}</Text>
              <Text className={s.lockLine}>{MILESTONES_MSG.lockSection}</Text>
            </div>
          </div>
        ) : null}

        <div className={s.card}>
          <div className={s.columns}>
            <div className={mergeClasses(s.column, s.chainColumn)}>{COLUMN_1.map(dateField)}</div>
            <div className={mergeClasses(s.column, s.chainColumn)}>{COLUMN_2.map(dateField)}</div>
          </div>

          <div className={s.separator} role="separator" />

          <div className={s.columns}>
            <div className={s.column}>{dateField("SalesStartDate")}</div>
            <div className={s.column}>{dateField("StartCompleted")}</div>
          </div>

          <div className={s.columns}>
            {/* `…_Sales_FillerCont2` keeps the farmdown card in the second column. */}
            <div className={s.column} />
            <div className={mergeClasses(s.column, s.row, s.tallRow)}>
              <Field
                className={mergeClasses(s.field, skin.field)}
                label={{
                  children: (
                    <>
                      {milestoneMeta("ShareOfFarmdown").label}
                      <Tooltip
                        content={<span className={s.multiline}>{MILESTONES_MSG.farmdownInfo}</span>}
                        relationship="description"
                        withArrow
                      >
                        <Button
                          className={s.infoIcon}
                          appearance="transparent"
                          icon={<InfoRegular />}
                          disabled={locked}
                          aria-label={MILESTONES_MSG.farmdownInfo}
                          data-testid="Icon1_2"
                        />
                      </Tooltip>
                    </>
                  ),
                }}
                required
                validationState={farmdownMessage ? "error" : "none"}
                validationMessage={farmdownMessage ?? undefined}
              >
                <Input
                  appearance={FIELD_APPEARANCE}
                  value={form.shareOfFarmdown}
                  disabled={!editable}
                  onChange={(_, d) => {
                    setEdited({ ...form, shareOfFarmdown: d.value, isStandardShareOfFarmdown: false });
                    markFarmdownDirty();
                  }}
                  className={controlClass(
                    editable ? "edit" : "disabled",
                    editable
                      ? standardClass(derived.ShareOfFarmdown)
                      : mergeClasses(CLASSIC, s.classicBox, CLASSIC_DISABLED, s.classicDisabled),
                  )}
                  aria-label="txt_Milestones_DisplayProject_Body_General_Content_Share_of_Farmdown"
                  data-testid="txt_Milestones_DisplayProject_Body_General_Content_Share_of_Farmdown"
                />
              </Field>
              <Tooltip content={MILESTONES_MSG.farmdownReset} relationship="label" withArrow>
                <Button
                  className={s.resetIcon}
                  appearance="transparent"
                  icon={<ArrowClockwiseRegular />}
                  disabled={!editable}
                  onClick={() => {
                    setEdited({ ...form, ...resetShareOfFarmdown(locale) });
                    markFarmdownDirty();
                  }}
                  aria-label="but_Milestones_DisplayProject_Body_General_Content_farmdown_Reset"
                  data-testid="but_Milestones_DisplayProject_Body_General_Content_farmdown_Reset"
                />
              </Tooltip>
            </div>
          </div>

          <div className={s.separator} role="separator" />

          <div className={s.columns}>
            <div className={mergeClasses(s.column, s.row, s.tallRow)}>
            <Field className={mergeClasses(s.field, skin.field)} label={MILESTONES_MSG.operationalLifetime}>
              <div className={s.lifetime}>
                {/* `DisplayMode: =DisplayMode.View` — the text in black in the grey box. */}
                <Input
                  appearance={FIELD_APPEARANCE}
                  className={controlClass("view")}
                  readOnly
                  aria-readonly="true"
                  value={lifetime.yearsText}
                  aria-label="txt_Milestones_DisplayProject_Body_General_Content_Years"
                  data-testid="txt_Milestones_DisplayProject_Body_General_Content_Years"
                />
                <Input
                  appearance={FIELD_APPEARANCE}
                  className={controlClass("view")}
                  readOnly
                  aria-readonly="true"
                  value={lifetime.monthsText}
                  aria-label="txt_Milestones_DisplayProject_Body_General_Content_Months"
                  data-testid="txt_Milestones_DisplayProject_Body_General_Content_Months"
                />
              </div>
            </Field>
            </div>
            <div className={s.column}>{dateField("EndDate")}</div>
          </div>
        </div>
      </div>

      {/* `con_Milestones_DisplayProject_Body_Content_Buttom`: the record stamp, then the buttons (End). */}
      <div className={mergeClasses(l.bottomBar, s.footer)}>
        <div className={s.audit}>
          <div className={s.auditBlock}>
            <span className={s.auditLabel} data-testid={`${FOOTER}Creator_1`}>{MILESTONES_MSG.createdBy}</span>
            <span data-testid={`${FOOTER}CreatorName_2`}>{project?.createdByName ?? ""}</span>
            {/* `…_CreatorOn_1` ("Created:") is `Visible: false`; the date sits under the name. */}
            <span className={s.auditDate} data-testid={`${FOOTER}CreatorName_3`}>{createdOn}</span>
          </div>
          <div className={s.auditBlock}>
            <span className={s.auditLabel} data-testid={`${FOOTER}Editor_1`}>{MILESTONES_MSG.modifiedBy}</span>
            <span data-testid={`${FOOTER}EditorName_1`}>{project?.modifiedByName ?? ""}</span>
            {/* `…_EditOn_1` ("Modified:") is `Visible: false`. */}
            <span className={s.auditDate} data-testid={`${FOOTER}EditDate_1`}>{modifiedOn}</span>
          </div>
        </div>
        <div className={s.buttons}>
          {recalculating.data ? (
            <Text data-testid="Icon3">
              <ArrowClockwiseRegular aria-hidden /> {MILESTONES_MSG.recalculating}
            </Text>
          ) : null}
          {problems.length > 0 ? (
            <>
              <Tooltip
                content={<span className={s.multiline}>{requiredFieldsContent(validation)}</span>}
                relationship="description"
                withArrow
              >
                <Button
                  className={s.required}
                  appearance="transparent"
                  icon={<InfoRegular />}
                  aria-label={MILESTONES_MSG.requiredFields}
                  data-testid="ibtn_GeneralData_DisplayProject_Body_Buttons_Requered_Fileds_1"
                />
              </Tooltip>
              <Text
                className={s.requiredText}
                data-testid="lbl_GeneralData_DisplayProject_Body_General_Content_ProjectName_ErrorMessage_5"
              >
                {MILESTONES_MSG.requiredFields}
              </Text>
            </>
          ) : null}
          <Tooltip content={MILESTONES_MSG.saveTooltip} relationship="description" withArrow>
            <Button
              appearance="subtle"
              className={s.saveButton}
              icon={<CheckmarkRegular />}
              disabled={!saveEnabled}
              onClick={onSave}
              aria-label="pcf_btn_Milestones_DisplayProject_Body_Buttons_Save"
              data-testid="pcf_btn_Milestones_DisplayProject_Body_Buttons_Save"
            >
              {MILESTONES_MSG.save}
            </Button>
          </Tooltip>
          <Tooltip content={MILESTONES_MSG.cancelTooltip} relationship="description" withArrow>
            <Button
              appearance="subtle"
              icon={<DismissRegular />}
              className={s.cancelButton}
              disabled={saving || dirtyKeys.length === 0}
              onClick={onCancel}
              aria-label="pcf_btn_Milestones_DisplayProject_Body_Buttons_Reset"
              data-testid="pcf_btn_Milestones_DisplayProject_Body_Buttons_Reset"
            >
              {MILESTONES_MSG.cancel}
            </Button>
          </Tooltip>
        </div>
      </div>

      <ConfirmDialog
        open={codReview}
        title={MILESTONES_MSG.codReviewTitle}
        description={MILESTONES_MSG.codReviewDescription}
        confirmText={MILESTONES_MSG.codReviewConfirm}
        cancelText={MILESTONES_MSG.cancel}
        onConfirm={() => { setCodReview(false); void runSave(); }}
        onCancel={() => setCodReview(false)}
      />
      {/* `cmp_PopUp_Leave_…_Confirmation` — the shared leave guard (D35, PO X1). */}
      <UnsavedChangesGuard when={shouldConfirmLeave(dirtyKeys)} dialog={LEAVE_DIALOG} />
    </div>
  );
}
