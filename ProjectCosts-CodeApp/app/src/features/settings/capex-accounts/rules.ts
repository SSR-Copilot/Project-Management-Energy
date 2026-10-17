/**
 * CAPEX Accounts (Application Settings) — every business rule of the screen, pure.
 *
 * Canvas: `Admin CAPEX Accounts.pa.yaml` (CA:line below). Requirements:
 * `codeapp-knowledge-base/screens/application-settings/capex-accounts/06-code-app-requirements/`.
 * Nothing here touches Dataverse or React; `@/data/settings/capex-accounts.ts` does the I/O and
 * `./Screen.tsx` the composition.
 */
import type { TablePrivileges } from "@/platform/privileges";
import type { CapexAccountRow } from "@/data/settings/capex-accounts";

/* ═══════════════════════════════════════════════════════════════════ tree ══ */

/** The root of the chart of accounts (App:1567-1580 `'Parent Account'.Number = "00001"`). */
export const ROOT_NUMBER = "00001";

export interface CapexNode {
  id: string;
  number: string;
  name: string;
  /** `vsb_order`; a null order sorts as 0 (DR-1). */
  order: number;
  active: boolean;
  parentId: string | null;
  children: CapexNode[];
}

export interface CapexTree {
  /** Undefined when no row numbered `00001` exists (FR-2 AC-2.3). */
  root: CapexNode | undefined;
  /** Children of the root, i.e. the tabs (FR-2). Inactive and Overleveraging included (D-CAT-1). */
  categories: CapexNode[];
  /** Every node reachable from the root, by id. Orphans are not in here. */
  byId: Map<string, CapexNode>;
}

/** Siblings: `vsb_order` asc, tie-break `vsb_number` (04-data/02 R1). */
export function compareSiblings(a: CapexNode, b: CapexNode): number {
  if (a.order !== b.order) return a.order - b.order;
  return a.number.localeCompare(b.number, undefined, { numeric: true });
}

/**
 * DR-1: the whole table, read once, as a tree. Rows that are not reachable from the root
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

/** UI `MaxLength 55` (CA:1341, 1885) — D-VAL-3 keeps 55. */
export const NAME_MAX_LENGTH = 55;

export const MSG = {
  accountNotNumeric: "Account number must contain numbers only.",
  accountExists: "Account number already in use. Please choose different number.",
  subaccountNotNumeric: "Subaccount number must contain numbers only.",
  subaccountExists: "Subaccount number already in use. Please choose different number.",
  nameRequired: "Name is required.",
  nameTooLong: `Name must be at most ${NAME_MAX_LENGTH} characters.`,
} as const;

/** Shown when the edited row (or a new subaccount's parent) vanished in a refetch (gap G4). */
export const GONE = {
  account: "This account no longer exists. Close the panel and refresh.",
  subaccount: "This subaccount no longer exists. Close the panel and refresh.",
  parent: "The parent account no longer exists. Close the panel and refresh.",
} as const;

/** V-1: a status change refused because the row was deleted by someone else. Nothing was written. */
export const GONE_STATUS = {
  account: "This account no longer exists, so its status was not changed. Close this dialog; the list will refresh.",
  subaccount: "This subaccount no longer exists, so its status was not changed. Close this dialog; the list will refresh.",
} as const;

/** Busy texts the canvas set but never rendered (D-UX-1, FR-14 AC-14.1). */
export const BUSY = {
  saveAccount: "Saving Account...",
  saveSubaccount: "Saving Subaccount...",
  saveOrder: "Saving new order...",
  deleteSubaccount: "Deleting Subaccount...",
  deleteAccount: "Deleting Account...",
  updateAccount: "Updating Account...",
  updateSubaccount: "Updating Subaccount...",
} as const;

/** D-VAL-1: digits only, after trim (canvas `IsNumeric` also accepted `-5`, `+5`, `1e3`). */
export function isDigitsOnly(value: string): boolean {
  return /^\d+$/.test(value.trim());
}

/** CA:1274-1282 — shown only when the field is non-blank. */
export function accountNumberError(value: string, editable: boolean): string | undefined {
  // Gated by edit mode, unlike the canvas (03-behaviour/01 §4 defect): a legacy non-numeric
  // number must not block a name-only edit.
  if (!editable || value.trim() === "") return undefined;
  return isDigitsOnly(value) ? undefined : MSG.accountNotNumeric;
}

/** CA:1817-1826 — evaluated only while the suffix is editable (New). */
export function subaccountSuffixError(value: string, editable: boolean): string | undefined {
  if (!editable || value.trim() === "") return undefined;
  return isDigitsOnly(value) ? undefined : MSG.subaccountNotNumeric;
}

/** D-VAL-2: trimmed; whitespace-only is blank. */
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

/** V1 (CA:1411-1421) + D-VAL-2. */
export function canSaveAccount(form: AccountForm, isNew: boolean): boolean {
  if (!form.categoryId) return false;
  if (nameError(form.name)) return false;
  if (!isNew) return true;
  return form.number.trim() !== "" && !accountNumberError(form.number, true);
}

export interface SubaccountForm { suffix: string; name: string }

/** V4 (CA:1955-1964) + D-VAL-2. */
export function canSaveSubaccount(form: SubaccountForm, isNew: boolean): boolean {
  if (nameError(form.name)) return false;
  if (!isNew) return true;
  return form.suffix.trim() !== "" && !subaccountSuffixError(form.suffix, true);
}

/**
 * `Max(Max(siblings, Order), 0) + 1` (CA:1436, 1980): floored at 0 BEFORE adding 1, so the new
 * row's order is never below 1 even when every sibling order is negative (parity PC-1). Used by
 * `createCapexAccount` with the live top sibling order. Shared E10 (`@/domain/reorder`), identical.
 */
export { nextOrder } from "@/domain/reorder";

/* ═════════════════════════════════════════════════════ action availability ══ */

export interface CommandState { visible: boolean; enabled: boolean }

/**
 * Result of the server-side "is a contract booked here?" check (D-DEL-2): `true`/`false` once
 * answered, `undefined` while loading, `"failed"` when the query errored (gap G10).
 */
export type ContractCheck = boolean | "failed" | undefined;

/** G10: why Delete is shown disabled when the contract check could not run. */
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
  /** Number of accounts in the selected category (AC-5.3, fixes D-CMD-1). */
  categoryAccountCount: number;
  /**
   * Whether a contract is booked directly on the selected account (D-DEL-1). `undefined` while
   * the check is still loading — Delete is then NOT offered. `"failed"` — Delete is shown
   * DISABLED (gap G10) and the screen explains why.
   */
  selectedHasContracts: ContractCheck;
  privileges: TablePrivileges;
}

/** G10: the selected account would be deletable, but its contract check failed. */
export function accountDeleteUnavailable(i: Pick<AccountCommandInput, "selected" | "selectedHasContracts">): boolean {
  return Boolean(i.selected) && i.selected!.children.length === 0 && i.selectedHasContracts === "failed";
}

/** FR-5 / 03-behaviour/01 "Account command bar". */
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

/** Module F; D-CMD-2: Reorder needs ≥ 2 subaccounts. */
export function subaccountCommands(account: CapexNode, p: TablePrivileges): SubaccountCommands {
  return {
    reorder: { visible: true, enabled: account.children.length >= 2 && p.canWrite },
    add: { visible: true, enabled: p.canCreate },
  };
}

export interface RowActions { edit: boolean; activate: boolean; deactivate: boolean; delete: boolean }

/**
 * 04-data/02 §2.1 (CA:538-589). `hasContracts` undefined = still checking → Delete hidden.
 * Permissions are table-level here (D-PERM-1: server-enforced).
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
 * G10: the row's contract check failed — the Delete icon is rendered DISABLED with an
 * explanation instead of being silently hidden. Never true together with `RowActions.delete`.
 */
export function subaccountDeleteUnavailable(hasContracts: ContractCheck, p: TablePrivileges): boolean {
  return hasContracts === "failed" && p.canDelete;
}

/*
 * Reorder (AC-8.2, D-ORD-1/2): `moveItem`, `reorderDiff` (1-based, changed rows only) and
 * `ORDER_BASE` now come from the shared `@/domain/reorder` (M12, identical results).
 */

/* ═══════════════════════════════════════════════════════════════ dialogs ══ */

export interface DialogText { title: string; description: string; confirmText: string }

/** FR-12 (CA:2401-2431), with D-STAT-1/D-STAT-6/D-STAT-8 wording. */
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

/** FR-11 (CA:2432-2460) — title keyed on the SUBACCOUNT's status (fixes D-STAT-2). */
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

/** FR-10 AC-10.3 — no claim that subaccounts are deleted (D-DEL-3). */
export function deleteAccountDialog(name: string): DialogText {
  return {
    title: "Delete Account?",
    description: `Are you sure that you want to permanently delete "${name}" account?`,
    confirmText: "Confirm",
  };
}

/** FR-9 (CA:2339, 2364). */
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

/** DR-7 inputs: today's LOCAL year and month (canvas `Today()`). */
export function forecastCutoff(today: Date): { year: number; month: number } {
  return { year: today.getFullYear(), month: today.getMonth() + 1 };
}
