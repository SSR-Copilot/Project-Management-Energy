/**
 * Land Lease — the rail destination.
 *
 * Canvas screen: `Land Lease Costs Screen`, 201 controls · 6,299 lines of Power Fx. It used to
 * render the shared `periods/Screen.tsx` with `mode="land"`, on the theory that Land Lease is
 * the OPEX layout plus three columns. It is not: the canvas Land Lease grid has NO
 * `Threshold for EUR/MWh p.a.` and NO `Distribution Frequency` column, orders
 * `Secured` / `Allocation` / `OTP` straight after `Aggregation`, has nine real sub-accounts
 * rather than a synthetic leading group, and edits TWO tables from one panel. The two screens
 * are therefore split; this one is Land Lease's.
 *
 * Every rule it renders is `periods/landLeaseRules.ts`, ported from the canvas with line-level
 * provenance; the data it renders comes through `costRepository()` (`@/data/landLease`) and the
 * hooks in `@/features/costing/useCostBook`, like every other Cost screen.
 */
import LandLeaseScreen from "@/features/periods/LandLeaseScreen";

export default function Screen() {
  return <LandLeaseScreen />;
}
