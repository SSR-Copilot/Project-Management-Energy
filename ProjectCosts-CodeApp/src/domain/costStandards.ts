/**
 * Costs settings — the pure option values, labels and error types that both the screen's
 * `rules.ts` / `constants.ts` and the Dataverse module (`data/adminCost.ts`) need.
 *
 * They live here, not in the data module, so that `rules.ts` stays a pure leaf: a rule may not
 * import a VALUE from an SDK-touching data module (CONVENTIONS rule 5), while `data/*` may import
 * from `domain/*`. Nothing in this file performs I/O.
 */
import { TECHNOLOGY as SHARED_TECHNOLOGY } from "./technology";

/** `vsb_typeofcontract` (same values as `TYPE_OF_CONTRACT` in `features/periods/opexRules`). */
export const CONTRACT_TYPE = {
  landLease: 952850000,
  oAndM: 952850001,
  other: 952850002,
  devexCapex: 952850003,
} as const;
export type OpexContractType =
  | typeof CONTRACT_TYPE.landLease | typeof CONTRACT_TYPE.oAndM | typeof CONTRACT_TYPE.other;

/**
 * `vsb_technology`; the picker offers Wind and PV only. The codes come
 * from the shared `@/domain/technology`; this narrows them to the two Costs offers.
 */
export const TECHNOLOGY = { wind: SHARED_TECHNOLOGY.wind, pv: SHARED_TECHNOLOGY.pv } as const;
export type CostTechnology = typeof TECHNOLOGY.wind | typeof TECHNOLOGY.pv;
export const TECHNOLOGY_LABEL: Record<CostTechnology, "Wind" | "PV"> = {
  [TECHNOLOGY.wind]: "Wind",
  [TECHNOLOGY.pv]: "PV",
};

/** `vsb_opexlandleaseperiod`: Period n = 952849999 + n, Period 1..10 only. */
export const PERIOD_BASE = 952849999;
export const MAX_PERIOD = 10;
export const periodChoice = (n: number): number => PERIOD_BASE + n;
export function periodNumber(choice: unknown): number | undefined {
  if (typeof choice !== "number") return undefined;
  const n = choice - PERIOD_BASE;
  return n >= 1 && n <= MAX_PERIOD ? n : undefined;
}

/** `vsb_opexaggregation` (same as `AGGREGATION_VALUE` in `costBook.ts`). */
export const AGGREGATION = { sum: 952850000, max: 952850001, min: 952850002 } as const;

/** `vsb_costunit`, in the order the canvas slices it (ACS:10567-10579). */
export const COST_UNIT = {
  eur: 952850000,
  eurMw: 952850001,
  eurWtg: 952850002,
  pln: 952850003,
  plnMw: 952850004,
  plnWtg: 952850005,
} as const;

/** `vsb_costpaidtype` (None 952850000 is never offered). */
export const COST_PAID_BY = { devCo: 952850001, spv: 952850002 } as const;

/** Shown when the cost's sub-account is not in the active CAPEX hierarchy. */
export const INACTIVE_SUBACCOUNT_MESSAGE = "The sub-account of this cost is inactive; choose an active sub-account.";

/** A DEVEX write refused before it reached Dataverse (it would have written malformed names). */
export class DevexRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DevexRuleError";
  }
}

/** A save whose main row landed but whose follow-up step did not. */
export class OpexFollowUpError extends Error {
  readonly savedId: string;
  override readonly cause?: unknown;
  constructor(message: string, savedId: string, cause: unknown) {
    super(message);
    this.name = "OpexFollowUpError";
    this.savedId = savedId;
    this.cause = cause;
  }
}

/** The contract changed underneath the open panel, or a business rule refused the write. */
export class OpexRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpexRuleError";
  }
}

/** A contract delete that stopped part-way. */
export class ContractDeleteError extends Error {
  readonly deleted: number;
  readonly total: number;
  /** After the repair attempt: what is still wrong with the last-period flags (undefined = consistent). */
  readonly flagIssue: string | undefined;
  override readonly cause?: unknown;
  constructor(deleted: number, total: number, cause: unknown, flagIssue?: string) {
    super(`${deleted} of ${total} row(s) were deleted before the delete failed.`);
    this.name = "ContractDeleteError";
    this.deleted = deleted;
    this.total = total;
    this.cause = cause;
    this.flagIssue = flagIssue;
  }
}
