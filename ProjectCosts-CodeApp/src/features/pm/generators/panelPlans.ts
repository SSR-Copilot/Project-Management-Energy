/**
 * Project Generators Screen - the Add / Edit Inverter and Substructure panels, and the module-permission flows' texts.
 *
 * Split out of `rules.ts` by job (D159, audit finding 7). `rules.ts` re-exports this file, so every import of `@/features/pm/generators/rules` is unchanged.
 */
import { CHOICE_PLANT, ES, ES_PLANT } from "@/data/dataverseNames";
import { type Lang, inRange, isBlank, isDecimalWithPlaces, isInteger, isNumeric } from "@/domain/powerFxNumeric";
import { type WritePlan } from "@/data/writePlan";
import { PROJECT_PLANT_COL, type PlantFamily, type SimpleTypeRow, inverterCosts, plantPvCost, replaceErrorText, substructureCost, textFormat, valueOrNull } from "./rulesCore";
import { PLANT_BIND, type PlanProject, ins, owner, ref, requireOwningBusinessUnit, upd } from "./plans";

/* ══════════════════════ D27 G9 — the Add / Edit Inverter and Substructure panels ════ */
/*
 * DIVERGENCE (D27 G9, PO-approved 20 Oct 2026): the canvas has both panels
 * (`con_GeneratorData_RightPanel_Form_Inverter`, Y:9114; `…_Form_Substructure`, Y:8246) but their
 * commands are `ItemVisible: false`, so they were unreachable. They are ported as the canvas wrote
 * them — fields, validation, captions and `Patch` payloads — and exposed through
 * `commandBarState(…, { exposeInverterSubstructure: true })`.
 *
 * The out-of-catalogue "Request permission" save (`RequestModulePermission`) stays excluded (D27, X3):
 * a non-blank Other Supplier makes the save a permission request, which is refused.
 */

/** An `Inverters` / `Substructures` catalogue row (`colInverterSuppliers` / `colSubstructuresSuppliers`). */
export interface PlantSupplierOption {
  id: string;
  /** `Supplier` (`vsb_tier1supplier`). */
  supplier: string | null;
  /** `'Inverter Types'` (`vsb_invertertypes`) / `'Substructure Types'` (`vsb_substructuretypes`) option values. */
  typeValues: number[];
}

export type InverterOrSubstructure = "inverter" | "substructure";

/** The catalogue supplier the Other Supplier field belongs to. */
export const PLANT_OTHER_SUPPLIER = "Other Supplier";

/**
 * The comboboxes' `FullDisplayName` (Y:9417 / Y:8554): `Concatenate(Supplier, " ", Substitute(TrimEnds(
 * Concat('<Types>', Value & " ")), " ", ","))` — "SMA String,Central".
 */
export function plantSupplierDisplayName(family: InverterOrSubstructure, o: PlantSupplierOption): string {
  const labels = family === "inverter" ? INVERTER_TYPE_LABELS : SUBSTRUCTURE_TYPE_LABELS;
  const types = o.typeValues.map((v) => labels[v] ?? String(v)).join(" ").trim().replace(/ /g, ",");
  return `${o.supplier ?? ""} ${types}`;
}

/** `Trim(cmb.Selected.FullDisplayName) = "Other Supplier"` — shows the Other Supplier field (Y:9518 / Y:8627). */
export const isPlantOtherSupplier = (
  family: InverterOrSubstructure, o: PlantSupplierOption | null | undefined,
): boolean => o !== null && o !== undefined && plantSupplierDisplayName(family, o).trim() === PLANT_OTHER_SUPPLIER;

/**
 * The combobox options (App:1520-1547): the catalogue without "Other Supplier", then — inverters —
 * every "Other Supplier" row (`Collect(…, Filter(Inverters, Supplier = "Other Supplier"))`), or —
 * substructures — only the first (`LookUp(Substructures, Supplier = "Other Supplier")`).
 */
export function plantSupplierOptions(family: InverterOrSubstructure, rows: readonly PlantSupplierOption[]): PlantSupplierOption[] {
  const isOther = (r: PlantSupplierOption) => r.supplier === PLANT_OTHER_SUPPLIER;
  const others = rows.filter(isOther);
  return [...rows.filter((r) => !isOther(r)), ...(family === "inverter" ? others : others.slice(0, 1))];
}

/**
 * `txt_…_OtherSupplier.Value = If(cmb.Selected.Supplier = "Other Supplier", <row>.'Other Supplier')` — blank
 * whenever another supplier is chosen, so it is what the Save writes and what its label tests.
 */
export const effectiveOtherSupplier = (value: string, otherSupplierChosen: boolean): string =>
  otherSupplierChosen ? value : "";

/** `pcf_btn_…_Inverter_Buttons_Save.Text` / `…_Substructure_Buttons_Save.Text`: `If(IsBlank(txt_…OtherSupplier.Value), "Save", "Request permission")`. */
export const plantPanelSaveLabel = (otherSupplier: string): string =>
  isBlank(otherSupplier.trim()) ? "Save" : "Request permission";

/** A non-blank Other Supplier turns the save into the excluded permission request (D27). */
export const plantRequestsPermission = (otherSupplier: string): boolean => !isBlank(otherSupplier.trim());

/** A multi-select column's write form: the option values, comma-separated; none is blank. */
export const multiSelectText = (values: readonly number[]): string | null =>
  values.length > 0 ? values.join(",") : null;

/** The Add / Edit Inverter panel. */
export interface InverterFormState {
  label: string;
  /** The chosen `Inverters` row id (`cmb_…_Inverter_Fields_Supplier.Selected`). */
  supplierId: string | null;
  otherSupplier: string;
  /** `cmb_…_Inverter_Fields_InverterType.SelectedItems` (`SelectMultiple: true`). */
  inverterTypes: number[];
  warranty: string;
  numberOfInverters: string;
  nominalPower: string;
  dirty: Set<string>;
}

/** The Inverter panel's verbatim texts. */
export const INVERTER_MSG = {
  /** `lbl_…_Inverter_Fields_{Label,Supplier,OtherSupplier,InverterType}_ErrorMessage.Text` — verbatim. */
  blank: "Value cannot be blank.",
  /** `lbl_…_Inverter_Fields_{Warranty,NumberOfInverters}_ErrorMessage.Text` — `$"Value must be a integer"`, verbatim (sic). */
  integer: "Value must be a integer",
  /** `lbl_…_Inverter_Fields_Warranty_ErrorMessage.Text` — verbatim. */
  warrantyRange: "Please select a value between 0 and 40.",
  /**
   * `lbl_…_Inverter_Fields_{NumberOfInverters,NominalPower}_ErrorMessage.Text` — INTERPOLATED:
   * `$"Please select a value between 0 and {Text(1000000, "#,###.0#")}."`.
   */
  largeRange: `Please select a value between 0 and ${textFormat(1_000_000, "#,###.0#")}.`,
  /** `lbl_…_Inverter_Fields_NominalPower_ErrorMessage.Text` — verbatim. */
  twoDecimals: "Numeric value with maximum of two decimals",
  /** `pcf_btn_…_Inverter_Buttons_Save.OnChange` success `Notify` (Y:10307) — verbatim. */
  saved: "Inverter type was successfully saved for current project!",
} as const;

/** `INVERTER_MSG.largeRange` in the user's language (`Text(1000000, "#,###.0#")` follows `Language()`). */
export const inverterLargeRange = (lang: Lang = "en-US"): string =>
  `Please select a value between 0 and ${textFormat(1_000_000, "#,###.0#", lang)}.`;

/**
 * `If(IsBlank(<Other Supplier>), $"Inverter '{<Label>}' will be saved, please wait...", $"Request Permission for
 * inverter '{<Other Supplier>}' has been sent, please wait...")` (Y:10178-10182) — verbatim. `otherSupplier` is the
 * effective Other Supplier text (blank = the save path).
 */
export const inverterSaveProgressText = (label: string, otherSupplier = ""): string =>
  plantRequestsPermission(otherSupplier)
    ? `Request Permission for inverter '${otherSupplier}' has been sent, please wait...`
    : `Inverter '${label}' will be saved, please wait...`;

/**
 * The panel opens bound to the selected row, or a new row (`addInverterType`, Y:840-861). Each field's
 * `Value` / `DefaultSelectedItems`: the label, the catalogue inverter, its Other Supplier, the stored
 * types, `'Warranty [Years]'`, `'Number of Inverters'`, `Text('Nominal Power [kW]', "#.0#")`.
 */
export function inverterFormDefaults(row: SimpleTypeRow | null, lang: Lang = "en-US"): InverterFormState {
  return {
    label: row?.label ?? "",
    supplierId: row?.catalogueId ?? null,
    otherSupplier: row?.otherSupplier ?? "",
    inverterTypes: [...(row?.typeValues ?? [])],
    warranty: row?.warranty === null || row?.warranty === undefined ? "" : String(row.warranty),
    numberOfInverters: row?.numberOfInverters === null || row?.numberOfInverters === undefined ? "" : String(row.numberOfInverters),
    nominalPower: textFormat(row?.nominalPower, "#.0#", lang),
    dirty: new Set<string>(),
  };
}

export interface InverterFormErrors {
  label: string | null;
  supplier: string | null;
  otherSupplier: string | null;
  inverterTypes: string | null;
  warranty: string | null;
  numberOfInverters: string | null;
  nominalPower: string | null;
}

/** `fn_Numeric_Generators.IsInteger` + `InRange(…, 0, max)` — shown whenever a non-blank value fails. */
function integerRangeError(value: string, max: number, rangeText: string, lang: Lang): string | null {
  const v = value.trim();
  if (isBlank(v)) return null;
  if (!isInteger(v, lang)) return INVERTER_MSG.integer;
  return inRange(v, 0, max, lang) ? null : rangeText;
}

/**
 * The canvas error labels (Y:9254-10060). SOURCE DEFECT (D27 G9): `lbl_…_Inverter_Fields_OtherSupplier_ErrorMessage.Visible`
 * needs the SUPPLIER to be blank, inside a container that shows only when the "Other Supplier" row is
 * chosen, so it never shows. It shows here when that field is touched and blank
 * (`plantOtherSupplierErrorCanvasParity` keeps the canvas formula).
 */
export function validateInverterForm(
  form: InverterFormState, opts: { otherSupplierChosen: boolean }, lang: Lang = "en-US",
): InverterFormErrors {
  const d = (f: string) => form.dirty.has(f);
  const other = effectiveOtherSupplier(form.otherSupplier, opts.otherSupplierChosen).trim();
  return {
    label: d("label") && isBlank(form.label.trim()) ? INVERTER_MSG.blank : null,
    // `If(And(<OtherSupplier dirty>, IsBlank(Trim(other))), And(<Supplier dirty>, IsBlank(cmb.Selected)), false)`.
    supplier: d("otherSupplier") && isBlank(other) && d("supplier") && isBlank(form.supplierId) ? INVERTER_MSG.blank : null,
    otherSupplier: opts.otherSupplierChosen && d("otherSupplier") && isBlank(other) ? INVERTER_MSG.blank : null,
    inverterTypes: d("inverterTypes") && form.inverterTypes.length === 0 ? INVERTER_MSG.blank : null,
    warranty: integerRangeError(form.warranty, 40, INVERTER_MSG.warrantyRange, lang),
    numberOfInverters: integerRangeError(form.numberOfInverters, 1_000_000, inverterLargeRange(lang), lang),
    nominalPower: isBlank(form.nominalPower.trim())
      ? null
      : !isDecimalWithPlaces(form.nominalPower.trim(), 2, lang)
        ? INVERTER_MSG.twoDecimals
        : inRange(form.nominalPower.trim(), 0, 1_000_000, lang) ? null : inverterLargeRange(lang),
  };
}

/**
 * The canvas Other Supplier error `Visible` (inverter Y:9535, substructure Y:8644): `If(And(<Supplier dirty>,
 * IsBlank(cmb.Selected)), And(<OtherSupplier dirty>, IsBlank(Trim(txt.Value))), false)` — false whenever a
 * supplier is chosen, which the field's own container requires. The substructure copy reads the dirty
 * flag from the INVERTER panel's table (`colPanelInverterFormValidation`); pass that flag as `otherDirty`.
 */
export const plantOtherSupplierErrorCanvasParity = (args: {
  supplierDirty: boolean; supplierBlank: boolean; otherDirty: boolean; otherBlank: boolean;
}): boolean => (args.supplierDirty && args.supplierBlank ? args.otherDirty && args.otherBlank : false);

/** `IsNumeric(v)` and `IsMatch(v, "^((\-?|\+?)?\d+(\.\d+)?)")` (a full match) — the validation-table test. */
const canvasNumber = (v: string, lang: Lang): boolean =>
  !isBlank(v.trim()) && isNumeric(v.trim(), lang) && /^[-+]?\d+(\.\d+)?$/.test(v.trim());

/**
 * `pcf_btn_…_Inverter_Buttons_Save.DisplayMode` as shipped (Y:10133): every row of
 * `colPanelInverterFormValidation` valid (label, supplier, other supplier for the "Other Supplier" row,
 * number of inverters and warranty `IsNumeric` + the digits pattern, the types, nominal power
 * `IsNumeric`) and at least one dirty. A non-integer warranty or count, or an out-of-range value,
 * passes although its error label shows.
 */
export function canSaveInverterCanvasParity(
  form: InverterFormState, opts: { otherSupplierChosen: boolean }, lang: Lang = "en-US",
): boolean {
  const other = effectiveOtherSupplier(form.otherSupplier, opts.otherSupplierChosen);
  return !isBlank(form.label.trim())
    && !isBlank(form.supplierId)
    && (!opts.otherSupplierChosen || !isBlank(other.trim()))
    && canvasNumber(form.numberOfInverters, lang)
    && form.inverterTypes.length > 0
    && canvasNumber(form.warranty, lang)
    && !isBlank(form.nominalPower.trim()) && isNumeric(form.nominalPower.trim(), lang)
    && form.dirty.size > 0;
}

/**
 * The Inverter Save gate. SOURCE DEFECT (D27 G9): the canvas gate (`canSaveInverterCanvasParity`) lets a
 * value through that its own error label rejects ("Value must be a integer", the 0…40 / 0…1,000,000.0
 * ranges, two decimals). Here a visible error also disables Save.
 */
export function canSaveInverter(
  form: InverterFormState, opts: { otherSupplierChosen: boolean }, lang: Lang = "en-US",
): boolean {
  const e = validateInverterForm(form, opts, lang);
  return canSaveInverterCanvasParity(form, opts, lang) && !e.warranty && !e.numberOfInverters && !e.nominalPower;
}

/**
 * The inverter save (`pcf_btn_…_Inverter_Buttons_Save.OnChange`, Y:10175): `Patch(InverterTypeInProjects,
 * <row or Defaults>, {Project, Inverter, 'Inverter Label', 'Other Supplier', 'Inverter Types', 'Warranty
 * [Years]', 'Number of Inverters', 'Nominal Power [kW]', 'Costs per Inverter [EUR/Inverter]' = Inverter
 * device cost × power / 1000 (0 without a device cost), 'Inverter Type Cost' = that × count, OBU})`, then
 * `'Plant PV Cost [EUR]'` over the re-read PV, inverter and substructure rows. A non-blank Other Supplier
 * (Y:10243) skips that roll-up: the screen runs `RequestModulePermission` for the row instead (D97), and
 * the flow adds the inverter cost to the project once the request is approved.
 */
function planSaveInverterUnchecked(args: {
  project: PlanProject;
  row: SimpleTypeRow | null;
  form: InverterFormState;
  otherSupplierChosen: boolean;
  deviceCostInverter: number | null | undefined;
  pv: Pick<SimpleTypeRow, "cost">[];
  inverters: SimpleTypeRow[];
  substructures: Pick<SimpleTypeRow, "cost">[];
  /** The user's language. Required: warranty, count and nominal power are typed in it. */
  lang: Lang;
}): WritePlan {
  const { lang } = args;
  const other = effectiveOtherSupplier(args.form.otherSupplier, args.otherSupplierChosen);
  const count = valueOrNull(args.form.numberOfInverters, lang);
  const power = valueOrNull(args.form.nominalPower, lang);
  const costs = inverterCosts({ deviceCostInverter: args.deviceCostInverter, nominalPowerKw: power ?? 0, numberOfInverters: count ?? 0 });
  const data: Record<string, unknown> = {
    [PLANT_BIND.project]: ref(ES.projects, args.project.id),
    ...(args.form.supplierId ? { [PLANT_BIND.inverter]: ref(ES_PLANT.inverters, args.form.supplierId) } : {}),
    vsb_inverterlabel: args.form.label,
    vsb_invothersupplier: isBlank(other.trim()) ? null : other,
    vsb_selectedinvertertypes: multiSelectText(args.form.inverterTypes),
    vsb_inverterwarranty: valueOrNull(args.form.warranty, lang),
    vsb_numberofinverters: count,
    vsb_inverternominalpower: power,
    vsb_costperinverter: costs.costPerInverter,
    vsb_invertertypecost: costs.typeCost,
    ...owner(args.project.owningBusinessUnitId),
  };
  const inverters = [...args.inverters.filter((r) => r.id !== args.row?.id), { cost: costs.typeCost }];
  const row = args.row
    ? upd(ES_PLANT.inverterTypeInProjects, args.row.id, data, "the inverter type")
    : ins(ES_PLANT.inverterTypeInProjects, data, "the inverter type");
  if (plantRequestsPermission(other)) return { writes: [row], log: [args.form.label] };
  return {
    writes: [
      row,
      upd(ES.projects, args.project.id, {
        [PROJECT_PLANT_COL.plantPvCost]: plantPvCost({ pv: args.pv, inverters, substructures: args.substructures }),
      }, "the project's Plant PV Cost"),
    ],
    log: [args.form.label],
  };
}

/** `planSaveInverter` with the F6 owning-business-unit refusal (a plan that creates rows is refused when the project has none). */
export const planSaveInverter = (...a: Parameters<typeof planSaveInverterUnchecked>): ReturnType<typeof planSaveInverterUnchecked> =>
  requireOwningBusinessUnit(planSaveInverterUnchecked(...a), a[0].project.owningBusinessUnitId);

/** The Add / Edit Substructure panel. */
export interface SubstructureFormState {
  label: string;
  /** The chosen `Substructures` row id. */
  supplierId: string | null;
  otherSupplier: string;
  /** `cmb_…_Substructure_Fields_SubstructureType.Selected` (single select). */
  substructureType: number | null;
  dirty: Set<string>;
}

/** The Substructure panel's verbatim texts. */
export const SUBSTRUCTURE_MSG = {
  /** `lbl_…_Substructure_Fields_{Label,OtherSupplier}_ErrorMessage.Text` — verbatim. */
  blank: "Value cannot be blank.",
  /** `lbl_…_Substructure_Fields_Supplier_ErrorMessage.Text` — verbatim. */
  supplier: "Supplier must be selected.",
  /** `lbl_…_Substructure_Fields_SubstructureType_ErrorMessage.Text` — verbatim. */
  substructureType: "Substructure Type must be selected.",
  /** `pcf_btn_…_Substructure_Buttons_Save.OnChange` success `Notify` (Y:9042) — verbatim. */
  saved: "Substructure type was successfully saved for current project!",
  /** `addSubstructureType` (Y:874) — `locGeneratorInformationDialogTitle`, verbatim. */
  infoTitle: "Add Substructure information",
  /** `addSubstructureType` (Y:875) — `locGeneratorInformationDialogText`, verbatim. */
  infoText: "Please add the module type first to calculate the cost correctly.",
  /** `cmp_PopUp_Information` › `pcf_PopUpInformation_BodyButtons_Ok.Text` — verbatim. */
  infoOk: "OK",
} as const;

/**
 * `If(IsBlank(<Other Supplier>), $"Substructure '{<Label>}' will be saved, please wait...", $"Request Permission
 * for substructure '{<Other Supplier>}' has been sent, please wait...")` (Y:8921-8925) — verbatim.
 */
export const substructureSaveProgressText = (label: string, otherSupplier = ""): string =>
  plantRequestsPermission(otherSupplier)
    ? `Request Permission for substructure '${otherSupplier}' has been sent, please wait...`
    : `Substructure '${label}' will be saved, please wait...`;

/**
 * `addSubstructureType` (Y:862-893): with `'Plant PV Capacity [MWp]'` blank or 0 the information popup
 * opens instead of the panel — the substructure cost is mounting cost × PV capacity.
 */
export const substructureNeedsPvCapacity = (plantPvCapacity: number | null | undefined): boolean =>
  plantPvCapacity === null || plantPvCapacity === undefined || plantPvCapacity === 0;

/**
 * The panel's defaults: the label, the catalogue substructure, its Other Supplier and the FIRST stored
 * type (`DefaultSelectedItems`, a single-select combobox).
 */
export function substructureFormDefaults(row: SimpleTypeRow | null): SubstructureFormState {
  return {
    label: row?.label ?? "",
    supplierId: row?.catalogueId ?? null,
    otherSupplier: row?.otherSupplier ?? "",
    substructureType: row?.typeValues?.[0] ?? null,
    dirty: new Set<string>(),
  };
}

export interface SubstructureFormErrors {
  label: string | null;
  supplier: string | null;
  otherSupplier: string | null;
  substructureType: string | null;
}

/**
 * The canvas error labels (Y:8396-8826). SOURCE DEFECT (D27 G9): the Supplier and Other Supplier labels'
 * `Visible` read the INVERTER panel's validation table (`colPanelInverterFormValidation`, Y:8516/8679), and
 * the Other Supplier one also needs a blank supplier — so neither shows from this panel. Here each label
 * reads this panel's own fields (`plantOtherSupplierErrorCanvasParity` keeps the canvas formula).
 */
export function validateSubstructureForm(
  form: SubstructureFormState, opts: { otherSupplierChosen: boolean },
): SubstructureFormErrors {
  const d = (f: string) => form.dirty.has(f);
  const other = effectiveOtherSupplier(form.otherSupplier, opts.otherSupplierChosen).trim();
  return {
    label: d("label") && isBlank(form.label.trim()) ? SUBSTRUCTURE_MSG.blank : null,
    supplier: d("supplier") && isBlank(form.supplierId) ? SUBSTRUCTURE_MSG.supplier : null,
    otherSupplier: opts.otherSupplierChosen && d("otherSupplier") && isBlank(other) ? SUBSTRUCTURE_MSG.blank : null,
    substructureType: d("substructureType") && form.substructureType === null ? SUBSTRUCTURE_MSG.substructureType : null,
  };
}

/** The validation rows that do not depend on the type row (label, supplier, other supplier, a change). */
function substructureRowsValid(form: SubstructureFormState, otherSupplierChosen: boolean): boolean {
  const other = effectiveOtherSupplier(form.otherSupplier, otherSupplierChosen);
  return !isBlank(form.label.trim())
    && !isBlank(form.supplierId)
    && (!otherSupplierChosen || !isBlank(other.trim()))
    && form.dirty.size > 0;
}

/**
 * The Substructure Save gate: every row valid and a change. SOURCE DEFECT (D27 G9): the canvas seeds
 * the `SubstructureType` row as `Valid: IsBlank(<row>.'Substructure Types')` (Y:1129) — inverted — so an
 * edit of a typed row cannot save until the type is picked again, and a new row counts as valid with no
 * type (`canSaveSubstructureCanvasParity`). Here the row is valid when a type is chosen.
 */
export function canSaveSubstructure(form: SubstructureFormState, opts: { otherSupplierChosen: boolean }): boolean {
  return substructureRowsValid(form, opts.otherSupplierChosen) && form.substructureType !== null;
}

/** The canvas twin: the type row keeps its inverted seed until the supplier or the type changes. */
export function canSaveSubstructureCanvasParity(
  form: SubstructureFormState, opts: { otherSupplierChosen: boolean; storedTypeValues: readonly number[] },
): boolean {
  const touched = form.dirty.has("substructureType") || form.dirty.has("supplier");
  const typeValid = touched ? form.substructureType !== null : opts.storedTypeValues.length === 0;
  return substructureRowsValid(form, opts.otherSupplierChosen) && typeValid;
}

/**
 * The substructure save (`pcf_btn_…_Substructure_Buttons_Save.OnChange`, Y:8918): `Patch(SubstructureTypeInProjects,
 * <row or Defaults>, {Project, Substructure, 'Other Supplier', 'Substructure Label', 'Substructure Types',
 * 'Substructure Cost [EUR]' = Fixed / Tracker mounting cost × 'Plant PV Capacity [MWp]' (else 0), OBU})`,
 * then `'Plant PV Cost [EUR]'`. A non-blank Other Supplier (Y:8979) skips that roll-up: the screen runs
 * `RequestModulePermission` for the row instead (D97), and the flow adds the cost once it is approved.
 */
function planSaveSubstructureUnchecked(args: {
  project: PlanProject;
  row: SimpleTypeRow | null;
  form: SubstructureFormState;
  otherSupplierChosen: boolean;
  deviceCostFix: number | null | undefined;
  deviceCostTracker: number | null | undefined;
  plantPvCapacity: number | null | undefined;
  pv: Pick<SimpleTypeRow, "cost">[];
  inverters: Pick<SimpleTypeRow, "cost">[];
  substructures: SimpleTypeRow[];
}): WritePlan {
  const other = effectiveOtherSupplier(args.form.otherSupplier, args.otherSupplierChosen);
  const type = args.form.substructureType;
  const cost = substructureCost({
    mounting: type === null ? null : SUBSTRUCTURE_TYPE_LABELS[type] ?? null,
    deviceCostFix: args.deviceCostFix, deviceCostTracker: args.deviceCostTracker, plantPvCapacityMwp: args.plantPvCapacity,
  });
  const data: Record<string, unknown> = {
    [PLANT_BIND.project]: ref(ES.projects, args.project.id),
    ...(args.form.supplierId ? { [PLANT_BIND.substructure]: ref(ES_PLANT.substructures, args.form.supplierId) } : {}),
    vsb_substrothersupplier: isBlank(other.trim()) ? null : other,
    vsb_substructurelabel: args.form.label,
    vsb_selectedsubstructuretypes: type === null ? null : String(type),
    vsb_substructurecost: cost,
    ...owner(args.project.owningBusinessUnitId),
  };
  const substructures = [...args.substructures.filter((r) => r.id !== args.row?.id), { cost }];
  const row = args.row
    ? upd(ES_PLANT.substructureTypeInProjects, args.row.id, data, "the substructure type")
    : ins(ES_PLANT.substructureTypeInProjects, data, "the substructure type");
  if (plantRequestsPermission(other)) return { writes: [row], log: [args.form.label] };
  return {
    writes: [
      row,
      upd(ES.projects, args.project.id, {
        [PROJECT_PLANT_COL.plantPvCost]: plantPvCost({ pv: args.pv, inverters: args.inverters, substructures }),
      }, "the project's Plant PV Cost"),
    ],
    log: [args.form.label],
  };
}

/** `planSaveSubstructure` with the F6 owning-business-unit refusal (a plan that creates rows is refused when the project has none). */
export const planSaveSubstructure = (...a: Parameters<typeof planSaveSubstructureUnchecked>): ReturnType<typeof planSaveSubstructureUnchecked> =>
  requireOwningBusinessUnit(planSaveSubstructureUnchecked(...a), a[0].project.owningBusinessUnitId);

/* ══════════════════════════════════ D97 — the module-permission flows' texts, and the write texts ════ */

/**
 * The module-permission flows' texts (D97; D27's `EXCLUDED` reasons are gone with the flows now called).
 * Verbatim canvas texts keep their typos ("permisson", "forg").
 */
export const PERMISSION_MSG = {
  /** The cards' Cancel success `Notify` — WTG Y:2689, PV Y:3835, inverter Y:4503, substructure Y:5162 — verbatim. */
  canceled: (family: PlantFamily, name: string | null | undefined): string => {
    const n = name ?? "";
    switch (family) {
      case "wtg": return `Request permisson forg generator ${n} was canceled !`;
      case "pv": return `Request permisson was canceled for PV Module ${n}!`;
      case "inverter": return `Request permisson was canceled for inverter ${n}!`;
      default: return `Request permisson was canceled for substructure ${n}!`;
    }
  },
  /**
   * The cards' Cancel error `Notify` (Y:2694 / 3840 / 4508 / 5167) — verbatim; the flow is named where the canvas
   * puts `FirstError.Source`, as `writeErrorText` names the table.
   */
  cancelError: (detail: string): string =>
    `Error: Current project cannot be send to controlling for approval. Internal error: originated on Request permission cancellation. Message: ${detail}`,
  /** NEW — no canvas equivalent: the canvas runs the card's Cancel without a progress dialog. */
  canceling: (name: string | null | undefined): string => `Request permission for "${name ?? ""}" will be canceled, please wait...`,
  /**
   * NEW — no canvas equivalent: a flow input the environment does not provide (`vsb_ProjectManagementAppID`,
   * `vsb_PrimarilyApprovalGroupID`, the user's e-mail). The canvas would send a blank and the flow would fail.
   */
  setupMissing: (what: string): string =>
    `The approval flow cannot be started: ${what} is not set in this environment. Please contact your administrator.`,
} as const;

/** The verbatim `Notify` texts of the writes. */
export const WRITE_MSG = {
  /** Y:11631 success — verbatim. */
  turbineSaved: "Generator was successfully saved for current project!",
  /** Y:15767 — verbatim. */
  typeDeleted: "Generator type was successfully deleted.",
  /** Y:16056 — verbatim. */
  turbineDeleted: "Generator and related Land Leases have been successfully deleted.",
  /** Y:16250 — verbatim. */
  statusChanged: "Generator status was successfully changed.",
  /** Y:15436 — verbatim. */
  inverterDeleted: "Inverter type was successfully deleted.",
  /** Y:15347 — verbatim. */
  substructureDeleted: "Substructure type was successfully deleted.",
  /** Y:10307 / Y:9042 — verbatim (G9). */
  inverterSaved: INVERTER_MSG.saved,
  substructureSaved: SUBSTRUCTURE_MSG.saved,
  /** Y:12377 / 13100 / 13818 — verbatim. */
  storageSaved: "Storage type was successfully saved for current project!",
  hydrogenSaved: "Hydrogen type was successfully saved for current project!",
  substationSaved: "Substation type was successfully saved for current project!",
  /** Y:16315 / 16298 / 16281 — verbatim. */
  storageDeleted: "BESS type was successfully deleted.",
  hydrogenDeleted: "Hydrogen type was successfully deleted.",
  substationDeleted: "Substation type was successfully deleted.",
  /** NEW — no canvas equivalent: the canvas shows no progress dialog for deletes and status changes. */
  working: "Saving changes, please wait...",
} as const;

/** `"Error: <what> " & "Internal error: originated on " & FirstError.Source & ". Message: " & …` — the table is named instead of `FirstError.Source`. */
export const writeErrorText = (what: string, entitySet: string) => (detail: string): string =>
  `Error: ${what} Internal error: originated on ${entitySet}. Message: ${detail}`;

/** The canvas `Error: …` prefixes, verbatim. */
export const WRITE_ERROR = {
  typeSave: writeErrorText("Generator type could not be saved.", ES_PLANT.generatorTypeInProjects),
  turbineSave: writeErrorText("Generator could not be saved.", ES_PLANT.generatorInProjects),
  typeDelete: writeErrorText("Generator could not be deleted.", ES_PLANT.generatorTypeInProjects),
  turbineDelete: writeErrorText("Generator could not be deleted.", ES_PLANT.generatorInProjects),
  status: writeErrorText("Generator status cannot be changed.", ES_PLANT.generatorTypeInProjects),
  inverterDelete: writeErrorText("Inverter could not be deleted.", ES_PLANT.inverterTypeInProjects),
  substructureDelete: writeErrorText("Substructure could not be deleted.", ES_PLANT.substructureTypeInProjects),
  /** `"Error: Inverter type could not be saved. " & …` / `"Error: Substructure type could not be saved. " & …` (G9). */
  inverterSave: writeErrorText("Inverter type could not be saved.", ES_PLANT.inverterTypeInProjects),
  substructureSave: writeErrorText("Substructure type could not be saved.", ES_PLANT.substructureTypeInProjects),
  /** `replaceErrorText` with the table named instead of `FirstError.Source` (G6). */
  wtgReplace: (detail: string) => replaceErrorText("wtg", { source: ES_PLANT.generatorTypeInProjects, message: detail }),
  pvReplace: (detail: string) => replaceErrorText("pv", { source: ES_PLANT.pvModuleTypeInProjects, message: detail }),
  storageSave: writeErrorText("Storage type could not be saved.", ES_PLANT.storageTypeInProjects),
  hydrogenSave: writeErrorText("Hydrogen type could not be saved.", ES_PLANT.hydrogenTypeInProjects),
  substationSave: writeErrorText("Substation type could not be saved.", ES_PLANT.substationTypeInProjects),
  storageDelete: writeErrorText("BESS could not be deleted.", ES_PLANT.storageTypeInProjects),
  hydrogenDelete: writeErrorText("Hydrogen could not be deleted.", ES_PLANT.hydrogenTypeInProjects),
  substationDelete: writeErrorText("Substation could not be deleted.", ES_PLANT.substationTypeInProjects),
} as const;

/**
 * `If(tgl_…_Filter_Country.Checked, $"Generator ""{DisplayName}"" will be saved, please wait...",
 * $"Request Permission for ""{DisplayName}"" has been sent, please wait...")` (Y:15214) — verbatim.
 */
export const typeSaveProgressText = (displayName: string | null | undefined, inCountry = true): string =>
  inCountry
    ? `Generator "${displayName ?? ""}" will be saved, please wait...`
    : `Request Permission for "${displayName ?? ""}" has been sent, please wait...`;

/**
 * The turbine save's progress text: `$"WTG '{Short Name}_{n}' will be saved, please wait..."` from the
 * Save button (Y:11631) and `$"WTG ""{Short Name}_{n}"" will be saved, please wait..."` from the
 * height-limitation popup (Y:17004) — both verbatim.
 */
export const turbineSaveProgressText = (shortName: string | null | undefined, index: string, fromPopup = false): string =>
  fromPopup
    ? `WTG "${shortName ?? ""}_${index}" will be saved, please wait...`
    : `WTG '${shortName ?? ""}_${index}' will be saved, please wait...`;

/** `$"{label} will be saved. Please waiting..."` (Y:12323, 13047, 13766) — verbatim. */
export const simpleSaveProgressText = (label: string): string => `${label} will be saved. Please waiting...`;

/** `pcf_btn_…Buttons_Save.Tooltip` (Y:15215) / `pcf_btn_…Buttons_Cancel.Tooltip` — verbatim. */
export const TYPE_PANEL_TOOLTIPS = { save: "Save Generator Type", cancel: "Close" } as const;

/** The pager icons' `Tooltip` (Y:1952/1990/2056) — verbatim. */
export const PAGER_TOOLTIPS = {
  first: "Navigate to first page",
  previous: "Navigate to previous page",
  next: "Navigate to next page",
} as const;

/** The cards' Cancel request button — `Text`, and the WTG `Tooltip` (Y:2698/2700); the other cards' tooltip (Y:3846). */
export const CANCEL_REQUEST = {
  text: "Cancel",
  wtgTooltip: "Cancel Request Permission.",
  tooltip: "Reset values form fields back.",
} as const;

/**
 * Multi-select option labels the cards show — `vsb_selectedinvertertypes` ('Inverter Types') and
 * `vsb_selectedsubstructuretypes` ('Substructure Types'). Pinned to the pac-generated enums by UT-GEN-095.
 */
export const INVERTER_TYPE_LABELS: Readonly<Record<number, string>> = { 952850000: "String", 952850001: "Central" };
export const SUBSTRUCTURE_TYPE_LABELS: Readonly<Record<number, string>> = { 952850000: "Fixed", 952850001: "Tracker" };

/** A multi-select column's raw value (`"952850000,952850001"`) as option values. */
export function multiSelectValues(raw: unknown): number[] {
  if (typeof raw === "number") return [raw];
  if (typeof raw !== "string" || raw.trim() === "") return [];
  return raw.split(",").map((v) => Number(v.trim())).filter((n) => Number.isFinite(n));
}

/** NEW — no canvas equivalent: the load-error state (CONVENTIONS rule 19). */
export const GENERATORS_SCREEN_TEXT = {
  loadFailedTitle: "The generator data could not be loaded",
  loadFailedDescription: "Reload the page or try again later.",
} as const;

/** `lbl_Generator_GeneratorStatus.Text = ThisItem.Status` (Y:2589) — the statecode labels. */
export const statusLabel = (status: number): string =>
  status === CHOICE_PLANT.status.active ? "Active" : "Inactive";
