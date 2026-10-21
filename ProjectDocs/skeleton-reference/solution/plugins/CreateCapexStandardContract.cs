// CreateCapexStandardContract.cs — handler skeleton for the custom API
// vsb_CreateCapexStandardContract. Definition: solution/customapi/vsb_CreateCapexStandardContract.json
//
// THIS IS A SKELETON AND SAYS SO. It unpacks the message, resolves the rows it needs, and
// then stops at the point where the business arithmetic belongs, with a pointer to the
// TypeScript function that already specifies it and the test IDs that pin it. Nothing in
// here invents a formula. A plausible-looking wrong number written by a plugin is worse
// than a NotImplementedException, because the exception gets fixed and the number gets
// believed.
//
// TRANSACTION
//   Register this step SYNCHRONOUS, on the MAIN OPERATION stage of the custom API message.
//   A synchronous main-operation plugin runs inside the platform transaction, so every
//   Create and Update made through `service` here commits or rolls back together. That is
//   the entire reason this message exists: `dataClient.batch()` in the code app bounds
//   concurrency over individual writes and is NOT a transactional $batch changeset, so the
//   app cannot create a contract and its N cost rows atomically. Do NOT register this
//   asynchronously and do NOT split it into two steps — either would reintroduce the
//   half-applied contract this message was created to prevent.
//   Assert it at runtime: IExecutionContext.IsInTransaction must be true.
//
// SECURITY
//   `factory.CreateOrganizationService(context.UserId)` — the CALLING USER, deliberately.
//   Passing null would run as SYSTEM and this message would become a hole straight through
//   the role matrix that `solution/security/apply-roles.mjs` applies. A user without
//   prvCreatevsb_capexprojectcontract must be refused by Dataverse here exactly as they
//   are on a direct Web API write. See scripts/gsec.mjs.

using System;
using System.Collections.Generic;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace VSB.Cloud.Plugins
{
    public sealed class CreateCapexStandardContract : IPlugin
    {
        // Logical names. Transcribed from src/features/cost/capex-costs/hooks.ts
        // (CONTRACT_COL, COST_COL, ASSUMPTION_COL) and src/data/entities.ts (ES_COST).
        private const string ContractEntity   = "vsb_capexprojectcontract";
        private const string CostEntity       = "vsb_capexcost";
        private const string AssumptionEntity = "vsb_devexcapexstandardassumptions";
        private const string ProjectEntity    = "vsb_project";
        private const string SubAccountEntity = "vsb_capexaccountlist";

        public void Execute(IServiceProvider serviceProvider)
        {
            var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
            var tracing = (ITracingService)serviceProvider.GetService(typeof(ITracingService));
            var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
            var service = factory.CreateOrganizationService(context.UserId);

            // Registered wrongly? Fail loudly rather than doing half the work.
            context.RequireTransaction("vsb_CreateCapexStandardContract");

            /* ── in ──────────────────────────────────────────────────────────────── */

            var projectId    = context.Require<Guid>("ProjectId");
            var subAccountId = context.Require<Guid>("SubAccountId");
            var assumptionId = context.Require<Guid>("StandardAssumptionId");

            // Optional. These are the client's own computed figures, sent so this handler
            // can ASSERT agreement and fault on a mismatch. The client's arithmetic is
            // already pinned by UT-CAPEX-031/032/033/034; a disagreement means the two
            // implementations have diverged and must not be papered over server-wins.
            decimal? clientTotalCapacity  = context.Optional<decimal>("TotalCapacity");
            int?     clientWtgCount       = context.Optional<int>("ActiveWtgCount");
            int?     clientStartCluster   = context.Optional<int>("StartClusterNo");
            string   clusterDurationsJson = context.OptionalString("ClusterDurationsJson");

            tracing.Trace(
                "vsb_CreateCapexStandardContract project={0} subaccount={1} assumption={2}",
                projectId, subAccountId, assumptionId);

            /* ── rows this handler needs ─────────────────────────────────────────── */

            var project = service.Retrieve(ProjectEntity, projectId, new ColumnSet(
                "vsb_totalcapacity",       // the EUR/MW(p) multiplier
                "vsb_startcluster",        // locProjectStartClusterNo
                "vsb_technology",
                "_vsb_country_value",
                "vsb_acquisitiondate",
                "vsb_projectstartdate",
                "owningbusinessunit"));

            var assumption = service.Retrieve(AssumptionEntity, assumptionId, new ColumnSet(
                "vsb_description",
                "vsb_costamount",
                "vsb_unit",                // CHOICE_COST.costUnit
                "vsb_costpaidby",
                "vsb_distributionfrequency",
                "vsb_applyvat",
                "vsb_depreciation",
                "_vsb_subaccount_value",
                "_vsb_country_value",
                "vsb_technology",
                "vsb_cluster1", "vsb_cluster2", "vsb_cluster3", "vsb_cluster4", "vsb_cluster5"));

            /* ── the refusals ────────────────────────────────────────────────────── */

            // PORT FROM: checkStandardContractClick() in src/features/cost/capex-costs/rules.ts
            //            — the click-time re-check. Pinned by UT-CAPEX-037.
            // The duplicate key is `${subaccountId}|${standardAssumptionId}` per project.
            // Returning a refusal rather than faulting is deliberate: the canvas showed this
            // as an information message, and MSG.duplicateStandard / MSG.noApplicableCluster
            // are frozen strings under G-LABEL. Return them VERBATIM.
            var duplicate = new QueryExpression(ContractEntity)
            {
                ColumnSet = new ColumnSet("vsb_capexprojectcontractid"),
                TopCount = 1,
                Criteria =
                {
                    Conditions =
                    {
                        new ConditionExpression("vsb_project", ConditionOperator.Equal, projectId),
                        new ConditionExpression("vsb_account", ConditionOperator.Equal, subAccountId),
                        new ConditionExpression(
                            "vsb_capexstandardassumptioncontract", ConditionOperator.Equal, assumptionId),
                    },
                },
            };
            if (service.RetrieveMultiple(duplicate).Entities.Count > 0)
            {
                Refuse(context,
                    // MSG.duplicateStandard — verbatim, G-LABEL.
                    "This standard contract is already created for this project and subaccount.",
                    removeOption: true);
                return;
            }

            /* ── the computation, which is NOT written here ──────────────────────── */

            // PORT FROM, in order. Every one of these is a pure function with tests; port
            // the function, do not re-derive the rule from the Power Fx.
            //
            //  1. applicableStartCluster(startClusterNo)
            //       src/features/cost/capex-costs/rules.ts — `n >= 5 ? 5 : n`.
            //       UT-CAPEX-034 (6 and 7 cap to 5; 0 stays 0).
            //
            //  2. the cluster windows. Either ClusterDurationsJson as supplied, or
            //     synthesiseClusterDates(startReferenceDate, MilestoneDurations)
            //       src/features/cost/capex-costs/rules.ts. CLUSTERS 5 AND 6 ARE NEVER
            //       SYNTHESISED — "Cluster 6 / COD should not be calculated from standard
            //       assumptions. Use actual project value only." A contract needing cluster
            //       5 or 6 must have been given ClusterDurationsJson.
            //       Pinned by "clusters 5 and 6 are never synthesised from the milestone
            //       durations" in rules.test.ts.
            //
            //  3. eligibleClusters(assumption, clusterDurations, startClusterNo)
            //       A cluster counts only when it is ticked on the assumption, BOTH dates
            //       exist, end >= start, and it is at or after the capped start cluster.
            //       UT-CAPEX-033, and "a cluster with an inverted or missing date range
            //       never counts".
            //
            //  4. standardContractRefusal(eligible)
            //       Empty -> MSG.noApplicableCluster, verbatim. UT-CAPEX-035.
            //
            //  5. standardAssumptionAmount(unit, costAmount, {totalCapacity, activeWtgCount})
            //       EUR/PLN pass through; per-WTG and per-MW(p) multiply and Round(...,0)
            //       — Power Fx Round, i.e. half away from zero, which is pfxRound() in
            //       src/domain/numeric.ts and is NOT Math.Round's banker's rounding.
            //       UT-CAPEX-031 (6+4 active, inactive 99 excluded, x1500 = 15 000) and
            //       UT-CAPEX-032 (42.5 x 2000 = 85 000).
            //
            //  6. activeWtgCount(generatorTypes)
            //       Sums vsb_numberofgenerators over ACTIVE rows only (statecode = 0).
            //       UT-CAPEX-031.
            //
            //  7. distributionSchedule({startYear, startMonth, endYear, endMonth, frequency})
            //       numPayments = RoundDown(span / freq, 0) + 1, span in whole months and
            //       floored at 0. Frequency <= 0 is treated as 1.
            //
            //  8. equalDistributionAmounts(total, numPayments)
            //       base = RoundDown(total / n, 0); every row is base EXCEPT the last, which
            //       takes the whole remainder. The stored average payment is `base`, not the
            //       mean of the rows. That asymmetry is canvas behaviour and is deliberate —
            //       see the doc comment on the function.
            //
            //  9. planEqualDistribution(total, range)
            //       deleteAllForContract = true. Here that is moot for a NEW contract, but
            //       the same handler is the natural home for a re-spread, and if it ever
            //       does one the delete and the inserts must stay in THIS transaction.
            //
            // ASSERT, do not silently prefer, the client's figures where they were sent:
            //   clientTotalCapacity / clientWtgCount / clientStartCluster.
            // A mismatch is a divergence between two implementations of the same rule and
            // should throw InvalidPluginExecutionException naming both values.

            throw new NotImplementedException(
                "Port steps 1-9 above from src/features/cost/capex-costs/rules.ts before " +
                "registering this plugin. The functions are pure and unit-tested; the tests " +
                "named in each step are the specification. Deliberately unimplemented: a " +
                "guessed distribution writes wrong money into a live project.");

            /* ── the writes, for reference once the computation is in place ──────
             *
             * ONE transaction, in this order:
             *
             *   var contract = new Entity(ContractEntity)
             *   {
             *       ["vsb_name"]        = description,                    // CONTRACT_COL.name
             *       ["vsb_description"] = description,                    // CONTRACT_COL.description
             *       ["vsb_project"]     = new EntityReference(ProjectEntity, projectId),
             *       ["vsb_account"]     = new EntityReference(SubAccountEntity, subAccountId),
             *       ["vsb_capexstandardassumptioncontract"] =
             *                             new EntityReference(AssumptionEntity, assumptionId),
             *       ["vsb_totalcost"]      = totalCost,                   // step 5
             *       ["vsb_averagepayment"] = averagePayment,              // step 8
             *       ["vsb_distribution"]   = equalDistribution,           // CHOICE_COST.distributionType.equal
             *       ["vsb_distributionfrequency"] = assumption["vsb_distributionfrequency"],
             *       ["vsb_costtype"]       = assumption["vsb_costpaidby"],
             *       ["vsb_applyvat"]       = assumption["vsb_applyvat"],
             *       ["vsb_depreciation"]   = assumption["vsb_depreciation"],
             *       ["vsb_byclusterjson"]  = byClusterJson(ticks),        // byClusterJson() in rules.ts
             *       ["vsb_isstandardcontract"] = true,
             *   };
             *   var contractId = service.Create(contract);
             *
             *   foreach (var row in schedule)          // step 7 + step 8
             *   {
             *       service.Create(new Entity(CostEntity)
             *       {
             *           ["vsb_contract"] = new EntityReference(ContractEntity, contractId),
             *           ["vsb_year"]     = row.Year,
             *           ["vsb_month"]    = row.Month,   // see monthIndex() — the column takes
             *                                           // a label, an English name OR a number
             *           ["vsb_cost"]     = row.Cost,
             *           ["vsb_costpaid"] = false,
             *       });
             *   }
             *
             * Then set the out parameters: ContractId, TotalCost, AveragePayment,
             * CostRowsCreated, Refused = false, RefusalMessage = "", RemoveOption = false.
             * ─────────────────────────────────────────────────────────────────────── */
        }

        /* ── out ─────────────────────────────────────────────────────────────────── */

        private static void Refuse(IPluginExecutionContext context, string message, bool removeOption)
        {
            context.OutputParameters["Refused"] = true;
            context.OutputParameters["RefusalMessage"] = message;
            context.OutputParameters["RemoveOption"] = removeOption;
            context.OutputParameters["ContractId"] = Guid.Empty;
            context.OutputParameters["TotalCost"] = 0m;
            context.OutputParameters["AveragePayment"] = 0m;
            context.OutputParameters["CostRowsCreated"] = 0;
        }

    }
}
