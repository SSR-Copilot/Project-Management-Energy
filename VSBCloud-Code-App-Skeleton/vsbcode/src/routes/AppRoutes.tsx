/**
 * Route table — the code-app equivalent of the canvas `Navigate()` graph.
 *
 * The navigation SEQUENCE is preserved:
 *   PM  StartScreen 'App Loading Screen' -> reads the `projectid` / `screen` launch
 *       parameters -> deep-links to General Data, or falls back to Project Main.
 *   Cost StartScreen 'Capex Costs Screen'.
 *
 * Project-scoped routes are guarded: without a selected project they redirect to the
 * portfolio list, which is what the canvas rail achieved by disabling its items.
 * Admin routes are guarded by `canSeeAdminSection` — note that the canvas apps had NO
 * server-side admin check at all (see Defects and open questions).
 */
import { lazy, Suspense, type ReactNode } from "react";
import { Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import { LoadingOverlay, SelectProjectPrompt, EmptyState } from "@/components";
import { useAppStore } from "@/store/appStore";
import { canSeeAdminSection } from "@/domain/session";
import { isNewProjectRequest } from "@/domain/navigation";

/* Project Management */
const AppLoading        = lazy(() => import("@/features/pm/app-loading/Screen"));
const ProjectMain       = lazy(() => import("@/features/pm/project-main/Screen"));
const GeneralData       = lazy(() => import("@/features/pm/general-data/Screen"));
const Milestones        = lazy(() => import("@/features/pm/milestones/Screen"));
const Team              = lazy(() => import("@/features/pm/team/Screen"));
const CheckList         = lazy(() => import("@/features/pm/checklist/Screen"));
const Planning          = lazy(() => import("@/features/pm/planning/Screen"));
const GridOperator      = lazy(() => import("@/features/pm/grid-operator/Screen"));
const Generators        = lazy(() => import("@/features/pm/generators/Screen"));
const Production        = lazy(() => import("@/features/pm/production/Screen"));
const Revenues          = lazy(() => import("@/features/pm/revenues/Screen"));
const Finance           = lazy(() => import("@/features/pm/finance/Screen"));

/* Administration */
const AdminChecklists   = lazy(() => import("@/features/admin/admin-default-checklists/Screen"));
const AdminGates        = lazy(() => import("@/features/admin/admin-gates-approvals/Screen"));
const AdminCapex        = lazy(() => import("@/features/admin/admin-capex-accounts/Screen"));
const AdminMilestones   = lazy(() => import("@/features/admin/admin-milestones/Screen"));
const AdminCost         = lazy(() => import("@/features/admin/admin-cost/Screen"));
const AdminContract     = lazy(() => import("@/features/admin/admin-contract/Screen"));

/* Project Costs */
const CapexCosts        = lazy(() => import("@/features/cost/capex-costs/Screen"));
const OpexCosts         = lazy(() => import("@/features/cost/opex-costs/Screen"));
const LandLease         = lazy(() => import("@/features/cost/land-lease/Screen"));
const Contracts         = lazy(() => import("@/features/cost/contracts/Screen"));
const AddCostsFromTable = lazy(() => import("@/features/cost/add-costs-from-table/Screen"));

/** Project-scoped guard. */
function RequireProject({ children }: { children: ReactNode }) {
  const project = useAppStore((s) => s.project.selected);
  const nav = useNavigate();
  const loc = useLocation();
  // GUIDE p10: General is also the New Project screen, so "+ Add Project" has to reach it
  // with no project selected. Every other project route still needs one.
  const creating = isNewProjectRequest(loc.pathname, loc.search);
  if (!project?.projectId && !creating) return <SelectProjectPrompt onGo={() => nav("/projects")} />;
  return <>{children}</>;
}

/** Admin guard. Client-side, like the canvas apps — but the server must reject too. */
function RequireAdmin({ children }: { children: ReactNode }) {
  const user = useAppStore((s) => s.session.user);
  if (!user) return <LoadingOverlay mode="inline" />;
  if (!canSeeAdminSection(user)) {
    return (
      <EmptyState
        title="Administration is not available to your account"
        description="These screens need the VSB - Application Administrator or VSB - Controller Own Data security role. Ask your administrator if you believe you should have access."
      />
    );
  }
  return <>{children}</>;
}

const P = ({ children }: { children: ReactNode }) => <RequireProject>{children}</RequireProject>;
const A = ({ children }: { children: ReactNode }) => <RequireAdmin>{children}</RequireAdmin>;

export function AppRoutes() {
  return (
    <Suspense fallback={<LoadingOverlay mode="inline" label="Loading screen…" />}>
      <Routes>
        <Route index element={<AppLoading />} />
        <Route path="projects" element={<ProjectMain />} />

        <Route path="project/general"       element={<P><GeneralData /></P>} />
        <Route path="project/milestones"    element={<P><Milestones /></P>} />
        <Route path="project/generators"    element={<P><Generators /></P>} />
        <Route path="project/production"    element={<P><Production /></P>} />
        <Route path="project/checklist"     element={<P><CheckList /></P>} />
        <Route path="project/team"          element={<P><Team /></P>} />
        <Route path="project/planning"      element={<P><Planning /></P>} />
        <Route path="project/grid-operator" element={<P><GridOperator /></P>} />
        <Route path="project/revenues"      element={<P><Revenues /></P>} />
        <Route path="project/finance"       element={<P><Finance /></P>} />

        <Route path="admin/default-checklists" element={<A><AdminChecklists /></A>} />
        <Route path="admin/gates-approvals"    element={<A><AdminGates /></A>} />
        <Route path="admin/capex-accounts"     element={<A><AdminCapex /></A>} />
        <Route path="admin/milestones"         element={<A><AdminMilestones /></A>} />
        <Route path="admin/cost"               element={<A><AdminCost /></A>} />
        <Route path="admin/contract"           element={<A><AdminContract /></A>} />

        <Route path="costs/capex"      element={<P><CapexCosts /></P>} />
        <Route path="costs/opex/om"    element={<P><OpexCosts mode="om" /></P>} />
        <Route path="costs/opex/other" element={<P><OpexCosts mode="other" /></P>} />
        <Route path="costs/land-lease" element={<P><LandLease /></P>} />
        <Route path="costs/contracts"  element={<P><Contracts /></P>} />
        <Route path="costs/add-from-table" element={<P><AddCostsFromTable /></P>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
