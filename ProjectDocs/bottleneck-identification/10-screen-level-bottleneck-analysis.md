# 10 — Screen-level bottleneck analysis (index)

> Stage 1, 26 Nov 2026. The per-screen walks through the 16 required stages (initial load, component and state initialisation, data retrieval, Dataverse requests, business logic, transformation, calculations, rendering, interaction, save, bulk, refresh, navigation, error handling, cleanup) are in four documents, one per screen group, each with a timeline to "usable" and to "save complete", prior-programme status and a negative-findings list.

| Document | Screens | Agent prefix |
|---|---|---|
| [10a-screens-cost.md](10a-screens-cost.md) | CAPEX/DEVEX, Add Cost from Table, OPEX, Land Lease, Contracts, shared costing and periods | SCC |
| [10b-screens-pm-core.md](10b-screens-pm-core.md) | Project Overview, General Data, **Cluster Check List** (with its Power Automate dependencies, section 5.6), Team, Planning, Milestones, Grid Operator | SPA |
| [10c-screens-pm-production-revenue-finance-generators.md](10c-screens-pm-production-revenue-finance-generators.md) | **Production, Revenues, Finance (Financing)**, Generators; assessment of Add Cost and Generators as bulk reference patterns (section 6) | SPB |
| [10d-screens-admin.md](10d-screens-admin.md) | The six Application Settings screens and Report a problem | SAD |

## Findings per screen (unique findings that name the screen; a finding naming several screens counts for each)

| Screen | All | P1 | P2 |
|---|---|---|---|
| Production | 9 | 1 | 2 |
| Revenues | 10 | 0 | 6 |
| Finance / Financing | 12 | 0 | 4 |
| Cluster Check List | 17 | 4 | 6 |
| CAPEX / DEVEX | 24 | 3 | 8 |
| Add Cost from Table | 18 | 1 | 7 |
| OPEX | 7 | 1 | 2 |
| Land Lease | 10 | 1 | 7 |
| Contracts | 12 | 1 | 5 |
| Generators | 10 | 1 | 3 |
| Project Overview | 7 | 0 | 3 |
| General Data | 9 | 1 | 6 |
| Milestones | 6 | 0 | 3 |
| Planning | 2 | 0 | 1 |
| Grid Operator | 3 | 0 | 2 |
| Team | 1 | 0 | 0 |
| Admin (Application Settings) | 19 | 2 | 5 |
| Cross-cutting / every screen | 33 | 0 | 11 |

The screen names in the register are free text written by nine agents, so these counts come from keyword matching and can be off by one or two; use them to see the shape, not as exact totals.

## Slowest paths by screen (from the screen documents)

| Screen | Slowest path found | Finding | Basis |
|---|---|---|---|
| Production | First yield save of a new project: 22 awaited rounds at 30 turbines, 109 at 200 (831 requests) | SPB-01 (P1) | Request counts MEASURED by a repo test; seconds derived |
| Revenues | Save with Individual hedge volumes deletes and re-creates every volume (73 requests, 7 write rounds at 36 volumes) | SPB-07 (P2) | DERIVED |
| Finance | Tranche Save rewrites every repayment-year and step-up row: 34 requests in 6 rounds | SPB-08 (P2) | Modelled run |
| Cluster Check List | Move to next cluster: 11 rounds / 37 requests behind a blocking overlay; Request Approval blocks on the flow run | SPA-02, SPA-03 (P1) | Rounds MEASURED (repo harness), seconds ESTIMATED; flow time unmeasured anywhere |
| CAPEX | Panel delete: 15 to 50 rounds per contract; deep-link entry waits behind the project gate | SCC-02, SCC-01 (P1) | DERIVED |
| Add Cost from Table | Save that creates contracts: two serial hops, 1,916 ms | SCC-12 (P2) | MEASURED live on DEV (repo document) |
| Generators | Add type with 20 turbines: 3.0-3.7 s, 44-45 requests (bulk OFF) | NET-13 (P1) | MEASURED live on DEV (D144 record) |
| Admin | CAPEX Accounts deactivation clean-up: 2 requests per zeroed row, 1 per deleted row | NET-14 (P1) | DERIVED |
