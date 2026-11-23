/**
 * OPT-26 / OPT-28 (B4, D160) - Land Lease `buildContracts` groups periods with a Map, and the OPEX and Land Lease panels validate
 * once per render and hand the answer to the Save gate. The replaced code is kept below as the oracle.
 */
import { describe, expect, it } from "vitest";
import {
  LAND_LEASE_AGGREGATION, LAND_LEASE_PERIOD, TECHNOLOGY, buildContracts, canSaveLandLease, leaseFieldErrors, periodNumber,
  type LandLeaseForm, type LeaseContract, type LeaseCostRow, type LeasePeriodRow,
} from "./landLeaseRules";
import {
  OPEX_AGGREGATION, canSaveOpexCost, opexFormErrors, opexNumberErrors, validateOpexNumber, type OpexForm, type OpexNumericField,
} from "./opexRules";

function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}

/** The replaced `buildContracts`: a filter + sort of every period per contract. */
function oldBuildContracts(costs: readonly LeaseCostRow[], periods: readonly LeasePeriodRow[]): LeaseContract[] {
  return costs.map((cost) => ({
    cost,
    periods: periods
      .filter((p) => p.projectCostId === cost.id)
      .sort((a, b) => periodNumber(a.period) - periodNumber(b.period)),
  }));
}

describe("OPT-26 buildContracts (differential against the replaced filter)", () => {
  it("UT-LLRULES-OPT-001 equals the per-contract filter over 400 generated books (ties, duplicate ids, orphan periods)", () => {
    const codes = Object.values(LAND_LEASE_PERIOD);
    for (let seed = 1; seed <= 400; seed++) {
      const r = rng(seed); const int = (n: number) => Math.floor(r() * n);
      const costs = Array.from({ length: int(12) }, (_, i) => ({ id: r() < 0.1 ? "dup" : `c${i}` } as LeaseCostRow));
      const periods = Array.from({ length: int(60) }, (_, i) => ({
        id: `p${i}`, projectCostId: r() < 0.1 ? null : r() < 0.1 ? "orphan" : r() < 0.1 ? "dup" : `c${int(12)}`,
        period: codes[int(codes.length)]!,
      } as LeasePeriodRow));
      const now = buildContracts(costs, periods);
      expect(now, `seed ${seed}`).toEqual(oldBuildContracts(costs, periods));
      // two contracts sharing an id must not share one periods array (the old code built one per contract)
      const dups = now.filter((c) => c.cost.id === "dup");
      if (dups.length > 1) expect(dups[0]!.periods).not.toBe(dups[1]!.periods);
    }
  });
});

const leaseForm = (over: Partial<LandLeaseForm> = {}): LandLeaseForm => ({
  description: "Owner B", startDate: "2027-01-01", durationYears: 5, durationMonths: 0, currencyId: "cur-eur",
  fixedCosts: "1000.00", percentOfRevenues: "", eurPerMwh: "", eurPerMw: "", eurPerWtg: "",
  aggregation: LAND_LEASE_AGGREGATION.sum, distributionFrequency: 12, securedChecked: false, allWtgAllocated: false,
  allocatedGeneratorIds: ["G1"], inflationChecked: false, countryInflationChecked: false, inflationStartYear: "2028",
  inflationProfile: "", inflationCountryArea: null, oneTimePaymentsOn: false,
  payments: { dueDate: "", amount: "", dueDate2: "", amount2: "", dueDate3: "", amount3: "" },
  showSecondPayment: false, showThirdPayment: false, isStartDateStandardAssumption: false, ...over,
});
const saveCtx = (form: LandLeaseForm) => ({
  form, selectedCost: { id: "cost-1" }, selectedPeriod: null, contract: null, panelState: "New" as const,
  technology: TECHNOLOGY.wind, countryName: "Germany",
});

describe("OPT-28 Land Lease Save gate reuses the field errors of the screen", () => {
  const texts = ["", "1000.00", "abc", "-1", "1e9", "12.345", " 5", "99999999999"];
  it("UT-LLRULES-OPT-002 the gate answers the same with the supplied errors as when it derives them", () => {
    const r = rng(7);
    for (let i = 0; i < 400; i++) {
      const pick = () => texts[Math.floor(r() * texts.length)]!;
      const f = leaseForm({
        description: r() < 0.3 ? "" : r() < 0.2 ? "Standard x" : "Owner", fixedCosts: pick(), percentOfRevenues: pick(),
        eurPerMwh: pick(), eurPerMw: pick(), eurPerWtg: pick(),
      });
      const errors = leaseFieldErrors(f);
      expect(canSaveLandLease({ ...saveCtx(f), errors }), `case ${i}`).toBe(canSaveLandLease(saveCtx(f)));
    }
  });

  it("UT-LLRULES-OPT-003 the supplied errors are the ones used (no second leaseFieldErrors pass)", () => {
    const valid = leaseForm();
    expect(canSaveLandLease(saveCtx(valid))).toBe(true);
    // A poisoned map flips the answer: proof the gate reads the caller errors instead of deriving its own.
    expect(canSaveLandLease({ ...saveCtx(valid), errors: { fixedCosts: "poison" } })).toBe(false);
    const invalid = leaseForm({ fixedCosts: "abc" });
    expect(canSaveLandLease(saveCtx(invalid))).toBe(false);
    expect(canSaveLandLease({ ...saveCtx(invalid), errors: {} })).toBe(true);
  });
});

const opexForm = (o: Partial<OpexForm> = {}): OpexForm => ({
  description: "Service", startDate: "2027-01-01", durationYears: 5, durationMonths: 0, currencyId: "eur",
  aggregation: OPEX_AGGREGATION.sum, distributionFrequency: 12, fixCosts: "1000.00", percentOfRevenues: "", eurPerMwh: "",
  eurPerMw: "", eurPerWtg: "", thresholdOn: false, thresholdType: null, thresholdIndividual: "", inflationOn: false,
  useCountryInflationProfile: false, inflationStartYear: "", inflationProfile: "", inflationCountryArea: null,
  alignWithProjectDuration: true, externalContract: true, ...o,
});

describe("OPT-28 OPEX panel validates the numeric boxes once", () => {
  const texts = ["", "1000.00", "abc", "-1", "12.345", " 5", "100", "100.1", "10000.5", "9999999999"];
  const gateCtx = { selected: null, costsInScope: [], countryName: "Germany" };
  it("UT-OPEX-OPT-007 errors and Save gate are identical with and without the shared pass, over 600 generated forms", () => {
    const r = rng(11);
    const pick = () => texts[Math.floor(r() * texts.length)]!;
    const fields: OpexNumericField[] = ["fixCosts", "percentOfRevenues", "eurPerMwh", "eurPerMw", "eurPerWtg"];
    let blocked = 0, passed = 0;
    for (let i = 0; i < 600; i++) {
      const f = opexForm({
        fixCosts: pick(), percentOfRevenues: pick(), eurPerMwh: pick(), eurPerMw: pick(), eurPerWtg: pick(),
        thresholdOn: r() < 0.4, thresholdType: r() < 0.5 ? 952850001 : null, thresholdIndividual: pick(),
        inflationOn: r() < 0.5, inflationStartYear: r() < 0.5 ? "2028" : pick(), inflationProfile: pick(),
        useCountryInflationProfile: r() < 0.3,
      });
      const shared = { ...gateCtx, numberErrors: opexNumberErrors(f) };
      expect(opexFormErrors(f, shared), `errors ${i}`).toEqual(opexFormErrors(f, gateCtx));
      const saved = canSaveOpexCost(f, shared);
      expect(saved, `gate ${i}`).toBe(canSaveOpexCost(f, gateCtx));
      // independent oracle for the numeric part: the replaced code own check
      const numericBlocks = [...fields, "thresholdIndividual" as const].some((k) => validateOpexNumber(k, f[k]) !== null);
      if (numericBlocks) { expect(saved).toBe(false); blocked++; } else passed++;
      // the error list names exactly the boxes the replaced code named
      const named = opexFormErrors(f, shared).filter((e) => fields.includes(e.field as OpexNumericField)).map((e) => e.field);
      expect(named).toEqual(fields.filter((k) => validateOpexNumber(k, f[k]) !== null));
    }
    expect(blocked).toBeGreaterThan(50);
    expect(passed).toBeGreaterThan(5);
  });

  it("UT-OPEX-OPT-008 the supplied numeric errors are the ones used (no second validation pass)", () => {
    const f = opexForm();
    const clean = opexNumberErrors(f);
    expect(canSaveOpexCost(f, { ...gateCtx, numberErrors: clean })).toBe(true);
    expect(canSaveOpexCost(f, { ...gateCtx, numberErrors: { ...clean, fixCosts: "poison" } })).toBe(false);
    expect(opexFormErrors(f, { ...gateCtx, numberErrors: { ...clean, fixCosts: "poison" } }))
      .toEqual([{ field: "fixCosts", message: "poison" }]);
  });
});
