import { describe, expect, it } from "vitest";
import { isOpenableUrl } from "./url";

describe("isOpenableUrl (D157: now shared by the Project Overview links and the header's InfoCenter)", () => {
  it("UT-URL-001 http and https addresses may be opened, in any letter case", () => {
    expect(isOpenableUrl("https://vsb.sharepoint.com/sites/p1")).toBe(true);
    expect(isOpenableUrl("http://intranet/site")).toBe(true);
    expect(isOpenableUrl("HTTPS://VSB.example")).toBe(true);
  });

  it("UT-URL-002 any other scheme, an empty or scheme-less value and garbage may not, and nothing throws", () => {
    for (const bad of ["javascript:alert(1)", "data:text/html,<b>x</b>", "file:///c:/x", "mailto:a@b.c", "", "vsb.example/x", "//vsb.example", "not a url"]) {
      expect(isOpenableUrl(bad), bad).toBe(false);
    }
  });
});
