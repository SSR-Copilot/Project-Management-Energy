import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/app/SessionContext";
import { qk } from "@/data/keys";
import { costRepository } from "@/data/costRepository";
import { loadActiveWtgCount, loadStandardAssumptions } from "@/data/standardContracts";
import { deleteComment, loadComments, saveComment } from "@/data/comments";
import { loadMilestoneDurations, loadProjectStates } from "@/data/costBook";
import type { PeriodWriteContext, StandardContractArgs } from "@/data/periodWrites";
import type { LeaseWrite } from "@/features/periods/landLeaseRules";
import { useProjectExtras } from "@/features/contracts/hooks";
import type { CostBook, CostLine, CostPeriod } from "./model";

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
  "standard", "isStartDateStandard", "contractId", "parentId", "periodIndex",
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
    queryFn: () => costRepository().getCostBook(projectId as string, category),
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
    queryFn: () => costRepository().getCapexTotals(projectId as string),
  });
}

/**
 * The DEVEX/CAPEX screen's three writes.
 *
 * Each is its own mutation rather than a whole-book save: against Dataverse a book save would
 * mean diffing the entire project. All three invalidate the same keys, because a cost change
 * moves the grid, the Summary tab's totals and the Contracts recalculation alike.
 */
export function useCapexWrites(category?: number) {
  const { projectId, project } = useSession();
  const client = useQueryClient();

  const invalidate = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ["cost-book", projectId, category ?? "none"] }),
      client.invalidateQueries({ queryKey: ["capex-totals", projectId] }),
      client.invalidateQueries({ queryKey: qk.devCoCapexContracts(projectId ?? "none") }),
      client.invalidateQueries({ queryKey: qk.devCoCapexCosts(projectId ?? "none") }),
      // A milestone relink deletes the contract's payment-date comments (`saveCostLine`'s
      // `resetPaidAndPaymentDateComments`), which moves the grid's red dots.
      client.invalidateQueries({ queryKey: ["capex-comments"] }),
    ]);
  };

  const setPaid = useMutation({
    mutationFn: (args: { lineId: string; year: number; month: number; paid: boolean; costId?: string }) =>
      costRepository().setCostPaid(projectId as string, args),
    onSuccess: invalidate,
  });

  const saveLine = useMutation({
    mutationFn: (args: {
      line: CostLine; accountId: string; isNew: boolean;
      payments: { id?: string; year: number; month: number; amount: number | null }[];
      /** See `SaveCostLineArgs` — the relink confirmation was accepted. */
      resetPaidAndPaymentDateComments?: boolean;
    }) => costRepository().saveCostLine({
      ...args,
      projectId: projectId as string,
      owningBusinessUnitId: project?.owningBusinessUnitId,
    }),
    onSuccess: invalidate,
  });

  const deleteLine = useMutation({
    mutationFn: (line: CostLine) => costRepository().deleteCostLine(projectId as string, line),
    onSuccess: invalidate,
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
    queryFn: () => costRepository().loadAddCostSheet(projectId as string, category),
  });
}

/**
 * Add Cost from Table's save.
 *
 * Invalidates the same keys `useCapexWrites` does — a bulk save moves the DEVEX/CAPEX grid,
 * the Summary tab's totals and the Contracts recalculation exactly like a single-line save
 * does — plus its own `add-cost-sheet` query, so re-opening the table shows the saved state
 * rather than the stale pre-save one.
 */
export function useSaveAddCostSheet(category: number) {
  const { projectId, project } = useSession();
  const client = useQueryClient();

  const invalidate = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ["add-cost-sheet", projectId, category] }),
      client.invalidateQueries({ queryKey: ["cost-book", projectId, category] }),
      client.invalidateQueries({ queryKey: ["cost-book", projectId, "none"] }),
      client.invalidateQueries({ queryKey: ["capex-totals", projectId] }),
      client.invalidateQueries({ queryKey: qk.devCoCapexContracts(projectId ?? "none") }),
      client.invalidateQueries({ queryKey: qk.devCoCapexCosts(projectId ?? "none") }),
    ]);
  };

  return useMutation({
    mutationFn: (args: Omit<Parameters<
      ReturnType<typeof costRepository>["saveAddCostSheet"]
    >[0], "projectId" | "owningBusinessUnitId">) =>
      costRepository().saveAddCostSheet({
        ...args,
        projectId: projectId as string,
        owningBusinessUnitId: project?.owningBusinessUnitId,
      }),
    onSuccess: invalidate,
  });
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
  const save = useMutation({
    mutationFn: (args: Omit<Parameters<typeof saveComment>[0], "owningBusinessUnitId">) =>
      saveComment({ ...args, owningBusinessUnitId: project?.owningBusinessUnitId }),
  });
  const remove = useMutation({ mutationFn: (id: string) => deleteComment(id) });
  return { save, remove, invalidate };
}
