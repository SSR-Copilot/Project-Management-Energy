import { describe, expect, it } from "vitest";
import { screenName } from "./screenNames";

describe("App Insights screen names", () => {
  it("UT-AI-020 uses the menu label, with its section", () => {
    expect(screenName("/projects")).toBe("Projects");
    expect(screenName("/project/milestones")).toBe("Project - Milestones");
    expect(screenName("/project/grid-operator")).toBe("Project - Grid Operator");
    expect(screenName("/costs/capex")).toBe("Costs - DEVEX/CAPEX");
    expect(screenName("/admin/milestones")).toBe("Admin - Milestones");
    expect(screenName("/admin/contract")).toBe("Admin - Contracts");
  });

  it("UT-AI-021 names the routes no menu lists, and keeps any other route as its path", () => {
    expect(screenName("/")).toBe("Start");
    expect(screenName("/costs/add-from-table")).toBe("Costs - Add Cost from Table");
    expect(screenName("/projects/:id/general")).toBe("/projects/:id/general");
  });
});
