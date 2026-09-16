import { describe, it, expect } from "vitest";
import {
  unionVsbRoles, deriveCountryScope, buildCurrentUser, canEditSelectedProject,
  canSeeAdminSection, canEditCountry, VSB_ROLES, type RawRole,
} from "./session";

const de = { id: "de", name: "Germany" };
const fr = { id: "fr", name: "France" };
const role = (name: string, country: { id: string; name: string } | null = null, uniqueId = name): RawRole =>
  ({ name, uniqueId, country });

const profile = {
  id: "u1", displayName: "Demo User", mail: "demo.user@vsb.energy",
  companyName: "VSB", language: "de-DE",
};

describe("role resolution", () => {
  it("UT-SES-001 unions direct and team roles", () => {
    const r = unionVsbRoles([role(VSB_ROLES.controllerOwnData)], [role(VSB_ROLES.projectDataAllCountries)]);
    expect(r.map((x) => x.name).sort()).toEqual(
      [VSB_ROLES.controllerOwnData, VSB_ROLES.projectDataAllCountries].sort());
  });
  it("UT-SES-002 drops any role not starting with VSB", () => {
    const r = unionVsbRoles([role("Basic User"), role(VSB_ROLES.controllerOwnData)], []);
    expect(r).toHaveLength(1);
  });
  it("UT-SES-003 de-duplicates a role held both directly and via a team", () => {
    const both = role(VSB_ROLES.projectDataOwnCountry, de);
    expect(unionVsbRoles([both], [both])).toHaveLength(1);
  });
});

describe("country scope", () => {
  it("UT-SES-004 only the two country-scoped roles contribute", () => {
    const scope = deriveCountryScope([
      role(VSB_ROLES.projectDataOwnCountry, de),
      role(VSB_ROLES.projectManagerOwnProjects, fr),
      role(VSB_ROLES.controllerOwnData, { id: "es", name: "Spain" }),
    ]);
    expect(scope.map((c) => c.id).sort()).toEqual(["de", "fr"]);
  });
  it("UT-SES-005 roles with no business-unit country are ignored", () => {
    expect(deriveCountryScope([role(VSB_ROLES.projectDataOwnCountry, null)])).toEqual([]);
  });
  it("UT-SES-006 the same country twice appears once", () => {
    const s = deriveCountryScope([
      role(VSB_ROLES.projectDataOwnCountry, de),
      role(VSB_ROLES.projectManagerOwnProjects, de, "other"),
    ]);
    expect(s).toHaveLength(1);
  });
});

describe("current user flags", () => {
  it("UT-SES-007 flags mirror the role names exactly", () => {
    const u = buildCurrentUser(profile, [
      role(VSB_ROLES.applicationAdministrator),
      role(VSB_ROLES.projectDataOwnCountry, de),
    ]);
    expect(u.isApplicationAdministrator).toBe(true);
    expect(u.isControllerOwnData).toBe(false);
    expect(u.editableCountriesAsString).toBe("Germany");
  });
  it("UT-SES-008 lang is the lowercased language root", () => {
    expect(buildCurrentUser(profile, []).lang).toBe("de");
  });
  it("UT-SES-009 canEditSelectedProject starts false and is set per record", () => {
    expect(buildCurrentUser(profile, []).canEditSelectedProject).toBe(false);
  });
  it("UT-SES-010 the Developers allow-list is matched case-insensitively", () => {
    const dev = buildCurrentUser({ ...profile, mail: "thomas.lorenz@vsb.energy" }, []);
    expect(dev.isDeveloper).toBe(true);
  });
});

describe("per-record edit permission", () => {
  it("UT-SES-011 needs both create on the table and edit on the record", () => {
    expect(canEditSelectedProject(true, true)).toBe(true);
    expect(canEditSelectedProject(true, false)).toBe(false);
    expect(canEditSelectedProject(false, true)).toBe(false);
  });
  it("UT-SES-012 an undefined record privilege coalesces to false", () => {
    expect(canEditSelectedProject(true, undefined)).toBe(false);
  });
});

describe("admin and country gating", () => {
  it("UT-SES-013 admin section needs administrator or controller-own-data", () => {
    expect(canSeeAdminSection({ isApplicationAdministrator: true, isControllerOwnData: false })).toBe(true);
    expect(canSeeAdminSection({ isApplicationAdministrator: false, isControllerOwnData: true })).toBe(true);
    expect(canSeeAdminSection({ isApplicationAdministrator: false, isControllerOwnData: false })).toBe(false);
  });
  it("UT-SES-014 all-countries beats the per-country scope", () => {
    const u = buildCurrentUser(profile, [role(VSB_ROLES.projectDataAllCountries)]);
    expect(canEditCountry(u, "xx")).toBe(true);
  });
  it("UT-SES-015 scoped user can edit only their own countries", () => {
    const u = buildCurrentUser(profile, [role(VSB_ROLES.projectDataOwnCountry, de)]);
    expect(canEditCountry(u, "de")).toBe(true);
    expect(canEditCountry(u, "fr")).toBe(false);
    expect(canEditCountry(u, undefined)).toBe(false);
  });
});
