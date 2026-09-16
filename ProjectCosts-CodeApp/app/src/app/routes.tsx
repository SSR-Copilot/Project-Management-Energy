/**
 * The route table — the code-app replacement for the canvas navigation graph.
 *
 * The canvas Cost app had `StartScreen: 'Capex Costs Screen'` and moved between its five
 * screens by toggling container visibility from the rail's `SelectedKey`, with only
 * `Navigate('Capex Costs Screen')` ever called. Real routes give the browser back button,
 * middle-click and bookmarking for free.
 *
 * **`/` is the Main Project Overview**, not a cost screen. The Cost app used to be reachable
 * only by deep link from Project Management; now it lands on the project list and `Edit Costs`
 * is the way in. A deep link that already carries a `projectId` still goes straight to the
 * cost screens, so the existing PM → Cost link keeps working unchanged.
 */
import { lazy, Suspense } from "react";
import { Navigate, Outlet, Route, Routes, useNavigate } from "react-router-dom";
import { EmptyState, LoadingOverlay } from "@/components";
import { useSession } from "./SessionContext";
import { costLocation, launchCostPath } from "./deepLinks";

const ProjectOverviewScreen = lazy(() => import("@/features/project-overview/Screen"));
const ContractsScreen = lazy(() => import("@/features/contracts/Screen"));
const CapexCostsScreen = lazy(() => import("@/features/capex-costs/Screen"));
const OpexCostsScreen = lazy(() => import("@/features/opex-costs/Screen"));
const LandLeaseScreen = lazy(() => import("@/features/land-lease/Screen"));
const AddCostsFromTableScreen = lazy(() => import("@/features/add-costs-from-table/Screen"));

/**
 * The landing route.
 *
 * With a `projectId` already on the URL the app was deep-linked from Project Management, so
 * it goes straight to the cost module and the project list is skipped. Without one, the
 * project list IS the landing screen.
 */
function Landing() {
  const { session, projectId, projectIdInvalid, loading } = useSession();
  if (loading) return <LoadingOverlay mode="inline" label="Loading project…" />;
  if (projectIdInvalid) return <CostProjectGate />;
  return <Navigate replace to={projectId
    ? costLocation(launchCostPath(session?.launchParams ?? {}, window.location.search), projectId)
    : "/projects"} />;
}

/** No Cost screen mounts or starts its queries before a readable project is loaded. */
export function CostProjectGate() {
  const { project, projectId, projectIdInvalid, projectNotFound, loading, error } = useSession();
  const navigate = useNavigate();
  const action = { label: "Back to Projects", onClick: () => navigate("/projects") };
  if (loading) return <LoadingOverlay mode="inline" label="Loading project…" />;
  if (projectIdInvalid) return <EmptyState title="This project link is invalid"
    description="Return to the project list and open Costs for a selected project." action={action} />;
  if (!projectId) return <EmptyState title="Select a project to open Costs"
    description="Open Costs from the project list." action={action} />;
  if (error) return <EmptyState title="The project could not be loaded"
    description="Return to the project list and try again." action={action} />;
  if (projectNotFound || !project) return <EmptyState title="Project unavailable"
    description="The project could not be found or you do not have access to it." action={action} />;
  return <Outlet />;
}

export function AppRoutes() {
  return (
    <Suspense fallback={<LoadingOverlay mode="inline" label="Loading screen…" />}>
      <Routes>
        <Route index element={<Landing />} />
        <Route path="projects" element={<ProjectOverviewScreen />} />
        <Route path="costs" element={<CostProjectGate />}>
          <Route index element={<Landing />} />
          <Route path="capex" element={<CapexCostsScreen />} />
          <Route path="opex/om" element={<OpexCostsScreen mode="om" />} />
          <Route path="opex/other" element={<OpexCostsScreen mode="other" />} />
          <Route path="land-lease" element={<LandLeaseScreen />} />
          <Route path="contracts" element={<ContractsScreen />} />
          <Route path="add-from-table" element={<AddCostsFromTableScreen />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
