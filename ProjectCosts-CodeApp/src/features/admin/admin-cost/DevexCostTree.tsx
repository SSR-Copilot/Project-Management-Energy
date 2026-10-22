/**
 * Module H — the DEVEX/CAPEX standard cost tree (ACS:3624-4455).
 *
 * One header row per category with costs (`+`/`-` fold, neutralLighter fill), its cost rows
 * indented under a tree connector: Category/Account (parent account), Sub-Account
 * (`name - number`), Description, Cost (`1,234,567 EUR/MW(p)`), Cluster (`1,3,5`), comment icon
 * (opens the editor, tooltip "Comment: …" / "Add Comment"), Edit, Delete.
 */
import { Button, Tooltip, makeStyles, mergeClasses, tokens } from "@fluentui/react-components";
import { CommentAddRegular, CommentRegular, DeleteRegular, EditRegular } from "@fluentui/react-icons";
import type { DevexCost } from "@/data/adminCost";
import { ExpandToggle, InlineEmpty, RowActions } from "@/components";
import { fontFamily, palette } from "@/theme/tokens";
import type { DevexGroup } from "./rules";
import { useTreeStyles } from "./treeStyles";

const useStyles = makeStyles({
  scroller: { overflowX: "auto", maxWidth: "100%" },
  table: { borderCollapse: "collapse", tableLayout: "fixed", fontFamily, color: palette.black, minWidth: "100%" },
  th: {
    height: "45px", paddingLeft: "6px", paddingRight: "6px", textAlign: "left",
    fontSize: "13.3px", fontWeight: tokens.fontWeightSemibold, whiteSpace: "nowrap",
    borderBottomWidth: "2px", borderBottomStyle: "solid", borderBottomColor: palette.Grayscale30,
  },
  td: {
    height: "50px", paddingLeft: "6px", paddingRight: "6px", fontSize: "12px",
    whiteSpace: "nowrap", overflowX: "hidden", textOverflow: "ellipsis",
  },
  right: { textAlign: "right" },
  center: { textAlign: "center" },
  parent: {
    backgroundColor: palette.neutralLighter, height: "45px",
    borderBottomWidth: "5px", borderBottomStyle: "solid", borderBottomColor: palette.white,
  },
  // The canvas category label (ACS:4207-4235, `lbl_..._Category_1`) sets no FontWeight,
  // so it is regular, not semibold; only the column headers are semibold.
  parentLabel: { fontWeight: tokens.fontWeightRegular },
  fold: { marginRight: "10px" },
  icon: { color: palette.themePrimary },
  actionCell: { display: "flex", alignItems: "center", justifyContent: "center" },
});

export interface DevexCostTreeProps {
  groups: readonly DevexGroup[];
  openCategories: ReadonlySet<string>;
  canEdit: (cost: DevexCost) => boolean;
  canDelete: (cost: DevexCost) => boolean;
  onToggle: (categoryId: string) => void;
  onEdit: (cost: DevexCost) => void;
  onDelete: (cost: DevexCost) => void;
}

export function DevexCostTree({ groups, openCategories, canEdit, canDelete, onToggle, onEdit, onDelete }: DevexCostTreeProps) {
  const styles = useStyles();
  const tree = useTreeStyles();
  if (groups.length === 0) {
    return (
      <InlineEmpty padding={12} size={13}>
        No DEVEX/CAPEX standard costs for this country and technology yet. Use "Add Cost" to create one.
      </InlineEmpty>
    );
  }
  return (
    <div className={styles.scroller}>
      <table className={styles.table} aria-label="DEVEX/CAPEX standard costs">
        <colgroup>
          <col style={{ width: 250 }} />
          <col style={{ width: 300 }} />
          <col style={{ width: 300 }} />
          <col style={{ width: 180 }} />
          <col style={{ width: 110 }} />
          <col style={{ width: 80 }} />
          <col style={{ width: 120 }} />
        </colgroup>
        <thead>
          <tr>
            <th scope="col" className={styles.th}>Category / Account</th>
            <th scope="col" className={styles.th}>Sub-Account</th>
            <th scope="col" className={styles.th}>Description</th>
            <th scope="col" className={styles.th}>Cost</th>
            <th scope="col" className={mergeClasses(styles.th, styles.right)}>Cluster</th>
            <th className={styles.th} aria-label="Spacer" />
            <th scope="col" className={mergeClasses(styles.th, styles.center)}>Action</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => {
            const open = openCategories.has(group.categoryId);
            return [
              <tr key={group.categoryId} className={styles.parent}>
                <td className={mergeClasses(styles.td, styles.parentLabel)} colSpan={7}>
                  <ExpandToggle
                    variant="text18"
                    className={styles.fold}
                    expanded={open}
                    label={`${open ? "Hide" : "Show"} the ${group.categoryName} costs`}
                    testId={`cost-devex-category-toggle-${group.categoryId}`}
                    onToggle={() => onToggle(group.categoryId)}
                  />
                  {group.categoryName}
                </td>
              </tr>,
              ...(open ? group.rows.map((row, i) => (
                <tr key={row.cost.id}>
                  <td
                    className={mergeClasses(styles.td, tree.connector, i === group.rows.length - 1 && tree.connectorLast)}
                    title={row.account}
                  >
                    {row.account}
                  </td>
                  <td className={styles.td} title={row.subaccount}>{row.subaccount}</td>
                  <td className={styles.td} title={row.description}>{row.description}</td>
                  {/* ACS:4042-4110 — Cluster and Cost carry `Tooltip: =Self.Text`. */}
                  <td className={styles.td} title={row.costText}>{row.costText}</td>
                  <td className={mergeClasses(styles.td, styles.right)} title={row.clusterText}>{row.clusterText}</td>
                  <td className={styles.td} />
                  <td className={mergeClasses(styles.td, styles.center)}>
                    <div className={styles.actionCell}>
                      {/* The comment button stays its own first element, with its tooltip (tooltip). */}
                      <Tooltip content={row.commentTooltip} relationship="description">
                        <Button
                          appearance="transparent"
                          size="small"
                          icon={row.hasComment ? <CommentRegular className={styles.icon} /> : <CommentAddRegular className={styles.icon} />}
                          disabled={!canEdit(row.cost)}
                          aria-label={row.hasComment ? `Comment on ${row.description}` : `Add comment to ${row.description}`}
                          data-testid={`cost-devex-comment-${row.cost.id}`}
                          onClick={() => onEdit(row.cost)}
                        />
                      </Tooltip>
                      <RowActions
                        size="small"
                        tone="brand"
                        toneWhenLocked
                        actions={[
                          { key: "edit", icon: <EditRegular />, label: `Edit ${row.description}`, disabled: !canEdit(row.cost), onClick: () => onEdit(row.cost), testId: `cost-devex-edit-${row.cost.id}` },
                          { key: "delete", icon: <DeleteRegular />, label: `Delete ${row.description}`, disabled: !canDelete(row.cost), onClick: () => onDelete(row.cost), testId: `cost-devex-delete-${row.cost.id}` },
                        ]}
                      />
                    </div>
                  </td>
                </tr>
              )) : []),
            ];
          })}
        </tbody>
      </table>
    </div>
  );
}
