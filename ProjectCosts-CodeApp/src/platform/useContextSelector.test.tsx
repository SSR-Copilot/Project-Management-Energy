// @vitest-environment jsdom
/**
 * D140 — the `use-context-selector` stand-in react-spreadsheet runs on (`vite.config.ts` alias).
 * A subscriber renders when what IT selected changed, not on every change of the value; a value
 * equal item by item (react-spreadsheet's new-every-render `useReducer` tuple) changes nothing.
 */
import { useLayoutEffect, useState, type ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { act, render } from "@testing-library/react";
import * as aliased from "use-context-selector";
import { createContext, useContextSelector } from "./useContextSelector";

type State = { a: number; b: number };
const Ctx = createContext<[State, string]>([{ a: 0, b: 0 }, "dispatch"]);

function counter() {
  const renders = { a: 0, b: 0 };
  // Counted in a layout effect with no dependencies: once per committed render of the component.
  function A() {
    useLayoutEffect(() => { renders.a++; });
    return <span data-testid="a">{useContextSelector(Ctx, ([s]) => s.a)}</span>;
  }
  function B() {
    useLayoutEffect(() => { renders.b++; });
    return <span data-testid="b">{useContextSelector(Ctx, ([s]) => s.b)}</span>;
  }
  return { renders, A, B };
}

describe("useContextSelector (D140)", () => {
  it("UT-UCS-001 the package name resolves to this module (the alias react-spreadsheet is built with)", () => {
    expect(aliased.createContext).toBe(createContext);
    expect(aliased.useContextSelector).toBe(useContextSelector);
  });

  it("UT-UCS-002 a change renders only the subscribers whose selection changed", () => {
    const { renders, A, B } = counter();
    let set!: (s: State) => void;
    function Host({ children }: { children: ReactNode }) {
      const [state, setState] = useState<State>({ a: 1, b: 1 });
      useLayoutEffect(() => { set = setState; }, []);
      return <Ctx.Provider value={[state, "dispatch"]}>{children}</Ctx.Provider>;
    }
    // The children are created once, outside Host, as react-spreadsheet's memoized table is.
    const view = render(<Host><A /><B /></Host>);
    const before = { ...renders };
    act(() => set({ a: 2, b: 1 }));
    expect(view.getByTestId("a").textContent).toBe("2");
    expect(view.getByTestId("b").textContent).toBe("1");
    expect(renders.a).toBeGreaterThan(before.a);
    expect(renders.b).toBe(before.b);
  });

  it("UT-UCS-003 a new value equal item by item notifies nobody", () => {
    const { renders, A, B } = counter();
    const state: State = { a: 5, b: 6 };
    let bump!: () => void;
    function Host({ children }: { children: ReactNode }) {
      const [, setN] = useState(0);
      useLayoutEffect(() => { bump = () => setN((n) => n + 1); }, []);
      // A NEW tuple on every render, holding the same state and dispatch.
      return <Ctx.Provider value={[state, "dispatch"]}>{children}</Ctx.Provider>;
    }
    render(<Host><A /><B /></Host>);
    const before = { ...renders };
    act(() => bump());
    expect(renders).toEqual(before);
  });

  it("UT-UCS-004 a selector over render values uses the latest one", () => {
    function Pick({ key2 }: { key2: keyof State }) {
      return <span data-testid="pick">{useContextSelector(Ctx, ([s]) => s[key2])}</span>;
    }
    const value: [State, string] = [{ a: 1, b: 2 }, "dispatch"];
    const view = render(<Ctx.Provider value={value}><Pick key2="a" /></Ctx.Provider>);
    expect(view.getByTestId("pick").textContent).toBe("1");
    view.rerender(<Ctx.Provider value={value}><Pick key2="b" /></Ctx.Provider>);
    expect(view.getByTestId("pick").textContent).toBe("2");
  });

  it("UT-UCS-005 without a Provider the default value is selected", () => {
    function D() { return <span data-testid="d">{useContextSelector(Ctx, ([, dispatch]) => dispatch)}</span>; }
    expect(render(<D />).getByTestId("d").textContent).toBe("dispatch");
  });
});
