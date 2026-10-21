/**
 * Admin Project Gates Approvals Screen — every business rule as a pure function
 * (redeveloped and connected 19 Oct 2026, D22).
 *
 * Canvas screen: `Admin Project Gates Approvals Screen` (PM app),
 * `ProjectDocs/_extracted/msapp/projectmanagement/Src/Admin Project Gates Approvals Screen.pa.yaml`.
 *
 * Configures the DEFAULT approvers of each project gate (`Project Default Approvals`) and of each
 * check-list item (`Check List Default Approvals`), for one country × technology at a time. The
 * gate gallery renders EVERY gate, whether or not a row exists, and each gate expands into its
 * check-list approvals. One right panel edits either kind of record.
 *
 * This screen only writes the default rows. It starts no approval flow and sends no mail: the
 * request flows (`PerformCommonRequestofGateApproval`, `…CheckListApproval`,
 * `ComposeChecklistItems`, `RequestApproverApprovals`) READ these rows later, from the PM
 * Checklist screen. That is why the persona JSON shape below must stay exactly the canvas's.
 *
 * PERMISSION: the canvas has no check on this screen beyond the admin navigation
 * (`Or(gblCurrentUser.IsApplicationAdministrator, gblCurrentUser.IsControllerOwnData)`). Every
 * write plan here takes `canEdit` = that same rule (`useAdminAccess()`); Dataverse decides the
 * rest (a 403 surfaces through `usePlanWrite`). No country-scope rule is added (brief rule 8).
 *
 * The picker can only produce Wind and PV (`cmp_NestedCountryPickerColumn.Nestings` is a literal),
 * so the BESS / Hydrogen / Substation arms of the canvas `Switch`es are unreachable from the UI.
 *
 * DIVERGENCES KEPT (D22):
 *  - Edit / Add Task do not create a row the moment they are clicked (the canvas `Patch`es a
 *    blank row and leaves an orphan on Cancel). The row is created on Save. As a consequence
 *    Reset Gate is disabled until the gate has a row.
 *  - The canvas silently resets a non-Wind/PV gate row when Edit is clicked. Not ported: a banner
 *    says so instead (`nonWindPvBanner`). Unreachable from the picker anyway.
 *  - `col_CollapsedApprovalGates` (a collection of records used as a set) is a `Set` of gate ids.
 */
import { isBlank } from "@/domain/powerFxNumeric";
import { ES, ES_PROCESS, CHOICE_PROCESS, CHOICE_ADMIN } from "@/data/dataverseNames";
import { and, contains, eq, or } from "@/data/odata";
import { emptyPlan, refusePlan as refuse, type WritePlan } from "@/data/writePlan";

/* ══════════════════════════════════════════════ the shared country/technology axis ════ */

/**
 * The hard-coded picker table, verbatim from `col_cmpCountryPickerItems` (`OnVisible`):
 * `Order, Switch(Name, "Germany",1, "Croatia",6, "France",2, "Greece",8, "Finland",5, "Spain",7,
 * "Italy",4, "Poland",3, "Romania",9)`, then `Sort(…, ThisRecord.Order)`.
 */
export const COUNTRY_PICKER_ORDER: Record<string, number> = {
  Germany: 1, France: 2, Poland: 3, Italy: 4, Finland: 5, Croatia: 6,
  Spain: 7, Greece: 8, Romania: 9,
};

/**
 * `cmp_Admin_ProjectGates_NestedCountryTechnologyPicker.Countries` —
 * `Filter(col_cmpCountryPickerItems, !(Name in ["Spain","Greece","Romania"]))`. The Gates screen
 * excludes the same three countries as Admin Cost and Admin Contract (the earlier comment that
 * Gates passed the unfiltered list was wrong).
 */
export const PICKER_EXCLUDED_COUNTRIES: readonly string[] = ["Spain", "Greece", "Romania"];

/** The same list under the name Admin Cost and Admin Contract import. */
export const COST_CONTRACT_EXCLUDED_COUNTRIES = PICKER_EXCLUDED_COUNTRIES;

/**
 * The technology nesting. Every country's `Childs` is this two-row literal, so a BESS or Hydro
 * approval can never be authored from the UI even though the save switches support one.
 */
export const PICKER_TECHNOLOGIES: readonly string[] = ["Wind", "PV"];

export interface CountryRef { id: string; name: string }
export interface PickerCountry extends CountryRef { order: number; technologies: readonly string[] }

/**
 * Builds the picker items, minus `exclude`, in the canvas `Order`. Unknown countries go last.
 * `technologies` is the screen's own `Nestings` literal when it overrides the default (Admin
 * Contract nests Wind, PV and BESS).
 */
export function buildCountryPicker(
  countries: CountryRef[],
  opts: { exclude?: readonly string[]; technologies?: readonly string[] } = {},
): PickerCountry[] {
  const exclude = opts.exclude ?? [];
  const technologies = opts.technologies ?? PICKER_TECHNOLOGIES;
  return countries
    .filter((c) => !exclude.includes(c.name))
    .map((c) => ({
      ...c,
      order: COUNTRY_PICKER_ORDER[c.name] ?? 99,
      technologies,
    }))
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

/** One scope selection: a country row plus one of its two technologies. */
export interface Scope {
  country: CountryRef | null;
  /** The picker's `SelectedNestedValue` — the literal string `"Wind"` or `"PV"`. */
  technology: string | null;
}

/**
 * The Cluster save resolves the technology by LABEL MATCH,
 * `LookUp(Choices(Technology) As C, Text(C.Value) = …SelectedNestedValue).Value`; the Edit
 * handler uses an explicit `Switch` spelling the fourth arm `"Hydrogen"`. Both are accepted.
 */
const TECHNOLOGY_BY_LABEL: Record<string, number> = {
  wind: CHOICE_ADMIN.technology.wind,
  pv: CHOICE_ADMIN.technology.pv,
  hybrid: CHOICE_ADMIN.technology.hybrid,
  bess: CHOICE_ADMIN.technology.bess,
  hydrogen: CHOICE_ADMIN.technology.hydrogen,
  hydro: CHOICE_ADMIN.technology.hydro,
  substation: CHOICE_ADMIN.technology.substation,
};

/** Case-insensitive, blank-tolerant. Blank nested value → blank technology, as the canvas. */
export function technologyValue(label: string | null | undefined): number | null {
  if (isBlank(label)) return null;
  return TECHNOLOGY_BY_LABEL[String(label).trim().toLowerCase()] ?? null;
}

export function technologyLabel(value: number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const hit = Object.entries(TECHNOLOGY_BY_LABEL).find(([, v]) => v === value);
  if (!hit) return null;
  return hit[0] === "pv" ? "PV" : hit[0][0]!.toUpperCase() + hit[0].slice(1);
}

/** The `Formal Approval` path is only offered for Wind and PV. */
export const isWindOrPv = (technology: string | null | undefined): boolean =>
  technology === "Wind" || technology === "PV";

/**
 * The picker items as `cmp_NestedCountryPickerColumn` takes them — `Countries` (key = the
 * country id) and `Nestings` (`{Country: Name, Childs: [{Order, Value}]}`).
 */
export function toNestedPicker(items: readonly PickerCountry[]): {
  countries: { key: string; name: string }[];
  nestings: { country: string; childs: { order: number; value: string }[] }[];
} {
  return {
    countries: items.map((c) => ({ key: c.id, name: c.name })),
    nestings: items.map((c) => ({
      country: c.name,
      childs: c.technologies.map((value, i) => ({ order: i + 1, value })),
    })),
  };
}

/* ══════════════════════════════════════════════════ the middle country rail ════ */

/**
 * The rail: a "+"/"-" expander per country revealing "Wind" and "PV". A technology child keys on
 * `countryId::technology`; the country row keys on the plain country id (clicking it only expands).
 */
export const countryRailKey = (countryId: string): string => countryId;
export const techRailKey = (countryId: string, technology: string): string =>
  `${countryId}::${technology}`;

export function parseTechRailKey(key: string): { countryId: string; technology: string } | null {
  const i = key.indexOf("::");
  if (i === -1) return null;
  return { countryId: key.slice(0, i), technology: key.slice(i + 2) };
}

export interface RailChild { key: string; label: string }
export interface RailNode { key: string; label: string; children: RailChild[] }

/** The rail's items — the canvas `Countries` input, Spain / Greece / Romania excluded. */
export function buildGateCountryRailItems(countries: CountryRef[]): RailNode[] {
  return buildCountryPicker(countries, { exclude: PICKER_EXCLUDED_COUNTRIES }).map((c) => ({
    key: countryRailKey(c.id),
    label: c.name,
    children: PICKER_TECHNOLOGIES.map((t) => ({ key: techRailKey(c.id, t), label: t })),
  }));
}

/* ═══════════════════════════════════════════════════════════ the persona JSON ════ */

/**
 * The three people lists are stored as JSON TEXT, not relationships:
 *   `JSON(ShowColumns(pcf_….SelectedPeople, PersonaKey, PersonaName, PersonaRole))`
 * `PersonaRole` carries the E-MAIL, not a role, and `PersonaKey` the Entra object id
 * (`'A unique identifer for Microsoft Entra ID'` = `aadusers.id`). The approval flows read this
 * shape, so it is kept exactly.
 */
export interface Persona {
  /** `PersonaKey` — the Entra object id (`aadusers.id`, which equals `aaduserid`). */
  id: string;
  /** `PersonaName` — the display name. */
  displayName: string;
  /** `PersonaRole` — the e-mail. */
  mail: string;
}

interface RawPersona { PersonaKey?: unknown; PersonaName?: unknown; PersonaRole?: unknown }

const text = (v: unknown): string => (typeof v === "string" ? v : v === null || v === undefined ? "" : String(v));

/** Tolerates `null`, `""` and malformed JSON by returning `[]` — never throws. */
export function parsePersonaList(json: string | null | undefined): Persona[] {
  if (isBlank(json)) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(String(json));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((r): r is RawPersona => typeof r === "object" && r !== null)
    .map((r) => ({
      id: text(r.PersonaKey),
      displayName: text(r.PersonaName),
      mail: text(r.PersonaRole),
    }))
    .filter((p) => p.id !== "");
}

/** The exact `{PersonaKey, PersonaName, PersonaRole}` triple the canvas writes. */
export function serialisePersonaList(people: Persona[]): string {
  return JSON.stringify(
    people.map((p) => ({
      PersonaKey: p.id,
      PersonaName: p.displayName,
      PersonaRole: p.mail,
    })),
  );
}

/** "Display Name (email)" — the suggestion caption in the people pickers. */
export const formatPersona = (p: Persona): string => `${p.displayName} (${p.mail})`;

/* ══════════════════════════════════════════════════════════ the table cells ════ */

/** The canvas `"-"` for an empty person cell (`Coalesce(…, "-")`). */
export const PERSON_UNSET = "-";

export interface CellText {
  text: string;
  /** The cell `Tooltip`; `undefined` where the canvas tooltip is `Blank()`. */
  tooltip?: string;
}

const personBlock = (p: Persona): string => `${p.displayName}\n(${p.mail})`;

/**
 * A Contributors / Approvers / Notifications cell (`lbl_…_ControllingApprovals.Text` and its
 * siblings, gate and check-list rows alike):
 *   `Coalesce(If(CountRows(c) < 4, Concat(c, $"{DisplayName}{Char(10)}({Mail})", Char(10)&Char(10)),
 *            If(CountRows(c) > 0, $"{CountRows(c)} Contributors")), "-")`
 * The `Tooltip` lists everyone; its separator differs per cell (`tooltipSeparator`).
 */
export function personListCell(
  people: Persona[],
  noun: "Contributors" | "Approvers" | "Notifications",
  opts: { tooltipSeparator?: string } = {},
): CellText {
  const n = people.length;
  const shown = n < 4 ? people.map(personBlock).join("\n\n") : `${n} ${noun}`;
  return {
    text: shown === "" ? PERSON_UNSET : shown,
    tooltip: n === 0 ? undefined : people.map(personBlock).join(opts.tooltipSeparator ?? "\n\n"),
  };
}

/**
 * The CHECK-LIST row's Notifications cell
 * (`lbl_…_ChecklistDefaultApproval_Item_Notifications.Text`): the list is shown when
 * `(CountRows(C) < 4 && CountRows(A) < 4 && CountRows(N) < 4) || CountRows(N) = 1`, joined with
 * `";" & Char(10) & Char(10)`; otherwise "{n} Notifications". The tooltip uses `Char(10)&Char(10)`.
 */
export function checklistNotificationsCell(
  contributors: Persona[], approvers: Persona[], notifications: Persona[],
): CellText {
  const n = notifications.length;
  const list = (contributors.length < 4 && approvers.length < 4 && n < 4) || n === 1;
  const shown = list
    ? notifications.map(personBlock).join(";\n\n")
    : n > 0 ? `${n} Notifications` : "";
  return {
    text: shown === "" ? PERSON_UNSET : shown,
    tooltip: n === 0 ? undefined : notifications.map(personBlock).join("\n\n"),
  };
}

/**
 * The GATE row's Portfolio Manager cell
 * (`btn_Admin_ProjectGates_DefaultClusterApproval_Item_PortfolioManager`):
 * `Coalesce('Portfolio Manager'.'Display Name', "-")`, tooltip `$"{Self.Text}, ({Mail})"`.
 */
export function gatePortfolioManagerCell(pm: Persona | null): CellText {
  const shown = isBlank(pm?.displayName) ? PERSON_UNSET : pm!.displayName;
  return { text: shown, tooltip: `${shown}, (${pm?.mail ?? ""})` };
}

/**
 * The CHECK-LIST row's Portfolio Manager cell: `If(!IsBlank(PM), $"{Display Name}{Char(13)}{Mail}",
 * "-")`, tooltip `$"{Self.Text}, ({Mail})"`. `Char(13)` renders as a line break.
 */
export function checklistPortfolioManagerCell(pm: Persona | null): CellText {
  const shown = pm ? `${pm.displayName}\n${pm.mail}` : PERSON_UNSET;
  return { text: shown, tooltip: `${shown}, (${pm?.mail ?? ""})` };
}

/* ═══════════════════════════════════════════════════════════════════ columns ════ */

/** `Project Default Approvals` (`vsb_projectdefaultapprovals`) — from the generated model. */
export const GATE_APPROVAL_COL = {
  id: "vsb_projectdefaultapprovalsid",
  name: "vsb_name",
  approvalMode: "vsb_approvalmodecode",
  /** `'Gate active'` on the GATE table. */
  gateActive: "vsb_gateactive",
  clusterState: "_vsb_clusterstate_value",
  country: "_vsb_approvalscountry_value",
  technology: "vsb_technologycode",
  /** `'Portfolio Manager'` — logical `vsb_approvalparticipant1`, a lookup to `aadusers`. */
  portfolioManager: "_vsb_approvalparticipant1_value",
  /** The GATE table calls the approver list `Default Approvals` … */
  defaultApprovals: "vsb_defaultapprovals",
  defaultContributors: "vsb_defaultcontributors",
  defaultNotifications: "vsb_defaultnotifications",
} as const;

/** `Check List Default Approvals` (`vsb_checklistdefaultapprovals`) — from the generated model. */
export const CHECKLIST_APPROVAL_COL = {
  id: "vsb_checklistdefaultapprovalsid",
  name: "vsb_name",
  approvalMode: "vsb_approvalmodecode",
  /** `'Gate active'` on the CHECK-LIST table is a different column: `vsb_gateisactive`. */
  gateActive: "vsb_gateisactive",
  projectDefaultChecklist: "_vsb_projectdefaultchecklistid_value",
  /** `'Portfolio Manager'` — logical `vsb_portfoliomanagerid`, a lookup to `aadusers`. */
  portfolioManager: "_vsb_portfoliomanagerid_value",
  /** … while the CHECK-LIST table calls the same concept `Default Approvers`. */
  defaultApprovers: "vsb_defaultapprovers",
  defaultContributors: "vsb_defaultcontributors",
  defaultNotifications: "vsb_defaultnotifications",
} as const;

/** Write-side navigation properties (`<Nav>@odata.bind`), cased as the generated models. */
export const GATE_NAV = {
  clusterState: "vsb_ClusterState",
  country: "vsb_ApprovalsCountry",
  portfolioManager: "vsb_Approvalparticipant1",
} as const;

export const CHECKLIST_NAV = {
  portfolioManager: "vsb_PortfolioManagerId",
  projectDefaultChecklist: "vsb_ProjectDefaultCheckListId",
} as const;

/** The owner bind key, lowercase as the live screens write it (brief). */
export const OWNING_BU_BIND = "owningbusinessunit@odata.bind";

export const GATE_ENTITY_SET = ES_PROCESS.projectDefaultApprovals;
export const CHECKLIST_APPROVAL_ENTITY_SET = ES_PROCESS.checkListDefaultApprovals;
/** `'Microsoft Entra IDs'` is the virtual table `aaduser`, entity set `aadusers`. */
export const ENTRA_ENTITY_SET = ES.aadUsers;

/** `aadusers` columns (generated `AadusersModel`). */
export const ENTRA_COL = {
  /** Display name "Id" — the primary key. */
  rowId: "aaduserid",
  /** Display name "A unique identifer for Microsoft Entra ID" — the canvas `PersonaKey`. */
  objectId: "id",
  displayName: "displayname",
  givenName: "givenname",
  surname: "surname",
  mail: "mail",
  /** A Boolean (`'Microsoft Entra ID Account Enabled (…)'.Yes` = true). */
  accountEnabled: "accountenabled",
} as const;

/* ═════════════════════════════════════════════════════════════════════ types ════ */

export interface GateState {
  id: string;
  name: string;
  order: number;
  isVisibleOnChecklist: boolean;
  owningBusinessUnitId: string | null;
}

export interface GateApproval {
  id: string;
  name: string | null;
  approvalMode: number | null;
  gateActive: boolean;
  clusterStateId: string | null;
  countryId: string | null;
  technology: number | null;
  portfolioManagerId: string | null;
  defaultApprovals: string | null;
  defaultContributors: string | null;
  defaultNotifications: string | null;
}

export interface ChecklistApproval {
  id: string;
  name: string | null;
  approvalMode: number | null;
  gateActive: boolean;
  projectDefaultChecklistId: string | null;
  portfolioManagerId: string | null;
  defaultApprovers: string | null;
  defaultContributors: string | null;
  defaultNotifications: string | null;
}

/** One `Project Default Checklists` template, as this screen needs it. */
export interface ChecklistItem {
  id: string;
  name: string;
  order: number;
  countryTechId: string | null;
  clusterStateId: string | null;
}

/** One gate gallery row: a real approval, or the canvas in-memory placeholder. */
export interface MergedGate {
  /** The `Project States` row. */
  gate: GateState;
  approval: GateApproval | null;
  /** True when the canvas would have shown a `Patch(Defaults(...))` stand-in. */
  isPlaceholder: boolean;
}

export type PanelKind = "gate" | "checklist";

export interface ApprovalPanelState {
  kind: PanelKind;
  /** The gate the record belongs to — its `Project States` row is the BU source on BOTH branches. */
  gate: GateState;
  /** The check-list template, on the check-list branch only. */
  checklistItem: ChecklistItem | null;
  mode: number | null;
  portfolioManager: Persona | null;
  contributors: Persona[];
  approvers: Persona[];
  notifications: Persona[];
  gateActive: boolean;
  /** `null` for a new record — nothing is written until Save. */
  existingId: string | null;
}

export { emptyPlan, type PlannedWrite, type WritePlan } from "@/data/writePlan";

const MODE = CHOICE_PROCESS.approvalMode;
export { MODE as APPROVAL_MODE };

/** `Choices('Approval Mode')`, in metadata order. */
export const APPROVAL_MODE_OPTIONS: { value: number; label: string }[] = [
  { value: MODE.formalApproval, label: "Formal Approval" },
  { value: MODE.localApproval, label: "Local Approval" },
  { value: MODE.onlyNotifications, label: "Only Notifications" },
];

/** The display label for a stored `Approval Mode` value; "—" for anything unmapped. */
export function approvalModeLabel(mode: number | null | undefined): string {
  return APPROVAL_MODE_OPTIONS.find((o) => o.value === mode)?.label ?? "—";
}

/* ════════════════════════════════════════════════════════════════ captions ════ */

export const PANEL_LABELS = {
  /** `lblAdmin_ProjectGates_Approvals_Form_Title.Text` — the "Edit" arm. */
  title: "Edit Approvers",
  /** `lbl_Admin_ProjectGates_Approvals_Form_Fields_State.Text` — verbatim. */
  gate: "Gate",
  /** `tog_Admin_ProjectGates_Approvals_Form_Fields_Active.Label` — verbatim. */
  gateActive: "Gate active",
  /** `lbl_Admin_ProjectGates_Approvals_Form_Fields_ApprovalMode.Text` — verbatim. */
  approvalMode: "Approval Mode",
  /** `lbl_Admin_ProjectGates_Approvals_Form_Fields_Notifications.Text` — verbatim. */
  notifications: "Notifications",
  /** `pcf_Admin_ProjectGates_Approvals_Form_Fields_Notifications.HintText` — verbatim. */
  notificationsPlaceholder: "Select Notifications",
  /** `btn_Admin_ProjectGates_Approvals_Form_Fields_ResetGateApproval.Text` — verbatim. */
  resetGate: "Reset Gate",
} as const;

export const SCREEN_LABELS = {
  /** `cmp_Admin_ProjectGatest_Approvals_Header.Project.Name` — the page title. */
  pageTitle: "Project Gates",
  /** `lblAdmin_ProjectGates_Approvals_Form_Title.Text` — the "Add" arm. */
  titleAdd: "Add Approvers",
  /** `lbl_Admin_ProjectGates_Approvals_Form_Fields_State_1.Text` — verbatim. */
  checkList: "Check List",
  /** `lbl_Admin_ProjectGates_Approvals_Form_Fields_Approval1.Text` — verbatim. */
  portfolioManager: "Portfolio Manager",
  /** `pcf_Admin_ProjectGates_Approvals_Form_Fields_PortfolioManger.HintText` — verbatim. */
  portfolioManagerPlaceholder: "Select Portfolio Manager",
  /** `lbl_Admin_ProjectGates_Approvals_Form_Fields_Approval2.Text` — verbatim. */
  contributors: "Contributors",
  /** `pcf_Admin_ProjectGates_Approvals_Form_Fields_Approval2.HintText` — verbatim. */
  contributorsPlaceholder: "Select Contributors",
  /** `lbl_Admin_ProjectGates_Approvals_Form_Fields_Approvals.Text` — verbatim. */
  approvers: "Approvers",
  /** `pcf_Admin_ProjectGates_Approvals_Form_Fields_Approvals.HintText` — verbatim. */
  approversPlaceholder: "Select Approvers",
  /** The status chips' `Text` — `If('Gate active', "Active", "Inactive")`. */
  active: "Active",
  inactive: "Inactive",
  /** `btn_Admin_ProjectGates_DefaultClusterApproval_Item_Collapse.Text` — expanded. */
  collapse: "-",
  /** `btn_Admin_ProjectGates_DefaultClusterApproval_Item_Collapse.Text` — collapsed. */
  expand: "+",
  /** `but_Admin_ProjectGatest_Approvals_Row_Edit_3.Text` — `"   Add Task"`, leading spaces trimmed (the `Add` icon sits there). */
  addTask: "Add Task",
  /** `btn_…_Item_Edit.Icon` — the icon-only button's name. */
  edit: "Edit",
  /** `btn_…_ChecklistDefaultApproval_Item_Delete.Icon` — the icon-only button's name. */
  delete: "Delete",
  /** `cmp_DeleteChecklistApprovalItem_AdminScreen.Title` — verbatim. */
  deleteTitle: "Delete Check List Approval Item?",
  /** `cmp_DeleteChecklistApprovalItem_AdminScreen.ConfirmButtonText` — verbatim. */
  deleteConfirm: "Delete",
  /** `cmp_DeleteChecklistApprovalItem_AdminScreen.CancelButtonText` — verbatim. */
  cancel: "Cancel",
} as const;

/** The people pickers' `Tooltip`s — verbatim. */
export const PICKER_TOOLTIPS = {
  /** `pcf_Admin_ProjectGates_Approvals_Form_Fields_PortfolioManger.Tooltip`. */
  portfolioManager: "Search for portfolio manager",
  /** `pcf_Admin_ProjectGates_Approvals_Form_Fields_Approval2.Tooltip`. */
  contributors: "Select Contributors",
  /** `pcf_Admin_ProjectGates_Approvals_Form_Fields_Approvals.Tooltip`. */
  approvers: "Select Approvers",
  /** `pcf_Admin_ProjectGates_Approvals_Form_Fields_Notifications.Tooltip`. */
  notifications: "Select Notifications",
} as const;

/**
 * `lbl_Admin_ProjectGates_Approvals_Headline.Text` —
 * `$"Project Gates | {Country.Name} {If(IsBlank(tech), "", "| " & tech)}"`, verbatim.
 */
export const gatesHeadline = (countryName: string | null, technology: string | null): string =>
  `Project Gates | ${countryName ?? ""} ${isBlank(technology) ? "" : `| ${technology}`}`;

/** The table's column headers (`lbl_Admin_ProjectGatest_Approvals_Header_*`), in order. */
export const GATE_TABLE_COLUMNS: readonly string[] = [
  "Description", "Portfolio Manager", "Contributors", "Approvers",
  "Notifications", "Status", "Action",
];

/**
 * `lbl_Admin_ProjectGates_DefaultClusterApproval_Item_ApprovalDescription.Text` —
 * `Switch(ThisItem.Order, 0, "Draft to Cluster 1", $"Cluster {Order} to Cluster {Order + 1}")`.
 */
export const gateDescription = (order: number): string =>
  order === 0 ? "Draft to Cluster 1" : `Cluster ${order} to Cluster ${order + 1}`;

/* ═════════════════════════════════════════════════════════════════ messages ════ */

export const MSG = {
  /** `lbl_…_Approval1_ErrorMessage.Text` (and its three siblings) — verbatim. */
  valueEmpty: "Value cannot be empty.",
  /**
   * `lbl_Admin_ProjectGates_Approvals_Form_Fields_Main_ErrorMessage.Text` — verbatim, including
   * the canvas's misspelling "allready".
   */
  duplicateGate: "Default Approval for the selected Gate allready exists.",
  /** `lbl_…_State_ErrMessage.Text` and `lbl_…_State_ErrMessage_1.Text` — verbatim (both). */
  clusterBlank: "The cluster cannot be blank.",
  /** `lbl_…_ResetGateApproval_Description.Text` — verbatim. */
  resetGateCaption: "Remove all cluster gate participants and deactivate the gate approval.",
  /** Save success — `UpdateContext({locAdminLoadingDialogText: $"Approvals was successfully saved."})`. */
  saved: "Approvals was successfully saved.",
  /**
   * NEW — no canvas equivalent: the canvas silently reset a non-Wind/PV row on Edit; the code
   * app shows this instead and writes nothing on open.
   */
  nonWindPv:
    "Formal approval is only available for Wind and PV. This gate can use notifications "
    + "only; the stored approver lists are shown read-only and are not changed.",
  /** NEW — no canvas equivalent: the save plan's refusal without the admin rule. */
  noPermission: "You do not have permission to change the default approvals.",
  /** NEW — no canvas equivalent: Reset Gate is refused while the gate has no row yet (deferred create). */
  resetNoRecord: "There is no approval record for this gate yet, so there is nothing to reset.",
  /** NEW — no canvas equivalent: the chip's refusal when the gate has no row yet. */
  toggleNoRecord: "This gate has no approval record yet.",
  /** NEW — no canvas equivalent: rule 19 load-error state. */
  loadFailedTitle: "Gate approvals are unavailable",
  /** NEW — no canvas equivalent: rule 19 load-error state. */
  loadFailedDescription: "The gate approvals could not be loaded. Please try again.",
  /** NEW — no canvas equivalent: rule 19 loading state. */
  loading: "Loading...",
} as const;

/**
 * `pcf_but_…_Save.OnChange`, `locAdminLoadingDialogText` (Cluster branch) —
 * `$"Approvals data for {Headline.Text}{Char(13)}Gate: '{drp_…_State.Selected.Label}' will be
 * saved, please wait..."`. `Char(13)` becomes `\n`.
 */
export const savingGateText = (headline: string, gateLabel: string): string =>
  `Approvals data for ${headline}\nGate: '${gateLabel}' will be saved, please wait...`;

/** The Checklist branch: `…Check List: '{drp_…_State_1.Selected.Name}' will be saved, please wait...`. */
export const savingChecklistText = (headline: string, itemName: string): string =>
  `Approvals data for ${headline}\nCheck List: '${itemName}' will be saved, please wait...`;

/**
 * `cmp_DeleteChecklistApprovalItem_AdminScreen.OnConfirm` —
 * `$"Approval item for {Headline.Text}{Char(13)}Check List: '{…}' being deleted, please wait..."`.
 * SOURCE DEFECT: the canvas reads the name from the panel's combobox
 * (`drp_…_State_1.Selected.Name`), which holds whatever the panel last showed, not the row being
 * deleted. The code app passes the deleted row's own template name.
 */
export const deletingChecklistText = (headline: string, itemName: string): string =>
  `Approval item for ${headline}\nCheck List: '${itemName}' being deleted, please wait...`;

/**
 * Save failure — canvas `$"Error: Approvals type could not be saved. Internal error: originated on
 * {FirstError.Source}. Message: {FirstError.Message} {…HttpResponse}"`. The code app has no
 * `FirstError.Source`, so it passes the error detail (the same treatment as D18/D21).
 */
export const saveErrorText = (detail: string): string =>
  `Error: Approvals type could not be saved. Internal error: ${detail}`;

/** NEW — no canvas equivalent: progress text for a status-chip click (the canvas showed none). */
export const togglingText = (description: string): string =>
  `Status of '${description}' will be changed, please wait...`;

/** NEW — no canvas equivalent: progress text for Reset Gate (the canvas showed none). */
export const resettingGateText = (headline: string, gateLabel: string): string =>
  `Approvals data for ${headline}\nGate: '${gateLabel}' will be reset, please wait...`;

/**
 * `locDeleteChecklistApprovalDialogeText` (set by `btn_…_ChecklistDefaultApproval_Item_Delete.OnSelect`)
 * — verbatim; `Char(13)` becomes `\n`. `gateLabel` is the gate row's description
 * (`lbl_…_Item_ApprovalDescription.Text`).
 * SOURCE DEFECT: the last line reads the panel's combobox (`drp_…_State_1.Selected.Name`); the
 * code app passes the row's own template name.
 */
export const deleteChecklistApprovalText = (
  countryName: string | null, technology: string | null, gateLabel: string, itemName: string,
): string =>
  `Are you sure you want to execute the deletion?\n\n${countryName ?? ""} - ${technology ?? ""}`
  + `\n${gateLabel}\nCheck List Item: '${itemName}'`;

/* ═════════════════════════════════════════════════════════════════ the gate list ════ */

/** `varAllGates: Filter('Project States', 'Is Visible On Checklist', Order < 6)`. */
export const MAX_CONFIGURABLE_GATE_ORDER = 6;

export const configurableGates = (states: GateState[]): GateState[] =>
  states
    .filter((g) => g.isVisibleOnChecklist === true && (g.order ?? 0) < MAX_CONFIGURABLE_GATE_ORDER)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

/**
 * `gal_Admin_ProjectGates_DefaultApprovals_Clusters.Items` — EVERY gate renders:
 * `Coalesce(LookUp(sortedApprovals, Order = Gate.Order), <placeholder>)`. `LookUp` takes the
 * FIRST match, so a duplicate row for the same gate is ignored here too.
 */
export function mergeGatesWithApprovals(
  states: GateState[],
  approvals: GateApproval[],
): MergedGate[] {
  const byGate = new Map<string, GateApproval>();
  for (const a of approvals) {
    if (a.clusterStateId && !byGate.has(a.clusterStateId)) byGate.set(a.clusterStateId, a);
  }
  return configurableGates(states).map((gate) => {
    const approval = byGate.get(gate.id) ?? null;
    return { gate, approval, isPlaceholder: approval === null };
  });
}

/* ══════════════════════════════════════════════════════════ the gate dropdown ════ */

export interface GateDropdownItem {
  /** The `Project States` row the transition STARTS from. */
  stateId: string;
  order: number;
  /** `Name & " to " & nextStateName` — a TRANSITION label (the record's `Name`). */
  label: string;
  /** The STATE name (`drp_…_State.Selected.Name`) — what the Draft rule compares. */
  name: string;
}

/** Transitions INTO these two states are excluded from the dropdown. */
export const EXCLUDED_TRANSITION_TARGETS: readonly string[] = ["Inactive/ On-hold", "Abandoned"];

/** `Name & " to " & <name of the state at Order + 1>` (blank when there is none). */
export const gateTransitionLabel = (state: GateState, next: GateState | null): string =>
  `${state.name} to ${next?.name ?? ""}`;

/**
 * `drp_Admin_ProjectGates_Approvals_Form_Fields_State.Items`:
 *  - `nextStateName` = `LookUp('Project States', Order = Order + 1).Name` over ALL states (not
 *    only the visible ones);
 *  - sorted by `strOrder` = `Text(Order)`, a TEXT sort;
 *  - `FirstN(visible, CountRows(visible) - 1)` drops the last visible state in that order;
 *  - transitions into "Inactive/ On-hold" and "Abandoned" are excluded.
 * The dropdown is hard-coded `DisplayMode.Disabled`: it is a label source, not a chooser.
 */
export function gateDropdownItems(states: GateState[]): GateDropdownItem[] {
  const byOrder = new Map<number, GateState>();
  for (const s of states) if (!byOrder.has(s.order ?? 0)) byOrder.set(s.order ?? 0, s);
  const visible = states
    .filter((g) => g.isVisibleOnChecklist === true)
    .sort((a, b) => String(a.order ?? 0).localeCompare(String(b.order ?? 0)));

  return visible
    .slice(0, Math.max(0, visible.length - 1))
    .map((state) => ({ state, next: byOrder.get((state.order ?? 0) + 1) ?? null }))
    .filter(({ next }) => !EXCLUDED_TRANSITION_TARGETS.includes(next?.name ?? ""))
    .map(({ state, next }) => ({
      stateId: state.id,
      order: state.order ?? 0,
      name: state.name,
      label: gateTransitionLabel(state, next),
    }));
}

/** The gate's dropdown entry (`DefaultSelectedItems` = the row's state), or null when it has none. */
export const gateDropdownItemFor = (
  items: readonly GateDropdownItem[], gateId: string,
): GateDropdownItem | null => items.find((d) => d.stateId === gateId) ?? null;

/** The gate record's `Name`: `Coalesce(drp_….Selected.Label, " ")`. */
export const gateRecordName = (item: GateDropdownItem | null): string =>
  isBlank(item?.label) ? " " : item!.label;

/* ═════════════════════════════════════════════════════════════ mode + gating ════ */

/**
 * `rad_…_ApprovalMode.Items` — `If(SelectedNestedValue in ["Wind","PV"], Choices('Approval Mode'),
 * ['Approval Mode'.'Only Notifications'])`.
 */
export function approvalModeChoices(technology: string | null | undefined): number[] {
  return isWindOrPv(technology)
    ? [MODE.formalApproval, MODE.localApproval, MODE.onlyNotifications]
    : [MODE.onlyNotifications];
}

/** `rad_…_ApprovalMode.DefaultSelectedItems` — `Coalesce(<entity mode>, Only Notifications)`. */
export const defaultApprovalMode = (existing: number | null | undefined): number =>
  existing ?? MODE.onlyNotifications;

/** See the header: a banner instead of the canvas's silent reset on open. */
export function nonWindPvBanner(technology: string | null | undefined): string | null {
  return isWindOrPv(technology) ? null : MSG.nonWindPv;
}

/** The STATE name the canvas Draft rules compare against. */
export const DRAFT_GATE_NAME = "Draft";

/**
 * GATE branch only: `'Gate active': If(drp_….Selected.Name <> "Draft", tog_….Checked, true)`.
 * `stateName` is the gate's STATE name ("Draft"), never the transition label — passing the label
 * ("Draft to Cluster 1") made the rule never fire. The check-list branch writes the toggle as is.
 */
export function resolveGateActive(stateName: string, toggle: boolean): boolean {
  return stateName === DRAFT_GATE_NAME ? true : toggle;
}

/**
 * `tog_…_Active.DisplayMode` — `If(drp_….Selected.Name <> "Draft" || locEditigApprovalType =
 * "Checklist", Edit, View)`. `stateName` is the gate's state name.
 */
export function canToggleGateActiveInPanel(kind: PanelKind, stateName: string): boolean {
  return stateName !== DRAFT_GATE_NAME || kind === "checklist";
}

/**
 * `btn_…_Item_ToggleStauts.DisplayMode` — View when the three lists are blank or the gate is at
 * `'Cluster State'.Order = 0`. A placeholder gate has no row, so it has nothing to toggle.
 */
export function canToggleGateChip(row: MergedGate): boolean {
  const a = row.approval;
  if (!a) return false;
  if ((row.gate.order ?? 0) === 0) return false;
  const empty = isBlank(a.defaultContributors)
    && isBlank(a.defaultNotifications)
    && isBlank(a.defaultApprovals);
  return !empty;
}

/**
 * `lblAdmin_ProjectGates_Approvals_Form_Title.Text` —
 * `If(IsBlank(locSelectedApprovalsEntity), "Add Approvers", "Edit Approvers")`.
 * The canvas gate panel always has an entity (Edit creates the row), so it always says
 * "Edit Approvers" — kept. SOURCE DEFECT on the check-list branch: the canvas tests the GATE
 * variable, which the check-list Edit never sets, so the title depends on whichever gate panel
 * was open before. The code app says "Add Approvers" for a new check-list approval and
 * "Edit Approvers" for an existing one.
 */
export function panelTitle(panel: Pick<ApprovalPanelState, "kind" | "existingId">): string {
  if (panel.kind === "gate") return PANEL_LABELS.title;
  return panel.existingId === null ? SCREEN_LABELS.titleAdd : PANEL_LABELS.title;
}

/* ═══════════════════════════════════════════════════════════════════ validation ════ */

export interface PanelErrors {
  /** `lbl_…_Approval1_ErrorMessage` — Portfolio Manager, Formal Approval only. */
  portfolioManager: boolean;
  /** `lbl_…_Approval2_ErrorMessage` — Contributors, Formal Approval only. */
  contributors: boolean;
  /** `lbl_…_Approvals_ErrorMessage` — Approvers, unless Only Notifications. */
  approvers: boolean;
  /** `lbl_…_Notifications_ErrorMessage` — Notifications, Only Notifications only. */
  notifications: boolean;
  /** `lbl_…_Main_ErrorMessage` — the duplicate-gate guard. */
  duplicateGate: boolean;
  /** `lbl_…_State_ErrMessage_1` — the check-list combobox is blank. */
  checklistBlank: boolean;
}

/**
 * The error labels whose visibility disables Save (`pcf_but_…_Save.DisplayMode`).
 *
 * `duplicateGate`: the canvas label shows when `IsBlank(locSelectedApprovalsEntity)` on the
 * Cluster branch — which never happens there, because Edit always creates the row first. Here it
 * fires only if a new gate record is started while a real row already exists for that gate (which
 * the screen never does either), so it stays inert, as in the canvas.
 *
 * SOURCE DEFECT (`checklistBlank`): the canvas shows "The cluster cannot be blank." under a blank
 * Check List combobox but leaves Save enabled, and the save then fails on the required
 * `'Project Default Check List'` lookup. The code app also blocks Save. The wording is kept.
 */
export function validatePanel(
  panel: ApprovalPanelState,
  opts: { existingApprovalForGate?: boolean } = {},
): PanelErrors {
  const mode = panel.mode ?? MODE.onlyNotifications;
  const formal = mode === MODE.formalApproval;
  return {
    portfolioManager: formal && panel.portfolioManager === null,
    contributors: formal && panel.contributors.length === 0,
    approvers: mode !== MODE.onlyNotifications && panel.approvers.length === 0,
    notifications: mode === MODE.onlyNotifications && panel.notifications.length === 0,
    duplicateGate:
      panel.kind === "gate"
      && panel.existingId === null
      && opts.existingApprovalForGate === true,
    checklistBlank: panel.kind === "checklist" && panel.checklistItem === null,
  };
}

export const hasErrors = (e: PanelErrors): boolean => Object.values(e).some(Boolean);

export function canSavePanel(
  panel: ApprovalPanelState,
  opts: { canEdit: boolean; existingApprovalForGate?: boolean },
): boolean {
  if (!opts.canEdit) return false;
  return !hasErrors(validatePanel(panel, opts));
}

export function panelErrorMessages(errors: PanelErrors): string[] {
  const out: string[] = [];
  if (errors.portfolioManager) out.push(`Portfolio Manager: ${MSG.valueEmpty}`);
  if (errors.contributors) out.push(`Contributors: ${MSG.valueEmpty}`);
  if (errors.approvers) out.push(`Approvers: ${MSG.valueEmpty}`);
  if (errors.notifications) out.push(`Notifications: ${MSG.valueEmpty}`);
  if (errors.duplicateGate) out.push(MSG.duplicateGate);
  if (errors.checklistBlank) out.push(MSG.clusterBlank);
  return out;
}

/* ═════════════════════════════════════════════════════════════ the people pickers ════ */

/** The pickers' `MaxPeople`: Portfolio Manager 1, Contributors 20, Approvers 5, Notifications 20. */
export const PERSON_LIMITS = {
  portfolioManager: 1,
  contributors: 20,
  approvers: 5,
  notifications: 20,
} as const;

/**
 * Picking a person adds them once; at `MaxPeople` the picker accepts no more (the PCF stops
 * offering input until someone is removed).
 */
export function applyPersonaSelection(
  current: Persona[],
  picked: Persona,
  maxPeople: number,
): Persona[] {
  if (current.some((p) => p.id === picked.id)) return current;
  if (current.length >= maxPeople) return current;
  return [...current, picked];
}

/**
 * `Suggestions_Items` — Contributors, Approvers and Notifications hide people already selected:
 * `Filter(colX, Not(ThisRecord.Mail in ShowColumns(Self.SelectedPeople, PersonaRole)))`. The
 * Portfolio Manager picker shows `colApprovals1` unfiltered (`excludeSelected: false`).
 */
export function pickerSuggestions(
  found: Persona[], selected: Persona[], excludeSelected: boolean,
): Persona[] {
  if (!excludeSelected) return found;
  const mails = new Set(selected.map((p) => p.mail));
  return found.filter((p) => !mails.has(p.mail));
}

/**
 * `OnSearch` — `If(IsBlankOrError(Trim(Self.SearchText)), Blank(), Search(Filter('Microsoft Entra
 * IDs', 'Microsoft Entra ID Account Enabled' = …Yes), Trim(Self.SearchText), 'Display Name',
 * 'Given Name', Surname, Mail))`. A blank term clears the suggestions and issues no request.
 */
export const shouldSearchPeople = (term: string): boolean => term.trim().length > 0;

/**
 * The `$filter` for that search on `aadusers`: `accountenabled eq true` and a case-insensitive
 * `contains` on the four `Search` columns. `undefined` for a blank term (no request).
 */
export function entraSearchFilter(term: string): string | undefined {
  const t = term.trim();
  if (!t) return undefined;
  return and(
    eq(ENTRA_COL.accountEnabled, true),
    or(
      contains(ENTRA_COL.displayName, t), contains(ENTRA_COL.givenName, t),
      contains(ENTRA_COL.surname, t), contains(ENTRA_COL.mail, t),
    ),
  );
}

/* ═════════════════════════════════════════════════════════════ the persona writes ════ */

/**
 * The three lists have DIFFERENT write conditions:
 *   Contributors   only when mode = Formal Approval
 *   Approvers      when mode <> Only Notifications
 *   Notifications  whenever the list is non-empty
 * and Portfolio Manager is written only in Formal Approval, else `Blank()`.
 */
export interface PersonaFields {
  portfolioManagerId: string | null;
  contributors: string | null;
  approvers: string | null;
  notifications: string | null;
}

export function personaFieldsForMode(panel: ApprovalPanelState): PersonaFields {
  const mode = panel.mode ?? MODE.onlyNotifications;
  const formal = mode === MODE.formalApproval;
  return {
    portfolioManagerId: formal ? panel.portfolioManager?.id ?? null : null,
    contributors: formal ? serialisePersonaList(panel.contributors) : null,
    approvers:
      mode !== MODE.onlyNotifications ? serialisePersonaList(panel.approvers) : null,
    notifications:
      panel.notifications.length > 0 ? serialisePersonaList(panel.notifications) : null,
  };
}

/** `/<set>(<id>)`, or `null` (the canvas `Blank()`). */
const bindOrNull = (set: string, id: string | null): string | null => (id ? `/${set}(${id})` : null);

/**
 * Adds `<nav>@odata.bind`. A cleared lookup is written as `null` on an update (the canvas
 * `Blank()`), and simply omitted on a create, where it is blank anyway.
 */
function putBind(data: Record<string, unknown>, nav: string, value: string | null, isCreate: boolean): void {
  if (value === null && isCreate) return;
  data[`${nav}@odata.bind`] = value;
}

/**
 * The Cluster branch of `pcf_but_…_Save.OnChange`: `Patch('Project Default Approvals', …)` with
 * Name, Approvals Country, Cluster State, Approval Mode, Gate active (Draft rule), Portfolio
 * Manager, the three JSON lists, Technology and Owning Business Unit — ALL of them on every save,
 * create or update, as the canvas does.
 *
 * Portfolio Manager is `LookUp('Microsoft Entra IDs', 'A unique identifer…' = GUID(PersonaKey))`:
 * the `aadusers` row whose object id is the persona key. For `aaduser` the primary key IS the
 * object id, so the bind is `/aadusers(<PersonaKey>)` (as `data/comments.ts` binds it).
 * Owning Business Unit is the gate's `Project States` row's (`LookUp('Project States', …).'Owning
 * Business Unit'`).
 */
export function buildGatePayload(
  panel: ApprovalPanelState,
  scope: Scope,
  gateLabel: string,
): Record<string, unknown> {
  const p = personaFieldsForMode(panel);
  const isCreate = panel.existingId === null;
  const data: Record<string, unknown> = {
    [GATE_APPROVAL_COL.name]: isBlank(gateLabel) ? " " : gateLabel,
    [GATE_APPROVAL_COL.approvalMode]: panel.mode ?? MODE.onlyNotifications,
    [GATE_APPROVAL_COL.gateActive]: resolveGateActive(panel.gate.name, panel.gateActive),
    [GATE_APPROVAL_COL.defaultContributors]: p.contributors,
    [GATE_APPROVAL_COL.defaultApprovals]: p.approvers,
    [GATE_APPROVAL_COL.defaultNotifications]: p.notifications,
    [GATE_APPROVAL_COL.technology]: technologyValue(scope.technology),
  };
  putBind(data, GATE_NAV.country, bindOrNull("vsb_countries", scope.country?.id ?? null), isCreate);
  putBind(data, GATE_NAV.clusterState, bindOrNull("vsb_projectstates", panel.gate.id), isCreate);
  putBind(data, GATE_NAV.portfolioManager, bindOrNull(ENTRA_ENTITY_SET, p.portfolioManagerId), isCreate);
  if (panel.gate.owningBusinessUnitId) {
    data[OWNING_BU_BIND] = `/businessunits(${panel.gate.owningBusinessUnitId})`;
  }
  return data;
}

/**
 * The Checklist branch: `Patch('Check List Default Approvals', …)` with Name (the template's
 * name), Project Default Check List, Approval Mode, Gate active (the toggle as is — no Draft
 * rule), Portfolio Manager, the three JSON lists and Owning Business Unit, on every save.
 * Owning Business Unit comes from `drp_…_State` — the gate row the check list sits under — i.e.
 * the gate's `Project States` row, as on the Cluster branch.
 */
export function buildChecklistPayload(panel: ApprovalPanelState): Record<string, unknown> {
  const p = personaFieldsForMode(panel);
  const isCreate = panel.existingId === null;
  const data: Record<string, unknown> = {
    [CHECKLIST_APPROVAL_COL.name]: panel.checklistItem?.name ?? "",
    [CHECKLIST_APPROVAL_COL.approvalMode]: panel.mode ?? MODE.onlyNotifications,
    [CHECKLIST_APPROVAL_COL.gateActive]: panel.gateActive,
    [CHECKLIST_APPROVAL_COL.defaultContributors]: p.contributors,
    [CHECKLIST_APPROVAL_COL.defaultApprovers]: p.approvers,
    [CHECKLIST_APPROVAL_COL.defaultNotifications]: p.notifications,
  };
  putBind(
    data, CHECKLIST_NAV.projectDefaultChecklist,
    bindOrNull(ES_PROCESS.projectDefaultChecklists, panel.checklistItem?.id ?? null), isCreate,
  );
  putBind(data, CHECKLIST_NAV.portfolioManager, bindOrNull(ENTRA_ENTITY_SET, p.portfolioManagerId), isCreate);
  if (panel.gate.owningBusinessUnitId) {
    data[OWNING_BU_BIND] = `/businessunits(${panel.gate.owningBusinessUnitId})`;
  }
  return data;
}

/** Save — one create or one update on the panel's table. */
export function planSaveApproval(
  panel: ApprovalPanelState,
  scope: Scope,
  opts: { canEdit: boolean; gateLabel: string; existingApprovalForGate?: boolean },
): WritePlan {
  if (!opts.canEdit) return refuse(MSG.noPermission);
  const errors = validatePanel(panel, opts);
  if (hasErrors(errors)) return refuse(panelErrorMessages(errors)[0]!);

  const isGate = panel.kind === "gate";
  const entitySet = isGate ? GATE_ENTITY_SET : CHECKLIST_APPROVAL_ENTITY_SET;
  const data = isGate ? buildGatePayload(panel, scope, opts.gateLabel) : buildChecklistPayload(panel);
  const plan = emptyPlan();
  plan.writes.push(
    panel.existingId === null
      ? { op: "create", entitySet, data, reason: `${panel.kind} approval created` }
      : { op: "update", entitySet, id: panel.existingId, data, reason: `${panel.kind} approval updated` },
  );
  return plan;
}

/**
 * The gate status chip (`btn_…_Item_ToggleStauts.OnSelect`):
 * `Patch('Project Default Approvals', DropColumns(ThisItem, Id, Order), {'Gate active':
 * If(Self.Text = "Active", false, true)})` — no confirmation, as in the canvas.
 */
export function planToggleGateActive(row: MergedGate, canEdit: boolean): WritePlan {
  if (!canEdit) return refuse(MSG.noPermission);
  if (!row.approval) return refuse(MSG.toggleNoRecord);
  if (!canToggleGateChip(row)) return refuse(MSG.toggleNoRecord);
  const plan = emptyPlan();
  plan.writes.push({
    op: "update", entitySet: GATE_ENTITY_SET, id: row.approval.id,
    data: { [GATE_APPROVAL_COL.gateActive]: !row.approval.gateActive },
    reason: `gate ${row.approval.gateActive ? "deactivated" : "activated"}`,
  });
  return plan;
}

/**
 * The check-list status chip (`btn_…_ChecklistDefaultApproval_Item_ToggleStatus.OnSelect`):
 * `Patch('Check List Default Approvals', ThisItem, {'Gate active': If(Self.Text = "Active",
 * false, true)})`. Always enabled in the canvas (no `DisplayMode`).
 */
export function planToggleChecklistActive(approval: ChecklistApproval, canEdit: boolean): WritePlan {
  if (!canEdit) return refuse(MSG.noPermission);
  const plan = emptyPlan();
  plan.writes.push({
    op: "update", entitySet: CHECKLIST_APPROVAL_ENTITY_SET, id: approval.id,
    data: { [CHECKLIST_APPROVAL_COL.gateActive]: !approval.gateActive },
    reason: `check-list approval ${approval.gateActive ? "deactivated" : "activated"}`,
  });
  return plan;
}

/** `Remove('Check List Default Approvals', locSelectedChecklistApprovalEntity)`. Gate rows have no delete. */
export function planDeleteChecklistApproval(
  approval: ChecklistApproval,
  canEdit: boolean,
): WritePlan {
  if (!canEdit) return refuse(MSG.noPermission);
  const plan = emptyPlan();
  plan.writes.push({
    op: "delete", entitySet: CHECKLIST_APPROVAL_ENTITY_SET, id: approval.id,
    reason: "check-list approval deleted",
  });
  return plan;
}

/** Reset Gate needs an existing gate row (the canvas always had one; see the header). */
export function canResetGate(panel: ApprovalPanelState, canEdit: boolean): boolean {
  return canEdit && panel.kind === "gate" && panel.existingId !== null;
}

/**
 * Reset Gate (`btn_…_ResetGateApproval.OnSelect`): `Patch('Project Default Approvals',
 * locSelectedApprovalsEntity, {'Gate active': false, 'Portfolio Manager': Blank(),
 * 'Default Contributors': Blank(), 'Default Approvals': Blank(), 'Default Notifications':
 * Blank()})` — exactly those five fields, and `false` even for the Draft gate (canvas parity;
 * see the open question in D22).
 */
export function planResetGate(panel: ApprovalPanelState, canEdit: boolean): WritePlan {
  if (!canEdit) return refuse(MSG.noPermission);
  if (panel.kind !== "gate" || panel.existingId === null) return refuse(MSG.resetNoRecord);
  const plan = emptyPlan();
  plan.writes.push({
    op: "update", entitySet: GATE_ENTITY_SET, id: panel.existingId,
    data: {
      [GATE_APPROVAL_COL.gateActive]: false,
      [`${GATE_NAV.portfolioManager}@odata.bind`]: null,
      [GATE_APPROVAL_COL.defaultContributors]: null,
      [GATE_APPROVAL_COL.defaultApprovals]: null,
      [GATE_APPROVAL_COL.defaultNotifications]: null,
    },
    reason: "gate approval reset",
  });
  return plan;
}

/* ══════════════════════════════════════════════════════ checklist approvals ════ */

/** The templates of one gate in the scope (`'Associated Country And Technology'` × `'Cluster State'`). */
const templatesOfGate = (
  items: ChecklistItem[], gateId: string, scopeCountryTechId: string | null,
): ChecklistItem[] => items.filter((i) =>
  i.clusterStateId === gateId
  && (scopeCountryTechId === null || i.countryTechId === scopeCountryTechId));

/**
 * `gal_…_ChecklistDefaultApprovals.Items` — the approvals whose template belongs to the scope's
 * `Checklist Country And Technologies` row and to this gate, sorted by the template's `Order`.
 */
export function checklistApprovalsForGate(
  approvals: ChecklistApproval[],
  items: ChecklistItem[],
  gateId: string,
  scopeCountryTechId: string | null,
): { approval: ChecklistApproval; item: ChecklistItem | null }[] {
  const inScope = new Map(templatesOfGate(items, gateId, scopeCountryTechId).map((i) => [i.id, i]));
  return approvals
    .filter((a) => a.projectDefaultChecklistId !== null && inScope.has(a.projectDefaultChecklistId))
    .map((a) => ({ approval: a, item: inScope.get(a.projectDefaultChecklistId!) ?? null }))
    .sort((x, y) => (x.item?.order ?? 0) - (y.item?.order ?? 0));
}

/**
 * `drp_…_State_1.Items` on create: the gate's templates in the scope that are NOT already in the
 * gate's check-list gallery. On edit: only the record's own template. `DefaultSelectedItems` on
 * create is `FirstN(<that list>, 1)`.
 */
export function checklistOptions(
  items: ChecklistItem[],
  approvals: ChecklistApproval[],
  gateId: string,
  scopeCountryTechId: string | null,
  editing: ChecklistItem | null,
): ChecklistItem[] {
  if (editing) return [editing];
  const approved = new Set(approvals.map((a) => a.projectDefaultChecklistId));
  return templatesOfGate(items, gateId, scopeCountryTechId).filter((i) => !approved.has(i.id));
}

/**
 * `but_Admin_ProjectGatest_Approvals_Row_Edit_3.DisplayMode` — "Add Task" is enabled only while a
 * template of this gate in the scope has no approval yet.
 *
 * The canvas compares against every `Check List Default Approvals` row
 * (`canAddChecklistApprovalCanvasParity`). A template belongs to exactly one country × technology,
 * so an approval of the same template is always in this scope and the two give the same answer
 * for real data; the scoped version is what the screen uses.
 */
export function canAddChecklistApproval(
  items: ChecklistItem[],
  approvals: ChecklistApproval[],
  gateId: string,
  scopeCountryTechId: string | null,
): boolean {
  const scoped = templatesOfGate(items, gateId, scopeCountryTechId);
  if (scoped.length === 0) return false;
  const scopedIds = new Set(scoped.map((i) => i.id));
  const approvedInScope = new Set(
    approvals
      .map((a) => a.projectDefaultChecklistId)
      .filter((id): id is string => id !== null && scopedIds.has(id)),
  );
  return scoped.some((i) => !approvedInScope.has(i.id));
}

/** The canvas formula, kept for the parity test. Not wired to the UI. */
export function canAddChecklistApprovalCanvasParity(
  items: ChecklistItem[],
  approvals: ChecklistApproval[],
  gateId: string,
  scopeCountryTechId: string | null,
): boolean {
  const approvedAnywhere = new Set(
    approvals.map((a) => a.projectDefaultChecklistId).filter(Boolean) as string[],
  );
  return templatesOfGate(items, gateId, scopeCountryTechId).some((i) => !approvedAnywhere.has(i.id));
}

/* ══════════════════════════════════════════════════════ the flattened table ════ */

export type GateTableRowKind = "gate" | "task" | "addTask";

export interface GateTableRow {
  kind: GateTableRowKind;
  key: string;
  description: string;
  portfolioManager: Persona[];
  contributors: Persona[];
  approvers: Persona[];
  notifications: Persona[];
  /** The four person cells as the canvas labels render them. */
  cells: {
    portfolioManager: CellText;
    contributors: CellText;
    approvers: CellText;
    notifications: CellText;
  };
  /** `null` on the Add Task row and on a placeholder gate with no row yet. */
  active: boolean | null;
  isPlaceholder: boolean;
  gate: MergedGate;
  task: { approval: ChecklistApproval; item: ChecklistItem | null } | null;
  /** Gate rows: how many check-list approvals the gate has (the Collapse button needs > 0). */
  taskCount: number;
  /** Only meaningful on an `addTask` row — whether the button is enabled. */
  addTaskEnabled: boolean;
}

const EMPTY_CELL: CellText = { text: "" };

/**
 * The gate gallery, flattened: per gate, the gate row, its check-list rows (hidden while the gate
 * is collapsed — `gal_…_ChecklistDefaultApprovals.Visible`), then the Add Task row, which has no
 * `Visible` and therefore stays visible while collapsed.
 *
 * `resolvePerson` turns a Portfolio Manager lookup id (`aaduserid`) into its directory entry.
 */
export function buildGateTableRows(
  merged: MergedGate[],
  checklistApprovals: ChecklistApproval[],
  items: ChecklistItem[],
  countryTechId: string | null,
  collapsedGateIds: ReadonlySet<string>,
  resolvePerson: (id: string | null) => Persona | null,
): GateTableRow[] {
  const out: GateTableRow[] = [];

  for (const row of merged) {
    const a = row.approval;
    const pm = resolvePerson(a?.portfolioManagerId ?? null);
    const contributors = parsePersonaList(a?.defaultContributors);
    const approvers = parsePersonaList(a?.defaultApprovals);
    const notifications = parsePersonaList(a?.defaultNotifications);
    const tasks = checklistApprovalsForGate(checklistApprovals, items, row.gate.id, countryTechId);

    out.push({
      kind: "gate",
      key: `gate-${row.gate.id}`,
      description: gateDescription(row.gate.order ?? 0),
      portfolioManager: pm ? [pm] : [],
      contributors, approvers, notifications,
      cells: {
        portfolioManager: gatePortfolioManagerCell(pm),
        contributors: personListCell(contributors, "Contributors", { tooltipSeparator: ";\n\n" }),
        approvers: personListCell(approvers, "Approvers"),
        notifications: personListCell(notifications, "Notifications"),
      },
      active: a ? a.gateActive : null,
      isPlaceholder: row.isPlaceholder,
      gate: row,
      task: null,
      taskCount: tasks.length,
      addTaskEnabled: false,
    });

    if (!collapsedGateIds.has(row.gate.id)) {
      for (const t of tasks) {
        const tpm = resolvePerson(t.approval.portfolioManagerId);
        const tc = parsePersonaList(t.approval.defaultContributors);
        const ta = parsePersonaList(t.approval.defaultApprovers);
        const tn = parsePersonaList(t.approval.defaultNotifications);
        out.push({
          kind: "task",
          key: `task-${t.approval.id}`,
          // `ThisItem.'Project Default Check List'.Name`.
          description: t.item?.name ?? t.approval.name ?? "",
          portfolioManager: tpm ? [tpm] : [],
          contributors: tc, approvers: ta, notifications: tn,
          cells: {
            portfolioManager: checklistPortfolioManagerCell(tpm),
            contributors: personListCell(tc, "Contributors", { tooltipSeparator: ";\n\n" }),
            approvers: personListCell(ta, "Approvers"),
            notifications: checklistNotificationsCell(tc, ta, tn),
          },
          active: t.approval.gateActive,
          isPlaceholder: false,
          gate: row,
          task: t,
          taskCount: 0,
          addTaskEnabled: false,
        });
      }
    }

    out.push({
      kind: "addTask",
      key: `addtask-${row.gate.id}`,
      description: SCREEN_LABELS.addTask,
      portfolioManager: [], contributors: [], approvers: [], notifications: [],
      cells: {
        portfolioManager: EMPTY_CELL, contributors: EMPTY_CELL,
        approvers: EMPTY_CELL, notifications: EMPTY_CELL,
      },
      active: null,
      isPlaceholder: false,
      gate: row,
      task: null,
      taskCount: 0,
      addTaskEnabled: canAddChecklistApproval(items, checklistApprovals, row.gate.id, countryTechId),
    });
  }

  return out;
}
