import { describe, expect, it } from "vitest";
import {
  COMMENT_TYPE, canSaveComments, commentBreadcrumb, commentCosts, commentDateLabel, commentEditable,
  commentHeading, commentMonthOptions, commentName, commentPanelTitle, commentThreads,
  commentTypeLabel, commentTypeValue, commentYearOptions,
  gridCommentFlags, gridCommentIndicators, paymentDateComplete, paymentDateCommentsAllowed,
  planDeleteRoot, renumberThreads, reopenThread, resolveThread, sortComments,
  threadLatestActivity, truncateComment, type CapexComment,
} from "./comments";

const comment = (over: Partial<CapexComment> = {}): CapexComment => ({
  id: "c1", text: "hello", contractId: "contract-1", costId: null,
  parentId: null, rootId: null, commentType: COMMENT_TYPE.general,
  resolved: false, resolvedById: null, createdOn: "2026-01-01T10:00:00Z",
  createdByName: "Shakti", ...over,
});

describe("truncateComment", () => {
  it("UT-CMT-001 counts up to 250, not 255", () => {
    expect(truncateComment("hi").counter).toBe("2 / 250");
  });

  it("UT-CMT-002 truncates anything longer than 250", () => {
    const long = "x".repeat(300);
    const result = truncateComment(long);
    expect(result.text).toHaveLength(250);
    expect(result.counter).toBe("250 / 250");
  });
});

describe("threadLatestActivity", () => {
  it("UT-CMT-028 takes the latest reply's date and text over the parent's", () => {
    const root = comment({ id: "root-1", text: "parent", createdOn: "2026-01-01T00:00:00Z" });
    const replies = [
      comment({ id: "r1", parentId: "root-1", text: "first", createdOn: "2026-01-02T00:00:00Z" }),
      comment({ id: "r2", parentId: "root-1", text: "newest", createdOn: "2026-01-09T00:00:00Z" }),
    ];
    expect(threadLatestActivity(root, replies)).toEqual({
      lastActivityOn: "2026-01-09T00:00:00Z", latestText: "newest",
    });
  });

  it("UT-CMT-029 is a max, not the last element — unsorted replies give the same answer", () => {
    // `First(Sort(..., 'Created On', Descending))`. Reading the tail of an unsorted list would
    // put the wrong text in the grid tooltip.
    const root = comment({ id: "root-1", text: "parent" });
    const replies = [
      comment({ id: "r2", parentId: "root-1", text: "newest", createdOn: "2026-01-09T00:00:00Z" }),
      comment({ id: "r1", parentId: "root-1", text: "older", createdOn: "2026-01-02T00:00:00Z" }),
    ];
    expect(threadLatestActivity(root, replies).latestText).toBe("newest");
  });

  it("UT-CMT-030 falls back to the parent when the thread has no replies", () => {
    const root = comment({ id: "root-1", text: "solo", createdOn: "2026-05-05T00:00:00Z" });
    expect(threadLatestActivity(root, [])).toEqual({
      lastActivityOn: "2026-05-05T00:00:00Z", latestText: "solo",
    });
  });
});

describe("commentThreads", () => {
  it("UT-CMT-003 groups a root with its replies", () => {
    const root = comment({ id: "root-1", createdOn: "2026-01-01T10:00:00Z" });
    const reply = comment({ id: "reply-1", parentId: "root-1", createdOn: "2026-01-02T10:00:00Z" });
    const threads = commentThreads([root, reply]);
    expect(threads).toHaveLength(1);
    expect(threads[0]?.replies.map((r) => r.id)).toEqual(["reply-1"]);
  });

  it("UT-CMT-004 bubbles the latest reply date and text to the thread", () => {
    const root = comment({ id: "root-1", text: "original", createdOn: "2026-01-01T10:00:00Z" });
    const reply = comment({
      id: "reply-1", parentId: "root-1", text: "latest", createdOn: "2026-01-05T10:00:00Z",
    });
    const threads = commentThreads([root, reply]);
    const thread = threads[0];
    expect(thread?.lastActivityOn).toBe("2026-01-05T10:00:00Z");
    expect(thread?.latestText).toBe("latest");
  });

  it("UT-CMT-005 falls back to the roots own date and text when there are no replies", () => {
    const root = comment({ id: "root-1", text: "solo" });
    const threads = commentThreads([root]);
    expect(threads[0]?.latestText).toBe("solo");
  });

  it("UT-CMT-006 flags a payment date comment as not general", () => {
    const root = comment({ commentType: COMMENT_TYPE.paymentDate, costId: "cost-1" });
    const threads = commentThreads([root]);
    expect(threads[0]?.isGeneral).toBe(false);
    expect(threads[0]?.relatedCostId).toBe("cost-1");
  });
});

describe("renumberThreads", () => {
  it("UT-CMT-007 numbers threads oldest first starting at 1", () => {
    const threads = commentThreads([
      comment({ id: "b", createdOn: "2026-02-01T00:00:00Z" }),
      comment({ id: "a", createdOn: "2026-01-01T00:00:00Z" }),
    ]);
    const numbered = renumberThreads(threads);
    const byId = new Map(numbered.map((t) => [t.root.id, t.sequenceNumber]));
    expect(byId.get("a")).toBe(1);
    expect(byId.get("b")).toBe(2);
  });
});

describe("gridCommentFlags", () => {
  it("UT-CMT-008 flags a contract with an unresolved general comment", () => {
    const threads = commentThreads([comment({ id: "r1", contractId: "contract-1" })]);
    const flags = gridCommentFlags(threads, [], 2026);
    expect(flags.get("contract-1")?.general).toBe(true);
  });

  it("UT-CMT-009 ignores a resolved thread", () => {
    const threads = commentThreads([comment({ id: "r1", contractId: "contract-1", resolved: true })]);
    expect(gridCommentFlags(threads, [], 2026).has("contract-1")).toBe(false);
  });

  it("UT-CMT-010 flags only the matching year and month for a payment date comment", () => {
    const threads = commentThreads([
      comment({
        id: "r1", contractId: "contract-1", commentType: COMMENT_TYPE.paymentDate, costId: "cost-1",
      }),
    ]);
    const costs = [{ id: "cost-1", contractId: "contract-1", year: 2026, month: 5 }];
    const flags = gridCommentFlags(threads, costs, 2026);
    expect(flags.get("contract-1")?.months[4]).toBe(true);
    // The entry still exists for 2027 (the thread registers regardless of match) but flags
    // nothing -- same shape the skeleton produces, and ".general"/".months" are the fields
    // callers actually read, not map membership.
    const wrongYear = gridCommentFlags(threads, costs, 2027).get("contract-1");
    expect(wrongYear?.general).toBe(false);
    expect(wrongYear?.months.some(Boolean)).toBe(false);
  });
});

describe("gridCommentIndicators", () => {
  it("UT-CMT-031 tooltips the most recent unresolved general thread, latest reply first", () => {
    const threads = commentThreads([
      comment({ id: "old", text: "old thread", createdOn: "2026-01-01T00:00:00Z" }),
      comment({ id: "new", text: "parent text", createdOn: "2026-02-01T00:00:00Z" }),
      comment({
        id: "new-r", parentId: "new", text: "the reply", createdOn: "2026-03-01T00:00:00Z",
      }),
    ]);
    const entry = gridCommentIndicators(threads, [], 2026).get("contract-1");
    expect(entry?.general).toBe(true);
    expect(entry?.generalTooltip).toBe("the reply");
  });

  it("UT-CMT-032 ignores resolved threads for both the dot and the tooltip", () => {
    const threads = commentThreads([
      comment({ id: "live", text: "live one", createdOn: "2026-01-01T00:00:00Z" }),
      comment({ id: "done", text: "resolved one", resolved: true, createdOn: "2026-06-01T00:00:00Z" }),
    ]);
    const entry = gridCommentIndicators(threads, [], 2026).get("contract-1");
    // The resolved thread is the most recent; it must not take the tooltip.
    expect(entry?.generalTooltip).toBe("live one");
  });

  it("UT-CMT-033 puts a payment-date tooltip on its cost's month and nowhere else", () => {
    const threads = commentThreads([comment({
      id: "p", text: "about May", commentType: COMMENT_TYPE.paymentDate, costId: "cost-1",
    })]);
    const costs = [{ id: "cost-1", contractId: "contract-1", year: 2026, month: 5 }];
    const entry = gridCommentIndicators(threads, costs, 2026).get("contract-1");
    expect(entry?.monthTooltips[4]).toBe("about May");
    expect(entry?.monthTooltips.filter((t) => t !== "")).toEqual(["about May"]);
    // Payment-date threads never light the contract-level dot.
    expect(entry?.general).toBe(false);
    expect(entry?.generalTooltip).toBe("");
  });

  it("UT-CMT-034 blanks the month tooltip when the grid is on another year", () => {
    const threads = commentThreads([comment({
      id: "p", text: "about May", commentType: COMMENT_TYPE.paymentDate, costId: "cost-1",
    })]);
    const costs = [{ id: "cost-1", contractId: "contract-1", year: 2026, month: 5 }];
    const entry = gridCommentIndicators(threads, costs, 2027).get("contract-1");
    expect(entry?.months.some(Boolean)).toBe(false);
    expect(entry?.monthTooltips.every((t) => t === "")).toBe(true);
  });

  it("UT-CMT-035 resolves the contract through the cost when the comment has no contract", () => {
    // `ContractId: Coalesce(ParentC.Contract, locCost.Contract)` — the canvas allows a
    // payment-date comment to carry only the cost lookup.
    const threads = commentThreads([comment({
      id: "p", text: "via cost", contractId: null, commentType: COMMENT_TYPE.paymentDate,
      costId: "cost-1",
    })]);
    const costs = [{ id: "cost-1", contractId: "contract-9", year: 2026, month: 2 }];
    const entry = gridCommentIndicators(threads, costs, 2026).get("contract-9");
    expect(entry?.months[1]).toBe(true);
    expect(entry?.monthTooltips[1]).toBe("via cost");
  });

  it("UT-CMT-036 keeps each contract's indicators separate", () => {
    const threads = commentThreads([
      comment({ id: "a", contractId: "contract-1", text: "for one" }),
      comment({ id: "b", contractId: "contract-2", text: "for two" }),
    ]);
    const map = gridCommentIndicators(threads, [], 2026);
    expect(map.get("contract-1")?.generalTooltip).toBe("for one");
    expect(map.get("contract-2")?.generalTooltip).toBe("for two");
  });
});

describe("resolveThread and reopenThread", () => {
  it("UT-CMT-011 resolving a root resolves its replies too", () => {
    const root = comment({ id: "root-1" });
    const reply = comment({ id: "reply-1", parentId: "root-1" });
    const resolved = resolveThread([root, reply], "root-1", "user-1");
    expect(resolved.every((c) => c.resolved)).toBe(true);
    expect(resolved.find((c) => c.id === "root-1")?.resolvedById).toBe("user-1");
  });

  it("UT-CMT-012 leaves an unrelated comment untouched", () => {
    const other = comment({ id: "other" });
    const resolved = resolveThread([comment({ id: "root-1" }), other], "root-1", "user-1");
    expect(resolved.find((c) => c.id === "other")?.resolved).toBe(false);
  });

  it("UT-CMT-013 reopening clears resolved and the resolver", () => {
    const root = comment({ id: "root-1", resolved: true, resolvedById: "user-1" });
    const reopened = reopenThread([root], "root-1");
    expect(reopened[0]).toMatchObject({ resolved: false, resolvedById: null });
  });
});

describe("planDeleteRoot", () => {
  it("UT-CMT-014 deletes a root and all its replies and renumbers what remains", () => {
    const threads = commentThreads([
      comment({ id: "r1", createdOn: "2026-01-01T00:00:00Z" }),
      comment({ id: "reply-1", parentId: "r1", createdOn: "2026-01-02T00:00:00Z" }),
      comment({ id: "r2", createdOn: "2026-02-01T00:00:00Z" }),
    ]);
    const plan = planDeleteRoot(threads, "r1");
    expect(plan.deletedIds.sort()).toEqual(["r1", "reply-1"]);
    expect(plan.remaining).toHaveLength(1);
    expect(plan.remaining[0]?.sequenceNumber).toBe(1);
  });

  it("UT-CMT-015 does nothing for an unknown root", () => {
    const threads = commentThreads([comment({ id: "r1" })]);
    expect(planDeleteRoot(threads, "missing")).toEqual({ deletedIds: [], remaining: threads });
  });
});

describe("sortComments", () => {
  const threads = commentThreads([
    comment({ id: "general", createdOn: "2026-01-02T00:00:00Z", commentType: COMMENT_TYPE.general }),
    comment({
      id: "payment", createdOn: "2026-01-01T00:00:00Z", commentType: COMMENT_TYPE.paymentDate,
      costId: "cost-1",
    }),
    comment({ id: "old-resolved", createdOn: "2025-01-01T00:00:00Z", resolved: true }),
  ]);

  it("UT-CMT-016 hides resolved threads unless asked for", () => {
    const visible = sortComments(threads, { pinGeneral: false, order: "oldest", showResolved: false });
    expect(visible.some((t) => t.root.id === "old-resolved")).toBe(false);
    const withResolved = sortComments(threads, { pinGeneral: false, order: "oldest", showResolved: true });
    expect(withResolved.some((t) => t.root.id === "old-resolved")).toBe(true);
  });

  it("UT-CMT-017 pins general comments above payment date ones", () => {
    const sorted = sortComments(threads, { pinGeneral: true, order: "oldest", showResolved: false });
    expect(sorted[0]?.root.id).toBe("general");
  });

  it("UT-CMT-018 without pinning sorts strictly by date", () => {
    const sorted = sortComments(threads, { pinGeneral: false, order: "oldest", showResolved: false });
    expect(sorted[0]?.root.id).toBe("payment");
  });

  it("UT-CMT-019 newest first reverses the date order", () => {
    const sorted = sortComments(threads, { pinGeneral: false, order: "newest", showResolved: false });
    expect(sorted[0]?.root.id).toBe("general");
  });
});

describe("paymentDateCommentsAllowed", () => {
  it("UT-CMT-020 refuses on an equal-distributed contract", () => {
    expect(paymentDateCommentsAllowed({ distribution: "equal" })).toBe(false);
  });

  it("UT-CMT-021 allows on an individual one or when the contract is unknown", () => {
    expect(paymentDateCommentsAllowed({ distribution: "individual" })).toBe(true);
    expect(paymentDateCommentsAllowed(null)).toBe(true);
  });
});

describe("canSaveComments", () => {
  const draft = (over: Partial<{ text: string; isDirty: boolean; isModified: boolean }> = {}) =>
    ({ id: "d1", text: "hi", isDirty: false, isModified: false, ...over });

  it("UT-CMT-022 refuses while any open draft is blank", () => {
    expect(canSaveComments([draft({ text: "  ", isDirty: true })], [])).toBe(false);
  });

  it("UT-CMT-023 enables once something is dirty or modified", () => {
    expect(canSaveComments([draft({ isDirty: true })], [])).toBe(true);
    expect(canSaveComments([draft({ isModified: true })], [])).toBe(true);
  });

  it("UT-CMT-024 enables from a pending delete alone", () => {
    expect(canSaveComments([], ["comment-1"])).toBe(true);
  });

  it("UT-CMT-025 refuses when nothing changed at all", () => {
    expect(canSaveComments([draft()], [])).toBe(false);
  });
});

describe("commentEditable and commentName", () => {
  it("UT-CMT-026 hides edit and resolve on a resolved thread", () => {
    expect(commentEditable({ resolved: true })).toBe(false);
    expect(commentEditable({ resolved: false })).toBe(true);
  });

  it("UT-CMT-027 builds the saved Name from sequence and full name", () => {
    expect(commentName(2, "Shakti Singh Rajput")).toBe("Comment - 2 - Shakti Singh Rajput");
  });

  it("UT-CMT-037 SOURCE DEFECT N-4: deleting a thread rewrites a survivor's stored Name", () => {
    // The canvas persists the client-assigned sequence number into the row's primary name
    // (`Name: $"Comment - {SequenceNumber} - {User().FullName}"`, CapexScreenCode.txt:10012).
    // Nothing about the second thread changed, but deleting the first renumbers it, so the next
    // save writes a different Name to an untouched Dataverse row. Reproduced, not fixed.
    const threads = commentThreads([
      comment({ id: "first", createdOn: "2026-01-01T00:00:00Z" }),
      comment({ id: "second", createdOn: "2026-02-01T00:00:00Z" }),
    ]);
    const before = threads.find((t) => t.root.id === "second") as (typeof threads)[number];
    expect(commentName(before.sequenceNumber, "Shakti")).toBe("Comment - 2 - Shakti");

    const after = planDeleteRoot(threads, "first").remaining[0] as (typeof threads)[number];
    expect(after.root.id).toBe("second");
    expect(commentName(after.sequenceNumber, "Shakti")).toBe("Comment - 1 - Shakti");
  });
});

describe("commentCosts", () => {
  const line = (id: string, payments: { id?: string; year: number; month: number }[]) =>
    ({ id, payments });

  it("UT-CMT-038 projects every saved payment as {id, contractId, year, month}", () => {
    expect(commentCosts([
      line("contract-1", [{ id: "cost-a", year: 2026, month: 3 }]),
      line("contract-2", [
        { id: "cost-b", year: 2026, month: 7 },
        { id: "cost-c", year: 2027, month: 1 },
      ]),
    ])).toEqual([
      { id: "cost-a", contractId: "contract-1", year: 2026, month: 3 },
      { id: "cost-b", contractId: "contract-2", year: 2026, month: 7 },
      { id: "cost-c", contractId: "contract-2", year: 2027, month: 1 },
    ]);
  });

  it("UT-CMT-039 skips payments with no id — they have no vsb_capexcostid to comment on", () => {
    expect(commentCosts([
      line("contract-1", [{ year: 2026, month: 3 }, { id: "cost-a", year: 2026, month: 4 }]),
    ])).toEqual([{ id: "cost-a", contractId: "contract-1", year: 2026, month: 4 }]);
  });

  it("UT-CMT-040 treats a missing cost book as empty rather than throwing", () => {
    expect(commentCosts(undefined)).toEqual([]);
  });

  it("UT-CMT-041 feeds gridCommentIndicators so a payment-date dot lands on its month", () => {
    const costs = commentCosts([line("contract-1", [{ id: "cost-a", year: 2026, month: 3 }])]);
    const threads = commentThreads([
      comment({ id: "pd", contractId: "contract-1", costId: "cost-a",
        commentType: COMMENT_TYPE.paymentDate, text: "March looks wrong" }),
    ]);

    const march = gridCommentIndicators(threads, costs, 2026).get("contract-1");
    expect(march?.months[2]).toBe(true);
    expect(march?.monthTooltips[2]).toBe("March looks wrong");

    // Same comment, different grid year — the canvas only dots the year on screen.
    expect(gridCommentIndicators(threads, costs, 2027).get("contract-1")?.months[2] ?? false)
      .toBe(false);
  });
});

describe("paymentDateComplete", () => {
  it("UT-CMT-042 a general comment never needs a cost row", () => {
    expect(paymentDateComplete({ commentType: COMMENT_TYPE.general, costId: null })).toBe(true);
  });

  it("UT-CMT-043 a payment date comment without a cost row is incomplete", () => {
    expect(paymentDateComplete({ commentType: COMMENT_TYPE.paymentDate, costId: null }))
      .toBe(false);
    expect(paymentDateComplete({ commentType: COMMENT_TYPE.paymentDate, costId: "cost-a" }))
      .toBe(true);
  });

  it("UT-CMT-044 LIVE DEFECT: a cost-less payment date comment produces no dot at all", () => {
    // `vsb_capexcomments` e2ec8083-12b0-f111-aaac-7ced8d975a55 on VSBCloud_Dev: type
    // "Comments to payment date", contract set, `vsb_capexcost` NULL, unresolved. It is the
    // only unresolved thread on its contract and it shows nothing — no name dot (not General)
    // and no month dot (no cost, so no year/month). That is the reported missing red dot.
    const threads = commentThreads([
      comment({
        id: "e2ec8083", contractId: "contract-1", costId: null,
        commentType: COMMENT_TYPE.paymentDate, text: "New Test",
      }),
    ]);
    const flags = gridCommentIndicators(threads, [], 2026).get("contract-1");
    expect(flags?.general).toBe(false);
    expect(flags?.months.some(Boolean)).toBe(false);
  });

  it("UT-CMT-045 canSaveComments refuses a draft that is still missing its payment date", () => {
    const base = { id: "d1", text: "New Test", isDirty: true, isModified: true };
    expect(canSaveComments([{ ...base, missingPaymentDate: true }], [])).toBe(false);
    expect(canSaveComments([{ ...base, missingPaymentDate: false }], [])).toBe(true);
    // A pending delete cannot save past an incomplete draft either.
    expect(canSaveComments([{ ...base, missingPaymentDate: true }], ["comment-1"])).toBe(false);
  });
});

describe("commentTypeLabel, commentDateLabel and commentHeading", () => {
  it("UT-CMT-046 labels both choice values exactly as the column spells them", () => {
    expect(commentTypeLabel(COMMENT_TYPE.general)).toBe("General Comment");
    expect(commentTypeLabel(COMMENT_TYPE.paymentDate)).toBe("Comments to payment date");
  });

  it("UT-CMT-047 formats the date as dd.MM.yyyy with both parts padded", () => {
    expect(commentDateLabel("2026-09-14T13:30:00")).toBe("14.09.2026");
    expect(commentDateLabel("2026-01-05T00:00:00")).toBe("05.01.2026");
  });

  it("UT-CMT-048 returns an empty string for an unusable date rather than NaN.NaN.NaN", () => {
    expect(commentDateLabel("")).toBe("");
    expect(commentDateLabel("not a date")).toBe("");
  });

  it("UT-CMT-049 builds the panel heading, with a null sequence meaning a reply", () => {
    const c = comment({ createdByName: "Shakti Singh Rajput", createdOn: "2026-09-14T13:30:00" });
    expect(commentHeading(c, 1)).toBe("Comment #01 [Shakti Singh Rajput - 14.09.2026]");
    expect(commentHeading(c, 12)).toBe("Comment #12 [Shakti Singh Rajput - 14.09.2026]");
    expect(commentHeading(c, null)).toBe("Reply [Shakti Singh Rajput - 14.09.2026]");
  });

  it("UT-CMT-050 tolerates a comment with no author name", () => {
    const c = comment({ createdByName: null, createdOn: "2026-09-14T13:30:00" });
    expect(commentHeading(c, 1)).toBe("Comment #01 [ - 14.09.2026]");
  });
});

describe("the canvas gallery sort — do not 'fix' this again", () => {
  /**
   * Four roots, alternating type, oldest first: general, payment-date, general, payment-date.
   * `renumberThreads` numbers them 1..4 in that order.
   */
  const alternating = () => commentThreads([
    comment({ id: "g1", createdOn: "2026-01-01T00:00:00Z", text: "g1" }),
    comment({ id: "p1", createdOn: "2026-01-02T00:00:00Z", text: "p1",
      commentType: COMMENT_TYPE.paymentDate, costId: "cost-a" }),
    comment({ id: "g2", createdOn: "2026-01-03T00:00:00Z", text: "g2" }),
    comment({ id: "p2", createdOn: "2026-01-04T00:00:00Z", text: "p2",
      commentType: COMMENT_TYPE.paymentDate, costId: "cost-b" }),
  ]);

  it("UT-CMT-059 pinning generals displays #01, #03, #02, #04 — numbering is NOT the sort", () => {
    // Two independent canvas formulas, and this result has been reported as a bug twice.
    //
    //  - `CapexScreenCode.txt:7440-7464` numbers the ROOTS into `SequenceNumber` by 'Created On'
    //    ASCENDING, at load, before anything is displayed:
    //      ClearCollect(colTempRoots, Sort(Filter(colCapexComments, IsRoot = true), 'Created On',
    //                                      SortOrder.Ascending));
    //      ForAll(Sequence(CountRows(colTempRoots)), Patch(..., {SequenceNumber: Value}))
    //  - `:8283-8316` then orders the GALLERY with a triple Sort whose tier 2 is
    //      If(CheckboxCanvas1.Checked And IsGeneralComment = true, 0, 1), SortOrder.Ascending
    //
    // Nothing renumbers afterwards, so with `Pin general comments to top` on — its default,
    // `locPinGeneralComments: true` at `:7492` — the canvas genuinely shows 01, 03, 02, 04.
    const shown = sortComments(alternating(), {
      pinGeneral: true, order: "oldest", showResolved: false,
    });
    expect(shown.map((t) => t.sequenceNumber)).toEqual([1, 3, 2, 4]);
    expect(shown.map((t) => t.root.id)).toEqual(["g1", "g2", "p1", "p2"]);
  });

  it("UT-CMT-060 unpinning restores 01, 02, 03, 04, and [Newest] reverses only the order", () => {
    // Tier 3 is 'Created On' with the direction taken from modernDropdown1 (`:8294-8299`);
    // the sequence numbers are untouched by it.
    expect(sortComments(alternating(), { pinGeneral: false, order: "oldest", showResolved: false })
      .map((t) => t.sequenceNumber)).toEqual([1, 2, 3, 4]);
    expect(sortComments(alternating(), { pinGeneral: false, order: "newest", showResolved: false })
      .map((t) => t.sequenceNumber)).toEqual([4, 3, 2, 1]);
    // Pinned AND newest-first: generals still first, newest within each group (`:8294-8307`).
    expect(sortComments(alternating(), { pinGeneral: true, order: "newest", showResolved: false })
      .map((t) => t.sequenceNumber)).toEqual([3, 1, 4, 2]);
  });
});

describe("commentTypeValue", () => {
  it("UT-CMT-061 a general comment reads just the choice label", () => {
    expect(commentTypeValue(COMMENT_TYPE.general, null)).toBe("General Comment");
    // The cost is ignored for a general comment — `If(IsGeneralComment = false, ...)` (:9471).
    expect(commentTypeValue(COMMENT_TYPE.general, { year: 2026, month: 1 }))
      .toBe("General Comment");
  });

  it("UT-CMT-062 a payment-date comment appends ' : {Month} , {Year}' — spaces and all", () => {
    // `lbl_Read_Type_Value.Text`, CapexScreenCode.txt:9466-9474:
    //   ... & If(ThisItem.IsGeneralComment = false,
    //            $" : {Text(ThisItem.RelatedCost.Month)} , {ThisItem.RelatedCost.Year}")
    // The space before the colon and the space before the comma are IN THE CANVAS LITERAL.
    // Tidying them is a visible divergence from the app this is being held against.
    expect(commentTypeValue(COMMENT_TYPE.paymentDate, { year: 2026, month: 1 }))
      .toBe("Comments to payment date : January , 2026");
    expect(commentTypeValue(COMMENT_TYPE.paymentDate, { year: 2028, month: 3 }))
      .toBe("Comments to payment date : March , 2028");
  });

  it("UT-CMT-063 the year carries no thousands separator", () => {
    // `{...Year}` interpolates a whole number with no format string, so 2026 — not "2,026",
    // which is only what `Text(x, "#,##0")` would give.
    expect(commentTypeValue(COMMENT_TYPE.paymentDate, { year: 2026, month: 12 }))
      .toContain(" , 2026");
  });

  it("UT-CMT-064 a cost-less payment-date comment leaves both halves blank, as the canvas does", () => {
    // Live row e2ec8083-12b0-f111-aaac-7ced8d975a55: `vsb_capexcost` NULL. `Text(Blank())` is "",
    // so the canvas renders the separators around nothing rather than hiding them.
    expect(commentTypeValue(COMMENT_TYPE.paymentDate, null))
      .toBe("Comments to payment date :  , ");
  });
});

describe("commentPanelTitle and commentBreadcrumb", () => {
  it("UT-CMT-065 the header counts the 'Comments : ' prefix inside its 45 characters", () => {
    // `Label1.Text`, :8073-8081 — With({_text: "Comments : " & Name},
    //                                  If(Len(_text) > 45, Left(_text, 45) & "...", _text))
    expect(commentPanelTitle("Gesamt (CAPEX_after_FID) (59018_0_47110101)"))
      .toBe("Comments : Gesamt (CAPEX_after_FID) (59018_0_...");
    expect(commentPanelTitle("New Contract")).toBe("Comments : New Contract");
    // Exactly 45 is not truncated — the canvas tests `> 45`.
    expect(commentPanelTitle("x".repeat(34))).toBe(`Comments : ${"x".repeat(34)}`);
    expect(commentPanelTitle("x".repeat(35))).toBe(`Comments : ${"x".repeat(34)}...`);
  });

  it("UT-CMT-066 the breadcrumb truncates at 50, as the screenshot shows", () => {
    // `Label5.Text`, :8147-8155. The screenshot's line is exactly 50 characters + "...".
    expect(commentBreadcrumb("Wind Turbine / Panels / Turbine / PV Supply Agreement"))
      .toBe("Wind Turbine / Panels / Turbine / PV Supply Agreem...");
    expect(commentBreadcrumb("Wind Turbine / Panels / Turbine"))
      .toBe("Wind Turbine / Panels / Turbine");
  });
});

describe("commentYearOptions and commentMonthOptions", () => {
  const costs = [
    { id: "a", year: 2026, month: 3 }, { id: "b", year: 2026, month: 1 },
    { id: "c", year: 2028, month: 7 }, { id: "d", year: 2027, month: 5 },
    { id: "e", year: 2026, month: 12 },
  ];

  it("UT-CMT-067 years are distinct and DESCENDING", () => {
    // `Sort(Distinct(locAvailebleCapexCosts, vsb_year), Value, SortOrder.Descending)` (:9097-9105).
    expect(commentYearOptions(costs)).toEqual([2028, 2027, 2026]);
  });

  it("UT-CMT-068 months are the chosen year's only, January-first", () => {
    // The canvas iterates `Choices([@Month])` and keeps the ones that have a cost row
    // (:9164-9189), so the order is the enum's, not the cost rows'.
    expect(commentMonthOptions(costs, 2026).map((c) => c.month)).toEqual([1, 3, 12]);
    expect(commentMonthOptions(costs, 2028).map((c) => c.id)).toEqual(["c"]);
  });

  it("UT-CMT-069 no year chosen means no months to choose from", () => {
    // `Filter(locAvailebleCapexCosts, vsb_year = ThisItem.SelectedYear)` with a blank
    // `SelectedYear` matches nothing, which is the state the canvas leaves behind after a type
    // change (:9005-9006) or a year change (:9113).
    expect(commentMonthOptions(costs, null)).toEqual([]);
  });
});

describe("canSaveComments and the open-card gate", () => {
  it("UT-CMT-070 only an OPEN card can make Save invalid", () => {
    // `tgl_Root_IsInvalid.Default = (ThisItem.IsNew Or ThisItem.IsEdit) And IsBlank(Trim(text))`
    // (:9885). A row that was merely RESOLVED is IsModified but neither IsNew nor IsEdit, so it
    // cannot block Save — and must not, because there is no editor on screen to fix it in. Before
    // this gate, resolving the cost-less payment-date comment e2ec8083 killed Save with no
    // `Required` message anywhere to explain it.
    const resolvedOnly = {
      id: "r1", text: "New Test", isDirty: false, isModified: true,
      missingPaymentDate: true, isOpen: false,
    };
    expect(canSaveComments([resolvedOnly], [])).toBe(true);
    expect(canSaveComments([{ ...resolvedOnly, isOpen: true }], [])).toBe(false);
    // Same for blank text.
    expect(canSaveComments([{ ...resolvedOnly, text: "  ", missingPaymentDate: false }], []))
      .toBe(true);
  });

  it("UT-CMT-071 omitting isOpen still means 'open', so existing callers are unchanged", () => {
    expect(canSaveComments([{ id: "d", text: "", isDirty: true, isModified: true }], []))
      .toBe(false);
  });
});

describe("commentName for a reply", () => {
  it("UT-CMT-072 a reply has no sequence number, and the blank lands in Name", () => {
    // `:7435-7439` blanks `SequenceNumber` on every non-root; `:10012` interpolates it into
    // `Name` regardless. The live replies d8e6765a…, 19e0b484… and 48eef580… on VSBCloud_Dev are
    // all called `Comment -  - <name>`, with two spaces. No row anywhere is `Comment - 0 - …`.
    expect(commentName(null, "Azure VSB Cloud Flow Service User"))
      .toBe("Comment -  - Azure VSB Cloud Flow Service User");
    expect(commentName(1, "Singh Rajput, Shakti (external)"))
      .toBe("Comment - 1 - Singh Rajput, Shakti (external)");
  });
});
