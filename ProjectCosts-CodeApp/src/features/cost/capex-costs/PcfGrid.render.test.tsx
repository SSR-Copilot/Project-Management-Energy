// @vitest-environment jsdom
/**
 * OPT-25 (B4) - the CAPEX grid no longer rebuilds and repaints on every parent render.
 *
 * Proof by COUNTS, not wall-clock (strategy pattern 6): the vendored `GridRenderer` is replaced by a
 * counter, and `gridRows` is wrapped by one. The grid stays mounted behind the Add/Edit panel, and the
 * Screen re-renders it on every keystroke with FRESH, equal-valued props (a new `accounts` array, new
 * standard-option objects, a new cluster-date array, a new `onAction`). Before the fix each of those
 * renders ran `gridRows` (about 60k payments on a big category), built the dataset and repainted the whole DOM.
 *
 *   OLD (measured on the unmodified code, 5 parent renders with unchanged rendered inputs):
 *       grid.render calls: 6 (1 mount + 5), gridRows calls: 6
 *   NEW: grid.render calls: 1 (mount), gridRows calls: 1.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import type { CostAccount, CostLine } from "../costing/model";
import type { GridCallback } from "./pcf/ui/GridRenderer";
import type { GridCommentIndicators } from "./comments";

const renderSpy = vi.fn();
const rowsSpy = vi.fn();
let rendererOnAction: GridCallback = () => undefined;
const contexts: { mode: { allocatedWidth: number; allocatedHeight: number }; parameters: Record<string, { raw?: unknown } & Record<string, unknown>> }[] = [];

vi.mock("./pcf/ui/GridRenderer", () => ({
  GridRenderer: class {
    constructor(_c: unknown, _e: unknown, _m: unknown, onAction: GridCallback) { rendererOnAction = onAction; }
    render(ctx: (typeof contexts)[number]) { renderSpy(); contexts.push(ctx); }
    destroy() { /* counter only */ }
  },
}));
vi.mock("./pcf/ui/ActionDropdown", () => ({ ActionDropdown: class { destroy() { /* counter only */ } } }));
vi.mock("./gridRows", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./gridRows")>();
  return { ...actual, gridRows: (...args: Parameters<typeof actual.gridRows>) => { rowsSpy(); return actual.gridRows(...args); } };
});

import { PcfGrid, type StandardOptionRow } from "./PcfGrid";

const ACCOUNTS: CostAccount[] = [
  { id: "acc-1", number: "80000", name: "Turbine", category: 0 },
  { id: "sub-1", number: "80000_0", name: "Turbine", parentId: "acc-1", category: 0 },
];
const ACCOUNTS_2: CostAccount[] = [...ACCOUNTS, { id: "sub-2", number: "80000_1", name: "Other", parentId: "acc-1", category: 0 }];
const line = (id: string): CostLine => ({
  id, accountId: "sub-1", description: id, total: 10, payments: [],
} as unknown as CostLine);
const LINES: CostLine[] = [line("c-1")];
const LINES_2: CostLine[] = [line("c-1"), line("c-2")];
const FLAGS: ReadonlyMap<string, GridCommentIndicators> = new Map();
const FLAGS_2: ReadonlyMap<string, GridCommentIndicators> = new Map();
const STD: StandardOptionRow[] = [{ id: "s-1", subaccountId: "sub-1", name: "Standard A" }];
const DATES = ["2020-01-01", "2021-01-01", undefined, undefined, undefined, undefined] as const;

type Props = Parameters<typeof PcfGrid>[0];
/** Fresh, EQUAL-valued props per call: what the Screen hands the grid on every render. */
function props(over: Partial<Props> = {}): Props {
  return {
    accounts: [...ACCOUNTS], lines: LINES, year: 2026, showEmpty: true, showPlanned: false, payer: "Show All Cost",
    clusterDates: [...DATES], standardOptions: STD.map(o => ({ ...o })), commentFlags: FLAGS,
    onAction: (() => undefined) as GridCallback, writeActionsDisabled: false,
    ...over,
  };
}

let tick: (() => void)[] = [];
let measured = { width: 800, height: 400 };
beforeEach(() => {
  renderSpy.mockClear(); rowsSpy.mockClear(); contexts.length = 0; tick = []; measured = { width: 800, height: 400 };
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => measured.width });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => measured.height });
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("PcfGrid repaint counts (OPT-25)", () => {
  it("UT-PCFGRID-OPT-001 parent renders with unchanged rendered inputs cause no repaint and no gridRows run", () => {
    const view = render(<PcfGrid {...props()} />);
    expect(renderSpy).toHaveBeenCalledTimes(1);
    expect(rowsSpy).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 5; i++) view.rerender(<PcfGrid {...props()} />);
    expect(rowsSpy).toHaveBeenCalledTimes(1);
    expect(renderSpy).toHaveBeenCalledTimes(1);
  });

  const cases: [string, () => Partial<Props>][] = [
    ["year", () => ({ year: 2027 })],
    ["showEmpty", () => ({ showEmpty: false })],
    ["showPlanned", () => ({ showPlanned: true })],
    ["payer", () => ({ payer: "DevCo" })],
    ["lines", () => ({ lines: LINES_2 })],
    ["accounts", () => ({ accounts: [...ACCOUNTS_2] })],
    ["commentFlags", () => ({ commentFlags: FLAGS_2 })],
    ["clusterDates", () => ({ clusterDates: ["2020-01-01", "2022-06-01", undefined, undefined, undefined, undefined] })],
    ["standardOptions", () => ({ standardOptions: [{ id: "s-1", subaccountId: "sub-1", name: "Standard B" }] })],
    ["writeActionsDisabled", () => ({ writeActionsDisabled: true })],
  ];
  it.each(cases)("UT-PCFGRID-OPT-002 changing only %s repaints exactly once", (name, change) => {
    const view = render(<PcfGrid {...props()} />);
    renderSpy.mockClear(); rowsSpy.mockClear();
    view.rerender(<PcfGrid {...props(change())} />);
    expect(renderSpy).toHaveBeenCalledTimes(1);
    // `gridRows` reruns only for the inputs it reads.
    expect(rowsSpy).toHaveBeenCalledTimes(["year", "lines", "accounts", "commentFlags"].includes(name) ? 1 : 0);
    // ... and the repaint carries the new value.
    const p = contexts.at(-1)!.parameters;
    if (name === "year") expect(p.StartYear!.raw).toBe(2027);
    if (name === "writeActionsDisabled") expect(p.WriteActionsDisabled!.raw).toBe(true);
    if (name === "payer") expect(p.CostPaidByFilter!.raw).toBe("DevCo");
    if (name === "showEmpty") expect(p.ShowEmptyAccounts!.raw).toBe(false);
    if (name === "showPlanned") expect(p.ShowPlannedCost!.raw).toBe(true);
    if (name === "standardOptions") expect(p.StandardContractOptions!.sortedRecordIds).toEqual(["s-1"]);
    if (name === "clusterDates") expect((p.Cluster2Date!.raw as Date).getMonth()).toBe(5);
  });

  it("UT-PCFGRID-OPT-003 the latest onAction is still the one the renderer calls (read through a ref)", () => {
    const first = vi.fn(); const second = vi.fn();
    const view = render(<PcfGrid {...props({ onAction: first })} />);
    view.rerender(<PcfGrid {...props({ onAction: second })} />);
    expect(renderSpy).toHaveBeenCalledTimes(1);
    // The renderer holds ONE callback (made at mount); it must reach the LATEST onAction.
    rendererOnAction("Edit", "c-1");
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith("Edit", "c-1");
  });

  it("UT-PCFGRID-OPT-004 the dataset is built once per rows, not once per paint", () => {
    const view = render(<PcfGrid {...props()} />);
    const first = contexts.at(-1)!.parameters.DevexCapexCostSummary;
    view.rerender(<PcfGrid {...props({ showPlanned: true })} />);
    // A repaint for a non-row input reuses the SAME dataset object (rows unchanged).
    expect(contexts.at(-1)!.parameters.DevexCapexCostSummary).toBe(first);
    view.rerender(<PcfGrid {...props({ showPlanned: true, lines: LINES_2 })} />);
    expect(contexts.at(-1)!.parameters.DevexCapexCostSummary).not.toBe(first);
  });
});

describe("PcfGrid ResizeObserver (OPT-25 d)", () => {
  /** A stub observer whose callback the test fires by hand, and a manual requestAnimationFrame. */
  function stubObserver() {
    const callbacks: (() => void)[] = [];
    vi.stubGlobal("ResizeObserver", class { constructor(cb: () => void) { callbacks.push(cb); } observe() { /* stub */ } disconnect() { /* stub */ } });
    vi.stubGlobal("requestAnimationFrame", (cb: () => void) => { tick.push(cb); return tick.length; });
    vi.stubGlobal("cancelAnimationFrame", () => { tick = []; });
    const fire = () => callbacks.forEach(cb => cb());
    const flush = () => { const t = tick; tick = []; t.forEach(cb => cb()); };
    return { fire, flush };
  }

  it("UT-PCFGRID-OPT-005 a burst of observer ticks at an unchanged size repaints nothing", () => {
    const { fire, flush } = stubObserver();
    render(<PcfGrid {...props()} />);
    const base = renderSpy.mock.calls.length;
    for (let i = 0; i < 10; i++) fire();
    flush();
    expect(renderSpy.mock.calls.length).toBe(base);
  });

  it("UT-PCFGRID-OPT-006 a burst of ticks after a width change repaints exactly once, with the new width", () => {
    const { fire, flush } = stubObserver();
    render(<PcfGrid {...props()} />);
    const base = renderSpy.mock.calls.length;
    measured = { width: 1000, height: 400 };
    for (let i = 0; i < 10; i++) fire();
    flush();
    expect(renderSpy.mock.calls.length).toBe(base + 1);
    expect(contexts.at(-1)!.mode.allocatedWidth).toBe(1000);
    // and a second burst at the same (new) size is quiet.
    for (let i = 0; i < 5; i++) fire();
    flush();
    expect(renderSpy.mock.calls.length).toBe(base + 1);
  });
});
