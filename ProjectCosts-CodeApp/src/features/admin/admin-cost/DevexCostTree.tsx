/**
 * Module H — the DEVEX/CAPEX standard cost tree (ACS:3624-4455,
 * `con_DevexCapex_Content_StandardCosts_Card_Body_Costs` holding the gallery
 * `gal_DevexCapex_Content_StandardCosts_CardBody_CostsTable_Gallery`).
 *
 * One header row per category with costs (`+`/`-` fold `Button2_2`, neutralLighter fill), its cost
 * rows indented under a tree connector: Category/Account (parent account), Sub-Account
 * (`name - number`), Description, Cost (`1,234,567 EUR/MW(p)`), Cluster (`1,3,5`), comment icon
 * (opens the editor, tooltip "Comment: …" / "Add Comment"), Edit, Delete.
 *
 * Repeating rows carry the canvas control name plus the row's stable id (CONVENTIONS rule 16):
 * the category id on `Button2_2`, the cost id on the comment / Edit / Delete buttons.
 */
import { Button, Tooltip, makeStyles, mergeClasses, tokens } from "@fluentui/react-components";
import { DeleteRegular, EditRegular } from "@fluentui/react-icons";
import type { DevexCost } from "@/data/adminCost";
import { ExpandToggle, InlineEmpty, RowActions } from "@/components";
import { fontFamily, palette } from "@/theme/tokens";
import { MSG } from "./constants";
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
  /*
   * The Action column is the 120 px `…_CostsTableHeader_Action` (ACS:3649-3680), laid out as the canvas does
   * (ACS:4236-4365): the 23 x 23 comment image at X 0, then Edit (32 wide) at X 46 and Delete (32 wide) at X 88,
   * 10 px apart, flush right — so no cell padding and the three spread across the column.
   */
  actionTd: { paddingLeft: 0, paddingRight: 0 },
  actionCell: { display: "flex", alignItems: "center", justifyContent: "space-between", width: "120px" },
  commentButton: { minWidth: "23px", width: "23px", height: "23px", paddingLeft: 0, paddingRight: 0, paddingTop: 0, paddingBottom: 0 },
  /* `ButtonCanvas` icon-only, `Width: =32`: a 32 px button with a 16 px glyph. */
  editDelete: {
    columnGap: "10px",
    "& button": { minWidth: "32px", width: "32px", height: "32px", paddingLeft: 0, paddingRight: 0 },
    "& .fui-Button__icon": { fontSize: "16px", width: "16px", height: "16px" },
  },
});

/**
 * `img_DevexCapex_Content_StandardCosts_CardBody_CostsTable_Comment.Image: =If(Len(ThisItem.vsb_comment)>0,
 * 'Frame 3', 'Frame 3 (1)')` (ACS:4236-4276), drawn 23 x 23. The two media assets (`References/Resources.json`
 * → `Assets/Images/a166ff7b….svg` / `a2266de9….svg`) are the same #006EB9 speech bubble with three lines; "Frame 3"
 * (a comment exists) adds a red #FC3E3E dot at the top-right. Inlined verbatim: Fluent's `Comment` icons were a
 * different glyph (user screenshot, 21 Nov 2026). `data-icon-name` carries the asset name for the tests.
 */
const BUBBLE =
  "M24 5.5C24.3978 5.5 24.7794 5.65804 25.0607 5.93934C25.342 6.22064 25.5 6.60218 25.5 7V19C25.5 19.3978 25.342 19.7794 " +
  "25.0607 20.0607C24.7794 20.342 24.3978 20.5 24 20.5H9.621C8.82542 20.5002 8.06248 20.8164 7.5 21.379L4.5 24.379V7C4.5 " +
  "6.60218 4.65804 6.22064 4.93934 5.93934C5.22064 5.65804 5.60218 5.5 6 5.5H24ZM6 4C5.20435 4 4.44129 4.31607 3.87868 " +
  "4.87868C3.31607 5.44129 3 6.20435 3 7L3 26.1895C3.00003 26.3379 3.04409 26.483 3.1266 26.6063C3.2091 26.7297 3.32635 " +
  "26.8258 3.4635 26.8825C3.60065 26.9392 3.75153 26.9539 3.89705 26.9248C4.04258 26.8957 4.1762 26.8241 4.281 26.719L8.5605 " +
  "22.4395C8.84174 22.1582 9.22321 22.0001 9.621 22H24C24.7956 22 25.5587 21.6839 26.1213 21.1213C26.6839 20.5587 27 19.7957 " +
  "27 19V7C27 6.20435 26.6839 5.44129 26.1213 4.87868C25.5587 4.31607 24.7956 4 24 4H6Z";
const LINES =
  "M7.5 9.25C7.5 9.05109 7.57902 8.86032 7.71967 8.71967C7.86032 8.57902 8.05109 8.5 8.25 8.5H21.75C21.9489 8.5 22.1397 " +
  "8.57902 22.2803 8.71967C22.421 8.86032 22.5 9.05109 22.5 9.25C22.5 9.44891 22.421 9.63968 22.2803 9.78033C22.1397 9.92098 " +
  "21.9489 10 21.75 10H8.25C8.05109 10 7.86032 9.92098 7.71967 9.78033C7.57902 9.63968 7.5 9.44891 7.5 9.25ZM7.5 13C7.5 " +
  "12.8011 7.57902 12.6103 7.71967 12.4697C7.86032 12.329 8.05109 12.25 8.25 12.25H21.75C21.9489 12.25 22.1397 12.329 22.2803 " +
  "12.4697C22.421 12.6103 22.5 12.8011 22.5 13C22.5 13.1989 22.421 13.3897 22.2803 13.5303C22.1397 13.671 21.9489 13.75 21.75 " +
  "13.75H8.25C8.05109 13.75 7.86032 13.671 7.71967 13.5303C7.57902 13.3897 7.5 13.1989 7.5 13ZM7.5 16.75C7.5 16.5511 7.57902 " +
  "16.3603 7.71967 16.2197C7.86032 16.079 8.05109 16 8.25 16H15.75C15.9489 16 16.1397 16.079 16.2803 16.2197C16.421 16.3603 " +
  "16.5 16.5511 16.5 16.75C16.5 16.9489 16.421 17.1397 16.2803 17.2803C16.1397 17.421 15.9489 17.5 15.75 17.5H8.25C8.05109 " +
  "17.5 7.86032 17.421 7.71967 17.2803C7.57902 17.1397 7.5 16.9489 7.5 16.75Z";

function CommentGlyph({ hasComment }: { hasComment: boolean }) {
  return (
    <svg
      width="23" height="23" viewBox="0 0 31 27" fill="none" aria-hidden="true"
      data-icon-name={hasComment ? "Frame 3" : "Frame 3 (1)"}
    >
      <path d={BUBBLE} fill="#006EB9" />
      <path d={LINES} fill="#006EB9" />
      {hasComment ? <circle cx="26" cy="5" r="5.05" fill="#FC3E3E" /> : null}
    </svg>
  );
}

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
      // NEW — no canvas equivalent: the canvas shows an empty gallery.
      <InlineEmpty padding={12} size={13}>
        No DEVEX/CAPEX standard costs for this country and technology yet. Use "Add Cost" to create one.
      </InlineEmpty>
    );
  }
  return (
    <div className={styles.scroller} data-testid="con_DevexCapex_Content_StandardCosts_Card_Body_Costs">
      <table
        className={styles.table}
        aria-label="DEVEX/CAPEX standard costs"
        data-testid="gal_DevexCapex_Content_StandardCosts_CardBody_CostsTable_Gallery"
      >
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
          {/*
            `lbl_DevexCapex_Content_StandardCosts_CardBody_CostsTableHeader_*.Text`, verbatim, in X
            order: Category, Subaccount, Description_2, Cost, Cluster, Comment (`""`), Action. The
            canvas `…_Account` header has `Width: 0` (hidden), so it has no column here.
          */}
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
                  {/*
                    `Button2_2.Text` — `If(ThisItem.IsFolded, "+", "-")`, verbatim, as the name
                    (no AccessibleLabel); the fold state is `aria-expanded`.
                  */}
                  <ExpandToggle
                    variant="text18"
                    className={styles.fold}
                    expanded={open}
                    label={open ? "-" : "+"}
                    testId={`Button2_2-${group.categoryId}`}
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
                  <td className={mergeClasses(styles.td, styles.actionTd)}>
                    <div className={styles.actionCell}>
                      {/*
                        `img_DevexCapex_Content_StandardCosts_CardBody_CostsTable_Comment` — its own
                        element before Edit / Delete, with the canvas `Tooltip` (the comment text).
                        DIVERGENCE: the canvas image sets no `DisplayMode`, so everyone can open the
                        panel from it; here it follows Edit and is disabled without edit rights.
                      */}
                      <Tooltip content={row.commentTooltip} relationship="description">
                        <Button
                          appearance="transparent"
                          size="small"
                          className={styles.commentButton}
                          icon={<CommentGlyph hasComment={row.hasComment} />}
                          disabled={!canEdit(row.cost)}
                          aria-label={MSG.commentLabel(row.hasComment)}
                          data-testid={`img_DevexCapex_Content_StandardCosts_CardBody_CostsTable_Comment-${row.cost.id}`}
                          onClick={() => onEdit(row.cost)}
                        />
                      </Tooltip>
                      {/*
                        `btn_DevexCapex_…_Action_Edit` / `_Action_delete` are icon-only (`Icon: "Edit"` /
                        `"Delete"`, no Text or AccessibleLabel): the icon names are the names.
                      */}
                      <RowActions
                        size="small"
                        tone="brand"
                        toneWhenLocked
                        className={styles.editDelete}
                        actions={[
                          { key: "edit", icon: <EditRegular />, label: "Edit", disabled: !canEdit(row.cost), onClick: () => onEdit(row.cost), testId: `btn_DevexCapex_Content_StandardCosts_CardBody_CostsTable_Action_Edit-${row.cost.id}` },
                          { key: "delete", icon: <DeleteRegular />, label: "Delete", disabled: !canDelete(row.cost), onClick: () => onDelete(row.cost), testId: `btn_DevexCapex_Content_StandardCosts_CardBody_CostsTable_Action_delete-${row.cost.id}` },
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
