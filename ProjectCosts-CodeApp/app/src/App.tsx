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
import { useQuery } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import { languageLabel, loadCurrentUser } from "@/data/currentUser";
import { AppShell, LoadingOverlay, EmptyState } from "@/components";
import { useSession } from "@/app/SessionContext";
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
  const currentUser = useQuery({
    queryKey: ["current-user", session?.entraObjectId ?? ""],
    enabled: Boolean(session?.entraObjectId),
    staleTime: Infinity,
    queryFn: () => loadCurrentUser(session?.entraObjectId),
  });

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

  return (
    <AppShell
      showRail={onCostScreen}
      {...(onCostScreen && project?.projectName ? { pageTitle: project.projectName } : {})}
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
          description="Please try opening the app again. If the problem continues, use Help to report it."
          {...(onCostScreen ? { action: { label: "Back to Projects", onClick: () => navigate("/projects") } } : {})}
        />
      ) : (
        <AppRoutes />
      )}
      <ReportProblemPanel open={reportOpen} onDismiss={() => setReportOpen(false)} />
    </AppShell>
  );
}
