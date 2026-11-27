# 31 — Independent QA report

> Stage 3, 27 Nov 2026. An independent, read-only reviewer who had not seen the implementers' reasoning read the full diff of the integrated tree and every new file, built a static import closure of `src/main.tsx` for base and tree, and compared the test diffs with base. The full report is `_stage3/independent-qa-report.md`; this document records the verdict and the orchestrator's disposition of each finding. The reviewer ran no tests, builds or knip; those are in doc 27.

## 1. Verdict

**No BLOCKER and no MAJOR.** Write order, owning-business-unit binds, existence guards and canvas-sourced strings are untouched (the only write-path edits are import moves; `CAPEX_CONTRACTS` and `CAPEX_COSTS` keep object identity through the re-export). Prefetch keys and functions are shared factories, so key drift is structurally excluded and the key-equality tests exercise the real hooks. The read lane has no nesting or deadlock, preserves result order and first-failure semantics. No Cost module uses the reference tier, so D51 patching of an unmounted book is unaffected. The hand-merged files (`costBook.ts`, `revenues` and `finance` hooks and factories, `useCostBook.ts`, `pmScreenPrefetch.ts`) are correct; `chunk` and `eq` are genuinely unused in `costBook.ts`.

## 2. Findings and disposition

| ID | Sev | Finding | Disposition |
|---|---|---|---|
| F1 | MINOR | Start-up closure grew 302.0 to 303.9 KiB gz (8 to 12 files). Exactly five modules entered the static closure: `useRailIntent.ts`, `entryPrefetchFlags.ts`, `queryPolicy.ts` (via `countries.ts`), `readChunks.ts` and `readLaneFlags.ts` (via `currentUser.ts`); about +1.1 KiB is bundler re-chunking of `requestLog` / `telemetry` | **Open, recorded as an exception** (file 13 and doc 26). Cheap partial offset proposed (drop the lane from `currentUser.ts` and the preset import from `countries.ts`, about -0.4 to -0.5 KiB; the re-chunk part is unverified): not applied, because it would not meet the criterion and removes lane coverage from one site. Owner decision |
| F2 | MINOR | Test ids UT-BOOT-COST-010..013 used in two files | **Fixed**: `costScreenPrefetch.boot.test.ts` renumbered to 050..055; both files re-run, 18/18 pass |
| F3 | MINOR | The read lane is shared app-wide and counts chunks: a large read delays other adopted reads, including the Add Cost save's `refreshSnapshot` (D51 latency budget); no request has a timeout, so 16 hung requests would wedge all lane reads until reload | **Open**: latency only, large projects only; probe P-4 and a measurement of Add Cost save timing on DEV are the planned check. Mitigation options (per-slot watchdog; keep Add Cost save reads off the shared lane) noted for Wave 3. `READ_LANE` switch is the rollback |
| F4 | MINOR | UT-ADCHK-902 lost its assertion; nothing pins the empty or failed tab-list case (locks and clusters now still run) | **Open (accepted)**: the loss is legitimate (T-E05); proposed follow-up: make 902 assert the new fact |
| F5 | MINOR | General Data's Draft-approval cancel now loads `data/checklist` lazily inside its `try`; a chunk-load failure would skip the cancel (logged with its cause) and the save continues, leaving an approval flow alive for a cluster the project has left | **Open, known residual risk, flagged for the owner**: the canvas also swallows a failed cancellation (`IfError(…, false)`); the new element is only the chunk-load failure. Mitigation options: warm the chunk when the start cluster is edited, or retry the import once |
| F6 | MINOR | `INTENT_MAX_IN_FLIGHT = 4` bounds screens, not requests; prefetchers do not use the lane | **Open**: only matters if `INTENT_PREFETCH_DATA` is switched ON (default OFF). Condition recorded: cap requests before enabling |
| F7 | NIT | Re-arming the dwell when the pointer moves between an entry's icon and label | **Open**: chunk-only today (cached import); with data ON the 30 s dedupe bounds it |
| F8 | NIT | Production snapshot shows as modified | **Fixed** (line endings only; restored from git) |
| F9 | NIT | `productionAssumptionsQueryOptions` does not spread `REFERENCE` | **Open (accepted)**: same as base, not a regression; owner may extend |
| F10 | NIT | `UT-ACSHEET-REF-001/002` pass trivially (the cost book never uses `REFERENCE`); the real guard is `UT-QPOL-004` | **Accepted** |

## 3. Reviewer's answers to the priority questions

Behaviour regressions: none found. Prefetch correctness: confirmed; no `refetchOnMount: "always"` key prefetched; all switches OFF restore the old path; `INTENT_PREFETCH_DATA` defaults OFF. Authorisation: prefetches run under the signed-in user's own rights and only for a project id validated as a GUID; admin chunks are downloaded on hover or deep link whether or not the user is an admin (chunk bytes only). Module moves: no circular import, mocks repointed, no side effect lost; the allow-list hides 32 existing edges by design. Test quality: new tests assert real behaviour; the wave tests prove the ordering claim, not Dataverse latency. Convention gates: no new interactive control, no bare `console.*`, no change in `src/generated`, `.power`, `package.json`, `vite.config.ts`, `power.config.json`.

## 4. Measurement claims (reviewer's view)

The per-screen KiB and start-up figures were reproduced from reports only (the reviewer did not rebuild); the KiB deltas are plausible from the code. "Requests unchanged" holds for the wave tests but not strictly for prefetch in general: a wrong category guess, an Add Cost deep link to the Summary and the PM extras can read data the screen then does not use. "Start-up must not grow" is **not met**. These figures were re-measured by the orchestrator on the final build (doc 26); the per-screen sizes on the combined tree were not.

## 5. Limits

Read-only review; no run; the splash not seen in a browser; F1(c) and F3 impact are inferences. The final full-suite result (501 files, 8,379 tests) was produced after the review (doc 27).
