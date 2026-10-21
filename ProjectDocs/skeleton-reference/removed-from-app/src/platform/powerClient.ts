/**
 * Binding to the Power Apps code-app runtime (`@microsoft/power-apps` v1.3).
 *
 * The real surface is:
 *   `@microsoft/power-apps/app`   setConfig(config), getContext(): Promise<IContext>
 *   `@microsoft/power-apps/data`  getClient(): DataClient
 *
 * Everything reaches Dataverse through `getClient()`, which runs under the signed-in
 * user's own security context. That is the property the canvas apps relied on and it must
 * not change: the canvas apps never enforced row security themselves (`DataSourceInfo` /
 * `RecordInfo` only *report* privileges the platform already applied), so the rebuild
 * inherits the same model.
 */
import { setConfig, getContext, type IContext } from "@microsoft/power-apps/app";
import { getClient, type DataClient as SdkDataClient } from "@microsoft/power-apps/data";
import { dataSources } from "@/data/dataSources";
import { trace } from "./telemetry";

export type DataMode = "power" | "mock";

/**
 * Only the exact literal `"power"` goes live.
 *
 * This used to be `?? "mock"`, which meant any typo — `"Power"`, `"prod"`, `"pwoer"` — fell
 * through the `dataMode === "mock"` checks and took the SDK path, then failed against tables
 * that are not there. Fail safe, not fail open.
 */
export const dataMode: DataMode =
  (import.meta.env.VITE_DATA_MODE as string | undefined) === "power" ? "power" : "mock";

let contextPromise: Promise<IContext> | undefined;
let client: SdkDataClient | undefined;

/** Idempotent. Configures the SDK once and caches the context promise. */
export function ensureInitialized(): Promise<IContext> {
  if (!contextPromise) {
    setConfig({
      logger: {
        // Route the SDK's own diagnostics into our telemetry buffer so the canvas
        // `Trace(..., TraceSeverity.X)` semantics survive.
        logInfo: (m: string) => trace("information", m),
        logWarning: (m: string) => trace("warning", m),
        logError: (m: string) => trace("error", m),
        logCritical: (m: string) => trace("critical", m),
      } as never,
    });
    contextPromise = getContext().catch((e: unknown) => {
      contextPromise = undefined;
      throw e;
    });
  }
  return contextPromise;
}

export function powerClient(): SdkDataClient {
  client ??= getClient(dataSources);
  return client;
}

export interface PowerEnvironment {
  environmentId?: string;
  tenantId?: string;
  userId?: string;
  userPrincipalName?: string;
  displayName?: string;
  appId?: string;
  dataverseOrgUrl?: string;
  queryParams: Record<string, string>;
}

export async function readEnvironment(): Promise<PowerEnvironment> {
  if (dataMode === "mock") {
    return {
      environmentId: "mock-env",
      tenantId: "mock-tenant",
      userId: "11111111-1111-1111-1111-111111111111",
      userPrincipalName: "demo.user@vsb.energy",
      displayName: "Demo User",
      appId: "mock-app",
      dataverseOrgUrl: undefined,
      queryParams: {},
    };
  }
  const ctx = await ensureInitialized();
  return {
    environmentId: ctx.app.environmentId,
    tenantId: ctx.user.tenantId,
    userId: ctx.user.objectId,
    userPrincipalName: ctx.user.userPrincipalName,
    displayName: ctx.user.fullName,
    appId: ctx.app.appId,
    dataverseOrgUrl: ctx.app.dataverseOrgUrl,
    queryParams: ctx.app.queryParams ?? {},
  };
}

/**
 * Launch parameters. In a code app these arrive on `IContext.app.queryParams`, which is
 * the replacement for the canvas `Param("projectid")`. Falls back to the browser query
 * string so deep links work in `npm run dev` too.
 */
export async function readLaunchParams(): Promise<URLSearchParams> {
  const fromUrl = new URLSearchParams(
    typeof window !== "undefined" ? window.location.search : "",
  );
  if (dataMode === "mock") return fromUrl;
  const env = await readEnvironment();
  for (const [k, v] of Object.entries(env.queryParams)) {
    if (!fromUrl.has(k)) fromUrl.set(k, v);
  }
  return fromUrl;
}
