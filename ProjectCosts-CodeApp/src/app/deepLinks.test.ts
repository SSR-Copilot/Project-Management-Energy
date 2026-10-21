import { afterEach, describe, expect, it, vi } from "vitest";
import {
  appTabUrl, costAppUrl, costLocation, COST_PATHS, launchCostPath, launchPmPath, localPlayUrl,
  projectAppUrl, resolvePlayAppUrl,
} from "./deepLinks";

const PROJECT = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const OLD_PROJECT = "11111111-2222-3333-4444-555555555555";
const ENVIRONMENT_ID = "be41add6-6f60-ebb0-9c73-2480d6bc615d";

describe("appTabUrl", () => {
  it("opens an arbitrary internal route in the hosted player", () => {
    // `Edit Project` needs this: the route carries the project in its PATH, so there is no
    // launch parameter to add.
    const url = new URL(appTabUrl({
      currentUrl: "https://env.api.powerplatformusercontent.com/assets/index.html",
      appUrl: "https://apps.powerapps.com/play/e/env/a/same-app?tenantId=t",
      path: `/projects/${PROJECT}/general`,
    }));
    expect(url.origin + url.pathname).toBe("https://apps.powerapps.com/play/e/env/a/same-app");
    expect(url.searchParams.get("tenantId")).toBe("t");
    expect(url.hash).toBe(`#/projects/${PROJECT}/general`);
    expect(url.searchParams.has("projectId")).toBe(false);
  });

  it("adds the project as a launch parameter as well when one is given", () => {
    // The player strips the fragment before `getContext()` runs, so a route that resolves a
    // project from the launch parameters needs it in the query string too.
    const url = new URL(appTabUrl({
      currentUrl: "http://localhost:3000/index.html",
      path: "/costs/capex",
      projectId: `{${PROJECT.toUpperCase()}}`,
    }));
    expect(url.searchParams.get("projectId")).toBe(PROJECT);
    expect(url.hash).toBe(`#/costs/capex?projectId=${PROJECT}`);
  });

  it("drops a stale project id and list state from the inherited URL", () => {
    const url = new URL(appTabUrl({
      currentUrl: `http://localhost:3000/index.html?tenantId=t&projectGuid=${OLD_PROJECT}&q=old&p=3`,
      path: "/projects/new",
    }));
    expect(url.searchParams.get("tenantId")).toBe("t");
    expect(url.searchParams.has("projectGuid")).toBe(false);
    expect(url.searchParams.has("q")).toBe(false);
    expect(url.searchParams.has("p")).toBe(false);
  });

  it("refuses an app URL that is not http(s)", () => {
    expect(() => appTabUrl({ currentUrl: "javascript:alert(1)", path: "/projects" })).toThrow();
  });
});

describe("same-app Cost links", () => {
  it("preserves the local application path and host parameters while replacing stale IDs", () => {
    const url = new URL(costAppUrl({
      currentUrl: `http://localhost:3000/app/index.html?tenantId=t&projectGuid=${OLD_PROJECT}&q=old#/projects?p=2`,
      projectId: PROJECT,
    }));
    expect(url.origin + url.pathname).toBe("http://localhost:3000/app/index.html");
    expect(url.searchParams.get("tenantId")).toBe("t");
    expect(url.searchParams.get("projectId")).toBe(PROJECT);
    expect(url.searchParams.has("projectGuid")).toBe(false);
    expect(url.searchParams.has("q")).toBe(false);
    expect(url.hash).toBe(`#/costs/capex?projectId=${PROJECT}`);
  });

  it("opens the same hosted player rather than the iframe asset URL", () => {
    const url = new URL(costAppUrl({
      currentUrl: "https://env.environment.api.powerplatformusercontent.com/assets/index.html",
      appUrl: `https://apps.powerapps.com/play/e/env/a/same-app?tenantId=t&PROJECTID=${OLD_PROJECT}`,
      projectId: PROJECT,
      path: "/costs/contracts",
    }));
    expect(url.origin + url.pathname).toBe("https://apps.powerapps.com/play/e/env/a/same-app");
    expect(url.searchParams.has("PROJECTID")).toBe(false);
    expect(url.searchParams.get("projectId")).toBe(PROJECT);
    expect(url.searchParams.get("costScreen")).toBe("/costs/contracts");
    // These outer parameters are sufficient even if the player doesn't forward its hash.
    expect(launchCostPath(Object.fromEntries(url.searchParams))).toBe("/costs/contracts");
  });

  it.each(COST_PATHS)("carries the normalized project through %s", (path) => {
    expect(costLocation(path, `{${PROJECT.toUpperCase()}}`))
      .toEqual({ pathname: path, search: `?projectId=${PROJECT}` });
  });

  it("rejects malformed IDs and unsafe app URL schemes", () => {
    expect(() => costLocation("/costs/capex", "invalid")).toThrow();
    expect(() => costAppUrl({ currentUrl: "javascript:alert(1)", projectId: PROJECT })).toThrow();
  });

  it("allows only registered Cost screens from the host", () => {
    expect(launchCostPath({ costScreen: "https://other.example" })).toBe("/costs/capex");
    expect(launchCostPath({ COSTSCREEN: "/costs/land-lease" })).toBe("/costs/land-lease");
    expect(launchCostPath({}, "?costScreen=/costs/opex/om")).toBe("/costs/opex/om");
  });
});

describe("local-dev play host", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("builds the pac code run play URL under Vite dev mode", () => {
    vi.stubEnv("DEV", true);
    const url = localPlayUrl({ environmentId: ENVIRONMENT_ID, appOrigin: "http://localhost:3000" });
    expect(url).toBeDefined();
    const parsed = new URL(url!);
    expect(parsed.origin + parsed.pathname).toBe(
      `https://apps.powerapps.com/play/e/${ENVIRONMENT_ID}/app/local`,
    );
    expect(parsed.searchParams.get("_localAppUrl")).toBe("http://localhost:3000");
    expect(parsed.searchParams.get("_localConnectionUrl")).toBe("http://localhost:8080");
  });

  it("honours VITE_LOCAL_CONNECTION_URL when the connection host runs on another port", () => {
    vi.stubEnv("DEV", true);
    vi.stubEnv("VITE_LOCAL_CONNECTION_URL", "http://localhost:9090");
    const url = localPlayUrl({ environmentId: ENVIRONMENT_ID, appOrigin: "http://localhost:3000" });
    expect(new URL(url!).searchParams.get("_localConnectionUrl")).toBe("http://localhost:9090");
  });

  it("stays undefined outside dev mode, so a build never fabricates a play URL", () => {
    vi.stubEnv("DEV", false);
    expect(localPlayUrl({ environmentId: ENVIRONMENT_ID, appOrigin: "http://localhost:3000" }))
      .toBeUndefined();
  });

  it("stays undefined with no environment id to target", () => {
    vi.stubEnv("DEV", true);
    expect(localPlayUrl({ appOrigin: "http://localhost:3000" })).toBeUndefined();
  });

  it("resolvePlayAppUrl prefers the LOCAL play URL under dev, even when the host reports one", () => {
    // 20 Oct 2026: during `pac code run` the host's appUrl played a PUBLISHED app, so Edit
    // Project opened the wrong app. Locally the new tab must stay on this local app.
    vi.stubEnv("DEV", true);
    const url = resolvePlayAppUrl({
      sessionAppUrl: "https://apps.powerapps.com/play/e/env/a/same-app",
      environmentId: ENVIRONMENT_ID,
      appOrigin: "http://localhost:3000",
    });
    expect(url).toContain(`/play/e/${ENVIRONMENT_ID}/app/local?`);
  });

  it("resolvePlayAppUrl uses the host-reported appUrl outside dev (a pushed app)", () => {
    vi.stubEnv("DEV", false);
    const url = resolvePlayAppUrl({
      sessionAppUrl: "https://apps.powerapps.com/play/e/env/a/same-app",
      environmentId: ENVIRONMENT_ID,
      appOrigin: "http://localhost:3000",
    });
    expect(url).toBe("https://apps.powerapps.com/play/e/env/a/same-app");
  });

  it("resolvePlayAppUrl falls back to the local play URL when the host gave none", () => {
    vi.stubEnv("DEV", true);
    const url = resolvePlayAppUrl({
      environmentId: ENVIRONMENT_ID,
      appOrigin: "http://localhost:3000",
    });
    expect(url).toContain("/app/local?");
  });
});

describe("Edit Project links (pmScreen)", () => {
  it("opens General Data for the project through launch parameters, not only the fragment", () => {
    const url = new URL(projectAppUrl({
      currentUrl: "https://apps.powerapps.com/play/e/env/app/local?_localAppUrl=x&projectId=" + OLD_PROJECT,
      projectId: `{${PROJECT.toUpperCase()}}`,
    }));
    expect(url.searchParams.get("pmScreen")).toBe("/project/general");
    expect(url.searchParams.get("projectId")).toBe(PROJECT);
    expect(url.searchParams.get("_localAppUrl")).toBe("x");
    expect(url.hash).toBe(`#/project/general?projectId=${PROJECT}`);
  });

  it("refuses a malformed project id", () => {
    expect(() => projectAppUrl({ currentUrl: "https://apps.powerapps.com/x", projectId: "nope" }))
      .toThrow();
  });

  it("launchPmPath accepts only known PM screens", () => {
    expect(launchPmPath({ pmScreen: "/project/general" })).toBe("/project/general");
    expect(launchPmPath({ PMSCREEN: "/project/general" })).toBe("/project/general");
    expect(launchPmPath({}, "?pmScreen=/project/general")).toBe("/project/general");
    expect(launchPmPath({ pmScreen: "/admin/cost" })).toBeUndefined();
    expect(launchPmPath({})).toBeUndefined();
  });
});
