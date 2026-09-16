/**
 * The small field primitives the Cost panels are built from.
 *
 * They wrap the `.canvas-field` / `.canvas-radio-group` rules in `src/styles/canvas.css`,
 * which are transcribed from the canvas panels (grey fill, no border, label above, red `*`).
 * The one place a raw control was NOT the right answer is the dropdown: every other select in
 * the app is a Fluent `Dropdown`, and the client asked for the two remaining `<select>`s to
 * match, so `CostSelect` renders one.
 */
import type { ReactNode } from "react";
import { Button, Dropdown, Option, makeStyles, mergeClasses, tokens } from "@fluentui/react-components";
import { CheckmarkRegular, DismissRegular } from "@fluentui/react-icons";
import { palette } from "@/theme/tokens";

const useStyles = makeStyles({
  /**
   * Fluent's `Dropdown` ships a 250 px `minWidth`, which overflows the panel's left column.
   * `mergeClasses` inside the component keeps the later (ours) of two conflicting atomic
   * classes, so this wins without `!important`.
   */
  dropdown: { minWidth: "0px", width: "100%" },

  /**
   * The panel footer's two constant buttons — `con_GeneratorData_RightPanel_Form_
   * PvModuleType_Buttons_2` (`CapexScreenCode.txt:17323-18044`), `Height: =50`,
   * `LayoutGap: =10`, `PaddingRight: =20`, `LayoutJustifyContent.End`.
   *
   * `makeStyles` rejects shorthands here, so every edge is longhand.
   */
  /** `btn_…_Buttons_Save` — `Icon: ="Checkmark"`, `Text: ="Save"`, `FontSize: =15` (`:17409-17414`). */
  save: { height: "32px", minWidth: "96px", fontSize: "15px" },
  /**
   * `pcf_btn_…_Buttons_Cancel_2` (`:17994-18044`) is a PowerCAT `Icon` button, NOT a Fluent
   * secondary: `FillColor: =white`, `BorderColor`/`FontColor`/`IconColor: =themePrimary`,
   * `IconName: ="Cancel"` (an ✕), `Height: =32`, `Width: =96`. Fluent's own secondary is a
   * grey border with black text, which is what the screenshots show it is not.
   */
  cancel: {
    height: "32px", width: "96px", minWidth: "96px",
    backgroundColor: palette.white, color: palette.themePrimary,
    borderTopColor: palette.themePrimary, borderRightColor: palette.themePrimary,
    borderBottomColor: palette.themePrimary, borderLeftColor: palette.themePrimary,
    fontSize: "15px",
    // `HoverFillColor`/`HoverBorderColor: =hoverButton`, `HoverFontColor: =themePrimary`.
    ":hover": {
      backgroundColor: palette.hoverButton, color: palette.themePrimary,
      borderTopColor: palette.hoverButton, borderRightColor: palette.hoverButton,
      borderBottomColor: palette.hoverButton, borderLeftColor: palette.hoverButton,
    },
  },
  /**
   * `btn_Right_Panel_Add_Contract_Calculate_Allocated_Cost` — `Width: =220`,
   * `BorderRadius: =5`, no icon (`CapexScreenCode.txt:17537-17993`).
   */
  extra: {
    height: "32px", width: "220px", minWidth: "220px",
    borderBottomRightRadius: "5px", borderBottomLeftRadius: "5px",
    borderTopRightRadius: "5px", borderTopLeftRadius: "5px",
    fontSize: "15px", fontWeight: tokens.fontWeightSemibold,
  },

  /**
   * A radio group on `DisplayMode.View` — `Distribution` and `Distribution Scheme` once the
   * panel is opened on an existing contract. `<fieldset disabled>` alone only greys the
   * controls; the canvas greys the text with them. Sampled off the Edit-panel screenshot at
   * #bdbdbd (against #242424 for the live groups beside it).
   */
  choicesDisabled: {
    color: tokens.colorNeutralForegroundDisabled, cursor: "default",
    "& label": { color: tokens.colorNeutralForegroundDisabled },
    "& legend > span": { color: tokens.colorNeutralForegroundDisabled },
  },
});

export function CostField({ label, required, value, onChange, type = "text", disabled = false, error, maxLength, placeholder, children }: {
  label: string; required?: boolean; value?: string | number; onChange?: (value: string) => void;
  type?: string; disabled?: boolean; error?: string; maxLength?: number; placeholder?: string;
  children?: ReactNode;
}) {
  return <label className="canvas-field" data-invalid={error ? true : undefined}><span data-required={required}>{label}</span>
    {children ?? <input type={type} value={value ?? ""} aria-invalid={error ? true : undefined} onChange={e => onChange?.(e.target.value)} disabled={disabled} maxLength={maxLength} placeholder={placeholder} min={type === "number" ? 0 : undefined} step={type === "number" ? "any" : undefined} />}
    {error ? <span className="canvas-field-error" role="alert">{error}</span> : null}
  </label>;
}

/**
 * A labelled Fluent `Dropdown`.
 *
 * NOT wrapped in `CostField`: that renders a `<label>`, and a combobox nested inside its own
 * label swallows the click that should open the listbox. The label is a sibling `<span>` with
 * the same `.canvas-field` styling and an `aria-label` on the control instead.
 */
export function CostSelect({ label, value, options, onChange, required, error }: {
  label: string; value: string | number; options: readonly (string | number)[];
  onChange: (value: string) => void; required?: boolean; error?: string;
}) {
  const styles = useStyles();
  return <div className="canvas-field" data-invalid={error ? true : undefined}>
    <span data-required={required}>{label}</span>
    <Dropdown className={styles.dropdown} aria-label={label} value={String(value)}
      selectedOptions={[String(value)]} appearance="filled-lighter"
      onOptionSelect={(_, d) => { if (d.optionValue !== undefined) onChange(d.optionValue); }}>
      {options.map(option => <Option key={option} value={String(option)}>{String(option)}</Option>)}
    </Dropdown>
    {error ? <span className="canvas-field-error" role="alert">{error}</span> : null}
  </div>;
}

export function Choices({ label, value, options, onChange, required, disabled }: {
  label: string; value: string; options: readonly string[]; onChange: (value: string) => void;
  required?: boolean; disabled?: boolean;
}) {
  const styles = useStyles();
  return <fieldset className={mergeClasses("canvas-radio-group", disabled && styles.choicesDisabled)}
    disabled={disabled} aria-disabled={disabled || undefined}>
    <legend><span data-required={required}>{label}</span></legend>
    {options.map(option => <label key={option}>
      <input type="radio" checked={value === option} onChange={() => onChange(option)} />{option}</label>)}
  </fieldset>;
}

/**
 * The panel footer.
 *
 * `extra` is the slot the DEVEX/CAPEX cost panel puts `Recalculate Allocated Cost` in. The
 * canvas container lists its children Save → (Reset, hidden) → (Save Execute, hidden) →
 * Recalculate Allocated Cost → Cancel (`CapexScreenCode.txt:17345`, `:17415`, `:17444`,
 * `:17537`, `:17994`) and lays them out left-to-right in that order, so the extra action sits
 * BETWEEN Save and Cancel — which is also what the client's screenshot shows. Every other
 * panel passes nothing and keeps the two-button footer it had.
 */
export function PanelButtons({ onSave, onCancel, disabled, extra }: {
  onSave: () => void; onCancel: () => void; disabled?: boolean; extra?: ReactNode;
}) {
  const styles = useStyles();
  return <>
    <Button className={styles.save} appearance="primary" icon={<CheckmarkRegular />}
      onClick={onSave} disabled={disabled}>Save</Button>
    {extra}
    <Button className={styles.cancel} icon={<DismissRegular />} onClick={onCancel}>Cancel</Button>
  </>;
}

/**
 * `btn_Right_Panel_Add_Contract_Calculate_Allocated_Cost` as a control of its own, so the
 * footer slot above stays generic.
 */
export function PanelExtraButton({ label, onClick, disabled }: {
  label: string; onClick: () => void; disabled?: boolean;
}) {
  const styles = useStyles();
  return <Button className={styles.extra} appearance="primary"
    onClick={onClick} disabled={disabled}>{label}</Button>;
}
