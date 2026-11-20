/**
 * Generators screen — the split load gate (D141, `GENERATORS_PERF.gateByList`).
 *
 * Before: `loading` was "any of the 16 reads is loading", so the list waited for the orderable catalogue (a read that
 * starts only once the project row has the FID) and the device costs (they start after the country is known), neither of
 * which a card shows. Now the first view waits only for the reads the LIST shows; four reads become lazy and are
 * enabled when something that builds a write from them opens:
 *
 *  - the orderable catalogue: the Add Generator Type and Replace Generator Type panels (their supplier cascade);
 *  - the price index: the type and turbine panels, Replace, the height pop-ups and the Delete Turbine confirmation (the
 *    price band and the cost of a turbine are computed from it);
 *  - the device costs: the PV, inverter, substructure and Replace PV panels and the Delete PV confirmation (the cost per
 *    module / inverter / mounting that the plan multiplies);
 *  - the AllWTG land-lease costs: the type, turbine and PV panels (the allocations a new turbine or unit is back-filled into).
 *
 * The F3 guarantee is unchanged: a write is never built from a read that has not settled. A lazy read that is NEEDED and has
 * no answer yet counts as "waiting" (`lazyWaiting`), which the Screen feeds into `dataSettling` next to the reads that
 * already held the writes back, so every Save stays disabled and every command stays off until it has landed. A lazy read
 * that has not started is neither loading nor failed, so it neither shows the overlay nor blanks the screen; one that was
 * started and failed is a load error, as before (a write must not be built from a failed read either).
 *
 * Pure: no React, no network, no globals.
 */

/** The part of a read result the gate looks at (`ReadResult` of `hooks.ts`, or a test double). */
export interface GateRead {
  isLoading: boolean;
  error: unknown;
  hasData?: boolean | undefined;
}

/**
 * Is the read's answer KNOWN: it has data, or (a test double without `hasData`) it is neither loading nor failed.
 * The one definition the F1 O&M guard and this gate share.
 */
export const readKnown = (q: GateRead): boolean => q.hasData ?? (!q.isLoading && !q.error);

/** What a lazy read is needed for right now. */
export interface LazyNeeds {
  catalog: boolean;
  index: boolean;
  device: boolean;
  allWtg: boolean;
}

/** The panel / dialog that is open, as plain strings so this file does not import the Screen's types. */
export interface OpenSurface {
  /** `panel?.kind` of the Screen: "type" | "turbine" | "pv" | "inverter" | "substructure" | "replaceWtg" | "replacePv" | "storage" | … */
  panel: string | null | undefined;
  /** `dialog?.kind` of the Screen, and for `deleteSimple` its family. */
  dialog: string | null | undefined;
  dialogFamily?: string | null | undefined;
}

const ALL_NEEDED: Readonly<LazyNeeds> = { catalog: true, index: true, device: true, allWtg: true };

/** Panels and dialogs that need each lazy read (see the file header for the writes behind them). */
export function lazyNeeds(open: OpenSurface, gateByList: boolean): LazyNeeds {
  if (!gateByList) return ALL_NEEDED;
  const panel = open.panel ?? null;
  const dialog = open.dialog ?? null;
  const dialogPv = dialog === "deleteSimple" && open.dialogFamily === "pv";
  return {
    catalog: panel === "type" || panel === "replaceWtg",
    index: panel === "type" || panel === "turbine" || panel === "replaceWtg"
      || dialog === "heightType" || dialog === "heightTurbine" || dialog === "deleteTurbine",
    device: panel === "pv" || panel === "inverter" || panel === "substructure" || panel === "replacePv" || dialogPv,
    allWtg: panel === "type" || panel === "turbine" || panel === "pv",
  };
}

/**
 * A confirmation that builds its plan from a lazy read the moment it is confirmed (the Delete Turbine confirmation reads
 * the price index, the Delete PV confirmation the device costs). Its panel cannot hold Save back, so the Screen keeps
 * the dialog open while `lazyWaiting` instead of building the plan from a read that has not landed.
 */
export const confirmNeedsLazyRead = (dialog: string | null | undefined, family?: string | null): boolean =>
  dialog === "deleteTurbine" || (dialog === "deleteSimple" && family === "pv");

/**
 * A lazy read that is needed now and has no answer yet. A failed read is not "waiting": it is a load error, which the
 * Screen shows (`loadErrorMode`), and the writes stay refused through that.
 */
export const lazyPending = (needed: boolean, q: GateRead): boolean => needed && !readKnown(q) && !q.error;

export interface LazyRead {
  read: GateRead;
  needed: boolean;
}

export interface LoadGate {
  /** The list is still loading: the overlay, the page lock check and the command bar wait for it. */
  loading: boolean;
  /** Every read that can have failed (the list reads and the lazy ones; a lazy read that never started has no error). */
  reads: readonly GateRead[];
  /** A lazy read the open panel or dialog needs has not answered yet: writes stay held back (`dataSettling`). */
  lazyWaiting: boolean;
}

/**
 * `gateByList` off: every read gates the list and none is "waiting" (today's gate). On: only `list` gates it, and the
 * lazy reads are waited for only when something needs them.
 */
export function loadGate(input: { gateByList: boolean; list: readonly GateRead[]; lazy: readonly LazyRead[] }): LoadGate {
  const lazyReads = input.lazy.map((l) => l.read);
  const reads = [...input.list, ...lazyReads];
  if (!input.gateByList) return { loading: reads.some((q) => q.isLoading), reads, lazyWaiting: false };
  return {
    loading: input.list.some((q) => q.isLoading),
    reads,
    lazyWaiting: input.lazy.some((l) => lazyPending(l.needed, l.read)),
  };
}
