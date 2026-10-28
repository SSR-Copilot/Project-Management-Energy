/**
 * Application Settings — CAPEX Accounts. Replaces the canvas `Admin CAPEX Accounts` (PM app),
 * `ProjectDocs/_extracted/msapp/projectmanagement/Src/Admin CAPEX Accounts.pa.yaml`.
 *
 * Composition only: rules live in `./rules.ts`, Dataverse I/O in `@/data/adminCapexAccounts.ts`,
 * queries/mutation in `./hooks.ts`.
 *
 * Canvas controls → this screen (`data-testid` = the canvas name; per-row ids add `-${row.id}`):
 *   cmp_Admin_CAPEX_Accounts_Header                          the page title ("CAPEX Accounts")
 *   tab_Admin_CAPEX_Accounts_RightContent_Parents            the category tabs
 *   pcf_Admin_CAPEX_Accounts_RightContent_Parents_CommandBar the account command bar (canvas `ItemKey`s)
 *   gal_Account_Accounts → con_Account_AccountCard           one `AccountCard` per account
 *   con_Account_RightPanel_NewEditAccount                    `AccountPanel`
 *   con_Account_RightPanel_NewEditSubaccount                 `SubaccountPanel`
 *   con_Account_RightPanel_Ordering                          `ReorderPanel` (PowerDragDrop → drag + Move up/down)
 *   cmp_Account_PopUpConfirmation_*                          the one `ConfirmDialog` (four canvas pop-ups)
 *
 * The screen renders inside the app shell's admin navigation (`/admin/capex-accounts`). There is
 * no route guard (as in the canvas, a deep link opens the screen); the admin rail entry is hidden
 * for non-admins. The shell header shows the title (`app/adminTitles.ts`; `cmp_Admin_CAPEX_Accounts_Header.Project`
 * → `Name: "CAPEX Accounts"`, CA:82 — verbatim); the screen keeps a visually hidden `h1`.
 *
 * Shared pieces: load states `useQueryHealth` + `QueryStates`, page bars
 * `NoticeBar`, tabs `SettingsTabStrip`, expand set `useToggleSet`, panel state `usePanelState`,
 * dialog `useConfirmDialog` + `ConfirmDialog error lockWhileBusy`, writes `useBusyRunner`.
 *
 * Access: every write is gated by the admin rule (`useAdminAccess`); a non-admin's save,
 * delete or status change is refused with `OUT_OF_SCOPE` and nothing is sent. The commands stay
 * enabled for a non-admin (doc 09 §5).
 *
 * DIVERGENCE: the success toasts, warnings, loading / empty / load-error states and the inline
 * errors are NEW — the canvas showed nothing after a write (no `IfError`, no message control).
 */
import { useMemo, useState } from "react";
import { makeStyles } from "@fluentui/react-components";
import {
  CommandBar, ConfirmDialog, EmptyState, LoadingOverlay, NoticeBar, QueryStates, SettingsTabStrip, useNotify,
  type Command,
  useQueryHealth,
  VisuallyHidden,
} from "@/components";
import { useAdminAccess } from "@/app/useCurrentUser";
import { useBusyRunner } from "@/features/shared/useBusyRunner";
import { useConfirmDialog, type ConfirmState } from "@/features/shared/useConfirmDialog";
import { usePanelState } from "@/features/shared/usePanelState";
import { useToggleSet } from "@/features/shared/useToggleSet";
import { userReason } from "@/platform/userMessage";
import {
  DuplicateNumberError, RecordGoneError, createCapexAccount,
  deactivateCapexAccount, deactivateCapexSubaccount, deleteCapexAccount, deleteCapexSubaccount,
  saveCapexOrder,
} from "@/data/adminCapexAccounts";
import { runPlan } from "@/data/runPlan";
import { reorderDiff } from "@/domain/reorder";
import { palette } from "@/theme/tokens";
import { AccountCard } from "./AccountCard";
import { AccountPanel, ReorderPanel, SubaccountPanel } from "./Panels";
import { useCapexPrivileges, useCapexTree, useCapexWrite, useHasContracts } from "./hooks";
import { OutOfScopeError, describeWriteError } from "./messages";
import {
  BUSY, CONTRACT_CHECK_FAILED, GONE, GONE_STATUS, accountCommands, accountDeleteUnavailable, accountStatusDialog, composeSubaccountNumber, deleteAccountDialog,
  deleteSubaccountDialog, forecastCutoff, planActivateAccount, planActivateSubaccount, planRenameAccount,
  subaccountStatusDialog,
  type CapexNode, type CommandState, type DialogText,
} from "./rules";

const useStyles = makeStyles({
  screen: { display: "flex", flexDirection: "column", minHeight: "100%", backgroundColor: palette.white },
  /** Right content: white, vertical, gap 10 (CA:139-154). */
  page: {
    display: "flex", flexDirection: "column", rowGap: "10px",
    backgroundColor: palette.white, minHeight: "100%", paddingBottom: "20px",
  },
  commands: { paddingLeft: "20px", paddingRight: "20px" },
  cards: { display: "flex", flexDirection: "column", paddingLeft: "3px", paddingRight: "10px" },
});

/**
 * New vs Edit is FROZEN when the panel opens : `editing` is a snapshot of the row,
 * never re-derived from the live tree, so a refetch that drops the row cannot turn an Edit panel
 * into a New panel whose Save would create a record.
 */
type Panel =
  | { kind: "account"; editing: CapexNode | undefined }
  | { kind: "subaccount"; parent: CapexNode; editing: CapexNode | undefined }
  | { kind: "reorder"; parentId: string; subaccounts: boolean };

type DialogKind = "deleteAccount" | "deleteSubaccount" | "accountStatus" | "subaccountStatus";
interface DialogPayload { targetId: string; text: DialogText; wasActive: boolean }

const READ_ACTION = "read CAPEX accounts";

/**
 * `executePlan` operation names of the three single-request writes that are `WritePlan`s
 * (`rules.ts`). Each write carries its own `label` (the data layer's operation text, word for
 * word), so these names never reach a user-facing message; they are what telemetry and a refusal
 * are logged under.
 */
const RENAME = "rename CAPEX account";
const ACTIVATE_ACCOUNT = "activate CAPEX account";
const ACTIVATE_SUBACCOUNT = "activate CAPEX subaccount";

/** The user-facing action of a dialog, for its failure text (NEW, see `describeWriteError`). */
function dialogAction({ kind, payload }: ConfirmState<DialogKind, DialogPayload>): string {
  return {
    deleteSubaccount: "delete the subaccount",
    deleteAccount: "delete the account",
    accountStatus: payload.wasActive ? "deactivate the account" : "activate the account",
    subaccountStatus: payload.wasActive ? "deactivate the subaccount" : "activate the subaccount",
  }[kind];
}

export default function CAPEXAccountsSettingsScreen() {
  const styles = useStyles();
  const treeQuery = useCapexTree();
  const tree = treeQuery.tree;
  const health = useQueryHealth([treeQuery]);
  const privileges = useCapexPrivileges();
  const write = useCapexWrite();
  /** The admin rule (with the local-run bypass): a non-admin's write is refused, nothing is sent. */
  const canEdit = useAdminAccess();

  const [categoryId, setCategoryId] = useState<string | undefined>();
  const [selectedAccountId, setSelectedAccountId] = useState<string | undefined>();
  // Component state, not data: survives every refetch; all collapsed on entry
  // (`OnVisible: UpdateIf(colCapexAccounts, Not(IsFolded), {IsFolded: true})`, CA:34-38).
  const expanded = useToggleSet();
  const panels = usePanelState<Panel>();
  const panel = panels.panel;
  const [duplicate, setDuplicate] = useState(false);
  const dialog = useConfirmDialog<DialogKind, DialogPayload>();
  const runner = useBusyRunner();
  const busy = runner.busy;
  // Outcomes of completed writes are toasts; inline/persistent states stay MessageBars.
  const notify = useNotify();

  /* ── derived ── */
  const categories = useMemo(() => tree?.categories ?? [], [tree]);
  const category = categories.find((c) => c.id === categoryId) ?? categories[0];
  const accounts = useMemo(() => category?.children ?? [], [category]);
  const selected = accounts.find((a) => a.id === selectedAccountId);

  const expandedIds = expanded.values;
  const contractCheckIds = useMemo(() => {
    const ids: string[] = [];
    if (selected && selected.children.length === 0) ids.push(selected.id);
    for (const a of accounts) if (expandedIds.has(a.id)) for (const s of a.children) ids.push(s.id);
    return ids;
  }, [accounts, expandedIds, selected]);
  const { checks: contracts, retryFailed: retryContractChecks } = useHasContracts(contractCheckIds);

  const selectedHasContracts = selected ? contracts.get(selected.id) : undefined;
  const commands = accountCommands({
    selected,
    categorySelected: Boolean(category),
    categoryAccountCount: accounts.length,
    selectedHasContracts,
    privileges,
  });
  // Delete is shown disabled; this says why instead of hiding it silently.
  const deleteUnavailable = accountDeleteUnavailable({ selected, selectedHasContracts });

  const node = (id: string | undefined): CapexNode | undefined => (id ? tree?.byId.get(id) : undefined);

  /**
   * The account command bar — `pcf_Admin_CAPEX_Accounts_RightContent_Parents_CommandBar`
   * (CA:184-368): the canvas `ItemKey`s and `ItemDisplayName`s, verbatim; hidden commands are not
   * rendered.
   * DIVERGENCE (icons): the canvas `ItemIconName`s are "NumberedList" (Reorder), "ActivateOrders"
   * and "DeactivateOrders"; this bar shows the "Reorder", "Activate" and "Deactivate" icons (D19 had
   * restored the canvas icons before the port).
   */
  const accountBar: (Command & CommandState & { run: () => void })[] = [
    {
      key: "orderAccounts", label: "Reorder", icon: "Reorder", ...commands.reorder,
      run: () => { if (category) openPanel({ kind: "reorder", parentId: category.id, subaccounts: false }); },
    },
    {
      key: "newAccount", label: "New", icon: "Add", ...commands.create,
      // Canvas New sets `locSelectedAccount: Blank()` (CA:334-340), so after Cancel no
      // account is selected; a successful create selects the new row (saveAccount).
      run: () => { setSelectedAccountId(undefined); openPanel({ kind: "account", editing: undefined }); },
    },
    { key: "editAccount", label: "Edit", icon: "Edit", ...commands.edit, run: () => { if (selected) openPanel({ kind: "account", editing: selected }); } },
    {
      key: "activateAccount", label: "Activate", icon: "Activate", ...commands.activate,
      run: () => { if (selected) openDialog("accountStatus", selected, accountStatusDialog(selected)); },
    },
    {
      key: "deactivateAccount", label: "Deactivate", icon: "Deactivate", ...commands.deactivate,
      run: () => { if (selected) openDialog("accountStatus", selected, accountStatusDialog(selected)); },
    },
    {
      key: "deleteAccount", label: "Delete", icon: "Delete", ...commands.delete,
      run: () => { if (selected) openDialog("deleteAccount", selected, deleteAccountDialog(selected.name)); },
    },
  ];

  /* ── write plumbing ── */
  function run<T>(label: string, fn: () => Promise<T>): Promise<T> {
    if (!canEdit) return Promise.reject(new OutOfScopeError());
    return runner.run(label, async () => (await write.mutateAsync(fn)) as T);
  }

  function openPanel(next: Panel) {
    setDuplicate(false);
    panels.open(next);
  }
  function closePanel() {
    panels.close();
    setDuplicate(false);
  }
  /** Stale messages from the previous attempt must not sit next to the new outcome. */
  function startSave() {
    panels.setError(undefined);
    setDuplicate(false);
  }
  function openDialog(kind: DialogKind, target: CapexNode, text: DialogText) {
    dialog.ask(kind, { targetId: target.id, text, wasActive: target.active });
  }

  /* ── account panel ── */
  /**
   * Save — `pcf_Account_RightPanel_NewEditAccount_BodyButtons_Save.OnChange` (CA:1436). New: the
   * number is checked against the whole table, then created and set Inactive (the canvas two-write
   * create, kept: D19) and selected; Edit: the name only.
   *
   * DIVERGENCE: the canvas hides the panel BEFORE writing (`locIsVisibleRightPanelNewEditAccount:
   * false`) and shows nothing on failure. Here the panel stays open while saving and on failure,
   * with the error, and closes on success.
   *
   * SOURCE DEFECT (D19): the canvas finds a duplicate number only when Save is clicked, and then
   * silently does nothing but reveal the "already in use" label. Here it is re-checked on the
   * server just before the create (`DuplicateNumberError`) and shown inline.
   */
  async function saveAccount(form: { number: string; name: string }) {
    if (!panel || panel.kind !== "account" || !category) return;
    const editing = panel.editing;
    // Edit mode never falls through to create; a vanished row is refused.
    if (editing && !node(editing.id)) { panels.setError(GONE.account); return; }
    startSave();
    const action = editing ? "save the account" : "create the account";
    try {
      if (editing) {
        await run(BUSY.saveAccount, () => runPlan(planRenameAccount(editing.id, form.name, { canEdit }), RENAME));
        notify.success(`Account "${form.name.trim()}" saved.`);
      } else {
        // CA:1436 `Trim(number)` — the user's input is trimmed; stored numbers never are.
        const result = await run(BUSY.saveAccount, () => createCapexAccount({
          parentId: category.id, number: form.number.trim(), name: form.name,
        }));
        if (result.inactiveError instanceof RecordGoneError) {
          // The new row was deleted before its Inactive step; it is not "still Active",
          // and there is nothing to select.
          notify.warning(`Account "${form.name.trim()}" was created but has since been deleted by someone else.`);
        } else if (result.inactiveError) {
          setSelectedAccountId(result.id);
          notify.warning(
            `Account "${form.name.trim()}" was created but is still Active: setting it Inactive failed. ` +
              "Deactivate it before it is used for costing.",
          );
        } else {
          setSelectedAccountId(result.id);
          notify.success(`Account "${form.name.trim()}" created as Inactive.`);
        }
      }
      closePanel();
    } catch (error) {
      if (error instanceof DuplicateNumberError) { setDuplicate(true); return; }
      if (error instanceof RecordGoneError) { panels.setError(GONE.account); return; }
      panels.setError(describeWriteError(error, action));
    }
  }

  /* ── subaccount panel ── */
  /**
   * Save — `pcf_Account_RightPanel_NewEditSubaccount_BodyButtons_Save.OnChange` (CA:1980): the same
   * shape as `saveAccount` (same DIVERGENCE and SOURCE DEFECT notes), with the composed number
   * `<account>_<suffix>`. As the canvas, a saved subaccount is not selected.
   */
  async function saveSubaccount(form: { suffix: string; name: string }) {
    if (!panel || panel.kind !== "subaccount") return;
    const parent = panel.parent;
    const editing = panel.editing;
    if (editing && !node(editing.id)) { panels.setError(GONE.subaccount); return; }
    if (!editing && !node(parent.id)) { panels.setError(GONE.parent); return; }
    startSave();
    const action = editing ? "save the subaccount" : "create the subaccount";
    try {
      if (editing) {
        await run(BUSY.saveSubaccount, () => runPlan(planRenameAccount(editing.id, form.name, { canEdit }), RENAME));
        notify.success(`Subaccount "${form.name.trim()}" saved.`);
      } else {
        const result = await run(BUSY.saveSubaccount, () => createCapexAccount({
          parentId: parent.id, number: composeSubaccountNumber(parent.number, form.suffix), name: form.name,
        }));
        if (result.inactiveError instanceof RecordGoneError) {
          // Deleted before its Inactive step; not "still Active".
          notify.warning(`Subaccount "${form.name.trim()}" was created but has since been deleted by someone else.`);
        } else if (result.inactiveError) {
          notify.warning(
            `Subaccount "${form.name.trim()}" was created but is still Active: setting it Inactive failed. ` +
              "Deactivate it before it is used for costing.",
          );
        } else {
          notify.success(`Subaccount "${form.name.trim()}" created as Inactive.`);
        }
      }
      closePanel();
    } catch (error) {
      if (error instanceof DuplicateNumberError) { setDuplicate(true); return; }
      if (error instanceof RecordGoneError) { panels.setError(GONE.subaccount); return; }
      panels.setError(describeWriteError(error, action));
    }
  }

  /* ── reorder panel ── */
  /**
   * Save — `pcf_Account_RightPanel_Ordering_BodyButtons_Save.OnChange` (CA:2261-2296). An account
   * reorder clears the selection (`locSelectedAccount: Blank()`), a subaccount reorder does not.
   * DIVERGENCE: the canvas hides the panel before writing; here it stays open while saving and on
   * failure. Only changed rows are written (see `rules.ts`, Reorder).
   */
  async function saveOrder(list: CapexNode[]) {
    if (!panel || panel.kind !== "reorder") return;
    if (!canEdit) { panels.setError(describeWriteError(new OutOfScopeError(), "save the new order")); return; }
    const changes = reorderDiff(list.map((n) => ({ id: n.id, order: n.order })));
    startSave();
    try {
      if (changes.length > 0) {
        await run(BUSY.saveOrder, () => saveCapexOrder(changes));
        notify.success("New order saved.");
      }
      if (!panel.subaccounts) setSelectedAccountId(undefined); // an account reorder clears the selection
      closePanel();
    } catch (error) {
      panels.setError(describeWriteError(error, "save the new order"));
    }
  }

  /* ── dialogs ── */
  /**
   * Default `useConfirmDialog` flow: busy while the write runs, closes on success, stays open with
   * the error (shown by `ConfirmDialog error`, `role="alert"`) on failure.
   * DIVERGENCE: every canvas pop-up closes itself FIRST and then writes, silently on failure.
   *
   * What each confirmation does (the data layer, `@/data/adminCapexAccounts.ts`):
   *   - Delete subaccount / account: `Remove` (CA:2345-2363, CA:2379-2397), after re-checking the
   *     contracts (and, for an account, the subaccounts) on the server. An account delete clears the
   *     selection, as the canvas.
   *   - Deactivate account (CA:2423): the account Inactive, its subaccounts (read live) Inactive,
   *     then the forecast clean-up (this year's later months set to 0, later years deleted).
   *     SOURCE DEFECT (D19): the canvas sets every subaccount to ACTIVE, although the dialog
   *     promises they are deactivated. The pre-port twin `childStatusOnDeactivateCanvasParity`
   *     (UT-ADCAPEX-019b) was not carried over.
   *     DIVERGENCE: the clean-up covers contracts on the subaccounts AND on the account itself;
   *     the canvas cleans only the subaccounts' contracts (`locSubaccounts`).
   *   - Deactivate subaccount (CA:2454): the subaccount Inactive and the same clean-up of its
   *     contracts.
   *   - DIVERGENCE (both deactivates): cost rows marked paid (`vsb_costpaid = true`) are skipped by
   *     the clean-up (`PAID_EXCLUSION`); the canvas zeroes and deletes them too.
   *   - Activate: status only (`planActivateAccount` / `planActivateSubaccount`); deleted costs
   *     are not restored.
   */
  async function confirmDialog() {
    const current = dialog.state;
    if (!current) return;
    const { year, month } = forecastCutoff(new Date());
    await dialog.confirm(async ({ kind, payload: { targetId, wasActive } }) => {
      switch (kind) {
        case "deleteSubaccount":
          await run(BUSY.deleteSubaccount, () => deleteCapexSubaccount(targetId));
          notify.success("Subaccount deleted.");
          break;
        case "deleteAccount":
          await run(BUSY.deleteAccount, () => deleteCapexAccount(targetId));
          setSelectedAccountId(undefined); // deleting an account clears the selection
          notify.success("Account deleted.");
          break;
        case "accountStatus":
          if (wasActive) {
            // The data layer reads the subaccounts live; the cached tree is not used.
            await run(BUSY.updateAccount, () => deactivateCapexAccount({ accountId: targetId, year, month }));
            notify.success("Account and its subaccounts deactivated; forecast costs cleaned up.");
          } else {
            await run(BUSY.updateAccount, () => runPlan(planActivateAccount(targetId, { canEdit }), ACTIVATE_ACCOUNT));
            notify.success("Account activated.");
          }
          break;
        case "subaccountStatus":
          if (wasActive) {
            await run(BUSY.updateSubaccount, () => deactivateCapexSubaccount(targetId, year, month));
            notify.success("Subaccount deactivated; forecast costs cleaned up.");
          } else {
            await run(BUSY.updateSubaccount, () => runPlan(planActivateSubaccount(targetId, { canEdit }), ACTIVATE_SUBACCOUNT));
            notify.success("Subaccount activated.");
          }
          break;
      }
    }, {
      errorText: (error) => {
        // The status target was deleted by someone else; nothing was written.
        if (error instanceof RecordGoneError && (current.kind === "accountStatus" || current.kind === "subaccountStatus")) {
          return current.kind === "accountStatus" ? GONE_STATUS.account : GONE_STATUS.subaccount;
        }
        return describeWriteError(error, dialogAction(current));
      },
    });
  }

  /* ── render ── */
  // Full-page error only when there is NOTHING to show: `useQueryHealth` treats a
  // failed background refetch with cached data as `staleError` (a warning bar), never as fatal,
  // so open panels/dialogs and the outcome of the write just made stay on screen. The empty and
  // error texts are NEW (CONVENTIONS rule 19).
  const empty = !tree?.root
    ? {
      when: true,
      title: "CAPEX account tree not found",
      description: 'No root CAPEX account (number "00001") exists, so there are no categories to show. Ask an administrator to check the CAPEX Account Lists table.',
    }
    : categories.length === 0
      ? { when: true, title: "No CAPEX categories", description: 'The root CAPEX account "00001" has no categories yet.' }
      : undefined;

  const reorderItems = panel?.kind === "reorder"
    ? (panel.subaccounts ? node(panel.parentId)?.children : accounts) ?? []
    : [];
  // The frozen row (or the new subaccount's parent) is gone from the latest tree.
  const panelGone = panel?.kind === "account"
    ? (panel.editing && !node(panel.editing.id) ? GONE.account : undefined)
    : panel?.kind === "subaccount"
      ? (panel.editing
        ? (!node(panel.editing.id) ? GONE.subaccount : undefined)
        : (!node(panel.parent.id) ? GONE.parent : undefined))
      : undefined;

  return (
    <div className={styles.screen}>
      {/* The title is in the shell header (`app/adminTitles.ts`); this keeps the page heading for screen readers. */}
      <VisuallyHidden as="h1">CAPEX Accounts</VisuallyHidden>
      <QueryStates
        health={health}
        loadingLabel="Loading CAPEX accounts…"
        fatal={{
          title: "CAPEX accounts could not be loaded",
          text: (error) => userReason(error, READ_ACTION,
            "Something went wrong while reading the CAPEX account list. Please try again."),
        }}
        {...(empty ? { empty } : {})}
      >
        {() => (
          <div className={styles.page}>
            {/* Category tabs — `tab_Admin_CAPEX_Accounts_RightContent_Parents` (CA:156-183); a tab change clears the selection (`OnSelect`). */}
            <SettingsTabStrip
              size="medium" bandHeight={50} ariaLabel="CAPEX account categories"
              tabs={categories.map((c) => ({ id: c.id, label: c.name }))}
              selected={category?.id}
              onSelect={(id) => { setCategoryId(id); setSelectedAccountId(undefined); }}
              testId="tab_Admin_CAPEX_Accounts_RightContent_Parents"
              tabTestIdPrefix="tab_Admin_CAPEX_Accounts_RightContent_Parents"
            />

            {/* Account command bar (CA:184-368). */}
            <div className={styles.commands}>
              <CommandBar
                ariaLabel="Account commands"
                testIdPrefix="pcf_Admin_CAPEX_Accounts_RightContent_Parents_CommandBar"
                commands={accountBar.map(({ key, label, icon, enabled, visible }) => ({ key, label, icon, enabled, visible }))}
                onCommand={(key) => accountBar.find((c) => c.key === key)?.run()}
              />
            </div>

            {deleteUnavailable ? (
              <NoticeBar
                intent="warning" inset={20} testId="delete-check-failed"
                action={{ label: "Retry check", onClick: retryContractChecks }}
              >
                {CONTRACT_CHECK_FAILED.account}
              </NoticeBar>
            ) : null}

            {health.staleError !== undefined ? (
              <NoticeBar intent="warning" inset={20} alert action={{ label: "Retry", onClick: health.retryFailed }}>
                {userReason(health.staleError, READ_ACTION,
                  "The CAPEX account list could not be refreshed. What you see may be out of date.")}
              </NoticeBar>
            ) : null}

            {/* Account cards — `gal_Account_Accounts` (CA:369-941); the empty state is NEW (the canvas gallery is just hidden). */}
            {accounts.length === 0 ? (
              <EmptyState title="No accounts in this category" description="Use New to add the first account." />
            ) : (
              <div
                className={styles.cards} role="list" aria-label={`Accounts of ${category?.name ?? ""}`}
                data-testid="gal_Account_Accounts"
              >
                {accounts.map((account) => (
                  <div role="listitem" key={account.id}>
                    <AccountCard
                      account={account}
                      selected={account.id === selectedAccountId}
                      expanded={expanded.has(account.id)}
                      privileges={privileges}
                      contractsBySubaccount={contracts}
                      // `btn_Account_AccountCardHeader.OnSelect` (CA:849-856): a second click deselects.
                      onSelect={() => setSelectedAccountId((cur) => (cur === account.id ? undefined : account.id))}
                      // `ico_Account_AccountCard_Down/_Up.OnSelect` (CA:885-896): select (never
                      // deselect) and toggle the fold.
                      onToggleExpand={() => {
                        setSelectedAccountId(account.id);
                        expanded.toggle(account.id);
                      }}
                      onAddSubaccount={() => {
                        setSelectedAccountId(account.id);
                        openPanel({ kind: "subaccount", parent: account, editing: undefined });
                      }}
                      onReorderSubaccounts={() => {
                        setSelectedAccountId(account.id);
                        openPanel({ kind: "reorder", parentId: account.id, subaccounts: true });
                      }}
                      // Every subaccount command and row action selects the parent account
                      // (`locSelectedAccount: gal_Account_Accounts.Selected`, CA:501, 509, 605-627).
                      onEditSubaccount={(sub) => {
                        setSelectedAccountId(account.id);
                        openPanel({ kind: "subaccount", parent: account, editing: sub });
                      }}
                      onChangeSubaccountStatus={(sub) => {
                        setSelectedAccountId(account.id);
                        openDialog("subaccountStatus", sub, subaccountStatusDialog(sub));
                      }}
                      onDeleteSubaccount={(sub) => {
                        setSelectedAccountId(account.id);
                        openDialog("deleteSubaccount", sub, deleteSubaccountDialog(sub.name));
                      }}
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Right panels. */}
            {panel?.kind === "account" ? (
              <AccountPanel
                key={panels.key} open isNew={!panel.editing} account={panel.editing} category={category}
                saving={Boolean(busy)} duplicate={duplicate} error={panelGone ?? panels.error}
                blocked={Boolean(panelGone)}
                onSave={(f) => { void saveAccount(f); }} onCancel={closePanel}
              />
            ) : null}
            {panel?.kind === "subaccount" ? (
              <SubaccountPanel
                key={panels.key} open isNew={!panel.editing} parent={panel.parent} subaccount={panel.editing}
                saving={Boolean(busy)} duplicate={duplicate} error={panelGone ?? panels.error}
                blocked={Boolean(panelGone)}
                onSave={(f) => { void saveSubaccount(f); }} onCancel={closePanel}
              />
            ) : null}
            {panel?.kind === "reorder" ? (
              <ReorderPanel
                key={panels.key} open subaccounts={panel.subaccounts} items={reorderItems}
                saving={Boolean(busy)} error={panels.error}
                onSave={(list) => { void saveOrder(list); }} onCancel={closePanel}
              />
            ) : null}

            {/* Confirmation dialogs — the four `cmp_Account_PopUpConfirmation_*` (one at a time; texts
                in `rules.ts`). The failure is a `role="alert"` MessageBar inside the dialog; ✕ and
                Escape are locked while it runs. `destructive` (red Confirm) is NEW. The shared
                `ConfirmDialog` has no prop for the pop-up's or its buttons' canvas ids. */}
            <ConfirmDialog
              open={Boolean(dialog.state)}
              title={dialog.state?.payload.text.title ?? ""}
              description={dialog.state?.payload.text.description ?? ""}
              confirmText={dialog.state?.payload.text.confirmText ?? "Confirm"}
              confirmWidth={128}
              destructive={dialog.state?.kind === "deleteAccount" || dialog.state?.kind === "deleteSubaccount"}
              busy={dialog.busy}
              lockWhileBusy
              error={dialog.error ?? null}
              onConfirm={() => { void confirmDialog(); }}
              onCancel={dialog.cancel}
            />

            {/* SOURCE DEFECT (D19): the progress overlay the canvas declared (`locIsVisiblePopUpSpinner`) but never rendered. */}
            {/* Portalled so it stacks above an open drawer/dialog (both are Fluent portals). */}
            {busy ? <LoadingOverlay portal label={busy} /> : null}
          </div>
        )}
      </QueryStates>
    </div>
  );
}
