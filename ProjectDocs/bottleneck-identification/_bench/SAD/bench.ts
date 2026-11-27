import { buildCapexTree } from "@/features/admin/admin-capex-accounts/rules";
import { buildDevexTree } from "@/features/admin/admin-cost/rules";
import { buildTaskIndex } from "@/features/admin/admin-gates-approvals/rules";
import { buildCapexHierarchy } from "@/data/adminCost";

const t = (label: string, fn: () => unknown, reps = 20) => {
  fn(); // warm
  const s = performance.now();
  for (let i = 0; i < reps; i++) fn();
  console.log(`${label}: ${((performance.now() - s) / reps).toFixed(3)} ms/call`);
};
const id = (p: string, n: number) => `${p}-${String(n).padStart(8, "0")}-0000-0000-000000000000`;

// CAPEX tree: root + 10 categories + 100 accounts + 5000 subaccounts (stress, 5,111 rows)
const rows: any[] = [{ id: id("r", 0), number: "00001", name: "root", order: 0, active: true, parentId: null }];
for (let c = 0; c < 10; c++) rows.push({ id: id("c", c), number: `1${c}`, name: `cat${c}`, order: c, active: true, parentId: id("r", 0) });
for (let a = 0; a < 100; a++) rows.push({ id: id("a", a), number: `2${a}`, name: `acc${a}`, order: a, active: true, parentId: id("c", a % 10) });
for (let s = 0; s < 5000; s++) rows.push({ id: id("s", s), number: `3${s}`, name: `sub${s}`, order: s, active: s % 7 !== 0, parentId: id("a", s % 100) });
t(`buildCapexTree ${rows.length} rows`, () => buildCapexTree(rows));

// Hierarchy + devex tree: 5000 subs, 3000 devex costs
const hrows = rows.map((r) => ({ id: r.id, name: r.name, number: r.number, order: r.order, parentId: r.parentId ?? undefined }));
t(`buildCapexHierarchy ${hrows.length} rows`, () => buildCapexHierarchy(hrows));
const hier = buildCapexHierarchy(hrows);
const costs: any[] = [];
for (let i = 0; i < 3000; i++) {
  const s = hier.subaccounts[i % hier.subaccounts.length]!;
  costs.push({ id: id("d", i), description: `d${i}`, descriptionInput: `d${i}`, clusters: [true, false, true, false, true], costAmount: i, unit: 1, costPaidBy: 1, comment: i % 3 ? "x" : "", countryId: "c", technology: 1, categoryId: s.categoryId, subaccountId: s.id });
}
t(`buildDevexTree ${costs.length} costs`, () => buildDevexTree(costs, hier));

// Gates task index: 250 checklists, 250 approvals, repeated per call
const checklists: any[] = [], approvals: any[] = [];
for (let i = 0; i < 250; i++) {
  checklists.push({ id: id("k", i), name: `t${i}`, order: i, stateId: id("st", i % 6), active: true, toDelete: false });
  approvals.push({ id: id("p", i), checklistId: id("k", i), name: "", mode: 1, gateActive: true, pmId: null, contributors: null, approvers: null, notifications: null });
}
t("buildTaskIndex 250+250", () => buildTaskIndex({ checklists, approvals } as any));
