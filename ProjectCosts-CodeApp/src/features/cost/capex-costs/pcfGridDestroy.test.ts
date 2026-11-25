// @vitest-environment jsdom
/**
 * FE-C1-09 (D162): the contract-name comment dot's tooltip floats on `document.body`, outside the grid. A grid destroyed while
 * a dot has keyboard focus (Tab to the dot, then leave the screen) gets no `blur`, so `destroy()` must take the tooltip down
 * itself, or it stays over the next screen.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { GridRenderer } from "./pcf/ui/GridRenderer";
import { ActionDropdown } from "./pcf/ui/ActionDropdown";

type Internals = { showCommentTooltip(anchor: HTMLElement, text: string): void };

afterEach(() => { document.body.replaceChildren(); });

describe("FE-C1-09 — the floating comment tooltip goes with the grid", () => {
  it("UT-CAPEX-FE-001 destroy() removes a showing name-dot tooltip from document.body", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const grid = new GridRenderer(host as HTMLDivElement, new Set(), new ActionDropdown(vi.fn()), vi.fn());
    const dot = document.createElement("span");
    host.appendChild(dot);
    (grid as unknown as Internals).showCommentTooltip(dot, "Comment: kept");
    expect(document.querySelectorAll(".pcf-comment-tooltip-floating")).toHaveLength(1);

    grid.destroy();
    expect(document.querySelectorAll(".pcf-comment-tooltip-floating")).toHaveLength(0);
  });

  it("UT-CAPEX-FE-002 destroy() with no tooltip showing still works", () => {
    const host = document.createElement("div");
    const grid = new GridRenderer(host as HTMLDivElement, new Set(), new ActionDropdown(vi.fn()), vi.fn());
    expect(() => grid.destroy()).not.toThrow();
  });
});
