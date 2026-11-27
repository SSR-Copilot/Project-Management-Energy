// @vitest-environment jsdom
/**
 * MEM audit (throwaway): mount / unmount the screens' long-lived resources N times and count what is still registered.
 * Counts: addEventListener minus removeEventListener per (target, type, listener, capture), live ResizeObservers,
 * timers (setTimeout / setInterval) and animation frames still pending, nodes left under document.body.
 */
import { appendFileSync, writeFileSync } from "node:fs";
import { createElement as h, StrictMode, useRef } from "react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { act, cleanup, render, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PcfGrid } from "../../../../ProjectCosts-CodeApp/src/features/cost/capex-costs/PcfGrid";
import { SpreadSheetComp } from "../../../../ProjectCosts-CodeApp/src/features/cost/add-costs-from-table/spreadsheet/SpreadSheet";
import { holdBeforeUnload } from "../../../../ProjectCosts-CodeApp/src/components/beforeUnload";
import { useMediaQuery } from "../../../../ProjectCosts-CodeApp/src/components/useMediaQuery";
import { useGeneratorsWarmup } from "../../../../ProjectCosts-CodeApp/src/app/generatorsWarmup";
import { useTrimmedGridPaste } from "../../../../ProjectCosts-CodeApp/src/features/cost/add-costs-from-table/spreadsheet/pasteTrim";

const N = 25;
const OUT = "C:/Personal/Code App Mordenization/Project-Management-Energy-WorkDev1-BottleneckOptimization/ProjectDocs/bottleneck-identification/_bench/MEM/mem.results.txt";
writeFileSync(OUT, "");
const out = (s: string) => appendFileSync(OUT, s + "\n");

/* instrumentation */
const live = new Map<string, number>();
const targetIds = new WeakMap<object, number>();
let nextTarget = 1;
const tid = (t: object) => { let i = targetIds.get(t); if (!i) { i = nextTarget++; targetIds.set(t, i); } return i; };
const lid = new WeakMap<object, number>();
let nextL = 1;
const lkey = (l: unknown) => {
  if (typeof l === "function" || (typeof l === "object" && l)) { let i = lid.get(l as object); if (!i) { i = nextL++; lid.set(l as object, i); } return i; }
  return 0;
};
const capture = (o: unknown) => (typeof o === "boolean" ? o : Boolean((o as { capture?: boolean } | undefined)?.capture));
function instrument(target: EventTarget, label: string) {
  const add = target.addEventListener.bind(target);
  const rem = target.removeEventListener.bind(target);
  target.addEventListener = ((type: string, l: EventListenerOrEventListenerObject, o?: unknown) => {
    const k = `${label}#${tid(target)}|${type}|${lkey(l)}|${capture(o)}`;
    if (!live.has(k)) live.set(k, 1);
    return add(type, l, o as AddEventListenerOptions);
  }) as typeof target.addEventListener;
  target.removeEventListener = ((type: string, l: EventListenerOrEventListenerObject, o?: unknown) => {
    live.delete(`${label}#${tid(target)}|${type}|${lkey(l)}|${capture(o)}`);
    return rem(type, l, o as EventListenerOptions);
  }) as typeof target.removeEventListener;
}

let observers = 0;
const observed = new Set<object>();
class CountingRO {
  constructor(public cb: ResizeObserverCallback) {}
  observe() { if (!observed.has(this)) { observed.add(this); observers += 1; } }
  unobserve() {}
  disconnect() { if (observed.delete(this)) observers -= 1; }
}

const pendingTimers = new Set<unknown>();
const pendingFrames = new Set<number>();
const realSetTimeout = globalThis.setTimeout.bind(globalThis);
const realClearTimeout = globalThis.clearTimeout.bind(globalThis);
const realSetInterval = globalThis.setInterval.bind(globalThis);
const realClearInterval = globalThis.clearInterval.bind(globalThis);
let intervalsStarted = 0;

beforeAll(() => {
  instrument(window, "window");
  instrument(document, "document");
  (globalThis as { ResizeObserver: unknown }).ResizeObserver = CountingRO;
  (window as unknown as { ResizeObserver: unknown }).ResizeObserver = CountingRO;
  globalThis.setTimeout = ((fn: (...a: unknown[]) => void, ms?: number, ...a: unknown[]) => {
    const id = realSetTimeout((...x: unknown[]) => { pendingTimers.delete(id); fn(...x); }, ms, ...a);
    pendingTimers.add(id);
    return id;
  }) as unknown as typeof setTimeout;
  globalThis.clearTimeout = ((id: unknown) => { pendingTimers.delete(id); realClearTimeout(id as never); }) as typeof clearTimeout;
  globalThis.setInterval = ((fn: () => void, ms?: number) => { intervalsStarted += 1; const id = realSetInterval(fn, ms); pendingTimers.add(id); return id; }) as unknown as typeof setInterval;
  globalThis.clearInterval = ((id: unknown) => { pendingTimers.delete(id); realClearInterval(id as never); }) as typeof clearInterval;
  window.requestAnimationFrame = ((cb: FrameRequestCallback) => {
    const id = realSetTimeout(() => { pendingFrames.delete(id as unknown as number); cb(performance.now()); }, 16) as unknown as number;
    pendingFrames.add(id);
    return id;
  }) as typeof window.requestAnimationFrame;
  window.cancelAnimationFrame = ((id: number) => { pendingFrames.delete(id); realClearTimeout(id as never); }) as typeof window.cancelAnimationFrame;
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 800 });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => 400 });
});

afterEach(() => { cleanup(); });

const snapshot = () => ({
  listeners: [...live.keys()].sort(),
  observers,
  timers: pendingTimers.size,
  frames: pendingFrames.size,
  bodyChildren: document.body.children.length,
});
const report = (name: string, before: ReturnType<typeof snapshot>, after: ReturnType<typeof snapshot>) => {
  out(`MEM ${name}: ${N} mount/unmount cycles | listeners ${before.listeners.length} -> ${after.listeners.length} | ` +
    `ResizeObservers ${before.observers} -> ${after.observers} | pending timers ${before.timers} -> ${after.timers} | ` +
    `pending rAF ${before.frames} -> ${after.frames} | body children ${before.bodyChildren} -> ${after.bodyChildren} | setInterval started ${intervalsStarted}`);
  const extra = after.listeners.filter((k) => !before.listeners.includes(k));
  if (extra.length) out(`MEM ${name}: listeners still registered: ${extra.join(" ; ")}`);
};
const flush = async () => { await act(async () => { await new Promise((r) => realSetTimeout(r, 600)); }); };

/* fixtures (as PcfGrid.render.test.tsx) */
const ACCOUNTS = [
  { id: "acc-1", number: "80000", name: "Turbine", category: 0 },
  { id: "sub-1", number: "80000_0", name: "Turbine", parentId: "acc-1", category: 0 },
];
const LINES = [{ id: "c-1", accountId: "sub-1", description: "c-1", total: 10, payments: [] }];
const pcfProps = () => ({
  accounts: [...ACCOUNTS], lines: LINES, year: 2026, showEmpty: true, showPlanned: false, payer: "Show All Cost",
  clusterDates: ["2020-01-01", "2021-01-01", undefined, undefined, undefined, undefined],
  standardOptions: [{ id: "s-1", subaccountId: "sub-1", name: "Standard A" }],
  commentFlags: new Map(), onAction: () => undefined, writeActionsDisabled: false,
}) as never;

const sheet = (rows: number) => {
  const head = [{ value: "Account Number" }, { value: "Account Name" }, { value: "Cost Description" }, { value: "Cost Paid By" }, { value: "Depreciation" }, { value: "Apply VAT" },
    ...Array.from({ length: 12 }, (_, i) => ({ value: `m${i}` }))];
  const body = Array.from({ length: rows }, (_, r) => [{ value: "" }, { value: "" }, { value: `Row ${r}` }, { value: "SPV" }, { value: "Yes" }, { value: "No" },
    ...Array.from({ length: 12 }, () => ({ value: "1" }))]);
  return [head, ...body];
};

describe("MEM mount/unmount leak probe", () => {
  it("PcfGrid (real vendored GridRenderer), with the Add dropdown OPEN at unmount", { timeout: 120000 }, async () => {
    const before = snapshot();
    for (let i = 0; i < N; i++) {
      const view = render(h(PcfGrid, pcfProps()));
      for (let k = 0; k < 4 && !document.querySelector(".pcf-add-menu-btn"); k++) { const t = [...document.querySelectorAll<HTMLElement>(".pcf-toggle")].at(-1); t?.click(); await act(async () => { await Promise.resolve(); }); }
            const add = document.querySelector<HTMLElement>(".pcf-add-menu-btn");
      if (i === 0) out(`MEM PcfGrid: add button present = ${Boolean(add)}; rows=${document.querySelectorAll("tr").length}; buttons=${[...document.querySelectorAll("button")].map((b) => b.className).join(",")}`);
      if (i % 2 === 0) add?.click(); else document.querySelector<HTMLElement>(".pcf-dots-btn")?.click();
      await act(async () => { await Promise.resolve(); });
      if (i === 0) out(`MEM PcfGrid: add dropdown open = ${document.querySelectorAll(".pcf-add-dropdown").length}; row-action menu open (class show) = ${document.querySelectorAll(".pcf-dropdown.show, .pcf-dropdown[style*=block]").length}`);
      view.unmount();
      view.container.remove();
    }
    await flush();
    const after = snapshot();
    report("PcfGrid", before, after);
    expect(after.observers).toBe(before.observers);
  });

  it("SpreadSheetComp (Add Cost grid, 200 rows x 18 cols), StrictMode", { timeout: 120000 }, async () => {
    const before = snapshot();
    for (let i = 0; i < N; i++) {
      const view = render(h(StrictMode, null, h(SpreadSheetComp as never, { data: sheet(200), onDataChange: () => undefined, addRowToken: 0, deleteRowToken: 0, copyTableToken: 0 })));
      await act(async () => { await Promise.resolve(); });
      view.unmount();
      view.container.remove();
    }
    await flush();
    const after = snapshot();
    report("SpreadSheetComp", before, after);
    expect(after.observers).toBe(before.observers);
  });

  it("useTrimmedGridPaste + holdBeforeUnload + useMediaQuery", () => {
    const before = snapshot();
    for (let i = 0; i < N; i++) {
      const release = holdBeforeUnload();
      const a = renderHook(() => { const r = useRef<HTMLElement | null>(document.body); useTrimmedGridPaste(r); });
      const b = renderHook(() => useMediaQuery("(max-width: 959px)"));
      a.unmount(); b.unmount(); release(); a.result; 
    }
    const after = snapshot();
    report("small hooks", before, after);
  });

  it("useGeneratorsWarmup (default: 1.5 s timer), unmounted before it fires", () => {
    const before = snapshot();
    const qc = new QueryClient();
    const wrapper = ({ children }: { children: React.ReactNode }) => h(QueryClientProvider, { client: qc }, children);
    for (let i = 0; i < N; i++) {
      const v = renderHook(() => useGeneratorsWarmup(`p-${i}`, "/project/general"), { wrapper });
      v.unmount();
    }
    const after = snapshot();
    report("useGeneratorsWarmup", before, after);
  });
});
