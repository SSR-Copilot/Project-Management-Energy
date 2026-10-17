// @vitest-environment jsdom
/**
 * SectionRail: collapsed group headers keep their name (parity round 2, NG-2).
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FluentProvider } from "@fluentui/react-components";
import { MemoryRouter } from "react-router-dom";
import type { NavItem } from "@/app/navigation";
import { vsbTheme } from "@/theme/fluent";
import { SectionRail } from "./SectionRail";

const ITEMS: NavItem[] = [
  { key: "G", label: "Project Gate", icon: "gates", enabled: true, visible: true },
  { key: "A", label: "Gates", icon: "gates", path: "/a", parentKey: "G", enabled: true, visible: true },
  { key: "S", label: "Standard Assumptions", icon: "accounts", enabled: true, visible: true },
  { key: "B", label: "Costs", icon: "accounts", path: "/b", parentKey: "S", enabled: true, visible: true },
];

function mount() {
  return render(
    <FluentProvider theme={vsbTheme}>
      <MemoryRouter>
        <SectionRail items={ITEMS} activeKey="A" hrefFor={(i) => i.path ?? "/"} ariaLabel="Settings sections" />
      </MemoryRouter>
    </FluentProvider>,
  );
}

describe("SectionRail", () => {
  it("UT-RAIL-001 (NG-2) a collapsed group header shows its label as a tooltip and keeps its name", async () => {
    const u = userEvent.setup();
    mount();
    // Expanded: the label is visible text, no tooltip wrapper is needed.
    expect(screen.getByText("Project Gate")).toBeInTheDocument();

    await u.click(screen.getByRole("button", { name: "Collapse menu" }));
    expect(screen.queryByText("Project Gate")).toBeNull();

    const group = screen.getByRole("button", { name: "Project Gate" });
    expect(group).toHaveAttribute("aria-expanded", "true");
    await u.hover(group);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Project Gate");
    expect(screen.getByRole("button", { name: "Standard Assumptions" })).toBeInTheDocument();
  });
});
