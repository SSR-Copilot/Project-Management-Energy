/**
 * Styles shared by the two side panels.
 *
 * DIVERGENCE: ONE error colour for both panels (`palette.Error`, #B22727). The canvas uses #B22727
 * in the contract panel and #d20532 in the DEVEX panel (a canvas inconsistency).
 *
 * No blanket input colour here: the canvas sets the standard-assumption pair (`FontColor:
 * themePrimary` / `FontItalic: true`) PER CONTROL, so each drawer passes the shared `standard`
 * style (`@/components`, CONVENTIONS rule 20) to exactly the controls that carry it —
 * `devexFieldStandard` / `opexFieldStandard` in `rules.ts` say which.
 */
import { makeStyles, tokens } from "@fluentui/react-components";
import { palette } from "@/theme/tokens";

export const useDrawerStyles = makeStyles({
  form: {
    display: "flex", flexDirection: "column", rowGap: "14px",
    paddingTop: "12px", paddingBottom: "12px",
    "& .fui-Label__required": { color: palette.Error },
  },
  columns: {
    display: "grid", gridTemplateColumns: "1fr 1fr", columnGap: "24px", rowGap: "14px",
    "@media (max-width: 640px)": { gridTemplateColumns: "1fr" },
  },
  column: { display: "flex", flexDirection: "column", rowGap: "14px", minWidth: "0" },
  error: { color: palette.Error, fontWeight: tokens.fontWeightSemibold, fontSize: "12px" },
  inline: { display: "flex", columnGap: "12px", alignItems: "flex-end", flexWrap: "wrap" },
  /**
   * `chk_…_ApplyVat` / `chk_…_Depreciation` (ACS:10140-10170): one under the other, Depreciation at
   * `ApplyVat.Y + ApplyVat.Height + 10`. They had been drawn side by side (user screenshot pair, 23 Nov 2026).
   */
  stack: { display: "flex", flexDirection: "column", alignItems: "flex-start", rowGap: "10px" },
  /**
   * `chk_AdminCost_RightPanel_SelectCluster1…5`: one cluster per line, as the canvas lists them. Fluent's
   * Checkbox is inline-flex, so left in a plain div the short labels ran on (Cluster 2 and 3 shared a line).
   */
  checkList: { display: "flex", flexDirection: "column", alignItems: "flex-start" },
  commentBlock: { position: "relative" },
  counter: { position: "absolute", top: "0", right: "0", fontSize: "12px", color: palette.black },
  readOnlyNote: { color: tokens.colorNeutralForeground3, fontSize: "12px" },
});
