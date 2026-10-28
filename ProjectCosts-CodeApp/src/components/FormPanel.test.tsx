// @vitest-environment jsdom
/**
 * The shared panel: the plain master panel (defaults), widths, busy lock, in-panel spinner, discard guard.
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
import { useBeforeUnload } from "./discardGuard";
import { FormPanel, type FormPanelProps } from "./FormPanel";
import { PanelMessages } from "./PanelMessages";
import { PANEL_RADIO_ROW, formPanelWidth, useFormPanel } from "./formPanelContext";

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

describe("FormPanel defaults (the plain panel every cost / PM screen uses)", () => {
  it("UT-FORMPANEL-001 Every master width preset keeps its width", () => {
    expect(formPanelWidth("narrow")).toBe(450);
    expect(formPanelWidth("wide")).toBe("min(960px, 50vw)");
    expect(formPanelWidth("cost")).toBe(750);
    expect(formPanelWidth("period")).toBe(660);
    expect(formPanelWidth("comments")).toBe(600);
    expect(formPanelWidth("twoColumn")).toBe(860);
    expect(formPanelWidth("fieldsAndSide")).toBe(680);
    expect(formPanelWidth("threeColumn")).toBe(1040);
  });

  it("UT-FORMPANEL-002 Chrome classes, inline width, close icon identity and footer slot are unchanged", () => {
    render(
      <FluentProvider theme={vsbTheme}>
        <FormPanel open title="Cost" width="cost" onDismiss={() => {}} footer={<button type="button">Foot</button>}>body</FormPanel>
      </FluentProvider>,
    );
    const surface = screen.getByRole("dialog", { name: "Cost" });
    expect(surface).toHaveClass("canvas-panel", "canvas-panel-cost");
    expect(surface.style.width).toBe("750px");
    expect(surface.style.maxWidth).toBe("100vw");
    const close = screen.getByRole("button", { name: "Close panel", hidden: true });
    expect(close).toHaveAttribute("data-testid", "panel-close");
    expect(close).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Foot", hidden: true }).parentElement).toHaveClass("canvas-panel-footer");
  });

  it("UT-FORMPANEL-003 Without a footer there is no footer band; closeTestId / closeLabel override the close icon", () => {
    render(
      <FluentProvider theme={vsbTheme}>
        <FormPanel open title="T" onDismiss={() => {}} closeTestId="ico_Close" closeLabel="Close it">body</FormPanel>
      </FluentProvider>,
    );
    expect(document.querySelector(".canvas-panel-footer")).toBeNull();
    expect(screen.getByRole("button", { name: "Close it", hidden: true })).toHaveAttribute("data-testid", "ico_Close");
  });

  it("UT-FORMPANEL-004 Close icon and Escape call onDismiss() with no argument and no prompt", async () => {
    const onDismiss = vi.fn();
    render(
      <FluentProvider theme={vsbTheme}>
        <FormPanel open title="T" onDismiss={onDismiss}><input aria-label="Name" /></FormPanel>
      </FluentProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Close panel", hidden: true }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledWith();
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Name", hidden: true }), { key: "Escape" });
    expect(onDismiss).toHaveBeenCalledTimes(2);
    expect(onDismiss).toHaveBeenLastCalledWith();
    expect(screen.queryByText("Discard changes?")).not.toBeInTheDocument();
  });
});

describe("FormPanelWidth", () => {
  it("UT-SETPANEL-001 Keeps the presets and adds numbers capped at 100vw", () => {
    expect(formPanelWidth("narrow")).toBe(450);
    expect(formPanelWidth("period")).toBe(660);
    expect(formPanelWidth("cost")).toBe(750);
    expect(formPanelWidth("comments")).toBe(600);
    expect(formPanelWidth("wide")).toBe("min(960px, 50vw)");
    expect(formPanelWidth("full")).toBe("min(960px, 100vw)");
    // UT-FORMPANEL-005 `grid` is Add Cost from Table's ~95 % wide panel.
    expect(formPanelWidth("grid")).toBe("95vw");
    expect(formPanelWidth(540)).toBe("min(540px, 100vw)");
    expect(formPanelWidth(650)).toBe("min(650px, 100vw)");
  });
});

describe("FormPanel", () => {
  it("UT-SETPANEL-002 Unchanged by default: ✕ and Escape close at once", async () => {
    const spy = vi.fn();
    render(<Harness onDismissSpy={spy} width="narrow" />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Close panel", hidden: true }));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("UT-SETPANEL-003 Applies a numeric width", () => {
    render(<Harness width={540} />);
    // jsdom drops `min()` from inline styles; the value itself is covered by `formPanelWidth`.
    expect(document.querySelector(".canvas-panel-custom")).not.toBeNull();
  });

  it("UT-SETPANEL-004 Dirty: ✕, Escape and Cancel ask first; Keep editing keeps the input; Discard closes", async () => {
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

  it("UT-SETPANEL-005 Custom discard wording", async () => {
    render(<Harness dirty discardText={{ description: "Your milestone changes are not saved." }} />);
    await userEvent.click(screen.getByRole("button", { name: "Close panel", hidden: true }));
    expect(screen.getByText("Your milestone changes are not saved.")).toBeInTheDocument();
  });

  it("UT-SETPANEL-006 Busy: nothing dismisses, ✕ and the footer are disabled", async () => {
    const spy = vi.fn();
    render(<Harness onDismissSpy={spy} busy dirty />);
    expect(screen.getByRole("button", { name: "Close panel", hidden: true })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel", hidden: true })).toBeDisabled();
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Name", hidden: true }), { key: "Escape" });
    expect(spy).not.toHaveBeenCalled();
    expect(screen.queryByText("Discard changes?")).not.toBeInTheDocument();
  });

  it("UT-SETPANEL-007 BusyLabel: the blocking spinner renders inside the drawer surface", () => {
    render(<Harness busyLabel="Please wait, saving..." />);
    const surface = screen.getByRole("dialog", { name: "Edit thing" });
    expect(surface).toHaveTextContent("Please wait, saving...");
    expect(screen.getByRole("button", { name: "Close panel", hidden: true })).toBeDisabled();
  });

  describe("Reload / tab-close prompt", () => {
    const fireBeforeUnload = () => {
      const event = new Event("beforeunload", { cancelable: true }) as BeforeUnloadEvent;
      Object.defineProperty(event, "returnValue", { value: undefined, writable: true });
      window.dispatchEvent(event);
      return event;
    };
    const unloadCalls = (spy: { mock: { calls: unknown[][] } }) =>
      spy.mock.calls.filter((call) => call[0] === "beforeunload");

    it("UT-SETPANEL-008 Open and dirty registers beforeunload with returnValue; clean or closed does not", () => {
      const { rerender } = render(<Harness dirty={false} />);
      expect(fireBeforeUnload().defaultPrevented).toBe(false);
      rerender(<Harness dirty />);
      const event = fireBeforeUnload();
      expect(event.defaultPrevented).toBe(true);
      expect(event.returnValue).toBe("");
      rerender(<FluentProvider theme={vsbTheme}><FormPanel open={false} title="T" dirty onDismiss={() => {}}>x</FormPanel></FluentProvider>);
      expect(fireBeforeUnload().defaultPrevented).toBe(false);
    });

    it("UT-SETPANEL-009 A screen that also calls useBeforeUnload (Milestones, Contracts) gets ONE listener", () => {
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

    it("UT-SETPANEL-010 E1a actions renders the shared footer; an explicit footer wins", async () => {
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

    it("UT-SETPANEL-011 E1b messages: error first with role alert and title, then notices in order", () => {
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

    it("UT-SETPANEL-012 E1b PanelMessages renders nothing when empty", () => {
      render(<FluentProvider theme={vsbTheme}><div data-testid="host"><PanelMessages error={null} notices={[]} /></div></FluentProvider>);
      expect(screen.getByTestId("host")).toBeEmptyDOMElement();
    });

    it("UT-SETPANEL-013 E1c closePrompt returning null closes at once and passes the reason", async () => {
      const onDismiss = vi.fn();
      render(<Plain dirty closePrompt={() => null} onDismiss={onDismiss} />);
      await userEvent.click(screen.getByRole("button", { name: "Close panel", hidden: true }));
      expect(onDismiss).toHaveBeenCalledWith("dismiss");
      expect(screen.queryByText("Discard changes?")).not.toBeInTheDocument();
    });

    it("UT-SETPANEL-014 E1c different reasons show different texts; ✕ = dismiss, footer Cancel = cancel", async () => {
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

    it("UT-SETPANEL-015 E1c promptRequest opens that reason's prompt once; onPromptCancel fires on Keep editing", async () => {
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

    it("UT-SETPANEL-016 E1c promptRequest waits while the panel is busy", async () => {
      const closePrompt = () => ({ description: "The scope changed." });
      const { rerender } = render(<Plain closePrompt={closePrompt} busy promptRequest="scope" />);
      expect(screen.queryByText("The scope changed.")).not.toBeInTheDocument();
      rerender(<Plain closePrompt={closePrompt} promptRequest="scope" />);
      expect(await screen.findByText("The scope changed.")).toBeInTheDocument();
    });

    it("UT-SETPANEL-017 E1c without closePrompt onDismiss gets no argument (unchanged)", async () => {
      const onDismiss = vi.fn();
      render(<Plain onDismiss={onDismiss} />);
      await userEvent.click(screen.getByRole("button", { name: "Close panel", hidden: true }));
      expect(onDismiss).toHaveBeenCalledWith();
    });

    it("UT-SETPANEL-018 E1d coverLabel shows the blocking cover but ✕ still closes", async () => {
      const onDismiss = vi.fn();
      render(<Plain coverLabel="Loading contract..." onDismiss={onDismiss} />);
      expect(screen.getByRole("dialog", { name: "Edit thing" })).toHaveTextContent("Loading contract...");
      const close = screen.getByRole("button", { name: "Close panel", hidden: true });
      expect(close).not.toBeDisabled();
      await userEvent.click(close);
      expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it("UT-SETPANEL-019 E1e ariaLabel names the drawer; default is the title", () => {
      const { unmount } = render(<Plain />);
      expect(screen.getByRole("dialog", { name: "Edit thing" })).toBeInTheDocument();
      unmount();
      render(<Plain ariaLabel="Edit Milestones for Germany" />);
      expect(screen.getByRole("dialog", { name: "Edit Milestones for Germany" })).toBeInTheDocument();
    });

    it("UT-SETPANEL-020 E1 props keep one beforeunload listener", () => {
      const add = vi.spyOn(window, "addEventListener");
      const { unmount } = render(<Plain dirty closePrompt={() => null} messages={{ error: "x" }} coverLabel="c" />);
      expect(add.mock.calls.filter((c) => c[0] === "beforeunload")).toHaveLength(1);
      unmount();
      add.mockRestore();
    });

    it("UT-SETPANEL-021 E8 PANEL_RADIO_ROW is the opt-in class name", () => {
      expect(PANEL_RADIO_ROW).toBe("canvas-radio-row");
    });
  });

  it("UT-SETPANEL-022 UseFormPanel gives children the guarded close", async () => {
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
