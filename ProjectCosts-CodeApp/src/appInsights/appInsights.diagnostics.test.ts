import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearTraces } from "@/platform/telemetry";
import { applyEnvironmentName, openConsoleGateForTests, resetConsoleGate } from "@/platform/consoleGate";

interface Listener {
  eventsSent?: (events: unknown[]) => void;
  eventsDiscarded?: (events: unknown[], reason: number, statusCode?: number) => void;
}
interface FakeAi {
  config: Record<string, unknown>;
  core: { addNotificationListener: ReturnType<typeof vi.fn> };
  loadAppInsights: ReturnType<typeof vi.fn>;
  addTelemetryInitializer: ReturnType<typeof vi.fn>;
  trackPageView: ReturnType<typeof vi.fn>;
  trackEvent: ReturnType<typeof vi.fn>;
  trackTrace: ReturnType<typeof vi.fn>;
  trackException: ReturnType<typeof vi.fn>;
}

const sdk = vi.hoisted(() => ({ instances: [] as unknown[], listeners: [] as unknown[], throwOnCreate: false }));

vi.mock("@microsoft/applicationinsights-web", () => ({
  ApplicationInsights: vi.fn().mockImplementation(function (this: unknown, { config }: { config: Record<string, unknown> }) {
    if (sdk.throwOnCreate) throw new Error("Invalid connection string");
    const instance = {
      config,
      core: { addNotificationListener: vi.fn((l: unknown) => sdk.listeners.push(l)) },
      loadAppInsights: vi.fn(), addTelemetryInitializer: vi.fn(), trackPageView: vi.fn(),
      trackEvent: vi.fn(), trackTrace: vi.fn(), trackException: vi.fn(),
    };
    sdk.instances.push(instance);
    return instance;
  }),
}));

import { appInsightsStarted, listenForTraces, resetAppInsightsForTests, startAppInsights } from "./appInsights";

const KEY = "11111111-2222-3333-4444-555555555555";
const ORIGIN = "https://westeurope-5.in.applicationinsights.azure.com";
const CS = `InstrumentationKey=${KEY};IngestionEndpoint=${ORIGIN}/;ApplicationId=99999999-8888-7777-6666-555555555555`;

const instances = (): FakeAi[] => sdk.instances as FakeAi[];
const listener = (): Listener => sdk.listeners[0] as Listener;

let info: ReturnType<typeof vi.spyOn>;
let warn: ReturnType<typeof vi.spyOn>;
/** Every `[VSB] ACTION Application Insights …` line printed so far, info and warn together. */
const lines = (): string[] =>
  [...info.mock.calls, ...warn.mock.calls].map((c) => String(c[0])).filter((l) => l.includes("Application Insights"));

beforeEach(() => {
  resetAppInsightsForTests();
  sdk.instances.length = 0;
  sdk.listeners.length = 0;
  sdk.throwOnCreate = false;
  clearTraces();
  info = vi.spyOn(console, "info").mockImplementation(() => {});
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  openConsoleGateForTests();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("App Insights console lines", () => {
  it("UT-AIDIAG-010 prints the complete connection string, the host it sends to and the CSP advice", async () => {
    startAppInsights(CS);
    await appInsightsStarted();
    const text = lines().join("\n");
    expect(text).toContain(`connection string in use (environment variable vsb_ApplicationInsightsConnectionString): ${CS}`);
    expect(text).toContain(`sends to ${ORIGIN} · app id 99999999-8888-7777-6666-555555555555`);
    expect(text).toContain(`add ${ORIGIN} to connect-src`);
    expect(text).toContain("Application Insights ON: SDK started");
    expect(lines().every((l) => l.startsWith("[VSB] ACTION "))).toBe(true);
  });

  it("UT-AIDIAG-011 an empty or missing variable prints why telemetry is off", () => {
    startAppInsights("   ");
    expect(instances()).toHaveLength(0);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(lines()[0]).toContain("OFF: the environment variable vsb_ApplicationInsightsConnectionString is empty or missing");
  });

  it("UT-AIDIAG-012 a failed read prints the reason, and a later successful read still starts telemetry", async () => {
    startAppInsights(undefined, new Error("Principal user is missing prvReadEnvironmentVariableValue privilege"));
    expect(lines()[0]).toContain("could not be read (Principal user is missing prvReadEnvironmentVariableValue privilege)");
    expect(instances()).toHaveLength(0);
    startAppInsights(CS);
    await appInsightsStarted();
    expect(instances()).toHaveLength(1);
    // From here on the first real answer counts again.
    startAppInsights(undefined, new Error("late failure"));
    expect(instances()).toHaveLength(1);
  });

  it("UT-AIDIAG-013 an empty value is a real answer: a later non-empty one does not start telemetry (UT-AI-010 kept)", () => {
    startAppInsights("");
    startAppInsights(CS);
    expect(instances()).toHaveLength(0);
  });

  it("UT-AIDIAG-014 a malformed value prints the problem and still hands the SDK what it was given", async () => {
    startAppInsights(`"InstrumentationKey=${KEY}"`);
    await appInsightsStarted();
    expect(lines().join("\n")).toContain("connection string problem: the value is wrapped in quotes");
    expect(instances()).toHaveLength(1);
  });

  it("UT-AIDIAG-015 an SDK that cannot start prints OFF and the reason", async () => {
    sdk.throwOnCreate = true;
    startAppInsights(CS);
    await appInsightsStarted();
    expect(lines().join("\n")).toContain("OFF: the SDK did not start (Invalid connection string)");
  });

  it("UT-AIDIAG-016 prints the first accepted batch once, and every refused batch with its status, capped", async () => {
    startAppInsights(CS);
    await appInsightsStarted();
    const l = listener();
    l.eventsSent!([{}, {}]);
    l.eventsSent!([{}]);
    // D122 addendum: "handed to the browser", never "accepted" / "telemetry is flowing" (a queued beacon is not delivery).
    expect(lines().filter((x) => x.includes("SENT (not confirmed): the SDK handed the first 2 item(s)"))).toHaveLength(1);
    expect(lines().join("\n")).not.toMatch(/accepted|telemetry is flowing/);
    for (let i = 0; i < 6; i += 1) l.eventsDiscarded!([{}], 1, 0);
    const failed = lines().filter((x) => x.includes(" FAILED: "));
    expect(failed).toHaveLength(4); // 3 batches + one "not logged" note
    expect(failed[0]).toContain("(status 0): no reply reached the browser: blocked by the Content Security Policy");
    expect(failed[3]).toContain("further discards are not logged");
    l.eventsDiscarded!([{}], 1, 401);
    expect(lines().filter((x) => x.includes(" FAILED: "))).toHaveLength(4);
  });

  it("UT-AIDIAG-017 prints the browser's CSP refusal of the ingestion host once, and ignores other violations", async () => {
    const handlers: Array<(e: unknown) => void> = [];
    vi.stubGlobal("document", { addEventListener: (type: string, h: (e: unknown) => void) => type === "securitypolicyviolation" && handlers.push(h) });
    startAppInsights(CS);
    await appInsightsStarted();
    expect(handlers).toHaveLength(1);
    handlers[0]!({ effectiveDirective: "connect-src", blockedURI: "https://atlas.microsoft.com/x" });
    expect(lines().filter((x) => x.includes("BLOCKED"))).toHaveLength(0);
    handlers[0]!({ effectiveDirective: "connect-src", blockedURI: `${ORIGIN}/v2/track` });
    handlers[0]!({ effectiveDirective: "connect-src", blockedURI: `${ORIGIN}/v2/track` });
    const blocked = lines().filter((x) => x.includes("BLOCKED"));
    expect(blocked).toHaveLength(1);
    expect(blocked[0]).toContain(`add ${ORIGIN} to connect-src`);
  });

  it("UT-AIDIAG-018 turns the SDK's own console warnings on", async () => {
    startAppInsights(CS);
    await appInsightsStarted();
    expect(instances()[0]!.config).toMatchObject({ connectionString: CS, loggingLevelConsole: 2 });
  });

  it("UT-AIDIAG-021 PROD (vsb_EnvironmentName = Prod): the SDK is started with its console output OFF and no line is printed (D164)", async () => {
    applyEnvironmentName("Prod");
    startAppInsights(CS);
    await appInsightsStarted();
    expect(instances()[0]!.config).toMatchObject({ connectionString: CS, loggingLevelConsole: 0 });
    listener().eventsDiscarded!([{}], 1, 0);
    expect(info).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it("UT-AIDIAG-022 PROD: the OFF line for a missing connection string is not printed either", () => {
    applyEnvironmentName("Prod");
    startAppInsights(undefined);
    startAppInsights(undefined, new Error("403"));
    expect(info).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it("UT-AIDIAG-023 while the environment is not known yet the SDK's own console output stays off", async () => {
    resetConsoleGate();
    startAppInsights(CS);
    await appInsightsStarted();
    expect(instances()[0]!.config).toMatchObject({ loggingLevelConsole: 0 });
  });

  it("UT-AIDIAG-020 starts the SDK with the CDN config blocked and the unload event off", async () => {
    startAppInsights(CS);
    await appInsightsStarted();
    expect(instances()[0]!.config).toMatchObject({
      disablePageUnloadEvents: ["unload"],
      extensionConfig: { AppInsightsCfgSyncPlugin: { blkCdnCfg: true } },
    });
  });

  it("UT-AIDIAG-019 never sends the connection string back out as telemetry", async () => {
    listenForTraces();
    startAppInsights(CS);
    await appInsightsStarted();
    listener().eventsDiscarded!([{}], 1, 0);
    const ai = instances()[0]!;
    const sent = JSON.stringify([ai.trackTrace.mock.calls, ai.trackEvent.mock.calls, ai.trackException.mock.calls]);
    expect(sent).not.toContain(KEY);
  });
});
