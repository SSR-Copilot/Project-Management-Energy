// @vitest-environment jsdom
/**
 * General Data (D162 B4, FE-P1-01): the map chunk starts loading when the screen mounts, while its reads are still
 * running, not only after they have landed. `./hooks` keeps the project read pending; the `./ProjectMap` mock records
 * when the module is loaded (its factory runs on the first `import()`).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { FluentProvider } from "@fluentui/react-components";
import { DataMemoryRouter as MemoryRouter } from "@/test/DataMemoryRouter";
import { vsbTheme } from "@/theme/fluent";

const map = vi.hoisted(() => ({ loaded: false }));
const h = vi.hoisted(() => ({
  pending: () => ({ data: null, isLoading: true, error: undefined, connected: true }),
  empty: () => ({ data: [], isLoading: false, error: undefined, connected: true }),
}));

vi.mock("@/app/SessionContext", () => ({ useSession: () => ({ projectId: "p-1", locale: "en-US", loading: false, envVars: {} }) }));
vi.mock("@/app/useCurrentUser", () => ({ useCurrentUser: () => ({ data: { editableCountries: [] } }) }));
vi.mock("./hooks", () => ({
  useGeneralDataProject: h.pending,
  useCountries: () => ({ ...h.empty(), isLoading: true }),
  useProjectStates: () => ({ ...h.empty(), isLoading: true }),
  useCountryAreas: h.empty,
  useTerrainUtilizations: h.empty,
  useShareholders: h.empty,
  useStateTrackings: h.empty,
  useEntraSearch: h.empty,
  useEntraPeople: () => ({ data: new Map(), isLoading: false, error: undefined, connected: true }),
  useMunicipalitySearch: h.empty,
  useGermanTradeTaxRate: () => ({ data: null, isLoading: false, error: undefined, connected: true }),
  useMilestoneDurations: () => undefined,
  useProjectReader: () => async () => null,
  useGeneralDataWrites: () => ({
    run: async () => [], progress: null, error: null, success: null, clear: () => {},
    cancelDraftGateApprovalIfRunning: async () => undefined, reloadAll: async () => [],
  }),
}));
vi.mock("./ProjectMap", () => {
  map.loaded = true;
  return { default: () => <div data-testid="map-stub" /> };
});

import GeneralDataScreen from "./Screen";

afterEach(() => { cleanup(); });

describe("UT-GDATA-FE map chunk preload (D162 B4, FE-P1-01)", () => {
  it("UT-GDATA-FE-003 the map module is requested at mount, before the screen's reads resolve", async () => {
    expect(map.loaded).toBe(false);
    render(
      <FluentProvider theme={vsbTheme}>
        <MemoryRouter initialEntries={["/project/general?projectId=p-1"]}><GeneralDataScreen /></MemoryRouter>
      </FluentProvider>,
    );
    // Still on the loading state: no form, no map host yet.
    expect(screen.queryByTestId("txt_GeneralData_DisplayProject_Body_General_Content_District")).toBeNull();
    expect(screen.queryByTestId("map-stub")).toBeNull();
    await waitFor(() => expect(map.loaded).toBe(true));
  });
});
