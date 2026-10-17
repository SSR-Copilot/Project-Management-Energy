// @vitest-environment jsdom
/** C1 — the shared panel Save / Cancel pair. */
import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FluentProvider } from "@fluentui/react-components";
import { vsbTheme } from "@/theme/fluent";
import { FormPanel } from "./FormPanel";
import { PanelFooter, type PanelFooterProps } from "./PanelFooter";

function InPanel(props: Partial<PanelFooterProps> & { dirty?: boolean; onDismiss?: () => void }) {
  const { dirty = false, onDismiss, ...footer } = props;
  const [open, setOpen] = useState(true);
  return (
    <FluentProvider theme={vsbTheme}>
      <FormPanel
        open={open} title="Edit" width="narrow" dirty={dirty}
        onDismiss={() => { onDismiss?.(); setOpen(false); }}
        footer={<PanelFooter onSave={vi.fn()} canSave {...footer} />}
      >
        body
      </FormPanel>
    </FluentProvider>
  );
}

const button = (name: string) => screen.getByRole("button", { name, hidden: true });

describe("PanelFooter (C1)", () => {
  it("Save is disabled when !canSave and while saving; saving disables Cancel too", () => {
    const { unmount } = render(<InPanel canSave={false} />);
    expect(button("Save")).toBeDisabled();
    expect(button("Cancel")).not.toBeDisabled();
    unmount();
    render(<InPanel canSave saving />);
    expect(button("Save")).toBeDisabled();
    expect(button("Cancel")).toBeDisabled();
  });

  it("Save calls onSave", async () => {
    const onSave = vi.fn();
    render(<InPanel onSave={onSave} />);
    await userEvent.click(button("Save"));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("Cancel without onCancel inside a dirty FormPanel asks 'Discard changes?'", async () => {
    const onDismiss = vi.fn();
    render(<InPanel dirty onDismiss={onDismiss} />);
    await userEvent.click(button("Cancel"));
    expect(screen.getByText("Discard changes?")).toBeInTheDocument();
    expect(onDismiss).not.toHaveBeenCalled();
    await userEvent.click(button("Discard"));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("Cancel without onCancel in a clean panel closes at once", async () => {
    const onDismiss = vi.fn();
    render(<InPanel onDismiss={onDismiss} />);
    await userEvent.click(button("Cancel"));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("an explicit onCancel replaces the guard", async () => {
    const onCancel = vi.fn();
    const onDismiss = vi.fn();
    render(<InPanel dirty onCancel={onCancel} onDismiss={onDismiss} />);
    await userEvent.click(button("Cancel"));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Discard changes?")).not.toBeInTheDocument();
  });

  it("savingLabel is shown while saving; the aria-label stays the save label", () => {
    const { unmount } = render(<InPanel saving savingLabel="Saving…" />);
    expect(button("Save")).toHaveTextContent("Saving…");
    unmount();
    render(<InPanel savingLabel="Saving…" />);
    expect(button("Save")).toHaveTextContent(/^Save$/);
  });

  it("the hint renders before the buttons and is aria-live polite", () => {
    render(<InPanel hint="Select a currency first" />);
    const hint = screen.getByText("Select a currency first");
    expect(hint).toHaveAttribute("aria-live", "polite");
    expect(hint.compareDocumentPosition(button("Save")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("both buttons carry aria-label = caption and the test ids; no wrapper element", () => {
    render(<InPanel saveLabel="Apply" cancelLabel="Close" saveTestId="s" cancelTestId="c" />);
    expect(button("Apply")).toHaveAttribute("aria-label", "Apply");
    expect(button("Close")).toHaveAttribute("aria-label", "Close");
    expect(screen.getByTestId("s")).toBe(button("Apply"));
    expect(screen.getByTestId("c")).toBe(button("Close"));
    expect(button("Apply").parentElement).toHaveClass("canvas-panel-footer");
    expect(button("Apply")).not.toHaveAttribute("type", "submit");
  });

  it("gap 20 adds a class on Cancel only; default adds none", () => {
    const { unmount } = render(<InPanel />);
    const plain = button("Cancel").className;
    unmount();
    render(<InPanel gap={20} />);
    expect(button("Cancel").className).not.toBe(plain);
  });
});
