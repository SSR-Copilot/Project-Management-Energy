/**
 * The canvas "Apply to All" bar (ACS:612-724) and the per-contract "Apply" bar (ACS:1080-1171),
 * drawn DISABLED exactly as the canvas ships them (`DisplayMode.Disabled`, sync commented out).
 * The Apply feature itself is not built: no data calls, no writes. The "Apply was made by …"
 * tracking line is NOT rendered (its table `Apply and Apply All Trackings` is not registered), so
 * the canvas's empty state is what shows, as on Costs.
 *
 * Local to Contracts on purpose: the Costs `ApplyStrip` has different wording, no fill and no
 * info icon, and its tests stay untouched. `DisabledReason` keeps the button focusable so the
 * tooltip explaining why it is unavailable can show; it still cannot be activated.
 */
import { Button, Text, makeStyles, mergeClasses } from "@fluentui/react-components";
import { CheckmarkFilled, CheckmarkRegular, InfoRegular } from "@fluentui/react-icons";
import { DisabledReason } from "@/components";
import { palette } from "@/theme/tokens";

/** Exact canvas strings (ACS:684, 721, 1131, 1171). */
export const APPLY_ALL_LABEL = "Apply to All";
export const APPLY_LABEL = "Apply";
export const APPLY_ALL_INFO =
  "Apply standard contracts to all relevant projects, this will override existing standard assumption contracts";
export const APPLY_CONTRACT_INFO =
  "Apply standard cost to relevant projects, this will override existing standard assumption contracts";
export const APPLY_NOT_BUILT =
  "Apply / Apply to All are not available: they are disabled in the canvas app pending a business decision.";

/** Screen-level bar fill (ACS:647-656) and per-contract bar fill (ACS:1080-1100). */
export const APPLY_ALL_FILL = "rgba(204, 226, 241, 0.5)";
export const APPLY_CONTRACT_FILL = "#EDF4F8";

const useStyles = makeStyles({
  bar: {
    display: "flex", alignItems: "center", columnGap: "10px",
    paddingLeft: "10px", paddingRight: "15px", boxSizing: "border-box",
  },
  info: { color: palette.Grayscale10, flexShrink: 0, fontSize: "18px", width: "18px", height: "18px" },
  text: { flexGrow: 1, flexShrink: 1, minWidth: "0", color: "#323130", fontSize: "13px", overflowWrap: "anywhere" },
});

export interface ApplyBarProps {
  fill: string;
  /** Visible button caption. */
  label: string;
  /** Distinct accessible name ("Apply to All" / "Apply <contract name>"). */
  accessibleName: string;
  infoText: string;
  buttonWidth: number;
  /** Extra layout class from the caller (e.g. `flexGrow`). */
  className?: string;
  testId?: string;
  /** The button's test id (kebab-case; per-contract bars pass a row-suffixed id). */
  buttonTestId?: string;
  /** Bar height in px: 45 for the screen bar (ACS:653), 50 for the per-contract bar (ACS:1087). */
  height?: number;
  /** Button icon style: the screen bar is `IconStyle.Filled` (ACS:667), the per-contract bar Outline (ACS:1108). */
  filledIcon?: boolean;
}

export function ApplyBar({
  fill, label, accessibleName, infoText, buttonWidth, className, testId, buttonTestId = "contracts-apply-button", height = 45, filledIcon = false,
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
