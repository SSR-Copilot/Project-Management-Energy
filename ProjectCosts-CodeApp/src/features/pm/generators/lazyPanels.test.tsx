// @vitest-environment jsdom
/**
 * UT-GENPERF-340.. — the lazily loaded panels (D143, item 8b): `PanelHost` (nothing until first opened, a named fallback while the
 * chunk loads, mounted afterwards), the preload (idle callback, never throws) and the stable-handler / folding helpers the
 * memoized sections rely on (`useStableCallback`, `useExpandedIds`).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, renderHook, screen, act } from "@testing-library/react";
import { FluentProvider } from "@fluentui/react-components";
import { lazy, useState } from "react";
import { vsbTheme } from "@/theme/fluent";
import { PanelHost } from "./sections/lazyPanels";
import {
  GENERATOR_PANEL_COUNT, InverterPanel, PvPanel, ReplacePvPanel, ReplaceWtgPanel, SimplePanel, SubstructurePanel, TurbinePanel,
  TypePanel, preloadGeneratorPanels, schedulePanelPreload,
} from "./sections/panelLoader";
import { useExpandedIds } from "./sections/useExpandedIds";
import { useStableCallback } from "./sections/useStableCallback";

afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

const shell = (children: React.ReactNode) => <FluentProvider theme={vsbTheme}>{children}</FluentProvider>;

/** A lazy component whose chunk the test releases by hand. */
function deferredPanel() {
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const Loaded = () => <div data-testid="the-panel">panel</div>;
  const Lazy = lazy(async () => { await gate; return { default: Loaded }; });
  return { Lazy, release };
}

describe("PanelHost", () => {
  it("UT-GENPERF-340 a panel that was never opened renders nothing and does not even start its chunk", () => {
    const Lazy = lazy(() => { throw new Error("must not load"); });
    const { container } = render(shell(<PanelHost open={false}><Lazy /></PanelHost>));
    expect(screen.queryByTestId("generators-panel-loading")).toBeNull();
    expect(container.textContent).toBe("");
  });

  it("UT-GENPERF-341 the first open shows the named loading overlay until the chunk lands, then the panel", async () => {
    const { Lazy, release } = deferredPanel();
    const { rerender } = render(shell(<PanelHost open={false}><Lazy /></PanelHost>));
    rerender(shell(<PanelHost open><Lazy /></PanelHost>));
    const overlay = await screen.findByTestId("generators-panel-loading");
    expect(overlay.getAttribute("aria-label")).toBe("generators-panel-loading");
    await act(async () => { release(); await Promise.resolve(); });
    expect(await screen.findByTestId("the-panel")).toBeTruthy();
    expect(screen.queryByTestId("generators-panel-loading")).toBeNull();
  });

  it("UT-GENPERF-342 once opened the panel stays mounted when it closes (its closing animation and state are kept), with no fallback", async () => {
    const { Lazy, release } = deferredPanel();
    const { rerender } = render(shell(<PanelHost open><Lazy /></PanelHost>));
    await act(async () => { release(); await Promise.resolve(); });
    expect(await screen.findByTestId("the-panel")).toBeTruthy();
    rerender(shell(<PanelHost open={false}><Lazy /></PanelHost>));
    expect(screen.getByTestId("the-panel")).toBeTruthy();
    expect(screen.queryByTestId("generators-panel-loading")).toBeNull();
  });

  it("UT-GENPERF-343 a panel closed while its chunk is still loading shows no overlay (nothing is waiting for it)", () => {
    const { Lazy } = deferredPanel();
    const { rerender } = render(shell(<PanelHost open><Lazy /></PanelHost>));
    rerender(shell(<PanelHost open={false}><Lazy /></PanelHost>));
    expect(screen.queryByTestId("generators-panel-loading")).toBeNull();
  });
});

describe("the panel chunks and their preload", () => {
  it("UT-GENPERF-344 the screen has exactly the eight lazy panels, and the preload resolves them all (a loaded chunk is read at once)", async () => {
    const all = [TypePanel, TurbinePanel, PvPanel, SimplePanel, InverterPanel, SubstructurePanel, ReplaceWtgPanel, ReplacePvPanel];
    expect(all).toHaveLength(GENERATOR_PANEL_COUNT);
    expect(GENERATOR_PANEL_COUNT).toBe(8);
    const modules = await preloadGeneratorPanels() as { default: unknown }[];
    expect(modules).toHaveLength(8);
    expect(modules.every((m) => m.default !== undefined)).toBe(true);
    // Idempotent: a second preload is the same import, not eight more.
    const again = await preloadGeneratorPanels() as { default: unknown }[];
    expect(again.map((m) => m.default)).toEqual(modules.map((m) => m.default));
  });

  it("UT-GENPERF-345 after the preload a real panel opens WITHOUT the loading overlay (the synchronous thenable)", async () => {
    await preloadGeneratorPanels();
    render(shell(
      <PanelHost open>
        <SimplePanel
          family="storage" form={{ label: "", capacity: "", energyCapacity: "", supplier: "", dirty: new Set<string>() }}
          errors={null} saveable={false} onTouch={() => {}} onSave={() => {}} onClose={() => {}}
        />
      </PanelHost>,
    ));
    expect(screen.queryByTestId("generators-panel-loading")).toBeNull();
    expect(await screen.findByTestId("txt_GeneratorData_RightPanel_Form_Storage_Fields_StorageLabel")).toBeTruthy();
  });

  it("UT-GENPERF-346 the preload waits for an idle moment when the browser has one, falls back to the next task, and can be cancelled", () => {
    const idle = vi.fn((cb: () => void) => { void cb; return 7; });
    const cancelIdle = vi.fn();
    vi.stubGlobal("requestIdleCallback", idle);
    vi.stubGlobal("cancelIdleCallback", cancelIdle);
    (window as unknown as Record<string, unknown>).requestIdleCallback = idle;
    (window as unknown as Record<string, unknown>).cancelIdleCallback = cancelIdle;
    const cancel = schedulePanelPreload();
    expect(idle).toHaveBeenCalledTimes(1);
    expect(idle.mock.calls[0]).toHaveLength(2);
    cancel();
    expect(cancelIdle).toHaveBeenCalledWith(7);
    delete (window as unknown as Record<string, unknown>).requestIdleCallback;
    delete (window as unknown as Record<string, unknown>).cancelIdleCallback;

    vi.useFakeTimers();
    const cancelTimer = schedulePanelPreload();
    cancelTimer();
    // A cancelled timer never runs the preload: nothing pending.
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("useStableCallback and useExpandedIds", () => {
  it("UT-GENPERF-347 a stable callback keeps one identity and always calls the latest function", () => {
    const { result, rerender } = renderHook(({ n }) => useStableCallback((x: number) => n + x), { initialProps: { n: 1 } });
    const first = result.current;
    expect(first(10)).toBe(11);
    rerender({ n: 5 });
    expect(result.current).toBe(first);
    expect(first(10)).toBe(15);
  });

  it("UT-GENPERF-348 a family's expanded set changes identity only when ITS cards fold or unfold", () => {
    const rows = [{ id: "a" }, { id: "b" }];
    const { result, rerender } = renderHook(({ expanded }) => useExpandedIds(expanded, rows), {
      initialProps: { expanded: new Set(["a", "other-family"]) },
    });
    const first = result.current;
    expect([...first]).toEqual(["a"]);
    // Another family's card folds: this family's set is the same object.
    rerender({ expanded: new Set(["a", "other-family", "another"]) });
    expect(result.current).toBe(first);
    // Its own card unfolds: a new set.
    rerender({ expanded: new Set(["a", "b"]) });
    expect(result.current).not.toBe(first);
    expect([...result.current].sort()).toEqual(["a", "b"]);
    rerender({ expanded: new Set<string>() });
    expect([...result.current]).toEqual([]);
  });

  it("UT-GENPERF-349 a handler read through a stable callback sees the state of the render it was called in (no stale closure)", () => {
    function Probe({ log }: { log: string[] }) {
      const [n, setN] = useState(0);
      const read = useStableCallback(() => log.push(`n=${n}`));
      return <button data-testid="probe" aria-label="probe" onClick={() => { read(); setN(n + 1); }}>go</button>;
    }
    const log: string[] = [];
    render(<Probe log={log} />);
    const b = screen.getByTestId("probe");
    act(() => { b.click(); });
    act(() => { b.click(); });
    expect(log).toEqual(["n=0", "n=1"]);
  });
});
