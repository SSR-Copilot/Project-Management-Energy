/**
 * Project Generators Screen - the screen captions of the cards, panels and dialogs.
 *
 * Split out of `rules.ts` by job (D159, audit finding 7). `rules.ts` re-exports this file, so every import of `@/features/pm/generators/rules` is unchanged.
 */
import { CHOICE_PLANT } from "@/data/dataverseNames";
import { isBlank } from "@/domain/powerFxNumeric";
import { type CommandItemState, GENERATOR_COMMAND_KEYS, type GeneratorCommandKey, type GeneratorsProject } from "./rulesCore";

/* ═════════════════════════════════ screen captions — cards, panels, dialogs ════ */
/*
 * Canvas strings the screen renders that were not transcribed above. Every entry cites the
 * `Control.Property` it came from in `Src/Project Generators Screen.pa.yaml`; none is
 * reworded (CONVENTIONS rule 7), trailing spaces and the canvas' own inconsistencies included.
 */

/** `pcf_Generators_DisplayProject_Body_Form_CommandBar.AccessibilityLabel` — verbatim. */
export const COMMAND_BAR_LABEL = "pcf_Generators_DisplayProject_Body_Form_CommandBar";

/**
 * `con_Generators_DisplayProject_Body_Form_FirstColumn.Visible` —
 * `!IsBlank(gblRecordSelectedProject.'End Date')`: the seven galleries show only once the
 * project has an end date.
 */
export const isBodyVisible = (project: Pick<GeneratorsProject, "endDate"> | null): boolean =>
  project !== null && !isBlank(project.endDate);

/**
 * The command bar's `ItemIconName`, per row of its `Items` table:
 *  - `"Add"` / `"Edit"` by selection for the two PV/inverter/substructure add-or-edit rows;
 *  - BESS / Hydrogen / Substation carry `If(Not(IsBlank(<selection>)), "Edit")` — no icon at
 *    all while nothing is selected;
 *  - every delete row `"Delete"`, `addWTGType` / `addOthers` `"Add"`;
 *  - Activate / Deactivate use `"ActivateOrders"` / `"DeactivateOrders"` (canvas `ItemIconName`);
 *  - the 1.21.753 Replace rows show the sync arrows of the live screen (`"Refresh"`, PO
 *    screenshot 20 Oct 2026). These three had no icon here before.
 */
export function generatorCommandIcon(
  key: GeneratorCommandKey,
  state: Pick<CommandItemState, "label">,
): "Add" | "Edit" | "Delete" | "Refresh" | "ActivateOrders" | "DeactivateOrders" | null {
  if (key.startsWith("delete")) return "Delete";
  if (key === "replaceGeneratorType" || key === "replacePVModuleType") return "Refresh";
  if (key === "activateGenerator") return "ActivateOrders";
  if (key === "deactivateGenerator") return "DeactivateOrders";
  if (key === "addWTGType" || key === "addOthers") return "Add";
  if (key === "addPVType" || key === "addInverterType" || key === "addSubstructureType") {
    return state.label.startsWith("Edit") ? "Edit" : "Add";
  }
  if (key === "addStorage" || key === "addHydrogen" || key === "addSubstation") {
    return state.label.startsWith("Edit") ? "Edit" : null;
  }
  return null;
}

/**
 * The bar's rendering order: `Items` source order, except that BESS / Hydrogen / Substation
 * follow "Add Others" while their `ItemParentKey` is `"addOthers"` — i.e. while nothing of
 * that family is selected (`ItemParentKey: If(IsBlank(<selection>), "addOthers")`).
 */
export function commandBarOrder(selected: {
  storage: boolean; hydrogen: boolean; substation: boolean;
}): GeneratorCommandKey[] {
  const nested = new Set<GeneratorCommandKey>();
  if (!selected.storage) nested.add("addStorage");
  if (!selected.hydrogen) nested.add("addHydrogen");
  if (!selected.substation) nested.add("addSubstation");
  const out: GeneratorCommandKey[] = [];
  for (const key of GENERATOR_COMMAND_KEYS) {
    if (nested.has(key)) continue;
    out.push(key);
    if (key === "addOthers") out.push(...GENERATOR_COMMAND_KEYS.filter((k) => nested.has(k)));
  }
  return out;
}

/**
 * PowerCAT `ItemParentKey` — the command a command sits UNDER, or `undefined` for top level.
 *
 * Canvas (`pcf_Generators_DisplayProject_Body_Form_CommandBar.Items`): Add BESS / Hydrogen /
 * Substation carry `ItemParentKey: If(IsBlank(locSelected<Family>TypeEntity), "addOthers")`, so
 * they are entries of the "Add Others" drop-down until a row of that family is selected, then
 * stand at top level beside their Delete.
 *
 * DIVERGENCE (PO G9, 20 Oct 2026): Add Inverter / Add Substructure are `ItemVisible: false` in
 * the canvas; the product owner asked for their panels, so they are exposed — inside "Add
 * Others", which keeps the top-level bar exactly the canvas one.
 */
export function commandParentKey(
  key: GeneratorCommandKey,
  selected: { storage: boolean; hydrogen: boolean; substation: boolean },
): GeneratorCommandKey | undefined {
  switch (key) {
    case "addStorage": return selected.storage ? undefined : "addOthers";
    case "addHydrogen": return selected.hydrogen ? undefined : "addOthers";
    case "addSubstation": return selected.substation ? undefined : "addOthers";
    case "addInverterType": case "addSubstructureType": return "addOthers";
    default: return undefined;
  }
}

/**
 * `If(Not(IsBlank(gblRecordSelectedProjectCountry.'ISO Currency Code')), <code>, "EUR")` — the
 * currency every `[…]` cost caption on this screen interpolates.
 */
export const isoOrEur = (isoCurrencyCode: string | null | undefined): string =>
  isBlank(isoCurrencyCode) ? "EUR" : String(isoCurrencyCode);

/** INTERPOLATED — `$"<base> [{isoOrEur}]"`, the shape of every currency caption here. */
export const currencyCaption = (base: string, isoCurrencyCode: string | null | undefined): string =>
  `${base} [${isoOrEur(isoCurrencyCode)}]`;

/** The WTG type card (`gal_Generators_DisplayProject_Body_Form_GeneratorTypes`). */
export const WTG_CARD_LABELS = {
  /** `pcf_Generators_DisplayProject_Body_Form_GeneratorType_CardDetails_CommandBar.Items.ItemDisplayName` — verbatim. */
  addGenerator: "Add Generator",
  /** `pcf_Generators_DisplayProject_Body_Form_GeneratorType_CardDetails_CommandBar.Tooltip` — verbatim. */
  addGeneratorBarLabel: "Generator type Menu",
  /** `lbl_GeneralData_DisplayProject_Body_Checklist.Text` (inside the WTG card) — verbatim. */
  addGeneratorWarning: "Generators can only be added to an active generator type",
  /** `lbl_Generator_GeneratorHeightLimitationTag.Text` — verbatim. */
  heightLimitationTag: "Height Limitation",
  /** `…_GeneratorsList.columns_Items` — the first column's `ColDisplayName: ""`, verbatim. */
  turbineNameColumn: "",
  /**
   * NEW (PO, 20 Oct 2026): the canvas leaves the turbine grid's name column and its edit /
   * delete columns without a header; the product owner asked for these two captions. The canvas
   * blank is kept above as `turbineNameColumn`.
   */
  generatorNameHeader: "Generator Name",
  /** NEW (PO, 20 Oct 2026) — the header over the edit and delete icon columns. */
  actionsHeader: "Actions",
  /** `pcf_Generators_DisplayProject_Body_Form_GeneratorType_CardDetails_GeneratorsList.Tooltip` — verbatim. */
  turbineGrid: "Generators list",
  /** `…_GeneratorsList.columns_Items` — the edit column's `ColName` (it has no `ColDisplayName`). */
  editIconColumn: "EditIcon",
  /** `…_GeneratorsList.columns_Items` — the delete column's `ColName` (it has no `ColDisplayName`). */
  deleteIconColumn: "DeleteIcon",
  /** `…_GeneratorsList.columns_Items` — the over-height-limit info column's `ColName`, after Delete (`Y:2382`). */
  infoIconColumn: "InformationIcon",
} as const;

/**
 * `lbl_…_GeneratorsList_TotalRows.Text` — `If(TotalRows > 1, $"Generators: {TotalRows}", "")`.
 * INTERPOLATED.
 */
export const generatorsTotalRowsText = (totalRows: number): string =>
  totalRows > 1 ? `Generators: ${totalRows}` : "";

/**
 * `lbl_…_GeneratorsList_Pagination.Text` — `If(Pages > 1, "Page: " & Page & " from " & Pages, "")`.
 * INTERPOLATED.
 */
export const paginationText = (page: number, pages: number): string =>
  pages > 1 ? `Page: ${page} from ${pages}` : "";

/** The inverter card (`gal_Generators_DisplayProject_Body_Form_Invertors`). */
export const INVERTER_CARD_LABELS = {
  /** `lbl_Generators_DisplayProject_Body_Form_Inverters_CardDetails_InverterType.Text` — verbatim. */
  inverterType: "Inverter Type",
  /** `lbl_Generators_DisplayProject_Body_Form_Inverters_CardDetails_Supplier.Text` — verbatim. */
  supplier: "Supplier",
  /** `lbl_…_Inverters_CardDetails_CostPerInverter.Text` — the base of `$"Cost per Inverter [{iso}]"`. */
  costPerInverter: "Cost per Inverter",
  /** `lbl_Generators_DisplayProject_Body_Form_Inverters_CardDetails_NumberOfInverters.Text` — verbatim. */
  numberOfInverters: "Number of Inverters",
  /** `lbl_…_Inverters_CardDetails_CostPerInverter_1.Text` — the base of `$"Total Inverter Type Cost [{iso}]"`. */
  totalInverterTypeCost: "Total Inverter Type Cost",
  /** `lbl_Generators_DisplayProject_Body_Form_Inverters_CardDetails_NominalPower.Text` — verbatim. */
  nominalPower: "Nominal Power [kW]",
  /** `lbl_Generators_DisplayProject_Body_Form_Inverters_CardDetails_Warranty.Text` — verbatim. */
  warranty: "Warranty [y]",
} as const;

/** The substructure card (`gal_Generators_DisplayProject_Body_Form_Substructure`). */
export const SUBSTRUCTURE_CARD_LABELS = {
  /** `lbl_Generators_DisplayProject_Body_Form_Substructure_CardDetails_Supplier.Text` — verbatim. */
  supplier: "Supplier",
  /** `lbl_Generators_DisplayProject_Body_Form_Substructure_CardDetails_SubstructureType.Text` — verbatim. */
  substructureType: "Substructure Type",
  /** `lbl_…_Substructure_CardDetails_SubstructureCost.Text` — the base of `$"Substructure Cost [{iso}]"`. */
  substructureCost: "Substructure Cost",
} as const;

/** The BESS card (`gal_Generators_DisplayProject_Body_Form_Storage_1`). */
export const STORAGE_CARD_LABELS = {
  /** `lbl_Generators_DisplayProject_Body_Form_Storage_CardDetails_StorageCapacity_2.Text` — verbatim. */
  powerCapacity: "Power Capacity [MW]",
  /** `lbl_Generators_DisplayProject_Body_Form_Storage_CardDetails_StorageCapacity_3.Text` — verbatim. */
  energyCapacity: "Energy Capacity [MWh]",
  /** `lbl_Generators_DisplayProject_Body_Form_Storage_CardDetails_StorageSupplier.Text` — verbatim. */
  supplier: "Supplier",
} as const;

/** The hydrogen card (`gal_Generators_DisplayProject_Body_Form_Hydrogen`). */
export const HYDROGEN_CARD_LABELS = {
  /** `lbl_Generators_DisplayProject_Body_Form_Storage_CardDetails_HydrogenCapacity.Text` — verbatim. */
  capacity: "Hydrogen Capacity [MW]",
  /** `lbl_Generators_DisplayProject_Body_Form_Storage_CardDetails_StorageSupplier_1.Text` — verbatim. */
  supplier: "Supplier",
} as const;

/** The substation card (`gal_Generators_DisplayProject_Body_Form_Substation_2`). */
export const SUBSTATION_CARD_LABELS = {
  /** `lbl_Generators_DisplayProject_Body_Form_Storage_CardDetails_SubstationCapacity_1.Text` — verbatim. */
  capacity: "Substation Capacity [MW]",
  /** `lbl_Generators_DisplayProject_Body_Form_Storage_CardDetails_StorageSupplier_2.Text` — verbatim. */
  supplier: "Supplier",
} as const;

/** The panel footer captions shared by every right panel. */
export const PANEL_BUTTONS = {
  /** `pcf_btn_GeneratorData_RightPanel_Form_Generator_Buttons_Save.Text` — verbatim. */
  save: "Save",
  /** `pcf_btn_GeneratorData_RightPanel_Form_Generator_Buttons_Cancel.Text` — verbatim. */
  cancel: "Cancel",
  /** `btn_GeneratorData_RightPanel_Form_Generator_Buttons_Reset.Text` — verbatim. */
  reset: "Reset",
  /** `pcf_btn_GeneratorData_RightPanel_Form_Buttons_Save.Text` — the out-of-country arm, verbatim. */
  requestPermission: "Request permission",
} as const;

/** The Add Generator Type panel (`con_GeneratorData_RightPanel_Form` … `_FormHeader`). */
export const TYPE_PANEL_LABELS = {
  /** `lbl_GeneratorData_RightPanel_FormHeader_FormHeader.Text` — verbatim. */
  title: "Add Generator Type",
  /** `ComboBox@0.0.51` with no `InputTextPlaceholder`: the control's own "Find items". */
  findItems: "Find items",
  /** `lbl_btn_GeneratorData_RightPanel_Form_Filter_Country_Text.Text` — verbatim. */
  countryFilter:
    "Show generator types which are available in my country and latest possible order date is valid",
  /** `lbl_GeneratorData_RightPanel_Form_Fields_TypeSelector.Text` — verbatim. */
  supplier: "Supplier",
  /** `lbl_GeneratorData_RightPanel_Form_Fields_TypeSelector_1.Text` — verbatim. */
  turbineType: "Turbine Type",
  /** `lbl_GeneratorData_RightPanel_Form_Fields_TypeSelector_2.Text` — verbatim. */
  hubHeight: "Hub Height [m]",
  /** `lbl_GeneratorData_RightPanel_Form_Fields_TypeSelector_3.Text` — verbatim. */
  revisedHubHeight: "Revised Hub Height [m]",
  /** `lbl_GeneratorData_RightPanel_Form_Fields_NumberOfGenerator.Text` — verbatim. */
  numberOfGenerators: "Number of Generators",
} as const;

/**
 * `lbl_GeneratorData_RightPanel_Form_Filter_Message.Text` — INTERPOLATED:
 * `If(<toggle>.Checked, $"Generators available for {Country.Name}", $"Generators not available for {Country.Name}")`.
 */
export const typeFilterMessage = (inCountry: boolean, countryName: string | null | undefined): string =>
  inCountry
    ? `Generators available for ${countryName ?? ""}`
    : `Generators not available for ${countryName ?? ""}`;

/**
 * `pcf_btn_GeneratorData_RightPanel_Form_Buttons_Save.Text` —
 * `If(Or(IsBlank(cmb_Supplier.Selected), <toggle>.Checked), "Save", "Request permission")`.
 */
export const typeSaveLabel = (supplier: string | null | undefined, inCountry: boolean): string =>
  isBlank(supplier) || inCountry ? PANEL_BUTTONS.save : PANEL_BUTTONS.requestPermission;

/** The Add/Edit Generator panel (`…_Form_Generator`) — one turbine. */
export const TURBINE_PANEL_LABELS = {
  /** `lbl_GeneratorData_RightPanel_Form_Fields_GeneratorType.Text` — verbatim. */
  generatorType: "Generator Type",
  /** `lbl_GeneratorData_RightPanel_Form_Fields_GeneratorName.Text` — `$"Generator Name"`, verbatim. */
  generatorName: "Generator Name",
  /** `lbl_GeneratorData_RightPanel_Form_Fields_Effective_Capacity.Text` — verbatim. */
  effectiveCapacity: "Effective Generator Capacity [MW]",
  /** `chk_GeneratorData_RightPanel_Form_Fields_Effective_Capacity_All.Label` — verbatim. */
  applyAllCapacities: "Apply to all WTG capacities",
  /** `lbl_GeneratorData_RightPanel_Form_Fields_Effective_HubHeight_1.Text` — `$"Foundation Plinth [m]"`, verbatim. */
  foundationPlinth: "Foundation Plinth [m]",
  /** `chk_GeneratorData_RightPanel_Form_Fields_Foundation_Plinth_All.Label` — verbatim. */
  applyAllWtgs: "Apply to all WTGs",
  /**
   * `lbl_GeneratorData_RightPanel_Form_Fields_Effective_HubHeight.Text` — the live arm,
   * verbatim (`//$"Effective Hub Height  [m]"` is commented out beside it).
   */
  hubHeightExclPlinth: "Hub Height excl. Foundation Plinth [m]",
  /** `lbl_GeneratorData_RightPanel_Form_Fields_Effective_HubHeight_2.Text` — verbatim. */
  totalHeight: "Total Height [m]",
  /** `lbl_GeneratorData_RightPanel_Form_Fields_Effective_Capacity_All_WarningMessage.Text` (and its two siblings) — verbatim. */
  applyAllWarning: "Are you sure you want to apply this change to all turbines of the selected WTG type?",
} as const;

/**
 * `lbl_GeneratorData_RightPanel_Form_Generator_FormHeader.Text` — INTERPOLATED:
 * `If(IsBlank(<turbine>.Name), "Add Generator", $"Edit Generator ""{<turbine>.Name}""")`.
 */
export const turbinePanelTitle = (name: string | null | undefined): string =>
  isBlank(name) ? "Add Generator" : `Edit Generator "${name}"`;

/** `locGeneratorNamePrefix` — `$"WTG {gblRecordSelectedProject.'Short Name'}_"`. INTERPOLATED. */
export const turbineNamePrefix = (shortName: string | null | undefined): string =>
  `WTG ${shortName ?? ""}_`;

/** `lbl_GeneratorData_RightPanel_Form_PvModuleType_Fields_OtherSupplier.Text` — verbatim. */
export const PV_OTHER_SUPPLIER_LABEL = "Other Supplier";

/** The Add/Edit Inverter panel (`…_Form_Inverter`). */
export const INVERTER_PANEL_LABELS = {
  /** `lbl_GeneratorData_RightPanel_Form_Fields_Inverter_Fields_Label.Text` — verbatim. */
  label: "Inverter Label",
  /** `lbl_GeneratorData_RightPanel_Form_Inverter_Fields_Supplier.Text` — verbatim. */
  supplier: "Supplier",
  /** `lbl_GeneratorData_RightPanel_Form_Fields_Inverter_OtherSupplier_Label.Text` — verbatim, trailing space kept. */
  otherSupplier: "Other Supplier ",
  /** `lbl_GeneratorData_RightPanel_Form_Inverter_Fields_InverterType.Text` — verbatim. */
  inverterType: "Inverter Type",
  /** `lbl_GeneratorData_RightPanel_Form_Fields_Inverter_Fields_Warranty.Text` — verbatim. */
  warranty: "Warranty [y]",
  /** `lbl_GeneratorData_RightPanel_Form_Fields_Inverter_Fields_NumberOfInverters.Text` — verbatim. */
  numberOfInverters: "Number of Inverters",
  /** `lbl_GeneratorData_RightPanel_Form_Inverter_Fields_NominalPower.Text` — verbatim. */
  nominalPower: "Nominal Power [kW]",
} as const;

/** `lbl_GeneratorData_RightPanel_Form_Inverter_Title.Text` — `If(IsBlank(<entity>.Inverter), "Add Inverter", "Edit Inverter")`. */
export const inverterPanelTitle = (editing: boolean): string => (editing ? "Edit Inverter" : "Add Inverter");

/** The Add/Edit Substructure panel (`…_Form_Substructure`). */
export const SUBSTRUCTURE_PANEL_LABELS = {
  /** `lbl_GeneratorData_RightPanel_Form_Substructure_Fields_Label.Text` — verbatim. */
  label: "Substructure Label",
  /** `lbl_GeneratorData_RightPanel_Form_Substructure_Fields_Supplier.Text` — verbatim. */
  supplier: "Supplier",
  /** `lbl_GeneratorData_RightPanel_Form_Fields_Substructure_OtherSupplier_Label.Text` — verbatim, trailing space kept. */
  otherSupplier: "Other Supplier ",
  /** `lbl_GeneratorData_RightPanel_Form_Substructure_Fields_SubstructureType.Text` — verbatim. */
  substructureType: "Substructure Type",
} as const;

/** `lbl_GeneratorData_RightPanel_Form_Substructure_Title.Text` — `If(IsBlank(<entity>.Substructure), "Add Substructure", "Edit Substructure")`. */
export const substructurePanelTitle = (editing: boolean): string =>
  editing ? "Edit Substructure" : "Add Substructure";

/** The Add BESS panel (`…_Form_Storage`). */
export const STORAGE_PANEL_LABELS = {
  /** `lbl_GeneratorData_RightPanel_Form_Storage_Header_Title_2.Text` — verbatim (no Edit arm in the canvas). */
  title: "Add BESS",
  /** `lbl_GeneratorData_RightPanel_Form_Fields_Storage_Fields_StorageLabel.Text` — verbatim. */
  label: "BESS label",
  /** `lbl_GeneratorData_RightPanel_Form_Fields_Storage_Fields_StorageCapacityMW_5.Text` — verbatim. */
  powerCapacity: "Power Capacity [MW]",
  /** `lbl_GeneratorData_RightPanel_Form_Fields_Storage_Fields_StorageCapacityMW_6.Text` — verbatim. */
  energyCapacity: "Energy Capacity [MWh]",
  /** `lbl_GeneratorData_RightPanel_Form_Fields_Storage_Fields_StorageSupplier.Text` — verbatim. */
  supplier: "Supplier",
  /** `lbl_GeneratorData_RightPanel_Form_Fields_Storage_Fields_StorageType.Text` — verbatim. */
  type: "BESS Type",
} as const;

/** The Add Hydrogen panel (`…_Form_Hydrogen`). */
export const HYDROGEN_PANEL_LABELS = {
  /** `lbl_GeneratorData_RightPanel_Form_Hydrogen_Header_Title_2.Text` — `$"Add Hydrogen"`, verbatim. */
  title: "Add Hydrogen",
  /** `lbl_GeneratorData_RightPanel_Form_Fields_Hydrogen_Fields_HydrogenLabel.Text` — verbatim. */
  label: "Hydrogen label",
  /** `lbl_GeneratorData_RightPanel_Form_Fields_Hydrogen_Fields_HydrogenCapacityMW_2.Text` — verbatim. */
  capacity: "Hydrogen Capacity [MW]",
  /** `lbl_GeneratorData_RightPanel_Form_Fields_Hydrogen_Fields_HydrogenSupplier.Text` — verbatim. */
  supplier: "Supplier",
  /** `lbl_GeneratorData_RightPanel_Form_Fields_Hydrogen_Fields_HydrogenType.Text` — verbatim. */
  type: "Hydrogen Type",
} as const;

/** The Add Substation panel (`…_Form_Substation`). */
export const SUBSTATION_PANEL_LABELS = {
  /** `lbl_GeneratorData_RightPanel_Form_Substation_Header_Title_2.Text` — `$"Add Substation"`, verbatim. */
  title: "Add Substation",
  /** `lbl_GeneratorData_RightPanel_Form_Fields_Substation_Fields_SubstationLabel.Text` — verbatim. */
  label: "Substation label",
  /** `lbl_GeneratorData_RightPanel_Form_Fields_Substation_Fields_SubstationCapacityMW_2.Text` — verbatim. */
  capacity: "Substation Capacity [MW]",
  /** `lbl_GeneratorData_RightPanel_Form_Fields_Substation_Fields_SubstationSupplier.Text` — verbatim. */
  supplier: "Supplier",
  /** `lbl_GeneratorData_RightPanel_Form_Fields_Substation_Fields_SubstationType.Text` — verbatim. */
  type: "Substation Type",
} as const;

/** The confirmation popups' constant captions. */
export const DIALOG_LABELS = {
  /** `cmp_GeneratorData_PopUp_ConfirmationDelete*.ConfirmButtonText` — verbatim. */
  delete: "Delete",
  /** `cmp_GeneratorData_PopUp_*.CancelButtonText` — verbatim. */
  cancel: "Cancel",
  /** The height-limitation popups' `ConfirmButtonText` — verbatim. */
  yes: "Yes",
  /** `btn_PopUp_Common_Generators_PreventTotalCapacity_Information_Close.Text` — verbatim. */
  close: "Close",
  /** The three height-limitation popups' `Title` — verbatim. */
  heightExceededTitle: "Height Limitation Exceeded",
  /** `cmp_GeneratorData_PopUp_ConfirmationDeleteGeneratorType.Title` — verbatim. */
  deleteGeneratorType: "Delete Generator Type?",
  /** `…_ConfirmationDeleteGeneratorInProject.Title` — verbatim. */
  deleteGenerator: "Delete Generator?",
  /** `cmp_GeneratorData_PopUp_ConfirmationDeletePVModuleType.Title` — verbatim (sic, no space). */
  deletePvModuleType: "Delete PVModule Type?",
  /** `cmp_GeneratorData_PopUp_ConfirmationDeleteInverterType.Title` — verbatim. */
  deleteInverterType: "Delete Inverter Type?",
  /** `cmp_GeneratorData_PopUp_ConfirmationDeleteSubstructureType.Title` — verbatim. */
  deleteSubstructureType: "Delete Substructure Type?",
  /** `…_ConfirmationDeleteStorageInProject.Title` — verbatim. */
  deleteBess: "Delete BESS?",
  /** `…_ConfirmationDeleteHydrogenInProject.Title` — verbatim. */
  deleteHydrogen: "Delete Hydrogen?",
  /** `…_ConfirmationDeleteSubstationInProject.Title` — verbatim. */
  deleteSubstation: "Delete Substation?",
} as const;

/** The `Description` of each confirmation popup. INTERPOLATED, each from its `Description` formula. */
export const DIALOG_TEXT = {
  deleteGeneratorType: (turbineType: string | null | undefined): string =>
    `Are you sure to delete the WTG type: ${turbineType ?? ""}? All related cost in O&M and Land Lease will be removed.`,
  deleteGenerator: (name: string | null | undefined): string =>
    `Are you sure to delete selected generator: "${name ?? ""}"? All possibly allocated Land Lease cost will be removed.`,
  deletePvModuleType: (label: string | null | undefined): string =>
    `Are you sure that you want to delete selected PV Module type "${label ?? ""}"? All related cost in O&M and Land Lease will be removed`,
  deleteInverterType: (label: string | null | undefined): string =>
    `Are you sure that you want to delete selected inverter type ${label ?? ""}?`,
  deleteSubstructureType: (label: string | null | undefined): string =>
    `Are you sure that you want to delete substructure type ${label ?? ""}?`,
  deleteBess: (name: string | null | undefined): string =>
    `Are you sure to delete selected BESS Type: "${name ?? ""}"? `,
  deleteHydrogen: (name: string | null | undefined): string =>
    `Are you sure to delete selected Hydrogen Type: "${name ?? ""}"? `,
  deleteSubstation: (name: string | null | undefined): string =>
    `Are you sure to delete selected Substation Type: "${name ?? ""}"? `,
  changeStatus: (turbineType: string | null | undefined): string =>
    `Are you sure to change status of the WTG type: ${turbineType ?? ""}?`,
  heightExceeded: (name: string | null | undefined): string =>
    `The total height of Generator Type "${name ?? ""}" is exceeding the height limitation. Are you sure you want to continue?`,
} as const;

/**
 * `cmp_GeneratorData_PopUp_ChangeStatusOfGenerator.Title` / `.ConfirmButtonText` —
 * `If(<type>.Status = 0, "Deactivate WTG?", "Activate WTG?")` and `"Deactivate"` / `"Activate"`.
 */
export const changeStatusDialog = (status: number): { title: string; confirm: string } =>
  status === CHOICE_PLANT.status.active
    ? { title: "Deactivate WTG?", confirm: "Deactivate" }
    : { title: "Activate WTG?", confirm: "Activate" };
