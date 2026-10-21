/**
 * Admin Cost Screen — one OPEX-family card (Operation & Maintenance, Land Lease or Other OPEX):
 * `cmp_Admin_Cost_LandLease_AddStandardContractType_CommandBar`, the period grid
 * `gal_LandLease_Content_Subaccounts_CardBody_Costs_1` and the period panel
 * `con_LandLease_RightPanel_NewEditPeriod_1`. Composition only; the rules are in `opexRules.ts`.
 */
import { useMemo, useState } from "react";
import {
  Button, Dropdown, Field, Menu, MenuButton, MenuItem, MenuList, MenuPopover, MenuTrigger, Option,
  Switch, Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow, Text, mergeClasses,
} from "@fluentui/react-components";
import { AddRegular, DeleteRegular, EditRegular, MoreHorizontalRegular } from "@fluentui/react-icons";
import { ConfirmDialog, CostField, FormPanel, PanelButtons, useCommandRowStyles } from "@/components";
import { CHOICE_ADMIN } from "@/data/dataverseNames";
import {
  ADD_PERIOD_BLOCKED_REASON, ADMIN_COST_LABELS as L, AGGREGATION_OPTIONS, FREQUENCY_OPTIONS,
  INFLATION_START_YEAR_DISPLAY, MONTH_OPTIONS, MSG, OPEX_FIXED, PERIOD_ONE, YEAR_OPTIONS,
  canAddPeriod, canSaveOpexPeriod, changeCountryInflation, changeDurationYears, changeInflation,
  contractRowsOf, contractTypeMenu, currencyFor, deleteDialogDescription, deleteDialogTitle,
  derivedDescription, dueDateError, durationError, expandAfterSave, fixCostsError, hintVisible,
  inflationProfileError, isPeriodOneOrNew, kindOf, modeFor, opexCells, opexColumnHeaders,
  opexGridLines, opexRowsForCategory, paymentAmountError, percentOfRevenuesError, periodPanelLabels,
  periodPanelTitle, planDeleteOpexPeriodOrContract, planSaveOpexPeriod, rateError, splitOpexSubaccounts,
  startDateText, subaccountIdOf, toOpexForm, toggleCollapsed,
  type CostCategoryRow, type CostScope, type OpexPeriodForm, type OpexPeriodRow, type OpexSubaccount,
  type PeriodContext,
} from "./rules";
import {
  useCostCurrencies, useInflationAreas, useLandLeaseSubaccounts, useOpexAssumptions, useOpexSubaccounts,
  type useCostWrites,
} from "./hooks";
import { useCostStyles } from "./styles";

type Writes = ReturnType<typeof useCostWrites>;

export function OpexSection({
  row, scope, canEdit, writes, collapsed, setCollapsed,
}: {
  row: CostCategoryRow;
  scope: CostScope;
  canEdit: boolean;
  writes: Writes;
  collapsed: Map<string, boolean>;
  setCollapsed: (next: Map<string, boolean>) => void;
}) {
  const s = useCostStyles();
  const commandRow = useCommandRowStyles();
  const isLandLease = row.family === "landLease";
  const assumptionsQ = useOpexAssumptions(scope);
  const opexSubsQ = useOpexSubaccounts();
  const llSubsQ = useLandLeaseSubaccounts();
  const currenciesQ = useCostCurrencies();
  const scopeRows = assumptionsQ.data;

  const familySubaccounts = useMemo(() => {
    if (isLandLease) return llSubsQ.data;
    const split = splitOpexSubaccounts(opexSubsQ.data);
    return row.typeOfCategory === CHOICE_ADMIN.contractTypes.opexOandM ? split.oAndM : split.otherOpex;
  }, [isLandLease, llSubsQ.data, opexSubsQ.data, row.typeOfCategory]);
  const subaccountById = useMemo(() => new Map(familySubaccounts.map((x) => [x.id, x])), [familySubaccounts]);

  const rows = useMemo(() => opexRowsForCategory(scopeRows, scope, row.typeOfCategory), [scopeRows, scope, row.typeOfCategory]);
  const lines = opexGridLines(rows, collapsed);
  const menu = contractTypeMenu(row.typeOfCategory, familySubaccounts, scopeRows, scope);
  const headers = opexColumnHeaders(isLandLease, scope.countryName);

  const [ctx, setCtx] = useState<PeriodContext | null>(null);
  const [form, setForm] = useState<OpexPeriodForm | null>(null);
  const [toDelete, setToDelete] = useState<OpexPeriodRow | null>(null);

  const subaccountOf = (r: OpexPeriodRow): OpexSubaccount => {
    const id = subaccountIdOf(r) ?? "";
    return subaccountById.get(id) ?? { id, name: "", order: 0, accountOrder: null };
  };

  const openPanel = (subaccount: OpexSubaccount, existing: OpexPeriodRow | null, reference: OpexPeriodRow | null) => {
    const anchor = existing ?? reference;
    const next: PeriodContext = {
      mode: modeFor(existing, reference),
      typeOfContract: row.typeOfCategory,
      subaccount,
      existing,
      reference,
      contractRows: anchor ? contractRowsOf(scopeRows, anchor) : [],
    };
    writes.clear();
    setCtx(next);
    setForm(toOpexForm(next));
  };
  const closePanel = () => { setCtx(null); setForm(null); };

  const save = async () => {
    if (!ctx || !form) return;
    const plan = planSaveOpexPeriod({
      form, ctx, scope, currencyId: currencyFor(currenciesQ.data, scope.countryName)?.id ?? null, canEdit,
      noPermissionText: MSG.noPermission, incompleteText: MSG.incomplete, addPeriodBlockedText: ADD_PERIOD_BLOCKED_REASON,
    });
    const description = derivedDescription(ctx);
    const subaccountId = ctx.subaccount.id;
    closePanel();
    const done = await writes.run({ progress: MSG.savingPeriod(description), plan, errorText: MSG.opexSaveError });
    if (done) setCollapsed(expandAfterSave(collapsed, subaccountId));
  };

  const confirmDelete = async () => {
    const target = toDelete;
    setToDelete(null);
    if (!target) return;
    await writes.run({
      progress: MSG.deleting, errorText: MSG.opexDeleteError,
      plan: planDeleteOpexPeriodOrContract({
        target, contractRows: contractRowsOf(scopeRows, target), canEdit, noPermissionText: MSG.noPermission,
      }),
    });
  };

  return (
    <>
      <div className={mergeClasses(s.commandRow, s.opexCommandRow, commandRow.row)}>
        {/* `cmp_Admin_Cost_LandLease_AddStandardContractType_CommandBar` — the root item and one child per subaccount. */}
        <Menu>
          <MenuTrigger disableButtonEnhancement>
            <MenuButton
              appearance="transparent" icon={<MoreHorizontalRegular />} className={commandRow.command}
              aria-label={L.addContractType}
              data-testid="cmp_Admin_Cost_LandLease_AddStandardContractType_CommandBar"
              disabled={!canEdit || assumptionsQ.isLoading}
            >
              {L.addContractType}
            </MenuButton>
          </MenuTrigger>
          <MenuPopover>
            <MenuList>
              {menu.map((item) => (
                <MenuItem
                  key={item.subaccount.id}
                  aria-label={item.label}
                  data-testid={`cmp_Admin_Cost_LandLease_AddStandardContractType_CommandBar-${item.subaccount.id}`}
                  disabled={!item.enabled}
                  onClick={() => openPanel(item.subaccount, null, null)}
                >
                  {item.label}
                </MenuItem>
              ))}
            </MenuList>
          </MenuPopover>
        </Menu>
      </div>

      <div className={s.tableWrap}>
        <Table className={s.opexTable} size="small" aria-label={row.category}
          data-testid="gal_LandLease_Content_Subaccounts_CardBody_Costs_1">
          <TableHeader>
            <TableRow>
              <TableHeaderCell />
              {headers.map((h) => <TableHeaderCell key={h} className={s.headerCell}>{h}</TableHeaderCell>)}
              <TableHeaderCell />
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.flatMap((line) => {
              const r = line.row;
              const cells = opexCells(r, scopeRows);
              const out = [(
                <TableRow key={r.id} className={line.isHead ? s.headRow : undefined}>
                  <TableCell>
                    {line.isHead ? (
                      <Button
                        appearance="subtle" size="small"
                        aria-label={line.collapsed ? L.expand : L.collapse} aria-expanded={!line.collapsed}
                        data-testid="Button2_1"
                        onClick={() => setCollapsed(toggleCollapsed(collapsed, r))}
                      >
                        {line.collapsed ? L.expand : L.collapse}
                      </Button>
                    ) : null}
                  </TableCell>
                  {cells.map((c, i) => <TableCell key={i} className={s.cell} title={c}>{c}</TableCell>)}
                  <TableCell>
                    <span className={s.actions}>
                      {line.isHead ? (
                        <>
                          <Button
                            appearance="subtle" size="small" icon={<DeleteRegular />} aria-label={deleteDialogTitle("contract")}
                            data-testid="ico_OpexCosts_Content_Subaccounts_CardBody_CostsTableRow_Delete"
                            disabled={!canEdit} onClick={() => setToDelete(r)}
                          />
                          <Button
                            appearance="subtle" size="small" icon={<EditRegular />} aria-label={L.edit}
                            data-testid="btn_ICON_OpexCosts_Content_Subaccounts_CardBody_CostsTableRow_Edit"
                            disabled={!canEdit} onClick={() => openPanel(subaccountOf(r), r, null)}
                          />
                        </>
                      ) : (
                        <>
                          {line.canDelete ? (
                            <Button
                              appearance="subtle" size="small" icon={<DeleteRegular />} aria-label={deleteDialogTitle("period")}
                              data-testid="ico_OpexCosts_Content_Subaccounts_CardBody_CostsTableRow_Delete_1"
                              disabled={!canEdit} onClick={() => setToDelete(r)}
                            />
                          ) : null}
                          <Button
                            appearance="subtle" size="small" icon={<EditRegular />} aria-label={L.edit}
                            data-testid="btn_ICON_OpexCosts_Content_Subaccounts_CardBody_CostsTableRow_Edit_1"
                            disabled={!canEdit} onClick={() => openPanel(subaccountOf(r), r, null)}
                          />
                        </>
                      )}
                    </span>
                  </TableCell>
                </TableRow>
              )];
              if (line.showAddPeriod) {
                out.push(
                  <TableRow key={`${r.id}:add`}>
                    <TableCell colSpan={headers.length + 2}>
                      <Button
                        appearance="transparent" icon={<AddRegular />} aria-label={L.addPeriod}
                        data-testid="btn_OpexCosts_Content_Subaccounts_CardBody_AddPeriod"
                        disabled={!canEdit || !canAddPeriod(r.period)}
                        title={canAddPeriod(r.period) ? undefined : ADD_PERIOD_BLOCKED_REASON}
                        onClick={() => openPanel(subaccountOf(r), null, r)}
                      >
                        {L.addPeriod}
                      </Button>
                    </TableCell>
                  </TableRow>,
                );
              }
              return out;
            })}
          </TableBody>
        </Table>
      </div>

      {ctx && form ? (
        <PeriodPanel
          ctx={ctx} form={form} setForm={setForm} scope={scope} canEdit={canEdit}
          currencyName={currencyFor(currenciesQ.data, scope.countryName)?.name ?? ""}
          onSave={() => { void save(); }} onClose={closePanel}
        />
      ) : null}

      <ConfirmDialog
        open={toDelete !== null}
        title={deleteDialogTitle(toDelete?.period === PERIOD_ONE ? "contract" : "period")}
        description={deleteDialogDescription(toDelete?.period === PERIOD_ONE ? "contract" : "period", toDelete?.description ?? "")}
        confirmText={L.confirm}
        cancelText={L.cancel}
        onConfirm={() => { void confirmDelete(); }}
        onCancel={() => setToDelete(null)}
      />
    </>
  );
}

function PeriodPanel({
  ctx, form, setForm, scope, canEdit, currencyName, onSave, onClose,
}: {
  ctx: PeriodContext;
  form: OpexPeriodForm;
  setForm: (f: OpexPeriodForm) => void;
  scope: CostScope;
  canEdit: boolean;
  currencyName: string;
  onSave: () => void;
  onClose: () => void;
}) {
  const s = useCostStyles();
  const P = periodPanelLabels(scope.countryName);
  const areasQ = useInflationAreas(scope.countryId);
  const isLandLease = kindOf(ctx.typeOfContract) === "landLease";
  const isOandM = ctx.typeOfContract === CHOICE_ADMIN.contractTypes.opexOandM;
  const editable = isPeriodOneOrNew(ctx);
  const update = (patch: Partial<OpexPeriodForm>) => setForm({ ...form, ...patch, dirty: true });
  const subaccountName = ctx.subaccount.name;
  const durError = durationError(form);

  return (
    <FormPanel
      open
      title={periodPanelTitle(ctx.mode, subaccountName)}
      width="period"
      onDismiss={onClose}
      closeTestId="ico_LandLease_RightPanel_NewEditPeriod_BodyheaderCancel_1"
      footer={
        <PanelButtons
          onSave={onSave} onCancel={onClose}
          disabled={!canEdit || !canSaveOpexPeriod(form, ctx, scope.countryName)}
          saveTestId="pcf_LandLease_RightPanel_NewEditPeriod_BodyButtons_Save_1"
          cancelTestId="pcf_LandLease_RightPanel_NewEditPeriod_BodyButtons_Cancel_1"
        />
      }
    >
      <div className={s.panelBody}>
        <CostField label={P.description} required disabled name="txt_LandLease_RightPanel_NewEditCost_BodyContent_Description_1"
          value={derivedDescription(ctx)} maxLength={130} />
        <CostField label={P.startDate} disabled name="txt_LandLease_RightPanel_NewEditCost_BodyContent_StartDate"
          value={startDateText(ctx)} maxLength={55} />

        <Field label={P.duration} required validationMessage={durError ?? undefined}>
          <div className={s.pair}>
            <Dropdown
              aria-label="Year" data-testid="drp_LandLease_RightPanel_NewEditPeriod_BodyContent_DurationYears_1"
              value={YEAR_OPTIONS.find((o) => o.value === form.durationYears)?.label ?? ""}
              selectedOptions={form.durationYears !== null ? [String(form.durationYears)] : []}
              onOptionSelect={(_, d) => setForm(changeDurationYears(form, Number(d.optionValue)))}
            >
              {YEAR_OPTIONS.map((o) => <Option key={o.value} value={String(o.value)}>{o.label}</Option>)}
            </Dropdown>
            <Dropdown
              aria-label="Month" data-testid="drp_LandLease_RightPanel_NewEditPeriod_BodyContent_DurationMonths_1"
              value={MONTH_OPTIONS.find((o) => o.value === form.durationMonths)?.label ?? ""}
              selectedOptions={form.durationMonths !== null ? [String(form.durationMonths)] : []}
              onOptionSelect={(_, d) => update({ durationMonths: Number(d.optionValue) })}
            >
              {MONTH_OPTIONS.map((o) => <Option key={o.value} value={String(o.value)}>{o.label}</Option>)}
            </Dropdown>
          </div>
        </Field>

        <Field label={P.currency}>
          <Dropdown aria-label={P.currency} disabled value={currencyName}
            data-testid="drp_LandLease_RightPanel_NewEditCost_BodyContent_Currency_1">
            <Option value={currencyName}>{currencyName}</Option>
          </Dropdown>
        </Field>

        <CostField label={P.fixCosts} name="txt_LandLease_RightPanel_NewEditPeriod_BodyContent_FixedCosts_1"
          value={form.fixCosts} error={fixCostsError(form.fixCosts) ?? undefined} onChange={(v) => update({ fixCosts: v })} />
        <CostField label={P.shareOfRevenues} name="txt_LandLease_RightPanel_NewEditPeriod_BodyContent_PercentOfRevenues_1"
          value={form.percentOfRevenues} error={percentOfRevenuesError(form.percentOfRevenues) ?? undefined}
          onChange={(v) => update({ percentOfRevenues: v })} />
        <CostField label={P.perMwh} name="txt_LandLease_RightPanel_NewEditPeriod_BodyContent_EuroMWh_1"
          value={form.eurPerMwh} error={rateError(form.eurPerMwh) ?? undefined} onChange={(v) => update({ eurPerMwh: v })} />
        <CostField label={P.perMw} name="txt_LandLease_RightPanel_NewEditPeriod_BodyContent_EuroMW_1"
          value={form.eurPerMw} error={rateError(form.eurPerMw) ?? undefined} onChange={(v) => update({ eurPerMw: v })} />
        <CostField label={P.perWtg} name="txt_LandLease_RightPanel_NewEditPeriod_BodyContent_EuroWTG_1"
          value={form.eurPerWtg} error={rateError(form.eurPerWtg) ?? undefined} onChange={(v) => update({ eurPerWtg: v })} />

        <Field label={P.aggregation} required>
          <Dropdown aria-label={P.aggregation} data-testid="drp_LandLease_RightPanel_NewEditPeriod_BodyContent_Aggregation_1"
            value={AGGREGATION_OPTIONS.find((o) => o.value === form.aggregation)?.label ?? ""}
            selectedOptions={form.aggregation !== null ? [String(form.aggregation)] : []}
            onOptionSelect={(_, d) => update({ aggregation: Number(d.optionValue) })}>
            {AGGREGATION_OPTIONS.map((o) => <Option key={o.value} value={String(o.value)}>{o.label}</Option>)}
          </Dropdown>
        </Field>

        <Field label={P.distributionFrequency} required>
          <Dropdown aria-label="Month" data-testid="drp_LandLease_RightPanel_NewEditCost_BodyContent_DistributionFrequency_Month_1"
            value={FREQUENCY_OPTIONS.find((o) => o.value === form.distributionFrequency)?.label ?? ""}
            selectedOptions={form.distributionFrequency !== null ? [String(form.distributionFrequency)] : []}
            onOptionSelect={(_, d) => update({ distributionFrequency: Number(d.optionValue) })}>
            {FREQUENCY_OPTIONS.map((o) => <Option key={o.value} value={String(o.value)}>{o.label}</Option>)}
          </Dropdown>
        </Field>

        {isLandLease ? (
          <>
            <Switch label={P.secured} aria-label={P.secured} checked={OPEX_FIXED.secured} disabled
              data-testid="tgl_LandLease_RightPanel_NewEditContractPeriod_BodyContent_Secured" />
            <Switch label={P.allocateToAllWtgs} aria-label={P.allocateToAllWtgs} checked={OPEX_FIXED.allWtgAllocated} disabled
              data-testid="tgl_LandLease_RightPanel_NewEditContractPeriod_BodyContent_AllocationToAllWTGs" />
          </>
        ) : null}

        <Switch label={P.inflationProfileToggle} aria-label={P.inflationProfileToggle} checked={form.useInflationProfile}
          disabled={!editable} data-testid="tgl_LandLease_RightPanel_NewEditCost_BodyContent_InflationProfile_1"
          onChange={(_, d) => setForm(changeInflation(form, ctx, d.checked))} />
        {form.useInflationProfile ? (
          <>
            <Switch label={P.countryInflationProfile} aria-label={P.countryInflationProfile}
              checked={form.useCountryInflationProfile} disabled={!editable}
              data-testid="tgl_LandLease_RightPanel_NewEditCost_BodyContent_CountryInflationProfile_1"
              onChange={(_, d) => setForm(changeCountryInflation(form, ctx, d.checked))} />
            <CostField label={P.inflationStartYear} required disabled
              name="txt_LandLease_RightPanel_NewEditCost_BodyContent_InflationStartYear_1"
              placeholder={P.inflationStartYearPlaceholder} value={INFLATION_START_YEAR_DISPLAY} />
            {form.useCountryInflationProfile && scope.countryName === "Italy" ? (
              <Field label={P.area} required>
                <Dropdown aria-label={P.area} disabled={!editable}
                  data-testid="drp_LandLease_RightPanel_NewEditCost_BodyContent_AreaInflationProfile_1"
                  value={form.area ?? ""} selectedOptions={form.area ? [form.area] : []}
                  onOptionSelect={(_, d) => update({ area: d.optionValue ?? null })}>
                  {areasQ.data.map((a) => <Option key={a} value={a}>{a}</Option>)}
                </Dropdown>
              </Field>
            ) : null}
            <CostField
              label={form.useCountryInflationProfile ? P.countryInflationProfile : P.customInflationProfile}
              required={!form.useCountryInflationProfile}
              name="txt_LandLease_RightPanel_NewEditCost_BodyContent_InflationProfile_1"
              value={form.inflationProfile} disabled={form.useCountryInflationProfile || !editable}
              error={inflationProfileError(form.inflationProfile, form.useCountryInflationProfile) ?? undefined}
              onChange={(v) => update({ inflationProfile: v })}
            />
          </>
        ) : null}

        {isLandLease ? (
          <>
            <Switch label={P.oneTimePayment} aria-label={P.oneTimePayment} checked={OPEX_FIXED.oneTimePayment} disabled
              data-testid="tgl_LandLease_RightPanel_NewEditContractPeriod_BodyContent_OneTimePayment" />
            {form.showSecond ? (
              <>
                <CostField label={P.dueDate(2)} required placeholder={P.dueDatePlaceholder} disabled={!editable}
                  name="txt_LandLease_RightPanel_NewEditCost_BodyContent_DueDate2_1" value={form.dueDate2}
                  error={dueDateError(form.dueDate2) ?? undefined} onChange={(v) => update({ dueDate2: v })} />
                <CostField label={P.amount(2)} required disabled={!editable}
                  name="txt_LandLease_RightPanel_NewEditCost_BodyContent_Amount2_1" value={form.amount2}
                  error={paymentAmountError(form.amount2) ?? undefined} onChange={(v) => update({ amount2: v })} />
              </>
            ) : null}
            {form.showThird ? (
              <>
                <CostField label={P.dueDate(3)} required placeholder={P.dueDatePlaceholder} disabled={!editable}
                  name="txt_LandLease_RightPanel_NewEditCost_BodyContent_DueDate3_1" value={form.dueDate3}
                  error={dueDateError(form.dueDate3) ?? undefined} onChange={(v) => update({ dueDate3: v })} />
                <CostField label={P.amount(3)} required disabled={!editable}
                  name="txt_LandLease_RightPanel_NewEditCost_BodyContent_Amount3_1" value={form.amount3}
                  error={paymentAmountError(form.amount3) ?? undefined} onChange={(v) => update({ amount3: v })} />
              </>
            ) : null}
          </>
        ) : null}

        {isOandM ? (
          <Switch label={P.thresholdToggle} aria-label={P.thresholdToggle} checked={OPEX_FIXED.threshold} disabled
            data-testid="togl_OpexCosts_RightPanel_NewEditCost_BodyContent_Threshold" />
        ) : null}

        {!isLandLease ? (
          <>
            <Switch label={P.alignWithProjectDuration} aria-label={P.alignWithProjectDuration}
              checked={OPEX_FIXED.alignWithProjectDuration} disabled
              data-testid="tgl_OpexCosts_RightPanel_NewEditCost_BodyContent_AlignWithProjectDuration" />
            <Switch label={P.externalContract} aria-label={P.externalContract} checked={form.externalContract}
              disabled={!editable} data-testid="tgl_OpexCosts_RightPanel_NewEditCost_BodyContent_ExternalContract"
              onChange={(_, d) => update({ externalContract: d.checked })} />
          </>
        ) : null}

        {hintVisible(form, ctx) ? (
          <Text className={s.hint} data-testid="lbl_LandLease_RightPanel_NewEditPeriod_BodyButtons_Hint_1">
            {P.atLeastOneFigureHint}
          </Text>
        ) : null}
      </div>
    </FormPanel>
  );
}
