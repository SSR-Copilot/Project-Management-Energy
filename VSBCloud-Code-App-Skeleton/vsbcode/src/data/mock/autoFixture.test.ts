/**
 * The auto-fixture — demo rows for the 46 entity sets the hand-written seed does not cover.
 *
 * The property that matters most is the NEGATIVE one: it must never invent rows in a
 * hand-seeded table. `capexCosts` coming back empty for a project means that project has no
 * costs, and filling it would hide a real bug behind plausible-looking data.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { dataClient } from "@/platform/dataClient";
import { ES } from "@/data/entities";
import { f } from "@/platform/odata";
import { resetMockDb, isAutoFixtureTable } from "./mockBackend";
import { AUTO_FIXTURE_ROWS, buildAutoFixture, equalityConstraints } from "./autoFixture";

beforeEach(() => resetMockDb());

describe("UT-AUTOFIX — generated demo rows", () => {
  it("UT-AUTOFIX-001 leaves every hand-seeded table alone", () => {
    for (const set of [
      ES.projects, ES.countries, ES.clusterStates, ES.countryAreas, ES.projectStates,
      ES.microsoftEntraIds, ES.generatorTypes, ES.capexCosts, ES.projectRevenues,
      ES.generatorInProjects, ES.energyYields, ES.projectChecklists,
    ]) {
      expect(isAutoFixtureTable(set), `${set} must stay hand-seeded`).toBe(false);
    }
  });

  it("UT-AUTOFIX-002 an empty hand-seeded child table STAYS empty", async () => {
    // The bug this guards: a project with no costs must read as no costs.
    const res = await dataClient.list<Record<string, unknown>>(ES.capexCosts, {
      select: ["vsb_capexcostid", "vsb_costamount"],
      filter: f.guid("_vsb_project_value", "p-does-not-exist"),
      count: true,
    });
    expect(res.rows).toEqual([]);
    expect(res.totalCount).toBe(0);
  });

  it("UT-AUTOFIX-003 fills an unseeded table with 5-10 rows", async () => {
    expect(isAutoFixtureTable(ES.currencies)).toBe(true);
    const res = await dataClient.list<Record<string, unknown>>(ES.currencies, {
      select: ["vsb_currencyid", "vsb_name", "vsb_code"],
      count: true,
    });
    expect(res.rows.length).toBeGreaterThanOrEqual(5);
    expect(res.rows.length).toBeLessThanOrEqual(10);
    expect(res.totalCount).toBe(AUTO_FIXTURE_ROWS);
  });

  it("UT-AUTOFIX-004 returns only the columns asked for, all populated", async () => {
    const select = ["vsb_permitid", "vsb_name", "vsb_submissiondate"];
    const res = await dataClient.list<Record<string, unknown>>(ES.permits, { select });
    for (const row of res.rows) {
      for (const col of select) {
        expect(col in row, `${col} missing`).toBe(true);
        expect(row[col], `${col} is blank`).not.toBeNull();
      }
    }
  });

  it("UT-AUTOFIX-005 generates rows that satisfy the caller's own filter", async () => {
    // Without this a project-scoped read would generate rows and then filter them all away.
    const projectId = "p-001";
    const res = await dataClient.list<Record<string, unknown>>(ES.permits, {
      select: ["vsb_permitid", "vsb_name", "_vsb_projectplanning_value"],
      filter: f.guid("_vsb_projectplanning_value", projectId),
    });
    expect(res.rows.length).toBeGreaterThanOrEqual(5);
    for (const row of res.rows) {
      expect(row["_vsb_projectplanning_value"]).toBe(projectId);
    }
  });

  it("UT-AUTOFIX-006 gives every lookup a FormattedValue sibling", async () => {
    // Grids and dropdowns render the label, never the GUID.
    const res = await dataClient.list<Record<string, unknown>>(ES.revenueSubaccounts, {
      select: ["vsb_revenuesubaccountid", "vsb_name", "_vsb_country_value"],
    });
    for (const row of res.rows) {
      expect(row["_vsb_country_value@OData.Community.Display.V1.FormattedValue"]).toBeTruthy();
    }
  });

  it("UT-AUTOFIX-007 is stable across repeat reads — no growth, no churn", async () => {
    const q = { select: ["vsb_currencyid", "vsb_name"], count: true };
    const a = await dataClient.list<Record<string, unknown>>(ES.currencies, { ...q });
    const b = await dataClient.list<Record<string, unknown>>(ES.currencies, { ...q });
    expect(b.totalCount).toBe(a.totalCount);
    expect(b.rows.map((r) => r.vsb_currencyid)).toEqual(a.rows.map((r) => r.vsb_currencyid));
  });

  it("UT-AUTOFIX-008 reads plain equality clauses, and ignores what it cannot honour", () => {
    expect(equalityConstraints("_vsb_project_value eq p-1")).toEqual({ _vsb_project_value: "p-1" });
    expect(equalityConstraints("vsb_name eq 'Valle d''Aosta'")).toEqual({ vsb_name: "Valle d'Aosta" });
    expect(equalityConstraints("statecode eq 0")).toEqual({ statecode: 0 });
    expect(equalityConstraints("vsb_isactive eq true")).toEqual({ vsb_isactive: true });
    expect(equalityConstraints(null)).toEqual({});
    // `contains` is not an equality, so it contributes nothing.
    expect(equalityConstraints("contains(vsb_name,'ab')")).toEqual({});
  });

  it("UT-AUTOFIX-009 generates nothing without a select — it has no columns to invent", () => {
    expect(buildAutoFixture({ entitySet: "vsb_things", select: [], filter: null, existing: 0 }))
      .toEqual([]);
  });

  it("UT-AUTOFIX-010 stops generating once a table is well populated", () => {
    expect(
      buildAutoFixture({ entitySet: "vsb_things", select: ["vsb_thingid"], filter: null, existing: 999 }),
    ).toEqual([]);
  });

  it("UT-AUTOFIX-011 is deterministic — the same request twice gives the same rows", () => {
    const req = {
      entitySet: "vsb_things", select: ["vsb_thingid", "vsb_name", "vsb_order"],
      filter: null, existing: 0,
    };
    expect(buildAutoFixture(req)).toEqual(buildAutoFixture(req));
  });
});
