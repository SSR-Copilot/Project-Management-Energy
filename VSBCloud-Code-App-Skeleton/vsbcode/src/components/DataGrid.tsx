/**
 * DataGrid — NEW component. Replaces the canvas galleries and the PowerCAT grid controls
 * that carry most of the control count on the big screens (Generators 642 controls,
 * Finance 604, Capex 355).
 *
 * Why it is new: a canvas gallery renders every visible row as a nested control tree, which
 * is why those screens are slow. This grid virtualises rows, so 5,000 rows scroll at 60 fps
 * and the DOM holds only what is on screen.
 *
 * Responsive: at < 768px the grid switches to a stacked card list, one card per row with
 * label/value pairs, because a 9-column table is unusable on a phone.
 *
 * ─── on the opt-in props ────────────────────────────────────────────────────────────────
 * `selectionMode`, `rowAccent`, `zebra`, `horizontalScroll`, `sort`/`onSortChange` and
 * `allowClearSort` were added for the portfolio grid. Every one of them defaults to the
 * behaviour this component had before they existed, because 19 other screens render it and
 * **none of them may need an edit**. There are no component tests in this repo — the 1,300+
 * tests are all pure-function tests — so `tsc` plus that invariant is the only safety net.
 * Keep it: if you add a prop here, its absence must produce the previous render.
 */
import { useMemo, useRef, useState, type ReactNode, type CSSProperties } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { makeStyles, tokens, mergeClasses, Text, Button, Radio } from "@fluentui/react-components";
import { ArrowSortUpRegular, ArrowSortDownRegular, ArrowSortRegular } from "@fluentui/react-icons";
import { space, media, radius, palette } from "@/theme/tokens";
import { useBreakpoint } from "./useBreakpoint";
import { LoadingOverlay } from "./LoadingOverlay";

export interface Column<T> {
  key: string;
  header: string;
  /** CSS grid track, e.g. "minmax(160px, 2fr)" or "120px". */
  width?: string;
  align?: "start" | "end" | "center";
  render?: (row: T) => ReactNode;
  value?: (row: T) => string | number | null | undefined;
  sortable?: boolean;
  /** Hide below this breakpoint on the desktop table. */
  hideBelow?: "md" | "lg" | "xl";
  numeric?: boolean;
}

export interface SortState {
  key: string;
  dir: "asc" | "desc";
}

/** Width of the radio-select track, in px. */
const SELECT_TRACK = 44;
/** Width of the row accent bar, in px. */
const ACCENT_WIDTH = 4;

export interface DataGridProps<T> {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  loading?: boolean;
  emptyMessage?: string;
  onRowClick?: (row: T) => void;
  selectedKey?: string | null;
  /** Fixed height; omit to fill the parent. */
  height?: number | string;
  rowHeight?: number;
  caption?: string;
  footer?: ReactNode;

  /** `"single"` prepends a radio column. Default `"none"`. */
  selectionMode?: "none" | "single";
  /** Fires alongside `onRowClick` when the radio itself is used. */
  onSelectionChange?: (key: string | null, row: T | null) => void;

  /**
   * A per-row colour for the 4px left bar — the portfolio grid uses it for approval state.
   * Return `undefined` for no bar. Drawn after the radio track, never over it.
   */
  rowAccent?: (row: T) => string | undefined;
  /** Accessible name for the bar, so colour is not the only carrier of meaning. */
  rowAccentLabel?: (row: T) => string | undefined;

  /** Tint alternating rows. Default `false`. */
  zebra?: boolean;

  /**
   * Let the columns exceed the container and scroll sideways, header included.
   *
   * Off by default, and deliberately so: it wraps the header and body in one `max-content`
   * track so they scroll together, which only behaves when every column has a definite
   * width. Screens using `1fr`/`minmax()` tracks must leave it off.
   */
  horizontalScroll?: boolean;

  /**
   * Controlled sort. Supply `onSortChange` and the grid stops sorting `rows` itself — the
   * server already ordered them.
   */
  sort?: SortState | null;
  onSortChange?: (next: SortState | null) => void;
  /** Seeds the uncontrolled sort. Ignored when `sort` is supplied. */
  defaultSort?: SortState | null;
  /** Show the footer's "Clear sort" button. Default `true`. */
  allowClearSort?: boolean;
}

const useStyles = makeStyles({
  wrap: {
    display: "flex", flexDirection: "column", minHeight: 0, minWidth: 0, flex: 1,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: radius.md,
    backgroundColor: tokens.colorNeutralBackground1,
    overflow: "hidden",
    position: "relative",
  },
  scroller: { overflow: "auto", flex: 1, minHeight: 0 },
  /** Only used with `horizontalScroll`: one track wide enough for every column. */
  hScrollInner: { width: "max-content", minWidth: "100%" },
  head: {
    display: "grid",
    position: "sticky", top: 0, zIndex: 2,
    backgroundColor: tokens.colorNeutralBackground2,
    borderBottom: `1px solid ${tokens.colorNeutralStroke1}`,
  },
  th: {
    display: "flex", alignItems: "center", gap: "4px",
    padding: `10px ${space.m}`,
    fontSize: "11px", fontWeight: 600, letterSpacing: ".04em", textTransform: "uppercase",
    color: tokens.colorNeutralForeground3,
    userSelect: "none", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
  },
  thSortable: { cursor: "pointer", ":hover": { color: tokens.colorBrandForeground1 } },
  row: {
    display: "grid", alignItems: "center",
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    ":hover": { backgroundColor: tokens.colorNeutralBackground1Hover },
  },
  /**
   * Zebra. Rows are absolutely positioned by the virtualiser, so `:nth-child` cannot work —
   * this is applied from the virtual index instead. It carries its own `:hover` because
   * otherwise its background would win over `s.row`'s hover rule.
   */
  rowOdd: {
    // GUIDE p06: the portfolio grid bands in the brand tint, not in a neutral grey — the
    // alternating rows read as clearly blue against off-white in the recording. Only the
    // screens that opt into `zebra` see this, which today is the portfolio grid alone.
    backgroundColor: palette.themeLighter,
    ":hover": { backgroundColor: tokens.colorNeutralBackground1Hover },
  },
  rowClickable: { cursor: "pointer" },
  rowSelected: {
    backgroundColor: tokens.colorBrandBackground2,
    boxShadow: `inset 3px 0 0 0 ${tokens.colorBrandStroke1}`,
  },
  td: {
    padding: `0 ${space.m}`, fontSize: "13px", minWidth: 0,
    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
    color: tokens.colorNeutralForeground1,
  },
  numeric: { fontVariantNumeric: "tabular-nums", textAlign: "right", justifyContent: "flex-end" },
  /**
   * `align` on a `td` sets `textAlign` only — never `display: flex`. A raw text node inside a
   * flex container becomes an anonymous flex item and `text-overflow: ellipsis` stops working,
   * which would visibly regress the narrow formatted-number columns on Finance.
   */
  alignEnd: { textAlign: "right" },
  alignCenter: { textAlign: "center" },
  alignStart: { textAlign: "left" },
  /** The header is already flex, so it needs the matching main-axis rule too. */
  headAlignEnd: { justifyContent: "flex-end" },
  headAlignCenter: { justifyContent: "center" },
  selectCell: {
    display: "flex", alignItems: "center", justifyContent: "center",
    paddingLeft: "0", paddingRight: "0",
  },
  accent: {
    position: "absolute", top: "0", bottom: "0",
    width: `${ACCENT_WIDTH}px`,
    pointerEvents: "none",
  },
  srOnly: {
    position: "absolute", width: "1px", height: "1px",
    overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap",
  },
  empty: {
    padding: space.xxxl, textAlign: "center", color: tokens.colorNeutralForeground3,
    display: "grid", placeItems: "center", gap: space.s, minHeight: "160px",
  },
  footer: {
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
    padding: `8px ${space.m}`,
    backgroundColor: tokens.colorNeutralBackground2,
    fontSize: "12px", color: tokens.colorNeutralForeground3,
    display: "flex", gap: space.m, alignItems: "center", flexWrap: "wrap",
  },
  hideMd: { [media.belowMd]: { display: "none" } },
  hideLg: { [media.belowLg]: { display: "none" } },
  hideXl: { [media.belowXl]: { display: "none" } },

  /* stacked card mode */
  cards: { display: "flex", flexDirection: "column", gap: space.s, padding: space.s },
  card: {
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: radius.md,
    padding: space.m,
    backgroundColor: tokens.colorNeutralBackground1,
    display: "flex", flexDirection: "column", gap: "6px",
  },
  cardSelected: {
    borderTopColor: tokens.colorBrandStroke1, borderRightColor: tokens.colorBrandStroke1,
    borderBottomColor: tokens.colorBrandStroke1, borderLeftColor: tokens.colorBrandStroke1,
    backgroundColor: tokens.colorBrandBackground2,
  },
  pair: { display: "grid", gridTemplateColumns: "minmax(88px, 38%) 1fr", gap: space.s, fontSize: "13px" },
  pairLabel: { color: tokens.colorNeutralForeground3, fontSize: "11px", textTransform: "uppercase", letterSpacing: ".04em", alignSelf: "center" },
  pairValue: { minWidth: 0, overflowWrap: "anywhere" },
});

export function DataGrid<T>({
  rows, columns, rowKey, loading = false, emptyMessage = "Nothing to show yet.",
  onRowClick, selectedKey, height, rowHeight = 40, caption, footer,
  selectionMode = "none", onSelectionChange,
  rowAccent, rowAccentLabel, zebra = false, horizontalScroll = false,
  sort, onSortChange, defaultSort = null, allowClearSort = true,
}: DataGridProps<T>) {
  const s = useStyles();
  const bp = useBreakpoint();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [internalSort, setInternalSort] = useState<SortState | null>(defaultSort);

  // Controlled when `sort` is PASSED, not when it is truthy: `null` is the legal controlled
  // value for "unsorted". Testing truthiness here would either kill sorting on the 19
  // uncontrolled screens or double-sort the server-ordered one.
  const controlled = sort !== undefined;
  const activeSort = controlled ? sort : internalSort;

  const applySort = (next: SortState | null) => {
    if (!controlled) setInternalSort(next);
    onSortChange?.(next);
  };

  const cell = (c: Column<T>, r: T): ReactNode =>
    c.render ? c.render(r) : String(c.value?.(r) ?? "");

  const sorted = useMemo(() => {
    // In controlled mode the server already applied `$orderby`. Re-sorting the page here
    // would order the 200 visible rows differently from the 1,127-row table.
    if (controlled) return rows;
    if (!activeSort) return rows;
    const col = columns.find((c) => c.key === activeSort.key);
    if (!col?.value) return rows;
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = col.value!(a), bv = col.value!(b);
      if (av === bv) return 0;
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      const c = av > bv ? 1 : -1;
      return activeSort.dir === "desc" ? -c : c;
    });
    return copy;
  }, [rows, activeSort, columns, controlled]);

  const visible = useMemo(
    () =>
      columns.filter((c) => {
        if (c.hideBelow === "md" && bp.belowMd) return false;
        if (c.hideBelow === "lg" && bp.belowLg) return false;
        if (c.hideBelow === "xl" && bp.belowXl) return false;
        return true;
      }),
    [columns, bp.belowMd, bp.belowLg, bp.belowXl],
  );

  const selecting = selectionMode === "single";
  const template =
    (selecting ? `${SELECT_TRACK}px ` : "") +
    visible.map((c) => c.width ?? "minmax(120px, 1fr)").join(" ");

  const virtualizer = useVirtualizer({
    count: sorted.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 12,
  });

  const toggleSort = (key: string) =>
    applySort(
      activeSort?.key !== key
        ? { key, dir: "asc" }
        : activeSort.dir === "asc"
          ? { key, dir: "desc" }
          : null,
    );

  const hideClass = (c: Column<T>) =>
    c.hideBelow === "md" ? s.hideMd : c.hideBelow === "lg" ? s.hideLg : c.hideBelow === "xl" ? s.hideXl : undefined;

  /** `numeric` keeps working; an explicit `align` overrides it. */
  const effAlign = (c: Column<T>) => c.align ?? (c.numeric ? "end" : undefined);
  const alignCell = (c: Column<T>) => {
    const a = effAlign(c);
    return a === "end" ? s.alignEnd : a === "center" ? s.alignCenter : a === "start" ? s.alignStart : undefined;
  };
  const alignHead = (c: Column<T>) => {
    const a = effAlign(c);
    return a === "end" ? s.headAlignEnd : a === "center" ? s.headAlignCenter : undefined;
  };

  const select = (k: string, r: T) => {
    onRowClick?.(r);
    onSelectionChange?.(k, r);
  };

  /* -------- stacked cards on phones -------- */
  if (bp.belowMd) {
    return (
      <div className={s.wrap} style={{ height }}>
        {loading && <LoadingOverlay />}
        <div className={s.scroller} ref={scrollRef}>
          {sorted.length === 0 && !loading ? (
            <div className={s.empty}><Text>{emptyMessage}</Text></div>
          ) : (
            <div className={s.cards}>
              {sorted.map((r) => {
                const k = rowKey(r);
                const accent = rowAccent?.(r);
                return (
                  <div
                    key={k}
                    className={mergeClasses(s.card, selectedKey === k && s.cardSelected)}
                    // Longhands: `makeStyles` bans the shorthand, and the habit is worth
                    // keeping inline where the value is computed.
                    style={
                      accent
                        ? ({ borderLeftWidth: "4px", borderLeftStyle: "solid", borderLeftColor: accent } as CSSProperties)
                        : undefined
                    }
                    onClick={() => select(k, r)}
                    role={onRowClick ? "button" : undefined}
                    tabIndex={onRowClick ? 0 : undefined}
                    onKeyDown={(e) => { if (onRowClick && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); select(k, r); } }}
                  >
                    {/* `columns`, not `visible`: on a phone every column belongs in the card,
                        and `visible` has already dropped the `hideBelow: "md"` ones. */}
                    {columns.map((c) => (
                      <div key={c.key} className={s.pair}>
                        <span className={s.pairLabel}>{c.header}</span>
                        <span className={mergeClasses(s.pairValue, c.numeric && s.numeric)}>{cell(c, r)}</span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        {footer && <div className={s.footer}>{footer}</div>}
      </div>
    );
  }

  /* -------- virtualised table -------- */
  const head = (
    <div className={s.head} style={{ gridTemplateColumns: template } as CSSProperties} role="row">
      {selecting && <div className={s.th} role="columnheader" aria-label="Select" />}
      {visible.map((c) => (
        <div
          key={c.key}
          role="columnheader"
          aria-sort={activeSort?.key === c.key ? (activeSort.dir === "asc" ? "ascending" : "descending") : "none"}
          className={mergeClasses(s.th, c.sortable && s.thSortable, c.numeric && s.numeric, alignHead(c), hideClass(c))}
          onClick={c.sortable ? () => toggleSort(c.key) : undefined}
          onKeyDown={c.sortable ? (e) => { if (e.key === "Enter") toggleSort(c.key); } : undefined}
          tabIndex={c.sortable ? 0 : undefined}
        >
          <span>{c.header}</span>
          {c.sortable &&
            (activeSort?.key !== c.key ? <ArrowSortRegular fontSize={12} />
              : activeSort.dir === "asc" ? <ArrowSortUpRegular fontSize={12} />
              : <ArrowSortDownRegular fontSize={12} />)}
        </div>
      ))}
    </div>
  );

  const body =
    sorted.length === 0 && !loading ? (
      <div className={s.empty}>
        <Text>{emptyMessage}</Text>
        {caption && <Text size={200}>{caption}</Text>}
      </div>
    ) : (
      <div style={{ height: virtualizer.getTotalSize(), position: "relative" } as CSSProperties}>
        {virtualizer.getVirtualItems().map((v) => {
          const r = sorted[v.index];
          const k = rowKey(r);
          const accent = rowAccent?.(r);
          const isSelected = selectedKey === k;
          return (
            <div
              key={k}
              role="row"
              aria-rowindex={v.index + 1}
              aria-selected={selecting ? isSelected : undefined}
              className={mergeClasses(
                s.row,
                zebra && v.index % 2 === 1 && !isSelected && s.rowOdd,
                onRowClick && s.rowClickable,
                isSelected && s.rowSelected,
              )}
              style={{
                gridTemplateColumns: template,
                position: "absolute", top: 0, left: 0, width: "100%",
                height: v.size, transform: `translateY(${v.start}px)`,
              } as CSSProperties}
              onClick={() => select(k, r)}
              tabIndex={onRowClick ? 0 : undefined}
              onKeyDown={(e) => { if (onRowClick && e.key === "Enter") select(k, r); }}
            >
              {accent && (
                <span
                  className={s.accent}
                  aria-hidden="true"
                  // Sits after the radio track so it never covers the control.
                  style={{ left: selecting ? SELECT_TRACK : 0, backgroundColor: accent } as CSSProperties}
                />
              )}
              {accent && rowAccentLabel?.(r) && (
                <span className={s.srOnly}>{rowAccentLabel(r)}</span>
              )}
              {selecting && (
                <div className={mergeClasses(s.td, s.selectCell)} role="cell">
                  <Radio
                    checked={isSelected}
                    aria-label={`Select ${k}`}
                    // The row's own onClick would otherwise fire a second time.
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => select(k, r)}
                  />
                </div>
              )}
              {visible.map((c) => (
                <div key={c.key} role="cell"
                  className={mergeClasses(s.td, c.numeric && s.numeric, alignCell(c), hideClass(c))}
                  title={typeof c.value?.(r) === "string" ? String(c.value(r)) : undefined}
                >
                  {cell(c, r)}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    );

  return (
    // `role="table"`, not `grid`: the cells are not individually focusable. Previously the
    // row/columnheader/cell roles had no table ancestor at all, which is invalid ARIA.
    <div className={s.wrap} style={{ height }} role="table" aria-rowcount={sorted.length}>
      {loading && <LoadingOverlay />}
      {horizontalScroll ? (
        // Header and body share ONE `max-content` track inside the scroller, so they scroll
        // sideways together. Only valid when every column has a definite width.
        <div className={s.scroller} ref={scrollRef}>
          <div className={s.hScrollInner}>
            {head}
            <div role="rowgroup">{body}</div>
          </div>
        </div>
      ) : (
        // The pre-existing structure, byte for byte: header as a sibling of the scroller.
        // Left alone so the 19 screens that render fr/minmax tracks cannot shift.
        <>
          {head}
          <div className={s.scroller} ref={scrollRef} role="rowgroup">
            {body}
          </div>
        </>
      )}

      {(footer || sorted.length > 0) && (
        <div className={s.footer}>
          {footer ?? <span>{sorted.length.toLocaleString()} rows</span>}
          {allowClearSort && activeSort && (
            <Button size="small" appearance="subtle" onClick={() => applySort(null)}>
              Clear sort
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
