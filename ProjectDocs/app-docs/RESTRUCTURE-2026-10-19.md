# Workspace restructure — 19 Oct 2026

**Asked for:** one folder holding only the code repo, every instruction / `.md` / `.txt` file in
one folder outside it, and duplicates validated so only the working copy is kept.

## Result

```
Project-Management-Energy-WorkDev2/
  CLAUDE.md                 3-line pointer → ProjectDocs/instructions/AGENT-GUIDE.md
                            (kept at the root only because Claude Code auto-loads CLAUDE.md
                            from the folder it is opened in and that folder's parents)
  ProjectCosts-CodeApp/     the code repo — no .md/.txt files
  ProjectDocs/              everything else
    instructions/           AGENT-GUIDE.md + CONVENTIONS, MIGRATION-STRATEGY, PROJECT-MAP,
                            TESTING-AND-HARNESS, KNOWN-RISKS-AND-DECISIONS
    app-docs/               APP-README.md, 00–07 decision log, requirement/harness docs
    migration-plans/        unchanged content, paths updated
    reference/              dataverse-{entities,attributes}.json
    _extracted/             unpacked canvas source (read by the code repo's canvas gate/tests)
    Existing Solution/      VSBCustomComponents_1_0_115_managed.zip
    skeleton-reference/     the retired skeleton archive
```

## Where each thing went

| Before (under `Project-Management-Energy-WorkDev1/`) | After (under `Project-Management-Energy-WorkDev2/`) |
|---|---|
| `ProjectCosts-CodeApp/app/` | `ProjectCosts-CodeApp/` (copied, 369 files hash-identical; then edited as below) |
| `ProjectCosts-CodeApp/docs/` | `ProjectDocs/app-docs/` |
| `ProjectCosts-CodeApp/README.md` | `ProjectDocs/app-docs/APP-README.md` |
| `ProjectCosts-CodeApp/{_extracted,reference,skeleton-reference}/` | `ProjectDocs/{_extracted,reference,skeleton-reference}/` (`_extracted`: 286 files hash-identical) |
| `.claude/*.md` | `ProjectDocs/instructions/` |
| `CLAUDE.md` + `ProjectCosts-CodeApp/app/CLAUDE.md` | merged into `ProjectDocs/instructions/AGENT-GUIDE.md` |
| `migration-plans/`, `Existing Solution/` | `ProjectDocs/migration-plans/`, `ProjectDocs/Existing Solution/` |
| `app/src/features/cost/capex-costs/pcf/README.md` | `ProjectDocs/app-docs/PCF-RENDERER-PORT.md` |
| `.gitignore` (workspace root) | merged into `ProjectCosts-CodeApp/.gitignore` (now ignores `.power/`, `.env*`, `coverage/`, …) |

## Duplicates — validated, one kept

| Duplicate | Kept | Removed | Why |
|---|---|---|---|
| Security model | `skeleton-reference/docs/SECURITY.md` | `app-docs/SECURITY.md` | Same doc; the kept one is the 1.21.753 update (86 tables / 2,048 grants), the removed one the older 85-table version. It describes the skeleton's `matrix.json`, so it belongs to the archive. |
| Skeleton working agreement | `skeleton-reference/skeleton-app/CLAUDE.skeleton.md` | `skeleton-reference/docs/WORKING-AGREEMENT.skeleton.md` | Same doc; the kept one is the newer version (86 tables, G-A11Y rule 11). |
| Workspace + app `CLAUDE.md` | `instructions/AGENT-GUIDE.md` | both originals | The app copy was a pointer plus a command list; merged into one. |
| `app/README.md` | — | deleted | Unmodified Vite template boilerplate; the real README is `APP-README.md`. |
| Logo PNG | `ProjectCosts-CodeApp/src/assets/vsb-logo.png` | — | Byte-identical copy of the canvas asset, so the build no longer depends on `_extracted/`. |

Checked and **not** duplicates: `skeleton-reference/scripts/check-labels.mjs` (skeleton G-LABEL
text-fidelity gate) vs `ProjectCosts-CodeApp/scripts/check-control-labels.mjs` (aria-label +
data-testid presence gate) — different rules; the archive copy is reference only. Exact
byte-duplicates found by hashing all 841 files are all inside `_extracted/msapp/` (the two
canvas apps ship the same PowerCAT bundles) — a faithful unpack, left as is. The 00–07 status
docs overlap in topic but are dated history, not copies; left as is.

## Code changes (all in `ProjectCosts-CodeApp/`)

- `src/components/VsbLogo.tsx` — imports `../assets/vsb-logo.png` instead of `_extracted/`.
- `scripts/check-canvas-identities.mjs`, `src/test/canvasIdentities.test.ts` — canvas source is
  read from `../ProjectDocs/_extracted/msapp`.
- `src/styles/pcfCascade.test.ts` — compares against the vendor stylesheet in
  `ProjectDocs/_extracted/VSBCustomComponents/…` (hash-identical to the app copy). It used to
  point at `Existing Solution/PCF Git Repo Clones/`, which is not in this workspace, so the
  assertion was silently skipped; it now runs.
- `scripts/read-pcf-port.mjs` — points at `ProjectDocs/Existing Solution/PCF Git Repo Clones/`
  (still absent; copy them from the sibling WorkDev1 folder to use the script).
- Comment-only: doc citations in ~60 source files rewritten to workspace-root paths
  (`ProjectDocs/instructions/…`, `ProjectDocs/app-docs/…`, `ProjectDocs/migration-plans/…`).

All doc citations in `instructions/`, `app-docs/`, `migration-plans/` and the archive README
were rewritten the same way. `VSBCloud-Harness-Plan.md` (input spec) and the rest of
`skeleton-reference/` (frozen archive) were left byte-unchanged.

## Verified from the new location (after `npm ci`)

- `check:power` 38 registered / 0 problems · typecheck 0 errors · lint clean (warnings only)
- control-labels 0 missing / 0 duplicates · canvas-identities C1–C5 all 0
- Vitest **81 files, 2,548 tests, 0 failed** (`--maxWorkers=2`; the default run hit OneDrive
  worker-start timeouts on a cold cache while OneDrive was syncing the fresh `node_modules` —
  test files that timed out pass when run alone) · `npm run build` succeeds

## Not done / needs you

- **Done 21 Oct 2026 (PO approved):** the nested `WorkDev2/Project-Management-Energy-WorkDev1/` is deleted.
  - Before deleting: nothing referenced it, no process ran from it, and the backup zip and the sibling `VSBCloud_CodeApps/Project-Management-Energy-WorkDev1/` (solution zip, PCF clones) were confirmed present. That sibling is KEPT.
  - Seven OneDrive placeholder files deep in its old `node_modules` were still locked by OneDrive sync. Delete the empty remainder in Explorer once OneDrive settles.
  - Full verify after the delete: all 92 test files pass (two timed out under sync load and pass when run alone), and the build is OK.
- (Original note) The old `Project-Management-Energy-WorkDev1/ProjectCosts-CodeApp/app/` could not be moved:
  `npm run dev` (vite) and `power-apps-cli app run` from 16 Oct are still running from it and
  lock the folder. The new copy is verified; stop those two processes, then delete
  `Project-Management-Energy-WorkDev1/` (it holds only that old `app/` and a stale
  `.claude/scheduled_tasks.lock`). Restart dev from `ProjectCosts-CodeApp/`.
- Backup of the pre-restructure state (minus `node_modules`, `dist`, `_extracted`):
  `VSBCloud_CodeApps/WorkDev2-backup-before-restructure-2026-10-19.zip` (594 files).
