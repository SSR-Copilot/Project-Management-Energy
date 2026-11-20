/**
 * Pure rules for `AppHeader`. Kept out of the component file so it exports components only.
 */
import { ES } from "@/data/dataverseNames";
import { canEditSelectedProject } from "@/domain/session";
import { serverEnforcedProvider, type PrivilegeProvider } from "@/platform/privileges";
import { palette } from "@/theme/tokens";

/*
 * The (i) environment marker. It has no OnSelect and no Tooltip in either canvas app; it only
 * colours the environment.
 *
 * DIVERGENCE (D148, bug 15341, 20 Nov 2026): the code app draws NO (i) marker on any header. It does
 * nothing when clicked, and the band colour and the environment name already show the environment. The
 * canvas colour switches are kept below as `…CanvasParity` twins, so the decision stays reversible.
 *
 * What the canvas does. Each `cmp_Header` has two copies:
 *
 *                          brand, under "Cloud"          environment block, before Help
 *                          `ico_cmp_Header_Info`         `ico_cmp_Header_Info_4` (`_3` in Project Main Screen's copy)
 *   Cost screens           SHOWN                         hidden (`Visible: false`)
 *   PM project + admin     hidden (`Visible: false`)     SHOWN (the `cmp_Header` component)
 *   PM project list        hidden (`Visible: false`)     HIDDEN (Project Main Screen's own header copy)
 *
 * "Shown" and "hidden" come from canvas screenshots, because every one of those `Visible`
 * formulas is only a comment (`=//true`, `=/*If(...)*\/`), so the YAML alone cannot tell them apart:
 *  - Cost, Dev (19 Nov 2026): the icon under "Cloud";
 *  - PM Edit Project, Dev (19 Nov 2026): the icon before Help;
 *  - `UI Screenshots/Main Overview Screen.png` (PM project list, Dev): no (i) anywhere in the header.
 * The admin screens use the same `cmp_Header` component as the PM project screens (for example
 * `Admin CAPEX Accounts`), so they show it too. None of the formulas depends on the environment.
 *
 * Both apps' `gblAppStyles` / `gblAppColors` (`App.OnStart`) define `Error` as `akzent5` (#d20532),
 * `Success` as `akzent3` (#82a51e) and `Warning` as #EE940C. These are not `palette.Error` /
 * `palette.Success` (#B22727 / #3C9856).
 */

/**
 * The Cost `cmp_Header`'s `ico_cmp_Header_Info.Color` (projectcosts `cmp_Header.pa.yaml:213`):
 * `Switch(gblEnvironmentName, "Dev", gblAppStyles.Error, "Nightly", gblAppStyles.Warning,
 * "QA", gblAppStyles.Success, Color.Transparent)`. It has no Hotfix case, so Hotfix shows no icon.
 * Canvas twin only: the code app does not draw the icon (D148).
 */
export function brandInfoColorCanvasParity(environmentName: string | undefined): string | undefined {
  switch (environmentName) {
    case "Dev": return palette.akzent5;
    case "Nightly": return palette.Warning;
    case "QA": return palette.akzent3;
    default: return undefined;
  }
}

/**
 * The PM `cmp_Header`'s `ico_cmp_Header_Info_4.Color` (projectmanagement `cmp_Header.pa.yaml:639`):
 * `Switch(gblEnvironmentName, "Dev", gblAppColors.Error, "Nightly", gblAppColors.Warning,
 * "QA", gblAppColors.Success, "Hotfix", gblAppColors.Error, gblAppColors.Transparent)`.
 * Canvas twin only: the code app does not draw the icon (D148).
 */
export function environmentInfoColorCanvasParity(environmentName: string | undefined): string | undefined {
  switch (environmentName) {
    case "Dev": case "Hotfix": return palette.akzent5;
    case "Nightly": return palette.Warning;
    case "QA": return palette.akzent3;
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
