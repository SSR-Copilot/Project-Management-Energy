import { makeStyles } from "@fluentui/react-components";

/**
 * The command-row geometry, shared by `CommandBar` and by the hand-built command rows that
 * dress a canvas `cat_PowerCAT.CommandBar` themselves (OPEX / Land Lease card toolbars,
 * Contracts' payment-target bar, Admin Cost's "Add Contract Type").
 *
 * No leading inset (PO, 21 Oct 2026). On the live canvas every command bar's FIRST icon sits
 * on the left edge of the content under it ("+ Add WTG Type" over "Total Capacity", the
 * Revenue card's "Edit" over "Currency"). Fluent's `Toolbar` pads 4 px 8 px and a medium
 * `Button` adds 12 px either side plus a 96 px minimum width that centres a short label, so
 * the bar used to start 20-35 px to the right and the gaps varied with the label length.
 * Here a command has no horizontal padding or minimum width and the commands sit a fixed
 * 16 px apart (label end to next icon, the canvas spacing).
 *
 * The icon box is 16 px, the PowerCAT (Fluent v8) icon size, not Fluent v9's 20 px (D80,
 * 4 Nov 2026). The parity harness measured the Land Lease bar in both apps: every command was
 * 4 px wider here, so the captions drifted right by 4 px per command (Edit 13 px, Delete 17 px
 * off); with a 16 px box the caption pitch is the canvas's (`textWidth + 40`). The 3 px pull
 * of the first command, which compensated for the glyph inset of a 20 px icon, went with it:
 * the canvas's first icon box (x 239) and caption (x 263) are now met exactly.
 *
 * A screen aligns the row by padding its WRAPPER to the content's left edge — never by
 * styling the commands per screen.
 */
export const useCommandRowStyles = makeStyles({
  row: { columnGap: "16px" },
  command: {
    paddingLeft: 0, paddingRight: 0, minWidth: 0,
    "& .fui-Button__icon": { fontSize: "16px", width: "16px", height: "16px" },
  },
});
