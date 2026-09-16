import { describe, expect, it } from "vitest";
import { costAppUrl, costLocation, COST_PATHS, launchCostPath } from "./deepLinks";

const PROJECT = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const OLD_PROJECT = "11111111-2222-3333-4444-555555555555";

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
