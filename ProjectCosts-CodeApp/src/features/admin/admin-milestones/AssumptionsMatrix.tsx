/**
 * Read-only matrix of one country: the header strip
 * (`con_Header_MilestonesStandardAssumptionsDetails_AdminScreen`) and the per-technology rows
 * (`gal_MilestonesStandardAssumptions_AdminScreen`, row `con_Details_MilestonesStandardAssumptions_AdminScreen`),
 * AMS:308-796. Every `data-testid` is the canvas label name; row cells add `-<technology>`.
 *
 * One row per technology; each value cell is two stacked lines — duration, then success rate.
 * Fixed column widths from the canvas header chain.
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
  table: { minWidth: "1030px", tableLayout: "fixed" },
  headRow: { backgroundColor: palette.Grayscale40 },
  headCell: { fontWeight: tokens.fontWeightSemibold, height: "32px" },
  center: { textAlign: "center", "& > *": { justifyContent: "center" } },
  sticky: {
    position: "sticky", left: 0, zIndex: 1,
    backgroundColor: palette.white,
  },
  stickyHead: { backgroundColor: palette.Grayscale40 },
  row: { height: "55px" },
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
            <TableHeaderCell className={styles.headCell} style={{ width: 130 }} aria-label="Values">
              <span data-testid="lbl_BlankSubLabels_MilestonesStandardAssumptions_AdminScreen" />
            </TableHeaderCell>
            {MATRIX_COLUMNS.map((c) => (
              <TableHeaderCell key={c.key} className={mergeClasses(styles.headCell, styles.center)} style={{ width: c.width }}>
                <span data-testid={c.headerTestId}>{c.label}</span>
              </TableHeaderCell>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.map((group) => {
            const label = technologyLabel(group.technology);
            /* A blank Technology is its own row with an empty label, as in the canvas (AMS:767). */
            const rowKey = group.technology ?? "none";
            return (
              <TableRow key={rowKey} className={styles.row} data-testid={`con_Details_MilestonesStandardAssumptions_AdminScreen-${rowKey}`}>
                <TableCell className={styles.sticky} aria-label={label ? undefined : technologyName(group.technology)}>
                  <Text className={styles.tech} data-testid={`lbl_TechnologyValue_MilestonesStandardAssumptions_AdminScreen-${rowKey}`}>{label}</Text>
                </TableCell>
                <TableCell>
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
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
