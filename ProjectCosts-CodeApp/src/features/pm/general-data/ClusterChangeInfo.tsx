/**
 * The explanation at the top of the Start-Cluster change panel, drawn as the canvas draws it (GD-015).
 *
 * `con_ClusterChange_RightPanel_Info` (live canvas A:7271-7332): a container filled
 * `RGBA(204, 226, 241, 0.75)`, corner radius 3, `Height` and `LayoutMinHeight` 64, holding
 * `ico_ClusterChange_RightPanel_Info` (`Icon.Information`, 16 x 16, `Grayscale10`, X 14, centred
 * vertically) and `lbl_ClusterChange_RightPanel_Info` (Segoe UI semibold, `Size: 9` = 12 px,
 * `RGBA(50, 49, 48, 1)`, X 40, Y 6, `PaddingRight` 8, `Width: Parent.Width - Self.X - 8`).
 * The icon is decorative (`aria-hidden`); the label keeps its canvas test id.
 */
import { makeStyles } from "@fluentui/react-components";
import { InfoRegular } from "@fluentui/react-icons";
import { palette } from "@/theme/tokens";
import { CANVAS_TEXT } from "./pmLayout";

const useStyles = makeStyles({
  box: {
    boxSizing: "border-box", display: "flex", alignItems: "center", columnGap: "10px", minHeight: "64px",
    // X 14 for the icon; the label starts at X 40 = 14 + 16 + 10.
    paddingLeft: "14px", paddingRight: "8px",
    backgroundColor: "rgba(204, 226, 241, 0.75)", borderRadius: "3px",
  },
  icon: { flexShrink: 0, width: "16px", height: "16px", fontSize: "16px", color: palette.Grayscale10 },
  // `Y: 6` from the top and `Height: Parent.Height - 8`: 6 above and 2 below.
  text: { flex: 1, minWidth: 0, alignSelf: "stretch", paddingTop: "6px", paddingBottom: "2px", fontSize: "12px", fontWeight: 600, color: CANVAS_TEXT },
});

export function ClusterChangeInfo({ text }: { text: string }) {
  const s = useStyles();
  return (
    <div className={s.box}>
      <InfoRegular className={s.icon} aria-hidden="true" />
      <span className={s.text} data-testid="lbl_ClusterChange_RightPanel_Info">{text}</span>
    </div>
  );
}
