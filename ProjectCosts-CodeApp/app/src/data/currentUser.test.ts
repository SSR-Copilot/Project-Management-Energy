import { describe, expect, it } from "vitest";
import { languageLabel } from "./currentUser";

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
