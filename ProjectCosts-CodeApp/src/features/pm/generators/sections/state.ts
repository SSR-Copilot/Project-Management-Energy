/**
 * Project Generators Screen — the state shapes and the static tables the screen and its parts share (D143).
 * Moved verbatim from `Screen.tsx` (panel / dialog unions, the empty forms, the control-name tables); nothing here is new.
 */
import { CHOICE_PLANT } from "@/data/dataverseNames";
import {
  HYDROGEN_PANEL_LABELS, STORAGE_PANEL_LABELS, SUBSTATION_PANEL_LABELS, WRITE_ERROR, WRITE_MSG, forLanguage,
  type CapacityGuardReason, type GeneratorTypeRow, type PlantFamily, type PvTypeFormState, type ReplaceWtgForm,
  type SimpleCapacityFamily, type SimpleTypeRow, type TurbineRow, type TypeFormState,
} from "../rules";

/* ─────────────────────────────────────────────────────────────── state shapes */

export type Panel =
  | { kind: "type" }
  | { kind: "turbine"; typeId: string; turbineId: string | null }
  | { kind: "pv" }
  | { kind: SimpleCapacityFamily }
  | { kind: "inverter" }
  | { kind: "substructure" }
  | { kind: "replaceWtg" }
  | { kind: "replacePv" }
  | null;

export type DialogState =
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

export const emptyReplaceWtg = (inCountry = true): ReplaceWtgForm => ({
  supplier: null, turbineType: null, hubHeight: null, revisedHubHeight: "", inCountry,
});

export const emptyTypeForm = (): TypeFormState => ({
  supplier: null, turbineType: null, hubHeight: null, revisedHubHeight: "",
  numberOfGenerators: "", cost: "", dirty: new Set<string>(),
});

export const emptyPvForm = (): PvTypeFormState => ({
  moduleLabel: "", capacity: "", supplier: null, otherSupplier: "",
  degradation1stYear: "", degradationRemainingYears: "", dirty: new Set<string>(),
});

/** `If(Int(x) = x, Text(x, "#"), Text(x, "0.0#"))` — the PV panel's prefill (Y:7450, Y:7777). */
export const pvPrefill = (v: number | null, lang?: string): string =>
  v === null ? "" : forLanguage(Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100), lang);

/** The card fold icons (`ico_…_Up` while expanded, `ico_…_Down` while collapsed), per family. */
export const FOLD_ICON: Record<PlantFamily, { up: string; down: string }> = {
  wtg: { up: "ico_Generators_DisplayProject_Body_Form_GeneratorType_Up", down: "ico_Generators_DisplayProject_Body_Form_GeneratorType_Down" },
  pv: { up: "ico_Generators_DisplayProject_Body_Form_PvModule_Up", down: "ico_Generators_DisplayProject_Body_Form_PvModule_Down" },
  inverter: { up: "ico_Generators_DisplayProject_Body_Form_Invertors_Up", down: "ico_Generators_DisplayProject_Body_Form_Invertors_Down" },
  substructure: { up: "ico_Generators_DisplayProject_Body_Form_Substructure_Up", down: "ico_Generators_DisplayProject_Body_Form_Substructure_Down" },
  storage: { up: "ico_Generators_DisplayProject_Body_Form_Storage_Up_1", down: "ico_Generators_DisplayProject_Body_Form_Storage_Down_1" },
  hydrogen: { up: "ico_Generators_DisplayProject_Body_Form_Hydrogen_Up", down: "ico_Generators_DisplayProject_Body_Form_Hydrogen_Down" },
  substation: { up: "ico_Generators_DisplayProject_Body_Form_Substation_Up_1", down: "ico_Generators_DisplayProject_Body_Form_Substation_Down_1" },
};

/** Each card's selection dot (`img_…_CardHeader_RowSelectionDot`), whose `AccessibleLabel` is its name. */
export const SELECT_DOT: Record<PlantFamily, string> = {
  wtg: "img_Generators_DisplayProject_Body_Form_GeneratorType_CardHeader_RowSelectionDot",
  pv: "img_Generators_DisplayProject_Body_Form_PvModule_CardHeader_RowSelectionDot",
  inverter: "img_Generators_DisplayProject_Body_Form_Invertors_CardHeader_RowSelectionDot",
  substructure: "img_Generators_DisplayProject_Body_Form_Substructure_CardHeader_RowSelectionDot",
  storage: "img_Generators_DisplayProject_Body_Form_Storage_CardHeader_RowSelectionDot_1",
  hydrogen: "img_Generators_DisplayProject_Body_Form_Hydrogen_CardHeader_RowSelectionDot",
  substation: "img_Generators_DisplayProject_Body_Form_Substation_CardHeader_RowSelectionDot_1",
};

/** The cards' permission-request Cancel buttons (`pcf_btn_GeneralData_DisplayProject_Body_Buttons_…`). */
export const CANCEL_BUTTON: Partial<Record<PlantFamily, string>> = {
  wtg: "pcf_btn_GeneralData_DisplayProject_Body_Buttons_Reset_1",
  pv: "pcf_btn_GeneralData_DisplayProject_Body_Buttons_PVModule_Reset",
  inverter: "pcf_btn_GeneralData_DisplayProject_Body_Buttons_Inverter_Reset",
  substructure: "pcf_btn_GeneralData_DisplayProject_Body_Buttons_Substructure_Reset",
};

/** The BESS / Hydrogen / Substation panels: title, field control names, Save / Cancel. */
export const SIMPLE_PANEL: Record<SimpleCapacityFamily, {
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

export const isActive = (status: number) => status === CHOICE_PLANT.status.active;

/** The id of the selected row when the screen-wide selection is in `family`, else null (what a family section is given). */
export const selectedIdOf = (selection: { family: PlantFamily; id: string } | null, family: PlantFamily): string | null =>
  selection?.family === family ? selection.id : null;
