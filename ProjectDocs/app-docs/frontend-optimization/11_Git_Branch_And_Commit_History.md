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

## 4. Commits and merges (25 Nov 2026, on the owner's instruction)

The owner asked: "Proceed for merging commit and push to RounakDev1 and then to the master branch (all the merging commit push should be on both local and GitHub Branches). DO NOT publish this feature branch". E2E parity: skipped by the owner.

| Commit | What | Where |
|---|---|---|
| `a90d4f5` | `perf(frontend): fewer renders, a smaller start-up bundle and a sheet data-loss fix (D162)`: all code (81 files) | feature branch (local only) |
| `815842a` | `docs: frontend optimization programme record, CA-31, D162, improvements log 1.6`. Only the D162 block of `02-OPEN-DECISIONS.md`; the owner's uncommitted D160 §13 stays out | feature branch (local only) |
| `3b65425` | `Merge feature/frontend-performance-optimization into RounakDev1 (D162)` (no-ff) | `RounakDev1` |
| `79a6e5f` | `Merge origin/master into RounakDev1`: 4 commits pushed to GitHub `master` the same afternoon by another developer (bug fixes; Application Insights, their **D161**) | `RounakDev1` |
| (this commit) | `docs: record the D162 merges` | `RounakDev1` |

**Renumbered:** this programme was provisionally **D161**. GitHub `master` took D161 at 13:34 for the Application Insights change, so this programme became **D162** before the merge, in code comments and docs alike. The merge conflict in `02-OPEN-DECISIONS.md` (both sides appended) was resolved by keeping both, in number order. `checklist/ProjectStates.tsx` merged automatically: the two changes touch different components.

**Gate on the merged tree** (`79a6e5f`): `npm run verify` exit 0, with 428 files and 7,484 tests passed and the build green.

**Pushes:**
- `RounakDev1`, then `master`, to `origin` (GitHub), both fast-forwards of the remote.
- Local `master` is fast-forwarded to `RounakDev1`, so both branches point at the same commit.
- **The feature branch is not pushed.** It stays local with no upstream.
- No Co-Authored-By trailer.

## 5. Source branch drift

Before each batch, run `git fetch origin` and `git log HEAD..origin/RounakDev1`. Any new upstream commit is reported
with the files it touches, and nothing is merged or rebased without approval. Last check: 25 Nov 2026, no drift.
