/**
 * General Data — the dropdown option lists, built from the generated choice maps.
 *
 * Since the `pa` CLI 1.2.0 regeneration (SDK 1.5.0) the generated choice maps hold the real
 * Dataverse DISPLAY labels ("3rd Party", "Green Yield One (IPP2)", "GmbH & Co. KG", "Cluster 2"),
 * which are exactly what the canvas `Choices(...)` dropdowns show — so they are used verbatim.
 * (The old identifier-style keys needed a `humanize` pass that also mangled "GmbH" into "Gmb H".)
 * Every exclusion below keys on the OPTION VALUE, never on label text.
 */
import { TECHNOLOGY } from "@/domain/project";
import {
  Vsb_projectsvsb_developmenttype, Vsb_projectsvsb_financingoptions,
  Vsb_projectsvsb_ownershiptype, Vsb_projectsvsb_spvlegalstructure,
  Vsb_projectsvsb_startcluster, Vsb_projectsvsb_subtechnology1, Vsb_projectsvsb_technology,
} from "@/generated/models/Vsb_projectsModel";
import { Vsb_shareholderentitiiesvsb_shareholderentitiytype } from "@/generated/models/Vsb_shareholderentitiiesModel";
import type { ChoiceOption } from "./Fields";

export function enumOptions(source: Record<number, string>): ChoiceOption[] {
  return Object.entries(source).map(([value, label]) => ({ value: Number(value), label }));
}

// Canvas: `Filter(Choices(Technology), Text(Value) <> "Hybrid")` — PGDS:1922. Keyed on the
// option value (952850002) instead of the label so a relabel cannot re-open Hybrid.
export const TECHNOLOGY_OPTIONS = enumOptions(Vsb_projectsvsb_technology)
  .filter((o) => o.value !== TECHNOLOGY.hybrid);

export const SUB_TECHNOLOGY_OPTIONS = enumOptions(Vsb_projectsvsb_subtechnology1);
export const DEVELOPMENT_TYPE_OPTIONS = enumOptions(Vsb_projectsvsb_developmenttype);

// Canvas: `Filter(Choices(StartCluster), Not(Value in [Greenfield, Cluster 1]))` — PGDS:2607–2615.
/** `vsb_startcluster` option values 0 (Greenfield) and 1 (Cluster 1). */
export const EXCLUDED_START_CLUSTERS: ReadonlySet<number> = new Set([0, 1]);
export const START_CLUSTER_OPTIONS = enumOptions(Vsb_projectsvsb_startcluster)
  .filter((o) => !EXCLUDED_START_CLUSTERS.has(o.value));

export const OWNERSHIP_TYPE_OPTIONS = enumOptions(Vsb_projectsvsb_ownershiptype);
export const FINANCING_OPTIONS = enumOptions(Vsb_projectsvsb_financingoptions);
export const SPV_LEGAL_STRUCTURE_OPTIONS = enumOptions(Vsb_projectsvsb_spvlegalstructure);
export const SHAREHOLDER_TYPE_OPTIONS = enumOptions(Vsb_shareholderentitiiesvsb_shareholderentitiytype);
