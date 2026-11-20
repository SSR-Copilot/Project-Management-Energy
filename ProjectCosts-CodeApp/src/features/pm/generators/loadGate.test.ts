/**
 * UT-GENPERF-032..039, 049, 050 — the pure half of the split load gate (D141): which panel or dialog needs which lazy read, and how the
 * gate reads the 16 reads with the switch on and off. The Screen's own behaviour is `Screen.gate.test.tsx` (040..).
 */
import { describe, expect, it } from "vitest";
import { dataSettling, loadErrorMode } from "./rules";
import { confirmNeedsLazyRead, lazyNeeds, lazyPending, loadGate, readKnown, type GateRead } from "./loadGate";

const NONE = { catalog: false, index: false, device: false, allWtg: false };
const needsOf = (panel: string | null, dialog: string | null = null, family: string | null = null) =>
  lazyNeeds({ panel, dialog, dialogFamily: family }, true);

const known: GateRead = { isLoading: false, error: undefined, hasData: true };
const notStarted: GateRead = { isLoading: false, error: undefined, hasData: false };
const loading: GateRead = { isLoading: true, error: undefined, hasData: false };
const failed: GateRead = { isLoading: false, error: new Error("boom"), hasData: false };

describe("lazyNeeds", () => {
  it("UT-GENPERF-032 switch OFF: every lazy read is needed from the start (today's gate)", () => {
    expect(lazyNeeds({ panel: null, dialog: null }, false)).toEqual({ catalog: true, index: true, device: true, allWtg: true });
  });

  it("UT-GENPERF-033 nothing open, or a panel with no cost maths (BESS, Hydrogen, Substation): no lazy read is needed", () => {
    expect(needsOf(null)).toEqual(NONE);
    for (const panel of ["storage", "hydrogen", "substation"]) expect(needsOf(panel)).toEqual(NONE);
  });

  it("UT-GENPERF-034 each panel needs exactly the reads its plan multiplies", () => {
    expect(needsOf("type")).toEqual({ catalog: true, index: true, device: false, allWtg: true });
    expect(needsOf("turbine")).toEqual({ catalog: false, index: true, device: false, allWtg: true });
    expect(needsOf("replaceWtg")).toEqual({ catalog: true, index: true, device: false, allWtg: false });
    expect(needsOf("pv")).toEqual({ catalog: false, index: false, device: true, allWtg: true });
    for (const panel of ["inverter", "substructure", "replacePv"]) {
      expect(needsOf(panel)).toEqual({ catalog: false, index: false, device: true, allWtg: false });
    }
  });

  it("UT-GENPERF-035 the dialogs that build a plan: Delete Turbine and the height pop-ups the index, Delete PV the device costs", () => {
    expect(needsOf(null, "deleteTurbine")).toEqual({ ...NONE, index: true });
    expect(needsOf("type", "heightType").index).toBe(true);
    expect(needsOf("turbine", "heightTurbine").index).toBe(true);
    expect(needsOf(null, "deleteSimple", "pv")).toEqual({ ...NONE, device: true });
    for (const dialog of [["deleteSimple", "storage"], ["deleteSimple", "inverter"], ["toggleStatus", null], ["deleteType", null], ["blocked", null]] as const) {
      expect(needsOf(null, dialog[0], dialog[1])).toEqual(NONE);
    }
  });

  it("UT-GENPERF-036 only Delete Turbine and Delete PV confirmations are held back while a lazy read is waiting", () => {
    expect(confirmNeedsLazyRead("deleteTurbine")).toBe(true);
    expect(confirmNeedsLazyRead("deleteSimple", "pv")).toBe(true);
    expect(confirmNeedsLazyRead("deleteSimple", "storage")).toBe(false);
    expect(confirmNeedsLazyRead("toggleStatus")).toBe(false);
    expect(confirmNeedsLazyRead(null)).toBe(false);
  });
});

describe("readKnown / lazyPending", () => {
  it("UT-GENPERF-037 a read is known with data, or (a double without hasData) when it is neither loading nor failed", () => {
    expect(readKnown(known)).toBe(true);
    expect(readKnown(notStarted)).toBe(false);
    expect(readKnown(loading)).toBe(false);
    expect(readKnown({ isLoading: false, error: undefined })).toBe(true);
    expect(readKnown({ isLoading: true, error: undefined })).toBe(false);
    expect(readKnown({ isLoading: false, error: new Error("x") })).toBe(false);
  });

  it("UT-GENPERF-038 a lazy read is pending only when it is needed and has no answer; a failed one is a load error, not pending", () => {
    expect(lazyPending(false, notStarted)).toBe(false);
    expect(lazyPending(true, notStarted)).toBe(true);
    expect(lazyPending(true, loading)).toBe(true);
    expect(lazyPending(true, known)).toBe(false);
    expect(lazyPending(true, failed)).toBe(false);
  });
});

describe("loadGate", () => {
  const lazyRead = (read: GateRead, needed: boolean) => ({ read, needed });

  it("UT-GENPERF-039 switch ON: only the list gates; a lazy read that is loading does not hold it, a needed one without an answer holds the writes", () => {
    const list = [known, known];
    expect(loadGate({ gateByList: true, list, lazy: [lazyRead(loading, false)] })).toMatchObject({ loading: false, lazyWaiting: false });
    expect(loadGate({ gateByList: true, list, lazy: [lazyRead(notStarted, true)] })).toMatchObject({ loading: false, lazyWaiting: true });
    expect(loadGate({ gateByList: true, list: [known, loading], lazy: [] })).toMatchObject({ loading: true });
    expect(loadGate({ gateByList: true, list, lazy: [lazyRead(known, true)] }).lazyWaiting).toBe(false);
    // dataSettling sees the waiting read next to the ones that always held writes back.
    expect(dataSettling([{ loading: false }, { loading: true }])).toBe(true);
  });

  it("UT-GENPERF-049 switch OFF: every read gates the list and nothing is 'waiting' (the old gate, read for read)", () => {
    const off = loadGate({ gateByList: false, list: [known], lazy: [lazyRead(loading, false)] });
    expect(off).toMatchObject({ loading: true, lazyWaiting: false });
    expect(loadGate({ gateByList: false, list: [known], lazy: [lazyRead(notStarted, true)] })).toMatchObject({ loading: false, lazyWaiting: false });
  });

  it("UT-GENPERF-050 a lazy read that never started is no load error; one that started and failed blanks the screen (F7), one with data is a banner", () => {
    const quiet = loadGate({ gateByList: true, list: [known], lazy: [lazyRead(notStarted, false)] });
    expect(loadErrorMode(quiet.reads)).toBe("none");
    const bad = loadGate({ gateByList: true, list: [known], lazy: [lazyRead(failed, true)] });
    expect(loadErrorMode(bad.reads)).toBe("blocking");
    const stale = loadGate({ gateByList: true, list: [known], lazy: [lazyRead({ ...failed, hasData: true }, true)] });
    expect(loadErrorMode(stale.reads)).toBe("banner");
  });
});
