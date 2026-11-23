/**
 * Optimization programme B7, OPT-27(d) (S6-18) and OPT-07c (admin constants): `buildCapexHierarchy` groups the rows by parent once
 * (as `buildCapexTree` does) instead of re-filtering and re-sorting every row for every parent. The OLD implementation is copied
 * below verbatim as the oracle; the counter counts element reads on the rows array (machine independent). Ids: UT-ADCOST-OPT-NNN.
 */
import { describe, expect, it } from "vitest";
import { CAPEX_ROOT_NUMBER as ROOT_FROM_NAMES, OVERLEVERAGING } from "./dataverseNames";
import { CAPEX_ROOT_NUMBER, EXCLUDED_CATEGORY_NAME, buildCapexHierarchy, type CapexListRow } from "./adminCost";
import type { CapexAccount, CapexCategory, CapexHierarchy, CapexSubaccount } from "./adminCost";

/** The OLD `buildCapexHierarchy`, verbatim (oracle). */
function oldBuildCapexHierarchy(rows: readonly CapexListRow[]): CapexHierarchy {
  const byOrder = (a: CapexListRow, b: CapexListRow) =>
    a.order - b.order || a.number.localeCompare(b.number) || a.name.localeCompare(b.name);
  const childrenOf = (parentId: string) => rows.filter((r) => r.parentId === parentId).sort(byOrder);
  const root = rows.find((r) => r.number === "00001");
  if (!root) return { categories: [], accounts: [], subaccounts: [] };
  const categories: CapexCategory[] = [];
  const accounts: CapexAccount[] = [];
  const subaccounts: CapexSubaccount[] = [];
  for (const c of childrenOf(root.id)) {
    if (c.name === "Overleveraging") continue;
    categories.push({ id: c.id, name: c.name, order: c.order });
    for (const a of childrenOf(c.id)) {
      accounts.push({ id: a.id, name: a.name, order: a.order, categoryId: c.id });
      for (const s of childrenOf(a.id)) {
        subaccounts.push({
          id: s.id, name: s.name, number: s.number, order: s.order,
          accountId: a.id, accountName: a.name, accountOrder: a.order,
          categoryId: c.id, categoryOrder: c.order,
          aggregatedName: `${a.name} / ${s.name} ${s.number}`,
        });
      }
    }
  }
  return { categories, accounts, subaccounts };
}

function rng(seed: number) {
  let x = seed >>> 0;
  return () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 2 ** 32; };
}

/** root 00001 -> categories (incl. Overleveraging) -> accounts -> sub-accounts, with tied orders, tied numbers and names, orphans. */
function generate(seed: number, categories = 8, accounts = 6, subs = 5): CapexListRow[] {
  const r = rng(seed);
  const rows: CapexListRow[] = [{ id: "root", name: "CAPEX", number: "00001", order: 0, parentId: undefined }];
  let n = 0;
  const add = (parentId: string | undefined, label: string) => {
    const id = `id-${n++}`;
    rows.push({
      id, parentId, name: r() < 0.3 ? "Same name" : `${label} ${Math.floor(r() * 5)}`,
      number: r() < 0.3 ? "10000" : String(10000 + Math.floor(r() * 90000)), order: Math.floor(r() * 4),
    });
    return id;
  };
  for (let c = 0; c < categories; c += 1) {
    const cat = add("root", "Cat");
    if (c === 2) rows[rows.length - 1]!.name = "Overleveraging";
    for (let a = 0; a < accounts; a += 1) {
      const acc = add(cat, "Acc");
      for (let s = 0; s < subs; s += 1) add(acc, "Sub");
    }
  }
  add("missing-parent", "Orphan");
  add(undefined, "Loose");
  // shuffle so the dataset order is not the tree order
  for (let i = rows.length - 1; i > 1; i -= 1) { const j = 1 + Math.floor(r() * i); [rows[i], rows[j]] = [rows[j]!, rows[i]!]; }
  return rows;
}

describe("OPT-27(d) buildCapexHierarchy groups by parent once", () => {
  it("UT-ADCOST-OPT-001 identical hierarchy to the old per-parent filter + sort over 30 generated charts (ties on order, number, name; orphans; shuffled input)", () => {
    for (let seed = 1; seed <= 30; seed += 1) {
      const rows = generate(seed, 3 + (seed % 7), 2 + (seed % 5), 1 + (seed % 6));
      expect(buildCapexHierarchy(rows)).toEqual(oldBuildCapexHierarchy(rows));
    }
  });

  it("UT-ADCOST-OPT-002 no root row gives the empty hierarchy; the Overleveraging category and its subtree are left out", () => {
    expect(buildCapexHierarchy([])).toEqual({ categories: [], accounts: [], subaccounts: [] });
    const rows = generate(5);
    const h = buildCapexHierarchy(rows);
    expect(h.categories.some((c) => c.name === "Overleveraging")).toBe(false);
    expect(h.categories).toHaveLength(7);
  });

  it("UT-ADCOST-OPT-003 recompute counter: element reads on the rows array (old = rows x parents, new = one pass)", () => {
    const rows = generate(11, 8, 6, 5); // 1 + 8 + 48 + 240 + 2 = 299 rows, 57 parents
    const count = (fn: (r: readonly CapexListRow[]) => unknown) => {
      let reads = 0;
      const proxy = new Proxy(rows, {
        get(target, prop, receiver) {
          if (typeof prop === "string" && /^\d+$/.test(prop)) reads += 1;
          return Reflect.get(target, prop, receiver);
        },
      });
      fn(proxy);
      return reads;
    };
    const old = count(oldBuildCapexHierarchy);
    const now = count(buildCapexHierarchy);
    expect(old).toBeGreaterThan(10 * rows.length); // a full scan per parent
    expect(now).toBeLessThanOrEqual(3 * rows.length); // root lookup + one grouping pass
  });
});

describe("OPT-07c the admin Costs constants are the shared ones", () => {
  it("UT-ADCOST-OPT-004 same values and types as dataverseNames (one definition)", () => {
    expect(CAPEX_ROOT_NUMBER).toBe("00001");
    expect(CAPEX_ROOT_NUMBER).toBe(ROOT_FROM_NAMES);
    expect(EXCLUDED_CATEGORY_NAME).toBe("Overleveraging");
    expect(EXCLUDED_CATEGORY_NAME).toBe(OVERLEVERAGING);
  });
});
