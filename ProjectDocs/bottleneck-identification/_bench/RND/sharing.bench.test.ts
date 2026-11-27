// RND bench 1: CPU cost of the QueryClient-default structuralSharing on an UNCHANGED refetch of N rows.
import { describe, it } from "vitest";
import { replaceEqualDeep } from "../../../../ProjectCosts-CodeApp/node_modules/@tanstack/query-core/build/modern/utils.js";
import { structuralSharingWithDates } from "@/app/queryStructuralSharing";

const mk = (n: number, shift = 0) => Array.from({ length: n }, (_, i) => ({
  id: `00000000-0000-0000-0000-${String(i).padStart(12, "0")}`, name: `Row ${i}`, year: 2020 + (i % 10), month: i % 12,
  cost: i * 1.5 + shift, contractId: `c${i % 50}`, accountId: `a${i % 30}`, paid: i % 3 === 0, comment: null,
  closing: new Date(2025, i % 12, 1), vals: [1, 2, 3],
}));

const time = (f: () => void, reps: number) => {
  f(); // warm-up
  const t = performance.now();
  for (let i = 0; i < reps; i++) f();
  return (performance.now() - t) / reps;
};

describe("structuralSharing cost", () => {
  it("prints", () => {
    const rows: string[] = [];
    for (const n of [1_000, 5_000, 15_000, 25_000]) {
      const a = mk(n); const b = mk(n);
      const reps = n >= 15_000 ? 5 : 20;
      const tanstack = time(() => { replaceEqualDeep(a, b); }, reps);
      const dates = time(() => { structuralSharingWithDates(a, b); }, reps);
      const noDates = (x: any[]) => x.map(({ closing, ...r }) => r);
      const a2 = noDates(a), b2 = noDates(b);
      const dates2 = time(() => { structuralSharingWithDates(a2, b2); }, reps);
      rows.push(`n=${n}  tanstack(replaceEqualDeep, rows w/ Date -> always new)=${tanstack.toFixed(2)}ms  withDates=${dates.toFixed(2)}ms  withDates(no Date field)=${dates2.toFixed(2)}ms`);
    }
    console.log("\n" + rows.join("\n"));
  });
});
