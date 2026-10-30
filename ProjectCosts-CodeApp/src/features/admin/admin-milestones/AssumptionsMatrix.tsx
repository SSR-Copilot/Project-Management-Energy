/**
 * Read-only matrix of one country: the header strip
 * (`con_Header_MilestonesStandardAssumptionsDetails_AdminScreen`) and the per-technology rows
 * (`gal_MilestonesStandardAssumptions_AdminScreen`, row `con_Details_MilestonesStandardAssumptions_AdminScreen`),
 * AMS:308-796. Every `data-testid` is the canvas label name; row cells add `-<technology>`.
 *
 * One row per technology; each value cell is two stacked lines — duration, then success rate.
 * Fixed column widths from the canvas header chain. A trailing EMPTY column takes whatever width is left, so the
 * grey strip runs to the right edge as in the canvas while every label keeps its canvas position (found by the
 * E2E suite on 28 Oct 2026: with only fixed columns the table stretched them all about 1.6 times).
 * DIVERGENCE: the canvas strip clips at its fixed width; here the wrapper scrolls horizontally
 * and the Technology column is sticky.
 */
import {
  Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow, Text,
  makeStyles, mergeClasses, tokens,
} from "@fluentui/react-components";
import { palette } from "@/theme/tokens";
import { MATRIX_COLUMNS, MATRIX_TEXT, TYPOGRAPHY, technologyLabel, technologyName } from "./constants";
import { matrixCells, type TechnologyGroup } from "./rules";

const useStyles = makeStyles({
  scroller: { overflowX: "auto", maxWidth: "100%" },
  table: { minWidth: "1010px", tableLayout: "fixed" },
  /** The remainder column: no content, no text, takes the width the fixed columns leave. */
  filler: { padding: 0 },
  // The canvas strip is exactly 32 px with no rule under it (AMS:318-326), so no row border and no taller header button.
  headRow: { backgroundColor: palette.Grayscale40, borderBottomWidth: "0" },
  // Canvas header labels are modern Text at the default 14px, Semibold, in a 32px #FAFAFA strip (AMS:318-330, 360).
  headCell: {
    fontWeight: tokens.fontWeightSemibold, fontSize: "14px", height: "32px",
    "& .fui-TableHeaderCell__button": { minHeight: "0", height: "32px", paddingTop: "0", paddingBottom: "0" },
  },
  center: { textAlign: "center", "& > *": { justifyContent: "center" } },
  // The canvas header labels sit in a fixed-width box with no padding, and `lbl_SalesStartDate_…` has `Wrap: false` (AMS:431-439): the
  // label keeps its one line. Fluent's header cell pads both sides, which left "Sales Start" too little room in its 80 px column.
  headCenter: {
    paddingLeft: "0", paddingRight: "0",
    "& .fui-TableHeaderCell__button": { paddingLeft: "0", paddingRight: "0", whiteSpace: "nowrap" },
  },
  sticky: {
    position: "sticky", left: 0, zIndex: 1,
    backgroundColor: palette.white,
  },
  stickyHead: { backgroundColor: palette.Grayscale40 },
  // The canvas rows are 55 px (`TemplateSize: 55`, AMS:527) with no rule between them, and every label carries `PaddingLeft/Right: 4`.
  // Fluent's default cell padding is wider than that, which wrapped "Duration [months]" in the 110 px column and made the row 61 px.
  row: { height: "55px", borderBottomWidth: "0" },
  bodyCell: { paddingLeft: "4px", paddingRight: "4px" },
  // Canvas sizes and weights (`TYPOGRAPHY`).
  tech: { ...TYPOGRAPHY.technology },
  sub: { display: "flex", flexDirection: "column", ...TYPOGRAPHY.subLabel },
  value: {
    display: "flex", flexDirection: "column", alignItems: "center",
    paddingLeft: "4px", paddingRight: "4px", ...TYPOGRAPHY.value,
  },
});

/** Matrix cell key → the canvas value label (`lbl_<X>Value_MilestonesStandardAssumptions_AdminScreen`). */
const VALUE_TEST_ID = new Map(MATRIX_COLUMNS.map((c) => [c.key, c.valueTestId]));

export interface AssumptionsMatrixProps {
  countryName: string;
  groups: readonly TechnologyGroup[];
  locale?: string;
}

export function AssumptionsMatrix({ countryName, groups, locale }: AssumptionsMatrixProps) {
  const styles = useStyles();
  return (
    <div className={styles.scroller}>
      <Table
        size="small"
        className={styles.table}
        // NEW — no canvas equivalent: the table's accessible name.
        aria-label={`Milestone standard assumptions for ${countryName}`}
        data-testid="gal_MilestonesStandardAssumptions_AdminScreen"
      >
        <TableHeader>
          <TableRow className={styles.headRow} data-testid="con_Header_MilestonesStandardAssumptionsDetails_AdminScreen">
            {/* The canvas header labels are Text controls: their ids sit on the text, not the cell. */}
            <TableHeaderCell className={mergeClasses(styles.headCell, styles.sticky, styles.stickyHead)} style={{ width: 100 }}>
              <span data-testid="lbl_Technology_MilestonesStandardAssumptions_AdminScreen">{MATRIX_TEXT.technology}</span>
            </TableHeaderCell>
            {/* `lbl_BlankSubLabels_…` has `Text: ""`; "Values" is its accessible name only (no canvas equivalent). */}
            <TableHeaderCell className={styles.headCell} style={{ width: 110 }} aria-label="Values">
              <span data-testid="lbl_BlankSubLabels_MilestonesStandardAssumptions_AdminScreen" />
            </TableHeaderCell>
            {MATRIX_COLUMNS.map((c) => (
              <TableHeaderCell key={c.key} className={mergeClasses(styles.headCell, styles.center, styles.headCenter)} style={{ width: c.width }}>
                <span data-testid={c.headerTestId}>{c.label}</span>
              </TableHeaderCell>
            ))}
            <TableHeaderCell className={mergeClasses(styles.headCell, styles.filler)} aria-hidden="true" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.map((group) => {
            const label = technologyLabel(group.technology);
            /* A blank Technology is its own row with an empty label, as in the canvas (AMS:767). */
            const rowKey = group.technology ?? "none";
            return (
              <TableRow key={rowKey} className={styles.row} data-testid={`con_Details_MilestonesStandardAssumptions_AdminScreen-${rowKey}`}>
                <TableCell className={mergeClasses(styles.sticky, styles.bodyCell)} aria-label={label ? undefined : technologyName(group.technology)}>
                  <Text className={styles.tech} data-testid={`lbl_TechnologyValue_MilestonesStandardAssumptions_AdminScreen-${rowKey}`}>{label}</Text>
                </TableCell>
                <TableCell className={styles.bodyCell}>
                  <span className={styles.sub} data-testid={`lbl_SubLabelsValue_MilestonesStandardAssumptions_AdminScreen-${rowKey}`}>
                    <span>{MATRIX_TEXT.subLabelDuration}</span>
                    <span>{MATRIX_TEXT.subLabelSuccessRate}</span>
                  </span>
                </TableCell>
                {matrixCells(group, locale).map((cell) => (
                  <TableCell key={cell.key} className={styles.center}>
                    <span className={styles.value} data-testid={`${VALUE_TEST_ID.get(cell.key) ?? cell.key}-${rowKey}`}>
                      <span>{cell.duration}</span>
                      <span>{cell.rate}</span>
                    </span>
                  </TableCell>
                ))}
                <TableCell className={styles.filler} aria-hidden="true" />
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
