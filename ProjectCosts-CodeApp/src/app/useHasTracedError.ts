/**
 * Whether an error has been traced in this session (the header's warning icon, D162 FE-SH-08).
 *
 * `App` used to read `lastError()` during render without subscribing, so the icon appeared only when `App` happened to re-render
 * for another reason (and, after FE-SH-01 removed the needless re-renders, it would hardly ever have appeared). This subscribes to
 * the trace store; the snapshot is a boolean, so `App` re-renders once when it flips, not once per trace line.
 *
 * The store calls its listeners synchronously inside `trace()`, and some components trace while they RENDER (`QueryStates` turns a
 * load error into its message through `userErrorText`). Notifying React there would update `App` during another component's
 * render ("Cannot update a component while rendering a different component"), so the notification is deferred to a microtask.
 */
import { useSyncExternalStore } from "react";
import { lastError, subscribe } from "@/platform/telemetry";

const hasTracedError = (): boolean => lastError() !== undefined;

const subscribeDeferred = (notify: () => void): (() => void) => {
  let active = true;
  const stop = subscribe(() => { queueMicrotask(() => { if (active) notify(); }); });
  return () => { active = false; stop(); };
};

export function useHasTracedError(): boolean {
  return useSyncExternalStore(subscribeDeferred, hasTracedError, hasTracedError);
}
