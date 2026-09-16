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

  if (loading) return <LoadingOverlay mode="blocking" label="Please wait..." />;

  const onCostScreen = pathname.startsWith("/costs/");

  return (
    <AppShell
      showRail={onCostScreen}
      {...(onCostScreen && project?.projectName ? { pageTitle: project.projectName } : {})}
      {...(session?.fullName ? { userName: session.fullName } : {})}
      {...(session?.userPrincipalName ? { userEmail: session.userPrincipalName } : {})}
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
