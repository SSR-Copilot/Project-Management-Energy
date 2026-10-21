import { describe, it, expect } from "vitest";
import { DEFAULT_LOCALE, browserLocale, isUsableLocale, normaliseLocale } from "./locale";

describe("UT-LOC — a hostile language tag cannot take down the app", () => {
  it("UT-LOC-001 accepts the tags Intl accepts", () => {
    for (const t of ["en-US", "de-DE", "fr", "en", "pl-PL", "ro-RO"]) {
      expect(isUsableLocale(t), t).toBe(true);
    }
  });

  it("UT-LOC-002 rejects the POSIX tag that threw", () => {
    // The actual value from a host with no LANG set. This is the case that broke G-WALK.
    expect(isUsableLocale("en-US@posix")).toBe(false);
    expect(() => new Intl.NumberFormat("en-US@posix")).toThrow();
  });

  it("UT-LOC-003 rejects blank and missing tags", () => {
    expect(isUsableLocale(undefined)).toBe(false);
    expect(isUsableLocale(null)).toBe(false);
    expect(isUsableLocale("")).toBe(false);
  });

  it("UT-LOC-004 keeps the user's own language when it can be repaired", () => {
    // The point of the repair: a German user must not silently get US formatting because
    // their shell exports a POSIX or glibc suffix.
    expect(normaliseLocale("de-DE@euro")).toBe("de-DE");
    expect(normaliseLocale("de_DE.UTF-8")).toBe("de-DE");
    expect(normaliseLocale("fr_FR")).toBe("fr-FR");
    expect(normaliseLocale("en-US@posix")).toBe("en-US");
  });

  it("UT-LOC-005 falls back only when nothing can be salvaged", () => {
    expect(normaliseLocale("!!!")).toBe(DEFAULT_LOCALE);
    expect(normaliseLocale(undefined)).toBe(DEFAULT_LOCALE);
    expect(normaliseLocale("")).toBe(DEFAULT_LOCALE);
  });

  it("UT-LOC-006 leaves a good tag untouched", () => {
    expect(normaliseLocale("pl-PL")).toBe("pl-PL");
    expect(normaliseLocale("en-GB")).toBe("en-GB");
  });

  it("UT-LOC-007 whatever browserLocale returns is safe to give Intl", () => {
    const l = browserLocale();
    expect(isUsableLocale(l)).toBe(true);
    expect(() => new Intl.NumberFormat(l).format(1234.5)).not.toThrow();
    expect(() => new Intl.DateTimeFormat(l).format(new Date())).not.toThrow();
  });
});
