/** UT-CONTR-175..178 — `planDevCoLinks`: what a Save changes so the stored links equal the ticked accounts. */
import { describe, expect, it } from "vitest";
import { planDevCoLinks } from "./rules";

const acc = (id: string) => ({ id, name: `n-${id}` });

describe("planDevCoLinks", () => {
  it("UT-CONTR-175 an unchanged selection plans nothing", () => {
    expect(planDevCoLinks([{ id: "r1", accountId: "a1" }], [acc("a1")])).toEqual({ create: [], remove: [] });
  });

  it("UT-CONTR-176 creates the added accounts in ticked order and removes the unticked ones", () => {
    const plan = planDevCoLinks(
      [{ id: "r1", accountId: "a1" }, { id: "r2", accountId: "a2" }],
      [acc("a3"), acc("a2"), acc("a4")],
    );
    expect(plan.create.map((a) => a.id)).toEqual(["a3", "a4"]);
    expect(plan.remove).toEqual(["r1"]);
  });

  it("UT-CONTR-177 a second stored row of the same account is removed, and a ticked account twice is created once", () => {
    const plan = planDevCoLinks(
      [{ id: "r1", accountId: "a1" }, { id: "r1b", accountId: "a1" }],
      [acc("a1"), acc("a5"), acc("a5")],
    );
    expect(plan.remove).toEqual(["r1b"]);
    expect(plan.create.map((a) => a.id)).toEqual(["a5"]);
  });

  it("UT-CONTR-178 nothing ticked removes every stored link; nothing stored creates every ticked account", () => {
    expect(planDevCoLinks([{ id: "r1", accountId: "a1" }], []).remove).toEqual(["r1"]);
    expect(planDevCoLinks([], [acc("a1"), acc("a2")]).create.map((a) => a.id)).toEqual(["a1", "a2"]);
  });
});

describe("planDevCoLinks with the accounts the picker can show (D120 §2, N1)", () => {
  const stored = [
    { id: "rv", accountId: "visible" },
    { id: "ri", accountId: "inactive" },
  ];

  it("UT-CONTR-213 a link to an account the picker cannot show is kept, even with nothing ticked", () => {
    const plan = planDevCoLinks(stored, [], ["visible"]);
    expect(plan.remove).toEqual(["rv"]);
    expect(plan.remove).not.toContain("ri");
    expect(planDevCoLinks([stored[1]!], [], ["visible"])).toEqual({ create: [], remove: [] });
  });

  it("UT-CONTR-214 a visible account that was ticked and is now not is removed; a newly ticked one is created", () => {
    const plan = planDevCoLinks(stored, [acc("new")], ["visible", "new"]);
    expect(plan.remove).toEqual(["rv"]);
    expect(plan.create.map((a) => a.id)).toEqual(["new"]);
  });

  it("UT-CONTR-215 an unchanged selection plans nothing, with or without an unseen link", () => {
    expect(planDevCoLinks(stored, [acc("visible")], ["visible"])).toEqual({ create: [], remove: [] });
  });

  it("UT-CONTR-216 without the visible list every stored link counts as visible (the earlier behaviour)", () => {
    expect(planDevCoLinks(stored, [acc("visible")]).remove).toEqual(["ri"]);
  });
});
