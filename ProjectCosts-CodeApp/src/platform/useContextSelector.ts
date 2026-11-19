/**
 * A drop-in for the two `use-context-selector` exports `react-spreadsheet` uses — `createContext`
 * and `useContextSelector` — built on React's `useSyncExternalStore`. `vite.config.ts` aliases
 * the package to this file; nothing else in the app imports `use-context-selector`.
 *
 * WHY (D140): the Add Cost from Table sheet is about 28,000 cells, and every cell reads the
 * sheet's state through seven selectors. `use-context-selector` (1.4.4, and 2.0.0 the same)
 * tells every subscriber about every state change with a `useReducer` dispatch, and React 19
 * renders every dispatched component before it finds out nothing changed. So each keystroke and
 * each click rendered all 28,000 cells: 1–10 s per keystroke in Edge on a production build.
 * Here a change only runs the selectors; a component renders when what it selected changed.
 *
 * Same contract as the package: a selector gets the Provider's latest value and its result is
 * compared with `Object.is`; the value reaches subscribers after the Provider commits (layout
 * effect), as the package does.
 */
import {
  createContext as createReactContext,
  createElement,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type Context,
  type ReactNode,
} from "react";

interface Store<V> {
  get: () => V;
  /** Takes a new Provider value and tells every subscriber; a value equal to the current one is ignored. */
  set: (value: V) => void;
  subscribe: (listener: () => void) => () => void;
}

function createStore<V>(initial: V): Store<V> {
  const listeners = new Set<() => void>();
  let current = initial;
  return {
    get: () => current,
    set: (value) => {
      if (sameValue(current, value)) return;
      current = value;
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}

/**
 * A Provider value equal to the previous one item by item is the same value. `react-spreadsheet`
 * provides its `useReducer` tuple, a NEW array on every render even when neither the state nor
 * the dispatch changed; telling 28,000 subscribers about that would be pure cost.
 */
function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  return a.every((item, i) => Object.is(item, b[i]));
}

export function createContext<V>(defaultValue: V): Context<V> {
  const context = createReactContext<Store<V>>(createStore(defaultValue));
  const StoreProvider = context.Provider;

  function Provider({ value, children }: { value: V; children?: ReactNode }) {
    const [store] = useState(() => createStore(value));
    useLayoutEffect(() => { store.set(value); }, [store, value]);
    return createElement(StoreProvider, { value: store }, children);
  }

  // The package's context is used only through its Provider and `useContextSelector`, both here.
  return Object.assign(context, { Provider }) as unknown as Context<V>;
}

export function useContextSelector<V, S>(context: Context<V>, selector: (value: V) => S): S {
  const store = useContext(context as unknown as Context<Store<V>>);
  /*
   * `react-spreadsheet`'s selectors are inline closures over render values (a cell's point, the
   * active cell), so the latest one is always used. The result is kept while the value and the
   * selector are unchanged, and an equal result keeps the previous one, so a selector returning a
   * fresh object for the same input does not loop (`useSyncExternalStore` needs a stable snapshot).
   */
  const memo = useRef<{ value: V; selector: (value: V) => S; selected: S } | null>(null);
  const getSnapshot = () => {
    const value = store.get();
    const last = memo.current;
    if (last && last.selector === selector && Object.is(last.value, value)) return last.selected;
    const next = selector(value);
    const selected = last && Object.is(last.selected, next) ? last.selected : next;
    memo.current = { value, selector, selected };
    return selected;
  };
  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
}
