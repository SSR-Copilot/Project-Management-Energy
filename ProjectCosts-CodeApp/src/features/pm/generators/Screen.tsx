/**
 * Project Generators Screen — composition only (connected 19 Oct 2026, D27).
 *
 * Canvas screen: `Project Generators Screen.pa.yaml` (PM app, solution 1.21.709). Structure, matching
 * the canvas containers:
 *   command bar     `pcf_Generators_DisplayProject_Body_Form_CommandBar` (every `Items` row), disabled
 *                   while the lock message shows
 *   lock message    `con_Milestones_Page_LockMessage_1`
 *   plant capacity  `txt_Generators_DisplayProject_Body_Form_PlantWtgCapacity`
 *   seven galleries `gal_Generators_DisplayProject_Body_Form_GeneratorTypes` · `_PvModule` ·
 *                   `_Invertors` · `_Substructure` · `_Storage_1` · `_Hydrogen` · `_Substation_2` — one
 *                   card per row, every card COLLAPSED until clicked, ONE card selected screen-wide
 *   turbine grid    `pcf_…_GeneratorType_CardDetails_GeneratorsList`, inside an expanded WTG type,
 *                   under its "Add Generator" bar and its pager
 *   right panels    Add Generator Type · Add/Edit Generator · Add/Edit PV Module Type · Add BESS ·
 *                   Add Hydrogen · Add Substation · Add/Edit Inverter · Add/Edit Substructure (G9) ·
 *                   Replace Generator · Replace PV Module (G6, solution 1.21.753)
 *   popups          the delete / status / height-limitation confirmations, the "can’t be
 *                   deleted/deactivated" information popup, the long-operation dialog (`WriteFeedback`)
 *
 * The hidden subroutine buttons are functions: `btn_AutomatedFlow_TriggerWork_ForWTG_PV` → the second
 * job of a WTG / PV save (`deviceTypeShadow`), `btn_Trigger_New_AllocateWTGs_To_Land_Lease` → the
 * AllWTG allocations in those plans, `btn_SetDefaultSeletected_Item` → `defaultSelection` after a delete,
 * `btn_…Generator_Buttons_Reset` (hidden) → re-seeding the form when the panel opens.
 *
 * LEFT OUT (D27): the out-of-country "Request permission" saves (WTG type, inverter, substructure, a
 * replace) and the cards' Cancel request buttons (approval flows that send mails / Teams cards) — visible,
 * disabled, with the reason as tooltip.
 *
 * PO answers of 20 Oct 2026 (D27): G6 — the 1.21.753 Replace Generator / Replace PV Module panels are
 * ported from the 1.21.753 sources (the gap register, the skeleton port and its label corpora; no 1.21.753
 * YAML is on disk) — their control names are 1.21.753-only, so the 1.21.709 canvas-identity gate cannot
 * see them; G9 — DIVERGENCE: Add / Edit Inverter and Substructure (`ItemVisible: false` in the canvas) are
 * shown and their hidden canvas panels ported.
 *
 * DIVERGENCE (layout only): the PowerCAT command bar nests BESS / Hydrogen / Substation under
 * "Add Others" (`ItemParentKey: "addOthers"`) while nothing is selected. The app's `CommandBar` has no
 * sub-menus, so they render flat, right after "Add Others" (`commandBarOrder`), and "Add Others" itself
 * does nothing — it has no `Switch` arm in the canvas `OnSelect` (D15c, D27).
 */
import { useMemo, useState, type ReactNode } from "react";
import {
  Button, Checkbox, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface,
  DialogTitle, Dropdown, MessageBar, MessageBarBody, Option, Radio, Switch,
  Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow, Text, Tooltip,
  makeStyles, mergeClasses, tokens,
} from "@fluentui/react-components";
import {
  CheckmarkRegular, ChevronDownRegular, ChevronLeftRegular, ChevronRightRegular,
  ChevronDoubleLeftRegular, ChevronUpRegular, DeleteRegular, DismissRegular, EditRegular,
  InfoRegular, LockClosedRegular,
} from "@fluentui/react-icons";
import {
  CommandBar, ConfirmDialog, EmptyState, FIELD_APPEARANCE, FormPanel, LoadingOverlay, ReadOnlyField,
  WriteFeedback, type Command, useFieldControlClass,
} from "@/components";
import { useSession } from "@/app/SessionContext";
import { CHOICE_PLANT } from "@/data/dataverseNames";
import { media, palette, space } from "@/theme/tokens";
import {
  CANCEL_REQUEST, COMMAND_BAR_LABEL, DIALOG_LABELS, DIALOG_TEXT, EXCLUDED, GENERATORS_PAGE_SIZE,
  GENERATORS_SCREEN_TEXT, GENERATOR_TYPE_SAVED_BANNER, HEIGHT_LIMIT_PM_MESSAGE, HYDROGEN_CARD_LABELS,
  HYDROGEN_PANEL_LABELS, INVERTER_CARD_LABELS, LAST_CAPACITY_MESSAGES, LAST_CAPACITY_TITLES, PAGER_TOOLTIPS,
  PAGE_LOCK_TITLE, PANEL_BUTTONS, PV_CAPACITY_MAX_LENGTH, PV_DEGRADATION_MAX_LENGTH, PV_FIELD_LABELS,
  PV_MODULE_LABEL_MAX_LENGTH, PV_MSG, PV_OTHER_SUPPLIER_LABEL, PV_PANEL_TITLES, PV_SUPPLIER_PLACEHOLDER,
  SIMPLE_CAPACITY_MAX_LENGTH, STORAGE_CARD_LABELS, STORAGE_PANEL_LABELS, SUBSTATION_CARD_LABELS,
  SUBSTATION_PANEL_LABELS, SUBSTRUCTURE_CARD_LABELS, SUBSTRUCTURE_COST_INFO, SUBSTRUCTURE_COST_NOTE,
  TOTAL_CAPACITY_LABEL, TURBINE_PANEL_LABELS, TURBINE_TABLE_LABELS, TYPE_DETAIL_FIELD_LABELS,
  TYPE_PANEL_LABELS, TYPE_PANEL_TOOLTIPS, WRITE_ERROR, WRITE_MSG, WTG_CARD_LABELS,
  buildTurbineNames, canAddGenerator, canSavePvType, canSaveSimple, canSaveTurbine,
  canSaveType, cancelRequestVisible, capacityGuardReason, cascadeOptions, changeStatusDialog,
  commandBarOrder, commandBarState, commandParentKey, costPerWtg, currencyCaption, defaultSelection, fmtCapacity, fmtHeight,
  generatorCommandIcon, generatorsTotalRowsText, heightBlocksSave, heightLimitExceeded,
  heightPopupTypeName, inverterCardValues, isBodyVisible, isDummySupplier, isOtherSupplierModule,
  isPageLocked, newTurbineHeights, nextTurbineIndex, numberOfGeneratorsMessage, numericOr,
  opexDependencyMessage, overHeightLimit, pageCount, pageLock, pagerVisible, paginationText,
  permissionStateLabel, planCreateGeneratorType, planDeleteGeneratorType, planDeleteInverterOrSubstructure,
  planDeletePvType, planDeleteSimple, planDeleteTurbine, planGeneratorTypeFollowUp, planPvFollowUp,
  planSavePvType, planSaveSimple, planSaveTurbine, planToggleStatus, projectCatalog, pvCardValues,
  pvSaveErrorText, pvSaveProgressText, pvDeleteErrorText, pvSupplierOptions, resolveModel, rowClickFolds,
  selectedIn, selectionAfterAddPv, selectionAfterAddWtg, showsPermissionChip, simpleCardValues,
  simpleFormDefaults, simpleSaveProgressText, statusLabel, substructureCardValues,
  substructureCostNoteVisible, toggleExpanded, toggleSelection, turbineFormDefaults,
  turbineHeightBlocksSave, turbinePanelPrefix, turbinePanelTitle, turbinePanelTotalHeight,
  turbineSaveProgressText, typeFieldBlankMessage, typeFilterMessage, typeSaveLabel, typeSaveProgressText,
  validateEffectiveCapacity, validateEffectiveHubHeight, validateFoundationPlinth, validatePvTypeForm,
  validateSimpleForm, validateTurbineName, validateTypeForm, wtgCardValues, wtgFoldSelection,
  INVERTER_PANEL_LABELS, INVERTER_TYPE_LABELS, REPLACE_LABELS, REPLACE_MSG, SUBSTRUCTURE_MSG,
  SUBSTRUCTURE_PANEL_LABELS, SUBSTRUCTURE_TYPE_LABELS, canSaveInverter, canSaveSubstructure,
  effectiveOtherSupplier, fmtHubHeight, inverterFormDefaults, inverterPanelTitle, inverterSaveProgressText,
  isPlantOtherSupplier, planReplaceGeneratorType, planReplaceGeneratorTypeFollowUp, planReplacePvType,
  planReplacePvTypeFollowUp, planSaveInverter, planSaveSubstructure, plantPanelSaveLabel,
  plantRequestsPermission, plantSupplierDisplayName, plantSupplierOptions, replaceGeneratorTitle,
  replaceProgressText, replacePvProgressText, replacePvTitle, replaceSuccessText, replaceWtgSaveable,
  substructureFormDefaults, substructureNeedsPvCapacity, substructurePanelTitle,
  substructureSaveProgressText, validateInverterForm, validateSubstructureForm, needsPermissionCancellation,
  type CapacityGuardReason, type CatalogModel, type GeneratorCommandKey, type GeneratorTypeRow,
  type InverterFormState, type PlanProject, type PlantFamily, type PvTypeFormState, type ReplaceInputs,
  type ReplaceWtgForm, type SelectedRow, type SimpleCapacityFamily, type SimpleFormState,
  type SimpleTypeRow, type SubstructureFormState, type TurbineFormState, type TurbineRow, type TypeFormState,
} from "./rules";
import type { WritePlan } from "@/data/writePlan";
import {
  SERVER_DECIDES, loadAllocations, loadNewTypeInputs, loadPvDeleteInputs, loadPvFollowUpInputs,
  loadReplaceInputs, loadTypeDeleteInputs,
  useAllWtgLandLeaseCosts, useDeviceCosts, useEntraObjectId, useGeneratorCatalog, useGeneratorModels,
  useGeneratorTypes, useGeneratorWrites, useGeneratorsProject, useInflationIndex, useInverterTypes,
  useOpexDependency, usePlantSupplierCatalog, useProjectPlanning, useProjectTurbines, usePvModuleCatalog,
  usePvModuleTypes, useSimpleTypes, useSubstructureTypes,
} from "./hooks";

/* ────────────────────────────────────────────────────────────────── styles */

/** `rec_…_Separator.Fill` — the 1-px rule under every card header. */
const CARD_RULE = "rgb(0, 120, 212)";
/** `ColorFade(ColorValue(gblAppTheme.palette.Warning), 60%)` — the Height Limitation tag. */
const HEIGHT_TAG_FILL = "rgb(248, 212, 158)";
/** `con_Milestones_Page_LockMessage_1.Fill` and its icon / text colour. */
const LOCK_FILL = "rgb(89, 89, 89)";
const LOCK_TEXT = "rgb(255, 255, 255)";

/** The gallery's `X: 20` inset, carried by each card's header and details (see `gallery`). */
const CARD_INSET = "20px";

/*
 * Layout transcribed from the canvas containers (UI layout pass, 20 Oct 2026):
 *  - `con_Generators_DisplayProject_Body_Form`: vertical; the command bar is the shell's slot;
 *  - `…_FirstColumn_PlantInfo_Fields`: PaddingTop 10, one 280 × 70 cell, caption at X 20;
 *  - each gallery (`gal_…`, X 20, Width `Parent.Width - 40`) is a list of CARDS: a 42-px header
 *    (selection dot at X 10, title at X 40, the chips and the fold icon right, a 1-px
 *    `RGBA(0,120,212)` rule at Y 41) and, while expanded, `…_CardDetails` (PaddingLeft / Right 20):
 *    the read-only fields in four `Parent.Width / 4` columns of 64-px cells (two rows when the
 *    card has more than four), then the WTG turbine bar, pager and grid (Width 850).
 */
const useStyles = makeStyles({
  /** The command bar's first icon starts on the left edge of the content under it (PO, 21 Oct 2026); `CommandBar` has no inset of its own. Main bar: over "Total Capacity" (the capacity block's 20 px inset). */
  commandBar: { paddingLeft: "20px" },
  /** The expanded card's "Add Generator" bar: over "Supplier" (the detail grid's 20 px inset). */
  // The first detail column is flush with the card padding (see `detailCellFirst`), so no inset of its own.
  cardCommandBar: {},
  page: { display: "flex", flexDirection: "column", flex: "1 0 auto", minWidth: 0, paddingBottom: "15px" },
  /** `con_…_PlantWtgCapacity` — 280 wide, 70 high, the caption and input inset 20. */
  capacity: {
    boxSizing: "border-box", width: "280px", maxWidth: "100%", minHeight: "70px",
    marginTop: "10px", paddingLeft: "20px", paddingRight: "20px",
  },
  /** `con_Milestones_Page_LockMessage_1` — horizontal, items centred, LayoutGap 10, PaddingLeft 20. */
  lock: {
    display: "flex", alignItems: "center", columnGap: "10px",
    paddingLeft: "20px", backgroundColor: LOCK_FILL, color: LOCK_TEXT,
  },
  /** `con_Milestones_pagelock_section_1` — Padding 8. */
  lockBullets: {
    display: "flex", flexDirection: "column", gap: space.xxs, color: LOCK_TEXT,
    paddingTop: "8px", paddingBottom: "8px", paddingLeft: "8px", paddingRight: "8px",
  },
  lockTitle: { fontWeight: 600, color: LOCK_TEXT },
  /**
   * `gal_…` sits at X 20, but the card's blue header rule runs edge to edge (PO, 28 Oct 2026): the
   * list has no margin, and its 20-px inset moves into the card header and details (`CARD_INSET`).
   */
  gallery: { display: "flex", flexDirection: "column", minWidth: 0 },
  /** `con_…_Card` — the canvas `Width: Parent.Width - 10` gap is dropped so the rule runs end to end. */
  card: { display: "flex", flexDirection: "column", minWidth: 0 },
  /** `con_…_CardHeader` — Height 42, the separator 1 px at Y 41. */
  cardHeader: {
    display: "flex", alignItems: "center", columnGap: space.s, minHeight: "42px",
    paddingLeft: CARD_INSET,
    borderBottomWidth: "1px", borderBottomStyle: "solid", borderBottomColor: CARD_RULE,
  },
  /** `img_…_RowSelectionDot` — 18 × 18 at X 10; the title starts at X 40. */
  cardDot: { flexShrink: 0, marginLeft: "1px", width: "30px" },
  cardTitle: { flex: 1, minWidth: 0, display: "flex", "& > span": { flex: 1, minWidth: 0 } },
  /** `ico_…_Up` / `_Down` — 20 × 18, 32 from the right edge. */
  // 8, not the canvas 12: the 28-px button (`foldButton`) keeps the glyph centred 22 px from the edge, as the 20-px canvas icon is.
  cardFold: { flexShrink: 0, marginRight: "8px" },
  /**
   * `ico_…_Up` / `_Down` — a `Classic/Icon` (`Icon.ChevronUp` / `ChevronDown`) whose glyph spans the
   * full 20-px width of its box. Fluent's chevron path fills only ~68 % of its em box, so the icon is
   * 28 px to draw a ~20-px glyph. `Color: gblAppColors.Icon.Color` = themePrimary, `DisabledColor` =
   * Grayscale10 (App.pa.yaml:1321-1323).
   */
  foldIcon: { fontSize: "28px", width: "28px", height: "28px", color: palette.themePrimary },
  /** Fluent caps an icon-only small button at `max-width: 24px` with 1-px padding; lift it for the 28-px icon. */
  foldButton: {
    minWidth: "28px", maxWidth: "none", width: "28px", height: "28px",
    paddingTop: 0, paddingRight: 0, paddingBottom: 0, paddingLeft: 0,
  },
  foldIconDisabled: { color: palette.Grayscale10 },
  /** `con_…_CardDetails` — PaddingLeft / PaddingRight 20, LayoutGap 10. */
  cardDetails: {
    display: "flex", flexDirection: "column", rowGap: "10px",
    paddingLeft: `calc(${CARD_INSET} + 20px)`, paddingRight: "20px", paddingTop: space.s, paddingBottom: space.s,
  },
  /** Four `Parent.Width / 4` columns of 64-px cells, filled column by column. */
  detailGrid: {
    display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gridAutoRows: "64px",
    [media.belowMd]: { gridTemplateColumns: "repeat(2, minmax(0, 1fr))" },
  },
  detailGridTwoRows: { gridTemplateRows: "repeat(2, 64px)", gridAutoFlow: "column" },
  /**
   * `con_…_PvModule_CardDetails`: a horizontal auto-layout (LayoutGap 20) of `Width: 260` columns,
   * each two 64-px cells stacked with LayoutGap 2.
   */
  /**
   * Replace Generator / Replace PV Module Type: "Replace from" and "Replace to" side by side, each
   * under its heading rule (canvas screenshots, 28 Oct 2026). WTG: 280 + 314 px, 120 apart; PV: 310 + 310, 40 apart.
   */
  replaceGrid: {
    display: "grid", gridTemplateColumns: "280px 314px", columnGap: "120px", alignItems: "start",
    [media.belowMd]: { gridTemplateColumns: "minmax(0, 1fr)", rowGap: space.l },
  },
  replaceGridPv: { gridTemplateColumns: "310px 310px", columnGap: "40px" },
  replaceColumn: { display: "flex", flexDirection: "column", gap: space.m, minWidth: 0 },
  /** The column heading: semibold, over a 1-px rule that runs a little past the fields. */
  replaceHeading: {
    fontSize: "15px", fontWeight: tokens.fontWeightSemibold, color: "#323130",
    paddingBottom: "6px", marginRight: "-20px",
    borderBottomWidth: "1px", borderBottomStyle: "solid", borderBottomColor: "#8a8886",
  },
  pvGrid: {
    display: "grid", gridTemplateRows: "repeat(2, 64px)", gridAutoFlow: "column", gridAutoColumns: "260px",
    columnGap: "20px", rowGap: "2px", maxWidth: "100%", overflowX: "auto",
  },
  /**
   * `con_…_{Storage,Hydrogen,Substation}_CardDetails_Context`: one horizontal auto-layout row
   * (LayoutGap 20) of `Width: Parent.Width/4` cells.
   */
  simpleGrid: {
    display: "grid", gridAutoFlow: "column", gridAutoColumns: "25%", gridTemplateRows: "64px",
    columnGap: "20px", maxWidth: "100%",
    [media.belowMd]: { gridAutoFlow: "row", gridAutoColumns: "auto", gridTemplateRows: "none", gridAutoRows: "64px" },
  },
  /** One read-only card field: the 20-px caption at X 20, the value box 5 px under it. */
  detailCell: {
    display: "flex", flexDirection: "column", rowGap: "5px", minWidth: 0,
    paddingLeft: "20px", paddingRight: "20px", fontSize: "14px",
  },
  /** Column 1's caption and box sit at X 0 and span the column (`Width: Parent.Width - Self.X*2`, X unset). */
  detailCellFirst: { paddingLeft: 0, paddingRight: 0 },
  /** The canvas card captions are Semibold. */
  detailLabel: {
    lineHeight: "20px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
    fontWeight: tokens.fontWeightSemibold,
  },
  /** The canvas read-only `TextInput` (the `.canvas-field > input` look). */
  detailValue: {
    display: "flex", alignItems: "center", minHeight: "32px", boxSizing: "border-box",
    paddingLeft: "12px", paddingRight: "12px", borderRadius: "4px",
    backgroundColor: "#f4f4f4", color: "#242424",
    overflow: "hidden", whiteSpace: "nowrap",
  },
  /** The turbine grid (`FluentDetailsList`, Width 850): Semibold header captions. */
  turbineHead: { fontWeight: tokens.fontWeightSemibold },
  turbineTable: { tableLayout: "fixed", width: "850px", maxWidth: "100%" },
  /**
   * `columns_Items` `ColWidth` plus the list's cell padding: the name `Max(850 - 570, 40)`, Total
   * Height 155, Effective Capacity 255, then the 18- / 16-px edit and delete icons side by side.
   */
  turbineColName: { width: "296px" },
  turbineColHeight: { width: "171px" },
  turbineColCapacity: { width: "279px" },
  turbineColIcon: { width: "34px" },
  /** `AlternateRowColor: gblAppTheme.palette.Grayscale30` — every other row, starting with the first. */
  turbineRow: { "&:nth-child(odd)": { backgroundColor: palette.Grayscale30 } },
  /** Numbers are right-aligned in the canvas card boxes (`Align.Right`). */
  detailValueNumeric: { justifyContent: "flex-end" },
  title: { display: "flex", alignItems: "center", flexWrap: "wrap", gap: space.s },
  /** `txt_…_GeneratorType` takes the header's width; the chips sit right of it. */
  /** `txt_…_GeneratorType` is a `Text@0.0.51` with no `Weight`: regular. */
  titleText: { flex: "1 1 auto", fontWeight: tokens.fontWeightRegular },
  /** `con_…_RequestState` / `lbl_Generator_GeneratorStatus` — a 24-px chip, Medium / ExtraSmall. */
  chip: {
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    minHeight: "24px", minWidth: "100px", boxSizing: "border-box",
    // `con_Generator_GeneratorStatus.Radius*: =34` — a pill, as on the live screen.
    borderRadius: "34px",
    paddingLeft: space.s, paddingRight: space.s,
    fontSize: "12px", color: palette.Grayscale00,
    borderTopWidth: "1px", borderRightWidth: "1px", borderBottomWidth: "1px", borderLeftWidth: "1px",
    borderTopStyle: "solid", borderRightStyle: "solid", borderBottomStyle: "solid", borderLeftStyle: "solid",
    borderTopColor: palette.Grayscale10, borderRightColor: palette.Grayscale10,
    borderBottomColor: palette.Grayscale10, borderLeftColor: palette.Grayscale10,
    backgroundColor: palette.Grayscale40,
  },
  /** `con_Generator_GeneratorStatus` while Active: Green border, SuccessLight fill. */
  chipActive: {
    borderTopColor: palette.Green, borderRightColor: palette.Green,
    borderBottomColor: palette.Green, borderLeftColor: palette.Green,
    backgroundColor: palette.SuccessLight,
  },
  /** `con_Generator_GeneratorHeightLimitationTag` */
  heightTag: { backgroundColor: HEIGHT_TAG_FILL },
  expanded: { display: "flex", flexDirection: "column", gap: space.s, maxWidth: "850px", minWidth: 0, overflowX: "auto" },
  warning: { fontSize: tokens.fontSizeBase200, color: palette.Warning },
  note: { fontSize: tokens.fontSizeBase200, color: palette.Error },
  pager: { display: "flex", alignItems: "center", gap: space.s, fontSize: tokens.fontSizeBase200 },
  panelBody: { display: "flex", flexDirection: "column", gap: space.m },
  /**
   * `con_…_Filter_CountryAvailability`, under the toggle: `ico_…_Filter_Message` (18 px, X 15,
   * Success / Warning) and the message 20 px right of it.
   */
  filterAvailability: { display: "flex", alignItems: "center", columnGap: "20px", minHeight: "32px", paddingLeft: "15px" },
  /** `cmb_Supplier` & co.: `Width: Parent.Width - Self.X*2 - 80` — 314 px in the 450-px panel. */
  typeField: { width: "314px", maxWidth: "100%" },
  /** `ComboBox@0.0.51` in `DisplayMode.Disabled`: a white box with a light outline, not the filled skin. */
  comboDisabled: {
    backgroundColor: palette.white,
    borderTopWidth: "1px", borderRightWidth: "1px", borderBottomWidth: "1px", borderLeftWidth: "1px",
    borderTopStyle: "solid", borderRightStyle: "solid", borderBottomStyle: "solid", borderLeftStyle: "solid",
    borderTopColor: palette.Grayscale20, borderRightColor: palette.Grayscale20,
    borderBottomColor: palette.Grayscale20, borderLeftColor: palette.Grayscale20,
  },
  prefixRow: { display: "flex", alignItems: "center", gap: space.s },
  /** The Add Generator fields: `Width: Parent.Width/2 + Self.X + 20` — 265 px in the 450-px panel. */
  turbineField: { width: "265px", maxWidth: "100%" },
  /** `lbl_…_GeneratorName_Prefix`: 180 wide, `Align.Right`, at X 20 — the input follows it. */
  namePrefix: { flex: "0 0 auto", width: "180px", textAlign: "right", fontSize: "14px", color: "#323130" },
  /** `txt_…_GeneratorName`: `Width: 80`. */
  nameIndex: { flex: "0 0 80px", width: "80px" },
  dropdown: { minWidth: "0px", width: "100%" },
  pmError: { color: palette.Error, fontSize: tokens.fontSizeBase200 },
  footerPrimary: { height: "32px", minWidth: "96px", fontSize: "15px" },
  footerCancel: {
    height: "32px", minWidth: "96px", fontSize: "15px",
    backgroundColor: palette.white, color: palette.themePrimary,
    borderTopColor: palette.themePrimary, borderRightColor: palette.themePrimary,
    borderBottomColor: palette.themePrimary, borderLeftColor: palette.themePrimary,
  },
});

/* ──────────────────────────────────────────────────────────── local controls */

/**
 * A `.canvas-field` text input: caption, red `*`, value, inline error. `ariaLabel` is the canvas
 * `AccessibleLabel` where it sets one (the control name), else the caption (rule 16).
 *
 * No red outline (no `data-invalid`): no control on the canvas screen sets a `ValidationState`, so
 * an invalid box never turns red; only its `lbl_…_ErrorMessage` shows (28 Oct 2026).
 */
function InputField({
  label, name, ariaLabel, value, onChange, required, disabled, error, maxLength, readOnly, className,
  disabledLook,
}: {
  label: string; name: string; ariaLabel?: string; value: string; onChange?: (v: string) => void;
  required?: boolean; disabled?: boolean; error?: string | null; maxLength?: number;
  readOnly?: boolean; className?: string;
  /** `true`: the canvas `DisplayMode.Disabled` box (white, outlined, grey text), not the filled `View` one. */
  disabledLook?: boolean;
}) {
  return (
    <label className={mergeClasses("canvas-field", className)} data-display={disabledLook ? "disabled" : undefined}>
      <span data-required={required}>{label}</span>
      <input
        value={value}
        aria-label={ariaLabel ?? label}
        data-testid={name}
        aria-invalid={error ? true : undefined}
        disabled={disabled || readOnly}
        readOnly={readOnly}
        maxLength={maxLength}
        onChange={(e) => onChange?.(e.target.value)}
      />
      {error ? <span className="canvas-field-error" role="alert">{error}</span> : null}
    </label>
  );
}

interface SelectOption { value: string; label: string }

/** A `.canvas-field` combobox — a sibling caption, never a wrapping `<label>`; no red outline (see `InputField`). */
function SelectField({
  label, name, ariaLabel, value, options, onChange, required, disabled, error, placeholder, className,
  disabledClassName,
}: {
  label: string; name: string; ariaLabel?: string; value: string | null; options: readonly SelectOption[];
  onChange: (v: string) => void; required?: boolean; disabled?: boolean;
  error?: string | null; placeholder?: string; className?: string;
  /** Replaces the filled disabled skin (e.g. `comboDisabled`). */
  disabledClassName?: string;
}) {
  const s = useStyles();
  const controlClass = useFieldControlClass();
  const selected = options.find((o) => o.value === value);
  return (
    <div className={mergeClasses("canvas-field", className)}>
      <span data-required={required}>{label}</span>
      <Dropdown
        className={mergeClasses(s.dropdown, controlClass(disabled ? "disabled" : "edit"), disabled && disabledClassName)}
        appearance={FIELD_APPEARANCE}
        aria-label={ariaLabel ?? label}
        data-testid={name}
        placeholder={placeholder}
        disabled={disabled}
        value={selected?.label ?? ""}
        selectedOptions={value ? [value] : []}
        onOptionSelect={(_, d) => { if (d.optionValue !== undefined) onChange(d.optionValue); }}
      >
        {options.map((o) => <Option key={o.value} value={o.value}>{o.label}</Option>)}
      </Dropdown>
      {error ? <span className="canvas-field-error" role="alert">{error}</span> : null}
    </div>
  );
}

/** A `.canvas-field` multi-select combobox (`SelectMultiple: true`) — the Inverter Type field (G9). */
function MultiSelectField({
  label, name, ariaLabel, values, options, onChange, required, disabled, error,
}: {
  label: string; name: string; ariaLabel?: string; values: readonly string[]; options: readonly SelectOption[];
  onChange: (v: string[]) => void; required?: boolean; disabled?: boolean; error?: string | null;
}) {
  const s = useStyles();
  const controlClass = useFieldControlClass();
  const text = options.filter((o) => values.includes(o.value)).map((o) => o.label).join(", ");
  return (
    <div className="canvas-field">
      <span data-required={required}>{label}</span>
      <Dropdown
        className={mergeClasses(s.dropdown, controlClass(disabled ? "disabled" : "edit"))}
        appearance={FIELD_APPEARANCE}
        multiselect
        aria-label={ariaLabel ?? label}
        data-testid={name}
        disabled={disabled}
        value={text}
        selectedOptions={[...values]}
        onOptionSelect={(_, d) => onChange(d.selectedOptions)}
      >
        {options.map((o) => <Option key={o.value} value={o.value}>{o.label}</Option>)}
      </Dropdown>
      {error ? <span className="canvas-field-error" role="alert">{error}</span> : null}
    </div>
  );
}

const plainOptions = (values: readonly (string | number)[]): SelectOption[] =>
  values.map((v) => ({ value: String(v), label: String(v) }));

/** `Choices('Inverter Type')` / `Choices('Substructure Type')` as combobox options. */
const choiceOptions = (labels: Readonly<Record<number, string>>): SelectOption[] =>
  Object.entries(labels).map(([value, label]) => ({ value, label }));

/** The panel footer: primary (Save / Request permission) and Cancel. */
function PanelFooter({
  primary, primaryName, onPrimary, disabled, onCancel, cancelName, primaryTooltip, cancelTooltip, reason,
}: {
  primary: string; primaryName: string; onPrimary: () => void; disabled: boolean;
  onCancel: () => void; cancelName: string; primaryTooltip?: string; cancelTooltip?: string;
  /** Why the primary button is disabled when an excluded action is behind it (D27). */
  reason?: string;
}) {
  const s = useStyles();
  return (
    <>
      <Button
        className={s.footerPrimary} appearance="primary" icon={<CheckmarkRegular />}
        aria-label={primary} data-testid={primaryName} disabled={disabled} onClick={onPrimary}
        title={reason ?? primaryTooltip}
      >
        {primary}
      </Button>
      <Button
        className={s.footerCancel} icon={<DismissRegular />}
        aria-label={PANEL_BUTTONS.cancel} data-testid={cancelName} onClick={onCancel}
        title={cancelTooltip}
      >
        {PANEL_BUTTONS.cancel}
      </Button>
    </>
  );
}

/** One gallery card. */
interface GalleryRow {
  id: string;
  title: ReactNode;
  cells: ReactNode[];
  selected: boolean;
  onSelect: () => void;
  /** Whether the card is expanded (`Not(ThisItem.IsFolded)`) — its details show. */
  open: boolean;
  /** The card body under the details — the WTG turbine grid, shown while expanded. */
  expanded?: ReactNode;
  /** Shown ABOVE the details while expanded — the WTG card's "Add Generator" bar (canvas). */
  before?: ReactNode;
  fold: ReactNode;
}

/** A value the canvas right-aligns: a plain number, optionally with a unit-free % sign. */
const isNumericValue = (v: ReactNode): boolean =>
  typeof v === "number" || (typeof v === "string" && /^-?[\d.,\s]+%?$/.test(v.trim()) && v.trim() !== "");

/** The 4-column grid column of cell `i`: row by row, or column by column when there are two rows. */
const detailColumn = (i: number, count: number, rowFlow: boolean): number =>
  rowFlow || count <= 4 ? i % 4 : Math.floor(i / 2);

/** A gallery: one card per row; an expanded card shows its detail captions and values. */
function Gallery({
  name, columns, rows, disabled, selectLabel, rowFlow = false, layout,
}: {
  /**
   * The canvas auto-layout cards, where every cell is flush in its column and every value is
   * `Align.Left` (numbers included): `"pv"` — 260-px columns of two (`pvGrid`); `"simple"` — BESS /
   * Hydrogen / Substation, one row of quarter-width cells (`simpleGrid`). Omitted: the 4-column grid.
   */
  layout?: "pv" | "simple";
  /** `null` is an empty slot — the canvas leaves a cell of the 4-column grid blank. */
  name: string; columns: readonly (string | null)[]; rows: GalleryRow[]; disabled: boolean;
  /** Fill the detail grid row by row (the WTG card's 2 × 4 layout) instead of column by column. */
  rowFlow?: boolean;
  /** The card's selection dot `AccessibleLabel` (`img_…_CardHeader_RowSelectionDot`). */
  selectLabel: string;
}) {
  const s = useStyles();
  if (rows.length === 0) return null;
  return (
    <div className={s.gallery} data-testid={name} role="list" aria-label={name}>
      {rows.map((r) => (
        <div key={r.id} className={s.card} role="listitem" data-selected={r.selected || undefined}>
          <div className={s.cardHeader}>
            <Radio
              className={s.cardDot}
              checked={r.selected}
              aria-label={selectLabel}
              value={r.id}
              data-testid={`${name}-select-${r.id}`}
              disabled={disabled}
              onChange={r.onSelect}
              onClick={r.selected ? r.onSelect : undefined}
            />
            <div className={s.cardTitle}>{r.title}</div>
            <div className={s.cardFold}>{r.fold}</div>
          </div>
          {r.open ? (
            <div className={s.cardDetails}>
              {r.before}
              <div className={
                layout === "pv" ? s.pvGrid
                : layout === "simple" ? s.simpleGrid
                : mergeClasses(s.detailGrid, columns.length > 4 && !rowFlow && s.detailGridTwoRows)
              }>
                {columns.map((c, i) => (
                  c === null
                    ? <div key={`${i}-empty`} aria-hidden="true" />
                    : (
                      <div key={`${i}-${c}`} className={mergeClasses(s.detailCell, (layout !== undefined || detailColumn(i, columns.length, rowFlow) === 0) && s.detailCellFirst)}>
                        <span className={s.detailLabel}>{c}</span>
                        <div className={mergeClasses(s.detailValue, layout === undefined && isNumericValue(r.cells[i]) && s.detailValueNumeric)}>
                          {r.cells[i]}
                        </div>
                      </div>
                    )
                ))}
              </div>
              {r.expanded}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────── state shapes */

type Panel =
  | { kind: "type" }
  | { kind: "turbine"; typeId: string; turbineId: string | null }
  | { kind: "pv" }
  | { kind: SimpleCapacityFamily }
  | { kind: "inverter" }
  | { kind: "substructure" }
  | { kind: "replaceWtg" }
  | { kind: "replacePv" }
  | null;

type DialogState =
  | { kind: "deleteType"; type: GeneratorTypeRow }
  | { kind: "deleteTurbine"; turbine: TurbineRow }
  | { kind: "toggleStatus"; type: GeneratorTypeRow }
  | { kind: "deleteSimple"; family: Exclude<PlantFamily, "wtg">; row: SimpleTypeRow }
  | { kind: "blocked"; reason: CapacityGuardReason; name: string | null }
  | { kind: "heightType"; name: string | null }
  | { kind: "heightTurbine"; name: string | null }
  /** `cmp_PopUp_Common_Generators_Information` (`locGeneratorInformationDialog`). */
  | { kind: "info"; title: string; text: string }
  | null;

const emptyReplaceWtg = (inCountry = true): ReplaceWtgForm => ({
  supplier: null, turbineType: null, hubHeight: null, revisedHubHeight: "", inCountry,
});

const emptyTypeForm = (): TypeFormState => ({
  supplier: null, turbineType: null, hubHeight: null, revisedHubHeight: "",
  numberOfGenerators: "", cost: "", dirty: new Set<string>(),
});

const emptyPvForm = (): PvTypeFormState => ({
  moduleLabel: "", capacity: "", supplier: null, otherSupplier: "",
  degradation1stYear: "", degradationRemainingYears: "", dirty: new Set<string>(),
});

/** `If(Int(x) = x, Text(x, "#"), Text(x, "0.0#"))` — the PV panel's prefill (Y:7450, Y:7777). */
const pvPrefill = (v: number | null): string =>
  v === null ? "" : Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100);

/** The card fold icons (`ico_…_Up` while expanded, `ico_…_Down` while collapsed), per family. */
const FOLD_ICON: Record<PlantFamily, { up: string; down: string }> = {
  wtg: { up: "ico_Generators_DisplayProject_Body_Form_GeneratorType_Up", down: "ico_Generators_DisplayProject_Body_Form_GeneratorType_Down" },
  pv: { up: "ico_Generators_DisplayProject_Body_Form_PvModule_Up", down: "ico_Generators_DisplayProject_Body_Form_PvModule_Down" },
  inverter: { up: "ico_Generators_DisplayProject_Body_Form_Invertors_Up", down: "ico_Generators_DisplayProject_Body_Form_Invertors_Down" },
  substructure: { up: "ico_Generators_DisplayProject_Body_Form_Substructure_Up", down: "ico_Generators_DisplayProject_Body_Form_Substructure_Down" },
  storage: { up: "ico_Generators_DisplayProject_Body_Form_Storage_Up_1", down: "ico_Generators_DisplayProject_Body_Form_Storage_Down_1" },
  hydrogen: { up: "ico_Generators_DisplayProject_Body_Form_Hydrogen_Up", down: "ico_Generators_DisplayProject_Body_Form_Hydrogen_Down" },
  substation: { up: "ico_Generators_DisplayProject_Body_Form_Substation_Up_1", down: "ico_Generators_DisplayProject_Body_Form_Substation_Down_1" },
};

/** Each card's selection dot (`img_…_CardHeader_RowSelectionDot`), whose `AccessibleLabel` is its name. */
const SELECT_DOT: Record<PlantFamily, string> = {
  wtg: "img_Generators_DisplayProject_Body_Form_GeneratorType_CardHeader_RowSelectionDot",
  pv: "img_Generators_DisplayProject_Body_Form_PvModule_CardHeader_RowSelectionDot",
  inverter: "img_Generators_DisplayProject_Body_Form_Invertors_CardHeader_RowSelectionDot",
  substructure: "img_Generators_DisplayProject_Body_Form_Substructure_CardHeader_RowSelectionDot",
  storage: "img_Generators_DisplayProject_Body_Form_Storage_CardHeader_RowSelectionDot_1",
  hydrogen: "img_Generators_DisplayProject_Body_Form_Hydrogen_CardHeader_RowSelectionDot",
  substation: "img_Generators_DisplayProject_Body_Form_Substation_CardHeader_RowSelectionDot_1",
};

/** The cards' permission-request Cancel buttons (`pcf_btn_GeneralData_DisplayProject_Body_Buttons_…`). */
const CANCEL_BUTTON: Partial<Record<PlantFamily, string>> = {
  wtg: "pcf_btn_GeneralData_DisplayProject_Body_Buttons_Reset_1",
  pv: "pcf_btn_GeneralData_DisplayProject_Body_Buttons_PVModule_Reset",
  inverter: "pcf_btn_GeneralData_DisplayProject_Body_Buttons_Inverter_Reset",
  substructure: "pcf_btn_GeneralData_DisplayProject_Body_Buttons_Substructure_Reset",
};

/** The BESS / Hydrogen / Substation panels: title, field control names, Save / Cancel. */
const SIMPLE_PANEL: Record<SimpleCapacityFamily, {
  title: string; labelCaption: string; capacityCaption: string; supplierCaption: string;
  label: string; capacity: string; energy?: string; energyCaption?: string; supplier: string;
  /** The supplier input's canvas `AccessibleLabel`; the Hydrogen one sets none (caption). */
  supplierAria?: string;
  save: string; cancel: string; savedText: string; saveError: (d: string) => string;
}> = {
  storage: {
    title: STORAGE_PANEL_LABELS.title, labelCaption: STORAGE_PANEL_LABELS.label,
    capacityCaption: STORAGE_PANEL_LABELS.powerCapacity, supplierCaption: STORAGE_PANEL_LABELS.supplier,
    label: "txt_GeneratorData_RightPanel_Form_Storage_Fields_StorageLabel",
    capacity: "txt_GeneratorData_RightPanel_Form_Storage_Fields_StorageCapacityMW_5",
    energy: "txt_GeneratorData_RightPanel_Form_Storage_Fields_StorageCapacityMW_6",
    energyCaption: STORAGE_PANEL_LABELS.energyCapacity,
    supplier: "txt_GeneratorData_RightPanel_Form_Storage_Fields_StorageSupplier",
    supplierAria: "txt_GeneratorData_RightPanel_Form_Storage_Fields_StorageSupplier",
    save: "pcf_btn_GeneratorData_RightPanel_Form_Storage_Buttons_Save_2",
    cancel: "pcf_btn_GeneratorData_RightPanel_Form_Storage_Buttons_Cancel_2",
    savedText: WRITE_MSG.storageSaved, saveError: WRITE_ERROR.storageSave,
  },
  hydrogen: {
    title: HYDROGEN_PANEL_LABELS.title, labelCaption: HYDROGEN_PANEL_LABELS.label,
    capacityCaption: HYDROGEN_PANEL_LABELS.capacity, supplierCaption: HYDROGEN_PANEL_LABELS.supplier,
    label: "txt_GeneratorData_RightPanel_Form_Hydrogen_Fields_HydrogenLabel",
    capacity: "txt_GeneratorData_RightPanel_Form_Hydrogen_Fields_HydrogenCapacityMW_2",
    supplier: "txt_GeneratorData_RightPanel_Form_Hydrogen_Fields_HydrogenSupplier",
    save: "pcf_btn_GeneratorData_RightPanel_Form_Hydrogen_Buttons_Save_2",
    cancel: "pcf_btn_GeneratorData_RightPanel_Form_Hydrogen_Buttons_Cancel_2",
    savedText: WRITE_MSG.hydrogenSaved, saveError: WRITE_ERROR.hydrogenSave,
  },
  substation: {
    title: SUBSTATION_PANEL_LABELS.title, labelCaption: SUBSTATION_PANEL_LABELS.label,
    capacityCaption: SUBSTATION_PANEL_LABELS.capacity, supplierCaption: SUBSTATION_PANEL_LABELS.supplier,
    label: "txt_GeneratorData_RightPanel_Form_Substation_Fields_SubstationLabel",
    capacity: "txt_GeneratorData_RightPanel_Form_Substation_Fields_SubstationCapacityMW_2",
    supplier: "txt_GeneratorData_RightPanel_Form_Substation_Fields_SubstationSupplier",
    supplierAria: "txt_GeneratorData_RightPanel_Form_Substation_Fields_SubstationSupplier",
    save: "pcf_btn_GeneratorData_RightPanel_Form_Substation_Buttons_Save_2",
    cancel: "pcf_btn_GeneratorData_RightPanel_Form_Substation_Buttons_Cancel_2",
    savedText: WRITE_MSG.substationSaved, saveError: WRITE_ERROR.substationSave,
  },
};

const isActive = (status: number) => status === CHOICE_PLANT.status.active;

/* ──────────────────────────────────────────────────────────────────── screen */

export default function GeneratorsScreen() {
  const s = useStyles();
  const { projectId } = useSession();

  /* ── data ── */
  const projectQ = useGeneratorsProject(projectId);
  const project = projectQ.data;
  const planningQ = useProjectPlanning(projectId);
  const planning = planningQ.data;
  const typesQ = useGeneratorTypes(projectId);
  const types = typesQ.data;
  const modelsQ = useGeneratorModels(types.map((t) => t.generatorId).filter((v): v is string => Boolean(v)));
  const catalogQ = useGeneratorCatalog(project?.fid);
  const indexQ = useInflationIndex(project?.fid);
  const deviceQ = useDeviceCosts(project?.countryId);
  const turbinesQ = useProjectTurbines(projectId, types.map((t) => t.id));
  const pvCatalogQ = usePvModuleCatalog();
  const pvQ = usePvModuleTypes(projectId, pvCatalogQ.data);
  const inverterQ = useInverterTypes(projectId);
  const substructureQ = useSubstructureTypes(projectId);
  const storageQ = useSimpleTypes("storage", projectId);
  const hydrogenQ = useSimpleTypes("hydrogen", projectId);
  const substationQ = useSimpleTypes("substation", projectId);
  const allWtgQ = useAllWtgLandLeaseCosts(projectId);
  const entraObjectId = useEntraObjectId();
  const writes = useGeneratorWrites(projectId);
  const perms = SERVER_DECIDES;

  /** Every model a card or the panel needs — the types' own rows win over the orderable catalogue. */
  const models = useMemo(() => {
    const byId = new Map<string, CatalogModel>();
    for (const m of catalogQ.data) byId.set(m.id, m);
    for (const m of modelsQ.data) byId.set(m.id, m);
    return byId;
  }, [catalogQ.data, modelsQ.data]);
  const modelOf = (t: GeneratorTypeRow | null): CatalogModel | null =>
    t?.generatorId ? models.get(t.generatorId) ?? null : null;
  const projected = useMemo(() => projectCatalog(catalogQ.data, {
    countryOptionValue: project?.countryOptionValue, fidDate: project?.fid,
  }), [catalogQ.data, project?.countryOptionValue, project?.fid]);

  const turbinesByType = useMemo(() => {
    const m = new Map<string, TurbineRow[]>();
    for (const t of turbinesQ.data) {
      const list = m.get(t.typeId ?? "") ?? [];
      list.push(t);
      m.set(t.typeId ?? "", list);
    }
    for (const list of m.values()) list.sort((a, b) => a.index - b.index);
    return m;
  }, [turbinesQ.data]);

  const queries = [
    projectQ, planningQ, typesQ, modelsQ, catalogQ, indexQ, deviceQ, turbinesQ, pvCatalogQ, pvQ,
    inverterQ, substructureQ, storageQ, hydrogenQ, substationQ, allWtgQ,
  ];
  const loading = queries.some((q) => q.isLoading);
  const loadError = queries.find((q) => q.error)?.error;

  /* ── selection and folding ── */
  const [selection, setSelection] = useState<SelectedRow | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const selectedType = selectedIn(selection, "wtg", types);
  const selectedPv = selectedIn(selection, "pv", pvQ.data);
  const selectedInverter = selectedIn(selection, "inverter", inverterQ.data);
  const selectedSubstructure = selectedIn(selection, "substructure", substructureQ.data);
  const selectedStorage = selectedIn(selection, "storage", storageQ.data);
  const selectedHydrogen = selectedIn(selection, "hydrogen", hydrogenQ.data);
  const selectedSubstation = selectedIn(selection, "substation", substationQ.data);
  const selectedTypeModel = modelOf(selectedType);
  const opexWtg = useOpexDependency(projectId, selectedType?.id).data;
  const opexPv = useOpexDependency(projectId, selectedPv?.id).data;

  const onRowClick = (family: PlantFamily, id: string) => {
    setSelection((p) => toggleSelection(p, family, id));
    if (rowClickFolds(family)) setExpanded((p) => toggleExpanded(p, id));
  };
  const onFold = (family: PlantFamily, id: string) => {
    if (family === "wtg") {
      setSelection(wtgFoldSelection(!expanded.has(id), id));
      setExpanded((p) => toggleExpanded(p, id));
    } else {
      onRowClick(family, id);
    }
  };

  /* ── panels, dialogs, forms ── */
  const [panel, setPanel] = useState<Panel>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [inCountry, setInCountry] = useState(true);
  const [typeForm, setTypeForm] = useState<TypeFormState>(emptyTypeForm);
  const [turbineForm, setTurbineForm] = useState<TurbineFormState>(() => turbineFormDefaults({ turbine: null, model: null, nextIndex: 1 }));
  const [applyAll, setApplyAll] = useState({ capacity: false, plinth: false, hubHeight: false });
  const [pvForm, setPvForm] = useState<PvTypeFormState>(emptyPvForm);
  const [simpleForm, setSimpleForm] = useState<SimpleFormState>(() => simpleFormDefaults("storage", null));
  const [pages, setPages] = useState<Record<string, number>>({});

  const close = () => setPanel(null);
  const closeDialog = () => setDialog(null);
  const markDirty = (dirty: Set<string>, field: string) => new Set(dirty).add(field);
  const planProject: PlanProject | null = project
    ? { id: project.id, shortName: project.shortName, owningBusinessUnitId: project.owningBusinessUnitId }
    : null;

  /* Rules 3–10 — the type panel's cascade, model, derived cost and height gate. */
  const cascade = cascadeOptions(projected, {
    inCountry, supplier: typeForm.supplier, turbineType: typeForm.turbineType,
  });
  const dummy = isDummySupplier(typeForm.supplier);
  // `cmb_Supplier_2.DefaultSelectedItems = locSelectedTurbineForDummy` — the first height, for a Dummy supplier.
  const effectiveHubHeight = dummy ? (cascade.hubHeights[0] ?? (typeForm.turbineType ? 0 : null)) : typeForm.hubHeight;
  const resolvedModel = resolveModel(projected, {
    supplier: typeForm.supplier, turbineType: typeForm.turbineType, hubHeight: effectiveHubHeight,
  }) ?? null;
  const count = numericOr(typeForm.numberOfGenerators, 0);
  const derivedCost = resolvedModel && count > 0
    ? costPerWtg({ model: resolvedModel, count, accumulatedIndex: indexQ.data })
    : 0;
  const prospectiveHeight = resolvedModel
    ? newTurbineHeights({
        selectedHeight: effectiveHubHeight ?? 0,
        typedHubHeight: numericOr(typeForm.revisedHubHeight, 0),
        catalogHubHeight: resolvedModel.hubHeight,
        rotorDiameter: resolvedModel.rotorDiameter,
      }).totalHeight
    : 0;
  const typeErrors = validateTypeForm({ ...typeForm, hubHeight: effectiveHubHeight }, {
    isoCurrencyCode: project?.isoCurrencyCode, derivedCostPerWtg: derivedCost,
  });
  const typeHeightBlocked = resolvedModel !== null && heightBlocksSave({
    planning, totalHeight: prospectiveHeight, project, entraObjectId,
  });
  const typeSaveable = resolvedModel !== null && canSaveType({ errors: typeErrors, heightBlocked: typeHeightBlocked });
  const touchType = <K extends keyof TypeFormState>(field: K, value: TypeFormState[K]) =>
    setTypeForm((prev) => {
      const next = { ...prev, [field]: value, dirty: markDirty(prev.dirty, String(field)) };
      // `Reset(cmb_Supplier_1)` / `Reset(…HubHeight_1)` / `Reset(…NumberOfGenerator)` — the cascade clears downstream.
      if (field === "supplier") { next.turbineType = null; next.hubHeight = null; next.revisedHubHeight = ""; next.numberOfGenerators = ""; }
      if (field === "turbineType") { next.hubHeight = null; next.revisedHubHeight = ""; next.numberOfGenerators = ""; }
      if (field === "hubHeight") { next.revisedHubHeight = ""; next.numberOfGenerators = ""; }
      return next;
    });

  /* Rule 11 — the turbine panel. */
  const panelType = panel?.kind === "turbine" ? types.find((t) => t.id === panel.typeId) ?? null : null;
  const panelTurbines = panelType ? turbinesByType.get(panelType.id) ?? [] : [];
  const panelTurbine = panel?.kind === "turbine" ? panelTurbines.find((t) => t.id === panel.turbineId) ?? null : null;
  const panelModel = modelOf(panelType);
  // The duplicate-name check is project-wide (`colGeneratorsInProjectsTemporary`).
  const projectIndices = turbinesQ.data.filter((t) => t.id !== panelTurbine?.id).map((t) => t.index);
  const turbineNameError = validateTurbineName(turbineForm.nameIndex, {
    existingIndices: projectIndices, currentIndex: panelTurbine?.index ?? null,
  });
  const turbineHeight = turbinePanelTotalHeight({
    form: turbineForm, storedTotalHeight: panelTurbine?.totalHeight, rotorDiameter: panelModel?.rotorDiameter,
  });
  const turbineHeightBlocked = turbineHeightBlocksSave({
    planning, storedTotalHeight: panelTurbine?.totalHeight, project, entraObjectId,
  });
  const turbineSaveable = canSaveTurbine({
    form: turbineForm, existingIndices: projectIndices, currentIndex: panelTurbine?.index ?? null,
    specificCapacity: panelModel?.specificCapacity ?? null, heightBlocked: turbineHeightBlocked,
  });
  const touchTurbine = <K extends keyof TurbineFormState>(field: K, value: TurbineFormState[K]) =>
    setTurbineForm((prev) => ({ ...prev, [field]: value, dirty: markDirty(prev.dirty, String(field)) }));
  /** `chk_…_All.OnCheck` / `.OnUncheck` (Y:10908-10918): the row is dirty while checked. */
  const applyAllChange = (key: "capacity" | "plinth" | "hubHeight", checked: boolean) => {
    setApplyAll((p) => ({ ...p, [key]: checked }));
    setTurbineForm((prev) => {
      const dirty = new Set(prev.dirty);
      if (checked) dirty.add(`applyAll-${key}`); else dirty.delete(`applyAll-${key}`);
      return { ...prev, dirty };
    });
  };

  /* The PV module type panel. */
  const pvOptions = pvSupplierOptions(pvCatalogQ.data);
  const pvModule = pvCatalogQ.data.find((m) => m.id === pvForm.supplier) ?? null;
  const otherSupplierChosen = isOtherSupplierModule(pvModule);
  const pvErrors = validatePvTypeForm(pvForm, { otherSupplierChosen });
  const pvSaveable = canSavePvType(pvErrors, pvForm, { otherSupplierChosen });
  const touchPv = <K extends keyof PvTypeFormState>(field: K, value: PvTypeFormState[K]) =>
    setPvForm((prev) => {
      const next = { ...prev, [field]: value, dirty: markDirty(prev.dirty, String(field)) };
      // `cmb_…Supplier.OnChange`: `Reset(txt_…OtherSupplier)` — back to the row's stored value.
      if (field === "supplier") next.otherSupplier = selectedPv?.otherSupplier ?? "";
      return next;
    });

  /* The BESS / Hydrogen / Substation panels. */
  const simpleFamily: SimpleCapacityFamily | null =
    panel?.kind === "storage" || panel?.kind === "hydrogen" || panel?.kind === "substation" ? panel.kind : null;
  const simpleRowsOf = (f: SimpleCapacityFamily) =>
    f === "storage" ? storageQ.data : f === "hydrogen" ? hydrogenQ.data : substationQ.data;
  const simpleSelectedOf = (f: SimpleCapacityFamily) =>
    f === "storage" ? selectedStorage : f === "hydrogen" ? selectedHydrogen : selectedSubstation;
  const simpleErrors = simpleFamily ? validateSimpleForm(simpleFamily, simpleForm) : null;
  const simpleSaveable = simpleFamily ? canSaveSimple(simpleFamily, simpleForm) : false;
  const touchSimple = <K extends keyof SimpleFormState>(field: K, value: SimpleFormState[K]) =>
    setSimpleForm((prev) => ({ ...prev, [field]: value, dirty: markDirty(prev.dirty, String(field)) }));

  /* G9 — the Add / Edit Inverter panel, bound to the selected inverter row (or a new one). */
  const [inverterForm, setInverterForm] = useState<InverterFormState>(() => inverterFormDefaults(null));
  const inverterCatalogQ = usePlantSupplierCatalog("inverter", panel?.kind === "inverter");
  const inverterOptions = plantSupplierOptions("inverter", inverterCatalogQ.data);
  const inverterSupplier = inverterCatalogQ.data.find((o) => o.id === inverterForm.supplierId) ?? null;
  const inverterOther = isPlantOtherSupplier("inverter", inverterSupplier);
  const inverterOtherValue = effectiveOtherSupplier(inverterForm.otherSupplier, inverterOther);
  const inverterErrors = validateInverterForm(inverterForm, { otherSupplierChosen: inverterOther });
  const inverterRequests = plantRequestsPermission(inverterOtherValue);
  const inverterSaveable = !inverterRequests && canSaveInverter(inverterForm, { otherSupplierChosen: inverterOther });
  // `DisplayMode: If(IsBlank(<row>.Inverter), Edit, View)` and the title test the stored catalogue row.
  const inverterEditing = Boolean(selectedInverter?.catalogueId);
  const touchInverter = <K extends keyof InverterFormState>(field: K, value: InverterFormState[K]) =>
    setInverterForm((prev) => {
      const next = { ...prev, [field]: value, dirty: markDirty(prev.dirty, String(field)) };
      if (field === "supplierId") {
        // `Reset(txt_…OtherSupplier)` and the three `UpdateIf`s of `cmb_…_Inverter_Fields_Supplier.OnChange`.
        next.otherSupplier = selectedInverter?.otherSupplier ?? "";
        next.dirty = new Set([...next.dirty, "otherSupplier", "inverterTypes"]);
        // `DefaultSelectedItems`: the row's types, else the chosen catalogue row's.
        if ((selectedInverter?.typeValues ?? []).length === 0) {
          next.inverterTypes = [...(inverterCatalogQ.data.find((o) => o.id === value)?.typeValues ?? [])];
        }
      }
      if (field === "otherSupplier") next.dirty = new Set([...next.dirty, "supplier"]);
      return next;
    });

  /* G9 — the Add / Edit Substructure panel. */
  const [substructureForm, setSubstructureForm] = useState<SubstructureFormState>(() => substructureFormDefaults(null));
  const substructureCatalogQ = usePlantSupplierCatalog("substructure", panel?.kind === "substructure");
  const substructureOptions = plantSupplierOptions("substructure", substructureCatalogQ.data);
  const substructureSupplier = substructureCatalogQ.data.find((o) => o.id === substructureForm.supplierId) ?? null;
  const substructureOther = isPlantOtherSupplier("substructure", substructureSupplier);
  const substructureOtherValue = effectiveOtherSupplier(substructureForm.otherSupplier, substructureOther);
  const substructureErrors = validateSubstructureForm(substructureForm, { otherSupplierChosen: substructureOther });
  const substructureRequests = plantRequestsPermission(substructureOtherValue);
  const substructureSaveable = !substructureRequests && canSaveSubstructure(substructureForm, { otherSupplierChosen: substructureOther });
  const substructureEditing = Boolean(selectedSubstructure?.catalogueId);
  const touchSubstructure = <K extends keyof SubstructureFormState>(field: K, value: SubstructureFormState[K]) =>
    setSubstructureForm((prev) => {
      const next = { ...prev, [field]: value, dirty: markDirty(prev.dirty, String(field)) };
      if (field === "supplierId") {
        next.otherSupplier = selectedSubstructure?.otherSupplier ?? "";
        next.dirty = new Set([...next.dirty, "otherSupplier", "substructureType"]);
        if ((selectedSubstructure?.typeValues ?? []).length === 0) {
          next.substructureType = substructureCatalogQ.data.find((o) => o.id === value)?.typeValues[0] ?? null;
        }
      }
      if (field === "otherSupplier") next.dirty = new Set([...next.dirty, "supplier"]);
      return next;
    });

  /* G6 — Replace Generator Type (1.21.753): the "Replace to" cascade reuses the type panel's rules. */
  const [replaceWtg, setReplaceWtg] = useState<ReplaceWtgForm>(() => emptyReplaceWtg());
  const replaceCascade = cascadeOptions(projected, {
    inCountry: replaceWtg.inCountry, supplier: replaceWtg.supplier, turbineType: replaceWtg.turbineType,
  });
  const replaceDummy = isDummySupplier(replaceWtg.supplier);
  const replaceHub = replaceDummy ? (replaceCascade.hubHeights[0] ?? (replaceWtg.turbineType ? 0 : null)) : replaceWtg.hubHeight;
  const replaceModel = resolveModel(projected, {
    supplier: replaceWtg.supplier, turbineType: replaceWtg.turbineType, hubHeight: replaceHub,
  }) ?? null;
  const replaceCount = Math.max(0, selectedType?.numberOfGenerators ?? 0);
  const replaceCost = replaceModel && replaceCount > 0
    ? costPerWtg({ model: replaceModel, count: replaceCount, accumulatedIndex: indexQ.data })
    : 0;
  const replaceHeight = replaceModel
    ? newTurbineHeights({
        selectedHeight: replaceHub ?? 0, typedHubHeight: numericOr(replaceWtg.revisedHubHeight, 0),
        catalogHubHeight: replaceModel.hubHeight, rotorDiameter: replaceModel.rotorDiameter,
      }).totalHeight
    : 0;
  const replaceHeightBlocked = replaceModel !== null && heightBlocksSave({ planning, totalHeight: replaceHeight, project, entraObjectId });
  const replaceWtgOk = replaceModel !== null && replaceWtg.inCountry && replaceWtgSaveable({
    form: { ...replaceWtg, hubHeight: replaceHub }, inProgress: writes.progress !== null, heightBlocked: replaceHeightBlocked,
  });

  /* G6 — Replace PV Module Type: the "Replace to" form is the PV panel's form and validation. */
  const [replacePvForm, setReplacePvForm] = useState<PvTypeFormState>(emptyPvForm);
  const replacePvModule = pvCatalogQ.data.find((m) => m.id === replacePvForm.supplier) ?? null;
  const replacePvOther = isOtherSupplierModule(replacePvModule);
  const replacePvErrors = validatePvTypeForm(replacePvForm, { otherSupplierChosen: replacePvOther });
  const replacePvOk = writes.progress === null
    && canSavePvType(replacePvErrors, replacePvForm, { otherSupplierChosen: replacePvOther });
  const touchReplacePv = <K extends keyof PvTypeFormState>(field: K, value: PvTypeFormState[K]) =>
    setReplacePvForm((prev) => ({
      ...prev, [field]: value, dirty: markDirty(prev.dirty, String(field)),
      ...(field === "supplier" ? { otherSupplier: "" } : {}),
    }));

  /* ── the command bar ── */
  // A New Project (no record yet) is locked too: `IsBlank(gblRecordSelectedProject.'Project ID')`.
  const locked = !loading && isPageLocked(project);
  const editable = !locked;
  const cmdState = commandBarState({
    canEdit: perms.canEdit,
    project,
    selection: {
      generatorType: selectedType, pvModuleType: selectedPv, inverterType: selectedInverter,
      substructureType: selectedSubstructure, storageType: selectedStorage,
      hydrogenType: selectedHydrogen, substationType: selectedSubstation,
    },
    counts: { storage: storageQ.data.length, hydrogen: hydrogenQ.data.length, substation: substationQ.data.length },
    deletePermission: perms.deletePermission,
    editPermission: perms.editPermission,
    pvEditPermission: perms.pvEditPermission,
  });
  // G9 withdrawn (28 Oct 2026): Add Inverter / Add Substructure stay `ItemVisible: false`, as in the
  // canvas, so "Add Others" holds only BESS / Hydrogen / Substation again.
  const familySelected = {
    storage: selectedStorage !== null, hydrogen: selectedHydrogen !== null, substation: selectedSubstation !== null,
  };
  const commandEnabled = (key: GeneratorCommandKey) =>
    project !== null && editable && cmdState[key].visible && cmdState[key].enabled;
  const commands: Command[] = commandBarOrder(familySelected)
    .filter((key) => cmdState[key].visible)
    .map((key) => {
      const icon = generatorCommandIcon(key, cmdState[key]);
      const parentKey = commandParentKey(key, familySelected);
      return {
        key,
        label: cmdState[key].label,
        ...(icon ? { icon } : {}),
        ...(parentKey ? { parentKey } : {}),
        enabled: commandEnabled(key),
      };
    });

  /** The last-capacity / O&M guard runs BEFORE the confirmation opens. */
  const guardThen = (
    family: PlantFamily, capacity: number | null,
    row: { active: boolean; name: string | null; dep?: { hasActiveDeviceType: boolean; hasActiveOpexCost: boolean } },
    open: () => void,
  ) => {
    const reason = capacityGuardReason({
      family, project, capacity, rowActive: row.active,
      hasActiveDeviceType: row.dep?.hasActiveDeviceType ?? false,
      hasActiveOpexCost: row.dep?.hasActiveOpexCost ?? false,
    });
    if (reason) setDialog({ kind: "blocked", reason, name: row.name });
    else open();
  };
  const simpleGuard = (family: SimpleCapacityFamily, row: SimpleTypeRow) =>
    guardThen(family, row.capacity, { active: isActive(row.status), name: row.name },
      () => setDialog({ kind: "deleteSimple", family, row }));

  const openSimple = (family: SimpleCapacityFamily) => {
    setSimpleForm(simpleFormDefaults(family, simpleSelectedOf(family)));
    setPanel({ kind: family });
  };

  const onCommand = (key: string) => {
    writes.clear();
    switch (key as GeneratorCommandKey) {
      case "addWTGType":
        setSelection(selectionAfterAddWtg(selection));
        setTypeForm(emptyTypeForm()); setInCountry(true); setPanel({ kind: "type" }); break;
      case "addPVType":
        setSelection(selectionAfterAddPv(selection));
        setPvForm(selectedPv ? {
          moduleLabel: selectedPv.moduleLabel ?? "",
          capacity: pvPrefill(selectedPv.capacity),
          supplier: selectedPv.catalogueId ?? null,
          otherSupplier: selectedPv.otherSupplier ?? "",
          degradation1stYear: pvPrefill(selectedPv.degradation1stYear),
          degradationRemainingYears: selectedPv.degradationRemainingYears === null ? "" : String(selectedPv.degradationRemainingYears),
          dirty: new Set<string>(),
        } : emptyPvForm());
        setPanel({ kind: "pv" });
        break;
      case "addInverterType":
        setInverterForm(inverterFormDefaults(selectedInverter));
        setPanel({ kind: "inverter" });
        break;
      case "addSubstructureType":
        if (substructureNeedsPvCapacity(project?.plantPvCapacity)) {
          setDialog({ kind: "info", title: SUBSTRUCTURE_MSG.infoTitle, text: SUBSTRUCTURE_MSG.infoText });
        } else {
          setSubstructureForm(substructureFormDefaults(selectedSubstructure));
          setPanel({ kind: "substructure" });
        }
        break;
      case "replaceGeneratorType":
        if (selectedType) { setReplaceWtg(emptyReplaceWtg()); setPanel({ kind: "replaceWtg" }); }
        break;
      case "replacePVModuleType":
        if (selectedPv) { setReplacePvForm(emptyPvForm()); setPanel({ kind: "replacePv" }); }
        break;
      case "addStorage": openSimple("storage"); break;
      case "addHydrogen": openSimple("hydrogen"); break;
      case "addSubstation": openSimple("substation"); break;
      // `addOthers` has no arm in the canvas `Switch` — it does nothing (D27).
      case "addOthers": break;
      case "deleteGeneratorType":
        if (selectedType) {
          guardThen("wtg", selectedType.generatorsCapacity, {
            active: isActive(selectedType.status), dep: opexWtg,
            name: selectedTypeModel?.turbineType ?? selectedType.generatorDisplayName,
          }, () => setDialog({ kind: "deleteType", type: selectedType }));
        }
        break;
      case "deletePVModuleType":
        if (selectedPv) {
          guardThen("pv", selectedPv.capacity, {
            active: isActive(selectedPv.status), dep: opexPv, name: selectedPv.moduleLabel,
          }, () => setDialog({ kind: "deleteSimple", family: "pv", row: selectedPv }));
        }
        break;
      // SOURCE DEFECT (ambiguity 6): no last-capacity guard on inverter / substructure.
      case "deleteInverterType":
        if (selectedInverter) setDialog({ kind: "deleteSimple", family: "inverter", row: selectedInverter });
        break;
      case "deleteSubstructureType":
        if (selectedSubstructure) setDialog({ kind: "deleteSimple", family: "substructure", row: selectedSubstructure });
        break;
      case "deleteStorageType": if (selectedStorage) simpleGuard("storage", selectedStorage); break;
      case "deleteHydrogenType": if (selectedHydrogen) simpleGuard("hydrogen", selectedHydrogen); break;
      case "deleteSubstationType": if (selectedSubstation) simpleGuard("substation", selectedSubstation); break;
      case "activateGenerator":
        if (selectedType) setDialog({ kind: "toggleStatus", type: selectedType });
        break;
      case "deactivateGenerator":
        if (selectedType) {
          guardThen("wtg", selectedType.generatorsCapacity, {
            active: isActive(selectedType.status), dep: opexWtg,
            name: selectedTypeModel?.turbineType ?? selectedType.generatorDisplayName,
          }, () => setDialog({ kind: "toggleStatus", type: selectedType }));
        }
        break;
      default:
        break;
    }
  };

  const openTurbine = (type: GeneratorTypeRow, turbine: TurbineRow | null) => {
    writes.clear();
    setSelection({ family: "wtg", id: type.id });
    setApplyAll({ capacity: false, plinth: false, hubHeight: false });
    setTurbineForm(turbineFormDefaults({ turbine, model: modelOf(type), nextIndex: nextTurbineIndex(turbinesQ.data) }));
    setPanel({ kind: "turbine", typeId: type.id, turbineId: turbine?.id ?? null });
  };

  /* ── the writes ── */
  const run = (job: Parameters<typeof writes.run>[0]) => writes.run(job);
  const lists = () => ({
    wtg: types, pv: pvQ.data, hydrogen: hydrogenQ.data, storage: storageQ.data, substation: substationQ.data,
  });

  const saveType = async () => {
    if (!planProject || !resolvedModel) return;
    const n = numericOr(typeForm.numberOfGenerators, 0);
    const progress = typeSaveProgressText(resolvedModel.displayName);
    const names = buildTurbineNames({ shortName: planProject.shortName, existing: turbinesQ.data, count: n });
    close();
    const ids = await run({
      progress,
      errorText: WRITE_ERROR.typeSave,
      plan: planCreateGeneratorType({
        project: planProject, inCountry, model: resolvedModel, numberOfGenerators: n, costPerWtg: derivedCost,
        selectedHeight: effectiveHubHeight ?? 0, revisedHubHeight: numericOr(typeForm.revisedHubHeight, 0),
        existingTypes: types, projectTurbines: turbinesQ.data,
      }),
    });
    const typeId = ids?.[0];
    if (!typeId) return;
    setSelection({ family: "wtg", id: typeId });
    await run({
      progress,
      success: GENERATOR_TYPE_SAVED_BANNER,
      errorText: WRITE_ERROR.typeSave,
      plan: async (): Promise<WritePlan> => {
        const inputs = await loadNewTypeInputs("wtg", typeId);
        return planGeneratorTypeFollowUp({
          project: planProject, typeId, typeName: inputs.typeName, hasDeviceType: inputs.hasDeviceType,
          turbines: (ids ?? []).slice(1, 1 + n).map((id, i) => ({ id, name: names[i] ?? null })),
          landLeaseCosts: allWtgQ.data,
        });
      },
    });
  };

  const saveTurbine = async (fromPopup: boolean) => {
    if (!planProject || !panelType) return;
    const job = {
      progress: turbineSaveProgressText(planProject.shortName, turbineForm.nameIndex.trim(), fromPopup),
      success: WRITE_MSG.turbineSaved,
      errorText: WRITE_ERROR.turbineSave,
      plan: planSaveTurbine({
        project: planProject, type: panelType, model: panelModel, accumulatedIndex: indexQ.data,
        turbine: panelTurbine, typeTurbines: panelTurbines, allTypes: types, form: turbineForm, applyAll,
        totalHeight: turbineHeight, landLeaseCosts: allWtgQ.data,
      }),
    };
    close();
    await run(job);
  };

  const savePv = async () => {
    if (!planProject) return;
    const editing = selectedPv;
    const label = pvForm.moduleLabel;
    const capacity = numericOr(pvForm.capacity, 0);
    const costPerPower = deviceQ.data.modules ?? 0;
    const others = pvQ.data.filter((r) => r.id !== editing?.id);
    close();
    const ids = await run({
      progress: pvSaveProgressText(label),
      errorText: pvSaveErrorText,
      plan: planSavePvType({
        project: planProject, pv: editing, form: pvForm, deviceCostModules: deviceQ.data.modules, otherSupplierChosen,
      }),
    });
    const pvId = editing?.id ?? ids?.[0];
    if (!ids || !pvId) return;
    setSelection({ family: "pv", id: pvId });
    await run({
      progress: pvSaveProgressText(label),
      success: PV_MSG.saved,
      errorText: pvSaveErrorText,
      plan: async (): Promise<WritePlan> => {
        const inputs = await loadPvFollowUpInputs(pvId);
        const saved = { capacity, cost: costPerPower * capacity };
        return planPvFollowUp({
          project: planProject, pvId, pvName: inputs.pvName, unitId: inputs.unitId, hasDeviceType: inputs.hasDeviceType,
          pvRows: [...others, saved], inverters: inverterQ.data, substructures: substructureQ.data,
          // G7 (1.21.753) — a new PV type's unit is back-filled into the AllWTG land-lease costs.
          isNew: editing === null, landLeaseCosts: allWtgQ.data,
        });
      },
    });
  };

  /** G9 — `pcf_btn_GeneratorData_RightPanel_Form_Inverter_Buttons_Save.OnChange`. */
  const saveInverter = async () => {
    if (!planProject) return;
    const job = {
      progress: inverterSaveProgressText(inverterForm.label),
      success: WRITE_MSG.inverterSaved,
      errorText: WRITE_ERROR.inverterSave,
      plan: planSaveInverter({
        project: planProject, row: selectedInverter, form: inverterForm, otherSupplierChosen: inverterOther,
        deviceCostInverter: deviceQ.data.inverter, pv: pvQ.data, inverters: inverterQ.data, substructures: substructureQ.data,
      }),
    };
    close();
    // The canvas blanks `locSelectedInverterTypeEntity` after the save.
    if (await run(job)) setSelection(null);
  };

  /** G9 — `pcf_btn_GeneratorData_RightPanel_Form_Substructure_Buttons_Save.OnChange`. */
  const saveSubstructure = async () => {
    if (!planProject) return;
    const job = {
      progress: substructureSaveProgressText(substructureForm.label),
      success: WRITE_MSG.substructureSaved,
      errorText: WRITE_ERROR.substructureSave,
      plan: planSaveSubstructure({
        project: planProject, row: selectedSubstructure, form: substructureForm, otherSupplierChosen: substructureOther,
        deviceCostFix: deviceQ.data.mountingFix, deviceCostTracker: deviceQ.data.mountingTracker,
        plantPvCapacity: project?.plantPvCapacity, pv: pvQ.data, inverters: inverterQ.data, substructures: substructureQ.data,
      }),
    };
    close();
    if (await run(job)) setSelection(null);
  };

  /**
   * G6 — Replace Generator Type (1.21.753): job 1 reads the old type's links (Identify) and runs Detach,
   * Delete and Add; job 2 needs the new ids and runs the device-type row, the land lease and the O&M
   * re-link. The new type is selected afterwards.
   */
  const replaceGeneratorType = async () => {
    if (!planProject || !selectedType || !replaceModel) return;
    const oldType = selectedType;
    const model = replaceModel;
    const form = { ...replaceWtg };
    const otherTurbines = turbinesQ.data.filter((t) => t.typeId !== oldType.id);
    const names = buildTurbineNames({ shortName: planProject.shortName, existing: otherTurbines, count: replaceCount });
    const progress = replaceProgressText({
      inCountry: form.inCountry, newDisplayName: model.displayName,
      oldTurbineType: modelOf(oldType)?.turbineType ?? oldType.generatorDisplayName,
    });
    const box: { inputs?: ReplaceInputs; unmatched: number } = { unmatched: 0 };
    close();
    const ids = await run({
      progress,
      errorText: WRITE_ERROR.wtgReplace,
      plan: async (): Promise<WritePlan> => {
        box.inputs = await loadReplaceInputs(planProject.id, oldType.id);
        return planReplaceGeneratorType({
          project: planProject, oldType, inCountry: form.inCountry, model, costPerWtg: replaceCost,
          selectedHeight: replaceHub ?? 0, revisedHubHeight: numericOr(form.revisedHubHeight, 0),
          otherTypes: types.filter((t) => t.id !== oldType.id), otherTurbines, inputs: box.inputs,
        });
      },
    });
    const newTypeId = ids?.[0];
    const inputs = box.inputs;
    if (!newTypeId || !inputs) return;
    setSelection({ family: "wtg", id: newTypeId });
    await run({
      progress,
      success: () => replaceSuccessText(box.unmatched),
      errorText: WRITE_ERROR.wtgReplace,
      plan: async (): Promise<WritePlan> => {
        const created = await loadNewTypeInputs("wtg", newTypeId);
        const plan = planReplaceGeneratorTypeFollowUp({
          project: planProject, newTypeId, newTypeName: created.typeName, existingBridgeId: created.bridgeId ?? null,
          newUnits: (ids ?? []).slice(1, 1 + replaceCount).map((id, i) => ({ id, name: names[i] ?? null })),
          inputs,
        });
        box.unmatched = plan.unmatchedCount;
        return plan;
      },
    });
  };

  /** G6 — Replace PV Module Type (1.21.753), in the same two jobs. */
  const replacePvType = async () => {
    if (!planProject || !selectedPv) return;
    const oldPv = selectedPv;
    const form = { ...replacePvForm, dirty: new Set(replacePvForm.dirty) };
    const capacity = numericOr(form.capacity, 0);
    const progress = replacePvProgressText(form.moduleLabel);
    const box: { inputs?: ReplaceInputs } = {};
    close();
    const ids = await run({
      progress,
      errorText: WRITE_ERROR.pvReplace,
      plan: async (): Promise<WritePlan> => {
        box.inputs = await loadReplaceInputs(planProject.id, oldPv.id);
        return planReplacePvType({
          project: planProject, oldPv, form, deviceCostModules: deviceQ.data.modules,
          otherSupplierChosen: replacePvOther, inputs: box.inputs,
        });
      },
    });
    const newPvId = ids?.[0];
    const inputs = box.inputs;
    if (!newPvId || !inputs) return;
    setSelection({ family: "pv", id: newPvId });
    await run({
      progress,
      success: REPLACE_MSG.pvReplaced,
      errorText: WRITE_ERROR.pvReplace,
      plan: async (): Promise<WritePlan> => {
        const created = await loadNewTypeInputs("pv", newPvId);
        return planReplacePvTypeFollowUp({
          project: planProject, newPvId, newPvName: created.typeName, existingBridgeId: created.bridgeId ?? null,
          inputs,
          pvRows: [...pvQ.data.filter((r) => r.id !== oldPv.id), { capacity, cost: (deviceQ.data.modules ?? 0) * capacity }],
          inverters: inverterQ.data, substructures: substructureQ.data,
        });
      },
    });
  };

  const saveSimple = async () => {
    if (!planProject || !simpleFamily) return;
    const family = simpleFamily;
    const cfg = SIMPLE_PANEL[family];
    const row = simpleSelectedOf(family);
    const job = {
      progress: simpleSaveProgressText(simpleForm.label),
      success: cfg.savedText,
      errorText: cfg.saveError,
      plan: planSaveSimple({ project: planProject, family, row, rows: simpleRowsOf(family), form: simpleForm }),
    };
    close();
    const ids = await run(job);
    const id = row?.id ?? ids?.[0];
    if (ids && id) setSelection({ family, id });
  };

  const onTypeSave = () => {
    // The approval popup opens when the planning flags the limit and the new height exceeds it.
    if (heightLimitExceeded(planning, prospectiveHeight)) {
      setDialog({ kind: "heightType", name: heightPopupTypeName(resolvedModel?.displayName) });
    } else {
      void saveType();
    }
  };
  const onTurbineSave = () => {
    if (heightLimitExceeded(planning, turbineHeight)) {
      setDialog({ kind: "heightTurbine", name: panelTurbine?.name ?? null });
    } else {
      void saveTurbine(false);
    }
  };

  /** The confirm handlers, each the canvas `OnConfirm`. */
  const onConfirm = async () => {
    const d = dialog;
    closeDialog();
    if (!d || !planProject) return;
    switch (d.kind) {
      case "heightType": await saveType(); return;
      case "heightTurbine": await saveTurbine(true); return;
      case "deleteType": {
        const typeTurbines = turbinesByType.get(d.type.id) ?? [];
        const ok = await run({
          progress: WRITE_MSG.working, success: WRITE_MSG.typeDeleted, errorText: WRITE_ERROR.typeDelete,
          plan: async (): Promise<WritePlan> => {
            const inputs = await loadTypeDeleteInputs(planProject.id, d.type.id, typeTurbines.map((t) => t.id));
            return planDeleteGeneratorType({
              project: planProject, type: d.type, allTypes: types, allocations: inputs.allocations,
              allocationCountByCost: inputs.countByCost, opexCostIds: inputs.opexCostIds,
            });
          },
        });
        if (ok) setSelection(defaultSelection(lists(), d.type.id));
        return;
      }
      case "deleteTurbine": {
        const type = types.find((t) => t.id === d.turbine.typeId);
        if (!type) return;
        await run({
          progress: WRITE_MSG.working, success: WRITE_MSG.turbineDeleted, errorText: WRITE_ERROR.turbineDelete,
          plan: async (): Promise<WritePlan> => {
            const alloc = await loadAllocations([d.turbine.id]);
            return planDeleteTurbine({
              project: planProject, type, model: modelOf(type), accumulatedIndex: indexQ.data, turbine: d.turbine,
              typeTurbines: turbinesByType.get(type.id) ?? [], allTypes: types,
              allocations: alloc.allocations, allocationCountByCost: alloc.countByCost,
            });
          },
        });
        return;
      }
      case "toggleStatus":
        await run({
          progress: WRITE_MSG.working, success: WRITE_MSG.statusChanged, errorText: WRITE_ERROR.status,
          plan: planToggleStatus({
            project: planProject, type: d.type, turbines: turbinesByType.get(d.type.id) ?? [], allTypes: types,
          }),
        });
        return;
      case "deleteSimple": {
        const f = d.family;
        if (f === "pv") {
          const ok = await run({
            progress: WRITE_MSG.working, success: PV_MSG.deleted, errorText: pvDeleteErrorText,
            // G2 — the unit, its land lease and the O&M costs go first, as the confirmation says.
            plan: async (): Promise<WritePlan> => {
              const inputs = await loadPvDeleteInputs(planProject.id, d.row.id);
              return planDeletePvType({
                project: planProject, pv: d.row, pvRows: pvQ.data, inverters: inverterQ.data,
                substructures: substructureQ.data, deviceCostFix: deviceQ.data.mountingFix,
                deviceCostTracker: deviceQ.data.mountingTracker, unitIds: inputs.unitIds,
                allocations: inputs.allocations, allocationCountByCost: inputs.countByCost, opexCostIds: inputs.opexCostIds,
              });
            },
          });
          if (ok) setSelection(defaultSelection(lists(), d.row.id));
        } else if (f === "inverter" || f === "substructure") {
          const ok = await run({
            progress: WRITE_MSG.working,
            success: f === "inverter" ? WRITE_MSG.inverterDeleted : WRITE_MSG.substructureDeleted,
            errorText: f === "inverter" ? WRITE_ERROR.inverterDelete : WRITE_ERROR.substructureDelete,
            plan: planDeleteInverterOrSubstructure({
              project: planProject, family: f, row: d.row, pv: pvQ.data, inverters: inverterQ.data,
              substructures: substructureQ.data,
            }),
          });
          if (ok) setSelection(null);
        } else {
          const ok = await run({
            progress: WRITE_MSG.working,
            success: f === "storage" ? WRITE_MSG.storageDeleted : f === "hydrogen" ? WRITE_MSG.hydrogenDeleted : WRITE_MSG.substationDeleted,
            errorText: f === "storage" ? WRITE_ERROR.storageDelete : f === "hydrogen" ? WRITE_ERROR.hydrogenDelete : WRITE_ERROR.substationDelete,
            plan: planDeleteSimple({ project: planProject, family: f, row: d.row, rows: simpleRowsOf(f) }),
          });
          if (ok) setSelection(defaultSelection(lists(), d.row.id));
        }
        return;
      }
      default:
        return;
    }
  };

  /* ── galleries ── */
  const iso = project?.isoCurrencyCode;
  const titleOf = (family: PlantFamily, label: string, row: SimpleTypeRow | GeneratorTypeRow, extra?: ReactNode) => {
    const chip = showsPermissionChip(family) ? permissionStateLabel(row.requestPermissionState) : null;
    const cancelName = CANCEL_BUTTON[family];
    return (
      <span className={s.title}>
        <span className={s.titleText}>{label}</span>
        {extra}
        {chip ? <span className={s.chip}>{chip}</span> : null}
        {cancelName && cancelRequestVisible(family, row) ? (
          <Button
            size="small" appearance="secondary" icon={<DismissRegular />}
            aria-label={cancelName} data-testid={`${cancelName}-${row.id}`}
            disabled title={EXCLUDED.permissionCancel}
          >
            {CANCEL_REQUEST.text}
          </Button>
        ) : null}
      </span>
    );
  };
  const foldButton = (family: PlantFamily, id: string) => {
    const open = expanded.has(id);
    const name = open ? FOLD_ICON[family].up : FOLD_ICON[family].down;
    return (
      <Button
        appearance="transparent" size="small" className={s.foldButton}
        icon={{
          className: mergeClasses(s.foldIcon, !editable && s.foldIconDisabled),
          children: open ? <ChevronUpRegular /> : <ChevronDownRegular />,
        }}
        aria-label={name} aria-expanded={open} data-testid={name}
        disabled={!editable}
        onClick={() => onFold(family, id)}
      />
    );
  };

  const wtgRows: GalleryRow[] = types.map((type) => {
    const model = modelOf(type);
    const label = model?.turbineType ?? type.generatorDisplayName ?? type.name ?? "";
    const rows = turbinesByType.get(type.id) ?? [];
    const isOpen = expanded.has(type.id);
    const pageTotal = pageCount(type.numberOfGenerators ?? rows.length, GENERATORS_PAGE_SIZE);
    const page = Math.min(pages[type.id] ?? 1, Math.max(pageTotal, 1));
    const pageRows = rows.slice((page - 1) * GENERATORS_PAGE_SIZE, page * GENERATORS_PAGE_SIZE);
    const addEnabled = canAddGenerator(rows.length, type.status);
    const setPage = (p: number) => setPages((prev) => ({ ...prev, [type.id]: p }));
    const v = wtgCardValues({ model, type, firstTurbine: rows[0] ?? null, planning });
    return {
      id: type.id,
      selected: selection?.family === "wtg" && selection.id === type.id,
      onSelect: () => onRowClick("wtg", type.id),
      fold: foldButton("wtg", type.id),
      open: isOpen,
      title: (
        <Tooltip relationship="description" withArrow content={model?.displayName ?? ""}>
          <span data-testid="txt_Generators_DisplayProject_Body_Form_GeneratorType">
            {titleOf("wtg", label, type, (
              <>
                <span className={mergeClasses(s.chip, isActive(type.status) && s.chipActive)} data-testid="lbl_Generator_GeneratorStatus">{statusLabel(type.status)}</span>
                {rows.some((r) => overHeightLimit(planning, r.totalHeight))
                  ? <span className={mergeClasses(s.chip, s.heightTag)}>{WTG_CARD_LABELS.heightLimitationTag}</span>
                  : null}
              </>
            ))}
          </span>
        </Tooltip>
      ),
      // The canvas card's 2 × 4 grid, row by row: Supplier · Total Height · Number of Generators ·
      // (empty) / Hub Height · Rotor Diameter · Height Limitation · Generators Capacity.
      cells: isOpen
        ? [v.supplier, v.totalHeight, v.numberOfGenerators, null, v.hubHeight, v.rotorDiameter, v.heightLimitation, v.generatorsCapacity]
        : ["", "", "", null, "", "", "", ""],
      // `pcf_Generators_DisplayProject_Body_Form_GeneratorType_CardDetails_CommandBar` sits at the
      // TOP-LEFT of the expanded card, above the details (canvas / live screen).
      before: !isOpen ? undefined : (
        <div className={s.cardCommandBar}>
          <CommandBar
            ariaLabel={WTG_CARD_LABELS.addGeneratorBarLabel}
            commands={[{
              key: "addGenerator", label: WTG_CARD_LABELS.addGenerator, icon: "Add",
              enabled: editable && addEnabled,
            }]}
            onCommand={() => openTurbine(type, null)}
          />
        </div>
      ),
      expanded: !isOpen ? undefined : (
        <div className={s.expanded}>
          {!addEnabled ? (
            <span className={s.title}>
              <Text className={s.warning}>{WTG_CARD_LABELS.addGeneratorWarning}</Text>
              <Tooltip relationship="description" content={WTG_CARD_LABELS.addGeneratorWarning}>
                <Button
                  appearance="transparent" size="small" icon={<InfoRegular />}
                  aria-label="ibut_GeneralData_DisplayProject_Body_Checklist"
                  data-testid={`ibut_GeneralData_DisplayProject_Body_Checklist-${type.id}`}
                />
              </Tooltip>
            </span>
          ) : null}
          {pagerVisible(type.numberOfGenerators) ? (
            <div className={s.pager}>
              <span>{generatorsTotalRowsText(type.numberOfGenerators ?? 0)}</span>
              <Button
                appearance="subtle" size="small" icon={<ChevronDoubleLeftRegular />} title={PAGER_TOOLTIPS.first}
                aria-label="ico_Generators_DisplayProject_Body_Form_GeneratorType_CardDetails_GeneratorsList_Pagination_FirstPage"
                data-testid={`ico_Generators_DisplayProject_Body_Form_GeneratorType_CardDetails_GeneratorsList_Pagination_FirstPage-${type.id}`}
                disabled={page <= 1} onClick={() => setPage(1)}
              />
              <Button
                appearance="subtle" size="small" icon={<ChevronLeftRegular />} title={PAGER_TOOLTIPS.previous}
                aria-label="ico_Generators_DisplayProject_Body_Form_GeneratorType_CardDetails_GeneratorsList_Pagination_PageLeft"
                data-testid={`ico_Generators_DisplayProject_Body_Form_GeneratorType_CardDetails_GeneratorsList_Pagination_PageLeft-${type.id}`}
                disabled={page <= 1} onClick={() => setPage(page - 1)}
              />
              <span>{paginationText(page, pageTotal)}</span>
              <Button
                appearance="subtle" size="small" icon={<ChevronRightRegular />} title={PAGER_TOOLTIPS.next}
                aria-label="ico_Generators_DisplayProject_Body_Form_GeneratorType_CardDetails_GeneratorsList_Pagination_PageRight"
                data-testid={`ico_Generators_DisplayProject_Body_Form_GeneratorType_CardDetails_GeneratorsList_Pagination_PageRight-${type.id}`}
                disabled={page >= pageTotal} onClick={() => setPage(page + 1)}
              />
            </div>
          ) : null}
          <Table
            size="small" aria-label={WTG_CARD_LABELS.turbineGrid} className={s.turbineTable}
            data-testid="pcf_Generators_DisplayProject_Body_Form_GeneratorType_CardDetails_GeneratorsList"
          >
            <TableHeader>
              <TableRow>
                {/* As the canvas (28 Oct 2026): the name and the icon columns have no header
                    (`ColDisplayName: ""`); the PO's "Generator Name" / "Actions" captions are withdrawn. */}
                <TableHeaderCell className={mergeClasses(s.turbineHead, s.turbineColName)}>{WTG_CARD_LABELS.turbineNameColumn}</TableHeaderCell>
                <TableHeaderCell className={mergeClasses(s.turbineHead, s.turbineColHeight)}>{TURBINE_TABLE_LABELS.totalHeight}</TableHeaderCell>
                <TableHeaderCell className={mergeClasses(s.turbineHead, s.turbineColCapacity)}>{TURBINE_TABLE_LABELS.effectiveCapacity}</TableHeaderCell>
                <TableHeaderCell className={s.turbineColIcon} aria-label={WTG_CARD_LABELS.editIconColumn} />
                <TableHeaderCell className={s.turbineColIcon} aria-label={WTG_CARD_LABELS.deleteIconColumn} />
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.map((t) => (
                <TableRow key={t.id} className={s.turbineRow}>
                  <TableCell>
                    {t.name ?? ""}
                    {overHeightLimit(planning, t.totalHeight)
                      ? <InfoRegular aria-hidden="true" color={palette.Warning} />
                      : null}
                  </TableCell>
                  <TableCell>{fmtHeight(t.totalHeight)}</TableCell>
                  <TableCell>{fmtCapacity(t.effectiveCapacity)}</TableCell>
                  <TableCell>
                    <Button
                      appearance="subtle" size="small" icon={<EditRegular />}
                      aria-label={WTG_CARD_LABELS.editIconColumn}
                      data-testid={`generators-turbine-edit-${t.id}`}
                      disabled={!editable || !isActive(type.status)}
                      onClick={() => openTurbine(type, t)}
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      appearance="subtle" size="small" icon={<DeleteRegular />}
                      aria-label={WTG_CARD_LABELS.deleteIconColumn}
                      data-testid={`generators-turbine-delete-${t.id}`}
                      disabled={!editable || !isActive(type.status)}
                      onClick={() => {
                        writes.clear();
                        setSelection({ family: "wtg", id: type.id });
                        guardThen("wtg", t.effectiveCapacity, { active: isActive(type.status), name: t.name },
                          () => setDialog({ kind: "deleteTurbine", turbine: t }));
                      }}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ),
    };
  });

  const familyRows = (
    family: Exclude<PlantFamily, "wtg">, rows: readonly SimpleTypeRow[],
    title: (r: SimpleTypeRow) => string, cells: (r: SimpleTypeRow) => ReactNode[], width: number,
  ): GalleryRow[] => rows.map((r) => ({
    id: r.id,
    selected: selection?.family === family && selection.id === r.id,
    onSelect: () => onRowClick(family, r.id),
    fold: foldButton(family, r.id),
    open: expanded.has(r.id),
    title: titleOf(family, title(r), r),
    cells: expanded.has(r.id) ? cells(r) : Array.from({ length: width }, () => ""),
  }));

  const pvRows = familyRows("pv", pvQ.data, (r) => r.moduleLabel ?? "", (r) => {
    const v = pvCardValues(r);
    return [v.supplier, v.capacity, v.degradation1stYear, v.degradationRemainingYears];
  }, 4);
  const inverterRows = familyRows("inverter", inverterQ.data, (r) => r.name ?? "", (r) => {
    const v = inverterCardValues(r);
    return [v.inverterType, v.supplier, v.costPerInverter, v.numberOfInverters, v.typeCost, v.nominalPower, v.warranty];
  }, 7);
  const substructureRows = familyRows("substructure", substructureQ.data, (r) => r.name ?? "", (r) => {
    const v = substructureCardValues(r);
    return [v.supplier, v.types, (
      <span key="cost" className={s.title}>
        {v.cost}
        {substructureCostNoteVisible(project?.plantPvCapacity) ? (
          <>
            <Text className={s.note}>{SUBSTRUCTURE_COST_NOTE}</Text>
            <Tooltip relationship="description" content={SUBSTRUCTURE_COST_INFO}>
              <Button
                appearance="transparent" size="small" icon={<InfoRegular />}
                aria-label="info_Generators_DisplayProject_Body_Form_Substructure_CardDetails_SubstructureCost"
                data-testid={`info_Generators_DisplayProject_Body_Form_Substructure_CardDetails_SubstructureCost-${r.id}`}
              />
            </Tooltip>
          </>
        ) : null}
      </span>
    )];
  }, 3);
  const storageRows = familyRows("storage", storageQ.data, (r) => r.name ?? "", (r) => simpleCardValues("storage", r), 3);
  const hydrogenRows = familyRows("hydrogen", hydrogenQ.data, (r) => r.name ?? "", (r) => simpleCardValues("hydrogen", r), 2);
  const substationRows = familyRows("substation", substationQ.data, (r) => r.name ?? "", (r) => simpleCardValues("substation", r), 2);

  /* ── the confirmation popups ── */
  const confirmText = (() => {
    switch (dialog?.kind) {
      case "deleteType": {
        const turbineType = modelOf(dialog.type)?.turbineType ?? dialog.type.generatorDisplayName;
        return { title: DIALOG_LABELS.deleteGeneratorType, text: DIALOG_TEXT.deleteGeneratorType(turbineType), confirm: DIALOG_LABELS.delete };
      }
      case "deleteTurbine":
        return { title: DIALOG_LABELS.deleteGenerator, text: DIALOG_TEXT.deleteGenerator(dialog.turbine.name), confirm: DIALOG_LABELS.delete };
      case "toggleStatus": {
        const d = changeStatusDialog(dialog.type.status);
        const turbineType = modelOf(dialog.type)?.turbineType ?? dialog.type.generatorDisplayName;
        return { title: d.title, text: DIALOG_TEXT.changeStatus(turbineType), confirm: d.confirm };
      }
      case "deleteSimple": {
        const r = dialog.row;
        switch (dialog.family) {
          case "pv": return { title: DIALOG_LABELS.deletePvModuleType, text: DIALOG_TEXT.deletePvModuleType(r.moduleLabel), confirm: DIALOG_LABELS.delete };
          case "inverter": return { title: DIALOG_LABELS.deleteInverterType, text: DIALOG_TEXT.deleteInverterType(r.name), confirm: DIALOG_LABELS.delete };
          case "substructure": return { title: DIALOG_LABELS.deleteSubstructureType, text: DIALOG_TEXT.deleteSubstructureType(r.name), confirm: DIALOG_LABELS.delete };
          case "storage": return { title: DIALOG_LABELS.deleteBess, text: DIALOG_TEXT.deleteBess(r.name), confirm: DIALOG_LABELS.delete };
          case "hydrogen": return { title: DIALOG_LABELS.deleteHydrogen, text: DIALOG_TEXT.deleteHydrogen(r.name), confirm: DIALOG_LABELS.delete };
          case "substation": return { title: DIALOG_LABELS.deleteSubstation, text: DIALOG_TEXT.deleteSubstation(r.name), confirm: DIALOG_LABELS.delete };
        }
        return null;
      }
      case "heightType":
      case "heightTurbine":
        return { title: DIALOG_LABELS.heightExceededTitle, text: DIALOG_TEXT.heightExceeded(dialog.name), confirm: DIALOG_LABELS.yes };
      default:
        return null;
    }
  })();

  /* ── render ── */
  if (loadError) {
    return (
      <div className={s.page} data-testid="Project Generators Screen">
        <EmptyState title={GENERATORS_SCREEN_TEXT.loadFailedTitle} description={GENERATORS_SCREEN_TEXT.loadFailedDescription} />
      </div>
    );
  }

  const bodyVisible = isBodyVisible(project);
  const lockBullets = !locked ? [] : projectId ? pageLock(project) : ["• General", "• Milestones"];
  const typeDirty = (f: string) => typeForm.dirty.has(f);
  const simple = simpleFamily ? SIMPLE_PANEL[simpleFamily] : null;

  return (
    <div className={s.page} data-testid="Project Generators Screen">
      {/* `con_Milestones_Page_LockMessage_1` (X 40, Y 40) is the first thing in the body, above the command bar. */}
      {locked ? (
        <div className={s.lock} role="status" data-testid="con_Milestones_Page_LockMessage_1">
          <LockClosedRegular aria-hidden fontSize={20} color={LOCK_TEXT} />
          <span className={s.lockBullets}>
            <span className={s.lockTitle}>{PAGE_LOCK_TITLE}</span>
            {lockBullets.map((b) => <span key={b}>{b}</span>)}
          </span>
        </div>
      ) : null}

      {/*
        `pcf_Generators_DisplayProject_Body_Form_CommandBar` sits in the screen BODY, above Total
        Capacity — not in the header, where it was squeezed and its first commands clipped.
      */}
      <div className={s.commandBar}>
        <CommandBar commands={commands} onCommand={onCommand} ariaLabel={COMMAND_BAR_LABEL} />
      </div>

      <WriteFeedback progress={writes.progress} error={writes.error} success={writes.success} testIdPrefix="generators" />

      {loading ? <LoadingOverlay mode="inline" /> : null}

      <div className={s.capacity}>
        <ReadOnlyField
          label={TOTAL_CAPACITY_LABEL}
          labelWeight="semibold"
          align="right"
          value={project?.totalCapacity ?? ""}
          testId="txt_Generators_DisplayProject_Body_Form_PlantWtgCapacity"
          ariaLabel="txt_Generators_DisplayProject_Body_Form_PlantWtgCapacity"
        />
      </div>

      {bodyVisible ? (
        <>
          <Gallery
            name="gal_Generators_DisplayProject_Body_Form_GeneratorTypes" selectLabel={SELECT_DOT.wtg}
            disabled={!editable} rows={wtgRows} rowFlow
            columns={[
              TYPE_DETAIL_FIELD_LABELS.supplier, TYPE_DETAIL_FIELD_LABELS.totalHeight,
              TYPE_DETAIL_FIELD_LABELS.numberOfGenerators, null,
              TYPE_DETAIL_FIELD_LABELS.hubHeight, TYPE_DETAIL_FIELD_LABELS.rotorDiameter,
              TYPE_DETAIL_FIELD_LABELS.heightLimitation, TYPE_DETAIL_FIELD_LABELS.generatorsCapacity,
            ]}
          />
          <Gallery
            name="gal_Generators_DisplayProject_Body_Form_PvModule" selectLabel={SELECT_DOT.pv}
            disabled={!editable} rows={pvRows} layout="pv"
            columns={[
              PV_FIELD_LABELS.supplier, PV_FIELD_LABELS.capacity,
              PV_FIELD_LABELS.degradation1stYear, PV_FIELD_LABELS.degradationRemainingYears,
            ]}
          />
          <Gallery
            name="gal_Generators_DisplayProject_Body_Form_Invertors" selectLabel={SELECT_DOT.inverter}
            disabled={!editable} rows={inverterRows}
            columns={[
              INVERTER_CARD_LABELS.inverterType, INVERTER_CARD_LABELS.supplier,
              currencyCaption(INVERTER_CARD_LABELS.costPerInverter, iso),
              INVERTER_CARD_LABELS.numberOfInverters,
              currencyCaption(INVERTER_CARD_LABELS.totalInverterTypeCost, iso),
              INVERTER_CARD_LABELS.nominalPower, INVERTER_CARD_LABELS.warranty,
            ]}
          />
          <Gallery
            name="gal_Generators_DisplayProject_Body_Form_Substructure" selectLabel={SELECT_DOT.substructure}
            disabled={!editable} rows={substructureRows}
            columns={[
              SUBSTRUCTURE_CARD_LABELS.supplier, SUBSTRUCTURE_CARD_LABELS.substructureType,
              currencyCaption(SUBSTRUCTURE_CARD_LABELS.substructureCost, iso),
            ]}
          />
          <Gallery
            name="gal_Generators_DisplayProject_Body_Form_Storage_1" selectLabel={SELECT_DOT.storage}
            disabled={!editable} rows={storageRows} layout="simple"
            columns={[STORAGE_CARD_LABELS.powerCapacity, STORAGE_CARD_LABELS.energyCapacity, STORAGE_CARD_LABELS.supplier]}
          />
          <Gallery
            name="gal_Generators_DisplayProject_Body_Form_Hydrogen" selectLabel={SELECT_DOT.hydrogen}
            disabled={!editable} rows={hydrogenRows} layout="simple"
            columns={[HYDROGEN_CARD_LABELS.capacity, HYDROGEN_CARD_LABELS.supplier]}
          />
          <Gallery
            name="gal_Generators_DisplayProject_Body_Form_Substation_2" selectLabel={SELECT_DOT.substation}
            disabled={!editable} rows={substationRows} layout="simple"
            columns={[SUBSTATION_CARD_LABELS.capacity, SUBSTATION_CARD_LABELS.supplier]}
          />
        </>
      ) : null}

      {/* ── Add Generator Type ── */}
      <FormPanel
        open={panel?.kind === "type"} title={TYPE_PANEL_LABELS.title} width="narrow" onDismiss={close}
        footer={
          <PanelFooter
            primary={typeSaveLabel(typeForm.supplier, inCountry)}
            primaryName="pcf_btn_GeneratorData_RightPanel_Form_Buttons_Save"
            cancelName="pcf_btn_GeneratorData_RightPanel_Form_Buttons_Cancel"
            primaryTooltip={TYPE_PANEL_TOOLTIPS.save} cancelTooltip={TYPE_PANEL_TOOLTIPS.cancel}
            reason={inCountry ? undefined : EXCLUDED.permissionRequest}
            disabled={!inCountry || !typeSaveable}
            onCancel={close}
            onPrimary={onTypeSave}
          />
        }
      >
        <div className={s.panelBody}>
          {/* `con_…_Filter_Country`: the toggle first, then the availability row under it (Y 50). */}
          <Switch
            checked={inCountry}
            label={TYPE_PANEL_LABELS.countryFilter} aria-label="tgl_btn_GeneratorData_RightPanel_Form_Filter_Country"
            data-testid="tgl_btn_GeneratorData_RightPanel_Form_Filter_Country"
            onChange={(_, d) => { setInCountry(d.checked); setTypeForm(emptyTypeForm()); }}
          />
          <div className={s.filterAvailability}>
            <InfoRegular
              aria-hidden="true" fontSize={18} data-testid="ico_GeneratorData_RightPanel_Form_Filter_Message"
              color={inCountry ? palette.Success : palette.Warning}
            />
            <Text data-testid="lbl_GeneratorData_RightPanel_Form_Filter_Message">
              {typeFilterMessage(inCountry, project?.countryName)}
            </Text>
          </div>
          <SelectField
            label={TYPE_PANEL_LABELS.supplier} name="cmb_Supplier" ariaLabel="cmb_Supplier" required
            className={s.typeField} placeholder={TYPE_PANEL_LABELS.findItems}
            value={typeForm.supplier} options={plainOptions(cascade.suppliers)}
            error={typeFieldBlankMessage(typeDirty("supplier"), typeForm.supplier === null)}
            onChange={(v) => touchType("supplier", v)}
          />
          <SelectField
            label={TYPE_PANEL_LABELS.turbineType} name="cmb_Supplier_1" ariaLabel="cmb_Supplier_1" required
            className={s.typeField} placeholder={TYPE_PANEL_LABELS.findItems} disabledClassName={s.comboDisabled}
            disabled={!typeForm.supplier}
            value={typeForm.turbineType} options={plainOptions(cascade.turbineTypes)}
            error={typeFieldBlankMessage(typeDirty("turbineType"), typeForm.turbineType === null)}
            onChange={(v) => touchType("turbineType", v)}
          />
          {/* Rule 5 — a Dummy supplier types the hub height into `txt_…HubHeight_1` instead. */}
          {!dummy ? (
            <SelectField
              label={TYPE_PANEL_LABELS.hubHeight} name="cmb_Supplier_2" ariaLabel="cmb_Supplier_2" required
              className={s.typeField} placeholder={TYPE_PANEL_LABELS.findItems} disabledClassName={s.comboDisabled}
              disabled={!typeForm.turbineType}
              value={typeForm.hubHeight === null ? null : String(typeForm.hubHeight)}
              options={plainOptions(cascade.hubHeights)}
              error={typeFieldBlankMessage(typeDirty("hubHeight"), typeForm.hubHeight === null)}
              onChange={(v) => touchType("hubHeight", Number(v))}
            />
          ) : (
            <InputField
              label={TYPE_PANEL_LABELS.hubHeight} name="txt_GeneratorData_RightPanel_Form_Fields_HubHeight_1"
              ariaLabel="txt_GeneratorData_RightPanel_Form_Fields_HubHeight_1" required className={s.typeField}
              maxLength={256} value={typeForm.revisedHubHeight}
              error={typeForm.revisedHubHeight.trim() !== "" ? validateEffectiveHubHeight(typeForm.revisedHubHeight) : null}
              onChange={(v) => touchType("revisedHubHeight", v)}
            />
          )}
          <InputField
            label={TYPE_PANEL_LABELS.numberOfGenerators} name="txt_GeneratorData_RightPanel_Form_Fields_NumberOfGenerator"
            ariaLabel="txt_GeneratorData_RightPanel_Form_Fields_NumberOfGenerator" required maxLength={6}
            className={s.typeField}
            disabled={effectiveHubHeight === null} value={typeForm.numberOfGenerators}
            error={numberOfGeneratorsMessage(typeForm.numberOfGenerators)}
            onChange={(v) => touchType("numberOfGenerators", v)}
          />
          {typeHeightBlocked ? <Text className={s.pmError}>{HEIGHT_LIMIT_PM_MESSAGE}</Text> : null}
        </div>
      </FormPanel>

      {/* ── Add / Edit Generator (one turbine) ── */}
      <FormPanel
        open={panel?.kind === "turbine"} title={turbinePanelTitle(panelTurbine?.name)} width="narrow"
        onDismiss={close}
        footer={
          <PanelFooter
            primary={PANEL_BUTTONS.save}
            primaryName="pcf_btn_GeneratorData_RightPanel_Form_Generator_Buttons_Save"
            cancelName="pcf_btn_GeneratorData_RightPanel_Form_Generator_Buttons_Cancel"
            disabled={!turbineSaveable}
            onCancel={close}
            onPrimary={onTurbineSave}
          />
        }
      >
        <div className={s.panelBody}>
          <InputField
            label={TURBINE_PANEL_LABELS.generatorType} name="txt_GeneratorData_RightPanel_Form_Fields_GeneratorType"
            readOnly value={panelModel?.turbineType ?? ""} className={s.turbineField}
          />
          {/* `lbl_…_GeneratorName` on top; under it the 180-px right-aligned prefix, then the 80-px index input. */}
          <div className="canvas-field">
            <span data-required="true">{TURBINE_PANEL_LABELS.generatorName}</span>
            <div className={s.prefixRow}>
              <Text className={s.namePrefix} data-testid="lbl_GeneratorData_RightPanel_Form_Fields_GeneratorName_Prefix">
                {turbinePanelPrefix(panelTurbine, project?.shortName)}
              </Text>
              <label className={mergeClasses("canvas-field", s.nameIndex)}>
                <input
                  value={turbineForm.nameIndex}
                  aria-label={TURBINE_PANEL_LABELS.generatorName}
                  data-testid="txt_GeneratorData_RightPanel_Form_Fields_GeneratorName"
                  aria-invalid={turbineNameError ? true : undefined}
                  onChange={(e) => touchTurbine("nameIndex", e.target.value)}
                />
              </label>
            </div>
            {turbineNameError ? <span className="canvas-field-error" role="alert">{turbineNameError}</span> : null}
          </div>
          <InputField
            label={TURBINE_PANEL_LABELS.effectiveCapacity} name="txt_GeneratorData_RightPanel_Form_Fields_Effective_Capacity"
            required maxLength={256} value={turbineForm.effectiveCapacity} className={s.turbineField}
            error={turbineForm.effectiveCapacity.trim() === "" ? null : validateEffectiveCapacity(
              turbineForm.effectiveCapacity, panelModel?.specificCapacity ?? null)}
            onChange={(v) => touchTurbine("effectiveCapacity", v)}
          />
          <Checkbox
            label={TURBINE_PANEL_LABELS.applyAllCapacities} aria-label={TURBINE_PANEL_LABELS.applyAllCapacities}
            data-testid="chk_GeneratorData_RightPanel_Form_Fields_Effective_Capacity_All"
            checked={applyAll.capacity}
            onChange={(_, d) => applyAllChange("capacity", d.checked === true)}
          />
          {applyAll.capacity ? <Text className={s.warning}>{TURBINE_PANEL_LABELS.applyAllWarning}</Text> : null}
          <InputField
            label={TURBINE_PANEL_LABELS.foundationPlinth} name="txt_GeneratorData_RightPanel_Form_Fields_Foundation_Plinth"
            maxLength={256} value={turbineForm.foundationPlinth} className={s.turbineField}
            error={validateFoundationPlinth(turbineForm.foundationPlinth.trim())}
            onChange={(v) => touchTurbine("foundationPlinth", v)}
          />
          <Checkbox
            label={TURBINE_PANEL_LABELS.applyAllWtgs} aria-label={TURBINE_PANEL_LABELS.applyAllWtgs}
            data-testid="chk_GeneratorData_RightPanel_Form_Fields_Foundation_Plinth_All"
            checked={applyAll.plinth}
            onChange={(_, d) => applyAllChange("plinth", d.checked === true)}
          />
          {applyAll.plinth ? <Text className={s.warning}>{TURBINE_PANEL_LABELS.applyAllWarning}</Text> : null}
          <InputField
            // `lbl_…_Effective_HubHeight_Required.Visible: false` — no `*`, though the value is still checked.
            label={TURBINE_PANEL_LABELS.hubHeightExclPlinth} name="txt_GeneratorData_RightPanel_Form_Fields_Effective_HubHeight"
            maxLength={256} value={turbineForm.effectiveHubHeight} className={s.turbineField}
            error={turbineForm.effectiveHubHeight.trim() === "" ? null : validateEffectiveHubHeight(turbineForm.effectiveHubHeight)}
            onChange={(v) => touchTurbine("effectiveHubHeight", v)}
          />
          <Checkbox
            label={TURBINE_PANEL_LABELS.applyAllWtgs} aria-label={TURBINE_PANEL_LABELS.applyAllWtgs}
            data-testid="chk_GeneratorData_RightPanel_Form_Fields_Effective_HubHeight_All"
            checked={applyAll.hubHeight}
            onChange={(_, d) => applyAllChange("hubHeight", d.checked === true)}
          />
          {applyAll.hubHeight ? <Text className={s.warning}>{TURBINE_PANEL_LABELS.applyAllWarning}</Text> : null}
          <InputField
            label={TURBINE_PANEL_LABELS.totalHeight} name="txt_GeneratorData_RightPanel_Form_Fields_Total_Height"
            readOnly disabledLook className={s.turbineField}
            value={turbineHeight === null ? "" : String(turbineHeight)}
          />
          {turbineHeightBlocked ? <Text className={s.pmError}>{HEIGHT_LIMIT_PM_MESSAGE}</Text> : null}
        </div>
      </FormPanel>

      {/* ── Add / Edit PV Module Type ── */}
      <FormPanel
        open={panel?.kind === "pv"} title={selectedPv ? PV_PANEL_TITLES.edit : PV_PANEL_TITLES.add}
        width="narrow" onDismiss={close}
        footer={
          <PanelFooter
            primary={PANEL_BUTTONS.save}
            primaryName="pcf_btn_GeneratorData_RightPanel_Form_PvModuleType_Buttons_Save"
            cancelName="pcf_btn_GeneratorData_RightPanel_Form_PvModuleType_Buttons_Cancel"
            disabled={!pvSaveable} onCancel={close} onPrimary={() => void savePv()}
          />
        }
      >
        <div className={s.panelBody}>
          <InputField
            label={PV_FIELD_LABELS.moduleLabel} name="txt_GeneratorData_RightPanel_Form_PvModuleType_Fields_Label"
            ariaLabel="txt_GeneratorData_RightPanel_Form_PvModuleType_Fields_Label"
            required maxLength={PV_MODULE_LABEL_MAX_LENGTH} value={pvForm.moduleLabel}
            error={pvErrors.moduleLabel} onChange={(v) => touchPv("moduleLabel", v)}
          />
          <InputField
            label={PV_FIELD_LABELS.capacity} name="txt_GeneratorData_RightPanel_Form_PvModuleType_Fields_PVCapacityMW"
            ariaLabel="txt_GeneratorData_RightPanel_Form_PvModuleType_Fields_PVCapacityMW"
            required maxLength={PV_CAPACITY_MAX_LENGTH} value={pvForm.capacity}
            error={pvErrors.capacity} onChange={(v) => touchPv("capacity", v)}
          />
          <SelectField
            label={PV_FIELD_LABELS.supplier} name="cmb_GeneratorData_RightPanel_Form_PvModuleType_Fields_Supplier"
            ariaLabel="cmb_GeneratorData_RightPanel_Form_PvModuleType_Fields_Supplier"
            required placeholder={PV_SUPPLIER_PLACEHOLDER}
            value={pvForm.supplier}
            options={pvOptions.map((o) => ({ value: o.id, label: o.displayName ?? "" }))}
            onChange={(v) => touchPv("supplier", v)}
          />
          {otherSupplierChosen ? (
            <InputField
              label={PV_OTHER_SUPPLIER_LABEL} name="txt_GeneratorData_RightPanel_Form_PvModuleType_Fields_OtherSupplier"
              required maxLength={PV_MODULE_LABEL_MAX_LENGTH} value={pvForm.otherSupplier ?? ""}
              error={pvErrors.otherSupplier} onChange={(v) => touchPv("otherSupplier", v)}
            />
          ) : null}
          <InputField
            label={PV_FIELD_LABELS.degradation1stYear} name="txt_GeneratorData_RightPanel_Form_PvModuleType_Fields_DegradationFirstYear"
            ariaLabel="txt_GeneratorData_RightPanel_Form_PvModuleType_Fields_DegradationFirstYear"
            maxLength={PV_DEGRADATION_MAX_LENGTH} value={pvForm.degradation1stYear}
            error={pvErrors.degradation1stYear} onChange={(v) => touchPv("degradation1stYear", v)}
          />
          <InputField
            label={PV_FIELD_LABELS.degradationRemainingYears} name="txt_GeneratorData_RightPanel_Form_PvModuleType_Fields_DegradationRemainingYears"
            ariaLabel="txt_GeneratorData_RightPanel_Form_PvModuleType_Fields_DegradationRemainingYears"
            maxLength={PV_DEGRADATION_MAX_LENGTH} value={pvForm.degradationRemainingYears}
            error={pvErrors.degradationRemainingYears} onChange={(v) => touchPv("degradationRemainingYears", v)}
          />
        </div>
      </FormPanel>

      {/* ── Add BESS · Add Hydrogen · Add Substation (bound to the selected row) ── */}
      <FormPanel
        open={simple !== null} title={simple?.title ?? ""} width="narrow" onDismiss={close}
        footer={simple ? (
          <PanelFooter
            primary={PANEL_BUTTONS.save} primaryName={simple.save} cancelName={simple.cancel}
            disabled={!simpleSaveable} onCancel={close} onPrimary={() => void saveSimple()}
          />
        ) : null}
      >
        {simple && simpleFamily ? (
          <div className={s.panelBody}>
            <InputField
              label={simple.labelCaption} name={simple.label} ariaLabel={simple.label} required
              value={simpleForm.label} error={simpleErrors?.label} onChange={(v) => touchSimple("label", v)}
            />
            <InputField
              label={simple.capacityCaption} name={simple.capacity} ariaLabel={simple.capacity} required
              maxLength={SIMPLE_CAPACITY_MAX_LENGTH[simpleFamily]} value={simpleForm.capacity}
              error={simpleErrors?.capacity} onChange={(v) => touchSimple("capacity", v)}
            />
            {simple.energy && simple.energyCaption ? (
              <InputField
                label={simple.energyCaption} name={simple.energy} ariaLabel={simple.energy} required
                maxLength={SIMPLE_CAPACITY_MAX_LENGTH.storage} value={simpleForm.energyCapacity}
                error={simpleErrors?.energyCapacity} onChange={(v) => touchSimple("energyCapacity", v)}
              />
            ) : null}
            <InputField
              label={simple.supplierCaption} name={simple.supplier} ariaLabel={simple.supplierAria} required
              value={simpleForm.supplier} error={simpleErrors?.supplier} onChange={(v) => touchSimple("supplier", v)}
            />
          </div>
        ) : null}
      </FormPanel>

      {/* ── G9: Add / Edit Inverter (`con_GeneratorData_RightPanel_Form_Inverter`, hidden in the canvas) ── */}
      <FormPanel
        open={panel?.kind === "inverter"} title={inverterPanelTitle(inverterEditing)} width="narrow" onDismiss={close}
        footer={
          <PanelFooter
            primary={plantPanelSaveLabel(inverterOtherValue)}
            primaryName="pcf_btn_GeneratorData_RightPanel_Form_Inverter_Buttons_Save"
            cancelName="pcf_btn_GeneratorData_RightPanel_Form_Inverter_Buttons_Cancel"
            reason={inverterRequests ? EXCLUDED.permissionRequest : undefined}
            disabled={!inverterSaveable} onCancel={close} onPrimary={() => void saveInverter()}
          />
        }
      >
        <div className={s.panelBody}>
          {inverterCatalogQ.error ? (
            <MessageBar intent="error"><MessageBarBody>{GENERATORS_SCREEN_TEXT.loadFailedTitle}</MessageBarBody></MessageBar>
          ) : null}
          <InputField
            label={INVERTER_PANEL_LABELS.label} name="txt_GeneratorData_RightPanel_Form_Inverter_Fields_Label"
            required maxLength={512} value={inverterForm.label} error={inverterErrors.label}
            onChange={(v) => touchInverter("label", v)}
          />
          <SelectField
            label={INVERTER_PANEL_LABELS.supplier} name="cmb_GeneratorData_RightPanel_Form_Inverter_Fields_Supplier"
            required disabled={inverterEditing} value={inverterForm.supplierId}
            options={inverterOptions.map((o) => ({ value: o.id, label: plantSupplierDisplayName("inverter", o) }))}
            error={inverterErrors.supplier} onChange={(v) => touchInverter("supplierId", v)}
          />
          {inverterOther ? (
            <InputField
              label={INVERTER_PANEL_LABELS.otherSupplier} name="txt_GeneratorData_RightPanel_Form_Inverter_Fields_OtherSupplier"
              required maxLength={512} value={inverterForm.otherSupplier} error={inverterErrors.otherSupplier}
              onChange={(v) => touchInverter("otherSupplier", v)}
            />
          ) : null}
          <MultiSelectField
            label={INVERTER_PANEL_LABELS.inverterType} name="cmb_GeneratorData_RightPanel_Form_Inverter_Fields_InverterType"
            required values={inverterForm.inverterTypes.map(String)} options={choiceOptions(INVERTER_TYPE_LABELS)}
            error={inverterErrors.inverterTypes} onChange={(v) => touchInverter("inverterTypes", v.map(Number))}
          />
          <InputField
            label={INVERTER_PANEL_LABELS.warranty} name="txt_GeneratorData_RightPanel_Form_Inverter_Fields_Warranty"
            required maxLength={6} value={inverterForm.warranty} error={inverterErrors.warranty}
            onChange={(v) => touchInverter("warranty", v)}
          />
          <InputField
            label={INVERTER_PANEL_LABELS.numberOfInverters} name="txt_GeneratorData_RightPanel_Form_Inverter_Fields_NumberOfInverters"
            required maxLength={7} value={inverterForm.numberOfInverters} error={inverterErrors.numberOfInverters}
            onChange={(v) => touchInverter("numberOfInverters", v)}
          />
          <InputField
            label={INVERTER_PANEL_LABELS.nominalPower} name="txt_GeneratorData_RightPanel_Form_Inverter_Fields_NominalPower"
            required value={inverterForm.nominalPower} error={inverterErrors.nominalPower}
            onChange={(v) => touchInverter("nominalPower", v)}
          />
        </div>
      </FormPanel>

      {/* ── G9: Add / Edit Substructure (`con_GeneratorData_RightPanel_Form_Substructure`, hidden in the canvas) ── */}
      <FormPanel
        open={panel?.kind === "substructure"} title={substructurePanelTitle(substructureEditing)} width="narrow" onDismiss={close}
        footer={
          <PanelFooter
            primary={plantPanelSaveLabel(substructureOtherValue)}
            primaryName="pcf_btn_GeneratorData_RightPanel_Form_Substructure_Buttons_Save"
            cancelName="pcf_btn_GeneratorData_RightPanel_Form_Substructure_Buttons_Cancel"
            reason={substructureRequests ? EXCLUDED.permissionRequest : undefined}
            disabled={!substructureSaveable} onCancel={close} onPrimary={() => void saveSubstructure()}
          />
        }
      >
        <div className={s.panelBody}>
          {substructureCatalogQ.error ? (
            <MessageBar intent="error"><MessageBarBody>{GENERATORS_SCREEN_TEXT.loadFailedTitle}</MessageBarBody></MessageBar>
          ) : null}
          <InputField
            label={SUBSTRUCTURE_PANEL_LABELS.label} name="txt_GeneratorData_RightPanel_Form_Substructure_Fields_Label"
            required maxLength={512} value={substructureForm.label} error={substructureErrors.label}
            onChange={(v) => touchSubstructure("label", v)}
          />
          <SelectField
            label={SUBSTRUCTURE_PANEL_LABELS.supplier} name="cmb_GeneratorData_RightPanel_Form_Substructure_Fields_Supplier"
            required disabled={substructureEditing} value={substructureForm.supplierId}
            options={substructureOptions.map((o) => ({ value: o.id, label: plantSupplierDisplayName("substructure", o) }))}
            error={substructureErrors.supplier} onChange={(v) => touchSubstructure("supplierId", v)}
          />
          {substructureOther ? (
            <InputField
              label={SUBSTRUCTURE_PANEL_LABELS.otherSupplier} name="txt_GeneratorData_RightPanel_Form_Substructure_Fields_OtherSupplier"
              required maxLength={512} value={substructureForm.otherSupplier} error={substructureErrors.otherSupplier}
              onChange={(v) => touchSubstructure("otherSupplier", v)}
            />
          ) : null}
          <SelectField
            label={SUBSTRUCTURE_PANEL_LABELS.substructureType} name="cmb_GeneratorData_RightPanel_Form_Substructure_Fields_SubstructureType"
            required value={substructureForm.substructureType === null ? null : String(substructureForm.substructureType)}
            options={choiceOptions(SUBSTRUCTURE_TYPE_LABELS)} error={substructureErrors.substructureType}
            onChange={(v) => touchSubstructure("substructureType", Number(v))}
          />
        </div>
      </FormPanel>

      {/*
        ── G6: Replace Generator (solution 1.21.753). Control names and AccessibleLabels from the 1.21.753
        corpora (skeleton `reference/canvas-accessible-labels.json`), captions from `canvas-labels.json` /
        `REPLACE_LABELS` — the 1.21.709 extract on disk has no such panel. ──
      */}
      <FormPanel
        open={panel?.kind === "replaceWtg"}
        title={replaceGeneratorTitle(selectedTypeModel?.turbineType ?? selectedType?.generatorDisplayName)}
        width={830} onDismiss={close}
        footer={
          <PanelFooter
            primary={REPLACE_LABELS.replace}
            primaryName="pcf_btn_GeneratorData_RightPanel_Form_Buttons_Save_1"
            cancelName="pcf_btn_GeneratorData_RightPanel_Form_Buttons_Cancel_1"
            primaryTooltip={REPLACE_LABELS.replaceTooltip} cancelTooltip={TYPE_PANEL_TOOLTIPS.cancel}
            reason={!replaceWtg.inCountry ? EXCLUDED.permissionRequest
              : selectedType && needsPermissionCancellation(selectedType) ? EXCLUDED.replaceWithOpenRequest : undefined}
            disabled={!replaceWtgOk || (selectedType !== null && needsPermissionCancellation(selectedType))}
            onCancel={close} onPrimary={() => void replaceGeneratorType()}
          />
        }
      >
        <div className={s.replaceGrid}>
          <div className={s.replaceColumn}>
            <Text className={s.replaceHeading}>{REPLACE_LABELS.replaceFrom}</Text>
            {/* The "from" side is the disabled canvas controls: comboboxes keep their chevron. */}
            <SelectField
              label={REPLACE_LABELS.supplier} name="cmb_Supplier_6" ariaLabel="cmb_Supplier" required disabled
              disabledClassName={s.comboDisabled}
              value={selectedTypeModel?.supplier ? "from" : null}
              options={selectedTypeModel?.supplier ? [{ value: "from", label: selectedTypeModel.supplier }] : []}
              onChange={() => {}}
            />
            <SelectField
              label={REPLACE_LABELS.turbineType} name="cmb_Supplier_7" ariaLabel="cmb_Supplier_1" required disabled
              disabledClassName={s.comboDisabled}
              value={selectedTypeModel?.turbineType ? "from" : null}
              options={selectedTypeModel?.turbineType ? [{ value: "from", label: selectedTypeModel.turbineType }] : []}
              onChange={() => {}}
            />
            <InputField
              label={REPLACE_LABELS.hubHeight} name="cmb_Supplier_8" ariaLabel="cmb_Supplier_2" required
              readOnly disabledLook value={fmtHubHeight(selectedTypeModel?.hubHeight)}
            />
            <InputField
              label={REPLACE_LABELS.numberOfGenerators} name="txt_GeneratorData_RightPanel_Form_Fields_NumberOfGenerator_2"
              ariaLabel="txt_GeneratorData_RightPanel_Form_Fields_NumberOfGenerator" required
              readOnly disabledLook value={String(replaceCount)}
            />
          </div>
          <div className={s.replaceColumn}>
            <Text className={s.replaceHeading}>{REPLACE_LABELS.replaceTo}</Text>
            {/* canvas-identity-ignore: 1.21.753-only control */}
            <Switch
              checked={replaceWtg.inCountry}
              label={REPLACE_LABELS.countryFilter} aria-label="tgl_btn_GeneratorData_RightPanel_Form_Filter_Country"
              data-testid="tgl_btn_GeneratorData_RightPanel_Form_Filter_Country_1"
              onChange={(_, d) => setReplaceWtg(emptyReplaceWtg(d.checked))}
            />
            <div className={s.filterAvailability}>
              <InfoRegular aria-hidden="true" fontSize={18} color={replaceWtg.inCountry ? palette.Success : palette.Warning} />
              <Text>{typeFilterMessage(replaceWtg.inCountry, project?.countryName)}</Text>
            </div>
            <SelectField
              label={REPLACE_LABELS.supplier} name="cmb_Supplier_3" ariaLabel="cmb_Supplier" required
              placeholder={TYPE_PANEL_LABELS.findItems}
              value={replaceWtg.supplier} options={plainOptions(replaceCascade.suppliers)}
              onChange={(v) => setReplaceWtg({ ...emptyReplaceWtg(replaceWtg.inCountry), supplier: v })}
            />
            <SelectField
              label={REPLACE_LABELS.turbineType} name="cmb_Supplier_4" ariaLabel="cmb_Supplier_1" required
              placeholder={TYPE_PANEL_LABELS.findItems} disabledClassName={s.comboDisabled}
              disabled={!replaceWtg.supplier} value={replaceWtg.turbineType} options={plainOptions(replaceCascade.turbineTypes)}
              onChange={(v) => setReplaceWtg({ ...replaceWtg, turbineType: v, hubHeight: null, revisedHubHeight: "" })}
            />
            {!replaceDummy ? (
              <SelectField
                label={REPLACE_LABELS.hubHeight} name="cmb_Supplier_5" ariaLabel="cmb_Supplier_2" required
                placeholder={TYPE_PANEL_LABELS.findItems} disabledClassName={s.comboDisabled}
                disabled={!replaceWtg.turbineType}
                value={replaceWtg.hubHeight === null ? null : String(replaceWtg.hubHeight)}
                options={plainOptions(replaceCascade.hubHeights)}
                onChange={(v) => setReplaceWtg({ ...replaceWtg, hubHeight: Number(v), revisedHubHeight: "" })}
              />
            ) : (
              <InputField
                label={REPLACE_LABELS.hubHeight} name="txt_GeneratorData_RightPanel_Form_Fields_HubHeight_2"
                ariaLabel="txt_GeneratorData_RightPanel_Form_Fields_HubHeight_1" required maxLength={256}
                value={replaceWtg.revisedHubHeight}
                error={replaceWtg.revisedHubHeight.trim() !== "" ? validateEffectiveHubHeight(replaceWtg.revisedHubHeight) : null}
                onChange={(v) => setReplaceWtg({ ...replaceWtg, revisedHubHeight: v })}
              />
            )}
            <InputField
              label={REPLACE_LABELS.numberOfGenerators} name="txt_GeneratorData_RightPanel_Form_Fields_NumberOfGenerator_1"
              ariaLabel="txt_GeneratorData_RightPanel_Form_Fields_NumberOfGenerator" required
              readOnly disabledLook value={String(replaceCount)}
            />
            {replaceHeightBlocked ? <Text className={s.pmError}>{HEIGHT_LIMIT_PM_MESSAGE}</Text> : null}
          </div>
        </div>
      </FormPanel>

      {/* ── G6: Replace PV Module Type (solution 1.21.753; names and labels as for Replace Generator) ── */}
      <FormPanel
        open={panel?.kind === "replacePv"} title={replacePvTitle(selectedPv?.moduleLabel)} width={700} onDismiss={close}
        footer={
          <PanelFooter
            primary={REPLACE_LABELS.replace}
            primaryName="pcf_btn_GeneratorData_RightPanel_Form_PvModuleType_Buttons_Save_2"
            cancelName="pcf_btn_GeneratorData_RightPanel_Form_PvModuleType_Buttons_Cancel_1"
            reason={selectedPv && needsPermissionCancellation(selectedPv) ? EXCLUDED.replaceWithOpenRequest : undefined}
            disabled={!replacePvOk || (selectedPv !== null && needsPermissionCancellation(selectedPv))}
            onCancel={close} onPrimary={() => void replacePvType()}
          />
        }
      >
        <div className={mergeClasses(s.replaceGrid, s.replaceGridPv)}>
          <div className={s.replaceColumn}>
            <Text className={s.replaceHeading}>{REPLACE_LABELS.replaceFrom}</Text>
            <InputField
              label={PV_FIELD_LABELS.moduleLabel} name="txt_GeneratorData_RightPanel_Form_PvModuleType_Fields_Label_1"
              ariaLabel="txt_GeneratorData_RightPanel_Form_PvModuleType_Fields_Label" required
              readOnly disabledLook value={selectedPv?.moduleLabel ?? ""}
            />
            <InputField
              label={PV_FIELD_LABELS.capacity} name="txt_GeneratorData_RightPanel_Form_PvModuleType_Fields_PVCapacityMW_1"
              ariaLabel="txt_GeneratorData_RightPanel_Form_PvModuleType_Fields_PVCapacityMW" required readOnly disabledLook
              value={selectedPv ? pvPrefill(selectedPv.capacity) : ""}
            />
            <SelectField
              label={PV_FIELD_LABELS.supplier} name="cmb_GeneratorData_RightPanel_Form_PvModuleType_Fields_Supplier_1"
              ariaLabel="cmb_GeneratorData_RightPanel_Form_PvModuleType_Fields_Supplier" required disabled
              disabledClassName={s.comboDisabled}
              value={selectedPv ? "from" : null}
              options={selectedPv ? [{ value: "from", label: pvCardValues(selectedPv).supplier }] : []}
              onChange={() => {}}
            />
            <InputField
              label={PV_FIELD_LABELS.degradation1stYear} name="txt_GeneratorData_RightPanel_Form_PvModuleType_Fields_DegradationFirstYear_1"
              ariaLabel="txt_GeneratorData_RightPanel_Form_PvModuleType_Fields_DegradationFirstYear" readOnly disabledLook
              value={selectedPv ? pvPrefill(selectedPv.degradation1stYear) : ""}
            />
            <InputField
              label={PV_FIELD_LABELS.degradationRemainingYears} name="txt_GeneratorData_RightPanel_Form_PvModuleType_Fields_DegradationRemainingYears_1"
              ariaLabel="txt_GeneratorData_RightPanel_Form_PvModuleType_Fields_DegradationRemainingYears" readOnly disabledLook
              value={selectedPv ? pvPrefill(selectedPv.degradationRemainingYears) : ""}
            />
          </div>
          <div className={s.replaceColumn}>
            <Text className={s.replaceHeading}>{REPLACE_LABELS.replaceTo}</Text>
            <InputField
              label={PV_FIELD_LABELS.moduleLabel} name="txt_GeneratorData_RightPanel_Form_PvModuleType_Fields_Label_2"
              ariaLabel="txt_GeneratorData_RightPanel_Form_PvModuleType_Fields_Label"
              required maxLength={PV_MODULE_LABEL_MAX_LENGTH} value={replacePvForm.moduleLabel}
              error={replacePvErrors.moduleLabel} onChange={(v) => touchReplacePv("moduleLabel", v)}
            />
            <InputField
              label={PV_FIELD_LABELS.capacity} name="txt_GeneratorData_RightPanel_Form_PvModuleType_Fields_PVCapacityMW_2"
              ariaLabel="txt_GeneratorData_RightPanel_Form_PvModuleType_Fields_PVCapacityMW"
              required maxLength={PV_CAPACITY_MAX_LENGTH} value={replacePvForm.capacity}
              error={replacePvErrors.capacity} onChange={(v) => touchReplacePv("capacity", v)}
            />
            <SelectField
              label={PV_FIELD_LABELS.supplier} name="cmb_GeneratorData_RightPanel_Form_PvModuleType_Fields_Supplier_2"
              ariaLabel="cmb_GeneratorData_RightPanel_Form_PvModuleType_Fields_Supplier"
              required placeholder={PV_SUPPLIER_PLACEHOLDER} value={replacePvForm.supplier}
              options={pvOptions.map((o) => ({ value: o.id, label: o.displayName ?? "" }))}
              onChange={(v) => touchReplacePv("supplier", v)}
            />
            {replacePvOther ? (
              // The 1.21.753 corpora name the caption (`lbl_…_OtherSupplier_2`) but not the input: a stable id.
              <InputField
                label={PV_OTHER_SUPPLIER_LABEL} name="generators-replace-pv-other-supplier"
                required maxLength={PV_MODULE_LABEL_MAX_LENGTH} value={replacePvForm.otherSupplier ?? ""}
                error={replacePvErrors.otherSupplier} onChange={(v) => touchReplacePv("otherSupplier", v)}
              />
            ) : null}
            <InputField
              label={PV_FIELD_LABELS.degradation1stYear} name="txt_GeneratorData_RightPanel_Form_PvModuleType_Fields_DegradationFirstYear_2"
              ariaLabel="txt_GeneratorData_RightPanel_Form_PvModuleType_Fields_DegradationFirstYear"
              maxLength={PV_DEGRADATION_MAX_LENGTH} value={replacePvForm.degradation1stYear}
              error={replacePvErrors.degradation1stYear} onChange={(v) => touchReplacePv("degradation1stYear", v)}
            />
            <InputField
              label={PV_FIELD_LABELS.degradationRemainingYears} name="txt_GeneratorData_RightPanel_Form_PvModuleType_Fields_DegradationRemainingYears_2"
              ariaLabel="txt_GeneratorData_RightPanel_Form_PvModuleType_Fields_DegradationRemainingYears"
              maxLength={PV_DEGRADATION_MAX_LENGTH} value={replacePvForm.degradationRemainingYears}
              error={replacePvErrors.degradationRemainingYears} onChange={(v) => touchReplacePv("degradationRemainingYears", v)}
            />
          </div>
        </div>
      </FormPanel>

      {/* ── confirmations ── */}
      <ConfirmDialog
        open={confirmText !== null}
        title={confirmText?.title ?? ""}
        description={confirmText?.text ?? ""}
        confirmText={confirmText?.confirm ?? DIALOG_LABELS.delete}
        cancelText={DIALOG_LABELS.cancel}
        // As the canvas `cmp_PopUp_Confirmation` here (screenshot 28 Oct 2026): a blue "✓ Delete",
        // 128 wide, on the flat rounded card with no divider — not the red "destructive" button.
        confirmIcon="checkmark" confirmWidth={128} canvasFooter footerDivider={false}
        onCancel={closeDialog}
        onConfirm={() => void onConfirm()}
      />

      {/* ── `con_PopUp_Common_Generators_PreventTotalCapacity` — information only ── */}
      <Dialog open={dialog?.kind === "blocked"} onOpenChange={(_, d) => { if (!d.open) closeDialog(); }}>
        <DialogSurface aria-label={LAST_CAPACITY_TITLES.delete}>
          <DialogBody>
            <DialogTitle>{LAST_CAPACITY_TITLES.delete}</DialogTitle>
            <DialogContent>
              {dialog?.kind === "blocked" && dialog.reason !== "Capacity"
                ? opexDependencyMessage(dialog.reason, dialog.name)
                : LAST_CAPACITY_MESSAGES.delete}
            </DialogContent>
            <DialogActions>
              <Button
                appearance="primary" aria-label={DIALOG_LABELS.close}
                data-testid="btn_PopUp_Common_Generators_PreventTotalCapacity_Information_Close"
                onClick={closeDialog}
              >
                {DIALOG_LABELS.close}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      {/* ── `cmp_PopUp_Common_Generators_Information` — the Add Substructure precondition (G9) ── */}
      <Dialog open={dialog?.kind === "info"} onOpenChange={(_, d) => { if (!d.open) closeDialog(); }}>
        <DialogSurface aria-label={SUBSTRUCTURE_MSG.infoTitle}>
          <DialogBody>
            <DialogTitle>{dialog?.kind === "info" ? dialog.title : ""}</DialogTitle>
            <DialogContent>{dialog?.kind === "info" ? dialog.text : ""}</DialogContent>
            <DialogActions>
              <Button
                appearance="primary" icon={<CheckmarkRegular />} aria-label={SUBSTRUCTURE_MSG.infoOk}
                data-testid="pcf_PopUpInformation_BodyButtons_Ok"
                onClick={closeDialog}
              >
                {SUBSTRUCTURE_MSG.infoOk}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
}

