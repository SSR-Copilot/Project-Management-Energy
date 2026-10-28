/**
 * Project Production Screen — composition only (connected 19 Oct 2026, D28).
 *
 * Canvas screen: `Project Production Screen.pa.yaml` (PM app). Every decision lives in `rules.ts`,
 * every query and write in `hooks.ts`.
 *
 * Structure, matching the canvas containers:
 *   command bar    `pcf_ProjectRevenues_Content_ContractCommandBar_1` (in the header slot)
 *   page lock      `con_Milestones_Page_LockMessage_2`
 *   summary form   `txt_Production_DisplayProject_Body_Form_*` — the project's STORED roll-up
 *   record list    `gal_Production_Items` — one collapsible card per `Energy Yields` row
 *   right panel    `con_AddEditWTG_ProjectProd` / `con_AddEditPV_ProjectProd` as ONE panel
 *                  parameterised by technology, with the Seasonality and Negative Prices columns
 *   dialogs        `cmp_Delete_ProjectProd`, `cmp_ActivateDeactivate_ProjectProd`,
 *                  `con_Main_PopUp_Common_Generators_PreventTotalCapacity_Information_1`,
 *                  `cmp_PopUp_LoadingSpinner_Production` (`WriteFeedback`)
 */
import { useState } from "react";
import {
  Button, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle,
  Field, Input, MessageBar, MessageBarBody, MessageBarTitle, Switch, Text, Tooltip,
  makeStyles, mergeClasses, tokens,
} from "@fluentui/react-components";
import {
  ArrowResetRegular, DismissRegular, InfoRegular, LockClosedRegular,
  RadioButtonFilled, RadioButtonRegular,
} from "@fluentui/react-icons";
import {
  Choices, type Command, CommandBar, ConfirmDialog, EmptyState, FormPanel, LoadingOverlay,
  FIELD_APPEARANCE, NumericField, PanelButtons, ReadOnlyField, TextField, UnsavedChangesGuard, WriteFeedback,
  useFieldControlClass, useFieldSkin, useStandardValueClass,
  ExpandChevron, HINTS,
} from "@/components";
import { useSession } from "@/app/SessionContext";
import { CHOICE_PRODUCTION } from "@/data/dataverseNames";
import { media, palette, space } from "@/theme/tokens";
import {
  ACCESSIBLE_LABEL, COMMAND_BAR_LABEL, COMMAND_ICON, DELETE_DIALOG, MAX_LENGTH, MSG, PAGE_LOCK_TITLE,
  PREVENT_LAST_YIELD_DIALOG, PRODUCTION_COMMAND_KEYS, PRODUCTION_SCREEN_TEXT, SUMMARY_LABELS, UI,
  applyMonthEdit, applyReductionEdit, assessmentLabel, blocksLastYieldRemoval, buildNegativePriceRows,
  buildSeasonalityRows, buildYieldPayload, canSaveYield, changeAllocationMode, changeLossesMode,
  changeUncertaintyMode, commandBarState, deriveYieldView, detailValues, fieldModes, fmtPercentTotal,
  formFromRow, negativeRowsForEdit, newYieldForm, onCardHeader, pageLock, panelTitle, productionRowLabel,
  productionStatusLabel, resetNegativePriceRow, seasonalityFromStored, seasonalityTotal, seasonalityTotalError,
  selectedYield, statusDialog, summaryValues, validateCellPercent, yearOf, yieldErrors,
  type AllocationInputMode, type EnergyYieldRow, type LossesInputMode, type NegativePriceRow,
  LEAVE_DIALOG, shouldConfirmLeave,
  type ProductionCommandKey, type SeasonalityRow, type Technology, type UncertaintyInputMode, type YieldFormState,
} from "./rules";
import {
  CAN_EDIT_SELECTED_PROJECT, useEnergyYields, useProductionProject, useProductionWrites, useRevenueAssumptions,
  useStoredNegativePrices, useStoredSeasonality,
} from "./hooks";

/* ────────────────────────────────────────────────────────────────── styles */

// Layout transcribed from `con_Production_DisplayProject_Body_RightContent` and the two
// `con_AddEdit{WTG|PV}_ProjectProd` panels (UI layout pass, 20 Oct 2026). The shell's content
// area scrolls, so the page grows with its content and never clips itself to the viewport.
const useStyles = makeStyles({
  // The command bar row: a thin rule under it on the live screen.
  // The command bar's first icon starts on the left edge of the content under it (PO, 21 Oct 2026); `CommandBar` has no inset of its own. Over "Gross Yield" (the yield grid's 20 px inset).
  commandRow: {
    paddingLeft: "20px", borderBottomWidth: "1px", borderBottomStyle: "solid", borderBottomColor: palette.Grayscale30,
  },
  // The right content: a white vertical autolayout, no padding and no gap.
  page: { display: "flex", flexDirection: "column", flex: "1 0 auto", minWidth: 0, backgroundColor: palette.white },
  // `con_Milestones_Page_LockMessage_2`: Fill RGBA(89,89,89,1), PaddingLeft 20, white text.
  lockBanner: { backgroundColor: "rgb(89, 89, 89)", color: palette.white, paddingLeft: "20px", "& svg": { color: palette.white } },
  lockList: { display: "flex", flexDirection: "column", gap: space.xxs },
  // `con_Production_DisplayProject_Body_Form_FirstRow` / `_ThirdRow`: horizontal, wrapping,
  // PaddingTop 20, `Min(Parent.Width, 1200)` wide.
  summaryRow: { display: "flex", flexWrap: "wrap", width: "100%", maxWidth: "1200px", paddingTop: "20px", boxSizing: "border-box" },
  // Each tile: a 300 x 74 ManualLayout; label and input at X = 20, `Parent.Width - 40` wide; the
  // label Semibold, the input right-aligned (`Align.Right`).
  summaryField: {
    flex: "0 0 300px", minHeight: "74px", paddingLeft: "20px", paddingRight: "20px", boxSizing: "border-box",
    "& label": { fontWeight: tokens.fontWeightSemibold },
    "& input": { textAlign: "right" },
  },
  // `gal_Production_Items`: TemplatePadding 0, so the cards touch; each is `Parent.Width - 10` wide.
  list: { display: "flex", flexDirection: "column", minWidth: 0, paddingTop: "20px" },
  card: { width: "calc(100% - 10px)", backgroundColor: palette.white },
  /** An expanded record is a raised card on the live screen (DropShadow, 4 px radius). */
  cardOpen: {
    borderRadius: "4px", marginTop: "4px", marginBottom: "8px",
    boxShadow: "0 1.6px 3.6px rgba(0, 0, 0, 0.13), 0 0.3px 0.9px rgba(0, 0, 0, 0.11)",
  },
  // `con_Production_CardHeader`: 42 high, Fill #fdffff, a 1 px Grayscale20 bottom line (`shp_Production_BottomLine`).
  cardHeader: {
    display: "flex", alignItems: "center", height: "42px", backgroundColor: "#fdffff",
    borderBottomWidth: "1px", borderBottomStyle: "solid", borderBottomColor: palette.Grayscale20,
  },
  // `btn_Production_CardHeader_TransparentButton` fills the header; the radio image sits at X = 10
  // (18 px) and the label at X = 36, `gblAppSizes.Font.Medium` (11 pt).
  cardSelect: {
    display: "flex", alignItems: "center", gap: "8px", flexGrow: 1, minWidth: 0, height: "42px",
    justifyContent: "flex-start", paddingLeft: "10px", paddingRight: 0, fontWeight: tokens.fontWeightRegular,
    // The selection radio is the theme blue (Fluent Radio), as on the live screen.
    "& svg": { fontSize: "18px", color: palette.themePrimary },
  },
  cardLabel: {
    flexGrow: 1, minWidth: 0, textAlign: "left", fontSize: "14.67px",
    overflowX: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
  },
  cardLabelSelected: { fontWeight: tokens.fontWeightSemibold },
  // `con_Production_Status` / `con_Production_InternalExternal`: 72 x 24 (`Max(label 72, 50)`), a
  // 1 px border, the label `gblAppSizes.Font.ExtraSmall` (9 pt) Grayscale00, centred. The
  // Internal/External chip is 20 left of the status chip; the status chip ends 10 + 40 from the edge.
  chips: { display: "flex", alignItems: "center", gap: "20px", flexShrink: 0, marginRight: "10px" },
  chip: {
    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
    // Rounded pills on the live screen (`Radius*: 34`); a little wider than the 72 minimum.
    minWidth: "90px", height: "24px", paddingLeft: "12px", paddingRight: "12px", borderRadius: "34px",
    boxSizing: "border-box", fontSize: "12px", color: palette.Grayscale00,
    borderTopWidth: "1px", borderRightWidth: "1px", borderBottomWidth: "1px", borderLeftWidth: "1px",
    borderTopStyle: "solid", borderRightStyle: "solid", borderBottomStyle: "solid", borderLeftStyle: "solid",
    borderTopColor: palette.Grayscale10, borderRightColor: palette.Grayscale10,
    borderBottomColor: palette.Grayscale10, borderLeftColor: palette.Grayscale10,
  },
  // Status: Fill SuccessLight / Grayscale40, border Green / Grayscale10 (`ThisItem.Status = 0`).
  statusChip: { backgroundColor: palette.Grayscale40 },
  statusChipActive: {
    backgroundColor: palette.SuccessLight,
    borderTopColor: palette.Green, borderRightColor: palette.Green, borderBottomColor: palette.Green, borderLeftColor: palette.Green,
  },
  // Assessment: Fill hoverButton / Grayscale20, border Green / Grayscale10 (`= 300`, External).
  assessmentChip: { backgroundColor: palette.Grayscale20 },
  assessmentChipExternal: {
    backgroundColor: palette.hoverButton,
    borderTopColor: palette.Green, borderRightColor: palette.Green, borderBottomColor: palette.Green, borderLeftColor: palette.Green,
  },
  // `ico_Production_CardHeader_Down` / `_Up`: 40 x 30 at the right edge.
  fold: { flex: "0 0 40px", minWidth: "40px", height: "30px" },
  // `con_ProductionDeatils_VerticalMain` (PaddingLeft 20, PaddingTop 10) holding
  // `con_ProductionDetails_VerticalAdjust`: a wrapping row of four 260-wide vertical columns.
  details: { display: "flex", flexWrap: "wrap", alignItems: "flex-start", paddingLeft: "20px", paddingTop: "10px", paddingBottom: "10px" },
  // `con_ProductionDetails_Vertical1..4`: vertical, LayoutGap 5; label and input `Parent.Width - 20`.
  // On the live screen the four columns share the card width equally.
  detailColumn: { display: "flex", flexDirection: "column", gap: "5px", flex: "1 1 0", minWidth: "200px", paddingRight: "20px", boxSizing: "border-box" },
  // Each label Semibold `gblAppSizes.Font.Medium`; the numeric inputs right-aligned (`Align.Right`).
  detailField: {
    width: "100%",
    "& label": { fontWeight: tokens.fontWeightSemibold, fontSize: "14.67px" },
  },
  alignRight: { "& input": { textAlign: "right" } },
  // `con_ProductionData{WTG|PV}_RightPanelBodyParent`: horizontal, the fields column, then the
  // Seasonality and Negative Prices columns when their toggles are on.
  // The side columns always open to the RIGHT of the fields, and the panel widens to hold them
  // (PO, 21 Oct 2026: they must never drop underneath). They only stack on a phone-sized window.
  columns: { display: "flex", alignItems: "flex-start", [media.belowMd]: { flexDirection: "column" } },
  // `con_ProductionData{WTG|PV}_Fields`: vertical, LayoutGap 2, padding 5; 450 wide
  // (`gblAppSizes.RightPanel.MinWidth`), 280 once a side column shows.
  column: {
    display: "flex", flexDirection: "column", gap: "2px", flex: "0 0 450px", maxWidth: "100%", minWidth: 0,
    paddingTop: "5px", paddingBottom: "5px", paddingLeft: "5px", paddingRight: "5px", boxSizing: "border-box",
    // Each field container puts caption and control at `gblAppSizes.Position.X` = 20, which the
    // shared panel body padding (20) already gives; a text input is `Parent.Width/2 + X` wide.
    "& .fui-Input": { width: "calc(50% + 20px)", maxWidth: "100%" },
  },
  columnNarrow: { flex: "0 0 280px" },
  // `con_ProductionData{WTG|PV}_SeasonalityYeildRightPanelBody` / `_NegativePriceRightPanelBody`:
  // 360 wide, vertical, items centred, padding 5.
  sideColumn: {
    display: "flex", flexDirection: "column", alignItems: "center", gap: "2px", flex: "1 1 360px", maxWidth: "360px", minWidth: "260px",
    paddingTop: "5px", paddingBottom: "5px", paddingLeft: "5px", paddingRight: "5px", boxSizing: "border-box",
  },
  // The 36-high header row (`con_ProductionWTGSeoasonalityHeader`), over the 330-wide rows.
  columnHead: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: space.s, width: "100%", maxWidth: "330px", height: "36px" },
  columnTitle: { fontWeight: tokens.fontWeightSemibold },
  // One gallery row, 330 wide, padding 5/10: the 100-wide month, then the 180-wide value 8 to its right.
  cellRow: {
    // Fluid, so a Negative Prices row (year 100 + value + the 32-px reset icon) never runs past
    // the column under the panel's scroll bar (PO, 21 Oct 2026); it used to be a fixed 330.
    display: "flex", alignItems: "flex-end", gap: "8px", width: "100%", maxWidth: "350px", boxSizing: "border-box",
    paddingTop: "5px", paddingBottom: "5px", paddingLeft: "10px", paddingRight: "10px",
  },
  cellMonth: { flex: "0 1 100px", minWidth: "64px", paddingBottom: space.xs },
  cellValue: { flex: "1 1 180px", minWidth: "120px", maxWidth: "180px" },
  cellReset: { flex: "0 0 auto" },
  total: {
    display: "flex", justifyContent: "space-between", fontWeight: tokens.fontWeightBold,
    width: "100%", maxWidth: "330px", paddingLeft: "10px", paddingRight: "10px", boxSizing: "border-box",
  },
  error: { color: palette.Error, fontSize: tokens.fontSizeBase200 },
  // `InfoButtonCanvas2`: 30 x 30, 10 right of the Irradiation input.
  info: { display: "flex", alignItems: "flex-end", gap: "10px" },
  infoField: { flex: "0 1 calc(50% + 20px)", minWidth: 0, "& .fui-Input": { width: "100%" } },
});

/* ────────────────────────────────────────────────────────────────── helpers */

const ASSESSMENT_OPTIONS = ["Internal", "External"] as const;
const ALLOCATION_INPUT_OPTIONS: readonly AllocationInputMode[] = ["Input Irradiation", "Input Gross Yield"];
const LOSSES_OPTIONS: readonly LossesInputMode[] = ["Input losses", "Input Net Yield p50"];
const UNCERTAINTY_OPTIONS: readonly UncertaintyInputMode[] = ["Input Uncertainty", "Input Net Yield p75/p90"];

/**
 * `con_ProductionData{WTG|PV}_RightPanel.Width` = the fields column (450, or 280 beside a side
 * column) + 360 per visible side column: 450, 640 or 1000. The shared `FormPanel` offers fixed
 * widths only, so the nearest is used: narrow 450, fieldsAndSide 680 and threeColumn 1040 (the canvas width + the body padding).
 */
const panelWidth = (seasonality: boolean, negative: boolean) =>
  seasonality && negative ? "threeColumn" : seasonality || negative ? "fieldsAndSide" : "narrow";

type PanelState = { technology: Technology; editing: EnergyYieldRow | null };
type Confirm = { kind: "delete"; row: EnergyYieldRow } | { kind: "status"; row: EnergyYieldRow } | { kind: "prevent" };

/* ────────────────────────────────────────────────────────────────── screen */

export default function ProductionScreen() {
  const s = useStyles();
  /* The italic "calculated default" treatment of a standard-assumption cell (rule 20). */
  const standardClass = useStandardValueClass();
  const skin = useFieldSkin();
  const controlClass = useFieldControlClass();
  const { projectId, locale } = useSession();
  const lang = locale;

  const projectQ = useProductionProject(projectId);
  const yieldsQ = useEnergyYields(projectId);
  const standard = useRevenueAssumptions().data;
  const writes = useProductionWrites(projectId);
  const project = projectQ.data;
  const yields = yieldsQ.data;

  /** `undefined` = the first row (`First(colEnergyYieldsInProject)`); `null` = nothing selected. */
  const [selectedId, setSelectedId] = useState<string | null | undefined>(undefined);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [panel, setPanel] = useState<PanelState | null>(null);
  const [form, setForm] = useState<YieldFormState>(() => newYieldForm(lang));
  const [seasonEdits, setSeasonEdits] = useState<SeasonalityRow[] | null>(null);
  const [negativeEdits, setNegativeEdits] = useState<NegativePriceRow[] | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);

  const editingId = panel?.editing?.id ?? null;
  const storedSeason = useStoredSeasonality(projectId, editingId);
  const storedNegative = useStoredNegativePrices(projectId, editingId);

  const selected = selectedYield(yields, selectedId);
  const technology: Technology = panel?.technology ?? "WTG";
  const busy = writes.progress !== null;

  /* ── command bar — `commandBarState` is the canvas `Items` table one-for-one. */
  const state = commandBarState({ canEdit: CAN_EDIT_SELECTED_PROJECT, project, selected });
  const commands: Command[] = PRODUCTION_COMMAND_KEYS
    .filter((key) => state[key].visible)
    .map((key) => ({ key, label: state[key].label, icon: COMMAND_ICON[key], enabled: state[key].enabled && !busy }));

  const openPanel = (tech: Technology, row: EnergyYieldRow | null) => {
    writes.clear();
    setPanel({ technology: tech, editing: row });
    setForm(row ? formFromRow(row, tech, lang) : newYieldForm(lang));
    setSeasonEdits(null);
    setNegativeEdits(null);
  };

  const onCommand = (key: string) => {
    const k = key as ProductionCommandKey;
    if (k === "newProductionWTG") openPanel("WTG", null);
    else if (k === "newProductionPV") openPanel("PV", null);
    else if (!selected) return;
    else if (k === "editProductionWTG") openPanel("WTG", selected);
    else if (k === "editProductionPV") openPanel("PV", selected);
    else if (k === "activateProdItem") setConfirm({ kind: "status", row: selected });
    else if (blocksLastYieldRemoval({ project, selected, yields })) setConfirm({ kind: "prevent" });
    else setConfirm(k === "deleteProductionItem" ? { kind: "delete", row: selected } : { kind: "status", row: selected });
  };

  /** The panel's close X and Cancel close at once and clear the selection (`btn_Seasonality_NegativePrice_Reset_Hidden`). */
  const closePanel = () => { setPanel(null); setSelectedId(null); };

  const set = <K extends keyof YieldFormState>(field: K, value: YieldFormState[K]) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  /* ── the panel's derived fields, modes and errors. */
  const view = deriveYieldView(form, technology, { plantPvCapacity: project?.plantPvCapacity ?? null, lang });
  const modes = fieldModes(form, technology, panel?.editing != null);
  const errors = yieldErrors(view, form, technology, lang);

  const seasonRows: SeasonalityRow[] = seasonEdits
    ?? (panel?.editing ? seasonalityFromStored(storedSeason.data, lang) : buildSeasonalityRows(standard.seasonality, technology, lang));
  const negativeRows: NegativePriceRow[] = negativeEdits
    ?? (panel?.editing?.considerNegativePrices
      ? negativeRowsForEdit({ stored: storedNegative.data, standard: standard.negativePrices, technology, cod: project?.cod ?? null, lang })
      : []);
  const storedLoading = panel?.editing != null && (storedSeason.isLoading || storedNegative.isLoading);

  const saveable = panel !== null && project !== null && !storedLoading && !busy
    && canSaveYield({ form, view, technology, seasonality: seasonRows, negativePrices: negativeRows, lang });

  const toggleSeasonality = (on: boolean) => {
    set("considerSeasonality", on);
    // `OnCheck` seeds from the standard (discarding the stored months); `OnUncheck` clears.
    setSeasonEdits(on ? buildSeasonalityRows(standard.seasonality, technology, lang) : []);
  };
  const toggleNegativePrices = (on: boolean) => {
    set("considerNegativePrices", on);
    const y = yearOf(project?.cod);
    setNegativeEdits(on && y !== null ? buildNegativePriceRows(y, standard.negativePrices, technology, lang) : []);
  };

  const onSave = () => {
    if (!saveable || !panel || !project) return;
    const payload = buildYieldPayload({ form, view, technology, project, lang });
    const request = {
      editing: panel.editing, payload, project,
      seasonality: { on: form.considerSeasonality, rows: seasonRows },
      negativePrices: { on: form.considerNegativePrices, rows: negativeRows },
    };
    // The canvas closes the panel first, then saves behind the spinner (Y:5284).
    closePanel();
    setExpanded(new Set());
    void writes.saveYield(request);
  };

  const onConfirmDelete = (row: EnergyYieldRow) => {
    setConfirm(null);
    void writes.deleteYield(row).then(() => { setSelectedId(undefined); setExpanded(new Set()); });
  };
  const onConfirmStatus = (row: EnergyYieldRow) => {
    setConfirm(null);
    void writes.changeStatus(row).then(() => setExpanded(new Set()));
  };

  /* ── the page lock and the summary. */
  const lockBullets = pageLock(project);
  const locked = lockBullets.length > 0;
  const summary = summaryValues(project, lang);

  const toggleFold = (id: string) => {
    setSelectedId(id);
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const prefix = technology === "PV" ? "ProductionDataPV" : "ProductionDataWTG";
  const loading = projectQ.isLoading || yieldsQ.isLoading;

  if (projectQ.error || yieldsQ.error) {
    return (
      <div className={s.page} data-testid="Project Production Screen">
        <EmptyState title={PRODUCTION_SCREEN_TEXT.loadFailedTitle} description={PRODUCTION_SCREEN_TEXT.loadFailedDescription} />
      </div>
    );
  }

  return (
    <div className={s.page} data-testid="Project Production Screen">
      {/* The canvas command bar sits in the screen BODY (`…_DisplayProject_Body_…CommandBar`), not the header. */}
      <div className={s.commandRow}>
        <CommandBar commands={commands} onCommand={onCommand} ariaLabel={COMMAND_BAR_LABEL} />
      </div>

      <WriteFeedback progress={writes.progress} error={writes.error} success={writes.success} testIdPrefix="production" />

      {locked ? (
        <MessageBar intent="warning" icon={<LockClosedRegular />} className={s.lockBanner} data-testid="con_Milestones_Page_LockMessage_2">
          <MessageBarBody>
            <MessageBarTitle>{PAGE_LOCK_TITLE}</MessageBarTitle>
            <span className={s.lockList}>{lockBullets.map((b) => <span key={b}>{b}</span>)}</span>
          </MessageBarBody>
        </MessageBar>
      ) : null}

      {/* `con_Production_DisplayProject_Body_Form` — the project's stored roll-up, read-only. */}
      <div className={s.summaryRow}>
        <div className={s.summaryField}><ReadOnlyField label={SUMMARY_LABELS.grossYield} value={summary.grossYield}
          testId="txt_Production_DisplayProject_Body_Form_GrossYield" ariaLabel="txt_Production_DisplayProject_Body_Form_GrossYield" /></div>
        <div className={s.summaryField}><ReadOnlyField label={SUMMARY_LABELS.windSpeed} value={summary.windSpeed}
          testId="txt_Production_DisplayProject_Body_Form_WindSpeed" ariaLabel="txt_Production_DisplayProject_Body_Form_WindSpeed" /></div>
        <div className={s.summaryField}><ReadOnlyField label={SUMMARY_LABELS.irradiation} value={summary.irradiation}
          testId="txt_Production_DisplayProject_Body_Form_Irradation" ariaLabel="txt_Production_DisplayProject_Body_Form_Irradation" /></div>
      </div>
      <div className={s.summaryRow}>
        <div className={s.summaryField}><ReadOnlyField label={SUMMARY_LABELS.netP50} value={summary.netP50}
          testId="txt_Production_DisplayProject_Body_Form_NetYield_p50" ariaLabel="txt_Production_DisplayProject_Body_Form_NetYield_p50" /></div>
        <div className={s.summaryField}><ReadOnlyField label={SUMMARY_LABELS.netP75} value={summary.netP75}
          testId="txt_Production_DisplayProject_Body_Form_NetYield_p75" ariaLabel="txt_Production_DisplayProject_Body_Form_NetYield_p75" /></div>
        <div className={s.summaryField}><ReadOnlyField label={SUMMARY_LABELS.netP90} value={summary.netP90}
          testId="txt_Production_DisplayProject_Body_Form_NetYield_p90" ariaLabel="txt_Production_DisplayProject_Body_Form_NetYield_p90" /></div>
      </div>

      {/* `gal_Production_Items` — hidden while the page is locked. */}
      {locked ? null : (
        <div className={s.list} data-testid="gal_Production_Items">
          {yields.map((row) => {
            const open = expanded.has(row.id);
            const isSelected = selected?.id === row.id;
            const assessed = assessmentLabel(row.assessment);
            const d = detailValues(row, lang);
            return (
              <section key={row.id} className={mergeClasses(s.card, open && s.cardOpen)} data-testid="con_Production_MainRow">
                <div className={s.cardHeader}>
                  {/* `btn_Production_CardHeader_TransparentButton` selects only (Y:2341). */}
                  <Button appearance="transparent" className={s.cardSelect}
                    aria-label="btn_Production_CardHeader_TransparentButton" aria-pressed={isSelected}
                    data-testid="btn_Production_CardHeader_TransparentButton"
                    onClick={() => setSelectedId(onCardHeader(selected?.id ?? null, row.id))}>
                    {/* `img_Production_CardHeader_RadioSelection` — decorative; the button carries the selection (aria-pressed). */}
                    <span aria-hidden>
                      {isSelected ? <RadioButtonFilled /> : <RadioButtonRegular />}
                    </span>
                    <span className={mergeClasses(s.cardLabel, isSelected && s.cardLabelSelected)} data-testid="lbl_Production_CardHeader_LabelWithDescription">
                      {productionRowLabel(row.type, row.description)}
                    </span>
                  </Button>
                  <span className={s.chips}>
                    {assessed ? <span className={mergeClasses(s.chip, s.assessmentChip, row.assessment === CHOICE_PRODUCTION.yieldAssessment.external && s.assessmentChipExternal)} data-testid="lbl_Production_InternalExternal">{assessed}</span> : null}
                    <span className={mergeClasses(s.chip, s.statusChip, row.status === 0 && s.statusChipActive)} data-testid="lbl_Production_Status">{productionStatusLabel(row.status)}</span>
                  </span>
                  {/* `ico_Production_CardHeader_Down` / `_Up` toggle the fold and select (Y:2381-2440). */}
                  <Button appearance="transparent" className={s.fold} icon={<ExpandChevron open={open} />}
                    aria-label={open ? "ico_Production_CardHeader_Up" : "ico_Production_CardHeader_Down"} aria-expanded={open}
                    data-testid={open ? "ico_Production_CardHeader_Up" : "ico_Production_CardHeader_Down"}
                    onClick={() => toggleFold(row.id)} />
                </div>
                {open ? (
                  <div className={s.details}>
                    {/* `con_ProductionDetails_Vertical1` */}
                    <div className={s.detailColumn}>
                      <div className={s.detailField}><ReadOnlyField label={UI.detail.description} value={d.description} testId="txt_ProductionDetails_Description" ariaLabel="txt_ProductionDetails_Description" /></div>
                      <div className={mergeClasses(s.detailField, s.alignRight)}><ReadOnlyField label={UI.detail.grossYield} value={d.grossYield} testId="txt_ProductionDetails_GrossYield" ariaLabel="txt_ProductionDetails_GrossYield" /></div>
                      <div className={s.detailField}><ReadOnlyField label={UI.detail.considerSeasonality} value={d.considerSeasonality} testId="txt_ProductionDetails_Seasonality" ariaLabel={ACCESSIBLE_LABEL.detailSeasonality} /></div>
                    </div>
                    {/* `con_ProductionDetails_Vertical2` */}
                    <div className={s.detailColumn}>
                      <div className={mergeClasses(s.detailField, s.alignRight)}>
                        <ReadOnlyField label={row.type === CHOICE_PRODUCTION.yieldType.wtg ? UI.detail.windSpeed : UI.detail.irradiation}
                          value={d.windOrIrradiation} testId="txt_ProductionDetails_WindSpeed" ariaLabel="txt_ProductionDetails_WindSpeed" />
                      </div>
                      <div className={mergeClasses(s.detailField, s.alignRight)}><ReadOnlyField label={UI.detail.netP50} value={d.netP50} testId="txt_ProductionDetails_NetYieldP50" ariaLabel="txt_ProductionDetails_NetYieldP50" /></div>
                      <div className={s.detailField}><ReadOnlyField label={UI.detail.considerNegativePrices} value={d.considerNegativePrices} testId="txt_ProductionDetails_NegaticePricesPV" ariaLabel={ACCESSIBLE_LABEL.detailNegativePrices} /></div>
                    </div>
                    {/* `con_ProductionDetails_Vertical3` */}
                    <div className={s.detailColumn}>
                      <div className={mergeClasses(s.detailField, s.alignRight)}><ReadOnlyField label={UI.detail.totalLosses} value={d.totalLosses} testId="txt_ProductionDetails_TotalLosses" ariaLabel="txt_ProductionDetails_TotalLosses" /></div>
                      <div className={mergeClasses(s.detailField, s.alignRight)}><ReadOnlyField label={UI.detail.netP75} value={d.netP75} testId="txt_ProductionDetails_NetYieldP75" ariaLabel="txt_ProductionDetails_NetYieldP75" /></div>
                    </div>
                    {/* `con_ProductionDetails_Vertical4` */}
                    <div className={s.detailColumn}>
                      <div className={mergeClasses(s.detailField, s.alignRight)}><ReadOnlyField label={UI.detail.uncertainty} value={d.uncertainty} testId="txt_ProductionDetails_Uncertainty" ariaLabel="txt_ProductionDetails_Uncertainty" /></div>
                      <div className={mergeClasses(s.detailField, s.alignRight)}><ReadOnlyField label={UI.detail.netP90} value={d.netP90} testId="txt_ProductionDetails_NetYieldP90" ariaLabel="txt_ProductionDetails_NetYieldP90" /></div>
                    </div>
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
      )}

      {/* ONE panel for both technologies — the canvas ships two near-identical copies. */}
      <FormPanel
        open={panel !== null}
        title={panelTitle(technology, panel?.editing ?? null)}
        width={panelWidth(form.considerSeasonality, form.considerNegativePrices)}
        onDismiss={closePanel}
        closeTestId={technology === "PV" ? "pcf_CommandBar_ProductionDataWTG_1" : "pcf_CommandBar_ProductionDataWTG"}
        footer={<PanelButtons onSave={onSave} onCancel={closePanel} disabled={!saveable}
          saveTestId={technology === "PV"
            ? "pcf_btn_GeneratorData_RightPanel_Form_PVModuleType_Buttons_Save"
            : "pcf_btn_GeneratorData_RightPanel_Form_PvModuleType_Buttons_Save_1"}
          saveLabel={technology === "PV" ? "Save" : "pcf_btn_GeneratorData_RightPanel_Form_PvModuleType_Buttons_Save_1"}
          cancelTestId={`btn_Cancel_${prefix}`}
          cancelLabel={technology === "PV" ? "Cancel" : "btn_Cancel_ProductionDataWTG"} />}
      >
        <div className={s.columns}>
          <div className={mergeClasses(s.column, (form.considerSeasonality || form.considerNegativePrices) && s.columnNarrow)}>
            <Choices
              label={UI.panel.assessment}
              name={`rad_${prefix}_Assesment`}
              ariaLabel={technology === "PV" ? ACCESSIBLE_LABEL.pvAssessment : undefined}
              value={assessmentLabel(form.assessment)}
              options={ASSESSMENT_OPTIONS}
              disabled={modes.modesLocked}
              onChange={(v) => set("assessment", v === "External"
                ? CHOICE_PRODUCTION.yieldAssessment.external : CHOICE_PRODUCTION.yieldAssessment.internal)}
            />
            <TextField label={UI.panel.description} value={form.description} required maxLength={MAX_LENGTH.description} counter={false}
              onChange={(v) => set("description", v)} testId={`txt_${prefix}_Description`} ariaLabel={`txt_${prefix}_Description`} />

            {technology === "WTG" ? (
              <>
                <NumericField label={UI.panel.windSpeed} value={form.windSpeed} required maxLength={MAX_LENGTH.windSpeed} counter={false}
                  error={errors.windSpeed ?? undefined}
                  onChange={(v) => set("windSpeed", v)} testId="txt_ProductionDataWTG_WindSpeed" ariaLabel="txt_ProductionDataWTG_WindSpeed" />
                {/* `rad_ProductionDataWTG_Allocation` — always `DisplayMode.View`, Whole plant (Y:3031). */}
                <Choices label="" name="rad_ProductionDataWTG_Allocation" value="Whole plant"
                  options={["Whole plant", "Each turbine"]} disabled onChange={() => undefined} />
              </>
            ) : (
              <>
                <Choices label="" name="rad_ProductionDataPV_Allocation" value={form.allocationInput}
                  options={ALLOCATION_INPUT_OPTIONS} disabled={modes.modesLocked}
                  onChange={(v) => setForm((prev) => changeAllocationMode(prev, v as AllocationInputMode, lang))} />
                <div className={s.info}>
                  <div className={s.infoField}>
                    <NumericField label={UI.panel.irradiation} value={view.irradiation} required={modes.irradiationRequired}
                      disabled={!modes.irradiationEditable} maxLength={MAX_LENGTH.irradiation} counter={false}
                      error={errors.irradiation ?? undefined}
                      onChange={(v) => set("irradiation", v)} testId="txt_ProductionDataPV_Irradation" ariaLabel="txt_ProductionDataPV_Irradation" />
                  </div>
                  <Tooltip content={UI.irradiationInfo} relationship="label" withArrow>
                    <Button appearance="transparent" icon={<InfoRegular />} aria-label={UI.irradiationInfo} data-testid="InfoButtonCanvas2" />
                  </Tooltip>
                </div>
              </>
            )}

            <NumericField label={UI.panel.grossYield} value={view.grossYield} required={modes.grossRequired}
              disabled={!modes.grossEditable} maxLength={MAX_LENGTH.grossYield} counter={false}
              error={errors.grossYield ?? undefined}
              onChange={(v) => set("grossYield", v)} testId={`txt_${prefix}_GrossYield`} ariaLabel={`txt_${prefix}_GrossYield`} />

            <Choices label="" name={`rad_${prefix}_Lossessp50`} value={form.lossesInput}
              options={LOSSES_OPTIONS} disabled={modes.modesLocked}
              onChange={(v) => setForm((prev) => changeLossesMode(prev, v as LossesInputMode, technology))} />
            <NumericField label={UI.panel.totalLosses} value={view.totalLosses} required={modes.lossesRequired}
              disabled={!modes.lossesEditable} maxLength={MAX_LENGTH.totalLosses} counter={false}
              error={errors.totalLosses ?? undefined}
              onChange={(v) => set("totalLosses", v)} testId={`txt_${prefix}_TotalLosses`} ariaLabel={`txt_${prefix}_TotalLosses`} />
            <NumericField label={UI.panel.netP50} value={view.netP50} required={modes.p50Required}
              disabled={!modes.p50Editable} maxLength={MAX_LENGTH.netP50} counter={false}
              error={errors.netP50 ?? undefined}
              onChange={(v) => set("netP50", v)} testId={`txt_${prefix}_NetYieldP50`} ariaLabel={`txt_${prefix}_NetYieldP50`} />

            <Choices label="" name={`rad_${prefix}_UncertaintyNet`} value={form.uncertaintyInput}
              options={UNCERTAINTY_OPTIONS} disabled={modes.modesLocked}
              onChange={(v) => setForm((prev) => changeUncertaintyMode(prev, v as UncertaintyInputMode))} />
            <NumericField label={UI.panel.uncertainty} value={view.uncertainty} required={modes.uncertaintyRequired}
              disabled={!modes.uncertaintyEditable} maxLength={MAX_LENGTH.uncertainty} counter={false} placeholder="0.0"
              error={errors.uncertainty ?? undefined}
              onChange={(v) => set("uncertainty", v)} testId={`txt_${prefix}_Uncertainty`} ariaLabel={`txt_${prefix}_Uncertainty`} />
            <NumericField label={UI.panel.netP75} value={view.netP75} required={modes.p75p90Required}
              disabled={!modes.p75p90Editable} maxLength={MAX_LENGTH.netP75} counter={false}
              error={errors.netP75 ?? undefined}
              onChange={(v) => set("netP75", v)} testId={`txt_${prefix}_NetYieldP75`} ariaLabel={`txt_${prefix}_NetYieldP75`} />
            <NumericField label={UI.panel.netP90} value={view.netP90} required={modes.p75p90Required}
              disabled={!modes.p75p90Editable} maxLength={MAX_LENGTH.netP90} counter={false}
              error={errors.netP90 ?? undefined}
              onChange={(v) => set("netP90", v)} testId={`txt_${prefix}_NetYieldP90`} ariaLabel={`txt_${prefix}_NetYieldP90`} />

            <Switch label={UI.panel.considerSeasonality} aria-label={UI.panel.considerSeasonality}
              data-testid={`tgl_${prefix}_ConsiderSeasonality`} checked={form.considerSeasonality}
              onChange={(_, d) => toggleSeasonality(d.checked)} />
            <Switch label={UI.panel.considerNegativePrices} aria-label={UI.panel.considerNegativePrices}
              data-testid={`tgl_${prefix}_ConsiderNegativePrice`} checked={form.considerNegativePrices}
              onChange={(_, d) => toggleNegativePrices(d.checked)} />
            {form.considerSeasonality || form.considerNegativePrices ? (
              <MessageBar intent="info" data-testid="production-fabric-notice">
                <MessageBarBody>{PRODUCTION_SCREEN_TEXT.fabricNotConnected}</MessageBarBody>
              </MessageBar>
            ) : null}
          </div>

          {form.considerSeasonality ? (
            <div className={s.sideColumn} data-testid={`con_${prefix}_SeasonalityYeildRightPanelBody`}>
              <div className={s.columnHead}>
                <Text className={s.columnTitle}>{UI.seasonality}</Text>
                <Tooltip content={UI.resetToStandard} relationship="label" withArrow>
                  <Button appearance="transparent" icon={<ArrowResetRegular />} aria-label={UI.resetToStandard}
                    data-testid={technology === "PV" ? "ico_ProductionSeasonalityYieldPV_MonthValueReset_1" : "ico_ProductionSeasonalityYieldWTG_MonthValueResetAll"}
                    onClick={() => setSeasonEdits(buildSeasonalityRows(standard.seasonality, technology, lang))} />
                </Tooltip>
              </div>
              {seasonRows.map((row) => {
                const error = validateCellPercent(row.text, lang);
                return (
                  <div key={row.id} className={s.cellRow}>
                    <Text className={s.cellMonth}>{row.month}</Text>
                    <Field className={mergeClasses(s.cellValue, skin.field)} label={UI.distribution} validationState={error ? "error" : "none"} validationMessage={error ?? undefined}>
                      <Input value={row.text}
                        appearance={FIELD_APPEARANCE}
                        className={controlClass("edit", standardClass(row.isStandard))}
                        aria-label={`${row.month} ${UI.distribution}`}
                        data-testid={`txt_ProductionSeasonalityYield${technology}_MonthValue-${row.id}`}
                        onChange={(_, d) => setSeasonEdits(applyMonthEdit(seasonRows, row.id, d.value, lang))} />
                    </Field>
                  </div>
                );
              })}
              <div className={s.total}>
                <span>{UI.totalSum}</span>
                <span data-testid={`txt_ProductionSeasonality${technology}_TotalValue`}>{fmtPercentTotal(seasonalityTotal(seasonRows, lang))}</span>
              </div>
              {seasonalityTotalError(seasonRows, lang) ? <span className={s.error} role="alert">{MSG.seasonalityTotal}</span> : null}
            </div>
          ) : null}

          {form.considerNegativePrices ? (
            <div className={s.sideColumn} data-testid={`con_${prefix}_NegativePriceRightPanelBody`}>
              <div className={s.columnHead}>
                <Text className={s.columnTitle}>{UI.negativePrices}</Text>
              </div>
              {negativeRows.map((row) => {
                const error = validateCellPercent(row.text, lang);
                return (
                  <div key={row.year} className={s.cellRow}>
                    <Text className={s.cellMonth}>{row.year}</Text>
                    <Field className={mergeClasses(s.cellValue, skin.field)} label={UI.reduction} validationState={error ? "error" : "none"} validationMessage={error ?? undefined}>
                      <Input value={row.text}
                        appearance={FIELD_APPEARANCE}
                        className={controlClass("edit", standardClass(row.standardAssumption))}
                        aria-label={`${row.year} ${UI.reduction}`}
                        data-testid={`txt_ProductionNegativePrice${technology}_YearValue-${row.year}`}
                        onChange={(_, d) => setNegativeEdits(applyReductionEdit(negativeRows, row.year, d.value, lang))} />
                    </Field>
                    <Tooltip content={UI.resetToStandard} relationship="label" withArrow>
                      <Button appearance="transparent" icon={<ArrowResetRegular />} className={s.cellReset}
                        aria-label={`${UI.resetToStandard} ${row.year}`}
                        data-testid={`ico_ProductionNegativePrice${technology}_YearValueReset-${row.year}`}
                        onClick={() => setNegativeEdits(resetNegativePriceRow(negativeRows, row.year, lang))} />
                    </Tooltip>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      </FormPanel>

      <ConfirmDialog
        open={confirm?.kind === "delete"}
        title={DELETE_DIALOG.title}
        description={confirm?.kind === "delete" ? DELETE_DIALOG.description(confirm.row.description) : ""}
        confirmText={DELETE_DIALOG.confirm}
        cancelText={DELETE_DIALOG.cancel}
        confirmIcon="delete"
        destructive
        onConfirm={() => { if (confirm?.kind === "delete") onConfirmDelete(confirm.row); }}
        onCancel={() => setConfirm(null)}
      />

      {confirm?.kind === "status" ? (() => {
        const d = statusDialog(confirm.row);
        return (
          <ConfirmDialog open title={d.title} description={d.description} confirmText={d.confirm} cancelText={d.cancel}
            onConfirm={() => onConfirmStatus(confirm.row)} onCancel={() => setConfirm(null)} />
        );
      })() : null}

      <Dialog open={confirm?.kind === "prevent"} onOpenChange={(_, d) => { if (!d.open) setConfirm(null); }}>
        <DialogSurface data-testid="con_PopUp_Common_Generators_PreventTotalCapacity_Information_1">
          <DialogBody>
            <DialogTitle action={
              <Button appearance="transparent" icon={<DismissRegular />} aria-label="icn_PopUp_Common_Generators_PreventTotalCapacity_Cancel_1" title={HINTS.cancel}
                data-testid="icn_PopUp_Common_Generators_PreventTotalCapacity_Cancel_1" onClick={() => setConfirm(null)} />
            }>
              <span data-testid="txt_PopUp_Common_Generators_PreventTotalCapacity_Title_1">{PREVENT_LAST_YIELD_DIALOG.title}</span>
            </DialogTitle>
            <DialogContent>{PREVENT_LAST_YIELD_DIALOG.description}</DialogContent>
            <DialogActions>
              <Button appearance="secondary" aria-label={PREVENT_LAST_YIELD_DIALOG.close}
                data-testid="btn_PopUp_Common_Generators_PreventTotalCapacity_Information_Close_1"
                onClick={() => setConfirm(null)}>
                {PREVENT_LAST_YIELD_DIALOG.close}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      {loading ? <LoadingOverlay mode="inline" /> : null}
      {/* `cmp_PopUp_Leave_…_Confirmation` — the shared leave guard (D35, PO X1). */}
      <UnsavedChangesGuard when={shouldConfirmLeave(panel !== null)} dialog={LEAVE_DIALOG} />
    </div>
  );
}
