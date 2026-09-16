/**
 * Port of `App.OnStart` (967 lines in PM).
 *
 * The canvas version is one enormous sequential block. Here the independent reads run
 * concurrently (the canvas app used `Concurrent(...)` for the same reason) and the pure
 * derivation is delegated to domain/session.ts so it is unit-tested.
 *
 * `gblAppStarted` is not a variable any more — it is this query's `isSuccess`.
 */
import { useQuery } from "@tanstack/react-query";
import { dataClient } from "./dataClient";
import { readEnvironment, dataMode } from "./powerClient";
import { f } from "./odata";
import { ES } from "@/data/entities";
import { buildCurrentUser, unionVsbRoles, type RawRole, type CurrentUser } from "@/domain/session";
import { trace } from "./telemetry";
import { browserLocale } from "@/domain/locale";
import { privileges } from "./privileges";
import type { EnvBadge } from "@/store/appStore";

export interface Session {
  user: CurrentUser;
  env: EnvBadge;
}

async function readEnvironmentVariables(): Promise<Record<string, string>> {
  if (dataMode === "mock") {
    const page = await dataClient.list<{ vsb_schemaname: string; value: string }>(
      ES.environmentVariableValues, { select: ["vsb_schemaname", "value"] },
    );
    return Object.fromEntries(page.rows.map((r) => [r.vsb_schemaname, r.value]));
  }
  // LookUp('Environment Variable Values', 'Environment Variable Definition'.'Schema Name' = key)
  // Two reads instead of an $expand: the SDK's IOperationOptions has no expand.
  const [defs, vals] = await Promise.all([
    dataClient.list<{ environmentvariabledefinitionid: string; schemaname: string }>(
      ES.environmentVariableDefinitions,
      { select: ["environmentvariabledefinitionid", "schemaname"], all: true },
    ),
    dataClient.list<{ value: string; _environmentvariabledefinitionid_value: string }>(
      ES.environmentVariableValues,
      { select: ["value", "_environmentvariabledefinitionid_value"], all: true },
    ),
  ]);
  const nameById = new Map(defs.rows.map((d) => [d.environmentvariabledefinitionid, d.schemaname]));
  const out: Record<string, string> = {};
  for (const v of vals.rows) {
    const k = nameById.get(v._environmentvariabledefinitionid_value);
    if (k) out[k] = v.value;
  }
  return out;
}

async function readRoles(userId: string): Promise<{ direct: RawRole[]; viaTeams: RawRole[] }> {
  if (dataMode === "mock") {
    /*
     * A representative role set so the demo exercises both the country-scoped and the
     * all-countries paths, AND the union of direct with team-derived roles.
     *
     * `VITE_MOCK_ROLES` overrides it with a comma-separated list of role names. That switch
     * exists because the default set includes `VSB - Application Administrator`, so with the
     * defaults nothing is ever refused and a demo cannot show a locked screen. Set
     * `VITE_MOCK_ROLES="VSB - Project Manager Own Projects"` and the six admin screens go
     * read-only exactly as they will for a project manager in a real environment.
     *
     * The names are matched against `security/matrix.json`; an unknown name is kept on the
     * session (so `domain/session` behaves normally) but grants nothing, and bootstrap traces
     * it as unmodelled. A role name that grants nothing is the correct treatment of a typo.
     */
    const override = (import.meta.env.VITE_MOCK_ROLES as string | undefined)
      ?.split(",").map((r) => r.trim()).filter(Boolean);
    if (override && override.length > 0) {
      return {
        direct: override.map((name, i) => ({
          name,
          uniqueId: `mock-r${i + 1}`,
          businessUnit: "VSB DE",
          country: { id: "c-de", name: "Germany" },
        })),
        viaTeams: [],
      };
    }
    return {
      direct: [
        { name: "VSB - Project Manager Own Projects", uniqueId: "r1",
          businessUnit: "VSB DE", country: { id: "c-de", name: "Germany" } },
        { name: "VSB - Project Data Own Country", uniqueId: "r2",
          businessUnit: "VSB DE", country: { id: "c-de", name: "Germany" } },
      ],
      viaTeams: [
        { name: "VSB - Application Administrator", uniqueId: "r3", businessUnit: "VSB Group", country: null },
        { name: "VSB - Controller Own Data", uniqueId: "r4", businessUnit: "VSB Group", country: null },
        { name: "VSB - Project Data Own Country", uniqueId: "r2",
          businessUnit: "VSB FR", country: { id: "c-fr", name: "France" } },
      ],
    };
  }

  // Two independent reads: roles held directly, and roles held through team membership.
  const [directPage, teamPage] = await Promise.all([
    dataClient.list<{ name: string; roleid: string; _businessunitid_value: string }>(
      ES.roles, {
        select: ["name", "roleid", "_businessunitid_value"],
        filter: `systemuserroles_association/any(u:u/systemuserid eq ${userId})`,
        all: true,
      },
    ).catch(() => ({ rows: [] })),
    dataClient.list<{ name: string; roleid: string; _businessunitid_value: string }>(
      ES.roles, {
        select: ["name", "roleid", "_businessunitid_value"],
        filter: `teamroles_association/any(t:t/teammembership_association/any(u:u/systemuserid eq ${userId}))`,
        all: true,
      },
    ).catch(() => ({ rows: [] })),
  ]);

  // Business unit -> country, via Countries_1 in the canvas app.
  const buIds = [...new Set(
    [...directPage.rows, ...teamPage.rows].map((r) => r._businessunitid_value).filter(Boolean),
  )];
  const countries = buIds.length
    ? (await dataClient.list<{ vsb_countryid: string; vsb_name: string; _vsb_businessunit_value: string }>(
        ES.countries, {
          select: ["vsb_countryid", "vsb_name", "_vsb_businessunit_value"],
          filter: f.inList("_vsb_businessunit_value", buIds),
          all: true,
        },
      )).rows
    : [];
  const byBu = new Map(countries.map((c) => [c._vsb_businessunit_value, { id: c.vsb_countryid, name: c.vsb_name }]));

  const map = (rows: { name: string; roleid: string; _businessunitid_value: string }[]): RawRole[] =>
    rows.map((r) => ({
      name: r.name, uniqueId: r.roleid, businessUnit: r._businessunitid_value,
      country: byBu.get(r._businessunitid_value) ?? null,
    }));

  return { direct: map(directPage.rows), viaTeams: map(teamPage.rows) };
}

export async function bootstrap(): Promise<Session> {
  const ctx = await readEnvironment();

  const [vars, roles] = await Promise.all([
    readEnvironmentVariables(),
    readRoles(ctx.userId ?? ""),
  ]);

  const profile = {
    id: ctx.userId ?? "",
    displayName: ctx.displayName ?? ctx.userPrincipalName ?? "User",
    mail: (ctx.userPrincipalName ?? "").toLowerCase(),
    companyName: undefined,
    language: browserLocale(),
  };

  const user = buildCurrentUser(profile, unionVsbRoles(roles.direct, roles.viaTeams));

  /*
   * Hand the UNION of direct and team-derived role names to the privilege layer, and read
   * the caller's effective privileges once while the rest of the bootstrap is still in
   * flight. `forTable` is synchronous because command bars cannot await, so it answers from
   * this cache — and it denies until the read lands, which is the right way round.
   *
   * The await is deliberate. Resolving the session before privileges are known would give
   * every screen one render in which every command is hidden, and the flicker reads as a
   * permissions bug to anyone watching.
   */
  privileges.setSessionRoles(user.roles);
  await privileges.ensure();

  const unmodelled = privileges.unmodelledRoles();
  if (unmodelled.length > 0) {
    trace("warning", "session roles not in security/matrix.json", {
      detail: unmodelled.join(", "),
    });
  }

  trace("information", "session ready", {
    roles: user.roles.length,
    countries: user.editableCountriesAsString,
    isProjectDataAllCountries: user.isProjectDataAllCountries,
  });

  const envId = vars.vsb_EnvironmentID ?? ctx.environmentId ?? "";
  const tenantId = vars.vsb_TenantID ?? ctx.tenantId ?? "";
  const playUrl = (appId?: string) =>
    appId ? `https://apps.powerapps.com/play/e/${envId}/a/${appId}?tenantId=${tenantId}` : "";

  const env: EnvBadge = {
    appVersion: vars.vsb_AppVersion ?? "0.0.0",
    environmentName: vars.vsb_EnvironmentName ?? "Dev",
    infoCenterUrl: vars.vsb_VSBCloudInfoCenterUrl ?? "",
    pmAppUrl: playUrl(vars.vsb_ProjectManagementAppID),
    costAppUrl: playUrl(vars.vsb_ProjectCostsAppID),
  };

  return { user, env };
}

export const bootstrapQueryKey = ["bootstrap"] as const;

export function useBootstrap() {
  return useQuery({
    queryKey: bootstrapQueryKey,
    queryFn: bootstrap,
    staleTime: Infinity,
    retry: 1,
  });
}
