/**
 * Project Generators Screen — what each panel derives from its form (D143, split out of `Screen.tsx`).
 *
 * Every function below is the screen's former inline block, moved unchanged and made PURE (no React, no network): the cascade,
 * the chosen model, the derived cost, the height gate, the validation errors and the Save gate of one panel. The screen calls
 * each inside `useMemo`, keyed on the inputs it reads, so the value keeps its identity until one of them changes. That is what
 * lets the memoized panels skip a render when only another family's query landed. Rule 5: business rules live in `rules.ts`;
 * this file only composes them in the order the screen did.
 */
import { useMemo } from "react";
import {
  canSavePvType, canSaveSimple, canSaveInverter, canSaveSubstructure, canSaveTurbine, canSaveType, cascadeOptions, costPerWtg,
  effectiveOtherSupplier, heightBlocksSave, isDummySupplier, isOtherSupplierModule, isPlantOtherSupplier, newTurbineHeights,
  numericOr, plantRequestsPermission, plantSupplierOptions, projectCatalog, pvSupplierOptions, replaceWtgSaveable, resolveModel,
  turbineHeightBlocksSave, turbinePanelTotalHeight, typeSaveBlockedReason, validateInverterForm, validatePvTypeForm,
  validateSimpleForm, validateSubstructureForm, validateTurbineName, validateTypeForm,
  type CatalogModel, type InverterFormState, type PlantSupplierOption, type ProjectPlanning,
  type PvModuleOption, type PvTypeFormState, type ReplaceWtgForm, type SimpleCapacityFamily, type SimpleFormState,
  type SubstructureFormState, type TurbineFormState, type TurbineRow, type TypeFormState,
} from "../rules";
import type { GeneratorsProjectRow } from "../hooks";

type Projected = ReturnType<typeof projectCatalog>;

/** The project row fields the panels read. */
type ProjectHeader = GeneratorsProjectRow | null;

/* ──────────────────────────────────────────────────────────────────── Add Generator Type */

export interface TypePanelModelInput {
  projected: Projected;
  inCountry: boolean;
  form: TypeFormState;
  lang: string;
  /** `indexQ.data`. */
  accumulatedIndex: number;
  /** The price index is still loading (or lazily needed and not answered yet), or failed. */
  index: { loading: boolean; failed: boolean };
  project: ProjectHeader;
  planning: ProjectPlanning | null;
  entraObjectId: string | null;
}

/** Rules 3–10 — the type panel's cascade, model, derived cost and height gate. */
export function typePanelModel(a: TypePanelModelInput) {
  const { form, lang, project, planning, entraObjectId } = a;
  const cascade = cascadeOptions(a.projected, { inCountry: a.inCountry, supplier: form.supplier, turbineType: form.turbineType });
  const dummy = isDummySupplier(form.supplier);
  // `cmb_Supplier_2.DefaultSelectedItems = locSelectedTurbineForDummy` — the first height, for a Dummy supplier.
  const effectiveHubHeight = dummy ? (cascade.hubHeights[0] ?? (form.turbineType ? 0 : null)) : form.hubHeight;
  const resolvedModel = resolveModel(a.projected, {
    supplier: form.supplier, turbineType: form.turbineType, hubHeight: effectiveHubHeight,
  }) ?? null;
  const count = numericOr(form.numberOfGenerators, 0, lang);
  const derivedCost = resolvedModel && count > 0
    ? costPerWtg({ model: resolvedModel, count, accumulatedIndex: a.accumulatedIndex })
    : 0;
  const prospectiveHeight = resolvedModel
    ? newTurbineHeights({
        selectedHeight: effectiveHubHeight ?? 0,
        typedHubHeight: numericOr(form.revisedHubHeight, 0, lang),
        catalogHubHeight: resolvedModel.hubHeight,
        rotorDiameter: resolvedModel.rotorDiameter,
      }).totalHeight
    : 0;
  const errors = validateTypeForm({ ...form, hubHeight: effectiveHubHeight }, {
    isoCurrencyCode: project?.isoCurrencyCode, derivedCostPerWtg: derivedCost,
  }, lang);
  const heightBlocked = resolvedModel !== null && heightBlocksSave({
    planning, totalHeight: prospectiveHeight, project, entraObjectId,
  });
  const saveable = resolvedModel !== null && canSaveType({ errors, heightBlocked });
  // NEW (D89): why Save is disabled when no visible field says so — the canvas shows nothing here.
  const saveBlocked = saveable ? null : typeSaveBlockedReason({
    errors, heightBlocked, dummy, model: resolvedModel, count,
    index: { value: a.accumulatedIndex, loading: a.index.loading, failed: a.index.failed },
    fid: project?.fid,
  });
  return { cascade, dummy, effectiveHubHeight, resolvedModel, count, derivedCost, prospectiveHeight, errors, heightBlocked, saveable, saveBlocked };
}
export type TypePanelModel = ReturnType<typeof typePanelModel>;

/* ──────────────────────────────────────────────────────────────────── Add / Edit Generator */

export interface TurbinePanelModelInput {
  form: TurbineFormState;
  /** The turbine being edited, or null for Add. */
  turbine: TurbineRow | null;
  model: CatalogModel | null;
  /** Every turbine of the project (the duplicate-name check is project-wide). */
  turbines: readonly TurbineRow[];
  lang: string;
  planning: ProjectPlanning | null;
  project: ProjectHeader;
  entraObjectId: string | null;
}

/** Rule 11 — the turbine panel. */
export function turbinePanelModel(a: TurbinePanelModelInput) {
  const { form, turbine, model, lang } = a;
  // The duplicate-name check is project-wide (`colGeneratorsInProjectsTemporary`).
  const projectIndices = a.turbines.filter((t) => t.id !== turbine?.id).map((t) => t.index);
  const nameError = validateTurbineName(form.nameIndex, {
    existingIndices: projectIndices, currentIndex: turbine?.index ?? null,
  }, lang);
  // The boxes open in the user's language, so the total, the Save check and the save read them in it (A5).
  const totalHeight = turbinePanelTotalHeight({
    form, storedTotalHeight: turbine?.totalHeight, rotorDiameter: model?.rotorDiameter, lang,
  });
  const heightBlocked = turbineHeightBlocksSave({
    planning: a.planning, storedTotalHeight: turbine?.totalHeight, project: a.project, entraObjectId: a.entraObjectId,
  });
  const saveable = canSaveTurbine({
    form, existingIndices: projectIndices, currentIndex: turbine?.index ?? null,
    specificCapacity: model?.specificCapacity ?? null, heightBlocked, lang,
  });
  return { nameError, totalHeight, heightBlocked, saveable };
}
export type TurbinePanelModel = ReturnType<typeof turbinePanelModel>;

/* ──────────────────────────────────────────────────────────────────── PV module type */

/** The PV module type panel. */
export function pvPanelModel(a: { form: PvTypeFormState; catalogue: readonly PvModuleOption[]; lang: string }) {
  const options = pvSupplierOptions(a.catalogue);
  const module = a.catalogue.find((m) => m.id === a.form.supplier) ?? null;
  const otherChosen = isOtherSupplierModule(module);
  const errors = validatePvTypeForm(a.form, { otherSupplierChosen: otherChosen }, a.lang);
  const saveable = canSavePvType(errors, a.form, { otherSupplierChosen: otherChosen });
  return { options, otherChosen, errors, saveable };
}
export type PvPanelModel = ReturnType<typeof pvPanelModel>;

/* ──────────────────────────────────────────────────────────────────── BESS / Hydrogen / Substation */

/** The BESS / Hydrogen / Substation panels. */
export function simplePanelModel(a: { family: SimpleCapacityFamily | null; form: SimpleFormState; lang: string }) {
  const errors = a.family ? validateSimpleForm(a.family, a.form, a.lang) : null;
  const saveable = a.family ? canSaveSimple(a.family, a.form, a.lang) : false;
  return { errors, saveable };
}

/* ──────────────────────────────────────────────────────────────────── Inverter · Substructure (G9) */

/** G9 — the Add / Edit Inverter panel, bound to the selected inverter row (or a new one). */
export function inverterPanelModel(a: { form: InverterFormState; catalogue: readonly PlantSupplierOption[]; lang: string }) {
  const options = plantSupplierOptions("inverter", a.catalogue);
  const supplier = a.catalogue.find((o) => o.id === a.form.supplierId) ?? null;
  const other = isPlantOtherSupplier("inverter", supplier);
  const otherValue = effectiveOtherSupplier(a.form.otherSupplier, other);
  const errors = validateInverterForm(a.form, { otherSupplierChosen: other }, a.lang);
  const requests = plantRequestsPermission(otherValue);
  const saveable = canSaveInverter(a.form, { otherSupplierChosen: other }, a.lang);
  return { options, other, otherValue, errors, requests, saveable };
}

/** G9 — the Add / Edit Substructure panel. */
export function substructurePanelModel(a: { form: SubstructureFormState; catalogue: readonly PlantSupplierOption[] }) {
  const options = plantSupplierOptions("substructure", a.catalogue);
  const supplier = a.catalogue.find((o) => o.id === a.form.supplierId) ?? null;
  const other = isPlantOtherSupplier("substructure", supplier);
  const otherValue = effectiveOtherSupplier(a.form.otherSupplier, other);
  const errors = validateSubstructureForm(a.form, { otherSupplierChosen: other });
  const requests = plantRequestsPermission(otherValue);
  const saveable = canSaveSubstructure(a.form, { otherSupplierChosen: other });
  return { options, other, otherValue, errors, requests, saveable };
}

/* ──────────────────────────────────────────────────────────────────── Replace (G6) */

export interface ReplaceWtgModelInput {
  projected: Projected;
  form: ReplaceWtgForm;
  /** The selected type's `Number of Generators`. */
  selectedCount: number | null | undefined;
  accumulatedIndex: number;
  lang: string;
  planning: ProjectPlanning | null;
  project: ProjectHeader;
  entraObjectId: string | null;
  /** A write is running (`writes.progress !== null`). */
  inProgress: boolean;
}

/** G6 — Replace Generator Type (1.21.753): the "Replace to" cascade reuses the type panel's rules. */
export function replaceWtgModel(a: ReplaceWtgModelInput) {
  const { form, lang } = a;
  const cascade = cascadeOptions(a.projected, { inCountry: form.inCountry, supplier: form.supplier, turbineType: form.turbineType });
  const dummy = isDummySupplier(form.supplier);
  const hub = dummy ? (cascade.hubHeights[0] ?? (form.turbineType ? 0 : null)) : form.hubHeight;
  const model = resolveModel(a.projected, { supplier: form.supplier, turbineType: form.turbineType, hubHeight: hub }) ?? null;
  const count = Math.max(0, a.selectedCount ?? 0);
  const cost = model && count > 0 ? costPerWtg({ model, count, accumulatedIndex: a.accumulatedIndex }) : 0;
  const height = model
    ? newTurbineHeights({
        selectedHeight: hub ?? 0, typedHubHeight: numericOr(form.revisedHubHeight, 0, lang),
        catalogHubHeight: model.hubHeight, rotorDiameter: model.rotorDiameter,
      }).totalHeight
    : 0;
  const heightBlocked = model !== null && heightBlocksSave({
    planning: a.planning, totalHeight: height, project: a.project, entraObjectId: a.entraObjectId,
  });
  // D97 — out of country is no longer excluded: the replace requests permission for the new type.
  const saveable = model !== null && replaceWtgSaveable({
    form: { ...form, hubHeight: hub }, inProgress: a.inProgress, heightBlocked, lang,
  });
  return { cascade, dummy, hub, model, count, cost, heightBlocked, saveable };
}
export type ReplaceWtgModel = ReturnType<typeof replaceWtgModel>;

/** G6 — Replace PV Module Type: the "Replace to" form is the PV panel's form and validation. */
export function replacePvModel(a: { form: PvTypeFormState; catalogue: readonly PvModuleOption[]; lang: string; inProgress: boolean }) {
  const module = a.catalogue.find((m) => m.id === a.form.supplier) ?? null;
  const other = isOtherSupplierModule(module);
  const errors = validatePvTypeForm(a.form, { otherSupplierChosen: other }, a.lang);
  const ok = !a.inProgress && canSavePvType(errors, a.form, { otherSupplierChosen: other });
  return { other, errors, ok };
}

/* ──────────────────────────────────────────────────────────────────── memoized, for the screen */

/*
 * The screen calls these hooks: each is its model function inside `useMemo`, keyed on every input the function reads, so the
 * result keeps its identity until one of them changes. They live here (not in `Screen.tsx`) so the dependency list sits next to
 * the function it belongs to.
 */

export function useTypePanelModel(a: TypePanelModelInput): TypePanelModel {
  const { projected, inCountry, form, lang, accumulatedIndex, index, project, planning, entraObjectId } = a;
  const { loading, failed } = index;
  return useMemo(
    () => typePanelModel({ projected, inCountry, form, lang, accumulatedIndex, index: { loading, failed }, project, planning, entraObjectId }),
    [projected, inCountry, form, lang, accumulatedIndex, loading, failed, project, planning, entraObjectId],
  );
}

export function useTurbinePanelModel(a: TurbinePanelModelInput): TurbinePanelModel {
  const { form, turbine, model, turbines, lang, planning, project, entraObjectId } = a;
  return useMemo(
    () => turbinePanelModel({ form, turbine, model, turbines, lang, planning, project, entraObjectId }),
    [form, turbine, model, turbines, lang, planning, project, entraObjectId],
  );
}

export function usePvPanelModel(a: { form: PvTypeFormState; catalogue: readonly PvModuleOption[]; lang: string }): PvPanelModel {
  const { form, catalogue, lang } = a;
  return useMemo(() => pvPanelModel({ form, catalogue, lang }), [form, catalogue, lang]);
}

export function useSimplePanelModel(a: { family: SimpleCapacityFamily | null; form: SimpleFormState; lang: string }) {
  const { family, form, lang } = a;
  return useMemo(() => simplePanelModel({ family, form, lang }), [family, form, lang]);
}

export function useInverterPanelModel(a: { form: InverterFormState; catalogue: readonly PlantSupplierOption[]; lang: string }) {
  const { form, catalogue, lang } = a;
  return useMemo(() => inverterPanelModel({ form, catalogue, lang }), [form, catalogue, lang]);
}

export function useSubstructurePanelModel(a: { form: SubstructureFormState; catalogue: readonly PlantSupplierOption[] }) {
  const { form, catalogue } = a;
  return useMemo(() => substructurePanelModel({ form, catalogue }), [form, catalogue]);
}

export function useReplaceWtgModel(a: ReplaceWtgModelInput): ReplaceWtgModel {
  const { projected, form, selectedCount, accumulatedIndex, lang, planning, project, entraObjectId, inProgress } = a;
  return useMemo(
    () => replaceWtgModel({ projected, form, selectedCount, accumulatedIndex, lang, planning, project, entraObjectId, inProgress }),
    [projected, form, selectedCount, accumulatedIndex, lang, planning, project, entraObjectId, inProgress],
  );
}

export function useReplacePvModel(a: { form: PvTypeFormState; catalogue: readonly PvModuleOption[]; lang: string; inProgress: boolean }) {
  const { form, catalogue, lang, inProgress } = a;
  return useMemo(() => replacePvModel({ form, catalogue, lang, inProgress }), [form, catalogue, lang, inProgress]);
}
