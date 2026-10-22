// @vitest-environment jsdom
/**
 * Keyboard reorder, focus retention and announcements, in both screens' configurations.
 */
import { describe, expect, it } from "vitest";
import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FluentProvider } from "@fluentui/react-components";
import { vsbTheme } from "@/theme/fluent";
import { moveItem } from "@/domain/reorder";
import { ReorderItems, type ReorderItemsProps } from "./ReorderItems";

interface Row { id: string; name: string }
const ROWS: Row[] = [{ id: "a", name: "Alpha" }, { id: "b", name: "Bravo" }, { id: "c", name: "Charlie" }];

function Harness(props: Partial<ReorderItemsProps<Row>>) {
  const [items, setItems] = useState(ROWS);
  return (
    <FluentProvider theme={vsbTheme}>
      <ReorderItems
        items={items} getId={(r) => r.id} getLabel={(r) => r.name} ariaLabel="Checklist order"
        onMove={(from, to) => setItems((list) => moveItem(list, from, to))}
        itemTestId={(r) => `reorder-item-${r.id}`}
        {...props}
      />
      <output data-testid="order">{items.map((r) => r.id).join(",")}</output>
    </FluentProvider>
  );
}

const order = () => screen.getByTestId("order").textContent;
const row = (id: string) => screen.getByTestId(`reorder-item-${id}`);

describe("ReorderItems — Check List Settings configuration", () => {
  it("UT-REORDITEMS-001 Move up / Move down described by the name, positions shown, moves announced with a period", async () => {
    render(<Harness showPosition />);
    expect(within(row("a")).getByText("1.")).toBeInTheDocument();
    const down = within(row("a")).getByRole("button", { name: "Move down" });
    expect(down).toHaveAccessibleDescription("Alpha");
    expect(within(row("a")).getByRole("button", { name: "Move up" })).toBeDisabled();
    await userEvent.click(down);
    expect(order()).toBe("b,a,c");
    expect(screen.getByTestId("reorder-announcement")).toHaveTextContent("Alpha moved to position 2 of 3.");
  });

  it("UT-REORDITEMS-002 Focus follows the moved item, and switches arrow at the edge", async () => {
    render(<Harness />);
    await userEvent.click(within(row("b")).getByRole("button", { name: "Move down" }));
    expect(order()).toBe("a,c,b");
    // b is now last: its Move down is disabled, so focus lands on its Move up.
    expect(within(row("b")).getByRole("button", { name: "Move up" })).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    expect(order()).toBe("a,b,c");
    expect(within(row("b")).getByRole("button", { name: "Move up" })).toHaveFocus();
  });

  it("UT-REORDITEMS-003 Disabled while saving; empty text", () => {
    const { unmount } = render(<Harness disabled />);
    expect(screen.getAllByRole("button").every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
    unmount();
    render(<Harness items={[]} emptyText="There are no tasks to reorder in this cluster." />);
    expect(screen.getByText("There are no tasks to reorder in this cluster.")).toBeInTheDocument();
  });
});

describe("ReorderItems — CAPEX configuration", () => {
  it("UT-REORDITEMS-004 Inline labels, no period, drag-and-drop reorders", async () => {
    render(<Harness buttonLabels="inline" announcePeriod={false} draggable />);
    await userEvent.click(screen.getByRole("button", { name: "Move Charlie up" }));
    expect(order()).toBe("a,c,b");
    expect(screen.getByTestId("reorder-announcement").textContent).toBe("Charlie moved to position 2 of 3");
    expect(screen.getByRole("button", { name: "Move Charlie up" })).toHaveFocus();

    const dataTransfer = { effectAllowed: "" };
    fireEvent.dragStart(row("a"), { dataTransfer });
    fireEvent.dragOver(row("b"), { dataTransfer });
    fireEvent.drop(row("b"), { dataTransfer });
    expect(order()).toBe("c,b,a");
  });
});
