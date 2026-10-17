/**
 * The signed-in user's badge rows and role flags — ONE query definition for the whole app.
 *
 * The header (`App.tsx`), the Application Settings route gate (`SettingsGate`) and General Data's
 * country scoping all read the same cache entry, `qk.currentUser(entraObjectId)`. Loaded once per
 * session (`staleTime: Infinity`); `refetch()` is the only way to re-read it, which is what the
 * gate's Retry does after a role-read failure.
 */
import { queryOptions, useQuery } from "@tanstack/react-query";
import { loadCurrentUser } from "@/data/currentUser";
import { qk } from "@/data/keys";
import { useSession } from "./SessionContext";

export function currentUserQueryOptions(entraObjectId: string | undefined) {
  return queryOptions({
    queryKey: qk.currentUser(entraObjectId),
    enabled: Boolean(entraObjectId),
    staleTime: Infinity,
    queryFn: () => loadCurrentUser(entraObjectId),
  });
}

/** The current session user's query. */
export function useCurrentUser() {
  const { session } = useSession();
  return useQuery(currentUserQueryOptions(session?.entraObjectId));
}
