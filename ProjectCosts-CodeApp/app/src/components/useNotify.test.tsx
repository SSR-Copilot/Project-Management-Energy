// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { useEffect } from "react";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FluentProvider } from "@fluentui/react-components";
import { vsbTheme } from "@/theme/fluent";
import { AppToaster } from "./AppToaster";
import { NOTIFY_BEHAVIOUR, useNotify, type Notify } from "./useNotify";

const probe: { current?: Notify } = {};
const notify: Notify = {
  success: (...a) => probe.current?.success(...a),
  info: (...a) => probe.current?.info(...a),
  warning: (...a) => probe.current?.warning(...a),
  error: (...a) => probe.current?.error(...a),
  dismissAll: () => probe.current?.dismissAll(),
};
function Probe() {
  const n = useNotify();
  useEffect(() => { probe.current = n; }, [n]);
  return null;
}

function mount() {
  return render(
    <FluentProvider theme={vsbTheme}>
      <AppToaster />
      <Probe />
    </FluentProvider>,
  );
}

describe("useNotify + AppToaster", () => {
  it("UT-NTF-001 consistent durations and politeness per intent; errors stay until dismissed", () => {
    expect(NOTIFY_BEHAVIOUR).toEqual({
      success: { timeout: 5000, politeness: "polite" },
      info: { timeout: 5000, politeness: "polite" },
      warning: { timeout: 10000, politeness: "assertive" },
      error: { timeout: -1, politeness: "assertive" },
    });
  });

  it("UT-NTF-002 shows a success toast with its detail, and Dismiss removes it", async () => {
    const user = userEvent.setup();
    mount();
    act(() => notify.success("Contract saved", { detail: "Germany / Wind" }));
    expect(await screen.findByText("Contract saved")).toBeInTheDocument();
    expect(screen.getByText("Germany / Wind")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Dismiss: Contract saved" }));
    await vi.waitFor(() => expect(screen.queryByText("Contract saved")).toBeNull());
  });

  it("UT-NTF-003 a warning can carry one action", async () => {
    const user = userEvent.setup();
    const onReorder = vi.fn();
    mount();
    act(() => notify.warning("Some orders could not be renumbered", { action: { label: "Reorder", onClick: onReorder } }));
    await user.click(await screen.findByRole("button", { name: "Reorder" }));
    expect(onReorder).toHaveBeenCalledTimes(1);
  });

  it("UT-NTF-004 an error toast renders and dismissAll clears it", async () => {
    mount();
    act(() => notify.error("The save failed"));
    expect(await screen.findByText("The save failed")).toBeInTheDocument();
    act(() => notify.dismissAll());
    await vi.waitFor(() => expect(screen.queryByText("The save failed")).toBeNull());
  });
});
