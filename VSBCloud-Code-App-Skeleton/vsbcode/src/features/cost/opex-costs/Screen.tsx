/**
 * Opex Costs Screen — layout and composition only. ONE screen, TWO rail items.
 *
 * Canvas screen: `Opex Costs Screen` (Project Costs app)
 *   230 controls · 8 147 lines of Power Fx · 65 substantive blocks · band L
 *
 * The route table passes the mode:
 *   `/costs/opex/om`    → `<OpexCostsScreen mode="om" />`     (rail item `O&MKey`)
 *   `/costs/opex/other` → `<OpexCostsScreen mode="other" />`  (rail item `OtherOpexCostsKey`)
 *
 * In the canvas both rail rows target this same screen and the mode is re-derived from
 * `gblLeftNavigationSelected.ItemDisplayName` on every `Navigate`. Here it is a prop, so
 * switching modes re-renders instead of reloading (source ambiguity 2) — every other
 * difference between the modes is preserved: the card source, the command set, the standard
 * assumption `Contract Type`, the uniqueness scope, the saved `Name` / `DeviceTypeInProject`
 * and the two conditionally-collapsed columns.
 *
 * PROJECT-SCOPED — `useProjectContext()`.
 */
import { useMemo, useState } from "react";
import {
  Accordion, AccordionItem, AccordionHeader, AccordionPanel, Badge, Field, Input,
  Dropdown, Option, Switch, MessageBar, MessageBarBody, Text, makeStyles, tokens,
} from "@fluentui/react-components";
import { AddRegular, EditRegular, DeleteRegular, StarRegular } from "@fluentui/react-icons";
import {
  PageHeader, DataGrid, CommandBar, FormPanel, ConfirmDialog, LoadingOverlay,
  EmptyState, NumericInput, PercentageInput, type Command, type Column,
} from "@/components";
import { useProjectContext } from "@/features/shared/useProjectContext";
import { formatDate } from "@/domain/dates";
import { CHOICE_COST } from "@/data/entities";
import { space, media } from "@/theme/tokens";
import {
  MODE_DISPLAY_NAME, O_AND_M_EMPTY_STATE, OPEX_MSG, OPEX_DISTRIBUTION_FREQUENCY,
  selectedAccount, subaccountsForMode, showThresholdColumns, groupChains, chainOf,
  lastPeriod, nextStartDate, opexCommands, planDeleteCost, deleteDialogText, durationBadge,
  canSaveOpexCost, validateOpexNumber, startDateError, costName, deviceTypeForSave,
  costsForDevice, costsForSubaccount, isStandardLocked, standardAssumptionFilter,
  matchesStandardAssumption, standardPeriodStarts, resolveInflationProfile,
  inflationStartYear, TIME_ZONE_RULE_VERSION_NUMBER,
  type OpexMode, type OpexCost, type OpexForm,
} from "./rules";
import {
  useOpexAccounts, useOpexSubaccounts, useOpexCosts, useDeviceTypes, useOpexAssumptions,
  useCountryInflation, useOpexBatch, OPEX_COST_COL, OPEX_ENTITY,
} from "./hooks";

const useStyles = makeStyles({
  page: { display: "flex", flexDirection: "column", gap: space.l, minWidth: 0 },
  cardHead: { display: "flex", alignItems: "center", gap: space.s, flexWrap: "wrap" },
  body: { display: "flex", flexDirection: "column", gap: space.m,
    [media.belowMd]: { gap: space.s } },
  panelBody: { display: "flex", flexDirection: "column", gap: space.m },
  duo: {
    display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: space.s,
    [media.belowMd]: { gridTemplateColumns: "1fr" },
  },
  note: { color: tokens.colorNeutralForeground3, fontSize: "12px" },
  standardDate: { color: tokens.colorBrandForeground1, fontStyle: "italic" },
});

const emptyForm = (): OpexForm => ({
  description: "", startDate: null, durationYears: null, durationMonths: null,
  currencyId: null, aggregation: null, distributionFrequency: null,
  fixCosts: "", percentOfRevenues: "", eurPerMwh: "", eurPerMw: "", eurPerWtg: "",
  thresholdOn: false, thresholdType: null, thresholdIndividual: "",
  inflationOn: false, useCountryInflationProfile: false, inflationStartYear: "",
  inflationProfile: "", inflationCountryArea: null, isNew: true,
});

export default function OpexCostsScreen({ mode }: { mode: "om" | "other" }) {
  const s = useStyles();
  const opexMode = mode as OpexMode;
  const { project, record, canEdit, isLoading: projectLoading } = useProjectContext();
  const projectId = project?.projectId;

  const { accounts, isLoading: accountsLoading } = useOpexAccounts();
  const { subaccounts } = useOpexSubaccounts();
  const { costs, isLoading: costsLoading } = useOpexCosts(projectId);
  const { devices, isLoading: devicesLoading } = useDeviceTypes(projectId, opexMode);
  const countryId = record?._vsb_country_value ?? null;
  const codDate = (record?.vsb_operationsstartdatecod as string | null) ?? null;
  const { assumptions } = useOpexAssumptions(opexMode, countryId);
  const inflationYear = inflationStartYear(codDate);
  const countryInflation = useCountryInflation(countryId, inflationYear);
  const batch = useOpexBatch(projectId, "opexCosts/save");

  const [selectedScopeId, setSelectedScopeId] = useState<string | null>(null);
  const [selectedCostId, setSelectedCostId] = useState<string | null>(null);
  const [panel, setPanel] = useState<{ kind: "type" | "period"; scopeId: string } | null>(null);
  const [form, setForm] = useState<OpexForm>(emptyForm());
  const [confirm, setConfirm] = useState<OpexCost | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const account = useMemo(
    () => selectedAccount(accounts, opexMode),
    [accounts, opexMode],
  );
  const cards = useMemo(() => {
    if (opexMode === "om") {
      return devices.map((d) => ({ id: d.id, title: d.name }));
    }
    return subaccountsForMode(subaccounts, opexMode).map((x) => ({ id: x.id, title: x.name }));
  }, [opexMode, devices, subaccounts]);

  const chains = useMemo(() => groupChains(costs), [costs]);
  const selectedCost = costs.find((c) => c.id === selectedCostId) ?? null;
  const selectedChain = selectedCostId ? chainOf(chains, selectedCostId) : null;

  const permissions = {
    canCreate: canEdit,
    canEditRecord: canEdit,
    canDeleteRecord: canEdit,
  };

  const project0 = {
    countryName:
      (record?.["_vsb_country_value@OData.Community.Display.V1.FormattedValue"] as string) ?? null,
  };

  if (!projectId) {
    return (
      <EmptyState
        title="No project selected"
        description="Open this screen from a project. The canvas app fell back to a hard-coded test project here; that is not ported."
      />
    );
  }
  if (projectLoading || accountsLoading || costsLoading || (opexMode === "om" && devicesLoading)) {
    return <LoadingOverlay mode="inline" label="Loading OPEX costs…" />;
  }

  const scopedCosts = (scopeId: string) =>
    opexMode === "om" ? costsForDevice(costs, scopeId) : costsForSubaccount(costs, scopeId);

  const patch = (p: Partial<OpexForm>) => setForm((prev) => ({ ...prev, ...p }));

  const openAdd = (scopeId: string, kind: "type" | "period") => {
    const scoped = scopedCosts(scopeId);
    const chain = selectedCostId ? chainOf(groupChains(scoped), selectedCostId) : null;
    const previous = kind === "period" && chain ? lastPeriod(chain) : null;
    const start = nextStartDate(previous, codDate);
    setForm({
      ...emptyForm(),
      description: kind === "period" ? (previous?.description ?? "") : "",
      startDate: start ? start.toISOString().slice(0, 10) : null,
      isNew: true,
    });
    setPanel({ kind, scopeId });
  };

  const openEdit = (cost: OpexCost, scopeId: string) => {
    setForm({
      description: cost.description,
      startDate: cost.startDate,
      durationYears: cost.durationYears,
      durationMonths: cost.durationMonths,
      currencyId: cost.currencyId,
      aggregation: cost.aggregation,
      distributionFrequency: cost.distributionFrequency,
      fixCosts: cost.fixCosts === null ? "" : String(cost.fixCosts),
      percentOfRevenues: cost.percentOfRevenues === null ? "" : String(cost.percentOfRevenues),
      eurPerMwh: cost.eurPerMwh === null ? "" : String(cost.eurPerMwh),
      eurPerMw: cost.eurPerMw === null ? "" : String(cost.eurPerMw),
      eurPerWtg: cost.eurPerWtg === null ? "" : String(cost.eurPerWtg),
      thresholdOn: cost.threshold,
      thresholdType: cost.thresholdType,
      thresholdIndividual:
        cost.thresholdIndividual === null ? "" : String(cost.thresholdIndividual),
      inflationOn: cost.useInflationProfile,
      useCountryInflationProfile: cost.useCountryInflationProfile,
      inflationStartYear:
        cost.inflationStartYear === null ? "" : String(cost.inflationStartYear),
      inflationProfile: cost.inflationProfile === null ? "" : String(cost.inflationProfile),
      inflationCountryArea: cost.inflationCountryArea,
      isNew: false,
    });
    setPanel({ kind: "period", scopeId });
  };

  const submit = () => {
    if (!panel) return;
    setError(null);
    const scoped = scopedCosts(panel.scopeId);
    const subaccount = opexMode === "om"
      ? subaccounts.find((x) => x.name === MODE_DISPLAY_NAME.om) ?? null
      : subaccounts.find((x) => x.id === panel.scopeId) ?? null;
    const device = devices.find((d) => d.id === panel.scopeId) ?? null;

    const data: Record<string, unknown> = {
      [OPEX_COST_COL.name]: costName(opexMode, {
        accountName: account?.name ?? "",
        subaccountName: subaccount?.name ?? "",
        deviceName: device?.name ?? null,
      }, form.description),
      // Rule 18 — Description is trimmed on save; Name is built from the raw value.
      [OPEX_COST_COL.description]: form.description.trim(),
      [OPEX_COST_COL.startDate]: form.startDate,
      [OPEX_COST_COL.years]: form.durationYears,
      [OPEX_COST_COL.months]: form.durationMonths,
      [OPEX_COST_COL.fixCosts]: form.fixCosts === "" ? null : Number(form.fixCosts),
      [OPEX_COST_COL.percentOfRevenues]:
        form.percentOfRevenues === "" ? null : Number(form.percentOfRevenues),
      [OPEX_COST_COL.eurMwh]: form.eurPerMwh === "" ? null : Number(form.eurPerMwh),
      [OPEX_COST_COL.eurMw]: form.eurPerMw === "" ? null : Number(form.eurPerMw),
      [OPEX_COST_COL.eurWtg]: form.eurPerWtg === "" ? null : Number(form.eurPerWtg),
      [OPEX_COST_COL.aggregation]: form.aggregation,
      [OPEX_COST_COL.frequency]: form.distributionFrequency,
      [OPEX_COST_COL.threshold]: form.thresholdOn,
      [OPEX_COST_COL.thresholdType]: form.thresholdOn ? form.thresholdType : null,
      [OPEX_COST_COL.useInflation]: form.inflationOn,
      [OPEX_COST_COL.useCountryInflation]: form.useCountryInflationProfile,
      // Rule 14 — written literally on every patch; see the constant's note.
      timezoneruleversionnumber: TIME_ZONE_RULE_VERSION_NUMBER,
      // Rule: DeviceTypeInProject is the device in O&M mode, blank in Other mode.
      [`${OPEX_COST_COL.device}@odata.bind`]:
        deviceTypeForSave(opexMode, device?.id ?? null) === null
          ? null
          : `/${"vsb_devicetypesinprojects"}(${device!.id})`,
      [`${OPEX_COST_COL.project}@odata.bind`]: `/vsb_projects(${projectId})`,
    };

    const isEdit = !form.isNew && selectedCost !== null;
    // Rule 12 — the child cascade rides in the SAME batch as the cost upsert.
    const children = isEdit && selectedChain
      ? selectedChain.periods.filter((p) => p.parentCostId === selectedCost!.id)
      : [];
    const cascade = children.map((c) => ({
      op: "update" as const,
      entitySet: OPEX_ENTITY.cost,
      id: c.id,
      data: {
        [OPEX_COST_COL.useInflation]: form.inflationOn,
        [OPEX_COST_COL.useCountryInflation]: form.useCountryInflationProfile,
        [OPEX_COST_COL.threshold]: form.thresholdOn,
        [OPEX_COST_COL.thresholdType]: form.thresholdOn ? form.thresholdType : null,
      },
    }));

    batch.mutate(
      [
        {
          op: isEdit ? "update" : "create",
          entitySet: OPEX_ENTITY.cost,
          id: isEdit ? selectedCost!.id : undefined,
          data,
        },
        ...cascade,
      ],
      {
        onSuccess: () => { setPanel(null); setForm(emptyForm()); },
        // The panel keeps the user's values on failure (UT-OPEX-045).
        onError: () => setError(OPEX_MSG.saveFailed),
      },
    );
    void scoped;
  };

  const loadStandard = (scopeId: string) => {
    const subaccount = subaccounts.find((x) => x.id === scopeId) ?? null;
    const filter = standardAssumptionFilter(opexMode, {
      countryId,
      technology:
        (record?.["vsb_technology@OData.Community.Display.V1.FormattedValue"] as string) ?? null,
      subaccountId: subaccount?.id ?? null,
    });
    const matched = assumptions.filter((a) => matchesStandardAssumption(a, filter));
    if (matched.length === 0 || !codDate) {
      setNotice("No standard assumption matches this project's country and technology.");
      return;
    }
    const starts = standardPeriodStarts(codDate, matched);
    const profile = resolveInflationProfile(matched[0], countryInflation);
    setNotice(
      `${matched.length} standard period(s) will be created from `
      + `${formatDate(starts[0].startDate)}`
      + (profile === null ? "." : ` with an inflation profile of ${profile}%.`),
    );
  };

  const columns: Column<OpexCost>[] = [
    { key: "description", header: "Description", width: "minmax(180px, 2fr)",
      render: (r) => (
        <span>
          {r.description}
          {isStandardLocked(r) && <Badge appearance="tint" size="small">standard</Badge>}
        </span>
      ) },
    { key: "start", header: "Start", width: "120px",
      render: (r) => (
        <span className={r.isStartDateStandardAssumption ? s.standardDate : undefined}>
          {formatDate(r.startDate)}
        </span>
      ) },
    { key: "duration", header: "Duration", width: "120px",
      value: (r) => `${r.durationYears ?? 0}y ${r.durationMonths ?? 0}m` },
    { key: "fix", header: "Fix costs", width: "120px", numeric: true,
      value: (r) => r.fixCosts ?? "" },
    // Rule 2 — these two columns exist only in O&M mode.
    ...(showThresholdColumns(opexMode) ? [
      { key: "pct", header: "% of Revenues", width: "130px", numeric: true,
        hideBelow: "md" as const, value: (r: OpexCost) => r.percentOfRevenues ?? "" },
      { key: "threshold", header: "Threshold", width: "110px", hideBelow: "md" as const,
        value: (r: OpexCost) => (r.threshold ? "Yes" : "No") },
    ] : []),
    { key: "mwh", header: "EUR/MWh", width: "110px", numeric: true, hideBelow: "lg",
      value: (r) => r.eurPerMwh ?? "" },
    { key: "mw", header: "EUR/MW", width: "110px", numeric: true, hideBelow: "lg",
      value: (r) => r.eurPerMw ?? "" },
    { key: "wtg", header: "EUR/WTG", width: "110px", numeric: true, hideBelow: "xl",
      value: (r) => r.eurPerWtg ?? "" },
  ];

  const numericErrors = [
    validateOpexNumber("fixCosts", form.fixCosts),
    validateOpexNumber("percentOfRevenues", form.percentOfRevenues),
    validateOpexNumber("eurPerMwh", form.eurPerMwh),
    validateOpexNumber("eurPerMw", form.eurPerMw),
    validateOpexNumber("eurPerWtg", form.eurPerWtg),
    validateOpexNumber("thresholdIndividual", form.thresholdIndividual),
    startDateError(form.startDate),
  ].filter((x): x is string => x !== null);

  const existingDescriptions = panel
    ? scopedCosts(panel.scopeId).map((c) => c.description)
    : [];

  return (
    <div className={s.page}>
      <PageHeader
        eyebrow="Project Costs"
        title={opexMode === "om" ? "Operation & Maintenance" : "Other OPEX Costs"}
        description={
          opexMode === "om"
            ? "Recurring O&M costs per device type in the project, as chained periods."
            : "Recurring costs under the Other OPEX Costs sub-accounts, as chained periods."
        }
      />

      {error && <MessageBar intent="error"><MessageBarBody>{error}</MessageBarBody></MessageBar>}
      {notice && (
        <MessageBar intent="info"><MessageBarBody>{notice}</MessageBarBody></MessageBar>
      )}

      {cards.length === 0 ? (
        <EmptyState
          title={opexMode === "om" ? "No device types yet" : "No sub-accounts"}
          description={opexMode === "om"
            ? O_AND_M_EMPTY_STATE
            : "No sub-accounts are configured under Other OPEX Costs."}
        />
      ) : (
        <Accordion collapsible multiple>
          {cards.map((card) => {
            const rows = scopedCosts(card.id);
            const badge = durationBadge(rows, {
              projectStartDate: record?.vsb_projectstartdate ?? null,
              endDate: (record?.vsb_enddate as string | null) ?? null,
            });
            const inScope = selectedScopeId === card.id;
            const gates = opexCommands({
              mode: opexMode,
              chain: selectedCostId ? chainOf(groupChains(rows), selectedCostId) : null,
              selected: inScope ? selectedCost : null,
              costsInScope: rows,
              permissions,
              inScope,
            });
            const commands: Command[] = [
              {
                key: "addType", label: "Add Contract Type", icon: <AddRegular />,
                primary: true,
                visible: opexMode === "other",
                disabled: !gates.addContractType || batch.isPending,
                onClick: () => { setSelectedScopeId(card.id); openAdd(card.id, "type"); },
              },
              {
                key: "addPeriod", label: "Add Period", icon: <AddRegular />,
                primary: opexMode === "om",
                disabled: !gates.addPeriod || batch.isPending,
                disabledReason: "Only the last period of a cost type can be extended.",
                onClick: () => openAdd(card.id, "period"),
              },
              {
                key: "standard", label: "Add Standard Contract", icon: <StarRegular />,
                disabled: !gates.addStandardContract || batch.isPending,
                disabledReason:
                  "A standard contract can only be loaded while the scope has no costs.",
                onClick: () => loadStandard(card.id),
              },
              {
                key: "edit", label: "Edit", icon: <EditRegular />,
                disabled: !gates.edit || batch.isPending,
                onClick: () => selectedCost && openEdit(selectedCost, card.id),
              },
              {
                key: "delete", label: "Delete", icon: <DeleteRegular />, danger: true,
                disabled: !gates.delete || batch.isPending,
                onClick: () => selectedCost && setConfirm(selectedCost),
              },
            ];

            return (
              <AccordionItem key={card.id} value={card.id}>
                <AccordionHeader onClick={() => setSelectedScopeId(card.id)}>
                  <span className={s.cardHead}>
                    <strong>{card.title}</strong>
                    <Badge appearance="tint" size="small">{`${rows.length} row(s)`}</Badge>
                    {badge === "match" && (
                      <Badge appearance="tint" color="success" size="small">Duration match</Badge>
                    )}
                    {badge === "mismatch" && (
                      <Badge appearance="tint" color="warning" size="small">
                        Duration mismatch
                      </Badge>
                    )}
                  </span>
                </AccordionHeader>
                <AccordionPanel>
                  <div className={s.body}>
                    <CommandBar commands={commands} />
                    <DataGrid
                      rows={rows}
                      columns={columns}
                      rowKey={(r) => r.id}
                      emptyMessage="No costs on this card yet."
                      selectedKey={inScope ? selectedCostId : null}
                      onRowClick={(r) => { setSelectedScopeId(card.id); setSelectedCostId(r.id); }}
                      height={Math.min(320, 56 + rows.length * 44) || 140}
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
        title={panel?.kind === "type" ? "New cost type" : form.isNew ? "New period" : "Edit period"}
        onClose={() => { setPanel(null); setError(null); }}
        onSave={submit}
        saveDisabled={
          !canSaveOpexCost(form, project0, existingDescriptions) || batch.isPending
        }
        busy={batch.isPending}
        errors={numericErrors}
      >
        <div className={s.panelBody}>
          <Field label="Description" required>
            <Input
              value={form.description}
              onChange={(_, d) => patch({ description: d.value })}
            />
          </Field>

          <Field label="Start date" required>
            <Input
              type="date"
              value={form.startDate ?? ""}
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
              label="Fix costs" places={2} min={0} max={1_000_000_000}
              value={form.fixCosts} onChange={(v) => patch({ fixCosts: v })}
            />
            {showThresholdColumns(opexMode) && (
              <PercentageInput
                label="% of Revenues" min={0} max={10_000}
                value={form.percentOfRevenues}
                onChange={(v) => patch({ percentOfRevenues: v })}
              />
            )}
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

          <Field label="Aggregation" required>
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

          <Field label="Distribution frequency" required>
            <Dropdown
              selectedOptions={form.distributionFrequency === null
                ? [] : [String(form.distributionFrequency)]}
              value={OPEX_DISTRIBUTION_FREQUENCY
                .find((x) => x.value === form.distributionFrequency)?.label ?? ""}
              onOptionSelect={(_, d) => patch({ distributionFrequency: Number(d.optionValue) })}
            >
              {OPEX_DISTRIBUTION_FREQUENCY.map((x) => (
                <Option key={x.id} value={String(x.value)}>{x.label}</Option>
              ))}
            </Dropdown>
          </Field>

          {showThresholdColumns(opexMode) && (
            <>
              <Switch
                label="Threshold" checked={form.thresholdOn}
                onChange={(_, d) => patch({ thresholdOn: d.checked })}
              />
              {form.thresholdOn && (
                <>
                  <Field label="Threshold type" required>
                    <Dropdown
                      selectedOptions={form.thresholdType === null
                        ? [] : [String(form.thresholdType)]}
                      value={form.thresholdType === CHOICE_COST.thresholdType.individual
                        ? "Individual" : form.thresholdType === null ? "" : "Portfolio"}
                      onOptionSelect={(_, d) => patch({ thresholdType: Number(d.optionValue) })}
                    >
                      <Option value={String(CHOICE_COST.thresholdType.netYieldP75)}>
                        Net Yield p75
                      </Option>
                      <Option value={String(CHOICE_COST.thresholdType.netYieldP90)}>
                        Net Yield p90
                      </Option>
                      <Option value={String(CHOICE_COST.thresholdType.individual)}>
                        Individual
                      </Option>
                    </Dropdown>
                  </Field>
                  {form.thresholdType === CHOICE_COST.thresholdType.individual && (
                    <NumericInput
                      label="Threshold value" places={2} min={0} max={10_000_000} required
                      value={form.thresholdIndividual}
                      onChange={(v) => patch({ thresholdIndividual: v })}
                    />
                  )}
                </>
              )}
            </>
          )}

          <Switch
            label="Use inflation profile" checked={form.inflationOn}
            onChange={(_, d) => patch({ inflationOn: d.checked })}
          />
          {form.inflationOn && (
            <>
              <Switch
                label="Use the country inflation profile"
                checked={form.useCountryInflationProfile}
                onChange={(_, d) => patch({ useCountryInflationProfile: d.checked })}
              />
              <div className={s.duo}>
                <NumericInput
                  label="Inflation start year" places={0} min={1900} max={2200} required
                  value={form.inflationStartYear}
                  onChange={(v) => patch({ inflationStartYear: v })}
                />
                <PercentageInput
                  label="Inflation profile" min={0} max={100} required
                  value={form.inflationProfile}
                  onChange={(v) => patch({ inflationProfile: v })}
                />
              </div>
              {project0.countryName === "Italy" && form.useCountryInflationProfile && (
                <Field label="Inflation country area" required>
                  <Dropdown
                    selectedOptions={form.inflationCountryArea === null
                      ? [] : [String(form.inflationCountryArea)]}
                    value={form.inflationCountryArea === null
                      ? "" : String(form.inflationCountryArea)}
                    onOptionSelect={(_, d) =>
                      patch({ inflationCountryArea: Number(d.optionValue) })}
                  >
                    <Option value="952850000">North</Option>
                    <Option value="952850001">Centre</Option>
                    <Option value="952850002">South</Option>
                  </Dropdown>
                </Field>
              )}
            </>
          )}

          <Text className={s.note}>
            {`Saving a cost type also updates the inflation, threshold, alignment and `
              + `external-contract flags on every one of its child periods.`}
          </Text>
        </div>
      </FormPanel>

      <ConfirmDialog
        open={confirm !== null}
        intent="danger"
        title="Delete cost"
        confirmLabel="Delete"
        busy={batch.isPending}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          if (!confirm) return;
          const plan = planDeleteCost(chains, confirm);
          batch.mutate(
            plan.ids.map((id) => ({
              op: "delete" as const, entitySet: OPEX_ENTITY.cost, id,
            })),
            { onSuccess: () => { setConfirm(null); setSelectedCostId(null); } },
          );
        }}
      >
        {/* Corrected predicate: the wording now matches the cascade the confirm performs. */}
        {deleteDialogText(confirm)}
      </ConfirmDialog>
    </div>
  );
}
