# Project map — four layers, which one to trust

This repository holds four layers describing overlapping but different scopes of the same
migration. They were never fully reconciled with each other. Knowing which one answers which
question is the first thing to get right in any session here.

| Layer | Path | What it is | Trust it for | Staleness |
|---|---|---|---|---|
| 1. Reference build (archived) | `ProjectDocs/skeleton-reference/` | **Removed 15 Oct 2026; what remains is archived here.** Was a complete, **mock-mode-only** implementation: 23 screens, `admin/`+`pm/`+`cost/` phase split, 9 named gates, `src/security/matrix.json`. Never connected to real Dataverse. | Architecture ideas, harness methodology, the Power-Fx-to-TypeScript concordance pattern | Frozen deliverable, not updated |
| 2. Screen specs | `ProjectDocs/migration-plans/` | Per-screen build specs (23 files under `ProjectDocs/migration-plans/screens/`) written to let a *fresh* session implement a screen from the plan alone. Formalizes layer 1's architecture as the target. Its own docs explicitly call `ProjectCosts-CodeApp/` "evidence only, not the implementation target." | The intended business-rule breakdown per canvas screen, PCF/flow inventories | Static; 4 of 23 screens (Admin Milestones, Admin Contract, Admin Cost, Project General Milestones) are formally blocked — the Power Automate flows their canvas formulas call are missing from the solution export entirely |
| 3. Real build's own log | `ProjectDocs/app-docs/00-ANALYSIS.md` … `06-DEMO-COMPLETION-PLAN.md` | The actual app's historical decision log | *Why* a decision was made, the canvas-bug register (`01-BUGS-FOUND.md`), open decisions (`02-OPEN-DECISIONS.md`) | **Visibly behind the code.** `03-STATUS.md`, `05-SCREEN-TRACKER.md` and `06-DEMO-COMPLETION-PLAN.md` have all been caught describing earlier states than what's actually built — e.g. calling Add Cost from Table a stub when it is fully implemented with a real-incident-driven safety mechanism |
| 4. Code-derived baseline | `codeapp-knowledge-base/` | A snapshot read from the actual source of `ProjectCosts-CodeApp/`, dated in `00-README-INDEX.md`, explicitly logging where it disagrees with layer 3 | **"What is true right now" in the real app** — the layer to check first for current state | Re-verify against source if the snapshot date is more than a few days old |

Plus two pieces of raw migration source, read-only:

- **`ProjectDocs/Existing Solution/`** — `VSBCustomComponents_1_0_115_managed.zip` (the managed
  PCF solution). `VSBCloud (3).zip` (the Dataverse solution export: both canvas `.msapp` files,
  17 flow definitions, 11 plugin assemblies) and `PCF Git Repo Clones/` (the two custom PCF
  controls' own source repos) are **not in this workspace** — copies live in the sibling
  `VSBCloud_CodeApps/Project-Management-Energy-WorkDev1/Project-Management-Energy-WorkDev1/Existing Solution/`.
  `ProjectCosts-CodeApp/scripts/read-pcf-port.mjs` needs the PCF clones copied here.
- **`ProjectDocs/_extracted/`** — those same zips already unpacked, used as the
  canvas-formula reference when porting a screen. Never modify. The code repo reads it: the
  canvas-identity gate (`msapp/*/Src`) and `pcfCascade.test.ts` (the vendor PCF stylesheet).

Layer 4, `codeapp-knowledge-base/`, is git-ignored and local-only; it is **not present** in this
workspace (checked 19 Oct 2026). Until it is regenerated, read the code itself for current state.

## The real app, concretely

`ProjectCosts-CodeApp/` is **not** the skeleton and does **not** follow its architecture:
no `security/matrix.json`, no nine-gate script, no mock backend, no skeleton data client or
store — it reads and writes **real Dataverse** in `VSBCloud_Dev` (environment
`be41add6-6f60-ebb0-9c73-2480d6bc615d`, app id `807a2fba-665c-40f3-b158-ffe822aa7da4`). The one
skeleton idea it adopted (15 Oct 2026) is the folder split, `src/features/{admin,pm,cost}/<slug>/`.
The whole workspace (code repo and `ProjectDocs/`) is one git repository, branch `master`.
Everything taken out of `ProjectCosts-CodeApp/` in that change is kept, reversibly, under
`ProjectDocs/skeleton-reference/` — reference only, never imported.

Canvas screen coverage (18 Project Management + 5 Project Costs = 23 real screens in the
source; a couple of `Screen1`/`Screen2` entries per app are unused canvas scaffolding, not
real screens):

- **Built, with live Dataverse writes**: Project Overview (`features/pm/project-main`, ported
  from PM's "Project Main Screen") and all five Project Costs screens (`features/cost/*`):
  CAPEX/DEVEX, Add Cost from Table, OPEX, Land Lease, Contracts.
- **Also built and connected (reads and writes)**: the ten PM screens (`features/pm/*`, routed
  `/project/<screen>?projectId=`, D25–D34): General Data (also New Project), Milestones,
  Generators, Production, Cluster Check List, Team, Planning, Grid Operator, Revenues, Finance;
  and the six admin "Application Settings" screens (`features/admin/*`, routed
  `/admin/<screen>`). The admin screens were first connected under D18–D24, then replaced on
  22 Oct 2026 by the RounakDev1 versions (D36; open points in
  `ProjectDocs/app-docs/09-APPLICATION-SETTINGS-PORT-OPEN-POINTS.md`). Still left out: creating
  a project's Teams/SharePoint flow, approval flows that send mail or Teams cards, and the Fabric
  SQL sources (D2). Status per screen: `ProjectDocs/app-docs/gap-analysis/README.md`.
- **Not ported**: PM's "App Loading Screen" — its job (launch parameters, deep-link routing) is
  done by `app/SessionContext.tsx` and the `Landing` route.

## When you need to port or touch a canvas screen not yet built

1. Check `codeapp-knowledge-base/06-module-project-overview.md` through `12-...` and
   `ProjectDocs/app-docs/05-SCREEN-TRACKER.md` for current status — reconcile any
   disagreement in favour of the actual source.
2. Read the canvas source in `ProjectDocs/_extracted/msapp/<app>/Src/<Screen>.pa.yaml`.
3. Use `ProjectDocs/migration-plans/screens/0NN-<slug>.md` (if it exists for that screen) and
   `ProjectDocs/skeleton-reference/features/{admin,pm,cost}/<slug>/` as a **reference**
   for the rule breakdown and test shape — but re-derive against the real app's own conventions
   (`ProjectDocs/instructions/CONVENTIONS.md`), entity names (`ProjectDocs/reference/*.json`), and data
   layer (`ProjectCosts-CodeApp/src/data/`), not by copy-pasting the skeleton's code — its entity set names,
   privilege model, and folder structure don't match this app.
4. Follow `ProjectDocs/instructions/MIGRATION-STRATEGY.md` for the actual porting steps used in this app.
