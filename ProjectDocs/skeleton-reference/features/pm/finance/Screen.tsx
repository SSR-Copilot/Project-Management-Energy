/**
 * Project Finance Screen — layout and composition only.
 *
 * Canvas screen: `Project Finance Screen` (PM app)
 *   604 controls · 14 328 lines of Power Fx · 186 substantive blocks · band XL
 *
 * Six financing categories as cards, one right panel per category, and a senior-debt
 * tranche sub-grid with its own command bar. Every branch this file takes is a call into
 * `rules.ts`; nothing here decides anything.
 *
 * WHAT WAS DELETED AS A WORKAROUND
 *  - Six collapsible category cards each carrying its own copy of the display formulas
 *    (rules 32–35). One `DataGrid` of categories plus one tranche grid.
 *  - Four right panels that repeat the same `Coalesce(tranche.x, standard.x)` default on
 *    every control (rule 36) — one `fieldDefault` helper.
 *  - `btn_…_Reset_1`, a hidden button `Select`ed three times by
 *    `rad_SeniorDebt_Data_TrancheStatus.OnChange` (rule 37); `resetOnTrancheStatusChange`.
 *  - `locIsVisibleLoadingSpinner` / `locLoadingSpinnerInformationText`, replaced by
 *    `LoadingOverlay`.
 *  - `con_FinancingInput_SeniorDebtCalculationStatus`, hard-coded invisible with its real
 *    predicate commented out (source ambiguity 11). Not ported.
 *
 * SOURCE DEFECT (ambiguity 3) — the canvas `OnVisible` forces
 * `'Financing Options' = 'Debt Financing'` on EVERY visit, silently overwriting an
 * `All Equity` choice. The seed mutation guards it: the write happens only when the column
 * has never been set. See `financingOptionOnVisit` in `rules.ts`.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Field, Input, Switch, Radio, RadioGroup, Text, Button, MessageBar, MessageBarBody,
  MessageBarTitle, makeStyles, tokens,
} from "@fluentui/react-components";
import {
  AddRegular, DeleteRegular, EditRegular, LockClosedRegular, PlayRegular, PauseRegular,
} from "@fluentui/react-icons";
import {
  PageHeader, Card, CommandBar, FormPanel, ConfirmDialog, LoadingOverlay, DataGrid,
  NumericInput, StateChip, StatTiles, SelectProjectPrompt,
  type Command, type Column,
} from "@/components";
import { useProjectContext } from "@/features/shared/useProjectContext";
import { space, media } from "@/theme/tokens";
import { formatDate } from "@/domain/dates";
import { CHOICE_FINANCE } from "@/data/entities";
import {
  PAGE_LOCK_TITLE, pageLock, isPageLocked, CATEGORY_ORDER,
  buildSeniorDebtStandard, buildDsraStandard, buildDecommissioningStandard,
  shareholderLoan, freeEquityLabel, validateFreeEquity,
  applyFinancingOptionCascade, toggleTrancheStatus, toggleDsraStatus, dsraCardToggle,
  buildUniqueKey, isDuplicateTranche, standardAssumptionConflict,
  parseDscr, formatDscr, validateDscr,
  regenerateRepaymentYears, validateRepaymentAmount,
  stepUpFromStorage, stepUpScheduleValid, stepUpYearOptions, stepUpAddEnabled,
  stepUpRemoveEnabled, validateStepUpMargin,
  defaultEndOfDebtServiceSavings, validateEndOfDebtServiceSavings,
  packMMYY, unpackMMYY, mmyyLabel, yearMonthLabel, validateDsraMargin,
  totalDecommissioningCost, endDateOfSaving, fmtDateDots, validateDecommissioningValue,
  validateCostOfGuarantee, validateVatBankMargin, validateVatFacilityAmount,
  canSaveVatFinancing, validateRateField, validateHedging, validateUpfrontFee,
  validateFixedAmount, validateYearMonthPair, validateTenorAgainstRepaymentStart,
  canSaveSeniorDebtTranche, seniorDebtCommandBar, categoryCommandBar,
  bankDisplayName, trancheDisplayName, formatUpfrontFee, baseRateDefault,
  trancheStatusOptionDisabled, TRANCHE_FORM_LABEL, baseRateOptions, BASE_RATE_OPTION_LABEL,
  parseStandardFlags, DEFAULT_SENIOR_DEBT_FLAGS, fmtAmount, fmtPercent, MSG,
  type FinancingCategory, type SeniorDebtFormState, type StepUpRow, type RepaymentRow,
  type TrancheRow, type FinancingInputStatus, type FreeEquityMode,
} from "./rules";
import {
  INPUT_COL, useFinanceProject, useFinancingCategories, useDebtAssumptions, useBanks,
  useKfwTranches, useFinancingInputs, useRepaymentAmounts, useStepUpMargins,
  useTotalDevexCapex, useActiveTurbineCount, useSeedFinancingInputs, useSetFinancingOption,
  useToggleFinancingInputStatus, useSaveSeniorDebtTranche, useDeleteSeniorDebtTranche,
  useSaveFinancingInput, useLocale, toDebtTech, type FinancingInputRow,
} from "./hooks";
import { a11yFor, type A11yAttrs } from "@/a11y";

/** G-A11Y — this screen's canvas accessibility identities. */
const a11y = a11yFor("Project Finance Screen");

/**
 * G-A11Y — a grid column whose cell text carries the canvas display box it reproduces. The
 * text is the column's own `value`, rendered exactly as `DataGrid` would render it bare, so
 * the cell, its `title` tooltip and any sort stay as they were.
 */
function a11yCell<T>(col: Column<T>, attrs: (row: T) => Partial<A11yAttrs>): Column<T> {
  return { ...col, render: (r) => <span {...attrs(r)}>{String(col.value?.(r) ?? "")}</span> };
}

/**
 * G-A11Y — the category grid's summary cell, for the two categories whose summary IS one
 * canvas read-out: VAT financing's bank margin and decommissioning's total cost. Equity and
 * DSRA/DSRF fold several read-outs into one line and the senior-debt tranche count has no
 * canvas box, so those rows carry no identity.
 */
const summaryA11y = (order: number): Partial<A11yAttrs> =>
  order === CATEGORY_ORDER.vatFinancing
    ? a11y("txt_VATFinancingData_BankMargin_1")
    : order === CATEGORY_ORDER.decommissioning
      ? a11y("txt_Decommissioning_Data_Display_Card_Cost_of_Decommissioning_1", "Total Costs of Decommissioning")
      : {};

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
  scheduleRow: {
    display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: space.s, alignItems: "end",
    [media.belowMd]: { gridTemplateColumns: "1fr" },
  },
  /**
   * GUIDE q26 — "Edit Tranche" is a long two-column form and the recording shows it
   * scrolling internally (own scrollbar, content continuing past the visible frame —
   * "Bank Margin - Construction Phase [%]" is cut off even there). `FormPanel`'s
   * `DrawerBody` already carries `overflow: auto`, but the Drawer root sizes to `height:
   * auto` capped at `maxHeight: 100vh`, so a flex child needs its OWN bounded height to
   * reliably become the scrolling region rather than letting the panel grow past the
   * viewport and clip. Scoped to this one panel, not the shared `FormPanel`.
   */
  trancheScrollBody: {
    display: "flex", flexDirection: "column", gap: space.m,
    maxHeight: "calc(100vh - 200px)", overflowY: "auto", overflowX: "hidden",
    paddingRight: space.xs,
  },
});

const num = (v: unknown): number | null => (typeof v === "number" ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const dat = (v: unknown): Date | null => {
  if (typeof v !== "string" || v === "") return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

interface CategoryCard {
  key: string;
  order: number;
  name: string;
  input: FinancingInputRow | null;
  summary: string;
  status: number;
}

export default function ProjectFinanceScreen() {
  const s = useStyles();
  const lang = useLocale();
  const { project: selected, canEdit } = useProjectContext();
  const projectId = selected?.projectId;

  const { project, isLoading: projectLoading } = useFinanceProject(projectId);
  const { categories, map, isLoading: catLoading } = useFinancingCategories();
  const { slices, isError: assumptionsError, isLoading: assumptionsLoading } =
    useDebtAssumptions(project?.countryName ?? null);
  const { inputs, isLoading: inputsLoading } = useFinancingInputs(projectId, categories);
  const repayments = useRepaymentAmounts(projectId);
  const stepUps = useStepUpMargins(projectId);
  const banks = useBanks();
  const kfwOptions = useKfwTranches();
  const totalCapex = useTotalDevexCapex(projectId);
  const activeTurbines = useActiveTurbineCount(projectId);

  const seed = useSeedFinancingInputs(projectId);
  const setOption = useSetFinancingOption(projectId);
  const toggleStatus = useToggleFinancingInputStatus(projectId);
  const saveTranche = useSaveSeniorDebtTranche(projectId);
  const deleteTranche = useDeleteSeniorDebtTranche(projectId);
  const saveInput = useSaveFinancingInput(projectId);

  const tech = project ? toDebtTech(project.technology) : "other";

  /** Rules 3–8 — the three standard-assumption records, rebuilt whenever the slice changes. */
  const standard = useMemo(
    () => (project ? buildSeniorDebtStandard(slices.debt, tech, project, { language: lang }) : null),
    [project, slices.debt, tech, lang],
  );
  const dsraStandard = useMemo(
    () => buildDsraStandard(slices.dsra, tech, { language: lang }),
    [slices.dsra, tech, lang],
  );
  const decStandard = useMemo(
    () => (project
      ? buildDecommissioningStandard(slices.decommissioning, tech, project, { language: lang })
      : null),
    [project, slices.decommissioning, tech, lang],
  );

  /* ────────────────────────────── rule 10: seed the missing rows, exactly once ── */

  const seeded = useRef(false);
  const ready =
    Boolean(project) && !catLoading && !inputsLoading && !assumptionsLoading &&
    !assumptionsError && categories.length > 0;

  useEffect(() => {
    // UT-FIN-100 @ut-ref spec case; no `it()` carries it — this guard lives in the effect,
    // not in rules.ts. Never seed from an unavailable assumption source: the rows would
    // carry blank/NaN values that look like real standard assumptions.
    if (!ready || seeded.current || !project || !canEdit) return;
    seeded.current = true;
    seed.mutate({
      project,
      categories,
      existingCategoryIds: inputs.map((i) => i.categoryId ?? "").filter(Boolean),
      debt: slices.debt,
      dsra: slices.dsra,
      decommissioning: slices.decommissioning,
      language: lang,
    });
    // `seed` is a stable mutation object; re-running on its identity would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, project?.id, canEdit]);

  /* ───────────────────────────────────────────────────────────── local state ── */

  const [panel, setPanel] = useState<
    "none" | "equity" | "vat" | "tranche" | "dsra" | "decommissioning"
  >("none");
  const [selectedTrancheId, setSelectedTrancheId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"none" | "deleteTranche" | "toggleTranche" | "toggleCategory">("none");
  const [pendingToggle, setPendingToggle] = useState<FinancingInputRow | null>(null);
  const [trancheForm, setTrancheForm] = useState<SeniorDebtFormState | null>(null);
  const [trancheError, setTrancheError] = useState<string | null>(null);
  const [repaymentRows, setRepaymentRows] = useState<RepaymentRow[]>([]);
  const [stepUpRows, setStepUpRows] = useState<StepUpRow[]>([]);
  const [equity, setEquity] = useState<{ mode: FreeEquityMode; value: string } | null>(null);
  const [vat, setVat] = useState<{ mode: number; amount: string; bankMargin: string } | null>(null);
  const [dsraForm, setDsraForm] = useState<{
    type: number; margin: string; endOfSavings: Date | null; percentage: string; duration: string;
  } | null>(null);
  const [decForm, setDecForm] = useState<{
    costType: number; value: string; guarantee: string; months: number; years: number;
  } | null>(null);

  /* ─────────────────────────────────────────────────────────── derived rows ── */

  const byOrder = (order: number) => inputs.filter((i) => i.categoryOrder === order);
  const equityInput = byOrder(CATEGORY_ORDER.equity)[0] ?? null;
  const vatInput = byOrder(CATEGORY_ORDER.vatFinancing)[0] ?? null;
  const dsraInput = byOrder(CATEGORY_ORDER.dsraDsrf)[0] ?? null;
  const decInput = byOrder(CATEGORY_ORDER.decommissioning)[0] ?? null;
  const trancheInputs = byOrder(CATEGORY_ORDER.seniorDebt);

  const tranches: TrancheRow[] = trancheInputs.map((i) => ({
    id: i.id,
    trancheStatus: num(i.raw[INPUT_COL.trancheStatus]),
    status: i.status,
    canEdit: i.canEdit && canEdit,
    canDelete: i.canDelete && canEdit,
  }));
  const selectedTranche = tranches.find((t) => t.id === selectedTrancheId) ?? null;
  const trancheBar = seniorDebtCommandBar(tranches, selectedTranche, canEdit);

  const locked = isPageLocked(project);
  const lockBullets = pageLock(project);
  const financingOption =
    project?.financingOptions ?? CHOICE_FINANCE.financingOptions.debtFinancing;

  const equityValueText = String(num(equityInput?.raw[INPUT_COL.freeEquityValue]) ?? "");
  const equityMode: FreeEquityMode =
    num(equityInput?.raw[INPUT_COL.freeEquity]) === CHOICE_FINANCE.freeEquity.fixedValue
      ? "fixed" : "percentage";

  const categoryCards: CategoryCard[] = categories.map((c: FinancingCategory) => {
    const input = byOrder(c.order)[0] ?? null;
    let summary = "";
    if (c.order === CATEGORY_ORDER.equity && input) {
      const mode: FreeEquityMode =
        num(input.raw[INPUT_COL.freeEquity]) === CHOICE_FINANCE.freeEquity.fixedValue
          ? "fixed" : "percentage";
      const v = String(num(input.raw[INPUT_COL.freeEquityValue]) ?? 0);
      summary = `Free equity ${v} ${freeEquityLabel(mode, project?.countryName ?? null)} · `
        + `shareholder loan ${fmtAmount(shareholderLoan(mode, v, totalCapex, lang))}`;
    } else if (c.order === CATEGORY_ORDER.vatFinancing && input) {
      summary = `Bank margin ${fmtPercent(num(input.raw[INPUT_COL.bankMargin]))}`;
    } else if (c.order === CATEGORY_ORDER.seniorDebt) {
      summary = `${trancheInputs.length} tranche(s)`;
    } else if (c.order === CATEGORY_ORDER.dsraDsrf && input) {
      const t = num(input.raw[INPUT_COL.typeDsraDsrf]);
      summary = `${t === CHOICE_FINANCE.dsraDsrfType.dsrf ? "DSRF" : "DSRA"} · `
        + `margin ${fmtPercent(num(input.raw[INPUT_COL.margin]))} · `
        + mmyyLabel(str(input.raw[INPUT_COL.durationOfFutureDebtServiceMmyy]));
    } else if (c.order === CATEGORY_ORDER.decommissioning && input) {
      summary = fmtAmount(totalDecommissioningCost(
        num(input.raw[INPUT_COL.costsOfDecommissioning]) ?? 0,
        num(input.raw[INPUT_COL.costsOfDecommissioningValue]),
        activeTurbines,
      ));
    }
    return {
      key: c.id, order: c.order, name: c.name, input, summary,
      status: input?.status ?? CHOICE_FINANCE.status.active,
    };
  });

  /* ───────────────────────────────────────────────────────── panel openers ── */

  const openEquity = () => {
    setEquity({ mode: equityMode, value: equityValueText });
    setPanel("equity");
  };

  const openVat = () => {
    setVat({
      mode: num(vatInput?.raw[INPUT_COL.vatFacilityAmount])
        ?? CHOICE_FINANCE.vatFacilityAmount.calculated,
      amount: String(num(vatInput?.raw[INPUT_COL.vatFacilityAmountValue]) ?? ""),
      bankMargin: String(num(vatInput?.raw[INPUT_COL.bankMargin]) ?? ""),
    });
    setPanel("vat");
  };

  const openDsra = () => {
    const type = num(dsraInput?.raw[INPUT_COL.typeDsraDsrf]) ?? dsraStandard.type;
    setDsraForm({
      type,
      margin: String(num(dsraInput?.raw[INPUT_COL.margin]) ?? ""),
      endOfSavings: dat(dsraInput?.raw[INPUT_COL.endOfDebtServiceSavings])
        ?? defaultEndOfDebtServiceSavings(
          project?.cod ?? null,
          trancheInputs.map((t) => ({
            tenorYears: num(t.raw[INPUT_COL.tenorDurationYear]),
            tenorMonths: num(t.raw[INPUT_COL.tenorDurationMonth]),
            status: t.status,
          })),
        ),
      percentage: String(num(dsraInput?.raw[INPUT_COL.percentageOfFutureDebtService]) ?? ""),
      duration: str(dsraInput?.raw[INPUT_COL.durationOfFutureDebtServiceMmyy]) ?? "0000",
    });
    setPanel("dsra");
  };

  const openDecommissioning = () => {
    const packed = str(decInput?.raw[INPUT_COL.durationOfSaving]) ?? "0000";
    const { months, years } = unpackMMYY(packed);
    setDecForm({
      costType: num(decInput?.raw[INPUT_COL.costsOfDecommissioning])
        ?? decStandard?.costType ?? CHOICE_FINANCE.costsOfDecommissioning.total,
      value: String(num(decInput?.raw[INPUT_COL.costsOfDecommissioningValue]) ?? ""),
      guarantee: String(num(decInput?.raw[INPUT_COL.costOfGuarantee]) ?? ""),
      months, years,
    });
    setPanel("decommissioning");
  };

  /** Rule 36 — every default is `Coalesce(tranche.x, standard.x)`. */
  const openTranche = (existing: FinancingInputRow | null) => {
    if (!project || !standard) return;
    const raw = existing?.raw ?? {};
    setTrancheError(null);
    const profile = num(raw[INPUT_COL.repaymentProfile]) ?? standard.repaymentProfile;
    const storedRepayments = repayments
      .filter((r) => r.financingInputId === existing?.id)
      .sort((a, b) => a.year - b.year);
    const storedStepUps = stepUps.filter((r) => r.financingInputId === existing?.id);

    setRepaymentRows(storedRepayments.map((r) => ({
      year: r.year, value: String(r.amount), valid: true, dirty: false,
      repaymentAmountRecordId: r.id,
    })));
    setStepUpRows(storedStepUps.length > 0 ? stepUpFromStorage(storedStepUps) : []);

    setTrancheForm({
      formDirty: false, isSaving: false, trancheId: existing?.id ?? null,
      trancheStatus: num(raw[INPUT_COL.trancheStatus]) ?? CHOICE_FINANCE.trancheStatus.termSheet,
      bankId: str(raw[INPUT_COL.bank]),
      bankName: bankDisplayName(str(raw[INPUT_COL.bank]), str(raw[INPUT_COL.otherBankName]), banks),
      otherBankName: str(raw[INPUT_COL.otherBankName]) ?? "",
      kfwEnabled: raw[INPUT_COL.kfwTranche] === CHOICE_FINANCE.yesNo.yes,
      kfwValue: str(raw[INPUT_COL.kfwTrancheValue]),
      financialClose: dat(raw[INPUT_COL.financialClose]) ?? standard.financialClose,
      tenorYears: num(raw[INPUT_COL.tenorDurationYear]) ?? standard.loanTenor,
      tenorMonths: num(raw[INPUT_COL.tenorDurationMonth]) ?? 0,
      drawdown: num(raw[INPUT_COL.drawdown]) ?? standard.drawdown,
      gearing: num(raw[INPUT_COL.gearing]) ?? CHOICE_FINANCE.gearing.debtSizing,
      fixedAmountOption: num(raw[INPUT_COL.fixedAmount]) ?? CHOICE_FINANCE.fixedAmount.percentOfCapex,
      fixedAmountValue: String(num(raw[INPUT_COL.fixedAmountValue]) ?? ""),
      repaymentProfile: profile,
      startRepaymentYears: num(raw[INPUT_COL.startRepaymentYear]) ?? 0,
      startRepaymentMonths:
        num(raw[INPUT_COL.startRepaymentMonth]) ?? standard.repaymentStartAfterCod,
      frequencyOfRepayment: num(raw[INPUT_COL.frequencyOfRepayment]) ?? standard.repaymentFreq,
      hedging: String(num(raw[INPUT_COL.hedging]) ?? standard.hedging),
      upfrontFeeOption: num(raw[INPUT_COL.upfrontFee]) ?? CHOICE_FINANCE.upfrontFee.percentageOfDebt,
      upfrontFeeValue: String(num(raw[INPUT_COL.upfrontFeeValue]) ?? standard.upFrontFee),
      commitmentFeeOption: num(raw[INPUT_COL.commitmentFee]) ?? standard.commitmentFeeDefault,
      commitmentFeeValue: String(
        num(raw[INPUT_COL.commitmentFeeValue]) ?? standard.commitmentFeePercentageOfMargin,
      ),
      commitmentFeePeriodYears: num(raw[INPUT_COL.commitmentFeePeriodYear]) ?? 0,
      commitmentFeePeriodMonths:
        num(raw[INPUT_COL.commitmentFeePeriodMonth]) ?? standard.commitmentFeeFreePeriod,
      swapMargin: String(num(raw[INPUT_COL.swapMargin]) ?? 0),
      bankMarginConstruction: String(
        num(raw[INPUT_COL.bankMarginConstructionPhase]) ?? standard.bankMarginConstruction,
      ),
      bankMarginOperational: String(
        num(raw[INPUT_COL.bankMarginOperationalPhase]) ?? standard.bankMarginOperation,
      ),
      fixedInterestRateYears: num(raw[INPUT_COL.fixedInterestRateYear]) ?? 0,
      fixedInterestRateMonths:
        num(raw[INPUT_COL.fixedInterestRateMonth]) ?? standard.fixedInterestRateTime,
      swapAfterFixedPeriod: raw[INPUT_COL.swapAfterFixedPeriod] === CHOICE_FINANCE.yesNo.yes,
      bankRate: String(num(raw[INPUT_COL.bankRate]) ?? ""),
      baseRate: baseRateDefault(num(raw[INPUT_COL.baseRate]), standard.baserate, project.countryName),
      swapRate: String(num(raw[INPUT_COL.swapRate]) ?? standard.swapRate ?? ""),
      dscrContracted: formatDscr(
        num(raw[INPUT_COL.dscrContractedDecimal]) ?? standard.dscrContracted,
      ),
      dscrUncontracted: formatDscr(
        num(raw[INPUT_COL.dscrUncontractedDecimal]) ?? standard.dscrUncontracted,
      ),
      stepUpEnabled: raw[INPUT_COL.stepUpBankMargin] === CHOICE_FINANCE.yesNo.yes,
      stepUpRows: [],
      repaymentRows: [],
      country: project.countryName,
      otherTranches: trancheInputs
        .filter((t) => t.id !== existing?.id)
        .map((t) => ({
          id: t.id,
          trancheStatus: num(t.raw[INPUT_COL.trancheStatus]),
          uniqueKeyString: t.uniqueKeyString,
        })),
      projectId: project.id,
    });
    setPanel("tranche");
  };

  const patchTranche = (p: Partial<SeniorDebtFormState>) =>
    setTrancheForm((f) => (f ? { ...f, ...p, formDirty: true } : f));

  /** Rule 21 — four handlers regenerate the schedule; all four call this one function. */
  const regenerate = (next: Partial<SeniorDebtFormState>) => {
    if (!trancheForm || !project) return;
    const merged = { ...trancheForm, ...next };
    setRepaymentRows(regenerateRepaymentYears(
      project.cod,
      merged.startRepaymentYears ?? 0, merged.startRepaymentMonths ?? 0,
      merged.tenorYears ?? 0, merged.tenorMonths ?? 0,
      repaymentRows,
      repayments
        .filter((r) => r.financingInputId === trancheForm.trancheId)
        .map((r) => ({ year: r.year, id: r.id })),
    ));
    patchTranche(next);
  };

  const saveTrancheNow = async () => {
    if (!trancheForm || !project || !standard) return;
    setTrancheError(null);

    // Rule 17 — the composed key, then rule 18's duplicate check BEFORE any write.
    const key = buildUniqueKey({
      projectId: project.id,
      statusLabel: trancheForm.trancheStatus === CHOICE_FINANCE.trancheStatus.standardAssumption
        ? "Standard Assumption"
        : trancheForm.trancheStatus === CHOICE_FINANCE.trancheStatus.creditAgreement
          ? "Credit Agreement" : "Term Sheet",
      bankName: trancheForm.bankName,
      bankId: trancheForm.bankId,
      otherBankName: trancheForm.otherBankName,
      kfwEnabled: trancheForm.kfwEnabled,
      kfwValue: trancheForm.kfwValue,
    });
    if (isDuplicateTranche(key, trancheForm.otherTranches, trancheForm.trancheId)) {
      setTrancheError(MSG.duplicateTranche);
      return;
    }

    await saveTranche.mutateAsync({
      trancheId: trancheForm.trancheId,
      projectId: project.id,
      categoryId: map.seniorDebt?.id ?? null,
      fields: {
        [INPUT_COL.name]: `${project.projectName ?? ""}-Senior Debt`,
        [INPUT_COL.uniqueKeyString]: key,
        [INPUT_COL.trancheStatus]: trancheForm.trancheStatus,
        [INPUT_COL.bank]: trancheForm.bankId,
        [INPUT_COL.otherBankName]: trancheForm.otherBankName || null,
        [INPUT_COL.kfwTranche]: trancheForm.kfwEnabled
          ? CHOICE_FINANCE.yesNo.yes : CHOICE_FINANCE.yesNo.no,
        [INPUT_COL.kfwTrancheValue]: trancheForm.kfwValue,
        [INPUT_COL.financialClose]: trancheForm.financialClose?.toISOString() ?? null,
        [INPUT_COL.tenorDurationYear]: trancheForm.tenorYears,
        [INPUT_COL.tenorDurationMonth]: trancheForm.tenorMonths,
        [INPUT_COL.drawdown]: trancheForm.drawdown,
        [INPUT_COL.gearing]: trancheForm.gearing,
        [INPUT_COL.fixedAmount]: trancheForm.fixedAmountOption,
        [INPUT_COL.fixedAmountValue]: Number(trancheForm.fixedAmountValue) || 0,
        [INPUT_COL.repaymentProfile]: trancheForm.repaymentProfile,
        [INPUT_COL.startRepaymentYear]: trancheForm.startRepaymentYears,
        [INPUT_COL.startRepaymentMonth]: trancheForm.startRepaymentMonths,
        [INPUT_COL.frequencyOfRepayment]: trancheForm.frequencyOfRepayment,
        [INPUT_COL.hedging]: Number(trancheForm.hedging) || 0,
        [INPUT_COL.upfrontFee]: trancheForm.upfrontFeeOption,
        [INPUT_COL.upfrontFeeValue]: Number(trancheForm.upfrontFeeValue) || 0,
        [INPUT_COL.commitmentFee]: trancheForm.commitmentFeeOption,
        [INPUT_COL.commitmentFeeValue]: Number(trancheForm.commitmentFeeValue) || 0,
        [INPUT_COL.commitmentFeePeriodYear]: trancheForm.commitmentFeePeriodYears,
        [INPUT_COL.commitmentFeePeriodMonth]: trancheForm.commitmentFeePeriodMonths,
        [INPUT_COL.swapMargin]: Number(trancheForm.swapMargin) || 0,
        [INPUT_COL.bankMarginConstructionPhase]: Number(trancheForm.bankMarginConstruction) || 0,
        [INPUT_COL.bankMarginOperationalPhase]: Number(trancheForm.bankMarginOperational) || 0,
        [INPUT_COL.fixedInterestRateYear]: trancheForm.fixedInterestRateYears,
        [INPUT_COL.fixedInterestRateMonth]: trancheForm.fixedInterestRateMonths,
        [INPUT_COL.swapAfterFixedPeriod]: trancheForm.swapAfterFixedPeriod
          ? CHOICE_FINANCE.yesNo.yes : CHOICE_FINANCE.yesNo.no,
        [INPUT_COL.bankRate]: Number(trancheForm.bankRate) || 0,
        [INPUT_COL.baseRate]: trancheForm.baseRate,
        [INPUT_COL.swapRate]: Number(trancheForm.swapRate) || 0,
        // Rule 20 — the DSCR is stored as the decimal behind the `x`-suffixed string.
        [INPUT_COL.dscrContractedDecimal]: parseDscr(trancheForm.dscrContracted, lang),
        [INPUT_COL.dscrUncontractedDecimal]: parseDscr(trancheForm.dscrUncontracted, lang),
        [INPUT_COL.stepUpBankMargin]: trancheForm.stepUpEnabled
          ? CHOICE_FINANCE.yesNo.yes : CHOICE_FINANCE.yesNo.no,
      },
      repaymentProfile: trancheForm.repaymentProfile,
      repaymentRows,
      storedRepayments: repayments
        .filter((r) => r.financingInputId === trancheForm.trancheId)
        .map((r) => ({ id: r.id, year: r.year })),
      stepUpEnabled: trancheForm.stepUpEnabled,
      stepUpRows,
      storedStepUps: stepUps
        .filter((r) => r.financingInputId === trancheForm.trancheId)
        .map((r) => ({
          id: r.id, order: r.order, startYear: r.startYear, duration: r.duration, margin: r.margin,
        })),
      language: lang,
    });
    setPanel("none");
    setTrancheForm(null);
  };

  /* ─────────────────────────────────────────────────────────────── render ──── */

  if (!selected?.projectId) return <SelectProjectPrompt onGo={() => undefined} />;

  const categoryColumns: Column<CategoryCard>[] = [
    { key: "order", header: "#", width: "48px", value: (r) => String(r.order) },
    { key: "name", header: "Category", width: "minmax(180px, 1.5fr)", value: (r) => r.name },
    a11yCell(
      { key: "summary", header: "Summary", width: "minmax(200px, 2fr)", value: (r) => r.summary },
      (r) => summaryA11y(r.order),
    ),
    {
      key: "status", header: "Status", width: "110px",
      render: (r) => (
        <StateChip state={r.status === CHOICE_FINANCE.status.active ? "Active" : "Inactive"} />
      ),
    },
    {
      key: "actions", header: "", width: "220px", hideBelow: "md",
      render: (r) => {
        const bar = categoryCommandBar(r.order, r.status, canEdit && Boolean(r.input));
        const dsra = dsraCardToggle(r.order, r.status, canEdit && Boolean(r.input));
        const open =
          r.order === CATEGORY_ORDER.equity ? openEquity
            : r.order === CATEGORY_ORDER.vatFinancing ? openVat
              : r.order === CATEGORY_ORDER.dsraDsrf ? openDsra
                : r.order === CATEGORY_ORDER.decommissioning ? openDecommissioning : null;
        return (
          <span style={{ display: "flex", gap: "8px" }}>
            {open && (
              <Button
                size="small" icon={<EditRegular />}
                // The DSRA/DSRF card's own Edit button; the other cards open their panels
                // from canvas controls that set no AccessibleLabel.
                {...(r.order === CATEGORY_ORDER.dsraDsrf ? a11y("con_DSRA_DSRF_Data_Edit") : {})}
                disabled={!canEdit || !r.input}
                onClick={open}
              >
                Edit
              </Button>
            )}
            {dsra.visible && (
              <Button
                size="small"
                icon={r.status === CHOICE_FINANCE.status.active ? <PauseRegular /> : <PlayRegular />}
                {...a11y("con_DSRA_DSRF_Data_Deactivate", dsra.label)}
                disabled={!dsra.enabled}
                onClick={() => { setPendingToggle(r.input); setConfirm("toggleCategory"); }}
              >
                {dsra.label}
              </Button>
            )}
            {bar.deactivate.visible && (
              <Button
                size="small" icon={<PauseRegular />} disabled={!bar.deactivate.enabled}
                onClick={() => { setPendingToggle(r.input); setConfirm("toggleCategory"); }}
              >
                Deactivate
              </Button>
            )}
            {bar.activate.visible && (
              <Button
                size="small" icon={<PlayRegular />} disabled={!bar.activate.enabled}
                onClick={() => { setPendingToggle(r.input); setConfirm("toggleCategory"); }}
              >
                Activate
              </Button>
            )}
          </span>
        );
      },
    },
  ];

  const trancheColumns: Column<FinancingInputRow>[] = [
    {
      key: "name", header: "Tranche", width: "minmax(220px, 2fr)",
      value: (r) => trancheDisplayName(
        num(r.raw[INPUT_COL.trancheStatus]),
        bankDisplayName(str(r.raw[INPUT_COL.bank]), str(r.raw[INPUT_COL.otherBankName]), banks),
        r.raw[INPUT_COL.kfwTranche] === CHOICE_FINANCE.yesNo.yes,
        str(r.raw[INPUT_COL.kfwTrancheValue]),
      ),
    },
    a11yCell({
      key: "tenor", header: "Tenor", width: "150px",
      value: (r) => yearMonthLabel(
        num(r.raw[INPUT_COL.tenorDurationYear]), num(r.raw[INPUT_COL.tenorDurationMonth]),
      ),
    }, () => a11y("txt_SeniorDebt_Data_Display_Card_Tenor")),
    a11yCell({
      key: "fc", header: "Financial close", width: "130px", hideBelow: "md",
      value: (r) => formatDate(dat(r.raw[INPUT_COL.financialClose])),
    }, () => a11y("txt_SeniorDebt_Data_Display_Card_FinancialClose")),
    a11yCell({
      key: "dscr", header: "DSCR (contr.)", width: "120px", align: "end", hideBelow: "lg",
      value: (r) => formatDscr(num(r.raw[INPUT_COL.dscrContractedDecimal])),
    }, () => a11y("txt_SeniorDebt_Data_Display_Card_DSCRContracted")),
    a11yCell({
      key: "upfront", header: "Upfront fee", width: "120px", align: "end", hideBelow: "lg",
      value: (r) => formatUpfrontFee(
        num(r.raw[INPUT_COL.upfrontFee]) ?? CHOICE_FINANCE.upfrontFee.percentageOfDebt,
        num(r.raw[INPUT_COL.upfrontFeeValue]),
      ),
    }, () => a11y("txt_SeniorDebt_Data_Display_Card_UpfrontFee")),
    {
      key: "status", header: "Status", width: "110px",
      render: (r) => (
        <StateChip state={r.status === CHOICE_FINANCE.status.active ? "Active" : "Inactive"} />
      ),
    },
  ];

  const trancheCommands: Command[] = [
    {
      key: "add", label: "Add Tranche", icon: <AddRegular />, primary: true,
      onClick: () => openTranche(null),
      disabled: !trancheBar.add.enabled, disabledReason: trancheBar.add.reason,
    },
    {
      key: "edit", label: "Edit Tranche", icon: <EditRegular />,
      onClick: () => {
        const i = trancheInputs.find((x) => x.id === selectedTrancheId);
        if (i) openTranche(i);
      },
      disabled: !trancheBar.edit.enabled, disabledReason: trancheBar.edit.reason,
    },
    {
      key: "activate", label: "Activate", icon: <PlayRegular />,
      visible: trancheBar.activate.visible,
      onClick: () => {
        setPendingToggle(trancheInputs.find((x) => x.id === selectedTrancheId) ?? null);
        setConfirm("toggleTranche");
      },
      disabled: !trancheBar.activate.enabled,
    },
    {
      key: "deactivate", label: "Deactivate", icon: <PauseRegular />,
      visible: trancheBar.deactivate.visible,
      onClick: () => {
        setPendingToggle(trancheInputs.find((x) => x.id === selectedTrancheId) ?? null);
        setConfirm("toggleTranche");
      },
      disabled: !trancheBar.deactivate.enabled, disabledReason: trancheBar.deactivate.reason,
    },
    {
      key: "delete", label: "Delete", icon: <DeleteRegular />, danger: true,
      onClick: () => setConfirm("deleteTranche"),
      disabled: !trancheBar.delete.enabled, disabledReason: trancheBar.delete.reason,
    },
  ];

  const trancheFormWithChildren: SeniorDebtFormState | null = trancheForm
    ? { ...trancheForm, isSaving: saveTranche.isPending, repaymentRows, stepUpRows }
    : null;

  const trancheErrors: string[] = [];
  if (trancheError) trancheErrors.push(trancheError);
  if (trancheFormWithChildren) {
    if (standardAssumptionConflict(
      trancheFormWithChildren.trancheStatus ?? -1,
      trancheFormWithChildren.otherTranches,
      trancheFormWithChildren.trancheId,
    )) trancheErrors.push(MSG.duplicateStandardAssumption);
    const tenor = validateYearMonthPair(
      trancheFormWithChildren.tenorYears, trancheFormWithChildren.tenorMonths,
    );
    if (!tenor.valid) trancheErrors.push(tenor.message);
    const order = validateTenorAgainstRepaymentStart(
      trancheFormWithChildren.repaymentProfile,
      trancheFormWithChildren.tenorYears,
      trancheFormWithChildren.startRepaymentYears,
    );
    if (!order.valid) trancheErrors.push(order.message);
    if (trancheFormWithChildren.stepUpEnabled
      && !stepUpScheduleValid(stepUpRows, trancheFormWithChildren.fixedInterestRateYears)) {
      trancheErrors.push(MSG.stepUpDuration);
    }
  }

  return (
    <div className={s.stack}>
      <PageHeader
        eyebrow="Project"
        title="Finance"
        description="Debt and equity structuring. Each category is seeded once from the country's debt assumptions; senior debt carries one standard-assumption tranche plus any term sheets and credit agreements."
      />

      {locked && lockBullets.length > 0 && (
        <MessageBar intent="warning">
          <MessageBarBody className={s.lock}>
            <MessageBarTitle><LockClosedRegular /> {PAGE_LOCK_TITLE}</MessageBarTitle>
            {lockBullets.map((b) => <Text key={b}>{b}</Text>)}
          </MessageBarBody>
        </MessageBar>
      )}

      {assumptionsError && (
        <MessageBar intent="error">
          <MessageBarBody>
            <MessageBarTitle>Debt assumptions unavailable</MessageBarTitle>
            No financing inputs are seeded while the assumption source is down — seeding
            them now would write blank values that look like real standard assumptions.
          </MessageBarBody>
        </MessageBar>
      )}

      {seed.isError && (
        <MessageBar intent="error">
          <MessageBarBody>
            <MessageBarTitle>Some financing inputs could not be created</MessageBarTitle>
            {seed.error?.message}
          </MessageBarBody>
        </MessageBar>
      )}

      {!locked && (
        <>
          <StatTiles
            stats={[
              { label: "Total DEVEX/CAPEX", value: fmtAmount(totalCapex), unit: "EUR" },
              { label: "Senior debt tranches", value: String(trancheInputs.length) },
              {
                label: "Active tranches",
                value: String(tranches.filter((t) => t.status === CHOICE_FINANCE.status.active).length),
              },
              { label: "Active turbines", value: String(activeTurbines) },
            ]}
          />

          <Card title="Financing option">
            <RadioGroup
              {...a11y("rad_ProjectFinance_FinancingOptions")}
              layout="horizontal"
              value={String(financingOption)}
              disabled={!canEdit}
              onChange={(_, dt) => {
                const option = Number(dt.value);
                const statuses: FinancingInputStatus[] = inputs.map((i) => ({
                  id: i.id,
                  categoryOrder: i.categoryOrder,
                  status: i.status,
                  trackStatusActive: num(i.raw[INPUT_COL.trackStatusActive]),
                  isDeactivatedByButton: num(i.raw[INPUT_COL.isDeactivatedByButton]),
                  dsraOriginalStatusActive: num(i.raw[INPUT_COL.dsraOriginalStatusActive]),
                }));
                setOption.mutate({
                  option, updates: applyFinancingOptionCascade(statuses, option),
                });
              }}
            >
              <Radio
                value={String(CHOICE_FINANCE.financingOptions.debtFinancing)}
                label="Debt Financing"
              />
              <Radio
                value={String(CHOICE_FINANCE.financingOptions.allEquity)}
                label="All Equity"
              />
            </RadioGroup>
            <Text className={s.hint}>
              Switching to All Equity deactivates every senior-debt tranche, the DSRA/DSRF
              input and VAT financing; switching back restores the statuses each row
              remembers. A category deactivated by hand stays deactivated.
            </Text>
          </Card>

          <Card title="Financing categories" flush>
            <DataGrid
              rows={categoryCards}
              columns={categoryColumns}
              rowKey={(r) => r.key}
              loading={catLoading || inputsLoading}
              emptyMessage="No financing categories are configured."
            />
          </Card>

          <Card title="Senior debt tranches" flush fill>
            <CommandBar commands={trancheCommands} />
            <DataGrid
              rows={trancheInputs}
              columns={trancheColumns}
              rowKey={(r) => r.id}
              loading={inputsLoading}
              selectedKey={selectedTrancheId}
              onRowClick={(r) => setSelectedTrancheId(r.id)}
              emptyMessage="No senior-debt tranches. The standard-assumption tranche is created on first visit."
            />
          </Card>
        </>
      )}

      {/* ─────────────────────────────────────────────────── equity panel ── */}
      <FormPanel
        open={panel === "equity" && equity !== null}
        title="Equity"
        onClose={() => { setPanel("none"); setEquity(null); }}
        closeA11y={a11y("ico_EditEquity_RightPanel_BodyHeaderCancel", "Close")}
        onSave={() => {
          if (!equity || !equityInput) return;
          void saveInput.mutateAsync({
            id: equityInput.id,
            fields: {
              [INPUT_COL.freeEquity]: equity.mode === "fixed"
                ? CHOICE_FINANCE.freeEquity.fixedValue : CHOICE_FINANCE.freeEquity.percentage,
              [INPUT_COL.freeEquityValue]: Number(equity.value) || 0,
              [INPUT_COL.shareholderLoanValue]:
                shareholderLoan(equity.mode, equity.value, totalCapex, lang),
            },
          }).then(() => { setPanel("none"); setEquity(null); });
        }}
        saveDisabled={
          !equity ||
          !validateFreeEquity(equity.value, equity.mode, project?.countryName ?? null, totalCapex, lang).valid
        }
        busy={saveInput.isPending}
        errors={
          equity
            ? [validateFreeEquity(
              equity.value, equity.mode, project?.countryName ?? null, totalCapex, lang,
            ).message].filter(Boolean)
            : []
        }
      >
        {equity && (
          <div className={s.panel}>
            <Field label="Free equity">
              <RadioGroup
                {...a11y("rad_EquityData_FreeEquity", "Free equity")}
                layout="horizontal"
                value={equity.mode}
                onChange={(_, dt) => setEquity({ ...equity, mode: dt.value as FreeEquityMode })}
              >
                <Radio value="percentage" label="Percentage" />
                <Radio value="fixed" label="Fixed Value" />
              </RadioGroup>
            </Field>
            <NumericInput
              label={`Free Equity ${freeEquityLabel(equity.mode, project?.countryName ?? null)}`}
              a11y={a11y(
                "txt_EquityData_FreeEquityEUR",
                `Free Equity ${freeEquityLabel(equity.mode, project?.countryName ?? null)}`,
              )}
              value={equity.value}
              places={equity.mode === "percentage" ? 2 : 0}
              min={0}
              max={equity.mode === "percentage"
                ? 100
                : (project?.countryName === "Poland" ? 500_000_000 : 100_000_000)}
              language={lang}
              onChange={(v) => setEquity({ ...equity, value: v })}
            />
            <Field label="Shareholder loan (derived)">
              <Input
                {...a11y("txt_EquityData_ShareholderLoanEUR", "Shareholder loan (derived)")}
                readOnly
                value={fmtAmount(shareholderLoan(equity.mode, equity.value, totalCapex, lang))}
              />
            </Field>
            <Text className={s.hint}>
              Total DEVEX/CAPEX: {fmtAmount(totalCapex)}. In percentage mode the loan is the
              complement of free equity; in fixed mode it is the CAPEX remainder, floored at zero.
            </Text>
          </div>
        )}
      </FormPanel>

      {/* ────────────────────────────────────────────────────── VAT panel ── */}
      <FormPanel
        open={panel === "vat" && vat !== null}
        title="VAT financing"
        onClose={() => { setPanel("none"); setVat(null); }}
        closeA11y={a11y("ico_EditEquity_RightPanel_BodyHeaderCancel_1", "Close")}
        onSave={() => {
          if (!vat || !vatInput) return;
          void saveInput.mutateAsync({
            id: vatInput.id,
            fields: {
              [INPUT_COL.vatFacilityAmount]: vat.mode,
              [INPUT_COL.vatFacilityAmountValue]:
                vat.mode === CHOICE_FINANCE.vatFacilityAmount.individual
                  ? (Number(vat.amount) || 0) : null,
              [INPUT_COL.bankMargin]: Number(vat.bankMargin) || 0,
            },
          }).then(() => { setPanel("none"); setVat(null); });
        }}
        saveDisabled={
          !vat ||
          !canSaveVatFinancing(
            vat.amount, vat.mode, vat.bankMargin, project?.countryName ?? null, true, lang,
          )
        }
        busy={saveInput.isPending}
      >
        {vat && (
          <div className={s.panel}>
            <Field label="VAT facility amount">
              <RadioGroup
                {...a11y("rad_VATFinancingData_VATfacilityAmount", "VAT facility amount")}
                layout="horizontal"
                value={String(vat.mode)}
                onChange={(_, dt) => setVat({ ...vat, mode: Number(dt.value) })}
              >
                <Radio
                  value={String(CHOICE_FINANCE.vatFacilityAmount.calculated)} label="Calculated"
                />
                <Radio
                  value={String(CHOICE_FINANCE.vatFacilityAmount.individual)} label="Individual"
                />
              </RadioGroup>
            </Field>
            {vat.mode === CHOICE_FINANCE.vatFacilityAmount.calculated ? (
              <Text className={s.hint}>{MSG.vatPreliminary}</Text>
            ) : (
              <NumericInput
                label="Amount"
                a11y={a11y("txt_VATFinancingData_VATFacilityAmountEUR", "Amount")}
                value={vat.amount}
                places={0}
                min={0}
                max={project?.countryName === "Poland" ? 500_000_000 : 100_000_000}
                required
                language={lang}
                rangeMessage={
                  validateVatFacilityAmount(
                    vat.amount, vat.mode, project?.countryName ?? null, lang,
                  ).message
                }
                onChange={(v) => setVat({ ...vat, amount: v })}
              />
            )}
            <NumericInput
              label="Bank Margin [%]"
              a11y={a11y("txt_VATFinancingData_BankMargin", "Bank Margin [%]")}
              value={vat.bankMargin}
              places={2}
              min={0}
              max={10}
              required
              language={lang}
              rangeMessage={validateVatBankMargin(vat.bankMargin, lang).message}
              onChange={(v) => setVat({ ...vat, bankMargin: v })}
            />
          </div>
        )}
      </FormPanel>

      {/* ───────────────────────────────────────────────── DSRA/DSRF panel ── */}
      <FormPanel
        open={panel === "dsra" && dsraForm !== null}
        title="Debt Service Reserve Account / Facility"
        onClose={() => { setPanel("none"); setDsraForm(null); }}
        closeA11y={a11y("ico_EditDSRA_DRSF_RightPanel_BodyHeaderCancel", "Close")}
        onSave={() => {
          if (!dsraForm || !dsraInput) return;
          void saveInput.mutateAsync({
            id: dsraInput.id,
            fields: {
              [INPUT_COL.typeDsraDsrf]: dsraForm.type,
              [INPUT_COL.margin]: Number(dsraForm.margin) || 0,
              [INPUT_COL.endOfDebtServiceSavings]: dsraForm.endOfSavings?.toISOString() ?? null,
              [INPUT_COL.percentageOfFutureDebtService]: Number(dsraForm.percentage) || 0,
              [INPUT_COL.durationOfFutureDebtServiceMmyy]: dsraForm.duration,
              // Rule 28 — the DSRF-only fields are blanked for a DSRA. `dsrfOnlyFields`
              // supplies them on the seed path; here the panel does not expose them,
              // so nothing DSRF-specific is written from a DSRA form.
            },
          }).then(() => { setPanel("none"); setDsraForm(null); });
        }}
        saveDisabled={
          !dsraForm ||
          !validateDsraMargin(dsraForm.margin, dsraForm.type, lang).valid ||
          !validateEndOfDebtServiceSavings(dsraForm.endOfSavings, project?.cod ?? null).valid
        }
        busy={saveInput.isPending}
        errors={
          dsraForm
            ? [
              validateDsraMargin(dsraForm.margin, dsraForm.type, lang).message,
              validateEndOfDebtServiceSavings(dsraForm.endOfSavings, project?.cod ?? null).message,
            ].filter(Boolean)
            : []
        }
      >
        {dsraForm && (
          <div className={s.panel}>
            <Field label="Type">
              <RadioGroup
                {...a11y("rad_DSRA_DRSFData_DSRA_DRSF_Type", "Type")}
                layout="horizontal"
                value={String(dsraForm.type)}
                onChange={(_, dt) => setDsraForm({ ...dsraForm, type: Number(dt.value) })}
              >
                <Radio value={String(CHOICE_FINANCE.dsraDsrfType.dsra)} label="DSRA" />
                <Radio value={String(CHOICE_FINANCE.dsraDsrfType.dsrf)} label="DSRF" />
              </RadioGroup>
            </Field>
            <NumericInput
              label="Margin [%]"
              a11y={a11y("txt_DSRA_DRSFData_Margin", "Margin [%]")}
              value={dsraForm.margin}
              places={2}
              min={dsraForm.type === CHOICE_FINANCE.dsraDsrfType.dsra ? -5 : 0}
              max={10}
              language={lang}
              onChange={(v) => setDsraForm({ ...dsraForm, margin: v })}
            />
            <Field label="End of debt service savings">
              <Input
                {...a11y("dte_DSRA_DRSFData_End_of_debt_service_savings", "End of debt service savings")}
                type="date"
                value={dsraForm.endOfSavings ? dsraForm.endOfSavings.toISOString().slice(0, 10) : ""}
                onChange={(_, dt) =>
                  setDsraForm({ ...dsraForm, endOfSavings: dt.value ? new Date(dt.value) : null })}
              />
            </Field>
            <NumericInput
              label="Percentage of future debt service [%]"
              a11y={a11y("txt_DSRA_DRSFData_POFDS_Fee_Percentage", "Percentage of future debt service [%]")}
              value={dsraForm.percentage}
              places={2} min={0} max={100} language={lang}
              onChange={(v) => setDsraForm({ ...dsraForm, percentage: v })}
            />
            <div className={s.grid2}>
              <Field label="Duration of future debt service (years)">
                <select
                  {...a11y(
                    "cmb_DSRA_DRSFData_Duration_of_furture_debt_service_YY",
                    "Duration of future debt service (years)",
                  )}
                  value={unpackMMYY(dsraForm.duration).years}
                  onChange={(e) => setDsraForm({
                    ...dsraForm,
                    duration: packMMYY(unpackMMYY(dsraForm.duration).months, Number(e.target.value)),
                  })}
                >
                  {Array.from({ length: 41 }, (_, i) => i).map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </Field>
              <Field label="Duration of future debt service (months)">
                <select
                  {...a11y(
                    "cmb_DSRA_DRSFData_Duration_of_furture_debt_service_MM",
                    "Duration of future debt service (months)",
                  )}
                  value={unpackMMYY(dsraForm.duration).months}
                  onChange={(e) => setDsraForm({
                    ...dsraForm,
                    duration: packMMYY(Number(e.target.value), unpackMMYY(dsraForm.duration).years),
                  })}
                >
                  {Array.from({ length: 12 }, (_, i) => i).map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </Field>
            </div>
            <Text className={s.hint}>Stored as MMYY: {dsraForm.duration} — {mmyyLabel(dsraForm.duration)}</Text>
          </div>
        )}
      </FormPanel>

      {/* ───────────────────────────────────────── decommissioning panel ── */}
      <FormPanel
        open={panel === "decommissioning" && decForm !== null}
        title="Decommissioning"
        onClose={() => { setPanel("none"); setDecForm(null); }}
        closeA11y={a11y("Icon5", "Close")}
        onSave={() => {
          if (!decForm || !decInput) return;
          void saveInput.mutateAsync({
            id: decInput.id,
            fields: {
              [INPUT_COL.costsOfDecommissioning]: decForm.costType,
              [INPUT_COL.costsOfDecommissioningValue]: Number(decForm.value) || 0,
              [INPUT_COL.costOfGuarantee]: Number(decForm.guarantee) || 0,
              [INPUT_COL.durationOfSaving]: packMMYY(decForm.months, decForm.years),
            },
          }).then(() => { setPanel("none"); setDecForm(null); });
        }}
        saveDisabled={
          !decForm ||
          !validateDecommissioningValue(
            decForm.value, decForm.costType, project?.countryName ?? null, lang,
          ).valid ||
          !validateCostOfGuarantee(decForm.guarantee, lang).valid
        }
        busy={saveInput.isPending}
      >
        {decForm && (
          <div className={s.panel}>
            <Field label="Costs of decommissioning">
              <RadioGroup
                {...a11y("rad_DecommissioningData_CostsOfDecommissioning_1", "Costs of decommissioning")}
                layout="horizontal"
                value={String(decForm.costType)}
                onChange={(_, dt) => setDecForm({ ...decForm, costType: Number(dt.value) })}
              >
                <Radio
                  value={String(CHOICE_FINANCE.costsOfDecommissioning.total)} label="Total"
                />
                <Radio
                  value={String(CHOICE_FINANCE.costsOfDecommissioning.perTurbine)}
                  label="Per Turbine"
                />
              </RadioGroup>
            </Field>
            <NumericInput
              label="Value"
              a11y={a11y("txt_DecommissioningData_Costs_Of_Decommissioning_Value_1", "Value")}
              value={decForm.value}
              places={0}
              min={0}
              language={lang}
              rangeMessage={validateDecommissioningValue(
                decForm.value, decForm.costType, project?.countryName ?? null, lang,
              ).message}
              onChange={(v) => setDecForm({ ...decForm, value: v })}
            />
            <Field label="Total cost (derived)">
              <Input
                readOnly
                value={fmtAmount(totalDecommissioningCost(
                  decForm.costType, Number(decForm.value) || 0, activeTurbines,
                ))}
              />
            </Field>
            <NumericInput
              label="Cost of Guarantee [%]"
              a11y={a11y("txt_DecommissioningData_Cost_of_Guarantee_Percentage_1", "Cost of Guarantee [%]")}
              value={decForm.guarantee}
              places={1} min={0} max={9.9} language={lang}
              onChange={(v) => setDecForm({ ...decForm, guarantee: v })}
            />
            <div className={s.grid2}>
              <Field label="Duration of saving (years)">
                <select
                  {...a11y("cmb_DecommissioningData_Duration_of_Saving_YY_1", "Duration of saving (years)")}
                  value={decForm.years}
                  onChange={(e) => setDecForm({ ...decForm, years: Number(e.target.value) })}
                >
                  {Array.from({ length: 41 }, (_, i) => i).map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </Field>
              <Field label="Duration of saving (months)">
                <select
                  {...a11y("cmb_DecommissioningData_Duration_of_Saving_MM_1", "Duration of saving (months)")}
                  value={decForm.months}
                  onChange={(e) => setDecForm({ ...decForm, months: Number(e.target.value) })}
                >
                  {Array.from({ length: 12 }, (_, i) => i).map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="End date of saving (derived)">
              <Input
                {...a11y("txt_DecommissioningData_End_Date_of_Saving_1", "End date of saving (derived)")}
                readOnly
                value={fmtDateDots(endDateOfSaving(
                  dat(decInput?.raw[INPUT_COL.startDateOfSaving]) ?? project?.cod ?? null,
                  decForm.months, decForm.years,
                ))}
              />
            </Field>
          </div>
        )}
      </FormPanel>

      {/* ────────────────────────────────────────── senior-debt tranche ── */}
      <FormPanel
        open={panel === "tranche" && trancheFormWithChildren !== null}
        title={trancheForm?.trancheId ? "Edit senior-debt tranche" : "New senior-debt tranche"}
        onClose={() => { setPanel("none"); setTrancheForm(null); setTrancheError(null); }}
        closeA11y={a11y("ico_EditEquity_RightPanel_BodyHeaderCancel_2", "Close")}
        onSave={() => void saveTrancheNow()}
        saveDisabled={
          !trancheFormWithChildren || !canSaveSeniorDebtTranche(trancheFormWithChildren, lang)
        }
        busy={saveTranche.isPending}
        errors={trancheErrors}
      >
        {trancheFormWithChildren && (
          <div className={s.trancheScrollBody}>
            <Field label={TRANCHE_FORM_LABEL.status} required>
              <RadioGroup
                {...a11y("rad_SeniorDebt_Data_TrancheStatus", TRANCHE_FORM_LABEL.status)}
                value={String(trancheFormWithChildren.trancheStatus)}
                onChange={(_, dt) => patchTranche({ trancheStatus: Number(dt.value) })}
              >
                {/* GUIDE q26: once Credit Agreement is selected, the two earlier draft
                    statuses grey out rather than letting the record step backwards. */}
                <Radio
                  value={String(CHOICE_FINANCE.trancheStatus.standardAssumption)}
                  label="Standard Assumption"
                  disabled={trancheStatusOptionDisabled(
                    trancheFormWithChildren.trancheStatus,
                    CHOICE_FINANCE.trancheStatus.standardAssumption,
                  )}
                />
                <Radio
                  value={String(CHOICE_FINANCE.trancheStatus.termSheet)}
                  label="Term Sheet"
                  disabled={trancheStatusOptionDisabled(
                    trancheFormWithChildren.trancheStatus,
                    CHOICE_FINANCE.trancheStatus.termSheet,
                  )}
                />
                <Radio
                  value={String(CHOICE_FINANCE.trancheStatus.creditAgreement)}
                  label="Credit Agreement"
                />
              </RadioGroup>
            </Field>

            {trancheFormWithChildren.trancheStatus
              !== CHOICE_FINANCE.trancheStatus.standardAssumption && (
              <>
                <Field label={TRANCHE_FORM_LABEL.bank} required>
                  <select
                    // The live canvas copy: the save and the "Other" gate read the ComboBox;
                    // the DropDown under it is a leftover nothing reads.
                    {...a11y("cmb_SeniorDebt_Data_Bank", TRANCHE_FORM_LABEL.bank)}
                    value={trancheFormWithChildren.bankId ?? ""}
                    onChange={(e) => {
                      const id = e.target.value;
                      patchTranche({
                        bankId: id || null,
                        bankName: banks.find((b) => b.id === id)?.bankname ?? null,
                      });
                    }}
                  >
                    <option value="">—</option>
                    {banks.map((b) => <option key={b.id} value={b.id}>{b.bankname}</option>)}
                  </select>
                </Field>
                {(trancheFormWithChildren.bankName ?? "").trim().toLowerCase() === "other" && (
                  <Field label="Bank name" required>
                    <Input
                      {...a11y("txt_SeniorDebtData_BankName", "Bank name")}
                      value={trancheFormWithChildren.otherBankName}
                      onChange={(_, dt) => patchTranche({ otherBankName: dt.value })}
                    />
                  </Field>
                )}
              </>
            )}

            <Switch
              label={TRANCHE_FORM_LABEL.kfwTranche}
              {...a11y("tgl_SeniorDebt_Data_KfW_Tranche", TRANCHE_FORM_LABEL.kfwTranche)}
              checked={trancheFormWithChildren.kfwEnabled}
              onChange={(_, dt) => patchTranche({ kfwEnabled: dt.checked })}
            />
            {trancheFormWithChildren.kfwEnabled && (
              // GUIDE q26: the recording repeats "KfW-Tranche" as the value dropdown's
              // label too, rather than "KfW tranche value".
              <Field label={TRANCHE_FORM_LABEL.kfwTranche} required>
                <select
                  {...a11y("drp_SeniorDebt_Data_KfW_Tranche_Value", TRANCHE_FORM_LABEL.kfwTranche)}
                  value={trancheFormWithChildren.kfwValue ?? ""}
                  onChange={(e) => patchTranche({ kfwValue: e.target.value || null })}
                >
                  <option value="">—</option>
                  {kfwOptions.map((k) => <option key={k} value={k}>{k}</option>)}
                </select>
              </Field>
            )}

            <div className={s.section}>
              <span className={s.sectionTitle}>Term</span>
              <Field label={TRANCHE_FORM_LABEL.financialClose} required>
                <Input
                  {...a11y("dte_SeniorDebt_Data_Financial_Close", TRANCHE_FORM_LABEL.financialClose)}
                  type="date"
                  value={trancheFormWithChildren.financialClose
                    ? trancheFormWithChildren.financialClose.toISOString().slice(0, 10) : ""}
                  onChange={(_, dt) =>
                    patchTranche({ financialClose: dt.value ? new Date(dt.value) : null })}
                />
              </Field>
              <div className={s.grid2}>
                <Field label={`${TRANCHE_FORM_LABEL.tenor} (years)`} required>
                  <select
                    {...a11y("Drp_SeniorDebtData_Tenor_YY", `${TRANCHE_FORM_LABEL.tenor} (years)`)}
                    value={trancheFormWithChildren.tenorYears ?? 0}
                    onChange={(e) => regenerate({ tenorYears: Number(e.target.value) })}
                  >
                    {Array.from({ length: 41 }, (_, i) => i).map((y) => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </Field>
                <Field label={`${TRANCHE_FORM_LABEL.tenor} (months)`} required>
                  <select
                    {...a11y("drp_SeniorDebtData_Tenor_MM", `${TRANCHE_FORM_LABEL.tenor} (months)`)}
                    value={trancheFormWithChildren.tenorMonths ?? 0}
                    onChange={(e) => regenerate({ tenorMonths: Number(e.target.value) })}
                  >
                    {Array.from({ length: 12 }, (_, i) => i).map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Start repayment (years)">
                  <select
                    {...a11y("Drp_SeniorDebtData_StartRepayment_YY", "Start repayment (years)")}
                    value={trancheFormWithChildren.startRepaymentYears ?? 0}
                    onChange={(e) => regenerate({ startRepaymentYears: Number(e.target.value) })}
                  >
                    {Array.from({ length: 41 }, (_, i) => i).map((y) => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Start repayment (months)">
                  <select
                    {...a11y("Drp_SeniorDebtData_StartRepayment_MM", "Start repayment (months)")}
                    value={trancheFormWithChildren.startRepaymentMonths ?? 0}
                    onChange={(e) => regenerate({ startRepaymentMonths: Number(e.target.value) })}
                  >
                    {Array.from({ length: 12 }, (_, i) => i).map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </Field>
              </div>
            </div>

            {/* GUIDE q26: Drawdown radio — present in state (`SeniorDebtFormState.drawdown`,
                already written on save) but the panel never rendered a control for it. */}
            <Field label={TRANCHE_FORM_LABEL.drawdown} required>
              <RadioGroup
                {...a11y("rad_SeniorDebt_Data_Drawdown", TRANCHE_FORM_LABEL.drawdown)}
                layout="horizontal"
                value={String(trancheFormWithChildren.drawdown)}
                onChange={(_, dt) => patchTranche({ drawdown: Number(dt.value) })}
              >
                <Radio value={String(CHOICE_FINANCE.drawdown.equityFirst)} label="Equity First" />
                <Radio value={String(CHOICE_FINANCE.drawdown.proRata)} label="Pro Rata" />
              </RadioGroup>
            </Field>

            <div className={s.section}>
              <span className={s.sectionTitle}>Sizing</span>
              <Field label="Gearing">
                <RadioGroup
                  // Canvas caption "This is Eror Message" is a copy-paste defect.
                  {...a11y("rad_SeniorDebtData_Gearing", "Gearing")}
                  layout="horizontal"
                  value={String(trancheFormWithChildren.gearing)}
                  onChange={(_, dt) => patchTranche({ gearing: Number(dt.value) })}
                >
                  <Radio value={String(CHOICE_FINANCE.gearing.debtSizing)} label="Debt Sizing" />
                  <Radio value={String(CHOICE_FINANCE.gearing.fixedAmount)} label="Fixed Amount" />
                </RadioGroup>
              </Field>
              {trancheFormWithChildren.gearing === CHOICE_FINANCE.gearing.fixedAmount && (
                <NumericInput
                  label="Fixed amount value"
                  a11y={a11y("txt_SeniorDebtData_FixedAmountValue", "Fixed amount value")}
                  value={trancheFormWithChildren.fixedAmountValue}
                  places={
                    trancheFormWithChildren.fixedAmountOption
                      === CHOICE_FINANCE.fixedAmount.percentOfCapex ? 1 : 0
                  }
                  min={0}
                  language={lang}
                  rangeMessage={validateFixedAmount(
                    trancheFormWithChildren.fixedAmountValue,
                    trancheFormWithChildren.fixedAmountOption,
                    project?.countryName ?? null, lang,
                  ).message}
                  onChange={(v) => patchTranche({ fixedAmountValue: v })}
                />
              )}
              {trancheFormWithChildren.gearing === CHOICE_FINANCE.gearing.debtSizing && (
                <>
                  <span className={s.sectionTitle}>{TRANCHE_FORM_LABEL.dscr}</span>
                  <div className={s.grid2}>
                    <Field
                      label={TRANCHE_FORM_LABEL.dscrContracted}
                      required
                      validationMessage={validateDscr(trancheFormWithChildren.dscrContracted, lang).message}
                    >
                      <Input
                        {...a11y("txt_SeniorDebt_Data_DSCR_Contracted", TRANCHE_FORM_LABEL.dscrContracted)}
                        value={trancheFormWithChildren.dscrContracted}
                        onChange={(_, dt) => patchTranche({ dscrContracted: dt.value })}
                      />
                    </Field>
                    <Field
                      label={TRANCHE_FORM_LABEL.dscrUncontracted}
                      validationMessage={validateDscr(trancheFormWithChildren.dscrUncontracted, lang).message}
                    >
                      <Input
                        {...a11y("txt_SeniorDebtData_DSCR_Uncontracted", TRANCHE_FORM_LABEL.dscrUncontracted)}
                        value={trancheFormWithChildren.dscrUncontracted}
                        onChange={(_, dt) => patchTranche({ dscrUncontracted: dt.value })}
                      />
                    </Field>
                  </div>
                </>
              )}
            </div>

            <div className={s.section}>
              <span className={s.sectionTitle}>Pricing</span>
              <div className={s.grid2}>
                <NumericInput
                  label={TRANCHE_FORM_LABEL.bankMarginConstruction}
                  a11y={a11y(
                    "txt_SeniorDebtData_BankMargin_ConstructionPhase",
                    TRANCHE_FORM_LABEL.bankMarginConstruction,
                  )}
                  value={trancheFormWithChildren.bankMarginConstruction}
                  places={2} min={0} max={10} required language={lang}
                  rangeMessage={validateRateField(trancheFormWithChildren.bankMarginConstruction, lang).message}
                  onChange={(v) => patchTranche({ bankMarginConstruction: v })}
                />
                <NumericInput
                  label={TRANCHE_FORM_LABEL.bankMarginOperational}
                  a11y={a11y(
                    "txt_SeniorDebtData_BankMargin_OperationalPhase",
                    TRANCHE_FORM_LABEL.bankMarginOperational,
                  )}
                  value={trancheFormWithChildren.bankMarginOperational}
                  places={2} min={0} max={10} required language={lang}
                  onChange={(v) => patchTranche({ bankMarginOperational: v })}
                />
                <NumericInput
                  label="Swap margin [%]"
                  // The canvas names are crossed: `'Swap Margin [%]'` is written from the
                  // `…_SwapRate` box (and `'Swap Rate'` from `…_SwapMargin`) — wired by column.
                  a11y={a11y("txt_SeniorDebtData_SwapRate", "Swap margin [%]")}
                  value={trancheFormWithChildren.swapMargin}
                  places={2} min={0} max={10} required language={lang}
                  onChange={(v) => patchTranche({ swapMargin: v })}
                />
                <NumericInput
                  label="Hedging [%]"
                  a11y={a11y("txt_SeniorDebtData_Hedging", "Hedging [%]")}
                  value={trancheFormWithChildren.hedging}
                  places={1} min={0} max={100} required language={lang}
                  rangeMessage={validateHedging(trancheFormWithChildren.hedging, lang).message}
                  onChange={(v) => patchTranche({ hedging: v })}
                />
              </div>

              {/* GUIDE q26: Upfront Fee is a radio choice (Percentage of Debt / Fixed)
                  ahead of its value — the option was already in state and written on
                  save, but never had a control. */}
              <Field label={TRANCHE_FORM_LABEL.upfrontFee} required>
                <RadioGroup
                  {...a11y("rad_SeniorDebtData_UpfrontFee", TRANCHE_FORM_LABEL.upfrontFee)}
                  layout="horizontal"
                  value={String(trancheFormWithChildren.upfrontFeeOption)}
                  onChange={(_, dt) => patchTranche({ upfrontFeeOption: Number(dt.value) })}
                >
                  <Radio
                    value={String(CHOICE_FINANCE.upfrontFee.percentageOfDebt)}
                    label="Percentage of Debt"
                  />
                  <Radio value={String(CHOICE_FINANCE.upfrontFee.fixed)} label="Fixed" />
                </RadioGroup>
              </Field>
              <NumericInput
                label={TRANCHE_FORM_LABEL.upfrontFeeValue}
                a11y={a11y("txt_SeniorDebtData_UpfrontFeeValue", TRANCHE_FORM_LABEL.upfrontFeeValue)}
                value={trancheFormWithChildren.upfrontFeeValue}
                places={
                  trancheFormWithChildren.upfrontFeeOption
                    === CHOICE_FINANCE.upfrontFee.percentageOfDebt ? 2 : 0
                }
                min={0} required language={lang}
                rangeMessage={validateUpfrontFee(
                  trancheFormWithChildren.upfrontFeeValue,
                  trancheFormWithChildren.upfrontFeeOption,
                  project?.countryName ?? null, lang,
                ).message}
                onChange={(v) => patchTranche({ upfrontFeeValue: v })}
              />

              {/* GUIDE q26: Commitment Fee, the same shape — a radio choice (Percentage
                  of Margin / Percentage) ahead of its value, plus the free-period pair
                  that had no field at all (`commitmentFeeOption`/`…PeriodYears`/
                  `…PeriodMonths` are new on `SeniorDebtFormState`). */}
              <Field label={TRANCHE_FORM_LABEL.commitmentFee} required>
                <RadioGroup
                  {...a11y("rad_SeniorDebtData_CommitmentFee", TRANCHE_FORM_LABEL.commitmentFee)}
                  layout="horizontal"
                  value={String(trancheFormWithChildren.commitmentFeeOption)}
                  onChange={(_, dt) => patchTranche({ commitmentFeeOption: Number(dt.value) })}
                >
                  <Radio
                    value={String(CHOICE_FINANCE.commitmentFee.percentageOfMargin)}
                    label="Percentage of Margin"
                  />
                  <Radio
                    value={String(CHOICE_FINANCE.commitmentFee.percentage)}
                    label="Percentage"
                  />
                </RadioGroup>
              </Field>
              <NumericInput
                label={TRANCHE_FORM_LABEL.commitmentFeeValue}
                a11y={a11y("txt_SeniorDebtData_Commitment_Fee_Value", TRANCHE_FORM_LABEL.commitmentFeeValue)}
                value={trancheFormWithChildren.commitmentFeeValue}
                places={2} min={0} max={100} required language={lang}
                onChange={(v) => patchTranche({ commitmentFeeValue: v })}
              />
              <div className={s.grid2}>
                <Field label={`${TRANCHE_FORM_LABEL.commitmentFeeFreePeriod} (years)`}>
                  <select
                    {...a11y(
                      "Drp_SeniorDebtData_Commitment_Fee_Free_Period_YY",
                      `${TRANCHE_FORM_LABEL.commitmentFeeFreePeriod} (years)`,
                    )}
                    value={trancheFormWithChildren.commitmentFeePeriodYears ?? 0}
                    onChange={(e) =>
                      patchTranche({ commitmentFeePeriodYears: Number(e.target.value) })}
                  >
                    {Array.from({ length: 41 }, (_, i) => i).map((y) => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </Field>
                <Field label={`${TRANCHE_FORM_LABEL.commitmentFeeFreePeriod} (months)`}>
                  <select
                    {...a11y(
                      "Drp_SeniorDebtData_Commitment_Fee_Free_Period_MM",
                      `${TRANCHE_FORM_LABEL.commitmentFeeFreePeriod} (months)`,
                    )}
                    value={trancheFormWithChildren.commitmentFeePeriodMonths ?? 0}
                    onChange={(e) =>
                      patchTranche({ commitmentFeePeriodMonths: Number(e.target.value) })}
                  >
                    {Array.from({ length: 12 }, (_, i) => i).map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </Field>
              </div>
            </div>

            {/* GUIDE q26: "Interest Rate" — Base Rate is a radio (Euribor/Wibor 1M/3M/6M
                by country) that had no control at all, and Swap Rate is shown here
                unconditionally, matching the recording; Bank Rate stays gated behind
                "Swap after fixed period" below, unchanged. */}
            <div className={s.section}>
              <span className={s.sectionTitle}>{TRANCHE_FORM_LABEL.interestRate}</span>
              <Field label={TRANCHE_FORM_LABEL.baseRate} required>
                <RadioGroup
                  {...a11y("rad_SeniorDebtData_BaseRate_2", TRANCHE_FORM_LABEL.baseRate)}
                  value={String(trancheFormWithChildren.baseRate)}
                  onChange={(_, dt) => patchTranche({ baseRate: Number(dt.value) })}
                >
                  {baseRateOptions(project?.countryName ?? null).map((o) => (
                    <Radio key={o} value={String(o)} label={BASE_RATE_OPTION_LABEL[o]} />
                  ))}
                </RadioGroup>
              </Field>
              <NumericInput
                label={TRANCHE_FORM_LABEL.swapRate}
                a11y={a11y("txt_SeniorDebtData_SwapMargin", TRANCHE_FORM_LABEL.swapRate)}
                value={trancheFormWithChildren.swapRate}
                places={2} min={0} max={10} required language={lang}
                onChange={(v) => patchTranche({ swapRate: v })}
              />
            </div>

            <div className={s.section}>
              <span className={s.sectionTitle}>Fixed interest rate</span>
              <div className={s.grid2}>
                <Field label="FIR (years)">
                  <select
                    {...a11y("drp_SeniorDebtData_Fixed_Interest_Rate_YY", "FIR (years)")}
                    value={trancheFormWithChildren.fixedInterestRateYears ?? 0}
                    onChange={(e) =>
                      patchTranche({ fixedInterestRateYears: Number(e.target.value) })}
                  >
                    {Array.from({ length: 41 }, (_, i) => i).map((y) => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </Field>
                <Field label="FIR (months)">
                  <select
                    {...a11y("drp_SeniorDebtData_Fixed_Interest_Rate_MM", "FIR (months)")}
                    value={trancheFormWithChildren.fixedInterestRateMonths ?? 0}
                    onChange={(e) =>
                      patchTranche({ fixedInterestRateMonths: Number(e.target.value) })}
                  >
                    {Array.from({ length: 12 }, (_, i) => i).map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </Field>
              </div>
              <Switch
                label="Swap after fixed period"
                {...a11y("tgl_SeniorDebt_Data_Swap_After_Fixed_Period", "Swap after fixed period")}
                checked={trancheFormWithChildren.swapAfterFixedPeriod}
                onChange={(_, dt) => patchTranche({ swapAfterFixedPeriod: dt.checked })}
              />
              {trancheFormWithChildren.swapAfterFixedPeriod && (
                <NumericInput
                  label="Bank rate [%]"
                  // `'Bank Rate'` is written from this canvas box, whatever its name says.
                  a11y={a11y("txt_SeniorDebtData_BankMargin", "Bank rate [%]")}
                  value={trancheFormWithChildren.bankRate}
                  places={2} min={0} max={10} required language={lang}
                  onChange={(v) => patchTranche({ bankRate: v })}
                />
              )}
            </div>

            <div className={s.section}>
              <span className={s.sectionTitle}>Repayment profile</span>
              <RadioGroup
                {...a11y("rad_SeniorDebt_Data_RepaymentProfile")}
                value={String(trancheFormWithChildren.repaymentProfile)}
                onChange={(_, dt) => regenerate({ repaymentProfile: Number(dt.value) })}
              >
                <Radio
                  value={String(CHOICE_FINANCE.repaymentProfile.straightLine)} label="Straight Line"
                />
                <Radio
                  value={String(CHOICE_FINANCE.repaymentProfile.dscrSculpted)} label="DSCR Sculpted"
                />
                <Radio
                  value={String(CHOICE_FINANCE.repaymentProfile.individual)} label="Individual"
                />
              </RadioGroup>
              {trancheFormWithChildren.repaymentProfile
                === CHOICE_FINANCE.repaymentProfile.individual && (
                repaymentRows.length === 0 ? (
                  <Text className={s.hint}>
                    No repayment years — the tenor is not longer than the repayment start.
                  </Text>
                ) : repaymentRows.map((r, i) => (
                  <NumericInput
                    key={r.year}
                    label={String(r.year)}
                    a11y={a11y("txt_SeniorDebtData_RepaymentAmount", String(r.year))}
                    value={r.value}
                    places={0}
                    min={0}
                    max={project?.countryName === "Poland" ? 500_000_000 : 100_000_000}
                    language={lang}
                    onChange={(v) => {
                      const next = [...repaymentRows];
                      next[i] = {
                        ...r, value: v, dirty: true,
                        valid: validateRepaymentAmount(v, project?.countryName ?? null, lang).valid,
                      };
                      setRepaymentRows(next);
                      patchTranche({});
                    }}
                  />
                ))
              )}
            </div>

            <div className={s.section}>
              <span className={s.sectionTitle}>Step-up bank margin</span>
              <Switch
                label="Use a step-up schedule"
                {...a11y("tgl_SeniorDebtData_Step_Up_Bank_Margin", "Use a step-up schedule")}
                checked={trancheFormWithChildren.stepUpEnabled}
                onChange={(_, dt) => {
                  patchTranche({ stepUpEnabled: dt.checked });
                  if (dt.checked && stepUpRows.length === 0) {
                    setStepUpRows([{ id: 1, durationYY: null, margin: "", valid: false }]);
                  }
                }}
              />
              {trancheFormWithChildren.stepUpEnabled && (
                <>
                  {stepUpRows.map((r, i) => (
                    <div key={r.id} className={s.scheduleRow}>
                      <Field label={`Period ${r.id} ends at year`}>
                        <select
                          {...a11y("drp_SeniorDebtData_StepUp_Bank_Margin_YY", `Period ${r.id} ends at year`)}
                          value={r.durationYY ?? ""}
                          onChange={(e) => {
                            const next = [...stepUpRows];
                            next[i] = { ...r, durationYY: Number(e.target.value) };
                            setStepUpRows(next);
                            patchTranche({});
                          }}
                        >
                          <option value="">—</option>
                          {stepUpYearOptions(
                            i === 0 ? null : (stepUpRows[i - 1]?.durationYY ?? null),
                            trancheFormWithChildren.fixedInterestRateYears,
                          ).map((y) => <option key={y} value={y}>{y}</option>)}
                        </select>
                      </Field>
                      <NumericInput
                        label="Margin [%]"
                        a11y={a11y("txt_SeniorDebtData_StepUp_Bank_Margin_Percentage", "Margin [%]")}
                        value={r.margin}
                        places={2} min={0} max={100} language={lang}
                        onChange={(v) => {
                          const next = [...stepUpRows];
                          next[i] = { ...r, margin: v, valid: validateStepUpMargin(v, lang).valid };
                          setStepUpRows(next);
                          patchTranche({});
                        }}
                      />
                      <Button
                        icon={<DeleteRegular />}
                        // On the last row this button IS the canvas "Remove Last Period".
                        {...(i === stepUpRows.length - 1
                          ? a11y("btn_SeniorDebt_BankMargin_Remove_StepUp_LastPeriod") : {})}
                        disabled={!stepUpRemoveEnabled(
                          stepUpRows,
                          trancheFormWithChildren.trancheStatus
                            === CHOICE_FINANCE.trancheStatus.standardAssumption,
                        )}
                        onClick={() => {
                          setStepUpRows(stepUpRows
                            .filter((_, j) => j !== i)
                            .map((x, j) => ({ ...x, id: j + 1 })));
                          patchTranche({});
                        }}
                      />
                    </div>
                  ))}
                  <Button
                    icon={<AddRegular />}
                    {...a11y("btn_SeniorDebt_BankMargin_Add_StepUp_Period_1", "Add period")}
                    disabled={!stepUpAddEnabled(
                      stepUpRows,
                      trancheFormWithChildren.fixedInterestRateYears,
                      trancheFormWithChildren.trancheStatus
                        === CHOICE_FINANCE.trancheStatus.standardAssumption,
                    )}
                    onClick={() => {
                      setStepUpRows([
                        ...stepUpRows,
                        { id: stepUpRows.length + 1, durationYY: null, margin: "", valid: false },
                      ]);
                      patchTranche({});
                    }}
                  >
                    Add period
                  </Button>
                  <Text className={s.hint}>
                    The schedule must end exactly at the fixed-interest-rate duration
                    ({trancheFormWithChildren.fixedInterestRateYears ?? 0} years).
                  </Text>
                </>
              )}
            </div>

            {trancheFormWithChildren.trancheId && (
              <Text className={s.hint}>
                Financial close is a standard assumption:{" "}
                {parseStandardFlags(
                  str(
                    trancheInputs.find((t) => t.id === trancheFormWithChildren.trancheId)
                      ?.raw[INPUT_COL.seniorDebtStandardAssumptionJson],
                  ),
                  DEFAULT_SENIOR_DEBT_FLAGS,
                ).FinancialCloseDate ? "yes" : "no"}
              </Text>
            )}
          </div>
        )}
      </FormPanel>

      <ConfirmDialog
        open={confirm === "deleteTranche"}
        title="Delete this senior-debt tranche?"
        intent="danger"
        confirmLabel="Delete"
        busy={deleteTranche.isPending}
        onCancel={() => setConfirm("none")}
        onConfirm={async () => {
          if (selectedTrancheId) {
            await deleteTranche.mutateAsync({
              trancheId: selectedTrancheId,
              stepUps: stepUps.map((x) => ({ id: x.id, financingInputId: x.financingInputId })),
              repayments: repayments.map((x) => ({ id: x.id, financingInputId: x.financingInputId })),
            });
          }
          setSelectedTrancheId(null);
          setConfirm("none");
        }}
      >
        <Text>Its repayment amounts and step-up margins are deleted with it.</Text>
      </ConfirmDialog>

      <ConfirmDialog
        open={confirm === "toggleTranche" || confirm === "toggleCategory"}
        title={
          pendingToggle?.status === CHOICE_FINANCE.status.active
            ? "Deactivate this financing input?"
            : "Activate this financing input?"
        }
        confirmLabel="Confirm"
        busy={toggleStatus.isPending}
        onCancel={() => { setConfirm("none"); setPendingToggle(null); }}
        onConfirm={async () => {
          if (pendingToggle) {
            const fields = pendingToggle.categoryOrder === CATEGORY_ORDER.dsraDsrf
              ? toggleDsraStatus({ status: pendingToggle.status })
              : toggleTrancheStatus({ status: pendingToggle.status });
            await toggleStatus.mutateAsync({ id: pendingToggle.id, fields });
          }
          setConfirm("none");
          setPendingToggle(null);
        }}
      >
        <Text>
          {pendingToggle?.name} — the pre-switch state is remembered so a later change of
          financing option can restore it.
        </Text>
      </ConfirmDialog>

      {(projectLoading || seed.isPending || saveTranche.isPending) && (
        <LoadingOverlay mode="inline" />
      )}
    </div>
  );
}
