/**
 * Capex Costs Screen — layout and composition only.
 *
 * Canvas screen: `Capex Costs Screen` (Project Costs app)
 *   355 controls · 22 286 lines of Power Fx · 180 substantive blocks · band XL
 *
 * PROJECT-SCOPED — `useProjectContext()`. The canvas' hard-coded fallback to
 * `GUID("33b9cc79-5b4f-f111-bec6-000d3a3855c2")` is deliberately NOT ported: a missing
 * project is an error state (UT-CAPEX-058).
 *
 * `vsb_Dev.DevexCapexSummaryPCF` is replaced by the shared `DataGrid` with twelve month
 * columns; its `ShowEmptyAccounts` / `ShowPlannedCost` / `CostPaidByFilter` props became
 * grid-level filters in `rules.buildGrid`, which is unit-tested. Every decision on this
 * screen comes from `rules.ts`.
 */
import { useMemo, useState, type CSSProperties } from "react";
import {
  TabList, Tab, Field, Input, Dropdown, Option, Radio, RadioGroup, Checkbox, Switch,
  Button, Badge, MessageBar, MessageBarBody, Text, makeStyles, tokens, mergeClasses,
  Menu, MenuTrigger, MenuPopover, MenuList, MenuItem,
} from "@fluentui/react-components";
import {
  AddRegular, EditRegular, DeleteRegular, StarRegular, CommentRegular,
  ChevronLeftRegular, ChevronRightRegular, MoreHorizontalRegular,
} from "@fluentui/react-icons";
import { useNavigate } from "react-router-dom";
import {
  PageHeader, DataGrid, CommandBar, FormPanel, ConfirmDialog, LoadingOverlay,
  EmptyState, Card, NumericInput, type Command, type Column,
} from "@/components";
import { useProjectContext } from "@/features/shared/useProjectContext";
import { CHOICE_COST, DISTRIBUTION_FREQUENCY } from "@/data/entities";
import { space, media } from "@/theme/tokens";
import {
  MSG, costAllowedStart, navigationWindow, clampSelectedYear, visibleCategories,
  flattenCosts, buildGrid, grandTotalRow, capexCommands, canGoPreviousYear, canGoNextYear,
  canSaveContract, describeDescriptionError, validateTotalCost, validateMonthYear,
  totalCostMax, commentThreads, gridCommentFlags, sortComments, summaryRows,
  formatSummaryAmount, buildStandardOptions, standardContractRefusal,
  paymentDateCommentsAllowed, applyDescriptionChange, byClusterJson, formatThousands,
  formatCostCell, MONTH_LABELS, GRAND_TOTAL_LABEL, CAPEX_TOOLBAR_LABELS, CAPEX_GRID_COLUMNS,
  ROW_ADD_BUTTON_LABEL, ROW_ADD_MENU_ITEM_LABEL,
  DESCRIPTION_MAX_LENGTH,
  type ContractForm, type GridRow, type ClusterDuration, type CapexProject,
} from "./rules";
import {
  useCapexAccountTree, useCapexContracts, useCapexCosts, useCapexComments,
  useDevexCapexAssumptions, useActiveWtgCount, useCapexPrivileges, useCapexBatch,
  CAPEX_ENTITY, CONTRACT_COL,
} from "./hooks";

const useStyles = makeStyles({
  page: { display: "flex", flexDirection: "column", gap: space.l, minWidth: 0 },
  tabs: { overflowX: "auto" },
  toolbar: {
    display: "flex", alignItems: "center", gap: space.s, flexWrap: "wrap",
    [media.belowMd]: { gap: space.xs },
  },
  spacer: { flex: 1, minWidth: 0 },
  year: { fontVariantNumeric: "tabular-nums", fontWeight: 600, minWidth: "62px",
    textAlign: "center" },
  panelBody: { display: "flex", flexDirection: "column", gap: space.m },
  monthGrid: {
    display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: space.s,
    [media.belowMd]: { gridTemplateColumns: "repeat(2, minmax(0, 1fr))" },
  },
  clusterList: { display: "flex", flexDirection: "column", gap: "2px" },
  note: { color: tokens.colorNeutralForeground3, fontSize: "12px" },
  thread: {
    display: "flex", flexDirection: "column", gap: "2px",
    padding: space.s, borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  summaryRow: {
    display: "flex", justifyContent: "space-between", gap: space.m,
    padding: `8px ${space.m}`, borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  indent0: { display: "flex", alignItems: "center", gap: space.xs, fontWeight: 600 },
  indent1: { display: "flex", alignItems: "center", gap: space.xs, paddingLeft: space.m },
  indent2: {
    paddingLeft: space.xl, color: tokens.colorNeutralForeground2,
  },
  /** Hosts the DataGrid plus the "saving costs" blocking modal (GUIDE r08). */
  gridWrap: { position: "relative", display: "flex", flexDirection: "column", minWidth: 0 },
  /** GUIDE r06/r08 — the dark-banded Grand Total row that closes the grid. */
  grandTotal: {
    display: "grid", alignItems: "center",
    backgroundColor: tokens.colorNeutralForeground1,
    color: tokens.colorNeutralBackground1,
    fontWeight: 700,
  },
  grandTotalCell: {
    padding: `10px ${space.m}`,
    fontVariantNumeric: "tabular-nums",
    textAlign: "right",
    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
  },
  grandTotalLabel: { textAlign: "left" },
});

const emptyForm = (): ContractForm => ({
  description: "", originalDescription: null, totalCost: "", distribution: null,
  scheme: null, equalMode: null,
  clusterTicks: Array.from({ length: 5 }, () => ({ checked: false, enabled: true })),
  startDate: "", endDate: "", frequency: null, isDirty: false, isStandardContract: false,
});

export default function CapexCostsScreen() {
  const s = useStyles();
  const nav = useNavigate();
  const { project, record, canEdit, isLoading: projectLoading } = useProjectContext();
  const projectId = project?.projectId;

  const tree = useCapexAccountTree();
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [showEmptyAccounts, setShowEmptyAccounts] = useState(true);
  const [showPlanned, setShowPlanned] = useState(true);
  const [costPaidByFilter, setCostPaidByFilter] =
    useState<"all" | "devco" | "spv">("all");
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [form, setForm] = useState<ContractForm>(emptyForm());
  const [commentsFor, setCommentsFor] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<GridRow | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pinGeneral, setPinGeneral] = useState(true);
  const [showResolved, setShowResolved] = useState(false);

  /* ── the cost project, assembled from the freshly read record (rule 1's inputs) ── */
  const capexProject: CapexProject = useMemo(() => ({
    projectId: projectId ?? "",
    acquisitionDate: (record?.vsb_acquisitiondate as string | null) ?? null,
    projectStartDate: record?.vsb_projectstartdate ?? null,
    endDate: (record?.vsb_enddate as string | null) ?? null,
    codDate: (record?.vsb_operationsstartdatecod as string | null) ?? null,
    totalCapacity: record?.vsb_totalcapacity ?? null,
    startClusterNo: Number(
      record?.["_vsb_clusterstate_value@OData.Community.Display.V1.FormattedValue"]
        ? String(record["_vsb_clusterstate_value@OData.Community.Display.V1.FormattedValue"])
            .replace(/\D/g, "") || 0
        : 0,
    ),
    technology:
      (record?.["vsb_technology@OData.Community.Display.V1.FormattedValue"] as string) ?? null,
    countryId: record?._vsb_country_value ?? null,
    countryName:
      (record?.["_vsb_country_value@OData.Community.Display.V1.FormattedValue"] as string) ?? null,
    isoCurrencyCode: (record?.vsb_isocurrencycode as string | null) ?? null,
  }), [projectId, record]);

  /**
   * `gblClusterDurations` — six rows built from the project's milestone dates. Until the
   * milestone repository is wired for this screen the window degrades to the project's own
   * dates, which is exactly what `navigationWindow` falls back to.
   */
  const clusters: ClusterDuration[] = useMemo(() => [], []);

  const allowedStart = useMemo(
    () => costAllowedStart(capexProject),
    [capexProject],
  );
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const window0 = useMemo(
    () => navigationWindow(capexProject, clusters, allowedStart.year, selectedYear),
    [capexProject, clusters, allowedStart.year, selectedYear],
  );
  const year = clampSelectedYear(
    selectedYear ?? new Date().getFullYear(), window0.min, window0.max,
  );

  /* ── data ── */
  const categories = useMemo(() => visibleCategories(tree.categories), [tree.categories]);
  const accountsInCategory = useMemo(
    () => tree.level2.filter((a) => a.parentId === categoryId),
    [tree.level2, categoryId],
  );
  const accountIds = useMemo(
    () => new Set(accountsInCategory.map((a) => a.id)),
    [accountsInCategory],
  );
  const subaccountsInCategory = useMemo(
    () => tree.level3.filter((sub) => sub.parentId !== null && accountIds.has(sub.parentId)),
    [tree.level3, accountIds],
  );

  const { contracts, isLoading: contractsLoading } = useCapexContracts(
    projectId, categoryId, subaccountsInCategory.map((x) => x.id),
  );
  const contractIds = useMemo(() => contracts.map((c) => c.id), [contracts]);
  const { costs, isLoading: costsLoading } = useCapexCosts(
    projectId, categoryId, contractIds, year,
  );
  const { comments } = useCapexComments(projectId, contractIds);
  const { assumptions } = useDevexCapexAssumptions(capexProject.countryId);
  const wtgCount = useActiveWtgCount(projectId);
  const privileges = useCapexPrivileges(canEdit);
  const batch = useCapexBatch(projectId, "capexCosts/save");

  const threads = useMemo(() => commentThreads(comments), [comments]);
  const commentFlags = useMemo(
    () => gridCommentFlags(threads, costs, year),
    [threads, costs, year],
  );

  const rows = useMemo(() => {
    if (categoryId === null) return [];
    const flat = flattenCosts(costs, contracts, subaccountsInCategory, year);
    return buildGrid({
      accounts: accountsInCategory, subaccounts: subaccountsInCategory, contracts,
      flat, allCosts: costs, commentFlags, showEmptyAccounts, costPaidByFilter,
    });
  }, [
    categoryId, costs, contracts, subaccountsInCategory, accountsInCategory, year,
    commentFlags, showEmptyAccounts, costPaidByFilter,
  ]);

  const selectedRow = rows.find((r) => r.id === selectedRowId) ?? null;
  const selectedContract = contracts.find((c) => c.id === selectedRowId) ?? null;

  const standardOptions = useMemo(() => buildStandardOptions({
    assumptions,
    subaccountIdsInCategory: selectedRow?.type === "subaccount"
      ? [selectedRow.id] : subaccountsInCategory.map((x) => x.id),
    project: capexProject,
    existingContracts: contracts,
    clusterDurations: clusters,
  }), [assumptions, selectedRow, subaccountsInCategory, capexProject, contracts, clusters]);

  const summary = useMemo(() => {
    const totals = new Map<string, number>();
    for (const c of contracts) totals.set(c.subaccountId ?? "", c.totalCost ?? 0);
    return summaryRows(categories, totals);
  }, [categories, contracts]);

  /* ── gating ── */
  const gates = capexCommands({
    selected: selectedRow, privileges,
    standardOptionCount: standardOptions.length, busy: batch.isPending,
  });

  const existingNames = useMemo(
    () => contracts
      .filter((c) => c.subaccountId === (selectedRow?.type === "subaccount"
        ? selectedRow.id : selectedRow?.parentId))
      .map((c) => c.description ?? c.name),
    [contracts, selectedRow],
  );

  const descriptionError = describeDescriptionError(form.description, {
    originalDescription: form.originalDescription, existingNames,
  });
  const totalCostCheck = validateTotalCost(form.totalCost, capexProject.countryName);
  const startDateError = validateMonthYear(form.startDate, allowedStart.date, "start");
  const endDateError = validateMonthYear(form.endDate, allowedStart.date, "end");
  const saveEnabled = canSaveContract(form, {
    existingNames, countryName: capexProject.countryName, allowedStart: allowedStart.date,
  });

  /* ── early exits ── */
  if (!projectId) {
    return <EmptyState title="No project selected" description={MSG.missingProject} />;
  }
  if (projectLoading || tree.isLoading) {
    return <LoadingOverlay mode="inline" label="Loading the DEVEX/CAPEX cost tree…" />;
  }

  const patch = (p: Partial<ContractForm>) =>
    setForm((prev) => ({ ...prev, ...p, isDirty: true }));

  const openNew = () => {
    setForm({ ...emptyForm(), originalDescription: null });
    setPanelOpen(true);
  };
  /**
   * GUIDE r06 — the row-level "••• Add" flyout: selects the sub-account row it is anchored
   * to and opens the same New Cost panel `openNew` does. Not a page-level command.
   */
  const openNewFor = (row: GridRow) => {
    setSelectedRowId(row.id);
    openNew();
  };
  const openEdit = () => {
    if (!selectedContract) return;
    const description = selectedContract.description ?? selectedContract.name;
    setForm({
      ...emptyForm(),
      description,
      originalDescription: description,
      totalCost: selectedContract.totalCost === null ? "" : String(selectedContract.totalCost),
      distribution: selectedContract.distribution,
      scheme: selectedContract.distributionScheme,
      equalMode: selectedContract.byClusterJson ? "cluster" : "dates",
      frequency: selectedContract.distributionFrequency,
      isStandardContract: selectedContract.isStandardContract,
      isDirty: false,
    });
    setPanelOpen(true);
  };

  const submit = () => {
    setError(null);
    const contractData: Record<string, unknown> = {
      [CONTRACT_COL.description]: form.description,
      [CONTRACT_COL.name]: form.description,
      [CONTRACT_COL.totalCost]: Number(form.totalCost) || null,
      [CONTRACT_COL.distribution]: form.distribution,
      [CONTRACT_COL.scheme]: form.scheme,
      [CONTRACT_COL.frequency]: form.frequency,
      [CONTRACT_COL.isStandard]: form.isStandardContract,
      [`${CONTRACT_COL.project}@odata.bind`]: `/vsb_projects(${projectId})`,
    };
    if (form.distribution === CHOICE_COST.distributionType.equal
      && form.equalMode === "cluster") {
      contractData[CONTRACT_COL.byClusterJson] = byClusterJson(form.clusterTicks);
    }
    batch.mutate(
      [{
        op: selectedContract ? "update" : "create",
        entitySet: CAPEX_ENTITY.contract,
        id: selectedContract?.id,
        data: contractData,
      }],
      {
        onSuccess: () => { setPanelOpen(false); setForm(emptyForm()); },
        // The panel KEEPS the user's input on failure (UT-CAPEX-057).
        onError: () => setError(MSG.saveFailed),
      },
    );
  };

  const addStandard = () => {
    const option = standardOptions[0];
    if (!option) return;
    const refusal = standardContractRefusal(option.eligible);
    if (refusal) { setNotice(refusal); return; }
    setNotice(`"${option.assumption.description}" will be created with `
      + `${option.eligible.length} cost period(s).`);
  };

  // GUIDE r06 — "Add New Cost" is NOT a page-level command: it is the row-level "••• Add"
  // flyout on a sub-account row (`openNewFor`, in the `name` column below).
  const commands: Command[] = [
    {
      key: "standard", label: "Add Standard Contract", icon: <StarRegular />,
      visible: gates.addStandardVisible,
      disabled: !gates.addStandardContract,
      onClick: addStandard,
    },
    {
      key: "edit", label: "Edit", icon: <EditRegular />,
      disabled: !gates.edit, onClick: openEdit,
    },
    {
      key: "comments", label: "Comments", icon: <CommentRegular />,
      disabled: selectedRow?.type !== "contract",
      onClick: () => setCommentsFor(selectedRowId),
    },
    {
      key: "delete", label: "Delete Cost", icon: <DeleteRegular />, danger: true,
      disabled: !gates.deleteCost,
      disabledReason: privileges.canDeleteCost
        ? undefined : "You do not have permission to delete cost rows.",
      onClick: () => selectedRow && setConfirmDelete(selectedRow),
    },
  ];

  // GUIDE r06 — Number, Account Name, Total Costs, Total Paid, Total Planned, then Jan..Dec.
  // Every column carries a definite px width: `horizontalScroll` (below) needs one.
  const columns: Column<GridRow>[] = [
    {
      key: "number", header: CAPEX_GRID_COLUMNS.number, width: "92px",
      value: (r) => r.number || "-",
    },
    {
      key: "name", header: CAPEX_GRID_COLUMNS.accountName, width: "260px",
      render: (r) => (
        <span
          className={r.type === "account" ? s.indent0 : r.type === "subaccount"
            ? s.indent1 : s.indent2}
        >
          <span>
            {r.name}
            {r.subLabel && <Text size={100} block>{r.subLabel}</Text>}
          </span>
          {r.hasComments && <Badge appearance="tint" size="small">comment</Badge>}
          {/* GUIDE r06 — the inline "••• Add" flyout, anchored to the sub-account row. */}
          {r.type === "subaccount" && privileges.canCreateCost && (
            <Menu>
              <MenuTrigger disableButtonEnhancement>
                <Button
                  appearance="subtle" size="small" icon={<MoreHorizontalRegular />}
                  disabled={batch.isPending}
                  onClick={(e) => e.stopPropagation()}
                >
                  {ROW_ADD_BUTTON_LABEL}
                </Button>
              </MenuTrigger>
              <MenuPopover onClick={(e) => e.stopPropagation()}>
                <MenuList>
                  <MenuItem icon={<AddRegular />} onClick={() => openNewFor(r)}>
                    {ROW_ADD_MENU_ITEM_LABEL}
                  </MenuItem>
                </MenuList>
              </MenuPopover>
            </Menu>
          )}
        </span>
      ),
    },
    { key: "total", header: CAPEX_GRID_COLUMNS.totalCosts, width: "112px", numeric: true,
      value: (r) => formatCostCell(r.total) },
    ...(showPlanned ? [
      { key: "paid", header: CAPEX_GRID_COLUMNS.totalPaid, width: "112px", numeric: true,
        value: (r: GridRow) => formatCostCell(r.paid) },
      { key: "planned", header: CAPEX_GRID_COLUMNS.totalPlanned, width: "112px", numeric: true,
        value: (r: GridRow) => formatCostCell(r.planned) },
    ] : []),
    ...MONTH_LABELS.map((label, i) => ({
      key: `m${i + 1}`, header: label, width: "84px", numeric: true,
      render: (r: GridRow) => (
        <span>
          {formatCostCell(r.m[i])}
          {r.mPaid[i] && <Badge appearance="tint" color="success" size="small">paid</Badge>}
          {r.mHasComments[i] && <Badge appearance="tint" size="small">•</Badge>}
        </span>
      ),
    })),
  ];

  const grand = grandTotalRow(rows);
  const grandTemplate = columns.map((c) => c.width ?? "1fr").join(" ");

  const visibleThreads = sortComments(threads.filter(
    (t) => t.root.contractId === commentsFor,
  ), { pinGeneral, order: "newest", showResolved });

  return (
    <div className={s.page}>
      <PageHeader
        eyebrow="Project Costs"
        title="DEVEX / CAPEX"
        description={
          "Development and capital costs by account, sub-account and contract, month by "
          + "month for one year at a time."
        }
      />

      {error && <MessageBar intent="error"><MessageBarBody>{error}</MessageBarBody></MessageBar>}
      {notice && (
        <MessageBar intent="info" onClick={() => setNotice(null)}>
          <MessageBarBody>{notice}</MessageBarBody>
        </MessageBar>
      )}

      <TabList
        className={s.tabs}
        selectedValue={categoryId ?? "__summary"}
        onTabSelect={(_, d) => {
          setCategoryId(d.value === "__summary" ? null : String(d.value));
          setSelectedRowId(null);
        }}
      >
        {/* The synthetic `DEVEX/CAPEX Summary` row `App.OnStart` prepends. */}
        <Tab value="__summary">DEVEX/CAPEX Summary</Tab>
        {categories.map((c) => <Tab key={c.id} value={c.id}>{c.name}</Tab>)}
      </TabList>

      {categoryId === null ? (
        <Card title="Cost summary by category">
          {summary.length === 0 ? (
            <EmptyState title="No categories" description="The CAPEX chart of accounts is empty." />
          ) : summary.map((r) => (
            <div key={r.id} className={s.summaryRow}>
              <span>{r.name}</span>
              <strong>{formatSummaryAmount(r.sum, capexProject.isoCurrencyCode)}</strong>
            </div>
          ))}
        </Card>
      ) : (
        <>
          {/* GUIDE r06 — toolbar order, verbatim: Add Cost from Table, the two toggles,
              the Show All Cost dropdown, then the year stepper the month columns belong to. */}
          <div className={s.toolbar}>
            <Button
              appearance="transparent" icon={<AddRegular />}
              disabled={!privileges.canCreateCost || categoryId === null || batch.isPending}
              onClick={() => nav("/costs/add-from-table")}
            >
              {CAPEX_TOOLBAR_LABELS.addCostFromTable}
            </Button>
            <Switch
              label={CAPEX_TOOLBAR_LABELS.showEmptyAccounts} checked={showEmptyAccounts}
              onChange={(_, d) => setShowEmptyAccounts(d.checked)}
            />
            <Switch
              label={CAPEX_TOOLBAR_LABELS.showTotalPlannedPaid} checked={showPlanned}
              onChange={(_, d) => setShowPlanned(d.checked)}
            />
            <Dropdown
              aria-label={CAPEX_TOOLBAR_LABELS.showAllCost}
              value={costPaidByFilter === "all" ? CAPEX_TOOLBAR_LABELS.showAllCost
                : costPaidByFilter === "devco" ? "DevCo" : "SPV"}
              selectedOptions={[costPaidByFilter]}
              onOptionSelect={(_, d) =>
                setCostPaidByFilter(d.optionValue as "all" | "devco" | "spv")}
            >
              <Option value="all">{CAPEX_TOOLBAR_LABELS.showAllCost}</Option>
              <Option value="devco">DevCo</Option>
              <Option value="spv">SPV</Option>
            </Dropdown>
            <span className={s.spacer} />
            <Button
              appearance="subtle" icon={<ChevronLeftRegular />} aria-label="Previous year"
              disabled={!canGoPreviousYear(year, window0.min)}
              onClick={() => setSelectedYear(year - 1)}
            />
            <span className={s.year}>{year}</span>
            <Button
              appearance="subtle" icon={<ChevronRightRegular />} aria-label="Next year"
              disabled={!canGoNextYear(year, window0.max)}
              onClick={() => setSelectedYear(year + 1)}
            />
          </div>

          <CommandBar commands={commands} />

          {/* `gridWrap` is `position: relative` so the "saving costs" overlay (GUIDE r08)
              blocks exactly the grid, not the tabs/toolbar/command bar above it. */}
          <div className={s.gridWrap}>
            <DataGrid
              rows={rows}
              columns={columns}
              rowKey={(r) => r.id}
              loading={contractsLoading || costsLoading}
              emptyMessage="No accounts, sub-accounts or contracts in this category."
              selectedKey={selectedRowId}
              onRowClick={(r) => setSelectedRowId(r.id)}
              height={520}
              horizontalScroll
              footer={
                <div
                  className={s.grandTotal}
                  style={{ gridTemplateColumns: grandTemplate } as CSSProperties}
                >
                  <span className={mergeClasses(s.grandTotalCell, s.grandTotalLabel)}>-</span>
                  <span className={mergeClasses(s.grandTotalCell, s.grandTotalLabel)}>
                    {GRAND_TOTAL_LABEL}
                  </span>
                  <span className={s.grandTotalCell}>{formatCostCell(grand.total)}</span>
                  {showPlanned && (
                    <>
                      <span className={s.grandTotalCell}>{formatCostCell(grand.paid)}</span>
                      <span className={s.grandTotalCell}>{formatCostCell(grand.planned)}</span>
                    </>
                  )}
                  {MONTH_LABELS.map((label, i) => (
                    <span key={label} className={s.grandTotalCell}>
                      {formatCostCell(grand.m[i])}
                    </span>
                  ))}
                </div>
              }
            />
            {batch.isPending && <LoadingOverlay label={MSG.savingCosts} />}
          </div>
        </>
      )}

      <FormPanel
        open={panelOpen}
        title={selectedContract ? "Edit contract" : "New contract"}
        onClose={() => { setPanelOpen(false); setError(null); }}
        onSave={submit}
        saveDisabled={!saveEnabled}
        busy={batch.isPending}
        errors={[
          descriptionError,
          form.totalCost !== "" && !totalCostCheck.valid ? totalCostCheck.message : null,
          startDateError, endDateError,
        ].filter((x): x is string => x !== null)}
      >
        <div className={s.panelBody}>
          <Field label="Description" required>
            <Input
              value={form.description}
              maxLength={DESCRIPTION_MAX_LENGTH}
              onChange={(_, d) => {
                const next = applyDescriptionChange(d.value, form.isStandardContract);
                patch({
                  description: next.description,
                  isStandardContract: next.isStandardContract,
                });
              }}
            />
          </Field>

          {/* `IsInteger` + the country-dependent ceiling (Poland 2 250 000 000). */}
          <NumericInput
            label={`Total cost (max ${formatThousands(totalCostMax(capexProject.countryName))})`}
            value={form.totalCost}
            onChange={(v) => patch({ totalCost: v })}
            places={0}
            min={1}
            max={totalCostMax(capexProject.countryName)}
          />

          <Field label="Distribution type" required>
            <RadioGroup
              value={form.distribution === null ? "" : String(form.distribution)}
              onChange={(_, d) => patch({ distribution: Number(d.value) })}
            >
              <Radio
                value={String(CHOICE_COST.distributionType.individual)}
                label="Individual Distribution"
              />
              <Radio
                value={String(CHOICE_COST.distributionType.equal)}
                label="Equal Distribution"
              />
            </RadioGroup>
          </Field>

          {form.distribution === CHOICE_COST.distributionType.individual && (
            <Field label="Scheme" required>
              <RadioGroup
                value={form.scheme === null ? "" : String(form.scheme)}
                onChange={(_, d) => patch({ scheme: Number(d.value) })}
              >
                <Radio
                  value={String(CHOICE_COST.distributionScheme.absoluteValues)}
                  label="Absolute Values"
                />
                <Radio
                  value={String(CHOICE_COST.distributionScheme.percentValues)}
                  label="% Values"
                />
              </RadioGroup>
            </Field>
          )}

          {form.distribution === CHOICE_COST.distributionType.equal && (
            <>
              <Field label="Spread over" required>
                <RadioGroup
                  value={form.equalMode ?? ""}
                  onChange={(_, d) => patch({ equalMode: d.value as "cluster" | "dates" })}
                >
                  <Radio value="cluster" label="By Cluster" />
                  <Radio value="dates" label="By Start and End Date" />
                </RadioGroup>
              </Field>

              {form.equalMode === "cluster" && (
                <div className={s.clusterList}>
                  {form.clusterTicks.map((t, i) => (
                    <Checkbox
                      key={i}
                      label={`Cluster ${i + 1}`}
                      checked={t.checked}
                      disabled={!t.enabled}
                      onChange={(_, d) => patch({
                        clusterTicks: form.clusterTicks.map((x, j) =>
                          j === i ? { ...x, checked: Boolean(d.checked) } : x),
                      })}
                    />
                  ))}
                </div>
              )}

              {form.equalMode === "dates" && (
                <div className={s.monthGrid}>
                  <Field label="Start (MM/YYYY)" required>
                    <Input
                      value={form.startDate} placeholder="01/2027"
                      onChange={(_, d) => patch({ startDate: d.value })}
                    />
                  </Field>
                  <Field label="End (MM/YYYY)" required>
                    <Input
                      value={form.endDate} placeholder="12/2029"
                      onChange={(_, d) => patch({ endDate: d.value })}
                    />
                  </Field>
                </div>
              )}

              <Field label="Payment frequency" required>
                <Dropdown
                  value={DISTRIBUTION_FREQUENCY.find((x) => x.value === form.frequency)?.label ?? ""}
                  selectedOptions={form.frequency === null ? [] : [String(form.frequency)]}
                  onOptionSelect={(_, d) => patch({ frequency: Number(d.optionValue) })}
                >
                  {DISTRIBUTION_FREQUENCY.map((x) => (
                    <Option key={x.id} value={String(x.value)}>{x.label}</Option>
                  ))}
                </Dropdown>
              </Field>
            </>
          )}

          <span className={s.note}>
            {`Costs may not start before ${allowedStart.date.getFullYear()}. `}
            {`EUR/WTG standard assumptions multiply by ${wtgCount} active generator(s).`}
          </span>
        </div>
      </FormPanel>

      <FormPanel
        open={commentsFor !== null}
        title="Comments"
        onClose={() => setCommentsFor(null)}
      >
        <div className={s.panelBody}>
          {!paymentDateCommentsAllowed(selectedContract) && (
            <MessageBar intent="warning">
              <MessageBarBody>{MSG.paymentCommentOnEqual}</MessageBarBody>
            </MessageBar>
          )}
          <div className={s.toolbar}>
            <Checkbox
              label="Pin general comments" checked={pinGeneral}
              onChange={(_, d) => setPinGeneral(Boolean(d.checked))}
            />
            <Checkbox
              label="Show resolved comments" checked={showResolved}
              onChange={(_, d) => setShowResolved(Boolean(d.checked))}
            />
          </div>
          {visibleThreads.length === 0 ? (
            <EmptyState title="No comments" description="Nothing has been said about this contract yet." />
          ) : visibleThreads.map((t) => (
            <div key={t.root.id} className={s.thread}>
              <Text weight="semibold">
                {`#${t.sequenceNumber} ${t.isGeneral ? "General" : "Payment date"}`}
                {t.resolved && " · resolved"}
              </Text>
              <Text>{t.latestText}</Text>
              <Text size={100}>{`${t.replies.length} repl${t.replies.length === 1 ? "y" : "ies"} · last activity ${t.lastActivityOn.slice(0, 10)}`}</Text>
            </div>
          ))}
        </div>
      </FormPanel>

      <ConfirmDialog
        open={confirmDelete !== null}
        intent="danger"
        title={`Delete "${confirmDelete?.name ?? ""}"?`}
        confirmLabel="Delete"
        busy={batch.isPending}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (!confirmDelete) return;
          const plan = comments
            .filter((c) => c.contractId === confirmDelete.id)
            .map((c) => ({
              op: "delete" as const, entitySet: CAPEX_ENTITY.comment, id: c.id,
            }));
          batch.mutate(
            [...plan, {
              op: "delete", entitySet: CAPEX_ENTITY.contract, id: confirmDelete.id,
            }],
            { onSuccess: () => setConfirmDelete(null) },
          );
        }}
      >
        {"Its comments are deleted with it. Its monthly cost rows are removed by the "
          + "Dataverse cascade, exactly as in the canvas app."}
      </ConfirmDialog>
    </div>
  );
}
