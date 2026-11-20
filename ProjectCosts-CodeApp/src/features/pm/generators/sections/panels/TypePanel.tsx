/**
 * Project Generators Screen — the Add Generator Type panel (D143: split out of `Screen.tsx` and loaded on first use with `React.lazy`).
 * The JSX is the screen's former inline panel, unchanged; the form state, the derived values and the save handler stay in the
 * screen and arrive as props, so the write path is the one it was.
 */
import { memo } from "react";
import { MessageBar, MessageBarBody, Switch, Text } from "@fluentui/react-components";
import { InfoRegular } from "@fluentui/react-icons";
import { FormPanel } from "@/components";
import { palette } from "@/theme/tokens";
import {
  HEIGHT_LIMIT_PM_MESSAGE, TYPE_PANEL_LABELS, TYPE_PANEL_TOOLTIPS, numberOfGeneratorsMessage, typeFieldBlankMessage,
  typeFilterMessage, typeSaveLabel, validateEffectiveHubHeight, type CascadeOptions, type TypeFormState,
} from "../../rules";
import { InputField, PanelFooter, SelectField } from "../controls";
import { heightOptions, plainOptions } from "../options";
import { useStyles } from "../styles";

export interface TypePanelProps {
  open: boolean;
  lang: string;
  countryName: string | null | undefined;
  inCountry: boolean;
  form: TypeFormState;
  cascade: CascadeOptions;
  dummy: boolean;
  /** The chosen hub height (the first one for a Dummy supplier), or null while none is chosen. */
  effectiveHubHeight: number | null;
  saveable: boolean;
  /** NEW (D89): why Save is disabled when no visible field says so. */
  saveBlocked: string | null;
  heightBlocked: boolean;
  settling: boolean;
  onInCountryChange: (checked: boolean) => void;
  onTouch: <K extends keyof TypeFormState>(field: K, value: TypeFormState[K]) => void;
  onSave: () => void;
  onClose: () => void;
}

function TypePanelView({
  open, lang, countryName, inCountry, form, cascade, dummy, effectiveHubHeight, saveable, saveBlocked, heightBlocked, settling,
  onInCountryChange, onTouch, onSave, onClose,
}: TypePanelProps) {
  const s = useStyles();
  const dirty = (f: string) => form.dirty.has(f);
  return (
    <FormPanel
      open={open} title={TYPE_PANEL_LABELS.title} width="narrow" onDismiss={onClose}
      footer={
        <PanelFooter
          primary={typeSaveLabel(form.supplier, inCountry)}
          primaryName="pcf_btn_GeneratorData_RightPanel_Form_Buttons_Save"
          cancelName="pcf_btn_GeneratorData_RightPanel_Form_Buttons_Cancel"
          primaryTooltip={TYPE_PANEL_TOOLTIPS.save} cancelTooltip={TYPE_PANEL_TOOLTIPS.cancel}
          disabled={!saveable || settling}
          hint={heightBlocked ? HEIGHT_LIMIT_PM_MESSAGE : undefined}
          onCancel={onClose}
          onPrimary={onSave}
        />
      }
    >
      <div className={s.panelBody}>
        {/* `con_…_Filter_Country`: the toggle first, then the availability row under it (Y 50). */}
        <Switch
          checked={inCountry}
          label={TYPE_PANEL_LABELS.countryFilter} aria-label="tgl_btn_GeneratorData_RightPanel_Form_Filter_Country"
          data-testid="tgl_btn_GeneratorData_RightPanel_Form_Filter_Country"
          onChange={(_, d) => onInCountryChange(d.checked)}
        />
        <div className={s.filterAvailability}>
          <InfoRegular
            aria-hidden="true" fontSize={18} data-testid="ico_GeneratorData_RightPanel_Form_Filter_Message"
            color={inCountry ? palette.Success : palette.Warning}
          />
          <Text data-testid="lbl_GeneratorData_RightPanel_Form_Filter_Message">
            {typeFilterMessage(inCountry, countryName)}
          </Text>
        </div>
        <SelectField
          label={TYPE_PANEL_LABELS.supplier} name="cmb_Supplier" ariaLabel="cmb_Supplier" required
          className={s.typeField} placeholder={TYPE_PANEL_LABELS.findItems}
          value={form.supplier} options={plainOptions(cascade.suppliers)}
          error={typeFieldBlankMessage(dirty("supplier"), form.supplier === null)}
          onChange={(v) => onTouch("supplier", v)}
        />
        <SelectField
          label={TYPE_PANEL_LABELS.turbineType} name="cmb_Supplier_1" ariaLabel="cmb_Supplier_1" required
          className={s.typeField} placeholder={TYPE_PANEL_LABELS.findItems} disabledLook
          disabled={!form.supplier}
          value={form.turbineType} options={plainOptions(cascade.turbineTypes)}
          error={typeFieldBlankMessage(dirty("turbineType"), form.turbineType === null)}
          onChange={(v) => onTouch("turbineType", v)}
        />
        {/* Rule 5 — a Dummy supplier types the hub height into `txt_…HubHeight_1` instead. */}
        {!dummy ? (
          <SelectField
            label={TYPE_PANEL_LABELS.hubHeight} name="cmb_Supplier_2" ariaLabel="cmb_Supplier_2" required
            className={s.typeField} placeholder={TYPE_PANEL_LABELS.findItems} disabledLook
            disabled={!form.turbineType}
            value={form.hubHeight === null ? null : String(form.hubHeight)}
            options={heightOptions(cascade.hubHeights, lang)}
            error={typeFieldBlankMessage(dirty("hubHeight"), form.hubHeight === null)}
            onChange={(v) => onTouch("hubHeight", Number(v))}
          />
        ) : (
          <InputField
            label={TYPE_PANEL_LABELS.hubHeight} name="txt_GeneratorData_RightPanel_Form_Fields_HubHeight_1"
            ariaLabel="txt_GeneratorData_RightPanel_Form_Fields_HubHeight_1" required className={s.typeField}
            maxLength={256} value={form.revisedHubHeight}
            error={form.revisedHubHeight.trim() !== "" ? validateEffectiveHubHeight(form.revisedHubHeight, lang) : null}
            onChange={(v) => onTouch("revisedHubHeight", v)}
          />
        )}
        <InputField
          label={TYPE_PANEL_LABELS.numberOfGenerators} name="txt_GeneratorData_RightPanel_Form_Fields_NumberOfGenerator"
          ariaLabel="txt_GeneratorData_RightPanel_Form_Fields_NumberOfGenerator" required maxLength={6}
          className={s.typeField}
          // `DisplayMode.Disabled` until a hub height is chosen: the white outlined box, as the canvas.
          disabled={effectiveHubHeight === null} disabledLook value={form.numberOfGenerators}
          error={numberOfGeneratorsMessage(form.numberOfGenerators, lang)}
          onChange={(v) => onTouch("numberOfGenerators", v)}
        />
        {/* The height-limitation message is the footer `hint` (canvas: inside the button container). */}
        {/* NEW (D89): the hidden reason Save is disabled (`saveBlockedReason`); no canvas control. */}
        {saveBlocked ? (
          <MessageBar intent="warning" className={s.typeField} data-testid="msg_GeneratorData_RightPanel_Form_SaveBlocked">
            <MessageBarBody>{saveBlocked}</MessageBarBody>
          </MessageBar>
        ) : null}
      </div>
    </FormPanel>
  );
}

export default memo(TypePanelView);
