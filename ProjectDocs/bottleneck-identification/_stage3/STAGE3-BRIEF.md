# Stage 3 implementation brief (approved scope: Waves 0-2, tasks with no open decision, probe or browser gate)

Approval: the user approved Stage 3 for the recommended scope on 26 Nov 2026. **Out of scope and NOT to be touched:** T-A04, T-A05, T-D00, T-E08, the SCC-14 chart memo, and every Wave 3-5 task. Do not start anything that is not in your assignment.

## Where things are
- Your own worktree (the ONLY tree you may edit): given in your prompt, under `C:\wt-bn\<name>`, branch `perf/<name>`, base commit `dde9e92`. `ProjectCosts-CodeApp/node_modules` there is a junction to a shared install: do not run `npm ci`/`npm install` in it (if tooling breaks through the junction, report it instead of reinstalling).
- Read-only reference, do NOT edit: the planning docs in `c:\Personal\Code App Mordenization\Project-Management-Energy-WorkDev1-BottleneckOptimization\ProjectDocs\bottleneck-identification\` — especially `18-optimization-architecture.md` (task catalogue), `22-performance-acceptance-criteria.md` (acceptance), `23-regression-and-risk-assessment.md`, `24-rollback-and-contingency-strategy.md`, and the per-finding 12-field specifications in `_stage2/<A..E>-rca-and-strategy.md` (find your task id). Your report goes to `…\_stage3\<name>-report.md` in that docs folder (this is the only file you may write outside your worktree).
- The app rules: `ProjectDocs/instructions/CONVENTIONS.md` and `AGENT-GUIDE.md` inside YOUR worktree (rules 1-23 bind you).

## Hard rules
1. Implement ONLY your assigned tasks, as specified in the Stage 2 documents. If the code in your worktree contradicts the spec, stop on that item and say so in your report instead of improvising.
2. **No git commit, add, stash, reset, checkout of other branches, push, fetch or merge.** Leave your changes uncommitted in your worktree; the orchestrator extracts them. Never touch the other worktrees or `C:\Personal\Code App Mordenization\Project-Management-Energy`.
3. No `pac`, no `pa app run`, no DEV push, no live Dataverse. No edits to `src/generated/`, `.power/`, `ProjectDocs/_extracted/`, `package.json`/lockfile, or any Power Automate/Dataverse artefact.
4. **Preserve behaviour.** Do not remove a validation, calculation or business rule. A visible-behaviour or canvas difference is NOT permitted in this batch: if a task seems to need one, leave it out and report it.
5. **Every behaviour-affecting change sits behind a named constant** in the repo's flags-file pattern (look at `data/*Flags.ts`, `data/bootDvoptFlags.ts`), with the default stated in your assignment, so rollback is one constant. Pure structure/test changes need no switch.
6. **Before-every-build checklist** (AGENT-GUIDE): any new or changed UI control has `aria-label` + `data-testid`; any visible string is verbatim from a `MSG` object; search `@/components`, `data/`, `domain/` for an existing helper before writing a new one (rule 17); every new or changed call is traced with the `[VSB]` helpers in `platform/requestLog.ts` (rule 23) and never with a bare `console.*`.
7. Tests: add or extend tests with ids in the `UT-<AREA>-NNN` style (rule 13), one id per `it()`; keep existing ids stable; do not weaken or delete an existing test to make it pass (if one must change because the code legitimately moved, say which and why).
8. Verification you must run (from `ProjectCosts-CodeApp/` of YOUR worktree), and report the verbatim pass/fail counts: `npm run typecheck`; `npm run lint` (no new warnings); `node scripts/check-control-labels.mjs`; `node scripts/check-canvas-identities.mjs`; `npm run check:power`; `npx vitest run` for the files you touched during development, then ONE full `npx vitest run` at the end; `npm run build`. Other agents are running at the same time on this machine: a jsdom worker timeout or a wall-clock bench miss may be load noise. Re-run a failing file alone before concluding anything; say plainly which results are load-sensitive. Never claim a green you did not see.
9. Measurements: state each benefit as machine-independent counts (requests, waves/rounds, bytes gzip, renders) captured before and after with the exact command; seconds only if recorded live elsewhere. Use `npm run bundle:report` for bytes (build in your own worktree: `dist/` is local to it).

## Report (`_stage3/<name>-report.md`) must contain
1. Tasks done / not done (with reason) — per task id.
2. Files changed (list) and the diffstat (`git diff --stat` plus untracked files).
3. Switches added or reused: name, file:line, default, what OFF means.
4. Tests added/changed (ids), and the verbatim results of every check in rule 8.
5. Before/after measurements with commands.
6. Entries for `ProjectDocs/app-docs/13-CODE-APP-IMPROVEMENTS-OVER-CANVAS.md` (draft text, status fixed/reproduced/proposed, cite the finding and task ids); do NOT edit that file.
7. Risks you found, decisions you think the owner must take, shared-file conflicts you expect with the other three workstreams (`bundle-structure`, `small-fixes`, `entry-prefetch`, `read-lane`).
8. Final reply to the orchestrator: at most 250 words (what is done, check results, what is not done, anything surprising). Do not paste the report.
