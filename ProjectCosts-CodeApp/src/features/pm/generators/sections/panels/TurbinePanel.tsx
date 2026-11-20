/**
 * Project Generators Screen — the Add / Edit Generator (one turbine) panel (D143: split out of `Screen.tsx` and loaded on first use with `React.lazy`).
 * The JSX is the screen's former inline panel, unchanged; the form state, the derived values and the save handler stay in the
 * screen and arrive as props, so the write path is the one it was.
 */
import { memo } from "react";
import { Checkbox, Text, mergeClasses } from "@fluentui/react-components";
import { InfoRegular } from "@fluentui/react-icons";
import { FormPanel, HINTS } from "@/components";
import {
  HEIGHT_LIMIT_PM_MESSAGE, PANEL_BUTTONS, TURBINE_PANEL_LABELS, fmtTurbineTotalHeightBox, turbinePanelPrefix, turbinePanelTitle,
  validateEffectiveCapacity, validateEffectiveHubHeight, validateFoundationPlinth, type TurbineFormState, type TurbineRow,
} from "../../rules";
import { InputField, PanelFooter } from "../controls";
import { useStyles } from "../styles";

export interface ApplyAll { capacity: boolean; plinth: boolean; hubHeight: boolean }

export interface TurbinePanelProps {
  open: boolean;
  lang: string;
  shortName: string | null | undefined;
  /** The turbine being edited, or null for Add. */
  turbine: TurbineRow | null;
  /** The turbine type's model name (`Generator Type`, read only). */
  generatorType: string;
  specificCapacity: number | null;
  form: TurbineFormState;
  nameError: string | null;
  applyAll: ApplyAll;
  totalHeight: number | null;
  saveable: boolean;
  heightBlocked: boolean;
  settling: boolean;
  onTouch: <K extends keyof TurbineFormState>(field: K, value: TurbineFormState[K]) => void;
  onApplyAllChange: (key: keyof ApplyAll, checked: boolean) => void;
  onSave: () => void;
  onClose: () => void;
}

function TurbinePanelView({
  open, lang, shortName, turbine, generatorType, specificCapacity, form, nameError, applyAll, totalHeight, saveable, heightBlocked,
  settling, onTouch, onApplyAllChange, onSave, onClose,
}: TurbinePanelProps) {
  const s = useStyles();
  return (
    <FormPanel
      open={open} title={turbinePanelTitle(turbine?.name)} width="narrow"
      onDismiss={onClose}
      footer={
        <PanelFooter
          primary={PANEL_BUTTONS.save}
          primaryName="pcf_btn_GeneratorData_RightPanel_Form_Generator_Buttons_Save"
          // SOURCE DEFECT: the canvas Save hint is "Filter projects details list view."; it says "Save".
          primaryTooltip={HINTS.save}
          cancelName="pcf_btn_GeneratorData_RightPanel_Form_Generator_Buttons_Cancel"
          disabled={!saveable || settling}
          hint={heightBlocked ? HEIGHT_LIMIT_PM_MESSAGE : undefined}
          onCancel={onClose}
          onPrimary={onSave}
        />
      }
    >
      <div className={s.panelBody}>
        <InputField
          label={TURBINE_PANEL_LABELS.generatorType} name="txt_GeneratorData_RightPanel_Form_Fields_GeneratorType"
          readOnly value={generatorType} className={s.turbineField}
        />
        {/* `lbl_…_GeneratorName` on top; under it the 180-px right-aligned prefix, then the 80-px index input. */}
        <div className="canvas-field">
          <span data-required="true">{TURBINE_PANEL_LABELS.generatorName}</span>
          <div className={s.prefixRow}>
            <Text className={s.namePrefix} data-testid="lbl_GeneratorData_RightPanel_Form_Fields_GeneratorName_Prefix">
              {turbinePanelPrefix(turbine, shortName)}
            </Text>
            <label className={mergeClasses("canvas-field", s.nameIndex)}>
              <input
                value={form.nameIndex}
                aria-label={TURBINE_PANEL_LABELS.generatorName}
                data-testid="txt_GeneratorData_RightPanel_Form_Fields_GeneratorName"
                aria-invalid={nameError ? true : undefined}
                onChange={(e) => onTouch("nameIndex", e.target.value)}
              />
            </label>
          </div>
          {nameError ? <span className="canvas-field-error" role="alert">{nameError}</span> : null}
        </div>
        <InputField
          label={TURBINE_PANEL_LABELS.effectiveCapacity} name="txt_GeneratorData_RightPanel_Form_Fields_Effective_Capacity"
          required maxLength={256} value={form.effectiveCapacity} className={s.turbineField}
          error={form.effectiveCapacity.trim() === "" ? null : validateEffectiveCapacity(
            form.effectiveCapacity, specificCapacity, lang)}
          onChange={(v) => onTouch("effectiveCapacity", v)}
        />
        <Checkbox
          label={TURBINE_PANEL_LABELS.applyAllCapacities} aria-label={TURBINE_PANEL_LABELS.applyAllCapacities}
          data-testid="chk_GeneratorData_RightPanel_Form_Fields_Effective_Capacity_All"
          checked={applyAll.capacity}
          onChange={(_, d) => onApplyAllChange("capacity", d.checked === true)}
        />
        {applyAll.capacity ? (
          <Text className={mergeClasses(s.warning, s.applyAllWarning)}>
            <InfoRegular aria-hidden="true" fontSize={14} />{TURBINE_PANEL_LABELS.applyAllWarning}
          </Text>
        ) : null}
        <InputField
          label={TURBINE_PANEL_LABELS.foundationPlinth} name="txt_GeneratorData_RightPanel_Form_Fields_Foundation_Plinth"
          maxLength={256} value={form.foundationPlinth} className={s.turbineField}
          error={validateFoundationPlinth(form.foundationPlinth.trim(), lang)}
          onChange={(v) => onTouch("foundationPlinth", v)}
        />
        <Checkbox
          label={TURBINE_PANEL_LABELS.applyAllWtgs} aria-label={TURBINE_PANEL_LABELS.applyAllWtgs}
          data-testid="chk_GeneratorData_RightPanel_Form_Fields_Foundation_Plinth_All"
          checked={applyAll.plinth}
          onChange={(_, d) => onApplyAllChange("plinth", d.checked === true)}
        />
        {applyAll.plinth ? (
          <Text className={mergeClasses(s.warning, s.applyAllWarning)}>
            <InfoRegular aria-hidden="true" fontSize={14} />{TURBINE_PANEL_LABELS.applyAllWarning}
          </Text>
        ) : null}
        <InputField
          // `lbl_…_Effective_HubHeight_Required.Visible: false` — no `*`, though the value is still checked.
          label={TURBINE_PANEL_LABELS.hubHeightExclPlinth} name="txt_GeneratorData_RightPanel_Form_Fields_Effective_HubHeight"
          maxLength={256} value={form.effectiveHubHeight} className={s.turbineField}
          error={form.effectiveHubHeight.trim() === "" ? null : validateEffectiveHubHeight(form.effectiveHubHeight, lang)}
          onChange={(v) => onTouch("effectiveHubHeight", v)}
        />
        <Checkbox
          label={TURBINE_PANEL_LABELS.applyAllWtgs} aria-label={TURBINE_PANEL_LABELS.applyAllWtgs}
          data-testid="chk_GeneratorData_RightPanel_Form_Fields_Effective_HubHeight_All"
          checked={applyAll.hubHeight}
          onChange={(_, d) => onApplyAllChange("hubHeight", d.checked === true)}
        />
        {applyAll.hubHeight ? (
          <Text className={mergeClasses(s.warning, s.applyAllWarning)}>
            <InfoRegular aria-hidden="true" fontSize={14} />{TURBINE_PANEL_LABELS.applyAllWarning}
          </Text>
        ) : null}
        <InputField
          label={TURBINE_PANEL_LABELS.totalHeight} name="txt_GeneratorData_RightPanel_Form_Fields_Total_Height"
          readOnly disabledLook className={s.turbineField}
          value={fmtTurbineTotalHeightBox(totalHeight, lang)}
        />
      </div>
    </FormPanel>
  );
}

export default memo(TurbinePanelView);
