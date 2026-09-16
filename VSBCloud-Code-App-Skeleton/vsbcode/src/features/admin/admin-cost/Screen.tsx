/**
 * Admin Cost Screen — layout and composition only.
 *
 * Canvas screen: `Admin Cost Screen` (PM app)
 *   352 controls · 9 286 lines of Power Fx · 117 substantive blocks · band XL
 *
 * NOT PROJECT-SCOPED — master data. No `useProjectContext()`; the user comes from the
 * store, entry is gated on `canSeeAdminSection` and every write on `canEditCountry` plus
 * the table privileges. See rules.ts: the canvas had ONE `DataSourceInfo` on 9 286 lines,
 * no check at all on the OPEX family, and a row-level check that FAILED OPEN.
 *
 * The screen is deliberately split: the scope bar plus four `CategoryPanel`s, each of
 * which mounts its family's editor. The two families' rules live in `opexRules.ts` and
 * `devexRules.ts`; nothing here branches on data.
 *
 * Apply and Apply-to-All are RENDERED BUT DISABLED, exactly as shipped, and no
 * `Apply and Apply All Trackings` row is written from the client — see `planApplyTracking`.
 *
 * GUIDE p23 — the middle rail here is the FLAG TREE (`CountryRail variant="tree"`), the
 * same shape Project Gates uses — deliberately different from the flat list Milestones
 * renders (p22). A slash breadcrumb reads "Standard Assumptions / Costs / {country} /
 * {technology}". GUIDE p24 — one screenshot catches the left admin rail highlighting
 * "Contracts" while this screen's own title/breadcrumb still read "Costs"; that is recorded
 * in rules.ts as a transitional state, not a second view to build here.
 */
import { useMemo, useState } from "react";
import {
  Accordion, AccordionItem, AccordionHeader, AccordionPanel, Dropdown, Option, Field,
  Input, Switch, Checkbox, Button, Badge, MessageBar, MessageBarBody, Menu, MenuTrigger,
  MenuPopover, MenuList, MenuItem, makeStyles, tokens,
} from "@fluentui/react-components";
import {
  AddRegular, SubtractRegular, DeleteRegular, EditRegular, CheckboxCheckedRegular,
  InfoRegular,
} from "@fluentui/react-icons";
import {
  PageHeader, DataGrid, CommandBar, FormPanel, ConfirmDialog, LoadingOverlay,
  EmptyState, NumericInput, CountryRail, Breadcrumb, type CountryRailNode,
  type Command, type Column,
} from "@/components";
import { useAppStore } from "@/store/appStore";
import { canSeeAdminSection } from "@/domain/session";
import { CHOICE_ADMIN, CHOICE_PRODUCTION } from "@/data/entities";
import { space, media } from "@/theme/tokens";
import {
  COST_CATEGORIES, showAddContractType, showAddCost, canEditScope, emptyScope,
  buildCountryPicker, COST_CONTRACT_EXCLUDED_COUNTRIES,
  technologyValue, applyCommandState, findLastApply, lastAppliedLabel, showLastApplied,
  costRailLeafKey, parseCostRailLeafKey, costBreadcrumb, APPLY_OVERRIDE_CAPTION,
  /* opex */
  splitOpexSubaccounts, subaccountMenuLabel, canAddContractType, filterByScope,
  periodLabel, paymentSectionsFor, canAddPeriod, ADD_PERIOD_BLOCKED_REASON,
  emptyOpexForm, validateOpexPeriod, canSaveOpexPeriod, planSaveOpexPeriod,
  planDeleteOpexPeriodOrContract, PERIOD_ONE, CONTRACT_COSTS_MAX,
  /* devex */
  groupByCategory, isScopeChosen, unitChoices, defaultUnit, isUnitValid,
  costAmountError, emptyDevexForm, applySubaccountSelection, applyUnitChange,
  validateDevexForm, canSaveStandardCost, planSaveStandardCost, planDeleteStandardCost,
  isSubaccountSelectable, costPaidByChoices, COST_MAX_LENGTH,
  unitLabel, costPaidLabel, formatDevexCostAmount, categoryAccountColumnLabel,
  subAccountColumnLabel,
  type CostScope, type CostCategoryRow, type OpexPeriodRow, type OpexPeriodForm,
  type DevexCost, type DevexForm, type DevexRow, type ApplyTrackingRow,
} from "./rules";
import {
  useCostCountries, useCostCategories, useCapexSubaccounts, useOpexSubaccounts,
  useLandLeaseSubaccounts, useOpexAssumptions, useDevexCosts, useApplyTracking,
  useCostPrivileges, useRunCostPlan,
} from "./hooks";

const useStyles = makeStyles({
  page: { display: "flex", flexDirection: "column", gap: space.l, minWidth: 0 },
  layout: {
    display: "flex", flex: 1, minHeight: 0, gap: space.l,
    [media.belowMd]: { flexDirection: "column" },
  },
  rail: {
    width: "240px", flex: "none", borderRadius: "4px", overflow: "hidden",
    borderTopWidth: "1px", borderRightWidth: "1px", borderBottomWidth: "1px",
    borderLeftWidth: "1px", borderTopStyle: "solid", borderRightStyle: "solid",
    borderBottomStyle: "solid", borderLeftStyle: "solid", borderTopColor: tokens.colorNeutralStroke2,
    borderRightColor: tokens.colorNeutralStroke2, borderBottomColor: tokens.colorNeutralStroke2,
    borderLeftColor: tokens.colorNeutralStroke2,
    [media.belowMd]: { width: "auto" },
  },
  content: { display: "flex", flexDirection: "column", gap: space.m, flex: 1, minWidth: 0 },
  head: { display: "flex", alignItems: "center", gap: space.s, flexWrap: "wrap" },
  panelBody: { display: "flex", flexDirection: "column", gap: space.m },
  grid2: {
    display: "grid", gap: space.m, gridTemplateColumns: "1fr 1fr",
    [media.belowMd]: { gridTemplateColumns: "1fr" },
  },
  note: { color: tokens.colorNeutralForeground3, fontSize: "12px" },
  clusters: { display: "flex", gap: space.s, flexWrap: "wrap" },
  block: { display: "flex", flexDirection: "column", gap: space.m },
  applyAllRow: { display: "flex", alignItems: "center", gap: space.s, flexWrap: "wrap" },
  captionRow: {
    display: "flex", alignItems: "center", gap: "4px",
    color: tokens.colorNeutralForeground3, fontSize: "12px",
  },
});

export default function AdminCostScreen() {
  const s = useStyles();
  const user = useAppStore((st) => st.session.user);
  const { countries } = useCostCountries();

  // Rule 21's default-scope defect fixed: nothing is chosen until the admin chooses it.
  const [scope, setScope] = useState<CostScope>(emptyScope());
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
  const pickerItems = useMemo(
    () => buildCountryPicker(countries, { exclude: COST_CONTRACT_EXCLUDED_COUNTRIES }),
    [countries],
  );

  // GUIDE p23 — the flag TREE, one leaf per country × technology (see `costRailLeafKey`).
  const railItems: CountryRailNode[] = useMemo(
    () => pickerItems.map((c) => ({
      key: c.id,
      label: c.name,
      children: c.technologies.map((t) => ({ key: costRailLeafKey(c.id, t), label: t })),
    })),
    [pickerItems],
  );
  const selectedLeafKey = scope.countryId && scope.technology
    ? costRailLeafKey(scope.countryId, scope.technology) : null;

  const canEdit = canEditScope(user, scope);
  const { rows: tracking } = useApplyTracking(scope);
  const [error, setError] = useState<string | null>(null);

  if (!user) return <LoadingOverlay mode="inline" />;
  if (!canSeeAdminSection(user)) {
    return (
      <EmptyState
        title="Administration is not available to your account"
        description="These screens need the VSB - Application Administrator or VSB - Controller Own Data security role."
      />
    );
  }

  const apply = applyCommandState();

  return (
    <div className={s.page}>
      <PageHeader
        eyebrow="Administration"
        title="Costs"
        description={
          "The master-data source for the Project Costs app: DEVEX/CAPEX standard costs and "
          + "the three OPEX families, per country and technology."
        }
      />

      <MessageBar intent="info"><MessageBarBody>{apply.disabledReason}</MessageBarBody></MessageBar>

      <div className={s.layout}>
        <div className={s.rail}>
          <CountryRail
            items={railItems}
            variant="tree"
            selectedKey={selectedLeafKey}
            expandedKeys={expandedKeys}
            onExpandedChange={setExpandedKeys}
            onSelect={(key) => {
              const parsed = parseCostRailLeafKey(key);
              if (!parsed) return;
              const c = pickerItems.find((x) => x.id === parsed.countryId) ?? null;
              setScope({
                countryId: parsed.countryId, countryName: c?.name ?? null,
                technology: parsed.technology, technologyValue: technologyValue(parsed.technology),
              });
              setExpandedKeys((prev) =>
                prev.includes(parsed.countryId) ? prev : [...prev, parsed.countryId]);
            }}
            ariaLabel="Country"
          />
        </div>

        <div className={s.content}>
          <Breadcrumb items={costBreadcrumb(scope)} separator="/" />

          <div className={s.applyAllRow}>
            {/* Rule 34 — DISABLED AS SHIPPED. */}
            <Button appearance="secondary" disabled icon={<CheckboxCheckedRegular />}>
              Apply to All
            </Button>
            <span className={s.captionRow}><InfoRegular /> {APPLY_OVERRIDE_CAPTION}</span>
          </div>

          {!canEdit && isScopeChosen(scope) && (
            <MessageBar intent="warning">
              <MessageBarBody>
                This country is outside your editable country scope, so the standard costs are
                read-only.
              </MessageBarBody>
            </MessageBar>
          )}
          {error && <MessageBar intent="error"><MessageBarBody>{error}</MessageBarBody></MessageBar>}

          {!isScopeChosen(scope) ? (
            <EmptyState
              title="Pick a country and technology"
              description="Standard costs are authored one country × technology at a time. Click a technology leaf in the rail on the left. The canvas app silently defaulted to the first country and Wind here."
            />
          ) : (
            <Accordion collapsible multiple defaultOpenItems={[COST_CATEGORIES[0].category]}>
              {COST_CATEGORIES.map((row) => (
                <AccordionItem key={row.category} value={row.category}>
                  <AccordionHeader>
                    <span className={s.head}>
                      {row.category}
                      <LastAppliedBadge
                        tracking={tracking} scope={scope} contractType={row.typeOfCategory}
                      />
                    </span>
                  </AccordionHeader>
                  <AccordionPanel>
                    {row.family === "devex" ? (
                      <DevexPanel
                        scope={scope} canEdit={canEdit} tracking={tracking} onError={setError}
                      />
                    ) : (
                      <OpexPanel
                        row={row} scope={scope} canEdit={canEdit} onError={setError}
                      />
                    )}
                  </AccordionPanel>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </div>
      </div>
    </div>
  );
}

/** Rule 36 — the "last applied" string, hidden when there is no row for the scope. */
function LastAppliedBadge({
  tracking, scope, contractType,
}: {
  tracking: ReturnType<typeof useApplyTracking>["rows"];
  scope: CostScope;
  contractType: number;
}) {
  const row = findLastApply(tracking, scope, contractType, CHOICE_ADMIN.applyAction.apply);
  if (!showLastApplied(row)) return null;
  return <Badge appearance="tint" size="small">{lastAppliedLabel(row)}</Badge>;
}

/* ══════════════════════════════════════════════════════════════════ the OPEX panel ════ */

function OpexPanel({
  row, scope, canEdit, onError,
}: {
  row: CostCategoryRow;
  scope: CostScope;
  canEdit: boolean;
  onError: (m: string | null) => void;
}) {
  const s = useStyles();
  const kind: "landLease" | "opex" = row.family === "landLease" ? "landLease" : "opex";
  const { rows, isLoading } = useOpexAssumptions(scope, row.typeOfCategory);
  const { subaccounts: opexSubs } = useOpexSubaccounts();
  const { subaccounts: llSubs } = useLandLeaseSubaccounts();
  const privileges = useCostPrivileges("opex");
  const run = useRunCostPlan("adminCost/opex");

  const menuSubaccounts = useMemo(() => {
    if (kind === "landLease") return llSubs;
    const split = splitOpexSubaccounts(opexSubs);
    return row.typeOfCategory === CHOICE_ADMIN.contractTypes.opexOandM
      ? split.oAndM : split.otherOpex;
  }, [kind, llSubs, opexSubs, row.typeOfCategory]);

  const scoped = useMemo(
    () => filterByScope(rows, scope, row.typeOfCategory),
    [rows, scope, row.typeOfCategory],
  );

  /** Rule 8's `IsCollapsed?` column replaced by local state. */
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const contractKeyOf = (r: OpexPeriodRow) =>
    r.landLeaseSubaccountId ?? r.opexSubaccountId ?? r.id;

  const visible = useMemo(
    () => scoped.filter((r) => r.period === PERIOD_ONE || expanded.has(contractKeyOf(r))),
    [scoped, expanded],
  );

  const [panel, setPanel] = useState<
    { subaccountId: string; existing: OpexPeriodRow | null; reference: OpexPeriodRow | null } | null
  >(null);
  const [form, setForm] = useState<OpexPeriodForm>(emptyOpexForm());
  const [dirty, setDirty] = useState(false);
  const [confirm, setConfirm] = useState<OpexPeriodRow | null>(null);

  const payments = paymentSectionsFor(panel?.reference ?? null);
  const validation = {
    countryName: scope.countryName,
    showSecondPayment: payments.showSecond,
    showThirdPayment: payments.showThird,
    isDirty: dirty,
  };

  const siblingsOf = (r: OpexPeriodRow) =>
    scoped.filter((x) => contractKeyOf(x) === contractKeyOf(r));

  const columns: Column<OpexPeriodRow>[] = [
    { key: "period", header: "Period", width: "110px", value: (r) => periodLabel(r.period) },
    { key: "description", header: "Description", width: "minmax(160px, 2fr)",
      value: (r) => r.description ?? "" },
    { key: "last", header: "Last", width: "80px", hideBelow: "md",
      render: (r) => (r.isLastPeriod ? <Badge appearance="tint" size="small">Yes</Badge> : <span>—</span>) },
    {
      key: "actions", header: "", width: "190px",
      render: (r) => (
        <span>
          <Button
            appearance="subtle" size="small" icon={<EditRegular />} aria-label="Edit"
            disabled={!canEdit || !privileges.canWrite}
            onClick={() => {
              setPanel({
                subaccountId: r.landLeaseSubaccountId ?? r.opexSubaccountId ?? "",
                existing: r, reference: null,
              });
              setForm(emptyOpexForm());
              setDirty(false);
            }}
          />
          <Button
            appearance="subtle" size="small" icon={<AddRegular />} aria-label="Add period"
            disabled={!canEdit || !privileges.canCreate || !canAddPeriod(r.period)}
            title={canAddPeriod(r.period) ? undefined : ADD_PERIOD_BLOCKED_REASON}
            onClick={() => {
              setPanel({
                subaccountId: r.landLeaseSubaccountId ?? r.opexSubaccountId ?? "",
                existing: null, reference: r,
              });
              setForm(emptyOpexForm());
              setDirty(false);
            }}
          />
          {r.period !== PERIOD_ONE && (
            <Button
              appearance="subtle" size="small" aria-label="Collapse"
              onClick={() => toggle(contractKeyOf(r))}
            >
              …
            </Button>
          )}
          <Button
            appearance="subtle" size="small" icon={<DeleteRegular />} aria-label="Delete"
            disabled={!canEdit || !privileges.canDelete}
            onClick={() => setConfirm(r)}
          />
        </span>
      ),
    },
  ];

  const toggle = (contractKey: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(contractKey)) next.delete(contractKey); else next.add(contractKey);
      return next;
    });

  const commands: Command[] = [
    {
      key: "addContract", label: "Add contract type", icon: <AddRegular />, primary: true,
      visible: showAddContractType(row),
      disabled: !canEdit || !privileges.canCreate,
      onClick: () => undefined,
    },
    {
      key: "apply", label: "Apply", icon: <CheckboxCheckedRegular />,
      disabled: true,
      disabledReason: applyCommandState().disabledReason,
      onClick: () => undefined,
    },
  ];

  return (
    <div className={s.block}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <CommandBar commands={commands} />
        <Menu>
          <MenuTrigger disableButtonEnhancement>
            <Button size="small" disabled={!canEdit}>Subaccounts</Button>
          </MenuTrigger>
          <MenuPopover>
            <MenuList>
              {menuSubaccounts.map((sub) => {
                const enabled = canAddContractType(
                  rows, sub.id, scope, row.typeOfCategory, kind,
                );
                return (
                  <MenuItem
                    key={sub.id}
                    disabled={!enabled || !canEdit}
                    onClick={() => {
                      setPanel({ subaccountId: sub.id, existing: null, reference: null });
                      setForm(emptyOpexForm());
                      setDirty(false);
                    }}
                  >
                    {subaccountMenuLabel(sub.name)}
                  </MenuItem>
                );
              })}
            </MenuList>
          </MenuPopover>
        </Menu>
      </div>

      <DataGrid
        rows={visible}
        columns={columns}
        rowKey={(r) => r.id}
        loading={isLoading}
        emptyMessage="No standard contracts for this scope yet."
        height={Math.min(360, 56 + visible.length * 44) || 140}
      />

      <FormPanel
        open={panel !== null}
        title={panel?.existing ? "Edit period" : "New period"}
        onClose={() => { setPanel(null); onError(null); }}
        onSave={() => {
          if (!panel) return;
          const plan = planSaveOpexPeriod({
            form, scope, typeOfContract: row.typeOfCategory,
            subaccountId: panel.subaccountId, subaccountKind: kind,
            existing: panel.existing, reference: panel.reference,
            siblings: panel.existing ? siblingsOf(panel.existing) : [],
            owningBusinessUnitId: null, canEdit, validation,
          });
          onError(plan.refusedReason ?? null);
          if (plan.refusedReason) return;
          run.mutate({ plan, scope }, { onSuccess: () => setPanel(null) });
        }}
        saveDisabled={!canSaveOpexPeriod(form, validation)}
        busy={run.isPending}
        errors={validateOpexPeriod(form, validation)}
      >
        <OpexForm
          form={form}
          payments={payments}
          onChange={(next) => { setForm(next); setDirty(true); }}
        />
      </FormPanel>

      <ConfirmDialog
        open={confirm !== null}
        intent="danger"
        title={confirm?.period === PERIOD_ONE ? "Delete the whole contract?" : "Delete this period?"}
        confirmLabel="Delete"
        busy={run.isPending}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          if (!confirm) return;
          const plan = planDeleteOpexPeriodOrContract({
            target: confirm, contractPeriods: siblingsOf(confirm), canEdit,
          });
          onError(plan.refusedReason ?? null);
          if (plan.refusedReason) { setConfirm(null); return; }
          run.mutate({ plan, scope }, { onSuccess: () => setConfirm(null) });
        }}
      >
        {confirm?.period === PERIOD_ONE
          ? "Deleting Period 1 deletes every period of this contract."
          : "The remaining periods keep their numbering; the last-period flag moves to the highest remaining period."}
      </ConfirmDialog>
    </div>
  );
}

function OpexForm({
  form, payments, onChange,
}: {
  form: OpexPeriodForm;
  payments: { showSecond: boolean; showThird: boolean };
  onChange: (next: OpexPeriodForm) => void;
}) {
  const s = useStyles();
  const set = <K extends keyof OpexPeriodForm>(k: K, v: OpexPeriodForm[K]) =>
    onChange({ ...form, [k]: v });

  return (
    <div className={s.panelBody}>
      <Field label="Description" required>
        <Input value={form.description} onChange={(_, d) => set("description", d.value)} />
      </Field>

      <Switch
        label="One-time payment"
        checked={form.oneTimePayment}
        onChange={(_, d) => set("oneTimePayment", d.checked)}
      />

      {form.oneTimePayment ? (
        <div className={s.grid2}>
          <NumericInput
            label="Amount" value={form.amount} places={2} min={0} max={CONTRACT_COSTS_MAX}
            onChange={(v) => set("amount", v)}
          />
          <Field label="Due date">
            <Input
              type="date" value={form.dueDate ?? ""}
              onChange={(_, d) => set("dueDate", d.value || null)}
            />
          </Field>
        </div>
      ) : (
        <div className={s.grid2}>
          <NumericInput
            label="Duration (years)" value={String(form.durationYears ?? "")} places={0}
            onChange={(v) => set("durationYears", v === "" ? null : Number(v))}
          />
          <NumericInput
            label="Duration (months)" value={String(form.durationMonths ?? "")} places={0}
            onChange={(v) => set("durationMonths", v === "" ? null : Number(v))}
          />
          <Field label="Aggregation">
            <Dropdown
              selectedOptions={form.aggregation !== null ? [String(form.aggregation)] : []}
              onOptionSelect={(_, d) => set("aggregation", Number(d.optionValue))}
            >
              <Option value={String(CHOICE_PRODUCTION.aggregation.sum)}>Sum</Option>
              <Option value={String(CHOICE_PRODUCTION.aggregation.max)}>Max</Option>
              <Option value={String(CHOICE_PRODUCTION.aggregation.min)}>Min</Option>
            </Dropdown>
          </Field>
          <NumericInput
            label="Distribution frequency (months)"
            value={String(form.distributionFrequency ?? "")} places={0}
            onChange={(v) => set("distributionFrequency", v === "" ? null : Number(v))}
          />
        </div>
      )}

      {payments.showSecond && (
        <div className={s.grid2}>
          <NumericInput
            label="Amount 2" value={form.amount2} places={2} min={0} max={CONTRACT_COSTS_MAX}
            onChange={(v) => set("amount2", v)}
          />
          <Field label="Due date 2">
            <Input
              type="date" value={form.dueDate2 ?? ""}
              onChange={(_, d) => set("dueDate2", d.value || null)}
            />
          </Field>
        </div>
      )}
      {payments.showThird && (
        <div className={s.grid2}>
          <NumericInput
            label="Amount 3" value={form.amount3} places={2} min={0} max={CONTRACT_COSTS_MAX}
            onChange={(v) => set("amount3", v)}
          />
          <Field label="Due date 3">
            <Input
              type="date" value={form.dueDate3 ?? ""}
              onChange={(_, d) => set("dueDate3", d.value || null)}
            />
          </Field>
        </div>
      )}

      <Switch
        label="Apply inflation" checked={form.inflation}
        onChange={(_, d) => set("inflation", d.checked)}
      />
      {form.inflation && (
        <>
          <Field label="Inflation start year">
            <Input
              value={form.inflationStartYear}
              onChange={(_, d) => set("inflationStartYear", d.value)}
            />
          </Field>
          <Switch
            label="Use the country inflation profile"
            checked={form.useCountryInflationProfile}
            onChange={(_, d) => set("useCountryInflationProfile", d.checked)}
          />
          {!form.useCountryInflationProfile && (
            <NumericInput
              label="Inflation profile" value={form.inflationProfile} places={2}
              onChange={(v) => set("inflationProfile", v)}
            />
          )}
        </>
      )}

      <Switch
        label="Threshold" checked={form.threshold}
        onChange={(_, d) => set("threshold", d.checked)}
      />
      {form.threshold && (
        <>
          <Field label="Threshold type">
            <Dropdown
              selectedOptions={form.thresholdType !== null ? [String(form.thresholdType)] : []}
              onOptionSelect={(_, d) => set("thresholdType", Number(d.optionValue))}
            >
              <Option value={String(CHOICE_ADMIN.thresholdType.individual)}>Individual</Option>
              <Option value={String(CHOICE_ADMIN.thresholdType.portfolio)}>Portfolio</Option>
            </Dropdown>
          </Field>
          {form.thresholdType === CHOICE_ADMIN.thresholdType.individual && (
            <NumericInput
              label="Threshold value" value={form.thresholdIndividual} places={2}
              onChange={(v) => set("thresholdIndividual", v)}
            />
          )}
        </>
      )}

      <Switch
        label="Align with the project duration" checked={form.alignWithProjectDuration}
        onChange={(_, d) => set("alignWithProjectDuration", d.checked)}
      />
      <Switch
        label="All WTG allocated" checked={form.allWtgAllocated}
        onChange={(_, d) => set("allWtgAllocated", d.checked)}
      />
      <Switch
        label="Secured" checked={form.secured}
        onChange={(_, d) => set("secured", d.checked)}
      />

      <span className={s.note}>
        Editing Period 1 copies seventeen settings down to every later period. Rates,
        aggregation, durations and the distribution frequency stay per-period.
      </span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════ the DEVEX panel ════ */

function DevexPanel({
  scope, canEdit, tracking, onError,
}: {
  scope: CostScope; canEdit: boolean; tracking: ApplyTrackingRow[];
  onError: (m: string | null) => void;
}) {
  const s = useStyles();
  const { categories } = useCostCategories({ excludeOverleveraging: true });
  const { costs, isLoading } = useDevexCosts(scope);
  const { subaccounts } = useCapexSubaccounts();
  const privileges = useCostPrivileges("devex");
  const run = useRunCostPlan("adminCost/devex");

  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const rows = useMemo(
    () => groupByCategory(categories, costs, expanded),
    [categories, costs, expanded],
  );

  const [panel, setPanel] = useState<{ existing: DevexCost | null } | null>(null);
  const [form, setForm] = useState<DevexForm>(emptyDevexForm(scope.countryName));
  const [confirm, setConfirm] = useState<DevexCost | null>(null);

  const subaccountName =
    subaccounts.find((x) => x.id === form.subaccountId)?.name ?? "";
  const subaccountById = useMemo(
    () => new Map(subaccounts.map((x) => [x.id, x])), [subaccounts],
  );
  const subaccountOf = (cost: DevexCost) => cost.subaccountId
    ? subaccountById.get(cost.subaccountId) : undefined;

  // GUIDE p23 — "02.09.2025 Apply was made by …", scoped to THIS category's Apply row.
  const lastApply = findLastApply(
    tracking, scope, CHOICE_ADMIN.contractTypes.devexCapex, CHOICE_ADMIN.applyAction.apply,
  );

  // GUIDE p23 — Category / Account, Sub-Account, Description, Cost. Horizontally scrollable,
  // which needs every column to carry a definite width.
  const columns: Column<DevexRow>[] = [
    {
      key: "categoryAccount", header: "Category / Account", width: "220px",
      render: (r) => r.kind === "category"
        ? (
          <Button
            appearance="subtle" size="small"
            icon={expanded.has(r.category.id) ? <SubtractRegular /> : <AddRegular />}
            onClick={() => setExpanded((p) => {
              const next = new Set(p);
              if (next.has(r.category.id)) next.delete(r.category.id);
              else next.add(r.category.id);
              return next;
            })}
          >
            {r.category.name}
          </Button>
        )
        : (() => {
            const sub = subaccountOf(r.cost);
            return <span>{categoryAccountColumnLabel(sub?.parentName ?? "", sub?.name ?? "")}</span>;
          })(),
    },
    {
      key: "subAccount", header: "Sub-Account", width: "260px",
      value: (r) => {
        if (r.kind !== "cost") return "";
        const sub = subaccountOf(r.cost);
        return subAccountColumnLabel(sub?.parentName ?? "", sub?.name ?? "", sub?.number ?? "");
      },
    },
    {
      key: "description", header: "Description", width: "220px",
      value: (r) => (r.kind === "cost" ? (r.cost.descriptionInput ?? r.cost.description ?? "") : ""),
    },
    {
      key: "cost", header: "Cost", width: "140px", numeric: true,
      value: (r) => (r.kind === "cost" ? formatDevexCostAmount(r.cost.costAmount, r.cost.unit) : ""),
    },
    {
      key: "actions", header: "", width: "110px",
      render: (r) => r.kind === "cost" ? (
        <span>
          <Button
            appearance="subtle" size="small" icon={<EditRegular />} aria-label="Edit"
            // Rule 19's fail-open closed: an undetermined privilege denies.
            disabled={!canEdit || !privileges.canWrite}
            onClick={() => {
              setPanel({ existing: r.cost });
              setForm({
                ...emptyDevexForm(scope.countryName),
                subaccountId: r.cost.subaccountId,
                categoryId: r.cost.categoryId,
                description: r.cost.descriptionInput ?? "",
                cost: String(r.cost.costAmount ?? ""),
                unit: r.cost.unit,
                costPaidBy: r.cost.costPaidBy,
                distributionFrequency: r.cost.distributionFrequency,
                comment: r.cost.comment ?? "",
                clusters: r.cost.clusters,
                dirty: false,
              });
            }}
          />
          <Button
            appearance="subtle" size="small" icon={<DeleteRegular />} aria-label="Delete"
            disabled={!canEdit || !privileges.canDelete}
            onClick={() => setConfirm(r.cost)}
          />
        </span>
      ) : null,
    },
  ];

  const commands: Command[] = [
    {
      key: "addCost", label: "Add Cost", icon: <AddRegular />, primary: true,
      visible: showAddCost(COST_CATEGORIES[0]),
      disabled: !canEdit || !privileges.canCreate,
      disabledReason: privileges.canCreate
        ? undefined : "You do not have permission to create standard costs.",
      onClick: () => {
        setPanel({ existing: null });
        setForm(emptyDevexForm(scope.countryName));
      },
    },
    {
      // Rule 34 — DISABLED AS SHIPPED, same as the page-level "Apply to All".
      key: "apply", label: "Apply", icon: <CheckboxCheckedRegular />,
      disabled: true,
      disabledReason: applyCommandState().disabledReason,
      onClick: () => undefined,
    },
  ];

  const errors = validateDevexForm(form, scope);

  return (
    <div className={s.block}>
      {showLastApplied(lastApply) && (
        <MessageBar intent="info"><MessageBarBody>{lastAppliedLabel(lastApply)}</MessageBarBody></MessageBar>
      )}
      <div className={s.applyAllRow}>
        <CommandBar commands={commands} />
        <span className={s.captionRow}>{APPLY_OVERRIDE_CAPTION}</span>
      </div>
      <DataGrid
        rows={rows}
        columns={columns}
        rowKey={(r) => (r.kind === "category" ? `c:${r.category.id}` : `d:${r.cost.id}`)}
        loading={isLoading}
        emptyMessage="No standard costs for this scope yet."
        horizontalScroll
        height={Math.min(400, 56 + rows.length * 44) || 140}
      />

      <FormPanel
        open={panel !== null}
        title={panel?.existing ? "Edit standard cost" : "New standard cost"}
        onClose={() => { setPanel(null); onError(null); }}
        onSave={() => {
          if (!panel) return;
          const plan = planSaveStandardCost({
            form, scope, subaccountName, existing: panel.existing,
            owningBusinessUnitId: null, canEdit,
            canCreate: privileges.canCreate, canWriteRecord: privileges.canWrite,
          });
          onError(plan.refusedReason ?? null);
          if (plan.refusedReason) return;
          run.mutate({ plan, scope }, { onSuccess: () => setPanel(null) });
        }}
        saveDisabled={!canSaveStandardCost(form, scope)}
        busy={run.isPending}
        errors={errors}
      >
        <div className={s.panelBody}>
          <Field label="Subaccount" required>
            <Dropdown
              selectedOptions={form.subaccountId ? [form.subaccountId] : []}
              onOptionSelect={(_, d) => {
                const sub = subaccounts.find((x) => x.id === d.optionValue);
                setForm(applySubaccountSelection(
                  form, String(d.optionValue), sub?.categoryId ?? null,
                ));
              }}
            >
              {subaccounts
                .filter((sub) => isSubaccountSelectable(costs, sub.id))
                .map((sub) => (
                  <Option key={sub.id} value={sub.id}>
                    {`${sub.parentName} / ${sub.name} ${sub.number}`}
                  </Option>
                ))}
            </Dropdown>
          </Field>

          <Field label="Description" required>
            <Input
              value={form.description}
              onChange={(_, d) => setForm({ ...form, description: d.value, dirty: true })}
            />
          </Field>

          <Field label="Unit" required>
            <Dropdown
              value={unitLabel(form.unit)}
              selectedOptions={form.unit !== null ? [String(form.unit)] : []}
              onOptionSelect={(_, d) => setForm(applyUnitChange(form, Number(d.optionValue)))}
            >
              {unitChoices(scope.countryName, scope.technology).map((u) => (
                <Option key={u} value={String(u)}>{unitLabel(u)}</Option>
              ))}
            </Dropdown>
          </Field>
          {!isUnitValid(form.unit, scope.technology) && (
            <span className={s.note}>A per-WTG unit can only be used for Wind.</span>
          )}

          <Field
            label="Cost"
            required
            validationState={costAmountError(form.cost) ? "error" : "none"}
            validationMessage={costAmountError(form.cost) ?? undefined}
          >
            <Input
              value={form.cost}
              maxLength={COST_MAX_LENGTH}
              inputMode="numeric"
              onChange={(_, d) => setForm({ ...form, cost: d.value, dirty: true })}
            />
          </Field>

          <Field label="Cost paid by" required>
            <Dropdown
              selectedOptions={form.costPaidBy !== null ? [String(form.costPaidBy)] : []}
              onOptionSelect={(_, d) =>
                setForm({ ...form, costPaidBy: Number(d.optionValue), dirty: true })}
            >
              {costPaidByChoices().map((c) => (
                <Option key={c} value={String(c)}>{costPaidLabel(c)}</Option>
              ))}
            </Dropdown>
          </Field>

          <NumericInput
            label="Distribution frequency (months)"
            value={String(form.distributionFrequency ?? "")}
            places={0}
            onChange={(v) => setForm({
              ...form, distributionFrequency: v === "" ? null : Number(v), dirty: true,
            })}
          />

          <Field label="Clusters" required>
            <div className={s.clusters}>
              {[0, 1, 2, 3, 4].map((i) => (
                <Checkbox
                  key={i}
                  label={`Cluster ${i + 1}`}
                  checked={form.clusters[i]}
                  onChange={(_, d) => {
                    const next = [...form.clusters] as DevexForm["clusters"];
                    next[i] = Boolean(d.checked);
                    setForm({ ...form, clusters: next, dirty: true });
                  }}
                />
              ))}
            </div>
          </Field>

          <Field label="Comment">
            <Input
              value={form.comment}
              onChange={(_, d) => setForm({ ...form, comment: d.value, dirty: true })}
            />
          </Field>

          <span className={s.note}>
            {`The default unit for ${scope.countryName ?? "this country"} is `}
            {unitLabel(defaultUnit(scope.countryName))}
            {". Changing the unit clears the amount."}
          </span>
        </div>
      </FormPanel>

      <ConfirmDialog
        open={confirm !== null}
        intent="danger"
        title="Delete this standard cost?"
        confirmLabel="Delete"
        busy={run.isPending}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          if (!confirm) return;
          const plan = planDeleteStandardCost(confirm, canEdit);
          onError(plan.refusedReason ?? null);
          if (plan.refusedReason) { setConfirm(null); return; }
          run.mutate({ plan, scope }, { onSuccess: () => setConfirm(null) });
        }}
      >
        No Apply tracking row is written — the canvas delete handler recorded a phantom
        “Apply All” every time a cost was deleted.
      </ConfirmDialog>
    </div>
  );
}
