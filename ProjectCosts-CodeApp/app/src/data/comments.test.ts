/**
 * The CAPEX comments write boundary — the exact payload that leaves the app.
 *
 * The canvas equivalent is one `Patch('Capex Comments', …)` at
 * `CapexScreenCode.txt:9997-10039`; these tests pin each of its nine fields, plus the two places
 * this port deliberately differs (`owningbusinessunit` on create, and no null `@odata.bind` in a
 * POST body).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const create = vi.fn(async (record: Record<string, unknown>) => ({
  success: true as const, data: { vsb_capexcommentsid: "new-id", ...record },
}));
const update = vi.fn(async (_id: string, _fields: Record<string, unknown>) => ({
  success: true as const, data: {},
}));

vi.mock("@/generated/services/Vsb_capexcommentsesService", () => ({
  Vsb_capexcommentsesService: {
    create: (r: Record<string, unknown>) => create(r),
    update: (id: string, f: Record<string, unknown>) => update(id, f),
    delete: vi.fn(async () => undefined),
    getAll: vi.fn(),
  },
}));

const { saveComment } = await import("./comments");
const { COMMENT_TYPE } = await import("@/features/capex-costs/comments");

const base = {
  text: "Added General Comment",
  contractId: "54b5d3fd-d9b0-f111-aaac-7ced8d15d85e",
  commentType: COMMENT_TYPE.general,
  resolved: false,
  sequenceNumber: 1,
  authorFullName: "Singh Rajput, Shakti (external)",
  owningBusinessUnitId: "bu-1",
};

const createdPayload = () => create.mock.calls[0]?.[0] as Record<string, unknown>;
const updatedPayload = () => update.mock.calls[0]?.[1] as Record<string, unknown>;

describe("saveComment — new root", () => {
  beforeEach(() => { create.mockClear(); update.mockClear(); });

  it("UT-CMT-079 writes every field of the canvas Patch, plus the owning business unit", async () => {
    await saveComment(base);
    expect(createdPayload()).toEqual({
      // `Name: $"Comment - {SequenceNumber} - {User().FullName}"` (:10012) — SOURCE DEFECT N-4.
      vsb_name: "Comment - 1 - Singh Rajput, Shakti (external)",
      vsb_comment: "Added General Comment",                             // :10013
      vsb_commenttype: COMMENT_TYPE.general,                            // :10015
      vsb_resolved: false,                                              // :10020
      // `'Capex Contract': locSelectedProjectContract` (:10014) — written unconditionally, on
      // replies and payment-date comments too, which is why `loadComments` can filter on it.
      "vsb_CapexContract@odata.bind":
        "/vsb_capexprojectcontracts(54b5d3fd-d9b0-f111-aaac-7ced8d15d85e)",
      // The canvas has no equivalent; see BUGS-FOUND S-5.
      "owningbusinessunit@odata.bind": "/businessunits(bu-1)",
    });
  });

  it("UT-CMT-080 sends NO null @odata.bind in a create body", async () => {
    await saveComment(base);
    const keys = Object.keys(createdPayload()).filter((k) => k.endsWith("@odata.bind"));
    // A brand-new row has nothing to disassociate, and a null where OData expects an entity
    // reference is not a "clear this lookup" instruction. This create used to carry four of them
    // — CapexCost, ParentComment, RootComment and ResolvedBy — on every new General Comment.
    for (const k of keys) expect(createdPayload()[k]).not.toBeNull();
    expect(keys).toEqual([
      "vsb_CapexContract@odata.bind", "owningbusinessunit@odata.bind",
    ]);
  });

  it("UT-CMT-081 a payment-date root binds the CAPEX COST row, not a year and month", async () => {
    // `'Capex Cost': If(IsGeneralComment = false, RelatedCost, Blank())` (:10027). The comment
    // table has no year or month of its own; the cost row carries both, which is what the grid's
    // month dots are computed from.
    await saveComment({
      ...base, commentType: COMMENT_TYPE.paymentDate, costId: "cost-jan-2026",
    });
    expect(createdPayload()["vsb_CapexCost@odata.bind"]).toBe("/vsb_capexcosts(cost-jan-2026)");
    expect(createdPayload().vsb_commenttype).toBe(COMMENT_TYPE.paymentDate);
  });

  it("UT-CMT-082 a General Comment never carries a cost, even when one is passed", async () => {
    await saveComment({ ...base, commentType: COMMENT_TYPE.general, costId: "cost-jan-2026" });
    expect(createdPayload()["vsb_CapexCost@odata.bind"]).toBeUndefined();
  });
});

describe("saveComment — reply", () => {
  beforeEach(() => { create.mockClear(); update.mockClear(); });

  it("UT-CMT-083 binds Parent AND Root to the same row, and leaves Name unnumbered", async () => {
    // `'Parent Comment'` and `'Root Comment'` are both `If(IsRoot = false, recRootComment,
    // Blank())` over the SAME lookup (:10022, :10032) — replies are one level deep by
    // construction. `SequenceNumber` is blanked on every non-root (:7435-7439) and the blank
    // lands in `Name`: the live replies are all `Comment -  - <name>`.
    await saveComment({
      ...base, parentId: "root-1", rootId: "root-1", sequenceNumber: null,
      text: "Replied Added to Test Comment",
    });
    expect(createdPayload()["vsb_ParentComment@odata.bind"])
      .toBe("/vsb_capexcommentses(root-1)");
    expect(createdPayload()["vsb_RootComment@odata.bind"])
      .toBe("/vsb_capexcommentses(root-1)");
    expect(createdPayload().vsb_name)
      .toBe("Comment -  - Singh Rajput, Shakti (external)");
  });
});

describe("saveComment — resolve", () => {
  beforeEach(() => { create.mockClear(); update.mockClear(); });

  it("UT-CMT-084 binds the resolver to aadusers by Entra object id", async () => {
    // `'Resolved By': _currentComment.Resolver` (:10021), where Resolver is
    // `LookUp('Microsoft Entra IDs', Id = User().EntraObjectId)` (:9671-9674). MEASURED on
    // VSBCloud_Dev: the resolved rows 209b7556… and 48eef580… link to `aaduser`
    // a26645ca-b7b5-4642-80cd-095628456979, which is exactly
    // `systemuser.azureactivedirectoryobjectid` for shakti.singh@vsb.energy — so `aaduserid` IS
    // the Entra object id, and `Session.entraObjectId` binds straight to it. Pointing this at
    // `systemusers` would bind a different table's key.
    await saveComment({
      ...base, id: "c1", resolved: true,
      resolvedById: "a26645ca-b7b5-4642-80cd-095628456979",
    });
    expect(updatedPayload().vsb_resolved).toBe(true);
    expect(updatedPayload()["vsb_ResolvedBy@odata.bind"])
      .toBe("/aadusers(a26645ca-b7b5-4642-80cd-095628456979)");
  });

  it("UT-CMT-085 reopening clears the resolver on the same update", async () => {
    // `{Resolved: No, IsModified: true, Resolver: Blank()}` (:9830-9834).
    await saveComment({ ...base, id: "c1", resolved: false });
    expect(updatedPayload().vsb_resolved).toBe(false);
    expect(updatedPayload()["vsb_ResolvedBy@odata.bind"]).toBeNull();
  });
});

describe("saveComment — edit", () => {
  beforeEach(() => { create.mockClear(); update.mockClear(); });

  it("UT-CMT-086 an update rewrites the lookups so a type change actually takes effect", async () => {
    // The canvas writes the same field set on new and existing rows alike (:9997-10039). Sending
    // the scalars alone would leave `vsb_CapexCost` pointing at the month the user just moved
    // off, and the red dot with it. `@odata.bind: null` is the only disassociation available —
    // `_vsb_capexcost_value` is the READ form and is rejected in a write body
    // (`docs/CONVENTIONS.md`).
    await saveComment({ ...base, id: "c1", commentType: COMMENT_TYPE.general });
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0]?.[0]).toBe("c1");
    expect(updatedPayload()["vsb_CapexCost@odata.bind"]).toBeNull();
    expect(updatedPayload()["vsb_ParentComment@odata.bind"]).toBeNull();
    expect(updatedPayload()["vsb_RootComment@odata.bind"]).toBeNull();
    // An update must not try to re-own the row.
    expect(updatedPayload()["owningbusinessunit@odata.bind"]).toBeUndefined();
    expect(create).not.toHaveBeenCalled();
  });
});
