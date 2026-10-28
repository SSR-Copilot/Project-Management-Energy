/**
 * Project Revenues Screen — layout and composition only (connected 20 Oct 2026, D33).
 *
 * Canvas screen: `Project Revenues Screen.pa.yaml` (PM app, solution 1.21.709)
 *
 * Structure, matching the canvas containers:
 *   heading         `lbl_…_GridContracts_CardHeader_LabelWithDescription_3` ("Revenue")
 *   page lock       `con_Milestones_Page_LockMessage_7` (shared with Finance: `pageLock`)
 *   tabs            `tab_ProjectRevenue_DisplayProjectBodyRightContent` — Disabled (still shown)
 *                   while the page is locked or Draft
 *   contracts       `btn_Revenue_AddContract` and the `gal_…_GridContracts_1` card gallery (D33 V6):
 *                   one card per contract — header (`Label - Description`, fold chevron), then,
 *                   unless folded, its own Edit / Delete bar (`pcf_ProjectRevenues_Content_ContractCommandBar_3`,
 *                   items `editRevenueContract` / `deleteRevenueContract`, acting on that card) and
 *                   the field tiles (`contractCardFields`).
 *   balancing       `btn_Revenue_AddBlancing_Price`, the Cluster-4 message, the empty-state info tag
 *                   and the `con_ProjectBalancing_Price_Grid` table with its row Edit / Delete bar.
 *   panels          `con_ProjectRevenues_RightPanel_NewEditContract_1` (contract) and `_2`
 *                   (balancing price), each with Save / Cancel.
 *   dialogs         delete contract, delete balancing price, confirm individual volumes,
 *                   hedged volume more than 100 %.
 *
 * Every branch is a call into `rules.ts`; every caption comes from it. The unsaved-data leave
 * guard is the shell's documented gap (D25/D26); this canvas screen has none of its own.
 */
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Button, Dropdown, Field, Input, MessageBar, MessageBarBody, Option, Spinner,
  Switch, Tab, TabList, Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow,
  Text, Tooltip, makeStyles, mergeClasses, tokens,
} from "@fluentui/react-components";
import {
  AddRegular, ArrowSyncRegular, DeleteRegular, EditRegular,
  InfoRegular, LockClosedRegular,
} from "@fluentui/react-icons";
import {
  Choices, type Command, CommandBar, ConfirmDialog, EmptyState, FormPanel, LoadingOverlay,
  DateField, FIELD_APPEARANCE, PanelButtons, WriteFeedback, testIdPart, useFieldControlClass, useFieldSkin,
  useStandardValueClass, type StandardProp,
  ExpandChevron,
} from "@/components";
import { useSession } from "@/app/SessionContext";
import { media, palette, space } from "@/theme/tokens";
import { dateOnly } from "@/data/odata";
import {
  PAGE_LOCK_TITLE, pageLock, REVENUE_TABS, DEFAULT_TAB, parseRevenueTab,
  REVENUE_FORM_LABEL, SCREEN_LABEL, DIALOG, MSG, REVENUE_SCREEN_TEXT, HEDGE_TYPE_LABEL,
  negativePriceState, hedgeTypeOptions, volumeRowLabel, resetOnHedgeTypeChange,
  validateHedgedVolume, firstPeriodStart, nextPeriodStart, showsShiftOfCod,
  balancingMonthOptions, balancingEndDate, balancingYearOptions, durationYearOptions,
  durationMonthOptions, germanFitTariff, tariffP90Text, showsP90Block, shownDescription,
  validateTariff, validateBiddingPrice, validateSiteQuality, validateCorrectionFactor,
  validateVolumeMwh, validateHedgedVolumePercent, validateInflationProfile,
  validateInflationStartYear, validateDescription, validateBalancingPrice, validateShiftOfCod,
  canSaveRevenueContract, needsIndividualVolumesConfirmation, isRevenuePageBlocked,
  contractCommandBar, balancingCommandBar, contractCardFields, contractCardTitle, toggleContractFold,
  unfoldContract, CONTRACT_CARD_CONTROL, type CardTone, balancingClusterReached, revenueLabelText,
  hedgeTypeFromValue, fmtCardDate, sortContracts, sortPeriods,
  deleteContractDescription, deleteBalancingDescription, contractPanelTitle, balancingPanelTitle,
  tariffPriceCaption, tariffPriceP90Caption, siteQualityCaption, correctionFactorCaption,
  biddingPriceCaption, balancingPriceCaption, inflationProfileFieldCaption, contractYearsOption,
  contractMonthsOption, balancingYearsOption, balancingMonthsOption, balancingDurationText,
  shiftOfCodCell, bareRegion, newContractForm, applyRevenueEngine, editContractForm, editField,
  withTerm, toggleCountryInflation, changeInflationStartYear, resyncNegativePrice,
  planSaveContract, planSaveBalancing, saveContractJob, deleteContractJob, saveBalancingJob,
  deleteBalancingJob, SPINNER,
  type RevenueTab, type HedgeType, type RevenueFormState, type StoredRevenueContract,
  type BalancingPeriod, type BalancingForm,
  revenuePanelStandard, touchField, editFieldIfValid, resetStartToCod, negativePriceDisplayMode,
  showsCountryInflationToggle, hedgePercentForCheck,
} from "./rules";
import {
  useRevenueProject, useItalyRegion, useRevenueAssumptions, useRevenueContracts,
  useBalancingPrices, useIndividualVolumes, useNegativePriceProduction, useRevenueSubaccount,
  useRevenueCurrency, useCountryInflationProfiles, useRevenueWrites,
  fetchOverlappingContracts, fetchIndividualVolumeIds,
} from "./hooks";

// Layout transcribed from `con_ProjectRevenues_DisplayProjectBodyRightContent` and its children
// (UI layout pass, 20 Oct 2026). Sizes are canvas points x 1.333: `gblAppSizes.Font` Small 10 =
// 13.33 px, Medium 11 = 14.67 px, Large 12 = 16 px. The shell's content area scrolls, so the page
// grows with its content and never clips itself to the viewport.
const useStyles = makeStyles({
  // The right content: white, vertical, gap 3, PaddingTop 15 / Left 15 / Right 20.
  page: {
    display: "flex", flexDirection: "column", gap: "3px", minWidth: 0, flex: "1 0 auto",
    paddingTop: "15px", paddingLeft: "15px", paddingRight: "20px", paddingBottom: "15px",
    backgroundColor: palette.white, boxSizing: "border-box",
  },
  // `lbl_…_CardHeader_LabelWithDescription_3`: Large (12 pt) Semibold, PaddingTop 10. PO screenshot
  // (20 Oct 2026): the title sits ~35 px in from the content edge (page 15 + 20).
  heading: { fontSize: "16px", lineHeight: "22px", fontWeight: 600, paddingLeft: "20px", paddingTop: "10px" },
  // `con_Milestones_Page_LockMessage_7`: Fill RGBA(89, 89, 89, 1), horizontal, gap 10, PaddingLeft 20,
  // items centred; white 20 px lock icon and white text in `con_Milestones_pagelock_section_7` (padding 8).
  lock: {
    display: "flex", gap: "10px", alignItems: "center", paddingLeft: "20px",
    backgroundColor: "rgb(89, 89, 89)", color: "#ffffff",
  },
  lockLines: { display: "flex", flexDirection: "column", paddingTop: "8px", paddingBottom: "8px", paddingLeft: "8px", paddingRight: "8px" },
  lockText: { color: "#ffffff" },
  // `tab_ProjectRevenue_DisplayProjectBodyRightContent`: 60 high, `Parent.Width/2` wide.
  tabs: {
    display: "flex", alignItems: "center", height: "60px", width: "50%", minWidth: "fit-content", paddingLeft: "5px",
    // `BasePaletteColor: themePrimary` — the selected tab's underline (and hover bar) in the VSB blue.
    "& .fui-Tab[aria-selected='true']::after": { backgroundColor: palette.themePrimary },
    "& .fui-Tab[aria-selected='true'] .fui-Tab__content": { fontWeight: 600 },
  },
  // `con_…_Grid` (horizontal, wrapping) / `con_…_Grid_1` (vertical): PaddingLeft 15, PaddingTop 5.
  contractsGrid: { display: "flex", flexWrap: "wrap", alignContent: "flex-start", paddingLeft: "15px", paddingTop: "5px", minWidth: 0 },
  balancingGrid: { display: "flex", flexDirection: "column", gap: "20px", paddingLeft: "15px", paddingTop: "5px", minWidth: 0 },
  // `LayoutGap: If('Cluster State'.Order >= 4, 20, 25)`.
  balancingGridLocked: { gap: "25px" },
  // `btn_Revenue_AddContract` (140 wide) / `btn_Revenue_AddBlancing_Price` (190 wide): Transparent,
  // themePrimary text and a solid themePrimary outline — 1 px, radius 2, as the PO's live-canvas
  // screenshot shows (the 1.21.709 YAML says `BorderThickness: =2`).
  addButton: {
    color: palette.themePrimary, borderRadius: "2px",
    borderTopWidth: "1px", borderRightWidth: "1px", borderBottomWidth: "1px", borderLeftWidth: "1px",
    borderTopStyle: "solid", borderRightStyle: "solid", borderBottomStyle: "solid", borderLeftStyle: "solid",
    borderTopColor: palette.themePrimary, borderRightColor: palette.themePrimary,
    borderBottomColor: palette.themePrimary, borderLeftColor: palette.themePrimary,
    "& .fui-Button__icon": { color: palette.themePrimary },
    ":disabled": {
      color: tokens.colorNeutralForegroundDisabled,
      borderTopColor: tokens.colorNeutralStrokeDisabled, borderRightColor: tokens.colorNeutralStrokeDisabled,
      borderBottomColor: tokens.colorNeutralStrokeDisabled, borderLeftColor: tokens.colorNeutralStrokeDisabled,
      "& .fui-Button__icon": { color: tokens.colorNeutralForegroundDisabled },
    },
  },
  addContract: { width: "140px" },
  addBalancing: { width: "190px", alignSelf: "flex-start" },
  // `con_ProjectBalancing_Price_Grid`: 1100 wide, scrolls horizontally.
  gridWrap: { overflowX: "auto", minWidth: 0 },
  // Header row 30 high, Size 10 in RGBA(89,89,89,1); rows 45 high (`TemplateSize`), Size 11 in
  // RGBA(44,44,44,1), divided by a RGBA(231,231,231,1) line.
  table: {
    width: "1100px", tableLayout: "fixed",
    "& th": { height: "30px", fontSize: "13.33px", color: "rgb(89, 89, 89)", fontWeight: 400 },
    "& td": { height: "45px", fontSize: "14.67px", color: "rgb(44, 44, 44)" },
    "& tbody tr": { borderBottomColor: "rgb(231, 231, 231)" },
  },
  // Header `FillPortions` 1.5 / 1 / 0.7 / 1 / 0.7 / 1 / 0.4 (of 6.3).
  colName: { width: "23.8%" },
  colWide: { width: "15.9%" },
  colDate: { width: "11.1%" },
  colActions: { width: "6.3%", minWidth: "80px" },
  // The card gallery (`gal_…_GridContracts_1`, TemplatePadding 0): full width below the add button.
  gallery: { display: "flex", flexDirection: "column", width: "100%", minWidth: 0 },
  // `con_…_GridContracts_Card_1`: white, PaddingLeft 20, `Parent.Width - 10` wide.
  card: { backgroundColor: palette.white, paddingLeft: "20px", marginRight: "10px", minWidth: 0 },
  // `con_…_GridContracts_CardHeader_1`: 50 high, Fill #fdffff, a 1 px themePrimary bottom line
  // (`shp_…_CardHeader_BottomLine_1`, `gblAppColors.Icon.HoverColor`).
  // PO screenshot (20 Oct 2026): a thin DARK rule under the header (the 1.21.709 YAML colours
  // `shp_…_CardHeader_BottomLine_1` with `gblAppColors.Icon.HoverColor`, the theme blue).
  cardHeader: {
    display: "flex", alignItems: "center", height: "50px", backgroundColor: "#fdffff",
    borderBottom: "1px solid rgb(50, 49, 48)",
  },
  // `lbl_…_CardHeader_LabelWithDescription_1`: Semibold.
  cardTitle: { fontSize: "16px", fontWeight: 600, flexGrow: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  // `ico_…_CardHeader_Up_1/_2`: 45 x 30, themePrimary, at the far right of the header.
  chevron: { width: "45px", minWidth: "45px", height: "30px", color: palette.themePrimary },
  // `con_…_CardBody_Fields_Main_6`: vertical, PaddingTop 10; the command bar is 40 high.
  cardBody: { display: "flex", flexDirection: "column", paddingTop: "6px", paddingBottom: "18px" },
  // The card's own Edit · Delete row: themePrimary text AND icons, no box (PO screenshot).
  cardBar: {
    "& .fui-Button:not(:disabled)": { color: palette.themePrimary },
    // The Edit icon starts on the field grid's left edge (under "Currency"), as on the live
    // screen (PO, 21 Oct 2026): the shared `CommandBar` has no inset, so no padding here.
  },
  // `con_…_CardBody_Fields_6`: four tiles a row (`(Parent.Width-60)/4`), spanning the card, with even
  // gutters (PO screenshot ~22 px); two columns on a tablet, one on a phone.
  cardFields: {
    display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", columnGap: "22px", rowGap: "14px",
    paddingTop: "10px",
    [media.belowMd]: { gridTemplateColumns: "repeat(2, minmax(0, 1fr))" },
    [media.belowSm]: { gridTemplateColumns: "minmax(0, 1fr)" },
  },
  // A tile: the caption (Regular, ~16 px) over the value box.
  cardField: { display: "flex", flexDirection: "column", gap: "6px", minWidth: 0 },
  cardCaption: {
    fontSize: "16px", lineHeight: "22px", fontWeight: 400,
    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
  },
  cardValues: { display: "flex", gap: "12px", minWidth: 0 },
  // A View-mode `TextInput`: the filled grey modern box, ~40 high, value left-aligned.
  cardValue: {
    flexGrow: 1, flexBasis: 0, minWidth: 0, height: "40px", boxSizing: "border-box",
    borderTopWidth: 0, borderRightWidth: 0, borderBottomWidth: 0, borderLeftWidth: 0, borderRadius: "4px",
    backgroundColor: tokens.colorNeutralBackground3, paddingLeft: "12px", paddingRight: "12px",
    fontSize: "14px", textAlign: "left", color: tokens.colorNeutralForeground1, fontFamily: "inherit",
    outlineStyle: "none",
  },
  // `con_ProjectRevenue_Balancing_Price_VisibilityMessage`: Fill RGBA(0,0,0,0.75), 50 high, the white
  // 20 px lock at X 20 and white text 10 px after it.
  info: {
    display: "flex", alignItems: "center", gap: "10px", height: "50px", paddingLeft: "20px",
    backgroundColor: "rgba(0, 0, 0, 0.75)", color: "#ffffff", "& span": { color: "#ffffff" },
  },
  // `con_…_Apply_History_Tag_2`: Fill RGBA(204,226,241,0.5), 40 high, `Parent.Width - 40` wide; an
  // 18 px Grayscale10 info icon and a Small (10 pt) label in RGBA(50,49,48,1).
  infoTag: {
    width: "calc(100% - 40px)", minHeight: "40px", backgroundColor: "rgba(204, 226, 241, 0.5)",
    borderTopWidth: 0, borderRightWidth: 0, borderBottomWidth: 0, borderLeftWidth: 0,
    fontSize: "13.33px", color: "rgb(50, 49, 48)", "& .fui-MessageBar__icon": { color: palette.Grayscale10 },
  },
  // `con_ProjectRevenues_RightPanel_NewEditCost_BodyContent_1`: a 300-wide left section and a right
  // section that takes the rest; labels are Medium (11 pt) Lighter.
  // The contract panel body: the Fabric notice, then the two sections side by side, each scrolling on
  // its own (`con_…_LeftSection_…`: `LayoutOverflowY: Scroll`; the right section's hedge body too) —
  // PO screenshot, 20 Oct 2026. On a narrow screen the sections stack and the body scrolls.
  panelBody: {
    display: "flex", flexDirection: "column", gap: space.m, height: "100%", minHeight: 0, boxSizing: "border-box",
    [media.belowMd]: { height: "auto" },
  },
  panel: {
    display: "grid", columnGap: "32px", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
    flexGrow: 1, minHeight: 0,
    "& .fui-Field__label": { fontWeight: 300, fontSize: "14.67px" },
    [media.belowMd]: { gridTemplateColumns: "1fr", rowGap: space.m },
  },
  panelColumn: {
    display: "flex", flexDirection: "column", gap: space.m, minWidth: 0, minHeight: 0,
    overflowY: "auto", overflowX: "hidden", paddingRight: "8px", paddingBottom: "8px",
    [media.belowMd]: { overflowY: "visible" },
  },
  column: { display: "flex", flexDirection: "column", gap: space.m, minWidth: 0 },
  notice: { flexShrink: 0 },
  // A toggle caption with the red `*` before it (`lbl_…_InflationProfileToggleAsterisk_1`).
  req: { color: "#d20532", marginRight: "4px" },
  // One Individual Volume row: the period box (`txt_…_IndividualVolume_Year`, 180 wide) beside the
  // `* Individual Volume [MWh]` caption and input of the same gallery template.
  volumeRow: { display: "grid", gridTemplateColumns: "180px minmax(0, 1fr)", columnGap: "16px", alignItems: "start" },
  // The period box sits level with the value input under its caption.
  volumePeriod: { paddingTop: "24px" },
  pair: {
    display: "grid", gap: space.m, gridTemplateColumns: "1fr 1fr",
    [media.belowSm]: { gridTemplateColumns: "1fr" },
  },
  dateRow: { display: "flex", alignItems: "flex-end", gap: space.s },
  grow: { flexGrow: 1, minWidth: 0 },
  dropdown: { minWidth: "0px", width: "100%" },
  hint: { color: tokens.colorNeutralForeground3, fontSize: "12px" },
  error: { color: palette.Error, fontSize: "12px" },
});

/* ─────────────────────────────────────────────────────── field primitives ── */

/**
 * A labelled text input; `name` is the canvas control name. It is both the `data-testid` and —
 * as every `txt_` / `dte_` control on this screen sets `AccessibleLabel` to its own name — the
 * `aria-label` (rule 16, corrected D33; it carried the caption before).
 */
function TextInputField({
  label, name, value, onChange, required, disabled, error, placeholder, type = "text", standard, labelTestId,
}: {
  label: string; name: string; value: string; onChange?: (v: string) => void;
  /** The caption's own canvas control name, when it is a separate `lbl_` control to keep. */
  labelTestId?: string;
  required?: boolean; disabled?: boolean; error?: string; placeholder?: string; type?: "text" | "date";
  /** The canvas standard-assumption pair on the value (rule 20, the shared `useStandardValueClass`). */
  standard?: StandardProp;
}) {
  const standardClass = useStandardValueClass();
  const skin = useFieldSkin();
  const controlClass = useFieldControlClass();
  // `DisplayMode.Disabled` stays greyed; a field without an `onChange` is read-only (View).
  const mode = disabled ? "disabled" : onChange ? "edit" : "view";
  return (
    <Field
      className={skin.field}
      label={labelTestId ? { children: <span data-testid={labelTestId}>{label}</span> } : label}
      required={required}
      validationState={error ? "error" : "none"}
      validationMessage={error || undefined}
    >
      <Input
        appearance={FIELD_APPEARANCE}
        className={controlClass(mode, standardClass(standard))}
        type={type}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        readOnly={!onChange}
        onChange={(_, d) => onChange?.(d.value)}
        aria-label={name}
        data-testid={name}
      />
    </Field>
  );
}

/** A labelled Fluent `Dropdown` over `{ value, text }` options; `name` as `TextInputField`. */
function SelectField({
  label, name, value, options, onChange, required, disabled,
}: {
  label: string; name: string; value: string; options: readonly { value: string; text: string }[];
  onChange: (v: string) => void; required?: boolean; disabled?: boolean;
}) {
  const s = useStyles();
  const skin = useFieldSkin();
  const controlClass = useFieldControlClass();
  const text = options.find((o) => o.value === value)?.text ?? "";
  return (
    <Field className={skin.field} label={label} required={required}>
      <Dropdown
        appearance={FIELD_APPEARANCE}
        className={mergeClasses(s.dropdown, controlClass(disabled ? "disabled" : "edit"))}
        value={text}
        selectedOptions={value ? [value] : []}
        disabled={disabled}
        onOptionSelect={(_, d) => { if (d.optionValue !== undefined) onChange(d.optionValue); }}
        aria-label={name}
        data-testid={name}
      >
        {options.map((o) => <Option key={o.value} value={o.value}>{o.text}</Option>)}
      </Dropdown>
    </Field>
  );
}

/**
 * One of the two Contract Duration pickers under their shared caption (`lbl_…_ContractDuration_1`):
 * a bare Fluent `Dropdown` with the canvas name as `aria-label` / `data-testid` (rule 16).
 */
function DurationPicker({ name, value, options, onChange }: {
  name: string; value: string; options: readonly { value: string; text: string }[]; onChange: (v: string) => void;
}) {
  const s = useStyles();
  const controlClass = useFieldControlClass();
  const text = options.find((o) => o.value === value)?.text ?? "";
  return (
    <Dropdown
      appearance={FIELD_APPEARANCE}
      className={mergeClasses(s.dropdown, controlClass("edit"))}
      value={text}
      selectedOptions={value ? [value] : []}
      onOptionSelect={(_, d) => { if (d.optionValue !== undefined) onChange(d.optionValue); }}
      aria-label={name}
      data-testid={name}
    >
      {options.map((o) => <Option key={o.value} value={o.value}>{o.text}</Option>)}
    </Dropdown>
  );
}

/** The balancing grid's column classes, in header order (`FillPortions`). */
const BALANCING_COL = ["colName", "colWide", "colDate", "colWide", "colDate", "colWide", "colActions"] as const;

/** Local calendar day, never `toISOString()` (that stores the previous day east of UTC). */
const toIso = (d: Date | null): string => (d ? dateOnly(d) : "");
const fromIso = (v: string): Date | null => (v ? new Date(`${v}T00:00:00`) : null);

/** `Choices('Revenue Labels')` — the option-set labels, as `revenueLabelText` spells them. */
const REVENUE_LABELS = ["FiT", "PPA"] as const;

/** The canvas names of the five lock bullets (`lbl_…_Balancing_Price_VisibilityMessage_34`…`_38`). */
const LOCK_LINE_ID = [
  "lbl_ProjectRevenues_DisplayProjectBodyRightContent_Balancing_Price_VisibilityMessage_34",
  "lbl_ProjectRevenues_DisplayProjectBodyRightContent_Balancing_Price_VisibilityMessage_35",
  "lbl_ProjectRevenues_DisplayProjectBodyRightContent_Balancing_Price_VisibilityMessage_36",
  "lbl_ProjectRevenues_DisplayProjectBodyRightContent_Balancing_Price_VisibilityMessage_37",
  "lbl_ProjectRevenues_DisplayProjectBodyRightContent_Balancing_Price_VisibilityMessage_38",
] as const;
const LOCK_BULLETS = ["• General", "• Milestones", "• Generator", "• Production", "• Change the project status from Draft"];

/* ═══════════════════════════════════════════════════════════════════ screen ══ */

export default function ProjectRevenuesScreen() {
  const s = useStyles();
  const { projectId, locale: lang } = useSession();

  const projectQ = useRevenueProject(projectId);
  const project = projectQ.data;
  const region = useItalyRegion(project);
  const assumptions = useRevenueAssumptions();
  const contractsQ = useRevenueContracts(projectId);
  const periodsQ = useBalancingPrices(projectId);
  const productionQ = useNegativePriceProduction(projectId);
  const subaccountQ = useRevenueSubaccount();
  const currencyQ = useRevenueCurrency(project?.countryName ?? null);
  const inflationQ = useCountryInflationProfiles(project?.countryCode ?? null);
  const writes = useRevenueWrites(projectId);

  const contracts = useMemo(() => sortContracts(contractsQ.data), [contractsQ.data]);
  const periods = useMemo(() => sortPeriods(periodsQ.data), [periodsQ.data]);
  const country = project?.countryName ?? null;
  const technology = project?.technology ?? "Other";
  const loading = projectQ.isLoading || contractsQ.isLoading || periodsQ.isLoading;
  const loadError = projectQ.error ?? contractsQ.error ?? periodsQ.error;

  // The page gate: the lock banner, or a blank / Draft cluster state (`isPageLocked` has both).
  const blocked = !loading && isRevenuePageBlocked(project);
  const lockBullets = project ? pageLock(project) : LOCK_BULLETS;

  // DIVERGENCE (B1, as D31/D32): the tab survives a reload as `?tab=`; the canvas resets it to
  // "Contracted Revenue" on every visit. While the tabs are Disabled the default tab shows.
  const [params, setParams] = useSearchParams();
  const tab: RevenueTab = blocked ? DEFAULT_TAB : parseRevenueTab(params.get("tab"));
  const goToTab = (next: RevenueTab) => {
    const p = new URLSearchParams(params);
    p.set("tab", next);
    setParams(p, { replace: true });
  };

  const [selectedContractId, setSelectedContractId] = useState<string | null>(null);
  // `IsFolded` per card; every card starts unfolded (`OnVisible`).
  const [folded, setFolded] = useState<ReadonlySet<string>>(() => new Set());
  const [panel, setPanel] = useState<"none" | "contract" | "balancing">("none");
  const [confirm, setConfirm] = useState<"none" | "deleteContract" | "deletePeriod" | "volumes">("none");
  const [form, setForm] = useState<RevenueFormState | null>(null);
  const [hedgeError, setHedgeError] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const [balancing, setBalancing] = useState<BalancingForm | null>(null);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null);
  const [editingVolumesFor, setEditingVolumesFor] = useState<string | null>(null);

  const volumesQ = useIndividualVolumes(projectId, editingVolumesFor);
  const selectedContract = contracts.find((c) => c.id === selectedContractId) ?? null;
  const selectedPeriod = periods.find((p) => p.id === selectedPeriodId) ?? null;
  const busy = writes.progress !== null || validating;

  /* ─────────────────────────────────────────────────── contract panel ─────── */

  const openNewContract = () => {
    if (!project) return;
    writes.clear();
    setHedgeError(null);
    setEditingVolumesFor(null);
    setForm(newContractForm(project, subaccountQ.data?.id ?? null));
    setPanel("contract");
  };

  const openEditContract = (c: StoredRevenueContract) => {
    if (!project) return;
    writes.clear();
    setHedgeError(null);
    setEditingVolumesFor(hedgeTypeFromValue(c.hedgeType) === "individual" ? c.id : null);
    setForm(editContractForm({ contract: c, project, volumes: [] }));
    setPanel("contract");
  };

  // The edited contract's stored volumes arrive after the panel opens; fill them in once.
  const volumesFor = editingVolumesFor;
  const storedVolumes = volumesQ.data;
  if (form && form.mode === "Edit" && form.contractId === volumesFor && form.hedge.type === "individual"
    && form.hedge.individual.length === 0 && storedVolumes.length > 0 && !form.formDirty) {
    setForm({ ...form, hedge: { ...form.hedge, individual: storedVolumes.map((v) => ({ ...v })) } });
  }

  const onType = (label: string) => {
    if (!project || !form) return;
    setForm({
      ...applyRevenueEngine({
        project, rows: assumptions.data, region, label, productionExists: productionQ.data,
        subaccountId: form.subaccountId, profiles: inflationQ.data, language: lang,
      }),
      ...(form.mode === "Edit" ? { mode: "Edit" as const, contractId: form.contractId } : {}),
    });
  };

  const change = (next: RevenueFormState) => setForm(next);
  const closeContract = () => { setPanel("none"); setForm(null); setHedgeError(null); setEditingVolumesFor(null); };

  const runContractSave = async (f: RevenueFormState) => {
    if (!project) return;
    closeContract();
    const ids = await writes.run(saveContractJob(async () => planSaveContract({
      form: f, project, currencyId: currencyQ.data?.id ?? null,
      storedVolumeIds: f.mode === "Edit" && f.contractId ? await fetchIndividualVolumeIds(f.contractId) : [],
      language: lang,
    })));
    if (ids !== null) {
      const savedId = f.mode === "Edit" ? f.contractId : ids[0] ?? null;
      setSelectedContractId(savedId);
      setFolded((cur) => unfoldContract(cur, savedId));
    }
  };

  /** `btn_ProjectRevenue_AddEdit_SaveFunctionality` — the hedge 100 % check, then the save. */
  const saveContract = async (f: RevenueFormState) => {
    if (!projectId) return;
    if (f.hedge.type === "percentage" && f.startDate && f.endDate) {
      setValidating(true);
      try {
        const overlap = await fetchOverlappingContracts(projectId, f.startDate, f.endDate, f.mode === "Edit" ? f.contractId : null);
        const result = validateHedgedVolume(
          { startDate: f.startDate, endDate: f.endDate, hedgedVolume: hedgePercentForCheck(f.hedge.percentage.value, lang) },
          overlap,
        );
        if (!result.ok) { setHedgeError(result.message); return; }
      } catch {
        // A failed check read is reported by the save itself; the canvas `Filter` has no IfError.
      } finally {
        setValidating(false);
      }
    }
    await runContractSave(f);
  };

  /** `pcf_…_Save_1.OnChange`: Individual Volumes ask first, every other type saves. */
  const onSaveContract = () => {
    if (!form) return;
    if (needsIndividualVolumesConfirmation(form.hedge.type)) setConfirm("volumes");
    else void saveContract(form);
  };

  /* ─────────────────────────────────────────────────── balancing periods ──── */

  const openNewPeriod = () => {
    writes.clear();
    setBalancing({ id: null, price: "", years: 0, months: 1, shift: "" });
    setPanel("balancing");
  };

  const openEditPeriod = (p: BalancingPeriod) => {
    writes.clear();
    setSelectedPeriodId(p.id);
    setBalancing({
      id: p.id, price: p.price === null ? "" : String(p.price),
      years: p.durationYears ?? 0, months: p.durationMonths ?? 1,
      shift: p.shiftOfCodMonths === null ? "" : String(p.shiftOfCodMonths),
    });
    setPanel("balancing");
  };

  const editingPeriod = balancing?.id ? periods.find((p) => p.id === balancing.id) ?? null : null;
  const shiftVisible = showsShiftOfCod(periods.length, editingPeriod !== null);

  // Rule 28 — the shown start date: the stored one on edit (the plugin computes it), COD + shift
  // for a new first period, the day after the previous period's end otherwise.
  const balancingStart = useMemo(() => {
    if (!balancing) return null;
    if (editingPeriod) return editingPeriod.startDate;
    return periods.length === 0
      ? firstPeriodStart(project?.cod ?? null, Number(balancing.shift) || 0)
      : nextPeriodStart(periods);
  }, [balancing, editingPeriod, periods, project?.cod]);

  const closeBalancing = () => { setPanel("none"); setBalancing(null); setSelectedPeriodId(null); };

  const onSaveBalancing = async () => {
    if (!balancing) return;
    const plan = planSaveBalancing({ form: balancing, periods, project, language: lang });
    closeBalancing();
    await writes.run(saveBalancingJob(plan));
  };

  /* ─────────────────────────────────────────────────────────── commands ──── */

  const bar = contractCommandBar(selectedContract, blocked);
  const cardCtx = { country, technology, currencyName: currencyQ.data?.name ?? null, region };
  const balancingBar = balancingCommandBar(periods, null, project?.clusterStateOrder ?? null);
  const clusterReached = balancingClusterReached(project?.clusterStateOrder);

  /** A card's own bar: `ItemEnabled` asks about THAT card (D33 defect 3), `DisplayMode` the page gate. */
  const cardCommands = (c: StoredRevenueContract): Command[] => {
    const own = contractCommandBar(c, blocked);
    return [
      { key: "editRevenueContract", label: SCREEN_LABEL.edit, icon: "Edit", enabled: !busy && own.edit.enabled },
      { key: "deleteRevenueContract", label: SCREEN_LABEL.delete, icon: "Delete", enabled: !busy && own.delete.enabled },
    ];
  };

  /** `pcf_…_ContractCommandBar_3.OnSelect`: select the card's contract, then edit or ask to delete. */
  const onCardCommand = (c: StoredRevenueContract, key: string) => {
    setSelectedContractId(c.id);
    if (key === "editRevenueContract") openEditContract(c);
    if (key === "deleteRevenueContract") setConfirm("deleteContract");
  };

  /** The fold chevrons: flip `IsFolded` and select the card. */
  const onFold = (id: string) => {
    setFolded((cur) => toggleContractFold(cur, id));
    setSelectedContractId(id);
  };

  /* ─────────────────────────────────────────────────────────── rendering ──── */

  /*
   * Rule 20, shared style. `"blue"` (FontColor without FontItalic) is kept for any card value the
   * canvas colours without italics (`cardTone` in rules.ts); since D35 no live card value does.
   */
  const standardClass = useStandardValueClass();
  /* Rule 20 — the panel fields that carry the canvas standard-assumption pair. */
  const panelStd = form ? revenuePanelStandard(form) : null;
  const toneClass = (t: CardTone): string | undefined =>
    standardClass(t === "standard" ? true : t === "blue" ? "blue" : false);

  const balancingHeaders: string[] = [
    SCREEN_LABEL.name,
    SCREEN_LABEL.shiftFromCod,
    SCREEN_LABEL.startDate,
    REVENUE_FORM_LABEL.contractDuration,
    SCREEN_LABEL.endDate,
    balancingPriceCaption(country),
    SCREEN_LABEL.actions,
  ];

  const formNeg = form
    ? negativePriceState(assumptions.data, form.technology, form.revenueTypeLabel, productionQ.data)
    : null;
  const negMode = form && formNeg ? negativePriceDisplayMode(form, formNeg) : "disabled";
  const skinField = useFieldSkin().field;
  const tariffP90For = (f: RevenueFormState, patch: Partial<RevenueFormState>): string => {
    const n = { ...f, ...patch };
    return tariffP90Text(n.country, n.revenueTypeLabel, n.biddingPrice, n.correctionFactorP90, n.tariff, lang);
  };

  if (loadError) {
    return (
      <div className={s.page}>
        <EmptyState title={REVENUE_SCREEN_TEXT.loadFailedTitle} description={REVENUE_SCREEN_TEXT.loadFailedDescription} />
      </div>
    );
  }

  return (
    <div className={s.page}>
      {loading ? <LoadingOverlay mode="inline" /> : null}
      {validating ? <LoadingOverlay label={SPINNER.validatingHedge} /> : null}
      <WriteFeedback progress={writes.progress} error={writes.error} success={writes.success} testIdPrefix="revenues" />

      {!loading && lockBullets.length > 0 && blocked ? (
        <div className={s.lock} data-testid="con_Milestones_Page_LockMessage_7" role="status">
          <span data-testid="icon_milestones_lock_7"><LockClosedRegular aria-hidden fontSize={20} /></span>
          <div className={s.lockLines}>
            <Text className={s.lockText} data-testid="lbl_ProjectRevenues_DisplayProjectBodyRightContent_Balancing_Price_VisibilityMessage_33">
              {PAGE_LOCK_TITLE}
            </Text>
            {lockBullets.map((b) => (
              <Text key={b} className={s.lockText}
                data-testid={`${LOCK_LINE_ID[Math.max(0, LOCK_BULLETS.indexOf(b))]}`}>{b}</Text>
            ))}
          </div>
        </div>
      ) : null}

      <Text as="h1" className={s.heading} data-testid="lbl_ProjectRevenues_DisplayProjectBodyRightContent_GridContracts_CardHeader_LabelWithDescription_3">
        {SCREEN_LABEL.heading}
      </Text>

      <div className={s.tabs}>
        <TabList
          selectedValue={tab}
          disabled={blocked}
          onTabSelect={(_, d) => goToTab(d.value as RevenueTab)}
          aria-label="tab_ProjectRevenue_DisplayProjectBodyRightContent"
          data-testid="tab_ProjectRevenue_DisplayProjectBodyRightContent"
        >
          {REVENUE_TABS.map((t) => <Tab key={t} value={t} aria-label={t}
            data-testid={`tab_ProjectRevenue_DisplayProjectBodyRightContent-${testIdPart(t)}`}>{t}</Tab>)}
        </TabList>
      </div>

      {tab === "Contracted Revenue" ? (
        <div className={s.contractsGrid} data-testid="con_ProjectRevenues_DisplayProjectBodyRightContent_Grid">
          <div>
            <Button
              className={mergeClasses(s.addButton, s.addContract)}
              appearance="transparent"
              icon={<AddRegular />}
              disabled={busy || !project || !bar.add.enabled}
              onClick={openNewContract}
              aria-label="btn_Revenue_AddContract"
              data-testid="btn_Revenue_AddContract"
            >{SCREEN_LABEL.addContract}</Button>
          </div>
          <div className={s.gallery} role="list" aria-label={REVENUE_TABS[0]} data-testid={CONTRACT_CARD_CONTROL.gallery}>
            {contracts.map((c) => {
              const isFolded = folded.has(c.id);
              return (
                <div key={c.id} className={s.card} role="listitem" data-selected={c.id === selectedContractId ? true : undefined}
                  data-testid={`${CONTRACT_CARD_CONTROL.card}-${c.id}`}>
                  <div className={s.cardHeader} data-testid={`${CONTRACT_CARD_CONTROL.header}-${c.id}`}>
                    <Text className={s.cardTitle} title={contractCardTitle(c)}
                      data-testid={`${CONTRACT_CARD_CONTROL.headerLabel}-${c.id}`}>{contractCardTitle(c)}</Text>
                    {isFolded ? (
                      <Button
                        className={s.chevron}
                        appearance="transparent"
                        icon={<ExpandChevron open={false} />}
                        disabled={blocked}
                        aria-label="ico_ProjectRevenues_DisplayProjectBodyRightContent_GridContracts_CardHeader_Up_2"
                        aria-expanded={false}
                        data-testid={`${CONTRACT_CARD_CONTROL.foldDown}-${c.id}`}
                        onClick={() => onFold(c.id)}
                      />
                    ) : (
                      <Button
                        className={s.chevron}
                        appearance="transparent"
                        icon={<ExpandChevron open />}
                        disabled={blocked}
                        aria-label="ico_ProjectRevenues_DisplayProjectBodyRightContent_GridContracts_CardHeader_Up_1"
                        aria-expanded
                        data-testid={`${CONTRACT_CARD_CONTROL.foldUp}-${c.id}`}
                        onClick={() => onFold(c.id)}
                      />
                    )}
                  </div>
                  {isFolded ? null : (
                    <div className={s.cardBody}>
                      <div className={s.cardBar}>
                        <CommandBar commands={cardCommands(c)} onCommand={(key) => onCardCommand(c, key)}
                          ariaLabel={CONTRACT_CARD_CONTROL.commandBar}
                          testIdPrefix={`${CONTRACT_CARD_CONTROL.commandBar}-${c.id}`} />
                      </div>
                      <div className={s.cardFields} data-testid={`${CONTRACT_CARD_CONTROL.body}-${c.id}`}>
                        {contractCardFields(c, cardCtx).map((f) => (
                          <div key={f.key} className={s.cardField} data-testid={`${f.container}-${c.id}`}>
                            <Text className={s.cardCaption} title={f.caption}
                              data-testid={`${f.labelControl}-${c.id}`}>{f.caption}</Text>
                            <div className={s.cardValues}>
                              {f.values.map((v) => (
                                <input
                                  key={v.control}
                                  readOnly
                                  tabIndex={-1}
                                  className={mergeClasses(s.cardValue, toneClass(v.tone))}
                                  value={v.text}
                                  aria-label={v.accessibleLabel}
                                  data-testid={`${v.control}-${c.id}`}
                                />
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {contractsQ.isLoading ? <Spinner size="small" /> : null}
          </div>
        </div>
      ) : (
        <div className={mergeClasses(s.balancingGrid, !clusterReached && s.balancingGridLocked)}
          data-testid="con_ProjectRevenues_DisplayProjectBodyRightContent_Grid_1">
          <div>
            <Button
              className={mergeClasses(s.addButton, s.addBalancing)}
              appearance="transparent"
              icon={<AddRegular />}
              disabled={busy || !balancingBar.add.enabled}
              onClick={openNewPeriod}
              aria-label="btn_Revenue_AddBlancing_Price"
              data-testid="btn_Revenue_AddBlancing_Price"
            >{SCREEN_LABEL.addBalancingPrice}</Button>
          </div>
          {!clusterReached ? (
            <div className={s.info} data-testid="con_ProjectRevenue_Balancing_Price_VisibilityMessage">
              <LockClosedRegular aria-hidden fontSize={20} />
              <Text data-testid="lbl_ProjectRevenues_DisplayProjectBodyRightContent_Balancing_Price_VisibilityMessage">
                {SCREEN_LABEL.balancingClusterGate}
              </Text>
            </div>
          ) : null}
          {clusterReached && periods.length === 0 && !periodsQ.isLoading ? (
            <MessageBar intent="info" icon={<InfoRegular />} className={s.infoTag}
              data-testid="con_Admin_Cost_LandLease_AddStandardContractType_CommandBar_Apply_History_Tag_2">
              <MessageBarBody>{SCREEN_LABEL.balancingEmptyInfo}</MessageBarBody>
            </MessageBar>
          ) : null}
          {clusterReached && periods.length > 0 ? (
            <div className={s.gridWrap} data-testid="con_ProjectBalancing_Price_Grid">
              <Table className={s.table} aria-label={REVENUE_TABS[1]} size="small">
                <TableHeader>
                  <TableRow>
                    {balancingHeaders.map((h, i) => <TableHeaderCell key={h} className={s[BALANCING_COL[i] ?? "colWide"]}>{h}</TableHeaderCell>)}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {periods.map((p) => {
                    const rowBar = balancingCommandBar(periods, p.id, project?.clusterStateOrder ?? null);
                    return (
                      <TableRow key={p.id} data-testid={`con_ProjectBalancing_Price_Grid-${p.id}`}>
                        <TableCell>{p.name}</TableCell>
                        <TableCell>{shiftOfCodCell(p.shiftOfCodMonths)}</TableCell>
                        <TableCell>{fmtCardDate(p.startDate)}</TableCell>
                        <TableCell>{balancingDurationText(p.durationYears, p.durationMonths)}</TableCell>
                        <TableCell>{fmtCardDate(p.endDate)}</TableCell>
                        <TableCell>{p.price === null ? "" : String(p.price)}</TableCell>
                        <TableCell>
                          <Tooltip content={SCREEN_LABEL.balancingRowTooltip} relationship="description">
                            <Button
                              appearance="transparent" size="small" icon={<EditRegular />}
                              aria-label={SCREEN_LABEL.edit}
                              data-testid={`con_Main_Project_Overview_Header_SuitBar_CommandBar_1-${p.id}-editProject`}
                              disabled={busy || !rowBar.edit.enabled}
                              onClick={() => openEditPeriod(p)}
                            />
                          </Tooltip>
                          <Button
                            appearance="transparent" size="small" icon={<DeleteRegular />}
                            aria-label={SCREEN_LABEL.delete}
                            data-testid={`con_Main_Project_Overview_Header_SuitBar_CommandBar_1-${p.id}-deleteProject`}
                            disabled={busy || !rowBar.delete.enabled}
                            onClick={() => { setSelectedPeriodId(p.id); setConfirm("deletePeriod"); }}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : null}
          {periodsQ.isLoading ? <Spinner size="small" /> : null}
        </div>
      )}

      {/* ───────────────────────────────────────────────── contract panel ── */}
      <FormPanel
        open={panel === "contract" && form !== null}
        title={contractPanelTitle(form?.mode !== "Edit")}
        // PO screenshot (20 Oct 2026): a wide panel (~860) with two independently scrolling columns. The
        // 1.21.709 YAML has `con_…_RightPanel_NewEditCost_Body_1.Width: Min(760, Parent.Width)`.
        width="twoColumn"
        onDismiss={closeContract}
        footer={
          <PanelButtons
            onSave={onSaveContract}
            onCancel={closeContract}
            saveTestId="pcf_ProjectRevenues_RightPanel_NewEditCost_BodyButtons_Save_1"
            cancelTestId="pcf_ProjectRevenues_RightPanel_NewEditCost_BodyButtons_Cancel_1"
            saveLabel="pcf_ProjectRevenues_RightPanel_NewEditCost_BodyButtons_Save_1"
            cancelLabel="pcf_ProjectRevenues_RightPanel_NewEditCost_BodyButtons_Cancel_1"
            disabled={busy || !form || !canSaveRevenueContract(form, lang)}
          />
        }
      >
        {form ? (
          <div className={s.panelBody}>
            <MessageBar intent="info" className={s.notice} data-testid="revenues-assumptions-not-connected">
              <MessageBarBody>{REVENUE_SCREEN_TEXT.assumptionsNotConnected}</MessageBarBody>
            </MessageBar>
            <div className={s.panel}>
              {/* `con_ProjectRevenues_RightPanel_LeftSection_NewEditCost_BodyContent` — scrolls on its own. */}
              <div className={s.panelColumn} data-testid="con_ProjectRevenues_RightPanel_LeftSection_NewEditCost_BodyContent">
                <SelectField
                  label={SCREEN_LABEL.type}
                  name="drp_ProjectRevenues_RightPanel_NewEditCost_BodyContent_Label_1"
                  required
                  value={form.revenueTypeLabel ?? ""}
                  options={REVENUE_LABELS.map((l) => ({ value: l, text: l }))}
                  onChange={onType}
                />
                <TextInputField
                  label={SCREEN_LABEL.description}
                  name="txt_ProjectRevenues_RightPanel_NewEditCost_BodyContent_Description_1"
                  required
                  standard={panelStd?.description}
                  value={shownDescription(form.description, form.isStandardContract)}
                  error={validateDescription(form.description, form.isStandardContract).message}
                  onChange={(v) => change(editField(form, { description: v }))}
                />
                <TextInputField
                  label={REVENUE_FORM_LABEL.currency}
                  name="drp_ProjectRevenues_RightPanel_NewEditCost_BodyContent_Currency_1"
                  required
                  disabled
                  value={currencyQ.data?.name ?? ""}
                  placeholder={form.currencyCode ?? ""}
                />
                <div className={s.dateRow}>
                  <div className={s.grow}>
                    {/* `DatePicker@0.0.46`, `Format: ="dd.mm.yyyy"`, `IsEditable: true` (modern controls sweep). */}
                    <DateField
                      label={REVENUE_FORM_LABEL.contractStartDate}
                      name="dte_ProjectRevenues_RightPanel_NewEditCost_BodyContent_ContractStartDate_1"
                      format="dd.mm.yyyy"
                      required
                      standard={panelStd?.contractStartDate}
                      value={toIso(form.startDate)}
                      onChange={(v) => change(withTerm(form, { startDate: fromIso(v ?? "") }, { contractStartDate: false }))}
                    />
                  </div>
                  <Tooltip content={SCREEN_LABEL.resetToCod} relationship="label">
                    <Button
                      appearance="transparent"
                      icon={<ArrowSyncRegular />}
                      aria-label={SCREEN_LABEL.resetToCod}
                      data-testid="ico_SetCODDate_RightPanelRevenue_1"
                      onClick={() => { if (project) change(resetStartToCod(form, project, assumptions.data)); }}
                    />
                  </Tooltip>
                </div>
                {/* `con_…_ContractDuration_1`: ONE caption (`lbl_…_ContractDuration_1`) over the two pickers. */}
                <Field className={skinField} label={REVENUE_FORM_LABEL.contractDuration} required>
                  <div className={s.pair}>
                    <DurationPicker
                      name="drp_ProjectRevenues_RightPanel_NewEditCost_BodyContent_ContractDuration_Years_1"
                      value={form.durationYears === null ? "" : String(form.durationYears)}
                      options={durationYearOptions().map((y) => ({ value: String(y), text: contractYearsOption(y) }))}
                      onChange={(v) => change(withTerm(form, { durationYears: Number(v) }, {}))}
                    />
                    <DurationPicker
                      name="drp_ProjectRevenues_RightPanel_NewEditCost_BodyContent_ContractDuration_Months_1"
                      value={form.durationMonths === null ? "" : String(form.durationMonths)}
                      options={durationMonthOptions().map((m) => ({ value: String(m), text: contractMonthsOption(m) }))}
                      onChange={(v) => change(withTerm(form, { durationMonths: Number(v) }, {}))}
                    />
                  </div>
                </Field>
                {/* `DatePicker@0.0.46`, `DisplayMode.Disabled`, `Format: ="dd.mm.yyyy"`. */}
                <DateField
                  label={REVENUE_FORM_LABEL.contractEndDate}
                  name="dte_ProjectRevenues_RightPanel_NewEditCost_BodyContent_ContractEndDate_1"
                  format="dd.mm.yyyy"
                  disabled
                  standard={panelStd?.contractEndDate && "italic"}
                  value={form.endDate}
                />

                {form.showsGermanFitBlock ? (
                  <>
                    <TextInputField
                      label={biddingPriceCaption(form.currencyCode)}
                      name="txt_ProjectRevenues_RightPanel_NewEditCost_BodyContent_BiddingPrice_1"
                      required
                      standard={panelStd?.biddingPrice}
                      value={form.biddingPrice}
                      error={validateBiddingPrice(form.biddingPrice, lang).message}
                      onChange={(v) => {
                        const tariff = germanFitTariff(Number(v) || 0, Number(form.correctionFactor) || 0);
                        change(editFieldIfValid(form, validateBiddingPrice(v, lang).valid, {
                          biddingPrice: v, tariff, tariffP90: tariffP90For(form, { biddingPrice: v }),
                        }, { biddingPrice: false, price: false, priceP90: false }));
                      }}
                    />
                    <TextInputField
                      label={siteQualityCaption(form.technology === "Wind")}
                      name="txt_ProjectRevenues_RightPanel_NewEditCost_BodyContent_SiteQuality_1"
                      value={form.siteQuality}
                      error={validateSiteQuality(form.siteQuality, lang).message}
                      onChange={(v) => change(touchField(form, { siteQuality: v }))}
                    />
                    {showsP90Block(form) ? (
                      <TextInputField
                        label={SCREEN_LABEL.siteQualityP90}
                        name="txt_ProjectRevenues_RightPanel_NewEditCost_BodyContent_SiteQuality_p90"
                        value={form.siteQualityP90}
                        error={validateSiteQuality(form.siteQualityP90, lang).message}
                        onChange={(v) => change(touchField(form, { siteQualityP90: v }))}
                      />
                    ) : null}
                    <TextInputField
                      label={correctionFactorCaption(form.technology === "Wind")}
                      name="txt_ProjectRevenues_RightPanel_NewEditCost_BodyContent_CorrectionFactor_1"
                      required
                      standard={panelStd?.correctionFactor}
                      value={form.correctionFactor}
                      error={validateCorrectionFactor(form.correctionFactor, lang).message}
                      onChange={(v) => change(editField(form, {
                        correctionFactor: v,
                        tariff: germanFitTariff(Number(form.biddingPrice) || 0, Number(v) || 0),
                      }, { correctionFactor: false }))}
                    />
                    {showsP90Block(form) ? (
                      <TextInputField
                        label={SCREEN_LABEL.correctionFactorP90}
                        name="txt_ProjectRevenues_RightPanel_NewEditCost_BodyContent_CorrectionFactor_p90"
                        required
                        standard={panelStd?.correctionFactorP90}
                        value={form.correctionFactorP90}
                        error={validateCorrectionFactor(form.correctionFactorP90, lang).message}
                        onChange={(v) => change(editField(form, {
                          correctionFactorP90: v, tariffP90: tariffP90For(form, { correctionFactorP90: v }),
                        }, { correctionFactorP90: false }))}
                      />
                    ) : null}
                  </>
                ) : null}

                <TextInputField
                  label={tariffPriceCaption(form.country, showsP90Block(form))}
                  name="txt_ProjectRevenues_RightPanel_NewEditCost_BodyContent_TariffPrice_1"
                  required
                  disabled={form.showsGermanFitBlock}
                  standard={panelStd?.tariff}
                  value={form.tariff}
                  error={validateTariff(form.tariff, form.country, form.showsGermanFitBlock, lang).message}
                  onChange={(v) => change(editField(form, {
                    tariff: v,
                    ...(validateTariff(v, form.country, false, lang).valid ? { tariffP90: tariffP90For(form, { tariff: v }) } : {}),
                  }, { price: false }))}
                />
                {form.showsGermanFitBlock ? (
                  <TextInputField
                    label={tariffPriceP90Caption(form.country)}
                    name="txt_ProjectRevenues_RightPanel_NewEditCost_BodyContent_TariffPrice_p90"
                    required
                    disabled
                    standard={panelStd?.tariffP90}
                    value={form.tariffP90}
                  />
                ) : null}
              </div>

              {/* `con_ProjectRevenues_RightPanel_RightSection_NewEditCost_BodyContent` — scrolls on its own. */}
              <div className={s.panelColumn} data-testid="con_ProjectRevenues_RightPanel_RightSection_NewEditCost_BodyContent">
                <Switch
                  label={{ children: <><span className={s.req} aria-hidden>*</span>{REVENUE_FORM_LABEL.inflationProfile}</> }}
                  aria-label="tgl_ProjectRevenues_RightPanel_NewEditCost_BodyContent_InflationProfile_1"
                  data-testid="tgl_ProjectRevenues_RightPanel_NewEditCost_BodyContent_InflationProfile_1"
                  // `DisplayMode`: Disabled for Germany & FiT (L10423-10431, S14 — added D33).
                  disabled={form.country === "Germany" && form.revenueTypeLabel === "FiT"}
                  checked={form.useInflation}
                  onChange={(_, d) => change(editField(form, { useInflation: d.checked }, { useInflation: false }))}
                />
                {/* Seen only with inflation on: its container is 36 high and it sits at Y 40 (audit 20 Oct 2026). */}
                {showsCountryInflationToggle(form) ? (
                  <Switch
                    label={{ children: <><span className={s.req} aria-hidden>*</span>{REVENUE_FORM_LABEL.countryInflationProfile}</> }}
                    aria-label="tgl_ProjectRevenues_RightPanel_NewEditCost_BodyContent_CountryInflationProfile_1"
                    data-testid="tgl_ProjectRevenues_RightPanel_NewEditCost_BodyContent_CountryInflationProfile_1"
                    checked={form.useCountryInflationProfile}
                    onChange={(_, d) => change(toggleCountryInflation(form, d.checked, inflationQ.data, project?.countryCode ?? null))}
                  />
                ) : null}
                {form.useInflation ? (
                  <>
                    <TextInputField
                      label={REVENUE_FORM_LABEL.inflationStartYear}
                      name="txt_ProjectRevenues_RightPanel_NewEditCost_BodyContent_InflationStartYear_1"
                      required
                      placeholder={REVENUE_FORM_LABEL.inflationStartYearPlaceholder}
                      standard={panelStd?.inflationStartYear}
                      value={form.inflationStartYear}
                      error={validateInflationStartYear(form.inflationStartYear).message}
                      onChange={(v) => change(changeInflationStartYear(form, v, inflationQ.data, project?.countryCode ?? null, region))}
                    />
                    {form.useCountryInflationProfile ? (
                      <TextInputField
                        label={inflationProfileFieldCaption(true)}
                        name="txt_ProjectRevenues_RightPanel_NewEditCost_BodyContent_InflationProfileCountry_1"
                        disabled
                        value={form.country === "Italy" ? ` Italy - ${bareRegion(region)}` : (form.country ?? "")}
                      />
                    ) : (
                      <TextInputField
                        label={inflationProfileFieldCaption(false)}
                        name="txt_ProjectRevenues_RightPanel_NewEditCost_BodyContent_InflationProfile_1"
                        required
                        standard={panelStd?.inflationProfile}
                        value={form.inflationProfile}
                        error={validateInflationProfile(form.inflationProfile, lang).message}
                        onChange={(v) => change(editFieldIfValid(form, validateInflationProfile(v, lang).valid,
                          { inflationProfile: v }, { inflationValue: false }))}
                      />
                    )}
                  </>
                ) : null}

                <div className={s.dateRow}>
                  <Switch
                    label={REVENUE_FORM_LABEL.considerNegativePrices}
                    aria-label="tgl_ProjectRevenues_RightPanel_NewEditCost_BodyContent_Consider_Negative_prices"
                    data-testid="tgl_ProjectRevenues_RightPanel_NewEditCost_BodyContent_Consider_Negative_prices"
                    disabled={negMode === "disabled"}
                    checked={form.considerNegativePrices}
                    onChange={(_, d) => change(touchField(form, { considerNegativePrices: d.checked, negativePriceManualOverride: true }))}
                  />
                  {negMode === "edit" && formNeg ? (
                    <Tooltip
                      content={form.negativePriceManualOverride ? SCREEN_LABEL.negativePriceSyncOn : SCREEN_LABEL.negativePriceSyncOff}
                      relationship="description"
                    >
                      <Button
                        appearance="transparent"
                        icon={<ArrowSyncRegular />}
                        aria-label="ico_SyncNegativePrice_RightPanelRevenue"
                        data-testid="ico_SyncNegativePrice_RightPanelRevenue"
                        onClick={() => change(resyncNegativePrice(form, formNeg))}
                      />
                    </Tooltip>
                  ) : null}
                </div>

                <Choices
                  label={REVENUE_FORM_LABEL.provideHedgeVolumeIn}
                  name="rad_ProjectRevenue_HedgeType"
                  required
                  value={HEDGE_TYPE_LABEL[form.hedge.type]}
                  options={hedgeTypeOptions(form.startDate, form.durationYears, form.durationMonths)
                    .map((t) => HEDGE_TYPE_LABEL[t])}
                  onChange={(label) => {
                    const next = (Object.keys(HEDGE_TYPE_LABEL) as HedgeType[])
                      .find((t) => HEDGE_TYPE_LABEL[t] === label) ?? "percentage";
                    change(editField(form, {
                      hedge: resetOnHedgeTypeChange(form.hedge, next, { start: form.startDate, end: form.endDate }),
                    }, next === "percentage" ? {} : { hedgedVolume: false }));
                  }}
                />

                {form.hedge.type === "percentage" ? (
                  <TextInputField
                    label={HEDGE_TYPE_LABEL.percentage}
                    name="txt_ProjectRevenues_RightPanel_NewEditCost_BodyContent_HedgedVolume_1"
                    required
                    standard={panelStd?.hedgedVolume}
                    value={form.hedge.percentage.value}
                    error={validateHedgedVolumePercent(form.hedge.percentage.value, lang).message}
                    onChange={(v) => change(editFieldIfValid(form, validateHedgedVolumePercent(v, lang).valid, {
                      hedge: { ...form.hedge, percentage: { ...form.hedge.percentage, value: v } },
                    }, { hedgedVolume: false }))}
                  />
                ) : null}
                {form.hedge.type === "fixed" ? (
                  <TextInputField
                    label={HEDGE_TYPE_LABEL.fixed}
                    name="txt_ProjectRevenues_RightPanel_NewEditCost_BodyContent_FixedVolume"
                    required
                    value={form.hedge.fixed.value}
                    error={validateVolumeMwh(form.hedge.fixed.value, form.netYieldP50).message}
                    onChange={(v) => change(touchField(form, {
                      hedge: { ...form.hedge, fixed: { ...form.hedge.fixed, value: v, initialState: false } },
                    }))}
                  />
                ) : null}
                {form.hedge.type === "individual" ? (
                  <div data-testid="gal_ProjectRevenue_RightPanel_IndividualVolumeDetails" className={s.column}>
                    {volumesQ.isLoading ? <Spinner size="tiny" /> : null}
                    {form.hedge.individual.map((row, i) => (
                      <div key={row.year} className={s.volumeRow}>
                        {/* Individual-volume rows repeat literal ids, as the canvas gallery (D16 c). */}
                        <div className={s.volumePeriod}>
                          <TextInputField
                            label=""
                            name="txt_ProjectRevenue_RightPanel_IndividualVolume_Year"
                            disabled
                            value={volumeRowLabel(row)}
                          />
                        </div>
                        <TextInputField
                          label={SCREEN_LABEL.individualVolume}
                          labelTestId="lbl_ProjectRevenue_RightPanel_IndividualVolume_Header"
                          name="txt_ProjectRevenue_RightPanel_IndividualVolume_Value"
                          required
                          value={row.value}
                          error={validateVolumeMwh(row.value, form.netYieldP50).message}
                          onChange={(v) => {
                            const next = [...form.hedge.individual];
                            next[i] = { ...row, value: v, initialState: false };
                            change(touchField(form, { hedge: { ...form.hedge, individual: next } }));
                          }}
                        />
                      </div>
                    ))}
                  </div>
                ) : null}
                {subaccountQ.data === null && !subaccountQ.isLoading ? (
                  <Text className={s.error} role="alert" data-testid="cmp_Information_Button_RevenueEditForm_1">{MSG.subaccountMissing}</Text>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
      </FormPanel>

      {/* ──────────────────────────────────────────────── balancing panel ── */}
      <FormPanel
        open={panel === "balancing" && balancing !== null}
        title={balancingPanelTitle(balancing?.id === null)}
        width="narrow"
        onDismiss={closeBalancing}
        footer={
          <PanelButtons
            onSave={() => void onSaveBalancing()}
            onCancel={closeBalancing}
            saveTestId="pcf_ProjectRevenues_RightPanel_NewEditCost_BodyButtons_Save_2"
            cancelTestId="pcf_ProjectRevenues_RightPanel_NewEditCost_BodyButtons_Cancel_2"
            saveLabel="pcf_ProjectRevenues_RightPanel_NewEditCost_BodyButtons_Save_2"
            cancelLabel="pcf_ProjectRevenues_RightPanel_NewEditCost_BodyButtons_Cancel_2"
            disabled={
              busy || !balancing || balancing.price.trim() === ""
              || !validateBalancingPrice(balancing.price, country, lang).valid
              || (shiftVisible && !validateShiftOfCod(balancing.shift, lang).valid)
            }
          />
        }
      >
        {balancing ? (
          <div className={s.column}>
            {shiftVisible ? (
              <TextInputField
                label={SCREEN_LABEL.shiftFromCod}
                name="txt_BalancingPrice_ShiftOfCODDate"
                value={balancing.shift}
                error={validateShiftOfCod(balancing.shift, lang).message}
                onChange={(v) => setBalancing({ ...balancing, shift: v })}
              />
            ) : null}
            {/* `DatePicker@0.0.46`, `Format: ="dd.mm.yyyy"` — computed here, so Disabled. */}
            <DateField
              label={SCREEN_LABEL.startDate}
              name="dte_ProjectRevenues_RightPanel_NewEditCost_BodyContent_ContractStartDate_2"
              format="dd.mm.yyyy"
              required
              disabled
              value={balancingStart}
            />
            <div className={s.pair}>
              <SelectField
                label={REVENUE_FORM_LABEL.contractDuration}
                name="drp_ProjectRevenues_RightPanel_NewEditCost_BodyContent_ContractDuration_Years_2"
                required
                value={String(balancing.years)}
                options={balancingYearOptions().map((y) => ({ value: String(y), text: balancingYearsOption(y) }))}
                onChange={(v) => {
                  const y = Number(v);
                  const months = balancingMonthOptions(y);
                  setBalancing({
                    ...balancing, years: y,
                    months: months.includes(balancing.months) ? balancing.months : (months[0] ?? 0),
                  });
                }}
              />
              <SelectField
                label={REVENUE_FORM_LABEL.contractDuration}
                name="drp_ProjectRevenues_RightPanel_NewEditCost_BodyContent_ContractDuration_Months_2"
                required
                value={String(balancing.months)}
                options={balancingMonthOptions(balancing.years).map((m) => ({ value: String(m), text: balancingMonthsOption(m) }))}
                onChange={(v) => setBalancing({ ...balancing, months: Number(v) })}
              />
            </div>
            <DateField
              label={SCREEN_LABEL.endDate}
              name="dte_ProjectRevenues_RightPanel_NewEditCost_BodyContent_ContractEndDate_2"
              format="dd.mm.yyyy"
              required
              disabled
              value={balancingStart ? balancingEndDate(balancingStart, balancing.years, balancing.months) : null}
            />
            <TextInputField
              label={balancingPriceCaption(country)}
              name="txt_Revenue_BalancingPrice[EUR/MWh]"
              required
              value={balancing.price}
              error={validateBalancingPrice(balancing.price, country, lang).message}
              onChange={(v) => setBalancing({ ...balancing, price: v })}
            />
          </div>
        ) : null}
      </FormPanel>

      <ConfirmDialog
        open={confirm === "deleteContract" && selectedContract !== null}
        title={DIALOG.deleteContractTitle}
        description={selectedContract
          ? deleteContractDescription(revenueLabelText(selectedContract.label), selectedContract.description)
          : ""}
        confirmText={DIALOG.deleteConfirm}
        cancelText={DIALOG.cancel}
        confirmIcon="delete"
        destructive
        busy={busy}
        onCancel={() => setConfirm("none")}
        onConfirm={async () => {
          const target = selectedContract;
          setConfirm("none");
          const ids = await writes.run(deleteContractJob(target));
          if (ids !== null) setSelectedContractId(null);
        }}
      />

      <ConfirmDialog
        open={confirm === "deletePeriod" && selectedPeriod !== null}
        title={DIALOG.deleteBalancingTitle}
        description={selectedPeriod ? deleteBalancingDescription(selectedPeriod.name) : ""}
        confirmText={DIALOG.deleteConfirm}
        cancelText={DIALOG.cancel}
        confirmIcon="delete"
        destructive
        busy={busy}
        onCancel={() => { setConfirm("none"); setSelectedPeriodId(null); }}
        onConfirm={async () => {
          const target = selectedPeriod;
          setConfirm("none");
          await writes.run(deleteBalancingJob(target));
          setSelectedPeriodId(null);
        }}
      />

      <ConfirmDialog
        open={confirm === "volumes"}
        title={DIALOG.individualVolumesTitle}
        description={MSG.individualVolumesConfirm}
        confirmText={DIALOG.confirm}
        cancelText={DIALOG.cancel}
        onCancel={() => setConfirm("none")}
        onConfirm={() => { setConfirm("none"); if (form) void saveContract(form); }}
      />

      <ConfirmDialog
        open={hedgeError !== null}
        title={DIALOG.hedgeOver100Title}
        description={hedgeError ?? ""}
        variant="info"
        onCancel={() => setHedgeError(null)}
        onConfirm={() => setHedgeError(null)}
      />
    </div>
  );
}
