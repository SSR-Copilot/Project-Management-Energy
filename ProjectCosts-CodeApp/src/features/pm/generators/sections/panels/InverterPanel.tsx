/**
 * Project Generators Screen — the Add / Edit Inverter panel (D143: split out of `Screen.tsx` and loaded on first use with `React.lazy`).
 * The JSX is the screen's former inline panel, unchanged; the form state, the derived values and the save handler stay in the
 * screen and arrive as props, so the write path is the one it was.
 */
import { memo } from "react";
import { MessageBar, MessageBarBody } from "@fluentui/react-components";
import { FormPanel, HINTS } from "@/components";
import {
  GENERATORS_SCREEN_TEXT, INVERTER_PANEL_LABELS, INVERTER_TYPE_LABELS, inverterPanelTitle, plantPanelSaveLabel,
  plantSupplierDisplayName, type InverterFormErrors, type InverterFormState, type PlantSupplierOption,
} from "../../rules";
import { InputField, MultiSelectField, PanelFooter, SelectField } from "../controls";
import { choiceOptions } from "../options";
import { useStyles } from "../styles";

export interface InverterPanelProps {
  open: boolean;
  /** The selected inverter has a catalogue row: the title says Edit and the supplier is fixed. */
  editing: boolean;
  form: InverterFormState;
  errors: InverterFormErrors;
  /** `plantSupplierOptions("inverter", catalogue)`. */
  options: readonly PlantSupplierOption[];
  otherChosen: boolean;
  /** The Other Supplier text that decides the Save caption (`plantPanelSaveLabel`). */
  otherValue: string;
  /** The catalogue read failed (the panel says so). */
  catalogError: unknown;
  saveable: boolean;
  onTouch: <K extends keyof InverterFormState>(field: K, value: InverterFormState[K]) => void;
  onSave: () => void;
  onClose: () => void;
}

function InverterPanelView({
  open, editing, form, errors, options, otherChosen, otherValue, catalogError, saveable, onTouch, onSave, onClose,
}: InverterPanelProps) {
  const s = useStyles();
  return (
    <FormPanel
      open={open} title={inverterPanelTitle(editing)} width="narrow" onDismiss={onClose}
      footer={
        <PanelFooter
          primary={plantPanelSaveLabel(otherValue)}
          primaryName="pcf_btn_GeneratorData_RightPanel_Form_Inverter_Buttons_Save"
          primaryTooltip={HINTS.save}
          cancelName="pcf_btn_GeneratorData_RightPanel_Form_Inverter_Buttons_Cancel"
          disabled={!saveable} onCancel={onClose} onPrimary={onSave}
        />
      }
    >
      <div className={s.panelBody}>
        {catalogError ? (
          <MessageBar intent="error"><MessageBarBody>{GENERATORS_SCREEN_TEXT.loadFailedTitle}</MessageBarBody></MessageBar>
        ) : null}
        <InputField
          label={INVERTER_PANEL_LABELS.label} name="txt_GeneratorData_RightPanel_Form_Inverter_Fields_Label"
          required maxLength={512} value={form.label} error={errors.label}
          onChange={(v) => onTouch("label", v)}
        />
        <SelectField
          label={INVERTER_PANEL_LABELS.supplier} name="cmb_GeneratorData_RightPanel_Form_Inverter_Fields_Supplier"
          required disabled={editing} value={form.supplierId}
          options={options.map((o) => ({ value: o.id, label: plantSupplierDisplayName("inverter", o) }))}
          error={errors.supplier} onChange={(v) => onTouch("supplierId", v)}
        />
        {otherChosen ? (
          <InputField
            label={INVERTER_PANEL_LABELS.otherSupplier} name="txt_GeneratorData_RightPanel_Form_Inverter_Fields_OtherSupplier"
            required maxLength={512} value={form.otherSupplier} error={errors.otherSupplier}
            onChange={(v) => onTouch("otherSupplier", v)}
          />
        ) : null}
        <MultiSelectField
          label={INVERTER_PANEL_LABELS.inverterType} name="cmb_GeneratorData_RightPanel_Form_Inverter_Fields_InverterType"
          required values={form.inverterTypes.map(String)} options={choiceOptions(INVERTER_TYPE_LABELS)}
          error={errors.inverterTypes} onChange={(v) => onTouch("inverterTypes", v.map(Number))}
        />
        <InputField
          label={INVERTER_PANEL_LABELS.warranty} name="txt_GeneratorData_RightPanel_Form_Inverter_Fields_Warranty"
          required maxLength={6} value={form.warranty} error={errors.warranty}
          onChange={(v) => onTouch("warranty", v)}
        />
        <InputField
          label={INVERTER_PANEL_LABELS.numberOfInverters} name="txt_GeneratorData_RightPanel_Form_Inverter_Fields_NumberOfInverters"
          required maxLength={7} value={form.numberOfInverters} error={errors.numberOfInverters}
          onChange={(v) => onTouch("numberOfInverters", v)}
        />
        <InputField
          label={INVERTER_PANEL_LABELS.nominalPower} name="txt_GeneratorData_RightPanel_Form_Inverter_Fields_NominalPower"
          required value={form.nominalPower} error={errors.nominalPower}
          onChange={(v) => onTouch("nominalPower", v)}
        />
      </div>
    </FormPanel>
  );
}

export default memo(InverterPanelView);
