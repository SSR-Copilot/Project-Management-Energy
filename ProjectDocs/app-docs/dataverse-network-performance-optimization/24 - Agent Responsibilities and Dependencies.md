# 24 - Agent Responsibilities and Dependencies

> Stage 2 (design and planning only), 25 Nov 2026. Stage 3 only; none of these agents edits anything until you approve Stage 3.

## 1. Roles

| Agent | Owns (tasks) | Reads / writes | Hands off to |
|---|---|---|---|
| **Master Orchestrator** (this session) | sequencing, wave gates, every **shared file** (`data/retry.ts`, `data/concurrency.ts`, `data/client.ts`, `data/executePlan.ts`, `data/bulkSend.ts`, `data/requestPolicy.ts`, `app/Providers.tsx`, `platform/errors.ts`), T-10..T-15, T-13, docs 27-35, commits | writes shared files | everyone |
| Dataverse Audit | T-00 census harness, probes P-1..P-5, baseline capture, doc 28 | `scripts/`, doc 28; read-only probes on DEV | Network, Bulk, Query |
| Network Optimization | T-20, T-22, T-23, T-24 | screen and data modules named in doc 22; never a shared file | QA |
| Bulk Operations | T-40, T-41, T-42, T-43, T-05 | `data/bulk*`, module bulk files | QA |
| Query Optimization | T-30, T-31, T-33 | `data/odata.ts` (shared: through the Orchestrator), query modules | QA |
| Payload Optimization | T-32 | write modules named in doc 22 | QA |
| Transaction | T-01, T-02, T-03, T-04, T-06, T-07, T-08, T-09 | write modules; plans | QA |
| Caching | cache parts of T-20..T-24, T-41 (PA-12), the G-REQ-adjacent keyed-cache tests | hooks, keys | QA |
| Concurrency | T-13 design review, peak-in-flight tests | tests; shared files via Orchestrator | QA |
| Reliability | T-10, T-11, T-12, T-14 tests; failure matrix (doc 30) | tests; shared files via Orchestrator | QA |
| **QA (independent)** | reviews every changed file, transaction, bulk path, cache and retry rule; runs the regression and failure tests; may block a wave | read-only on code; writes docs 29-33 | Orchestrator |

QA is a fresh agent that has not seen the implementer's reasoning, briefed with the diff and the acceptance criteria, not the conclusion.

## 2. Rules for working in parallel

1. **One editor per file.** An agent never edits a file another agent has open in the same wave; shared files only through the Orchestrator.
2. **Disjoint modules per wave.** The task table in doc 22 lists affected files; the Orchestrator rejects an overlapping assignment.
3. **Each agent works in this worktree only**, in its own task-named commit group; no agent commits another agent's files; no push, merge or rebase (doc 35).
4. **A change to a shared file is announced first** in the implementation tracker (doc 27) with the intended diff, so the frontend and business-logic sessions can say if they are editing it. Their branches are not merged or cherry-picked from here without your authorization.
5. **Gates are the Orchestrator's**: `npm run verify`, the improvements log, the decisions log and the E2E parity question are done once per wave, on an idle machine (a loaded machine produced false failures in Stage 1).

## 3. Cross-workstream dependencies

| Other workstream | Likely overlap | Plan |
|---|---|---|
| Frontend performance (D162) | `app/Providers.tsx` (query `retryDelay`), components that render load errors | T-10 changes only the options object; confirm with that session before editing |
| Business logic / computation (D160) | `rules.ts` files, the Cost write modules | this programme changes request scheduling, not rules; any `rules.ts` touch is a flag to stop and ask |
| Any session touching `data/retry.ts` or `concurrency.ts` | direct | Orchestrator edits only; announce first |

No dependency on another workstream's uncommitted work exists today.
