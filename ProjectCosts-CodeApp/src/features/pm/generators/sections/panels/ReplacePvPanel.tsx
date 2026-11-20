/**
 * Project Generators Screen — the Replace PV Module Type panel (D143: split out of `Screen.tsx` and loaded on first use with `React.lazy`).
 * The JSX is the screen's former inline panel, unchanged; the form state, the derived values and the save handler stay in the
 * screen and arrive as props, so the write path is the one it was.
 */
import { memo } from "react";
import { Text, mergeClasses } from "@fluentui/react-components";
import { FormPanel } from "@/components";
import {
  PV_CAPACITY_MAX_LENGTH, PV_DEGRADATION_MAX_LENGTH, PV_FIELD_LABELS, PV_MODULE_LABEL_MAX_LENGTH, PV_OTHER_SUPPLIER_LABEL,
  PV_SUPPLIER_PLACEHOLDER, REPLACE_LABELS, pvCardValues, pvDegradationPrefill, replacePvTitle,
  type PvModuleOption, type PvTypeFormErrors, type PvTypeFormState, type SimpleTypeRow,
} from "../../rules";
import { InputField, PanelFooter, SelectField } from "../controls";
import { pvPrefill } from "../state";
import { useStyles } from "../styles";

export interface ReplacePvPanelProps {
  open: boolean;
  lang: string;
  /** The selected PV type (the "Replace from" column), or null. */
  selectedPv: SimpleTypeRow | null;
  form: PvTypeFormState;
  errors: PvTypeFormErrors;
  options: readonly PvModuleOption[];
  otherChosen: boolean;
  saveable: boolean;
  settling: boolean;
  onTouch: <K extends keyof PvTypeFormState>(field: K, value: PvTypeFormState[K]) => void;
  onReplace: () => void;
  onClose: () => void;
}

function ReplacePvPanelView({
  open, lang, selectedPv, form, errors, options, otherChosen, saveable, settling, onTouch, onReplace, onClose,
}: ReplacePvPanelProps) {
  const s = useStyles();
  return (
    <FormPanel
      open={open} title={replacePvTitle(selectedPv?.moduleLabel)} width={700} onDismiss={onClose}
      footer={
        <PanelFooter
          primary={REPLACE_LABELS.replace}
          primaryName="pcf_btn_GeneratorData_RightPanel_Form_PvModuleType_Buttons_Save_2"
          cancelName="pcf_btn_GeneratorData_RightPanel_Form_PvModuleType_Buttons_Cancel_1"
          disabled={!saveable || settling}
          onCancel={onClose} onPrimary={onReplace}
        />
      }
    >
      <div className={mergeClasses(s.replaceGrid, s.replaceGridPv)}>
        <div className={s.replaceColumn}>
          <Text className={s.replaceHeading}>{REPLACE_LABELS.replaceFrom}</Text>
          <InputField
            label={PV_FIELD_LABELS.moduleLabel} name="txt_GeneratorData_RightPanel_Form_PvModuleType_Fields_Label_1"
            ariaLabel="txt_GeneratorData_RightPanel_Form_PvModuleType_Fields_Label" required
            readOnly disabledLook value={selectedPv?.moduleLabel ?? ""}
          />
          <InputField
            label={PV_FIELD_LABELS.capacity} name="txt_GeneratorData_RightPanel_Form_PvModuleType_Fields_PVCapacityMW_1"
            ariaLabel="txt_GeneratorData_RightPanel_Form_PvModuleType_Fields_PVCapacityMW" required readOnly disabledLook
            value={selectedPv ? pvPrefill(selectedPv.capacity, lang) : ""}
          />
          <SelectField
            label={PV_FIELD_LABELS.supplier} name="cmb_GeneratorData_RightPanel_Form_PvModuleType_Fields_Supplier_1"
            ariaLabel="cmb_GeneratorData_RightPanel_Form_PvModuleType_Fields_Supplier" required disabled
            disabledLook
            value={selectedPv ? "from" : null}
            options={selectedPv ? [{ value: "from", label: pvCardValues(selectedPv, lang).supplier }] : []}
            onChange={() => {}}
          />
          <InputField
            label={PV_FIELD_LABELS.degradation1stYear} name="txt_GeneratorData_RightPanel_Form_PvModuleType_Fields_DegradationFirstYear_1"
            ariaLabel="txt_GeneratorData_RightPanel_Form_PvModuleType_Fields_DegradationFirstYear" readOnly disabledLook
            value={selectedPv ? pvDegradationPrefill(selectedPv.degradation1stYear, lang) : ""}
          />
          <InputField
            label={PV_FIELD_LABELS.degradationRemainingYears} name="txt_GeneratorData_RightPanel_Form_PvModuleType_Fields_DegradationRemainingYears_1"
            ariaLabel="txt_GeneratorData_RightPanel_Form_PvModuleType_Fields_DegradationRemainingYears" readOnly disabledLook
            value={selectedPv ? pvPrefill(selectedPv.degradationRemainingYears, lang) : ""}
          />
        </div>
        <div className={s.replaceColumn}>
          <Text className={s.replaceHeading}>{REPLACE_LABELS.replaceTo}</Text>
          <InputField
            label={PV_FIELD_LABELS.moduleLabel} name="txt_GeneratorData_RightPanel_Form_PvModuleType_Fields_Label_2"
            ariaLabel="txt_GeneratorData_RightPanel_Form_PvModuleType_Fields_Label"
            required maxLength={PV_MODULE_LABEL_MAX_LENGTH} value={form.moduleLabel}
            error={errors.moduleLabel} onChange={(v) => onTouch("moduleLabel", v)}
          />
          <InputField
            label={PV_FIELD_LABELS.capacity} name="txt_GeneratorData_RightPanel_Form_PvModuleType_Fields_PVCapacityMW_2"
            ariaLabel="txt_GeneratorData_RightPanel_Form_PvModuleType_Fields_PVCapacityMW"
            required maxLength={PV_CAPACITY_MAX_LENGTH} value={form.capacity}
            error={errors.capacity} onChange={(v) => onTouch("capacity", v)}
          />
          <SelectField
            label={PV_FIELD_LABELS.supplier} name="cmb_GeneratorData_RightPanel_Form_PvModuleType_Fields_Supplier_2"
            ariaLabel="cmb_GeneratorData_RightPanel_Form_PvModuleType_Fields_Supplier"
            required placeholder={PV_SUPPLIER_PLACEHOLDER} value={form.supplier}
            options={options.map((o) => ({ value: o.id, label: o.displayName ?? "" }))}
            onChange={(v) => onTouch("supplier", v)}
          />
          {otherChosen ? (
            // The 1.21.753 corpora name the caption (`lbl_…_OtherSupplier_2`) but not the input: a stable id.
            <InputField
              label={PV_OTHER_SUPPLIER_LABEL} name="generators-replace-pv-other-supplier"
              required maxLength={PV_MODULE_LABEL_MAX_LENGTH} value={form.otherSupplier ?? ""}
              error={errors.otherSupplier} onChange={(v) => onTouch("otherSupplier", v)}
            />
          ) : null}
          <InputField
            label={PV_FIELD_LABELS.degradation1stYear} name="txt_GeneratorData_RightPanel_Form_PvModuleType_Fields_DegradationFirstYear_2"
            ariaLabel="txt_GeneratorData_RightPanel_Form_PvModuleType_Fields_DegradationFirstYear"
            maxLength={PV_DEGRADATION_MAX_LENGTH} value={form.degradation1stYear}
            error={errors.degradation1stYear} onChange={(v) => onTouch("degradation1stYear", v)}
          />
          <InputField
            label={PV_FIELD_LABELS.degradationRemainingYears} name="txt_GeneratorData_RightPanel_Form_PvModuleType_Fields_DegradationRemainingYears_2"
            ariaLabel="txt_GeneratorData_RightPanel_Form_PvModuleType_Fields_DegradationRemainingYears"
            maxLength={PV_DEGRADATION_MAX_LENGTH} value={form.degradationRemainingYears}
            error={errors.degradationRemainingYears} onChange={(v) => onTouch("degradationRemainingYears", v)}
          />
        </div>
      </div>
    </FormPanel>
  );
}

export default memo(ReplacePvPanelView);
