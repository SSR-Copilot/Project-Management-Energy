// @vitest-environment jsdom
/** C12 — the shared reorder side panel. */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FluentProvider } from "@fluentui/react-components";
import { vsbTheme } from "@/theme/fluent";
import { ReorderPanel, type ReorderPanelProps } from "./ReorderPanel";

interface Item { id: string; name: string }
const ITEMS: Item[] = [{ id: "a", name: "Alpha" }, { id: "b", name: "Beta" }, { id: "c", name: "Gamma" }];

const mount = (props: Partial<ReorderPanelProps<Item>> = {}) => render(
  <FluentProvider theme={vsbTheme}>
    <ReorderPanel<Item>
      open title="Reorder checklist" items={ITEMS} getId={(i) => i.id} getLabel={(i) => i.name}
      listAriaLabel="Checklist order" hint="Use the arrows." saving={false}
      onSave={vi.fn()} onCancel={vi.fn()} {...props}
    />
  </FluentProvider>,
);

const button = (name: string) => screen.getByRole("button", { name, hidden: true });

describe("ReorderPanel (C12)", () => {
  it("clean: Save disabled by default (canSave = changed), Cancel closes at once", async () => {
    const onCancel = vi.fn();
    mount({ onCancel });
    expect(button("Save")).toBeDisabled();
    await userEvent.click(button("Cancel"));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("a move marks it dirty: Save enabled, Cancel prompts", async () => {
    const onCancel = vi.fn();
    mount({ onCancel, listProps: { buttonLabels: "inline" } });
    await userEvent.click(button("Move Beta up"));
    expect(button("Save")).not.toBeDisabled();
    await userEvent.click(button("Cancel"));
    expect(screen.getByText("Discard changes?")).toBeInTheDocument();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("Save receives the new order; onOrderChange follows each move", async () => {
    const onSave = vi.fn();
    const onOrderChange = vi.fn();
    mount({ onSave, onOrderChange, listProps: { buttonLabels: "inline" } });
    await userEvent.click(button("Move Gamma up"));
    expect(onOrderChange).toHaveBeenLastCalledWith([ITEMS[0], ITEMS[2], ITEMS[1]]);
    await userEvent.click(button("Save"));
    expect(onSave).toHaveBeenCalledWith([ITEMS[0], ITEMS[2], ITEMS[1]]);
  });

  it("canSave gate: CA always on; CL changed && !stale", async () => {
    const { unmount } = mount({ canSave: () => true });
    expect(button("Save")).not.toBeDisabled();
    unmount();
    mount({ canSave: (c) => c && false, warning: "The list changed. Reopen it.", listProps: { buttonLabels: "inline" } });
    await userEvent.click(button("Move Beta up"));
    expect(button("Save")).toBeDisabled();
    expect(screen.getByText("The list changed. Reopen it.")).toBeInTheDocument();
  });

  it("listProps pass through (showPosition, draggable, itemTestId); error bar is an alert", () => {
    mount({ error: "Saving the order failed", listProps: { showPosition: true, draggable: true, itemTestId: (i) => `row-${i.id}` } });
    expect(screen.getByRole("alert", { hidden: true })).toHaveTextContent("Saving the order failed");
    expect(screen.getByTestId("row-a")).toHaveAttribute("draggable", "true");
    expect(screen.getByTestId("row-a")).toHaveTextContent("1.");
    expect(screen.getByRole("list", { name: "Checklist order", hidden: true })).toBeInTheDocument();
  });

  it("Wave C footerGap: default keeps the 10 px footer; 20 adds the CAPEX Cancel margin (CAX:2302)", () => {
    const { unmount } = mount();
    const plain = button("Cancel").className;
    unmount();
    const r10 = mount({ footerGap: 10 });
    expect(button("Cancel").className).toBe(plain);
    r10.unmount();
    mount({ footerGap: 20 });
    expect(button("Cancel").className).not.toBe(plain);
    expect(button("Cancel").parentElement).toHaveClass("canvas-panel-footer");
  });

  it("saving: both buttons disabled, savingLabel shown", () => {
    mount({ saving: true, savingLabel: "Saving…" });
    expect(button("Save")).toHaveTextContent("Saving…");
    expect(button("Save")).toBeDisabled();
    expect(button("Cancel")).toBeDisabled();
  });
});
