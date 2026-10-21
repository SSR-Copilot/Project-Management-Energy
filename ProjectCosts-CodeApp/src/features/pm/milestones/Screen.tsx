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
  Button, Field, Input, MessageBar, MessageBarBody, Text, Tooltip, makeStyles, mergeClasses,
} from "@fluentui/react-components";
import {
  ArrowClockwiseRegular, CalendarAddRegular, CheckmarkRegular, DismissRegular, InfoRegular,
  LockClosedRegular,
} from "@fluentui/react-icons";
import {
  ConfirmDialog, DateField, EmptyState, FIELD_APPEARANCE, LoadingOverlay, UnsavedChangesGuard, WriteFeedback,
  useFieldControlClass, useFieldSkin, useStandardValueClass,
} from "@/components";
import { DATE_PICKER_FORMAT, MODERN_DATE_PICKER_FORMAT, type CanvasDateFormat } from "@/domain/canvasDate";
import { useSession } from "@/app/SessionContext";
import { palette, space } from "@/theme/tokens";
import { CANVAS_TEXT, usePmLayout } from "@/features/pm/general-data/pmLayout";
import { stepLogText } from "@/features/pm/general-data/rules";
import {
  MILESTONES_MSG, MILESTONES_SCREEN_TEXT, MILESTONE_FIELD_ERROR, cancelMilestones,
  canSaveMilestones, classifyDerivedMilestones, codChangeBlocksSave, editMilestone,
  emptyMilestoneDates, farmdownError, formatShortDateTime24, initialForm, invalidMessages,
  isMilestoneFieldErrorVisible, isMilestoneFieldVisible, isPageLocked, isRecalculateEnabled,
  isRecalculateVisible, milestoneMeta, needsPlantCostRecalculation, nextDirtyKeys,
  operationalLifetime, planSaveMilestones, recalculateMilestone, repriceGenerators,
  requiredFieldsContent, resetShareOfFarmdown, revenueSeedWouldRun, sameDate, validateMilestones,
  LEAVE_DIALOG, shouldConfirmLeave,
  type MilestoneKey, type MilestonesForm, type RecalcKey,
} from "./rules";
import {
  loadRepricing, useIndividualVolumeContractCount, useMilestoneAssumption, useMilestoneLabels,
  useMilestoneProject, useMilestoneWrites, useRecalculationRunning, useRevenueRowCount,
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

const COLUMN_1: DateKey[] = [
  "StartDate", "FeasibilityStudies", "ProjectDevelopmentStarted", "ApplicationSubmitted",
];
const COLUMN_2: DateKey[] = [
  "LegallyBindingPermits", "FinalInvestmentDecision", "Construction", "OperationsStartDate",
];

const EMPTY_FORM: MilestonesForm = {
  dates: emptyMilestoneDates, standardAssumption: {}, shareOfFarmdown: "",
  isStandardShareOfFarmdown: false,
};

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
  body: { display: "flex", flexDirection: "column", paddingLeft: "10px", paddingTop: "10px", paddingBottom: space.m },
  /** `con_Milestones_Page_LockMessage` — Fill RGB(89,89,89), MinHeight 50, PaddingLeft 20, LayoutGap 10. */
  lock: {
    display: "flex", alignItems: "center", columnGap: "10px", alignSelf: "flex-start",
    width: "760px", maxWidth: "100%", boxSizing: "border-box",
    minHeight: "50px", paddingLeft: "20px",
    backgroundColor: LOCK_FILL, color: LOCK_TEXT,
  },
  /** `con_Milestones_pagelock_section` — Padding 8. */
  lockText: {
    display: "flex", flexDirection: "column", gap: space.xxs, color: LOCK_TEXT,
    paddingTop: "8px", paddingBottom: "8px", paddingLeft: "8px", paddingRight: "8px",
  },
  lockLine: { color: LOCK_TEXT },
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
   * `pcf_btn_…_Save` / `…_Reset` — PowerCAT `Icon` with `IconType: ActionButton` (96 × 32): a
   * transparent text button with its icon (CheckMark / Cancel), as the product owner's canvas
   * screenshot shows; Save first, then Cancel, at the bar's right end.
   */
  actionButton: { minWidth: "96px", height: "32px" },
  auditLabel: { fontWeight: 600 },
  /** `con_…_Content_Buttons` — fills the bar, LayoutJustifyContent End, LayoutGap 20, PaddingRight 10. */
  buttons: {
    flex: 1, display: "flex", alignItems: "center", justifyContent: "flex-end",
    columnGap: "20px", flexWrap: "wrap", paddingRight: "10px",
  },
  required: { color: palette.Error },
  requiredText: { color: palette.Error, fontSize: "10.67px" },
  multiline: { whiteSpace: "pre-line" },
});

export default function MilestonesScreen() {
  const s = useStyles();
  const l = usePmLayout();
  const skin = useFieldSkin();
  const controlClass = useFieldControlClass();
  /* A date derived from a standard assumption renders italic theme-blue (GUIDE p16, rule 20). */
  const standardClass = useStandardValueClass();
  const { projectId, locale } = useSession();

  const projectQ = useMilestoneProject(projectId);
  const labelsQ = useMilestoneLabels();
  const project = projectQ.data;
  const assumptionQ = useMilestoneAssumption(project?.countryId, project?.technologyValue);
  const individualVolumes = useIndividualVolumeContractCount(projectId);
  const revenueRows = useRevenueRowCount(projectId);
  const recalculating = useRecalculationRunning(projectId);
  const writes = useMilestoneWrites(projectId);

  const persisted = useMemo(() => (project ? initialForm(project, locale) : EMPTY_FORM), [project, locale]);
  const [edited, setEdited] = useState<MilestonesForm | null>(null);
  const [dirtyKeys, setDirtyKeys] = useState<MilestoneKey[]>([]);
  const [codReview, setCodReview] = useState(false);
  const form = edited ?? persisted;

  const saving = writes.progress !== null;
  const locked = isPageLocked(project);
  /** `DisplayMode: If(con_Milestones_Page_LockMessage.Visible, Disabled, Edit)`. */
  const editable = !locked && !saving;
  const validation = validateMilestones(form.dates, project?.startCluster, form.shareOfFarmdown, locale);
  const problems = project ? invalidMessages(validation) : [];
  const derived = classifyDerivedMilestones(form);
  const lifetime = operationalLifetime(form.dates.OperationsStartDate, form.dates.EndDate);
  const recalcVisible = isRecalculateVisible(project?.technology);
  const farmdownMessage = project ? farmdownError(form.shareOfFarmdown, locale) : null;
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
    const done = await writes.run({
      progress: MILESTONES_MSG.saving,
      // `Notify(Concat(colProcessingSteps, $"{Value} {Char(10)}"), Success)` (Y:501-508).
      success: (plan) => stepLogText(plan.log),
      plan: async () => {
        const repricing = fid && needsPlantCostRecalculation(p.dates.FinalInvestmentDecision, fid)
          ? await loadRepricing(p.id!, fid) : null;
        return planSaveMilestones({
          project: p, form: f, language: locale, revenueDraft: null,
          repricedGenerators: repricing ? repriceGenerators(repricing.generators, repricing.index) : null,
        });
      },
    });
    if (done !== null) { setEdited(null); setDirtyKeys([]); }
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
    const error = project && isMilestoneFieldErrorVisible(k, form.dates, project.startCluster)
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
          placeholder={PLACEHOLDER[k]}
          disabled={!editable}
          onChange={(v) => setDate(k, v ?? "")}
          standard={derived[k]}
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
    <div className={l.page}>
      <WriteFeedback progress={writes.progress} error={writes.error} success={writes.success} testIdPrefix="milestones" />
      {revenueSeedWouldRun(project, revenueRows.data) ? (
        <MessageBar intent="info" data-testid="milestones-revenue-seed-not-connected">
          <MessageBarBody>{MILESTONES_SCREEN_TEXT.revenueSeedNotConnected}</MessageBarBody>
        </MessageBar>
      ) : null}

      <div className={mergeClasses(s.body, l.fieldLabels)}>
        {locked ? (
          <div className={s.lock} data-testid="con_Milestones_Page_LockMessage">
            <LockClosedRegular aria-hidden fontSize={20} color={LOCK_TEXT} />
            <div className={s.lockText}>
              <Text className={s.lockLine}>{MILESTONES_MSG.lockMessage}</Text>
              <Text className={s.lockLine}>{MILESTONES_MSG.lockSection}</Text>
            </div>
          </div>
        ) : null}

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
                className={controlClass(editable ? "edit" : "disabled", standardClass(derived.ShareOfFarmdown))}
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

      {/* `con_Milestones_DisplayProject_Body_Content_Buttom`: the record stamp, then the buttons (End). */}
      <div className={l.bottomBar}>
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
              className={s.actionButton}
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
              className={s.actionButton}
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
