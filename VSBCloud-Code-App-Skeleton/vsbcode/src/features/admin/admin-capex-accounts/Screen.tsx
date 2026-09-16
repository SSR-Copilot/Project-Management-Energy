/**
 * Admin CAPEX Accounts — layout and composition only.
 *
 * Canvas screen: `Admin CAPEX Accounts` (PM app)
 *   90 controls · 2 241 lines of Power Fx · 26 substantive blocks · band M
 *
 * NOT PROJECT-SCOPED — master data. No `useProjectContext()`; the user comes from the
 * store, entry is gated on `canSeeAdminSection` and every write on `canEditCountry` plus
 * the platform's table privileges. See rules.ts for why the route guard is not security.
 *
 * A `TabList` of categories, an accordion of accounts, a `DataGrid` of subaccounts with
 * the three action columns. The command items map 1:1 to the rule 3–6 predicates.
 */
import { useMemo, useState } from "react";
import {
  TabList, Tab, Accordion, AccordionItem, AccordionHeader, AccordionPanel,
  Field, Input, Dropdown, Option, Button, MessageBar, MessageBarBody,
  makeStyles, tokens,
} from "@fluentui/react-components";
import {
  AddRegular, DeleteRegular, EditRegular, ReOrderRegular, PlayRegular, PauseRegular,
  ArrowUpRegular, ArrowDownRegular, RadioButtonRegular, RadioButtonFilled,
} from "@fluentui/react-icons";
import {
  PageHeader, DataGrid, CommandBar, FormPanel, ConfirmDialog, LoadingOverlay,
  EmptyState, StateChip, type Command, type Column,
} from "@/components";
import { useAppStore } from "@/store/appStore";
import { canSeeAdminSection } from "@/domain/session";
import { CHOICE_ADMIN } from "@/data/entities";
import { space, media } from "@/theme/tokens";
import {
  MSG, listCategories, parentAccountsForReorder, canCreateAccount, canEditAccount,
  showActivate, showDeactivate, canReorderAccounts, canReorderSubaccounts,
  canDeleteAccount, deleteEnabled, subaccountRowIcons, canEditAccountScope,
  validateAccountForm, accountFormMessages, hasFormErrors, isNumberEditable,
  isCategoryEditable, composeSubaccountNumber, planSaveAccount, planDeactivateAccount,
  planActivateAccount, planDeleteAccount, planReorder,
  accountRowLabel, CAPEX_TOOLBAR_LABELS, sortToolbarCommands,
  type CapexAccount, type AccountForm,
} from "./rules";
import {
  useCapexTree, useCapexContracts, useCapexPrivileges, useRunCapexPlan, listCascadeCosts,
} from "./hooks";

const useStyles = makeStyles({
  page: { display: "flex", flexDirection: "column", gap: space.l, minWidth: 0 },
  tabs: { overflowX: "auto" },
  head: { display: "flex", alignItems: "center", gap: space.s, flexWrap: "wrap" },
  panelBody: { display: "flex", flexDirection: "column", gap: space.m },
  note: { color: tokens.colorNeutralForeground3, fontSize: "12px" },
  prefix: {
    fontVariantNumeric: "tabular-nums", color: tokens.colorNeutralForeground3,
    fontSize: "13px",
  },
  row: {
    display: "flex", alignItems: "center", gap: space.s, padding: `6px ${space.s}`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  grow: { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" },
  actions: { display: "flex", gap: "2px" },
  wrap: { display: "flex", flexDirection: "column", gap: space.m, [media.belowMd]: { gap: space.s } },
});

type PanelMode =
  | { kind: "account"; editing: CapexAccount | null }
  | { kind: "subaccount"; parent: CapexAccount; editing: CapexAccount | null };

export default function AdminCapexAccountsScreen() {
  const s = useStyles();
  const user = useAppStore((st) => st.session.user);
  const privileges = useCapexPrivileges();

  const { accounts, isLoading } = useCapexTree();
  const { contracts } = useCapexContracts();
  const run = useRunCapexPlan("adminCapex/save");

  const categories = useMemo(() => listCategories(accounts), [accounts]);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const category = categories.find((c) => c.id === categoryId) ?? categories[0] ?? null;

  const accountsInCategory = useMemo(
    () => accounts
      .filter((a) => category !== null && a.parentId === category.id)
      .sort((a, b) => a.order - b.order),
    [accounts, category],
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = accounts.find((a) => a.id === selectedId) ?? null;
  const subaccountsOf = (parentId: string) =>
    accounts.filter((a) => a.parentId === parentId).sort((a, b) => a.order - b.order);

  /**
   * `CAPEX Account Lists` carries no country column — the chart of accounts is global —
   * so the scope check degrades to "is this an admin or a controller", which is exactly
   * what `canEditAccountScope(user, null)` answers. It is applied to every plan below so
   * a bypassed route guard still writes nothing.
   */
  const canEdit = canEditAccountScope(user, null);

  const [panel, setPanel] = useState<PanelMode | null>(null);
  const [form, setForm] = useState<AccountForm>({ categoryId: null, name: "", number: "" });
  const [confirm, setConfirm] = useState<
    { kind: "deactivate" | "activate" | "delete"; account: CapexAccount; isSub: boolean } | null
  >(null);
  const [reorder, setReorder] = useState<{ level: "account" | "subaccount"; ids: string[] } | null>(null);
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

  const busy = run.isPending;
  const parents = parentAccountsForReorder(accounts);

  const existingNumbers = accounts.map((a) => a.number);

  const openAccountPanel = (editing: CapexAccount | null) => {
    setPanel({ kind: "account", editing });
    setForm({
      categoryId: editing ? editing.parentId : category?.id ?? null,
      name: editing?.name ?? "",
      number: editing?.number ?? "",
    });
  };
  const openSubaccountPanel = (parent: CapexAccount, editing: CapexAccount | null) => {
    setPanel({ kind: "subaccount", parent, editing });
    setForm({ categoryId: null, name: editing?.name ?? "", number: "" });
  };

  const isSub = panel?.kind === "subaccount";
  const isEdit = Boolean(panel && panel.editing);
  const panelParent: CapexAccount | null = panel === null
    ? null
    : panel.kind === "subaccount"
      ? panel.parent
      : categories.find((c) => c.id === form.categoryId) ?? null;

  const formErrors = panel
    ? validateAccountForm(form, {
        isSubaccount: isSub,
        isEdit,
        existingNumbers,
        parentNumber: panelParent?.number,
      })
    : null;

  const submit = () => {
    if (!panel) return;
    const siblings = panelParent ? subaccountsOf(panelParent.id) : [];
    const plan = planSaveAccount(form, {
      isSubaccount: isSub,
      isEdit,
      editingId: panel.editing?.id,
      parent: panelParent,
      siblings,
      existingNumbers,
      privileges,
      canEdit,
    });
    setError(plan.refusedReason ?? null);
    if (plan.refusedReason) return;
    run.mutate(plan, {
      onSuccess: () => { setPanel(null); setError(null); },
      onError: (e: unknown) => setError(e instanceof Error ? e.message : "Save failed."),
    });
  };

  // GUIDE p21: toolbar order and labels are "Reorder", "New", "Edit", "Deactivate" —
  // `sortToolbarCommands` places these (plus the hidden Activate/Delete slots) in that
  // sequence regardless of the order they're declared in below.
  const commands: Command[] = sortToolbarCommands<Command>([
    {
      key: "new", label: CAPEX_TOOLBAR_LABELS.new, icon: <AddRegular />, primary: true,
      disabled: !canCreateAccount(privileges) || busy,
      disabledReason: canCreateAccount(privileges) ? undefined : MSG.noCreatePrivilege,
      onClick: () => openAccountPanel(null),
    },
    {
      key: "edit", label: CAPEX_TOOLBAR_LABELS.edit, icon: <EditRegular />,
      disabled: !canEditAccount(selected, privileges) || busy,
      disabledReason: privileges.canWrite ? undefined : MSG.noWritePrivilege,
      onClick: () => selected && openAccountPanel(selected),
    },
    {
      key: "activate", label: CAPEX_TOOLBAR_LABELS.activate, icon: <PlayRegular />,
      visible: showActivate(selected),
      disabled: !privileges.canWrite || busy,
      onClick: () => selected && setConfirm({ kind: "activate", account: selected, isSub: false }),
    },
    {
      key: "deactivate", label: CAPEX_TOOLBAR_LABELS.deactivate, icon: <PauseRegular />,
      visible: showDeactivate(selected),
      disabled: !privileges.canWrite || busy,
      onClick: () => selected && setConfirm({ kind: "deactivate", account: selected, isSub: false }),
    },
    {
      key: "reorder", label: CAPEX_TOOLBAR_LABELS.reorder, icon: <ReOrderRegular />,
      disabled: !canReorderAccounts(parents, privileges) || busy,
      disabledReason: parents.length > 1 ? undefined : "There is nothing to reorder.",
      onClick: () => setReorder({ level: "account", ids: accountsInCategory.map((a) => a.id) }),
    },
    {
      key: "delete", label: CAPEX_TOOLBAR_LABELS.delete, icon: <DeleteRegular />, danger: true,
      // Rule 6 — HIDDEN, not merely disabled, when the account is in use.
      visible: canDeleteAccount(selected, accounts, contracts),
      disabled: !deleteEnabled(privileges) || busy,
      disabledReason: deleteEnabled(privileges) ? undefined : MSG.noDeletePrivilege,
      onClick: () => selected && setConfirm({ kind: "delete", account: selected, isSub: false }),
    },
  ]);

  return (
    <div className={s.page}>
      <PageHeader
        eyebrow="Administration"
        title="CAPEX Accounts"
        description={
          "The CAPEX chart of accounts. Deactivating an account zeroes the remainder of "
          + "this year's forecast costs and DELETES every future year — that cannot be "
          + "undone by reactivating it."
        }
      />

      {error && <MessageBar intent="error"><MessageBarBody>{error}</MessageBarBody></MessageBar>}

      {isLoading ? (
        <LoadingOverlay mode="inline" label="Loading the chart of accounts…" />
      ) : categories.length === 0 ? (
        <EmptyState
          title="No CAPEX categories"
          description={`No children of account ${"00001"} were found.`}
        />
      ) : (
        <>
          <TabList
            className={s.tabs}
            selectedValue={category?.id ?? ""}
            onTabSelect={(_, d) => { setCategoryId(String(d.value)); setSelectedId(null); }}
          >
            {categories.map((c) => <Tab key={c.id} value={c.id}>{c.name}</Tab>)}
          </TabList>

          <CommandBar commands={commands} />

          {accountsInCategory.length === 0 ? (
            <EmptyState title="No accounts in this category" description={MSG.emptyCategory} />
          ) : (
            <Accordion collapsible multiple>
              {accountsInCategory.map((account) => {
                const subs = subaccountsOf(account.id);
                const isSelected = account.id === selectedId;
                return (
                  <AccordionItem key={account.id} value={account.id}>
                    {/* GUIDE p21: a flat radio-select list — a filled radio marks the
                       selected row, the chevron (expand) sits at the right. */}
                    <AccordionHeader
                      expandIconPosition="end"
                      onClick={() => setSelectedId(account.id)}
                    >
                      <span className={s.head}>
                        {isSelected
                          ? <RadioButtonFilled aria-hidden />
                          : <RadioButtonRegular aria-hidden />}
                        {accountRowLabel(account)}
                        <StateChip
                          state={account.status === CHOICE_ADMIN.capexAccountStatus.active
                            ? "Active" : "Inactive"}
                        />
                      </span>
                    </AccordionHeader>
                    <AccordionPanel>
                      <div className={s.wrap}>
                        <CommandBar
                          commands={[
                            {
                              key: "addSub", label: "New subaccount", icon: <AddRegular />,
                              primary: true,
                              disabled: !canCreateAccount(privileges) || busy,
                              onClick: () => openSubaccountPanel(account, null),
                            },
                            {
                              key: "reorderSub", label: "Reorder subaccounts",
                              icon: <ReOrderRegular />,
                              // The canvas had NO privilege gate here; added deliberately.
                              disabled: !canReorderSubaccounts(subs, privileges) || busy,
                              disabledReason: privileges.canWrite
                                ? undefined : MSG.noWritePrivilege,
                              onClick: () =>
                                setReorder({ level: "subaccount", ids: subs.map((x) => x.id) }),
                            },
                          ]}
                        />
                        <SubaccountGrid
                          rows={subs}
                          contracts={contracts}
                          privileges={privileges}
                          busy={busy}
                          onEdit={(r) => openSubaccountPanel(account, r)}
                          onToggle={(r) =>
                            setConfirm({
                              kind: r.status === CHOICE_ADMIN.capexAccountStatus.active
                                ? "deactivate" : "activate",
                              account: r, isSub: true,
                            })}
                          onDelete={(r) => setConfirm({ kind: "delete", account: r, isSub: true })}
                        />
                      </div>
                    </AccordionPanel>
                  </AccordionItem>
                );
              })}
            </Accordion>
          )}
        </>
      )}

      <FormPanel
        open={panel !== null}
        title={
          panel === null ? ""
            : `${panel.editing ? "Edit" : "New"} ${panel.kind === "subaccount" ? "subaccount" : "account"}`
        }
        onClose={() => { setPanel(null); setError(null); }}
        onSave={submit}
        saveDisabled={formErrors === null || hasFormErrors(formErrors) || busy}
        busy={busy}
        errors={formErrors ? accountFormMessages(formErrors, isSub) : []}
      >
        <div className={s.panelBody}>
          {panel?.kind === "account" && (
            <Field label="Category" required>
              <Dropdown
                disabled={!isCategoryEditable(isEdit)}
                value={categories.find((c) => c.id === form.categoryId)?.name ?? ""}
                selectedOptions={form.categoryId ? [form.categoryId] : []}
                onOptionSelect={(_, d) =>
                  setForm((p) => ({ ...p, categoryId: String(d.optionValue) }))}
              >
                {categories.map((c) => <Option key={c.id} value={c.id}>{c.name}</Option>)}
              </Dropdown>
            </Field>
          )}

          <Field label="Name" required>
            <Input
              value={form.name}
              onChange={(_, d) => setForm((p) => ({ ...p, name: d.value }))}
            />
          </Field>

          <Field label="Number" required={!isEdit}>
            <Input
              value={isEdit && panel?.editing ? panel.editing.number : form.number}
              disabled={!isNumberEditable(isEdit)}
              contentBefore={
                panel?.kind === "subaccount" && !isEdit
                  ? <span className={s.prefix}>{`${panel.parent.number}_`}</span>
                  : undefined
              }
              onChange={(_, d) => setForm((p) => ({ ...p, number: d.value }))}
            />
          </Field>

          {panel?.kind === "subaccount" && !isEdit && form.number !== "" && (
            <span className={s.note}>
              {`Will be stored as ${composeSubaccountNumber(panel.parent.number, form.number)}`}
            </span>
          )}

          {!isEdit && (
            <MessageBar intent="info">
              <MessageBarBody>
                A newly created account is INACTIVE until somebody activates it. That is the
                canvas behaviour and it is deliberate — a new account must not be usable
                before it is reviewed.
              </MessageBarBody>
            </MessageBar>
          )}
          {isEdit && (
            <span className={s.note}>
              Only the name can be changed. Number and category are fixed once the account
              exists.
            </span>
          )}
        </div>
      </FormPanel>

      <FormPanel
        open={reorder !== null}
        title={reorder?.level === "subaccount" ? "Reorder subaccounts" : "Reorder accounts"}
        onClose={() => setReorder(null)}
        onSave={() => {
          if (!reorder) return;
          const plan = planReorder(accounts, reorder.ids, { privileges, canEdit });
          setError(plan.refusedReason ?? null);
          if (plan.refusedReason) return;
          run.mutate(plan, { onSuccess: () => setReorder(null) });
        }}
        busy={busy}
      >
        <div>
          {(reorder?.ids ?? []).map((id, i) => {
            const a = accounts.find((x) => x.id === id);
            return (
              <div key={id} className={s.row}>
                <span className={s.grow}>{`${a?.number ?? ""} ${a?.name ?? id}`}</span>
                <Button
                  appearance="subtle" size="small" icon={<ArrowUpRegular />}
                  aria-label="Move up" disabled={i === 0}
                  onClick={() => setReorder((p) => p && ({ ...p, ids: swap(p.ids, i, i - 1) }))}
                />
                <Button
                  appearance="subtle" size="small" icon={<ArrowDownRegular />}
                  aria-label="Move down" disabled={i === (reorder?.ids.length ?? 0) - 1}
                  onClick={() => setReorder((p) => p && ({ ...p, ids: swap(p.ids, i, i + 1) }))}
                />
              </div>
            );
          })}
        </div>
      </FormPanel>

      <ConfirmDialog
        open={confirm !== null}
        intent={confirm?.kind === "activate" ? "default" : "danger"}
        title={
          confirm === null ? ""
            : confirm.kind === "delete"
              ? (confirm.isSub
                  ? MSG.deleteSubaccount(confirm.account.name)
                  : MSG.deleteAccount(confirm.account.name))
              : confirm.kind === "deactivate"
                ? "Deactivate?"
                : "Activate?"
        }
        confirmLabel={confirm?.kind === "delete" ? "Delete" : "Confirm"}
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={() => void applyConfirm()}
      >
        {confirm === null ? null
          : confirm.kind === "deactivate"
            ? (confirm.isSub ? MSG.deactivateSubaccount : MSG.deactivateAccount)
            : confirm.kind === "activate"
              ? "Deleted forecast costs are NOT restored by activating the account again."
              : "This cannot be undone."}
      </ConfirmDialog>
    </div>
  );

  async function applyConfirm() {
    if (!confirm) return;
    const account = confirm.account;
    const subs = confirm.isSub ? [] : subaccountsOf(account.id);

    let plan;
    if (confirm.kind === "delete") {
      plan = planDeleteAccount(account, {
        subaccounts: accounts, contracts, privileges, canEdit,
      });
    } else if (confirm.kind === "activate") {
      plan = planActivateAccount(account, { privileges, canEdit });
    } else {
      const affected = new Set([account.id, ...subs.map((x) => x.id)]);
      const contractIds = contracts
        .filter((c) => c.accountId !== null && affected.has(c.accountId))
        .map((c) => c.id);
      const costs = await listCascadeCosts(contractIds, new Date());
      plan = planDeactivateAccount({
        account, subaccounts: subs, contracts, costs,
        today: new Date(), privileges, canEdit,
      });
    }
    setError(plan.refusedReason ?? null);
    if (plan.refusedReason) { setConfirm(null); return; }
    run.mutate(plan, { onSuccess: () => setConfirm(null) });
  }
}

function swap(ids: string[], a: number, b: number): string[] {
  if (b < 0 || b >= ids.length) return ids;
  const next = [...ids];
  [next[a], next[b]] = [next[b], next[a]];
  return next;
}

function SubaccountGrid({
  rows, contracts, privileges, busy, onEdit, onToggle, onDelete,
}: {
  rows: CapexAccount[];
  contracts: { id: string; accountId: string | null }[];
  privileges: ReturnType<typeof useCapexPrivileges>;
  busy: boolean;
  onEdit: (r: CapexAccount) => void;
  onToggle: (r: CapexAccount) => void;
  onDelete: (r: CapexAccount) => void;
}) {
  const s = useStyles();
  const columns: Column<CapexAccount>[] = [
    { key: "number", header: "Number", width: "140px", value: (r) => r.number },
    { key: "name", header: "Name", width: "minmax(180px, 2fr)", value: (r) => r.name },
    { key: "order", header: "Order", width: "80px", numeric: true, hideBelow: "md",
      value: (r) => r.order },
    {
      key: "status", header: "Status", width: "110px",
      render: (r) => (
        <StateChip
          state={r.status === CHOICE_ADMIN.capexAccountStatus.active ? "Active" : "Inactive"}
        />
      ),
    },
    {
      key: "actions", header: "", width: "150px",
      render: (r) => {
        const icons = subaccountRowIcons(r, privileges, contracts);
        return (
          <span className={s.actions}>
            {icons.edit && (
              <Button
                appearance="subtle" size="small" icon={<EditRegular />} aria-label="Edit"
                disabled={busy} onClick={() => onEdit(r)}
              />
            )}
            {icons.deactivate && (
              <Button
                appearance="subtle" size="small" icon={<PauseRegular />}
                aria-label="Deactivate" disabled={busy} onClick={() => onToggle(r)}
              />
            )}
            {/* The canvas could never render this one — its condition was a contradiction. */}
            {icons.activate && (
              <Button
                appearance="subtle" size="small" icon={<PlayRegular />}
                aria-label="Activate" disabled={busy} onClick={() => onToggle(r)}
              />
            )}
            {icons.delete && (
              <Button
                appearance="subtle" size="small" icon={<DeleteRegular />} aria-label="Delete"
                disabled={busy} onClick={() => onDelete(r)}
              />
            )}
          </span>
        );
      },
    },
  ];

  return (
    <DataGrid
      rows={rows}
      columns={columns}
      rowKey={(r) => r.id}
      emptyMessage={MSG.noSubaccounts}
      height={Math.min(340, 56 + rows.length * 44) || 140}
    />
  );
}
