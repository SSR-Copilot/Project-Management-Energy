/**
 * A labelled Fluent `Dropdown` in the shared MODERN FIELD SKIN (`fieldSkin.ts`) — the canvas
 * `DropDown@0.0.45` / `ModernDropdown` / `ComboBox@0.0.51` / `ModernCombobox` (single select)
 * as one control. Promoted from General Data's own `ChoiceField` in the modern controls sweep
 * (20 Oct 2026, D35 §6) so every PM screen's dropdowns look the same (rule 17).
 *
 *  - the filled grey box, no outline; the `*` before the caption; the canvas error label under it;
 *  - `readOnly` = canvas `DisplayMode.View` (the value in black, the list never opens, and no
 *    chevron — the canvas shows a View-mode dropdown as plain text in the box);
 *    `disabled` = `DisplayMode.Disabled` (greyed);
 *  - `standard`: the canvas standard-assumption pair via `useStandardValueClass` (rule 20);
 *  - `multiselect` (`SelectMultiple: true`): `values` + `onSelectMany`; the text is the chosen
 *    labels joined with ", ".
 *  - the open list is the canvas one (`canvasList`, single select): one highlighted row, no
 *    check-mark. A screen's own `listboxClassName` replaces it; a multiselect list keeps Fluent's.
 *
 * Identity (rule 16): `testId` is the canvas control name (`data-testid`); `ariaLabel` is the
 * canvas `AccessibleLabel` where it sets one, the caption otherwise. Both gate scripts know it.
 */
import { Dropdown, Field, Option, makeStyles, mergeClasses, tokens } from "@fluentui/react-components";
import { palette } from "@/theme/tokens";
import { FIELD_APPEARANCE, displayModeOf, useFieldControlClass, useFieldSkin } from "./fieldSkin";
import { useStandardValueClass, type StandardProp } from "./standardValue";

/**
 * The highlighted row of the open list. A canvas `DropDown@0.0.45` opens the browser's own select
 * list (1-px #767676 frame, the box's grey behind the rows), so the row is the browser's select
 * highlight whatever the `BasePaletteColor`: #1967d2, sampled under SPV Legal Structure ("GmbH";
 * General Data Y:1600, none set) and under the shareholder entity ("VSB Holding GmbH"; Y:6352,
 * `themePrimary`) beside the panel header's #006eb9, and on a plain `<select>` (UI Screenshots,
 * "Add Cost From Table ... Cost Type"). It is not in the app palette (`App.pa.yaml` Y:12-58).
 */
const CANVAS_LIST_HIGHLIGHT = "#1967d2";
/** A row given back to Fluent's own look (`colorNeutralForeground1` is `palette.neutralPrimary`). */
const notHighlighted = { backgroundColor: "transparent", color: tokens.colorNeutralForeground1 };

const useStyles = makeStyles({
  /**
   * Fluent's `Dropdown` ships a 250-px `minWidth`; the canvas box is its cell's width. The canvas
   * modern dropdown keeps its text on ONE line (`valueText`); Fluent wrapped it and grew the box.
   */
  dropdown: { minWidth: "0px", width: "100%" },
  /*
   * A disabled canvas modern dropdown is NOT the filled grey box (canvas pair, Development Type,
   * 17 Nov 2026): white, a 1-px light-grey outline all round, the text and chevron greyed. That is
   * Fluent's own disabled look, which the shared skin's `disabled` (filled, no border) replaced.
   */
  disabledOutline: {
    backgroundColor: tokens.colorNeutralBackground1,
    borderTopWidth: "1px", borderRightWidth: "1px", borderBottomWidth: "1px", borderLeftWidth: "1px",
    borderTopStyle: "solid", borderRightStyle: "solid", borderBottomStyle: "solid", borderLeftStyle: "solid",
    borderTopColor: tokens.colorNeutralStrokeDisabled, borderRightColor: tokens.colorNeutralStrokeDisabled,
    borderBottomColor: tokens.colorNeutralStrokeDisabled, borderLeftColor: tokens.colorNeutralStrokeDisabled,
    ":hover": {
      borderTopColor: tokens.colorNeutralStrokeDisabled, borderRightColor: tokens.colorNeutralStrokeDisabled,
      borderBottomColor: tokens.colorNeutralStrokeDisabled, borderLeftColor: tokens.colorNeutralStrokeDisabled,
    },
  },
  /*
   * The button is a CSS grid (text, chevron), and its text a bare grid item that overflowed under the
   * chevron; wrapped in this span it is clipped at the chevron's column — plainly, with no "…", as the
   * canvas modern dropdown clips it ("Operating company with infrastruc", General Data, 3 Nov 2026).
   */
  valueText: { minWidth: 0, overflowX: "hidden", textOverflow: "clip", whiteSpace: "nowrap", textAlign: "left" },
  /*
   * The open list as the canvas draws it, every `DropDown@0.0.45` alike (the modern control has no
   * Selection / Hover / Chevron properties): no check-mark, and ONE row highlighted, full width and
   * square, white on CANVAS_LIST_HIGHLIGHT: the selected row, until the pointer or the keyboard is on
   * another row, which then takes it. Text 12 px in, as there. The chevron and the box (filled, a 2-px
   * brand underline while focused) stay Fluent's: the canvas draws them so, open, closed or after a pick.
   */
  canvasList: {
    /*
     * The browser's select frame (canvas pairs, SPV Legal Structure / Project Type, 17 Nov 2026):
     * square, a 1-px #757575 border, no shadow, the box's #f5f5f5 behind the rows (30 px tall),
     * flush under the box. The list is at least the box's width and grows to its longest option,
     * so "Operating company with infrastructure" stays on one line (the style's
     * `width: max-content` replaces Fluent's match-the-target width; this keeps it as a minimum).
     */
    padding: 0, rowGap: 0, borderRadius: 0, boxShadow: "none",
    border: "1px solid #757575", backgroundColor: "#f5f5f5",
    minWidth: "var(--fui-match-target-size)",
    "& .fui-Option": {
      borderRadius: 0, paddingLeft: "12px", paddingRight: "12px", minHeight: "30px",
      whiteSpace: "nowrap",
    },
    "& .fui-Option__checkIcon": { display: "none" },
    "& .fui-Option[aria-selected=\"true\"], & .fui-Option:hover, & .fui-Option[data-activedescendant-focusvisible]": {
      backgroundColor: CANVAS_LIST_HIGHLIGHT, color: palette.white,
    },
    "&:hover .fui-Option[aria-selected=\"true\"]:not(:hover):not([data-activedescendant-focusvisible])": notHighlighted,
    "&:has([data-activedescendant-focusvisible]) .fui-Option[aria-selected=\"true\"]:not([data-activedescendant-focusvisible]):not(:hover)": notHighlighted,
    // The canvas list draws no ring round the highlighted row (Fluent drew a black one on open);
    // the row's fill already marks the keyboard position.
    "& .fui-Option::after": { display: "none" },
    // High contrast drops the fill, so there the selected row gets its check-mark back.
    "@media (forced-colors: active)": { "& .fui-Option__checkIcon": { display: "block" } },
  },
});

export interface ChoiceOption { value: string; label: string }

export interface ChoiceFieldProps {
  /** The caption; "" renders no caption row (a box in a table cell). */
  label: string;
  /** The canvas `AccessibleLabel` (rule 16); the caption when the canvas sets none. */
  ariaLabel?: string;
  testId: string;
  required?: boolean;
  error?: string | null;
  /** Canvas `DisplayMode.Disabled`. */
  disabled?: boolean;
  /** Canvas `DisplayMode.View`. */
  readOnly?: boolean;
  /** The selected value ("" / null = none). */
  value?: string | null;
  /** The shown text when the value is not one of the options (the canvas Default can be). */
  valueLabel?: string;
  options: readonly ChoiceOption[];
  onSelect?: (value: string | null) => void;
  placeholder?: string;
  /** The canvas standard-assumption pair on the selected text (rule 20). */
  standard?: StandardProp;
  /** `SelectMultiple: true`. */
  multiselect?: boolean;
  /** The selected values of a `multiselect` box. */
  values?: readonly string[];
  onSelectMany?: (values: string[]) => void;
  /** Extra class on the `Field`. */
  className?: string;
  /** A screen's own canvas list look; it replaces the shared `canvasList` (Planning's lists). */
  listboxClassName?: string;
}

export function ChoiceField({
  label, ariaLabel, testId, required, error, disabled = false, readOnly, value, valueLabel, options,
  onSelect, placeholder, standard, multiselect, values, onSelectMany, className, listboxClassName,
}: ChoiceFieldProps) {
  const s = useStyles();
  const skin = useFieldSkin();
  const controlClass = useFieldControlClass();
  const standardClass = useStandardValueClass();
  const mode = displayModeOf(disabled, readOnly);
  const view = mode === "view";
  const selected = multiselect ? [...(values ?? [])] : value ? [value] : [];
  const text = multiselect
    ? options.filter((o) => selected.includes(o.value)).map((o) => o.label).join(", ")
    : options.find((o) => o.value === value)?.label ?? valueLabel ?? "";
  return (
    <Field
      className={mergeClasses(skin.field, className)}
      label={label || undefined}
      required={required}
      validationState={error ? "error" : "none"}
      validationMessage={error || undefined}
    >
      <Dropdown
        appearance={FIELD_APPEARANCE}
        className={mergeClasses(s.dropdown, controlClass(mode, standardClass(standard)), mode === "disabled" && s.disabledOutline)}
        aria-label={ariaLabel ?? label}
        aria-readonly={view || undefined}
        data-testid={testId}
        disabled={disabled}
        placeholder={placeholder}
        multiselect={multiselect}
        listbox={listboxClassName || multiselect
          ? { className: listboxClassName }
          : { className: s.canvasList, style: { width: "max-content" } }}
        positioning={{ position: "below", align: "start", offset: 0 }}
        {...(view ? { open: false, expandIcon: null } : {})}
        button={{ children: <span className={s.valueText}>{text || placeholder}</span> }}
        value={text}
        selectedOptions={selected}
        onOptionSelect={(_, d) => {
          if (multiselect) onSelectMany?.(d.selectedOptions);
          else onSelect?.(d.optionValue ?? null);
        }}
      >
        {options.map((o) => <Option key={o.value} value={o.value}>{o.label}</Option>)}
      </Dropdown>
    </Field>
  );
}
