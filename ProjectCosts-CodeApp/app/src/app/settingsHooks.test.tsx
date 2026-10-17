// @vitest-environment jsdom
/**
 * Wave A hooks: H2 useBusyRunner, H3 usePanelState, H4 useConfirmDialog, H5 useToggleSet,
 * H6 useTouched / shownError. One file keeps the jsdom worker count down.
 */
import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useBusyRunner } from "./useBusyRunner";
import { usePanelState } from "./usePanelState";
import { useConfirmDialog } from "./useConfirmDialog";
import { useToggleSet } from "./useToggleSet";
import { shownError, useTouched } from "./useTouched";

const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

describe("useBusyRunner (H2)", () => {
  it("sets the label while running and clears it on success; returns the value; calls onStart", async () => {
    const onStart = vi.fn();
    const { result } = renderHook(() => useBusyRunner({ onStart }));
    const d = deferred<number>();
    let out: Promise<number>;
    act(() => { out = result.current.run("Saving…", () => d.promise); });
    expect(result.current.busy).toBe("Saving…");
    expect(result.current.isBusy).toBe(true);
    expect(onStart).toHaveBeenCalledTimes(1);
    await act(async () => { d.resolve(7); await out; });
    expect(result.current.busy).toBeUndefined();
    expect(result.current.isBusy).toBe(false);
    await expect(out!).resolves.toBe(7);
  });

  it("clears the label on throw and rethrows", async () => {
    const { result } = renderHook(() => useBusyRunner());
    await act(async () => {
      await expect(result.current.run("x", () => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    });
    expect(result.current.busy).toBeUndefined();
  });

  it("inline mode sets `inline`, not `busy`", async () => {
    const { result } = renderHook(() => useBusyRunner());
    const d = deferred<void>();
    let out: Promise<void>;
    act(() => { out = result.current.run("Updating…", () => d.promise, { inline: "task-1" }); });
    expect(result.current.inline).toBe("task-1");
    expect(result.current.busy).toBeUndefined();
    expect(result.current.isBusy).toBe(true);
    await act(async () => { d.resolve(); await out; });
    expect(result.current.inline).toBeUndefined();
  });

  it("Wave C: inlineLabel is the inline run's label, cleared with `inline` (also on throw); never set by an overlay run", async () => {
    const { result } = renderHook(() => useBusyRunner());
    expect(result.current.inlineLabel).toBeUndefined();
    const d = deferred<void>();
    let out: Promise<void>;
    act(() => { out = result.current.run("Updating completion…", () => d.promise, { inline: "task-1" }); });
    expect(result.current.inlineLabel).toBe("Updating completion…");
    await act(async () => { d.reject(new Error("x")); await out.catch(() => {}); });
    expect(result.current.inline).toBeUndefined();
    expect(result.current.inlineLabel).toBeUndefined();
    const o = deferred<void>();
    let overlay: Promise<void>;
    act(() => { overlay = result.current.run("Saving…", () => o.promise); });
    expect(result.current.inlineLabel).toBeUndefined();
    await act(async () => { o.resolve(); await overlay; });
  });

  it("track: concurrent per-id pending", async () => {
    const { result } = renderHook(() => useBusyRunner());
    const a = deferred<void>();
    const b = deferred<void>();
    let pa: Promise<void>; let pb: Promise<void>;
    act(() => { pa = result.current.track("a", () => a.promise); pb = result.current.track("b", () => b.promise); });
    expect(result.current.isPending("a")).toBe(true);
    expect(result.current.isPending("b")).toBe(true);
    await act(async () => { a.resolve(); await pa; });
    expect(result.current.isPending("a")).toBe(false);
    expect(result.current.isPending("b")).toBe(true);
    await act(async () => { b.reject(new Error("x")); await pb.catch(() => {}); });
    expect(result.current.isPending("b")).toBe(false);
  });
});

describe("usePanelState (H3)", () => {
  it("open increments the key and clears the error; patch; close clears both", () => {
    const { result } = renderHook(() => usePanelState<{ name: string; n: number }>());
    expect(result.current.panel).toBeNull();
    act(() => result.current.setError("old"));
    act(() => result.current.open({ name: "a", n: 1 }));
    expect(result.current.key).toBe(1);
    expect(result.current.error).toBeUndefined();
    act(() => result.current.patch({ n: 2 }));
    expect(result.current.panel).toEqual({ name: "a", n: 2 });
    act(() => result.current.patch((p) => ({ ...p, name: "b" })));
    expect(result.current.panel).toEqual({ name: "b", n: 2 });
    act(() => result.current.setError("failed"));
    expect(result.current.error).toBe("failed");
    act(() => result.current.open({ name: "c", n: 3 }));
    expect(result.current.key).toBe(2);
    expect(result.current.error).toBeUndefined();
    act(() => { result.current.setError("x"); result.current.close(); });
    expect(result.current.panel).toBeNull();
    expect(result.current.error).toBeUndefined();
  });

  it("patch on a closed panel is a no-op", () => {
    const { result } = renderHook(() => usePanelState<{ n: number }>());
    act(() => result.current.patch({ n: 1 }));
    expect(result.current.panel).toBeNull();
  });
});

describe("useConfirmDialog (H4)", () => {
  it("default flow: busy while running, closes on success", async () => {
    const { result } = renderHook(() => useConfirmDialog<"delete", { id: string }>());
    act(() => result.current.ask("delete", { id: "1" }));
    expect(result.current.state).toEqual({ kind: "delete", payload: { id: "1" } });
    const d = deferred<void>();
    const run = vi.fn(() => d.promise);
    let p: Promise<void>;
    act(() => { p = result.current.confirm(run); });
    expect(result.current.busy).toBe(true);
    expect(run).toHaveBeenCalledWith({ kind: "delete", payload: { id: "1" } });
    act(() => result.current.cancel());
    expect(result.current.state).not.toBeNull();
    await act(async () => { d.resolve(); await p; });
    expect(result.current.state).toBeNull();
    expect(result.current.busy).toBe(false);
  });

  it("default flow: failure keeps the dialog open with errorText; ask clears the error", async () => {
    const { result } = renderHook(() => useConfirmDialog<"deactivate", string>());
    act(() => result.current.ask("deactivate", "acc-1"));
    await act(async () => {
      await result.current.confirm(() => Promise.reject(new Error("403")), { errorText: (e) => `Failed: ${(e as Error).message}` });
    });
    expect(result.current.state).not.toBeNull();
    expect(result.current.error).toBe("Failed: 403");
    expect(result.current.busy).toBe(false);
    act(() => result.current.ask("deactivate", "acc-2"));
    expect(result.current.error).toBeUndefined();
    act(() => result.current.cancel());
    expect(result.current.state).toBeNull();
  });

  it("closeFirst: closes before running; failures propagate", async () => {
    const { result } = renderHook(() => useConfirmDialog<"delete">());
    act(() => result.current.ask("delete", undefined));
    let seenOpen: boolean | undefined;
    await act(async () => {
      await expect(result.current.confirm(async () => {
        seenOpen = result.current.state !== null;
        throw new Error("x");
      }, { closeFirst: true })).rejects.toThrow("x");
    });
    expect(result.current.state).toBeNull();
    expect(result.current.busy).toBe(false);
    expect(seenOpen).toBeDefined();
  });

  it("confirm without an open dialog does nothing", async () => {
    const { result } = renderHook(() => useConfirmDialog<"delete">());
    const run = vi.fn(() => Promise.resolve());
    await act(async () => { await result.current.confirm(run); });
    expect(run).not.toHaveBeenCalled();
  });
});

describe("useToggleSet (H5)", () => {
  it("toggle, add, remove, clear, replace, values", () => {
    const { result } = renderHook(() => useToggleSet<string>(["a"]));
    expect(result.current.has("a")).toBe(true);
    act(() => result.current.toggle("b"));
    expect([...result.current.values].sort()).toEqual(["a", "b"]);
    act(() => result.current.toggle("a"));
    expect(result.current.has("a")).toBe(false);
    act(() => { result.current.add("c"); result.current.remove("b"); });
    expect([...result.current.values]).toEqual(["c"]);
    act(() => result.current.replace(["x", "y"]));
    expect([...result.current.values].sort()).toEqual(["x", "y"]);
    act(() => result.current.clear());
    expect(result.current.values.size).toBe(0);
  });

  it("scope isolation: a scope's ids survive switching away and back", () => {
    const { result, rerender } = renderHook(({ scope }) => useToggleSet<string>(undefined, scope), { initialProps: { scope: "DE|1" } });
    act(() => result.current.add("3"));
    expect(result.current.has("3")).toBe(true);
    rerender({ scope: "FR|2" });
    expect(result.current.has("3")).toBe(false);
    act(() => { result.current.add("5"); });
    act(() => { result.current.clear(); });
    rerender({ scope: "DE|1" });
    expect(result.current.has("3")).toBe(true);
    expect([...result.current.values]).toEqual(["3"]);
  });
});

describe("useTouched / shownError (H6)", () => {
  it("touch, touchAll, reset, any", () => {
    const { result } = renderHook(() => useTouched<"name" | "number">());
    expect(result.current.any).toBe(false);
    act(() => result.current.touch("name"));
    expect(result.current.isTouched("name")).toBe(true);
    expect(result.current.isTouched("number")).toBe(false);
    expect(result.current.any).toBe(true);
    act(() => result.current.touchAll(["name", "number"]));
    expect(result.current.isTouched("number")).toBe(true);
    act(() => result.current.reset());
    expect(result.current.any).toBe(false);
  });

  it("shownError matrix", () => {
    const BLANK = "Input cannot be blank.";
    expect(shownError(undefined, true)).toBeUndefined();
    // CAPEX rule: wait for the touch.
    expect(shownError("Name is required", false)).toBeUndefined();
    expect(shownError("Name is required", true)).toBe("Name is required");
    // Contracts rule: only the blank error waits.
    expect(shownError(BLANK, false, BLANK)).toBeUndefined();
    expect(shownError(BLANK, true, BLANK)).toBe(BLANK);
    expect(shownError("Max 2 decimals", false, BLANK)).toBe("Max 2 decimals");
  });
});
