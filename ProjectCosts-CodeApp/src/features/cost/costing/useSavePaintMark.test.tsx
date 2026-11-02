// @vitest-environment jsdom
/**
 * UT-ACPERF-050…052: the DEVEX/CAPEX paint mark under Add Cost from Table's right panel (D62).
 * The CAPEX screen can stay mounted while the panel closes, so the mark must fire on the
 * navigation itself, not only when the screen mounts or `gridShown` flips.
 */
import { act, render } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { addCostSaveTimeline } from "./saveTimeline";
import { useSavePaintMark } from "./useSavePaintMark";

let go: (path: string) => void = () => undefined;

/** Stands in for the CAPEX screen: one instance, kept mounted across both routes. */
function Capex({ gridShown }: { gridShown: boolean }) {
  useSavePaintMark(gridShown);
  const navigate = useNavigate();
  go = (path) => { void navigate(path); };
  return null;
}

/** The panel route and the CAPEX route share the same, still mounted, CAPEX element. */
function Shell({ gridShown }: { gridShown: boolean }) {
  return (
    <>
      <Capex gridShown={gridShown} />
      <Routes>
        <Route path="/costs/capex" element={null} />
        <Route path="/costs/add-from-table" element={null} />
      </Routes>
    </>
  );
}

describe("useSavePaintMark", () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it("UT-ACPERF-050 a navigation with the grid showing marks again, without a remount", () => {
    const shown = vi.spyOn(addCostSaveTimeline, "capexShown");
    render(<MemoryRouter initialEntries={["/costs/add-from-table"]}><Shell gridShown /></MemoryRouter>);
    expect(shown).toHaveBeenCalledTimes(1); // mount
    act(() => { go("/costs/capex"); }); // the Save closes the panel
    expect(shown).toHaveBeenCalledTimes(2);
  });

  it("UT-ACPERF-051 no mark while the grid is not showing, also on a navigation", () => {
    const shown = vi.spyOn(addCostSaveTimeline, "capexShown");
    render(<MemoryRouter initialEntries={["/costs/add-from-table"]}><Shell gridShown={false} /></MemoryRouter>);
    act(() => { go("/costs/capex"); });
    expect(shown).not.toHaveBeenCalled();
  });

  it("UT-ACPERF-052 a re-render with nothing changed does not mark again", () => {
    const shown = vi.spyOn(addCostSaveTimeline, "capexShown");
    const view = render(<MemoryRouter initialEntries={["/costs/capex"]}><Shell gridShown /></MemoryRouter>);
    view.rerender(<MemoryRouter initialEntries={["/costs/capex"]}><Shell gridShown /></MemoryRouter>);
    expect(shown).toHaveBeenCalledTimes(1);
  });
});
