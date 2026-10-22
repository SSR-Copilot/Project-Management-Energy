/**
 * The O&M / Land Lease / Other OPEX contract table (ACS:1323-3623).
 *
 * One Period-1 row per contract (tinted, bold description, `+`/`-` fold), its later periods
 * indented under a tree connector, and "Add Period" under the last period of an expanded
 * contract. Delete is offered on Period 1 and on the last period only.
 *
 * Deviation for usability: the Actions column is sticky on the right, so Edit/Delete no longer
 * need a horizontal scroll to the end of a ~2,000 px table (a canvas defect).
 */
import { Button, makeStyles, mergeClasses, tokens } from "@fluentui/react-components";
import { AddFilled, DeleteRegular, EditRegular } from "@fluentui/react-icons";
import { type OpexPeriod } from "@/data/adminCost";
import { CONTRACT_TYPE, type OpexContractType } from "@/domain/costStandards";
import { DisabledReason, ExpandToggle, InlineEmpty, RowActions } from "@/components";
import { fontFamily, palette } from "@/theme/tokens";
import { MSG } from "./constants";
import { canAddPeriod, canDeletePeriodRow, canDeleteRow, inactiveRowsReason, toStandardOpexRow, type ContractView } from "./rules";
import { useTreeStyles } from "./treeStyles";

const useStyles = makeStyles({
  scroller: { overflowX: "auto", maxWidth: "100%" },
  table: {
    borderCollapse: "collapse", tableLayout: "fixed", fontFamily,
    color: palette.black, minWidth: "100%",
  },
  th: {
    height: "42px", paddingLeft: "6px", paddingRight: "6px",
    fontSize: "13.3px", fontWeight: tokens.fontWeightSemibold, textAlign: "left",
    backgroundColor: palette.white, whiteSpace: "nowrap",
    borderBottomWidth: "1px", borderBottomStyle: "solid", borderBottomColor: palette.Grayscale20,
  },
  td: {
    height: "40px", paddingLeft: "6px", paddingRight: "6px",
    fontSize: "12px", whiteSpace: "nowrap", overflowX: "hidden", textOverflow: "ellipsis",
  },
  right: { textAlign: "right" },
  center: { textAlign: "center" },
  headRow: { backgroundColor: "rgba(0, 0, 0, 0.04)" },
  bold: { fontWeight: tokens.fontWeightBold },
  gutter: { width: "30px", paddingLeft: "4px", paddingRight: "0" },
  actions: {
    position: "sticky", right: "0", backgroundColor: palette.white,
    width: "96px", textAlign: "right", whiteSpace: "nowrap",
    boxShadow: "-2px 0 2px rgba(0, 0, 0, 0.06)",
  },
  actionsTinted: { backgroundColor: "#F5F5F5" },
  addPeriod: { color: palette.themePrimary },
});

export interface OpexContractTableProps {
  title: string;
  type: OpexContractType;
  contracts: readonly ContractView[];
  currencyCode: string;
  currencyNames: ReadonlyMap<string, string>;
  collapsed: ReadonlySet<string>;
  canCreate: boolean;
  canEdit: (row: OpexPeriod) => boolean;
  canDelete: (row: OpexPeriod) => boolean;
  onToggle: (contractKey: string) => void;
  onEdit: (contract: ContractView, row: OpexPeriod) => void;
  onDelete: (contract: ContractView, row: OpexPeriod) => void;
  onAddPeriod: (contract: ContractView) => void;
}

interface Column { key: string; label: string; width: number; align?: "right" | "center" }

function columns(type: OpexContractType, cur: string): Column[] {
  const ll = type === CONTRACT_TYPE.landLease;
  const cols: Column[] = [
    { key: "description", label: "Description", width: 220 },
    { key: "start", label: "Start Date", width: 140, align: "center" },
    { key: "duration", label: "Duration", width: 160, align: "center" },
    { key: "end", label: "End Date", width: 190, align: "center" },
    { key: "currency", label: "Currency", width: 70 },
    { key: "inflation", label: "Inflation Profile [%]", width: 140 },
    { key: "fix", label: `Fix Costs p.a. [${cur}]`, width: 140, align: "right" },
    { key: "rev", label: "% of Revenues", width: 110, align: "right" },
    { key: "mwh", label: `${cur}/MWh p.a.`, width: 110, align: "right" },
    { key: "mw", label: `${cur}/MW p.a.`, width: 110, align: "right" },
    { key: "wtg", label: `${cur}/WTG p.a.`, width: 110, align: "right" },
    { key: "agg", label: "Aggregation", width: 100 },
    { key: "sec", label: ll ? "Secured" : "Distribution Frequency", width: ll ? 90 : 160 },
    { key: "alloc", label: ll ? "Allocation" : "External Contract", width: ll ? 100 : 130 },
  ];
  if (ll) cols.push({ key: "otp", label: "OTP", width: 90 });
  return cols;
}

export function OpexContractTable(props: OpexContractTableProps) {
  const styles = useStyles();
  const tree = useTreeStyles();
  const { title, type, contracts, currencyCode, currencyNames, collapsed } = props;
  const cols = columns(type, currencyCode);
  const alignClass = (c: Column) => (c.align === "right" ? styles.right : c.align === "center" ? styles.center : undefined);

  if (contracts.length === 0) {
    return (
      <InlineEmpty padding={12} size={13}>
        No standard contracts for this country and technology yet. Use "Add Contract Type" to create one.
      </InlineEmpty>
    );
  }

  return (
    <div className={styles.scroller}>
      <table className={styles.table} aria-label={`${title} standard contracts`}>
        <colgroup>
          <col style={{ width: 30 }} />
          {cols.map((c) => <col key={c.key} style={{ width: c.width }} />)}
          <col style={{ width: 96 }} />
        </colgroup>
        <thead>
          <tr>
            <th className={mergeClasses(styles.th, styles.gutter)} aria-label="Expand" />
            {cols.map((c) => <th key={c.key} scope="col" className={mergeClasses(styles.th, alignClass(c))}>{c.label}</th>)}
            <th scope="col" className={mergeClasses(styles.th, styles.actions)}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {contracts.map((contract) => {
            const isCollapsed = collapsed.has(contract.key);
            const visible = isCollapsed ? [contract.head] : contract.periods;
            const addAllowed = canAddPeriod(contract);
            const blockedReason = inactiveRowsReason(contract);
            const addHint = `Add a period after Period ${contract.highestPeriod}`;
            const addReason = !addAllowed ? blockedReason ?? MSG.maxPeriods : !props.canCreate ? addHint : null;
            const addButton = (
              <Button
                appearance="transparent"
                size="small"
                className={styles.addPeriod}
                icon={<AddFilled />}
                aria-label={`Add Period to ${contract.head.description}`}
                data-testid={`cost-add-period-${contract.key}`}
                onClick={() => props.onAddPeriod(contract)}
              >
                Add Period
              </Button>
            );
            return [
              ...visible.map((row) => {
                const isHead = row.id === contract.head.id;
                const isTail = row.id === contract.last.id;
                const v = toStandardOpexRow(row, contract, currencyNames);
                const cells: Record<string, string> = {
                  description: v.description, start: v.startDate, duration: [v.years, v.months].filter(Boolean).join(" "),
                  end: v.endDate, currency: v.currency, inflation: v.inflation, fix: v.fixCosts, rev: v.ofRevenues,
                  mwh: v.eurMwh, mw: v.eurMw, wtg: v.eurWtg, agg: v.aggregation, sec: v.securedOrFrequency,
                  alloc: v.allocationOrExternal, otp: v.otp,
                };
                return (
                  <tr key={row.id} className={isHead ? styles.headRow : undefined}>
                    <td className={mergeClasses(styles.td, styles.gutter)}>
                      {/* On every Period-1 row, single-period too (ACS:2723-2763, no Visible). */}
                      {isHead ? (
                        <ExpandToggle
                          variant="text18"
                          expanded={!isCollapsed}
                          label={`${isCollapsed ? "Show" : "Hide"} the periods of ${row.description}`}
                          testId={`cost-contract-toggle-${contract.key}`}
                          onToggle={() => props.onToggle(contract.key)}
                        />
                      ) : null}
                    </td>
                    {cols.map((c) => (
                      <td
                        key={c.key}
                        title={c.key === "description" || c.key === "end" ? cells[c.key] : undefined}
                        className={mergeClasses(
                          styles.td, alignClass(c),
                          c.key === "description" && isHead && styles.bold,
                          c.key === "description" && !isHead && tree.connector,
                          c.key === "description" && !isHead && isTail && tree.connectorLast,
                          c.key === "inflation" && v.inflationIsValue && styles.right,
                        )}
                      >
                        {cells[c.key]}
                      </td>
                    ))}
                    <td className={mergeClasses(styles.td, styles.actions, isHead && styles.actionsTinted)}>
                      <RowActions
                        size="small"
                        tone="link"
                        toneWhenLocked
                        align="end"
                        actions={[
                          {
                            key: "edit", icon: <EditRegular />, label: `Edit ${row.description}`,
                            disabled: !props.canEdit(row), onClick: () => props.onEdit(contract, row),
                            testId: `cost-period-edit-${row.id}`,
                          },
                          {
                            // Period 1 and the last period only. A period
                            // blocked by hidden inactive rows is explained, focusable, never a dead-end error.
                            key: "delete", icon: <DeleteRegular />, label: `Delete ${row.description}`,
                            visible: canDeleteRow(contract, row),
                            ...(blockedReason && !canDeletePeriodRow(contract, row)
                              ? { disabledReason: blockedReason }
                              : { disabled: !props.canDelete(row) }),
                            onClick: () => props.onDelete(contract, row),
                            testId: `cost-period-delete-${row.id}`,
                          },
                        ]}
                      />
                    </td>
                  </tr>
                );
              }),
              isCollapsed ? null : (
                <tr key={`${contract.key}-add`}>
                  {/* ACS:3564 — the canvas button has no X, so it sits at the row's left edge (under the +/-). */}
                  <td className={styles.td} colSpan={cols.length + 2}>
                    {/* Blocked: the reason. Enabled: the canvas hint as a description tooltip (`enabledTooltip`). */}
                    <DisabledReason reason={addReason} enabledTooltip={addHint}>{addButton}</DisabledReason>
                  </td>
                </tr>
              ),
            ];
          })}
        </tbody>
      </table>
    </div>
  );
}
