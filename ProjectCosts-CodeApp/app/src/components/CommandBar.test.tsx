// @vitest-environment jsdom
/** CommandBar — existing contract plus the E3 extensions (visible, disabledReason, size, className). */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { FluentProvider } from "@fluentui/react-components";
import { vsbTheme } from "@/theme/fluent";
import { CommandBar, type CommandBarProps } from "./CommandBar";

const mount = (props: Partial<CommandBarProps> = {}) => render(
  <FluentProvider theme={vsbTheme}>
    <CommandBar
      ariaLabel="Account commands" onCommand={vi.fn()}
      commands={[
        { key: "add", label: "Add account", icon: "Add" },
        { key: "reorder", label: "Reorder", icon: "Reorder", enabled: false },
      ]}
      {...props}
    />
  </FluentProvider>,
);

describe("CommandBar", () => {
  it("unchanged: a named toolbar, aria-label = caption, data-testid = command-<key>, click reports the key", () => {
    const onCommand = vi.fn();
    mount({ onCommand });
    expect(screen.getByRole("toolbar", { name: "Account commands" })).toBeInTheDocument();
    const add = screen.getByRole("button", { name: "Add account" });
    expect(add).toHaveAttribute("data-testid", "command-add");
    fireEvent.click(add);
    expect(onCommand).toHaveBeenCalledWith("add");
    expect(screen.getByRole("button", { name: "Reorder" })).toBeDisabled();
  });

  it("E3 visible=false commands are not rendered", () => {
    mount({ commands: [{ key: "a", label: "Shown" }, { key: "b", label: "Hidden", visible: false }] });
    expect(screen.getByRole("button", { name: "Shown" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Hidden" })).not.toBeInTheDocument();
  });

  it("E3 disabledReason on a disabled command: focusable with a description tooltip, no click", async () => {
    const onCommand = vi.fn();
    mount({ onCommand, commands: [{ key: "del", label: "Delete", enabled: false, disabledReason: "A contract is booked" }] });
    const del = screen.getByRole("button", { name: "Delete" });
    expect(del).toHaveAttribute("aria-disabled", "true");
    expect(del).toHaveAttribute("data-testid", "command-del");
    fireEvent.click(del);
    expect(onCommand).not.toHaveBeenCalled();
    del.focus();
    expect(await screen.findByText("A contract is booked")).toBeInTheDocument();
  });

  it("E3 disabledReason is ignored while the command is enabled", () => {
    mount({ commands: [{ key: "x", label: "Edit", disabledReason: "unused" }] });
    expect(screen.getByRole("button", { name: "Edit" })).not.toHaveAttribute("aria-disabled");
  });

  it("E3 size and className pass through", () => {
    const { unmount } = mount();
    const plain = screen.getByRole("toolbar").className;
    unmount();
    mount({ size: "small", className: "extra-class" });
    const bar = screen.getByRole("toolbar");
    expect(bar).toHaveClass("extra-class");
    expect(bar.className).not.toBe(plain);
  });
});
