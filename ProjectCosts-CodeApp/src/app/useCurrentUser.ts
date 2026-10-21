/**
 * The signed-in user's Dataverse profile and VSB role flags, loaded once per session.
 *
 * Shared by the header badge (`App.tsx`) and by any screen that needs the admin rule; react-query
 * de-duplicates the request, so calling it in several places costs one load.
 */
import { useQuery } from "@tanstack/react-query";
import { loadCurrentUser } from "@/data/currentUser";
import { useSession } from "@/app/SessionContext";
import { adminEntriesVisible } from "@/app/adminAccess";

export function useCurrentUser() {
  const { session } = useSession();
  return useQuery({
    queryKey: ["current-user", session?.entraObjectId ?? ""],
    enabled: Boolean(session?.entraObjectId),
    staleTime: Infinity,
    queryFn: () => loadCurrentUser(session?.entraObjectId),
  });
}

/**
 * `Or(gblCurrentUser.IsApplicationAdministrator, gblCurrentUser.IsControllerOwnData)`, with the
 * local-run bypass — the same answer the header and the admin rail use (`app/adminAccess.ts`).
 */
export function useAdminAccess(): boolean {
  return adminEntriesVisible(useCurrentUser().data);
}
