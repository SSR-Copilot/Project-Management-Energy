/**
 * H2 — "run this write under the blocking overlay" (CAPEX Accounts `Screen.tsx:139-146`,
 * Check List Settings `Screen.tsx:154-165`, Project Gates `Screen.tsx:151-225`).
 *
 *   run(label, fn)                      sets `busy = label` (the overlay text), awaits `fn`, clears
 *                                       it in `finally` and rethrows.
 *   run(label, fn, { inline: key })     sets `inline = key` instead (Check List Settings' row
 *                                       spinner for the Completion toggle; no overlay).
 *   track(id, fn)                       concurrent per-row pending set (Project Gates' toggles).
 *
 * `onStart` runs at the start of every `run` (Check List Settings: `notify.dismissAll`).
 *
 * Wave C: `inlineLabel` is the `label` of the inline `run` in flight (undefined otherwise), so a
 * screen can announce it in a live region without keeping its own copy (Check List Settings).
 */
import { useCallback, useEffect, useRef, useState } from "react";

export interface BusyRunner {
  /** The blocking overlay label while a non-inline `run` is in flight. */
  busy: string | undefined;
  /** The key of an inline `run` in flight. */
  inline: string | undefined;
  /** The label of the inline `run` in flight (set and cleared together with `inline`). */
  inlineLabel: string | undefined;
  /** `busy !== undefined || inline !== undefined`. */
  isBusy: boolean;
  run<T>(label: string, fn: () => Promise<T>, o?: { inline?: string }): Promise<T>;
  track<T>(id: string, fn: () => Promise<T>): Promise<T>;
  isPending(id: string): boolean;
}

export function useBusyRunner(opts: { onStart?: () => void } = {}): BusyRunner {
  const [busy, setBusy] = useState<string | undefined>();
  const [inline, setInline] = useState<{ key: string; label: string } | undefined>();
  const [pending, setPending] = useState<ReadonlySet<string>>(() => new Set());
  const onStart = useRef(opts.onStart);
  useEffect(() => { onStart.current = opts.onStart; });

  const run = useCallback(async <T,>(label: string, fn: () => Promise<T>, o?: { inline?: string }): Promise<T> => {
    const key = o?.inline;
    if (key !== undefined) setInline({ key, label });
    else setBusy(label);
    onStart.current?.();
    try {
      return await fn();
    } finally {
      if (key !== undefined) setInline(undefined);
      else setBusy(undefined);
    }
  }, []);

  const track = useCallback(async <T,>(id: string, fn: () => Promise<T>): Promise<T> => {
    setPending((prev) => new Set(prev).add(id));
    try {
      return await fn();
    } finally {
      setPending((prev) => { const next = new Set(prev); next.delete(id); return next; });
    }
  }, []);

  const isPending = useCallback((id: string) => pending.has(id), [pending]);

  return {
    busy, inline: inline?.key, inlineLabel: inline?.label,
    isBusy: busy !== undefined || inline !== undefined, run, track, isPending,
  };
}
