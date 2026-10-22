/**
 * Read-only matrix of one country (Modules F + G: `con_Header_…Details_AdminScreen` strip and
 * `gal_MilestonesStandardAssumptions_AdminScreen`, AMS:308-796).
 *
 * One row per technology; each value cell is two stacked lines — duration, then success rate.
 * Fixed column widths from the canvas header chain; the wrapper scrolls horizontally and the
 * Technology column is sticky (03-responsive-layout §5).
 */
import {
  Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow, Text,
  makeStyles, mergeClasses, tokens,
} from "@fluentui/react-components";
import { palette } from "@/theme/tokens";
import { MATRIX_COLUMNS, TYPOGRAPHY, technologyLabel, technologyName } from "./constants";
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
        aria-label={`Milestone standard assumptions for ${countryName}`}
        data-testid="gal_MilestonesStandardAssumptions_AdminScreen"
      >
        <TableHeader>
          <TableRow className={styles.headRow}>
            <TableHeaderCell className={mergeClasses(styles.headCell, styles.sticky, styles.stickyHead)} style={{ width: 100 }}>
              Technology
            </TableHeaderCell>
            <TableHeaderCell className={styles.headCell} style={{ width: 130 }} aria-label="Values" />
            {MATRIX_COLUMNS.map((c) => (
              <TableHeaderCell key={c.key} className={mergeClasses(styles.headCell, styles.center)} style={{ width: c.width }}>
                {c.label}
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
              <TableRow key={rowKey} className={styles.row}>
                <TableCell className={styles.sticky} aria-label={label ? undefined : technologyName(group.technology)}>
                  <Text className={styles.tech}>{label}</Text>
                </TableCell>
                <TableCell>
                  <span className={styles.sub}>
                    <span>Duration [months]</span>
                    <span>Success Rate [-]</span>
                  </span>
                </TableCell>
                {matrixCells(group, locale).map((cell) => (
                  <TableCell key={cell.key} className={styles.center} data-testid={`cell-${rowKey}-${cell.key}`}>
                    <span className={styles.value}>
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
