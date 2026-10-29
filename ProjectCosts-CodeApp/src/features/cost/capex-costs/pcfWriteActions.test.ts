// @vitest-environment jsdom
/**
 * CA-16 — the vendored PCF grid greys its write menu items while a write runs.
 *
 * The screen ignores Add, Add Standard Contract, Edit, Comments, Delete and Set as paid/unpaid
 * while `writeCommandsDisabled` holds (`gridActionAllowed`, D58). Before CA-16 the DOM menus still
 * looked enabled, so a click silently did nothing. `PcfGrid` now passes the flag in as the
 * `WriteActionsDisabled` parameter, and the renderer shows those items greyed and disabled.
 *
 * The label gate does not scan this DOM-API file, so the captions are pinned here too: they must
 * not move (Tosca reads them; `09-tosca-automation-conventions.md`).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { GridRenderer } from "./pcf/ui/GridRenderer";
import { ActionDropdown } from "./pcf/ui/ActionDropdown";

/** The renderer's internals reached here; `GridRenderer.d.ts` types only the React boundary. */
type Internals = {
  showAddDropdown(e: { currentTarget: HTMLElement }, sub: unknown): void;
  showMonthActionDropdown(
    e: { currentTarget: HTMLElement }, contract: unknown, monthIndex: number, startYear: number,
    isPaid: boolean, td: HTMLElement,
  ): void;
};

const emptyDataset = () => ({ loading: false, columns: [], sortedRecordIds: [], records: {} });

function setup() {
  const onAction = vi.fn();
  const host = document.createElement("div");
  document.body.appendChild(host);
  const menu = new ActionDropdown(onAction);
  const grid = new GridRenderer(host as HTMLDivElement, new Set(), menu, onAction);
  const render = (disabled: boolean | undefined) => grid.render({
    mode: { allocatedWidth: 800, allocatedHeight: 300 },
    parameters: {
      DevexCapexCostSummary: emptyDataset(), StandardContractOptions: emptyDataset(),
      StartYear: { raw: 2026 }, ShowEmptyAccounts: { raw: true }, ShowPlannedCost: { raw: false },
      CostPaidByFilter: { raw: "Show All Cost" },
      ...(disabled === undefined ? {} : { WriteActionsDisabled: { raw: disabled } }),
    },
  });
  const anchor = document.createElement("button");
  document.body.appendChild(anchor);
  const internals = grid as unknown as Internals;
  const openAdd = () => internals.showAddDropdown({ currentTarget: anchor }, {
    id: "sub-1",
    standardContractOptions: [{ id: "std-1", name: "Standard A" }, { id: "std-2", name: "Standard B" }],
  });
  const openMonth = () => internals.showMonthActionDropdown(
    { currentTarget: anchor }, { id: "c-1", distributionType: "Individual" }, 2, 2026, false,
    document.createElement("td"),
  );
  const cleanup = () => { grid.destroy(); menu.destroy(); document.body.replaceChildren(); };
  return { onAction, render, openAdd, openMonth, cleanup };
}

const addItems = () => [...document.querySelectorAll<HTMLButtonElement>(".pcf-add-dropdown button")];
const monthItems = () => [...document.querySelectorAll<HTMLButtonElement>(".pcf-month-dropdown button")];
const rowMenuItems = () => [...document.querySelectorAll<HTMLButtonElement>(".pcf-dropdown > button")];
const text = (b: HTMLElement) => (b.textContent ?? "").replace(/\s+/g, " ").trim();

let cleanup: () => void = () => undefined;
afterEach(() => cleanup());

describe("PCF grid write menu items (CA-16)", () => {
  it("UT-CAPEXPCF-WRITE-001 while a write runs the Add menu's items are greyed, disabled and inert", () => {
    const g = setup(); cleanup = g.cleanup;
    g.render(true);
    g.openAdd();
    const items = addItems();
    expect(items.map(text)).toEqual(["Add New Cost", "Add Standard Contract", "Standard A", "Standard B"]);
    for (const b of items) {
      expect(b.disabled).toBe(true);
      expect(b.getAttribute("aria-disabled")).toBe("true");
    }
    for (const b of items) b.click();
    expect(g.onAction).not.toHaveBeenCalled();
  });

  it("UT-CAPEXPCF-WRITE-002 with no write running they are enabled and act as before", () => {
    const g = setup(); cleanup = g.cleanup;
    g.render(false);
    g.openAdd();
    const items = addItems();
    for (const b of items) {
      expect(b.disabled).toBe(false);
      expect(b.hasAttribute("aria-disabled")).toBe(false);
    }
    items[0]!.click();
    expect(g.onAction).toHaveBeenCalledWith("Add", "sub-1");
  });

  it("UT-CAPEXPCF-WRITE-003 the row menu's Edit / Comments / Delete follow every render", () => {
    const g = setup(); cleanup = g.cleanup;
    g.render(true);
    const items = rowMenuItems();
    expect(items.map(text)).toEqual(["Edit", "Comments", "Delete"]);
    for (const b of items) {
      expect(b.disabled).toBe(true);
      expect(b.getAttribute("aria-disabled")).toBe("true");
      expect(b.classList.contains("pcf-dropdown-item-disabled")).toBe(true);
      b.click();
    }
    expect(g.onAction).not.toHaveBeenCalled();

    g.render(false);
    for (const b of items) {
      expect(b.disabled).toBe(false);
      expect(b.hasAttribute("aria-disabled")).toBe(false);
      expect(b.classList.contains("pcf-dropdown-item-disabled")).toBe(false);
    }
    items[2]!.click();
    expect(g.onAction).toHaveBeenCalledWith("Delete", "");
  });

  it("UT-CAPEXPCF-WRITE-004 the month menu's Set as paid and Comments are greyed while a write runs", () => {
    const g = setup(); cleanup = g.cleanup;
    g.render(true);
    g.openMonth();
    const items = monthItems();
    expect(items.map(text)).toEqual(["Set as paid", "Comments"]);
    for (const b of items) {
      expect(b.disabled).toBe(true);
      expect(b.getAttribute("aria-disabled")).toBe("true");
      expect(b.classList.contains("pcf-dropdown-item-disabled")).toBe(true);
      b.click();
    }
    expect(g.onAction).not.toHaveBeenCalled();

    g.render(false);
    g.openMonth();
    const live = monthItems();
    for (const b of live) expect(b.disabled).toBe(false);
    live[0]!.click();
    expect(g.onAction).toHaveBeenCalledWith("SetCostPaidUnpaid", "c-1", "", { year: 2026, month: 3, paid: true });
  });

  it("UT-CAPEXPCF-WRITE-005 a render without the parameter (the vendor shape) leaves everything enabled", () => {
    const g = setup(); cleanup = g.cleanup;
    g.render(undefined);
    g.openAdd();
    expect(addItems().every((b) => !b.disabled)).toBe(true);
    expect(rowMenuItems().every((b) => !b.disabled)).toBe(true);
  });
});
