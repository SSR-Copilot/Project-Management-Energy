/**
 * T2 — the canvas "brand outline" button: white fill, themePrimary text and border.
 *
 * Every Application Settings panel transcribes its PowerCAT Cancel as
 * `FillColor: =white`, `BorderColor` / `FontColor: =themePrimary` (CAX:1448-1460, DCS:1373-1375,
 * ACS:9599-9601, AMS:2641-2653, PGAS:3916-3918, ACO:4018-4020), and the Contracts Add / Apply
 * buttons use the same pair (ACO:574-603). Hover is deliberately NOT overridden: Contracts ships
 * this look today with Fluent's own outline hover, and changing it would be a visual change.
 *
 * `makeStyles` rejects border shorthands, so the four border-colour longhands are spelled out.
 */
import { makeStyles } from "@fluentui/react-components";
import { palette } from "./tokens";

export const useBrandButtonStyles = makeStyles({
  brandOutline: {
    color: palette.themePrimary,
    borderTopColor: palette.themePrimary,
    borderRightColor: palette.themePrimary,
    borderBottomColor: palette.themePrimary,
    borderLeftColor: palette.themePrimary,
  },
});
