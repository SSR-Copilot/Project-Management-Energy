import { describe, expect, it } from "vitest";
import { routeName, stripQuery, stripUrlQueries, toEventPayload } from "./sanitize";

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
});
