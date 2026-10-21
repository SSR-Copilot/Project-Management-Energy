/**
 * The data seam for a screen whose Dataverse tables are not connected yet.
 *
 * The Administration and Project Management screens are built UI-first: layout, controls,
 * captions and pure rules are in place, but their tables are not registered in this app
 * (`power.config.json`, `src/generated/`). Until they are, each screen's `hooks.ts` returns
 * this instead of querying — no request is made and no row is invented. There is no mock mode
 * in this app and this is not one: every list is empty and every write command is disabled.
 *
 * Connecting a screen is `ProjectDocs/instructions/MIGRATION-STRATEGY.md` steps 4 and 6:
 *   1. `pac code add-data-source -a dataverse -t <logical-name>` for each table the screen's
 *      `TABLES` list names (and diff `dataSourcesInfo.ts` afterwards — CONVENTIONS rule 9);
 *   2. replace the `hooks.ts` body with TanStack Query over the generated service, through
 *      `data/client.ts` (`fetchAll` / `fetchPage` / `deleteRecord`) and `platform/errors`
 *      (`unwrap`), with `$select` on every query and the filter built by `data/odata.ts`;
 *   3. return `{ data, isLoading, error, connected: true }` from the same hook, so `Screen.tsx`
 *      does not change.
 */
export interface ScreenData<T> {
  data: T;
  isLoading: boolean;
  error: unknown;
  /** False until the screen's tables are registered and its hooks query them. */
  connected: boolean;
}

/** The value a not-yet-connected hook returns: the empty shape, not loading, no error. */
export function notConnected<T>(empty: T): ScreenData<T> {
  return { data: empty, isLoading: false, error: undefined, connected: false };
}
