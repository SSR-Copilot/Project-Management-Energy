/**
 * OPT-29 (B8): `trackMetric` built its event payload before `send` found telemetry switched off. Now it returns first when the client
 * is off (`null`). OLD: `toEventPayload` ran on every metric even with telemetry off; NEW: 0 times. With telemetry on, or still starting
 * (queued), the payload and the event are unchanged.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const spy = vi.hoisted(() => ({ toEventPayload: vi.fn(), events: [] as unknown[] }));

vi.mock("./sanitize", async (orig) => {
  const actual = await orig<typeof import("./sanitize")>();
  return { ...actual, toEventPayload: (...a: Parameters<typeof actual.toEventPayload>) => { spy.toEventPayload(...a); return actual.toEventPayload(...a); } };
});
vi.mock("@microsoft/applicationinsights-web", () => ({
  SeverityLevel: { Verbose: 0, Information: 1, Warning: 2, Error: 3, Critical: 4 },
  ApplicationInsights: vi.fn().mockImplementation(function () {
    return { loadAppInsights: vi.fn(), addTelemetryInitializer: vi.fn(), trackPageView: vi.fn(), trackTrace: vi.fn(), trackException: vi.fn(), trackEvent: (e: unknown) => spy.events.push(e) };
  }),
}));

import { appInsightsStarted, resetAppInsightsForTests, startAppInsights, trackMetric } from "./appInsights";

const CS = "InstrumentationKey=00000000-0000-0000-0000-000000000000;IngestionEndpoint=https://westeurope-5.in.applicationinsights.azure.com/";
const LOAD = { type: "sessionLoadSummary", data: { successfulAppLaunch: true, appLoadResult: "optimal", appLoadNonOptimalReason: "other", timeToAppInteractive: 900 } } as const;

beforeEach(() => { resetAppInsightsForTests(); spy.toEventPayload.mockClear(); spy.events.length = 0; });

describe("trackMetric builds its payload only when it can be used", () => {
  it("UT-AI-OPT-001 telemetry off: no payload is built (OLD 1 per metric, NEW 0)", () => {
    startAppInsights("");
    for (let i = 0; i < 50; i++) trackMetric(LOAD);
    expect(spy.toEventPayload).not.toHaveBeenCalled();
  });

  it("UT-AI-OPT-002 telemetry on: one payload and one event per metric, as before", async () => {
    startAppInsights(CS);
    await appInsightsStarted();
    trackMetric(LOAD);
    expect(spy.toEventPayload).toHaveBeenCalledTimes(1);
    expect(spy.events).toEqual([expect.objectContaining({ name: "sessionLoadSummary", measurements: { timeToAppInteractive: 900 } })]);
  });

  it("UT-AI-OPT-003 a metric that arrives before the start is still queued with its payload and sent on start", async () => {
    trackMetric(LOAD);
    expect(spy.toEventPayload).toHaveBeenCalledTimes(1);
    startAppInsights(CS);
    await appInsightsStarted();
    expect(spy.events).toEqual([expect.objectContaining({ name: "sessionLoadSummary" })]);
  });
});
