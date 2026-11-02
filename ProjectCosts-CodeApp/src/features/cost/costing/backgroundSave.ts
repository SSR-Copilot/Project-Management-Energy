/**
 * WS-F — Add Cost from Table's optional BACKGROUND Save. PROPOSED, and OFF (`BACKGROUND_SAVE`).
 *
 * DIVERGENCE: the canvas Save keeps `cmp_Costs_PopUpLoading_CostDescriptionAddCostFromTable` up
 * (`locIsVisiblePopUpSpinner`, "Please wait, saving costs...") until its writes have finished, and
 * only then returns to DEVEX/CAPEX; this app does the same while the flag is off (D58 turned the
 * pop-up into the footer status line, but the Save still waits). With the flag ON, once
 * `prepareSheetSave` has accepted the sheet the screen starts the Save and navigates back AT ONCE,
 * and the Save runs on in `useSaveAddCostSheet`'s mutation, which lives in the app's one
 * `QueryClient` and so outlives the screen. Enabling it is the product owner's call: the user sees
 * DEVEX/CAPEX before Dataverse has the rows, and on a failure the sheet's unsaved edits are gone
 * (the sheet was left; reopening it re-reads what landed).
 *
 * While a background Save runs:
 *  - the CA-15 write lock holds: the mutation keeps its `costWriteKey(projectId, "add-cost-sheet")`
 *    until it settles, so `useCostWriteInFlight` greys every Cost write of the project, on every
 *    screen (DEVEX/CAPEX's own "Add Cost from Table" command included);
 *  - a `progress` toast says so (`BACKGROUND_SAVE_MSG.saving`, NEW). It renders into
 *    `<AppToaster />`, which `app/Providers.tsx` mounts once for every route, as the background
 *    delete toasts already do;
 *  - the browser asks before the tab is closed or reloaded (`holdBeforeUnload`): closing it would
 *    cut the Save off part-way;
 *  - an Add Cost from Table sheet opened meanwhile (browser Back, a deep link) stays locked
 *    (`useBackgroundSaveRunning`), and is re-read when the Save settles, so it never plans against a
 *    snapshot taken mid-save.
 *
 * NO OPTIMISTIC PATCH BEFORE THE SAVE RESOLVES. The book patch (`applySavedSheetToBook`) needs the
 * Save's `applied` result: the PLAN, which the data layer builds itself (after its optional
 * re-read, with the ids it mints), and the rows that actually landed. Building it twice, in the
 * screen and in the data layer, would be a second copy of the planner, and a patch shown before the
 * writes land would show rows that may never exist. So the closest safe variant is used: navigate at
 * once, keep the cached (pre-save) book on screen with the status showing, and patch it the moment
 * the Save resolves, in the same `onSuccess` as today. A failure refetches instead, so the grid
 * shows what Dataverse holds, part of the Save included.
 *
 * RETRY. The screen's id cache (`idCache`, `sentInFailedAttempts`) dies with the screen. After a
 * background failure the next Save is made from a sheet opened afresh, whose first read starts after
 * the failure settled (the sheet query is invalidated then, and a sheet open meanwhile is locked
 * and re-read). Every row the failed attempt landed is therefore a STORED row of the new snapshot,
 * so the new Save updates it instead of creating it a second time. That Save is a first attempt
 * (empty id cache), so the data layer's existence check is skipped exactly as for any fresh sheet
 * (`skipUpsertVerify`): every new id it sends is freshly minted, and every existing row goes out
 * through `UpdateMultiple`, which refuses a row that no longer exists.
 *
 * Pure decisions plus the one piece of module state, the background Saves in flight (the pattern of
 * `data/pendingDeletes.ts`). Never throws into a Save.
 */
import { useCallback, useSyncExternalStore } from "react";
import { holdBeforeUnload } from "@/components/beforeUnload";
import type { Notify } from "@/components/useNotify";

/**
 * OFF: the Save waits, as in the canvas. `true` navigates back at once and saves in the background
 * (DIVERGENCE above; a product decision). The screen reads it per Save.
 */
export const BACKGROUND_SAVE = false;

/** NEW TEXT (WS-F): no canvas source, the canvas cannot leave a Save that is still running. */
export const BACKGROUND_SAVE_MSG = {
  /** NEW — the status while the Save runs after the sheet was left. */
  saving: "Saving the cost table in the background...",
  /** NEW — the toast when it has finished. The user is no longer on the sheet to see it close. */
  saved: "The cost table has been saved.",
} as const;

/** The status toast's `data-testid` (rule 16). */
export const BACKGROUND_SAVE_STATUS_TEST_ID = "add-costs-background-save-status";

/**
 * Whether this Save runs in the background. Never when some removal was spared by the past-cost
 * guard (`blockedByPastCosts`, only with `CANVAS_PARITY_DELETION = false`): that Save stays on the
 * sheet to say so, which it cannot do once it has left.
 */
export function backgroundSaveApplies(args: { enabled: boolean; blockedByPastCosts: number }): boolean {
  return args.enabled && args.blockedByPastCosts === 0;
}

/* ═══════════════════════════════════════════════════ the Saves in flight ══ */

/** Project id → how many background Saves of it are running. */
const running = new Map<string, number>();
const listeners = new Set<() => void>();

function changed(): void {
  for (const listener of listeners) {
    try { listener(); } catch { /* a listener must not stop the others */ }
  }
}

/** True while a background Save of `projectId` is running. */
export function backgroundSaveRunning(projectId: string | undefined): boolean {
  return projectId !== undefined && (running.get(projectId) ?? 0) > 0;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/**
 * True while a background Save of `projectId` runs: an Add Cost from Table sheet opened meanwhile
 * stays locked. Needs no provider (it reads this module), so a screen rendered alone still works.
 */
export function useBackgroundSaveRunning(projectId: string | undefined): boolean {
  const read = useCallback(() => backgroundSaveRunning(projectId), [projectId]);
  return useSyncExternalStore(subscribe, read, read);
}

/** What a background Save holds until it settles. */
export interface BackgroundSaveHandle {
  /** Clears the status, gives back the unload guard and the lock; idempotent. */
  settle(outcome: "saved" | "failed"): void;
}

/**
 * Starts the background Save's status, unload guard and registration. `settle` undoes all three,
 * and on `"saved"` raises the success toast (the failure toast is the screen's, through
 * `useWriteFailureReport`, with the mapped failure text). Never throws: a broken toaster or window
 * must not fail the Save.
 */
export function beginBackgroundSave(
  projectId: string,
  deps: {
    notify: Pick<Notify, "progress" | "success">;
    /** Defaults to the app's shared `beforeunload` hold. */
    holdUnload?: () => () => void;
  },
): BackgroundSaveHandle {
  const undo: (() => void)[] = [];
  const attempt = (fn: () => void) => { try { fn(); } catch { /* never fail the Save */ } };
  attempt(() => { undo.push(deps.notify.progress(BACKGROUND_SAVE_MSG.saving, { testId: BACKGROUND_SAVE_STATUS_TEST_ID })); });
  attempt(() => { undo.push((deps.holdUnload ?? holdBeforeUnload)()); });
  running.set(projectId, (running.get(projectId) ?? 0) + 1);
  attempt(changed);
  let settled = false;
  return {
    settle(outcome) {
      if (settled) return;
      settled = true;
      for (const fn of undo) attempt(fn);
      const left = (running.get(projectId) ?? 1) - 1;
      if (left > 0) running.set(projectId, left); else running.delete(projectId);
      attempt(changed);
      if (outcome === "saved") attempt(() => deps.notify.success(BACKGROUND_SAVE_MSG.saved));
    },
  };
}
