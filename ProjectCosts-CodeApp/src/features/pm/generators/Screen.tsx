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
 *
 * D143 (split of this file, no visible change): the galleries are memoized sections (`sections/WtgSection.tsx`,
 * `sections/FamilySections.tsx`), the eight form panels are lazily loaded components (`sections/panels/`, `sections/panelLoader.ts`),
 * and each panel's derived values are pure functions (`sections/panelModels.ts`). What stays here: the screen's state (selection,
 * folding, the forms), the reads, the command bar, the confirmations and every write handler, so the write order is where it was.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { Button, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle, MessageBar, MessageBarBody } from "@fluentui/react-components";
import { CheckmarkRegular, LockClosedRegular } from "@fluentui/react-icons";
import { CommandBar, ConfirmDialog, EmptyState, InformationPopUp, LoadingOverlay, ReadOnlyField, WriteFeedback, type Command } from "@/components";
import { useSession } from "@/app/SessionContext";
import { GENERATORS_BULK } from "@/data/generatorsBulkFlags";
import { generatorsPerf } from "@/data/generatorsPerfFlags";
import { COMMAND_BAR_LABEL, DIALOG_LABELS, DIALOG_TEXT, PERMISSION_MSG, buildGeneratorPermissionPayload, buildInverterPermissionPayload, buildSubstructurePermissionPayload, permissionModuleName, requiresPermissionRequest, type PermissionFamily, GENERATORS_SCREEN_TEXT, GENERATOR_TYPE_SAVED_BANNER, LAST_CAPACITY_MESSAGES, LAST_CAPACITY_TITLES, PAGE_LOCK_TITLE, PV_MSG, TOTAL_CAPACITY_LABEL, WRITE_ERROR, WRITE_MSG, buildTurbineNames, capacityGuardReason, changeStatusDialog, commandBarOrder, commandBarState, commandParentKey, defaultSelection, forLanguage, generatorCommandIcon, heightLimitExceeded, heightPopupTypeName, isBodyVisible, isPageLocked, nextTurbineIndex, numericOr, opexDependencyMessage, pageLock, planCreateGeneratorType, planDeleteGeneratorType, planDeleteInverterOrSubstructure, planDeletePvType, planDeleteSimple, planDeleteTurbine, planGeneratorTypeFollowUp, planPvFollowUp, planSavePvType, planSaveSimple, planSaveTurbine, planToggleStatus, projectCatalog, pvSaveErrorText, pvSaveProgressText, pvDeleteErrorText, rowClickFolds, selectedIn, selectionAfterAddPv, selectionAfterAddWtg, simpleFormDefaults, simpleSaveProgressText, GUARD_READ_MSG, dataSettling, loadErrorMode, opexGuardBlock, opexReadBanner, opexReadState, pvDegradationPrefill, pvFollowUpIsNew, ROLLBACK_DETAIL_MAX, ROLLBACK_MSG, deletePartialMessage, describeLeftovers, planRollbackCreate, plannedDeleteRows, remainingRows, rollbackApplies, toggleExpanded, toggleSelection, turbineFormDefaults, turbineSaveProgressText, typeSaveProgressText, wtgFoldSelection, REPLACE_MSG, SUBSTRUCTURE_MSG, inverterFormDefaults, inverterSaveProgressText, planReplaceGeneratorType, planReplaceGeneratorTypeFollowUp, planReplacePvType, planReplacePvTypeFollowUp, planSaveInverter, planSaveSubstructure, replaceProgressText, replacePvProgressText, replaceSuccessText, substructureFormDefaults, substructureNeedsPvCapacity, substructureSaveProgressText, type CatalogModel, type GeneratorCommandKey, type GeneratorTypeRow, type LandedRowRef, type RollbackScenario, type InverterFormState, type PlanProject, type PlantFamily, type PvTypeFormState, type ReplaceInputs, type ReplaceWtgForm, type SelectedRow, type SimpleCapacityFamily, type SimpleFormState, type SimpleTypeRow, type SubstructureFormState, type TurbineFormState, type TurbineRow, type TypeFormState } from "./rules";
import { emptyPlan, type WritePlan } from "@/data/writePlan";
import type { PlanResult } from "@/data/executePlan";
import { SERVER_DECIDES, loadAllocations, loadNewTypeInputs, loadPvDeleteInputs, loadPvFollowUpInputs, useModulePermissionFlows, loadReplaceInputs, loadTypeDeleteInputs, useAllWtgLandLeaseCosts, useDeviceCosts, useEntraObjectId, useGeneratorCatalog, useGeneratorModels, useGeneratorTypes, useGeneratorWrites, useGeneratorsProject, useInflationIndex, useInverterTypes, useOpexDependency, usePlantSupplierCatalog, useProjectPlanning, useProjectTurbines, usePvModuleCatalog, usePvModuleTypes, useSimpleTypes, useSubstructureTypes } from "./hooks";
import { confirmNeedsLazyRead, lazyNeeds, lazyPending, loadGate, readKnown } from "./loadGate";
import { withReload, type ReloadKind } from "./reload";
import { applyOptimisticToggle, nextToggleStatus } from "./optimisticToggle";
import { HydrogenSection, InverterSection, PvSection, StorageSection, SubstationSection, SubstructureSection } from "./sections/FamilySections";
import { PanelHost } from "./sections/lazyPanels";
import {
  InverterPanel, PvPanel, ReplacePvPanel, ReplaceWtgPanel, SimplePanel, SubstructurePanel, TurbinePanel, TypePanel,
  schedulePanelPreload,
} from "./sections/panelLoader";
import {
  useInverterPanelModel, usePvPanelModel, useReplacePvModel, useReplaceWtgModel, useSimplePanelModel, useSubstructurePanelModel,
  useTurbinePanelModel, useTypePanelModel,
} from "./sections/panelModels";
import { SIMPLE_PANEL, emptyPvForm, emptyReplaceWtg, emptyTypeForm, isActive, pvPrefill, selectedIdOf, type DialogState, type Panel } from "./sections/state";
import { LOCK_TEXT, useStyles } from "./sections/styles";
import { useExpandedIds } from "./sections/useExpandedIds";
import { useStableCallback } from "./sections/useStableCallback";
import { WtgSection } from "./sections/WtgSection";

/** The rows a failed create left behind and what the rollback needs to remove them again (plan §9.3). */
interface RollbackTarget {
  /** The project the failed save was for: a late result or a Retry for another project is dropped (review finding 3b). */
  projectId: string | undefined;
  rows: LandedRowRef[];
  /** Rows of a failed bulk create that may or may not exist (`writes.lastMaybeLanded()`); undone too, a 404 on them is harmless (DEL-5). */
  maybeLanded: LandedRowRef[];
  rollupRan: boolean;
  typeName: string | null;
}
/** What a failed delete job removed and did not remove (DEL-5), shown after the job's own error text. */
interface DeletePartialNotice {
  /** The project the delete ran for; it never shows on another project. */
  projectId: string | undefined;
  text: string;
}
/** The outcome of a rollback; `leftover` is set when the cleanup failed and **Retry cleanup** is offered. */
interface RollbackNotice {
  /** The project the notice belongs to; it never shows on another project (review finding 3b). */
  projectId: string | undefined;
  text: string;
  leftover: (RollbackTarget & { reason: string | null }) | null;
}

/* ──────────────────────────────────────────────────────────────────── screen */

/**
 * One screen instance PER PROJECT (generators review F9 / GR-6): the route element is the same component for every project,
 * so an open panel, a selection, a pager position and a half-typed form of project A would stay mounted over project B.
 * Keying by the project id gives each project a fresh state (same pattern as the Contracts screen).
 */
export default function GeneratorsScreen() {
  const { projectId } = useSession();
  return <GeneratorsScreenBody key={projectId ?? "none"} />;
}

function GeneratorsScreenBody() {
  const s = useStyles();
  // The user's language (`Language()` in the canvas): decimal separators in boxes, cards and messages follow it.
  const { projectId, locale: lang } = useSession();

  const perf = generatorsPerf();

  /* ── selection, panels and dialogs: declared before the reads, because the lazy reads are enabled by what is open (D141) ── */
  const [selection, setSelection] = useState<SelectedRow | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const needs = lazyNeeds({
    panel: panel?.kind, dialog: dialog?.kind, dialogFamily: dialog?.kind === "deleteSimple" ? dialog.family : null,
  }, perf.gateByList);

  /* ── data ── */
  const projectQ = useGeneratorsProject(projectId);
  const project = projectQ.data;
  const planningQ = useProjectPlanning(projectId);
  const planning = planningQ.data;
  const typesQ = useGeneratorTypes(projectId);
  const types = typesQ.data;
  // D143: memoized id lists, so the two reads below see the same arrays until the types change.
  const typeIds = useMemo(() => types.map((t) => t.id), [types]);
  const generatorIds = useMemo(() => types.map((t) => t.generatorId).filter((v): v is string => Boolean(v)), [types]);
  const modelsQ = useGeneratorModels(generatorIds);
  // D141 (`GENERATORS_PERF.gateByList`): the catalogue, the price index and the device costs load when a panel needs them.
  const catalogQ = useGeneratorCatalog(project?.fid, needs.catalog);
  const indexQ = useInflationIndex(project?.fid, needs.index);
  const deviceQ = useDeviceCosts(project?.countryId, needs.device);
  const turbinesQ = useProjectTurbines(projectId, typeIds);
  const pvCatalogQ = usePvModuleCatalog();
  const pvQ = usePvModuleTypes(projectId, pvCatalogQ.data);
  const inverterQ = useInverterTypes(projectId);
  const substructureQ = useSubstructureTypes(projectId);
  const storageQ = useSimpleTypes("storage", projectId);
  const hydrogenQ = useSimpleTypes("hydrogen", projectId);
  const substationQ = useSimpleTypes("substation", projectId);
  const allWtgQ = useAllWtgLandLeaseCosts(projectId, needs.allWtg);
  const entraObjectId = useEntraObjectId();
  const writes = useGeneratorWrites(projectId);
  const permissionFlows = useModulePermissionFlows();
  /*
   * DIVERGENCE (plan §9.3, flag `GENERATORS_BULK.createRollback`, false today): the canvas leaves a partly-saved
   * WTG type behind when its save fails. With the flag on, the rows that landed are deleted again, and when that
   * fails too the screen says what is left and offers "Retry cleanup". All of it is inert while the flag is off.
   */
  const [rollbackNotice, setRollbackNotice] = useState<RollbackNotice | null>(null);
  const [createFailure, setCreateFailure] = useState<RollbackTarget | null>(null);
  /** DEL-5: "Removed: ...; Not removed: ..." of a delete job that failed part-way, appended to its error. */
  const [deletePartial, setDeletePartial] = useState<DeletePartialNotice | null>(null);
  /** The autonumber the failed save's new type got (read from the create's response), for the leftover message. */
  const createdTypeName = useRef<string | null>(null);
  /** Every place that cleared the write messages also forgets a pending rollback / leftover. */
  const clearWrites = () => { writes.clear(); setRollbackNotice(null); setCreateFailure(null); setDeletePartial(null); };
  // A new project starts with a clean slate (state adjusted while rendering, not in an effect). Flag off: untouched.
  const [rollbackProjectId, setRollbackProjectId] = useState(projectId);
  if (rollbackProjectId !== projectId) {
    setRollbackProjectId(projectId);
    if (GENERATORS_BULK.createRollback) clearWrites();
  }
  /** The failed save whose rollback has been started (an effect must not set state to say so). */
  const startedFailure = useRef<RollbackTarget | null>(null);
  /** A rollback job is running: a double click or a double effect must not start a second one (review finding 3a). */
  const rollbackInFlight = useRef(false);
  /** The project shown now, for a rollback that finishes after the user moved on (review finding 3b). */
  const currentProjectId = useRef(projectId);
  useEffect(() => { currentProjectId.current = projectId; }, [projectId]);
  // D143 (item 8b): fetch the panel chunks once the browser is idle, so the first panel opens without waiting for them.
  useEffect(() => schedulePanelPreload(), []);
  /**
   * Per save: the first plan (it ends with the roll-up) has finished once `then` starts, and the approval flow
   * call has resolved once `request` returned (review findings 2 and 1). Reset at the start of every save.
   */
  const firstPlanDone = useRef(false);
  const permissionRequested = useRef(false);
  /** The rollback notice of THIS project only (review finding 3b). */
  const shownNotice = rollbackNotice?.projectId === projectId ? rollbackNotice : null;
  /** The partial-delete text of THIS project only, and only while the job's own error is on the bar. */
  const shownPartial = deletePartial && deletePartial.projectId === projectId ? deletePartial.text : null;
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

  /**
   * D143 (`GENERATORS_PERF.optimisticToggle`, default OFF): set while the status toggle's optimistic rows are in the cache.
   * "writing": the job is running; "reloading": its writes are over and the reload that brings the server's rows is running.
   */
  const [optimisticPhase, setOptimisticPhase] = useState<"writing" | "reloading" | null>(null);
  // Not settled until the reload has ended: a "reloading" phase counts only while the hook says it is reloading.
  const optimisticActive = optimisticPhase === "writing" || (optimisticPhase === "reloading" && writes.refreshing === true);

  /*
   * D141 (`GENERATORS_PERF.gateByList`): the LIST waits only for the reads its cards show. The catalogue, the price index,
   * the device costs and the AllWTG costs are lazy (`loadGate.ts`); they keep the writes held back while a panel that needs
   * one has no answer yet (`gate.lazyWaiting`, below), and a lazy read that has not started is neither loading nor failed.
   * Switch off: all 16 gate the screen, as before.
   */
  const gate = loadGate({
    gateByList: perf.gateByList,
    list: [
      projectQ, planningQ, typesQ, modelsQ, turbinesQ, pvCatalogQ, pvQ,
      inverterQ, substructureQ, storageQ, hydrogenQ, substationQ,
    ],
    lazy: [
      { read: catalogQ, needed: needs.catalog }, { read: indexQ, needed: needs.index },
      { read: deviceQ, needed: needs.device }, { read: allWtgQ, needed: needs.allWtg },
    ],
  });
  const loading = gate.loading;
  // F7: a failed query with NO data blanks the screen (the empty state); a failed refresh that still has data is a banner.
  const loadErrorKind = loadErrorMode(gate.reads);
  /**
   * F3: the reads a write builds its rows from have not settled — the first read of the index, the device costs or the
   * turbines, or the turbines / models are still the PREVIOUS type set's after a save changed it.
   */
  const settling = dataSettling([
    { loading: indexQ.isLoading }, { loading: deviceQ.isLoading }, { loading: typesQ.isLoading },
    { loading: turbinesQ.isLoading, placeholder: turbinesQ.placeholder },
    { loading: modelsQ.isLoading, placeholder: modelsQ.placeholder },
    // D141: a lazy read the open panel needs has not answered yet (always false with `gateByList` off).
    { loading: gate.lazyWaiting },
    // D143: the status toggle has shown a result before the save landed: the rows in the cache are not the server's yet, so
    // no write is built from them until the reload has replaced them (always false with `optimisticToggle` off).
    { loading: optimisticActive },
  ]);

  /* ── folding ── */
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const selectedType = selectedIn(selection, "wtg", types);
  const selectedPv = selectedIn(selection, "pv", pvQ.data);
  const selectedInverter = selectedIn(selection, "inverter", inverterQ.data);
  const selectedSubstructure = selectedIn(selection, "substructure", substructureQ.data);
  const selectedStorage = selectedIn(selection, "storage", storageQ.data);
  const selectedHydrogen = selectedIn(selection, "hydrogen", hydrogenQ.data);
  const selectedSubstation = selectedIn(selection, "substation", substationQ.data);
  const selectedTypeModel = modelOf(selectedType);
  const opexWtgQ = useOpexDependency(projectId, selectedType?.id);
  const opexPvQ = useOpexDependency(projectId, selectedPv?.id);
  const opexWtg = opexWtgQ.data;
  const opexPv = opexPvQ.data;
  // F1: the O&M read must be KNOWN before Delete / Deactivate / Delete PV may open (a test double without `hasData` counts as known).
  const opexReads = {
    wtg: opexReadState({ needed: Boolean(selectedType), known: readKnown(opexWtgQ), failed: Boolean(opexWtgQ.error) }),
    pv: opexReadState({ needed: Boolean(selectedPv), known: readKnown(opexPvQ), failed: Boolean(opexPvQ.error) }),
  };
  const opexBanner = opexReadBanner(opexReads);

  // D143: handlers handed to the memoized sections keep one identity (`useStableCallback`), so a section re-renders for its
  // own data, not because the screen re-rendered.
  const onRowClick = useStableCallback((family: PlantFamily, id: string) => {
    setSelection((p) => toggleSelection(p, family, id));
    if (rowClickFolds(family)) setExpanded((p) => toggleExpanded(p, id));
  });
  /**
   * A row a save has just created opens unfolded: the canvas `Collect`s it into its gallery
   * collection without `IsFolded` (blank = not folded), so the new card shows its details.
   */
  const expandCreated = (id: string | undefined) => {
    if (id) setExpanded((p) => (p.has(id) ? p : new Set(p).add(id)));
  };
  const onFold = useStableCallback((family: PlantFamily, id: string) => {
    if (family === "wtg") {
      setSelection(wtgFoldSelection(!expanded.has(id), id));
      setExpanded((p) => toggleExpanded(p, id));
    } else {
      onRowClick(family, id);
    }
  });
  // The ids of each family's expanded cards, as a set whose identity changes only when ITS cards fold or unfold.
  const wtgExpanded = useExpandedIds(expanded, types);
  const pvExpanded = useExpandedIds(expanded, pvQ.data);
  const inverterExpanded = useExpandedIds(expanded, inverterQ.data);
  const substructureExpanded = useExpandedIds(expanded, substructureQ.data);
  const storageExpanded = useExpandedIds(expanded, storageQ.data);
  const hydrogenExpanded = useExpandedIds(expanded, hydrogenQ.data);
  const substationExpanded = useExpandedIds(expanded, substationQ.data);

  /* ── panels, dialogs, forms ── */
  const [inCountry, setInCountry] = useState(true);
  const [typeForm, setTypeForm] = useState<TypeFormState>(emptyTypeForm);
  const [turbineForm, setTurbineForm] = useState<TurbineFormState>(() => turbineFormDefaults({ turbine: null, model: null, nextIndex: 1 }));
  const [applyAll, setApplyAll] = useState({ capacity: false, plinth: false, hubHeight: false });
  const [pvForm, setPvForm] = useState<PvTypeFormState>(emptyPvForm);
  const [simpleForm, setSimpleForm] = useState<SimpleFormState>(() => simpleFormDefaults("storage", null));
  const [pages, setPages] = useState<Record<string, number>>({});

  const close = useCallback(() => setPanel(null), [setPanel]);
  const closeDialog = () => setDialog(null);
  const markDirty = (dirty: Set<string>, field: string) => new Set(dirty).add(field);
  const planProject: PlanProject | null = project
    ? { id: project.id, shortName: project.shortName, owningBusinessUnitId: project.owningBusinessUnitId }
    : null;

  /*
   * D143: each panel's derived values (`sections/panelModels.ts`, the former inline blocks, unchanged) are computed inside
   * `useMemo` keyed on what they read, so their identity holds until an input changes and the memoized panels skip the render.
   */

  /* Rules 3–10 — the type panel's cascade, model, derived cost and height gate. */
  const indexLoading = indexQ.isLoading || lazyPending(needs.index && perf.gateByList, indexQ);
  const indexFailed = Boolean(indexQ.error);
  const typeModel = useTypePanelModel({
    projected, inCountry, form: typeForm, lang, accumulatedIndex: indexQ.data, index: { loading: indexLoading, failed: indexFailed },
    project, planning, entraObjectId,
  });
  const { effectiveHubHeight, resolvedModel, derivedCost, prospectiveHeight } = typeModel;
  const touchType = useStableCallback(<K extends keyof TypeFormState>(field: K, value: TypeFormState[K]) =>
    setTypeForm((prev) => {
      const next = { ...prev, [field]: value, dirty: markDirty(prev.dirty, String(field)) };
      // `Reset(cmb_Supplier_1)` / `Reset(…HubHeight_1)` / `Reset(…NumberOfGenerator)` — the cascade clears downstream.
      if (field === "supplier") { next.turbineType = null; next.hubHeight = null; next.revisedHubHeight = ""; next.numberOfGenerators = ""; }
      if (field === "turbineType") { next.hubHeight = null; next.revisedHubHeight = ""; next.numberOfGenerators = ""; }
      if (field === "hubHeight") { next.revisedHubHeight = ""; next.numberOfGenerators = ""; }
      return next;
    }));
  const onInCountryChange = useStableCallback((checked: boolean) => { setInCountry(checked); setTypeForm(emptyTypeForm()); });

  /* Rule 11 — the turbine panel. */
  const panelType = panel?.kind === "turbine" ? types.find((t) => t.id === panel.typeId) ?? null : null;
  const panelTurbines = panelType ? turbinesByType.get(panelType.id) ?? [] : [];
  const panelTurbine = panel?.kind === "turbine" ? panelTurbines.find((t) => t.id === panel.turbineId) ?? null : null;
  const panelModel = modelOf(panelType);
  const turbineModel = useTurbinePanelModel({
    form: turbineForm, turbine: panelTurbine, model: panelModel, turbines: turbinesQ.data, lang, planning, project, entraObjectId,
  });
  const { totalHeight: turbineHeight } = turbineModel;
  const touchTurbine = useStableCallback(<K extends keyof TurbineFormState>(field: K, value: TurbineFormState[K]) =>
    setTurbineForm((prev) => ({ ...prev, [field]: value, dirty: markDirty(prev.dirty, String(field)) })));
  /** `chk_…_All.OnCheck` / `.OnUncheck` (Y:10908-10918): the row is dirty while checked. */
  const applyAllChange = useStableCallback((key: "capacity" | "plinth" | "hubHeight", checked: boolean) => {
    setApplyAll((p) => ({ ...p, [key]: checked }));
    setTurbineForm((prev) => {
      const dirty = new Set(prev.dirty);
      if (checked) dirty.add(`applyAll-${key}`); else dirty.delete(`applyAll-${key}`);
      return { ...prev, dirty };
    });
  });

  /* The PV module type panel. */
  const pvModel = usePvPanelModel({ form: pvForm, catalogue: pvCatalogQ.data, lang });
  const { otherChosen: otherSupplierChosen } = pvModel;
  const touchPv = useStableCallback(<K extends keyof PvTypeFormState>(field: K, value: PvTypeFormState[K]) =>
    setPvForm((prev) => {
      const next = { ...prev, [field]: value, dirty: markDirty(prev.dirty, String(field)) };
      // `cmb_…Supplier.OnChange`: `Reset(txt_…OtherSupplier)` — back to the row's stored value.
      if (field === "supplier") next.otherSupplier = selectedPv?.otherSupplier ?? "";
      return next;
    }));

  /* The BESS / Hydrogen / Substation panels. */
  const simpleFamily: SimpleCapacityFamily | null =
    panel?.kind === "storage" || panel?.kind === "hydrogen" || panel?.kind === "substation" ? panel.kind : null;
  const simpleRowsOf = (f: SimpleCapacityFamily) =>
    f === "storage" ? storageQ.data : f === "hydrogen" ? hydrogenQ.data : substationQ.data;
  const simpleSelectedOf = (f: SimpleCapacityFamily) =>
    f === "storage" ? selectedStorage : f === "hydrogen" ? selectedHydrogen : selectedSubstation;
  const simpleModel = useSimplePanelModel({ family: simpleFamily, form: simpleForm, lang });
  const touchSimple = useStableCallback(<K extends keyof SimpleFormState>(field: K, value: SimpleFormState[K]) =>
    setSimpleForm((prev) => ({ ...prev, [field]: value, dirty: markDirty(prev.dirty, String(field)) })));

  /* G9 — the Add / Edit Inverter panel, bound to the selected inverter row (or a new one). */
  const [inverterForm, setInverterForm] = useState<InverterFormState>(() => inverterFormDefaults(null));
  const inverterCatalogQ = usePlantSupplierCatalog("inverter", panel?.kind === "inverter");
  const inverterModel = useInverterPanelModel({ form: inverterForm, catalogue: inverterCatalogQ.data, lang });
  const { other: inverterOther, otherValue: inverterOtherValue, requests: inverterRequests } = inverterModel;
  // `DisplayMode: If(IsBlank(<row>.Inverter), Edit, View)` and the title test the stored catalogue row.
  const inverterEditing = Boolean(selectedInverter?.catalogueId);
  const touchInverter = useStableCallback(<K extends keyof InverterFormState>(field: K, value: InverterFormState[K]) =>
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
    }));

  /* G9 — the Add / Edit Substructure panel. */
  const [substructureForm, setSubstructureForm] = useState<SubstructureFormState>(() => substructureFormDefaults(null));
  const substructureCatalogQ = usePlantSupplierCatalog("substructure", panel?.kind === "substructure");
  const substructureModel = useSubstructurePanelModel({ form: substructureForm, catalogue: substructureCatalogQ.data });
  const { other: substructureOther, otherValue: substructureOtherValue, requests: substructureRequests } = substructureModel;
  const substructureEditing = Boolean(selectedSubstructure?.catalogueId);
  const touchSubstructure = useStableCallback(<K extends keyof SubstructureFormState>(field: K, value: SubstructureFormState[K]) =>
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
    }));

  /* G6 — Replace Generator Type (1.21.753): the "Replace to" cascade reuses the type panel's rules. */
  const [replaceWtg, setReplaceWtg] = useState<ReplaceWtgForm>(() => emptyReplaceWtg());
  const writing = writes.progress !== null;
  const replaceWtgM = useReplaceWtgModel({
    projected, form: replaceWtg, selectedCount: selectedType?.numberOfGenerators, accumulatedIndex: indexQ.data, lang, planning,
    project, entraObjectId, inProgress: writing,
  });
  const {
    hub: replaceHub, model: replaceModel, count: replaceCount, cost: replaceCost, heightBlocked: replaceHeightBlocked,
  } = replaceWtgM;

  /* G6 — Replace PV Module Type: the "Replace to" form is the PV panel's form and validation. */
  const [replacePvForm, setReplacePvForm] = useState<PvTypeFormState>(emptyPvForm);
  const replacePvM = useReplacePvModel({ form: replacePvForm, catalogue: pvCatalogQ.data, lang, inProgress: writing });
  const { other: replacePvOther } = replacePvM;
  const touchReplacePv = useStableCallback(<K extends keyof PvTypeFormState>(field: K, value: PvTypeFormState[K]) =>
    setReplacePvForm((prev) => ({
      ...prev, [field]: value, dirty: markDirty(prev.dirty, String(field)),
      ...(field === "supplier" ? { otherSupplier: "" } : {}),
    })));

  /* ── the command bar ── */
  // A New Project (no record yet) is locked too: `IsBlank(gblRecordSelectedProject.'Project ID')`.
  const locked = !loading && isPageLocked(project);
  const editable = !locked;
  /**
   * Save performance (6 Nov 2026): a save's dialog closes before the screen has reloaded (`useGeneratorWrites`).
   * Until it has, the actions that write or open a panel wait, so none starts from the data before the save
   * (e.g. a next turbine number taken from the old list). Selection and folding stay available.
   */
  // F3: also while the first read is running and while the turbines / index / device costs have not settled.
  const actionsOpen = editable && !loading && !writes.refreshing && !settling;
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
    project !== null && actionsOpen && cmdState[key].visible && cmdState[key].enabled;
  const commands: Command[] = commandBarOrder(familySelected)
    .filter((key) => cmdState[key].visible)
    .map((key) => {
      const icon = generatorCommandIcon(key, cmdState[key]);
      const parentKey = commandParentKey(key, familySelected);
      // F1 / F3 — NEW TEXT: why a command that would be enabled waits (the O&M read, or the data that is reloading).
      const guard = opexGuardBlock(key, opexReads);
      const waitReason = guard ?? (settling ? GUARD_READ_MSG.settling : null);
      return {
        key,
        label: cmdState[key].label,
        ...(icon ? { icon } : {}),
        ...(parentKey ? { parentKey } : {}),
        enabled: commandEnabled(key) && guard === null,
        ...(waitReason ? { reason: waitReason } : {}),
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
    setSimpleForm(simpleFormDefaults(family, simpleSelectedOf(family), lang));
    setPanel({ kind: family });
  };

  const onCommand = (key: string) => {
    // F1: Delete / Deactivate / Delete PV never open while the selected type's O&M link is unknown (pending or failed read).
    if (opexGuardBlock(key as GeneratorCommandKey, opexReads) !== null) return;
    clearWrites();
    switch (key as GeneratorCommandKey) {
      case "addWTGType":
        setSelection(selectionAfterAddWtg(selection));
        setTypeForm(emptyTypeForm()); setInCountry(true); setPanel({ kind: "type" }); break;
      case "addPVType":
        setSelection(selectionAfterAddPv(selection));
        setPvForm(selectedPv ? {
          moduleLabel: selectedPv.moduleLabel ?? "",
          capacity: pvPrefill(selectedPv.capacity, lang),
          supplier: selectedPv.catalogueId ?? null,
          otherSupplier: selectedPv.otherSupplier ?? "",
          degradation1stYear: pvDegradationPrefill(selectedPv.degradation1stYear, lang),
          degradationRemainingYears: selectedPv.degradationRemainingYears === null ? "" : forLanguage(String(selectedPv.degradationRemainingYears), lang),
          dirty: new Set<string>(),
        } : emptyPvForm());
        setPanel({ kind: "pv" });
        break;
      case "addInverterType":
        setInverterForm(inverterFormDefaults(selectedInverter, lang));
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

  const openTurbine = useStableCallback((type: GeneratorTypeRow, turbine: TurbineRow | null) => {
    clearWrites();
    setSelection({ family: "wtg", id: type.id });
    setApplyAll({ capacity: false, plinth: false, hubHeight: false });
    setTurbineForm(turbineFormDefaults({ turbine, model: modelOf(type), nextIndex: nextTurbineIndex(turbinesQ.data), lang }));
    setPanel({ kind: "turbine", typeId: type.id, turbineId: turbine?.id ?? null });
  });
  /** The delete icon of a turbine row: the last-capacity / O&M guard runs before the confirmation opens. */
  const onDeleteTurbine = useStableCallback((type: GeneratorTypeRow, turbine: TurbineRow) => {
    clearWrites();
    setSelection({ family: "wtg", id: type.id });
    guardThen("wtg", turbine.effectiveCapacity, { active: isActive(type.status), name: turbine.name },
      () => setDialog({ kind: "deleteTurbine", turbine }));
  });
  /** A WTG card's pager (the page shown per type). */
  const onPage = useCallback((typeId: string, page: number) => setPages((prev) => ({ ...prev, [typeId]: page })), [setPages]);

  /* ── the writes ── */
  // A new write command forgets an earlier rollback notice and its leftover rows (rollback jobs call `writes.run` directly).
  /**
   * F4 — one write job at a time. `writes.progress` only shows after the next render, so a second click on Save during the
   * panel's exit animation (or a double click on a confirmation) would start a second job (a second create). A ref closes
   * that gap; it also refuses a job while a rollback runs. A refused job resolves to null, like a failed one, and sends nothing.
   */
  const jobInFlight = useRef(false);
  const writeBusy = () => jobInFlight.current || rollbackInFlight.current;
  /**
   * A job plus the kind of save it is (`reload`, D141): the kind says which queries the save reloads afterwards
   * (`reload.ts`). A job with no kind, and every job while `GENERATORS_PERF.targetedReload` is off, reloads everything.
   */
  type ScreenJob = Parameters<typeof writes.run>[0] & { reload?: ReloadKind };
  const run = async (job: ScreenJob) => {
    if (writeBusy()) return null;
    jobInFlight.current = true;
    try {
      setRollbackNotice(null);
      setCreateFailure(null);
      setDeletePartial(null);
      const { reload, ...plain } = job;
      return await writes.run(reload ? withReload(plain, projectId, reload) : plain);
    } finally {
      jobInFlight.current = false;
    }
  };

  /**
   * A delete job (DEL-5). When it FAILS, the rows its plan tried to delete (`plannedDeleteRows`) are set against the rows
   * `usePlanWrite` reports as deleted (`lastDeleted()`), and `deletePartialMessage` says what was removed and what was not.
   * The text follows the job's own error, never replaces it; nothing is added when every attempted row went (for example
   * only the final roll-up failed), when NONE went (review F3 item 2), the plan never ran or it was refused. `typeName` names the one type row of a type delete.
   */
  const runDelete = async (job: ScreenJob, typeName: string | null = null) => {
    // F4: a delete refused by the one-job guard sent nothing, so it must not read the running job's deleted rows.
    if (writeBusy()) return null;
    const box: { ran: WritePlan | null } = { ran: null };
    const plan = job.plan;
    const ids = await run({
      ...job,
      plan: typeof plan === "function" ? async () => { box.ran = await plan(); return box.ran; } : (box.ran = plan),
    });
    // A refused plan sent nothing: there is no partial state to describe.
    // Review F3 item 2: and nothing when no row was deleted at all (the original error stands; "press again" would mislead).
    if (ids === null && box.ran && !box.ran.refusedReason) {
      const deleted = writes.lastDeleted();
      const text = deleted.length > 0
        ? deletePartialMessage({ attempted: plannedDeleteRows(box.ran), deleted, typeName })
        : null;
      if (text) setDeletePartial({ projectId, text });
    }
    return ids;
  };

  /**
   * Runs the rollback job (plan §9.3) for `target` and reports the outcome in the error bar. A job through
   * `writes.run` like any other, so it traces (rule 23) and blocks the commands while it runs. The engine treats a
   * delete answering 404 as already gone, so running it again over the same rows is safe.
   * Success: the original reason plus `ROLLBACK_MSG.undone`. Failure or refusal: `ROLLBACK_MSG.leftover`, which says
   * what is left, and the **Retry cleanup** button. DEL-5: the leftover is the recorded rows minus the ones the failed
   * rollback did delete (`writes.lastDeleted()`), so Retry works on the reduced list; with nothing left but a failed
   * roll-up the message says so and offers no retry.
   */
  const runRollback = async (target: RollbackTarget, reason: string | null) => {
    // A rollback is already running (double click, double effect): never start a second one.
    if (rollbackInFlight.current) return;
    // The target belongs to another project than the one shown: recomputing with this project's data would be wrong.
    if (target.projectId !== projectId) return;
    if (!planProject) {
      setRollbackNotice({
        projectId: target.projectId, leftover: null,
        text: reason ? `${reason} ${ROLLBACK_MSG.noProject}` : ROLLBACK_MSG.noProject,
      });
      return;
    }
    rollbackInFlight.current = true;
    setRollbackNotice(null);
    try {
      // The rollback's own error text, caught as `usePlanWrite` builds it (the shared bar is only re-rendered later).
      const own: { detail: string | null } = { detail: null };
      const done = await writes.run({
        progress: ROLLBACK_MSG.progress,
        errorText: (detail) => { own.detail = detail; return detail; },
        plan: planRollbackCreate({
          project: planProject, landed: target.rows, maybeLanded: target.maybeLanded, rollupRan: target.rollupRan,
          remainingTypes: types,
        }),
      });
      // The project changed while the rollback ran: its late result must not show on the new project.
      if (currentProjectId.current !== target.projectId) {
        // `writes.run` has just put the rollback's own error on the shared bar: take it off the new project again.
        writes.clear();
        return;
      }
      if (done !== null) {
        setRollbackNotice({ projectId: target.projectId, text: reason ? `${reason} ${ROLLBACK_MSG.undone}` : ROLLBACK_MSG.undone, leftover: null });
        return;
      }
      // DEL-5: the rows the failed rollback did delete are not left over; Retry cleanup works on what remains.
      const deleted = writes.lastDeleted();
      const rows = remainingRows(target.rows, deleted);
      const maybeLanded = remainingRows(target.maybeLanded, deleted);
      // Review F3 item 4: certain rows -> the full list; only maybe-landed rows -> "may not have been removed" (Retry stays);
      // the totals text only when BOTH lists are empty (the roll-up alone failed).
      const base = rows.length > 0
        ? ROLLBACK_MSG.leftover(describeLeftovers(rows, { typeName: target.typeName }))
        : maybeLanded.length > 0 ? ROLLBACK_MSG.maybeLeft : ROLLBACK_MSG.totalsFailed;
      const detail = own.detail?.trim() ?? null;
      const shownDetail = detail && detail !== base
        ? (detail.length > ROLLBACK_DETAIL_MAX ? `${detail.slice(0, ROLLBACK_DETAIL_MAX)}...` : detail)
        : null;
      setRollbackNotice({
        projectId: target.projectId,
        text: shownDetail ? `${base} ${shownDetail}` : base,
        // Unconfirmed rows still to undo keep the retry open; with nothing left to delete there is nothing to retry.
        leftover: rows.length > 0 || maybeLanded.length > 0 ? { ...target, rows, maybeLanded, reason } : null,
      });
    } finally {
      rollbackInFlight.current = false;
    }
  };

  /**
   * Consulted after EVERY create job (plan §9.3): `rollbackApplies` says whether the save is rolled back. Only the WTG
   * type scenarios are, and only with the flag on; nothing landed means nothing to undo (today's error only). The
   * rollback itself starts from the effect below, once the screen has the failed save's error text in hand.
   */
  const queueRollback = (scenario: RollbackScenario, ids: readonly string[] | null, rollupRan: boolean) => {
    if (ids !== null || !GENERATORS_BULK.createRollback || !rollbackApplies(scenario)) return;
    const rows = [...writes.lastLanded()];
    // DEL-5: rows of a failed bulk create that may exist are undone as well (the engine treats a 404 on a delete as gone).
    const maybeLanded = [...writes.lastMaybeLanded()];
    if (rows.length > 0 || maybeLanded.length > 0) {
      setCreateFailure({ projectId, rows, maybeLanded, rollupRan, typeName: createdTypeName.current });
    }
  };
  useEffect(() => {
    if (!createFailure || writes.progress !== null || startedFailure.current === createFailure) return;
    startedFailure.current = createFailure;
    void runRollback(createFailure, writes.error);
  }, [createFailure, writes.progress]); // eslint-disable-line react-hooks/exhaustive-deps -- starts once per failure

  /** **Retry cleanup**: the same rollback over only the recorded leftover rows. No automatic retries. */
  const retryCleanup = () => {
    const left = rollbackNotice && rollbackNotice.projectId === projectId ? rollbackNotice.leftover : null;
    if (left) void runRollback(left, left.reason);
  };
  const lists = () => ({
    wtg: types, pv: pvQ.data, hydrogen: hydrogenQ.data, storage: storageQ.data, substation: substationQ.data,
  });

  const saveType = async () => {
    if (!project || !planProject || !resolvedModel || writeBusy()) return;
    const header = project;
    const model = resolvedModel;
    const n = numericOr(typeForm.numberOfGenerators, 0, lang);
    const requesting = requiresPermissionRequest(inCountry);
    const progress = typeSaveProgressText(model.displayName, inCountry);
    const names = buildTurbineNames({ shortName: planProject.shortName, existing: turbinesQ.data, count: n });
    createdTypeName.current = null;
    firstPlanDone.current = false;
    permissionRequested.current = false;
    close();
    /*
     * Save performance (6 Nov 2026): ONE job. The queued second step (the device-type row and the AllWTG
     * allocations, which need the new type's autonumber name and the turbine ids) runs as the job's `then`,
     * so the screen reloads once at the end instead of after each step.
     */
    const ids = await run({
      reload: "addWtgType",
      progress,
      success: GENERATOR_TYPE_SAVED_BANNER,
      errorText: WRITE_ERROR.typeSave,
      plan: planCreateGeneratorType({
        project: planProject, inCountry, model, numberOfGenerators: n, costPerWtg: derivedCost,
        selectedHeight: effectiveHubHeight ?? 0, revisedHubHeight: numericOr(typeForm.revisedHubHeight, 0, lang),
        existingTypes: types, projectTurbines: turbinesQ.data,
      }),
      then: async (first: PlanResult): Promise<WritePlan | null> => {
        // The first plan, which ends with the roll-up, has completed once `then` runs (review finding 2).
        firstPlanDone.current = true;
        const typeId = first.createdIds[0];
        if (!typeId) return null;
        const landedName = first.createdRows?.[typeId]?.["vsb_name"];
        createdTypeName.current = typeof landedName === "string" && landedName !== "" ? landedName : null;
        // D97 — out of country: `RequestModulePermission` for the new type instead of the roll-up (Y:15214, Y:16514).
        if (requesting) {
          await permissionFlows.request(buildGeneratorPermissionPayload(header, typeId, model.id));
          permissionRequested.current = true;
        }
        /*
         * Save performance (6 Nov 2026): the create returned the new row, its autonumber `vsb_name` included
         * (`PlanResult.createdRows`), so the name needs no read-back; and a type this save has just created has
         * no `DeviceTypesInProjects` row yet (no plugin or flow creates one — `hooks.ts`). The two reads of
         * `loadNewTypeInputs` stay only as the fallback for a create that came back without the name.
         */
        const createdName = first.createdRows?.[typeId]?.["vsb_name"];
        const inputs = typeof createdName === "string" && createdName !== ""
          ? { typeName: createdName, hasDeviceType: false }
          : await loadNewTypeInputs("wtg", typeId);
        return planGeneratorTypeFollowUp({
          project: planProject, typeId, typeName: inputs.typeName, hasDeviceType: inputs.hasDeviceType,
          turbines: first.createdIds.slice(1, 1 + n).map((id, i) => ({ id, name: names[i] ?? null })),
          landLeaseCosts: allWtgQ.data,
        });
      },
    });
    const typeId = ids?.[0];
    if (typeId) setSelection({ family: "wtg", id: typeId });
    expandCreated(typeId);
    /*
     * In country the first job's roll-up counted the new type, so the rollback recomputes it (harmless when the
     * failure came before it: the totals are rebuilt from the rows that remain). Out of country the roll-up does not
     * run (the permission request replaces it), so the rollback leaves the totals alone.
     * The roll-up counts as run only once the first plan finished (`firstPlanDone`): a failure while creating the
     * type or a turbine never reached it, so the rollback must not write the project (and its Fabric sync row).
     *
     * DIVERGENCE (plan §9.3, review finding 1): once the approval flow call has resolved, a real
     * `RequestModulePermission` approval (mail, Teams card, run id) is open for the type, so a failing follow-up
     * must NOT delete the type and its turbines. Nothing is rolled back; the error bar keeps the save's error.
     */
    if (!permissionRequested.current) {
      queueRollback(inCountry ? "addWtgType" : "outOfCountryApprovalFailed", ids, inCountry && firstPlanDone.current);
    }
  };

  const saveTurbine = async (fromPopup: boolean) => {
    if (!planProject || !panelType || writeBusy()) return;
    const job: ScreenJob = {
      reload: "saveTurbine",
      progress: turbineSaveProgressText(planProject.shortName, turbineForm.nameIndex.trim(), fromPopup),
      success: WRITE_MSG.turbineSaved,
      errorText: WRITE_ERROR.turbineSave,
      plan: planSaveTurbine({
        project: planProject, type: panelType, model: panelModel, accumulatedIndex: indexQ.data,
        turbine: panelTurbine, typeTurbines: panelTurbines, allTypes: types, form: turbineForm, applyAll,
        totalHeight: turbineHeight, landLeaseCosts: allWtgQ.data, lang,
      }),
    };
    close();
    queueRollback(panelTurbine ? "editTurbine" : "addTurbine", await run(job), false);
  };

  const savePv = async () => {
    if (!planProject || writeBusy()) return;
    const editing = selectedPv;
    const label = pvForm.moduleLabel;
    const capacity = numericOr(pvForm.capacity, 0, lang);
    const costPerPower = deviceQ.data.modules ?? 0;
    const others = pvQ.data.filter((r) => r.id !== editing?.id);
    close();
    /*
     * Save performance (6 Nov 2026): ONE job, as the WTG type save — the second step (the unit, the G7
     * allocations, the roll-up, the device-type row) is the job's `then`, so the screen reloads once.
     */
    const ids = await run({
      reload: "savePv",
      progress: pvSaveProgressText(label),
      success: PV_MSG.saved,
      errorText: pvSaveErrorText,
      plan: planSavePvType({
        project: planProject, pv: editing, form: pvForm, deviceCostModules: deviceQ.data.modules, otherSupplierChosen, lang,
      }),
      then: async (first: PlanResult): Promise<WritePlan | null> => {
        const pvId = editing?.id ?? first.createdIds[0];
        if (!pvId) return null;
        /*
         * A NEW type: the create returned its autonumber `vsb_name` (`PlanResult.createdRows`), and a row this
         * save has just created has no unit and no `DeviceTypesInProjects` row yet — so no read-back. An EDIT
         * still reads them (`loadPvFollowUpInputs`), as does a create that came back without the name.
         */
        const createdName = editing ? undefined : first.createdRows?.[pvId]?.["vsb_name"];
        const inputs = typeof createdName === "string" && createdName !== ""
          ? { pvName: createdName, unitId: null, hasDeviceType: false }
          : await loadPvFollowUpInputs(pvId);
        const saved = { capacity, cost: costPerPower * capacity };
        return planPvFollowUp({
          project: planProject, pvId, pvName: inputs.pvName, unitId: inputs.unitId, hasDeviceType: inputs.hasDeviceType,
          pvRows: [...others, saved], inverters: inverterQ.data, substructures: substructureQ.data,
          // G7 (1.21.753) — a new PV type's unit is back-filled into the AllWTG land-lease costs. F9 / GP-10: also when this
          // follow-up creates the unit of an edited type (an earlier Add that failed after the type landed left it without one).
          isNew: pvFollowUpIsNew({ editing: editing !== null, unitId: inputs.unitId }), landLeaseCosts: allWtgQ.data,
        });
      },
    });
    const pvId = editing?.id ?? ids?.[0];
    if (ids && pvId) setSelection({ family: "pv", id: pvId });
    if (!editing) expandCreated(ids?.[0]);
    if (!editing) queueRollback("addPvType", ids, false);
  };

  /**
   * G9 — `pcf_btn_GeneratorData_RightPanel_Form_Inverter_Buttons_Save.OnChange`. D97 — with an Other Supplier the
   * row is written and `RequestModulePermission` runs for it instead of the PV-cost roll-up (Y:10243).
   */
  const saveInverter = async () => {
    if (!project || !planProject || writeBusy()) return;
    const header = project;
    const editing = selectedInverter;
    const job: ScreenJob = {
      reload: "saveInverter",
      progress: inverterSaveProgressText(inverterForm.label, inverterOtherValue),
      success: WRITE_MSG.inverterSaved,
      errorText: WRITE_ERROR.inverterSave,
      plan: planSaveInverter({
        project: planProject, row: editing, form: inverterForm, otherSupplierChosen: inverterOther,
        deviceCostInverter: deviceQ.data.inverter, pv: pvQ.data, inverters: inverterQ.data, substructures: substructureQ.data, lang,
      }),
      ...(inverterRequests ? {
        then: async (first: { createdIds: string[] }) => {
          const rowId = editing?.id ?? first.createdIds[0];
          if (rowId) await permissionFlows.request(buildInverterPermissionPayload(header, rowId));
          return null;
        },
      } : {}),
    };
    close();
    // The canvas blanks `locSelectedInverterTypeEntity` after the save.
    const ids = await run(job);
    if (ids) setSelection(null);
    if (!editing) expandCreated(ids?.[0]);
    if (!editing) queueRollback("saveInverter", ids, false);
  };

  /**
   * G9 — `pcf_btn_GeneratorData_RightPanel_Form_Substructure_Buttons_Save.OnChange`. D97 — with an Other Supplier
   * the row is written and `RequestModulePermission` runs for it instead of the PV-cost roll-up (Y:8979).
   */
  const saveSubstructure = async () => {
    if (!project || !planProject || writeBusy()) return;
    const header = project;
    const editing = selectedSubstructure;
    const job: ScreenJob = {
      reload: "saveSubstructure",
      progress: substructureSaveProgressText(substructureForm.label, substructureOtherValue),
      success: WRITE_MSG.substructureSaved,
      errorText: WRITE_ERROR.substructureSave,
      plan: planSaveSubstructure({
        project: planProject, row: editing, form: substructureForm, otherSupplierChosen: substructureOther,
        deviceCostFix: deviceQ.data.mountingFix, deviceCostTracker: deviceQ.data.mountingTracker,
        plantPvCapacity: project.plantPvCapacity, pv: pvQ.data, inverters: inverterQ.data, substructures: substructureQ.data,
      }),
      ...(substructureRequests ? {
        then: async (first: { createdIds: string[] }) => {
          const rowId = editing?.id ?? first.createdIds[0];
          if (rowId) await permissionFlows.request(buildSubstructurePermissionPayload(header, rowId));
          return null;
        },
      } : {}),
    };
    close();
    const ids = await run(job);
    if (ids) setSelection(null);
    if (!editing) expandCreated(ids?.[0]);
    if (!editing) queueRollback("saveSubstructure", ids, false);
  };

  /**
   * Save performance (6 Nov 2026): what the second step of a new WTG / PV type needs — its autonumber name and its
   * device-type row. The create returned the row (`PlanResult.createdRows`, `Prefer: return=representation`), and a
   * type this job has just created has no `DeviceTypesInProjects` row yet (no plugin or flow creates one —
   * `hooks.ts`). `loadNewTypeInputs` (two reads) stays only as the fallback for a create without the name.
   */
  const newTypeInputs = async (family: "wtg" | "pv", first: PlanResult, typeId: string) => {
    const name = first.createdRows?.[typeId]?.["vsb_name"];
    return typeof name === "string" && name !== ""
      ? { typeName: name, hasDeviceType: false, bridgeId: null }
      : loadNewTypeInputs(family, typeId);
  };

  /**
   * G6 — Replace Generator Type (1.21.753), ONE job (save performance, 6 Nov 2026): its plan reads the old
   * type's links (Identify) and runs Detach, Delete and Add; its `then` step uses the new ids for the
   * device-type row, the land lease and the O&M re-link. The new type is selected afterwards.
   */
  const replaceGeneratorType = async () => {
    if (!project || !planProject || !selectedType || !replaceModel || writeBusy()) return;
    const header = project;
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
      reload: "replaceWtg",
      progress,
      success: () => replaceSuccessText(box.unmatched),
      errorText: WRITE_ERROR.wtgReplace,
      plan: async (): Promise<WritePlan> => {
        box.inputs = await loadReplaceInputs(planProject.id, oldType.id);
        // D97 — "RDel001: Cancel pending permission for replaced generator", before the old type goes.
        await permissionFlows.cancelIfOpen("wtg", oldType);
        return planReplaceGeneratorType({
          project: planProject, oldType, inCountry: form.inCountry, model, costPerWtg: replaceCost,
          selectedHeight: replaceHub ?? 0, revisedHubHeight: numericOr(form.revisedHubHeight, 0, lang),
          otherTypes: types.filter((t) => t.id !== oldType.id), otherTurbines, inputs: box.inputs,
        });
      },
      then: async (first: PlanResult): Promise<WritePlan | null> => {
        // The plan's deletes and updates create nothing: the new type is its first create, its units the next.
        const newTypeId = first.createdIds[0];
        const inputs = box.inputs;
        if (!newTypeId || !inputs) return null;
        // D97 — out of country the Add requests permission for the new type instead of the roll-up.
        if (requiresPermissionRequest(form.inCountry)) {
          await permissionFlows.request(buildGeneratorPermissionPayload(header, newTypeId, model.id));
        }
        const created = await newTypeInputs("wtg", first, newTypeId);
        const plan = planReplaceGeneratorTypeFollowUp({
          project: planProject, newTypeId, newTypeName: created.typeName, existingBridgeId: created.bridgeId ?? null,
          newUnits: first.createdIds.slice(1, 1 + replaceCount).map((id, i) => ({ id, name: names[i] ?? null })),
          inputs,
        });
        box.unmatched = plan.unmatchedCount;
        return plan;
      },
    });
    const newTypeId = ids?.[0];
    if (newTypeId) setSelection({ family: "wtg", id: newTypeId });
    expandCreated(newTypeId);
  };

  /** G6 — Replace PV Module Type (1.21.753), as ONE job in the same two steps (save performance, 6 Nov 2026). */
  const replacePvType = async () => {
    if (!planProject || !selectedPv || writeBusy()) return;
    const oldPv = selectedPv;
    const form = { ...replacePvForm, dirty: new Set(replacePvForm.dirty) };
    const capacity = numericOr(form.capacity, 0, lang);
    const progress = replacePvProgressText(form.moduleLabel);
    const box: { inputs?: ReplaceInputs } = {};
    close();
    const ids = await run({
      reload: "replacePv",
      progress,
      success: REPLACE_MSG.pvReplaced,
      errorText: WRITE_ERROR.pvReplace,
      plan: async (): Promise<WritePlan> => {
        box.inputs = await loadReplaceInputs(planProject.id, oldPv.id);
        // D97 — an open request on the replaced PV type is cancelled before it goes.
        await permissionFlows.cancelIfOpen("pv", oldPv);
        return planReplacePvType({
          project: planProject, oldPv, form, deviceCostModules: deviceQ.data.modules,
          otherSupplierChosen: replacePvOther, inputs: box.inputs, lang,
        });
      },
      then: async (first: PlanResult): Promise<WritePlan | null> => {
        const newPvId = first.createdIds[0];
        const inputs = box.inputs;
        if (!newPvId || !inputs) return null;
        const created = await newTypeInputs("pv", first, newPvId);
        return planReplacePvTypeFollowUp({
          project: planProject, newPvId, newPvName: created.typeName, existingBridgeId: created.bridgeId ?? null,
          inputs,
          pvRows: [...pvQ.data.filter((r) => r.id !== oldPv.id), { capacity, cost: (deviceQ.data.modules ?? 0) * capacity }],
          inverters: inverterQ.data, substructures: substructureQ.data,
        });
      },
    });
    const newPvId = ids?.[0];
    if (newPvId) setSelection({ family: "pv", id: newPvId });
    expandCreated(newPvId);
  };

  const saveSimple = async () => {
    if (!planProject || !simpleFamily || writeBusy()) return;
    const family = simpleFamily;
    const cfg = SIMPLE_PANEL[family];
    const row = simpleSelectedOf(family);
    const job: ScreenJob = {
      reload: `saveSimple:${family}`,
      progress: simpleSaveProgressText(simpleForm.label),
      success: cfg.savedText,
      errorText: cfg.saveError,
      plan: planSaveSimple({ project: planProject, family, row, rows: simpleRowsOf(family), form: simpleForm, lang }),
    };
    close();
    const ids = await run(job);
    const id = row?.id ?? ids?.[0];
    if (ids && id) setSelection({ family, id });
    if (!row) expandCreated(ids?.[0]);
    if (!row) queueRollback("saveSimple", ids, false);
  };

  const onTypeSave = useStableCallback(() => {
    // The approval popup opens when the planning flags the limit and the new height exceeds it.
    if (heightLimitExceeded(planning, prospectiveHeight)) {
      setDialog({ kind: "heightType", name: heightPopupTypeName(resolvedModel?.displayName) });
    } else {
      void saveType();
    }
  });
  const onTurbineSave = useStableCallback(() => {
    if (heightLimitExceeded(planning, turbineHeight)) {
      setDialog({ kind: "heightTurbine", name: panelTurbine?.name ?? null });
    } else {
      void saveTurbine(false);
    }
  });
  // The other panels' Save / Replace buttons call their handler with no argument and ignore the promise.
  const onSavePv = useStableCallback(() => { void savePv(); });
  const onSaveSimple = useStableCallback(() => { void saveSimple(); });
  const onSaveInverter = useStableCallback(() => { void saveInverter(); });
  const onSaveSubstructure = useStableCallback(() => { void saveSubstructure(); });
  const onReplaceWtg = useStableCallback(() => { void replaceGeneratorType(); });
  const onReplacePv = useStableCallback(() => { void replacePvType(); });

  /** The confirm handlers, each the canvas `OnConfirm`. */
  const onConfirm = async () => {
    const d = dialog;
    // D141: the confirmation builds its plan from a lazy read (price index, device costs) that has not landed: keep it open.
    if (d && gate.lazyWaiting && confirmNeedsLazyRead(d.kind, d.kind === "deleteSimple" ? d.family : null)) return;
    closeDialog();
    if (!d || !planProject) return;
    switch (d.kind) {
      case "heightType": await saveType(); return;
      case "heightTurbine": await saveTurbine(true); return;
      case "deleteType": {
        const typeTurbines = turbinesByType.get(d.type.id) ?? [];
        const ok = await runDelete({
          reload: "deleteWtgType",
          progress: WRITE_MSG.working, success: WRITE_MSG.typeDeleted, errorText: WRITE_ERROR.typeDelete,
          plan: async (): Promise<WritePlan> => {
            // D97 — `If(Not(IsBlank(FlowRunId)), Requestpermissioncancellation.Run(…))` (Y:15659), before any delete.
            await permissionFlows.cancelIfOpen("wtg", d.type);
            const inputs = await loadTypeDeleteInputs(planProject.id, d.type.id, typeTurbines.map((t) => t.id));
            return planDeleteGeneratorType({
              project: planProject, type: d.type, allTypes: types, allocations: inputs.allocations,
              allocationCountByCost: inputs.countByCost, opexCostIds: inputs.opexCostIds,
            });
          },
        }, d.type.name);
        if (ok) setSelection(defaultSelection(lists(), d.type.id));
        return;
      }
      case "deleteTurbine": {
        const type = types.find((t) => t.id === d.turbine.typeId);
        if (!type) return;
        await runDelete({
          reload: "deleteTurbine",
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
      case "toggleStatus": {
        // The plan is built from the REAL rows, here and now, whatever the switch says (F3): the optimistic rows below are
        // only shown, never read by a write.
        const plan = planToggleStatus({
          project: planProject, type: d.type, turbines: turbinesByType.get(d.type.id) ?? [], allTypes: types,
        });
        const nextStatus = nextToggleStatus(d.type);
        await run({
          reload: "toggleStatus",
          progress: WRITE_MSG.working, success: WRITE_MSG.statusChanged, errorText: WRITE_ERROR.status,
          plan,
          // D143, DIVERGENCE (`GENERATORS_PERF.optimisticToggle`, default OFF, proposed not approved): with the switch on the new
          // status is shown at once and rolled back if the save fails (`optimisticToggle.ts`). Off: no hook, today's behaviour.
          ...(perf.optimisticToggle ? {
            optimistic: async (qc: QueryClient) => {
              setOptimisticPhase("writing");
              return applyOptimisticToggle(qc, { projectId: planProject.id, typeId: d.type.id, nextStatus });
            },
          } : {}),
        });
        // The writes are over (landed or failed): the reload that brings the server's rows is running, and the optimistic
        // rows stay "not settled" until it ends (the effect above). A job that never started set nothing.
        setOptimisticPhase((phase) => (phase === "writing" ? "reloading" : phase));
        return;
      }
      case "deleteSimple": {
        const f = d.family;
        if (f === "pv") {
          const ok = await runDelete({
            reload: "deletePv",
            progress: WRITE_MSG.working, success: PV_MSG.deleted, errorText: pvDeleteErrorText,
            // G2 — the unit, its land lease and the O&M costs go first, as the confirmation says.
            plan: async (): Promise<WritePlan> => {
              // D97 — the open request is cancelled first (Y:15469).
              await permissionFlows.cancelIfOpen("pv", d.row);
              const inputs = await loadPvDeleteInputs(planProject.id, d.row.id);
              return planDeletePvType({
                project: planProject, pv: d.row, pvRows: pvQ.data, inverters: inverterQ.data,
                substructures: substructureQ.data, deviceCostFix: deviceQ.data.mountingFix,
                deviceCostTracker: deviceQ.data.mountingTracker, unitIds: inputs.unitIds,
                allocations: inputs.allocations, allocationCountByCost: inputs.countByCost, opexCostIds: inputs.opexCostIds,
              });
            },
          }, d.row.name);
          if (ok) setSelection(defaultSelection(lists(), d.row.id));
        } else if (f === "inverter" || f === "substructure") {
          const ok = await runDelete({
            reload: f === "inverter" ? "deleteInverter" : "deleteSubstructure",
            progress: WRITE_MSG.working,
            success: f === "inverter" ? WRITE_MSG.inverterDeleted : WRITE_MSG.substructureDeleted,
            errorText: f === "inverter" ? WRITE_ERROR.inverterDelete : WRITE_ERROR.substructureDelete,
            plan: async (): Promise<WritePlan> => {
              // D97 — the open request is cancelled first (inverter Y:15380, substructure Y:15291).
              await permissionFlows.cancelIfOpen(f, d.row);
              return planDeleteInverterOrSubstructure({
                project: planProject, family: f, row: d.row, pv: pvQ.data, inverters: inverterQ.data,
                substructures: substructureQ.data,
              });
            },
          });
          if (ok) setSelection(null);
        } else {
          const ok = await runDelete({
            reload: `deleteSimple:${f}`,
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

  /**
   * D97 — a card's Cancel (`pcf_btn_GeneralData_DisplayProject_Body_Buttons_Reset_1` WTG Y:2612, `…_PVModule_Reset`,
   * `…_Inverter_Reset`, `…_Substructure_Reset`): `Requestpermissioncancellation.Run(User().Email, AppId, JSON(varModule))`,
   * then the success `Notify`. The flow writes Canceled and blanks the ids itself (it ends before `Run` returns), so the
   * refresh shows them. DIVERGENCE: the canvas then also `Patch`es Canceled onto `locSelectedGeneratorEntity` — the
   * SELECTED type, not the card's (SOURCE DEFECT) — and the PV / inverter / substructure cards only update the collection.
   */
  const cancelRequest = useStableCallback((family: PermissionFamily, row: GeneratorTypeRow | SimpleTypeRow) => {
    const name = permissionModuleName(family, row);
    void run({
      reload: `cancelRequest:${family}`,
      progress: PERMISSION_MSG.canceling(name),
      success: PERMISSION_MSG.canceled(family, name),
      errorText: PERMISSION_MSG.cancelError,
      plan: emptyPlan(),
      then: async () => {
        await permissionFlows.cancel(family, row);
        return null;
      },
    });
  });

  const iso = project?.isoCurrencyCode;

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
  if (loadErrorKind === "blocking") {
    return (
      <div className={s.page} data-testid="Project Generators Screen">
        <EmptyState title={GENERATORS_SCREEN_TEXT.loadFailedTitle} description={GENERATORS_SCREEN_TEXT.loadFailedDescription} />
      </div>
    );
  }

  const bodyVisible = isBodyVisible(project);
  const lockBullets = !locked ? [] : projectId ? pageLock(project) : ["• General", "• Milestones"];

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

      {/* F7 (NEW TEXT, D121 §3): a failed background refresh keeps the screen and its data and says so. */}
      {loadErrorKind === "banner" ? (
        <MessageBar intent="error" aria-label="generators-data-unavailable" data-testid="generators-data-unavailable">
          <MessageBarBody>{GUARD_READ_MSG.refreshFailed}</MessageBarBody>
        </MessageBar>
      ) : null}
      {/* F1 (NEW TEXT, D121 §2): the selected type's O&M link could not be read; the commands that need it stay off. */}
      {opexBanner ? (
        <MessageBar intent="warning" aria-label="generators-opex-unavailable" data-testid="generators-opex-unavailable">
          <MessageBarBody>{opexBanner}</MessageBarBody>
        </MessageBar>
      ) : null}
      <WriteFeedback portal progress={writes.progress} error={shownNotice?.text ?? (writes.error && shownPartial ? `${writes.error} ${shownPartial}` : writes.error)} success={writes.success} testIdPrefix="generators" />
      {shownNotice?.leftover ? (
        // NEW - no canvas equivalent (DIVERGENCE, plan §9.3): the cleanup of a failed save did not finish.
        <Button
          appearance="primary" aria-label={ROLLBACK_MSG.retryButton} data-testid="generators-retry-cleanup"
          disabled={writes.refreshing || writes.progress !== null} onClick={retryCleanup}
        >
          {ROLLBACK_MSG.retryButton}
        </Button>
      ) : null}

      {loading ? <LoadingOverlay mode="inline" /> : null}

      <div className={s.capacity}>
        {/* `Value: =gblRecordSelectedProject.'Total Capacity'` (Y:1289): the number in the user's language ("22,4"). */}
        <ReadOnlyField
          label={TOTAL_CAPACITY_LABEL}
          labelWeight="semibold"
          align="right"
          value={project?.totalCapacity == null ? "" : forLanguage(String(project.totalCapacity), lang)}
          testId="txt_Generators_DisplayProject_Body_Form_PlantWtgCapacity"
          ariaLabel="txt_Generators_DisplayProject_Body_Form_PlantWtgCapacity"
        />
      </div>

      {bodyVisible ? (
        <div className={s.scrollBody} data-testid="con_Generators_DisplayProject_Body_Form_FirstColumn">
          {/* D143: one memoized section per family, each given only its own rows, selection and folding. */}
          <WtgSection
            types={types} turbinesByType={turbinesByType} models={models} planning={planning} lang={lang}
            editable={editable} actionsOpen={actionsOpen} refreshing={writes.refreshing}
            selectedId={selectedIdOf(selection, "wtg")} expandedIds={wtgExpanded} pages={pages} onPage={onPage}
            onRowClick={onRowClick} onFold={onFold} onCancelRequest={cancelRequest}
            onOpenTurbine={openTurbine} onDeleteTurbine={onDeleteTurbine}
          />
          <PvSection
            rows={pvQ.data} lang={lang} editable={editable} refreshing={writes.refreshing}
            selectedId={selectedIdOf(selection, "pv")} expandedIds={pvExpanded}
            onRowClick={onRowClick} onFold={onFold} onCancelRequest={cancelRequest}
          />
          <InverterSection
            rows={inverterQ.data} lang={lang} editable={editable} refreshing={writes.refreshing} iso={iso}
            selectedId={selectedIdOf(selection, "inverter")} expandedIds={inverterExpanded}
            onRowClick={onRowClick} onFold={onFold} onCancelRequest={cancelRequest}
          />
          <SubstructureSection
            rows={substructureQ.data} lang={lang} editable={editable} refreshing={writes.refreshing} iso={iso}
            plantPvCapacity={project?.plantPvCapacity}
            selectedId={selectedIdOf(selection, "substructure")} expandedIds={substructureExpanded}
            onRowClick={onRowClick} onFold={onFold} onCancelRequest={cancelRequest}
          />
          <StorageSection
            rows={storageQ.data} lang={lang} editable={editable} refreshing={writes.refreshing}
            selectedId={selectedIdOf(selection, "storage")} expandedIds={storageExpanded}
            onRowClick={onRowClick} onFold={onFold} onCancelRequest={cancelRequest}
          />
          <HydrogenSection
            rows={hydrogenQ.data} lang={lang} editable={editable} refreshing={writes.refreshing}
            selectedId={selectedIdOf(selection, "hydrogen")} expandedIds={hydrogenExpanded}
            onRowClick={onRowClick} onFold={onFold} onCancelRequest={cancelRequest}
          />
          <SubstationSection
            rows={substationQ.data} lang={lang} editable={editable} refreshing={writes.refreshing}
            selectedId={selectedIdOf(selection, "substation")} expandedIds={substationExpanded}
            onRowClick={onRowClick} onFold={onFold} onCancelRequest={cancelRequest}
          />
        </div>
      ) : null}

      {/*
        D143 (item 8b): the panels are separate chunks, loaded on first use. `PanelHost` mounts one from the first time it opens
        and keeps it mounted after, so its closing animation and its state are what the inline panel's were.
      */}
      {/* ── Add Generator Type ── */}
      <PanelHost open={panel?.kind === "type"}>
        <TypePanel
          open={panel?.kind === "type"} lang={lang} countryName={project?.countryName} inCountry={inCountry} form={typeForm}
          cascade={typeModel.cascade} dummy={typeModel.dummy} effectiveHubHeight={effectiveHubHeight}
          saveable={typeModel.saveable} saveBlocked={typeModel.saveBlocked} heightBlocked={typeModel.heightBlocked} settling={settling}
          onInCountryChange={onInCountryChange} onTouch={touchType} onSave={onTypeSave} onClose={close}
        />
      </PanelHost>

      {/* ── Add / Edit Generator (one turbine) ── */}
      <PanelHost open={panel?.kind === "turbine"}>
        <TurbinePanel
          open={panel?.kind === "turbine"} lang={lang} shortName={project?.shortName} turbine={panelTurbine}
          generatorType={panelModel?.turbineType ?? ""} specificCapacity={panelModel?.specificCapacity ?? null}
          form={turbineForm} nameError={turbineModel.nameError} applyAll={applyAll} totalHeight={turbineHeight}
          saveable={turbineModel.saveable} heightBlocked={turbineModel.heightBlocked} settling={settling}
          onTouch={touchTurbine} onApplyAllChange={applyAllChange} onSave={onTurbineSave} onClose={close}
        />
      </PanelHost>

      {/* ── Add / Edit PV Module Type ── */}
      <PanelHost open={panel?.kind === "pv"}>
        <PvPanel
          open={panel?.kind === "pv"} editing={selectedPv !== null} form={pvForm} errors={pvModel.errors} options={pvModel.options}
          otherChosen={pvModel.otherChosen} saveable={pvModel.saveable} settling={settling}
          onTouch={touchPv} onSave={onSavePv} onClose={close}
        />
      </PanelHost>

      {/* ── Add BESS · Add Hydrogen · Add Substation (bound to the selected row) ── */}
      <PanelHost open={simpleFamily !== null}>
        <SimplePanel
          family={simpleFamily} form={simpleForm} errors={simpleModel.errors} saveable={simpleModel.saveable}
          onTouch={touchSimple} onSave={onSaveSimple} onClose={close}
        />
      </PanelHost>

      {/* ── G9: Add / Edit Inverter (`con_GeneratorData_RightPanel_Form_Inverter`, hidden in the canvas) ── */}
      <PanelHost open={panel?.kind === "inverter"}>
        <InverterPanel
          open={panel?.kind === "inverter"} editing={inverterEditing} form={inverterForm} errors={inverterModel.errors}
          options={inverterModel.options} otherChosen={inverterOther} otherValue={inverterOtherValue}
          catalogError={inverterCatalogQ.error} saveable={inverterModel.saveable}
          onTouch={touchInverter} onSave={onSaveInverter} onClose={close}
        />
      </PanelHost>

      {/* ── G9: Add / Edit Substructure (`con_GeneratorData_RightPanel_Form_Substructure`, hidden in the canvas) ── */}
      <PanelHost open={panel?.kind === "substructure"}>
        <SubstructurePanel
          open={panel?.kind === "substructure"} editing={substructureEditing} form={substructureForm}
          errors={substructureModel.errors} options={substructureModel.options} otherChosen={substructureOther}
          otherValue={substructureOtherValue} catalogError={substructureCatalogQ.error} saveable={substructureModel.saveable}
          onTouch={touchSubstructure} onSave={onSaveSubstructure} onClose={close}
        />
      </PanelHost>

      {/*
        ── G6: Replace Generator (solution 1.21.753). Control names and AccessibleLabels from the 1.21.753
        corpora (skeleton `reference/canvas-accessible-labels.json`), captions from `canvas-labels.json` /
        `REPLACE_LABELS` — the 1.21.709 extract on disk has no such panel. ──
      */}
      <PanelHost open={panel?.kind === "replaceWtg"}>
        <ReplaceWtgPanel
          open={panel?.kind === "replaceWtg"} lang={lang} countryName={project?.countryName}
          fromTypeName={selectedTypeModel?.turbineType ?? selectedType?.generatorDisplayName} fromModel={selectedTypeModel}
          typedHubHeight={(selectedType ? turbinesByType.get(selectedType.id)?.[0]?.hubHeightExclPlinth : null) ?? null}
          count={replaceCount} form={replaceWtg} cascade={replaceWtgM.cascade} dummy={replaceWtgM.dummy}
          saveable={replaceWtgM.saveable} heightBlocked={replaceHeightBlocked} settling={settling}
          onForm={setReplaceWtg} onReplace={onReplaceWtg} onClose={close}
        />
      </PanelHost>

      {/* ── G6: Replace PV Module Type (solution 1.21.753; names and labels as for Replace Generator) ── */}
      <PanelHost open={panel?.kind === "replacePv"}>
        <ReplacePvPanel
          open={panel?.kind === "replacePv"} lang={lang} selectedPv={selectedPv} form={replacePvForm} errors={replacePvM.errors}
          options={pvModel.options} otherChosen={replacePvOther} saveable={replacePvM.ok} settling={settling}
          onTouch={touchReplacePv} onReplace={onReplacePv} onClose={close}
        />
      </PanelHost>

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
      <InformationPopUp
        open={dialog?.kind === "blocked"}
        title={LAST_CAPACITY_TITLES.delete}
        message={dialog?.kind === "blocked" && dialog.reason !== "Capacity"
          ? opexDependencyMessage(dialog.reason, dialog.name)
          : LAST_CAPACITY_MESSAGES.delete}
        closeText={DIALOG_LABELS.close}
        onClose={closeDialog}
      />

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

