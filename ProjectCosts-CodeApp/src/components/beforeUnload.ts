/**
 * The app's one `beforeunload` listener, reference-counted (CONVENTIONS rule 17).
 *
 * `useBeforeUnload` (`./discardGuard`) holds it while a dirty panel or screen is mounted.
 * `holdBeforeUnload` is the same hold without a component: a write that outlives the screen which
 * started it (Add Cost from Table's background Save, WS-F) takes it when the write starts and
 * gives it back when the write settles. Every holder shares ONE window listener, so a screen, its
 * panel and a running write never stack two handlers: one registration, one prompt.
 */

const onBeforeUnload = (e: BeforeUnloadEvent) => {
  e.preventDefault();
  // Older Chromium and Safari show the prompt only when `returnValue` is set.
  e.returnValue = "";
};
/** How many holders are active right now. */
let beforeUnloadUsers = 0;

/**
 * Registers the `beforeunload` prompt until the returned release is called. Releasing twice is a
 * no-op, so a caller may release from both its success and its failure path. Never throws.
 */
export function holdBeforeUnload(): () => void {
  if (typeof window === "undefined") return () => undefined;
  if (beforeUnloadUsers === 0) window.addEventListener("beforeunload", onBeforeUnload);
  beforeUnloadUsers += 1;
  let held = true;
  return () => {
    if (!held) return;
    held = false;
    beforeUnloadUsers -= 1;
    if (beforeUnloadUsers === 0) window.removeEventListener("beforeunload", onBeforeUnload);
  };
}
