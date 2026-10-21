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
 * 16 px apart (label end to next icon, the canvas spacing). The first command is pulled 3 px
 * left: a 20 px Fluent icon draws its glyph about 3 px inside its box, so the visible `+` /
 * pencil lands on the row's edge, like the caption text under it.
 *
 * A screen aligns the row by padding its WRAPPER to the content's left edge — never by
 * styling the commands per screen.
 */
export const useCommandRowStyles = makeStyles({
  row: {
    columnGap: "16px",
    "& > button:first-of-type": { marginLeft: "-3px" },
  },
  command: { paddingLeft: 0, paddingRight: 0, minWidth: 0 },
});
