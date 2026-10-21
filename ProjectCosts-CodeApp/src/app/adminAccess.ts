/**
 * Who sees the administration entry points — the header's "Application Settings" row and the
 * admin rail.
 *
 * Canvas: every `LeftAdminNavigationMenu` row and the user menu's `appSettingsKey` carry
 * `ItemVisible: Or(gblCurrentUser.IsApplicationAdministrator, gblCurrentUser.IsControllerOwnData)`.
 * Only those two VSB roles count — not the Dataverse "System Administrator" role (decision
 * 19 Oct 2026, 02-OPEN-DECISIONS D14 a).
 *
 * LOCAL-RUN BYPASS (decision 19 Oct 2026): while the app is run locally for validation
 * (`npm run dev`, alongside `pac code run`), Vite's DEV flag is true and every admin entry is
 * shown, as if the user were a system administrator. Any `npm run build` — which is what
 * `pac code push` deploys — compiles `import.meta.env.DEV` to `false`, so the bypass cannot
 * reach a pushed app. Neither path is security: Dataverse role privileges are (decision D1).
 */
import { canSeeAdminSection } from "@/domain/session";
import type { CurrentUser } from "@/data/currentUser";

export type AdminFlags = Pick<CurrentUser, "isApplicationAdministrator" | "isControllerOwnData">;

export function adminEntriesVisible(
  user: AdminFlags | undefined,
  localRun: boolean = import.meta.env.DEV,
): boolean {
  if (localRun) return true;
  return user !== undefined && canSeeAdminSection(user);
}
