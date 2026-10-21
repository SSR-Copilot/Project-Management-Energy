// CancelGateApproval.cs — handler skeleton for vsb_CancelGateApproval.
// Definition: solution/customapi/vsb_CancelGateApproval.json
//
// WHY THIS HANDLER EXISTS, in one sentence: a cancellation is two writes rather than one
// transaction, so a mid-sequence failure can leave an approval CANCELLED with the entity
// UN-RESET. See useCancelGateApproval in src/features/pm/checklist/hooks.ts — it awaits
// cancelGateApproval() and only THEN calls runPlan(planGateCancel(args)). Between those two
// awaits the tracking row still reads its pre-cancel approval state and still carries a
// vsb_flowrunid pointing at a run that no longer exists, and the checklist screen offers
// "Cancel Approval" again against nothing. The app cannot fix that: dataClient.batch()
// bounds concurrency over individual writes and is not a transactional $batch changeset.
// This handler is the fix, and it is only a fix if all three writes stay inside it.
//
// TRANSACTION
//   Synchronous, main operation, one transaction. Enforced at runtime by RequireTransaction.
//   Do not move the note write to an async step "for speed": the note is the audit record
//   of a cancellation, and an audit record that can be missing while the cancellation stands
//   is worse than no audit record, because it looks complete.
//
// SECURITY
//   Calling user's context. A user who cannot write the tracking row must be refused here.
//   Note that vsb_approvalclusterstate, vsb_clusterstepstate and vsb_flowrunid are all
//   COLUMN-SECURED by "VSB - Approval State Writers" (see solution/security/
//   apply-columnsecurity.mjs and matrix.json columnSecurityProfiles), whose membership is
//   the flow identity and nobody else. So this handler CANNOT run as the calling user and
//   also write those columns — that is not an oversight, it is the design. Two options,
//   and the choice must be recorded on the step registration, not decided here:
//     (a) register the step to run as the flow's application user, keeping the column
//         security intact and making this API a second sanctioned writer; or
//     (b) add this plugin's own application user to the profile, which makes the profile
//         list two principals instead of one and must be justified in writing.
//   Option (a) is the intent. Either way the column security is what makes the choice
//   consequential, which is the point of having it.

using System;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace VSB.Cloud.Plugins
{
    public sealed class CancelGateApproval : IPlugin
    {
        // TRACKING_COL / NOTE_COL / LOOKUP, src/features/pm/checklist/rules.ts.
        private const string TrackingEntity = "vsb_projectstatetracking";
        private const string NoteEntity     = "vsb_projectstatetrackingnote";
        private const string ProjectEntity  = "vsb_project";

        // CHOICE_PROCESS, src/data/entities.ts. Written out rather than looked up because
        // these are option-set values, not ids, and they are already frozen in the app.
        private const int ApprovalClusterStateInProgress = 952850001;   // ACS.inProgress
        private const int NoteTypeNone                   = 952850000;   // noteType.none
        // gblAppConstants.DefaultLongMaxLength — COMMENT_MAX_LENGTH in rules.ts.
        private const int CommentMaxLength = 2000;

        public void Execute(IServiceProvider serviceProvider)
        {
            var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
            var tracing = (ITracingService)serviceProvider.GetService(typeof(ITracingService));
            var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
            var service = factory.CreateOrganizationService(context.UserId);

            context.RequireTransaction("vsb_CancelGateApproval");

            /* ── in ──────────────────────────────────────────────────────────────── */

            var stateTrackingId = context.Require<Guid>("StateTrackingId");
            var comment = context.Require<string>("Comment");

            // PORT FROM: canCancelApproval() / commentMissing() in
            //            src/features/pm/checklist/rules.ts. UT-CHKLST-024 — a blank comment
            //            disables all four panel buttons. The client gate is a courtesy;
            //            this is the control.
            if (string.IsNullOrWhiteSpace(comment))
            {
                throw new InvalidPluginExecutionException(
                    "A cancellation comment is required. (commentMissing() in " +
                    "features/pm/checklist/rules.ts, UT-CHKLST-024.)");
            }

            tracing.Trace("vsb_CancelGateApproval tracking={0}", stateTrackingId);

            /* ── the row and its context ─────────────────────────────────────────── */

            var tracking = service.Retrieve(TrackingEntity, stateTrackingId, new ColumnSet(
                "vsb_name",
                "vsb_project",
                "vsb_clusterstate",
                "vsb_approvalclusterstate",
                "vsb_clusterstepstate",
                "vsb_flowrunid",
                "vsb_flowapprovalid",
                "owningbusinessunit"));

            var projectRef = tracking.GetAttributeValue<EntityReference>("vsb_project");
            var project = projectRef == null
                ? null
                : service.Retrieve(ProjectEntity, projectRef.Id,
                    new ColumnSet("vsb_projectname", "owningbusinessunit"));

            /* ── write 1 of 3 — reopen the cluster ───────────────────────────────── */

            // PORT FROM: planGateCancel() in src/features/pm/checklist/rules.ts, plan.writes[0].
            //            Pinned by "the gate cancel's local writes reopen the cluster and
            //            record a note" in rules.test.ts.
            //   vsb_approvalclusterstate -> In Progress
            //   vsb_clusterstepstate     -> null
            //   vsb_flowrunid            -> null
            // vsb_flowapprovalid is DELIBERATELY LEFT ALONE so the cancelled approval stays
            // traceable from the row. If that should change, change rules.ts first and let
            // this follow it — the app's test is the specification.
            var reopened = new Entity(TrackingEntity, stateTrackingId)
            {
                ["vsb_approvalclusterstate"] = new OptionSetValue(ApprovalClusterStateInProgress),
                ["vsb_clusterstepstate"] = null,
                ["vsb_flowrunid"] = null,
            };
            service.Update(reopened);

            /* ── write 2 of 3 — the approval itself ──────────────────────────────── */

            // PORT FROM: the flow PerformRequestofGateApprovalCancellation, 12 actions.
            //            NOT from this repository — the app never touched msdyn_flow_approvals
            //            and that is precisely why the cancellation could not be app code
            //            (src/flows/flowClient.ts, disposition "customApi").
            //
            // Transcribe from the flow definition in the solution export. The shape is:
            //   find the msdyn_flow_approval / msdyn_flow_approvalrequest rows for the run
            //   identified by tracking["vsb_flowrunid"] / ["vsb_flowapprovalid"], and cancel
            //   the outstanding request(s).
            //
            // The 13-field JSON blob and the AppId the flow declared are NOT carried
            // forward: AMBIGUITY 3 — no action in the flow's definition references AppId,
            // and the blob existed only because a PowerAppV2 trigger cannot take a typed
            // record. See gateCancelArgs() in rules.ts and UT-CHKLST-033.
            throw new NotImplementedException(
                "Port the msdyn_flow_approval cancellation from the flow definition " +
                "PerformRequestofGateApprovalCancellation in the solution export. It is " +
                "deliberately not guessed here: writing to the approval tables on a hunch " +
                "either does nothing or cancels the wrong request.");

            /* ── write 3 of 3 — the audit note ───────────────────────────────────
             *
             * PORT FROM: trackingNoteWrite() in src/features/pm/checklist/rules.ts, via
             *            planGateCancel(). The two strings are frozen under G-LABEL and are
             *            asserted character for character in rules.test.ts:
             *
             *   var note = new Entity(NoteEntity)
             *   {
             *       ["vsb_name"]    = Truncate($"Request canceled - {projectName}", CommentMaxLength),
             *       ["vsb_comment"] = Truncate($"Request canceled - {comment.Trim()}", CommentMaxLength),
             *       ["vsb_note"]    = null,
             *       ["vsb_notetype"] = new OptionSetValue(NoteTypeNone),
             *       ["vsb_ProjectStateTracking"] = new EntityReference(TrackingEntity, stateTrackingId),
             *       ["owningbusinessunit"] = project?.GetAttributeValue<EntityReference>("owningbusinessunit"),
             *   };
             *   var noteId = service.Create(note);
             *
             * owningbusinessunit matters: vsb_projectstatetrackingnote is user-owned and is
             * marked requiresOwningBusinessUnit in matrix.json. A create that omits it lands
             * in the creator's business unit and becomes invisible to the BU-scoped roles —
             * the silent failure that flag exists to name.
             *
             * Then: OutputParameters["Success"] = true; ["Message"] = ""; ["NoteId"] = noteId;
             * ─────────────────────────────────────────────────────────────────────── */
        }
    }
}
