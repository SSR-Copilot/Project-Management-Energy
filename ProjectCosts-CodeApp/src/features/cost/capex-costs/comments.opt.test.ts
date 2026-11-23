/**
 * OPT-25 (B4, D160) - `commentThreads` groups replies with a Map and `commentCosts` projects only the
 * payments the comment threads link to. Both are compared against the REPLACED code, kept here verbatim as oracles,
 * over generated data (many seeds, ties on `createdOn`, orphan replies, payments without ids, duplicate ids).
 */
import { describe, expect, it } from "vitest";
import {
  COMMENT_TYPE, commentCosts, commentThreads, gridCommentIndicators, referencedCostIds, renumberThreads, threadLatestActivity,
  type CapexComment, type CommentThread,
} from "./comments";

/** The replaced `commentThreads`: roots x comments filter + sort. */
function oldCommentThreads(comments: readonly CapexComment[]): CommentThread[] {
  const roots = comments.filter((c) => c.parentId === null);
  const threads = roots.map((root) => {
    const replies = comments
      .filter((c) => c.parentId === root.id)
      .sort((a, b) => a.createdOn.localeCompare(b.createdOn));
    return {
      root, replies,
      ...threadLatestActivity(root, replies),
      resolved: root.resolved,
      sequenceNumber: 0,
      relatedCostId: root.costId,
      isGeneral: root.commentType === COMMENT_TYPE.general,
    };
  });
  return renumberThreads(threads);
}

/** The replaced `commentCosts`: one object per payment. */
function oldCommentCosts(lines: readonly { id: string; payments: readonly { id?: string; year: number; month: number }[] }[] | undefined) {
  return (lines ?? []).flatMap((line) =>
    line.payments
      .filter((p): p is typeof p & { id: string } => Boolean(p.id))
      .map((p) => ({ id: p.id, contractId: line.id, year: p.year, month: p.month })),
  );
}

function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}

function generate(seed: number) {
  const r = rng(seed);
  const int = (n: number) => Math.floor(r() * n);
  const lines = Array.from({ length: 1 + int(6) }, (_, li) => ({
    id: `line-${li}`,
    payments: Array.from({ length: int(30) }, (_, pi) => ({
      // some unsaved (no id), some duplicate ids across lines
      id: r() < 0.15 ? undefined : r() < 0.1 ? `dup-${int(3)}` : `pay-${li}-${pi}`,
      year: 2024 + int(4), month: 1 + int(12),
    })),
  }));
  const allIds = lines.flatMap((l) => l.payments.map((p) => p.id)).filter(Boolean) as string[];
  const nRoots = int(12);
  const comments: CapexComment[] = [];
  const rootIds: string[] = [];
  for (let i = 0; i < nRoots; i++) {
    const id = `root-${i}`; rootIds.push(id);
    comments.push({
      id, text: `t${i}`, contractId: r() < 0.7 ? `line-${int(lines.length)}` : null,
      costId: r() < 0.6 && allIds.length ? allIds[int(allIds.length)] : r() < 0.2 ? "missing-cost" : null,
      parentId: null, rootId: null, commentType: r() < 0.5 ? COMMENT_TYPE.general : COMMENT_TYPE.general + 1,
      resolved: r() < 0.25, resolvedById: null,
      createdOn: `2026-0${1 + int(3)}-0${1 + int(3)}T10:00:00Z`, createdByName: "x",
    } as CapexComment);
  }
  const nReplies = int(25);
  for (let i = 0; i < nReplies; i++) {
    comments.push({
      id: `rep-${i}`, text: `r${i}`, contractId: null, costId: null,
      parentId: r() < 0.9 && rootIds.length ? rootIds[int(rootIds.length)] : "orphan-root",
      rootId: null, commentType: COMMENT_TYPE.general, resolved: false, resolvedById: null,
      createdOn: `2026-0${1 + int(3)}-0${1 + int(3)}T10:00:00Z`, createdByName: "y",
    } as CapexComment);
  }
  // shuffle
  for (let i = comments.length - 1; i > 0; i--) { const j = int(i + 1); [comments[i], comments[j]] = [comments[j]!, comments[i]!]; }
  return { lines, comments, year: 2024 + int(4) };
}

describe("OPT-25 comments (differential against the replaced functions)", () => {
  it("UT-CMT-OPT-001 commentThreads is identical to the roots x filter version over 400 seeds", () => {
    for (let seed = 1; seed <= 400; seed++) {
      const { comments } = generate(seed);
      expect(commentThreads(comments), `seed ${seed}`).toEqual(oldCommentThreads(comments));
    }
  });

  it("UT-CMT-OPT-002 the grid indicators are identical when only the referenced payments are projected, over 400 seeds", () => {
    for (let seed = 1; seed <= 400; seed++) {
      const { lines, comments, year } = generate(seed);
      const threads = commentThreads(comments);
      const oldOut = gridCommentIndicators(threads, oldCommentCosts(lines), year);
      const newOut = gridCommentIndicators(threads, commentCosts(lines, referencedCostIds(threads)), year);
      expect(newOut, `seed ${seed}`).toEqual(oldOut);
    }
  });

  it("UT-CMT-OPT-003 commentCosts without a filter is the old projection, and an empty filter allocates nothing", () => {
    for (let seed = 1; seed <= 100; seed++) {
      const { lines } = generate(seed);
      expect(commentCosts(lines)).toEqual(oldCommentCosts(lines));
      expect(commentCosts(lines, new Set())).toEqual([]);
    }
    expect(commentCosts(undefined)).toEqual([]);
  });

  it("UT-CMT-OPT-004 only linked payments are projected: N allocations for N linked costs, not one per payment", () => {
    const lines = [{ id: "l", payments: Array.from({ length: 5000 }, (_, i) => ({ id: `p${i}`, year: 2026, month: 1 })) }];
    const projected = commentCosts(lines, new Set(["p7", "p4999"]));
    expect(projected.map(c => c.id)).toEqual(["p7", "p4999"]);
    expect(oldCommentCosts(lines)).toHaveLength(5000);
  });
});
