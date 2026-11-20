/**
 * The account card (header and body), its subaccount command bar and the subaccount grid of
 * `Admin CAPEX Accounts` (CA:369-941): one `con_Account_AccountCard` per account of
 * `gal_Account_Accounts`.
 *
 * Canvas controls (`data-testid` = the canvas name plus `-${account.id}` / `-${sub.id}`, as the
 * gallery repeats one name on every card):
 *   con_Account_AccountCard                       the card
 *   btn_Account_AccountCardHeader                 the full-header select button (with
 *     img_Account_AccountCardHeaderRadioSelection   its radio image, decorative here, and
 *     lbl_Account_AccountName                       the "<number> - <name>" caption)
 *   lbl_Account_AccountStatus                     the status pill (`con_Account_AccountStatusLabel`)
 *   ico_Account_AccountCard_Down / _Up            the chevron (the name follows the fold state)
 *   pcf_Account_AccountCardBody_SubAccountsCommandBar  Reorder subaccounts · Add subaccount
 *   pcf_Account_AccountCardBody_SubAccounts       the subaccount grid; its icon columns
 *                                                 `EditIcon` / `ChangeStatusIcon` / `DeleteIcon`
 *                                                 name the row actions' ids
 *
 * The select button's and the chevron's `aria-label`s name the account ("Select account
 * <number> - <name>"): the canvas controls have no caption and no `AccessibleLabel`, so there is
 * no canvas text to use, and the row identity keeps the buttons distinguishable. The subaccount
 * row icons carry their caption only ("Edit", "Activate", "Deactivate", "Delete") and point at the
 * row's number and name with `aria-describedby`.
 *
 * Shared components: the card chrome is the shared `CollapsibleCard variant="account"`
 * (header 42 px #fdffff, body indent 30 / gap 5 — the same CA:456-470 / CA:687-747 values), the
 * pill `StatusPill variant="static"` (CA:754-803), the row icons `RowActions` (the
 * delete-unavailable icon is a locked action) and the subaccount commands the shared `CommandBar`.
 *
 * Canvas parity pass (20 Nov 2026): the canvas icons (`NumberedList`, `ActivateOrders`,
 * `DeactivateOrders`), the canvas radio image, the canvas column widths, no hover tooltip on the
 * header (the canvas sets none), no bottom rule under an open card body (`BorderColor:
 * Color.Transparent`, CA:460) and no "No subaccounts yet." line (the canvas grid is just empty).
 */
import {
  Button, Table, TableBody, TableCell, TableRow, makeStyles, mergeClasses, tokens,
} from "@fluentui/react-components";
import {
  DeleteRegular, DocumentCheckmarkRegular, EditRegular,
} from "@fluentui/react-icons";
import { CollapsibleCard, CommandBar, DeactivateOrdersIcon, RowActions, StatusPill, type RowAction } from "@/components";
import type { TablePrivileges } from "@/platform/privileges";
import { palette } from "@/theme/tokens";
import {
  CONTRACT_CHECK_FAILED, accountLabel, subaccountCommands, subaccountDeleteUnavailable,
  subaccountRowActions, type CapexNode, type ContractCheck,
} from "./rules";

/**
 * The PowerCAT `FluentDetailsList` is Fluent v8's `DetailsList`: each cell is its `ColWidth` plus
 * the row's cell padding, 12 px left and 8 px right (`DetailsRow` `cellLeftPadding` /
 * `cellRightPadding`). So the canvas columns (`columns_Items`, CA:636-686) render as Number 80 +
 * 20, Subaccount `Max(Self.Width-400, 80)` + 20, Status 80 + 20 and three icon columns 18 + 20,
 * which leaves 66 px of the grid's width empty at the right. Still owed: a browser measurement.
 */
const CELL_PAD_LEFT = "12px";
const CELL_PAD_RIGHT = "8px";

const useStyles = makeStyles({
  /** The transparent full-header click target (`btn_Account_AccountCardHeader`). */
  selectButton: {
    flexGrow: 1, minWidth: 0,
    display: "flex", alignItems: "center", columnGap: "8px",
    justifyContent: "flex-start",
    paddingLeft: "0", paddingRight: "0", minHeight: "42px",
    backgroundColor: "transparent", color: palette.black,
    ":hover": { backgroundColor: "transparent", color: palette.black },
    ":hover:active": { backgroundColor: "transparent", color: palette.black },
    fontWeight: tokens.fontWeightRegular,
  },
  /** `img_Account_AccountCardHeaderRadioSelection`: `Width: =18`, `Height: =Self.Width` (CA:806-830). */
  radio: { width: "18px", height: "18px", flexShrink: 0 },
  title: {
    flexGrow: 1, minWidth: 0, textAlign: "left",
    overflowX: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
    // Canvas account caption: 13.3333 px (measured in the Canvas parity run), not the 14 px Fluent default.
    fontSize: "13.3333px",
  },
  titleSelected: { fontWeight: tokens.fontWeightSemibold },
  /**
   * `con_Account_AccountCardBody.BorderColor: =Color.Transparent` (CA:460): an open card has no
   * rule under its body (the shared `account` body draws one).
   */
  body: { borderBottomStyle: "none" },
  /** `pcf_Account_AccountCardBody_SubAccounts.Width: =Min(…, 900)`; rows 32 px (`TotalRecords*32`). */
  table: { tableLayout: "fixed", width: "100%", maxWidth: "900px" },
  row: { height: "32px" },
  cell: { boxSizing: "border-box", paddingLeft: CELL_PAD_LEFT, paddingRight: CELL_PAD_RIGHT },
  /** Number `ColWidth: 80`. */
  numberCell: { width: "100px" },
  /** Subaccount `ColWidth: Max(Self.Width-400, 80)`. */
  nameCell: { width: "calc(100% - 380px)" },
  /** Status `ColWidth: 80`. */
  statusCell: { width: "100px" },
  /** Each icon column `ColWidth: 18`, `ColImageWidth: 15`, `ColImagePadding: 1`. */
  iconCell: { width: "38px" },
  /** The grid width the columns leave empty. */
  fillerCell: { width: "66px", paddingLeft: 0, paddingRight: 0 },
  /** An 18 px icon column holding a 15 px glyph. */
  icon: {
    "& button": { minWidth: "18px", width: "18px", height: "18px", paddingLeft: 0, paddingRight: 0 },
    "& .fui-Button__icon": { fontSize: "15px", width: "15px", height: "15px" },
  },
});

/**
 * `SVGImages` "CircleDotBlue" / "CircleEmpty" (`References/DataSources.json`), as the canvas
 * draws them: a black 3-unit ring of radius 40 on a 100-unit square and, when selected, a
 * `#006eb9` dot of radius 20. Decorative; the select button carries the state (`aria-pressed`).
 */
function SelectionRadio({ selected, className }: { selected: boolean; className: string }) {
  return (
    <svg className={className} viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <circle cx="50" cy="50" r="40" stroke="black" strokeWidth="3" fill="transparent" />
      {selected ? <circle cx="50" cy="50" r="20" fill={palette.themePrimary} /> : null}
    </svg>
  );
}

/** `pcf_Account_AccountCardBody_SubAccountsCommandBar.Items` `ItemKey`s (CA:480, 487). */
const REORDER_SUBACCOUNTS = "orderSubaccounts";
const ADD_SUBACCOUNT = "newSubaccount";

/** The subaccount grid's canvas name; its icon columns (`ColName`) suffix the row-action ids. */
const SUBACCOUNTS_GRID = "pcf_Account_AccountCardBody_SubAccounts";

export interface AccountCardProps {
  account: CapexNode;
  selected: boolean;
  expanded: boolean;
  privileges: TablePrivileges;
  /** Subaccount id → contract booked? Missing = still checking; `"failed"` = check errored. */
  contractsBySubaccount: ReadonlyMap<string, ContractCheck>;
  onSelect: () => void;
  onToggleExpand: () => void;
  onAddSubaccount: () => void;
  onReorderSubaccounts: () => void;
  onEditSubaccount: (sub: CapexNode) => void;
  onChangeSubaccountStatus: (sub: CapexNode) => void;
  onDeleteSubaccount: (sub: CapexNode) => void;
}

export function AccountCard(props: AccountCardProps) {
  const { account, selected, expanded, privileges } = props;
  const styles = useStyles();
  const label = accountLabel(account);
  const subCommands = subaccountCommands(privileges);

  return (
    <CollapsibleCard
      variant="account"
      idPrefix="capex-account-body-"
      id={account.id}
      expanded={expanded}
      onToggle={props.onToggleExpand}
      toggleLabel={`${expanded ? "Collapse" : "Expand"} account ${label}`}
      toggleTestId={`${expanded ? "ico_Account_AccountCard_Up" : "ico_Account_AccountCard_Down"}-${account.id}`}
      testId={`con_Account_AccountCard-${account.id}`}
      bodyClassName={styles.body}
      title={(
        // `btn_Account_AccountCardHeader` and `lbl_Account_AccountName` set no `Tooltip`, so there is none on hover.
        <Button
          appearance="transparent"
          className={styles.selectButton}
          onClick={props.onSelect}
          aria-pressed={selected}
          aria-label={`Select account ${label}`}
          data-testid={`btn_Account_AccountCardHeader-${account.id}`}
        >
          {/* `img_Account_AccountCardHeaderRadioSelection`: "CircleDotBlue" when selected, else "CircleEmpty". */}
          <SelectionRadio selected={selected} className={styles.radio} />
          {/* `lbl_Account_AccountName`: Semibold when this is the selected account (CA:713-718). */}
          <span
            className={mergeClasses(styles.title, selected && styles.titleSelected)}
            data-testid={`lbl_Account_AccountName-${account.id}`}
          >
            {label}
          </span>
        </Button>
      )}
      // `lbl_Account_AccountStatus.Text: =ThisItem.Status` — "Active" / "Inactive" (the pill's default labels).
      trailing={<StatusPill variant="static" active={account.active} testId={`lbl_Account_AccountStatus-${account.id}`} />}
    >
      {/*
        * `pcf_Account_AccountCardBody_SubAccountsCommandBar` (CA:472-520): `ItemDisplayName`
        * "Reorder subaccounts" / "Add subaccount" and `ItemIconName` "NumberedList" / "Add"
        * verbatim, the canvas `ItemKey`s. Reorder is always enabled (D19, `subaccountCommands`).
        */}
      <CommandBar
        ariaLabel={`Subaccount commands for ${label}`}
        testIdPrefix={`pcf_Account_AccountCardBody_SubAccountsCommandBar-${account.id}`}
        commands={[
          { key: REORDER_SUBACCOUNTS, label: "Reorder subaccounts", icon: "NumberedList", enabled: subCommands.reorder.enabled },
          { key: ADD_SUBACCOUNT, label: "Add subaccount", icon: "Add", enabled: subCommands.add.enabled },
        ]}
        onCommand={(key) => {
          if (key === REORDER_SUBACCOUNTS) props.onReorderSubaccounts();
          else if (key === ADD_SUBACCOUNT) props.onAddSubaccount();
        }}
      />
      {/* An account without subaccounts shows the empty grid area, no text (the canvas grid has no rows and no header). */}
      {account.children.length === 0 ? null : (
        // `HeaderVisible: =false` — the grid shows no column headers, as the canvas.
        <Table
          size="small" className={styles.table} aria-label={`Subaccounts of ${label}`}
          data-testid={`${SUBACCOUNTS_GRID}-${account.id}`}
        >
          <TableBody>
            {account.children.map((sub) => {
              const check = props.contractsBySubaccount.get(sub.id);
              const actions = subaccountRowActions(sub, account, check, privileges);
              const deleteUnavailable = subaccountDeleteUnavailable(check, privileges);
              const statusVerb = actions.deactivate ? "Deactivate" : "Activate";
              // The row's number and name describe its icon buttons (never part of their label).
              const numberId = `capex-subaccount-number-${sub.id}`;
              const nameId = `capex-subaccount-name-${sub.id}`;
              const describedBy = `${numberId} ${nameId}`;
              const iconColumn = (cellActions: readonly RowAction[]) => (
                <TableCell className={mergeClasses(styles.cell, styles.iconCell)}>
                  <RowActions appearance="subtle" size="small" tone="brand" className={styles.icon} actions={cellActions} />
                </TableCell>
              );
              return (
                <TableRow key={sub.id} className={styles.row} data-testid={`subaccount-row-${sub.number}`}>
                  {/* `columns_Items` (CA:636-686): vsb_number · vsb_name · statecode, then the three icon columns. */}
                  <TableCell id={numberId} className={mergeClasses(styles.cell, styles.numberCell)}>{sub.number}</TableCell>
                  <TableCell id={nameId} className={mergeClasses(styles.cell, styles.nameCell)}>{sub.name}</TableCell>
                  <TableCell className={mergeClasses(styles.cell, styles.statusCell)}>{sub.active ? "Active" : "Inactive"}</TableCell>
                  {/*
                    * The icon columns, one per canvas column (CA:538-589): `EditIcon` "icon:Edit",
                    * `ChangeStatusIcon` "icon:DeactivateOrders" (Active) / "icon:ActivateOrders"
                    * (Inactive) and `DeleteIcon` "icon:Delete" — the MDL2 glyphs as the shared
                    * `CommandBar` maps them (the MDL2 DeactivateOrders outline / a document with a tick).
                    */}
                  {iconColumn([{
                    key: "edit", icon: <EditRegular />, label: "Edit", title: "Edit", describedBy,
                    testId: `${SUBACCOUNTS_GRID}-EditIcon-${sub.id}`,
                    visible: actions.edit, onClick: () => props.onEditSubaccount(sub),
                  }])}
                  {iconColumn([{
                    key: "status", icon: actions.deactivate ? <DeactivateOrdersIcon fit="em" /> : <DocumentCheckmarkRegular />,
                    label: statusVerb, title: statusVerb, describedBy,
                    testId: `${SUBACCOUNTS_GRID}-ChangeStatusIcon-${sub.id}`,
                    visible: actions.deactivate || actions.activate,
                    onClick: () => props.onChangeSubaccountStatus(sub),
                  }])}
                  {iconColumn([
                    {
                      key: "delete", icon: <DeleteRegular />, label: "Delete", title: "Delete", describedBy,
                      testId: `${SUBACCOUNTS_GRID}-DeleteIcon-${sub.id}`,
                      visible: actions.delete, onClick: () => props.onDeleteSubaccount(sub),
                    },
                    {
                      // NEW: disabled (focusable, so the tooltip is reachable) instead of hidden
                      // when the contract check failed.
                      // Its description is the reason tooltip (`DisabledReason`), so no `describedBy`.
                      key: "delete-unavailable", icon: <DeleteRegular />, label: "Delete",
                      visible: deleteUnavailable, disabledReason: CONTRACT_CHECK_FAILED.subaccount,
                      testId: `delete-unavailable-${sub.number}`, onClick: () => {},
                    },
                  ])}
                  <TableCell className={styles.fillerCell} />
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </CollapsibleCard>
  );
}
