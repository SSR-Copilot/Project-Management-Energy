/**
 * The O&M / Land Lease / Other OPEX contract table (ACS:1323-3623): the header
 * `con_LandLease_Content_Subaccounts_CardBody_CostsTableHeader_1` and the gallery
 * `gal_LandLease_Content_Subaccounts_CardBody_Costs_1`.
 *
 * One Period-1 row per contract (`con_OpexCosts_…_CostsTableRow_1`: tinted, bold description,
 * `+`/`-` fold `Button2_1`), its later periods (`…_CostsTableRow_2`) indented under a tree
 * connector, and "Add Period" (`btn_OpexCosts_Content_Subaccounts_CardBody_AddPeriod`) under the
 * last period of an expanded contract. Delete is offered on Period 1 and on the last period only.
 *
 * The table is repeated per OPEX section, so its gallery id carries the contract type; every row
 * control carries the canvas name plus the row's stable id (CONVENTIONS rule 16): the contract
 * key (its sub-account id) on `Button2_1` / Add Period, the period row id on Edit / Delete.
 *
 * DIVERGENCE (usability): the Actions column is sticky on the right, so Edit/Delete no longer
 * need a horizontal scroll to the end of a ~2,000 px table; it has an "Actions" header the
 * canvas does not have (the canvas places the icons after the OTP column, unlabelled).
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
  // No theme token for these three measured values (row tint, sticky-column tint and shadow).
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

/**
 * `lbl_LandLease_Content_Subaccounts_CardBody_CostsTableHeader_*.Text`, verbatim:
 * Description, StartDate_2, Duration_2, EndDate_2, Currency_2, InflationProfile_2,
 * FixCosts_2 (`$"Fix Costs p.a. [{EUR|PLN}]"`), ProcentOfRevenues_2 (the live `"% of Revenues"`;
 * `"Share of Revenues [%]"` is commented out), EuroPerMwh_2 / EuroPerMw_2 / EuroPerWtg_2
 * (`{EUR|PLN}/MWh p.a.` …), Aggregation_2, Secured_2 (`If(Landlease, "Secured",
 * "Distribution Frequency")`), Allocation (`If(Landlease, "Allocation", "External Contract")`),
 * OTP (Land Lease only).
 */
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
      // NEW — no canvas equivalent: the canvas shows an empty gallery.
      <InlineEmpty padding={12} size={13}>
        No standard contracts for this country and technology yet. Use "Add Contract Type" to create one.
      </InlineEmpty>
    );
  }

  return (
    <div className={styles.scroller}>
      <table
        className={styles.table}
        aria-label={`${title} standard contracts`}
        data-testid={`gal_LandLease_Content_Subaccounts_CardBody_Costs_1-${type}`}
      >
        <colgroup>
          <col style={{ width: 30 }} />
          {cols.map((c) => <col key={c.key} style={{ width: c.width }} />)}
          <col style={{ width: 96 }} />
        </colgroup>
        <thead>
          <tr>
            <th className={mergeClasses(styles.th, styles.gutter)} aria-label="Expand" />
            {cols.map((c) => <th key={c.key} scope="col" className={mergeClasses(styles.th, alignClass(c))}>{c.label}</th>)}
            {/* NEW — no canvas equivalent (see the DIVERGENCE in the header). */}
            <th scope="col" className={mergeClasses(styles.th, styles.actions)}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {contracts.map((contract) => {
            const isCollapsed = collapsed.has(contract.key);
            const visible = isCollapsed ? [contract.head] : contract.periods;
            const addAllowed = canAddPeriod(contract);
            const blockedReason = inactiveRowsReason(contract);
            // NEW — no canvas equivalent: the enabled button's description tooltip.
            const addHint = `Add a period after Period ${contract.highestPeriod}`;
            const addReason = !addAllowed ? blockedReason ?? MSG.maxPeriods : !props.canCreate ? addHint : null;
            const addButton = (
              // `btn_OpexCosts_Content_Subaccounts_CardBody_AddPeriod.Text` — "Add Period", verbatim; no AccessibleLabel.
              <Button
                appearance="transparent"
                size="small"
                className={styles.addPeriod}
                icon={<AddFilled />}
                aria-label="Add Period"
                data-testid={`btn_OpexCosts_Content_Subaccounts_CardBody_AddPeriod-${contract.key}`}
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
                /*
                 * The canvas draws Period 1 with `con_OpexCosts_…_CostsTableRow_1` and its controls
                 * (`Button2_1`, `btn_ICON_…_Edit`, `ico_…_Delete`), every later period with
                 * `…_CostsTableRow_2` and the `_1`-suffixed twins (`btn_ICON_…_Edit_1`, `ico_…_Delete_1`).
                 */
                return (
                  <tr
                    key={row.id}
                    className={isHead ? styles.headRow : undefined}
                    data-testid={isHead
                      ? `con_OpexCosts_Content_Subaccounts_CardBody_CostsTableRow_1-${row.id}`
                      : `con_OpexCosts_Content_Subaccounts_CardBody_CostsTableRow_2-${row.id}`}
                  >
                    <td className={mergeClasses(styles.td, styles.gutter)}>
                      {/* On every Period-1 row, single-period too (ACS:2723-2763, no Visible). */}
                      {isHead ? (
                        // `Button2_1.Text` — `If(ThisItem.'IsCollapsed?', "+", "-")`, verbatim, as the name (no AccessibleLabel).
                        <ExpandToggle
                          variant="text18"
                          expanded={!isCollapsed}
                          label={isCollapsed ? "+" : "-"}
                          testId={`Button2_1-${contract.key}`}
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
                      {/*
                        `btn_ICON_OpexCosts_…_CostsTableRow_Edit(_1).Text` — "Edit", verbatim. The
                        `ico_OpexCosts_…_CostsTableRow_Delete(_1)` trash icons have no text; their
                        names are the delete dialog's titles ("Delete Contract" / "Delete Period").
                      */}
                      <RowActions
                        size="small"
                        tone="link"
                        toneWhenLocked
                        align="end"
                        actions={[
                          {
                            key: "edit", icon: <EditRegular />, label: "Edit",
                            disabled: !props.canEdit(row), onClick: () => props.onEdit(contract, row),
                            testId: isHead
                              ? `btn_ICON_OpexCosts_Content_Subaccounts_CardBody_CostsTableRow_Edit-${row.id}`
                              : `btn_ICON_OpexCosts_Content_Subaccounts_CardBody_CostsTableRow_Edit_1-${row.id}`,
                          },
                          {
                            /*
                             * Period 1 and the last period only. DIVERGENCE: the canvas shows the
                             * later-period trash icon on `Or(Period 1, ThisItem.'IsLastPeriod?')` — the
                             * STORED flag; here "last" is the highest period number (`canDeleteRow`).
                             * A period blocked by hidden inactive rows is explained, focusable, never
                             * a dead-end error.
                             */
                            key: "delete", icon: <DeleteRegular />, label: isHead ? "Delete Contract" : "Delete Period",
                            visible: canDeleteRow(contract, row),
                            ...(blockedReason && !canDeletePeriodRow(contract, row)
                              ? { disabledReason: blockedReason }
                              : { disabled: !props.canDelete(row) }),
                            onClick: () => props.onDelete(contract, row),
                            testId: isHead
                              ? `ico_OpexCosts_Content_Subaccounts_CardBody_CostsTableRow_Delete-${row.id}`
                              : `ico_OpexCosts_Content_Subaccounts_CardBody_CostsTableRow_Delete_1-${row.id}`,
                          },
                        ]}
                      />
                    </td>
                  </tr>
                );
              }),
              isCollapsed ? null : (
                <tr key={`${contract.key}-add`} data-testid={`con_OpexCosts_Content_Subaccounts_CardBody_AddPeriod-${contract.key}`}>
                  {/* ACS:3564 — the canvas button has no X, so it sits at the row's left edge (under the +/-). */}
                  <td className={styles.td} colSpan={cols.length + 2}>
                    {/*
                      DIVERGENCE: the canvas Add Period is always enabled (no DisplayMode). Here it is
                      blocked at Period 10 and by hidden inactive rows, with the reason as a tooltip;
                      enabled, it describes itself with `addHint` (`enabledTooltip`).
                    */}
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
