/**
 * Pure rules for `AppHeader`. Kept out of the component file so it exports components only.
 */
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
