import { describe, expect, it } from "vitest";
import {
  CONTRACT_COUNTRY_RULE, CONTRACT_DEFAULT, defaultSelection, parseSelectionParams, pickerCountries,
  sameCountryTechnology,
} from "@/domain/countryPicker";
import { CONTRACT_TECHNOLOGIES } from "@/domain/technology";
import {
  Vsb_bopcontractsstandardassumptionsesvsb_closingdatereference as ClosingRefMap,
  Vsb_bopcontractsstandardassumptionsesvsb_contracttypes as ContractTypeMap,
  Vsb_bopcontractsstandardassumptionsesvsb_margintype as MarginTypeMap,
} from "@/generated/models/Vsb_bopcontractsstandardassumptionsesModel";
import {
  CLOSING_REF, CLOSING_REF_OPTIONS, CONTRACT_LIMIT, CONTRACT_TYPE, CONTRACT_TYPE_LABEL, MARGIN_TYPE,
  MARGIN_TYPE_LABEL, MSG, OTHER_RANK, TECHNOLOGY,
  breadcrumbText, buildAccountTree, buildParentPayload, canSave, classifyAccounts,
  commentCounter, commentText, currencyOf, deleteDescription, findOwnershipConflicts, formatClosingRef, formatMax,
  groupDevCoTags, inRange, initialForm, isDirty, isNDecimal, limitFlags, limitMessage, marginValueHeading,
  panelTitle, parseLocaleNumber, planDevCoDiff, rootState, sortContracts, toggleLeaf,
  toggleRoot, validateForm, withMargin, withMarginType,
  INCLUDE_INACTIVE_STANDARD_CONTRACTS, closeDialogText, closePrompt, isInactive, isStaleSelection,
  visibleSelectionCount, withoutAccounts,
  type ContractForm, type DevCoRow,
} from "./rules";

/** Batch 2b: the screen's picker configuration on the shared model (was `buildPickerCountries` / `parseSelection`). */
const buildPickerCountries = (rows: Parameters<typeof pickerCountries>[0]) => pickerCountries(rows, CONTRACT_COUNTRY_RULE);
const parseSelection = (country: string | null, tech: string | null, countries: ReturnType<typeof buildPickerCountries>) =>
  parseSelectionParams(country, tech, countries, CONTRACT_TECHNOLOGIES);
import {
  FRANCE_ID, GERMANY_ID, contract, fixtureAccounts, fixtureContracts, fixtureCountries, fixtureDevCo,
} from "./fixtures";

const EN = "en-US";
const DE = "de-DE";

function validForm(overrides: Partial<ContractForm> = {}): ContractForm {
  return {
    ...initialForm(undefined, [], EN),
    description: "Turbine", monthText: "3", selectedAccountIds: ["l3-a"],
    ...overrides,
  };
}

describe("choice constants (DR-11)", () => {
  it("come from the generated model", () => {
    expect(TECHNOLOGY).toEqual({ Wind: 952850000, PV: 952850001, BESS: 952850003 });
    expect(CONTRACT_TYPE).toEqual({ Development: 952850001, Construction: 952850002 });
    expect(CLOSING_REF).toEqual({ Cluster4: 952850000, FID: 952850001, Cluster5: 952850002 });
    expect(MARGIN_TYPE).toEqual({ Percentage: 952850000, FixedValue: 952850001 });
  });

  it("display labels equal the Dataverse display labels in the regenerated model (SDK 1.5)", () => {
    const closing = ClosingRefMap as Record<number, string>;
    const types = ContractTypeMap as Record<number, string>;
    const margins = MarginTypeMap as Record<number, string>;
    for (const o of CLOSING_REF_OPTIONS) expect(o.label).toBe(closing[o.value]);
    expect(CLOSING_REF_OPTIONS.map((o) => o.label)).toEqual(["Cluster 4", "FID", "Cluster 5"]);
    for (const code of Object.values(CONTRACT_TYPE)) expect(CONTRACT_TYPE_LABEL[code]).toBe(types[code]);
    expect(CONTRACT_TYPE_LABEL[CONTRACT_TYPE.Development]).toBe("Development Contract");
    for (const code of Object.values(MARGIN_TYPE)) expect(MARGIN_TYPE_LABEL[code]).toBe(margins[code]);
    expect(MARGIN_TYPE_LABEL[MARGIN_TYPE.FixedValue]).toBe("Fixed Value");
  });
});

describe("picker (FR-2, D-20)", () => {
  it("keeps only the allow-list countries, in canvas order", () => {
    const list = buildPickerCountries(fixtureCountries);
    expect(list.map((c) => c.name)).toEqual(["Germany", "France", "Poland"]);
    expect(list.find((c) => c.name === "Spain")).toBeUndefined();
  });

  it("parses the URL selection and rejects anything not offered", () => {
    const countries = buildPickerCountries(fixtureCountries);
    expect(parseSelection(GERMANY_ID, "952850001", countries)).toEqual({ countryId: GERMANY_ID, technology: TECHNOLOGY.PV });
    expect(parseSelection(GERMANY_ID, "952850005", countries)).toBeUndefined(); // Hydro (D-16)
    expect(parseSelection("33333333-3333-3333-3333-333333333333", "952850000", countries)).toBeUndefined();
    expect(parseSelection(null, null, countries)).toBeUndefined();
    // The default is the first listed country with the first technology (PO 2026-10-17,
    // supersedes D-29); the badge is the ISO-2 code.
    expect(defaultSelection(countries, CONTRACT_TECHNOLOGIES, CONTRACT_DEFAULT))
      .toEqual({ countryId: GERMANY_ID, technology: TECHNOLOGY.Wind });
    expect(countries.map((c) => c.code)).toEqual(["DE", "FR", "PL"]);
    expect(CONTRACT_TECHNOLOGIES.map((t) => t.code)).toEqual([TECHNOLOGY.Wind, TECHNOLOGY.PV, TECHNOLOGY.BESS]);
  });

  it("builds the breadcrumb (FR-3)", () => {
    expect(breadcrumbText("Germany", TECHNOLOGY.PV)).toBe("Contracts / Germany / PV");
    expect(breadcrumbText(undefined, undefined)).toBe("Contracts");
  });
});

describe("list (FR-4, FR-6, FR-8)", () => {
  it("sorts Development before Construction, then by name", () => {
    const sorted = sortContracts([
      contract({ id: "b", name: "B", contractType: CONTRACT_TYPE.Construction }),
      contract({ id: "z", name: "Z", contractType: CONTRACT_TYPE.Development }),
    ]);
    expect(sorted.map((c) => c.name)).toEqual(["Z", "B"]);
  });

  it("formats the closing date reference with sign", () => {
    expect(formatClosingRef(CLOSING_REF.FID, -3)).toBe("FID - 3 months");
    expect(formatClosingRef(CLOSING_REF.FID, 0)).toBe("FID + 0 months");
    expect(formatClosingRef(CLOSING_REF.Cluster4, 2)).toBe("Cluster 4 + 2 months");
  });

  it("renders a missing closing reference as the canvas does: blank & \" \" (parity r1, Gap 3)", () => {
    expect(formatClosingRef(undefined, 0)).toBe(" + 0 months");
    expect(formatClosingRef(null, -2)).toBe(" - 2 months");
    expect(formatClosingRef(undefined, undefined)).toBe(" + 0 months");
    expect(formatClosingRef(undefined, 0)).not.toContain("- +");
  });

  it("counts the trimmed comment length, Len(Trim(v))/50 (parity r1, Gap 4)", () => {
    expect(commentCounter("")).toBe("0/50");
    expect(commentCounter("  ab  ")).toBe("2/50");
    expect(commentCounter("   ")).toBe("0/50");
    expect(commentCounter("a b")).toBe("3/50");
  });

  it("counts with Power Fx Trim: inner runs of spaces collapse to one (parity r2, NG-2)", () => {
    expect(commentCounter("a  b")).toBe("3/50");
    expect(commentCounter("  a   b  c  ")).toBe("5/50");
    // Only spaces are affected, as in Power Fx: a newline still counts.
    expect(commentCounter("a\nb")).toBe("3/50");
  });

  it("renders an unknown closing-reference code with its choice label, as the canvas does (parity r2, NG-4)", () => {
    const UNKNOWN = 952850009;
    // Canvas: ThisItem.'Closing Date Reference' & " " & ... — the choice's own label, never "-".
    expect(formatClosingRef(UNKNOWN, 2, "Cluster 6")).toBe("Cluster 6 + 2 months");
    expect(formatClosingRef(UNKNOWN, -4, "Cluster 6")).toBe("Cluster 6 - 4 months");
    // No label sent: concatenates as blank, never "- + n months".
    expect(formatClosingRef(UNKNOWN, 2)).toBe(" + 2 months");
    expect(formatClosingRef(UNKNOWN, 2)).not.toContain("- +");
    // A known code keeps its option label.
    expect(formatClosingRef(CLOSING_REF.FID, 1, "FID")).toBe("FID + 1 months");
  });

  it("uses the ISO currency (D-11) and the margin heading by type", () => {
    expect(currencyOf("PLN")).toBe("PLN");
    expect(currencyOf(undefined)).toBe("EUR");
    expect(marginValueHeading(MARGIN_TYPE.FixedValue, "PLN")).toBe("Margin Fixed Value [PLN]");
    expect(marginValueHeading(MARGIN_TYPE.Percentage, "PLN")).toBe("Margin [%]");
    expect(commentText("")).toBe("-");
    expect(commentText("x")).toBe("x");
  });

  it("flags a type at the limit of 10 and leaves the other enabled", () => {
    const rows = Array.from({ length: CONTRACT_LIMIT }, (_, i) => contract({ id: `d${i}` }));
    const flags = limitFlags([...rows, contract({ id: "c", contractType: CONTRACT_TYPE.Construction })]);
    expect(flags.developmentFull).toBe(true);
    expect(flags.constructionFull).toBe(false);
    expect(limitFlags(rows.slice(0, 9)).developmentFull).toBe(false);
    expect(limitMessage(CONTRACT_TYPE.Development, "Germany", TECHNOLOGY.Wind))
      .toBe("Maximum 10 development contracts allowed for Germany - Wind");
  });

  it("titles the panel and the delete dialog", () => {
    expect(panelTitle(false, CONTRACT_TYPE.Construction)).toBe("Edit Construction Contract");
    expect(panelTitle(true, CONTRACT_TYPE.Development)).toBe("New Development Contract");
    expect(deleteDescription("X")).toBe('Are you sure that you want to permanently delete "X" contract?');
  });
});

describe("buildAccountTree (DR-6)", () => {
  const tree = buildAccountTree(fixtureAccounts);

  it("excludes 10006 and sorts roots by order", () => {
    expect(tree.roots.map((r) => r.number)).toEqual(["10000", "20000", "30000"]);
  });

  it("lists Level-3 descendants under the root, ignoring deeper accounts and Level 2", () => {
    const dev = tree.roots[0]!;
    expect(dev.children.map((c) => c.number)).toEqual(["10101", "10102"]);
    expect(tree.leaves.has("l4-deep")).toBe(false);
    expect(tree.leaves.has("l2-dev")).toBe(false);
    expect(dev.childCount).toBe(2);
  });

  it("keeps a root with no Level-3 descendants, which renders disabled", () => {
    const empty = tree.roots.find((r) => r.number === "30000")!;
    expect(empty.childCount).toBe(0);
    expect(rootState(empty, new Set(), new Map()).disabled).toBe(true);
  });
});

describe("classifyAccounts (DR-7, FR-15)", () => {
  it("marks every linked account used for a new contract", () => {
    const classes = classifyAccounts(fixtureDevCo);
    expect(classes.get("l3-a")).toMatchObject({ used: true, selected: false, usedBy: "c-dev" });
  });

  it("selects this contract's links and locks the others", () => {
    const classes = classifyAccounts(fixtureDevCo, "c-dev");
    expect(classes.get("l3-a")).toMatchObject({ selected: true, used: false, existingChildId: "child-1" });
    expect(classes.get("l3-c")).toMatchObject({ selected: false, used: true });
  });

  it("lets this contract's own link win over a duplicate elsewhere", () => {
    const rows: DevCoRow[] = [
      { id: "x1", contractId: "other", accountId: "l3-a" },
      { id: "x2", contractId: "me", accountId: "l3-a" },
    ];
    expect(classifyAccounts(rows, "me").get("l3-a")).toMatchObject({ selected: true, used: false });
  });
});

describe("tri-state (FR-14)", () => {
  const tree = buildAccountTree(fixtureAccounts);
  const dev = tree.roots[0]!;

  it("is unchecked, mixed, then checked", () => {
    const none = new Map();
    expect(rootState(dev, new Set(), none).checked).toBe(false);
    expect(rootState(dev, new Set(["l3-a"]), none).checked).toBe("mixed");
    expect(rootState(dev, new Set(["l3-a", "l3-b"]), none).checked).toBe(true);
  });

  it("is mixed when all available are selected but one is used elsewhere", () => {
    const classes = classifyAccounts([{ id: "o", contractId: "other", accountId: "l3-a" }], "me");
    expect(rootState(dev, new Set(["l3-b"]), classes).checked).toBe("mixed");
  });

  it("is disabled when every child is used", () => {
    const classes = classifyAccounts([
      { id: "o1", contractId: "other", accountId: "l3-a" },
      { id: "o2", contractId: "other", accountId: "l3-b" },
    ]);
    expect(rootState(dev, new Set(), classes)).toMatchObject({ disabled: true, checked: true });
  });

  it("selects all available when none is selected, clears otherwise, never touching used", () => {
    const classes = classifyAccounts([{ id: "o", contractId: "other", accountId: "l3-a" }]);
    const on = toggleRoot(dev, new Set(), classes);
    expect([...on]).toEqual(["l3-b"]);
    expect([...toggleRoot(dev, on, classes)]).toEqual([]);
    expect(toggleLeaf("l3-a", new Set(), classes).has("l3-a")).toBe(false);
    expect(toggleLeaf("l3-b", new Set(), classes).has("l3-b")).toBe(true);
  });
});

describe("groupDevCoTags (FR-7, DR-5)", () => {
  const { accounts } = buildAccountTree(fixtureAccounts);

  it("ranks Development Expenses before Other CAPEX", () => {
    const groups = groupDevCoTags([
      { id: "1", contractId: "c", accountId: "l3-c", rootAccountId: "root-oth" },
      { id: "2", contractId: "c", accountId: "l3-b", rootAccountId: "root-dev" },
      { id: "3", contractId: "c", accountId: "l3-a", rootAccountId: "root-dev" },
    ], accounts);
    expect(groups.map((g) => g.rootName)).toEqual(["Development Expenses", "Other CAPEX"]);
    expect(groups[0]!.tags.map((t) => t.label)).toEqual(["Grid connection", "Environmental study"]);
  });

  it("puts a row with no root under Other, rank 99", () => {
    const groups = groupDevCoTags([{ id: "1", contractId: "c", accountId: "l3-a" }], accounts);
    expect(groups).toEqual([{ rootId: "", rootName: "Other", rank: OTHER_RANK, tags: [{ id: "1", label: "Grid connection" }] }]);
  });

  it("returns no groups for a contract with no children", () => {
    expect(groupDevCoTags([], accounts)).toEqual([]);
  });
});

describe("numbers (fn_Numeric)", () => {
  it("checks decimals with the language separator", () => {
    expect(isNDecimal("12.3", 1, EN)).toBe(true);
    expect(isNDecimal("12.34", 1, EN)).toBe(false);
    expect(isNDecimal("12,3", 1, EN)).toBe(false);
    expect(isNDecimal("12,3", 1, DE)).toBe(true);
    expect(isNDecimal("12.34", 2, EN)).toBe(true);
  });

  it("parses and range-checks", () => {
    expect(parseLocaleNumber("12,5", DE)).toBe(12.5);
    expect(parseLocaleNumber("12.5", EN)).toBe(12.5);
    expect(parseLocaleNumber("ab", EN)).toBeUndefined();
    expect(inRange("100", 0, 100, EN)).toBe(true);
    expect(inRange("100.1", 0, 100, EN)).toBe(false);
    expect(inRange("-1", 0, 100, EN)).toBe(false);
  });

  it("formats the maximum with the field's decimals (D-30)", () => {
    expect(formatMax(100, 1, "en-US")).toBe("100.0");
    expect(formatMax(1_000_000_000, 2, "en-US")).toBe("1,000,000,000.00");
  });
});

describe("validateForm (03-validations)", () => {
  it("accepts a valid form", () => {
    expect(validateForm(validForm(), EN, "en-US")).toEqual({});
  });

  it("requires a non-blank description", () => {
    expect(validateForm(validForm({ description: "   " }), EN).description).toBe(MSG.inputBlank);
  });

  it("requires a closing date reference", () => {
    expect(validateForm(validForm({ closingRef: null }), EN).closingRef).toBe(MSG.closingRefBlank);
  });

  it("blocks an invalid month (D-04)", () => {
    expect(validateForm(validForm({ monthText: "123" }), EN).month).toBe(MSG.monthFormat);
    expect(validateForm(validForm({ monthText: "ab" }), EN).month).toBe(MSG.monthFormat);
    expect(validateForm(validForm({ monthText: "" }), EN).month).toBe(MSG.inputBlank);
    expect(validateForm(validForm({ monthText: "99" }), EN).month).toBeUndefined();
  });

  it("validates the percentage margin", () => {
    const pct = (t: string) => validateForm(validForm({ margin: true, marginType: MARGIN_TYPE.Percentage, marginPercentageText: t }), EN, "en-US").marginPercentage;
    expect(pct("")).toBe(MSG.inputBlank);
    expect(pct("12.34")).toBe(MSG.oneDecimal);
    expect(pct("100.1")).toBe("Please select a value between 0 and 100.0");
    expect(pct("12.3")).toBeUndefined();
  });

  it("validates the fixed-value margin", () => {
    const fixed = (t: string) => validateForm(validForm({ margin: true, marginType: MARGIN_TYPE.FixedValue, marginFixedText: t }), EN, "en-US").marginFixed;
    expect(fixed("")).toBe(MSG.inputBlank);
    expect(fixed("1.234")).toBe(MSG.twoDecimals);
    expect(fixed("1000000000.01")).toBe("Please select a value between 0 and 1,000,000,000.00");
    expect(fixed("1000.50")).toBeUndefined();
  });

  it("requires a margin type when margin is Yes, and at least one account (D-25)", () => {
    expect(validateForm(validForm({ margin: true, marginType: null }), EN).marginType).toBe(MSG.marginTypeBlank);
    expect(validateForm(validForm({ selectedAccountIds: [] }), EN).accounts).toBe(MSG.accountsNone);
    expect(validateForm(validForm({ margin: null }), EN).margin).toBe(MSG.marginBlank);
  });
});

describe("form state (FR-8, FR-12, D-05, D-06, D-28)", () => {
  it("has the new-contract defaults", () => {
    expect(initialForm(undefined, [], EN)).toEqual({
      description: "", closingRef: CLOSING_REF.Cluster4, monthSign: "+", monthText: "",
      margin: false, marginType: MARGIN_TYPE.Percentage, marginPercentageText: "", marginFixedText: "",
      comment: "", selectedAccountIds: [],
    });
  });

  it("pre-fills an edit, showing a stored 0 as +", () => {
    const con = fixtureContracts[0]!;
    const f = initialForm(con, ["l3-c"], DE);
    expect(f).toMatchObject({ description: "Grid", monthSign: "-", monthText: "3", margin: true, marginPercentageText: "5,5" });
    expect(initialForm(fixtureContracts[1], [], EN)).toMatchObject({ monthSign: "+", monthText: "0" });
  });

  it("is dirty only on a real difference, and clean again after reverting", () => {
    const initial = initialForm(fixtureContracts[1], ["l3-a"], EN);
    expect(isDirty(initial, initial)).toBe(false);
    const changed = { ...initial, description: "Other" };
    expect(isDirty(changed, initial)).toBe(true);
    expect(isDirty({ ...changed, description: initial.description }, initial)).toBe(false);
    expect(isDirty({ ...initial, selectedAccountIds: ["l3-a", "l3-b"] }, initial)).toBe(true);
  });

  it("clears both margin inputs when Margin or Margin Type changes, each input in its own field", () => {
    const f = validForm({ margin: true, marginPercentageText: "5", marginFixedText: "7" });
    expect(withMargin(f, false)).toMatchObject({ marginPercentageText: "", marginFixedText: "" });
    expect(withMarginType(f, MARGIN_TYPE.FixedValue)).toMatchObject({ marginType: MARGIN_TYPE.FixedValue, marginPercentageText: "", marginFixedText: "" });
  });

  it("gates Save on dirty, selection, validity and link availability (FR-16)", () => {
    const initial = initialForm(undefined, [], EN);
    const form = validForm();
    const ok = { form, initial, errors: validateForm(form, EN), linksAvailable: true };
    expect(canSave(ok)).toBe(true);
    expect(canSave({ ...ok, linksAvailable: false })).toBe(false);
    expect(canSave({ ...ok, form: initial, errors: validateForm(initial, EN) })).toBe(false);
    const bad = { ...form, monthText: "123" };
    expect(canSave({ ...ok, form: bad, errors: validateForm(bad, EN) })).toBe(false);
    const edit = initialForm(fixtureContracts[1], ["l3-a"], EN);
    expect(canSave({ form: edit, initial: edit, errors: validateForm(edit, EN), linksAvailable: true })).toBe(false);
  });

  it("counts only accounts shown in the tree toward ≥ 1 account; hidden inactive links are kept (parity r2, NG-5)", () => {
    const tree = buildAccountTree(fixtureAccounts);
    const visibleId = [...tree.leaves.keys()][0]!;
    const HIDDEN = "inactive-capex"; // linked to this contract, but not in the active-only tree
    expect(tree.leaves.has(HIDDEN)).toBe(false);
    expect(visibleSelectionCount([HIDDEN, visibleId], tree.leaves)).toBe(1);
    expect(visibleSelectionCount([HIDDEN], undefined)).toBe(1);

    const initial = initialForm(fixtureContracts[1], [HIDDEN, visibleId], EN);
    // Only the hidden link left: the rule is NOT met, and Save is blocked.
    const onlyHidden = { ...initial, description: "Changed", selectedAccountIds: [HIDDEN] };
    const errors = validateForm(onlyHidden, EN, undefined, tree.leaves);
    expect(errors.accounts).toBe(MSG.accountsNone);
    expect(canSave({ form: onlyHidden, initial, errors, linksAvailable: true, visible: tree.leaves })).toBe(false);

    // With a visible account the form saves, and the hidden link stays in the selection, so the
    // save diff never deletes it.
    const withVisible = { ...initial, description: "Changed" };
    const okErrors = validateForm(withVisible, EN, undefined, tree.leaves);
    expect(okErrors.accounts).toBeUndefined();
    expect(canSave({ form: withVisible, initial, errors: okErrors, linksAvailable: true, visible: tree.leaves })).toBe(true);
    const own: DevCoRow[] = [
      { id: "k-hidden", contractId: "me", accountId: HIDDEN },
      { id: "k-visible", contractId: "me", accountId: visibleId },
    ];
    expect(planDevCoDiff(own, withVisible.selectedAccountIds)).toEqual({ toDelete: [], toCreate: [] });
  });
});

describe("save planning (DR-8)", () => {
  it("builds the parent payload with null margins when Margin = No", () => {
    const p = buildParentPayload(validForm({ monthSign: "-", monthText: "5", comment: "" }), {
      contractType: CONTRACT_TYPE.Development, countryId: GERMANY_ID, technology: TECHNOLOGY.PV, lang: EN,
    });
    expect(p).toEqual({
      vsb_name: "Development Contract - Turbine",
      vsb_description: "Turbine",
      "vsb_Country@odata.bind": `/vsb_countries(${GERMANY_ID})`,
      vsb_technology: TECHNOLOGY.PV,
      vsb_closingdatereference: CLOSING_REF.Cluster4,
      vsb_monthdifference: -5,
      vsb_margin: false,
      vsb_margintype: null,
      vsb_marginpercentage: null,
      vsb_marginfixedvalue: null,
      vsb_comment: null,
      vsb_contracttypes: CONTRACT_TYPE.Development,
    });
  });

  it("writes only the margin value matching the type, and 0 without a sign", () => {
    const p = buildParentPayload(validForm({ monthSign: "-", monthText: "0", margin: true, marginType: MARGIN_TYPE.FixedValue, marginFixedText: "1234,5" }), {
      contractType: CONTRACT_TYPE.Construction, countryId: FRANCE_ID, technology: TECHNOLOGY.BESS, lang: DE,
    });
    expect(p.vsb_monthdifference).toBe(0);
    expect(Object.is(p.vsb_monthdifference, -0)).toBe(false);
    expect(p.vsb_marginfixedvalue).toBe(1234.5);
    expect(p.vsb_marginpercentage).toBeNull();
    expect(p.vsb_margintype).toBe(MARGIN_TYPE.FixedValue);
  });

  it("diffs links: removed children go, new selections come", () => {
    const own: DevCoRow[] = [
      { id: "k1", contractId: "me", accountId: "a" },
      { id: "k2", contractId: "me", accountId: "b" },
    ];
    expect(planDevCoDiff(own, ["b", "c"])).toEqual({ toDelete: ["k1"], toCreate: ["c"] });
    expect(planDevCoDiff([], ["a"])).toEqual({ toDelete: [], toCreate: ["a"] });
  });

  it("detects accounts just linked to another contract (D-23)", () => {
    const scope: DevCoRow[] = [{ id: "1", contractId: "other", accountId: "a" }, { id: "2", contractId: "me", accountId: "b" }];
    expect(findOwnershipConflicts(scope, "me", ["a", "b"])).toEqual(["a"]);
    expect(findOwnershipConflicts(scope, undefined, ["b"])).toEqual(["b"]);
    expect(findOwnershipConflicts(scope, "me", ["b", "c"])).toEqual([]);
  });
});

describe("gap closure (08-gap-analysis)", () => {
  const tree = buildAccountTree(fixtureAccounts);
  const dev = tree.roots[0]!;
  const usedA = classifyAccounts([{ id: "o", contractId: "other", accountId: "l3-a" }], "me");

  it("B-1: a used account still in the selection can be unchecked but never re-checked", () => {
    expect(isStaleSelection("l3-a", new Set(["l3-a"]), usedA)).toBe(true);
    expect(toggleLeaf("l3-a", new Set(["l3-a"]), usedA).has("l3-a")).toBe(false);
    expect(toggleLeaf("l3-a", new Set(), usedA).has("l3-a")).toBe(false);
  });

  it("B-1: the root clears stale selections and stays enabled while one remains", () => {
    const allUsed = classifyAccounts([
      { id: "o1", contractId: "other", accountId: "l3-a" },
      { id: "o2", contractId: "other", accountId: "l3-b" },
    ], "me");
    expect(rootState(dev, new Set(["l3-a"]), allUsed)).toMatchObject({ disabled: false, stale: ["l3-a"] });
    expect([...toggleRoot(dev, new Set(["l3-a"]), allUsed)]).toEqual([]);
    expect(rootState(dev, new Set(), allUsed).disabled).toBe(true);
    // A stale-only selection reads as partially selected, and clearing it never adds anything.
    expect(rootState(dev, new Set(["l3-a"]), usedA).checked).toBe("mixed");
    expect([...toggleRoot(dev, new Set(["l3-a"]), usedA)]).toEqual([]);
  });

  it("B-1: withoutAccounts prunes conflicting ids from the form", () => {
    expect(withoutAccounts(validForm({ selectedAccountIds: ["l3-a", "l3-b"] }), ["l3-a"]).selectedAccountIds)
      .toEqual(["l3-b"]);
  });

  it("B-2: sameCountryTechnology compares country (case-insensitive) and technology", () => {
    const sameSelection = sameCountryTechnology;
    const de = { countryId: GERMANY_ID, technology: TECHNOLOGY.Wind };
    expect(sameSelection(de, { countryId: GERMANY_ID.toUpperCase(), technology: TECHNOLOGY.Wind })).toBe(true);
    expect(sameSelection(de, { countryId: FRANCE_ID, technology: TECHNOLOGY.Wind })).toBe(false);
    expect(sameSelection(de, { countryId: GERMANY_ID, technology: TECHNOLOGY.PV })).toBe(false);
    expect(sameSelection(de, undefined)).toBe(false);
  });

  it("B-3: closing after a partial save warns about incomplete links before anything else", () => {
    expect(closePrompt({ dirty: false, linksIncomplete: false })).toBe("none");
    expect(closePrompt({ dirty: true, linksIncomplete: false })).toBe("discard");
    expect(closePrompt({ dirty: false, linksIncomplete: true })).toBe("incomplete");
    expect(closePrompt({ dirty: true, linksIncomplete: true })).toBe("incomplete");
    const text = closeDialogText("incomplete", false);
    expect(text.description).toContain("The contract was saved, but its DevCo accounts are incomplete.");
    expect(text).toMatchObject({ confirmText: "Close anyway", cancelText: "Keep editing" });
    expect(closeDialogText("discard", true).description).toContain("country or technology changed");
    expect(panelTitle(true, CONTRACT_TYPE.Construction)).toBe("New Construction Contract");
  });

  it("B-7: decimals take no sign and no trailing separator; -0 is normalised", () => {
    expect(isNDecimal("12.", 1, EN)).toBe(false);
    expect(isNDecimal("+5", 1, EN)).toBe(false);
    expect(isNDecimal("-0", 1, EN)).toBe(false);
    expect(isNDecimal("12,", 2, DE)).toBe(false);
    expect(isNDecimal("5", 1, EN)).toBe(true);
    expect(Object.is(parseLocaleNumber("-0", EN), 0)).toBe(true);
    const pct = (t: string) => validateForm(validForm({ margin: true, marginType: MARGIN_TYPE.Percentage, marginPercentageText: t }), EN, "en-US").marginPercentage;
    expect(pct("-5")).toBe(MSG.oneDecimal);
    expect(pct("12.")).toBe(MSG.oneDecimal);
  });

  it("G-5 / DR-2: inactive standard contracts are kept, flagged, and still count toward the limit", () => {
    expect(INCLUDE_INACTIVE_STANDARD_CONTRACTS).toBe(true);
    expect(isInactive(contract({ id: "x", stateCode: 1 }))).toBe(true);
    expect(isInactive(contract({ id: "y", stateCode: 0 }))).toBe(false);
    const rows = Array.from({ length: CONTRACT_LIMIT }, (_, i) => contract({ id: `d${i}`, stateCode: i === 0 ? 1 : 0 }));
    expect(limitFlags(rows).developmentFull).toBe(true);
  });
});
