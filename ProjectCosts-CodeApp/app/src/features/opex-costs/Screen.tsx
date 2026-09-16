/**
 * OPEX — Operation & Maintenance and Other OPEX Costs.
 *
 * Canvas screen: `Opex Costs Screen`, 230 controls · 8,940 lines of Power Fx. ONE canvas screen
 * serves BOTH rail items and switches behaviour on the selected rail key, which is why this
 * component takes a `mode`.
 *
 * Land Lease is a SEPARATE canvas screen — `Land Lease Costs Screen`, its own control tree,
 * its own columns in their own order — and no longer shares this one. Everything OPEX lives in
 * `@/features/periods/OpexScreen`; this file exists only so the route table keeps its
 * per-destination entry point.
 */
import OpexScreen from "@/features/periods/OpexScreen";
import type { OpexMode } from "@/features/periods/opexRules";

export interface OpexCostsScreenProps {
  /** `"om"` = Operation & Maintenance · `"other"` = Other OPEX Costs. */
  mode: OpexMode;
}

export default function OpexCostsScreen({ mode }: OpexCostsScreenProps) {
  return <OpexScreen mode={mode} />;
}
