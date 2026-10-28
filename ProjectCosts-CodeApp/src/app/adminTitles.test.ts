import { describe, expect, it } from "vitest";
import { ADMIN_PAGE_TITLES, adminPageTitle } from "./adminTitles";

describe("admin header titles", () => {
  it("UT-ADMINTITLE-001 each admin route has its canvas cmp_Header Project.Name", () => {
    expect(adminPageTitle("/admin/default-checklists")).toBe("Checklist settings");
    expect(adminPageTitle("/admin/gates-approvals")).toBe("Project Gates");
    expect(adminPageTitle("/admin/capex-accounts")).toBe("CAPEX Accounts");
    expect(adminPageTitle("/admin/milestones")).toBe("Milestones");
    expect(adminPageTitle("/admin/cost")).toBe("Costs");
    expect(adminPageTitle("/admin/contract")).toBe("Contracts");
    expect(Object.keys(ADMIN_PAGE_TITLES)).toHaveLength(6);
  });

  it("UT-ADMINTITLE-002 a trailing slash is ignored; other routes have no admin title", () => {
    expect(adminPageTitle("/admin/milestones/")).toBe("Milestones");
    expect(adminPageTitle("/projects")).toBeUndefined();
    expect(adminPageTitle("/costs/capex")).toBeUndefined();
    expect(adminPageTitle("/admin")).toBeUndefined();
  });
});
