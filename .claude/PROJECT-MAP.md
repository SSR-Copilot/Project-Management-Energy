# Project map — four layers, which one to trust

This repository holds four layers describing overlapping but different scopes of the same
migration. They were never fully reconciled with each other. Knowing which one answers which
question is the first thing to get right in any session here.

| Layer | Path | What it is | Trust it for | Staleness |
|---|---|---|---|---|
| 1. Reference build | `VSBCloud-Code-App-Skeleton/vsbcode/` | A complete, **mock-mode-only** implementation: 23 screens, `admin/`+`pm/`+`cost/` phase split, 9 named gates, `src/security/matrix.json`. Never connected to real Dataverse. | Architecture ideas, harness methodology, the Power-Fx-to-TypeScript concordance pattern | Frozen deliverable, not updated |
| 2. Screen specs | `migration-plans/` | Per-screen build specs (23 files under `migration-plans/screens/`) written to let a *fresh* session implement a screen from the plan alone. Formalizes layer 1's architecture as the target. Its own docs explicitly call `ProjectCosts-CodeApp/app/` "evidence only, not the implementation target." | The intended business-rule breakdown per canvas screen, PCF/flow inventories | Static; 4 of 23 screens (Admin Milestones, Admin Contract, Admin Cost, Project General Milestones) are formally blocked — the Power Automate flows their canvas formulas call are missing from the solution export entirely |
| 3. Real build's own log | `ProjectCosts-CodeApp/docs/00-ANALYSIS.md` … `06-DEMO-COMPLETION-PLAN.md` | The actual app's historical decision log | *Why* a decision was made, the canvas-bug register (`01-BUGS-FOUND.md`), open decisions (`02-OPEN-DECISIONS.md`) | **Visibly behind the code.** `03-STATUS.md`, `05-SCREEN-TRACKER.md` and `06-DEMO-COMPLETION-PLAN.md` have all been caught describing earlier states than what's actually built — e.g. calling Add Cost from Table a stub when it is fully implemented with a real-incident-driven safety mechanism |
| 4. Code-derived baseline | `codeapp-knowledge-base/` | A snapshot read from the actual source of `ProjectCosts-CodeApp/app/`, dated in `00-README-INDEX.md`, explicitly logging where it disagrees with layer 3 | **"What is true right now" in the real app** — the layer to check first for current state | Re-verify against source if the snapshot date is more than a few days old |

Plus two pieces of raw migration source, read-only:

- **`Existing Solution/`** — `VSBCloud (3).zip` (the Dataverse solution export: both canvas
  `.msapp` files, 17 flow definitions, 11 plugin assemblies) and
  `VSBCustomComponents_1_0_115_managed.zip` (the managed PCF solution), plus
  `PCF Git Repo Clones/` (the two custom PCF controls' own source repos).
- **`ProjectCosts-CodeApp/_extracted/`** — those same zips already unpacked, used as the
  canvas-formula reference when porting a screen. Never modify.

## The real app, concretely

`ProjectCosts-CodeApp/app/` is **not** the skeleton and does **not** follow its architecture:
no `admin/`/`pm/`/`cost/` phase split (flat `src/features/<slug>/`), no `security/matrix.json`,
no nine-gate script, no mock backend — it reads and writes **real Dataverse** in
`VSBCloud_Dev` (environment `be41add6-6f60-ebb0-9c73-2480d6bc615d`, app id
`807a2fba-665c-40f3-b158-ffe822aa7da4`).

Canvas screen coverage (18 Project Management + 5 Project Costs = 23 real screens in the
source; a couple of `Screen1`/`Screen2` entries per app are unused canvas scaffolding, not
real screens):

- **Built, with live Dataverse writes**: Project Overview, CAPEX/DEVEX, Add Cost from Table,
  OPEX, Land Lease, Contracts (all five Project Costs screens, plus the one Project Management
  screen needed to land on a project — `project-overview`, ported from PM's "Project Main
  Screen").
- **Placeholder**: General Data (`features/general-data/`) — PM's "Project General Data
  Screen," reached via Edit Project. Explicitly the next screen scheduled for build.
- **Stays pure canvas, by design, for this phase**: the other 17 Project Management screens
  (Admin CAPEX Accounts, Admin Contract, Admin Cost, Admin Milestones, Admin Project Default
  Checklists, Admin Project Gates Approvals, App Loading, Grid Operator, Project Finance,
  Project General CheckList, Project General Milestones, Project General Team, Project
  Generators, Project Planning, Project Production, Project Revenues). The code app only pulled
  in what's needed to make the PM → Costs deep link work (`Edit Costs` / `Edit Project` from the
  canvas PM app).

## When you need to port or touch a canvas screen not yet built

1. Check `codeapp-knowledge-base/06-module-project-overview.md` through `12-...` and
   `ProjectCosts-CodeApp/docs/05-SCREEN-TRACKER.md` for current status — reconcile any
   disagreement in favour of the actual source.
2. Read the canvas source in `ProjectCosts-CodeApp/_extracted/msapp/<app>/Src/<Screen>.pa.yaml`.
3. Use `migration-plans/screens/0NN-<slug>.md` (if it exists for that screen) and
   `VSBCloud-Code-App-Skeleton/vsbcode/src/features/{admin,pm,cost}/<slug>/` as a **reference**
   for the rule breakdown and test shape — but re-derive against the real app's own conventions
   (`.claude/CONVENTIONS.md`), entity names (`ProjectCosts-CodeApp/reference/*.json`), and data
   layer (`app/src/data/`), not by copy-pasting the skeleton's code — its entity set names,
   privilege model, and folder structure don't match this app.
4. Follow `.claude/MIGRATION-STRATEGY.md` for the actual porting steps used in this app.
