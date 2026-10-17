/**
 * Milestones settings — every business rule, as pure functions.
 *
 * Canvas: `Admin Milestones Screen.pa.yaml` (AMS). Requirements: `06-code-app-requirements/
 * 01-build-requirements.md` (FR-n / DR-n cited per function).
 */
import { numberFormat } from "@/domain/locale";
import { checkDecimalInput } from "@/domain/numberInput";
import type { CountryRecord } from "@/data/countries";
import {
  FIELD_COLUMNS,
  type MilestoneAssumption, type MilestoneCountry, type MilestoneField, type MilestonePatch,
} from "@/data/settings/milestones";
import {
  DURATION_FIELDS, KIND_LABEL, MSA_KIND, MSG, RATE_FIELDS, technologyName,
  type DurationFieldDef, type MatrixKind,
} from "./constants";

/* ═══════════════════════════════════════════════════════════ FR-2 countries ══ */

function numericKey(key: string | undefined): number | undefined {
  const t = key?.trim();
  if (!t) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

/** The shared countries read (`useActiveCountries`, M6) as this screen's section model (DR-1). */
export function toMilestoneCountries(rows: readonly CountryRecord[]): MilestoneCountry[] {
  return rows.map((r) => ({ id: r.id, name: r.name, key: r.title }));
}

/**
 * `SortByColumns(AddColumns(Countries, Order, Value(Key)), "Order")` (AMS:30-44). Numeric keys
 * first, ascending; blank or non-numeric keys last, by name (D-DATA-4 default).
 */
export function sortCountries(countries: readonly MilestoneCountry[]): MilestoneCountry[] {
  return [...countries].sort((a, b) => {
    const ka = numericKey(a.key);
    const kb = numericKey(b.key);
    if (ka !== undefined && kb !== undefined && ka !== kb) return ka - kb;
    if (ka !== undefined && kb === undefined) return -1;
    if (ka === undefined && kb !== undefined) return 1;
    return a.name.localeCompare(b.name);
  });
}

/* ════════════════════════════════════════════════════════════ DR-3 grouping ══ */

export interface TechnologyGroup {
  /** `vsb_technology`; `undefined` for a blank Technology, which is its own group (parity R1 GAP-3). */
  technology: number | undefined;
  /** The `average duration [months]` row (first one, if duplicated). */
  durations?: MilestoneAssumption;
  /** The `success rate [-]` row (first one, if duplicated). */
  successRates?: MilestoneAssumption;
  /** Further rows of a kind already taken — a data-quality warning, never edited. */
  duplicates: MilestoneAssumption[];
}

/**
 * Blank Technology first, then option value ascending: `Sort(GroupBy(…), vsb_technology,
 * SortOrder.Ascending)` (AMS:457-467) — Power Fx sorts blanks first in ascending order.
 */
function compareTechnology(a: number | undefined, b: number | undefined): number {
  if (a === b) return 0;
  if (a === undefined) return -1;
  if (b === undefined) return 1;
  return a - b;
}

/**
 * Country → technology groups, technologies ascending by option value (AMS:466). Rows are
 * classified by the EXACT kind name; other names (e.g. "average duration [years]") are ignored.
 * Input order decides "first" — the data module reads ordered by `createdon`, id.
 *
 * A blank Technology is its own group, as `GroupBy(…, Technology, Techs)` keeps it (AMS:458-465):
 * it is shown and edited like any other technology (parity R1 GAP-3).
 */
export function groupAssumptions(
  rows: readonly MilestoneAssumption[],
): Map<string, TechnologyGroup[]> {
  const byCountry = new Map<string, Map<number | undefined, TechnologyGroup>>();
  for (const row of rows) {
    if (!row.countryId) continue;
    const kind = row.name === MSA_KIND.months ? "durations"
      : row.name === MSA_KIND.successRate ? "successRates" : undefined;
    if (!kind) continue;
    let techs = byCountry.get(row.countryId);
    if (!techs) { techs = new Map(); byCountry.set(row.countryId, techs); }
    let group = techs.get(row.technology);
    if (!group) { group = { technology: row.technology, duplicates: [] }; techs.set(row.technology, group); }
    if (group[kind]) group.duplicates.push(row);
    else group[kind] = row;
  }
  const out = new Map<string, TechnologyGroup[]>();
  for (const [countryId, techs] of byCountry) {
    out.set(countryId, [...techs.values()].sort((a, b) => compareTechnology(a.technology, b.technology)));
  }
  return out;
}

/** Human description of duplicate rows for a warning, or undefined when there are none. */
export function duplicatesWarning(groups: readonly TechnologyGroup[]): string | undefined {
  const parts = groups.flatMap((g) => g.duplicates.map((d) =>
    `${technologyName(g.technology)} (${d.name === MSA_KIND.months ? KIND_LABEL.durations : KIND_LABEL.successRates})`));
  if (parts.length === 0) return undefined;
  const unique = [...new Set(parts)];
  return `Duplicate assumption rows exist for ${unique.join(", ")}. The first row of each is shown and edited; ask an administrator to remove the others.`;
}

/* ══════════════════════════════════════════════════════════ FR-3 cell text ══ */

/**
 * Display a stored number: user locale, up to 2 decimals, no grouping; blank → "-" (D-UI-3).
 * Always Latin digits (gap C-6): the locale picks only the decimal separator, so native-digit
 * locales such as `ar-EG` show "12", matching what the user types and what validation accepts.
 */
export function formatValue(value: number | undefined, locale?: string): string {
  if (value === undefined) return "-";
  return numberFormat(locale, { maximumFractionDigits: 2, useGrouping: false, numberingSystem: "latn" }).format(value);
}

export interface MatrixCell {
  key: string;
  duration: string;
  rate: string;
}

/**
 * The nine two-line cells of a read-only matrix row (AMS:553-796):
 *  - Cluster 1–4: duration / success rate of the same column.
 *  - FID: duration (blank → "-", by product decision instead of the canvas 0.75) / literal 1.
 *  - Cluster 5: duration / literal 1 (D-DATA-6 parity; the stored success value is ignored).
 *  - Operational Lifetime: duration / success value, "-" when blank.
 *  - Sales Start, Sales End (`vsb_salesduration`): duration / "-".
 */
export function matrixCells(group: TechnologyGroup, locale?: string): MatrixCell[] {
  const d = group.durations?.values;
  const s = group.successRates?.values;
  const dur = (f: MilestoneField) => formatValue(d?.[f], locale);
  const rate = (f: MilestoneField) => formatValue(s?.[f], locale);
  return [
    { key: "cluster1", duration: dur("cluster1"), rate: rate("cluster1") },
    { key: "cluster2", duration: dur("cluster2"), rate: rate("cluster2") },
    { key: "cluster3", duration: dur("cluster3"), rate: rate("cluster3") },
    { key: "cluster4", duration: dur("cluster4"), rate: rate("cluster4") },
    { key: "fid", duration: dur("fid"), rate: "1" },
    { key: "cluster5", duration: dur("cluster5"), rate: "1" },
    { key: "operationalLifetime", duration: dur("operationalLifetime"), rate: rate("operationalLifetime") },
    { key: "salesStart", duration: dur("salesStart"), rate: "-" },
    { key: "salesEnd", duration: dur("salesEnd"), rate: "-" },
  ];
}

/* ═══════════════════════════════════════════════════════════ FR-6 validation ══ */

export type ValidationResult = { ok: true; value: number } | { ok: false; message: string };

/**
 * Durations: `^\d+$` (AMS:1360) — a whole number ≥ 0, no sign or separator — AND the Dataverse
 * column maximum (D-VAL-1: 100 for clusters, 1000 for the others) so the server never rejects
 * a save. Surrounding whitespace is ignored (the canvas rejected " 6").
 */
export function validateDuration(text: string, max: number): ValidationResult {
  // Shared E11; with 0 decimals the separator rule is irrelevant (digits only).
  const check = checkDecimalInput(text, { maxDecimals: 0, separator: "both", max });
  if (check.kind === "ok") return { ok: true, value: check.value };
  if (check.kind === "range") return { ok: false, message: `Enter a value of at most ${max} months` };
  return { ok: false, message: MSG.durationInvalid };
}

/**
 * Success rates: non-blank, at most 2 decimals, in [0, 1] (AMS:2068-2110).
 *
 * Locale-safe: "." and "," are both accepted as the decimal separator whatever the browser
 * language. The canvas accepted only the separator of the browser language, so "0.5" failed for
 * a German user. No sign (D-VAL-3); a trailing separator ("1.") is accepted as the canvas did.
 */
export function validateSuccessRate(text: string): ValidationResult {
  const check = checkDecimalInput(text, {
    maxDecimals: 2, separator: "both", min: 0, max: 1, allowTrailingSeparator: true,
  });
  return check.kind === "ok" ? { ok: true, value: check.value } : { ok: false, message: MSG.rateInvalid };
}

/* ═════════════════════════════════════════════════════════════ FR-5 draft ══ */

/** The user's typed text, keyed by `cellKey(rowId, field)`. Untyped cells are absent. */
export type Draft = Readonly<Record<string, string>>;

export const cellKey = (rowId: string, field: MilestoneField): string => `${rowId}:${field}`;

/** A stored number as an editable string (user locale separator, Latin digits, no grouping). */
function editText(value: number, locale?: string): string {
  return numberFormat(locale, { maximumFractionDigits: 6, useGrouping: false, numberingSystem: "latn" }).format(value);
}

/**
 * What an input starts with (FR-5): the stored value as text, or empty when blank.
 *
 * A blank Cluster 5 / Operational Lifetime / Sales Start / Sales End duration still SHOWS "0"
 * (canvas `Coalesce(…, "0")`), but as a placeholder (`placeholderText`), not as the value
 * (gap C-5 / B4): with "0" as the value, a typed "0" equalled the initial text, was never
 * dirty, and a blank could not be turned into a stored 0.
 */
export function initialText(
  _kind: MatrixKind, _field: MilestoneField, stored: number | undefined, locale?: string,
): string {
  return stored !== undefined ? editText(stored, locale) : "";
}

/** The greyed hint of an input: "0" for a blank blank-as-zero duration (FR-5), else none. */
export function placeholderText(
  kind: MatrixKind, field: MilestoneField, stored: number | undefined,
): string | undefined {
  return stored === undefined && kind === "durations" && durationDef(field)?.blankAsZero ? "0" : undefined;
}

function durationDef(field: MilestoneField): DurationFieldDef | undefined {
  return DURATION_FIELDS.find((d) => d.field === field);
}

export interface CellState {
  text: string;
  /** Greyed hint shown while the input is empty ("0" for blank-as-zero durations, FR-5). */
  placeholder?: string;
  /** The text differs from what the input started with. Only touched cells are validated. */
  touched: boolean;
  /** Validation message for a touched, invalid cell. */
  error?: string;
  /** Touched, valid, and the parsed value differs from the stored one (FR-7, D-SAVE-3). */
  dirty: boolean;
  value?: number;
}

/** FR-6 / FR-7 for one input. */
export function evaluateCell(
  kind: MatrixKind,
  field: MilestoneField,
  stored: number | undefined,
  typed: string | undefined,
  locale?: string,
): CellState {
  const initial = initialText(kind, field, stored, locale);
  const placeholder = placeholderText(kind, field, stored);
  const hint = placeholder === undefined ? {} : { placeholder };
  const text = typed ?? initial;
  if (text === initial) return { text, ...hint, touched: false, dirty: false };
  const result = kind === "durations"
    ? validateDuration(text, durationDef(field)?.max ?? 1000)
    : validateSuccessRate(text);
  if (!result.ok) return { text, ...hint, touched: true, error: result.message, dirty: false };
  return { text, ...hint, touched: true, dirty: result.value !== stored, value: result.value };
}

/** Which fields a row of a given kind can edit. */
export function editableFields(kind: MatrixKind): readonly MilestoneField[] {
  return kind === "durations" ? DURATION_FIELDS.map((d) => d.field) : RATE_FIELDS.map((r) => r.field);
}

export function kindOf(row: MilestoneAssumption): MatrixKind | undefined {
  if (row.name === MSA_KIND.months) return "durations";
  if (row.name === MSA_KIND.successRate) return "successRates";
  return undefined;
}

/* ════════════════════════════════════════════════════════ DR-4 patches ══ */

/**
 * `{ id, changes }` per row with at least one DIRTY field; only those columns are written.
 * Invalid and untouched cells contribute nothing (the Save gate keeps invalid ones from ever
 * reaching here). "Sales End" maps to `vsb_salesduration`.
 */
export function buildPatches(
  draft: Draft,
  rowsById: ReadonlyMap<string, MilestoneAssumption>,
  locale?: string,
): MilestonePatch[] {
  const patches: MilestonePatch[] = [];
  for (const row of rowsById.values()) {
    const kind = kindOf(row);
    if (!kind) continue;
    const changes: MilestonePatch["changes"] = {};
    for (const field of editableFields(kind)) {
      const key = cellKey(row.id, field);
      if (!(key in draft)) continue;
      const cell = evaluateCell(kind, field, row.values[field], draft[key], locale);
      if (cell.dirty && cell.value !== undefined) changes[FIELD_COLUMNS[field]] = cell.value;
    }
    if (Object.keys(changes).length > 0) {
      patches.push({ id: row.id, changes, label: `${technologyName(row.technology)} – ${KIND_LABEL[kind]}` });
    }
  }
  return patches;
}

/* ═════════════════════════════════════════════════════ panel evaluation ══ */

export interface PanelColumn {
  technology: number | undefined;
  row: MilestoneAssumption;
}

export interface PanelState {
  durationColumns: PanelColumn[];
  rateColumns: PanelColumn[];
  cells: Map<string, CellState>;
  durationErrors: string[];
  rateErrors: string[];
  /** Any cell differs from what it started with (drives the discard confirmation, FR-9). */
  touched: boolean;
  patches: MilestonePatch[];
  /** FR-7: at least one real change and no touched cell invalid. */
  canSave: boolean;
}

/**
 * Everything the edit panel renders and gates on, from the country's groups and the draft.
 * A technology with only a duration row appears in the durations matrix only (AC-5b).
 */
export function evaluatePanel(
  groups: readonly TechnologyGroup[], draft: Draft, locale?: string,
): PanelState {
  const durationColumns = groups.flatMap((g) => (g.durations ? [{ technology: g.technology, row: g.durations }] : []));
  const rateColumns = groups.flatMap((g) => (g.successRates ? [{ technology: g.technology, row: g.successRates }] : []));
  const cells = new Map<string, CellState>();
  const durationErrors = new Set<string>();
  const rateErrors = new Set<string>();
  let touched = false;

  const visit = (cols: PanelColumn[], kind: MatrixKind, errors: Set<string>) => {
    for (const { row } of cols) {
      for (const field of editableFields(kind)) {
        const key = cellKey(row.id, field);
        const cell = evaluateCell(kind, field, row.values[field], draft[key], locale);
        cells.set(key, cell);
        if (cell.touched) touched = true;
        if (cell.error) errors.add(cell.error);
      }
    }
  };
  visit(durationColumns, "durations", durationErrors);
  visit(rateColumns, "successRates", rateErrors);

  const rowsById = new Map<string, MilestoneAssumption>();
  for (const c of [...durationColumns, ...rateColumns]) rowsById.set(c.row.id, c.row);
  const patches = buildPatches(draft, rowsById, locale);
  const hasErrors = durationErrors.size > 0 || rateErrors.size > 0;

  return {
    durationColumns, rateColumns, cells,
    // The canvas section message first, then any bound message.
    durationErrors: [
      ...[...durationErrors].filter((m) => m === MSG.durationInvalid),
      ...[...durationErrors].filter((m) => m !== MSG.durationInvalid),
    ],
    rateErrors: [...rateErrors],
    touched, patches,
    canSave: patches.length > 0 && !hasErrors,
  };
}

/* ═══════════════════════════════════════════════════════ FR-8 save message ══ */

/**
 * The persistent error text for a save with failed rows: canvas prefix, the server (or
 * permission) message, then which rows were and were not saved — the writes are not
 * transactional (D-SAVE-2).
 */
export function saveFailureMessage(
  saved: readonly MilestonePatch[],
  failed: readonly { patch: MilestonePatch; reason: string }[],
): string {
  const reasons = [...new Set(failed.map((f) => f.reason))].join(" ");
  const notSaved = `Not saved: ${failed.map((f) => f.patch.label).join(", ")}.`;
  const savedText = saved.length > 0 ? ` Saved: ${saved.map((p) => p.label).join(", ")}.` : " Nothing was saved.";
  return `${MSG.saveFailed} ${reasons} ${notSaved}${savedText}`;
}
