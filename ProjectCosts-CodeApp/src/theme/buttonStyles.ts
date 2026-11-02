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

/**
 * The hover and press feedback of a transparent icon / text button in a table row (Edit, Delete,
 * Completion Date, Active …). A transparent Fluent button shows no fill on hover, and the row
 * icons carry their own colour, so nothing at all moved under the pointer: no sign that the icon
 * could be clicked (27 Oct 2026, product owner). The first fill, #F1F1F1, was lost against a white row
 * and a pale card, so it was darkened the same day to #D0D0D0 on hover and #C8C6C4 while pressed.
 *
 * The canvas icons set `HoverFillColor` to transparent (`Admin Project Default Checklists
 * Screen.pa.yaml` L502, L536), so this is an addition: a mid grey fill on hover, a darker one
 * while pressed, and the pointer cursor. Apply it only while the control can act: a busy
 * (`disabled`) or locked (`disabledFocusable`) one must not look clickable.
 */
export const useRowActionStyles = makeStyles({
  interactive: {
    cursor: "pointer",
    ":hover": { backgroundColor: palette.neutralQuaternary },
    ":hover:active": { backgroundColor: palette.neutralTertiaryAlt },
  },
});
