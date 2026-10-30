import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearTraces, trace } from "@/platform/telemetry";

interface FakeAi {
  config: unknown;
  loadAppInsights: ReturnType<typeof vi.fn>;
  addTelemetryInitializer: ReturnType<typeof vi.fn>;
  trackPageView: ReturnType<typeof vi.fn>;
  trackEvent: ReturnType<typeof vi.fn>;
  trackTrace: ReturnType<typeof vi.fn>;
  trackException: ReturnType<typeof vi.fn>;
}

const sdk = vi.hoisted(() => ({ instances: [] as FakeAi[], throwOnCreate: false }));

vi.mock("@microsoft/applicationinsights-web", () => ({
  SeverityLevel: { Verbose: 0, Information: 1, Warning: 2, Error: 3, Critical: 4 },
  ApplicationInsights: vi.fn().mockImplementation(function (this: unknown, { config }: { config: unknown }) {
    if (sdk.throwOnCreate) throw new Error("Invalid connection string");
    const instance: FakeAi = {
      config,
      loadAppInsights: vi.fn(), addTelemetryInitializer: vi.fn(), trackPageView: vi.fn(),
      trackEvent: vi.fn(), trackTrace: vi.fn(), trackException: vi.fn(),
    };
    sdk.instances.push(instance);
    return instance;
  }),
}));

import { listenForTraces, resetAppInsightsForTests, startAppInsights, trackMetric } from "./appInsights";

const CS = "InstrumentationKey=00000000-0000-0000-0000-000000000000;IngestionEndpoint=https://westeurope-5.in.applicationinsights.azure.com/";
const LOAD = { type: "sessionLoadSummary", data: { successfulAppLaunch: true, appLoadResult: "optimal", appLoadNonOptimalReason: "other", timeToAppInteractive: 900 } } as const;

beforeEach(() => {
  resetAppInsightsForTests();
  sdk.instances.length = 0;
  sdk.throwOnCreate = false;
  clearTraces();
});

describe("App Insights wiring", () => {
  it("UT-AI-010 stays off when the environment variable is empty or missing", () => {
    startAppInsights("");
    startAppInsights(CS); // only the first answer counts
    trackMetric(LOAD);
    expect(sdk.instances).toHaveLength(0);
    resetAppInsightsForTests();
    startAppInsights(undefined);
    expect(sdk.instances).toHaveLength(0);
  });

  it("UT-AI-011 starts once, without the SDK's own fetch / XHR tracking", () => {
    startAppInsights(CS);
    startAppInsights(CS);
    expect(sdk.instances).toHaveLength(1);
    const ai = sdk.instances[0]!;
    expect(ai.config).toMatchObject({
      connectionString: CS, enableAutoRouteTracking: true, disableAjaxTracking: true, disableFetchTracking: true,
    });
    expect(ai.loadAppInsights).toHaveBeenCalledTimes(1);
    expect(ai.addTelemetryInitializer).toHaveBeenCalledTimes(1);
    expect(ai.trackPageView).toHaveBeenCalledTimes(1);
  });

  it("UT-AI-012 sends a platform metric as a custom event, URL query stripped", () => {
    startAppInsights(CS);
    trackMetric({
      type: "networkRequest",
      data: { url: "https://org.crm4.dynamics.com/api/data/v9.2/vsb_projects?$filter=x", method: "GET", duration: 80, statusCode: 500, responseSize: 10 },
    });
    expect(sdk.instances[0]!.trackEvent).toHaveBeenCalledWith({
      name: "networkRequest",
      properties: { url: "https://org.crm4.dynamics.com/api/data/v9.2/vsb_projects", method: "GET" },
      measurements: { duration: 80, statusCode: 500, responseSize: 10 },
    });
  });

  it("UT-AI-013 forwards trace() entries: a trace, or an exception for an Error", () => {
    listenForTraces();
    startAppInsights(CS);
    const ai = sdk.instances[0]!;
    trace("warning", "GET https://org.crm4.dynamics.com/api/data/v9.2/x?$top=1 slow");
    expect(ai.trackTrace).toHaveBeenCalledWith({ message: "GET https://org.crm4.dynamics.com/api/data/v9.2/x slow", severityLevel: 2 });
    trace("error", "Save failed", new TypeError("bad value"));
    const [payload, props] = ai.trackException.mock.calls[0]!;
    expect(payload.exception).toBeInstanceOf(Error);
    expect(payload.exception.name).toBe("TypeError");
    expect(payload.exception.message).toBe("bad value");
    expect(payload.severityLevel).toBe(3);
    expect(props).toEqual({ message: "Save failed" });
  });

  it("UT-AI-014 a failing SDK start leaves the app running with telemetry off", () => {
    sdk.throwOnCreate = true;
    expect(() => startAppInsights(CS)).not.toThrow();
    expect(() => trackMetric(LOAD)).not.toThrow();
  });

  it("UT-AI-015 names a page view after its screen, not the document title", () => {
    startAppInsights(CS);
    const scrub = sdk.instances[0]!.addTelemetryInitializer.mock.calls[0]![0] as (item: unknown) => void;
    const item = {
      baseType: "PageviewData",
      baseData: { name: "Project Costs", uri: "https://apps.powerapps.com/play/x#/project/team?projectId=p-1" },
    };
    scrub(item);
    expect(item.baseData).toEqual({ name: "Project - Project Team", uri: "https://apps.powerapps.com/play/x#/project/team" });
  });

  it("UT-AI-016 queues what arrives before the environment variable and sends it on start", () => {
    listenForTraces();
    trackMetric(LOAD);
    trace("error", "early failure");
    expect(sdk.instances).toHaveLength(0);
    startAppInsights(CS);
    const ai = sdk.instances[0]!;
    expect(ai.trackEvent).toHaveBeenCalledWith(expect.objectContaining({ name: "sessionLoadSummary", measurements: { timeToAppInteractive: 900 } }));
    expect(ai.trackTrace).toHaveBeenCalledWith({ message: "early failure", severityLevel: 3 });
  });

  it("UT-AI-017 drops the queue when the environment variable is empty", () => {
    trackMetric(LOAD);
    startAppInsights("");
    resetAppInsightsForTests(); // a later start must not see the dropped items
    startAppInsights(CS);
    expect(sdk.instances[0]!.trackEvent).not.toHaveBeenCalled();
  });

  it("UT-AI-018 keeps at most 100 queued items", () => {
    for (let i = 0; i < 150; i++) trackMetric(LOAD);
    startAppInsights(CS);
    expect(sdk.instances[0]!.trackEvent).toHaveBeenCalledTimes(100);
  });
});
