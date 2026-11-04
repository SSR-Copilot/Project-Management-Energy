/// <reference types="node" />
/**
 * Land Lease: the Canvas recordings replayed through the rules (D80, the "rules" layer of the parity harness).
 *
 * THE PATTERN (copy it for another screen):
 *   1. The Playwright harness records what the CANVAS showed into `e2e/reference/<screen>.*.canvas.json`.
 *      Those files are the reference; this test only reads them (`node:fs`, as `styles/pcfCascade.test.ts` does).
 *   2. For validation, each group is replayed exactly as the browser test typed it: the group's baseline once,
 *      then every input IN ORDER into one field, each on top of the state the previous one left. The order
 *      matters (V4, D79 §3: a Year change resets the custom inflation % to the stored value).
 *   3. `type()` applies the same state changes the screen applies on a change (`LandLeaseScreen.tsx` handlers),
 *      so the replay runs the real `rules.ts` functions and nothing else: the messages come from
 *      `leaseFieldErrors`, Save from `canSaveLandLease`.
 *   4. Every recorded input is asserted, one `it()` per group. A failure names the group, the input, and the
 *      Canvas value next to the code value.
 *   5. Gates: only what the rules can decide from data that can be built from the recording is asserted. The rest
 *      is an `it.todo` with the reason.
 *   6. A disagreement is a FINDING. It is never fixed by bending the test or the code here: add the case to
 *      `FINDINGS` (it then shows as `it.todo("FINDING: …")`) and report it.
 * The generic part is the section "Recording replay": `readRecording`, `replayGroup` and `diffOutcomes`. Only
 * "Land Lease" below it is screen-specific.
 *
 * Sources: `e2e/landlease.validation.parity.spec.ts` (groups, fields, baselines, inputs, the message list the
 * reader looks for) and `e2e/landlease.gates.parity.spec.ts` (the gate states, the Save gate and Edit panel
 * reads). Inputs are transcribed in their typed order, because a JSON object puts integer-like keys ("0", "1",
 * "2027") first and so does not keep it; UT-LLREC-000 fails when a re-recording adds or drops an input.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  AGGREGATION_LABELS, LAND_LEASE_AGGREGATION, LAND_LEASE_PERIOD, LAND_LEASE_SECURED, LEASE_COMMAND_LABELS,
  LEASE_DESCRIPTION_MAX_LENGTH, LEASE_MSG, TECHNOLOGY, canSaveLandLease, durationMonthLabel, durationYearLabel,
  emptyLandLeaseForm, inflationProfileResetsOnYearChange, inflationStartYearDefault, landLeaseFormFrom,
  leaseCommands, leaseFieldErrors, resolveInflationProfileValue,
  type LandLeaseForm, type LeaseCommandArgs, type LeaseContract, type LeaseCostRow, type LeasePeriodRow,
  type LeaseProjectContext, type LeaseSaveContext,
} from "./landLeaseRules";

/* ════════════════════════════════════════════════════════════ recording replay (generic) ══ */

/** One recorded outcome; the same shape as `ValidationOutcome` in `e2e/harness/contract.ts`. */
interface Outcome { messages: string[]; save: boolean }
/** group key -> typed input -> outcome. */
type ValidationRecording = Record<string, Record<string, Outcome>>;

/** Reads a recording from `e2e/reference/` (the code repo root is four folders up from this file). */
function readRecording<T>(file: string): T {
  return JSON.parse(readFileSync(fileURLToPath(new URL(`../../../../e2e/reference/${file}`, import.meta.url)), "utf8")) as T;
}

/** A validation group as the browser typed it: a baseline once, then each input on top of the previous state. */
interface ReplayGroup<S> {
  key: string;
  /** The control the inputs were typed into (canvas name), for the failure message. */
  field: string;
  inputs: readonly string[];
  baseline: () => S;
  type: (state: S, input: string) => S;
  read: (state: S) => Outcome;
}

function replayGroup<S>(g: ReplayGroup<S>): { input: string; outcome: Outcome }[] {
  let state = g.baseline();
  return g.inputs.map((input) => {
    state = g.type(state, input);
    return { input, outcome: g.read(state) };
  });
}

/** Every input whose replayed outcome differs from the recording, as one readable line each. */
function diffOutcomes(
  group: string, field: string, recorded: Record<string, Outcome> | undefined,
  replayed: readonly { input: string; outcome: Outcome }[], skip: ReadonlySet<string>,
): string[] {
  const out: string[] = [];
  for (const { input, outcome } of replayed) {
    if (skip.has(input)) continue;
    const want = recorded?.[input];
    const where = `${group} (${field}) input ${JSON.stringify(input)}`;
    if (!want) { out.push(`${where}: not in the Canvas recording`); continue; }
    if (JSON.stringify(outcome.messages) !== JSON.stringify(want.messages)) {
      out.push(`${where}: messages canvas ${JSON.stringify(want.messages)} vs code ${JSON.stringify(outcome.messages)}`);
    }
    if (outcome.save !== want.save) out.push(`${where}: save canvas ${want.save} vs code ${outcome.save}`);
  }
  return out;
}

/* ══════════════════════════════════════════════════════════════════════════ Land Lease ══ */

const validation = readRecording<ValidationRecording>("landlease.validation.canvas.json");

interface GatesRecording {
  cards: string[];
  gates: Record<string, Record<string, boolean>>;
  saveGate: { empty: boolean; descriptionOnly: boolean };
  edit: {
    texts: Record<"description" | "euroMWh" | "euroMW" | "euroWTG" | "fixCosts" | "shareOfRevenues", string>;
    dropdowns: Record<string, { value: string; enabled: boolean; options: string[]; label: string | null }>;
    toggles: Record<"secured" | "allWtg" | "oneTimePayment" | "inflation", boolean | null>;
  };
}
const gates = readRecording<GatesRecording>("landlease.gates.canvas.json");

/**
 * Cases where the code app disagrees with the Canvas: `group -> input -> what differs`. Each becomes an
 * `it.todo("FINDING: …")` and is left out of its group's assertion. Empty: no disagreement found (3 Nov 2026).
 */
const FINDINGS: Record<string, Record<string, string>> = {};

/** The verbatim messages the browser reader looks for (`MSG` in `e2e/landlease.validation.parity.spec.ts`). */
const READER_MESSAGES: readonly string[] = [
  "Value must be a numeric with two decimal place.",
  "Please select a value between 0 and 100,000,000.0.",
  "Value must be between 0 and 1,000,000,000.0.",
  "Enter a number with no more than two decimal places.",
  "Please select a value between 0 and 10,000.0.",
  "Value must be a number",
  "Please select a value between 0 and 1,000,000,000.0.",
  "Value must be a numeric with 1 decimal place",
  "Please select a value between 0 and 100.",
  "Year value must be in format YYYY.",
  "Due Date must be in format MM/YYYY.",
  'The term "Standard" is applicable only for system-prefilled contracts.',
];

/** The project the recording was made on, as far as the rules need it. Only non-Italy matters (clause D). */
const LOCALE = "en-US";
const ctx: LeaseProjectContext = {
  projectId: "00000000-0000-4000-8000-000000000001", projectName: "Recording project", owningBusinessUnitId: null,
  countryId: null, countryName: "Germany", isoCurrencyCode: "EUR",
  technology: TECHNOLOGY.wind, codDate: "2027-04-01", areaWithRegion: null,
};

/**
 * The recorded period ("card 0 row 0", the Edit panel of `canvas.edit`): a NON-standard contract with One-Time
 * Payment and Inflation off. Its values are read from the recording: the name, EUR/MWh 2400, 5 years 0 months,
 * SUM, every 3 months, not secured, allocated to all WTGs. Assumed: it is Period 1 and the contract's only
 * period (Add Period, Edit and Delete are all on for it; nothing on the screen says otherwise). The rate fields
 * always hold a rate during the replay, so the hint and the additional-periods warning never depend on this.
 */
const recordedCost: LeaseCostRow = {
  id: "cost-rec", name: "Recording contract", description: "Recording contract", subaccountId: "sub-0",
  landOwner: null, currencyId: "cur-eur", currencyName: "Euro",
  secured: gates.edit.toggles.secured ? LAND_LEASE_SECURED.yes : LAND_LEASE_SECURED.no,
  allWtgAllocated: gates.edit.toggles.allWtg === true,
  isStandardContract: false, isStartDateStandardAssumption: false,
  amountOneTimePayment: null, amountOneTimePayment2: null, amountOneTimePayment3: null,
  dueDateOneTimePayment: null, dueDateOneTimePayment2: null, dueDateOneTimePayment3: null,
  useInflationProfile: false, useCountryInflationProfile: false, inflationProfile: null,
  inflationCountryArea: null, inflationStartYear: null, createdOn: "2026-01-01T00:00:00Z",
};
const rate = (text: string): number | null => (text === "" ? null : Number(text));
const recordedPeriod: LeasePeriodRow = {
  id: "per-rec", name: gates.edit.texts.description, projectCostId: recordedCost.id,
  period: LAND_LEASE_PERIOD.period1, startDate: "2027-04-01",
  durationYears: 5, durationMonths: 0,
  fixedCosts: rate(gates.edit.texts.fixCosts), percentOfRevenues: rate(gates.edit.texts.shareOfRevenues),
  eurPerMwh: rate(gates.edit.texts.euroMWh), eurPerMw: rate(gates.edit.texts.euroMW), eurPerWtg: rate(gates.edit.texts.euroWTG),
  aggregation: LAND_LEASE_AGGREGATION.sum, distributionFrequency: 3,
};
const recordedContract: LeaseContract = { cost: recordedCost, periods: [recordedPeriod] };

/** The Edit panel as loaded: `landLeaseFormFrom`, with the text boxes exactly as the Canvas showed them. */
function editPanelForm(): LandLeaseForm {
  const loaded = landLeaseFormFrom({
    cost: recordedCost, period: recordedPeriod, parentPeriod: null, allocations: [],
    panelState: "Edit", workingDate: null, resetStartDate: false,
  });
  const t = gates.edit.texts;
  return {
    ...loaded,
    description: t.description, eurPerMwh: t.euroMWh, eurPerMw: t.euroMW, eurPerWtg: t.euroWTG,
    fixedCosts: t.fixCosts, percentOfRevenues: t.shareOfRevenues,
  };
}

const saveContext = (form: LandLeaseForm): LeaseSaveContext => ({
  form, selectedCost: recordedCost, selectedPeriod: recordedPeriod, contract: recordedContract,
  panelState: "Edit", technology: ctx.technology, countryName: ctx.countryName, locale: LOCALE,
});

/** What the browser reader sees: the reader's messages that are on screen (verbatim, sorted), and Save. */
function readPanel(form: LandLeaseForm): Outcome {
  const shown = new Set(Object.values(leaseFieldErrors(form, LOCALE)).filter((m): m is string => m !== undefined));
  return {
    messages: READER_MESSAGES.filter((m) => shown.has(m)).sort(),
    save: canSaveLandLease(saveContext(form)),
  };
}

/** The panel's text boxes the validation groups type into. */
type LeaseBox =
  | "description" | "fixedCosts" | "percentOfRevenues" | "eurPerMwh" | "eurPerMw" | "eurPerWtg"
  | "dueDate" | "amount" | "inflationStartYear" | "inflationProfile";

const P = "txt_LandLease_RightPanel_NewEditPeriod_BodyContent_";
const C = "txt_LandLease_RightPanel_NewEditCost_BodyContent_";
const CANVAS_NAME: Record<LeaseBox, string> = {
  description: `${C}Description_1`, fixedCosts: `${P}FixedCosts_1`, percentOfRevenues: `${P}PercentOfRevenues_1`,
  eurPerMwh: `${P}EuroMWh_1`, eurPerMw: `${P}EuroMW_1`, eurPerWtg: `${P}EuroWTG_1`,
  dueDate: `${C}DueDate_1`, amount: `${C}Amount_1`,
  inflationStartYear: `${C}InflationStartYear_1`, inflationProfile: `${C}InflationProfile_1`,
};

/** `formatProfile` in `LandLeaseScreen.tsx`. */
const formatProfile = (v: number | null): string => (v === null ? "" : v.toFixed(1));

/** One typed value, with the state changes the screen's `onChange` handlers apply. */
function type(form: LandLeaseForm, box: LeaseBox, value: string): LandLeaseForm {
  switch (box) {
    case "description":
      // `maxLength={LEASE_DESCRIPTION_MAX_LENGTH}` (canvas `MaxLength` 55): the box keeps the first 55 characters.
      return { ...form, description: value.slice(0, LEASE_DESCRIPTION_MAX_LENGTH) };
    case "dueDate":
    case "amount":
      return { ...form, payments: { ...form.payments, [box]: value } };
    case "inflationStartYear":
      // V4, D79 §3: a Year change sets the custom % back to the stored profile (blank on this contract).
      return {
        ...form,
        inflationStartYear: value,
        ...(inflationProfileResetsOnYearChange(form.inflationStartYear, value, form.countryInflationChecked) ? {
          inflationProfile: formatProfile(resolveInflationProfileValue({
            selectedCost: recordedCost, countryInflationChecked: false, countryName: ctx.countryName, countryProfile: null,
          })),
        } : {}),
      };
    default:
      return { ...form, [box]: value };
  }
}

/** The One-Time Payment toggle switched on (its `OnUncheck` reset does not apply). */
const otpOn = (f: LandLeaseForm): LandLeaseForm => ({ ...f, oneTimePaymentsOn: true });
/** The Inflation Profile toggle switched on: a blank start year gets its default. */
const inflationOn = (f: LandLeaseForm): LandLeaseForm => ({
  ...f,
  inflationChecked: true,
  inflationStartYear: f.inflationStartYear === "" ? String(inflationStartYearDefault(null, f.startDate) ?? "") : f.inflationStartYear,
});

/** A group of `landlease.validation.parity.spec.ts`: its field, baseline and inputs, in typed order. */
interface LeaseGroup { key: string; box: LeaseBox; baseline: "rate" | "otp" | "infl"; prefill?: [LeaseBox, string][]; inputs: string[] }

const rateInputs = (max: string): string[] => [
  "abc", "-1", "0", "1", "1.5", "1,5", "0.555", "1e3", " ", "", max, String(BigInt(max) + 1n), `${max}.01`, "1.",
];

const GROUPS: LeaseGroup[] = [
  { key: "euroMWh", box: "eurPerMwh", baseline: "rate", inputs: [...rateInputs("100000000"), "+1"] },
  { key: "euroMW", box: "eurPerMw", baseline: "rate", inputs: [...rateInputs("100000000"), "+1"] },
  { key: "euroWTG", box: "eurPerWtg", baseline: "rate", prefill: [["fixedCosts", "1000"]], inputs: [...rateInputs("100000000"), "+1"] },
  { key: "fixCosts", box: "fixedCosts", baseline: "rate", inputs: rateInputs("1000000000") },
  { key: "shareOfRevenues", box: "percentOfRevenues", baseline: "rate", inputs: rateInputs("10000") },
  { key: "otpAmount1", box: "amount", baseline: "otp", inputs: rateInputs("1000000000") },
  {
    key: "inflationProfile", box: "inflationProfile", baseline: "infl",
    inputs: ["abc", "-1", "0", "1", "1.5", "1,5", "0.555", "1e3", " ", "", "100", "100.1", "101", "1."],
  },
  {
    key: "inflationStartYear", box: "inflationStartYear", baseline: "infl",
    inputs: ["abc", "-1", "0", "1", "2027", "0000", "99999", "2027.5", " 2027", " ", ""],
  },
  {
    key: "otpDueDate1", box: "dueDate", baseline: "otp",
    inputs: ["01/2027", "12/2027", "1/2027", "13/2027", "00/2027", "01-2027", "abc", "29/02/2028", "02/0000", " 01/2027", ""],
  },
  {
    key: "description", box: "description", baseline: "rate",
    inputs: ["Lease A", "standard", "Non-standard lease", "STANDARD", " ", "", "x".repeat(56)],
  },
];

/** `openBaseline` in the spec: the Edit panel, then the group's toggles and typed values, in the same order. */
function baseline(g: LeaseGroup): LandLeaseForm {
  let f = editPanelForm();
  if (g.baseline === "otp") f = type(type(otpOn(f), "dueDate", "12/2027"), "amount", "1000");
  if (g.baseline === "infl") f = type(type(inflationOn(f), "inflationStartYear", "2027"), "inflationProfile", "2.0");
  if (g.baseline === "rate" && g.key !== "euroWTG") f = type(f, "eurPerWtg", "1000");
  for (const [box, value] of g.prefill ?? []) f = type(f, box, value);
  return f;
}

describe("Land Lease Canvas recordings through the rules: validation (D80)", () => {
  it("UT-LLREC-000 the transcribed groups and inputs are exactly the recorded ones (130 inputs)", () => {
    expect(GROUPS.map((g) => g.key).sort()).toEqual(Object.keys(validation).sort());
    for (const g of GROUPS) {
      expect([...g.inputs].sort(), `group ${g.key}`).toEqual(Object.keys(validation[g.key] ?? {}).sort());
    }
    expect(GROUPS.reduce((n, g) => n + g.inputs.length, 0)).toBe(130);
  });

  it("UT-LLREC-001 the baseline Edit panel offers Save and shows no message (every group starts from it)", () => {
    for (const g of GROUPS) {
      expect(readPanel(baseline(g)), `baseline of ${g.key}`).toEqual({ messages: [], save: true });
    }
  });

  GROUPS.forEach((g, i) => {
    const id = `UT-LLREC-${String(i + 2).padStart(3, "0")}`;
    const findings = FINDINGS[g.key] ?? {};
    it(`${id} group ${g.key}: every recorded input gives the Canvas messages and Save state, typed in order`, () => {
      const replayed = replayGroup<LandLeaseForm>({
        key: g.key, field: CANVAS_NAME[g.box], inputs: g.inputs,
        baseline: () => baseline(g), type: (f, input) => type(f, g.box, input), read: readPanel,
      });
      expect(diffOutcomes(g.key, CANVAS_NAME[g.box], validation[g.key], replayed, new Set(Object.keys(findings)))).toEqual([]);
    });
    for (const [input, what] of Object.entries(findings)) {
      it.todo(`${id} FINDING: group ${g.key} input ${JSON.stringify(input)}: ${what}`);
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════════ gates ══ */

const PERMS = { canCreateCost: true, canCreatePeriod: true, canEditRecord: true, canDeleteRecord: true };

/** The five gates by caption, as the recording keys them. */
function gatesByCaption(args: LeaseCommandArgs): Record<string, boolean> {
  return Object.fromEntries(leaseCommands(args).map((c) => [c.label, c.enabled]));
}

const cardOpen = (over: Partial<LeaseCommandArgs>): LeaseCommandArgs => ({
  subaccountId: "sub-x", isSelectedCard: false, selectedPeriod: null, selectedCost: null, contract: null,
  costsInSubaccount: [], hasMatchingAssumption: false, permissions: PERMS, ...over,
});

const recordedState = (name: string): Record<string, boolean> => {
  const s = gates.gates[name];
  if (!s) throw new Error(`gates recording has no state ${JSON.stringify(name)}`);
  return s;
};
const cardState = (i: number): string => `card ${i} ${JSON.stringify(gates.cards[i])} open`;

describe("Land Lease Canvas recordings through the rules: command gates and the Save gate (D80)", () => {
  it("UT-LLREC-020 the recording has the five command captions the rules produce, for every state", () => {
    const captions = Object.values(LEASE_COMMAND_LABELS).sort();
    for (const [state, row] of Object.entries(gates.gates)) expect(Object.keys(row).sort(), state).toEqual(captions);
  });

  it("UT-LLREC-021 card 0 open, nothing selected (non-standard rows on it): the recorded gates", () => {
    for (const isSelectedCard of [false, true]) {
      for (const hasMatchingAssumption of [false, true]) {
        expect(gatesByCaption(cardOpen({ isSelectedCard, hasMatchingAssumption, costsInSubaccount: [recordedCost] })),
          `selected card ${isSelectedCard}, assumption ${hasMatchingAssumption}`).toEqual(recordedState(cardState(0)));
      }
    }
  });

  it("UT-LLREC-022 cards 5 and 6 open: Add Standard Contract on, the only data that gives it (an assumption, no rows)", () => {
    for (const i of [5, 6]) {
      expect(gatesByCaption(cardOpen({ hasMatchingAssumption: true, costsInSubaccount: [] })), cardState(i))
        .toEqual(recordedState(cardState(i)));
    }
  });

  it("UT-LLREC-023 every card open, nothing selected: Add Contract Type on, Add Period, Edit and Delete off", () => {
    const pick = (r: Record<string, boolean>) => ({
      [LEASE_COMMAND_LABELS.newLandLeaseContractKey]: r[LEASE_COMMAND_LABELS.newLandLeaseContractKey],
      [LEASE_COMMAND_LABELS.newLandLeasePeriodKey]: r[LEASE_COMMAND_LABELS.newLandLeasePeriodKey],
      [LEASE_COMMAND_LABELS.EditLandLeasePeriodKey]: r[LEASE_COMMAND_LABELS.EditLandLeasePeriodKey],
      [LEASE_COMMAND_LABELS.deleteLandLeasePeriodKey]: r[LEASE_COMMAND_LABELS.deleteLandLeasePeriodKey],
    });
    gates.cards.forEach((_, i) => {
      for (const costsInSubaccount of [[], [recordedCost]]) {
        for (const isSelectedCard of [false, true]) {
          expect(pick(gatesByCaption(cardOpen({ isSelectedCard, costsInSubaccount }))), `${cardState(i)}, ${costsInSubaccount.length} rows`)
            .toEqual(pick(recordedState(cardState(i))));
        }
      }
    });
  });

  it.todo("UT-LLREC-024 cards 1-4, 7 and 8: Add Standard Contract off. Not decidable from the recording: it needs the "
    + "project's row count per card and the OPEX & Land Lease Standard Assumptions rows, neither of which is recorded");

  it("UT-LLREC-025 card 0 row 0 selected (the recorded period): the recorded gates", () => {
    expect(gatesByCaption(cardOpen({
      subaccountId: "sub-0", isSelectedCard: true, selectedPeriod: recordedPeriod, selectedCost: recordedCost,
      contract: recordedContract, costsInSubaccount: [recordedCost],
    }))).toEqual(recordedState("card 0 row 0 selected"));
  });

  it.todo("UT-LLREC-026 the gates with a STANDARD contract or a \"Standard…\" period selected. No such state is "
    + "recorded (the recorded project's card 0 holds a non-standard contract)");

  it("UT-LLREC-027 Save gate: an empty Add Contract Type panel, then a Description only, both off as on the Canvas", () => {
    const save = (form: LandLeaseForm) => canSaveLandLease({
      form, selectedCost: null, selectedPeriod: null, contract: null, panelState: "New",
      technology: ctx.technology, countryName: ctx.countryName, locale: LOCALE,
    });
    const empty = emptyLandLeaseForm(ctx);
    expect(save(empty)).toBe(gates.saveGate.empty);
    // The value `landlease.gates.parity.spec.ts` types.
    expect(save(type(empty, "description", "Parity description only"))).toBe(gates.saveGate.descriptionOnly);
  });

  it("UT-LLREC-028 the Edit panel load: landLeaseFormFrom gives the recorded toggles, dropdown values and rates", () => {
    const f = landLeaseFormFrom({
      cost: recordedCost, period: recordedPeriod, parentPeriod: null, allocations: [],
      panelState: "Edit", workingDate: null, resetStartDate: false,
    });
    const d = gates.edit.dropdowns;
    expect(f.description).toBe(gates.edit.texts.description);
    expect({
      secured: f.securedChecked, allWtg: f.allWtgAllocated, oneTimePayment: f.oneTimePaymentsOn, inflation: f.inflationChecked,
    }).toEqual(gates.edit.toggles);
    expect(durationYearLabel(f.durationYears ?? -1)).toBe(d.durationYears?.value);
    expect(durationMonthLabel(f.durationMonths ?? -1)).toBe(d.durationMonths?.value);
    expect(AGGREGATION_LABELS[f.aggregation ?? -1]).toBe(d.aggregation?.value);
    // The frequency labels ("1 month" … "12 months") are the Screen's `DISTRIBUTION_FREQUENCIES`; same wording.
    expect(durationMonthLabel(f.distributionFrequency ?? -1)).toBe(d.distributionFrequency?.value);
    // The rate TEXT format is the Screen's (`canvasRate`: "2400", where the rules give "2400.00"); compared as numbers.
    const t = gates.edit.texts;
    for (const [code, canvas] of [[f.eurPerMwh, t.euroMWh], [f.eurPerMw, t.euroMW], [f.eurPerWtg, t.euroWTG],
      [f.fixedCosts, t.fixCosts], [f.percentOfRevenues, t.shareOfRevenues]] as const) {
      expect(code === "" ? "" : Number(code), `canvas ${JSON.stringify(canvas)}`).toBe(canvas === "" ? "" : Number(canvas));
    }
    // Sanity on the message list the replay reads: it holds the rules' own strings.
    expect(READER_MESSAGES).toContain(LEASE_MSG.descriptionStandardReserved);
    expect(READER_MESSAGES).toContain(LEASE_MSG.inflationStartYearFormat);
  });

  it.todo("UT-LLREC-029 the dropdown option lists, enabled states and accessible names, and the hover texts. These "
    + "are the Screen's, not the rules' (the gates and visual lanes compare them in the browser)");
});
