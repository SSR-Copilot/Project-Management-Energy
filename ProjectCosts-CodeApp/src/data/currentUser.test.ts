import { describe, expect, it } from "vitest";
import { badgeScopeFromRoles, languageLabel, ROLE_ALL_COUNTRIES } from "./currentUser";

describe("languageLabel", () => {
  it("UT-CU-001 formats the badge row as `<tag>, [<lang>]`", () => {
    // `$"{gblCurrentUser.Language}, [{gblCurrentUser.Lang}]"` where
    // `Lang = Lower(First(Split(Language(), "-")).Value)` — `en-US, [en]` in the reference shot.
    expect(languageLabel("en-US")).toBe("en-US, [en]");
    expect(languageLabel("de-DE")).toBe("de-DE, [de]");
  });

  it("UT-CU-002 lower-cases only the short half", () => {
    // `Language()` goes in verbatim; only `Lang` is wrapped in `Lower`.
    expect(languageLabel("EN-GB")).toBe("EN-GB, [en]");
  });

  it("UT-CU-003 handles a bare language tag with no region", () => {
    expect(languageLabel("fr")).toBe("fr, [fr]");
  });

  it("UT-CU-004 yields nothing for a missing locale, so the row is omitted", () => {
    expect(languageLabel(undefined)).toBeUndefined();
    expect(languageLabel("   ")).toBeUndefined();
  });
});

/* ------------------------------------------------- the badge's last two rows */

const BU = { fr: "bu-fr", de: "bu-de", none: "bu-none" };
const countries = new Map([[BU.fr, "France"], [BU.de, "Germany"]]);
const role = (roleId: string, name: string, businessUnitId?: string) =>
  ({ roleId, name, ...(businessUnitId ? { businessUnitId } : {}) });

describe("badgeScopeFromRoles", () => {
  it("UT-CU-010 keeps one country PER ROLE, without deduping", () => {
    // `colUserCountries` is a ForAll over the filtered roles, so two qualifying roles in the
    // same business unit produce two entries - the reference badge reads
    // "France; France; Germany;".
    const out = badgeScopeFromRoles([
      role("r1", "VSB - Project Manager Own Projects", BU.fr),
      role("r2", "VSB - Project Data Own Country", BU.fr),
      role("r3", "VSB - Project Data Own Country", BU.de),
    ], countries);
    expect(out.editableCountries).toEqual(["France", "France", "Germany"]);
  });

  it("UT-CU-011 counts a role reached twice only once", () => {
    // `colDistinctCurrentUserTeamsRoles` is distinct over the record, and the same role can
    // arrive both directly and through a team.
    const out = badgeScopeFromRoles([
      role("r1", "VSB - Project Data Own Country", BU.fr),
      role("r1", "VSB - Project Data Own Country", BU.fr),
    ], countries);
    expect(out.editableCountries).toEqual(["France"]);
  });

  it("UT-CU-012 ignores roles whose name does not start with VSB", () => {
    // `colAllCurrentUserRoles` filters both halves on `StartsWith(Name, "VSB")`.
    const out = badgeScopeFromRoles([
      role("r1", "System Administrator", BU.fr),
      role("r2", "Other - Project Data Own Country", BU.de),
    ], countries);
    expect(out.editableCountries).toEqual([]);
    expect(out.isProjectDataAllCountries).toBe(false);
  });

  it("UT-CU-013 drops a qualifying role whose business unit has no country", () => {
    // `Not(IsBlank(Country))` - the LookUp into Countries finds nothing for that unit.
    const out = badgeScopeFromRoles(
      [role("r1", "VSB - Project Data Own Country", BU.none)], countries,
    );
    expect(out.editableCountries).toEqual([]);
  });

  it("UT-CU-014 ignores a VSB role that is not one of the two country roles", () => {
    const out = badgeScopeFromRoles(
      [role("r1", "VSB - Controller Own Data", BU.fr)], countries,
    );
    expect(out.editableCountries).toEqual([]);
  });

  it("UT-CU-015 sets the all-countries flag off the role name alone", () => {
    expect(badgeScopeFromRoles([role("r1", ROLE_ALL_COUNTRIES)], countries)
      .isProjectDataAllCountries).toBe(true);
    expect(badgeScopeFromRoles([role("r1", "VSB - Controller Own Data")], countries)
      .isProjectDataAllCountries).toBe(false);
  });
});
