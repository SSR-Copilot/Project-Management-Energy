/**
 * Styles shared by the two side panels.
 *
 * DIVERGENCE: ONE error colour for both panels (`palette.Error`, #B22727). The canvas uses #B22727
 * in the contract panel and #d20532 in the DEVEX panel (a canvas inconsistency).
 *
 * The inputs are italic `themePrimary`, as the canvas inputs are (e.g.
 * `txt_LandLease_RightPanel_NewEditCost_BodyContent_InflationStartYear_1`: `FontColor: themePrimary`,
 * `FontItalic: true`).
 */
import { makeStyles, tokens } from "@fluentui/react-components";
import { palette } from "@/theme/tokens";

export const useDrawerStyles = makeStyles({
  form: {
    display: "flex", flexDirection: "column", rowGap: "14px",
    paddingTop: "12px", paddingBottom: "12px",
    "& .fui-Label__required": { color: palette.Error },
    "& input, & textarea": { fontStyle: "italic", color: palette.themePrimary },
  },
  columns: {
    display: "grid", gridTemplateColumns: "1fr 1fr", columnGap: "24px", rowGap: "14px",
    "@media (max-width: 640px)": { gridTemplateColumns: "1fr" },
  },
  column: { display: "flex", flexDirection: "column", rowGap: "14px", minWidth: "0" },
  error: { color: palette.Error, fontWeight: tokens.fontWeightSemibold, fontSize: "12px" },
  inline: { display: "flex", columnGap: "12px", alignItems: "flex-end", flexWrap: "wrap" },
  commentBlock: { position: "relative" },
  counter: { position: "absolute", top: "0", right: "0", fontSize: "12px", color: palette.black },
  readOnlyNote: { color: tokens.colorNeutralForeground3, fontSize: "12px" },
});
