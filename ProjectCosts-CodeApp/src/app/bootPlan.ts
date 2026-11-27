/**
 * Which screen the app is about to open, read from the URL alone (D119).
 *
 * Pure: no React, no network, no globals. `app/bootPrefetch.ts` calls it before the first render to
 * start the right screen's chunk and reads early. It follows the router's own decisions
 * (`Landing` and the route table in `routes.tsx`), but a wrong answer costs nothing but a wasted
 * prefetch: the screen that really mounts reads its own queries and retries a failed one.
 */
import { COST_PATHS, launchCostPath, launchPmPath, type CostPath } from "./deepLinks";
import { readProjectLink } from "@/platform/powerClient";
import type { ProjectLoadScope } from "@/data/project";

export type BootTarget =
  /** The Main Project Overview, with the criteria its URL carries (a `?…` string, or ""). */
  | { kind: "projects"; search: string }
  /** `/project/general?projectId=…` — Project General Data of an existing project. */
  | { kind: "general-data"; projectId: string }
  /** `/project/generators?projectId=…` — the Generators screen of an existing project (D141). */
  | { kind: "generators"; projectId: string }
  /** OPT-03: `/project/<slug>?projectId=…` for a Project Management screen the targets above do not name (its slug is the route's). */
  | { kind: "pm-screen"; projectId: string; slug: PmBootSlug }
  /** OPT-03: a Cost screen of an existing project, from `/costs/…?projectId=…` or the bare root with a project id. */
  | { kind: "cost"; projectId: string; path: CostPath; category?: number }
  /** T-C03 (BND-17): an Administration screen, `/admin/<screen>`: only its chunk is started (its reads depend on the user's roles). */
  | { kind: "admin"; path: AdminBootPath }
  | { kind: "none" };

/** The PM routes (`routes.tsx`) other than General Data and Generators, which have targets of their own. */
export const PM_BOOT_SLUGS = [
  "milestones", "production", "checklist", "team", "planning", "grid-operator", "revenues", "finance",
] as const;
export type PmBootSlug = (typeof PM_BOOT_SLUGS)[number];

/** The Administration routes (`routes.tsx`), by their path. */
export const ADMIN_BOOT_PATHS = [
  "/admin/default-checklists", "/admin/gates-approvals", "/admin/capex-accounts", "/admin/milestones", "/admin/cost", "/admin/contract",
] as const;
export type AdminBootPath = (typeof ADMIN_BOOT_PATHS)[number];

/**
 * T-C01: the DEVEX/CAPEX tab a `?category=N` asks for, as the screen reads it (`resolveCategory`: an integer from 0), or `undefined` when the
 * link names none (the Summary tab). Not checked against the number of tabs, which only the categories read knows: an out-of-range N costs one
 * speculative read and the screen shows the Summary tab, as before.
 */
export function categoryFromSearch(search: string): number | undefined {
  const raw = new URLSearchParams(search).get("category");
  if (raw === null || raw.trim() === "") return undefined;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= 99 ? n : undefined;
}

export interface BootInput {
  /** `window.location.hash`, e.g. `#/projects?p=2`, or "". */
  hash: string;
  /** `window.location.search` of the app's own document. */
  windowSearch: string;
  /** The host's launch parameters (`ctx.app.queryParams`); `{}` while the session is not known yet. */
  launchParams: Record<string, string>;
}

/** The hash router's path and search: `#/projects?p=2` → `{ path: "/projects", search: "?p=2" }`. */
export function splitHash(hash: string): { path: string; search: string } {
  const route = hash.replace(/^#/, "");
  const q = route.indexOf("?");
  const path = q === -1 ? route : route.slice(0, q);
  return { path: path.replace(/\/+$/, "") || "", search: q === -1 ? "" : route.slice(q) };
}

/** True when only the host's launch parameters can say where `/` leads (`Landing` reads them). */
export function needsLaunchParams(hash: string): boolean {
  return splitHash(hash).path === "";
}

export function bootTarget(input: BootInput): BootTarget {
  const { path, search } = splitHash(input.hash);

  if (path === "") {
    /*
     * `Landing` (`routes.tsx`): a valid project id leads to the cost module, or — with the
     * `pmScreen` launch parameter, which `Edit Project` sets — to that PM screen; an invalid one to
     * an error state; none at all to the project list with its default criteria.
     */
    const link = readProjectLink(input.launchParams, input.windowSearch, search);
    if (link.status === "invalid") return { kind: "none" };
    if (link.status === "missing") return { kind: "projects", search: "" };
    // OPT-03: a valid project id with no PM launch leads to the Cost module (`Landing`), so its screen and session project start now.
    return launchPmPath(input.launchParams, input.windowSearch) === "/project/general"
      ? { kind: "general-data", projectId: link.projectId }
      : { kind: "cost", projectId: link.projectId, path: launchCostPath(input.launchParams, input.windowSearch) };
  }

  if (path === "/projects") return { kind: "projects", search };

  if (path === "/project/general") {
    // A PM route reads the project from the ROUTE only (`SessionContext`); none is the New Project form.
    const link = readProjectLink({}, undefined, search);
    return link.status === "valid" ? { kind: "general-data", projectId: link.projectId } : { kind: "none" };
  }

  if (path === "/project/generators") {
    // Same rule as General Data: the project comes from the route only; none is the locked New Project mode (no reads).
    const link = readProjectLink({}, undefined, search);
    return link.status === "valid" ? { kind: "generators", projectId: link.projectId } : { kind: "none" };
  }

  const slug = path.startsWith("/project/") ? path.slice("/project/".length) : "";
  if ((PM_BOOT_SLUGS as readonly string[]).includes(slug)) {
    // A PM route reads the project from the ROUTE only, as above; none is the locked New Project mode (no reads).
    const link = readProjectLink({}, undefined, search);
    return link.status === "valid" ? { kind: "pm-screen", projectId: link.projectId, slug: slug as PmBootSlug } : { kind: "none" };
  }

  if ((COST_PATHS as readonly string[]).includes(path)) {
    // The cost routes read the project from the route, then the launch parameters, then the player URL (`SessionContext`).
    const link = readProjectLink(input.launchParams, input.windowSearch, search);
    if (link.status !== "valid") return { kind: "none" };
    const category = path === "/costs/capex" || path === "/costs/add-from-table" ? categoryFromSearch(search) : undefined;
    return { kind: "cost", projectId: link.projectId, path: path as CostPath, ...(category === undefined ? {} : { category }) };
  }

  if ((ADMIN_BOOT_PATHS as readonly string[]).includes(path)) return { kind: "admin", path: path as AdminBootPath };

  return { kind: "none" };
}

/**
 * OPT-01 (B5b): which part of the project the route needs. A Project Management route (`/project/*`) reads the row only; the Cost
 * routes and everything else keep the full load. `"/"` is a PM route when the launch says so (`Edit Project`: `pmScreen` +
 * `projectId`), because `Landing` then redirects to a PM screen.
 */
export function sessionProjectScope(pathname: string, launchesPmScreen: boolean): ProjectLoadScope {
  return pathname.startsWith("/project/") || (pathname === "/" && launchesPmScreen) ? "pm" : "full";
}
