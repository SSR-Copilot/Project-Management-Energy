/**
 * Static fixture rows — the Phase 1 data the UI blocks were laid out against, kept as the shared
 * test data for `rules.test.ts` and `Screen.test.tsx`. Not imported by the screen itself.
 */
import type { CapexAccountRow } from "@/data/adminCapexAccounts";

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;

export const IDS = {
  root: id(1),
  wind: id(10), dev: id(11), construction: id(12), overleveraging: id(13), substation: id(14), other: id(15),
  land: id(100), permits: id(101), empty: id(102),
  land1: id(1000), land2: id(1001), land3: id(1002),
  orphan: id(9000), missingParent: id(9999),
} as const;

const row = (
  rowId: string, number: string, name: string, order: number | null, active: boolean, parentId: string | null,
): CapexAccountRow => ({ id: rowId, number, name, order, active, parentId });

/** Deliberately unsorted, with an orphan and a null order. */
export const FIXTURE_ROWS: CapexAccountRow[] = [
  row(IDS.other, "60000", "Other CAPEX", 6, true, IDS.root),
  row(IDS.land2, "80000_2", "Cable", 2, false, IDS.land),
  row(IDS.root, "00001", "CAPEX", 0, true, null),
  row(IDS.dev, "20000", "Development Expenses", 2, true, IDS.root),
  row(IDS.wind, "10000", "Wind Turbine/Panels", 1, true, IDS.root),
  row(IDS.construction, "30000", "Construction Expenses", 3, true, IDS.root),
  row(IDS.overleveraging, "40000", "Overleveraging", 4, false, IDS.root),
  row(IDS.substation, "50000", "Substation/Grid Connection", 5, true, IDS.root),
  row(IDS.permits, "80010", "Permits", 2, false, IDS.dev),
  row(IDS.land, "80000", "Land", 1, true, IDS.dev),
  row(IDS.land1, "80000_1", "Substation", 1, true, IDS.land),
  row(IDS.land3, "80000_3", "Fees", null, true, IDS.land),
  row(IDS.orphan, "99999", "Orphan", 1, true, IDS.missingParent),
];
