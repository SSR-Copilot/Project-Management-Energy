# 21 — Agent execution allocation

> Stage 2, 26 Nov 2026. How Stage 3 would be staffed, and what each Stage 1 and Stage 2 agent did. Nothing here starts without approval.

## 1. Stage 3 workforce (one Master Orchestrator, specialists below)

| Specialist | Tasks | Notes |
|---|---|---|
| Independent QA | T-A08, T-D00 | |
| Dataverse and Network | T-E08, T-E05, T-B05, T-B01, T-B02, T-B03, T-B04, T-B06, T-B10, T-B11, T-A06 | |
| Bundle and Initialization | T-E01, T-E02, T-E03, T-C08, T-C01, T-C02, T-C03, T-A04, T-E07, T-E04 | |
| React Performance | T-D04, T-D01, T-D05, T-D06 | |
| Screen-Level | T-B07, T-A01, T-A02 | |
| State Management | T-E06, T-C04, T-B08, T-B09 | |
| Async and Concurrency | T-A05, T-C05, T-A03, T-A09, T-A07, T-C06, T-C07 | |
| Business Logic and Algorithm | T-D02, T-D03 | |
| Bottleneck Audit Agent | none in Stage 3 (finished) | Re-audit only if a measurement contradicts a finding |
| Memory and Resource Agent | none planned | MEM-03 is under T-D00; reactivate if BM-05/BM-13 show growth |

## 2. Rules for Stage 3 agents

1. **One worktree and branch per workstream**, created from the approved base, never inside another session's tree. Suggested branches: `perf/bundle-structure` (T-E01..03, T-C08), `perf/entry-prefetch` (T-C01..03, T-A04), `perf/read-lane` (T-C05, T-C04), `perf/write-path` (T-B*), `perf/checklist` (T-A*), `perf/render` (T-D*, only after Wave 0).
2. **One owner per shared file at a time.** The shared-file column of doc 20 is the lock list; the orchestrator grants it in wave order. Overlaps found in Stage 2: `data/usePlanWrite.ts` (T-A01, T-A02, T-A03, T-B08), `pm/checklist/hooks.ts` (five tasks), `useCostBook.ts` (T-B09, T-E04, T-E06, T-C04), `data/client.ts` (T-B06, T-C06), `pm/general-data/hooks.ts` and `Screen.tsx` (T-D01, T-E07), `data/landLease.ts` (T-B05, T-C05), `data/capexWrites.ts` (T-B04), `app/bootPrefetch.ts`/`bootPlan.ts` (T-C01, T-C02, T-C03), `pm/production/hooks.ts` (T-B02, T-C02), `pm/finance/hooks.ts` (T-B08, T-C02).
3. **Agents may not widen scope**: a task is its listed findings and files. A new finding goes to the orchestrator, not into the diff.
4. **Each task is implemented by a different agent than the one that validates it**; the Independent QA agent re-runs the acceptance measurement and reads the diff without relying on the implementer's summary.
5. **No push, merge, rebase or PR without approval**; no commit of another session's work; no `pac code push` (DEV deployment is the user's decision, and every DEV check in a task's gate is requested from the user).

## 3. What the Stage 1 and Stage 2 agents did

| Agent | Stage | Scope | Output |
|---|---|---|---|
| BND, RND, CMP, NET, MEM, SCC, SPA, SPB, SAD | 1 | Nine read-only audits | 142 findings (113 unique), docs 01-10, 15 |
| Stage 2 A | 2 | Check List and PM core, flows (21 findings) | `_stage2/A-*` |
| Stage 2 B | 2 | Write amplification, deletes, reloads (23) | `_stage2/B-*` + model bench |
| Stage 2 C | 2 | Entry, freshness, reads (24) | `_stage2/C-*` + gate bench |
| Stage 2 D | 2 | Rendering, CPU, memory (26) + browser protocol | `_stage2/D-*` + filter bench |
| Stage 2 E | 2 | Redundant reads, bundle, coupling (26) | `_stage2/E-*` + scratch-rebuild measurements and a 22-file experiment patch |

Collisions between the Stage 2 agents were resolved here: RND-10 (D yielded to C's freshness policy); SPA-09/10 and BND-13 (A's T-A04 and C's T-C03 share one helper); SPB-09 and SPA-01 (one `usePlanWrite` API); SPA-15 and RND-02 (D's T-D01 owns the municipality search, A's SPA-15 truncation is probe P-1).
