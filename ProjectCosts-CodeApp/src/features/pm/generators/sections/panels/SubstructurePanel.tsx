/**
 * Project Generators Screen — the Add / Edit Substructure panel (D143: split out of `Screen.tsx` and loaded on first use with `React.lazy`).
 * The JSX is the screen's former inline panel, unchanged; the form state, the derived values and the save handler stay in the
 * screen and arrive as props, so the write path is the one it was.
 */
import { memo } from "react";
import { MessageBar, MessageBarBody } from "@fluentui/react-components";
import { FormPanel, HINTS } from "@/components";
import {
  GENERATORS_SCREEN_TEXT, SUBSTRUCTURE_PANEL_LABELS, SUBSTRUCTURE_TYPE_LABELS, plantPanelSaveLabel, plantSupplierDisplayName,
  substructurePanelTitle, type PlantSupplierOption, type SubstructureFormErrors, type SubstructureFormState,
} from "../../rules";
import { InputField, PanelFooter, SelectField } from "../controls";
import { choiceOptions } from "../options";
import { useStyles } from "../styles";

export interface SubstructurePanelProps {
  open: boolean;
  /** The selected substructure has a catalogue row: the title says Edit and the supplier is fixed. */
  editing: boolean;
  form: SubstructureFormState;
  errors: SubstructureFormErrors;
  /** `plantSupplierOptions("substructure", catalogue)`. */
  options: readonly PlantSupplierOption[];
  otherChosen: boolean;
  otherValue: string;
  catalogError: unknown;
  saveable: boolean;
  onTouch: <K extends keyof SubstructureFormState>(field: K, value: SubstructureFormState[K]) => void;
  onSave: () => void;
  onClose: () => void;
}

function SubstructurePanelView({
  open, editing, form, errors, options, otherChosen, otherValue, catalogError, saveable, onTouch, onSave, onClose,
}: SubstructurePanelProps) {
  const s = useStyles();
  return (
    <FormPanel
      open={open} title={substructurePanelTitle(editing)} width="narrow" onDismiss={onClose}
      footer={
        <PanelFooter
          primary={plantPanelSaveLabel(otherValue)}
          primaryName="pcf_btn_GeneratorData_RightPanel_Form_Substructure_Buttons_Save"
          primaryTooltip={HINTS.save}
          cancelName="pcf_btn_GeneratorData_RightPanel_Form_Substructure_Buttons_Cancel"
          disabled={!saveable} onCancel={onClose} onPrimary={onSave}
        />
      }
    >
      <div className={s.panelBody}>
        {catalogError ? (
          <MessageBar intent="error"><MessageBarBody>{GENERATORS_SCREEN_TEXT.loadFailedTitle}</MessageBarBody></MessageBar>
        ) : null}
        <InputField
          label={SUBSTRUCTURE_PANEL_LABELS.label} name="txt_GeneratorData_RightPanel_Form_Substructure_Fields_Label"
          required maxLength={512} value={form.label} error={errors.label}
          onChange={(v) => onTouch("label", v)}
        />
        <SelectField
          label={SUBSTRUCTURE_PANEL_LABELS.supplier} name="cmb_GeneratorData_RightPanel_Form_Substructure_Fields_Supplier"
          required disabled={editing} value={form.supplierId}
          options={options.map((o) => ({ value: o.id, label: plantSupplierDisplayName("substructure", o) }))}
          error={errors.supplier} onChange={(v) => onTouch("supplierId", v)}
        />
        {otherChosen ? (
          <InputField
            label={SUBSTRUCTURE_PANEL_LABELS.otherSupplier} name="txt_GeneratorData_RightPanel_Form_Substructure_Fields_OtherSupplier"
            required maxLength={512} value={form.otherSupplier} error={errors.otherSupplier}
            onChange={(v) => onTouch("otherSupplier", v)}
          />
        ) : null}
        <SelectField
          label={SUBSTRUCTURE_PANEL_LABELS.substructureType} name="cmb_GeneratorData_RightPanel_Form_Substructure_Fields_SubstructureType"
          required value={form.substructureType === null ? null : String(form.substructureType)}
          options={choiceOptions(SUBSTRUCTURE_TYPE_LABELS)} error={errors.substructureType}
          onChange={(v) => onTouch("substructureType", Number(v))}
        />
      </div>
    </FormPanel>
  );
}

export default memo(SubstructurePanelView);
