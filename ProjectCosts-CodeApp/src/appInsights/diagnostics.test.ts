import { describe, expect, it } from "vitest";
import { cspAdvice, DEFAULT_INGESTION_ORIGIN, discardMeaning, isIngestionBlocked, parseConnectionString } from "./diagnostics";

const KEY = "11111111-2222-3333-4444-555555555555";
const FULL =
  `InstrumentationKey=${KEY};IngestionEndpoint=https://westeurope-5.in.applicationinsights.azure.com/;` +
  "LiveEndpoint=https://westeurope.livediagnostics.monitor.azure.com/;ApplicationId=99999999-8888-7777-6666-555555555555";

describe("App Insights connection string diagnostics", () => {
  it("UT-AIDIAG-001 reads every field of a full connection string and finds nothing wrong", () => {
    const info = parseConnectionString(FULL);
    expect(info).toEqual({
      instrumentationKey: KEY,
      ingestionEndpoint: "https://westeurope-5.in.applicationinsights.azure.com/",
      liveEndpoint: "https://westeurope.livediagnostics.monitor.azure.com/",
      applicationId: "99999999-8888-7777-6666-555555555555",
      ingestionOrigin: "https://westeurope-5.in.applicationinsights.azure.com",
      problems: [],
    });
  });

  it("UT-AIDIAG-002 a key-only string sends to the SDK default host, and that is not a problem", () => {
    const info = parseConnectionString(`InstrumentationKey=${KEY}`);
    expect(info.ingestionOrigin).toBe(DEFAULT_INGESTION_ORIGIN);
    expect(info.problems).toEqual([]);
  });

  it("UT-AIDIAG-003 flags a value wrapped in quotes", () => {
    expect(parseConnectionString(`"InstrumentationKey=${KEY}"`).problems.join()).toContain("wrapped in quotes");
  });

  it("UT-AIDIAG-004 flags a missing or malformed InstrumentationKey, and an empty field list", () => {
    expect(parseConnectionString("IngestionEndpoint=https://x.example/").problems).toContain("no InstrumentationKey");
    expect(parseConnectionString("InstrumentationKey=abc").problems).toContain("the InstrumentationKey is not a GUID");
    expect(parseConnectionString("garbage").problems).toContain("no InstrumentationKey");
  });

  it("UT-AIDIAG-005 an IngestionEndpoint that is not https falls back to the default host and is flagged", () => {
    for (const bad of ["not a url", "http://westeurope-5.in.applicationinsights.azure.com/"]) {
      const info = parseConnectionString(`InstrumentationKey=${KEY};IngestionEndpoint=${bad}`);
      expect(info.ingestionOrigin).toBe(DEFAULT_INGESTION_ORIGIN);
      expect(info.problems.join()).toContain("IngestionEndpoint is not an https URL");
    }
  });

  it("UT-AIDIAG-006 field names are case-insensitive and keep '=' inside a value", () => {
    const info = parseConnectionString(`instrumentationkey=${KEY};INGESTIONENDPOINT=https://a.example/p?x=1`);
    expect(info.instrumentationKey).toBe(KEY);
    expect(info.ingestionOrigin).toBe("https://a.example");
  });

  it("UT-AIDIAG-007 recognises the browser refusing the ingestion host, and nothing else", () => {
    const origin = "https://westeurope-5.in.applicationinsights.azure.com";
    expect(isIngestionBlocked({ effectiveDirective: "connect-src", blockedURI: `${origin}/v2/track` }, origin)).toBe(true);
    expect(isIngestionBlocked({ effectiveDirective: "connect-src-elem", blockedURI: `${origin.toUpperCase()}/v2/track` }, origin)).toBe(true);
    expect(isIngestionBlocked({ effectiveDirective: "img-src", blockedURI: `${origin}/x` }, origin)).toBe(false);
    expect(isIngestionBlocked({ effectiveDirective: "connect-src", blockedURI: "https://atlas.microsoft.com/map" }, origin)).toBe(false);
    expect(isIngestionBlocked({ effectiveDirective: "connect-src", blockedURI: "inline" }, origin)).toBe(false);
  });

  it("UT-AIDIAG-008 explains a discarded batch by its HTTP status", () => {
    expect(discardMeaning(0)).toContain("Content Security Policy");
    expect(discardMeaning(undefined)).toContain("Content Security Policy");
    expect(discardMeaning(401)).toContain("Local Authentication");
    expect(discardMeaning(403)).toContain("Local Authentication");
    expect(discardMeaning(400)).toContain("InstrumentationKey");
    expect(discardMeaning(404)).toContain("IngestionEndpoint");
    expect(discardMeaning(500)).toBe("HTTP 500");
  });

  it("UT-AIDIAG-009 the CSP advice names the host to allow and where to set it", () => {
    const advice = cspAdvice("https://westeurope-5.in.applicationinsights.azure.com");
    expect(advice).toContain("https://westeurope-5.in.applicationinsights.azure.com");
    expect(advice).toContain("connect-src");
    expect(advice).toContain("Content security policy > App");
  });
});
