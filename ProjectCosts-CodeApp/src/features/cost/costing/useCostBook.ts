import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/app/SessionContext";
import { qk } from "@/data/keys";
import { costRepository } from "@/data/costRepository";
import { NO_FOCUS_REFETCH } from "@/data/adminQueryPresets";
import { loadActiveWtgCount, loadStandardAssumptions } from "@/data/standardContracts";
import { deleteComment, loadComments, saveComment } from "@/data/comments";
import { loadCapexCategories, loadMilestoneDurations, loadProjectStates } from "@/data/costBook";
import type { PeriodWriteContext, StandardContractArgs } from "@/data/periodWrites";
import type { LeaseWrite } from "@/features/cost/periods/landLeaseRules";
import { useProjectExtras } from "@/features/cost/contracts/hooks";
import { useNotify, type Notify } from "@/components/useNotify";
import {
  backgroundDeleteFailureTexts, bookPatchFailureReport, type DeferredCounts, type SaveAddCostSheetResult,
} from "@/data/addCostSheet";
import { emitSaveLog } from "@/data/saveLog";
import type { BackgroundOutcome } from "@/data/addCostSheetBulk";
import { excludePendingFromBook, excludePendingFromSheet, pendingDeletes } from "@/data/pendingDeletes";
import type { CostBook, CostLine, CostPeriod, Payment } from "./model";
import { panelBusyLogLine } from "@/data/capexWrites";
import { applySavedSheetToBook } from "./savedSheetPatch";
import { costWriteKey } from "@/domain/writeGuard";

/**
 * Every field a save should compare — `id` decides create/update/delete, not equality.
 *
 * The chain columns are here too (`contractId`, `parentId`, `periodIndex`). Leaving them out
 * would make "this period moved to a different contract" compare equal and skip the write, and
 * the Land Lease header rule (`periodIndex === 1` owns the contract's shared fields) reads them
 * on every save. `contractName`, `allWtgAllocated`, `hasOneTimePayment` and `secured` are
 * derived from the header the save itself writes, so they are NOT compared: including them
 * would make every reload look like a change.
 */
const PERIOD_FIELDS = [
  "group", "mode", "description", "startDate", "years", "months", "currency", "fixed", "revenue",
  "perMwh", "perMw", "perWtg", "aggregation", "frequency", "inflation", "countryInflation",
  "inflationYear", "inflationPercent", "inflationCountryArea", "threshold", "align", "external",
  "standard", "isStartDateStandard", "contractId", "parentId", "periodIndex", "deviceId",
  // O&M's two threshold columns. `thresholdType` decides p75 / p90 / Individual and
  // `thresholdIndividual` is the figure behind Individual — a DIFFERENT column from `perMwh`,
  // which the write map used to copy into it.
  "thresholdType", "thresholdIndividual",
  // The Land Lease header's own columns — the panel's Land Owner box and its three One-Time
  // Payments. Flat primitives, so `===` is the right comparison; see `CostPeriod`.
  "landOwner",
  "amountOneTimePayment", "amountOneTimePayment2", "amountOneTimePayment3",
  "dueDateOneTimePayment", "dueDateOneTimePayment2", "dueDateOneTimePayment3",
] as const satisfies readonly (keyof CostPeriod)[];

/** `allocatedGeneratorIds` is an ARRAY, so it is compared by value rather than by identity. */
function sameIds(a: readonly string[] | undefined, b: readonly string[] | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

function periodsEqual(a: CostPeriod, b: CostPeriod): boolean {
  return PERIOD_FIELDS.every((key) => a[key] === b[key])
    && sameIds(a.allocatedGeneratorIds, b.allocatedGeneratorIds);
}

/**
 * @param category DEVEX/CAPEX tab index. Omit it on screens that do not show cost lines —
 *   the Dataverse path then fetches none, instead of the project's whole cost set.
 */
export function useCostBook(category?: number) {
  const { projectId, project } = useSession();
  const queryClient = useQueryClient();
  const queryKey = ["cost-book", projectId, category ?? "none"];
  const query = useQuery({
    queryKey, enabled: Boolean(projectId), retry: false,
    // Rows a previous Add Cost from Table Save is still deleting in the background stay hidden
    // (D51 §11.19). The snapshot is taken when the read starts: every registry change is followed
    // by an invalidation, which cancels and restarts a read in flight.
    queryFn: async () => {
      const pending = pendingDeletes.snapshot();
      return excludePendingFromBook(await costRepository().getCostBook(projectId as string, category), pending);
    },
  });
  /**
   * The O&M / Land Lease / Other OPEX period screens' save.
   *
   * `Screen.tsx` always hands back the WHOLE book with at most one period added, changed, or
   * removed (`commit`, `addStandard`, the delete confirm) — or with only `extraGroups` touched
   * (`addContractType`). This diffs the incoming book against what `useQuery` last returned and
   * turns that into targeted `savePeriod` / `deletePeriod` calls (see `data/periodWrites.ts`),
   * the same "targeted write, not a whole-book diff against Dataverse" shape `useCapexWrites`
   * already uses for CAPEX.
   *
   * The CAPEX comments panel (stage 2.4) is the other caller this mutation once served; it has
   * no Dataverse path yet either, and will throw here (no period-shaped change to make) until it
   * gets its own targeted mutation the same way CAPEX did.
   *
   * LAND LEASE'S "ADD CONTRACT TYPE" IS A PERIOD SAVE, not an `extraGroups` change. The canvas
   * command only opens the panel; the SAVE then creates a `vsb_landleaseprojectcosts` header
   * under the sub-account the card belongs to (`LandLeaseCostScreenCode.txt:388` / `:5895`), and
   * `savePeriod` does the same whenever a Land Lease period arrives with `isNew` and NO
   * `contractId`. `extraGroups` stays what the loader means by it — the sub-accounts that
   * already carry a header — and is no longer a place to park an unsaved group name.
   */
  const save = useMutation({
    // CA-15: counted by `useCostWriteInFlight` even after the screen that started it is gone.
    mutationKey: costWriteKey(projectId, "periods"),
    mutationFn: async (nextBook: CostBook): Promise<{ book: CostBook; touchedPeriods: boolean }> => {
      if (!projectId) throw new Error("No project is selected.");
      const previous = query.data;
      if (!previous) throw new Error("The Cost book has not finished loading yet.");

      const ctx = periodWriteContext(projectId, project);
      const prevById = new Map(previous.periods.map((p) => [p.id, p]));
      const nextById = new Map(nextBook.periods.map((p) => [p.id, p]));
      // Keyed by the id the book came in with, because a create's id changes underneath us.
      const savedByKey = new Map<string, CostPeriod>();
      let touchedPeriods = false;

      for (const [id, period] of nextById) {
        const before = prevById.get(id);
        if (!before) {
          savedByKey.set(id, await costRepository().savePeriod(ctx, period, true));
          touchedPeriods = true;
        } else if (!periodsEqual(before, period)) {
          savedByKey.set(id, await costRepository().savePeriod(ctx, period, false));
          touchedPeriods = true;
        }
      }
      for (const [id, before] of prevById) {
        if (!nextById.has(id)) {
          await costRepository().deletePeriod(before);
          touchedPeriods = true;
        }
      }

      // The WHOLE saved period replaces the submitted one, not just its id: a create comes back
      // with the chain facts the caller could not know (`contractId` for a brand-new Land Lease
      // contract, the slot the period actually landed in) and with the header flags a later edit
      // or delete in the same session has to address the right rows with.
      const periods = savedByKey.size === 0
        ? nextBook.periods
        : nextBook.periods.map((p) => savedByKey.get(p.id) ?? p);
      return { book: { ...nextBook, periods }, touchedPeriods };
    },
    onSuccess: ({ book, touchedPeriods }) => {
      queryClient.setQueryData(queryKey, book);
      // Only a real period write needs reconciling against the server (ids, Land Lease's
      // Allocation/OTP flags); an extraGroups-only save has nothing further to fetch, and
      // invalidating it would just fetch back the pre-save state — see the doc comment above.
      if (touchedPeriods) {
        void queryClient.invalidateQueries({ queryKey });
        void queryClient.invalidateQueries({ queryKey: ["land-lease-contracts", projectId] });
      }
    },
  });
  return { ...query, save, projectId };
}

/**
 * The write context every period write takes.
 *
 * `projectName` is here because a Land Lease header's `vsb_name` starts with it
 * (`LandLeaseCostScreenCode.txt:5895`). It was the one piece of `gblSelectedProject` the write
 * side needed and did not have.
 */
function periodWriteContext(
  projectId: string,
  project: { owningBusinessUnitId?: string; projectName?: string } | undefined,
): PeriodWriteContext {
  return {
    projectId,
    owningBusinessUnitId: project?.owningBusinessUnitId,
    projectName: project?.projectName,
  };
}

/**
 * "Add Standard Contract" on the O&M / Other OPEX / Land Lease cards.
 *
 * Its own mutation rather than a book save: the command creates a whole CHAIN — a head plus one
 * row per later assumption period — and the book diff in `save` can only express one period at a
 * time. `addStandardContract` returns the created periods in chain order; invalidating the book
 * is how they reach the screen, because their ids, their slots and the contract they belong to
 * are all decided server-side.
 *
 * `countryInflationPercent` is the caller's job: the canvas resolves it with
 * `LookUp('Country Inflation Profiles', Country = project's country && Year = COD year + 1)
 * .Inflation` and this module has no business holding a second copy of that query.
 */
export function useAddStandardContract() {
  const { projectId, project } = useSession();
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: costWriteKey(projectId, "periods"), // CA-15
    mutationFn: (args: StandardContractArgs) => {
      if (!projectId) throw new Error("No project is selected.");
      return costRepository().addStandardContract(periodWriteContext(projectId, project), args);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["cost-book", projectId, "none"] });
      void queryClient.invalidateQueries({ queryKey: ["land-lease-contracts", projectId] });
    },
  });
}

/**
 * Every Land Lease CONTRACT on the project, including the ones with no period rows yet.
 *
 * The book's `periods` cannot show those: a contract exists as a `vsb_landleaseprojectcosts`
 * header the moment "Add Contract Type" is saved, and its first period may never be filled in.
 * Measured on VSBCloud_Dev, 16 Sep, 19 of Project New Data's 27 headers are in that state.
 */
export function useLandLeaseContracts() {
  const { projectId } = useSession();
  return useQuery({
    queryKey: ["land-lease-contracts", projectId],
    enabled: Boolean(projectId),
    retry: false,
    queryFn: () => costRepository().getLandLeaseContracts(projectId as string),
  });
}

/**
 * The `Inflation Country Area` dropdown's options for a project's country.
 *
 * `Distinct(Filter('Country Inflation Profiles', Country.Country = gblSelectedProject.Country
 * .Country).Area, Area)` — `OpexCostScreenCode.txt:7622`. Reference data, so it is keyed on the
 * country alone and cached for the session.
 */
export function useCountryInflationAreas(countryId: string | undefined) {
  return useQuery({
    queryKey: ["country-inflation-areas", countryId ?? "none"],
    enabled: Boolean(countryId),
    staleTime: 30 * 60 * 1000,
    queryFn: () => costRepository().getCountryInflationAreas(countryId),
  });
}

/* ═══════════════════════════════════════════════════════ Land Lease ══ */

/**
 * The Land Lease screen's five queries and its one mutation.
 *
 * They lived in `features/land-lease/hooks.ts` alongside their own `fetchAll` calls, which
 * bypassed `costRepository` — the thing that file's own header calls "the Cost module's single
 * data boundary". The queries moved to `data/landLease.ts` and the hooks moved here, so the Land
 * Lease screen now reaches its data exactly as every other Cost screen does.
 */
export const leaseBookKey = (projectId: string | undefined) =>
  ["land-lease-book", projectId ?? "none"] as const;

export function useLeaseBook(projectId: string | undefined) {
  return useQuery({
    queryKey: leaseBookKey(projectId),
    enabled: Boolean(projectId),
    retry: false,
    queryFn: () => costRepository().getLeaseBook(projectId as string),
  });
}

export function useLeaseGenerators(projectId: string | undefined) {
  return useQuery({
    queryKey: ["land-lease-generators", projectId ?? "none"] as const,
    enabled: Boolean(projectId),
    staleTime: 5 * 60 * 1000,
    queryFn: () => costRepository().getLeaseGenerators(projectId as string),
  });
}

export function useCurrencies() {
  return useQuery({
    queryKey: ["transaction-currencies"] as const,
    staleTime: 30 * 60 * 1000,
    queryFn: () => costRepository().listCurrencies(),
  });
}

/**
 * `Country Inflation Profiles` for the project's country — every year and every Area.
 *
 * Shared by BOTH period screens: Land Lease resolves its read-only percentage and its standard
 * import from it, and OPEX does the same through `opexRules.countryInflationPercent`. Reference
 * data, so it is keyed on the country alone and cached for half an hour.
 */
export function useCountryInflation(countryId: string | undefined) {
  return useQuery({
    queryKey: ["country-inflation", countryId ?? "none"] as const,
    enabled: Boolean(countryId),
    staleTime: 30 * 60 * 1000,
    queryFn: () => costRepository().getCountryInflation(countryId as string),
  });
}

export function useLeaseAssumptions(
  countryId: string | undefined,
  technology: number | null | undefined,
) {
  return useQuery({
    queryKey: ["land-lease-assumptions", countryId ?? "none", technology ?? "none"] as const,
    enabled: Boolean(countryId) && technology !== null && technology !== undefined,
    staleTime: 15 * 60 * 1000,
    queryFn: () => costRepository().getLeaseAssumptions(countryId, technology),
  });
}

/**
 * The Land Lease screen's one mutation.
 *
 * Every Land Lease command — save, delete, standard import — is a plan of writes, so they share
 * this. `onSuccess` invalidates the Land Lease book and, because `getCostBook` projects the same
 * rows into the shared book, that too.
 */
export function useLeaseWrites(projectId: string | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationKey: costWriteKey(projectId, "land-lease"), // CA-15
    mutationFn: (writes: readonly LeaseWrite[]) => costRepository().applyLeaseWrites(writes),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: leaseBookKey(projectId) }),
        client.invalidateQueries({ queryKey: ["cost-book", projectId, "none"] }),
        client.invalidateQueries({ queryKey: ["land-lease-contracts", projectId] }),
      ]);
    },
  });
}

/* ══════════════════════════════════════════════════ OPEX reference data ══ */

/**
 * `colOpexAccounts` and `colOpexSubaccounts` (`OnStart.txt:622-640`).
 *
 * Global master data — two rows and nine rows on the org — so one query pair is cached for the
 * session rather than fetched per screen. `OpexScreen.tsx` carried both as transcribed constants
 * because no loader existed; `selectedAccount` / `defaultSubaccount` / `subaccountsForMode` take
 * exactly these shapes, so the constants were deletable the moment this landed.
 */
export function useOpexCatalog() {
  const accounts = useQuery({
    queryKey: ["opex-accounts"] as const,
    staleTime: 30 * 60 * 1000,
    queryFn: () => costRepository().listOpexAccounts(),
  });
  const subaccounts = useQuery({
    queryKey: ["opex-subaccounts"] as const,
    staleTime: 30 * 60 * 1000,
    queryFn: () => costRepository().listOpexSubaccounts(),
  });
  return {
    accounts: accounts.data ?? [],
    subaccounts: subaccounts.data ?? [],
    isLoading: accounts.isLoading || subaccounts.isLoading,
  };
}

/** `colDeviceTypesInProject` — `[generators, pvModules]`, for `deviceTypeList` to order. */
export function useOpexDeviceTypes(projectId: string | undefined) {
  return useQuery({
    queryKey: ["opex-device-types", projectId ?? "none"] as const,
    enabled: Boolean(projectId),
    staleTime: 5 * 60 * 1000,
    queryFn: () => costRepository().listOpexDeviceTypes(projectId as string),
  });
}

/**
 * The OPEX standard-assumption catalogue, for the `Add Standard Contract` gate.
 *
 * One query for the whole screen; the card tests its own scope against it with
 * `matchesStandardAssumption`, which is the canvas' own predicate.
 */
export function useOpexAssumptionScopes(
  countryId: string | undefined,
  technology: number | undefined,
) {
  return useQuery({
    queryKey: ["opex-assumption-scopes", countryId ?? "none", technology ?? "none"] as const,
    enabled: Boolean(countryId) && technology !== undefined,
    staleTime: 15 * 60 * 1000,
    queryFn: () => costRepository().listOpexAssumptionScopes(countryId, technology),
  });
}

/**
 * Per-category totals for the DEVEX/CAPEX Summary tab.
 *
 * Its own query because it needs no monthly rows: the figure lives on the contract, so this is
 * one narrow request whatever the size of the project.
 */
export function useCapexTotals(enabled = true) {
  const { projectId } = useSession();
  return useQuery({
    queryKey: ["capex-totals", projectId],
    enabled: enabled && Boolean(projectId),
    retry: false,
    // See `useCostBook`: pending background deletes are left out of the sums (D51 §11.19).
    queryFn: () => costRepository().getCapexTotals(projectId as string, pendingDeletes.snapshot()),
  });
}

/**
 * The DEVEX/CAPEX screen's three writes.
 *
 * Each is its own mutation rather than a whole-book save: against Dataverse a book save would
 * mean diffing the entire project. All three invalidate the same keys, because a cost change
 * moves the grid, the Summary tab's totals and the Contracts recalculation alike.
 */
export function useCapexWrites(
  category?: number,
  /**
   * CA-15 — called for every failed CAPEX write, from the HOOK-level `onError`: TanStack keeps
   * running those after the screen unmounts (per-call `mutate(…, { onError })` callbacks it drops),
   * so a failure after the user left still reaches the caller's toast.
   */
  options: { onWriteError?: (error: unknown) => void } = {},
) {
  const { projectId, project } = useSession();
  const client = useQueryClient();
  const reportError = (error: unknown) => {
    try { options.onWriteError?.(error); } catch { /* reporting must never break the write */ }
  };

  /*
   * `writtenOn` is the category the write was MADE on, captured in `onMutate` (D57). TanStack
   * pushes every render's options into a pending mutation, so reading the render-time `category`
   * here refreshed the tab the user had since switched TO, and left the one written on stale.
   */
  const invalidate = async (writtenOn: number | undefined) => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ["cost-book", projectId, writtenOn ?? "none"] }),
      client.invalidateQueries({ queryKey: ["capex-totals", projectId] }),
      client.invalidateQueries({ queryKey: qk.devCoCapexContracts(projectId ?? "none") }),
      client.invalidateQueries({ queryKey: qk.devCoCapexCosts(projectId ?? "none") }),
      // A milestone relink deletes the contract's payment-date comments (`saveCostLine`'s
      // `resetPaidAndPaymentDateComments`), which moves the grid's red dots.
      client.invalidateQueries({ queryKey: ["capex-comments"] }),
    ]);
  };

  /** Runs at mutate time, from that render's options: the category the write is made on. */
  const writtenOn = () => ({ category });

  /** CA-15: every CAPEX write carries the project's Cost write key (`useCostWriteInFlight`). */
  const mutationKey = costWriteKey(projectId, "capex");

  const setPaid = useMutation({
    mutationKey,
    onMutate: writtenOn,
    mutationFn: (args: { lineId: string; year: number; month: number; paid: boolean; costId?: string }) =>
      costRepository().setCostPaid(projectId as string, args),
    onSuccess: (_data, _args, context) => invalidate(context.category),
    onError: (error) => reportError(error),
  });

  const saveLine = useMutation({
    mutationKey,
    // The click time, for the busy line below (the panel's spinner waits for the refetch too),
    // and the category the save is made on (see `invalidate`).
    onMutate: () => ({ startedAt: performance.now(), ...writtenOn() }),
    mutationFn: (args: {
      line: CostLine; accountId: string; isNew: boolean;
      payments: { id?: string; year: number; month: number; amount: number | null }[];
      /** See `SaveCostLineArgs` — the relink confirmation was accepted. */
      resetPaidAndPaymentDateComments?: boolean;
      /** See `SaveCostLineArgs` — the months the panel opened with. */
      storedPayments?: readonly Payment[];
    }) => costRepository().saveCostLine({
      ...args,
      projectId: projectId as string,
      owningBusinessUnitId: project?.owningBusinessUnitId,
    }),
    /*
     * Still AWAITED (D56 §5): the canvas lowers its spinner only after
     * `Select(btn_Capex_Cost_Reload_PCF_After_Mutation_Code)` has reloaded the grid
     * (`CapexScreenCode.txt:17413`), and without a book patch a fire-and-forget refetch would show
     * the pre-save grid for a moment. The line below measures what that wait costs.
     */
    onSuccess: async (_id, _args, context) => {
      const writesDone = performance.now();
      await invalidate(context ? context.category : category);
      console.info(panelBusyLogLine(writesDone - (context?.startedAt ?? writesDone), performance.now() - writesDone));
    },
    // A failed save may have landed in part (D56 §2): reload so the grid, and the stored months
    // the next panel compares against (`storedPayments`, D56 §3), show what Dataverse holds.
    // Not awaited: the error banner must not wait for the reload.
    onError: (error, _args, context) => {
      void invalidate(context ? context.category : category).catch(() => undefined);
      reportError(error);
    },
  });

  const deleteLine = useMutation({
    mutationKey,
    // The click time, for the delete busy line (D58), and the category the delete is made on
    // (D57, see `invalidate`); the refetch is awaited exactly as before.
    onMutate: () => ({ startedAt: performance.now(), ...writtenOn() }),
    mutationFn: (line: CostLine) => costRepository().deleteCostLine(projectId as string, line),
    onSuccess: async (_data, _line, context) => {
      const deletesDone = performance.now();
      await invalidate(context ? context.category : category);
      console.info(panelBusyLogLine(
        deletesDone - (context?.startedAt ?? deletesDone), performance.now() - deletesDone, "delete",
      ));
    },
    onError: (error) => reportError(error),
  });

  return { setPaid, saveLine, deleteLine };
}

/**
 * Add Cost from Table's source data for one category — the sub-accounts, their existing
 * contracts and every cost row under those contracts.
 *
 * Its own query, keyed separately from `useCostBook`, because it needs different columns
 * (`vsb_initialcontractsource` / `vsb_iseditedfrompcf`, which the grid never reads) and every
 * year of history, not just the sheet's visible range.
 */
export function useAddCostSheet(category: number) {
  const { projectId } = useSession();
  return useQuery({
    queryKey: ["add-cost-sheet", projectId, category],
    enabled: Boolean(projectId),
    retry: false,
    // The sheet is an editor: a refetch re-hydrates the grid (dropping unsaved edits) and clears the
    // Screen's retry-id cache, so after a failed save a focus or reconnect refetch would turn a safe
    // "Save again" into a silent partial save. It still loads fresh on entry and after a save.
    ...NO_FOCUS_REFETCH,
    refetchOnReconnect: false,
    // A sheet loaded while an earlier Save's deletes still run must not show (and so re-plan)
    // the rows being deleted (D51 §11.19; the `blockedByPastCosts` branch reloads in place).
    queryFn: async () => {
      const pending = pendingDeletes.snapshot();
      return excludePendingFromSheet(await costRepository().loadAddCostSheet(projectId as string, category), pending);
    },
  });
}

/**
 * Add Cost from Table's save.
 *
 * Invalidates the same keys `useCapexWrites` does — a bulk save moves the DEVEX/CAPEX grid,
 * the Summary tab's totals and the Contracts recalculation exactly like a single-line save
 * does — plus its own `add-cost-sheet` query, so re-opening the table shows the saved state
 * rather than the stale pre-save one.
 *
 * SAVED STATE AT ONCE (D51 §11.19, CA-13). The screen navigates back to DEVEX/CAPEX the moment
 * the Save resolves, and that screen rendered the cached PRE-save book until a mount refetch
 * (1–3 s) replaced it; rows deleted in the background then came back until the background
 * settled (5–20 s). So `onSuccess`, which runs before `mutateAsync` resolves:
 *  1. registers the deferred delete ids in `pendingDeletes` (every CAPEX read hides them);
 *  2. patches the cached book with what the Save applied (`applySavedSheetToBook`; the legacy
 *     path returns no `applied`, so it is only refetched);
 *  3. invalidates the DEVEX/CAPEX book and the Summary totals with `refetchType: "all"`, so the
 *     confirming read starts now, while the CAPEX screen is still unmounted, instead of on its
 *     mount (the Contracts screen's DevCo keys keep the default, see `invalidate`);
 *  4. when the background settles (success or failure), releases the ids FIRST, then invalidates
 *     again, so a row whose delete failed shows again.
 * Steps 1–2 are synchronous; the network part stays fire-and-forget (D51 §11: the Save must not
 * wait for any refetch).
 */
export function useSaveAddCostSheet(category: number) {
  const { projectId, project } = useSession();
  const client = useQueryClient();
  // Hook-level, so the closure below can still raise a toast after the screen navigated away:
  // `<AppToaster />` is mounted once by `app/Providers.tsx` and outlives every route.
  const notify = useNotify();
  const bookKey = ["cost-book", projectId, category];

  const invalidate = async () => {
    // A read of these two keys that started BEFORE this point would land a pre-save (or
    // pre-release) answer. TanStack's refetch cancels a read in flight only when the query already
    // HAS data, so a FIRST load still running would be joined, not restarted (review finding 2).
    // Cancelling first (synchronously, before the invalidations below) makes the refetch a new read.
    void client.cancelQueries({ queryKey: bookKey });
    void client.cancelQueries({ queryKey: ["capex-totals", projectId] });
    await Promise.all([
      // Not refetched here: the screen navigates away on success, so a reload of the whole sheet
      // would be thrown away. It is marked stale and reloads on the next visit (or on demand).
      client.invalidateQueries({ queryKey: ["add-cost-sheet", projectId, category], refetchType: "none" }),
      // The CAPEX keys refetch even while inactive: the DEVEX/CAPEX screen is about to mount.
      client.invalidateQueries({ queryKey: bookKey, refetchType: "all" }),
      // The period screens' book (no CAPEX lines): refetched only if one is showing.
      client.invalidateQueries({ queryKey: ["cost-book", projectId, "none"] }),
      client.invalidateQueries({ queryKey: ["capex-totals", projectId], refetchType: "all" }),
      // The Contracts screen's DevCo reads: that screen is not where the Save returns to, and
      // they do not consult `pendingDeletes`, so they keep the default (refetch only if showing;
      // otherwise on that screen's mount, after the second invalidation in the usual case).
      client.invalidateQueries({ queryKey: qk.devCoCapexContracts(projectId ?? "none") }),
      client.invalidateQueries({ queryKey: qk.devCoCapexCosts(projectId ?? "none") }),
    ]);
  };

  return useMutation({
    mutationKey: costWriteKey(projectId, "add-cost-sheet"), // CA-15
    mutationFn: (args: Omit<Parameters<
      ReturnType<typeof costRepository>["saveAddCostSheet"]
    >[0], "projectId" | "owningBusinessUnitId">) =>
      costRepository().saveAddCostSheet({
        ...args,
        projectId: projectId as string,
        owningBusinessUnitId: project?.owningBusinessUnitId,
      }),
    // Fire-and-forget: returning the promise would make `mutateAsync` (and so the Save button)
    // wait for every invalidated query to refetch before the screen may navigate.
    onSuccess: (result: SaveAddCostSheetResult | undefined) => {
      const release = result?.background
        ? pendingDeletes.add({ contractIds: result.deferredContractIds, costIds: result.deferredCostIds })
        : undefined;
      const applied = result?.applied;
      if (applied) {
        try {
          // An updater returning `undefined` (no book cached for this key) leaves the cache alone.
          client.setQueryData<CostBook>(bookKey, (book) => (book ? applySavedSheetToBook(book, applied, category) : book));
        } catch (error) {
          // The Save itself succeeded: a patch that throws must not turn it into a failure. The
          // refetch below still brings the saved state. Readable line, then the raw error (D58).
          emitSaveLog(() => bookPatchFailureReport(error));
        }
      }
      void invalidate();
      if (result?.background) {
        followBackgroundDeletes(result.background, {
          deferredContracts: result.deferredContracts ?? 0,
          deferredCosts: result.deferredCosts ?? 0,
        }, invalidate, notify, release);
      }
    },
  });
}

/**
 * The deferred deletes of a Save — contracts and cleared cells (D51 option A and its extension,
 * `DEFER_CONTRACT_DELETES` / `DEFER_COST_DELETES`). When they settle, the CAPEX queries are
 * invalidated AGAIN, so the DEVEX/CAPEX screen (usually showing by then) drops the rows its first
 * reload still saw and picks up any totals the background reconcile rewrote; each failure becomes
 * an error toast, its text chosen by `backgroundDeleteFailureTexts`. NEVER throws or rejects:
 * nothing awaits it, so a throw would be an unhandled rejection.
 *
 * `release` (D51 §11.19) un-hides the deferred ids in `pendingDeletes`. It runs BEFORE the
 * invalidation, whatever the outcome: after a failure the rows still exist and must show again.
 */
function followBackgroundDeletes(
  background: Promise<BackgroundOutcome>,
  counts: DeferredCounts,
  invalidate: () => Promise<void>,
  notify: Notify,
  release: () => void = () => undefined,
): void {
  void background
    .then((outcome) => {
      release();
      void invalidate().catch(() => undefined);
      for (const text of backgroundDeleteFailureTexts(outcome, counts)) {
        try {
          notify.error(text);
        } catch {
          // A toaster that throws must not hide the next text, nor reject.
        }
      }
    }, () => {
      // `background` never rejects; if it ever did, the ids must still be released.
      release();
      void invalidate().catch(() => undefined);
    })
    .catch(() => undefined);
}

/**
 * The DEVEX/CAPEX standard-contract catalogue for one category tab.
 *
 * Stage 2.3. `subaccountIds` scopes the assumptions query to the sub-accounts on screen — the
 * same per-category narrowing `useCostBook` already does for cost lines, for the same reason:
 * fetching the whole project's assumptions to render one tab would be the mistake Stage 1a
 * fixed elsewhere.
 */
export function useStandardAssumptions(subaccountIds: readonly string[]) {
  const { projectId, project } = useSession();
  const key = subaccountIds.join(",");
  const assumptions = useQuery({
    queryKey: ["capex-standard-assumptions", key],
    enabled: subaccountIds.length > 0,
    queryFn: () => loadStandardAssumptions(subaccountIds),
  });
  const wtgCount = useQuery({
    queryKey: ["active-wtg-count", projectId],
    enabled: Boolean(projectId),
    staleTime: 5 * 60 * 1000,
    queryFn: () => loadActiveWtgCount(projectId as string),
  });
  const extras = useProjectExtras(projectId);
  return {
    assumptions: assumptions.data ?? [],
    activeWtgCount: wtgCount.data ?? 0,
    totalCapacity: project?.totalCapacity ?? 0,
    countryId: extras.data?.countryId,
    technology: extras.data?.technology,
    isLoading: assumptions.isLoading || wtgCount.isLoading,
  };
}

/**
 * `Project States` — the ten rows the "Link to Milestone" dropdown builds its `Items` from.
 *
 * Global master data, so it is keyed on nothing and cached for the session rather than per
 * project; `loadProjectStates` already sorts by `Order`, and `milestoneOptions`
 * (`capex-costs/rules.ts`) does the 1..6 filtering the canvas' `Items` does.
 */
export function useProjectStates() {
  return useQuery({
    queryKey: ["capex-project-states"],
    staleTime: 30 * 60 * 1000,
    queryFn: () => loadProjectStates(),
  });
}

/**
 * The DEVEX/CAPEX category tab labels, live from Dataverse.
 *
 * The canvas builds the tab strip and the Summary table from
 * `SortByColumns(Filter(colCapexAccountCategoriesNew, Not(Name = "Overleveraging")), "vsb_order")`,
 * so a category an admin adds gets a tab; our hard-coded `CATEGORIES` would silently skip it.
 * `loadCapexCategories` (`data/costBook.ts`) does the filtering and the `vsb_order` sort.
 *
 * Global master data, so it is keyed on nothing and cached for the session, exactly as
 * `useProjectStates` above.
 */
export function useCapexCategories() {
  return useQuery({
    queryKey: ["capex-categories"],
    staleTime: 30 * 60 * 1000,
    queryFn: () => loadCapexCategories(),
  });
}

/**
 * The country's and technology's average cluster durations, for `synthesiseClusterDates`.
 *
 * Consumed ONLY by the standard-contract path — see the call site in `capex-costs/Screen.tsx`.
 * `undefined` (no matching assumption row, or extras not loaded) is a legitimate answer that
 * `synthesiseClusterDates` handles as the canvas' `Coalesce(…, 0)` does.
 */
export function useMilestoneDurations(
  countryId: string | undefined,
  technology: number | undefined,
) {
  return useQuery({
    queryKey: ["capex-milestone-durations", countryId ?? "none", technology ?? "none"],
    enabled: Boolean(countryId) && technology !== undefined,
    staleTime: 30 * 60 * 1000,
    queryFn: () => loadMilestoneDurations(countryId, technology),
  });
}

/**
 * The comment threads for a set of contracts.
 *
 * Stage 2.4. Scoped to \`contractIds\` for the same reason every other CAPEX query is scoped —
 * fetching the whole project's comments would be the mistake Stage 1a fixed.
 *
 * Two callers, both legitimate and both cached separately by their id list:
 *   - the comments PANEL, with the one contract it is showing;
 *   - the DEVEX/CAPEX SCREEN, with every contract in the open category, because the grid's red
 *     dots are a property of the whole category (`colCapexCommentsInSelectedContracts` — the
 *     canvas loads them in the same refresh that builds the grid, not when the panel opens).
 *
 * They share the \`["capex-comments", …]\` key PREFIX, which is what lets one panel save refresh
 * both: react-query matches invalidations by prefix.
 */
export function useCapexComments(contractIds: readonly string[]) {
  const key = [...contractIds].sort().join(",");
  return useQuery({
    queryKey: ["capex-comments", key],
    enabled: contractIds.length > 0,
    queryFn: () => loadComments(contractIds),
  });
}

export function useCommentWrites() {
  const { projectId, project } = useSession();
  const client = useQueryClient();
  /**
   * "After a comment is added/edited/resolved in the comments panel, re-run
   * `btn_Capex_Cost_Refresh_Capex_Cost_Code` so the dots refresh"
   * (`Comments_PCF_CodeSnippets.txt` NOTES 4; `CapexScreenCode.txt:10049` does exactly that).
   *
   * Invalidating the `["capex-comments"]` PREFIX is the equivalent: it refetches the panel's own
   * contract AND the screen-level category query the grid's indicators are built from. Keying
   * the invalidation to the panel's single contract — which is what this did — refreshed the
   * panel and left the dots showing the pre-save state until the next reload.
   */
  const invalidate = () => {
    void client.invalidateQueries({ queryKey: ["capex-comments"] });
    // A comment's resolved state can change the grid's red-dot flags.
    void client.invalidateQueries({ queryKey: ["cost-book", projectId] });
  };
  const mutationKey = costWriteKey(projectId, "capex-comments"); // CA-15
  const save = useMutation({
    mutationKey,
    mutationFn: (args: Omit<Parameters<typeof saveComment>[0], "owningBusinessUnitId">) =>
      saveComment({ ...args, owningBusinessUnitId: project?.owningBusinessUnitId }),
  });
  const remove = useMutation({ mutationKey, mutationFn: (id: string) => deleteComment(id) });
  return { save, remove, invalidate };
}
