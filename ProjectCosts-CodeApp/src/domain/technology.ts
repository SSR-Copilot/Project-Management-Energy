/**
 * `Technology` — the `CHOICE_PROCESS.technology` option set, and the two directions of
 * translation every screen that shows or filters it needs.
 *
 * This lives in `domain/` rather than in `features/project-main/rules.ts` for a concrete
 * reason. The column is a Dataverse *choice*, so a row carries the integer `952850000` and a
 * `FormattedValue` sibling reading `"Wind"`. `features/shared/useProjectContext.ts` maps a
 * project row into the store, and the app header renders `selected.technology` directly — so
 * without a shared resolver the header displays the raw `952850000`. A feature module cannot
 * be imported by shared code without inverting the dependency, hence here.
 *
 * `features/project-main/rules.ts` re-exports these, so its existing importers are unaffected.
 */
import { CHOICE_PROCESS } from "@/data/dataverseNames";
import { TECHNOLOGY as TECHNOLOGY_CODES } from "./project";

export const TECHNOLOGY_LABEL: Record<number, string> = {
  [CHOICE_PROCESS.technology.wind]: "Wind",
  [CHOICE_PROCESS.technology.pv]: "PV",
  [CHOICE_PROCESS.technology.hybrid]: "Hybrid",
  [CHOICE_PROCESS.technology.bess]: "BESS",
  [CHOICE_PROCESS.technology.hydrogen]: "Hydrogen",
  [CHOICE_PROCESS.technology.hydro]: "Hydro",
  [CHOICE_PROCESS.technology.substation]: "Substation",
};

const LABEL_TO_TECHNOLOGY = new Map(
  Object.entries(TECHNOLOGY_LABEL).map(([v, label]) => [label.toLowerCase(), Number(v)]),
);

/**
 * Accepts the option-set integer (live Dataverse, and the current fixture), the same integer
 * as a string (which is how it arrives on a URL search param), or the legacy label string
 * that the fixture used before it migrated. Returns null for anything else.
 */
export function technologyValue(v: unknown): number | null {
  if (typeof v === "number" && TECHNOLOGY_LABEL[v] !== undefined) return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (v.trim() !== "" && Number.isFinite(n) && TECHNOLOGY_LABEL[n] !== undefined) return n;
    return LABEL_TO_TECHNOLOGY.get(v.trim().toLowerCase()) ?? null;
  }
  return null;
}

/**
 * Prefers the row's own `FormattedValue`, because that is what the environment's own
 * localisation produced; falls back to the transcribed map, then to an empty string. Never
 * returns the raw integer — a header reading "952850000" is the bug this exists to prevent.
 */
export function technologyLabel(v: unknown, formatted?: unknown): string {
  if (typeof formatted === "string" && formatted) return formatted;
  const n = technologyValue(v);
  return n === null ? "" : TECHNOLOGY_LABEL[n] ?? "";
}

/* ═══════════════════════════════════ Application Settings picker options (additive) ══ */

/*
 * Technology options for the Application Settings Country / Technology picker
 * (`components/CountryTechnologyPicker.tsx`), ported with those screens. The integers are the
 * global choice `vsb_technology` (`TECHNOLOGY` in `./project`). Settings rules match
 * technologies by CODE, never by label; labels here are display only.
 */
export { TECHNOLOGY } from "./project";

/** One technology a picker offers. */
export interface TechnologyOption {
  code: number;
  label: string;
}

const option = (code: number): TechnologyOption => ({ code, label: TECHNOLOGY_LABEL[code] ?? String(code) });

/** Gates & Approvals: Wind then PV. */
export const GATE_TECHNOLOGIES: readonly TechnologyOption[] = [option(TECHNOLOGY_CODES.wind), option(TECHNOLOGY_CODES.pv)];
/** Cost: Wind then PV. */
export const COST_TECHNOLOGIES: readonly TechnologyOption[] = [option(TECHNOLOGY_CODES.wind), option(TECHNOLOGY_CODES.pv)];
/** Contract: Wind, PV, BESS. */
export const CONTRACT_TECHNOLOGIES: readonly TechnologyOption[] = [
  option(TECHNOLOGY_CODES.wind), option(TECHNOLOGY_CODES.pv), option(TECHNOLOGY_CODES.bess),
];

/** Display label for a code; `""` for an unknown code (never the raw integer). */
export function technologyOptionLabel(code: number | null | undefined): string {
  if (code === null || code === undefined) return "";
  return TECHNOLOGY_LABEL[code] ?? "";
}
