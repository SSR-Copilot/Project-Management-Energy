/**
 * UT-PLANWRITE — the message `usePlanWrite` shows for a refused or failed plan. PM's texts are
 * pinned as strings; the one addition is the "deleted by someone else" sentence for a gone row,
 * which only a guarded update (never set by a PM plan) can raise.
 */
import { describe, expect, it } from "vitest";
import { DataError, RECORD_GONE_TEXT, RecordGoneError } from "@/platform/errors";
import { PlanError, PlanRefusedError } from "./executePlan";
import { writeErrorMessage } from "./usePlanWrite";

const LQ = "“";
const RQ = "”";

describe("writeErrorMessage", () => {
  it("UT-PLANWRITE-001 PM pin: a PlanError reads as the failed step plus how many changes were already saved", () => {
    const error = new PlanError(1, 3, "second", new DataError("save second", "boom"));
    expect(writeErrorMessage(error, "save")).toBe(
      `${LQ}second${RQ} failed: save second failed: boom. 1 of 3 changes had already been saved.`,
    );
  });

  it("UT-PLANWRITE-002 PM pin: a PlanError with nothing saved yet omits the saved count; the prefix wraps the detail", () => {
    const error = new PlanError(0, 2, "first", new Error("boom"));
    expect(writeErrorMessage(error, "save")).toBe(`${LQ}first${RQ} failed: boom.`);
    expect(writeErrorMessage(error, "save", (d) => `Could not save: ${d}`)).toBe(`Could not save: ${LQ}first${RQ} failed: boom.`);
  });

  it("UT-PLANWRITE-003 PM pin: a refused plan and a plain Error show their own message", () => {
    expect(writeErrorMessage(new PlanRefusedError("not allowed"), "save")).toBe("not allowed");
    expect(writeErrorMessage(new Error("plain"), "save")).toBe("plain");
    expect(writeErrorMessage("text", "save")).toBe("text");
  });

  it("UT-PLANWRITE-004 PM pin: permission is checked first on the error itself (a PlanError wrapper is not looked through)", () => {
    const forbidden = new DataError("save", "no", 403);
    expect(writeErrorMessage(forbidden, "save the thing"))
      .toBe("You do not have permission to save the thing. Ask your administrator if you believe you should.");
    expect(writeErrorMessage(new PlanError(0, 1, "x", forbidden), "save the thing"))
      .toBe(`${LQ}x${RQ} failed: save failed: no.`);
  });

  it("UT-PLANWRITE-005 a gone row (directly or inside a PlanError) shows the record-gone sentence, wrapped by the prefix when given", () => {
    const gone = new RecordGoneError("rename", "vsb_x", "id-1");
    expect(writeErrorMessage(gone, "save")).toBe(RECORD_GONE_TEXT);
    expect(writeErrorMessage(new PlanError(1, 2, "second", gone), "save")).toBe(RECORD_GONE_TEXT);
    expect(writeErrorMessage(gone, "save", (d) => `Failed: ${d}`)).toBe(`Failed: ${RECORD_GONE_TEXT}`);
  });
});
