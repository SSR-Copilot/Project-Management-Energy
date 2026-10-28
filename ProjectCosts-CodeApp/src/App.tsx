/**
 * The app frame: the shell wrapping the routes.
 *
 * Two things are decided here rather than per screen:
 *
 *  - **the rail.** The project overview has no left rail; the five cost screens do. That is
 *    the canvas layout (the overview's own header has no `cmp_Left_Navigation` child) and
 *    also the sensible one — the widest grid in the app should not give up 200 px, and cost
 *    sections mean nothing before a project is chosen.
 *  - **the page title.** The cost screens put the project name in the header band; the
 *    overview does not, because no project is selected yet.
 */
import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { languageLabel } from "@/data/currentUser";
import { useCurrentUser } from "@/app/useCurrentUser";
import { AppShell, LoadingOverlay, EmptyState, pmHeaderTitle } from "@/components";
import { useSession } from "@/app/SessionContext";
import { AppRoutes } from "@/app/routes";
import { adminEntriesVisible } from "@/app/adminAccess";
import { adminPageTitle } from "@/app/adminTitles";
import { lastError } from "@/platform/telemetry";
import { ReportProblemPanel } from "@/features/shared/report-problem/ReportProblemPanel";

export default function App() {
  const { session, project, projectId, envVars, loading, error } = useSession();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [reportOpen, setReportOpen] = useState(false);
  /*
   * The badge's own two Dataverse rows, loaded once per session. Separate from `useSession` on
   * purpose: neither is needed to render a screen, so a slow or forbidden read of the Graph
   * virtual table behind `companyName` must not hold up the app's first paint.
   */
  const currentUser = useCurrentUser();

  if (loading) return <LoadingOverlay mode="blocking" label="Please wait..." />;

  /*
   * The header name is the DATAVERSE one, falling back to the host's. `User().FullName` — what
   * the canvas pill shows — is the systemuser row ("Shakti Singh Rajput"), while
   * `getContext().user.fullName` is the Entra display name, which at VSB reads
   * "Singh Rajput, Shakti (external)". Same person, and the header was showing the wrong string.
   */
  const userName = currentUser.data?.fullName ?? session?.fullName;
  const userEmail = currentUser.data?.mail ?? session?.userPrincipalName;
  const userLanguage = languageLabel(navigator.language);

  const onCostScreen = pathname.startsWith("/costs/");
  /*
   * The Project Management and administration screens carry the rail too (`LeftNav` picks the
   * item set from the path). PM screens show the selected project in the header like the cost
   * screens; the admin screens are not project-scoped.
   */
  const onProjectScreen = pathname.startsWith("/project/");
  const showRail = onCostScreen || onProjectScreen || pathname.startsWith("/admin/");
  const showsProject = onCostScreen || onProjectScreen;
  const onAdminScreen = pathname.startsWith("/admin/");
  /*
   * Shell parity (20 Oct 2026): the PM and admin screens' `cmp_Header` shows a back arrow
   * (`Image3`, `OnLogoClick` → `Navigate('Project Main Screen')`), and on PM screens the name
   * reads "New Project" with no project selected and carries the Cluster State line under it.
   * Through the router, so the unsaved-changes guard (`useBlocker`) still gets its say.
   */
  const pageTitle = onProjectScreen ? pmHeaderTitle(projectId, project?.projectName)
    : showsProject ? project?.projectName || undefined : adminPageTitle(pathname);
  /* The two admin role flags, with the local-run bypass (`app/adminAccess.ts`). */
  const adminVisible = adminEntriesVisible(currentUser.data);

  return (
    <AppShell
      showRail={showRail}
      contentScrolls={onProjectScreen || onAdminScreen}
      {...(pageTitle ? { pageTitle } : {})}
      {...(onProjectScreen && project?.clusterStateName ? { projectStatus: project.clusterStateName } : {})}
      {...(onProjectScreen || onAdminScreen ? { onBack: () => navigate("/projects") } : {})}
      {...(showsProject && project?.approvalState
        ? { approvalState: project.approvalState }
        : {})}
      {...(userName ? { userName } : {})}
      {...(userEmail ? { userEmail } : {})}
      {...(currentUser.data?.photo ? { userPhoto: currentUser.data.photo } : {})}
      {...(userLanguage ? { userLanguage } : {})}
      {...(currentUser.data?.companyName
        ? { userBusinessUnit: currentUser.data.companyName }
        : {})}
      /*
       * The badge's AddHome row is `$"{Concat(gblCurrentUser.EditableCounties, $"{name}; ")}"`
       * — one entry per qualifying role, trailing separator and all, which is why the canvas
       * reference reads "France; France; Germany;".
       */
      {...(currentUser.data?.editableCountries.length
        ? { userCountries: `${currentUser.data.editableCountries.join("; ")};` }
        : {})}
      /* Its World row is a fixed label, shown on `IsProjectDataAllCountries`. */
      {...(currentUser.data?.isProjectDataAllCountries
        ? { userDataScope: "Project Data All Countries" }
        : {})}
      {...(envVars.vsb_AppVersion ? { appVersion: envVars.vsb_AppVersion } : {})}
      {...(envVars.vsb_EnvironmentName ? { environmentName: envVars.vsb_EnvironmentName } : {})}
      {...(envVars.vsb_VSBCloudInfoCenterUrl
        ? { infoCenterUrl: envVars.vsb_VSBCloudInfoCenterUrl }
        : {})}
      hasError={Boolean(error) || Boolean(lastError())}
      onReportProblem={() => setReportOpen(true)}
      /*
       * `cmp_Header` user menu, `appSettingsKey` → `Navigate('Admin Project Default Checklists Screen')`,
       * `ItemVisible: Or(IsApplicationAdministrator, IsControllerOwnData)` — see `app/adminAccess.ts`.
       */
      {...(adminVisible ? { onAppSettings: () => navigate("/admin/default-checklists") } : {})}
      adminVisible={adminVisible}
    >
      {error ? (
        <EmptyState
          title="The app could not finish starting"
          description={
            import.meta.env.DEV
              ? `DEV: ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`
              : "Please try opening the app again. If the problem continues, use Help to report it."
          }
          {...(onCostScreen ? { action: { label: "Back to Projects", onClick: () => navigate("/projects") } } : {})}
        />
      ) : (
        <AppRoutes />
      )}
      <ReportProblemPanel open={reportOpen} onDismiss={() => setReportOpen(false)} />
    </AppShell>
  );
}
