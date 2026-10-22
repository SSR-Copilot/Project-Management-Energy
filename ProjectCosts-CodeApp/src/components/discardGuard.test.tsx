// @vitest-environment jsdom
/**
 * Beforeunload and the panel discard guard.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button, FluentProvider } from "@fluentui/react-components";
import { vsbTheme } from "@/theme/fluent";
import { useBeforeUnload, useDiscardGuard } from "./discardGuard";

const fireBeforeUnload = () => {
  const event = new Event("beforeunload", { cancelable: true }) as BeforeUnloadEvent;
  // jsdom's legacy `returnValue` is a boolean; make it a plain slot so the handler's "" is visible.
  Object.defineProperty(event, "returnValue", { value: undefined, writable: true });
  window.dispatchEvent(event);
  return event;
};

describe("UseBeforeUnload", () => {
  it("UT-UNSAVED-001 Prompts (preventDefault + returnValue) only while active", () => {
    function Probe({ active }: { active: boolean }) { useBeforeUnload(active); return null; }
    const { rerender, unmount } = render(<Probe active={false} />);
    expect(fireBeforeUnload().defaultPrevented).toBe(false);
    rerender(<Probe active />);
    const event = fireBeforeUnload();
    expect(event.defaultPrevented).toBe(true);
    expect(event.returnValue).toBe("");
    unmount();
    expect(fireBeforeUnload().defaultPrevented).toBe(false);
  });
});

describe("UseDiscardGuard", () => {
  function Panel({ dirty, onDiscard, disabled }: { dirty: boolean; onDiscard: () => void; disabled?: boolean }) {
    const guard = useDiscardGuard({ dirty, onDiscard, ...(disabled ? { disabled } : {}), text: { destructive: true } });
    return <FluentProvider theme={vsbTheme}><Button onClick={guard.requestClose}>Cancel</Button>{guard.dialog}</FluentProvider>;
  }

  it("UT-UNSAVED-002 Closes at once when clean", async () => {
    const onDiscard = vi.fn();
    render(<Panel dirty={false} onDiscard={onDiscard} />);
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });

  it("UT-UNSAVED-003 Asks when dirty; Keep editing / Discard", async () => {
    const onDiscard = vi.fn();
    render(<Panel dirty onDiscard={onDiscard} />);
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByText("You have unsaved changes. Do you want to discard them?")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Keep editing", hidden: true }));
    expect(onDiscard).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await userEvent.click(screen.getByRole("button", { name: "Discard", hidden: true }));
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });

  describe("E1c prompt (opt-in three-way close)", () => {
    function Prompted({ prompt, onDiscard, onPromptCancel }: {
      prompt: (r: string) => { title?: string } | null; onDiscard: (r: string) => void; onPromptCancel?: (r: string) => void;
    }) {
      const guard = useDiscardGuard({ dirty: false, onDiscard, prompt, ...(onPromptCancel ? { onPromptCancel } : {}) });
      return (
        <FluentProvider theme={vsbTheme}>
          <Button onClick={() => guard.requestClose("scope")}>Scope</Button>
          <Button onClick={guard.requestClose}>Plain</Button>
          {guard.dialog}
        </FluentProvider>
      );
    }

    it("UT-UNSAVED-004 Prompt replaces the dirty test; null closes at once with the reason", async () => {
      const onDiscard = vi.fn();
      render(<Prompted prompt={() => null} onDiscard={onDiscard} />);
      await userEvent.click(screen.getByRole("button", { name: "Scope" }));
      expect(onDiscard).toHaveBeenCalledWith("scope");
    });

    it("UT-UNSAVED-005 A text asks first even when not dirty; Discard passes the reason, Keep editing calls onPromptCancel", async () => {
      const onDiscard = vi.fn();
      const onPromptCancel = vi.fn();
      render(<Prompted prompt={(r) => ({ title: `Close for ${r}?` })} onDiscard={onDiscard} onPromptCancel={onPromptCancel} />);
      await userEvent.click(screen.getByRole("button", { name: "Scope" }));
      expect(screen.getByText("Close for scope?")).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Keep editing", hidden: true }));
      expect(onPromptCancel).toHaveBeenCalledWith("scope");
      expect(onDiscard).not.toHaveBeenCalled();
      // A click event wired straight to onClick counts as "cancel".
      await userEvent.click(screen.getByRole("button", { name: "Plain", hidden: true }));
      expect(screen.getByText("Close for cancel?")).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Discard", hidden: true }));
      expect(onDiscard).toHaveBeenCalledWith("cancel");
    });
  });

  it("UT-UNSAVED-006 Does nothing while disabled (save in flight)", async () => {
    const onDiscard = vi.fn();
    render(<Panel dirty onDiscard={onDiscard} disabled />);
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onDiscard).not.toHaveBeenCalled();
    expect(screen.queryByText("Discard changes?")).not.toBeInTheDocument();
  });
});
