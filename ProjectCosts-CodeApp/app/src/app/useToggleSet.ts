/**
 * H5 — a set of ids that toggle (expanded cards, collapsed gates, open sections).
 *
 * With `scope`, ids are stored as `${scope}|${id}` and `has` / `values` see only the current
 * scope, so Project Gates' collapse state survives switching to another country / technology and
 * back (PG `rules.ts:439-441`). `values` lists the current scope's ids (unprefixed).
 */
import { useCallback, useMemo, useState } from "react";

export interface ToggleSet<T extends string> {
  has(id: T): boolean;
  toggle(id: T): void;
  add(id: T): void;
  remove(id: T): void;
  /** Clears the current scope's ids (every id when unscoped). */
  clear(): void;
  /** Replaces the current scope's ids. */
  replace(ids: Iterable<T>): void;
  values: ReadonlySet<T>;
}

export function useToggleSet<T extends string = string>(initial?: Iterable<T>, scope?: string): ToggleSet<T> {
  const prefix = scope === undefined ? "" : `${scope}|`;
  const [raw, setRaw] = useState<ReadonlySet<string>>(() => new Set([...(initial ?? [])].map((id) => `${prefix}${id}`)));
  const k = useCallback((id: T) => `${prefix}${id}`, [prefix]);

  const has = useCallback((id: T) => raw.has(k(id)), [raw, k]);
  const toggle = useCallback((id: T) => setRaw((prev) => {
    const next = new Set(prev);
    if (next.has(k(id))) next.delete(k(id)); else next.add(k(id));
    return next;
  }), [k]);
  const add = useCallback((id: T) => setRaw((prev) => (prev.has(k(id)) ? prev : new Set(prev).add(k(id)))), [k]);
  const remove = useCallback((id: T) => setRaw((prev) => {
    if (!prev.has(k(id))) return prev;
    const next = new Set(prev); next.delete(k(id)); return next;
  }), [k]);
  const inScope = useCallback((key: string) => (prefix === "" ? true : key.startsWith(prefix)), [prefix]);
  const clear = useCallback(() => setRaw((prev) => new Set([...prev].filter((key) => !inScope(key)))), [inScope]);
  const replace = useCallback((ids: Iterable<T>) => setRaw((prev) => new Set([
    ...[...prev].filter((key) => !inScope(key)),
    ...[...ids].map((id) => k(id)),
  ])), [inScope, k]);
  const values = useMemo(
    () => new Set([...raw].filter(inScope).map((key) => key.slice(prefix.length) as T)) as ReadonlySet<T>,
    [raw, inScope, prefix],
  );

  return { has, toggle, add, remove, clear, replace, values };
}
