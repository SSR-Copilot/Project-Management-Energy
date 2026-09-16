/**
 * Admin CAPEX Accounts — every business rule as a pure function.
 *
 * Canvas screen: `Admin CAPEX Accounts` (PM app)
 *   90 controls · 2 241 lines of Power Fx · 26 substantive blocks · band M
 *
 * Maintains the CAPEX chart of accounts: a two-level hierarchy inside the
 * self-referencing `CAPEX Account Lists` table. This is the only screen in the batch that
 * uses Dataverse privilege checks (`DataSourceInfo` / `RecordInfo`) to drive its UI, and
 * the only one whose deactivation cascade DESTROYS TRANSACTIONAL DATA (`CAPEX Costs`).
 *
 * ┌────────────────────────────────────────────────────────────────────────────────┐
 * │ SOURCE DEFECT — THE SCREEN ITSELF IS STILL UNPROTECTED.                         │
 * │                                                                                │
 * │ The per-command `DataSourceInfo(…, CreatePermission)` / `RecordInfo(…,          │
 * │ EditPermission)` tests decide what the COMMAND BAR offers. They are NOT a       │
 * │ screen-level check: `OnVisible` does only `UpdateContext(...)` plus an          │
 * │ `UpdateIf(colCapexAccounts, …)`, and entry is gated purely by                    │
 * │     ItemVisible: Or(gblCurrentUser.IsApplicationAdministrator,                  │
 * │                     gblCurrentUser.IsControllerOwnData)                         │
 * │ on the nav items — CLIENT-SIDE HIDING ONLY.                                     │
 * │                                                                                │
 * │ WHAT WE DID: `RequireAdmin` guards the route, `canEditCountry` gates the        │
 * │ writes, and the privilege flags below come from the platform SDK rather than    │
 * │ from role names. THE ROUTE GUARD IS NOT SECURITY — the server must reject       │
 * │ these writes too. This screen deletes forecast costs across every project in a  │
 * │ country; an unauthorised deactivation is unrecoverable from the UI (rule 14:    │
 * │ activating the account back does NOT restore the deleted rows).                 │
 * └────────────────────────────────────────────────────────────────────────────────┘
 *
 * NOTE the subaccount Reorder command has NO `ItemEnabled` at all in the source — its
 * privilege test is commented out, so it is always enabled regardless of privileges. That
 * gap is closed here (`canReorderSubaccounts`) and flagged.
 *
 * WHAT WAS DELETED AS A WORKAROUND
 *  - `colCapexAccounts` / `colCapexAccountCategories` / `colCapexProjectContracts`, built
 *    in `App.OnStart` and never refreshed: revisiting the screen after edits made
 *    elsewhere showed stale data until the app restarted. One query key, `['capexTree']`.
 *  - `ClearCollect(colCapexSubaccounts, 'CAPEX Account Lists')` — a full-table reload
 *    after every account delete (rule 16). Query invalidation replaces it.
 *  - `locResetOrderingList: "Reset" & Rand() & Now()`, whose only job was to force the
 *    drag control to re-read.
 *  - the `ForAll(...Patch)` cascade loops — one plan, one batch, and ideally one
 *    server-side custom API (see `planDeactivateAccount`'s note).
 */
import { ES_ADMIN, CHOICE_ADMIN, CAPEX_ROOT_NUMBER, CAPEX_SECOND_ROOT_NUMBER } from "@/data/entities";
import { canEditCountry, type CurrentUser } from "@/domain/session";

/* ═══════════════════════════════════════════════════════════════════ columns ════ */

export const CAPEX_ACCOUNT_COL = {
  id: "vsb_capexaccountlistid",
  name: "vsb_name",
  number: "vsb_number",
  order: "vsb_order",
  parentAccount: "_vsb_parentaccount_value",
  owningBusinessUnit: "_owningbusinessunit_value",
  statecode: "statecode",
} as const;

export const CAPEX_ACCOUNT_LOOKUP = {
  parentAccount: "vsb_ParentAccount",
  owningBusinessUnit: "owningbusinessunit",
} as const;

export const CAPEX_COST_COL = {
  id: "vsb_capexcostid",
  contract: "_vsb_contract_value",
  year: "vsb_year",
  month: "vsb_month",
  cost: "vsb_cost",
} as const;

export const CAPEX_CONTRACT_COL = {
  id: "vsb_capexprojectcontractid",
  account: "_vsb_account_value",
} as const;

export const CAPEX_ACCOUNT_ENTITY_SET = ES_ADMIN.capexAccountLists;
export const CAPEX_COST_ENTITY_SET = ES_ADMIN.capexCosts;

/* ═════════════════════════════════════════════════════════════════════ types ════ */

/** One `CAPEX Account Lists` row, flat. */
export interface CapexAccount {
  id: string;
  name: string;
  number: string;
  order: number;
  parentId: string | null;
  /** `statecode` — 0 Active, 1 Inactive. */
  status: number;
  owningBusinessUnitId: string | null;
}

/** A node of the built tree. `level` 1 = category, 2 = account, 3 = subaccount. */
export interface AccountNode extends CapexAccount {
  level: 1 | 2 | 3;
  childCount: number;
  children: AccountNode[];
}

export interface CapexContractRef { id: string; accountId: string | null }

export interface CapexCostRow {
  id: string;
  contractId: string | null;
  year: number;
  month: number;
  cost: number | null;
}

/**
 * Table and record privileges from the platform SDK — NEVER re-derived from a role name
 * (CONVENTIONS rule 4). `useTablePrivileges` supplies these; the rules only consume them.
 */
export interface Privileges {
  canCreate: boolean;
  canWrite: boolean;
  canDelete: boolean;
}

export const NO_PRIVILEGES: Privileges = { canCreate: false, canWrite: false, canDelete: false };

export interface PlannedWrite {
  op: "create" | "update" | "delete";
  entitySet: string;
  id?: string;
  data?: Record<string, unknown>;
  reason: string;
}

export interface WritePlan {
  writes: PlannedWrite[];
  log: string[];
  refusedReason?: string;
}

export const emptyPlan = (): WritePlan => ({ writes: [], log: [] });
const refuse = (reason: string): WritePlan => ({ writes: [], log: [], refusedReason: reason });

/* ═════════════════════════════════════════════════════════════════ messages ════ */

export const MSG = {
  /**
   * `lbl_Account_RightPanel_NewEditSubaccount_BodyContent_Number_ErrorMessageNotNumbers.Text` —
   * verbatim.
   */
  numbersOnly: "Subaccount number must contain numbers only.",
  /**
   * `lbl_Account_RightPanel_NewEditAccount_BodyContent_Number_ErrorMessageNumberExists.Text` —
   * verbatim.
   */
  duplicateAccount: "Account number already in use. Please choose different number.",
  /**
   * `lbl_Account_RightPanel_NewEditSubaccount_BodyContent_Number_ErrorMessageNumberExists.Text`
   * — verbatim.
   */
  duplicateSubaccount: "Subaccount number already in use. Please choose different number.",
  deactivateAccount:
    "Are you sure you want to deactivate this account? All related subaccounts will be "
    + "automatically deactivated and associated forecasted costs will be deleted.",
  deactivateSubaccount:
    "Are you sure you want to deactivate this subaccount? All forecasted costs associated "
    + "with this subaccount will be deleted.",
  deleteAccount: (name: string) =>
    `Are you sure you want to permanently delete "${name}" account with its all related subaccounts?`,
  deleteSubaccount: (name: string) =>
    `Are you sure you want to permanently delete "${name}" subaccount?`,
  /**
   * NEW — no canvas equivalent: raised when Dataverse refuses the create; the canvas admin
   * screens carry no permission check at all (see the header block)
   */
  noCreatePrivilege: "You do not have permission to create CAPEX accounts.",
  /**
   * NEW — no canvas equivalent: raised when Dataverse refuses the update; the canvas had no
   * permission check
   */
  noWritePrivilege: "You do not have permission to change CAPEX accounts.",
  /**
   * NEW — no canvas equivalent: raised when Dataverse refuses the delete; the canvas had no
   * permission check
   */
  noDeletePrivilege: "You do not have permission to delete CAPEX accounts.",
  /**
   * NEW — no canvas equivalent: the country-scope gate is added by the code app —
   * `gblCurrentUser.EditableCounties` is never read on this canvas screen
   */
  outOfScope: "This account is outside your editable country scope.",
  /**
   * NEW — no canvas equivalent: empty state for the accounts grid; the canvas gallery simply
   * rendered nothing
   */
  emptyCategory: "This category has no accounts yet.",
  /**
   * NEW — no canvas equivalent: empty state for the subaccount grid; the canvas gallery simply
   * rendered nothing
   */
  noSubaccounts: "This account has no subaccounts yet.",
} as const;

/* ═════════════════════════════════════════════════════════════ the account tree ════ */

/**
 * The shared tree builder. Admin Contract imports this rather than repeating the canvas's
 * nested `ForAll` + `Collect` walk (its rule 2).
 *
 * `rootNumber` seeds the walk (`"00001"` on both screens); `exclude` drops nodes by
 * number — the Contract screen excludes `"10006"`, this screen excludes nothing.
 *
 * The canvas collected 13 columns per node (`TotalCost: 0`, `ContractDevCo: EmptyGUID`,
 * `Selected: false`, `Used: false`, `IsFolded: true`, …). Those are per-USE state, not
 * tree structure, so they live with the consumer; the tree carries only what the shape
 * needs.
 */
export function buildAccountTree(
  accounts: CapexAccount[],
  opts: { rootNumber?: string; exclude?: readonly string[] } = {},
): AccountNode[] {
  const rootNumber = opts.rootNumber ?? CAPEX_ROOT_NUMBER;
  const exclude = new Set(opts.exclude ?? []);

  const root = accounts.find((a) => a.number === rootNumber) ?? null;
  const byParent = new Map<string, CapexAccount[]>();
  for (const a of accounts) {
    if (exclude.has(a.number)) continue;
    const key = a.parentId ?? "";
    const list = byParent.get(key) ?? [];
    list.push(a);
    byParent.set(key, list);
  }

  const build = (parentId: string, level: 1 | 2 | 3): AccountNode[] =>
    (byParent.get(parentId) ?? [])
      .slice()
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.number.localeCompare(b.number))
      .map((a) => {
        const children = level < 3 ? build(a.id, (level + 1) as 1 | 2 | 3) : [];
        return { ...a, level, childCount: children.length, children };
      });

  return root ? build(root.id, 1) : [];
}

/** Depth-first flatten, used by the pickers and by the tests. */
export function flattenTree(nodes: AccountNode[]): AccountNode[] {
  const out: AccountNode[] = [];
  const walk = (list: AccountNode[]) => {
    for (const n of list) { out.push(n); walk(n.children); }
  };
  walk(nodes);
  return out;
}

/**
 * Rule 1 — the CATEGORIES are the children of account number `"00001"`.
 *
 * DIVERGENCE, real and preserved: the Admin COST screen runs the same query with
 * `Not(Name = "Overleveraging")` appended; this screen does NOT. `excludeOverleveraging`
 * makes the divergence explicit rather than accidental (implementation step 3 of the Cost
 * screen).
 */
/**
 * @labels-not-in-corpus — a `CAPEX Account List`.`Name` DATA value; the canvas only ever
 * compares it (`Not(Name = "Overleveraging")`) and never draws it
 */
export const OVERLEVERAGING_CATEGORY_NAME = "Overleveraging";

export function listCategories(
  accounts: CapexAccount[],
  opts: { excludeOverleveraging?: boolean } = {},
): CapexAccount[] {
  const root = accounts.find((a) => a.number === CAPEX_ROOT_NUMBER);
  if (!root) return [];
  return accounts
    .filter((a) => a.parentId === root.id)
    .filter((a) => !(opts.excludeOverleveraging && a.name === OVERLEVERAGING_CATEGORY_NAME))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

/**
 * Rule 2 — the parent command bar counts a DIFFERENT set:
 * `Filter('CAPEX Account Lists', And(Or(IsBlank('Parent Account'),
 *   'Parent Account'.Number = "10005"), Not(Number = "10005")))`
 * i.e. every root-level account plus the children of the second root `"10005"`, minus
 * `"10005"` itself. It is used ONLY for the reorder-enablement count (rule 3).
 */
export function parentAccountsForReorder(accounts: CapexAccount[]): CapexAccount[] {
  const secondRoot = accounts.find((a) => a.number === CAPEX_SECOND_ROOT_NUMBER);
  return accounts.filter((a) =>
    a.number !== CAPEX_SECOND_ROOT_NUMBER
    && (a.parentId === null || (secondRoot !== undefined && a.parentId === secondRoot.id)));
}

/**
 * GUIDE p21 — the row label under a category tab is `"<number> - <name>"` verbatim,
 * e.g. `"80000 - Turbine / PV Supply Agreement"`. Row 80003's name literally contains
 * "(In-active)" IN ADDITION TO its own status chip reading "Inactive" — that is data
 * captured from the screenshot, not something this formatter adds or strips.
 */
export const accountRowLabel = (account: Pick<CapexAccount, "number" | "name">): string =>
  `${account.number} - ${account.name}`;

/* ═══════════════════════════════════════════════════════════ command enablement ════ */

/** Rule 4 — New is gated on the table's CreatePermission. */
export const canCreateAccount = (p: Privileges): boolean => p.canCreate;

/** Rule 4 — Edit needs a selection AND that record's EditPermission. */
export const canEditAccount = (selected: CapexAccount | null, p: Privileges): boolean =>
  selected !== null && p.canWrite;

/** Rule 5 — Activate and Deactivate are mutually exclusive, both needing EditPermission. */
export const showActivate = (selected: CapexAccount | null): boolean =>
  selected !== null && selected.status === CHOICE_ADMIN.capexAccountStatus.inactive;

export const showDeactivate = (selected: CapexAccount | null): boolean =>
  selected !== null && selected.status === CHOICE_ADMIN.capexAccountStatus.active;

/** Rule 3 — Reorder needs MORE THAN ONE row and the table's EditPermission. */
export const canReorderAccounts = (parents: CapexAccount[], p: Privileges): boolean =>
  parents.length > 1 && p.canWrite;

/**
 * The subaccount Reorder command in the canvas has NO `ItemEnabled` — its privilege test
 * is commented out, so it is always enabled. Closed here to match the account-level rule.
 */
export const canReorderSubaccounts = (subaccounts: CapexAccount[], p: Privileges): boolean =>
  subaccounts.length > 1 && p.canWrite;

/**
 * Rule 6 — Delete is HIDDEN, not merely disabled, when the account is in use: no
 * `CAPEX Project Contracts` anywhere under it AND no subaccounts. `ItemEnabled` is the
 * separate DeletePermission test, so an account can be visible-but-disabled.
 */
export function canDeleteAccount(
  account: CapexAccount | null,
  subaccounts: CapexAccount[],
  contracts: CapexContractRef[],
): boolean {
  if (!account) return false;
  const children = subaccounts.filter((s) => s.parentId === account.id);
  if (children.length > 0) return false;
  const childIds = new Set([account.id, ...children.map((c) => c.id)]);
  return !contracts.some((c) => c.accountId !== null && childIds.has(c.accountId));
}

/** Rule 6's `ItemEnabled` half — visible but disabled without the privilege. */
export const deleteEnabled = (p: Privileges): boolean => p.canDelete;

/**
 * GUIDE p21 — the toolbar above the account list, verbatim order and labels:
 * "Reorder", "New" (Add icon), "Edit" (pencil), "Deactivate". The canvas/previous build
 * ordered these New-first; the screenshot puts Reorder first. Activate and Deactivate
 * share one slot (rule 5, mutually exclusive); Delete is not captured in the screenshot's
 * toolbar text at all, but `canDeleteAccount` already hides it whenever the selected
 * account is in use — consistent with account 80000 (a supply-agreement account almost
 * certainly referenced by a contract) showing no fifth button.
 */
export const CAPEX_TOOLBAR_LABELS = {
  /**
   * `pcf_Admin_CAPEX_Accounts_RightContent_Parents_CommandBar.Items.ItemDisplayName` — verbatim
   * (the canvas literal lives in that formula's record field).
   */
  reorder: "Reorder",
  /**
   * `lbl_ProjectRevenues_RightPanel_NewEditCost_BodyHeader_2.Text` (`Project Revenues Screen`)
   * — verbatim.
   */
  new: "New",
  /** `btn_Edit_AdminContracts.Text` (`Admin Contract Screen`) — verbatim. */
  edit: "Edit",
  /** `con_DSRA_DSRF_Data_Deactivate.Text` (`Project Finance Screen`) — verbatim. */
  activate: "Activate",
  /** `con_DSRA_DSRF_Data_Deactivate.Text` (`Project Finance Screen`) — verbatim. */
  deactivate: "Deactivate",
  /** `btn_Delete_AdminContracts.Text` (`Admin Contract Screen`) — verbatim. */
  delete: "Delete",
} as const;

export const CAPEX_TOOLBAR_ORDER = [
  "reorder", "new", "edit", "deactivate", "activate", "delete",
] as const;

/** Reorders a command list into the GUIDE p21 sequence; unknown keys sort last, stable. */
export function sortToolbarCommands<T extends { key: string }>(commands: readonly T[]): T[] {
  const rank = (key: string): number => {
    const i = (CAPEX_TOOLBAR_ORDER as readonly string[]).indexOf(key);
    return i === -1 ? CAPEX_TOOLBAR_ORDER.length : i;
  };
  return commands
    .map((c, i) => ({ c, i }))
    .sort((a, b) => rank(a.c.key) - rank(b.c.key) || a.i - b.i)
    .map((x) => x.c);
}

/**
 * Rule 7 — the subaccount row icons, computed per row.
 *
 * SOURCE DEFECT: the canvas `ChangeStatusIcon` switches on `Status`, and the INACTIVE arm
 * tests `And(ThisItem.Status = 'Status (CAPEX Account Lists)'.Active, RecordInfo(...))`.
 * Inside the Inactive branch that condition is never true, so THE ACTIVATE ICON NEVER
 * RENDERS for a subaccount — a deactivated subaccount can never be reactivated from the
 * grid.
 *
 * FIXED: `activate` is returned whenever the record is Inactive and the user has write
 * privilege. Both branches are unit-tested (UT-ADCAPEX-021).
 */
export interface SubaccountRowIcons {
  edit: boolean;
  delete: boolean;
  deactivate: boolean;
  activate: boolean;
}

export function subaccountRowIcons(
  record: CapexAccount,
  p: Privileges,
  contracts: CapexContractRef[],
): SubaccountRowIcons {
  const referenced = contracts.some((c) => c.accountId === record.id);
  const active = record.status === CHOICE_ADMIN.capexAccountStatus.active;
  return {
    edit: p.canWrite,
    // The delete icon is absent entirely when a contract references the subaccount.
    delete: !referenced && p.canDelete,
    deactivate: active && p.canWrite,
    activate: !active && p.canWrite,     // the canvas branch that could never be true
  };
}

/** The canvas behaviour of rule 7's status icon, for the parity test. Not wired to the UI. */
export function subaccountActivateIconCanvasParity(
  record: CapexAccount,
  p: Privileges,
): boolean {
  const active = record.status === CHOICE_ADMIN.capexAccountStatus.active;
  // Inside the Inactive arm the canvas tests `Status = Active` — a contradiction.
  return active ? false : (active && p.canWrite);
}

/** Country scope, applied here and absent from the canvas. */
export function canEditAccountScope(
  user: CurrentUser | null,
  countryId: string | null | undefined,
): boolean {
  if (!user) return false;
  // Master accounts are global; only an explicit country scope narrows them.
  if (countryId === null || countryId === undefined) return user.isApplicationAdministrator
    || user.isControllerOwnData;
  return canEditCountry(user, countryId);
}

/* ═════════════════════════════════════════════════════════════════ number rules ════ */

/**
 * The numeric-only rule, reproducing the canvas's TRIPLE test verbatim:
 *   `Or(Not(IsNumeric(v)), IsMatch(v, ",", Contains), IsMatch(v, "\.", Contains))`
 * `IsNumeric("1.5")` is true in Power Fx, which is why the two explicit separator tests
 * exist. Blank passes here — the blank case is handled by the Save conjunction.
 */
export function isNumericAccountNumber(input: string): boolean {
  const v = input ?? "";
  if (v.trim() === "") return true;
  if (v.includes(",") || v.includes(".")) return false;
  return /^\d+$/.test(v.trim());
}

/** Rule 9 — subaccount numbers are COMPOSED: `<parent number>_<input>`. */
export const composeSubaccountNumber = (parentNumber: string, input: string): string =>
  `${parentNumber}_${input.trim()}`;

/**
 * Rule 8 — uniqueness is checked against the WHOLE table, by number.
 *
 * SOURCE DEFECT: the canvas sets `locIfAccountOrSubAccountNumberAlreadyExists` at SAVE
 * time and then `If(And(IsBlank(locSelectedAccount), <that flag>), "", <do the save>)` —
 * a duplicate silently does NOTHING except reveal the error label, and the label's
 * `Visible` is that post-hoc flag, so it is only ever true AFTER a failed attempt.
 *
 * FIXED: `hooks.ts` calls `existsByNumber` BEFORE the write and the message is shown
 * inline (UT-ADCAPEX-011).
 */
export const numberExists = (accounts: CapexAccount[], number: string): boolean =>
  accounts.some((a) => a.number === number.trim());

/** Rule 10 — `Order = Max(Max(<siblings>, Order), 0) + 1`. */
export function nextOrder(siblings: { order: number }[]): number {
  return siblings.reduce((m, s) => Math.max(m, s.order ?? 0), 0) + 1;
}

/* ═══════════════════════════════════════════════════════════════════ validation ════ */

export interface AccountForm {
  categoryId: string | null;
  name: string;
  /** The raw input; for a subaccount this is the suffix only. */
  number: string;
}

export interface AccountFormErrors {
  categoryMissing: boolean;
  nameMissing: boolean;
  numberMissing: boolean;
  numberNotNumeric: boolean;
  numberDuplicate: boolean;
}

export function validateAccountForm(
  form: AccountForm,
  opts: { isSubaccount: boolean; isEdit: boolean; existingNumbers: string[]; parentNumber?: string },
): AccountFormErrors {
  const composed = opts.isSubaccount && opts.parentNumber
    ? composeSubaccountNumber(opts.parentNumber, form.number)
    : form.number.trim();
  return {
    // A subaccount has no category dropdown — its parent is the selected account.
    categoryMissing: !opts.isSubaccount && !opts.isEdit && !form.categoryId,
    nameMissing: form.name.trim() === "",
    numberMissing: !opts.isEdit && form.number.trim() === "",
    numberNotNumeric: !isNumericAccountNumber(form.number),
    // Rule 12 — Number is not editable, so the duplicate test only applies to a create.
    numberDuplicate: !opts.isEdit && opts.existingNumbers.includes(composed),
  };
}

export const hasFormErrors = (e: AccountFormErrors): boolean => Object.values(e).some(Boolean);

export function accountFormMessages(
  e: AccountFormErrors,
  isSubaccount: boolean,
): string[] {
  const out: string[] = [];
  if (e.categoryMissing) out.push("Select a category.");
  if (e.nameMissing) out.push("Enter a name.");
  if (e.numberMissing) out.push("Enter a number.");
  if (e.numberNotNumeric) out.push(MSG.numbersOnly);
  if (e.numberDuplicate) {
    out.push(isSubaccount ? MSG.duplicateSubaccount : MSG.duplicateAccount);
  }
  return out;
}

/** Rule 12 — editing an existing account or subaccount changes ONLY `Name`. */
export const isNumberEditable = (isEdit: boolean): boolean => !isEdit;
export const isCategoryEditable = (isEdit: boolean): boolean => !isEdit;

/* ═════════════════════════════════════════════════════════════════════ the save ════ */

/**
 * Rules 10–12 and 18 — the save payload.
 *
 * Rule 11, PRESERVED DELIBERATELY: anything newly created is IMMEDIATELY DEACTIVATED. The
 * canvas follows every create with
 * `UpdateIf('CAPEX Account Lists', … = <new>, {Status: …Inactive})`. It is non-obvious and
 * safety-relevant — a new account must not be usable before it is reviewed — so the status
 * goes into the CREATE payload rather than being patched afterwards, which also removes
 * the window in which the row is briefly Active.
 */
export function buildAccountPayload(
  form: AccountForm,
  opts: {
    isSubaccount: boolean;
    isEdit: boolean;
    parent: CapexAccount | null;
    siblings: CapexAccount[];
  },
): Record<string, unknown> {
  if (opts.isEdit) {
    // Rule 12 — Name only.
    return { [CAPEX_ACCOUNT_COL.name]: form.name.trim() };
  }
  const number = opts.isSubaccount && opts.parent
    ? composeSubaccountNumber(opts.parent.number, form.number)
    : form.number.trim();

  const data: Record<string, unknown> = {
    [CAPEX_ACCOUNT_COL.name]: form.name.trim(),
    [CAPEX_ACCOUNT_COL.number]: number,
    [CAPEX_ACCOUNT_COL.order]: nextOrder(opts.siblings),
    // Rule 11 — created Inactive, on purpose.
    [CAPEX_ACCOUNT_COL.statecode]: CHOICE_ADMIN.capexAccountStatus.inactive,
  };
  // Rule 18 — the category IS the `'Parent Account'` lookup.
  if (opts.parent) {
    data[`${CAPEX_ACCOUNT_LOOKUP.parentAccount}@odata.bind`] =
      `/${CAPEX_ACCOUNT_ENTITY_SET}(${opts.parent.id})`;
  }
  return data;
}

export function planSaveAccount(
  form: AccountForm,
  opts: {
    isSubaccount: boolean;
    isEdit: boolean;
    editingId?: string;
    parent: CapexAccount | null;
    siblings: CapexAccount[];
    existingNumbers: string[];
    privileges: Privileges;
    canEdit: boolean;
  },
): WritePlan {
  if (!opts.canEdit) return refuse(MSG.outOfScope);
  if (opts.isEdit && !opts.privileges.canWrite) return refuse(MSG.noWritePrivilege);
  if (!opts.isEdit && !opts.privileges.canCreate) return refuse(MSG.noCreatePrivilege);

  const errors = validateAccountForm(form, {
    isSubaccount: opts.isSubaccount,
    isEdit: opts.isEdit,
    existingNumbers: opts.existingNumbers,
    parentNumber: opts.parent?.number,
  });
  if (hasFormErrors(errors)) {
    return refuse(accountFormMessages(errors, opts.isSubaccount)[0]);
  }

  const data = buildAccountPayload(form, opts);
  const plan = emptyPlan();
  plan.writes.push(
    opts.isEdit && opts.editingId
      ? {
          op: "update", entitySet: CAPEX_ACCOUNT_ENTITY_SET, id: opts.editingId, data,
          reason: `Renamed to “${form.name.trim()}”`,
        }
      : {
          op: "create", entitySet: CAPEX_ACCOUNT_ENTITY_SET, data,
          reason: `${opts.isSubaccount ? "Subaccount" : "Account"} “${form.name.trim()}” created (inactive)`,
        },
  );
  return plan;
}

/* ══════════════════════════════════════════════════════════════ the cost cascade ════ */

/**
 * Rule 15 — the cascade WINDOW: "rest of this year zeroed, all future years deleted".
 *   current-year rows with `Month > Month(Today())`  →  `Cost = 0`
 *   rows with `Year > Year(Today())`                 →  removed
 * Past months and the current month are untouched.
 */
export interface CostCascadeWindow {
  zeroYear: number;
  /** Rows in `zeroYear` with `month > zeroMonthExclusive` are zeroed. */
  zeroMonthExclusive: number;
  /** Rows with `year > deleteYearsAfter` are deleted. */
  deleteYearsAfter: number;
}

export function costCascadeWindow(today: Date): CostCascadeWindow {
  return {
    zeroYear: today.getFullYear(),
    zeroMonthExclusive: today.getMonth() + 1,   // Power Fx Month() is 1-based
    deleteYearsAfter: today.getFullYear(),
  };
}

export type CostCascadeAction = "zero" | "delete" | "keep";

export function classifyCostRow(row: CapexCostRow, w: CostCascadeWindow): CostCascadeAction {
  if (row.year > w.deleteYearsAfter) return "delete";
  if (row.year === w.zeroYear && row.month > w.zeroMonthExclusive) return "zero";
  return "keep";
}

/**
 * Rule 13 — DEACTIVATING AN ACCOUNT.
 *
 * ┌──────────────────────────────────────────────────────────────────────────────┐
 * │ DOCUMENTED DEFECT — THE CANVAS ACTIVATES THE SUBACCOUNTS IT SHOULD DEACTIVATE.│
 * │                                                                              │
 * │ `cmp_Account_PopUpConfirmation_ChangeStatusOfAccount.OnConfirm` sets the      │
 * │ account to Inactive and then sets EVERY CHILD to **Active** — while the       │
 * │ confirmation text the user just read says "All related subaccounts will be    │
 * │ automatically deactivated". It reads like a copy-paste inversion, and it      │
 * │ leaves the tree in a state the UI cannot describe: an inactive parent with    │
 * │ active children whose forecast costs have just been destroyed.                │
 * │                                                                              │
 * │ WE IMPLEMENT THE SANE BEHAVIOUR: children are deactivated with the parent,    │
 * │ which is what the dialog promises. `childStatusOnDeactivateCanvasParity`      │
 * │ keeps the source behaviour reachable and is what the parity test asserts, so  │
 * │ the decision can be reversed in one place if the business owner wants the     │
 * │ original. Do not "fix" this back without asking.                              │
 * └──────────────────────────────────────────────────────────────────────────────┘
 */
export const childStatusOnDeactivate = (): number => CHOICE_ADMIN.capexAccountStatus.inactive;

/** The canvas behaviour of rule 13 — children go ACTIVE. Parity only. */
export const childStatusOnDeactivateCanvasParity = (): number =>
  CHOICE_ADMIN.capexAccountStatus.active;

export interface DeactivateArgs {
  account: CapexAccount;
  /** The account's own children; empty when deactivating a subaccount (rule 14). */
  subaccounts: CapexAccount[];
  /** Contracts anywhere under the affected accounts. */
  contracts: CapexContractRef[];
  /** The candidate cost rows for those contracts — already window-filtered server-side. */
  costs: CapexCostRow[];
  today: Date;
  privileges: Privileges;
  canEdit: boolean;
  /** Set true to reproduce the canvas inversion instead of the sane behaviour. */
  canvasParity?: boolean;
}

/**
 * Rules 13–15 as ONE plan.
 *
 * MOVE THIS SERVER-SIDE. The canvas issues N+1 round-trips and is not transactional — a
 * failure halfway leaves the accounts inactive with the costs only partly zeroed, and the
 * deleted rows are gone for good (rule 14: activating the account back does not restore
 * them). The plan below is one `$batch`, which is atomic enough for today; the durable fix
 * is a Dataverse custom API `vsb_DeactivateCapexAccount(accountId)` doing the status flips
 * and the cost zero/delete in one transaction. That API does not exist yet.
 */
export function planDeactivateAccount(args: DeactivateArgs): WritePlan {
  if (!args.canEdit) return refuse(MSG.outOfScope);
  if (!args.privileges.canWrite) return refuse(MSG.noWritePrivilege);

  const plan = emptyPlan();
  const window = costCascadeWindow(args.today);

  plan.writes.push({
    op: "update", entitySet: CAPEX_ACCOUNT_ENTITY_SET, id: args.account.id,
    data: { [CAPEX_ACCOUNT_COL.statecode]: CHOICE_ADMIN.capexAccountStatus.inactive },
    reason: `${args.account.name} deactivated`,
  });

  const childStatus = args.canvasParity
    ? childStatusOnDeactivateCanvasParity()
    : childStatusOnDeactivate();

  for (const child of args.subaccounts) {
    plan.writes.push({
      op: "update", entitySet: CAPEX_ACCOUNT_ENTITY_SET, id: child.id,
      data: { [CAPEX_ACCOUNT_COL.statecode]: childStatus },
      reason: `${child.name} ${childStatus === CHOICE_ADMIN.capexAccountStatus.inactive
        ? "deactivated with its parent"
        : "ACTIVATED (canvas parity — see the defect note)"}`,
    });
  }

  // The contracts under the affected accounts define which cost rows are in scope.
  const affectedIds = new Set([args.account.id, ...args.subaccounts.map((s) => s.id)]);
  const contractIds = new Set(
    args.contracts
      .filter((c) => c.accountId !== null && affectedIds.has(c.accountId))
      .map((c) => c.id),
  );

  for (const row of args.costs) {
    if (row.contractId === null || !contractIds.has(row.contractId)) continue;
    const action = classifyCostRow(row, window);
    if (action === "zero") {
      plan.writes.push({
        op: "update", entitySet: CAPEX_COST_ENTITY_SET, id: row.id,
        data: { [CAPEX_COST_COL.cost]: 0 },
        reason: `Forecast cost ${row.year}/${row.month} zeroed`,
      });
    } else if (action === "delete") {
      plan.writes.push({
        op: "delete", entitySet: CAPEX_COST_ENTITY_SET, id: row.id,
        reason: `Forecast cost ${row.year}/${row.month} deleted`,
      });
    }
  }

  plan.log.push(
    `${args.account.name}: ${args.subaccounts.length} subaccount(s), `
    + `${plan.writes.length - 1 - args.subaccounts.length} cost row(s) affected.`,
  );
  return plan;
}

/** Rule 14 — activating only flips `Status` back. The deleted costs are NOT restored. */
export function planActivateAccount(
  account: CapexAccount,
  opts: { privileges: Privileges; canEdit: boolean },
): WritePlan {
  if (!opts.canEdit) return refuse(MSG.outOfScope);
  if (!opts.privileges.canWrite) return refuse(MSG.noWritePrivilege);
  const plan = emptyPlan();
  plan.writes.push({
    op: "update", entitySet: CAPEX_ACCOUNT_ENTITY_SET, id: account.id,
    data: { [CAPEX_ACCOUNT_COL.statecode]: CHOICE_ADMIN.capexAccountStatus.active },
    reason: `${account.name} activated (deleted forecast costs are not restored)`,
  });
  return plan;
}

/* ══════════════════════════════════════════════════════════════ delete + reorder ════ */

/**
 * Rule 16 — deleting an account removes the row. The canvas then rebuilds
 * `colCapexSubaccounts` from the WHOLE TABLE; query invalidation replaces that.
 */
export function planDeleteAccount(
  account: CapexAccount,
  opts: {
    subaccounts: CapexAccount[];
    contracts: CapexContractRef[];
    privileges: Privileges;
    canEdit: boolean;
  },
): WritePlan {
  if (!opts.canEdit) return refuse(MSG.outOfScope);
  if (!opts.privileges.canDelete) return refuse(MSG.noDeletePrivilege);
  if (!canDeleteAccount(account, opts.subaccounts, opts.contracts)) {
    return refuse("This account still has subaccounts or is referenced by a contract.");
  }
  const plan = emptyPlan();
  plan.writes.push({
    op: "delete", entitySet: CAPEX_ACCOUNT_ENTITY_SET, id: account.id,
    reason: `Account “${account.name}” deleted`,
  });
  return plan;
}

/** Rule 17 — reorder writes `Order: <position>` for the chosen level, as one batch. */
export function planReorder(
  accounts: CapexAccount[],
  orderedIds: string[],
  opts: { privileges: Privileges; canEdit: boolean },
): WritePlan {
  if (!opts.canEdit) return refuse(MSG.outOfScope);
  if (!opts.privileges.canWrite) return refuse(MSG.noWritePrivilege);
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const plan = emptyPlan();
  orderedIds.forEach((id, index) => {
    const position = index + 1;
    if (byId.get(id)?.order === position) return;
    plan.writes.push({
      op: "update", entitySet: CAPEX_ACCOUNT_ENTITY_SET, id,
      data: { [CAPEX_ACCOUNT_COL.order]: position },
      reason: `Moved to position ${position}`,
    });
  });
  return plan;
}
