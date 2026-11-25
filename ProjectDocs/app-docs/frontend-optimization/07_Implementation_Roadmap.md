# 07 — Implementation roadmap (Stage 3)

Stage 2, 25 Nov 2026. **Not started; requires approval of `06` §3 and the gates in `06` §4.**
Every batch follows the repository's standing rules:
- `aria-label` and `data-testid` are unchanged or added (rule 16);
- the canvas YAML is checked for every touched control;
- reuse comes from `@/components` (`useStableCallback`);
- `[VSB]` tracing stays as it is (rule 23);
- `13-CODE-APP-IMPROVEMENTS-OVER-CANVAS.md` gets a new §1.6;
- decision **D162** goes into `02-OPEN-DECISIONS.md`, and bug **CA-31** into `01-BUGS-FOUND.md`;
- the E2E parity question is asked before any commit;
- **no commit, merge or push without your explicit approval.**

## 1. Batches

| Batch | Findings | Files (owner) | Depends on | Parallel? |
|---|---|---|---|---|
| **B0** Measurement | — | `src/test/renderProbe.tsx` (a `<Profiler>` count helper, following `checklistVisit.bench.test.tsx`); `scripts/bundle-report.mjs` (startup bytes and named chunks) | — | first |
| **B1** Correctness and shared state | FE-C1-02, FE-SH-01 (+C2-04), FE-SH-02, FE-SH-06, FE-SH-08, FE-SH-07 | `app/Providers.tsx`, `app/queryStructuralSharing.ts` (new, pure), `App.tsx`, `components/CommandSlot.tsx`, `features/shared/report-problem/`, `app/queryLog.ts`, `features/cost/add-costs-from-table/Screen.tsx` (FE-C1-02 line only) | B0 | sequential: orchestrator, shared files |
| **B2** Bundle and loading | FE-C1-01, FE-SH-04, FE-SH-05, FE-P2-05, FE-P2-06, FE-AD-07, FE-P1-01 | `vite.config.ts`, `src/platform/formulaParserStub.ts` (new), moved helpers (`data/countryInflation.ts`, a shared PM module, the CAPEX account read), `general-data/Screen.tsx` (loader call only) | B0 | sequential: orchestrator, owns config |
| **B3** Cost UI | FE-SH-03 (D-3), FE-C1-04, FE-C1-09, FE-C2-01, FE-C2-02, FE-C2-03, FE-C2-05, FE-C2-06 | `app/routes.tsx` (Cost routes only), `features/cost/**` | B1 (uses identity-stable data) | parallel with B4 and B5, in its own worktree |
| **B4** PM UI | FE-P2-01, FE-P2-02, FE-P2-03, FE-P2-08, FE-P2-09, FE-P1-02a, FE-P1-03, FE-P1-04 (D-5), FE-P1-05 | `features/pm/**`, `platform/azureMapsToken.ts` | B1, B2 (General Data loader) | parallel with B3 and B5 |
| **B5** Admin UI | FE-AD-01, FE-AD-02, FE-AD-03, FE-AD-05, FE-AD-06 | `features/admin/**` | B1 | parallel with B3 and B4 |
| **B6** Independent QA and close-out | — | docs `08`–`11`, file 13 §1.6, D162, CA-31 | B1–B5 | last |

**Shared-file ownership:**
- B3, B4 and B5 each edit only their own feature tree.
- `routes.tsx` is edited only by B3, and only the Cost block.
- No batch edits `components/` except B1 (`CommandSlot.tsx`).
- `useStableCallback` is used as it is, not changed.

Agents work in separate git worktrees and their patches are merged by the orchestrator, as in D160. No two agents touch
the same file.

## 2. Per batch: method, tests, rollback, done

**B0 Measurement.**
- **Implementation:** a render probe counts commits and renders per named subtree. The bundle script reads
  `dist/index.html` and `dist/assets`.
- **Tests:** UT for the script's parsing.
- **Rollback:** delete the new files.
- **Done when:** the baseline render counts for every B1–B5 scenario (list in §3) and the bundle baseline (`05` §1) are
  recorded in `09`.

**B1 Correctness and shared state.**
- **FE-C1-02, test first:**
  - Write a failing jsdom test: a sheet is edited, an equal but new `project` arrives, and the edit must survive.
  - Then change the dependency to `Boolean(project)`.
- **FE-SH-01:** a pure `structuralSharingWithDates(old, next)`.
  - Unit tests:
    - equal Dates keep the old reference;
    - a changed Date replaces only its branch;
    - arrays, nulls and nested objects behave exactly as `replaceEqualDeep` does;
    - a property test against `replaceEqualDeep` on Date-free data.
  - Set it in the `QueryClient` defaults.
  - Run the full suite, since every query passes through it.
- **FE-SH-02, FE-SH-06:** render-count tests (the screen does not render when the report panel opens; the command bar
  mounts once).
- **FE-SH-08:** tests that the report built on open contains the latest error, and that the icon appears when an error
  is traced.
- **FE-SH-07:** a test that a cancelled fetch closes its `[aN]` scope. Record the format note in D74.
- **Rollback:** each item is one isolated change. FE-SH-01 can be reverted by removing one default line.
- **Done when:** `npm run verify` is green, the new tests pass, and the render counts are recorded.

**B2 Bundle and loading.**
- **FE-C1-01:** add the stub and the alias. Tests:
  - the sheet loads, edits and pastes as before;
  - a typed `=x` shows as typed;
  - Copy Table and Save read back unchanged.

  Record the DIVERGENCE (D-2) in D162 and file 13.
- **FE-SH-04 / FE-SH-05:** the `treeshake.moduleSideEffects` rule and the core-only Fluent list, found by inspecting the
  build.
  - Check that every lazy screen still renders in the jsdom screen tests, and that the canvas-identity and label gates
    still pass.
  - Compare the bundle report with the baseline.
- **Module moves (FE-P2-05/06, FE-AD-07):**
  - Move each helper, not copy it (rule 17), and re-export it from the old place.
  - Confirm with knip that nothing became unused.
  - Run the duplicate check.
- **FE-P1-01:** a test that the loader is called before the reads resolve.
- **Rollback:**
  - `vite.config.ts` changes are config-only.
  - The stub alias is one line.
  - The moves leave re-exports, so callers are untouched.
- **Done when:** `verify` is green, the bundle report shows startup ≤ 1,140 kB minified and Add Cost ≤ 75 kB minified,
  and knip reports no new unused files.

**B3, B4, B5 UI batches** (the same method for each finding):
1. Re-read the original code and its canvas YAML (rule 16 and item 2 of "Before every build").
2. Add a render-count test that shows the current re-render (it fails against the target count).
3. Make the change: a memoised row or child, stable handlers through `useStableCallback`, or a local draft.
4. Run the screen's existing jsdom and rules tests unchanged: behaviour, labels, test ids, dirty guards and save
   payloads.
5. Record the before and after counts.
6. For FE-SH-03 (D-3): first read D51 §11.19 and CA-13, and `useSavePaintMark`. If the CAPEX refresh after a save relies
   on the remount, keep the remount and defer the item.
7. For FE-C1-04: run the Wirmighausen safety-net tests (`identityRoundTripFailures`, `prepareSheetSave`) unchanged.

- **Rollback:** each finding is a separate change in one feature folder.
- **Done when:** the batch's tests and the full `verify` are green on the merged tree.

**B6 Independent QA.**
- **Review:** a reviewer agent that did not implement any batch reviews the full diff against `06` and the standing
  rules: behaviour preserved, labels and test ids, no new unused files, and no `memo` without a named render it prevents.
- **Fixes:** findings are fixed and re-verified.
- **Final gates:** a final `npm run verify`, the bundle report, and knip plus the duplicate check.
- **Docs:** `08`–`11`, file 13 §1.6, D162 and CA-31.
- **Approval:** the E2E parity question, then a commit-approval request.

## 3. Render scenarios measured in B0, then again after each batch

| Scenario | Batch | Expected before → after |
|---|---|---|
| Equal session project refetched (new object, same values) | B1 | whole app re-renders → 0 screen renders |
| Add Cost sheet open, equal project refetched | B1 | sheet re-hydrated, edits lost → edits kept, 0 sheet rebuilds |
| Report panel opened | B1 | active screen renders → 0 |
| Overview mounted | B1 | command bar mounted twice → once |
| Admin gates: one status-pill toggle | B5 | 5–7 table renders over all rows → 1 row |
| Admin checklists: 10 keystrokes in the drawer | B5 | 10 × every open task table → 0 table renders |
| Finance: 10 keystrokes in a tranche panel (2 tranches open) | B4 | 10 × gallery → 0 gallery renders |
| Finance: 1 repayment keystroke (25 years) | B4 | 26–31 row renders → 1 |
| Production: 10 keystrokes in a left-column field | B4 | 10 × 27 rows → 0 |
| Check List: 10 comment keystrokes | B4 | 10 × all task rows → 0 |
| Contracts: 10 Description keystrokes | B3 | 10 × card list + picker → 0 |
| Land Lease: one fold click (3 cards open) | B3 | 3 cards → 1 |
| CAPEX → Add Cost from Table → Cancel | B3 | 2 CAPEX mounts → 0 (if D-3 holds) |

## 4. What still needs a browser after Stage 3 (DEV smoke, owner)

Commit milliseconds, heap and WebGL context checks cannot run here (`01` §6). Suggested routine on DEV after a push:

1. **React Profiler (DevTools):** record typing 10 characters in the Finance tranche panel, the Check List comment and
   the admin checklist drawer, and one gates pill click. Record the commit milliseconds in `09`.
2. **Memory tab:** 20 round trips General Data ↔ Generators, then a heap snapshot. Check that there is no growing
   `atlas.Map` or WebGL context.
3. **Network tab, cold cache:** startup bytes on `/projects`, and the first Add Cost from Table open.
4. **Add Cost from Table:** edit cells, switch to another browser tab for more than 5 minutes, then return. The edits
   must still be there.
