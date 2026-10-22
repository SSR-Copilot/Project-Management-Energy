# Session handoff — 22–23 Oct 2026: Application Settings follow-up, rail fix, DEV push

Start a new chat by reading this file, then `09-APPLICATION-SETTINGS-PORT-OPEN-POINTS.md` (its
"Progress" section) and `02-OPEN-DECISIONS.md` **D36** and **D37**. Re-check the code before you
trust any line here.

## State at hand-off

| | |
|---|---|
| `master` | `0fd2f95`, pushed. Clean except `power.config.json`, which shows as modified but has an empty diff (line endings only, rewritten by `pac code push`). Leave it or `git checkout -- ProjectCosts-CodeApp/power.config.json`. |
| `RounakDev1` | `6a73ffa`, pushed; one commit behind `master` (the D37 doc only). |
| Deployed to VSBCloud_Dev | App `807a2fba-665c-40f3-b158-ffe822aa7da4` ("Project App"), built from `6a73ffa`, 22 Oct 2026, profile `ServiceAccount_DEV`. The push was accepted. |
| Last `npm run verify` | Exit 0 in one run: 81 tables, 145 files, 3,859 tests, build OK. |
| Dev servers | None started by this session. |

## Commits this session (all on `master`)

| Commit | What |
|---|---|
| `e8aaea5` | Canvas traceability restored on the six admin screens (canvas-named ids about 3 → 177, all verified; aria-labels from the canvas `AccessibleLabel` or caption, no record data; verbatim citations; `DIVERGENCE` / `SOURCE DEFECT` markers). `check-canvas-identities.mjs` tightened (`closeTestId`, `toggleTestId`, `<name>-<ItemKey>` ids, `SettingsTabStrip`, `SearchCombo`). Test-only checklist-approval repository methods removed. D36 written. Instruction docs updated. |
| `1df9af1` | Deleted the orphaned `components/ReorderList.tsx` and `components/reorder.ts`. |
| `6a73ffa` | Collapsed admin rail fixed (bug CA-1 in `01-BUGS-FOUND.md`): flat icon list per the live `pcf_Left_Navigation_Menu.Items` formula; group headers become empty rows. Test `UT-RAIL-003`. Made on `RounakDev1`, fast-forwarded into `master`. |
| `0fd2f95` | D37: the DEV push record, with checklist step 5 (local smoke test) waived. |

**Test ids changed on purpose (e8aaea5).** The port's kebab-case ids on the admin screens were
replaced by the canvas control names Tosca recorded. Anything recorded against the kebab ids
must be re-pointed. Lists per screen are at the code sites; the summary is in D36 §6.

## Waiting on the product owner

1. **Smoke test the deployed app** (D37): the six admin screens (add, edit, delete, reload) and
   the collapsed rail on Checklist settings. Nothing was clicked through against live data
   this session.
2. **D36 §4:** keep or revert each behaviour that differs from the canvas.
3. **D36 §5:** the disabled Apply bars on Contract and Cost contradict D20. Remove them, or amend D20.
4. **D36 §6, contradictions with earlier decisions:**
   - the Gates Reset Gate confirmation vs D22;
   - the Gates non-Wind/PV banner dropped vs D22;
   - the Gates blank-checklist wording vs D22;
   - CAPEX subaccount reorder (2 or more rows) vs D19;
   - Cost DEVEX trimming vs D24.
5. **CA-1:** keep the canvas's empty rows for the group headers in the collapsed rail, or use a divider or nothing.
6. **Labels still containing record data** for lack of a canvas caption (D36 §6), and the panel ✕ label ("Close panel" vs the canvas "Home" / "Cancel").
7. **Coordination:** the Dev app is shared by every branch (09 §6). This push replaced whatever was deployed before it.

## Next (no decision needed)

1. **Shared-component test-id props** (D36 §6), additive with today's defaults: `ConfirmDialog`
   (root, Confirm, Cancel), `LoadingOverlay`, `FormPanel` title, `ScopeHeaderBand` title,
   `SettingsAccordion` root and header, `ReorderPanel` close and list, a `StatusPill` aria-label
   override, `CollapsibleCard` header and body, and field validation messages. Then wire the
   canvas names on the six admin screens.
2. **Restore the ten `…CanvasParity` twins** the port dropped (rule 8; the list is in D36 §6).
3. **Theme tokens** for the hard-coded admin colours (listed in D36 §6).
4. **The rest of the stale docs** (09 §3): about 22 docs reference the replaced admin code. The
   per-file list is in the porting developer's alignment audit, which is not in this repo.
5. **`npm audit`:** `npm ci` reported 4 vulnerabilities (3 moderate, 1 high). They have not been looked at.

## Gotchas found this session

- **`pa app run` failed with "'vite' is not recognized".** `node_modules` had its packages
  but no `.bin` folder or `.package-lock.json`: an interrupted install, likely OneDrive. Fix: stop
  every dev process, then `npm ci`. `pa app run` itself was fine; it is the `npm run dev` it
  spawns that failed.
- **Flaky full runs.** `npm run verify` can fail with "Failed to start threads worker" on 10–15
  files under load (OneDrive). Those files have never failed on a rerun; re-run them with
  `npx vitest run <files> --maxWorkers=2`, then `npm run build`. Say so in the commit if you rely on it.
- **PowerShell exit 255** after `git push` / `git pull` is git writing progress to stderr. Read
  the output, not the exit code.
- **Commit messages in PowerShell:** `git commit -F -` with a here-string does not pipe; write
  the message to a file and use `-F <file>`.
- **A headless check of the UI works without Power context** by rendering one component through
  a throwaway page under the gitignored `out/` folder, served by the running Vite dev server, and
  driving Edge over CDP. The full app stops at "Please wait..." without the host.
- **"Application Insights"** does not exist in this app. The canvas apps ship with
  `appinsightserrortracing: false` and no key, so there is nothing to port.
- **Deleting tracked files:** a plain `Remove-Item` may be refused by the session's permission
  check; `git rm` on the user's explicit request worked.
