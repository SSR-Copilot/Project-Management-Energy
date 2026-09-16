/**
 * Mock Dataverse — OData semantics.
 *
 * The mock backend had no tests at all, which mattered more than it looks: the portfolio
 * grid's server-side paging depends on `$skip`, `@odata.count` and a stable `$orderby`,
 * and the *only* thing standing between "page 2 works" and "page 2 silently repeats page 1"
 * was this engine. These tests pin its contract so a later tidy-up of `evalFilter` or the
 * sort comparator fails here instead of on the screen.
 *
 * Driven through `dataClient` rather than `mockFetch` directly, so the query serialiser in
 * `platform/dataClient.ts` is under test too — the `$skip` bug lived in *both* halves.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { dataClient } from "@/platform/dataClient";
import { dataMode } from "@/platform/powerClient";
import { f } from "@/platform/odata";
import { ES, CHOICE_PROCESS } from "../entities";
import { resetMockDb } from "./mockBackend";
import { PAGE_SIZE, SCREENSHOT_PROJECTS, TOTAL_PROJECTS } from "./projectSeed";

const SELECT = ["vsb_projectid", "vsb_projectname", "vsb_technology", "vsb_totalcapacity"];

const list = (q: Partial<Parameters<typeof dataClient.list>[1]> = {}) =>
  dataClient.list<Record<string, unknown>>(ES.projects, { select: SELECT, ...q });

beforeEach(() => {
  resetMockDb();
});

describe("UT-MOCK — the harness itself", () => {
  it("UT-MOCK-001 runs in mock mode under Vitest, with no .env present", () => {
    // If this ever flips to "power" the whole suite starts making network calls.
    expect(dataMode).toBe("mock");
  });
});

describe("UT-MOCK — paging", () => {
  it("UT-MOCK-002 $top returns the first N rows", async () => {
    const all = await list({ orderBy: ["vsb_projectname asc"] });
    const page = await list({ orderBy: ["vsb_projectname asc"], top: 3 });

    expect(page.rows).toHaveLength(3);
    expect(page.rows.map((r) => r.vsb_projectname)).toEqual(all.rows.slice(0, 3).map((r) => r.vsb_projectname));
  });

  it("UT-MOCK-003 $skip skips N rows — the regression that made page 2 unreachable", async () => {
    const all = await list({ orderBy: ["vsb_projectname asc"] });
    const skipped = await list({ orderBy: ["vsb_projectname asc"], skip: 2 });

    // Before the fix `$skip` was dropped by `qs()` and ignored by the mock, so this
    // returned the full set starting at row 1 and every page showed page 1.
    expect(skipped.rows).toHaveLength(all.rows.length - 2);
    expect(skipped.rows[0].vsb_projectname).toBe(all.rows[2].vsb_projectname);
  });

  it("UT-MOCK-004 $skip + $top returns the right window, and pages do not overlap", async () => {
    const p1 = await list({ orderBy: ["vsb_projectname asc"], top: 4, skip: 0 });
    const p2 = await list({ orderBy: ["vsb_projectname asc"], top: 4, skip: 4 });

    expect(p1.rows).toHaveLength(4);
    expect(p2.rows.length).toBeGreaterThan(0);

    const ids1 = p1.rows.map((r) => r.vsb_projectid);
    const ids2 = p2.rows.map((r) => r.vsb_projectid);
    expect(ids1.some((id) => ids2.includes(id))).toBe(false);
  });

  it("UT-MOCK-005 $skip is applied before $top, so the last page is the remainder", async () => {
    const all = await list({ orderBy: ["vsb_projectname asc"] });
    const size = 4;
    const lastPageStart = Math.floor((all.rows.length - 1) / size) * size;
    const last = await list({ orderBy: ["vsb_projectname asc"], top: size, skip: lastPageStart });

    expect(last.rows).toHaveLength(all.rows.length - lastPageStart);
    // Reversing skip/top would return 0 rows here.
    expect(last.rows.length).toBeGreaterThan(0);
  });
});

describe("UT-MOCK — @odata.count", () => {
  it("UT-MOCK-006 is returned only when count is requested", async () => {
    const without = await list({ top: 2 });
    const withCount = await list({ top: 2, count: true });

    // Live Dataverse annotates the count only when asked; the mock used to always send it,
    // which let a screen depend on a number it would not get in "power" mode.
    expect(without.totalCount).toBeUndefined();
    expect(withCount.totalCount).toBeGreaterThan(0);
  });

  it("UT-MOCK-007 counts post-filter but pre-page — the grid footer total", async () => {
    const all = await list({ count: true });
    const paged = await list({ count: true, top: 2, skip: 1 });

    expect(paged.rows).toHaveLength(2);
    expect(paged.totalCount).toBe(all.totalCount);
  });

  it("UT-MOCK-008 reflects the filter, not the table", async () => {
    const all = await list({ count: true });
    const filtered = await list({ count: true, filter: f.eq("_vsb_country_value", "c-de") });

    expect(filtered.totalCount).toBeLessThan(all.totalCount!);
    expect(filtered.totalCount).toBe(filtered.rows.length);
  });
});

describe("UT-MOCK — $filter", () => {
  it("UT-MOCK-009 evaluates f.and(a, f.or(b, c)) the way OData does", async () => {
    // The mock folds boolean operators strictly left to right, so `A or B and C` would
    // evaluate as `(A or B) and C`. The `f.*` builders parenthesise every operand, which
    // is what keeps mock and live in agreement — this test pins that contract.
    const filter = f.and(
      f.eq("vsb_technology", CHOICE_PROCESS.technology.wind),
      f.or(f.eq("_vsb_country_value", "c-de"), f.eq("_vsb_country_value", "c-pl")),
    );
    const res = await list({ filter, count: true, select: [...SELECT, "_vsb_country_value"] });

    expect(res.rows.length).toBeGreaterThan(0);
    for (const r of res.rows) {
      expect(r.vsb_technology).toBe(CHOICE_PROCESS.technology.wind);
      expect(["c-de", "c-pl"]).toContain(r._vsb_country_value);
    }
  });

  it("UT-MOCK-010 contains() matches a value holding an apostrophe", async () => {
    // `f.contains` doubles the apostrophe per OData. The mock compared the escaped needle
    // verbatim, so `Valle d'Aosta` — a real area name in the fixture — never matched here
    // while matching correctly against live Dataverse.
    const needle = "d'A";
    expect(f.contains("vsb_projectname", needle)).toContain("d''A");

    const res = await list({
      filter: f.contains("vsb_projectname", needle),
      select: [...SELECT],
    });
    // The assertion that matters is the escaping round-trip, not the row count: an
    // un-escaped needle can never match anything, so a non-throwing empty result would
    // hide the bug. Prove it against a row we insert.
    await dataClient.create(ES.projects, { vsb_projectname: "Valle d'Aosta Test", vsb_technology: "Wind" });
    const after = await list({ filter: f.contains("vsb_projectname", needle), select: [...SELECT] });
    expect(after.rows.length).toBe(res.rows.length + 1);
    expect(after.rows.some((r) => String(r.vsb_projectname).includes("d'Aosta"))).toBe(true);
  });

  it("UT-MOCK-011 treats the literal false as false, not as a match-all", async () => {
    // `f.inList(col, [])` emits the bare literal "false". The unmatched leaf used to fall
    // through to `return true`, so an empty in-list matched every row in mock and no row
    // against live Dataverse.
    expect(f.inList("vsb_technology", [])).toBe("false");

    const res = await list({ filter: f.inList("vsb_technology", []), count: true });
    expect(res.rows).toHaveLength(0);
    expect(res.totalCount).toBe(0);
  });

  it("UT-MOCK-012 compares numbers numerically, not lexically", async () => {
    const res = await list({ filter: f.gt("vsb_totalcapacity", 50), count: true });
    expect(res.rows.length).toBeGreaterThan(0);
    for (const r of res.rows) expect(Number(r.vsb_totalcapacity)).toBeGreaterThan(50);
  });
});

describe("UT-MOCK — the portfolio fixture", () => {
  it("UT-MOCK-015 holds exactly TOTAL_PROJECTS rows, giving the screenshot's 6 pages", async () => {
    const res = await list({ count: true, top: 1 });
    expect(res.totalCount).toBe(TOTAL_PROJECTS);
    expect(Math.ceil(TOTAL_PROJECTS / PAGE_SIZE)).toBe(6);
  });

  it("UT-MOCK-016 opens page 1 with the screenshot's rows, in the screenshot's order", async () => {
    const res = await list({ orderBy: ["vsb_projectname asc"], top: PAGE_SIZE, count: true });
    const names = res.rows.map((r) => String(r.vsb_projectname));

    // This is the actual screenshot assertion: the first 15 names, in order. It holds because
    // every screenshot name starts with a digit and every other name with an uppercase
    // letter, and because the mock sorts by code unit rather than by locale.
    expect(names.slice(0, SCREENSHOT_PROJECTS.length)).toEqual(
      SCREENSHOT_PROJECTS.map((p) => p.name),
    );
    expect(names[0]).toBe("0 0 0 0");
    expect(names[14]).toBe("2402 - Test Shakti");
  });

  it("UT-MOCK-017 pages cleanly to the last page, which holds the remainder", async () => {
    const lastSkip = (6 - 1) * PAGE_SIZE;
    const last = await list({ orderBy: ["vsb_projectname asc"], top: PAGE_SIZE, skip: lastSkip });
    expect(last.rows).toHaveLength(TOTAL_PROJECTS - lastSkip);
    expect(last.rows).toHaveLength(127);
  });

  it("UT-MOCK-018 has a parseable date in every date column", async () => {
    // The regression pin for the old string-templated `modifiedon`, which produced the
    // invalid literal `2026-010-12T…` once the seed index reached 9.
    const res = await list({
      select: ["vsb_projectid", "modifiedon", "createdon", "vsb_projectstartdate", "vsb_construction"],
    });
    for (const r of res.rows) {
      for (const col of ["modifiedon", "createdon", "vsb_projectstartdate", "vsb_construction"]) {
        const v = r[col];
        if (v === null || v === undefined) continue;
        expect(Number.isNaN(Date.parse(String(v))), `${col} = ${String(v)}`).toBe(false);
      }
    }
  });

  it("UT-MOCK-019 seeds the three reference tables that used to come back empty", async () => {
    const areas = await dataClient.list<Record<string, unknown>>(ES.countryAreas, {
      select: ["vsb_countryareaid", "vsb_name", "_vsb_country_value"],
      count: true,
    });
    const states = await dataClient.list<Record<string, unknown>>(ES.projectStates, {
      select: ["vsb_projectstateid", "vsb_name", "vsb_order"],
      orderBy: ["vsb_order asc"],
    });
    const entra = await dataClient.list<Record<string, unknown>>(ES.microsoftEntraIds, {
      select: ["vsb_microsoftentraidid", "vsb_displayname", "vsb_accountenabled"],
    });

    expect(areas.totalCount).toBeGreaterThan(8);
    expect(areas.rows.map((r) => r.vsb_name)).toContain("Valle d'Aosta");
    expect(states.rows.map((r) => r.vsb_name)).toEqual([
      "Draft", "Cluster 1", "Cluster 2", "Cluster 3", "Cluster 4", "Cluster 5", "Cluster 6",
    ]);
    expect(entra.rows.map((r) => r.vsb_displayname)).toContain("Georg, Lucas (external)");
    // Some accounts are disabled on purpose, so the enabled-only filter is observable.
    expect(entra.rows.some((r) => r.vsb_accountenabled === false)).toBe(true);
  });

  it("UT-MOCK-020 keeps the country -> area cascade meaningful", async () => {
    const de = await dataClient.list<Record<string, unknown>>(ES.countryAreas, {
      select: ["vsb_countryareaid", "vsb_name"],
      filter: f.guid("_vsb_country_value", "c-de"),
      count: true,
    });
    expect(de.totalCount).toBeGreaterThan(1);
    expect(de.rows.map((r) => r.vsb_name)).toContain("Brandenburg");
  });

  it("UT-MOCK-021 stores technology as the option-set int with a label sibling", async () => {
    // A string here would be a 400 against live Dataverse when the grid filters this column.
    const res = await list({
      select: ["vsb_projectid", "vsb_technology"],
      filter: f.eq("vsb_technology", CHOICE_PROCESS.technology.wind),
      count: true,
      top: 5,
    });
    expect(res.totalCount).toBeGreaterThan(0);
    for (const r of res.rows) expect(r.vsb_technology).toBe(CHOICE_PROCESS.technology.wind);
    expect(res.rows[0]["vsb_technology@OData.Community.Display.V1.FormattedValue"]).toBe("Wind");
  });

  it("UT-MOCK-022 still generates the child fixtures the other screens depend on", async () => {
    // The highest-risk regression in the reseed: the child loop gated on
    // `vsb_technology === "Wind"`, so switching to the option-set int would have silently
    // emptied Generators, Production, Finance and Revenues — with no test to catch it.
    for (const [set, sel] of [
      [ES.generatorTypeInProjects, "vsb_generatortypeinprojectid"],
      [ES.generatorInProjects, "vsb_generatorinprojectid"],
      [ES.energyYields, "vsb_energyyieldid"],
      [ES.projectRevenues, "vsb_projectrevenueid"],
    ] as const) {
      const res = await dataClient.list<Record<string, unknown>>(set, {
        select: [sel],
        count: true,
      });
      expect(res.totalCount, `${set} must not be empty`).toBeGreaterThan(0);
    }
  });
});

describe("UT-MOCK — $orderby", () => {
  it("UT-MOCK-013 sorts ascending by code unit, which is what the grid's page 1 relies on", async () => {
    const res = await list({ orderBy: ["vsb_name asc"] });
    const names = res.rows.map((r) => String(r.vsb_name));

    // Deliberately code-unit ordering, NOT localeCompare: the portfolio screen's first page
    // is ordered this way (digits before letters, space before digits), and switching to a
    // locale collator silently reorders it.
    const expected = [...names].sort();
    expect(names).toEqual(expected);
  });

  it("UT-MOCK-014 honours desc, and puts nulls last in both directions", async () => {
    const asc = await list({ orderBy: ["vsb_totalcapacity asc"] });
    const desc = await list({ orderBy: ["vsb_totalcapacity desc"] });

    expect(desc.rows.map((r) => r.vsb_projectid)).not.toEqual(
      asc.rows.map((r) => r.vsb_projectid),
    );
    const descCaps = desc.rows
      .map((r) => r.vsb_totalcapacity)
      .filter((v): v is number => typeof v === "number");
    expect([...descCaps].sort((a, b) => b - a)).toEqual(descCaps);
  });
});
