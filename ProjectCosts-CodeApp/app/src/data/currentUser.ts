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
import { RolesService } from "@/generated/services/RolesService";
import { SystemusersService } from "@/generated/services/SystemusersService";
import { TeamsService } from "@/generated/services/TeamsService";
import { Vsb_countriesService } from "@/generated/services/Vsb_countriesService";
import { fetchAll } from "./client";
import { chunk, eq, guid, or } from "./odata";

export interface CurrentUser {
  /** `systemuser.fullname` — the canvas' `User().FullName`. */
  fullName?: string;
  /** `systemuser.internalemailaddress` — `gblCurrentUser.Mail`. */
  mail?: string;
  /** `aaduser.companyname` — `gblCurrentUser.CompanyName`, the badge's Home row. */
  companyName?: string;
  /**
   * `img_cmp_In_Header_UserImage.Image = User().Image`, as a `data:` URL.
   *
   * Dataverse hands `systemuser.entityimage` back as base64 when it is selected, which is
   * the same thing the canvas player inlines into that `<img src>`. Undefined when the user
   * has no photo — the avatar then falls back to a silhouette, which is what the canvas
   * shows too (its default `User().Image` is a grey person bitmap).
   */
  photo?: string;
  /**
   * `gblCurrentUser.EditableCounties`, the badge's AddHome row — one entry per qualifying
   * ROLE, so a country the user holds two of those roles in appears twice. The canvas does
   * not dedupe (`France; France; Germany;` in the reference screenshot) because
   * `colDistinctCurrentUserTeamsRoles` is distinct over the whole role record, not over the
   * country.
   */
  editableCountries: string[];
  /** `gblCurrentUser.IsProjectDataAllCountries`, the badge's World row. */
  isProjectDataAllCountries: boolean;
}

/**
 * The role names `App.OnStart` keys the user profile off, verbatim.
 *
 *   IsProjectDataAllCountries: Not(IsBlankOrError(First(Filter(
 *       colDistinctCurrentUserTeamsRoles, Name = "VSB - Project Data All Countries"))))
 *
 *   colUserCountries: ForAll(Filter(colDistinctCurrentUserTeamsRoles,
 *       And(Not(IsBlank(Country)), Name in ["VSB - Project Manager Own Projects",
 *                                           "VSB - Project Data Own Country"])), {...})
 */
export const ROLE_ALL_COUNTRIES = "VSB - Project Data All Countries";
export const ROLE_OWN_COUNTRY = [
  "VSB - Project Manager Own Projects",
  "VSB - Project Data Own Country",
] as const;

/** One of the user's effective security roles, reduced to what the badge needs. */
export interface UserRole {
  roleId: string;
  name: string;
  businessUnitId?: string;
}

/**
 * `colUserCountries` and `IsProjectDataAllCountries`, from a set of effective roles and the
 * country↔business-unit map.
 *
 * Pure so the two badge rows are testable without Dataverse. `colAllCurrentUserRoles` keeps
 * only roles whose name starts with "VSB", then `colDistinctCurrentUserTeamsRoles` takes the
 * distinct records — the same role reached both directly and through a team counts once,
 * which is what `roleId` dedupes here.
 */
export function badgeScopeFromRoles(
  roles: readonly UserRole[],
  countryByBusinessUnit: ReadonlyMap<string, string>,
): Pick<CurrentUser, "editableCountries" | "isProjectDataAllCountries"> {
  const seen = new Set<string>();
  const distinct = roles.filter((r) => {
    if (!r.name.startsWith("VSB") || seen.has(r.roleId)) return false;
    seen.add(r.roleId);
    return true;
  });

  const editableCountries = distinct
    .filter((r) => (ROLE_OWN_COUNTRY as readonly string[]).includes(r.name))
    .map((r) => (r.businessUnitId ? countryByBusinessUnit.get(r.businessUnitId) : undefined))
    .filter((name): name is string => Boolean(name));

  return {
    editableCountries,
    isProjectDataAllCountries: distinct.some((r) => r.name === ROLE_ALL_COUNTRIES),
  };
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
  if (!entraObjectId) return { editableCountries: [], isProjectDataAllCountries: false };

  const users = await fetchAll(
    "look up the signed-in user",
    (o) => SystemusersService.getAll(o),
    {
      select: ["systemuserid", "fullname", "internalemailaddress", "entityimage"],
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

  /*
   * The user's EFFECTIVE roles — held directly, and through every team they belong to. The
   * canvas walks `colCurrentUserRoles` and `colCurrentUserTeamsDirect.'Security Roles'`; the
   * Web API equivalent is a lambda over each M:N navigation property.
   *
   * Every one of these is caught on its own, like the `aaduser` lookup above: `role` and
   * `team` are security tables that not every role can read, and losing them must cost the
   * badge's last two rows only — not the name, the mail and the business unit beside them.
   */
  const userId = row?.systemuserid;
  const scope = userId
    ? await loadBadgeScope(userId).catch(() => undefined)
    : undefined;

  return {
    fullName: row?.fullname ?? undefined,
    mail: row?.internalemailaddress ?? undefined,
    companyName: aad[0]?.companyname ?? undefined,
    ...(row?.entityimage ? { photo: `data:image/png;base64,${row.entityimage}` } : {}),
    editableCountries: scope?.editableCountries ?? [],
    isProjectDataAllCountries: scope?.isProjectDataAllCountries ?? false,
  };
}

const ROLE_SELECT = ["roleid", "name", "_businessunitid_value"];

async function loadBadgeScope(systemUserId: string) {
  const id = guid(systemUserId);

  const direct = fetchAll(
    "read the signed-in user's security roles",
    (o) => RolesService.getAll(o),
    {
      select: ROLE_SELECT,
      filter: `systemuserroles_association/any(o:o/systemuserid eq ${id})`,
    },
  ).catch(() => []);

  const teams = await fetchAll(
    "read the signed-in user's teams",
    (o) => TeamsService.getAll(o),
    {
      select: ["teamid"],
      filter: `teammembership_association/any(o:o/systemuserid eq ${id})`,
    },
  ).catch(() => []);

  // `or` over a chunk of team ids rather than one request per team.
  const teamRoles = await Promise.all(
    chunk(teams.map((t) => t.teamid).filter(Boolean)).map((ids) =>
      fetchAll(
        "read the roles of the signed-in user's teams",
        (o) => RolesService.getAll(o),
        {
          select: ROLE_SELECT,
          filter: or(...ids.map((t) => `teamroles_association/any(o:o/teamid eq ${guid(t)})`)),
        },
      ).catch(() => []),
    ),
  );

  const countries = await fetchAll(
    "read the country list for the user's business units",
    (o) => Vsb_countriesService.getAll(o),
    { select: ["vsb_name", "_vsb_businessunit_value"] },
  ).catch(() => []);

  const countryByBusinessUnit = new Map<string, string>();
  for (const c of countries) {
    const bu = c._vsb_businessunit_value;
    if (bu && c.vsb_name) countryByBusinessUnit.set(bu, c.vsb_name);
  }

  const rows = [...(await direct), ...teamRoles.flat()];
  return badgeScopeFromRoles(
    rows.map((r) => ({
      roleId: r.roleid,
      name: r.name ?? "",
      ...(r._businessunitid_value ? { businessUnitId: r._businessunitid_value } : {}),
    })),
    countryByBusinessUnit,
  );
}
