/**
 * The contract / period panel (ACS:4863-9711, `con_LandLease_RightPanel_NewEditPeriod_1`), two
 * columns (`…_LeftBodyContent` / `…_RightBodyContent`).
 *
 * Editability (`isContractLevelEditable`): a new contract and Period 1 edit every field; Period 2+
 * and Add Period edit only the durations, money figures, aggregation and distribution frequency —
 * the inflation block and External Contract are inherited from Period 1.
 *
 * Locked canvas fields are shown disabled with their fixed values: Secured off and
 * Allocate to all WTGs on (Land Lease), One-Time Payment off (Land Lease), Threshold off (O&M),
 * Align with Project Duration off (O&M / Other). Their unreachable sub-sections (OTP dates and
 * amounts, threshold options, WTG allocation) stay hidden, as in the canvas.
 *
 * DIVERGENCE: a failed save keeps the panel open with the input and the error in it; the canvas
 * closes the panel first (`locIsVisibleLandLeaseStandardContract: false` at the start of the
 * Save `OnChange`) and only `Notify`s the raw error (D36 §4).
 *
 * Every control's `data-testid` is its canvas name. Only the three duration / frequency dropdowns
 * set a literal `AccessibleLabel` ("Year", "Month", "Month"); every other `aria-label` is the
 * visible caption (CONVENTIONS rule 16).
 */
import { useMemo, useState } from "react";
import { Dropdown, Field, Option, Switch, Text } from "@fluentui/react-components";
import { FormPanel, ReadOnlyField, TextField } from "@/components";
import { type CostCurrency } from "@/data/adminCost";
import { CONTRACT_TYPE } from "@/domain/costStandards";
import { AGGREGATION_OPTIONS, FREQUENCY_OPTIONS, MONTH_OPTIONS, MSG, YEAR_OPTIONS } from "./constants";
import { useDrawerStyles } from "./drawerStyles";
import {
  canSaveOpex, currencyCode, currencyIssue, hiddenValues, isDirty, isContractLevelEditable, opexPanelTitle, opexStandardDefaults,
  validateOpexForm, withCountryInflation, withInflation, withYears,
  type CostSelection, type HiddenValues, type OpexFieldKey, type OpexForm, type OpexPanelContext,
} from "./rules";

export interface ContractPeriodDrawerProps {
  open: boolean;
  panel: OpexPanelContext;
  selection: CostSelection;
  currencies: readonly CostCurrency[];
  inflationAreas: readonly string[];
  locale?: string;
  saving: boolean;
  error: string | undefined;
  onSave: (form: OpexForm, hidden: HiddenValues) => void;
  onDismiss: () => void;
}

interface Choice { value: number; label: string }

export function ContractPeriodDrawer(props: ContractPeriodDrawerProps) {
  const { open, panel, selection, currencies, inflationAreas, locale, saving, error } = props;
  const styles = useDrawerStyles();
  const [pristine] = useState<OpexForm>(() => opexStandardDefaults(panel));
  const [form, setForm] = useState<OpexForm>(pristine);
  const hidden = useMemo(() => hiddenValues(panel), [panel]);

  const cur = currencyCode(selection.countryName);
  const ll = panel.type === CONTRACT_TYPE.landLease;
  const contractLevel = isContractLevelEditable(panel.mode);
  const validation = validateOpexForm(form, { mode: panel.mode, hidden, locale });
  const canSave = canSaveOpex(form, pristine, validation, {
    countryName: selection.countryName, mode: panel.mode, contract: panel.contract, currencies,
  }) && !saving;
  const missingCurrency = currencyIssue(currencies, selection.countryName);
  const currencyName = currencies.find((c) => c.code === cur)?.name ?? cur;
  const showArea = form.useInflation && form.useCountryInflation && selection.countryName === "Italy";

  const errorProps = (key: OpexFieldKey) => {
    const message = validation.errors[key];
    return {
      validationState: message ? ("error" as const) : ("none" as const),
      validationMessage: message ? { children: message, className: styles.error } : undefined,
      validationMessageIcon: null,
    };
  };

  /**
   * The value / selection / change props of one single-select dropdown. `aria-label` and
   * `data-testid` stay literal at the call site, so the canvas-identity gate compares them.
   */
  const choiceProps = (options: readonly Choice[], value: number | null, onChange: (v: number | null) => void, width?: number) => ({
    placeholder: "Select",
    ...(width ? { style: { minWidth: width, width } } : {}),
    value: options.find((o) => o.value === value)?.label ?? "",
    selectedOptions: value === null ? [] : [String(value)],
    onOptionSelect: (_: unknown, d: { optionValue?: string | undefined }) => onChange(d.optionValue === undefined ? null : Number(d.optionValue)),
  });
  const optionsOf = (options: readonly Choice[]) => options.map((o) => <Option key={o.value} value={String(o.value)}>{o.label}</Option>);

  /** The field's message styling (12 px semibold, no icon), the same as `errorProps` above. */
  const fieldError = (key: OpexFieldKey) => {
    const message = validation.errors[key];
    return { ...(message ? { error: message } : {}), errorClassName: styles.error, validationIcon: null };
  };

  /** The value / change / error props of one money figure (`label` and `testId` stay at the call site). */
  const figure = (key: "fixCosts" | "ofRevenues" | "eurMwh" | "eurMw" | "eurWtg") => ({
    value: form[key],
    inputMode: "decimal" as const,
    ...fieldError(key),
    onChange: (v: string) => setForm((f) => ({ ...f, [key]: v })),
  });

  return (
    <FormPanel
      open={open}
      // `lbl_LandLease_RightPanel_NewEditPeriod_BodyHeader_1.Text` (`opexPanelTitle`).
      title={opexPanelTitle(panel.mode, panel.subaccount.name)}
      width="period"
      closeTestId="ico_LandLease_RightPanel_NewEditPeriod_BodyheaderCancel_1"
      // The shared footer's Cancel goes through the panel's discard guard; a save in flight
      // disables both buttons and locks the panel. The commercial hint sits left (the footer's `hint`).
      actions={{
        onSave: () => props.onSave(form, hidden), canSave, saving,
        saveTestId: "pcf_LandLease_RightPanel_NewEditPeriod_BodyButtons_Save_1",
        cancelTestId: "pcf_LandLease_RightPanel_NewEditPeriod_BodyButtons_Cancel_1",
        ...(validation.hint ? {
          hint: <span data-testid="lbl_LandLease_RightPanel_NewEditPeriod_BodyButtons_Hint_1">{MSG.commercialHint}</span>,
        } : {}),
      }}
      messages={{
        error: error ?? null,
        notices: missingCurrency ? [{ intent: "warning", text: missingCurrency }] : [],
      }}
      onDismiss={props.onDismiss}
      dirty={isDirty(form, pristine)}
      {...(saving ? { busyLabel: MSG.savingNamed(form.description) } : {})}
    >
      <div className={styles.form}>
        {!contractLevel ? (
          // NEW — no canvas equivalent: the canvas only disables these fields, without a note.
          <Text className={styles.readOnlyNote}>
            Inflation and External Contract are contract-level settings inherited from Period 1; edit Period 1 to change them.
          </Text>
        ) : null}
        <div className={styles.columns}>
          <div className={styles.column}>
            {/* `lbl_LandLease_RightPanel_NewEditCost_BodyContentDescription_1.Text` — "Description" (derived, locked). */}
            <ReadOnlyField skin="plain" label="Description" value={form.description} required disabled={false}
              testId="txt_LandLease_RightPanel_NewEditCost_BodyContent_Description_1" />
            {/* `lbl_LandLease_RightPanel_NewEditCost_BodyContent_StartDate_1.Text` — "Start Date" (derived, locked). */}
            <ReadOnlyField skin="plain" label="Start Date" value={form.startDate} disabled={false}
              testId="txt_LandLease_RightPanel_NewEditCost_BodyContent_StartDate" />
            {/* `lbl_LandLease_RightPanel_NewEditPeriod_BodyContent_DurationYears_1.Text` — "Duration". */}
            <Field label="Duration" required {...errorProps("duration")}>
              <div className={styles.inline}>
                {/* `drp_…_DurationYears_1.AccessibleLabel` — "Year"; `drp_…_DurationMonths_1.AccessibleLabel` — "Month". */}
                <Dropdown
                  aria-label="Year"
                  data-testid="drp_LandLease_RightPanel_NewEditPeriod_BodyContent_DurationYears_1"
                  {...choiceProps(YEAR_OPTIONS, form.years, (v) => setForm((f) => withYears(f, v)), 110)}
                >
                  {optionsOf(YEAR_OPTIONS)}
                </Dropdown>
                <Dropdown
                  aria-label="Month"
                  data-testid="drp_LandLease_RightPanel_NewEditPeriod_BodyContent_DurationMonths_1"
                  {...choiceProps(MONTH_OPTIONS, form.months, (v) => setForm((f) => ({ ...f, months: v })), 130)}
                >
                  {optionsOf(MONTH_OPTIONS)}
                </Dropdown>
              </div>
            </Field>
            {/* `lbl_LandLease_RightPanel_NewEditCost_BodyContent_Currency_1.Text` — "Currency" (locked to EUR / PLN). */}
            <ReadOnlyField skin="plain" label="Currency" value={currencyName} disabled={false}
              testId="drp_LandLease_RightPanel_NewEditCost_BodyContent_Currency_1" />
            {/* `lbl_…_FixedCosts_1.Text` — `"Fix Costs p.a. [" & {EUR|PLN} & "]"`. */}
            <TextField skin="plain" label={`Fix Costs p.a. [${cur}]`}
              testId="txt_LandLease_RightPanel_NewEditPeriod_BodyContent_FixedCosts_1" {...figure("fixCosts")} />
            {/* `lbl_…_PercentOfRevenues_1.Text` — "Share of Revenues [%]". */}
            <TextField skin="plain" label="Share of Revenues [%]"
              testId="txt_LandLease_RightPanel_NewEditPeriod_BodyContent_PercentOfRevenues_1" {...figure("ofRevenues")} />
            {/* `lbl_…_EuroMWh_1` / `_EuroMW_1` / `_EuroWTG_1.Text` — `{EUR|PLN} & "/MWh p.a."` … */}
            <TextField skin="plain" label={`${cur}/MWh p.a.`}
              testId="txt_LandLease_RightPanel_NewEditPeriod_BodyContent_EuroMWh_1" {...figure("eurMwh")} />
            <TextField skin="plain" label={`${cur}/MW p.a.`}
              testId="txt_LandLease_RightPanel_NewEditPeriod_BodyContent_EuroMW_1" {...figure("eurMw")} />
            <TextField skin="plain" label={`${cur}/WTG p.a.`}
              testId="txt_LandLease_RightPanel_NewEditPeriod_BodyContent_EuroWTG_1" {...figure("eurWtg")} />
            {/* `lbl_LandLease_RightPanel_NewEditPeriod_BodyContent_Aggregation_1.Text` — "Aggregation". */}
            <Field label="Aggregation" required>
              <Dropdown
                aria-label="Aggregation"
                data-testid="drp_LandLease_RightPanel_NewEditPeriod_BodyContent_Aggregation_1"
                {...choiceProps(AGGREGATION_OPTIONS, form.aggregation, (v) => setForm((f) => ({ ...f, aggregation: v })))}
              >
                {optionsOf(AGGREGATION_OPTIONS)}
              </Dropdown>
            </Field>
            {/* `lbl_LandLease_RightPanel_NewEditCost_BodyContent_DistributionFrequency_1.Text` — "Distribution Frequency". */}
            <Field label="Distribution Frequency" required>
              {/* `drp_…_DistributionFrequency_Month_1.AccessibleLabel` — "Month", verbatim. */}
              <Dropdown
                aria-label="Month"
                data-testid="drp_LandLease_RightPanel_NewEditCost_BodyContent_DistributionFrequency_Month_1"
                {...choiceProps(FREQUENCY_OPTIONS, form.distributionFrequency, (v) => setForm((f) => ({ ...f, distributionFrequency: v })))}
              >
                {optionsOf(FREQUENCY_OPTIONS)}
              </Dropdown>
            </Field>
          </div>

          <div className={styles.column}>
            {ll ? (
              <>
                {/* `tgl_…_Secured.Label` — "Secured"; `tgl_…_AllocationToAllWTGs.Label` — "Allocate to all WTGs". Locked. */}
                <Switch label="Secured" aria-label="Secured" data-testid="tgl_LandLease_RightPanel_NewEditContractPeriod_BodyContent_Secured" checked={false} disabled />
                <Switch label="Allocate to all WTGs" aria-label="Allocate to all WTGs" data-testid="tgl_LandLease_RightPanel_NewEditContractPeriod_BodyContent_AllocationToAllWTGs" checked disabled />
              </>
            ) : null}
            {/* `tgl_LandLease_RightPanel_NewEditCost_BodyContent_InflationProfile_1.Label` — "Inflation Profile". */}
            <Switch
              label="Inflation Profile"
              aria-label="Inflation Profile"
              data-testid="tgl_LandLease_RightPanel_NewEditCost_BodyContent_InflationProfile_1"
              checked={form.useInflation}
              disabled={!contractLevel}
              onChange={(_, d) => setForm((f) => withInflation(f, d.checked, pristine))}
            />
            {form.useInflation ? (
              <>
                {/* `tgl_LandLease_RightPanel_NewEditCost_BodyContent_CountryInflationProfile_1.Label` — "Country Inflation Profile". */}
                <Switch
                  label="Country Inflation Profile"
                  aria-label="Country Inflation Profile"
                  data-testid="tgl_LandLease_RightPanel_NewEditCost_BodyContent_CountryInflationProfile_1"
                  checked={form.useCountryInflation}
                  disabled={!contractLevel}
                  onChange={(_, d) => setForm((f) => withCountryInflation(f, d.checked, pristine))}
                />
                {/* `lbl_…_InflationStartYear_1.Text` — "Inflation Start Year"; the value is `MSG.inflationStartYear`. */}
                <ReadOnlyField skin="plain" label="Inflation Start Year" value={MSG.inflationStartYear} required disabled={false}
                  testId="txt_LandLease_RightPanel_NewEditCost_BodyContent_InflationStartYear_1" />
              </>
            ) : null}
            {showArea ? (
              // `lbl_LandLease_RightPanel_NewEditCost_BodyContent_AreaInflationProfile_1.Text` — "Area".
              <Field label="Area" required>
                <Dropdown
                  aria-label="Area"
                  data-testid="drp_LandLease_RightPanel_NewEditCost_BodyContent_AreaInflationProfile_1"
                  placeholder="Select"
                  disabled={!contractLevel}
                  value={form.area}
                  selectedOptions={form.area ? [form.area] : []}
                  onOptionSelect={(_, d) => setForm((f) => ({ ...f, area: d.optionValue ?? "" }))}
                >
                  {[...new Set([...inflationAreas, ...(form.area ? [form.area] : [])])].map((a) => <Option key={a} value={a}>{a}</Option>)}
                </Dropdown>
              </Field>
            ) : null}
            {/*
              `txt_LandLease_RightPanel_NewEditCost_BodyContent_InflationProfile_1` is ONE canvas input
              whose caption (`lbl_…_InflationProfile_1.Text`) switches: `If(Country toggle, "Country
              Inflation Profile", "Custom Inflation Profile [%]")`. Both branches carry its name.
            */}
            {form.useInflation ? (
              form.useCountryInflation ? (
                <ReadOnlyField skin="plain" label="Country Inflation Profile" value="Country Inflation Profile" disabled={false}
                  testId="txt_LandLease_RightPanel_NewEditCost_BodyContent_InflationProfile_1" />
              ) : (
                <TextField skin="plain"
                  label="Custom Inflation Profile [%]"
                  testId="txt_LandLease_RightPanel_NewEditCost_BodyContent_InflationProfile_1"
                  required
                  value={form.customInflation}
                  inputMode="decimal"
                  disabled={!contractLevel}
                  {...fieldError("customInflation")}
                  onChange={(v) => setForm((f) => ({ ...f, customInflation: v }))}
                />
              )
            ) : null}
            {/* `tgl_LandLease_RightPanel_NewEditContractPeriod_BodyContent_OneTimePayment.Label` — "One-Time Payment". Locked off. */}
            {ll ? <Switch label="One-Time Payment" aria-label="One-Time Payment" data-testid="tgl_LandLease_RightPanel_NewEditContractPeriod_BodyContent_OneTimePayment" checked={false} disabled /> : null}
            {/* `togl_OpexCosts_RightPanel_NewEditCost_BodyContent_Threshold.Label` — `"Threshold for " & {EUR|PLN} & "/MWh p.a."`. Locked off. */}
            {panel.type === CONTRACT_TYPE.oAndM ? <Switch label={`Threshold for ${cur}/MWh p.a.`} aria-label={`Threshold for ${cur}/MWh p.a.`} data-testid="togl_OpexCosts_RightPanel_NewEditCost_BodyContent_Threshold" checked={false} disabled /> : null}
            {!ll ? (
              <>
                {/* `tgl_OpexCosts_RightPanel_NewEditCost_BodyContent_AlignWithProjectDuration.Label` — "Align with Project Duration". Locked off. */}
                <Switch label="Align with Project Duration" aria-label="Align with Project Duration" data-testid="tgl_OpexCosts_RightPanel_NewEditCost_BodyContent_AlignWithProjectDuration" checked={false} disabled />
                {/* `tgl_OpexCosts_RightPanel_NewEditCost_BodyContent_ExternalContract.Label` — "External Contract". */}
                <Switch
                  label="External Contract"
                  aria-label="External Contract"
                  data-testid="tgl_OpexCosts_RightPanel_NewEditCost_BodyContent_ExternalContract"
                  checked={form.externalContract}
                  disabled={!contractLevel}
                  onChange={(_, d) => setForm((f) => ({ ...f, externalContract: d.checked }))}
                />
              </>
            ) : null}
          </div>
        </div>
      </div>
    </FormPanel>
  );
}
