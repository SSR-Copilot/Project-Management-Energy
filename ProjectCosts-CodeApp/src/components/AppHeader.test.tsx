// @vitest-environment jsdom
/**
 * The user menu's "Application Settings" row — `cmp_Header` `appSettingsKey`, which in the canvas
 * navigates to `Admin Project Default Checklists Screen`.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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

  it("UT-HEADER-004 no (i) icon renders beside the version: its canvas Visible is a literal false", () => {
    const { unmount } = render(
      <FluentProvider theme={vsbTheme}>
        <AppHeader hasError={false} onReportProblem={() => undefined} environmentName="Dev" appVersion="1.0.0.1" />
      </FluentProvider>,
    );
    expect(screen.queryByTestId("ico_cmp_Header_Info")).toBeNull();
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

  /*
   * CA-21: the project name is `con_cmp_Header_HeaderText` (Size 20, Semibold) in BOTH canvas apps'
   * `cmp_Header`. The Cost name used to be a Fluent `Text` whose Griffel size (16 px) and colour beat
   * the stylesheet; the PM name, a plain span, got the 20 px rule. They must be the same kind of
   * element with the same shared class, and nothing on the Cost one may override it.
   */
  const titleOf = (name: string) => screen.getByTitle(name);

  it("UT-HEADER-010 the Cost project name is a plain span with the shared title class and no Fluent Text or Griffel class", () => {
    render(
      <FluentProvider theme={vsbTheme}>
        <AppHeader hasError={false} onReportProblem={() => undefined} pageTitle="Wirmighausen" />
      </FluentProvider>,
    );
    const title = titleOf("Wirmighausen");
    expect(title.tagName).toBe("SPAN");
    expect(title.textContent).toBe("Wirmighausen");
    expect(title.className).toBe("canvas-project-title");
    // Nothing that could win over the stylesheet: no Fluent `Text` class, no Griffel atomic class.
    expect(title.className).not.toMatch(/fui-Text|\bf[a-z0-9]{5,}\b/);
  });

  it("UT-HEADER-011 the PM project name carries the same shared title class", () => {
    render(
      <FluentProvider theme={vsbTheme}>
        <AppHeader hasError={false} onReportProblem={() => undefined} environmentName="Dev"
          pageTitle="Wirmighausen" approvalState="Draft" projectStatus="Cluster 1" onBack={() => undefined} />
      </FluentProvider>,
    );
    const title = titleOf("Wirmighausen");
    expect(title.tagName).toBe("SPAN");
    expect(title.classList.contains("canvas-project-title")).toBe(true);
    // Its only extra class is the PM-only spacing override.
    expect([...title.classList].sort()).toEqual(["canvas-pm-project-title", "canvas-project-title"]);
  });

  /*
   * What the stylesheet resolves to on both headers: 20 px, 600, identical. It does NOT reproduce the
   * original bug: jsdom does not model a browser's cascade between Fluent's runtime-injected (Griffel)
   * rules and a stylesheet, so a Fluent `Text` would still pass here. That guarantee is
   * UT-HEADER-010 (no Fluent `Text`, no Griffel class on the Cost name) and UT-HEADERCSS-001..003.
   */
  it("UT-HEADER-013 with the real stylesheet loaded, the Cost and PM names resolve to the same font", () => {
    const style = document.createElement("style");
    // `npm test` runs from the app folder (the same assumption the canvas-identity tests make).
    style.textContent = readFileSync(resolve(process.cwd(), "src/styles/canvas.css"), "utf8");
    document.head.appendChild(style);
    try {
      const fontOf = (el: HTMLElement) => {
        const c = window.getComputedStyle(el);
        return {
          size: c.fontSize, line: c.lineHeight, weight: c.fontWeight, colour: c.color, wrap: c.whiteSpace,
        };
      };
      const { unmount } = render(
        <FluentProvider theme={vsbTheme}>
          <AppHeader hasError={false} onReportProblem={() => undefined} pageTitle="Wirmighausen" />
        </FluentProvider>,
      );
      const cost = fontOf(titleOf("Wirmighausen"));
      unmount();
      render(
        <FluentProvider theme={vsbTheme}>
          <AppHeader hasError={false} onReportProblem={() => undefined} environmentName="Dev"
            pageTitle="Wirmighausen" approvalState="Draft" projectStatus="Cluster 1" onBack={() => undefined} />
        </FluentProvider>,
      );
      const pm = fontOf(titleOf("Wirmighausen"));
      // The canvas `con_cmp_Header_HeaderText`: Size 20, Semibold, in both apps.
      expect(cost.size).toBe("20px");
      expect(cost.weight).toBe("600");
      expect(cost).toEqual(pm);
    } finally {
      style.remove();
    }
  });

  it("UT-HEADER-012 a long name keeps its full text in the tooltip and is the same element on both headers", () => {
    const long = "Windpark Wirmighausen Erweiterung Nord Abschnitt II (Repowering)";
    const { unmount } = render(
      <FluentProvider theme={vsbTheme}>
        <AppHeader hasError={false} onReportProblem={() => undefined} pageTitle={long} />
      </FluentProvider>,
    );
    const cost = titleOf(long);
    expect(cost.getAttribute("title")).toBe(long);
    expect(cost.textContent).toBe(long);
    unmount();
    render(
      <FluentProvider theme={vsbTheme}>
        <AppHeader hasError={false} onReportProblem={() => undefined} pageTitle={long} onBack={() => undefined} />
      </FluentProvider>,
    );
    const pm = titleOf(long);
    expect(pm.tagName).toBe(cost.tagName);
    expect(pm.textContent).toBe(cost.textContent);
  });
});
