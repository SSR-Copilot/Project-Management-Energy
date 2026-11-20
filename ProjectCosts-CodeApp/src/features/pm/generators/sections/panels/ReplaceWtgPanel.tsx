/**
 * Project Generators Screen — the Replace Generator Type panel (D143: split out of `Screen.tsx` and loaded on first use with `React.lazy`).
 * The JSX is the screen's former inline panel, unchanged; the form state, the derived values and the save handler stay in the
 * screen and arrive as props, so the write path is the one it was.
 */
import { memo } from "react";
import { Switch, Text } from "@fluentui/react-components";
import { InfoRegular } from "@fluentui/react-icons";
import { FormPanel } from "@/components";
import { palette } from "@/theme/tokens";
import {
  HEIGHT_LIMIT_PM_MESSAGE, REPLACE_LABELS, TYPE_PANEL_LABELS, TYPE_PANEL_TOOLTIPS, fmtHubHeight, isDummySupplier,
  replaceGeneratorTitle, typeFilterMessage, validateEffectiveHubHeight, type CascadeOptions, type CatalogModel, type ReplaceWtgForm,
} from "../../rules";
import { InputField, PanelFooter, SelectField } from "../controls";
import { heightOptions, plainOptions } from "../options";
import { emptyReplaceWtg } from "../state";
import { useStyles } from "../styles";

export interface ReplaceWtgPanelProps {
  open: boolean;
  lang: string;
  countryName: string | null | undefined;
  /** The title's type name: the selected type's turbine type, else its display name. */
  fromTypeName: string | null | undefined;
  /** The selected type's catalogue model (the "Replace from" column). */
  fromModel: CatalogModel | null;
  /** The hub height typed for a Dummy type (its first turbine's), shown instead of the catalogue height. */
  typedHubHeight: number | null;
  /** The number of generators the replaced type has (both "Number of Generators" boxes). */
  count: number;
  form: ReplaceWtgForm;
  cascade: CascadeOptions;
  dummy: boolean;
  saveable: boolean;
  heightBlocked: boolean;
  settling: boolean;
  onForm: (form: ReplaceWtgForm) => void;
  onReplace: () => void;
  onClose: () => void;
}

function ReplaceWtgPanelView({
  open, lang, countryName, fromTypeName, fromModel, typedHubHeight, count, form, cascade, dummy, saveable, heightBlocked, settling,
  onForm, onReplace, onClose,
}: ReplaceWtgPanelProps) {
  const s = useStyles();
  return (
    <FormPanel
      open={open}
      title={replaceGeneratorTitle(fromTypeName)}
      width={830} onDismiss={onClose}
      footer={
        <PanelFooter
          primary={REPLACE_LABELS.replace}
          primaryName="pcf_btn_GeneratorData_RightPanel_Form_Buttons_Save_1"
          cancelName="pcf_btn_GeneratorData_RightPanel_Form_Buttons_Cancel_1"
          primaryTooltip={REPLACE_LABELS.replaceTooltip} cancelTooltip={TYPE_PANEL_TOOLTIPS.cancel}
          disabled={!saveable || settling}
          hint={heightBlocked ? HEIGHT_LIMIT_PM_MESSAGE : undefined}
          onCancel={onClose} onPrimary={onReplace}
        />
      }
    >
      <div className={s.replaceGrid}>
        <div className={s.replaceColumn}>
          <Text className={s.replaceHeading}>{REPLACE_LABELS.replaceFrom}</Text>
          {/* The "from" side is the disabled canvas controls: comboboxes keep their chevron. */}
          <SelectField
            label={REPLACE_LABELS.supplier} name="cmb_Supplier_6" ariaLabel="cmb_Supplier" required disabled
            disabledLook
            value={fromModel?.supplier ? "from" : null}
            options={fromModel?.supplier ? [{ value: "from", label: fromModel.supplier }] : []}
            onChange={() => {}}
          />
          <SelectField
            label={REPLACE_LABELS.turbineType} name="cmb_Supplier_7" ariaLabel="cmb_Supplier_1" required disabled
            disabledLook
            value={fromModel?.turbineType ? "from" : null}
            options={fromModel?.turbineType ? [{ value: "from", label: fromModel.turbineType }] : []}
            onChange={() => {}}
          />
          {/* `cmb_Supplier_8` is a disabled combobox like the two above (chevron), showing the hub
              height as stored — "169", not "169.00" (canvas screenshot, 3 Nov 2026). A Dummy type has no
              catalog height (0): the canvas shows a text box with the height typed for it — the first
              turbine's hub height, as on the card (`wtgCardHubHeight`; canvas pair, 17 Nov 2026). */}
          {isDummySupplier(fromModel?.supplier) ? (
            <InputField
              label={REPLACE_LABELS.hubHeight} name="cmb_Supplier_8" ariaLabel="cmb_Supplier_2" required
              readOnly disabledLook
              value={typedHubHeight === null ? "" : fmtHubHeight(typedHubHeight, lang)}
            />
          ) : (
            <SelectField
              label={REPLACE_LABELS.hubHeight} name="cmb_Supplier_8" ariaLabel="cmb_Supplier_2" required disabled
              disabledLook
              value={fromModel?.hubHeight != null ? "from" : null}
              options={fromModel?.hubHeight != null ? [{ value: "from", label: fmtHubHeight(fromModel.hubHeight, lang) }] : []}
              onChange={() => {}}
            />
          )}
          <InputField
            label={REPLACE_LABELS.numberOfGenerators} name="txt_GeneratorData_RightPanel_Form_Fields_NumberOfGenerator_2"
            ariaLabel="txt_GeneratorData_RightPanel_Form_Fields_NumberOfGenerator" required
            readOnly disabledLook value={String(count)}
          />
        </div>
        <div className={s.replaceColumn}>
          <Text className={s.replaceHeading}>{REPLACE_LABELS.replaceTo}</Text>
          {/* canvas-identity-ignore: 1.21.753-only control */}
          <div className={s.countryFilter}>
            <Switch
              className={s.countryFilterSwitch}
              checked={form.inCountry}
              aria-label="tgl_btn_GeneratorData_RightPanel_Form_Filter_Country"
              data-testid="tgl_btn_GeneratorData_RightPanel_Form_Filter_Country_1"
              onChange={(_, d) => onForm(emptyReplaceWtg(d.checked))}
            />
            <span className={s.countryFilterText}>{REPLACE_LABELS.countryFilter}</span>
            <div className={s.countryFilterInfo}>
              <InfoRegular aria-hidden="true" fontSize={18} color={form.inCountry ? palette.Success : palette.Warning} />
              <span>{typeFilterMessage(form.inCountry, countryName)}</span>
            </div>
          </div>
          <SelectField
            label={REPLACE_LABELS.supplier} name="cmb_Supplier_3" ariaLabel="cmb_Supplier" required
            placeholder={TYPE_PANEL_LABELS.findItems}
            value={form.supplier} options={plainOptions(cascade.suppliers)}
            onChange={(v) => onForm({ ...emptyReplaceWtg(form.inCountry), supplier: v })}
          />
          <SelectField
            label={REPLACE_LABELS.turbineType} name="cmb_Supplier_4" ariaLabel="cmb_Supplier_1" required
            placeholder={TYPE_PANEL_LABELS.findItems} disabledLook
            disabled={!form.supplier} value={form.turbineType} options={plainOptions(cascade.turbineTypes)}
            onChange={(v) => onForm({ ...form, turbineType: v, hubHeight: null, revisedHubHeight: "" })}
          />
          {!dummy ? (
            <SelectField
              label={REPLACE_LABELS.hubHeight} name="cmb_Supplier_5" ariaLabel="cmb_Supplier_2" required
              placeholder={TYPE_PANEL_LABELS.findItems} disabledLook
              disabled={!form.turbineType}
              value={form.hubHeight === null ? null : String(form.hubHeight)}
              options={heightOptions(cascade.hubHeights, lang)}
              onChange={(v) => onForm({ ...form, hubHeight: Number(v), revisedHubHeight: "" })}
            />
          ) : (
            <InputField
              label={REPLACE_LABELS.hubHeight} name="txt_GeneratorData_RightPanel_Form_Fields_HubHeight_2"
              ariaLabel="txt_GeneratorData_RightPanel_Form_Fields_HubHeight_1" required maxLength={256}
              value={form.revisedHubHeight}
              error={form.revisedHubHeight.trim() !== "" ? validateEffectiveHubHeight(form.revisedHubHeight, lang) : null}
              onChange={(v) => onForm({ ...form, revisedHubHeight: v })}
            />
          )}
          <InputField
            label={REPLACE_LABELS.numberOfGenerators} name="txt_GeneratorData_RightPanel_Form_Fields_NumberOfGenerator_1"
            ariaLabel="txt_GeneratorData_RightPanel_Form_Fields_NumberOfGenerator" required
            readOnly disabledLook value={String(count)}
          />
        </div>
      </div>
    </FormPanel>
  );
}

export default memo(ReplaceWtgPanelView);
