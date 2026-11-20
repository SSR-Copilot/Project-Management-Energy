/**
 * The Generators orderable catalogue kept across sessions (D142, `GENERATORS_PERF.persistCatalogue`, default OFF).
 *
 * WHAT IS STORED: the rows of `listOrderableGenerators` after `toModel`, i.e. these `vsb_generator` columns and nothing else:
 * id, name, display name, supplier, turbine type, hub height, rotor diameter, specific capacity, total height, earliest
 * phase-out, country availability (option-set numbers), foundation cost included, additional foundation cost, and the five
 * WTG prices. It is the manufacturers' model list: reference data, the same for every project and every user of the
 * tenant. No project row, no person, no id of a user or of a project is stored; the key is the FID date the read filters on.
 *
 * VERSION: a new app build (`__APP_BUILD__`, set by `vite.config.ts`), a changed column list (`GENERATOR_COL`, which the
 * read's `$select` is built from), or a changed row shape (`SHAPE`, bump it when `CatalogModel` changes) drops every
 * entry, so a cache written by an older build is never shown.
 *
 * MAXIMUM AGE, 12 hours: the models and prices change when an administrator maintains the catalogue (rare, a few times a
 * year), while a session is a working day at most. Because every use re-reads the server straight away and replaces the
 * cached rows, the age limit only bounds how old the rows may be when the re-read FAILS (or is slow): 12 h means
 * "yesterday evening's catalogue is not shown to someone starting work the next morning", yet a whole working day of
 * visits is served from one morning's copy while the server answers. Raise it only with the product owner.
 */
import { GENERATOR_COL, type CatalogModel } from "@/features/pm/generators/rules";
import { createPersistedReference, fingerprint, referenceVersion, type PersistedReference } from "./persistedReference";

/** Bump when `CatalogModel` (the stored row shape) changes. */
const SHAPE = "1";

/** The longest a stored catalogue may be shown (see the file header). */
export const GENERATOR_CATALOGUE_MAX_AGE_MS = 12 * 60 * 60 * 1000;

declare const __APP_BUILD__: string | undefined;

/** The build this code came from (`vite.config.ts` `define`); `"dev"` where it is not defined (a bare test run). */
const appBuild = (): string => (typeof __APP_BUILD__ === "string" ? __APP_BUILD__ : "dev");

/** The version key of the stored catalogue (exported for the tests). */
export const generatorCatalogueVersion = (): string =>
  referenceVersion(`shape${SHAPE}`, appBuild(), fingerprint(Object.values(GENERATOR_COL).join(",")));

/** Is `data` a list of catalogue rows (the shape check of a stored entry)? */
export const isCatalogModels = (data: unknown): data is CatalogModel[] =>
  Array.isArray(data) && data.every((m) => typeof m === "object" && m !== null
    && typeof (m as CatalogModel).id === "string" && Array.isArray((m as CatalogModel).prices)
    && Array.isArray((m as CatalogModel).countryAvailability));

let instance: PersistedReference<CatalogModel[]> | null = null;

/** The catalogue cache (one per page load; IndexedDB is opened on first use). */
export function generatorCatalogueCache(): PersistedReference<CatalogModel[]> {
  instance ??= createPersistedReference<CatalogModel[]>({
    name: "generatorCatalogue",
    version: generatorCatalogueVersion(),
    maxAgeMs: GENERATOR_CATALOGUE_MAX_AGE_MS,
    validate: isCatalogModels,
    rowsOf: (rows) => rows.length,
  });
  return instance;
}

/** Test seam: replaces (or, with `null`, forgets) the cache instance. */
export function setGeneratorCatalogueCache(next: PersistedReference<CatalogModel[]> | null): void {
  instance = next;
}
