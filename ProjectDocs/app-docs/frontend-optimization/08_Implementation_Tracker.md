# 08 — Implementation tracker

Final state, 25 Nov 2026. Branch `feature/frontend-performance-optimization`. **Everything is uncommitted.** Commits wait
for the owner's review.

All batches share one working tree, with disjoint file ownership (`07` §1). B3, B4 and B5 ran in parallel as separate
agents, and B6 as an independent reviewer. Numbers are in `09`.

| Batch | Finding | Pri | Status | Files | Owner | Tests |
|---|---|---|---|---|---|---|
| B0 | Render probe and bundle report | — | **Done** | `platform/renderProbe.ts` (generalised from D143, re-exported by Generators), `test/renderCounts.ts`, `scripts/bundle-report.mjs` (`npm run bundle:report`) | orchestrator | UT-RENDERPROBE-001…003 |
| B1 | FE-C1-02 (CA-31): unsaved sheet edits lost on a project refetch | **P0** | **Done** (reproduced first) | `add-costs-from-table/Screen.tsx` | orchestrator | UT-ACIDENT-001…003 |
| B1 | FE-SH-01 (+ FE-C2-04): Date-aware `structuralSharing` default (D-1) | P1 | **Done** | `app/queryStructuralSharing.ts`, `app/Providers.tsx` | orchestrator | UT-QSHARE-001…007 |
| B1 | FE-SH-02: stable `AppRoutes` element | P2 | **Done** | `App.tsx`, `app/routes.tsx` (probe) | orchestrator | UT-SHELLRENDER-002 |
| B1 | FE-SH-06: command bar mounts once | P2 | **Done** | `components/CommandSlot.tsx` | orchestrator | UT-SHELLRENDER-004, 005 |
| B1 | FE-SH-08: report details built on open; error icon subscribed (D-4) | P2 | **Done**; microtask notification added after review | `ReportProblemPanel.tsx`, `app/useHasTracedError.ts`, `App.tsx` | orchestrator | UT-SHELLRENDER-001, 003, 006 |
| B1 | FE-SH-07: cancelled or removed loads close their ACTION | P3 | **Done** | `app/queryLog.ts`, `platform/requestLog.ts` | orchestrator | UT-REQLOG-024, 025 |
| B2 | FE-C1-01: formula engine stub (D-2 DIVERGENCE) | P1 | **Done** | `platform/formulaParserStub.ts`, `vite.config.ts`, `tsconfig.app.json` | orchestrator | UT-FORMULASTUB-001, 002 |
| B2 | (found while testing) Vitest ran react-spreadsheet's CommonJS build, so neither alias reached it | — | **Fixed** | `vite.config.ts` (`test.alias`, `server.deps.inline`, optimizer `exclude`) | orchestrator | UT-FORMULASTUB-002 |
| B2 | FE-SH-04: components and domain marked side-effect free | P1 | **Done** | `vite.config.ts` | orchestrator | build, `09` §1 |
| B2 | FE-SH-05: Fluent start-up chunk limited to the measured core | P1 | **Done** | `vite.config.ts` | orchestrator | build, `09` §1 |
| B2 | FE-P2-06: Production stops loading Land Lease | P2 | **Done** | `data/countryInflation.ts` (moved, re-exported), `data/production.ts` | orchestrator | existing |
| B3 | FE-SH-03: CAPEX remount | ~~P1~~ | **Withdrawn**: no remount happens (React unwraps the unkeyed Fragment). Now pinned | — (no code change) | B3 | UT-CAPEXROUTE-FE-001…003 |
| B3 | FE-C1-04: redundant first read-back | P2 | **Done**; the `[loaded]` effect also clears a pending read-back (review fix) | `add-costs-from-table/Screen.tsx` | B3 + orchestrator | UT-ADDCOST-FE-001…003, 010 |
| B3 | FE-C1-09: stranded comment tooltip | P3 | **Done** | `capex-costs/pcf/ui/GridRenderer.js` | B3 | UT-CAPEX-FE-001, 002 |
| B3 | FE-C2-01, -02, -03: Contracts picker, cards, target gate | P2–P3 | **Done** | `cost/contracts/Screen.tsx` | B3 | UT-CONTRACTS-FE-001…004 |
| B3 | FE-C2-05: OPEX fold reset during render | P3 | **Done** | `periods/OpexScreen.tsx` | B3 | UT-OPEX-FE-001, 002 |
| B3 | FE-C2-06: Land Lease fold renders one card | P2 | **Done** | `periods/LandLeaseScreen.tsx` | B3 | UT-LEASE-FE-001 |
| B4 | FE-P2-01: Finance gallery memoised | P1 | **Done** (step 1; "each panel owns its draft" not needed) | `finance/Screen.tsx`, `finance/hooks.ts` | B4 | UT-FIN-FE-001, 005 |
| B4 | FE-P2-02: Finance repayment rows | P1 | **Done** | `finance/Screen.tsx` | B4 | UT-FIN-FE-002, 003 |
| B4 | FE-P2-09: Finance seed effect | P3 | **Done** | `finance/Screen.tsx` | B4 | UT-FIN-FE-004 |
| B4 | FE-P2-03: Production rows | P2 | **Done** | `production/Screen.tsx`, `production/rules.ts` | B4 | UT-PROD-FE-001…005 |
| B4 | FE-P2-08: Grid Operator flash timer | P3 | **Done** | `grid-operator/Screen.tsx` | B4 | UT-GRIDOP-FE-001, 002 |
| B4 | FE-P1-01: map chunk starts with the reads | P2 | **Done** | `general-data/Screen.tsx` | B4 | UT-GDATA-FE-003 |
| B4 | FE-P1-02a: municipality options memoised | P2 | **Done** | `general-data/Screen.tsx` | B4 | UT-GDATA-FE-001 |
| B4 | FE-P1-03: Check List table and stepper | P2 | **Done** | `checklist/Screen.tsx`, `ProjectStates.tsx` | B4 | UT-CHK-FE-001, 002 |
| B4 | FE-P1-04: Overview URL debounce (D-5) | P2 | **Skipped**: not behaviour-identical (UT-OVUI-047, UT-OVFIX-060 read the URL right after typing; a reload inside the pause would lose characters) | — | B4 | — |
| B4 | FE-P1-05: Azure Maps token refresh only while a map is mounted | P3 | **Done**; UT-AZMAP-005 now mounts a map first (same id and assertions) | `platform/azureMapsToken.ts`, `general-data/ProjectMap.tsx` | B4 | UT-MAPTOKEN-FE-001…003, UT-GDATA-FE-004 |
| B4 | FE-P2-05: Finance stops loading Revenues and Generators | P2 | **Done** (moved, re-exported) | `features/pm/shared/projectRow.ts`, `data/pmProjectRow.ts`, `data/finance.ts`, `data/revenues.ts`, `revenues/rules.ts`, `finance/rules.ts` | B4 | existing + import-graph check |
| B5 | FE-AD-01: Gates rows memoised | P1 | **Done** | `admin-gates-approvals/GateTable.tsx`, `Screen.tsx` | B5 | UT-ADGATE-FE-001…004 |
| B5 | FE-AD-06: Gates people parser kept | P3 | **Done** | `GateTable.tsx` | B5 | UT-ADGATE-FE-005 |
| B5 | FE-AD-02: Check List Settings drawer form local | P1 | **Done**. Visible: the fields keep their values while the drawer slides closed | `admin-default-checklists/TaskEditorDrawer.tsx`, `Screen.tsx` | B5 | UT-ADCHK-FE-001, 003 |
| B5 | FE-AD-03: `memo(TaskTable)` | P3 | **Done** | `TaskTable.tsx`, `Screen.tsx` | B5 | UT-ADCHK-FE-002 |
| B5 | FE-AD-05: Admin Contracts cards and tree | P3 | **Done** | `admin-contract/ContractCard.tsx`, `DevCoCostForm.tsx`, `Screen.tsx` | B5 | UT-ADCONTR-FE-003, 004 |
| B5 | FE-AD-07: Admin Contracts stops loading Cost Contracts | P2 | **Done** (moved, `listCapexAccounts` unchanged) | `data/capexAccounts.ts`, `data/contracts.ts`, `admin-contract/hooks.ts` | B5 | UT-ADCONTR-FE-001, 002, UT-CAPEXACC-FE-001, 002 |
| B6 | Independent review: 0 blockers, 2 should-fix (both fixed), 4 nits | — | **Done** | see `10` §2 | reviewer + orchestrator | UT-SHELLRENDER-006, UT-ADDCOST-FE-010 |

**Totals:**
- 36 approved findings: 34 done, 1 withdrawn (FE-SH-03), 1 skipped (FE-P1-04).
- 1 extra test-fidelity fix.
- 14 findings deferred (`06` §3, #37–#50).
