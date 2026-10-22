/**
 * The canvas "Apply to All" bar (`con_AdminContract_ApplyAll_Inner_Warning_Button`, ACS:612-724)
 * and the per-contract "Apply" bar (`con_Apply_Individual_AdminContract`, ACS:1080-1171), drawn
 * DISABLED as the canvas ships them: `btn_AdminContract_ApplyAll.DisplayMode` and
 * `btn_Apply_Individual_AdminContracts.DisplayMode` are `DisplayMode.Disabled`, and their sync
 * call is commented out. The Apply feature itself is not built: no data calls, no writes (D20).
 * The "Apply was made by …" tracking labels (`lbl_AdminContract_Last_Apply_All_Tracking`,
 * `lbl_AdminContract_Info_Individual_AdminContracts_1`) are NOT rendered: their table
 * `Apply and Apply All Trackings` is not registered, so the canvas's empty state is what shows,
 * as on Costs.
 *
 * Local to Contracts on purpose: the Costs `ApplyStrip` has different wording, no fill and no
 * info icon, and its tests stay untouched.
 *
 * DIVERGENCE: the canvas button is plain disabled. Here `DisabledReason` keeps it focusable so a
 * tooltip (`APPLY_NOT_BUILT`, no canvas text) can say why it is unavailable; it still cannot be
 * activated.
 */
import { Button, Text, makeStyles, mergeClasses } from "@fluentui/react-components";
import { CheckmarkFilled, CheckmarkRegular, InfoRegular } from "@fluentui/react-icons";
import { DisabledReason } from "@/components";
import { palette } from "@/theme/tokens";

/** `btn_AdminContract_ApplyAll.Text` — verbatim. */
export const APPLY_ALL_LABEL = "Apply to All";
/** `btn_Apply_Individual_AdminContracts.Text` — verbatim. */
export const APPLY_LABEL = "Apply";
/** `lbl_AdminContract_ApplyAll_Info.Text` — verbatim. */
export const APPLY_ALL_INFO =
  "Apply standard contracts to all relevant projects, this will override existing standard assumption contracts";
/** `lbl_AdminContract_Info_Individual_AdminContracts.Text` — verbatim. */
export const APPLY_CONTRACT_INFO =
  "Apply standard cost to relevant projects, this will override existing standard assumption contracts";
/** NEW — no canvas equivalent: the tooltip on the disabled Apply buttons (see DIVERGENCE above). */
export const APPLY_NOT_BUILT =
  "Apply / Apply to All are not available: they are disabled in the canvas app pending a business decision.";

/**
 * `con_AdminContract_ApplyAll_Inner_Warning_Button.Fill` (ACS:647-656) and
 * `con_Apply_Individual_AdminContract.Fill` (`RGBA(237, 244, 248, 1)`, ACS:1080-1100). Canvas
 * literals with no theme token.
 */
export const APPLY_ALL_FILL = "rgba(204, 226, 241, 0.5)";
export const APPLY_CONTRACT_FILL = "#EDF4F8";

const useStyles = makeStyles({
  bar: {
    display: "flex", alignItems: "center", columnGap: "10px",
    paddingLeft: "10px", paddingRight: "15px", boxSizing: "border-box",
  },
  info: { color: palette.Grayscale10, flexShrink: 0, fontSize: "18px", width: "18px", height: "18px" },
  // `#323130` is the canvas label colour; no theme token carries it.
  text: { flexGrow: 1, flexShrink: 1, minWidth: "0", color: "#323130", fontSize: "13px", overflowWrap: "anywhere" },
});

export interface ApplyBarProps {
  fill: string;
  /** Visible button caption. */
  label: string;
  /** The button's accessible name: its visible caption (CONVENTIONS rule 16, never bound data). */
  accessibleName: string;
  infoText: string;
  buttonWidth: number;
  /** Extra layout class from the caller (e.g. `flexGrow`). */
  className?: string;
  /** The bar's `data-testid`: the canvas container name (row-suffixed for a per-contract bar). */
  testId?: string;
  /** The button's `data-testid`: the canvas button name (row-suffixed for a per-contract bar). */
  buttonTestId?: string;
  /** Bar height in px: 45 for the screen bar (ACS:653), 50 for the per-contract bar (ACS:1087). */
  height?: number;
  /** Button icon style: the screen bar is `IconStyle.Filled` (ACS:667), the per-contract bar Outline (ACS:1108). */
  filledIcon?: boolean;
}

export function ApplyBar({
  fill, label, accessibleName, infoText, buttonWidth, className, testId, buttonTestId = "btn_AdminContract_ApplyAll", height = 45, filledIcon = false,
}: ApplyBarProps) {
  const styles = useStyles();
  return (
    <div
      className={mergeClasses(styles.bar, className)} style={{ backgroundColor: fill, minHeight: `${height}px` }}
      data-testid={testId}
    >
      <DisabledReason reason={APPLY_NOT_BUILT}>
        <Button
          appearance="secondary" style={{ width: `${buttonWidth}px`, minWidth: `${buttonWidth}px` }}
          icon={filledIcon ? <CheckmarkFilled /> : <CheckmarkRegular />} aria-label={accessibleName}
          data-testid={buttonTestId}
        >
          {label}
        </Button>
      </DisabledReason>
      <InfoRegular className={styles.info} aria-hidden="true" />
      <Text className={styles.text}>{infoText}</Text>
    </div>
  );
}
