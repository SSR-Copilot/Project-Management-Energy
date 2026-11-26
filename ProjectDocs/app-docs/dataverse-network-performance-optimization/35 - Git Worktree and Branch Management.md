# 35 - Git Worktree and Branch Management

Standing rules for this workstream. The record of what was actually done is in `14 - Git Execution Record.md`.

| Item | Value |
|---|---|
| Worktree | `C:\Personal\Code App Mordenization\Project-Management-Energy-WorkDev1-DataverseOptimization` |
| Branch | `feature/dataverse-network-performance-optimization` (local only, no upstream) |
| Base | `origin/RounakDev1` at `30afece` (25 Nov 2026) |
| Original tree | `C:\Personal\Code App Mordenization\Project-Management-Energy`, on `RounakDev1`. Never switched, never edited from this session. |

## Rules

1. All work stays in this worktree. Do not run `git checkout` / `git switch` in the original tree, and do not edit files outside this worktree (the scratchpad aside).
2. Commit only on this branch, in logical commits (`perf(dataverse): ...`, `fix(dataverse): ...`, `test(dataverse): ...`, `docs(dataverse): ...`), and only after the project gate: `npm run verify`, the improvements log (`13-CODE-APP-IMPROVEMENTS-OVER-CANVAS.md`) current, and the E2E parity question asked (AGENT-GUIDE items 4-6). **Commit approval is explicit and per request**; a passing gate is not approval.
3. Never push, merge, rebase, force, rewrite history or open a pull request without your explicit approval. If `origin/RounakDev1` advances, nothing is merged automatically; the options are put to you.
4. Never commit another session's changes; stage by path, not `git add -A`.
5. Commit messages carry no Claude co-author trailer (standing rule recorded in the project memory: "NEVER add a Claude Co-Authored-By trailer to commits/merges/PRs").
6. Do not remove this worktree while a session may use it; remove it with `git worktree remove` only after the branch has been merged or abandoned by decision.
7. Overlap with other workstreams (a frontend session and a business-logic session exist in the same repository): shared files (`data/client.ts`, `data/concurrency.ts`, `data/retry.ts`, `app/Providers.tsx`) are the likely collision points. Stage 2 lists every shared file it intends to change so the integration order can be agreed first.
