import { useLayoutEffect, useMemo, useRef } from "react";
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
}) {
  const host = useRef<HTMLDivElement>(null);
  const current = useRef(props);
  const paint = useRef<() => void>(() => {});

  /*
   * Rows are derived from the data, not from the viewport — but `render()` is called by a
   * `ResizeObserver` as well as by prop changes. Recomputing them inside `render()` meant every
   * resize rebuilt the whole row set. Memoising on the three inputs that actually affect it
   * keeps a resize to a pure repaint.
   */
  const rows = useMemo(
    () => gridRows(props.accounts, props.lines, props.year, props.commentFlags),
    [props.accounts, props.lines, props.year, props.commentFlags],
  );
  const currentRows = useRef<FlatRow[]>(rows);

  useLayoutEffect(() => {
    current.current = props;
    currentRows.current = rows;
    paint.current();
  }, [props, rows]);
  useLayoutEffect(() => {
    const element = host.current!;
    const onAction: GridCallback = (...args) => current.current.onAction(...args);
    const menu = new ActionDropdown(onAction);
    const grid = new GridRenderer(element, new Set(), menu, onAction);
    const render = () => {
      const p = current.current;
      grid.render({ mode: { allocatedWidth: Math.max(element.clientWidth, 1), allocatedHeight: Math.max(element.clientHeight, 300) },
        parameters: { DevexCapexCostSummary: dataset(currentRows.current), StandardContractOptions: standardDataset(p.standardOptions),
          StartYear: { raw: p.year }, ShowEmptyAccounts: { raw: p.showEmpty }, ShowPlannedCost: { raw: p.showPlanned }, CostPaidByFilter: { raw: p.payer },
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
    const resize = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(render);
    resize?.observe(element); render();
    return () => { paint.current = () => {}; resize?.disconnect(); element.removeEventListener("PCF_RE_RENDER", render); grid.destroy(); menu.destroy(); element.replaceChildren(); };
  }, []);
  return <div className="canvas-pcf-host" ref={host} aria-label="DEVEX/CAPEX cost grid" />;
}
