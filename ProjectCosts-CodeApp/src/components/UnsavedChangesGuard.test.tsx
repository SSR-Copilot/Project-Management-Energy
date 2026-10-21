// @vitest-environment jsdom
/**
 * UT-LEAVE — the shared "Unsaved data" leave guard (PO X1): it holds a navigation while the
 * screen is dirty, lets it through on Confirm ("Yes"), stays on Cancel, and does nothing while
 * the screen is clean.
 */
import { describe, expect, it } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { FluentProvider } from "@fluentui/react-components";
import { createMemoryRouter, RouterProvider, useNavigate } from "react-router-dom";
import { useState } from "react";
import { vsbTheme } from "@/theme/fluent";
import { UnsavedChangesGuard } from "./UnsavedChangesGuard";
import { isLeaving, type LeaveDialogText } from "./leaveGuard";

const DIALOG: LeaveDialogText = {
  title: "Unsaved data",
  description: "You have unsaved data. Do you really want to leave current form without saving?",
  confirm: "Yes",
  cancel: "Cancel",
};

function Editor({ initiallyDirty }: { initiallyDirty: boolean }) {
  const navigate = useNavigate();
  const [dirty, setDirty] = useState(initiallyDirty);
  return <>
    <h1>Editor</h1>
    {/* control-labels-ignore: test fixture */}
    <button type="button" aria-label="leave" data-testid="leave" onClick={() => navigate("/projects")}>leave</button>
    {/* control-labels-ignore: test fixture */}
    <button type="button" aria-label="save" data-testid="save" onClick={() => setDirty(false)}>save</button>
    <UnsavedChangesGuard when={dirty} dialog={DIALOG} />
  </>;
}

function mount(initiallyDirty: boolean) {
  const router = createMemoryRouter([
    { path: "/project/general", element: <Editor initiallyDirty={initiallyDirty} /> },
    { path: "/projects", element: <h1>Projects</h1> },
  ], { initialEntries: ["/project/general?projectId=1"] });
  render(<FluentProvider theme={vsbTheme}><RouterProvider router={router} /></FluentProvider>);
  return router;
}

describe("UT-LEAVE UnsavedChangesGuard", () => {
  it("UT-LEAVE-001 blocks a navigation while dirty and shows the canvas dialog", async () => {
    const router = mount(true);
    fireEvent.click(screen.getByTestId("leave"));
    expect(await screen.findByText("Unsaved data")).toBeTruthy();
    expect(screen.getByText(DIALOG.description)).toBeTruthy();
    expect(router.state.location.pathname).toBe("/project/general");
  });

  it("UT-LEAVE-002 Confirm (\"Yes\") proceeds with the navigation the user asked for", async () => {
    const router = mount(true);
    fireEvent.click(screen.getByTestId("leave"));
    fireEvent.click(await screen.findByRole("button", { name: "Yes" }));
    expect(await screen.findByRole("heading", { name: "Projects" })).toBeTruthy();
    expect(router.state.location.pathname).toBe("/projects");
  });

  it("UT-LEAVE-003 Cancel stays on the screen, edits kept", async () => {
    const router = mount(true);
    fireEvent.click(screen.getByTestId("leave"));
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("heading", { name: "Editor" })).toBeTruthy();
    expect(router.state.location.pathname).toBe("/project/general");
    expect(screen.queryByText(DIALOG.description)).toBeNull();
  });

  it("UT-LEAVE-004 does nothing while the screen is clean", async () => {
    const router = mount(false);
    fireEvent.click(screen.getByTestId("leave"));
    expect(await screen.findByRole("heading", { name: "Projects" })).toBeTruthy();
    expect(router.state.location.pathname).toBe("/projects");
    expect(screen.queryByText("Unsaved data")).toBeNull();
  });

  it("UT-LEAVE-005 once saved (clean again) the screen can be left without a dialog", async () => {
    const router = mount(true);
    fireEvent.click(screen.getByTestId("save"));
    fireEvent.click(screen.getByTestId("leave"));
    expect(await screen.findByRole("heading", { name: "Projects" })).toBeTruthy();
    expect(router.state.location.pathname).toBe("/projects");
  });

  it("UT-LEAVE-006 DIVERGENCE: closing the tab while dirty asks the browser to confirm; clean does not", () => {
    mount(true);
    const dirtyEvent = new Event("beforeunload", { cancelable: true });
    act(() => { window.dispatchEvent(dirtyEvent); });
    expect(dirtyEvent.defaultPrevented).toBe(true);
    act(() => { fireEvent.click(screen.getByTestId("save")); });
    const cleanEvent = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(cleanEvent);
    expect(cleanEvent.defaultPrevented).toBe(false);
  });

  it("UT-LEAVE-007 only a change of path or query is a leave", () => {
    expect(isLeaving({ pathname: "/a", search: "?x=1" }, { pathname: "/b", search: "?x=1" })).toBe(true);
    expect(isLeaving({ pathname: "/a", search: "?x=1" }, { pathname: "/a", search: "?x=2" })).toBe(true);
    expect(isLeaving({ pathname: "/a", search: "?x=1" }, { pathname: "/a", search: "?x=1" })).toBe(false);
  });
});
