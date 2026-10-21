/**
 * GridPager — NEW component. The portfolio grid's footer: a total-row count on the left and
 * first / previous / page-label / next on the right.
 *
 * Composed into `DataGrid`'s existing `footer` slot rather than built into the grid, for two
 * reasons. Paging is a *query* concern owned by the screen that holds the `useQuery`, not by
 * a component whose job is to render N rows quickly; and putting page state inside the grid
 * would invite the next author to slice `rows` client-side, which is the "never materialise a
 * table to filter it" violation the repo's own rules open with.
 *
 * All the arithmetic lives in `@/domain/paging` as pure functions, so the two strings this
 * renders — "Total Rows: 1127" and "Page: 1 from 6" — are asserted by tests rather than by
 * eye.
 */
import { makeStyles, tokens, Button, Tooltip } from "@fluentui/react-components";
import {
  ChevronLeftRegular,
  ChevronRightRegular,
  ChevronDoubleLeftRegular,
  ChevronDoubleRightRegular,
} from "@fluentui/react-icons";
import { space } from "@/theme/tokens";
import {
  computePaging,
  firstDisabled,
  lastDisabled,
  nextDisabled,
  pagerLabel,
  pagerVisible,
  prevDisabled,
  totalRowsLabel,
} from "@/domain/paging";

export interface GridPagerProps {
  totalRows: number;
  /** 1-based. */
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  /** While the first page is still in flight the total is not yet known. */
  loading?: boolean;
}

const useStyles = makeStyles({
  root: {
    display: "flex", alignItems: "center", gap: space.m,
    width: "100%", justifyContent: "space-between", flexWrap: "wrap",
  },
  total: { fontSize: "13px", color: tokens.colorNeutralForeground2 },
  nav: { display: "flex", alignItems: "center", gap: space.xs },
  label: {
    fontSize: "13px", color: tokens.colorNeutralForeground2,
    padding: `0 ${space.s}`, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums",
  },
});

export function GridPager({
  totalRows, page, pageSize, onPageChange, loading = false,
}: GridPagerProps) {
  const s = useStyles();
  const p = computePaging(totalRows, pageSize, page);

  return (
    <div className={s.root}>
      <span className={s.total}>{loading ? "Total Rows: …" : totalRowsLabel(p)}</span>

      {/* The canvas hides the whole pager container when there is only one page. */}
      {pagerVisible(p) && (
        <div className={s.nav}>
          <Tooltip content="First page" relationship="label" withArrow>
            <Button
              size="small" appearance="subtle" icon={<ChevronDoubleLeftRegular />}
              disabled={firstDisabled(p)} onClick={() => onPageChange(1)}
              aria-label="First page"
            />
          </Tooltip>
          <Tooltip content="Previous page" relationship="label" withArrow>
            <Button
              size="small" appearance="subtle" icon={<ChevronLeftRegular />}
              disabled={prevDisabled(p)} onClick={() => onPageChange(p.page - 1)}
              aria-label="Previous page"
            />
          </Tooltip>

          <span className={s.label} aria-live="polite">{pagerLabel(p)}</span>

          {/* Filled, matching the screenshot's blue next button. */}
          <Tooltip content="Next page" relationship="label" withArrow>
            <Button
              size="small" appearance="primary" icon={<ChevronRightRegular />}
              disabled={nextDisabled(p)} onClick={() => onPageChange(p.page + 1)}
              aria-label="Next page"
            />
          </Tooltip>
          <Tooltip content="Last page" relationship="label" withArrow>
            <Button
              size="small" appearance="subtle" icon={<ChevronDoubleRightRegular />}
              disabled={lastDisabled(p)} onClick={() => onPageChange(p.totalPages)}
              aria-label="Last page"
            />
          </Tooltip>
        </div>
      )}
    </div>
  );
}
