/**
 * The tree connector both Costs tables draw in front of a child row (DEVEX cost rows, OPEX later
 * periods): `Rectangle1_5` — a 1 px #0078D4 (RGBA(0,120,212)) vertical line at X 16, full height, half height
 * on the last child — and `Rectangle1_6` — the 1 px elbow at X 15, 15 px wide, at mid height (ACS:4400-4455).
 * The label then starts at X 30. One local copy (it was duplicated in `DevexCostTree` and `OpexContractTable`);
 * not a shared component.
 */
import { makeStyles } from "@fluentui/react-components";

export const useTreeStyles = makeStyles({
  connector: {
    position: "relative", paddingLeft: "36px",
    "::before": {
      content: "''", position: "absolute", left: "16px", top: "0", bottom: "0",
      borderLeftWidth: "1px", borderLeftStyle: "solid", borderLeftColor: "#0078D4",
    },
    "::after": {
      content: "''", position: "absolute", left: "15px", top: "50%", width: "15px",
      borderTopWidth: "1px", borderTopStyle: "solid", borderTopColor: "#0078D4",
    },
  },
  connectorLast: { "::before": { bottom: "50%" } },
});
