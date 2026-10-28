import { describe, expect, it } from "vitest";
import { DataError, rootCauseDetail } from "./errors";

describe("rootCauseDetail", () => {
  it("UT-ERR-ROOT-001 reports the innermost Dataverse fault through wrapping errors", () => {
    const sdk = { message: "Attribute 'vsb_x' not found.", status: 400, requestId: "req-1" };
    const data = new DataError("upsert contracts", sdk, 400);
    const chunk = Object.assign(new Error("upsert contracts: chunk 1 failed"), { cause: data });
    const phase = Object.assign(new Error("Save failed in phase 1"), { cause: chunk });
    expect(rootCauseDetail(phase)).toBe("HTTP 400: Attribute 'vsb_x' not found. (request req-1)");
  });

  it("UT-ERR-ROOT-002 is undefined when no DataError is in the chain", () => {
    expect(rootCauseDetail(new Error("plain"))).toBeUndefined();
    expect(rootCauseDetail(undefined)).toBeUndefined();
  });
});
