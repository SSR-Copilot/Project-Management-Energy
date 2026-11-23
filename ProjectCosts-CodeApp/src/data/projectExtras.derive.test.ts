/**
 * OPT-02 (B8): the project's country id and technology are carried on `ProjectContext` (read by `loadProject`), so the Cost
 * screens no longer re-read the project row for them. The OLD loader, `loadProjectExtras`, is the oracle: over a table of rows the
 * session project's two fields equal its answer, in both scopes. Ids: UT-PROJEXTRAS-OPT-001 and up.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ row: undefined as Record<string, unknown> | undefined, labels: [] as string[] }));

vi.mock("./client", () => ({
  fetchAll: async (label: string) => { h.labels.push(label); return h.row ? [h.row] : []; },
}));
vi.mock("@/generated/services/Vsb_projectsService", () => ({ Vsb_projectsService: { getAll: async () => ({ success: true, data: [] }) } }));
vi.mock("@/generated/services/EnvironmentvariablevaluesService", () => ({ EnvironmentvariablevaluesService: { getAll: async () => ({ success: true, data: [] }) } }));
vi.mock("@/generated/services/EnvironmentvariabledefinitionsService", () => ({ EnvironmentvariabledefinitionsService: { getAll: async () => ({ success: true, data: [] }) } }));
vi.mock("@/generated/services/Vsb_countriesService", () => ({ Vsb_countriesService: { get: async () => ({ success: true, data: { vsb_isocurrencycode: "EUR", vsb_name: "X" } }) } }));
vi.mock("@/generated/services/Vsb_countryareasService", () => ({ Vsb_countryareasService: { get: async () => ({ success: true, data: { vsb_name: "A" } }) } }));
vi.mock("@/generated/services/Vsb_projectstatesService", () => ({ Vsb_projectstatesService: { get: async () => ({ success: true, data: { vsb_order: 1, vsb_name: "C" } }) } }));

const { loadProject, loadProjectExtras, projectLoadSwitch } = await import("./project");

const P = "9f5aade5-2b7c-ef11-ac20-000d3a466ab7";
const COUNTRY = "c0000000-0000-0000-0000-000000000001";
const base = (extra: Record<string, unknown>): Record<string, unknown> => ({ vsb_projectid: P, vsb_name: "1", vsb_projectname: "N", ...extra });

const TABLE: [string, Record<string, unknown>, { countryId: string | undefined; technology: number | undefined }][] = [
  ["country and technology number", base({ _vsb_country_value: COUNTRY, vsb_technology: 952850000 }), { countryId: COUNTRY, technology: 952850000 }],
  ["technology 0", base({ _vsb_country_value: COUNTRY, vsb_technology: 0 }), { countryId: COUNTRY, technology: 0 }],
  ["no country", base({ vsb_technology: 952850001 }), { countryId: undefined, technology: 952850001 }],
  ["technology as a string", base({ _vsb_country_value: COUNTRY, vsb_technology: "952850000" }), { countryId: COUNTRY, technology: undefined }],
  ["technology null", base({ _vsb_country_value: COUNTRY, vsb_technology: null }), { countryId: COUNTRY, technology: undefined }],
  ["technology missing", base({ _vsb_country_value: COUNTRY }), { countryId: COUNTRY, technology: undefined }],
  ["neither", base({}), { countryId: undefined, technology: undefined }],
];

beforeEach(() => { h.labels = []; h.row = undefined; projectLoadSwitch.pmRowOnly = true; });

describe("OPT-02: ProjectContext carries what loadProjectExtras re-read", () => {
  TABLE.forEach(([name, row, want], i) => {
    it(`UT-PROJEXTRAS-OPT-${String(i + 10).padStart(3, "0")} ${name}: the full and the PM context equal the old extras loader's answer`, async () => {
      h.row = row;
      const old = await loadProjectExtras(P);
      expect(old).toEqual(want);
      for (const scope of ["full", "pm"] as const) {
        const ctx = await loadProject(P, { scope });
        expect({ countryId: ctx?.countryId, technology: ctx?.technology }, scope).toEqual({ countryId: old.countryId, technology: old.technology });
      }
    });
  });

  it("UT-PROJEXTRAS-OPT-002 a project that does not load carries nothing, as the old loader returned nothing", async () => {
    h.row = undefined;
    await expect(loadProjectExtras(P)).resolves.toEqual({ countryId: undefined, technology: undefined });
    await expect(loadProject(P)).resolves.toBeUndefined();
  });

  it("UT-PROJEXTRAS-OPT-003 the PM row-only load still reads the project row only (switch behaviour intact)", async () => {
    h.row = base({ _vsb_country_value: COUNTRY, vsb_technology: 952850000 });
    await loadProject(P, { scope: "pm" });
    expect(h.labels).toEqual(["load project"]);
    const pm = await loadProject(P, { scope: "pm" });
    expect(pm?.countryName).toBeUndefined();
  });
});
