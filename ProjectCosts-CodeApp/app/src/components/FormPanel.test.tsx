// @vitest-environment jsdom
/**
 * M7 + M8 — the shared panel: widths, busy lock, in-panel spinner, discard guard.
 *
 * Drawer / dialog content is queried with `hidden: true`: Fluent's tabster modalizer leaves
 * stale `aria-hidden` in jsdom after a nested dialog closes (same workaround as the
 * checklist-settings and capex-accounts screen tests).
 */
import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button, FluentProvider } from "@fluentui/react-components";
import { vsbTheme } from "@/theme/fluent";
import { useBeforeUnload } from "@/app/unsavedChanges";
import { FormPanel, PANEL_RADIO_ROW, PanelMessages, type FormPanelProps } from "./FormPanel";
import { formPanelWidth, useFormPanel } from "./formPanelContext";

function Harness(props: Partial<FormPanelProps> & { onDismissSpy?: () => void }) {
  const { onDismissSpy, ...rest } = props;
  const [open, setOpen] = useState(true);
  return (
    <FluentProvider theme={vsbTheme}>
      <FormPanel
        open={open} title="Edit thing"
        onDismiss={() => { onDismissSpy?.(); setOpen(false); }}
        footer={({ requestClose, busy }) => <Button disabled={busy} onClick={requestClose}>Cancel</Button>}
        {...rest}
      >
        <input aria-label="Name" />
      </FormPanel>
    </FluentProvider>
  );
}

describe("formPanelWidth", () => {
  it("keeps the presets and adds numbers capped at 100vw", () => {
    expect(formPanelWidth("narrow")).toBe(450);
    expect(formPanelWidth("period")).toBe(660);
    expect(formPanelWidth("cost")).toBe(750);
    expect(formPanelWidth("comments")).toBe(600);
    expect(formPanelWidth("wide")).toBe("min(960px, 50vw)");
    expect(formPanelWidth("full")).toBe("min(960px, 100vw)");
    expect(formPanelWidth(540)).toBe("min(540px, 100vw)");
    expect(formPanelWidth(650)).toBe("min(650px, 100vw)");
  });
});

describe("FormPanel", () => {
  it("unchanged by default: ✕ and Escape close at once", async () => {
    const spy = vi.fn();
    render(<Harness onDismissSpy={spy} width="narrow" />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Close panel", hidden: true }));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("applies a numeric width", () => {
    render(<Harness width={540} />);
    // jsdom drops `min()` from inline styles; the value itself is covered by `formPanelWidth`.
    expect(document.querySelector(".canvas-panel-custom")).not.toBeNull();
  });

  it("dirty: ✕, Escape and Cancel ask first; Keep editing keeps the input; Discard closes", async () => {
    const spy = vi.fn();
    render(<Harness onDismissSpy={spy} dirty width="narrow" />);
    await userEvent.type(screen.getByRole("textbox", { name: "Name", hidden: true }), "abc");

    await userEvent.click(screen.getByRole("button", { name: "Close panel", hidden: true }));
    expect(screen.getByText("Discard changes?")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Keep editing", hidden: true }));
    expect(spy).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: "Name", hidden: true })).toHaveValue("abc");

    fireEvent.keyDown(screen.getByRole("textbox", { name: "Name", hidden: true }), { key: "Escape" });
    expect(await screen.findByText("Discard changes?")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Keep editing", hidden: true }));
    expect(spy).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Cancel", hidden: true }));
    await userEvent.click(screen.getByRole("button", { name: "Discard", hidden: true }));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("custom discard wording", async () => {
    render(<Harness dirty discardText={{ description: "Your milestone changes are not saved." }} />);
    await userEvent.click(screen.getByRole("button", { name: "Close panel", hidden: true }));
    expect(screen.getByText("Your milestone changes are not saved.")).toBeInTheDocument();
  });

  it("busy: nothing dismisses, ✕ and the footer are disabled", async () => {
    const spy = vi.fn();
    render(<Harness onDismissSpy={spy} busy dirty />);
    expect(screen.getByRole("button", { name: "Close panel", hidden: true })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel", hidden: true })).toBeDisabled();
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Name", hidden: true }), { key: "Escape" });
    expect(spy).not.toHaveBeenCalled();
    expect(screen.queryByText("Discard changes?")).not.toBeInTheDocument();
  });

  it("busyLabel: the blocking spinner renders inside the drawer surface", () => {
    render(<Harness busyLabel="Please wait, saving..." />);
    const surface = screen.getByRole("dialog", { name: "Edit thing" });
    expect(surface).toHaveTextContent("Please wait, saving...");
    expect(screen.getByRole("button", { name: "Close panel", hidden: true })).toBeDisabled();
  });

  describe("G-1: reload / tab-close prompt", () => {
    const fireBeforeUnload = () => {
      const event = new Event("beforeunload", { cancelable: true }) as BeforeUnloadEvent;
      Object.defineProperty(event, "returnValue", { value: undefined, writable: true });
      window.dispatchEvent(event);
      return event;
    };
    const unloadCalls = (spy: { mock: { calls: unknown[][] } }) =>
      spy.mock.calls.filter((call) => call[0] === "beforeunload");

    it("open and dirty registers beforeunload with returnValue; clean or closed does not", () => {
      const { rerender } = render(<Harness dirty={false} />);
      expect(fireBeforeUnload().defaultPrevented).toBe(false);
      rerender(<Harness dirty />);
      const event = fireBeforeUnload();
      expect(event.defaultPrevented).toBe(true);
      expect(event.returnValue).toBe("");
      rerender(<FluentProvider theme={vsbTheme}><FormPanel open={false} title="T" dirty onDismiss={() => {}}>x</FormPanel></FluentProvider>);
      expect(fireBeforeUnload().defaultPrevented).toBe(false);
    });

    it("a screen that also calls useBeforeUnload (Milestones, Contracts) gets ONE listener", () => {
      const add = vi.spyOn(window, "addEventListener");
      const remove = vi.spyOn(window, "removeEventListener");
      function Screen({ dirty }: { dirty: boolean }) {
        useBeforeUnload(dirty);
        return <Harness dirty={dirty} />;
      }
      const { rerender, unmount } = render(<Screen dirty />);
      expect(unloadCalls(add)).toHaveLength(1);
      rerender(<Screen dirty={false} />);
      expect(unloadCalls(remove)).toHaveLength(1);
      expect(fireBeforeUnload().defaultPrevented).toBe(false);
      unmount();
      add.mockRestore();
      remove.mockRestore();
    });
  });

  describe("Wave A extensions (E1, E8)", () => {
    function Plain(props: Partial<FormPanelProps>) {
      const [open, setOpen] = useState(true);
      return (
        <FluentProvider theme={vsbTheme}>
          <FormPanel open={open} title="Edit thing" onDismiss={() => setOpen(false)} {...props}>
            <input aria-label="Name" />
          </FormPanel>
        </FluentProvider>
      );
    }

    it("E1a actions renders the shared footer; an explicit footer wins", async () => {
      const onSave = vi.fn();
      const { unmount } = render(<Plain actions={{ onSave, canSave: true }} />);
      await userEvent.click(screen.getByRole("button", { name: "Save", hidden: true }));
      expect(onSave).toHaveBeenCalledTimes(1);
      expect(screen.getByRole("button", { name: "Save", hidden: true }).parentElement).toHaveClass("canvas-panel-footer");
      unmount();
      render(<Plain actions={{ onSave, canSave: true }} footer={<span>custom</span>} />);
      expect(screen.queryByRole("button", { name: "Save", hidden: true })).not.toBeInTheDocument();
      expect(screen.getByText("custom")).toBeInTheDocument();
    });

    it("E1b messages: error first with role alert and title, then notices in order", () => {
      render(<Plain messages={{
        error: "Saving failed", errorTitle: "Not saved",
        notices: [{ intent: "warning", text: "Duplicate gate" }, { intent: "info", text: "Mode changed", title: "Note" }],
      }} />);
      const alert = screen.getByRole("alert", { hidden: true });
      expect(alert).toHaveTextContent("Not saved");
      expect(alert).toHaveTextContent("Saving failed");
      const dup = screen.getByText("Duplicate gate");
      const mode = screen.getByText("Mode changed");
      expect(alert.compareDocumentPosition(dup) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(dup.compareDocumentPosition(mode) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(screen.getByText("Note")).toBeInTheDocument();
      // First child of the body, before the panel's own content.
      expect(alert.compareDocumentPosition(screen.getByRole("textbox", { hidden: true })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it("E1b PanelMessages renders nothing when empty", () => {
      render(<FluentProvider theme={vsbTheme}><div data-testid="host"><PanelMessages error={null} notices={[]} /></div></FluentProvider>);
      expect(screen.getByTestId("host")).toBeEmptyDOMElement();
    });

    it("E1c closePrompt returning null closes at once and passes the reason", async () => {
      const onDismiss = vi.fn();
      render(<Plain dirty closePrompt={() => null} onDismiss={onDismiss} />);
      await userEvent.click(screen.getByRole("button", { name: "Close panel", hidden: true }));
      expect(onDismiss).toHaveBeenCalledWith("dismiss");
      expect(screen.queryByText("Discard changes?")).not.toBeInTheDocument();
    });

    it("E1c different reasons show different texts; ✕ = dismiss, footer Cancel = cancel", async () => {
      const prompt = vi.fn((reason: string) => (reason === "cancel"
        ? { title: "DevCo accounts incomplete", confirmText: "Close anyway" }
        : { description: "Dismissed with unsaved input." }));
      const onDismiss = vi.fn();
      render(<Plain closePrompt={prompt} onDismiss={onDismiss} actions={{ onSave: vi.fn(), canSave: true }} />);
      await userEvent.click(screen.getByRole("button", { name: "Close panel", hidden: true }));
      expect(screen.getByText("Dismissed with unsaved input.")).toBeInTheDocument();
      expect(screen.getByText("Discard changes?")).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Keep editing", hidden: true }));
      await userEvent.click(screen.getByRole("button", { name: "Cancel", hidden: true }));
      expect(screen.getByText("DevCo accounts incomplete")).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Close anyway", hidden: true }));
      expect(prompt.mock.calls.map((c) => c[0])).toEqual(["dismiss", "cancel"]);
      expect(onDismiss).toHaveBeenCalledWith("cancel");
    });

    it("E1c promptRequest opens that reason's prompt once; onPromptCancel fires on Keep editing", async () => {
      const onPromptCancel = vi.fn();
      const closePrompt = (reason: string) => (reason === "scope" ? { description: "The scope changed." } : null);
      const { rerender } = render(<Plain closePrompt={closePrompt} onPromptCancel={onPromptCancel} />);
      expect(screen.queryByText("The scope changed.")).not.toBeInTheDocument();
      rerender(<Plain closePrompt={closePrompt} onPromptCancel={onPromptCancel} promptRequest="scope" />);
      expect(await screen.findByText("The scope changed.")).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Keep editing", hidden: true }));
      expect(onPromptCancel).toHaveBeenCalledWith("scope");
      // Still "scope": not asked again until the caller clears it.
      rerender(<Plain closePrompt={closePrompt} onPromptCancel={onPromptCancel} promptRequest="scope" />);
      expect(screen.queryByText("The scope changed.")).not.toBeInTheDocument();
    });

    it("E1c promptRequest waits while the panel is busy", async () => {
      const closePrompt = () => ({ description: "The scope changed." });
      const { rerender } = render(<Plain closePrompt={closePrompt} busy promptRequest="scope" />);
      expect(screen.queryByText("The scope changed.")).not.toBeInTheDocument();
      rerender(<Plain closePrompt={closePrompt} promptRequest="scope" />);
      expect(await screen.findByText("The scope changed.")).toBeInTheDocument();
    });

    it("E1c without closePrompt onDismiss gets no argument (unchanged)", async () => {
      const onDismiss = vi.fn();
      render(<Plain onDismiss={onDismiss} />);
      await userEvent.click(screen.getByRole("button", { name: "Close panel", hidden: true }));
      expect(onDismiss).toHaveBeenCalledWith();
    });

    it("E1d coverLabel shows the blocking cover but ✕ still closes", async () => {
      const onDismiss = vi.fn();
      render(<Plain coverLabel="Loading contract..." onDismiss={onDismiss} />);
      expect(screen.getByRole("dialog", { name: "Edit thing" })).toHaveTextContent("Loading contract...");
      const close = screen.getByRole("button", { name: "Close panel", hidden: true });
      expect(close).not.toBeDisabled();
      await userEvent.click(close);
      expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it("E1e ariaLabel names the drawer; default is the title", () => {
      const { unmount } = render(<Plain />);
      expect(screen.getByRole("dialog", { name: "Edit thing" })).toBeInTheDocument();
      unmount();
      render(<Plain ariaLabel="Edit Milestones for Germany" />);
      expect(screen.getByRole("dialog", { name: "Edit Milestones for Germany" })).toBeInTheDocument();
    });

    it("E1 props keep one beforeunload listener", () => {
      const add = vi.spyOn(window, "addEventListener");
      const { unmount } = render(<Plain dirty closePrompt={() => null} messages={{ error: "x" }} coverLabel="c" />);
      expect(add.mock.calls.filter((c) => c[0] === "beforeunload")).toHaveLength(1);
      unmount();
      add.mockRestore();
    });

    it("E8 PANEL_RADIO_ROW is the opt-in class name", () => {
      expect(PANEL_RADIO_ROW).toBe("canvas-radio-row");
    });
  });

  it("useFormPanel gives children the guarded close", async () => {
    const spy = vi.fn();
    function Inner() {
      const { requestClose } = useFormPanel();
      return <Button onClick={requestClose}>Inner close</Button>;
    }
    render(
      <FluentProvider theme={vsbTheme}>
        <FormPanel open title="T" onDismiss={spy}><Inner /></FormPanel>
      </FluentProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Inner close" }));
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
