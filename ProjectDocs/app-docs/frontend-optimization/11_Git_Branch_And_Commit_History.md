# 11 — Git branch and commit history

Started 25 Nov 2026, updated at each stage.

## 1. Branch creation

| Item | Value |
|---|---|
| Repository root | `C:/Personal/Code App Mordenization/Project-Management-Energy` (one repo: `ProjectCosts-CodeApp/` and `ProjectDocs/`) |
| Remotes | `origin` = GitHub `SSR-Copilot/Project-Management-Energy`; `azure` = Azure DevOps mirror (not used here) |
| Branch before | `master` at `ed4354e` |
| Fetch | `git fetch origin --prune` (25 Nov 2026) |
| Source branch | `origin/RounakDev1` |
| Source commit | `ed4354e80fe47c3e095d8fa8942683db095a6327` ("Merge origin/RounakDev1 into optimization/stage3", 24 Nov 2026) |
| Local `RounakDev1`, `master` | both at the same commit (`ed4354e`); 0 ahead / 0 behind |
| New branch | `feature/frontend-performance-optimization` (`git switch -c … origin/RounakDev1`) |
| Created | 2026-11-25T11:52:55+05:30 |
| Merge base with `origin/RounakDev1` | `ed4354e` (verified) |
| Upstream | **unset on purpose** (`git branch --unset-upstream`), so a bare `git push` cannot target `RounakDev1` |

## 2. Working tree carried over (the owner's, untouched)

Present before branch creation and still present. None of it belongs to this initiative, and it will not be committed
with it:

- `M ProjectDocs/app-docs/02-OPEN-DECISIONS.md`: 8 lines, D160 §13 "DEV push of `ed4354e`, local smoke test waived".
  The file is identical in `ed4354e`, so the switch carried the edit safely.
- `?? .claude/skills/ponytail*` (6 folders).
- `?? ProjectDocs/release-notes/RELEASE-NOTES-QA-2026-11-24.{md,docx}`.
- `?? ProjectDocs/test-cases/Release-2026-11-24/`.

## 3. Initiative files (uncommitted, end of Stage 3)

- **Docs:**
  - `ProjectDocs/app-docs/frontend-optimization/01`–`11`;
  - `01-BUGS-FOUND.md` (CA-31);
  - `02-OPEN-DECISIONS.md` (D162, appended after the owner's uncommitted D160 §13, which stays out of every commit);
  - `13-CODE-APP-IMPROVEMENTS-OVER-CANVAS.md` (§1.6).
- **Code:** `ProjectCosts-CodeApp/`. 49 modified files (including `package.json` for `bundle:report`, `vite.config.ts` and
  `tsconfig.app.json`) and 32 new files, 18 of them tests. The list is in `08`; run `git status` for the exact set.
- **No dependency change:** `package-lock.json` is untouched.

Scratch work stayed out of the repository:
- The Stage 1 scratch builds wrote only to the session scratchpad. Their temporary `vite.scratch-*.config.ts` files were
  created next to `vite.config.ts` and deleted after each build.
- The Stage 3 baseline build used a temporary `git worktree` of `ed4354e` in the scratchpad. Its `node_modules` junction
  was removed first, so the real `node_modules` was untouched, then the worktree was removed. `git worktree list` shows
  only the main tree.

## 4. Commits

None. On 25 Nov 2026, at the end of Stage 3, the owner chose **not to commit yet** and to review the diff first. The owner also chose to skip the E2E parity run. Each commit still needs the owner's explicit approval (standing rule). Proposed shape:

1. `docs: add frontend optimization discovery and strategy`
2. One `perf(frontend): …` commit per batch B1–B5, or a combined commit, as the owner prefers.
3. `docs: finalize frontend optimization report`

No push, no merge into `RounakDev1`, and no Co-Authored-By trailer (the owner's git rule of 16 Nov 2026).

## 5. Source branch drift

Before each batch, run `git fetch origin` and `git log HEAD..origin/RounakDev1`. Any new upstream commit is reported
with the files it touches, and nothing is merged or rebased without approval. Last check: 25 Nov 2026, no drift.
