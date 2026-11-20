/**
 * Project Generators Screen — the Add / Edit PV Module Type panel (D143: split out of `Screen.tsx` and loaded on first use with `React.lazy`).
 * The JSX is the screen's former inline panel, unchanged; the form state, the derived values and the save handler stay in the
 * screen and arrive as props, so the write path is the one it was.
 */
import { memo } from "react";
import { FormPanel } from "@/components";
import {
  PANEL_BUTTONS, PV_CAPACITY_MAX_LENGTH, PV_DEGRADATION_MAX_LENGTH, PV_FIELD_LABELS, PV_MODULE_LABEL_MAX_LENGTH,
  PV_OTHER_SUPPLIER_LABEL, PV_PANEL_TITLES, PV_SUPPLIER_PLACEHOLDER, type PvModuleOption, type PvTypeFormErrors, type PvTypeFormState,
} from "../../rules";
import { InputField, PanelFooter, SelectField } from "../controls";
import { useStyles } from "../styles";

export interface PvPanelProps {
  open: boolean;
  /** The PV type being edited (the panel title says Edit), or false for Add. */
  editing: boolean;
  form: PvTypeFormState;
  errors: PvTypeFormErrors;
  /** `pvSupplierOptions(catalogue)`. */
  options: readonly PvModuleOption[];
  /** The chosen supplier is the "Other" module (its free-text field shows). */
  otherChosen: boolean;
  saveable: boolean;
  settling: boolean;
  onTouch: <K extends keyof PvTypeFormState>(field: K, value: PvTypeFormState[K]) => void;
  onSave: () => void;
  onClose: () => void;
}

function PvPanelView({ open, editing, form, errors, options, otherChosen, saveable, settling, onTouch, onSave, onClose }: PvPanelProps) {
  const s = useStyles();
  return (
    <FormPanel
      open={open} title={editing ? PV_PANEL_TITLES.edit : PV_PANEL_TITLES.add}
      width="narrow" onDismiss={onClose}
      footer={
        <PanelFooter
          primary={PANEL_BUTTONS.save}
          primaryName="pcf_btn_GeneratorData_RightPanel_Form_PvModuleType_Buttons_Save"
          cancelName="pcf_btn_GeneratorData_RightPanel_Form_PvModuleType_Buttons_Cancel"
          disabled={!saveable || settling} onCancel={onClose} onPrimary={onSave}
        />
      }
    >
      <div className={s.panelBody}>
        <InputField
          label={PV_FIELD_LABELS.moduleLabel} name="txt_GeneratorData_RightPanel_Form_PvModuleType_Fields_Label"
          ariaLabel="txt_GeneratorData_RightPanel_Form_PvModuleType_Fields_Label"
          required maxLength={PV_MODULE_LABEL_MAX_LENGTH} value={form.moduleLabel}
          error={errors.moduleLabel} onChange={(v) => onTouch("moduleLabel", v)}
        />
        <InputField
          label={PV_FIELD_LABELS.capacity} name="txt_GeneratorData_RightPanel_Form_PvModuleType_Fields_PVCapacityMW"
          ariaLabel="txt_GeneratorData_RightPanel_Form_PvModuleType_Fields_PVCapacityMW"
          required maxLength={PV_CAPACITY_MAX_LENGTH} value={form.capacity}
          error={errors.capacity} onChange={(v) => onTouch("capacity", v)}
        />
        <SelectField
          label={PV_FIELD_LABELS.supplier} name="cmb_GeneratorData_RightPanel_Form_PvModuleType_Fields_Supplier"
          ariaLabel="cmb_GeneratorData_RightPanel_Form_PvModuleType_Fields_Supplier"
          required placeholder={PV_SUPPLIER_PLACEHOLDER}
          value={form.supplier}
          options={options.map((o) => ({ value: o.id, label: o.displayName ?? "" }))}
          onChange={(v) => onTouch("supplier", v)}
        />
        {otherChosen ? (
          <InputField
            label={PV_OTHER_SUPPLIER_LABEL} name="txt_GeneratorData_RightPanel_Form_PvModuleType_Fields_OtherSupplier"
            required maxLength={PV_MODULE_LABEL_MAX_LENGTH} value={form.otherSupplier ?? ""}
            error={errors.otherSupplier} onChange={(v) => onTouch("otherSupplier", v)}
          />
        ) : null}
        <InputField
          label={PV_FIELD_LABELS.degradation1stYear} name="txt_GeneratorData_RightPanel_Form_PvModuleType_Fields_DegradationFirstYear"
          ariaLabel="txt_GeneratorData_RightPanel_Form_PvModuleType_Fields_DegradationFirstYear"
          maxLength={PV_DEGRADATION_MAX_LENGTH} value={form.degradation1stYear}
          error={errors.degradation1stYear} onChange={(v) => onTouch("degradation1stYear", v)}
        />
        <InputField
          label={PV_FIELD_LABELS.degradationRemainingYears} name="txt_GeneratorData_RightPanel_Form_PvModuleType_Fields_DegradationRemainingYears"
          ariaLabel="txt_GeneratorData_RightPanel_Form_PvModuleType_Fields_DegradationRemainingYears"
          maxLength={PV_DEGRADATION_MAX_LENGTH} value={form.degradationRemainingYears}
          error={errors.degradationRemainingYears} onChange={(v) => onTouch("degradationRemainingYears", v)}
        />
      </div>
    </FormPanel>
  );
}

export default memo(PvPanelView);
