/**
 * UT-ADMINACCESS — who sees the admin entry points (`app/adminAccess.ts`).
 */
import { describe, expect, it } from "vitest";
import { adminEntriesVisible } from "./adminAccess";
import { badgeScopeFromRoles, ROLE_APPLICATION_ADMINISTRATOR, ROLE_CONTROLLER_OWN_DATA } from "@/data/currentUser";

const none = { isApplicationAdministrator: false, isControllerOwnData: false };

describe("adminEntriesVisible", () => {
  it("UT-ADMINACCESS-001 a built app (not a local run) applies the canvas role rule", () => {
    expect(adminEntriesVisible(none, false)).toBe(false);
    expect(adminEntriesVisible(undefined, false)).toBe(false);
    expect(adminEntriesVisible({ ...none, isApplicationAdministrator: true }, false)).toBe(true);
    expect(adminEntriesVisible({ ...none, isControllerOwnData: true }, false)).toBe(true);
  });

  it("UT-ADMINACCESS-002 a local run shows every admin entry, as a system administrator would see them", () => {
    expect(adminEntriesVisible(none, true)).toBe(true);
    expect(adminEntriesVisible(undefined, true)).toBe(true);
  });
});

describe("admin role flags from the user's roles", () => {
  const role = (roleId: string, name: string) => ({ roleId, name });

  it("UT-ADMINACCESS-003 the two flags come from the two VSB role names, verbatim", () => {
    const admin = badgeScopeFromRoles([role("r1", ROLE_APPLICATION_ADMINISTRATOR)], new Map());
    expect(admin.isApplicationAdministrator).toBe(true);
    expect(admin.isControllerOwnData).toBe(false);
    const controller = badgeScopeFromRoles([role("r2", ROLE_CONTROLLER_OWN_DATA)], new Map());
    expect(controller.isControllerOwnData).toBe(true);
    expect(controller.isApplicationAdministrator).toBe(false);
  });

  it("UT-ADMINACCESS-004 the Dataverse System Administrator role does not count (canvas roles only)", () => {
    const sysadmin = badgeScopeFromRoles([role("r3", "System Administrator")], new Map());
    expect(adminEntriesVisible(sysadmin, false)).toBe(false);
  });
});
