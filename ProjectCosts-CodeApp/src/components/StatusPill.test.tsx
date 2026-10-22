// @vitest-environment jsdom
/** StatusPill, ExpandToggle and CollapsibleCard. */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { FluentProvider } from "@fluentui/react-components";
import { vsbTheme } from "@/theme/fluent";
import { StatusPill } from "./StatusPill";
import { ExpandToggle } from "./ExpandToggle";
import { CollapsibleCard } from "./CollapsibleCard";

const wrap = (node: React.ReactNode) => render(<FluentProvider theme={vsbTheme}>{node}</FluentProvider>);

describe("StatusPill", () => {
  it("UT-STATUSPILL-001 Static renders a span (no button) with the label", () => {
    wrap(<StatusPill variant="static" active testId="p" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByTestId("p").tagName).toBe("SPAN");
    expect(screen.getByTestId("p")).toHaveTextContent("Active");
  });

  it("UT-STATUSPILL-002 Static active / inactive differ in class; custom labels", () => {
    wrap(<>
      <StatusPill variant="static" active testId="a" />
      <StatusPill variant="static" active={false} testId="b" labels={{ on: "On", off: "Off" }} />
    </>);
    expect(screen.getByTestId("a").className).not.toBe(screen.getByTestId("b").className);
    expect(screen.getByTestId("b")).toHaveTextContent("Off");
  });

  it("UT-STATUSPILL-003 Toggle click calls onToggle; PG aria wording verbatim", () => {
    const onToggle = vi.fn();
    wrap(<StatusPill variant="toggle" active subject="Gate G1" onToggle={onToggle} />);
    const b = screen.getByRole("button", { name: "Gate G1: Active. Click to deactivate" });
    expect(b).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(b);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("UT-STATUSPILL-004 Locked and pending block the click; pending shows the spinner", () => {
    const onToggle = vi.fn();
    const { container } = wrap(<>
      <StatusPill variant="toggle" active={false} subject="Gate A" locked onToggle={onToggle} />
      <StatusPill variant="toggle" active={false} subject="Gate B" pending onToggle={onToggle} />
    </>);
    const locked = screen.getByRole("button", { name: "Gate A: Inactive (cannot be changed here)" });
    const pending = screen.getByRole("button", { name: "Gate B: Inactive. Click to activate" });
    expect(locked).toBeDisabled();
    expect(pending).toBeDisabled();
    fireEvent.click(locked);
    fireEvent.click(pending);
    expect(onToggle).not.toHaveBeenCalled();
    expect(pending.querySelector(".fui-Spinner")).not.toBeNull();
    expect(container.querySelectorAll(".fui-Spinner")).toHaveLength(1);
  });

  it("UT-STATUSPILL-005 LockedReason keeps the locked pill focusable with a tooltip and still blocks the click", async () => {
    const onToggle = vi.fn();
    wrap(<StatusPill variant="toggle" active subject="Gate A" locked lockedReason="Set by the template" onToggle={onToggle} />);
    const b = screen.getByRole("button", { name: "Gate A: Active (cannot be changed here)" });
    expect(b).not.toBeDisabled();
    expect(b).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(b);
    expect(onToggle).not.toHaveBeenCalled();
    b.focus();
    expect(await screen.findByText("Set by the template")).toBeInTheDocument();
  });
});

describe("ExpandToggle", () => {
  it("UT-STATUSPILL-006 Text18: + / - glyph, aria-expanded, aria-label, aria-controls; toggles", () => {
    const onToggle = vi.fn();
    const { rerender } = wrap(<ExpandToggle variant="text18" expanded={false} label="Show the Grid costs" controls="g1" onToggle={onToggle} />);
    const b = screen.getByRole("button", { name: "Show the Grid costs" });
    expect(b).toHaveTextContent("+");
    expect(b).toHaveAttribute("aria-expanded", "false");
    expect(b).toHaveAttribute("aria-controls", "g1");
    fireEvent.click(b);
    expect(onToggle).toHaveBeenCalledTimes(1);
    rerender(<FluentProvider theme={vsbTheme}><ExpandToggle variant="text18" expanded label="Hide the Grid costs" onToggle={onToggle} /></FluentProvider>);
    expect(screen.getByRole("button", { name: "Hide the Grid costs" })).toHaveTextContent("-");
  });

  it("UT-STATUSPILL-007 Icon24: an icon button, 24 px; the spacer is the same width", () => {
    wrap(<>
      <ExpandToggle variant="icon24" expanded label="Collapse tasks of G1" onToggle={vi.fn()} />
      <span data-testid="sp"><ExpandToggle.Spacer variant="icon24" /></span>
    </>);
    const b = screen.getByRole("button", { name: "Collapse tasks of G1" });
    expect(b).toHaveAttribute("aria-expanded", "true");
    expect(b.querySelector("svg")).not.toBeNull();
    expect(b).toHaveStyle({ width: "24px" });
    expect(screen.getByTestId("sp").firstElementChild).toHaveStyle({ width: "24px" });
  });
});

describe("CollapsibleCard", () => {
  it("UT-STATUSPILL-008 Body renders only when expanded; chevron aria wiring; trailing slot", () => {
    const onToggle = vi.fn();
    const { rerender } = wrap(
      <CollapsibleCard id="7" idPrefix="contract-card-body-" variant="contract" title={<h3>Dev 1</h3>}
        trailing={<span>Inactive</span>} expanded={false} onToggle={onToggle} toggleLabel="Expand Dev 1"
        as="article" ariaLabel="Dev 1" testId="card">
        <p>body</p>
      </CollapsibleCard>,
    );
    expect(screen.queryByText("body")).not.toBeInTheDocument();
    expect(screen.getByText("Inactive")).toBeInTheDocument();
    const chevron = screen.getByRole("button", { name: "Expand Dev 1" });
    expect(chevron).toHaveAttribute("aria-expanded", "false");
    expect(chevron).toHaveAttribute("aria-controls", "contract-card-body-7");
    fireEvent.click(chevron);
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("article", { name: "Dev 1" })).toBe(screen.getByTestId("card"));

    rerender(
      <FluentProvider theme={vsbTheme}>
        <CollapsibleCard id="7" idPrefix="contract-card-body-" variant="contract" title={<h3>Dev 1</h3>}
          expanded onToggle={onToggle} toggleLabel="Collapse Dev 1"><p>body</p></CollapsibleCard>
      </FluentProvider>,
    );
    expect(screen.getByText("body").parentElement).toHaveAttribute("id", "contract-card-body-7");
  });

  it("UT-STATUSPILL-009 Account and contract variants use different header classes", () => {
    wrap(<>
      <CollapsibleCard id="a" variant="account" title="A" expanded={false} onToggle={vi.fn()} toggleLabel="ta" testId="acc" />
      <CollapsibleCard id="b" variant="contract" title="B" expanded={false} onToggle={vi.fn()} toggleLabel="tb" testId="con" />
    </>);
    expect(screen.getByTestId("acc").firstElementChild!.className)
      .not.toBe(screen.getByTestId("con").firstElementChild!.className);
    expect(screen.getByTestId("acc").tagName).toBe("DIV");
  });
});
