/**
 * The loaders of the two screens the app usually opens on, as named functions.
 *
 * `routes.tsx` wraps them in `lazy()`; `bootPrefetch.ts` calls them at once, so the screen's chunk
 * downloads beside the session and the first reads instead of after them (D119). The
 * module system returns the same promise for both, so nothing is fetched twice.
 */
export const loadProjectOverviewScreen = () => import("@/features/pm/project-main/Screen");
export const loadGeneralDataScreen = () => import("@/features/pm/general-data/Screen");
/** The Generators screen: `bootPrefetch.ts` and `generatorsWarmup.ts` start its chunk before the route needs it (D141). */
export const loadGeneratorsScreen = () => import("@/features/pm/generators/Screen");
