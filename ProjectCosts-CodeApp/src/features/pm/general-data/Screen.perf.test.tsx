// @vitest-environment jsdom
/**
 * General Data (D162 B4): the municipality options are built once per list, not on every keystroke (FE-P1-02a). `./hooks`
 * is mocked as in `Screen.test.tsx`, with a German project and a fixed list of 2,000 municipalities.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { FluentProvider } from "@fluentui/react-components";
import { DataMemoryRouter as MemoryRouter } from "@/test/DataMemoryRouter";
import { vsbTheme } from "@/theme/fluent";
import { CHOICE } from "@/data/dataverseNames";
import { countRenders, type RenderCounts } from "@/test/renderCounts";
import type { ProjectRow } from "./rules";

const ROW: ProjectRow = {
  id: "p-1", projectNumber: "DE-1021", internalProjectId: "INT-7", projectName: "Wirmighausen",
  originalProjectName: "Wirmighausen", shortName: "WIR", projectType: null, spvName: "", spvCompanyCode: null,
  spvLegalStructure: null, countryId: "c-de", areaId: "a-by", district: "", municipality: "Gemeinde 7",
  utilizationId: null, terrainSize: null, latitude: 51.284745, longitude: 13.712023, technology: 952850000,
  approvalState: null, statecode: 0, clusterStateId: "s-draft", clusterStateName: "Draft", taxFactor: null,
  owningBusinessUnitId: "bu-de", shareOfFarmdown: 50, isStandardShareOfFarmdown: true, standardCostCreated: false,
  developmentType: CHOICE.developmentType.ownDevelopment, startCluster: 0, acquisitionDate: null,
  acquisitionPrice: null, managerId: "e-1", managerName: "Ann Manager", deputyManagerId: null, deputyManagerName: null,
  projectStartDate: null, feasibilityStudies: null, projectDevelopmentStarted: null, applicationSubmitted: null,
  legallyBindingPermits: null, fid: null, construction: null, cod: null,
  createdByName: "Shakti Singh", createdOn: "2026-09-03T10:49:00Z", modifiedByName: null, modifiedOn: null,
};

const data = vi.hoisted(() => ({
  municipalities: Array.from({ length: 2000 }, (_, i) => ({ uid: `m-${i}`, municipality: `Gemeinde ${i}`, state: "Bayern", tradetaxrate: "400" })),
  countries: [{ id: "c-de", name: "Germany", key: "1", besitzerBusinessUnitId: "bu-de", businessUnitId: "bu-de2" }],
  states: [{ id: "s-draft", name: "Draft", order: 0, isVisibleOnChecklist: true }],
  areas: [{ id: "a-by", name: "Bayern" }],
  none: [] as unknown[],
  people: new Map([["e-1", { id: "e-1", displayName: "Ann Manager", mail: "ann@vsb.energy" }]]),
  shareholders: [{ key: "sh-1", recordId: "sh-1", entityTypeValue: 952850018, customName: "", ownership: 1 }],
}));

vi.mock("@/app/SessionContext", () => ({ useSession: () => ({ projectId: "p-1", locale: "en-US", loading: false, envVars: {} }) }));
vi.mock("@/app/useCurrentUser", () => ({ useCurrentUser: () => ({ data: { editableCountries: [] } }) }));
const ok = <T,>(d: T) => ({ data: d, isLoading: false, error: undefined, connected: true });
vi.mock("./hooks", () => ({
  useGeneralDataProject: () => ok(ROW),
  useCountries: () => ok(data.countries),
  useProjectStates: () => ok(data.states),
  useCountryAreas: () => ok(data.areas),
  useTerrainUtilizations: () => ok(data.none),
  useShareholders: () => ok(data.shareholders),
  useStateTrackings: () => ok(data.none),
  useEntraSearch: () => ok(data.none),
  useEntraPeople: () => ok(data.people),
  useMunicipalitySearch: () => ok(data.municipalities),
  useGermanTradeTaxRate: () => ok(null),
  useMilestoneDurations: () => undefined,
  useProjectReader: () => async () => null,
  useGeneralDataWrites: () => ({
    run: async () => [], progress: null, error: null, success: null, clear: () => {},
    cancelDraftGateApprovalIfRunning: async () => undefined, reloadAll: async () => [],
  }),
}));
vi.mock("./ProjectMap", () => ({ default: () => <div data-testid="map-stub" /> }));

import GeneralDataScreen from "./Screen";

let renders: RenderCounts;
beforeEach(() => { renders = countRenders(); });
afterEach(() => { renders.stop(); cleanup(); });

describe("UT-GDATA-FE municipality options (D162 B4, FE-P1-02a)", () => {
  it("UT-GDATA-FE-001 a keystroke in another field does not rebuild the municipality options", async () => {
    render(
      <FluentProvider theme={vsbTheme}>
        <MemoryRouter initialEntries={["/project/general?projectId=p-1"]}><GeneralDataScreen /></MemoryRouter>
      </FluentProvider>,
    );
    const district = await screen.findByTestId("txt_GeneralData_DisplayProject_Body_General_Content_District") as HTMLInputElement;
    expect(renders.of("GeneralDataMuniOptions")).toBeGreaterThan(0);
    renders.reset();
    fireEvent.change(district, { target: { value: "N" } });
    fireEvent.change(district, { target: { value: "No" } });
    expect(district.value).toBe("No");
    expect(renders.of("GeneralDataMuniOptions")).toBe(0);
  });
});
