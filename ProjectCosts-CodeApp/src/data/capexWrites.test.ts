/**
 * `@/data/capexWrites` delete paths: a Dataverse refusal must REJECT, not resolve like a
 * success (`ProjectDocs/instructions/CONVENTIONS.md` rule 14), and the children still go before
 * the parent.
 *
 * Lives beside the module rather than in `costRepository.test.ts`, which covers only the pure
 * narrowing rule and the repository's method surface and mocks nothing.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { deleteCostLine } from "./capexWrites";
import type { CostLine } from "@/features/cost/costing/model";

/** Every `deleteRecord` call, in order — the ordering assertion reads this. */
let deleted: { operation: string; table: string; id: string }[] = [];
/** Record ids whose `deleteRecord` should fail, as a refused Dataverse DELETE does. */
let failDeleteFor = new Set<string>();
/** Comment ids `loadComments` reports for the contract. */
let commentIds: string[] = [];
let deletedComments: string[] = [];

vi.mock("./client", () => ({
  deleteRecord: async (operation: string, table: string, id: string) => {
    if (failDeleteFor.has(id)) throw new Error(`delete ${id} denied`);
    deleted.push({ operation, table, id });
  },
}));

vi.mock("./comments", () => ({
  loadComments: async (contractIds: readonly string[]) =>
    commentIds.map((id) => ({ id, contractId: contractIds[0], commentType: 0 })),
  deleteComment: async (id: string) => {
    deletedComments.push(id);
    deleted.push({ operation: "delete capex comment", table: "vsb_capexcomments", id });
  },
}));

function line(overrides: Partial<CostLine> = {}): CostLine {
  return {
    id: "contract-1",
    accountId: "acc-1",
    description: "Grid connection",
    payer: "SPV",
    depreciation: false,
    vat: false,
    standard: false,
    distribution: "equal",
    equalMode: "cluster",
    distributionScheme: "absolute",
    startDate: "",
    endDate: "",
    frequency: 1,
    clusters: [],
    comments: [],
    payments: [
      { id: "cost-1", year: 2026, month: 1, amount: 100, paid: false },
      { id: "cost-2", year: 2026, month: 2, amount: 100, paid: false },
    ],
    ...overrides,
  } as CostLine;
}

beforeEach(() => {
  deleted = [];
  deletedComments = [];
  failDeleteFor = new Set();
  commentIds = ["comment-1"];
});

describe("deleteCostLine", () => {
  it("UT-CAPEXW-001 rejects when a cost-row delete is refused", async () => {
    // The generated `Vsb_capexcostsService.delete()` discards the `IOperationResult` and the SDK
    // never throws, so before rule 14 was applied here this resolved exactly like a success and
    // the screen reported a deletion Dataverse had refused.
    failDeleteFor.add("cost-2");
    await expect(deleteCostLine(line())).rejects.toThrow("delete cost-2 denied");
    // It stopped AT the refusal: the contract is still there, which is the recoverable state.
    expect(deleted.map((d) => d.id)).toEqual(["comment-1", "cost-1"]);
  });

  it("UT-CAPEXW-002 rejects when the contract delete is refused", async () => {
    // A cascade restriction on `vsb_capexprojectcontract` is a 403-shaped refusal, not an
    // exception — the case the canvas itself wraps in `IfError`.
    failDeleteFor.add("contract-1");
    await expect(deleteCostLine(line())).rejects.toThrow("delete contract-1 denied");
  });

  it("UT-CAPEXW-003 deletes comments, then cost rows, then the contract", async () => {
    // Children before parents: a `vsb_capexcomments` row points at both the contract and a cost
    // row, so any other order leaves a comment hanging off a row that no longer exists.
    await deleteCostLine(line());
    expect(deleted).toEqual([
      { operation: "delete capex comment", table: "vsb_capexcomments", id: "comment-1" },
      { operation: "delete CAPEX cost", table: "vsb_capexcosts", id: "cost-1" },
      { operation: "delete CAPEX cost", table: "vsb_capexcosts", id: "cost-2" },
      {
        operation: "delete CAPEX contract",
        table: "vsb_capexprojectcontracts",
        id: "contract-1",
      },
    ]);
  });
});
