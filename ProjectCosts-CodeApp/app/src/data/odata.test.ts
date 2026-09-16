import { describe, expect, it } from "vitest";
import { quote, guid, eq, lookupEq, and, or, lookupIn, chunk, ACTIVE } from "./odata";

const G1 = "33b9cc79-5b4f-f111-bec6-000d3a3855c2";
const G2 = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

describe("quote", () => {
  it("UT-OD-001 wraps in single quotes", () => {
    expect(quote("Wind Farm")).toBe("'Wind Farm'");
  });

  it("UT-OD-002 doubles an embedded apostrophe", () => {
    // A contract description is user-typed and goes straight into $filter.
    // "O'Brien Wind Farm" unescaped is a 400 at best.
    expect(quote("O'Brien Wind Farm")).toBe("'O''Brien Wind Farm'");
  });

  it("UT-OD-003 handles a string that is only quotes", () => {
    expect(quote("'''")).toBe("''''''''");
  });
});

describe("guid", () => {
  it("UT-OD-004 normalises braces and case", () => {
    expect(guid(`{${G1.toUpperCase()}}`)).toBe(G1);
  });

  it("UT-OD-005 refuses anything that is not a GUID", () => {
    // GUIDs arrive from the deep-link URL, which is untrusted input.
    expect(() => guid("1 or 1 eq 1")).toThrow(/Not a GUID/);
    expect(() => guid("")).toThrow();
    expect(() => guid("33b9cc79-5b4f-f111-bec6")).toThrow();
  });
});

describe("eq and lookupEq", () => {
  it("UT-OD-006 quotes strings and leaves numbers and booleans bare", () => {
    expect(eq("vsb_name", "A'B")).toBe("vsb_name eq 'A''B'");
    expect(eq("vsb_year", 2026)).toBe("vsb_year eq 2026");
    expect(eq("vsb_margin", true)).toBe("vsb_margin eq true");
  });

  it("UT-OD-007 targets the _value form for a lookup", () => {
    expect(lookupEq("vsb_project", G1)).toBe(`_vsb_project_value eq ${G1}`);
  });
});

describe("and / or", () => {
  it("UT-OD-008 parenthesises only when combining", () => {
    expect(and("a eq 1")).toBe("a eq 1");
    expect(and("a eq 1", "b eq 2")).toBe("(a eq 1) and (b eq 2)");
    expect(or("a eq 1", "b eq 2")).toBe("(a eq 1) or (b eq 2)");
  });

  it("UT-OD-009 drops empty, undefined and false clauses", () => {
    // Call sites pass `condition && clause`, so `false` has to be tolerated.
    expect(and("a eq 1", undefined, false, "")).toBe("a eq 1");
  });

  it("UT-OD-009b returns undefined, NOT \"\", when nothing survives", () => {
    // `filter: ""` reaches Dataverse as `$filter=`, which is a 400. `undefined` omits the
    // parameter, and `client.ts` strips the key entirely.
    expect(and(undefined, false)).toBeUndefined();
    expect(and()).toBeUndefined();
    expect(or(undefined, "")).toBeUndefined();
  });
});

describe("lookupIn", () => {
  it("UT-OD-010 expands to an or chain, since Dataverse has no GUID `in`", () => {
    expect(lookupIn("vsb_account", [G1, G2])).toBe(
      `(_vsb_account_value eq ${G1}) or (_vsb_account_value eq ${G2})`,
    );
  });

  it("UT-OD-011 returns undefined for an empty list, not a clause matching everything", () => {
    expect(lookupIn("vsb_account", [])).toBeUndefined();
  });
});

describe("chunk", () => {
  it("UT-OD-012 splits to the requested size and keeps every item", () => {
    const items = Array.from({ length: 95 }, (_, i) => i);
    const out = chunk(items, 40);
    expect(out.map((c) => c.length)).toEqual([40, 40, 15]);
    expect(out.flat()).toEqual(items);
  });

  it("UT-OD-013 returns no chunks for an empty list", () => {
    expect(chunk([], 40)).toEqual([]);
  });
});

describe("ACTIVE", () => {
  it("UT-OD-014 is statecode 0", () => {
    expect(ACTIVE).toBe("statecode eq 0");
  });
});
