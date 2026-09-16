// AllocateProjectId.cs — handler skeleton for vsb_AllocateProjectId.
// Definition: solution/customapi/vsb_AllocateProjectId.json
//
// WHY THIS HANDLER EXISTS: PerformCommonRequestofGateApproval allocates the internal project
// id with a Do-until loop over vsb_countries.vsb_lastprojectid — read the counter, add one,
// write it back, re-read to see whether it stuck. That is a read-modify-write with no lock,
// which is a LOST-UPDATE RACE. Two projects passing their first gate in the same moment get
// the same vsb_internalprojectid, and that value is the human-facing identifier every
// downstream document, SharePoint site and Teams channel is named after. The defect is
// recorded on the flow's own register entry:
//
//   src/flows/flowClient.ts, FLOW_REGISTER, PerformCommonRequestofGateApproval:
//   "Approval wait. Its Do-until over vsb_countries.vsb_lastprojectid is a lost-update race
//    — extract that allocation into a custom API."
//
// A plugin can take the platform's row lock; a flow cannot. Nothing else about the flow
// moves — it keeps its approval wait and its 112 actions and calls this message where the
// loop used to be.
//
// THIS IS THE ONE HANDLER WHOSE CALLER IS A FLOW, not the app. Hence
// enabledforworkflow = true on the definition.
//
// TRANSACTION AND THE LOCK
//   Synchronous, main operation. The increment must be serialised, and in a plugin that
//   means taking the platform's own row lock on the country before reading the counter:
//   inside the transaction, an Update to the country row establishes the lock, so the
//   read-then-write must be ordered so that the lock is held across BOTH. A Retrieve
//   followed by an Update does NOT hold a lock across the gap; a concurrent execution can
//   interleave between them and this handler will have reproduced the flow's bug in C#.
//   Confirm the pattern against the platform's concurrency documentation before shipping,
//   and prove it with a concurrent test — two simultaneous calls must produce two different
//   numbers, and that assertion is the only evidence that this handler is worth having.
//
// SECURITY — THE ONE EXCEPTION IN THIS ASSEMBLY
//   vsb_country is NOT modelled in src/security/matrix.json, so no VSB role is granted
//   write on it by solution/security/apply-roles.mjs. Running as the calling user therefore
//   means a project manager cannot allocate. Two honest options, and the choice belongs on
//   the step registration where a reviewer will see it:
//     (a) register this step to run as a dedicated application user that holds write on
//         vsb_country and nothing else. Preferred: the elevation is scoped to one table and
//         one message.
//     (b) add vsb_country to matrix.json and grant write to whoever must allocate. Wider
//         than it sounds — write on the counter table is write on every country row.
//   Do NOT pass null to CreateOrganizationService as a shortcut. Running the whole handler
//   as SYSTEM would also elevate the vsb_project update below, and that update is ordinary
//   project data that must stay subject to the matrix.

using System;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace VSB.Cloud.Plugins
{
    public sealed class AllocateProjectId : IPlugin
    {
        private const string CountryEntity = "vsb_country";
        private const string ProjectEntity = "vsb_project";

        public void Execute(IServiceProvider serviceProvider)
        {
            var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
            var tracing = (ITracingService)serviceProvider.GetService(typeof(ITracingService));
            var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
            var service = factory.CreateOrganizationService(context.UserId);

            context.RequireTransaction("vsb_AllocateProjectId");

            /* ── in ──────────────────────────────────────────────────────────────── */

            var countryId = context.Require<Guid>("CountryId");
            var projectId = context.Optional<Guid>("ProjectId");
            var ifBlankOnly = context.Optional<bool>("IfBlankOnly") ?? true;

            tracing.Trace("vsb_AllocateProjectId country={0} project={1} ifBlankOnly={2}",
                countryId, projectId, ifBlankOnly);

            /* ── the idempotent path ─────────────────────────────────────────────── */

            // A resumed flow must not burn a number on every retry. This branch is why the
            // Allocated response property exists.
            if (ifBlankOnly && projectId.HasValue)
            {
                var existing = service.Retrieve(ProjectEntity, projectId.Value,
                    new ColumnSet("vsb_internalprojectid"));
                var already = existing.GetAttributeValue<string>("vsb_internalprojectid");
                if (!string.IsNullOrWhiteSpace(already))
                {
                    context.OutputParameters["InternalProjectId"] = already;
                    context.OutputParameters["LastProjectId"] = 0;
                    context.OutputParameters["Allocated"] = false;
                    return;
                }
            }

            /* ── the allocation ──────────────────────────────────────────────────── */

            // The country columns the app reads are vsb_countryid, vsb_name, vsb_code,
            // vsb_isocurrencycode, vsb_optionvalue (src/features/pm/generators/hooks.ts).
            // vsb_lastprojectid is named in the flow register entry above; it is NOT read
            // anywhere in the app, so its exact type and starting value must be confirmed
            // against the environment's metadata before this runs.
            var country = service.Retrieve(CountryEntity, countryId, new ColumnSet(
                "vsb_code", "vsb_name", "vsb_lastprojectid"));

            // PORT FROM: NOTHING IN THIS REPOSITORY.
            //
            // The composition rule — prefix, separator, zero-padding, whether the counter is
            // per country or per country-and-technology — lives in an expression inside the
            // flow definition PerformCommonRequestofGateApproval and nowhere else. The app
            // only ever READS the finished value: `projectNumber: r.vsb_internalprojectid`,
            // rendered as a Badge in every project header, e.g. "DE-1021".
            //
            // Do not infer the format from that example. A plugin that guesses the padding
            // renumbers the estate the first time a country crosses a power of ten, and the
            // old identifiers are already printed on documents outside this system.
            throw new NotImplementedException(
                "Transcribe the internal-project-id composition rule from the expression in " +
                "PerformCommonRequestofGateApproval (solution export) before registering " +
                "this plugin, and confirm the type and semantics of " +
                "vsb_country.vsb_lastprojectid against the environment metadata. Then: " +
                "take the row lock, increment, write the project, and set InternalProjectId, " +
                "LastProjectId and Allocated = true.");
        }
    }
}
