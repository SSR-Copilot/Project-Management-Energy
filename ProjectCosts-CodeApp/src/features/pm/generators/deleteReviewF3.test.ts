/**
 * Review package F3, rules part: items 2 (no "press again" text when nothing was deleted), 3 (readable nouns for the
 * type rows) and 4 (`ROLLBACK_MSG.totalsFailed` / `maybeLeft`, `ROLLBACK_DETAIL_MAX` moved into rules). Ids UT-GEN-1200 and up.
 */
import { describe, it, expect } from "vitest";
import { ES_PLANT } from "@/data/dataverseNames";
import * as R from "./rules";

const row = (entitySet: string, id: string): R.LandedRowRef => ({ entitySet, id });
const TYPE = ES_PLANT.generatorTypeInProjects;
const ALLOC = "vsb_landleaseallocationwtgs";

describe("F3 item 2: deletePartialMessage says nothing unless something was deleted", () => {
  it("UT-GEN-1200 nothing deleted gives null, whatever was attempted (a 403 must not suggest pressing Delete again)", () => {
    expect(R.deletePartialMessage({ attempted: [row(TYPE, "t1"), row(ALLOC, "a1")], deleted: [] })).toBeNull();
    expect(R.deletePartialMessage({ attempted: [row(TYPE, "t1")], deleted: [], typeName: "WTG 1" })).toBeNull();
  });

  it("UT-GEN-1201 a deleted row that was never attempted does not count as progress", () => {
    expect(R.deletePartialMessage({ attempted: [row(TYPE, "t1")], deleted: [row(ALLOC, "zzz")] })).toBeNull();
  });

  it("UT-GEN-1202 something deleted and something left still tells both halves", () => {
    expect(R.deletePartialMessage({ attempted: [row(TYPE, "t1"), row(ALLOC, "a1")], deleted: [row(ALLOC, "a1")] }))
      .toBe("Removed: 1 land-lease allocation. Not removed: 1 generator type. Press Delete again to finish.");
  });
});

describe("F3 item 3: readable nouns for the type rows", () => {
  const SETS: [string, string, string][] = [
    [ES_PLANT.inverterTypeInProjects, "1 inverter type", "2 inverter types"],
    [ES_PLANT.substructureTypeInProjects, "1 substructure type", "2 substructure types"],
    [ES_PLANT.storageTypeInProjects, "1 BESS row", "2 BESS rows"],
    [ES_PLANT.hydrogenTypeInProjects, "1 hydrogen row", "2 hydrogen rows"],
    [ES_PLANT.substationTypeInProjects, "1 substation row", "2 substation rows"],
  ];

  it.each(SETS)("UT-GEN-1203 deletePartialMessage names %s, singular and plural", (set, one, many) => {
    const done = row(ALLOC, "a1");
    expect(R.deletePartialMessage({ attempted: [done, row(set, "x1")], deleted: [done] }))
      .toBe(`Removed: 1 land-lease allocation. Not removed: ${one}. Press Delete again to finish.`);
    expect(R.deletePartialMessage({ attempted: [done, row(set, "x1"), row(set, "x2")], deleted: [done] }))
      .toBe(`Removed: 1 land-lease allocation. Not removed: ${many}. Press Delete again to finish.`);
  });

  it.each(SETS)("UT-GEN-1204 describeLeftovers / leftoversMessage name %s and do not call it an other row", (set, one) => {
    const d = R.describeLeftovers([row(set, "x1")], {});
    expect(d.other).toBe(0);
    expect(d.total).toBe(1);
    const text = R.leftoversMessage(d);
    expect(text).toContain(`, ${one},`.replace(/,$/, ""));
    expect(text).not.toContain("other row");
  });

  it("UT-GEN-1205 an unknown set is still an other row, listed after the named kinds; the old texts for turbines, allocations, bridge rows and types are unchanged", () => {
    const rows = [
      row("vsb_unknown", "u1"), row(ES_PLANT.substationTypeInProjects, "s1"), row(ES_PLANT.inverterTypeInProjects, "i1"),
      row(ES_PLANT.deviceTypesInProjects, "b1"), row(ES_PLANT.generatorInProjects, "w1"), row(ALLOC, "a1"), row(TYPE, "t1"),
    ];
    expect(R.leftoversMessage(R.describeLeftovers(rows, { typeName: "WTG-7" }))).toBe(
      'This save failed and could not be fully undone. Left behind: generator type "WTG-7", 1 generator, 1 land-lease allocation, '
      + "1 device-type row, 1 inverter type, 1 substation row, 1 other row. Press Retry cleanup to remove them.",
    );
    const done = row(ALLOC, "done");
    expect(R.deletePartialMessage({ attempted: [done, ...rows], deleted: [done] })).toBe(
      "Removed: 1 land-lease allocation. Not removed: 1 generator type, 1 generator, 1 land-lease allocation, "
      + "1 device-type row, 1 inverter type, 1 substation row, 1 other row. Press Delete again to finish.",
    );
  });

  it("UT-GEN-1206 entity set names match case-insensitively; describeLeftovers adds otherKinds only when there are some", () => {
    expect(R.describeLeftovers([row(ES_PLANT.storageTypeInProjects.toUpperCase(), "s1")], {}).otherKinds)
      .toEqual([{ one: "BESS row", many: "BESS rows", count: 1 }]);
    expect(R.describeLeftovers([row("vsb_unknown", "u1")], {})).not.toHaveProperty("otherKinds");
  });
});

describe("F3 item 4: the rollback texts live in rules.ts", () => {
  it("UT-GEN-1207 totalsFailed keeps its wording and ROLLBACK_DETAIL_MAX is 240", () => {
    expect(R.ROLLBACK_MSG.totalsFailed).toBe(
      "The generator rows of the failed save were removed, but the project totals could not be updated. Reload the page and check the generator totals.",
    );
    expect(R.ROLLBACK_DETAIL_MAX).toBe(240);
  });

  it("UT-GEN-1208 maybeLeft says some rows may not have been removed and names the Retry cleanup button", () => {
    expect(R.ROLLBACK_MSG.maybeLeft).toContain("may not have been removed");
    expect(R.ROLLBACK_MSG.maybeLeft).toContain(R.ROLLBACK_MSG.retryButton);
  });
});
