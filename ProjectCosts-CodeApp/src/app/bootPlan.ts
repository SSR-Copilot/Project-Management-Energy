/**
 * Which screen the app is about to open, read from the URL alone (D119).
 *
 * Pure: no React, no network, no globals. `app/bootPrefetch.ts` calls it before the first render to
 * start the right screen's chunk and reads early. It follows the router's own decisions
 * (`Landing` and the route table in `routes.tsx`), but a wrong answer costs nothing but a wasted
 * prefetch: the screen that really mounts reads its own queries and retries a failed one.
 */
import { launchPmPath } from "./deepLinks";
import { readProjectLink } from "@/platform/powerClient";

export type BootTarget =
  /** The Main Project Overview, with the criteria its URL carries (a `?…` string, or ""). */
  | { kind: "projects"; search: string }
  /** `/project/general?projectId=…` — Project General Data of an existing project. */
  | { kind: "general-data"; projectId: string }
  /** `/project/generators?projectId=…` — the Generators screen of an existing project (D141). */
  | { kind: "generators"; projectId: string }
  | { kind: "none" };

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
    return launchPmPath(input.launchParams, input.windowSearch) === "/project/general"
      ? { kind: "general-data", projectId: link.projectId }
      : { kind: "none" };
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

  return { kind: "none" };
}
