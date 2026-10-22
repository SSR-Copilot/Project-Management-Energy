/**
 * The 450 px DEVEX/CAPEX cost panel (ACS:9712-10977, `con_AdminCost_RightPanel_Form_AddStandardCost`).
 *
 * The Save gate is dirty-against-the-snapshot-taken-on-open (`canSaveDevex`). The locked fields
 * (Distribution Frequency 3 Months, Apply VAT, Depreciation) are shown read-only, as in the canvas.
 *
 * DIVERGENCE: a failed save keeps the panel open with the input and the error in it; the canvas
 * closes the panel first (`locIsVisibleAddCostPanel: false` at the start of the Save `OnChange`)
 * and has no `IfError` (D36 §4).
 *
 * Every control's `data-testid` is its canvas name; none of them sets a literal `AccessibleLabel`,
 * so each `aria-label` is its visible caption (CONVENTIONS rule 16).
 */
import { useMemo, useState } from "react";
import {
  Checkbox, Dropdown, Field, Input, Option, Radio, RadioGroup, Text, Textarea,
} from "@fluentui/react-components";
import { FormPanel, PANEL_RADIO_ROW, TextField } from "@/components";
import type { CapexHierarchy, DevexCost } from "@/data/adminCost";
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

  // The hierarchy is passed so an inactive sub-account blocks Save with a message.
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
      // `lbl_AdminCost_RightPanel_Form_AddStandardCost_Header_title.Text` (`devexPanelTitle`).
      title={devexPanelTitle(editing, hierarchy)}
      width="narrow"
      closeTestId="ico_btn_AdminCost_RightPanel_Form_AddStandardCost_Header_Cancel"
      // The shared footer's Cancel goes through the panel's discard guard; a save in
      // flight disables both buttons and locks the panel (brand-outline Cancel).
      actions={{
        onSave: () => props.onSave(form), canSave, saving,
        saveTestId: "pcf_btn_AdminCost_RightPanel_Form_AddStandardCost_Button_Save",
        cancelTestId: "pcf_btn_AdminCost_RightPanel_Form_AddStandardCost_Button_Cancel",
      }}
      messages={{ error: error ?? null }}
      onDismiss={props.onDismiss}
      dirty={isDirty(form, pristine)}
      {...(saving ? { busyLabel: MSG.saving } : {})}
    >
      <div className={styles.form}>
        {/* `lbl_AdminCost_RightPanel_Form_Fields_AddCost_Fields_Description.Text` — "Description"; MaxLength 30. */}
        <TextField skin="plain"
          label="Description"
          testId="txt_AdminCost_RightPanel_Form_AddCost_Fields_Description"
          required
          value={form.description}
          maxLength={30}
          counter="none"
          onChange={(v) => setForm((f) => ({ ...f, description: v }))}
        />

        {/* `lbl_AdminCost_RightPanel_Form_AddCost_Fields_SelectCluster.Text` — "Select Cluster". */}
        <Field label="Select Cluster" required>
          <div role="group" aria-label="Select Cluster" data-testid="chk_AdminCost_RightPanel_SelectClusters">
            {CLUSTER_LABELS.map((label, i) => (
              <Checkbox
                key={label}
                label={label}
                value={String(i + 1)}
                aria-label={label}
                data-testid={`chk_AdminCost_RightPanel_SelectCluster${i + 1}`}
                checked={form.clusters[i]}
                onChange={(_, d) => setCluster(i, d.checked === true)}
              />
            ))}
          </div>
        </Field>

        {/*
          `lbl_AdminCost_RightPanel_Form_AddCost_Fields_Distribution_Frequency.Text` — "Distribution
          Frequency". The canvas ComboBox is disabled with 3 Months; shown as its fixed value.
        */}
        <Field label="Distribution Frequency" required>
          <Input
            value="3 Months"
            disabled
            aria-label="Distribution Frequency"
            data-testid="cmb_AdminCost_RightPanel_Form_AddCost_Fields_Distribution_Frequency"
          />
        </Field>

        <div className={styles.inline}>
          {/* `chk_AdminCost_RightPanel_Form_AddCost_Fields_ApplyVat.Label` / `_Depreciation.Label` — verbatim; locked on. */}
          <Checkbox label="Apply VAT" value="applyVat" aria-label="Apply VAT" data-testid="chk_AdminCost_RightPanel_Form_AddCost_Fields_ApplyVat" checked disabled />
          <Checkbox label="Depreciation" value="depreciation" aria-label="Depreciation" data-testid="chk_AdminCost_RightPanel_Form_AddCost_Fields_Depreciation" checked disabled />
        </div>

        {/* `lbl_AdminCost_RightPanel_Form_AddCost_Fields_Category.Text` — "Category"; `InputTextPlaceholder` "Find Category". */}
        <Field label="Category" required>
          <SearchCombo
            ariaLabel="Category"
            testId="cmb_AdminCost_RightPanel_Form_AddCost_Fields_Category"
            placeholder="Find Category"
            options={categoryOptions}
            value={form.categoryId}
            onChange={(v) => setForm((f) => withDevexCategory(f, v))}
          />
        </Field>

        {/*
          `lbl_AdminCost_RightPanel_Form_AddCost_Fields_Subaccount.Text` — "Sub-Account";
          `cmb_…_Subaccount.InputTextPlaceholder` — "Find supplier", verbatim (the port had
          reworded it to "Find Sub-Account").
        */}
        <Field
          label="Sub-Account"
          required
          validationState={errors.subaccount ? "error" : "none"}
          validationMessage={errors.subaccount ? { children: errors.subaccount, className: styles.error } : undefined}
          validationMessageIcon={null}
        >
          <SearchCombo
            ariaLabel="Sub-Account"
            testId="cmb_AdminCost_RightPanel_Form_AddCost_Fields_Subaccount"
            placeholder="Find supplier"
            options={subaccountOptions}
            value={form.subaccountId}
            onChange={(v) => setForm((f) => withDevexSubaccount(f, v, hierarchy, payerDefaults))}
          />
        </Field>

        {/* `lbl_AdminCost_RightPanel_Form_Fields_AddCost_Fields_Cost_Paid_By.Text` — "Cost Paid By". */}
        <Field label="Cost Paid By" required>
          {/* Opt-in horizontal row (the panel CSS otherwise stacks radio groups). */}
          <RadioGroup
            layout="horizontal"
            className={PANEL_RADIO_ROW}
            aria-label="Cost Paid By"
            data-testid="rad_AdminCost_RightPanel_Form_AddCost_Fields_Cost_Paid_By"
            value={form.costPaidBy === null ? "" : String(form.costPaidBy)}
            onChange={(_, d) => setForm((f) => ({ ...f, costPaidBy: Number(d.value) }))}
          >
            {COST_PAID_BY_OPTIONS.map((o) => (
              <Radio
                key={o.value}
                value={String(o.value)}
                label={o.label}
                aria-label={o.label}
                data-testid={`rad_AdminCost_RightPanel_Form_AddCost_Fields_Cost_Paid_By-${o.value}`}
              />
            ))}
          </RadioGroup>
        </Field>

        {/* `lbl_AdminCost_RightPanel_Form_AddCost_Fields_Unit.Text` — "Unit"; `InputTextPlaceholder` "Find Cost Unit". */}
        <Field
          label="Unit"
          required
          validationState={errors.unit ? "error" : "none"}
          validationMessage={errors.unit ? { children: errors.unit, className: styles.error } : undefined}
          validationMessageIcon={null}
        >
          <Dropdown
            aria-label="Unit"
            data-testid="cmb_AdminCost_RightPanel_Form_AddCost_Fields_Unit"
            placeholder="Find Cost Unit"
            value={form.unit === null ? "" : unitLabel(form.unit)}
            selectedOptions={form.unit === null ? [] : [String(form.unit)]}
            onOptionSelect={(_, d) => setForm((f) => withDevexUnit(f, d.optionValue ? Number(d.optionValue) : null))}
          >
            {units.map((u) => <Option key={u} value={String(u)}>{unitLabel(u)}</Option>)}
          </Dropdown>
        </Field>

        {/* `lbl_AdminCost_RightPanel_Form_Fields_AddCost_Fields_Cost.Text` — `$"Cost [{Coalesce(Unit & "", "EUR")}]"`; MaxLength 10. */}
        <TextField skin="plain"
          label={`Cost [${unitText}]`}
          testId="txt_AdminCost_RightPanel_Form_AddCost_Fields_Cost"
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

        {/* ACS:10787-10806 — the `n/55` counter sits at the right end of the label line. */}
        <div className={styles.commentBlock}>
          {/* `lbl_AdminCost_RightPanel_Form_Fields_AddCost_Fields_Comment.Text` — "Comment"; MaxLength 55. */}
          <Field label="Comment">
            <Textarea
              value={form.comment}
              maxLength={55}
              resize="vertical"
              aria-label="Comment"
              data-testid="txt_AdminCost_RightPanel_Form_AddCost_Fields_Comment"
              onChange={(_, d) => setForm((f) => ({ ...f, comment: d.value }))}
            />
          </Field>
          {/* `lbl_AdminCost_RightPanel_Form_AddCost_Fields_Comment_Char_Limit.Text` — `$"{Len(…)}/55"`. */}
          <Text
            className={styles.counter}
            aria-live="polite"
            data-testid="lbl_AdminCost_RightPanel_Form_AddCost_Fields_Comment_Char_Limit"
          >
            {`${form.comment.length}/55`}
          </Text>
        </div>
      </div>
    </FormPanel>
  );
}
