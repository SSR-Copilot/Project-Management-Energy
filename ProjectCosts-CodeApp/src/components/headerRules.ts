/**
 * Pure rules for `AppHeader`. Kept out of the component file so it exports components only.
 */
import { ES } from "@/data/dataverseNames";
import { canEditSelectedProject } from "@/domain/session";
import { serverEnforcedProvider, type PrivilegeProvider } from "@/platform/privileges";
import { palette } from "@/theme/tokens";

/**
 * `ico_cmp_Header_Info.Color` — `Switch(gblEnvironmentName, "Dev", Error, "Nightly", Warning,
 * "QA", Success, "Hotfix", Error, Transparent)`. Undefined means no icon.
 *
 * DIVERGENCE: the 1.21.709 source sets the icon's `Visible` to `false` (its `If(...)` is
 * commented out), but the live app (`UI Screenshots/Main Overview Screen.png`, 1.21.753)
 * shows it. The product owner asked for the live look (20 Oct 2026, X5).
 */
export function environmentInfoColor(environmentName: string | undefined): string | undefined {
  switch (environmentName) {
    case "Dev": case "Hotfix": return palette.Error;
    case "Nightly": return palette.Warning;
    case "QA": return palette.Success;
    default: return undefined;
  }
}

/**
 * `con_cmp_Header.Fill` (both canvas apps' `cmp_Header`) — the header band per environment:
 * `Switch(gblEnvironmentName, "Hotfix", ColorValue("#9831A850"), "Nightly", ColorValue("#AAAAAA60"),
 * "Budgeting", ColorValue("#85AD3760"), "QA", ColorValue("#E66C3780"), RGBA(255, 255, 255, 1))`.
 * `ColorValue` and CSS both read `#RRGGBBAA` with the alpha last, and the band is translucent over the
 * screen's #ebebeb (`.canvas-shell`) exactly as in the canvas — QA's salmon (17 Nov 2026).
 */
export function environmentHeaderFill(environmentName: string | undefined): string {
  switch (environmentName) {
    case "Hotfix": return "#9831A850";
    case "Nightly": return "#AAAAAA60";
    case "Budgeting": return "#85AD3760";
    case "QA": return "#E66C3780";
    default: return "#ffffff";
  }
}

/** `con_cmp_Header_Version.Visible` (under "Cloud"): `gblEnvironmentName = "Prod" || = "Dev"`. */
export const brandVersionVisible = (environmentName: string | undefined): boolean =>
  environmentName === "Prod" || environmentName === "Dev";

/**
 * `con_cmp_Header_Version_4.Visible` (the environment block before Help): `If(Prod || Dev, false, true)` —
 * the version moves from under "Cloud" to under the environment name everywhere else.
 */
export const environmentVersionVisible = (environmentName: string | undefined): boolean =>
  !brandVersionVisible(environmentName);

/* ═══════════════════════════════════════ the PM project status line (20 Oct 2026) ══ */

/**
 * `con_cmp_Header_ProjectStatus` — the second line under the project name on every Project
 * Management screen. `cmp_Header.Project.Status` is `gblProjectHeaderData.Status`, which
 * `App Loading Screen` sets to the project's Cluster State NAME (`LookUp('Project States',
 * 'Project State' = gblRecordSelectedProject.'Cluster State'.'Project State').Name`).
 */
export type ProjectStatusIcon = "info" | "blocked" | "lock";

const isInactiveOrAbandoned = (status: string) => status === "Abandoned" || status.includes("Inactive");

/**
 * `con_cmp_Header_Project_Status.Text`:
 * `If(IsBlank(Status), "", If(Or(Status = "Abandoned", "Inactive" in Status), Status, "Active"))`.
 */
export function projectStatusLabel(status: string | undefined): string {
  if (!status) return "";
  return isInactiveOrAbandoned(status) ? status : "Active";
}

/** `ico_cmp_Header_ProjectStatus.Icon`: Abandoned → Blocked, "Inactive…" → Lock, else Information. */
export function projectStatusIcon(status: string | undefined): ProjectStatusIcon {
  if (!status) return "info";
  if (status === "Abandoned") return "blocked";
  return status.includes("Inactive") ? "lock" : "info";
}

/**
 * `ico_cmp_Header_ProjectStatus.Color`: `gblAppColors.Error` (= `palette.akzent5`) for an
 * abandoned or inactive project, else `gblAppColors.ApprovalClusterStates.InProgress`
 * (= `ColorValue($"{palette.Success}60")`, the success green at 0x60 alpha).
 */
export function projectStatusColour(status: string | undefined): string {
  if (!status) return "transparent";
  return isInactiveOrAbandoned(status) ? palette.akzent5 : `${palette.Success}60`;
}

/**
 * Whether the line renders: the container's `Visible: =Not(IsBlank(cmp_Header.Project.Status))`
 * AND the label/icon's `Visible: =If(Or(gblEnvironmentName = "QA", gblEnvironmentName = "Prod"), false, true)`.
 */
export function projectStatusVisible(status: string | undefined, environmentName: string | undefined): boolean {
  return Boolean(status) && environmentName !== "QA" && environmentName !== "Prod";
}

/**
 * `con_cmp_Header_HeaderText.Text` on a Project Management screen: "New Project" when no
 * project is selected (`IsBlank(cmp_Header.Project.ID)`), else the project's name.
 */
export function pmHeaderTitle(projectId: string | undefined, projectName: string | undefined): string | undefined {
  if (!projectId) return "New Project";
  return projectName || undefined;
}

/** The PM `cmp_Header` user menu's `permissions` row — its two texts, verbatim. */
export const PROJECT_PERMISSION_LABEL = {
  canEdit: "Can edit Project",
  canView: "Can view Project",
} as const;

/**
 * `ItemDisplayName: If(gblCurrentUser.CanEditSelectedProject, "Can edit Project", "Can view
 * Project")`. The canvas sets the flag per screen in `OnVisible`:
 * `And(DataSourceInfo(Projects, CreatePermission), Coalesce(RecordInfo(gblRecordSelectedProject,
 * EditPermission), false))`, and `App.OnStart` starts it at `false`, so the row reads "Can view
 * Project" on the Project Main Screen and wherever no project is selected.
 *
 * The same formula through the D1 seam (`domain/session.canEditSelectedProject` over a
 * `PrivilegeProvider`). With the shipped `serverEnforcedProvider` (D1 option a) every selected
 * project reads "Can edit Project", because the app offers every command and Dataverse decides —
 * the text gets a real per-record answer the day D1 picks the role matrix or the Custom API, and
 * nothing here changes.
 */
export function projectPermissionLabel(
  projectId: string | undefined, provider: PrivilegeProvider = serverEnforcedProvider,
): string {
  if (!projectId) return PROJECT_PERMISSION_LABEL.canView;
  const canEdit = canEditSelectedProject(
    provider.forTable(ES.projects).canCreate, provider.forRecord(ES.projects, projectId).canWrite,
  );
  return canEdit ? PROJECT_PERMISSION_LABEL.canEdit : PROJECT_PERMISSION_LABEL.canView;
}
