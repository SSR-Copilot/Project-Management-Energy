/**
 * Admin Contract Screen — unit tests (UT-ADCONTR-nnn).
 *
 * Rewritten 19 Oct 2026 (D23) for the connected screen. Removed with the code they tested:
 * 001b (the invented country scope), 026 (the client-side RootCapexAccount write — a plugin sets
 * it), 032/033 (Apply, out of scope, D20). 035 now pins the parent-only delete.
 */
import { describe, it, expect } from "vitest";
import {
  CHOICE_ADMIN, CAPEX_ROOT_NUMBER, CAPEX_CONTRACT_TREE_EXCLUDED_NUMBER,
  CAPEX_SECOND_ROOT_NUMBER,
} from "@/data/dataverseNames";
import { createdRowRef } from "@/data/writePlan";
import {
  MSG, CONTRACT_CAP, CONTRACT_COSTS_MAX, CONTRACT_TYPE_VALUE, CONTRACT_TYPE_LABELS,
  CONTRACT_PICKER_TECHNOLOGIES, CLOSING_DATE_CLUSTER_4, CONTRACT_SCREEN_TEXT as T,
  BOP_CONTRACT_COL, BOP_CONTRACT_ENTITY_SET, DEVCO_COST_COL, DEVCO_COST_ENTITY_SET,
  BOP_LOOKUP, ROOT_ACCOUNT_RANK, UNRANKED_ROOT_ACCOUNT, CLOSING_DATE_RULE_NOTE,
  buildContractAccountTree, selectableNodes, classifyAccounts, devCoFormGroups, leafChecked,
  parentTriState, parentTriStateAvailableSemantics, parentToggleEnabled, toggleParent,
  toggleAccount, nextExpandedId, countContracts, contractCapReached, toggleCard, openCardAfterSave,
  sortContracts, signedMonthDifference, isValidMonthDifference, monthDifferenceErrorVisible,
  monthDifferenceSaveTerm, monthDifferenceSaveTermCanvasParity, marginPercentageError,
  marginFixedValueError, marginFields, closingDateLabelVisible, validateContract,
  canSaveContract, duplicateDescriptionCheckExists, changeMargin, changeMarginType,
  reconcileDevCoCosts, composeContractName, buildContractPayload, buildDevCoCostPayload,
  planSaveContract, planDeleteContract, groupCostsForCard, rootAccountRank,
  cardMarginHeading, cardMarginValue, cardShowsMarginDetails, cardMarginText, marginCurrency,
  emptyContractForm, toContractForm, monthPrefillCanvasParity, buildContractPicker,
  defaultContractScope, scopeFor, selectedAccountCount, contractTypeLabel,
  type CapexAccount, type BopContract, type DevCoCost, type ContractScope,
  type ContractForm, type AccountSelection, type ContractCountry,
} from "./rules";

/* ─────────────────────────────────────────────────────────────────── fixtures */

const acc = (o: Partial<CapexAccount> = {}): CapexAccount => ({
  id: "a", name: "Account", number: "10000", order: 1, parentId: null, status: 0,
  owningBusinessUnitId: null, ...o,
});

/** root 00001 → 2 categories → 1 account each → 3 subaccounts under the first. */
const accounts: CapexAccount[] = [
  acc({ id: "root", number: CAPEX_ROOT_NUMBER, name: "Root" }),
  acc({ id: "root2", number: CAPEX_SECOND_ROOT_NUMBER, name: "Second root" }),
  acc({ id: "cat1", number: "10000", name: "Development Expenses", parentId: "root", order: 1 }),
  acc({ id: "cat2", number: "20000", name: "Other CAPEX", parentId: "root", order: 2 }),
  acc({
    id: "excluded", number: CAPEX_CONTRACT_TREE_EXCLUDED_NUMBER, name: "Excluded",
    parentId: "root", order: 3,
  }),
  acc({ id: "ac1", number: "10001", name: "Grid", parentId: "cat1", order: 1 }),
  acc({ id: "ac1b", number: "10002", name: "Roads", parentId: "cat1", order: 2 }),
  acc({ id: "s1", number: "10001_01", name: "Cabling", parentId: "ac1", order: 1 }),
  acc({ id: "s2", number: "10001_02", name: "Transformer", parentId: "ac1", order: 2 }),
  acc({ id: "s3", number: "10001_03", name: "Substation", parentId: "ac1", order: 3 }),
  acc({ id: "s5", number: "10002_01", name: "Access road", parentId: "ac1b", order: 1 }),
  acc({ id: "ac2", number: "20001", name: "Misc", parentId: "cat2", order: 1 }),
  acc({ id: "s4", number: "20001_01", name: "Other", parentId: "ac2", order: 1 }),
  acc({ id: "underSecondRoot", number: "99999", name: "Elsewhere", parentId: "root2", order: 1 }),
];

const tree = buildContractAccountTree(accounts);
const names = new Map(accounts.map((a) => [a.id, a.name]));
const nameOf = (id: string | null) => (id ? names.get(id) ?? "" : "");

const scope = (o: Partial<ContractScope> = {}): ContractScope => ({
  countryId: "de", countryName: "Germany", technology: "Wind",
  technologyValue: CHOICE_ADMIN.technology.wind, isoCurrencyCode: "EUR", ...o,
});

const DEV = CHOICE_ADMIN.bopContractTypes.development;
const CON = CHOICE_ADMIN.bopContractTypes.construction;

const contract = (o: Partial<BopContract> = {}): BopContract => ({
  id: "c1", name: "Development Contract - BoP 2026", description: "BoP 2026",
  countryId: "de", technology: CHOICE_ADMIN.technology.wind,
  contractType: DEV,
  closingDateReference: 952850000, monthDifference: 6,
  margin: false, marginType: null, marginPercentage: null, marginFixedValue: null,
  comment: null,
  ...o,
});

const cost = (o: Partial<DevCoCost> = {}): DevCoCost => ({
  id: "dc1", contractId: "c1", capexAccountId: "s1", rootAccountId: "cat1", ...o,
});

const form = (o: Partial<ContractForm> = {}): ContractForm => ({
  ...emptyContractForm(),
  description: "BoP 2026",
  closingDateReference: 952850000,
  monthSign: "+", months: "6",
  dirty: true,
  ...o,
});

const sel = (o: Partial<AccountSelection> = {}): AccountSelection => ({
  accountId: "s1", selected: false, used: false, usedByContractId: null,
  devCoCostId: null, ...o,
});

const countries: ContractCountry[] = [
  { id: "fr", name: "France", isoCurrencyCode: "EUR" },
  { id: "es", name: "Spain", isoCurrencyCode: "EUR" },
  { id: "pl", name: "Poland", isoCurrencyCode: "PLN" },
  { id: "de", name: "Germany", isoCurrencyCode: null },
];

/* ═══════════════════════════════════════════════════════════ permission, scope ════ */

describe("permission and scope", () => {
  it("UT-ADCONTR-001 without the admin rule no plan writes anything", () => {
    const plan = planSaveContract({
      form: form(), contractType: DEV, scope: scope(), existing: null,
      before: new Map(), after: new Map([["s1", sel({ selected: true })]]), tree, canEdit: false,
    });
    expect(plan.writes).toHaveLength(0);
    expect(plan.refusedReason).toBe(MSG.noPermission);
    expect(planDeleteContract({ contract: contract(), canEdit: false }).refusedReason).toBe(MSG.noPermission);
  });

  it("UT-ADCONTR-002 contracts are scoped by country and technology", () => {
    const rows = [
      contract({ id: "in" }),
      contract({ id: "otherCountry", countryId: "fr" }),
      contract({ id: "otherTech", technology: CHOICE_ADMIN.technology.pv }),
    ];
    expect(countContracts(rows, scope(), "development")).toBe(1);
    expect(countContracts(rows, scope({ countryId: "fr" }), "development")).toBe(1);
  });

  it("UT-ADCONTR-002b the picker excludes Spain/Greece/Romania and nests Wind, PV and BESS", () => {
    expect(CONTRACT_PICKER_TECHNOLOGIES).toEqual(["Wind", "PV", "BESS"]);
    const picker = buildContractPicker(countries);
    expect(picker.countries.map((c) => c.name)).toEqual(["Germany", "France", "Poland"]);
    expect(picker.nestings[0]!.childs.map((c) => c.value)).toEqual(["Wind", "PV", "BESS"]);
  });

  it("UT-ADCONTR-002c the initial scope is the first rail row and its first technology", () => {
    expect(defaultContractScope(countries)).toEqual({
      countryId: "de", countryName: "Germany", technology: "Wind",
      technologyValue: CHOICE_ADMIN.technology.wind, isoCurrencyCode: null,
    });
    expect(defaultContractScope([]).countryId).toBeNull();
    expect(scopeFor(countries[2]!, "BESS")).toMatchObject({
      countryName: "Poland", technologyValue: CHOICE_ADMIN.technology.bess, isoCurrencyCode: "PLN",
    });
  });
});

/* ═════════════════════════════════════════════════════════════════ the tree ════ */

describe("the CAPEX account tree", () => {
  it("UT-ADCONTR-003 account 10006 is excluded", () => {
    expect(selectableNodes(tree).some((n) => n.number === CAPEX_CONTRACT_TREE_EXCLUDED_NUMBER))
      .toBe(false);
    expect(tree.some((n) => n.number === CAPEX_CONTRACT_TREE_EXCLUDED_NUMBER)).toBe(false);
  });

  it("UT-ADCONTR-004 only the 00001 subtree is returned", () => {
    expect(tree.map((n) => n.id)).toEqual(["cat1", "cat2"]);
    expect(selectableNodes(tree).map((n) => n.id)).not.toContain("underSecondRoot");
  });

  it("UT-ADCONTR-005 only level-3 nodes are selectable", () => {
    expect(selectableNodes(tree).map((n) => n.id)).toEqual(["s1", "s2", "s3", "s5", "s4"]);
    expect(selectableNodes(tree).every((n) => n.level === 3)).toBe(true);
  });

  it("UT-ADCONTR-005b the DevCo form groups by LEVEL-1 category, listing all its level-3 rows flat", () => {
    const groups = devCoFormGroups(tree);
    expect(groups.map((g) => g.category.id)).toEqual(["cat1", "cat2"]);
    expect(groups[0]!.leaves.map((l) => l.id)).toEqual(["s1", "s2", "s3", "s5"]);
    expect(groups[1]!.leaves.map((l) => l.id)).toEqual(["s4"]);
  });

  it("UT-ADCONTR-005c a category with no level-3 rows is still listed", () => {
    const t = buildContractAccountTree([
      ...accounts, acc({ id: "cat3", number: "30000", name: "Empty", parentId: "root", order: 4 }),
    ]);
    const g = devCoFormGroups(t).find((x) => x.category.id === "cat3");
    expect(g?.leaves).toEqual([]);
  });
});

/* ══════════════════════════════════════════════════════════════ classification ════ */

describe("classifying the accounts", () => {
  it("UT-ADCONTR-006 editing marks this contract's own accounts Selected", () => {
    const map = classifyAccounts(
      tree,
      [
        cost({ id: "dc1", capexAccountId: "s1", contractId: "c1" }),
        cost({ id: "dc2", capexAccountId: "s2", contractId: "c1" }),
        cost({ id: "dc3", capexAccountId: "s3", contractId: "c2" }),
      ],
      "c1",
    );
    expect([...map.values()].filter((x) => x.selected).map((x) => x.accountId)).toEqual(["s1", "s2"]);
    expect([...map.values()].filter((x) => x.used).map((x) => x.accountId)).toEqual(["s3"]);
    expect(map.get("s3")?.usedByContractId).toBe("c2");
    expect(map.get("s1")?.devCoCostId).toBe("dc1");
  });

  it("UT-ADCONTR-007 a NEW contract owns nothing — every claimed account is Used", () => {
    const map = classifyAccounts(
      tree,
      [
        cost({ id: "dc1", capexAccountId: "s1", contractId: "c1" }),
        cost({ id: "dc3", capexAccountId: "s3", contractId: "c2" }),
      ],
      null,
    );
    expect([...map.values()].filter((x) => x.selected)).toHaveLength(0);
    expect([...map.values()].filter((x) => x.used)).toHaveLength(2);
    expect(map.get("s4")?.used).toBe(false);
  });

  it("UT-ADCONTR-007b a used row reads ticked (Checked = Or(Selected, Used))", () => {
    expect(leafChecked(sel({ used: true }))).toBe(true);
    expect(leafChecked(sel({ selected: true }))).toBe(true);
    expect(leafChecked(sel())).toBe(false);
    expect(leafChecked(undefined)).toBe(false);
  });
});

/* ══════════════════════════════════════════════════════════════ the tri-state ════ */

describe("the tri-state parent checkbox", () => {
  const children = (o: Partial<AccountSelection>[]) =>
    o.map((x, i) => sel({ accountId: `s${i}`, ...x }));

  it("UT-ADCONTR-008 LOCKED when every child is used", () => {
    expect(parentTriState(children([{ used: true }, { used: true }]))).toBe("LOCKED");
  });

  it("UT-ADCONTR-009 UNCHECKED when none is selected", () => {
    expect(parentTriState(children([{}, {}, { used: true }]))).toBe("UNCHECKED");
  });

  it("UT-ADCONTR-010 PARTIAL with a mix", () => {
    expect(parentTriState(children([{ selected: true }, {}, { used: true }]))).toBe("PARTIAL");
  });

  it("UT-ADCONTR-011 CHECKED needs EVERY child, used ones included (canvas semantics)", () => {
    expect(parentTriState(children([{ selected: true }, { selected: true }]))).toBe("CHECKED");
    const mixed = children([{ selected: true }, { selected: true }, { used: true }]);
    expect(parentTriState(mixed)).toBe("PARTIAL");
    expect(parentTriStateAvailableSemantics(mixed)).toBe("CHECKED");
  });

  it("UT-ADCONTR-012 the parent toggle never selects a used child", () => {
    const after = toggleParent(children([{}, {}, { used: true }]));
    expect(after.map((c) => c.selected)).toEqual([true, true, false]);
  });

  it("UT-ADCONTR-013 toggling a partly selected header clears only the free children", () => {
    const after = toggleParent(children([{ selected: true }, {}, { used: true, selected: true }]));
    expect(after.map((c) => c.selected)).toEqual([false, false, true]);
  });

  it("UT-ADCONTR-014 the parent control is disabled when nothing is available", () => {
    expect(parentToggleEnabled(children([{ used: true }, { used: true }]))).toBe(false);
    expect(parentToggleEnabled(children([{ used: true }, {}]))).toBe(true);
  });

  it("UT-ADCONTR-014b a single toggle never flips a used node", () => {
    const map = new Map([
      ["s1", sel({ accountId: "s1" })],
      ["s2", sel({ accountId: "s2", used: true })],
    ]);
    expect(toggleAccount(map, "s1").get("s1")?.selected).toBe(true);
    expect(toggleAccount(map, "s2").get("s2")?.selected).toBe(false);
  });

  it("UT-ADCONTR-038 the DevCo form headers are an accordion", () => {
    expect(nextExpandedId(null, "cat1")).toBe("cat1");
    expect(nextExpandedId("cat1", "cat2")).toBe("cat2");
    expect(nextExpandedId("cat1", "cat1")).toBeNull();
  });
});

/* ══════════════════════════════════════════════════════════════════ validation ════ */

describe("validation", () => {
  it("UT-ADCONTR-015 Save is disabled with no account selected", () => {
    expect(validateContract(form(), { selectedCount: 0, isEdit: false })).toContain(MSG.noAccountSelected);
    expect(canSaveContract(form(), { selectedCount: 0, isEdit: false, canEdit: true })).toBe(false);
    expect(canSaveContract(form(), { selectedCount: 1, isEdit: false, canEdit: true })).toBe(true);
    expect(canSaveContract(form(), { selectedCount: 1, isEdit: false, canEdit: false })).toBe(false);
  });

  it("UT-ADCONTR-016 Save is disabled when the panel is not dirty", () => {
    expect(validateContract(form({ dirty: false }), { selectedCount: 1, isEdit: false })).toContain(MSG.notDirty);
  });

  it("UT-ADCONTR-016b SOURCE DEFECT fixed: the panel opens clean every time", () => {
    // The canvas `locContractDevCoCostsCahnged` is never reset, so Save stayed enabled.
    expect(toContractForm(contract()).dirty).toBe(false);
    expect(toContractForm(null).dirty).toBe(false);
  });

  it("UT-ADCONTR-017 the trimmed description is required", () => {
    expect(validateContract(form({ description: "  " }), { selectedCount: 1, isEdit: false })).toContain(MSG.inputBlank);
  });

  it("UT-ADCONTR-017b there is NO duplicate-description check, by design", () => {
    expect(duplicateDescriptionCheckExists()).toBe(false);
    expect(CLOSING_DATE_RULE_NOTE).toContain("no duplicate-description check");
    expect(validateContract(form(), { selectedCount: 1, isEdit: false })).toEqual([]);
  });

  it("UT-ADCONTR-018 the margin percentage label: canvas texts, hidden when blank", () => {
    expect(marginPercentageError("12.34")).toBe("Numeric value with maximum of one decimals");
    expect(marginPercentageError("150.0")).toBe("Please select a value between 0 and 100.0");
    expect(marginPercentageError("12.3")).toBeNull();
    expect(marginPercentageError("")).toBeNull();
    const pct = { margin: true, marginType: CHOICE_ADMIN.contractMarginType.percentage };
    expect(validateContract(form({ ...pct, marginPercentage: "150.0" }), { selectedCount: 1, isEdit: false }))
      .toContain(MSG.outOfRange("100.0"));
    expect(validateContract(form({ ...pct, marginPercentage: " " }), { selectedCount: 1, isEdit: false }))
      .toContain(MSG.inputBlank);
  });

  it("UT-ADCONTR-019 the fixed value: two decimals within 0 – 1,000,000,000", () => {
    expect(CONTRACT_COSTS_MAX).toBe(1_000_000_000);
    expect(marginFixedValueError("1000000000.01")).toBe("Please select a value between 0 and 1,000,000,000");
    expect(marginFixedValueError("1000.00")).toBeNull();
    expect(marginFixedValueError("1000.001")).toBe("Numeric value with maximum of two decimals");
    expect(MSG.inputBlank).toBe("Input must not be blank");
  });

  it("UT-ADCONTR-019b a Margin Type other than Percentage takes the Fixed branch", () => {
    const f = form({ margin: true, marginType: null, marginFixedValue: "" });
    expect(validateContract(f, { selectedCount: 1, isEdit: false })).toContain(MSG.inputBlank);
    expect(validateContract({ ...f, marginFixedValue: "10.00" }, { selectedCount: 1, isEdit: false })).toEqual([]);
  });

  it("UT-ADCONTR-020 Margin = No clears the type and both values", () => {
    expect(marginFields(false, CHOICE_ADMIN.contractMarginType.percentage, "12.3", "500.00"))
      .toEqual({ margin: false, marginType: null, marginPercentage: null, marginFixedValue: null });
    const payload = buildContractPayload(
      form({ margin: false, marginType: CHOICE_ADMIN.contractMarginType.percentage, marginPercentage: "12.3" }),
      { contractType: DEV, scope: scope() },
    );
    expect(payload[BOP_CONTRACT_COL.marginType]).toBeNull();
    expect(payload[BOP_CONTRACT_COL.marginPercentage]).toBeNull();
    expect(payload[BOP_CONTRACT_COL.marginFixedValue]).toBeNull();
  });

  it("UT-ADCONTR-020b the two margin values are mutually exclusive", () => {
    const pct = marginFields(true, CHOICE_ADMIN.contractMarginType.percentage, "12.3", "500.00");
    expect(pct).toEqual({
      margin: true, marginType: CHOICE_ADMIN.contractMarginType.percentage,
      marginPercentage: 12.3, marginFixedValue: null,
    });
    const fixed = marginFields(true, CHOICE_ADMIN.contractMarginType.fixedValue, "12.3", "500.00");
    expect(fixed.marginPercentage).toBeNull();
    expect(fixed.marginFixedValue).toBe(500);
  });

  it("UT-ADCONTR-020c changing Margin or Margin Type resets both values to 0 and marks dirty", () => {
    const f = form({ dirty: false, marginPercentage: "12.3", marginFixedValue: "99" });
    expect(changeMargin(f, true)).toMatchObject({ margin: true, marginPercentage: "0", marginFixedValue: "0", dirty: true });
    expect(changeMarginType(f, CHOICE_ADMIN.contractMarginType.fixedValue)).toMatchObject({
      marginType: CHOICE_ADMIN.contractMarginType.fixedValue, marginPercentage: "0", marginFixedValue: "0", dirty: true,
    });
  });

  it("UT-ADCONTR-021 the month difference must be one or two digits", () => {
    expect(isValidMonthDifference("123")).toBe(false);
    expect(isValidMonthDifference("6")).toBe(true);
    expect(isValidMonthDifference("12")).toBe(true);
    expect(isValidMonthDifference("-6")).toBe(false);
    expect(monthDifferenceErrorVisible("123")).toBe(true);
    expect(monthDifferenceErrorVisible("")).toBe(false);
  });

  it("UT-ADCONTR-021b SOURCE DEFECT fixed: Save requires a valid month, the canvas only non-blank", () => {
    expect(monthDifferenceSaveTermCanvasParity("abc")).toBe(true);
    expect(monthDifferenceSaveTerm("abc")).toBe(false);
    expect(monthDifferenceSaveTerm("12")).toBe(true);
    expect(monthDifferenceSaveTerm("")).toBe(false);
    expect(validateContract(form({ months: "123" }), { selectedCount: 1, isEdit: false })).toContain(MSG.monthDifference);
  });

  it("UT-ADCONTR-022 the minus sign negates the month difference", () => {
    expect(signedMonthDifference("−", "6")).toBe(-6);
    expect(signedMonthDifference("+", "6")).toBe(6);
    const payload = buildContractPayload(form({ monthSign: "−", months: "6" }), { contractType: DEV, scope: scope() });
    expect(payload[BOP_CONTRACT_COL.monthDifference]).toBe(-6);
  });

  it("UT-ADCONTR-039 the closing-date label is edit-only; the date itself is always required", () => {
    expect(closingDateLabelVisible(true, null)).toBe(true);
    expect(closingDateLabelVisible(false, null)).toBe(false);
    expect(validateContract(form({ closingDateReference: null }), { selectedCount: 1, isEdit: true }))
      .toContain(MSG.closingDateEmpty);
  });

  it("UT-ADCONTR-040 a NEW contract defaults to Cluster 4, Margin No and Percentage", () => {
    const f = emptyContractForm();
    expect(f.closingDateReference).toBe(CLOSING_DATE_CLUSTER_4);
    expect(f.margin).toBe(false);
    expect(f.marginType).toBe(CHOICE_ADMIN.contractMarginType.percentage);
    expect(f.monthSign).toBe("+");
    expect(validateContract(form({ closingDateReference: null }), { selectedCount: 1, isEdit: false }))
      .toContain(MSG.closingDateEmpty);
  });

  it("UT-ADCONTR-040b the form round-trips a stored contract, sign included", () => {
    expect(toContractForm(contract({ monthDifference: -6 }))).toMatchObject({ monthSign: "−", months: "6" });
    expect(toContractForm(contract({ monthDifference: 6 }))).toMatchObject({ monthSign: "+", months: "6" });
    // `Value(n) > 0` → "+", otherwise "-": zero shows "-" (it saves 0 either way).
    expect(toContractForm(contract({ monthDifference: 0 }))).toMatchObject({ monthSign: "−", months: "0" });
    expect(toContractForm(contract({ closingDateReference: null })).closingDateReference).toBe(CLOSING_DATE_CLUSTER_4);
    expect(toContractForm(null)).toEqual(emptyContractForm());
  });

  it("UT-ADCONTR-040c SOURCE DEFECT fixed: the stored month is always prefilled", () => {
    expect(toContractForm(contract({ monthDifference: -3 })).months).toBe("3");
    expect(monthPrefillCanvasParity(contract({ monthDifference: -3 }), false)).toBe("");
    expect(monthPrefillCanvasParity(contract({ monthDifference: -3 }), true)).toBe("3");
  });
});

/* ═══════════════════════════════════════════════════════════════════ the caps ════ */

describe("the ten-contract caps", () => {
  const ten = (type: "development" | "construction") =>
    Array.from({ length: CONTRACT_CAP }, (_, i) => contract({ id: `c${i}`, contractType: CONTRACT_TYPE_VALUE[type] }));

  it("UT-ADCONTR-027 Add is disabled at ten development contracts", () => {
    expect(contractCapReached(ten("development"), scope(), "development")).toBe(true);
    expect(contractCapReached(ten("development").slice(1), scope(), "development")).toBe(false);
    expect(MSG.capReached("development", "Germany", "Wind")).toBe("Maximum 10 development contracts allowed for Germany - Wind");
  });

  it("UT-ADCONTR-028 the cap is per contract type, with the corrected option values", () => {
    expect(CONTRACT_TYPE_VALUE).toEqual({ development: 952850001, construction: 952850002 });
    const rows = [...ten("development"), contract({ id: "x1", contractType: CON })];
    expect(contractCapReached(rows, scope(), "development")).toBe(true);
    expect(contractCapReached(rows, scope(), "construction")).toBe(false);
    // A None (952850000) row counts as neither.
    expect(countContracts([contract({ contractType: CHOICE_ADMIN.bopContractTypes.none })], scope(), "development")).toBe(0);
  });

  it("UT-ADCONTR-029 the cap recomputes from the live list", () => {
    const nine = ten("development").slice(1);
    expect(contractCapReached([...nine, contract({ id: "new" })], scope(), "development")).toBe(true);
    expect(contractCapReached([...nine, contract({ id: "fr", countryId: "fr" })], scope(), "development")).toBe(false);
  });

  it("UT-ADCONTR-037 a scope with no contracts allows both Adds", () => {
    expect(contractCapReached([], scope(), "development")).toBe(false);
    expect(contractCapReached([], scope(), "construction")).toBe(false);
  });
});

/* ═════════════════════════════════════════════════════════════════════ the save ════ */

describe("the save", () => {
  it("UT-ADCONTR-023 the name is Text(type) & \" - \" & description, untrimmed; every column on every save", () => {
    expect(CONTRACT_TYPE_LABELS[DEV]).toBe("Development Contract");
    expect(CONTRACT_TYPE_LABELS[CON]).toBe("Construction Contract");
    expect(contractTypeLabel(null)).toBe("");
    expect(composeContractName(DEV, "BoP 2026 ")).toBe("Development Contract - BoP 2026 ");
    const payload = buildContractPayload(form({ comment: "" }), { contractType: CON, scope: scope() });
    expect(payload).toMatchObject({
      [BOP_CONTRACT_COL.name]: "Construction Contract - BoP 2026",
      [BOP_CONTRACT_COL.description]: "BoP 2026",
      [BOP_CONTRACT_COL.contractTypes]: CON,
      [BOP_CONTRACT_COL.technology]: CHOICE_ADMIN.technology.wind,
      [BOP_CONTRACT_COL.comment]: null,
      [`${BOP_LOOKUP.contractCountry}@odata.bind`]: "/vsb_countries(de)",
    });
    expect(Object.keys(payload).some((k) => k.startsWith("owningbusinessunit"))).toBe(false);
  });

  it("UT-ADCONTR-024 reconcile computes the deletes and the creates", () => {
    const before = new Map([
      ["A", sel({ accountId: "A", selected: true, devCoCostId: "dcA" })],
      ["B", sel({ accountId: "B", selected: true, devCoCostId: "dcB" })],
      ["C", sel({ accountId: "C" })],
    ]);
    const after = new Map([
      ["A", sel({ accountId: "A", selected: false, devCoCostId: "dcA" })],
      ["B", sel({ accountId: "B", selected: true, devCoCostId: "dcB" })],
      ["C", sel({ accountId: "C", selected: true })],
    ]);
    expect(reconcileDevCoCosts(before, after)).toEqual({ toDelete: ["dcA"], toCreate: ["C"] });
  });

  it("UT-ADCONTR-024b reconcile never touches another contract's rows", () => {
    const before = new Map([["X", sel({ accountId: "X", used: true, usedByContractId: "c9" })]]);
    const after = new Map([["X", sel({ accountId: "X", used: true, selected: true })]]);
    expect(reconcileDevCoCosts(before, after)).toEqual({ toDelete: [], toCreate: [] });
  });

  it("UT-ADCONTR-025 an edit is update → deletes → creates, children bound to the contract", () => {
    const before = classifyAccounts(tree, [cost({ id: "dcA", capexAccountId: "s1" })], "c1");
    const after = new Map(before);
    after.set("s1", { ...after.get("s1")!, selected: false });
    after.set("s2", { ...after.get("s2")!, selected: true });
    const plan = planSaveContract({
      form: form(), contractType: DEV, scope: scope(), existing: contract(), before, after, tree, canEdit: true,
    });
    expect(plan.writes.map((w) => `${w.op} ${w.entitySet}`)).toEqual([
      `update ${BOP_CONTRACT_ENTITY_SET}`, `delete ${DEVCO_COST_ENTITY_SET}`, `create ${DEVCO_COST_ENTITY_SET}`,
    ]);
    expect(plan.writes[0]!.id).toBe("c1");
    expect(plan.writes[1]!.id).toBe("dcA");
    expect(plan.writes[2]!.data![`${BOP_LOOKUP.contract}@odata.bind`]).toBe(`/${BOP_CONTRACT_ENTITY_SET}(c1)`);
  });

  it("UT-ADCONTR-025b a create binds every child to the contract created first in the plan", () => {
    const after = classifyAccounts(tree, [], null);
    after.set("s1", { ...after.get("s1")!, selected: true });
    after.set("s4", { ...after.get("s4")!, selected: true });
    const plan = planSaveContract({
      form: form(), contractType: DEV, scope: scope(), existing: null, before: new Map(after), after, tree, canEdit: true,
    });
    expect(plan.writes.map((w) => w.op)).toEqual(["create", "create", "create"]);
    expect(plan.writes[0]!.entitySet).toBe(BOP_CONTRACT_ENTITY_SET);
    for (const w of plan.writes.slice(1)) {
      expect(w.data![`${BOP_LOOKUP.contract}@odata.bind`]).toBe(`/${BOP_CONTRACT_ENTITY_SET}(${createdRowRef(0)})`);
    }
  });

  it("UT-ADCONTR-026 a child is {Name, contract, CAPEX account, crc36 Country, crc36 Technology} — no RootCapexAccount", () => {
    const payload = buildDevCoCostPayload({
      node: selectableNodes(tree).find((n) => n.id === "s1")!, contractRef: "c1", scope: scope(),
    });
    expect(payload).toEqual({
      [DEVCO_COST_COL.name]: "10001_01-Cabling",
      [`${BOP_LOOKUP.contract}@odata.bind`]: `/${BOP_CONTRACT_ENTITY_SET}(c1)`,
      [`${BOP_LOOKUP.capexAccount}@odata.bind`]: "/vsb_capexaccountlists(s1)",
      [DEVCO_COST_COL.technology]: CHOICE_ADMIN.technology.wind,
      "crc36_Country@odata.bind": "/vsb_countries(de)",
    });
    expect(DEVCO_COST_COL.technology).toBe("crc36_technology");
    expect(DEVCO_COST_COL.country).toBe("_crc36_country_value");
    expect(DEVCO_COST_COL.id).toBe("vsb_bopcontractsstandardassumptiondevcocostsid");
    expect(BOP_CONTRACT_COL.id).toBe("vsb_bopcontractsstandardassumptionsid");
  });

  it("UT-ADCONTR-035 delete removes the contract only (cascade + plugin do the rest)", () => {
    const plan = planDeleteContract({ contract: contract(), canEdit: true });
    expect(plan.writes).toEqual([
      expect.objectContaining({ op: "delete", entitySet: BOP_CONTRACT_ENTITY_SET, id: "c1" }),
    ]);
  });

  it("UT-ADCONTR-036 a refused save sends nothing and leaves the selection untouched", () => {
    const after = new Map([["s1", sel({ selected: true })]]);
    const plan = planSaveContract({
      form: form({ description: "" }), contractType: DEV, scope: scope(), existing: null,
      before: new Map(), after, tree, canEdit: true,
    });
    expect(plan.writes).toHaveLength(0);
    expect(plan.refusedReason).toBe(MSG.inputBlank);
    expect(after.get("s1")?.selected).toBe(true);
    expect(selectedAccountCount(after)).toBe(1);
  });

  it("UT-ADCONTR-036b the canvas progress and error texts", () => {
    expect(MSG.saving).toBe("Please wait, saving...");
    expect(MSG.deleting).toBe("Please wait, deleting...");
    expect(MSG.saveError("boom")).toBe("Error saving Contract: boom");
  });
});

/* ═══════════════════════════════════════════════════════════════════ the cards ════ */

describe("the contract cards", () => {
  it("UT-ADCONTR-030 accounts are grouped by root account in rank order", () => {
    const groups = groupCostsForCard(
      [
        cost({ id: "a", rootAccountId: "cat2", capexAccountId: "s4" }),
        cost({ id: "b", rootAccountId: "cat1", capexAccountId: "s1" }),
      ],
      "c1", nameOf,
    );
    expect(groups.map((g) => g.rootAccountName)).toEqual(["Development Expenses", "Other CAPEX"]);
    expect(groups[0]!.subaccounts.map((x) => x.label)).toEqual(["Cabling"]);
    expect(ROOT_ACCOUNT_RANK["Other CAPEX"]).toBe(5);
    expect(T.devCoGroupHeading("Other CAPEX")).toBe("Other CAPEX :");
  });

  it("UT-ADCONTR-031 an unranked root account sorts last", () => {
    expect(rootAccountRank("Something new")).toBe(UNRANKED_ROOT_ACCOUNT);
    expect(rootAccountRank(null)).toBe(UNRANKED_ROOT_ACCOUNT);
    const groups = groupCostsForCard(
      [cost({ id: "a", rootAccountId: "ac1" }), cost({ id: "b", rootAccountId: "cat1" })], "c1", nameOf,
    );
    expect(groups.map((g) => g.rootAccountName)).toEqual(["Development Expenses", "Grid"]);
  });

  it("UT-ADCONTR-031b the card shows only this contract's accounts", () => {
    const groups = groupCostsForCard([cost({ id: "a", contractId: "c1" }), cost({ id: "b", contractId: "c2" })], "c1", nameOf);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.subaccounts).toHaveLength(1);
  });

  it("UT-ADCONTR-041 cards fold independently; a saved card opens", () => {
    const one = toggleCard(new Set(), "c1");
    const two = toggleCard(one, "c2");
    expect([...two]).toEqual(["c1", "c2"]);
    expect([...toggleCard(two, "c1")]).toEqual(["c2"]);
    expect([...openCardAfterSave(new Set(["c2"]), "c9")]).toEqual(["c2", "c9"]);
  });

  it("UT-ADCONTR-042 the cards sort by contract type, then name", () => {
    const rows = sortContracts([
      contract({ id: "b", contractType: CON, name: "A" }),
      contract({ id: "c", contractType: DEV, name: "Z" }),
      contract({ id: "a", contractType: DEV, name: "B" }),
    ]);
    expect(rows.map((r) => r.id)).toEqual(["a", "c", "b"]);
  });

  it("UT-ADCONTR-043 the margin details show only for Margin = Yes; the heading uses the ISO code", () => {
    expect(cardShowsMarginDetails(contract({ margin: false }))).toBe(false);
    expect(cardMarginText(contract({ margin: false }))).toBe("No");
    const fixed = contract({ margin: true, marginType: CHOICE_ADMIN.contractMarginType.fixedValue, marginFixedValue: 1500 });
    expect(cardShowsMarginDetails(fixed)).toBe(true);
    expect(cardMarginHeading(fixed, "PLN")).toBe("Margin Fixed Value [PLN]");
    expect(cardMarginHeading(fixed, null)).toBe("Margin Fixed Value [EUR]");
    expect(cardMarginValue(fixed)).toBe("1500");
    const pct = contract({ margin: true, marginType: CHOICE_ADMIN.contractMarginType.percentage, marginPercentage: 7.5 });
    expect(cardMarginHeading(pct, "PLN")).toBe("Margin [%]");
    expect(cardMarginValue(pct)).toBe("7.5");
    // The PANEL caption keeps its own Poland test.
    expect(marginCurrency("Poland")).toBe("PLN");
    expect(marginCurrency("Germany")).toBe("EUR");
  });

  it("UT-ADCONTR-044 the closing-date value and the panel title", () => {
    expect(T.closingDateValue("FID", -3)).toBe("FID - 3 months");
    expect(T.closingDateValue("Cluster 4", 0)).toBe("Cluster 4 + 0 months");
    expect(T.panelTitle(false, contractTypeLabel(DEV))).toBe("New Development Contract");
    expect(T.panelTitle(true, contractTypeLabel(CON))).toBe("Edit Construction Contract");
  });
});
