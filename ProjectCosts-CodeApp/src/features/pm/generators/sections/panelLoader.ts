/**
 * Project Generators Screen — the heavy panels' chunks and their preload (D143, item 8b).
 *
 * The eight form panels (Add / Edit type, turbine, PV, BESS / Hydrogen / Substation, inverter, substructure, Replace Generator,
 * Replace PV) hold most of the screen's JSX but are needed only once the user opens one. Each is its own chunk (`React.lazy`),
 * so the first view of the list does not download, parse or run them.
 *
 *  - `PanelHost` (`lazyPanels.tsx`) renders nothing until its panel is first opened, then keeps it mounted with `open` false,
 *    exactly as the inline `FormPanel` always was (the drawer's exit animation and its state are unchanged). While the chunk loads
 *    it shows the shared `LoadingOverlay` (blocking, named `generators-panel-loading`).
 *  - `preloadGeneratorPanels` fetches the chunks when the browser is idle after the screen mounts, so the first open normally
 *    finds them loaded. A loaded chunk is handed to React as a synchronous thenable, so a panel opened after the preload does not
 *    suspend at all (no flash of the fallback).
 */
import { lazy, type ComponentType } from "react";

interface PanelModule<P> { default: ComponentType<P> }

/** `React.lazy` plus a `preload` that shares the one import, and resolves synchronously once it has landed. */
function lazyPanel<P extends object>(load: () => Promise<PanelModule<P>>) {
  let loaded: PanelModule<P> | undefined;
  let pending: Promise<PanelModule<P>> | undefined;
  const preload = (): Promise<PanelModule<P>> => (pending ??= load().then((m) => { loaded = m; return m; }));
  const Component = lazy(() => (
    loaded
      // A thenable that calls back at once: React reads the module in the same render and never suspends.
      ? ({ then: (ok: (m: PanelModule<P>) => void) => { ok(loaded as PanelModule<P>); } } as unknown as Promise<PanelModule<P>>)
      : preload()
  ));
  return { Component, preload };
}

const type = lazyPanel(() => import("./panels/TypePanel"));
const turbine = lazyPanel(() => import("./panels/TurbinePanel"));
const pv = lazyPanel(() => import("./panels/PvPanel"));
const simple = lazyPanel(() => import("./panels/SimplePanel"));
const inverter = lazyPanel(() => import("./panels/InverterPanel"));
const substructure = lazyPanel(() => import("./panels/SubstructurePanel"));
const replaceWtg = lazyPanel(() => import("./panels/ReplaceWtgPanel"));
const replacePv = lazyPanel(() => import("./panels/ReplacePvPanel"));

export const TypePanel = type.Component;
export const TurbinePanel = turbine.Component;
export const PvPanel = pv.Component;
export const SimplePanel = simple.Component;
export const InverterPanel = inverter.Component;
export const SubstructurePanel = substructure.Component;
export const ReplaceWtgPanel = replaceWtg.Component;
export const ReplacePvPanel = replacePv.Component;

/** How many panel chunks there are (the tests pin it, so a panel added here is a deliberate change). */
export const GENERATOR_PANEL_COUNT = 8;

/** Starts every panel import; resolves when all have landed. Safe to call more than once. */
export function preloadGeneratorPanels(): Promise<unknown> {
  return Promise.all([
    type.preload(), turbine.preload(), pv.preload(), simple.preload(),
    inverter.preload(), substructure.preload(), replaceWtg.preload(), replacePv.preload(),
  ]);
}

/**
 * Calls `preloadGeneratorPanels` once the browser is idle (`requestIdleCallback`, else the next task); returns the cancel.
 * A failed import is left for the first open to retry through `React.lazy`: the preload never throws.
 */
export function schedulePanelPreload(): () => void {
  const run = () => { void preloadGeneratorPanels().catch(() => undefined); };
  if (typeof window !== "undefined" && typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(run, { timeout: 3000 });
    return () => window.cancelIdleCallback(id);
  }
  const id = setTimeout(run, 0);
  return () => clearTimeout(id);
}
