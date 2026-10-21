/**
 * Admin Cost Screen — the DEVEX/CAPEX card: `con_DevexCapex_Content_StandardCosts_Card_Body_Costs`
 * (grid) and `con_AdminCost_RightPanel_Form_AddStandardCost` (the Add / Edit Cost panel).
 * Composition only; the rules are in `devexRules.ts`.
 */
import { useMemo, useState } from "react";
import {
  Button, Checkbox, Dropdown, Field, Option, Table, TableBody, TableCell, TableHeader,
  TableHeaderCell, TableRow, Text, Tooltip, mergeClasses,
} from "@fluentui/react-components";
import { AddRegular, CommentRegular, DeleteRegular, EditRegular } from "@fluentui/react-icons";
import { Choices, ConfirmDialog, CostField, FormPanel, PanelButtons } from "@/components";
import {
  ADMIN_COST_LABELS as L, COST_PAID_BY_OPTIONS, COST_PANEL_LABELS as C, DEVEX_COLUMN_HEADERS,
  DEVEX_COMMENT_MAX_LENGTH, DEVEX_DESCRIPTION_MAX_LENGTH, COST_MAX_LENGTH, DEVEX_DISTRIBUTION_FREQUENCY,
  DEVEX_APPLY_VAT, DEVEX_DEPRECIATION, FREQUENCY_OPTIONS, MSG,
  buildCapexSubaccounts, buildCostCategories, canSaveStandardCost, categoryOptions,
  changeDevexCategory, changeDevexSubaccount, changeDevexUnit, costAmountError, costPaidLabel,
  costPanelTitle, deleteDialogDescription, deleteDialogTitle, devexAccountCell, devexCategoryCell,
  devexClusterCell, devexCommentTooltip, devexCostCell, devexRows, devexSubaccountCell, isUnitValid,
  plainError, planDeleteStandardCost, planSaveStandardCost, reopenAfterWrite, subaccountOptions,
  toDevexForm, toggleDevexCategory, unitChoices, unitError, unitLabel,
  type CapexAccount, type CostScope, type DevexCost, type DevexForm,
} from "./rules";
import { useDevexCosts, useSpvDevCoMapping, type useCostWrites } from "./hooks";
import { useCostStyles } from "./styles";

type Writes = ReturnType<typeof useCostWrites>;

export function DevexSection({
  scope, accounts, canEdit, writes, open, setOpen,
}: {
  scope: CostScope;
  accounts: CapexAccount[];
  canEdit: boolean;
  writes: Writes;
  open: Set<string>;
  setOpen: (next: Set<string>) => void;
}) {
  const s = useCostStyles();
  const costsQ = useDevexCosts(scope);
  const mappingQ = useSpvDevCoMapping();
  const costs = costsQ.data;
  const categories = useMemo(() => buildCostCategories(accounts), [accounts]);
  const subaccounts = useMemo(() => buildCapexSubaccounts(accounts, categories), [accounts, categories]);
  const subById = useMemo(() => new Map(subaccounts.map((x) => [x.id, x])), [subaccounts]);
  const rows = useMemo(() => devexRows(categories, costs, subById, open), [categories, costs, subById, open]);

  const [panel, setPanel] = useState<{ existing: DevexCost | null } | null>(null);
  const [form, setForm] = useState<DevexForm>(toDevexForm(null, scope.countryName));
  const [toDelete, setToDelete] = useState<DevexCost | null>(null);

  const openPanel = (existing: DevexCost | null) => {
    writes.clear();
    setForm(toDevexForm(existing, scope.countryName));
    setPanel({ existing });
  };
  const closePanel = () => setPanel(null);

  const subaccount = form.subaccountId ? subById.get(form.subaccountId) ?? null : null;
  const existingSub = panel?.existing?.subaccountId ? subById.get(panel.existing.subaccountId) ?? null : null;
  const categoryChoices = categoryOptions(categories, subaccounts, costs);
  const subaccountChoices = subaccountOptions(form.categoryId, subaccounts, costs);
  const units = unitChoices(scope.countryName, scope.technology);
  const costError = costAmountError(form.cost) ?? undefined;
  const update = (patch: Partial<DevexForm>) => setForm((f) => ({ ...f, ...patch, dirty: true }));

  const save = async () => {
    if (!panel) return;
    const plan = planSaveStandardCost({
      form, scope, subaccountName: subaccount?.name ?? "", existing: panel.existing, canEdit,
      noPermissionText: MSG.noPermission, incompleteText: MSG.incomplete,
    });
    const categoryId = form.categoryId;
    closePanel();
    const done = await writes.run({ progress: MSG.savingCost, plan, errorText: plainError });
    if (done) setOpen(reopenAfterWrite(categoryId));
  };

  const confirmDelete = async () => {
    const cost = toDelete;
    setToDelete(null);
    if (!cost) return;
    const done = await writes.run({
      progress: MSG.deleting, errorText: MSG.devexDeleteError,
      plan: planDeleteStandardCost(cost, canEdit, MSG.noPermission),
    });
    if (done) setOpen(reopenAfterWrite(cost.categoryId));
  };

  return (
    <>
      <div className={s.commandRow}>
        <Button
          appearance="outline" className={s.outlineButton} icon={<AddRegular />}
          aria-label={L.addCost} data-testid="btn_Admin_Cost_DevexCapex_AddCost"
          disabled={!canEdit} onClick={() => openPanel(null)}
        >
          {L.addCost}
        </Button>
      </div>

      <div className={s.tableWrap}>
        <Table className={s.devexTable} size="small" aria-label={C.category}
          data-testid="con_DevexCapex_Content_StandardCosts_Card_Body_Costs">
          <TableHeader>
            <TableRow>
              {DEVEX_COLUMN_HEADERS.map((h, i) => <TableHeaderCell key={i} className={s.headerCell}>{h}</TableHeaderCell>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => r.kind === "category" ? (
              <TableRow key={`c:${r.category.id}`} className={s.headRow}>
                <TableCell>
                  <span className={s.actions}>
                    <Button
                      appearance="subtle" size="small"
                      aria-label={r.open ? L.collapse : L.expand} aria-expanded={r.open}
                      data-testid="Button2_2"
                      onClick={() => setOpen(toggleDevexCategory(open, r.category.id))}
                    >
                      {r.open ? L.collapse : L.expand}
                    </Button>
                    {devexCategoryCell(r)}
                  </span>
                </TableCell>
                <TableCell colSpan={DEVEX_COLUMN_HEADERS.length - 1} />
              </TableRow>
            ) : (
              <TableRow key={`d:${r.cost.id}`}>
                <TableCell className={s.cell} title={devexCategoryCell(r)}>{devexCategoryCell(r)}</TableCell>
                <TableCell className={s.cell} title={devexAccountCell(r)}>{devexAccountCell(r)}</TableCell>
                <TableCell className={s.cell} title={devexSubaccountCell(r)}>{devexSubaccountCell(r)}</TableCell>
                <TableCell className={s.cell} title={r.cost.descriptionInput ?? ""}>{r.cost.descriptionInput ?? ""}</TableCell>
                <TableCell className={s.cell}>{devexCostCell(r.cost)}</TableCell>
                <TableCell className={s.cell}>{devexClusterCell(r.cost)}</TableCell>
                <TableCell>
                  <Tooltip content={devexCommentTooltip(r.cost)} relationship="description">
                    <Button
                      appearance="subtle" size="small" icon={<CommentRegular />}
                      aria-label={C.comment}
                      data-testid="img_DevexCapex_Content_StandardCosts_CardBody_CostsTable_Comment"
                      disabled={!canEdit} onClick={() => openPanel(r.cost)}
                    />
                  </Tooltip>
                </TableCell>
                <TableCell>
                  <span className={s.actions}>
                    <Button
                      appearance="subtle" size="small" icon={<EditRegular />} aria-label={L.edit}
                      data-testid="btn_DevexCapex_Content_StandardCosts_CardBody_CostsTable_Action_Edit"
                      disabled={!canEdit} onClick={() => openPanel(r.cost)}
                    />
                    <Button
                      appearance="subtle" size="small" icon={<DeleteRegular />} aria-label={L.delete}
                      data-testid="btn_DevexCapex_Content_StandardCosts_CardBody_CostsTable_Action_delete"
                      disabled={!canEdit} onClick={() => setToDelete(r.cost)}
                    />
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* `con_AdminCost_RightPanel_Form_AddStandardCost` */}
      <FormPanel
        open={panel !== null}
        title={costPanelTitle(panel?.existing ? existingSub?.name ?? "" : null)}
        width="cost"
        onDismiss={closePanel}
        closeTestId="ico_btn_AdminCost_RightPanel_Form_AddStandardCost_Header_Cancel"
        footer={
          <PanelButtons
            onSave={() => { void save(); }}
            onCancel={closePanel}
            disabled={!canEdit || !canSaveStandardCost(form, scope)}
            saveTestId="pcf_btn_AdminCost_RightPanel_Form_AddStandardCost_Button_Save"
            cancelTestId="pcf_btn_AdminCost_RightPanel_Form_AddStandardCost_Button_Cancel"
          />
        }
      >
        <div className={s.panelBody}>
          <CostField
            label={C.description} required name="txt_AdminCost_RightPanel_Form_AddCost_Fields_Description"
            value={form.description} maxLength={DEVEX_DESCRIPTION_MAX_LENGTH}
            onChange={(v) => update({ description: v })}
          />

          <Field label={C.selectCluster} required>
            <div data-testid="chk_AdminCost_RightPanel_SelectClusters">
              {C.clusters.map((label, i) => (
                <Checkbox
                  key={label} label={label} aria-label={label} value={String(i + 1)}
                  data-testid={`chk_AdminCost_RightPanel_SelectCluster${i + 1}`}
                  checked={form.clusters[i] ?? false}
                  onChange={(_, d) => {
                    const next = [...form.clusters] as DevexForm["clusters"];
                    next[i] = Boolean(d.checked);
                    update({ clusters: next });
                  }}
                />
              ))}
            </div>
          </Field>

          <Field label={C.distributionFrequency} required>
            <Dropdown
              aria-label={C.distributionFrequency} placeholder={C.distributionFrequencyPlaceholder} disabled
              data-testid="cmb_AdminCost_RightPanel_Form_AddCost_Fields_Distribution_Frequency"
              value={FREQUENCY_OPTIONS.find((o) => o.value === DEVEX_DISTRIBUTION_FREQUENCY)?.label ?? ""}
              selectedOptions={[String(DEVEX_DISTRIBUTION_FREQUENCY)]}
            >
              {FREQUENCY_OPTIONS.map((o) => <Option key={o.value} value={String(o.value)}>{o.label}</Option>)}
            </Dropdown>
          </Field>

          <div className={s.commandRow}>
            <Checkbox label={C.applyVat} aria-label={C.applyVat} value="ApplyVat" checked={DEVEX_APPLY_VAT} disabled
              data-testid="chk_AdminCost_RightPanel_Form_AddCost_Fields_ApplyVat" />
            <Checkbox label={C.depreciation} aria-label={C.depreciation} value="Depreciation" checked={DEVEX_DEPRECIATION} disabled
              data-testid="chk_AdminCost_RightPanel_Form_AddCost_Fields_Depreciation" />
          </div>

          <Field label={C.category} required>
            <Dropdown
              aria-label={C.category} placeholder={C.categoryPlaceholder}
              data-testid="cmb_AdminCost_RightPanel_Form_AddCost_Fields_Category"
              value={categories.find((c) => c.id === form.categoryId)?.name ?? ""}
              selectedOptions={form.categoryId ? [form.categoryId] : []}
              onOptionSelect={(_, d) => setForm((f) => changeDevexCategory(f, d.optionValue ?? null))}
            >
              {categoryChoices.map((c) => <Option key={c.id} value={c.id}>{c.name}</Option>)}
            </Dropdown>
          </Field>

          <Field label={C.subaccount} required>
            <Dropdown
              aria-label={C.subaccount} placeholder={C.subaccountPlaceholder}
              data-testid="cmb_AdminCost_RightPanel_Form_AddCost_Fields_Subaccount"
              value={subaccount?.aggregatedName ?? ""}
              selectedOptions={form.subaccountId ? [form.subaccountId] : []}
              onOptionSelect={(_, d) => setForm((f) => changeDevexSubaccount(
                f, subById.get(d.optionValue ?? "") ?? null, mappingQ.data,
              ))}
            >
              {subaccountChoices.map((x) => <Option key={x.id} value={x.id}>{x.aggregatedName}</Option>)}
            </Dropdown>
          </Field>

          <Choices
            label={C.costPaidBy} required name="rad_AdminCost_RightPanel_Form_AddCost_Fields_Cost_Paid_By"
            value={costPaidLabel(form.costPaidBy)}
            options={COST_PAID_BY_OPTIONS.map((o) => o.label)}
            onChange={(v) => update({ costPaidBy: COST_PAID_BY_OPTIONS.find((o) => o.label === v)?.value ?? null })}
          />

          <Field label={C.unit} required>
            <Dropdown
              aria-label={C.unit} placeholder={C.unitPlaceholder}
              data-testid="cmb_AdminCost_RightPanel_Form_AddCost_Fields_Unit"
              value={unitLabel(form.unit)}
              selectedOptions={form.unit !== null ? [String(form.unit)] : []}
              onOptionSelect={(_, d) => setForm((f) => changeDevexUnit(f, Number(d.optionValue)))}
            >
              {units.map((u) => <Option key={u} value={String(u)}>{unitLabel(u)}</Option>)}
            </Dropdown>
          </Field>
          {!isUnitValid(form.unit, scope.technology) ? (
            <Text className={mergeClasses(s.error)} role="alert">{unitError(scope.countryName)}</Text>
          ) : null}

          <CostField
            label={C.cost(form.unit)} required name="txt_AdminCost_RightPanel_Form_AddCost_Fields_Cost"
            value={form.cost} maxLength={COST_MAX_LENGTH} error={costError}
            onChange={(v) => update({ cost: v })}
          />

          <CostField
            label={C.comment} name="txt_AdminCost_RightPanel_Form_AddCost_Fields_Comment"
            maxLength={DEVEX_COMMENT_MAX_LENGTH} counter={`${form.comment.length}/${DEVEX_COMMENT_MAX_LENGTH}`}
            value={form.comment} onChange={(v) => update({ comment: v })}
          />
        </div>
      </FormPanel>

      <ConfirmDialog
        open={toDelete !== null}
        title={deleteDialogTitle("cost")}
        description={deleteDialogDescription("cost", toDelete?.description ?? "")}
        confirmText={L.confirm}
        cancelText={L.cancel}
        onConfirm={() => { void confirmDelete(); }}
        onCancel={() => setToDelete(null)}
      />
    </>
  );
}
