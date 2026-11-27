import { useMemo } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useSession } from "@/app/SessionContext";
import { qk } from "@/data/keys";
import { costRepository } from "@/data/costRepository";
import { COST_REFRESH_ON_FAILURE, LEASE_LEAN_RELOAD } from "@/data/leaseOpexFlags";
import { loadActiveWtgCount, loadStandardAssumptions } from "@/data/standardContracts";
import { CAPEX_OPT } from "@/data/capexOptFlags";
import { isPerWtgUnit } from "@/features/cost/capex-costs/standardContracts";
import { deleteComment, loadComments, saveComment } from "@/data/comments";
import { standardContractExists } from "@/data/costBook";
import { loadMilestoneDurations } from "@/data/milestoneDurations";
import { costStates, projectStatesQueryOptions } from "@/data/projectStates";
import type { CostBookScope } from "@/data/costBook";
import type { PeriodWriteContext, StandardContractArgs } from "@/data/periodWrites";
import { LeaseStepsError, type LeaseWrite } from "@/features/cost/periods/landLeaseRules";
import type { OpexAccount, OpexSubaccount } from "@/features/cost/periods/opexRules";
import { useProjectExtras } from "@/features/cost/contracts/hooks";
import { useNotify, type Notify } from "@/components/useNotify";
import {
  backgroundDeleteFailureTexts, bookPatchFailureReport, type DeferredCounts, type SaveAddCostSheetResult,
} from "@/data/addCostSheet";
import { emitSaveLog } from "@/data/saveLog";
import type { BackgroundOutcome } from "@/data/addCostSheetBulk";
import { pendingDeletes } from "@/data/pendingDeletes";
import type { CostBook, CostLine, CostPeriod, Payment } from "./model";
import { panelBusyLogLine, type PanelSaveWritten } from "@/data/capexWrites";
import { logAction } from "@/platform/requestLog";
import { applySavedSheetToBook } from "./savedSheetPatch";
import { patchBookDeleted, patchBookPaid, patchBookSaved } from "./capexBookPatch";
import { addCostSaveTimeline } from "./saveTimeline";
import { beginBackgroundSave, type BackgroundSaveHandle } from "./backgroundSave";
import { costWriteKey } from "@/domain/writeGuard";
import {
  addCostSheetQueryOptions, capexCategoriesQueryOptions, capexCommentsKey, capexTotalsQueryOptions, costBookQueryOptions,
  countryInflationQueryOptions, currenciesQueryOptions, leaseAssumptionsQueryOptions, leaseBookKey, leaseBookQueryOptions,
  leaseGeneratorsQueryOptions, opexAccountsOptions, opexSubaccountsOptions,
} from "./costQueries";
import { COMMENTS_KEY, capexWriteInvalidations, savedMonthsDeleteRows, type CapexWriteJob } from "./capexInvalidation";

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
 * @param options.everyVisit re-read the book every time the screen opens, whatever its age (OPEX, D123:
 *   `OnVisible` runs `ClearCollect(colOpexProjectCosts, …)` on every visit; the app-wide 30 s cache showed
 *   the rows of the previous visit). Off by default, so the other Cost screens are unchanged.
 * @param options.scope `"opex"` (B2, OPT-04): the OPEX screen's book, which reads only the O&M / Other OPEX periods: no chart
 *   of accounts and no Land Lease book (see `CostBookScope`). Omitted = the full book, as before. The scoped book has its own
 *   query key, `["cost-book", project, "none", "opex"]`, which every existing `["cost-book", project, "none"]` invalidation
 *   still matches by prefix.
 */
export function useCostBook(category?: number, options?: { everyVisit?: boolean; scope?: CostBookScope }) {
  const { projectId, project } = useSession();
  const queryClient = useQueryClient();
  // T-C01: the key, the function and the freshness are `costQueries.ts`' (one definition with the boot prefetch).
  const costBookOptions = costBookQueryOptions(queryClient, projectId, category, options);
  const queryKey = costBookOptions.queryKey;
  const query = useQuery({ ...costBookOptions, enabled: Boolean(projectId) });
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
    mutationFn: async (nextBook: CostBook): Promise<{ book: CostBook; touchedPeriods: boolean; warnings: string[] }> => {
      if (!projectId) throw new Error("No project is selected.");
      const previous = query.data;
      if (!previous) throw new Error("The Cost book has not finished loading yet.");

      const ctx = periodWriteContext(projectId, project, queryClient);
      const prevById = new Map(previous.periods.map((p) => [p.id, p]));
      const nextById = new Map(nextBook.periods.map((p) => [p.id, p]));
      // Keyed by the id the book came in with, because a create's id changes underneath us.
      const savedByKey = new Map<string, CostPeriod>();
      let touchedPeriods = false;
      const warnings: string[] = [];

      for (const [id, period] of nextById) {
        const before = prevById.get(id);
        if (!before) {
          savedByKey.set(id, await costRepository().savePeriod(ctx, period, true));
          touchedPeriods = true;
        } else if (!periodsEqual(before, period)) {
          // OPEX only reads `extras` (the re-chain of the following periods and the non-fatal
          // child / re-chain `Notify` texts); Land Lease ignores it.
          savedByKey.set(id, await costRepository().savePeriod(
            ctx, period, false, { before, bookPeriods: previous.periods, warnings },
          ));
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
      return { book: { ...nextBook, periods }, touchedPeriods, warnings };
    },
    onSuccess: ({ book, touchedPeriods }) => {
      queryClient.setQueryData(queryKey, book);
      // Only a real period write needs reconciling against the server (ids, Land Lease's
      // Allocation/OTP flags); an extraGroups-only save has nothing further to fetch, and
      // invalidating it would just fetch back the pre-save state — see the doc comment above.
      if (touchedPeriods) {
        void queryClient.invalidateQueries({ queryKey });
      }
    },
    // dvopt CB-02 (`COST_REFRESH_ON_FAILURE`): a save is several requests (the row, the cascade, the re-chain, the delete of a chain). One that
    // fails part-way has still written the ones before it, and the cached book would not show them, so a retry (re-adding the period)
    // ran from stale data and created a duplicate. Refresh on failure too; nothing is patched into the cache (only success knows the book).
    onError: () => {
      if (COST_REFRESH_ON_FAILURE) void queryClient.invalidateQueries({ queryKey });
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
  queryClient: QueryClient,
): PeriodWriteContext {
  // OPT-11 (B3): the OPEX accounts and sub-accounts the screen already holds (`useOpexCatalog`, cached 30 minutes), so a save or an
  // import does not read the same two tables again. Only when BOTH are cached; otherwise the write layer reads them as before.
  const accounts = queryClient.getQueryData<OpexAccount[]>(["opex-accounts"]);
  const subaccounts = queryClient.getQueryData<OpexSubaccount[]>(["opex-subaccounts"]);
  return {
    projectId,
    owningBusinessUnitId: project?.owningBusinessUnitId,
    projectName: project?.projectName,
    ...(accounts && subaccounts ? { opexCatalog: { accounts, subaccounts } } : {}),
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
      return costRepository().addStandardContract(periodWriteContext(projectId, project, queryClient), args);
    },
    onSuccess: (_created, args) => {
      void queryClient.invalidateQueries({ queryKey: ["cost-book", projectId, "none"] });
      // The O&M import ends with `Refresh(DeviceTypesInProjects)` and rebuilds `colDeviceTypesInProject`
      // (`:3327-3407`), so the device cards are re-read as well (D123). B2 (OPT-26): only O&M reads them; an Other OPEX or Land
      // Lease import leaves the device cards alone.
      if (args.mode === "om") {
        void queryClient.invalidateQueries({ queryKey: ["opex-device-types", projectId ?? "none"] });
      }
    },
    // dvopt CB-02 (`COST_REFRESH_ON_FAILURE`): an import is a chain of creates; one that fails part-way leaves the rows before it, and the
    // cached book (and so the next click) must see them. Same keys as success.
    onError: (_error, args) => {
      if (!COST_REFRESH_ON_FAILURE) return;
      void queryClient.invalidateQueries({ queryKey: ["cost-book", projectId, "none"] });
      if (args.mode === "om") {
        void queryClient.invalidateQueries({ queryKey: ["opex-device-types", projectId ?? "none"] });
      }
    },
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
export { leaseBookKey };

export function useLeaseBook(projectId: string | undefined) {
  return useQuery({ ...leaseBookQueryOptions(projectId), enabled: Boolean(projectId) });
}

/**
 * What a Land Lease write refreshes. dvopt CB-15 (`LEASE_LEAN_RELOAD`): only the Land Lease book. The shared `["cost-book", p, "none"]` entry is
 * left alone: since B2 (OPT-04) nothing reads Land Lease periods from it (the OPEX book is scoped to OPEX rows, the CAPEX books are keyed
 * by category), so the invalidation only marked the OPEX screen's cached book stale, which that screen re-reads on every visit anyway
 * (`everyVisit`). The lease book's own reload no longer re-reads the nine sub-account rows (`loadLeaseBook`). Off: both books, as before.
 */
async function refreshLeaseBooks(client: QueryClient, projectId: string | undefined): Promise<void> {
  await Promise.all([
    client.invalidateQueries({ queryKey: leaseBookKey(projectId) }),
    ...(LEASE_LEAN_RELOAD ? [] : [client.invalidateQueries({ queryKey: ["cost-book", projectId, "none"] })]),
  ]);
}

export function useLeaseGenerators(projectId: string | undefined) {
  return useQuery({ ...leaseGeneratorsQueryOptions(projectId), enabled: Boolean(projectId) });
}

export function useCurrencies() {
  return useQuery(currenciesQueryOptions());
}

/**
 * `Country Inflation Profiles` for the project's country — every year and every Area.
 *
 * Shared by BOTH period screens: Land Lease resolves its read-only percentage and its standard
 * import from it, and OPEX does the same through `opexRules.countryInflationPercent`. Reference
 * data, so it is keyed on the country alone and cached for half an hour.
 */
export function useCountryInflation(countryId: string | undefined) {
  return useQuery({ ...countryInflationQueryOptions(countryId), enabled: Boolean(countryId) });
}

export function useLeaseAssumptions(
  countryId: string | undefined,
  technology: number | null | undefined,
) {
  return useQuery({
    ...leaseAssumptionsQueryOptions(countryId, technology),
    enabled: Boolean(countryId) && technology !== null && technology !== undefined,
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
    // `{ writes, independentSteps }` is the Save of the panel (FT-BR-LEASE-089: header, allocation
    // and period run independently, as the canvas' two `IfError` blocks do).
    mutationFn: (input: readonly LeaseWrite[] | { writes: readonly LeaseWrite[]; independentSteps: true }) =>
      "writes" in input
        ? costRepository().applyLeaseWrites(input.writes, { independentSteps: input.independentSteps })
        : costRepository().applyLeaseWrites(input),
    onSuccess: async () => {
      await refreshLeaseBooks(client, projectId);
    },
    // A partly failed save has still written the steps that passed (the canvas reloads either way).
    // dvopt CB-02 (`COST_REFRESH_ON_FAILURE`): ANY failure refreshes, not only a `LeaseStepsError`. A delete or an import is not run with
    // `independentSteps`, so its failure is a plain error, yet the writes before the failed one have landed (an import's header, a
    // delete's allocations). The stale book then let a second import create a second standard header and made a retried delete
    // start at a row that was already gone.
    onError: async (error) => {
      if (!COST_REFRESH_ON_FAILURE && !(error instanceof LeaseStepsError)) return;
      await refreshLeaseBooks(client, projectId);
    },
  });
}

/* ══════════════════════════════════════════════════ OPEX reference data ══ */

export function useOpexCatalog() {
  const queryClient = useQueryClient();
  const accounts = useQuery(opexAccountsOptions);
  const subaccounts = useQuery(opexSubaccountsOptions(queryClient));
  return {
    accounts: accounts.data ?? [],
    subaccounts: subaccounts.data ?? [],
    isLoading: accounts.isLoading || subaccounts.isLoading,
  };
}

/**
 * `colDeviceTypesInProject` — `[generators, pvModules]`, for `deviceTypeList` to order.
 *
 * Re-read on every visit (D123): `OnVisible` rebuilds the collection each time (`:76-117`), and the empty-state
 * text tells the user to "add a generator and refresh this page". The 5-minute cache kept a generator added on the
 * Generators screen off the O&M view; it now only spares a re-read on window focus.
 */
export function useOpexDeviceTypes(projectId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ["opex-device-types", projectId ?? "none"] as const,
    // B2 (OPT-26): only the O&M cards read the device types, so Other OPEX passes `enabled = false` and skips 4-5 requests.
    enabled: Boolean(projectId) && enabled,
    staleTime: 5 * 60 * 1000,
    refetchOnMount: "always",
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
  return useQuery({ ...capexTotalsQueryOptions(projectId), enabled: enabled && Boolean(projectId) });
}

/** CA-05: what each panel save wrote, handed from `mutationFn` to `onSuccess` by the mutation's variables object. */
const panelWritten = new WeakMap<object, PanelSaveWritten>();

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
   * `writtenOn` is the category the write was MADE on, captured in `onMutate` (D58). TanStack
   * pushes every render's options into a pending mutation, so reading the render-time `category`
   * here refreshed the tab the user had since switched TO, and left the one written on stale.
   */
  const invalidate = async (writtenOn: number | undefined, job: CapexWriteJob = "failed", skipBook = false) => {
    // B2 (OPT-12): each job refreshes exactly the reads that show what it wrote (`capexInvalidation.ts`). The default is the
    // full set, for a write that failed part-way. `skipBook` (CA-05): the cached book was patched instead, so only the other reads
    // are refreshed.
    await Promise.all(
      capexWriteInvalidations(projectId, writtenOn, job)
        .filter((queryKey) => !(skipBook && queryKey[0] === "cost-book"))
        .map((queryKey) => client.invalidateQueries({ queryKey })),
    );
  };

  /**
   * CA-05 (`CAPEX_PATCH_BOOK`): writes the change into the cached category book instead of reloading it. True when the book was
   * patched (the reload is then skipped); false when the switch is off, no book is cached for that tab, or `patch` returned
   * `null` (equality with a reload not provable, `capexBookPatch.ts`): the caller reloads, exactly as before. A read of that
   * book still in flight would land a pre-write answer over the patch, so it is cancelled first. Never throws.
   */
  const patchBook = async (writtenOn: number | undefined, patch: (book: CostBook) => CostBook | null): Promise<boolean> => {
    if (!CAPEX_OPT.CAPEX_PATCH_BOOK || writtenOn === undefined || writtenOn < 0) return false;
    const key = ["cost-book", projectId, writtenOn];
    try {
      if (client.isFetching({ queryKey: key, exact: true }) > 0) await client.cancelQueries({ queryKey: key, exact: true });
      let patched = false;
      client.setQueryData<CostBook>(key, (book) => {
        if (!book) return book;
        const next = patch(book);
        if (!next) return book;
        patched = true;
        return next;
      });
      return patched;
    } catch {
      return false;
    }
  };

  /** Runs at mutate time, from that render's options: the category the write is made on. */
  const writtenOn = () => ({ category });

  /** CA-15: every CAPEX write carries the project's Cost write key (`useCostWriteInFlight`). */
  const mutationKey = costWriteKey(projectId, "capex");

  const setPaid = useMutation({
    mutationKey,
    onMutate: writtenOn,
    mutationFn: (args: {
      lineId: string; year: number; month: number; paid: boolean; costId?: string; clearLinkedCluster?: boolean;
    }) => costRepository().setCostPaid(projectId as string, args),
    // B2 (OPT-12): a paid flag (and a cluster-link clear) is shown by the cost book alone; the totals, the DevCo reads and the
    // comment threads read neither, so they are no longer reloaded (and the spinner no longer waits for them).
    // CA-05: the book itself is patched from the flag just written (`patchBookPaid`); it is reloaded only when that cannot be done.
    onSuccess: async (_data, args, context) => {
      const costId = args.costId;
      if (costId && await patchBook(context.category, (book) => patchBookPaid(book, {
        lineId: args.lineId, costId, paid: args.paid, clearLinkedCluster: args.clearLinkedCluster,
      }))) return;
      await invalidate(context.category, "paid");
    },
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
      /** See `SaveCostLineArgs` — the contract as the panel opened it (CA-12). */
      storedLine?: CostLine;
    }) => costRepository().saveCostLine({
      ...args,
      projectId: projectId as string,
      owningBusinessUnitId: project?.owningBusinessUnitId,
      // CA-05: what the bulk save wrote, for `patchBookSaved` below (the per-row path reports nothing, so it reloads).
      ...(CAPEX_OPT.CAPEX_PATCH_BOOK ? { onWritten: (written: PanelSaveWritten) => { panelWritten.set(args, written); } } : {}),
    }),
    /*
     * Still AWAITED (D56 §5): the canvas lowers its spinner only after
     * `Select(btn_Capex_Cost_Reload_PCF_After_Mutation_Code)` has reloaded the grid
     * (`CapexScreenCode.txt:17413`), and without a book patch a fire-and-forget refetch would show
     * the pre-save grid for a moment. The line below measures what that wait costs.
     */
    onSuccess: async (_id, args, context) => {
      const writesDone = performance.now();
      // B2 (OPT-12): a save writes the contract and its month rows, never a comment (D90). The threads are re-read only when
      // the save deleted a month row, which a payment-date comment may point at.
      const writtenOn = context ? context.category : category;
      const job = savedMonthsDeleteRows(args.payments) ? "save-deleted" : "save";
      // CA-05: patch the cached book from what the save wrote; the totals / DevCo / comment reads are refreshed as before.
      const written = panelWritten.get(args);
      panelWritten.delete(args);
      const patched = written !== undefined && await patchBook(writtenOn, (book) => patchBookSaved(book, {
        line: args.line, accountId: args.accountId, isNew: args.isNew, written,
      }, writtenOn as number));
      await invalidate(writtenOn, job, patched);
      logAction(panelBusyLogLine(writesDone - (context?.startedAt ?? writesDone), performance.now() - writesDone));
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
    // The click time, for the delete busy line (D59), and the category the delete is made on
    // (D58, see `invalidate`); the refetch is awaited exactly as before.
    onMutate: () => ({ startedAt: performance.now(), ...writtenOn() }),
    mutationFn: (line: CostLine) => costRepository().deleteCostLine(projectId as string, line),
    onSuccess: async (_data, line, context) => {
      const deletesDone = performance.now();
      const writtenOn = context ? context.category : category;
      // CA-05: the deleted line leaves the cached book; the comment threads, totals and DevCo reads are refreshed as before.
      const patched = await patchBook(writtenOn, (book) => patchBookDeleted(book, line.id));
      await invalidate(writtenOn, "delete", patched);
      logAction(panelBusyLogLine(
        deletesDone - (context?.startedAt ?? deletesDone), performance.now() - deletesDone, "delete",
      ));
    },
    onError: (error) => reportError(error),
  });

  /** The live duplicate check of a standard contract, before it is created (CAPEX-135, D90). */
  const standardExists = (accountId: string, assumptionId: string) =>
    standardContractExists(projectId as string, accountId, assumptionId);

  return { setPaid, saveLine, deleteLine, standardExists };
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
  return useQuery({ ...addCostSheetQueryOptions(projectId, category), enabled: Boolean(projectId) });
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
 *  3. invalidates the DEVEX/CAPEX book with `refetchType: "all"`, so the confirming read starts now,
 *     while the CAPEX screen is still unmounted, instead of on its mount, and the Summary totals with
 *     `"active"` (CA-06, dvopt: they are not displayed where the Save returns; `"all"` with
 *     `ADDCOST_LEAN_REFRESH` off). The Contracts screen's DevCo keys keep the default, see `invalidate`;
 *  4. when the background settles (success or failure), releases the ids FIRST, then invalidates
 *     again, so a row whose delete failed shows again.
 * Steps 1–2 are synchronous; the network part stays fire-and-forget (D51 §11: the Save must not
 * wait for any refetch).
 *
 * BACKGROUND SAVE (WS-F, `BACKGROUND_SAVE`, OFF; a `DIVERGENCE`, see `./backgroundSave`). A Save
 * sent with `background: true` has already left the sheet. Every callback here is a HOOK-level
 * option, which TanStack keeps running after the screen unmounts, so this is where it is finished:
 * `onMutate` raises the status, takes the unload guard and registers the Save (`beginBackgroundSave`);
 * `onSuccess` patches and invalidates exactly as above; `onSettled` refetches on a failure (nothing
 * was patched, and part of the Save may have landed), re-reads a sheet opened meanwhile, and settles
 * the handle. The CA-15 lock is the mutation itself: it stays pending, under its `costWriteKey`,
 * until `onSettled` has run. A Save without `background` takes none of these branches.
 */
export function useSaveAddCostSheet(category: number) {
  const { projectId, project } = useSession();
  const client = useQueryClient();
  // Hook-level, so the closure below can still raise a toast after the screen navigated away:
  // `<AppToaster />` is mounted once by `app/Providers.tsx` and outlives every route.
  const notify = useNotify();
  const bookKey = ["cost-book", projectId, category];
  const sheetKey = ["add-cost-sheet", projectId, category];

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
      client.invalidateQueries({ queryKey: sheetKey, refetchType: "none" }),
      // The CAPEX keys refetch even while inactive: the DEVEX/CAPEX screen is about to mount.
      client.invalidateQueries({ queryKey: bookKey, refetchType: "all" }),
      // The period screens' book (no CAPEX lines): refetched only if one is showing.
      client.invalidateQueries({ queryKey: ["cost-book", projectId, "none"] }),
      // CA-06 (`ADDCOST_LEAN_REFRESH`): the Summary totals are not displayed where the Save returns (a category tab), yet `"all"`
      // re-read every contract and cost row of the project, twice (here and again after the deferred deletes). `"active"` marks
      // the entry stale and refetches it only while a Summary tab is mounted, which is also the only time the second call can
      // matter; otherwise the next visit reads once. Off: `"all"`, as before.
      client.invalidateQueries({ queryKey: ["capex-totals", projectId], refetchType: CAPEX_OPT.ADDCOST_LEAN_REFRESH ? "active" : "all" }),
      // The Contracts screen's DevCo reads: that screen is not where the Save returns to, and
      // they do not consult `pendingDeletes`, so they keep the default (refetch only if showing;
      // otherwise on that screen's mount, after the second invalidation in the usual case).
      client.invalidateQueries({ queryKey: qk.devCoCapexContracts(projectId ?? "none") }),
      client.invalidateQueries({ queryKey: qk.devCoCapexCosts(projectId ?? "none") }),
    ]);
  };

  return useMutation({
    mutationKey: costWriteKey(projectId, "add-cost-sheet"), // CA-15
    // WS-F: only a background Save gets a handle; any other Save returns `undefined`, as with no
    // `onMutate` at all (TanStack awaits this either way, so the first request is not delayed).
    onMutate: (args: SaveAddCostSheetVariables): BackgroundSaveHandle | undefined =>
      (args.background && projectId ? beginBackgroundSave(projectId, { notify }) : undefined),
    mutationFn: ({ background: _background, ...args }: SaveAddCostSheetVariables) =>
      costRepository().saveAddCostSheet({
        ...args,
        projectId: projectId as string,
        owningBusinessUnitId: project?.owningBusinessUnitId,
      }),
    // Fire-and-forget: returning the promise would make `mutateAsync` (and so the Save button)
    // wait for every invalidated query to refetch before the screen may navigate.
    onSuccess: (result: SaveAddCostSheetResult | undefined) => {
      // P0.1 (measurement only): when the data layer resolved, and what this synchronous part costs.
      const startedAt = performance.now();
      addCostSaveTimeline.mark("resolved", startedAt);
      const release = result?.background
        ? pendingDeletes.add({ contractIds: result.deferredContractIds, costIds: result.deferredCostIds })
        : undefined;
      const applied = result?.applied;
      if (applied) {
        const patchStarted = performance.now();
        try {
          // An updater returning `undefined` (no book cached for this key) leaves the cache alone.
          client.setQueryData<CostBook>(bookKey, (book) => (book ? applySavedSheetToBook(book, applied, category) : book));
        } catch (error) {
          // The Save itself succeeded: a patch that throws must not turn it into a failure. The
          // refetch below still brings the saved state. Readable line, then the raw error (D59).
          emitSaveLog(() => bookPatchFailureReport(error));
        }
        addCostSaveTimeline.measure("patchMs", performance.now() - patchStarted);
      }
      void invalidate();
      if (result?.background) {
        followBackgroundDeletes(result.background, {
          deferredContracts: result.deferredContracts ?? 0,
          deferredCosts: result.deferredCosts ?? 0,
        }, invalidate, notify, release);
      }
      addCostSaveTimeline.measure("onSuccessMs", performance.now() - startedAt);
    },
    // WS-F, a background Save only (`context` is its handle); synchronous, nothing awaits a refetch.
    onSettled: (_result, error, _args, context) => {
      if (!context) return;
      try {
        // A failure: nothing was patched and part of the Save may have landed, so the DEVEX/CAPEX
        // book, the totals and the DevCo reads are read again, to show what Dataverse holds.
        if (error) void invalidate().catch(() => undefined);
        // A sheet opened while this ran (it is locked) is re-read now; a closed one reads on open.
        void client.invalidateQueries({ queryKey: sheetKey, refetchType: "active" }).catch(() => undefined);
      } finally {
        context.settle(error ? "failed" : "saved");
      }
    },
  });
}

/** What the screen passes to `useSaveAddCostSheet`'s `mutateAsync`. */
type SaveAddCostSheetVariables = Omit<Parameters<
  ReturnType<typeof costRepository>["saveAddCostSheet"]
>[0], "projectId" | "owningBusinessUnitId"> & {
  /**
   * WS-F: the screen has already left the sheet (`BACKGROUND_SAVE`). Never sent to the data layer;
   * the screen leaves it out entirely when the flag is off.
   */
  background?: boolean;
};

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
    // D159: master data an administrator maintains on the Settings screens, so it is not re-read on every return to the tab
    // (the app default is a 30 s stale time and a refetch on window focus); the sibling reference reads here already do this.
    staleTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
  // CA-16 (`WTG_COUNT_STANDARD_ONLY`): the count is only the multiplier of a per-WTG standard contract, so it is read only when
  // this category offers one (`ensureActiveWtgCount` below covers a click that comes before the read has landed). Off: read on
  // every CAPEX tab visit, as before.
  const needsWtgCount = !CAPEX_OPT.WTG_COUNT_STANDARD_ONLY || (assumptions.data ?? []).some((a) => isPerWtgUnit(a.unit));
  const wtgCountOptions = {
    queryKey: ["active-wtg-count", projectId] as const,
    staleTime: 5 * 60 * 1000,
    queryFn: () => loadActiveWtgCount(projectId as string),
  };
  const wtgCount = useQuery({ ...wtgCountOptions, enabled: Boolean(projectId) && needsWtgCount });
  const queryClient = useQueryClient();
  const extras = useProjectExtras(projectId);
  return {
    assumptions: assumptions.data ?? [],
    activeWtgCount: wtgCount.data ?? 0,
    /** CA-16: false until the (lazily enabled) count has landed; a per-WTG amount must not be computed before. */
    activeWtgCountReady: wtgCount.data !== undefined,
    /** CA-16: the count now, from the cache or one read (a click that beat the lazy read). */
    ensureActiveWtgCount: (): Promise<number> => queryClient.ensureQueryData(wtgCountOptions),
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
 * project. D159: it is the one shared `Project States` cache entry (`data/projectStates.ts`), viewed as the active states in
 * `Order` (`costStates`), so opening a Cost screen after another screen reads nothing; `milestoneOptions`
 * (`capex-costs/rules.ts`) does the 1..6 filtering the canvas' `Items` does.
 */
export function useProjectStates() {
  return useQuery({ ...projectStatesQueryOptions(), select: costStates });
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
  return useQuery(capexCategoriesQueryOptions());
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

export { capexCommentsKey };

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
export function useCapexComments(contractIds: readonly string[], options: { keepPrevious?: boolean } = {}) {
  // B2 (OPT-25): the key (a sorted, joined id list; about 20 KB at 500+ contracts) is rebuilt when the id list changes, not on
  // every render. The CAPEX screen memoises its list on the book, so that is once per book; the panel passes one id.
  const key = useMemo(() => capexCommentsKey(contractIds), [contractIds]);
  return useQuery({
    queryKey: ["capex-comments", key],
    enabled: contractIds.length > 0,
    queryFn: () => loadComments(contractIds),
    // SCC-16 / T-E06, OPT-IN (the grid's dots only): a new id list (a contract added or deleted, another category) is a new key with no
    // data, so the dots went away until its read landed. The previous key's threads stay until then: the dots are filtered through the
    // book's own payments (`commentCosts`), so a thread of another contract matches no payment. The panel (one contract) does NOT opt
    // in: contract B must never show contract A's thread while loading.
    ...(options.keepPrevious === true ? { placeholderData: keepPreviousData } : {}),
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
    // B2 (OPT-12): a comment save or delete writes only `vsb_capexcomments`. The dots and threads are built from this query
    // (`gridCommentIndicators(commentThreads(comments), commentCosts(book.lines))`); the cost book has no comment field
    // (`CostLine.comments` is always `[]`), so it is no longer reloaded (it was: accounts, payer defaults, contracts, payments).
    void client.invalidateQueries({ queryKey: COMMENTS_KEY });
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
