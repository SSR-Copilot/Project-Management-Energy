/**
 * Static fixture data — Phase 1 drove the UI blocks from these before any Dataverse call
 * existed; the tests keep using them. Shapes are exactly what `projectGatesRepository` returns.
 */
import type {
  ChecklistApproval, DefaultChecklist, GateTemplate, GatesDataset, PersonRef, ProjectState,
} from "@/data/settings/project-gates";
import type { CountryRow } from "@/domain/countryPicker";
import { MODE } from "./rules";

export const COUNTRY_IDS = {
  Germany: "00000000-0000-0000-0000-0000000000de",
  France: "00000000-0000-0000-0000-0000000000f2",
  Spain: "00000000-0000-0000-0000-0000000000e5",
};

export const FIXTURE_COUNTRIES: CountryRow[] = [
  { id: COUNTRY_IDS.France, name: "France" },
  { id: COUNTRY_IDS.Germany, name: "Germany" },
  { id: COUNTRY_IDS.Spain, name: "Spain" },
];

/** The same countries as raw `vsb_countries` rows (what the shared countries read receives). */
export const FIXTURE_COUNTRY_ROWS = FIXTURE_COUNTRIES.map((c) => ({ vsb_countryid: c.id, vsb_name: c.name, statecode: 0 }));

const stateId = (n: number) => `10000000-0000-0000-0000-00000000000${n}`;
export const BU_ID = "20000000-0000-0000-0000-000000000001";

export const FIXTURE_STATES: ProjectState[] = [
  { id: stateId(0), name: "Draft", order: 0, visibleOnChecklist: true, businessUnitId: BU_ID },
  { id: stateId(1), name: "Cluster 1", order: 1, visibleOnChecklist: true, businessUnitId: BU_ID },
  { id: stateId(2), name: "Cluster 2", order: 2, visibleOnChecklist: true, businessUnitId: BU_ID },
  { id: stateId(3), name: "Cluster 3", order: 3, visibleOnChecklist: true, businessUnitId: BU_ID },
  { id: stateId(4), name: "Cluster 4", order: 4, visibleOnChecklist: true, businessUnitId: BU_ID },
  { id: stateId(5), name: "Cluster 5", order: 5, visibleOnChecklist: true, businessUnitId: BU_ID },
  { id: stateId(6), name: "Cluster 6", order: 6, visibleOnChecklist: true, businessUnitId: BU_ID },
  { id: stateId(7), name: "Inactive/ On-hold", order: 7, visibleOnChecklist: false, businessUnitId: BU_ID },
];

export const person = (n: number): PersonRef => ({
  entraId: `30000000-0000-0000-0000-0000000000${String(n).padStart(2, "0")}`,
  name: `Person ${n}`,
  mail: `person${n}@vsb.energy`,
});

const json = (people: PersonRef[]) =>
  JSON.stringify(people.map((p) => ({ PersonaKey: p.entraId, PersonaName: p.name, PersonaRole: p.mail })));

export const FIXTURE_TEMPLATES: GateTemplate[] = [
  {
    id: "40000000-0000-0000-0000-000000000001", name: "Cluster 1 to Cluster 2", mode: MODE.Formal,
    gateActive: true, stateId: stateId(1), pmId: person(1).entraId,
    contributors: json([person(2)]), approvals: json([person(3), person(4), person(5), person(6)]),
    notifications: null, createdOn: "2024-01-01T00:00:00Z",
  },
  {
    id: "40000000-0000-0000-0000-000000000002", name: "Draft to Cluster 1", mode: MODE.OnlyNotifications,
    gateActive: true, stateId: stateId(0), pmId: null,
    contributors: null, approvals: null, notifications: json([person(7)]), createdOn: "2024-01-01T00:00:00Z",
  },
];

const shown = { active: true, toDelete: false } as const;

export const FIXTURE_CHECKLISTS: DefaultChecklist[] = [
  { id: "50000000-0000-0000-0000-000000000002", name: "Land lease signed", order: 2, stateId: stateId(1), ...shown },
  { id: "50000000-0000-0000-0000-000000000001", name: "Grid connection request", order: 1, stateId: stateId(1), ...shown },
  { id: "50000000-0000-0000-0000-000000000003", name: "Permit filed", order: 1, stateId: stateId(2), ...shown },
];

/** G-4: an inactive and a "To Delete" task of gate 1 — never shown, never offered. */
export const HIDDEN_CHECKLISTS: DefaultChecklist[] = [
  { id: "50000000-0000-0000-0000-000000000004", name: "Inactive task", order: 3, stateId: stateId(1), active: false, toDelete: false },
  { id: "50000000-0000-0000-0000-000000000005", name: "Soft-deleted task", order: 4, stateId: stateId(1), active: true, toDelete: true },
];

export const FIXTURE_APPROVALS: ChecklistApproval[] = [
  {
    id: "60000000-0000-0000-0000-000000000001", name: "Grid connection request", mode: MODE.Local,
    gateActive: false, checklistId: FIXTURE_CHECKLISTS[1]!.id, pmId: null,
    contributors: null, approvers: json([person(8)]), notifications: json([person(9)]),
  },
];

export function fixtureDataset(overrides: Partial<GatesDataset> = {}): GatesDataset {
  return {
    templates: FIXTURE_TEMPLATES,
    checklistHeaderId: "70000000-0000-0000-0000-000000000001",
    checklists: FIXTURE_CHECKLISTS,
    approvals: FIXTURE_APPROVALS,
    people: { [person(1).entraId.toLowerCase()]: person(1) },
    checklistError: null,
    peopleError: null,
    ...overrides,
  };
}
