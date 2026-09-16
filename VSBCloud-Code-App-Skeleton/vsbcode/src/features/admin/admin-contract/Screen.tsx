/**
 * Admin Contract Screen — layout and composition only.
 *
 * Canvas screen: `Admin Contract Screen` (PM app)
 *   145 controls · 3 985 lines of Power Fx · 43 substantive blocks · band M
 *
 * NOT PROJECT-SCOPED — master data. No `useProjectContext()`; the user comes from the
 * store, entry is gated on `canSeeAdminSection` and every write on `canEditCountry`. See
 * rules.ts: the canvas had NO permission signal of any kind on this screen, and the route
 * guard here is not security either.
 *
 * BEHAVIOUR CHANGES, each flagged in rules.ts:
 *  - the ten-contract caps DISABLE the Add buttons and recompute from the live query,
 *    instead of firing a warning toast off a value captured in `OnVisible` (rules 3, 4);
 *  - the collapsed card is real components with a `ROOT_ACCOUNT_RANK` constant, not an
 *    `HtmlViewer` fed by `Concat(...)` (rule 18);
 *  - `RootCapexAccount` is included in the child create, so a new card is never blank
 *    (rule 16);
 *  - the "last applied" badge reads THIS screen's scope, passed as a prop (rule 21);
 *  - the dead hidden `CheckBox` with live handlers (rule 10) is not ported.
 */
import { useMemo, useState } from "react";
import {
  Accordion, AccordionItem, AccordionHeader, AccordionPanel, Dropdown, Option, Field,
  Input, Switch, Radio, RadioGroup, Button, Badge, MessageBar, MessageBarBody, Checkbox,
  makeStyles, tokens,
} from "@fluentui/react-components";
import {
  AddRegular, DeleteRegular, EditRegular, CheckboxCheckedRegular,
} from "@fluentui/react-icons";
import {
  PageHeader, CommandBar, FormPanel, ConfirmDialog, LoadingOverlay, EmptyState, Card,
  NumericInput, type Command,
} from "@/components";
import { useAppStore } from "@/store/appStore";
import { canSeeAdminSection } from "@/domain/session";
import { CHOICE_ADMIN } from "@/data/entities";
import { lastAppliedLabel, showLastApplied, findLastApply } from "@/features/admin/admin-cost/rules";
import { space, media } from "@/theme/tokens";
import {
  MSG, CONTRACT_CAP, CONTRACT_COSTS_MAX, CONTRACT_TYPE_LABEL, CONTRACT_TYPE_VALUE,
  buildCountryPicker, COST_CONTRACT_EXCLUDED_COUNTRIES, PICKER_TECHNOLOGIES,
  technologyValue, classifyAccounts, parentTriState, parentToggleEnabled, toggleParent,
  toggleAccount, nextExpandedId, contractCapReached, countContracts, canEditScope,
  validateContract, canSaveContract, closingDateLabelVisible, emptyContractForm,
  toContractForm, planSaveContract, planDeleteContract, groupCostsForCard,
  applyCommandState, selectableNodes,
  type ContractScope, type BopContract, type BopContractType, type ContractForm,
  type AccountSelection, type AccountNode,
} from "./rules";
import {
  useContractCountries, useContractAccountTree, useBopContracts, useDevCoCosts,
  useContractApplyTracking, useSaveContract, useDeleteContract,
} from "./hooks";

const useStyles = makeStyles({
  page: { display: "flex", flexDirection: "column", gap: space.l, minWidth: 0 },
  scopeBar: {
    display: "flex", gap: space.m, flexWrap: "wrap", alignItems: "flex-end",
    [media.belowMd]: { gap: space.s },
  },
  cards: { display: "flex", flexDirection: "column", gap: space.m },
  cardHead: {
    display: "flex", alignItems: "center", gap: space.s, flexWrap: "wrap",
    justifyContent: "space-between",
  },
  group: { display: "flex", flexDirection: "column", gap: "4px" },
  groupTitle: {
    fontSize: "11px", textTransform: "uppercase", letterSpacing: ".06em",
    color: tokens.colorNeutralForeground3, fontWeight: 600,
  },
  tags: { display: "flex", gap: "6px", flexWrap: "wrap" },
  panelBody: { display: "flex", flexDirection: "column", gap: space.m },
  grid2: {
    display: "grid", gap: space.m, gridTemplateColumns: "1fr 1fr",
    [media.belowMd]: { gridTemplateColumns: "1fr" },
  },
  treeNode: {
    display: "flex", alignItems: "center", gap: space.s, padding: `4px ${space.s}`,
  },
  treeChildren: { paddingLeft: space.xl, display: "flex", flexDirection: "column" },
  note: { color: tokens.colorNeutralForeground3, fontSize: "12px" },
});

export default function AdminContractScreen() {
  const s = useStyles();
  const user = useAppStore((st) => st.session.user);
  const { countries } = useContractCountries();

  const [scope, setScope] = useState<ContractScope>({
    countryId: null, countryName: null, technology: null, technologyValue: null,
  });
  const pickerItems = useMemo(
    () => buildCountryPicker(countries, { exclude: COST_CONTRACT_EXCLUDED_COUNTRIES }),
    [countries],
  );

  const { tree, isLoading: treeLoading } = useContractAccountTree();
  const { contracts, isLoading } = useBopContracts(scope);
  const { costs } = useDevCoCosts(scope);
  const { rows: tracking } = useContractApplyTracking(scope);

  const canEdit = canEditScope(user, scope);
  const save = useSaveContract();
  const remove = useDeleteContract();

  const [panel, setPanel] = useState<
    { type: BopContractType; existing: BopContract | null } | null
  >(null);
  const [form, setForm] = useState<ContractForm>(emptyContractForm());
  const [before, setBefore] = useState<Map<string, AccountSelection>>(new Map());
  const [after, setAfter] = useState<Map<string, AccountSelection>>(new Map());
  const [expandedNode, setExpandedNode] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<BopContract | null>(null);
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

  const scopeChosen = Boolean(scope.countryId && scope.technology);
  const apply = applyCommandState();
  const busy = save.isPending || remove.isPending;

  const openPanel = (type: BopContractType, existing: BopContract | null) => {
    const classified = classifyAccounts(tree, costs, existing?.id ?? null);
    setPanel({ type, existing });
    setForm(toContractForm(existing));
    setBefore(classified);
    setAfter(new Map(classified));
    setExpandedNode(null);
  };

  const selectedCount = [...after.values()].filter((a) => a.selected && !a.used).length;

  const addCommand = (type: BopContractType): Command => {
    const reached = contractCapReached(contracts, scope, type);
    return {
      key: `add-${type}`,
      label: `Add ${CONTRACT_TYPE_LABEL[type]}`,
      icon: <AddRegular />,
      primary: type === "development",
      // Rules 3/4 fixed: DISABLED, and recomputed from the live list on every render.
      disabled: !canEdit || reached || busy || !scopeChosen,
      disabledReason: reached
        ? MSG.capReached(type, scope.countryName ?? "", scope.technology ?? "")
        : canEdit ? undefined : MSG.outOfScope,
      onClick: () => openPanel(type, null),
    };
  };

  const commands: Command[] = [
    addCommand("development"),
    addCommand("construction"),
    {
      key: "applyAll", label: "Apply to all", icon: <CheckboxCheckedRegular />,
      disabled: true,
      disabledReason: apply.disabledReason,
      onClick: () => undefined,
    },
  ];

  return (
    <div className={s.page}>
      <PageHeader
        eyebrow="Administration"
        title="BoP Standard Contracts"
        description={
          "Up to ten development and ten construction contracts per country and technology. "
          + "Each CAPEX subaccount belongs to at most one contract in the scope."
        }
      />

      <div className={s.scopeBar}>
        <Field label="Country">
          <Dropdown
            placeholder="Select a country"
            value={scope.countryName ?? ""}
            selectedOptions={scope.countryId ? [scope.countryId] : []}
            onOptionSelect={(_, d) => {
              const c = pickerItems.find((x) => x.id === d.optionValue) ?? null;
              setScope((p) => ({
                ...p, countryId: c?.id ?? null, countryName: c?.name ?? null,
              }));
            }}
          >
            {pickerItems.map((c) => <Option key={c.id} value={c.id}>{c.name}</Option>)}
          </Dropdown>
        </Field>
        <Field label="Technology">
          <Dropdown
            placeholder="Select a technology"
            value={scope.technology ?? ""}
            selectedOptions={scope.technology ? [scope.technology] : []}
            onOptionSelect={(_, d) => {
              const t = String(d.optionValue);
              setScope((p) => ({ ...p, technology: t, technologyValue: technologyValue(t) }));
            }}
          >
            {PICKER_TECHNOLOGIES.map((t) => <Option key={t} value={t}>{t}</Option>)}
          </Dropdown>
        </Field>
      </div>

      <MessageBar intent="info"><MessageBarBody>{apply.disabledReason}</MessageBarBody></MessageBar>
      {!canEdit && scopeChosen && (
        <MessageBar intent="warning"><MessageBarBody>{MSG.outOfScope}</MessageBarBody></MessageBar>
      )}
      {error && <MessageBar intent="error"><MessageBarBody>{error}</MessageBarBody></MessageBar>}

      <CommandBar commands={commands} />

      {!scopeChosen ? (
        <EmptyState
          title="Pick a country and technology"
          description="BoP standard contracts are authored one country × technology at a time."
        />
      ) : isLoading || treeLoading ? (
        <LoadingOverlay mode="inline" label="Loading contracts…" />
      ) : contracts.length === 0 ? (
        <EmptyState title="No contracts yet" description={MSG.noContracts} />
      ) : (
        <div className={s.cards}>
          {(["development", "construction"] as BopContractType[]).map((type) => (
            <ContractSection
              key={type}
              type={type}
              contracts={contracts.filter(
                (c) => c.contractType === CONTRACT_TYPE_VALUE[type],
              )}
              costs={costs}
              tracking={tracking}
              scope={scope}
              canEdit={canEdit}
              busy={busy}
              onEdit={(c) => openPanel(type, c)}
              onDelete={setConfirm}
            />
          ))}
        </div>
      )}

      <FormPanel
        open={panel !== null}
        title={
          panel === null ? ""
            : `${panel.existing ? "Edit" : "New"} ${CONTRACT_TYPE_LABEL[panel.type]}`
        }
        onClose={() => { setPanel(null); setError(null); }}
        onSave={() => {
          if (!panel) return;
          const plan = planSaveContract({
            form, type: panel.type, scope, existing: panel.existing,
            contractId: panel.existing?.id ?? null,
            before, after, tree, owningBusinessUnitId: null, canEdit,
          });
          setError(plan.refusedReason ?? null);
          if (plan.refusedReason) return;
          save.mutate(
            { plan, scope, isCreate: panel.existing === null },
            {
              onSuccess: () => { setPanel(null); setError(null); },
              onError: (e: unknown) =>
                setError(e instanceof Error ? e.message : "Error saving Contract"),
            },
          );
        }}
        saveDisabled={
          panel === null
          || !canSaveContract(form, {
            selectedCount, isEdit: panel.existing !== null, canEdit,
          })
        }
        busy={busy}
        errors={
          panel === null
            ? []
            : validateContract(form, { selectedCount, isEdit: panel.existing !== null })
        }
      >
        {panel !== null && (
          <div className={s.panelBody}>
            <Field label="Description" required>
              <Input
                value={form.description}
                onChange={(_, d) => setForm({ ...form, description: d.value, dirty: true })}
              />
            </Field>

            <Field label="Costs until the closing date" required>
              <RadioGroup
                value={form.closingDateReference !== null ? String(form.closingDateReference) : ""}
                onChange={(_, d) =>
                  setForm({ ...form, closingDateReference: Number(d.value), dirty: true })}
              >
                <Radio value="952850000" label="Signing date" />
                <Radio value="952850001" label="Financial close" />
                <Radio value="952850002" label="Commercial operation date" />
              </RadioGroup>
            </Field>
            {closingDateLabelVisible(panel.existing !== null, form.closingDateReference) && (
              <span className={s.note}>{MSG.closingDateEmpty}</span>
            )}

            <div className={s.grid2}>
              <Field label="Sign">
                <Dropdown
                  value={form.monthSign}
                  selectedOptions={[form.monthSign]}
                  onOptionSelect={(_, d) =>
                    setForm({ ...form, monthSign: d.optionValue as "+" | "−", dirty: true })}
                >
                  <Option value="+">+</Option>
                  <Option value="−">−</Option>
                </Dropdown>
              </Field>
              <Field label="Month difference" required>
                <Input
                  value={form.months}
                  inputMode="numeric"
                  maxLength={2}
                  onChange={(_, d) => setForm({ ...form, months: d.value, dirty: true })}
                />
              </Field>
            </div>

            <Switch
              label="Margin"
              checked={form.margin}
              onChange={(_, d) => setForm({ ...form, margin: d.checked, dirty: true })}
            />
            {form.margin && (
              <>
                <Field label="Margin type" required>
                  <RadioGroup
                    value={form.marginType !== null ? String(form.marginType) : ""}
                    onChange={(_, d) =>
                      setForm({ ...form, marginType: Number(d.value), dirty: true })}
                  >
                    <Radio
                      value={String(CHOICE_ADMIN.contractMarginType.percentage)}
                      label="Percentage"
                    />
                    <Radio
                      value={String(CHOICE_ADMIN.contractMarginType.fixedValue)}
                      label="Fixed value"
                    />
                  </RadioGroup>
                </Field>
                {form.marginType === CHOICE_ADMIN.contractMarginType.percentage && (
                  <NumericInput
                    label="Margin percentage" value={form.marginPercentage}
                    places={1} min={0} max={100} unit="%"
                    onChange={(v) => setForm({ ...form, marginPercentage: v, dirty: true })}
                  />
                )}
                {form.marginType === CHOICE_ADMIN.contractMarginType.fixedValue && (
                  <NumericInput
                    label="Margin fixed value" value={form.marginFixedValue}
                    places={2} min={0} max={CONTRACT_COSTS_MAX}
                    onChange={(v) => setForm({ ...form, marginFixedValue: v, dirty: true })}
                  />
                )}
              </>
            )}

            <Field label="Comment">
              <Input
                value={form.comment}
                onChange={(_, d) => setForm({ ...form, comment: d.value, dirty: true })}
              />
            </Field>

            <Field label={`CAPEX accounts (${selectedCount} selected)`} required>
              <AccountTree
                tree={tree}
                selections={after}
                expandedNode={expandedNode}
                onExpand={(id) => setExpandedNode(nextExpandedId(expandedNode, id))}
                onToggleLeaf={(id) => { setAfter(toggleAccount(after, id)); setForm({ ...form, dirty: true }); }}
                onToggleParent={(children) => {
                  const toggled = toggleParent(children);
                  const next = new Map(after);
                  for (const c of toggled) next.set(c.accountId, c);
                  setAfter(next);
                  setForm({ ...form, dirty: true });
                }}
              />
            </Field>

            <span className={s.note}>
              Accounts already owned by another contract in this scope are locked. A parent
              reads “checked” only when this contract owns every child of the group —
              the canvas semantics, kept deliberately.
            </span>
          </div>
        )}
      </FormPanel>

      <ConfirmDialog
        open={confirm !== null}
        intent="danger"
        title={MSG.deleteTitle}
        confirmLabel="Delete"
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          if (!confirm) return;
          const plan = planDeleteContract({
            contract: confirm, ownedCosts: costs, canEdit,
          });
          setError(plan.refusedReason ?? null);
          if (plan.refusedReason) { setConfirm(null); return; }
          remove.mutate({ plan, scope }, { onSuccess: () => setConfirm(null) });
        }}
      >
        The contract and the DevCo-cost rows that lock its CAPEX accounts are removed
        together, so the accounts become available again.
      </ConfirmDialog>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────── the card list */

function ContractSection({
  type, contracts, costs, tracking, scope, canEdit, busy, onEdit, onDelete,
}: {
  type: BopContractType;
  contracts: BopContract[];
  costs: ReturnType<typeof useDevCoCosts>["costs"];
  tracking: ReturnType<typeof useContractApplyTracking>["rows"];
  scope: ContractScope;
  canEdit: boolean;
  busy: boolean;
  onEdit: (c: BopContract) => void;
  onDelete: (c: BopContract) => void;
}) {
  const s = useStyles();
  // Rule 21 fixed — the badge reads THIS screen's scope, passed in as a prop.
  const last = findLastApply(
    tracking, scope, CHOICE_ADMIN.contractTypes.bop, CHOICE_ADMIN.applyAction.apply,
  );

  return (
    <Card
      title={`${CONTRACT_TYPE_LABEL[type]}s (${contracts.length}/${CONTRACT_CAP})`}
      actions={showLastApplied(last)
        ? <Badge appearance="tint" size="small">{lastAppliedLabel(last)}</Badge>
        : undefined}
    >
      {contracts.length === 0 ? (
        <span className={s.note}>{MSG.noContracts}</span>
      ) : (
        <Accordion collapsible multiple>
          {contracts.map((c) => (
            <AccordionItem key={c.id} value={c.id}>
              <AccordionHeader>
                <span className={s.cardHead}>
                  <span>{c.description ?? c.name ?? c.id}</span>
                  {c.margin && <Badge appearance="tint" size="small">Margin</Badge>}
                </span>
              </AccordionHeader>
              <AccordionPanel>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div className={s.tags}>
                    <Button
                      appearance="subtle" size="small" icon={<EditRegular />}
                      disabled={!canEdit || busy} onClick={() => onEdit(c)}
                    >
                      Edit
                    </Button>
                    <Button
                      appearance="subtle" size="small" icon={<DeleteRegular />}
                      disabled={!canEdit || busy} onClick={() => onDelete(c)}
                    >
                      Delete
                    </Button>
                    <Button
                      appearance="subtle" size="small" icon={<CheckboxCheckedRegular />}
                      // Rule 20 — `DisplayMode.Disabled` as shipped.
                      disabled
                      title={applyCommandState().disabledReason}
                    >
                      Apply
                    </Button>
                  </div>
                  <span className={s.note}>
                    {`Closing-date offset: ${c.monthDifference ?? 0} month(s)`}
                  </span>
                  {/* Rule 18 — real components, no HtmlViewer, no inline SVG strings. */}
                  {groupCostsForCard(costs, c.id).map((group) => (
                    <div key={group.rootAccountName} className={s.group}>
                      <span className={s.groupTitle}>{group.rootAccountName}</span>
                      <div className={s.tags}>
                        {group.subaccounts.map((sub) => (
                          <Badge key={sub.id} appearance="outline" size="small">
                            {sub.label}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </AccordionPanel>
            </AccordionItem>
          ))}
        </Accordion>
      )}
      <span className={s.note}>
        {`${countContracts(contracts, scope, type)} of ${CONTRACT_CAP} used. `}
        The Add button disables at the cap; the canvas fired a toast instead and recomputed
        the cap only on screen entry.
      </span>
    </Card>
  );
}

/* ────────────────────────────────────────────────────────────────── the tree */

function AccountTree({
  tree, selections, expandedNode, onExpand, onToggleLeaf, onToggleParent,
}: {
  tree: AccountNode[];
  selections: Map<string, AccountSelection>;
  expandedNode: string | null;
  onExpand: (id: string) => void;
  onToggleLeaf: (id: string) => void;
  onToggleParent: (children: AccountSelection[]) => void;
}) {
  const s = useStyles();

  const childrenOf = (node: AccountNode): AccountSelection[] =>
    node.children
      .map((c) => selections.get(c.id))
      .filter((x): x is AccountSelection => Boolean(x));

  return (
    <div>
      {tree.map((category) => (
        <div key={category.id}>
          <div className={s.treeNode}>
            <Button appearance="subtle" size="small" onClick={() => onExpand(category.id)}>
              {`${category.number} ${category.name}`}
            </Button>
          </div>
          {expandedNode === category.id && (
            <div className={s.treeChildren}>
              {category.children.map((account) => {
                const children = childrenOf(account);
                const state = parentTriState(children);
                return (
                  <div key={account.id}>
                    <div className={s.treeNode}>
                      <Checkbox
                        checked={
                          state === "CHECKED" ? true
                            : state === "PARTIAL" ? "mixed" : false
                        }
                        disabled={!parentToggleEnabled(children)}
                        onChange={() => onToggleParent(children)}
                        label={`${account.number} ${account.name}`}
                      />
                      {state === "LOCKED" && (
                        <Badge appearance="outline" size="small">Locked</Badge>
                      )}
                    </div>
                    <div className={s.treeChildren}>
                      {account.children.map((leaf) => {
                        const sel = selections.get(leaf.id);
                        return (
                          <div key={leaf.id} className={s.treeNode}>
                            <Checkbox
                              checked={sel?.selected === true}
                              disabled={sel?.used === true}
                              onChange={() => onToggleLeaf(leaf.id)}
                              label={`${leaf.number} ${leaf.name}`}
                            />
                            {sel?.used && (
                              <Badge appearance="outline" size="small">
                                Owned by another contract
                              </Badge>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}
      <span className={s.note}>
        {`${selectableNodes(tree).length} selectable subaccounts. Only level-3 nodes can be claimed.`}
      </span>
    </div>
  );
}
