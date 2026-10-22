/**
 * CAPEX Accounts (Application Settings) — every business rule of the screen, pure.
 *
 * Canvas: `Admin CAPEX Accounts.pa.yaml` (CA:line below).
 * Nothing here touches Dataverse or React; `@/data/adminCapexAccounts.ts` does the I/O and
 * `./Screen.tsx` the composition.
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

/** Siblings: `vsb_order` asc, tie-break `vsb_number`. */
export function compareSiblings(a: CapexNode, b: CapexNode): number {
  if (a.order !== b.order) return a.order - b.order;
  return a.number.localeCompare(b.number, undefined, { numeric: true });
}

/**
 * The whole table, read once, as a tree. Rows that are not reachable from the root
 * (a deleted parent leaves its children orphaned — the lookup is RemoveLink) are ignored rather
 * than crashed on. Cycles cannot hang this: a node is attached at most once.
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

/** UI `MaxLength 55` (CA:1341, 1885) — kept at 55. */
export const NAME_MAX_LENGTH = 55;

export const MSG = {
  accountNotNumeric: "Account number must contain numbers only.",
  accountExists: "Account number already in use. Please choose different number.",
  subaccountNotNumeric: "Subaccount number must contain numbers only.",
  subaccountExists: "Subaccount number already in use. Please choose different number.",
  nameRequired: "Name is required.",
  nameTooLong: `Name must be at most ${NAME_MAX_LENGTH} characters.`,
} as const;

/** A write by a user who fails the admin rule (`useAdminAccess`) is refused with this text. */
export const OUT_OF_SCOPE = "This account is outside your editable country scope.";

/** Shown when the edited row (or a new subaccount's parent) vanished in a refetch. */
export const GONE = {
  account: "This account no longer exists. Close the panel and refresh.",
  subaccount: "This subaccount no longer exists. Close the panel and refresh.",
  parent: "The parent account no longer exists. Close the panel and refresh.",
} as const;

/** A status change refused because the row was deleted by someone else. Nothing was written. */
export const GONE_STATUS = {
  account: "This account no longer exists, so its status was not changed. Close this dialog; the list will refresh.",
  subaccount: "This subaccount no longer exists, so its status was not changed. Close this dialog; the list will refresh.",
} as const;

/** Busy texts the canvas set but never rendered. */
export const BUSY = {
  saveAccount: "Saving Account...",
  saveSubaccount: "Saving Subaccount...",
  saveOrder: "Saving new order...",
  deleteSubaccount: "Deleting Subaccount...",
  deleteAccount: "Deleting Account...",
  updateAccount: "Updating Account...",
  updateSubaccount: "Updating Subaccount...",
} as const;

/** Digits only, after trim (canvas `IsNumeric` also accepted `-5`, `+5`, `1e3`). */
export function isDigitsOnly(value: string): boolean {
  return /^\d+$/.test(value.trim());
}

/** CA:1274-1282 — shown only when the field is non-blank. */
export function accountNumberError(value: string, editable: boolean): string | undefined {
  // Gated by edit mode, unlike the canvas (a canvas defect): a legacy non-numeric
  // number must not block a name-only edit.
  if (!editable || value.trim() === "") return undefined;
  return isDigitsOnly(value) ? undefined : MSG.accountNotNumeric;
}

/** CA:1817-1826 — evaluated only while the suffix is editable (New). */
export function subaccountSuffixError(value: string, editable: boolean): string | undefined {
  if (!editable || value.trim() === "") return undefined;
  return isDigitsOnly(value) ? undefined : MSG.subaccountNotNumeric;
}

/** Trimmed; whitespace-only is blank. */
export function nameError(value: string): string | undefined {
  const t = value.trim();
  if (t === "") return MSG.nameRequired;
  if (t.length > NAME_MAX_LENGTH) return MSG.nameTooLong;
  return undefined;
}

/** CA:1980 — `<account number>_<trim(suffix)>`. */
export function composeSubaccountNumber(accountNumber: string, suffix: string): string {
  return `${accountNumber}_${suffix.trim()}`;
}

export interface AccountForm { categoryId: string | undefined; number: string; name: string }

/** Account save gate (CA:1411-1421); the name is trimmed. */
export function canSaveAccount(form: AccountForm, isNew: boolean): boolean {
  if (!form.categoryId) return false;
  if (nameError(form.name)) return false;
  if (!isNew) return true;
  return form.number.trim() !== "" && !accountNumberError(form.number, true);
}

export interface SubaccountForm { suffix: string; name: string }

/** Subaccount save gate (CA:1955-1964); the name is trimmed. */
export function canSaveSubaccount(form: SubaccountForm, isNew: boolean): boolean {
  if (nameError(form.name)) return false;
  if (!isNew) return true;
  return form.suffix.trim() !== "" && !subaccountSuffixError(form.suffix, true);
}

/**
 * `Max(Max(siblings, Order), 0) + 1` (CA:1436, 1980): floored at 0 BEFORE adding 1, so the new
 * row's order is never below 1 even when every sibling order is negative. Used by
 * `createCapexAccount` with the live top sibling order. Shared in `@/domain/reorder`.
 */
export { nextOrder } from "@/domain/reorder";

/* ═════════════════════════════════════════════════════ action availability ══ */

export interface CommandState { visible: boolean; enabled: boolean }

/**
 * Result of the server-side "is a contract booked here?" check: `true`/`false` once
 * answered, `undefined` while loading, `"failed"` when the query errored.
 */
export type ContractCheck = boolean | "failed" | undefined;

/** Why Delete is shown disabled when the contract check could not run. */
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

/** The selected account would be deletable, but its contract check failed. */
export function accountDeleteUnavailable(i: Pick<AccountCommandInput, "selected" | "selectedHasContracts">): boolean {
  return Boolean(i.selected) && i.selected!.children.length === 0 && i.selectedHasContracts === "failed";
}

/** The account command bar. */
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

/** The subaccount command bar: Reorder needs ≥ 2 subaccounts. */
export function subaccountCommands(account: CapexNode, p: TablePrivileges): SubaccountCommands {
  return {
    reorder: { visible: true, enabled: account.children.length >= 2 && p.canWrite },
    add: { visible: true, enabled: p.canCreate },
  };
}

export interface RowActions { edit: boolean; activate: boolean; deactivate: boolean; delete: boolean }

/**
 * Subaccount row actions (CA:538-589). `hasContracts` undefined = still checking → Delete hidden.
 * Permissions are table-level here (server-enforced).
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
 * The row's contract check failed — the Delete icon is rendered DISABLED with an
 * explanation instead of being silently hidden. Never true together with `RowActions.delete`.
 */
export function subaccountDeleteUnavailable(hasContracts: ContractCheck, p: TablePrivileges): boolean {
  return hasContracts === "failed" && p.canDelete;
}

/*
 * Reorder: `moveItem`, `reorderDiff` (1-based, changed rows only) and
 * `ORDER_BASE` now come from the shared `@/domain/reorder` (identical results).
 */

/* ═══════════════════════════════════════════════════════════════ dialogs ══ */

export interface DialogText { title: string; description: string; confirmText: string }

/** Account status dialog (CA:2401-2431). */
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

/** Subaccount status dialog (CA:2432-2460) — title keyed on the SUBACCOUNT's status (the canvas title read the parent's). */
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

/** Delete-account dialog — no claim that subaccounts are deleted. */
export function deleteAccountDialog(name: string): DialogText {
  return {
    title: "Delete Account?",
    description: `Are you sure that you want to permanently delete "${name}" account?`,
    confirmText: "Confirm",
  };
}

/** Delete-subaccount dialog (CA:2339, 2364). */
export function deleteSubaccountDialog(name: string): DialogText {
  return {
    title: "Delete Subaccount?",
    description: `Are you sure that you want to permanently delete "${name}" subaccount?`,
    confirmText: "Confirm",
  };
}

/** `"<number> - <name>"` (CA:728). */
export function accountLabel(node: Pick<CapexNode, "number" | "name">): string {
  return `${node.number} - ${node.name}`;
}

/** Cutoff inputs: today's LOCAL year and month (canvas `Today()`). */
export function forecastCutoff(today: Date): { year: number; month: number } {
  return { year: today.getFullYear(), month: today.getMonth() + 1 };
}

/* ═══════════════════════════════════════════════════════════ write plans ══ */

/*
 * The screen's SINGLE-REQUEST writes — rename, activate account, activate subaccount — are built
 * here as one-write `WritePlan`s and sent by `@/data/runPlan` through `@/data/executePlan`
 * (CONVENTIONS rule 17, D36). Every one of them is a `guarded` update: the row is read by primary
 * key first and, when another admin deleted it meanwhile, NOTHING is sent and `RecordGoneError`
 * surfaces — exactly what `updateRecordIfExists` did for these writes in the data layer, so the
 * requests on the wire are unchanged. `label` keeps each failure's operation text word for word.
 *
 * The screen's multi-step flows (create, reorder, delete, both deactivates) stay in
 * `@/data/adminCapexAccounts.ts`: they read at save time, pool writes, skip rows deleted meanwhile
 * and report per-step counts, none of which a static, sequential, fail-stop plan can express (D36).
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
 * Rename only — Number and Category are never sent, and the name is trimmed (CA:1436, 1980).
 * A row deleted since the tree loaded is refused, never recreated.
 */
export function planRenameAccount(id: string, name: string, opts: PlanOptions): WritePlan {
  return singleWrite(opts, guardedUpdate(
    ACCOUNTS_SET, id, { vsb_name: name.trim() }, "account renamed", "rename CAPEX account",
  ));
}

/** Activate an account: status only — subaccounts keep their status, costs are not restored. */
export function planActivateAccount(id: string, opts: PlanOptions): WritePlan {
  return singleWrite(opts, guardedUpdate(
    ACCOUNTS_SET, id, { ...STATE_ACTIVE_PAYLOAD }, "account activated", "activate CAPEX account",
  ));
}

/** Activate a subaccount: status only. */
export function planActivateSubaccount(id: string, opts: PlanOptions): WritePlan {
  return singleWrite(opts, guardedUpdate(
    ACCOUNTS_SET, id, { ...STATE_ACTIVE_PAYLOAD }, "subaccount activated", "activate CAPEX subaccount",
  ));
}
