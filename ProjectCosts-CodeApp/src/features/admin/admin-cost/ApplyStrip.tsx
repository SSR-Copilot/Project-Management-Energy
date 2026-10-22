/**
 * The canvas "Apply to All" bar (top, ACS:808-955) and the per-section "Apply" strip
 * (ACS:1146-1251), drawn DISABLED exactly as the canvas ships them (`DisplayMode.Disabled`, the
 * sync commented out). No data calls and no tracking writes: what Apply does is an open product
 * decision.
 *
 * DIVERGENCE (D20 / D36 §5): D20 says Apply is not migrated at all; this app draws both bars
 * disabled with their canvas info text, plus a tooltip (`MSG.applyNotBuilt`) the canvas does not
 * have. Not built: the history tag (`lbl_Admin_Cost_Landlease_ApplyToLandlease_ApplyTag_Info`,
 * "dd.mm.yyyy Apply was made by …"), blocked until `vsb_applyandapplyalltracking` is registered,
 * and the `cmp_PopUp_Confirmation_Apply_And_ApplyAll` dialog.
 *
 * Look: a 45 px band filled `RGBA(204, 226, 241, 0.5)`, the button 10 px in (Apply to
 * All is 140 px wide), then a 15 px gap, an 18 px information icon (Grayscale10), 5 px, and the
 * info text at the canvas "Small" size (10 pt = 13.3 px, #323130) — ACS:808-884, 1146-1224.
 * Neither colour has a theme token; both are kept as measured.
 *
 * The shared `DisabledReason` keeps the button focusable (`disabledFocusable`) so the
 * tooltip explaining why it is unavailable can show; it still cannot be activated.
 */
import { Button, Text, makeStyles, mergeClasses } from "@fluentui/react-components";
import { CheckmarkRegular, InfoRegular } from "@fluentui/react-icons";
import { DisabledReason } from "@/components";
import { palette } from "@/theme/tokens";
import { MSG } from "./constants";

const useStyles = makeStyles({
  strip: {
    display: "flex", alignItems: "center", flexWrap: "wrap", rowGap: "4px", boxSizing: "border-box",
    minHeight: "45px", paddingLeft: "10px", paddingRight: "10px", minWidth: "0",
    backgroundColor: "rgba(204, 226, 241, 0.5)",
  },
  /** The section strip shares the row with the command button and fills the rest of it. */
  fill: { flexGrow: 1, flexShrink: 1, flexBasis: "320px" },
  button: { marginRight: "15px" },
  allButton: { minWidth: "140px" },
  icon: { fontSize: "18px", color: palette.Grayscale10, flexShrink: 0, marginRight: "5px" },
  info: { color: "#323130", fontSize: "13.3px", flex: "1 1 200px", minWidth: "0" },
});

export interface ApplyStripProps {
  /** "all" = the top "Apply to All" bar; "section" = the per-section "Apply". */
  scope: "all" | "section";
  /** Section key (`CostCategoryDef.key`): the per-section suffix of the repeated canvas ids. */
  sectionKey?: string;
}

export function ApplyStrip({ scope, sectionKey }: ApplyStripProps) {
  const styles = useStyles();
  if (scope === "all") {
    return (
      // `con_Admin_Cost_LandLease_AddStandardContractType_CommandBar_ApplyButton_1`
      <div className={styles.strip} data-testid="con_Admin_Cost_LandLease_AddStandardContractType_CommandBar_ApplyButton_1">
        <DisabledReason reason={MSG.applyNotBuilt}>
          {/* `btn_Admin_Cost_Landlease_ApplyToLandlease_1` sets no AccessibleLabel: the caption. */}
          <Button
            appearance="secondary"
            className={mergeClasses(styles.button, styles.allButton)}
            icon={<CheckmarkRegular />}
            aria-label="Apply to All"
            data-testid="btn_Admin_Cost_Landlease_ApplyToLandlease_1"
          >
            {MSG.applyToAll}
          </Button>
        </DisabledReason>
        <InfoRegular className={styles.icon} aria-hidden data-testid="icn_Admin_Cost_Landlease_ApplyToLandlease_InfoIcon_1" />
        <Text className={styles.info} data-testid="lbl_Admin_Cost_Landlease_ApplyToLandlease_Info_1">{MSG.applyInfo}</Text>
      </div>
    );
  }
  const key = sectionKey ?? "section";
  return (
    // `con_Admin_Cost_LandLease_AddStandardContractType_CommandBar_ApplyButton` (one per Gallery1 row)
    <div className={mergeClasses(styles.strip, styles.fill)} data-testid={`con_Admin_Cost_LandLease_AddStandardContractType_CommandBar_ApplyButton-${key}`}>
      <DisabledReason reason={MSG.applyNotBuilt}>
        {/* `btn_Admin_Cost_Landlease_ApplyToLandlease.AccessibleLabel` — verbatim (the caption is "Apply"). */}
        <Button
          appearance="secondary"
          className={styles.button}
          icon={<CheckmarkRegular />}
          aria-label="Apply standard costs to all relevant projects, this will override existing standard assumption cost"
          data-testid={`btn_Admin_Cost_Landlease_ApplyToLandlease-${key}`}
        >
          {MSG.apply}
        </Button>
      </DisabledReason>
      <InfoRegular className={styles.icon} aria-hidden data-testid={`icn_Admin_Cost_Landlease_ApplyToLandlease_InfoIcon-${key}`} />
      <Text className={styles.info} data-testid={`lbl_Admin_Cost_Landlease_ApplyToLandlease_Info-${key}`}>{MSG.applyInfo}</Text>
    </div>
  );
}
