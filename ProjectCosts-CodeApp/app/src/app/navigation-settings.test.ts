import { describe, expect, it } from "vitest";
import {
  SETTINGS_HOME, SETTINGS_NAV_ITEMS, SETTINGS_PAGE_TITLES, SETTINGS_PATHS, activeSettingsNavKey,
  isSettingsPath, settingsDocumentTitle, settingsPageTitle,
} from "./navigation-settings";

describe("Application Settings navigation", () => {
  it("UT-SET-001 mirrors LeftAdminNavigationMenu: two groups, six destinations, canvas keys", () => {
    const groups = SETTINGS_NAV_ITEMS.filter((i) => !i.path).map((i) => i.key);
    expect(groups).toEqual(["GatesKey", "StandardAssumptionsKey"]);
    const leaves = SETTINGS_NAV_ITEMS.filter((i) => i.path).map((i) => [i.key, i.parentKey, i.label]);
    expect(leaves).toEqual([
      ["GatesSettingKey", "GatesKey", "Check List Settings"],
      ["GatesApprovalsKey", "GatesKey", "Project Gates"],
      ["CAPEX AccountsKey", "GatesKey", "CAPEX Accounts"],
      ["MilestonesSettingsKey", "StandardAssumptionsKey", "Milestones"],
      ["CostSettingKey", "StandardAssumptionsKey", "Costs"],
      ["ContractSettingKey", "StandardAssumptionsKey", "Contracts"],
    ]);
  });

  it("UT-SET-002 the header item lands on Check List Settings, as the canvas Navigate does", () => {
    expect(SETTINGS_HOME).toBe(SETTINGS_PATHS.checklists);
  });

  it("UT-SET-003 highlights the right item for every settings path", () => {
    expect(activeSettingsNavKey("/settings/checklists")).toBe("GatesSettingKey");
    expect(activeSettingsNavKey("/settings/gates")).toBe("GatesApprovalsKey");
    expect(activeSettingsNavKey("/settings/capex-accounts")).toBe("CAPEX AccountsKey");
    expect(activeSettingsNavKey("/settings/milestones")).toBe("MilestonesSettingsKey");
    expect(activeSettingsNavKey("/settings/costs")).toBe("CostSettingKey");
    expect(activeSettingsNavKey("/settings/contracts")).toBe("ContractSettingKey");
    expect(activeSettingsNavKey("/projects")).toBeUndefined();
  });

  it("UT-SET-005 gives every settings screen its canvas header title", () => {
    expect(settingsPageTitle("/settings/checklists")).toBe("Checklist settings");
    expect(settingsPageTitle("/settings/gates")).toBe("Project Gates");
    expect(settingsPageTitle("/settings/capex-accounts")).toBe("CAPEX Accounts");
    expect(settingsPageTitle("/settings/milestones")).toBe("Milestones");
    expect(settingsPageTitle("/settings/costs")).toBe("Costs");
    expect(settingsPageTitle("/settings/contracts")).toBe("Contracts");
    expect(Object.keys(SETTINGS_PAGE_TITLES)).toHaveLength(6);
  });

  it("UT-SET-006 has no title outside the six screens", () => {
    expect(settingsPageTitle("/settings")).toBeUndefined();
    expect(settingsPageTitle("/projects")).toBeUndefined();
    expect(settingsPageTitle("/costs/capex")).toBeUndefined();
    expect(settingsDocumentTitle("Costs")).toBe("Costs · Application Settings");
  });

  it("UT-SET-004 recognises settings paths only", () => {
    expect(isSettingsPath("/settings")).toBe(true);
    expect(isSettingsPath("/settings/costs")).toBe(true);
    expect(isSettingsPath("/settingsx")).toBe(false);
    expect(isSettingsPath("/costs/capex")).toBe(false);
  });
});
