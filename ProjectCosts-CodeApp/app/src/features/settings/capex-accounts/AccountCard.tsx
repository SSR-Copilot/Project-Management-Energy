/**
 * Module E (account card: E1 header + E2 body), Module F (subaccount command bar) and Module G
 * (subaccount grid) of `Admin CAPEX Accounts` (CA:369-941).
 *
 * Reusable components (Wave B): the card chrome is the shared `CollapsibleCard variant="account"`
 * (header 42 px #fdffff, body indent 30 / gap 5 — the same CA:456-470 / CA:687-747 values), the
 * pill `StatusPill variant="static"` (CA:754-803), the empty line `InlineEmpty`, the row icons
 * `RowActions` (the delete-unavailable icon is a locked action, C4) and the subaccount commands the
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
    fontSize: tokens.fontSizeBase300,
  },
  titleSelected: { fontWeight: tokens.fontWeightSemibold },
  table: { maxWidth: "900px" },
  row: { height: "32px" },
  numberCell: { width: "80px" },
  statusCell: { width: "96px" },
  actionsCell: { width: "112px" },
});

export interface AccountCardProps {
  account: CapexNode;
  selected: boolean;
  expanded: boolean;
  privileges: TablePrivileges;
  /** Subaccount id → contract booked? Missing = still checking; `"failed"` = check errored (G10). */
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
      testId={`account-card-${account.number}`}
      title={(
        <Tooltip content={label} relationship="description" withArrow>
          <Button
            appearance="transparent"
            className={styles.selectButton}
            onClick={props.onSelect}
            aria-pressed={selected}
            aria-label={`Select account ${label}`}
          >
            {selected
              ? <RadioButtonFilled className={styles.radio} aria-hidden="true" />
              : <RadioButtonRegular className={styles.radio} aria-hidden="true" />}
            <span className={mergeClasses(styles.title, selected && styles.titleSelected)}>{label}</span>
          </Button>
        </Tooltip>
      )}
      trailing={<StatusPill variant="static" active={account.active} />}
    >
      <CommandBar
        ariaLabel={`Subaccount commands for ${label}`}
        commands={[
          { key: "reorder-subaccounts", label: "Reorder subaccounts", icon: "Reorder", enabled: subCommands.reorder.enabled },
          { key: "add-subaccount", label: "Add subaccount", icon: "Add", enabled: subCommands.add.enabled },
        ]}
        onCommand={(key) => {
          if (key === "reorder-subaccounts") props.onReorderSubaccounts();
          else if (key === "add-subaccount") props.onAddSubaccount();
        }}
      />
      {account.children.length === 0 ? (
        <InlineEmpty tone="canvasGrey" padding={4}>No subaccounts yet.</InlineEmpty>
      ) : (
        <Table size="small" className={styles.table} aria-label={`Subaccounts of ${label}`}>
          <TableBody>
            {account.children.map((sub) => {
              const check = props.contractsBySubaccount.get(sub.id);
              const actions = subaccountRowActions(sub, account, check, privileges);
              const deleteUnavailable = subaccountDeleteUnavailable(check, privileges);
              const subject = `subaccount ${sub.number} - ${sub.name}`;
              const statusVerb = actions.deactivate ? "Deactivate" : "Activate";
              return (
                <TableRow key={sub.id} className={styles.row} data-testid={`subaccount-row-${sub.number}`}>
                  <TableCell className={styles.numberCell}>{sub.number}</TableCell>
                  <TableCell>{sub.name}</TableCell>
                  <TableCell className={styles.statusCell}>{sub.active ? "Active" : "Inactive"}</TableCell>
                  <TableCell className={styles.actionsCell}>
                    <RowActions
                      appearance="subtle" size="small" gap={2} tone="brand" align="end"
                      actions={[
                        {
                          key: "edit", icon: <EditRegular />, label: `Edit ${subject}`, title: "Edit",
                          visible: actions.edit, onClick: () => props.onEditSubaccount(sub),
                        },
                        {
                          key: "status", icon: actions.deactivate ? <PauseRegular /> : <PlayRegular />,
                          label: `${statusVerb} ${subject}`, title: statusVerb,
                          visible: actions.deactivate || actions.activate,
                          onClick: () => props.onChangeSubaccountStatus(sub),
                        },
                        {
                          key: "delete", icon: <DeleteRegular />, label: `Delete ${subject}`, title: "Delete",
                          visible: actions.delete, onClick: () => props.onDeleteSubaccount(sub),
                        },
                        {
                          // G10: disabled (focusable, so the tooltip is reachable) instead of hidden.
                          key: "delete-unavailable", icon: <DeleteRegular />, label: `Delete ${subject}`,
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
