// @vitest-environment jsdom
/**
 * The header's way out (G7) and the settings page title (05-gap-analysis M1).
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FluentProvider } from "@fluentui/react-components";
import { vsbTheme } from "@/theme/fluent";
import { palette } from "@/theme/tokens";
import { APPROVAL_STATE } from "@/domain/project";
import { AppHeader, HOME_LABEL, approvalStateColour, type AppHeaderProps } from "./AppHeader";

function renderHeader(props: Partial<AppHeaderProps> = {}) {
  return render(
    <FluentProvider theme={vsbTheme}>
      <AppHeader hasError={false} onReportProblem={() => {}} {...props} />
    </FluentProvider>,
  );
}

describe("AppHeader — way out and page title", () => {
  it("UT-HDR-001 with onHome, the logo and the back arrow both go home, by mouse and keyboard", async () => {
    const user = userEvent.setup();
    const onHome = vi.fn();
    renderHeader({ onHome, pageTitle: "Costs", hideApprovalState: true });
    const buttons = screen.getAllByRole("button", { name: HOME_LABEL });
    expect(buttons).toHaveLength(2);
    await user.click(buttons[0]!);
    await user.click(buttons[1]!);
    buttons[0]!.focus();
    await user.keyboard("{Enter}");
    expect(onHome).toHaveBeenCalledTimes(3);
  });

  it("UT-HDR-005 (G-6) the back arrow is the canvas's bordered 35-px square and keeps its accessible name", () => {
    renderHeader({ onHome: () => {}, pageTitle: "Costs", hideApprovalState: true });
    const arrow = document.querySelector<HTMLButtonElement>("button.canvas-back-arrow");
    expect(arrow).not.toBeNull();
    expect(screen.getAllByRole("button", { name: HOME_LABEL })).toContain(arrow);
    /*
     * jsdom's cascade cannot resolve Fluent's `var()`-based border shorthand against Griffel's
     * atomic longhands, so read the plain (non-pseudo) atomic rules applied to the button instead.
     */
    const classes = new Set(arrow!.classList);
    const declarations = [...document.querySelectorAll("style")]
      .flatMap((s) => [...(s.sheet?.cssRules ?? [])])
      .filter((r): r is CSSStyleRule => r instanceof CSSStyleRule && /^\.[\w-]+$/.test(r.selectorText)
        && classes.has(r.selectorText.slice(1)))
      .map((r) => r.style.cssText.toLowerCase())
      .join(" ");
    for (const expected of [
      "width: 35px", "height: 35px",
      "border-top-style: solid", "border-left-style: solid", "border-top-width: 1px",
      // #006EB9 and white, as jsdom serialises them.
      "border-top-color: rgb(0, 110, 185)", "border-bottom-color: rgb(0, 110, 185)",
      "background-color: rgb(255, 255, 255)", "border-top-left-radius: 4px",
    ]) {
      expect(declarations).toContain(expected);
    }
    expect(getComputedStyle(arrow!).width).toBe("35px");
  });

  it("UT-HDR-002 without onHome (cost / PM screens) the logo is a plain image and there is no arrow", () => {
    renderHeader({ pageTitle: "Selected Project", approvalState: "Draft" });
    expect(screen.queryByRole("button", { name: HOME_LABEL })).toBeNull();
    expect(screen.getByRole("img", { name: "VSB Cloud" })).toBeInTheDocument();
  });

  it("UT-HDR-003 hideApprovalState shows the title as the page heading, with no approval bar", () => {
    const { container } = renderHeader({ pageTitle: "Checklist settings", hideApprovalState: true, onHome: () => {} });
    expect(screen.getByRole("heading", { level: 1, name: "Checklist settings" })).toBeInTheDocument();
    expect(container.querySelector(".canvas-project-state")).toBeNull();
  });

  it("UT-HDR-004 a project title keeps its approval-state bar (cost screens unchanged)", () => {
    const { container } = renderHeader({
      pageTitle: "Selected Project", approvalState: "Draft", approvalStateValue: APPROVAL_STATE.draft,
    });
    expect(container.querySelector(".canvas-project-state")).not.toBeNull();
    expect(screen.getByText("Selected Project")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
  });

  it("UT-HDR-006 the approval bar colour keys on the option VALUE; the label is only the tooltip", () => {
    expect(approvalStateColour(APPROVAL_STATE.draft)).toBe(palette.akzent2);
    expect(approvalStateColour(APPROVAL_STATE.approving)).toBe(palette.akzent4);
    expect(approvalStateColour(APPROVAL_STATE.approved)).toBe(palette.akzent3);
    expect(approvalStateColour(APPROVAL_STATE.rejected)).toBe(palette.akzent5);
    // Canceled has no row in `gblTableApprovalStateColors`, nor does a blank state.
    expect(approvalStateColour(APPROVAL_STATE.canceled)).toBe(palette.white);
    expect(approvalStateColour(undefined)).toBe(palette.white);
    // A relabelled state keeps its colour: the bar does not read the label at all.
    const { container } = renderHeader({
      pageTitle: "P", approvalState: "Genehmigt", approvalStateValue: APPROVAL_STATE.approved,
    });
    const bar = container.querySelector<HTMLElement>(".canvas-project-state");
    expect(bar?.style.backgroundColor).not.toBe("");
    const probe = document.createElement("span");
    probe.style.backgroundColor = palette.akzent3;
    expect(bar?.style.backgroundColor).toBe(probe.style.backgroundColor);
  });
});
