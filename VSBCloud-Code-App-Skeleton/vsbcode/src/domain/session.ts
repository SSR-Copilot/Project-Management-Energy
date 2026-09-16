/**
 * Translation of the session bootstrap in `App.OnStart` (967 lines in PM).
 *
 * The canvas app resolves the caller's security roles by two independent paths and unions
 * them, then derives country scope and a set of capability flags. All of that is pure once
 * the raw role/team rows are in hand, so it lives here and is unit-tested; the I/O is in
 * `platform/bootstrap.ts`.
 *
 * IMPORTANT: none of this grants access. Dataverse already applied row and table security
 * before these rows were returned. These flags only decide what the UI offers, exactly as
 * `DataSourceInfo` / `RecordInfo` did in the canvas apps.
 */

/** The five VSB roles the apps actually branch on. */
export const VSB_ROLES = {
  applicationAdministrator: "VSB - Application Administrator",
  controllerOwnData: "VSB - Controller Own Data",
  projectDataAllCountries: "VSB - Project Data All Countries",
  projectDataOwnCountry: "VSB - Project Data Own Country",
  projectManagerOwnProjects: "VSB - Project Manager Own Projects",
} as const;

/** Roles that carry a country scope (App.OnStart, colUserCountries). */
export const COUNTRY_SCOPED_ROLES: string[] = [
  VSB_ROLES.projectManagerOwnProjects,
  VSB_ROLES.projectDataOwnCountry,
];

export interface RawRole {
  /** Security role name, e.g. "VSB - Project Data Own Country" */
  name: string;
  /** Role id */
  uniqueId: string;
  businessUnit?: string;
  /** Country resolved from the role's business unit via Countries_1 */
  country?: { id: string; name: string } | null;
}

export interface UserProfile {
  id: string;
  displayName: string;
  mail: string;
  companyName?: string;
  language: string;
}

export interface CountryScope {
  id: string;
  name: string;
}

export interface CurrentUser extends UserProfile {
  /** `Lower(First(Split(Language(),"-")).Value)` */
  lang: string;
  roles: string[];
  isApplicationAdministrator: boolean;
  isControllerOwnData: boolean;
  isProjectDataAllCountries: boolean;
  isProjectManagerOwnProjects: boolean;
  isDeveloper: boolean;
  /** Set per screen from the record's own privileges — never assumed. */
  canEditSelectedProject: boolean;
  editableCountries: CountryScope[];
  editableCountriesAsString: string;
}

/**
 * `Developers` — the hard-coded allow-list in App.Formulas. Kept verbatim because two
 * screens gate dev-only UI on it. Move this to an environment variable before go-live;
 * a shipped e-mail list is a maintenance trap.
 */
export const DEVELOPERS: readonly string[] = [
  "andriy.chevychalov@vsb.energy",
  "ext-chhitiz.buchasia@vsb.energy",
  "philip.wagner@vsb.energy",
  "test-vsbcloud-02@vsb.energy",
  "christoph.sperling@vsb.energy",
  "benjamin.goepfert@vsb.energy",
  "thomas.lorenz@vsb.energy",
  "dominik.simon@vsb.energy",
  "alexander.pilevski@vsb.energy",
  "ext-matthias.vierkoetter@vsb.energy",
];

/** `ClearCollect(colAllCurrentUserRoles, Filter(..., StartsWith(Name, "VSB")))` */
export function unionVsbRoles(direct: RawRole[], viaTeams: RawRole[]): RawRole[] {
  const all = [...direct, ...viaTeams].filter((r) => r.name?.startsWith("VSB"));
  const seen = new Set<string>();
  return all.filter((r) => {
    const key = `${r.uniqueId}|${r.name}|${r.country?.id ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * `colUserCountries` — roles with a non-blank country whose name is one of the two
 * country-scoped roles, projected to `{id, name}` and de-duplicated.
 */
export function deriveCountryScope(roles: RawRole[]): CountryScope[] {
  const out = new Map<string, CountryScope>();
  for (const r of roles) {
    if (!r.country?.id) continue;
    if (!COUNTRY_SCOPED_ROLES.includes(r.name)) continue;
    out.set(r.country.id, { id: r.country.id, name: r.country.name });
  }
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function buildCurrentUser(profile: UserProfile, roles: RawRole[]): CurrentUser {
  const names = [...new Set(roles.map((r) => r.name))];
  const has = (n: string) => names.includes(n);
  const countries = deriveCountryScope(roles);
  return {
    ...profile,
    lang: (profile.language.split("-")[0] ?? "en").toLowerCase(),
    roles: names,
    isApplicationAdministrator: has(VSB_ROLES.applicationAdministrator),
    isControllerOwnData: has(VSB_ROLES.controllerOwnData),
    isProjectDataAllCountries: has(VSB_ROLES.projectDataAllCountries),
    isProjectManagerOwnProjects: has(VSB_ROLES.projectManagerOwnProjects),
    isDeveloper: DEVELOPERS.includes(profile.mail?.toLowerCase() ?? ""),
    canEditSelectedProject: false,
    editableCountries: countries,
    editableCountriesAsString: countries.map((c) => c.name).join(" ; "),
  };
}

/**
 * The per-screen permission idiom repeated on nearly every OnVisible:
 *   And(DataSourceInfo(Projects, CreatePermission),
 *       Coalesce(RecordInfo(record, EditPermission), false))
 *
 * `createPermission` and `editPermission` must come from the server, not from role names.
 */
export function canEditSelectedProject(
  createPermission: boolean | undefined,
  editPermission: boolean | undefined,
): boolean {
  return Boolean(createPermission) && Boolean(editPermission ?? false);
}

/**
 * Admin-section visibility.
 *
 * SOURCE DEFECT, reproduced deliberately and flagged: the canvas apps gate the admin
 * screens client-side only — `Or(IsApplicationAdministrator, IsControllerOwnData)` on the
 * header item and every LeftAdminNavigationMenu item, with no screen-level check and no
 * server enforcement. The code app additionally guards the routes (see routes/guards.tsx),
 * but the real fix is a Dataverse privilege check; until that exists this is UI hiding,
 * not security.
 */
export function canSeeAdminSection(u: Pick<CurrentUser, "isApplicationAdministrator" | "isControllerOwnData">): boolean {
  return u.isApplicationAdministrator || u.isControllerOwnData;
}

/** Country scope check used by the master-data screens. */
export function canEditCountry(u: CurrentUser, countryId: string | undefined): boolean {
  if (u.isProjectDataAllCountries || u.isApplicationAdministrator) return true;
  if (!countryId) return false;
  return u.editableCountries.some((c) => c.id === countryId);
}

/**
 * The header's version label — `"Version " & gblAppVersion & " (" & gblEnvironmentName & ")"`.
 *
 * Returns null where the canvas renders nothing: in Prod (the canvas hides both the label and
 * the info icon there) and when there is no version to show, so the header never displays a
 * bare `Version  ()`.
 */
export function versionLabel(
  appVersion: string | null | undefined,
  environmentName: string | null | undefined,
): string | null {
  const v = (appVersion ?? "").trim();
  const env = (environmentName ?? "").trim();
  if (!v) return null;
  // `"Version " & gblAppVersion & If(gblEnvironmentName="Dev", " (" & gblEnvironmentName & ")", "")`
  // — the suffix is Dev ONLY, not every non-Prod environment. An earlier cut showed it for
  // Nightly, QA and Hotfix too.
  return env === "Dev" ? `Version ${v} (${env})` : `Version ${v}`;
}

/** `Hi {User().FullName}` from `cmp_User_Badge`, with a fallback while sign-in resolves. */
export function greeting(displayName: string | null | undefined): string {
  const n = (displayName ?? "").trim();
  return n ? `Hi ${n}` : "Hi there";
}

/**
 * `Concat(gblCurrentUser.EditableCounties, $"{name}; ")` — the badge menu's country row.
 *
 * Note the format: each name is followed by "; ", so the string ends with a trailing
 * separator ("France; Germany; "). That is what the canvas emits and what the reference
 * screenshot shows, so it is transcribed rather than tidied.
 *
 * Distinct from `editableCountriesAsString` (" ; "-joined, no trailing separator), which the
 * report panel and the old header badge use. Two formats exist in the source; both are kept.
 *
 * SOURCE DEFECT, deliberately NOT reproduced: the canvas `EditableCounties` collection is not
 * de-duplicated, so a user holding two country-scoped roles in the same country sees that
 * country listed twice — the reference screenshot shows "France; France; Germany;".
 * `deriveCountryScope` de-duplicates by country id, so this returns "France; Germany; ".
 */
export function editableCountriesLabel(
  countries: readonly CountryScope[] | undefined,
): string | null {
  if (!countries?.length) return null;
  return countries.map((c) => `${c.name}; `).join("");
}

/**
 * The header's project status line — `con_cmp_Header_Project_Status`.
 *
 *   If(IsBlank(Project) || IsBlank(Project.Status), "",
 *      If(Or(Status = "Abandoned", "Inactive" in Status), Status, "Active"))
 *
 * So a project with any status at all reads "Active" unless it is abandoned or its status
 * contains "Inactive", in which case the raw status shows through.
 */
export function projectStatusLabel(status: string | null | undefined): string {
  const s = (status ?? "").trim();
  if (!s) return "";
  if (s === "Abandoned" || s.includes("Inactive")) return s;
  return "Active";
}

/**
 * `Visible` on that same label: hidden in QA and Prod, shown everywhere else. Transcribed,
 * not rationalised — it is an odd rule, but it is the one the app ships.
 */
export function projectStatusVisible(environmentName: string | null | undefined): boolean {
  const env = (environmentName ?? "").trim();
  return env !== "QA" && env !== "Prod";
}

/**
 * The admin screens have no project, so they hand `cmp_Header` a pseudo-record whose `Name`
 * is the page title and whose every other field is blank. These are those names, verbatim.
 */
export const ADMIN_PAGE_TITLE: Record<string, string> = {
  "/admin/default-checklists": "Checklist settings",
  "/admin/gates-approvals": "Project Gates",
  "/admin/capex-accounts": "CAPEX Accounts",
  "/admin/milestones": "Milestones",
  "/admin/cost": "Costs",
  "/admin/contract": "Contracts",
};
