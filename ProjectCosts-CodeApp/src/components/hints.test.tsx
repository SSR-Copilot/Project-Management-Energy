// @vitest-environment jsdom
/** UT-HINTS — the hover hints of the buttons and icons that act the same on every screen. */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { FluentProvider } from "@fluentui/react-components";
import { vsbTheme } from "@/theme/fluent";
import { ConfirmDialog } from "./ConfirmDialog";
import { FormPanel } from "./FormPanel";
import { HINTS } from "./hints";
import { PanelButtons } from "./CanvasFields";
import { ReorderPanel } from "./ReorderPanel";

const wrap = (node: React.ReactNode) => render(<FluentProvider theme={vsbTheme}>{node}</FluentProvider>);

describe("hover hints", () => {
  it("UT-HINTS-002 the shared texts are the canvas ones", () => {
    expect(HINTS).toEqual({ cancel: "Cancel", close: "Close", save: "Save" });
  });

  it("UT-HINTS-003 every panel's ✕ says \"Cancel\" on hover, and a panel can say otherwise (the cluster-change \"Close\")", () => {
    const { unmount } = wrap(<FormPanel open title="A" onDismiss={vi.fn()}>body</FormPanel>);
    expect(screen.getByRole("button", { name: "Close panel", hidden: true })).toHaveAttribute("title", "Cancel");
    unmount();
    wrap(<FormPanel open title="B" onDismiss={vi.fn()} closeLabel="Home" closeTooltip={HINTS.close}>body</FormPanel>);
    const close = screen.getByRole("button", { name: "Home", hidden: true });
    // The accessible name (the canvas AccessibleLabel) is unchanged; only the hover text differs.
    expect(close).toHaveAttribute("title", "Close");
  });

  it("UT-HINTS-004 the confirmation dialog's ✕ says \"Cancel\" on hover", () => {
    wrap(<ConfirmDialog open title="Delete" description="Sure?" onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByTestId("ico_PopUpConfirmation_BodyHeader_3")).toHaveAttribute("title", "Cancel");
  });

  it("UT-HINTS-005 a Save with the corrected hint says \"Save\"; one without a hint has none; a screen's own hint wins", () => {
    const { unmount } = wrap(<PanelButtons onSave={vi.fn()} saveTooltip={HINTS.save} />);
    expect(screen.getByTestId("panel-save")).toHaveAttribute("title", "Save");
    unmount();
    const plain = wrap(<PanelButtons onSave={vi.fn()} />);
    expect(screen.getByTestId("panel-save")).not.toHaveAttribute("title");
    plain.unmount();
    wrap(<PanelButtons onSave={vi.fn()} saveTooltip="Save Permit" />);
    expect(screen.getByTestId("panel-save")).toHaveAttribute("title", "Save Permit");
  });

  it("UT-HINTS-006 the reorder panel hands its Save hint to the footer", () => {
    wrap(
      <ReorderPanel<{ id: string; name: string }>
        open title="Reorder" items={[{ id: "a", name: "A" }]} getId={(i) => i.id} getLabel={(i) => i.name}
        listAriaLabel="Order" hint="Use the arrows." saving={false} onSave={vi.fn()} onCancel={vi.fn()} saveTestId="rs" saveTooltip={HINTS.save}
      />,
    );
    expect(screen.getByTestId("rs")).toHaveAttribute("title", "Save");
  });
});
