// @vitest-environment jsdom
/**
 * Render counts of the Project Gates grid (D162 B5, FE-AD-01 and FE-AD-06). The screen is mounted as in `Screen.test.tsx`
 * (repository and `executePlan` mocked) under the app's own structural sharing, and `probeRender` counts every gate row
 * (`GateRow:<state id>`), task row (`GateTaskRow:<approval id>`) and the table itself (`GateTable`).
 *
 * Before FE-AD-01 the table was one component: a status-pill click rendered every row of the grid about five times
 * (track, optimistic set, success, refetch, untrack), and opening an editor rendered all of them again.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, configure, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FluentProvider } from "@fluentui/react-components";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

configure({ asyncUtilTimeout: 5000 });
const TEST_TIMEOUT = 20_000;

const repo = vi.hoisted(() => ({ loadDataset: vi.fn(), searchPeople: vi.fn(), resolvePeople: vi.fn() }));
vi.mock("@/data/adminGatesApprovals", () => ({ projectGatesRepository: repo }));

const states = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock("@/data/projectStatesRead", () => ({ listProjectStates: states.list }));

const exec = vi.hoisted(() => vi.fn());
vi.mock("@/data/executePlan", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/data/executePlan")>()),
  executePlan: exec,
}));

vi.mock("@/app/useCurrentUser", () => ({ useAdminAccess: () => true }));

const countriesService = vi.hoisted(() => ({ getAll: vi.fn() }));
vi.mock("@/generated/services/Vsb_countriesService", () => ({ Vsb_countriesService: countriesService }));

/** FE-AD-06: the real parser factory, counted. */
const parserFactory = vi.hoisted(() => ({ calls: 0 }));
vi.mock("./rules", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./rules")>();
  return {
    ...actual,
    createPeopleParser: (...args: Parameters<typeof actual.createPeopleParser>) => {
      parserFactory.calls += 1;
      return actual.createPeopleParser(...args);
    },
  };
});

import { structuralSharingWithDates } from "@/app/queryStructuralSharing";
import { AppToaster } from "@/components";
import type { GatesDataset } from "@/data/adminGatesApprovals";
import { countRenders, type RenderCounts } from "@/test/renderCounts";
import { vsbTheme } from "@/theme/fluent";
import {
  asSharedStates, FIXTURE_APPROVALS, FIXTURE_CHECKLISTS, FIXTURE_COUNTRY_ROWS, FIXTURE_STATES, FIXTURE_TEMPLATES,
  fixtureDataset, person,
} from "./fixtures";
import ProjectGatesSettingsScreen from "./Screen";

/** The participant JSON as `fixtures.ts` writes it. */
const json = (people: ReturnType<typeof person>[]) =>
  JSON.stringify(people.map((p) => ({ PersonaKey: p.entraId, PersonaName: p.name, PersonaRole: p.mail })));

/** Three task rows under two gates (the fixture has one). */
const APPROVALS = [
  ...FIXTURE_APPROVALS,
  { ...FIXTURE_APPROVALS[0]!, id: "60000000-0000-0000-0000-000000000002", name: "Land lease signed", checklistId: FIXTURE_CHECKLISTS[0]!.id, approvers: json([person(4)]) },
  { ...FIXTURE_APPROVALS[0]!, id: "60000000-0000-0000-0000-000000000003", name: "Permit filed", checklistId: FIXTURE_CHECKLISTS[2]!.id, gateActive: true },
];
const TASK = APPROVALS[0]!.id;
const dataset = (over: Partial<GatesDataset> = {}) => fixtureDataset({ approvals: APPROVALS, ...over });

const stateIdOf = (order: number) => FIXTURE_STATES.find((s) => s.order === order)!.id;
const GATE_ROWS = [0, 1, 2, 3, 4, 5].map(stateIdOf);
const taskPill = (id: string) => screen.getByTestId(`btn_Admin_ProjectGates_DefaultClusterApproval_Item_ChecklistDefaultApproval_Item_ToggleStatus-${id}`);
const gatePill = (order: number) => screen.getByTestId(`btn_Admin_ProjectGates_DefaultClusterApproval_Item_ToggleStauts-${stateIdOf(order)}`);

function Harness({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, structuralSharing: structuralSharingWithDates }, mutations: { retry: false } },
  });
  return (
    <FluentProvider theme={vsbTheme}>
      <QueryClientProvider client={client}>
        <AppToaster />
        {children}
      </QueryClientProvider>
    </FluentProvider>
  );
}

/** Lets the last timers and microtasks of a write settle. */
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 30)); });

async function mount() {
  render(<Harness><ProjectGatesSettingsScreen /></Harness>);
  await screen.findByText("Draft to Cluster 1");
  await screen.findByText("Permit filed");
  await settle();
}

let renders: RenderCounts;

beforeEach(() => {
  vi.clearAllMocks();
  parserFactory.calls = 0;
  countriesService.getAll.mockResolvedValue({ success: true, data: FIXTURE_COUNTRY_ROWS });
  states.list.mockResolvedValue(asSharedStates(FIXTURE_STATES));
  repo.loadDataset.mockResolvedValue(dataset());
  repo.searchPeople.mockResolvedValue([]);
  exec.mockResolvedValue({ done: 1, createdIds: [] });
  vi.spyOn(console, "error").mockImplementation(() => {});
  renders = countRenders();
});
afterEach(() => {
  renders.stop();
  cleanup();
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("Project Gates grid render counts (FE-AD-01, FE-AD-06)", { timeout: TEST_TIMEOUT }, () => {
  it("UT-ADGATE-FE-001 a task pill click renders that task row only: no other task row, no gate row", async () => {
    await mount();
    // The server answers with the toggled row, as it would after the write.
    repo.loadDataset.mockResolvedValue(dataset({ approvals: APPROVALS.map((a) => (a.id === TASK ? { ...a, gateActive: true } : a)) }));
    renders.reset();
    fireEvent.click(taskPill(TASK));
    await waitFor(() => expect(repo.loadDataset).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(taskPill(TASK)).toHaveAccessibleName(/Task Grid connection request: Active/));
    await waitFor(() => expect(taskPill(TASK)).toBeEnabled());
    await settle();
    const counts = renders.snapshot();
    expect(renders.of(`GateTaskRow:${TASK}`), JSON.stringify(counts)).toBeGreaterThan(0);
    expect(renders.of(`GateTaskRow:${TASK}`), JSON.stringify(counts)).toBeLessThanOrEqual(3);
    expect(renders.ofPrefix("GateTaskRow:") - renders.of(`GateTaskRow:${TASK}`), JSON.stringify(counts)).toBe(0);
    expect(renders.ofPrefix("GateRow:") + renders.ofPrefix("GateAddRow:"), JSON.stringify(counts)).toBe(0);
  });

  it("UT-ADGATE-FE-002 a gate pill click renders that gate row only: no other gate row, no task row", async () => {
    await mount();
    const template = FIXTURE_TEMPLATES[0]!; // gate 1, active
    repo.loadDataset.mockResolvedValue(dataset({
      templates: FIXTURE_TEMPLATES.map((t) => (t.id === template.id ? { ...t, gateActive: false } : t)),
    }));
    renders.reset();
    fireEvent.click(gatePill(1));
    await waitFor(() => expect(repo.loadDataset).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(gatePill(1)).toHaveAccessibleName(/Gate Cluster 1 to Cluster 2: Inactive/));
    await waitFor(() => expect(gatePill(1)).toBeEnabled());
    await settle();
    const counts = renders.snapshot();
    const own = renders.of(`GateRow:${stateIdOf(1)}`);
    expect(own, JSON.stringify(counts)).toBeGreaterThan(0);
    expect(own, JSON.stringify(counts)).toBeLessThanOrEqual(3);
    expect(renders.ofPrefix("GateRow:") - own, JSON.stringify(counts)).toBe(0);
    expect(renders.ofPrefix("GateTaskRow:"), JSON.stringify(counts)).toBe(0);
  });

  it("UT-ADGATE-FE-003 opening and cancelling the gate editor renders no grid row and not the table", async () => {
    await mount();
    renders.reset();
    fireEvent.click(screen.getByTestId(`btn_Admin_ProjectGates_DefaultClusterApproval_Item_Edit-${stateIdOf(1)}`));
    expect(await screen.findByText("Edit Approvers")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel", hidden: true }));
    await waitFor(() => expect(screen.queryByText("Edit Approvers")).not.toBeInTheDocument());
    await settle();
    const counts = renders.snapshot();
    expect(renders.of("GateTable"), JSON.stringify(counts)).toBe(0);
    expect(renders.ofPrefix("GateRow:") + renders.ofPrefix("GateTaskRow:") + renders.ofPrefix("GateAddRow:"), JSON.stringify(counts)).toBe(0);
  });

  it("UT-ADGATE-FE-004 collapsing a gate renders that gate row once and no other row", async () => {
    await mount();
    renders.reset();
    fireEvent.click(screen.getByTestId(`btn_Admin_ProjectGates_DefaultClusterApproval_Item_Collapse-${stateIdOf(1)}`));
    await waitFor(() => expect(screen.queryByText("Land lease signed")).not.toBeInTheDocument());
    await settle();
    const counts = renders.snapshot();
    expect(renders.of(`GateRow:${stateIdOf(1)}`), JSON.stringify(counts)).toBe(1);
    expect(GATE_ROWS.filter((id) => id !== stateIdOf(1)).reduce((n, id) => n + renders.of(`GateRow:${id}`), 0), JSON.stringify(counts)).toBe(0);
    expect(renders.ofPrefix("GateTaskRow:"), JSON.stringify(counts)).toBe(0);
  });

  it("UT-ADGATE-FE-005 the people parser outlives dataset changes: one parser per mount across a toggle and its refetch", async () => {
    await mount();
    expect(parserFactory.calls).toBe(1);
    repo.loadDataset.mockResolvedValue(dataset({ approvals: APPROVALS.map((a) => (a.id === TASK ? { ...a, gateActive: true } : a)) }));
    fireEvent.click(taskPill(TASK));
    await waitFor(() => expect(repo.loadDataset).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(taskPill(TASK)).toBeEnabled());
    await settle();
    expect(parserFactory.calls).toBe(1);
  });
});
