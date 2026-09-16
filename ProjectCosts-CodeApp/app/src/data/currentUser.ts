/**
 * The signed-in user, as the header badge shows them.
 *
 * `gblCurrentUser` (`App.pa.yaml`, the `Set(gblCurrentUser, {…})` in `OnStart`) is built from
 * two rows, and the badge reads both:
 *
 *   varCurrentUserProfile = LookUp(Users, 'Azure AD Object ID' = User().EntraObjectId)
 *     DisplayName <- 'Full Name'       (systemuser.fullname)
 *     Mail        <- 'Primary Email'   (systemuser.internalemailaddress)
 *
 *   CompanyName  = LookUp('Microsoft Entra IDs',
 *                         'A unique identifer for Microsoft Entra ID' = <that id>).'Company Name'
 *
 * `Microsoft Entra IDs` is the `aaduser` VIRTUAL table over Graph, keyed by the Entra object id —
 * which is why the badge's third row reads "Xebia / Xpirit" and not a Dataverse value.
 *
 * WHY THIS EXISTS RATHER THAN THE HOST CONTEXT. `getContext().user.fullName` returns the ENTRA
 * display name, which at VSB is "Singh Rajput, Shakti (external)". The canvas pill is
 * `"Hi " & User().FullName`, and `User().FullName` is the DATAVERSE row — "Shakti Singh Rajput".
 * Same person, two different strings, and the header was showing the wrong one.
 */
import { AadusersService } from "@/generated/services/AadusersService";
import { SystemusersService } from "@/generated/services/SystemusersService";
import { fetchAll } from "./client";
import { eq } from "./odata";

export interface CurrentUser {
  /** `systemuser.fullname` — the canvas' `User().FullName`. */
  fullName?: string;
  /** `systemuser.internalemailaddress` — `gblCurrentUser.Mail`. */
  mail?: string;
  /** `aaduser.companyname` — `gblCurrentUser.CompanyName`, the badge's Home row. */
  companyName?: string;
}

/**
 * `Language()` and the language half of `Lang`, formatted as the badge's second row:
 * `$"{gblCurrentUser.Language}, [{gblCurrentUser.Lang}]"` → `en-US, [en]`.
 *
 * `Language()` is the PLAYER's language, so the browser's is the faithful equivalent; there is
 * no Dataverse round trip behind this row in the canvas either.
 */
export function languageLabel(locale: string | undefined): string | undefined {
  const tag = (locale ?? "").trim();
  if (!tag) return undefined;
  const short = (tag.split("-")[0] ?? tag).toLowerCase();
  return `${tag}, [${short}]`;
}

export async function loadCurrentUser(entraObjectId: string | undefined): Promise<CurrentUser> {
  if (!entraObjectId) return {};

  const users = await fetchAll(
    "look up the signed-in user",
    (o) => SystemusersService.getAll(o),
    {
      select: ["systemuserid", "fullname", "internalemailaddress"],
      filter: eq("azureactivedirectoryobjectid", entraObjectId),
      top: 1,
    },
  ).catch(() => []);

  const row = users[0];
  /*
   * The badge degrades a row at a time. `aaduser` is a virtual table served from Graph: it can be
   * slow, and it is not readable by every role. A failure there must cost the Home row only, not
   * the name and the mail beside it — so it is caught separately rather than sharing a `try`.
   */
  const aad = await fetchAll(
    "look up the signed-in user's directory entry",
    (o) => AadusersService.getAll(o),
    { select: ["aaduserid", "companyname"], filter: eq("id", entraObjectId), top: 1 },
  ).catch(() => []);

  return {
    fullName: row?.fullname ?? undefined,
    mail: row?.internalemailaddress ?? undefined,
    companyName: aad[0]?.companyname ?? undefined,
  };
}
