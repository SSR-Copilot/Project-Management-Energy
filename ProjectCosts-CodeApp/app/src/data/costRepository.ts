/**
 * The Cost module's single data boundary.
 *
 * P0 of `docs/06-DEMO-COMPLETION-PLAN.md`: before this existed the demo build was hybrid —
 * Overview, CAPEX, OPEX and Land Lease read demo storage while Contracts still called its
 * Dataverse services. That meant a demo action could write to a real environment, and it
 * meant Contracts recalculation summed an empty CAPEX array because the two halves of the app
 * did not share a cost book.
 *
 * Every Cost screen now goes through `costRepository()`. There are exactly two
 * implementations and the mode picks one:
 *
 *   demo        `src/demo/costRepository.ts` — reads and writes demo storage, NEVER Dataverse.
 *   dataverse   this file — the generated services, unchanged.
 *
 * The interface is deliberately the operations the screens already use, not a general-purpose
 * data layer. Widening it is how a boundary like this rots.
 */
import {
  listContracts, listPaymentTargets, listDevCoLinks, listCapexAccounts,
  listDevCoCapexContracts, listCapexCostRows, findBopStandardAssumption,
  saveContract, deleteContract, replaceDevCoLinks,
  savePaymentTarget, deletePaymentTarget,
  type ContractWrite, type PaymentTargetWrite,
} from "./contracts";
import type { Vsb_bopcontractsstandardassumptionses } from "@/generated/models/Vsb_bopcontractsstandardassumptionsesModel";
import type {
  AccountRow, BopContract, CapexCostRow, CapexProjectContract, ContractType, PaymentTarget,
} from "@/features/contracts/rules";
import type { CostBook } from "@/features/costing/model";
import {
  loadCapexTotals, loadCostBook, loadCountryInflationAreas, loadLandLeaseContracts,
  loadLandLeaseCostFlags,
  type CapexCategoryTotal, type LandLeaseContract, type LandLeaseCostFlags,
} from "./costBook";
import { deleteCostLine, saveCostLine, setCostPaid, type SaveCostLineArgs } from "./capexWrites";
import {
  loadAddCostSheetData, saveAddCostSheet,
  type AddCostSheetData, type SaveAddCostSheetArgs,
} from "./addCostSheet";
import {
  addStandardContract, deletePeriod, savePeriod,
  type PeriodWriteContext, type StandardContractArgs,
} from "./periodWrites";
import {
  applyLeaseWrites, loadCountryInflation, loadCurrencies, loadLeaseAssumptions, loadLeaseBook,
  loadLeaseGenerators,
  type CountryInflationRow, type CurrencyRow, type LeaseBook, type LeaseWriteResult,
} from "./landLease";
import {
  loadOpexAccounts, loadOpexAssumptionScopes, loadOpexDeviceTypes, loadOpexSubaccounts,
  type OpexAssumptionScope,
} from "./opexCatalog";
import type {
  GeneratorOption, LeaseAssumptionRow, LeaseWrite,
} from "@/features/periods/landLeaseRules";
import type {
  DeviceTypeInProject, OpexAccount, OpexSubaccount,
} from "@/features/periods/opexRules";
import type { CostLine, CostPeriod } from "@/features/costing/model";

export interface DevCoLink {
  id: string;
  accountId: string;
  contractId: string;
}

export interface StandardAssumptionQuery {
  countryId: string | undefined;
  technology: number | undefined;
  contractType: ContractType;
}

export interface ReplaceDevCoLinksArgs {
  contractId: string;
  isNewContract: boolean;
  owningBusinessUnitId?: string;
  accounts: readonly { id: string; name: string }[];
}

export interface CostRepository {
  listContracts(projectId: string): Promise<BopContract[]>;
  listPaymentTargets(projectId: string, contractIds: readonly string[]): Promise<PaymentTarget[]>;
  listDevCoLinks(projectId: string, contractIds: readonly string[]): Promise<DevCoLink[]>;
  listCapexAccounts(): Promise<AccountRow[]>;
  listDevCoCapexContracts(projectId: string): Promise<CapexProjectContract[]>;

  /**
   * The monthly DevCo CAPEX cost rows that Contracts recalculation sums.
   *
   * Returns rows for the WHOLE project; the caller narrows to the contracts under the ticked
   * level-3 accounts. Splitting it that way keeps one cached query per project instead of one
   * per account selection.
   */
  listCapexCostRows(projectId: string): Promise<CapexCostRow[]>;

  /**
   * The whole Cost book for a project — accounts, cost lines and periods.
   *
   * This is what DEVEX/CAPEX, O&M, Land Lease and Other OPEX render. Both implementations
   * return the same shape, so the screens do not know or care which one they got.
   */
  getCostBook(projectId: string, category?: number): Promise<CostBook>;

  /**
   * Per-category totals for the DEVEX/CAPEX Summary tab.
   *
   * Separate from `getCostBook` because it needs no monthly rows at all — the figure lives on
   * the contract. Folding it into the book would mean fetching the project's whole cost set to
   * render five numbers.
   */
  getCapexTotals(projectId: string): Promise<CapexCategoryTotal[]>;

  /**
   * The Land Lease `Allocation` / `OTP` flags, keyed by `vsb_landleaseprojectcostid` — the id a
   * Land Lease period's `Project Cost` lookup points at.
   *
   * Separate from `getCostBook` because Land Lease's own periods are not on the book yet (see
   * `costBook.ts`'s header); this is the join's read half, ready for whenever they are.
   */
  getLandLeaseCostFlags(projectId: string): Promise<Map<string, LandLeaseCostFlags>>;

  /**
   * Every Land Lease CONTRACT on the project — the `vsb_landleaseprojectcosts` headers.
   *
   * Separate from `getCostBook` because a header with no period rows yet is invisible in the
   * book: the periods are the book's rows, and "Add Contract Type" creates a contract before any
   * period exists under it. Measured on VSBCloud_Dev, 16 Sep, 19 of Project New Data's 27
   * headers are in exactly that state.
   */
  getLandLeaseContracts(projectId: string): Promise<LandLeaseContract[]>;

  /**
   * The `Inflation Country Area` choices for a project's country — the text values
   * `vsb_inflationcountryarea` is written from.
   */
  getCountryInflationAreas(countryId: string | undefined): Promise<string[]>;

  /* ── Land Lease ───────────────────────────────────────────────────────────
   * The Land Lease screen edits TWO tables plus an allocation join from one panel, and its
   * rules module is written against the raw rows rather than against `CostBook`'s flattened
   * `CostPeriod` — see `data/landLease.ts`' header for the three things that flattening loses.
   * These five operations are that screen's whole data surface, and they are HERE rather than in
   * the feature because this file is the Cost module's single data boundary.
   */

  /** The sub-accounts, contracts, periods and WTG allocations the Land Lease screen renders. */
  getLeaseBook(projectId: string): Promise<LeaseBook>;

  /**
   * `colGeneratorsInProject` — the WTG picker's `Items`, WTGs and PV strings alike.
   *
   * Without it `canSaveLandLease`'s PV/Wind allocation clause can only be satisfied by the
   * "allocate to all" toggle, which blocks Save on every project that allocates per WTG.
   */
  getLeaseGenerators(projectId: string): Promise<GeneratorOption[]>;

  /**
   * `Country Inflation Profiles` for a country — every year and every Area, unaggregated.
   *
   * Distinct from `getCountryInflationAreas`, which returns only the Area NAMES for the
   * dropdown: this is what the panel's read-only percentage and the standard import's
   * `Inflation Profile` resolve against (`opexRules.countryInflationPercent`).
   */
  getCountryInflation(countryId: string): Promise<CountryInflationRow[]>;

  /** `Currencies` — the panel's (disabled) currency dropdown and the grid's currency column. */
  listCurrencies(): Promise<CurrencyRow[]>;

  /** The Land Lease standard-assumption catalogue for a country and technology. */
  getLeaseAssumptions(
    countryId: string | undefined, technology: number | null | undefined,
  ): Promise<LeaseAssumptionRow[]>;

  /** Runs a `planLeaseSave` / `planLeaseDelete` / `planStandardImport` plan, in order. */
  applyLeaseWrites(writes: readonly LeaseWrite[]): Promise<LeaseWriteResult>;

  /* ── OPEX reference data ──────────────────────────────────────────────── */

  /** `colOpexAccounts` — `Sort('Opex Accounts', Order, Ascending)`. */
  listOpexAccounts(): Promise<OpexAccount[]>;

  /** `colOpexSubaccounts` — `Sort('Opex Subaccounts', Order, Ascending)`, with the account name. */
  listOpexSubaccounts(): Promise<OpexSubaccount[]>;

  /**
   * `colDeviceTypesInProject` — the O&M cards, as `[generators, pvModules]`.
   *
   * Returned as the two blocks rather than one list because `opexRules.deviceTypeList` owns the
   * canvas' ordering rule (WTGs by the GENERATOR's `Created On`, then the PV modules in their
   * natural order) and needs them apart to apply it.
   */
  listOpexDeviceTypes(
    projectId: string,
  ): Promise<Omit<DeviceTypeInProject, "kind" | "isFolded">[][]>;

  /**
   * The OPEX standard-assumption catalogue for a country and technology, both contract types.
   *
   * The card toolbar's `hasStandardAssumption` gate: `canAddStandardContract` disables the
   * command when nothing matches, instead of offering it and letting the write fail.
   */
  listOpexAssumptionScopes(
    countryId: string | undefined, technology: number | undefined,
  ): Promise<OpexAssumptionScope[]>;

  /**
   * Add Cost from Table — the category's sub-accounts, their existing contracts and every
   * cost row under those contracts (every year, not just the sheet's visible range).
   *
   * `buildInitialSheet` (in `add-costs-from-table/rules.ts`) turns this straight into the
   * sheet's starting rows.
   */
  loadAddCostSheet(projectId: string, category: number): Promise<AddCostSheetData>;

  /**
   * Writes a diffed Add Cost from Table sheet: contract upserts, cost upserts/deletes,
   * contract-total recompute, then contract deletes.
   */
  saveAddCostSheet(args: SaveAddCostSheetArgs): Promise<void>;

  /* ── targeted CAPEX writes ─────────────────────────────────────────────
   * A whole-book save cannot work against Dataverse without diffing the entire project, so
   * the screen's three mutations are their own operations. The demo implementation edits its
   * in-memory book; the Dataverse one writes rows.
   */

  /** Mark one month of one cost line paid or unpaid. */
  setCostPaid(projectId: string, args: {
    lineId: string; year: number; month: number; paid: boolean; costId?: string;
  }): Promise<void>;

  /** Create or update a cost line and reconcile its monthly rows. */
  saveCostLine(args: SaveCostLineArgs): Promise<string>;

  /** Delete a cost line and its monthly rows. */
  deleteCostLine(projectId: string, line: CostLine): Promise<void>;

  /**
   * Create or update ONE O&M / Other OPEX / Land Lease period.
   *
   * Returns the saved period with its real Dataverse id — `isNew: true` calls arrive with a
   * `crypto.randomUUID()` placeholder (`periods/Screen.tsx`'s `commit`/`addStandard`), and the
   * caller (`useCostBook`'s `save` mutation) swaps it into the book it hands back so a later
   * edit or delete in the same session addresses the real row.
   */
  savePeriod(ctx: PeriodWriteContext, period: CostPeriod, isNew: boolean): Promise<CostPeriod>;

  /**
   * Delete one period — and, when it is the FIRST period of its contract, the whole contract.
   *
   * O&M / Other OPEX: a chain head takes every period under it. Land Lease: slot 1 takes the
   * contract's WTG allocations, its periods and its header, in that order. Both are the canvas'
   * own routing; see `deleteOpexPeriod` / `deleteLandLeasePeriod`.
   */
  deletePeriod(period: CostPeriod): Promise<void>;

  /**
   * "Add Standard Contract" — seeds a whole chain from
   * `vsb_opexlandleasestandardassumptionses`, in chain order, and returns the created periods.
   *
   * Throws when the scope already has a standard contract, which is the canvas' own guard
   * (`If(CountRows(Filter(costs, project && 'Is Standard Contract?' = Yes && scope)) = 0, …)`).
   */
  addStandardContract(
    ctx: PeriodWriteContext, args: StandardContractArgs,
  ): Promise<CostPeriod[]>;

  findBopStandardAssumption(
    q: StandardAssumptionQuery,
  ): Promise<Vsb_bopcontractsstandardassumptionses | undefined>;

  /**
   * Writes take the project id explicitly, even where Dataverse does not need it.
   *
   * The demo store is keyed by project, so `deleteContract` has to know which book to delete
   * from. The alternative — a module-level "current demo project" set as a side effect of the
   * last read — is the kind of hidden state that produces a bug nobody can reproduce. The
   * Dataverse implementation simply ignores the argument.
   */
  saveContract(w: ContractWrite): Promise<BopContract>;
  deleteContract(projectId: string, id: string): Promise<void>;
  replaceDevCoLinks(projectId: string, args: ReplaceDevCoLinksArgs): Promise<void>;
  savePaymentTarget(projectId: string, w: PaymentTargetWrite): Promise<PaymentTarget>;
  deletePaymentTarget(projectId: string, id: string): Promise<void>;
}

export const dataverseCostRepository: CostRepository = {
  listContracts,
  listPaymentTargets,
  listDevCoLinks: (_projectId, contractIds) => listDevCoLinks(contractIds),
  listCapexAccounts,
  listDevCoCapexContracts,

  listCapexCostRows,
  getCostBook: loadCostBook,
  getCapexTotals: loadCapexTotals,
  getLandLeaseCostFlags: loadLandLeaseCostFlags,
  getLandLeaseContracts: loadLandLeaseContracts,
  getCountryInflationAreas: loadCountryInflationAreas,

  getLeaseBook: loadLeaseBook,
  getLeaseGenerators: loadLeaseGenerators,
  getCountryInflation: loadCountryInflation,
  listCurrencies: loadCurrencies,
  getLeaseAssumptions: loadLeaseAssumptions,
  applyLeaseWrites,

  listOpexAccounts: loadOpexAccounts,
  listOpexSubaccounts: () => loadOpexSubaccounts(),
  listOpexDeviceTypes: loadOpexDeviceTypes,
  listOpexAssumptionScopes: loadOpexAssumptionScopes,

  loadAddCostSheet: loadAddCostSheetData,
  saveAddCostSheet,

  setCostPaid: async (_projectId, args) => {
    if (!args.costId) {
      throw new Error("That month has no cost row, so it cannot be marked paid.");
    }
    await setCostPaid(args.costId, args.paid);
  },
  saveCostLine,
  deleteCostLine: async (_projectId, line) => { await deleteCostLine(line); },

  savePeriod,
  deletePeriod,
  addStandardContract,

  findBopStandardAssumption,
  saveContract,
  deleteContract: (_projectId, id) => deleteContract(id),
  replaceDevCoLinks: (_projectId, args) => replaceDevCoLinks(args),
  savePaymentTarget: (_projectId, w) => savePaymentTarget(w),
  deletePaymentTarget: (_projectId, id) => deletePaymentTarget(id),
};

/**
 * The repository.
 *
 * Still a function rather than the constant itself: it is the seam tests stub, and keeping the
 * indirection means a future second implementation (an offline fixture, a different environment)
 * does not have to touch every call site.
 */
export function costRepository(): CostRepository {
  return dataverseCostRepository;
}

/**
 * The cost rows belonging to the ticked accounts, which is what recalculation actually sums.
 *
 * `ClosingSplitArgs.costs` is documented as "CAPEX cost rows for the DevCo contracts under the
 * ticked level-3 accounts", and `recalculateForm` sums every row it is handed — so this filter
 * is load-bearing, not a convenience. Passing unfiltered rows would silently inflate both Plan
 * halves by the whole project's DevCo spend.
 */
export function costRowsForAccounts(
  costs: readonly CapexCostRow[],
  devCoContracts: readonly CapexProjectContract[],
  selectedAccountIds: readonly string[],
): CapexCostRow[] {
  if (selectedAccountIds.length === 0) return [];
  const wanted = new Set(selectedAccountIds);
  const contractIds = new Set(
    devCoContracts.filter((c) => c.accountId && wanted.has(c.accountId)).map((c) => c.id),
  );
  if (contractIds.size === 0) return [];
  return costs.filter((c) => contractIds.has(c.contractId));
}
