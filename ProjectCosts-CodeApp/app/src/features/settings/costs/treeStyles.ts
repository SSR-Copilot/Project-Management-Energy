/**
 * The tree connector both Costs tables draw in front of a child row (DEVEX cost rows, OPEX later
 * periods): a #0078D4 vertical line at 14 px with a 15 px elbow, stopping at the middle of the
 * last child. One local copy (it was duplicated in `DevexCostTree` and `OpexContractTable`);
 * not a shared component (reusable-components plan, B-CS "Not touched").
 */
import { makeStyles } from "@fluentui/react-components";

export const useTreeStyles = makeStyles({
  connector: {
    position: "relative", paddingLeft: "36px",
    "::before": {
      content: "''", position: "absolute", left: "14px", top: "0", bottom: "0",
      borderLeftWidth: "1px", borderLeftStyle: "solid", borderLeftColor: "#0078D4",
    },
    "::after": {
      content: "''", position: "absolute", left: "14px", top: "50%", width: "15px",
      borderTopWidth: "1px", borderTopStyle: "solid", borderTopColor: "#0078D4",
    },
  },
  connectorLast: { "::before": { bottom: "50%" } },
});
