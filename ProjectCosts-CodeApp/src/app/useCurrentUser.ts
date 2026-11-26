/**
 * The signed-in user's Dataverse profile and VSB role flags, loaded once per session.
 *
 * Shared by the header badge (`App.tsx`) and by any screen that needs the admin rule; react-query
 * de-duplicates the request, so calling it in several places costs one load.
 */
import { useQuery } from "@tanstack/react-query";
import { countriesQueryOptions } from "@/data/countries";
import { loadCurrentUser } from "@/data/currentUser";
import { useSession } from "@/app/SessionContext";
import { adminEntriesVisible } from "@/app/adminAccess";

export function useCurrentUser() {
  const { session } = useSession();
  return useQuery({
    queryKey: ["current-user", session?.entraObjectId ?? ""],
    enabled: Boolean(session?.entraObjectId),
    staleTime: Infinity,
    // PB-06: the country-to-business-unit map is a view of the shared `vsb_countries` entry, not a read of its own.
    queryFn: ({ client }) => loadCurrentUser(session?.entraObjectId, {
      readCountries: async () => (await client.fetchQuery(countriesQueryOptions)).map((c) => ({
        vsb_name: c.name, _vsb_businessunit_value: c.businessUnitId ?? null,
      })),
    }),
  });
}

/**
 * `Or(gblCurrentUser.IsApplicationAdministrator, gblCurrentUser.IsControllerOwnData)`, with the
 * local-run bypass — the same answer the header and the admin rail use (`app/adminAccess.ts`).
 */
export function useAdminAccess(): boolean {
  return adminEntriesVisible(useCurrentUser().data);
}
