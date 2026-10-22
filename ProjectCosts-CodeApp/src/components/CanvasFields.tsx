/**
 * The canvas field primitives every panel is built from (Cost, Admin and PM screens alike).
 *
 * They wrap the `.canvas-field` / `.canvas-radio-group` rules in `src/styles/canvas.css`,
 * which are transcribed from the canvas panels (grey fill, no border, label above, red `*`).
 * The one place a raw control was NOT the right answer is the dropdown: every other select in
 * the app is a Fluent `Dropdown`, and the client asked for the two remaining `<select>`s to
 * match, so `CostSelect` renders one.
 */
import type { ReactNode } from "react";
import { Button, Dropdown, Option, Text, makeStyles, mergeClasses, tokens } from "@fluentui/react-components";
import { CheckmarkRegular, DismissRegular } from "@fluentui/react-icons";
import { useBrandButtonStyles } from "@/theme/buttonStyles";
import { palette } from "@/theme/tokens";
import { useFormPanel } from "./formPanelContext";
import { useStandardValueClass, type StandardProp } from "./standardValue";

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
  /** `look="brand"` (the Application Settings pair): the buttons keep canvas.css's 96 px band chrome. */
  brandButton: { minWidth: "96px" },
  /** `gap={20}`: CAPEX Accounts places Save at `Cancel.X - Self.Width - 20` (CAX:1440); the extra 10 px is a left margin on Cancel. */
  wideGap: { marginLeft: "10px" },
  /** `hint`: left-aligned, grows, overrides the footer's `> *:first-child { margin-left: auto }` (Costs period drawer). */
  hint: {
    flexGrow: 1, flexShrink: 1, flexBasis: "auto",
    marginLeft: "0 !important",
    color: palette.Error, fontSize: "12px",
  },
  /**
   * A disabled PowerCAT `IconType: ActionButton` Save (e.g. the PM Finance panels): no fill, the
   * label in the disabled grey and `IconColor: If(Self.DisplayMode = Disabled, palette.black, …)`.
   */
  saveSubtleDisabled: {
    backgroundColor: "transparent",
    borderTopColor: "transparent", borderRightColor: "transparent",
    borderBottomColor: "transparent", borderLeftColor: "transparent",
    "& .fui-Button__icon": { color: palette.black },
  },
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

/**
 * `counter` is the `{Len}/N` label the canvas puts on the LABEL LINE, right-aligned —
 * `lbl_…_PaymentTarget_Note_Details` is `Align: =Align.Right`, `X: =label.X + label.Width`,
 * `Y: =8`, i.e. beside the caption, not under the box. Same for the contract panel's
 * `Comment  0/255`.
 */
export function CostField({ label, name, required, value, onChange, type = "text", disabled = false, error, maxLength, placeholder, counter, standard, children }: {
  label: string;
  /**
   * The original canvas control's own name (`txt_Screen_Panel_Field_1`), when known — Tosca's
   * prior scans of the canvas app identify a field by this name, not by its caption.
   *
   * Carried on **both** `data-testid` and `aria-label`, so a Tosca module recorded against the
   * canvas app — which keys on `AriaLabel` equal to this name — matches this app unchanged,
   * with no re-record and no per-module property edit.
   *
   * ACCESSIBILITY COST, accepted deliberately: `aria-label` overrides the wrapping caption, so
   * a screen reader announces `"txt_AddContract_RightPanel_Description_1"` rather than
   * "Description" on every mapped field. Sighted users see no change — the caption `<span>` is
   * still rendered and still visible. `ProjectDocs/migration-plans/09-tosca-automation-conventions.md`
   * originally rejected exactly this trade; it was reversed by an explicit product decision to
   * keep the existing Tosca modules working, and that document records the reversal.
   *
   * Falls back to the caption where no canvas name is mapped, so an unmapped field keeps the
   * accessible name it always had.
   */
  name?: string;
  required?: boolean; value?: string | number; onChange?: (value: string) => void;
  type?: string; disabled?: boolean; error?: string; maxLength?: number; placeholder?: string;
  counter?: string;
  /**
   * The canvas standard-assumption pair on the INPUT (not the caption) — CONVENTIONS rule 20;
   * see `standardValue.ts`. Ignored with `children` (style the child control itself).
   */
  standard?: StandardProp;
  children?: ReactNode;
}) {
  const standardClass = useStandardValueClass();
  return <label className="canvas-field" data-invalid={error ? true : undefined}>
    <span data-required={required} data-counter={counter ? true : undefined}>{label}
      {counter ? <em className="canvas-field-counter">{counter}</em> : null}</span>
    {children ?? <input className={standardClass(standard)} type={type} value={value ?? ""} aria-label={name ?? label} data-testid={name} aria-invalid={error ? true : undefined} onChange={e => onChange?.(e.target.value)} disabled={disabled} maxLength={maxLength} placeholder={placeholder} min={type === "number" ? 0 : undefined} step={type === "number" ? "any" : undefined} />}
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
export function CostSelect({ label, value, options, onChange, required, error, testId, standard }: {
  label: string; value: string | number; options: readonly (string | number)[];
  onChange: (value: string) => void; required?: boolean; error?: string;
  /** Tosca identity (`data-testid`) — the canvas control name (`drp_…`) where known. */
  testId?: string;
  /** The canvas standard-assumption pair on the selected value (CONVENTIONS rule 20). */
  standard?: StandardProp;
}) {
  const styles = useStyles();
  const standardClass = useStandardValueClass();
  return <div className="canvas-field" data-invalid={error ? true : undefined}>
    <span data-required={required}>{label}</span>
    <Dropdown className={mergeClasses(styles.dropdown, standardClass(standard))} aria-label={label} data-testid={testId} value={String(value)}
      selectedOptions={[String(value)]} appearance="filled-lighter"
      onOptionSelect={(_, d) => { if (d.optionValue !== undefined) onChange(d.optionValue); }}>
      {options.map(option => <Option key={option} value={String(option)}>{String(option)}</Option>)}
    </Dropdown>
    {error ? <span className="canvas-field-error" role="alert">{error}</span> : null}
  </div>;
}

/**
 * `action` is the slot for a control the canvas parks beside a radio group's caption — the
 * Contracts panel's Reload icon at `X: =90`, 16 px, right of the `Margin` label. An empty
 * `label` renders the group with no caption at all, which is the Margin Type radio: the
 * canvas gives it no `lbl_` of its own, it simply follows the Yes/No group.
 */
export function Choices({ label, name, value, options, onChange, required, disabled, action, ariaLabel, horizontal }: {
  label: string;
  /** The canvas radio GROUP's own name (`rad_Screen_Panel_Field_1`), when known — see `CostField`'s `name`. */
  name?: string;
  value: string; options: readonly string[]; onChange: (value: string) => void;
  required?: boolean; disabled?: boolean; action?: ReactNode;
  /** The group's canvas `AccessibleLabel` when it differs from `name` (CONVENTIONS rule 16); `name` otherwise. */
  ariaLabel?: string;
  /** `Layout: ='RadioGroupCanvas.Layout'.Horizontal` — the options side by side. */
  horizontal?: boolean;
}) {
  const styles = useStyles();
  return <fieldset className={mergeClasses("canvas-radio-group", horizontal && "canvas-radio-horizontal", disabled && styles.choicesDisabled)}
    disabled={disabled} aria-disabled={disabled || undefined}
    /*
     * The canvas name goes on the GROUP, mirroring `data-testid` exactly — not on each radio.
     * Every option sharing one name is the identical-fingerprint collision the live Tosca scan
     * reported as "N items are not unique"; each radio keeps its own option text below.
     */
    aria-label={ariaLabel ?? name ?? (label || undefined)} data-testid={name}>
    {label || action ? <legend><span data-required={required}>{label}</span>{action}</legend> : null}
    {options.map(option => <label key={option}>
      <input type="radio" value={option} checked={value === option} onChange={() => onChange(option)} aria-label={option}
        data-testid={name ? `${name}-${testIdPart(option)}` : undefined} />{option}</label>)}
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
 *
 * The Application Settings panels use the same pair through the optional props below (`look="brand"` etc., or
 * `FormPanel actions`); left out, the output is exactly the canvas pair above.
 */
export interface PanelButtonsProps {
  onSave: () => void;
  /** Default: the enclosing `FormPanel`'s guard (`useFormPanel().requestClose("cancel")`). Pass it outside a panel. */
  onCancel?: () => void;
  /** Disables Save. */
  disabled?: boolean; extra?: ReactNode;
  /** Tosca identities — the canvas `btn_…_Save` / `btn_…_Cancel` names where known. */
  saveTestId?: string; cancelTestId?: string;
  /** The buttons' `aria-label` — the canvas `AccessibleLabel` where it sets one; the caption otherwise. */
  saveLabel?: string; cancelLabel?: string;
  /** The canvas Save button's `Tooltip`, where it sets one. */
  saveTooltip?: string;
  /**
   * A disabled Save renders as a transparent text button with a black ✓ (the PowerCAT
   * `ActionButton` look) instead of Fluent's grey primary. Enabled, it stays primary. `look="canvas"` only.
   */
  subtleWhenDisabled?: boolean;
  /**
   * `"canvas"` (default): the cost / PM panel pair (32 px, 15 px text, the caption is always "Save").
   * `"brand"`: the Application Settings pair — primary Save whose caption is `saveLabel`, and Cancel as the
   * canvas brand outline (white fill, `themePrimary` text and border; hover is Fluent's own outline hover).
   */
  look?: "canvas" | "brand";
  /** A save is running: disables Save and Cancel. Default false. */
  saving?: boolean;
  /** Shown on Save while `saving`. The aria-label stays `saveLabel` (a11y invariant 4). */
  savingLabel?: string;
  /** Left-aligned, `aria-live="polite"`, before the buttons (Costs period drawer). */
  hint?: ReactNode;
  /** `look="brand"`: space between Save and Cancel; default 10 (canvas.css). CAPEX Accounts: 20 (CAX:1440). */
  gap?: 10 | 20;
}

export function PanelButtons({
  onSave, onCancel, disabled, extra, saveTestId = "panel-save", cancelTestId = "panel-cancel", saveLabel = "Save",
  cancelLabel = "Cancel", saveTooltip, subtleWhenDisabled, look = "canvas", saving = false, savingLabel, hint, gap = 10,
}: PanelButtonsProps) {
  const styles = useStyles();
  const brand = useBrandButtonStyles();
  const { requestClose } = useFormPanel();
  const isBrand = look === "brand";
  const subtle = Boolean(!isBrand && subtleWhenDisabled && disabled);
  const saveCaption = saving && savingLabel ? savingLabel : isBrand ? saveLabel : "Save";
  const cancel = onCancel ?? (() => requestClose("cancel"));
  return <>
    {hint ? <Text className={styles.hint} aria-live="polite">{hint}</Text> : null}
    <Button className={isBrand ? styles.brandButton : mergeClasses(styles.save, subtle && styles.saveSubtleDisabled)}
      appearance={subtle ? "subtle" : "primary"} icon={<CheckmarkRegular />}
      onClick={onSave} disabled={saving ? true : disabled} title={saveTooltip} aria-label={saveLabel} data-testid={saveTestId}>{saveCaption}</Button>
    {extra}
    {isBrand
      ? <Button appearance="outline" className={mergeClasses(styles.brandButton, brand.brandOutline, gap === 20 && styles.wideGap)}
        icon={<DismissRegular />} disabled={saving} onClick={() => cancel()} aria-label={cancelLabel} data-testid={cancelTestId}>{cancelLabel}</Button>
      : <PanelCancelButton onCancel={cancel} testId={cancelTestId} label={cancelLabel} {...(saving ? { disabled: true } : {})} />}
  </>;
}

/**
 * The footer's Cancel on its own, for a panel whose canvas footer has no Save (e.g. the PM
 * checklist's cluster history panel). The same control as `PanelButtons`' Cancel.
 */
export function PanelCancelButton({ onCancel, testId = "panel-cancel", label = "Cancel", disabled }: {
  onCancel: () => void;
  /** Tosca identity — the canvas `…_Cancel` name where known. */
  testId?: string;
  /** The canvas `AccessibleLabel` where it sets one; the caption otherwise. */
  label?: string;
  /** Disabled while a save runs (`PanelButtons saving`). Default enabled. */
  disabled?: boolean;
}) {
  const styles = useStyles();
  return <Button className={styles.cancel} icon={<DismissRegular />} onClick={onCancel} disabled={disabled}
    aria-label={label} data-testid={testId}>Cancel</Button>;
}

/**
 * `btn_Right_Panel_Add_Contract_Calculate_Allocated_Cost` as a control of its own, so the
 * footer slot above stays generic.
 */
export function PanelExtraButton({ label, onClick, disabled, testId }: {
  label: string; onClick: () => void; disabled?: boolean;
  /** Tosca identity — the canvas button name where known. */
  testId?: string;
}) {
  const styles = useStyles();
  return <Button className={styles.extra} appearance="primary"
    onClick={onClick} disabled={disabled} aria-label={label} data-testid={testId}>{label}</Button>;
}

/** A stable `data-testid` fragment from configuration text: "By Start and End Date" → "by-start-and-end-date". */
export function testIdPart(text: string): string {
  return text.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
