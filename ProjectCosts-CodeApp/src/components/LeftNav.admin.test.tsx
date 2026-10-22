// @vitest-environment jsdom
/**
 * The admin rail honours `adminVisible` (canvas `ItemVisible: Or(IsApplicationAdministrator,
 * IsControllerOwnData)` on every `LeftAdminNavigationMenu` row).
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { FluentProvider } from "@fluentui/react-components";
import { MemoryRouter } from "react-router-dom";
import { vsbTheme } from "@/theme/fluent";
import { LeftNav } from "./LeftNav";

vi.mock("@/app/SessionContext", () => ({
  useSession: () => ({ locale: "en-GB", loading: false }),
}));

const renderAt = (path: string, adminVisible: boolean) =>
  render(
    <FluentProvider theme={vsbTheme}>
      <MemoryRouter initialEntries={[path]}>
        <LeftNav adminVisible={adminVisible} />
      </MemoryRouter>
    </FluentProvider>,
  );

describe("LeftNav admin rows", () => {
  it("UT-ADMINACCESS-005 shows the admin rows when admin entries are visible", () => {
    renderAt("/admin/default-checklists", true);
    expect(screen.getByText("Check List Settings")).toBeInTheDocument();
  });

  it("UT-ADMINACCESS-006 hides every admin row when they are not", () => {
    renderAt("/admin/default-checklists", false);
    expect(screen.queryByText("Check List Settings")).not.toBeInTheDocument();
    expect(screen.queryByText("Standard Assumptions")).not.toBeInTheDocument();
  });

  it("UT-ADMINACCESS-007 never hides the project or cost rails", () => {
    renderAt("/costs/capex", false);
    expect(screen.getAllByRole("link").length).toBeGreaterThan(0);
  });
});

describe("LeftNav collapse row (cmp_Left_Navigation, 20 Oct 2026)", () => {
  it("UT-RAIL-001 PM rail: no top header row, Collapse Menu at the bottom, toggles labels", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    const { container } = renderAt("/project/production?projectId=p1", true);
    const nav = container.querySelector("nav") as HTMLElement;
    expect(nav.querySelector(".canvas-rail-header")).toBeNull();
    const toggle = screen.getByTestId("icon_Left_Navigation_Expand");
    // The toggle is the LAST thing in the rail, after every item.
    expect(nav.lastElementChild?.contains(toggle)).toBe(true);
    expect(screen.getByText("Collapse Menu")).toBeInTheDocument();
    expect(screen.getByText("Production")).toBeInTheDocument();
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(nav.style.width).toBe("32px");
    expect(screen.queryByText("Production")).toBeNull();
  });

  it("UT-RAIL-003 collapsed admin rail is a flat icon list (pcf_Left_Navigation_Menu.Items drops ItemParentKey)", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    const { container } = renderAt("/admin/default-checklists", true);
    const nav = container.querySelector("nav") as HTMLElement;
    const adminLinks = ["GatesSettingKey", "GatesApprovalsKey", "CAPEX AccountsKey",
      "MilestonesSettingsKey", "CostSettingKey", "ContractSettingKey"];
    await userEvent.click(screen.getByTestId("icon_Left_Navigation_Expand"));
    expect(nav.style.width).toBe("32px");
    // No group header button (and so no chevron) is left.
    expect(nav.querySelector('[data-testid^="rail-group-"]')).toBeNull();
    // Every admin link is shown — both groups' — at the root of the nav, not indented in a group.
    for (const key of adminLinks) {
      const link = screen.getByTestId(`rail-${key}`);
      expect(link.parentElement).toBe(nav);
      expect(link).toHaveAccessibleName();
    }
    // The two group headers (no ItemIconName) are empty rows, in canvas order.
    expect(nav.querySelectorAll(".canvas-rail-blank")).toHaveLength(2);
    expect(screen.queryByText("Check List Settings")).toBeNull();
    // Expanding again restores the grouped tree with its labels.
    await userEvent.click(screen.getByTestId("icon_Left_Navigation_Expand"));
    expect(nav.querySelector('[data-testid="rail-group-GatesKey"]')).not.toBeNull();
    expect(nav.querySelectorAll(".canvas-rail-blank")).toHaveLength(0);
    expect(screen.getByText("Check List Settings")).toBeInTheDocument();
  });

  it("UT-RAIL-002 the cost rail keeps its hamburger header row", () => {
    const { container } = renderAt("/costs/capex", true);
    expect(container.querySelector(".canvas-rail-header")).not.toBeNull();
    expect(screen.queryByText("Collapse Menu")).toBeNull();
  });
});
