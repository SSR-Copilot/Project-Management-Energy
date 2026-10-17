import { describe, expect, it } from "vitest";
import { DataError, RecordGoneError } from "@/platform/errors";
import { isRecordGone, RECORD_GONE_TEXT, writeErrorText } from "./recordGone";

const gone = new RecordGoneError("update project", "vsb_projects", "ac3168e6-2b7c-ef11-ac20-6045bda08851");

describe("recordGone (V-1 screen wording)", () => {
  it("UT-GONE-001 recognises a RecordGoneError directly and inside a cause chain", () => {
    expect(isRecordGone(gone)).toBe(true);
    expect(isRecordGone(new Error("wrapped", { cause: gone }))).toBe(true);
    expect(isRecordGone(new DataError("update project", "denied", 404))).toBe(false);
    expect(isRecordGone(undefined)).toBe(false);
  });

  it("UT-GONE-002 words a gone row plainly and leaves every other error's text alone", () => {
    expect(writeErrorText(gone)).toBe(RECORD_GONE_TEXT);
    expect(writeErrorText(new Error("boom"))).toBe("boom");
    expect(writeErrorText("plain")).toBe("plain");
  });
});
