/**
 * UT-PHPRE: the parity harness preflight's pure checks (`preflightChecks.ts`, D80). Node only; no server, no browser.
 */
import { describe, expect, it } from "vitest";
import {
  canvasAppFor, fingerprintDiff, isLoginUrl, LOGIN_DWELL_MS, loginVerdict, needsCanvas, needsReference, referenceProblem,
  serverProblem, SESSION_TIMEOUT_MS, sessionMessage, startedAtOf,
} from "./preflightChecks";
import type { ReferenceMeta } from "./store";

const meta = (over: Partial<ReferenceMeta> = {}): ReferenceMeta => ({
  canvasVersion: "1.21.709", fingerprint: { costs: 12, "costs.modifiedon": "2026-11-03T08:00:00Z" }, recordedAt: "2026-11-03T09:00:00Z", runId: "r0", ...over,
});

describe("servers", () => {
  it("UT-PHPRE-001 any answer counts; the servers that did not answer are named with the start commands", async () => {
    expect(await serverProblem(async () => ({ status: 404 }))).toBeNull();
    const msg = await serverProblem(async (url) => { if (url.endsWith(":8080")) throw new Error("ECONNREFUSED"); return {}; });
    expect(msg).toBe("http://localhost:8080 did not answer within 5 s: start npm run dev and pac code run --appUrl http://localhost:3000");
    const both = await serverProblem(async () => { throw new Error("down"); });
    expect(both).toMatch(/^http:\/\/localhost:3000 and http:\/\/localhost:8080 did not answer/);
  });

  it("UT-PHPRE-002 each request carries a time-out signal", async () => {
    const seen: AbortSignal[] = [];
    await serverProblem(async (_u, init) => { seen.push(init.signal); return {}; }, ["http://a", "http://b"], 50);
    expect(seen).toHaveLength(2);
    expect(seen.every((s) => s instanceof AbortSignal)).toBe(true);
  });
});

describe("sessions", () => {
  it("UT-PHPRE-003 the Microsoft sign-in hosts are recognised, the apps are not", () => {
    expect(isLoginUrl("https://login.microsoftonline.com/common/oauth2/authorize?x=1")).toBe(true);
    expect(isLoginUrl("https://login.live.com/")).toBe(true);
    expect(isLoginUrl("https://apps.powerapps.com/play/e/x/app/local")).toBe(false);
    expect(isLoginUrl("https://evil.example/login.microsoftonline.com")).toBe(false);
    expect(isLoginUrl("not a url")).toBe(false);
  });

  it("UT-PHPRE-004 the SSO round trip is not an expired session; a sign-in field, a long stay or the 45 s mark is", () => {
    const at = (s: Partial<Parameters<typeof loginVerdict>[0]>) =>
      loginVerdict({ onLogin: true, promptVisible: false, onLoginSinceMs: 0, nowMs: 1_000, startedMs: 0, ...s });
    expect(at({ onLogin: false, promptVisible: true })).toBe(false);
    expect(at({})).toBe(false);
    expect(at({ promptVisible: true })).toBe(true);
    expect(at({ nowMs: LOGIN_DWELL_MS })).toBe(true);
    expect(at({ onLoginSinceMs: SESSION_TIMEOUT_MS - 1, nowMs: SESSION_TIMEOUT_MS })).toBe(true);
  });

  it("UT-PHPRE-005 the session message names the npm script of the app", () => {
    expect(sessionMessage("code", "x")).toBe("The saved code app session is not valid (x): run npm run e2e:auth:codeapp");
    expect(sessionMessage("canvas", "y")).toMatch(/Canvas session.*run npm run e2e:auth:canvas$/);
  });

  it("UT-PHPRE-006 the Canvas checked is the screen's own app; compare mode and smoke skip it", () => {
    expect(canvasAppFor("cost")).toBe("cost");
    expect(["pm", "admin", "custom"].map((a) => canvasAppFor(a as "pm"))).toEqual(["pm", "pm", "pm"]);
    expect(needsCanvas("full", "full")).toBe(true);
    expect(needsCanvas("full", "smoke")).toBe(false);
    expect(needsCanvas("compare", "read")).toBe(false);
  });
});

describe("the cached Canvas reference", () => {
  it("UT-PHPRE-007 only a compare run that is not smoke needs it", () => {
    expect(needsReference("compare", "full")).toBe(true);
    expect(needsReference("compare", "smoke")).toBe(false);
    expect(needsReference("full", "full")).toBe(false);
  });

  it("UT-PHPRE-008 missing, another canvas version, or changed data: re-record the Canvas", () => {
    expect(referenceProblem("opex", null, "1.21.709")).toBe(
      'No cached Canvas reference for "opex" (e2e/reference/opex/meta.json): re-record the Canvas: PARITY_MODE=full');
    expect(referenceProblem("opex", meta({ canvasVersion: "1.21.700" }), "1.21.709")).toMatch(/recorded against canvas 1\.21\.700.*PARITY_MODE=full$/);
    expect(referenceProblem("opex", meta(), "1.21.709")).toBeNull();
    expect(referenceProblem("opex", meta(), "1.21.709", { costs: 12, "costs.modifiedon": "2026-11-03T08:00:00Z" })).toBeNull();
    expect(referenceProblem("opex", meta(), "1.21.709", { costs: 13, "costs.modifiedon": "2026-11-03T08:00:00Z" }))
      .toBe('The data changed since the cached Canvas reference for "opex" was recorded (costs: 12 -> 13): re-record the Canvas: PARITY_MODE=full');
  });

  it("UT-PHPRE-009 fingerprintDiff lists added, removed and changed keys, sorted", () => {
    expect(fingerprintDiff({ b: 1, a: "x" }, { a: "y", c: 2 })).toEqual(['a: "x" -> "y"', "b: 1 -> (none)", "c: (none) -> 2"]);
    expect(fingerprintDiff({ a: 1 }, { a: 1 })).toEqual([]);
  });
});

describe("run.json", () => {
  it("UT-PHPRE-010 startedAt: the runner's time, else the one already recorded, else now", () => {
    const now = new Date("2026-11-03T10:00:00Z");
    expect(startedAtOf("2026-11-03T09:00:00.000Z", "2026-11-03T08:00:00Z", now)).toBe("2026-11-03T09:00:00.000Z");
    expect(startedAtOf("garbage", "2026-11-03T08:00:00Z", now)).toBe("2026-11-03T08:00:00Z");
    expect(startedAtOf(undefined, 5, now)).toBe("2026-11-03T10:00:00.000Z");
  });
});
