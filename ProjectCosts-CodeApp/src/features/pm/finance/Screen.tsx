/**
 * Project Finance Screen — composition only (connected 20 Oct 2026, D34).
 *
 * Canvas screen: `Project Finance Screen` (PM app,
 * `ProjectDocs/_extracted/msapp/projectmanagement/Src/Project Finance Screen.pa.yaml`). Every branch this
 * file takes is a call into `./rules`; every caption comes from `./rules` (`FIN_LABEL`,
 * `TRANCHE_FORM_LABEL`, `CHOICE_LABEL`, `MSG`, …). Reads and writes go through `./hooks`.
 *
 * Canvas control map:
 *   `con_Milestones_Page_LockMessage_8`                          → the lock message
 *   `con_ProjectFinance_DisplayProjectBodyRight_FinancingOptions` → the Financing Options radio
 *   `gal_ProjectFinance_DisplayProject_Body_Form_FinancingInputs` → one `CategoryCard` per
 *                                                                   category (Order ≠ 6)
 *   `pcf_ProjectRevenues_Content_ContractCommandBar_2`            → the card command bar
 *   `pcf_FinancingInputs_Content_SeniroDebtTranche_CommandBar`    → the senior-debt command bar
 *   `gal_SeniorDebt_Data_Display_TrancheData_Card`                → one card per tranche
 *   `con_DSRA_DSRF_Data_Buttons`                                  → the DSRA/DSRF card buttons
 *   `con_GeneralData_RightPanel_*_Form`                           → the five panels
 *   `cmp_PopUp_Confirmation_1`, `cmp_PopUp_ActivationForSeniorDebtTranche`,
 *   `cmp_PopUp_Confirmation_3`                                    → the three ConfirmDialogs
 *   `cmp_ProjectFinanceScreen_PopUp_Loading`                      → LoadingOverlay / WriteFeedback
 *
 * The command bars live INSIDE their cards, as in the canvas; nothing is portalled into the
 * header `CommandSlot`. The hidden `btn_…_Form_Button_Reset*` buttons the canvas `Select()`s only
 * reset a panel's controls: each panel's draft is rebuilt from the stored row when it opens.
 *
 * No leave guard (D35): the canvas Finance screen has no leave dialog. Its header logo / left
 * navigation test Planning's `colPlanningFormValidation` and set `locLeavePlanningConfirmationDialog`,
 * which no control on this screen shows (copy-paste SOURCE DEFECT; navigation is then silently
 * dropped). Standard values render blue + italic (rule 20): `financeCardStandard` for the cards,
 * each panel's own flags for the inputs.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Button, Dropdown, MessageBar, MessageBarBody, Option, Switch, Text, Tooltip,
  makeStyles, mergeClasses, tokens,
} from "@fluentui/react-components";
import {
  AddRegular, ArrowClockwiseRegular, CalendarAddRegular, CheckmarkCircleRegular, 
  DeleteRegular, DismissCircleRegular, EditRegular, LockClosedRegular,
} from "@fluentui/react-icons";
import {
  type Command, CommandBar, ConfirmDialog, DateField, EmptyState, FIELD_APPEARANCE, FormPanel, LoadingOverlay,
  PanelButtons, ReadOnlyField, TextField, WriteFeedback, useFieldControlClass, useStandardValueClass,
  ExpandChevron,
} from "@/components";
import { DATE_PICKER_FORMAT, dateFromIso, type CanvasDateFormat } from "@/domain/canvasDate";
import { useSession } from "@/app/SessionContext";
import { CHOICE_FINANCE } from "@/data/dataverseNames";
import { palette, space } from "@/theme/tokens";
import {
  CARD_FORMAT, CATEGORY_CARD_ORDERS, CATEGORY_ORDER, CHOICE_LABEL, DSRA_TOGGLE_LABEL,
  FINANCE_SCREEN_TEXT, FINANCING_OPTION_LABEL, FIN_LABEL, FREQUENCY_OPTIONS, INPUT_COL, MSG,
  PAGE_LOCK_TITLE, STATUS_LABEL, TRANCHE_FORM_LABEL, TRANCHE_STATUS_LABEL, BASE_RATE_OPTION_LABEL,
  applyDsraTypeChange, applyTrancheStatusChange, bankDisplayName, baseRateOptions, buildCategoryMap,
  buildDecommissioningStandard, buildDsraStandard, buildSeniorDebtStandard, canSaveDecommissioning,
  canSaveDsra, canSaveSeniorDebtTranche, canSaveVatFinancing, canSeedStepUp, categoryCommandBar,
  categoryCommandLabel, categoryToggleDialog, categoryToggleJob, commitmentFeeFreePeriodLabel,
  currencySuffix, decommissioningDurationLabel, decommissioningSaveJob, defaultEndOfDebtServiceSavings,
  dsraCardToggle, dsraPeriodLabel, dsraSaveJob, dsraToggleDialog, dsraToggleJob, durationOptionName,
  durationRange, endDateOfSaving, equitySaveJob, firstStepUpRow, fmtAmount as fmtAmountIn, fmtCard as fmtCardIn, fmtDateDots,
  fmtLongDate, formatDscr as formatDscrIn, formatUpfrontFee as formatUpfrontFeeIn, financingOptionJob, freeEquityLabel, isOtherBank,
  isPageLocked, isTrancheFolded, mmyyLabel, openDecommissioningForm, openDsraForm, openEquityForm,
  openTrancheForm, openVatForm, pageLock, planCategoryToggle, planDecommissioningSave, planDsraSave,
  planDsraToggle, planEquitySave, planFinancingOption, planFinancingOptionOnVisit, planSeeds,
  planTrancheDelete, planTrancheSave, planTrancheToggle, planVatSave, regenerateRepaymentYears,
  repaymentRowsOf, seedJobs, seedsAllowed, seniorDebtCommandBar, shareholderLoan, standardAssumptionConflict,
  stepUpAddEnabled, stepUpRemoveEnabled, stepUpRowsOf, stepUpScheduleValid, stepUpYearOptions,
  toDebtTech, toggleCategoryFold, totalDecommissioningCost, trancheActionDialog, trancheDeleteJob,
  trancheDisplayName, trancheSaveJob, trancheStatusRadioDisabled, trancheToggleJob, trancheUniqueKey,
  unpackMMYY, validateCommitmentFeeValue, validateCostOfGuarantee, validateDateOfExpiry,
  validateDateOfIssue, validateDecommissioningValue, validateDscr, validateDsraMargin,
  validateDsraUpfrontFee, validateEndOfDebtServiceSavings, validateFixedAmount, validateFreeEquity,
  validateHedging, validatePofds, validateRateField, validateRepaymentAmount, validateStartDateOfSaving,
  validateStepUpMargin, validateTenorAgainstRepaymentStart, validateUpfrontFee, validateVatBankMargin,
  validateVatFacilityAmount, validateYearMonthPair, vatBaseRateDefault, vatSaveJob, yearMonthLabel,
  type DecommissioningForm, type DsraForm, type EquityForm, type FinancingInputRow,
  type FreeEquityMode, type RepaymentRow, type SeniorDebtFormState, type StepUpRow, type TrancheRow,
  type VatForm,
  financeCardStandard, trancheFinancialCloseIsStandard,
  PANEL_MAX_LENGTH, shouldRegenerateRepayments, stepUpPeriodChangeAllowed, trancheFormTitle,
} from "./rules";
import {
  fetchTrancheDuplicates, useActiveTurbineCount, useBanks, useDebtAssumptions, useFinanceProject,
  useFinanceWrites, useFinancingCategories, useFinancingInputs, useKfwTranches, useRepaymentAmounts,
  useStepUpMargins, useTotalDevexCapex,
} from "./hooks";

/* ═══════════════════════════════════════════════════════════════════ styles ══ */

// Layout transcribed from `con_ProjectFinance_DisplayProjectBodyRightContent` and its gallery
// (UI layout pass, 20 Oct 2026). Sizes are canvas points x 1.333 (`gblAppSizes.Font.ExtraSmall` 9 =
// 12 px); `gblAppSizes.Position.X` = 20, `gblAppSizes.Padding.Page` = 10. The shell's content area
// scrolls, so the page grows with its content and never clips itself to the viewport.
const useStyles = makeStyles({
  /** The command bar's first icon starts on the left edge of the content under it (PO, 21 Oct 2026); `CommandBar` has no inset of its own. Category bars over the first caption ("Free Equity [%]", "Base Rate", …); the tranche bar over "Term Sheet". */
  commandBar: { paddingLeft: "20px" },
  // The right content: white, vertical, PaddingLeft 15 / PaddingRight 15, no gap. It fills the shell's
  // content area and does not scroll itself: the lock banner and Financing Options stay at the top and
  // the category gallery (`Height: Parent.Height - 130`, Y:2432) is the scroller (PO screenshots, 21 Oct 2026).
  page: {
    display: "flex", flexDirection: "column", minWidth: 0, flex: "1 1 0", minHeight: 0, overflow: "hidden",
    paddingLeft: "15px", paddingRight: "15px", paddingBottom: "15px",
    backgroundColor: palette.white, boxSizing: "border-box",
  },
  // `con_Milestones_Page_LockMessage_8`: Fill RGBA(89, 89, 89, 1), horizontal, gap 10, PaddingLeft 20,
  // items centred; white text in `con_Milestones_pagelock_section_8` (padding 8).
  lock: {
    display: "flex", gap: "10px", alignItems: "center", paddingLeft: "20px",
    backgroundColor: "rgb(89, 89, 89)", color: "#ffffff",
  },
  lockLines: { display: "flex", flexDirection: "column", paddingTop: "8px", paddingBottom: "8px", paddingLeft: "8px", paddingRight: "8px" },
  lockText: { color: "#ffffff" },
  // `con_ProjectFinance_DisplayProjectBodyRight_FinancingOptions`: 110 high, PaddingTop 10; the
  // caption (Semibold) at X 20, Y 10 and the radio under it.
  options: {
    display: "flex", alignItems: "flex-start", minHeight: "110px", boxSizing: "border-box", flex: "none",
    paddingTop: "20px", paddingLeft: "20px", paddingRight: "20px",
    "& legend": { fontWeight: 600 },
  },
  // `gal_ProjectFinance_DisplayProject_Body_Form_FinancingInputs`: X 20, `Parent.Width - 40` wide,
  // TemplatePadding 0, `Height: Parent.Height - 130` — the list scrolls on its own, its scrollbar at
  // the right of the list; a subtle shadow on its right edge (PO screenshot).
  gallery: {
    display: "flex", flexDirection: "column", marginLeft: "20px", marginRight: "20px", minWidth: 0,
    flex: "1 1 auto", minHeight: 0, overflowY: "auto", overflowX: "hidden",
    boxShadow: "inset -1px 0 0 rgba(0, 0, 0, 0.06), 2px 0 4px -2px rgba(0, 0, 0, 0.12)",
  },
  // `con_…_FinancingInputs_Card`: white, no border, `Parent.Width - 10` wide.
  card: { backgroundColor: palette.white, marginRight: "10px", minWidth: 0, flex: "none" },
  // `con_Generators_…_GeneratorType_CardHeader_1` (canvas 42 high; 46 in the PO screenshot): the name at
  // X 10, the status pill and the chevron at the right; a 1 px RGBA(0, 120, 212, 1) rule under it.
  cardHeader: {
    display: "flex", alignItems: "center", gap: "10px", height: "46px", boxSizing: "border-box",
    paddingLeft: "10px", paddingRight: "2px",
    borderBottom: "1px solid rgb(0, 120, 212)",
  },
  // `txt_Generators_…_GeneratorType_1`: Text@0.0.51, Regular; ~15 px in the PO screenshot.
  cardTitle: {
    flexGrow: 1, minWidth: 0, fontSize: "15px", fontWeight: 400, color: palette.black,
    textAlign: "left", justifyContent: "flex-start",
    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
  },
  // `ico_…_Up_1` / `_Down_1`: a 20 x 18 icon in `gblAppColors.Icon.Color` (themePrimary).
  chevron: { minWidth: "30px", width: "30px", height: "30px", color: palette.themePrimary },
  // `con_Generator_GeneratorStatus_1` / `con_FinancingInputs_SeniorDebt_Status`: 24 high, a pill
  // (radius 34), 1 px border Green (Active) or Grayscale10, Fill SuccessLight or Grayscale40; the label
  // is ExtraSmall (9 pt), Grayscale00, centred, 80 wide.
  // Canvas 24 high, label 80 wide; ~90 x 28 in the PO screenshot.
  status: {
    display: "inline-flex", alignItems: "center", justifyContent: "center", flex: "none",
    height: "28px", minWidth: "90px", boxSizing: "border-box", paddingLeft: "8px", paddingRight: "8px",
    fontSize: "12px", color: palette.Grayscale00,
    borderTopWidth: "1px", borderRightWidth: "1px", borderBottomWidth: "1px", borderLeftWidth: "1px",
    borderTopStyle: "solid", borderRightStyle: "solid", borderBottomStyle: "solid", borderLeftStyle: "solid",
    borderTopLeftRadius: "34px", borderTopRightRadius: "34px", borderBottomLeftRadius: "34px", borderBottomRightRadius: "34px",
  },
  statusActive: {
    backgroundColor: palette.SuccessLight,
    borderTopColor: palette.Green, borderRightColor: palette.Green, borderBottomColor: palette.Green, borderLeftColor: palette.Green,
  },
  statusInactive: {
    backgroundColor: palette.Grayscale40,
    borderTopColor: palette.Grayscale10, borderRightColor: palette.Grayscale10, borderBottomColor: palette.Grayscale10, borderLeftColor: palette.Grayscale10,
  },
  // `con_Finance_…_FinanceInputType_CardDetails`: vertical, gap 10; command bars are 40 high.
  cardBody: { display: "flex", flexDirection: "column", gap: "10px", paddingTop: "5px", paddingBottom: "10px" },
  /*
   * The field rows (`con_…_General_Fields`, `con_Decommissioning_Data_Display_Tranche_1`, …): PaddingTop 10,
   * 70-high tiles, each a View-mode `TextInput@0.0.54` (the filled grey box, PO screenshot) under a
   * Semibold label, both at X 20. Equity and VAT are a row of 300-wide tiles (~290 boxes in the PO
   * screenshot); Decommissioning, the tranches and DSRA/DSRF are the 4-column grid of the screenshots
   * (the canvas wraps 320-wide tiles, `lbl_ColumnsToShowValue = RoundDown((Width - 30) / 320)`).
   */
  fields: {
    // 320-wide columns as the canvas wraps them, at most four (the PO screenshots): 4 at 1919, 3 at 1366.
    display: "grid", gridTemplateColumns: "repeat(auto-fill, 320px)", maxWidth: "1280px", paddingTop: "10px", rowGap: "4px",
    "& > .fui-Field": {
      minWidth: 0, minHeight: "70px", boxSizing: "border-box", paddingLeft: "20px", paddingRight: "20px", rowGap: "5px",
    },
    "& .fui-Field__label": { fontWeight: 600, fontSize: "14px" },
    "& .fui-Input__input": { color: palette.black },
  },
  fieldsRow: {
    display: "flex", flexWrap: "wrap",
    "& > .fui-Field": { width: "320px", paddingRight: "10px" },
  },
  // DSRA / DSRF: `TextInput` `Appearance: FilledLighter` on white — plain text, no box — `FontWeight:
  // Semibold`; the captions `lbl_Decommissioning_Data_Display_Card_*_3` are Regular, Grayscale10, PaddingLeft 10.
  dsraFields: {
    "& .fui-Field__label": { fontWeight: 400, color: palette.Grayscale10, paddingLeft: "10px" },
    "& .fui-Input": {
      borderTopColor: "transparent", borderRightColor: "transparent", borderBottomColor: "transparent", borderLeftColor: "transparent",
      backgroundColor: "transparent", "::after": { display: "none" },
    },
    "& .fui-Input__input": { fontWeight: 600 },
  },
  // `con_Decommissioning_Data_Display_Card_Duration_of_Saving_3` (Type): full width, 55 high.
  dsraType: { gridTemplateColumns: "320px", "& > .fui-Field": { minHeight: "55px" } },
  /*
   * `DisplayMode.Disabled` on a modern `TextInput` (`txt_EquityData_ShareholderLoanEUR`,
   * `txt_DecommissioningData_End_Date_of_Saving_1`): white box, grey border, grey text (PO screenshot) —
   * the Fluent disabled look, which the shared skin otherwise replaces with the filled box.
   */
  disabledBox: {
    "& .fui-Input": {
      backgroundColor: palette.white,
      boxShadow: `inset 0 0 0 1px ${tokens.colorNeutralStrokeDisabled}`,
    },
    "& .fui-Input__input": { color: tokens.colorNeutralForegroundDisabled },
  },
  // A `ComboBox@0.0.51` (the `cmb_…` controls): the filled box with its bottom underline (PO screenshot).
  comboUnderline: {
    boxShadow: `inset 0 -1px 0 ${tokens.colorNeutralStrokeAccessible}`,
  },
  // `con_SeniorDebt_Data_Display_Card_General_Tag`: 40 high; the Semibold caption at X 20, Y 15 and a
  // 5 px Grayscale20 bar under it at Y 38, as wide as the caption box.
  tag: {
    display: "flex", flexDirection: "column", height: "40px", boxSizing: "border-box",
    paddingTop: "15px", marginLeft: "20px", marginRight: "20px",
    fontWeight: 600, color: palette.black,
  },
  tagRule: { display: "block", height: "5px", marginTop: "3px", backgroundColor: palette.Grayscale20 },
  // `gal_SeniorDebt_Data_Display_TrancheData_Card`: centred, `Parent.Width - 30` wide, PaddingBottom 20.
  trancheList: { display: "flex", flexDirection: "column", marginLeft: "15px", marginRight: "15px", paddingBottom: "20px" },
  // `con_FinancingInput_…_SeniorDebt_CardHeader`: 42 high, DropShadow Semilight, the name Semibold at
  // X 30, a 2 px Grayscale20 line at Y 40.
  tranche: { backgroundColor: palette.white },
  trancheHeader: {
    display: "flex", alignItems: "center", gap: "10px", height: "42px", boxSizing: "border-box",
    paddingLeft: "5px", paddingRight: "2px",
    boxShadow: "0 1.6px 3.6px rgba(0, 0, 0, 0.13), 0 0.3px 0.9px rgba(0, 0, 0, 0.11)",
    borderBottom: `2px solid ${palette.Grayscale20}`,
  },
  trancheTitle: { fontWeight: 600 },
  trancheSelected: { backgroundColor: palette.neutralLighter },
  // `con_DSRA_DSRF_Data_Buttons`: 60 high; Edit (80 wide, X 15) then Activate / Deactivate (110 wide,
  // X 110), both Transparent with a 2 px themePrimary border and themePrimary text.
  dsraButtons: { display: "flex", alignItems: "flex-start", gap: "15px", height: "60px", paddingTop: "5px", paddingLeft: "15px", boxSizing: "border-box" },
  dsraButton: {
    color: palette.themePrimary,
    borderTopWidth: "2px", borderRightWidth: "2px", borderBottomWidth: "2px", borderLeftWidth: "2px",
    borderTopColor: palette.themePrimary, borderRightColor: palette.themePrimary,
    borderBottomColor: palette.themePrimary, borderLeftColor: palette.themePrimary,
    "& .fui-Button__icon": { color: palette.themePrimary },
    // Disabled: no visible box, just the greyed pencil and label (PO screenshot, 21 Oct 2026).
    ":disabled": {
      color: tokens.colorNeutralForegroundDisabled,
      borderTopColor: "transparent", borderRightColor: "transparent",
      borderBottomColor: "transparent", borderLeftColor: "transparent",
      "& .fui-Button__icon": { color: tokens.colorNeutralForegroundDisabled },
    },
  },
  dsraEdit: { minWidth: "80px" },
  dsraToggle: { minWidth: "110px" },
  buttons: { display: "flex", gap: space.s, flexWrap: "wrap" },
  panel: { display: "flex", flexDirection: "column", gap: space.m, minWidth: 0 },
  pair: { display: "flex", gap: "20px", alignItems: "flex-end" },
  // The tranche panel columns (350 / 340 / 350); they wrap when the panel is narrower.
  trancheColumns: { display: "flex", flexWrap: "wrap", columnGap: "20px", rowGap: space.m, alignItems: "flex-start" },
  trancheColumn: { display: "flex", flexDirection: "column", gap: space.m, flex: "1 1 300px", maxWidth: "350px", minWidth: 0 },
  pairItem: { flexGrow: 1, flexBasis: 0, minWidth: 0 },
  withAction: { display: "flex", gap: space.xs, alignItems: "flex-end" },
  grow: { flexGrow: 1, minWidth: 0 },
  dropdown: { minWidth: "0px", width: "100%" },
  error: { color: palette.Error, fontSize: tokens.fontSizeBase200 },
  sectionTitle: { fontWeight: tokens.fontWeightSemibold },
  resetIcon: { color: palette.themePrimary, minWidth: "32px" },
});

/* ═══════════════════════════════════════════════════════════════ value reads ══ */

const num = (v: unknown): number | null => (typeof v === "number" ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
/** A Date Only string from the row as a LOCAL day (rule 18). */
const day = (v: unknown): Date | null => {
  if (typeof v !== "string" || v.length < 10) return null;
  const [y, m, d] = v.slice(0, 10).split("-").map(Number);
  return y && m && d ? new Date(y, m - 1, d) : null;
};
const label = (map: Readonly<Record<number, string>>, v: number | null): string =>
  v === null ? "" : map[v] ?? "";
const options = (map: Readonly<Record<number, string>>): { value: number; name: string }[] =>
  Object.entries(map).map(([value, name]) => ({ value: Number(value), name }));
const years = (max: number) => durationRange(max).map((n) => ({ value: n, name: durationOptionName(n, "year") }));
const months = durationRange(11).map((n) => ({ value: n, name: durationOptionName(n, "month") }));
const baseRateChoices = (country: string | null) =>
  baseRateOptions(country).map((o) => ({ value: o, name: label(BASE_RATE_OPTION_LABEL, o) }));

/* ════════════════════════════════════════════════════════════ field helpers ══ */

/**
 * A radio group — the canvas `Radio@0.0.25`. `aria-label` and `data-testid` are the control name.
 * `readOnly` is `DisplayMode.View` (not changeable, normal text); `disabled` is `DisplayMode.Disabled`.
 */
function RadioChoice({ caption, testId, value, choices, onChange, disabled, required, readOnly }: {
  caption: string; testId: string; value: number | null;
  choices: readonly { value: number; name: string }[]; onChange: (v: number) => void;
  disabled: boolean; required?: boolean; readOnly?: boolean;
}) {
  return (
    // The canvas AccessibleLabel of every control on this screen is its own name (rule 16).
    <fieldset className="canvas-radio-group" disabled={disabled} aria-label={testId} data-testid={testId}
      aria-readonly={readOnly || undefined}>
      <legend><span data-required={required}>{caption}</span></legend>
      {choices.map((c) => (
        <label key={c.value}>
          <input
            type="radio" checked={value === c.value} aria-label={c.name}
            value={c.value} data-testid={`${testId}-${c.value}`} disabled={disabled}
            onClick={readOnly ? (e) => e.preventDefault() : undefined}
            onChange={() => { if (!readOnly) onChange(c.value); }}
          />
          {c.name}
        </label>
      ))}
    </fieldset>
  );
}

/** A dropdown — the canvas `DropDown@0.0.45` / `ComboBox@0.0.51`. */
function SelectChoice({ caption, testId, value, choices, onChange, disabled, required, hideCaption, standard, combo, placeholder }: {
  caption: string; testId: string; value: string | number | null;
  choices: readonly { value: string | number; name: string }[];
  onChange: (v: string) => void; disabled: boolean; required?: boolean; hideCaption?: boolean;
  /** The canvas standard-assumption pair on the selected value (rule 20). */
  standard?: boolean;
  /** A `ComboBox@0.0.51` (`cmb_…`): the filled box keeps its bottom underline. */
  combo?: boolean;
  /** The canvas `InputTextPlaceholder`. */
  placeholder?: string;
}) {
  const s = useStyles();
  const standardClass = useStandardValueClass();
  const controlClass = useFieldControlClass();
  const ariaLabel = testId; // the canvas AccessibleLabel is the control name
  const selected = choices.find((c) => String(c.value) === String(value));
  return (
    <div className="canvas-field">
      {hideCaption ? null : <span data-required={required}>{caption}</span>}
      <Dropdown
        className={mergeClasses(s.dropdown, controlClass(disabled ? "disabled" : "edit",
          mergeClasses(standardClass(standard), combo && s.comboUnderline)))}
        appearance={FIELD_APPEARANCE} aria-label={ariaLabel} data-testid={testId} placeholder={placeholder}
        disabled={disabled} value={selected?.name ?? ""}
        selectedOptions={selected ? [String(selected.value)] : []}
        onOptionSelect={(_, d) => { if (d.optionValue !== undefined) onChange(d.optionValue); }}
      >
        {choices.map((c) => <Option key={String(c.value)} value={String(c.value)}>{c.name}</Option>)}
      </Dropdown>
    </div>
  );
}

/** A year + month dropdown pair under one caption (`Drp_…_YY` / `drp_…_MM`). */
function YearMonth({ caption, testIdYears, testIdMonths, maxYears, yy, mm, onChange, disabled, required, error, standard, combo }: {
  caption: string; testIdYears: string; testIdMonths: string; maxYears: number;
  yy: number | null; mm: number | null; onChange: (yy: number | null, mm: number | null) => void;
  disabled: boolean; required?: boolean; error?: string;
  /** Both dropdowns carry the same canvas flag (rule 20). */
  standard?: boolean;
  /** `ComboBox@0.0.51` pairs (`cmb_…_YY` / `_MM`): underline and the "Year" / "Month" placeholders. */
  combo?: boolean;
}) {
  const s = useStyles();
  return (
    <div className="canvas-field" data-invalid={error ? true : undefined}>
      <span data-required={required}>{caption}</span>
      <div className={s.pair}>
        <div className={s.pairItem}>
          <SelectChoice
            caption={caption} testId={testIdYears} value={yy} choices={years(maxYears)} hideCaption standard={standard}
            combo={combo} placeholder={combo ? FIN_LABEL.yearPlaceholder : undefined}
            disabled={disabled} onChange={(v) => onChange(Number(v), mm)}
          />
        </div>
        <div className={s.pairItem}>
          <SelectChoice
            caption={caption} testId={testIdMonths} value={mm} choices={months} hideCaption standard={standard}
            combo={combo} placeholder={combo ? FIN_LABEL.monthPlaceholder : undefined}
            disabled={disabled} onChange={(v) => onChange(yy, Number(v))}
          />
        </div>
      </div>
      {error ? <span className="canvas-field-error" role="alert">{error}</span> : null}
    </div>
  );
}

/**
 * The canvas `DatePicker@0.0.46` — the shared `DateField` (modern controls sweep, 20 Oct 2026)
 * with the control's own `Format`: `"dd.mm.yyyy"` on the three Decommissioning dates, the
 * default LongAbbreviated on Financial Close and End of debt service savings. All set
 * `IsEditable: true` and `StartOfWeek` Monday.
 */
function DateBox({ caption, testId, value, onChange, disabled, required, error, standard, format = DATE_PICKER_FORMAT }: {
  caption: string; testId: string; value: Date | null; onChange: (v: Date | null) => void;
  disabled: boolean; required?: boolean; error?: string;
  /** The canvas standard-assumption pair on the date (rule 20). */
  standard?: boolean;
  /** The control's canvas `Format`. */
  format?: CanvasDateFormat;
}) {
  const { locale } = useSession();
  return (
    <DateField
      label={caption} required={required} error={error}
      // the canvas AccessibleLabel is the control name
      name={testId}
      format={format} locale={locale}
      value={value} disabled={disabled} standard={standard}
      onChange={(v) => onChange(dateFromIso(v))}
    />
  );
}

/** The canvas Reload icons ("Reset to …") — the tooltip is the only caption they have. */
function ResetIcon({ tooltip, testId, disabled, onClick }: {
  tooltip: string; testId: string; disabled: boolean; onClick: () => void;
}) {
  const s = useStyles();
  const ariaLabel = testId; // `AccessibilityLabel` = the icon's control name
  return (
    <Tooltip content={tooltip} relationship="description">
      <Button
        appearance="transparent" className={s.resetIcon} icon={<ArrowClockwiseRegular />}
        aria-label={ariaLabel} data-testid={testId} disabled={disabled} onClick={onClick}
      />
    </Tooltip>
  );
}

function StatusChip({ status, canvasName }: { status: number | null; canvasName: string }) {
  const s = useStyles();
  if (status === null) return null;
  return (
    <span data-testid={canvasName} className={mergeClasses(s.status,
      status === CHOICE_FINANCE.status.active ? s.statusActive : s.statusInactive)}>
      {label(STATUS_LABEL, status)}
    </span>
  );
}

function Tag({ caption }: { caption: string }) {
  const s = useStyles();
  return <div className={s.tag}><span>{caption}</span><span className={s.tagRule} /></div>;
}

/** One collapsible card — `con_ProjectFinance_DisplayProject_Body_Form_FinancingInputs_Card`. */
function CategoryCard({ order, cardId, name, status, folded, disabled, onToggleFold, children }: {
  order: number; cardId: string; name: string; status: number | null; folded: boolean; disabled: boolean;
  onToggleFold: () => void; children: ReactNode;
}) {
  const s = useStyles();
  return (
    <section className={s.card} data-testid={`con_ProjectFinance_DisplayProject_Body_Form_FinancingInputs_Card-${cardId}`} aria-label={name}>
      <div className={s.cardHeader}>
        <Tooltip content={name} relationship="description">
          <Text className={s.cardTitle} data-testid="txt_Generators_DisplayProject_Body_Form_GeneratorType_1">
            {name}
          </Text>
        </Tooltip>
        {/* `con_Generator_GeneratorStatus_1.Visible: ThisItem.Order in [2,4,5]` */}
        {[CATEGORY_ORDER.vatFinancing, CATEGORY_ORDER.dsraDsrf, CATEGORY_ORDER.decommissioning]
          .includes(order as 2 | 4 | 5) ? <StatusChip status={status} canvasName="lbl_Generator_GeneratorStatus_1" /> : null}
        {/* `ico_Generators_…_Up_1` (`Visible: Not(IsFolded)`) / `_Down_1` (`Visible: IsFolded`), at the right. */}
        {folded ? (
          <Button
            appearance="transparent" className={s.chevron} aria-label="ico_Generators_DisplayProject_Body_Form_GeneratorType_Down_1"
            data-testid="ico_Generators_DisplayProject_Body_Form_GeneratorType_Down_1"
            icon={<ExpandChevron open={false} />} disabled={disabled} onClick={onToggleFold}
          />
        ) : (
          <Button
            appearance="transparent" className={s.chevron} aria-label="ico_Generators_DisplayProject_Body_Form_GeneratorType_Up_1"
            data-testid="ico_Generators_DisplayProject_Body_Form_GeneratorType_Up_1"
            icon={<ExpandChevron open />} disabled={disabled} onClick={onToggleFold}
          />
        )}
      </div>
      {folded ? null : <div className={s.cardBody}>{children}</div>}
    </section>
  );
}

/** The canvas names of the lock banner's six labels (title, then the five bullets). */
const LOCK_TITLE_ID = "lbl_ProjectRevenues_DisplayProjectBodyRightContent_Balancing_Price_VisibilityMessage_39";
const LOCK_LINE_ID = [
  "lbl_ProjectRevenues_DisplayProjectBodyRightContent_Balancing_Price_VisibilityMessage_40",
  "lbl_ProjectRevenues_DisplayProjectBodyRightContent_Balancing_Price_VisibilityMessage_41",
  "lbl_ProjectRevenues_DisplayProjectBodyRightContent_Balancing_Price_VisibilityMessage_42",
  "lbl_ProjectRevenues_DisplayProjectBodyRightContent_Balancing_Price_VisibilityMessage_43",
  "lbl_ProjectRevenues_DisplayProjectBodyRightContent_Balancing_Price_VisibilityMessage_44",
] as const;
const LOCK_BULLETS = ["• General", "• Milestones", "• Generator", "• Production", "• Change the project status from Draft"];

type Panel = "none" | "equity" | "vat" | "tranche" | "dsra" | "decommissioning";
type Dialog = "none" | "category" | "trancheActivation" | "trancheDeletion" | "dsra";

/* ═══════════════════════════════════════════════════════════════════ screen ══ */

export default function ProjectFinanceScreen() {
  const s = useStyles();
  const { projectId, locale } = useSession();
  const lang = locale;
  // Card and box numbers in the user's language (`Text(n, fmt, Language())`): one place, so no call site can forget it.
  const fmtCard = (v: number | null | undefined, pattern: string) => fmtCardIn(v, pattern, lang);
  const fmtAmount = (v: number | null | undefined) => fmtAmountIn(v, lang);
  const formatDscr = (v: number | null | undefined) => formatDscrIn(v, lang);
  const formatUpfrontFee = (option: number, value: number | null) => formatUpfrontFeeIn(option, value, lang);

  const projectQ = useFinanceProject(projectId);
  const project = projectQ.data;
  const categoriesQ = useFinancingCategories();
  const categories = categoriesQ.data;
  const slicesQ = useDebtAssumptions();
  const inputsQ = useFinancingInputs(projectId, categories);
  const repaymentsQ = useRepaymentAmounts(projectId);
  const stepUpsQ = useStepUpMargins(projectId);
  const banksQ = useBanks();
  const kfwQ = useKfwTranches();
  const capexQ = useTotalDevexCapex(projectId);
  const turbinesQ = useActiveTurbineCount(projectId);
  const writes = useFinanceWrites(projectId);

  const assumptionsConnected = slicesQ.connected;
  const loading = projectQ.isLoading || categoriesQ.isLoading || inputsQ.isLoading;
  const loadError = projectQ.error ?? categoriesQ.error ?? inputsQ.error ?? repaymentsQ.error ?? stepUpsQ.error;
  const inputs = inputsQ.data;
  const banks = banksQ.data;
  const totalCapex = capexQ.data;
  const activeTurbines = turbinesQ.data;
  const country = project?.countryName ?? null;
  const unit = currencySuffix(country);
  const busy = writes.progress !== null;

  const tech = project ? toDebtTech(project.technology) : "other";
  const standard = useMemo(
    () => (project ? buildSeniorDebtStandard(slicesQ.data.debt, tech, project, { language: lang }) : null),
    [project, slicesQ.data.debt, tech, lang],
  );
  const dsraStandard = useMemo(
    () => buildDsraStandard(slicesQ.data.dsra, tech, { language: lang }),
    [slicesQ.data.dsra, tech, lang],
  );
  const decStandard = useMemo(
    () => (project
      ? buildDecommissioningStandard(slicesQ.data.decommissioning, tech, project, { language: lang })
      : null),
    [project, slicesQ.data.decommissioning, tech, lang],
  );

  /* ─────────────────────────────────────────────────────────── on visit ── */

  // `OnVisible`: the guarded 'Financing Options' patch, then the missing seeds — once per visit.
  const visited = useRef<string | null>(null);
  useEffect(() => {
    if (!project || !projectId || loading || loadError || categories.length === 0) return;
    if (visited.current === projectId) return;
    visited.current = projectId;
    const optionPlan = planFinancingOptionOnVisit(project);
    const seeds = seedsAllowed(planSeeds(
      project, buildCategoryMap(categories), inputs.map((i) => i.categoryId ?? ""),
      standard ?? buildSeniorDebtStandard([], tech, project), dsraStandard,
      decStandard ?? buildDecommissioningStandard([], tech, project),
    ), assumptionsConnected);
    void (async () => {
      if (optionPlan) await writes.run(financingOptionJob(optionPlan));
      for (const job of seedJobs(seeds, project)) await writes.run(job);
    })();
    // The visit writes depend only on the loaded rows of this project.
  }, [project, projectId, loading, loadError, categories, inputs, standard, dsraStandard, decStandard, tech, assumptionsConnected, writes]);

  /* ─────────────────────────────────────────────────────────── local state ── */

  // B9 — the category cards start FOLDED (`AddColumns(colFinancingCategories, IsFolded, true)`).
  const [folded, setFolded] = useState<ReadonlySet<number>>(
    () => new Set(CATEGORY_CARD_ORDERS),
  );
  const [trancheFolded, setTrancheFolded] = useState<ReadonlyMap<string, boolean>>(new Map());
  const [panel, setPanel] = useState<Panel>("none");
  const [dialog, setDialog] = useState<Dialog>("none");
  const [selectedTrancheId, setSelectedTrancheId] = useState<string | null>(null);
  const [toggleTarget, setToggleTarget] = useState<FinancingInputRow | null>(null);
  const [equity, setEquity] = useState<EquityForm | null>(null);
  const [vat, setVat] = useState<VatForm | null>(null);
  const [dsra, setDsra] = useState<DsraForm | null>(null);
  const [decom, setDecom] = useState<DecommissioningForm | null>(null);
  const [tranche, setTranche] = useState<SeniorDebtFormState | null>(null);
  const [repaymentRows, setRepaymentRows] = useState<RepaymentRow[]>([]);
  const [stepUpRows, setStepUpRows] = useState<StepUpRow[]>([]);

  /* ─────────────────────────────────────────────────────────── derived rows ── */

  const categoryOf = (order: number) => categories.find((c) => c.order === order) ?? null;
  const inputOf = (order: number): FinancingInputRow | null =>
    inputs.find((i) => i.categoryOrder === order) ?? null;
  const equityInput = inputOf(CATEGORY_ORDER.equity);
  const vatInput = inputOf(CATEGORY_ORDER.vatFinancing);
  const dsraInput = inputOf(CATEGORY_ORDER.dsraDsrf);
  const decInput = inputOf(CATEGORY_ORDER.decommissioning);
  // `Sort(Filter(colFinancingInputInProject, Category = SeniorDebt), 'Created On', Ascending)`.
  const trancheInputs = inputs.filter((i) => i.categoryOrder === CATEGORY_ORDER.seniorDebt);
  const cards = categories.filter((c) => c.order !== CATEGORY_ORDER.cashSweep);

  const tranches: TrancheRow[] = trancheInputs.map((i) => ({
    id: i.id, trancheStatus: num(i.raw[INPUT_COL.trancheStatus]), status: i.status,
    canEdit: i.canEdit, canDelete: i.canDelete,
  }));
  const selectedTranche = tranches.find((t) => t.id === selectedTrancheId) ?? null;
  const selectedTrancheInput = trancheInputs.find((t) => t.id === selectedTrancheId) ?? null;
  const trancheBar = seniorDebtCommandBar(tranches, selectedTranche, true);

  const lockBullets = project ? pageLock(project) : LOCK_BULLETS;
  // `con_Milestones_Page_LockMessage_8.Visible` (with the Draft bullet) — the Financing Options and
  // gallery `DisplayMode` gate.
  const locked = !loading && isPageLocked(project);
  // `gal_…_FinancingInputs.Visible: And(!IsBlank('Cluster State'.Name), 'Cluster State'.Name <> "Draft")`.
  const galleryVisible = Boolean(project?.clusterStateName) && project?.clusterStateName !== "Draft";
  const financingOption = project?.financingOptions ?? null;

  const trancheName = (i: FinancingInputRow | null): string => (i === null ? "" : trancheDisplayName(
    num(i.raw[INPUT_COL.trancheStatus]),
    bankDisplayName(str(i.raw[INPUT_COL.bank]), str(i.raw[INPUT_COL.otherBankName]), banks),
    i.raw[INPUT_COL.kfwTranche] === CHOICE_FINANCE.yesNo.yes,
    str(i.raw[INPUT_COL.kfwTrancheValue]),
  ));

  const tenorTranches = trancheInputs.map((t) => ({
    tenorYears: num(t.raw[INPUT_COL.tenorDurationYear]),
    tenorMonths: num(t.raw[INPUT_COL.tenorDurationMonth]),
    status: t.status,
  }));

  /* ─────────────────────────────────────────────────────────── panel openers ── */

  const closePanel = () => {
    setPanel("none");
    setEquity(null); setVat(null); setDsra(null); setDecom(null); setTranche(null);
  };

  const openTranche = (existing: FinancingInputRow | null) => {
    if (!project) return;
    writes.clear();
    setRepaymentRows(existing ? repaymentRowsOf(existing.id, repaymentsQ.data, lang) : []);
    setStepUpRows(existing ? stepUpRowsOf(existing.id, stepUpsQ.data, lang) : []);
    setTranche(openTrancheForm({ existing, project, standard, banks, tranches: trancheInputs, language: lang }));
    setPanel("tranche");
  };

  const patchTranche = (p: Partial<SeniorDebtFormState>) =>
    setTranche((f) => (f ? { ...f, ...p, formDirty: true } : f));

  /** Rule 21 — tenor / start-repayment / profile changes regenerate the Individual schedule. */
  const regenerate = (next: Partial<SeniorDebtFormState>) => {
    if (!tranche || !project) return;
    const m = { ...tranche, ...next };
    // Only for Individual with all four dropdowns set; otherwise the schedule is left as it is.
    if (shouldRegenerateRepayments(m)) setRepaymentRows(regenerateRepaymentYears(
      project.cod, m.startRepaymentYears ?? 0, m.startRepaymentMonths ?? 0,
      m.tenorYears ?? 0, m.tenorMonths ?? 0, repaymentRows,
      repaymentsQ.data.filter((r) => r.financingInputId === tranche.trancheId).map((r) => ({ year: r.year, id: r.id })),
    ));
    patchTranche(next);
  };

  /* ─────────────────────────────────────────────────────────────── commands ── */

  const trancheCommands: Command[] = [
    { key: "AddFinanceInput", label: FIN_LABEL.addTranche, icon: "Add", enabled: !busy && !locked && trancheBar.add.enabled },
    { key: "EditFinanceInput", label: FIN_LABEL.editTranche, icon: "Edit", enabled: !busy && !locked && trancheBar.edit.enabled },
    ...(trancheBar.activate.visible
      ? [{ key: "ActivateFinanceInput", label: FIN_LABEL.activateTranche, icon: "ActivateOrders" as const, enabled: !busy && !locked && trancheBar.activate.enabled }]
      : []),
    ...(trancheBar.deactivate.visible
      ? [{ key: "DeactivateFinanceInput", label: FIN_LABEL.deactivateTranche, icon: "DeactivateOrders" as const, enabled: !busy && !locked && trancheBar.deactivate.enabled }]
      : []),
    { key: "DeleteFinancingInput", label: FIN_LABEL.delete, icon: "Delete", enabled: !busy && !locked && trancheBar.delete.enabled },
  ];

  const onTrancheCommand = (key: string) => {
    if (key === "AddFinanceInput") openTranche(null);
    else if (key === "EditFinanceInput") openTranche(selectedTrancheInput);
    else if (key === "ActivateFinanceInput" || key === "DeactivateFinanceInput") setDialog("trancheActivation");
    else if (key === "DeleteFinancingInput") setDialog("trancheDeletion");
  };

  const categoryCommands = (order: number, input: FinancingInputRow | null, name: string): Command[] => {
    const bar = categoryCommandBar(order, input?.status ?? -1, input !== null);
    return [
      // `ItemEnabled: true` in the canvas (the gallery `DisplayMode` still disables it while locked).
      { key: "EditFinanceInput", label: categoryCommandLabel("edit", order, name), icon: "Edit", enabled: !busy && !locked && input !== null },
      ...(bar.activate.visible
        ? [{ key: "ActivateFinanceInput", label: categoryCommandLabel("activate", order, name), icon: "ActivateOrders" as const, enabled: !busy && !locked && bar.activate.enabled }]
        : []),
      ...(bar.deactivate.visible
        ? [{ key: "DeactivateFinanceInput", label: categoryCommandLabel("deactivate", order, name), icon: "DeactivateOrders" as const, enabled: !busy && !locked && bar.deactivate.enabled }]
        : []),
    ];
  };

  const onCategoryCommand = (order: number, input: FinancingInputRow | null) => (key: string) => {
    writes.clear();
    if (key === "EditFinanceInput") {
      if (order === CATEGORY_ORDER.equity) { setEquity(openEquityForm(input)); setPanel("equity"); }
      else if (order === CATEGORY_ORDER.vatFinancing) { setVat(openVatForm(input, country)); setPanel("vat"); }
      else if (order === CATEGORY_ORDER.decommissioning) { setDecom(openDecommissioningForm(input, lang)); setPanel("decommissioning"); }
    } else {
      setToggleTarget(input);
      setDialog("category");
    }
  };

  /* ────────────────────────────────────────────────────────────── writes ── */

  const onFinancingOption = async (option: number) => {
    // The fold-all runs inside the canvas' VAT branch (`'Is Deactivated By Button' <> Yes`).
    if (vatInput && vatInput.raw[INPUT_COL.isDeactivatedByButton] !== CHOICE_FINANCE.yesNo.yes) {
      setFolded(new Set(cards.map((c) => c.order)));
    }
    await writes.run(financingOptionJob(planFinancingOption(project, option, inputs)));
  };

  const saveTranche = async () => {
    if (!tranche || !project) return;
    const form: SeniorDebtFormState = { ...tranche, repaymentRows, stepUpRows, isSaving: true };
    closePanel();
    const ids = await writes.run(trancheSaveJob(async () => planTrancheSave({
      form, project, seniorDebtCategoryId: categoryOf(CATEGORY_ORDER.seniorDebt)?.id ?? null,
      duplicateIds: await fetchTrancheDuplicates(trancheUniqueKey(form)),
      storedRepayments: repaymentsQ.data, storedStepUps: stepUpsQ.data, language: lang,
    })));
    if (ids !== null) setSelectedTrancheId(null);
  };

  /* ────────────────────────────────────────────────────────── card bodies ── */

  const field = (caption: string, value: string, testId: string, standard = false) =>
    <ReadOnlyField key={testId} label={caption} value={value} testId={testId} ariaLabel={testId} standard={standard} />;
  /* Rule 20 — the display cards' standard-assumption flags, re-parsed from each row's JSON. */
  const cardStd = financeCardStandard({ equity: equityInput, vat: vatInput, decommissioning: decInput, dsra: dsraInput });

  const equityBody = () => {
    const raw = equityInput?.raw ?? {};
    const mode: FreeEquityMode =
      num(raw[INPUT_COL.freeEquity]) === CHOICE_FINANCE.freeEquity.fixedValue ? "fixed" : "percentage";
    const value = num(raw[INPUT_COL.freeEquityValue]);
    // `txt_EquityData_ShareholderLoanEUR_1.Value` (Y:3072): Fixed → `Max(0, CAPEX − value)`, Percentage → `100 − value`.
    const loan = value === null ? null
      : mode === "fixed" ? Math.max(0, totalCapex - value) : 100 - value;
    return (
      <div className={mergeClasses(s.fields, s.fieldsRow)}>
        {field(FIN_LABEL.freeEquityPrefix + freeEquityLabel(mode, country), fmtCard(value, CARD_FORMAT.amount), "txt_EquityData_FreeEquityEUR_1", cardStd.equity.locIsStandardFreeEquity)}
        {/* `con_EquityData_ShareholderLoanEUR_1.Visible: 'Free Equity' = Percentage` */}
        {equityInput && mode === "percentage"
          ? field(FIN_LABEL.shareholderLoanPrefix + freeEquityLabel(mode, country), fmtCard(loan, "###,###,###,###,##0"), "txt_EquityData_ShareholderLoanEUR_1", cardStd.equity.locIsStandardShareholderLoan)
          : null}
      </div>
    );
  };

  const vatBody = () => {
    const raw = vatInput?.raw ?? {};
    const margin = num(raw[INPUT_COL.bankMargin]);
    return (
      <div className={mergeClasses(s.fields, s.fieldsRow)}>
        {field(FIN_LABEL.baseRate, label(BASE_RATE_OPTION_LABEL, num(raw[INPUT_COL.baseRate])), "txt_VATFinancingData_BaseRate_2", cardStd.vat.locIsStandardBaseRate)}
        {field(FIN_LABEL.bankMargin, margin === null ? "" : String(margin), "txt_VATFinancingData_BankMargin_1", cardStd.vat.locIsStandardBankMargin)}
        {num(raw[INPUT_COL.vatFacilityAmount]) === CHOICE_FINANCE.vatFacilityAmount.individual
          ? field(FIN_LABEL.vatFacilityAmountPrefix + unit, fmtCard(num(raw[INPUT_COL.vatFacilityAmountValue]), CARD_FORMAT.amount),
            "txt_VATFinancingData_VATFacilityAmountEUR_1")
          : null}
      </div>
    );
  };

  const trancheCard = (i: FinancingInputRow) => {
    const r = i.raw;
    const selected = i.id === selectedTrancheId;
    const isFolded = isTrancheFolded(i, trancheFolded);
    const upfront = num(r[INPUT_COL.upfrontFee]) ?? CHOICE_FINANCE.upfrontFee.percentageOfDebt;
    const dscr = (v: number | null) => (v === null ? "" : formatDscr(v));
    const toggleFold = () => setTrancheFolded((m) => new Map(m).set(i.id, !isFolded));
    return (
      <div key={i.id} className={mergeClasses(s.tranche, selected && s.trancheSelected)} aria-selected={selected}>
        <div className={s.trancheHeader}>
          <Tooltip content={FIN_LABEL.seniorDebtTooltip} relationship="description">
            <Button
              appearance="transparent" className={mergeClasses(s.cardTitle, s.trancheTitle)} aria-label={FIN_LABEL.seniorDebtTooltip} disabled={locked}
              data-testid="btn_FinancingInput_DisplayProject_Body_Form_SeniorDebt_CardHeader_RowTransparent"
              onClick={() => setSelectedTrancheId(selected ? null : i.id)}
            >
              {trancheName(i)}
            </Button>
          </Tooltip>
          <StatusChip status={i.status} canvasName="lbl_FinancingInputs_SeniorDebt_Status" />
          {isFolded ? (
            <Button
              appearance="transparent" className={s.chevron} icon={<ExpandChevron open={false} />} disabled={locked} onClick={toggleFold}
              aria-label="ico_FinancingInputs_DisplayProject_Body_Form_SeniorDebt_Down"
              data-testid="ico_FinancingInputs_DisplayProject_Body_Form_SeniorDebt_Down"
            />
          ) : (
            <Button
              appearance="transparent" className={s.chevron} icon={<ExpandChevron open />} disabled={locked} onClick={toggleFold}
              aria-label="ico_FinancingInputs_DisplayProject_Body_Form_SeniorDebt_Up"
              data-testid="ico_FinancingInputs_DisplayProject_Body_Form_SeniorDebt_Up"
            />
          )}
        </div>
        {isFolded ? null : (
          <div className={s.cardBody}>
            <Tag caption={FIN_LABEL.generalTag} />
            <div className={s.fields}>
              {field(TRANCHE_FORM_LABEL.status, label(TRANCHE_STATUS_LABEL, num(r[INPUT_COL.trancheStatus])), "txt_SeniorDebt_Data_Display_Card_Status")}
              {field(TRANCHE_FORM_LABEL.bank, bankDisplayName(str(r[INPUT_COL.bank]), str(r[INPUT_COL.otherBankName]), banks), "txt_SeniorDebt_Data_Display_Card_Bank")}
              {field(TRANCHE_FORM_LABEL.kfwTranche, str(r[INPUT_COL.kfwTrancheValue]) ?? "", "txt_SeniorDebt_Data_Display_Card_Status_1")}
              {field(FIN_LABEL.gearing, label(CHOICE_LABEL.gearing, num(r[INPUT_COL.gearing])), "txt_SeniorDebt_Data_Display_Card_Gearing")}
              {field(FIN_LABEL.amount, fmtCard(num(r[INPUT_COL.fixedAmountValue]) ?? 0, CARD_FORMAT.amount), "txt_SeniorDebt_Data_Display_Card_Amount")}
              {field(TRANCHE_FORM_LABEL.financialClose, fmtLongDate(day(r[INPUT_COL.financialClose]), lang), "txt_SeniorDebt_Data_Display_Card_FinancialClose", trancheFinancialCloseIsStandard(i))}
              {field(FIN_LABEL.startRepayment, yearMonthLabel(num(r[INPUT_COL.startRepaymentYear]), num(r[INPUT_COL.startRepaymentMonth])), "txt_SeniorDebt_Data_Display_Card_StartRepayment")}
              {field(FIN_LABEL.tenor, yearMonthLabel(num(r[INPUT_COL.tenorDurationYear]), num(r[INPUT_COL.tenorDurationMonth])), "txt_SeniorDebt_Data_Display_Card_Tenor")}
              {field(FIN_LABEL.repaymentProfile, label(CHOICE_LABEL.repaymentProfile, num(r[INPUT_COL.repaymentProfile])), "txt_SeniorDebt_Data_Display_Card_Status_2")}
            </div>
            <Tag caption={FIN_LABEL.conditionsTag} />
            <div className={s.fields}>
              {field(TRANCHE_FORM_LABEL.drawdown, label(CHOICE_LABEL.drawdown, num(r[INPUT_COL.drawdown])), "txt_SeniorDebt_Data_Display_Card_Drawdown")}
              {field(FIN_LABEL.dscrContracted, dscr(num(r[INPUT_COL.dscrContractedDecimal])), "txt_SeniorDebt_Data_Display_Card_DSCRContracted")}
              {field(FIN_LABEL.dscrUncontracted, dscr(num(r[INPUT_COL.dscrUncontractedDecimal])), "txt_SeniorDebt_Data_Display_Card_DSCRUncontracted")}
              {field(FIN_LABEL.energyYieldDisplay, label(CHOICE_LABEL.energyYield, num(r[INPUT_COL.energyYieldDebtSizing])), "txt_SeniorDebt_Data_Display_Card_EnergyYield_DebtSizing")}
              {field(FIN_LABEL.spotCurveDisplay, label(CHOICE_LABEL.spotCurve, num(r[INPUT_COL.spotCurveDebtSizing])), "txt_SeniorDebt_Data_Display_Card_SpotCurve_DebtSizing")}
              {field(FIN_LABEL.upfrontFeePrefix + (upfront === CHOICE_FINANCE.upfrontFee.percentageOfDebt ? "[%]" : unit),
                formatUpfrontFee(upfront, num(r[INPUT_COL.upfrontFeeValue])), "txt_SeniorDebt_Data_Display_Card_UpfrontFee")}
              {field(TRANCHE_FORM_LABEL.commitmentFeeValue, fmtCard(num(r[INPUT_COL.commitmentFeeValue]), CARD_FORMAT.commitmentFee), "txt_SeniorDebt_Data_Display_Card_CommitmentFee")}
              {field(TRANCHE_FORM_LABEL.commitmentFeeFreePeriod, commitmentFeeFreePeriodLabel(num(r[INPUT_COL.commitmentFeePeriodYear]), num(r[INPUT_COL.commitmentFeePeriodMonth])), "txt_SeniorDebt_Data_Display_Card_Status_3")}
              {field(TRANCHE_FORM_LABEL.baseRate, label(BASE_RATE_OPTION_LABEL, num(r[INPUT_COL.baseRate])), "txt_SeniorDebt_Data_Display_Card_BaseRate")}
              {field(FIN_LABEL.hedging, fmtCard(num(r[INPUT_COL.hedging]), CARD_FORMAT.hedging), "txt_SeniorDebt_Data_Display_Card_Hedging")}
              {field(TRANCHE_FORM_LABEL.swapRate, fmtCard(num(r[INPUT_COL.swapRate]), CARD_FORMAT.rate), "txt_SeniorDebt_Data_Display_Card_SwapMargin")}
              {field(TRANCHE_FORM_LABEL.bankMarginConstruction, fmtCard(num(r[INPUT_COL.bankMarginConstructionPhase]), CARD_FORMAT.rate), "txt_SeniorDebt_Data_Display_Card_BankMargin_ConstructionPhase")}
              {field(TRANCHE_FORM_LABEL.bankMarginOperational, fmtCard(num(r[INPUT_COL.bankMarginOperationalPhase]), CARD_FORMAT.rate), "txt_SeniorDebt_Data_Display_Card_BankMargin_OperationalPhase")}
              {field(FIN_LABEL.fixedInterestRate, yearMonthLabel(num(r[INPUT_COL.fixedInterestRateYear]), num(r[INPUT_COL.fixedInterestRateMonth])), "txt_SeniorDebt_Data_Display_Card_FixedInterestRate")}
              {/* `ThisItem.'Step Up Bank Margin'` — the two-option label. */}
              {field(FIN_LABEL.stepUpMarginDisplay, r[INPUT_COL.stepUpBankMargin] === true ? "Yes" : r[INPUT_COL.stepUpBankMargin] === false ? "No" : "", "txt_SeniorDebt_Data_Display_Card_StepUp_Margin")}
            </div>
          </div>
        )}
      </div>
    );
  };

  const dsraBody = () => {
    const raw = dsraInput?.raw ?? {};
    const type = num(raw[INPUT_COL.typeDsraDsrf]);
    const isDsrf = type === CHOICE_FINANCE.dsraDsrfType.dsrf;
    const toggle = dsraCardToggle(CATEGORY_ORDER.dsraDsrf, dsraInput?.status ?? null, dsraInput !== null);
    return (
      <>
        <div className={s.dsraButtons}>
          <Button
            appearance="transparent" className={mergeClasses(s.dsraButton, s.dsraEdit)}
            icon={<EditRegular />} aria-label="con_DSRA_DSRF_Data_Edit" data-testid="con_DSRA_DSRF_Data_Edit"
            // `DisplayMode: If(con_DSRA_DSRF_Data_Deactivate.Text = "Activate", Disabled, Edit)`
            disabled={busy || locked || dsraInput === null || toggle.label === DSRA_TOGGLE_LABEL.activate}
            onClick={() => { writes.clear(); setDsra(openDsraForm(dsraInput, lang)); setPanel("dsra"); }}
          >
            {FIN_LABEL.edit}
          </Button>
          <Button
            appearance="transparent" className={mergeClasses(s.dsraButton, s.dsraToggle)}
            aria-label="con_DSRA_DSRF_Data_Deactivate" data-testid="con_DSRA_DSRF_Data_Deactivate"
            icon={dsraInput?.status === CHOICE_FINANCE.status.active ? <DismissCircleRegular /> : <CheckmarkCircleRegular />}
            disabled={busy || locked || !toggle.enabled}
            onClick={() => { writes.clear(); setToggleTarget(dsraInput); setDialog("dsra"); }}
          >
            {toggle.label}
          </Button>
        </div>
        <div className={mergeClasses(s.fields, s.dsraFields, s.dsraType)}>
          {field(FIN_LABEL.type, dsraInput ? (isDsrf ? "DSRF" : "DSRA") : "", "txt_Decommissioning_Data_Display_Card_Duration_of_Saving_3", cardStd.dsra.locIsStandardType)}
        </div>
        <div className={mergeClasses(s.fields, s.dsraFields)}>
          {isDsrf ? field(TRANCHE_FORM_LABEL.commitmentFeeValue, fmtCard(num(raw[INPUT_COL.commitmentFeeValue]), CARD_FORMAT.dsraCommitmentFee), "txt_Decommissioning_Data_Display_Card_Cost_of_Decommissioning_3", cardStd.dsra.locIsStandardCommitmentFee) : null}
          {isDsrf ? field(TRANCHE_FORM_LABEL.commitmentFeeFreePeriod, dsraPeriodLabel(num(raw[INPUT_COL.commitmentFeePeriodYear]), num(raw[INPUT_COL.commitmentFeePeriodMonth])), "txt_Decommissioning_Data_Display_Card_Cost_of_Guarantee_3", cardStd.dsra.locIsStandardCommitmentFeeFreeDuration) : null}
          {field(FIN_LABEL.baseRate, label(BASE_RATE_OPTION_LABEL, num(raw[INPUT_COL.baseRate])), "txt_Decommissioning_Data_Display_Card_Date_of_Issue_3", cardStd.dsra.locIsStandardBaseRate)}
          {field(FIN_LABEL.margin, fmtCard(num(raw[INPUT_COL.margin]), CARD_FORMAT.dsraMargin), "txt_Decommissioning_Data_Display_Card_Date_of_Expiry_3", cardStd.dsra.locIsStandardMargin)}
          {isDsrf ? field(FIN_LABEL.upfrontFeePercent, fmtCard(num(raw[INPUT_COL.upfrontFeeValue]), CARD_FORMAT.dsraUpfrontFee), "txt_Decommissioning_Data_Display_Card_Start_Date_of_Saving_3", cardStd.dsra.locIsStandardUpfrontfee) : null}
          {field(FIN_LABEL.percentageOfFutureDebtService, fmtCard(num(raw[INPUT_COL.percentageOfFutureDebtService]), CARD_FORMAT.pofds), "txt_Decommissioning_Data_Display_Card_Duration_of_Saving_4", cardStd.dsra.locIsStandardPercentageoffuturedebtservice)}
          {field(FIN_LABEL.durationOfFutureDebtService, dsraInput ? mmyyLabel(str(raw[INPUT_COL.durationOfFutureDebtServiceMmyy])) : "", "txt_Decommissioning_Data_Display_Card_Duration_of_Saving_5", cardStd.dsra.locIsStandardDurationoffuturedebtservice)}
          {field(FIN_LABEL.endOfDebtServiceSavings, fmtDateDots(day(raw[INPUT_COL.endOfDebtServiceSavings])), "txt_Decommissioning_Data_Display_Card_Duration_of_Saving_6", cardStd.dsra.locIsStandardEndofDebtserviceSavings)}
        </div>
      </>
    );
  };

  const decommissioningBody = () => {
    const raw = decInput?.raw ?? {};
    return (
      <div className={s.fields}>
        {field(FIN_LABEL.totalCostsOfDecommissioningPrefix + unit, decInput ? fmtAmount(totalDecommissioningCost(
          num(raw[INPUT_COL.costsOfDecommissioning]) ?? CHOICE_FINANCE.costsOfDecommissioning.total,
          num(raw[INPUT_COL.costsOfDecommissioningValue]), activeTurbines,
        )) : "", "txt_Decommissioning_Data_Display_Card_Cost_of_Decommissioning_1", cardStd.decommissioning.CostsofDecommissioningValue)}
        {field(FIN_LABEL.costOfGuarantee, fmtCard(num(raw[INPUT_COL.costOfGuarantee]), CARD_FORMAT.costOfGuarantee), "txt_Decommissioning_Data_Display_Card_Cost_of_Guarantee_1", cardStd.decommissioning.CostofGuarantee)}
        {field(FIN_LABEL.dateOfIssue, fmtDateDots(day(raw[INPUT_COL.dateOfIssue])), "txt_Decommissioning_Data_Display_Card_Date_of_Issue_1", cardStd.decommissioning.DateofIssue)}
        {field(FIN_LABEL.dateOfExpiry, fmtDateDots(day(raw[INPUT_COL.dateOfExpiry])), "txt_Decommissioning_Data_Display_Card_Date_of_Expiry_1", cardStd.decommissioning.DateofExpiry)}
        {field(FIN_LABEL.startDateOfSaving, fmtDateDots(day(raw[INPUT_COL.startDateOfSaving])), "txt_Decommissioning_Data_Display_Card_Start_Date_of_Saving_1", cardStd.decommissioning.StartDateofSaving)}
        {field(FIN_LABEL.durationOfSavingDisplay, decInput ? decommissioningDurationLabel(str(raw[INPUT_COL.durationOfSaving])) : "", "txt_Decommissioning_Data_Display_Card_Duration_of_Saving_1", cardStd.decommissioning.DurationofSaving)}
      </div>
    );
  };

  const body = (order: number, input: FinancingInputRow | null, name: string): ReactNode => {
    // `pcf_ProjectRevenues_Content_ContractCommandBar_2.Visible: Not(ThisItem.Order in [3,4])`
    const bar = order === CATEGORY_ORDER.seniorDebt || order === CATEGORY_ORDER.dsraDsrf ? null : (
      <div className={s.commandBar}>
        <CommandBar
          commands={categoryCommands(order, input, name)} onCommand={onCategoryCommand(order, input)}
          ariaLabel="pcf_ProjectRevenues_Content_ContractCommandBar_2"
        />
      </div>
    );
    switch (order) {
      case CATEGORY_ORDER.equity: return <>{bar}{equityBody()}</>;
      case CATEGORY_ORDER.vatFinancing: return <>{bar}{vatBody()}</>;
      case CATEGORY_ORDER.seniorDebt: return (
        <>
          <div className={s.commandBar}>
            <CommandBar commands={trancheCommands} onCommand={onTrancheCommand} ariaLabel="pcf_FinancingInputs_Content_SeniroDebtTranche_CommandBar" />
          </div>
          <div className={s.trancheList}>{trancheInputs.map(trancheCard)}</div>
        </>
      );
      case CATEGORY_ORDER.dsraDsrf: return dsraBody();
      default: return <>{bar}{decommissioningBody()}</>;
    }
  };

  /* ──────────────────────────────────────────────────────────── dialogs ── */

  const toggleDialog = toggleTarget
    ? categoryToggleDialog(toggleTarget.status, toggleTarget.categoryOrder,
      categoryOf(toggleTarget.categoryOrder)?.name ?? "")
    : null;
  const trancheDialog = trancheActionDialog(
    dialog === "trancheDeletion" ? "deletion" : "activation",
    selectedTranche?.status ?? null, trancheName(selectedTrancheInput),
  );
  const dsraDialog = dsraToggleDialog(dsraInput?.status ?? null);
  const closeDialog = () => { setDialog("none"); setToggleTarget(null); };

  /* ──────────────────────────────────────────────────────── tranche panel ── */

  const form = tranche ? { ...tranche, repaymentRows, stepUpRows } : null;
  const isStd = form?.trancheStatus === CHOICE_FINANCE.trancheStatus.standardAssumption;
  const tDisabled = busy || isStd;
  const tenorError = form ? (validateYearMonthPair(form.tenorYears, form.tenorMonths).message
    || validateTenorAgainstRepaymentStart(form.repaymentProfile, form.tenorYears, form.startRepaymentYears).message)
    : "";
  const bankChoices = [
    ...banks.map((b) => ({ value: b.id, name: b.bankname })),
    ...(form?.bankId && !banks.some((b) => b.id === form.bankId)
      ? [{ value: form.bankId, name: form.bankName ?? form.bankId }] : []),
  ];
  const kfwChoices = [
    ...kfwQ.data.map((k) => ({ value: k, name: k })),
    ...(form?.kfwValue && !kfwQ.data.includes(form.kfwValue) ? [{ value: form.kfwValue, name: form.kfwValue }] : []),
  ];

  /* ──────────────────────────────────────────────────────── decommissioning ── */

  const decDates = project ?? { legallyBindingPermits: null, endDate: null, cod: null };
  const decEnd = decom ? endDateOfSaving(decom.startDateOfSaving, decom.months ?? 0, decom.years ?? 0) : null;
  const patchDecom = (p: Partial<DecommissioningForm>, flag?: keyof DecommissioningForm["flags"], standardValue = false) =>
    setDecom((d) => (d ? { ...d, ...p, dirty: true, flags: flag ? { ...d.flags, [flag]: standardValue } : d.flags } : d));

  /* ═════════════════════════════════════════════════════════════════ render ══ */

  if (loadError) {
    return (
      <div className={s.page}>
        <EmptyState title={FINANCE_SCREEN_TEXT.loadFailedTitle} description={FINANCE_SCREEN_TEXT.loadFailedDescription} />
      </div>
    );
  }

  return (
    <div className={s.page} data-testid="Project Finance Screen">
      {loading ? <LoadingOverlay mode="inline" label={FIN_LABEL.loading} /> : null}
      <WriteFeedback progress={writes.progress} error={writes.error} success={writes.success} testIdPrefix="finance" />

      {!assumptionsConnected ? (
        <MessageBar intent="info" data-testid="finance-assumptions-not-connected">
          <MessageBarBody>{FINANCE_SCREEN_TEXT.assumptionsNotConnected}</MessageBarBody>
        </MessageBar>
      ) : null}

      {/* `con_Milestones_Page_LockMessage_8` */}
      {locked && lockBullets.length > 0 ? (
        <div className={s.lock} data-testid="con_Milestones_Page_LockMessage_8" role="status">
          <span data-testid="icon_milestones_lock_8"><LockClosedRegular aria-hidden fontSize={20} /></span>
          <div className={s.lockLines}>
            <Text className={s.lockText} data-testid={LOCK_TITLE_ID}>{PAGE_LOCK_TITLE}</Text>
            {lockBullets.map((b) => (
              <Text key={b} className={s.lockText} data-testid={`${LOCK_LINE_ID[Math.max(0, LOCK_BULLETS.indexOf(b))]}`}>{b}</Text>
            ))}
          </div>
        </div>
      ) : null}

      {/* `con_ProjectFinance_DisplayProjectBodyRight_FinancingOptions` */}
      <div className={s.options}>
        <RadioChoice
          caption={FIN_LABEL.financingOptions} testId="rad_ProjectFinance_FinancingOptions"
          value={financingOption} choices={options(FINANCING_OPTION_LABEL)}
          // `DisplayMode: If(Or(Cluster State blank, = "Draft", lock visible), Disabled, Edit)`
          disabled={busy || loading || locked}
          onChange={(v) => { void onFinancingOption(v); }}
        />
      </div>

      {/* `gal_ProjectFinance_DisplayProject_Body_Form_FinancingInputs` */}
      {galleryVisible ? <div className={s.gallery}>{cards.map((category) => {
        const order = category.order;
        const input = inputOf(order);
        return (
          <CategoryCard
            key={category.id} order={order} cardId={category.id} name={category.name}
            status={input?.status ?? null} folded={folded.has(order)} disabled={locked}
            onToggleFold={() => {
              const next = toggleCategoryFold(folded, order, trancheFolded, inputs);
              setFolded(next.folded);
              setTrancheFolded(next.trancheFolded);
            }}
          >
            {body(order, input, category.name)}
          </CategoryCard>
        );
      })}</div> : null}

      {/* ─────────────────────────────────────────────────────── Equity panel ── */}
      <FormPanel
        open={panel === "equity" && equity !== null} title={FIN_LABEL.equityTitle} width="narrow"
        onDismiss={closePanel}
        closeTestId="ico_EditEquity_RightPanel_BodyHeaderCancel" closeLabel="ico_EditEquity_RightPanel_BodyHeaderCancel"
        footer={<PanelButtons
          onSave={() => {
            if (!equity) return;
            const plan = planEquitySave({ project, row: equityInput, form: equity, totalCapex, language: lang });
            closePanel();
            void writes.run(equitySaveJob(plan));
          }}
          onCancel={closePanel}
          saveTestId="pcf_btn_GeneralData_RightPanel_Equity_Form_Buttons_Save" cancelTestId="pcf_btn_GeneralData_RightPanel_Equity_Form_Buttons_Cancel"
          saveLabel="pcf_btn_GeneralData_RightPanel_Equity_Form_Buttons_Save" cancelLabel="pcf_btn_GeneralData_RightPanel_Equity_Form_Buttons_Cancel"
          subtleWhenDisabled disabled={busy || !equity || equity.value === ""
            || !validateFreeEquity(equity.value, equity.mode, country, totalCapex, lang).valid} />}
      >
        {equity ? (
          <div className={s.panel}>
            <RadioChoice
              caption={FIN_LABEL.freeEquity} testId="rad_EquityData_FreeEquity" required
              value={equity.mode === "fixed" ? CHOICE_FINANCE.freeEquity.fixedValue : CHOICE_FINANCE.freeEquity.percentage}
              choices={options(CHOICE_LABEL.freeEquity)} disabled={busy}
              onChange={(v) => setEquity({
                mode: v === CHOICE_FINANCE.freeEquity.fixedValue ? "fixed" : "percentage", value: "",
                flags: { locIsStandardFreeEquity: false, locIsStandardShareholderLoan: false },
              })}
            />
            <div className={s.withAction}>
              <div className={s.grow}>
                <TextField
                  label={FIN_LABEL.freeEquityPrefix + freeEquityLabel(equity.mode, country)} required
                  testId="txt_EquityData_FreeEquityEUR" ariaLabel="txt_EquityData_FreeEquityEUR"
                  standard={equity.flags.locIsStandardFreeEquity}
                  value={equity.value} disabled={busy} maxLength={PANEL_MAX_LENGTH.freeEquity} counter={false}
                  error={validateFreeEquity(equity.value, equity.mode, country, totalCapex, lang).message || undefined}
                  onChange={(v) => setEquity({ ...equity, value: v, flags: { locIsStandardFreeEquity: false, locIsStandardShareholderLoan: false } })}
                />
              </div>
              {equity.mode === "percentage" ? (
                <ResetIcon
                  tooltip={FIN_LABEL.resetTo10} disabled={busy}
                  testId="but_Milestones_DisplayProject_Body_General_Content_farmdown_Reset_2"
                  onClick={() => setEquity({ ...equity, value: "10", flags: { locIsStandardFreeEquity: true, locIsStandardShareholderLoan: true } })}
                />
              ) : null}
            </div>
            {equity.mode === "percentage" ? (
              // `txt_EquityData_ShareholderLoanEUR.DisplayMode: DisplayMode.Disabled` (Y:7794).
              <div className={s.disabledBox}>
                <TextField
                  label={FIN_LABEL.shareholderLoanPrefix + freeEquityLabel(equity.mode, country)}
                  testId="txt_EquityData_ShareholderLoanEUR" ariaLabel="txt_EquityData_ShareholderLoanEUR"
                  value={fmtCard(shareholderLoan(equity.mode, equity.value, totalCapex, country, lang), "###,###,###,##0")}
                  disabled onChange={() => undefined}
                />
              </div>
            ) : null}
          </div>
        ) : null}
      </FormPanel>

      {/* ─────────────────────────────────────────────────────────── VAT panel ── */}
      <FormPanel
        open={panel === "vat" && vat !== null} title={FIN_LABEL.vatTitle} width="narrow" onDismiss={closePanel}
        closeTestId="ico_EditEquity_RightPanel_BodyHeaderCancel_1" closeLabel="ico_EditEquity_RightPanel_BodyHeaderCancel_1"
        footer={<PanelButtons
          onSave={() => {
            if (!vat) return;
            const plan = planVatSave({ project, row: vatInput, form: vat, language: lang });
            closePanel();
            void writes.run(vatSaveJob(plan));
          }}
          onCancel={closePanel}
          saveTestId="pcf_btn_GeneralData_RightPanel_VATFinancing_Form_Buttons_Save" cancelTestId="pcf_btn_GeneralData_RightPanel_VATFinancing_Form_Buttons_Cancel"
          // The canvas Save sets no AccessibleLabel; its Cancel carries `btn_…_VATFinancing_Form_Button_Reset` (a copy-paste, verbatim).
          cancelLabel="btn_GeneralData_RightPanel_VATFinancing_Form_Button_Reset"
          subtleWhenDisabled disabled={busy || !vat || !canSaveVatFinancing(vat, country, lang)} />}
      >
        {vat ? (
          <div className={s.panel}>
            <div className={s.withAction}>
              <div className={s.grow}>
                <SelectChoice
                  caption={FIN_LABEL.baseRate} testId="cmb_VATFinancingData_BaseRate"
                  // No asterisk: `lbl_VATFinancingData_Required_BaseRate.Visible` is a copy-paste that is never true (U17).
                  value={vat.baseRate} disabled={busy} choices={baseRateChoices(country)} combo
                  standard={vat.flags.locIsStandardBaseRate}
                  onChange={(v) => setVat({ ...vat, baseRate: Number(v), flags: { ...vat.flags, locIsStandardBaseRate: false } })}
                />
              </div>
              <ResetIcon
                tooltip={FIN_LABEL.resetToStandard} disabled={busy}
                testId="but_Milestones_DisplayProject_Body_General_Content_farmdown_Reset_3"
                onClick={() => {
                  const flags = { ...vat.flags, locIsStandardBaseRate: true };
                  setVat({ ...vat, baseRate: vatBaseRateDefault(country, flags, num(vatInput?.raw[INPUT_COL.baseRate])), flags });
                }}
              />
            </div>
            <div className={s.withAction}>
              <div className={s.grow}>
                <TextField
                  label={FIN_LABEL.bankMargin} testId="txt_VATFinancingData_BankMargin" ariaLabel="txt_VATFinancingData_BankMargin"
                  value={vat.bankMargin} disabled={busy} standard={vat.flags.locIsStandardBankMargin}
                  maxLength={PANEL_MAX_LENGTH.vatBankMargin} counter={false}
                  error={validateVatBankMargin(vat.bankMargin, lang).message || undefined}
                  onChange={(v) => setVat({ ...vat, bankMargin: v, flags: { ...vat.flags, locIsStandardBankMargin: false } })}
                />
              </div>
              <ResetIcon
                tooltip={FIN_LABEL.resetToStandard} disabled={busy}
                testId="but_Milestones_DisplayProject_Body_General_Content_farmdown_Reset_4"
                // `locStandardBankMarginValue: Text(Value(1.5), "0.0")`
                onClick={() => setVat({ ...vat, bankMargin: "1.5", flags: { ...vat.flags, locIsStandardBankMargin: true } })}
              />
            </div>
            <RadioChoice
              caption={FIN_LABEL.vatFacilityAmount} testId="rad_VATFinancingData_VATfacilityAmount"
              value={vat.mode} choices={options(CHOICE_LABEL.vatFacilityAmount)} disabled={busy}
              onChange={(v) => setVat({ ...vat, mode: v, amount: "" })}
            />
            {vat.mode === CHOICE_FINANCE.vatFacilityAmount.individual ? (
              <TextField
                label={FIN_LABEL.vatFacilityAmountPrefix + unit}
                testId="txt_VATFinancingData_VATFacilityAmountEUR" ariaLabel="txt_VATFinancingData_VATFacilityAmountEUR"
                value={vat.amount} disabled={busy} maxLength={PANEL_MAX_LENGTH.vatFacilityAmount} counter={false}
                error={validateVatFacilityAmount(vat.amount, vat.mode, country, lang).message || undefined}
                onChange={(v) => setVat({ ...vat, amount: v })}
              />
            ) : null}
          </div>
        ) : null}
      </FormPanel>

      {/* ──────────────────────────────────────────────────────── tranche panel ── */}
      <FormPanel
        open={panel === "tranche" && form !== null}
        title={form ? trancheFormTitle(form) : FIN_LABEL.addTrancheTitle}
        // `Width: If(InpForm_2.Visible, 350*2+340, 350*2)` — the nearest presets (960 / 750).
        width={form?.repaymentProfile === CHOICE_FINANCE.repaymentProfile.individual ? "wide" : "cost"}
        onDismiss={closePanel}
        closeTestId="ico_EditEquity_RightPanel_BodyHeaderCancel_2" closeLabel="ico_EditEquity_RightPanel_BodyHeaderCancel_2"
        footer={<PanelButtons onSave={() => { void saveTranche(); }}
          saveTestId="pcf_btn_GeneralData_RightPanel_SeniorDebt_Form_Buttons_Save_1" cancelTestId="pcf_btn_GeneralData_RightPanel_SeniorDebt_Form_Buttons_Cancel_1"
          saveLabel="pcf_btn_GeneralData_RightPanel_SeniorDebt_Form_Buttons_Save_1" cancelLabel="pcf_btn_GeneralData_RightPanel_SeniorDebt_Form_Buttons_Cancel_1"
          onCancel={closePanel} subtleWhenDisabled disabled={busy || !form || !canSaveSeniorDebtTranche(form, lang)} />}
      >
        {form && project ? (
          <div className={s.panel}>
            {!assumptionsConnected ? (
              <MessageBar intent="info" data-testid="finance-tranche-assumptions-not-connected">
                <MessageBarBody>{FINANCE_SCREEN_TEXT.assumptionsNotConnected}</MessageBarBody>
              </MessageBar>
            ) : null}
            {/* `con_SeniorDebt_Data_RightPanel_2_SeniorDebt_Form`: horizontal; `InpForm_1` (350), `InpForm_2`
                (340, Individual repayment only) and `InpForm_3` (350). */}
            <div className={s.trancheColumns}>
            <div className={s.trancheColumn}>
              <RadioChoice
                caption={TRANCHE_FORM_LABEL.status} testId="rad_SeniorDebt_Data_TrancheStatus" required
                value={form.trancheStatus} choices={options(TRANCHE_STATUS_LABEL)}
                // `DisplayMode: If(selected.'Tranche Status' = 'Credit Agreement', Disabled, Edit)`
                disabled={busy || trancheStatusRadioDisabled(form.storedTrancheStatus)}
                onChange={(v) => {
                  setTranche(applyTrancheStatusChange({ form, next: v, project, standard, banks, tranches: trancheInputs, language: lang }));
                  setRepaymentRows([]); setStepUpRows([]);
                }}
              />
              {standardAssumptionConflict(form.trancheStatus ?? -1, form.otherTranches, form.trancheId)
                ? <Text className={s.error} role="alert">{FIN_LABEL.standardTrancheCantBeAdded}</Text> : null}
              <SelectChoice
                caption={TRANCHE_FORM_LABEL.bank} testId="cmb_SeniorDebt_Data_Bank" required={!isStd}
                value={form.bankId} disabled={tDisabled} choices={bankChoices} combo placeholder={FIN_LABEL.findBank}
                onChange={(id) => patchTranche({ bankId: id, bankName: banks.find((b) => b.id === id)?.bankname ?? null })}
              />
              {isOtherBank(form.bankId, form.bankName) ? (
                <TextField
                  label={FIN_LABEL.otherBank} required testId="txt_SeniorDebtData_BankName" ariaLabel="txt_SeniorDebtData_BankName"
                  value={form.otherBankName} disabled={busy} maxLength={PANEL_MAX_LENGTH.other} counter={false}
                  onChange={(v) => patchTranche({ otherBankName: v })}
                />
              ) : null}
              <Switch
                label={TRANCHE_FORM_LABEL.kfwTranche} aria-label="tgl_SeniorDebt_Data_KfW_Tranche"
                data-testid="tgl_SeniorDebt_Data_KfW_Tranche" checked={form.kfwEnabled} disabled={tDisabled}
                // `OnUncheck: Reset(drp_SeniorDebt_Data_KfW_Tranche_Value)` — its default is blank when unchecked.
                onChange={(_, d) => patchTranche({ kfwEnabled: d.checked, ...(d.checked ? {} : { kfwValue: null }) })}
              />
              <SelectChoice
                caption={TRANCHE_FORM_LABEL.kfwTranche} testId="drp_SeniorDebt_Data_KfW_Tranche_Value"
                required={!isStd} value={form.kfwValue} disabled={tDisabled || !form.kfwEnabled}
                choices={kfwChoices}
                onChange={(v) => patchTranche({ kfwValue: v })}
              />
              <div className={s.withAction}>
                <div className={s.grow}>
                  <DateBox
                    caption={TRANCHE_FORM_LABEL.financialClose} testId="dte_SeniorDebt_Data_Financial_Close" required
                    value={form.financialClose} disabled={tDisabled} standard={form.financialCloseStandard === true}
                    onChange={(v) => patchTranche({ financialClose: v, financialCloseStandard: false })}
                  />
                </div>
                {!isStd ? (
                  <ResetIcon
                    tooltip={FIN_LABEL.resetFinancialClose} testId="ico_SeniorDebt_Data_Financial_Close_Reset"
                    // `DisplayMode: If(locIsFinancialCloseDateStandard, Disabled, Edit)`; the standard FC needs
                    // `months_from_cluster_5_to_fc` from Fabric SQL (D2).
                    disabled={busy || form.financialCloseStandard === true || !assumptionsConnected}
                    onClick={() => patchTranche({ financialClose: standard?.financialClose ?? null, financialCloseStandard: true })}
                  />
                ) : null}
              </div>
              <YearMonth
                caption={TRANCHE_FORM_LABEL.tenor} testIdYears="Drp_SeniorDebtData_Tenor_YY"
                testIdMonths="drp_SeniorDebtData_Tenor_MM" maxYears={25} required
                yy={form.tenorYears} mm={form.tenorMonths} disabled={tDisabled} error={tenorError || undefined}
                onChange={(yy, mm) => regenerate({ tenorYears: yy, tenorMonths: mm })}
              />
              <RadioChoice
                caption={TRANCHE_FORM_LABEL.drawdown} testId="rad_SeniorDebt_Data_Drawdown"
                value={form.drawdown} choices={options(CHOICE_LABEL.drawdown)} disabled={busy} readOnly={isStd}
                onChange={(v) => patchTranche({ drawdown: v })}
              />
              <Text className={s.sectionTitle}>{TRANCHE_FORM_LABEL.dscr}</Text>
              <div className={s.pair}>
                <div className={s.pairItem}>
                  <TextField
                    label={TRANCHE_FORM_LABEL.dscrContracted} testId="txt_SeniorDebt_Data_DSCR_Contracted" ariaLabel="txt_SeniorDebt_Data_DSCR_Contracted" maxLength={PANEL_MAX_LENGTH.other} counter={false}
                    required={form.gearing === CHOICE_FINANCE.gearing.debtSizing}
                    value={form.dscrContracted} disabled={tDisabled}
                    error={validateDscr(form.dscrContracted, lang).message || undefined}
                    onChange={(v) => patchTranche({ dscrContracted: v })}
                  />
                </div>
                <div className={s.pairItem}>
                  <TextField
                    label={TRANCHE_FORM_LABEL.dscrUncontracted} testId="txt_SeniorDebtData_DSCR_Uncontracted" ariaLabel="txt_SeniorDebtData_DSCR_Uncontracted" maxLength={PANEL_MAX_LENGTH.other} counter={false}
                    required={form.gearing === CHOICE_FINANCE.gearing.debtSizing}
                    value={form.dscrUncontracted} disabled={tDisabled}
                    error={validateDscr(form.dscrUncontracted, lang).message || undefined}
                    onChange={(v) => patchTranche({ dscrUncontracted: v })}
                  />
                </div>
              </div>
              <RadioChoice
                caption={FIN_LABEL.energyYield} testId="rad_SeniorDebt_Data_EnergyYield"
                value={form.energyYield ?? null} choices={options(CHOICE_LABEL.energyYield)} disabled={busy} readOnly={isStd}
                onChange={(v) => patchTranche({ energyYield: v })}
              />
              <RadioChoice
                caption={FIN_LABEL.spotCurve} testId="rad_SeniorDebt_Data_SpotCurve"
                value={form.spotCurve ?? null} choices={options(CHOICE_LABEL.spotCurve)} disabled={busy} readOnly={isStd}
                onChange={(v) => patchTranche({ spotCurve: v })}
              />
              <RadioChoice
                caption={FIN_LABEL.gearing} testId="rad_SeniorDebtData_Gearing"
                value={form.gearing} choices={options(CHOICE_LABEL.gearing)} disabled={busy} readOnly={isStd}
                // `locSelectedFixedAmount: []; Reset(rad_SeniorDebt_Fixed_Amount_Options)` (B26): the option is blank.
                onChange={(v) => patchTranche({ gearing: v, fixedAmountOption: null, fixedAmountValue: "" })}
              />
              {form.gearing === CHOICE_FINANCE.gearing.fixedAmount ? (
                <>
                  <RadioChoice
                    caption={FIN_LABEL.fixedAmount} testId="rad_SeniorDebt_Fixed_Amount_Options"
                    value={form.fixedAmountOption} choices={options(CHOICE_LABEL.fixedAmount)} disabled={busy}
                    onChange={(v) => patchTranche({ fixedAmountOption: v, fixedAmountValue: "" })}
                  />
                  {/* `con_SeniorDebtData_VATFacilityAmountEUR_5.Visible: Gearing = Fixed Amount && !IsBlank(<option>.Selected)` */}
                  {form.fixedAmountOption !== null ? <TextField
                    label={form.fixedAmountOption === CHOICE_FINANCE.fixedAmount.percentOfCapex
                      ? FIN_LABEL.percentOfCapex : FIN_LABEL.fixedValuePrefix + unit}
                    required testId="txt_SeniorDebtData_FixedAmountValue" ariaLabel="txt_SeniorDebtData_FixedAmountValue"
                    value={form.fixedAmountValue} disabled={tDisabled}
                    error={validateFixedAmount(form.fixedAmountValue, form.fixedAmountOption, country, lang).message || undefined}
                    onChange={(v) => patchTranche({ fixedAmountValue: v })}
                    maxLength={PANEL_MAX_LENGTH.other} counter={false}
                  /> : null}
                </>
              ) : null}
              <RadioChoice
                caption={FIN_LABEL.repaymentProfile} testId="rad_SeniorDebt_Data_RepaymentProfile"
                value={form.repaymentProfile} choices={options(CHOICE_LABEL.repaymentProfile)} disabled={busy} readOnly={isStd}
                onChange={(v) => regenerate({ repaymentProfile: v })}
              />
              <YearMonth
                caption={FIN_LABEL.startRepaymentYears} testIdYears="Drp_SeniorDebtData_StartRepayment_YY"
                testIdMonths="Drp_SeniorDebtData_StartRepayment_MM" maxYears={5} required
                yy={form.startRepaymentYears} mm={form.startRepaymentMonths} disabled={tDisabled}
                onChange={(yy, mm) => regenerate({ startRepaymentYears: yy, startRepaymentMonths: mm })}
              />
              <SelectChoice
                caption={FIN_LABEL.frequencyOfRepayment} testId="drp_SeniorDebt_Data_Frequency_Of_Repayment" required
                value={form.frequencyOfRepayment} choices={FREQUENCY_OPTIONS} disabled={tDisabled}
                onChange={(v) => patchTranche({ frequencyOfRepayment: Number(v) })}
              />
              <TextField
                label={FIN_LABEL.hedging} required testId="txt_SeniorDebtData_Hedging" ariaLabel="txt_SeniorDebtData_Hedging" maxLength={PANEL_MAX_LENGTH.other} counter={false}
                value={form.hedging} disabled={tDisabled} error={validateHedging(form.hedging, lang).message || undefined}
                onChange={(v) => patchTranche({ hedging: v })}
              />
            </div>
            {/* `con_GeneralData_RightPanel_SeniorDebt_InpForm_2.Visible: Repayment Profile = Individual` */}
            {form.repaymentProfile === CHOICE_FINANCE.repaymentProfile.individual ? (
              <div className={s.trancheColumn}>
                {repaymentRows.map((r, i) => (
                <TextField
                  key={r.year} label={`${r.year}${FIN_LABEL.repaymentAmountInfix}${unit}`} required
                  testId="txt_SeniorDebtData_RepaymentAmount" ariaLabel="txt_SeniorDebtData_RepaymentAmount" maxLength={PANEL_MAX_LENGTH.other} counter={false}
                  value={r.value} disabled={busy}
                  error={r.valid ? undefined : validateRepaymentAmount(r.value, country, lang).message}
                  onChange={(v) => {
                    const next = [...repaymentRows];
                    next[i] = { ...r, value: v, dirty: true, valid: validateRepaymentAmount(v, country, lang).valid };
                    setRepaymentRows(next);
                    patchTranche({});
                  }}
                />
                ))}
              </div>
            ) : null}
            <div className={s.trancheColumn}>
              <RadioChoice
                caption={TRANCHE_FORM_LABEL.upfrontFee} testId="rad_SeniorDebtData_UpfrontFee"
                value={form.upfrontFeeOption} choices={options(CHOICE_LABEL.upfrontFee)} disabled={tDisabled}
                onChange={(v) => patchTranche({ upfrontFeeOption: v, upfrontFeeValue: "" })}
              />
              <TextField
                label={FIN_LABEL.upfrontFeeValuePrefix
                  + (form.upfrontFeeOption === CHOICE_FINANCE.upfrontFee.percentageOfDebt ? "[%]" : unit)}
                required testId="txt_SeniorDebtData_UpfrontFeeValue" ariaLabel="txt_SeniorDebtData_UpfrontFeeValue" maxLength={PANEL_MAX_LENGTH.other} counter={false}
                value={form.upfrontFeeValue} disabled={tDisabled}
                error={validateUpfrontFee(form.upfrontFeeValue, form.upfrontFeeOption, country, lang).message || undefined}
                onChange={(v) => patchTranche({ upfrontFeeValue: v })}
              />
              <RadioChoice
                caption={TRANCHE_FORM_LABEL.commitmentFee} testId="rad_SeniorDebtData_CommitmentFee"
                value={form.commitmentFeeOption} choices={options(CHOICE_LABEL.commitmentFee)} disabled={tDisabled}
                onChange={(v) => patchTranche({ commitmentFeeOption: v, commitmentFeeValue: "" })}
              />
              <TextField
                label={TRANCHE_FORM_LABEL.commitmentFeeValue} required testId="txt_SeniorDebtData_Commitment_Fee_Value"
                ariaLabel="txt_SeniorDebtData_Commitment_Fee_Value" maxLength={PANEL_MAX_LENGTH.other} counter={false}
                value={form.commitmentFeeValue} disabled={tDisabled}
                error={validateCommitmentFeeValue(form.commitmentFeeValue, lang).message || undefined}
                onChange={(v) => patchTranche({ commitmentFeeValue: v })}
              />
              <YearMonth
                caption={TRANCHE_FORM_LABEL.commitmentFeeFreePeriod}
                testIdYears="Drp_SeniorDebtData_Commitment_Fee_Free_Period_YY"
                testIdMonths="Drp_SeniorDebtData_Commitment_Fee_Free_Period_MM" maxYears={3}
                yy={form.commitmentFeePeriodYears} mm={form.commitmentFeePeriodMonths} disabled={tDisabled}
                onChange={(yy, mm) => patchTranche({ commitmentFeePeriodYears: yy, commitmentFeePeriodMonths: mm })}
              />
              <Text className={s.sectionTitle}>{TRANCHE_FORM_LABEL.interestRate}</Text>
              <RadioChoice
                caption={TRANCHE_FORM_LABEL.baseRate} testId="rad_SeniorDebtData_BaseRate_2"
                value={form.baseRate} disabled={tDisabled} choices={baseRateChoices(country)}
                onChange={(v) => patchTranche({ baseRate: v })}
              />
              {/* The canvas names are crossed: `txt_SeniorDebtData_SwapMargin` carries 'Swap Rate'. */}
              <TextField
                label={TRANCHE_FORM_LABEL.swapRate} required testId="txt_SeniorDebtData_SwapMargin" ariaLabel="txt_SeniorDebtData_SwapMargin" maxLength={PANEL_MAX_LENGTH.other} counter={false}
                value={form.swapRate} disabled={tDisabled}
                error={validateRateField(form.swapRate, lang).message || undefined}
                onChange={(v) => patchTranche({ swapRate: v })}
              />
              <TextField
                label={TRANCHE_FORM_LABEL.bankMarginConstruction} required
                testId="txt_SeniorDebtData_BankMargin_ConstructionPhase" ariaLabel="txt_SeniorDebtData_BankMargin_ConstructionPhase" maxLength={PANEL_MAX_LENGTH.other} counter={false}
                value={form.bankMarginConstruction}
                disabled={tDisabled} error={validateRateField(form.bankMarginConstruction, lang).message || undefined}
                onChange={(v) => patchTranche({ bankMarginConstruction: v })}
              />
              <TextField
                label={TRANCHE_FORM_LABEL.bankMarginOperational} required
                testId="txt_SeniorDebtData_BankMargin_OperationalPhase" ariaLabel="txt_SeniorDebtData_BankMargin_OperationalPhase" maxLength={PANEL_MAX_LENGTH.other} counter={false}
                value={form.bankMarginOperational}
                disabled={tDisabled} error={validateRateField(form.bankMarginOperational, lang).message || undefined}
                onChange={(v) => patchTranche({ bankMarginOperational: v })}
              />
              <YearMonth
                caption={FIN_LABEL.fixedInterestRate} testIdYears="drp_SeniorDebtData_Fixed_Interest_Rate_YY"
                testIdMonths="drp_SeniorDebtData_Fixed_Interest_Rate_MM" maxYears={25} required
                yy={form.fixedInterestRateYears} mm={form.fixedInterestRateMonths} disabled={tDisabled}
                error={validateYearMonthPair(form.fixedInterestRateYears, form.fixedInterestRateMonths).message || undefined}
                onChange={(yy, mm) => {
                  patchTranche({ fixedInterestRateYears: yy, fixedInterestRateMonths: mm });
                  // B29 — the FIR YY `OnChange` seeds row 1 while the toggle is on and there is no row.
                  if (form.stepUpEnabled && stepUpRows.length === 0) setStepUpRows([firstStepUpRow()]);
                }}
              />
              <Switch
                label={FIN_LABEL.stepUpBankMargin} aria-label="tgl_SeniorDebtData_Step_Up_Bank_Margin"
                data-testid="tgl_SeniorDebtData_Step_Up_Bank_Margin" checked={form.stepUpEnabled} disabled={tDisabled}
                onChange={(_, d) => {
                  patchTranche({ stepUpEnabled: d.checked });
                  // B28 — `OnCheck` seeds row 1 only with a valid FIR; `OnUncheck: Clear(colStepUpBankMargins)`.
                  if (!d.checked) setStepUpRows([]);
                  else if (canSeedStepUp(form.fixedInterestRateYears, form.fixedInterestRateMonths)) setStepUpRows([firstStepUpRow()]);
                }}
              />
              {form.stepUpEnabled ? (
                <>
                  {stepUpRows.map((r, i) => {
                    const prev = i === 0 ? null : stepUpRows[i - 1]?.durationYY ?? null;
                    const from = prev === null ? 1 : prev === form.fixedInterestRateYears ? "" : prev + 1;
                    const caption = `${FIN_LABEL.stepUpYearPrefix}${from}${FIN_LABEL.stepUpYearSuffix}`;
                    return (
                      <div key={r.id} className={s.pair}>
                        <div className={s.pairItem}>
                          <SelectChoice
                            caption={caption} testId="drp_SeniorDebtData_StepUp_Bank_Margin_YY"
                            value={r.durationYY} disabled={busy}
                            choices={stepUpYearOptions(prev, form.fixedInterestRateYears)
                              .map((y) => ({ value: y, name: durationOptionName(y, "year") }))}
                            onChange={(v) => {
                              const next = [...stepUpRows];
                              next[i] = { ...r, durationYY: Number(v) };
                              setStepUpRows(next);
                              patchTranche({});
                            }}
                          />
                        </div>
                        <div className={s.pairItem}>
                          <TextField
                            label={FIN_LABEL.margin} required testId="txt_SeniorDebtData_StepUp_Bank_Margin_Percentage"
                            ariaLabel="txt_SeniorDebtData_StepUp_Bank_Margin_Percentage" maxLength={PANEL_MAX_LENGTH.other} counter={false}
                            value={r.margin} disabled={busy}
                            error={r.valid ? undefined : MSG.stepUpMargin} // `Visible: Not(ThisItem.Valid)` — a new row shows it
                            onChange={(v) => {
                              const next = [...stepUpRows];
                              next[i] = { ...r, margin: v, valid: validateStepUpMargin(v, lang).valid };
                              setStepUpRows(next);
                              patchTranche({});
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                  <div className={s.buttons}>
                    <Button
                      appearance="outline" icon={<DeleteRegular />} aria-label="btn_SeniorDebt_BankMargin_Remove_StepUp_LastPeriod"
                      data-testid="btn_SeniorDebt_BankMargin_Remove_StepUp_LastPeriod"
                      disabled={busy || !stepUpRemoveEnabled(stepUpRows, isStd)}
                      onClick={() => {
                        if (!stepUpPeriodChangeAllowed(form.fixedInterestRateYears, form.fixedInterestRateMonths)) return;
                        setStepUpRows(stepUpRows.slice(0, -1)); patchTranche({});
                      }}
                    >
                      {FIN_LABEL.removeLastPeriod}
                    </Button>
                    <Button
                      appearance="outline" icon={<AddRegular />} aria-label="btn_SeniorDebt_BankMargin_Add_StepUp_Period_1"
                      data-testid="btn_SeniorDebt_BankMargin_Add_StepUp_Period_1"
                      disabled={busy || !stepUpAddEnabled(stepUpRows, form.fixedInterestRateYears, isStd)}
                      onClick={() => {
                        if (!stepUpPeriodChangeAllowed(form.fixedInterestRateYears, form.fixedInterestRateMonths)) return;
                        setStepUpRows([...stepUpRows, { id: stepUpRows.length + 1, durationYY: null, margin: "", valid: false }]);
                        patchTranche({});
                      }}
                    >
                      {FIN_LABEL.addStepUpPeriod}
                    </Button>
                  </div>
                  {!stepUpScheduleValid(stepUpRows, form.fixedInterestRateYears)
                    ? <Text className={s.error} role="alert">{MSG.stepUpDuration}</Text> : null}
                </>
              ) : null}
              <Switch
                label={FIN_LABEL.swapAfterFixedPeriod} aria-label="tgl_SeniorDebt_Data_Swap_After_Fixed_Period"
                data-testid="tgl_SeniorDebt_Data_Swap_After_Fixed_Period" checked={form.swapAfterFixedPeriod}
                disabled={tDisabled} onChange={(_, d) => patchTranche({ swapAfterFixedPeriod: d.checked })}
              />
              {form.swapAfterFixedPeriod ? (
                <>
                  {/* Crossed again: `txt_SeniorDebtData_SwapRate` writes 'Swap Margin [%]'. */}
                  <TextField
                    label={TRANCHE_FORM_LABEL.swapRate} required testId="txt_SeniorDebtData_SwapRate" ariaLabel="txt_SeniorDebtData_SwapRate" maxLength={PANEL_MAX_LENGTH.other} counter={false}
                    value={form.swapMargin} disabled={tDisabled}
                    error={validateRateField(form.swapMargin, lang).message || undefined}
                    onChange={(v) => patchTranche({ swapMargin: v })}
                  />
                  {/* `txt_SeniorDebtData_BankMargin` writes 'Bank Rate'. */}
                  <TextField
                    label={FIN_LABEL.bankMargin} required testId="txt_SeniorDebtData_BankMargin" ariaLabel="txt_SeniorDebtData_BankMargin" maxLength={PANEL_MAX_LENGTH.other} counter={false}
                    value={form.bankRate} disabled={tDisabled}
                    error={validateRateField(form.bankRate, lang).message || undefined}
                    onChange={(v) => patchTranche({ bankRate: v })}
                  />
                </>
              ) : null}
            </div>
            </div>
          </div>
        ) : null}
      </FormPanel>

      {/* ──────────────────────────────────────────────── Decommissioning panel ── */}
      <FormPanel
        open={panel === "decommissioning" && decom !== null} title={FIN_LABEL.decommissioningTitle}
        width="narrow" onDismiss={closePanel}
        closeTestId="Icon5" closeLabel="Icon5"
        footer={<PanelButtons
          onSave={() => {
            if (!decom) return;
            const plan = planDecommissioningSave({ row: decInput, form: decom, language: lang });
            closePanel();
            void writes.run(decommissioningSaveJob(plan));
          }}
          onCancel={closePanel}
          saveTestId="pcf_btn_GeneralData_RightPanel_Decommissioning_Form_Buttons_Save_1" cancelTestId="pcf_btn_GeneralData_RightPanel_Decommissioning_Form_Buttons_Cancel_1"
          saveLabel="pcf_btn_GeneralData_RightPanel_Decommissioning_Form_Buttons_Save_1" cancelLabel="pcf_btn_GeneralData_RightPanel_Decommissioning_Form_Buttons_Cancel_1"
          subtleWhenDisabled disabled={busy || !decom || !canSaveDecommissioning(decom, decDates, country, lang)} />}
      >
        {decom ? (
          <div className={s.panel}>
            <RadioChoice
              caption={FIN_LABEL.costsOfDecommissioning} testId="rad_DecommissioningData_CostsOfDecommissioning_1"
              value={decom.costType} choices={options(CHOICE_LABEL.costsOfDecommissioning)} disabled={busy}
              onChange={(v) => patchDecom({ costType: v, value: "" }, "CostsofDecommissioningValue")}
            />
            <div className={s.withAction}>
              <div className={s.grow}>
                <TextField
                  label={decom.costType === CHOICE_FINANCE.costsOfDecommissioning.perTurbine
                    ? `${FIN_LABEL.costsOfDecommissioningPerWtgPrefix}${country === "Poland" ? "PLN" : "EUR"}${FIN_LABEL.costsOfDecommissioningPerWtgSuffix}`
                    : FIN_LABEL.totalCostsOfDecommissioningPrefix + unit}
                  required testId="txt_DecommissioningData_Costs_Of_Decommissioning_Value_1"
                  ariaLabel="txt_DecommissioningData_Costs_Of_Decommissioning_Value_1" maxLength={PANEL_MAX_LENGTH.decommissioningValue} counter={false}
                  value={decom.value} disabled={busy} standard={decom.flags.CostsofDecommissioningValue}
                  error={validateDecommissioningValue(decom.value, decom.costType ?? CHOICE_FINANCE.costsOfDecommissioning.total, country, lang).message || undefined}
                  onChange={(v) => patchDecom({ value: v }, "CostsofDecommissioningValue")}
                />
              </div>
              <ResetIcon
                tooltip={FIN_LABEL.resetToStandard} disabled={busy || !assumptionsConnected}
                testId="ico_DecommissioningData_Cost_of_Decommisioning_Reset_to_Standard"
                onClick={() => patchDecom({
                  value: String(decom.costType === CHOICE_FINANCE.costsOfDecommissioning.total
                    ? decStandard?.amountTotal ?? "" : decStandard?.amountPerTurbine ?? ""),
                }, "CostsofDecommissioningValue", true)}
              />
            </div>
            <div className={s.withAction}>
              <div className={s.grow}>
                <TextField
                  label={FIN_LABEL.costOfGuarantee} required testId="txt_DecommissioningData_Cost_of_Guarantee_Percentage_1"
                  ariaLabel="txt_DecommissioningData_Cost_of_Guarantee_Percentage_1" maxLength={PANEL_MAX_LENGTH.other} counter={false}
                  value={decom.guarantee} disabled={busy} standard={decom.flags.CostofGuarantee}
                  error={validateCostOfGuarantee(decom.guarantee, lang).message || undefined}
                  onChange={(v) => patchDecom({ guarantee: v }, "CostofGuarantee")}
                />
              </div>
              <ResetIcon
                tooltip={FIN_LABEL.resetToStandard} disabled={busy || !assumptionsConnected}
                testId="ico_DecommissioningData_Cost_Of_Guarantee_Reset_to_Standard"
                onClick={() => patchDecom({ guarantee: fmtCard(decStandard?.guaranteeCosts, "0.0") }, "CostofGuarantee", true)}
              />
            </div>
            <div className={s.withAction}>
              <div className={s.grow}>
                <DateBox
                  caption={FIN_LABEL.dateOfIssue} testId="dte_DecommissioningData_Date_of_Issue_1" required format="dd.mm.yyyy"
                  value={decom.dateOfIssue} disabled={busy} standard={decom.flags.DateofIssue}
                  error={validateDateOfIssue(decom.dateOfIssue, decDates).message || undefined}
                  onChange={(v) => patchDecom({ dateOfIssue: v }, "DateofIssue")}
                />
              </div>
              <ResetIcon
                tooltip={FIN_LABEL.resetDateOfIssue} disabled={busy}
                testId="ico_DecommissioningData_Date_of_Issue_Reset_to_Standard_1"
                onClick={() => patchDecom({ dateOfIssue: project?.construction ?? null }, "DateofIssue", true)}
              />
            </div>
            <div className={s.withAction}>
              <div className={s.grow}>
                <DateBox
                  caption={FIN_LABEL.startDateOfSaving} testId="dte_DecommissioningData_Start_Date_of_Saving_1" required format="dd.mm.yyyy"
                  value={decom.startDateOfSaving} disabled={busy} standard={decom.flags.StartDateofSaving}
                  error={validateStartDateOfSaving(decom.startDateOfSaving, decom.dateOfIssue, decDates).message || undefined}
                  onChange={(v) => patchDecom({ startDateOfSaving: v }, "StartDateofSaving")}
                />
              </div>
              <ResetIcon
                tooltip={FIN_LABEL.resetStartDateOfSaving} disabled={busy}
                testId="ico_DecommissioningData_Start_Date_of_Saving_Reset_to_Standard_1"
                onClick={() => patchDecom({ startDateOfSaving: project?.cod ?? null }, "StartDateofSaving", true)}
              />
            </div>
            <div className={s.withAction}>
              <div className={s.grow}>
                <YearMonth
                  caption={FIN_LABEL.durationOfSaving} testIdYears="cmb_DecommissioningData_Duration_of_Saving_YY_1" combo
                  testIdMonths="cmb_DecommissioningData_Duration_of_Saving_MM_1" maxYears={35} required
                  yy={decom.years} mm={decom.months} disabled={busy} standard={decom.flags.DurationofSaving}
                  error={decom.years === 0 && decom.months === 0 ? FIN_LABEL.zeroDurationNotAllowed : undefined}
                  onChange={(yy, mm) => patchDecom({ years: yy, months: mm }, "DurationofSaving")}
                />
              </div>
              <ResetIcon
                tooltip={FIN_LABEL.resetToStandard} disabled={busy || !assumptionsConnected}
                testId="ico_DecommissioningData_Duration_of_Saving_Reset_to_Standard"
                onClick={() => {
                  const d = unpackMMYY(decStandard?.durationSaving ?? null);
                  patchDecom({ years: d.years, months: d.months }, "DurationofSaving", true);
                }}
              />
            </div>
            {/* `txt_DecommissioningData_End_Date_of_Saving_1.DisplayMode: DisplayMode.Disabled` (Y:15057). */}
            <div className={s.disabledBox}>
              <TextField label={FIN_LABEL.endDateOfSaving} value={decom.years === null || decom.months === null ? "" : fmtDateDots(decEnd)}
                testId="txt_DecommissioningData_End_Date_of_Saving_1" ariaLabel="txt_DecommissioningData_End_Date_of_Saving_1"
                disabled onChange={() => undefined} />
            </div>
            {decEnd !== null && project?.endDate && decEnd.getTime() > project.endDate.getTime()
              ? <Text className={s.error} role="alert">{FIN_LABEL.endDateOfSavingAfterEnd}</Text> : null}
            <div className={s.withAction}>
              <div className={s.grow}>
                <DateBox
                  caption={FIN_LABEL.dateOfExpiry} testId="dte_DecommissioningData_Date_of_Expiry_1" required format="dd.mm.yyyy"
                  value={decom.dateOfExpiry} disabled={busy} standard={decom.flags.DateofExpiry}
                  error={validateDateOfExpiry(decom.dateOfExpiry, decom.dateOfIssue, decDates).message || undefined}
                  onChange={(v) => patchDecom({ dateOfExpiry: v }, "DateofExpiry")}
                />
              </div>
              <ResetIcon
                tooltip={FIN_LABEL.resetDateOfExpiry} disabled={busy}
                testId="ico_DecommissioningData_Date_of_Expiry_Reset_1"
                onClick={() => patchDecom({ dateOfExpiry: project?.endDate ?? null }, "DateofExpiry", true)}
              />
            </div>
          </div>
        ) : null}
      </FormPanel>

      {/* ──────────────────────────────────────────────────────── DSRA/DSRF panel ── */}
      <FormPanel
        open={panel === "dsra" && dsra !== null} title={FIN_LABEL.dsraTitle} width="narrow" onDismiss={closePanel}
        closeTestId="ico_EditDSRA_DRSF_RightPanel_BodyHeaderCancel" closeLabel="ico_EditDSRA_DRSF_RightPanel_BodyHeaderCancel"
        footer={<PanelButtons
          onSave={() => {
            if (!dsra) return;
            const plan = planDsraSave({ project, row: dsraInput, form: dsra, language: lang });
            closePanel();
            void writes.run(dsraSaveJob(plan));
          }}
          onCancel={closePanel}
          saveTestId="pcf_btn_GeneralData_RightPanel_Equity_Form_Buttons_Save_1" cancelTestId="pcf_btn_GeneralData_RightPanel_Equity_Form_Buttons_Cancel_1"
          saveLabel="pcf_btn_GeneralData_RightPanel_Equity_Form_Buttons_Save_1" cancelLabel="pcf_btn_GeneralData_RightPanel_Equity_Form_Buttons_Cancel_1"
          subtleWhenDisabled disabled={busy || !dsra || !canSaveDsra(dsra, project?.cod ?? null, lang)} />}
      >
        {dsra ? (
          <div className={s.panel}>
            <RadioChoice
              caption={FIN_LABEL.type} testId="rad_DSRA_DRSFData_DSRA_DRSF_Type" required
              value={dsra.type} choices={options(CHOICE_LABEL.dsraDsrfType)} disabled={busy}
              onChange={(v) => setDsra(applyDsraTypeChange(dsra, v, assumptionsConnected ? dsraStandard : null,
                defaultEndOfDebtServiceSavings(project?.cod ?? null, tenorTranches), lang))}
            />
            {dsra.type === CHOICE_FINANCE.dsraDsrfType.dsrf ? (
              <>
                <TextField
                  label={TRANCHE_FORM_LABEL.commitmentFeeValue} required testId="txt_DSRA_DRSFData_Commitment_Fee_Percentage"
                  ariaLabel="txt_DSRA_DRSFData_Commitment_Fee_Percentage" maxLength={PANEL_MAX_LENGTH.other} counter={false}
                  value={dsra.commitmentFee} disabled={busy} standard={dsra.flags.locIsStandardCommitmentFee}
                  error={validateCommitmentFeeValue(dsra.commitmentFee, lang).message || undefined}
                  onChange={(v) => setDsra({ ...dsra, commitmentFee: v, flags: { ...dsra.flags, locIsStandardCommitmentFee: false } })}
                />
                <YearMonth
                  caption={TRANCHE_FORM_LABEL.commitmentFeeFreePeriod}
                  testIdYears="cmb_DSRA_DRSFData_commitment_fee_free_period_YY" combo
                  testIdMonths="cmb_DSRA_DRSFData_commitment_fee_free_period_MM" maxYears={3} required
                  yy={dsra.cfYears} mm={dsra.cfMonths} disabled={busy} standard={dsra.flags.locIsStandardCommitmentFeeFreeDuration}
                  onChange={(yy, mm) => setDsra({ ...dsra, cfYears: yy, cfMonths: mm, flags: { ...dsra.flags, locIsStandardCommitmentFeeFreeDuration: false } })}
                />
              </>
            ) : null}
            <SelectChoice
              caption={FIN_LABEL.baseRate} testId="drp_DSRA_DRSFData_Base_Rate" required
              value={dsra.baseRate} disabled={busy} choices={baseRateChoices(country)}
              onChange={(v) => setDsra({ ...dsra, baseRate: Number(v), flags: { ...dsra.flags, locIsStandardBaseRate: false } })}
            />
            <TextField
              label={FIN_LABEL.margin} required testId="txt_DSRA_DRSFData_Margin" ariaLabel="txt_DSRA_DRSFData_Margin" maxLength={PANEL_MAX_LENGTH.other} counter={false} value={dsra.margin}
              standard={dsra.flags.locIsStandardMargin}
              disabled={busy} error={validateDsraMargin(dsra.margin, dsra.type ?? CHOICE_FINANCE.dsraDsrfType.dsra, lang).message || undefined}
              onChange={(v) => setDsra({ ...dsra, margin: v, flags: { ...dsra.flags, locIsStandardMargin: false } })}
            />
            {dsra.type === CHOICE_FINANCE.dsraDsrfType.dsrf ? (
              <TextField
                label={FIN_LABEL.upfrontFeePercent} required testId="txt_DSRA_DRSFData_Upfront_Fee_Percentage"
                ariaLabel="txt_DSRA_DRSFData_Upfront_Fee_Percentage" maxLength={PANEL_MAX_LENGTH.other} counter={false}
                value={dsra.upfrontFee} disabled={busy} standard={dsra.flags.locIsStandardUpfrontfee}
                error={validateDsraUpfrontFee(dsra.upfrontFee, lang).message || undefined}
                onChange={(v) => setDsra({ ...dsra, upfrontFee: v, flags: { ...dsra.flags, locIsStandardUpfrontfee: false } })}
              />
            ) : null}
            <TextField
              label={FIN_LABEL.percentageOfFutureDebtService} required testId="txt_DSRA_DRSFData_POFDS_Fee_Percentage"
              ariaLabel="txt_DSRA_DRSFData_POFDS_Fee_Percentage" maxLength={PANEL_MAX_LENGTH.other} counter={false}
              value={dsra.percentage} disabled={busy} standard={dsra.flags.locIsStandardPercentageoffuturedebtservice}
              error={validatePofds(dsra.percentage, lang).message || undefined}
              onChange={(v) => setDsra({ ...dsra, percentage: v, flags: { ...dsra.flags, locIsStandardPercentageoffuturedebtservice: false } })}
            />
            <YearMonth
              caption={FIN_LABEL.durationOfFutureDebtService}
              testIdYears="cmb_DSRA_DRSFData_Duration_of_furture_debt_service_YY" combo
              testIdMonths="cmb_DSRA_DRSFData_Duration_of_furture_debt_service_MM" maxYears={10} required
              yy={dsra.durYears} mm={dsra.durMonths} disabled={busy} standard={dsra.flags.locIsStandardDurationoffuturedebtservice}
              error={dsra.durYears === 0 && dsra.durMonths === 0 ? FIN_LABEL.zeroDurationNotAllowed : undefined}
              onChange={(yy, mm) => setDsra({ ...dsra, durYears: yy, durMonths: mm, flags: { ...dsra.flags, locIsStandardDurationoffuturedebtservice: false } })}
            />
            <div className={s.withAction}>
              <div className={s.grow}>
                <DateBox
                  caption={FIN_LABEL.endOfDebtServiceSavings} testId="dte_DSRA_DRSFData_End_of_debt_service_savings"
                  required value={dsra.endOfSavings} disabled={busy} standard={dsra.flags.locIsStandardEndofDebtserviceSavings}
                  error={validateEndOfDebtServiceSavings(dsra.endOfSavings, project?.cod ?? null).message || undefined}
                  onChange={(v) => setDsra({ ...dsra, endOfSavings: v, flags: { ...dsra.flags, locIsStandardEndofDebtserviceSavings: false } })}
                />
              </div>
              {/* `but_DSRA_DRSFData_End_of_debt_service_savings` — `Icon: "CalendarAdd"`, no caption. */}
              <Button
                appearance="transparent" icon={<CalendarAddRegular />}
                aria-label="but_DSRA_DRSFData_End_of_debt_service_savings"
                data-testid="but_DSRA_DRSFData_End_of_debt_service_savings" disabled={busy}
                onClick={() => setDsra({
                  ...dsra,
                  endOfSavings: defaultEndOfDebtServiceSavings(project?.cod ?? null, tenorTranches),
                  flags: { ...dsra.flags, locIsStandardEndofDebtserviceSavings: true },
                })}
              />
            </div>
          </div>
        ) : null}
      </FormPanel>

      {/* ─────────────────────────────────────────────────────────────── dialogs ── */}
      <ConfirmDialog
        open={dialog === "category" && toggleDialog !== null}
        title={toggleDialog?.title ?? ""} description={toggleDialog?.description ?? ""}
        confirmText={toggleDialog?.confirmText} cancelText={FIN_LABEL.cancel}
        onCancel={closeDialog}
        onConfirm={() => {
          const target = toggleTarget;
          closeDialog();
          if (target) void writes.run(categoryToggleJob(target, planCategoryToggle(target)));
        }}
      />
      <ConfirmDialog
        open={dialog === "trancheActivation" || dialog === "trancheDeletion"}
        title={trancheDialog.title} description={trancheDialog.description}
        confirmText={FIN_LABEL.confirm} cancelText={FIN_LABEL.cancel}
        destructive={dialog === "trancheDeletion"}
        onCancel={closeDialog}
        onConfirm={() => {
          const deletion = dialog === "trancheDeletion";
          const target = selectedTrancheInput;
          closeDialog();
          if (deletion) {
            setSelectedTrancheId(null);
            void writes.run(trancheDeleteJob(planTrancheDelete(target?.id ?? null, stepUpsQ.data, repaymentsQ.data)));
          } else {
            void writes.run(trancheToggleJob(planTrancheToggle(target)));
          }
        }}
      />
      <ConfirmDialog
        open={dialog === "dsra"} title={dsraDialog.title} description={dsraDialog.description}
        confirmText={FIN_LABEL.confirm} cancelText={FIN_LABEL.cancel}
        onCancel={closeDialog}
        onConfirm={() => {
          closeDialog();
          if (dsraInput) void writes.run(dsraToggleJob(dsraInput, planDsraToggle(dsraInput)));
        }}
      />
    </div>
  );
}

