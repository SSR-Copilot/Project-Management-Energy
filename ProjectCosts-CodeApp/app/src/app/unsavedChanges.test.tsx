// @vitest-environment jsdom
/**
 * M7 — beforeunload, the discard guard, and the in-app navigation guard (settings rail,
 * header way out) through the real `AppShell`.
 */
import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { Button, FluentProvider } from "@fluentui/react-components";
import { vsbTheme } from "@/theme/fluent";
import { AppShell } from "@/components/AppShell";
import { useBeforeUnload, useDiscardGuard, useGuardedNavigate, useUnsavedChanges } from "./unsavedChanges";

const fireBeforeUnload = () => {
  const event = new Event("beforeunload", { cancelable: true }) as BeforeUnloadEvent;
  // jsdom's legacy `returnValue` is a boolean; make it a plain slot so the handler's "" is visible.
  Object.defineProperty(event, "returnValue", { value: undefined, writable: true });
  window.dispatchEvent(event);
  return event;
};

describe("useBeforeUnload", () => {
  it("prompts (preventDefault + returnValue) only while active", () => {
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

describe("useDiscardGuard", () => {
  function Panel({ dirty, onDiscard, disabled }: { dirty: boolean; onDiscard: () => void; disabled?: boolean }) {
    const guard = useDiscardGuard({ dirty, onDiscard, ...(disabled ? { disabled } : {}), text: { destructive: true } });
    return <FluentProvider theme={vsbTheme}><Button onClick={guard.requestClose}>Cancel</Button>{guard.dialog}</FluentProvider>;
  }

  it("closes at once when clean", async () => {
    const onDiscard = vi.fn();
    render(<Panel dirty={false} onDiscard={onDiscard} />);
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });

  it("asks when dirty; Keep editing / Discard", async () => {
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

    it("prompt replaces the dirty test; null closes at once with the reason", async () => {
      const onDiscard = vi.fn();
      render(<Prompted prompt={() => null} onDiscard={onDiscard} />);
      await userEvent.click(screen.getByRole("button", { name: "Scope" }));
      expect(onDiscard).toHaveBeenCalledWith("scope");
    });

    it("a text asks first even when not dirty; Discard passes the reason, Keep editing calls onPromptCancel", async () => {
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

  it("does nothing while disabled (save in flight)", async () => {
    const onDiscard = vi.fn();
    render(<Panel dirty onDiscard={onDiscard} disabled />);
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onDiscard).not.toHaveBeenCalled();
    expect(screen.queryByText("Discard changes?")).not.toBeInTheDocument();
  });
});

describe("navigation guard in AppShell", () => {
  function Draft() {
    const [dirty, setDirty] = useState(false);
    useUnsavedChanges(dirty);
    const go = useGuardedNavigate();
    return (
      <>
        <Button onClick={() => setDirty(true)}>Type</Button>
        <Button onClick={() => go("/settings/milestones")}>Programmatic</Button>
      </>
    );
  }
  function Where() { return <span data-testid="where">{useLocation().pathname}</span>; }

  const mount = (onHome = vi.fn()) => render(
    <FluentProvider theme={vsbTheme}>
      <MemoryRouter initialEntries={["/settings/checklists"]}>
        <Routes>
          <Route path="*" element={(
            <AppShell rail="settings" onHome={onHome} hideApprovalState pageTitle="Checklist settings" hasError={false} onReportProblem={() => {}}>
              <Draft /><Where />
            </AppShell>
          )} />
        </Routes>
      </MemoryRouter>
    </FluentProvider>,
  );

  it("a clean screen navigates from the rail at once", async () => {
    mount();
    await userEvent.click(screen.getByRole("link", { name: "Milestones" }));
    expect(screen.getByTestId("where").textContent).toBe("/settings/milestones");
  });

  it("a dirty screen asks before the rail navigates; Stay keeps it, Leave goes", async () => {
    mount();
    await userEvent.click(screen.getByRole("button", { name: "Type" }));
    await userEvent.click(screen.getByRole("link", { name: "Milestones" }));
    expect(screen.getByText("Leave this page?")).toBeInTheDocument();
    expect(screen.getByTestId("where").textContent).toBe("/settings/checklists");
    await userEvent.click(screen.getByRole("button", { name: "Stay", hidden: true }));
    expect(screen.getByTestId("where").textContent).toBe("/settings/checklists");
    await userEvent.click(screen.getByRole("link", { name: "Milestones" }));
    await userEvent.click(screen.getByRole("button", { name: "Leave", hidden: true }));
    expect(screen.getByTestId("where").textContent).toBe("/settings/milestones");
  });

  it("guards the header's way out and programmatic navigation too", async () => {
    const onHome = vi.fn();
    mount(onHome);
    await userEvent.click(screen.getByRole("button", { name: "Type" }));
    await userEvent.click(screen.getAllByRole("button", { name: "Back to projects" })[0]!);
    expect(onHome).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Leave", hidden: true }));
    expect(onHome).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole("button", { name: "Programmatic" }));
    expect(screen.getByText("Leave this page?")).toBeInTheDocument();
  });

  it("dirty registers beforeunload as well", async () => {
    mount();
    expect(fireBeforeUnload().defaultPrevented).toBe(false);
    await userEvent.click(screen.getByRole("button", { name: "Type" }));
    expect(fireBeforeUnload().defaultPrevented).toBe(true);
  });
});
