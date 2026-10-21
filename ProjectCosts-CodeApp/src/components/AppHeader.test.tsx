// @vitest-environment jsdom
/**
 * The user menu's "Application Settings" row — `cmp_Header` `appSettingsKey`, which in the canvas
 * navigates to `Admin Project Default Checklists Screen`.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FluentProvider } from "@fluentui/react-components";
import { vsbTheme } from "@/theme/fluent";
import { AppHeader } from "./AppHeader";
import {
  environmentInfoColor, pmHeaderTitle, projectStatusColour, projectStatusIcon, projectStatusLabel, projectStatusVisible,
} from "./headerRules";
import { palette } from "@/theme/tokens";

const renderHeader = (onAppSettings?: () => void) =>
  render(
    <FluentProvider theme={vsbTheme}>
      <AppHeader hasError={false} onReportProblem={() => undefined} {...(onAppSettings ? { onAppSettings } : {})} />
    </FluentProvider>,
  );

describe("AppHeader user menu", () => {
  it("UT-HEADER-001 Application Settings is the first row and runs its handler", async () => {
    const user = userEvent.setup();
    const onAppSettings = vi.fn();
    renderHeader(onAppSettings);
    await user.click(screen.getByTestId("header-user"));
    const items = await screen.findAllByRole("menuitem");
    expect(items[0]).toHaveAttribute("data-testid", "header-user-app-settings");
    expect(items[0]).toHaveTextContent("Application Settings");
    await user.click(items[0]!);
    expect(onAppSettings).toHaveBeenCalledTimes(1);
  });

  it("UT-HEADER-002 the row is omitted when no handler is supplied", async () => {
    const user = userEvent.setup();
    renderHeader();
    await user.click(screen.getByTestId("header-user"));
    await screen.findAllByRole("menuitem");
    expect(screen.queryByTestId("header-user-app-settings")).not.toBeInTheDocument();
  });
});

describe("AppHeader environment info icon", () => {
  it("UT-HEADER-003 the (i) icon takes the ico_cmp_Header_Info.Color switch", () => {
    expect(environmentInfoColor("Dev")).toBe(palette.Error);
    expect(environmentInfoColor("Hotfix")).toBe(palette.Error);
    expect(environmentInfoColor("Nightly")).toBe(palette.Warning);
    expect(environmentInfoColor("QA")).toBe(palette.Success);
    // `gblAppColors.Transparent` — no icon at all.
    expect(environmentInfoColor("Prod")).toBeUndefined();
    expect(environmentInfoColor(undefined)).toBeUndefined();
  });

  it("UT-HEADER-004 the icon renders beside the version only where it has a colour", () => {
    const { unmount } = render(
      <FluentProvider theme={vsbTheme}>
        <AppHeader hasError={false} onReportProblem={() => undefined} environmentName="Dev" appVersion="1.0.0.1" />
      </FluentProvider>,
    );
    expect(screen.getByTestId("ico_cmp_Header_Info")).toBeInTheDocument();
    expect(screen.getByText("Version 1.0.0.1 (Dev)")).toBeInTheDocument();
    unmount();
    render(
      <FluentProvider theme={vsbTheme}>
        <AppHeader hasError={false} onReportProblem={() => undefined} environmentName="Prod" appVersion="1.0.0.1" />
      </FluentProvider>,
    );
    expect(screen.queryByTestId("ico_cmp_Header_Info")).toBeNull();
  });
});

describe("AppHeader Project Management shell (cmp_Header, 20 Oct 2026)", () => {
  it("UT-HEADER-005 the status text is the state for Abandoned / Inactive, else Active", () => {
    expect(projectStatusLabel(undefined)).toBe("");
    expect(projectStatusLabel("Cluster 2")).toBe("Active");
    expect(projectStatusLabel("Draft")).toBe("Active");
    expect(projectStatusLabel("Abandoned")).toBe("Abandoned");
    expect(projectStatusLabel("Inactive/ On-hold")).toBe("Inactive/ On-hold");
  });

  it("UT-HEADER-006 the status icon and colour follow ico_cmp_Header_ProjectStatus", () => {
    expect(projectStatusIcon("Cluster 1")).toBe("info");
    expect(projectStatusIcon("Abandoned")).toBe("blocked");
    expect(projectStatusIcon("Inactive/ On-hold")).toBe("lock");
    expect(projectStatusColour("Cluster 1")).toBe(`${palette.Success}60`);
    expect(projectStatusColour("Abandoned")).toBe(palette.akzent5);
    expect(projectStatusColour(undefined)).toBe("transparent");
  });

  it("UT-HEADER-007 the status line is hidden for a blank status and in QA / Prod", () => {
    expect(projectStatusVisible("Cluster 1", "Dev")).toBe(true);
    expect(projectStatusVisible("Cluster 1", undefined)).toBe(true);
    expect(projectStatusVisible("Cluster 1", "QA")).toBe(false);
    expect(projectStatusVisible("Cluster 1", "Prod")).toBe(false);
    expect(projectStatusVisible(undefined, "Dev")).toBe(false);
  });

  it("UT-HEADER-008 the PM title reads New Project with no project selected", () => {
    expect(pmHeaderTitle(undefined, undefined)).toBe("New Project");
    expect(pmHeaderTitle("p1", "Wirmighausen")).toBe("Wirmighausen");
    expect(pmHeaderTitle("p1", "")).toBeUndefined();
  });

  it("UT-HEADER-009 the back arrow and status line render only when supplied, and the arrow runs onBack", async () => {
    const onBack = vi.fn();
    const { unmount } = render(
      <FluentProvider theme={vsbTheme}>
        <AppHeader hasError={false} onReportProblem={() => undefined} environmentName="Dev"
          pageTitle="Wirmighausen" approvalState="Draft" projectStatus="Cluster 1" onBack={onBack} />
      </FluentProvider>,
    );
    await userEvent.click(screen.getByTestId("Image3"));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("con_cmp_Header_ProjectStatus")).toHaveTextContent("Active");
    unmount();
    // The Cost header: no arrow, no status line.
    render(
      <FluentProvider theme={vsbTheme}>
        <AppHeader hasError={false} onReportProblem={() => undefined} pageTitle="Wirmighausen" />
      </FluentProvider>,
    );
    expect(screen.queryByTestId("Image3")).toBeNull();
    expect(screen.queryByTestId("con_cmp_Header_ProjectStatus")).toBeNull();
  });
});
