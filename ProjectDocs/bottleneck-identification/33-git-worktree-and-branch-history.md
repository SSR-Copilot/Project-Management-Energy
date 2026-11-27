# 33 — Git worktree and branch history

> Stage 3, 27 Nov 2026. Until the user's merge instruction on 27 Nov 2026 nothing was committed; the sections below describe the working-tree state at that point. On that instruction (with the E2E parity run declined by the user, and `npm run verify` re-run on the rebased tree) the change set was committed in two commits (code, then documentation) on the integration branch, rebased onto `origin/RounakDev1` (which had moved from `dde9e92` to `b5d03f0` with four bug-fix commits by another developer touching none of the same files), fast-forwarded into `RounakDev1` and then `master`, pushed to `origin`, and the sub-branches and worktrees created by this session were removed. Final shas and the remote state are in `git log` and in the closing message of the session; no force-push was used.

## 1. Trees

| Tree | Branch | Base | State |
|---|---|---|---|
| `C:\Personal\Code App Mordenization\Project-Management-Energy` (the original, used by another session) | `RounakDev1` | `dde9e92` | **Untouched**: same one modified file and untracked entries as at the start; never edited |
| `…\Project-Management-Energy-WorkDev1-BottleneckOptimization` (integration) | `feature/bottleneck-identification-optimization` | `dde9e92` | Docs (`ProjectDocs/bottleneck-identification/`, untracked) and the integrated change set (111 paths under `ProjectCosts-CodeApp/`, uncommitted) |
| `C:\wt-bn\bundle-structure` | `perf/bundle-structure` | `dde9e92` | Workstream 1 (T-E01..03, T-C08), uncommitted, 52 paths |
| `C:\wt-bn\small-fixes` | `perf/small-fixes` | `dde9e92` | Workstream 2 (T-A08, T-D04, T-E05, T-B07, T-E06), uncommitted, 12 paths |
| `C:\wt-bn\entry-prefetch` | `perf/entry-prefetch` | `dde9e92` | Workstream 3 (T-C01..03), uncommitted, 31 paths |
| `C:\wt-bn\read-lane` | `perf/read-lane` | `dde9e92` | Workstream 4 (T-C05, T-C04 partial), uncommitted, 31 paths |

The four `perf/*` branches have no commits of their own; they exist only to hold isolated working trees. They and the `C:\wt-bn\*` directories can be removed after approval (`git worktree remove`, `git branch -D`).

## 2. How integration was done

1. Each workstream's uncommitted changes were extracted as a patch (`git add -A`, `git diff --cached --binary`, `git reset`) into the orchestrator's scratch folder and applied to the integration tree with `git apply --3way`, in the order bundle-structure, small-fixes, read-lane, entry-prefetch.
2. Conflicts: read-lane vs bundle-structure (2 import lines: `costBook.ts`, `revenues/hooks.ts`, resolved by union); entry-prefetch vs the rest (`useCostBook.ts` 1 block, `finance/hooks.ts` 4, `revenues/hooks.ts` 8). The implementers wrote the recommended resolutions (`_stage3/small-fixes-useCostBook-resolution.md`, `_stage3/read-lane-hooks-resolution.md`); the orchestrator applied them with a byte-preserving script and checked each with typecheck and the tests.
3. The integration tree's index is clean (nothing staged); the changes are working-tree modifications.

## 3. Incidents

- `git worktree add -b … origin/RounakDev1` made the integration branch track `origin/RounakDev1`; the upstream was unset immediately so a bare `git push` could not target it.
- The `node_modules` junctions were created with a lowercase drive letter, which broke vitest ("failed to find the runner") in the worktrees that used them and caused stalls; fixed by re-creating each link with the uppercase target. The shared install itself was never changed.
- Four implementation agents stalled or were stopped by a session restart and were resumed; none of their worktree contents was lost.
- Vitest rewrites one tracked snapshot with LF endings after a run; restored from git each time.

## 4. Other branches seen (not touched)

`origin/*` feature branches, `azure/develop` (carries the D165 snapshot), and the D165 branch history that was merged into `RounakDev1` (`dde9e92`).

## 5. Suggested commit structure (after approval)

Following the brief and project conventions (no co-author trailer, per the user's standing rule):

1. `perf: restructure imports to shrink first-visit bundles` (T-E01, T-E02, T-E03, T-C08)
2. `perf: small fixes and a corrected Check List benchmark` (T-A08, T-D04, T-E05, T-B07, T-E06)
3. `perf: prefetch screen reads at boot and on intent` (T-C01..03)
4. `perf: bound id-chunk reads and keep reference data cached` (T-C05, T-C04)
5. `docs: bottleneck identification, strategy and Stage 3 results`

The splits above correspond to the four workstreams; because the integration tree contains hand-merged files, splitting into those commits would need `git add -p` or re-applying the patches, so a single commit may be simpler.
