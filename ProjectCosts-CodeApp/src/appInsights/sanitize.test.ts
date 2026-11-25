import { describe, expect, it } from "vitest";
import { routeName, stripQuery, stripUrlQueries, toDependency, toEventPayload } from "./sanitize";

describe("App Insights sanitizing", () => {
  it("UT-AI-001 drops a Dataverse URL's query", () => {
    expect(stripQuery("https://org.crm4.dynamics.com/api/data/v9.2/vsb_projects?$filter=vsb_name eq 'Wind A'"))
      .toBe("https://org.crm4.dynamics.com/api/data/v9.2/vsb_projects");
  });

  it("UT-AI-002 drops a hash route's query and keeps the route", () => {
    expect(stripQuery("https://apps.powerapps.com/play/x?tenantId=t#/project/general?projectId=p-1"))
      .toBe("https://apps.powerapps.com/play/x#/project/general");
  });

  it("UT-AI-003 leaves a URL without a query unchanged", () => {
    expect(stripQuery("https://org.crm4.dynamics.com/api/data/v9.2/vsb_projects(p-1)"))
      .toBe("https://org.crm4.dynamics.com/api/data/v9.2/vsb_projects(p-1)");
  });

  it("UT-AI-004 strips queries from URLs inside a trace message", () => {
    expect(stripUrlQueries("GET https://org.crm4.dynamics.com/api/data/v9.2/vsb_projects?$filter=x → 404 (12 ms)"))
      .toBe("GET https://org.crm4.dynamics.com/api/data/v9.2/vsb_projects → 404 (12 ms)");
  });

  it("UT-AI-006 names a page view after its hash route, without query or ids", () => {
    expect(routeName("https://apps.powerapps.com/play/x?tenantId=t#/project/milestones?projectId=p-1"))
      .toBe("/project/milestones");
    expect(routeName("https://x/#/projects/0f8fad5b-d9cb-469f-a165-70867728950e/general"))
      .toBe("/projects/:id/general");
    expect(routeName("https://apps.powerapps.com/play/x")).toBe("/");
  });

  it("UT-AI-005 splits metric data into measurements and dimensions, URL sanitized", () => {
    expect(toEventPayload({
      url: "https://org.crm4.dynamics.com/api/data/v9.2/vsb_projects?$top=1",
      method: "GET", duration: 120, statusCode: 200, responseSize: 512,
    })).toEqual({
      properties: { url: "https://org.crm4.dynamics.com/api/data/v9.2/vsb_projects", method: "GET" },
      measurements: { duration: 120, statusCode: 200, responseSize: 512 },
    });
    expect(toEventPayload({ successfulAppLaunch: true, appLoadResult: "optimal", timeToAppInteractive: 900 }))
      .toEqual({
        properties: { successfulAppLaunch: "true", appLoadResult: "optimal" },
        measurements: { timeToAppInteractive: 900 },
      });
  });

  it("UT-AI-007 maps a request to a dependency: host as target, query dropped, ids folded into the name", () => {
    expect(toDependency({
      url: "https://org.crm4.dynamics.com/api/data/v9.2/vsb_projects(0f8fad5b-d9cb-469f-a165-70867728950e)?$select=vsb_name",
      method: "GET", duration: 120.5, statusCode: 200, responseSize: 512,
    }, "id-1")).toEqual({
      id: "id-1",
      name: "GET /api/data/v9.2/vsb_projects(:id)",
      data: "https://org.crm4.dynamics.com/api/data/v9.2/vsb_projects(0f8fad5b-d9cb-469f-a165-70867728950e)",
      target: "org.crm4.dynamics.com",
      type: "HTTP",
      duration: 120.5,
      responseCode: 200,
      success: true,
      properties: { responseSize: "512" },
    });
  });

  it("UT-AI-008 a 4xx/5xx is a failed dependency; a missing status is code 0 and not a failure; a relative URL has no target", () => {
    expect(toDependency({ url: "/api/data/v9.2/vsb_costs", method: "POST", duration: 40, statusCode: 403 }, "id-2"))
      .toEqual({ id: "id-2", name: "POST /api/data/v9.2/vsb_costs", data: "/api/data/v9.2/vsb_costs", type: "HTTP", duration: 40, responseCode: 403, success: false });
    expect(toDependency({ url: "/api/data/v9.2/vsb_costs", method: "GET", duration: 1 }, "id-3"))
      .toMatchObject({ responseCode: 0, success: true });
    const generated = toDependency({ url: "/x", method: "GET", duration: 1, statusCode: 200 });
    expect(generated.id).toMatch(/^[0-9a-f]+$/);
    expect(generated.id).not.toBe(toDependency({ url: "/x", method: "GET", duration: 1, statusCode: 200 }).id);
  });
});
