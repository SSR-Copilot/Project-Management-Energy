/**
 * The one shared standard-assumption style (CONVENTIONS rule 20, product owner 20 Oct 2026).
 *
 * Canvas: wherever a value is tied to an "is standard assumption" condition, the control carries
 * the pair
 *   `FontColor`/`Color: =If(<condition>, ColorValue(gblAppTheme.palette.themePrimary), …)`
 *   `FontItalic`/`Italic: =<condition>`
 * so the value shows in `themePrimary` (#006eb9) and italic while the condition holds, and in the
 * normal label colour, upright, once it is false. The CONDITION is screen-specific and lives in
 * that feature's `rules.ts` (with a test); only the LOOK lives here.
 *
 * Two deliberate canvas variants are kept, because the canvas sets only one half of the pair:
 *  - `"blue"` — `Color` only, no `Italic` (e.g. Revenues' Tariff / Inflation card values, the
 *    CAPEX account labels);
 *  - `"italic"` — `Italic` only, its colour unconditional (e.g. Revenues' Contract End Date
 *    picker, whose `Color` is not conditional).
 *
 * The rule targets the element itself AND a nested `input` / `textarea` / `button` / `td`, so
 * it reaches the real text of a Fluent `Input`, `Textarea`, `Dropdown` or `DatePicker` (whose
 * inner slot sets its own colour — a class on the Fluent root alone never reached the text) and
 * every cell of a table row that sets its own cell colour.
 *
 * Griffel gotcha: never concatenate one of these classes with a plain class name in a string
 * passed to a Fluent component's `className` — use `mergeClasses`, which keeps both.
 */
import { makeStyles } from "@fluentui/react-components";
import { palette } from "@/theme/tokens";

/** Which half of the canvas pair a control carries. `"standard"` is the full pair. */
export type StandardVariant = "standard" | "blue" | "italic";

const blue = { color: palette.themePrimary };
const italic = { fontStyle: "italic" as const };
const both = { ...blue, ...italic };

/**
 * `& input.fui-Input__input` / `& textarea.fui-Textarea__textarea` (specificity 0,2,1) beat a
 * screen's own `& .fui-Input__input { color }` (0,2,0) — Finance's read-only tiles force their
 * value text black that way, which hid the standard blue on them.
 */
const reach = (s: Record<string, string>) => ({
  ...s,
  "& input": s, "& textarea": s, "& button": s, "& td": s,
  "& input.fui-Input__input": s, "& textarea.fui-Textarea__textarea": s,
});

export const useStandardValueStyles = makeStyles({
  standard: reach(both),
  blue: reach(blue),
  italic: reach(italic),
});

/**
 * The `standard` prop the shared field primitives take: `true` = the full pair, a variant name =
 * that half only, `false`/absent = normal.
 */
export type StandardProp = boolean | StandardVariant | null | undefined;

/**
 * `const standardClass = useStandardValueClass();` then
 * `className={mergeClasses(s.value, standardClass(isStandard))}` — `undefined` while the
 * condition is false, so the control keeps its normal colour. Pass a variant as the second
 * argument (or as the value itself) for a control that carries only one half of the pair.
 */
export function useStandardValueClass(): (isStandard: StandardProp, variant?: StandardVariant) => string | undefined {
  const styles = useStandardValueStyles();
  return (isStandard, variant = "standard") =>
    !isStandard ? undefined : styles[isStandard === true ? variant : isStandard];
}
