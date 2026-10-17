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
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { canOpenApplicationSettings, languageLabel } from "@/data/currentUser";
import {
  isSettingsPath, SETTINGS_HOME, settingsDocumentTitle, settingsPageTitle,
} from "@/app/navigation-settings";
import { AppShell, LoadingOverlay, EmptyState } from "@/components";
import { useSession } from "@/app/SessionContext";
import { useCurrentUser } from "@/app/useCurrentUser";
import { AppRoutes } from "@/app/routes";
import { lastError } from "@/platform/telemetry";
import { ReportProblemPanel } from "@/features/report-problem/ReportProblemPanel";

export default function App() {
  const { session, project, envVars, loading, error } = useSession();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [reportOpen, setReportOpen] = useState(false);
  /*
   * The badge's own two Dataverse rows, loaded once per session. Separate from `useSession` on
   * purpose: neither is needed to render a screen, so a slow or forbidden read of the Graph
   * virtual table behind `companyName` must not hold up the app's first paint.
   */
  const currentUser = useCurrentUser();

  const onSettingsScreen = isSettingsPath(pathname);
  /*
   * Parity round 1, G-2: the canvas hides every admin nav item from a non-admin (`ItemVisible`,
   * App:315-419). Until the user is known to be allowed — loading, denied or roles unreadable —
   * a settings URL shows neither the settings rail nor a settings page title; `SettingsGate`'s
   * message is the only content. The way out (logo / back arrow) stays.
   */
  const settingsAllowed = canOpenApplicationSettings(currentUser.data);
  const settingsTitle = onSettingsScreen && settingsAllowed ? settingsPageTitle(pathname) : undefined;

  /* The browser tab names the settings screen; the previous title comes back on leaving. */
  useEffect(() => {
    if (!settingsTitle) return undefined;
    const previous = document.title;
    document.title = settingsDocumentTitle(settingsTitle);
    return () => { document.title = previous; };
  }, [settingsTitle]);

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
  // Show the PM rail for any project-specific screen — /projects/new or /projects/:id/…
  // but NOT for the plain /projects overview list.
  const onPmProjectScreen = pathname.startsWith("/projects/") && pathname !== "/projects";
  const backToProjects = () => navigate("/projects");

  return (
    <AppShell
      showRail={onCostScreen || onPmProjectScreen || (onSettingsScreen && settingsAllowed)}
      rail={onSettingsScreen ? "settings" : onPmProjectScreen ? "pm" : "cost"}
      {...(settingsAllowed
        ? { onOpenSettings: () => navigate(SETTINGS_HOME) }
        : {})}
      {...(onCostScreen && project?.projectName ? { pageTitle: project.projectName } : {})}
      {...(onCostScreen && project?.approvalState
        ? { approvalState: project.approvalState }
        : {})}
      {...(onCostScreen && project?.approvalStateValue !== undefined
        ? { approvalStateValue: project.approvalStateValue }
        : {})}
      /*
       * Application Settings: the screen's title with no approval bar (it is not a project), and
       * the logo / back arrow as the way out — every admin screen's `OnLogoClick` is
       * `Navigate('Project Main Screen')` (01-entry-and-access §1.4, G7). Cost and PM screens
       * keep a plain logo.
       */
      {...(onSettingsScreen
        ? {
          hideApprovalState: true,
          onHome: backToProjects,
          ...(settingsTitle ? { pageTitle: settingsTitle } : {}),
        }
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
    >
      {error ? (
        <EmptyState
          title="The app could not finish starting"
          description={
            import.meta.env.DEV
              ? `DEV: ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`
              : "Please try opening the app again. If the problem continues, use Help to report it."
          }
          {...(onCostScreen || onSettingsScreen
            ? { action: { label: "Back to Projects", onClick: backToProjects } }
            : {})}
        />
      ) : (
        <AppRoutes />
      )}
      <ReportProblemPanel open={reportOpen} onDismiss={() => setReportOpen(false)} />
    </AppShell>
  );
}
