// @vitest-environment jsdom
/** C4 DisabledReason + C5 RowActions. */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button, FluentProvider } from "@fluentui/react-components";
import { DeleteRegular, EditRegular } from "@fluentui/react-icons";
import { vsbTheme } from "@/theme/fluent";
import { DisabledReason } from "./DisabledReason";
import { RowActions, type RowAction, type RowActionsProps } from "./RowActions";

const wrap = (node: React.ReactNode) => render(<FluentProvider theme={vsbTheme}>{node}</FluentProvider>);

describe("DisabledReason (C4)", () => {
  it("without a reason the child is untouched (disabled stays disabled, no tooltip)", () => {
    wrap(<DisabledReason reason={null}><Button disabled aria-label="Add">Add</Button></DisabledReason>);
    const b = screen.getByRole("button", { name: "Add" });
    expect(b).toBeDisabled();
    expect(b).not.toHaveAttribute("aria-describedby");
  });

  it("with a reason: aria-disabled, focusable, tooltip on focus, described by it", async () => {
    const onClick = vi.fn();
    wrap(<DisabledReason reason="The limit of 10 is reached"><Button disabled onClick={onClick} aria-label="Add">Add</Button></DisabledReason>);
    const b = screen.getByRole("button", { name: "Add" });
    expect(b).not.toBeDisabled();
    expect(b).toHaveAttribute("aria-disabled", "true");
    await userEvent.tab();
    expect(b).toHaveFocus();
    expect(await screen.findByText("The limit of 10 is reached")).toBeInTheDocument();
    expect(b.getAttribute("aria-describedby")).toBeTruthy();
    fireEvent.click(b);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("Wave C enabledTooltip: without a reason the enabled child keeps its description tooltip; a reason wins", async () => {
    const onClick = vi.fn();
    const { unmount } = wrap(
      <DisabledReason reason={null} enabledTooltip="Add a period after Period 3">
        <Button onClick={onClick} aria-label="Add Period">Add Period</Button>
      </DisabledReason>,
    );
    const b = screen.getByRole("button", { name: "Add Period" });
    expect(b).not.toHaveAttribute("aria-disabled");
    b.focus();
    expect(await screen.findByText("Add a period after Period 3")).toBeInTheDocument();
    expect(b.getAttribute("aria-describedby")).toBeTruthy();
    fireEvent.click(b);
    expect(onClick).toHaveBeenCalledTimes(1);
    unmount();

    wrap(
      <DisabledReason reason="Maximum of 10 periods" enabledTooltip="Add a period after Period 3">
        <Button disabled aria-label="Add Period">Add Period</Button>
      </DisabledReason>,
    );
    const blocked = screen.getByRole("button", { name: "Add Period" });
    expect(blocked).toHaveAttribute("aria-disabled", "true");
    blocked.focus();
    expect(await screen.findByText("Maximum of 10 periods")).toBeInTheDocument();
    expect(screen.queryByText("Add a period after Period 3")).not.toBeInTheDocument();
  });
});

const actions = (over: Partial<RowAction>[] = []): RowAction[] => [
  { key: "edit", icon: <EditRegular />, label: "Edit Row 1", onClick: vi.fn(), testId: "edit", ...over[0] },
  { key: "delete", icon: <DeleteRegular />, label: "Delete Row 1", onClick: vi.fn(), testId: "delete", ...over[1] },
];

const mount = (props: Partial<RowActionsProps> & { actions?: RowAction[] } = {}) =>
  wrap(<RowActions actions={props.actions ?? actions()} {...props} />);

describe("RowActions (C5)", () => {
  it("renders one aria-labelled button per visible action; click calls the handler", () => {
    const list = actions([{}, { visible: false }]);
    mount({ actions: list });
    expect(screen.queryByRole("button", { name: "Delete Row 1" })).not.toBeInTheDocument();
    const edit = screen.getByRole("button", { name: "Edit Row 1" });
    expect(edit).toHaveAttribute("aria-label", "Edit Row 1");
    fireEvent.click(edit);
    expect(list[0]!.onClick).toHaveBeenCalledTimes(1);
  });

  it("a disabled reason gives the focusable tooltip (C4)", async () => {
    mount({ actions: actions([{}, { disabledReason: "A contract is booked on it" }]) });
    const del = screen.getByRole("button", { name: "Delete Row 1" });
    expect(del).toHaveAttribute("aria-disabled", "true");
    del.focus();
    expect(await screen.findByText("A contract is booked on it")).toBeInTheDocument();
  });

  it("plain disabled stays natively disabled", () => {
    mount({ actions: actions([{ disabled: true }]) });
    expect(screen.getByRole("button", { name: "Edit Row 1" })).toBeDisabled();
  });

  it("each tone applies its own icon colour class; locked drops it unless toneWhenLocked", () => {
    const iconClass = (id: string) => screen.getByTestId(id).querySelector(".fui-Button__icon")!.className;
    const { unmount } = mount();
    const none = iconClass("edit");
    unmount();
    const seen = new Set([none]);
    for (const tone of ["brand", "accent", "link"] as const) {
      const r = mount({ tone });
      seen.add(iconClass("edit"));
      r.unmount();
    }
    expect(seen.size).toBe(4);

    const r = mount({ tone: "brand", actions: actions([{}, { disabledReason: "Locked" }]) });
    expect(iconClass("delete")).toBe(none);
    r.unmount();
    mount({ tone: "brand", toneWhenLocked: true, actions: actions([{}, { disabledReason: "Locked" }]) });
    expect(iconClass("delete")).not.toBe(none);
  });

  it("tooltip='always' wraps enabled actions in a label tooltip with tooltipText; aria-label unchanged", async () => {
    mount({ tooltip: "always", actions: actions([{ tooltipText: "Edit" }]) });
    const edit = screen.getByRole("button", { name: "Edit Row 1" });
    await userEvent.hover(edit);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Edit");
    expect(edit).toHaveAttribute("aria-label", "Edit Row 1");
  });

  it("Wave C gap: 0 (default), 2 and 4 each give their own row class", () => {
    const rowClass = (gap?: 0 | 2 | 4) => {
      const r = mount(gap === undefined ? {} : { gap });
      const cls = screen.getByTestId("edit").parentElement!.className;
      r.unmount();
      return cls;
    };
    const none = rowClass();
    expect(rowClass(0)).toBe(none);
    expect(new Set([none, rowClass(2), rowClass(4)]).size).toBe(3);
  });

  it("describedBy and title pass through", () => {
    mount({ actions: actions([{ describedBy: "name-1", title: "Edit" }]) });
    const edit = screen.getByTestId("edit");
    expect(edit).toHaveAttribute("aria-describedby", "name-1");
    expect(edit).toHaveAttribute("title", "Edit");
  });
});
