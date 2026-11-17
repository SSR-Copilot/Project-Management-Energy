// @vitest-environment jsdom
/**
 * The REAL Application Insights SDK (no mock), with every network entry point stubbed, to prove what
 * `SDK_CSP_FRIENDLY` does (D122 addendum). A fake SDK cannot show this: the claim is about what the
 * installed SDK 3.4.5 requests and which page events it registers.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SDK_CSP_FRIENDLY } from "./appInsights";

const KEY = "11111111-2222-3333-4444-555555555555";
const CS = `InstrumentationKey=${KEY};IngestionEndpoint=https://ingest.example.invalid/`;
const CDN_CONFIG = "https://js.monitor.azure.com/scripts/b/ai.config.1.cfg.json";

let requested: string[];
let listened: string[];

const urlOf = (input: unknown): string =>
  typeof input === "string" ? input : input instanceof URL ? input.href : String((input as { url?: unknown })?.url ?? input);

beforeEach(() => {
  requested = [];
  listened = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((input: unknown) => {
      requested.push(urlOf(input));
      return Promise.resolve({ ok: true, status: 200, headers: { get: () => null }, json: () => Promise.resolve({}), text: () => Promise.resolve("{}") });
    }),
  );
  class FakeXhr {
    status = 200;
    readyState = 4;
    responseText = "{}";
    open(_method: string, url: string) { requested.push(url); }
    setRequestHeader() {}
    send() {}
    abort() {}
    addEventListener() {}
  }
  vi.stubGlobal("XMLHttpRequest", FakeXhr);
  Object.defineProperty(navigator, "sendBeacon", { configurable: true, value: (url: string) => { requested.push(url); return true; } });
  const add = window.addEventListener.bind(window);
  vi.spyOn(window, "addEventListener").mockImplementation((type: string, ...rest: unknown[]) => {
    listened.push(type);
    return (add as (t: string, ...r: unknown[]) => void)(type, ...rest);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** Starts the real SDK and lets its start-up timers and promises run. */
async function startReal(extra: object): Promise<void> {
  const { ApplicationInsights } = await import("@microsoft/applicationinsights-web");
  const ai = new ApplicationInsights({
    config: { connectionString: CS, disableAjaxTracking: true, disableFetchTracking: true, ...extra },
  });
  ai.loadAppInsights();
  await new Promise((resolve) => setTimeout(resolve, 300));
}

describe("App Insights SDK against a Content Security Policy (real SDK)", () => {
  it("UT-AISDK-001 control: with SDK defaults the SDK asks js.monitor.azure.com for its config and registers `unload`", async () => {
    await startReal({});
    expect(requested).toContain(CDN_CONFIG);
    expect(listened).toContain("unload");
  });

  it("UT-AISDK-002 SDK_CSP_FRIENDLY: no request to js.monitor.azure.com and no `unload` listener", async () => {
    await startReal(SDK_CSP_FRIENDLY);
    expect(requested.filter((u) => u.includes("js.monitor.azure.com"))).toEqual([]);
    expect(listened).not.toContain("unload");
  });

  it("UT-AISDK-003 SDK_CSP_FRIENDLY still leaves the flush-on-leave events registered", async () => {
    await startReal(SDK_CSP_FRIENDLY);
    expect(listened.some((t) => t === "beforeunload" || t === "pagehide" || t === "visibilitychange")).toBe(true);
  });
});
