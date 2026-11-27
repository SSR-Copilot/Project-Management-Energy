import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ADMIN_BOOT_PATHS, bootTarget, needsLaunchParams, splitHash } from "./bootPlan";

const ID = "9f5aade5-2b7c-ef11-ac20-000d3a466ab7";
const input = (hash: string, launchParams: Record<string, string> = {}, windowSearch = "") =>
  ({ hash, windowSearch, launchParams });

describe("boot plan: which screen the URL opens (D119)", () => {
  it("UT-BOOT-001 splits the hash router's path from its search", () => {
    expect(splitHash("#/projects?p=2&k=a")).toEqual({ path: "/projects", search: "?p=2&k=a" });
    expect(splitHash("#/projects/")).toEqual({ path: "/projects", search: "" });
    expect(splitHash("")).toEqual({ path: "", search: "" });
    expect(splitHash("#/")).toEqual({ path: "", search: "" });
  });

  it("UT-BOOT-002 only the bare root needs the host's launch parameters", () => {
    expect(needsLaunchParams("")).toBe(true);
    expect(needsLaunchParams("#/")).toBe(true);
    expect(needsLaunchParams("#/projects")).toBe(false);
    expect(needsLaunchParams(`#/project/general?projectId=${ID}`)).toBe(false);
  });

  it("UT-BOOT-003 an explicit project list route keeps its own criteria", () => {
    expect(bootTarget(input("#/projects?p=3"))).toEqual({ kind: "projects", search: "?p=3" });
    expect(bootTarget(input("#/projects"))).toEqual({ kind: "projects", search: "" });
  });

  it("UT-BOOT-004 the bare root with no project id lands on the project list, as Landing does", () => {
    expect(bootTarget(input(""))).toEqual({ kind: "projects", search: "" });
  });

  it("UT-BOOT-005 the bare root with a project id leaves the project list alone (the cost module opens)", () => {
    // OPT-03 (B5b): the Cost module that opens is now itself the target (it was `none`), so its screen and project start early.
    expect(bootTarget(input("", { projectId: ID }))).toEqual({ kind: "cost", projectId: ID, path: "/costs/capex" });
    expect(bootTarget(input("", {}, `?projectId=${ID}`))).toEqual({ kind: "cost", projectId: ID, path: "/costs/capex" });
  });

  it("UT-BOOT-006 Edit Project (pmScreen=/project/general + projectId) opens General Data of that project", () => {
    expect(bootTarget(input("", { projectId: ID, pmScreen: "/project/general" })))
      .toEqual({ kind: "general-data", projectId: ID });
    // An unknown pmScreen is not a PM launch: Landing falls through to the cost module (OPT-03: a `cost` target, was `none`).
    expect(bootTarget(input("", { projectId: ID, pmScreen: "/project/finance" })))
      .toEqual({ kind: "cost", projectId: ID, path: "/costs/capex" });
  });

  it("UT-BOOT-007 an invalid project id prefetches nothing, so no wrong project is ever read", () => {
    expect(bootTarget(input("", { projectId: "not-a-guid" }))).toEqual({ kind: "none" });
    expect(bootTarget(input("#/project/general?projectId=nope"))).toEqual({ kind: "none" });
  });

  it("UT-BOOT-008 General Data of a project reads the id from the route, braces and case normalised", () => {
    expect(bootTarget(input(`#/project/general?projectId=${ID}`))).toEqual({ kind: "general-data", projectId: ID });
    expect(bootTarget(input(`#/project/general?projectId={${ID.toUpperCase()}}`)))
      .toEqual({ kind: "general-data", projectId: ID });
  });

  it("UT-BOOT-009 a PM route ignores launch parameters: no id in the route is the New Project form", () => {
    expect(bootTarget(input("#/project/general", { projectId: ID }))).toEqual({ kind: "none" });
  });

  it("UT-BOOT-010 every other route prefetches nothing", () => {
    // OPT-03 (B5b): `#/costs/capex?…` and `#/project/team?…` now have targets (UT-BOOT-OPT-001..); these have no project or no plan.
    // T-C03 (BND-17): `#/admin/<screen>` is now an `admin` target (UT-BOOT-ADMIN-001); `/admin` alone and an unknown admin path are not.
    for (const hash of ["#/costs/capex", "#/project/team", "#/admin", "#/admin/nowhere", "#/nowhere", "#/costs", "#/project/unknown?projectId=" + ID]) {
      expect(bootTarget(input(hash))).toEqual({ kind: "none" });
    }
  });

  it("UT-BOOT-OPT-001 a Cost route with a valid project id is a `cost` target for that screen (the route's id wins; an invalid one is none)", () => {
    expect(bootTarget(input(`#/costs/capex?projectId=${ID}`))).toEqual({ kind: "cost", projectId: ID, path: "/costs/capex" });
    expect(bootTarget(input(`#/costs/opex/om?projectId={${ID.toUpperCase()}}`))).toEqual({ kind: "cost", projectId: ID, path: "/costs/opex/om" });
    expect(bootTarget(input(`#/costs/add-from-table?projectId=${ID}`))).toEqual({ kind: "cost", projectId: ID, path: "/costs/add-from-table" });
    // Same sources as the SessionProvider on a cost route: the player URL's own search carries the id too.
    expect(bootTarget(input("#/costs/contracts", {}, `?projectId=${ID}`))).toEqual({ kind: "cost", projectId: ID, path: "/costs/contracts" });
    expect(bootTarget(input("#/costs/capex?projectId=nope"))).toEqual({ kind: "none" });
  });

  it("UT-BOOT-OPT-002 the bare root with a project id opens the Cost screen the costScreen launch parameter names", () => {
    expect(bootTarget(input("", { projectId: ID, costScreen: "/costs/land-lease" })))
      .toEqual({ kind: "cost", projectId: ID, path: "/costs/land-lease" });
    // An unknown costScreen falls back to CAPEX, as `Landing` does.
    expect(bootTarget(input("", { projectId: ID, costScreen: "/costs/nowhere" }))).toEqual({ kind: "cost", projectId: ID, path: "/costs/capex" });
  });

  it("UT-BOOT-OPT-003 each other Project Management screen with a project id in its ROUTE is a `pm-screen` target; none is the New Project mode", () => {
    for (const slug of ["milestones", "production", "checklist", "team", "planning", "grid-operator", "revenues", "finance"]) {
      expect(bootTarget(input(`#/project/${slug}?projectId=${ID}`))).toEqual({ kind: "pm-screen", projectId: ID, slug });
      expect(bootTarget(input(`#/project/${slug}`))).toEqual({ kind: "none" });
      expect(bootTarget(input(`#/project/${slug}?projectId=nope`))).toEqual({ kind: "none" });
      // A PM route ignores launch parameters (UT-BOOT-009).
      expect(bootTarget(input(`#/project/${slug}`, { projectId: ID }))).toEqual({ kind: "none" });
    }
  });
});

describe("boot plan: the category and the admin routes (T-C01, T-C03)", () => {
  it("UT-BOOT-COST-030 a CAPEX or Add Cost link carries the ?category= it names as a non-negative integer; anything else carries none", () => {
    expect(bootTarget(input(`#/costs/capex?projectId=${ID}&category=2`))).toEqual({ kind: "cost", projectId: ID, path: "/costs/capex", category: 2 });
    expect(bootTarget(input(`#/costs/add-from-table?category=0&projectId=${ID}`))).toEqual({ kind: "cost", projectId: ID, path: "/costs/add-from-table", category: 0 });
    for (const raw of ["", "x", "-1", "1.5", "100", " "]) {
      expect(bootTarget(input(`#/costs/capex?projectId=${ID}&category=${raw}`))).toEqual({ kind: "cost", projectId: ID, path: "/costs/capex" });
    }
    // The other Cost screens have no category tab.
    expect(bootTarget(input(`#/costs/land-lease?projectId=${ID}&category=2`))).toEqual({ kind: "cost", projectId: ID, path: "/costs/land-lease" });
    // The bare root (Landing) names none.
    expect(bootTarget(input("", { projectId: ID }))).toEqual({ kind: "cost", projectId: ID, path: "/costs/capex" });
  });

  it("UT-BOOT-ADMIN-001 each Administration route is an `admin` target (its chunk only); the bare /admin and an unknown screen are not", () => {
    for (const path of ADMIN_BOOT_PATHS) expect(bootTarget(input(`#${path}`))).toEqual({ kind: "admin", path });
    expect(bootTarget(input("#/admin"))).toEqual({ kind: "none" });
    expect(bootTarget(input("#/admin/nowhere"))).toEqual({ kind: "none" });
  });

  it("UT-BOOT-ADMIN-002 the admin paths are the router's own: routes.tsx declares exactly these screens, each through a named loader", () => {
    const source = readFileSync(fileURLToPath(new URL("./routes.tsx", import.meta.url)), "utf8");
    const declared = [...source.matchAll(/<Route path="([a-z-]+)" element=\{<Admin[A-Za-z]+Screen \/>\} \/>/g)].map((m) => `/admin/${m[1]}`);
    expect(declared.sort()).toEqual([...ADMIN_BOOT_PATHS].sort());
    expect(source).not.toMatch(/lazy\(\(\) => import\("@\/features\/admin/);
  });
});
