/**
 * Admin Contract Screen — unit tests.
 *
 * IDs are the spec's (UT-ADCONTR-nnn). Pure functions only; the "Integration" cases assert
 * the WRITE PLAN (which becomes one `$batch`), and 034 really invokes the missing-flow
 * wrapper rather than mocking it.
 */
import { describe, it, expect } from "vitest";
import { canSeeAdminSection, type CurrentUser } from "@/domain/session";
import {
  CHOICE_ADMIN, CAPEX_ROOT_NUMBER, CAPEX_CONTRACT_TREE_EXCLUDED_NUMBER,
  CAPEX_SECOND_ROOT_NUMBER,
} from "@/data/entities";
import { synchronizeStandardAssumptionCosts } from "@/flows/flowClient";
import {
  MSG, CONTRACT_CAP, CONTRACT_COSTS_MAX, CONTRACT_TYPE_VALUE, CONTRACT_TYPE_LABEL,
  BOP_CONTRACT_COL, BOP_CONTRACT_ENTITY_SET, DEVCO_COST_COL, DEVCO_COST_ENTITY_SET,
  BOP_LOOKUP, ROOT_ACCOUNT_RANK, UNRANKED_ROOT_ACCOUNT, CLOSING_DATE_RULE_NOTE,
  buildContractAccountTree, selectableNodes, classifyAccounts,
  parentTriState, parentTriStateAvailableSemantics, parentToggleEnabled, toggleParent,
  toggleAccount, nextExpandedId, countContracts, contractCapReached,
  signedMonthDifference, isValidMonthDifference, marginPercentageError,
  marginFixedValueError, marginFields, closingDateLabelVisible, validateContract,
  canSaveContract, canEditScope, duplicateDescriptionCheckExists,
  reconcileDevCoCosts, composeContractName, buildContractPayload, buildDevCoCostPayload,
  rootAccountFor, planSaveContract, planDeleteContract, groupCostsForCard,
  rootAccountRank, applyCommandState, synchronizeBopArgs,
  emptyContractForm, toContractForm, buildCountryPicker, COST_CONTRACT_EXCLUDED_COUNTRIES,
  type CapexAccount, type BopContract, type DevCoCost, type ContractScope,
  type ContractForm, type AccountSelection,
} from "./rules";

/* ─────────────────────────────────────────────────────────────────── fixtures */

const user = (o: Partial<CurrentUser> = {}): CurrentUser => ({
  id: "u-1", displayName: "A", mail: "a@vsb.energy", language: "en-US", lang: "en",
  roles: [], isApplicationAdministrator: false, isControllerOwnData: false,
  isProjectDataAllCountries: false, isProjectManagerOwnProjects: false, isDeveloper: false,
  canEditSelectedProject: false, editableCountries: [], editableCountriesAsString: "",
  ...o,
});

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
  acc({ id: "s1", number: "10001_01", name: "Cabling", parentId: "ac1", order: 1 }),
  acc({ id: "s2", number: "10001_02", name: "Transformer", parentId: "ac1", order: 2 }),
  acc({ id: "s3", number: "10001_03", name: "Substation", parentId: "ac1", order: 3 }),
  acc({ id: "ac2", number: "20001", name: "Misc", parentId: "cat2", order: 1 }),
  acc({ id: "s4", number: "20001_01", name: "Other", parentId: "ac2", order: 1 }),
  acc({ id: "underSecondRoot", number: "99999", name: "Elsewhere", parentId: "root2", order: 1 }),
];

const tree = buildContractAccountTree(accounts);

const scope = (o: Partial<ContractScope> = {}): ContractScope => ({
  countryId: "de", countryName: "Germany", technology: "Wind",
  technologyValue: CHOICE_ADMIN.technology.wind, ...o,
});

const contract = (o: Partial<BopContract> = {}): BopContract => ({
  id: "c1", name: "Development Contract - BoP 2026", description: "BoP 2026",
  countryId: "de", technology: CHOICE_ADMIN.technology.wind,
  contractType: CHOICE_ADMIN.bopContractTypes.development,
  closingDateReference: 952850000, monthDifference: 6,
  margin: false, marginType: null, marginPercentage: null, marginFixedValue: null,
  comment: null,
  ...o,
});

const cost = (o: Partial<DevCoCost> = {}): DevCoCost => ({
  id: "dc1", contractId: "c1", capexAccountId: "s1", rootAccountId: "ac1",
  rootAccountName: "Development Expenses", categoryName: "Cabling", ...o,
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

/* ═══════════════════════════════════════════════════════════════ permission ════ */

describe("permission and scope", () => {
  it("UT-ADCONTR-001 a non-admin is blocked and no plan writes anything", () => {
    expect(canSeeAdminSection(user())).toBe(false);
    const plan = planSaveContract({
      form: form(), type: "development", scope: scope(), existing: null, contractId: null,
      before: new Map(), after: new Map([["s1", sel({ selected: true })]]),
      tree, owningBusinessUnitId: null, canEdit: false,
    });
    expect(plan.writes).toHaveLength(0);
    expect(plan.refusedReason).toBe(MSG.outOfScope);
  });

  it("UT-ADCONTR-001b country scope gates the writes (new, absent from the canvas)", () => {
    const controller = user({
      isControllerOwnData: true, editableCountries: [{ id: "de", name: "Germany" }],
    });
    expect(canEditScope(controller, scope())).toBe(true);
    expect(canEditScope(controller, scope({ countryId: "fr" }))).toBe(false);
  });

  it("UT-ADCONTR-002 contracts are scoped by country and technology", () => {
    const rows = [
      contract({ id: "in" }),
      contract({ id: "otherCountry", countryId: "fr" }),
      contract({ id: "otherTech", technology: CHOICE_ADMIN.technology.pv }),
    ];
    expect(countContracts(rows, scope(), "development")).toBe(1);
    expect(countContracts(rows, scope({ countryId: "fr" }), "development")).toBe(1);
    // The picker itself excludes three countries and offers Wind/PV only.
    expect(
      buildCountryPicker(
        [{ id: "de", name: "Germany" }, { id: "es", name: "Spain" }],
        { exclude: COST_CONTRACT_EXCLUDED_COUNTRIES },
      ).map((c) => c.name),
    ).toEqual(["Germany"]);
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
    const all = selectableNodes(tree).map((n) => n.id);
    expect(all).not.toContain("underSecondRoot");
  });

  it("UT-ADCONTR-005 only level-3 nodes are selectable", () => {
    expect(selectableNodes(tree).map((n) => n.id)).toEqual(["s1", "s2", "s3", "s4"]);
    expect(selectableNodes(tree).every((n) => n.level === 3)).toBe(true);
    expect(tree[0].level).toBe(1);
    expect(tree[0].children[0].level).toBe(2);
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
    expect([...map.values()].filter((x) => x.selected).map((x) => x.accountId))
      .toEqual(["s1", "s2"]);
    expect([...map.values()].filter((x) => x.used).map((x) => x.accountId)).toEqual(["s3"]);
    expect(map.get("s3")?.usedByContractId).toBe("c2");
    expect(map.get("s1")?.devCoCostId).toBe("dc1");
  });

  it("UT-ADCONTR-007 a NEW contract owns nothing — every claimed account is Used", () => {
    const map = classifyAccounts(
      tree,
      [
        cost({ id: "dc1", capexAccountId: "s1", contractId: "c1" }),
        cost({ id: "dc2", capexAccountId: "s2", contractId: "c1" }),
        cost({ id: "dc3", capexAccountId: "s3", contractId: "c2" }),
      ],
      null,
    );
    expect([...map.values()].filter((x) => x.selected)).toHaveLength(0);
    expect([...map.values()].filter((x) => x.used)).toHaveLength(3);
    expect(map.get("s4")?.used).toBe(false);   // never claimed → free
  });
});

/* ══════════════════════════════════════════════════════════════ the tri-state ════ */

describe("the tri-state parent checkbox", () => {
  const children = (o: Partial<AccountSelection>[]) =>
    o.map((x, i) => sel({ accountId: `s${i}`, ...x }));

  it("UT-ADCONTR-008 LOCKED when every child is used", () => {
    expect(parentTriState(children([{ used: true }, { used: true }, { used: true }])))
      .toBe("LOCKED");
  });

  it("UT-ADCONTR-009 UNCHECKED when none is selected", () => {
    expect(parentTriState(children([{}, {}, { used: true }]))).toBe("UNCHECKED");
  });

  it("UT-ADCONTR-010 PARTIAL with a mix", () => {
    expect(parentTriState(children([{ selected: true }, {}, { used: true }])))
      .toBe("PARTIAL");
  });

  it("UT-ADCONTR-011 CHECKED needs EVERY child, used ones included (documented choice)", () => {
    expect(parentTriState(children([{ selected: true }, { selected: true }, { selected: true }])))
      .toBe("CHECKED");
    // With a used child present, the source semantics can never reach CHECKED…
    const mixed = children([{ selected: true }, { selected: true }, { used: true }]);
    expect(parentTriState(mixed)).toBe("PARTIAL");
    // …while the alternative semantics would. Both are tested; we ship the source one.
    expect(parentTriStateAvailableSemantics(mixed)).toBe("CHECKED");
  });

  it("UT-ADCONTR-012 the parent toggle never selects a used child", () => {
    const before = children([{}, {}, { used: true }]);
    const after = toggleParent(before);
    expect(after.map((c) => c.selected)).toEqual([true, true, false]);
    expect(after[2].used).toBe(true);
  });

  it("UT-ADCONTR-013 toggling off clears only the free children", () => {
    const before = children([{ selected: true }, { selected: true }, { used: true, selected: true }]);
    const after = toggleParent(before);
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

  it("UT-ADCONTR-038 expanding one node collapses the others (accordion)", () => {
    expect(nextExpandedId(null, "cat1")).toBe("cat1");
    expect(nextExpandedId("cat1", "cat2")).toBe("cat2");
    expect(nextExpandedId("cat1", "cat1")).toBeNull();
  });
});

/* ══════════════════════════════════════════════════════════════════ validation ════ */

describe("validation", () => {
  it("UT-ADCONTR-015 Save is disabled with no account selected", () => {
    expect(validateContract(form(), { selectedCount: 0, isEdit: false }))
      .toContain(MSG.noAccountSelected);
    expect(canSaveContract(form(), { selectedCount: 0, isEdit: false, canEdit: true }))
      .toBe(false);
    expect(canSaveContract(form(), { selectedCount: 1, isEdit: false, canEdit: true }))
      .toBe(true);
  });

  it("UT-ADCONTR-016 Save is disabled when the panel is not dirty", () => {
    expect(validateContract(form({ dirty: false }), { selectedCount: 1, isEdit: false }))
      .toContain(MSG.notDirty);
  });

  it("UT-ADCONTR-017 the description is required", () => {
    expect(validateContract(form({ description: "  " }), { selectedCount: 1, isEdit: false }))
      .toContain(MSG.descriptionBlank);
  });

  it("UT-ADCONTR-017b there is NO duplicate-description check, by design", () => {
    expect(duplicateDescriptionCheckExists()).toBe(false);
    expect(CLOSING_DATE_RULE_NOTE).toContain("no duplicate-description check");
    // Two contracts with the same description both validate.
    const errors = validateContract(form({ description: "BoP 2026" }), {
      selectedCount: 1, isEdit: false,
    });
    expect(errors).toEqual([]);
  });

  it("UT-ADCONTR-018 the margin percentage must be one decimal, 0–100", () => {
    expect(marginPercentageError("12.34")).toBe(MSG.marginPercentage);
    expect(marginPercentageError("150.0")).toBe(MSG.marginPercentage);
    expect(marginPercentageError("12.3")).toBeNull();
    expect(marginPercentageError("")).toBe(MSG.descriptionBlank);
    expect(validateContract(
      form({
        margin: true, marginType: CHOICE_ADMIN.contractMarginType.percentage,
        marginPercentage: "150.0",
      }),
      { selectedCount: 1, isEdit: false },
    )).toContain(MSG.marginPercentage);
  });

  it("UT-ADCONTR-019 the fixed value must be two decimals within the ceiling", () => {
    expect(CONTRACT_COSTS_MAX).toBe(1_000_000_000);
    expect(marginFixedValueError("1000000000.01")).toBe(MSG.marginFixedValue);
    expect(marginFixedValueError("1000.00")).toBeNull();
    expect(marginFixedValueError("1000.001")).toBe(MSG.marginFixedValue);
  });

  it("UT-ADCONTR-020 Margin = No clears the type and both values", () => {
    expect(marginFields(false, CHOICE_ADMIN.contractMarginType.percentage, "12.3", "500.00"))
      .toEqual({ margin: false, marginType: null, marginPercentage: null, marginFixedValue: null });
    const payload = buildContractPayload(
      form({
        margin: false, marginType: CHOICE_ADMIN.contractMarginType.percentage,
        marginPercentage: "12.3",
      }),
      { type: "development", scope: scope(), isCreate: false },
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

  it("UT-ADCONTR-021 the month difference must be one or two digits", () => {
    expect(isValidMonthDifference("123")).toBe(false);
    expect(isValidMonthDifference("6")).toBe(true);
    expect(isValidMonthDifference("12")).toBe(true);
    expect(isValidMonthDifference("-6")).toBe(false);
    expect(validateContract(form({ months: "123" }), { selectedCount: 1, isEdit: false }))
      .toContain(MSG.monthDifference);
  });

  it("UT-ADCONTR-022 the minus sign negates the month difference", () => {
    expect(signedMonthDifference("−", "6")).toBe(-6);
    expect(signedMonthDifference("+", "6")).toBe(6);
    expect(signedMonthDifference("+", "")).toBe(0);
    const payload = buildContractPayload(
      form({ monthSign: "−", months: "6" }),
      { type: "development", scope: scope(), isCreate: true },
    );
    expect(payload[BOP_CONTRACT_COL.monthDifference]).toBe(-6);
  });

  it("UT-ADCONTR-039 the closing-date rule fires when editing", () => {
    expect(closingDateLabelVisible(true, null)).toBe(true);
    expect(closingDateLabelVisible(true, 952850000)).toBe(false);
    expect(validateContract(
      form({ closingDateReference: null }), { selectedCount: 1, isEdit: true },
    )).toContain(MSG.closingDateEmpty);
  });

  it("UT-ADCONTR-040 a NEW contract is not blocked by the edit-only label", () => {
    // The LABEL is edit-only, exactly as in the source…
    expect(closingDateLabelVisible(false, null)).toBe(false);
    // …but the closing date is still required, which is the single effective rule.
    expect(canSaveContract(form(), { selectedCount: 1, isEdit: false, canEdit: true }))
      .toBe(true);
    expect(validateContract(
      form({ closingDateReference: null }), { selectedCount: 1, isEdit: false },
    )).toContain(MSG.closingDateEmpty);
  });

  it("UT-ADCONTR-040b the form round-trips a stored contract, sign included", () => {
    expect(toContractForm(contract({ monthDifference: -6 })))
      .toMatchObject({ monthSign: "−", months: "6" });
    expect(toContractForm(contract({ monthDifference: 6 })))
      .toMatchObject({ monthSign: "+", months: "6" });
    expect(toContractForm(null)).toEqual(emptyContractForm());
  });
});

/* ═══════════════════════════════════════════════════════════════════ the caps ════ */

describe("the ten-contract caps", () => {
  const ten = (type: "development" | "construction") =>
    Array.from({ length: CONTRACT_CAP }, (_, i) =>
      contract({ id: `c${i}`, contractType: CONTRACT_TYPE_VALUE[type] }));

  it("UT-ADCONTR-027 Add is DISABLED at ten development contracts (no toast path)", () => {
    expect(contractCapReached(ten("development"), scope(), "development")).toBe(true);
    expect(contractCapReached(ten("development").slice(1), scope(), "development")).toBe(false);
    expect(MSG.capReached("development", "Germany", "Wind"))
      .toBe("Maximum 10 development contracts allowed for Germany - Wind");
  });

  it("UT-ADCONTR-028 the cap is per contract type", () => {
    const rows = [
      ...ten("development"),
      contract({ id: "x1", contractType: CONTRACT_TYPE_VALUE.construction }),
      contract({ id: "x2", contractType: CONTRACT_TYPE_VALUE.construction }),
    ];
    expect(contractCapReached(rows, scope(), "development")).toBe(true);
    expect(contractCapReached(rows, scope(), "construction")).toBe(false);
  });

  it("UT-ADCONTR-029 the cap recomputes from the live list, never from OnVisible state", () => {
    const nine = ten("development").slice(1);
    expect(contractCapReached(nine, scope(), "development")).toBe(false);
    const afterSave = [...nine, contract({ id: "new" })];
    expect(contractCapReached(afterSave, scope(), "development")).toBe(true);
    // …and a contract in another scope does not count towards it.
    expect(contractCapReached(
      [...nine, contract({ id: "fr", countryId: "fr" })], scope(), "development",
    )).toBe(false);
  });
});

/* ═════════════════════════════════════════════════════════════════════ the save ════ */

describe("the save", () => {
  it("UT-ADCONTR-023 the contract name is composed from the type and description", () => {
    expect(composeContractName("development", "BoP 2026"))
      .toBe("Development Contract - BoP 2026");
    expect(CONTRACT_TYPE_LABEL.construction).toBe("Construction Contract");
    const payload = buildContractPayload(form(), {
      type: "development", scope: scope(), isCreate: true,
    });
    expect(payload[BOP_CONTRACT_COL.name]).toBe("Development Contract - BoP 2026");
    expect(payload[BOP_CONTRACT_COL.description]).toBe("BoP 2026");
    expect(payload[`${BOP_LOOKUP.country}@odata.bind`]).toBe("/vsb_countries(de)");
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

  it("UT-ADCONTR-025 the save is ONE plan: the contract upsert plus the child parts", () => {
    const before = classifyAccounts(tree, [cost({ id: "dcA", capexAccountId: "s1" })], "c1");
    const after = new Map(before);
    after.set("s1", { ...after.get("s1")!, selected: false });
    after.set("s2", { ...after.get("s2")!, selected: true });
    after.set("s3", { ...after.get("s3")!, selected: true });

    const plan = planSaveContract({
      form: form(), type: "development", scope: scope(),
      existing: contract(), contractId: "c1",
      before, after, tree, owningBusinessUnitId: "bu-1", canEdit: true,
    });
    expect(plan.writes).toHaveLength(4);                 // upsert + 1 delete + 2 creates
    expect(plan.writes[0]).toMatchObject({ op: "update", entitySet: BOP_CONTRACT_ENTITY_SET });
    expect(plan.writes[1]).toMatchObject({
      op: "delete", entitySet: DEVCO_COST_ENTITY_SET, id: "dcA",
    });
    expect(plan.writes.slice(2).every((w) => w.op === "create")).toBe(true);
  });

  it("UT-ADCONTR-026 a created child carries RootCapexAccount (canvas omitted it)", () => {
    expect(rootAccountFor(tree, "s1")?.id).toBe("ac1");
    const payload = buildDevCoCostPayload({
      node: selectableNodes(tree).find((n) => n.id === "s1")!,
      rootAccount: rootAccountFor(tree, "s1"),
      contractId: "c1", scope: scope(), owningBusinessUnitId: "bu-1",
    });
    expect(payload[`${BOP_LOOKUP.rootCapexAccount}@odata.bind`])
      .toBe("/vsb_capexaccountlists(ac1)");
    expect(payload[DEVCO_COST_COL.name]).toBe("10001_01-Cabling");
    expect(payload[`${BOP_LOOKUP.contract}@odata.bind`])
      .toBe(`/${BOP_CONTRACT_ENTITY_SET}(c1)`);
    expect(payload[`${BOP_LOOKUP.owningBusinessUnit}@odata.bind`])
      .toBe("/businessunits(bu-1)");
  });

  it("UT-ADCONTR-035 delete removes the contract AND its children", () => {
    const plan = planDeleteContract({
      contract: contract(),
      ownedCosts: [
        cost({ id: "dc1", contractId: "c1" }),
        cost({ id: "dc2", contractId: "c1" }),
        cost({ id: "dcOther", contractId: "c2" }),
      ],
      canEdit: true,
    });
    expect(plan.writes.map((w) => w.id)).toEqual(["dc1", "dc2", "c1"]);
    expect(plan.writes.every((w) => w.op === "delete")).toBe(true);
    // The canvas removed only the parent and left the children to an unverified cascade.
  });

  it("UT-ADCONTR-036 a refused save leaves the selection and the form untouched", () => {
    const after = new Map([["s1", sel({ selected: true })]]);
    const f = form({ description: "" });
    const plan = planSaveContract({
      form: f, type: "development", scope: scope(), existing: null, contractId: null,
      before: new Map(), after, tree, owningBusinessUnitId: null, canEdit: true,
    });
    expect(plan.writes).toHaveLength(0);
    expect(plan.refusedReason).toBe(MSG.descriptionBlank);
    expect(after.get("s1")?.selected).toBe(true);
    expect(f.description).toBe("");
  });

  it("UT-ADCONTR-037 a scope with no contracts still allows both Adds", () => {
    expect(contractCapReached([], scope(), "development")).toBe(false);
    expect(contractCapReached([], scope(), "construction")).toBe(false);
    expect(MSG.noContracts.length).toBeGreaterThan(0);
  });
});

/* ═══════════════════════════════════════════════════════════════════ the card ════ */

describe("the contract card", () => {
  it("UT-ADCONTR-030 accounts are grouped by root account in rank order", () => {
    const groups = groupCostsForCard(
      [
        cost({ id: "a", rootAccountName: "Other CAPEX", categoryName: "Misc" }),
        cost({ id: "b", rootAccountName: "Development Expenses", categoryName: "Cabling" }),
      ],
      "c1",
    );
    expect(groups.map((g) => g.rootAccountName))
      .toEqual(["Development Expenses", "Other CAPEX"]);
    expect(ROOT_ACCOUNT_RANK["Development Expenses"]).toBe(2);
    expect(ROOT_ACCOUNT_RANK["Other CAPEX"]).toBe(5);
  });

  it("UT-ADCONTR-031 an unranked root account sorts last", () => {
    expect(rootAccountRank("Something new")).toBe(UNRANKED_ROOT_ACCOUNT);
    expect(rootAccountRank(null)).toBe(UNRANKED_ROOT_ACCOUNT);
    const groups = groupCostsForCard(
      [
        cost({ id: "a", rootAccountName: "Something new" }),
        cost({ id: "b", rootAccountName: "Wind Turbine / Panels" }),
      ],
      "c1",
    );
    expect(groups.map((g) => g.rootAccountName))
      .toEqual(["Wind Turbine / Panels", "Something new"]);
  });

  it("UT-ADCONTR-031b the card shows only this contract's accounts", () => {
    const groups = groupCostsForCard(
      [cost({ id: "a", contractId: "c1" }), cost({ id: "b", contractId: "c2" })],
      "c1",
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].subaccounts).toHaveLength(1);
  });
});

/* ═════════════════════════════════════════════════════════════════════ the Apply ════ */

describe("Apply (dead as shipped)", () => {
  it("UT-ADCONTR-032 the scope is a parameter, never another feature's picker", () => {
    const args = synchronizeBopArgs({ scope: scope(), contractId: "c1" });
    expect(args).toEqual({
      costType: "BoP", countryId: "de", technology: CHOICE_ADMIN.technology.wind,
      text_3: "c1",
    });
    const forFrance = synchronizeBopArgs({
      scope: scope({ countryId: "fr", countryName: "France" }), contractId: null,
    });
    expect(forFrance.countryId).toBe("fr");
    expect(forFrance.text_3).toBe("All");
    // The canvas read `cmp_Admin_Costs_Assumption_NestedCountryPickerColumn`, a control
    // that exists only on the Admin Cost Screen, in eight places.
  });

  it("UT-ADCONTR-033 both Apply buttons are disabled", () => {
    const state = applyCommandState();
    expect(state.enabled).toBe(false);
    expect(state.disabledReason).toBe(MSG.applyDisabled);
    expect(state.disabledReason).toContain("not present in the solution export");
  });

  it("UT-ADCONTR-034 the flow wrapper reports the missing flow; nothing is written", async () => {
    await expect(synchronizeStandardAssumptionCosts({ countryId: "de" }))
      .rejects.toThrow(/not present in the solution export/i);
    // No `Fabric Sync Jobs` row and no `Apply and Apply All Trackings` row: this feature
    // writes neither table.
  });
});
