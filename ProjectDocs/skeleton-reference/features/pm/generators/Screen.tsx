/**
 * Project Generators Screen — layout and composition only.
 *
 * Canvas screen: `Project Generators Screen` (PM app)
 *   642 controls · 15 931 lines of Power Fx · 190 substantive blocks · band XL
 *
 * Seven collapsible equipment cards (WTG, PV module, inverter, substructure, BESS,
 * hydrogen, substation), one command bar whose `Items` table carries every permission
 * rule, one `FormPanel` host that swaps its body by the selected family, and the
 * individual-turbine grid under the WTG card.
 *
 * WHAT WAS DELETED AS A WORKAROUND
 *  - `colGeneratorTypesPagging` and the `"LoadNextPage" & Text(Rand())` pager event; the
 *    data layer pages properly. `GENERATORS_PAGE_SIZE` survives as the server page size.
 *  - Seven near-identical right-panel group containers (~300 controls between them);
 *    one `<FormPanel>` whose body is chosen by `panel.family`.
 *  - Six copies of the permission-state colour `Switch` — one `permissionStateTone`.
 *  - Two duplicated height-limitation `OnConfirm` handlers that replayed the entire
 *    ~300-line save body; one `save({ heightApproved: true })` call.
 *  - The hidden dispatch buttons `btn_AutomatedFlow_TriggerWork_ForWTG_PV`,
 *    `btn_Trigger_New_AllocateWTGs_To_Land_Lease` and
 *    `btn_GeneratorData_RightPanel_Form_Generator_Buttons_Reset`, which existed only so
 *    `Select(...)` could be used as a subroutine call.
 *
 * Every rule this screen branches on lives in `rules.ts`.
 */
import { useMemo, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import {
  Field, Input, Dropdown, Option, Combobox, Switch, Checkbox, Text, Badge, MessageBar,
  MessageBarBody, MessageBarTitle, MessageBarActions, Button, Radio, Tooltip,
  makeStyles, tokens,
} from "@fluentui/react-components";
import {
  AddRegular, DeleteRegular, EditRegular, LockClosedRegular, InfoRegular,
  ChevronDownRegular, ChevronRightRegular, PlayRegular, PauseRegular, DismissRegular,
  ArrowSyncRegular,
} from "@fluentui/react-icons";
import {
  PageHeader, Card, CommandBar, FormPanel, ConfirmDialog, LoadingOverlay, DataGrid,
  NumericInput, CurrencyInput, PercentageInput, TextFieldWithCount, StateChip, EmptyState,
  SelectProjectPrompt, StatTiles,
  type Command, type Column,
} from "@/components";
import { useProjectContext } from "@/features/shared/useProjectContext";
import { a11yFor, type A11yAttrs, type CanvasA11yControl } from "@/a11y";
import { space, media, semantic } from "@/theme/tokens";
import { CHOICE_PLANT } from "@/data/entities";
import {
  PAGE_LOCK_TITLE, pageLock, isPageLocked, cascadeOptions, isDummySupplier, resolveModel,
  commandBarState, LAST_CAPACITY_TITLES,
  LAST_CAPACITY_MESSAGES, heightLimitExceeded, canOverrideHeightLimit, heightBlocksSave,
  HEIGHT_LIMIT_PM_MESSAGE, overHeightLimit, countOverHeightLimit, validateTypeForm,
  canSaveType, canSaveTurbine, validateTurbineName, validateEffectiveCapacity,
  validateEffectiveHubHeight, permissionStateLabel, permissionStateTone, editedTotalHeight,
  newTurbineHeights, fmtCapacity, fmtHubHeight, fmtHeight, fmtCurrency, numericOr,
  pageCount, GENERATORS_PAGE_SIZE,
  TOTAL_CAPACITY_LABEL, catalogTotalHeight, typeSummaryTooltip, TYPE_DETAIL_FIELD_LABELS,
  ADD_GENERATOR_LABEL,
  TURBINE_TABLE_LABELS, GENERATOR_TYPE_SAVED_BANNER,
  PV_PANEL_TITLES, PV_FIELD_LABELS, PV_SUPPLIER_PLACEHOLDER, PV_MODULE_LABEL_MAX_LENGTH,
  PV_TYPE_COL, validatePvTypeForm, canSavePvType, pvSupplierOptions, buildPvTypeFields,
  capacityGuardReason, opexDependencyMessage, REPLACE_LABELS, REPLACE_MSG, replaceGeneratorTitle,
  replacePvTitle, replaceProgressText, replacePvProgressText, replaceSuccessText, replaceErrorText,
  replaceWtgSaveable, replacePvSaveable,
  type CapacityGuardReason, type ReplaceWtgForm, type ReplacePvForm,
  type GeneratorCommandKey, type PlantFamily, type GeneratorTypeRow, type TurbineRow,
  type SimpleTypeRow, type TypeFormState, type TurbineFormState, type ProjectedModel,
  type PvTypeFormState,
} from "./rules";
import {
  useGeneratorsProject, useProjectPlanning, useGeneratorCatalog, useInflationIndex,
  useDeviceCosts, useGeneratorTypes, useTurbines, usePvModuleTypes, useInverterTypes,
  useSubstructureTypes, useStorageTypes, useHydrogenTypes, useSubstationTypes,
  useAllocatableLandLeaseCosts, useSaveGeneratorType, useSaveTurbine, useDeleteTurbine,
  useDeleteGeneratorType, useToggleTypeStatus, useSaveSimpleType, useDeleteSimpleType,
  useEntraObjectId, useDerivedCostPerWtg, buildFamilyRollUp,
  useOpexDependency, useReplaceGeneratorType, useReplacePvModuleType,
} from "./hooks";

/** G-A11Y — this screen's canvas accessibility identities. */
const a11y = a11yFor("Project Generators Screen");
type GeneratorsControl = CanvasA11yControl<"Project Generators Screen">;

/**
 * G-A11Y — the canvas card controls behind each single-row family's row: the selection dot,
 * and the capacity / cost read-outs as `[control, caption]` (`null` = the canvas card has no
 * such read-out). A caption of `null` keeps the card control's own AccessibleLabel. Two
 * canvas cards copied a sibling's label — hydrogen's capacity reads "Generators Capacity
 * [MW]" and substation's "Total Module Type Capacity [MWp]" — so those take the matching
 * panel field's AccessibleLabel instead
 * (`txt_GeneratorData_RightPanel_Form_Hydrogen_Fields_HydrogenCapacityMW_2.AccessibleLabel`,
 * `txt_GeneratorData_RightPanel_Form_Substation_Fields_SubstationCapacityMW_2.AccessibleLabel`).
 */
const FAMILY_A11Y = {
  pv: {
    select: "img_Generators_DisplayProject_Body_Form_PvModule_CardHeader_RowSelectionDot",
    capacity: ["txt_Generators_DisplayProject_Body_Form_PvModule_CardDetails_TotalModuleTypeCapacity", null],
    cost: ["txt_Generators_DisplayProject_Body_Form_PvModule_CardDetails_TotalModuleTypeCost", null],
  },
  inverter: {
    select: "img_Generators_DisplayProject_Body_Form_Invertors_CardHeader_RowSelectionDot",
    capacity: null,
    cost: ["txt_Generators_DisplayProject_Body_Form_Inverters_CardDetails_CostPerInverter", null],
  },
  substructure: {
    select: "img_Generators_DisplayProject_Body_Form_Substructure_CardHeader_RowSelectionDot",
    capacity: null,
    cost: ["txt_Generators_DisplayProject_Body_Form_Substructure_CardDetails_SubstructureCost", null],
  },
  storage: {
    select: "img_Generators_DisplayProject_Body_Form_Storage_CardHeader_RowSelectionDot_1",
    capacity: ["txt_Generators_DisplayProject_Body_Form_Storage_CardDetails_StorageCapacity_2", null],
    cost: null,
  },
  hydrogen: {
    select: "img_Generators_DisplayProject_Body_Form_Hydrogen_CardHeader_RowSelectionDot",
    capacity: ["txt_Generators_DisplayProject_Body_Form_Storage_CardDetails_HydrogenCapacity", "Hydrogen Capacity [MW]"],
    cost: null,
  },
  substation: {
    select: "img_Generators_DisplayProject_Body_Form_Substation_CardHeader_RowSelectionDot_1",
    capacity: ["txt_Generators_DisplayProject_Body_Form_Storage_CardDetails_SubstationCapacity_1", "Substation Capacity [MW]"],
    cost: null,
  },
} as const satisfies Record<
  Exclude<PlantFamily, "wtg">,
  {
    select: GeneratorsControl;
    capacity: readonly [GeneratorsControl, string | null] | null;
    cost: readonly [GeneratorsControl, string | null] | null;
  }
>;

/** The capacity / cost read-out attributes for one family row; nothing when the card has none. */
function familyA11y(family: Exclude<PlantFamily, "wtg">, field: "capacity" | "cost"): Partial<A11yAttrs> {
  const entry: readonly [GeneratorsControl, string | null] | null = FAMILY_A11Y[family][field];
  return entry ? a11y(entry[0], entry[1] ?? undefined) : {};
}

const useStyles = makeStyles({
  stack: { display: "flex", flexDirection: "column", gap: space.l, minWidth: 0 },
  cards: { display: "flex", flexDirection: "column", gap: space.m, minWidth: 0 },
  cardHead: {
    display: "flex", alignItems: "center", gap: space.s, flexWrap: "wrap", minWidth: 0,
  },
  cardTitle: { fontWeight: 600, fontSize: "14px" },
  meta: {
    display: "flex", gap: space.l, flexWrap: "wrap",
    color: tokens.colorNeutralForeground3, fontSize: "12px",
    fontVariantNumeric: "tabular-nums",
  },
  fold: { cursor: "pointer", display: "flex", alignItems: "center", gap: space.xs },
  panel: { display: "flex", flexDirection: "column", gap: space.m },
  grid2: {
    display: "grid", gap: space.m, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
    [media.belowMd]: { gridTemplateColumns: "1fr" },
  },
  lock: { display: "flex", flexDirection: "column", gap: space.xs },
  errors: {
    display: "flex", flexDirection: "column", gap: "2px",
    color: semantic.errorText, fontSize: "12px",
  },
  readField: { display: "flex", flexDirection: "column", gap: space.xxs, minWidth: 0 },
  readLabel: {
    fontSize: "12px", fontWeight: 600, color: tokens.colorNeutralForeground1,
  },
  readBox: {
    padding: space.s, borderRadius: "4px",
    backgroundColor: tokens.colorNeutralBackground3, fontSize: "13px",
    fontVariantNumeric: "tabular-nums", minHeight: "20px",
  },
  derived: {
    display: "flex", justifyContent: "space-between", gap: space.s,
    padding: space.s, borderRadius: "4px",
    backgroundColor: tokens.colorNeutralBackground3, fontSize: "12px",
    fontVariantNumeric: "tabular-nums",
  },
  tag: { display: "inline-flex", alignItems: "center", gap: "4px" },
  hint: { color: tokens.colorNeutralForeground3, fontSize: "11px" },
});

const emptyTypeForm = (): TypeFormState => ({
  supplier: null, turbineType: null, hubHeight: null, revisedHubHeight: "",
  numberOfGenerators: "", cost: "", dirty: new Set<string>(),
});

const emptyTurbineForm = (): TurbineFormState => ({
  nameIndex: "", effectiveCapacity: "", effectiveHubHeight: "", foundationPlinth: "",
  dirty: new Set<string>(),
});

const emptyPvTypeForm = (): PvTypeFormState => ({
  moduleLabel: "", capacity: "", supplier: null,
  degradation1stYear: "", degradationRemainingYears: "", dirty: new Set<string>(),
});

interface PanelState {
  family: PlantFamily | null;
  mode: "type" | "turbine";
  typeId: string | null;
  turbineId: string | null;
}

const CLOSED: PanelState = { family: null, mode: "type", typeId: null, turbineId: null };

export default function GeneratorsScreen() {
  const s = useStyles();
  const navigate = useNavigate();
  const { project: selected, canEdit, isLoading: contextLoading } = useProjectContext();
  const projectId = selected?.projectId;
  const entraObjectId = useEntraObjectId();

  const { project, plantPvCapacity: projectPvCapacity, isLoading: projectLoading } =
    useGeneratorsProject(projectId);
  const { planning } = useProjectPlanning(projectId);
  const { models, isLoading: catalogLoading } = useGeneratorCatalog(project);
  const { accumulatedIndex } = useInflationIndex(project);
  const deviceCosts = useDeviceCosts(project?.countryId);
  const { types, isLoading: typesLoading } = useGeneratorTypes(projectId);
  const pv = usePvModuleTypes(projectId);
  const inverters = useInverterTypes(projectId);
  const substructures = useSubstructureTypes(projectId);
  const storage = useStorageTypes(projectId);
  const hydrogen = useHydrogenTypes(projectId);
  const substation = useSubstationTypes(projectId);
  const { costs: allocatableCosts } = useAllocatableLandLeaseCosts(projectId);

  const [folded, setFolded] = useState<Record<string, boolean>>({});
  const expandedTypeIds = useMemo(
    () => types.filter((t) => !folded[t.id]).map((t) => t.id),
    [types, folded],
  );
  const { byType, isLoading: turbinesLoading } = useTurbines(expandedTypeIds);

  const [panel, setPanel] = useState<PanelState>(CLOSED);
  const [typeForm, setTypeForm] = useState<TypeFormState>(emptyTypeForm);
  const [turbineForm, setTurbineForm] = useState<TurbineFormState>(emptyTurbineForm);
  const [pvForm, setPvForm] = useState<PvTypeFormState>(emptyPvTypeForm);
  const [inCountry, setInCountry] = useState(true);
  const countryFilterLabel = inCountry
    ? "Models available in the project country"
    : "Models NOT available in the project country — saving requests permission";
  const [applyCapacityAll, setApplyCapacityAll] = useState(false);
  const [applyHubHeightAll, setApplyHubHeightAll] = useState(false);
  const [applyPlinthAll, setApplyPlinthAll] = useState(false);
  /** GUIDE q10 — the green save-confirmation banner, shown after a successful type save. */
  const [savedBanner, setSavedBanner] = useState(false);

  const [selection, setSelection] = useState<{
    generatorTypeId: string | null; pvId: string | null; inverterId: string | null;
    substructureId: string | null; storageId: string | null; hydrogenId: string | null;
    substationId: string | null;
  }>({
    generatorTypeId: null, pvId: null, inverterId: null, substructureId: null,
    storageId: null, hydrogenId: null, substationId: null,
  });

  const [confirm, setConfirm] = useState<
    | { kind: "deleteType"; type: GeneratorTypeRow }
    | { kind: "deleteTurbine"; type: GeneratorTypeRow; turbine: TurbineRow }
    | { kind: "toggleStatus"; type: GeneratorTypeRow }
    | { kind: "deleteSimple"; family: Exclude<PlantFamily, "wtg">; row: SimpleTypeRow }
    | { kind: "blocked"; action: "delete" | "deactivate"; reason: CapacityGuardReason; name: string | null }
    | { kind: "heightOverride" }
    | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  /* ── canvas 1.21.753 — Replace Generator / PV Module Type ───────────────────── */
  const [replaceWtg, setReplaceWtg] = useState<ReplaceWtgForm | null>(null);
  const [replacePv, setReplacePv] = useState<ReplacePvForm | null>(null);
  /** `locReplaceInProgress` — the re-entrancy guard; also the long-operation dialog text. */
  const [replaceProgress, setReplaceProgress] = useState<string | null>(null);
  const [replaceNotice, setReplaceNotice] = useState<{ intent: "success" | "warning" | "error"; text: string } | null>(null);
  const replaceType = useReplaceGeneratorType();
  const replacePvType = useReplacePvModuleType();

  const saveType = useSaveGeneratorType();
  const saveTurbine = useSaveTurbine();
  const deleteTurbine = useDeleteTurbine();
  const deleteType = useDeleteGeneratorType();
  const toggleStatus = useToggleTypeStatus();
  const saveSimple = useSaveSimpleType();
  const deleteSimple = useDeleteSimpleType();

  const find = <T extends { id: string }>(rows: T[], id: string | null) =>
    rows.find((r) => r.id === id) ?? null;

  const selectedType = find(types, selection.generatorTypeId);
  const selectedPv = find(pv.rows, selection.pvId);
  const selectedInverter = find(inverters.rows, selection.inverterId);
  const selectedSubstructure = find(substructures.rows, selection.substructureId);
  const selectedStorage = find(storage.rows, selection.storageId);
  const selectedHydrogen = find(hydrogen.rows, selection.hydrogenId);
  const selectedSubstation = find(substation.rows, selection.substationId);

  // 1.21.753 — the O&M half of the delete/deactivate guard, read for the selected rows.
  const opexWtg = useOpexDependency(projectId, selectedType?.id);
  const opexPv = useOpexDependency(projectId, selectedPv?.id);
  const modelOf = (t: GeneratorTypeRow | null) => (t ? models.find((m) => m.id === t.generatorId) ?? null : null);
  const selectedTypeModel = modelOf(selectedType);

  const replaceCascade = useMemo(
    () => cascadeOptions(models, {
      inCountry: replaceWtg?.inCountry ?? true,
      supplier: replaceWtg?.supplier ?? null,
      turbineType: replaceWtg?.turbineType ?? null,
    }),
    [models, replaceWtg?.inCountry, replaceWtg?.supplier, replaceWtg?.turbineType],
  );
  const replaceModel: ProjectedModel | null = useMemo(
    () => (replaceWtg
      ? resolveModel(models, {
          supplier: replaceWtg.supplier,
          turbineType: replaceWtg.turbineType,
          hubHeight: isDummySupplier(replaceWtg.supplier) ? null : replaceWtg.hubHeight,
        }) ?? null
      : null),
    [models, replaceWtg],
  );
  const replaceCount = selectedType?.numberOfGenerators ?? 0;
  const replaceCost = useDerivedCostPerWtg(replaceModel, replaceCount, accumulatedIndex);
  const replaceTotalHeight = replaceModel && replaceWtg
    ? newTurbineHeights({
        selectedHeight: isDummySupplier(replaceWtg.supplier) ? 0 : replaceWtg.hubHeight ?? 0,
        typedHubHeight: numericOr(replaceWtg.revisedHubHeight, 0),
        catalogHubHeight: replaceModel.hubHeight,
        rotorDiameter: replaceModel.rotorDiameter,
      }).totalHeight
    : 0;
  const replaceHeightBlocked = heightBlocksSave({
    planning, totalHeight: replaceTotalHeight, project, entraObjectId,
  });
  const replaceWtgOk = replaceWtg !== null && replaceModel !== null && replaceWtgSaveable({
    form: replaceWtg, inProgress: replaceProgress !== null, heightBlocked: replaceHeightBlocked,
  });
  const replacePvOk = replacePv !== null && replacePvSaveable(replacePv);

  /* ── Rules 3–5: the cascade and the resolved model ─────────────────────────── */
  const cascade = useMemo(
    () =>
      cascadeOptions(models, {
        inCountry,
        supplier: typeForm.supplier,
        turbineType: typeForm.turbineType,
      }),
    [models, inCountry, typeForm.supplier, typeForm.turbineType],
  );
  const resolvedModel: ProjectedModel | null = useMemo(
    () =>
      resolveModel(models, {
        supplier: typeForm.supplier,
        turbineType: typeForm.turbineType,
        hubHeight: typeForm.hubHeight,
      }) ?? null,
    [models, typeForm.supplier, typeForm.turbineType, typeForm.hubHeight],
  );

  const count = numericOr(typeForm.numberOfGenerators, 0);
  const derivedCost = useDerivedCostPerWtg(resolvedModel, count, accumulatedIndex);

  /* Rule 10 — the total height the height gate compares against. */
  const prospectiveTotalHeight = resolvedModel
    ? newTurbineHeights({
        selectedHeight: typeForm.hubHeight ?? 0,
        typedHubHeight: numericOr(typeForm.revisedHubHeight, 0),
        catalogHubHeight: resolvedModel.hubHeight,
        rotorDiameter: resolvedModel.rotorDiameter,
      }).totalHeight
    : 0;

  const typeErrors = validateTypeForm(
    typeForm,
    { isoCurrencyCode: project?.isoCurrencyCode, derivedCostPerWtg: derivedCost },
  );
  const typeHeightBlocked = heightBlocksSave({
    planning, totalHeight: prospectiveTotalHeight, project, entraObjectId,
  });
  const typeSaveable = canSaveType({
    errors: typeErrors,
    dirty: typeForm.dirty,
    numberOfGenerators: typeForm.numberOfGenerators,
    heightBlocked: typeHeightBlocked,
  });

  const panelType = find(types, panel.typeId);
  const panelTurbines = panel.typeId ? byType.get(panel.typeId) ?? [] : [];
  const panelTurbine = find(panelTurbines, panel.turbineId);
  const panelModel =
    panelType && models.find((m) => m.id === panelType.generatorId)
      ? models.find((m) => m.id === panelType.generatorId)!
      : null;

  /* ── the PV module type panel (GUIDE q11) ───────────────────────────────────── */
  const panelPv = panel.family === "pv" ? find(pv.rows, panel.typeId) : null;
  const pvErrors = validatePvTypeForm(pvForm);
  const pvSaveable = canSavePvType(pvErrors, pvForm.dirty);
  const pvSupplierChoices = useMemo(() => pvSupplierOptions(pv.rows), [pv.rows]);

  const turbineTotalHeight = editedTotalHeight({
    hubHeight: numericOr(turbineForm.effectiveHubHeight, 0),
    foundationPlinth: numericOr(turbineForm.foundationPlinth, 0),
    rotorDiameter: panelModel?.rotorDiameter ?? 0,
  });
  const turbineHeightBlocked = heightBlocksSave({
    planning, totalHeight: turbineTotalHeight, project, entraObjectId,
  });
  const turbineSaveable = canSaveTurbine({
    form: turbineForm,
    existingIndices: panelTurbines
      .filter((t) => t.id !== panel.turbineId)
      .map((t) => t.index),
    currentIndex: panelTurbine?.index ?? null,
    specificCapacity: panelModel?.specificCapacity ?? null,
    heightBlocked: turbineHeightBlocked,
  });

  /* ── the command bar ────────────────────────────────────────────────────────── */
  const cmdState = commandBarState({
    canEdit,
    project,
    selection: {
      generatorType: selectedType,
      pvModuleType: selectedPv,
      inverterType: selectedInverter,
      substructureType: selectedSubstructure,
      storageType: selectedStorage,
      hydrogenType: selectedHydrogen,
      substationType: selectedSubstation,
    },
    counts: {
      storage: storage.rows.length,
      hydrogen: hydrogen.rows.length,
      substation: substation.rows.length,
    },
    deletePermission: {
      // `RecordInfo(row, DeletePermission)` is a server answer; `canEdit` is the closest
      // honest proxy the code app has until the privilege probe covers child tables.
      wtg: canEdit, pv: canEdit, inverter: canEdit, substructure: canEdit,
    },
    editPermission: canEdit,
    // 1.21.753 — `RecordInfo(<PV type>, EditPermission)`; the same honest proxy as above.
    pvEditPermission: canEdit,
  });

  const openTypePanel = (existing: GeneratorTypeRow | null) => {
    setError(null);
    if (existing) {
      const model = models.find((m) => m.id === existing.generatorId) ?? null;
      setTypeForm({
        supplier: model?.supplier ?? null,
        turbineType: model?.turbineType ?? null,
        hubHeight: model?.hubHeight ?? null,
        revisedHubHeight: "",
        numberOfGenerators: String(existing.numberOfGenerators ?? ""),
        cost: String(existing.costPerWtg ?? ""),
        dirty: new Set<string>(),
      });
    } else {
      setTypeForm(emptyTypeForm());
    }
    setPanel({ family: "wtg", mode: "type", typeId: existing?.id ?? null, turbineId: null });
  };

  const openTurbinePanel = (type: GeneratorTypeRow, turbine: TurbineRow | null) => {
    setError(null);
    setApplyCapacityAll(false);
    setApplyHubHeightAll(false);
    setApplyPlinthAll(false);
    const siblings = byType.get(type.id) ?? [];
    const nextIndex =
      siblings.length === 0 ? 1 : Math.max(...siblings.map((t) => t.index || 0)) + 1;
    setTurbineForm(
      turbine
        ? {
            nameIndex: String(turbine.index),
            effectiveCapacity: String(turbine.effectiveCapacity ?? ""),
            effectiveHubHeight: String(turbine.hubHeightExclPlinth ?? ""),
            foundationPlinth: String(turbine.foundationPlinth ?? ""),
            dirty: new Set<string>(),
          }
        : { ...emptyTurbineForm(), nameIndex: String(nextIndex), dirty: new Set(["nameIndex"]) },
    );
    setPanel({
      family: "wtg", mode: "turbine", typeId: type.id, turbineId: turbine?.id ?? null,
    });
  };

  const touchType = <K extends keyof TypeFormState>(field: K, value: TypeFormState[K]) =>
    setTypeForm((prev) => {
      const dirty = new Set(prev.dirty);
      dirty.add(String(field));
      const next = { ...prev, [field]: value, dirty };
      // `Reset(cmb_Supplier_1)` / `Reset(cmb_Supplier_2)` — cascade clearing.
      if (field === "supplier") {
        next.turbineType = null;
        next.hubHeight = null;
      }
      if (field === "turbineType") next.hubHeight = null;
      return next;
    });

  const touchTurbine = <K extends keyof TurbineFormState>(
    field: K, value: TurbineFormState[K],
  ) =>
    setTurbineForm((prev) => {
      const dirty = new Set(prev.dirty);
      dirty.add(String(field));
      return { ...prev, [field]: value, dirty };
    });

  const touchPv = <K extends keyof PvTypeFormState>(field: K, value: PvTypeFormState[K]) =>
    setPvForm((prev) => {
      const dirty = new Set(prev.dirty);
      dirty.add(String(field));
      return { ...prev, [field]: value, dirty };
    });

  /** GUIDE q11 — opens the dedicated Add/Edit PV Module Type panel. */
  const openPvPanel = (existing: SimpleTypeRow | null) => {
    setError(null);
    setPvForm(
      existing
        ? {
            moduleLabel: existing.moduleLabel ?? "",
            capacity: existing.capacity !== null ? String(existing.capacity) : "",
            supplier: existing.supplier,
            degradation1stYear:
              existing.degradation1stYear !== null ? String(existing.degradation1stYear) : "",
            degradationRemainingYears:
              existing.degradationRemainingYears !== null
                ? String(existing.degradationRemainingYears)
                : "",
            dirty: new Set<string>(),
          }
        : emptyPvTypeForm(),
    );
    setPanel({ family: "pv", mode: "type", typeId: existing?.id ?? null, turbineId: null });
  };

  const commitTypeSave = (heightApproved: boolean) => {
    if (!project || !resolvedModel) return;
    if (!heightApproved && typeHeightBlocked) return;
    setPanel(CLOSED);
    saveType.mutate(
      {
        project,
        existing: panelType,
        model: resolvedModel,
        count,
        costPerWtgValue: numericOr(typeForm.cost, derivedCost),
        selectedHeight: typeForm.hubHeight ?? 0,
        typedHubHeight: numericOr(typeForm.revisedHubHeight, 0),
        inCountry,
        allTypes: types,
        existingTurbines: byType.get(panelType?.id ?? "") ?? [],
        allocatableCosts,
      },
      {
        // GUIDE q10 — the green save-confirmation banner.
        onSuccess: () => setSavedBanner(true),
        onError: (e) => setError(`${e.source ? `${e.source}: ` : ""}${e.message}`),
      },
    );
  };

  const commitTurbineSave = (heightApproved: boolean) => {
    if (!project || !panelType) return;
    if (!heightApproved && turbineHeightBlocked) return;
    setPanel(CLOSED);
    saveTurbine.mutate(
      {
        project,
        type: panelType,
        model: panelModel,
        accumulatedIndex,
        existing: panelTurbine,
        nameIndex: turbineForm.nameIndex,
        effectiveCapacity: numericOr(turbineForm.effectiveCapacity, 0),
        hubHeight: numericOr(turbineForm.effectiveHubHeight, 0),
        foundationPlinth: numericOr(turbineForm.foundationPlinth, 0),
        applyCapacityToAll: applyCapacityAll,
        applyHubHeightToAll: applyHubHeightAll,
        applyPlinthToAll: applyPlinthAll,
        siblings: panelTurbines,
        allTypes: types,
        allocatableCosts,
      },
      { onError: (e) => setError(`${e.source ? `${e.source}: ` : ""}${e.message}`) },
    );
  };

  /**
   * GUIDE q11 — save the PV Module Type panel. The roll-up must see the row being saved
   * with its NEW capacity, not the stale list still in cache, so it is patched into a
   * local copy of `pv.rows` first — the same pattern `deleteSimple` already uses below.
   */
  const commitPvSave = () => {
    if (!project) return;
    setPanel(CLOSED);
    const capacityMwp = numericOr(pvForm.capacity, 0);
    const fields = buildPvTypeFields(pvForm, { deviceCostModules: deviceCosts.modules });
    const rollUpCost = fields[PV_TYPE_COL.cost] as number;
    const updatedPvRows: SimpleTypeRow[] = panelPv
      ? pv.rows.map((r) =>
          r.id === panelPv.id ? { ...r, capacity: capacityMwp, cost: rollUpCost } : r,
        )
      : [
          ...pv.rows,
          {
            id: "__new_pv__", name: null, supplier: pvForm.supplier, otherSupplier: null,
            capacity: capacityMwp, cost: rollUpCost, moduleLabel: pvForm.moduleLabel,
            degradation1stYear: null, degradationRemainingYears: null,
            requestPermissionState: null, flowRunId: null, flowApprovalId: null,
            status: CHOICE_PLANT.status.active,
          },
        ];
    saveSimple.mutate(
      {
        family: "pv",
        project,
        existingId: panelPv?.id ?? null,
        fields,
        requestPermission: false,
        // 1.21.753 — a NEW module's unit is backfilled into AllWTGAllocated=Yes costs.
        pvAllocatableCosts: allocatableCosts,
        rollUp: buildFamilyRollUp({
          family: "pv",
          pv: updatedPvRows,
          inverters: inverters.rows,
          substructures: substructures.rows,
          storage: storage.rows,
          hydrogen: hydrogen.rows,
          substation: substation.rows,
        }),
      },
      {
        onSuccess: () => setSavedBanner(true),
        onError: (e) => setError(e.message),
      },
    );
  };

  /**
   * The last-capacity guard — and, since 1.21.753, the O&M dependency guard on the WTG type
   * and the PV module type — runs BEFORE the confirmation dialog opens.
   */
  const guardThen = (
    family: PlantFamily,
    capacity: number | null,
    action: "delete" | "deactivate",
    open: () => void,
    row?: { active: boolean; dep: { hasActiveDeviceType: boolean; hasActiveOpexCost: boolean }; name: string | null },
  ) => {
    const reason = capacityGuardReason({
      family, project, capacity,
      rowActive: row?.active ?? false,
      hasActiveDeviceType: row?.dep.hasActiveDeviceType ?? false,
      hasActiveOpexCost: row?.dep.hasActiveOpexCost ?? false,
    });
    if (reason) {
      setConfirm({ kind: "blocked", action, reason, name: row?.name ?? null });
      return;
    }
    open();
  };
  const wtgGuardRow = selectedType
    ? {
        active: selectedType.status === CHOICE_PLANT.status.active,
        dep: opexWtg,
        name: selectedTypeModel?.turbineType ?? selectedType.generatorDisplayName,
      }
    : undefined;
  const pvGuardRow = selectedPv
    ? { active: selectedPv.status === CHOICE_PLANT.status.active, dep: opexPv, name: selectedPv.moduleLabel }
    : undefined;

  /** `replaceGeneratorType` — open the panel, the "Replace to" selection empty. */
  const openReplaceWtg = () => {
    setReplaceWtg({ supplier: null, turbineType: null, hubHeight: null, revisedHubHeight: "", inCountry: true });
  };
  const openReplacePv = () => {
    setReplacePv({
      moduleLabel: "", capacity: "", supplier: null, otherSupplier: "",
      degradation1stYear: "", degradationRemainingYears: "",
    });
  };

  const commitReplaceWtg = () => {
    if (!project || !selectedType || !replaceWtg || !replaceModel) return;
    if (replaceProgress !== null) {
      setReplaceNotice({ intent: "warning", text: REPLACE_MSG.inProgress });
      return;
    }
    const form = replaceWtg;
    setReplaceWtg(null);
    setReplaceProgress(replaceProgressText({
      inCountry: form.inCountry,
      newDisplayName: replaceModel.displayName,
      oldTurbineType: selectedTypeModel?.turbineType ?? selectedType.generatorDisplayName,
    }));
    replaceType.mutate(
      {
        project,
        oldType: selectedType,
        model: replaceModel,
        count: replaceCount,
        costPerWtgValue: replaceCost,
        selectedHeight: isDummySupplier(form.supplier) ? 0 : form.hubHeight ?? 0,
        typedHubHeight: isDummySupplier(form.supplier) ? numericOr(form.revisedHubHeight, 0) : null,
        inCountry: form.inCountry,
        allTypes: types,
        otherTurbines: types.filter((t) => t.id !== selectedType.id).flatMap((t) => byType.get(t.id) ?? []),
        allocatableCosts,
      },
      {
        onSuccess: (r) => {
          setSelection((x) => ({ ...x, generatorTypeId: r.typeId }));
          setReplaceNotice({ intent: "success", text: replaceSuccessText(r.unmatchedCount) });
        },
        onError: (e) => setReplaceNotice({
          intent: "error", text: replaceErrorText("wtg", { source: e.source, message: e.message }),
        }),
        onSettled: () => setReplaceProgress(null),
      },
    );
  };

  const commitReplacePv = () => {
    if (!project || !selectedPv || !replacePv) return;
    const form = replacePv;
    setReplacePv(null);
    setReplaceProgress(replacePvProgressText(form.moduleLabel));
    const fields = buildPvTypeFields(
      { ...form, supplier: form.supplier },
      { deviceCostModules: deviceCosts.modules },
    );
    const nextPv = [
      ...pv.rows.filter((r) => r.id !== selectedPv.id),
      {
        ...selectedPv, id: "__replacement__", moduleLabel: form.moduleLabel,
        capacity: numericOr(form.capacity, 0), cost: fields[PV_TYPE_COL.cost] as number,
      },
    ];
    replacePvType.mutate(
      {
        project, oldPv: selectedPv, form, deviceCostModules: deviceCosts.modules,
        allocatableCosts,
        rollUp: buildFamilyRollUp({
          family: "pv", pv: nextPv, inverters: inverters.rows, substructures: substructures.rows,
          storage: storage.rows, hydrogen: hydrogen.rows, substation: substation.rows,
        }),
      },
      {
        onSuccess: (r) => {
          setSelection((x) => ({ ...x, pvId: r.id }));
          setReplaceNotice({ intent: "success", text: REPLACE_MSG.pvReplaced });
        },
        onError: (e) => setReplaceNotice({
          intent: "error", text: replaceErrorText("pv", { source: e.source, message: e.message }),
        }),
        onSettled: () => setReplaceProgress(null),
      },
    );
  };

  const runCommand = (key: GeneratorCommandKey) => {
    switch (key) {
      case "addWTGType":
        openTypePanel(null);
        break;
      case "addPVType":
        openPvPanel(selectedPv);
        break;
      case "addInverterType":
        setPanel({
          family: "inverter", mode: "type", typeId: selectedInverter?.id ?? null, turbineId: null,
        });
        break;
      case "addSubstructureType":
        setPanel({
          family: "substructure", mode: "type",
          typeId: selectedSubstructure?.id ?? null, turbineId: null,
        });
        break;
      case "addStorage":
        setPanel({
          family: "storage", mode: "type", typeId: selectedStorage?.id ?? null, turbineId: null,
        });
        break;
      case "addHydrogen":
        setPanel({
          family: "hydrogen", mode: "type", typeId: selectedHydrogen?.id ?? null, turbineId: null,
        });
        break;
      case "addSubstation":
        setPanel({
          family: "substation", mode: "type",
          typeId: selectedSubstation?.id ?? null, turbineId: null,
        });
        break;
      case "addOthers":
        setPanel({ family: "storage", mode: "type", typeId: null, turbineId: null });
        break;
      case "deleteGeneratorType":
        if (selectedType) {
          guardThen("wtg", selectedType.generatorsCapacity, "delete", () =>
            setConfirm({ kind: "deleteType", type: selectedType }),
          wtgGuardRow);
        }
        break;
      case "replaceGeneratorType":
        if (selectedType) openReplaceWtg();
        break;
      case "deletePVModuleType":
        if (selectedPv) {
          guardThen("pv", selectedPv.capacity, "delete", () =>
            setConfirm({ kind: "deleteSimple", family: "pv", row: selectedPv }),
          pvGuardRow);
        }
        break;
      case "replacePVModuleType":
        if (selectedPv) openReplacePv();
        break;
      case "deleteInverterType":
        // SOURCE DEFECT (ambiguity 6): no last-capacity guard on inverter in the canvas.
        if (selectedInverter) {
          setConfirm({ kind: "deleteSimple", family: "inverter", row: selectedInverter });
        }
        break;
      case "deleteSubstructureType":
        // SOURCE DEFECT (ambiguity 6): no last-capacity guard on substructure either.
        if (selectedSubstructure) {
          setConfirm({ kind: "deleteSimple", family: "substructure", row: selectedSubstructure });
        }
        break;
      case "deleteStorageType":
        if (selectedStorage) {
          guardThen("storage", selectedStorage.capacity, "delete", () =>
            setConfirm({ kind: "deleteSimple", family: "storage", row: selectedStorage }),
          );
        }
        break;
      case "deleteHydrogenType":
        if (selectedHydrogen) {
          guardThen("hydrogen", selectedHydrogen.capacity, "delete", () =>
            setConfirm({ kind: "deleteSimple", family: "hydrogen", row: selectedHydrogen }),
          );
        }
        break;
      case "deleteSubstationType":
        if (selectedSubstation) {
          guardThen("substation", selectedSubstation.capacity, "delete", () =>
            setConfirm({ kind: "deleteSimple", family: "substation", row: selectedSubstation }),
          );
        }
        break;
      case "activateGenerator":
        if (selectedType) setConfirm({ kind: "toggleStatus", type: selectedType });
        break;
      case "deactivateGenerator":
        if (selectedType) {
          guardThen("wtg", selectedType.generatorsCapacity, "deactivate", () =>
            setConfirm({ kind: "toggleStatus", type: selectedType }),
          wtgGuardRow);
        }
        break;
    }
  };

  const icon = (key: GeneratorCommandKey) =>
    key.startsWith("delete") ? <DeleteRegular />
    : key.startsWith("replace") ? <ArrowSyncRegular />
    : key === "activateGenerator" ? <PlayRegular />
    : key === "deactivateGenerator" ? <PauseRegular />
    : cmdState[key].label.startsWith("Edit") ? <EditRegular />
    : <AddRegular />;

  const commands: Command[] = (Object.keys(cmdState) as GeneratorCommandKey[]).map((key) => ({
    key,
    label: cmdState[key].label,
    icon: icon(key),
    visible: cmdState[key].visible,
    disabled: !cmdState[key].enabled,
    danger: key.startsWith("delete"),
    primary: key === "addWTGType",
    disabledReason:
      key.startsWith("add") && !canEdit
        ? "You do not have edit permission on this project."
        : key.startsWith("add")
          ? "Complete Milestones (End Date) first."
          : undefined,
    onClick: () => runCommand(key),
  }));

  /* ── the turbine grid — column order and labels are GUIDE q09, verbatim ──────── */
  const turbineColumns = (type: GeneratorTypeRow): Column<TurbineRow>[] => [
    {
      key: "index", header: TURBINE_TABLE_LABELS.wtg, width: "minmax(140px, 1.4fr)",
      render: (r) => (
        <span className={s.tag}>
          {r.name ?? `_${r.index}`}
          {overHeightLimit(planning, r.totalHeight) && (
            <InfoRegular
              aria-label="Exceeds the project height limitation"
              title="Exceeds the project height limitation"
              style={{ color: semantic.warning } as CSSProperties}
            />
          )}
        </span>
      ),
      value: (r) => r.index,
      sortable: true,
    },
    {
      key: "total", header: TURBINE_TABLE_LABELS.totalHeight, numeric: true, align: "end",
      width: "minmax(130px, 1fr)",
      render: (r) => fmtHeight(r.totalHeight), value: (r) => r.totalHeight, sortable: true,
    },
    {
      key: "capacity", header: TURBINE_TABLE_LABELS.effectiveCapacity, numeric: true, align: "end",
      width: "minmax(150px, 1fr)",
      render: (r) => fmtCapacity(r.effectiveCapacity), value: (r) => r.effectiveCapacity,
      sortable: true,
    },
    {
      key: "hub", header: "Hub height [m]", numeric: true, align: "end",
      width: "minmax(130px, 1fr)", hideBelow: "md",
      render: (r) => fmtHubHeight(r.hubHeightExclPlinth), value: (r) => r.hubHeightExclPlinth,
    },
    {
      key: "plinth", header: "Plinth [m]", numeric: true, align: "end",
      width: "minmax(110px, .8fr)", hideBelow: "lg",
      render: (r) => fmtHubHeight(r.foundationPlinth), value: (r) => r.foundationPlinth,
    },
    {
      key: "actions", header: "", width: "96px", align: "end",
      render: (r) => (
        <span className={s.tag}>
          <Button
            appearance="subtle" size="small" icon={<EditRegular />}
            aria-label="Edit turbine" disabled={!canEdit}
            onClick={() => openTurbinePanel(type, r)}
          />
          <Button
            appearance="subtle" size="small" icon={<DeleteRegular />}
            aria-label="Delete turbine" disabled={!canEdit}
            onClick={() =>
              guardThen("wtg", r.effectiveCapacity, "delete", () =>
                setConfirm({ kind: "deleteTurbine", type, turbine: r }),
              )
            }
          />
        </span>
      ),
    },
  ];

  /* ── render ─────────────────────────────────────────────────────────────────── */
  if (!projectId) return <SelectProjectPrompt onGo={() => navigate("/projects")} />;
  if (contextLoading || projectLoading) return <LoadingOverlay mode="inline" />;

  const bullets = pageLock(project);
  const locked = isPageLocked(project);

  const totalWtgCapacity = types
    .filter((t) => t.status === CHOICE_PLANT.status.active)
    .reduce((sum, t) => sum + (t.generatorsCapacity ?? 0), 0);
  const totalWtgCost = types
    .filter((t) => t.status === CHOICE_PLANT.status.active)
    .reduce((sum, t) => sum + (t.generatorsCost ?? 0), 0);

  const simpleFamilies: {
    family: Exclude<PlantFamily, "wtg">; title: string; rows: SimpleTypeRow[];
    selectedId: string | null; onSelect: (id: string | null) => void; unit: string;
  }[] = [
    {
      family: "pv", title: "PV module types", rows: pv.rows, selectedId: selection.pvId,
      onSelect: (id) => setSelection((p) => ({ ...p, pvId: id })), unit: "MWp",
    },
    {
      family: "inverter", title: "Inverters", rows: inverters.rows,
      selectedId: selection.inverterId,
      onSelect: (id) => setSelection((p) => ({ ...p, inverterId: id })), unit: "",
    },
    {
      family: "substructure", title: "Substructures", rows: substructures.rows,
      selectedId: selection.substructureId,
      onSelect: (id) => setSelection((p) => ({ ...p, substructureId: id })), unit: "",
    },
    {
      family: "storage", title: "BESS / storage", rows: storage.rows,
      selectedId: selection.storageId,
      onSelect: (id) => setSelection((p) => ({ ...p, storageId: id })), unit: "MW",
    },
    {
      family: "hydrogen", title: "Hydrogen", rows: hydrogen.rows,
      selectedId: selection.hydrogenId,
      onSelect: (id) => setSelection((p) => ({ ...p, hydrogenId: id })), unit: "MW",
    },
    {
      family: "substation", title: "Substation", rows: substation.rows,
      selectedId: selection.substationId,
      onSelect: (id) => setSelection((p) => ({ ...p, substationId: id })), unit: "MW",
    },
  ];

  return (
    <div className={s.stack}>
      <PageHeader
        eyebrow="Project"
        title="Generator"
        description={
          project?.projectName
            ? `Plant equipment for ${project.projectName}.`
            : "Plant equipment for this project."
        }
      />

      {locked && bullets.length > 0 && (
        <MessageBar intent="warning" icon={<LockClosedRegular />}>
          <MessageBarBody>
            <MessageBarTitle>{PAGE_LOCK_TITLE}</MessageBarTitle>
            <div className={s.lock}>
              {bullets.map((b) => (
                <span key={b}>{b}</span>
              ))}
            </div>
          </MessageBarBody>
        </MessageBar>
      )}

      {/* GUIDE q10 — the green save-confirmation banner, verbatim text, dismissible. */}
      {replaceProgress && (
        <MessageBar intent="info" data-testid="generators-replace-progress">
          <MessageBarBody>{replaceProgress}</MessageBarBody>
        </MessageBar>
      )}
      {replaceNotice && (
        <MessageBar intent={replaceNotice.intent} data-testid="generators-replace-notice">
          <MessageBarBody>{replaceNotice.text}</MessageBarBody>
          <MessageBarActions
            containerAction={
              <Button
                appearance="transparent" icon={<DismissRegular />}
                aria-label="Dismiss" onClick={() => setReplaceNotice(null)}
              />
            }
          />
        </MessageBar>
      )}
      {savedBanner && (
        <MessageBar intent="success">
          <MessageBarBody>{GENERATOR_TYPE_SAVED_BANNER}</MessageBarBody>
          <MessageBarActions
            containerAction={
              <Button
                appearance="transparent" icon={<DismissRegular />}
                aria-label="Dismiss" onClick={() => setSavedBanner(false)}
              />
            }
          />
        </MessageBar>
      )}

      {error && (
        <MessageBar intent="error">
          <MessageBarBody>
            <MessageBarTitle>Save failed</MessageBarTitle>
            {error}
          </MessageBarBody>
        </MessageBar>
      )}

      <CommandBar commands={commands} maxInline={5} />

      {/* GUIDE q07 — "Total Capacity [MW(p)]", a right-aligned value in a grey read-only box. */}
      <Field label={TOTAL_CAPACITY_LABEL}>
        <Input
          {...a11y("txt_Generators_DisplayProject_Body_Form_PlantWtgCapacity", TOTAL_CAPACITY_LABEL)}
          value={fmtCapacity(project?.totalCapacity)}
          appearance="filled-darker"
          input={{ readOnly: true, style: { textAlign: "end" } as CSSProperties }}
        />
      </Field>

      <StatTiles
        stats={[
          { label: "Plant WTG capacity", value: fmtCapacity(totalWtgCapacity), unit: "MW" },
          { label: "Plant WTG cost", value: fmtCurrency(totalWtgCost), unit: "EUR" },
          { label: "Turbines", value: String(
              types.reduce((n, t) => n + (t.numberOfGenerators ?? 0), 0),
            ) },
          { label: "Plant PV capacity", value: fmtCapacity(projectPvCapacity), unit: "MWp" },
        ]}
      />

      {(catalogLoading || typesLoading) && <LoadingOverlay mode="inline" />}

      <div className={s.cards}>
        {types.length === 0 && !typesLoading && (
          <Card>
            <EmptyState
              title="No WTG types yet"
              description={
                project?.fid
                  ? "Add a WTG type to generate its turbines."
                  : "The turbine catalogue is empty until the project has a Final Investment Decision date."
              }
            />
          </Card>
        )}

        {types.map((type) => {
          const rows = byType.get(type.id) ?? [];
          const over = countOverHeightLimit(planning, rows);
          const isFolded = folded[type.id] === true;
          const isSelected = selection.generatorTypeId === type.id;
          const tone = permissionStateTone(type.requestPermissionState);
          const permissionLabel = permissionStateLabel(type.requestPermissionState);
          const typeLabel = type.generatorDisplayName ?? type.name ?? "WTG type";
          const model = models.find((m) => m.id === type.generatorId) ?? null;
          const totalHeight = catalogTotalHeight(model);
          const tooltip = typeSummaryTooltip({
            supplier: model?.supplier,
            typeLabel,
            hubHeight: model?.hubHeight,
            totalHeight,
          });
          return (
            // GUIDE q07/q08/q09 — one radio-selected, collapsible row; no separate action
            // bar above it, and the detail expands IN PLACE (never a right-side drawer —
            // that pattern is Production's, deliberately kept different here).
            <Card key={type.id}>
              <div className={s.cardHead}>
                <Radio
                  checked={isSelected}
                  {...a11y("img_Generators_DisplayProject_Body_Form_GeneratorType_CardHeader_RowSelectionDot", `Select ${typeLabel}`)}
                  onClick={(e) => e.stopPropagation()}
                  onChange={() =>
                    setSelection((p) => ({
                      ...p,
                      generatorTypeId: p.generatorTypeId === type.id ? null : type.id,
                    }))
                  }
                />
                <Tooltip content={tooltip} relationship="description" withArrow>
                  <span
                    className={s.fold}
                    role="button"
                    tabIndex={0}
                    aria-expanded={!isFolded}
                    // `ico_…_GeneratorType_Up` shows while unfolded, `…_Down` while folded.
                    {...a11y(
                      isFolded
                        ? "ico_Generators_DisplayProject_Body_Form_GeneratorType_Down"
                        : "ico_Generators_DisplayProject_Body_Form_GeneratorType_Up",
                      typeLabel,
                    )}
                    onClick={() => setFolded((p) => ({ ...p, [type.id]: !isFolded }))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        setFolded((p) => ({ ...p, [type.id]: !isFolded }));
                      }
                    }}
                  >
                    <span className={s.cardTitle}>{typeLabel}</span>
                    {isFolded ? <ChevronRightRegular /> : <ChevronDownRegular />}
                  </span>
                </Tooltip>
                <StateChip
                  state={type.status === CHOICE_PLANT.status.active ? "Approved" : "Inactive"}
                />
                {permissionLabel && (
                  <Badge
                    appearance="filled"
                    color={
                      tone === "success" ? "success"
                      : tone === "error" ? "danger"
                      : tone === "warning" ? "warning"
                      : "informative"
                    }
                  >
                    {permissionLabel}
                  </Badge>
                )}
                {over > 0 && (
                  <Badge appearance="outline" color="warning" icon={<InfoRegular />}>
                    {over} over height limitation
                  </Badge>
                )}
              </div>

              {!isFolded && (
                <>
                  {/* GUIDE q09 — "+ Add Generator" only while expanded, above the fields. */}
                  <div className={s.tag}>
                    <Button
                      appearance="transparent" size="small" icon={<AddRegular />}
                      disabled={!canEdit} onClick={() => openTurbinePanel(type, null)}
                    >
                      {ADD_GENERATOR_LABEL}
                    </Button>
                    <Button
                      appearance="subtle" size="small" icon={<EditRegular />}
                      aria-label="Edit WTG type" disabled={!canEdit}
                      onClick={() => openTypePanel(type)}
                    />
                  </div>

                  {/* GUIDE q09 — the seven-field detail grid, this exact label set. */}
                  <div className={s.grid2}>
                    <div className={s.readField}>
                      <span className={s.readLabel}>{TYPE_DETAIL_FIELD_LABELS.supplier}</span>
                      <span
                        className={s.readBox}
                        {...a11y("txt_Generators_DisplayProject_Body_Form_GeneratorType_CardDetails_Supplier", TYPE_DETAIL_FIELD_LABELS.supplier)}
                      >
                        {model?.supplier ?? ""}
                      </span>
                    </div>
                    <div className={s.readField}>
                      <span className={s.readLabel}>{TYPE_DETAIL_FIELD_LABELS.totalHeight}</span>
                      <span
                        className={s.readBox}
                        {...a11y("txt_Generators_DisplayProject_Body_Form_GeneratorType_CardDetails_TotalHeight", TYPE_DETAIL_FIELD_LABELS.totalHeight)}
                      >
                        {model ? fmtHeight(totalHeight) : ""}
                      </span>
                    </div>
                    <div className={s.readField}>
                      <span className={s.readLabel}>
                        {TYPE_DETAIL_FIELD_LABELS.numberOfGenerators}
                      </span>
                      <span
                        className={s.readBox}
                        {...a11y("txt_Generators_DisplayProject_Body_Form_GeneratorType_CardDetails_NumberOfGenerators", TYPE_DETAIL_FIELD_LABELS.numberOfGenerators)}
                      >
                        {type.numberOfGenerators ?? ""}
                      </span>
                    </div>
                    <div className={s.readField}>
                      <span className={s.readLabel}>{TYPE_DETAIL_FIELD_LABELS.hubHeight}</span>
                      <span
                        className={s.readBox}
                        {...a11y("txt_Generators_DisplayProject_Body_Form_GeneratorType_CardDetails_HubHeight", TYPE_DETAIL_FIELD_LABELS.hubHeight)}
                      >
                        {fmtHubHeight(model?.hubHeight)}
                      </span>
                    </div>
                    <div className={s.readField}>
                      <span className={s.readLabel}>{TYPE_DETAIL_FIELD_LABELS.rotorDiameter}</span>
                      <span
                        className={s.readBox}
                        {...a11y("txt_Generators_DisplayProject_Body_Form_GeneratorType_CardDetails_RotorDiameter", TYPE_DETAIL_FIELD_LABELS.rotorDiameter)}
                      >
                        {fmtHubHeight(model?.rotorDiameter)}
                      </span>
                    </div>
                    <div className={s.readField}>
                      <span className={s.readLabel}>
                        {TYPE_DETAIL_FIELD_LABELS.heightLimitation}
                      </span>
                      <span className={s.readBox}>
                        {planning?.heightLimitation ? fmtHeight(planning.heightLimitation) : ""}
                      </span>
                    </div>
                    <div className={s.readField}>
                      <span className={s.readLabel}>
                        {TYPE_DETAIL_FIELD_LABELS.generatorsCapacity}
                      </span>
                      <span
                        className={s.readBox}
                        {...a11y("txt_Generators_DisplayProject_Body_Form_GeneratorType_CardDetails_GeneratorsCapacity", TYPE_DETAIL_FIELD_LABELS.generatorsCapacity)}
                      >
                        {fmtCapacity(type.generatorsCapacity)}
                      </span>
                    </div>
                  </div>

                  <span className={s.hint}>
                    {pageCount(rows.length, GENERATORS_PAGE_SIZE)} page
                    {pageCount(rows.length, GENERATORS_PAGE_SIZE) === 1 ? "" : "s"}
                  </span>
                  <DataGrid
                    rows={rows}
                    columns={turbineColumns(type)}
                    rowKey={(r) => r.id}
                    loading={turbinesLoading}
                    emptyMessage="No turbines for this type yet."
                    height={Math.min(420, 56 + rows.length * 44 || 140)}
                  />
                </>
              )}
            </Card>
          );
        })}

        {simpleFamilies.map((fam) => (
          <Card key={fam.family} title={fam.title}>
            {fam.rows.length === 0 ? (
              <Text size={200}>None recorded.</Text>
            ) : (
              <div className={s.cards}>
                {fam.rows.map((row) => {
                  const tone = permissionStateTone(row.requestPermissionState);
                  const label = permissionStateLabel(row.requestPermissionState);
                  return (
                    <div key={row.id} className={s.cardHead}>
                      <Button
                        appearance={fam.selectedId === row.id ? "primary" : "secondary"}
                        size="small"
                        aria-pressed={fam.selectedId === row.id}
                        {...a11y(FAMILY_A11Y[fam.family].select, row.name ?? row.supplier ?? "Row")}
                        onClick={() => fam.onSelect(fam.selectedId === row.id ? null : row.id)}
                      >
                        {row.name ?? row.supplier ?? "Row"}
                      </Button>
                      {row.capacity !== null && (
                        <span className={s.meta} {...familyA11y(fam.family, "capacity")}>
                          {fmtCapacity(row.capacity)} {fam.unit}
                        </span>
                      )}
                      {row.cost !== null && (
                        <span className={s.meta} {...familyA11y(fam.family, "cost")}>
                          {fmtCurrency(row.cost)} EUR
                        </span>
                      )}
                      {label && (
                        <Badge
                          appearance="filled"
                          color={
                            tone === "success" ? "success"
                            : tone === "error" ? "danger"
                            : tone === "warning" ? "warning"
                            : "informative"
                          }
                        >
                          {label}
                        </Badge>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        ))}
      </div>

      {/* One panel host; the body is chosen by the selected family. */}
      <FormPanel
        open={panel.family === "wtg" && panel.mode === "type"}
        title={panelType ? "Edit WTG type" : "Add WTG type"}
        onClose={() => setPanel(CLOSED)}
        onSave={() =>
          typeHeightBlocked && canOverrideHeightLimit(project, entraObjectId)
            ? setConfirm({ kind: "heightOverride" })
            : commitTypeSave(false)
        }
        saveDisabled={!typeSaveable && !heightLimitExceeded(planning, prospectiveTotalHeight)}
        busy={saveType.isPending}
        errors={Object.values(typeErrors).filter((e): e is string => e !== null)}
      >
        <div className={s.panel}>
          <Switch
            checked={inCountry}
            {...a11y("tgl_btn_GeneratorData_RightPanel_Form_Filter_Country", countryFilterLabel)}
            label={countryFilterLabel}
            onChange={(_, d) => {
              setInCountry(d.checked);
              setTypeForm(emptyTypeForm());
            }}
          />
          <div className={s.grid2}>
            <Field label="Supplier" required>
              <Dropdown
                {...a11y("cmb_Supplier", "Supplier")}
                value={typeForm.supplier ?? ""}
                selectedOptions={typeForm.supplier ? [typeForm.supplier] : []}
                onOptionSelect={(_, d) => touchType("supplier", d.optionValue ?? null)}
              >
                {cascade.suppliers.map((x) => (
                  <Option key={x} value={x}>{x}</Option>
                ))}
              </Dropdown>
            </Field>
            <Field label="Turbine type" required>
              <Dropdown
                {...a11y("cmb_Supplier_1", "Turbine type")}
                disabled={!typeForm.supplier}
                value={typeForm.turbineType ?? ""}
                selectedOptions={typeForm.turbineType ? [typeForm.turbineType] : []}
                onOptionSelect={(_, d) => touchType("turbineType", d.optionValue ?? null)}
              >
                {cascade.turbineTypes.map((x) => (
                  <Option key={x} value={x}>{x}</Option>
                ))}
              </Dropdown>
            </Field>
            {/* Rule 5 — a Dummy supplier bypasses hub height entirely. */}
            {!isDummySupplier(typeForm.supplier) && (
              <Field label="Hub height [m]" required>
                <Dropdown
                  {...a11y("cmb_Supplier_2", "Hub height [m]")}
                  disabled={!typeForm.turbineType}
                  value={typeForm.hubHeight === null ? "" : String(typeForm.hubHeight)}
                  selectedOptions={
                    typeForm.hubHeight === null ? [] : [String(typeForm.hubHeight)]
                  }
                  onOptionSelect={(_, d) =>
                    touchType("hubHeight", d.optionValue ? Number(d.optionValue) : null)
                  }
                >
                  {cascade.hubHeights.map((x) => (
                    <Option key={x} value={String(x)}>{String(x)}</Option>
                  ))}
                </Dropdown>
              </Field>
            )}
            <NumericInput
              label="Revised hub height [m]"
              a11y={a11y("txt_GeneratorData_RightPanel_Form_Fields_HubHeight_1", "Revised hub height [m]")}
              value={typeForm.revisedHubHeight}
              places={2}
              min={1}
              max={200}
              onChange={(v) => touchType("revisedHubHeight", v)}
            />
            <NumericInput
              label="Number of generators"
              a11y={a11y("txt_GeneratorData_RightPanel_Form_Fields_NumberOfGenerator", "Number of generators")}
              value={typeForm.numberOfGenerators}
              places={0}
              min={0}
              max={200}
              required
              onChange={(v) => touchType("numberOfGenerators", v)}
            />
            <CurrencyInput
              label="Cost per WTG"
              value={typeForm.cost}
              required
              onChange={(v) => touchType("cost", v)}
            />
          </div>

          <div className={s.derived}>
            <span>Derived cost per WTG (banded × inflation index)</span>
            <span>{fmtCurrency(derivedCost)} EUR</span>
          </div>
          <div className={s.derived}>
            <span>Accumulated price escalation index</span>
            <span>{accumulatedIndex.toFixed(4)}</span>
          </div>
          {resolvedModel && (
            <div className={s.derived}>
              <span>Prospective total height</span>
              <span>{fmtHeight(prospectiveTotalHeight)} m</span>
            </div>
          )}
          {heightLimitExceeded(planning, prospectiveTotalHeight) && (
            <MessageBar intent={typeHeightBlocked ? "error" : "warning"}>
              <MessageBarBody>
                {typeHeightBlocked
                  ? HEIGHT_LIMIT_PM_MESSAGE
                  : "Total height exceeds the Height Limitation. As project manager you may override it."}
              </MessageBarBody>
            </MessageBar>
          )}
          {!inCountry && (
            <Text size={200}>
              This model is not available in the project country. Saving sends a permission
              request; the project roll-up is updated by the approval flow, not here.
            </Text>
          )}
        </div>
      </FormPanel>

      <FormPanel
        open={panel.family === "wtg" && panel.mode === "turbine"}
        title={panelTurbine ? "Edit turbine" : "Add turbine"}
        onClose={() => setPanel(CLOSED)}
        onSave={() =>
          turbineHeightBlocked && canOverrideHeightLimit(project, entraObjectId)
            ? setConfirm({ kind: "heightOverride" })
            : commitTurbineSave(false)
        }
        saveDisabled={!turbineSaveable}
        busy={saveTurbine.isPending}
        errors={[
          validateTurbineName(turbineForm.nameIndex, {
            existingIndices: panelTurbines
              .filter((t) => t.id !== panel.turbineId)
              .map((t) => t.index),
            currentIndex: panelTurbine?.index ?? null,
          }),
          turbineForm.effectiveCapacity
            ? validateEffectiveCapacity(
                turbineForm.effectiveCapacity, panelModel?.specificCapacity ?? null,
              )
            : null,
          turbineForm.effectiveHubHeight
            ? validateEffectiveHubHeight(turbineForm.effectiveHubHeight)
            : null,
        ].filter((e): e is string => e !== null)}
      >
        <div className={s.panel}>
          <Field label="WTG index" required hint={`Saved as "WTG ${project?.shortName ?? ""}_<index>"`}>
            <Input
              value={turbineForm.nameIndex}
              onChange={(_, d) => touchTurbine("nameIndex", d.value)}
            />
          </Field>
          <NumericInput
            label="Effective capacity [MW]"
            value={turbineForm.effectiveCapacity}
            places={2}
            min={0.01}
            max={panelModel?.specificCapacity ?? undefined}
            required
            onChange={(v) => touchTurbine("effectiveCapacity", v)}
          />
          <Checkbox
            label="Apply to all WTGs"
            checked={applyCapacityAll}
            onChange={(_, d) => setApplyCapacityAll(d.checked === true)}
          />
          <NumericInput
            label="Effective hub height [m]"
            value={turbineForm.effectiveHubHeight}
            places={2}
            min={1}
            max={200}
            required
            rangeMessage="Effective hub height needs to be a positive number below 200 m."
            onChange={(v) => touchTurbine("effectiveHubHeight", v)}
          />
          <Checkbox
            label="Apply to all WTGs"
            checked={applyHubHeightAll}
            onChange={(_, d) => setApplyHubHeightAll(d.checked === true)}
          />
          <NumericInput
            label="Foundation plinth [m]"
            value={turbineForm.foundationPlinth}
            places={2}
            onChange={(v) => touchTurbine("foundationPlinth", v)}
          />
          <Checkbox
            label="Apply to all WTGs"
            checked={applyPlinthAll}
            onChange={(_, d) => setApplyPlinthAll(d.checked === true)}
          />
          <div className={s.derived}>
            <span>Total height (hub + plinth + ½ rotor)</span>
            <span>{fmtHeight(turbineTotalHeight)} m</span>
          </div>
          {heightLimitExceeded(planning, turbineTotalHeight) && (
            <MessageBar intent={turbineHeightBlocked ? "error" : "warning"}>
              <MessageBarBody>
                {turbineHeightBlocked
                  ? HEIGHT_LIMIT_PM_MESSAGE
                  : "Total height exceeds the Height Limitation. As project manager you may override it."}
              </MessageBarBody>
            </MessageBar>
          )}
        </div>
      </FormPanel>

      {/* GUIDE q11 — Add/Edit PV Module Type, its own right-side panel and field set. */}
      <FormPanel
        open={panel.family === "pv"}
        title={panelPv ? PV_PANEL_TITLES.edit : PV_PANEL_TITLES.add}
        onClose={() => setPanel(CLOSED)}
        onSave={commitPvSave}
        saveDisabled={!pvSaveable}
        busy={saveSimple.isPending}
        errors={Object.values(pvErrors).filter((e): e is string => e !== null)}
      >
        <div className={s.panel}>
          <TextFieldWithCount
            label={PV_FIELD_LABELS.moduleLabel}
            a11y={a11y("txt_GeneratorData_RightPanel_Form_PvModuleType_Fields_Label", PV_FIELD_LABELS.moduleLabel)}
            value={pvForm.moduleLabel}
            maxLength={PV_MODULE_LABEL_MAX_LENGTH}
            required
            message={pvForm.dirty.has("moduleLabel") ? pvErrors.moduleLabel : undefined}
            onChange={(v) => touchPv("moduleLabel", v)}
          />
          <NumericInput
            label={PV_FIELD_LABELS.capacity}
            a11y={a11y("txt_GeneratorData_RightPanel_Form_PvModuleType_Fields_PVCapacityMW", PV_FIELD_LABELS.capacity)}
            value={pvForm.capacity}
            places={2}
            min={0.01}
            required
            onChange={(v) => touchPv("capacity", v)}
          />
          <Field label={PV_FIELD_LABELS.supplier} required>
            <Combobox
              {...a11y("cmb_GeneratorData_RightPanel_Form_PvModuleType_Fields_Supplier", PV_FIELD_LABELS.supplier)}
              freeform
              placeholder={PV_SUPPLIER_PLACEHOLDER}
              value={pvForm.supplier ?? ""}
              selectedOptions={pvForm.supplier ? [pvForm.supplier] : []}
              onOptionSelect={(_, d) => touchPv("supplier", d.optionValue ?? null)}
              onInput={(e) => touchPv("supplier", (e.target as HTMLInputElement).value || null)}
            >
              {pvSupplierChoices.map((x) => (
                <Option key={x} value={x}>{x}</Option>
              ))}
            </Combobox>
          </Field>
          <PercentageInput
            label={PV_FIELD_LABELS.degradation1stYear}
            a11y={a11y("txt_GeneratorData_RightPanel_Form_PvModuleType_Fields_DegradationFirstYear", PV_FIELD_LABELS.degradation1stYear)}
            value={pvForm.degradation1stYear}
            onChange={(v) => touchPv("degradation1stYear", v)}
          />
          <PercentageInput
            label={PV_FIELD_LABELS.degradationRemainingYears}
            a11y={a11y("txt_GeneratorData_RightPanel_Form_PvModuleType_Fields_DegradationRemainingYears", PV_FIELD_LABELS.degradationRemainingYears)}
            value={pvForm.degradationRemainingYears}
            onChange={(v) => touchPv("degradationRemainingYears", v)}
          />
        </div>
      </FormPanel>

      {/* Rules 16–18 — one panel for the five remaining single-row families. */}
      <FormPanel
        open={panel.family !== null && panel.family !== "wtg" && panel.family !== "pv"}
        title={`${panel.typeId ? "Edit" : "Add"} ${panel.family ?? ""}`}
        onClose={() => setPanel(CLOSED)}
        onSave={() => {
          if (!project || !panel.family || panel.family === "wtg" || panel.family === "pv") return;
          const family = panel.family;
          setPanel(CLOSED);
          saveSimple.mutate(
            {
              family,
              project,
              existingId: panel.typeId,
              fields: {},
              // Only inverter and substructure have a live request-permission call site.
              requestPermission:
                !inCountry && (family === "inverter" || family === "substructure"),
              rollUp: buildFamilyRollUp({
                family,
                pv: pv.rows, inverters: inverters.rows, substructures: substructures.rows,
                storage: storage.rows, hydrogen: hydrogen.rows, substation: substation.rows,
              }),
            },
            { onError: (e) => setError(e.message) },
          );
        }}
        busy={saveSimple.isPending}
      >
        <div className={s.panel}>
          <Text size={200}>
            The {panel.family} panel writes one row per project. Its fields are derived from
            the country Device Costs
            {deviceCosts.modules !== null && ` (modules ${fmtCurrency(deviceCosts.modules)} EUR/MWp)`}
            ; the roll-up target is {panel.family === "inverter" ||
            panel.family === "substructure" ? "Plant PV Cost/Capacity" : "its own Plant capacity"}.
          </Text>
        </div>
      </FormPanel>

      <ConfirmDialog
        open={confirm?.kind === "deleteType"}
        title="Delete generator type"
        intent="danger"
        confirmLabel="Delete"
        busy={deleteType.isPending}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm?.kind !== "deleteType" || !project) return;
          const type = confirm.type;
          setConfirm(null);
          deleteType.mutate(
            { project, type, allTypes: types },
            { onError: (e) => setError(e.message) },
          );
        }}
      >
        <Text>
          This deletes the type, its turbines, its OPEX costs and its land-lease parents.
          Any open permission request is cancelled first.
        </Text>
      </ConfirmDialog>

      <ConfirmDialog
        open={confirm?.kind === "deleteTurbine"}
        title="Delete turbine"
        intent="danger"
        confirmLabel="Delete"
        busy={deleteTurbine.isPending}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm?.kind !== "deleteTurbine" || !project) return;
          const { type, turbine } = confirm;
          setConfirm(null);
          deleteTurbine.mutate(
            {
              project, type, turbine,
              model: models.find((m) => m.id === type.generatorId) ?? null,
              accumulatedIndex, allTypes: types,
            },
            { onError: (e) => setError(e.message) },
          );
        }}
      >
        <Text>
          Land-lease allocation rows for this turbine are removed. Where the turbine is the
          only one allocated to a land-lease cost, that cost is removed instead.
        </Text>
      </ConfirmDialog>

      <ConfirmDialog
        open={confirm?.kind === "toggleStatus"}
        title={
          confirm?.kind === "toggleStatus" &&
          confirm.type.status === CHOICE_PLANT.status.active
            ? "Deactivate generator type"
            : "Activate generator type"
        }
        confirmLabel="Continue"
        busy={toggleStatus.isPending}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm?.kind !== "toggleStatus" || !project) return;
          const type = confirm.type;
          setConfirm(null);
          toggleStatus.mutate(
            { project, type, turbines: byType.get(type.id) ?? [], allTypes: types },
            { onError: (e) => setError(e.message) },
          );
        }}
      >
        <Text>The status change is propagated to every turbine of this type.</Text>
      </ConfirmDialog>

      <ConfirmDialog
        open={confirm?.kind === "deleteSimple"}
        title="Delete equipment row"
        intent="danger"
        confirmLabel="Delete"
        busy={deleteSimple.isPending}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm?.kind !== "deleteSimple" || !project) return;
          const { family, row } = confirm;
          setConfirm(null);
          deleteSimple.mutate(
            {
              family, project, row,
              rollUp: buildFamilyRollUp({
                family,
                pv: family === "pv" ? pv.rows.filter((r) => r.id !== row.id) : pv.rows,
                inverters:
                  family === "inverter"
                    ? inverters.rows.filter((r) => r.id !== row.id)
                    : inverters.rows,
                substructures:
                  family === "substructure"
                    ? substructures.rows.filter((r) => r.id !== row.id)
                    : substructures.rows,
                storage:
                  family === "storage" ? storage.rows.filter((r) => r.id !== row.id) : storage.rows,
                hydrogen:
                  family === "hydrogen"
                    ? hydrogen.rows.filter((r) => r.id !== row.id)
                    : hydrogen.rows,
                substation:
                  family === "substation"
                    ? substation.rows.filter((r) => r.id !== row.id)
                    : substation.rows,
              }),
            },
            { onError: (e) => setError(e.message) },
          );
        }}
      />

      {/* The last-capacity guard's blocking dialog — information only, no confirm. */}
      <ConfirmDialog
        open={confirm?.kind === "blocked"}
        title={
          confirm?.kind === "blocked" && confirm.action === "deactivate"
            ? LAST_CAPACITY_TITLES.deactivate
            : LAST_CAPACITY_TITLES.delete
        }
        intent="info"
        onCancel={() => setConfirm(null)}
      >
        <Text>
          {confirm?.kind === "blocked" && confirm.reason !== "Capacity"
            ? opexDependencyMessage(confirm.reason, confirm.name)
            : confirm?.kind === "blocked" && confirm.action === "deactivate"
              ? LAST_CAPACITY_MESSAGES.deactivate
              : LAST_CAPACITY_MESSAGES.delete}
        </Text>
      </ConfirmDialog>

      {/* canvas 1.21.753 — con_GeneratorData_RightPanel_Form_ReplaceGeneratorType */}
      <FormPanel
        open={replaceWtg !== null}
        title={replaceGeneratorTitle(selectedTypeModel?.turbineType ?? selectedType?.generatorDisplayName)}
        onClose={() => setReplaceWtg(null)}
        onSave={commitReplaceWtg}
        saveLabel={REPLACE_LABELS.replace}
        saveDisabled={!replaceWtgOk}
        busy={replaceType.isPending}
      >
        {replaceWtg && (
          <div className={s.panel}>
            <Text weight="semibold">{REPLACE_LABELS.replaceFrom}</Text>
            <div className={s.grid2}>
              <div className={s.readField}>
                <span className={s.readLabel}>{REPLACE_LABELS.supplier}</span>
                <span className={s.readBox} {...a11y("cmb_Supplier_6")}>{selectedTypeModel?.supplier ?? ""}</span>
              </div>
              <div className={s.readField}>
                <span className={s.readLabel}>{REPLACE_LABELS.turbineType}</span>
                <span className={s.readBox} {...a11y("cmb_Supplier_7")}>{selectedTypeModel?.turbineType ?? ""}</span>
              </div>
              <div className={s.readField}>
                <span className={s.readLabel}>{REPLACE_LABELS.hubHeight}</span>
                <span className={s.readBox} {...a11y("cmb_Supplier_8")}>{fmtHubHeight(selectedTypeModel?.hubHeight)}</span>
              </div>
              <div className={s.readField}>
                <span className={s.readLabel}>{REPLACE_LABELS.numberOfGenerators}</span>
                <span className={s.readBox} {...a11y("txt_GeneratorData_RightPanel_Form_Fields_NumberOfGenerator_2")}>{replaceCount}</span>
              </div>
            </div>

            <Text weight="semibold">{REPLACE_LABELS.replaceTo}</Text>
            <Switch
              checked={replaceWtg.inCountry}
              label={REPLACE_LABELS.countryFilter}
              {...a11y("tgl_btn_GeneratorData_RightPanel_Form_Filter_Country_1", REPLACE_LABELS.countryFilter)}
              onChange={(_, d) => setReplaceWtg({ supplier: null, turbineType: null, hubHeight: null, revisedHubHeight: "", inCountry: d.checked })}
            />
            <div className={s.grid2}>
              <Field label={REPLACE_LABELS.supplier} required>
                <Dropdown
                  {...a11y("cmb_Supplier_3", REPLACE_LABELS.supplier)}
                  value={replaceWtg.supplier ?? ""}
                  selectedOptions={replaceWtg.supplier ? [replaceWtg.supplier] : []}
                  onOptionSelect={(_, d) => setReplaceWtg({ ...replaceWtg, supplier: d.optionValue ?? null, turbineType: null, hubHeight: null, revisedHubHeight: "" })}
                >
                  {replaceCascade.suppliers.map((x) => <Option key={x} value={x}>{x}</Option>)}
                </Dropdown>
              </Field>
              <Field label={REPLACE_LABELS.turbineType} required>
                <Dropdown
                  {...a11y("cmb_Supplier_4", REPLACE_LABELS.turbineType)}
                  disabled={!replaceWtg.supplier}
                  value={replaceWtg.turbineType ?? ""}
                  selectedOptions={replaceWtg.turbineType ? [replaceWtg.turbineType] : []}
                  onOptionSelect={(_, d) => setReplaceWtg({ ...replaceWtg, turbineType: d.optionValue ?? null, hubHeight: null })}
                >
                  {replaceCascade.turbineTypes.map((x) => <Option key={x} value={x}>{x}</Option>)}
                </Dropdown>
              </Field>
              {/* `Visible: Not(StartsWith(cmb_Supplier_3.Selected.Value, "Dummy"))` */}
              {!isDummySupplier(replaceWtg.supplier) ? (
                <Field label={REPLACE_LABELS.hubHeight} required>
                  <Dropdown
                    {...a11y("cmb_Supplier_5", REPLACE_LABELS.hubHeight)}
                    disabled={!replaceWtg.turbineType}
                    value={replaceWtg.hubHeight === null ? "" : String(replaceWtg.hubHeight)}
                    selectedOptions={replaceWtg.hubHeight === null ? [] : [String(replaceWtg.hubHeight)]}
                    onOptionSelect={(_, d) => setReplaceWtg({ ...replaceWtg, hubHeight: d.optionValue ? Number(d.optionValue) : null })}
                  >
                    {replaceCascade.hubHeights.map((x) => <Option key={x} value={String(x)}>{String(x)}</Option>)}
                  </Dropdown>
                </Field>
              ) : (
                <NumericInput
                  label={REPLACE_LABELS.hubHeight}
                  value={replaceWtg.revisedHubHeight}
                  places={2}
                  min={1}
                  max={200}
                  required
                  a11y={a11y("txt_GeneratorData_RightPanel_Form_Fields_HubHeight_2", REPLACE_LABELS.revisedHubHeight)}
                  onChange={(v) => setReplaceWtg({ ...replaceWtg, revisedHubHeight: v })}
                />
              )}
              <div className={s.readField}>
                <span className={s.readLabel}>{REPLACE_LABELS.numberOfGenerators}</span>
                <span className={s.readBox} {...a11y("txt_GeneratorData_RightPanel_Form_Fields_NumberOfGenerator_1")}>{replaceCount}</span>
              </div>
            </div>
            {replaceHeightBlocked && <Text className={s.hint}>{HEIGHT_LIMIT_PM_MESSAGE}</Text>}
          </div>
        )}
      </FormPanel>

      {/* canvas 1.21.753 — con_GeneratorData_RightPanel_Form_PvModuleTypeReplace */}
      <FormPanel
        open={replacePv !== null}
        title={replacePvTitle(selectedPv?.moduleLabel)}
        onClose={() => setReplacePv(null)}
        onSave={commitReplacePv}
        saveLabel={REPLACE_LABELS.replace}
        saveDisabled={!replacePvOk}
        busy={replacePvType.isPending}
      >
        {replacePv && (
          <div className={s.panel}>
            <Text weight="semibold">{REPLACE_LABELS.replaceFrom}</Text>
            <div className={s.grid2}>
              <div className={s.readField}>
                <span className={s.readLabel}>{PV_FIELD_LABELS.moduleLabel}</span>
                <span className={s.readBox} {...a11y("txt_GeneratorData_RightPanel_Form_PvModuleType_Fields_Label_1")}>{selectedPv?.moduleLabel ?? ""}</span>
              </div>
              <div className={s.readField}>
                <span className={s.readLabel}>{PV_FIELD_LABELS.capacity}</span>
                <span className={s.readBox} {...a11y("txt_GeneratorData_RightPanel_Form_PvModuleType_Fields_PVCapacityMW_1")}>{fmtCapacity(selectedPv?.capacity)}</span>
              </div>
              <div className={s.readField}>
                <span className={s.readLabel}>{PV_FIELD_LABELS.supplier}</span>
                <span className={s.readBox} {...a11y("cmb_GeneratorData_RightPanel_Form_PvModuleType_Fields_Supplier_1")}>{selectedPv?.supplier ?? ""}</span>
              </div>
            </div>

            <Text weight="semibold">{REPLACE_LABELS.replaceTo}</Text>
            <div className={s.grid2}>
              <TextFieldWithCount
                label={PV_FIELD_LABELS.moduleLabel}
                required
                value={replacePv.moduleLabel}
                maxLength={PV_MODULE_LABEL_MAX_LENGTH}
                a11y={a11y("txt_GeneratorData_RightPanel_Form_PvModuleType_Fields_Label_2")}
                onChange={(v) => setReplacePv({ ...replacePv, moduleLabel: v })}
              />
              <NumericInput
                label={PV_FIELD_LABELS.capacity}
                value={replacePv.capacity}
                places={2}
                min={0}
                max={500}
                required
                a11y={a11y("txt_GeneratorData_RightPanel_Form_PvModuleType_Fields_PVCapacityMW_2")}
                onChange={(v) => setReplacePv({ ...replacePv, capacity: v })}
              />
              <Field label={PV_FIELD_LABELS.supplier} required>
                <Combobox
                  {...a11y("cmb_GeneratorData_RightPanel_Form_PvModuleType_Fields_Supplier_2")}
                  placeholder={PV_SUPPLIER_PLACEHOLDER}
                  value={replacePv.supplier ?? ""}
                  selectedOptions={replacePv.supplier ? [replacePv.supplier] : []}
                  onOptionSelect={(_, d) => setReplacePv({ ...replacePv, supplier: d.optionValue ?? null, otherSupplier: "" })}
                >
                  {pvSupplierChoices.map((x) => <Option key={x} value={x}>{x}</Option>)}
                </Combobox>
              </Field>
              <PercentageInput
                label={PV_FIELD_LABELS.degradation1stYear}
                value={replacePv.degradation1stYear}
                a11y={a11y("txt_GeneratorData_RightPanel_Form_PvModuleType_Fields_DegradationFirstYear_2")}
                onChange={(v) => setReplacePv({ ...replacePv, degradation1stYear: v })}
              />
              <PercentageInput
                label={PV_FIELD_LABELS.degradationRemainingYears}
                value={replacePv.degradationRemainingYears}
                a11y={a11y("txt_GeneratorData_RightPanel_Form_PvModuleType_Fields_DegradationRemainingYears_2")}
                onChange={(v) => setReplacePv({ ...replacePv, degradationRemainingYears: v })}
              />
            </div>
          </div>
        )}
      </FormPanel>

      {/* The PM height-limitation override — replays the save with heightApproved. */}
      <ConfirmDialog
        open={confirm?.kind === "heightOverride"}
        title="Override the height limitation?"
        confirmLabel="Save anyway"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          if (panel.mode === "turbine") commitTurbineSave(true);
          else commitTypeSave(true);
        }}
      >
        <Text>{HEIGHT_LIMIT_PM_MESSAGE}</Text>
      </ConfirmDialog>
    </div>
  );
}
