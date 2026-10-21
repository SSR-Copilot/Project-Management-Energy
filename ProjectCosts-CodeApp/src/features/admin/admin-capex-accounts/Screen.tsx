/**
 * Admin CAPEX Accounts — composition only (connected to Dataverse 19 Oct 2026, D19).
 *
 * Canvas screen: `Admin CAPEX Accounts` (PM app),
 * `ProjectDocs/_extracted/msapp/projectmanagement/Src/Admin CAPEX Accounts.pa.yaml`.
 *
 * Structure, matching the canvas containers:
 *   heading                    `cmp_Admin_CAPEX_Accounts_Header` (Project.Name)
 *   category tabs              `tab_Admin_CAPEX_Accounts_RightContent_Parents`
 *   command bar                `pcf_Admin_CAPEX_Accounts_RightContent_Parents_CommandBar`
 *   account cards              `gal_Account_Accounts` → `con_Account_AccountCard`
 *     subaccount command bar   `pcf_Account_AccountCardBody_SubAccountsCommandBar`
 *     subaccount grid          `pcf_Account_AccountCardBody_SubAccounts`
 *   right panel: account      `con_Account_RightPanel_NewEditAccount`
 *   right panel: subaccount   `con_Account_RightPanel_NewEditSubaccount`
 *   right panel: ordering     `con_Account_RightPanel_Ordering` (PowerDragDrop → `ReorderList`)
 *   four confirmations         `cmp_Account_PopUpConfirmation_*`
 *
 * Every decision lives in `rules.ts`; every query and write in `hooks.ts`. While a write runs, the
 * canvas progress text (`locSpinnerInformationText`) is shown; a refused or failed write is shown
 * as a message instead of failing silently.
 */
import { useMemo, useState } from "react";
import {
  Button, Dropdown, Input, Option, Tab, TabList,
  Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow, Text, makeStyles, tokens,
} from "@fluentui/react-components";
import {
  ChevronDownRegular, ChevronUpRegular, DeleteRegular, EditRegular,
  RadioButtonFilled, RadioButtonRegular, PlayRegular, PauseRegular,
} from "@fluentui/react-icons";
import {
  type Command,
  CommandBar,
  CommandSlot,
  ConfirmDialog,
  CostField,
  EmptyState,
  FormPanel,
  LoadingOverlay,
  PanelButtons,
  ReorderList,
  WriteFeedback,
} from "@/components";
import { CHOICE_ADMIN } from "@/data/dataverseNames";
import { useAdminAccess } from "@/app/useCurrentUser";
import { palette, space } from "@/theme/tokens";
import {
  CAPEX_SCREEN_TEXT as T, CAPEX_TOOLBAR_LABELS, MSG, NAME_MAX_LENGTH,
  accountRowLabel, canCreateAccount, canDeleteAccount, canEditAccount, canReorderAccounts,
  canReorderSubaccounts, deleteEnabled, hasFormErrors, isCategoryEditable, isNumberEditable,
  listCategories, planActivateAccount, planDeleteAccount, planReorder, showActivate,
  showDeactivate, showSubaccountPrefix, sortToolbarCommands, subaccountRowIcons,
  toggleSelection, validateAccountForm,
  type AccountForm, type CapexAccount,
} from "./rules";
import {
  cascadeDeactivatePlan, checkedSavePlan, useCapexContracts, useCapexPrivileges, useCapexTree,
  useCapexWrites,
} from "./hooks";

const useStyles = makeStyles({
  /**
   * The command bar's first icon starts on the left edge of the content under it (PO, 21 Oct
   * 2026); `CommandBar` has no inset of its own. The card bar sits over the sub-account table's first
   * column text: Fluent's 8 px cell padding.
   */
  commandBar: { paddingLeft: space.s },
  page: {
    display: "flex", flexDirection: "column", rowGap: space.m, minWidth: 0,
    paddingTop: space.m, paddingBottom: space.m, paddingLeft: space.l, paddingRight: space.l,
  },
  title: { fontSize: "20px", lineHeight: "28px", fontWeight: tokens.fontWeightSemibold },
  tabs: { overflowX: "auto" },
  gallery: { display: "flex", flexDirection: "column", rowGap: space.s },
  card: {
    borderTopWidth: "1px", borderRightWidth: "1px", borderBottomWidth: "1px", borderLeftWidth: "1px",
    borderTopStyle: "solid", borderRightStyle: "solid", borderBottomStyle: "solid", borderLeftStyle: "solid",
    borderTopColor: palette.neutralQuaternaryAlt, borderRightColor: palette.neutralQuaternaryAlt,
    borderBottomColor: palette.neutralQuaternaryAlt, borderLeftColor: palette.neutralQuaternaryAlt,
    borderTopLeftRadius: "4px", borderTopRightRadius: "4px",
    borderBottomLeftRadius: "4px", borderBottomRightRadius: "4px",
    backgroundColor: palette.white,
  },
  cardHeader: {
    display: "flex", alignItems: "center", columnGap: space.s, minHeight: "42px",
    paddingLeft: space.s, paddingRight: space.s,
  },
  cardTitle: {
    flexGrow: 1, minWidth: 0, overflowX: "hidden", textOverflow: "ellipsis",
    whiteSpace: "nowrap", fontWeight: tokens.fontWeightSemibold,
  },
  status: {
    fontSize: tokens.fontSizeBase200, paddingLeft: space.s, paddingRight: space.s,
    borderTopLeftRadius: "10px", borderTopRightRadius: "10px",
    borderBottomLeftRadius: "10px", borderBottomRightRadius: "10px",
    backgroundColor: palette.neutralLighter,
  },
  cardBody: {
    display: "flex", flexDirection: "column", rowGap: space.xs,
    paddingLeft: space.s, paddingRight: space.s, paddingBottom: space.s,
    borderTopWidth: "1px", borderTopStyle: "solid", borderTopColor: palette.neutralQuaternaryAlt,
  },
  tableWrap: { overflowX: "auto" },
  /** `HeaderVisible: =false` — the headers stay in the DOM for assistive tech only. */
  srOnly: {
    position: "absolute", width: "1px", height: "1px", overflowX: "hidden", overflowY: "hidden",
    clipPath: "inset(50%)", whiteSpace: "nowrap",
  },
  iconCell: { width: "32px" },
  panelBody: { display: "flex", flexDirection: "column", rowGap: space.l },
});

type Panel =
  | { kind: "account"; editing: CapexAccount | null }
  | { kind: "subaccount"; parent: CapexAccount; editing: CapexAccount | null }
  | { kind: "order"; subaccountsOf: string | null; ids: string[] };

type Confirm = {
  kind: "delete" | "status";
  account: CapexAccount;
  isSub: boolean;
};

const isActive = (a: CapexAccount) => a.status === CHOICE_ADMIN.capexAccountStatus.active;

export default function AdminCapexAccountsScreen() {
  const s = useStyles();
  const tree = useCapexTree();
  const contractsQ = useCapexContracts();
  const privilegesQ = useCapexPrivileges();
  const writes = useCapexWrites();
  /** The admin rule (with the local-run bypass) — every write plan takes it as `canEdit`. */
  const canEdit = useAdminAccess();
  const connected = tree.connected && contractsQ.connected && privilegesQ.connected;
  const accounts = tree.data;
  const contracts = contractsQ.data;
  const privileges = privilegesQ.data;

  const categories = useMemo(() => listCategories(accounts), [accounts]);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const category = categories.find((c) => c.id === categoryId) ?? categories[0] ?? null;
  const childrenOf = (parentId: string) =>
    accounts.filter((a) => a.parentId === parentId).sort((a, b) => a.order - b.order);
  const accountsInCategory = category ? childrenOf(category.id) : [];

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = accounts.find((a) => a.id === selectedId) ?? null;
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());

  const [panel, setPanel] = useState<Panel | null>(null);
  const [form, setForm] = useState<AccountForm>({ categoryId: null, name: "", number: "" });
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const { run } = writes;

  const openAccount = (editing: CapexAccount | null) => {
    setPanel({ kind: "account", editing });
    setForm({
      // The Category dropdown is always disabled and defaults to the selected tab.
      categoryId: editing ? editing.parentId : category?.id ?? null,
      name: editing?.name ?? "", number: editing?.number ?? "",
    });
  };
  const openSubaccount = (parent: CapexAccount, editing: CapexAccount | null) => {
    setSelectedId(parent.id);
    setPanel({ kind: "subaccount", parent, editing });
    setForm({ categoryId: null, name: editing?.name ?? "", number: "" });
  };
  const openOrder = (subaccountsOf: string | null) => {
    const items = subaccountsOf ? childrenOf(subaccountsOf) : accountsInCategory;
    if (subaccountsOf) setSelectedId(subaccountsOf);
    setPanel({ kind: "order", subaccountsOf, ids: items.map((a) => a.id) });
  };

  // `pcf_Admin_CAPEX_Accounts_RightContent_Parents_CommandBar.Items`. Visibility is the
  // canvas `ItemVisible`; enablement the canvas `ItemEnabled`.
  const commands: Command[] = sortToolbarCommands<Command>([
    {
      key: "reorder", label: CAPEX_TOOLBAR_LABELS.reorder, icon: "NumberedList",
      enabled: connected && canReorderAccounts(accountsInCategory, privileges),
    },
    { key: "new", label: CAPEX_TOOLBAR_LABELS.new, icon: "Add",
      enabled: connected && canCreateAccount(privileges) },
    { key: "edit", label: CAPEX_TOOLBAR_LABELS.edit, icon: "Edit",
      enabled: connected && canEditAccount(selected, privileges) },
    ...(showActivate(selected)
      ? [{ key: "activate", label: CAPEX_TOOLBAR_LABELS.activate, icon: "ActivateOrders" as const,
          enabled: connected && privileges.canWrite }]
      : []),
    ...(showDeactivate(selected)
      ? [{ key: "deactivate", label: CAPEX_TOOLBAR_LABELS.deactivate, icon: "DeactivateOrders" as const,
          enabled: connected && privileges.canWrite }]
      : []),
    ...(canDeleteAccount(selected, accounts, contracts)
      ? [{ key: "delete", label: CAPEX_TOOLBAR_LABELS.delete, icon: "Delete" as const,
          enabled: connected && deleteEnabled(privileges) }]
      : []),
  ]);

  const onCommand = (key: string) => {
    if (!connected) return;
    if (key === "new") { setSelectedId(null); openAccount(null); }   // `locSelectedAccount: Blank()`
    else if (key === "edit" && selected) openAccount(selected);
    else if (key === "reorder") openOrder(null);
    else if ((key === "activate" || key === "deactivate") && selected) {
      setConfirm({ kind: "status", account: selected, isSub: false });
    } else if (key === "delete" && selected) {
      setConfirm({ kind: "delete", account: selected, isSub: false });
    }
  };

  const isSub = panel?.kind === "subaccount";
  const editing = panel && panel.kind !== "order" ? panel.editing : null;
  const isEdit = editing !== null;
  const panelParent = panel?.kind === "subaccount"
    ? panel.parent
    : categories.find((c) => c.id === form.categoryId) ?? null;
  const errors = panel && panel.kind !== "order"
    ? validateAccountForm(form, {
        isSubaccount: isSub, isEdit,
        existingNumbers: accounts.map((a) => a.number),
        parentNumber: panelParent?.number,
      })
    : null;
  const numberError = errors?.numberNotNumeric
    ? (isSub ? MSG.numbersOnly : T.accountNumbersOnly)
    : errors?.numberDuplicate
      ? (isSub ? MSG.duplicateSubaccount : MSG.duplicateAccount)
      : undefined;
  const closePanel = () => setPanel(null);

  const saveAccountPanel = async () => {
    if (!panel || panel.kind === "order") return;
    const sub = panel.kind === "subaccount";
    const parent = sub ? panel.parent : panelParent;
    const siblings = parent ? childrenOf(parent.id) : [];
    const job = {
      progress: sub ? T.savingSubaccount : T.savingAccount,
      plan: () => checkedSavePlan(form, {
        isSubaccount: sub, isEdit,
        ...(editing ? { editingId: editing.id } : {}),
        parent, siblings,
        existingNumbers: accounts.map((a) => a.number),
        privileges, canEdit,
      }),
    };
    closePanel();
    const created = await run(job);
    // Canvas: a new ACCOUNT becomes the selection; a subaccount save clears the subaccount.
    if (created && !sub && created[0]) setSelectedId(created[0]);
  };

  const saveOrder = async () => {
    if (panel?.kind !== "order") return;
    const { ids, subaccountsOf } = panel;
    closePanel();
    await run({ progress: T.savingOrder, plan: planReorder(accounts, ids, { privileges, canEdit }) });
    // Canvas: an account reorder clears the selection.
    if (!subaccountsOf) setSelectedId(null);
  };

  const onConfirm = async () => {
    if (!confirm) return;
    const { account, isSub: sub, kind } = confirm;
    setConfirm(null);
    if (kind === "delete") {
      await run({
        progress: sub ? T.deletingSubaccount : T.deletingAccount,
        plan: planDeleteAccount(account, { subaccounts: accounts, contracts, privileges, canEdit }),
      });
      if (!sub) setSelectedId(null);
      return;
    }
    const progressText = sub ? T.updatingSubaccount : T.updatingAccount;
    if (isActive(account)) {
      await run({
        progress: progressText,
        plan: () => cascadeDeactivatePlan({
          account, subaccounts: sub ? [] : childrenOf(account.id), contracts,
          today: new Date(), privileges, canEdit,
        }),
      });
    } else {
      await run({ progress: progressText, plan: planActivateAccount(account, { privileges, canEdit }) });
    }
  };

  const loadError = tree.error ?? contractsQ.error;
  const orderNames = new Map(accounts.map((a) => [a.id, a.name]));

  return (
    <div className={s.page}>
      <Text as="h1" className={s.title}>{T.title}</Text>

      <WriteFeedback progress={writes.progress} error={writes.error} success={writes.success} testIdPrefix="capex-accounts" />

      {loadError ? (
        <EmptyState title={T.loadFailedTitle} description={T.loadFailedDescription} />
      ) : tree.isLoading || contractsQ.isLoading ? (
        <LoadingOverlay mode="inline" label="Loading..." />
      ) : (
        <>
          <TabList
            className={s.tabs}
            data-testid="tab_Admin_CAPEX_Accounts_RightContent_Parents"
            selectedValue={category?.id ?? ""}
            onTabSelect={(_, d) => { setCategoryId(String(d.value)); setSelectedId(null); }}
          >
            {categories.map((c) => (
              <Tab key={c.id} value={c.id} aria-label={c.name} data-testid={`capex-accounts-category-${c.id}`}>{c.name}</Tab>
            ))}
          </TabList>

          <CommandSlot>
            <CommandBar commands={commands} onCommand={onCommand} ariaLabel={T.title} />
          </CommandSlot>

          <div className={s.gallery} data-testid="gal_Account_Accounts">
            {accountsInCategory.map((account) => {
              const open = expanded.has(account.id);
              const isSelected = account.id === selectedId;
              const subs = childrenOf(account.id);
              const label = accountRowLabel(account);
              // `ico_Account_AccountCard_Down/_Up.OnSelect`: select the card AND fold/unfold it.
              const toggleFold = () => {
                setSelectedId(account.id);
                setExpanded((prev) => {
                  const next = new Set(prev);
                  if (next.has(account.id)) next.delete(account.id); else next.add(account.id);
                  return next;
                });
              };
              return (
                <section key={account.id} className={s.card} data-testid="con_Account_AccountCard">
                  <div className={s.cardHeader}>
                    <Button
                      appearance="transparent"
                      icon={isSelected ? <RadioButtonFilled /> : <RadioButtonRegular />}
                      aria-label={label}
                      aria-pressed={isSelected}
                      data-testid="btn_Account_AccountCardHeader"
                      onClick={() => setSelectedId((cur) => toggleSelection(cur, account.id))}
                    />
                    <Text className={s.cardTitle} data-testid="lbl_Account_AccountName">{label}</Text>
                    <Text className={s.status} data-testid="lbl_Account_AccountStatus">
                      {isActive(account) ? T.statusActive : T.statusInactive}
                    </Text>
                    <Button
                      appearance="transparent"
                      icon={open ? <ChevronUpRegular /> : <ChevronDownRegular />}
                      aria-label={label}
                      aria-expanded={open}
                      data-testid={open ? "ico_Account_AccountCard_Up" : "ico_Account_AccountCard_Down"}
                      onClick={toggleFold}
                    />
                  </div>
                  {open ? (
                    <div className={s.cardBody}>
                      <div className={s.commandBar}>
                        <CommandBar
                          ariaLabel={label}
                          commands={[
                            { key: "orderSubaccounts", label: T.reorderSubaccounts, icon: "NumberedList",
                              enabled: connected && canReorderSubaccounts() },
                            { key: "newSubaccount", label: T.addSubaccount, icon: "Add",
                              enabled: connected && canCreateAccount(privileges) },
                          ]}
                          onCommand={(key) => {
                            if (!connected) return;
                            if (key === "newSubaccount") openSubaccount(account, null);
                            if (key === "orderSubaccounts") openOrder(account.id);
                          }}
                        />
                      </div>
                      <div className={s.tableWrap}>
                        <Table size="small" aria-label={label} data-testid="pcf_Account_AccountCardBody_SubAccounts">
                          <TableHeader className={s.srOnly}>
                            <TableRow>
                              <TableHeaderCell>{T.colNumber}</TableHeaderCell>
                              <TableHeaderCell>{T.colSubaccount}</TableHeaderCell>
                              <TableHeaderCell>{T.colStatus}</TableHeaderCell>
                              <TableHeaderCell className={s.iconCell} />
                              <TableHeaderCell className={s.iconCell} />
                              <TableHeaderCell className={s.iconCell} />
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {subs.map((r) => {
                              const icons = subaccountRowIcons(r, privileges, contracts);
                              return (
                                <TableRow key={r.id}>
                                  <TableCell>{r.number}</TableCell>
                                  <TableCell>{r.name}</TableCell>
                                  <TableCell>{isActive(r) ? T.statusActive : T.statusInactive}</TableCell>
                                  <TableCell className={s.iconCell}>
                                    {icons.edit ? (
                                      <Button appearance="transparent" size="small" icon={<EditRegular />}
                                        aria-label={CAPEX_TOOLBAR_LABELS.edit} data-testid={`capex-accounts-subaccount-edit-${r.id}`} disabled={!connected}
                                        onClick={() => openSubaccount(account, r)} />
                                    ) : null}
                                  </TableCell>
                                  <TableCell className={s.iconCell}>
                                    {icons.deactivate || icons.activate ? (
                                      <Button appearance="transparent" size="small"
                                        icon={icons.deactivate ? <PauseRegular /> : <PlayRegular />}
                                        aria-label={icons.deactivate
                                          ? CAPEX_TOOLBAR_LABELS.deactivate : CAPEX_TOOLBAR_LABELS.activate}
                                        data-testid={`capex-accounts-subaccount-${icons.deactivate ? "deactivate" : "activate"}-${r.id}`}
                                        disabled={!connected}
                                        onClick={() => { setSelectedId(account.id); setConfirm({ kind: "status", account: r, isSub: true }); }} />
                                    ) : null}
                                  </TableCell>
                                  <TableCell className={s.iconCell}>
                                    {icons.delete ? (
                                      <Button appearance="transparent" size="small" icon={<DeleteRegular />}
                                        aria-label={CAPEX_TOOLBAR_LABELS.delete} data-testid={`capex-accounts-subaccount-delete-${r.id}`} disabled={!connected}
                                        onClick={() => { setSelectedId(account.id); setConfirm({ kind: "delete", account: r, isSub: true }); }} />
                                    ) : null}
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  ) : null}
                </section>
              );
            })}
          </div>
        </>
      )}

      {/* `con_Account_RightPanel_NewEditAccount` */}
      <FormPanel
        open={panel?.kind === "account"}
        title={isEdit ? T.editAccount : T.newAccount}
        width="narrow"
        onDismiss={closePanel}
        footer={
          <PanelButtons
            onSave={() => { void saveAccountPanel(); }}
            onCancel={closePanel}
            disabled={!connected || errors === null || hasFormErrors(errors)}
            saveTestId="pcf_Account_RightPanel_NewEditAccount_BodyButtons_Save"
            cancelTestId="pcf_Account_RightPanel_NewEditAccount_BodyButtons_Cancel"
          />
        }
      >
        <div className={s.panelBody}>
          <div className="canvas-field">
            <span data-required="true">{T.category}</span>
            <Dropdown
              aria-label={T.category}
              data-testid="drp_Account_RightPanel_NewEditAccount_BodyContent_Category"
              disabled={!connected || !isCategoryEditable(isEdit)}
              value={categories.find((c) => c.id === form.categoryId)?.name ?? ""}
              selectedOptions={form.categoryId ? [form.categoryId] : []}
              onOptionSelect={(_, d) => setForm((p) => ({ ...p, categoryId: d.optionValue ?? null }))}
            >
              {categories.map((c) => <Option key={c.id} value={c.id}>{c.name}</Option>)}
            </Dropdown>
          </div>
          <CostField label={T.number} required error={numberError}>
            <Input
              aria-label={T.number}
              data-testid="txt_Account_RightPanel_NewEditAccount_BodyContent_Number"
              value={form.number}
              disabled={!connected || !isNumberEditable(isEdit)}
              onChange={(_, d) => setForm((p) => ({ ...p, number: d.value }))}
            />
          </CostField>
          <CostField label={T.name} required>
            <Input
              aria-label={T.name}
              data-testid="txt_Account_RightPanel_NewEditAccount_BodyContent_Name"
              value={form.name}
              maxLength={NAME_MAX_LENGTH}
              disabled={!connected}
              onChange={(_, d) => setForm((p) => ({ ...p, name: d.value }))}
            />
          </CostField>
        </div>
      </FormPanel>

      {/* `con_Account_RightPanel_NewEditSubaccount` */}
      <FormPanel
        open={panel?.kind === "subaccount"}
        title={isEdit ? T.editSubaccount : T.newSubaccount}
        width="narrow"
        onDismiss={closePanel}
        footer={
          <PanelButtons
            onSave={() => { void saveAccountPanel(); }}
            onCancel={closePanel}
            disabled={!connected || errors === null || hasFormErrors(errors)}
            saveTestId="pcf_Account_RightPanel_NewEditSubaccount_BodyButtons_Save"
            cancelTestId="pcf_Account_RightPanel_NewEditSubaccount_BodyButtons_Cancel"
          />
        }
      >
        <div className={s.panelBody}>
          <CostField label={T.mainAccount} required>
            <Input
              aria-label={T.mainAccount}
              data-testid="txt_Account_RightPanel_NewEditSubaccount_BodyContent_AccountName"
              value={panel?.kind === "subaccount" ? panel.parent.name : ""}
              disabled
            />
          </CostField>
          <CostField label={T.subaccountNumber} required error={numberError}>
            <Input
              aria-label={T.subaccountNumber}
              data-testid="txt_Account_RightPanel_NewEditSubaccount_BodyContent_Number"
              contentBefore={panel?.kind === "subaccount" && showSubaccountPrefix(isEdit)
                ? <span data-testid="lbl_Account_RightPanel_NewEditSubaccount_BodyContent_AccountNumberAsPrefix">
                    {`${panel.parent.number}_`}
                  </span>
                : undefined}
              value={isEdit && editing ? editing.number : form.number}
              disabled={!connected || !isNumberEditable(isEdit)}
              onChange={(_, d) => setForm((p) => ({ ...p, number: d.value }))}
            />
          </CostField>
          <CostField label={T.subaccountName} required>
            <Input
              aria-label={T.subaccountName}
              data-testid="txt_Account_RightPanel_NewEditSubaccount_BodyContent_Name"
              value={form.name}
              maxLength={NAME_MAX_LENGTH}
              disabled={!connected}
              onChange={(_, d) => setForm((p) => ({ ...p, name: d.value }))}
            />
          </CostField>
        </div>
      </FormPanel>

      {/* `con_Account_RightPanel_Ordering` */}
      <FormPanel
        open={panel?.kind === "order"}
        title={panel?.kind === "order" && panel.subaccountsOf ? T.orderSubaccounts : T.orderAccounts}
        width="narrow"
        onDismiss={closePanel}
        footer={<PanelButtons onSave={() => { void saveOrder(); }} onCancel={closePanel} disabled={!connected}
          saveTestId="pcf_Account_RightPanel_Ordering_BodyButtons_Save"
          cancelTestId="pcf_Account_RightPanel_Ordering_BodyButtons_Cancel" />}
      >
        <div className={s.panelBody}>
          <Text data-testid="lbl_Account_RightPanel_Ordering_BodyContent">{T.orderHint}</Text>
          {/* PowerDragDrop template `<p><b>{{vsb_name}}</b></p>` — the name only. */}
          <ReorderList
            ids={panel?.kind === "order" ? panel.ids : []}
            labelOf={(id) => orderNames.get(id) ?? ""}
            onChange={(ids) => setPanel((p) => (p?.kind === "order" ? { ...p, ids } : p))}
            testId={panel?.kind === "order" && panel.subaccountsOf
              ? "pcf_Account_RightPanel_Ordering_BodyContent_Subaccounts"
              : "pcf_Account_RightPanel_Ordering_BodyContent_Accounts"}
            rowTestIdPrefix="capex-accounts-order"
            ariaLabel={panel?.kind === "order" && panel.subaccountsOf ? T.orderSubaccounts : T.orderAccounts}
            moveUpLabel={T.moveUp}
            moveDownLabel={T.moveDown}
          />
        </div>
      </FormPanel>

      {/* `cmp_Account_PopUpConfirmation_{Delete,ChangeStatusOf}{Account,SubAccount}` */}
      <ConfirmDialog
        open={confirm !== null}
        title={confirmTitle(confirm)}
        description={confirmDescription(confirm)}
        confirmText={confirm?.kind === "status"
          ? (isActive(confirm.account) ? CAPEX_TOOLBAR_LABELS.deactivate : CAPEX_TOOLBAR_LABELS.activate)
          : T.confirm}
        cancelText={T.cancel}
        onConfirm={() => { void onConfirm(); }}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}

/**
 * SOURCE DEFECT, FIXED (D19): the canvas subaccount status dialog's Title reads
 * `locSelectedAccount.Status` — the PARENT's status — while its Description and button read the
 * subaccount. The title here reads the subaccount, so all three agree.
 */
function confirmTitle(c: Confirm | null): string {
  if (!c) return "";
  if (c.kind === "delete") return c.isSub ? T.deleteSubaccountTitle : T.deleteAccountTitle;
  const active = isActive(c.account);
  if (c.isSub) return active ? T.deactivateSubaccountTitle : T.activateSubaccountTitle;
  return active ? T.deactivateAccountTitle : T.activateAccountTitle;
}

function confirmDescription(c: Confirm | null): string {
  if (!c) return "";
  const n = c.account.name;
  if (c.kind === "delete") return c.isSub ? T.deleteSubaccountDescription(n) : T.deleteAccountDescription(n);
  const active = isActive(c.account);
  if (c.isSub) return active ? T.deactivateSubaccountDescription(n) : T.activateSubaccountDescription(n);
  return active ? T.deactivateAccountDescription(n) : T.activateAccountDescription(n);
}
