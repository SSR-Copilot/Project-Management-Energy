# 31 - Bulk Operation Validation

> Stage 3 (implementation), 25 Nov 2026. Branch `feature/dataverse-network-performance-optimization`, uncommitted. Source of every section below: the per-agent notes written by the agent that did the work, unedited except for heading levels. Nothing here is a runtime measurement. 

**No bulk path was enabled or newly built in this batch.** The Generators bulk switches (OPT-21, PA-01) stay off, Land Lease / OPEX bulk (T-40), Revenues/Production/General Data writes (T-42) and the admin clean-up bulk (T-43) were not started: each needs probe P-3 (does `UpdateMultiple` accept `statecode`, and what does it return for a missing id), the Generators DEV test plan, or an owner decision (doc 22, doc 23 section 4).

What changed that touches the bulk path: the retry layer (T-11) wraps the bulk transport so a 429 is retried and a 5xx is not (a bulk call may have partly landed); the Finance bulk backend is now registered (PA-02), so turning `bulkSchedules` on later cannot fail half-way; verify reads are routed through the policy and are ready for the global gate (CA-17). Their tests are listed in doc 27 under agents core, t11 and pma.
