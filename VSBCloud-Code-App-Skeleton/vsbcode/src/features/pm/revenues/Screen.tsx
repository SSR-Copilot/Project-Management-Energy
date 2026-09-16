/**
 * Project Revenues Screen — layout and composition only.
 *
 * Canvas screen: `Project Revenues Screen` (PM app)
 *   289 controls · 11 769 lines of Power Fx · 122 substantive blocks · band XL
 *
 * Two tabs, one grid each, one right panel each. Every branch this file takes is a call
 * into `rules.ts`; nothing here decides anything.
 *
 * WHAT WAS DELETED AS A WORKAROUND
 *  - The collapsible card gallery of contracts, whose every field repeated the
 *    `Is … Standard Assumption?` test on its own `FontColor` and `Italic` properties
 *    (rule 26). One `<StandardValue>` cell renderer instead.
 *  - `btn_IndividualHedgeVolumeDuration_Recalculate`, a hidden button used as a
 *    subroutine by four `OnChange` handlers.
 *  - `colRevenuesFormValidationErrors`, a collection of `{Valid, Text}` rows maintained by
 *    per-control handlers; the errors are computed from the form state.
 *  - `locIsVisibleSpinner` / `locIsVisibleSpinnerText`, replaced by `LoadingOverlay`.
 *  - The `Tarrif Price Standard Assumptions` data source, which the canvas references only
 *    inside comment blocks (source ambiguity 6).
 *
 * The screen is entirely locked behind the five-part data-completeness gate; that
 * predicate is `isPageLocked` in `rules.ts` and is shared with Project Finance.
 */
import { useMemo, useState, type CSSProperties } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Field, Input, Switch, Radio, RadioGroup, Tab, TabList, Text, Button, MessageBar,
  MessageBarBody, MessageBarTitle, makeStyles, tokens,
} from "@fluentui/react-components";
import { AddRegular, DeleteRegular, EditRegular, LockClosedRegular } from "@fluentui/react-icons";
import {
  PageHeader, Card, CommandBar, FormPanel, ConfirmDialog, LoadingOverlay, DataGrid,
  NumericInput, PercentageInput, StatTiles, EmptyState, SelectProjectPrompt,
  type Command, type Column,
} from "@/components";
import { useProjectContext } from "@/features/shared/useProjectContext";
import { space, media, semantic } from "@/theme/tokens";
import { formatDate } from "@/domain/dates";
import {
  PAGE_LOCK_TITLE, pageLock, isPageLocked, REVENUE_TABS, parseRevenueTab,
  REVENUE_FORM_LABEL, derivedFieldPlaceholder,
  standardAssumptionExists, descriptionFor, contractStartDate, contractDuration,
  endDateWithGuard, priceForYear, p90Price, correctionFactorDefault, showsGermanFitBlock,
  germanFitTariff, tariffIsStandard, tariffP90IsStandard, inflation, subContractTypeChange,
  negativePriceState, hedgeTypeOptions, generateVolumeRows, volumeRowLabel,
  validateHedgedVolume, nextPeriodValue, balancingPeriodName, firstPeriodStart,
  nextPeriodStart, showsShiftOfCod, balancingMonthOptions, balancingEndDate,
  balancingYearOptions, durationYearOptions, durationMonthOptions,
  validateTariff, validateBiddingPrice, validateCorrectionFactor, validateVolumeMwh,
  validateHedgedVolumePercent, validateInflationProfile, validateInflationStartYear,
  validateDescription, validateBalancingPrice, validateShiftOfCod,
  canSaveRevenueContract, needsIndividualVolumesConfirmation, buildRevenuePayload,
  contractCommandBar, balancingCommandBar, isNewestPeriod, rehydrateForEdit,
  revenueLabelText, hedgeTypeFromValue, durationCellIsStandard, fmtPrice, fmtMwh,
  field, HEDGE_TYPE_LABEL, MSG,
  type RevenueTab, type HedgeType, type HedgeState, type StandardFlags,
  type RevenueFormState, type StoredRevenueContract, type BalancingPeriod,
  type IndividualVolumeRow,
} from "./rules";
import {
  useRevenueProject, useItalyRegion, useRevenueAssumptions, useRevenueContracts,
  useBalancingPrices, useIndividualVolumes, useNegativePriceProduction,
  useRevenueSubaccount, useRevenueCurrency, useOverlappingContracts,
  useSaveRevenueContract, useDeleteRevenueContract, useSaveBalancingPrice,
  useDeleteBalancingPrice, useLocale,
} from "./hooks";

const useStyles = makeStyles({
  stack: { display: "flex", flexDirection: "column", gap: space.l, minWidth: 0 },
  panel: { display: "flex", flexDirection: "column", gap: space.m },
  grid2: {
    display: "grid", gap: space.m, gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
    [media.belowMd]: { gridTemplateColumns: "1fr" },
  },
  lock: { display: "flex", flexDirection: "column", gap: space.xs },
  section: {
    display: "flex", flexDirection: "column", gap: space.s,
    paddingTop: space.s, borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  sectionTitle: { fontSize: "12px", fontWeight: 600, color: tokens.colorNeutralForeground2 },
  hint: { color: tokens.colorNeutralForeground3, fontSize: "11px" },
  bad: { color: semantic.errorText, fontSize: "12px" },
  volumeRow: {
    display: "grid", gridTemplateColumns: "minmax(150px, 1fr) minmax(120px, 1fr)",
    gap: space.s, alignItems: "end",
    [media.belowMd]: { gridTemplateColumns: "1fr" },
  },
});

/**
 * Rule 26 — standardness drives typography. One cell renderer replaces the per-field
 * `FontColor` / `Italic` / `FontItalic` expressions the canvas repeats on every control.
 */
function StandardValue({ text, isStandard }: { text: string; isStandard: boolean }) {
  const style: CSSProperties = isStandard
    ? { fontStyle: "italic", color: tokens.colorBrandForeground1 }
    : {};
  return <span style={style}>{text}</span>;
}

const emptyHedge = (): HedgeState => ({
  type: "percentage",
  percentage: field(""),
  fixed: { ...field(""), initialState: true },
  individual: [],
});

const ALL_STANDARD: StandardFlags = {
  biddingPrice: true, contractDurationYears: true, contractDurationMonths: true,
  contractStartDate: true, contractEndDate: true, tariffPrice: true, tariffPriceP90: true,
  useInflationProfile: true, useCustomInflation: true, inflationProfileYear: true,
  customInflationProfile: true, hedgedVolume: true, correctionFactor: true,
  correctionFactorP90: true,
};

export default function ProjectRevenuesScreen() {
  const s = useStyles();
  const lang = useLocale();
  const { project: selected, canEdit } = useProjectContext();
  const projectId = selected?.projectId;

  const { project, isLoading: projectLoading } = useRevenueProject(projectId);
  const region = useItalyRegion(project);
  const assumptions = useRevenueAssumptions(project?.countryName ?? null, region);
  const { contracts, isLoading: contractsLoading } = useRevenueContracts(projectId);
  const { periods, isLoading: periodsLoading } = useBalancingPrices(projectId);
  const productionExists = useNegativePriceProduction(projectId);
  const { subaccount } = useRevenueSubaccount();
  const { currency } = useRevenueCurrency(project?.countryName ?? null);

  // GUIDE q25: the tab is a `?tab=` search param so it survives a reload.
  const [params, setParams] = useSearchParams();
  const tab: RevenueTab = parseRevenueTab(params.get("tab"));
  const goToTab = (next: RevenueTab) => {
    const p = new URLSearchParams(params);
    p.set("tab", next);
    setParams(p, { replace: true });
  };
  const [selectedContractId, setSelectedContractId] = useState<string | null>(null);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null);
  const [panel, setPanel] = useState<"none" | "contract" | "balancing">("none");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"none" | "deleteContract" | "deletePeriod" | "volumes">("none");
  const [form, setForm] = useState<RevenueFormState | null>(null);
  const [flags, setFlags] = useState<StandardFlags>(ALL_STANDARD);
  const [hedgeError, setHedgeError] = useState<string | null>(null);
  const [balancing, setBalancing] = useState<{
    id: string | null; price: string; years: number; months: number; shift: string;
  } | null>(null);

  const { volumes: storedVolumes } = useIndividualVolumes(editingId);
  const overlap = useOverlappingContracts(
    projectId, form?.startDate ?? null, form?.endDate ?? null, editingId,
  );
  const saveContract = useSaveRevenueContract(projectId);
  const deleteContract = useDeleteRevenueContract(projectId);
  const savePeriod = useSaveBalancingPrice(projectId);
  const deletePeriod = useDeleteBalancingPrice(projectId);

  const locked = isPageLocked(project);
  const lockBullets = pageLock(project);
  const selectedContract = contracts.find((c) => c.id === selectedContractId) ?? null;

  /* ─────────────────────────────────────────── the assumption engine, once ── */

  const applyAssumptions = (label: string): RevenueFormState | null => {
    if (!project) return null;
    const rows = assumptions.rows;
    const tech = project.technology;
    const exists = standardAssumptionExists(rows, tech, label);
    const change = subContractTypeChange(rows, tech, project);
    const start = contractStartDate(rows, tech, project, { standardAssumptionExists: exists });
    const dur = contractDuration(rows, tech, { standardAssumptionExists: exists, language: lang });
    const end = endDateWithGuard(start.value, dur.years.value, dur.months.value);
    const codYear = project.cod?.getFullYear() ?? new Date().getFullYear();
    const price = priceForYear(rows, tech, codYear, lang) ?? 0;
    const priceP90 = p90Price(rows, tech, codYear, lang);
    const infl = inflation(rows, tech, project, { standardAssumptionExists: exists, language: lang });
    const neg = negativePriceState(rows, tech, label, productionExists);
    const shows = showsGermanFitBlock(project.countryName, label, tech);
    const cf = correctionFactorDefault();

    setFlags(ALL_STANDARD);
    return {
      mode: "New", formDirty: false, contractId: null,
      subaccountId: subaccount?.vsb_revenuesubaccountid ?? null,
      revenueTypeLabel: label,
      description: descriptionFor({
        country: project.countryName, region, revenueTypeLabel: label,
        standardAssumptionExists: exists, allValuesStandard: true, change,
      }),
      currencyCode: currency?.vsb_currencycode ?? null,
      tariff: shows ? germanFitTariff(price, cf.value) : fmtPrice(price),
      tariffP90: priceP90 === null ? "" : fmtPrice(priceP90),
      biddingPrice: shows ? fmtPrice(price) : "",
      siteQuality: "", siteQualityP90: "",
      correctionFactor: shows ? cf.value.toFixed(3) : "",
      correctionFactorP90: shows && tech === "Wind" ? cf.value.toFixed(3) : "",
      startDate: start.value, endDate: end,
      durationYears: dur.years.value, durationMonths: dur.months.value,
      hedge: emptyHedge(),
      useInflation: infl.useInflation.value,
      useCountryInflationProfile: infl.useCountryProfile.value,
      inflationProfile: infl.customValue.value ? String(infl.customValue.value) : "",
      inflationStartYear: infl.startYear.value ? String(infl.startYear.value) : "",
      considerNegativePrices: neg.toggleState,
      negativePriceManualOverride: neg.manualOverride,
      isStandardContract: exists,
      showsGermanFitBlock: shows,
      technology: tech, country: project.countryName, netYieldP50: project.netYieldP50,
    };
  };

  const openNewContract = () => {
    setEditingId(null);
    setHedgeError(null);
    setForm(applyAssumptions("PPA"));
    setPanel("contract");
  };

  const openEditContract = (c: StoredRevenueContract) => {
    if (!project) return;
    const label = revenueLabelText(c.label);
    const re = rehydrateForEdit(c, project.countryName, project.technology);
    setEditingId(c.id);
    setFlags(c.flags);
    setHedgeError(null);
    setForm({
      mode: "Edit", formDirty: false, contractId: c.id, subaccountId: c.subaccountId,
      revenueTypeLabel: label, description: c.description,
      currencyCode: currency?.vsb_currencycode ?? null,
      tariff: fmtPrice(c.tariffPrice), tariffP90: fmtPrice(c.tariffPriceP90),
      biddingPrice: fmtPrice(c.biddingPrice), siteQuality: fmtPrice(c.siteQuality),
      siteQualityP90: fmtPrice(c.siteQualityP90),
      correctionFactor: c.correctionFactor === null ? "" : c.correctionFactor.toFixed(3),
      correctionFactorP90: c.correctionFactorP90 === null ? "" : c.correctionFactorP90.toFixed(3),
      startDate: c.contractStartDate, endDate: c.contractEndDate,
      durationYears: c.contractDurationYears, durationMonths: c.contractDurationMonths,
      hedge: {
        type: hedgeTypeFromValue(c.hedgeType),
        percentage: field(c.hedgedVolume === null ? "" : String(c.hedgedVolume)),
        fixed: {
          ...field(c.fixedContractedMwhPa === null ? "" : String(c.fixedContractedMwhPa)),
          initialState: c.fixedContractedMwhPa === null,
        },
        individual: storedVolumes,
      },
      useInflation: c.useInflationProfile,
      useCountryInflationProfile: c.useCountryInflationProfile,
      inflationProfile: c.inflationProfile === null ? "" : String(c.inflationProfile),
      inflationStartYear: c.inflationStartYear ? String(c.inflationStartYear) : "",
      considerNegativePrices: c.considerNegativePrices,
      negativePriceManualOverride: c.negativePriceManualOverride,
      isStandardContract: re.isStandardContract,
      showsGermanFitBlock: re.showsGermanFitBlock,
      technology: project.technology, country: project.countryName,
      netYieldP50: project.netYieldP50,
    });
    setPanel("contract");
  };

  /** Every edit marks the form dirty and drops the field's standard flag (rule 25). */
  const patch = (p: Partial<RevenueFormState>, flag?: keyof StandardFlags) => {
    setForm((f) => (f ? { ...f, ...p, formDirty: true } : f));
    if (flag) setFlags((x) => ({ ...x, [flag]: false }));
  };

  const runSave = async () => {
    if (!form || !project) return;
    setHedgeError(null);

    // Rule 22 — the month-by-month cross-contract 100 % check, before any write.
    if (form.hedge.type === "percentage" && form.startDate && form.endDate) {
      const { data } = await overlap.refetch();
      const result = validateHedgedVolume(
        {
          startDate: form.startDate, endDate: form.endDate,
          hedgedVolume: Number(form.hedge.percentage.value) || 0,
        },
        data ?? overlap.contracts,
      );
      if (!result.ok) { setHedgeError(result.message); return; }
    }

    const effective: StandardFlags = {
      ...flags,
      tariffPrice: tariffIsStandard(
        form.showsGermanFitBlock, field(0, flags.tariffPrice), field(0, flags.correctionFactor),
      ),
      tariffPriceP90: tariffP90IsStandard(
        form.showsGermanFitBlock, field(0, flags.tariffPriceP90),
        field(0, flags.correctionFactorP90),
      ),
    };

    await saveContract.mutateAsync({
      payload: buildRevenuePayload(form, project, effective, lang),
      project,
      contractId: editingId,
      currencyId: currency?.vsb_currencyid ?? null,
      existingVolumeIds: storedVolumes.map((v) => v.recordId!).filter(Boolean),
    });
    setPanel("none");
    setForm(null);
  };

  const onSavePressed = () => {
    // Rule 32 — Individual Volumes needs one extra confirmation.
    if (form && needsIndividualVolumesConfirmation(form.hedge.type)) setConfirm("volumes");
    else void runSave();
  };

  /* ─────────────────────────────────────────────────── balancing periods ──── */

  // Rule 28 — the start date is derived (COD + shift for the first period, the day after
  // the previous period's end for the rest), so the panel never asks for it. See
  // `balancingStart` below, which is the single source for both the display and the save.
  const openNewPeriod = () => {
    setBalancing({ id: null, price: "", years: 0, months: 1, shift: "0" });
    setSelectedPeriodId(null);
    setPanel("balancing");
  };

  const openEditPeriod = (p: BalancingPeriod) => {
    setBalancing({
      id: p.id, price: p.price === null ? "" : String(p.price),
      years: p.durationYears ?? 0, months: p.durationMonths ?? 1,
      shift: p.shiftOfCodMonths === null ? "0" : String(p.shiftOfCodMonths),
    });
    setPanel("balancing");
  };

  const balancingStart = useMemo(() => {
    if (!balancing) return null;
    if (balancing.id) return periods.find((p) => p.id === balancing.id)?.startDate ?? null;
    return periods.length === 0
      ? firstPeriodStart(project?.cod ?? null, Number(balancing.shift) || 0)
      : nextPeriodStart(periods);
  }, [balancing, periods, project?.cod]);

  const savePeriodNow = async () => {
    if (!balancing || !projectId || !balancingStart) return;
    const index = balancing.id
      ? periods.findIndex((p) => p.id === balancing.id) + 1
      : periods.length + 1;
    await savePeriod.mutateAsync({
      id: balancing.id,
      projectId,
      name: balancingPeriodName(index),
      periods: balancing.id
        ? (periods.find((p) => p.id === balancing.id)?.periods ?? null)
        : nextPeriodValue(periods.length),
      price: Number(balancing.price) || 0,
      startDate: balancingStart,
      endDate: balancingEndDate(balancingStart, balancing.years, balancing.months),
      durationYears: balancing.years,
      durationMonths: balancing.months,
      shiftOfCodMonths: showsShiftOfCod(periods.length) ? (Number(balancing.shift) || 0) : null,
    });
    setPanel("none");
    setBalancing(null);
  };

  /* ─────────────────────────────────────────────────────────── rendering ──── */

  if (!selected?.projectId) return <SelectProjectPrompt onGo={() => undefined} />;

  const bar = contractCommandBar(selectedContract, canEdit, Boolean(subaccount));
  const balancingBar = balancingCommandBar(periods, selectedPeriodId, canEdit);

  const contractCommands: Command[] = tab === "Contracted Revenue"
    ? [
      {
        key: "add", label: "Add Contract", icon: <AddRegular />, primary: true,
        onClick: openNewContract, disabled: !bar.add.enabled, disabledReason: bar.add.reason,
      },
      {
        key: "edit", label: "Edit", icon: <EditRegular />,
        onClick: () => selectedContract && openEditContract(selectedContract),
        disabled: !selectedContract || !bar.edit.enabled,
      },
      {
        key: "delete", label: "Delete", icon: <DeleteRegular />, danger: true,
        onClick: () => setConfirm("deleteContract"),
        disabled: !selectedContract || !bar.delete.enabled,
      },
    ]
    : [
      {
        key: "add", label: "Add Period", icon: <AddRegular />, primary: true,
        onClick: openNewPeriod, disabled: !balancingBar.add.enabled,
      },
      {
        key: "edit", label: "Edit", icon: <EditRegular />,
        onClick: () => {
          const p = periods.find((x) => x.id === selectedPeriodId);
          if (p) openEditPeriod(p);
        },
        disabled: !balancingBar.edit.enabled, disabledReason: balancingBar.edit.reason,
      },
      {
        key: "delete", label: "Delete", icon: <DeleteRegular />, danger: true,
        onClick: () => setConfirm("deletePeriod"),
        disabled: !balancingBar.delete.enabled, disabledReason: balancingBar.delete.reason,
      },
    ];

  const contractColumns: Column<StoredRevenueContract>[] = [
    { key: "description", header: "Description", width: "minmax(200px, 2fr)", value: (r) => r.description },
    {
      key: "label", header: "Type", width: "90px",
      value: (r) => revenueLabelText(r.label) ?? "",
    },
    {
      key: "tariff", header: "Tariff / Price", width: "130px", align: "end", numeric: true,
      render: (r) => (
        <StandardValue text={fmtPrice(r.tariffPrice)} isStandard={r.flags.tariffPrice} />
      ),
    },
    {
      key: "start", header: "Start", width: "120px", hideBelow: "md",
      render: (r) => (
        <StandardValue
          text={formatDate(r.contractStartDate)}
          isStandard={r.flags.contractStartDate}
        />
      ),
    },
    {
      key: "end", header: "End", width: "120px", hideBelow: "md",
      render: (r) => (
        <StandardValue text={formatDate(r.contractEndDate)} isStandard={r.flags.contractEndDate} />
      ),
    },
    {
      key: "duration", header: "Duration", width: "120px", hideBelow: "lg",
      render: (r) => (
        <StandardValue
          text={`${r.contractDurationYears ?? 0}y ${r.contractDurationMonths ?? 0}m`}
          isStandard={durationCellIsStandard(r.flags)}
        />
      ),
    },
    {
      key: "hedge", header: "Hedging", width: "150px", hideBelow: "lg",
      render: (r) => {
        const t = hedgeTypeFromValue(r.hedgeType);
        const text = t === "percentage"
          ? `${r.hedgedVolume ?? 0} %`
          : t === "fixed" ? `${fmtMwh(r.fixedContractedMwhPa)} MWh` : HEDGE_TYPE_LABEL.individual;
        return <StandardValue text={text} isStandard={r.flags.hedgedVolume} />;
      },
    },
  ];

  const periodColumns: Column<BalancingPeriod>[] = [
    { key: "name", header: "Period", width: "minmax(160px, 1fr)", value: (r) => r.name },
    {
      key: "price", header: "Balancing Price", width: "140px", align: "end", numeric: true,
      value: (r) => fmtPrice(r.price),
    },
    { key: "start", header: "Start", width: "120px", value: (r) => formatDate(r.startDate) },
    { key: "end", header: "End", width: "120px", value: (r) => formatDate(r.endDate) },
    {
      key: "duration", header: "Duration", width: "120px", hideBelow: "md",
      value: (r) => `${r.durationYears ?? 0}y ${r.durationMonths ?? 0}m`,
    },
    {
      key: "latest", header: "", width: "90px", hideBelow: "lg",
      value: (r) => (isNewestPeriod(periods, r.id) ? "Editable" : ""),
    },
  ];

  const errors: string[] = [];
  if (form) {
    if (hedgeError) errors.push(hedgeError);
    const desc = validateDescription(form.description, form.isStandardContract);
    if (!desc.valid) errors.push(desc.message);
    const t = validateTariff(form.tariff, form.country, form.showsGermanFitBlock, lang);
    if (!t.valid) errors.push(t.message);
  }
  if (!subaccount) errors.push(MSG.subaccountMissing);

  return (
    <div className={s.stack}>
      <PageHeader
        eyebrow="Project"
        title="Revenues"
        description="Revenue contracts and balancing-price periods. Values shown in italic brand colour are still the standard assumption derived from the country's revenue assumptions."
      />

      {locked && lockBullets.length > 0 && (
        <MessageBar intent="warning">
          <MessageBarBody className={s.lock}>
            <MessageBarTitle>
              <LockClosedRegular /> {PAGE_LOCK_TITLE}
            </MessageBarTitle>
            {lockBullets.map((b) => <Text key={b}>{b}</Text>)}
          </MessageBarBody>
        </MessageBar>
      )}

      {assumptions.isError && (
        <MessageBar intent="error">
          <MessageBarBody>
            <MessageBarTitle>Revenue assumptions unavailable</MessageBarTitle>
            No standard assumptions can be applied. Contract fields open blank rather than
            with derived values; saving is still possible.
          </MessageBarBody>
        </MessageBar>
      )}

      {!locked && (
        <StatTiles
          stats={[
            { label: "Contracts", value: String(contracts.length) },
            { label: "Balancing periods", value: String(periods.length) },
            {
              label: "Hedged (%) total",
              value: String(contracts.reduce((a, c) => a + (c.hedgedVolume ?? 0), 0)),
              unit: "%",
            },
            { label: "Net Yield p50", value: fmtMwh(project?.netYieldP50), unit: "MWh" },
          ]}
        />
      )}

      {!locked && (
        <>
          <TabList selectedValue={tab} onTabSelect={(_, dt) => goToTab(dt.value as RevenueTab)}>
            {REVENUE_TABS.map((t) => <Tab key={t} value={t}>{t}</Tab>)}
          </TabList>

          <Card flush fill>
            <CommandBar commands={contractCommands} />
            {tab === "Contracted Revenue" ? (
              contracts.length === 0 && !contractsLoading ? (
                <EmptyState
                  title="No revenue contracts yet"
                  description="Add a FiT, PPA or CfD contract. Its fields are pre-filled from the country's standard revenue assumptions."
                  action={bar.add.enabled ? (
                    <Button appearance="primary" icon={<AddRegular />} onClick={openNewContract}>
                      Add Contract
                    </Button>
                  ) : undefined}
                />
              ) : (
                <DataGrid
                  rows={contracts}
                  columns={contractColumns}
                  rowKey={(r) => r.id}
                  loading={contractsLoading}
                  selectedKey={selectedContractId}
                  onRowClick={(r) => setSelectedContractId(r.id)}
                  emptyMessage="No revenue contracts."
                />
              )
            ) : (
              <DataGrid
                rows={periods}
                columns={periodColumns}
                rowKey={(r) => r.id}
                loading={periodsLoading}
                selectedKey={selectedPeriodId}
                onRowClick={(r) => setSelectedPeriodId(r.id)}
                emptyMessage="No balancing-price periods."
              />
            )}
          </Card>
        </>
      )}

      {/* ───────────────────────────────────────────────── contract panel ── */}
      <FormPanel
        open={panel === "contract" && form !== null}
        title={editingId ? "Edit revenue contract" : "New revenue contract"}
        onClose={() => { setPanel("none"); setForm(null); setHedgeError(null); }}
        onSave={onSavePressed}
        saveDisabled={!form || !canSaveRevenueContract(form, lang)}
        busy={saveContract.isPending}
        errors={errors}
      >
        {form && (
          <div className={s.panel}>
            <Field label="Type" required>
              <RadioGroup
                layout="horizontal"
                value={form.revenueTypeLabel ?? ""}
                onChange={(_, dt) => {
                  const next = applyAssumptions(dt.value);
                  if (next) setForm({ ...next, formDirty: true });
                }}
              >
                <Radio value="FiT" label="FiT" />
                <Radio value="PPA" label="PPA" />
              </RadioGroup>
            </Field>

            <Field label="Description" required>
              <Input
                value={form.description}
                onChange={(_, dt) => patch({ description: dt.value })}
              />
            </Field>

            {/* GUIDE q25: Currency is never typed on this panel — it is the country's
                revenue currency, shown as a disabled field with the value in placeholder
                grey (the same "system default, not a choice" convention as the derived
                Country Inflation Profile field below), not as ordinary black text. */}
            <Field label={REVENUE_FORM_LABEL.currency} required>
              <Input value="" disabled placeholder={derivedFieldPlaceholder(currency?.vsb_name ?? null)} />
            </Field>

            {/* GUIDE q25: term precedes tariff — Contract Start Date, Contract Duration,
                Contract End Date, in that order, ahead of the price fields. */}
            <div className={s.section}>
              <div className={s.grid2}>
                <Field label={REVENUE_FORM_LABEL.contractStartDate} required>
                  <Input
                    type="date"
                    value={form.startDate ? form.startDate.toISOString().slice(0, 10) : ""}
                    onChange={(_, dt) => {
                      const next = dt.value ? new Date(dt.value) : null;
                      patch({
                        startDate: next,
                        endDate: next
                          ? endDateWithGuard(next, form.durationYears ?? 0, form.durationMonths ?? 0)
                          : null,
                      }, "contractStartDate");
                    }}
                  />
                </Field>
                <Field label={`${REVENUE_FORM_LABEL.contractDuration} (years)`} required>
                  <select
                    value={form.durationYears ?? 0}
                    onChange={(e) => {
                      const y = Number(e.target.value);
                      patch({
                        durationYears: y,
                        endDate: form.startDate
                          ? endDateWithGuard(form.startDate, y, form.durationMonths ?? 0)
                          : null,
                      }, "contractDurationYears");
                    }}
                  >
                    {durationYearOptions().map((y) => (
                      <option key={y} value={y}>{`${y} year(s)`}</option>
                    ))}
                  </select>
                </Field>
                <Field label={`${REVENUE_FORM_LABEL.contractDuration} (months)`} required>
                  <select
                    value={form.durationMonths ?? 0}
                    onChange={(e) => {
                      const m = Number(e.target.value);
                      patch({
                        durationMonths: m,
                        endDate: form.startDate
                          ? endDateWithGuard(form.startDate, form.durationYears ?? 0, m)
                          : null,
                      }, "contractDurationMonths");
                    }}
                  >
                    {durationMonthOptions().map((m) => (
                      <option key={m} value={m}>{`${m} month(s)`}</option>
                    ))}
                  </select>
                </Field>
                {/* GUIDE q25: Contract End Date carries no asterisk — it is derived from
                    start + duration, not a required entry of its own. */}
                <Field label={REVENUE_FORM_LABEL.contractEndDate}>
                  <Input readOnly value={formatDate(form.endDate)} />
                </Field>
              </div>
            </div>

            {form.showsGermanFitBlock && (
              <div className={s.section}>
                <span className={s.sectionTitle}>EEG bidding (German wind FiT)</span>
                <div className={s.grid2}>
                  <NumericInput
                    label="Bidding Price"
                    value={form.biddingPrice}
                    places={2}
                    min={0}
                    max={100}
                    language={lang}
                    rangeMessage={validateBiddingPrice(form.biddingPrice, lang).message}
                    onChange={(v) => patch({
                      biddingPrice: v,
                      tariff: germanFitTariff(Number(v) || 0, Number(form.correctionFactor) || 0),
                    }, "biddingPrice")}
                  />
                  <NumericInput
                    label="Site Quality"
                    value={form.siteQuality}
                    places={2}
                    min={0}
                    max={100}
                    language={lang}
                    onChange={(v) => patch({ siteQuality: v })}
                  />
                  <NumericInput
                    label="Correction Factor"
                    value={form.correctionFactor}
                    places={3}
                    min={0.5}
                    max={2}
                    language={lang}
                    rangeMessage={validateCorrectionFactor(form.correctionFactor, lang).message}
                    onChange={(v) => patch({
                      correctionFactor: v,
                      tariff: germanFitTariff(Number(form.biddingPrice) || 0, Number(v) || 0),
                    }, "correctionFactor")}
                  />
                  {form.technology === "Wind" && (
                    <>
                      <NumericInput
                        label="Site Quality p90"
                        value={form.siteQualityP90}
                        places={2} min={0} max={100} language={lang}
                        onChange={(v) => patch({ siteQualityP90: v })}
                      />
                      <NumericInput
                        label="Correction Factor p90"
                        value={form.correctionFactorP90}
                        places={3} min={0.5} max={2} language={lang}
                        onChange={(v) => patch({ correctionFactorP90: v }, "correctionFactorP90")}
                      />
                    </>
                  )}
                </div>
                <span className={s.hint}>
                  Tariff = Bidding Price × Correction Factor; the tariff field is computed and
                  read-only for this combination.
                </span>
              </div>
            )}

            <div className={s.grid2}>
              {/* GUIDE q25: the bracketed unit is part of the label text itself, matching
                  how Balancing Price and every Financing rate field already spell it —
                  not the shared NumericInput's own parenthesised `unit` prop. */}
              <NumericInput
                label={REVENUE_FORM_LABEL.tariffPrice(form.currencyCode)}
                value={form.tariff}
                places={2}
                min={0}
                max={form.country === "Poland" ? 750 : 150}
                required
                disabled={form.showsGermanFitBlock}
                language={lang}
                onChange={(v) => patch({ tariff: v }, "tariffPrice")}
              />
              {form.technology === "Wind" && (
                <NumericInput
                  label={`${REVENUE_FORM_LABEL.tariffPrice(form.currencyCode)} p90`}
                  value={form.tariffP90}
                  places={2} min={0} max={form.country === "Poland" ? 750 : 150}
                  disabled={form.showsGermanFitBlock}
                  language={lang}
                  onChange={(v) => patch({ tariffP90: v }, "tariffPriceP90")}
                />
              )}
            </div>

            <div className={s.section}>
              <span className={s.sectionTitle}>Inflation</span>
              <Switch
                label={REVENUE_FORM_LABEL.inflationProfile}
                checked={form.useInflation}
                onChange={(_, dt) => patch({ useInflation: dt.checked }, "useInflationProfile")}
              />
              {form.useInflation && (
                <div className={s.grid2}>
                  <Switch
                    label={REVENUE_FORM_LABEL.countryInflationProfile}
                    checked={form.useCountryInflationProfile}
                    onChange={(_, dt) =>
                      patch({ useCountryInflationProfile: dt.checked }, "useCustomInflation")}
                  />
                  <Field
                    label={REVENUE_FORM_LABEL.inflationStartYear}
                    required
                    validationMessage={validateInflationStartYear(form.inflationStartYear).message}
                  >
                    <Input
                      placeholder={REVENUE_FORM_LABEL.inflationStartYearPlaceholder}
                      value={form.inflationStartYear}
                      onChange={(_, dt) =>
                        patch({ inflationStartYear: dt.value }, "inflationProfileYear")}
                    />
                  </Field>
                  {/* GUIDE q25: with the country profile on, a second, disabled
                      "Country Inflation Profile" field shows the project's country in
                      placeholder grey — a derived value, not an editable percentage. */}
                  {form.useCountryInflationProfile ? (
                    <Field label={REVENUE_FORM_LABEL.countryInflationProfile}>
                      <Input value="" disabled placeholder={derivedFieldPlaceholder(form.country)} />
                    </Field>
                  ) : (
                    <PercentageInput
                      label={REVENUE_FORM_LABEL.inflationProfile}
                      value={form.inflationProfile}
                      places={2}
                      language={lang}
                      rangeMessage={validateInflationProfile(form.inflationProfile, lang).message}
                      onChange={(v) =>
                        patch({ inflationProfile: v }, "customInflationProfile")}
                    />
                  )}
                </div>
              )}
            </div>

            <div className={s.section}>
              <Switch
                label={REVENUE_FORM_LABEL.considerNegativePrices}
                checked={form.considerNegativePrices}
                disabled={
                  negativePriceState(
                    assumptions.rows, form.technology, form.revenueTypeLabel, productionExists,
                  ).displayMode === "disabled"
                }
                onChange={(_, dt) => patch({
                  considerNegativePrices: dt.checked,
                  negativePriceManualOverride: true,
                })}
              />
              {!productionExists && (
                <Text className={s.hint}>
                  No active energy yield with negative prices exists for this project, so the
                  toggle is locked.
                </Text>
              )}
            </div>

            <div className={s.section}>
              <Field label={REVENUE_FORM_LABEL.provideHedgeVolumeIn} required>
                <RadioGroup
                  value={form.hedge.type}
                  onChange={(_, dt) => {
                    const next = dt.value as HedgeType;
                    patch({
                      hedge: {
                        ...emptyHedge(),
                        type: next,
                        individual: next === "individual" && form.startDate && form.endDate
                          ? generateVolumeRows(form.startDate, form.endDate)
                          : [],
                      },
                    }, "hedgedVolume");
                  }}
                >
                  {hedgeTypeOptions(form.startDate, form.durationYears, form.durationMonths)
                    .map((t) => <Radio key={t} value={t} label={HEDGE_TYPE_LABEL[t]} />)}
                </RadioGroup>
              </Field>

              {form.hedge.type === "percentage" && (
                // GUIDE q25: `NumericInput` directly, not `PercentageInput` — that wrapper
                // hard-codes its own `unit="%"` and would double up against the bracketed
                // "[%]" already in `HEDGE_TYPE_LABEL.percentage`.
                <NumericInput
                  label={HEDGE_TYPE_LABEL.percentage}
                  value={form.hedge.percentage.value}
                  places={1}
                  min={0}
                  max={100}
                  required
                  language={lang}
                  rangeMessage={validateHedgedVolumePercent(form.hedge.percentage.value, lang).message}
                  onChange={(v) => patch({
                    hedge: { ...form.hedge, percentage: { ...form.hedge.percentage, value: v } },
                  }, "hedgedVolume")}
                />
              )}

              {form.hedge.type === "fixed" && (
                <NumericInput
                  label={HEDGE_TYPE_LABEL.fixed}
                  value={form.hedge.fixed.value}
                  places={0}
                  min={0}
                  max={form.netYieldP50 ?? 0}
                  language={lang}
                  rangeMessage={validateVolumeMwh(form.hedge.fixed.value, form.netYieldP50).message}
                  onChange={(v) => patch({
                    hedge: {
                      ...form.hedge,
                      fixed: { ...form.hedge.fixed, value: v, initialState: false },
                    },
                  }, "hedgedVolume")}
                />
              )}

              {form.hedge.type === "individual" && (
                <>
                  {form.hedge.individual.map((rowItem: IndividualVolumeRow, i) => (
                    <div key={rowItem.year} className={s.volumeRow}>
                      <Field label={volumeRowLabel(rowItem)}>
                        <NumericInput
                          label=""
                          value={rowItem.value}
                          places={0}
                          min={0}
                          max={form.netYieldP50 ?? 0}
                          unit="MWh"
                          language={lang}
                          onChange={(v) => {
                            const next = [...form.hedge.individual];
                            next[i] = { ...rowItem, value: v, initialState: false };
                            patch({ hedge: { ...form.hedge, individual: next } }, "hedgedVolume");
                          }}
                        />
                      </Field>
                    </div>
                  ))}
                  {form.hedge.individual.length === 0 && (
                    <Text className={s.hint}>
                      Set the contract start date and duration first — the volume rows are
                      generated from the term.
                    </Text>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </FormPanel>

      {/* ──────────────────────────────────────────────── balancing panel ── */}
      <FormPanel
        open={panel === "balancing" && balancing !== null}
        title={balancing?.id ? "Edit balancing period" : "New balancing period"}
        onClose={() => { setPanel("none"); setBalancing(null); }}
        onSave={() => void savePeriodNow()}
        saveDisabled={
          !balancing ||
          !validateBalancingPrice(balancing.price, project?.countryName ?? null, lang).valid ||
          !validateShiftOfCod(balancing.shift, lang).valid ||
          balancing.price === ""
        }
        busy={savePeriod.isPending}
      >
        {balancing && (
          <div className={s.panel}>
            {showsShiftOfCod(periods.length) && (
              <NumericInput
                label="Shift of COD Date"
                value={balancing.shift}
                places={0}
                min={0}
                max={24}
                unit="months"
                language={lang}
                rangeMessage={validateShiftOfCod(balancing.shift, lang).message}
                onChange={(v) => setBalancing({ ...balancing, shift: v })}
              />
            )}
            <Field label="Start date">
              <Input readOnly value={formatDate(balancingStart)} />
            </Field>
            <div className={s.grid2}>
              <Field label="Duration (years)">
                <select
                  value={balancing.years}
                  onChange={(e) => {
                    const y = Number(e.target.value);
                    const months = balancingMonthOptions(y);
                    setBalancing({
                      ...balancing,
                      years: y,
                      months: months.includes(balancing.months) ? balancing.months : months[0]!,
                    });
                  }}
                >
                  {balancingYearOptions().map((y) => (
                    <option key={y} value={y}>{`${y} year(s)`}</option>
                  ))}
                </select>
              </Field>
              <Field label="Duration (months)">
                <select
                  value={balancing.months}
                  onChange={(e) => setBalancing({ ...balancing, months: Number(e.target.value) })}
                >
                  {balancingMonthOptions(balancing.years).map((m) => (
                    <option key={m} value={m}>{`${m} month(s)`}</option>
                  ))}
                </select>
              </Field>
            </div>
            <NumericInput
              label={`Balancing Price [${project?.countryName === "Poland" ? "PLN" : "EUR"}/MWh]`}
              value={balancing.price}
              places={2}
              min={project?.countryName === "Poland" ? -25 : -5}
              max={project?.countryName === "Poland" ? 50 : 10}
              required
              language={lang}
              rangeMessage={
                validateBalancingPrice(balancing.price, project?.countryName ?? null, lang).message
              }
              onChange={(v) => setBalancing({ ...balancing, price: v })}
            />
            <Field label="End date">
              <Input
                readOnly
                value={
                  balancingStart
                    ? formatDate(balancingEndDate(balancingStart, balancing.years, balancing.months))
                    : ""
                }
              />
            </Field>
          </div>
        )}
      </FormPanel>

      <ConfirmDialog
        open={confirm === "deleteContract"}
        title="Delete this revenue contract?"
        intent="danger"
        confirmLabel="Delete"
        busy={deleteContract.isPending}
        onCancel={() => setConfirm("none")}
        onConfirm={async () => {
          if (selectedContractId) await deleteContract.mutateAsync(selectedContractId);
          setSelectedContractId(null);
          setConfirm("none");
        }}
      >
        <Text>Its individual hedge volumes are deleted with it.</Text>
      </ConfirmDialog>

      <ConfirmDialog
        open={confirm === "deletePeriod"}
        title="Delete this balancing period?"
        intent="danger"
        confirmLabel="Delete"
        busy={deletePeriod.isPending}
        onCancel={() => setConfirm("none")}
        onConfirm={async () => {
          if (selectedPeriodId) await deletePeriod.mutateAsync(selectedPeriodId);
          setSelectedPeriodId(null);
          setConfirm("none");
        }}
      />

      <ConfirmDialog
        open={confirm === "volumes"}
        title="Confirm Individual Volumes"
        confirmLabel="Confirm and save"
        onCancel={() => setConfirm("none")}
        onConfirm={() => { setConfirm("none"); void runSave(); }}
      >
        <Text>{MSG.individualVolumesConfirm}</Text>
      </ConfirmDialog>

      {(projectLoading || saveContract.isPending) && <LoadingOverlay mode="inline" />}
    </div>
  );
}
