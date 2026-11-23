/**
 * OPT-29 (B8): the sorts that called `localeCompare(b, locale, options)` per comparison (Land Lease rows, Add Cost from Table
 * contracts, Admin Default Checklists tabs) use a pooled `Intl.Collator`. `localeCompare` with arguments is defined as a
 * collator with those arguments, so the order must be identical: every pair and every sort is compared with the old call, over strings
 * with accents, case, digits, ties and the empty string.
 */
import { describe, expect, it } from "vitest";
import { collator } from "./locale";
import { sortTabs, tabSortKey } from "@/features/admin/admin-default-checklists/rules";

const STRINGS = [
  "", "a", "A", "á", "Á", "à", "b", "B", "ä", "z", "Z", "ß", "ss", "e", "é", "è", "E", "É", "1", "10", "2", "02", "a1", "a10", "a2",
  "Standard", "standard", "Standard Contract", "standard contract", "O&M", "O&M ", "o&m", "Land Lease 1", "Land Lease 10", "Land Lease 2",
  "Überlassung", "Uberlassung", "überlassung", "naïve", "naive", "Naive", "résumé", "resume", "Resume", "İstanbul", "istanbul", "ł", "Ł", "l",
  "x y", "x-y", "x_y", "xy", " x", "x ", "ǅ", "ﬁ", "fi",
];
const OPTIONS: [string | undefined, Intl.CollatorOptions][] = [
  [undefined, { sensitivity: "accent" }], ["en", { sensitivity: "base" }], [undefined, { sensitivity: "base" }],
];

describe("OPT-29 pooled Intl.Collator", () => {
  it("UT-COLLATOR-OPT-001 compare equals localeCompare(locale, options) for every pair, for the three options in use", () => {
    for (const [locale, options] of OPTIONS) {
      const c = collator(locale, options);
      for (const a of STRINGS) for (const b of STRINGS) {
        expect(Math.sign(c.compare(a, b)), `${JSON.stringify(a)} ${JSON.stringify(b)} ${locale} ${JSON.stringify(options)}`).toBe(Math.sign(a.localeCompare(b, locale, options)));
      }
    }
  });

  it("UT-COLLATOR-OPT-002 sorting with the pooled collator gives the same order as the old comparator, ties included (stable)", () => {
    const rows = STRINGS.map((name, i) => ({ name, i, startDate: `2026-0${(i % 9) + 1}-01` }));
    for (const [locale, options] of OPTIONS) {
      const c = collator(locale, options);
      const old = [...rows].sort((a, b) => a.name.localeCompare(b.name, locale, options) || a.startDate.localeCompare(b.startDate));
      const neu = [...rows].sort((a, b) => c.compare(a.name, b.name) || a.startDate.localeCompare(b.startDate));
      expect(neu.map((r) => r.i)).toEqual(old.map((r) => r.i));
    }
  });

  it("UT-COLLATOR-OPT-003 one collator per (locale, options): the same instance is returned, and a different option is another one", () => {
    expect(collator("en", { sensitivity: "base" })).toBe(collator("en", { sensitivity: "base" }));
    expect(collator(undefined, { sensitivity: "base" })).not.toBe(collator(undefined, { sensitivity: "accent" }));
    expect(collator(undefined)).toBe(collator(undefined));
  });

  it("UT-COLLATOR-OPT-004 the Admin Default Checklists tab order is identical to the old comparator (name, then the order key)", () => {
    const tabs = STRINGS.map((name, i) => ({ name, order: String(i % 5) }));
    const old = [...tabs].sort((x, y) => {
      const byName = x.name.localeCompare(y.name, undefined, { sensitivity: "base" });
      return byName !== 0 ? byName : tabSortKey(x.order) - tabSortKey(y.order);
    });
    expect(sortTabs(tabs)).toEqual(old);
  });
});
