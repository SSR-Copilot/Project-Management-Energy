/**
 * Module K — the 450 px DEVEX/CAPEX cost panel (ACS:9712-10977).
 *
 * Save gate FR-11 (dirty against the snapshot taken on open — D-FORM-1), validation FR-10, and a
 * failed save keeps the panel open with the input (D-SAVE-1). The locked fields (Distribution
 * Frequency 3 Months, Apply VAT, Depreciation) are shown read-only, as in the canvas.
 */
import { useMemo, useState } from "react";
import {
  Checkbox, Dropdown, Field, Input, Option, Radio, RadioGroup, Text, Textarea,
} from "@fluentui/react-components";
import { FormPanel, PANEL_RADIO_ROW, TextField } from "@/components";
import type { CapexHierarchy, DevexCost } from "@/data/settings/costs";
import { CLUSTER_LABELS, COST_PAID_BY_OPTIONS, MSG } from "./constants";
import { useDrawerStyles } from "./drawerStyles";
import {
  canSaveDevex, devexCategoryOptions, isDirty, devexFormFromCost, devexPanelTitle, devexSubaccountOptions,
  emptyDevexForm, unitLabel, unitOptions, validateDevexForm, withDevexCategory, withDevexSubaccount,
  withDevexUnit, type ClusterFlags, type CostSelection, type DevexForm,
} from "./rules";
import { SearchCombo } from "./SearchCombo";

export interface DevexCostDrawerProps {
  open: boolean;
  editing: DevexCost | undefined;
  selection: CostSelection;
  hierarchy: CapexHierarchy;
  costs: readonly DevexCost[];
  payerDefaults: ReadonlyMap<string, number>;
  locale?: string;
  saving: boolean;
  error: string | undefined;
  onSave: (form: DevexForm) => void;
  onDismiss: () => void;
}

export function DevexCostDrawer(props: DevexCostDrawerProps) {
  const { open, editing, selection, hierarchy, costs, payerDefaults, locale, saving, error } = props;
  const styles = useDrawerStyles();
  const [pristine] = useState<DevexForm>(() =>
    editing ? devexFormFromCost(editing, selection.countryName) : emptyDevexForm(selection.countryName));
  const [form, setForm] = useState<DevexForm>(pristine);

  // B-2 — the hierarchy is passed so an inactive sub-account blocks Save with a message.
  const errors = validateDevexForm(form, { countryName: selection.countryName, technology: selection.technology, locale, hierarchy });
  const canSave = canSaveDevex(form, pristine, errors) && !saving;
  const keepSub = editing?.subaccountId ?? null;
  const categoryOptions = useMemo(() => devexCategoryOptions(hierarchy, costs, keepSub), [hierarchy, costs, keepSub]);
  const subaccountOptions = useMemo(
    () => devexSubaccountOptions(hierarchy, costs, form.categoryId, keepSub),
    [hierarchy, costs, form.categoryId, keepSub],
  );
  const units = unitOptions(selection.countryName, selection.technology, editing?.unit ?? null);
  const unitText = unitLabel(form.unit ?? undefined) || "EUR";

  const setCluster = (i: number, checked: boolean) =>
    setForm((f) => ({ ...f, clusters: f.clusters.map((c, j) => (j === i ? checked : c)) as ClusterFlags }));

  return (
    <FormPanel
      open={open}
      title={devexPanelTitle(editing, hierarchy)}
      width="narrow"
      // M7 / M8 — the shared footer's Cancel goes through the panel's discard guard; a save in
      // flight disables both buttons and locks the panel (C1, V1 brand-outline Cancel).
      actions={{ onSave: () => props.onSave(form), canSave, saving }}
      messages={{ error: error ?? null }}
      onDismiss={props.onDismiss}
      dirty={isDirty(form, pristine)}
      {...(saving ? { busyLabel: MSG.saving } : {})}
    >
      <div className={styles.form}>
        <TextField
          label="Description"
          required
          value={form.description}
          maxLength={30}
          counter="none"
          onChange={(v) => setForm((f) => ({ ...f, description: v }))}
        />

        <Field label="Select Cluster" required>
          <div role="group" aria-label="Select Cluster">
            {CLUSTER_LABELS.map((label, i) => (
              <Checkbox
                key={label}
                label={label}
                checked={form.clusters[i]}
                onChange={(_, d) => setCluster(i, d.checked === true)}
              />
            ))}
          </div>
        </Field>

        <Field label="Distribution Frequency" required>
          <Input value="3 Months" disabled aria-label="Distribution Frequency (fixed)" />
        </Field>

        <div className={styles.inline}>
          <Checkbox label="Apply VAT" checked disabled />
          <Checkbox label="Depreciation" checked disabled />
        </div>

        <Field label="Category" required>
          <SearchCombo
            ariaLabel="Category"
            placeholder="Find Category"
            options={categoryOptions}
            value={form.categoryId}
            onChange={(v) => setForm((f) => withDevexCategory(f, v))}
          />
        </Field>

        <Field
          label="Sub-Account"
          required
          validationState={errors.subaccount ? "error" : "none"}
          validationMessage={errors.subaccount ? { children: errors.subaccount, className: styles.error } : undefined}
          validationMessageIcon={null}
        >
          <SearchCombo
            ariaLabel="Sub-Account"
            placeholder="Find Sub-Account"
            options={subaccountOptions}
            value={form.subaccountId}
            onChange={(v) => setForm((f) => withDevexSubaccount(f, v, hierarchy, payerDefaults))}
          />
        </Field>

        <Field label="Cost Paid By" required>
          {/* V4 — opt-in horizontal row (the panel CSS otherwise stacks radio groups). */}
          <RadioGroup
            layout="horizontal"
            className={PANEL_RADIO_ROW}
            aria-label="Cost Paid By"
            value={form.costPaidBy === null ? "" : String(form.costPaidBy)}
            onChange={(_, d) => setForm((f) => ({ ...f, costPaidBy: Number(d.value) }))}
          >
            {COST_PAID_BY_OPTIONS.map((o) => <Radio key={o.value} value={String(o.value)} label={o.label} />)}
          </RadioGroup>
        </Field>

        <Field
          label="Unit"
          required
          validationState={errors.unit ? "error" : "none"}
          validationMessage={errors.unit ? { children: errors.unit, className: styles.error } : undefined}
          validationMessageIcon={null}
        >
          <Dropdown
            aria-label="Unit"
            placeholder="Find Cost Unit"
            value={form.unit === null ? "" : unitLabel(form.unit)}
            selectedOptions={form.unit === null ? [] : [String(form.unit)]}
            onOptionSelect={(_, d) => setForm((f) => withDevexUnit(f, d.optionValue ? Number(d.optionValue) : null))}
          >
            {units.map((u) => <Option key={u} value={String(u)}>{unitLabel(u)}</Option>)}
          </Dropdown>
        </Field>

        <TextField
          label={`Cost [${unitText}]`}
          required
          value={form.cost}
          maxLength={10}
          counter="none"
          inputMode="numeric"
          {...(errors.cost ? { error: errors.cost } : {})}
          errorClassName={styles.error}
          validationIcon={null}
          onChange={(v) => setForm((f) => ({ ...f, cost: v }))}
        />

        <Field label="Comment">
          <Textarea
            value={form.comment}
            maxLength={55}
            resize="vertical"
            aria-label="Comment"
            onChange={(_, d) => setForm((f) => ({ ...f, comment: d.value }))}
          />
        </Field>
        <Text className={styles.counter} aria-live="polite">{`${form.comment.length}/55`}</Text>
      </div>
    </FormPanel>
  );
}
