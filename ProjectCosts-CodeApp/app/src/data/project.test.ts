/**
 * `loadProject` — the deep-linked project, as `ProjectContext`.
 *
 * These exist for `Area/State/Province`. `_vsb_countryarea_value` was never `$select`ed, so
 * `ProjectContext.areaStateProvince` did not exist and `opexRules.areaWithRegion` — the port of
 * `App.OnStart`'s Italy-only `Switch` over the twenty Italian regions (`OnStart.txt:902-961`) —
 * could only ever answer for a NON-Italian project. Both period screens then rendered
 * `"Italy - "` with an empty zone in the grid's Inflation Profile cell and in the panel's
 * read-only country text.
 *
 * MEASURED, VSBCloud_Dev 16 Sep (`pac org fetch`): `vsb_countryarea` holds exactly the twenty
 * regions `ITALY_AREA_BY_REGION` lists, including `Valle d’Aosta` with a U+2019 apostrophe.
 * Every live Italian project carries one — Zingariello (`de5aade5-…`) is Puglia, `Italy Test
 * Checklist` (`d47ccefb-…`) is Trentino Alto Adige — while Quellendorf I is Saxony-Anhalt and
 * Project New Data is Mecklenburg-Western Pomerania, so both correctly resolve to no zone.
 *
 * `UT-PROJ-###` is its own series.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ITALY_AREA_BY_REGION, areaWithRegion, italyZone } from "@/features/periods/opexRules";

let projectRows: Record<string, unknown>[] = [];
let queried: { select: string[] }[] = [];
/** `Vsb_countryareasService.get` by id — `undefined` means "no such row / not readable". */
let areaById: Record<string, string | undefined> = {};
let areaGets: string[] = [];

vi.mock("./client", () => ({
  fetchAll: async (_label: string, _page: unknown, options: unknown) => {
    queried.push(options as { select: string[] });
    return projectRows;
  },
}));

vi.mock("@/generated/services/Vsb_projectsService", () => ({
  Vsb_projectsService: { getAll: async () => ({ success: true, data: [] }) },
}));
vi.mock("@/generated/services/Vsb_countriesService", () => ({
  Vsb_countriesService: {
    get: async () => ({
      success: true,
      data: { vsb_countryid: "c", vsb_isocurrencycode: "EUR", vsb_name: "Italy" },
    }),
  },
}));
vi.mock("@/generated/services/Vsb_countryareasService", () => ({
  Vsb_countryareasService: {
    get: async (id: string) => {
      areaGets.push(id);
      const name = areaById[id];
      return name === undefined
        ? { success: false, error: { message: "not found" } }
        : { success: true, data: { vsb_countryareaid: id, vsb_name: name } };
    },
  },
}));
vi.mock("@/generated/services/Vsb_projectstatesService", () => ({
  Vsb_projectstatesService: {
    get: async () => ({ success: true, data: { vsb_projectstateid: "s", vsb_order: 4 } }),
  },
}));
vi.mock("@/generated/services/EnvironmentvariablevaluesService", () => ({
  EnvironmentvariablevaluesService: { getAll: async () => ({ success: true, data: [] }) },
}));
vi.mock("@/generated/services/EnvironmentvariabledefinitionsService", () => ({
  EnvironmentvariabledefinitionsService: { getAll: async () => ({ success: true, data: [] }) },
}));

const { loadProject } = await import("./project");

/** Zingariello, VSBCloud_Dev — Puglia, Italy, PV. */
const ZINGARIELLO = "de5aade5-2b7c-ef11-ac20-000d3a466ab7";
const PUGLIA = "902f5f54-7a8c-f011-b4cc-6045bd9514a9";
const COUNTRY_IT = "1cf4a2b6-d2d0-ee11-9079-000d3ab6fed7";

beforeEach(() => {
  queried = [];
  areaGets = [];
  areaById = { [PUGLIA]: "Puglia" };
  projectRows = [{
    vsb_projectid: ZINGARIELLO,
    vsb_name: "10000123",
    vsb_projectname: "Zingariello",
    vsb_projectstartdate: "2020-01-01",
    _vsb_country_value: COUNTRY_IT,
    _vsb_countryarea_value: PUGLIA,
  }];
});

describe("loadProject area", () => {
  it("UT-PROJ-001 selects the Area/State/Province lookup and resolves its NAME", async () => {
    // `vsb_countryareaname` is deliberately NOT used: that is the FetchXML-era lookup alias and
    // the Web API does not return it on a plain `$select` — the trap `costBook.ts` records for
    // `vsb_currencyname`, which came back empty on every row.
    const project = await loadProject(ZINGARIELLO);
    expect(queried[0]?.select).toContain("_vsb_countryarea_value");
    expect(queried[0]?.select).not.toContain("vsb_countryareaname");
    expect(areaGets).toEqual([PUGLIA]);
    expect(project?.areaStateProvince).toBe("Puglia");
  });

  it("UT-PROJ-002 feeds gblAreaWithRegion, so an Italian project gets a real zone", async () => {
    // `App.OnStart`'s Switch (`OnStart.txt:902-961`), ported as `areaWithRegion`. Before this
    // the panel rendered `"Italy - "` with nothing after it on every Italian project.
    const project = await loadProject(ZINGARIELLO);
    const region = areaWithRegion(project?.countryName, project?.areaStateProvince);
    expect(region).toBe("Italy_South");
    expect(italyZone(region)).toBe("South");
    expect(ITALY_AREA_BY_REGION.Puglia).toBe("Italy_South");
  });

  it("UT-PROJ-003 skips the lookup entirely when the project has no area", async () => {
    projectRows = [{ ...projectRows[0], _vsb_countryarea_value: undefined }];
    const project = await loadProject(ZINGARIELLO);
    expect(areaGets).toEqual([]);
    expect(project?.areaStateProvince).toBeUndefined();
  });

  it("UT-PROJ-004 treats an unreadable area row as no area, not as a failure", async () => {
    // Same tolerance as `loadCountry`: a row the caller cannot read must not fail the screen.
    // `areaWithRegion` returns null for an unknown region anyway, so nothing downstream changes.
    areaById = {};
    const project = await loadProject(ZINGARIELLO);
    expect(project?.areaStateProvince).toBeUndefined();
    expect(areaWithRegion("Italy", project?.areaStateProvince)).toBeNull();
  });

  it("UT-PROJ-005 leaves a non-Italian project with no zone even when it has an area", async () => {
    // Quellendorf I is Saxony-Anhalt and Project New Data is Mecklenburg-Western Pomerania —
    // real areas the Italy-only Switch must not translate.
    areaById = { [PUGLIA]: "Saxony-Anhalt" };
    const project = await loadProject(ZINGARIELLO);
    expect(project?.areaStateProvince).toBe("Saxony-Anhalt");
    expect(areaWithRegion("Germany", project?.areaStateProvince)).toBeNull();
  });
});
