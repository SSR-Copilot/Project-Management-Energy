# Stage 3 report: workstream `small-fixes`

Worktree `C:\wt-bn\small-fixes`, branch `perf/small-fixes`, base `dde9e92`. Nothing committed (brief rule 2).

## 1. Tasks

| Task | Finding | Status |
|---|---|---|
| T-A08 | SPA harness | DONE (probe fixed, S7a/S7b/S8 added, baseline pinned in the bench's own assertions) |
| T-D04 | RND-09 | DONE, switch `GATES_TRACE_ONCE` (default ON) |
| T-E05 | SAD-02 | DONE, switch `DEFAULT_CHECKLISTS_REFS_PARALLEL` (default ON) |
| T-B07 | SAD-05 | DONE, switch `CLEANUP_UNLOAD_GUARD` (default ON) |
| T-E06 | SCC-16 | DONE, opt-in option + switch `CAPEX_KEEP_COMMENT_DOTS` (default ON, CAPEX grid caller only) |

Nothing left out. Two spec details differ from the letter of the Stage 2 text (both noted, neither is a behaviour change beyond the spec):
- T-D04 spec test ids UT-ADGATE-920/921 are already taken in `Screen.test.tsx` (mode switch, discard dialog); the new tests are UT-ADGATE-950/951/952. The spec's optional `QueryStates` ref cache (UT-QSTATES-007) was not built: the spec prefers the Gates-only change.
- T-B07 spec names `holdBeforeUnload()` from `components/beforeUnload.ts` (found and reused; no second hook written). Added also the `actionLog("clean up forecast costs", ...)` ACTION line the spec asks for (rule 23).

## 2. Files changed

`git diff --stat` (base `dde9e92`), 11 modified + 1 new:

```
 admin-capex-accounts/Screen.test.tsx        |  61 +++
 admin-capex-accounts/Screen.tsx             |  10 +-
 admin-default-checklists/Screen.test.tsx    |  46 ++-
 admin-default-checklists/Screen.tsx         |   8 +-
 admin-gates-approvals/Screen.test.tsx       |  57 +++
 admin-gates-approvals/Screen.tsx            |  15 +-
 cost/capex-costs/Screen.test.tsx            |  25 +-
 cost/capex-costs/Screen.tsx                 |   5 +-
 cost/costing/useCostBook.dvopt.test.tsx     |  40 +++
 cost/costing/useCostBook.ts                 |   9 +-
 pm/checklist/checklistVisit.bench.test.tsx  | 132 ++++--
 11 files changed, 388 insertions(+), 20 deletions(-)
?? ProjectCosts-CodeApp/src/data/smallFixesFlags.ts   (new, the four switches)
```
(all paths under `ProjectCosts-CodeApp/src/features/` except the new flags file under `src/data/`).

## 3. Switches (new file `src/data/smallFixesFlags.ts`, object `SMALL_FIXES`, mutable for tests like `ADMIN_OPT`)

| Name | Default | OFF means |
|---|---|---|
| `GATES_TRACE_ONCE` | true | the failed-load trace is written in render by `userErrorText` again (one per re-render) |
| `DEFAULT_CHECKLISTS_REFS_PARALLEL` | true | locks and clusters wait for the tab list (`enabled: hasTabs`) again |
| `CLEANUP_UNLOAD_GUARD` | true | no browser leave-page prompt during the CAPEX Accounts clean-up |
| `CAPEX_KEEP_COMMENT_DOTS` | true | the CAPEX screen's `useCapexComments` call does not pass `keepPrevious` (dots vanish while the next key loads) |

The `useCapexComments(ids, { keepPrevious })` option itself defaults to false: the comments panel (`CommentsPanel.tsx:264`) is untouched and keeps today's behaviour.

## 4. Tests added or changed (ids) and results

Added:
- T-A08, bench (opt-in `CHKBENCH=1`): UT-CHKPERF-067 (S7a formal, S7b Only Notifications, x OFF/ON), UT-CHKPERF-068 (S8 Cancel, x OFF/ON); every scenario now ends with `pin(variant, id, result)` against the `PINNED` table (rounds / requests / usable / overlay-gone).
- T-D04: UT-ADGATE-950 (10 re-renders of a failed load = 1 trace entry, same message and cause object, same visible text), 951 (switch OFF: traced per render again, same text), 952 (Try again that fails again = one more trace).
- T-E05: UT-ADCHK-960 (locks + clusters start before the tab list answers, each once; tasks wait for a tab), 961 (switch OFF: they wait), 962 (a failed tab list still shows its error state).
- T-B07: UT-ADCAPEX-960 (`beforeunload` is cancelled while the clean-up runs, released on success), 961 (released on failure), 962 (switch OFF: no prompt).
- T-E06: UT-CAPEXCOM-020 (opt-in: first render of the new key holds the previous threads, `isPlaceholderData`), 021 (without the option another contract's threads are never shown), 022 (the CAPEX screen passes `{ keepPrevious: true }`), 023 (switch OFF: `{ keepPrevious: false }`).

Changed existing test (one, with reason): UT-ADCHK-902 ("no tabs -> empty state and no task or lock query"). Its last assertion (`loadLockedTaskIds` not called) pinned the old `enabled: hasTabs`; the spec (SAD-02 point 8) accepts one extra read on an empty tab list, so the assertion was removed and the title updated; the locks timing is now pinned by UT-ADCHK-960/961. No other test touched.

Results (all from `C:\wt-bn\small-fixes\ProjectCosts-CodeApp`):
- `CHKBENCH=1 npx vitest run src/features/pm/checklist/checklistVisit.bench.test.tsx --maxWorkers=1`: `Test Files 1 passed (1) / Tests 21 passed (21)` (the pins hold; repeats agreed).
- Touched-file batch (3 admin Screen folders, capex-costs/Screen.test.tsx, useCostBook.dvopt.test.tsx): `Test Files 19 passed (19) / Tests 568 passed (568)`.
- `npm run typecheck`: no output after the `tsc --noEmit -p tsconfig.app.json` banner (0 errors).
- `npm run lint`: 26 warnings, none in a changed file that is new: the two `preserve-manual-memoization` warnings in `capex-costs/Screen.tsx` exist identically on the base file (checked by linting `git show HEAD:` of it); the remaining warnings are in untouched files.
- `node scripts/check-control-labels.mjs`: `control-labels: 0 missing, 0 duplicate test ids, 48 aria-label warnings, 2 ignored`.
- `node scripts/check-canvas-identities.mjs`: `canvas-identities: C1 unknown 0, C2 foreign 0, C3 type 0, C4 label 0, C5 unverified 0`.
- `npm run check:power`: `power-sources: 96 registered, 0 problems`.
- `npm run build`: `built in 14.08s`, exit 0 (the usual >500 kB chunk notice only).
- Full vitest on the integrated bundle-structure + small-fixes + read-lane tree (orchestrator, 27 Nov 2026): Test Files 497 passed | 1 skipped (498); Tests 8331 passed | 21 skipped | 3 todo; 534 s; typecheck, lint (exit 0), check-control-labels (0 missing), check-canvas-identities (all 0), check:power (96 registered, 0 problems) clean. Not run in my own worktree (a split full run there was abandoned when the machine stalled; only the touched-file batches above ran here).

Load-sensitive: the machine was heavily loaded (import times of 30-170 s per file); one `Failed to start threads worker ... Timeout waiting for worker to respond` happened on `capex-costs/Screen.test.tsx` in a combined run and the file passed alone (89 tests). The bench is wall-clock sensitive by design (opt-in).

TOOLING FINDING (affects every worktree): with the `node_modules` junction target stored as lower-case `c:\Personal\...`, vitest (any pool but vmThreads) fails every test file with `Vitest failed to find the runner` / `Cannot read properties of undefined (reading 'config')` (two copies of vitest, one per drive-letter case); `vmThreads` loads but breaks the jest-dom matchers. Re-creating the junction with an upper-case drive letter (`New-Item -ItemType Junction -Path node_modules -Target 'C:\Personal\...\node_modules'` in PowerShell; `cmd mklink` from Git Bash produced a broken target) fixed it. No files were reinstalled; the target is the same shared install.

## 5. Before / after measurements (machine-independent logical counts)

Command: `$env:CHKBENCH="1"; npx vitest run src/features/pm/checklist/checklistVisit.bench.test.tsx --maxWorkers=1` (LAT 120 ms per hop, logical rounds; `CHKBENCH_OUT=<file>` for the JSON incl. the ordered `label@depth` strings).

T-A08, the probe: the session-project probe was `qk.project(id)` costing hops `[1, 3]` (4 requests, the Cost app's full load); on a PM route the real query is `qk.projectPm(id)`, 1 request (`SessionContext.tsx`, `PM_ROW_ONLY_PROJECT_LOAD`). Now `qk.projectPm`, 1 hop of 1 request, seeded as in the app.

| Scenario | Variant | Before (4-request probe) rounds / requests | After (1-request probe) rounds / requests |
|---|---|---|---|
| S1 visit (usable@) | OFF / ON | 6 / 10 (usable@6) ; 4 / 9 (usable@4) | unchanged |
| S2 first visit, 10 templates | OFF / ON | 11 / 29 ; 6 / 22 | 11 / **26** ; 6 / 22 |
| S2 first visit, 40 templates | OFF / ON | 14 / 59 ; 8 / 52 | 14 / **56** ; 8 / 52 |
| S3 Complete a task | OFF / ON | 4 / 11 ; 3 / 3 | 4 / **8** ; 3 / 3 |
| **S4 Move to next cluster** | OFF | 16 / 43 | 16 / **37** |
| **S4 Move to next cluster (shipped)** | **ON** | **11 / 37** | **11 / 34** |
| S5 Refresh | OFF / ON | 3 / 10 ; 2 / 9 | unchanged |

Verdict on the Stage 2 derivation: the shipped Move is **34 requests (was 37), rounds unchanged at 11**; Stage 2's "about 34, rounds unchanged" is confirmed by running the bench before and after. The ON column changes only for S4 (the one shipped scenario that reloads the session project); the OFF column wherever the session project is reloaded (S2, S3, S4).

New baseline for the scenarios T-A08 adds (identical OFF and ON: no D150 switch touches them), with the stubbed flows (gate flow 5 hops, cancellation flow 3 hops, the transition poll stubbed to answer "completed" at once, so it costs one read; real time 1.5 s sleep, no extra round):

| Scenario | rounds | requests | overlay-gone@ | Order (shipped) |
|---|---|---|---|---|
| S7a Request Approval, formal | 12 | 18 | 12 | history,trackings@1; guard read@2; update@3; flow gate#1..5@4-8; rows@9; note create@10; reload 9 keys (project, trackings, rows, approvals, history, session)@11; approvals#2@12 |
| S7b Request Approval, Only Notifications | 13 | 19 | 13 | as S7a plus one `read tracking` (the poll) @9, rows@10, note@11, reload@12, approvals#2@13 |
| S8 Cancel Approval Request | 9 | 13 | 9 | trackings@1; guard read@2; update@3; flow cancel#1..3@4-6; note@7; reload@8; approvals#2@9 |

Reading for later tasks: in S7a the flow's 5 hops are 5 of 12 rounds; Stage 2's T-A03 step 2 (start the rows read beside the flow) should show `rows@9` moving to `@4`, i.e. rounds 12 -> 11 and the same 18 requests.

No other measurements (the other four tasks change telemetry counts, request start time, a prompt, or a placeholder; no request count changes except T-E05, below).
- T-D04: renders-vs-trace: tests UT-ADGATE-950 (10 re-renders: 1 entry; the Stage 1 bench printed 10).
- T-E05: the locks and clusters reads now start at t0 with the tab list (UT-ADCHK-960); one request fewer on the critical path of a cold entry (DERIVED, as Stage 2); on an empty tab list one extra read (accepted by the spec).

## 6. Draft entries for `13-CODE-APP-IMPROVEMENTS-OVER-CANVAS.md`

Part 1 (cross-cutting) or under the screens named. Status: all **fixed** except where noted. No canvas behaviour changes.

- Cross-cutting / test harness: "Check List visit bench measured the session project as the Cost app's 4-request full load; on a PM route it is the 1-request row load. The probe is corrected (every scenario that reloads the session project reads 3 requests fewer: shipped Move 34, not 37, rounds unchanged) and the bench gained Request Approval (S7a formal, S7b Only Notifications) and Cancel Approval Request (S8) with stubbed flows and pinned counts." Status: fixed (T-A08, SPA harness enabler).
- Application Settings, Project Gates: "A failed load was traced inside render, so every re-render of the error state added a trace entry, a `[VSB] ERROR` line and an Application Insights event (10 renders = 10 entries). It is traced once per distinct error, from an effect; line text and visible text unchanged." Status: fixed (RND-09, T-D04; switch `GATES_TRACE_ONCE`).
- Application Settings, Check List Settings: "The locks and clusters reads waited for the tab list although neither depends on it; they start in the same wave. A failed or empty tab list still shows its own state." Status: fixed (SAD-02, T-E05; switch `DEFAULT_CHECKLISTS_REFS_PARALLEL`). Note: with no tabs configured one extra (unused) read now runs.
- Application Settings, CAPEX Accounts: "Closing or reloading the tab during the background forecast-cost clean-up after a deactivation stopped it half-way with no way to resume. The browser now asks before leaving while it runs (the shared reference-counted prompt); one `[VSB] ACTION` line summarises the clean-up." Status: fixed (SAD-05, T-B07; switch `CLEANUP_UNLOAD_GUARD`). Canvas: the canvas player had no equivalent; improvement over canvas and over the earlier build.
- Project Costs, CAPEX/DEVEX: "The red comment dots of the grid vanished for a moment after a contract was added or deleted (the comments query is keyed by the whole contract-id list). The grid keeps the previous threads until the new read lands; the dots are still filtered through the book's own payments. The comments panel does not opt in, so it never shows another contract's thread." Status: fixed (SCC-16, T-E06; switch `CAPEX_KEEP_COMMENT_DOTS`).

## 7. Risks, decisions, expected conflicts

- No owner decision is needed for these five tasks. All switches default ON as assigned; each is a one-line rollback.
- T-E06 shows the previous category's threads while another category's comments load; they cannot produce a dot because the dots are projected through the current book's payments (`commentCosts(bookLines, referencedCostIds(threads))`), which is the Stage 2 argument. It was not verified in a browser.
- T-B07: the prompt is the browser's generic one (text cannot be set). A user who closes the tab and accepts still loses the rest of the clean-up (unchanged; no Resume exists, not in scope).
- T-D04: the trace is keyed on the error object's identity: a retry that fails again creates a new error and is traced again (UT-ADGATE-952); an identical object reused by a mock would not be.
- Shared-file conflicts expected with the other workstreams: `src/features/cost/costing/useCostBook.ts` (one hook, `useCapexComments`, plus the `keepPreviousData` import; Stage 2 T-B09 also edits this file, trivial merge) and `src/features/cost/capex-costs/Screen.tsx` (two lines near the `useCapexComments` call plus one import). The admin screens, the bench file and the new `smallFixesFlags.ts` are touched by no other known task. `checklistVisit.bench.test.tsx` is the file later Check List tasks (T-A01..T-A03) will re-run: their `PINNED` rows are the numbers above.
- The bench is opt-in and wall-clock sensitive on a loaded machine; the always-on guards are the unit tests listed above.
