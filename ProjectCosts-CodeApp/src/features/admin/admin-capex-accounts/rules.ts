/**
 * CAPEX Accounts (Application Settings) — every business rule of the screen, pure.
 *
 * Canvas: `Admin CAPEX Accounts` (PM app),
 * `ProjectDocs/_extracted/msapp/projectmanagement/Src/Admin CAPEX Accounts.pa.yaml`
 * (`CA:<n>` / `CAX:<n>` = a line in that file).
 * Nothing here touches Dataverse or React; `@/data/adminCapexAccounts.ts` does the I/O and
 * `./Screen.tsx` the composition.
 *
 * Visible strings are the canvas's, verbatim (CONVENTIONS rule 7); each cites its
 * `Control.Property`. Strings with no canvas counterpart say `NEW`. Behaviour that differs from the
 * canvas is marked `SOURCE DEFECT:` (a canvas bug, fixed) or `DIVERGENCE:` (a deliberate new
 * behaviour) — rule 8; see `ProjectDocs/app-docs/02-OPEN-DECISIONS.md` D19 and
 * `09-APPLICATION-SETTINGS-PORT-OPEN-POINTS.md` §1.
 *
 * SOURCE DEFECT: the screen itself is unprotected in the canvas. The `DataSourceInfo` /
 * `RecordInfo` tests only decide what the command bar offers; entry is client-side hiding only
 * (`ItemVisible: Or(IsApplicationAdministrator, IsControllerOwnData)` on the nav items). Here every
 * write is refused without the admin rule (`useAdminAccess`), and the table privileges are
 * server-enforced (`platform/privileges.ts`: Dataverse decides, a 403 becomes a message). Not
 * security: Dataverse must refuse these writes too (D1). A deactivation deletes forecast costs
 * across every project, and activating back does not restore them.
 *
 * No flow and no plugin step fires on the three tables this screen writes
 * (`ProjectDocs/migration-plans/04-flow-inventory.md`, verified section). The screen has no hidden
 * controls apart from `lbl_Account_AccountItemHeightValue_Hidden` (a gallery-height helper, not
 * ported).
 */
import { ES_ADMIN } from "@/data/dataverseNames";
import { emptyPlan, guardedUpdate, refusePlan, type PlannedWrite, type WritePlan } from "@/data/writePlan";
import type { TablePrivileges } from "@/platform/privileges";
import type { CapexAccountRow } from "@/data/adminCapexAccounts";

/* ═══════════════════════════════════════════════════════════════════ tree ══ */

/** The root of the chart of accounts (App:1567-1580 `'Parent Account'.Number = "00001"`). */
export const ROOT_NUMBER = "00001";

export interface CapexNode {
  id: string;
  number: string;
  name: string;
  /** `vsb_order`; a null order sorts as 0. */
  order: number;
  active: boolean;
  parentId: string | null;
  children: CapexNode[];
}

export interface CapexTree {
  /** Undefined when no row numbered `00001` exists. */
  root: CapexNode | undefined;
  /** Children of the root, i.e. the tabs. Inactive and Overleveraging included. */
  categories: CapexNode[];
  /** Every node reachable from the root, by id. Orphans are not in here. */
  byId: Map<string, CapexNode>;
}

/**
 * Siblings: `vsb_order` asc (`gal_Account_Accounts.Items` / `pcf_Account_AccountCardBody_SubAccounts
 * .Items: Sort(…, Order, SortOrder.Ascending)`, CA:392-399, CA:529-537), tie-break `vsb_number`
 * (NEW: the canvas left ties to the collection's order).
 */
export function compareSiblings(a: CapexNode, b: CapexNode): number {
  if (a.order !== b.order) return a.order - b.order;
  return a.number.localeCompare(b.number, undefined, { numeric: true });
}

/**
 * The whole table, read once, as a tree — replaces the canvas collections `colCapexAccounts` /
 * `colCapexAccountCategories` built in `App.OnStart` and never refreshed. The categories (the tabs)
 * are the children of the root `00001`. Rows that are not reachable from the root (a deleted
 * parent leaves its children orphaned — the lookup is RemoveLink) are ignored rather than crashed
 * on. Cycles cannot hang this: a node is attached at most once.
 */
export function buildCapexTree(rows: readonly CapexAccountRow[]): CapexTree {
  const nodes = new Map<string, CapexNode>();
  for (const r of rows) {
    nodes.set(r.id, {
      id: r.id, number: r.number, name: r.name, order: r.order ?? 0,
      active: r.active, parentId: r.parentId, children: [],
    });
  }
  const childrenOf = new Map<string, CapexNode[]>();
  for (const node of nodes.values()) {
    if (!node.parentId) continue;
    const list = childrenOf.get(node.parentId) ?? [];
    list.push(node);
    childrenOf.set(node.parentId, list);
  }

  const root = [...nodes.values()].find((n) => n.number === ROOT_NUMBER);
  const byId = new Map<string, CapexNode>();
  if (!root) return { root: undefined, categories: [], byId };

  const attach = (node: CapexNode) => {
    byId.set(node.id, node);
    const kids = (childrenOf.get(node.id) ?? []).filter((k) => !byId.has(k.id));
    kids.sort(compareSiblings);
    node.children = kids;
    for (const k of kids) attach(k);
  };
  attach(root);
  return { root, categories: root.children, byId };
}

/* ═══════════════════════════════════════════════════════════ validations ══ */

/**
 * `txt_Account_RightPanel_NewEditAccount_BodyContent_Name.MaxLength` /
 * `txt_Account_RightPanel_NewEditSubaccount_BodyContent_Name.MaxLength: =55` (CA:1341, 1885).
 */
export const NAME_MAX_LENGTH = 55;

export const MSG = {
  /** `lbl_Account_RightPanel_NewEditAccount_BodyContent_Number_ErrorMessageNotNumbers.Text` — verbatim. */
  accountNotNumeric: "Account number must contain numbers only.",
  /** `lbl_Account_RightPanel_NewEditAccount_BodyContent_Number_ErrorMessageNumberExists.Text` — verbatim. */
  accountExists: "Account number already in use. Please choose different number.",
  /** `lbl_Account_RightPanel_NewEditSubaccount_BodyContent_Number_ErrorMessageNotNumbers.Text` — verbatim. */
  subaccountNotNumeric: "Subaccount number must contain numbers only.",
  /** `lbl_Account_RightPanel_NewEditSubaccount_BodyContent_Number_ErrorMessageNumberExists.Text` — verbatim. */
  subaccountExists: "Subaccount number already in use. Please choose different number.",
  /**
   * NEW — no canvas equivalent: the canvas only disables Save on a blank name
   * (`pcf_Account_RightPanel_NewEditAccount_BodyButtons_Save.DisplayMode`, CA:1411-1421). It is the
   * Save gate's reason (`nameError`) and is NOT shown in the panels, as the canvas shows nothing
   * (`visibleNameError`, 20 Nov 2026).
   */
  nameRequired: "Name is required.",
  /** NEW — no canvas equivalent: a pasted-over-limit guard; the input's `MaxLength` caps typing. */
  nameTooLong: `Name must be at most ${NAME_MAX_LENGTH} characters.`,
} as const;

/**
 * NEW — no canvas equivalent (the canvas screen has no screen-level check). A write by a user who
 * fails the admin rule (`useAdminAccess`) is refused with this text. The wording still speaks of a
 * "country scope" from the pre-port `canEditAccountScope` gate, although the rule applied now is
 * the admin rule only — an open wording point, not changed here.
 */
export const OUT_OF_SCOPE = "This account is outside your editable country scope.";

/** NEW — no canvas equivalent: the edited row (or a new subaccount's parent) vanished in a refetch. */
export const GONE = {
  account: "This account no longer exists. Close the panel and refresh.",
  subaccount: "This subaccount no longer exists. Close the panel and refresh.",
  parent: "The parent account no longer exists. Close the panel and refresh.",
} as const;

/** NEW — no canvas equivalent: a status change refused because the row was deleted by someone else. Nothing was written. */
export const GONE_STATUS = {
  account: "This account no longer exists, so its status was not changed. Close this dialog; the list will refresh.",
  subaccount: "This subaccount no longer exists, so its status was not changed. Close this dialog; the list will refresh.",
} as const;

/**
 * The progress texts (`locSpinnerInformationText`), verbatim.
 *
 * SOURCE DEFECT (D19): the canvas sets them and `locIsVisiblePopUpSpinner`, but the screen has no
 * spinner control, so they were never shown. Here they label the busy overlay while a write runs.
 */
export const BUSY = {
  /** `pcf_Account_RightPanel_NewEditAccount_BodyButtons_Save.OnChange` (CA:1436). */
  saveAccount: "Saving Account...",
  /** `pcf_Account_RightPanel_NewEditSubaccount_BodyButtons_Save.OnChange` (CA:1980). */
  saveSubaccount: "Saving Subaccount...",
  /** `pcf_Account_RightPanel_Ordering_BodyButtons_Save.OnChange` (CA:2263). */
  saveOrder: "Saving new order...",
  /** `cmp_Account_PopUpConfirmation_DeleteSubAccount.OnConfirm` (CA:2347). */
  deleteSubaccount: "Deleting Subaccount...",
  /** `cmp_Account_PopUpConfirmation_DeleteAccount.OnConfirm` (CA:2381). */
  deleteAccount: "Deleting Account...",
  /** `cmp_Account_PopUpConfirmation_ChangeStatusOfAccount.OnConfirm` (CA:2423). */
  updateAccount: "Updating Account...",
  /** `cmp_Account_PopUpConfirmation_ChangeStatusOfSubAccount.OnConfirm` (CA:2454). */
  updateSubaccount: "Updating Subaccount...",
} as const;

/**
 * The forecast cost clean-up that follows a deactivation. It runs in the BACKGROUND, after the
 * status change landed and the dialog closed, under a progress toast: it is one request per cost
 * row (no bulk delete exists for a standard table, D36 §1), so for an account booked on many
 * projects it takes long, and the canvas too closed its pop-up before writing (CA:2423).
 */
export const CLEANUP = {
  running: "Cleaning up forecast costs...",
  /** `describeWriteError(error, action)`'s action. */
  action: "clean up the forecast costs",
  testId: "capex-forecast-cleanup",
} as const;

/** The clean-up's outcome toast (pure). */
export function cleanupDoneText(result: { contracts: number; zeroed: number; deleted: number }): string {
  if (result.contracts === 0) return "No forecast costs to clean up: no contracts are booked on it.";
  const rows = (n: number) => `${n} ${n === 1 ? "row" : "rows"}`;
  return `Forecast costs cleaned up: ${rows(result.zeroed)} set to 0, ${rows(result.deleted)} deleted.`;
}

/**
 * Digits only, after trim.
 *
 * SOURCE DEFECT (fix kept, D153): the canvas test is `Or(Not(IsNumeric(v)), IsMatch(v, ","), IsMatch(v, "\."))`
 * (CA:1274-1282, CA:1817-1826), so "-5", "+5" and "1e3" passed it as account / subaccount numbers. This app
 * accepts digits only. The canvas behaviour is `isCanvasNumberCanvasParity`.
 */
export function isDigitsOnly(value: string): boolean {
  return /^\d+$/.test(value.trim());
}

/** The canvas number test (sign and exponent accepted), kept as the parity twin of `isDigitsOnly` (UT-ADCAPEX-942). */
export function isCanvasNumberCanvasParity(value: string): boolean {
  return /^\s*[+-]?\d+(?:[eE][+-]?\d+)?\s*$/.test(value);
}

/**
 * `lbl_Account_RightPanel_NewEditAccount_BodyContent_Number_ErrorMessageNotNumbers.Visible`
 * (CA:1274-1282): shown only when the field is non-blank.
 *
 * SOURCE DEFECT (needs a product-owner decision; there is no D entry): the canvas account label
 * has no edit-mode gate (the subaccount label tests `DisplayMode = Edit`), and the Save gate
 * disables on it, so an account with a legacy non-numeric number could never be renamed. Here
 * the rule applies to a new account only. With numeric account numbers the two behave the same.
 */
export function accountNumberError(value: string, editable: boolean): string | undefined {
  if (!editable || value.trim() === "") return undefined;
  return isDigitsOnly(value) ? undefined : MSG.accountNotNumeric;
}

/**
 * `lbl_Account_RightPanel_NewEditSubaccount_BodyContent_Number_ErrorMessageNotNumbers.Visible`
 * (CA:1817-1826): evaluated only while the suffix is editable (New), as the canvas.
 */
export function subaccountSuffixError(value: string, editable: boolean): string | undefined {
  if (!editable || value.trim() === "") return undefined;
  return isDigitsOnly(value) ? undefined : MSG.subaccountNotNumeric;
}

/**
 * Trimmed; whitespace-only is blank. DIVERGENCE: the canvas Save gate is `IsBlank(Name)`, so a
 * name of spaces passed it.
 */
export function nameError(value: string): string | undefined {
  const t = value.trim();
  if (t === "") return MSG.nameRequired;
  if (t.length > NAME_MAX_LENGTH) return MSG.nameTooLong;
  return undefined;
}

/**
 * The name message a panel SHOWS. The canvas shows none for a blank name (its Save is just
 * disabled, CA:1411-1421, CA:1955-1964), so neither does this app; only the NEW over-limit guard
 * (a legacy name longer than `MaxLength: =55`) is shown.
 */
export function visibleNameError(value: string): string | undefined {
  return nameError(value) === MSG.nameTooLong ? MSG.nameTooLong : undefined;
}

/** `Number: locSelectedAccount.Number & "_" & Trim(txt_…_Subaccount…_Number.Value)` (CA:1980) — `<account number>_<trim(suffix)>`. */
export function composeSubaccountNumber(accountNumber: string, suffix: string): string {
  return `${accountNumber}_${suffix.trim()}`;
}

export interface AccountForm { categoryId: string | undefined; number: string; name: string }

/**
 * Account save gate — `pcf_Account_RightPanel_NewEditAccount_BodyButtons_Save.DisplayMode`
 * (CA:1411-1421): Category, Name and Number set and the not-numeric label hidden; the name is
 * trimmed (see `nameError`). The Number tests apply to a new account only (`accountNumberError`).
 */
export function canSaveAccount(form: AccountForm, isNew: boolean): boolean {
  if (!form.categoryId) return false;
  if (nameError(form.name)) return false;
  if (!isNew) return true;
  return form.number.trim() !== "" && !accountNumberError(form.number, true);
}

export interface SubaccountForm { suffix: string; name: string }

/** Subaccount save gate — `pcf_Account_RightPanel_NewEditSubaccount_BodyButtons_Save.DisplayMode` (CA:1955-1964); the name is trimmed. */
export function canSaveSubaccount(form: SubaccountForm, isNew: boolean): boolean {
  if (nameError(form.name)) return false;
  if (!isNew) return true;
  return form.suffix.trim() !== "" && !subaccountSuffixError(form.suffix, true);
}

/**
 * `Max(Max(siblings, Order), 0) + 1` (CA:1436, 1980): floored at 0 BEFORE adding 1, so the new
 * row's order is never below 1 even when every sibling order is negative. Used by
 * `createCapexAccount` with the top sibling order read live at save time (the canvas account
 * panel read the cached `colCapexAccounts`). Shared in `@/domain/reorder`.
 */
export { nextOrder } from "@/domain/reorder";

/* ═════════════════════════════════════════════════════ action availability ══ */

export interface CommandState { visible: boolean; enabled: boolean }

/**
 * Result of the server-side "is a contract booked here?" check: `true`/`false` once
 * answered, `undefined` while loading, `"failed"` when the query errored. The canvas looked the
 * contracts up in the cached `colCapexProjectContracts` (built once in `App.OnStart`).
 */
export type ContractCheck = boolean | "failed" | undefined;

/** NEW — no canvas equivalent: why Delete is shown disabled when the contract check could not run. */
export const CONTRACT_CHECK_FAILED = {
  account:
    "Could not check whether CAPEX contracts are booked on this account, so Delete is unavailable. Retry to check again.",
  subaccount: "Could not check bookings; Delete unavailable",
} as const;

export interface AccountCommands {
  reorder: CommandState;
  create: CommandState;
  edit: CommandState;
  activate: CommandState;
  deactivate: CommandState;
  delete: CommandState;
}

export interface AccountCommandInput {
  selected: CapexNode | undefined;
  categorySelected: boolean;
  /** Number of accounts in the selected category (the canvas counted another set). */
  categoryAccountCount: number;
  /**
   * Whether a contract is booked directly on the selected account. `undefined` while
   * the check is still loading — Delete is then NOT offered. `"failed"` — Delete is shown
   * DISABLED and the screen explains why.
   */
  selectedHasContracts: ContractCheck;
  privileges: TablePrivileges;
}

/** NEW: the selected account would be deletable, but its contract check failed (Delete shown disabled, not hidden). */
export function accountDeleteUnavailable(i: Pick<AccountCommandInput, "selected" | "selectedHasContracts">): boolean {
  return Boolean(i.selected) && i.selected!.children.length === 0 && i.selectedHasContracts === "failed";
}

/**
 * The account command bar — `pcf_Admin_CAPEX_Accounts_RightContent_Parents_CommandBar.Items`
 * (CA:190-294). `ItemVisible` → `visible`, `ItemEnabled` → `enabled`; the `DataSourceInfo` /
 * `RecordInfo` permission tests are `privileges` (server-enforced, so all true today).
 *
 * SOURCE DEFECT (D19): Reorder is enabled in the canvas when `varColParentAccounts` — every
 * root-level account plus the children of "10005", minus "10005" — has more than one row
 * (CA:193-218), while the panel it opens lists the SELECTED CATEGORY's accounts. Here the count is
 * the category's accounts (≥ 2), so Reorder is enabled exactly when there is something to reorder.
 * The pre-port twin `canReorderAccountsCanvasParity` (UT-ADCAPEX-004) was not carried over.
 *
 * DIVERGENCE (D19, product decision): Delete is visible only when the account has no subaccounts
 * AND no contract is booked on the account ITSELF (server check, `selectedHasContracts === false`).
 * The canvas `ItemVisible` (CA:271-287) tests the subaccounts' contracts — which, with no
 * subaccounts, is always empty — so it never checked the account's own contracts. While the check
 * is loading Delete is hidden; when it failed Delete is shown disabled (NEW).
 */
export function accountCommands(i: AccountCommandInput): AccountCommands {
  const sel = i.selected;
  const p = i.privileges;
  const deletable = Boolean(sel) && sel!.children.length === 0 && i.selectedHasContracts === false;
  if (accountDeleteUnavailable(i)) {
    return { ...accountCommands({ ...i, selectedHasContracts: undefined }), delete: { visible: true, enabled: false } };
  }
  return {
    reorder: { visible: true, enabled: i.categoryAccountCount >= 2 && p.canWrite },
    create: { visible: true, enabled: i.categorySelected && p.canCreate },
    // Edit is shown disabled (not hidden) when nothing is selected (CA:233-239).
    edit: { visible: true, enabled: Boolean(sel) && p.canWrite },
    activate: { visible: Boolean(sel) && !sel!.active, enabled: p.canWrite },
    deactivate: { visible: Boolean(sel) && sel!.active, enabled: p.canWrite },
    delete: { visible: deletable, enabled: p.canDelete },
  };
}

export interface SubaccountCommands { reorder: CommandState; add: CommandState }

/**
 * The subaccount command bar — `pcf_Account_AccountCardBody_SubAccountsCommandBar.Items`
 * (CA:477-492). "Add subaccount": `ItemEnabled: DataSourceInfo(…, CreatePermission)`.
 *
 * "Reorder subaccounts" has NO `ItemEnabled` (its test is commented out, CA:483-484), so it is
 * always enabled, whatever the number of subaccounts and the privileges: the product owner's
 * decision (D19, "always enabled, exactly as the canvas"; Dataverse refuses the write for a user
 * without the privilege). The port had made it need 2 or more subaccounts and write privilege
 * without a recorded decision; restored to the canvas on 20 Nov 2026.
 */
export function subaccountCommands(p: TablePrivileges): SubaccountCommands {
  return {
    reorder: { visible: true, enabled: true },
    add: { visible: true, enabled: p.canCreate },
  };
}

export interface RowActions { edit: boolean; activate: boolean; deactivate: boolean; delete: boolean }

/**
 * Subaccount row actions — the `EditIcon` / `ChangeStatusIcon` / `DeleteIcon` columns of
 * `pcf_Account_AccountCardBody_SubAccounts.Items` (CA:538-589). `hasContracts` undefined = still
 * checking → Delete hidden. Permissions are table-level here (server-enforced), not the canvas
 * per-record `RecordInfo`.
 *
 * SOURCE DEFECT (D19): the canvas `ChangeStatusIcon` Inactive arm tests `ThisItem.Status = Active`
 * (CA:557-567), which is never true there, so the Activate icon NEVER appears and an inactive
 * subaccount could not be reactivated from the grid. Here it appears for an inactive subaccount.
 * The pre-port twin `subaccountActivateIconCanvasParity` (UT-ADCAPEX-021) was not carried over.
 *
 * SOURCE DEFECT (fix kept, D153): Activate is offered only while the PARENT account is active
 * (`parent.active`). The canvas formula reads the row only, so a subaccount could be activated under an
 * inactive account, leaving an active subaccount below an inactive parent (doc 09 §1).
 */
export function subaccountRowActions(
  sub: Pick<CapexNode, "active">,
  parent: Pick<CapexNode, "active">,
  hasContracts: ContractCheck,
  p: TablePrivileges,
): RowActions {
  return {
    edit: p.canWrite,
    deactivate: sub.active && p.canWrite,
    activate: !sub.active && parent.active && p.canWrite,
    delete: hasContracts === false && p.canDelete,
  };
}

/**
 * NEW: the row's contract check failed — the Delete icon is rendered DISABLED with an
 * explanation instead of being silently hidden. Never true together with `RowActions.delete`.
 */
export function subaccountDeleteUnavailable(hasContracts: ContractCheck, p: TablePrivileges): boolean {
  return hasContracts === "failed" && p.canDelete;
}

/*
 * Reorder: `moveItem`, `reorderDiff` (1-based, changed rows only) and `ORDER_BASE` come from the
 * shared `@/domain/reorder`. DIVERGENCE: `pcf_Account_RightPanel_Ordering_BodyButtons_Save.OnChange`
 * writes `{Order: RecordItem.Position}` for EVERY listed row (CA:2270-2286); here only the rows
 * whose Order changed are written.
 */

/* ═══════════════════════════════════════════════════════════════ dialogs ══ */

export interface DialogText { title: string; description: string; confirmText: string }

/**
 * `cmp_Account_PopUpConfirmation_ChangeStatusOfAccount` (CA:2401-2431): `Title` "Deactivate
 * Account?" / "Activate Account?", `ConfirmButtonText` "Deactivate" / "Activate" and the
 * Deactivate `Description` — verbatim.
 *
 * SOURCE DEFECT (fix kept, D153): the canvas Activate `Description` is `"Are you sure that you want to
 * activate """ & Name & """ account?"` (CA:2416), which hides what activating does. This app adds
 * "Subaccounts keep their current status and previously removed forecast costs are not restored."
 */
export function accountStatusDialog(account: Pick<CapexNode, "name" | "active">): DialogText {
  return account.active
    ? {
      title: "Deactivate Account?",
      description:
        `Are you sure that you want to deactivate "${account.name}" account? All related subaccounts ` +
        "will be automatically deactivated and associated forecasted costs will be deleted.",
      confirmText: "Deactivate",
    }
    : {
      title: "Activate Account?",
      description:
        `Are you sure that you want to activate "${account.name}" account? Subaccounts keep their ` +
        "current status and previously removed forecast costs are not restored.",
      confirmText: "Activate",
    };
}

/**
 * `cmp_Account_PopUpConfirmation_ChangeStatusOfSubAccount` (CA:2432-2462): `Title`
 * "Deactivate Subaccount?" / "Activate Subaccount?", `ConfirmButtonText` and the Deactivate
 * `Description` — verbatim.
 *
 * SOURCE DEFECT (D19): the canvas `Title` reads `locSelectedAccount.Status` — the PARENT's status
 * (CA:2455-2460) — while the description and button read the subaccount's. All three read the
 * subaccount here.
 *
 * SOURCE DEFECT (fix kept, D153): the canvas Activate `Description` is `"Are you sure that you want to
 * activate """ & Name & """ subaccount?"` (CA:2447); this app adds "Previously removed forecast costs are
 * not restored."
 */
export function subaccountStatusDialog(sub: Pick<CapexNode, "name" | "active">): DialogText {
  return sub.active
    ? {
      title: "Deactivate Subaccount?",
      description:
        `Are you sure that you want to deactivate "${sub.name}" subaccount? All forecasted costs ` +
        "associated with this subaccount will be deleted.",
      confirmText: "Deactivate",
    }
    : {
      title: "Activate Subaccount?",
      description:
        `Are you sure that you want to activate "${sub.name}" subaccount? Previously removed ` +
        "forecast costs are not restored.",
      confirmText: "Activate",
    };
}

/**
 * `cmp_Account_PopUpConfirmation_DeleteAccount` (CA:2367-2400): `Title` "Delete Account?" and
 * `ConfirmButtonText` "Confirm" — verbatim.
 *
 * SOURCE DEFECT (fix kept, D153): the canvas `Description` is `"Are you sure that you want to permanently
 * delete """ & Name & """ account with its all related subaccounts?"` (CA:2373). Delete is only offered for an
 * account WITHOUT subaccounts and deletes nothing else, so the text here drops that wrong claim.
 */
export function deleteAccountDialog(name: string): DialogText {
  return {
    title: "Delete Account?",
    description: `Are you sure that you want to permanently delete "${name}" account?`,
    confirmText: "Confirm",
  };
}

/**
 * `cmp_Account_PopUpConfirmation_DeleteSubAccount` (CA:2333-2366): `Title`, `Description`
 * (CA:2339) and `ConfirmButtonText` "Confirm" — verbatim.
 */
export function deleteSubaccountDialog(name: string): DialogText {
  return {
    title: "Delete Subaccount?",
    description: `Are you sure that you want to permanently delete "${name}" subaccount?`,
    confirmText: "Confirm",
  };
}

/** `lbl_Account_AccountName.Text: =ThisItem.Number & " - " & ThisItem.Name` (CA:728) — `"<number> - <name>"`. */
export function accountLabel(node: Pick<CapexNode, "number" | "name">): string {
  return `${node.number} - ${node.name}`;
}

/**
 * Cutoff inputs: today's LOCAL year and month (canvas `Year(Today())` / `Month(Today())`). The
 * deactivate clean-up zeroes this year's costs with `Month > month` and deletes every later year
 * (`cmp_Account_PopUpConfirmation_ChangeStatusOf{Account,SubAccount}.OnConfirm`, CA:2423, 2454).
 */
export function forecastCutoff(today: Date): { year: number; month: number } {
  return { year: today.getFullYear(), month: today.getMonth() + 1 };
}

/* ═══════════════════════════════════════════════════════════ write plans ══ */

/*
 * The screen's SINGLE-REQUEST writes — rename, activate account, activate subaccount — are built
 * here as one-write `WritePlan`s and sent by `@/data/runPlan` through `@/data/executePlan`
 * (CONVENTIONS rule 17, documented exception in 09-APPLICATION-SETTINGS-PORT-OPEN-POINTS §1).
 * Every one of them is a `guarded` update: the row is read by primary key first and, when another
 * admin deleted it meanwhile, NOTHING is sent and `RecordGoneError` surfaces — exactly what
 * `updateRecordIfExists` did for these writes in the data layer, so the requests on the wire are
 * unchanged. `label` keeps each failure's operation text word for word.
 * DIVERGENCE (guard): the canvas `UpdateIf` on a deleted row silently matched nothing.
 *
 * The screen's multi-step flows (create, reorder, delete, both deactivates) are NOT plans — doc 09
 * §1 says otherwise; this is the code. They stay in `@/data/adminCapexAccounts.ts`: they read at
 * save time, pool writes, skip rows deleted meanwhile and report per-step counts, none of which a
 * static, sequential, fail-stop plan can express.
 *
 * `canEdit` is `useAdminAccess()`. `Screen.tsx` refuses first (so the refusal lands on the surface
 * the user is looking at, as an `OutOfScopeError`); the plan refuses again with the SAME text, so a
 * plan can never be sent without it.
 */
const ACCOUNTS_SET = ES_ADMIN.capexAccountLists;

/** `statecode`/`statuscode` of an Active row, in the order the data layer sent them. */
export const STATE_ACTIVE_PAYLOAD = { statecode: 0, statuscode: 1 } as const;

export interface PlanOptions { canEdit: boolean }

function singleWrite(opts: PlanOptions, write: PlannedWrite): WritePlan {
  if (!opts.canEdit) return refusePlan(OUT_OF_SCOPE);
  const plan = emptyPlan();
  plan.writes.push(write);
  return plan;
}

/**
 * Rename only — the "Existing account/subaccount updated" branch of the Save formulas
 * (`UpdateIf(…, {Name: txt_…_Name.Value})`, CA:1436, 1980): Number and Category are never sent.
 * SOURCE DEFECT (D19, minor): the canvas stores the name untrimmed; it is trimmed here.
 * A row deleted since the tree loaded is refused, never recreated.
 */
export function planRenameAccount(id: string, name: string, opts: PlanOptions): WritePlan {
  return singleWrite(opts, guardedUpdate(
    ACCOUNTS_SET, id, { vsb_name: name.trim() }, "account renamed", "rename CAPEX account",
  ));
}

/**
 * Activate an account: status only, as the canvas Inactive branch of
 * `cmp_Account_PopUpConfirmation_ChangeStatusOfAccount.OnConfirm` (CA:2423) — subaccounts keep
 * their status, deleted forecast costs are not restored.
 */
export function planActivateAccount(id: string, opts: PlanOptions): WritePlan {
  return singleWrite(opts, guardedUpdate(
    ACCOUNTS_SET, id, { ...STATE_ACTIVE_PAYLOAD }, "account activated", "activate CAPEX account",
  ));
}

/** Activate a subaccount: status only (`cmp_Account_PopUpConfirmation_ChangeStatusOfSubAccount.OnConfirm`, CA:2454). */
export function planActivateSubaccount(id: string, opts: PlanOptions): WritePlan {
  return singleWrite(opts, guardedUpdate(
    ACCOUNTS_SET, id, { ...STATE_ACTIVE_PAYLOAD }, "subaccount activated", "activate CAPEX subaccount",
  ));
}
