/**
 * DataGrid — the opt-in invariant.
 *
 * `selectionMode`, `rowAccent`, `zebra`, `horizontalScroll`, `sort`/`onSortChange` and
 * `allowClearSort` were added for the portfolio grid. Nineteen other call sites render this
 * component and none of them was edited, so the claim that carried that change is:
 *
 *   **the absence of a new prop must reproduce the previous render.**
 *
 * That claim was previously backed by nothing but `tsc`, which cannot see it. This file is
 * the check. It is deliberately structural — it asserts the things a regression would
 * actually break — rather than a snapshot, which would fail on every Fluent class-name bump.
 *
 * SCOPE LIMIT, stated because it is easy to over-read what passes here. Rows come from
 * `useVirtualizer`, which measures the scroll element; jsdom reports every element as
 * zero-height, so **no row is ever rendered in this file**. Everything below asserts the
 * header, the footer and the sort contract. Row-level behaviour — zebra striping, the per-row
 * radio, the accent bar and its visually-hidden label — is NOT covered by any test, here or
 * elsewhere; it was verified by reading the component. Treat it as unverified.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FluentProvider } from "@fluentui/react-components";
import { vsbLightTheme } from "@/theme/fluentTheme";
import { DataGrid, type Column } from "./DataGrid";

interface Row {
  id: string;
  name: string;
  amount: number;
}

const ROWS: Row[] = [
  { id: "a", name: "Alpha", amount: 3 },
  { id: "b", name: "Bravo", amount: 1 },
  { id: "c", name: "Charlie", amount: 2 },
];

const COLUMNS: Column<Row>[] = [
  { key: "name", header: "Name", width: "minmax(120px, 2fr)", sortable: true, value: (r) => r.name },
  { key: "amount", header: "Amount", width: "100px", numeric: true, sortable: true, value: (r) => r.amount },
];

function renderGrid(props: Partial<React.ComponentProps<typeof DataGrid<Row>>> = {}) {
  return render(
    <FluentProvider theme={vsbLightTheme}>
      <DataGrid rows={ROWS} columns={COLUMNS} rowKey={(r) => r.id} {...props} />
    </FluentProvider>,
  );
}

describe("UT-GRID — the shared grid's defaults are unchanged", () => {
  it("UT-GRID-001 renders one header cell per column and no select track", () => {
    renderGrid();
    // A radio track would make this 3. Every one of the 19 other screens sizes its own
    // `template` string, so an extra track would shift all of their columns.
    expect(screen.getAllByRole("columnheader")).toHaveLength(2);
    expect(screen.queryByRole("radio")).toBeNull();
  });

  it("UT-GRID-002 keeps the header OUTSIDE the scroller", () => {
    const { container } = renderGrid();
    const table = screen.getByRole("table");
    const header = screen.getAllByRole("columnheader")[0].parentElement!;
    const rowgroup = within(table).getByRole("rowgroup");

    // `horizontalScroll` wraps head+body in one `max-content` track inside the scroller.
    // Without it the header must stay a direct sibling of the scroller, or the 19 screens
    // rendering `fr`/`minmax` tracks would size against a different container.
    expect(header.parentElement).toBe(table);
    expect(rowgroup.contains(header)).toBe(false);
    expect(container.querySelectorAll('[role="rowgroup"]')).toHaveLength(1);
  });

  it("UT-GRID-003 sorts internally when no sort prop is supplied", async () => {
    renderGrid();
    await userEvent.click(screen.getByRole("columnheader", { name: /Amount/ }));

    // Uncontrolled: the grid orders `rows` itself. This is what every other screen relies on.
    const header = screen.getByRole("columnheader", { name: /Amount/ });
    expect(header).toHaveAttribute("aria-sort", "ascending");
  });

  it("UT-GRID-004 shows Clear sort once sorted, and clearing restores no sort", async () => {
    renderGrid();
    await userEvent.click(screen.getByRole("columnheader", { name: /Name/ }));

    const clear = screen.getByRole("button", { name: "Clear sort" });
    await userEvent.click(clear);

    expect(screen.getByRole("columnheader", { name: /Name/ })).toHaveAttribute("aria-sort", "none");
  });

  it("UT-GRID-005 does NOT sort internally once sort is controlled", async () => {
    const onSortChange = vi.fn();
    // `sort={null}` is a legal controlled value — the grid must test for `undefined`, not
    // truthiness, or it would double-sort the server-ordered page.
    renderGrid({ sort: null, onSortChange });

    await userEvent.click(screen.getByRole("columnheader", { name: /Amount/ }));

    expect(onSortChange).toHaveBeenCalledWith({ key: "amount", dir: "asc" });
    // The grid did not adopt the sort itself: the owner decides.
    expect(screen.getByRole("columnheader", { name: /Amount/ })).toHaveAttribute("aria-sort", "none");
  });

  it("UT-GRID-006 reflects a controlled sort in aria-sort without reordering", () => {
    renderGrid({ sort: { key: "name", dir: "desc" }, onSortChange: vi.fn() });
    expect(screen.getByRole("columnheader", { name: /Name/ })).toHaveAttribute("aria-sort", "descending");
  });

  it("UT-GRID-007 hides Clear sort when allowClearSort is off", async () => {
    renderGrid({ allowClearSort: false });
    await userEvent.click(screen.getByRole("columnheader", { name: /Name/ }));
    expect(screen.queryByRole("button", { name: "Clear sort" })).toBeNull();
  });

  it("UT-GRID-008 adds a header cell for the select track under single select", () => {
    renderGrid({ selectionMode: "single", height: 400 });
    // Three header cells: the two columns plus the radio track's own. The per-row radio
    // itself is not assertable here — see the note on virtualisation in the file header.
    expect(screen.getAllByRole("columnheader")).toHaveLength(3);
  });

  it("UT-GRID-009 renders the default row-count footer when no footer is supplied", () => {
    renderGrid();
    expect(screen.getByText("3 rows")).toBeInTheDocument();
  });

  it("UT-GRID-010 prefers a supplied footer over the row count", () => {
    renderGrid({ footer: <span>Total Rows: 1127</span> });
    expect(screen.getByText("Total Rows: 1127")).toBeInTheDocument();
    expect(screen.queryByText("3 rows")).toBeNull();
  });

  it("UT-GRID-011 shows the empty message, and no footer count, with no rows", () => {
    renderGrid({ rows: [], emptyMessage: "Nothing here." });
    expect(screen.getByText("Nothing here.")).toBeInTheDocument();
    expect(screen.queryByText("0 rows")).toBeNull();
  });
});
