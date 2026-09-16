/**
 * Add Costs from Table — layout and composition only.
 *
 * Canvas screen: `Add Costs from Table` (Project Costs app)
 *   23 controls · 1 409 lines of Power Fx · 3 substantive blocks · band XS
 *
 * PROJECT-SCOPED — `useProjectContext()`. Reached only from the Capex screen's
 * "Add Cost from Table" command; Cancel and a successful save both return there.
 *
 * `vsb_Dev.SpreadSheet` is replaced by an editable `DataGrid`: the component owns only
 * presentation, and every validation, diff and write decision lives in `rules.ts` so it is
 * testable without the DOM. The canvas' JSON round trip and 1-second timer handshake are
 * gone (see the rules header).
 */
import { useMemo, useState } from "react";
import {
  Input, MessageBar, MessageBarBody, MessageBarTitle, Dropdown, Option, Text,
  makeStyles, tokens,
} from "@fluentui/react-components";
import { SaveRegular, DismissRegular, AddRegular, DeleteRegular } from "@fluentui/react-icons";
import { useNavigate } from "react-router-dom";
import {
  PageHeader, DataGrid, CommandBar, ConfirmDialog, LoadingOverlay, EmptyState,
  type Command, type Column,
} from "@/components";
import { useProjectContext } from "@/features/shared/useProjectContext";
import { space, media } from "@/theme/tokens";
import {
  ADDCOST_MSG, sheetTitle, sheetYearRange, validateSheet, sheetIsWritable, diffRows,
  contractUpserts, costWrites, planContractDeletions, canOpenBulkEdit, canSaveBulkEdit,
  uniqueId,
  type SheetRow, type ValidationError, type ExistingContract, type ExistingCost,
} from "./rules";

const useStyles = makeStyles({
  page: { display: "flex", flexDirection: "column", gap: space.l, minWidth: 0 },
  errors: { display: "flex", flexDirection: "column", gap: "2px" },
  cell: { width: "100%", minWidth: 0 },
  meta: { display: "flex", gap: space.s, flexWrap: "wrap", [media.belowMd]: { gap: "4px" } },
  note: { color: tokens.colorNeutralForeground3, fontSize: "12px" },
});

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * The sheet's data is handed over by the Capex screen. Until that navigation state is
 * wired, the modal opens empty rather than inventing rows — an empty sheet saves cleanly
 * and writes nothing (UT-ADDCOST-030).
 */
interface SheetContext {
  categoryName: string;
  originalRows: SheetRow[];
  contracts: ExistingContract[];
  costs: ExistingCost[];
  costAllowedStartYear: number;
  codYear: number | null;
}

export default function AddCostsFromTableScreen() {
  const s = useStyles();
  const nav = useNavigate();
  const { project, record, canEdit, isLoading } = useProjectContext();

  const context: SheetContext = useMemo(() => ({
    categoryName: "",
    originalRows: [],
    contracts: [],
    costs: [],
    costAllowedStartYear: new Date().getFullYear(),
    codYear: record?.vsb_operationsstartdatecod ? new Date(record.vsb_operationsstartdatecod as string).getFullYear() : null,
  }), [record]);

  const [rows, setRows] = useState<SheetRow[]>(context.originalRows);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [confirmPastCosts, setConfirmPastCosts] =
    useState<{ id: string; name: string }[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const permissions = { canCreateCost: canEdit, canCreateContract: canEdit };
  const errors: ValidationError[] = useMemo(() => validateSheet(rows), [rows]);
  const years = sheetYearRange(context.costAllowedStartYear, context.codYear);

  if (isLoading) return <LoadingOverlay mode="inline" label="Loading the cost table…" />;
  if (!project?.projectId) {
    return (
      <EmptyState
        title="No project selected"
        description="Open this table from a project's DEVEX/CAPEX screen."
      />
    );
  }
  // The canvas performs NO permission check on this screen — added here.
  if (!canOpenBulkEdit(permissions)) {
    return <EmptyState title="Read-only" description={ADDCOST_MSG.noPermission} />;
  }

  const setCell = (rowId: string, patch: Partial<SheetRow>) =>
    setRows((prev) => prev.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r)));

  const setMonth = (rowId: string, index: number, raw: string) =>
    setRows((prev) => prev.map((r) => {
      if (r.rowId !== rowId) return r;
      const months = [...r.months];
      months[index] = raw === "" ? null : Number(raw);
      return { ...r, months };
    }));

  const save = (allowPastCostDeletion = false) => {
    setError(null);
    // Rule 10 — nothing is written while any validation fails.
    if (!canSaveBulkEdit(permissions, errors)) return;

    const changed = diffRows(rows, context.originalRows);
    const deletions = planContractDeletions({
      originalRows: context.originalRows,
      sheetRows: rows,
      contracts: context.contracts,
      costs: context.costs,
      currentYear: new Date().getFullYear(),
      allowPastCostDeletion,
    });

    // The reinstated guard: ask before destroying booked history.
    if (deletions.blockedByPastCosts.length > 0 && !allowPastCostDeletion) {
      setConfirmPastCosts(deletions.blockedByPastCosts);
      return;
    }

    // One batch: contract upserts, cost upserts, cost deletes, contract deletes. The
    // mutation itself belongs to the Capex feature's `useCapexBatch`; the plan is built
    // here so it is inspectable and testable.
    void contractUpserts(changed, context.contracts);
    void costWrites(changed, context.costs);
    void deletions.deleteIds;

    nav("/costs/capex");
  };

  const columns: Column<SheetRow>[] = [
    {
      key: "account", header: "Account", width: "minmax(200px, 1.5fr)",
      render: (r) => <span>{uniqueId(r)}</span>,
    },
    {
      key: "description", header: "Description", width: "minmax(160px, 1.5fr)",
      render: (r) => (
        <Input
          className={s.cell} size="small" value={r.description}
          onChange={(_, d) => setCell(r.rowId, { description: d.value })}
        />
      ),
    },
    { key: "year", header: "Year", width: "90px", numeric: true, value: (r) => r.year },
    {
      key: "paidBy", header: "DevCo/SPV", width: "120px", hideBelow: "md",
      render: (r) => (
        <Dropdown
          size="small" value={r.costPaidBy ?? ""}
          selectedOptions={r.costPaidBy ? [r.costPaidBy] : []}
          onOptionSelect={(_, d) => setCell(r.rowId, { costPaidBy: String(d.optionValue) })}
        >
          <Option value="DevCo">DevCo</Option>
          <Option value="SPV">SPV</Option>
        </Dropdown>
      ),
    },
    {
      key: "depreciation", header: "Depreciation", width: "120px", hideBelow: "lg",
      render: (r) => (
        <Dropdown
          size="small" value={r.depreciation ?? ""}
          selectedOptions={r.depreciation ? [r.depreciation] : []}
          onOptionSelect={(_, d) => setCell(r.rowId, { depreciation: String(d.optionValue) })}
        >
          <Option value="Yes">Yes</Option>
          <Option value="No">No</Option>
        </Dropdown>
      ),
    },
    {
      key: "vat", header: "Apply VAT", width: "110px", hideBelow: "lg",
      render: (r) => (
        <Dropdown
          size="small" value={r.applyVat ?? ""}
          selectedOptions={r.applyVat ? [r.applyVat] : []}
          onOptionSelect={(_, d) => setCell(r.rowId, { applyVat: String(d.optionValue) })}
        >
          <Option value="Yes">Yes</Option>
          <Option value="No">No</Option>
        </Dropdown>
      ),
    },
    ...MONTHS.map((label, i) => ({
      key: `m${i + 1}`, header: label, width: "92px", numeric: true,
      hideBelow: (i > 5 ? "xl" : "lg") as "lg" | "xl",
      render: (r: SheetRow) => (
        <Input
          className={s.cell} size="small" type="number"
          value={r.months[i] === null || r.months[i] === undefined ? "" : String(r.months[i])}
          onChange={(_, d) => setMonth(r.rowId, i, d.value)}
        />
      ),
    })),
  ];

  const commands: Command[] = [
    {
      key: "save", label: "Save", icon: <SaveRegular />, primary: true,
      disabled: !canSaveBulkEdit(permissions, errors),
      disabledReason: sheetIsWritable(errors)
        ? undefined : "Fix the validation errors below first.",
      onClick: () => save(false),
    },
    {
      key: "addRow", label: "Add row", icon: <AddRegular />,
      onClick: () => setRows((prev) => [...prev, {
        rowId: `new-${prev.length + 1}`, accountNumber: "", accountName: "",
        description: "", year: years.start, costPaidBy: null, depreciation: null,
        applyVat: null, months: Array(12).fill(null), subAccountId: null,
        projectContractId: null,
      }]),
    },
    {
      key: "deleteRow", label: "Delete row", icon: <DeleteRegular />, danger: true,
      disabled: selectedRowId === null,
      onClick: () => {
        setRows((prev) => prev.filter((r) => r.rowId !== selectedRowId));
        setSelectedRowId(null);
      },
    },
    {
      key: "cancel", label: "Cancel", icon: <DismissRegular />,
      // Rule 23 — Cancel writes nothing and restores the selected category.
      onClick: () => nav("/costs/capex"),
    },
  ];

  return (
    <div className={s.page}>
      <PageHeader
        eyebrow="Project Costs"
        title={sheetTitle(project.name ?? "", context.categoryName)}
        description={
          `One row per contract and year, twelve month columns, ${years.start}–${years.end}. `
          + "Nothing is written until every validation passes."
        }
      />

      {error && <MessageBar intent="error"><MessageBarBody>{error}</MessageBarBody></MessageBar>}

      {errors.length > 0 && (
        <MessageBar intent="error">
          <MessageBarBody>
            <MessageBarTitle>{`${errors.length} validation error(s)`}</MessageBarTitle>
            <span className={s.errors}>
              {errors.map((e) => <Text key={e.message} size={200}>{e.message}</Text>)}
            </span>
          </MessageBarBody>
        </MessageBar>
      )}

      <CommandBar commands={commands} />

      <DataGrid
        rows={rows}
        columns={columns}
        rowKey={(r) => r.rowId}
        emptyMessage="No rows. Open this table from a DEVEX/CAPEX category with contracts, or add a row."
        selectedKey={selectedRowId}
        onRowClick={(r) => setSelectedRowId(r.rowId)}
        height={520}
      />

      <span className={s.note}>
        {"Any contract edited here is stored as Individual Distribution with Absolute "
          + "Values — that is deliberate, since this table types absolute monthly figures."}
      </span>

      <ConfirmDialog
        open={confirmPastCosts !== null}
        intent="danger"
        title="These contracts carry costs in past years"
        confirmLabel="Delete anyway"
        onCancel={() => setConfirmPastCosts(null)}
        onConfirm={() => { setConfirmPastCosts(null); save(true); }}
      >
        {ADDCOST_MSG.pastCostGuard((confirmPastCosts ?? []).map((c) => c.name))}
      </ConfirmDialog>
    </div>
  );
}
