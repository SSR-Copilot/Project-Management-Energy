/**
 * H4 — the state of a screen's confirmation dialog (delete, deactivate, …).
 *
 * Two flows, as the screens have them today:
 *   default     (CAPEX Accounts): `confirm` sets `busy`, runs, closes on success; on failure the
 *               dialog STAYS OPEN with `error` set (render it with `ConfirmDialog error` — E2) and
 *               the error is not rethrown.
 *   closeFirst  (Check List Settings, Contracts, Costs, Project Gates): the dialog closes at once,
 *               then the work runs (under the page overlay); failures propagate to the caller,
 *               which shows its toast.
 *
 * `cancel` is ignored while busy; `ask` clears any previous error.
 */
import { useCallback, useRef, useState } from "react";

export interface ConfirmState<K extends string, P> { kind: K; payload: P }

export interface ConfirmDialogState<K extends string, P> {
  state: ConfirmState<K, P> | null;
  error: string | undefined;
  busy: boolean;
  ask(kind: K, payload: P): void;
  /** Ignored while busy. */
  cancel(): void;
  confirm(run: (s: ConfirmState<K, P>) => Promise<void>, o?: {
    closeFirst?: boolean;
    /** Default flow: the message shown in the dialog on failure. Default: the error's message. */
    errorText?: (e: unknown) => string;
  }): Promise<void>;
}

const defaultErrorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function useConfirmDialog<K extends string, P = undefined>(): ConfirmDialogState<K, P> {
  const [state, setState] = useState<ConfirmState<K, P> | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const ask = useCallback((kind: K, payload: P) => {
    setError(undefined);
    setState({ kind, payload });
  }, []);

  const cancel = useCallback(() => {
    if (busyRef.current) return;
    setState(null);
    setError(undefined);
  }, []);

  const confirm = useCallback(async (
    run: (s: ConfirmState<K, P>) => Promise<void>,
    o: { closeFirst?: boolean; errorText?: (e: unknown) => string } = {},
  ) => {
    const current = state;
    if (!current || busyRef.current) return;
    if (o.closeFirst) {
      setState(null);
      setError(undefined);
      await run(current);
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError(undefined);
    try {
      await run(current);
      setState(null);
    } catch (e) {
      setError((o.errorText ?? defaultErrorText)(e));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [state]);

  return { state, error, busy, ask, cancel, confirm };
}
