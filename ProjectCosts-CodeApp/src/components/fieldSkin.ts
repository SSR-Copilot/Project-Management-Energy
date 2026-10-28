/**
 * The shared MODERN FIELD SKIN (product owner, 20 Oct 2026, D25) — see `Fields.tsx`. Kept in its
 * own module so `Fields.tsx` exports components only (fast refresh), and so screen-local `Field` +
 * `Dropdown` / `Combobox` pairs can wear the same skin (rule 17).
 */
import { makeStyles, mergeClasses, tokens } from "@fluentui/react-components";
import { palette } from "@/theme/tokens";

/** The canvas `DisplayMode` of a control: `Edit`, `View` (read-only, normal text) or `Disabled`. */
export type FieldDisplayMode = "edit" | "view" | "disabled";

/** The Fluent appearance that matches the canvas modern controls' filled box. */
export const FIELD_APPEARANCE = "filled-darker" as const;

const noBorder = {
  borderTopColor: "transparent", borderRightColor: "transparent",
  borderBottomColor: "transparent", borderLeftColor: "transparent",
};

/**
 * The shared modern-control skin. `field` goes on a Fluent `Field` (caption row), `control` on the
 * `Input` / `Textarea` / `Dropdown` / `Combobox` root, plus `view` / `disabled` for those modes and
 * `right` for an `Align.Right` input. Screens with their own `Field` + `Dropdown` pairs use it too,
 * so every modern control looks the same (rule 17).
 */
export const useFieldSkin = makeStyles({
  /** The caption: `*` first (the canvas `lbl_…_Requered` at X 5, before the caption at X 20). */
  field: {
    /*
     * A `Field` is a grid; stretched to a taller row cell, its auto tracks share the spare height,
     * so the box drifted down (+6 px) and grew next to a text input in the same row (PO, 21 Oct
     * 2026: Placement / Basic Information). Pack the caption and the box at the top instead.
     */
    alignContent: "start",
    "& .fui-Field__label": { display: "inline-flex", alignItems: "baseline" },
    "& .fui-Field__label .fui-Label__required": { order: -1, paddingLeft: 0, paddingRight: "4px" },
  },
  /** Filled grey, no outline or underline (the `filled-darker` appearance does the fill). */
  control: { ...noBorder, ":hover": noBorder, ":focus-within": noBorder },
  /** `DisplayMode.View`: the value in normal black text, never the greyed disabled look. */
  view: {
    cursor: "default",
    "& input, & textarea, & button": { color: tokens.colorNeutralForeground1, cursor: "default" },
    // A View-mode box shows no focus underline (nothing to edit), but keeps the focus outline.
    "::after": { content: "unset" },
  },
  /** `DisplayMode.Disabled`: keep the filled box (Fluent drops it to transparent + a grey outline). */
  disabled: {
    backgroundColor: tokens.colorNeutralBackground3,
    ...noBorder,
    "& input, & textarea, & button": { backgroundColor: "transparent" },
  },
  /** `Align: =Align.Right` (e.g. Latitude / Longitude). */
  right: { "& input": { textAlign: "right" } },
});

const clearOutline = {
  borderTopColor: "transparent", borderRightColor: "transparent",
  borderBottomColor: "transparent", borderLeftColor: "transparent",
};

/**
 * Put on a screen root: no red outline on an invalid control. The canvas shows only the error
 * label under a field (`lbl_…_ErrorMessage`); the box itself never turns red, while Fluent's
 * invalid state (`:not(:focus-within)`) paints the border red.
 */
export const useNoInvalidOutline = makeStyles({
  root: {
    "& .fui-Input:not(:focus-within)": clearOutline,
    "& .fui-Input:hover:not(:focus-within)": clearOutline,
    "& .fui-Dropdown:not(:focus-within)": clearOutline,
    "& .fui-Dropdown:hover:not(:focus-within)": clearOutline,
    "& .fui-Combobox:not(:focus-within)": clearOutline,
    "& .fui-Combobox:hover:not(:focus-within)": clearOutline,
    "& .fui-Textarea:not(:focus-within)": clearOutline,
    "& .fui-Textarea:hover:not(:focus-within)": clearOutline,
  },
});

/**
 * Put on a PM screen root: the canvas `lbl_…_Requered` asterisk — a classic `Label@2.5.1`
 * (`Text "*"`, `Color: gblAppColors.Error`, normal weight) in a 16 × 16 box at X 5 / Y 3 of the
 * cell, its default 5-px padding putting the glyph 10 px left of the caption (X 20) and a little
 * above the caption's cap height — not Fluent's semibold asterisk on the caption baseline.
 */
export const useCanvasRequiredMark = makeStyles({
  root: {
    "& .fui-Field .fui-Field__label .fui-Label__required": {
      boxSizing: "border-box", flexShrink: 0,
      width: "15px", marginLeft: "-15px", paddingLeft: "5px", paddingRight: 0,
      position: "relative", top: "-2px",
      fontSize: "14px", fontWeight: 400, lineHeight: 1,
      color: palette.akzent5,
    },
  },
});

/** Resolves the legacy `disabled` + `readOnly` props into one canvas display mode. */
export function displayModeOf(disabled?: boolean, readOnly?: boolean): FieldDisplayMode {
  if (disabled) return "disabled";
  if (readOnly) return "view";
  return "edit";
}

/** The class list for a control root in the given mode (shared with screen-local fields). */
export function useFieldControlClass(): (mode: FieldDisplayMode, extra?: string, align?: "left" | "right") => string {
  const skin = useFieldSkin();
  return (mode, extra, align) => mergeClasses(
    skin.control,
    mode === "view" && skin.view,
    mode === "disabled" && skin.disabled,
    align === "right" && skin.right,
    extra,
  );
}
