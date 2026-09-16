/**
 * Land Lease Costs Screen — layout and composition only.
 *
 * Canvas screen: `Land Lease Costs Screen` (Project Costs app)
 *   201 controls · 6 169 lines of Power Fx · 61 substantive blocks · band L
 *
 * PROJECT-SCOPED — `useProjectContext()`.
 *
 * The single right panel is split visually into a CONTRACT section and a PERIOD section,
 * and the contract section is DISABLED whenever the selected period is not Period 1. The
 * canvas achieves the same by silently not writing those fields (rule 2), which is
 * confusing — same underlying rule, better feedback.
 */
import { useMemo, useState } from "react";
import {
  Accordion, AccordionItem, AccordionHeader, AccordionPanel, Badge, Field, Input,
  Dropdown, Option, Switch, MessageBar, MessageBarBody, Divider, Text,
  makeStyles, tokens,
} from "@fluentui/react-components";
import { AddRegular, EditRegular, DeleteRegular, StarRegular } from "@fluentui/react-icons";
import {
  PageHeader, DataGrid, CommandBar, FormPanel, ConfirmDialog, LoadingOverlay,
  EmptyState, NumericInput, PercentageInput, type Command, type Column,
} from "@/components";
import { useProjectContext } from "@/features/shared/useProjectContext";
import { formatDate } from "@/domain/dates";
import { CHOICE_COST, DISTRIBUTION_FREQUENCY } from "@/data/entities";
import { space, media } from "@/theme/tokens";
import {
  LEASE_MSG, buildContracts, contractsForSubaccount, lastPeriod, periodNumber,
  nextPeriod, nextPeriodName, writesContractHeader, landLeaseCostName,
  oneTimePaymentPayload, showSecondPayment, showThirdPayment, securedValue,
  validateDueDate, diffAllocation, allWtgSelected, allocationEditable, allocationVisible,
  allocationName, planDelete, deleteDialog, leaseCommands, canSaveLandLease,
  validateLeaseNumber, isStandardLocked, inflationStartYear, standardPeriodStarts,
  resolveInflationProfile, roundTwoDecimals, planStandardAllocation,
  type LandLeaseContract, type LandLeasePeriod, type LandLeaseForm,
} from "./rules";
import {
  useLeaseSubaccounts, useLeaseContracts, useGeneratorOptions, useLeaseAssumptions,
  useCountryInflation, useLeaseBatch,
  LEASE_COST_COL, LEASE_PERIOD_COL, LEASE_ALLOC_COL, LEASE_ENTITY,
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
  section: { display: "flex", flexDirection: "column", gap: space.s },
  note: { color: tokens.colorNeutralForeground3, fontSize: "12px" },
  disabledNote: {
    color: tokens.colorPaletteDarkOrangeForeground1, fontSize: "12px",
  },
});

const emptyPayments = () => ({
  dueDate: "", amount: "", dueDate2: "", amount2: "", dueDate3: "", amount3: "",
});

const emptyForm = (): LandLeaseForm => ({
  description: "", currencyId: null, securedChecked: false, oneTimePaymentsOn: false,
  payments: emptyPayments(), allWtgAllocated: false, allocatedGeneratorIds: [],
  startDate: null, durationYears: null, durationMonths: null,
  fixedCosts: "", percentOfRevenues: "", eurPerMwh: "", eurPerMw: "", eurPerWtg: "",
  aggregation: null, distributionFrequency: null,
});

export default function LandLeaseScreen() {
  const s = useStyles();
  const { project, record, canEdit, isLoading: projectLoading } = useProjectContext();
  const projectId = project?.projectId;
  const countryId = record?._vsb_country_value ?? null;
  const codDate = (record?.vsb_operationsstartdatecod as string | null) ?? null;
  const technology =
    (record?.["vsb_technology@OData.Community.Display.V1.FormattedValue"] as string) ?? null;

  const { subaccounts, isLoading: subsLoading } = useLeaseSubaccounts();
  const { costs, periods, allocations, isLoading } = useLeaseContracts(projectId);
  const { generators } = useGeneratorOptions(projectId);
  const { assumptions } = useLeaseAssumptions(countryId);
  const countryInflation = useCountryInflation(countryId, inflationStartYear(codDate));
  const batch = useLeaseBatch(projectId, "landLease/save");

  const [selectedSubaccountId, setSelectedSubaccountId] = useState<string | null>(null);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null);
  const [panel, setPanel] = useState<
    { mode: "newContract" | "newPeriod" | "edit"; subaccountId: string } | null
  >(null);
  const [form, setForm] = useState<LandLeaseForm>(emptyForm());
  const [confirm, setConfirm] = useState<
    { contract: LandLeaseContract; period: LandLeasePeriod } | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const contracts = useMemo(() => buildContracts(costs, periods), [costs, periods]);
  const selectedPeriod = periods.find((p) => p.id === selectedPeriodId) ?? null;
  const selectedContract = selectedPeriod
    ? contracts.find((c) => c.cost.id === selectedPeriod.projectCostId) ?? null
    : null;

  const permissions = {
    canCreateCost: canEdit,
    canCreatePeriod: canEdit,
    canEditRecord: canEdit,
    canDeleteRecord: canEdit,
  };

  if (!projectId) {
    return (
      <EmptyState
        title="No project selected"
        description="Open this screen from a project. The canvas app fell back to a hard-coded test project here; that is not ported."
      />
    );
  }
  if (projectLoading || subsLoading || isLoading) {
    return <LoadingOverlay mode="inline" label="Loading land lease costs…" />;
  }

  const patch = (p: Partial<LandLeaseForm>) => setForm((prev) => ({ ...prev, ...p }));

  const isNewContract = panel?.mode === "newContract";
  const contractSectionEnabled = writesContractHeader(selectedPeriod, isNewContract);

  const openNewContract = (subaccountId: string) => {
    setForm({ ...emptyForm(), startDate: codDate });
    setSelectedPeriodId(null);
    setPanel({ mode: "newContract", subaccountId });
  };

  const openNewPeriod = (subaccountId: string) => {
    if (!selectedContract || !selectedPeriod) return;
    const previous = lastPeriod(selectedContract);
    setForm({
      ...emptyForm(),
      description: selectedContract.cost.description,
      currencyId: selectedContract.cost.currencyId,
      startDate: previous?.startDate ?? codDate,
    });
    setPanel({ mode: "newPeriod", subaccountId });
  };

  const openEdit = (contract: LandLeaseContract, period: LandLeasePeriod) => {
    setForm({
      description: contract.cost.description,
      currencyId: contract.cost.currencyId,
      securedChecked: contract.cost.secured === CHOICE_COST.landLeaseSecured.yes,
      oneTimePaymentsOn: contract.cost.amountOneTimePayment !== null,
      payments: {
        dueDate: contract.cost.dueDateOneTimePayment ?? "",
        amount: contract.cost.amountOneTimePayment === null
          ? "" : String(contract.cost.amountOneTimePayment),
        dueDate2: contract.cost.dueDateOneTimePayment2 ?? "",
        amount2: contract.cost.amountOneTimePayment2 === null
          ? "" : String(contract.cost.amountOneTimePayment2),
        dueDate3: contract.cost.dueDateOneTimePayment3 ?? "",
        amount3: contract.cost.amountOneTimePayment3 === null
          ? "" : String(contract.cost.amountOneTimePayment3),
      },
      allWtgAllocated: contract.cost.allWtgAllocated,
      allocatedGeneratorIds: allocations
        .filter((a) => a.projectCostId === contract.cost.id)
        .map((a) => a.generatorInProjectId ?? "")
        .filter(Boolean),
      startDate: period.startDate,
      durationYears: period.durationYears,
      durationMonths: period.durationMonths,
      fixedCosts: period.fixedCosts === null ? "" : String(period.fixedCosts),
      percentOfRevenues:
        period.percentOfRevenues === null ? "" : String(period.percentOfRevenues),
      eurPerMwh: period.eurPerMwh === null ? "" : String(period.eurPerMwh),
      eurPerMw: period.eurPerMw === null ? "" : String(period.eurPerMw),
      eurPerWtg: period.eurPerWtg === null ? "" : String(period.eurPerWtg),
      aggregation: period.aggregation,
      distributionFrequency: period.distributionFrequency,
    });
    setPanel({ mode: "edit", subaccountId: contract.cost.subaccountId ?? "" });
  };

  const submit = () => {
    if (!panel) return;
    setError(null);
    const subaccount = subaccounts.find((x) => x.id === panel.subaccountId) ?? null;
    const writes: Parameters<typeof batch.mutate>[0] = [];

    // Rule 2 — the contract header is written only for a new contract or on Period 1.
    if (contractSectionEnabled) {
      const payments = oneTimePaymentPayload(form.oneTimePaymentsOn, form.payments);
      writes.push({
        op: isNewContract ? "create" : "update",
        entitySet: LEASE_ENTITY.cost,
        id: isNewContract ? undefined : selectedContract?.cost.id,
        data: {
          [LEASE_COST_COL.name]: landLeaseCostName(
            record?.vsb_name ?? "", subaccount?.name ?? "", form.description,
          ),
          // Rule 3 — Description is the raw value, NOT trimmed (unlike OPEX).
          [LEASE_COST_COL.description]: form.description,
          [LEASE_COST_COL.secured]: securedValue(form.securedChecked),
          [LEASE_COST_COL.allWtg]: allWtgSelected(
            form.allocatedGeneratorIds, generators.map((g) => g.id),
          ),
          [LEASE_COST_COL.amount]: payments.amount,
          [LEASE_COST_COL.amount2]: payments.amount2,
          [LEASE_COST_COL.amount3]: payments.amount3,
          [LEASE_COST_COL.dueDate]: payments.dueDate,
          [LEASE_COST_COL.dueDate2]: payments.dueDate2,
          [LEASE_COST_COL.dueDate3]: payments.dueDate3,
          [`${LEASE_COST_COL.project}@odata.bind`]: `/vsb_projects(${projectId})`,
        },
      });

      // Rule 9 — the allocation diff rides in the SAME batch.
      if (selectedContract) {
        const diff = diffAllocation(
          allocations.filter((a) => a.projectCostId === selectedContract.cost.id),
          form.allocatedGeneratorIds,
        );
        for (const generatorId of diff.toCreate) {
          writes.push({
            op: "create", entitySet: LEASE_ENTITY.allocation,
            data: {
              [LEASE_ALLOC_COL.name]: allocationName(
                selectedContract.cost.landOwner, form.description,
                generators.find((g) => g.id === generatorId)?.label ?? "",
              ),
              [`${LEASE_ALLOC_COL.cost}@odata.bind`]:
                `/${LEASE_ENTITY.cost}(${selectedContract.cost.id})`,
              [`${LEASE_ALLOC_COL.generator}@odata.bind`]:
                `/vsb_generatorinprojects(${generatorId})`,
            },
          });
        }
        for (const id of diff.toDelete) {
          writes.push({ op: "delete", entitySet: LEASE_ENTITY.allocation, id });
        }
      }
    }

    // The period patch always runs.
    const period = nextPeriod(
      panel.mode === "newPeriod" ? lastPeriod(selectedContract!)?.period ?? null : null,
    );
    writes.push({
      op: panel.mode === "edit" ? "update" : "create",
      entitySet: LEASE_ENTITY.period,
      id: panel.mode === "edit" ? selectedPeriod?.id : undefined,
      data: {
        [LEASE_PERIOD_COL.name]: panel.mode === "newPeriod" && selectedPeriod
          ? nextPeriodName(
            selectedPeriod.name,
            (selectedContract?.periods ?? []).some((p) => periodNumber(p.period) === 1
              && p.id !== selectedPeriod.id),
          )
          : form.description,
        [LEASE_PERIOD_COL.period]: panel.mode === "edit"
          ? selectedPeriod?.period
          : (period ?? CHOICE_COST.landLeasePeriod.period1),
        [LEASE_PERIOD_COL.startDate]: form.startDate,
        [LEASE_PERIOD_COL.years]: form.durationYears,
        [LEASE_PERIOD_COL.months]: form.durationMonths,
        [LEASE_PERIOD_COL.fixedCosts]:
          form.fixedCosts === "" ? null : Number(form.fixedCosts),
        [LEASE_PERIOD_COL.percentOfRevenues]:
          form.percentOfRevenues === "" ? null : Number(form.percentOfRevenues),
        [LEASE_PERIOD_COL.eurMwh]: form.eurPerMwh === "" ? null : Number(form.eurPerMwh),
        [LEASE_PERIOD_COL.eurMw]: form.eurPerMw === "" ? null : Number(form.eurPerMw),
        [LEASE_PERIOD_COL.eurWtg]: form.eurPerWtg === "" ? null : Number(form.eurPerWtg),
        [LEASE_PERIOD_COL.aggregation]: form.aggregation,
        [LEASE_PERIOD_COL.frequency]: form.distributionFrequency,
      },
    });

    batch.mutate(writes, {
      onSuccess: () => {
        setPanel(null);
        setForm(emptyForm());
        // Rule 20 — the selection is cleared after every save.
        setSelectedPeriodId(null);
      },
      onError: () => setError(LEASE_MSG.saveFailed),
    });
  };

  const loadStandard = (subaccountId: string) => {
    if (assumptions.length === 0 || !codDate) {
      setNotice(LEASE_MSG.noStandardAssumption);
      return;
    }
    const starts = standardPeriodStarts(codDate, assumptions);
    const profile = resolveInflationProfile(assumptions[0], countryInflation);
    const wtgs = planStandardAllocation(assumptions[0].allWtgAllocated, generators);
    setNotice(
      `${starts.length} standard period(s) from ${formatDate(starts[0].startDate)}`
      + `${profile === null ? "" : `, inflation ${profile}%`}`
      + `${wtgs.length === 0 ? "" : `, ${wtgs.length} turbine allocation(s)`}`
      + `, first fixed cost ${roundTwoDecimals(assumptions[0].fixCosts) ?? 0}.`,
    );
    void subaccountId;
  };

  const columns: Column<LandLeasePeriod>[] = [
    { key: "name", header: "Period", width: "minmax(160px, 2fr)",
      render: (r) => (
        <span>
          {r.name}
          <Badge appearance="tint" size="small">{`P${periodNumber(r.period)}`}</Badge>
        </span>
      ) },
    { key: "start", header: "Start", width: "120px", value: (r) => formatDate(r.startDate) },
    { key: "duration", header: "Duration", width: "110px",
      value: (r) => `${r.durationYears ?? 0}y ${r.durationMonths ?? 0}m` },
    { key: "fixed", header: "Fixed costs", width: "120px", numeric: true,
      value: (r) => r.fixedCosts ?? "" },
    { key: "pct", header: "% of Revenues", width: "130px", numeric: true, hideBelow: "md",
      value: (r) => r.percentOfRevenues ?? "" },
    { key: "mwh", header: "EUR/MWh", width: "110px", numeric: true, hideBelow: "lg",
      value: (r) => r.eurPerMwh ?? "" },
    { key: "mw", header: "EUR/MW", width: "110px", numeric: true, hideBelow: "lg",
      value: (r) => r.eurPerMw ?? "" },
    { key: "wtg", header: "EUR/WTG", width: "110px", numeric: true, hideBelow: "xl",
      value: (r) => r.eurPerWtg ?? "" },
  ];

  const panelErrors = [
    validateLeaseNumber("fixedCosts", form.fixedCosts),
    validateLeaseNumber("percentOfRevenues", form.percentOfRevenues),
    validateLeaseNumber("eurPerMwh", form.eurPerMwh),
    validateLeaseNumber("eurPerMw", form.eurPerMw),
    validateLeaseNumber("eurPerWtg", form.eurPerWtg),
    validateDueDate(form.payments.dueDate),
    validateDueDate(form.payments.dueDate2),
    validateDueDate(form.payments.dueDate3),
  ].filter((x): x is string => x !== null);

  return (
    <div className={s.page}>
      <PageHeader
        eyebrow="Project Costs"
        title="Land Lease"
        description={
          "Land lease contracts by sub-account. The contract header lives on Period 1; later "
          + "periods carry only their own economics."
        }
      />

      {error && <MessageBar intent="error"><MessageBarBody>{error}</MessageBarBody></MessageBar>}
      {notice && (
        <MessageBar intent="info"><MessageBarBody>{notice}</MessageBarBody></MessageBar>
      )}

      {subaccounts.length === 0 ? (
        <EmptyState
          title="No land lease sub-accounts"
          description="No sub-accounts are configured for land lease costs."
        />
      ) : (
        <Accordion collapsible multiple>
          {subaccounts.map((subaccount) => {
            const cardContracts = contractsForSubaccount(contracts, subaccount.id);
            const inScope = selectedSubaccountId === subaccount.id;
            const gates = leaseCommands({
              contract: inScope ? selectedContract : null,
              selectedPeriod: inScope ? selectedPeriod : null,
              costsInSubaccount: cardContracts.map((c) => c.cost),
              hasMatchingAssumption: assumptions.length > 0,
              permissions,
              inScope,
              nothingSelected: !inScope || selectedPeriodId === null,
            });
            const commands: Command[] = [
              {
                key: "addContract", label: "Add Contract Type", icon: <AddRegular />,
                primary: true,
                disabled: !gates.addContractType || batch.isPending,
                onClick: () => {
                  setSelectedSubaccountId(subaccount.id);
                  openNewContract(subaccount.id);
                },
              },
              {
                key: "addPeriod", label: "Add Period", icon: <AddRegular />,
                disabled: !gates.addPeriod || batch.isPending,
                disabledReason:
                  "Only the last period can be extended, Period 1 must carry a rate, and "
                  + "Period 9 is the last period a contract can have.",
                onClick: () => openNewPeriod(subaccount.id),
              },
              {
                key: "standard", label: "Add Standard Contract", icon: <StarRegular />,
                disabled: !gates.addStandardContract || batch.isPending,
                onClick: () => loadStandard(subaccount.id),
              },
              {
                key: "edit", label: "Edit", icon: <EditRegular />,
                disabled: !gates.edit || batch.isPending,
                onClick: () =>
                  selectedContract && selectedPeriod && openEdit(selectedContract, selectedPeriod),
              },
              {
                key: "delete", label: "Delete", icon: <DeleteRegular />, danger: true,
                disabled: !gates.delete || batch.isPending,
                onClick: () => selectedContract && selectedPeriod
                  && setConfirm({ contract: selectedContract, period: selectedPeriod }),
              },
            ];

            return (
              <AccordionItem key={subaccount.id} value={subaccount.id}>
                <AccordionHeader onClick={() => setSelectedSubaccountId(subaccount.id)}>
                  <span className={s.cardHead}>
                    <strong>{subaccount.name}</strong>
                    <Badge appearance="tint" size="small">
                      {`${cardContracts.length} contract(s)`}
                    </Badge>
                  </span>
                </AccordionHeader>
                <AccordionPanel>
                  <div className={s.body}>
                    <CommandBar commands={commands} />
                    {cardContracts.length === 0 ? (
                      <EmptyState
                        title="No contracts yet"
                        description="Add a contract type to start recording land lease costs."
                      />
                    ) : cardContracts.map((contract) => (
                      <div key={contract.cost.id} className={s.section}>
                        <Text weight="semibold">
                          {contract.cost.description}
                          {isStandardLocked(contract, null) && (
                            <Badge appearance="tint" size="small">standard</Badge>
                          )}
                        </Text>
                        <DataGrid
                          rows={contract.periods}
                          columns={columns}
                          rowKey={(r) => r.id}
                          emptyMessage="This contract has no periods."
                          selectedKey={inScope ? selectedPeriodId : null}
                          onRowClick={(r) => {
                            setSelectedSubaccountId(subaccount.id);
                            setSelectedPeriodId(r.id);
                          }}
                          height={Math.min(280, 56 + contract.periods.length * 44) || 140}
                        />
                      </div>
                    ))}
                  </div>
                </AccordionPanel>
              </AccordionItem>
            );
          })}
        </Accordion>
      )}

      <FormPanel
        open={panel !== null}
        title={panel?.mode === "newContract" ? "New land lease contract"
          : panel?.mode === "newPeriod" ? "New period" : "Edit period"}
        onClose={() => { setPanel(null); setError(null); }}
        onSave={submit}
        saveDisabled={!canSaveLandLease(form) || batch.isPending}
        busy={batch.isPending}
        errors={panelErrors}
      >
        <div className={s.panelBody}>
          <Text weight="semibold">Contract</Text>
          {!contractSectionEnabled && (
            <span className={s.disabledNote}>
              {"The contract header belongs to Period 1. Editing a later period cannot change "
                + "it — select Period 1 to edit these fields."}
            </span>
          )}

          <Field label="Description" required>
            <Input
              value={form.description}
              disabled={!contractSectionEnabled}
              onChange={(_, d) => patch({ description: d.value })}
            />
          </Field>

          <Switch
            label="Secured" checked={form.securedChecked}
            disabled={!contractSectionEnabled}
            onChange={(_, d) => patch({ securedChecked: d.checked })}
          />

          <Switch
            label="One-time payments" checked={form.oneTimePaymentsOn}
            disabled={!contractSectionEnabled}
            onChange={(_, d) => patch({ oneTimePaymentsOn: d.checked })}
          />
          {form.oneTimePaymentsOn && (
            <>
              <div className={s.duo}>
                <Field label="Due date 1 (MM/YYYY)">
                  <Input
                    value={form.payments.dueDate} placeholder="04/2027"
                    disabled={!contractSectionEnabled}
                    onChange={(_, d) =>
                      patch({ payments: { ...form.payments, dueDate: d.value } })}
                  />
                </Field>
                <NumericInput
                  label="Amount 1" places={2} min={0} max={1_000_000_000}
                  disabled={!contractSectionEnabled}
                  value={form.payments.amount}
                  onChange={(v) => patch({ payments: { ...form.payments, amount: v } })}
                />
              </div>
              {showSecondPayment(selectedContract?.cost ?? null) && (
                <div className={s.duo}>
                  <Field label="Due date 2 (MM/YYYY)">
                    <Input
                      value={form.payments.dueDate2}
                      disabled={!contractSectionEnabled}
                      onChange={(_, d) =>
                        patch({ payments: { ...form.payments, dueDate2: d.value } })}
                    />
                  </Field>
                  <NumericInput
                    label="Amount 2" places={2} min={0} max={1_000_000_000}
                    disabled={!contractSectionEnabled}
                    value={form.payments.amount2}
                    onChange={(v) => patch({ payments: { ...form.payments, amount2: v } })}
                  />
                </div>
              )}
              {showThirdPayment(selectedContract?.cost ?? null) && (
                <div className={s.duo}>
                  <Field label="Due date 3 (MM/YYYY)">
                    <Input
                      value={form.payments.dueDate3}
                      disabled={!contractSectionEnabled}
                      onChange={(_, d) =>
                        patch({ payments: { ...form.payments, dueDate3: d.value } })}
                    />
                  </Field>
                  <NumericInput
                    label="Amount 3" places={2} min={0} max={1_000_000_000}
                    disabled={!contractSectionEnabled}
                    value={form.payments.amount3}
                    onChange={(v) => patch({ payments: { ...form.payments, amount3: v } })}
                  />
                </div>
              )}
            </>
          )}

          {/* Rule 12 — the allocation block only exists for Wind or PV projects. */}
          {allocationVisible(technology) && (
            <>
              <Switch
                label="Allocate to all WTGs"
                checked={allWtgSelected(form.allocatedGeneratorIds, generators.map((g) => g.id))}
                disabled={!allocationEditable(selectedPeriod, isNewContract)}
                onChange={(_, d) => patch({
                  allocatedGeneratorIds: d.checked ? generators.map((g) => g.id) : [],
                })}
              />
              <Field label="Allocated turbines">
                <Dropdown
                  multiselect
                  disabled={!allocationEditable(selectedPeriod, isNewContract)}
                  selectedOptions={form.allocatedGeneratorIds}
                  value={`${form.allocatedGeneratorIds.length} of ${generators.length}`}
                  onOptionSelect={(_, d) =>
                    patch({ allocatedGeneratorIds: d.selectedOptions })}
                >
                  {generators.map((g) => (
                    <Option key={g.id} value={g.id}>{g.label}</Option>
                  ))}
                </Dropdown>
              </Field>
            </>
          )}

          <Divider />
          <Text weight="semibold">Period</Text>

          <Field label="Start date" required>
            <Input
              type="date" value={form.startDate ?? ""}
              onChange={(_, d) => patch({ startDate: d.value || null })}
            />
          </Field>

          <div className={s.duo}>
            <NumericInput
              label="Duration (years)" places={0} min={0} max={99}
              value={form.durationYears === null ? "" : String(form.durationYears)}
              onChange={(v) => patch({ durationYears: v === "" ? null : Number(v) })}
            />
            <NumericInput
              label="Duration (months)" places={0} min={0} max={11}
              value={form.durationMonths === null ? "" : String(form.durationMonths)}
              onChange={(v) => patch({ durationMonths: v === "" ? null : Number(v) })}
            />
          </div>

          <div className={s.duo}>
            <NumericInput
              label="Fixed costs" places={2} min={0} max={1_000_000_000}
              value={form.fixedCosts} onChange={(v) => patch({ fixedCosts: v })}
            />
            <PercentageInput
              label="% of Revenues" min={0} max={10_000}
              value={form.percentOfRevenues}
              onChange={(v) => patch({ percentOfRevenues: v })}
            />
            <NumericInput
              label="EUR/MWh" places={2} min={0} max={1_000_000_000}
              value={form.eurPerMwh} onChange={(v) => patch({ eurPerMwh: v })}
            />
            <NumericInput
              label="EUR/MW" places={2} min={0} max={1_000_000_000}
              value={form.eurPerMw} onChange={(v) => patch({ eurPerMw: v })}
            />
            <NumericInput
              label="EUR/WTG" places={2} min={0} max={1_000_000_000}
              value={form.eurPerWtg} onChange={(v) => patch({ eurPerWtg: v })}
            />
          </div>

          <Field label="Aggregation">
            <Dropdown
              selectedOptions={form.aggregation === null ? [] : [String(form.aggregation)]}
              value={form.aggregation === CHOICE_COST.aggregation.sum ? "SUM"
                : form.aggregation === CHOICE_COST.aggregation.max ? "MAX"
                  : form.aggregation === CHOICE_COST.aggregation.min ? "MIN" : ""}
              onOptionSelect={(_, d) => patch({ aggregation: Number(d.optionValue) })}
            >
              <Option value={String(CHOICE_COST.aggregation.sum)}>SUM</Option>
              <Option value={String(CHOICE_COST.aggregation.max)}>MAX</Option>
              <Option value={String(CHOICE_COST.aggregation.min)}>MIN</Option>
            </Dropdown>
          </Field>

          <Field label="Distribution frequency">
            <Dropdown
              selectedOptions={form.distributionFrequency === null
                ? [] : [String(form.distributionFrequency)]}
              value={DISTRIBUTION_FREQUENCY
                .find((x) => x.value === form.distributionFrequency)?.label ?? ""}
              onOptionSelect={(_, d) => patch({ distributionFrequency: Number(d.optionValue) })}
            >
              {DISTRIBUTION_FREQUENCY.map((x) => (
                <Option key={x.id} value={String(x.value)}>{x.label}</Option>
              ))}
            </Dropdown>
          </Field>

          <span className={s.note}>
            {"A contract can hold at most nine periods. The canvas app wrapped a tenth back "
              + "to Period 1; here \"Add Period\" is simply disabled."}
          </span>
        </div>
      </FormPanel>

      <ConfirmDialog
        open={confirm !== null}
        intent="danger"
        title={deleteDialog(confirm?.period ?? null).title}
        confirmLabel="Delete"
        busy={batch.isPending}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          if (!confirm) return;
          const plan = planDelete(confirm.contract, confirm.period, allocations);
          batch.mutate(
            [
              ...plan.allocationIds.map((id) => ({
                op: "delete" as const, entitySet: LEASE_ENTITY.allocation, id,
              })),
              ...plan.periodIds.map((id) => ({
                op: "delete" as const, entitySet: LEASE_ENTITY.period, id,
              })),
              ...plan.costIds.map((id) => ({
                op: "delete" as const, entitySet: LEASE_ENTITY.cost, id,
              })),
            ],
            { onSuccess: () => { setConfirm(null); setSelectedPeriodId(null); } },
          );
        }}
      >
        {deleteDialog(confirm?.period ?? null).body}
      </ConfirmDialog>
    </div>
  );
}
