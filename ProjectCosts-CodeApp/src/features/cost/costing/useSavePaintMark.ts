/**
 * P0.1 (measurement only): tells the Add Cost from Table Save timeline that the DEVEX/CAPEX grid
 * has committed a book, so a Save waiting for it ends its client timeline on the next paint
 * (`saveTimeline.ts`); otherwise a no-op.
 *
 * Add Cost from Table is a right panel over the DEVEX/CAPEX screen (D62), so the Save's return is
 * a navigation that may or may not remount that screen. The location key re-runs the effect on
 * every navigation, so the mark fires in both cases, not only on a mount or when `gridShown`
 * flips.
 */
import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { addCostSaveTimeline } from "./saveTimeline";

export function useSavePaintMark(gridShown: boolean): void {
  const { key: locationKey } = useLocation();
  useEffect(() => {
    if (gridShown) addCostSaveTimeline.capexShown();
  }, [gridShown, locationKey]);
}
