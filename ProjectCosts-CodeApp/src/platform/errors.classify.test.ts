/**
 * UT-ERRCLASS-NNN: the error taxonomy (dvopt T-10, doc 21 section 1), `DataError.deterministic` and `UnknownOutcomeError`.
 * Errors are SDK-shaped: `{ message, status?, requestId? }`, no headers.
 */
import { describe, expect, it } from "vitest";
import {
  classifyError, DataError, errorChain, isRetryable, statusOfChain, UNKNOWN_OUTCOME_TEXT, UnknownOutcomeError, type ErrorClass,
} from "./errors";

const sdk = (status?: number, message = "sdk failure") => ({ message, ...(status === undefined ? {} : { status }) });

describe("classifyError (UT-ERRCLASS)", () => {
  it.each<[string, unknown, ErrorClass]>([
    ["400", sdk(400), "validation"],
    ["401", sdk(401), "auth"],
    ["403", sdk(403), "permission"],
    ["404", sdk(404), "notFound"],
    ["409", sdk(409), "conflict"],
    ["412", sdk(412), "conflict"],
    ["429", sdk(429), "throttled"],
    ["500", sdk(500), "transient"],
    ["502", sdk(502), "transient"],
    ["503", sdk(503), "transient"],
    ["504", sdk(504), "transient"],
    ["408", sdk(408), "transient"],
    ["501 (has its own per-row fallback)", sdk(501), "unknown"],
    ["418", sdk(418), "unknown"],
    ["an error without status (network)", new TypeError("Failed to fetch"), "transient"],
    ["undefined", undefined, "transient"],
    ["a plain string", "boom", "transient"],
  ])("UT-ERRCLASS-001 %s is %s", (_name, error, expected) => {
    expect(classifyError(error)).toBe(expected);
  });

  it("UT-ERRCLASS-002 reads the status through DataError and its cause chain", () => {
    expect(classifyError(new DataError("read x", sdk(429), 429))).toBe("throttled");
    // The DataError carries no status of its own: the SDK error under it does.
    expect(classifyError(new DataError("read x", sdk(503)))).toBe("transient");
    // A wrapper two levels up.
    expect(classifyError(new DataError("save", new DataError("create x", sdk(403), 403)))).toBe("permission");
    expect(statusOfChain(new DataError("save", new DataError("create x", sdk(409))))).toBe(409);
  });

  it("UT-ERRCLASS-003 the Dataverse code 0x80040217 with no status is notFound", () => {
    expect(classifyError(new Error("Entity With Id = x Does Not Exist 0x80040217"))).toBe("notFound");
    expect(classifyError(new DataError("delete", "0x80040217 gone"))).toBe("notFound");
    // A real status wins over the text.
    expect(classifyError(sdk(500, "0x80040217"))).toBe("transient");
  });

  it("UT-ERRCLASS-004 UnknownOutcomeError is unknown, whatever wraps it", () => {
    const unknown = new UnknownOutcomeError("save", 1000);
    expect(classifyError(unknown)).toBe("unknown");
    expect(classifyError(new DataError("outer", unknown))).toBe("unknown");
    expect(unknown).toBeInstanceOf(DataError);
    expect(unknown.status).toBeUndefined();
    expect(unknown.deadlineMs).toBe(1000);
    expect(unknown.message).toContain(UNKNOWN_OUTCOME_TEXT);
  });

  it("UT-ERRCLASS-005 a deterministic DataError is unknown even with a retryable status", () => {
    expect(classifyError(DataError.deterministic("fetchAll cap", "too many pages", 500))).toBe("unknown");
    expect(classifyError(DataError.deterministic("fetchAll cap", "too many pages"))).toBe("unknown");
  });

  it("UT-ERRCLASS-006 errorChain stops at 5 links", () => {
    let e: unknown = sdk(500);
    for (let i = 0; i < 10; i += 1) e = new DataError(`level ${i}`, e);
    expect(errorChain(e)).toHaveLength(5);
  });
});

describe("isRetryable with the deterministic marker (UT-ERRCLASS, WE-01)", () => {
  it("UT-ERRCLASS-010 a deterministic DataError is never retried, an ordinary one without status still is", () => {
    expect(isRetryable(DataError.deterministic("fetchAll cap", "too many pages"))).toBe(false);
    expect(isRetryable(new DataError("fetchAll cap", "too many pages"))).toBe(true);
  });

  it("UT-ERRCLASS-011 UnknownOutcomeError is never retried", () => {
    expect(isRetryable(new UnknownOutcomeError("save", 1))).toBe(false);
  });

  it("UT-ERRCLASS-012 the previous rules are untouched: 5xx and 429 retry, 4xx and 403 do not, a non-DataError does not", () => {
    expect(isRetryable(new DataError("x", sdk(500), 500))).toBe(true);
    expect(isRetryable(new DataError("x", sdk(429), 429))).toBe(true);
    expect(isRetryable(new DataError("x", sdk(400), 400))).toBe(false);
    expect(isRetryable(new DataError("x", sdk(403), 403))).toBe(false);
    expect(isRetryable(new Error("x"))).toBe(false);
  });

  it("UT-ERRCLASS-013 the marker is absent on an ordinary error", () => {
    expect(new DataError("x", "y").deterministic).toBeUndefined();
    expect(DataError.deterministic("x", "y").deterministic).toBe(true);
  });
});
