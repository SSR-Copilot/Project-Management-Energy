# 26 - Implementation and Rollback Strategy

> Stage 2 (design and planning only), 25 Nov 2026.

## 1. How each task is implemented (the loop, every task)

1. Re-read the finding and the design (docs 15-21); list the files and the callers (grep) and the other workstreams that may touch them (doc 24).
2. Check the four standing items of the project guide: control labels (rule 16), canvas YAML requirements (rule 10; here mostly unchanged), reuse of existing helpers (rule 17), console trace (rule 23).
3. **Write the test first** where the behaviour is a failure path (the failing test is the specification); for a success path, a differential test with the old code as oracle.
4. Implement behind a switch if the change is not purely internal (section 2).
5. Run the task's tests, then `npm run verify` on an idle machine.
6. See the `[VSB]` lines in a real run; record the capture in the tracker (doc 27).
7. Add the improvements-log and decisions-log entries; ask the E2E parity question; **ask for your approval before any commit**.
8. One commit per task (`perf(dataverse): ...`, `fix(dataverse): ...`, `test(dataverse): ...`), no co-author trailer, staged by path.

## 2. Reversibility: the switch pattern the repository already uses

Each behaviour-risky task adds a named constant in a `*Flags.ts` module (`LEASE_GUARD`, `OPEX_GUARD`, `CLEANUP_RESILIENT`, `RETRY_POLICY_V2`, `REQUEST_DEADLINES`, `GLOBAL_GATE`, the per-screen bulk switches), defaulting to the new behaviour only after its DEV test, with the old path kept in code until the wave closes. Eleven such switches already exist from D160; they are listed in its record and this programme follows the same shape. A switch needs no data repair: it changes how a request is sent, not what is stored.

| Task kind | Rollback |
|---|---|
| Internal and pure (T-03, T-05, T-15, T-30 chunk size) | revert the commit |
| New behaviour on a save path (T-01, T-02, T-04, T-07, T-08, T-09) | flip its switch; revert the commit |
| Shared request core (T-10..T-14) | `RETRY_POLICY_V2`, `REQUEST_DEADLINES`, `GLOBAL_GATE` each off restores today's retry, no deadline, per-pool limits |
| Request-count changes (T-20..T-24) | per-item switches; revert the commit |
| Query and payload (T-30..T-33) | constant back to 40; id-list path kept; full payload path kept |
| Bulk (T-40..T-43) | per-screen switch to per-row; Generators flags back to false (that is what they are for) |

## 3. Staged release to DEV (Stage 3, only with your approval)

1. A wave's commits stay local. After the wave gate (doc 23 section 3), you approve a **DEV push** (CONVENTIONS 'Before pushing to DEV': `npm ci`, `check:power`, `verify`, knip and duplicate hygiene, local smoke with `pac code run`, confirm the pac profile and environment, push with the npm Power Apps CLI).
2. Smoke test on DEV of every touched screen; the same capture as the baseline.
3. Bulk and retry changes go to DEV with their switches **off**, then on one at a time with a capture between, so a regression is attributable to one switch.
4. Production is not touched by this programme. Console tracing stays off there (D164); any change to logging must keep it so.

## 4. If something goes wrong

| Symptom | Action |
|---|---|
| a test or DEV capture regresses | flip the task's switch; keep the commit; open a finding in doc 33 |
| a save wrote partial data on DEV | the failure message names what landed (existing `PartialStepError`); use the reconcile described for that save; **orphan rows** from CB-01 (rows with no project or business unit) are found by a read-only query for rows with a null project and listed to you, not deleted by the app |
| a retry produced a duplicate | stop the switch; the duplicate is identified by its client id and removed by hand with your approval |
| a shared file collides with another session | stop; the Orchestrator reconciles in an integration plan you approve; nothing is merged automatically |
| the source branch `RounakDev1` advances | nothing is rebased or merged automatically; options are put to you |

## 5. Constraints that never bend

No schema, relationship, security-role or permission change; no Power Automate flow modified; no business rule or visible string changed; no canvas-parity switch removed; no commit, merge, push or deploy without your explicit approval; no data written by a probe except the read-only ones in doc 18 (P-4 provokes throttling and is run with you present).
