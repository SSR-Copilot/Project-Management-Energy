/**
 * The Country / Technology selection behind the shared picker.
 *
 * Two storage modes (two hooks), each matching a screen's CURRENT behaviour:
 *
 *   - `useCountryTechnologySelection` (Project Gates, Costs): component state. Until the user picks, the
 *     `defaultTo` policy decides; after a pick, the pick stands (it is not re-validated against
 *     a refetched list — the screens do not do that today either).
 *   - `useCountryTechnologyUrlSelection` (Contracts): `?country=<guid>&tech=<code>` IS the selection, so back /
 *     forward and deep links work. A missing, unknown or stale pair falls back to `defaultTo`,
 *     which since the PO requirement of 2026-10-17 is a REAL default (first country / first
 *     technology), not `none`. The default is DISPLAY-ONLY: nothing writes the params on load, so
 *     the URL stays clean until the user's first pick, and a stale pair is left in the URL while
 *     the default renders. `history: "push"` is unchanged, so Back walks the user's picks and
 *     finally returns to the default view.
 *
 * Both fallbacks are DERIVED (`chosen ?? fallback`, `fromUrl ?? fallback`), never written by an
 * effect — that is what makes a late-arriving country list unable to overwrite a user's pick.
 */
import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  defaultSelection, isSelectable, parseSelectionParams,
  type CountryTechnology, type DefaultSelection, type PickerCountry, type TechnologiesFor,
} from "@/domain/countryPicker";
import type { TechnologyOption } from "@/domain/technology";

export interface CountryTechnologySelectionOptions {
  countries: readonly PickerCountry[];
  technologies: readonly TechnologyOption[];
  defaultTo: DefaultSelection;
  /** URL hook only: push a history entry per pick (default, Contracts) or replace it. */
  history?: "push" | "replace";
  /**
   * E6 (opt-in, pass a STABLE function): per-country technologies. The default skips countries
   * without technologies, a URL naming one is ignored, and a pick for one is refused — so such a
   * country is never the selection. Omitted = unchanged.
   */
  technologiesFor?: TechnologiesFor;
}

export interface CountryTechnologySelection {
  /** `undefined` when nothing is selected (no countries yet, or none offering a technology). */
  selection: CountryTechnology | undefined;
  /** The selected country's row (name, ISO currency, …). */
  country: PickerCountry | undefined;
  /** True while the selection is the policy default rather than an explicit pick / URL. */
  isDefault: boolean;
  select: (next: CountryTechnology) => void;
}

export const COUNTRY_PARAM = "country";
export const TECH_PARAM = "tech";

function useLocalSelection(opts: CountryTechnologySelectionOptions): CountryTechnologySelection {
  const { countries, technologies, defaultTo, technologiesFor } = opts;
  const [chosen, setChosen] = useState<CountryTechnology | undefined>();
  const fallback = useMemo(
    () => defaultSelection(countries, technologies, defaultTo, technologiesFor),
    [countries, technologies, defaultTo, technologiesFor],
  );
  const selection = chosen ?? fallback;
  const country = selection ? countries.find((c) => c.id === selection.countryId) : undefined;
  const select = useCallback((next: CountryTechnology) => {
    if (technologiesFor && !isSelectable(next, countries, technologies, technologiesFor)) return;
    setChosen(next);
  }, [countries, technologies, technologiesFor]);
  return { selection, country, isDefault: chosen === undefined, select: technologiesFor ? select : setChosen };
}

function useUrlSelection(opts: CountryTechnologySelectionOptions): CountryTechnologySelection {
  const { countries, technologies, defaultTo, history = "push", technologiesFor } = opts;
  const [params, setParams] = useSearchParams();
  const countryParam = params.get(COUNTRY_PARAM);
  const techParam = params.get(TECH_PARAM);
  const fromUrl = useMemo(
    () => parseSelectionParams(countryParam, techParam, countries, technologies, technologiesFor),
    [countryParam, techParam, countries, technologies, technologiesFor],
  );
  const fallback = useMemo(
    () => defaultSelection(countries, technologies, defaultTo, technologiesFor),
    [countries, technologies, defaultTo, technologiesFor],
  );
  const selection = fromUrl ?? fallback;
  const country = selection ? countries.find((c) => c.id === selection.countryId) : undefined;
  const select = useCallback(
    (next: CountryTechnology) => {
      if (technologiesFor && !isSelectable(next, countries, technologies, technologiesFor)) return;
      setParams({ [COUNTRY_PARAM]: next.countryId, [TECH_PARAM]: String(next.technology) }, { replace: history === "replace" });
    },
    [setParams, history, technologiesFor, countries, technologies],
  );
  return { selection, country, isDefault: fromUrl === undefined, select };
}

/** Local-state selection (Project Gates, Costs). Needs no router. */
export function useCountryTechnologySelection(opts: CountryTechnologySelectionOptions): CountryTechnologySelection {
  return useLocalSelection(opts);
}

/** `?country&tech` selection (Contracts). Must render inside a router. */
export function useCountryTechnologyUrlSelection(opts: CountryTechnologySelectionOptions): CountryTechnologySelection {
  return useUrlSelection(opts);
}
