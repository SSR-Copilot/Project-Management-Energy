import { describe, expect, it } from "vitest";
import { bootTarget, needsLaunchParams, splitHash } from "./bootPlan";

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
    expect(bootTarget(input("", { projectId: ID }))).toEqual({ kind: "none" });
    expect(bootTarget(input("", {}, `?projectId=${ID}`))).toEqual({ kind: "none" });
  });

  it("UT-BOOT-006 Edit Project (pmScreen=/project/general + projectId) opens General Data of that project", () => {
    expect(bootTarget(input("", { projectId: ID, pmScreen: "/project/general" })))
      .toEqual({ kind: "general-data", projectId: ID });
    // An unknown pmScreen is not a PM launch: Landing falls through to the cost module.
    expect(bootTarget(input("", { projectId: ID, pmScreen: "/project/finance" }))).toEqual({ kind: "none" });
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
    for (const hash of ["#/costs/capex", "#/project/team?projectId=" + ID, "#/admin/cost", "#/nowhere"]) {
      expect(bootTarget(input(hash))).toEqual({ kind: "none" });
    }
  });
});
