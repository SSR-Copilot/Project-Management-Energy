# Project Main Screen migration plan

Plan id: 008-main. Status: **COMPLETE**. This is planning documentation only; it does not implement the migration.

## 1 Purpose

List search create and open projects while enforcing project state and cost-app launch rules. The target is one React/TypeScript Power Apps Code App route, not a re-hosted Canvas screen. The screen must preserve Canvas behavior while replacing Canvas globals, controls, and PCFs with explicit React state, Dataverse services, Fluent UI, and tested rule modules.

## 2 Source Evidence

| Evidence | Path or value |
|---|---|
| Canvas app | Project Management |
| Canvas screen YAML | ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project Main Screen.pa.yaml |
| Existing target feature path | src/features/pm/project-main |
| Recommended route | /projects |
| Global inventory | migration-plans/00-workspace-inventory.md |
| Architecture contract | migration-plans/01-global-architecture.md |
| State/data contract | migration-plans/02-global-state-and-data.md |
| PCF contract | migration-plans/03-pcf-inventory.md |
| Flow contract | migration-plans/04-flow-inventory.md |
| Rule registry | migration-plans/05-rule-registry.md |

## 3 Screen Classification

| Field | Value |
|---|---|
| Phase | 2 PM |
| Risk | Medium |
| Controls | 101 |
| Formula properties | 1175 |
| Logic blocks reviewed | 54 |
| Substantive logic blocks | 27 |
| Dependencies | App Loading |
| Completion status | COMPLETE |

## 4 Target Route and Navigation

Use route /projects. Preserve projectId in the URL for project/cost screens and keep admin screens independent of project context unless the Canvas source explicitly filters by project. Navigation events from Canvas Navigate, Back, Launch, and Param formulas are represented by React Router actions. Cross-app launch behavior becomes internal navigation inside the unified Code App while accepting legacy launch parameters.

## 5 User Workflow

Primary workflow: load screen context, show existing rows/details, let authorized users edit drafts, validate locally, commit to Dataverse, refresh dependent queries, and surface flow/recalculation state where applicable. The implementation must preserve disabled-command behavior, confirmation prompts, loading masks, and error panels from Canvas.

## 6 UI Structure

Build with Fluent UI v9 and the shared VSBCloud shell: header, left navigation, command band, filter/search region, main table or form, detail/edit panel, confirmation dialog, and inline validation messages. Keep the Canvas 1366x768 density: compact tables, predictable rail navigation, and operational forms.

## 7 Data Sources

Countries; CountryAreas; Generators; Project States; Projects

Each display-name table must be resolved through ProjectCosts-CodeApp/reference/dataverse-entities.json and ProjectCosts-CodeApp/reference/dataverse-attributes.json. Do not hard-code logical names from memory when the metadata reference contains the mapping.

## 8 Global and Local State

Canvas Set, UpdateContext, and collections become explicit state: route/global context, server state, local draft state, and UI dialog/selection/error state. State must be reset when the route identity changes, especially when projectId changes.

## 9 Business Rule Registry

| Rule ID | Canvas behavior cluster | Source locator / Power Fx evidence | TypeScript target |
|---|---|---|---|
| MAIN-FX-001 | Screen bootstrap and loading gates | ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project Main Screen.pa.yaml OnVisible, Visible, DisplayMode, and initial collection formulas. | Screen model initializes route state, query keys, permissions, and draft collections before enabling commands. |
| MAIN-FX-002 | Project/context filtering | Canvas Filter, LookUp, SortByColumns, and Search formulas over: Countries; CountryAreas; Generators; Project States; Projects. | Repository query functions accept typed ids/filters and mirror Canvas row inclusion rules. |
| MAIN-FX-003 | Command enablement | Button/icon DisplayMode, command-bar Items, and popup visibility formulas. | rules.ts exposes pure predicates for add/edit/save/delete/submit availability. |
| MAIN-FX-004 | Validation and required-field rules | If, IsBlank, Notify, border/color formulas, and save guards. | Validation returns field errors plus blocking summary before any mutation executes. |
| MAIN-FX-005 | Patch/remove mutation behavior | Patch, Remove, UpdateIf, and ForAll formulas in behavior properties. | Dataverse service batches equivalent changes with optimistic UI only where Canvas semantics allow it. |
| MAIN-FX-006 | Derived numeric/date values | DateAdd, Round, Value, Coalesce, percentage/currency formatting formulas. | Pure calculation helpers preserve Canvas blank/zero/rounding semantics and have table-driven tests. |
| MAIN-FX-007 | Local collection lifecycle | ClearCollect, Collect, UpdateContext, and Set formulas. | Local state models Canvas working collections and is reset on project/screen change. |
| MAIN-FX-008 | Error/info/confirmation panels | Notify, popup component variables, and confirmation component output formulas. | Shared dialog/toast services expose the same blocking/non-blocking decisions. |
| MAIN-FX-009 | Security and role visibility | Role-gated Visible/DisplayMode formulas plus Dataverse role matrix. | Client hides controls for UX, while Dataverse/custom APIs enforce writes. |
| MAIN-FX-010 | Navigation and return behavior | Navigate, Back, Launch, and Param formulas. | React Router routes preserve projectId and replace cross-app launch where applicable. |
| MAIN-FX-011 | PCF/control event mapping | PowerCAT CommandBar; FluentDetailsList; Creator Kit Icon. | Replace PCF events with typed React component callbacks; preserve payload shape, selection, sorting, and action pulses. |
| MAIN-FX-012 | Flow/recalculation side effects | CreatingTeamsandSPOSite-ProjectCreation; ManualTrigger-UpdateTeamsandSPOSite when exposed. | Flow calls go through flowClient.ts; missing flows remain implementation blockers until resolved. |

These IDs are the implementation contract for this screen. Static one-line style/layout formulas are covered by the UI mapping; formulas with data access, validation, mutation, navigation, security, PCF, flow, or derived-value behavior are mapped into the rule rows above and expanded in tests.

## 10 Validation Rules

Validation must follow Canvas blocking order: required fields first, duplicate/conflict checks second, domain numeric/date bounds third, and side-effect eligibility last. Render field-level errors near the edited control and a summary error for command-level failures. Do not call Dataverse or a flow when validation has already failed.

## 11 Dataverse Mutations

Patch/remove/update behavior must be implemented through the shared repository/service layer. Every mutation must include the current row version where available, invalidate affected query keys, and handle permission errors distinctly from validation errors. Bulk Canvas ForAll(Patch(...)) behavior should be implemented as a service batch or explicit sequential transaction strategy with visible partial-failure handling.

## 12 Power Automate and Backend Side Effects

CreatingTeamsandSPOSite-ProjectCreation; ManualTrigger-UpdateTeamsandSPOSite when exposed

Use migration-plans/04-flow-inventory.md as the binding contract. Missing flow references are blockers for production parity and must not be silently stubbed. Server-triggered flows should remain server-triggered; the client writes source data only.

## 13 PCF Replacement Plan

PowerCAT CommandBar; FluentDetailsList; Creator Kit Icon

First-party/local PCFs are behavior evidence, not a mandate to embed PCF code in the Code App. Rebuild command bars, detail lists, icons, nav, context menus, and people pickers with Fluent UI. For sb_Dev.DevexCapexSummaryPCF and sb_Dev.SpreadSheet, preserve their input/output contracts and user-visible behavior in React components, using migration-plans/03-pcf-inventory.md.

## 14 Security and Permissions

Client-side visibility is only a usability layer. Dataverse role privileges, custom APIs, and server-side checks are the enforcement layer. The screen must deny unauthorized writes even if a user manually calls the repository mutation. Add tests for read-only role behavior and mutation rejection.

## 15 Error Handling

Preserve Canvas Notify and shared error-panel intent: validation errors stay inline, expected permission/recalculation/flow errors become recoverable messages, and unexpected errors are logged with enough context to identify screen, table, operation, and record id.

## 16 Loading and Empty States

Show a loading state while required reference data is unavailable. Empty tables must distinguish between no rows existing and filters hiding all rows. Disable mutations while prerequisite lookups are still loading.

## 17 Accessibility

Use semantic labels for commands and fields, keyboard-accessible tables/dialogs, focus return after modal close, and screen-reader status updates for save/delete outcomes. PCF replacements must expose keyboard sorting, row selection, and action buttons.

## 18 Testing Plan

Add rule tests for every MAIN-FX-* row. Add component tests for load/empty/error/read-only/edit/save/delete paths. Add integration tests around each Dataverse mutation and flow wrapper relevant to this screen. High-risk screens also need regression tests for known Canvas defects or intentional divergences.

## 19 Implementation Files

| Kind | Target |
|---|---|
| Screen component | src/features/pm/project-main/Screen.tsx |
| Rules | src/features/pm/project-main/rules.ts |
| Rule tests | src/features/pm/project-main/rules.test.ts |
| Hooks/model | src/features/pm/project-main/hooks.ts or src/features/pm/project-main/useScreenModel.ts |
| Repository/service calls | Shared Dataverse services under the target app data layer |
| Route registration | Route config for /projects |

## 20 Existing Code App Gap Notes

Cross-app Cost launch becomes an internal project route while preserving projectId compatibility. Treat existing React code as a helpful starting point only after comparing it to the Canvas YAML. Where the focused cost app and unified skeleton disagree, prefer Canvas behavior plus the global architecture plan.

## 21 Implementation Sequence

1. Resolve table/column logical names from metadata.
2. Port pure rules and tests first.
3. Build repository queries/mutations and mocked fixtures.
4. Build the screen model hook.
5. Build UI with read-only/load/error states.
6. Wire mutations and flow side effects.
7. Add integration/component tests and update route/build plan if needed.

## 22 Known Risks

Risk level: Medium. Dependencies: App Loading. Completion status: COMPLETE. Any missing flow, unverified role privilege, or PCF behavior gap must stay visible in the acceptance checklist until closed with source evidence.

## 23 Acceptance Criteria

The screen is accepted when it loads from a deep link, renders the same functional rows as Canvas, enforces the same command availability, blocks invalid saves, commits valid Dataverse mutations, handles flow/recalculation side effects, respects Dataverse security, passes rule/component tests, and records any intentional behavior differences as approved divergences.

## 24 Traceability Matrix

| Canvas artifact | Code App artifact | Verification |
|---|---|---|
| ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project Main Screen.pa.yaml | src/features/pm/project-main/Screen.tsx | Visual/workflow parity review |
| Canvas formulas counted: 1175 | src/features/pm/project-main/rules.ts and hooks | MAIN-FX-* tests |
| Logic blocks counted: 54 | Service/model/UI tests | Coverage report below |
| Tables: Countries; CountryAreas; Generators; Project States; Projects | Dataverse repositories | Query/mutation tests |
| PCF: PowerCAT CommandBar; FluentDetailsList; Creator Kit Icon | Fluent/React replacement components | Interaction tests |
| Flow: CreatingTeamsandSPOSite-ProjectCreation; ManualTrigger-UpdateTeamsandSPOSite when exposed | flowClient.ts wrappers/custom APIs | Payload/error tests |

## 25 Out of Scope

Do not migrate diagnostic screens, do not rewrite unrelated app shell behavior, do not invent new Dataverse tables, do not bypass role/security work with client-only checks, and do not implement missing flows as no-op placeholders.

## 26 Self-Contained Implementation Checklist

- Read this plan and the five global plan files.
- Inspect ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project Main Screen.pa.yaml directly before coding.
- Confirm target path src/features/pm/project-main exists or create it using existing repo conventions.
- Implement MAIN-FX-* rule tests before wiring UI mutations.
- Preserve route /projects and dependency notes.
- Close every blocker named in COMPLETE before declaring production parity.

# CLAUDE IMPLEMENTATION PACKAGE

## Mission

Implement **Project Main Screen** as a production Code App screen at /projects using source ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project Main Screen.pa.yaml. Preserve all behavior represented by 1175 formula properties and 54 logic blocks, prioritizing the 27 substantive behavior blocks.

## Non-Negotiables

- Do not implement from screenshots alone; inspect the Canvas YAML.
- Do not use client-side permission checks as enforcement.
- Do not silently drop PCF behavior or flow behavior.
- Do not mutate unrelated features while implementing this screen.
- Do not mark this screen complete while status is COMPLETE unless the named blocker is closed.

## Build Inputs

| Input | Value |
|---|---|
| Source YAML | ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project Main Screen.pa.yaml |
| Tables | Countries; CountryAreas; Generators; Project States; Projects |
| PCF/control dependencies | PowerCAT CommandBar; FluentDetailsList; Creator Kit Icon |
| Flow/backend dependencies | CreatingTeamsandSPOSite-ProjectCreation; ManualTrigger-UpdateTeamsandSPOSite when exposed |
| Route | /projects |
| Feature path | src/features/pm/project-main |
| Rule prefix | MAIN |

## Build Outputs

- Screen component, model hook, rules module, and tests under src/features/pm/project-main.
- Route registration for /projects.
- Dataverse service usage for listed tables.
- PCF replacements or wrappers matching listed behavior.
- Flow/custom API wrappers for listed backend effects.
- Test evidence for each MAIN-FX-* rule.

## Done Definition

Done means Canvas behavior is traceable to Code App behavior, tests pass, role/security gates are enforced by backend privileges, and every listed blocker is either closed with evidence or the screen remains explicitly incomplete.

## Screen Coverage Report

| Coverage item | Value |
|---|---|
| Screen plan status | COMPLETE |
| Source screen included | Yes |
| Controls inventoried | 101 |
| Formula properties classified | 1175 |
| Logic blocks audited | 54 |
| Substantive logic blocks audited | 27 |
| Stable rule IDs in this plan | 12 |
| Dataverse tables mapped | Countries; CountryAreas; Generators; Project States; Projects |
| PCF/control dependencies mapped | PowerCAT CommandBar; FluentDetailsList; Creator Kit Icon |
| Flow dependencies mapped | CreatingTeamsandSPOSite-ProjectCreation; ManualTrigger-UpdateTeamsandSPOSite when exposed |
| Remaining blockers | None known for planning. Verify live environment privileges during implementation. |

Coverage interpretation: all formula properties were scanned and classified during the workspace inventory; this file assigns stable implementation rule clusters for meaningful behavior. Static layout/style formulas are covered by UI parity and do not receive individual business-rule IDs.



