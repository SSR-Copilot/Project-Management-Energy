/**
 * Contracts Screen — layout and composition only.
 *
 * Canvas screen: `Contracts Screen` (Project Costs app)
 *   243 controls · 6 713 lines of Power Fx · 80 substantive blocks · band XL
 *
 * PROJECT-SCOPED — `useProjectContext()`.
 *
 * The canvas' mandatory `Recalculate` button is gone: `deriveFigures` recomputes Costs
 * Until / After, Total Costs and Total cost of contract on every relevant change, and Save
 * is driven by validity plus dirtiness. The one action worth keeping — "Reset to standard
 * assumption" — is an explicit button on the margin block.
 */
import { useMemo, useState } from "react";
import {
  Accordion, AccordionItem, AccordionHeader, AccordionPanel, Badge, Field, Input,
  Radio, RadioGroup, Switch, Checkbox, Button, MessageBar, MessageBarBody, Divider, Text,
  makeStyles, tokens,
} from "@fluentui/react-components";
import {
  AddRegular, EditRegular, DeleteRegular, ArrowResetRegular,
} from "@fluentui/react-icons";
import {
  PageHeader, DataGrid, CommandBar, FormPanel, ConfirmDialog, LoadingOverlay,
  EmptyState, NumericInput, PercentageInput, StatTiles,
  type Command, type Column, type Stat,
} from "@/components";
import { useProjectContext } from "@/features/shared/useProjectContext";
import { formatDate } from "@/domain/dates";
import { formatWithSeparators } from "@/domain/numeric";
import { CHOICE_COST } from "@/data/entities";
import { space, media } from "@/theme/tokens";
import {
  CONTR_MSG, CONTRACT_COSTS_MAX, CONTRACT_TYPE_LABEL, CONTRACT_COMMAND_LABELS,
  buildAccountTree, markUsedAccounts, selectedLevel3Ids, deriveFigures, contractName,
  rightsContractName, paymentTargetName, contractWritePayload, planDevCoCostSet,
  planDeleteContract, canSaveContract, canSaveRightsContract, validateCostValue,
  validatePaymentPercentage, validatePaymentDate, paymentTargetHeadroom,
  contractCommands, paymentTargetCommands, marginDisplay, panelForContract,
  groupByContractType, fabricRowsForProject, fabricMarginDefaults, devCoCostName,
  type AccountNode, type BopContract, type ContractForm, type PaymentTarget,
} from "./rules";
import {
  useCapexAccountRows, useDevCoCapexContracts, useDevCoCapexCosts, useBopContracts,
  useBopAssumptions, useBopBatch, BOP_COL, TARGET_COL, JOIN_COL, BOP_ENTITY,
} from "./hooks";

const useStyles = makeStyles({
  page: { display: "flex", flexDirection: "column", gap: space.l, minWidth: 0 },
  cardHead: { display: "flex", alignItems: "center", gap: space.s, flexWrap: "wrap" },
  body: { display: "flex", flexDirection: "column", gap: space.m },
  panelBody: { display: "flex", flexDirection: "column", gap: space.m },
  duo: {
    display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: space.s,
    [media.belowMd]: { gridTemplateColumns: "1fr" },
  },
  marginHead: { display: "flex", alignItems: "center", gap: space.s },
  italic: { fontStyle: "italic", color: tokens.colorBrandForeground1 },
  treeRow: {
    display: "flex", alignItems: "center", gap: space.s,
    padding: `4px ${space.s}`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  level1: { fontWeight: 600 },
  level2: { paddingLeft: space.m },
  level3: { paddingLeft: space.xl },
  grow: { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" },
  note: { color: tokens.colorNeutralForeground3, fontSize: "12px" },
});

const emptyForm = (): ContractForm => ({
  description: "", contractType: null, closingDate: null,
  untilType: CHOICE_COST.closingDateType.plan, untilActual: "",
  afterType: CHOICE_COST.closingDateType.plan, afterActual: "",
  totalType: CHOICE_COST.totalCostsType.calculated, totalOverwrite: "",
  marginEnabled: false, marginType: null, marginPercentage: "", marginFixedValue: "",
  isMarginStandardAssumption: false, isDirty: false,
});

const emptyTarget = () => ({
  id: null as string | null, description: "", paymentDate: "", percentage: "", note: "",
});

export default function ContractsScreen() {
  const s = useStyles();
  const { project, record, canEdit, isLoading: projectLoading } = useProjectContext();
  const projectId = project?.projectId;
  const projectNumber = record?.vsb_internalprojectid ?? "";
  const countryName =
    (record?.["_vsb_country_value@OData.Community.Display.V1.FormattedValue"] as string) ?? null;
  const technology =
    (record?.["vsb_technology@OData.Community.Display.V1.FormattedValue"] as string) ?? null;
  const isoCurrencyCode = (record?.vsb_isocurrencycode as string | null) ?? null;

  const { accounts, isLoading: accountsLoading } = useCapexAccountRows();
  const { capexContracts } = useDevCoCapexContracts(projectId);
  const { costs } = useDevCoCapexCosts(projectId, capexContracts);
  const { contracts, targets, joins, isLoading } = useBopContracts(projectId);
  const { assumptions, isUnavailable } = useBopAssumptions(countryName, technology);
  const batch = useBopBatch(projectId, "contracts/save");

  const [selectedContractId, setSelectedContractId] = useState<string | null>(null);
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [panel, setPanel] = useState<"main" | "rights" | null>(null);
  const [form, setForm] = useState<ContractForm>(emptyForm());
  const [tree, setTree] = useState<AccountNode[]>([]);
  const [targetPanel, setTargetPanel] = useState<
    { contractId: string; values: ReturnType<typeof emptyTarget> } | null
  >(null);
  const [confirm, setConfirm] = useState<BopContract | null>(null);
  const [error, setError] = useState<string | null>(null);

  const baseTree = useMemo(
    () => buildAccountTree(accounts, capexContracts),
    [accounts, capexContracts],
  );

  const selectedContract = contracts.find((c) => c.id === selectedContractId) ?? null;
  const selectedTarget = targets.find((t) => t.id === selectedTargetId) ?? null;

  const permissions = {
    canCreate: canEdit,
    canEditRecord: canEdit,
    canDeleteRecord: canEdit,
  };

  const figures = useMemo(
    () => deriveFigures(form, costs, tree),
    [form, costs, tree],
  );

  const fabricRows = useMemo(
    () => fabricRowsForProject(assumptions, { countryName, technology }),
    [assumptions, countryName, technology],
  );

  if (!projectId) {
    return (
      <EmptyState
        title="No project selected"
        description="Open this screen from a project. The canvas app fell back to a hard-coded test project here; that is not ported."
      />
    );
  }
  if (projectLoading || accountsLoading || isLoading) {
    return <LoadingOverlay mode="inline" label="Loading BoP contracts…" />;
  }

  const patch = (p: Partial<ContractForm>) =>
    setForm((prev) => ({ ...prev, ...p, isDirty: true }));

  const applyFabricDefaults = (contractType: number) => {
    const defaults = fabricMarginDefaults(fabricRows, CONTRACT_TYPE_LABEL[contractType] ?? "");
    // The canvas silently skips the UpdateContext when the lookup is blank — same here.
    return defaults ?? {};
  };

  const openNew = (contractType: number) => {
    const rights = contractType === CHOICE_COST.bopContractTypes.projectRights;
    setSelectedContractId(null);
    setTree(markUsedAccounts(baseTree, joins, null));
    setForm({ ...emptyForm(), contractType, ...applyFabricDefaults(contractType) });
    setPanel(rights ? "rights" : "main");
  };

  const openEdit = (contract: BopContract) => {
    setSelectedContractId(contract.id);
    // Rule 24 — the level-3 rows already joined to this contract come back ticked.
    setTree(markUsedAccounts(baseTree, joins, contract.id));
    setForm({
      description: contract.description,
      contractType: contract.contractType,
      closingDate: contract.closingDate ? contract.closingDate.slice(0, 10) : null,
      untilType: contract.costsUntilClosingType ?? CHOICE_COST.closingDateType.plan,
      untilActual: contract.costsUntilClosingActual === null
        ? "" : String(contract.costsUntilClosingActual),
      afterType: contract.costsAfterClosingType ?? CHOICE_COST.closingDateType.plan,
      afterActual: contract.costsAfterClosingActual === null
        ? "" : String(contract.costsAfterClosingActual),
      totalType: contract.totalCostsType ?? CHOICE_COST.totalCostsType.calculated,
      totalOverwrite: contract.totalCostsOverwrite === null
        ? "" : String(contract.totalCostsOverwrite),
      marginEnabled: contract.margin,
      marginType: contract.marginType,
      marginPercentage: contract.marginPercentage === null
        ? "" : String(contract.marginPercentage),
      marginFixedValue: contract.marginFixedValue === null
        ? "" : String(contract.marginFixedValue),
      isMarginStandardAssumption: contract.isMarginStandardAssumption,
      isDirty: false,
    });
    setPanel(panelForContract(contract));
  };

  const submit = () => {
    setError(null);
    const rights = form.contractType === CHOICE_COST.bopContractTypes.projectRights;
    const payload = contractWritePayload(form, figures);

    const data: Record<string, unknown> = {
      [BOP_COL.name]: rights
        // Corrected: the Rights name uses THIS panel's description.
        ? rightsContractName(projectNumber, form.description)
        : contractName(projectNumber, form.description),
      [BOP_COL.description]: form.description,
      [BOP_COL.contractTypes]: form.contractType,
      [BOP_COL.closingDate]: form.closingDate,
      [BOP_COL.untilType]: payload.costsUntilClosingType,
      [BOP_COL.untilPlan]: payload.costsUntilClosingPlan,
      [BOP_COL.untilActual]: payload.costsUntilClosingActual,
      [BOP_COL.afterType]: payload.costsAfterClosingType,
      [BOP_COL.afterPlan]: payload.costsAfterClosingPlan,
      [BOP_COL.afterActual]: payload.costsAfterClosingActual,
      [BOP_COL.totalType]: payload.totalCostsType,
      [BOP_COL.totalCalculated]: payload.totalCostsCalculated,
      [BOP_COL.totalOverwrite]: payload.totalCostsOverwrite,
      [BOP_COL.margin]: payload.margin,
      [BOP_COL.marginType]: payload.marginType,
      [BOP_COL.marginPercentage]: payload.marginPercentage,
      [BOP_COL.marginFixedValue]: payload.marginFixedValue,
      [BOP_COL.totalOfContract]: payload.totalCostOfContract,
      [BOP_COL.isStandard]: payload.isStandardContract,
      [BOP_COL.isMarginStandard]: payload.isMarginStandardAssumption,
      [`${BOP_COL.project}@odata.bind`]: `/vsb_projects(${projectId})`,
    };

    // Rule 18 — the DevCo-cost set is REPLACED in the same batch.
    const devCoPlan = planDevCoCostSet(tree, joins, selectedContractId);
    const writes: Parameters<typeof batch.mutate>[0] = [
      {
        op: selectedContract ? "update" : "create",
        entitySet: BOP_ENTITY.contract,
        id: selectedContract?.id,
        data,
      },
    ];
    if (!rights && selectedContract) {
      for (const id of devCoPlan.deleteIds) {
        writes.push({ op: "delete", entitySet: BOP_ENTITY.join, id });
      }
      for (const item of devCoPlan.create) {
        writes.push({
          op: "create", entitySet: BOP_ENTITY.join,
          data: {
            [JOIN_COL.name]: item.name,
            [`${JOIN_COL.contract}@odata.bind`]:
              `/${BOP_ENTITY.contract}(${selectedContract.id})`,
            [`${JOIN_COL.account}@odata.bind`]: `/vsb_capexaccountlists(${item.accountId})`,
          },
        });
      }
    }

    batch.mutate(writes, {
      onSuccess: () => { setPanel(null); setForm(emptyForm()); },
      // The panel keeps its state on failure (UT-CONTR-054).
      onError: () => setError(CONTR_MSG.saveFailed),
    });
  };

  const submitTarget = () => {
    if (!targetPanel) return;
    const contract = contracts.find((c) => c.id === targetPanel.contractId);
    if (!contract) return;
    batch.mutate([{
      op: targetPanel.values.id ? "update" : "create",
      entitySet: BOP_ENTITY.target,
      id: targetPanel.values.id ?? undefined,
      data: {
        [TARGET_COL.name]: paymentTargetName(
          contract.description, targetPanel.values.description.trim(),
        ),
        [TARGET_COL.description]: targetPanel.values.description.trim(),
        [TARGET_COL.paymentDate]: targetPanel.values.paymentDate.trim(),
        [TARGET_COL.totalCostsContract]: Number(targetPanel.values.percentage) || 0,
        [TARGET_COL.note]: targetPanel.values.note,
        [`${TARGET_COL.contract}@odata.bind`]:
          `/${BOP_ENTITY.contract}(${targetPanel.contractId})`,
      },
    }], { onSuccess: () => setTargetPanel(null) });
  };

  const commands = (): Command[] => {
    const gates = contractCommands({
      selected: selectedContract, permissions, busy: batch.isPending,
    });
    // GUIDE r07 — the Contracts screen's own command bar: three separate "+ Add … Contract"
    // actions, then Edit and Delete, both disabled until a row is selected.
    return [
      {
        key: "addDev", label: CONTRACT_COMMAND_LABELS.addDevelopment, icon: <AddRegular />,
        primary: true,
        disabled: !gates.addDevelopment,
        onClick: () => openNew(CHOICE_COST.bopContractTypes.development),
      },
      {
        key: "addCon", label: CONTRACT_COMMAND_LABELS.addConstruction, icon: <AddRegular />,
        disabled: !gates.addConstruction,
        onClick: () => openNew(CHOICE_COST.bopContractTypes.construction),
      },
      {
        key: "addRights", label: CONTRACT_COMMAND_LABELS.addRights, icon: <AddRegular />,
        disabled: !gates.addRights,
        onClick: () => openNew(CHOICE_COST.bopContractTypes.projectRights),
      },
      {
        key: "edit", label: CONTRACT_COMMAND_LABELS.edit, icon: <EditRegular />,
        disabled: !gates.edit,
        onClick: () => selectedContract && openEdit(selectedContract),
      },
      {
        key: "delete", label: CONTRACT_COMMAND_LABELS.delete, icon: <DeleteRegular />,
        danger: true,
        // Corrected: this checks the DELETE privilege, not Edit.
        disabled: !gates.delete,
        disabledReason: permissions.canDeleteRecord
          ? undefined : "You do not have permission to delete contracts.",
        onClick: () => selectedContract && setConfirm(selectedContract),
      },
    ];
  };

  const targetColumns: Column<PaymentTarget>[] = [
    { key: "description", header: "Description", width: "minmax(180px, 2fr)",
      value: (r) => r.description },
    { key: "date", header: "Payment date", width: "130px",
      value: (r) => r.paymentDate ?? "" },
    { key: "pct", header: "% of contract", width: "130px", numeric: true,
      value: (r) => r.totalCostsContract ?? "" },
    { key: "note", header: "Note", width: "minmax(160px, 1fr)", hideBelow: "md",
      value: (r) => r.note ?? "" },
  ];

  const rightsMode = panel === "rights";
  const saveEnabled = rightsMode
    ? canSaveRightsContract(form)
    : canSaveContract(form, selectedLevel3Ids(tree), figures);

  const headroom = targetPanel
    ? paymentTargetHeadroom(
      targets.filter((t) => t.contractId === targetPanel.contractId),
      targetPanel.values.id,
    )
    : 100;

  const targetErrors = targetPanel ? [
    validatePaymentDate(targetPanel.values.paymentDate, record?.vsb_projectstartdate ?? null),
    validatePaymentPercentage(targetPanel.values.percentage, headroom),
  ].filter((x): x is string => x !== null) : [];

  const stats: Stat[] = [
    { label: "Contracts", value: String(contracts.length) },
    {
      label: "Payment targets",
      value: String(targets.length),
    },
    {
      label: "Total of contracts",
      value: formatWithSeparators(
        contracts.reduce((a, c) => a + (c.totalCostOfContract ?? 0), 0), "en-US", 0,
      ),
      unit: isoCurrencyCode || "EUR",
    },
  ];

  return (
    <div className={s.page}>
      <PageHeader
        eyebrow="Project Costs"
        title="Contracts"
        description={
          "Balance-of-Plant contracts: their CAPEX account scope, the cost split around the "
          + "closing date, the margin and the payment targets."
        }
      />

      {error && <MessageBar intent="error"><MessageBarBody>{error}</MessageBarBody></MessageBar>}
      {isUnavailable && (
        <MessageBar intent="warning">
          <MessageBarBody>{CONTR_MSG.fabricUnavailable}</MessageBarBody>
        </MessageBar>
      )}

      <StatTiles stats={stats} />
      <CommandBar commands={commands()} />

      {contracts.length === 0 ? (
        <EmptyState
          title="No BoP contracts yet"
          description="Add a Development, Construction or Project Rights contract to begin."
        />
      ) : (
        <Accordion collapsible multiple>
          {groupByContractType(contracts).map((contract) => {
            const cardTargets = targets.filter((t) => t.contractId === contract.id);
            const margin = marginDisplay(contract, isoCurrencyCode);
            const gates = paymentTargetCommands({
              contract: selectedContract, cardContractId: contract.id,
              selectedTarget, targets: cardTargets, permissions,
            });
            return (
              <AccordionItem key={contract.id} value={contract.id}>
                <AccordionHeader onClick={() => setSelectedContractId(contract.id)}>
                  <span className={s.cardHead}>
                    <strong>{contract.description || contract.name}</strong>
                    <Badge appearance="tint" size="small">
                      {CONTRACT_TYPE_LABEL[contract.contractType ?? 0] ?? "Contract"}
                    </Badge>
                    {margin.value !== null && (
                      <span className={margin.italic ? s.italic : undefined}>
                        {`${margin.label} ${margin.value}`}
                      </span>
                    )}
                  </span>
                </AccordionHeader>
                <AccordionPanel>
                  <div className={s.body}>
                    <div className={s.duo}>
                      <Text>{`Closing date: ${formatDate(contract.closingDate)}`}</Text>
                      <Text>
                        {`Total of contract: ${
                          formatWithSeparators(contract.totalCostOfContract ?? 0, "en-US", 0)
                        } ${isoCurrencyCode || "EUR"}`}
                      </Text>
                      <Text>
                        {`Until closing: ${
                          formatWithSeparators(
                            contract.costsUntilClosingActual
                            ?? contract.costsUntilClosingPlan ?? 0, "en-US", 0,
                          )}`}
                      </Text>
                      <Text>
                        {`After closing: ${
                          formatWithSeparators(
                            contract.costsAfterClosingActual
                            ?? contract.costsAfterClosingPlan ?? 0, "en-US", 0,
                          )}`}
                      </Text>
                    </div>

                    <CommandBar
                      commands={[
                        {
                          key: "addTarget", label: "Add Period", icon: <AddRegular />,
                          disabled: !gates.addPeriod || batch.isPending,
                          disabledReason:
                            "Payment targets may not sum above 100% of the contract.",
                          onClick: () => setTargetPanel({
                            contractId: contract.id, values: emptyTarget(),
                          }),
                        },
                        {
                          key: "editTarget", label: "Edit", icon: <EditRegular />,
                          disabled: !gates.edit || batch.isPending,
                          onClick: () => selectedTarget && setTargetPanel({
                            contractId: contract.id,
                            values: {
                              id: selectedTarget.id,
                              description: selectedTarget.description,
                              paymentDate: selectedTarget.paymentDate ?? "",
                              percentage: selectedTarget.totalCostsContract === null
                                ? "" : String(selectedTarget.totalCostsContract),
                              note: selectedTarget.note ?? "",
                            },
                          }),
                        },
                        {
                          key: "deleteTarget", label: "Delete", icon: <DeleteRegular />,
                          danger: true,
                          disabled: !gates.delete || batch.isPending,
                          onClick: () => selectedTarget && batch.mutate([{
                            op: "delete", entitySet: BOP_ENTITY.target, id: selectedTarget.id,
                          }], { onSuccess: () => setSelectedTargetId(null) }),
                        },
                      ]}
                    />

                    <DataGrid
                      rows={cardTargets}
                      columns={targetColumns}
                      rowKey={(r) => r.id}
                      emptyMessage="No payment targets on this contract."
                      selectedKey={selectedContractId === contract.id ? selectedTargetId : null}
                      onRowClick={(r) => {
                        setSelectedContractId(contract.id);
                        setSelectedTargetId(r.id);
                      }}
                      height={Math.min(280, 56 + cardTargets.length * 44) || 140}
                    />
                  </div>
                </AccordionPanel>
              </AccordionItem>
            );
          })}
        </Accordion>
      )}

      <FormPanel
        open={panel !== null}
        title={selectedContract ? "Edit contract" : "New contract"}
        onClose={() => { setPanel(null); setError(null); }}
        onSave={submit}
        saveDisabled={!saveEnabled || batch.isPending}
        busy={batch.isPending}
        errors={[
          validateCostValue(form.untilActual),
          validateCostValue(form.afterActual),
          validateCostValue(form.totalOverwrite),
        ].filter((x): x is string => x !== null)}
      >
        <div className={s.panelBody}>
          <Field label="Description" required>
            <Input
              value={form.description}
              onChange={(_, d) => patch({ description: d.value })}
            />
          </Field>

          <Field label="Closing date" required>
            <Input
              type="date" value={form.closingDate ?? ""}
              onChange={(_, d) => patch({ closingDate: d.value || null })}
            />
          </Field>

          {rightsMode ? (
            <NumericInput
              label="Total cost" places={2} min={0} max={CONTRACT_COSTS_MAX} required
              value={form.totalOverwrite}
              onChange={(v) => patch({ totalOverwrite: v })}
            />
          ) : (
            <>
              <Divider />
              <Text weight="semibold">Costs until the closing date</Text>
              <RadioGroup
                layout="horizontal"
                value={String(form.untilType)}
                onChange={(_, d) => patch({ untilType: Number(d.value) })}
              >
                <Radio value={String(CHOICE_COST.closingDateType.plan)} label="Plan" />
                <Radio value={String(CHOICE_COST.closingDateType.actual)} label="Actual" />
              </RadioGroup>
              {form.untilType === CHOICE_COST.closingDateType.actual ? (
                <NumericInput
                  label="Actual" places={2} min={0} max={CONTRACT_COSTS_MAX}
                  value={form.untilActual}
                  onChange={(v) => patch({ untilActual: v })}
                />
              ) : (
                <Text>
                  {figures.until === undefined
                    ? "—" : formatWithSeparators(figures.until, "en-US", 0)}
                </Text>
              )}

              <Text weight="semibold">Costs after the closing date</Text>
              <RadioGroup
                layout="horizontal"
                value={String(form.afterType)}
                onChange={(_, d) => patch({ afterType: Number(d.value) })}
              >
                <Radio value={String(CHOICE_COST.closingDateType.plan)} label="Plan" />
                <Radio value={String(CHOICE_COST.closingDateType.actual)} label="Actual" />
              </RadioGroup>
              {form.afterType === CHOICE_COST.closingDateType.actual ? (
                <NumericInput
                  label="Actual" places={2} min={0} max={CONTRACT_COSTS_MAX}
                  value={form.afterActual}
                  onChange={(v) => patch({ afterActual: v })}
                />
              ) : (
                <Text>
                  {figures.after === undefined
                    ? "—" : formatWithSeparators(figures.after, "en-US", 0)}
                </Text>
              )}

              <Divider />
              <Text weight="semibold">Total costs</Text>
              <RadioGroup
                layout="horizontal"
                value={String(form.totalType)}
                onChange={(_, d) => patch({ totalType: Number(d.value) })}
              >
                <Radio
                  value={String(CHOICE_COST.totalCostsType.calculated)} label="Calculated"
                />
                <Radio value={String(CHOICE_COST.totalCostsType.overwrite)} label="Overwrite" />
              </RadioGroup>
              {form.totalType === CHOICE_COST.totalCostsType.overwrite ? (
                <NumericInput
                  label="Overwrite" places={2} min={0} max={CONTRACT_COSTS_MAX}
                  value={form.totalOverwrite}
                  onChange={(v) => patch({ totalOverwrite: v })}
                />
              ) : (
                <Text>
                  {figures.total === undefined
                    ? "—" : formatWithSeparators(figures.total, "en-US", 0)}
                </Text>
              )}

              <Divider />
              <div className={s.marginHead}>
                <Switch
                  label="Margin" checked={form.marginEnabled}
                  onChange={(_, d) => patch({ marginEnabled: d.checked })}
                />
                <Button
                  appearance="subtle" size="small" icon={<ArrowResetRegular />}
                  title={CONTR_MSG.resetTooltip}
                  aria-label={CONTR_MSG.resetTooltip}
                  onClick={() => form.contractType !== null
                    && patch(applyFabricDefaults(form.contractType))}
                />
              </div>
              {form.marginEnabled && (
                <>
                  <RadioGroup
                    layout="horizontal"
                    value={form.marginType === null ? "" : String(form.marginType)}
                    onChange={(_, d) => patch({ marginType: Number(d.value) })}
                  >
                    <Radio
                      value={String(CHOICE_COST.contractMarginType.percentage)}
                      label="Percentage"
                    />
                    <Radio
                      value={String(CHOICE_COST.contractMarginType.fixedValue)}
                      label="Fixed Value"
                    />
                  </RadioGroup>
                  {form.marginType === CHOICE_COST.contractMarginType.percentage ? (
                    <PercentageInput
                      label="Margin %" min={0} max={100}
                      value={form.marginPercentage}
                      onChange={(v) => patch({ marginPercentage: v })}
                    />
                  ) : (
                    <NumericInput
                      label="Margin fixed value" places={2} min={0} max={CONTRACT_COSTS_MAX}
                      value={form.marginFixedValue}
                      onChange={(v) => patch({ marginFixedValue: v })}
                    />
                  )}
                </>
              )}

              <Text weight="semibold">
                {`Total cost of contract: ${
                  figures.totalOfContract === undefined
                    ? "—"
                    : `${formatWithSeparators(figures.totalOfContract, "en-US", 0)} ${
                      isoCurrencyCode || "EUR"}`
                }`}
              </Text>

              <Divider />
              <Text weight="semibold">CAPEX accounts (level 3 only)</Text>
              <div>
                {tree.map((n) => (
                  <div
                    key={n.id}
                    className={`${s.treeRow} ${
                      n.level === 1 ? s.level1 : n.level === 2 ? s.level2 : s.level3}`}
                  >
                    {n.level === 3 ? (
                      <Checkbox
                        checked={n.selected}
                        disabled={n.used}
                        label={`${n.number} ${n.name}`}
                        onChange={(_, d) => {
                          setTree((prev) => prev.map((x) =>
                            x.id === n.id ? { ...x, selected: Boolean(d.checked) } : x));
                          patch({});
                        }}
                      />
                    ) : (
                      <span className={s.grow}>{`${n.number} ${n.name}`}</span>
                    )}
                    {n.level === 3 && n.totalCost > 0 && (
                      <span className={s.note}>
                        {formatWithSeparators(n.totalCost, "en-US", 0)}
                      </span>
                    )}
                    {n.used && <Badge appearance="tint" size="small">in another contract</Badge>}
                  </div>
                ))}
              </div>
              <span className={s.note}>
                {"Only level-3 accounts carry a cost, and only ticked level-3 accounts feed "
                  + "the figures above. Every figure recalculates as you type — the canvas "
                  + "app needed an explicit Recalculate click first."}
              </span>
            </>
          )}
        </div>
      </FormPanel>

      <FormPanel
        open={targetPanel !== null}
        title={targetPanel?.values.id ? "Edit payment target" : "New payment target"}
        onClose={() => setTargetPanel(null)}
        onSave={submitTarget}
        saveDisabled={targetErrors.length > 0 || batch.isPending
          || !targetPanel?.values.description.trim()}
        busy={batch.isPending}
        errors={targetErrors}
      >
        <div className={s.panelBody}>
          <Field label="Description" required>
            <Input
              value={targetPanel?.values.description ?? ""}
              onChange={(_, d) => setTargetPanel((p) => p && ({
                ...p, values: { ...p.values, description: d.value },
              }))}
            />
          </Field>
          <Field label="Payment date (MM/YYYY)" required>
            <Input
              value={targetPanel?.values.paymentDate ?? ""} placeholder="04/2027"
              onChange={(_, d) => setTargetPanel((p) => p && ({
                ...p, values: { ...p.values, paymentDate: d.value },
              }))}
            />
          </Field>
          <PercentageInput
            label={`% of contract (max ${headroom.toFixed(1)})`}
            min={0} max={headroom} required
            value={targetPanel?.values.percentage ?? ""}
            onChange={(v) => setTargetPanel((p) => p && ({
              ...p, values: { ...p.values, percentage: v },
            }))}
          />
          <Field label="Note">
            <Input
              value={targetPanel?.values.note ?? ""}
              onChange={(_, d) => setTargetPanel((p) => p && ({
                ...p, values: { ...p.values, note: d.value },
              }))}
            />
          </Field>
        </div>
      </FormPanel>

      <ConfirmDialog
        open={confirm !== null}
        intent="danger"
        title={`Delete "${confirm?.description ?? ""}"?`}
        confirmLabel="Delete"
        busy={batch.isPending}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          if (!confirm) return;
          const plan = planDeleteContract(confirm.id, targets, joins);
          batch.mutate([
            ...plan.targetIds.map((id) => ({
              op: "delete" as const, entitySet: BOP_ENTITY.target, id,
            })),
            ...plan.joinIds.map((id) => ({
              op: "delete" as const, entitySet: BOP_ENTITY.join, id,
            })),
            { op: "delete" as const, entitySet: BOP_ENTITY.contract, id: plan.contractId },
          ], { onSuccess: () => { setConfirm(null); setSelectedContractId(null); } });
        }}
      >
        {"Its payment targets and CAPEX account links are deleted with it, in the same "
          + "request. The canvas app relied on the Dataverse cascade for both."}
      </ConfirmDialog>

      {/* `devCoCostName` is the join's Name convention — surfaced here for the reader. */}
      <span hidden>{devCoCostName("10203", "Cabling")}</span>
    </div>
  );
}
