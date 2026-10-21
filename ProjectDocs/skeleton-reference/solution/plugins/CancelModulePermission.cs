// CancelModulePermission.cs — handler skeleton for vsb_CancelModulePermission.
// Definition: solution/customapi/vsb_CancelModulePermission.json
//
// WHY THIS HANDLER EXISTS: the same two-writes-not-one-transaction defect, with the worst
// consequence of the three, and it is already recorded in the code as a source defect.
//
//   SOURCE DEFECT (ambiguity 10), src/features/pm/generators/hooks.ts:
//   "the canvas fires Requestpermissioncancellation.Run(...) and then Remove(...) with no
//    error handling between them, so a failed cancellation still deletes the row and
//    orphans the approval."
//
// The code app already diverges deliberately — useDeleteGeneratorType AWAITS the
// cancellation and aborts the delete when it fails — but that narrows the window rather
// than closing it, because the cancellation is itself several writes and can half-apply.
// An orphaned approval means a human approver holding a request against a row that no
// longer exists. This handler makes the awaited result trustworthy.
//
// TRANSACTION: synchronous, main operation, one transaction. Enforced below.
// SECURITY: calling user's context. vsb_requestpermissionstate is NOT in any column-security
//   profile in matrix.json, so ordinary table privileges decide, and the calling user must
//   hold write on the type-in-project table. That is correct: cancelling one's own request
//   is an ordinary project-data write.
//
// IDEMPOTENCE: re-cancelling must be a no-op that answers AlreadyClosed = true.
//   needsPermissionCancellation() is a CLIENT-SIDE pre-check over vsb_flowrunid, and that
//   value can be stale by the time the request lands. UT-GEN-040/041 pins the pre-check;
//   this handler has to survive the case where the pre-check was right when it ran and
//   wrong when it arrived.

using System;
using System.Collections.Generic;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace VSB.Cloud.Plugins
{
    public sealed class CancelModulePermission : IPlugin
    {
        // CHOICE_PLANT.moduleType, src/data/entities.ts, mapped to the table each value
        // selects. The …TypeInProject tables all carry the same three columns
        // (GEN_TYPE_COL in src/features/pm/generators/rules.ts), which is why one handler
        // can serve all four.
        private static readonly Dictionary<int, string> EntityByModuleType =
            new Dictionary<int, string>
            {
                { 952850000, "vsb_generatortypeinproject" },      // moduleType.generator
                { 952850001, "vsb_pvmoduletypeinproject" },       // moduleType.pvModule
                { 952850002, "vsb_invertertypeinproject" },       // moduleType.inverter
                { 952850003, "vsb_substructuretypeinproject" },   // moduleType.substructure
            };

        // CHOICE_PLANT.requestPermissionState, src/data/entities.ts.
        private const int RequestPermissionStateCanceled = 952850003;

        public void Execute(IServiceProvider serviceProvider)
        {
            var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
            var tracing = (ITracingService)serviceProvider.GetService(typeof(ITracingService));
            var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
            var service = factory.CreateOrganizationService(context.UserId);

            context.RequireTransaction("vsb_CancelModulePermission");

            /* ── in ──────────────────────────────────────────────────────────────── */

            var typeInProjectId = context.Require<Guid>("TypeInProjectId");
            var moduleType = context.Require<int>("ModuleType");
            var assertRunId = context.OptionalString("FlowRunId");
            var assertApprovalId = context.OptionalString("FlowApprovalId");

            if (!EntityByModuleType.TryGetValue(moduleType, out var entityName))
            {
                throw new InvalidPluginExecutionException(
                    $"ModuleType {moduleType} is not one of CHOICE_PLANT.moduleType " +
                    "(952850000 generator, 952850001 PV module, 952850002 inverter, " +
                    "952850003 substructure). See src/data/entities.ts.");
            }

            tracing.Trace("vsb_CancelModulePermission {0} {1}", entityName, typeInProjectId);

            var row = service.Retrieve(entityName, typeInProjectId, new ColumnSet(
                "vsb_name",
                "vsb_project",
                "vsb_requestpermissionstate",
                "vsb_flowrunid",
                "vsb_flowapprovalid",
                "owningbusinessunit"));

            var runId = row.GetAttributeValue<string>("vsb_flowrunid");
            var approvalId = row.GetAttributeValue<string>("vsb_flowapprovalid");

            /* ── the idempotent no-op ────────────────────────────────────────────── */

            // PORT FROM: needsPermissionCancellation() in src/features/pm/generators/rules.ts
            //            — `!isBlank(row.flowRunId)`. UT-GEN-040/041.
            if (string.IsNullOrWhiteSpace(runId))
            {
                context.OutputParameters["Success"] = true;
                context.OutputParameters["AlreadyClosed"] = true;
                context.OutputParameters["Message"] = string.Empty;
                return;
            }

            // The optional assertions. Supplied, they must match, or the caller is cancelling
            // a run it has not seen — which after a concurrent approval is exactly when you
            // want a fault rather than a cancellation.
            if (!string.IsNullOrEmpty(assertRunId) && assertRunId != runId)
            {
                throw new InvalidPluginExecutionException(
                    $"FlowRunId mismatch: the caller expected {assertRunId} and the row " +
                    $"carries {runId}. The request has changed since the caller read it; " +
                    "re-read the row and try again.");
            }
            if (!string.IsNullOrEmpty(assertApprovalId) && assertApprovalId != approvalId)
            {
                throw new InvalidPluginExecutionException(
                    $"FlowApprovalId mismatch: expected {assertApprovalId}, row carries {approvalId}.");
            }

            /* ── write 1 of 2 — clear the request state ──────────────────────────── */

            // PORT FROM: pendingPermissionFields() in src/features/pm/generators/rules.ts,
            //            inverted. That function sets Pending + the two flow ids on the
            //            request path (rule 15); this clears them.
            var cleared = new Entity(entityName, typeInProjectId)
            {
                ["vsb_requestpermissionstate"] = new OptionSetValue(RequestPermissionStateCanceled),
                ["vsb_flowrunid"] = null,
                ["vsb_flowapprovalid"] = null,
            };
            service.Update(cleared);

            /* ── write 2 of 2 — the approval itself ──────────────────────────────── */

            // PORT FROM: the flow Requestpermissioncancellation, 17 actions. NOT in this
            //            repository — buildCancellationPayload() in rules.ts builds the
            //            payload the flow consumed (ModuleTypeGuid, ModuleType, Name,
            //            FlowRunId, FlowApprovalId) and that is the whole of what the app
            //            knows. Transcribe the msdyn_flow_approval writes from the flow
            //            definition in the solution export.
            //
            // The flow's third write was its notification. That stays a flow: if a
            // cancellation must notify, trigger it from the row change rather than adding a
            // connector dependency to a plugin.
            throw new NotImplementedException(
                "Port the msdyn_flow_approval cancellation from the flow definition " +
                "Requestpermissioncancellation in the solution export, then set " +
                "OutputParameters Success = true, AlreadyClosed = false, Message = \"\".");
        }
    }
}
