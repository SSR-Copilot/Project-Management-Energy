// @vitest-environment jsdom
/** UT-AZMAP — the Azure Maps SAS token cache (`platform/azureMapsToken.ts`): one flow call per lifetime, refresh, errors. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const flow = vi.hoisted(() => ({ getAzureMapsSasToken: vi.fn() }));
vi.mock("@/data/flows", () => flow);
vi.mock("./requestLog", () => ({ logError: vi.fn() }));

import {
  REFRESH_MARGIN_MS, RETRY_AFTER_FAILURE_MS, azureMapsToken, invalidateAzureMapsToken, kindOfFlowErrorCode, mapErrorKind,
  resetAzureMapsTokenForTests, tokenExpiry,
} from "./azureMapsToken";

/** A JWT-shaped token whose `exp` is `msFromNow` ahead (Azure Maps SAS tokens are JWTs). */
const jwt = (msFromNow: number, id = "a"): string => {
  const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `jwt-sas ${b64({ alg: "RS256" })}.${b64({ exp: Math.floor((Date.now() + msFromNow) / 1000), id })}.sig`;
};
const HOUR = 60 * 60 * 1000;

beforeEach(() => { localStorage.clear(); resetAzureMapsTokenForTests(); flow.getAzureMapsSasToken.mockReset(); });
afterEach(() => { vi.useRealTimers(); });

describe("UT-AZMAP Azure Maps SAS token cache", () => {
  it("UT-AZMAP-001 reads the expiry from the token; a non-JWT has none", () => {
    const t = jwt(12 * HOUR);
    expect(Math.abs((tokenExpiry(t) ?? 0) - (Date.now() + 12 * HOUR))).toBeLessThan(2000);
    expect(tokenExpiry("not-a-token")).toBeNull();
  });

  it("UT-AZMAP-002 parallel requests share one flow call, later ones use the cache", async () => {
    const t = jwt(12 * HOUR);
    flow.getAzureMapsSasToken.mockResolvedValue({ sastoken: t, expiresutc: null, errorcode: null, errormessage: null });
    const [a, b] = await Promise.all([azureMapsToken(), azureMapsToken()]);
    expect(a).toBe(t);
    expect(b).toBe(t);
    expect(await azureMapsToken()).toBe(t);
    expect(flow.getAzureMapsSasToken).toHaveBeenCalledTimes(1);
  });

  it("UT-AZMAP-003 a reload reuses the stored token for its lifetime", async () => {
    const t = jwt(12 * HOUR);
    flow.getAzureMapsSasToken.mockResolvedValue({ sastoken: t, expiresutc: null, errorcode: null, errormessage: null });
    await azureMapsToken();
    // A new page: the module state is gone, the stored token is not.
    const stored = localStorage.getItem("vsb-azure-maps-sas");
    resetAzureMapsTokenForTests();
    localStorage.setItem("vsb-azure-maps-sas", stored!);
    expect(await azureMapsToken()).toBe(t);
    expect(flow.getAzureMapsSasToken).toHaveBeenCalledTimes(1);
  });

  it("UT-AZMAP-004 a token inside the refresh margin, or invalidated after a 401, is fetched again", async () => {
    flow.getAzureMapsSasToken
      .mockResolvedValueOnce({ sastoken: jwt(REFRESH_MARGIN_MS - 1000, "near"), expiresutc: null, errorcode: null, errormessage: null })
      .mockResolvedValueOnce({ sastoken: jwt(12 * HOUR, "b"), expiresutc: null, errorcode: null, errormessage: null })
      .mockResolvedValueOnce({ sastoken: jwt(12 * HOUR, "c"), expiresutc: null, errorcode: null, errormessage: null });
    await azureMapsToken();
    const second = await azureMapsToken();
    expect(flow.getAzureMapsSasToken).toHaveBeenCalledTimes(2);
    invalidateAzureMapsToken();
    const third = await azureMapsToken();
    expect(third).not.toBe(second);
    expect(flow.getAzureMapsSasToken).toHaveBeenCalledTimes(3);
  });

  it("UT-AZMAP-005 the flow's expiresutc is used when the token carries no exp", async () => {
    vi.useFakeTimers();
    flow.getAzureMapsSasToken.mockImplementation(async () => ({ sastoken: "opaque", expiresutc: new Date(Date.now() + 2 * HOUR).toISOString(), errorcode: null, errormessage: null }));
    await azureMapsToken();
    await azureMapsToken();
    expect(flow.getAzureMapsSasToken).toHaveBeenCalledTimes(1);
    // The background refresh runs before the margin: no map request waits for the flow.
    await vi.advanceTimersByTimeAsync(2 * HOUR - REFRESH_MARGIN_MS);
    expect(flow.getAzureMapsSasToken).toHaveBeenCalledTimes(2);
    // And only once per lifetime.
    await vi.advanceTimersByTimeAsync(30 * 60 * 1000);
    expect(flow.getAzureMapsSasToken).toHaveBeenCalledTimes(2);
  });

  it("UT-AZMAP-007 a flow that answers a token already inside the margin is not called in a loop", async () => {
    vi.useFakeTimers();
    flow.getAzureMapsSasToken.mockImplementation(async () => ({ sastoken: jwt(REFRESH_MARGIN_MS / 2), expiresutc: null, errorcode: null, errormessage: null }));
    await azureMapsToken();
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    expect(flow.getAzureMapsSasToken).toHaveBeenCalledTimes(1);
  });

  it("UT-AZMAP-006 a failure rejects, caches nothing, waits RETRY_AFTER_FAILURE_MS without a new flow run, then retries", async () => {
    vi.useFakeTimers();
    flow.getAzureMapsSasToken
      .mockRejectedValueOnce(new Error("flow Get Azure Maps SAS Token failed: 502 NoResponse"))
      .mockResolvedValueOnce({ sastoken: null, expiresutc: null, errorcode: null, errormessage: null })
      .mockResolvedValueOnce({ sastoken: jwt(12 * HOUR), expiresutc: null, errorcode: null, errormessage: null });
    await expect(azureMapsToken()).rejects.toMatchObject({ name: "MapTokenError", kind: "unavailable" });
    // Panning a broken map: every tile asks again, the flow is not called again.
    await expect(azureMapsToken()).rejects.toMatchObject({ kind: "unavailable" });
    expect(flow.getAzureMapsSasToken).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(RETRY_AFTER_FAILURE_MS);
    await expect(azureMapsToken()).rejects.toThrow(/no "sastoken"/);
    expect(localStorage.getItem("vsb-azure-maps-sas")).toBeNull();
    await vi.advanceTimersByTimeAsync(RETRY_AFTER_FAILURE_MS);
    await expect(azureMapsToken()).resolves.toMatch(/^jwt-sas /);
    expect(flow.getAzureMapsSasToken).toHaveBeenCalledTimes(3);
  });

  it("UT-AZMAP-008 the flow's caught error (errorcode / errormessage) becomes a kind, not a token", async () => {
    flow.getAzureMapsSasToken.mockResolvedValue({
      sastoken: null, expiresutc: null, errorcode: "AuthorizationFailed",
      errormessage: "The client 'flow.serviceuser…' does not have authorization to perform action 'Microsoft.Maps/accounts/listSas/action'",
    });
    const error = await azureMapsToken().catch((e: unknown) => e);
    expect(error).toMatchObject({ name: "MapTokenError", kind: "notAuthorized" });
    expect(mapErrorKind(error)).toBe("notAuthorized");
    // The SDK may hand a plain Error to the map's error event: the last token failure still decides.
    expect(mapErrorKind(new Error("Failed to retrieve token"))).toBe("notAuthorized");
  });

  it("UT-AZMAP-009 error codes and messages map to the five kinds", () => {
    expect(kindOfFlowErrorCode("AuthorizationFailed")).toBe("notAuthorized");
    expect(kindOfFlowErrorCode("403")).toBe("notAuthorized");
    expect(kindOfFlowErrorCode("ResourceNotFound")).toBe("notConfigured");
    expect(kindOfFlowErrorCode("ResourceGroupNotFound")).toBe("notConfigured");
    expect(kindOfFlowErrorCode("InvalidSubscriptionId")).toBe("notConfigured");
    expect(kindOfFlowErrorCode("InvalidTemplate")).toBe("notConfigured");
    expect(kindOfFlowErrorCode("504")).toBe("unavailable");
    expect(kindOfFlowErrorCode("ActionTimedOut")).toBe("unavailable");
    expect(kindOfFlowErrorCode("Unknown")).toBe("unknown");
    expect(kindOfFlowErrorCode("SomethingElse")).toBe("unknown");
    // No token failure: a tile 403 is Azure Maps refusing the token.
    expect(mapErrorKind(new Error("Http status code: 403"))).toBe("accessDenied");
    expect(mapErrorKind(new Error("Failed to fetch"))).toBe("unavailable");
    expect(mapErrorKind(new Error("style is not done loading"))).toBe("unknown");
  });
});
