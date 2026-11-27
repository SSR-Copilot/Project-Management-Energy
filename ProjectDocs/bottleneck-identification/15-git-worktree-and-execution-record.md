# 15 — Git, worktree and execution record

> Stage 1, 26 Nov 2026. Everything below was observed with read-only Git commands before the worktree was created, unless marked otherwise.

## 1. Pre-flight inspection (no state changed)

| Item | Observed |
|---|---|
| Repository root | `C:/Personal/Code App Mordenization/Project-Management-Energy` |
| Branch in the original tree | `RounakDev1` at `dde9e92` (tracks `origin/RounakDev1`) |
| Remotes | `origin` = GitHub `SSR-Copilot/Project-Management-Energy`; `azure` = Azure DevOps `VSB Cloud Code App` |
| Worktrees before | one (the original tree) |
| Local branches | `RounakDev1`, `master` (both `dde9e92`) |
| Remote branches | `origin/RounakDev1`, `origin/master`, 15 other `origin/*` feature branches, `azure/develop`, `azure/hotfix`, `azure/main` |
| Original tree status | 1 modified file (`ProjectDocs/app-docs/02-OPEN-DECISIONS.md`) and untracked: six `.claude/skills/ponytail*` folders, `ProjectDocs/release-notes/RELEASE-NOTES-QA-2026-11-24.{md,docx}`, `ProjectDocs/test-cases/Release-2026-11-24/`. Staged: none. These belong to the other session and were not touched. |
| `git fetch origin` | Run (updates remote-tracking refs only). `origin/RounakDev1` = `dde9e925e83feaf48af9cdaa2f790e10d2e6f4a5`, identical to local `RounakDev1`. |
| Name collisions | Branch `feature/bottleneck-identification-optimization` did not exist; target directory did not exist. `Project-Management-Energy-worktrees/` (empty) already sits next to the repo and was left alone. |

## 2. Isolated worktree

```
git worktree add -b feature/bottleneck-identification-optimization \
  "C:\Personal\Code App Mordenization\Project-Management-Energy-WorkDev1-BottleneckOptimization" origin/RounakDev1
```

| Item | Value |
|---|---|
| Worktree path | `C:\Personal\Code App Mordenization\Project-Management-Energy-WorkDev1-BottleneckOptimization` |
| Branch | `feature/bottleneck-identification-optimization` |
| Start commit | `dde9e925e83feaf48af9cdaa2f790e10d2e6f4a5` (matches the fetched `origin/RounakDev1`) |
| Upstream | **Unset on purpose** (`git branch --unset-upstream`). `git worktree add … origin/RounakDev1` made the new branch track `origin/RounakDev1`, which would have let a bare `git push` target the source branch. |
| VS Code | Opened in a separate window (`code -n <path>`). |

## 3. Isolation verification (after creation)

- New worktree: on `feature/bottleneck-identification-optimization`, HEAD `dde9e92`. ✔
- Original tree: still on `RounakDev1`, same modified and untracked entries as before. ✔
- `git worktree list`: exactly two entries (original, new). ✔
- No stash, reset, clean, checkout, merge, rebase, push or commit was run in either tree.

## 4. Work done inside the worktree in Stage 1

- `npm ci` in `ProjectCosts-CodeApp/` (own `node_modules`, so it cannot disturb the original tree's running processes) and one `npm run build` (23.8 s) for the bundle baseline. `dist/` is git-ignored.
- Documentation written under `ProjectDocs/bottleneck-identification/`. **Deviation from the brief:** the brief names `docs/bottleneck-identification/`; this repo's standing rule is that docs live in `ProjectDocs/` and never in the code repo (`AGENT-GUIDE.md`, "Keep docs out of the code repo"), so `ProjectDocs/bottleneck-identification/` is used.
- No application source, test, script or configuration file was modified. Stage 1 agents were bound to the same rule and to write only under that folder (and throwaway scripts under `_bench/`).
- Nothing is committed. Nothing is pushed.

## 5. Related branches and worktrees seen (not touched)

- The D165 programme (`feature/dataverse-network-performance-optimization`) has been merged into `RounakDev1` (`dde9e92` is its merge commit). Its agent worktrees `C:\wt-dvopt\*` are not in `git worktree list` any more.
- `azure/develop` carries the D165 snapshot (`01c4e5b`).

## 6. Stage 1 execution log

| Step | Result |
|---|---|
| Specialist agents launched (read-only) | 9: Architecture+Bundle (BND), Rendering+Hooks/State (RND), Business logic/Compute (CMP), Dataverse/Network+Async (NET), Memory/Resource (MEM), screen groups Cost (SCC), PM core incl. Cluster Checklist (SPA), PM Production/Revenue/Finance/Generators (SPB), Admin (SAD) |
| Shared rules | `_register/AGENT-BRIEF.md` |
| Per-agent registers | `_register/<PREFIX>.md`, merged by the orchestrator into doc 14 |

## 7. Stage 1 completion record (26 Nov 2026)

| Item | Result |
|---|---|
| Agents | 9 of 9 reported; 142 raw findings, 113 unique after merging 29 duplicates (doc 14 section 4) |
| Documents | 01-15 written under `ProjectDocs/bottleneck-identification/`. Per-agent registers in `_register/`, throwaway measurement scripts and raw outputs in `_bench/<PREFIX>/` (these are diagnostic artefacts, not application code) |
| Source changes | None. `git status` in the worktree shows only `?? ProjectDocs/bottleneck-identification/`; zero entries under `ProjectCosts-CodeApp/` |
| Side effects | `_bench/RND` left a git-ignored `.vite` cache under `node_modules`; `ProjectCosts-CodeApp/dist/` from the baseline build is git-ignored |
| Original tree | Unchanged: branch `RounakDev1`, same modified and untracked entries as in section 1 |
| Commits / push | None. The documents are untracked in the worktree |
| Merge scripts | `merge.mjs` and `consolidate.mjs` (orchestrator scratch folder, not in the repo) generate docs 02, 10, 11, 13 and 14 from the registers |

## 8. Stage 2 completion record (26 Nov 2026)

| Item | Result |
|---|---|
| Approval | The user's message "Proceed for the next items for addressing the Bottleneck issues" was taken as approval of Stage 2 only (planning); Stage 3 has NOT been approved |
| Agents | Five Stage 2 agents (A Check List/PM core/flows, B write engine, C entry/freshness/reads, D render/CPU/memory, E reads/bundle/coupling) reported; 119 score rows covering all 113 canonical findings |
| Documents | 16-24 written; per-agent strategy and score tables in `_stage2/`; extra throwaway benches in `_bench/S2B`, `S2C`, `S2D`, `S2E` (E also left a 22-file experiment patch `first-wave-experiment.patch`, not applied to the repo) |
| Source changes | None. Agent E sized the bundle changes in scratch copies of `src/` outside the repository and removed them |
| Commits / push | None. All documents are untracked |
