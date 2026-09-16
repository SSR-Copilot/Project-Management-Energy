import { describe, expect, it } from "vitest";
import { isGuid, normalizeGuid, readProjectId, readProjectLink } from "./powerClient";

const G = "33b9cc79-5b4f-f111-bec6-000d3a3855c2";
const OTHER = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

describe("isGuid / normalizeGuid", () => {
  it("UT-PC-001 accepts a bare GUID and one in braces, any case", () => {
    expect(isGuid(G)).toBe(true);
    expect(isGuid(`{${G.toUpperCase()}}`)).toBe(true);
    expect(normalizeGuid(`{${G.toUpperCase()}}`)).toBe(G);
  });

  it("UT-PC-002 rejects anything else", () => {
    expect(isGuid("")).toBe(false);
    expect(isGuid("1 or 1 eq 1")).toBe(false);
    expect(isGuid("33b9cc79-5b4f-f111-bec6")).toBe(false);
    expect(isGuid(`${G} `)).toBe(false);
    expect(isGuid(`{${G}`)).toBe(false);
    expect(isGuid(`${G}}`)).toBe(false);
  });
});

describe("readProjectId", () => {
  it("UT-PC-003 reads the canvas spelling `projectId`", () => {
    expect(readProjectId({}, `?projectId=${G}`)).toBe(G);
  });

  it("UT-PC-004 is case-insensitive on the key", () => {
    // Deep links get typed and pasted between apps; the canvas app used a capital I.
    expect(readProjectId({}, `?PROJECTID=${G}`)).toBe(G);
    expect(readProjectId({}, `?projectid=${G}`)).toBe(G);
  });

  it("UT-PC-005 accepts the spellings actually in circulation", () => {
    expect(readProjectId({}, `?project_id=${G}`)).toBe(G);
    expect(readProjectId({}, `?projectGuid=${G}`)).toBe(G);
    expect(readProjectId({}, `?id=${G}`)).toBe(G);
  });

  it("UT-PC-006 prefers the host over the frame URL but allows a new route choice", () => {
    // IContext.app.queryParams came from the real launch URL, so it is the authority.
    expect(readProjectId({ projectId: G }, `?projectId=${OTHER}`)).toBe(G);
    expect(readProjectId({ projectId: G }, "", `?projectId=${OTHER}`)).toBe(OTHER);
    expect(readProjectId({ projectId: G }, "", `?projectGuid=${OTHER}`)).toBe(OTHER);
  });

  it("UT-PC-007 merges the outer page URL and the in-hash router search", () => {
    // Under hash routing these are different strings: the play URL puts parameters before
    // the hash, and the in-app project picker writes them inside it.
    expect(readProjectId({}, `?projectId=${G}`, "")).toBe(G);
    expect(readProjectId({}, "", `?projectId=${G}`)).toBe(G);
    // Later sources win, so the picker's choice overrides a stale outer parameter.
    expect(readProjectId({}, `?projectId=${OTHER}`, `?projectId=${G}`)).toBe(G);
  });

  it("UT-PC-008 tolerates undefined and empty search strings", () => {
    expect(readProjectId({}, undefined, "", undefined)).toBeUndefined();
    expect(readProjectId({})).toBeUndefined();
  });

  it("UT-PC-009 ignores a value that is not a GUID rather than passing it to a filter", () => {
    // A junk id must never reach an OData $filter.
    expect(readProjectId({}, "?projectId=1%20or%201%20eq%201")).toBeUndefined();
    expect(readProjectId({ projectId: "not-a-guid" }, "")).toBeUndefined();
  });

  it("UT-PC-010 rejects an invalid explicit ID without opening a different project", () => {
    expect(readProjectId({ projectId: "junk" }, `?projectGuid=${G}`)).toBeUndefined();
    expect(readProjectLink({ projectId: G }, "", "?projectId=junk"))
      .toEqual({ status: "invalid" });
    expect(readProjectLink({}, `?projectId=${G}&projectGuid=${OTHER}`))
      .toEqual({ status: "invalid" });
    expect(readProjectLink({}, "?projectId=")).toEqual({ status: "invalid" });
    expect(readProjectLink({}, "")).toEqual({ status: "missing" });
  });

  it("UT-PC-011 does NOT fall back to the canvas hard-coded test project", () => {
    // App.OnStart substituted GUID("33b9cc79-…") whenever no id was supplied, silently
    // opening one specific project for editing. See docs/01-BUGS-FOUND.md A-2.
    expect(readProjectId({}, "")).toBeUndefined();
  });

  it("UT-PC-012 normalises what it returns", () => {
    expect(readProjectId({}, `?projectId={${G.toUpperCase()}}`)).toBe(G);
  });
});
