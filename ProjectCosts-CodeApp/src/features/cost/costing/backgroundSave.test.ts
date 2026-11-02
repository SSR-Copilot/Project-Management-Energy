/**
 * WS-F — the background Save's pure decision and its handle (`./backgroundSave`).
 * The wiring through a real `QueryClient` is `useSaveAddCostSheet.background.test.tsx`.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BACKGROUND_SAVE, BACKGROUND_SAVE_MSG, BACKGROUND_SAVE_STATUS_TEST_ID, backgroundSaveApplies,
  backgroundSaveRunning, beginBackgroundSave, type BackgroundSaveHandle,
} from "./backgroundSave";

const fakes = () => {
  const done = vi.fn();
  const release = vi.fn();
  const notify = { progress: vi.fn(() => done), success: vi.fn() };
  const holdUnload = vi.fn(() => release);
  return { done, release, notify, holdUnload };
};

/** Every handle a test opened, settled afterwards so the module registry starts empty. */
const opened: BackgroundSaveHandle[] = [];
afterEach(() => { for (const h of opened.splice(0)) h.settle("failed"); });
const begin = (projectId: string, deps: Parameters<typeof beginBackgroundSave>[1]) => {
  const h = beginBackgroundSave(projectId, deps);
  opened.push(h);
  return h;
};

describe("backgroundSave (WS-F)", () => {
  it("UT-ACBG-001 the flag is OFF by default (enabling it is the product owner's call)", () => {
    expect(BACKGROUND_SAVE).toBe(false);
  });

  it("UT-ACBG-002 a Save runs in the background only with the flag on and nothing spared by the past-cost guard", () => {
    expect(backgroundSaveApplies({ enabled: true, blockedByPastCosts: 0 })).toBe(true);
    expect(backgroundSaveApplies({ enabled: false, blockedByPastCosts: 0 })).toBe(false);
    expect(backgroundSaveApplies({ enabled: true, blockedByPastCosts: 1 })).toBe(false);
  });

  it("UT-ACBG-003 begin shows the NEW status with its test id, holds the unload guard and registers the project", () => {
    const f = fakes();
    begin("p-1", { notify: f.notify, holdUnload: f.holdUnload });
    expect(f.notify.progress).toHaveBeenCalledWith(BACKGROUND_SAVE_MSG.saving, { testId: BACKGROUND_SAVE_STATUS_TEST_ID });
    expect(BACKGROUND_SAVE_MSG.saving).toBe("Saving the cost table in the background...");
    expect(f.holdUnload).toHaveBeenCalledTimes(1);
    expect(backgroundSaveRunning("p-1")).toBe(true);
    expect(backgroundSaveRunning("p-2")).toBe(false);
    expect(backgroundSaveRunning(undefined)).toBe(false);
  });

  it("UT-ACBG-004 settle('saved') clears the status, releases the guard and the registration, then says saved", () => {
    const f = fakes();
    const h = begin("p-1", { notify: f.notify, holdUnload: f.holdUnload });
    h.settle("saved");
    expect(f.done).toHaveBeenCalledTimes(1);
    expect(f.release).toHaveBeenCalledTimes(1);
    expect(backgroundSaveRunning("p-1")).toBe(false);
    expect(f.notify.success).toHaveBeenCalledWith(BACKGROUND_SAVE_MSG.saved);
  });

  it("UT-ACBG-005 settle('failed') releases everything without a success toast; settling twice is a no-op", () => {
    const f = fakes();
    const h = begin("p-1", { notify: f.notify, holdUnload: f.holdUnload });
    h.settle("failed");
    h.settle("saved");
    expect(f.done).toHaveBeenCalledTimes(1);
    expect(f.release).toHaveBeenCalledTimes(1);
    expect(f.notify.success).not.toHaveBeenCalled();
    expect(backgroundSaveRunning("p-1")).toBe(false);
  });

  it("UT-ACBG-006 two Saves of one project: the project stays registered until both settled", () => {
    const a = begin("p-1", { notify: fakes().notify, holdUnload: fakes().holdUnload });
    const b = begin("p-1", { notify: fakes().notify, holdUnload: fakes().holdUnload });
    a.settle("saved");
    expect(backgroundSaveRunning("p-1")).toBe(true);
    b.settle("saved");
    expect(backgroundSaveRunning("p-1")).toBe(false);
  });

  it("UT-ACBG-007 never throws: a broken toaster or unload guard does not stop the registration or its release", () => {
    const notify = {
      progress: vi.fn(() => { throw new Error("toaster gone"); }),
      success: vi.fn(() => { throw new Error("toaster gone"); }),
    };
    const holdUnload = vi.fn(() => { throw new Error("no window"); });
    const h = begin("p-1", { notify, holdUnload });
    expect(backgroundSaveRunning("p-1")).toBe(true);
    expect(() => h.settle("saved")).not.toThrow();
    expect(backgroundSaveRunning("p-1")).toBe(false);
  });
});
