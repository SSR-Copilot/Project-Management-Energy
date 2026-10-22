/**
 * The contract / period panel (ACS:4863-9711), two columns.
 *
 * Editability: Period 2+ / add-period edit only
 * durations, money figures, aggregation and distribution frequency — the inflation block and
 * External Contract are inherited from Period 1).
 *
 * Locked canvas fields are shown disabled with their fixed values: Secured off and
 * Allocate to all WTGs on (Land Lease), One-Time Payment off (Land Lease), Threshold off (O&M),
 * Align with Project Duration off (O&M / Other). Their unreachable sub-sections (OTP dates and
 * amounts, threshold options, WTG allocation) stay hidden, as in the canvas.
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

  const dropdown = (label: string, testId: string, options: readonly Choice[], value: number | null, onChange: (v: number | null) => void, width?: number) => (
    <Dropdown
      aria-label={label}
      data-testid={testId}
      placeholder="Select"
      style={width ? { minWidth: width, width } : undefined}
      value={options.find((o) => o.value === value)?.label ?? ""}
      selectedOptions={value === null ? [] : [String(value)]}
      onOptionSelect={(_, d) => onChange(d.optionValue === undefined ? null : Number(d.optionValue))}
    >
      {options.map((o) => <Option key={o.value} value={String(o.value)}>{o.label}</Option>)}
    </Dropdown>
  );

  /** The field's message styling (12 px semibold, no icon) as the old `errorProps`. */
  const fieldError = (key: OpexFieldKey) => {
    const message = validation.errors[key];
    return { ...(message ? { error: message } : {}), errorClassName: styles.error, validationIcon: null };
  };

  const money = (key: "fixCosts" | "ofRevenues" | "eurMwh" | "eurMw" | "eurWtg", label: string) => (
    <TextField skin="plain"
      label={label}
      testId={`cost-period-${key}`}
      value={form[key]}
      inputMode="decimal"
      {...fieldError(key)}
      onChange={(v) => setForm((f) => ({ ...f, [key]: v }))}
    />
  );

  return (
    <FormPanel
      open={open}
      title={opexPanelTitle(panel.mode, panel.subaccount.name)}
      width="period"
      // The shared footer's Cancel goes through the panel's discard guard; a save in
      // flight disables both buttons and locks the panel. The commercial hint sits left (the footer's `hint`).
      actions={{
        onSave: () => props.onSave(form, hidden), canSave, saving,
        ...(validation.hint ? { hint: MSG.commercialHint } : {}),
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
          <Text className={styles.readOnlyNote}>
            Inflation and External Contract are contract-level settings inherited from Period 1; edit Period 1 to change them.
          </Text>
        ) : null}
        <div className={styles.columns}>
          <div className={styles.column}>
            <ReadOnlyField skin="plain" label="Description" value={form.description} required disabled={false} />
            <ReadOnlyField skin="plain" label="Start Date" value={form.startDate} disabled={false} />
            <Field label="Duration" required {...errorProps("duration")}>
              <div className={styles.inline}>
                {dropdown("Duration years", "cost-period-years", YEAR_OPTIONS, form.years, (v) => setForm((f) => withYears(f, v)), 110)}
                {dropdown("Duration months", "cost-period-months", MONTH_OPTIONS, form.months, (v) => setForm((f) => ({ ...f, months: v })), 130)}
              </div>
            </Field>
            <ReadOnlyField skin="plain" label="Currency" value={currencyName} disabled={false} />
            {money("fixCosts", `Fix Costs p.a. [${cur}]`)}
            {money("ofRevenues", "Share of Revenues [%]")}
            {money("eurMwh", `${cur}/MWh p.a.`)}
            {money("eurMw", `${cur}/MW p.a.`)}
            {money("eurWtg", `${cur}/WTG p.a.`)}
            <Field label="Aggregation" required>
              {dropdown("Aggregation", "cost-period-aggregation", AGGREGATION_OPTIONS, form.aggregation, (v) => setForm((f) => ({ ...f, aggregation: v })))}
            </Field>
            <Field label="Distribution Frequency" required>
              {dropdown("Distribution Frequency", "cost-period-frequency", FREQUENCY_OPTIONS, form.distributionFrequency, (v) => setForm((f) => ({ ...f, distributionFrequency: v })))}
            </Field>
          </div>

          <div className={styles.column}>
            {ll ? (
              <>
                <Switch label="Secured" aria-label="Secured" data-testid="cost-period-secured" checked={false} disabled />
                <Switch label="Allocate to all WTGs" aria-label="Allocate to all WTGs" data-testid="cost-period-all-wtgs" checked disabled />
              </>
            ) : null}
            <Switch
              label="Inflation Profile"
              aria-label="Inflation Profile"
              data-testid="cost-period-inflation"
              checked={form.useInflation}
              disabled={!contractLevel}
              onChange={(_, d) => setForm((f) => withInflation(f, d.checked, pristine))}
            />
            {form.useInflation ? (
              <>
                <Switch
                  label="Country Inflation Profile"
                  aria-label="Country Inflation Profile"
                  data-testid="cost-period-country-inflation"
                  checked={form.useCountryInflation}
                  disabled={!contractLevel}
                  onChange={(_, d) => setForm((f) => withCountryInflation(f, d.checked, pristine))}
                />
                <ReadOnlyField skin="plain" label="Inflation Start Year" value={MSG.inflationStartYear} required disabled={false} />
              </>
            ) : null}
            {showArea ? (
              <Field label="Area" required>
                <Dropdown
                  aria-label="Area"
                  data-testid="cost-period-area"
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
            {form.useInflation ? (
              form.useCountryInflation ? (
                <ReadOnlyField skin="plain" label="Country Inflation Profile" value="Country Inflation Profile" disabled={false} />
              ) : (
                <TextField skin="plain"
                  label="Custom Inflation Profile [%]"
                  testId="cost-period-custom-inflation"
                  required
                  value={form.customInflation}
                  inputMode="decimal"
                  disabled={!contractLevel}
                  {...fieldError("customInflation")}
                  onChange={(v) => setForm((f) => ({ ...f, customInflation: v }))}
                />
              )
            ) : null}
            {ll ? <Switch label="One-Time Payment" aria-label="One-Time Payment" data-testid="cost-period-one-time-payment" checked={false} disabled /> : null}
            {panel.type === CONTRACT_TYPE.oAndM ? <Switch label={`Threshold for ${cur}/MWh p.a.`} aria-label={`Threshold for ${cur}/MWh p.a.`} data-testid="cost-period-threshold" checked={false} disabled /> : null}
            {!ll ? (
              <>
                <Switch label="Align with Project Duration" aria-label="Align with Project Duration" data-testid="cost-period-align-duration" checked={false} disabled />
                <Switch
                  label="External Contract"
                  aria-label="External Contract"
                  data-testid="cost-period-external-contract"
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
