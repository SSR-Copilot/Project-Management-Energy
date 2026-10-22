// @vitest-environment jsdom
/** The shared panel Save / Cancel pair: the canvas look (cost / PM panels) and the `brand` look (Application Settings). */
import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FluentProvider } from "@fluentui/react-components";
import { vsbTheme } from "@/theme/fluent";
import { FormPanel } from "./FormPanel";
import { PanelButtons, type PanelButtonsProps } from "./CanvasFields";

function InPanel(props: Partial<PanelButtonsProps> & { dirty?: boolean; onDismiss?: () => void }) {
  const { dirty = false, onDismiss, ...footer } = props;
  const [open, setOpen] = useState(true);
  return (
    <FluentProvider theme={vsbTheme}>
      <FormPanel
        open={open} title="Edit" width="narrow" dirty={dirty}
        onDismiss={() => { onDismiss?.(); setOpen(false); }}
        footer={<PanelButtons look="brand" onSave={vi.fn()} {...footer} />}
      >
        body
      </FormPanel>
    </FluentProvider>
  );
}

const button = (name: string) => screen.getByRole("button", { name, hidden: true });

describe("PanelButtons look=brand (the Application Settings footer)", () => {
  it("UT-PANELFTR-001 Save is disabled when disabled and while saving; saving disables Cancel too", () => {
    const { unmount } = render(<InPanel disabled />);
    expect(button("Save")).toBeDisabled();
    expect(button("Cancel")).not.toBeDisabled();
    unmount();
    render(<InPanel saving />);
    expect(button("Save")).toBeDisabled();
    expect(button("Cancel")).toBeDisabled();
  });

  it("UT-PANELFTR-002 Save calls onSave", async () => {
    const onSave = vi.fn();
    render(<InPanel onSave={onSave} />);
    await userEvent.click(button("Save"));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("UT-PANELFTR-003 Cancel without onCancel inside a dirty FormPanel asks 'Discard changes?'", async () => {
    const onDismiss = vi.fn();
    render(<InPanel dirty onDismiss={onDismiss} />);
    await userEvent.click(button("Cancel"));
    expect(screen.getByText("Discard changes?")).toBeInTheDocument();
    expect(onDismiss).not.toHaveBeenCalled();
    await userEvent.click(button("Discard"));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("UT-PANELFTR-004 Cancel without onCancel in a clean panel closes at once", async () => {
    const onDismiss = vi.fn();
    render(<InPanel onDismiss={onDismiss} />);
    await userEvent.click(button("Cancel"));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("UT-PANELFTR-005 An explicit onCancel replaces the guard", async () => {
    const onCancel = vi.fn();
    const onDismiss = vi.fn();
    render(<InPanel dirty onCancel={onCancel} onDismiss={onDismiss} />);
    await userEvent.click(button("Cancel"));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Discard changes?")).not.toBeInTheDocument();
  });

  it("UT-PANELFTR-006 SavingLabel is shown while saving; the aria-label stays the save label", () => {
    const { unmount } = render(<InPanel saving savingLabel="Saving…" />);
    expect(button("Save")).toHaveTextContent("Saving…");
    unmount();
    render(<InPanel savingLabel="Saving…" />);
    expect(button("Save")).toHaveTextContent(/^Save$/);
  });

  it("UT-PANELFTR-007 The hint renders before the buttons and is aria-live polite", () => {
    render(<InPanel hint="Select a currency first" />);
    const hint = screen.getByText("Select a currency first");
    expect(hint).toHaveAttribute("aria-live", "polite");
    expect(hint.compareDocumentPosition(button("Save")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("UT-PANELFTR-008 Both buttons carry aria-label = caption and the test ids; no wrapper element", () => {
    render(<InPanel saveLabel="Apply" cancelLabel="Close" saveTestId="s" cancelTestId="c" />);
    expect(button("Apply")).toHaveAttribute("aria-label", "Apply");
    expect(button("Close")).toHaveAttribute("aria-label", "Close");
    expect(screen.getByTestId("s")).toBe(button("Apply"));
    expect(screen.getByTestId("c")).toBe(button("Close"));
    expect(button("Apply").parentElement).toHaveClass("canvas-panel-footer");
    expect(button("Apply")).not.toHaveAttribute("type", "submit");
  });

  it("UT-PANELFTR-009 Gap 20 adds a class on Cancel only; default adds none", () => {
    const { unmount } = render(<InPanel />);
    const plain = button("Cancel").className;
    unmount();
    render(<InPanel gap={20} />);
    expect(button("Cancel").className).not.toBe(plain);
  });

  it("UT-PANELFTR-010 The test ids default to panel-save / panel-cancel (rule 16)", () => {
    render(<InPanel />);
    expect(screen.getByTestId("panel-save")).toBe(button("Save"));
    expect(screen.getByTestId("panel-cancel")).toBe(button("Cancel"));
  });
});

describe("PanelButtons look=canvas (the cost / PM panels, unchanged by the Settings props)", () => {
  const mount = (props: Partial<PanelButtonsProps> = {}) => render(
    <FluentProvider theme={vsbTheme}>
      <PanelButtons onSave={vi.fn()} onCancel={vi.fn()} {...props} />
    </FluentProvider>,
  );

  it("UT-PANELBTN-001 The caption is always Save / Cancel; saveLabel and cancelLabel only set the aria-labels", () => {
    mount({ saveLabel: "btn_Save_Contract", cancelLabel: "btn_Cancel_Contract" });
    expect(screen.getByRole("button", { name: "btn_Save_Contract" })).toHaveTextContent(/^Save$/);
    expect(screen.getByRole("button", { name: "btn_Cancel_Contract" })).toHaveTextContent(/^Cancel$/);
    expect(screen.getByTestId("panel-save")).toBeInTheDocument();
    expect(screen.getByTestId("panel-cancel")).toBeInTheDocument();
  });

  it("UT-PANELBTN-002 Disabled disables Save only; Cancel stays enabled; the buttons are not the brand look", () => {
    mount({ disabled: true });
    expect(screen.getByTestId("panel-save")).toBeDisabled();
    expect(screen.getByTestId("panel-cancel")).not.toBeDisabled();
    expect(screen.getByTestId("panel-save").className).not.toBe(screen.getByTestId("panel-cancel").className);
  });

  it("UT-PANELBTN-003 The extra slot sits between Save and Cancel; subtleWhenDisabled only applies while disabled", () => {
    const { unmount } = mount({ extra: <span data-testid="extra">E</span> });
    const save = screen.getByTestId("panel-save");
    const extra = screen.getByTestId("extra");
    const cancel = screen.getByTestId("panel-cancel");
    expect(save.compareDocumentPosition(extra) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(extra.compareDocumentPosition(cancel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const enabledClass = save.className;
    unmount();
    mount({ subtleWhenDisabled: true });
    expect(screen.getByTestId("panel-save").className).toBe(enabledClass);
  });

  it("UT-PANELBTN-004 Save and Cancel call their handlers; saving disables both without changing the caption", async () => {
    const onSave = vi.fn();
    const onCancel = vi.fn();
    const { unmount } = mount({ onSave, onCancel });
    await userEvent.click(screen.getByTestId("panel-save"));
    await userEvent.click(screen.getByTestId("panel-cancel"));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
    unmount();
    mount({ saving: true });
    expect(screen.getByTestId("panel-save")).toBeDisabled();
    expect(screen.getByTestId("panel-save")).toHaveTextContent(/^Save$/);
    expect(screen.getByTestId("panel-cancel")).toBeDisabled();
  });
});
