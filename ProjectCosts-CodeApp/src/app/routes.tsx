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
import { Navigate, Outlet, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import { EmptyState, LoadingOverlay } from "@/components";
import { useSession } from "./SessionContext";
import { costLocation, launchCostPath, launchPmPath } from "./deepLinks";

const ProjectOverviewScreen = lazy(() => import("@/features/pm/project-main/Screen"));
const ContractsScreen = lazy(() => import("@/features/cost/contracts/Screen"));
const CapexCostsScreen = lazy(() => import("@/features/cost/capex-costs/Screen"));
const OpexCostsScreen = lazy(() => import("@/features/cost/opex-costs/Screen"));
const LandLeaseScreen = lazy(() => import("@/features/cost/land-lease/Screen"));
const AddCostsFromTableScreen = lazy(() => import("@/features/cost/add-costs-from-table/Screen"));

/*
 * Project Management — each screen's `hooks.ts` says what it reads and writes; anything not wired
 * yet is listed in `data/notConnected.ts`.
 */
const GeneralDataScreen = lazy(() => import("@/features/pm/general-data/Screen"));
const MilestonesScreen = lazy(() => import("@/features/pm/milestones/Screen"));
const GeneratorsScreen = lazy(() => import("@/features/pm/generators/Screen"));
const ProductionScreen = lazy(() => import("@/features/pm/production/Screen"));
const CheckListScreen = lazy(() => import("@/features/pm/checklist/Screen"));
const TeamScreen = lazy(() => import("@/features/pm/team/Screen"));
const PlanningScreen = lazy(() => import("@/features/pm/planning/Screen"));
const GridOperatorScreen = lazy(() => import("@/features/pm/grid-operator/Screen"));
const RevenuesScreen = lazy(() => import("@/features/pm/revenues/Screen"));
const FinanceScreen = lazy(() => import("@/features/pm/finance/Screen"));

/* Administration — UI built, not connected to Dataverse yet. */
const AdminChecklistsScreen = lazy(() => import("@/features/admin/admin-default-checklists/Screen"));
const AdminGatesScreen = lazy(() => import("@/features/admin/admin-gates-approvals/Screen"));
const AdminCapexAccountsScreen = lazy(() => import("@/features/admin/admin-capex-accounts/Screen"));
const AdminMilestonesScreen = lazy(() => import("@/features/admin/admin-milestones/Screen"));
const AdminCostScreen = lazy(() => import("@/features/admin/admin-cost/Screen"));
const AdminContractScreen = lazy(() => import("@/features/admin/admin-contract/Screen"));

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
  // `Edit Project` opens a new tab with `pmScreen` + `projectId` launch parameters
  // (`projectAppUrl`); it lands on that PM screen rather than on the cost module.
  const pmPath = launchPmPath(session?.launchParams ?? {}, window.location.search);
  if (projectId && pmPath) {
    return <Navigate replace to={{ pathname: pmPath, search: `?${new URLSearchParams({ projectId })}` }} />;
  }
  return <Navigate replace to={projectId
    ? costLocation(launchCostPath(session?.launchParams ?? {}, window.location.search), projectId)
    : "/projects"} />;
}

/** No Cost screen mounts or starts its queries before a readable project is loaded. */
export function CostProjectGate() {
  const { project, projectId, projectIdInvalid, projectNotFound, loading, error } = useSession();
  const navigate = useNavigate();
  const action = { label: "Back to Projects", onClick: () => navigate("/projects") };
  /*
   * No canvas control; code-app route spinner. D57 had turned the Cost gate's "Loading project…"
   * spinner into an empty placeholder, which left a blank screen (D59 restores it). The gate still
   * holds back every Cost screen (and its queries) until the session and the project are loaded.
   */
  if (loading) return <LoadingOverlay mode="inline" label="Loading project…" testId="cost-project-loading" />;
  if (projectIdInvalid) return <EmptyState title="This project link is invalid"
    description="Return to the project list and open Costs for a selected project." action={action} />;
  if (!projectId) return <EmptyState title="Select a project to open Costs"
    description="Open Costs from the project list." action={action} />;
  if (error) return <EmptyState title="The project could not be loaded"
    description="Return to the project list and try again." action={action} />;
  if (projectNotFound || !project) return <EmptyState title="Project unavailable"
    description="The project could not be found or you do not have access to it." action={action} />;
  /*
   * No canvas control; code-app route spinner. The Cost subtree keeps its own Suspense boundary,
   * so the lazy Cost chunk (Add Cost from Table, Contracts, ...) shows a spinner while it downloads
   * instead of the blank screen D57's empty fallback left (D59). Same text as the shared one
   * (`AppRoutes`).
   */
  return (
    <Suspense fallback={<LoadingOverlay mode="inline" label="Loading screen…" testId="cost-screen-loading" />}>
      <Outlet />
    </Suspense>
  );
}

/**
 * The New Project screens: General Data with NO project is the New Project form (`addProject`
 * blanks `gblRecordSelectedProject` and navigates there), and Milestones / Generator / Production /
 * Cluster Check List / Team / Planning / Grid Operator / Revenues / Finance open on their page-lock banner ("• General" not saved
 * yet) instead of asking for a project. Production and Cluster Check List added 28 Oct 2026: both
 * screens already had the locked New Project mode, but the gate never let them through.
 */
const NEW_PROJECT_PATHS = new Set([
  "/project/general", "/project/milestones", "/project/generators", "/project/production",
  "/project/checklist", "/project/team", "/project/grid-operator",
  // Planning, Revenues and Finance open locked too in the canvas's New Project mode (PO, 28 Oct 2026).
  "/project/planning", "/project/revenues", "/project/finance",
]);

/**
 * Project Management screens need a selected project, exactly like the cost screens — except the
 * New Project screens above.
 */
export function ProjectScreenGate() {
  const { project, projectId, projectIdInvalid, projectNotFound, loading, error } = useSession();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const action = { label: "Back to Projects", onClick: () => navigate("/projects") };
  if (loading) return <LoadingOverlay mode="inline" label="Loading project…" />;
  if (projectIdInvalid) return <EmptyState title="This project link is invalid"
    description="Return to the project list and open the project again." action={action} />;
  if (!projectId) {
    if (NEW_PROJECT_PATHS.has(pathname)) return <Outlet />;
    return <EmptyState title="Select a project" description="Open a project from the project list." action={action} />;
  }
  if (error) return <EmptyState title="The project could not be loaded"
    description="Return to the project list and try again." action={action} />;
  if (projectNotFound || !project) return <EmptyState title="Project unavailable"
    description="The project could not be found or you do not have access to it." action={action} />;
  return <Outlet />;
}

/** `/projects/:projectId/general` (the overview's Edit Project target) → the PM route shape. */
function LegacyGeneralDataRedirect() {
  const { projectId } = useParams<{ projectId: string }>();
  return <Navigate replace to={{ pathname: "/project/general", search: `?${new URLSearchParams({ projectId: projectId ?? "" })}` }} />;
}

export function AppRoutes() {
  return (
    <Suspense fallback={<LoadingOverlay mode="inline" label="Loading screen…" />}>
      <Routes>
        <Route index element={<Landing />} />
        <Route path="projects" element={<ProjectOverviewScreen />} />
        {/*
          The two Project Management destinations the overview's command bar navigates to
          (`NEW_PROJECT_PATH`, `projectGeneralDataPath`). They stay stable links and redirect to
          the PM route shape, `/project/general[?projectId=]` — General Data with no project is
          the New Project screen. It saves through `useGeneralDataWrites`
          (`features/pm/general-data/hooks.ts`), which creates the project in Dataverse.

          `projects/new` is declared BEFORE `projects/:projectId/general` so the literal wins;
          React Router ranks static segments above dynamic ones, but the order also makes the
          intent readable.
        */}
        <Route path="projects/new" element={<Navigate replace to="/project/general" />} />
        <Route path="projects/:projectId/general" element={<LegacyGeneralDataRedirect />} />
        <Route path="costs" element={<CostProjectGate />}>
          <Route index element={<Landing />} />
          <Route path="capex" element={<CapexCostsScreen />} />
          <Route path="opex/om" element={<OpexCostsScreen mode="om" />} />
          <Route path="opex/other" element={<OpexCostsScreen mode="other" />} />
          <Route path="land-lease" element={<LandLeaseScreen />} />
          <Route path="contracts" element={<ContractsScreen />} />
          <Route path="add-from-table" element={<AddCostsFromTableScreen />} />
        </Route>
        <Route path="project" element={<ProjectScreenGate />}>
          <Route path="general" element={<GeneralDataScreen />} />
          <Route path="milestones" element={<MilestonesScreen />} />
          <Route path="generators" element={<GeneratorsScreen />} />
          <Route path="production" element={<ProductionScreen />} />
          <Route path="checklist" element={<CheckListScreen />} />
          <Route path="team" element={<TeamScreen />} />
          <Route path="planning" element={<PlanningScreen />} />
          <Route path="grid-operator" element={<GridOperatorScreen />} />
          <Route path="revenues" element={<RevenuesScreen />} />
          <Route path="finance" element={<FinanceScreen />} />
        </Route>
        <Route path="admin">
          <Route path="default-checklists" element={<AdminChecklistsScreen />} />
          <Route path="gates-approvals" element={<AdminGatesScreen />} />
          <Route path="capex-accounts" element={<AdminCapexAccountsScreen />} />
          <Route path="milestones" element={<AdminMilestonesScreen />} />
          <Route path="cost" element={<AdminCostScreen />} />
          <Route path="contract" element={<AdminContractScreen />} />
          <Route index element={<Navigate replace to="/admin/default-checklists" />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
