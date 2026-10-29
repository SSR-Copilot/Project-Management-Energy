/**
 * Project General Data Screen — composition only (connected 19 Oct 2026, D25). Also the New
 * Project screen.
 *
 * Canvas screen: `Project General Data Screen.pa.yaml` (PM app). Routed at `/project/general`;
 * with no `projectId` it is the canvas `addProject` path (a blank form under "New Project").
 * Creating a project is left out (it fires the Teams/SharePoint site-creation flow), so on that
 * path Save stays disabled with the reason shown (D25).
 *
 * Structure, following the canvas containers:
 *   `lbl_…_Content_Label`                              "General"
 *   `con_…_Basic_Informations_Group`                   Basic Information (+ the Acquired-only row)
 *   `con_…_Label_Placement` / `con_…_Groups`           Placement fields beside the map
 *   `con_…_Label_Shareholding_Entities` / `…_SEGroup`  Add, the 100 % note, the entity grid
 *   `con_GeneralData_DisplayProject_Body_Content_Buttom` Cancel / Save / Required fields + stamps
 *   `con_GeneralData_RightPanel_ShareholdingEntity_Form` the shareholding panel
 *   `con_ClusterChange_RightPanel`                     the Start-Cluster change panel
 *   `cmp_GeneralData_PopUp_ConfirmationDeleteShareholdingEntity`
 *
 * NOT BUILT (documented gap, D25): the map control (`map_con_…_Map`, a placeholder is kept; Lat /
 * Lng are typed), so the location confirmation never opens. The unsaved-data leave dialog
 * (`cmp_PopUp_Leave_GeneralData_Confirmation`) is the shared `UnsavedChangesGuard` (D35).
 *
 * The hidden subroutine buttons are ported as functions: `btn_GeneralData_Save_Actual` → `runSave`,
 * `btn_General_CancelActiveDraftGateApproval…` → the tracking part of `planGeneralDataSave`,
 * `btn_…_Buttons_Reset` → `cancel`, `btn_cluster_change_reset_control` → `openClusterPanel`.
 */
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import { refusePlan } from "@/data/writePlan";
import {
  Button, Combobox, Field, Option, Table, TableBody, TableCell, TableHeader,
  TableHeaderCell, TableRow, Text, Tooltip, makeStyles, mergeClasses, tokens,
} from "@fluentui/react-components";
import {
  AddFilled, CalendarAddRegular, CheckmarkRegular, DeleteFilled, DismissRegular, EditFilled,
  InfoRegular,
} from "@fluentui/react-icons";
import {
  ChoiceField, ConfirmDialog, DateField, DateInput, EmptyState, FIELD_APPEARANCE, FormPanel, LoadingOverlay, PanelButtons, PeoplePicker,
  ReadOnlyField, TextField, UnsavedChangesGuard, WriteFeedback, type PickerPerson, useFieldControlClass,
  useCanvasRequiredMark, useFieldSkin, useNoInvalidOutline,
} from "@/components";
import { useSession } from "@/app/SessionContext";
import { MODERN_DATE_PICKER_FORMAT } from "@/domain/canvasDate";
import { useCurrentUser } from "@/app/useCurrentUser";
import { palette, space } from "@/theme/tokens";
import { CANVAS_TEXT, usePmLayout } from "./pmLayout";
import {
  CALENDAR_ADD_SOURCE, CLUSTER_PANEL_FIELDS, CLUSTER_STATE_LABEL, DELETE_SHAREHOLDER_DIALOG,
  DEVELOPMENT_TYPE_LABEL, GD_LABELS, MSG, PROJECT_TYPE_LABEL, SHAREHOLDER_ENTITY_TYPE_LABEL,
  SPV_LEGAL_STRUCTURE_LABEL, START_CLUSTER_OPTIONS, TECHNOLOGY_OPTIONS,
  acquisitionPriceLabel, applyCalendarAdd, applyFrenchMunicipality, applyGermanMunicipality,
  applyShareholderDraft, auditStampParts, calendarAddVisible, canAddShareholder, canSave, canSaveClusterPanel,
  canSaveShareholderPanel, classifyStartClusterChange, clusterPanelEditable, clusterPanelInfo,
  clusterPanelVisible, clusterSaveErrorText, countryDisplayMode, countryOptions,
  deleteShareholderDescription, deleteShareholderName, emptyGeneralDataForm, fieldErrors,
  fieldModes, formLocks, formatOwnership, isAcquisitionRowVisible,
  isAreaRequired, isFormDirty, isMunicipalityRequired, isSpvCompanyCodeVisible,
  isSpvLegalStructureRequired, isSpvLegalStructureVisible, isTerrainSizeRequired, isThirdParty,
  milestoneChainErrors, municipalityMode, onAreaChange, onCountryChange, onDevelopmentTypeChange,
  onSpvNameChange, openClusterPanel, ownershipInputText, planClusterPanelSave, planGeneralDataSave,
  planShareholderDelete, projectSaveErrorText, requiredFieldsContent, saveBlockReason,
  createdProjectSnapshot, planProjectCreate, planSaveFollowUps, startClusterChanged,
  shareholderDeleteErrorText, shareholderPanelErrors, shareholderPanelFull, shareholdingDescription,
  shareholdingFullMessage, shareholdingSum, stepLogText, taxFactorFallbackMunicipality, toForm, toSnapshot,
  type ClusterPanelField, type ClusterPanelState, type GeneralDataForm, type GeneralDataRefData,
  type ShareholderDraft, type ShareholdingEntity,
  clusterPanelDateIsStandard, LEAVE_DIALOG, shouldConfirmLeave,
} from "./rules";
import {
  useCountries, useCountryAreas, useEntraPeople, useEntraSearch, useGeneralDataProject,
  useGeneralDataWrites, useGermanTradeTaxRate, useProjectReader, useMilestoneDurations, useMunicipalitySearch,
  useProjectStates, useShareholders, useStateTrackings, useTerrainUtilizations,
} from "./hooks";

/** `gblAppConstants.DefaultMaxLength` (`App.pa.yaml`) — every `{Len}/55` counter on the form. */
const DEFAULT_MAX_LENGTH = 55;
/** `txt_…_SPVCompanyCode.MaxLength` — the `{Len}/4` counter. */
const SPV_CODE_MAX_LENGTH = 4;
/** `txt_…_Latitude.MaxLength` / `txt_…_Longitude.MaxLength` (Y:4177, Y:4300). */
const LAT_MAX_LENGTH = 11;
const LNG_MAX_LENGTH = 12;
/** `txt_…_ShareholdingEntity_InpForm_BodyForm_Percentage.MaxLength` (Y:6673). */
const PERCENT_MAX_LENGTH = 6;

/** Screen-only texts that are not canvas captions (NEW — the load-error state, rule 19). */
const SCREEN_TEXT = {
  loadFailedTitle: "The project data could not be loaded",
  loadFailedDescription: "Reload the page or try again later.",
  loading: "Loading...",
} as const;

/*
 * Layout transcribed from the canvas containers (UI layout pass, 20 Oct 2026):
 *  - `con_…_Basic_Informations_Group` — PaddingTop/Bottom 8, PaddingRight 20, vertical;
 *  - each field is a 300 × 70 `ManualLayout` cell (`con_…_ProjectID` …), its caption and input
 *    at X `gblAppSizes.Position.X` (20), Width `Parent.Width - 40`; rows are horizontal, no gap;
 *  - Placement (`con_…_Groups`, wrap, Width `Parent.Width-20`): the fields (`…_Groups_Row`,
 *    FillPortions 3, LayoutMinWidth 500, PaddingTop 20) beside the map (FillPortions 2); its cells
 *    are `Min(Parent.Width/3, 300)` wide, the Latitude/Longitude row 120 high;
 *  - Shareholding (`con_…_SEGroup`): Padding 20 / 20 / top 10, Width `Min(…/3, 300) * 3`.
 */
const useStyles = makeStyles({

  body: {
    display: "flex", flexDirection: "column", paddingTop: "8px", paddingBottom: "8px", paddingRight: "20px",
    /* The canvas `*` (`lbl_…_Requered`) is `useCanvasRequiredMark` on this root. */
    /*
     * The `lbl_…_ErrorMessage` labels are classic `Label@2.5.1`: `Color: gblAppColors.Error`
     * (= `palette.akzent5`), `Size: gblAppSizes.Font.ExtraExtraSmall` (8 pt = 10.67 px),
     * `Height: 16`, `Wrap: false` — one line — and no icon; the label's own 5-px padding insets
     * the text from the caption.
     */
    "& .fui-Field__validationMessage": {
      display: "block", minWidth: 0, maxWidth: "100%", paddingLeft: "5px",
      color: palette.akzent5, fontSize: "10.67px", lineHeight: "16px",
      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
    },
    "& .fui-Field__validationMessageIcon": { display: "none" },
  },
  /** `con_…_PGroup` — PaddingTop / PaddingBottom 10. */
  section: { display: "flex", flexDirection: "column" },
  group: { display: "flex", flexDirection: "column", paddingTop: "10px", paddingBottom: "10px" },
  /** `con_…_PGroup_nRow` — horizontal; wraps below the three 300-px cells (narrow windows). */
  row: {
    display: "flex", flexWrap: "wrap", alignItems: "flex-start",
    /** Each field is a 300 × 70 cell; the caption and input inset 20 px on both sides. */
    "& > *": {
      boxSizing: "border-box", flex: "0 0 300px", maxWidth: "100%", minWidth: 0,
      minHeight: "70px", paddingLeft: "20px", paddingRight: "20px",
    },
  },
  /** `con_…_ClusterChange*` — the Acquisition cells are 81 high (92 with an error). */
  acquisitionRow: { paddingTop: "5px", "& > *": { minHeight: "76px" } },
  /** `PGroup_5Row_2.Height: If(AcquisitionDate_ErrorMessage_1.Visible, 92, 81)`, PaddingTop 5. */
  acquisitionRowError: { "& > *": { minHeight: "87px" } },
  placement: {
    display: "flex", flexWrap: "wrap", alignItems: "stretch",
    width: "calc(100% - 20px)",
  },
  /** `con_…_Groups_Row` — FillPortions 3, LayoutMinWidth 500; `con_…_LGroup` PaddingTop 20. */
  placementFields: { flex: "3 1 0px", minWidth: "min(500px, 100%)", maxWidth: "100%", paddingTop: "20px", paddingBottom: "20px" },
  /**
   * Placement uses the SAME 300 px cells as Basic Information, so the three columns line up
   * vertically across the sections (PO, 21 Oct 2026). It was 270 px, read off the live canvas.
   */
  placementRow: {},
  fullWidthCombo: { width: "100%", minWidth: 0 },
  latLngRow: {
    minHeight: "120px",
    // `lbl_…_Latitude_ErrMessage` / `_Longitude_ErrMessage` are `AutoHeight: true`: they wrap.
    "& .fui-Field .fui-Field__validationMessage": { whiteSpace: "normal", overflow: "visible", lineHeight: "13px" },
  },
  /**
   * `map_con_GeneralData_DisplayProject_Body_General_Content_Map` (FillPortions 2) — no map library
   * yet (D25); the placeholder takes the map's place and height, ~580 wide as on the live canvas (20 Oct 2026).
   */
  /*
   * `con_con_..._Content_Map` (ManualLayout, FillPortions 2) holds the map at 90 % of its width and
   * height, centred (`X/Y: (Parent - Self) / 2`), so it never touches the Placement rule above or
   * the fields beside it (PO, 22 Oct 2026).
   */
  mapCell: {
    // FillPortions 3 : 2 of the whole row (basis 0).
    flex: "2 1 0px", minWidth: "240px", maxWidth: "100%", minHeight: "260px",
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  map: {
    boxSizing: "border-box", width: "90%", height: "90%",
    borderRadius: "4px",
    backgroundColor: palette.neutralLighter,
    borderTopWidth: "1px", borderRightWidth: "1px", borderBottomWidth: "1px", borderLeftWidth: "1px",
    borderTopStyle: "solid", borderRightStyle: "solid", borderBottomStyle: "solid", borderLeftStyle: "solid",
    borderTopColor: palette.neutralQuaternaryAlt, borderRightColor: palette.neutralQuaternaryAlt,
    borderBottomColor: palette.neutralQuaternaryAlt, borderLeftColor: palette.neutralQuaternaryAlt,
  },
  /** Product owner's measure of the live canvas (20 Oct 2026): the grid ~910 wide, Add + note 810. */
  shareGroup: {
    boxSizing: "border-box", width: "100%", maxWidth: "950px", overflowX: "auto",
    // `con_…_SEGroup.Height` = bar + header + rows + 50 with PaddingTop 10: 40 px free under the table.
    paddingLeft: "20px", paddingRight: "20px", paddingTop: "10px", paddingBottom: "40px",
  },
  /** `con_GeneralData_DisplayProject_Body_Content_Buttom` keeps the default `DropShadow.Light` — the rule above the buttons. */
  footer: { boxShadow: tokens.shadow4 },
  /** `con_…_ShareholdingEntities_CommandBar` — Height 40: Add (80 × 28) and the info strip (38 high). */
  shareBar: { display: "flex", alignItems: "center", minHeight: "40px", maxWidth: "810px" },
  shareTableBox: { maxWidth: "910px" },
  /**
   * `Color: themePrimary`, `Icon: "Add"`, `IconStyle.Filled` — the icon in the same blue.
   * `Align: =Align.Left`, `PaddingRight: =0`: the icon and caption start at the LEFT, not
   * centred in the 80 px. The `+` glyph sits over the table's first column caption
   * ("Description", 8 px into the table): 5 px padding + the glyph's 3 px inset (PO, 21 Oct 2026).
   */
  addButton: {
    flex: "0 0 80px", height: "28px", justifyContent: "flex-start", paddingLeft: "5px", paddingRight: 0,
    // Only while enabled: at 100 % ownership (`DisplayMode.Disabled`) it greys out like the canvas.
    ":enabled": { color: palette.themePrimary, "& .fui-Button__icon": { color: palette.themePrimary } },
  },
  /** `con_AdminContract_Apply_All_Last_Tracking_1` — Fill `RGBA(204, 226, 241, 0.5)`. */
  shareNote: {
    flex: 1, display: "flex", alignItems: "center", columnGap: "5px",
    minHeight: "38px", paddingLeft: "10px",
    backgroundColor: "rgba(204, 226, 241, 0.5)", color: CANVAS_TEXT, fontSize: "13.33px",
  },
  shareNoteIcon: { color: palette.Grayscale10, fontSize: "18px" },
  /** The 38-px header (Semibold 14, `Grayscale20` rule) and 26-px rows (ExtraSmall, `RGBA(50,49,48)`). */
  shareTable: {
    "& .fui-TableHeader .fui-TableRow": {
      height: "38px", borderBottomWidth: "1px", borderBottomStyle: "solid", borderBottomColor: palette.Grayscale20,
    },
    "& .fui-TableHeaderCell": { fontSize: "14px", fontWeight: 600 },
    "& .fui-TableBody .fui-TableRow": { height: "26px", borderBottomColor: "rgb(245, 245, 245)" },
    "& .fui-TableBody .fui-TableCell": { fontSize: "12px", color: CANVAS_TEXT },
  },
  /** `lbl_…_Percentage` / `lbl_…_Percentage_2` — 100 wide; Ownership sits 20 before Actions. */
  ownershipColumn: {
    width: "100px", paddingRight: "20px", textAlign: "right",
    // `Align.Right` on the header captions too (a Fluent header cell lays its text out with flex).
    "& .fui-TableHeaderCell__button": { justifyContent: "flex-end" },
  },
  actionsColumn: { width: "100px", "& .fui-TableHeaderCell__button": { justifyContent: "flex-end" } },
  ownership: { textAlign: "right" },
  actions: { display: "flex", justifyContent: "flex-end", columnGap: "10px" },
  /** `btn_general_data_shareholding_entity_Edit` / `_Delete` — 20 × 20, `themePrimary`. */
  rowIcon: { minWidth: "20px", width: "20px", height: "20px", color: palette.themePrimary },
  /** `con_…_Body_Content_Buttons` — PaddingLeft 20, LayoutGap 20, fills the bar. */
  buttons: { flex: 1, display: "flex", alignItems: "center", columnGap: "20px", flexWrap: "wrap", paddingLeft: "20px" },
  /** `con_…_Body_Buttons_Reset` (130 wide): the info button and "Required fields", `gblAppColors.Error`. */
  required: {
    color: palette.akzent5, cursor: "default", display: "inline-flex", alignItems: "center", gap: space.xxs, minWidth: "130px", fontSize: "10.67px",
    // `ibtn_…_Requered_Fileds.Color: gblAppColors.Error` — the info icon in the same colour as the text.
    "& .fui-Button": { color: palette.akzent5 },
    "& .fui-Button:hover": { color: palette.akzent5 },
    "& .fui-Button__icon": { color: palette.akzent5 },
  },
  blocked: { color: palette.neutralSecondary, fontSize: tokens.fontSizeBase200, maxWidth: "48ch" },
  /** `con_…_Body_Content_ProjectInfo` — PaddingRight 20; the labels right-aligned. */
  stampBox: { paddingRight: "20px", alignItems: "flex-end" },
  /**
   * The stamp as the canvas lays it out: "Created By:" / "Modified By:" (80 wide, `Align.Right`,
   * Semibold), then the name and the date in their own columns (20 Oct 2026, D25).
   */
  stampGrid: {
    display: "grid", gridTemplateColumns: "80px auto auto", columnGap: "10px", rowGap: "2px",
    alignItems: "baseline", whiteSpace: "nowrap",
  },
  stampLabelCell: { textAlign: "right" },
  /** The name label's box disappears so its name and date become grid cells (text unchanged). */
  stampValue: { display: "contents" },
  /** `con_…_Body_General_Content_Label` is outside the scrolling body: it stays put. */
  stickyBand: { position: "sticky", top: 0, zIndex: 2 },
  panelFields: { display: "flex", flexDirection: "column", gap: space.m },
  error: { color: palette.akzent5, fontSize: tokens.fontSizeBase200 },
  dateRow: { display: "flex", alignItems: "flex-end", gap: space.xs },
  /** The panel picker fills the row beside its CalendarAdd button. */
  panelDate: { flexGrow: 1, minWidth: 0 },
  multiline: { whiteSpace: "pre-line" },
});

/** The section caption the canvas draws as a label beside a rule (`shp_…` + `lbl_…`). */
function GroupHeader({ title, testId }: { title: string; testId: string }) {
  const l = usePmLayout();
  return (
    <div className={l.groupHeader}>
      <Text as="h3" className={l.groupTitle} data-testid={testId}>{title}</Text>
    </div>
  );
}

/** Canvas date-picker control names of the cluster-change panel, per field. */
const CLUSTER_PANEL_TESTID: Record<ClusterPanelField, string> = {
  startDate: "dtp_Milestones_DisplayProject_Body_General_Content_StartDate_1",
  cluster1: "dtp_Milestones_DisplayProject_Body_General_Content_Cluster1_1",
  cluster2: "dtp_Milestones_DisplayProject_Body_General_Content_Cluster2_1",
  cluster3: "dtp_Milestones_DisplayProject_Body_General_Content_Cluster3_1",
  cluster4: "dtp_Milestones_DisplayProject_Body_General_Content_Cluster4_1",
  fid: "dtp_Milestones_DisplayProject_Body_General_Content_FiD_1",
  cluster5: "dtp_Milestones_DisplayProject_Body_General_Content_Cluster5_1",
  cluster6: "dtp_Milestones_DisplayProject_Body_General_Content_Cluster6_1",
};

/** The pickers' `AccessibleLabel` — the control name WITHOUT the `_1` suffix (Y:7392 …). */
const clusterPanelAria = (field: ClusterPanelField): string => CLUSTER_PANEL_TESTID[field].replace(/_1$/, "");


const optionsOf = (labels: Record<number, string>) =>
  Object.entries(labels).map(([value, label]) => ({ value, label }));

export default function GeneralDataScreen() {
  const s = useStyles();
  const l = usePmLayout();
  const skin = useFieldSkin();
  const noInvalidOutline = useNoInvalidOutline();
  const requiredMark = useCanvasRequiredMark();
  const controlClass = useFieldControlClass();
  const { projectId, locale, envVars } = useSession();
  const isNewProject = !projectId;
  const lang = locale;
  const user = useCurrentUser().data;

  const record = useGeneralDataProject(projectId);
  const countriesQ = useCountries();
  const statesQ = useProjectStates();
  const shareholdersQ = useShareholders(projectId);
  const trackingsQ = useStateTrackings(projectId);
  const writes = useGeneralDataWrites(projectId);

  const [form, setForm] = useState<GeneralDataForm | null>(null);
  const [localEntities, setLocalEntities] = useState<ShareholdingEntity[] | null>(null);
  /** `locNeedShareholdingEntitiesUpdate` */
  const [shareholdersDirty, setShareholdersDirty] = useState(false);
  /** The delete dialog sets `locIsGeneralFormDirty: true`. */
  const [deletedAny, setDeletedAny] = useState(false);
  const [managerSearch, setManagerSearch] = useState("");
  const [deputySearch, setDeputySearch] = useState("");
  const [muniSearch, setMuniSearch] = useState("");
  const [picked, setPicked] = useState<Map<string, PickerPerson>>(new Map());
  const [draft, setDraft] = useState<ShareholderDraft | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [clusterPanel, setClusterPanel] = useState<ClusterPanelState | null>(null);
  const newKey = useRef(0);
  /** The project to switch to once the create is saved and the form is clean (guard-safe). */
  const [openProjectId, setOpenProjectId] = useState<string | null>(null);
  const openedProjectId = useRef<string | null>(null);
  const navigate = useNavigate();
  const readProject = useProjectReader();

  const row = record.data;
  const countries = countriesQ.data;
  const projectStates = statesQ.data;
  const taxFallback = useGermanTradeTaxRate(row ? taxFactorFallbackMunicipality(row, countries) : null);
  const baseline = useMemo(
    () => (row ? toForm(row, { countries }, lang, taxFallback.data) : emptyGeneralDataForm),
    [row, countries, lang, taxFallback.data],
  );
  const live = form ?? baseline;
  const snapshot = useMemo(
    () => (row ? toSnapshot(row, { countries, projectStates }) : null),
    [row, countries, projectStates],
  );

  const selectedAreas = useCountryAreas(live.countryId);
  const projectAreas = useCountryAreas(snapshot?.countryId);
  const utilizations = useTerrainUtilizations(live.countryId);
  const country = countries.find((c) => c.id === live.countryId);
  const muniMode = municipalityMode(country?.name);
  const areaName = selectedAreas.data.find((a) => a.id === live.areaId)?.name ?? null;
  const municipalities = useMunicipalitySearch(muniMode, muniSearch, areaName);
  const managers = useEntraSearch(managerSearch);
  const deputies = useEntraSearch(deputySearch);
  const people = useEntraPeople([live.managerEntraRowId, live.deputyManagerEntraRowId]);

  const ref: GeneralDataRefData = {
    countries,
    countryIdsWithAreas: [
      ...(selectedAreas.data.length > 0 && live.countryId ? [live.countryId] : []),
      ...(projectAreas.data.length > 0 && snapshot?.countryId ? [snapshot.countryId] : []),
    ],
    projectStates,
    environmentName: envVars.vsb_EnvironmentName ?? "",
    language: lang,
  };

  const entities = localEntities ?? shareholdersQ.data;
  const trackings = trackingsQ.data;
  const ctx = { form: live, ref, project: snapshot, entities, hasPersistedShareholders: shareholdersQ.data.length > 0 };
  const errors = fieldErrors(ctx);
  const required = requiredFieldsContent(ctx);
  const isDirty = isFormDirty(live, baseline) || shareholdersDirty || deletedAny;
  // `DataSourceInfo` / `RecordInfo` have no SDK equivalent: Dataverse decides (D1, serverEnforcedProvider).
  const perms = { canCreate: true, canEdit: true };
  const blockReason = saveBlockReason({ project: snapshot, form: live, trackings, projectStates });
  const saving = writes.progress !== null;
  const saveEnabled = !saving && !blockReason && canSave({ ...ctx, perms, isDirty });

  const locks = formLocks(live, snapshot);
  const modes = fieldModes({ clusterStateOrder: snapshot?.clusterStateOrder ?? null, environmentName: ref.environmentName });
  const editableScope = useMemo(() => {
    const names = new Set(user?.editableCountries ?? []);
    return countries.filter((c) => names.has(c.name)).map((c) => ({ id: c.id, name: c.name }));
  }, [user?.editableCountries, countries]);
  const countryMode = countryDisplayMode({
    approvalState: snapshot?.approvalState ?? null,
    canCreate: perms.canCreate,
    countryInScope: isNewProject || (user?.editableCountries ?? []).includes(snapshot?.countryName ?? ""),
  });
  const countryList = countryOptions(countries, editableScope, snapshot?.countryName);

  const acquired = isAcquisitionRowVisible(live.developmentType);
  const areaRequired = isAreaRequired(live.countryId, snapshot?.countryId, ref.countryIdsWithAreas);
  const terrainVisible = isTerrainSizeRequired(country?.key, snapshot?.countryKey);
  const muniRequired = isMunicipalityRequired(country?.name) !== null;
  useEffect(() => {
    if (!openProjectId || isDirty || openedProjectId.current === openProjectId) return;
    openedProjectId.current = openProjectId;
    navigate({ pathname: "/project/general", search: `?${new URLSearchParams({ projectId: openProjectId })}` }, { replace: true });
  }, [openProjectId, isDirty, navigate]);

  const durations = useMilestoneDurations(snapshot?.countryId, snapshot?.technology, clusterPanel !== null);

  const update = (next: (f: GeneralDataForm) => GeneralDataForm) => setForm((f) => next(f ?? baseline));
  const patch = (p: Partial<GeneralDataForm>) => update((f) => ({ ...f, ...p }));

  const personFor = (id: string | null, name: string | null): PickerPerson[] => {
    if (!id) return [];
    const p = picked.get(id) ?? people.data.get(id);
    return [{ id, displayName: p?.displayName || name || "", mail: p?.mail ?? "" }];
  };
  const remember = (p: PickerPerson) => setPicked((m) => new Map(m).set(p.id, p));

  const createdBy = auditStampParts(row?.createdByName ?? null, row?.createdOn ?? null);
  const modifiedBy = auditStampParts(row?.modifiedByName ?? null, row?.modifiedOn ?? null);

  const clusterLabel = (field: ClusterPanelField): string => {
    if (field === "startDate") return GD_LABELS.projectStart;
    if (field === "fid") return GD_LABELS.finalInvestmentDecision;
    const order = Number(field.replace("cluster", ""));
    // `LookUp(colClusterStatesDataTable, Order = n).'Cluster Description'`
    return projectStates.find((p) => p.order === order)?.clusterDescription ?? "";
  };

  /* ───────────────────────────────────────────────────────────── the saves */

  /** `btn_…_Buttons_Reset` — clear the form; the edited shareholding list goes too (D25). */
  const cancel = () => {
    setForm(null); setLocalEntities(null); setShareholdersDirty(false); setDeletedAny(false);
    setMuniSearch(""); setManagerSearch(""); setDeputySearch("");
  };

  /**
   * `btn_GeneralData_Save_Actual` for a NEW project (PO decision 20 Oct 2026, D25): Patch #1 creates
   * the row; the second job re-reads it (Patch #2 needs its autonumber 'Project ID') and writes the
   * follow-ups. Then the screen switches to the new project, as the canvas sets
   * `gblRecordSelectedProject` to the new record.
   */
  const runCreate = async () => {
    const created = await writes.run({
      progress: MSG.savingProject, errorText: projectSaveErrorText, plan: planProjectCreate(live, ref),
    });
    const newId = created?.[0];
    if (!newId) return;
    const formAtSave = live, entitiesAtSave = entities, shareholdersDirtyAtSave = shareholdersDirty;
    await writes.run({
      progress: MSG.savingProject, errorText: projectSaveErrorText,
      success: stepLogText([
        MSG.stepProjectSaved,
        ...(startClusterChanged({ startCluster: 0 }, formAtSave) ? [MSG.stepTrackingRefreshed] : []),
        ...(shareholdersDirtyAtSave ? [MSG.stepShareholdersSaved] : []),
      ]),
      plan: async () => {
        const reRead = await readProject(newId);
        if (!reRead) return refusePlan(MSG.createReadBackFailed);
        return planSaveFollowUps({
          project: createdProjectSnapshot(toSnapshot(reRead, { countries, projectStates })),
          form: formAtSave, ref, trackings: [], shareholdersDirty: shareholdersDirtyAtSave, entities: entitiesAtSave,
        });
      },
    });
    // The project exists either way — never leave the user on a form that would create it twice.
    cancel();
    setOpenProjectId(newId);
  };

  /** `btn_GeneralData_Save_Actual` */
  const runSave = async () => {
    if (isNewProject) return runCreate();
    if (!snapshot) return;
    const plan = planGeneralDataSave({ project: snapshot, form: live, ref, trackings, shareholdersDirty, entities });
    const done = await writes.run({
      progress: MSG.savingProject, success: stepLogText(plan.log), errorText: projectSaveErrorText, plan,
    });
    if (done !== null) cancel();
  };

  /** `pcf_btn_…_Buttons_Save.OnSelect` — save directly, or open the cluster-change panel first. */
  const save = () => {
    if (!saveEnabled) return;
    if (!snapshot) { void runSave(); return; }
    const change = classifyStartClusterChange({
      developmentType: live.developmentType, previousCluster: snapshot.startCluster,
      selectedCluster: live.startCluster, project: snapshot,
    });
    if (change === "direct-save") void runSave();
    else setClusterPanel(openClusterPanel(snapshot, live));
  };

  /** `but_ClusterChange_RightPanel_Footer_Save` — the milestone patch, then the main save. */
  const saveClusterPanel = async () => {
    if (!snapshot?.id || !clusterPanel) return;
    const panel = clusterPanel;
    setClusterPanel(null);
    const done = await writes.run({
      progress: MSG.savingCluster, errorText: clusterSaveErrorText, plan: planClusterPanelSave(snapshot.id, panel),
    });
    if (done !== null) await runSave();
  };

  /** The delete confirmation — deletes from Dataverse at once, as the canvas does (W7). */
  const confirmDelete = async () => {
    const victim = entities.find((e) => e.key === deleteTarget);
    setDeleteTarget(null);
    if (!victim) return;
    const done = await writes.run({
      progress: "", success: MSG.shareholderDeleted, errorText: shareholderDeleteErrorText,
      plan: planShareholderDelete(victim),
    });
    if (done !== null) {
      setLocalEntities(entities.filter((e) => e.key !== victim.key));
      setDeletedAny(true);
    }
  };

  const saveDraft = () => {
    if (!draft) return;
    setLocalEntities(applyShareholderDraft(entities, draft, lang));
    setShareholdersDirty(true);
    setDraft(null);
  };

  const loadError = record.error ?? countriesQ.error ?? statesQ.error ?? shareholdersQ.error ?? trackingsQ.error;
  if (loadError) {
    return (
      <div className={l.page}>
        <EmptyState title={SCREEN_TEXT.loadFailedTitle} description={SCREEN_TEXT.loadFailedDescription} />
      </div>
    );
  }
  if (record.isLoading || countriesQ.isLoading || statesQ.isLoading) {
    return <LoadingOverlay mode="inline" label={SCREEN_TEXT.loading} />;
  }

  /** The municipality combobox: typing searches (`muniSearch`), picking applies the canvas OnChange. */
  const pickMunicipality = (key: string | undefined) => {
    const m = municipalities.data.find((x) => x.uid === key);
    if (!m) return;
    setMuniSearch("");
    patch(muniMode === "germany" ? applyGermanMunicipality(m, lang) : applyFrenchMunicipality(m.municipality));
  };
  const muniComboProps = {
    appearance: FIELD_APPEARANCE,
    // Fill the cell like the dropdowns above it: Fluent's Combobox keeps a ~250 px minimum width
    // of its own, which pushed Municipality past the Country box (PO, 21 Oct 2026).
    className: mergeClasses(controlClass(saving ? "disabled" : "edit"), s.fullWidthCombo),
    freeform: true,
    placeholder: GD_LABELS.municipalityPlaceholder,
    disabled: saving,
    selectedOptions: [] as string[],
    onChange: (e: ChangeEvent<HTMLInputElement>) => setMuniSearch(e.target.value),
    onOptionSelect: (_: unknown, d: { optionValue?: string }) => pickMunicipality(d.optionValue),
  };
  const muniOptions = municipalities.data.map((m) => (
    <Option key={m.uid} value={m.uid} text={m.municipality} data-testid={`general-data-municipality-suggestion-${m.uid}`}>
      {m.municipality}
    </Option>
  ));

  const deleteRow = entities.find((e) => e.key === deleteTarget);
  const panelErrors = draft ? shareholderPanelErrors(draft, entities, lang) : {};
  const panelFull = draft ? shareholderPanelFull(entities, draft) : false;
  const chainErrors = clusterPanel ? milestoneChainErrors(clusterPanel) : {};

  return (
    <div className={l.page}>
      <WriteFeedback progress={writes.progress} error={writes.error} success={writes.success} testIdPrefix="general-data" />

      {/* No "New Project" heading here (PO, 28 Oct 2026): the app header above already reads "New Project". */}
      {/*
        DIVERGENCE (PO, 21 Oct 2026): the canvas grey "General" band
        (`lbl_GeneralData_DisplayProject_Body_General_Content_Label`) is removed, so Basic
        Information starts at the top of the screen. The caption stays in `GD_LABELS.general`.
      */}

      <div className={mergeClasses(s.body, l.fieldLabels, noInvalidOutline.root, requiredMark.root)}>

      {/* ═════════════════════════════════════════════════════════ Basic Information */}
      <section className={s.section} aria-label={GD_LABELS.basicInformation}>
        <GroupHeader title={GD_LABELS.basicInformation} testId="lbl_GeneralData_DisplayProject_Body_General_Content_Basic_Informations" />
        <div className={s.group}>
        <div className={s.row}>
          <ReadOnlyField
            label={GD_LABELS.projectId} value={row?.internalProjectId ?? ""}
            ariaLabel="txt_GeneralData_DisplayProject_Body_General_Content_ProjectID"
            testId="txt_GeneralData_DisplayProject_Body_General_Content_ProjectID"
          />
          <TextField
            label={GD_LABELS.projectName} required={!locks.hideNameAsterisks} value={live.projectName}
            onChange={(v) => patch({ projectName: v })} disabled={saving} readOnly={modes.projectName === "view"}
            maxLength={DEFAULT_MAX_LENGTH} error={errors.projectName}
            ariaLabel="txt_GeneralData_DisplayProject_Body_General_Content_ProjectName"
            testId="txt_GeneralData_DisplayProject_Body_General_Content_ProjectName"
          />
          <TextField
            label={GD_LABELS.shortName} required={!locks.hideNameAsterisks} value={live.shortName}
            onChange={(v) => patch({ shortName: v })} disabled={saving} readOnly={modes.shortName === "view"}
            maxLength={DEFAULT_MAX_LENGTH} error={errors.shortName}
            ariaLabel="txt_GeneralData_DisplayProject_Body_General_Content_ShortName"
            testId="txt_GeneralData_DisplayProject_Body_General_Content_ShortName"
          />
        </div>
        <div className={s.row}>
          <TextField
            label={GD_LABELS.spvName} value={live.spvName}
            onChange={(v) => update((f) => onSpvNameChange(f, baseline, v))} disabled={saving}
            maxLength={DEFAULT_MAX_LENGTH}
            ariaLabel="txt_GeneralData_DisplayProject_Body_General_Content_SPVName"
            testId="txt_GeneralData_DisplayProject_Body_General_Content_SPVName"
          />
          {isSpvLegalStructureVisible(country?.name) ? (
            <ChoiceField
              label={GD_LABELS.spvLegalStructure}
              ariaLabel="drp_GeneralData_DisplayProject_Body_General_Content_SPVLegalStructure"
              testId="drp_GeneralData_DisplayProject_Body_General_Content_SPVLegalStructure"
              required={isSpvLegalStructureRequired(country?.name, live.spvName)}
              error={errors.spvLegalStructure} disabled={saving}
              value={live.spvLegalStructure === null ? "" : String(live.spvLegalStructure)}
              options={optionsOf(SPV_LEGAL_STRUCTURE_LABEL)}
              onSelect={(v) => patch({ spvLegalStructure: v ? Number(v) : null })}
            />
          ) : null}
          {isSpvCompanyCodeVisible(live.spvName) ? (
            <TextField
              label={GD_LABELS.spvCompanyCode} required value={live.spvCompanyCode}
              onChange={(v) => patch({ spvCompanyCode: v })} disabled={saving}
              maxLength={SPV_CODE_MAX_LENGTH} error={errors.spvCompanyCode}
              ariaLabel="txt_GeneralData_DisplayProject_Body_General_Content_SPVCompanyCode"
              testId="txt_GeneralData_DisplayProject_Body_General_Content_SPVCompanyCode"
            />
          ) : null}
        </div>
        <div className={s.row}>
          <ChoiceField
            label={GD_LABELS.technology} required error={errors.technology}
            ariaLabel="drp_GeneralData_DisplayProject_Body_TechnologyTab_Content_Technology"
            testId="drp_GeneralData_DisplayProject_Body_TechnologyTab_Content_Technology"
            disabled={saving} readOnly={locks.technology} value={live.technology ?? ""} valueLabel={live.technology ?? ""}
            options={TECHNOLOGY_OPTIONS.map((t) => ({ value: t, label: t }))}
            onSelect={(v) => patch({ technology: v })}
          />
          <ChoiceField
            label={GD_LABELS.projectType}
            ariaLabel="drp_GeneralData_DisplayProject_Body_General_Content_ProjectType"
            testId="drp_GeneralData_DisplayProject_Body_General_Content_ProjectType"
            disabled={saving} value={live.projectType === null ? "" : String(live.projectType)}
            options={optionsOf(PROJECT_TYPE_LABEL)}
            onSelect={(v) => patch({ projectType: v ? Number(v) : null })}
          />
        </div>
        <div className={s.row}>
          <PeoplePicker
            label={GD_LABELS.projectManager} placeholder={GD_LABELS.projectManagerHint}
            tooltip={GD_LABELS.projectManagerTooltip}
            ariaLabel="pcf_GeneralData_DisplayProject_Body_General_Content_Manager_PeoplePicker"
            testId="pcf_GeneralData_DisplayProject_Body_General_Content_Manager_PeoplePicker"
            value={personFor(live.managerEntraRowId, live.managerName)}
            onChange={(next) => patch({ managerEntraRowId: next[0]?.id ?? null, managerName: next[0]?.displayName ?? null })}
            onPick={(p) => { remember(p); return [p]; }}
            maxPeople={1} term={managerSearch} onTermChange={setManagerSearch}
            suggestions={managers.data} required errorMessage={errors.manager} disabled={saving}
          />
          <PeoplePicker
            label={GD_LABELS.deputyProjectManager} placeholder={GD_LABELS.deputyProjectManagerHint}
            tooltip={GD_LABELS.deputyProjectManagerTooltip}
            ariaLabel="pcf_GeneralData_DisplayProject_Body_General_Content_Deputy_Manager_PeoplePicker"
            testId="pcf_GeneralData_DisplayProject_Body_General_Content_Deputy_Manager_PeoplePicker"
            value={personFor(live.deputyManagerEntraRowId, live.deputyManagerName)}
            onChange={(next) => patch({ deputyManagerEntraRowId: next[0]?.id ?? null, deputyManagerName: next[0]?.displayName ?? null })}
            onPick={(p) => { remember(p); return [p]; }}
            maxPeople={1} term={deputySearch} onTermChange={setDeputySearch}
            suggestions={deputies.data} disabled={saving}
          />
        </div>
        <div className={s.row}>
          <ChoiceField
            label={GD_LABELS.developmentType} required error={errors.developmentType}
            ariaLabel="drp_GeneralData_DisplayProject_Body_TechnologyTab_Content_ProjectDevelopment"
            testId="drp_GeneralData_DisplayProject_Body_TechnologyTab_Content_ProjectDevelopment"
            disabled={saving || locks.developmentType}
            value={live.developmentType === null ? "" : String(live.developmentType)}
            options={optionsOf(DEVELOPMENT_TYPE_LABEL)}
            onSelect={(v) => update((f) => onDevelopmentTypeChange(f, baseline, snapshot, v ? Number(v) : null))}
          />
        </div>

        </div>

        {acquired ? (
          <>
            <GroupHeader title={GD_LABELS.acquisitionInformation} testId="lbl_GeneralData_DisplayProject_Body_General_Content_Basic_Aquisition_Details" />
            <div className={mergeClasses(s.row, s.acquisitionRow, errors.acquisitionDate && s.acquisitionRowError)}>
              <ChoiceField
                label={GD_LABELS.startCluster} required error={errors.startCluster}
                ariaLabel="drp_GeneralData_DisplayProject_Body_General_Content_ClusterChange"
                testId="drp_GeneralData_DisplayProject_Body_General_Content_ClusterChange"
                disabled={saving || locks.startCluster}
                value={live.startCluster === null ? "" : String(live.startCluster)}
                valueLabel={live.startCluster === null ? "" : CLUSTER_STATE_LABEL[live.startCluster]}
                options={START_CLUSTER_OPTIONS.map((n) => ({ value: String(n), label: CLUSTER_STATE_LABEL[n]! }))}
                onSelect={(v) => patch({ startCluster: v ? Number(v) : null })}
              />
              {/* `ModernDatePicker@1.0.1`, no `Format`: the long date (modern controls sweep). */}
              <DateField
                label={GD_LABELS.acquisitionDate} required
                error={errors.acquisitionDate}
                format={MODERN_DATE_PICKER_FORMAT}
                locale={lang}
                ariaLabel={GD_LABELS.acquisitionDate}
                testId="dte_GeneralData_DisplayProject_Body_General_Content_Acquisition_Date"
                disabled={saving || locks.acquisitionDate}
                value={live.acquisitionDate}
                onChange={(v) => patch({ acquisitionDate: v })}
              />
              <TextField
                label={acquisitionPriceLabel(country?.name)} required
                value={live.acquisitionPrice} disabled={saving}
                onChange={(v) => patch({ acquisitionPrice: v })}
                error={errors.acquisitionPrice}
                testId="txt_GeneralData_DisplayProject_Body_TechnologyTab_Content_AcquisitionPrice"
              />
            </div>
          </>
        ) : null}
      </section>

      {/* ═════════════════════════════════════════════════════════════════ Placement */}
      <section className={s.section} aria-label={GD_LABELS.placement}>
        <GroupHeader title={GD_LABELS.placement} testId="lbl_GeneralData_DisplayProject_Body_General_Content_Basic_Placement" />
        <div className={s.placement}>
          <div className={s.placementFields}>
            <div className={mergeClasses(s.row, s.placementRow)}>
              <ChoiceField
                label={GD_LABELS.country} required error={errors.country}
                ariaLabel="drp_GeneralData_DisplayProject_Body_General_Content_Country"
                testId="drp_GeneralData_DisplayProject_Body_General_Content_Country"
                disabled={saving} readOnly={countryMode === "view"} value={live.countryId ?? ""}
                valueLabel={country?.name ?? ""}
                options={countryList.map((c) => ({ value: c.id, label: c.name }))}
                onSelect={(v) => { setMuniSearch(""); update((f) => onCountryChange(f, baseline, v)); }}
              />
              <ChoiceField
                label={GD_LABELS.area} required={areaRequired} error={errors.area}
                ariaLabel="drp_GeneralData_DisplayProject_Body_General_Content_Area"
                testId="drp_GeneralData_DisplayProject_Body_General_Content_Area"
                disabled={saving} readOnly={modes.area === "view"} value={live.areaId ?? ""}
                options={selectedAreas.data.map((a) => ({ value: a.id, label: a.name }))}
                onSelect={(v) => { setMuniSearch(""); update((f) => onAreaChange(f, baseline, v)); }}
              />
              <TextField
                label={GD_LABELS.district} value={live.district} disabled={saving}
                onChange={(v) => patch({ district: v })} maxLength={DEFAULT_MAX_LENGTH}
                ariaLabel="txt_GeneralData_DisplayProject_Body_General_Content_District"
                testId="txt_GeneralData_DisplayProject_Body_General_Content_District"
              />
            </div>
            <div className={mergeClasses(s.row, s.placementRow)}>
              {muniMode === "text" ? (
                <TextField
                  label={GD_LABELS.municipality} value={live.municipality} disabled={saving}
                  onChange={(v) => patch({ municipality: v })} maxLength={DEFAULT_MAX_LENGTH}
                  ariaLabel="txt_GeneralData_DisplayProject_Body_General_Content_Municipality"
                  testId="txt_GeneralData_DisplayProject_Body_General_Content_Municipality"
                />
              ) : (
                <div>
                  {/* `cmb_…_Municipality_Germany` / `_France_1` are `ModernCombobox@1.1.1`: a searchable list. */}
                  <Field
                    className={skin.field}
                    label={GD_LABELS.municipality} required={muniRequired}
                    validationState={errors.municipalityGermany ?? errors.municipalityFrance ? "error" : "none"}
                    validationMessage={errors.municipalityGermany ?? errors.municipalityFrance}
                  >
                    {muniMode === "germany" ? (
                      <Combobox
                        {...muniComboProps}
                        aria-label="cmb_GeneralData_DisplayProject_Body_General_Content_Municipality_Germany"
                        data-testid="cmb_GeneralData_DisplayProject_Body_General_Content_Municipality_Germany"
                        value={muniSearch || (live.municipalityGermany ?? "")}
                      >
                        {muniOptions}
                      </Combobox>
                    ) : (
                      <Combobox
                        {...muniComboProps}
                        aria-label="cmb_GeneralData_DisplayProject_Body_General_Content_Municipality_France"
                        data-testid="cmb_GeneralData_DisplayProject_Body_General_Content_Municipality_France_1"
                        value={muniSearch || (live.municipalityFrance ?? "")}
                      >
                        {muniOptions}
                      </Combobox>
                    )}
                  </Field>
                </div>
              )}
              {country?.name === "Germany" ? (
                <TextField
                  label={GD_LABELS.taxFactor} value={live.taxFactor} disabled={saving}
                  onChange={(v) => patch({ taxFactor: v })} maxLength={DEFAULT_MAX_LENGTH} counter={false}
                  error={errors.taxFactor}
                  ariaLabel="txt_GeneralData_DisplayProject_Body_General_Content_Tax_Factor"
                  testId="txt_GeneralData_DisplayProject_Body_General_Content_Tax_Factor"
                />
              ) : null}
              <ChoiceField
                label={GD_LABELS.terrainUtilization}
                ariaLabel="drp_GeneralData_DisplayProject_Body_General_Content_TerrainUt"
                testId="drp_GeneralData_DisplayProject_Body_General_Content_TerrainUt"
                disabled={saving} value={live.utilizationId ?? ""}
                options={utilizations.data.map((u) => ({ value: u.id, label: u.label }))}
                onSelect={(v) => patch({ utilizationId: v })}
              />
              {terrainVisible ? (
                <TextField
                  label={GD_LABELS.terrainSize} required value={live.terrainSize} disabled={saving}
                  onChange={(v) => patch({ terrainSize: v })}
                  error={errors.terrainSize}
                  ariaLabel="txt_GeneralData_DisplayProject_Body_General_Content_TerrainSize"
                  testId="txt_GeneralData_DisplayProject_Body_General_Content_TerrainSize"
                />
              ) : null}
            </div>
            <div className={mergeClasses(s.row, s.placementRow, s.latLngRow)}>
              <TextField
                label={GD_LABELS.latitude} required value={live.latitude} disabled={saving}
                onChange={(v) => patch({ latitude: v })} maxLength={LAT_MAX_LENGTH} counter={false} align="right"
                error={errors.latitude}
                ariaLabel="txt_GeneralData_DisplayProject_Body_General_Content_Latitude"
                testId="txt_GeneralData_DisplayProject_Body_General_Content_Latitude"
              />
              <TextField
                label={GD_LABELS.longitude} required value={live.longitude} disabled={saving}
                onChange={(v) => patch({ longitude: v })} maxLength={LNG_MAX_LENGTH} counter={false} align="right"
                error={errors.longitude}
                ariaLabel="txt_GeneralData_DisplayProject_Body_General_Content_Longitude"
                testId="txt_GeneralData_DisplayProject_Body_General_Content_Longitude"
              />
            </div>
          </div>
          <div className={s.mapCell}>
            <div className={s.map} aria-hidden="true" data-testid="map_con_GeneralData_DisplayProject_Body_General_Content_Map" />
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════ Shareholding Entity */}
      <section className={s.section} aria-label={GD_LABELS.shareholdingEntity}>
        <GroupHeader title={GD_LABELS.shareholdingEntity} testId="lbl_GeneralData_DisplayProject_Body_General_Content_Basic_Shareholding_Entities" />
        <div className={s.shareGroup}>
        <div className={s.shareBar}>
          <Button
            appearance="transparent" icon={<AddFilled />} className={s.addButton}
            aria-label="btn_general_data_shareholding_entity_add_new"
            data-testid="btn_general_data_shareholding_entity_add_new"
            disabled={saving || !canAddShareholder(entities)}
            onClick={() => {
              newKey.current += 1;
              setDraft({ key: `new-${newKey.current}`, entityTypeValue: null, customName: "", percent: "", originalTypeValue: null, dirty: false });
            }}
          >
            {GD_LABELS.add}
          </Button>
          <span className={s.shareNote} data-testid="lbl_AdminContract_Last_Apply_All_Tracking_1">
            <InfoRegular aria-hidden="true" className={s.shareNoteIcon} />
            <span>{MSG.shareholdingSum}</span>
          </span>
        </div>
        <div className={s.shareTableBox}>
          <Table aria-label={GD_LABELS.shareholdingEntity} className={s.shareTable} data-testid="gal_GeneralData_DisplayProject_Body_General_Content_ShareholdingEntities">
            <TableHeader>
              <TableRow>
                <TableHeaderCell>{GD_LABELS.columnDescription}</TableHeaderCell>
                <TableHeaderCell className={s.ownershipColumn}>{GD_LABELS.columnOwnership}</TableHeaderCell>
                <TableHeaderCell className={s.actionsColumn}>{GD_LABELS.columnActions}</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entities.map((e) => (
                <TableRow key={e.key}>
                  <TableCell>{shareholdingDescription(e)}</TableCell>
                  <TableCell className={s.ownershipColumn}>{formatOwnership(e.ownership, lang)}</TableCell>
                  <TableCell>
                    <div className={s.actions}>
                      {/* The canvas button is 20 × 20, so only its icon shows; the caption is the tooltip. */}
                      <Button
                        appearance="transparent" size="small" icon={<EditFilled />} className={s.rowIcon}
                        title={GD_LABELS.edit}
                        aria-label="btn_general_data_shareholding_entity_Edit"
                        data-testid="btn_general_data_shareholding_entity_Edit"
                        disabled={saving}
                        onClick={() => setDraft({
                          key: e.key, recordId: e.recordId, entityTypeValue: e.entityTypeValue,
                          customName: e.customName, percent: ownershipInputText(e.ownership, lang),
                          originalTypeValue: e.entityTypeValue, dirty: false,
                        })}
                      />
                      <Button
                        appearance="transparent" size="small" icon={<DeleteFilled />} className={s.rowIcon}
                        title={GD_LABELS.delete}
                        aria-label="btn_general_data_shareholding_entity_Delete"
                        data-testid="btn_general_data_shareholding_entity_Delete"
                        disabled={saving}
                        onClick={() => setDeleteTarget(e.key)}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        </div>
      </section>
      </div>

      {/* ═════════════════════════════════════════════════════ buttons + record stamp */}
      {/* `con_…_Body_Content_Buttom`: the buttons first (`con_…_Body_Content_Buttons`), the record stamp right. */}
      <div className={mergeClasses(l.bottomBar, s.footer)}>
        <div className={s.buttons}>
          <Button
            icon={<DismissRegular />} className={l.outlineButton}
            aria-label="pcf_btn_GeneralData_DisplayProject_Body_Buttons_Reset"
            data-testid="pcf_btn_GeneralData_DisplayProject_Body_Buttons_Reset"
            disabled={saving}
            onClick={cancel}
          >
            {GD_LABELS.cancel}
          </Button>
          <Button
            appearance="primary" icon={<CheckmarkRegular />} className={l.button}
            aria-label="pcf_btn_GeneralData_DisplayProject_Body_Buttons_Save"
            data-testid="pcf_btn_GeneralData_DisplayProject_Body_Buttons_Save"
            title={blockReason ?? undefined}
            disabled={!saveEnabled}
            onClick={save}
          >
            {GD_LABELS.save}
          </Button>
          {required.length > 0 ? (
            <span className={s.required}>
              <Tooltip content={<span className={s.multiline}>{required.join("\n")}</span>} relationship="description">
                <Button
                  appearance="transparent" size="small" icon={<InfoRegular />}
                  aria-label={GD_LABELS.requiredFields}
                  data-testid="ibtn_GeneralData_DisplayProject_Body_Buttons_Requered_Fileds"
                />
              </Tooltip>
              <span data-testid="lbl_GeneralData_DisplayProject_Body_General_Content_ProjectName_ErrorMessage_2">
                {GD_LABELS.requiredFields}
              </span>
            </span>
          ) : null}
          {blockReason ? <Text className={s.blocked} data-testid="general-data-save-blocked">{blockReason}</Text> : null}
        </div>
        <div className={mergeClasses(l.stamp, s.stampBox)}>
          {/* Canvas names verbatim, including their doubled "Buttonscon_" prefix. */}
          <div className={s.stampGrid}>
            <span className={mergeClasses(l.stampLabel, s.stampLabelCell)} data-testid="lbl_GeneralData_DisplayProject_Body_Content_Buttonscon_GeneralData_DisplayProject_Body_Content_Creator">{GD_LABELS.createdBy}</span>
            <span className={s.stampValue} data-testid="lbl_GeneralData_DisplayProject_Body_Content_Buttonscon_GeneralData_DisplayProject_Body_Content_CreatorName">
              <span>{createdBy?.name ?? ""}</span><span>{createdBy?.when ?? ""}</span>
            </span>
            <span className={mergeClasses(l.stampLabel, s.stampLabelCell)} data-testid="lbl_GeneralData_DisplayProject_Body_Content_Buttonscon_GeneralData_DisplayProject_Body_Content_Editor">{GD_LABELS.modifiedBy}</span>
            <span className={s.stampValue} data-testid="lbl_GeneralData_DisplayProject_Body_Content_Buttonscon_GeneralData_DisplayProject_Body_Content_EditorName">
              <span>{modifiedBy?.name ?? ""}</span><span>{modifiedBy?.when ?? ""}</span>
            </span>
          </div>
        </div>
      </div>

      {/* ───────────────────────────────────────────────────── shareholding panel */}
      <FormPanel
        open={draft !== null}
        title={GD_LABELS.shareholderPanelTitle}
        width="narrow"
        onDismiss={() => setDraft(null)}
        footer={<PanelButtons
          onSave={saveDraft} onCancel={() => setDraft(null)}
          disabled={!draft || !canSaveShareholderPanel(draft, entities, lang)}
          saveTestId="pcf_btn_GeneralData_RightPanel_ShareholdingEntity_Form_Buttons_Save"
          cancelTestId="pcf_btn_GeneralData_RightPanel_ShareholdingEntity_Form_Buttons_Cancel" />}
      >
        {draft ? (
          <div className={s.panelFields}>
            {panelFull ? (
              <Text className={s.error} data-testid="lbl_GeneralData_RightPanel_ShareholdingEntity_InpForm_BodyForm_Percentage_ErrorMessage_1">
                {shareholdingSum(entities) === 1 ? shareholdingFullMessage(shareholdingSum(entities)) : ""}
              </Text>
            ) : (
              <>
                {panelErrors.duplicate ? (
                  <Text className={s.error} data-testid="lbl_ShareholderEntity_Error_GeneralTab">{panelErrors.duplicate}</Text>
                ) : null}
                {/* SOURCE DEFECT: the canvas AccessibleLabel is "hareholder Entity" (Y:6351); corrected by PO decision. */}
                {/* canvas-identity-ignore: PO decision 19 Oct (D25) — canvas AccessibleLabel typo "hareholder Entity" corrected */}
                <ChoiceField
                  label={GD_LABELS.shareholderEntity} required
                  ariaLabel={GD_LABELS.shareholderEntity}
                  testId="drp_GeneralData_RightPanel_ShareholdingEntity_InpForm_BodyForm_EntityName"
                  disabled={false}
                  value={draft.entityTypeValue === null ? "" : String(draft.entityTypeValue)}
                  options={SHAREHOLDER_ENTITY_TYPE_LABEL.map(([v, l]) => ({ value: String(v), label: l }))}
                  onSelect={(v) => setDraft({ ...draft, entityTypeValue: v ? Number(v) : null, dirty: true })}
                />
                {isThirdParty(draft.entityTypeValue) ? (
                  <TextField
                    label={GD_LABELS.customShareholderEntity} required value={draft.customName}
                    maxLength={DEFAULT_MAX_LENGTH} error={panelErrors.customName}
                    onChange={(v) => setDraft({ ...draft, customName: v, dirty: true })}
                    testId="txt_GeneralData_RightPanel_ShareholdingEntity_InpForm_BodyForm_CustomName"
                  />
                ) : null}
                <TextField
                  label={GD_LABELS.ownershipPercent} required value={draft.percent}
                  maxLength={PERCENT_MAX_LENGTH} counter={false} error={panelErrors.percent}
                  onChange={(v) => setDraft({ ...draft, percent: v, dirty: true })}
                  ariaLabel="Ownership"
                  testId="txt_GeneralData_RightPanel_ShareholdingEntity_InpForm_BodyForm_Percentage"
                />
              </>
            )}
          </div>
        ) : null}
      </FormPanel>

      {/* ──────────────────────────────────────────────────── cluster-change panel */}
      <FormPanel
        open={clusterPanel !== null}
        title={GD_LABELS.clusterChange}
        width="narrow"
        closeTestId="ico_ClusterChange_RightPanel_Header_Close"
        closeLabel={GD_LABELS.closeClusterChange}
        onDismiss={() => setClusterPanel(null)}
        footer={
          <PanelButtons
            onSave={() => void saveClusterPanel()} onCancel={() => setClusterPanel(null)}
            disabled={!clusterPanel || !canSaveClusterPanel(clusterPanel)}
            saveTestId="but_ClusterChange_RightPanel_Footer_Save"
            cancelTestId="but_ClusterChange_RightPanel_Footer_Cancel"
            saveLabel="but_ClusterChange_RightPanel_Footer_Save"
            cancelLabel="but_ClusterChange_RightPanel_Footer_Cancel" />
        }
      >
        {clusterPanel ? (
          <div className={s.panelFields}>
            <Text data-testid="lbl_ClusterChange_RightPanel_Info">{clusterPanelInfo(clusterPanel)}</Text>
            {CLUSTER_PANEL_FIELDS.filter((f) => clusterPanelVisible(f, clusterPanel)).map((field) => (
              <Field
                key={field} label={clusterLabel(field)} required
                validationState={chainErrors[field] ? "error" : "none"}
                validationMessage={chainErrors[field]}
              >
                <div className={s.dateRow}>
                  {calendarAddVisible(field, clusterPanel, snapshot?.technology) ? (
                    <Button
                      icon={<CalendarAddRegular />}
                      aria-label={`but_Milestones_DisplayProject_Body_General_Content_${field === "cluster2" ? "Cluster2" : field === "cluster3" ? "Cluster3" : "Cluster4"}`}
                      data-testid={`but_Milestones_DisplayProject_Body_General_Content_${field === "cluster2" ? "Cluster2" : field === "cluster3" ? "Cluster3" : "Cluster4"}_1`}
                      disabled={!clusterPanel.dates[CALENDAR_ADD_SOURCE[field]!.prev]}
                      onClick={() => setClusterPanel(applyCalendarAdd(clusterPanel, field, durations))}
                    />
                  ) : null}
                  {/* `ModernDatePicker@1.0.1`, no `Format`: the long date (modern controls sweep). */}
                  <DateInput
                    className={s.panelDate}
                    format={MODERN_DATE_PICKER_FORMAT}
                    locale={lang}
                    standard={clusterPanelDateIsStandard(field, clusterPanel)}
                    ariaLabel={clusterPanelAria(field)}
                    testId={CLUSTER_PANEL_TESTID[field]}
                    placeholder={field === "startDate" ? GD_LABELS.startDatePlaceholder : GD_LABELS.datePlaceholder}
                    disabled={!clusterPanelEditable(field, clusterPanel)}
                    invalid={Boolean(chainErrors[field])}
                    value={clusterPanel.dates[field]}
                    onChange={(v) => setClusterPanel({
                      ...clusterPanel,
                      dates: { ...clusterPanel.dates, [field]: v },
                      standardAssumption: { ...clusterPanel.standardAssumption, [field]: false },
                    })}
                  />
                </div>
              </Field>
            ))}
          </div>
        ) : null}
      </FormPanel>

      <ConfirmDialog
        open={deleteTarget !== null}
        title={DELETE_SHAREHOLDER_DIALOG.title}
        description={deleteShareholderDescription(deleteRow ? deleteShareholderName(deleteRow) : "")}
        confirmText={DELETE_SHAREHOLDER_DIALOG.confirm}
        cancelText={DELETE_SHAREHOLDER_DIALOG.cancel}
        confirmIcon="delete"
        destructive
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
      {/* `cmp_PopUp_Leave_…_Confirmation` — the shared leave guard (D35, PO X1). */}
      <UnsavedChangesGuard when={shouldConfirmLeave(isDirty)} dialog={LEAVE_DIALOG} />
    </div>
  );
}
