/**
 * Technology options for the Application Settings Country / Technology pickers (M6, M10).
 *
 * The integers are the global choice `vsb_technology`, taken from `domain/project.ts`
 * `TECHNOLOGY` (itself read from the generated models). Three screens restated them locally:
 * Project Gates `TECH`, Costs `TECHNOLOGY` (`data/settings/costs.ts`) and Contracts (derived from
 * the generated `TechnologyMap`). `technology.test.ts` checks all of them against this file.
 *
 * Settings rules match technologies by CODE, never by label (Project Gates DR-3 / D-15,
 * Contracts D-21). Labels here are display only.
 */
import { TECHNOLOGY, TECHNOLOGY_LABEL } from "./project";

export { TECHNOLOGY, TECHNOLOGY_LABEL };

/** One technology a picker offers. `label` equals Project Gates' `TechKey` string. */
export interface TechnologyOption {
  code: number;
  label: string;
}

const option = (code: number): TechnologyOption => ({ code, label: TECHNOLOGY_LABEL[code] ?? String(code) });

/** Project Gates: Wind then PV (PGAS:273-366). */
export const GATE_TECHNOLOGIES: readonly TechnologyOption[] = [option(TECHNOLOGY.wind), option(TECHNOLOGY.pv)];
/** Costs: Wind then PV (ACS:639-733). */
export const COST_TECHNOLOGIES: readonly TechnologyOption[] = [option(TECHNOLOGY.wind), option(TECHNOLOGY.pv)];
/** Contracts: Wind, PV, BESS (ACS:428-534). */
export const CONTRACT_TECHNOLOGIES: readonly TechnologyOption[] = [
  option(TECHNOLOGY.wind), option(TECHNOLOGY.pv), option(TECHNOLOGY.bess),
];

/** Display label for a code; `""` for an unknown code (never the raw integer). */
export function technologyOptionLabel(code: number | null | undefined): string {
  if (code === null || code === undefined) return "";
  return TECHNOLOGY_LABEL[code] ?? "";
}

/**
 * A technology code from a URL parameter (`?tech=952850000`), restricted to `allowed`.
 * Returns `undefined` for anything else, so a hand-edited link falls back to the screen's
 * default instead of throwing.
 */
export function parseTechnologyParam(
  raw: string | null | undefined, allowed: readonly TechnologyOption[],
): number | undefined {
  if (raw === null || raw === undefined || raw.trim() === "") return undefined;
  const code = Number(raw.trim());
  if (!Number.isInteger(code)) return undefined;
  return allowed.some((t) => t.code === code) ? code : undefined;
}

/**
 * Project Gates keys its rules by label (`"Wind" | "PV"`); the shared picker works in codes.
 * These two helpers are the bridge while that screen adopts codes.
 */
export function technologyCodeByLabel(label: string, allowed: readonly TechnologyOption[]): number | undefined {
  const wanted = label.trim().toLowerCase();
  return allowed.find((t) => t.label.toLowerCase() === wanted)?.code;
}
