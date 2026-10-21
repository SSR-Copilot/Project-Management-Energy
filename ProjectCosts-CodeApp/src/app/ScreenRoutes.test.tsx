// @vitest-environment jsdom
/**
 * UT-ROUTES — the Administration and Project Management screens are reachable through the
 * app's own route table (`app/routes.tsx`), behind the project gate. A screen that is not
 * connected yet renders its not-connected notice (`data/notConnected.ts`); a connected one
 * (Default Checklists, Gates Approvals, CAPEX Accounts, Milestones — 19 Oct 2026; PM General Data, PM Milestones, PM Generators, PM Production, PM Checklist, PM Team, PM Planning, PM Grid Operator, PM Revenues and PM Finance) renders its heading, with its data modules
 * mocked so nothing reaches Dataverse.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FluentProvider } from "@fluentui/react-components";
import { useLocation } from "react-router-dom";
import { DataMemoryRouter as MemoryRouter } from "@/test/DataMemoryRouter";
import { vsbTheme } from "@/theme/fluent";
import type { ProjectContext } from "@/features/cost/contracts/rules";
import { AppRoutes } from "./routes";

const PROJECT_ID = "11111111-2222-3333-4444-555555555555";
let session: { project?: ProjectContext; projectId?: string } = {};

vi.mock("@/app/SessionContext", () => ({
  useSession: () => ({ ...session, locale: "en-GB", loading: false, envVars: {} }),
  useProject: () => session.project,
}));

vi.mock("@/app/useCurrentUser", () => ({ useAdminAccess: () => true, useCurrentUser: () => ({ data: undefined }) }));
vi.mock("@/data/generalData", () => ({
  loadGeneralDataProject: async () => null, listGeneralDataCountries: async () => [], listCountryAreas: async () => [],
  listProjectStates: async () => [], listTerrainUtilizations: async () => [], listShareholders: async () => [],
  listStateTrackings: async () => [], searchGermanMunicipalities: async () => [], searchFrenchMunicipalities: async () => [],
  lookupGermanTradeTaxRate: async () => null, MUNICIPALITY_SEARCH_TOP: 50,
}));
vi.mock("@/data/milestones", () => ({
  loadMilestoneProject: async () => null, countIndividualVolumeContracts: async () => 0,
  countProjectRevenues: async () => 0, loadPriceInflation: async () => ({ current: null, previous: null }),
  listProjectGeneratorsForRepricing: async () => [], isMilestoneRecalculationRunning: async () => false,
}));
vi.mock("@/data/generators", () => ({
  loadGeneratorsProject: async () => null, loadProjectPlanning: async () => null, listOrderableGenerators: async () => [],
  listGeneratorsByIds: async () => [], listGeneratorTypes: async () => [], listProjectTurbines: async () => [],
  listPvModules: async () => [], listPvTypes: async () => [], listInverterTypes: async () => [],
  listSubstructureTypes: async () => [], listSimpleTypes: async () => [], listAllWtgLandLeaseCosts: async () => [],
  loadDeviceCosts: async () => ({ modules: null, inverter: null, mountingFix: null, mountingTracker: null }),
  loadTypeName: async () => "", listDeviceTypes: async () => [], listOpexCostIds: async () => [],
  loadOpexDependency: async () => ({ hasActiveDeviceType: false, hasActiveOpexCost: false }),
  findPvUnit: async () => null, loadTurbineAllocations: async () => ({ allocations: [], countByCost: {} }),
}));
vi.mock("@/data/production", () => ({
  loadProductionProject: async () => null, listEnergyYields: async () => [], loadStoredSeasonality: async () => null,
  listStoredNegativePrices: async () => [], listProjectRevenues: async () => [], loadGenerationInputs: async () => null,
}));
vi.mock("@/data/checklist", () => ({
  loadChecklistProject: async () => null, listChecklistProjectStates: async () => [], listChecklistTrackings: async () => [],
  listChecklistGates: async () => [], listClusterChecklist: async () => [], countClusterChecklistRows: async () => 0,
  listClusterTemplates: async () => [], listChecklistApprovalSettings: async () => [], listHistory: async () => [],
}));
vi.mock("@/data/team", () => ({
  loadTeamProject: async () => null, listTeamMembers: async () => [], listMemberDescriptions: async () => [],
}));
vi.mock("@/data/planning", () => ({
  loadPlanningProject: async () => null, loadProjectPlanning: async () => null, listPermits: async () => [],
  listAquisitionTypes: async () => [], listAquisitionStatuses: async () => [], listCustomChoiceValues: async () => [],
}));
vi.mock("@/data/gridOperator", () => ({ loadGridOperator: async () => null }));
vi.mock("@/data/revenues", () => ({
  loadRevenueProject: async () => null, listRevenueContracts: async () => [], listBalancingPrices: async () => [],
  listIndividualVolumes: async () => [], listIndividualVolumeIds: async () => [], hasNegativePriceProduction: async () => false,
  loadFirstRevenueSubaccount: async () => null, findCurrency: async () => null, listRevenueCountryInflation: async () => [],
  listOverlappingContracts: async () => [],
}));
vi.mock("@/data/finance", () => ({
  loadFinanceProject: async () => null, listFinancingCategories: async () => [], listFinancingInputs: async () => [],
  listRepaymentAmounts: async () => [], listStepUpMargins: async () => [], loadTotalDevexCapex: async () => 0,
  countActiveTurbines: async () => 0, findFinancingInputsByKey: async () => [],
}));
vi.mock("@/data/adminDefaultChecklists", () => ({
  listChecklistScopes: async () => [], listChecklistGates: async () => [], listScopeTasks: async () => [],
  listTaskApprovals: async () => [], highestTaskOrder: async () => null,
}));
vi.mock("@/data/adminMilestones", () => ({
  listMilestoneCountries: async () => [], listCountryAssumptions: async () => [],
}));
vi.mock("@/data/adminGatesApprovals", () => ({
  listGateCountries: async () => [], listGateStates: async () => [], listGateApprovals: async () => [],
  findScopeCountryTechId: async () => null, listScopeChecklistItems: async () => [],
  listChecklistApprovals: async () => [], searchEntraPeople: async () => [],
  getEntraPeople: async () => new Map(), PEOPLE_SEARCH_TOP: 25,
}));
vi.mock("@/data/adminCapexAccounts", () => ({
  listAllCapexAccounts: async () => [], listCapexContractRefs: async () => [],
  listCascadeCosts: async () => [], capexNumberExists: async () => false,
}));
vi.mock("@/data/adminCost", () => ({
  listCostCountries: async () => [], listOpexSubaccounts: async () => [], listLandLeaseSubaccounts: async () => [],
  listOpexAssumptions: async () => [], listDevexCosts: async () => [], listSpvDevCoMapping: async () => [],
  listInflationAreas: async () => [], listCostCurrencies: async () => [],
}));
vi.mock("@/data/adminContract", () => ({
  listContractCountries: async () => [], listBopContracts: async () => [], listDevCoCosts: async () => [],
}));

/** The heading each CONNECTED admin screen renders; the others still show the notice. */
const CONNECTED_HEADING: Record<string, string> = {
  "default-checklists": "Checklist settings",
  "gates-approvals": "Project Gates",
  "capex-accounts": "CAPEX Accounts",
  milestones: "Milestones",
  contract: "Contracts",
  cost: "Costs",
};

/** The heading each CONNECTED Project Management screen renders (General Data — D25, Revenues — D33). */
const CONNECTED_PROJECT_HEADING: Record<string, string> = {
  general: "Basic Information", // the "General" band is removed (PO N6, 21 Oct 2026)
  revenues: "Revenue",
};

/** A connected PM screen whose canvas has no heading: a control it renders instead (Milestones — D26, Generators — D27, Production — D28, Checklist — D29, Team — D30, Planning — D31, Grid Operator — D32, Finance — D34). */
const CONNECTED_PROJECT_TESTID: Record<string, string> = {
  milestones: "pcf_btn_Milestones_DisplayProject_Body_Buttons_Save",
  generators: "Project Generators Screen",
  production: "Project Production Screen",
  checklist: "Project General CheckList Screen",
  team: "Project General Team Screen",
  planning: "Project Planning Screen",
  "grid-operator": "Grid Operator Screen",
  finance: "Project Finance Screen",
};

const PROJECT = { projectId: PROJECT_ID, projectName: "Test Wind Park" } as unknown as ProjectContext;

function Where() {
  const { pathname, search } = useLocation();
  return <output data-testid="where">{`${pathname}${search}`}</output>;
}

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <FluentProvider theme={vsbTheme}>
        <MemoryRouter initialEntries={[path]}>
          <AppRoutes />
          <Where />
        </MemoryRouter>
      </FluentProvider>
    </QueryClientProvider>,
  );
}

const ADMIN = ["default-checklists", "gates-approvals", "capex-accounts", "milestones", "cost", "contract"];
const PROJECT_SCREENS = [
  "general", "milestones", "generators", "production", "checklist", "team", "planning",
  "grid-operator", "revenues", "finance",
];

describe("UT-ROUTES — Administration", () => {
  beforeEach(() => { session = {}; });
  ADMIN.forEach((slug, i) => {
    const heading = CONNECTED_HEADING[slug];
    it(`UT-ROUTES-${String(i + 1).padStart(3, "0")} /admin/${slug} renders${heading ? " (connected)" : ", not connected"}`, async () => {
      renderAt(`/admin/${slug}`);
      if (heading) {
        expect(await screen.findByRole("heading", { name: heading }, { timeout: 20_000 })).toBeTruthy();
      } else {
        expect(await screen.findByTestId("not-connected-notice", {}, { timeout: 20_000 })).toBeTruthy();
      }
    }, 30_000);
  });

  it("UT-ROUTES-007 /admin lands on Check List Settings", async () => {
    renderAt("/admin");
    expect(await screen.findByRole("heading", { name: "Checklist settings" }, { timeout: 20_000 })).toBeTruthy();
    expect(screen.getByTestId("where").textContent).toBe("/admin/default-checklists");
  }, 30_000);
});

describe("UT-ROUTES — Project Management", () => {
  beforeEach(() => { session = { project: PROJECT, projectId: PROJECT_ID }; });
  PROJECT_SCREENS.forEach((slug, i) => {
    const heading = CONNECTED_PROJECT_HEADING[slug];
    const testId = CONNECTED_PROJECT_TESTID[slug];
    it(`UT-ROUTES-${String(i + 8).padStart(3, "0")} /project/${slug} renders${heading || testId ? " (connected)" : ", not connected"}`, async () => {
      renderAt(`/project/${slug}?projectId=${PROJECT_ID}`);
      if (heading) {
        expect(await screen.findByRole("heading", { name: heading }, { timeout: 20_000 })).toBeTruthy();
      } else if (testId) {
        expect(await screen.findByTestId(testId, {}, { timeout: 20_000 })).toBeTruthy();
        expect(screen.queryByTestId("not-connected-notice")).toBeNull();
      } else {
        expect(await screen.findByTestId("not-connected-notice", {}, { timeout: 20_000 })).toBeTruthy();
      }
    }, 30_000);
  });

  it("UT-ROUTES-018 a project screen without a project asks for one", async () => {
    session = {};
    renderAt("/project/milestones");
    expect(await screen.findByText("Select a project")).toBeTruthy();
    expect(screen.queryByTestId("not-connected-notice")).toBeNull();
  });

  it("UT-ROUTES-019 General Data without a project is the New Project screen", async () => {
    session = {};
    renderAt("/project/general");
    expect(await screen.findByRole("heading", { name: "New Project" }, { timeout: 20_000 })).toBeTruthy();
  }, 30_000);

  it("UT-ROUTES-020 the overview's Edit Project link redirects to the PM route shape", async () => {
    renderAt(`/projects/${PROJECT_ID}/general`);
    await screen.findByRole("heading", { name: "Basic Information" }, { timeout: 20_000 });
    expect(screen.getByTestId("where").textContent).toBe(`/project/general?projectId=${PROJECT_ID}`);
  }, 30_000);

  it("UT-ROUTES-021 the overview's Add Project link opens General Data with no project", async () => {
    session = {};
    renderAt("/projects/new");
    await screen.findByRole("heading", { name: "New Project" }, { timeout: 20_000 });
    expect(screen.getByTestId("where").textContent).toBe("/project/general");
  }, 30_000);
});
