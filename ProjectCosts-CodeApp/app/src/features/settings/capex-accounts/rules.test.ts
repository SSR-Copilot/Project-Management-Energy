import { describe, expect, it } from "vitest";
import { ALLOW_ALL, DENY_ALL } from "@/platform/privileges";
// The screen's reorder rules (AC-8.2, D-ORD-2) now live in the shared module (M12); these tests
// keep pinning the CAPEX expectations against it.
import { ORDER_BASE, moveItem, reorderDiff } from "@/domain/reorder";
import { FIXTURE_ROWS, IDS } from "./fixtures";
import {
  MSG, NAME_MAX_LENGTH, accountCommands, accountDeleteUnavailable, accountLabel, accountNumberError,
  accountStatusDialog, buildCapexTree, canSaveAccount, canSaveSubaccount, composeSubaccountNumber,
  deleteAccountDialog, deleteSubaccountDialog, forecastCutoff, isDigitsOnly, nameError,
  nextOrder, subaccountCommands, subaccountDeleteUnavailable, subaccountRowActions, subaccountStatusDialog,
  subaccountSuffixError, type CapexNode,
} from "./rules";

const tree = buildCapexTree(FIXTURE_ROWS);
const dev = tree.byId.get(IDS.dev)!;
const land = tree.byId.get(IDS.land)!;
const permits = tree.byId.get(IDS.permits)!;

describe("buildCapexTree (DR-1, T1)", () => {
  it("finds the root and orders categories by vsb_order (FR-2 AC-2.1), Overleveraging included (D-CAT-1)", () => {
    expect(tree.root?.number).toBe("00001");
    expect(tree.categories.map((c) => c.name)).toEqual([
      "Wind Turbine/Panels", "Development Expenses", "Construction Expenses",
      "Overleveraging", "Substation/Grid Connection", "Other CAPEX",
    ]);
  });

  it("nests accounts and subaccounts, sorting a null order as 0", () => {
    expect(dev.children.map((a) => a.number)).toEqual(["80000", "80010"]);
    expect(land.children.map((s) => s.number)).toEqual(["80000_3", "80000_1", "80000_2"]);
    expect(land.children[0]!.order).toBe(0);
  });

  it("keeps inactive rows with active: false", () => {
    expect(permits.active).toBe(false);
    expect(tree.byId.get(IDS.overleveraging)!.active).toBe(false);
  });

  it("ignores orphan rows instead of crashing", () => {
    expect(tree.byId.has(IDS.orphan)).toBe(false);
  });

  it("returns no root and no categories when 00001 is missing (AC-2.3)", () => {
    const t = buildCapexTree(FIXTURE_ROWS.filter((r) => r.number !== "00001"));
    expect(t.root).toBeUndefined();
    expect(t.categories).toEqual([]);
  });

  it("tie-breaks equal orders by number", () => {
    const t = buildCapexTree([
      { id: "r", number: "00001", name: "root", order: 0, active: true, parentId: null },
      { id: "b", number: "20", name: "b", order: 1, active: true, parentId: "r" },
      { id: "a", number: "10", name: "a", order: 1, active: true, parentId: "r" },
    ]);
    expect(t.categories.map((c) => c.number)).toEqual(["10", "20"]);
  });

  it("NG-3: matches numbers as stored — a padded root is not \"00001\" (canvas `Number = \"00001\"`), padded children keep their spaces", () => {
    const padded = buildCapexTree([
      { id: "r", number: " 00001 ", name: "root", order: 0, active: true, parentId: null },
    ]);
    expect(padded.root).toBeUndefined();
    const t = buildCapexTree([
      { id: "r", number: "00001", name: "root", order: 0, active: true, parentId: null },
      { id: "a", number: "80000 ", name: "Land", order: 1, active: true, parentId: "r" },
    ]);
    expect(t.categories[0]!.number).toBe("80000 ");
  });

  it("does not loop on a self-referencing row", () => {
    const t = buildCapexTree([
      { id: "r", number: "00001", name: "root", order: 0, active: true, parentId: "r" },
    ]);
    expect(t.categories).toEqual([]);
  });
});

describe("number validation (D-VAL-1, T2)", () => {
  it.each([
    ["123", true], [" 123 ", true], ["12.3", false], ["1,2", false], ["-5", false],
    ["+5", false], ["1e3", false], ["", false], ["00010", true],
  ])("isDigitsOnly(%j) = %s", (value, ok) => {
    expect(isDigitsOnly(value)).toBe(ok);
  });

  it("shows the account message only for a non-blank, editable, non-numeric value", () => {
    expect(accountNumberError("", true)).toBeUndefined();
    expect(accountNumberError("12a", true)).toBe(MSG.accountNotNumeric);
    expect(accountNumberError("12a", false)).toBeUndefined();
    expect(accountNumberError("123", true)).toBeUndefined();
  });

  it("evaluates the subaccount suffix only while editable", () => {
    expect(subaccountSuffixError("x", true)).toBe(MSG.subaccountNotNumeric);
    expect(subaccountSuffixError("80000_1", false)).toBeUndefined();
  });
});

describe("names and save gates (V1, V4, D-VAL-2, D-VAL-3)", () => {
  it("rejects blank and whitespace-only names (AC-6.5) and names over 55", () => {
    expect(nameError("   ")).toBe(MSG.nameRequired);
    expect(nameError("x".repeat(NAME_MAX_LENGTH + 1))).toBe(MSG.nameTooLong);
    expect(nameError(" Land ")).toBeUndefined();
  });

  it("account Save needs category, number (digits) and name on New; only name on Edit", () => {
    expect(canSaveAccount({ categoryId: "c", number: "80020", name: "X" }, true)).toBe(true);
    expect(canSaveAccount({ categoryId: undefined, number: "80020", name: "X" }, true)).toBe(false);
    expect(canSaveAccount({ categoryId: "c", number: "", name: "X" }, true)).toBe(false);
    expect(canSaveAccount({ categoryId: "c", number: "8.1", name: "X" }, true)).toBe(false);
    expect(canSaveAccount({ categoryId: "c", number: "80020", name: "  " }, true)).toBe(false);
    expect(canSaveAccount({ categoryId: "c", number: "LEGACY-1", name: "X" }, false)).toBe(true);
  });

  it("subaccount Save needs suffix (digits) and name on New; only name on Edit", () => {
    expect(canSaveSubaccount({ suffix: "3", name: "X" }, true)).toBe(true);
    expect(canSaveSubaccount({ suffix: "", name: "X" }, true)).toBe(false);
    expect(canSaveSubaccount({ suffix: "a", name: "X" }, true)).toBe(false);
    expect(canSaveSubaccount({ suffix: "", name: "X" }, false)).toBe(true);
  });

  it("composes the stored subaccount number (T3, AC-7.1)", () => {
    expect(composeSubaccountNumber("80000", " 3 ")).toBe("80000_3");
  });

  it("NG-3: composes from a legacy parent number stored with spaces exactly as the canvas (CA:1980)", () => {
    expect(composeSubaccountNumber(" 80000 ", " 3 ")).toBe(" 80000 _3");
  });

  it("computes max + 1, with 0 + 1 when there are no siblings (AC-6.2)", () => {
    expect(nextOrder([])).toBe(1);
    expect(nextOrder([1, null, 4])).toBe(5);
  });

  it("PC-1: floors at 0 before adding 1 when every sibling order is negative or 0 (CA:1436, 1980)", () => {
    expect(nextOrder([-2])).toBe(1);
    expect(nextOrder([-5, -1])).toBe(1);
    expect(nextOrder([0])).toBe(1);
    expect(nextOrder([-3, 2])).toBe(3);
  });
});

describe("account command bar (FR-5)", () => {
  const base = { categorySelected: true, categoryAccountCount: 2, selectedHasContracts: false, privileges: ALLOW_ALL };

  it("with nothing selected: Edit disabled, Activate/Deactivate/Delete hidden (AC-5.1)", () => {
    const c = accountCommands({ ...base, selected: undefined });
    expect(c.edit).toEqual({ visible: true, enabled: false });
    expect(c.activate.visible).toBe(false);
    expect(c.deactivate.visible).toBe(false);
    expect(c.delete.visible).toBe(false);
  });

  it("shows Deactivate for Active and Activate for Inactive (AC-5.2)", () => {
    expect(accountCommands({ ...base, selected: land }).deactivate.visible).toBe(true);
    expect(accountCommands({ ...base, selected: land }).activate.visible).toBe(false);
    expect(accountCommands({ ...base, selected: permits }).activate.visible).toBe(true);
  });

  it("enables Reorder only with ≥ 2 accounts in the category (AC-5.3, D-CMD-1)", () => {
    expect(accountCommands({ ...base, selected: undefined, categoryAccountCount: 1 }).reorder.enabled).toBe(false);
    expect(accountCommands({ ...base, selected: undefined, categoryAccountCount: 2 }).reorder.enabled).toBe(true);
  });

  it("offers Delete only with no children and no contracts on the account itself (AC-10.1, D-DEL-1)", () => {
    expect(accountCommands({ ...base, selected: land }).delete.visible).toBe(false); // has children
    expect(accountCommands({ ...base, selected: permits }).delete.visible).toBe(true);
    expect(accountCommands({ ...base, selected: permits, selectedHasContracts: true }).delete.visible).toBe(false);
    expect(accountCommands({ ...base, selected: permits, selectedHasContracts: undefined }).delete.visible).toBe(false);
  });

  it("G10: a failed contract check shows Delete disabled instead of hiding it", () => {
    const failed = { ...base, selected: permits, selectedHasContracts: "failed" as const };
    expect(accountCommands(failed).delete).toEqual({ visible: true, enabled: false });
    expect(accountDeleteUnavailable(failed)).toBe(true);
    // The other commands are unaffected.
    expect(accountCommands(failed).edit).toEqual(accountCommands({ ...base, selected: permits }).edit);
    // An account with children is never deletable, so no "unavailable" state either.
    expect(accountCommands({ ...failed, selected: land }).delete.visible).toBe(false);
    expect(accountDeleteUnavailable({ ...failed, selected: land })).toBe(false);
    expect(accountDeleteUnavailable({ ...base, selected: permits })).toBe(false);
  });

  it("disables commands the privileges deny (AC-5.5)", () => {
    const c = accountCommands({ ...base, selected: permits, privileges: DENY_ALL });
    expect([c.reorder.enabled, c.create.enabled, c.edit.enabled, c.activate.enabled, c.delete.enabled])
      .toEqual([false, false, false, false, false]);
  });
});

describe("subaccount commands and row actions (FR-4, 04-data/02 §2.1, T4)", () => {
  it("enables Reorder subaccounts only with ≥ 2 subaccounts (D-CMD-2)", () => {
    expect(subaccountCommands(land, ALLOW_ALL).reorder.enabled).toBe(true);
    expect(subaccountCommands(permits, ALLOW_ALL).reorder.enabled).toBe(false);
    expect(subaccountCommands(permits, DENY_ALL).add.enabled).toBe(false);
  });

  const A = { active: true };
  const I = { active: false };
  it.each([
    // sub, parent, hasContracts, expected {edit, activate, deactivate, delete}
    [A, A, false, { edit: true, activate: false, deactivate: true, delete: true }],
    [A, I, false, { edit: true, activate: false, deactivate: true, delete: true }],
    [I, A, false, { edit: true, activate: true, deactivate: false, delete: true }],
    [I, I, false, { edit: true, activate: false, deactivate: false, delete: true }],
    [A, A, true, { edit: true, activate: false, deactivate: true, delete: false }],
    [I, A, undefined, { edit: true, activate: true, deactivate: false, delete: false }],
  ])("sub %j / parent %j / contracts %s", (sub, parent, hasContracts, expected) => {
    expect(subaccountRowActions(sub, parent, hasContracts, ALLOW_ALL)).toEqual(expected);
  });

  it("offers nothing without privileges", () => {
    expect(subaccountRowActions(A, A, false, DENY_ALL))
      .toEqual({ edit: false, activate: false, deactivate: false, delete: false });
  });

  it("G10: a failed check gives no Delete action but marks Delete unavailable (shown disabled)", () => {
    expect(subaccountRowActions(A, A, "failed", ALLOW_ALL).delete).toBe(false);
    expect(subaccountDeleteUnavailable("failed", ALLOW_ALL)).toBe(true);
    expect(subaccountDeleteUnavailable("failed", DENY_ALL)).toBe(false);
    expect(subaccountDeleteUnavailable(undefined, ALLOW_ALL)).toBe(false);
    expect(subaccountDeleteUnavailable(false, ALLOW_ALL)).toBe(false);
  });
});

describe("reorder (FR-8, D-ORD-2, T5)", () => {
  it("is 1-based", () => expect(ORDER_BASE).toBe(1));

  it("emits only moved rows with their new 1-based position", () => {
    const items = [{ id: "a", order: 1 }, { id: "b", order: 2 }, { id: "c", order: 3 }];
    expect(reorderDiff(items)).toEqual([]);
    expect(reorderDiff(moveItem(items, 2, 0))).toEqual([
      { id: "c", order: 1 }, { id: "a", order: 2 }, { id: "b", order: 3 },
    ]);
    expect(reorderDiff(moveItem(items, 1, 2))).toEqual([{ id: "c", order: 2 }, { id: "b", order: 3 }]);
  });

  it("normalises gaps and nulls-as-0 orders", () => {
    expect(reorderDiff([{ id: "a", order: 0 }, { id: "b", order: 2 }])).toEqual([{ id: "a", order: 1 }]);
  });

  it("treats out-of-range moves as no-ops", () => {
    expect(moveItem([1, 2], 0, 5)).toEqual([1, 2]);
    expect(moveItem([1, 2], -1, 0)).toEqual([1, 2]);
  });
});

describe("dialog texts (FR-9..FR-12)", () => {
  it("account deactivate promises subaccount deactivation; activate states nothing is restored", () => {
    expect(accountStatusDialog(land)).toMatchObject({ title: "Deactivate Account?", confirmText: "Deactivate" });
    expect(accountStatusDialog(land).description).toContain("All related subaccounts will be automatically deactivated");
    expect(accountStatusDialog(permits)).toMatchObject({ title: "Activate Account?", confirmText: "Activate" });
    expect(accountStatusDialog(permits).description).toContain("not restored");
  });

  it("subaccount title is keyed on the subaccount's own status (D-STAT-2)", () => {
    const inactiveSub = { name: "Cable", active: false } as CapexNode;
    expect(subaccountStatusDialog(inactiveSub).title).toBe("Activate Subaccount?");
    expect(subaccountStatusDialog({ name: "S", active: true } as CapexNode).title).toBe("Deactivate Subaccount?");
  });

  it("delete-account text does not claim subaccounts are deleted (AC-10.3, D-DEL-3)", () => {
    const d = deleteAccountDialog("Permits");
    expect(d.description).toBe('Are you sure that you want to permanently delete "Permits" account?');
    expect(d.description).not.toContain("subaccounts");
    expect(deleteSubaccountDialog("Cable").title).toBe("Delete Subaccount?");
  });

  it("labels a card '<number> - <name>'", () => {
    expect(accountLabel(land)).toBe("80000 - Land");
  });
});

describe("forecastCutoff (DR-7)", () => {
  it("uses local year and 1-based month", () => {
    expect(forecastCutoff(new Date(2026, 9, 17))).toEqual({ year: 2026, month: 10 });
  });

  it("NG-2: crosses the December/January year boundary on local dates", () => {
    expect(forecastCutoff(new Date(2026, 11, 31, 23, 59))).toEqual({ year: 2026, month: 12 });
    expect(forecastCutoff(new Date(2027, 0, 1, 0, 0))).toEqual({ year: 2027, month: 1 });
  });
});
