import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DataError } from "./errors";
import { resetRequestLog } from "./requestLog";
import { clearTraces, trace, traces } from "./telemetry";
import { installGlobalErrorLog, resetGlobalErrorLog } from "./globalErrors";

let error: ReturnType<typeof vi.spyOn>;
const lines = () => error.mock.calls.map((c: unknown[]) => String(c[0]));

beforeEach(() => {
  resetRequestLog();
  clearTraces();
  error = vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

describe("error log", () => {
  it("UT-REQLOG-040 an error trace prints one ERROR line with the Dataverse root cause", () => {
    const cause = Object.assign(new Error("Principal user is missing prvWrite privilege"), { requestId: "r-1" });
    trace("error", "Could not save generators", new DataError("save generators", cause, 403));
    expect(lines()).toHaveLength(1);
    expect(lines()[0]).toMatch(/^\[VSB\] ERROR Could not save generators — HTTP 403: .*prvWrite.*\(request r-1\) @ \//);
  });

  it("UT-REQLOG-041 information and warning traces print no ERROR line, a quiet one only fills the buffer", () => {
    trace("information", "app load optimal");
    trace("warning", "slow");
    trace("error", "GET /x → 500", undefined, true);
    expect(lines()).toHaveLength(0);
    expect(traces()).toHaveLength(3);
  });

  it("UT-REQLOG-042 a critical trace adds the last actions as context", () => {
    trace("critical", "Render crashed", new Error("boom"));
    expect(lines()[0]).toMatch(/^\[VSB\] ERROR Render crashed — boom @ \//);
  });

  it("UT-REQLOG-043 unhandled errors and rejections reach the console and the buffer", () => {
    resetGlobalErrorLog();
    const target = new EventTarget();
    installGlobalErrorLog(target as unknown as Window);
    const crash = new Event("error") as ErrorEvent;
    Object.assign(crash, { message: "x is not a function", error: new TypeError("x is not a function") });
    target.dispatchEvent(crash);
    const rejection = new Event("unhandledrejection") as PromiseRejectionEvent;
    Object.assign(rejection, { reason: new Error("nobody awaited me") });
    target.dispatchEvent(rejection);
    expect(lines()[0]).toMatch(/^\[VSB\] ERROR Unhandled error: x is not a function — x is not a function @ \//);
    expect(lines()[1]).toMatch(/^\[VSB\] ERROR Unhandled promise rejection: nobody awaited me — nobody awaited me @ \//);
    expect(traces().map((t) => t.severity)).toEqual(["critical", "critical"]);
    resetGlobalErrorLog();
  });
});
