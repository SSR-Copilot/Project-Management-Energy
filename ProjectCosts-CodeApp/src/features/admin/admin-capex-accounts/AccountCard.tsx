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
 * pill `StatusPill variant="static"` (CA:754-803), the empty line `InlineEmpty`, the row icons
 * `RowActions` (the delete-unavailable icon is a locked action) and the subaccount commands the
 * shared `CommandBar`.
 */
import {
  Button, Table, TableBody, TableCell, TableRow, Tooltip, makeStyles, mergeClasses, tokens,
} from "@fluentui/react-components";
import {
  DeleteRegular, EditRegular, PauseRegular, PlayRegular, RadioButtonFilled, RadioButtonRegular,
} from "@fluentui/react-icons";
import { CollapsibleCard, CommandBar, InlineEmpty, RowActions, StatusPill } from "@/components";
import type { TablePrivileges } from "@/platform/privileges";
import { palette } from "@/theme/tokens";
import {
  CONTRACT_CHECK_FAILED, accountLabel, subaccountCommands, subaccountDeleteUnavailable,
  subaccountRowActions, type CapexNode, type ContractCheck,
} from "./rules";

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
  radio: { fontSize: "18px", color: palette.themePrimary, flexShrink: 0 },
  title: {
    flexGrow: 1, minWidth: 0, textAlign: "left",
    overflowX: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
    // Canvas account caption: 13.3333 px (measured in the Canvas parity run), not the 14 px Fluent default.
    fontSize: "13.3333px",
  },
  titleSelected: { fontWeight: tokens.fontWeightSemibold },
  /** `pcf_Account_AccountCardBody_SubAccounts.Width: =Min(…, 900)`; rows 32 px (`TotalRecords*32`). */
  table: { maxWidth: "900px" },
  row: { height: "32px" },
  /** `columns_Items`: Number `ColWidth: 80`. */
  numberCell: { width: "80px" },
  statusCell: { width: "96px" },
  actionsCell: { width: "112px" },
});

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
  const subCommands = subaccountCommands(account, privileges);

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
      title={(
        <Tooltip content={label} relationship="description" withArrow>
          <Button
            appearance="transparent"
            className={styles.selectButton}
            onClick={props.onSelect}
            aria-pressed={selected}
            aria-label={`Select account ${label}`}
            data-testid={`btn_Account_AccountCardHeader-${account.id}`}
          >
            {/* `img_Account_AccountCardHeaderRadioSelection`: "CircleDotBlue" when selected, else "CircleEmpty". */}
            {selected
              ? <RadioButtonFilled className={styles.radio} aria-hidden="true" />
              : <RadioButtonRegular className={styles.radio} aria-hidden="true" />}
            {/* `lbl_Account_AccountName`: Semibold when this is the selected account (CA:713-718). */}
            <span
              className={mergeClasses(styles.title, selected && styles.titleSelected)}
              data-testid={`lbl_Account_AccountName-${account.id}`}
            >
              {label}
            </span>
          </Button>
        </Tooltip>
      )}
      // `lbl_Account_AccountStatus.Text: =ThisItem.Status` — "Active" / "Inactive" (the pill's default labels).
      trailing={<StatusPill variant="static" active={account.active} testId={`lbl_Account_AccountStatus-${account.id}`} />}
    >
      {/*
        * `pcf_Account_AccountCardBody_SubAccountsCommandBar` (CA:472-520): `ItemDisplayName`
        * "Reorder subaccounts" / "Add subaccount" verbatim, the canvas `ItemKey`s.
        * DIVERGENCE: Reorder shows the "Reorder" icon (canvas "NumberedList") and needs ≥ 2
        * subaccounts (see `subaccountCommands`).
        */}
      <CommandBar
        ariaLabel={`Subaccount commands for ${label}`}
        testIdPrefix={`pcf_Account_AccountCardBody_SubAccountsCommandBar-${account.id}`}
        commands={[
          { key: REORDER_SUBACCOUNTS, label: "Reorder subaccounts", icon: "Reorder", enabled: subCommands.reorder.enabled },
          { key: ADD_SUBACCOUNT, label: "Add subaccount", icon: "Add", enabled: subCommands.add.enabled },
        ]}
        onCommand={(key) => {
          if (key === REORDER_SUBACCOUNTS) props.onReorderSubaccounts();
          else if (key === ADD_SUBACCOUNT) props.onAddSubaccount();
        }}
      />
      {account.children.length === 0 ? (
        // NEW — no canvas equivalent: the canvas grid simply had no rows.
        <InlineEmpty tone="canvasGrey" padding={4}>No subaccounts yet.</InlineEmpty>
      ) : (
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
              return (
                <TableRow key={sub.id} className={styles.row} data-testid={`subaccount-row-${sub.number}`}>
                  {/* `columns_Items` (CA:636-686): vsb_number · vsb_name · statecode, then the three icon columns. */}
                  <TableCell id={numberId} className={styles.numberCell}>{sub.number}</TableCell>
                  <TableCell id={nameId}>{sub.name}</TableCell>
                  <TableCell className={styles.statusCell}>{sub.active ? "Active" : "Inactive"}</TableCell>
                  <TableCell className={styles.actionsCell}>
                    {/*
                      * The icon columns (`"icon:Edit"`, `"icon:DeactivateOrders"` / `"icon:ActivateOrders"`,
                      * `"icon:Delete"`). DIVERGENCE (icons): pause / play stand for the canvas
                      * Deactivate/ActivateOrders images.
                      */}
                    <RowActions
                      appearance="subtle" size="small" gap={2} tone="brand" align="end"
                      actions={[
                        {
                          key: "edit", icon: <EditRegular />, label: "Edit", title: "Edit", describedBy,
                          testId: `${SUBACCOUNTS_GRID}-EditIcon-${sub.id}`,
                          visible: actions.edit, onClick: () => props.onEditSubaccount(sub),
                        },
                        {
                          key: "status", icon: actions.deactivate ? <PauseRegular /> : <PlayRegular />,
                          label: statusVerb, title: statusVerb, describedBy,
                          testId: `${SUBACCOUNTS_GRID}-ChangeStatusIcon-${sub.id}`,
                          visible: actions.deactivate || actions.activate,
                          onClick: () => props.onChangeSubaccountStatus(sub),
                        },
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
                      ]}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </CollapsibleCard>
  );
}
