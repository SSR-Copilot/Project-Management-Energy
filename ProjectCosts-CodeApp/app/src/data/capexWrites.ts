/**
 * CAPEX writes against Dataverse.
 *
 * Three operations, matching what the DEVEX/CAPEX screen actually does: mark a month paid or
 * unpaid, save a cost line, delete one.
 *
 * **Not transactional.** The SDK exposes create/update/delete per record and no changeset, so a
 * multi-row save can half-apply. The canvas has the same weakness — it patches inside `ForAll`
 * and removes in a second `ForAll` — and `docs/VSBCloud-Harness-Plan.md` §19 calls for one
 * `$batch` instead. Until that exists the writes are ordered so a failure leaves the most
 * recoverable state: the contract row first, then its cost rows, deletes last.
 *
 * **Owning business unit.** `vsb_capexprojectcontract` and `vsb_capexcost` are project data, so
 * every CREATE binds the project's business unit. Omitting it never errors — Dataverse derives
 * the BU from the caller — and the row simply becomes invisible later to a colleague scoped to a
 * different BU. The canvas does the same thing with
 * `'Owning Business Unit': gblSelectedProject.'Besitzer (Unternehmenseinheit)'`.
 */
import { Vsb_capexcostsService } from "@/generated/services/Vsb_capexcostsService";
import { Vsb_capexprojectcontractsService } from "@/generated/services/Vsb_capexprojectcontractsService";
import { unwrap } from "@/platform/errors";
import { capexWriteSet, type CostRowInput } from "@/features/capex-costs/writeSet";
import { byClusterJson, planDeleteContract, startEndJson } from "@/features/capex-costs/rules";
import { deleteComment, loadComments } from "./comments";
import { COMMENT_TYPE } from "@/features/capex-costs/comments";
import { equalDistributionAmounts } from "@/features/capex-costs/distribution";
import type { CostLine } from "@/features/costing/model";

/** `vsb_costtype`, verified live: None 952850000 · DevCo 952850001 · SPV 952850002. */
const COST_TYPE = { devCo: 952850001, spv: 952850002 } as const;
/** `vsb_distribution`. */
const DISTRIBUTION = { equal: 952850000, individual: 952850001 } as const;
/** `vsb_distributionscheme`. */
const DISTRIBUTION_SCHEME = { percent: 952850000, absolute: 952850001 } as const;

const bind = (entitySet: string, id: string) => `/${entitySet}(${id})`;

export interface CapexWriteContext {
  projectId: string;
  /** From `session.project.owningBusinessUnitId`. */
  owningBusinessUnitId?: string;
}

/* ═══════════════════════════════════════════════════════════ paid toggle ══ */

/**
 * Mark one month paid or unpaid.
 *
 * A single field on a single row — the cheapest write in the module, and the one the grid
 * triggers most. The PCF only makes a cell clickable when it holds a cost, so `costId` is
 * always known by the time this is called.
 */
export async function setCostPaid(costId: string, paid: boolean): Promise<void> {
  unwrap(
    await Vsb_capexcostsService.update(costId, { vsb_costpaid: paid }),
    "set cost paid",
  );
}

/* ═════════════════════════════════════════════════════════════ save line ══ */

export interface SaveCostLineArgs extends CapexWriteContext {
  line: CostLine;
  /** The sub-account the cost is filed under. */
  accountId: string;
  /**
   * What the panel proposes for the twelve months, across every year it touches.
   *
   * `amount: null` means "this month had a row and no longer should" — `reconcilePayments`
   * appends one of those for every month the contract is losing, and `capexWriteSet` turns it
   * into a delete. A save that only ever passed the proposed months could never shrink a
   * contract's schedule.
   */
  payments: readonly { id?: string; year: number; month: number; amount: number | null }[];
  /**
   * Whether this is a create. Passed in rather than inferred: the panel mints a
   * `crypto.randomUUID()` for a new line, which is indistinguishable from a real Dataverse id.
   * The screen knows the answer — it opened the panel.
   */
  isNew: boolean;
  /**
   * `locMilestoneRelinkResetNeeded` — the relink confirmation was shown AND accepted.
   *
   * The canvas' `OnConfirm` (`CapexScreenCode.txt:19906-19925`) runs, BEFORE re-triggering the
   * save,
   *
   *     UpdateIf('CAPEX Costs', Contract = <this contract> && 'Cost Paid' = true,
   *              {'Cost Paid': false});
   *     RemoveIf('Capex Comments',
   *              'Capex Contract' = <this contract>
   *              && 'Comment Type' = 'Capex Comment Type'.'Comments to payment date')
   *
   * because "Paid" markers and payment-date comments are not supported on a milestone-linked
   * cost — which is exactly what the dialog's third bullet promises the user. Folding it into
   * the save keeps the promise and the write in one place; `needsClusterLinkageConfirmation`
   * (`features/capex-costs/rules.ts`) decides whether the dialog is shown at all.
   */
  resetPaidAndPaymentDateComments?: boolean;
}

/**
 * Creates or updates the contract, then reconciles its cost rows.
 *
 * The cost half goes through `capexWriteSet`, which is where the canvas's "a typed zero is not a
 * blank" rule lives. Nothing here decides that; this function only carries out the plan.
 */
export async function saveCostLine(args: SaveCostLineArgs): Promise<string> {
  const { line, accountId, projectId, owningBusinessUnitId, payments, isNew } = args;

  const isEqual = line.distribution === "equal";
  // `locNumPayments` — the months the contract actually ends up with. The tombstones
  // (`amount: null`) are months being removed and are not payments.
  const numPayments = payments.filter((p) => p.amount !== null && p.amount !== undefined).length;

  const fields = {
    // The canvas writes the panel's Description box to BOTH `Name` and `Description`
    // (`CapexScreenCode.txt:1509` / `:1512`). Only `vsb_name` was written before, which is why
    // `vsb_description` is null across the dev org — and why `contractLabel` has to fall back
    // to the name. Writing both makes a row we save readable either way.
    vsb_name: line.description,
    vsb_description: line.description,
    vsb_costtype: line.payer === "DevCo" ? COST_TYPE.devCo : COST_TYPE.spv,
    vsb_applyvat: line.vat,
    vsb_depreciation: line.depreciation,
    vsb_distribution:
      line.distribution === "equal" ? DISTRIBUTION.equal : DISTRIBUTION.individual,
    /*
     * `% Values` 952850000 / `Absolute Values` 952850001 — confirmed against the generated
     * option set and against live rows, which read back as "Absolute Values".
     *
     * Written on EVERY save. The canvas only writes it from the individual-distribution branch
     * (`CapexScreenCode.txt:969`); in the equal branch the same assignment is commented out
     * (`:1513-1520`, and note the typo `'Absolut Values'` in the dead code, which is why it is
     * dead). Ours is a superset: `CostLine.distributionScheme` always carries a value, the
     * panel defaults it to `absolute`, and leaving the column untouched on an equal save would
     * strand whatever an earlier individual save had put there.
     */
    vsb_distributionscheme:
      line.distributionScheme === "percent"
        ? DISTRIBUTION_SCHEME.percent : DISTRIBUTION_SCHEME.absolute,
    vsb_distributionfrequency: line.frequency,
    // The contract's own stored total. The canvas keeps this independent of the monthly rows
    // and the panel reads it back on edit, so a save that omitted it would blank the box next
    // time the panel opened.
    ...(line.totalCost === undefined ? {} : { vsb_totalcost: line.totalCost }),
    /*
     * The two columns the panel's Select Cluster and Start/End Date controls live in.
     *
     * They were simply absent from this object, so neither control had anywhere to persist and
     * every reopen of the panel showed the stored row's old selection — the reported "Edit
     * panel is not saving Cluster / Start date / End date".
     *
     * Written only for an EQUAL distribution, which is the only branch the canvas writes them
     * in (`CapexScreenCode.txt:1544` / `:1555`; the individual-distribution Patch at `:963`
     * sets neither). An individual contract has no cluster or date controls on screen, so
     * writing them would be inventing a selection the user never made — and, worse, would make
     * `resolveEqualMode` claim a mode for a contract that has none.
     */
    ...(isEqual
      ? {
        vsb_byclusterjson: byClusterJson(line.equalMode === "cluster" ? line.clusters : []),
        vsb_bystartenddatejson: line.equalMode === "dates"
          ? startEndJson(line.startDate, line.endDate)
          : startEndJson("", ""),
        /*
         * `Average Payment` — `RoundDown('Total Cost' / locNumPayments, 0)`, patched by the
         * canvas right after the cost rows go in (`CapexScreenCode.txt:1846-1856`). It is the
         * rounded-down BASE, not the mean: 1000 over 3 stores 333 while paying 333/333/334.
         *
         * `vsb_averagepayment` is a TEXT column, not a decimal one — checked against
         * VSBCloud_Dev, where it holds "1276171" with no thousands separator while
         * `vsb_totalcost` on the same row formats as "8,933,200". Hence `String(...)`.
         */
        ...(line.totalCost === undefined || numPayments === 0
          ? {}
          : {
            vsb_averagepayment: String(
              equalDistributionAmounts(line.totalCost, numPayments).averagePayment,
            ),
          }),
      }
      : {}),
    vsb_isstandardcontract: line.standard,
    // Bound only on create — a standard contract's link to its assumption is set once, at
    // creation, exactly as `checkStandardContractClick` in `standardContracts.ts` assumes when
    // it treats "already has this assumption" as permanent.
    ...(isNew && line.standardAssumptionId
      ? { "vsb_CapexStandardAssumptionContract@odata.bind": bind("vsb_devexcapexstandardassumptionses", line.standardAssumptionId) }
      : {}),
  };

  /**
   * `'Linked Cluster'` — the panel's "Link to Milestone" dropdown.
   *
   * The canvas writes it on EVERY save, in both the individual and the equal branch, as
   *
   *     'Linked Cluster': If(drp_..._Link_to_Cluster.Selected.Name <> "None",
   *                          drp_..._Link_to_Cluster.Selected,
   *                          Blank())
   *
   * (`CapexScreenCode.txt:17413` and `:17526`). The `Blank()` half is the point: "None" has to
   * CLEAR an existing link, and omitting the column — which is what this function did — leaves
   * the old link in place. `_vsb_linkedcluster_value` is the READ form and Dataverse rejects it
   * in a write payload (`docs/CONVENTIONS.md`), so `@odata.bind: null` is the only
   * disassociation available, exactly as `saveComment` in `./comments.ts` uses it.
   */
  const linkedCluster: Record<string, string | null> = {
    "vsb_LinkedCluster@odata.bind": line.linkedClusterId
      ? bind("vsb_projectstates", line.linkedClusterId)
      : null,
  };

  let contractId = line.id;

  if (!isNew) {
    // UPDATE keeps the null. It is the whole point — see `linkedCluster` above.
    unwrap(
      await Vsb_capexprojectcontractsService.update(
        contractId, { ...fields, ...linkedCluster } as never,
      ),
      "update CAPEX contract",
    );
  } else {
    const created = unwrap(
      await Vsb_capexprojectcontractsService.create({
        ...fields,
        // CREATE drops it when there is nothing to bind: a brand-new row has no link to clear,
        // and a null `@odata.bind` in a POST body is a null where OData expects an entity
        // reference, not a "clear this lookup" instruction. Same split as `saveComment`.
        ...(line.linkedClusterId ? linkedCluster : {}),
        "vsb_Project@odata.bind": bind("vsb_projects", projectId),
        "vsb_Account@odata.bind": bind("vsb_capexaccountlists", accountId),
        ...(owningBusinessUnitId
          ? { "owningbusinessunit@odata.bind": bind("businessunits", owningBusinessUnitId) }
          : {}),
      } as never),
      "create CAPEX contract",
    );
    contractId = created.vsb_capexprojectcontractid;
  }

  // The relink reset, in the canvas' order: before the cost rows are reconciled, so a month
  // that survives the save is already unpaid rather than being patched twice.
  if (args.resetPaidAndPaymentDateComments && !isNew) {
    for (const payment of line.payments) {
      if (payment.paid && payment.id) await setCostPaid(payment.id, false);
    }
    const existing = await loadComments([contractId]);
    for (const comment of existing) {
      if (comment.commentType === COMMENT_TYPE.paymentDate) await deleteComment(comment.id);
    }
  }

  const rows: CostRowInput[] = payments.map((p) => ({
    year: p.year,
    month: p.month,
    cost: p.amount === null || p.amount === undefined ? null : p.amount,
    costId: p.id ?? null,
  }));
  const plan = capexWriteSet(rows);

  for (const upsert of plan.upserts) {
    if (upsert.costId) {
      unwrap(
        await Vsb_capexcostsService.update(upsert.costId, { vsb_cost: upsert.cost }),
        "update CAPEX cost",
      );
    } else {
      unwrap(
        await Vsb_capexcostsService.create({
          vsb_cost: upsert.cost,
          vsb_year: upsert.year,
          vsb_month: upsert.month,
          "vsb_Contract@odata.bind": bind("vsb_capexprojectcontracts", contractId),
          ...(owningBusinessUnitId
            ? { "owningbusinessunit@odata.bind": bind("businessunits", owningBusinessUnitId) }
            : {}),
        } as never),
        "create CAPEX cost",
      );
    }
  }

  // Deletes last: an interrupted save then leaves extra rows rather than missing money.
  for (const costId of plan.deletes) {
    await Vsb_capexcostsService.delete(costId);
  }

  return contractId;
}

/* ═══════════════════════════════════════════════════════════ delete line ══ */

/**
 * Deletes a cost line, its comments and the cost rows beneath it.
 *
 * COMMENTS FIRST, then cost rows, then the contract — children before parents, the same rule as
 * the header states for saves. A `vsb_capexcomments` row points at BOTH the contract
 * (`vsb_CapexContract`) and, for a payment-date comment, the month's cost row
 * (`vsb_CapexCost`), so it is a child of both and has to go before either. Any other order
 * leaves a comment attached to a row that no longer exists.
 *
 * The comment half was simply missing: the canvas runs `RemoveIf('Capex Comments', …)` as part
 * of contract deletion, and without it every deleted contract left its whole thread behind —
 * invisible in the app, and counted by the next `loadComments` for any contract that reused the
 * id. `planDeleteContract` (`capex-costs/rules.ts`) is the rule; this is only the I/O.
 *
 * `loadComments` is asked for one contract, which is the narrow half of the query it already
 * serves the panel with, so this costs one extra request per delete.
 */
export async function deleteCostLine(line: CostLine): Promise<void> {
  const comments = await loadComments([line.id]);
  const plan = planDeleteContract(
    line.id,
    comments.map((c) => ({ id: c.id, contractId: c.contractId ?? "" })),
  );

  for (const commentId of plan.commentIds) await deleteComment(commentId);
  for (const payment of line.payments) {
    if (payment.id) await Vsb_capexcostsService.delete(payment.id);
  }
  await Vsb_capexprojectcontractsService.delete(plan.contractId);
}
