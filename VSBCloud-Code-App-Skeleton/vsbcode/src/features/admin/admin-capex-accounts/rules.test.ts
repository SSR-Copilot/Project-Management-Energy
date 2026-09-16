/**
 * Admin CAPEX Accounts — unit tests.
 *
 * IDs are the spec's (UT-ADCAPEX-nnn). Pure functions only; the "Integration" cases assert
 * that the cascade is ONE plan (which becomes one `$batch`), not forty round-trips.
 */
import { describe, it, expect } from "vitest";
import { canSeeAdminSection, type CurrentUser } from "@/domain/session";
import {
  CHOICE_ADMIN, CAPEX_ROOT_NUMBER, CAPEX_SECOND_ROOT_NUMBER,
} from "@/data/entities";
import {
  MSG, NO_PRIVILEGES, CAPEX_ACCOUNT_COL, CAPEX_ACCOUNT_LOOKUP, CAPEX_COST_COL,
  CAPEX_ACCOUNT_ENTITY_SET, CAPEX_COST_ENTITY_SET, OVERLEVERAGING_CATEGORY_NAME,
  buildAccountTree, flattenTree, listCategories, parentAccountsForReorder,
  canCreateAccount, canEditAccount, showActivate, showDeactivate,
  canReorderAccounts, canReorderSubaccounts, canDeleteAccount, deleteEnabled,
  subaccountRowIcons, subaccountActivateIconCanvasParity, canEditAccountScope,
  isNumericAccountNumber, composeSubaccountNumber, numberExists, nextOrder,
  validateAccountForm, hasFormErrors, accountFormMessages, isNumberEditable,
  isCategoryEditable, buildAccountPayload, planSaveAccount,
  costCascadeWindow, classifyCostRow, childStatusOnDeactivate,
  childStatusOnDeactivateCanvasParity, planDeactivateAccount, planActivateAccount,
  planDeleteAccount, planReorder,
  accountRowLabel, CAPEX_TOOLBAR_LABELS, CAPEX_TOOLBAR_ORDER, sortToolbarCommands,
  type CapexAccount, type CapexContractRef, type CapexCostRow, type Privileges,
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
  id: "a1", name: "Account", number: "10001", order: 1, parentId: null,
  status: CHOICE_ADMIN.capexAccountStatus.active, owningBusinessUnitId: "bu-1",
  ...o,
});

const ALL: Privileges = { canCreate: true, canWrite: true, canDelete: true };

/** root 00001 → categories → accounts → subaccounts, plus the second root 10005. */
const tree: CapexAccount[] = [
  acc({ id: "root", number: CAPEX_ROOT_NUMBER, name: "Root", parentId: null, order: 0 }),
  acc({ id: "root2", number: CAPEX_SECOND_ROOT_NUMBER, name: "Second root", parentId: null, order: 0 }),
  acc({ id: "cat1", number: "10000", name: "Wind Turbine / Panels", parentId: "root", order: 1 }),
  acc({ id: "cat2", number: "20000", name: OVERLEVERAGING_CATEGORY_NAME, parentId: "root", order: 2 }),
  acc({ id: "cat3", number: "10006", name: "Excluded elsewhere", parentId: "root", order: 3 }),
  acc({ id: "ac1", number: "10001", name: "Grid", parentId: "cat1", order: 1 }),
  acc({ id: "sub1", number: "10001_01", name: "Cabling", parentId: "ac1", order: 1 }),
  acc({ id: "sub2", number: "10001_02", name: "Transformer", parentId: "ac1", order: 2 }),
  acc({ id: "orphan", number: "99999", name: "Under second root", parentId: "root2", order: 1 }),
];

const cost = (o: Partial<CapexCostRow> = {}): CapexCostRow => ({
  id: "c1", contractId: "k1", year: 2026, month: 6, cost: 1000, ...o,
});

const contract = (o: Partial<CapexContractRef> = {}): CapexContractRef => ({
  id: "k1", accountId: "sub1", ...o,
});

const TODAY = new Date("2026-05-14T00:00:00Z");

/* ═══════════════════════════════════════════════════════════════ permission ════ */

describe("permission", () => {
  it("UT-ADCAPEX-001 a non-admin is blocked", () => {
    expect(canSeeAdminSection(user())).toBe(false);
    expect(canSeeAdminSection(user({ isControllerOwnData: true }))).toBe(true);
  });

  it("UT-ADCAPEX-003 New is disabled without the create privilege", () => {
    expect(canCreateAccount(NO_PRIVILEGES)).toBe(false);
    expect(canCreateAccount(ALL)).toBe(true);
    const plan = planSaveAccount(
      { categoryId: "cat1", name: "New", number: "77777" },
      {
        isSubaccount: false, isEdit: false, parent: acc({ id: "cat1" }), siblings: [],
        existingNumbers: [], privileges: { ...ALL, canCreate: false }, canEdit: true,
      },
    );
    expect(plan.writes).toHaveLength(0);
    expect(plan.refusedReason).toBe(MSG.noCreatePrivilege);
  });

  it("UT-ADCAPEX-003b country scope gates the writes (new, absent from the canvas)", () => {
    const controller = user({
      isControllerOwnData: true, editableCountries: [{ id: "de", name: "Germany" }],
    });
    expect(canEditAccountScope(controller, "de")).toBe(true);
    expect(canEditAccountScope(controller, "fr")).toBe(false);
    expect(canEditAccountScope(controller, null)).toBe(true);   // global master data
    expect(canEditAccountScope(user(), null)).toBe(false);
  });
});

/* ═════════════════════════════════════════════════════════════════ the tree ════ */

describe("the account tree", () => {
  it("UT-ADCAPEX-002 categories are the children of account 00001, ordered", () => {
    expect(listCategories(tree).map((c) => c.id)).toEqual(["cat1", "cat2", "cat3"]);
    // The COST screen excludes Overleveraging; this screen does not.
    expect(listCategories(tree, { excludeOverleveraging: true }).map((c) => c.id))
      .toEqual(["cat1", "cat3"]);
  });

  it("UT-ADCAPEX-002b buildAccountTree nests three levels from the 00001 root", () => {
    const nodes = buildAccountTree(tree);
    expect(nodes.map((n) => n.id)).toEqual(["cat1", "cat2", "cat3"]);
    expect(nodes[0].level).toBe(1);
    expect(nodes[0].children.map((n) => n.id)).toEqual(["ac1"]);
    expect(nodes[0].children[0].level).toBe(2);
    expect(nodes[0].children[0].children.map((n) => n.id)).toEqual(["sub1", "sub2"]);
    expect(nodes[0].children[0].children[0].level).toBe(3);
    expect(nodes[0].children[0].childCount).toBe(2);
    // The second root's subtree is NOT part of the 00001 tree.
    expect(flattenTree(nodes).some((n) => n.id === "orphan")).toBe(false);
  });

  it("UT-ADCAPEX-002c an excluded number drops out (Admin Contract excludes 10006)", () => {
    const nodes = buildAccountTree(tree, { exclude: ["10006"] });
    expect(nodes.map((n) => n.id)).toEqual(["cat1", "cat2"]);
  });

  it("UT-ADCAPEX-004 Reorder is disabled with a single parent account", () => {
    const parents = parentAccountsForReorder(tree);
    // root, root2's child, and root itself — root2 is excluded by Number.
    expect(parents.map((p) => p.id).sort()).toEqual(["orphan", "root"].sort());
    expect(canReorderAccounts([acc()], ALL)).toBe(false);
    expect(canReorderAccounts([acc({ id: "a" }), acc({ id: "b" })], ALL)).toBe(true);
    expect(canReorderAccounts([acc({ id: "a" }), acc({ id: "b" })], NO_PRIVILEGES)).toBe(false);
  });

  it("UT-ADCAPEX-004b the subaccount Reorder gate is now present (the canvas had none)", () => {
    expect(canReorderSubaccounts([acc({ id: "s1" }), acc({ id: "s2" })], NO_PRIVILEGES))
      .toBe(false);
    expect(canReorderSubaccounts([acc({ id: "s1" }), acc({ id: "s2" })], ALL)).toBe(true);
  });
});

/* ═══════════════════════════════════════════════════════════════════ delete ════ */

describe("delete enablement", () => {
  it("UT-ADCAPEX-005 Delete is hidden when subaccounts exist", () => {
    const account = acc({ id: "ac1" });
    expect(canDeleteAccount(account, [acc({ id: "sub1", parentId: "ac1" })], [])).toBe(false);
    expect(canDeleteAccount(account, [], [])).toBe(true);
  });

  it("UT-ADCAPEX-006 Delete is hidden when a contract references any child", () => {
    const account = acc({ id: "ac1" });
    expect(canDeleteAccount(account, [], [contract({ accountId: "ac1" })])).toBe(false);
    expect(canDeleteAccount(account, [], [contract({ accountId: "elsewhere" })])).toBe(true);
  });

  it("UT-ADCAPEX-007 Delete is visible but disabled without the delete privilege", () => {
    const account = acc({ id: "ac1" });
    expect(canDeleteAccount(account, [], [])).toBe(true);          // visible
    expect(deleteEnabled({ ...ALL, canDelete: false })).toBe(false); // disabled
    const plan = planDeleteAccount(account, {
      subaccounts: [], contracts: [], privileges: { ...ALL, canDelete: false }, canEdit: true,
    });
    expect(plan.refusedReason).toBe(MSG.noDeletePrivilege);
  });

  it("UT-ADCAPEX-024 delete is a single DELETE; no full-table reload follows", () => {
    const plan = planDeleteAccount(acc({ id: "ac1", name: "Grid" }), {
      subaccounts: [], contracts: [], privileges: ALL, canEdit: true,
    });
    expect(plan.writes).toEqual([expect.objectContaining({
      op: "delete", entitySet: CAPEX_ACCOUNT_ENTITY_SET, id: "ac1",
    })]);
  });

  it("UT-ADCAPEX-022 the subaccount delete icon is hidden when a contract references it", () => {
    const record = acc({ id: "sub1" });
    expect(subaccountRowIcons(record, ALL, [contract({ accountId: "sub1" })]).delete).toBe(false);
    expect(subaccountRowIcons(record, ALL, []).delete).toBe(true);
  });

  it("UT-ADCAPEX-021 the Activate icon renders for an inactive subaccount (canvas bug fixed)", () => {
    const inactive = acc({ id: "sub1", status: CHOICE_ADMIN.capexAccountStatus.inactive });
    const icons = subaccountRowIcons(inactive, ALL, []);
    expect(icons.activate).toBe(true);
    expect(icons.deactivate).toBe(false);
    // The canvas branch tests `Status = Active` INSIDE the Inactive arm — never true.
    expect(subaccountActivateIconCanvasParity(inactive, ALL)).toBe(false);
    const active = acc({ id: "sub1" });
    expect(subaccountRowIcons(active, ALL, []).activate).toBe(false);
    expect(subaccountRowIcons(active, ALL, []).deactivate).toBe(true);
  });

  it("UT-ADCAPEX-021b Activate and Deactivate command items are mutually exclusive", () => {
    const active = acc();
    const inactive = acc({ status: CHOICE_ADMIN.capexAccountStatus.inactive });
    expect([showActivate(active), showDeactivate(active)]).toEqual([false, true]);
    expect([showActivate(inactive), showDeactivate(inactive)]).toEqual([true, false]);
    expect(canEditAccount(null, ALL)).toBe(false);
    expect(canEditAccount(active, ALL)).toBe(true);
  });
});

/* ══════════════════════════════════════════════════════════════ number rules ════ */

describe("account numbers", () => {
  it("UT-ADCAPEX-008 a subaccount number is composed with the parent", () => {
    expect(composeSubaccountNumber("10001", "07")).toBe("10001_07");
    expect(composeSubaccountNumber("10001", " 07 ")).toBe("10001_07");
  });

  it("UT-ADCAPEX-009 a non-numeric number is rejected", () => {
    expect(isNumericAccountNumber("1.5")).toBe(false);
    expect(isNumericAccountNumber("abc")).toBe(false);
    expect(isNumericAccountNumber("07")).toBe(true);
  });

  it("UT-ADCAPEX-010 a comma in the number is rejected", () => {
    expect(isNumericAccountNumber("1,5")).toBe(false);
    // Power Fx `IsNumeric("1.5")` is TRUE, which is exactly why the canvas adds two
    // explicit separator tests. Both are reproduced.
    expect(isNumericAccountNumber("-1")).toBe(false);
  });

  it("UT-ADCAPEX-011 a duplicate number blocks the write BEFORE it is issued", () => {
    expect(numberExists(tree, "10001")).toBe(true);
    const plan = planSaveAccount(
      { categoryId: "cat1", name: "Dup", number: "10001" },
      {
        isSubaccount: false, isEdit: false, parent: acc({ id: "cat1", number: "10000" }),
        siblings: [], existingNumbers: ["10001"], privileges: ALL, canEdit: true,
      },
    );
    expect(plan.writes).toHaveLength(0);
    expect(plan.refusedReason).toBe(MSG.duplicateAccount);
    // …and the subaccount message differs.
    const sub = planSaveAccount(
      { categoryId: null, name: "Dup", number: "01" },
      {
        isSubaccount: true, isEdit: false, parent: acc({ id: "ac1", number: "10001" }),
        siblings: [], existingNumbers: ["10001_01"], privileges: ALL, canEdit: true,
      },
    );
    expect(sub.refusedReason).toBe(MSG.duplicateSubaccount);
  });

  it("UT-ADCAPEX-012 a new account's order is max + 1", () => {
    expect(nextOrder([{ order: 1 }, { order: 2 }, { order: 5 }])).toBe(6);
  });

  it("UT-ADCAPEX-013 an empty sibling set yields order 1", () => {
    expect(nextOrder([])).toBe(1);
  });
});

/* ═════════════════════════════════════════════════════════════════════ the save ════ */

describe("the save", () => {
  it("UT-ADCAPEX-014 a new account is created INACTIVE (deliberate, safety-relevant)", () => {
    const data = buildAccountPayload(
      { categoryId: "cat1", name: "New", number: "77777" },
      { isSubaccount: false, isEdit: false, parent: acc({ id: "cat1" }), siblings: [] },
    );
    expect(data[CAPEX_ACCOUNT_COL.statecode]).toBe(CHOICE_ADMIN.capexAccountStatus.inactive);
    expect(data[`${CAPEX_ACCOUNT_LOOKUP.parentAccount}@odata.bind`])
      .toBe(`/${CAPEX_ACCOUNT_ENTITY_SET}(cat1)`);
    expect(data[CAPEX_ACCOUNT_COL.order]).toBe(1);
  });

  it("UT-ADCAPEX-015 editing changes only the Name", () => {
    const data = buildAccountPayload(
      { categoryId: "cat1", name: "Renamed", number: "ignored" },
      { isSubaccount: false, isEdit: true, parent: acc({ id: "cat1" }), siblings: [] },
    );
    expect(data).toEqual({ [CAPEX_ACCOUNT_COL.name]: "Renamed" });
    expect(isNumberEditable(true)).toBe(false);
    expect(isCategoryEditable(true)).toBe(false);
    expect(isNumberEditable(false)).toBe(true);
  });

  it("UT-ADCAPEX-015b the save conjunction mirrors the canvas DisplayMode", () => {
    const errors = validateAccountForm(
      { categoryId: null, name: "", number: "1.5" },
      { isSubaccount: false, isEdit: false, existingNumbers: [] },
    );
    expect(errors).toEqual({
      categoryMissing: true, nameMissing: true, numberMissing: false,
      numberNotNumeric: true, numberDuplicate: false,
    });
    expect(hasFormErrors(errors)).toBe(true);
    expect(accountFormMessages(errors, true)).toContain(MSG.numbersOnly);
    const ok = validateAccountForm(
      { categoryId: "cat1", name: "Grid", number: "12345" },
      { isSubaccount: false, isEdit: false, existingNumbers: [] },
    );
    expect(hasFormErrors(ok)).toBe(false);
  });
});

/* ═══════════════════════════════════════════════════════════════ the cascade ════ */

describe("the deactivation cascade", () => {
  const window = costCascadeWindow(TODAY);

  it("UT-ADCAPEX-016 only the remaining months of the current year are zeroed", () => {
    expect(window).toEqual({ zeroYear: 2026, zeroMonthExclusive: 5, deleteYearsAfter: 2026 });
    expect(classifyCostRow(cost({ year: 2026, month: 4 }), window)).toBe("keep");
    expect(classifyCostRow(cost({ year: 2026, month: 5 }), window)).toBe("keep");
    expect(classifyCostRow(cost({ year: 2026, month: 6 }), window)).toBe("zero");
  });

  it("UT-ADCAPEX-017 future-year costs are deleted", () => {
    expect(classifyCostRow(cost({ year: 2027, month: 1 }), window)).toBe("delete");
    expect(classifyCostRow(cost({ year: 2028, month: 12 }), window)).toBe("delete");
  });

  it("UT-ADCAPEX-018 past-month costs are untouched", () => {
    expect(classifyCostRow(cost({ year: 2026, month: 3 }), window)).toBe("keep");
    expect(classifyCostRow(cost({ year: 2025, month: 12 }), window)).toBe("keep");
  });

  it("UT-ADCAPEX-019 the cascade is ONE plan (one batch), not one call per row", () => {
    const costs: CapexCostRow[] = [];
    for (let i = 0; i < 40; i++) {
      costs.push(cost({ id: `c${i}`, year: 2027, month: (i % 12) + 1 }));
    }
    const plan = planDeactivateAccount({
      account: acc({ id: "ac1", name: "Grid" }),
      subaccounts: [
        acc({ id: "sub1", parentId: "ac1" }),
        acc({ id: "sub2", parentId: "ac1" }),
        acc({ id: "sub3", parentId: "ac1" }),
      ],
      contracts: [contract({ id: "k1", accountId: "sub1" })],
      costs, today: TODAY, privileges: ALL, canEdit: true,
    });
    // 1 account + 3 subaccounts + 40 cost deletes = 44 parts of ONE batch.
    expect(plan.writes).toHaveLength(44);
    expect(plan.writes.filter((w) => w.entitySet === CAPEX_COST_ENTITY_SET)).toHaveLength(40);
    expect(plan.writes.every((w) => typeof w.reason === "string")).toBe(true);
  });

  it("UT-ADCAPEX-019b subaccounts are DEACTIVATED with the parent (canvas activated them)", () => {
    expect(childStatusOnDeactivate()).toBe(CHOICE_ADMIN.capexAccountStatus.inactive);
    expect(childStatusOnDeactivateCanvasParity()).toBe(CHOICE_ADMIN.capexAccountStatus.active);

    const args = {
      account: acc({ id: "ac1" }),
      subaccounts: [acc({ id: "sub1", parentId: "ac1" })],
      contracts: [], costs: [], today: TODAY, privileges: ALL, canEdit: true,
    };
    const sane = planDeactivateAccount(args);
    expect(sane.writes[1].data).toEqual({
      [CAPEX_ACCOUNT_COL.statecode]: CHOICE_ADMIN.capexAccountStatus.inactive,
    });
    const parity = planDeactivateAccount({ ...args, canvasParity: true });
    expect(parity.writes[1].data).toEqual({
      [CAPEX_ACCOUNT_COL.statecode]: CHOICE_ADMIN.capexAccountStatus.active,
    });
  });

  it("UT-ADCAPEX-019c a cost row on a contract outside the account is not touched", () => {
    const plan = planDeactivateAccount({
      account: acc({ id: "ac1" }),
      subaccounts: [],
      contracts: [contract({ id: "k-other", accountId: "somewhere-else" })],
      costs: [cost({ id: "c1", contractId: "k-other", year: 2027 })],
      today: TODAY, privileges: ALL, canEdit: true,
    });
    expect(plan.writes).toHaveLength(1);   // the account status flip only
  });

  it("UT-ADCAPEX-020 the confirmation names the consequence", () => {
    expect(MSG.deactivateAccount).toContain("subaccounts");
    expect(MSG.deactivateAccount).toContain("forecasted costs will be deleted");
    expect(MSG.deactivateSubaccount).toContain("forecasted costs");
    expect(MSG.deleteAccount("Grid")).toContain('"Grid"');
  });

  it("UT-ADCAPEX-025 a cascade the user may not run commits nothing", () => {
    const plan = planDeactivateAccount({
      account: acc(), subaccounts: [], contracts: [], costs: [],
      today: TODAY, privileges: NO_PRIVILEGES, canEdit: true,
    });
    expect(plan.writes).toHaveLength(0);
    expect(plan.refusedReason).toBe(MSG.noWritePrivilege);
  });

  it("UT-ADCAPEX-025b activating back does NOT restore the deleted costs", () => {
    const plan = planActivateAccount(acc({ id: "ac1", name: "Grid" }), {
      privileges: ALL, canEdit: true,
    });
    expect(plan.writes).toHaveLength(1);
    expect(plan.writes[0].data).toEqual({
      [CAPEX_ACCOUNT_COL.statecode]: CHOICE_ADMIN.capexAccountStatus.active,
    });
    expect(plan.writes[0].reason).toContain("not restored");
    expect(CAPEX_COST_COL.cost).toBe("vsb_cost");
  });
});

/* ═══════════════════════════════════════════════════════════════════ reorder ════ */

describe("reorder and empty states", () => {
  it("UT-ADCAPEX-023 reorder sends one batch of positions 1..n", () => {
    const four = [1, 2, 3, 4].map((n) => acc({ id: `a${n}`, order: n }));
    const plan = planReorder(four, ["a4", "a3", "a2", "a1"], { privileges: ALL, canEdit: true });
    expect(plan.writes.map((w) => ({ id: w.id, order: w.data?.[CAPEX_ACCOUNT_COL.order] })))
      .toEqual([
        { id: "a4", order: 1 }, { id: "a3", order: 2 },
        { id: "a2", order: 3 }, { id: "a1", order: 4 },
      ]);
    // An unchanged sequence writes nothing.
    expect(planReorder(four, ["a1", "a2", "a3", "a4"], { privileges: ALL, canEdit: true })
      .writes).toHaveLength(0);
  });

  it("UT-ADCAPEX-026 a category with no accounts yields an empty child list", () => {
    const nodes = buildAccountTree(tree);
    const overleveraging = nodes.find((n) => n.name === OVERLEVERAGING_CATEGORY_NAME);
    expect(overleveraging?.children).toEqual([]);
    expect(overleveraging?.childCount).toBe(0);
    // New is still available: enablement depends only on the privilege.
    expect(canCreateAccount(ALL)).toBe(true);
    expect(MSG.emptyCategory.length).toBeGreaterThan(0);
  });
});

/* ═══════════════════════════════════════════════════════════════════ shell ════ */

describe("shell (GUIDE p21)", () => {
  it("UT-ADCAPEX-027 the row label is '<number> - <name>' verbatim", () => {
    expect(accountRowLabel(acc({ number: "80000", name: "Turbine / PV Supply Agreement" })))
      .toBe("80000 - Turbine / PV Supply Agreement");
    expect(accountRowLabel(acc({ number: "80001", name: "Additional WTG / PV Costs" })))
      .toBe("80001 - Additional WTG / PV Costs");
    // Row 80003's name literally carries "(In-active)" — data, not something the
    // formatter adds or strips, and it renders alongside the row's own status chip.
    expect(accountRowLabel(acc({ number: "80003", name: "Cost and Other Utilities (In-active)" })))
      .toBe("80003 - Cost and Other Utilities (In-active)");
  });

  it("UT-ADCAPEX-028 toolbar labels are verbatim", () => {
    expect(CAPEX_TOOLBAR_LABELS.reorder).toBe("Reorder");
    expect(CAPEX_TOOLBAR_LABELS.new).toBe("New");
    expect(CAPEX_TOOLBAR_LABELS.edit).toBe("Edit");
    expect(CAPEX_TOOLBAR_LABELS.deactivate).toBe("Deactivate");
  });

  it("UT-ADCAPEX-029 the toolbar orders Reorder, New, Edit, Deactivate — not declaration order", () => {
    const cmd = (key: string) => ({ key, label: key });
    const declared = [cmd("delete"), cmd("edit"), cmd("deactivate"), cmd("new"), cmd("reorder")];
    expect(sortToolbarCommands(declared).map((c) => c.key)).toEqual([
      "reorder", "new", "edit", "deactivate", "delete",
    ]);
    // An unknown key is not dropped — it sorts last, after every known slot.
    const withUnknown = [cmd("mystery"), cmd("new"), cmd("reorder")];
    expect(sortToolbarCommands(withUnknown).map((c) => c.key))
      .toEqual(["reorder", "new", "mystery"]);
    expect(CAPEX_TOOLBAR_ORDER[0]).toBe("reorder");
  });
});
