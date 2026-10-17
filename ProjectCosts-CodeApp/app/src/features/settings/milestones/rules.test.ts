/**
 * Milestones settings rules — FR-2, FR-3, FR-5, FR-6, FR-7, FR-8, DR-3, DR-4.
 * Ids: UT-MS-nnn.
 */
import { describe, expect, it } from "vitest";
import {
  buildPatches, cellKey, duplicatesWarning, evaluateCell, evaluatePanel, formatValue,
  groupAssumptions, initialText, matrixCells, placeholderText, saveFailureMessage, sortCountries,
  toMilestoneCountries, validateDuration, validateSuccessRate,
} from "./rules";
import { tokens } from "@fluentui/react-components";
import { palette } from "@/theme/tokens";
import {
  DURATION_FIELDS, HEADING, KIND_LABEL, MATRIX_COLUMNS, MSG, RATE_FIELDS, TYPOGRAPHY,
  technologyLabel, technologyName,
} from "./constants";
import {
  BESS, FIXTURE_ASSUMPTIONS, FIXTURE_COUNTRIES, FRANCE, GERMANY, PV, WIND, row,
} from "./fixtures";
import type { MilestoneAssumption } from "@/data/settings/milestones";

const byId = (rows: MilestoneAssumption[]) => new Map(rows.map((r) => [r.id, r]));

describe("sortCountries (FR-2)", () => {
  it("UT-MS-001 orders numeric keys ascending and blank keys last (AC-2a)", () => {
    expect(sortCountries(FIXTURE_COUNTRIES).map((c) => c.name))
      .toEqual(["France", "Germany", "Poland", "Spain"]);
  });

  it("UT-MS-002 sorts non-numeric keys last, by name, and does not mutate its input", () => {
    const input = [
      { id: "a", name: "Zeta", key: "x" },
      { id: "b", name: "Alpha", key: undefined },
      { id: "c", name: "Mid", key: " 3 " },
    ];
    expect(sortCountries(input).map((c) => c.name)).toEqual(["Mid", "Alpha", "Zeta"]);
    expect(input[0]?.name).toBe("Zeta");
  });

  it("UT-MS-003 maps the shared country rows to sections: id, name, key = vsb_title (DR-1)", () => {
    expect(toMilestoneCountries([
      { id: "c1", name: "Germany", title: "2", isoCurrencyCode: "EUR", active: true },
      { id: "c2", name: "Spain", title: undefined, isoCurrencyCode: undefined, active: true },
    ])).toEqual([
      { id: "c1", name: "Germany", key: "2" },
      { id: "c2", name: "Spain", key: undefined },
    ]);
  });
});

describe("groupAssumptions (DR-3)", () => {
  it("UT-MS-010 groups by country and orders technologies by option value (AC-3a)", () => {
    const groups = groupAssumptions(FIXTURE_ASSUMPTIONS).get(GERMANY) ?? [];
    expect(groups.map((g) => g.technology)).toEqual([WIND, PV]);
    expect(groups[0]?.durations?.id).toBe("de-wind-m");
    expect(groups[0]?.successRates?.id).toBe("de-wind-s");
  });

  it("UT-MS-011 keeps a technology whose success row is missing", () => {
    const groups = groupAssumptions(FIXTURE_ASSUMPTIONS).get(FRANCE) ?? [];
    expect(groups).toHaveLength(1);
    expect(groups[0]?.technology).toBe(BESS);
    expect(groups[0]?.successRates).toBeUndefined();
  });

  it("UT-MS-012 uses the first row of a duplicated kind and lists the rest", () => {
    const rows = [
      row("first", GERMANY, WIND, "months", { cluster1: 1 }),
      row("second", GERMANY, WIND, "months", { cluster1: 2 }),
    ];
    const g = groupAssumptions(rows).get(GERMANY)?.[0];
    expect(g?.durations?.id).toBe("first");
    expect(g?.duplicates.map((d) => d.id)).toEqual(["second"]);
    expect(duplicatesWarning(groupAssumptions(rows).get(GERMANY) ?? [])).toContain("Wind (Cluster Durations)");
  });

  it("UT-MS-013 ignores unknown kind names and rows without a country", () => {
    const rows: MilestoneAssumption[] = [
      { ...row("y", GERMANY, WIND, "months", {}), name: "average duration [years]" },
      { ...row("n", GERMANY, WIND, "months", {}), countryId: undefined },
    ];
    expect(groupAssumptions(rows).size).toBe(0);
    expect(duplicatesWarning([])).toBeUndefined();
  });

  it("UT-MS-014 (R1 GAP-3) a blank Technology is its own group, sorted first, as GroupBy keeps it (AMS:458-467)", () => {
    const rows = [
      row("w", GERMANY, WIND, "months", { cluster1: 1 }),
      row("bm", GERMANY, undefined, "months", { cluster1: 2 }),
      row("bs", GERMANY, undefined, "successRate", { cluster1: 0.5 }),
      row("bm2", GERMANY, undefined, "months", { cluster1: 3 }),
    ];
    const groups = groupAssumptions(rows).get(GERMANY) ?? [];
    expect(groups.map((g) => g.technology)).toEqual([undefined, WIND]);
    expect(groups[0]?.durations?.id).toBe("bm");
    expect(groups[0]?.successRates?.id).toBe("bs");
    expect(duplicatesWarning(groups)).toContain("No technology (Cluster Durations)");
  });

  it("UT-MS-015 (R1 GAP-3) a blank Technology's label is empty, as the canvas Text(Blank()) (AMS:767, 1900)", () => {
    expect(technologyLabel(undefined)).toBe("");
    expect(technologyName(undefined)).toBe("No technology");
    expect(technologyName(WIND)).toBe("Wind");
  });

  it("UT-MS-016 (R1 GAP-3) blank-Technology rows are editable: panel columns and patches", () => {
    const rows = [
      row("bm", GERMANY, undefined, "months", { cluster1: 2 }),
      row("bs", GERMANY, undefined, "successRate", { cluster1: 0.5 }),
    ];
    const groups = groupAssumptions(rows).get(GERMANY) ?? [];
    const panel = evaluatePanel(groups, { [cellKey("bm", "cluster1")]: "4" }, "en-US");
    expect(panel.durationColumns.map((c) => c.row.id)).toEqual(["bm"]);
    expect(panel.rateColumns.map((c) => c.row.id)).toEqual(["bs"]);
    expect(panel.canSave).toBe(true);
    expect(panel.patches).toEqual([
      { id: "bm", changes: { vsb_cluster1: 4 }, label: "No technology – Cluster Durations" },
    ]);
  });
});

describe("canvas text and typography (parity R1 GAP-1, GAP-2)", () => {
  it("UT-MS-017 panel headings are the canvas strings verbatim, plain hyphen (AMS:1141, 1928)", () => {
    expect(HEADING.durations).toBe("Cluster Durations [months]");
    expect(HEADING.successRates).toBe("Cluster Probabilities - Success Rate [-]");
  });

  it("UT-MS-018 every visible label of the screen is ASCII, like the canvas", () => {
    const labels = [
      ...Object.values(HEADING), ...Object.values(KIND_LABEL),
      ...DURATION_FIELDS.map((d) => d.label), ...RATE_FIELDS.map((r) => r.label),
      ...MATRIX_COLUMNS.map((c) => c.label), MSG.durationInvalid, MSG.rateInvalid,
      MSG.saving("X"), MSG.saved, MSG.saveFailed,
    ];
    // eslint-disable-next-line no-control-regex
    for (const l of labels) expect(l).toMatch(/^[\x00-\x7F]*$/);
  });

  it("UT-MS-019 typography: country Medium/Normal/black; values and sub-labels Large; technology ExtraLarge", () => {
    expect(TYPOGRAPHY.countryName).toEqual({ fontSize: tokens.fontSizeBase300, fontWeight: tokens.fontWeightRegular, color: palette.black });
    expect(TYPOGRAPHY.value).toEqual({ fontSize: tokens.fontSizeBase400, fontWeight: tokens.fontWeightRegular });
    expect(TYPOGRAPHY.subLabel).toEqual({ fontSize: tokens.fontSizeBase400, fontWeight: tokens.fontWeightRegular, color: tokens.colorNeutralForeground1 });
    expect(TYPOGRAPHY.technology).toEqual({ fontSize: tokens.fontSizeBase500, fontWeight: tokens.fontWeightRegular });
  });
});

describe("matrixCells (FR-3)", () => {
  const de = groupAssumptions(FIXTURE_ASSUMPTIONS).get(GERMANY) ?? [];
  const cell = (cells: ReturnType<typeof matrixCells>, key: string) => cells.find((c) => c.key === key);

  it("UT-MS-020 shows duration and success rate for Cluster 1–4", () => {
    const wind = matrixCells(de[0]!, "en-US");
    expect(cell(wind, "cluster3")).toMatchObject({ duration: "24", rate: "0.75" });
  });

  it("UT-MS-021 FID success is always 1; a blank FID duration shows '-' (decision, not 0.75)", () => {
    const pv = matrixCells(de[1]!, "en-US");
    expect(cell(pv, "fid")).toMatchObject({ duration: "-", rate: "1" });
    const wind = matrixCells(de[0]!, "en-US");
    expect(cell(wind, "fid")).toMatchObject({ duration: "3", rate: "1" });
  });

  it("UT-MS-022 Cluster 5 success is literal 1 even when a success value is stored", () => {
    const g = groupAssumptions([
      row("m", GERMANY, WIND, "months", { cluster5: 6 }),
      row("s", GERMANY, WIND, "successRate", { cluster5: 0.4 }),
    ]).get(GERMANY)![0]!;
    expect(cell(matrixCells(g, "en-US"), "cluster5")).toMatchObject({ duration: "6", rate: "1" });
  });

  it("UT-MS-023 Sales Start/End success is '-'; Sales End reads vsb_salesduration", () => {
    const wind = matrixCells(de[0]!, "en-US");
    expect(cell(wind, "salesStart")).toMatchObject({ duration: "6", rate: "-" });
    expect(cell(wind, "salesEnd")).toMatchObject({ duration: "24", rate: "-" });
  });

  it("UT-MS-024 blanks render '-' including Cluster 1–4 when the success row is missing (AC-3b)", () => {
    const fr = groupAssumptions(FIXTURE_ASSUMPTIONS).get(FRANCE)![0]!;
    const cells = matrixCells(fr, "en-US");
    expect(cell(cells, "cluster1")).toMatchObject({ duration: "3", rate: "-" });
    expect(cell(cells, "cluster2")).toMatchObject({ duration: "-", rate: "-" });
    expect(cell(cells, "operationalLifetime")).toMatchObject({ duration: "-", rate: "-" });
  });

  it("UT-MS-025 formats in the user's locale with at most 2 decimals and no grouping", () => {
    expect(formatValue(0.755, "de-DE")).toBe("0,76");
    expect(formatValue(1000, "en-US")).toBe("1000");
    expect(formatValue(undefined)).toBe("-");
  });
});

describe("validateDuration (FR-6)", () => {
  it("UT-MS-030 accepts whole numbers ≥ 0 only (AC-6a)", () => {
    expect(validateDuration("12", 100)).toEqual({ ok: true, value: 12 });
    expect(validateDuration("0", 100)).toEqual({ ok: true, value: 0 });
    expect(validateDuration(" 6 ", 100)).toEqual({ ok: true, value: 6 });
    for (const bad of ["12.5", "12,5", "-1", "+3", "", "abc", "1e2"]) {
      expect(validateDuration(bad, 100)).toEqual({ ok: false, message: MSG.durationInvalid });
    }
  });

  it("UT-MS-031 enforces the Dataverse maxima: 100 clusters, 1000 others (AC-6c)", () => {
    expect(validateDuration("100", 100).ok).toBe(true);
    expect(validateDuration("101", 100).ok).toBe(false);
    expect(validateDuration("101", 1000).ok).toBe(true);
    expect(validateDuration("1001", 1000).ok).toBe(false);
  });
});

describe("validateSuccessRate (FR-6)", () => {
  it("UT-MS-040 accepts 0–1 with up to 2 decimals, with either separator (AC-6b)", () => {
    expect(validateSuccessRate("0,85")).toEqual({ ok: true, value: 0.85 });
    expect(validateSuccessRate("0.85")).toEqual({ ok: true, value: 0.85 });
    expect(validateSuccessRate("1")).toEqual({ ok: true, value: 1 });
    expect(validateSuccessRate("0")).toEqual({ ok: true, value: 0 });
    expect(validateSuccessRate("1.")).toEqual({ ok: true, value: 1 });
  });

  it("UT-MS-041 rejects more than 2 decimals, out of range, signs and blanks", () => {
    for (const bad of ["0.855", "0,855", "1.2", "-0.1", "+0.5", "", " ", ".5", "abc"]) {
      expect(validateSuccessRate(bad)).toEqual({ ok: false, message: MSG.rateInvalid });
    }
  });
});

describe("initialText / evaluateCell (FR-5, FR-6, FR-7)", () => {
  it("UT-MS-050 prefills blanks: C5/OL/Sales durations show a '0' placeholder, others nothing (C-5)", () => {
    expect(initialText("durations", "cluster5", undefined)).toBe("");
    expect(placeholderText("durations", "cluster5", undefined)).toBe("0");
    expect(placeholderText("durations", "salesEnd", undefined)).toBe("0");
    expect(placeholderText("durations", "operationalLifetime", undefined)).toBe("0");
    expect(placeholderText("durations", "salesEnd", 4)).toBeUndefined();
    expect(placeholderText("durations", "fid", undefined)).toBeUndefined();
    expect(placeholderText("durations", "cluster1", undefined)).toBeUndefined();
    expect(placeholderText("successRates", "cluster1", undefined)).toBeUndefined();
    expect(initialText("durations", "fid", undefined)).toBe("");
    expect(initialText("successRates", "cluster1", undefined)).toBe("");
    expect(initialText("successRates", "cluster1", 0.9, "de-DE")).toBe("0,9");
  });

  it("UT-MS-054 an explicit 0 over a blank blank-as-zero field is dirty; untouched writes nothing (C-5 / B4)", () => {
    expect(evaluateCell("durations", "cluster5", undefined, "0")).toMatchObject({ touched: true, dirty: true, value: 0, placeholder: "0" });
    expect(evaluateCell("durations", "cluster5", undefined, undefined)).toMatchObject({ text: "", touched: false, dirty: false });
    const rows = byId([row("m", GERMANY, WIND, "months", {})]);
    expect(buildPatches({ [cellKey("m", "cluster5")]: "0" }, rows)[0]?.changes).toEqual({ vsb_cluster5: 0 });
    expect(buildPatches({}, rows)).toEqual([]);
    expect(evaluatePanel(groupAssumptions([row("m", GERMANY, WIND, "months", {})]).get(GERMANY) ?? [], {}).canSave).toBe(false);
  });

  it("UT-MS-055 native-digit locales still prefill and display Latin digits (C-6 / B5)", () => {
    expect(initialText("durations", "cluster1", 12, "ar-EG")).toBe("12");
    expect(formatValue(12, "ar-EG")).toBe("12");
    expect(formatValue(36, "fa-IR")).toBe("36");
    // The prefill round-trips through validation untouched-then-retyped.
    expect(evaluateCell("durations", "cluster1", 12, "13", "ar-EG")).toMatchObject({ dirty: true, value: 13 });
    expect(evaluateCell("durations", "cluster1", 12, "12", "ar-EG")).toMatchObject({ touched: false });
  });

  it("UT-MS-051 a value typed and reverted is not dirty (AC-7a)", () => {
    expect(evaluateCell("durations", "cluster1", 12, "13")).toMatchObject({ touched: true, dirty: true, value: 13 });
    expect(evaluateCell("durations", "cluster1", 12, "12")).toMatchObject({ touched: false, dirty: false });
    expect(evaluateCell("durations", "cluster1", 12, "012")).toMatchObject({ touched: true, dirty: false });
  });

  it("UT-MS-052 an untouched invalid stored value is not validated (FID 0.75)", () => {
    expect(evaluateCell("durations", "fid", 0.75, undefined, "en-US")).toEqual({ text: "0.75", touched: false, dirty: false });
  });

  it("UT-MS-053 a touched invalid value carries its message", () => {
    expect(evaluateCell("durations", "cluster2", 5, "101").error).toBe("Enter a value of at most 100 months");
    expect(evaluateCell("successRates", "cluster1", 0.5, "0.555").error).toBe(MSG.rateInvalid);
  });
});

describe("buildPatches (DR-4)", () => {
  const rows = byId(FIXTURE_ASSUMPTIONS);

  it("UT-MS-060 excludes unchanged values and rows", () => {
    expect(buildPatches({ [cellKey("de-wind-m", "cluster1")]: "12" }, rows)).toEqual([]);
  });

  it("UT-MS-061 maps Sales End to vsb_salesduration", () => {
    const patches = buildPatches({ [cellKey("de-wind-m", "salesEnd")]: "30" }, rows);
    expect(patches).toEqual([{ id: "de-wind-m", changes: { vsb_salesduration: 30 }, label: "Wind – Cluster Durations" }]);
  });

  it("UT-MS-062 parses a comma decimal ('0,6' → 0.6) for de-DE", () => {
    const patches = buildPatches({ [cellKey("de-wind-s", "cluster1")]: "0,6" }, rows, "de-DE");
    expect(patches[0]?.changes).toEqual({ vsb_cluster1: 0.6 });
  });

  it("UT-MS-063 duration and success rows produce separate targets with only their column (AC-8a)", () => {
    const patches = buildPatches({
      [cellKey("de-wind-m", "cluster1")]: "13",
      [cellKey("de-wind-s", "cluster1")]: "0.55",
    }, rows);
    expect(patches).toEqual([
      { id: "de-wind-m", changes: { vsb_cluster1: 13 }, label: "Wind – Cluster Durations" },
      { id: "de-wind-s", changes: { vsb_cluster1: 0.55 }, label: "Wind – Success Rates" },
    ]);
  });

  it("UT-MS-064 ignores invalid values and success-row fields that are not editable", () => {
    expect(buildPatches({
      [cellKey("de-wind-m", "cluster1")]: "12.5",
      [cellKey("de-wind-s", "cluster5")]: "0.3",
    }, rows)).toEqual([]);
  });

  it("UT-MS-065 typing over a blank-as-0 prefill writes the typed value", () => {
    const patches = buildPatches({ [cellKey("de-pv-m", "salesStart")]: "4" }, rows);
    expect(patches[0]?.changes).toEqual({ vsb_salesstart: 4 });
  });
});

describe("evaluatePanel (FR-5, FR-7)", () => {
  const de = groupAssumptions(FIXTURE_ASSUMPTIONS).get(GERMANY) ?? [];

  it("UT-MS-070 one column per technology, a duration-only technology in matrix 1 only (AC-5b)", () => {
    const fr = evaluatePanel(groupAssumptions(FIXTURE_ASSUMPTIONS).get(FRANCE) ?? [], {});
    expect(fr.durationColumns.map((c) => c.technology)).toEqual([BESS]);
    expect(fr.rateColumns).toEqual([]);
    expect(evaluatePanel(de, {}).durationColumns.map((c) => c.technology)).toEqual([WIND, PV]);
  });

  it("UT-MS-071 Save gate: nothing changed → disabled; change → enabled; revert → disabled (AC-7a)", () => {
    expect(evaluatePanel(de, {}).canSave).toBe(false);
    expect(evaluatePanel(de, { [cellKey("de-wind-m", "cluster1")]: "13" }).canSave).toBe(true);
    const reverted = evaluatePanel(de, { [cellKey("de-wind-m", "cluster1")]: "12" });
    expect(reverted.canSave).toBe(false);
    expect(reverted.touched).toBe(false);
  });

  it("UT-MS-072 a valid change plus an invalid change keeps Save disabled (AC-7b)", () => {
    const state = evaluatePanel(de, {
      [cellKey("de-wind-m", "cluster1")]: "13",
      [cellKey("de-wind-m", "cluster2")]: "12.5",
      [cellKey("de-pv-s", "cluster1")]: "2",
    });
    expect(state.canSave).toBe(false);
    expect(state.durationErrors).toEqual([MSG.durationInvalid]);
    expect(state.rateErrors).toEqual([MSG.rateInvalid]);
  });

  it("UT-MS-073 lists the canvas message before a bound message", () => {
    const state = evaluatePanel(de, {
      [cellKey("de-wind-m", "cluster2")]: "101",
      [cellKey("de-wind-m", "cluster3")]: "x",
    });
    expect(state.durationErrors).toEqual([MSG.durationInvalid, "Enter a value of at most 100 months"]);
  });
});

describe("saveFailureMessage (FR-8)", () => {
  it("UT-MS-080 names failed and saved rows after the canvas prefix", () => {
    const a = { id: "a", changes: {}, label: "Wind – Cluster Durations" };
    const b = { id: "b", changes: {}, label: "Wind – Success Rates" };
    expect(saveFailureMessage([b], [{ patch: a, reason: "Boom." }])).toBe(
      `${MSG.saveFailed} Boom. Not saved: Wind – Cluster Durations. Saved: Wind – Success Rates.`,
    );
    expect(saveFailureMessage([], [{ patch: a, reason: "Boom." }])).toContain("Nothing was saved.");
  });
});
