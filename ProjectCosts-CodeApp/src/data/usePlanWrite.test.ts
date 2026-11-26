/**
 * UT-PLANWRITE — the message `usePlanWrite` shows for a refused or failed plan. PM's texts are
 * pinned as strings; the one addition is the "deleted by someone else" sentence for a gone row,
 * which only a guarded update (never set by a PM plan) can raise.
 */
import { afterEach, describe, expect, it } from "vitest";
import { DataError, RECORD_GONE_TEXT, RecordGoneError } from "@/platform/errors";
import { BulkRowsGoneError } from "./bulkBackend";
import { PlanError, PlanRefusedError } from "./executePlan";
import { PARTLY_SAVED_NOTE, PartlySavedJobError, writeErrorMessage } from "./usePlanWrite";
import { setPlanEngineFlags } from "./writePlan";

const LQ = "“";
const RQ = "”";

describe("writeErrorMessage", () => {
  // PLAN_PERMISSION_LOOKUP ships OFF at integration (WE-07, owner decision on the visible text); the tests of the lookup switch it ON.
  afterEach(() => setPlanEngineFlags(null));

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

  it("UT-PLANWRITE-004 permission is checked first, on the error itself and (dvopt T-15, WE-07) inside a PlanError", () => {
    setPlanEngineFlags({ permissionLookup: true });
    const forbidden = new DataError("save", "no", 403);
    const text = "You do not have permission to save the thing. Ask your administrator if you believe you should.";
    expect(writeErrorMessage(forbidden, "save the thing")).toBe(text);
    // WE-07: UT-PLANWRITE-004 used to pin that a PlanError wrapper was NOT looked through ("x" failed: save failed: no.).
    expect(writeErrorMessage(new PlanError(0, 1, "x", forbidden), "save the thing")).toBe(text);
  });

  it("UT-PLANWRITE-033 a 403 inside a PlanError that had already saved changes says so after the permission sentence", () => {
    setPlanEngineFlags({ permissionLookup: true });
    const forbidden = new DataError("save", "no", 403);
    const text = "You do not have permission to save the thing. Ask your administrator if you believe you should.";
    expect(writeErrorMessage(new PlanError(2, 5, "x", forbidden), "save the thing"))
      .toBe(`${text} 2 of 5 changes had already been saved.`);
    expect(writeErrorMessage(new PartlySavedJobError(2, 5, "x", forbidden), "save the thing"))
      .toBe(`${text} 2 of 5 changes had already been saved. ${PARTLY_SAVED_NOTE}`);
  });

  it("UT-PLANWRITE-034 the permission text is found a few causes deep, and a non-403 cause chain reads as before", () => {
    setPlanEngineFlags({ permissionLookup: true });
    const forbidden = new DataError("save", "no", 403);
    const wrapped = new Error("outer", { cause: new Error("middle", { cause: forbidden }) });
    expect(writeErrorMessage(new PlanError(0, 1, "x", wrapped), "save the thing")).toMatch(/^You do not have permission to save the thing/);
    const notForbidden = new DataError("save", "boom", 500);
    expect(writeErrorMessage(new PlanError(0, 1, "x", notForbidden), "save the thing")).toBe(`${LQ}x${RQ} failed: save failed: boom.`);
  });

  it("UT-PLANWRITE-035 with PLAN_PERMISSION_LOOKUP off the earlier text returns (the PlanError wrapper is not looked through)", () => {
    setPlanEngineFlags({ permissionLookup: false });
    try {
      expect(writeErrorMessage(new PlanError(0, 1, "x", new DataError("save", "no", 403)), "save the thing"))
        .toBe(`${LQ}x${RQ} failed: save failed: no.`);
    } finally {
      setPlanEngineFlags(null);
    }
  });

  it("UT-PLANWRITE-036 PLAN_PERMISSION_LOOKUP ships OFF at integration until the owner approves the new text: the earlier text is the default", () => {
    expect(writeErrorMessage(new PlanError(0, 1, "x", new DataError("save", "no", 403)), "save the thing"))
      .toBe(`${LQ}x${RQ} failed: save failed: no.`);
  });

  it("UT-PLANWRITE-005 a gone row (directly or inside a PlanError) shows the record-gone sentence, wrapped by the prefix when given", () => {
    const gone = new RecordGoneError("rename", "vsb_x", "id-1");
    expect(writeErrorMessage(gone, "save")).toBe(RECORD_GONE_TEXT);
    expect(writeErrorMessage(new PlanError(1, 2, "second", gone), "save")).toBe(RECORD_GONE_TEXT);
    expect(writeErrorMessage(gone, "save", (d) => `Failed: ${d}`)).toBe(`Failed: ${RECORD_GONE_TEXT}`);
  });

  it("UT-PLANWRITE-013 a bulk step's rows-gone failure reads as its own message, bare or inside a PlanError, wrapped by the prefix when given", () => {
    const gone = new BulkRowsGoneError(["a", "b", "c"]);
    const text = "3 row(s) no longer exist. Reload the page and try again.";
    expect(writeErrorMessage(gone, "save")).toBe(text);
    // With changes already saved (done > 0) the saved-count sentence follows (F2, finding 1); with none, the text is bare.
    const mid = `${text} 2 of 9 changes had already been saved.`;
    expect(writeErrorMessage(new PlanError(2, 9, "status", gone), "save")).toBe(mid);
    expect(writeErrorMessage(new PlanError(2, 9, "status", gone), "save", (d) => `Failed: ${d}`)).toBe(`Failed: ${mid}`);
    expect(writeErrorMessage(new PlanError(0, 9, "status", gone), "save")).toBe(text);
  });

  it("UT-PLANWRITE-014 a PlanError counted in rows keeps the same sentence: N of M changes had already been saved", () => {
    const error = new PlanError(37, 52, "allocations", new Error("chunk 2 of 3 failed"));
    expect(writeErrorMessage(error, "save")).toBe(`${LQ}allocations${RQ} failed: chunk 2 of 3 failed. 37 of 52 changes had already been saved.`);
  });
});
