/**
 * Project Generators Screen - the selection, folding, card display values and the turbine / BESS / Hydrogen / Substation panel forms.
 *
 * Split out of `rules.ts` by job (D159, audit finding 7). `rules.ts` re-exports this file, so every import of `@/features/pm/generators/rules` is unchanged.
 */
import { CHOICE_PLANT } from "@/data/dataverseNames";
import { type Lang, inRange, isBlank, isDecimalWithPlaces, pfxRound } from "@/domain/powerFxNumeric";
import { type CatalogModel, type GeneratorTypeRow, type PlantFamily, type ProjectPlanning, type SimpleTypeRow, type TurbineFormState, type TurbineRow, catalogTotalHeight, editedTotalHeight, forLanguage, isDummySupplier, numericOr, pageCount, SIMPLE_TEXT_MAX_LENGTH, textFormat, textIntOr, textTooLongMessage } from "./rulesCore";
import { turbineNamePrefix } from "./captions";

/* ═══════════════════════════════════════════ D27 — selection, folding, default row ════ */

/**
 * The ONE selected card. Every card's `RowTransparent.OnSelect` blanks the other six families'
 * `locSelected…` (Y:2925, 3915, 4658, 5317, 5949, 6524, 7100), so at most one entity is selected
 * screen-wide (D27 corrects the code's seven independent selections).
 */
export interface SelectedRow {
  family: PlantFamily;
  id: string;
}

/** `locSelected… : If(locSelected….Id = ThisItem.Id, Blank(), ThisItem)` + blank the others. */
export function toggleSelection(sel: SelectedRow | null, family: PlantFamily, id: string): SelectedRow | null {
  return sel && sel.family === family && sel.id === id ? null : { family, id };
}

/** The selected row of one family, or null. */
export const selectedIn = <T extends { id: string }>(
  sel: SelectedRow | null, family: PlantFamily, rows: readonly T[],
): T | null => (sel && sel.family === family ? rows.find((r) => r.id === sel.id) ?? null : null);

/**
 * `addWTGType.OnSelect` (Y:791) blanks the WTG, inverter, substructure and PV selections — not
 * BESS / Hydrogen / Substation.
 */
export const selectionAfterAddWtg = (sel: SelectedRow | null): SelectedRow | null =>
  sel && (sel.family === "storage" || sel.family === "hydrogen" || sel.family === "substation") ? sel : null;

/**
 * `addPVType.OnSelect` (Y:791) blanks the WTG, turbine, inverter and substructure selections and
 * keeps the PV one (re-looked up).
 */
export const selectionAfterAddPv = (sel: SelectedRow | null): SelectedRow | null =>
  sel && sel.family !== "wtg" && sel.family !== "inverter" && sel.family !== "substructure" ? sel : null;

/**
 * Folding. `OnVisible` adds `IsFolded: true` to every row of every family (Y:63), so every card
 * starts COLLAPSED; the detail fields are visible only while unfolded (`…_Card.Height`, Y:1344).
 * The set holds the EXPANDED ids (D27 corrects the code, which expanded WTG cards by default and
 * never collapsed the others).
 */
export const toggleExpanded = (expanded: ReadonlySet<string>, id: string): Set<string> => {
  const next = new Set(expanded);
  if (next.has(id)) next.delete(id); else next.add(id);
  return next;
};

/**
 * A non-WTG card's row button selects AND folds: `UpdateContext({locSelected…})` then
 * `UpdateIf(col…, Name = gal.Selected.Name, {IsFolded: Not(IsFolded)})` (e.g. Y:3915). Its two
 * fold icons are `Select(<row button>)`. The WTG row button only selects (Y:2925).
 */
export const rowClickFolds = (family: PlantFamily): boolean => family !== "wtg";

/**
 * The WTG fold icons (`ico_…GeneratorType_Up` / `_Down`, Y:2466/2510) set the selection to the
 * card, then — when the card is folded — `Select(<row button>)`, then toggle the fold. `Select`
 * is QUEUED, so the row button runs last and, finding the card already selected, blanks it:
 * expanding a card deselects it.
 *
 * SOURCE DEFECT (D27): the evident intent is "expand selects". `wtgFoldSelection` keeps the card
 * selected either way; this twin keeps the canvas result reachable (UT-GEN-099).
 */
export const wtgFoldSelection = (_wasFolded: boolean, id: string): SelectedRow => ({ family: "wtg", id });
export const wtgFoldSelectionCanvasParity = (wasFolded: boolean, id: string): SelectedRow | null =>
  wasFolded ? null : { family: "wtg", id };

/**
 * `btn_SetDefaultSeletected_Item.OnSelect` (Y:137), run after deleting a WTG type, a PV type, a
 * BESS, a Hydrogen or a Substation: select the first WTG type, else the first PV type, else the
 * first Hydrogen, else the first BESS, else the first Substation.
 */
export function defaultSelection(lists: {
  wtg: readonly { id: string }[];
  pv: readonly { id: string }[];
  hydrogen: readonly { id: string }[];
  storage: readonly { id: string }[];
  substation: readonly { id: string }[];
}, removedId?: string): SelectedRow | null {
  const order: (keyof typeof lists)[] = ["wtg", "pv", "hydrogen", "storage", "substation"];
  for (const family of order) {
    const first = lists[family].find((r) => r.id !== removedId);
    if (first) return { family, id: first.id };
  }
  return null;
}

/**
 * `con_…GeneratorType_CardDetails_Pagination_Buttons.Visible` (Y:1903) — only when the type has
 * more than one page. `TotalRows` is the type's `'Number of Generators'` in the canvas.
 * DIVERGENCE (F9 / GR-5, D121 §8): the Screen passes the number of LOADED turbines, because the stored count can
 * be out of step with the rows (a save, another user) and then gave a page with no rows or a pager that hid rows.
 */
export const pagerVisible = (numberOfGenerators: number | null | undefined): boolean =>
  pageCount(numberOfGenerators ?? 0) > 1;

/**
 * `addGenerator.ItemEnabled` (Y:1472) — `And(locGeneratorsGridTotalRows < 200, Status = Active)`.
 * DIVERGENCE (D27): the canvas count is ONE screen variable, set only by a turbine delete (and
 * blank, i.e. 0, before that), so every type used the count of whichever type was last touched.
 * Here each type uses its own turbine count.
 */
export const canAddGenerator = (turbineCount: number, status: number): boolean =>
  turbineCount < 200 && status === CHOICE_PLANT.status.active;

/* ═══════════════════════════════════════════════════ D27 — card display values ════ */

/**
 * `txt_…GeneratorType_CardDetails_HubHeight.Value` (Y:1537): for a Dummy supplier the FIRST
 * turbine's `'Hub Height excl. Foundation Plinth [m]'`, else the catalogue `'Hub Height'`, as
 * `If(Int(x) = x, Text(x, "#"), Text(x, "#0.0#"))`.
 */
export function wtgCardHubHeight(
  model: Pick<CatalogModel, "supplier" | "hubHeight"> | null | undefined,
  firstTurbine: Pick<TurbineRow, "hubHeightExclPlinth"> | null | undefined,
  lang: Lang = "en-US",
): string {
  const value = isDummySupplier(model?.supplier) ? firstTurbine?.hubHeightExclPlinth : model?.hubHeight;
  return textIntOr(value, "#0.0#", lang);
}

/** The WTG card's other visible values (Y:1600-1838). */
export function wtgCardValues(args: {
  model: Pick<CatalogModel, "supplier" | "hubHeight" | "rotorDiameter" | "totalHeight"> | null | undefined;
  type: Pick<GeneratorTypeRow, "numberOfGenerators" | "generatorsCapacity">;
  firstTurbine: Pick<TurbineRow, "hubHeightExclPlinth"> | null | undefined;
  planning: ProjectPlanning | null;
  /** The user's language (default en-US): the numbers on the card follow it. */
  lang?: Lang;
}): {
  supplier: string; hubHeight: string; rotorDiameter: string; totalHeight: string;
  heightLimitation: string; numberOfGenerators: string; generatorsCapacity: string;
} {
  return {
    supplier: args.model?.supplier ?? "",
    hubHeight: wtgCardHubHeight(args.model, args.firstTurbine, args.lang),
    rotorDiameter: textIntOr(args.model?.rotorDiameter, "#0.0#", args.lang),
    totalHeight: textIntOr(catalogTotalHeight(args.model), "#0.0#", args.lang),
    // `gblRecordProjectPlanning.'Height limitation [m]'` straight into a number field.
    heightLimitation: args.planning?.heightLimitation === null || args.planning?.heightLimitation === undefined
      ? "" : forLanguage(String(args.planning.heightLimitation), args.lang),
    numberOfGenerators: args.type.numberOfGenerators === null ? "" : String(args.type.numberOfGenerators),
    // `Text(ThisItem.'Generators Capacity', "#.0")`.
    generatorsCapacity: textFormat(args.type.generatorsCapacity, "#.0", args.lang),
  };
}

/**
 * `txt_…PvModule_CardDetails_Supplier.Value` (Y:3097): `If(Not(IsBlank('Other Supplier')),
 * 'Other Supplier', Not(IsBlank(PVModule.Supplier)), PVModule.Supplier, <lookup>.Supplier)`.
 * Inverter / substructure: `If(Not(IsBlank('Other Supplier')), 'Other Supplier', <catalogue>.Supplier)`.
 */
export const cardSupplier = (row: Pick<SimpleTypeRow, "otherSupplier" | "catalogueSupplier" | "supplier">): string =>
  !isBlank(row.otherSupplier) ? String(row.otherSupplier) : row.catalogueSupplier ?? row.supplier ?? "";

/** The PV card (Y:3097-3591): supplier, `Text(cap, "#0.0")`, both degradations `Int ? "#" : "0.0#"`. */
export function pvCardValues(row: SimpleTypeRow, lang: Lang = "en-US"): {
  supplier: string; capacity: string; degradation1stYear: string; degradationRemainingYears: string;
} {
  return {
    supplier: cardSupplier(row),
    capacity: textFormat(row.capacity, "#0.0", lang),
    degradation1stYear: textIntOr(row.degradation1stYear, "0.0#", lang),
    degradationRemainingYears: textIntOr(row.degradationRemainingYears, "0.0#", lang),
  };
}

/**
 * The inverter card (Y:4051-4321): types `Substitute(TrimEnds(Concat(types, Value & " ")), " ", ",")`,
 * supplier, cost per inverter and type cost `"#,###.00"`, count, nominal power `Int ? "#" : "0.0#"`,
 * warranty.
 */
export function inverterCardValues(row: SimpleTypeRow, lang: Lang = "en-US"): {
  inverterType: string; supplier: string; costPerInverter: string; numberOfInverters: string;
  typeCost: string; nominalPower: string; warranty: string;
} {
  return {
    inverterType: (row.typeLabels ?? []).join(" ").trim().replace(/ /g, ","),
    supplier: cardSupplier(row),
    costPerInverter: textFormat(row.costPerInverter, "#,###.00", lang),
    numberOfInverters: row.numberOfInverters === null || row.numberOfInverters === undefined ? "" : String(row.numberOfInverters),
    typeCost: textFormat(row.cost, "#,###.00", lang),
    nominalPower: textIntOr(row.nominalPower, "0.0#", lang),
    warranty: row.warranty === null || row.warranty === undefined ? "" : String(row.warranty),
  };
}

/** `lbl_…Substructure_CardDetails_SubstructureCost_ErrorMessage.Text` (Y:4935) — verbatim. */
export const SUBSTRUCTURE_COST_NOTE = "* Please add Module Type in order to calculate cost.";
/** `info_…Substructure_CardDetails_SubstructureCost.Content` (Y:4967) — verbatim. */
export const SUBSTRUCTURE_COST_INFO = "Please add Module Type in order to calculate cost.";

/** `Or(IsBlank('Plant PV Capacity [MWp]'), 'Plant PV Capacity [MWp]' = 0)` (Y:4934). */
export const substructureCostNoteVisible = (plantPvCapacity: number | null | undefined): boolean =>
  plantPvCapacity === null || plantPvCapacity === undefined || plantPvCapacity === 0;

/** The substructure card (Y:4809-4949). */
export function substructureCardValues(row: SimpleTypeRow, lang: Lang = "en-US"): { supplier: string; types: string; cost: string } {
  return {
    supplier: cardSupplier(row),
    types: (row.typeLabels ?? []).join(" ").trim().replace(/ /g, ","),
    cost: textFormat(row.cost, "#,##0.00", lang),
  };
}

/** BESS `"#,##0.00"` ×2 (Y:5493/5550); Hydrogen and Substation `"#,##0.0"` (Y:6127/6703). */
export function simpleCardValues(family: "storage" | "hydrogen" | "substation", row: SimpleTypeRow, lang: Lang = "en-US"): string[] {
  if (family === "storage") {
    return [textFormat(row.capacity, "#,##0.00", lang), textFormat(row.energyCapacity, "#,##0.00", lang), row.supplier ?? ""];
  }
  return [textFormat(row.capacity, "#,##0.0", lang), row.supplier ?? ""];
}

/**
 * `cmp_PopUp_Confirmation_WTGTypeHeightLimitation.Description` (Y:16646) trims the display name:
 * `With({input: DisplayName}, Left(input, Len(input) - 2))`.
 */
export const heightPopupTypeName = (displayName: string | null | undefined): string => {
  const s = displayName ?? "";
  return s.slice(0, Math.max(0, s.length - 2));
};

/**
 * The permission-request Cancel button on a WTG / inverter / substructure card (Y:2701/4515/5174):
 * `And(Not(IsBlank(FlowRunId)), Not(IsBlank(FlowApprovalId)), State <> PermissionApproved)`.
 * On a PV card (Y:3847): `State = 'Request Pending'`. BESS / Hydrogen / Substation: none.
 */
export function cancelRequestVisible(
  family: PlantFamily,
  row: Pick<SimpleTypeRow, "flowRunId" | "flowApprovalId" | "requestPermissionState">,
): boolean {
  if (family === "pv") return row.requestPermissionState === CHOICE_PLANT.requestPermissionState.pending;
  if (family === "wtg" || family === "inverter" || family === "substructure") {
    return !isBlank(row.flowRunId) && !isBlank(row.flowApprovalId)
      && row.requestPermissionState !== CHOICE_PLANT.requestPermissionState.approved;
  }
  return false;
}

/** The permission chip is shown for WTG / PV / inverter / substructure only (BESS / H2 / Sub hide it). */
export const showsPermissionChip = (family: PlantFamily): boolean =>
  family === "wtg" || family === "pv" || family === "inverter" || family === "substructure";

/* ═══════════════════════════════════════════════════ D27 — the turbine panel form ════ */

/** `Value(Last(Split(Name, "_")).Value)` over every turbine of the project, `Max(…) + 1` (Y:1475). */
export function nextTurbineIndex(projectTurbines: readonly Pick<TurbineRow, "index">[]): number {
  const finite = projectTurbines.map((t) => t.index).filter((n) => Number.isFinite(n));
  return (finite.length === 0 ? 0 : Math.max(...finite)) + 1;
}

/**
 * `locGeneratorNamePrefix`: a new turbine `$"WTG {'Short Name'}_"` (Y:1475); an edited one keeps its
 * own `First(Split(Name, "_")) & "_"` (Y:2215-2234). The SAVE always writes the short-name prefix.
 */
export const turbinePanelPrefix = (
  turbine: Pick<TurbineRow, "name"> | null, shortName: string | null | undefined,
): string => (turbine?.name ? `${turbine.name.split("_")[0] ?? ""}_` : turbineNamePrefix(shortName));

/**
 * The turbine panel's opening values (Y:10677-11285): name = own index, else the project-wide next
 * index (dirty, as the canvas `NameNextIndex` row); effective capacity = own, else the catalogue
 * `'Specific Capacity'` as `"#0.0#"`; hub height = own, else the catalogue `'Hub Height'` as `"#0.00"`;
 * plinth = `Coalesce(own, 0)`. (D27 corrects the blank new-turbine form.)
 */
export function turbineFormDefaults(args: {
  turbine: TurbineRow | null;
  model: Pick<CatalogModel, "specificCapacity" | "hubHeight"> | null;
  nextIndex: number;
  /** The user's language (default en-US): the boxes open in its decimal separator, which the validators then expect. */
  lang?: Lang;
}): TurbineFormState {
  const t = args.turbine;
  const lang = args.lang ?? "en-US";
  return {
    nameIndex: t ? (Number.isFinite(t.index) ? String(t.index) : "") : String(args.nextIndex),
    effectiveCapacity: t?.effectiveCapacity !== null && t?.effectiveCapacity !== undefined
      ? textFormat(t.effectiveCapacity, "#0.0#", lang) : textFormat(args.model?.specificCapacity, "#0.0#", lang),
    effectiveHubHeight: t?.hubHeightExclPlinth !== null && t?.hubHeightExclPlinth !== undefined
      ? textFormat(t.hubHeightExclPlinth, "#0.00", lang) : textFormat(args.model?.hubHeight, "#0.00", lang),
    foundationPlinth: forLanguage(String(t?.foundationPlinth ?? 0), lang),
    dirty: t ? new Set<string>() : new Set<string>(["nameIndex"]),
  };
}

/**
 * F9 / GL-3: the read-only Total Height box. The sum of typed heights carries binary float noise in JS
 * (140.2 + 2.2 + 0.5 x 141.2 is 212.99999999999997 where Power Fx shows 213), so the value is rounded to 10 places,
 * which removes the noise and no real digit.
 */
export const fmtTurbineTotalHeightBox = (v: number | null | undefined, lang: Lang = "en-US"): string =>
  v === null || v === undefined || !Number.isFinite(v) ? "" : forLanguage(String(pfxRound(v, 10)), lang);

/**
 * `txt_…Fields_Total_Height.Value` (Y:11473): while any row is dirty, hub height + plinth + ½ rotor
 * from the inputs; otherwise the stored `'Total Height'`.
 */
export function turbinePanelTotalHeight(args: {
  form: TurbineFormState;
  storedTotalHeight: number | null | undefined;
  rotorDiameter: number | null | undefined;
  /** The user's language. Required: hub height and plinth are typed in it. */
  lang: Lang;
}): number | null {
  if (args.form.dirty.size === 0) return args.storedTotalHeight ?? null;
  const { lang } = args;
  return editedTotalHeight({
    hubHeight: numericOr(args.form.effectiveHubHeight, 0, lang),
    foundationPlinth: numericOr(args.form.foundationPlinth, 0, lang),
    rotorDiameter: args.rotorDiameter,
  });
}

/* ═══════════════════════════════════════ D27 — BESS / Hydrogen / Substation panels ════ */

export type SimpleCapacityFamily = "storage" | "hydrogen" | "substation";

export interface SimpleFormState {
  label: string;
  capacity: string;
  /** BESS only — `'Energy Capacity [MWh]'`. */
  energyCapacity: string;
  supplier: string;
  dirty: Set<string>;
}

export interface SimpleFormErrors {
  label: string | null;
  capacity: string | null;
  energyCapacity: string | null;
  supplier: string | null;
}

/** The three panels' verbatim messages (Y:11837-13567). */
export const SIMPLE_MSG = {
  /** `lbl_…StorageLabel_ErrorMessage.Text` / `…HydrogenLabel…` / `…SubstationLabel…` and the supplier labels — verbatim (no period). */
  blank: "Value cannot be blank",
  twoDecimals: "Numeric value with maximum of two decimals",
  /** `lbl_…HydrogenCapacityMW_ErrorMessage_2.Text` (Y:12743) / Substation — verbatim (sic). */
  oneDecimal: "Numeric value with maximum of one decimals",
  range1000: "Please select a value between 0 and 1000.",
  range10000: "Please select a value between 0 and 10000.",
} as const;

/** `MaxLength` of the capacity inputs: BESS 8 / 8, Hydrogen 6, Substation 6 (Y:11957/12054/12778/13499). */
export const SIMPLE_CAPACITY_MAX_LENGTH: Record<SimpleCapacityFamily, number> = {
  storage: 8, hydrogen: 6, substation: 6,
};

function capacityError(value: string, places: 1 | 2, max: number, lang: Lang): string | null {
  const v = value.trim();
  if (isBlank(v)) return null;
  if (!isDecimalWithPlaces(v, places, lang)) return places === 1 ? SIMPLE_MSG.oneDecimal : SIMPLE_MSG.twoDecimals;
  if (!inRange(v, 0, max, lang)) return max === 10000 ? SIMPLE_MSG.range10000 : SIMPLE_MSG.range1000;
  return null;
}

/**
 * The visible error labels: the label / supplier once touched and blank; a capacity whenever it
 * holds a bad non-blank value — BESS power two decimals 0…1000, BESS energy two decimals 0…10000,
 * Hydrogen and Substation one decimal 0…1000.
 */
export function validateSimpleForm(
  family: SimpleCapacityFamily, form: SimpleFormState, lang: Lang = "en-US",
): SimpleFormErrors {
  const places: 1 | 2 = family === "storage" ? 2 : 1;
  return {
    label: form.dirty.has("label") && isBlank(form.label.trim())
      ? SIMPLE_MSG.blank
      : form.label.length > SIMPLE_TEXT_MAX_LENGTH ? textTooLongMessage(SIMPLE_TEXT_MAX_LENGTH) : null,
    capacity: capacityError(form.capacity, places, 1000, lang),
    energyCapacity: family === "storage" ? capacityError(form.energyCapacity, 2, 10000, lang) : null,
    supplier: form.dirty.has("supplier") && isBlank(form.supplier.trim())
      ? SIMPLE_MSG.blank
      : form.supplier.length > SIMPLE_TEXT_MAX_LENGTH ? textTooLongMessage(SIMPLE_TEXT_MAX_LENGTH) : null,
  };
}

/**
 * `pcf_btn_…_{Storage,Hydrogen,Substation}_Buttons_Save_2.DisplayMode` (Y:12287): at least one dirty
 * row and no invalid row, each row valid when its value is non-blank and its error label hidden
 * (the hidden Type rows are commented out of the table, Y:791). D27 adds this gate; the code had none.
 */
export function canSaveSimple(family: SimpleCapacityFamily, form: SimpleFormState, lang: Lang = "en-US"): boolean {
  if (form.dirty.size === 0) return false;
  const e = validateSimpleForm(family, form, lang);
  if (Object.values(e).some((x) => x !== null)) return false;
  if (isBlank(form.label.trim()) || isBlank(form.capacity.trim()) || isBlank(form.supplier.trim())) return false;
  return family !== "storage" || !isBlank(form.energyCapacity.trim());
}

/**
 * The panel opens bound to the SELECTED row (`addStorage` / `addHydrogen` / `addSubstation` do not
 * blank the selection, Y:791; the fields' `Value` is the row's, Y:11871…): `Text(Name)`, capacity
 * `"#0.00"` (BESS) — D27 DIVERGENCE: Hydrogen / Substation prefill `"#0.0"`, not the canvas
 * `"#,##0.0"`, whose thousands separator its own one-decimal check rejects.
 */
export function simpleFormDefaults(family: SimpleCapacityFamily, row: SimpleTypeRow | null, lang: Lang = "en-US"): SimpleFormState {
  return {
    label: row?.name ?? "",
    capacity: textFormat(row?.capacity, family === "storage" ? "#0.00" : "#0.0", lang),
    energyCapacity: family === "storage" ? textFormat(row?.energyCapacity, "#0.00", lang) : "",
    supplier: row?.supplier ?? "",
    dirty: new Set<string>(),
  };
}
