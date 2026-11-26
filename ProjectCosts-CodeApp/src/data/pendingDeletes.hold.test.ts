// @vitest-environment jsdom
/**
 * CA-03 (dvopt T-06, `HOLD_TAB_FOR_DEFERRED_DELETES`): the browser asks before the tab is closed while an Add Cost from Table Save's
 * deferred deletes (or the reconcile after them) are pending, and only then. The listener is the app's one shared `beforeunload`
 * hold (`@/components/beforeUnload`), taken and given back by the pending-delete registry.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPendingDeletes, pendingDeletes } from "./pendingDeletes";
import { resetCapexOptFlags, setCapexOptFlags } from "./capexOptFlags";

const beforeUnloadListeners = (spy: { mock: { calls: unknown[][] } }) =>
  spy.mock.calls.filter((call) => call[0] === "beforeunload").length;

afterEach(() => {
  vi.restoreAllMocks();
  resetCapexOptFlags();
});

describe("the registry takes the hold while a Save is pending", () => {
  it("UT-CA03-001 the hold is taken when the first Save is registered and given back when it is released", () => {
    const release = vi.fn();
    const hold = vi.fn(() => release);
    const registry = createPendingDeletes(hold);
    expect(hold).not.toHaveBeenCalled();
    const done = registry.add({ contractIds: ["c-1"], costIds: ["k-1"] });
    expect(hold).toHaveBeenCalledTimes(1);
    expect(release).not.toHaveBeenCalled();
    done();
    expect(release).toHaveBeenCalledTimes(1);
    done(); // idempotent
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("UT-CA03-002 two overlapping Saves hold once and release when the LAST settles", () => {
    const release = vi.fn();
    const hold = vi.fn(() => release);
    const registry = createPendingDeletes(hold);
    const first = registry.add({ contractIds: ["c-1"] });
    const second = registry.add({ costIds: ["k-9"] });
    expect(hold).toHaveBeenCalledTimes(1);
    first();
    expect(release).not.toHaveBeenCalled();
    second();
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("UT-CA03-003 a Save with no deferred id still holds: its totals reconcile is pending", () => {
    const release = vi.fn();
    const registry = createPendingDeletes(() => release);
    const done = registry.add({});
    expect(release).not.toHaveBeenCalled();
    done();
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("UT-CA03-004 a hold that cannot be taken, or given back, never fails the Save or its settle", () => {
    const throwing = createPendingDeletes(() => { throw new Error("no window"); });
    expect(() => throwing.add({ contractIds: ["c-1"] })()).not.toThrow();
    const stuck = createPendingDeletes(() => () => { throw new Error("cannot release"); });
    const done = stuck.add({ contractIds: ["c-1"] });
    expect(() => done()).not.toThrow();
    expect(stuck.snapshot().contractIds.size).toBe(0);
  });

  it("UT-CA03-005 a bare registry (no hold given) behaves as before", () => {
    const registry = createPendingDeletes();
    const done = registry.add({ contractIds: ["C-1"] });
    expect([...registry.snapshot().contractIds]).toEqual(["c-1"]);
    done();
    expect(registry.snapshot().contractIds.size).toBe(0);
  });
});

describe("the app's registry registers the real beforeunload listener", () => {
  it("UT-CA03-010 a pending Save registers ONE listener on the window, removed after the release", () => {
    const add = vi.spyOn(window, "addEventListener");
    const remove = vi.spyOn(window, "removeEventListener");
    const first = pendingDeletes.add({ contractIds: ["c-1"] });
    const second = pendingDeletes.add({ costIds: ["k-1"] });
    expect(beforeUnloadListeners(add)).toBe(1);
    first();
    expect(beforeUnloadListeners(remove)).toBe(0);
    second();
    expect(beforeUnloadListeners(remove)).toBe(1);
  });

  it("UT-CA03-011 while pending, a beforeunload event is cancelled (the browser prompts); after the release it is not", () => {
    const done = pendingDeletes.add({ contractIds: ["c-1"] });
    const during = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(during);
    expect(during.defaultPrevented).toBe(true);
    done();
    const after = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(after);
    expect(after.defaultPrevented).toBe(false);
  });

  it("UT-CA03-012 with HOLD_TAB_FOR_DEFERRED_DELETES off no listener is registered, as before", () => {
    setCapexOptFlags({ HOLD_TAB_FOR_DEFERRED_DELETES: false });
    const add = vi.spyOn(window, "addEventListener");
    const done = pendingDeletes.add({ contractIds: ["c-1"] });
    expect(beforeUnloadListeners(add)).toBe(0);
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    done();
  });

  it("UT-CA03-013 the registry's own contents are unchanged by the hold (ids still hidden until released)", () => {
    const done = pendingDeletes.add({ contractIds: ["C-7"], costIds: ["K-7"] });
    expect(pendingDeletes.snapshot().contractIds.has("c-7")).toBe(true);
    expect(pendingDeletes.snapshot().costIds.has("k-7")).toBe(true);
    done();
    expect(pendingDeletes.snapshot().contractIds.has("c-7")).toBe(false);
  });
});
