// CancelCheckListApproval.cs — handler skeleton for vsb_CancelCheckListApproval.
// Definition: solution/customapi/vsb_CancelCheckListApproval.json
//
// WHY THIS HANDLER EXISTS: the flow it replaces makes three synchronous writes with no
// waits, and three writes from the app cannot be atomic — dataClient.batch() bounds
// concurrency over individual writes, it is not a transactional $batch changeset. So a
// mid-sequence failure leaves the approval cancelled and the checklist row un-reset:
// vsb_approvalcheckliststate still shows an approval running and vsb_flowrunid still points
// at a dead run. The flow already admitted the risk in its own contract — it answers
// {success:false} when its scope fails — and the canvas read `.success` and DID NOTHING
// WITH A FALSE, which is how the inconsistent state stayed invisible. Inside one
// transaction there is no partial outcome to report.
//
// A NOTE FOR WHOEVER WIRES THIS UP
//   checklistCancelSucceeded() in src/features/pm/checklist/rules.ts treats anything that
//   is not an explicit `success:false` / `ok:false` as SUCCESS — UT-CHKLST-034 pins `{}` and
//   `null` as true. A custom API returns its properties under their declared unique names,
//   so this message answers `Success`, capital S, which that function does not read. As it
//   stands a `Success:false` would be READ AS A PASS. Widen the function in the same change
//   that registers this plugin.
//
// TRANSACTION: synchronous, main operation, one transaction. Enforced below.
// SECURITY: calling user's context; the same column-security question as CancelGateApproval
//   applies to vsb_approvalcheckliststate / vsb_approvalstepstatecode / vsb_flowrunid —
//   read that file's SECURITY note, it is the same decision.

using System;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace VSB.Cloud.Plugins
{
    public sealed class CancelCheckListApproval : IPlugin
    {
        // CHECKLIST_COL / NOTE_COL, src/features/pm/checklist/rules.ts.
        private const string ChecklistEntity = "vsb_projectchecklist";
        private const string NoteEntity      = "vsb_projectchecklisttrackingnote";
        private const string ProjectEntity   = "vsb_project";

        private const int NoteTypeChecklistItem = 952850001;   // CHOICE_PROCESS.noteType.checklistItem
        private const int CommentMaxLength = 2000;             // gblAppConstants.DefaultLongMaxLength

        // CHECKLIST_CANCEL_FAILED, src/features/pm/checklist/rules.ts — verbatim, G-LABEL.
        // Only ever returned when the transaction really did roll back: the sentence makes a
        // factual claim about the data ("Nothing was changed") and must not be a guess.
        private const string CancelFailed =
            "The approval could not be cancelled. Nothing was changed.";

        public void Execute(IServiceProvider serviceProvider)
        {
            var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
            var tracing = (ITracingService)serviceProvider.GetService(typeof(ITracingService));
            var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
            var service = factory.CreateOrganizationService(context.UserId);

            context.RequireTransaction("vsb_CancelCheckListApproval");

            /* ── in ──────────────────────────────────────────────────────────────── */

            var checklistId = context.Require<Guid>("ChecklistId");
            var comment = context.OptionalString("Comment");   // optional, unlike the gate

            tracing.Trace("vsb_CancelCheckListApproval checklist={0} note={1}",
                checklistId, string.IsNullOrWhiteSpace(comment) ? "no" : "yes");

            var checklist = service.Retrieve(ChecklistEntity, checklistId, new ColumnSet(
                "vsb_name",
                "vsb_project",
                "vsb_clusterstate",
                "vsb_approvalcheckliststate",
                "vsb_approvalstepstatecode",
                "vsb_taskstate",
                "vsb_flowrunid",
                "vsb_flowapprovalid",
                "owningbusinessunit"));

            var projectRef = checklist.GetAttributeValue<EntityReference>("vsb_project");
            var project = projectRef == null
                ? null
                : service.Retrieve(ProjectEntity, projectRef.Id,
                    new ColumnSet("vsb_projectname", "owningbusinessunit"));

            /* ── write 1 of 3 — reset the checklist row ──────────────────────────── */

            // PORT FROM: the flow PerformRequestofCheckListApprovalCancellation (9 actions),
            //            and CHECKLIST_COL in src/features/pm/checklist/rules.ts for the
            //            column names. The app makes NO local writes on this path —
            //            useCancelChecklistApproval calls the API and invalidates — so the
            //            reset values must be transcribed from the flow, not from rules.ts.
            //
            // What resetToState() and the row-action rules imply, and what the flow must be
            // read to confirm:
            //   vsb_approvalcheckliststate -> the pre-request state
            //   vsb_approvalstepstatecode  -> cleared
            //   vsb_flowrunid              -> null
            // Do NOT invent the target of the first one. showCancelApprovalIcon() /
            // rowActionLabel() in rules.ts (UT-CHKLST-020, UT-CHKLST-021) describe how the
            // row renders each state and are the cross-check on whatever the flow says.
            throw new NotImplementedException(
                "Transcribe the three writes from the flow definition " +
                "PerformRequestofCheckListApprovalCancellation in the solution export. The " +
                "app has never made them, so this repository does not specify them and a " +
                "guessed approval state is a wrong gate on a live project.");

            /* ── write 2 of 3 — the approval ─────────────────────────────────────
             *   Cancel the msdyn_flow_approval for checklist["vsb_flowrunid"] /
             *   ["vsb_flowapprovalid"]. Same source, same warning as CancelGateApproval.
             *
             * ── write 3 of 3 — the audit note, only when a Comment was supplied ──
             * PORT FROM: checklistNoteWrite() in src/features/pm/checklist/rules.ts.
             *
             *   var note = new Entity(NoteEntity)
             *   {
             *       ["vsb_name"]     = Truncate(name, CommentMaxLength),
             *       ["vsb_comment"]  = Truncate(comment.Trim(), CommentMaxLength),
             *       ["vsb_notetype"] = new OptionSetValue(NoteTypeChecklistItem),
             *       ["vsb_ProjectChecklist"] = new EntityReference(ChecklistEntity, checklistId),
             *       ["owningbusinessunit"] = project?.GetAttributeValue<EntityReference>("owningbusinessunit"),
             *   };
             *
             * owningbusinessunit is required for the same reason as everywhere else:
             * requiresOwningBusinessUnit in matrix.json. Omitting it puts the note in the
             * creator's BU and hides it from the BU-scoped roles.
             *
             * Then: OutputParameters["Success"] = true; ["Message"] = ""; ["NoteId"] = noteId
             * (or Guid.Empty when no comment was supplied). On a caught, recoverable failure
             * that genuinely rolled back: Success = false, Message = CancelFailed.
             * ─────────────────────────────────────────────────────────────────────── */
        }
    }
}
