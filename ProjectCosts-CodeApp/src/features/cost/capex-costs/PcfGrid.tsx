import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { GridRenderer, type GridCallback } from "./pcf/ui/GridRenderer";
import { ActionDropdown } from "./pcf/ui/ActionDropdown";
import { type CostAccount, type CostLine } from "../costing/model";
import { type GridCommentIndicators } from "./comments";
import { gridRows, type FlatRow } from "./gridRows";
import "./pcf/css/TableConnectedToDataversePCF.css";

export { gridRows };

function dataset(rows: FlatRow[]) {
  const keys = [...new Set(rows.flatMap(Object.keys))];
  return { loading: false, columns: keys.map(name => ({ name })), sortedRecordIds: rows.map(r => String(r.RowId)),
    records: Object.fromEntries(rows.map(row => [String(row.RowId), { getValue: (key: string) => row[key], getFormattedValue: (key: string) => String(row[key] ?? "") }])) };
}

/** The StandardContractOptions dataset the PCF reads for the Add Standard Contract submenu. */
function standardDataset(rows: readonly StandardOptionRow[]) {
  const cols = ["StandardContractId", "SubaccountId", "Name"];
  return {
    loading: false, columns: cols.map(name => ({ name })),
    sortedRecordIds: rows.map(r => r.id),
    records: Object.fromEntries(rows.map(r => {
      const flat: FlatRow = { StandardContractId: r.id, SubaccountId: r.subaccountId, Name: r.name };
      return [r.id, { getValue: (key: string) => flat[key], getFormattedValue: (key: string) => String(flat[key] ?? "") }];
    })),
  };
}

/** One row of the `Add Standard Contract` menu the PCF renders per sub-account. */
export interface StandardOptionRow { id: string; subaccountId: string; name: string }

/** Keeps the previous reference while `same` says the new value is equal, so a memo/effect dependency stays put. */
function useStable<T>(value: T, same: (a: T, b: T) => boolean): T {
  const [kept, setKept] = useState(value);
  // The documented "adjust state while rendering" pattern: the extra pass happens only when the value really changed.
  if (kept !== value && !same(kept, value)) setKept(value);
  return same(kept, value) ? kept : value;
}
const sameElements = <T,>(a: readonly T[], b: readonly T[]) => a.length === b.length && a.every((x, i) => x === b[i]);
const sameStandardOptions = (a: readonly StandardOptionRow[], b: readonly StandardOptionRow[]) =>
  a.length === b.length && a.every((x, i) => x.id === b[i]?.id && x.subaccountId === b[i]?.subaccountId && x.name === b[i]?.name);

export function PcfGrid(props: {
  accounts: CostAccount[]; lines: CostLine[]; year: number;
  showEmpty: boolean; showPlanned: boolean; payer: string;
  /** Six cluster START dates, `YYYY-MM-DD`; a cluster the project has no dates for is undefined. */
  clusterDates: readonly (string | undefined)[];
  /** Stage 2.3 — real `buildStandardOptions` output, replacing the empty placeholder dataset. */
  standardOptions: readonly StandardOptionRow[];
  /**
   * Stage 2.4 — `gridCommentIndicators` output, keyed by contract id. Without it every
   * `HasComments` / `M{n}HasComments` the PCF reads is `false` and no red dot ever renders,
   * which is exactly what shipped: `gridRows`' 4th parameter had no caller.
   */
  commentFlags?: ReadonlyMap<string, GridCommentIndicators>;
  onAction: GridCallback;
  /**
   * CA-16 — the screen's `writeCommandsDisabled`. The renderer greys and disables its write menu
   * items (Add New Cost, Add Standard Contract, Edit, Comments, Delete, Set as paid/unpaid) while
   * it holds, instead of offering items the screen's `gridActionAllowed` silently ignores.
   */
  writeActionsDisabled?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const current = useRef(props);
  const paint = useRef<() => void>(() => {});

  /*
   * OPT-25 (D160): the Screen re-renders this grid on every keystroke in the Add/Edit panel with FRESH but equal
   * `accounts` / `clusterDates` / `standardOptions`, and a new `onAction`. Each one used to defeat the `rows`
   * memo and repaint the whole renderer DOM (a `gridRows` pass over every payment, a dataset, a full parse).
   * They are compared by value here, so a repaint happens exactly when a rendered input really changed.
   */
  const accounts = useStable(props.accounts, sameElements);
  const clusterDates = useStable(props.clusterDates, sameElements);
  const standardOptions = useStable(props.standardOptions, sameStandardOptions);

  /*
   * Rows are derived from the data, not from the viewport — but `render()` is called by a
   * `ResizeObserver` as well as by prop changes. Recomputing them inside `render()` meant every
   * resize rebuilt the whole row set. Memoising on the inputs that actually affect it keeps a resize to a pure
   * repaint; the dataset the renderer parses is built next to the rows, once, for the same reason.
   */
  const rows = useMemo(
    () => gridRows(accounts, props.lines, props.year, props.commentFlags),
    [accounts, props.lines, props.year, props.commentFlags],
  );
  const costDataset = useMemo(() => dataset(rows), [rows]);
  const currentDataset = useRef(costDataset);

  // Every render: the ref the renderer's callbacks read (`onAction` is a fresh closure each render). No repaint.
  useLayoutEffect(() => { current.current = props; });
  // A repaint only when a rendered input changed (explicit dependencies, OPT-25).
  const { year, showEmpty, showPlanned, payer, writeActionsDisabled } = props;
  useLayoutEffect(() => {
    currentDataset.current = costDataset;
    paint.current();
  }, [costDataset, year, showEmpty, showPlanned, payer, standardOptions, clusterDates, writeActionsDisabled]);
  useLayoutEffect(() => {
    const element = host.current!;
    const onAction: GridCallback = (...args) => current.current.onAction(...args);
    const menu = new ActionDropdown(onAction);
    const grid = new GridRenderer(element, new Set(), menu, onAction);
    let paintedWidth = -1, paintedHeight = -1;
    const render = () => {
      const p = current.current;
      paintedWidth = Math.max(element.clientWidth, 1); paintedHeight = Math.max(element.clientHeight, 300);
      grid.render({ mode: { allocatedWidth: paintedWidth, allocatedHeight: paintedHeight },
        parameters: { DevexCapexCostSummary: currentDataset.current, StandardContractOptions: standardDataset(p.standardOptions),
          StartYear: { raw: p.year }, ShowEmptyAccounts: { raw: p.showEmpty }, ShowPlannedCost: { raw: p.showPlanned }, CostPaidByFilter: { raw: p.payer },
          // CA-16: not a vendor parameter; read by this app's port of the renderer only.
          WriteActionsDisabled: { raw: p.writeActionsDisabled === true },
          // The cluster timeline header. `gblClusterDurations` in the canvas; a project with a
          // gap in its milestone chain sends `null`, and the PCF simply omits that band.
          ...Object.fromEntries(Array.from({ length: 6 }, (_, i) => [
            `Cluster${i + 1}Date`,
            { raw: p.clusterDates[i] ? new Date(`${p.clusterDates[i]}T12:00:00`) : null },
          ])),
        } });
    };
    paint.current = render;
    element.addEventListener("PCF_RE_RENDER", render);
    /*
     * OPT-25: a burst of observer ticks becomes ONE frame's work, and a tick at the size the grid was last painted
     * at repaints nothing (the renderer has its own observer that re-fits the columns). A new width or height still
     * gets a full render, as before.
     */
    let frame: number | undefined;
    const onResize = () => {
      if (frame !== undefined) return;
      frame = window.requestAnimationFrame(() => {
        frame = undefined;
        if (Math.max(element.clientWidth, 1) === paintedWidth && Math.max(element.clientHeight, 300) === paintedHeight) return;
        render();
      });
    };
    const resize = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(onResize);
    resize?.observe(element); render();
    return () => { paint.current = () => {}; resize?.disconnect(); if (frame !== undefined) window.cancelAnimationFrame(frame); element.removeEventListener("PCF_RE_RENDER", render); grid.destroy(); menu.destroy(); element.replaceChildren(); };
  }, []);
  return <div className="canvas-pcf-host" ref={host} aria-label="DEVEX/CAPEX cost grid" />;
}
