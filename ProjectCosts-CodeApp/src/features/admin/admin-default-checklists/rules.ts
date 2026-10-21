/**
 * Admin Project Default Checklists Screen — every business rule as a pure function.
 *
 * Canvas screen: `Admin Project Default Checklists Screen` (PM app)
 *   75 controls · 1 343 lines of Power Fx · 16 substantive blocks · band S
 *
 * Maintains the per-country-per-technology default task list that seeds every new
 * project's checklist. A `TabList` over `Checklist Country And Technologies` picks the
 * scope; a gallery of gates (`Project States` where `Is Visible On Checklist`) expands to
 * that gate's tasks from `Project Default Checklists`.
 *
 * ┌────────────────────────────────────────────────────────────────────────────────┐
 * │ SOURCE DEFECT — THERE IS NO PERMISSION CHECK ON THIS SCREEN. AT ALL.            │
 * │                                                                                │
 * │ `OnVisible` never evaluates `gblCurrentUser` and never calls `DataSourceInfo` / │
 * │ `RecordInfo`. Access to the whole admin area is CLIENT-SIDE HIDING ONLY: the    │
 * │ `"appSettingsKey"` item of the user menu and every item of the named formula    │
 * │ `LeftAdminNavigationMenu` carry the identical                                   │
 * │     ItemVisible: Or(gblCurrentUser.IsApplicationAdministrator,                  │
 * │                     gblCurrentUser.IsControllerOwnData)                         │
 * │ and nothing else. A non-admin who reaches the screen by a deep link or by a     │
 * │ residual `Navigate` gets the full editing UI and the writes succeed.            │
 * │                                                                                │
 * │ WHAT WE DID: every rule below that produces a WRITE takes an explicit `canEdit`  │
 * │ and refuses without it. There is NO admin route guard in the code app yet       │
 * │ (an earlier note here claimed a `RequireAdmin` guard; none exists), and the     │
 * │ admin rail shows to everyone until the role flags load (02-OPEN-DECISIONS D14a). │
 * │ None of this is security. The real fix is a Dataverse privilege on              │
 * │ `vsb_projectdefaultchecklists` (and the other five admin tables) so the SERVER  │
 * │ REJECTS the write. Until that exists, anyone who can call the Web API can edit  │
 * │ this master data.                                                               │
 * └────────────────────────────────────────────────────────────────────────────────┘
 *
 * SERVER-SIDE AUTOMATION ON THIS TABLE (ProjectDocs/migration-plans/04-flow-inventory.md):
 * the flow `SynchroniseProjectTaskList-Add_Update` fires on every add or modify of a
 * `vsb_projectdefaultchecklists` row (Business Unit scope). It copies the task into
 * `vsb_projectchecklists` of every project still working through that gate (same country
 * and technology), copies status only on UPDATE, and on `vsb_todelete = true` deletes the
 * project copies and then the default row itself. So the writes below must stay exactly
 * the canvas's: create-then-update, soft delete only, the scope's Owning Business Unit,
 * and never any client-side copying into project checklists.
 *
 * COUNTRY SCOPING. `gblCurrentUser.EditableCounties` is NEVER READ on this screen. The
 * scope axis is the `Checklist Country And Technologies` table, and row-level security is
 * anchored by `'Owning Business Unit'`, copied from the selected scope row on save
 * (rule 9). `canEditCountry` from @/domain/session is applied here as an ADDITIONAL gate
 * the canvas did not have — see `canEditScope`.
 *
 * WHAT WAS DELETED AS A WORKAROUND
 *  - `txt_…_Name.OnChange`'s `UpdateIf(colPanelInverterFormValidation, …)` (rule 16) — a
 *    copy-paste leftover from a generator/inverter screen. The collection it writes is
 *    never created, read or displayed here.
 *  - `colTasksToReorder`, `locResetOrderingList`, and the PowerDragDrop control's
 *    `RenderZone` / `RenderID` / `RenderName` columns — control plumbing, not data.
 *  - The hidden `but_Admin_Checklist_Form_Buttons_Reset` button, `Select()`ed by Close,
 *    Save and Cancel to `Reset` all five form fields. Its job is `emptyTaskForm()` /
 *    `toTaskForm()` — the screen resets the whole form on every close.
 *
 * KEPT ON PURPOSE (it looked like a workaround, it is not): the create-then-update pair of
 * rule 5. The sync flow's CREATE branch does not copy status, so only the second write
 * carries an Inactive status through to the project checklists.
 */
import { isBlank } from "@/domain/powerFxNumeric";
import { ES_PROCESS, CHOICE_ADMIN } from "@/data/dataverseNames";
import { canEditCountry, type CurrentUser } from "@/domain/session";
import { CREATED_ROW_ID, emptyPlan, refusePlan as refuse, type WritePlan } from "@/data/writePlan";

/* ═══════════════════════════════════════════════════════════════════ columns ════ */

/** `vsb_ProjectDefaultChecklist` logical names. */
export const DEFAULT_CHECKLIST_COL = {
  /**
   * Metadata name — note the DOUBLE plural, `…checklistsid` (entity
   * `vsb_ProjectDefaultChecklists`).
   */
  id: "vsb_projectdefaultchecklistsid",
  name: "vsb_name",
  order: "vsb_order",
  holdingTaskDescription: "vsb_holdingtaskdescription",
  gateRelevance: "vsb_gaterelevance",
  isCompletionDate: "vsb_iscompletiondate",
  /** The SOFT-DELETE flag. The real `Remove(...)` is commented out in the source. */
  toDelete: "vsb_todelete",
  countryTech: "_vsb_associatedcountryandtechnology_value",
  clusterState: "_vsb_clusterstate_value",
  owningBusinessUnit: "_owningbusinessunit_value",
  statecode: "statecode",
  statuscode: "statuscode",
} as const;

/** The `@odata.bind` navigation-property names for the three lookups a save writes. */
export const DEFAULT_CHECKLIST_LOOKUP = {
  countryTech: "vsb_AssociatedCountryAndTechnology",
  clusterState: "vsb_ClusterState",
  owningBusinessUnit: "owningbusinessunit",
} as const;

export const CHECKLIST_COUNTRY_TECH_COL = {
  id: "vsb_checklistcountryandtechnologyid",
  name: "vsb_name",
  order: "vsb_order",
  country: "_vsb_country_value",
  technology: "vsb_technology",
  owningBusinessUnit: "_owningbusinessunit_value",
} as const;

export const PROJECT_STATE_COL = {
  id: "vsb_projectstateid",
  name: "vsb_name",
  order: "vsb_order",
  isVisibleOnChecklist: "vsb_isvisibleonchecklist",
} as const;

export const CHECK_LIST_DEFAULT_APPROVAL_COL = {
  id: "vsb_checklistdefaultapprovalsid",
  projectDefaultChecklist: "_vsb_projectdefaultchecklistid_value",
  /** `vsb_approvalmodecode`, not `vsb_approvalmode` — read out of the solution export. */
  approvalMode: "vsb_approvalmodecode",
} as const;

export const CHECKLIST_ENTITY_SET = ES_PROCESS.projectDefaultChecklists;

/* ═════════════════════════════════════════════════════════════════════ types ════ */

/** One `Checklist Country And Technologies` row — the scope axis. */
export interface ScopeRow {
  id: string;
  name: string;
  /**
   * `vsb_order` is an `nvarchar` column on this table (customizations.xml), so it arrives
   * as text. See `sortScopes` for how it is ordered.
   */
  order: string | number | null;
  countryId: string | null;
  technology: number | null;
  owningBusinessUnitId: string | null;
}

/** One `Project States` row — a gate. */
export interface GateRow {
  id: string;
  name: string;
  order: number;
  isVisibleOnChecklist: boolean;
}

/** One `Project Default Checklists` row. */
export interface TaskRow {
  id: string;
  name: string;
  order: number;
  holdingTaskDescription: string | null;
  gateRelevance: boolean;
  isCompletionDate: boolean;
  toDelete: boolean;
  countryTechId: string | null;
  clusterStateId: string | null;
  /** `statecode` — 0 Active / 1 Inactive. */
  status: number;
}

/** The Add/Edit panel's form state. */
export interface TaskForm {
  description: string;
  holdingDescription: string;
  gateRelevance: boolean;
  isCompletionDate: boolean;
  active: boolean;
}

/**
 * The form a NEW task opens with. `tgl_Active_ChecklistForm.Checked: =If(locSelectedChecklistEntity
 * .Status = 'Status (Project Default Checklists)'.Active, true, false)` is false when nothing is
 * selected, so a new task starts INACTIVE until the admin switches it on — kept as the canvas
 * has it (product decision, 19 Oct 2026).
 */
export const emptyTaskForm = (): TaskForm => ({
  description: "",
  holdingDescription: "",
  gateRelevance: false,
  isCompletionDate: false,
  active: false,
});

export const toTaskForm = (task: TaskRow | null): TaskForm =>
  task === null
    ? emptyTaskForm()
    : {
        description: task.name ?? "",
        holdingDescription: task.holdingTaskDescription ?? "",
        gateRelevance: task.gateRelevance === true,
        isCompletionDate: task.isCompletionDate === true,
        active: task.status === CHOICE_ADMIN.status.active,
      };

export { CREATED_ROW_ID, emptyPlan, type PlannedWrite, type WritePlan } from "@/data/writePlan";

/* ═════════════════════════════════════════════════════════════════ messages ════ */

export const MSG = {
  // GUIDE p17: page title verbatim from the screenshot — lower-case "settings", distinct
  // from the left-rail item label "Check List Settings" (PM_ADMIN_NAV).
  /**
   * NEW — no canvas equivalent: the code app's page title; the canvas screen had no title label
   * of its own
   */
  pageTitle: "Checklist settings",
  /** `lbl_Admin_Checklist_Form_Fields_Name_ErrorMessage.Text` — verbatim. */
  descriptionBlank: "Value cannot be blank.",
  /** The shared tooltip on all four locked row actions. */
  inUse:
    "This Check List item is in use by a Project Gate. Delete the Project Gate to edit "
    + "the Check List item.",
  /** `cmp_DeleteChecklistItem_AdminScreen.Title` — verbatim. */
  deleteTitle: "Delete checklist item?",
  /** The typo `Decativate` is in the source; corrected here, noted in `activationTitle`. */
  /**
   * INTERPOLATED — canvas `cmp_ActivateDeactiveChecklistItem_AdminScreen.Title` builds this
   * from "Activate" + " checklist item?"
   */
  activateTitle: "Activate checklist item?",
  /**
   * SPELLING CORRECTED — canvas `cmp_ActivateDeactiveChecklistItem_AdminScreen.Title` reads
   * "Decativate" (the title is `$"{If(…Active,"Decativate","Activate")} checklist item?"`).
   * Corrected to "Deactivate"; the rest is verbatim — see `activationTitle()`.
   */
  deactivateTitle: "Deactivate checklist item?",
  /**
   * NEW — no canvas equivalent: the selection prompt for the country/technology scope; the
   * canvas showed an empty gate list instead
   */
  noScope: "Pick a country and technology to see its default checklist.",
  /** NEW — no canvas equivalent: empty state for a gate with no default tasks */
  noTasks: "This gate has no default tasks yet.",
  /**
   * NEW — no canvas equivalent: the country-scope gate is added by the code app
   * (`canEditScope`)
   */
  outOfScope:
    "This country is outside your editable country scope, so the checklist is read-only.",
  /**
   * NEW — no canvas equivalent: the code app surfaces a failed save; the canvas swallowed the
   * error behind its spinner
   */
  saveFailed: "The task could not be saved.",
  /** `pcf_but_Admin_Checklist_Form_Buttons_Save.OnChange` — success text, verbatim. */
  saved: "Checklist item was successfully saved.",
  /** `ico_EnablelCompletionDate_….OnChange` — success text, verbatim. */
  completionDateChanged: "Completion Date was successfully changed.",
  /** `pcf_but_Admin_Checklist_Reorder_Buttons_Save.OnChange` — progress text, verbatim. */
  reorderSaving: "New order will be saved, please wait...",
} as const;

/*
 * The canvas's progress / result texts (`locAdminLoadingDialogText`).
 *
 * SOURCE DEFECT: this screen sets `locAdminLoadingDialog` / `locAdminLoadingDialogText` but has
 * NO loading pop-up control, so the canvas never showed any of these texts — a failed save was
 * silent. FIXED: the code app shows them as notifications (decision 19 Oct 2026, D18 in
 * 02-OPEN-DECISIONS). Wording verbatim except where noted.
 */

/** Save progress: `$"Checklist item '{txt_…_Name.Value}' will be saved, please wait..."`. */
export const savingText = (name: string): string =>
  `Checklist item '${name}' will be saved, please wait...`;

/**
 * Save failure: `$"Error: Checklist item could not be saved. Internal error: originated on
 * {FirstError.Source}. Message: {FirstError.Message} {…HttpResponse}"` — the code app passes the
 * `DataError` message as `detail`, since it has no `FirstError.Source`.
 */
export const saveErrorText = (detail: string): string =>
  `Error: Checklist item could not be saved. Internal error: ${detail}`;

/** Completion-date progress: `$"Completion Date for '{ThisItem.Name}' will be changed, please wait..."`. */
export const completionDateChangingText = (name: string): string =>
  `Completion Date for '${name}' will be changed, please wait...`;

/** Completion-date failure — same shape as `saveErrorText`. */
export const completionDateErrorText = (detail: string): string =>
  `Error: Completion Date could not be changed. Internal error: ${detail}`;

/**
 * Delete progress.
 *
 * SOURCE DEFECT, FIXED: the canvas reads `$"Deleteing item '{txt_Admin_Checklist_Form_Fields_Name
 * .Value}', please wait..."` — misspelt ("Deleteing"), and it names the Add/Edit panel's text
 * box, which is empty or stale when deleting from a row. The code app names the row being
 * deleted and spells "Deleting".
 */
export const deletingText = (name: string): string => `Deleting item '${name}', please wait...`;

/**
 * Activate/deactivate progress. SOURCE DEFECT, FIXED: the canvas reuses the save text with the
 * panel's text box (`$"Checklist item '{txt_…_Name.Value}' will be saved, please wait..."`);
 * the code app names the row being changed.
 */
export const activationSavingText = (name: string): string => savingText(name);

/**
 * The confirmation title for activate/deactivate.
 *
 * SOURCE DEFECT (cosmetic): the canvas builds
 * `$"{If(…Active,"Decativate","Activate")} checklist item?"` — *Decativate* is misspelt in
 * `cmp_PopUp_Confirmation.Title`. Spelling corrected; the wording is otherwise verbatim.
 */
export const activationTitle = (currentlyActive: boolean): string =>
  currentlyActive ? MSG.deactivateTitle : MSG.activateTitle;

/**
 * Every other visible caption on the screen, transcribed from the canvas YAML
 * (`Src/Admin Project Default Checklists Screen.pa.yaml`) — verbatim, typos included
 * (CONVENTIONS rule 7).
 */
export const LABELS = {
  /** `pcf_CommandBar_Cluster_DefaultChecklist_AdminScreen.Items` — `ItemKey: "addNewChecklistEntity"`, `ItemDisplayName`. */
  addTask: "Add Task",
  /** `pcf_CommandBar_Cluster_DefaultChecklist_AdminScreen.Items` — `ItemKey: "reorderChecklist"`, `ItemDisplayName`. */
  reorder: "Reorder",
  /** `lbl_Description_TasksInClusterDefaultChecklist_AdminScreen.Text` — verbatim. */
  colDescription: "Description",
  /** `lbl_HoldingDescription_TasksInClusterDefaultChecklist_AdminScreen.Text` — verbatim. */
  colHoldingDescription: "Holding Description",
  /** `lbl_GateRelevance_TasksInClusterDefaultChecklist_AdminScreen.Text` — verbatim. */
  colGateRelevance: "Gate Relevance",
  /** `lbl_CompletionDate_TasksInClusterDefaultChecklist_AdminScreen.Text` — verbatim. */
  colCompletionDate: "Completion Date",
  /** `lbl_IsActive_TasksInClusterDefaultChecklist_AdminScreen.Text` — verbatim. */
  colActive: "Active",
  /** `ico_Edit_TasksInClusterDefaultChecklist_AdminScreen.IconName` — the icon-only action's name. */
  edit: "Edit",
  /** `ico_Delete_TasksInClusterDefaultChecklist_AdminScreen.IconName` — the icon-only action's name. */
  delete: "Delete",
  /** `ico_EnablelCompletionDate_TasksInClusterDefaultChecklist_AdminScreen.Text` — `If(…, "Yes", "No")`. */
  yes: "Yes",
  /** `ico_EnablelCompletionDate_TasksInClusterDefaultChecklist_AdminScreen.Text` — `If(…, "Yes", "No")`. */
  no: "No",
  /** `ico_ActivateDeactivate_….Text: =ThisItem.Status` — the `'Status (Project Default Checklists)'` labels. */
  statusActive: "Active",
  /** `ico_ActivateDeactivate_….Text: =ThisItem.Status` — the `'Status (Project Default Checklists)'` labels. */
  statusInactive: "Inactive",
  /** `lbl_Admin_Checklist_Form_Fields_Name.Text` — verbatim. */
  fieldDescription: "Description",
  /** `lbl_Admin_Checklist_Form_Fields_HoldingDescription.Text` — verbatim. */
  fieldHoldingDescription: "Holding Description",
  /** `tgl_GateRelevance_ChecklistForm.Label` — verbatim (lower-case "relevance"). */
  toggleGateRelevance: "Gate relevance",
  /** `tgl_CompletionDate_ChecklistForm.Label` — verbatim. */
  toggleCompletionDate: "Completion Date",
  /** `tgl_Active_ChecklistForm.Label` — verbatim. */
  toggleActive: "Active",
  /** `lblAdmin_Reorder_Title.Text` — verbatim, INCLUDING the canvas's misspelling "Reoder". */
  reorderTitle: "Reoder checklist",
  /** `TextCanvas1.Text` (the reorder panel's hint) — verbatim. */
  reorderHint: "To reorder drag and drop listed items",
  /** `cmp_DeleteChecklistItem_AdminScreen.ConfirmButtonText` — verbatim. */
  deleteConfirm: "Delete",
  /** `cmp_…_AdminScreen.CancelButtonText` (both confirmations) — verbatim. */
  cancel: "Cancel",
  /** `lblAdmin_ProjectGates_Approvals_Form_Title_1.Text` — `If(IsBlank(locSelected…), "Add Task", "Edit Task")`. */
  panelTitleAdd: "Add Task",
  /** `lblAdmin_ProjectGates_Approvals_Form_Title_1.Text` — the edit branch. */
  panelTitleEdit: "Edit Task",
  /** NEW — no canvas equivalent: keyboard alternative to dragging in the reorder panel. */
  moveUp: "Move up",
  /** NEW — no canvas equivalent: keyboard alternative to dragging in the reorder panel. */
  moveDown: "Move down",
  /** `ico_Down_DefaultChecklist_AdminScreen` (Icon.ChevronDown, no caption) — named for screen readers. */
  expand: "Expand",
  /** `ico_Up_DefaultChecklist_AdminScreen` (Icon.ChevronUp, no caption) — named for screen readers. */
  collapse: "Collapse",
  /** NEW — no canvas equivalent: rule 19 load-error state. */
  loadFailedTitle: "Checklist data is unavailable",
  /** NEW — no canvas equivalent: rule 19 load-error state. */
  loadFailedDescription: "The default checklist could not be loaded. Please try again.",
  /** NEW — no canvas equivalent: rule 19 loading state. */
  loading: "Loading...",
} as const;

/**
 * `lbl_ClusterName_DefaultChecklist_AdminScreen.Text` — the gate header caption. The canvas maps
 * the stored `Project States` name through a `Switch`, so "Draft" reads "Draft to Cluster 1"
 * and "Cluster 6" reads "Criteria After Cluster 6 Entry"; any other name shows as stored.
 */
export const GATE_CAPTION: Readonly<Record<string, string>> = {
  Draft: "Draft to Cluster 1",
  "Cluster 1": "Cluster 1 to Cluster 2",
  "Cluster 2": "Cluster 2 to Cluster 3",
  "Cluster 3": "Cluster 3 to Cluster 4",
  "Cluster 4": "Cluster 4 to Cluster 5",
  "Cluster 5": "Cluster 5 to Cluster 6",
  "Cluster 6": "Criteria After Cluster 6 Entry",
};

export const gateCaption = (name: string): string => GATE_CAPTION[name] ?? name;

/** `cmp_DeleteChecklistItem_AdminScreen.Description` — verbatim, with the task name interpolated. */
export const deleteDescription = (taskName: string): string =>
  `Are you sure that you want to permanently delete task "${taskName}"?`;

/** `cmp_ActivateDeactiveChecklistItem_AdminScreen.Description` — verbatim, task name interpolated. */
export const activationDescription = (taskName: string): string =>
  `Are you sure that you want to change status of task "${taskName}"?`;

/**
 * `cmp_ActivateDeactiveChecklistItem_AdminScreen.ConfirmButtonText` —
 * `If(…Status = Active, "Decativate", "Activate")`.
 *
 * SOURCE DEFECT, FIXED (decision 19 Oct 2026): the canvas misspells "Decativate" here and in the
 * title. Both now read "Deactivate", so the button and the title agree. Original spelling kept in
 * this comment for traceability (rule 7).
 */
export const activationConfirmText = (currentlyActive: boolean): string =>
  currentlyActive ? "Deactivate" : "Activate";

/**
 * `gblAppConstants.DefaultDefMaxLength` (App.pa.yaml) — the cap on both text inputs and the
 * denominator of both counters. It is 256; 100 is `DefaultMiddleMaxLength`, which this screen
 * does not use.
 */
export const DESCRIPTION_MAX_LENGTH = 256;

/** The live counter under each input: `$"{Len(…)}/{gblAppConstants.DefaultDefMaxLength}"`. */
export const charCounter = (value: string, max = DESCRIPTION_MAX_LENGTH): string =>
  `${value.length}/${max}`;

/* ═══════════════════════════════════════════════════════════════ scope + gates ════ */

/**
 * Rule 1 — the default scope on entry.
 *
 * SOURCE DEFECT: the canvas sets
 * `locSelectedCountryAndTechnology: First(SortByColumns('Checklist Country And
 * Technologies', "vsb_name"))` — the first scope BY NAME — while
 * `tab_Admin_Project_Checklist_Association.Items` sorts the tab strip BY `Order`. The
 * pre-selected scope is therefore not necessarily the tab that looks selected.
 *
 * FIXED, deliberately (implementation step 7): the first tab by `Order` is selected, so
 * the highlighted tab and the loaded scope always agree. `defaultScopeCanvasParity` keeps
 * the original behaviour reachable for a side-by-side comparison.
 */
export function defaultScope(scopes: ScopeRow[]): ScopeRow | null {
  return sortScopes(scopes)[0] ?? null;
}

/** The canvas behaviour of rule 1, kept for parity testing only. Not wired to the UI. */
export function defaultScopeCanvasParity(scopes: ScopeRow[]): ScopeRow | null {
  return [...scopes].sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""))[0] ?? null;
}

/**
 * `tab_…_Association.Items` — `Sort(…, Order, SortOrder.Ascending)`.
 *
 * SOURCE DEFECT, FIXED (decision 19 Oct 2026): `vsb_order` is a TEXT column here, so the canvas
 * sorts it as text and "10" comes before "2". The code app compares numerically when the value
 * is a number (`localeCompare` with `numeric: true`), so "10" follows "9"; a blank order sorts
 * last. `sortScopesCanvasParity` keeps the text sort for comparison.
 */
export const sortScopes = (scopes: ScopeRow[]): ScopeRow[] =>
  [...scopes].sort((a, b) => compareOrder(a.order, b.order));

const compareOrder = (a: ScopeRow["order"], b: ScopeRow["order"]): number => {
  const sa = a === null || a === undefined ? "" : String(a).trim();
  const sb = b === null || b === undefined ? "" : String(b).trim();
  if (sa === "" || sb === "") return sa === sb ? 0 : sa === "" ? 1 : -1;
  return sa.localeCompare(sb, undefined, { numeric: true });
};

/** The canvas text sort of rule 1's tab strip, kept for parity testing only. */
export const sortScopesCanvasParity = (scopes: ScopeRow[]): ScopeRow[] =>
  [...scopes].sort((a, b) => {
    const sa = String(a.order ?? ""), sb = String(b.order ?? "");
    return sa < sb ? -1 : sa > sb ? 1 : 0;
  });

/**
 * Rule 2 — `ClearCollect(colChecklistClusters, AddColumns(SortByColumns(
 *   Filter('Project States', 'Is Visible On Checklist'), "vsb_order", Ascending),
 *   IsFolded, true))`.
 *
 * Only gates flagged for the checklist appear, ascending by `vsb_order`, all initially
 * folded. `IsFolded` was a column patched onto every row; here the fold state is a
 * `Set<string>` in the component, so it is not part of the data at all.
 */
export const checklistGates = (states: GateRow[]): GateRow[] =>
  states
    .filter((s) => s.isVisibleOnChecklist === true)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

/**
 * Rule 3's client-side half.
 *
 * The FILTER itself is server-side (`hooks.ts` puts both lookup ids and
 * `vsb_todelete ne true` into `$filter`, `vsb_order` into `$orderby`) — never materialise
 * the table to filter it. This function only re-applies the predicate so the unit tests
 * can assert it, and so a stale cache entry cannot show a soft-deleted row.
 */
export function visibleTasks(
  tasks: TaskRow[],
  scopeId: string | null,
  gateId: string | null,
): TaskRow[] {
  return tasks
    .filter((t) =>
      t.toDelete !== true
      && (scopeId === null || t.countryTechId === scopeId)
      && (gateId === null || t.clusterStateId === gateId))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

/* ═══════════════════════════════════════════════════════════════ the in-use lock ════ */

/**
 * The lock behind all four row actions.
 *
 * The canvas re-ran, per row and PER PROPERTY (four properties × N rows):
 *   `LookUp('Check List Default Approvals',
 *          'Project Default Check List'.'Project Default Checklist' = GUID(ThisItem.…)
 *          && 'Approval Mode' <> [@'Approval Mode'].'Only Notifications')`
 * Here `hooks.ts` issues ONE query per gate and hands the resulting id set in.
 *
 * `Only Notifications` approvals do NOT lock the row — that is the `<>` in the formula.
 */
export const isTaskLocked = (taskId: string, blockingIds: ReadonlySet<string>): boolean =>
  blockingIds.has(taskId);

/**
 * Builds the blocking set from `Check List Default Approvals` rows.
 * An approval locks its checklist item unless its mode is `Only Notifications`.
 *
 * A BLANK mode locks too: Power Fx `Blank() <> X` is true. When this is connected, the OData
 * filter must not drop null modes (`vsb_approvalmodecode ne X` excludes nulls in Dataverse),
 * so `hooks.ts` filters by the gate's task ids only and leaves the mode test to this function.
 */
export function blockingChecklistIds(
  approvals: { projectDefaultChecklistId: string | null; approvalMode: number | null }[],
  onlyNotificationsValue: number,
): Set<string> {
  const out = new Set<string>();
  for (const a of approvals) {
    if (!a.projectDefaultChecklistId) continue;
    if (a.approvalMode === onlyNotificationsValue) continue;
    out.add(a.projectDefaultChecklistId);
  }
  return out;
}

/**
 * Whether the signed-in admin may edit this scope's master data.
 *
 * NEW — the canvas has nothing like it. `canEditCountry` is applied to the scope row's
 * country so a Controller Own Data user cannot silently rewrite another country's
 * defaults. An Application Administrator or a Project Data All Countries holder passes
 * everywhere. Still not security (see the header block) — it is the client half of a
 * check the server must also make.
 */
export function canEditScope(user: CurrentUser | null, scope: ScopeRow | null): boolean {
  if (!user) return false;
  if (!scope) return false;
  return canEditCountry(user, scope.countryId ?? undefined);
}

/* ═══════════════════════════════════════════════════════════════════ validation ════ */

/**
 * The whole save gate. `lbl_…_Name_ErrorMessage.Visible = IsBlank(Trim(txt_….Value))`
 * and `Save.DisplayMode = If(that.Visible, Disabled, Edit)`. There is no other validator
 * on this panel — no length check beyond `MaxLength`, no duplicate-description check.
 */
export const isSaveEnabled = (form: TaskForm): boolean => !isBlank(form.description.trim());

export const saveErrors = (form: TaskForm): string[] =>
  isSaveEnabled(form) ? [] : [MSG.descriptionBlank];

/** Rule 15 — `If(IsBlank(locSelectedChecklistEntity), "Add Task", "Edit Task")`. */
export const panelTitle = (selected: TaskRow | null): string =>
  selected === null ? LABELS.panelTitleAdd : LABELS.panelTitleEdit;

/**
 * Rule 14 — the grid truncates a long holding description at 110 characters:
 * `If(Len(x) > 110, $"{Left(x, 110)} ...", x)`. Note the SPACE before the ellipsis.
 */
export const HOLDING_TRUNCATE_AT = 110;

export function truncateHolding(text: string | null | undefined, at = HOLDING_TRUNCATE_AT): string {
  const v = text ?? "";
  return v.length > at ? `${v.slice(0, at)} ...` : v;
}

/* ═════════════════════════════════════════════════════════════════════ ordering ════ */

/**
 * Rule 4 — a new task's `Order` is "count of existing tasks in this scope + 1".
 *
 * SOURCE DEFECT: the canvas captures that count into `locTotalRows` when the ADD BUTTON
 * IS PRESSED, not at save time, and its `CountRows(...)` does not exclude soft-deleted
 * rows even though the gallery does. Two admins adding concurrently both compute the same
 * order and collide; one add after a delete reuses an order.
 *
 * MITIGATED: `hooks.ts` calls this with a count read at SAVE time (`$orderby=vsb_order
 * desc&$top=1`), not at add-click. That closes the window but does not eliminate it —
 * the real fix is a Dataverse custom API that allocates the order server-side, which is
 * documented in the migration notes and not built here.
 */
export const nextOrder = (existingCount: number): number => Math.max(0, existingCount) + 1;

/** The server-side variant: one row back, ordered descending. */
export const nextOrderFromHighest = (highestOrder: number | null | undefined): number =>
  (typeof highestOrder === "number" ? highestOrder : 0) + 1;

/**
 * Rule 10's compaction — every later sibling's `Order` drops by one.
 *
 * `Filter(<same scope, same gate>, Order > locSelectedChecklistEntity.Order)` then
 * `ForAll(…, Patch(…, {Order: ThisRecord.Order - 1}))`. Rows at or before the deleted
 * order are untouched.
 *
 * SOURCE DEFECT, FIXED (decision 19 Oct 2026): the canvas's sibling filter does not exclude
 * rows already marked `To Delete`, so it renumbers rows the sync flow is about to delete.
 * The code app skips them, as it does in the reorder list.
 */
export function compactOrdersAfterDelete(
  tasks: TaskRow[],
  deletedOrder: number,
): { id: string; order: number }[] {
  return tasks
    .filter((t) => t.toDelete !== true && (t.order ?? 0) > deletedOrder)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((t) => ({ id: t.id, order: (t.order ?? 0) - 1 }));
}

/**
 * Rule 13 — the reorder panel writes positions straight from the drag list:
 * `ForAll(pcf_….CurrentItems As RecordItem, UpdateIf(…, {Order: RecordItem.Position}))`.
 *
 * `orderedIds` is the dropped sequence; positions are 1-based. Rows whose order is already
 * correct produce no write, so a drag that changes nothing sends an empty batch.
 */
export function reorderPositions(
  tasks: TaskRow[],
  orderedIds: string[],
): { id: string; order: number }[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const out: { id: string; order: number }[] = [];
  orderedIds.forEach((id, index) => {
    const position = index + 1;
    const current = byId.get(id);
    if (current && current.order === position) return;
    out.push({ id, order: position });
  });
  return out;
}

/* ═══════════════════════════════════════════════════════════════ status handling ════ */

/**
 * Rule 7 — the panel writes `Status` AND `Status Reason` as a pair from one toggle:
 *   Status:        If(tgl.Checked, 'Status (…)'.Active, …Inactive)
 *   'Status Reason': If(tgl.Checked, 'Status Reason (…)'.Active, …Inactive)
 */
export function toStatusPair(active: boolean): { statecode: number; statuscode: number } {
  return active
    ? { statecode: CHOICE_ADMIN.status.active, statuscode: CHOICE_ADMIN.statusReason.active }
    : { statecode: CHOICE_ADMIN.status.inactive, statuscode: CHOICE_ADMIN.statusReason.inactive };
}

/**
 * Rule 11 — the ROW toggle flips `Status` only, never `Status Reason`.
 *
 * SOURCE DEFECT: rules 7 and 11 disagree. A task deactivated from the row action keeps an
 * Active `Status Reason`; the same task deactivated from the panel does not. Reporting
 * that filters on `statuscode` sees two different answers for the same intent.
 *
 * FIXED: both paths now go through `toStatusPair`, so `Status` and `Status Reason` can no
 * longer drift. `toggleActiveCanvasParity` keeps the one-column behaviour reachable and
 * is what the parity test asserts.
 */
export function toggleActivePatch(current: TaskRow): Record<string, unknown> {
  const nowActive = current.status !== CHOICE_ADMIN.status.active;
  const pair = toStatusPair(nowActive);
  return {
    [DEFAULT_CHECKLIST_COL.statecode]: pair.statecode,
    [DEFAULT_CHECKLIST_COL.statuscode]: pair.statuscode,
  };
}

/** The canvas behaviour of rule 11, kept for parity testing. Not wired to the UI. */
export function toggleActiveCanvasParity(current: TaskRow): Record<string, unknown> {
  return {
    [DEFAULT_CHECKLIST_COL.statecode]:
      current.status === CHOICE_ADMIN.status.active
        ? CHOICE_ADMIN.status.inactive
        : CHOICE_ADMIN.status.active,
  };
}

/**
 * Rule 12 — the calendar icon writes the negation directly:
 * `Patch(…, {'Is Completion Date': Not(ThisItem.'Is Completion Date')})` and then
 * `Refresh('Project Default Approvals')` — a DIFFERENT table. That refresh is why
 * `hooks.ts` invalidates the approvals query as well as the task query.
 */
export const toggleCompletionDatePatch = (current: TaskRow): Record<string, unknown> => ({
  [DEFAULT_CHECKLIST_COL.isCompletionDate]: current.isCompletionDate !== true,
});

/* ═════════════════════════════════════════════════════════════════════ the save ════ */

export interface SaveContext {
  scope: ScopeRow;
  /** The gate whose command bar was used — rule 8's `locSelectedCluster`. */
  gate: GateRow;
  /** `null` for an add. */
  existing: TaskRow | null;
  /** Rule 4's order source. Ignored when editing. */
  nextOrderValue: number;
  canEdit: boolean;
}


const ownerBind = (ctx: SaveContext): Record<string, unknown> =>
  ctx.scope.owningBusinessUnitId
    ? { [`${DEFAULT_CHECKLIST_LOOKUP.owningBusinessUnit}@odata.bind`]: `/businessunits(${ctx.scope.owningBusinessUnitId})` }
    : {};

/**
 * Rule 5, first `Patch` (`pcf_but_Admin_Checklist_Form_Buttons_Save.OnChange`, create branch):
 * Name, Order, Associated Country And Technology, Holding Task Description, Cluster State,
 * Gate Relevance, Is Completion Date, Owning Business Unit. NO status — the row is created
 * with Dataverse's default (Active).
 *
 * Rule 4 — the order is only ever written here.
 * Rule 8 — the gate comes from the command bar that opened the panel; an existing task's gate is
 *          never rewritten, so a task can never move between gates.
 */
export function buildCreatePayload(form: TaskForm, ctx: SaveContext): Record<string, unknown> {
  return {
    [DEFAULT_CHECKLIST_COL.name]: form.description.trim(),
    [DEFAULT_CHECKLIST_COL.order]: ctx.nextOrderValue,
    [`${DEFAULT_CHECKLIST_LOOKUP.countryTech}@odata.bind`]:
      `/vsb_checklistcountryandtechnologies(${ctx.scope.id})`,
    [DEFAULT_CHECKLIST_COL.holdingTaskDescription]: form.holdingDescription.trim(),
    [`${DEFAULT_CHECKLIST_LOOKUP.clusterState}@odata.bind`]: `/vsb_projectstates(${ctx.gate.id})`,
    [DEFAULT_CHECKLIST_COL.gateRelevance]: form.gateRelevance === true,
    [DEFAULT_CHECKLIST_COL.isCompletionDate]: form.isCompletionDate === true,
    ...ownerBind(ctx),
  };
}

/**
 * Rule 5, second `Patch` — the one EVERY save sends (the only one an edit sends): Name, Holding
 * Task Description, Gate Relevance, Is Completion Date, Status, Status Reason, Owning Business
 * Unit.
 *
 * Rule 6 — Name and Holding Task Description are `Trim`med on write.
 * Rule 7 — the Active toggle writes both status columns (see `toStatusPair`).
 * Rule 9 — `'Owning Business Unit'` is copied from the selected scope row, on both writes,
 *          exactly as the canvas does. It is the row-level security anchor AND the scope the
 *          sync flow's trigger runs in, so it must not differ from the canvas value.
 */
export function buildTaskPayload(form: TaskForm, ctx: SaveContext): Record<string, unknown> {
  const status = toStatusPair(form.active);
  return {
    [DEFAULT_CHECKLIST_COL.name]: form.description.trim(),
    [DEFAULT_CHECKLIST_COL.holdingTaskDescription]: form.holdingDescription.trim(),
    [DEFAULT_CHECKLIST_COL.gateRelevance]: form.gateRelevance === true,
    [DEFAULT_CHECKLIST_COL.isCompletionDate]: form.isCompletionDate === true,
    [DEFAULT_CHECKLIST_COL.statecode]: status.statecode,
    [DEFAULT_CHECKLIST_COL.statuscode]: status.statuscode,
    ...ownerBind(ctx),
  };
}

/**
 * The save as a plan, so the permission refusal is testable without a transport.
 *
 * A NEW task is TWO writes, in this order, exactly as the canvas: create (no status), then update
 * of that same row (`id: CREATED_ROW_ID`) with the status. The sync flow copies status into the
 * project checklists only from an UPDATE, so collapsing the pair would leave every project with
 * an Active copy of a task created Inactive.
 */
export function planSaveTask(form: TaskForm, ctx: SaveContext): WritePlan {
  if (!ctx.canEdit) return refuse(MSG.outOfScope);
  if (!isSaveEnabled(form)) return refuse(MSG.descriptionBlank);

  const data = buildTaskPayload(form, ctx);
  const plan = emptyPlan();
  if (ctx.existing === null) {
    plan.writes.push({
      op: "create", entitySet: CHECKLIST_ENTITY_SET, data: buildCreatePayload(form, ctx),
      reason: `Default task “${form.description.trim()}” added to ${ctx.gate.name}`,
    });
    plan.writes.push({
      op: "update", entitySet: CHECKLIST_ENTITY_SET, id: CREATED_ROW_ID, data,
      reason: `Status of “${form.description.trim()}” set (reaches the project checklists via the sync flow)`,
    });
    plan.log.push(`Added “${form.description.trim()}” at position ${ctx.nextOrderValue}.`);
  } else {
    plan.writes.push({
      op: "update", entitySet: CHECKLIST_ENTITY_SET, id: ctx.existing.id, data,
      reason: `Default task “${form.description.trim()}” updated`,
    });
    plan.log.push(`Updated “${form.description.trim()}”.`);
  }
  return plan;
}

/* ══════════════════════════════════════════════════════════════════ the delete ════ */

/**
 * Rule 10 — delete is a SOFT delete plus a compaction, issued as ONE batch.
 *
 * `cmp_DeleteChecklistItem_AdminScreen.OnConfirm` patches `{'To Delete': true}` (the real
 * `Remove(...)` sits commented out immediately below it) and then walks every later
 * sibling decrementing `Order`. The soft-delete flag is what the grid filter reads, so the
 * semantics are preserved exactly — only the N round-trips are gone.
 */
export function planDeleteTask(args: {
  target: TaskRow;
  siblings: TaskRow[];
  locked: boolean;
  canEdit: boolean;
}): WritePlan {
  if (!args.canEdit) return refuse(MSG.outOfScope);
  if (args.locked) return refuse(MSG.inUse);

  const plan = emptyPlan();
  plan.writes.push({
    op: "update", entitySet: CHECKLIST_ENTITY_SET, id: args.target.id,
    data: { [DEFAULT_CHECKLIST_COL.toDelete]: true },
    reason: `“${args.target.name}” marked deleted`,
  });
  for (const move of compactOrdersAfterDelete(args.siblings, args.target.order ?? 0)) {
    plan.writes.push({
      op: "update", entitySet: CHECKLIST_ENTITY_SET, id: move.id,
      data: { [DEFAULT_CHECKLIST_COL.order]: move.order },
      reason: `Order compacted to ${move.order}`,
    });
  }
  plan.log.push(`Deleted “${args.target.name}” and compacted ${plan.writes.length - 1} row(s).`);
  return plan;
}

/** Rule 13's reorder as one batch. */
export function planReorderTasks(args: {
  tasks: TaskRow[];
  orderedIds: string[];
  canEdit: boolean;
}): WritePlan {
  if (!args.canEdit) return refuse(MSG.outOfScope);
  const plan = emptyPlan();
  for (const move of reorderPositions(args.tasks, args.orderedIds)) {
    plan.writes.push({
      op: "update", entitySet: CHECKLIST_ENTITY_SET, id: move.id,
      data: { [DEFAULT_CHECKLIST_COL.order]: move.order },
      reason: `Moved to position ${move.order}`,
    });
  }
  if (plan.writes.length) plan.log.push(`Reordered ${plan.writes.length} task(s).`);
  return plan;
}
