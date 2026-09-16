/**
 * Project Production Screen — layout and composition only.
 *
 * Canvas screen: `Project Production Screen` (PM app)
 *   299 controls · 9 080 lines of Power Fx · 96 substantive blocks · band XL
 *
 * The yields grid, one command bar, and ONE yield panel parameterised by technology —
 * the canvas ships two 300-plus-line copies that differ only in the wind-speed vs
 * irradiation field and which column of the standard assumptions they read.
 *
 * GUIDE q12–q16 — a screen recording covering this screen properly for the first time
 * reshaped the presentation layer below (the business rules it exercises were already
 * right and are unchanged):
 *  - q12/q13: the summary is a 2×3 grid led by Gross Yield, and the record list is not
 *    the multi-column grid this screen used to render — one collapsible row per record,
 *    a radio, "Production - {description}", an Internal/External chip and an
 *    Active/Inactive chip. Selecting a record reveals exactly Edit / Delete /
 *    Deactivate Production, which `commandBarState` already produced unchanged.
 *  - q14–q16: "Add Production WTG" opens a wide slide-over whose Seasonality and
 *    Negative Prices columns appear progressively as their toggles switch on, each with
 *    its own reset affordance — one icon for the whole Seasonality block, one per row in
 *    Negative Prices — and a `Total Sum [%]` that is a plain bold computed total, never
 *    the italic/blue "calculated default" treatment the cells beside it carry.
 *
 * WHAT WAS DELETED AS A WORKAROUND
 *  - The second right panel (`…DataPV_…`), a near-verbatim copy of the WTG one.
 *  - `btn_Load_StandardContracts_For_Project` and
 *    `btn_Seasonality_NegativePrice_Reset_Hidden`, hidden buttons used as subroutines —
 *    now `useRecalculateProject()` and plain state resets.
 *  - `locIsVisibleSpinner` / `locIsVisibleSpinnerText`, replaced by `LoadingOverlay`.
 *  - `locLeaveProductionConfirmationDialog` wired to a hidden Power Fx dialog; the guard
 *    is a `ConfirmDialog` on the panel close, driven by the dirty set.
 *
 * Every rule this screen branches on lives in `rules.ts`.
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Field, Input, Radio, RadioGroup, Switch, Text, MessageBar, MessageBarBody,
  MessageBarTitle, Button, Tooltip, Accordion, AccordionItem, AccordionHeader,
  AccordionPanel, mergeClasses, makeStyles, tokens,
} from "@fluentui/react-components";
import {
  AddRegular, DeleteRegular, EditRegular, LockClosedRegular, PlayRegular, PauseRegular,
  ArrowClockwiseRegular, RadioButtonFilled, RadioButtonRegular,
} from "@fluentui/react-icons";
import {
  PageHeader, CommandBar, FormPanel, ConfirmDialog, LoadingOverlay, NumericInput,
  StateChip, EmptyState, SelectProjectPrompt, StatTiles,
  type Command,
} from "@/components";
import { useProjectContext } from "@/features/shared/useProjectContext";
import { space, media, palette, semantic } from "@/theme/tokens";
import { CHOICE_PRODUCTION } from "@/data/entities";
import {
  PAGE_LOCK_TITLE, pageLock, isPageLocked, commandBarState, derivedP75, derivedP90,
  totalLossesPct, NEW_YIELD_DEFAULTS, deriveYieldFields, projectYieldTotals,
  applyMonthEdit, seasonalityTotal, isSeasonalityValid, validateCellPercent,
  validateTotalLosses, validateUncertainty, validateNetYieldP50, validateNetYieldP75,
  validateNetYieldP90, canSaveYield, hasUnsavedChanges, LEAVE_CONFIRMATION,
  yieldTypeLabel, assessmentLabel, allocationLabel, fmtMwh, numericOr,
  SUMMARY_LABELS, fmtSummaryValue, productionRowLabel, productionStatusLabel,
  resetNegativePriceRow, fmtPercentTotal, buildSeasonalityRows,
  MSG,
  type ProductionCommandKey, type Technology, type EnergyYieldRow, type YieldFormState,
  type SeasonalityRow, type NegativePriceRow, type AllocationInputMode,
  type LossesInputMode, type UncertaintyInputMode, type YieldAllocation,
} from "./rules";
import {
  useProductionProject, useEnergyYields, useRevenueAssumptions, useStoredSeasonality,
  useStoredNegativePrices, useProjectRevenues, useTurbineCount, useOandMSubaccount,
  useSaveEnergyYield, useDeleteEnergyYield, useSetYieldStatus, useRecalculateProject,
  useSeasonalityEditor, useNegativePriceEditor, useLocale,
} from "./hooks";

const useStyles = makeStyles({
  stack: { display: "flex", flexDirection: "column", gap: space.l, minWidth: 0 },
  grid2: {
    display: "grid", gap: space.m, gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
    [media.belowMd]: { gridTemplateColumns: "1fr" },
  },
  lock: { display: "flex", flexDirection: "column", gap: space.xs },
  bad: { color: semantic.errorText },
  hint: { color: tokens.colorNeutralForeground3, fontSize: "11px" },
  derived: {
    display: "flex", justifyContent: "space-between", gap: space.s,
    fontSize: "12px", fontVariantNumeric: "tabular-nums",
    color: tokens.colorNeutralForeground2,
  },

  /* GUIDE q12/q13 — the collapsed record row: radio, label, two chips, chevron. */
  recordHead: { display: "flex", alignItems: "center", gap: space.s, minWidth: 0, flex: 1 },
  recordLabel: {
    flex: 1, minWidth: 0, fontWeight: 600,
    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
  },
  recordDetail: {
    display: "flex", gap: space.l, flexWrap: "wrap",
    padding: `0 ${space.m} ${space.m}`,
    fontSize: "12px", color: tokens.colorNeutralForeground2, fontVariantNumeric: "tabular-nums",
  },

  /*
   * GUIDE q14–q16 — the panel widens into up to three side-by-side columns as
   * Seasonality / Negative Prices switch on. `FormPanel`'s drawer is a fixed
   * `min(560px, 100vw)` (outside `src/features/production`, so not adjustable here — see
   * the report), so this scrolls sideways inside that width rather than truly widening
   * the drawer the way the recording's panel does.
   */
  columns: {
    display: "flex", gap: space.l, alignItems: "flex-start", overflowX: "auto",
    [media.belowMd]: { flexDirection: "column", overflowX: "visible" },
  },
  mainColumn: {
    display: "flex", flexDirection: "column", gap: space.m,
    flex: "1 1 260px", minWidth: "240px",
  },
  sideColumn: {
    display: "flex", flexDirection: "column", gap: space.s,
    flex: "0 0 220px", minWidth: "200px",
    borderLeftWidth: "1px", borderLeftStyle: "solid", borderLeftColor: tokens.colorNeutralStroke2,
    paddingLeft: space.l,
    [media.belowMd]: {
      borderLeftWidth: 0, paddingLeft: 0, paddingTop: space.m,
      borderTopWidth: "1px", borderTopStyle: "solid", borderTopColor: tokens.colorNeutralStroke2,
    },
  },
  columnHead: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: space.s },
  columnTitle: { fontSize: "13px", fontWeight: 600 },
  percentRow: { display: "flex", alignItems: "flex-end", gap: space.xs },
  /** GUIDE q16 — `Total Sum [%]`: plain, bold, black. Never the derived-value treatment. */
  totalRow: {
    display: "flex", justifyContent: "space-between", gap: space.s, padding: space.s,
    borderRadius: "4px", backgroundColor: tokens.colorNeutralBackground3,
    fontSize: "12px", fontWeight: 700, fontVariantNumeric: "tabular-nums",
    color: tokens.colorNeutralForeground1,
  },
  /**
   * GUIDE q15/q16 — the "editable calculated default" treatment (Seasonality's
   * Distribution [%], Negative Prices' Reduction [%]): italic, theme-primary blue, the
   * same convention Milestones established. Applied via the `Input` component's `input`
   * SLOT — its only style-override hook — because `NumericInput`/`PercentageInput`
   * expose no className passthrough; see the report for why a thin `Field`+`Input` cell
   * (still validated through `validateCellPercent`, the canvas's own regex for exactly
   * these cells) is used here instead of the shared numeric inputs.
   */
  derivedInput: { color: palette.themePrimary, fontStyle: "italic" },
});

const emptyForm = (): YieldFormState => ({
  description: "",
  windSpeed: "",
  irradiation: "",
  grossYield: "",
  totalLosses: String(NEW_YIELD_DEFAULTS.totalLosses),
  netP50: "",
  uncertainty: String(NEW_YIELD_DEFAULTS.uncertainty),
  netP75: "",
  netP90: "",
  allocationInput: "Input Gross Yield",
  lossesInput: "Input losses",
  uncertaintyInput: "Input Uncertainty",
  allocation: "Whole plant",
  considerSeasonality: false,
  considerNegativePrices: false,
  dirty: new Set<string>(),
});

/** A single percent cell that carries the italic/blue "calculated default" treatment. */
function PercentCell({
  label, value, isStandard, error, onChange, derivedClass,
}: {
  label: string;
  value: string;
  isStandard: boolean;
  error: string | null;
  onChange: (raw: string) => void;
  derivedClass: string;
}) {
  return (
    <Field label={label} validationState={error ? "error" : "none"} validationMessage={error ?? undefined}>
      <Input
        value={value}
        inputMode="decimal"
        input={isStandard ? { className: derivedClass } : undefined}
        onChange={(_, d) => onChange(d.value)}
      />
    </Field>
  );
}

export default function ProductionScreen() {
  const s = useStyles();
  const navigate = useNavigate();
  const { project: selected, canEdit, isLoading: contextLoading } = useProjectContext();
  const projectId = selected?.projectId;
  const locale = useLocale();

  const { project, isLoading: projectLoading } = useProductionProject(projectId);
  const { yields, activeWtg, activePv, isLoading: yieldsLoading } = useEnergyYields(projectId);
  const { revenues } = useProjectRevenues(projectId);
  const { generators, count: turbineCount } = useTurbineCount(projectId);
  const { subaccount } = useOandMSubaccount();
  const countryName = selected?.name ? null : null;
  const assumptions = useRevenueAssumptions(
    // `Assumptions Revenues SQL` is keyed on the country NAME in the canvas.
    (project?.countryId
      ? ((selected as unknown as { countryName?: string } | null)?.countryName ?? null)
      : null) ?? countryName,
    locale,
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panelTech, setPanelTech] = useState<Technology | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<YieldFormState>(emptyForm);
  const [seasonEdits, setSeasonEdits] = useState<SeasonalityRow[] | null>(null);
  const [negativeEdits, setNegativeEdits] = useState<NegativePriceRow[] | null>(null);
  const [confirm, setConfirm] = useState<
    | { kind: "delete"; row: EnergyYieldRow }
    | { kind: "status"; row: EnergyYieldRow; next: 0 | 1 }
    | { kind: "leave" }
    | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  const stored = useStoredSeasonality(editingId);
  const storedNegative = useStoredNegativePrices(editingId);

  const seasonBase = useSeasonalityEditor({
    stored: stored.rows,
    standard: assumptions.seasonality,
    technology: panelTech ?? "WTG",
  });
  const negativeBase = useNegativePriceEditor({
    cod: project?.cod ?? null,
    standard: assumptions.negativePrices,
    technology: panelTech ?? "WTG",
    stored: storedNegative.stored,
  });
  const seasonRows = seasonEdits ?? seasonBase;
  const negativeRows = negativeEdits ?? negativeBase;

  const save = useSaveEnergyYield();
  const del = useDeleteEnergyYield();
  const setStatus = useSetYieldStatus();
  const recalc = useRecalculateProject();

  const selectedRow = yields.find((y) => y.id === selectedId) ?? null;
  const cmdState = commandBarState({ canEdit, project, selected: selectedRow });

  /* Rules 1–5 — the derived fields the panel shows live. */
  const uncertaintyMode = form.uncertaintyInput === "Input Uncertainty";
  const shownP75 = uncertaintyMode
    ? derivedP75(form.netP50, form.uncertainty)
    : numericOr(form.netP75, NaN);
  const shownP90 = uncertaintyMode
    ? derivedP90(form.netP50, form.uncertainty)
    : numericOr(form.netP90, NaN);
  const derivedLosses =
    form.lossesInput === "Input Net Yield p50"
      ? totalLossesPct(numericOr(form.grossYield, 0), numericOr(form.netP50, 0))
      : undefined;

  const effectiveForm: YieldFormState = useMemo(
    () => ({
      ...form,
      totalLosses:
        derivedLosses === undefined ? form.totalLosses : String(Math.round(derivedLosses * 10) / 10),
      netP75: uncertaintyMode && shownP75 !== undefined ? String(shownP75) : form.netP75,
      netP90: uncertaintyMode && shownP90 !== undefined ? String(shownP90) : form.netP90,
    }),
    [form, derivedLosses, uncertaintyMode, shownP75, shownP90],
  );

  const saveable =
    panelTech !== null &&
    canSaveYield({
      form: effectiveForm,
      technology: panelTech,
      seasonality: seasonRows,
      negativePrices: negativeRows.map((r) => ({ value: String(r.reductionValue) })),
      locale,
    });

  const panelErrors = [
    validateTotalLosses(effectiveForm.totalLosses, {
      derived: form.lossesInput === "Input Net Yield p50",
    }),
    validateUncertainty(form.uncertainty),
    validateNetYieldP50(form.netP50),
    validateNetYieldP75(effectiveForm.netP75, {
      mode: form.uncertaintyInput, p50: form.netP50,
    }),
    validateNetYieldP90(effectiveForm.netP90, {
      mode: form.uncertaintyInput, p75: effectiveForm.netP75,
    }),
    form.considerSeasonality && !isSeasonalityValid(seasonRows) ? MSG.seasonalityTotal : null,
  ].filter((e): e is string => e !== null);

  const touch = <K extends keyof YieldFormState>(field: K, value: YieldFormState[K]) =>
    setForm((prev) => {
      const dirty = new Set(prev.dirty);
      dirty.add(String(field));
      return { ...prev, [field]: value, dirty };
    });

  const openPanel = (tech: Technology, row: EnergyYieldRow | null) => {
    setError(null);
    setPanelTech(tech);
    setEditingId(row?.id ?? null);
    setSeasonEdits(null);
    setNegativeEdits(null);
    setForm(
      row
        ? {
            description: row.description ?? "",
            windSpeed: row.windSpeed === null ? "" : String(row.windSpeed),
            irradiation: row.irradiation === null ? "" : String(row.irradiation),
            grossYield: row.grossYield === null ? "" : String(row.grossYield),
            totalLosses: row.totalLosses === null ? "" : String(row.totalLosses),
            netP50: row.netYieldP50 === null ? "" : String(row.netYieldP50),
            uncertainty: row.uncertainty === null ? "" : String(row.uncertainty),
            netP75: row.netYieldP75 === null ? "" : String(row.netYieldP75),
            netP90: row.netYieldP90 === null ? "" : String(row.netYieldP90),
            allocationInput: "Input Gross Yield",
            lossesInput: "Input losses",
            uncertaintyInput: "Input Uncertainty",
            allocation: allocationLabel(row.allocation),
            considerSeasonality: row.considerSeasonality,
            considerNegativePrices: row.considerNegativePrices,
            dirty: new Set<string>(),
          }
        : emptyForm(),
    );
  };

  const closePanel = (force = false) => {
    // Rule 29 — leaving with unsaved work is confirmed.
    if (!force && hasUnsavedChanges(form.dirty)) {
      setConfirm({ kind: "leave" });
      return;
    }
    setPanelTech(null);
    setEditingId(null);
    setSeasonEdits(null);
    setNegativeEdits(null);
  };

  /** Every write path ends by recalculating the project (the hidden canvas button). */
  const runRecalculation = (nextYields: EnergyYieldRow[]) => {
    if (!project) return;
    recalc.mutate(
      {
        project,
        canEdit,
        activeWtg: nextYields.filter(
          (y) => y.type === CHOICE_PRODUCTION.yieldType.wtg && y.status === 0,
        ),
        activePv: nextYields.filter(
          (y) => y.type === CHOICE_PRODUCTION.yieldType.pv && y.status === 0,
        ),
        generators,
        oAndMSubaccountId: subaccount?.vsb_opexsubaccountid ?? null,
        oAndMSubaccountName: subaccount?.vsb_name ?? "Operation & Maintenance",
      },
      { onError: (e) => setError(e.message) },
    );
  };

  const commitSave = () => {
    if (!project || !panelTech) return;
    const existing = yields.find((y) => y.id === editingId) ?? null;
    const tech = panelTech;
    closePanel(true);
    save.mutate(
      {
        project,
        canEdit,
        technology: tech,
        existing,
        description: form.description,
        assessment: CHOICE_PRODUCTION.yieldAssessment.internal,
        allocation: form.allocation,
        modes: {
          allocationInput: form.allocationInput,
          lossesInput: form.lossesInput,
          uncertaintyInput: form.uncertaintyInput,
        },
        input: {
          grossYield: numericOr(form.grossYield, 0),
          netP50: numericOr(form.netP50, 0),
          netP75: numericOr(effectiveForm.netP75, 0),
          netP90: numericOr(effectiveForm.netP90, 0),
          totalLosses: numericOr(effectiveForm.totalLosses, 0),
          uncertainty: numericOr(form.uncertainty, 0),
          windSpeed: tech === "WTG" ? numericOr(form.windSpeed, 0) : null,
          irradiation: tech === "PV" ? numericOr(form.irradiation, 0) : null,
        },
        turbineCount,
        considerSeasonality: form.considerSeasonality,
        considerNegativePrices: form.considerNegativePrices,
        seasonality: seasonRows,
        seasonalityRecordId: stored.recordId,
        negativePrices: negativeRows,
        storedNegativePrices: storedNegative.stored,
        allYields: yields,
        revenues,
      },
      {
        onError: (e) => setError(`${e.source ? `${e.source}: ` : ""}${e.message}`),
        onSuccess: () => runRecalculation(yields),
      },
    );
  };

  const runCommand = (key: ProductionCommandKey) => {
    switch (key) {
      case "newProductionWTG": openPanel("WTG", null); break;
      case "newProductionPV": openPanel("PV", null); break;
      case "editProductionWTG": if (selectedRow) openPanel("WTG", selectedRow); break;
      case "editProductionPV": if (selectedRow) openPanel("PV", selectedRow); break;
      case "deleteProductionItem":
        if (selectedRow) setConfirm({ kind: "delete", row: selectedRow });
        break;
      case "activateProdItem":
        if (selectedRow) setConfirm({ kind: "status", row: selectedRow, next: 0 });
        break;
      case "deactivateProdItem":
        if (selectedRow) setConfirm({ kind: "status", row: selectedRow, next: 1 });
        break;
    }
  };

  // GUIDE q13: selecting a record adds exactly Edit / Delete / Deactivate Production —
  // `commandBarState` already produces that set unchanged; this maps it to `Command`.
  const commands: Command[] = (Object.keys(cmdState) as ProductionCommandKey[]).map((key) => ({
    key,
    label: cmdState[key].label,
    icon:
      key === "deleteProductionItem" ? <DeleteRegular />
      : key === "activateProdItem" ? <PlayRegular />
      : key === "deactivateProdItem" ? <PauseRegular />
      : key.startsWith("edit") ? <EditRegular />
      : <AddRegular />,
    visible: cmdState[key].visible,
    disabled: !cmdState[key].enabled,
    danger: key === "deleteProductionItem",
    primary: key === "newProductionWTG",
    disabledReason: !canEdit
      ? "You do not have edit permission on this project."
      : "Add a generator first — the project has no capacity.",
    onClick: () => runCommand(key),
  }));

  if (!projectId) return <SelectProjectPrompt onGo={() => navigate("/projects")} />;
  if (contextLoading || projectLoading) return <LoadingOverlay mode="inline" />;

  const bullets = pageLock(project);
  const locked = isPageLocked(project);
  const totals = projectYieldTotals(activeWtg, activePv);
  const previewEachTurbine = deriveYieldFields(
    {
      grossYield: numericOr(form.grossYield, 0),
      netP50: numericOr(form.netP50, 0),
      netP75: numericOr(effectiveForm.netP75, 0),
      netP90: numericOr(effectiveForm.netP90, 0),
      totalLosses: numericOr(effectiveForm.totalLosses, 0),
      uncertainty: numericOr(form.uncertainty, 0),
      windSpeed: null,
      irradiation: null,
    },
    form.allocation,
    turbineCount,
  );

  const selectRow = (id: string) => setSelectedId(id === selectedId ? null : id);

  return (
    <div className={s.stack}>
      <PageHeader
        eyebrow="Project"
        title="Production"
        description="Energy-yield assessments, seasonality profiles and negative-price curves."
      />

      {locked && bullets.length > 0 && (
        <MessageBar intent="warning" icon={<LockClosedRegular />}>
          <MessageBarBody>
            <MessageBarTitle>{PAGE_LOCK_TITLE}</MessageBarTitle>
            <div className={s.lock}>
              {bullets.map((b) => (
                <span key={b}>{b}</span>
              ))}
            </div>
          </MessageBarBody>
        </MessageBar>
      )}

      {error && (
        <MessageBar intent="error">
          <MessageBarBody>
            <MessageBarTitle>Save failed</MessageBarTitle>
            {error}
          </MessageBarBody>
        </MessageBar>
      )}

      {assumptions.isError && (
        <MessageBar intent="warning">
          <MessageBarBody>
            The Fabric revenue assumptions could not be read. Seasonality and negative-price
            rows start at zero; everything else still works.
          </MessageBarBody>
        </MessageBar>
      )}

      {/* GUIDE q12: a 2×3 grid led by Gross Yield; a total with no contributing yield
          (e.g. Irradiation with no PV record) renders blank, not "0". */}
      <StatTiles
        stats={[
          { label: SUMMARY_LABELS.grossYield, value: fmtSummaryValue(totals.grossYield, 0) },
          { label: SUMMARY_LABELS.windSpeed, value: fmtSummaryValue(totals.windSpeed, 1) },
          { label: SUMMARY_LABELS.irradiation, value: fmtSummaryValue(totals.irradiation, 1) },
          { label: SUMMARY_LABELS.netP50, value: fmtSummaryValue(totals.netP50, 0) },
          { label: SUMMARY_LABELS.netP75, value: fmtSummaryValue(totals.netP75, 0) },
          { label: SUMMARY_LABELS.netP90, value: fmtSummaryValue(totals.netP90, 0) },
        ]}
      />

      <CommandBar
        commands={commands}
        trailing={
          <Button
            appearance="secondary"
            size="small"
            disabled={!canEdit || recalc.isPending}
            onClick={() => runRecalculation(yields)}
          >
            Recalculate project
          </Button>
        }
      />

      {yieldsLoading ? (
        <LoadingOverlay mode="inline" />
      ) : yields.length === 0 ? (
        <EmptyState
          title="No energy yields yet"
          description="Add a WTG or PV assessment to populate the project's p50, p75 and p90."
        />
      ) : (
        // GUIDE q12/q13: one collapsible row per record — radio, "Production -
        // {description}", an Internal/External chip, an Active/Inactive chip, a chevron.
        // The recording never exercises an inline expansion, so the panel below the
        // chevron keeps this screen's own per-record figures (previously columns on a
        // grid) rather than inventing new content for it.
        <Accordion collapsible multiple>
          {yields.map((row) => {
            const isSelected = row.id === selectedId;
            const assessment = assessmentLabel(row.assessment);
            return (
              <AccordionItem key={row.id} value={row.id}>
                <AccordionHeader expandIconPosition="end" onClick={() => selectRow(row.id)}>
                  <span className={s.recordHead}>
                    {isSelected ? <RadioButtonFilled aria-hidden /> : <RadioButtonRegular aria-hidden />}
                    <span className={s.recordLabel}>{productionRowLabel(row.description)}</span>
                    {assessment !== "" && <StateChip state={assessment} />}
                    <StateChip state={productionStatusLabel(row.status)} />
                  </span>
                </AccordionHeader>
                <AccordionPanel>
                  <div className={s.recordDetail}>
                    <span>{yieldTypeLabel(row.type)}</span>
                    <span>Gross {fmtMwh(row.grossYield)} MWh</span>
                    <span>p50 {fmtMwh(row.netYieldP50)} MWh</span>
                    <span>p75 {fmtMwh(row.netYieldP75)} MWh</span>
                    <span>p90 {fmtMwh(row.netYieldP90)} MWh</span>
                  </div>
                </AccordionPanel>
              </AccordionItem>
            );
          })}
        </Accordion>
      )}

      {recalc.isPending && <LoadingOverlay label="Please wait, saving…." mode="inline" />}

      {/* ONE panel for both technologies. GUIDE q14–q16: the loss/uncertainty form is
          always shown; Seasonality and then Negative Prices columns join it as their
          toggles switch on. */}
      <FormPanel
        open={panelTech !== null}
        title={`${editingId ? "Edit" : "Add"} ${panelTech ?? ""} production`}
        onClose={() => closePanel()}
        onSave={commitSave}
        saveDisabled={!saveable}
        busy={save.isPending}
        errors={panelErrors}
      >
        <div className={s.columns}>
          <div className={s.mainColumn}>
            <Field label="Description" required>
              <Input
                value={form.description}
                onChange={(_, d) => touch("description", d.value)}
              />
            </Field>

            {panelTech === "WTG" ? (
              <NumericInput
                label="Wind speed at hub height [m/s]"
                value={form.windSpeed}
                places={2}
                required
                onChange={(v) => touch("windSpeed", v)}
              />
            ) : (
              <NumericInput
                label="Irradiation [kWh/kWp]"
                value={form.irradiation}
                places={2}
                onChange={(v) => touch("irradiation", v)}
              />
            )}

            <Field label="Allocation">
              <RadioGroup
                layout="horizontal"
                value={form.allocation}
                onChange={(_, d) => touch("allocation", d.value as YieldAllocation)}
              >
                <Radio value="Whole plant" label="Whole plant" />
                <Radio value="Each turbine" label="Each turbine" />
              </RadioGroup>
            </Field>
            {form.allocation === "Each turbine" && (
              <>
                <span className={s.hint}>
                  Figures are per turbine and are multiplied by {turbineCount} on save; losses
                  and uncertainty are cleared.
                </span>
                <div className={s.derived}>
                  <span>Plant gross yield on save</span>
                  <span>{fmtMwh(previewEachTurbine.grossYield)} MWh</span>
                </div>
              </>
            )}

            <Field label="Input mode — irradiation or gross yield">
              <RadioGroup
                layout="horizontal"
                value={form.allocationInput}
                onChange={(_, d) => touch("allocationInput", d.value as AllocationInputMode)}
              >
                <Radio value="Input Irradiation" label="Input Irradiation" />
                <Radio value="Input Gross Yield" label="Input Gross Yield" />
              </RadioGroup>
            </Field>
            <NumericInput
              label="Gross yield [MWh]"
              value={form.grossYield}
              places={0}
              onChange={(v) => touch("grossYield", v)}
            />

            <Field label="Input mode — losses or p50">
              <RadioGroup
                layout="horizontal"
                value={form.lossesInput}
                onChange={(_, d) => touch("lossesInput", d.value as LossesInputMode)}
              >
                <Radio value="Input losses" label="Input losses" />
                <Radio value="Input Net Yield p50" label="Input Net Yield p50" />
              </RadioGroup>
            </Field>
            <div className={s.grid2}>
              <NumericInput
                label="Total losses [%]"
                value={effectiveForm.totalLosses}
                places={1}
                min={0}
                max={100}
                disabled={form.lossesInput === "Input Net Yield p50"}
                rangeMessage={MSG.grossYieldOrder}
                onChange={(v) => touch("totalLosses", v)}
              />
              <NumericInput
                label="Net yield p50 [MWh]"
                value={form.netP50}
                places={0}
                min={0}
                max={2_000_000}
                disabled={form.lossesInput === "Input losses"}
                onChange={(v) => touch("netP50", v)}
              />
            </div>

            <Field label="Input mode — uncertainty or p75/p90">
              <RadioGroup
                layout="horizontal"
                value={form.uncertaintyInput}
                onChange={(_, d) => touch("uncertaintyInput", d.value as UncertaintyInputMode)}
              >
                <Radio value="Input Uncertainty" label="Input Uncertainty" />
                <Radio value="Input Net Yield p75/p90" label="Input Net Yield p75/p90" />
              </RadioGroup>
            </Field>
            <div className={s.grid2}>
              <NumericInput
                label="Uncertainty [%]"
                value={form.uncertainty}
                places={1}
                min={0}
                max={100}
                disabled={!uncertaintyMode}
                rangeMessage={MSG.uncertaintyRange}
                onChange={(v) => touch("uncertainty", v)}
              />
              <NumericInput
                label="Net yield p75 [MWh]"
                value={effectiveForm.netP75}
                places={0}
                disabled={uncertaintyMode}
                onChange={(v) => touch("netP75", v)}
              />
              <NumericInput
                label="Net yield p90 [MWh]"
                value={effectiveForm.netP90}
                places={0}
                disabled={uncertaintyMode}
                onChange={(v) => touch("netP90", v)}
              />
            </div>

            <Switch
              checked={form.considerSeasonality}
              label="Consider seasonality"
              onChange={(_, d) => touch("considerSeasonality", d.checked)}
            />
            <Switch
              checked={form.considerNegativePrices}
              label="Consider negative prices"
              onChange={(_, d) => touch("considerNegativePrices", d.checked)}
            />
          </div>

          {/* GUIDE q15: the Seasonality column — one reset icon for the whole block. */}
          {form.considerSeasonality && (
            <div className={s.sideColumn}>
              <div className={s.columnHead}>
                <span className={s.columnTitle}>Seasonality</span>
                <Tooltip content="Reset every month to the standard assumption" relationship="label" withArrow>
                  <Button
                    appearance="subtle"
                    size="small"
                    icon={<ArrowClockwiseRegular />}
                    aria-label="Reset seasonality to standard"
                    onClick={() =>
                      setSeasonEdits(buildSeasonalityRows(assumptions.seasonality, panelTech ?? "WTG"))
                    }
                  />
                </Tooltip>
              </div>
              <span className={s.hint}>Distribution [%]</span>
              {seasonRows.map((row) => (
                <PercentCell
                  key={row.id}
                  label={row.month}
                  value={String(row.value)}
                  isStandard={row.isStandard}
                  error={validateCellPercent(String(row.value), locale)}
                  derivedClass={s.derivedInput}
                  onChange={(v) => setSeasonEdits(applyMonthEdit(seasonRows, row.id, numericOr(v, 0)))}
                />
              ))}
              <div className={mergeClasses(s.totalRow, !isSeasonalityValid(seasonRows) && s.bad)}>
                <span>Total Sum [%]</span>
                <span>{fmtPercentTotal(seasonalityTotal(seasonRows))}</span>
              </div>
              {!isSeasonalityValid(seasonRows) && <span className={s.bad}>{MSG.seasonalityTotal}</span>}
              <span className={s.hint}>
                Editing any month clears the “standard value” flag on all twelve.
              </span>
            </div>
          )}

          {/* GUIDE q16: the Negative Prices column — a reset icon per row. */}
          {form.considerNegativePrices && (
            <div className={s.sideColumn}>
              <div className={s.columnHead}>
                <span className={s.columnTitle}>Negative Prices</span>
              </div>
              <span className={s.hint}>Reduction [%]</span>
              {!project?.cod && (
                <MessageBar intent="warning">
                  <MessageBarBody>
                    The project has no Operations start date (COD), so the 15-year curve
                    cannot be anchored.
                  </MessageBarBody>
                </MessageBar>
              )}
              {negativeRows.map((row) => (
                <div key={row.year} className={s.percentRow}>
                  <PercentCell
                    label={String(row.year)}
                    value={String(row.reductionValue)}
                    isStandard={row.standardAssumption}
                    error={validateCellPercent(String(row.reductionValue), locale)}
                    derivedClass={s.derivedInput}
                    onChange={(v) =>
                      setNegativeEdits(
                        negativeRows.map((r) =>
                          r.year === row.year
                            ? { ...r, reductionValue: numericOr(v, 0), standardAssumption: false }
                            : r,
                        ),
                      )
                    }
                  />
                  <Tooltip content="Reset this year to the standard assumption" relationship="label" withArrow>
                    <Button
                      appearance="subtle"
                      size="small"
                      icon={<ArrowClockwiseRegular />}
                      aria-label={`Reset ${row.year} to standard`}
                      onClick={() => setNegativeEdits(resetNegativePriceRow(negativeRows, row.year))}
                    />
                  </Tooltip>
                </div>
              ))}
              {negativeRows.some(
                (r) => validateCellPercent(String(r.reductionValue), locale) !== null,
              ) && <span className={s.bad}>{MSG.cellRange}</span>}
            </div>
          )}
        </div>
      </FormPanel>

      <ConfirmDialog
        open={confirm?.kind === "delete"}
        title="Delete energy yield"
        intent="danger"
        confirmLabel="Delete"
        busy={del.isPending}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm?.kind !== "delete" || !project) return;
          const row = confirm.row;
          setConfirm(null);
          setSelectedId(null);
          del.mutate(
            { project, canEdit, row, allYields: yields, revenues },
            {
              onError: (e) => setError(e.message),
              onSuccess: () => runRecalculation(yields.filter((y) => y.id !== row.id)),
            },
          );
        }}
      >
        <Text>
          Revenue contracts that follow the negative-price setting are re-synchronised after
          the delete. Contracts with a manual override are untouched.
        </Text>
      </ConfirmDialog>

      <ConfirmDialog
        open={confirm?.kind === "status"}
        title={
          confirm?.kind === "status" && confirm.next === 1
            ? "Deactivate production"
            : "Activate production"
        }
        confirmLabel="Continue"
        busy={setStatus.isPending}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm?.kind !== "status" || !project) return;
          const { row, next } = confirm;
          setConfirm(null);
          setStatus.mutate(
            { project, canEdit, row, nextStatus: next, allYields: yields, revenues },
            {
              onError: (e) => setError(e.message),
              onSuccess: () =>
                runRecalculation(
                  yields.map((y) => (y.id === row.id ? { ...y, status: next } : y)),
                ),
            },
          );
        }}
      >
        <Text>
          The project's yield roll-up and the revenue negative-price synchronisation both run
          again afterwards.
        </Text>
      </ConfirmDialog>

      <ConfirmDialog
        open={confirm?.kind === "leave"}
        title="Unsaved changes"
        confirmLabel="Leave without saving"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          closePanel(true);
        }}
      >
        <Text>{LEAVE_CONFIRMATION}</Text>
      </ConfirmDialog>
    </div>
  );
}
