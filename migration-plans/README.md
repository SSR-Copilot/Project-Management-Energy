# VSBCloud Canvas â†’ Code App migration plans

This is the index into a complete, self-contained migration plan set for rebuilding the
VSBCloud **Project Management** and **Project Costs** Canvas apps as one Power Apps **Code
App** in React + TypeScript. Every file under this directory is planning and documentation
only â€” nothing here implements the migration. Each screen plan under `screens/` is written so
that a brand-new Claude Code conversation, with no memory of how this plan set was produced,
can implement that one screen correctly from its plan file alone (plus the global plans it
cites).

## Workspace map

| What | Where |
|---|---|
| Canvas app source (extracted `.msapp`) | `ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/` (18 production screens) and `ProjectCosts-CodeApp/_extracted/msapp/projectcosts/` (5 production screens) |
| Power Platform solution export (Dataverse, flows, connections, env vars) | `ProjectCosts-CodeApp/_extracted/VSBCloud/` |
| Power Automate flow definitions | `ProjectCosts-CodeApp/_extracted/VSBCloud/Workflows/*.json` (17 flows) |
| Dataverse metadata references | `ProjectCosts-CodeApp/reference/dataverse-entities.json`, `dataverse-attributes.json` |
| PCF repositories | `Existing Solution/PCF Git Repo Clones/DevexCapexSummaryPCF/` and `Existing Solution/PCF Git Repo Clones/vsbcloud-pcf-spreadsheet/` |
| PCF harness/usage evidence | Canvas formula snippets inside each PCF repo's own `Powerapps code/` folder (no separate harness app was found) |
| UI screenshot evidence | `Existing Solution/UI Screenshots/` and `VSBCloud-Code-App-Skeleton/vsbcode/docs/guide*-ui-notes-*.md` |
| **Target Code App (architecture of record)** | `VSBCloud-Code-App-Skeleton/vsbcode/` â€” a mock-backed, 23-screen React/TypeScript implementation already built against this plan's predecessor documents. See `01-global-architecture.md`. |
| Secondary Code App evidence (Cost screens only, different conventions) | `ProjectCosts-CodeApp/app/` â€” UI/data-shape reference for the 5 Cost screens only; not the architecture of record. |
| Prior concordance (Power Fx quoted beside its TypeScript replacement, per screen) | `VSBCloud-Code-App-Skeleton/VSBCloud-Harness-Plan.md` |

Full classification and evidence trail: `00-workspace-inventory.md`.

## Migration objective

Replace both Canvas apps with one Power Apps Code App, against the same unchanged Dataverse
environment (same tables, same 17 flows, same 5 security roles), preserving business logic,
Power Fx behavior, validation, data access, navigation, UI behavior, PCF behavior, flow
interactions, state transitions, permissions, and user workflows â€” screen by screen, with
every meaningful business rule assigned a stable, traceable ID. See `01-global-architecture.md`
for the binding target architecture and `05-rule-registry.md` for the full rule trace.

Four Canvas screens are explicitly out of scope (developer diagnostic surfaces and a
one-off migration-repair utility) â€” see `00-workspace-inventory.md` Â§"Scope decision" for the
evidence. They are not planned here and must not be added to the Code App as a side effect of
implementing an adjacent screen plan.

## How to use one of these plan files

1. Open a new Claude Code conversation.
2. Give it exactly one file from `screens/`.
3. Point it at this workspace as the working directory (it needs read access to the Canvas
   source, the target Code App repo, and the other `migration-plans/*.md` files the screen
   plan cites â€” every citation is a real repository-relative path).
4. The screen plan's final section, "CLAUDE IMPLEMENTATION PACKAGE," is deliberately
   self-contained: everything needed to implement that screen is repeated there rather than
   referenced only. The rest of the file is supporting detail and traceability.
5. Do not hand a conversation two screen plans at once unless the plans' own "Depends On"
   column says the earlier one is already built â€” most screens read master data or state
   another screen owns.

## The 23 production screens, in recommended implementation order

This order is the existing, already-computed build-dependency order from
`VSBCloud-Code-App-Skeleton/vsbcode/src/app/buildPlan.ts` (`BUILD_PLAN[].order`), reused here
rather than re-derived, because it already encodes the real write-target dependency graph
across all 23 screens (see `00-workspace-inventory.md` Â§"Navigation model" and Â§2 of
`01-global-architecture.md`). It is **not** alphabetical and **not** the screens' own
left-to-right rail order.

| # | Screen | Plan file | Phase | Band | Depends on | Can implement independently? | Risk |
|---:|---|---|---|:-:|---|:-:|:-:|
| 1 | Admin Project Default Checklists Screen | [001-admin-default-checklists.md](screens/001-admin-default-checklists.md) | 1 Admin | S | Admin Project Gates Approvals (mutual â€” build as one unit) | No â€” cyclic pair with #4 | Medium |
| 2 | Admin CAPEX Accounts | [002-admin-capex-accounts.md](screens/002-admin-capex-accounts.md) | 1 Admin | S | none | Yes | Medium |
| 3 | Admin Milestones Screen | [003-admin-milestones.md](screens/003-admin-milestones.md) | 1 Admin | S | none | Yes | Medium (missing Fabric recalculation flow) |
| 4 | Admin Project Gates Approvals Screen | [004-admin-gates-approvals.md](screens/004-admin-gates-approvals.md) | 1 Admin | S | Admin Project Default Checklists (mutual) | No â€” cyclic pair with #1 | High (security exit gate) |
| 5 | Admin Contract Screen | [005-admin-contract.md](screens/005-admin-contract.md) | 1 Admin | M | Admin CAPEX Accounts | Yes, after #2 | Medium (missing sync flow) |
| 6 | Admin Cost Screen | [006-admin-cost.md](screens/006-admin-cost.md) | 1 Admin | M | Admin CAPEX Accounts | Yes, after #2 | High (largest Phase-1 screen; security exit gate) |
| 7 | App Loading Screen | [007-app-loading.md](screens/007-app-loading.md) | 2 PM | XS | none | Yes | Medium (bootstrap correctness gates everything downstream) |
| 8 | Project Main Screen | [008-project-main.md](screens/008-project-main.md) | 2 PM | S | App Loading | Yes, after #7 | Medium (create-path routing) |
| 9 | Project General Data Screen | [009-general-data.md](screens/009-general-data.md) | 2 PM | M | Project Main, Admin Project Gates Approvals | After #8, #4 | Medium (ownership writes) |
| 10 | Project General Milestones Screen | [010-project-milestones.md](screens/010-project-milestones.md) | 2 PM | M | General Data, Admin Milestones | After #9, #3 | Medium (date-chain correctness) |
| 11 | Project Generators Screen | [011-project-generators.md](screens/011-project-generators.md) | 2 PM | XL | Milestones | After #10 | High (largest UI rebuild; 5 stub panels) |
| 12 | Project Production Screen | [012-project-production.md](screens/012-project-production.md) | 2 PM | M | Generators | After #11 | Medium |
| 13 | Project General CheckList Screen | [013-project-checklist.md](screens/013-project-checklist.md) | 2 PM | M | Production, Admin Default Checklists, Admin Gates Approvals | After #12, #1, #4 | High (flow cancellation half-apply risk) |
| 14 | Project General Team Screen | [014-project-team.md](screens/014-project-team.md) | 2 PM | S | General Data | After #9 | Low |
| 15 | Project Planning Screen | [015-project-planning.md](screens/015-project-planning.md) | 2 PM | M | General Data | After #9 | Medium |
| 16 | Grid Operator Screen | [016-grid-operator.md](screens/016-grid-operator.md) | 2 PM | XS | General Data | After #9 | Low (reference guarded-mutation implementation) |
| 17 | Project Revenues Screen | [017-project-revenues.md](screens/017-project-revenues.md) | 2 PM | L | Production, Admin Cost | After #12, #6 | Medium (documented price-fallback defect) |
| 18 | Project Finance Screen | [018-project-finance.md](screens/018-project-finance.md) | 2 PM | L | Revenues | After #17 | High (documented Debt Financing overwrite defect) |
| 19 | Capex Costs Screen | [019-capex-costs.md](screens/019-capex-costs.md) | 3 Cost | XL | Admin CAPEX Accounts, Admin Cost, Admin Milestones | After #2, #6, #3 | High (densest logic; PCF; standard-contract write not yet implemented) |
| 20 | Contracts Screen | [020-contracts.md](screens/020-contracts.md) | 3 Cost | M | Capex Costs, Admin Contract | After #19, #5 | Medium |
| 21 | Opex Costs Screen | [021-opex-costs.md](screens/021-opex-costs.md) | 3 Cost | M | Capex Costs, Admin Cost | After #19, #6 | Medium (no screen recording â€” layout inferred) |
| 22 | Land Lease Costs Screen | [022-land-lease.md](screens/022-land-lease.md) | 3 Cost | S | Capex Costs, Admin Cost | After #19, #6 | Medium (no screen recording â€” layout inferred) |
| 23 | Add Costs from Table | [023-add-costs-from-table.md](screens/023-add-costs-from-table.md) | 3 Cost | XS | Capex Costs | After #19 | Medium (PCF; timer-polling mechanism explicitly not ported; no screen recording) |

Screens #1 and #4 reference each other's tables and cannot be strictly ordered â€” treat them as
one unit of work, one branch, built together. Every other dependency is a strict prerequisite.

## Recommended implementation order (rationale)

1. **Global architecture and shared plans first** (`01`â€“`05` in this directory) â€” every screen
   plan cites them; do not let a screen implementation improvise around them.
2. **Phase 1, Admin (#1â€“#6)** â€” these six screens own the master data every other screen reads.
   Building Cost or PM screens first means developing against guessed fixture shapes.
   Admin-first also forces the Dataverse security work (role privileges, not client hiding)
   forward: Phase 1 is not done until an unprivileged user is refused **by Dataverse** on a
   direct write to each master-data table â€” see `01-global-architecture.md` Â§9.
3. **Phase 2, Project Management (#7â€“#18)** â€” follows the left-rail's own data-completeness
   chain (General â†’ Milestones â†’ Generator â†’ Production â†’ Cluster Check List â†’ Team/Planning/
   Grid Operator/Revenues/Finance). Generators (#11) is front-loaded because nothing downstream
   unlocks without it.
4. **Phase 3, Project Costs (#19â€“#23)** â€” Capex Costs (#19) first despite being the largest
   screen in the whole solution: Contracts, Opex Costs, and Land Lease all read grids it
   establishes, and Add Costs from Table is a panel over its data.

This mirrors `VSBCloud-Code-App-Skeleton/vsbcode/src/app/buildPlan.ts` exactly; that file is
the machine-checked version of this table (`buildPlan.test.ts` fails if the plan and the
feature tree disagree) and should be treated as the tie-breaker if this table and that file
ever appear to diverge in a later revision of either.

## Dependency graph (text form)

```
Phase 1 (Admin, cyclic pair noted):
  admin-capex-accounts â”€â”€â–¶ admin-cost
                        â””â”€â–¶ admin-contract
  admin-default-checklists â—€â”€â”€â–¶ admin-gates-approvals   (mutual â€” one unit)
  admin-milestones                                       (independent)

Phase 2 (Project Management, left-rail completeness chain):
  app-loading â”€â–¶ project-main â”€â–¶ general-data â”€â”¬â”€â–¶ milestones â”€â–¶ generators â”€â–¶ production â”€â–¶ checklist
                                                â”œâ”€â–¶ team
                                                â”œâ”€â–¶ planning
                                                â””â”€â–¶ grid-operator
  production â”€â–¶ revenues â”€â–¶ finance
  (checklist also depends on admin-default-checklists and admin-gates-approvals)
  (revenues also depends on admin-cost)

Phase 3 (Project Costs):
  admin-capex-accounts + admin-cost + admin-milestones â”€â–¶ capex-costs â”€â”¬â”€â–¶ contracts (+ admin-contract)
                                                                        â”œâ”€â–¶ opex-costs (+ admin-cost)
                                                                        â”œâ”€â–¶ land-lease (+ admin-cost)
                                                                        â””â”€â–¶ add-costs-from-table
```

## Shared architectural dependencies every screen plan relies on

- `01-global-architecture.md` â€” tech stack, folder conventions, data-access rules, security
  model, label/copy rules, testing strategy. Binding on all screens.
- `02-global-state-and-data.md` â€” every canvas global variable, collection, named formula, and
  data source, with its Code App equivalent. A screen plan must cite this rather than
  re-describing shared state inline.
- `03-pcf-inventory.md` â€” full behavioral contract for the two PCF controls
  (`vsb_Dev.DevexCapexSummaryPCF`, used by Capex Costs; `vsb_Dev.SpreadSheet`, used by Add
  Costs from Table). Only these two screen plans need it as a hard dependency.
- `04-flow-inventory.md` â€” full contract for all 17 Power Automate flows plus the 3 custom-API
  replacements, and which screens call which.
- `05-rule-registry.md` â€” the master index of every Rule ID (`<SCREENCODE>-FX-NNN`) across all
  23 screens, for verifying no business rule is lost during implementation.

## Master README status

Screen-plan generation status, PCF/flow/state documentation status, and the coverage/risk
summary requested by the originating task brief are maintained at the bottom of
`05-rule-registry.md` once all 23 screen plans exist, rather than duplicated here.

## Generated plan status

This directory now contains the complete requested planning set: six global planning documents (`00` through `05`) plus 23 screen-specific migration plans under `screens/`. Four screen plans remain intentionally marked incomplete because their Canvas source references flows missing from the extracted solution export; those blockers are documented in `04-flow-inventory.md` and in the owning screen files.

