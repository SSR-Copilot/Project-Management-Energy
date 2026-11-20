/**
 * Project Generators Screen — the Add BESS / Add Hydrogen / Add Substation panel (D143: split out of `Screen.tsx` and loaded on first use with `React.lazy`).
 * The JSX is the screen's former inline panel, unchanged; the form state, the derived values and the save handler stay in the
 * screen and arrive as props, so the write path is the one it was.
 */
import { memo } from "react";
import { FormPanel } from "@/components";
import {
  PANEL_BUTTONS, SIMPLE_CAPACITY_MAX_LENGTH, SIMPLE_TEXT_MAX_LENGTH, type SimpleCapacityFamily, type SimpleFormErrors,
  type SimpleFormState,
} from "../../rules";
import { InputField, PanelFooter } from "../controls";
import { SIMPLE_PANEL } from "../state";
import { useStyles } from "../styles";

export interface SimplePanelProps {
  /** The family whose panel is open, or null while none is. */
  family: SimpleCapacityFamily | null;
  form: SimpleFormState;
  errors: SimpleFormErrors | null;
  saveable: boolean;
  onTouch: <K extends keyof SimpleFormState>(field: K, value: SimpleFormState[K]) => void;
  onSave: () => void;
  onClose: () => void;
}

function SimplePanelView({ family, form, errors, saveable, onTouch, onSave, onClose }: SimplePanelProps) {
  const s = useStyles();
  const simple = family ? SIMPLE_PANEL[family] : null;
  return (
    <FormPanel
      open={family !== null} title={simple?.title ?? ""} width="narrow" onDismiss={onClose}
      footer={simple ? (
        <PanelFooter
          primary={PANEL_BUTTONS.save} primaryName={simple.save} cancelName={simple.cancel}
          disabled={!saveable} onCancel={onClose} onPrimary={onSave}
        />
      ) : null}
    >
      {simple && family ? (
        <div className={s.panelBody}>
          <InputField
            label={simple.labelCaption} name={simple.label} ariaLabel={simple.label} required
            maxLength={SIMPLE_TEXT_MAX_LENGTH} value={form.label} error={errors?.label} onChange={(v) => onTouch("label", v)}
          />
          <InputField
            label={simple.capacityCaption} name={simple.capacity} ariaLabel={simple.capacity} required
            maxLength={SIMPLE_CAPACITY_MAX_LENGTH[family]} value={form.capacity}
            error={errors?.capacity} onChange={(v) => onTouch("capacity", v)}
          />
          {simple.energy && simple.energyCaption ? (
            <InputField
              label={simple.energyCaption} name={simple.energy} ariaLabel={simple.energy} required
              maxLength={SIMPLE_CAPACITY_MAX_LENGTH.storage} value={form.energyCapacity}
              error={errors?.energyCapacity} onChange={(v) => onTouch("energyCapacity", v)}
            />
          ) : null}
          <InputField
            label={simple.supplierCaption} name={simple.supplier} ariaLabel={simple.supplierAria} required
            maxLength={SIMPLE_TEXT_MAX_LENGTH} value={form.supplier} error={errors?.supplier} onChange={(v) => onTouch("supplier", v)}
          />
        </div>
      ) : null}
    </FormPanel>
  );
}

export default memo(SimplePanelView);
