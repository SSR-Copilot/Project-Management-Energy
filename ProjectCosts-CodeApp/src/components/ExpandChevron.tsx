/**
 * The expand / collapse chevron of every accordion header and card header — one definition
 * (CONVENTIONS rule 21), so a fold control looks the same on every screen.
 *
 * The reference is the Cost app's Land Lease and OPEX (O&M / Other OPEX) card headers: the canvas
 * `ico_…_CardHeader_Up` / `_Down` is a classic `Icon.ChevronUp` / `ChevronDown` in
 * `gblAppStyles.Icon.Color` (themePrimary, #006eb9), 20 x 18 with a glyph that fills its box.
 * Fluent's chevron draws about 12 px wide inside a 20 px box, so it is scaled up 1.4x to the same
 * visible size. The scale is a transform, so the icon's layout box stays 20 px and nothing around
 * it moves. (Land Lease and OPEX draw the same glyph with a 28 px box and -5 px margins that their
 * header geometry was tuned to; they are the allowed exceptions in `src/test/expandChevrons.test.ts`.)
 *
 * The caller owns the button (its `aria-expanded`, `aria-label`, `data-testid`); this is the glyph.
 */
import { makeStyles, mergeClasses } from "@fluentui/react-components";
import { ChevronDownRegular, ChevronUpRegular } from "@fluentui/react-icons";
import { palette } from "@/theme/tokens";

const useStyles = makeStyles({
  /** `fontSize` pins the svg at 20 px whatever the container's font size; the scale makes it 28 px. */
  glyph: { color: palette.themePrimary, fontSize: "20px", transform: "scale(1.4)", flexShrink: 0 },
});

export interface ExpandChevronProps {
  /** Open shows the up chevron (fold it), closed the down chevron (unfold it). */
  open: boolean;
  className?: string;
}

export function ExpandChevron({ open, className }: ExpandChevronProps) {
  const styles = useStyles();
  const Glyph = open ? ChevronUpRegular : ChevronDownRegular;
  return <Glyph className={mergeClasses(styles.glyph, className)} />;
}
