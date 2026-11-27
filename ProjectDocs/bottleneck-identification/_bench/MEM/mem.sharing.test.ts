import { appendFileSync, writeFileSync } from "node:fs";
import { describe, it } from "vitest";
import { replaceEqualDeepWithDates } from "../../../../ProjectCosts-CodeApp/src/app/queryStructuralSharing";
import { replaceEqualDeep } from "@tanstack/query-core";

const OUT = "C:/Personal/Code App Mordenization/Project-Management-Energy-WorkDev1-BottleneckOptimization/ProjectDocs/bottleneck-identification/_bench/MEM/mem.sharing.results.txt";
writeFileSync(OUT, "");
const out = (s: string) => appendFileSync(OUT, s + "\n");

const rows = (n: number) => Array.from({ length: n }, (_, i) => ({
  id: `k-${i}`, contractId: `c-${i % 1500}`, year: 2020 + (i % 10), month: 1 + (i % 12), cost: 1000 + i, paid: false, when: new Date(2020, i % 12, 1),
}));
const med = (f: () => unknown) => { f(); const t: number[] = []; for (let i = 0; i < 5; i++) { const a = performance.now(); f(); t.push(performance.now() - a); } t.sort((x, y) => x - y); return t[2]!; };

describe("MEM structural sharing on a large unchanged refetch", () => {
  it("time", { timeout: 120000 }, () => {
    for (const n of [21600, 180000]) {
      const oldData = rows(n);
      const newData = rows(n);
      const mine = med(() => replaceEqualDeepWithDates(oldData, newData));
      const stock = med(() => replaceEqualDeep(oldData, newData));
      const kept = replaceEqualDeepWithDates(oldData, newData) === oldData;
      out(`${n} cost rows (each with a Date): app structuralSharingWithDates ${mine.toFixed(1)} ms (returns cached array: ${kept}) | stock TanStack replaceEqualDeep ${stock.toFixed(1)} ms`);
    }
  });
});
