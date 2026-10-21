# VSBCloud — harness and implementation plan

**Admin → Project Management → Project Costs, with every screen's Power Fx set against the TypeScript that replaced it.**

Prepared 7 September 2026 · Shakti Singh Rajput, Xebia-IA · project *Power App Code App*

---

## 0. What this document is

A build sequence for the VSBCloud rebuild, from canvas apps to a Power Apps **code app**, and a
test harness to hold it in place. It is organised around the sequence you asked for — admin
screens first, then the Project Management app, then the Project Costs app — and each of the 23
screens carries the same four things in the same order: what it does, what it depends on, **the
Power Fx that ran it beside the TypeScript that now runs it**, and a measurable exit gate.

It supersedes the wave model in `claude/vsbcloud-implementation-sequence.md` on one axis only: the
order the screens are built in, and the position of the Dataverse security workstream. Everything
else in that document still holds, including the standing decision on flows.

Two things it is not. It is not a specification — `claude/vsbcloud-code-app-build-specification.md`
is that. And it is not a claim that the rebuild is finished: the harness in section 6 passes today,
which is a statement about the code that exists, not about the code that still has to be written
against a real environment.

The companion evidence report — `VSBCloud-Test-Evidence-Report.md` — carries the output of the
harness actually being run, in this session, against the repo.

---

## 1. Inputs, and how every number here was measured

Everything quantitative in this document was measured in this session from two artefacts, not
carried over from the earlier project docs.

| Input | What it is | What was measured from it |
|---|---|---|
| `VSBCloud 2.zip` (20.0 MB) | The unmanaged solution export. Contains both `.msapp` archives, 17 workflow definitions, 11 plug-in assemblies, `customizations.xml` | Every Power Fx formula quoted in sections 8–10; block counts; the table lists |
| `VSBCloudCodeAppfinal.zip` | The code app repo, `vsbcode/` | Every TypeScript excerpt; export counts; test IDs; and the harness run |

### 1.1 The Power Fx counting method

`Src/*.pa.yaml` was parsed out of both `.msapp` archives and every `=`-prefixed control property
collected. A **logic block** is one such property with three or more non-blank lines. That yields:

| | |
|---|---|
| Units parsed | **52** — 23 screens, 2 app shells, 27 shared canvas components |
| Logic blocks (≥ 3 lines) | **3,097** |
| Substantive blocks (≥ 10 lines) | **1,657** |
| Blocks of 30+ lines | **548** |
| Lines inside those blocks | **89,804** |
| Lines across all `=` properties | **152,499** |

Two figures are given per screen throughout, because they answer different questions. *Lines inside
blocks* is the logic you have to port. *Lines across all properties* includes the one- and two-line
layout arithmetic and single-field bindings that CSS and component props absorb, and it is the
number the repo's own `rules.ts` provenance headers use — the two agree to the line on every screen
checked, which is the cross-check that the parse is faithful.

The complexity band, score and build-day figures come from `claude/vsbcloud-screen-complexity-matrix.md`
and are reproduced unchanged; that matrix counts Power Fx lines a third way again, so its per-screen
line totals are deliberately not repeated here.

### 1.2 The table lists

`customizations.xml` yields **83** `LocalizedCollectionName` values — the data-source names Power Fx
actually addresses. Every "Dataverse tables" row in sections 8–10 is the intersection of that list
with the identifiers appearing in that screen's blocks. Column logical names are excluded, so the
rows name tables and nothing else.

---

## 2. The sequence decision

You asked for **1 Admin → 2 PM → 3 Cost**. The earlier plan put the six admin screens in Wave 5,
next to last. This is a real change of order and it is the right one, for a reason the data states
plainly.

### 2.1 Admin screens own the master data every other screen reads

Cross-referencing each screen's tables against the six admin screens' write targets:

| Screen | Reads master data owned by |
|---|---|
| Project General Data | Admin Project Gates Approvals |
| Project General CheckList | Admin Project Default Checklists, Admin Project Gates Approvals |
| Project Production | Admin Cost |
| Project Revenues | Admin Cost |
| **Capex Costs** | Admin CAPEX Accounts, Admin Cost, Admin Milestones |
| **Contracts** | Admin Contract, Admin CAPEX Accounts |
| **Opex Costs** | Admin Cost |
| **Land Lease Costs** | Admin Cost |
| **Add Costs from Table** | Admin CAPEX Accounts |

**All five Project Costs screens read tables an admin screen owns.** Build the Cost app before the
admin screens and every one of them is developed against fixtures whose shape is a guess; build the
admin screens first and the Cost app is developed against master data a person entered through the
screen that will maintain it in production. Four Project Management screens are in the same
position. That is the case for the resequence, and it is stronger than the case for the wave model
it replaces.

### 2.2 Admin-first forces the security work forward, which is the second reason

The load-bearing finding in the whole assessment is that **not one of the six admin screens carries
a screen-level permission check, and not one tests `gblCurrentUser` at all.** Two of the six do read
Dataverse privileges per command — `Admin CAPEX Accounts` has 5 `DataSourceInfo` and 17 `RecordInfo`
calls driving its command bar, `Admin Cost` has 1 and 4 — and the remaining four carry no privilege
read of any kind. But nothing anywhere on the six gates entry to a screen or scopes which countries
and technologies a user may edit. The entire master-data surface of the solution is protected by one
repeated `Or(gblCurrentUser.IsApplicationAdministrator, gblCurrentUser.IsControllerOwnData)` on the
left-rail nav items, which is client-side hiding.

In a canvas app that is bad. In a code app it is worse, and the difference is structural: the bundle
is served from a public endpoint, so the nav-item condition is not merely bypassable, it is
readable. `RequireAdmin` in `src/routes/` reproduces the canvas gate and every admin `rules.ts`
carries a warning at the top saying what it is worth. The sentence to keep is the one already in the
repo: **a route guard is not security.**

Building these six screens first therefore has a consequence, and it is the reason to accept the
resequence rather than merely permit it: you cannot honestly ship Phase 1 without the Dataverse
privileges that make the server refuse. Workstream S moves from *gating cutover* to *gating Phase 1*.

### 2.3 What Admin-first costs

Three things, and they should be said out loud.

- **The demo gets less impressive before it gets more impressive.** Six master-data screens are
  what an administrator sees a few times a quarter. There is no portfolio, no project, no financial
  model to show at the end of Phase 1. If a stakeholder demo lands mid-Phase-1, show the harness
  and the security refusal, not the screens.
- **The largest mid-band screen lands early.** Admin Cost is 21 build-days, 193 blocks and 117
  substantive blocks — bigger than nine of the twelve PM screens. Phase 1 is 55 days, and 21 of
  them are one screen.
- **The vertical slice moves.** The earlier plan proved the stack end to end on Grid Operator, the
  lowest-scoring project screen on the complexity matrix. In this order the slice has to happen
  inside Phase 1, so it moves to
  Admin Project Default Checklists — 44 blocks, 4 build-days, the smallest admin screen. Grid
  Operator keeps its own section but is no longer the slice.

### 2.4 Build order inside each phase

Document order in sections 8–10 is screen order. **Build order is not the same**, because
dependencies inside a phase are real. Within Phase 1 the write-target graph gives:

```
admin-capex-accounts  ──▶ admin-cost
                      └─▶ admin-contract
admin-default-checklists ◀──▶ admin-gates-approvals      (mutual — build as a pair)
admin-milestones          (independent)
```

so the recommended Phase 1 build order is **6 → 3 → 2 → (1 + 5) → 4**: the slice screen first, then
the CAPEX chart of accounts that two others read, then the independent one, then the mutually
dependent approvals pair, and Admin Cost last because it is the largest and reads CAPEX accounts.

Note the cycle. `Admin Project Default Checklists` references `Project Default Approvals` and
`Admin Project Gates Approvals` references `Project Default Checklists`. They cannot be strictly
ordered and should be treated as one 13-day unit of work by one pair of developers.

Within Phase 2 the order follows the left rail's own completeness chain, which is a data dependency
rather than a code one — the rail's icon colour encodes whether the prerequisite field on the
selected project is filled: General → nothing; Milestones → Project ID; Generator → Project Start
Date; Production → Total Capacity > 0; Cluster Check List → Net Yield p50 > 0; Team, Planning, Grid
Operator, Revenue and Financing → Cluster State present and not "Draft". So the recommended order is
**7 → 8 → 9 → 10 → 15 → 16 → 12 → 11 → 13 → 14 → 17 → 18**, which front-loads Generators (30 days,
band XL) because nothing downstream unlocks without it. `src/data/mock/autoFixture.ts` can break the
chain for development, so a team under schedule pressure may build Team, Planning and Grid Operator
early against fixtures — at the cost of not being able to demonstrate the rail unlocking.

Within Phase 3, `capex-costs` is built first despite being band XL: `contracts`, `opex-costs` and
`land-lease` all read grids it establishes, and `add-costs-from-table` is a panel over its data.

---

## 3. Stage model

```
Stage 0   Foundation                        platform, data, theme, store, routes, mock backend
Stage 1   Component library                 the 23 shared components + useBreakpoint
Stage 2   Vertical slice                    Admin Project Default Checklists, end to end
Workstream S  Dataverse security            runs from Stage 0; GATES PHASE 1, not cutover
─────────────────────────────────────────────────────────────────────────────────────────
Phase 1   Admin, 6 screens                   55 build-days
Phase 2   Project Management, 12 screens    166 build-days
Phase 3   Project Costs, 5 screens           71 build-days
─────────────────────────────────────────────────────────────────────────────────────────
Stage 4   Flow wrappers                     typed wrappers only; no flow is edited
Stage 5   Parity, performance, roles         screenshot parity, five roles, virtualisation
Stage 6   Cutover                           real environment, logical names, pac code push
```

292 build-days across the 23 screens. The distribution is the thing to plan around: Phase 2 is 57%
of the effort, and the nine mid-band screens across all three phases hold more days than the two XL
and two L screens combined.

### 3.1 The standing decision on flows is unchanged

**All 17 flows stay exactly as they are.** No definition is edited, split, merged or replaced. The
app side holds typed wrappers in `src/flows/` and a `FLOW_REGISTER` entry per flow, and nothing
else. Two properties of that choice stay with it and are worth an alert rather than a rewrite: a
cancellation is two writes rather than one transaction, so a mid-sequence failure can leave an
approval cancelled with the entity un-reset; and failure notifications keep arriving by email from
the flow's own Catch scope. Where logic genuinely belongs on the server, the mechanism is a
Dataverse **custom API** or a **plug-in** — not a flow change. Sections 8–10 never propose editing
a flow, and neither should any ticket derived from them.


### 3.2 Standing rule — every visible label is transcribed, not rewritten

**Every UI label, button caption, page title, column header, tooltip, placeholder, validation
message and confirmation title keeps the exact text it has in the canvas app.** Not a paraphrase,
not a tidier version, not a house-style rewrite. If the canvas says `Cancel`, the code app says
`Cancel`. If the canvas page title is `Checklist settings` with a lower-case *s* while the left-rail
item beside it reads `Check List Settings`, both survive exactly as they are — that inconsistency is
what the users have been reading for years, and it is part of what they navigate by.

This is not a style preference. It is the only cheap defence the migration has against the class of
change a test suite cannot see and a user notices immediately. A wrong number fails a test. A
politely reworded button fails nothing, ships, and turns into a support ticket, a retraining cost,
and an argument about whether the rebuild changed behaviour.

**The label surface this applies to**, counted from the two `.msapp` archives: **1,299 literal
user-visible strings, 668 of them distinct**, of which 143 are full sentences rather than short
labels — locked-page explanations, validation messages, tooltip paragraphs. Project Management holds
the large majority. The dynamic ones — `$"…{…}…"` interpolations — port as template strings with the
same words in the same order around the same substitutions.

**Where they live in the code app.** Labels are not scattered through JSX. Each feature folder's
`rules.ts` exports a frozen `MSG` object — 13 of the 23 do today, alongside `PANEL_LABELS` and the
column-header constants — so a string has one home, one `as const` type, and one place a reviewer
can diff against the canvas. New labels go there too; a string literal inline in `Screen.tsx` is a
review comment.

**Deviations are allowed, but only three kinds, and each is declared:**

1. **Text that no longer exists.** A label naming a control the rebuild removed — a change-detection
   timer, a spinner the framework now owns — goes with it.
2. **Text the canvas itself computes wrongly.** Corrected only where this plan already records a
   source defect, and with the canvas string kept reachable as the parity twin.
3. **A misspelling, corrected in place, with the original written down.** The repo already does this
   once and it is the pattern to copy: `admin-default-checklists/rules.ts` renders
   `Deactivate checklist item?` where the canvas builds
   `$"{If(…Active,"Decativate","Activate")} checklist item?"`, and the comment on
   `activationTitle()` records that *Decativate* is misspelt in `cmp_PopUp_Confirmation.Title`, that
   the spelling was corrected, and that the wording is otherwise verbatim. Correcting it silently
   would have been the error — not the correction itself.

Anything else — reordering words, expanding an abbreviation, adding a full stop, changing
capitalisation, replacing `[MW]` with `(MW)`, making an error message friendlier — is a change to the
product and needs the same sign-off as changing a formula.

One thing that is *not* a label: the canvas ships `This is Eror Message` as placeholder text in
twelve places. That is category 1, dead placeholder, and it does not come across.

**How it is checked.** `G-LABEL` in section 6.5. Every `MSG` entry and every column-header constant
carries the canvas control and property it came from in a comment, so the check is a diff rather
than a memory test — and each screen's build steps transcribe its labels before the screen is
composed, not after.

---

## 4. Workstream S — pulled forward

Security is four layers, with one working rule: **a restriction that exists only in the client is
not a restriction.**

| Layer | Mechanism | What it can express |
|---|---|---|
| 1 Platform | Entra, DLP, Conditional Access, sharing limits | Who reaches the app at all. Note SAS IP binding does not apply to code apps — location rules must be Conditional Access |
| 2 Dataverse privileges | Create / Read / Write / Delete / Append / AppendTo / Assign / Share at User, BU, Parent:Child BU, Organization | **The real boundary.** Table-and-scope rules |
| 3 Server-side logic | Plug-ins, column-level security | Conditional rules layer 2 cannot express |
| 4 The code app | Route guards, disabled commands, hidden panels | Shows and hides. Nothing else |

Five roles carry behaviour: `VSB - Application Administrator`, `VSB - Controller Own Data`,
`VSB - Project Data All Countries`, `VSB - Project Data Own Country`,
`VSB - Project Manager Own Projects`. The flags come from the union of direct and team-derived roles
filtered to `VSB*` — keep the union.

Two canvas idioms port unchanged and must not decay into client-side role arithmetic:
`DataSourceInfo(T, CreatePermission)` → `privileges.forTable(table)`, and
`RecordInfo(r, EditPermission)` → `privileges.forRecord(table, id)`, with `CanEditSelectedProject`
→ `session.canEditProject(projectId)` keeping its `Coalesce(…, false)` deny-on-error.

Ownership: every create path must write `'Owning Business Unit'` or BU-scoped roles silently break.
A repository assertion fails CI when an owned-table create omits it.

**A defect found while writing this document, in the rebuild rather than the canvas.** The two admin
screens whose UI reads privileges at all — `admin-capex-accounts/hooks.ts` and
`admin-cost/hooks.ts` — derive `canCreate` / `canWrite` / `canDelete` from
`user.isApplicationAdministrator || user.isControllerOwnData`. That is privileges from role names,
which `CONVENTIONS.md` rule 4 forbids and which the CAPEX header itself claims not to do. It is
carried in the security tables of the sections for screens 3 and 4, and in both exit gates.

**Workstream S exit gate, now gating Phase 1.** An authenticated user holding no `VSB*` admin role
is rejected **by Dataverse, not by the UI**, on a direct Web API write to each of the six
master-data tables. Recorded as a CI test, one case per table. Phase 1 is not done until it passes;
Phase 2 does not start on a Phase 1 that has not passed it.

---

## 5. The master sequence

Phase 1 = Admin · Phase 2 = Project Management · Phase 3 = Project Costs. "Fx lines" counts lines
inside logic blocks of three lines or more. "Tests" is the count of `it()` cases in that feature
folder's test files, from the run in the evidence report.

| # | Screen | Ph | Band | Days | Blocks ≥3 | ≥10 | ≥30 | Fx lines | Exports | Tests | Feature folder |
|---:|---|---:|:--|---:|---:|---:|---:|---:|---:|---:|---|
| 1 | Admin Project Gates Approvals Screen | 1 | S | 9 | 89 | 41 | 12 | 1,781 | 79 | 58 | `admin-gates-approvals/` |
| 2 | Admin Milestones Screen | 1 | S | 7 | 72 | 43 | 18 | 1,246 | 42 | 37 | `admin-milestones/` |
| 3 | Admin CAPEX Accounts | 1 | S | 5 | 68 | 26 | 9 | 1,134 | 60 | 38 | `admin-capex-accounts/` |
| 4 | Admin Cost Screen | 1 | M | 21 | 193 | 117 | 22 | 3,728 | 113 | 66 | `admin-cost/` |
| 5 | Admin Contract Screen | 1 | M | 9 | 88 | 43 | 13 | 1,965 | 61 | 47 | `admin-contract/` |
| 6 | Admin Project Default Checklists Screen | 1 | S | 4 | 44 | 16 | 5 | 561 | 49 | 35 | `admin-default-checklists/` |
| 7 | App Loading Screen | 2 | XS | 2 | 10 | 6 | 3 | 291 | 0 | 0 | `app-loading/` |
| 8 | Project Main Screen | 2 | S | 5 | 54 | 27 | 7 | 1,470 | 41 | 108 | `project-main/` |
| 9 | Project General Data Screen | 2 | M | 17 | 177 | 88 | 27 | 3,952 | 69 | 70 | `general-data/` |
| 10 | Project General Milestones Screen | 2 | M | 11 | 85 | 45 | 17 | 2,829 | 54 | 71 | `milestones/` |
| 11 | Project General Team Screen | 2 | S | 4 | 29 | 16 | 5 | 548 | 31 | 36 | `team/` |
| 12 | Project General CheckList Screen | 2 | M | 14 | 115 | 66 | 32 | 3,707 | 121 | 85 | `checklist/` |
| 13 | Project Planning Screen | 2 | M | 9 | 84 | 43 | 7 | 1,726 | 116 | 54 | `planning/` |
| 14 | Grid Operator Screen | 2 | XS | 4 | 47 | 23 | 3 | 690 | 53 | 54 | `grid-operator/` |
| 15 | Project Generators Screen | 2 | XL | 30 | 359 | 190 | 47 | 9,286 | 137 | 80 | `generators/` |
| 16 | Project Production Screen | 2 | M | 17 | 150 | 96 | 34 | 5,659 | 85 | 73 | `production/` |
| 17 | Project Revenues Screen | 2 | L | 23 | 216 | 122 | 53 | 7,486 | 126 | 102 | `revenues/` |
| 18 | Project Finance Screen | 2 | L | 30 | 321 | 186 | 58 | 8,036 | 135 | 127 | `finance/` |
| 19 | Capex Costs Screen | 3 | XL | 27 | 294 | 180 | 107 | 17,691 | 93 | 91 | `capex-costs/` |
| 20 | Contracts Screen | 3 | M | 15 | 149 | 80 | 21 | 3,063 | 53 | 63 | `contracts/` |
| 21 | Opex Costs Screen | 3 | M | 13 | 163 | 65 | 24 | 4,139 | 67 | 57 | `opex-costs/` |
| 22 | Land Lease Costs Screen | 3 | S | 12 | 156 | 61 | 10 | 2,783 | 61 | 48 | `land-lease/` |
| 23 | Add Costs from Table | 3 | XS | 4 | 9 | 3 | 1 | 1,202 | 30 | 40 | `add-costs-from-table/` |
| | **23 screens** | | | **292** | **2,972** | **1,583** | **535** | **84,973** | **1,676** | **1,440** | |

The per-screen test counts sum to **1,440**. The full suite is **1,613** cases; the remaining
**173** live in the shared layers — `src/domain`, `src/data`, `src/components`, `src/theme` — and
are counted once rather than against each screen that depends on them.

---

## 6. The harness

The harness is what makes the sequence in section 5 safe to execute. It has five layers, and the
order matters: each one catches a class of defect the layer above it cannot see.

### 6.1 Five layers

| # | Layer | Command | Catches | Runtime today |
|---:|---|---|---|---|
| 1 | Types | `npx tsc --noEmit` | Contract drift between rules, repositories and screens | 14 s |
| 2 | Unit — pure rules | `npx vitest run` | Wrong arithmetic, wrong branch, wrong date, wrong validation | 59 s |
| 3 | Unit — components and mock backend | same run | Grid, command bar, form panel, and the in-memory Dataverse itself | in the 59 s |
| 4 | Build | `npx vite build` | Anything that type-checks but will not bundle | 11 s |
| 5 | Scenario walk | `node scripts/scenario.mjs` | What only appears when you walk the app as a person does | 80 s |

Total wall-clock for the whole harness is **under three minutes**, which is the property that
matters most: a harness developers will not wait for is a harness they will skip.

### 6.2 Why layer 5 exists, stated concretely

The scenario walk is not redundant with the unit suite, and there is a specific incident that proves
it. `+ Add Project` navigated to `/project/general`, and `RequireProject` — a guard this rebuild
added, which the canvas app has no equivalent of — bounced it straight back to "No project
selected". **The app's only create path could not be reached.** Every screen rendered correctly in
isolation, the whole unit suite passed, and the guard was doing exactly what it was written to do.

Nothing in layers 1–4 could have found it. The fix is `NEW_PROJECT_ROUTE`
(`/project/general?new=1`) and `isNewProjectRequest()` — pure functions in
`src/domain/navigation.ts`, pinned by UT-NAV-015…017, including the assertion that the marker
unlocks General and no other project screen. The intent lives in the URL rather than a store flag,
so the guard stays a pure function of the location and a reloaded or shared "new project" link
still works.

The rule that follows: **every route guard added in this rebuild that the canvas app does not have
must be walked in layer 5 before its phase closes.** A guard is a new failure mode, not a free one.

### 6.3 What counts as a test, and the split the architecture depends on

The load-bearing split in the repo is `rules.ts` — pure, no React, no SDK, no clock — against
`Screen.tsx`, which is composition only. Every Power Fx block that decides something becomes an
exported function in `rules.ts`, and the test calls that function with values. Nothing in the
harness mounts a screen to test a rule.

The coverage measurement in the evidence report is what tells you whether that split is real rather
than aspirational, and it is the single most useful number in this whole exercise:

| Layer | Line coverage | Lines |
|---|---:|---:|
| `rules.ts` / `plan.ts` — pure rules | **97.4%** | 12,556 |
| `src/domain` — shared pure rules | 91.4% | 596 |
| `src/data` — repositories, mock backend | 97.6% | 2,283 |
| `hooks.ts` — data access | **10.1%** | 6,673 |
| `Screen.tsx` — composition | **3.6%** | 13,710 |

Read that as a design statement rather than a grade. The rules layer is almost completely covered,
which is the claim the architecture makes and it holds. The 45.4% figure for the repository as a
whole is an average across those two very different populations and should not be quoted on its
own — but the 6,673 lines of `hooks.ts` at 10.1% are a genuine gap, and section 6.6 says what to do
about it.

### 6.4 Naming and traceability

Every case carries an ID of the form `UT-<SCREEN>-<NNN>`, one prefix per screen —
`UT-ADCOST-…`, `UT-FIN-…`, `UT-CAPEX-…`, and 8 more for the shared layers (`UT-DOM`, `UT-NAV`,
`UT-SES`, `UT-GRID`, `UT-MOCK`, `UT-PQ`, `UT-AUTOFIX`, `UT-TECH`) — 31 prefixes in all. Three read
as if they were shared layers and are not: `UT-MAINUI` is Project Main's rendered suite, `UT-GRIDOP`
is Grid Operator, `UT-ADDCOST` is Add Costs from Table. The point of the ID is the trace: a canvas
formula → the function that replaced it → the case that pins it, in three hops and no guessing.
Sections 8–10 cite 654 distinct IDs, and every one was checked against the test files before this
document was issued.

Three housekeeping defects in that scheme, found while writing this document, each worth a ticket:

- **14 IDs sit on more than one `it()`**, so a CI failure on any of them is ambiguous.
  `UT-ADCHK-022` twice in `admin-default-checklists/rules.test.ts` (lines 128 and 363) for two
  unrelated cases; `UT-PLAN-030…033` across two `describe` blocks in `planning/rules.test.ts`,
  which is why 54 cases yield only 34 distinct IDs; `UT-CHKLST-035…042` across two blocks in
  `checklist/rules.test.ts`; and `UT-FIN-018` twice in `finance/rules.test.ts`. Renumber the
  duplicates.
- **15 IDs appear in comments and header lists but on no `it()`** — `UT-FIN-020`, `-097`, `-100`,
  `-101`, `-103`, `UT-REV-001`, and nine `UT-GEN-*` (024–027, 033, 040–042, 055) listed at the top
  of `generators/rules.test.ts`. They document intended cases rather than being cases. Either write
  them or strike them: a header list that reads like coverage and is not is worse than no list.
- **The IDs are not machine-checked.** Nothing fails when a document cites an ID that does not
  exist, or when two cases share one — both of the items above were found by hand. A short CI step
  that extracts every `UT-` ID from the test files and diffs it against the IDs cited in this
  document closes them permanently, and is worth writing before the plan reaches a delivery team.

### 6.5 The gates

A gate is a thing that either passes or fails without a conversation about it.

| Gate | Where | Test |
|---|---|---|
| **G-TYPE** | every commit | `tsc --noEmit` exits 0 |
| **G-UNIT** | every commit | every case passes; a screen's phase does not close with a skipped case in its folder |
| **G-BUILD** | every commit | `vite build` exits 0 |
| **G-WALK** | end of each phase | `scripts/scenario.mjs` exits 0, and its step list covers every screen in the phases closed so far |
| **G-SEC** | **end of Phase 1** | a user with no `VSB*` admin role is refused **by Dataverse** on a direct Web API write to each of the six master-data tables |
| **G-OWN** | end of each phase | no create path on an owned table omits `'Owning Business Unit'` — repository assertion |
| **G-LABEL** | per screen, before it is composed | every visible string on the screen is the canvas string. Each `MSG` entry and column-header constant names the canvas control and property it came from, a reviewer diffs the two side by side, and no string literal sits inline in `Screen.tsx`. See section 3.2 |
| **G-PARITY** | end of Phase 2 and 3 | every screen built from a screenshot matches it; every screen built without one is *declared* as inferred rather than claimed as parity |

G-SEC is the one that moved, and it is the one that will be argued about. It is also the only gate
in the list that cannot be satisfied by anything in the repository, because it is a statement about
a Dataverse environment. That is the point.

### 6.6 What the harness does not cover, today

Said plainly, because a harness whose gaps are undocumented is worse than a smaller honest one.

- **`hooks.ts` is 10.1% covered across 6,673 lines.** This is the data-access layer: query keys,
  mutation sequencing, cache invalidation, the pre-request permission refusals. The rules it calls
  are tested; the sequencing around them mostly is not. Highest-value harness work available.
- **`src/platform/bootstrap.ts` is 0% and `dataClient.ts` is 39.7%**, with no test file for either.
  The removal of canvas launch batching and the `gblAppStarted` → `isSuccess` change are therefore
  unpinned. Screen 7's exit gate requires both files to get one.
- **`AppRoutes.tsx` is 0%.** The route table and both guards are exercised only by layer 5.
- **`G-LABEL` is a review gate, not an automated one.** Nothing in layers 1–5 fails when a label is
  quietly reworded. The `MSG`-object convention makes the diff cheap and the provenance comments make
  it checkable, but a person still has to look. Automating it — extract every literal from the canvas
  `Text`, `HintText` and `Tooltip` properties, extract every `MSG` value, diff the two sets — is the
  highest-value harness addition after the `hooks.ts` gap above.
- **`src/store/appStore.ts` is 46.1% with 5% function coverage** — the Zustand slice that replaced
  the 70 `gbl*` variables.
- **Nothing has ever run against a real Dataverse environment.** The suite runs in mock mode. The
  logical column names still need regenerating with `pac code add-data-source`; some were derived
  from display names and are flagged in comments. Until that happens, layers 1–5 all pass against
  a backend the team wrote.
- **`dataClient.batch()` is not a transactional `$batch` changeset** — it bounds concurrency over
  individual writes. Any plan with two or more writes can half-apply, and the harness cannot see
  it. This compounds the flow cancellation caveat in section 3.1 rather than being separate from it.
- **Three flow wrappers are marked `disposition: "missing"` in `FLOW_REGISTER`** —
  `SynchronizeStandardAssumptionCosts`, `ForCountriestriggerFabricrecalculationsforProjects` and
  `SynchroniseRecalculationCapexStandardCost` — and throw a clear error when called. All 17
  definitions present in the export are registered with a disposition. Whether definitions for
  those three exist under other names, or not at all, is unanswered. This is not a flow change; it
  is a question about which definitions exist.

---

## 7. Critical path

```
Stage 0 ──▶ Stage 1 ──▶ Stage 2 slice (screen 6) ──▶ Phase 1 ──▶ Phase 2 ──▶ Phase 3 ──▶ Stage 5 ──▶ Stage 6
                │                                      │
                └── Workstream S ─────────────────────▶ G-SEC gates the end of Phase 1
```

Three observations that decide staffing.

**The two mutually dependent admin screens are one work item.** Screens 1 and 6 reference each
other's tables and cannot be strictly ordered: 13 build-days, one pair of developers, one branch.

**Generators and Capex Costs are both XL for opposite reasons, and want different people.**
Generators is UI-bound — 642 controls, 33 PCF instances, the largest UI rebuild in the solution, and
five stub equipment panels still to fill. Capex Costs is logic-bound — 107 blocks of 30 lines or
more, the densest in the solution. One needs the component library finished early; the other needs
its rules specified early. They can run in parallel across the Phase 2/3 boundary only if staffed
separately.

**Phase 3 cannot start early.** All five Cost screens read admin-owned master data, and
`capex-costs` additionally reads `Milestones Standard Assumptions`, so it depends on Phase 1
screens 2, 3 and 4. This is the resequence paying for itself: in the old wave order those
dependencies ran backwards.

---

## 8. Phase 1 — Admin screens

Six screens, 55 build-days, 554 logic blocks, 10,415 lines of Power Fx inside them (22,419 across
all properties). They are the master-data surface of the whole solution: the CAPEX chart of
accounts, the standard DEVEX/CAPEX and OPEX assumptions, the standard BoP contracts, the standard
milestone durations and success rates, the default project checklist, and who approves what at each
gate. Every one of them writes numbers that other screens read as given.

Recommended build order inside the phase — **6 → 3 → 2 → (1 + 5) → 4** — and the reasoning is in
section 2.4. The phase closes on **G-SEC**: Dataverse, not the UI, refusing a write.

Read the "Security conditions" table in each of the six sections as the primary content. On these
screens it is not a supporting detail.

---
### 1. Admin Project Gates Approvals Screen — `src/features/admin-gates-approvals/`

| | |
|---|---|
| Canvas unit | `PM::Admin Project Gates Approvals Screen` (PM app) |
| Power Fx | `89` blocks ≥3 lines · `41` ≥10 · `12` ≥30 · `1781` lines in those blocks (`3305` across all `=` properties) |
| Complexity | band `S` · score `18.2` · `9` build-days |
| Code app | `Screen.tsx` 713 ln · `hooks.ts` 273 ln · `rules.test.ts` 733 ln · `rules.ts` 1116 ln |
| Pure rules exported | `79` |
| Unit tests | `58` cases · IDs `UT-ADGATE-001…035` |
| Dataverse tables | `Check List Default Approvals`, `Checklist Country And Technologies`, `Countries`, `Project Default Approvals`, `Project Default Checklists`, `Project States`, `Projects`, `Users` |

#### What it does

An administrator picks one country and one technology from the middle rail, and the screen
lists every configurable project gate for that scope — Cluster 1 through Cluster 5, whether
or not an approval record exists for it. Each gate row expands into the check-list items
underneath it and their own approvals, and one shared right panel edits either kind of
record: an approval mode, a Portfolio Manager, and three lists of people held as JSON
(Contributors, Approvers, Notifications). Saving writes `Project Default Approvals` for a
gate row or `Check List Default Approvals` for a task row, and those rows are what the
project-side gate workflow later reads to decide who signs a gate off for the whole country.

#### Depends on

- `src/domain/session.ts` — `canSeeAdminSection`, `canEditCountry`, `buildCurrentUser`,
  `ADMIN_PAGE_TITLE["/admin/gates-approvals"]`
- `src/routes/AppRoutes.tsx` — the `RequireAdmin` guard and the `A(...)` route wrapper
- Workstream S: `prvRead`/`prvCreate`/`prvWrite` on `vsb_projectdefaultapprovals` and
  `vsb_checklistdefaultapprovals`, and `prvRead` on `vsb_microsoftentraid` — this screen is
  the first consumer of all three
- `src/data/entities.ts` — `ES_PROCESS.projectDefaultApprovals`,
  `ES_PROCESS.checkListDefaultApprovals`, `ES_PROCESS.projectDefaultChecklists`,
  `CHOICE_PROCESS.approvalMode`, `CHOICE_ADMIN.technology`
- `src/data/repos.ts` — `adminProjectDefaultApprovalRepo`, `adminCheckListDefaultApprovalRepo`,
  `adminDefaultChecklistRepo`, `checklistCountryTechRepo`, `projectStateRepo`,
  `adminEntraIdRepo`, `countryRepo`
- `src/domain/numeric.ts` — `isBlank`
- `src/platform/odata.ts` (`f`, `asc`), `src/platform/dataClient.ts` (`batch`),
  `src/platform/errors.ts` (`AppError`, `Result`), `src/platform/telemetry.ts` (`trace`)
- `src/components/` — `CountryRail` (tree variant), `DataGrid`, `CommandBar`, `FormPanel`,
  `ConfirmDialog`, `PageHeader`, `StateChip`, `EmptyState`, `LoadingOverlay`
- `src/store/appStore.ts` — `useAppStore(s => s.session.user)`

#### Power Fx → TypeScript

##### pcf_but_Admin_ProjectGates_Approvals_Form_Buttons_Save.OnChange — 198 lines → `buildApprovalPayload()`

Decides which columns a save writes, and — crucially — which of the two differently-named
approver columns the record gets.

```powerfx
IfError(
    Switch(
        locEditigApprovalType,
        "Cluster",
        UpdateContext(
            {
                locSelectedApprovalsEntity: Patch(
                    'Project Default Approvals',
                    If(
                        IsBlank(locSelectedApprovalsEntity),
                        Defaults('Project Default Approvals'),
                        locSelectedApprovalsEntity
                    ),
                    {
                        Name: Coalesce(drp_Admin_ProjectGates_Approvals_Form_Fields_State.Selected.Label," "),
                        'Approvals Country': cmp_Admin_ProjectGates_NestedCountryTechnologyPicker.SelectedCountry,
                        'Approval Mode': rad_Admin_ProjectGates_Approvals_Form_Fields_ApprovalMode.Selected.Value,
                        'Gate active': If(
                            drp_Admin_ProjectGates_Approvals_Form_Fields_State.Selected.Name <> "Draft",
                            tog_Admin_ProjectGates_Approvals_Form_Fields_Active.Checked,
                            true
                        ),
                        'Portfolio Manager': If(
                            rad_Admin_ProjectGates_Approvals_Form_Fields_ApprovalMode.Selected.Value = 'Approval Mode'.'Formal Approval',
                            LookUp(
                                'Microsoft Entra IDs',
                                And(
                                    Not(IsBlank(First(pcf_Admin_ProjectGates_Approvals_Form_Fields_PortfolioManger.SelectedPeople))),
                                    ThisRecord.'A unique identifer for Microsoft Entra ID' = GUID(First(pcf_Admin_ProjectGates_Approvals_Form_Fields_PortfolioManger.SelectedPeople).PersonaKey)
                                )
                            ),
                            Blank()
                        ),
// … [165 of the block's 198 lines omitted]
```

```typescript
export function buildApprovalPayload(
  panel: ApprovalPanelState,
  scope: Scope,
  gateName: string,
): Record<string, unknown> {
  const personas = personaFieldsForMode(panel);
  const mode = panel.mode ?? MODE.onlyNotifications;
  const isCreate = panel.existingId === null;

  const data: Record<string, unknown> = {
    [GATE_APPROVAL_COL.approvalMode]: mode,
    [GATE_APPROVAL_COL.gateActive]: resolveGateActive(gateName, panel.gateActive),
    [GATE_APPROVAL_COL.defaultContributors]: personas.contributors,
    [GATE_APPROVAL_COL.defaultNotifications]: personas.notifications,
  };

  // Rule 9 — a lookup, written only in Formal Approval.
  data[`${GATE_LOOKUP.portfolioManager}@odata.bind`] = personas.portfolioManagerId
    ? `/vsb_microsoftentraids(${personas.portfolioManagerId})`
    : null;

  if (panel.kind === "gate") {
    // Rule 7 — the gate record's name is the transition label.
    data[GATE_APPROVAL_COL.name] = gateName;
    // Rule 12 — `Default Approvals`, NOT `Default Approvers`.
    data[GATE_APPROVAL_COL.defaultApprovals] = personas.approvers;
    if (isCreate) {
      data[`${GATE_LOOKUP.clusterState}@odata.bind`] = `/vsb_projectstates(${panel.gate.id})`;
// … [24 lines omitted]
  // Rule 14 (fixed) — the BU of the gate this record belongs to.
  if (panel.gate.owningBusinessUnitId) {
    data[`${GATE_LOOKUP.owningBusinessUnit}@odata.bind`] =
      `/businessunits(${panel.gate.owningBusinessUnitId})`;
  }
  return data;
}
```

**Shape change** — the `Switch(locEditigApprovalType, "Cluster", …, "Checklist", …)` string
discriminator becomes a discriminated union on `ApprovalPanelState.kind`, so the
`Default Approvals` / `Default Approvers` column split is enforced by the type rather than
by a literal compare in fourteen places; the in-formula `LookUp('Microsoft Entra IDs', …)`
that resolved the Portfolio Manager becomes an `@odata.bind` on an id the picker already
holds; `JSON(ShowColumns(...SelectedPeople, …))` becomes `serialisePersonaList()`; and
`'Owning Business Unit'` is read from the record's own gate rather than from whatever the
cluster dropdown last held.
**Pinned by** — UT-ADGATE-017, UT-ADGATE-018, UT-ADGATE-019, UT-ADGATE-019b, UT-ADGATE-014,
UT-ADGATE-027.

##### btn_Admin_ProjectGates_DefaultClusterApproval_Item_Edit.OnSelect — 173 lines → `mergeGatesWithApprovals()`

Decides what a gate row is when no approval record exists for it — and, in the canvas,
creates one the moment Edit is pressed.

```powerfx
UpdateContext(
    {
        locIsVisibleApprovalsRightPanel: true,
        locEditigApprovalType: "Cluster",
        locSelectedChecklistApprovalEntity: Blank(),
        locSelectedApprovalsEntity: If(
            IsBlank(
                LookUp(
                    'Project Default Approvals',
                    'Project Default Approvals' = ThisItem.'Project Default Approvals'
                )
            ),
            Patch(
                'Project Default Approvals',
                Defaults('Project Default Approvals'),
                {
                    'Approvals Country': cmp_Admin_ProjectGates_NestedCountryTechnologyPicker.SelectedCountry,
                    Technology: Switch(
                        cmp_Admin_ProjectGates_NestedCountryTechnologyPicker.SelectedNestedValue,
                        "Wind", Technology.Wind,
                        "PV", Technology.PV,
                        "BESS", Technology.BESS,
                        "Hydrogen", Technology.Hydrogen,
                        "Substation", Technology.Substation
                    ),
                    Name: "",
                    'Gate active': true,
                    'Approval Mode': 'Approval Mode'.'Only Notifications',
                    'Cluster State': LookUp('Project States', Order = ThisItem.Order)
                }
            ),
// … [142 of the block's 173 lines omitted]
```

```typescript
export const configurableGates = (states: GateState[]): GateState[] =>
  states
    .filter((g) => g.isVisibleOnChecklist === true && (g.order ?? 0) < MAX_CONFIGURABLE_GATE_ORDER)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

export function mergeGatesWithApprovals(
  states: GateState[],
  approvals: GateApproval[],
): MergedGate[] {
  const byGate = new Map<string, GateApproval>();
  for (const a of approvals) {
    if (a.clusterStateId) byGate.set(a.clusterStateId, a);
  }
  return configurableGates(states).map((gate) => {
    const approval = byGate.get(gate.id) ?? null;
    return { gate, approval, isPlaceholder: approval === null };
  });
}

export function nonWindPvBanner(technology: string | null | undefined): string | null {
  return isWindOrPv(technology) ? null : MSG.nonWindPv;
}
```

**Shape change** — `Patch('Project Default Approvals', Defaults(...), …)` on an Edit click
was a real POST, so cancelling the panel left an orphan row in Dataverse; the placeholder is
now client-side only (`approval: null`, `isPlaceholder: true`) and the POST happens in
`planSaveApproval`. The second arm of the same block silently blanked
`'Default Approvals'` / `'Default Contributors'` / `'Default Notifications'` on any non-Wind/PV
record just for opening the panel; that destructive write is replaced by the read-only
`nonWindPvBanner`. The synthetic `Order` and `Id` columns the placeholder used to carry are
gone, which is also why rule 20's `DropColumns` disappears.
**Pinned by** — UT-ADGATE-002, UT-ADGATE-003, UT-ADGATE-004, UT-ADGATE-028, UT-ADGATE-006b.

##### btn_Admin_ProjectGates_Approvals_Form_Fields_ResetGateApproval.OnSelect — 32 lines → `planResetGate()`

Decides what "Reset Gate" clears, and whether a Draft-origin gate stays active after it.

```powerfx
UpdateContext(
    {
        locSelectedApprovalsEntity: Patch(
            'Project Default Approvals',
            locSelectedApprovalsEntity,
            {
                'Gate active': false,
                'Portfolio Manager': Blank(),
                'Default Contributors': Blank(),
                'Default Approvals': Blank(),
                'Default Notifications': Blank()
            }
        ),
        locSelectedChecklistApprovalEntity: Blank()
    }
);
Select(but_Admin_ProjectGates_Approvals_Form_Buttons_Reset);
UpdateContext(
    {
        locIsVisibleApprovalsRightPanel: false,
        locAdminLoadingDialog: false,
        locAdminLoadingDialogText: Blank()
    }
)
// … [8 of the block's 32 lines omitted]
```

```typescript
export function planResetGate(
  panel: ApprovalPanelState,
  scope: Scope,
  gateName: string,
  canEdit: boolean,
): WritePlan {
  if (!canEdit) return refuse(MSG.outOfScope);
  if (panel.existingId === null) return refuse(MSG.resetNoRecord);

  const cleared: ApprovalPanelState = {
    ...panel,
    portfolioManager: null,
    contributors: [],
    approvers: [],
    notifications: [],
    gateActive: false,
  };
  const entitySet = panel.kind === "gate" ? GATE_ENTITY_SET : CHECKLIST_APPROVAL_ENTITY_SET;
  const data = buildApprovalPayload(cleared, scope, gateName);
  const plan = emptyPlan();
  plan.writes.push({
    op: "update", entitySet, id: panel.existingId, data,
    reason: `${panel.kind} approval reset for ${gateName}`,
  });
  plan.log.push(`Gate reset: ${gateName}.`);
  return plan;
}
```

**Shape change** — the canvas issued a `Patch` immediately and unconditionally; the rebuild
returns a `WritePlan` that `Screen.tsx` puts behind a `ConfirmDialog`, and an out-of-scope or
record-less reset is a `refusedReason` with zero writes rather than a silent no-op. Reusing
`buildApprovalPayload` on a cleared panel means the reset write cannot drift from a normal
save (same column names, same BU, same `resolveGateActive`, so a Draft-origin gate stays
active).
**Pinned by** — UT-ADGATE-035, UT-ADGATE-035b, UT-ADGATE-035c, UT-ADGATE-035d.

##### pcf_Admin_ProjectGates_Approvals_Form_Fields_PortfolioManger.OnSearch — 28 lines → `entraSearchFilter()`

Decides which directory records the people picker may surface.

```powerfx
ClearCollect(
    colApprovals1,
    If(
        IsBlankOrError(Trim(Self.SearchText)),
        Blank(),
        AddColumns(
            RenameColumns(
                Search(
                    Filter(
                        'Microsoft Entra IDs',
                        'Microsoft Entra ID Account Enabled' = 'Microsoft Entra ID Account Enabled (Microsoft Entra IDs)'.Yes
                    ),
                    Trim(Self.SearchText),
                    'Display Name',
                    'Given Name',
                    Surname,
                    Mail
                ),
                'Display Name',
                DisplayName,
                Mail,
                EMail
            ),
            UniqueKey,
            'A unique identifer for Microsoft Entra ID'
        )
    )
);
```

```typescript
export const shouldSearchPeople = (term: string): boolean => term.trim().length > 0;

export function entraSearchFilter(term: string): string | undefined {
  const t = term.trim();
  if (!t) return undefined;
  const esc = t.replace(/'/g, "''");
  const like = [ENTRA_COL.displayName, ENTRA_COL.givenName, ENTRA_COL.surname, ENTRA_COL.mail]
    .map((c) => `contains(${c},'${esc}')`)
    .join(" or ");
  return `(${ENTRA_COL.accountEnabled} eq ${ENTRA_ACCOUNT_ENABLED_YES}) and (${like})`;
}
```

**Shape change** — `Search(Filter(...))` into a `colApprovals1` collection becomes a
server-side `$filter` string handed to `adminEntraIdRepo`; the four shadow collections
(`colApprovals1..4`) and their four `PreSelected` twins collapse to one controlled value per
picker, and the zero-row `RenameColumns(FirstN(Users,0), …)` that existed only to give those
collections a schema is deleted. The single quote in the search term is escaped, which the
Power Fx `Search` never had to consider — a genuinely new obligation of moving the predicate
into OData.
**Pinned by** — UT-ADGATE-020, UT-ADGATE-020b.

##### Admin Project Gates Approvals Screen.OnVisible — 118 lines → `buildCountryPicker()`

Decides the country and technology axis the whole screen is scoped by.

```powerfx
ClearCollect(
    col_cmpCountryPickerItems,
    Sort(
        AddColumns(
            Countries,
            'Flag Image',
            Switch(
// … [111 of the block's 118 lines omitted]
```

```typescript
export const COUNTRY_PICKER_ORDER: Record<string, number> = {
  Germany: 1, France: 2, Poland: 3, Italy: 4, Finland: 5, Croatia: 6,
  Spain: 7, Greece: 8, Romania: 9,
};

export const PICKER_TECHNOLOGIES: readonly string[] = ["Wind", "PV"];

export function buildCountryPicker(
  countries: CountryRef[],
  opts: { exclude?: readonly string[] } = {},
): PickerCountry[] {
  const exclude = opts.exclude ?? [];
  return countries
    .filter((c) => !exclude.includes(c.name))
    .map((c) => ({
      ...c,
      order: COUNTRY_PICKER_ORDER[c.name] ?? 99,
      technologies: PICKER_TECHNOLOGIES,
    }))
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}
```

**Shape change** — the eleven `ClearCollect`s of `OnVisible` become React Query keys; the
picker literal, duplicated verbatim on Gates, Cost and Contract, is declared once here and
imported by the other two so the three copies can no longer drift. The technology nesting
stays the two-row literal it is in the source, which is the reason a BESS, Hydro/Hydrogen or
Substation approval can never be authored from the UI even though the save `Switch` resolves
all five values. Note the axis is still picker literals, not
`gblCurrentUser.EditableCounties`, which is never read on this screen.
**Pinned by** — UT-ADGATE-001c, UT-ADGATE-001d, UT-ADGATE-001e.

#### Security conditions

`rules.ts` carries a boxed `SOURCE DEFECT` banner for this screen: `brief.py` reports
`PERMISSION SIGNALS: none` — no `DataSourceInfo`, no `RecordInfo`, no `gblCurrentUser` test
anywhere in the screen. The only membership test in the entire admin area is
`ItemVisible: Or(gblCurrentUser.IsApplicationAdministrator, gblCurrentUser.IsControllerOwnData)`
on the nav items, which is client-side hiding. `RequireAdmin` and `canEditScope` are added by
the rebuild and are explicitly not security; the server enforcement below does not exist yet
and is the substance of Workstream S for this screen.

| Condition | Canvas today | Where it must be enforced |
|---|---|---|
| Only an approvals administrator may reach the screen | `ItemVisible: Or(IsApplicationAdministrator, IsControllerOwnData)` on the nav item only; `OnVisible` never reads `gblCurrentUser` | `prvRead` on `vsb_projectdefaultapprovals` and `vsb_checklistdefaultapprovals` granted at Organization scope to `VSB - Application Administrator` and at Business Unit scope to `VSB - Controller Own Data`; withheld from `VSB - Project Data Own Country`, `VSB - Project Data All Countries` and `VSB - Project Manager Own Projects`. The route guard is UI only |
| Only an approvals administrator may create or change a gate approval | No check at all — `Patch('Project Default Approvals', …)` runs for anyone who reaches the screen | `prvCreate` and `prvWrite` on `vsb_projectdefaultapprovals`, Organization scope on `VSB - Application Administrator`, Business Unit scope on `VSB - Controller Own Data`, absent elsewhere |
| Only an approvals administrator may create or change a check-list approval | No check at all — the same panel `Patch`es `'Check List Default Approvals'` | `prvCreate` and `prvWrite` on `vsb_checklistdefaultapprovals` at the same two scopes; this table is a separate privilege and must not be inherited from the gate table |
| A user may only touch the countries their role scopes them to | `gblCurrentUser.EditableCounties` is never read; the picker is a hard-coded nine-country literal | Business-Unit-scoped `prvWrite` (the row's `owningbusinessunit` is written from the gate's `Project States` row) **plus** a pre-operation plug-in on Create and Update of `vsb_projectdefaultapprovals` and `vsb_checklistdefaultapprovals` that rejects a `vsb_approvalscountry` outside the caller's country-scoped role set — the server-side twin of `canEditScope` |
| The client must not choose the row's owning business unit | The canvas writes `'Owning Business Unit'` from the cluster dropdown, and on the checklist branch that dropdown is never set, so the row inherits whatever gate the panel last had open | The same pre-operation plug-in sets `owningbusinessunit` from `vsb_ClusterState`'s own business unit and discards any client-supplied value; do not grant `prvAssign` on either table |
| Switching a gate off must be an audited administrator act | `Patch(…, {'Gate active': If(Self.Text = "Active", false, true)})` with no confirmation and no permission test | `prvWrite` on the `vsb_gateactive` column governed by a column-security profile on `vsb_projectdefaultapprovals.vsb_gateactive`, granted only to the two admin roles; the `ConfirmDialog` in `Screen.tsx` is UX, not control |
| Approval mode must not be escalated outside Wind and PV | `approvalModeChoices` is a client-side filter; the save `Switch` accepts any mode for any technology | A pre-operation plug-in on both tables rejecting `vsb_approvalmodecode` = Formal Approval or Local Approval when `vsb_technologycode` is not Wind or PV |
| A gate approval must never be deleted | No `Remove` path exists for `Project Default Approvals`; GUIDE p20 nonetheless draws a trash icon on gate rows | Withhold `prvDelete` on `vsb_projectdefaultapprovals` from every role, so the server refusal matches `planDeleteGateApproval`; grant `prvDelete` on `vsb_checklistdefaultapprovals` to `VSB - Application Administrator` only |
| Directory search must not become a people-directory export | `Search(Filter('Microsoft Entra IDs', 'Account Enabled' = Yes), …)` — the enabled-account restriction is a client-side predicate | `prvRead` on `vsb_microsoftentraid` at Organization scope for the admin roles only, with `vsb_mail` behind a column-security profile; the `vsb_accountenabled` restriction moved into a Dataverse view or a plug-in so a hand-built `$filter` cannot drop it |

#### Deliberate divergences

- **No permission check of any kind.** The canvas gates entry client-side on the nav item's
  `ItemVisible`. The rebuild adds `RequireAdmin` on the route and gates every write plan on
  `canEditScope(user, scope)` → `canEditCountry`. Flagged in `rules.ts` as not being
  security. Parity functions: `canEditScope`, `canSeeAdminSection`.
- **Create-on-Edit-click.** The canvas `Patch`es a real `Project Default Approvals` row when
  Edit is pressed, so Cancel leaves an orphan. The rebuild keeps placeholders client-side
  (`isPlaceholder`) and POSTs on Save. Parity function: `mergeGatesWithApprovals`.
- **Silent destructive reset of non-Wind/PV rows.** The canvas blanks the three persona
  columns and forces Only-Notifications just for opening the panel on a BESS/Hydro record.
  The rebuild shows a read-only banner and changes nothing. Parity function:
  `nonWindPvBanner`.
- **The duplicate-gate guard that always fired.** Because rule 1 materialises a row for
  every gate, `drp_….Selected.Order in ShowColumns(gal_….AllItems, Order)` is always true, so
  the guard blocked every new gate record — which is why the gate dropdown ships hard-coded
  `Disabled`. The rebuild fires it only when a real approval row already exists. Parity
  function: `validatePanel` (`duplicateGate`).
- **`'Owning Business Unit'` on the checklist branch.** The canvas reads it from the cluster
  dropdown on both branches, and the checklist branch never sets that dropdown. The rebuild
  reads the BU from the gate the record actually belongs to. Parity function:
  `buildApprovalPayload`.
- **"Add Task" blocked by another country's approval.** The canvas's already-approved list is
  the whole `Check List Default Approvals` table, unscoped by country or technology. The
  rebuild counts only approvals inside the current scope. Parity functions:
  `canAddChecklistApproval` / `canAddChecklistApprovalCanvasParity`.
- **The gate-row delete icon.** GUIDE p20 draws one; the canvas never wrote a `Remove` for
  `Project Default Approvals`. The rebuild renders the icon for visual parity and always
  refuses with `MSG.noGateDelete`. Parity function: `planDeleteGateApproval`.
- **Gate deactivation with no confirmation.** The canvas toggles the status chip straight to
  a `Patch`. The rebuild returns a plan the `ConfirmDialog` gates. Parity function:
  `planToggleGateActive`.

#### Build steps

1. Land the `Project Default Approvals` and `Check List Default Approvals` privileges and the
   BU-stamping plug-in in a dev environment before writing any code, so the refusals are real.
2. Add `adminProjectDefaultApprovalRepo`, `adminCheckListDefaultApprovalRepo`,
   `adminEntraIdRepo` and `checklistCountryTechRepo` projections to `src/data/repos.ts`.
3. Write `rules.ts` columns, `MSG`, `PANEL_LABELS`, `GATE_TABLE_COLUMNS` and the persona
   codecs (`parsePersonaList`, `serialisePersonaList`, `formatPersona`).
4. Write the scope and gate-list rules — `buildCountryPicker`, `configurableGates`,
   `mergeGatesWithApprovals`, `gateDropdownItems`, `canEditScope`.
5. Write the panel rules — `validatePanel`, `personaFieldsForMode`, `buildApprovalPayload`,
   `planSaveApproval`, `planResetGate`, `planToggleGateActive`, `planDelete*`.
6. Write all 58 cases in `rules.test.ts` against those functions, including the parity twins,
   and get `UT-ADGATE-001…035` green before any JSX exists.
7. Write `hooks.ts` — one query per table with the scope predicates in `$filter`, and
   `useRunGatePlan` handing a plan to one `dataClient.batch`.
8. Compose `Screen.tsx` — `CountryRail` tree, `DataGrid` over `buildGateTableRows`, the shared
   `FormPanel`, and the `ConfirmDialog` in front of deactivate and delete.
9. Re-run the plan tests with the server privileges revoked and confirm the batch is rejected,
   not merely refused client-side.

#### Exit gate

`npx vitest run src/features/admin-gates-approvals` reports 58 passing cases covering
`UT-ADGATE-001` through `UT-ADGATE-035`, `npx tsc --noEmit` emits nothing for the folder, and
a user holding neither `VSB - Application Administrator` nor `VSB - Controller Own Data`
receives an HTTP 403 from Dataverse on a hand-issued POST to
`vsb_projectdefaultapprovalses` — the client refusal alone does not pass this gate.

---
### 2. Admin Milestones Screen — `src/features/admin-milestones/`

| | |
|---|---|
| Canvas unit | `PM::Admin Milestones Screen` (PM app) |
| Power Fx | `72` blocks ≥3 lines · `43` ≥10 · `18` ≥30 · `1246` lines in those blocks (`2259` across all `=` properties) |
| Complexity | band `S` · score `17.0` · `7` build-days |
| Code app | `Screen.tsx` 396 ln · `hooks.ts` 159 ln · `rules.test.ts` 416 ln · `rules.ts` 579 ln |
| Pure rules exported | `42` |
| Unit tests | `37` cases · IDs `UT-ADMILE-001…033` |
| Dataverse tables | `Countries`, `Fabric Job Types`, `Fabric Sync Jobs`, `Milestones Standard Assumptions`, `Projects`, `Technologies` |

#### What it does

Countries are listed as an accordion; expanding one shows a read-only grid of that country's
standard milestone assumptions, pivoted so each technology is a row and each milestone —
Cluster 1 to 4, FID, Cluster 5, Operational Lifetime, Sales Start, Sales Duration — is a
column, with a duration in months and, for the first four clusters, a success rate. A right
panel edits one country's whole set of numbers across all its technologies at once and saves
them as one batch of updates to `Milestones Standard Assumptions`. These figures are the
assumed milestone dates and probabilities behind every project in that country, so a wrong
save here moves dates on projects nobody on this screen can see.

#### Depends on

- `src/domain/session.ts` — `canSeeAdminSection`, `canEditCountry`,
  `ADMIN_PAGE_TITLE["/admin/milestones"]`
- `src/routes/AppRoutes.tsx` — the `RequireAdmin` guard
- Workstream S: `prvRead`/`prvWrite` on `vsb_milestonesstandardassumptions`, and the decision
  on whether `vsb_fabricsyncjob` is writable from a client at all
- `src/domain/numeric.ts` — `isTwoDecimal`, `inRange`, `isBlank` (the replacement for
  `fn_Numeric_MS`, which the canvas declares on `Project Main Screen` and calls from here)
- `src/data/entities.ts` — `ES_ADMIN.milestonesStandardAssumptions`, `MILESTONE_ROW_NAME`,
  `CHOICE_ADMIN.technology`, the `Job States` choice values
- `src/data/repos.ts` — `milestoneStandardAssumptionRepo`, `countryRepo`, `fabricSyncJobRepo`
- `src/flows/flowClient.ts` — the typed wrapper for
  `ForCountriestriggerFabricrecalculationsforProjects`, which throws because the flow is not
  in the solution export
- `src/platform/odata.ts` (`f`, `asc`), `src/platform/dataClient.ts` (`batch`),
  `src/platform/errors.ts`, `src/platform/telemetry.ts`
- `src/components/` — `CountryRail` (flat list variant), `DataGrid`, `CommandBar`,
  `FormPanel`, `NumericInput`, `PercentageInput`, `ConfirmDialog`, `PageHeader`, `EmptyState`

#### Power Fx → TypeScript

##### pcf_but_Admin_MilestoneAssumption_Form_Buttons_Save.OnChange — 185 lines → `planSaveMilestones()`

Decides which columns of which assumption rows a save actually writes.

```powerfx
IfError(
    With(
        {
            varSelectedMilestoneAssumptionRecords: locSelectedMilestoneAssumptions,
            varUpdates: col_MilestoneAssumtionsUpdates
        },
        ForAll(
            varSelectedMilestoneAssumptionRecords As Assumption,
            Patch(
                [@'Milestones Standard Assumptions'],
                Assumption,
                If(
                    !IsBlank( LookUp(
                        varUpdates,
                        assumptionGuid = Assumption.'Milestones Standard Assumptions' &&
                        field = "Cluster 1"
                    ).value),
                    {
                        'Cluster 1':
                        Value(
                            LookUp(
                                varUpdates,
                                assumptionGuid = Assumption.'Milestones Standard Assumptions' &&
                                field = "Cluster 1"
                            ).value
                        )
                    }
                ),
// … [157 of the block's 185 lines omitted]
```

```typescript
export function planSaveMilestones(args: {
  edits: EditMap;
  canEdit: boolean;
  language?: string;
}): WritePlan {
  if (!args.canEdit) return refuse(MSG.outOfScope);
  if (args.edits.size === 0) return refuse(MSG.noEdits);
  const bad = invalidEdits(args.edits);
  if (bad.length > 0) return refuse(saveErrorMessages(args.edits)[0] ?? MSG.invalidDuration);

  const byRow = new Map<string, Record<string, unknown>>();
  for (const e of args.edits.values()) {
    // Belt and braces — an invalid entry never contributes a column.
    if (!e.valid) continue;
    const column = MILESTONE_FIELD_COLUMN[e.field];
    const data = byRow.get(e.rowId) ?? {};
    data[column] = Number(e.raw.trim().replace(",", "."));
    byRow.set(e.rowId, data);
  }

  const plan = emptyPlan();
  for (const [rowId, data] of byRow) {
    plan.writes.push({
      op: "update", entitySet: MILESTONE_ENTITY_SET, id: rowId, data,
      reason: `${Object.keys(data).length} milestone column(s) updated`,
    });
  }
  plan.log.push(`Saved ${args.edits.size} cell edit(s) across ${byRow.size} row(s).`);
  return plan;
}
```

**Shape change** — the `ForAll(…, Patch(…))` with a nine-argument `If(!IsBlank(LookUp(…)))`
chain per row — roughly eighteen collection scans for every assumption row — becomes one
pass over an already-keyed `Map`, producing one `PlannedWrite` per row rather than one
network `Patch` per row. The write is a `WritePlan` returned to `hooks.ts` for a single
`dataClient.batch`, so a failure mid-save cannot leave half a country updated, and
`refusedReason` replaces the canvas's reliance on a single global `DisplayMode` disable.
**Pinned by** — UT-ADMILE-016, UT-ADMILE-017, UT-ADMILE-017b, UT-ADMILE-018, UT-ADMILE-026.

##### txt_Admin_MilestoneAssumption_Form_Fields_SuccessRates_Cluster1_Input.OnChange — 38 lines → `upsertEdit()`

Decides how one edited cell is recorded, and how its invalidity is represented.

```powerfx
With(
    {
        var_Record: LookUp(
            col_MilestoneAssumtionsUpdates,
            field = "Cluster 1" && assumptionGuid = ThisItem.'Milestones Standard Assumptions'
        ),
        var_Body: {
            assumptionGuid: ThisItem.'Milestones Standard Assumptions',
            tech: Text(ThisItem.Technology),
            field: "Cluster 1",
            value: If(
                !And(
        Not(IsBlank(Self.Value)),
        fn_Numeric_MS.IsTwoDecimal(Self.Value),
        fn_Numeric_MS.InRange(
            Self.Value,
            0,
            1
        )
    ),
                "invalid success rate",
                Self.Value
            )
        }
    },
    If(
        IsBlank(var_Record),
        Collect(
            col_MilestoneAssumtionsUpdates,
            var_Body
        ),
        Update(
            col_MilestoneAssumtionsUpdates,
            var_Record,
            var_Body
        )
    )
)
```

```typescript
export function isValidSuccessRate(input: string, language = "en-US"): boolean {
  const v = (input ?? "").trim();
  if (isBlank(v)) return false;
  if (!isTwoDecimal(v, language)) return false;
  return inRange(v, 0, 1, language);
}

export const validateEdit = (
  kind: "duration" | "successRate",
  raw: string,
  language = "en-US",
): boolean => (kind === "duration" ? isValidDuration(raw) : isValidSuccessRate(raw, language));

export function upsertEdit(edits: EditMap, edit: MilestoneEdit): Map<string, MilestoneEdit> {
  const next = new Map(edits);
  next.set(editKey(edit.rowId, edit.field), edit);
  return next;
}

export function canSave(edits: EditMap): boolean {
  if (edits.size === 0) return false;
  for (const e of edits.values()) if (!e.valid) return false;
  return true;
}
```

**Shape change** — the biggest single change on this screen: the canvas wrote the sentinel
string `"invalid success rate"` **into the data**, so validity and value shared one field and
a bad cell could only ever be reported globally. `MilestoneEdit` carries `valid: boolean`
alongside `raw`, so per-cell errors are showable and `planSaveMilestones` can refuse
structurally. The `LookUp` + `Collect`/`Update` pair per keystroke becomes one `Map.set` keyed
`` `${rowId}:${field}` ``, and the four identical Cluster 1–4 blocks (38 lines each, differing
only in the literal `"Cluster N"`) collapse into this one function. `fn_Numeric_MS`, a canvas
component declared on another screen, is replaced by `@/domain/numeric`.
**Pinned by** — UT-ADMILE-007, UT-ADMILE-008, UT-ADMILE-009, UT-ADMILE-010, UT-ADMILE-011,
UT-ADMILE-012, UT-ADMILE-013, UT-ADMILE-014, UT-ADMILE-014b, UT-ADMILE-015, UT-ADMILE-020.

##### cmp_Admin_MilestoneAssumptions_Apply_Confirmation.OnConfirm — 34 lines → `applyCommandState()`

Decides whether the per-country "Apply" command does anything at all. It does not.

```powerfx
UpdateContext(
    {
        locIsVisibleApply: false,
        locAdminLoadingDialog: true,
        locAdminLoadingDialogText: $"Milestone Standart Assumptions for '{locSelectedMilestoneAssumptionCountry.Name}' will be applied to all regarding projects, please wait..."
    }
);/*
UpdateContext(
    {
        locActiveProjectFabricRecalculateJob: Patch(
            'Fabric Sync Jobs',
            Defaults('Fabric Sync Jobs'),
            {
                Name: " ",
                'Regarding Object': locSelectedMilestoneAssumptionCountry,
                'Job Status': 'Job States'.Dirty,
                'Job Type': LookUp(
                    'Fabric Job Types',
                    Name = "Portfolio Milestone Assumptions changed"
                )
            }
        )
    }
);
If(
    locActiveProjectFabricRecalculateJob.'Job Status' = 'Job States'.Dirty,
    Notify(
        ForCountriestriggerFabricrecalculationsforProjects.Run(
            locSelectedMilestoneAssumptionCountry.Name,
            locActiveProjectFabricRecalculateJob.'Fabric Sync Job'
        ).message
    )
);*/
UpdateContext({locAdminLoadingDialog: false});
```

```typescript
export interface ApplyCommandState {
  enabled: false;
  disabledReason: string;
  confirmation: string;
}

export function applyCommandState(_scope: ApplyScope): ApplyCommandState {
  return {
    enabled: false,
    disabledReason: MSG.applyDisabled,
    confirmation: MSG.applyConfirmation,
  };
}
```

**Shape change** — the whole body between `/*` and `*/` is dead, and the per-country command
item additionally ships `ItemEnabled: false`, so the overlay opens and closes and nothing
happens. `enabled` is typed as the literal `false` so a future edit cannot flip it by
accident; the confirmation and the reason are carried verbatim so that enabling the feature
later needs a custom API, not a copy review. Reproduced as dead deliberately rather than
"repaired" into a live write.
**Pinned by** — UT-ADMILE-024.

##### cmp_Admin_MilestoneAssumptions_ApplyAll_Confirmation.OnConfirm — 33 lines → `fabricRecalculationArgs()`

Decides the argument the missing recalculation flow would have been called with.

```powerfx
UpdateContext(
        {
            locIsVisibleApplyAll:false,
            locAdminLoadingDialog: true,
            locAdminLoadingDialogText: $"Milestone Standart Assumptions for all countried will be applied to all projects, please wait..."
        }
);
/*
UpdateContext(
        {
            locActiveProjectFabricRecalculateJob: Patch(
                'Fabric Sync Jobs',
                Defaults('Fabric Sync Jobs'),
                {
                    Name: "All countries",
                    'Regarding Object': Blank(),
                    'Job Status': 'Job States'.Dirty,
                    'Job Type': LookUp(
                        'Fabric Job Types',
                        Name = "Portfolio Milestone Assumptions changed"
                    )
                }
            )
        }
    );
    If(
        locActiveProjectFabricRecalculateJob.'Job Status' = 'Job States'.Dirty,
        ForCountriestriggerFabricrecalculationsforProjects.Run(
            "All",
            locActiveProjectFabricRecalculateJob.'Fabric Sync Job'
        )
    );*/
    UpdateContext({locAdminLoadingDialog: false})
```

```typescript
export const MILESTONE_JOB_TYPE_NAME = "Portfolio Milestone Assumptions changed";

export function fabricRecalculationArgs(scope: ApplyScope): { countryNames: string[] } {
  return scope.kind === "all"
    ? { countryNames: ["All"] }
    : { countryNames: [scope.countryName] };
}
```

**Shape change** — the flow is not in `sol/Workflows/`, so its actions and outputs are not
invented: only the argument shape is captured, and `@/flows/flowClient` throws a
"not present in the export" error when the wrapper is called. The failure mode the eventual
replacement must remove is recorded in the comment: the canvas creates the `Fabric Sync Jobs`
row and calls the flow as two operations, so a failure leaves an orphan `Dirty` job. The
replacement should be one `vsb_TriggerMilestoneRecalculation(country | "All")` custom API
that creates the row and starts the pipeline in one transaction.
**Pinned by** — UT-ADMILE-025.

#### Security conditions

`rules.ts` carries a boxed `SOURCE DEFECT` banner: `brief.py` reports
`PERMISSION SIGNALS: none` for this screen — no `DataSourceInfo`, no `RecordInfo`, no
`gblCurrentUser` test anywhere. Entry is gated only by
`Or(gblCurrentUser.IsApplicationAdministrator, gblCurrentUser.IsControllerOwnData)` on the nav
items, which is client-side hiding. The axis is the whole `Countries` table, so every admin
sees and can edit every country; `gblCurrentUser.EditableCounties` is never read here either.
`canEditScope` is a gate the canvas simply lacked.

| Condition | Canvas today | Where it must be enforced |
|---|---|---|
| Only a master-data administrator may reach the screen | `ItemVisible: Or(IsApplicationAdministrator, IsControllerOwnData)` on the nav item; `OnVisible` never reads `gblCurrentUser` | `prvRead` on `vsb_milestonesstandardassumptions` at Organization scope for `VSB - Application Administrator` and Business Unit scope for `VSB - Controller Own Data`. Every project-facing role needs read here too (the numbers drive project dates), so read is *not* the gate — write is |
| Only a master-data administrator may change an assumption | No check at all — the `ForAll(…, Patch(…))` runs for anyone on the screen | `prvWrite` on `vsb_milestonesstandardassumptions`, Organization scope on `VSB - Application Administrator`, Business Unit scope on `VSB - Controller Own Data`, withheld from `VSB - Project Data All Countries`, `VSB - Project Data Own Country` and `VSB - Project Manager Own Projects` |
| A user may only change their own countries' assumptions | `gblCurrentUser.EditableCounties` never read; the accordion lists all countries | Business-Unit-scoped `prvWrite` on `vsb_milestonesstandardassumptions` **plus** a pre-operation plug-in on Update that rejects a row whose `vsb_country` lookup resolves outside the caller's country-scoped role set — the server-side twin of `canEditScope`. Without the plug-in, a row whose owning BU does not track its `vsb_country` value escapes the scope test |
| Nobody may create or delete an assumption row from this screen | The canvas only ever `Patch`es existing rows; there is no create or delete path | Withhold `prvCreate` and `prvDelete` on `vsb_milestonesstandardassumptions` from every role. The pivot depends on exactly two rows per technology (`"average duration [months]"` and `"success rate [-]"`), so a client-created third row silently breaks the grid |
| A success rate must stay within 0–1 to two decimals, a duration a non-negative integer | `IsMatch(Self.Value, "^\d+$")` and `fn_Numeric_MS.IsTwoDecimal` / `InRange` — client-side text validation only, and `fn_Numeric_MS` is declared on another screen | A pre-operation plug-in on `vsb_milestonesstandardassumptions` Update validating the range and precision of every `vsb_cluster*`, `vsb_finalinvestmentdecision`, `vsb_operationallifetime`, `vsb_salesstart` and `vsb_salesend` value on rows named `"success rate [-]"`. Column-level `Min`/`Max`/`Precision` metadata on those columns is the cheaper half of the same control |
| A recalculation must not be claimable without running | The Apply/Apply All bodies are commented out but the confirmation dialog still opens and reports success | Do not grant `prvCreate` on `vsb_fabricsyncjob` to any interactive role. The job row and the recalculation belong to one `vsb_TriggerMilestoneRecalculation` custom API, which owns both writes in one transaction |
| `Sales Duration` must not silently move data between columns | The grid column headed "Sales Duration" reads and writes `vsb_salesend`; nothing in the source explains the mismatch | Not a security control but a schema one: the rename belongs in a Dataverse schema migration with a data move, not in this screen. Until then `MILESTONE_FIELD_COLUMN` is the single declaration point and `UT-ADMILE-006` pins it |

#### Deliberate divergences

- **No permission check of any kind.** The canvas gates entry on the nav item's `ItemVisible`
  only. The rebuild adds `RequireAdmin` and gates the save on
  `canEditScope(user, countryId)` → `canEditCountry`. Parity functions: `canEditScope`,
  `canSeeAdminSection`.
- **Sentinel strings written into the data.** The canvas stores
  `"invalid duration"` / `"invalid success rate"` in the journal's `value` field, so validity
  and value share one column and only a global disable is possible. The rebuild carries
  `valid: boolean` on a typed `MilestoneEdit` and reports per-cell errors. Parity functions:
  `validateEdit`, `canSave`, `saveErrorMessages`.
- **`Sales Duration` reads `'Sales End'`.** Kept as the canvas has it, because changing it
  would move data between columns for every country. Parity function: `MILESTONE_FIELD_COLUMN`
  (`"Sales Duration"` entry), pinned by `UT-ADMILE-006`.
- **FID's success rate is the literal 1.** Whatever the success-rate row holds in
  `'Final Investment Decision'` is ignored. Reproduced verbatim. Parity function:
  `pivotByTechnology`.
- **Apply and Apply All are dead as shipped.** Disabled twice over — by `ItemEnabled: false`
  and `DisplayMode.Disabled`, and again by the commented-out bodies — and the flow they would
  call is not in the solution export. Reproduced as dead, with the intent captured. Parity
  functions: `applyCommandState`, `fabricRecalculationArgs`.
- **`Refresh(...)` after Save is commented out**, so the canvas grid showed stale values until
  the screen was revisited. The rebuild invalidates
  `['milestoneAssumptions', countryId]`. Parity point: `useSaveMilestones` in `hooks.ts`.
- **The journal was never cleared.** The canvas Save only `Select`s a hidden reset button, so
  stale journal rows survived into the next session. The rebuild replaces the map wholesale.
  Parity point: `UT-ADMILE-018`, `UT-ADMILE-020`.

#### Build steps

1. Land `prvWrite` on `vsb_milestonesstandardassumptions` and the country-scope plug-in in a
   dev environment, and confirm `prvCreate`/`prvDelete` are withheld.
2. Add the `milestoneStandardAssumptionRepo` and `fabricSyncJobRepo` projections to
   `src/data/repos.ts`, and `MILESTONE_ROW_NAME` to `src/data/entities.ts`.
3. Write `rules.ts` columns and labels — `MILESTONE_COL`, `MILESTONE_FIELD_COLUMN` with its
   defect note, `DURATION_FIELDS`, `SUCCESS_RATE_FIELDS`, `SUMMARY_TABLE_FIELDS`, `MSG`.
4. Write the pivot — `sortCountries`, `pivotByTechnology`, `buildMilestoneSummaryRows`,
   `technologyDisplayName`.
5. Write the edit model — `isValidDuration`, `isValidSuccessRate`, `validateEdit`,
   `upsertEdit`, `canSave`, `invalidEdits`, `saveErrorMessages`, `planSaveMilestones`.
6. Write the dead-path rules explicitly — `applyCommandState`, `fabricRecalculationArgs`,
   `isRecalculating` — so they are reviewable rather than absent.
7. Write all 37 cases in `rules.test.ts` and get `UT-ADMILE-001…033` green before any JSX.
8. Write `hooks.ts` — `useMilestoneCountries`, `useCountryAssumptions`,
   `useActiveFabricJobs`, `useSaveMilestones` with query invalidation.
9. Compose `Screen.tsx` — the country accordion, the read-only summary grid over
   `SUMMARY_TABLE_FIELDS`, and the edit `FormPanel` with its two verbatim section titles.

#### Exit gate

`npx vitest run src/features/admin-milestones` reports 37 passing cases covering
`UT-ADMILE-001` through `UT-ADMILE-033`, `npx tsc --noEmit` emits nothing for the folder,
`planSaveMilestones` produces exactly one `PlannedWrite` per edited row
(`UT-ADMILE-017`, `UT-ADMILE-017b`), and a PATCH to `vsb_milestonesstandardassumptionses` for
a country outside the caller's role scope is rejected by Dataverse rather than by the client.

---
### 3. Admin CAPEX Accounts — `src/features/admin-capex-accounts/`

| | |
|---|---|
| Canvas unit | `PM::Admin CAPEX Accounts` (PM app) |
| Power Fx | `68` blocks ≥3 lines · `26` ≥10 · `9` ≥30 · `1134` lines in those blocks (`2241` across all `=` properties) |
| Complexity | band `S` · score `10.8` · `5` build-days |
| Code app | `Screen.tsx` 566 ln · `hooks.ts` 185 ln · `rules.test.ts` 467 ln · `rules.ts` 789 ln |
| Pure rules exported | `60` |
| Unit tests | `38` cases · IDs `UT-ADCAPEX-001…029` |
| Dataverse tables | `CAPEX Account Lists`, `CAPEX Costs`, `CAPEX Project Contracts` |

#### What it does

This is the CAPEX chart of accounts: a two-level hierarchy held in the self-referencing
`CAPEX Account Lists` table, rendered as categories, accounts and their subaccounts, with a
toolbar for Reorder, New, Edit and Activate/Deactivate and per-row icons on the subaccount
grid. A right panel creates or renames an account or subaccount, and a drag list rewrites
`Order` for one level at a time. Deactivating an account is the destructive path: it flips
statuses down the tree and then zeroes the remaining months of the current year and deletes
every future year of `CAPEX Costs` for every contract underneath it — across every project
in scope, irreversibly from the UI.

#### Depends on

- `src/domain/session.ts` — `canSeeAdminSection`, `canEditCountry`,
  `ADMIN_PAGE_TITLE["/admin/capex-accounts"]`
- `src/routes/AppRoutes.tsx` — the `RequireAdmin` guard
- Workstream S: `prvCreate`/`prvWrite`/`prvDelete` on `vsb_capexaccountlist`, and `prvWrite`
  and `prvDelete` on `vsb_capexcost` — this is the only screen in the batch whose UI already
  reads privileges, and the only one whose cascade destroys transactional data
- `src/data/entities.ts` — `ES_ADMIN.capexAccountLists`, `ES_ADMIN.capexCosts`,
  `CHOICE_ADMIN.capexAccountStatus`, `CAPEX_ROOT_NUMBER`, `CAPEX_SECOND_ROOT_NUMBER`
- `src/data/repos.ts` — `capexAccountListRepo`, `adminCapexCostRepo`,
  `adminCapexProjectContractRepo`
- `src/features/admin-capex-accounts/rules.ts` `buildAccountTree` — imported by Admin
  Contract, so it must land before that screen starts
- `src/platform/odata.ts` (`f`), `src/platform/dataClient.ts` (`batch`),
  `src/platform/errors.ts`, `src/platform/telemetry.ts`
- `src/components/` — `DataGrid`, `CommandBar`, `FormPanel`, `ConfirmDialog`, `PageHeader`,
  `Card`, `EmptyState`, `StateChip`

#### Power Fx → TypeScript

##### cmp_Account_PopUpConfirmation_ChangeStatusOfAccount.OnConfirm — 89 lines → `planDeactivateAccount()`

Decides what happens to an account's children and to the forecast costs underneath it.

```powerfx
If(
    locSelectedAccount.Status = 'Status (CAPEX Account Lists)'.Active,
    UpdateIf(
        'CAPEX Account Lists',
        'CAPEX Account List' = locSelectedAccount.'CAPEX Account List',
        {Status: 'Status (CAPEX Account Lists)'.Inactive}
    );
    UpdateIf(
        colCapexAccounts,
        'CAPEX Account List' = locSelectedAccount.'CAPEX Account List',
        {Status: 'Status (CAPEX Account Lists)'.Inactive}
    );
    UpdateIf(
        'CAPEX Account Lists',
        'Parent Account'.'CAPEX Account List' = locSelectedAccount.'CAPEX Account List',
        {Status: 'Status (CAPEX Account Lists)'.Active}
    );
    UpdateIf(
        colCapexAccounts,
        'Parent Account'.'CAPEX Account List' = locSelectedAccount.'CAPEX Account List',
        {Status: 'Status (CAPEX Account Lists)'.Active}
    );
// … [67 of the block's 89 lines omitted]
```

```typescript
export function planDeactivateAccount(args: DeactivateArgs): WritePlan {
  if (!args.canEdit) return refuse(MSG.outOfScope);
  if (!args.privileges.canWrite) return refuse(MSG.noWritePrivilege);

  const plan = emptyPlan();
  const window = costCascadeWindow(args.today);

  plan.writes.push({
    op: "update", entitySet: CAPEX_ACCOUNT_ENTITY_SET, id: args.account.id,
    data: { [CAPEX_ACCOUNT_COL.statecode]: CHOICE_ADMIN.capexAccountStatus.inactive },
    reason: `${args.account.name} deactivated`,
  });

  const childStatus = args.canvasParity
    ? childStatusOnDeactivateCanvasParity()
    : childStatusOnDeactivate();

  for (const child of args.subaccounts) {
    plan.writes.push({
      op: "update", entitySet: CAPEX_ACCOUNT_ENTITY_SET, id: child.id,
      data: { [CAPEX_ACCOUNT_COL.statecode]: childStatus },
      reason: `${child.name} ${childStatus === CHOICE_ADMIN.capexAccountStatus.inactive
        ? "deactivated with its parent"
        : "ACTIVATED (canvas parity — see the defect note)"}`,
    });
  }
// … [30 lines omitted]
}
```

**Shape change** — the canvas sets the account Inactive and then sets **every child to
Active**, while the confirmation the user just read promises "All related subaccounts will be
automatically deactivated"; the rebuild does what the dialog says and keeps the inversion
reachable behind `canvasParity`. Structurally, four `UpdateIf` waves against a Dataverse table
and its shadow collection become one plan with per-write reasons, sent as one
`dataClient.batch` rather than N+1 non-transactional round-trips. `childStatusOnDeactivate`
is a named function so reversing the decision is a one-line change.
**Pinned by** — UT-ADCAPEX-019, UT-ADCAPEX-019b, UT-ADCAPEX-019c, UT-ADCAPEX-020,
UT-ADCAPEX-025.

##### cmp_Account_PopUpConfirmation_ChangeStatusOfSubAccount.OnConfirm — 74 lines → `classifyCostRow()`

Decides which `CAPEX Costs` rows are zeroed and which are deleted outright.

```powerfx
With(
        {
            varCapexContractsForSubaccountInCurrentYearRecords: Filter(
                colCapexProjectContracts,
                Account.'CAPEX Account List' = locSelectedCapexSubaccount.'CAPEX Account List'
            ).'CAPEX Project Contract'
        },
        With(
            {
                varCapexCostsForSubaccountInCurrentYearRecords: Filter(
                    'CAPEX Costs',
                    And(
                        Contract.'CAPEX Project Contract' in varCapexContractsForSubaccountInCurrentYearRecords,
                        Year = Year(Today()),
                        Month > Month(Today())
                    )
                )
            },

                ForAll(
                    varCapexCostsForSubaccountInCurrentYearRecords As varCapexCostRecord,
                         Patch(
                'CAPEX Costs',
                    varCapexCostRecord,{
                        Cost: 0
                    }
                )
            );
            RemoveIf(
                'CAPEX Costs',
                And(
                    Contract.'CAPEX Project Contract' in varCapexContractsForSubaccountInCurrentYearRecords,
                    Year > Year(Today())
                )
            )
        )
    ),
// … [38 of the block's 74 lines omitted]
```

```typescript
export function costCascadeWindow(today: Date): CostCascadeWindow {
  return {
    zeroYear: today.getFullYear(),
    zeroMonthExclusive: today.getMonth() + 1,   // Power Fx Month() is 1-based
    deleteYearsAfter: today.getFullYear(),
  };
}

export type CostCascadeAction = "zero" | "delete" | "keep";

export function classifyCostRow(row: CapexCostRow, w: CostCascadeWindow): CostCascadeAction {
  if (row.year > w.deleteYearsAfter) return "delete";
  if (row.year === w.zeroYear && row.month > w.zeroMonthExclusive) return "zero";
  return "keep";
}
```

**Shape change** — the nested `With`/`Filter`/`ForAll(Patch)`/`RemoveIf` becomes a pure
three-way classifier over one row plus an explicitly declared window, so "rest of this year
zeroed, all future years deleted" is testable without a table. The cost rows reach it already
narrowed by a server-side `$filter` on contract, year and month rather than by a client scan
of `'CAPEX Costs'`. Past months and the current month are provably untouched.
**Pinned by** — UT-ADCAPEX-016, UT-ADCAPEX-017, UT-ADCAPEX-018, UT-ADCAPEX-025b.

##### pcf_Account_RightPanel_NewEditSubaccount_BodyButtons_Save.OnChange — 95 lines → `planSaveAccount()`

Decides whether a subaccount save proceeds, what number it gets and what status it starts in.

```powerfx
UpdateContext(
    {
        locIfAccountOrSubAccountNumberAlreadyExists: Not(
            IsBlank(
                LookUp(
                    'CAPEX Account Lists',
                    Number = locSelectedAccount.Number & "_" & Trim(txt_Account_RightPanel_NewEditSubaccount_BodyContent_Number.Value)
                )
            )
        )
    }
);
// If new subaccount is creating and subaccount number already exists, show error message, otherwise save/update subaccount
If(
    And(
        IsBlank(locSelectedCapexSubaccount),
        locIfAccountOrSubAccountNumberAlreadyExists
    ),
    "",
    UpdateContext(
        {
            locSpinnerInformationText: "Saving Subaccount...",
            locIsVisiblePopUpSpinner: true,
            locIsVisibleRightPanelNewEditSubaccount: false
        }
    );
    If(
        IsBlank(locSelectedCapexSubaccount),
    // New Subaccount
        UpdateContext(
            {
                locSelectedCapexSubaccount: Patch(
                    'CAPEX Account Lists',
                    Defaults('CAPEX Account Lists'),
                    {
                        'Parent Account': locSelectedAccount,
                        Number: locSelectedAccount.Number & "_" & Trim(txt_Account_RightPanel_NewEditSubaccount_BodyContent_Number.Value),
// … [58 of the block's 95 lines omitted]
```

```typescript
export function planSaveAccount(
  form: AccountForm,
  opts: {
    isSubaccount: boolean;
    isEdit: boolean;
    editingId?: string;
    parent: CapexAccount | null;
    siblings: CapexAccount[];
    existingNumbers: string[];
    privileges: Privileges;
    canEdit: boolean;
  },
): WritePlan {
  if (!opts.canEdit) return refuse(MSG.outOfScope);
  if (opts.isEdit && !opts.privileges.canWrite) return refuse(MSG.noWritePrivilege);
  if (!opts.isEdit && !opts.privileges.canCreate) return refuse(MSG.noCreatePrivilege);

  const errors = validateAccountForm(form, {
    isSubaccount: opts.isSubaccount,
    isEdit: opts.isEdit,
    existingNumbers: opts.existingNumbers,
    parentNumber: opts.parent?.number,
  });
  if (hasFormErrors(errors)) {
    return refuse(accountFormMessages(errors, opts.isSubaccount)[0]);
  }
// … [16 lines omitted]
}
```

**Shape change** — the canvas evaluates the duplicate flag *at save time* and then does
`If(And(IsBlank(locSelectedAccount), <flag>), "", <save>)`, so a duplicate silently does
nothing and the error label's `Visible` is only ever true after a failed attempt. Here
`existsByNumber` is a server-side `$filter` count run before the write and the message is
inline. The `Patch` followed by a separate `UpdateIf(..., {Status: Inactive})` collapses into
one create payload carrying `statecode: Inactive`, closing the window in which a new account
is briefly usable — rule 11's deliberate safety behaviour, preserved.
**Pinned by** — UT-ADCAPEX-008, UT-ADCAPEX-009, UT-ADCAPEX-010, UT-ADCAPEX-011,
UT-ADCAPEX-012, UT-ADCAPEX-013, UT-ADCAPEX-014, UT-ADCAPEX-015, UT-ADCAPEX-015b.

##### pcf_Account_AccountCardBody_SubAccounts.OnChange — 36 lines → `subaccountRowIcons()`

Decides which action icons a subaccount row offers.

```powerfx
If(
    Self.EventName = "CellAction" && Self.EventColumn = "EditIcon",
    UpdateContext({locSelectedCapexSubaccount: Blank()});
    UpdateContext(
        {
            locSelectedCapexSubaccount: LookUp(
                colCapexAccounts,
                'CAPEX Account List' = GUID(Self.EventRowKey)
            )
        }
    );
    UpdateContext({locSelectedAccount: gal_Account_Accounts.Selected});
    UpdateContext({locIsVisibleRightPanelNewEditSubaccount: true}),
    Self.EventName = "CellAction" && Self.EventColumn = "ChangeStatusIcon",
    UpdateContext(
        {
            locSelectedCapexSubaccount: LookUp(
                colCapexAccounts,
                'CAPEX Account List' = GUID(Self.EventRowKey)
            )
        }
    );
    UpdateContext({locSelectedAccount: gal_Account_Accounts.Selected});
    UpdateContext({locIsVisiblePopUpChangeStatusOfSubaccount: true}),
    Self.EventName = "CellAction" && Self.EventColumn = "DeleteIcon",
    UpdateContext(
        {
            locSelectedCapexSubaccount: LookUp(
                colCapexAccounts,
                'CAPEX Account List' = GUID(Self.EventRowKey)
            )
        }
    );
    UpdateContext({locSelectedAccount: gal_Account_Accounts.Selected});
    UpdateContext({locIsVisiblePopUpDeleteSubaccount: true})
);
```

```typescript
export function subaccountRowIcons(
  record: CapexAccount,
  p: Privileges,
  contracts: CapexContractRef[],
): SubaccountRowIcons {
  const referenced = contracts.some((c) => c.accountId === record.id);
  const active = record.status === CHOICE_ADMIN.capexAccountStatus.active;
  return {
    edit: p.canWrite,
    // The delete icon is absent entirely when a contract references the subaccount.
    delete: !referenced && p.canDelete,
    deactivate: active && p.canWrite,
    activate: !active && p.canWrite,     // the canvas branch that could never be true
  };
}

/** The canvas behaviour of rule 7's status icon, for the parity test. Not wired to the UI. */
export function subaccountActivateIconCanvasParity(
  record: CapexAccount,
  p: Privileges,
): boolean {
  const active = record.status === CHOICE_ADMIN.capexAccountStatus.active;
  // Inside the Inactive arm the canvas tests `Status = Active` — a contradiction.
  return active ? false : (active && p.canWrite);
}
```

**Shape change** — the `EventName`/`EventColumn` string dispatch plus three `LookUp`s into the
shadow collection becomes a typed row-action record computed from the row the grid already
holds. The functional change is the fix: the canvas `ChangeStatusIcon` switches on `Status`
and its Inactive arm tests `And(ThisItem.Status = Active, RecordInfo(...))`, a condition that
is never true inside that branch, so the Activate icon never rendered and a deactivated
subaccount could not be reactivated from the grid at all.
**Pinned by** — UT-ADCAPEX-021, UT-ADCAPEX-021b, UT-ADCAPEX-022.

##### pcf_Account_RightPanel_Ordering_BodyButtons_Save.OnChange — 28 lines → `planReorder()`

Decides the new `Order` value for each row at one level.

```powerfx
If(
    locIfOrderingSubaccounts,
    // Subaccounts ordering
    ForAll(
        pcf_Account_RightPanel_Ordering_BodyContent_Subaccounts.CurrentItems As RecordItem,
        UpdateIf('CAPEX Account Lists', Text('CAPEX Account List') = RecordItem.ItemId, {Order: RecordItem.Position});
        UpdateIf(colCapexAccounts,Text('CAPEX Account List') = RecordItem.ItemId, {Order: RecordItem.Position});
    ),

    // 'Capex Accounts' ordering
    ForAll(
        pcf_Account_RightPanel_Ordering_BodyContent_Accounts.CurrentItems As RecordItem,
        UpdateIf('CAPEX Account Lists', Text('CAPEX Account List') = RecordItem.ItemId, {Order: RecordItem.Position});
        UpdateIf(colCapexAccounts, Text('CAPEX Account List') = RecordItem.ItemId, {Order: RecordItem.Position});
    );
    UpdateContext({locSelectedAccount: Blank()})
);

UpdateContext({
    locResetOrderingList: "Reset"&Rand()&Now()
});
// … [9 of the block's 28 lines omitted]
```

```typescript
/** Rule 17 — reorder writes `Order: <position>` for the chosen level, as one batch. */
export function planReorder(
  accounts: CapexAccount[],
  orderedIds: string[],
  opts: { privileges: Privileges; canEdit: boolean },
): WritePlan {
  if (!opts.canEdit) return refuse(MSG.outOfScope);
  if (!opts.privileges.canWrite) return refuse(MSG.noWritePrivilege);
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const plan = emptyPlan();
  orderedIds.forEach((id, index) => {
    const position = index + 1;
    if (byId.get(id)?.order === position) return;
    plan.writes.push({
      op: "update", entitySet: CAPEX_ACCOUNT_ENTITY_SET, id,
      data: { [CAPEX_ACCOUNT_COL.order]: position },
      reason: `Moved to position ${position}`,
    });
  });
  return plan;
}
```

**Shape change** — two `ForAll(UpdateIf, UpdateIf)` loops writing every row twice (table and
shadow collection) become one batch of updates for only the rows whose position actually
changed. `locResetOrderingList: "Reset" & Rand() & Now()`, whose only purpose was to force the
drag control to re-read, is deleted; query invalidation does that job. Note that the canvas
subaccount Reorder command has no `ItemEnabled` at all — its privilege test is commented out —
so it is always enabled; `canReorderSubaccounts` closes that.
**Pinned by** — UT-ADCAPEX-023, UT-ADCAPEX-004, UT-ADCAPEX-004b.

#### Security conditions

`rules.ts` carries a boxed `SOURCE DEFECT` banner. This is the only screen in the batch whose
UI reads Dataverse privileges — `DataSourceInfo(…, CreatePermission)` and
`RecordInfo(…, EditPermission)` drive the command bar — but those are per-command tests, not a
screen-level check: `OnVisible` does only `UpdateContext(...)` plus an
`UpdateIf(colCapexAccounts, …)`, and entry is gated purely by
`ItemVisible: Or(gblCurrentUser.IsApplicationAdministrator, gblCurrentUser.IsControllerOwnData)`
on the nav items. A further gap is in the rebuild itself and must be closed by Workstream S:
`useCapexPrivileges` in `hooks.ts` currently derives `canCreate`/`canWrite`/`canDelete` from
`isApplicationAdministrator` / `isControllerOwnData`, which is a role-name derivation and
therefore contrary to CONVENTIONS rule 4 — it must be replaced with a server-evaluated
privilege response before this screen goes to QA.

| Condition | Canvas today | Where it must be enforced |
|---|---|---|
| Only a chart-of-accounts administrator may reach the screen | `ItemVisible: Or(IsApplicationAdministrator, IsControllerOwnData)` on the nav item; no screen-level check | `prvRead` on `vsb_capexaccountlist` is needed by every cost screen, so read is not the gate. Gate on write: `prvWrite` on `vsb_capexaccountlist` at Organization scope for `VSB - Application Administrator` and Business Unit scope for `VSB - Controller Own Data`, withheld from all project-facing roles |
| Only a chart-of-accounts administrator may create an account or subaccount | `ItemEnabled: DataSourceInfo('CAPEX Account Lists', CreatePermission)` — a real privilege read, but the write itself is unguarded once the button is reachable | `prvCreate` on `vsb_capexaccountlist` granted to the two admin roles only. `canCreateAccount(p)` must read that privilege from the platform SDK, not from a role name |
| Only a full administrator may delete an account | `ItemEnabled` is a `DeletePermission` test; `Visible` is the in-use test (`canDeleteAccount`) | `prvDelete` on `vsb_capexaccountlist` granted to `VSB - Application Administrator` at Organization scope only. `VSB - Controller Own Data` gets create and write but not delete, matching `useCapexPrivileges`'s intent |
| A deactivated subaccount must be reactivatable by someone | The Inactive arm of `ChangeStatusIcon` tests `Status = Active`, so the Activate icon never renders — the state is a dead end in the UI | Not a Dataverse control: fixed in `subaccountRowIcons`. The privilege behind it is `prvWrite` on `vsb_capexaccountlist.statecode`, which must not sit behind a column-security profile that the admin roles lack |
| Nobody may destroy forecast costs without the cost privilege | The cascade `Patch`es and `RemoveIf`s `'CAPEX Costs'` with no privilege test of its own — it inherits whatever the account command allowed | `prvWrite` **and** `prvDelete` on `vsb_capexcost` at Organization scope for `VSB - Application Administrator` only. Better: withhold both from every interactive role and move the cascade into a Dataverse custom API `vsb_DeactivateCapexAccount(accountId)` that performs the status flips and the zero/delete in one transaction under its own privilege |
| A cascade must be all-or-nothing | Four `UpdateIf` waves plus an N-row `ForAll(Patch)` and a `RemoveIf`, non-transactional: a failure halfway leaves accounts inactive and costs partly zeroed, and the deleted rows are unrecoverable (activating back does not restore them) | The same `vsb_DeactivateCapexAccount` plug-in-backed custom API. The rebuild's single `$batch` is a stopgap, not the control |
| A user may only touch their own countries' accounts | No country test anywhere; master accounts have no country at all | `canEditAccountScope` is the client-side gate. Server-side, master accounts (no `vsb_country`) must be Organization-scope-write only, i.e. `VSB - Application Administrator`; country-bearing rows are covered by Business-Unit-scoped `prvWrite` plus the same country-validating pre-operation plug-in used on the other admin tables |
| The reorder command must not be usable by a reader | The subaccount Reorder command has no `ItemEnabled` at all — its privilege test is commented out | `prvWrite` on `vsb_capexaccountlist.vsb_order`; the client gate is `canReorderSubaccounts(subaccounts, p)`, added by the rebuild and pinned by UT-ADCAPEX-004b |
| Privileges must come from the server, not from role names | The canvas reads real `DataSourceInfo`/`RecordInfo` here — better than the rest of the batch | Replace `useCapexPrivileges`'s role-name derivation with a `RetrievePrincipalAccess`-style privilege read through `dataClient`, so `Privileges` reflects the caller's actual table and record access. `NO_PRIVILEGES` is already the safe default |

#### Deliberate divergences

- **Deactivating an account activated its children.** The canvas sets the account Inactive
  and every child to Active, contradicting the confirmation text the user just read and
  leaving an inactive parent with active children whose forecast costs have just been
  destroyed. The rebuild deactivates the children with the parent. Parity functions:
  `childStatusOnDeactivate` / `childStatusOnDeactivateCanvasParity`, `planDeactivateAccount`
  (`canvasParity` flag).
- **The Activate icon that could never render.** The canvas `ChangeStatusIcon`'s Inactive arm
  tests `Status = Active`, so a deactivated subaccount was unreactivatable from the grid. The
  rebuild returns `activate` whenever the record is inactive and the user may write. Parity
  functions: `subaccountRowIcons` / `subaccountActivateIconCanvasParity`.
- **The duplicate-number check ran after the write attempt.** The canvas sets
  `locIfAccountOrSubAccountNumberAlreadyExists` at save time, then silently does nothing, and
  the error label's `Visible` is that post-hoc flag. The rebuild checks server-side before the
  write and shows the message inline. Parity functions: `numberExists`, `existsByNumber`,
  pinned by UT-ADCAPEX-011.
- **The subaccount Reorder command had no privilege gate.** Its `ItemEnabled` test is
  commented out in the source, so it is always enabled. Closed by
  `canReorderSubaccounts`.
- **New accounts are created inactive.** Preserved deliberately — the canvas follows every
  create with `UpdateIf(..., {Status: Inactive})`; the rebuild puts the status in the create
  payload so the row is never briefly active. Parity function: `buildAccountPayload`, pinned
  by UT-ADCAPEX-014.
- **Stale `App.OnStart` collections.** `colCapexAccounts`, `colCapexAccountCategories` and
  `colCapexProjectContracts` were built once at start-up and never refreshed, so edits made
  elsewhere were invisible until the app restarted. Replaced by the `['capexTree']` query key.

#### Build steps

1. Land the `vsb_capexaccountlist` and `vsb_capexcost` privileges in a dev environment, and
   decide whether the cascade becomes `vsb_DeactivateCapexAccount` now or after cutover.
2. Replace `useCapexPrivileges`'s role-name derivation with a server privilege read, so the
   rules consume real `Privileges` values.
3. Add `capexAccountListRepo`, `adminCapexCostRepo` and `adminCapexProjectContractRepo`
   projections to `src/data/repos.ts`.
4. Write `rules.ts` structure first — `CAPEX_ACCOUNT_COL`, `buildAccountTree`, `flattenTree`,
   `listCategories`, `accountRowLabel`, `CAPEX_TOOLBAR_*` — because Admin Contract imports the
   tree builder.
5. Write the command and row gates — `canCreateAccount`, `canEditAccount`, `showActivate`,
   `showDeactivate`, `canReorderAccounts`, `canReorderSubaccounts`, `canDeleteAccount`,
   `deleteEnabled`, `subaccountRowIcons`, `canEditAccountScope`.
6. Write the number and form rules — `isNumericAccountNumber`, `composeSubaccountNumber`,
   `numberExists`, `nextOrder`, `validateAccountForm`, `buildAccountPayload`,
   `planSaveAccount`.
7. Write the cascade — `costCascadeWindow`, `classifyCostRow`, `childStatusOnDeactivate` and
   its parity twin, `planDeactivateAccount`, `planActivateAccount`, `planDeleteAccount`,
   `planReorder`.
8. Write all 38 cases in `rules.test.ts`, including both parity twins, and get
   `UT-ADCAPEX-001…029` green before any JSX.
9. Compose `Screen.tsx` — the category cards, the subaccount `DataGrid` with its row icons,
   the `FormPanel`, the reorder list, and a `ConfirmDialog` whose body is `MSG.deactivateAccount`
   verbatim.

#### Exit gate

`npx vitest run src/features/admin-capex-accounts` reports 38 passing cases covering
`UT-ADCAPEX-001` through `UT-ADCAPEX-029`, `npx tsc --noEmit` emits nothing for the folder,
`planDeactivateAccount` on one account with three subaccounts and forty in-window cost rows
produces exactly 44 writes in one plan (`UT-ADCAPEX-019`), and a caller without `prvDelete`
on `vsb_capexcost` has that batch rejected by Dataverse. The gate additionally fails while
`useCapexPrivileges` computes `Privileges` from `isApplicationAdministrator` /
`isControllerOwnData`: `grep -n "isApplicationAdministrator\|isControllerOwnData"
src/features/admin-capex-accounts/hooks.ts` must return nothing, and revoking `prvDelete` on
`vsb_capexaccountlist` for a user who still holds `VSB - Application Administrator` must flip
`deleteEnabled` to false in the running app.

---
### 4. Admin Cost Screen — `src/features/admin-cost/`

| | |
|---|---|
| Canvas unit | `PM::Admin Cost Screen` (PM app) |
| Power Fx | `193` blocks ≥3 lines · `117` ≥10 · `22` ≥30 · `3728` lines in those blocks (`9286` across all `=` properties) |
| Complexity | band `M` · score `39.4` · `21` build-days |
| Code app | `Screen.tsx` 949 ln · `devexRules.ts` 557 ln · `hooks.ts` 314 ln · `opexRules.ts` 745 ln · `plan.ts` 27 ln · `rules.test.ts` 882 ln · `rules.ts` 434 ln |
| Pure rules exported | `113` |
| Unit tests | `66` cases · IDs `UT-ADCOST-001…053` |
| Dataverse tables | `Apply and Apply All Trackings`, `CAPEX Account Lists`, `Countries`, `Country Inflation Profiles`, `Devex/Capex Standard Assumptions`, `Fabric Job Types`, `Fabric Sync Jobs`, `Generators`, `Land Lease Subaccounts`, `Opex Project Costs`, `Opex Subaccounts`, `SPVDevCo Mapping Capex Devexes` |

#### What it does

One country and one technology fix the scope, and a four-row accordion — DEVEX/CAPEX,
Operation & Maintenance, Land Lease, Other OPEX Costs — expands into a different editor for
each family. DEVEX/CAPEX edits `Devex/Capex Standard Assumptions` grouped by CAPEX account
category, with a cost amount, a unit, a distribution frequency and five cluster flags per row.
The other three share one editor over `OPEX & Land Lease Standard Assumptions`, organised as a
contract head (Period 1) plus up to nine follow-on periods, where editing Period 1 cascades
seventeen specific columns down to every later period. This is the master-data source the
whole Project Costs app reads, and it also writes an Apply audit trail for a recalculation
that, as shipped, never runs.

#### Depends on

- `src/domain/session.ts` — `canSeeAdminSection`, `canEditCountry`,
  `ADMIN_PAGE_TITLE["/admin/cost"]`
- `src/routes/AppRoutes.tsx` — the `RequireAdmin` guard
- Workstream S: `prvCreate`/`prvWrite`/`prvDelete` on
  `vsb_devexcapexstandardassumptions` and `vsb_opexlandleasestandardassumptions`, and the
  decision on `vsb_applyandapplyalltracking` and `vsb_fabricsyncjob`
- `src/features/admin-gates-approvals/rules.ts` — `COUNTRY_PICKER_ORDER`,
  `COST_CONTRACT_EXCLUDED_COUNTRIES`, `PICKER_TECHNOLOGIES`, `buildCountryPicker`,
  `technologyValue`, `technologyLabel`; **screen 1 must land first**
- `src/features/admin-capex-accounts/rules.ts` — `buildAccountTree`, `CAPEX_ROOT_NUMBER`;
  **screen 3 must land first**
- `src/features/admin-cost/plan.ts` — `PlannedWrite`, `WritePlan`, `emptyPlan`, `refusePlan`,
  shared by both cost families
- `src/domain/numeric.ts` — `isBlank`, `isInteger`, `inRange`, `formatInteger`
- `src/data/entities.ts` — `ES_ADMIN.devexCapexStandardAssumptions`,
  `ES_ADMIN.opexLandLeaseStandardAssumptions`, `ES_ADMIN.applyAndApplyAllTrackings`,
  `CHOICE_ADMIN.contractTypes`, `CHOICE_ADMIN.thresholdType`, `CHOICE_ADMIN.secured`,
  `CHOICE_ADMIN.applyAction`, `CHOICE_PRODUCTION.opexLandLeasePeriod`
- `src/data/repos.ts` — `devexCapexAssumptionRepo`, `adminOpexLandLeaseAssumptionRepo`,
  `capexAccountListRepo`, `adminOpexSubaccountRepo`, `landLeaseSubaccountRepo`,
  `applyTrackingRepo`, `countryRepo`, `countryInflationProfileRepo`
- `src/flows/flowClient.ts` — the typed wrapper for `SynchronizeStandardAssumptionCosts`,
  which throws because the flow is not in the solution export
- `src/components/` — `CountryRail` (tree variant), `Breadcrumb`, `DataGrid`, `CommandBar`,
  `FormPanel`, `ConfirmDialog`, `NumericInput`, `CurrencyInput`, `PercentageInput`,
  `PageHeader`, `Card`, `EmptyState`

#### Power Fx → TypeScript

##### pcf_LandLease_RightPanel_NewEditPeriod_BodyButtons_Save_1.OnChange — 211 lines → `buildOpexPayload()` and `nextPeriod()`

Decides the whole OPEX/Land Lease period payload, including which period a new row becomes.

```powerfx
IfError(
    UpdateContext(
        {
            locSelectedLandLeaseCost: Patch(
                'OPEX & Land Lease Standard Assumptions',
                If(
                    IsBlank(locSelectedLandLeaseCost),
                    Defaults('OPEX & Land Lease Standard Assumptions'),
                    LookUp(
                        colOpexandLandLeaseStandardAssumptions,
                        'OPEX & Land Lease Standard Assumptions' = locSelectedLandLeaseCost.'OPEX & Land Lease Standard Assumptions'
                    )
                ),
                {
                    Name: txt_LandLease_RightPanel_NewEditCost_BodyContent_Description_1.Value & " - " & cmp_Admin_Costs_Assumption_NestedCountryPickerColumn.SelectedCountry.Name & " - " & cmp_Admin_Costs_Assumption_NestedCountryPickerColumn.SelectedNestedValue,
                    Description: txt_LandLease_RightPanel_NewEditCost_BodyContent_Description_1.Value,
                    AllWTGAllocated: tgl_LandLease_RightPanel_NewEditContractPeriod_BodyContent_AllocationToAllWTGs.Checked,
                    'Land Lease Subaccount': locSelectedLandLeaseSubaccount,
                    'Type Of Contract': locSelectedCategory,
                    'Amount One-Time Payment': Value(txt_LandLease_RightPanel_NewEditCost_BodyContent_Amount_1.Value),
                    Secured: If(
                        tgl_LandLease_RightPanel_NewEditContractPeriod_BodyContent_Secured.Checked,
                        'Secured (OPEX & Land Lease Standard Assumptions)'.Yes,
                        'Secured (OPEX & Land Lease Standard Assumptions)'.No
                    ),
                    Period: Coalesce(
                        locSelectedLandLeaseCost.Period,
                        Switch(
                            locNextPeriodReferenceCost.Period,
                            'Opex & Land Lease Period'.'Period 1',
                            'Opex & Land Lease Period'.'Period 2',
// … [180 of the block's 211 lines omitted]
```

```typescript
export function nextPeriod(referencePeriod: number | null): number | null {
  const i = periodIndex(referencePeriod);
  if (i < 0) return PERIOD_ONE;             // the switch's default arm
  if (i >= PERIOD_SEQUENCE.length - 1) return null;   // Period 10 → blocked
  return PERIOD_SEQUENCE[i + 1];
}

export const canAddPeriod = (referencePeriod: number | null): boolean =>
  nextPeriod(referencePeriod) !== null;

export function buildOpexPayload(
  form: OpexPeriodForm,
  args: { /* … */ },
): Record<string, unknown> {
  const data: Record<string, unknown> = {
    // Rule 14.
    [OPEX_COL.name]:
      `${form.description.trim()} - ${args.scope.countryName ?? ""} - ${args.scope.technology ?? ""}`,
    [OPEX_COL.description]: form.description.trim(),
    [OPEX_COL.period]: args.period,
    [OPEX_COL.isLastPeriod]: args.isLastPeriod,
// … [22 lines omitted]
    // Rule 15 — omitted (written as null) when the country profile IS used.
    [OPEX_COL.inflationProfile]: form.useCountryInflationProfile
      ? null : numberOrNull(form.inflationProfile),
    [OPEX_COL.useInflationProfile]: form.inflation,
    [OPEX_COL.useCountryInflationProfile]: form.useCountryInflationProfile,
    [OPEX_COL.allWtgAllocated]: form.allWtgAllocated,
    // Rule 16.
    [OPEX_COL.secured]: form.secured ? CHOICE_ADMIN.secured.yes : CHOICE_ADMIN.secured.no,
// … [8 lines omitted]
    // Rule 15's literal. The numeric `'Inflation Start Year'` column is deliberately not
    // written — that `Patch` argument is commented out in the source.
    [OPEX_COL.inflationStartYearString]: INFLATION_START_YEAR_LITERAL,
  };
```

**Shape change** — the ten-arm `Switch` for the period successor becomes a sequence index, and
the crucial behavioural change is that Period 10 now returns `null` and blocks the add: the
canvas `Switch` falls through to its default arm and silently creates a **second Period 1**,
overwriting the contract's own head row. The `Patch(…, If(IsBlank(x), Defaults(...),
LookUp(colOpexandLandLeaseStandardAssumptions, …)))` pattern — a client-side lookup into a
whole-table `ClearCollect` — becomes a typed payload plus an id, and the whole-table collection
becomes the `['opexAssumptions', scope]` query. `IfError(..., Notify(...))` becomes an
`AppError` surfaced once instead of a duplicate dialog-plus-toast.
**Pinned by** — UT-ADCOST-009, UT-ADCOST-010, UT-ADCOST-011, UT-ADCOST-011b, UT-ADCOST-024,
UT-ADCOST-025, UT-ADCOST-026.

##### cmp_PopUp_Confirmation_Delete_Contract_Or_Period.OnConfirm — 120 lines → `planDeleteOpexPeriodOrContract()`

Decides whether a delete removes one period or the entire contract, and which row becomes the
new tail.

```powerfx
    UpdateContext(
        {
            locContractOrPeriodToDelete: locSelectedLandLeaseCost,
            locSecondLastPeriod: First(
                LastN(
                    Sort(
                        Filter(
                            colOpexandLandLeaseStandardAssumptions,
                            If(
                                Not(IsBlank(locSelectedOAndMSubaccount.'Opex Subaccount')),
                                'Opex Subaccount'.'Opex Subaccount' = locSelectedOAndMSubaccount.'Opex Subaccount',
                                Not(IsBlank(locSelectedOtherOpexSubaccount.'Opex Subaccount')),
                                'Opex Subaccount'.'Opex Subaccount' = locSelectedOtherOpexSubaccount.'Opex Subaccount',
                                Not(IsBlank(locSelectedLandLeaseSubaccount.'Land Lease Subaccount')),
                                'Land Lease Subaccount'.'Land Lease Subaccount' = locSelectedLandLeaseSubaccount.'Land Lease Subaccount'
                            ),
                            Country.Country = cmp_Admin_Costs_Assumption_NestedCountryPickerColumn.SelectedCountry.Country,
                            Text(Technology) = cmp_Admin_Costs_Assumption_NestedCountryPickerColumn.SelectedNestedValue,
                            'Type Of Contract' = locContractOrPeriodToDelete.'Type Of Contract'
                        ),
                        Description,
                        SortOrder.Ascending
                    ),
                    2
                )
            )
        }
    );
// … [92 of the block's 120 lines omitted]
```

```typescript
export function planDeleteOpexPeriodOrContract(args: {
  target: OpexPeriodRow;
  /** Every period of the same contract, including the target. */
  contractPeriods: OpexPeriodRow[];
  canEdit: boolean;
}): WritePlan {
  if (!args.canEdit) return refuse("This country is outside your editable country scope.");
  const plan = emptyPlan();

  if (args.target.period === PERIOD_ONE) {
    for (const p of args.contractPeriods) {
      plan.writes.push({
        op: "delete", entitySet: OPEX_ENTITY_SET, id: p.id,
        reason: `${periodLabel(p.period)} deleted with the contract`,
      });
    }
    plan.log.push(`Deleted the whole contract (${args.contractPeriods.length} period(s)).`);
    return plan;
  }

  plan.writes.push({
    op: "delete", entitySet: OPEX_ENTITY_SET, id: args.target.id,
    reason: `${periodLabel(args.target.period)} deleted`,
  });

  const remaining = args.contractPeriods.filter((p) => p.id !== args.target.id);
  const newTail = remaining
    .slice()
    .sort((a, b) => periodIndex(b.period) - periodIndex(a.period))[0];
  if (newTail && !newTail.isLastPeriod) {
    plan.writes.push({
      op: "update", entitySet: OPEX_ENTITY_SET, id: newTail.id,
      data: { [OPEX_COL.isLastPeriod]: true },
      reason: `${periodLabel(newTail.period)} becomes the last period`,
    });
  }
  return plan;
}
```

**Shape change** — the canvas picks the new tail with
`First(LastN(Sort(<set>, Description, Ascending), 2))`, i.e. by **description order**, and
nothing makes descriptions monotonic because the user types them; the wrong row is therefore
flagged `IsLastPeriod? = Yes` and the contract grows a second tail. The rebuild takes the
highest remaining period. The scope predicate — a five-clause `Filter` over a whole-table
collection with a three-arm `If` for which subaccount lookup applies — is replaced by
`contractPeriods` already narrowed server-side, so the delete rule is a pure function over a
list. `newTailCanvasParity` keeps the source behaviour reachable.
**Pinned by** — UT-ADCOST-014, UT-ADCOST-015, UT-ADCOST-015b.

##### cmp_PopUp_Confirmation_Apply_And_ApplyAll.OnConfirm — 134 lines → `planApplyTracking()`

Decides whether an audit row is written claiming a recalculation happened.

```powerfx
UpdateContext(
    {
        locSelectedApplyAndApplyAllTracking: With(
            {
                locAction: If(
                    IsBlank(locSelectedCategory),
                    'Action? (Apply and Apply All Trackings)'.'Apply All',
                    'Action? (Apply and Apply All Trackings)'.Apply
                )
            },
            Patch(
                'Apply and Apply All Trackings',
                If(
                    IsBlank(locSelectedApplyAndApplyAllTracking),
                    Defaults('Apply and Apply All Trackings'),
                    locSelectedApplyAndApplyAllTracking
                ),
                {
                    Name: cmp_Admin_Costs_Assumption_NestedCountryPickerColumn.SelectedCountry.Name & " - " & cmp_Admin_Costs_Assumption_NestedCountryPickerColumn.SelectedNestedValue & " - " & Text(locAction),
                    Country: cmp_Admin_Costs_Assumption_NestedCountryPickerColumn.SelectedCountry,
                    Technology: Switch(
                        cmp_Admin_Costs_Assumption_NestedCountryPickerColumn.SelectedNestedValue,
                        "PV", Technology.PV,
                        "Wind", Technology.Wind,
                        "BESS", Technology.BESS,
                        "Hydro", Technology.Hydro
                    ),
                    'Action?': locAction,
                    'Applied By Email': User().Email,
                    'Applied By Full Name': User().FullName,
                    'Contract Type': locSelectedCategory
                }
            )
        )
    }
);
// … [98 of the block's 134 lines omitted]
```

```typescript
export const APPLY_NOT_RUN_REASON =
  "No tracking row is written: the recalculation this row would claim to record is not "
  + "enabled. SynchronizeStandardAssumptionCosts is not in the solution export and both "
  + "Apply buttons ship disabled.";

export function planApplyTracking(args: {
  scope: CostScope;
  /** `null` means Apply ALL (rule 34's `IsBlank(locSelectedCategory)`). */
  contractType: number | null;
  existing: ApplyTrackingRow | null;
  user: { mail: string; displayName: string };
  bopStandardContractId?: string | null;
  mode?: "correct" | "canvasParity";
}): WritePlan {
  if ((args.mode ?? "correct") === "correct") {
    return { writes: [], log: [APPLY_NOT_RUN_REASON], refusedReason: APPLY_NOT_RUN_REASON };
  }

  const action = args.contractType === null
    ? CHOICE_ADMIN.applyAction.applyAll
    : CHOICE_ADMIN.applyAction.apply;
  const actionText = action === CHOICE_ADMIN.applyAction.applyAll ? "Apply All" : "Apply";
// … [30 lines omitted]
}
```

**Shape change** — the audit write is inverted from a side effect into an explicit opt-in.
The canvas writes the row and recalculates nothing, because the `Fabric Sync Jobs` patch and
the `SynchronizeStandardAssumptionCosts.Run(...)` that follow it are inside a `/* … */`
comment and both Apply buttons ship `DisplayMode.Disabled`; the "last applied" badges then
present that row as fact. `mode: "correct"` returns an empty plan with a reason;
`mode: "canvasParity"` reproduces the upsert exactly. `User().Email` / `User().FullName` become
explicit arguments rather than ambient identity, which is what lets the tracking row move
server-side later.
**Pinned by** — UT-ADCOST-042, UT-ADCOST-043, UT-ADCOST-043b, UT-ADCOST-043c, UT-ADCOST-044,
UT-ADCOST-045.

##### btn_Filter_Devex_Capex_Assumptions.OnSelect — 84 lines → `groupByCategory()` and `isScopeChosen()`

Decides which DEVEX/CAPEX categories and costs render for the chosen scope — and, in the
canvas, what happens when no scope has been chosen at all.

```powerfx
ClearCollect(
    colDevexCapexassumptions1,
    Ungroup(
        ForAll(
            Filter(
                colCapexAccountCategories As CT,
                !IsBlank(
                    LookUp(
                        'Devex/Capex Standard Assumptions',
                        And(
                            Category.'CAPEX Account List' = CT.'CAPEX Account List',
                            Country.Country = Coalesce(
                                cmp_Admin_Costs_Assumption_NestedCountryPickerColumn.SelectedCountry.Country,
                                First(col_cmpCountryPickerItems).Country
                            ),
                            Lower(Text(Technology)) = Lower(
                                Coalesce(
                                    cmp_Admin_Costs_Assumption_NestedCountryPickerColumn.SelectedNestedValue,
                                    "Wind"
                                )
                            )
                        )
                    )
                )
            ) As Cat,
            Table(
                {
                    Category: Cat,
                    IsParent: true,
                    IsFolded: If(
                        IsBlank(locSelectedDevexCapexCategory),
                        true,
                        Cat.'CAPEX Account List' = locSelectedDevexCapexCategory.'CAPEX Account List',
                        false,
                        true
                    )
                },
// … [47 of the block's 84 lines omitted]
```

```typescript
export function groupByCategory(
  categories: CategoryRef[],
  costs: DevexCost[],
  expanded: ReadonlySet<string>,
): DevexRow[] {
  const rows: DevexRow[] = [];
  for (const category of [...categories].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) {
    const mine = costs
      .filter((c) => c.categoryId === category.id)
      .sort((a, b) => (a.description ?? "").localeCompare(b.description ?? ""));
    if (mine.length === 0) continue;
    rows.push({ kind: "category", category, costCount: mine.length });
    if (expanded.has(category.id)) {
      for (const cost of mine) rows.push({ kind: "cost", category, cost });
    }
  }
  return rows;
}

export const isScopeChosen = (scope: DevexScope): boolean =>
  Boolean(scope.countryId) && Boolean(scope.technology);
```

**Shape change** — a ninety-line `Ungroup(ForAll(Filter(… Table({…}, SortByColumns(AddColumns(
Filter(…)))))))` inside one button's `OnSelect`, producing a mixed-shape flat list in which
child rows carried raw `vsb_*` logical names and parent rows carried display names, becomes a
selector over typed rows plus a `Set<string>` of expanded ids. The security-relevant half is
`isScopeChosen`: the canvas `Coalesce`s a blank picker to *the first country and Wind*, so an
admin who has not chosen a scope is shown, and can edit, some other country's standard costs
while believing they are looking at nothing. The rebuild issues no query until both halves are
picked. `defaultScopeCanvasParity` keeps the fallback reachable for comparison only.
**Pinned by** — UT-ADCOST-027, UT-ADCOST-027b, UT-ADCOST-028, UT-ADCOST-040, UT-ADCOST-029,
UT-ADCOST-048.

##### pcf_btn_AdminCost_RightPanel_Form_AddStandardCost_Button_Save.OnChange — 65 lines → `buildStandardCostPayload()`

Decides the DEVEX/CAPEX standard-cost payload, including the two composed text columns.

```powerfx
UpdateContext(
    {
        locSelectedStandardCost: Patch(
            'Devex/Capex Standard Assumptions',
            If(
                IsBlank(locSelectedStandardCost),
                Defaults('Devex/Capex Standard Assumptions'),
                locSelectedStandardCost
            ),
            {
                Name: $"Standard Cost : {cmp_Admin_Costs_Assumption_NestedCountryPickerColumn.SelectedCountry.Name}-{cmp_Admin_Costs_Assumption_NestedCountryPickerColumn.SelectedNestedValue}-{cmb_AdminCost_RightPanel_Form_AddCost_Fields_Subaccount.Selected.Name}",
                'Cluster 1': chk_AdminCost_RightPanel_SelectCluster1.Checked,
                'Cluster 2': chk_AdminCost_RightPanel_SelectCluster2.Checked,
                'Cluster 3': chk_AdminCost_RightPanel_SelectCluster3.Checked,
                'Cluster 4': chk_AdminCost_RightPanel_SelectCluster4.Checked,
                'Cluster 5': chk_AdminCost_RightPanel_SelectCluster5.Checked,
                Description: $"Standard {cmb_AdminCost_RightPanel_Form_AddCost_Fields_Subaccount.Selected.Name} - {txt_AdminCost_RightPanel_Form_AddCost_Fields_Description.Value}",
                'Description Input': txt_AdminCost_RightPanel_Form_AddCost_Fields_Description.Value,
                Country: cmp_Admin_Costs_Assumption_NestedCountryPickerColumn.SelectedCountry,
                Technology: Switch(
                    cmp_Admin_Costs_Assumption_NestedCountryPickerColumn.SelectedNestedValue,
                    "PV", Technology.PV,
                    "Wind", Technology.Wind,
                    "BESS", Technology.BESS,
                    "Hydro", Technology.Hydro
                ),
                Unit: cmb_AdminCost_RightPanel_Form_AddCost_Fields_Unit.Selected.Value,
                'Apply VAT': chk_AdminCost_RightPanel_Form_AddCost_Fields_ApplyVat.Checked,
                Depreciation: chk_AdminCost_RightPanel_Form_AddCost_Fields_Depreciation.Checked,
                'Distribution Frequency': cmb_AdminCost_RightPanel_Form_AddCost_Fields_Distribution_Frequency.Selected.Value,
                'Cost Amount': Value(txt_AdminCost_RightPanel_Form_AddCost_Fields_Cost.Value),
// … [34 of the block's 65 lines omitted]
```

```typescript
export function buildStandardCostPayload(
  form: DevexForm,
  args: {
    scope: DevexScope;
    subaccountName: string;
    owningBusinessUnitId: string | null;
    isCreate: boolean;
  },
): Record<string, unknown> {
  const data: Record<string, unknown> = {
    [DEVEX_COL.name]: composeStandardCostName(
      args.scope.countryName, args.scope.technology, args.subaccountName,
    ),
    [DEVEX_COL.description]: composeStandardCostDescription(
      args.subaccountName, form.description,
    ),
    [DEVEX_COL.descriptionInput]: form.description.trim(),
    [DEVEX_COL.costAmount]: Number(String(form.cost).replace(",", ".")),
    [DEVEX_COL.unit]: form.unit,
    [DEVEX_COL.costPaidBy]: form.costPaidBy,
    [DEVEX_COL.comment]: form.comment.trim() === "" ? null : form.comment.trim(),
    [DEVEX_COL.distributionFrequency]: form.distributionFrequency,
    [DEVEX_COL.cluster1]: form.clusters[0],
// … [24 lines omitted]
  if (args.owningBusinessUnitId) {
    data[`${DEVEX_LOOKUP.owningBusinessUnit}@odata.bind`] =
      `/businessunits(${args.owningBusinessUnitId})`;
  }
  return data;
}
```

**Shape change** — twenty-odd direct control references become one `DevexForm` value object,
so the save is testable without rendering; the two composed strings get their own named
functions (`composeStandardCostName`, `composeStandardCostDescription`) rather than being
inline `$"…"` interpolations; the technology `Switch` — which spells its fourth arm `"Hydro"`
here and `"Hydrogen"` on the Gates screen — is resolved once upstream by the shared
case-insensitive `technologyValue`; and the lookups are written only on create, so an edit
cannot silently re-point a cost at a different country or subaccount.
**Pinned by** — UT-ADCOST-032, UT-ADCOST-033, UT-ADCOST-034, UT-ADCOST-036, UT-ADCOST-037,
UT-ADCOST-038, UT-ADCOST-038b, UT-ADCOST-039, UT-ADCOST-046.

#### Security conditions

`rules.ts` carries a boxed `SOURCE DEFECT` banner. Across 9 286 lines of Power Fx there is
exactly **one** `DataSourceInfo`, and it gates the DEVEX/CAPEX "Add Cost" button; the
OPEX/Land Lease family has no privilege check at all, so any of its actions is available to
anyone who reaches the screen. `OnVisible` never evaluates `gblCurrentUser`, and entry is
gated only by
`ItemVisible: Or(gblCurrentUser.IsApplicationAdministrator, gblCurrentUser.IsControllerOwnData)`
on the nav items. Worse, the row-level checks that do exist **fail open**: the DEVEX/CAPEX row
Edit and Delete wrap `RecordInfo(LookUp(…), …)` in an `IsBlank(...)` short-circuit that yields
`DisplayMode.Edit` when the lookup misses. As with screen 3, the rebuild's own
`useCostPrivileges` still derives `canCreate`/`canWrite`/`canDelete` from
`isApplicationAdministrator` / `isControllerOwnData`, which is a role-name derivation contrary
to CONVENTIONS rule 4 and must be replaced with a server privilege read.

| Condition | Canvas today | Where it must be enforced |
|---|---|---|
| Only a cost-master-data administrator may reach the screen | `ItemVisible: Or(IsApplicationAdministrator, IsControllerOwnData)` on the nav item; `OnVisible` never reads `gblCurrentUser` | `prvWrite` is the real gate, not read: the Project Costs app needs `prvRead` on both assumption tables for every project role. Grant `prvWrite` on `vsb_devexcapexstandardassumptions` and `vsb_opexlandleasestandardassumptions` at Organization scope to `VSB - Application Administrator` and Business Unit scope to `VSB - Controller Own Data` only |
| Only an administrator may create a DEVEX/CAPEX standard cost | `DataSourceInfo('Devex/Capex Standard Assumptions', CreatePermission)` on the Add-Cost button — the one real privilege read on the screen | `prvCreate` on `vsb_devexcapexstandardassumptions` for the two admin roles; `planSaveStandardCost`'s `canCreate` must be fed from a server privilege response, not `useCostPrivileges`'s role names |
| Only an administrator may create, change or delete an OPEX or Land Lease period | **No privilege check whatsoever** — the OPEX family's saves, deletes and cascades are open to anyone on the screen | `prvCreate`, `prvWrite` and `prvDelete` on `vsb_opexlandleasestandardassumptions` at the two admin scopes. This is a deliberate tightening over the shipped app and must be stated as such in the change record |
| A row action must not be enabled when the privilege cannot be determined | `IsBlank(LookUp('Devex/Capex Standard Assumptions', … = ThisItem.vsb_devexcapexstandardassumptionsid))` short-circuits to `DisplayMode.Edit`, so a missing lookup **enables** the button | `rowActionEnabled(privilege)` treats `undefined` as denied on the client; server-side the control is record-level `prvWrite`/`prvDelete` on `vsb_devexcapexstandardassumptions` evaluated by Dataverse, so a fail-open client is harmless |
| A user may only edit their own countries' standard costs | `gblCurrentUser.EditableCounties` is never read; the picker is a hard-coded literal excluding Spain, Greece and Romania | Business-Unit-scoped `prvWrite` on both assumption tables — the rows carry `owningbusinessunit`, written on save — **plus** a pre-operation plug-in on Create and Update of each table rejecting a `vsb_country` outside the caller's country-scoped role set (the server twin of `canEditScope`) |
| A blank scope must not resolve to someone else's data | `Coalesce(…SelectedCountry.Country, First(col_cmpCountryPickerItems).Country)` and `Coalesce(…SelectedNestedValue, "Wind")` — a blank picker silently means "first country, Wind" | `isScopeChosen` blocks the query on the client. Server-side, the same country plug-in makes an accidental write to the defaulted country fail rather than succeed quietly |
| The client must not choose the row's owning business unit | Written on save from the picker's country selection | A pre-operation plug-in sets `owningbusinessunit` from `vsb_Country`'s business unit and discards the client value; do not grant `prvAssign` on either assumption table |
| An Apply audit row must not be creatable by a client | The row **is** written and nothing is recalculated; the delete handler writes one too, tagged "Apply All" because the cleanup blanked `locSelectedCategory` first | Withhold `prvCreate` and `prvWrite` on `vsb_applyandapplyalltracking` from every interactive role. The row belongs to the `SynchronizeStandardAssumptionCosts` replacement — a custom API that writes it when the work completes |
| A recalculation job must not be creatable by a client | Both `Patch('Fabric Sync Jobs', …)` blocks are commented out, and the flow is absent from the solution export | Withhold `prvCreate` on `vsb_fabricsyncjob` from every interactive role; the job row is created inside the same custom API |
| A cost amount and unit must respect their bounds | Client-side only: `COST_MAX` 100 000 000 with `COST_MAX_LENGTH` 10, integer-only, `CONTRACT_COSTS_MAX` 1 000 000 000, and per-WTG units only for Wind | Column-level `Min`/`Max`/`Precision` metadata on `vsb_costamount` and the one-time-payment amount columns, plus a pre-operation plug-in enforcing the unit-versus-technology rule that `isUnitValid` applies on the client |
| A contract must not exceed ten periods | The `Switch` falls through and creates a second Period 1 | A pre-operation plug-in on Create of `vsb_opexlandleasestandardassumptions` rejecting a row whose `vsb_period` already exists for that subaccount, country, technology and contract type — the server twin of `canAddPeriod` |

#### Deliberate divergences

- **No permission check on the OPEX family, and a fail-open one on DEVEX/CAPEX.** The rebuild
  adds `RequireAdmin`, gates every plan on `canEditScope`, and adds a privilege gate to the
  OPEX family that the shipped app lacks — a deliberate tightening. Parity functions:
  `canEditScope`, `rowActionEnabled`.
- **Period 10 wrapped to Period 1.** The canvas `Switch` has no successor for Period 10 and
  falls through to its default, silently creating a second Period 1 over the contract head.
  The rebuild blocks the add with `ADD_PERIOD_BLOCKED_REASON`. Parity functions: `nextPeriod` /
  `nextPeriodCanvasParity`.
- **The new tail was chosen by description order.** `First(LastN(Sort(<set>, Description,
  Ascending), 2))` flags the wrong row `IsLastPeriod? = Yes` whenever descriptions are not
  monotonic, giving the contract two tails. The rebuild takes the highest remaining period.
  Parity functions: `planDeleteOpexPeriodOrContract` / `newTailCanvasParity`,
  `recomputeLastPeriodFlags`.
- **A blank scope defaulted to the first country and Wind.** The rebuild renders an empty state
  and issues no query. Parity functions: `isScopeChosen` / `defaultScopeCanvasParity`.
- **Deleting a standard cost also wrote an Apply audit row.** The whole Apply block is appended
  to `btn_AdminCost_DevexCapex_Delete_StandardCost_Confirm.OnSelect`, and because the cleanup
  blanks `locSelectedCategory` first, every deletion is recorded as an "Apply All" that never
  ran. The rebuild's plan contains the delete and nothing else. Parity function:
  `planDeleteStandardCost`, pinned by UT-ADCOST-041.
- **The Apply audit trail records work that never happens.** Both Apply buttons ship
  `DisplayMode.Disabled` and the flow is not in the export, yet the tracking row is written and
  the "last applied" badges read it back. The rebuild writes nothing by default. Parity
  function: `planApplyTracking` (`mode: "canvasParity"`), `applyCommandState`.
- **Case-sensitive versus case-insensitive technology comparison.** The OPEX gallery compares
  `Text(Technology) = …SelectedNestedValue`, the DEVEX/CAPEX builder compares
  `Lower(...) = Lower(...)`, so the two grids could disagree about the same row. One comparison
  now. Parity function: `sameTechnology`, pinned by UT-ADCOST-029.
- **The seventeen-column Period-1 cascade** is declared once in `CASCADE_COLUMNS`, with
  `NON_CASCADE_COLUMNS` as its complement, because getting the list wrong silently rewrites
  every later period of every contract. Parity functions: `cascadeFieldsFromPeriodOne`, pinned
  by UT-ADCOST-012 and UT-ADCOST-013.

#### Build steps

1. Land screens 1 and 3 first — this feature imports `buildCountryPicker` /
   `technologyValue` from `admin-gates-approvals/rules.ts` and `buildAccountTree` from
   `admin-capex-accounts/rules.ts`.
2. Land the privileges on `vsb_devexcapexstandardassumptions` and
   `vsb_opexlandleasestandardassumptions`, withhold `prvCreate` on
   `vsb_applyandapplyalltracking` and `vsb_fabricsyncjob`, and replace `useCostPrivileges`'s
   role-name derivation with a server privilege read.
3. Write `plan.ts` and the shared half of `rules.ts` — `COST_CATEGORIES`, `CostScope`,
   `canEditScope`, `costRailLeafKey`, `costBreadcrumb`, `APPLY_*`.
4. Write `opexRules.ts` — `splitOpexSubaccounts`, `canAddContractType`, `filterByScope`,
   `nextPeriod` and its parity twin, `paymentSectionsFor`, `recomputeLastPeriodFlags`,
   `CASCADE_COLUMNS`, `cascadeFieldsFromPeriodOne`, `validateOpexPeriod`, `buildOpexPayload`,
   `planSaveOpexPeriod`, `planDeleteOpexPeriodOrContract`.
5. Write `devexRules.ts` — `groupByCategory`, `isScopeChosen`, the unit and amount rules,
   `validateDevexForm`, `buildStandardCostPayload`, `planSaveStandardCost`,
   `planDeleteStandardCost`, `rowActionEnabled`.
6. Write the dead-path rules explicitly — `applyCommandState`, `planApplyTracking`,
   `synchronizeArgs`, `costTypeWireValue` — so they are reviewable rather than absent.
7. Write all 66 cases in `rules.test.ts`, including all four parity twins, and get
   `UT-ADCOST-001…053` green before any JSX exists.
8. Write `hooks.ts` — `['capexTree']`, `['opexAssumptions', scope]`, `['devexCapex', scope]`,
   `useApplyTracking`, and `useRunCostPlan` handing a plan to one `dataClient.batch`.
9. Compose `Screen.tsx` — the `CountryRail` tree, the `Breadcrumb`, the four-row accordion, the
   two right panels, and a `ConfirmDialog` in front of every delete.

#### Exit gate

`npx vitest run src/features/admin-cost` reports 66 passing cases covering `UT-ADCOST-001`
through `UT-ADCOST-053`, `npx tsc --noEmit` emits nothing for the folder,
`cascadeFieldsFromPeriodOne` yields exactly 17 keys and none of `NON_CASCADE_COLUMNS`
(`UT-ADCOST-012`, `UT-ADCOST-013`), `planApplyTracking` in its default mode returns zero
writes (`UT-ADCOST-043b`), and a POST to `vsb_applyandapplyalltrackings` from an interactive
user is rejected by Dataverse with 403. The gate additionally fails while `useCostPrivileges`
computes privileges from role names: `grep -n
"isApplicationAdministrator\|isControllerOwnData" src/features/admin-cost/hooks.ts` must
return nothing, and revoking `prvCreate` on `vsb_devexcapexstandardassumptions` for a user
who still holds `VSB - Application Administrator` must disable Add Cost in the running app
(`UT-ADCOST-030` passing against a mocked privilege is not sufficient on its own).

---
### 5. Admin Contract Screen — `src/features/admin-contract/`

| | |
|---|---|
| Canvas unit | `PM::Admin Contract Screen` (PM app) |
| Power Fx | `88` blocks ≥3 lines · `43` ≥10 · `13` ≥30 · `1965` lines in those blocks (`3985` across all `=` properties) |
| Complexity | band `M` · score `22.7` · `9` build-days |
| Code app | `Screen.tsx` 606 ln · `hooks.ts` 269 ln · `rules.test.ts` 607 ln · `rules.ts` 927 ln |
| Pure rules exported | `61` |
| Unit tests | `47` cases · IDs `UT-ADCONTR-001…040` |
| Dataverse tables | `Apply and Apply All Trackings`, `BoP Contracts Standard Assumption DevCo Costs`, `BoP Contracts Standard Assumptions`, `BoP Projects Contracts`, `CAPEX Account Lists`, `Countries`, `Fabric Job Types`, `Fabric Sync Jobs` |

#### What it does

The screen maintains the BoP standard contract assumptions for one country × technology pair: up to ten Development Contracts and ten Construction Contracts, each carrying a description, a closing-date reference with a signed month offset, an optional margin expressed as either a percentage or a fixed value, a comment, and the set of level-3 CAPEX subaccounts that the contract owns as DevCo costs. Each subaccount may belong to at most one contract inside a scope, so opening the editing panel classifies every account in the tree as owned by this contract, owned by another contract, or free, and the tri-state parent checkboxes summarise each group. Saving writes the contract row plus the reconciled child creates and deletes, and stamps `Owning Business Unit` as the row-security anchor; deleting removes the contract and, in the rebuild, its children rather than trusting an unverified cascade. The Apply and Apply-to-All commands ship disabled and stay disabled, because the flow they call is not in the solution export.

#### Depends on

- `src/domain/session.ts` — `canEditCountry`, `canSeeAdminSection`, `CurrentUser`; the scope gate this screen adds.
- `src/domain/navigation.ts` — `PM_ADMIN_NAV` (the `ContractSettingKey` rail entry) and `railTree`.
- `src/domain/numeric.ts` — `isBlank`, `isOneDecimal`, `isTwoDecimal`, `inRange` for the margin and month-difference validators.
- `src/features/admin-capex-accounts/rules.ts` — `buildAccountTree`, `flattenTree`, `CapexAccount`, `AccountNode`; the tree is shared, not rebuilt.
- `src/features/admin-gates-approvals/rules.ts` — `buildCountryPicker`, `COST_CONTRACT_EXCLUDED_COUNTRIES`, `PICKER_TECHNOLOGIES`, `technologyValue`, `technologyLabel`.
- `src/features/admin-cost/rules.ts` — `APPLY_TRACKING_COL`, `ApplyTrackingRow`, `lastAppliedLabel`, `showLastApplied`, `findLastApply`.
- `src/data/entities.ts` — `ES_ADMIN.bopContractsStandardAssumptions`, `ES_ADMIN.bopDevCoCosts`, `CHOICE_ADMIN`, `CAPEX_CONTRACT_TREE_EXCLUDED_NUMBER`.
- `src/data/repos.ts` — `bopContractRepo`, `bopDevCoCostRepo`, `capexAccountListRepo`, `countryRepo`, `applyTrackingRepo`.
- `src/platform/dataClient.ts` (`batch`, `create`), `src/platform/odata.ts` (`f.and`, `f.eq`, `f.guid`, `asc`), `src/platform/errors.ts` (`AppError`, `Result`), `src/platform/telemetry.ts` (`trace`).
- `src/flows/flowClient.ts` — the `SynchronizeStandardAssumptionCosts` wrapper, which throws because the flow is absent from the export.
- `src/components/` — `PageHeader.tsx`, `CommandBar.tsx`, `FormPanel.tsx`, `ConfirmDialog.tsx`, `LoadingOverlay.tsx`, `EmptyState.tsx`, `Card.tsx`, `NumericInput.tsx`.
- `src/routes/AppRoutes.tsx` — the `admin/contract` route and its `RequireAdmin` wrapper.
- Dataverse privileges on `vsb_bopcontractsstandardassumptionses` and `vsb_bopcontractsstandardassumptiondevcocostses` must exist before this screen is considered done — see Security conditions.

#### Power Fx → TypeScript

##### ico_AdminContracts_Save.OnChange — 153 lines → `planSaveContract()`

Decides the whole save: the contract upsert payload, and which DevCo cost children are created and deleted so the account ownership inside the scope stays exclusive.

```powerfx
// 1. UI FEEDBACK: Immediate Blocking Spinner
UpdateContext(
    {
        locIsVisibleBoPStandardAssumptionContract: false,
        varCurrentContractId: locSelectedBoPStandardContract.'BoP Contracts Standard Assumptions',
        locContractSpinnerInformationText: "Please wait, saving...",
        locIsContractVisiblePopUpSpinner: true
    }
);
                    {
                        Name: Text(locContractTypeBoPAssumption) & " - " & txt_Add_Edit_AdminContracts_Description.Value,
                        Description: txt_Add_Edit_AdminContracts_Description.Value,
                        Country: cmp_AdminContraacts_NestedCountryPickerColumn.SelectedCountry,
                        Technology: varCurrentTech,
                        'Closing Date Reference': rad_Contracts_RightPanel_NewEdit_CostsUntilClosingDate.Selected.Value,
                        'Month Difference': If(
                            drp_Add_Edit_AdminContracts_MonthDifference_AddSub.Selected.Value = "+",
                            Value(txt_Add_Edit_AdminContracts_MonthDifference_Month.Value),
                            Value(txt_Add_Edit_AdminContracts_MonthDifference_Month.Value) * -1
                        ),
                        Margin: rad_Add_Edit_AdminContracts_RightPanel_NewEdit_Margin.Selected.Value,
// … [132 of the block's 153 lines omitted]
```

```typescript
export function planSaveContract(args: {
  form: ContractForm;
  type: BopContractType;
  scope: ContractScope;
  existing: BopContract | null;
  contractId: string | null;
  before: Map<string, AccountSelection>;
  after: Map<string, AccountSelection>;
  tree: AccountNode[];
  owningBusinessUnitId: string | null;
  canEdit: boolean;
  language?: string;
}): WritePlan {
  const selectedCount = [...args.after.values()].filter((a) => a.selected && !a.used).length;
  if (!args.canEdit) return refuse(MSG.outOfScope);
  const errors = validateContract(args.form, {
    selectedCount, isEdit: args.existing !== null, language: args.language,
  });
  if (errors.length > 0) return refuse(errors[0]);

  const plan = emptyPlan();
  const payload = buildContractPayload(args.form, {
    type: args.type, scope: args.scope, isCreate: args.existing === null,
  });
// … [13 lines omitted]
  const { toDelete, toCreate } = reconcileDevCoCosts(args.before, args.after);
  for (const id of toDelete) {
    plan.writes.push({
      op: "delete", entitySet: DEVCO_COST_ENTITY_SET, id,
      reason: "CAPEX account released by this contract",
    });
  }
// … [23 lines omitted]
}
```

**Shape change** — the canvas sequence `Patch` → `RemoveIf` → bulk `Patch` → two `Refresh`es → local `Collect`/`UpdateIf` (five operations that can half-apply) becomes one pure `WritePlan` of typed writes that `hooks.ts` sends as a single `$batch`; the `IfError` wrapper becomes a `Result<number>` carrying an `AppError`, and the refusal path is a `refusedReason` on the plan rather than a toast. `Text(locContractTypeBoPAssumption) & " - " & …` becomes `composeContractName()`, and the sign dropdown plus text box collapse into `signedMonthDifference()`. The `Margin`/`Margin Type` `If` cascade becomes `marginFields()`, which returns nulls for the branch that does not apply so the two amount columns can never both be populated.
**Pinned by** — UT-ADCONTR-025, UT-ADCONTR-026, UT-ADCONTR-036, UT-ADCONTR-020, UT-ADCONTR-020b, UT-ADCONTR-022, UT-ADCONTR-023.

##### Admin Contract Screen.OnVisible — 279 lines → `useBopContracts()`

Loads everything the screen reads; in the canvas, four of the five loads are whole-table pulls with no country or technology predicate.

```powerfx
Concurrent(
    UpdateContext(
        {
            locIsVisibleBoPStandardAssumptionContract: false,
            locContractTypeBoPAssumption: Blank(),
            locContractsCostsMax: 1000000000,
            locContractDevCoCostsDirty: false,
            locIsVisiblePopUpDeleteContract: false,
            locContractSpinnerInformationText: "Saving Contract data...",
            locIsContractVisiblePopUpSpinner: false,
            locIsVisibleApplyTracking: false,
            locSelectedBoPStandardContractForApply: Blank(),
            locFabricSyncCostJob: Blank()
        }
    ),
    ClearCollect(
        colApplyAndApplyAllTracking,
        'Apply and Apply All Trackings'
    ),
    ClearCollect(
        colAdminContracts,
        AddColumns(
            'BoP Contracts Standard Assumptions',
            IsFolded,
            true
        )
    ),
// … [252 of the block's 279 lines omitted]
```

```typescript
export function useBopContracts(scope: ContractScope) {
  const enabled = Boolean(scope.countryId && scope.technologyValue !== null);
  const q = useQuery({
    queryKey: contractKeys.contracts(scope),
    enabled,
    queryFn: async () =>
      (await bopContractRepo.listAll({
        filter: f.and(
          f.guid(BOP_CONTRACT_COL.country, scope.countryId!),
          f.eq(BOP_CONTRACT_COL.technology, scope.technologyValue!),
        ),
        orderBy: [asc(BOP_CONTRACT_COL.contractTypes), asc(BOP_CONTRACT_COL.name)],
      })).map(toBopContract),
  });
  return { contracts: q.data ?? [], isLoading: q.isLoading, isError: q.isError };
}
```

**Shape change** — `colAdminContracts`, `col_Costs_Flat_Cache`, `col_Global_DevCoCosts` and `colApplyAndApplyAllTracking` (four unfiltered `ClearCollect`s) become three scoped `useQuery` calls plus one server-filtered tracking query, keyed on `countryId:technology`; the `AddColumns(…, IsFolded, true)` decoration disappears because fold state is one `expandedId` in React state, and the `AddColumns(…, CategoryName, 'CAPEX Account'.Name)` name resolution becomes `@OData.Community.Display.V1.FormattedValue` read in `toDevCoCost()`. The `UpdateContext` block of ten locals splits between component state and the constants `CONTRACT_COSTS_MAX` and `MSG`.
**Pinned by** — UT-ADCONTR-002, UT-ADCONTR-032.

##### btn_Edit_AdminContracts.OnSelect — 61 lines → `classifyAccounts()`

Decides, for every selectable CAPEX account in the scope, whether this contract owns it, another contract owns it, or it is free to claim.

```powerfx
// 1. REFRESH DATASOURCE
Refresh('BoP Contracts Standard Assumptions');

// 2. INITIALIZE COLLECTION (Reset to base state)
ClearCollect(
    col_Edit_DevCoCosts,
    SortByColumns(colCapexAllAccounts, "Nummer", SortOrder.Ascending)
);
        // 4. ITERATE AND FLAG (Classify: Selected vs Used)
        ForAll(
            varScopeCosts As Source,
            UpdateIf(
                col_Edit_DevCoCosts,
                Id = Source.'CAPEX Account'.'CAPEX Account List',
                {
                    // Selected = It belongs to ME
                    Selected: (Source.'BoP Contract Standard Assumption'.'BoP Contracts Standard Assumptions' = varCurrentContractId),

                    // Used = It belongs to SOMEONE ELSE
                    Used: (Source.'BoP Contract Standard Assumption'.'BoP Contracts Standard Assumptions' <> varCurrentContractId),

                    // Metadata for tooltips/debugging
                    UsedInContractDevCo: Source.'BoP Contract Standard Assumption'.'BoP Contracts Standard Assumptions',
                    ContractDevCo: Source.'BoP Contracts Standard Assumption DevCo Costs'
                }
            )
        )
    )
);
// … [35 of the block's 61 lines omitted]
```

```typescript
export function classifyAccounts(
  tree: AccountNode[],
  devCoCosts: DevCoCost[],
  currentContractId: string | null,
): Map<string, AccountSelection> {
  const out = new Map<string, AccountSelection>();
  for (const node of selectableNodes(tree)) {
    out.set(node.id, {
      accountId: node.id, selected: false, used: false,
      usedByContractId: null, devCoCostId: null,
    });
  }
  for (const cost of devCoCosts) {
    if (!cost.capexAccountId) continue;
    const entry = out.get(cost.capexAccountId);
    if (!entry) continue;
    const mine = currentContractId !== null && cost.contractId === currentContractId;
    out.set(cost.capexAccountId, {
      accountId: cost.capexAccountId,
      selected: mine,
      used: !mine,
      usedByContractId: mine ? null : cost.contractId,
      devCoCostId: mine ? cost.id : null,
    });
  }
  return out;
}
```

**Shape change** — an `UpdateIf` over a local collection, keyed by a lookup traversal (`Source.'CAPEX Account'.'CAPEX Account List'`) evaluated per row, becomes a `Map<string, AccountSelection>` built in one pass over a typed array; the `Selected`/`Used` pair of Power Fx booleans becomes fields on a typed entry that also carries `devCoCostId`, so the reconcile step knows which row to delete instead of re-deriving it. The `varTargetTechnology` "Delegation Fix" `With` disappears — the technology integer is already on `ContractScope`. `Refresh(...)` becomes React Query invalidation in `useSaveContract`.
**Pinned by** — UT-ADCONTR-006, UT-ADCONTR-007, UT-ADCONTR-005, UT-ADCONTR-003, UT-ADCONTR-004.

##### btnGeneralPurposeReset.OnSelect — 56 lines → `contractCapReached()`

Decides whether the two Add buttons may open the panel — the ten-per-type cap for the current country and technology.

```powerfx
// 4. RE-CALCULATE LIMIT CHECKS
UpdateContext(
    {
        locDevContractLimitExceeded: CountIf(
            colAdminContracts,
            Country.Name = cmp_AdminContraacts_NestedCountryPickerColumn.SelectedCountry.Name && Text(Technology) = cmp_AdminContraacts_NestedCountryPickerColumn.SelectedNestedValue && 'Contract Types' = 'BoP Contract Types'.'Development Contract'
        ) >= 10,
        locConstructionContractLimitExceeded: CountIf(
            colAdminContracts,
            Country.Name = cmp_AdminContraacts_NestedCountryPickerColumn.SelectedCountry.Name && Text(Technology) = cmp_AdminContraacts_NestedCountryPickerColumn.SelectedNestedValue && 'Contract Types' = 'BoP Contract Types'.'Construction Contract'
        ) >= 10
    }
);
// … [43 of the block's 56 lines omitted]
```

```typescript
export function countContracts(
  contracts: BopContract[],
  scope: ContractScope,
  type: BopContractType,
): number {
  return contracts.filter((c) =>
    c.countryId === scope.countryId
    && c.technology === scope.technologyValue
    && c.contractType === CONTRACT_TYPE_VALUE[type]).length;
}

export const contractCapReached = (
  contracts: BopContract[],
  scope: ContractScope,
  type: BopContractType,
): boolean => countContracts(contracts, scope, type) >= CONTRACT_CAP;
```

**Shape change** — two `UpdateContext` locals computed once, on `OnVisible` and on a general-purpose reset button, become a pure function of the live query result, so the cap cannot go stale after an in-screen save; the country and technology comparison moves off related-entity *names* (`Country.Name`, `Text(Technology)`) onto the lookup GUID and the raw choice integer on `ContractScope`; the literal `10` becomes `CONTRACT_CAP`. The enforcement changes from a `Notify(..., NotificationType.Warning)` fired after the click to a disabled button — see Deliberate divergences.
**Pinned by** — UT-ADCONTR-027, UT-ADCONTR-028, UT-ADCONTR-029, UT-ADCONTR-037.

##### cmp_PopUp_Confirmation_Apply_Tracking.OnConfirm — 119 lines → `applyCommandState()`

Decides what Apply and Apply-to-All do; the answer, as shipped, is nothing.

```powerfx
UpdateContext(
    {
        locIsVisibleApplyTracking: false,
        locIsContractVisiblePopUpSpinner: true,
        locContractSpinnerInformationText: "Applying Standard Contracts, Syncing Job in Progress....."
    }
);
/*
UpdateContext(
    {
        locFabricSyncCostJob: Patch(
            'Fabric Sync Jobs',
// … [107 of the block's 119 lines omitted]
```

```typescript
export interface ApplyCommandState {
  enabled: false;
  disabledReason: string;
}

export const applyCommandState = (): ApplyCommandState => ({
  enabled: false,
  disabledReason: MSG.applyDisabled,
});

export function synchronizeBopArgs(args: {
  scope: ContractScope;
  contractId: string | null;
}): { costType: "BoP"; countryId: string | null; technology: number | null; text_3: string } {
  return {
    costType: "BoP",
    countryId: args.scope.countryId,
    technology: args.scope.technologyValue,
    text_3: args.contractId ?? "All",
  };
}
```

**Shape change** — a 119-line handler whose payload half sits inside a `/* … */` comment becomes a two-field state object whose `enabled` is the literal type `false`, so a later edit cannot re-enable the command by accident; the commented `SynchronizeStandardAssumptionCosts.Run("BoP", …)` call signature is preserved as `synchronizeBopArgs()`, and the typed wrapper in `src/flows/flowClient.ts` throws because the flow is absent from the solution export. The eight formulas that read the *Cost* screen's picker (`cmp_Admin_Costs_Assumption_NestedCountryPickerColumn`) become a `scope` parameter, so no component reads another feature's state.
**Pinned by** — UT-ADCONTR-033, UT-ADCONTR-034, UT-ADCONTR-032.

#### Security conditions

| Condition | Canvas today | Where it must be enforced |
|---|---|---|
| Reaching the contract admin screen at all | No check of any kind. `brief.py` reports `PERMISSION SIGNALS: none` — no `DataSourceInfo`, no `RecordInfo`, no `gblCurrentUser` test in the whole screen. Entry is hidden only by `ItemVisible: Or(gblCurrentUser.IsApplicationAdministrator, gblCurrentUser.IsControllerOwnData)` on the badge item and the `LeftAdminNavigationMenu` rows | `prvReadvsb_bopcontractsstandardassumption` granted at Organization scope on `VSB - Application Administrator` and `VSB - Controller Own Data` only, and removed from `VSB - Project Data All Countries`, `VSB - Project Data Own Country` and `VSB - Project Manager Own Projects`, so the Web API returns 403 rather than the screen returning rows. `RequireAdmin` in `src/routes/AppRoutes.tsx` is UI hiding one layer up, not this |
| Creating or editing a BoP standard contract | None. `Patch('BoP Contracts Standard Assumptions', …)` runs for whoever reaches the panel | `prvCreatevsb_bopcontractsstandardassumption` and `prvWritevsb_bopcontractsstandardassumption` at Business Unit scope on the two admin roles; `canEditScope()` refusing the plan is the client half only |
| Editing a country the user does not administer | `gblCurrentUser.EditableCounties` is never read on this screen. Scope comes from hard-coded picker literals in `buildCountryPicker` (Spain, Greece and Romania excluded; Wind and PV nested only) | Business-Unit-scoped Write on `vsb_bopcontractsstandardassumption`, plus a synchronous pre-operation plug-in on Create and Update of that table that rejects a payload whose `vsb_Country` resolves to a business unit outside the caller's, so the country cannot be swapped after the picker |
| `Owning Business Unit` on the written row | Written from the client payload on save; nothing validates it. It is the only row-security anchor the data has | The same pre-operation plug-in must *set* `owningbusinessunit` server-side from the resolved country rather than accept the client's value — a client-supplied owning BU is a client-supplied security boundary |
| Claiming or releasing a CAPEX subaccount (DevCo cost children) | None. Exclusivity is enforced only by the client-side `classifyAccounts` / `Used` flag; the child `Patch` and `RemoveIf` have no check | `prvCreatevsb_bopcontractsstandardassumptiondevcocost` and `prvDeletevsb_bopcontractsstandardassumptiondevcocost` at Business Unit scope, plus a synchronous pre-operation plug-in on Create of that table that rejects a `vsb_CAPEXAccount` already claimed by another contract in the same country and technology. Without it, two concurrent admins both pass the client check and both write |
| Seeing and changing the margin figures | None; `Margin Percentage` and `Margin Fixed Value` are ordinary columns any reader of the table can read and write | A Dataverse Field Security Profile over `vsb_marginpercentage` and `vsb_marginfixedvalue` on `vsb_bopcontractsstandardassumption`, with Read and Update granted only to the `VSB - Controller Own Data` and `VSB - Application Administrator` teams — these two columns are the commercial content of the row |
| Writing an Apply / Apply-All tracking row | Both buttons ship `DisplayMode: =DisplayMode.Disabled`, yet the shipped app still writes `Apply and Apply All Trackings` rows for work that never runs | `prvCreatevsb_applyandapplyalltracking` granted to no role until the `SynchronizeStandardAssumptionCosts` flow is actually in the solution; then at Business Unit scope on the two admin roles |
| Deleting a contract and its children | `Remove('BoP Contracts Standard Assumptions', …)` on the parent only; whether the children cascade is not visible from the app source | `prvDeletevsb_bopcontractsstandardassumption` at Business Unit scope, and a cascade behaviour of `Cascade Delete` declared on the `vsb_BoPContractStandardAssumption` relationship so an orphaned child can never keep an account locked. `planDeleteContract` deletes the children explicitly, which is correct either way but is not the enforcement |

#### Deliberate divergences

- **No permission signal at all** — the canvas has no screen-level or server-side check; the rebuild adds `RequireAdmin` on the route and a `canEdit` argument that every write-producing rule refuses without. The header block in `rules.ts` states plainly that the route guard is not security. Parity functions: `canEditScope()` (new, no canvas twin).
- **The ten-contract caps go stale** — the canvas computes `locDevContractLimitExceeded` / `locConstructionContractLimitExceeded` in `OnVisible` only, and enforces them with a `Notify(...)` toast fired *after* the Add click, so the user presses Add, gets a warning and nothing happens. The rebuild disables the Add buttons from the live contract list. Parity function: none kept — `contractCapReached()` replaces both locals.
- **The tri-state parent checkbox compares against the total, not the available, child count** — a parent with any used child can never read fully CHECKED. Kept, because the box then answers "does this contract own the whole group?", and flipping it would make a parent look complete while another contract still owns part of the group. Parity function: `parentTriStateAvailableSemantics()`, unit-tested alongside `parentTriState()` so the decision is reversible in one place.
- **`RootCapexAccount` is omitted from the child create** — the canvas create payload leaves the lookup blank even though the collapsed card reads `RootCapexAccount.Order` and `RootCapexAccount.Name`, so a newly created row renders with a blank account name. The rebuild derives the level-2 ancestor from the tree and includes it. Parity function: `rootAccountFor()` feeding `buildDevCoCostPayload()`.
- **Eight formulas read the Cost screen's country picker** — `cmp_Admin_Costs_Assumption_NestedCountryPickerColumn` exists only on `Admin Cost Screen`, so the "last applied" badges and the commented Fabric job can describe a scope this screen never had. The rebuild passes scope as a parameter everywhere. Parity function: `synchronizeBopArgs()`.
- **No duplicate-description check** — the canvas has none and none was added; `duplicateDescriptionCheckExists()` returns the literal `false` so the absence is asserted rather than assumed.
- **Delete leaves the children to an unverified cascade** — the rebuild deletes them explicitly in the same batch, because an orphaned child keeps a CAPEX account locked forever. Parity function: none; `planDeleteContract()` documents the change in place.
- **Dead code reproduced as dead** — the `Fabric Sync Jobs` patch, the `SynchronizeStandardAssumptionCosts` call and its `Notify` all sit inside a `/* … */` comment in the authoritative `.pa.yaml`, and both Apply buttons ship disabled. Parity function: `applyCommandState()`, whose `enabled` field is typed as the literal `false`.

#### Build steps

1. Add the Dataverse privileges and the two pre-operation plug-ins from the Security conditions table, and confirm a non-admin caller gets 403 from the Web API on both entity sets.
2. Add `bopContractRepo`, `bopDevCoCostRepo` and `applyTrackingRepo` to `src/data/repos.ts` with the `BOP_CONTRACT_COL` / `DEVCO_COST_COL` select lists.
3. Write `rules.ts`'s columns, choice maps, `MSG`, `CONTRACT_CAP` and `CONTRACT_COSTS_MAX`, and the tree helpers that delegate to `admin-capex-accounts`.
4. Write the classification, tri-state and reconcile rules — `classifyAccounts`, `parentTriState`, `parentTriStateAvailableSemantics`, `parentToggleEnabled`, `toggleParent`, `toggleAccount`, `reconcileDevCoCosts`.
5. Write the form, validation and payload rules — `toContractForm`, `signedMonthDifference`, `marginFields`, `validateContract`, `canSaveContract`, `canEditScope`, `buildContractPayload`, `buildDevCoCostPayload`.
6. Write `planSaveContract`, `planDeleteContract`, `groupCostsForCard` and `applyCommandState`, each returning a `WritePlan` or a plain state object.
7. Write `rules.test.ts` to 47 cases covering UT-ADCONTR-001…040 including the parity twins, and run `npx vitest run src/features/admin-contract`.
8. Write `hooks.ts` — the four scoped queries, `runPlan`, and `useSaveContract`'s create-then-batch split for the child `@odata.bind`.
9. Compose `Screen.tsx` from `PageHeader`, `CommandBar`, the country/technology scope bar, the contract accordion, the `FormPanel` account tree and `ConfirmDialog`; verify `npx tsc --noEmit` is clean for the feature.

#### Exit gate

`npx vitest run src/features/admin-contract` passes all 47 cases including UT-ADCONTR-029 (the cap recomputed from the live list) and UT-ADCONTR-026 (`RootCapexAccount` present on a created child), `npx tsc --noEmit | grep features/admin-contract` is empty, and a signed-in user holding neither `VSB - Application Administrator` nor `VSB - Controller Own Data` receives an HTTP 403 — not an empty grid — from a direct `POST /api/data/v9.2/vsb_bopcontractsstandardassumptionses`.

---
### 6. Admin Project Default Checklists Screen — `src/features/admin-default-checklists/`

| | |
|---|---|
| Canvas unit | `PM::Admin Project Default Checklists Screen` (PM app) |
| Power Fx | `44` blocks ≥3 lines · `16` ≥10 · `5` ≥30 · `561` lines in those blocks (`1343` across all `=` properties) |
| Complexity | band `S` · score `11.7` · `4` build-days |
| Code app | `Screen.tsx` 539 ln · `hooks.ts` 221 ln · `rules.test.ts` 381 ln · `rules.ts` 617 ln |
| Pure rules exported | `49` |
| Unit tests | `35` cases · IDs `UT-ADCHK-001…023` |
| Dataverse tables | `Check List Default Approvals`, `Checklist Country And Technologies`, `Project Default Approvals`, `Project Default Checklists`, `Project States` |

#### What it does

The screen maintains the per-country-per-technology default task list that seeds every new project's checklist. A tab strip over `Checklist Country And Technologies` picks the scope, and below it each gate — the `Project States` rows flagged `Is Visible On Checklist` — expands to show that gate's default tasks in order, with a description, a holding-task description, a gate-relevance flag, a completion-date flag and an active/inactive state. Adding or editing a task writes one row to `Project Default Checklists` with `Owning Business Unit` copied from the scope as the row-security anchor, and the gate a task belongs to is fixed at creation so a task can never move between gates. Deleting is a soft delete — `To Delete` set true, with every later sibling's order decremented in the same batch — and a task referenced by a gate approval whose mode is anything other than Only Notifications is locked against all four row actions.

#### Depends on

- `src/domain/session.ts` — `canSeeAdminSection` (entry), `canEditCountry` via `canEditScope` (per scope), `ADMIN_PAGE_TITLE["/admin/default-checklists"]`.
- `src/domain/navigation.ts` — `PM_ADMIN_NAV` (the `GatesSettingKey` rail entry) and `railTree`.
- `src/domain/numeric.ts` — `isBlank`, the whole of this screen's save gate.
- `src/data/entities.ts` — `ES_PROCESS.projectDefaultChecklists`, `CHOICE_ADMIN.status`, `CHOICE_ADMIN.statusReason`, `CHOICE_PROCESS.approvalMode.onlyNotifications`.
- `src/data/repos.ts` — `checklistCountryTechRepo`, `projectStateRepo`, `adminDefaultChecklistRepo`, `adminCheckListDefaultApprovalRepo`.
- `src/platform/dataClient.ts` (`batch`, `list`), `src/platform/odata.ts` (`f.and`, `f.eq`, `f.ne`, `f.guid`, `asc`, `desc`), `src/platform/errors.ts` (`AppError`, `Result`), `src/platform/telemetry.ts` (`trace`).
- `src/components/` — `PageHeader.tsx`, `DataGrid.tsx`, `CommandBar.tsx`, `FormPanel.tsx`, `ConfirmDialog.tsx`, `LoadingOverlay.tsx`, `EmptyState.tsx`, `StateChip.tsx`.
- `src/routes/AppRoutes.tsx` — the `admin/default-checklists` route and its `RequireAdmin` wrapper.
- Screen 5's work is not a prerequisite, but the Dataverse privileges on the six admin tables are shared, so they land once for both — see Security conditions.

#### Power Fx → TypeScript

##### pcf_but_Admin_Checklist_Form_Buttons_Save.OnChange — 78 lines → `planSaveTask()`

Decides the whole add-or-edit save: which columns are written, which are written only on create, and whether the write is issued at all.

```powerfx
UpdateContext(
    {
        locAdminLoadingDialog: true,
        locAdminLoadingDialogText: $"Checklist item '{txt_Admin_Checklist_Form_Fields_Name.Value}' will be saved, please wait..."
    }
);
IfError(
    With(
        {
            varSelectedChecklistEntity: If(
                IsBlank(locSelectedChecklistEntity),
                Patch(
                    'Project Default Checklists',
                    Defaults('Project Default Checklists'),
                    {
                        Name: Trim(txt_Admin_Checklist_Form_Fields_Name.Value),
                        Order: locTotalRows + 1,
                        'Associated Country And Technology': locSelectedCountryAndTechnology,
                        'Holding Task Description': Trim(txt_Admin_Checklist_Form_Fields_HoldingDescription.Value),
                        'Cluster State': If(
                            IsBlank(locSelectedChecklistEntity),
                            LookUp(
                                'Project States',
                                'Project State' = locSelectedCluster.'Project State'
                            ),
                            locSelectedChecklistEntity.'Cluster State'
                        ),
                        'Gate Relevance': tgl_GateRelevance_ChecklistForm.Checked,
                        'Is Completion Date': tgl_CompletionDate_ChecklistForm.Checked,
                        'Owning Business Unit': locSelectedCountryAndTechnology.'Owning Business Unit'
                    }
                ),
                locSelectedChecklistEntity
            )
        },
// … [43 of the block's 78 lines omitted]
```

```typescript
export function buildTaskPayload(form: TaskForm, ctx: SaveContext): Record<string, unknown> {
  const status = toStatusPair(form.active);
  const data: Record<string, unknown> = {
    [DEFAULT_CHECKLIST_COL.name]: form.description.trim(),
    [DEFAULT_CHECKLIST_COL.holdingTaskDescription]: form.holdingDescription.trim(),
    [DEFAULT_CHECKLIST_COL.gateRelevance]: form.gateRelevance === true,
    [DEFAULT_CHECKLIST_COL.isCompletionDate]: form.isCompletionDate === true,
    [DEFAULT_CHECKLIST_COL.statecode]: status.statecode,
    [DEFAULT_CHECKLIST_COL.statuscode]: status.statuscode,
  };

  if (ctx.existing === null) {
    // Rule 4 — the order is only ever written on create.
    data[DEFAULT_CHECKLIST_COL.order] = ctx.nextOrderValue;
    // Rule 8 — the gate comes from the command bar that opened the panel.
    data[`${DEFAULT_CHECKLIST_LOOKUP.clusterState}@odata.bind`] =
      `/vsb_projectstates(${ctx.gate.id})`;
    data[`${DEFAULT_CHECKLIST_LOOKUP.countryTech}@odata.bind`] =
      `/vsb_checklistcountryandtechnologies(${ctx.scope.id})`;
  }

  // Rule 9 — written on BOTH branches, exactly as the canvas does.
  if (ctx.scope.owningBusinessUnitId) {
    data[`${DEFAULT_CHECKLIST_LOOKUP.owningBusinessUnit}@odata.bind`] =
      `/businessunits(${ctx.scope.owningBusinessUnitId})`;
  }
  return data;
}

export function planSaveTask(form: TaskForm, ctx: SaveContext): WritePlan {
  if (!ctx.canEdit) return refuse(MSG.outOfScope);
  if (!isSaveEnabled(form)) return refuse(MSG.descriptionBlank);

  const data = buildTaskPayload(form, ctx);
  const plan = emptyPlan();
// … [13 lines omitted]
  return plan;
}
```

**Shape change** — the canvas create-then-update pair (a `Patch` with `Defaults(...)` followed by a second `Patch` that re-`LookUp`s the row it just created and rewrites six of the same columns) collapses to one POST, because nothing read the row in between. Related-record assignment (`'Associated Country And Technology': locSelectedCountryAndTechnology`) becomes an `@odata.bind` string, and `'Cluster State': If(IsBlank(...), LookUp('Project States', …), …)` becomes a create-only branch on `ctx.existing === null`, so the gate is structurally impossible to change on edit. `IfError` plus the `locAdminLoadingDialogText` error string becomes a `WritePlan` with a `refusedReason` and, in `hooks.ts`, a `Result<number>` carrying an `AppError`. `locTotalRows` — captured when the Add button was pressed — becomes `ctx.nextOrderValue`, read at save time by `readNextOrder()`.
**Pinned by** — UT-ADCHK-007, UT-ADCHK-008, UT-ADCHK-009, UT-ADCHK-010, UT-ADCHK-011, UT-ADCHK-012, UT-ADCHK-012b, UT-ADCHK-012c, UT-ADCHK-006b.

##### cmp_DeleteChecklistItem_AdminScreen.OnConfirm — 41 lines → `planDeleteTask()`

Decides what a delete actually writes: a soft-delete flag plus a decrement on every later sibling in the same scope and gate.

```powerfx
UpdateContext(
    {
        locSelectedChecklistEntity: Patch(
            'Project Default Checklists',
            LookUp(
                'Project Default Checklists',
                'Project Default Checklist' = locSelectedChecklistEntity.'Project Default Checklist'
            ),
            {'To Delete': true}
        )
    }
);
/*Remove(
    'Project Default Checklists',
    locSelectedChecklistEntity
);*/
ClearCollect(
    colTasksToReorder,
    Filter(
        'Project Default Checklists',
        'Associated Country And Technology'.'Checklist Country And Technology' = locSelectedChecklistEntity.'Associated Country And Technology'.'Checklist Country And Technology',
        'Cluster State'.'Project State' = locSelectedChecklistEntity.'Cluster State'.'Project State',
        Order > locSelectedChecklistEntity.Order
    )
);
ForAll(
    colTasksToReorder,
    Patch(
        'Project Default Checklists',
        ThisRecord,
        {Order: ThisRecord.Order - 1}
    )
);
UpdateContext({locAdminLoadingDialog: false})
// … [7 of the block's 41 lines omitted]
```

```typescript
export function compactOrdersAfterDelete(
  tasks: TaskRow[],
  deletedOrder: number,
): { id: string; order: number }[] {
  return tasks
    .filter((t) => t.toDelete !== true && (t.order ?? 0) > deletedOrder)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((t) => ({ id: t.id, order: (t.order ?? 0) - 1 }));
}

export function planDeleteTask(args: {
  target: TaskRow;
  siblings: TaskRow[];
  locked: boolean;
  canEdit: boolean;
}): WritePlan {
  if (!args.canEdit) return refuse(MSG.outOfScope);
  if (args.locked) return refuse(MSG.inUse);

  const plan = emptyPlan();
  plan.writes.push({
    op: "update", entitySet: CHECKLIST_ENTITY_SET, id: args.target.id,
    data: { [DEFAULT_CHECKLIST_COL.toDelete]: true },
    reason: `“${args.target.name}” marked deleted`,
  });
  for (const move of compactOrdersAfterDelete(args.siblings, args.target.order ?? 0)) {
    plan.writes.push({
      op: "update", entitySet: CHECKLIST_ENTITY_SET, id: move.id,
      data: { [DEFAULT_CHECKLIST_COL.order]: move.order },
      reason: `Order compacted to ${move.order}`,
    });
  }
  plan.log.push(`Deleted “${args.target.name}” and compacted ${plan.writes.length - 1} row(s).`);
  return plan;
}
```

**Shape change** — `ForAll(colTasksToReorder, Patch(...))` — N round-trips, each able to fail independently — becomes one `WritePlan` sent as a single `$batch`; `ClearCollect(colTasksToReorder, Filter(...))` becomes the `siblings` array the scoped query already holds, so the table is not re-scanned to compute a decrement. The soft-delete semantics are preserved exactly, commented-out `Remove(...)` included: the write is still `{'To Delete': true}` and `visibleTasks()` still filters on it. The in-use lock, which the canvas evaluated per row and per property, becomes a `locked` boolean derived once from `blockingChecklistIds()`, and a locked target refuses the plan rather than merely greying a button.
**Pinned by** — UT-ADCHK-015, UT-ADCHK-016, UT-ADCHK-016b, UT-ADCHK-013, UT-ADCHK-021.

##### Admin Project Default Checklists Screen.OnVisible — 31 lines → `defaultScope()`

Decides which country-and-technology scope is loaded when the screen opens, and which gates are shown.

```powerfx
UpdateContext(
    {
        locIsVisibleChecklistRightPanel: false,
        locSelectedChecklistEntity: Blank(),
        locAdminLoadingDialog: false,
        //locAdminLoadingTitle: "",
        locAdminLoadingDialogText: Blank(),
        locSelectedCountryAndTechnology: First(
            SortByColumns(
                'Checklist Country And Technologies',
                "vsb_name"
            )
        ),
        locSelectedCluster: Blank()
    }
);
// … [15 of the block's 31 lines omitted]
```

```typescript
export function defaultScope(scopes: ScopeRow[]): ScopeRow | null {
  return sortScopes(scopes)[0] ?? null;
}

/** The canvas behaviour of rule 1, kept for parity testing only. Not wired to the UI. */
export function defaultScopeCanvasParity(scopes: ScopeRow[]): ScopeRow | null {
  return [...scopes].sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""))[0] ?? null;
}

/** `tab_…_Association.Items` — `Sort(…, Order, SortOrder.Ascending)`. */
export const sortScopes = (scopes: ScopeRow[]): ScopeRow[] =>
  [...scopes].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

export const checklistGates = (states: GateRow[]): GateRow[] =>
  states
    .filter((s) => s.isVisibleOnChecklist === true)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
```

**Shape change** — an `UpdateContext` of six locals plus a `ClearCollect(colChecklistClusters, AddColumns(SortByColumns(Filter(...)), IsFolded, true))` becomes two cached reference queries (`useChecklistScopes`, `useChecklistGates`) with the filter and the ordering pushed into `$filter` and `$orderby`, and two pure selectors over their typed results. The `IsFolded` column patched onto every gate row disappears entirely — fold state is a `Set<string>` in the component, not data. `First(SortByColumns(..., "vsb_name"))` becomes `sortScopes(scopes)[0]`, which corrects the disagreement between the pre-selected scope and the highlighted tab; the original is retained as `defaultScopeCanvasParity()`.
**Pinned by** — UT-ADCHK-003, UT-ADCHK-003b, UT-ADCHK-022.

##### cmp_ActivateDeactiveChecklistItem_AdminScreen.OnConfirm — 19 lines → `toggleActivePatch()`

Decides what the row-level activate/deactivate action writes.

```powerfx
UpdateContext(
    {
        locAdminLoadingDialog: true,
        locAdminLoadingDialogText: $"Checklist item '{txt_Admin_Checklist_Form_Fields_Name.Value}' will be saved, please wait...",
        locIsVisiblePopUpActivationDefaultChecklist: false
    }
);
Patch(
    'Project Default Checklists',
    locSelectedChecklistEntity,
    {
        Status: If(
            locSelectedChecklistEntity.Status = 'Status (Project Default Checklists)'.Active,
            'Status (Project Default Checklists)'.Inactive,
            'Status (Project Default Checklists)'.Active
        )
    }
);
UpdateContext({locAdminLoadingDialog: false})
```

```typescript
export function toStatusPair(active: boolean): { statecode: number; statuscode: number } {
  return active
    ? { statecode: CHOICE_ADMIN.status.active, statuscode: CHOICE_ADMIN.statusReason.active }
    : { statecode: CHOICE_ADMIN.status.inactive, statuscode: CHOICE_ADMIN.statusReason.inactive };
}

export function toggleActivePatch(current: TaskRow): Record<string, unknown> {
  const nowActive = current.status !== CHOICE_ADMIN.status.active;
  const pair = toStatusPair(nowActive);
  return {
    [DEFAULT_CHECKLIST_COL.statecode]: pair.statecode,
    [DEFAULT_CHECKLIST_COL.statuscode]: pair.statuscode,
  };
}

/** The canvas behaviour of rule 11, kept for parity testing. Not wired to the UI. */
export function toggleActiveCanvasParity(current: TaskRow): Record<string, unknown> {
  return {
    [DEFAULT_CHECKLIST_COL.statecode]:
      current.status === CHOICE_ADMIN.status.active
        ? CHOICE_ADMIN.status.inactive
        : CHOICE_ADMIN.status.active,
  };
}
```

**Shape change** — a `Patch` of the single `Status` choice becomes a `statecode`/`statuscode` pair routed through `toStatusPair()`, the same function the panel save uses, so the two paths can no longer disagree; the choice literals `'Status (Project Default Checklists)'.Active` become `CHOICE_ADMIN.status` / `CHOICE_ADMIN.statusReason` integers from `src/data/entities.ts`. The `locAdminLoadingDialog` toggling pair around the write becomes the mutation's `isPending`. The one-column canvas behaviour survives as `toggleActiveCanvasParity()`.
**Pinned by** — UT-ADCHK-009, UT-ADCHK-017b.

##### ico_EnablelCompletionDate_TasksInClusterDefaultChecklist_AdminScreen.OnChange — 29 lines → `toggleCompletionDatePatch()`

Decides the completion-date flag write, and which caches a completion-date change invalidates.

```powerfx
UpdateContext(
    {
        locAdminLoadingDialog: true,
        locAdminLoadingDialogText: $"Completion Date for '{ThisItem.Name}' will be changed, please wait..."
    }
);
IfError(
    UpdateContext(
        {
            locSelectedChecklistEntity: Patch(
                'Project Default Checklists',
                LookUp(
                    'Project Default Checklists',
                    'Project Default Checklist' = ThisItem.'Project Default Checklist'
                ),
                {'Is Completion Date': Not(ThisItem.'Is Completion Date')}
            )
        }
    );
    UpdateContext({locAdminLoadingDialogText: $"Completion Date was successfully changed."});
    Refresh('Project Default Approvals'),
    UpdateContext({locAdminLoadingDialogText: $"Error: Completion Date could not be changed. Internal error: originated on {FirstError.Source}. Message: {FirstError.Message} {FirstError.Details.HttpResponse}"})
);
UpdateContext(
    {
        locAdminLoadingDialog: false,
        locAdminLoadingDialogText: Blank()
    }
);
```

```typescript
export const toggleCompletionDatePatch = (current: TaskRow): Record<string, unknown> => ({
  [DEFAULT_CHECKLIST_COL.isCompletionDate]: current.isCompletionDate !== true,
});
```

```typescript
function useInvalidateScope() {
  const qc = useQueryClient();
  return (s: MutationScope) => {
    void qc.invalidateQueries({ queryKey: adminChecklistKeys.tasks(s.scopeId, s.gateId) });
    // Rule 12's `Refresh('Project Default Approvals')` — a DIFFERENT table, refreshed
    // because a completion-date change alters what an approval means.
    void qc.invalidateQueries({ queryKey: adminChecklistKeys.approvals(s.scopeId, s.gateId) });
  };
}
```

**Shape change** — the inner `LookUp('Project Default Checklists', 'Project Default Checklist' = ThisItem.…)` disappears: the row id is already on the typed `TaskRow`, so no re-read is needed to address the update. `Not(ThisItem.'Is Completion Date')` becomes `current.isCompletionDate !== true`, which also normalises a blank to false. The `IfError` triple of `locAdminLoadingDialogText` assignments becomes one `AppError` surfaced in an inline banner, and `Refresh('Project Default Approvals')` — a different table — becomes the second `invalidateQueries` call in `useInvalidateScope`, which is why it is a two-key invalidation rather than one.
**Pinned by** — UT-ADCHK-017, UT-ADCHK-014.

#### Security conditions

| Condition | Canvas today | Where it must be enforced |
|---|---|---|
| Reaching this screen at all | No permission check. `OnVisible` never evaluates `gblCurrentUser`, never calls `DataSourceInfo` or `RecordInfo`. The whole admin area is hidden client-side by `ItemVisible: Or(gblCurrentUser.IsApplicationAdministrator, gblCurrentUser.IsControllerOwnData)` on the `"appSettingsKey"` badge item and every `LeftAdminNavigationMenu` row, and nothing else. A deep link or a residual `Navigate` gets the full editing UI and the writes succeed | `prvReadvsb_projectdefaultchecklists` granted at Organization scope only on `VSB - Application Administrator` and `VSB - Controller Own Data`, and removed from the three project roles, so a non-admin caller is refused by the platform rather than merely shown no menu item. `RequireAdmin` in `src/routes/AppRoutes.tsx` mirrors the same two roles and is the same client-side hiding one layer up |
| Adding or editing a default task | None. The `Patch('Project Default Checklists', …)` pair runs for whoever reaches the panel | `prvCreatevsb_projectdefaultchecklists` and `prvWritevsb_projectdefaultchecklists` at Business Unit scope on the two admin roles. `planSaveTask()` refusing on `canEdit` is the client half only |
| Soft-deleting a task, and re-sequencing its siblings | None. `{'To Delete': true}` and the `ForAll(… Patch({Order: Order - 1}))` compaction are ordinary writes on ordinary columns | A Dataverse Field Security Profile over `vsb_todelete` and `vsb_order` on `vsb_projectdefaultchecklists`, Update granted only to the two admin teams. These two columns *are* the delete control and the sequence control; leaving them unsecured means any writer of the table can hide a task from every project or reshuffle the gate |
| Editing a country-and-technology scope the user does not administer | `gblCurrentUser.EditableCounties` is never read on this screen. The scope axis is the `Checklist Country And Technologies` table, with no test against the caller | Business-Unit-scoped Write on `vsb_projectdefaultchecklists`, plus a synchronous pre-operation plug-in on Create and Update that resolves `vsb_AssociatedCountryAndTechnology` to its owning business unit and rejects the write when that unit is outside the caller's. `canEditScope()` is new in the rebuild and is the client half of exactly this check |
| `Owning Business Unit` on the written row | Copied from the selected scope row in the client payload, on both the create and the update branch. It is the row-level security anchor for every other user's read | The same pre-operation plug-in must assign `owningbusinessunit` server-side from the resolved scope row rather than accept the client's `@odata.bind`, so the security anchor is not client-supplied |
| Activating or deactivating a task | None. The row action patches `Status` and the panel patches `Status` and `Status Reason` — two paths, no check on either | `prvWritevsb_projectdefaultchecklists` plus the `SetStateDynamicEntity` message privilege on `vsb_projectdefaultchecklists`, granted to the two admin roles; and a pre-operation plug-in on Update that rejects a `statuscode` inconsistent with the `statecode` being written, so the two-path drift the rebuild fixed cannot be reintroduced by a direct API call |
| Editing or deleting a task that a gate approval depends on | A client-side `LookUp('Check List Default Approvals', … && 'Approval Mode' <> [@'Approval Mode'].'Only Notifications')`, re-evaluated per row and per property. Nothing stops the write | A synchronous pre-operation plug-in on Update and Delete of `vsb_projectdefaultchecklists` that queries `vsb_checklistdefaultapprovalses` for a row pointing at the target whose `vsb_approvalmodecode` is not Only Notifications, and throws. The lock protects live project gates, so it cannot live in the client |
| Reading the approval rows the lock is computed from | Unrestricted read of `Check List Default Approvals` | `prvReadvsb_checklistdefaultapprovals` at Business Unit scope on the two admin roles; the lock is only as trustworthy as the query behind it |

#### Deliberate divergences

- **No permission check on the screen at all** — the canvas gates the admin area with client-side `ItemVisible` only; the rebuild adds `RequireAdmin` on the route and an explicit `canEdit` on every write-producing rule, and states in the `rules.ts` header that neither is security. Parity function: `canEditScope()` (new, no canvas twin).
- **The pre-selected scope is not the highlighted tab** — `OnVisible` sets the scope to `First(SortByColumns('Checklist Country And Technologies', "vsb_name"))` while the tab strip sorts by `Order`, so the loaded scope and the selected-looking tab can disagree. The rebuild selects the first tab by `Order`. Parity function: `defaultScopeCanvasParity()`.
- **The row toggle and the panel toggle write different things** — rule 7 writes `Status` and `Status Reason` as a pair, rule 11 writes `Status` alone, so a task deactivated from the row keeps an Active `Status Reason` and reporting on `statuscode` gets two answers for one intent. Both paths now go through `toStatusPair()`. Parity function: `toggleActiveCanvasParity()`.
- **`locTotalRows` is captured at Add-click, and counts soft-deleted rows** — two admins adding concurrently compute the same `Order`, and an add after a delete reuses one. The rebuild reads the highest order at save time (`readNextOrder()`, `$orderby=vsb_order desc&$top=1`, soft deletes excluded), which narrows the window without closing it; the durable fix is a server-side allocation and is deliberately not built here. Parity function: `nextOrder()` kept beside `nextOrderFromHighest()`.
- **"Decativate" is misspelt in `cmp_PopUp_Confirmation.Title`** — corrected, with the correction named. Parity function: `activationTitle()`.
- **A dead copy-paste validator** — `txt_…_Name.OnChange` writes `UpdateIf(colPanelInverterFormValidation, …)`, a leftover from a generator screen whose collection is never created, read or displayed here. Not ported; no parity twin.
- **The create-then-update `Patch` pair** — the second `Patch` re-looked-up the row it had just created and rewrote six of the same columns; nothing read the row in between, so it is one POST. Pinned by UT-ADCHK-012c.

#### Build steps

1. Add the Dataverse privileges, the two field security profiles and the in-use plug-in from the Security conditions table, and confirm a non-admin caller gets 403 on `vsb_projectdefaultchecklistses`.
2. Add `checklistCountryTechRepo`, `projectStateRepo` and `adminCheckListDefaultApprovalRepo` to `src/data/repos.ts` with the column maps from `rules.ts`.
3. Write `rules.ts`'s four column maps, `DEFAULT_CHECKLIST_LOOKUP`, `MSG`, `DESCRIPTION_MAX_LENGTH` and `HOLDING_TRUNCATE_AT`.
4. Write the scope, gate and lock rules — `sortScopes`, `defaultScope`, `defaultScopeCanvasParity`, `checklistGates`, `visibleTasks`, `blockingChecklistIds`, `isTaskLocked`, `canEditScope`.
5. Write the form, ordering and status rules — `toTaskForm`, `isSaveEnabled`, `saveErrors`, `panelTitle`, `charCounter`, `truncateHolding`, `nextOrder`, `nextOrderFromHighest`, `compactOrdersAfterDelete`, `reorderPositions`, `toStatusPair`, `toggleActivePatch`, `toggleActiveCanvasParity`, `toggleCompletionDatePatch`.
6. Write `buildTaskPayload`, `planSaveTask`, `planDeleteTask` and `planReorderTasks`, each returning a `WritePlan`.
7. Write `rules.test.ts` to 35 cases covering UT-ADCHK-001…023 including both parity twins, and run `npx vitest run src/features/admin-default-checklists`.
8. Renumber the second `UT-ADCHK-022` — the id is used twice, at `rules.test.ts:128` ("an empty scope renders an empty grid") and `rules.test.ts:363` ("page title is verbatim") — so that a CI failure reporting UT-ADCHK-022 names one case rather than two unrelated ones.
9. Write `hooks.ts` — the four server-filtered queries, `readNextOrder`, `runPlan` and `useRunChecklistPlan` with its two-key invalidation.
10. Compose `Screen.tsx` from `PageHeader`, the scope `TabList`, the gate accordion over `DataGrid`, `CommandBar`, `FormPanel`, the reorder panel and `ConfirmDialog`; verify `npx tsc --noEmit` is clean for the feature.

#### Exit gate

`npx vitest run src/features/admin-default-checklists` passes all 35 cases including UT-ADCHK-015 (soft delete plus compaction as one batch) and UT-ADCHK-017b (both status columns written where the canvas wrote one), `npx tsc --noEmit | grep features/admin-default-checklists` is empty, and a direct `PATCH /api/data/v9.2/vsb_projectdefaultchecklistses(<id>)` from an account holding neither admin role is rejected with HTTP 403, as is a `PATCH` against a task referenced by a non-Only-Notifications gate approval.

---

## 9. Phase 2 — Project Management app screens

Twelve screens, 166 build-days, 1,647 logic blocks, 45,680 lines of Power Fx inside them (77,733
across all properties). This is 57% of the total effort and it is where the schedule actually lives.

The phase starts with the shell — App Loading and Project Main — then follows the left rail's
completeness chain, because the rail's icon colour encodes whether the prerequisite field on the
selected project is filled rather than which screen is selected. Recommended order
**7 → 8 → 9 → 10 → 15 → 16 → 12 → 11 → 13 → 14 → 17 → 18**, with the caveat in section 2.4 about
breaking the chain with fixtures.

Two screens deserve flagging before their sections. **Generators** is the largest UI rebuild in the
solution and ships with five stub equipment panels — inverter, substructure, storage, hydrogen and
substation — whose rules are complete and whose form fields write `{}`. **Checklist** ranks seventh
on composite complexity but first on data complexity, with nine tables in play and four flow calls,
so its flow dispositions must be settled before it starts.

---
### 7. App Loading Screen — `src/features/app-loading/`

| | |
|---|---|
| Canvas unit | `PM::App Loading Screen` (PM app) |
| Power Fx | `10` blocks ≥3 lines · `6` ≥10 · `3` ≥30 · `291` lines in those blocks (`515` across all `=` properties) |
| Complexity | band `XS` · score `2.0` · `2` build-days |
| Code app | `Screen.tsx` 53 ln |
| Pure rules exported | `0` |
| Unit tests | `0` cases · IDs `—` |
| Dataverse tables | `Assumptions Local Tax Frances`, `Assumptions Local Tax Germanies`, `Countries`, `Generators`, `Project States`, `Projects` |

#### What it does

This is the PM app's `StartScreen`, and all the user ever sees of it is a loading overlay. Behind that overlay the canvas screen pre-loads the German and French local-tax assumption tables in 2,000-row batches, a 500 ms timer polls `gblAppStarted && locLoading`, and when the app has started it fires a hidden dispatch button that reads the launch parameters: a `projectid` resolves the project, its country, the caller's edit permission on that record and the project header globals and deep-links to General Data, while a missing `projectid` clears the globals and goes to Project Main. It writes nothing. **There is no `rules.ts` in this feature and no test file of its own — 0 exports, 0 cases — because everything the screen did became routing and bootstrap:** the dispatch became `resolveLaunchRoute()` in `src/domain/navigation.ts`, the app-start work became `bootstrap()` in `src/platform/bootstrap.ts`, the guards became `RequireProject` and `RequireAdmin` in `src/routes/AppRoutes.tsx`, and what is left in `src/features/app-loading/Screen.tsx` is 53 lines of effect that resolves the route, selects the project and redirects.

#### Depends on

- `src/domain/navigation.ts` — `resolveLaunchRoute()`, `PM_NAV`, `PROJECT_SCOPED`, `isProjectScoped()`, `NEW_PROJECT_ROUTE`, `isNewProjectRequest()`. This is where the screen's logic actually lives.
- `src/domain/session.ts` — `buildCurrentUser`, `unionVsbRoles`, `deriveCountryScope`, `canEditSelectedProject`, `canSeeAdminSection`.
- `src/platform/bootstrap.ts` — `bootstrap()`, `useBootstrap()`, `bootstrapQueryKey`; the port of `App.OnStart`.
- `src/platform/powerClient.ts` — `readEnvironment()`, `dataMode`; supplies the user id, environment id and tenant id the canvas read from `User()` and the environment variables.
- `src/platform/dataClient.ts` — `list()` with `all: true`, whose `skipToken` loop replaces the 2,000-row batching.
- `src/routes/AppRoutes.tsx` — the index route rendering this screen, plus `RequireProject` and `RequireAdmin`.
- `src/features/shared/useProjectContext.ts` — `selectProjectById()`, `readPrivileges()`; the deep link's project resolution and the server-answered edit right.
- `src/store/appStore.ts` — `useAppStore`, `clearProject`, the session and env slices that replace `gblCurrentUser`, `gblRecordSelectedProject`, `gblProjectHeaderData` and `gblLeftNavigationSelected`.
- `src/components/LoadingOverlay.tsx` — the only thing this screen renders.
- Nothing else in the app may be built before this: every project-scoped screen reads `useProjectContext()`, and every admin screen sits behind `RequireAdmin`.

#### Power Fx → TypeScript

##### btn_Navigate_to_EditProjectScreen_Deeplinking.OnSelect — 68 lines → `resolveLaunchRoute()`

Decides where the app lands on launch: the portfolio list, or General Data with a deep-linked project.

```powerfx
If(
    IsBlank(Param("projectid")),
    Navigate(
        'Project Main Screen',
        ScreenTransition.Fade
    ),
    Set(
        gblRecordSelectedProject,
        LookUp(
            Projects,
            Project = GUID(Param("projectid"))
        )
    );
    Set(
        gblRecordSelectedProjectCountry,
        LookUp(
            Countries,
            Country = gblRecordSelectedProject.Country.Country
        )
    );
// … [48 of the block's 68 lines omitted]
```

```typescript
export function resolveLaunchRoute(
  app: AppId,
  params: URLSearchParams,
): { route: string; projectId?: string } {
  if (app === "cost") return { route: "/costs/capex" };

  const projectId = params.get("projectid") ?? undefined;
  const screen = (params.get("screen") ?? "").toLowerCase();

  if (!projectId) return { route: "/projects" };
  if (screen === "generators") return { route: "/project/generators", projectId };
  if (screen === "general" || screen === "") return { route: "/project/general", projectId };
  const known = PM_NAV.find((i) => i.route.endsWith(`/${screen}`));
  return { route: known?.route ?? "/project/general", projectId };
}
```

**Shape change** — `Navigate(<screen literal>, ScreenTransition.Fade)` becomes a route string returned by a pure function, so the whole launch decision is testable without a router; the `Set(gblRecordSelectedProject, LookUp(Projects, …))` side effect moves out of the decision entirely and becomes `selectProjectById()` called by the screen's effect, with the null case (a deep link to a project the caller cannot see or that no longer exists) handled explicitly rather than leaving a blank global behind. The `Switch(Text(Param("screen")), "general", …, "generators", …)` in `but_Main_Project_Overview_Header_Redirect_2.OnSelect` folds into the same function's `screen` branch, plus a `PM_NAV` lookup so a future rail item needs no new case. The three `ScreenTransition.Fade` arguments and the `Trace(...)` calls become `trace("information", "launch", …)` at one site.
**Pinned by** — UT-NAV-011, UT-NAV-012, UT-NAV-013, UT-NAV-014.

##### btn_To_Load_Edit_Project.OnSelect — 77 lines → `canEditSelectedProject()`

Decides whether the caller may edit the deep-linked project — the one genuine permission signal on this screen.

```powerfx
If(
    Not(IsBlank(Param("projectid"))),
    Trace($"OnSelect MainCommandBar: {gblSelectedRecordEditProject.Project}");
    Set(
        gblRecordSelectedProject,
        LookUp(
            Projects,
            ThisRecord.Project = GUID(Param("projectid"))
        )
    Set(
        gblCurrentUser,
        Patch(
            gblCurrentUser,
            {
                CanEditSelectedProject: And(
                    DataSourceInfo(
                        Projects,
                        DataSourceInfo.CreatePermission
                    ),
                    Coalesce(
                        RecordInfo(
                            gblRecordSelectedProject,
                            RecordInfo.EditPermission
                        ),
                        false
                    )
                )
            }
        )
    );
// … [47 of the block's 77 lines omitted]
```

```typescript
export function canEditSelectedProject(
  createPermission: boolean | undefined,
  editPermission: boolean | undefined,
): boolean {
  return Boolean(createPermission) && Boolean(editPermission ?? false);
}
```

```typescript
export interface CurrentUser extends UserProfile {
  /** `Lower(First(Split(Language(),"-")).Value)` */
  lang: string;
  roles: string[];
  isApplicationAdministrator: boolean;
  isControllerOwnData: boolean;
  isProjectDataAllCountries: boolean;
  isProjectManagerOwnProjects: boolean;
  isDeveloper: boolean;
  /** Set per screen from the record's own privileges — never assumed. */
  canEditSelectedProject: boolean;
  editableCountries: CountryScope[];
  editableCountriesAsString: string;
}
```

**Shape change** — `Patch(gblCurrentUser, {CanEditSelectedProject: …})`, which mutated a global in place and left every downstream screen reading whatever the last deep link had computed, becomes a pure two-argument function plus a `canEditSelectedProject` field that `buildCurrentUser()` initialises to `false` and each screen sets from that record's own privileges. `DataSourceInfo(Projects, CreatePermission)` and `Coalesce(RecordInfo(record, EditPermission), false)` become the `create` and `edit` booleans that `readPrivileges()` reads from the server; the `Coalesce(..., false)` is preserved as `Boolean(editPermission ?? false)`, so an unanswered probe reads as "no rights" rather than "allowed". The `Set(gblProjectHeaderData, {ID, Name, Technology, Capacity, Status, Approval})` record and the `Set(gblLeftNavigationSelected, LookUp(LeftNavigationMenu, …))` line become the store's project-header slice and the rail's selected key derived from the location.
**Pinned by** — UT-SES-009, UT-SES-011, UT-SES-012, UT-SES-013, UT-SES-014, UT-SES-015.

##### App Loading Screen.OnVisible — 75 lines → `dataClient.list()`

Decides how much data the app pulls before it will render anything — in the canvas, two whole tax tables for every user.

```powerfx
UpdateContext({locLoading: false});
// Get Fabric Table Data
// keep <= your app data row limit
Clear(colAssumptionsGermanyTaxSQL);
Clear(colAssumptionsFranceSQL);
// 1. Calculate the max rows outside the loop and store them
// 2. Run the batched collection
ForAll(
    Sequence(
        RoundUp(
            locAbsoluteMax / locBatchSize,
            0
        )
    ) As Batch,
    With(
        {
            // Pre-calculate the exact math boundaries here to avoid breaking delegation in the Filter
            locStartPoint: (Batch.Value - 1) * locBatchSize,
            locEndPoint: Batch.Value * locBatchSize
        },
// … [55 of the block's 75 lines omitted]
```

```typescript
        const client = powerClient();
        const first = await client.retrieveMultipleRecordsAsync<T>(entitySet, toOptions(q));
        let rows = unwrap(first, entitySet) ?? [];
        let token = first.skipToken;

        if (q.all) {
          // Replaces the canvas 2,000-row batch loops. Guard-railed so a mis-scoped
          // filter cannot walk an entire table.
          let guard = 0;
          while (token && guard++ < 40) {
            const page = await client.retrieveMultipleRecordsAsync<T>(
              entitySet, toOptions(q, token),
            );
            rows = rows.concat(unwrap(page, entitySet) ?? []);
            token = page.skipToken;
          }
          token = undefined;
        }
        return { rows, skipToken: token, totalCount: first.count };
```

**Shape change** — the pre-load is *gone*, not translated: `ForAll(Sequence(RoundUp(locAbsoluteMax / locBatchSize, 0)))` with its `locStartPoint` / `locEndPoint` arithmetic existed only to keep `Filter` delegable under the 2,000-row limit, and General Data queries those tables on demand instead, so nothing is materialised at launch. Where a full read genuinely is needed elsewhere, the batching becomes the `skipToken` loop above behind `all: true`, guard-railed to 40 pages so a mis-scoped filter cannot walk a table. `colAssumptionsGermanyTaxSQL` / `colAssumptionsFranceSQL` and the `First(SortByColumns(..., "vsb_row_num", Descending)).vsb_row_num` max-row probes have no counterpart at all, and `UpdateContext({locLoading: false})` becomes the query's own `isLoading`.
**Pinned by** — `describe("launch sequence")` in `src/domain/navigation.test.ts`, which asserts that a launch resolves a route and does nothing else. `src/platform/dataClient.ts` has no test file of its own.

##### Timer1.OnTimerEnd — 5 lines → `useBootstrap()`

Decides when the app is ready to leave the loading screen.

```powerfx
If(
    gblAppStarted && locLoading, // Wait for OnStart to finish
    Set(varStopTimer, true); // Stop looping
    Select(btn_To_Load_Edit_Project) // Proceed
)
```

```typescript
export const bootstrapQueryKey = ["bootstrap"] as const;

export function useBootstrap() {
  return useQuery({
    queryKey: bootstrapQueryKey,
    queryFn: bootstrap,
    staleTime: Infinity,
    retry: 1,
  });
}
```

```typescript
export default function AppLoadingScreen() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const clearProject = useAppStore((s) => s.clearProject);

  useEffect(() => {
    let cancelled = false;
    const target = resolveLaunchRoute("pm", params);
    trace("information", "launch", { route: target.route, projectId: target.projectId });

    (async () => {
      if (target.projectId) {
        const record = await selectProjectById(target.projectId);
        if (cancelled) return;
        if (!record) {
          // Deep link to a project the user cannot see, or that no longer exists.
          clearProject();
          nav("/projects", { replace: true });
          return;
        }
      } else {
        clearProject();
      }
      if (!cancelled) nav(target.route, { replace: true });
    })();

    return () => { cancelled = true; };
  }, [params, nav, clearProject]);

  return <LoadingOverlay mode="inline" label="Please wait..." />;
}
```

**Shape change** — a 500 ms polling timer plus two globals (`gblAppStarted`, `varStopTimer`) and a `Select()` on a hidden button become query state: `gblAppStarted` is `useBootstrap().isSuccess`, and the "proceed" step is an awaited `useEffect` with a `cancelled` flag so an unmount mid-resolve cannot navigate. `Select(btn_To_Load_Edit_Project)` — a control invoking another control's handler, the canvas's only way to share a code path — becomes a direct function call. The independent `App.OnStart` reads run concurrently inside `bootstrap()`, as the canvas `Concurrent(...)` intended, and the pure derivation is delegated to `src/domain/session.ts` so it is unit-tested.
**Pinned by** — `describe("role resolution")` and `describe("current user flags")` in `src/domain/session.test.ts` cover the pure derivation `bootstrap()` delegates to; the query wrapper itself has no test, and `Screen.tsx` has none either.

#### Security conditions

| Condition | Canvas today | Where it must be enforced |
|---|---|---|
| Deep-linking to a project the caller may not read | `LookUp(Projects, Project = GUID(Param("projectid")))` returns blank and the screen navigates anyway, leaving a blank `gblRecordSelectedProject` and a header full of empty fields | `prvReadvsb_project` at Business Unit scope for `VSB - Project Data Own Country` and User scope for `VSB - Project Manager Own Projects`, so the row is simply not returned. The code app then redirects: `selectProjectById()` returning null clears the project and sends the caller to `/projects` |
| Editing the deep-linked project | Genuinely checked, and correctly: `And(DataSourceInfo(Projects, DataSourceInfo.CreatePermission), Coalesce(RecordInfo(gblRecordSelectedProject, RecordInfo.EditPermission), false))` — server-answered on both halves. This is the one place in the PM app where the canvas asks the platform | Keep it. `prvCreatevsb_project` and `prvWritevsb_project` at the role's own scope, read per record through `readPrivileges()` and consumed by `canEditSelectedProject()`. Never derived from a role name — `CLAUDE.md` rule 4 |
| Pre-loading the German and French local-tax tables | `Clear(...)` then a batched `Collect(...)` of `'Assumptions Local Tax Germanies'` and `'Assumptions Local Tax Frances'` with **no filter and no permission test**, executed for every user on every launch | `prvReadvsb_assumptionslocaltaxgermany` and `prvReadvsb_assumptionslocaltaxfrance` at Organization scope granted only to the roles that actually price those countries. The rebuild removes the pre-load entirely, so the tables are read only by the screen that needs them and a caller without the privilege simply gets 403 there |
| Reaching an admin route by typing its URL after launch | Nothing on this screen. The admin area is hidden by `ItemVisible` on the nav items only | `RequireAdmin` in `src/routes/AppRoutes.tsx` is client-side hiding; the enforcement is the table privileges on the six admin tables listed in sections 5 and 6, without which a bare `fetch` reaches them regardless of route |
| Resolving the caller's roles and country scope at start-up | `App.OnStart` reads the caller's own roles directly and through team membership, then maps business unit to country. Read access to the role and team tables is itself unchecked | `prvReadRole`, `prvReadTeam` and `prvReadTeamMembership` at Business Unit scope on every VSB role — `bootstrap()` needs them, and `readRoles()` already swallows a failure into an empty role set, so a missing privilege degrades to "no capabilities" rather than an error page |
| The hard-coded `Developers` e-mail allow-list | A literal list of ten addresses in `App.Formulas`, gating dev-only UI | Not a privilege and cannot be made one as written. `DEVELOPERS` in `src/domain/session.ts` carries the list verbatim with an explicit note to move it to an environment variable before go-live; the UI it gates must not be the only thing standing between a caller and a privileged action |

#### Deliberate divergences

- **A deep link to an invisible project still navigates** — the canvas sets a blank `gblRecordSelectedProject` and lands on General Data with an empty form, indistinguishable from a new project. The rebuild treats a null resolve as a failed link: it clears the project and redirects to `/projects`. Parity function: none; the change is in `src/features/app-loading/Screen.tsx` and named there.
- **The 2,000-row batching loop is a delegation workaround, not a business rule** — deleted rather than ported, with `dataClient.list({ all: true })` and its `skipToken` loop available where a full read is genuinely wanted. Named in the `Screen.tsx` header under DELETED WORKAROUNDS.
- **`Timer1` and `varStopTimer` are control plumbing** — replaced by query state (`useBootstrap().isSuccess` for `gblAppStarted`). Named in the same header.
- **`gblCurrentUser.CanEditSelectedProject` was a mutated global** — the canvas patched it on the launch path and every later screen trusted it. The rebuild initialises it to `false` in `buildCurrentUser()` and requires each screen to set it from that record's privileges, which UT-SES-009 asserts.
- **`EditableCounties` is not de-duplicated in the canvas**, so a user holding two country-scoped roles in one country sees it listed twice. `deriveCountryScope()` de-duplicates by country id. Parity function: none kept; `editableCountriesLabel()` documents the change and UT-SES-006 pins it.

#### Build steps

1. Write `src/platform/powerClient.ts`'s `readEnvironment()` and `dataMode`, so the caller's identity and the environment badge have a source.
2. Write `src/domain/session.ts` — `unionVsbRoles`, `deriveCountryScope`, `buildCurrentUser`, `canEditSelectedProject`, `canSeeAdminSection`, `canEditCountry`, `versionLabel`, `greeting`.
3. Write `src/domain/session.test.ts` to UT-SES-001…015 and run it; the whole app's permission model rests on these fifteen cases.
4. Write `src/domain/navigation.ts` — `PM_NAV`, `PM_ADMIN_NAV`, `COST_NAV`, `navItemColor`, `railTree`, `resolveLaunchRoute`, `PROJECT_SCOPED`, `isProjectScoped`.
5. Write `src/domain/navigation.test.ts` to UT-NAV-001…014 and run it.
6. Write `src/platform/bootstrap.ts` — `readEnvironmentVariables`, `readRoles`, `bootstrap`, `useBootstrap` — with the independent reads in one `Promise.all` and the derivation delegated to `domain/session.ts`.
7. Write `src/routes/AppRoutes.tsx` with the lazy screen imports, `RequireProject` and `RequireAdmin`, and the index route on this feature.
8. Write `src/features/app-loading/Screen.tsx` — 53 lines: resolve the route, resolve or clear the project, redirect, render `LoadingOverlay`. Create no `rules.ts` and no `rules.test.ts`; there is nothing pure left in the feature.
9. Verify `npx tsc --noEmit` is clean and that launching with `?projectid=<unreadable guid>` lands on `/projects` rather than an empty General Data form.

#### Exit gate

`npx vitest run src/domain` passes UT-NAV-001…014 and UT-SES-001…015, `npx tsc --noEmit | grep features/app-loading` is empty, and `src/features/app-loading/` contains exactly one file — a launch with `?projectid=` set to a project the caller cannot read must end on `/projects`, and a launch with no parameters must end on `/projects` with the project globals cleared. The gate also requires two test files that do not yet exist: `src/platform/dataClient.test.ts` asserting that `all: true` walks `skipToken` to completion and stops at the 40-page guard, and `src/platform/bootstrap.test.ts` asserting that `useBootstrap()` reaches `isSuccess` only once the roles and environment variables have resolved and that a failed role read degrades to an empty role set. Until both pass, the deletion of the 2,000-row batching loop and the `gblAppStarted` → `isSuccess` substitution are unpinned, and this screen's two central changes are asserted only in prose.

---
### 8. Project Main Screen — `src/features/project-main/`

| | |
|---|---|
| Canvas unit | `PM::Project Main Screen` (PM app) |
| Power Fx | `54` blocks ≥3 lines · `27` ≥10 · `7` ≥30 · `1470` lines in those blocks (`2502` across all `=` properties) |
| Complexity | band `S` · score `11.3` · `5` build-days |
| Code app | `Screen.test.tsx` 276 ln · `Screen.tsx` 823 ln · `hooks.ts` 270 ln · `rules.test.ts` 966 ln · `rules.ts` 870 ln |
| Pure rules exported | `41` |
| Unit tests | `108` cases · IDs `UT-MAIN-001…UT-MAINUI-014` |
| Dataverse tables | `Countries`, `CountryAreas`, `Generators`, `Project States`, `Projects` |

#### What it does

This is the portfolio landing screen: a seven-field filter bar — project manager, country, area, technology, status, capacity with a comparison operator, and a keyword — over a paged, sortable grid of projects showing name, short name, project id, technology, capacity, weighted MW, approval state and the five milestone dates, with a footer carrying the total row count and the page position. Above it sits a ten-item command bar whose every item carries its own gate: Add on the table's create privilege, Edit and Edit Costs on selection with the label degrading to View without edit rights, Delete blocked for an approved project, Simulate visible only in Dev, SharePoint and Teams only for Croatia with both URLs present, and the two Power BI reports behind a hard-coded address allow-list. The screen writes nothing except a delete, which it applies optimistically to the page on screen; every other action navigates. `+ Add Project` is the app's only project-creation path, and it opens General Data with no project selected.

#### Depends on

- `src/domain/session.ts` — `CurrentUser`, `canEditSelectedProject`; the country scope in `serverFilterFor()` reads `editableCountries`, `isProjectDataAllCountries` and `isApplicationAdministrator`.
- `src/domain/navigation.ts` — `NEW_PROJECT_ROUTE`, `isNewProjectRequest()`, `PM_NAV`, `PROJECT_SCOPED`. The `+ Add Project` fix lives here, not in the feature.
- `src/domain/paging.ts` — `DEFAULT_PAGE_SIZE`, `computePaging()`; the canvas's `RoundUp(totalRows / pageSize, 0) + If(totalRows = 0, 1, 0)` arithmetic.
- `src/domain/approval.ts` — `approvalDecoration()`, `rowAccentColor()`, `ApprovalIconToken`.
- `src/domain/technology.ts` — `TECHNOLOGY_LABEL`, `technologyValue()`, `technologyLabel()`; re-exported from `rules.ts` because `useProjectContext` needs the label too.
- `src/domain/numeric.ts` — `isTwoDecimal`, `parseNumber`, `Lang` for the capacity field.
- `src/data/projectQueries.ts` — `queryProjects()`, `ProjectQueryPage`, `SortRequest`; the paged server read.
- `src/data/queryKeys.ts` — `qk.projects.page`, `qk.projects.privileges`, `qk.projects.all`, `qk.ref.*`.
- `src/data/repos.ts` — `projectRepo`, `countryRepo`, `countryAreaRepo`, `projectStateRepo`, `entraIdRepo`.
- `src/platform/odata.ts` — `f.and`, `f.or`, `f.eq`, `f.ne`, `f.gt`, `f.ge`, `f.lt`, `f.le`, `f.guid`, `f.contains`, `asc`; every leaf goes through a builder so the parenthesisation matches live Dataverse.
- `src/features/shared/useProjectContext.ts` — `selectProjectById()`, `readPrivileges()`, `ProjectPrivileges`.
- `src/features/shared/useDebouncedValue.ts` — the keyword debounce, applied before the filter string is built.
- `src/components/` — `DataGrid.tsx`, `GridPager.tsx`, `CommandBar.tsx`, `PageHeader.tsx`, `ConfirmDialog.tsx`, `EmptyState.tsx`, `LoadingOverlay.tsx`, `StateChip.tsx`.
- `src/routes/AppRoutes.tsx` — the `projects` route (unguarded) and `RequireProject`, whose new-project exemption this screen depends on.
- Screen 7 must be finished first: the launch sequence lands here, and `bootstrap()` supplies the user whose country scope filters the list.

#### Power Fx → TypeScript

##### but_Main_Project_Overview_Context_Filter_Apply.OnSelect — 145 lines → `buildProjectFilter()`

Decides which projects the grid shows: one filter expression per non-blank filter field, joined by AND.

```powerfx
With(
    {

        baseFiltered: Filter(
            Projects,
            And(
                Or(
                    IsBlank(locFilterValues.ProjectManager),
                    ThisRecord.'Project Manager'.Id = GUID(locFilterValues.ProjectManager.PersonaKey)
                ),
                Or(
                    IsBlank(locFilterValues.Country),
                    ThisRecord.Country.Country = locFilterValues.Country.Country
                ),
            keywordFiltered: If(
                Or(
                    IsBlank(locFilterValues.ProjectKeyword),
                    Len(locFilterValues.ProjectKeyword) < 3
                ),
                baseFiltered,
                Filter(
                    baseFiltered,
                    Or(
                        locFilterValues.ProjectKeyword in ThisRecord.'Project Name',
                        locFilterValues.ProjectKeyword in ThisRecord.'Project ID',
                        locFilterValues.ProjectKeyword in ThisRecord.'Internal Project ID',
                        locFilterValues.ProjectKeyword in ThisRecord.'Short Name'
                    )
                )
            )
// … [116 of the block's 145 lines omitted]
```

```typescript
export function buildProjectFilter(
  filter: ProjectListFilter,
  lang: Lang = "en-US",
): string | undefined {
  return f.and(
    keywordClause(filter.keyword),
    filter.projectManagerId
      ? f.guid(PROJECT_MAIN_COL.projectManager, filter.projectManagerId)
      : undefined,
    filter.countryId ? f.guid(PROJECT_MAIN_COL.country, filter.countryId) : undefined,
    filter.areaId ? f.guid(PROJECT_MAIN_COL.area, filter.areaId) : undefined,
    filter.technology !== null ? f.eq(PROJECT_MAIN_COL.technology, filter.technology) : undefined,
    capacityClause(filter.capacity, filter.capacityOperator, lang),
    filter.clusterStateId
      ? f.guid(PROJECT_MAIN_COL.clusterState, filter.clusterStateId)
      : undefined,
  );
}
```

```typescript
/** Rules 4 and 5 — skipped below three characters; four `contains()` OR-ed when applied. */
export function keywordClause(keyword: string): string | undefined {
  const q = keyword.trim();
  if (q.length < KEYWORD_MIN) return undefined;
  return f.or(
    f.contains(PROJECT_MAIN_COL.name, q),
    f.contains(PROJECT_MAIN_COL.internalProjectId, q),
    f.contains(PROJECT_MAIN_COL.shortName, q),
    f.contains(PROJECT_MAIN_COL.area, q),
  );
}
```

**Shape change** — the canvas's `Or(IsBlank(x), field = x)` per-clause idiom, which forces every clause into the expression whether or not the filter is set, becomes clause omission: a blank filter contributes `undefined` and `f.and()` drops it, so a pristine screen sends no `$filter` at all rather than seven tautologies. `locFilterValues` — the single row of `colFiltersOverview` re-read with `LookUp(colFiltersOverview, true)` — becomes a typed `ProjectListFilter` that also round-trips through the URL via `parseCriteria()` / `serialiseCriteria()`. The nested `With` chain of `baseFiltered` → `keywordFiltered` → `ClearCollect(colFilteredProjects, …)` becomes one server-side `$filter` composed by `f.and`, never string-concatenated, because the mock's `evalFilter` folds boolean operators strictly left to right and only the builders' parenthesisation keeps mock and live Dataverse in agreement. Related-entity name comparisons (`'Area/State/Province'.Name`, `'Cluster State'.'Project State'`) become lookup-GUID comparisons, which needs no `$expand` and incidentally fixes a canvas bug where two identically-named areas in different countries matched each other; `buildProjectFilterCanvasParity()` keeps the name form reachable.
**Pinned by** — UT-MAIN-002, UT-MAIN-003, UT-MAIN-004, UT-MAIN-005, UT-MAIN-006, UT-MAIN-007, UT-MAIN-008, UT-MAIN-031, UT-MAIN-032, UT-MAIN-026, UT-MAIN-027, UT-MAIN-028, UT-MAIN-029.

##### con_Main_Project_Overview_Header_SuitBar_CommandBar.OnSelect — 235 lines → `commandBarState()`

Decides, for all ten commands at once, what is visible, what is enabled, and what each one is labelled.

```powerfx
If(
    !IsBlank(Self.Selected.ItemKey) && Self.Selected.ItemKey = "editProject",
    Trace($"OnSelect MainCommandBar: {psf_MainScreen_DetailList_Container_FluentDetailsList.Selected.vsb_projectid}");
    Set(
        gblRecordSelectedProject,
        LookUp(
            Projects,
            ThisRecord.Project = GUID(psf_MainScreen_DetailList_Container_FluentDetailsList.Selected.vsb_projectid)
        )
    );
    If(
        gblProduction,
        Launch(
            gblPMAppURL,
            {projectid: GUID(psf_MainScreen_DetailList_Container_FluentDetailsList.Selected.vsb_projectid)}
        ),
        Set(
            gblRecordSelectedProjectCountry,
            LookUp(
                Countries,
                Country = gblRecordSelectedProject.Country.Country
            )
        );
        Set(
            gblCurrentUser,
            Patch(
                gblCurrentUser,
                {
                    CanEditSelectedProject: And(
                        DataSourceInfo(
                            Projects,
                            DataSourceInfo.CreatePermission
                        ),
// … [202 of the block's 235 lines omitted]
```

```typescript
export function commandBarState(ctx: CommandBarContext): Record<CommandKey, CommandState> {
  const { selected, canCreate, canEditSelected, environmentName, userMail, reportViewers } = ctx;
  const has = Boolean(selected);
  const mail = (userMail ?? "").trim().toLowerCase();
  const isReportViewer = reportViewers.some((v) => v.trim().toLowerCase() === mail);
  const bothSpoUrls = Boolean(selected?.spoSharepointUrl && selected?.spoTeamsUrl);
  const isCroatia = selected?.countryName === "Croatia";
// … [13 lines omitted]
  return Object.fromEntries([
    st("addProject", true, canCreate, "Add Project", "Add", "You cannot create projects."),
    st(
      "editProject",
      true,
      has,
      canEditSelected ? "Edit Project" : "View Project",
      canEditSelected ? "Edit" : "ReadingMode",
      SELECT_FIRST,
    ),
    st(
      "editCosts",
      true,
      has,
      canEditSelected ? "Edit Costs" : "View Costs",
      canEditSelected ? "Money" : "ReadingMode",
      SELECT_FIRST,
    ),
// … [45 lines omitted]
}
```

**Shape change** — a 235-line `If` chain in which each command's gate is written twice, once as an `ItemVisible`/`ItemEnabled` expression on the `Items` table and once again inside the handler, becomes one pure function returning a `Record<CommandKey, CommandState>`; the handler shrinks to an `onCommand` map of navigations in `Screen.tsx`. `DataSourceInfo(Projects, CreatePermission)` and `RecordInfo(record, EditPermission)` become the `canCreate` / `canEditSelected` fields of `CommandBarContext`, answered by `useRowPrivileges()` from the server rather than derived from role names. The subtlety preserved verbatim: lacking edit rights changes the *label* to "View Project" / "View Costs" and the icon to `ReadingMode`, it does not disable the command. Delete keeps rule 17's approved-project block (`selected?.approvalState !== CHOICE.approvalState.approved`), Simulate keeps its Dev-only visibility, SharePoint and Teams keep the Croatia-plus-both-URLs pair, and the two Power BI items keep the `colReportViewers` allow-list, injected through the context as `REPORT_VIEWERS` so tests can vary it and so it is not silently merged with `DEVELOPERS`. The `gblProduction ? Launch(gblPMAppURL, {projectid: …}) : Navigate(...)` fork disappears — one app, one route.
**Pinned by** — UT-MAIN-014, UT-MAIN-015, UT-MAIN-016, UT-MAIN-017, UT-MAIN-018, UT-MAIN-019, UT-MAIN-021, UT-MAINUI-002.

##### con_Main_Project_Overview_Header_SuitBar_CommandBar.OnSelect — 235 lines → `isNewProjectRequest()`

Decides whether General Data may be reached with no project selected — the `+ Add Project` path, and the dead end the rebuild's own route guard created.

```powerfx
If(
    !IsBlank(Self.Selected.ItemKey) && Self.Selected.ItemKey = "addProject",
    Set(
        gblRecordSelectedProject,
        Blank()
    );
    Set(
        gblProjectHeaderData,
        Blank()
    );
    Set(
        gblReportError,
        Blank()
    );
    Set(
        gblLeftNavigationSelected,
        LookUp(
            LeftNavigationMenu,
            ItemKey = "GeneralDataCommonKey"
        )
    );
    Navigate(
        'Project General Data Screen',
        ScreenTransition.Fade
    );

);
// … [209 of the block's 235 lines omitted]
```

```typescript
/**
 * The one project-scoped route that is reachable WITHOUT a selected project.
 *
 * GUIDE p10: "+ Add Project" on the portfolio opens General in its New Project state — no
 * project id, an empty form, `Project ID` blank until the first save. The canvas app has no
 * guard at all, so it simply navigates; this build guards every project route, which turned
 * the app's only create path into a dead end that rendered "No project selected".
 *
 * Marking the intent in the URL rather than in a store flag keeps the guard a pure function
 * of the location, and means a reloaded or shared "new project" link still works.
 */
export const NEW_PROJECT_ROUTE = "/project/general?new=1";

export function isNewProjectRequest(pathname: string, search: string): boolean {
  if (pathname !== "/project/general") return false;
  return new URLSearchParams(search).has("new");
}
```

```typescript
/** Project-scoped guard. */
function RequireProject({ children }: { children: ReactNode }) {
  const project = useAppStore((s) => s.project.selected);
  const nav = useNavigate();
  const loc = useLocation();
  // GUIDE p10: General is also the New Project screen, so "+ Add Project" has to reach it
  // with no project selected. Every other project route still needs one.
  const creating = isNewProjectRequest(loc.pathname, loc.search);
  if (!project?.projectId && !creating) return <SelectProjectPrompt onGo={() => nav("/projects")} />;
  return <>{children}</>;
}
```

**Shape change** — the canvas blanks four globals and navigates, with no guard anywhere to stop it; the rebuild guards every project route, and that guard turned the app's only create path into a dead end rendering "No project selected". The fix is not a store flag but a marker in the URL: `nav(NEW_PROJECT_ROUTE)` from the `addProject` command, and `isNewProjectRequest()` as the guard's exemption, so the guard stays a pure function of the location and a reloaded or shared "new project" link still works. The three `Set(…, Blank())` calls become `clearProject()` on the store, and `Set(gblLeftNavigationSelected, LookUp(LeftNavigationMenu, ItemKey = "GeneralDataCommonKey"))` disappears — the rail derives its selected item from the route. The exemption is deliberately narrow: it applies to `/project/general` and nothing else, which UT-NAV-017 asserts across every other project-scoped route.
**Pinned by** — UT-NAV-015, UT-NAV-016, UT-NAV-017.

##### cmp_Project_PopUp_ConfirmationDeleteProject.OnConfirm — 29 lines → `deleteMessages()`

Decides what the user is told after a delete, and what the grid shows before the refetch lands.

```powerfx
IfError(
    Remove(
        Projects,
        gblRecordSelectedProject
    );
    Notify(
        $"The project '{gblRecordSelectedProject.'Project Name'}' was successfully deleted!",
        NotificationType.Success,
        1000
    ),
    Notify(
        "Error: Permit could not be deleted. " & "Internal error: originated on " & FirstError.Source & ". Message: " & FirstError.Message & FirstError.Details.HttpResponse,
        NotificationType.Error
    )
);
Refresh(Projects);
Set(
    gblRecordSelectedProject,
    Blank()
);
Set(
    gblProjectHeaderData,
    Blank()
);
UpdateContext({locProjectDelitionDialog: false});
If(
    gblAppStarted,
    Select(but_Main_Project_Overview_Context_Filter_Apply)
);
```

```typescript
export function deleteMessages(name: string): { success: string; error: string } {
  return {
    success: `The project '${name}' was successfully deleted!`,
    error:
      "Error: Project could not be deleted. It may have dependent records, or you may lack the privilege.",
  };
}

export function deleteMessagesCanvasParity(name: string): { success: string; error: string } {
  return {
    success: `The project '${name}' was successfully deleted!`,
    error: "Error: Permit could not be deleted. ",
  };
}
```

```typescript
export function applyOptimisticDelete<T extends { rows: unknown[]; totalCount: number }>(
  page: T,
  id: string,
  rowId: (row: unknown) => string,
): T {
  const rows = page.rows.filter((r) => rowId(r) !== id);
  if (rows.length === page.rows.length) return page;
  return { ...page, rows, totalCount: Math.max(0, page.totalCount - 1) };
}
```

**Shape change** — `IfError` around `Remove` plus two `Notify` calls becomes a mutation whose error path is an `AppError` surfaced in the UI and whose message strings are a pure function, so the copy-paste "Permit could not be deleted" is corrected in one place and the canvas string stays reachable as `deleteMessagesCanvasParity()`. The `FirstError.Source` / `FirstError.Message` / `FirstError.Details.HttpResponse` concatenation is dropped from the user-facing string and goes to `trace()` instead. `Refresh(Projects)` followed by `Select(but_…_Filter_Apply)` — a full re-query triggered by invoking another control's handler — becomes `applyOptimisticDelete()` on exactly the page in cache plus one `invalidateQueries({ queryKey: qk.projects.all })`, and the `totalCount` decrement is what stops the footer reading a stale "Total Rows" for as long as the refetch takes. The two `Set(…, Blank())` globals become `clearProject()`.
**Pinned by** — UT-MAIN-022, UT-MAIN-023.

##### psf_MainScreen_DetailList_Container_FluentDetailsList.OnChange — 24 lines → `nextSortState()`

Decides the grid's sort column and direction, and separates a sort event from a cell click.

```powerfx
UpdateContext({locDetailsListRowKey: Self.EventRowKey});
If(
    Self.EventName = "Sort",
    UpdateIf(
        colFiltersOverview,
        true,
        {
            SortCol: Self.SortEventColumn,
            SortAsc: If(
                Self.SortEventDirection = 'PowerCAT.FluentDetailsList.SortEventDirection'.Ascending,
                true,
                false
            )
        }
    )
);
If(
    Self.EventName = "CellAction",
    Launch(
        "https://app.powerbi.com/groups/" & gblPowerBIGroupID & "/reports/" & gblProjectOverviewPowerBIReportID & "/" & gblPowerBIReportSection & "?filter=Project/Id eq '" & Self.EventRowKey & "'",
        {},
        LaunchTarget.New
    )
);
```

```typescript
export const resolveSortColumn = (col: string): string =>
  SORTABLE_COLS.includes(col) ? col : DEFAULT_SORT.col;

/** Rule 25 — sort persists into the filter row; clicking the same column flips direction. */
export function nextSortState(cur: SortRequest, clickedCol: string): SortRequest {
  const col = resolveSortColumn(clickedCol);
  return col === cur.col ? { col, asc: !cur.asc } : { col, asc: true };
}
```

**Shape change** — a single string-typed `EventName` dispatch over a PCF control's `Self.*` properties becomes two separate typed callbacks on `DataGrid`, so a sort can never be mistaken for a cell action; `UpdateIf(colFiltersOverview, true, {SortCol, SortAsc})` becomes a `SortRequest` that `serialiseCriteria()` writes into the URL, which is what makes a sorted view shareable. `Self.SortEventColumn` — an arbitrary string reaching `$orderby` — is funnelled through `resolveSortColumn()` and the `SORTABLE_COLS` allow-list, because an unexpected column is a 400 against live Dataverse and a silent no-op in mock; Status, Project Manager, Country and Area are deliberately absent from that list and marked unsortable in the grid, since ordering by a lookup FormattedValue would order the page differently from the table and lie at every page boundary. The interpolated Power BI URL moves out of the sort handler into the command bar's report items, where the report-viewer gate already lives.
**Pinned by** — UT-MAIN-024, UT-MAIN-035, UT-MAINUI-012.

#### Security conditions

| Condition | Canvas today | Where it must be enforced |
|---|---|---|
| Which projects appear in the list | `Filter(Projects, And(...))` carries no scope clause at all — it relies entirely on Dataverse returning only the rows the caller may read | Keep that reliance and make it explicit: `prvReadvsb_project` at Business Unit scope for `VSB - Project Data Own Country`, User scope for `VSB - Project Manager Own Projects`, Organization scope for `VSB - Project Data All Countries`. `serverFilterFor()` adds a country `$filter` on top for a scoped user, which is a narrowing convenience, not the boundary |
| Creating a project | `DataSourceInfo(Projects, DataSourceInfo.CreatePermission)` — genuinely server-answered, and the only gate on Add | `prvCreatevsb_project` at Business Unit scope. `commandBarState()`'s `canCreate` comes from `readPrivileges()`, never from a role name |
| Editing the selected project | `Coalesce(RecordInfo(gblRecordSelectedProject, RecordInfo.EditPermission), false)` — server-answered per record, correctly coalescing an unanswered probe to false | `prvWritevsb_project` at the role's own scope, plus Dataverse row-level sharing where a project manager holds User scope. Read per record by `useRowPrivileges()`; the label degradation to "View Project" is the UI consequence, not the enforcement |
| Deleting an approved project | Blocked client-side only, by testing `vsb_approvalstates` against the Approved value inside the command's gate. A direct `DELETE` succeeds | A synchronous pre-operation plug-in on Delete of `vsb_project` that reads `vsb_approvalstates` and throws when it is Approved, plus `prvDeletevsb_project` at Business Unit scope. Approval is a financial control; it cannot live in a command bar |
| Reading or writing the approval state itself | An ordinary column on `vsb_project`; any writer of the project can set it | A Dataverse Field Security Profile over `vsb_approvalstates`, Update granted only to the approver team — otherwise the delete plug-in above is bypassed by first un-approving the project |
| Seeing the two Power BI report commands | A hard-coded ten-address `colReportViewers` table built in `OnVisible`, compared against `User().Email`. Editing the list means editing the app | An Entra security group carrying the Power BI workspace's Viewer role, with row-level security in the dataset scoping rows to the viewer's country; the app-side list moves to an environment variable and remains a convenience only. `REPORT_VIEWERS` is injected through `CommandBarContext` so it is replaceable in one place |
| Running Simulate | Visible when `gblEnvironmentName = "Dev"`, enabled on selection and edit rights. Nothing server-side | `prvExecute` on the simulation custom API (or the flow's Run-Only privilege), granted only to roles that exist in the Dev environment. An environment-name string in the client is a label, not a boundary |
| Opening the SharePoint and Teams links | Gated on `Country.Name = "Croatia"` and both URL columns being non-blank | The linked SharePoint site's own membership decides access; Dataverse can only stop the URL leaking, via a Field Security Profile over `vsb_sposharepointurl` and `vsb_spoteamsurl` if the site path is itself sensitive |
| The Project Manager typeahead reading the directory | `Search(Filter('Microsoft Entra IDs', 'Microsoft Entra ID Account Enabled' = …Yes), Self.SearchText, 'Display Name', 'Given Name', Surname, Mail)` — an unrestricted search over every enabled account | `prvReadvsb_microsoftentraid` at Organization scope on the VSB roles that need it; the query stays server-filtered to enabled accounts, and `filterPeopleSuggestions()` caps the panel client-side so the whole directory is never rendered |
| A hand-edited URL reaching `$filter` and `$orderby` | Not applicable — the canvas has no URL state | `parseCriteria()` validates every field: an unknown sort column falls back to the default through `resolveSortColumn()`, an unknown capacity operator is dropped, a non-numeric page becomes 1, and nothing in it can throw. Treat the query string as untrusted input, because it is |

#### Deliberate divergences

- **The filter compared related-entity names** — `'Area/State/Province'.Name` and `'Cluster State'.'Project State'` need `$expand` to reach server-side, so the rebuild filters on the lookup GUID; this also fixes a canvas bug where two identically-named areas in different countries matched each other. Parity function: `buildProjectFilterCanvasParity()`.
- **The delete error names the wrong entity** — "Error: Permit could not be deleted." is a copy/paste from the Planning screen; the record is a Project. Corrected, with the canvas string kept. Parity function: `deleteMessagesCanvasParity()`.
- **`+ Add Project` was a dead end in this build** — the canvas has no guard and simply navigates to General Data with the globals blanked; guarding every project route made the app's only create path render "No project selected". Fixed by marking the intent in the URL. Parity functions: `NEW_PROJECT_ROUTE` and `isNewProjectRequest()`, pinned by UT-NAV-015…017.
- **`applyFilter` was deleted rather than kept as a parity twin** — an earlier cut of this file filtered client-side, which the canvas never did; keeping it would have preserved the rebuild's own bug under a convention meant for the canvas's. Replaced by `buildProjectFilter()`; noted in the `rules.ts` header.
- **The edit gate was computed from role names** — an earlier cut used `isProjectDataAllCountries || isProjectManagerOwnProjects`, which `CLAUDE.md` rule 4 forbids and which genuinely disagrees with an actual privilege under row-level sharing. Replaced by `useRowPrivileges()` reading `readPrivileges()`; a failed probe reads as "no rights", never as "allowed".
- **Dashboard is not exempt from the selection gate** — GUIDE p06's "the other five are greyed" with nothing selected names all six non-Add commands, Dashboard included; an earlier cut left it always enabled. Corrected in `commandBarState()`.
- **Four columns are deliberately unsortable** — Status, Project Manager, Country and Area are lookup FormattedValues; sorting them client-side within one page would contradict the table at every page boundary. Marked unsortable in the grid rather than faked. Pinned by UT-MAINUI-012.
- **`REPORT_VIEWERS` is not merged with `DEVELOPERS`** — the addresses overlap, but they are two independently maintained canvas literals and merging them is how a gate drifts when one list is edited. Both belong in an environment variable before go-live.

#### Build steps

1. Add the delete plug-in and the `vsb_approvalstates` field security profile from the Security conditions table, and confirm a direct `DELETE` on an approved project is rejected.
2. Write `src/data/projectQueries.ts` (`queryProjects`, `ProjectQueryPage`, `SortRequest`) and the `qk.projects.*` / `qk.ref.*` keys, so the screen has a paged server read to call.
3. Write `src/domain/paging.ts` and `src/domain/approval.ts` with their tests — the pager arithmetic and the approval decoration are shared chrome, not feature code.
4. Write `rules.ts`'s `PROJECT_MAIN_COL`, `fv()`, `SORTABLE_COLS`, `DEFAULT_SORT`, `CAPACITY_OPERATORS` and `REPORT_VIEWERS`, checking every logical name against `customizations.xml`.
5. Write the filter, sort and row rules — `keywordClause`, `capacityClause`, `capacityFieldError`, `resolveCapacityOperator`, `buildProjectFilter`, `buildProjectFilterCanvasParity`, `applyFilterPatch`, `clearIconState`, `isFilterActive`, `resolveSortColumn`, `nextSortState`, `toProjectListRow`, `formatCapacity`, `formatMilestoneDate`, `serverFilterFor`.
6. Write the command, lock and delete rules — `commandBarState`, `costModuleLock`, `isCostModuleLocked`, `deleteMessages`, `deleteMessagesCanvasParity`, `applyOptimisticDelete`, `filterPeopleSuggestions`, `parseCriteria`, `serialiseCriteria`.
7. Add `NEW_PROJECT_ROUTE` and `isNewProjectRequest()` to `src/domain/navigation.ts`, wire the exemption into `RequireProject`, and extend `src/domain/navigation.test.ts` with UT-NAV-015…017.
8. Write `rules.test.ts` to 94 cases covering UT-MAIN-001…037 including both parity twins, and run `npx vitest run src/features/project-main`.
9. Write `hooks.ts` — `useProjectList` with the debounced keyword and `keepPreviousData`, `useRowPrivileges`, the four reference queries, `useDeleteProject` with its optimistic patch.
10. Compose `Screen.tsx` from `PageHeader`, `CommandBar`, the seven-filter bar, `DataGrid`, `GridPager` and `ConfirmDialog`, then write `Screen.test.tsx` to the 14 UT-MAINUI cases and verify `npx tsc --noEmit` is clean for the feature.

#### Exit gate

`npx vitest run src/features/project-main` passes all 108 cases (94 in `rules.test.ts`, 14 UT-MAINUI in `Screen.test.tsx`), `npx vitest run src/domain/navigation.test.ts` passes UT-NAV-015…017, `npx tsc --noEmit | grep features/project-main` is empty, and clicking `+ Add Project` with no project selected reaches General Data's New Project state rather than the "No project selected" prompt.

---
### 9. Project General Data Screen — `src/features/general-data/`

| | |
|---|---|
| Canvas unit | `PM::Project General Data Screen` (PM app) |
| Power Fx | `177` blocks ≥3 lines · `88` ≥10 · `27` ≥30 · `3952` lines in those blocks (`7438` across all `=` properties) |
| Complexity | band `M` · score `34.3` · `17` build-days |
| Code app | `Screen.tsx` 1018 ln · `hooks.ts` 501 ln · `rules.test.ts` 820 ln · `rules.ts` 1392 ln |
| Pure rules exported | `69` |
| Unit tests | `70` cases · IDs `UT-GDATA-001…057` |
| Dataverse tables | Countries, CountryAreas, Custom Choice Values, GeneratorTypeInProjects, Generators, Permits, Project Default Approvals, Project State Trackings, Project States, Projects, ShareholderEntityInProjects, Users |

#### What it does

This is the project record itself, and it doubles as the New Project form: three sections — Basic Information, Placement, Shareholding Entity — plus a coordinate map, a people picker for the project manager and deputy, a country-driven municipality lookup, and a right panel for shareholding entities. Saving it writes `Projects`, flushes the whole `ShareholderEntityInProjects` set for the project, rebuilds `Project State Trackings` when the Start Cluster moves, re-prices `GeneratorTypeInProjects` when the plant cost changes, and cancels a running Draft gate approval through a flow wrapper before any of that lands. It is the only screen that can create a project, so until it has saved once the project has no `Project ID` and every other PM screen is locked. Its save is the largest single behaviour in either app: a 463-line `OnSelect` that the rebuild turns into one plan of typed write operations.

#### Depends on

- `src/routes/AppRoutes.tsx` — `RequireProject` and `isNewProjectRequest()`. This is the one project-scoped route allowed through with nothing selected, via `NEW_PROJECT_ROUTE` (`/project/general?new=1`); the guard must exist before the screen does.
- `src/store/appStore.ts` — the `project` slice (`selectProject`, `clearProject`, `selectProjectHeader`). This screen is its first writer, so the slice's shape is settled here.
- `src/features/shared/useProjectContext.ts` — `useProjectContext()`, `readPrivileges()`, `toSelectedProject()`. Replaces the `Set(gblRecordSelectedProject, LookUp(...))` + `RecordInfo` idiom at the head of the canvas `OnVisible`.
- `src/domain/navigation.ts` — `PM_NAV`, `navItemColor()`, `completionRatio()`, and `src/components/LeftNav.tsx`'s "Data complete" meter. The General rail item's prerequisite is `Boolean(p.projectId)`, so the rail's completeness colouring is grey for every item until this screen's first successful save.
- `src/domain/numeric.ts` (`parseNumber`, `isSixDecimal`, `isOneDecimal`, `isTwoDecimal`, `inRange`, `pfxRound`, `isBlank`), `src/domain/session.ts` (`canEditSelectedProject`, `deriveCountryScope`, `CountryScope`), `src/domain/technology.ts` (`technologyValue`).
- `src/data/entities.ts` — `ES`, `CHOICE`, `SELECT`, `TERRAIN_SIZE_COUNTRY_KEY`.
- `src/data/repos.ts` — `projectFullRepo`, `countryRepo`, `countryAreaRepo`, `projectStateRepo`, `shareholderEntityInProjectRepo`, `projectStateTrackingRepo`, `customChoiceValueRepo`, `entraIdRepo`, `generatorTypeInProjectRepo`.
- `src/platform/dataClient.ts` — `create()` and `batch()`; `src/platform/odata.ts` — `f`, `asc`; `src/platform/errors.ts` — `AppError`, `toAppError`, `Result`.
- `src/flows/flowClient.ts` — `cancelGateApproval()` (the `vsb_CancelGateApproval` custom-API replacement for `PerformRequestofGateApprovalCancellation`).
- `src/components` — `PageHeader`, `CommandBar`, `DataGrid`, `FormPanel`, `ConfirmDialog`, `LoadingOverlay`, `NumericInput`, `RecordFooter`, `TextFieldWithCount`.
- Dataverse privileges: Create + Write on `vsb_projects`; Create + Write + Delete on `vsb_shareholderentityinprojects`; Create + Write on `vsb_projectstatetrackings`; Write on `vsb_generatortypeinprojects`; Read on Countries, CountryAreas, Custom Choice Values, Project States, Project Default Approvals and Microsoft Entra IDs.

#### Power Fx → TypeScript

##### btn_GeneralData_Save_Actual.OnSelect — 463 lines → `planSaveCleanup()`

Everything the save does after the project row itself is written: the internal-id back-fill, the second business-unit patch, the gate-approval cancellation, the tracking rebuild, the shareholder flush and the generator re-pricing, in that order.

```powerfx
Trace($"SPV Company Code : {txt_GeneralData_DisplayProject_Body_General_Content_SPVCompanyCode.Text}");
UpdateContext(
    {
        locGeneralDataIsSavingDialogVisible: true,
        locGeneralDataSavingDialogText: $"The project is being saved, please wait..",
        locNewProjectCreation: IsBlank(gblRecordSelectedProject.'Project ID')
    }
);
// =====================================================
// Capture old/new Start Cluster before saving project
// IMPORTANT: Do not run cleanup here.
// Cleanup must run only after project save succeeds.
// =====================================================
With(
    {
        varOldStartCluster: Coalesce(
            gblRecordSelectedProject.'Start Cluster',
            'Cluster States'.Greenfield
        ),
        varNewStartCluster: If(
            drp_GeneralData_DisplayProject_Body_TechnologyTab_Content_ProjectDevelopment.Selected.Value = 'Development Type'.'Acquired Project',
            drp_GeneralData_DisplayProject_Body_General_Content_ClusterChange.Selected.Value,
            'Cluster States'.Greenfield
        )
    },
// … [438 of the block's 463 lines omitted]
```

```typescript
export function planSaveCleanup(ctx: SaveCleanupContext): SavePlan {
  const { saved, form, ref, trackings } = ctx;
  const steps: SaveStep[] = [];
  const projectId = saved.id!;
  const country = ref.countries.find((c) => c.id === (form.countryId ?? saved.countryId));
// … [33 lines omitted]
  /* ---- step 2: gate-approval cancellation + tracking rebuild ------------------ */
  if (ctx.startClusterChanged) {
    const draftTracking = draftState
      ? trackings.find((t) => t.clusterStateId === draftState.id) ?? null
      : null;

    if (shouldCancelGateApproval(draftTracking)) {
      steps.push({
        kind: "cancel-gate-approval",
        log: null,
        writes: [],
        flow: { name: "cancelGateApproval", stateTrackingId: draftTracking!.id },
      });
    }

    const planned = plannedTrackingRows(ref.projectStates, ctx.newStartClusterNo, trackings);
    steps.push({
      kind: "rebuild-trackings",
      log: "Project start cluster tracking was refreshed successfully.",
// … [86 lines omitted]
  return {
    steps,
    writes: steps.flatMap((s) => s.writes),
    log: steps.map((s) => s.log).filter((l): l is string => l !== null),
    flowCalls: steps.map((s) => s.flow).filter((f): f is NonNullable<SaveStep["flow"]> => !!f),
  };
}
```

**Shape change** — the canvas issued a sequential `Patch` chain interleaved with `Collect(colProcessingSteps, …)` log lines, so a failure halfway left the project saved and its trackings stale. `planSaveCleanup` returns a plan: `steps` for reasoning, `writes` for one call to `dataClient.batch`, `log` as the step text the canvas concatenated into one `Notify`, and `flowCalls` so the single flow invocation happens before the writes rather than inside them. `colProcessingSteps` stops being mutable app state and becomes the plan's return value.
**Pinned by** — UT-GDATA-041, UT-GDATA-041b, UT-GDATA-042, UT-GDATA-043, UT-GDATA-044b, UT-GDATA-045, UT-GDATA-046, UT-GDATA-048, UT-GDATA-048b, UT-GDATA-049, UT-GDATA-051, UT-GDATA-051b

##### pcf_btn_GeneralData_DisplayProject_Body_Buttons_Save.OnSelect — 159 lines → `classifyStartClusterChange()`

Decides whether Save writes straight through or has to open the cluster-change milestone panel first, and in which direction.

```powerfx
With(
    {
        varSelectedDevelopmentType: drp_GeneralData_DisplayProject_Body_TechnologyTab_Content_ProjectDevelopment.Selected.Value,
        varSelectedStartCluster: drp_GeneralData_DisplayProject_Body_General_Content_ClusterChange.Selected.Value
    },
    With(
        {
            varPreviousCluster: Coalesce(
                gblRecordSelectedProject.'Start Cluster',
                'Cluster States'.Greenfield
            ),
            varNewCluster: If(
                varSelectedDevelopmentType = 'Development Type'.'Acquired Project',
                Coalesce(
                    varSelectedStartCluster,
                    'Cluster States'.Greenfield
                ),
                'Cluster States'.Greenfield
            ),
            varHasAnyMilestoneData: Or(
                Not(IsBlank(gblRecordSelectedProject.'Project Start Date')),
                Not(IsBlank(gblRecordSelectedProject.'1-Feasibility studies')),
                Not(IsBlank(gblRecordSelectedProject.'2-Project development started')),
                Not(IsBlank(gblRecordSelectedProject.'3-Application submitted')),
                Not(IsBlank(gblRecordSelectedProject.'4-Legally binding permits')),
                Not(IsBlank(gblRecordSelectedProject.'Final Investment Decision')),
                Not(IsBlank(gblRecordSelectedProject.'5-Construction')),
                Not(IsBlank(gblRecordSelectedProject.'Operations start date (COD)'))
            )
        },
// … [129 of the block's 159 lines omitted]
```

```typescript
export function classifyStartClusterChange(args: {
  developmentType: number | null;
  /** The project's current `Start Cluster`, blank meaning Greenfield. */
  previousCluster: number | null;
  /** The dropdown's selection. */
  selectedCluster: number | null;
  project: ProjectSnapshot | null;
}): StartClusterChange {
  const { developmentType, previousCluster, selectedCluster, project } = args;

  const previousNo = startClusterNo(previousCluster);
  const newNo = developmentType === CHOICE.developmentType.acquiredProject
    ? startClusterNo(selectedCluster)
    : CHOICE.clusterState.greenfield;

  if (developmentType === CHOICE.developmentType.ownDevelopment) return "direct-save";
  if (newNo === 0) return "direct-save";
  if (previousNo === newNo) return "direct-save";

  const prevImpact = milestoneImpactNo(previousNo);
  const newImpact = milestoneImpactNo(newNo);
  if (prevImpact === newImpact) return "direct-save";
  if (!hasAnyMilestoneData(project)) return "direct-save";
  if (newImpact > prevImpact && !hasAnyMilestoneToDelete(project, newNo)) return "direct-save";

  return newImpact > prevImpact ? "panel-upward" : "panel-downward";
}
```

**Shape change** — five verbatim copies of the seven-arm `Switch(cluster, 'Cluster States'.Greenfield, 0, …)` collapse into `startClusterNo()`, because `vsb_startcluster` numbers its own options 0…6 and the switch is an identity map. The three-way string return replaces a nest of `UpdateContext` booleans (`locNeedsClusterPanel`, `locClusterPanelDirection`) that the canvas had to keep in sync by hand.
**Pinned by** — UT-GDATA-033b, UT-GDATA-036, UT-GDATA-037, UT-GDATA-038, UT-GDATA-038b, UT-GDATA-038c

##### btn_General_CancelActiveDraftGateApprovalForStartClusterChange.OnSelect — 183 lines → `plannedTrackingRows()` and `shouldCancelGateApproval()`

Rebuilds one `Project State Trackings` row per checklist cluster after a Start Cluster move, and decides whether a live Draft gate approval has to be cancelled first.

```powerfx
With(
    {
        varAutoSkippedComment: "Automatically completed because this project starts at a later cluster."
    },
    With(
        {
            varStatesWithClusterNo: AddColumns(
                Filter(
                    'Project States' As PS,
                    PS.'Is Visible On Checklist' = true &&
                    (
                        PS.Name = "Draft" ||
                        PS.Name = "Cluster 1" ||
                        PS.Name = "Cluster 2" ||
                        PS.Name = "Cluster 3" ||
                        PS.Name = "Cluster 4" ||
                        PS.Name = "Cluster 5" ||
                        PS.Name = "Cluster 6"
                    )
                ) As PS,
                ClusterNo,
                Switch(
                    PS.Name,
                    "Draft", 0,
                    "Cluster 1", 1,
                    "Cluster 2", 2,
                    "Cluster 3", 3,
                    "Cluster 4", 4,
                    "Cluster 5", 5,
                    "Cluster 6", 6,
                    999
                )
            )
        },
// … [149 of the block's 183 lines omitted]
```

```typescript
export function plannedTrackingRows(
  states: ProjectStateRef[],
  newStartClusterNo: number,
  existing: TrackingRow[] = [],
): PlannedTrackingRow[] {
  return states
    .filter((s) => s.isVisibleOnChecklist && s.name in CHECKLIST_CLUSTER_NO)
    .map((s) => {
      const clusterNo = CHECKLIST_CLUSTER_NO[s.name];
      const skipped = clusterNo > 0 && clusterNo < newStartClusterNo;
      return {
        clusterStateId: s.id,
        clusterStateName: s.name,
        clusterNo,
        approvalClusterState:
          s.name === "Draft" ? CHOICE.approvalClusterState.inProgress
          : skipped ? CHOICE.approvalClusterState.completed
          : CHOICE.approvalClusterState.notStarted,
        comment: skipped ? AUTO_SKIPPED_COMMENT : null,
        existingTrackingId: existing.find((t) => t.clusterStateId === s.id)?.id ?? null,
      };
    })
    .sort((a, b) => a.clusterNo - b.clusterNo);
}

export function shouldCancelGateApproval(draftTracking: TrackingRow | null | undefined): boolean {
  if (!draftTracking) return false;
  if (isBlank(draftTracking.flowRunId)) return false;
  return draftTracking.approvalClusterState === CHOICE.approvalClusterState.inProgress;
}
```

**Shape change** — the in-formula `AddColumns(Filter('Project States', …), ClusterNo, Switch(...))` becomes a lookup table (`CHECKLIST_CLUSTER_NO`) over an already-queried, typed `ProjectStateRef[]`; the nested `LookUp(varStatesWithClusterNo, ClusterNo = …)` calls become index arithmetic. `existingTrackingId` decides create-versus-update up front, so the rebuild reuses rows instead of duplicating them, and the whole set goes out as one batch rather than a `Patch` per cluster. This is the same rule the Checklist screen re-implements as `planSkippedClusterBackfill`, which is why both feature folders carry the same `AUTO_SKIPPED_COMMENT` constant.
**Pinned by** — UT-GDATA-042, UT-GDATA-043, UT-GDATA-044, UT-GDATA-044b, UT-GDATA-045, UT-GDATA-046

##### pcf_btn_GeneralData_DisplayProject_Body_Buttons_Save_2.OnChange — 334 lines → `buildProjectPatch()`

Patch #1: the field-by-field mapping from the form controls onto `Projects` columns, including the two people-picker lookups.

```powerfx
IfError(
    Set(
        gblRecordSelectedProject,
        Patch(
            Projects,
            If(
                IsBlank(gblRecordSelectedProject),
                Defaults(Projects),
                gblRecordSelectedProject
            ),
            {
                'Project Name': txt_GeneralData_DisplayProject_Body_General_Content_ProjectName.Text,
                'Project Manager': LookUp(
                    'Microsoft Entra IDs',
                    Or(
                        IsBlank(First(pcf_GeneralData_DisplayProject_Body_General_Content_Manager_PeoplePicker.SelectedPeople)),
                        ThisRecord.'A unique identifer for Microsoft Entra ID' = GUID(First(pcf_GeneralData_DisplayProject_Body_General_Content_Manager_PeoplePicker.SelectedPeople).PersonaKey)
                    )
                ),
                'Deputy Project Manager': If(
                    Not(IsBlank(First(pcf_GeneralData_DisplayProject_Body_General_Content_Deputy_Manager_PeoplePicker.SelectedPeople))),
                    LookUp(
                        'Microsoft Entra IDs',
                        ThisRecord.'A unique identifer for Microsoft Entra ID' = GUID(First(pcf_GeneralData_DisplayProject_Body_General_Content_Deputy_Manager_PeoplePicker.SelectedPeople).PersonaKey)
                    ),
                    Blank()
                ),
                'SPV Name': txt_GeneralData_DisplayProject_Body_General_Content_SPVName.Text,
                'Short Name': txt_GeneralData_DisplayProject_Body_General_Content_ShortName.Text,
                'Project Type': drp_GeneralData_DisplayProject_Body_General_Content_ProjectType.Selected.Value,
                Country: drp_GeneralData_DisplayProject_Body_General_Content_Country.Selected,
                'Area/State/Province': drp_GeneralData_DisplayProject_Body_General_Content_Area.Selected,
                District: txt_GeneralData_DisplayProject_Body_General_Content_District.Text,
// … [301 of the block's 334 lines omitted]
```

```typescript
export function buildProjectPatch(
  form: GeneralDataForm,
  ref: GeneralDataRefData,
  project: ProjectSnapshot | null,
): Record<string, unknown> {
  const lang = ref.language;
  const country = ref.countries.find((c) => c.id === form.countryId);
  const countryName = country?.name ?? project?.countryName ?? null;
  const acquired = isAcquisitionRowVisible(form.developmentType);
  const draftState = ref.projectStates.find((s) => s.name === "Draft");

  const municipality =
    countryName === "Germany" ? form.municipalityGermany
    : countryName === "France" ? form.municipalityFrance
    : form.municipality;

  const numeric = (raw: string): number | null => {
    if (isBlank(raw)) return null;
    const n = parseNumber(raw, lang);
    return Number.isNaN(n) ? null : n;
  };

  return {
    [PROJECT_COL.name]: form.projectName,
    [PROJECT_COL.shortName]: form.shortName,
    [PROJECT_COL.projectType]: form.projectType,
    [PROJECT_COL.district]: form.district,
    [PROJECT_COL.municipality]: municipality,
    [PROJECT_COL.terrainSize]: numeric(form.terrainSize),
    [PROJECT_COL.latitude]: numeric(form.latitude),
    [PROJECT_COL.longitude]: numeric(form.longitude),
// … [49 lines omitted]
```

**Shape change** — in-formula `LookUp('Microsoft Entra IDs', …)` calls become `@odata.bind` navigation properties built by `bind()`, so no reference table is read at save time; control `.Text` becomes a typed `GeneralDataForm` field parsed through `parseNumber` for the locale; and choice labels become option-set integers via `technologyValue()`, because writing the label is a 400 against a live choice column. Note that this control is the older of the two save buttons and is not itself ported — only `btn_GeneralData_Save_Actual` is — but its `Patch` payload is the field mapping `buildProjectPatch` reproduces.
**Pinned by** — UT-GDATA-002, UT-GDATA-033, UT-GDATA-034, UT-GDATA-041b

##### Project General Data Screen.OnVisible — 182 lines → `useProjectContext()`

Re-reads the selected project, recomputes the edit privilege, and seeds every local variable the screen renders from.

```powerfx
Set(
    gblRecordSelectedProject,
    LookUp(
        Projects,
        ThisRecord.Project = gblRecordSelectedProject.Project
    )
);
Patch(
    colMapLocation,
    {ID: 1},
    {
        Latitude: Value(gblRecordSelectedProject.Latitude),
        Longitude: Value(gblRecordSelectedProject.Longitude)
    }
);
UpdateContext(
    {
        locRequiredfieldHeight: 56,
        locIsVisibleRightPanelNewEditShareholdingEntity: false,
        locIsVisibleRightPanelEditCheckList: false,
        locIsVisiblePopUpConfirmationDialog: false,
        // locIsVisiblePopUpConfirmationDialogDesc: Blank(),
        locIsGeneralFormDirty: false,
        locIShareholdingEntityFormDirty: false,
        // locUpdatedProjectManager: Blank(),
        // locSelectedProjectManager: Blank(),
locChangedLatitude: Value(gblRecordSelectedProject.Latitude),
        locChangedLongitude: Value(gblRecordSelectedProject.Longitude),
        locChangedLatitude2: Value(gblRecordSelectedProject.Latitude),
        locChangedLongitude2: Value(gblRecordSelectedProject.Longitude),
// … [152 of the block's 182 lines omitted]
```

```typescript
export function useProjectContext(): ProjectContext {
  const selected = useAppStore((s) => s.project.selected);
  const selectProject = useAppStore((s) => s.selectProject);
  const patchUser = useAppStore((s) => s.patchUser);
  const id = selected?.projectId;

  const q = useQuery({
    queryKey: qk.projects.one(id ?? "none"),
    enabled: Boolean(id),
    queryFn: async () => {
      const [record, priv] = await Promise.all([
        projectFullRepo.getById(id!),
        readPrivileges(id!),
      ]);
      return { record, priv };
    },
    staleTime: 30_000,
  });

  const record = q.data?.record;
  const canEdit = canEditSelectedProject(q.data?.priv.create, q.data?.priv.edit);

  // Re-hydrate the store with the freshly read record, exactly as the canvas OnVisible did.
  useEffect(() => {
    if (record) selectProject(toSelectedProject(record));
  }, [record, selectProject]);

  useEffect(() => {
    if (q.data) patchUser({ canEditSelectedProject: canEdit });
  }, [q.data, canEdit, patchUser]);
// … [10 lines omitted]
```

**Shape change** — the `Set(gblRecordSelectedProject, LookUp(...))` + `Set(gblCurrentUser, Patch(..., {CanEditSelectedProject: ...}))` idiom that opens nearly every canvas `OnVisible` becomes one shared hook: a `useQuery` keyed on the project id, a `readPrivileges()` probe that answers from the server, and two effects that re-hydrate the Zustand `project` slice. The forty-odd `UpdateContext` locals become React state in `Screen.tsx` and derived values from `toForm()`; `colMapLocation`, a one-row collection existing only so a map control had something to bind to, is deleted and `mapMarker()` reads the form directly.
**Pinned by** — UT-GDATA-001, UT-GDATA-002, UT-GDATA-053, UT-GDATA-053b

#### Security conditions

| Condition | Canvas today | Where it must be enforced |
|---|---|---|
| Save an existing project | `Save.DisplayMode` reads `gblCurrentUser.CanEditSelectedProject`, itself `And(DataSourceInfo(Projects, CreatePermission), Coalesce(RecordInfo(record, EditPermission), false))` — computed in `OnVisible`, UI-only | `canSave()` gates the button and `canEditSelectedProject()` supplies the flag from `readPrivileges()`, which returns `{create:false, edit:false}` when the probe throws. The real gate is the Write privilege on `vsb_projects` plus row-level sharing. |
| Create a new project | The same formula, so a user with Create but no record to edit still passes | `canSave()` switches to `perms.canCreate` when `project?.id` is absent (UT-GDATA-027). Create privilege on `vsb_projects` is the server-side authority. |
| Country dropdown scope | `countryOptions` narrows to the caller's editable countries, derived client-side from role names, and falls back to the FULL list when the scope is empty or the project's own country is out of scope | `countryOptions()` in the UI is narrowing only. Real scoping is business-unit ownership on `vsb_countries`; the fall-back-to-all behaviour is deliberately preserved (UT-GDATA-029, UT-GDATA-030) and is the finding — an out-of-scope project silently unlocks every country. |
| Country locked once Approved | `DisplayMode` formula on the dropdown only | `countryDisplayMode()` for the UI; a Dataverse plugin or column-level security on `vsb_country` for the write path, since a `PATCH` bypasses the formula entirely. |
| Project Name / Area locked past Draft | `DisplayMode` formula only | `fieldModes()` for the UI. Nothing prevents the column being patched; needs a server-side plugin. |
| Project Manager must be a real person | **No check.** `LookUp('Microsoft Entra IDs', Or(IsBlank(First(picker.SelectedPeople)), <id match>))` matches the FIRST Entra row when the picker is empty, so an empty picker silently assigns an arbitrary person | `assertManagerSelected()` runs in `saveGeneralData()` before any write is issued, so the guard is no longer only in the UI. A required-field or plugin check on `vsb_projectmanager` would close it server-side. |
| Controlling-group membership | `isUserInControllingGroup` matches the role name `"VSB - Functional Approval Confirmation"` set in `App.OnStart` | Kept for display parity only. A role name is not a privilege (CONVENTIONS rule 4); anything it gates must move to a Dataverse privilege check. |
| Cancelling a running Draft gate approval | **No permission check.** The cancellation flow is invoked with whatever the app has | `cancelGateApproval()` is a typed wrapper; the check has to live in the custom API. The app-side call is deliberately failure-tolerant (`IfError(..., false)` parity) and only logs a warning, so an unauthorised cancellation fails silently. |

#### Deliberate divergences

- **Project Manager assignment.** Canvas: an empty people picker resolves to the first `Microsoft Entra IDs` row and that person is written as Project Manager; only the save button's `DisplayMode` stood between the user and a wrong assignment. Rebuild: the same defect is closed in the mutation layer by `assertManagerSelected()`, which returns `MSG.manager` and aborts before any write. Marked `SOURCE DEFECT (rule 31, and the identical pattern in the Team save)` in `rules.ts`; the Team screen closes the twin in `buildMemberPayload()`.
- **Shareholding ownership must total 100 %.** Canvas: the sum rule blocks Save. Rebuild: `shareholdingSumWarning()` renders it as an informational banner and `canSave()` does not gate on it, because the guide's own saved record has a single 50 % row. Marked `Rule 16 REVISED` in `canSave`; a test pins the non-blocking behaviour (UT-GDATA-021, UT-GDATA-021b).
- **SPV Company Code as a required field.** Canvas: `MSG.spvCodeBlank` is pushed as a blocking validation message. Rebuild: Basic Information has no SPV Company Code control, so a blocking requirement would be unsatisfiable; the shape check (`MSG.spvCodeShape`) is kept defensively for a value arriving from elsewhere, the blank-required push is removed (UT-GDATA-014, UT-GDATA-015).
- **Standard-assumption flags on skipped milestones.** Canvas: `If(cond, false)` evaluates to `Blank()` when the condition is false and therefore blanks the flag. Rebuild: `clearSkippedMilestones()` leaves the flag untouched below its threshold — same observable effect, one fewer write (UT-GDATA-040).

#### Build steps

1. Land `RequireProject`, `isNewProjectRequest()` and `NEW_PROJECT_ROUTE` so the New Project path reaches this route with nothing selected.
2. Settle the `project` slice in `appStore.ts` and `useProjectContext()` / `readPrivileges()`, and confirm `navItemColor()` reads `projectId` for the General rail item.
3. Write `PROJECT_COL`, `PROJECT_LOOKUP`, `SHAREHOLDER_COL`, `TRACKING_COL`, `MSG` and `bind()` in `rules.ts` — every later feature imports them.
4. Write the pure validation and display-mode rules (`validationMessages`, `coordinateMessage`, `canSave`, `countryOptions`, `countryDisplayMode`, `fieldModes`, `municipalityMode`) and their tests, UT-GDATA-001 … 032.
5. Write `startClusterNo`, `milestoneImpactNo`, `classifyStartClusterChange`, `clusterPanelVisibleFields`, `milestoneChainErrors` and `clearSkippedMilestones` with tests UT-GDATA-033 … 040.
6. Write `plannedTrackingRows`, `shouldCancelGateApproval`, `buildProjectPatch`, `assertManagerSelected` and `planSaveCleanup` with tests UT-GDATA-041 … 051b, asserting every planned write appears exactly once.
7. Build `hooks.ts`: the nine concurrent reference `useQuery`s replacing the `OnVisible` `ClearCollect` chain, `useEntraSearch`, `useMunicipalitySearch`, and `saveGeneralData()` sequencing patch → re-read on this screen's own projection → flow → one batch.
8. Compose `Screen.tsx` as the three guide sections plus the map, the shareholding grid and panel, the cluster-change panel, and the `RecordFooter` audit stamp.
9. Run `npx tsc --noEmit` filtered to `features/general-data` and `npx vitest run src/features/general-data`.

#### Exit gate

`npx vitest run src/features/general-data` passes all 70 cases, `npx tsc --noEmit` reports nothing under `features/general-data`, and two behaviours are demonstrably true: a save attempted with an empty Project Manager picker returns an `AppError` and issues zero writes (UT-GDATA-050), and a Start Cluster move from 1 to 3 with existing milestone data produces exactly one `rebuild-trackings` step containing seven upserts and one `cancelGateApproval` flow call ordered before them (UT-GDATA-044b, UT-GDATA-045).

---
### 10. Project General Milestones Screen — `src/features/milestones/`

| | |
|---|---|
| Canvas unit | `PM::Project General Milestones Screen` (PM app) |
| Power Fx | `85` blocks ≥3 lines · `45` ≥10 · `17` ≥30 · `2829` lines in those blocks (`4288` across all `=` properties) |
| Complexity | band `M` · score `22.1` · `11` build-days |
| Code app | `Screen.tsx` 436 ln · `hooks.ts` 420 ln · `rules.test.ts` 804 ln · `rules.ts` 1166 ln |
| Pure rules exported | `54` |
| Unit tests | `71` cases · IDs `UT-MSTONE-001…056` |
| Dataverse tables | Estimation Price Inflations, Fabric Job Types, Fabric Sync Jobs, GeneratorTypeInProjects, Generators, Permits, Project Revenues, Project States, Projects |

#### What it does

A two-column date form for the eleven milestones that define the project's calendar — Project Start, Clusters 1 to 6, Final Investment Decision, Project End, Sales Start and Sales Completion — plus Share of Farmdown and a computed Operational Lifetime. Each date has a recalculate button that derives it from the country-and-technology `average duration [months]` assumption row, and a date the app derived renders italic blue while one the user typed renders plain. Saving writes the whole chain back to `Projects`, and because a moved FID re-prices the generator ladder it also writes `GeneratorTypeInProjects` and the project's Plant WTG Cost, and seeds a default `Project Revenues` contract for a project still in Draft or Cluster 1. These are the dates the entire downstream financial model reads, so a wrong one is not a display bug — it silently shifts every cash flow.

#### Depends on

- `src/features/general-data/` must be finished and saved at least once: this screen imports `PROJECT_COL`, `bind()`, `startClusterNo()`, `formatAuditStamp()` and — critically — `clearSkippedMilestones()` from `general-data/rules.ts`, and re-exports the last three rather than restating them. Rule 17 here is the same rule as General Data's cluster-change panel (rule 29).
- `src/routes/AppRoutes.tsx` — `RequireProject`. Unlike General there is no new-project escape hatch, so the guard is absolute.
- `src/store/appStore.ts` and `src/features/shared/useProjectContext.ts` — the project slice and the server-derived `canEdit`. The rail item for Milestones colours from `PM_NAV`'s prerequisite in `src/domain/navigation.ts`, and the "Data complete" meter in `src/components/LeftNav.tsx` moves when this screen saves, so both must already behave.
- `src/domain/dates.ts` — `addDays`, `addMonths`, `addYears` (the calendar-correct `DateAddYearsRevamped`) and `addYears360` (the shipped 360-day `DateAddYears`, parity only). Every derived date on this screen goes through these.
- `src/domain/numeric.ts` — `parseNumber`, `isTwoDecimal`, `inRange`, `isBlank`, `pfxRound`; `src/domain/technology.ts` — `technologyLabel`, `technologyValue`.
- `src/data/entities.ts` — `ES`, `CHOICE`; `src/data/repos.ts` — `projectFullRepo`, `projectStateRepo`, `milestoneAssumptionRepo`, `estimationPriceInflationRepo`, `assumptionsRevenuesRepo`, `currencyRepo`, `revenueSubaccountRepo`, `projectRevenueRepo`, `generatorTypeInProjectRepo`, `generatorTypeRepo`.
- `src/platform/dataClient.ts` — `batch()`; `src/platform/odata.ts` — `f`, `asc`; `src/platform/errors.ts` — `toAppError`, `Result`.
- `src/components` — `PageHeader`, `Card`, `CommandBar`, `ConfirmDialog`, `LoadingOverlay`, `NumericInput`, `RecordFooter`.
- Dataverse privileges: Write on `vsb_projects`; Write on `vsb_generatortypeinprojects`; Create on `vsb_projectrevenues`; Read on Estimation Price Inflations, Project States, Permits and the milestone standard-assumption table.
- Not required, and deliberately absent: the `Fabric Sync Jobs` insert and `ForaProjecttriggerFabricDEVEX/CAPEXrecalculation` call are commented out in the canvas save and the flow does not ship in the solution export. `FABRIC_SYNC_NOTE` in `rules.ts` records the open question; nothing is called.

#### Power Fx → TypeScript

##### btn_Project_Milestone_Save.OnSelect — 878 lines → `planSaveMilestones()`

The single largest block on either app: the whole date chain, the standard-assumption flags, Operational Lifetime, Share of Farmdown, the re-priced generators and the seeded revenue contract, written as one save.

```powerfx
Refresh('Project Revenues');
Concurrent(
    UpdateContext(
        {
            locGeneralDataIsSavingDialogVisible: true,
            locGeneralDataSavingDialogText: $"The project is being saved, please wait.."
        }
    ),
    UpdateContext(
        {
            locAreaWithRegion: With(
                {
                    _area: Trim(
                        Coalesce(
                            gblRecordSelectedProject.'Area/State/Province'.Name,
                            ""
                        )
                    )
                },
                Switch(
                    _area,
                    "Lazio",
                    "Italy_Centre - South",
                    "Lombardia",
                    "Italy_North",
                    "Emilia Romagna",
                    "Italy_North",
                    "Sicilia",
                    "Italy_Sicily",
                    "Valle d’Aosta",
                    "Italy_North",
// … [847 of the block's 878 lines omitted]
```

```typescript
export function planSaveMilestones(ctx: MilestoneSaveContext): MilestoneSavePlan {
  const { project, form } = ctx;
  const n = startClusterNo(project.startCluster);
  const dates = form.dates;
  const steps: MilestoneSaveStep[] = [];

  const flag = (k: MilestoneKey) => form.standardAssumption[k] ?? false;
  const lifetime = operationalLifetime(dates.OperationsStartDate, dates.EndDate);
  const farmdown = parseNumber(form.shareOfFarmdown, ctx.language);

  const data: Record<string, unknown> = {
    // Rule 17 — start-cluster-skipped milestones and their flags.
    ...clearSkippedMilestones({
      startDate: dates.StartDate,
      cluster1: dates.FeasibilityStudies,
      cluster2: dates.ProjectDevelopmentStarted,
      cluster3: dates.ApplicationSubmitted,
      cluster4: dates.LegallyBindingPermits,
    }, n),

    [PROJECT_COL.fid]: dates.FinalInvestmentDecision,
    [PROJECT_COL.construction]: dates.Construction,
    [PROJECT_COL.cod]: dates.OperationsStartDate,
    [PROJECT_COL.endDate]: dates.EndDate,
    [PROJECT_COL.salesStartDate]: dates.SalesStartDate,
    [PROJECT_COL.salesCompleted]: dates.StartCompleted,

    // The three thresholded flags are already handled by clearSkippedMilestones; these
    // set them where the threshold was NOT reached.
    ...(n >= 3 ? {} : { [PROJECT_COL.isProjectDevelopmentStd]: flag("ProjectDevelopmentStarted") }),
// … [51 lines omitted]
  return {
    steps,
    writes: steps.flatMap((s) => s.writes),
    log: steps.map((s) => s.log).filter((l): l is string => l !== null),
  };
}
```

**Shape change** — the canvas issued `Patch(Projects, …)`, then a second `Patch(Projects, …)` for the plant cost, then a `ForAll` of generator patches, then a revenue `Collect`. Here the plant cost rides along in the same project patch and the whole thing becomes one ordered `MilestoneSavePlan` handed to `dataClient.batch`, so the plan is inspectable before anything is written. `colMilestonesFormValidation` and `colLogs` stop existing as collections; the italian-region `Switch` becomes the pure `italianRegion()` lookup. Note that `batch()` is a bounded fan-out, not a Dataverse transaction — it removes the unbounded `ForAll` write loop, it does not make the save atomic.
**Pinned by** — UT-MSTONE-024, UT-MSTONE-024b, UT-MSTONE-028, UT-MSTONE-043, UT-MSTONE-043b, UT-MSTONE-044

##### btn_Milestones_DisplayProject_Body_Buttons_Recalculate.OnSelect — 238 lines → `validateMilestones()`

The twelve ordering-and-presence rules that decide which milestone rows are valid, evaluated against whatever dates you hand it.

```powerfx
With(
    {
        varStartClusterNo: Coalesce(
            locSelectedStartClusterNo,
            0
        )
    },

    // Project Start
    Patch(
        colMilestonesFormValidation,
        LookUp(
            colMilestonesFormValidation,
            Name = "StartDate"
        ),
        {
            Valid: Or(
                varStartClusterNo >= 1,
                Not(IsBlank(dtp_Milestones_DisplayProject_Body_General_Content_StartDate.SelectedDate))
            )
        }
    );

    // Cluster 1: Feasibility Studies
    Patch(
        colMilestonesFormValidation,
        LookUp(
            colMilestonesFormValidation,
            Name = "FeasibilityStudies"
        ),
        {
            Valid: Or(
                varStartClusterNo >= 2,
// … [207 of the block's 238 lines omitted]
```

```typescript
export function validateMilestones(
  dates: MilestoneDates,
  startCluster: number | null | undefined,
  shareOfFarmdown = "50",
  language: Lang = "en-US",
): MilestoneValidation {
  const n = startClusterNo(startCluster ?? 0);
  const d = (k: Exclude<MilestoneKey, "ShareOfFarmdown">) => time(dates[k]);
  const present = (k: Exclude<MilestoneKey, "ShareOfFarmdown">) => !isBlank(dates[k]);
// … [10 lines omitted]
  const valid: Record<MilestoneKey, boolean> = {
    StartDate: n >= 1 || present("StartDate"),
    FeasibilityStudies:
      n >= 2 || (present("FeasibilityStudies") && (n === 1 || after("FeasibilityStudies", "StartDate"))),
    ProjectDevelopmentStarted:
      n >= 3 || (present("ProjectDevelopmentStarted")
        && (n === 2 || after("ProjectDevelopmentStarted", "FeasibilityStudies"))),
    ApplicationSubmitted:
      n >= 4 || (present("ApplicationSubmitted")
        && (n === 3 || after("ApplicationSubmitted", "ProjectDevelopmentStarted"))),
    LegallyBindingPermits:
      n >= 5 || (present("LegallyBindingPermits")
        && (n === 4 || after("LegallyBindingPermits", "ApplicationSubmitted"))),
    FinalInvestmentDecision:
      present("FinalInvestmentDecision")
      && (n >= 5 || after("FinalInvestmentDecision", "LegallyBindingPermits")),
    Construction: after("Construction", "FinalInvestmentDecision"),
    OperationsStartDate: after("OperationsStartDate", "Construction"),
    EndDate: after("EndDate", "OperationsStartDate"),
// … [13 lines omitted]
}
```

**Shape change** — the canvas had TWO writers of `colMilestonesFormValidation`: `btn_…_Reset_Validation` evaluating the rules against the stored record and `btn_…_Recalculate` evaluating the same rules against the controls. They are one rule set against different inputs, so the inputs became arguments and the collection disappeared; `Dirty` becomes the form's dirty-key set. Reading `dtp_….SelectedDate` off named controls becomes reading a typed `MilestoneDates` record, and the twelve `Patch(col, LookUp(col, Name = "…"))` round trips become one returned object.
**Pinned by** — UT-MSTONE-006, UT-MSTONE-007, UT-MSTONE-008, UT-MSTONE-009, UT-MSTONE-010, UT-MSTONE-010b, UT-MSTONE-011, UT-MSTONE-012, UT-MSTONE-013, UT-MSTONE-013b, UT-MSTONE-023b, UT-MSTONE-047, UT-MSTONE-048, UT-MSTONE-049, UT-MSTONE-050, UT-MSTONE-051, UT-MSTONE-052, UT-MSTONE-053

##### dtp_Milestones_DisplayProject_Body_General_Content_FiD.OnChange — 151 lines → `accumulatedIndex()` and `repriceGenerators()`

Moving the FID re-prices every generator on the project through the price-escalation index for the FID year.

```powerfx
UpdateIf(
    colMilestonesFormValidation,
    Name = "FinalInvestmentDecision",
    {
        Valid: And(
            Not(IsBlank(Self.SelectedDate)),
            Self.SelectedDate > dtp_Milestones_DisplayProject_Body_General_Content_Cluster4.SelectedDate
        ),
        Dirty: Not(gblRecordSelectedProject.'Final Investment Decision' = Self.SelectedDate)
    }
);
UpdateContext({locNeedPlantCostsRecalculation: Not(gblRecordSelectedProject.'Final Investment Decision' = Self.SelectedDate)});
Concurrent(
    ClearCollect(
        colLogs,
        Blank()
    ),
    ClearCollect(
        colProjectGenerators,
        Filter(
            GeneratorTypeInProjects,
            And(
                Not(IsBlank(gblRecordSelectedProject.Project)),
                Project.Project = gblRecordSelectedProject.Project
            )
        )
    )
);
ClearCollect(
    colProjectGeneratorsTemporary,
    colProjectGenerators
);
// … [119 of the block's 151 lines omitted]
```

```typescript
export function accumulatedIndex(
  fid: string | null,
  current: PriceInflationRow | null | undefined,
  previous: PriceInflationRow | null | undefined,
): number {
  if (isBlank(fid) || !current || !previous) return 1;
  const prev = previous.accumulatedIndex ?? 0;
  const cur = current.accumulatedIndex ?? 0;
  // Power Fx `Month()` is 1-based.
  const month = new Date(fid!).getMonth() + 1;
  return prev + (cur - prev) * (month / 12);
}

export function repriceGenerators(
  generators: ProjectGenerator[],
  index: number,
): ProjectGenerator[] {
  return generators.map((g) => {
    const rung = Math.min(Math.max(g.count, 1), 5) - 1;
    const net = g.wtgPrices[rung] ?? g.wtgPrices[g.wtgPrices.length - 1] ?? 0;
    const perWtg = g.foundationCostIncluded
      ? net * index
      : (net + (g.additionalFoundationCost ?? 0)) * index;
    return { ...g, generatorsCost: pfxRound(g.count * perWtg, 2) };
  });
}
```

**Shape change** — the two `LookUp('Estimation Price Inflations', 'FID Year' = …)` calls become one `usePriceInflation(fid)` query, and the four collections (`colProjectGenerators`, `colProjectGeneratorsTemporary`, `colLogs`, plus the validation collection) collapse to a pure input array and a pure output array. The `'1 WTG price'` … `'5 WTG price'` ladder becomes the `wtgPrices` array with `Math.min(Math.max(count, 1), 5)` clamping at the top rung; a missing inflation row returns a neutral index of 1 instead of a blank that would zero every cost.
**Pinned by** — UT-MSTONE-025, UT-MSTONE-025b, UT-MSTONE-026, UT-MSTONE-027, UT-MSTONE-027b, UT-MSTONE-028

##### but_Milestones_DisplayProject_Body_General_Content_FiD.OnSelect — 53 lines → `recalculateMilestone()` and `deriveNextDate()`

One date's recalculate button: derive it from the previous milestone plus the country-and-technology cluster duration, and mark it a standard assumption.

```powerfx
With(
    {
        /*
        varRecalculatedDate: DateAdd(
            dtp_GeneralData_DisplayProject_Body_GeneralData_DisplayProject_Body_MilestonesTab_Content_Construction.SelectedDate,
            -1,
            TimeUnit.Months
        )
        */
        varRecalculatedDate: Coalesce(
            fn_Common_Milestones.DateAddMonths(
                dtp_Milestones_DisplayProject_Body_General_Content_Cluster4.SelectedDate,
                First(
                    Filter(
                        colMilestonesAssumptions,
                        And(
                            Name = gblAppConstants.MilestonesAssumptions.AverageDurationMonths,
                            Country.Country = gblRecordSelectedProject.Country.Country,
                            Technology = gblRecordSelectedProject.Technology
                        )
                    )
                ).'Cluster 4'
            ),
// … [30 of the block's 53 lines omitted]
```

```typescript
export function deriveNextDate(from: string | null, months: number | null | undefined): string | null {
  if (isBlank(from) || months === null || months === undefined || Number.isNaN(months)) return null;
  return addMonths(from!, months).toISOString().slice(0, 10);
}

export function recalculateMilestone(
  form: MilestonesForm,
  target: Exclude<MilestoneKey, "ShareOfFarmdown" | "StartDate">,
  assumption: MilestoneAssumptionRow | null | undefined,
): MilestonesForm {
  const source: Partial<Record<MilestoneKey, {
    from: Exclude<MilestoneKey, "ShareOfFarmdown">;
    months: keyof MilestoneAssumptionRow;
  }>> = {
    FeasibilityStudies: { from: "StartDate", months: "cluster1" },
    ProjectDevelopmentStarted: { from: "FeasibilityStudies", months: "cluster1" },
    ApplicationSubmitted: { from: "ProjectDevelopmentStarted", months: "cluster2" },
    LegallyBindingPermits: { from: "ApplicationSubmitted", months: "cluster3" },
    FinalInvestmentDecision: { from: "LegallyBindingPermits", months: "cluster4" },
    Construction: { from: "FinalInvestmentDecision", months: "cluster5" },
    OperationsStartDate: { from: "Construction", months: "cluster6" },
  };
  const spec = source[target];
  if (!spec || !assumption) return form;
  const next = deriveNextDate(form.dates[spec.from], assumption[spec.months]);
  if (next === null) return form;
  return {
    ...form,
    dates: { ...form.dates, [target]: next },
    standardAssumption: { ...form.standardAssumption, [target]: true },
  };
}
```

**Shape change** — the identical `Coalesce(fn_Common_Milestones.DateAddMonths(...), fn_Common_Milestones.DateAddMonths(...))` (the same expression twice, so the `Coalesce` never does anything) collapses to one call; the in-formula `First(Filter(colMilestonesAssumptions, …))` becomes the `useMilestoneAssumption(countryId, technology)` query, hit once and cached, rather than re-filtered per button. `Select(btn_…_Recalculate)` — a control selecting another control to re-run validation — becomes the caller re-running `validateMilestones()` on the returned form. Crucially, `standardAssumption[target] = true` here and `false` in `editMilestone()` is the whole derived-versus-entered classification the guide's p16 renders as italic blue versus plain, so `isDerivedMilestone()` reads that flag rather than a hard-coded key list.
**Pinned by** — UT-MSTONE-017, UT-MSTONE-017b, UT-MSTONE-018, UT-MSTONE-019, UT-MSTONE-054, UT-MSTONE-055

#### Security conditions

| Condition | Canvas today | Where it must be enforced |
|---|---|---|
| Screen unusable before General Data has saved | `con_Milestones_Page_LockMessage.Visible = IsBlank(project.'Project ID')` — a banner, not a gate | `isPageLocked()` drives the banner and is also a term in `canSaveMilestones()`, so the lock now blocks the write path rather than only the layout. |
| Save the milestone chain | `OnVisible` recomputes `gblCurrentUser.CanEditSelectedProject` as `And(DataSourceInfo(Projects, CreatePermission), Coalesce(RecordInfo(record, EditPermission), false))`; the button's `DisplayMode` reads it | `canSaveMilestones()` takes `perms` from `useProjectContext()`, never from a role name. The authority is the Write privilege on `vsb_projects` plus row-level sharing; the client gate is convenience. |
| Re-price and write the generator rows | **No separate check.** The generator patches ride on the project save's permission | Write privilege on `vsb_generatortypeinprojects` must be granted independently — a user who may edit the project but not its generators gets a partial save today, and `batch()` is not transactional, so the project patch can land while the generator updates fail. |
| Seed a default revenue contract | **No check.** `Collect('Project Revenues', …)` fires whenever the project is Draft or Cluster 1 with no existing rows | Create privilege on `vsb_projectrevenues`. `buildDefaultRevenue()` returns `null` rather than throwing when the country has no revenue type, so an unprivileged user sees the save succeed with no contract seeded. |
| Trigger the Fabric recalculation | Commented out in the canvas save, and the flow is absent from the solution export | Nothing is called. `FABRIC_SYNC_NOTE` records that the intended shape is a `Fabric Sync Jobs` row picked up by a Dataverse-triggered flow — never a manual flow call from the client. Needs a product-owner decision before any privilege question arises. |
| COD change that invalidates revenue contracts | `codChangeBlocksSave` opens a warning dialog; nothing prevents the write server-side | `codChangeBlocksSave()` in the UI and `useIndividualVolumeContractCount()` as a server-side `$count`. A real guard belongs in a plugin on `vsb_operationsstartdatecod`. |

#### Deliberate divergences

- **Milestone label ordering.** Canvas: `Sort(Filter('Project States', …), Text(Order))` sorts the labels as strings, so an `Order` of 10 would come before 2. Rebuild: `milestoneLabels()` sorts numerically. The canvas ordering is **not** kept reachable — a wrong sort has no legitimate use. Marked `SOURCE DEFECT, corrected` in `rules.ts`; latent today only because the solution ships nine states (UT-MSTONE-046, UT-MSTONE-046b).
- **Revenue-type resolution for Wind.** Canvas: the WIND branch reads `recRevenueTypeRecordForCountry.pv`, not `.wind`, so a country whose PV and wind revenue types differ labels wind contracts wrongly. Rebuild: `revenueLabelFor()` **preserves the defect by default** and exposes `{ fixWindDefect: true }` to read `.wind`. Marked `SOURCE DEFECT, preserved by default and flagged`; the default must not be flipped until the product owner confirms intent, because a silent change re-labels every seeded wind contract (UT-MSTONE-033).
- **Price clamping by year.** Canvas: the clamp compares the COD **year** to the **price** (`Value(recYear) < Value(First(recFilteredPrices).pv)`) and the nearest-match sorts on `Abs(Value(pv) - Value(year))` — both compare a price to a year, which is meaningless. Rebuild: `pickPrice()` clamps and matches on the row's `category` year, which is what the block's own comment describes. The canvas behaviour is **not** kept reachable: it returns an arbitrary row (UT-MSTONE-038, UT-MSTONE-039).
- **`DateAddYears`.** The shipped `fn_Common.DateAddYears` is `DateAdd(candidate, Trunc(addition * 12 * 30), TimeUnit.Days)` — a 360-day year, so "plus one year" lands five or six days early. `src/domain/dates.ts` implements the source's own `DateAddYearsRevamped` as `addYears()` and every date on this screen goes through it; the legacy behaviour survives as `addYears360()` for parity tests only (UT-DOM-031, UT-DOM-032).

#### Build steps

1. Confirm `general-data/rules.ts` exports `PROJECT_COL`, `bind`, `startClusterNo`, `clearSkippedMilestones` and `formatAuditStamp`, and re-export the last three here rather than restating rule 17.
2. Write `MILESTONE_KEYS`, `MILESTONE_CHAIN`, `PREVIOUS_DATE_LABEL` and `orderingMessage()` with the six verbatim guide messages, then their tests UT-MSTONE-047 … 053.
3. Write `validateMilestones()`, `validateFarmdown()`, `invalidMessages()`, `isPageLocked()` and `canSaveMilestones()` with tests UT-MSTONE-001 … 016b, UT-MSTONE-022, UT-MSTONE-023, UT-MSTONE-023b.
4. Write `deriveNextDate()`, `recalculateMilestone()`, `editMilestone()`, `isDerivedMilestone()`, `classifyDerivedMilestones()` and `resetShareOfFarmdown()` with tests UT-MSTONE-017 … 019 and the p16 fixture UT-MSTONE-054 … 056.
5. Write `pfxMonthDiff()` and `operationalLifetime()` — the `+1 day` and the month-boundary count are the rule, not an approximation — with tests UT-MSTONE-020, UT-MSTONE-021, UT-MSTONE-021b.
6. Write the FID re-pricing chain (`accumulatedIndex`, `repriceGenerators`, `needsPlantCostRecalculation`, `plantWtgCost`) and the COD guard, with tests UT-MSTONE-025 … 030.
7. Write the revenue seed (`italianRegion`, `revenueLabelFor`, `subContractSwitch`, `contractDates`, `pickPrice`, `inflationSettings`, `buildDefaultRevenue`) with tests UT-MSTONE-031 … 042b, and `planSaveMilestones()` with UT-MSTONE-043 … 045b.
8. Build `hooks.ts`: `useMilestonesData`, the filtered assumption and inflation queries, `useIndividualVolumeContractCount` as a server-side `$count`, `computeFidRepricing`, and `saveMilestones()` handing the plan to one batch.
9. Compose `Screen.tsx` as the two-column form with per-row recalculate buttons, italic-blue derived values, the Operational Lifetime pair, the farmdown reset, and the `RecordFooter`; then run `npx tsc --noEmit` filtered to `features/milestones` and `npx vitest run src/features/milestones`.

#### Exit gate

Calendar correctness is the gate. `npx vitest run src/features/milestones` passes all 71 cases and `npx vitest run src/domain/dates` passes UT-DOM-031 and UT-DOM-032, which together prove that `addYears("2026-03-15", 1)` is `2027-03-15` while the shipped 360-day `addYears360` gives `2027-03-10`; UT-MSTONE-037 then pins that a contract end date is COD plus years plus months minus one day computed through the calendar-correct path. The gate fails if any milestone, contract or lifetime date in the feature is derived through `addYears360`, or if `grep -n "addYears360" src/features/milestones` returns anything.

---
### 11. Project General Team Screen — `src/features/team/`

| | |
|---|---|
| Canvas unit | `PM::Project General Team Screen` (PM app) |
| Power Fx | `29` blocks ≥3 lines · `16` ≥10 · `5` ≥30 · `548` lines in those blocks (`1394` across all `=` properties) |
| Complexity | band `S` · score `9.7` · `4` build-days |
| Code app | `Screen.tsx` 360 ln · `hooks.ts` 179 ln · `rules.test.ts` 364 ln · `rules.ts` 402 ln |
| Pure rules exported | `31` |
| Unit tests | `36` cases · IDs `UT-TEAM-001…028` |
| Dataverse tables | Project Member Descriptions, Project Members, Projects, Users |

#### What it does

One table of the people attached to a project: the Project Manager and Deputy Project Manager read straight off the project record and are not editable here, and below them the `Project Members` rows a user may add, edit or delete through a right panel with a people picker, a position description and a comment. A command bar of Add Member, Edit and Delete sits above the table, gated on the project having left Draft and on the four prerequisite screens being complete. It writes exactly one table, `Project Members`, one row at a time, which makes it the smallest of the project-context screens and the natural place to prove the shared page-lock and command-gate patterns before the Checklist screen needs them.

#### Depends on

- `src/features/general-data/` — imports `bind()` from `general-data/rules.ts` for the `@odata.bind` navigation properties, and cannot function until General Data has saved once and assigned a `Project ID`.
- `src/features/milestones/`, plus the Generator and Production screens — the page lock lists all four as prerequisites, so their columns (`End Date`, `Total Capacity`, `Net Yield p50`) must already be populated by real screens for the lock to be testable end to end.
- `src/routes/AppRoutes.tsx` — `RequireProject`; `src/store/appStore.ts` — the project slice; `src/features/shared/useProjectContext.ts` — `useProjectContext()` for the server-derived `canEdit`.
- `src/domain/numeric.ts` — `isBlank`; `src/data/entities.ts` — `ES`, `CHOICE` (`CHOICE.position` for the legacy `Positions` choice).
- `src/data/repos.ts` — `projectFullRepo`, `projectMemberFullRepo`, `projectMemberDescriptionRepo`.
- `src/platform/odata.ts` — `asc` (the description list is ordered by `vsb_order`); `src/platform/errors.ts` — `toAppError`.
- `src/components` — `PageHeader`, `CommandBar`, `DataGrid` (`selectionMode="single"`), `FormPanel`, `ConfirmDialog`, `LoadingOverlay`, `TextFieldWithCount`, `UserBadge`, `EmptyState`.
- A shared enabled-accounts people-search query against `Microsoft Entra IDs`, the same one General Data's `useEntraSearch` uses — the two screens run the identical `Search(Filter('Microsoft Entra IDs', 'Account Enabled' = Yes), …)` and must not diverge.
- Dataverse privileges: Create + Write + Delete on `vsb_projectmembers`; Read on `vsb_projectmemberdescriptions`; Read on `vsb_projects` with record-level Write to enable the bar.

#### Power Fx → TypeScript

##### pcf_Team_DisplayProject_Body_CommandBar_Menu.OnSelect — 82 lines → `commandState()`

Which of Add Member, Edit and Delete are available, and why not when they are not.

```powerfx
Switch(
    Self.Selected.ItemKey,
    "newMember",
    /*
    ClearCollect(
        colProjectsPrincipalsPreSelected,
        AddColumns(
            Office365Users.UserProfile(gblCurrentUser.Id),
            PersonaKey,
            Id,
            PersonaName,
            DisplayName,
            PersonaRole,
            Mail
        )
    );*/
    ClearCollect(
        colProjectsPrincipalsPreSelected,
        Table(
            {
                Id: Blank(),
                DisplayName: Blank(),
                Mail: Blank()
            }
        )
    );
    Clear(colProjectsPrincipals);
    ClearCollect(
        colProjectsPrincipals,
        RenameColumns(
            FirstN(
                Users,
                0
            ),
// … [48 of the block's 82 lines omitted]
```

```typescript
export function commandState(
  project: TeamProject | null,
  selectedMemberId: string | null,
  perms: TeamPermissions,
): TeamCommandState {
  const isDraft = isBlank(project?.clusterStateName) || project?.clusterStateName === "Draft";
  const locked = isPageLocked(project);

  // Rule 7 — the bar itself is disabled; nothing below can re-enable a command.
  if (isDraft || locked) {
    const reason = isDraft
      ? "The project is still in Draft. Advance its cluster state to manage the team."
      : "Complete General Data, Milestones, Generator and Production first.";
    return {
      add: { enabled: false, reason },
      edit: { enabled: false, reason },
      delete: { enabled: false, reason },
    };
  }

  const add: CommandGate =
    !project?.id ? { enabled: false, reason: "No project is selected." }
    : !perms.canCreate ? { enabled: false, reason: "You do not have permission to create project members." }
    : !perms.canEditProject ? { enabled: false, reason: "You do not have permission to edit this project." }
    : { enabled: true };

  const onSelection: CommandGate =
    !selectedMemberId ? { enabled: false, reason: "Select a team member first." }
    : !perms.canEditMember ? { enabled: false, reason: "You do not have permission to change this member." }
    : { enabled: true };

  return { add, edit: onSelection, delete: onSelection };
}
```

**Shape change** — the `Switch` on `Self.Selected.ItemKey` was doing two unrelated jobs: dispatching the menu action and priming three collections so the people picker had a column shape. The dispatch becomes `CommandBar`'s own `onClick` per command, and `RenameColumns(FirstN(Users, 0), …)` — a zero-row query whose only purpose was to name columns — is deleted outright, along with `colProjectsPrincipals` and `colProjectsPrincipalsPreSelected`. What is left is the gate, and it returns a reason string per command rather than a bare boolean, so a disabled button can say why. Rule 7's whole-bar disable is expressed as an early return: nothing below it can re-enable a command.
**Pinned by** — UT-TEAM-009, UT-TEAM-009b, UT-TEAM-010, UT-TEAM-011, UT-TEAM-011b, UT-TEAM-012, UT-TEAM-013

##### pcf_btn_Team_RightPanel_Member_Form_Buttons_Save.OnChange — 66 lines → `buildMemberPayload()`

The one write this screen makes: upsert a `Project Members` row from the panel draft.

```powerfx
UpdateContext(
    {
        locTeamDataIsSavingDialogVisible: true,
        locTeamlDataSavingDialogText: If(
            IsBlank(locSelectedMember),
            $"The member '{First(pcf_Team_RightPanel_Member_Form_Principal.SelectedPeople).PersonaName}' will be added, please wait...",
            $"Project member information will be updated, please wait..."
        )
    }
);
IfError(
    With(
        {
            varCandidateMember: LookUp(
                'Microsoft Entra IDs',
                Or(
                    IsBlank(First(pcf_Team_RightPanel_Member_Form_Principal.SelectedPeople)),
                    ThisRecord.'A unique identifer for Microsoft Entra ID' = GUID(First(pcf_Team_RightPanel_Member_Form_Principal.SelectedPeople).PersonaKey)
                )
            )
        },
        With(
            {
                varUpdatedMember: Patch(
                    'Project Members',
                    If(
                        IsBlank(locSelectedMember),
                        Defaults('Project Members'),
                        locSelectedMember
                    ),
                    {
                        Name: $"MBR-{varCandidateMember.Mail}",
                        Project: gblRecordSelectedProject,
                        // Position: drp_Team_RightPanel_Member_Form_Position.Selected.Value,
                        'Project Member Description': drp_Team_RightPanel_Member_Form_Position_TableBackedChoices.Selected,
// … [31 of the block's 66 lines omitted]
```

```typescript
export function buildMemberPayload(
  draft: MemberDraft,
  project: TeamProject,
): Record<string, unknown> {
  if (!draft.person?.rowId) {
    // SOURCE DEFECT closed here, not only in the UI. The canvas wrote
    //   LookUp('Microsoft Entra IDs', Or(IsBlank(First(picker.SelectedPeople)), <id match>))
    // which returns the FIRST Entra row when the picker is empty — an arbitrary person
    // silently added to the project team. The save button's DisplayMode was the only
    // guard, and it lives in the UI.
    throw new Error("A team member must be selected before saving.");
  }
  return {
    vsb_name: `MBR-${draft.person.mail ?? ""}`,
    vsb_comment: normaliseComment(draft.comment),
    ...bind("vsb_Project", ES.projects, project.id),
    ...bind("vsb_Member", ES.microsoftEntraIds, draft.person.rowId),
    ...bind("vsb_ProjectMemberDescription", ES.projectMemberDescriptions, draft.descriptionId),
    "owningbusinessunit@odata.bind": project.owningBusinessUnitId
      ? `/businessunits(${project.owningBusinessUnitId})` : null,
  };
}
```

**Shape change** — the in-formula `LookUp('Microsoft Entra IDs', …)` becomes an `@odata.bind` on the row id the picker already returned, so the save reads no reference table; `Patch(t, If(IsBlank(sel), Defaults(t), sel))` splits into a pure payload builder plus a create-or-update decision in `hooks.ts`; and `Trim(txt_….Value)` becomes `normaliseComment()`, which also caps at the field's real `MaxLength` of 100 rather than the 256 the canvas counter displayed. The commented-out `Position` line is honoured exactly: new rows carry only the `Project Member Description` lookup, and legacy rows fall back through `memberDescription()`. The `IfError(..., UpdateContext({locTeamlDataSavingDialogText: "Error: …"}))` pattern — which wrote its message into the loading overlay and then immediately blanked it, so nobody ever saw it — becomes a real `AppError` surfaced as a toast.
**Pinned by** — UT-TEAM-020, UT-TEAM-021, UT-TEAM-022, UT-TEAM-023, UT-TEAM-024

##### Project General Team Screen.OnVisible — 88 lines → `managerRows()` and `teamTableRows()`

Builds the manager rows in memory from the project record and merges them with the queried members into one table.

```powerfx
Set(
    gblRecordSelectedProject,
    LookUp(
        Projects,
        ThisRecord.Project = gblRecordSelectedProject.Project
    )
);
Set(
                gblCurrentUser,
                Patch(
                    gblCurrentUser,
                    {
                        CanEditSelectedProject: And(
                            DataSourceInfo(
                                Projects,
                                DataSourceInfo.CreatePermission
                            ),
                            Coalesce(
                                RecordInfo(
                                    gblRecordSelectedProject,
                                    RecordInfo.EditPermission
                                ),
                                false
                            )
                        )
                    }
                )
            );
Set(
    gblSelectedCluster,
    gblRecordSelectedProject.'Cluster State'
);
// … [56 of the block's 88 lines omitted]
```

```typescript
export function managerRows(project: TeamProject | null): ManagerRow[] {
  if (!project) return [];
  const out: ManagerRow[] = [];
  if (project.projectManager) {
    out.push({ position: "Project Manager", member: project.projectManager, order: 1 });
  }
  if (project.deputyProjectManager) {
    out.push({
      position: "Deputy Project Manager", member: project.deputyProjectManager, order: 2,
    });
  }
  return out.sort((a, b) => a.order - b.order);
}

export function teamTableRows(
  managers: ManagerRow[],
  members: ProjectMemberRow[],
): TeamTableRow[] {
  const managerRowsOut: TeamTableRow[] = managers.map((m) => ({
    key: `manager-${m.order}`,
    description: m.position,
    displayName: m.member.displayName,
    comment: "",
    selectable: false,
    memberId: null,
  }));
// … [8 lines omitted]
  return [...managerRowsOut, ...memberRowsOut];
}
```

**Shape change** — the `Set(gblRecordSelectedProject, LookUp(...))` and `Set(gblCurrentUser, Patch(..., {CanEditSelectedProject: ...}))` pair is the shared idiom now living in `useProjectContext()`; `gblSelectedCluster` is read off the project rather than mirrored into a global. `ClearCollect(colProjectMembers, {position: Positions.'Project Manager', member: …, order: 1})` followed by a conditional `Collect` for the deputy becomes `managerRows()`, a pure derivation from the project record with no collection at all. The two galleries the canvas rendered separately merge into one `DataGrid` through `teamTableRows()`, per the recording: manager rows carry `selectable: false` and no `memberId`, so the Edit and Delete commands can only ever act on a real `Project Members` row. The `SVGImages` selection-dot data source, which existed only to render a radio as an encoded SVG URL per row, is deleted in favour of the grid's own single-select.
**Pinned by** — UT-TEAM-001, UT-TEAM-002, UT-TEAM-003, UT-TEAM-004, UT-TEAM-005, UT-TEAM-006, UT-TEAM-006b, UT-TEAM-006c, UT-TEAM-006d, UT-TEAM-006e

##### cmp_PopUp_Member_Delete_Confirmation.OnConfirm — 14 lines → `useDeleteMember()`

Removes the selected member behind a confirmation dialog and leaves the selection alone if it fails.

```powerfx
IfError(
    Remove(
        'Project Members',
        locSelectedMember
    );
    Refresh('Project Members'),
    UpdateContext({locDeleteMemberlDialogText: $"Error: Project member could not be deleted. Internal error: originated on {FirstError.Source}. Message: {FirstError.Message} {FirstError.Details.HttpResponse}"})
);
UpdateContext(
    {
        locSelectedMember: Blank(),
        locIsVisiblePopUpDeleteMember: false
    }
);
```

```typescript
/** Rule 17 — delete behind the confirmation dialog. */
export function useDeleteMember(projectId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (memberId: string) => projectMemberFullRepo.remove(memberId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.child("projectMembers", projectId ?? "none") });
    },
  });
}
```

**Shape change** — `Refresh('Project Members')` becomes a query-key invalidation, so the refresh is scoped to this project's member list rather than the whole table. The important behavioural difference is in the failure path: the canvas cleared `locSelectedMember` unconditionally after the `IfError`, so a failed delete both showed an error and lost the selection the user would have retried from. Here the clear runs only in `onSuccess`, and the `FirstError.Details.HttpResponse` string interpolation becomes a structured `AppError` (UT-TEAM-027).
**Pinned by** — UT-TEAM-026, UT-TEAM-027, UT-TEAM-028

#### Security conditions

| Condition | Canvas today | Where it must be enforced |
|---|---|---|
| Whole command bar disabled while the project is Draft | Rule 7 gates the bar on `gblSelectedCluster.Name = "Draft"` in the control's `DisplayMode` | `commandState()`'s early return, so the gate is testable and no later clause can re-enable a command. Server-side there is nothing stopping a `POST` to `vsb_projectmembers` for a Draft project; a plugin would be needed. |
| Whole command bar disabled while prerequisites are missing | `con_Milestones_Page_LockMessage_4.Visible` — a banner sized and shown by two disagreeing formulas | `isPageLocked()` / `pageLock()` feed both the banner and `commandState()`, so the list and the condition cannot diverge. |
| Add Member needs create plus record-edit permission | Rule 8: `And(DataSourceInfo('Project Members', CreatePermission), RecordInfo(project, EditPermission))` in `DisplayMode` | `commandState()` reads `perms.canCreate` and `perms.canEditProject`, both server-derived by `useProjectContext()`. Create privilege on `vsb_projectmembers` is the authority. |
| Edit and Delete need record-level permission on the **member row**, not the project | Rule 9: `RecordInfo(locSelectedMember, RecordInfo.EditPermission)` — a per-row check the canvas does make, and does only in the UI | `perms.canEditMember` is a record-level probe on the selected member row. This is the one permission signal on this screen that is genuinely row-scoped, so it must not be collapsed into the project's `canEdit`. |
| A team member must actually be selected before saving | **No check.** `LookUp('Microsoft Entra IDs', Or(IsBlank(First(picker.SelectedPeople)), <id match>))` matches the first Entra row when the picker is empty, so an empty picker silently adds an arbitrary person to the project team; the save button's `DisplayMode` was the only guard | `buildMemberPayload()` throws before constructing a payload, so the mutation layer refuses it, not just the UI (UT-TEAM-024). A required-field or plugin check on `vsb_member` would close it server-side. |
| Manager and Deputy rows are read-only here | Rule 2: the top gallery is built in memory from the project record and has no edit affordance | `managerRows()` returns rows marked `selectable: false` with `memberId: null`, so Edit and Delete cannot address them. The columns themselves are written on General Data, where their own permission rules apply. |
| Comment length | The input's `MaxLength` is 100 while the counter renders `{len}/256` | `normaliseComment()` trims and slices at `COMMENT_MAX_LENGTH` (100); `CANVAS_COUNTER_MAX_LENGTH` (256) exists only to document the mismatch. Dataverse's own column length is the real limit. |

#### Deliberate divergences

- **The page-lock prerequisite for Milestones.** Canvas: the banner's *height* formula tests `IsBlank('Project Start Date')` while its *visibility* formula and the line's own `Visible` test `IsBlank('End Date')`. The two disagree, so a project with an End Date but no Project Start Date is sized for a line it does not show, and the reverse shows a line it did not size for. Rebuild: `pageLock()` resolves to `End Date` — that is what the visibility rule and the line itself use, and it is the semantically right test, since Project Start Date is legitimately blank for any project whose start cluster is 1 or later and testing it would lock this screen permanently for every acquired project. The canvas height behaviour is kept **reachable but only for testing**, as the `pageLockCanvasHeightParity()` twin, so the divergence is asserted rather than described (UT-TEAM-008c). Marked `SOURCE DEFECT` in `rules.ts`.
- **Project Member assignment from an empty picker.** Canvas: an empty people picker resolves to the first `Microsoft Entra IDs` row. Rebuild: `buildMemberPayload()` throws. This is the same defect as General Data's rule 31; both are closed in the mutation layer, and `rules.ts` cross-references the pair.
- **The leave-confirmation dialog.** Canvas: `cmp_PopUp_Team_Leave_Confirmation` is wired to `locLeaveGeneralDataConfirmationDialog`, which nothing on this screen ever sets, so the dialog is unreachable. Rebuild: deleted rather than re-plumbed — the panel has no unsaved-changes semantics worth guarding, and reviving it would invent behaviour the canvas never had.
- **The saving-overlay message.** Canvas: the success and error text was written into `locTeamlDataSavingDialogText` and then immediately blanked, so the final message was never visible. Rebuild: a real toast plus a `LoadingOverlay`.
- **Carried forward from the recording pass, unresolved:** manager rows still render a radio control, because `DataGrid`'s `selectionMode="single"` cannot hide the control per row. That is a shared-component change, noted in `GUIDE-PARITY.md`, not a Team-screen fix.

#### Build steps

1. Write `TeamProject`, `TeamPerson`, `ProjectMemberRow` and `POSITIONS`, and `toTeamProject()` in `hooks.ts` mapping the project row and its two formatted-value manager lookups.
2. Write `managerRows()`, `memberDescription()`, `sortMembers()` and `teamTableRows()` with the verbatim `TEAM_COLUMN_HEADERS`, then tests UT-TEAM-001 … 006e.
3. Write `pageLock()`, `isPageLocked()` and the `pageLockCanvasHeightParity()` twin, then tests UT-TEAM-007, UT-TEAM-008, UT-TEAM-008b, UT-TEAM-008c — the parity test is what keeps the divergence honest, so write it before the screen renders anything.
4. Write `commandState()` with `TEAM_COMMAND_LABELS` and the reason strings, then tests UT-TEAM-009 … 013 and `toggleSelection()` with UT-TEAM-014.
5. Write `MemberDraft`, `normaliseComment()`, `canSaveMember()`, `memberPanelErrors()`, `draftFromMember()`, `buildMemberPayload()`, `DELETE_DIALOG_TITLE` and `deleteDialogDescription()`, then tests UT-TEAM-015 … 024, UT-TEAM-028.
6. Build `hooks.ts`: `useTeamProject`, `useProjectMembers`, `useMemberDescriptions` (ordered by `vsb_order`), `useTeamPermissions` with the record-level member probe, `useSaveMember` and `useDeleteMember`.
7. Compose `Screen.tsx`: `PageHeader`, the lock banner, `CommandBar`, the single merged `DataGrid`, the member `FormPanel` with the shared people search and the 100-character counter, and the delete `ConfirmDialog`.
8. Run `npx tsc --noEmit` filtered to `features/team` and `npx vitest run src/features/team`.

#### Exit gate

`npx vitest run src/features/team` passes all 36 cases and `npx tsc --noEmit` reports nothing under `features/team`. Two writes must be provably impossible: `buildMemberPayload()` with `draft.person === null` throws before producing a payload, so no request is issued (UT-TEAM-024), and `commandState()` returns `enabled: false` for all three commands whenever the project is Draft or `pageLock()` is non-empty (UT-TEAM-009, UT-TEAM-009b). UT-TEAM-008c must show `pageLock()` and `pageLockCanvasHeightParity()` producing different lists for a project with an End Date and no Project Start Date — if they agree, the divergence has been silently lost.

---
### 12. Project General CheckList Screen — `src/features/checklist/`

| | |
|---|---|
| Canvas unit | `PM::Project General CheckList Screen` (PM app) |
| Power Fx | `115` blocks ≥3 lines · `66` ≥10 · `32` ≥30 · `3707` lines in those blocks (`5606` across all `=` properties) |
| Complexity | band `M` · score `39.2` · `14` build-days |
| Code app | `Screen.tsx` 1058 ln · `hooks.ts` 818 ln · `rules.test.ts` 1323 ln · `rules.ts` 1918 ln |
| Pure rules exported | `121` |
| Unit tests | `85` cases · IDs `UT-CHKLST-001…044` |
| Dataverse tables | Check List Default Approvals, Project Checklist Tracking Note, Project Checklists, Project Default Approvals, Project Default Checklists, Project State Tracking Notes, Project State Trackings, Project States, Projects |

#### What it does

The gate governance screen: a cluster stepper across Draft and Clusters 1 to 6, a per-cluster checklist table with a Gate Relevance column and per-row approval actions, and a right panel that serves two entity types — a single `Project Checklists` row for a Checklist Completion or a single `Project State Trackings` row for a Cluster Transition — plus a read-only Cluster Movement history dialog. It is the screen that moves a project out of Draft and through the cluster chain, so it requests and cancels approvals through four Power Automate calls, self-heals missing tracking and checklist rows on load, and back-fills the clusters an acquired project skips. It ranks seventh of the twenty-three on composite complexity but **first on data complexity**: nine write targets and four flow calls, more than any other screen in either app. Nothing else in the rebuild has this much state to keep consistent across this many tables with this little transactional support underneath it.

#### Depends on

- **The whole PM prerequisite chain must be real first.** `pageLock()` gates on `Project ID` (General Data), the milestone the project's start cluster requires (Milestones), `Total Capacity` (Generator) and `Net Yield p50` (Production). Unlike the other locked screens it has **no** Draft clause — deliberately, this is the screen that leaves Draft.
- `src/features/general-data/rules.ts` — `PROJECT_COL`. General Data also carries a partial twin of this screen's back-fill (`plannedTrackingRows`, `shouldCancelGateApproval`, the shared `AUTO_SKIPPED_COMMENT`), so the two must agree on the target state per cluster or a save on one screen will undo the other.
- `src/data/entities.ts` — `ES`, `ES_PROCESS`, `CHOICE`, `CHOICE_PROCESS`, `TEXT_MAX_LENGTH`. This screen is the only consumer of the `ES_PROCESS` / `CHOICE_PROCESS` split, so that split has to exist before it starts.
- `src/data/repos.ts` — `projectFullRepo`, `projectStateRepo`, `projectStateTrackingFullRepo`, `projectChecklistFullRepo`, `projectDefaultChecklistRepo`, `projectDefaultApprovalsFullRepo`, `checkListDefaultApprovalRepo`, `projectStateTrackingNoteRepo`, `projectChecklistTrackingNoteRepo`, `checklistCountryAndTechnologyRepo`, `countryRepo`.
- `src/domain/approval.ts` — `approvalLabel()`, `approvalDecoration()`, `rowAccentColor()`; `src/domain/numeric.ts` — `isBlank`.
- `src/platform/dataClient.ts` — `batch()` and `callAction()`; `src/platform/odata.ts` — `f`, `asc`, `desc`; `src/platform/errors.ts` — `AppError`, `toAppError`, `Result`.
- **`src/flows/flowClient.ts` — four wrappers, and nothing more.** Standing decision: no flow is changed. The app holds typed wrappers only.
  - `performCheckListApproval()` → `PerformCommonRequestofCheckListApproval`, disposition `keep`, 126 actions. Present in the export. It suspends on `WaitForAnApproval` / `PostCardAndWaitForResponse`, so no browser code can hold it.
  - `performGateApproval()` → `PerformCommonRequestofGateApproval`, disposition `keep`, 112 actions. Present in the export. Its `Do-until` over `vsb_countries.vsb_lastprojectid` is a lost-update race; that allocation is the candidate for extraction into a custom API, not a flow edit.
  - `cancelCheckListApproval()` → invokes the action name `vsb_CancelCheckListApproval`, the intended custom-API replacement for `PerformRequestofCheckListApprovalCancellation` (disposition `customApi`, 9 actions, present in the export).
  - `cancelGateApproval()` → invokes `vsb_CancelGateApproval`, the intended replacement for `PerformRequestofGateApprovalCancellation` (disposition `customApi`, 12 actions, present in the export). The flow declares a 13-field JSON blob plus an `AppId` that no action in its definition references; the wrapper sends the state-tracking id alone.
  - **What is missing from the export is not on this screen.** `FLOW_REGISTER`'s three `missing` entries — `SynchronizeStandardAssumptionCosts`, `ForCountriestriggerFabricrecalculationsforProjects`, `SynchroniseRecalculationCapexStandardCost` — belong to Admin Cost, Admin Contract, Admin Milestones and Production, and those are the wrappers whose `invokeFlow` throws the "called by the app but not present in the solution export" `AppError`. This screen's four wrappers do not throw that error. The two cancellation wrappers instead carry a different and quieter risk: `vsb_CancelGateApproval` and `vsb_CancelCheckListApproval` are **not registered in `FLOW_REGISTER` at all**, so `invokeFlow` finds no descriptor, skips the missing-flow guard, and falls straight through to `dataClient.callAction`. Until those two custom actions are actually deployed, a cancellation returns `{ok: true, mock: true}` in mock mode and fails with a raw Dataverse error in a live environment — with no diagnostic naming the absent action. **Register both names in `FLOW_REGISTER` before this screen ships**, so an undeployed cancellation fails with a sentence a support engineer can read.
- Dataverse privileges: Create + Write on `vsb_projectstatetrackings`, `vsb_projectchecklists`, `vsb_projectstatetrackingnotes` and the checklist note table; Write on `vsb_projects`; Read on Project States, Project Default Checklists, Project Default Approvals and Check List Default Approvals; and Execute on the two cancellation custom actions.

#### Power Fx → TypeScript

##### pcf_CheckList_RightPanel_ChangeCluster_Form_Buttons_Save.OnChange — 176 lines → `planClusterTransition()`

Moves the project from one cluster to the next: complete the current tracking row, start the next one, write the audit note, and mark the project Approved.

```powerfx
UpdateContext(
    {
        locIsVisibleGDPerformRequestofGateApprovalDialog: true,
        locGDPerformRequestofGateApprovalDialogText: $"Cluster data '{locRecordSelectedProjectState.Name}' will be save, please wait..."
    }
);
IfError(
    With(
        {
            recCurrentProjectStateTracking: Patch(
                'Project State Trackings',
                If(
                    IsBlank(
                        LookUp(
                            'Project State Trackings',
                            'Project State Tracking' = locRecordSelectedProjectStateTracking.vsb_projectstatetrackingid
                        )
                    ),
                    Defaults('Project State Trackings'),
                    LookUp(
                        'Project State Trackings',
                        'Project State Tracking' = locRecordSelectedProjectStateTracking.vsb_projectstatetrackingid
                    )
                ),
                {
                    Project: gblRecordSelectedProject,
                    'Cluster State': LookUp(
                        'Project States',
                        'Project State' = locRecordSelectedProjectState.'Project State'
                    ),
                    'Approval Comment': txt_GeneralData_RightPanel_ProjectState_InpForm_Comment_1.Value,
                    'Approval Due Date': If(
// … [144 of the block's 176 lines omitted]
```

```typescript
export function planClusterTransition(args: {
  project: ChecklistProject;
  state: SequenceEntry;
  tracking: TrackingRow | null;
  next: SequenceEntry | null;
  nextTracking: TrackingRow | null;
  comment: string;
  approvalDueDate: string | null;
  /** The rendered history HTML the canvas stored on the note. */
  noteHtml?: string | null;
  canEdit: boolean;
}): WritePlan {
  const plan = emptyPlan();
  const guard = requireEditPermission(args.canEdit, plan);
  if (guard) return guard;

  const bu = args.project.owningBusinessUnitId;
  const dueDate = args.approvalDueDate;
// … [78 lines omitted]
  /* 4 — the direct-movement project patch. */
  if (args.next) {
    plan.writes.push({
      op: "update", entitySet: ES.projects, id: args.project.id,
      data: {
        [`${LOOKUP.projectClusterState}@odata.bind`]: `/${ES.projectStates}(${args.next.id})`,
        [PROJECT_COLUMN.approvalStates]: CHOICE.approvalState.approved,
      },
      reason: `Project moves to ${args.next.name} and is marked Approved`,
    });
    plan.log.push(`The project is now in ${args.next.name}.`);
  }

  return plan;
}
```

**Shape change** — the canvas issued four sequential `Patch` calls, any of which could fail with the earlier ones already applied, leaving a project whose tracking says Completed and whose `Cluster State` still points at the old cluster. Here the function **returns** the writes rather than performing them: one `WritePlan` with a `reason` on every write and a `log` line per step, handed to a single `runPlan()`. `Patch(t, If(IsBlank(LookUp(t, …)), Defaults(t), LookUp(t, …)))` — the upsert idiom, with the lookup evaluated twice — becomes a nullable `tracking` argument and a create-or-update branch. The permission guard is the first statement, so a refused plan is an empty plan with a `Refused:` log line and the caller cannot issue a partial batch by accident.
**Pinned by** — UT-CHKLST-035, UT-CHKLST-036

##### btn_CheckList_EnsureSkippedClusterStatesCompleted.OnSelect — 152 lines → `hasRealGateProgress()` and `planSkippedClusterBackfill()`

Decides whether an acquired project's skipped clusters may be auto-completed, and produces the writes that do it — idempotently.

```powerfx
With(
    {
        varAutoSkippedComment: "Automatically completed because this project starts at a later cluster."
    },
    With(
        {
            varProjectIsStillDraft: Coalesce(
                gblRecordSelectedProject.'Cluster State'.Name,
                "Draft"
            ) = "Draft",

            varRealGateProgressAlreadyExists: CountRows(
                Filter(
                    AddColumns(
                        Filter(
                            'Project State Trackings' As TrackingRow,
                            TrackingRow.Project.Project = gblRecordSelectedProject.Project
                        ) As TrackingRow,
                        ClusterNo,
                        Switch(
                            TrackingRow.'Cluster State'.Name,
                            "Draft", 0,
                            "Cluster 1", 1,
                            "Cluster 2", 2,
                            "Cluster 3", 3,
                            "Cluster 4", 4,
                            "Cluster 5", 5,
                            "Cluster 6", 6,
                            999
                        )
                    ) As ExistingRow,

                    Not(IsBlank(ExistingRow.FlowRunId)) ||
// … [121 of the block's 152 lines omitted]
```

```typescript
export function hasRealGateProgress(
  trackings: TrackingRow[],
  startCluster: number,
): boolean {
  return trackings.some((row) => {
    if (!isBlank(row.flowRunId) || !isBlank(row.flowApprovalId)) return true;

    const no = clusterNo(row.clusterStateName);
    const state = row.approvalClusterState ?? ACS.notStarted;

    if (no === 0) {
      return DRAFT_PROGRESS_STATES.includes(state) || !isBlank(row.approvalComment);
    }
    if (no > 0) {
      if (state === ACS.notStarted) return false;
      const autoSkipped = no < startCluster && state === ACS.completed;
      return !autoSkipped;
    }
    return false;
  });
}
```

**Shape change** — a hidden `ModernButton` that other controls fired with `Select()` becomes a named pure predicate plus a named plan builder. The `AddColumns(Filter(...), ClusterNo, Switch(...))` projection becomes `clusterNo(name)` over already-queried typed rows, and the `CountRows(Filter(...)) > 0` becomes `.some()`. The clause that matters most is the last one: an auto-skipped `Completed` row below the start cluster is **excluded** from what counts as real progress, because that is this very back-fill's own output — without the exclusion the second run would see its own writes as progress and refuse. A row already at its target state and comment produces no write at all, so the whole plan is empty on a second run.
**Pinned by** — UT-CHKLST-004, UT-CHKLST-005, UT-CHKLST-006, UT-CHKLST-007, UT-CHKLST-008, UT-CHKLST-009, UT-CHKLST-010, UT-CHKLST-042

##### pcf_CheckList_RightPanel_ChangeCluster_Form_Buttons_RequestApproval.OnChange — 246 lines → `checklistApprovalArgs()` and `flowWriteBackPatch()`

Builds the approval-flow payload for whichever entity type the panel is serving, and writes the returned run and approval ids back — but only if a run actually started.

```powerfx
UpdateContext(
    {
        locIsVisibleGDPerformRequestofGateApprovalDialog: true,
        locGDPerformRequestofGateApprovalDialogText: $"Please wait..."
    }
);
Switch(
    locRequestApprovalEntityType,
    "Checklist Completion",
    IfError(
        With(
            {
                recCurrentCheckList: Patch(
                    'Project Checklists',
                    locSelectedCheckListEntity,
                    {
                        'Approval Comment': txt_GeneralData_RightPanel_ProjectState_InpForm_Comment_1.Value,
                        'Approval Due Date': If(
                            dtp_CheckList_RightPanel_ChangeCluster_Form_Inputs_ApprovalDueDate.Visible,
                            dtp_CheckList_RightPanel_ChangeCluster_Form_Inputs_ApprovalDueDate.SelectedDate,
                            Blank()
                        ),
                        'Approval Checklist State': 'Approval Cluster States'.'In Progress'
                    }
                )
            },
            Trace(
                $"GateApproval 001: Start flow :=> {recCurrentCheckList.'Project Checklist'}",
                TraceSeverity.Information
            );
            UpdateContext({locGDPerformRequestofGateApprovalDialogText: $"Please wait..."});
            With(
// … [214 of the block's 246 lines omitted]
```

```typescript
export function checklistApprovalArgs(args: {
  projectId: string;
  checklistId: string;
  checkListDefaultApprovalId: string;
  currentProjectStateId: string;
}): { positional: string[]; request: { projectId: string; checklistId: string; approverIds: string[] } } {
  return {
    positional: [
      args.projectId,
      args.checklistId,
      args.checkListDefaultApprovalId,
      args.currentProjectStateId,
    ],
    request: {
      projectId: args.projectId,
      checklistId: args.checklistId,
      // The flow resolves the personas itself from the Check List Default Approval row;
      // the id is what it needs, not a materialised approver list.
      approverIds: [args.checkListDefaultApprovalId],
    },
  };
}

export function flowWriteBackPatch(
  result: FlowResult | null | undefined,
  target: "checklist" | "tracking",
): Record<string, unknown> | null {
  const runId = result?.runid ?? null;
  if (isBlank(runId)) return null;
  const approvalId = result?.approvalid ?? result?.approvalId ?? null;
  const cols = target === "checklist" ? CHECKLIST_COL : TRACKING_COL;
  return {
    [cols.flowRunId]: runId,
    [cols.flowApprovalId]: isBlank(approvalId) ? null : approvalId,
  };
}
```

**Shape change** — the `Switch(locRequestApprovalEntityType, "Checklist Completion", …, "Cluster Transition", …)` becomes two typed argument builders (`checklistApprovalArgs`, `gateApprovalArgs`), each returning both a `positional` array in the flow's own `text_1`/`text_2`/`text_4`/`text` order and the typed `request` the wrapper takes — the positional array exists so a deployment wired against the raw flow cannot get the argument order wrong. The `If(Not(IsBlank(gblFlow….runid)), Patch(…))` gate becomes `flowWriteBackPatch()`, which returns `null` rather than a payload when no run id came back; that null is load-bearing, because recording an approval id without a run id would stop `showRequestApproval()`'s stalled-recovery clause from ever firing again and strand the cluster with no way to retry.
**Pinned by** — UT-CHKLST-030, UT-CHKLST-031, UT-CHKLST-032

##### pcf_CheckList_RightPanel_ChangeCluster_Form_Buttons_CancelApproval.OnChange — 109 lines → `planGateCancel()` and `useCancelGateApproval()`

Cancels a running gate approval: call the cancellation API, then reset the tracking row and record why.

```powerfx
UpdateContext(
    {
        locIsVisibleGDPerformRequestofGateApprovalDialog: true,
        locGDPerformRequestofGateApprovalDialogText: $"Cancel Request Approval for '{locRecordSelectedProjectState.Name}' has been sent, please wait..."
    }
);
IfError(
    With(
        {
            varCurrentClusterState: Patch(
                'Project State Trackings',
                If(
                    IsBlank(locRecordSelectedProjectStateTracking),
                    Defaults('Project State Trackings'),
                    LookUp(
                        'Project State Trackings',
                        'Project State Tracking' = locRecordSelectedProjectStateTracking.vsb_projectstatetrackingid
                    )
                ),
                {
                    Project: gblRecordSelectedProject,
                    'Approval Cluster State': 'Approval Cluster States'.'In Progress',
                    'Cluster Step State': Blank(),
                    FlowRunId: Blank(),
                    'Owning Business Unit': gblRecordSelectedProject.'Besitzer (Unternehmenseinheit)'
                }
            )
        },
        Trace(
            $"GateCancelApproval 001: Start cancelation flow :=> {varCurrentClusterState.'Project State Tracking'}",
            TraceSeverity.Information
        );
        UpdateContext({locGDPerformRequestofGateApprovalDialogText: $"Cancel Cluster Approval ..."});
// … [76 of the block's 109 lines omitted]
```

```typescript
export function useCancelGateApproval() {
  const invalidate = useProjectInvalidation();
  return useMutation({
    mutationFn: async (args: {
      project: ChecklistProject; tracking: TrackingRow; comment: string; canEdit: boolean;
    }) => {
      if (!args.canEdit) {
        throw toAppError(
          { status: 403, message: "You do not have permission to edit this project." },
          "checklist/cancelGateApproval",
        );
      }
      await cancelGateApproval(gateCancelArgs(args.tracking.id));
      const plan = planGateCancel(args);
      const res = await runPlan(plan, "checklist/cancelGateApproval");
      if (!res.ok) throw res.error;
      return { projectId: args.project.id };
    },
    onSuccess: (out) => invalidate(out.projectId),
  });
}
```

**Shape change** — the 13-field JSON blob the canvas assembled for `PerformRequestofGateApprovalCancellation`, and the `AppId` no action in that flow references, are gone: `gateCancelArgs(trackingId)` sends the state-tracking id alone. `planGateCancel()` returns the two writes the app makes alongside the call (reset the tracking row to In Progress with a blank `Cluster Step State` and `FlowRunId`, and append a `Request canceled - …` note), so they go out as one `runPlan` rather than a `Patch` then a `Collect`.

**This is the screen's sharpest remaining risk, and it is structural.** A cancellation is *two* operations, not one transaction: `cancelGateApproval()` runs first and the local writes follow. If the API succeeds and `runPlan` then fails — a network drop, a privilege gap on the note table, a validation error — the approval is cancelled server-side while the tracking row still reads its pre-cancel state with a live `FlowRunId`, and the user sees an error suggesting nothing happened. Nor does the batch itself save this: `dataClient.batch()` is a bounded fan-out over `create`/`update`/`remove`, not an OData `$batch` changeset, so even the two writes inside the plan can half-apply. Recovery is manual today. The reconciliation belongs inside the custom API — which is a *new* API, not an edit to the existing flow: `vsb_CancelGateApproval` should perform the tracking reset and the note write itself, and the app should then hold no local writes for this action at all.
**Pinned by** — UT-CHKLST-033, UT-CHKLST-034

##### btn_CheckList_BuildProjectStatesSequence.OnSelect — 161 lines → `buildOperationalSequence()` and `buildDisplaySequence()`

Two different cluster sequences from one state table: the one the transitions walk, and the one the stepper draws.

```powerfx
ClearCollect(
    colChecklistAllProjectStates,
    ForAll(
        Sort(
            Filter(
                'Project States',
                ThisRecord.'Is Visible On Checklist' = true
            ),
            Order,
            SortOrder.Ascending
        ) As Source,
        With(
            {
                varClusterNo: Switch(
                    Source.Name,
                    "Draft", 0,
                    "Cluster 1", 1,
                    "Cluster 2", 2,
                    "Cluster 3", 3,
                    "Cluster 4", 4,
                    "Cluster 5", 5,
                    "Cluster 6", 6,
                    999
                )
            },
            With(
                {
                    varGateSourceNo: If(
                        Source.Name = "Draft" && locProjectStartClusterNo > 0,
                        If(
                            locProjectStartClusterNo = 1,
                            0,
                            locProjectStartClusterNo - 1
                        ),
// … [127 of the block's 161 lines omitted]
```

```typescript
export function buildOperationalSequence(
  states: ProjectStateRef[],
  startCluster: number,
  gates: GateSetting[] = [],
): SequenceEntry[] {
  return checklistStates(states)
    .filter((s) => {
      const no = clusterNo(s.name);
      return no === 0 || (no >= startCluster && no <= 6);
    })
    .map((s, index) => toSequenceEntry(s, index, gates));
}

/**
 * Rule 6 — the DISPLAY sequence. Every state is kept; the ones below the start cluster
 * are flagged `IsSkippedDisplayOnly` so the stepper can render them muted.
 */
export function buildDisplaySequence(
  states: ProjectStateRef[],
  startCluster: number,
  gates: GateSetting[] = [],
): SequenceEntry[] {
  return checklistStates(states).map((s, index) => {
    const entry = toSequenceEntry(s, index, gates);
    const no = clusterNo(s.name);
    return { ...entry, isSkippedDisplayOnly: no > 0 && no < startCluster };
  });
}
```

**Shape change** — the canvas index idiom `ForAll(Sequence(CountRows(t)), Patch(Last(FirstN(t, Value)), {RowNumber: Value}))`, used three times on this screen, disappears entirely: `RowNumber` is the array index and previous/next are `seq[i-1]` and `seq[i+1]` (UT-CHKLST-013). One `ClearCollect` into six overlapping collections becomes two named pure builders over a single `useQuery` of `Project States`, and the distinction the canvas blurred — which clusters can be transitioned versus which are merely drawn — becomes two functions with two names, so the stepper can show a skipped cluster muted without the transition logic ever seeing it.
**Pinned by** — UT-CHKLST-011, UT-CHKLST-012, UT-CHKLST-013, UT-CHKLST-014, UT-CHKLST-015

#### Security conditions

| Condition | Canvas today | Where it must be enforced |
|---|---|---|
| Any write on this screen requires edit permission on the project | **No check that reaches a write.** `OnVisible` computes `gblCurrentUser.CanEditSelectedProject` and **no control on the screen reads it** — the write buttons gate on approval state alone | `requireEditPermission()` is the first statement of every plan builder (`planClusterTransition`, `planSkippedClusterBackfill`, `planEnsureTracking`, `planChecklistMaterialisation`, `planTerminalStateChange`, `planGateCancel`, `planReturnToPreviousCluster`), and every mutation re-checks `canEdit` before calling a flow. A refused plan is empty with a `Refused:` log line, detectable through `planWasRefused()`. The server-side authority remains Write privilege on `vsb_projectstatetrackings` and `vsb_projectchecklists` plus record-level sharing on the project. |
| Page lock before the four prerequisites are complete | `pageLock` banner; the bullet list is a shared component and can render a set that does not match the condition | `pageLock()` builds the bullet list **from** the condition, including the per-start-cluster milestone names from `missingStartClusterMilestones()`, so list and condition cannot disagree. |
| No Draft clause in this screen's page lock | Deliberate: Planning, Grid Operator and Team all lock on Draft; this screen does not, because it is the screen that leaves Draft | Kept omitted, and recorded as ambiguity 2 in the `rules.ts` header so nobody "fixes" it into a deadlock. |
| Requesting an approval | Comment required (`commentMissing`), cluster not Completed, and the gate's visibility clauses. All `DisplayMode` and `Visible` formulas | `canRequestApproval()` / `showRequestApproval()` for the UI, plus the `canEdit` throw in `useRequestChecklistApproval` and `useRequestGateApproval`. The approval flows run under their own connection identity — the app cannot constrain who they ask, and must not try to. |
| Cancelling an approval | **No permission check at all** before the cancellation flow is invoked | `useCancelGateApproval` and `useCancelChecklistApproval` both throw a 403 `AppError` before the call. The real check has to live in the custom API, because the wrapper runs with whatever identity the app has. |
| A cancellation that the API reports as failed | `PerformRequestofCheckListApprovalCancellation` answers `{success: boolean}`; the canvas read `.success` and **did nothing** with a `false`, so a failed cancellation looked successful | `checklistCancelSucceeded()` treats an explicit `success: false` or `ok: false` as failure and the mutation throws `CHECKLIST_CANCEL_FAILED` ("The approval could not be cancelled. Nothing was changed."), leaving the row untouched (UT-CHKLST-034). |
| The `AppId` argument on the gate cancellation | Declared required by the flow; no action in the flow references it | Not sent (ambiguity 3). No behaviour depends on it; the flow itself is unchanged. |
| The `DefaultApprovalGUID` the checklist branch computes | The `"Checklist Completion"` branch computes `locSelectedItemProjectState.Gate` inside its `With` and then never passes it; the `.Run()` sends a `Check List Default Approval` id instead | The dead binding is dropped (ambiguity 5). The id that travels is the `Check List Default Approval` one, which is what the flow's `GetItem` on `vsb_checklistdefaultapprovalses` needs. |
| Developer-only refresh control | `cmp_CheckList_Project_States.RefreshButtonVisibility` gated on a hard-coded `colDevelopers` list | Deleted. A hard-coded name list is not an authorisation mechanism, and the control's only purpose was to re-run queries that now invalidate on mutation. |

#### Deliberate divergences

The `rules.ts` header records four ambiguities resolved against the canvas and no `SOURCE DEFECT:` twin, so there is no `…CanvasParity` function on this screen. The resolutions that change behaviour:

- **`CanEditSelectedProject` is now consumed.** Canvas: computed in `OnVisible`, read by nothing, so the write buttons gate on approval state alone and a user without edit rights can drive a cluster transition as far as Dataverse will let them. Rebuild: `requireEditPermission()` gates every plan builder. Ambiguity 1.
- **The gate cancellation payload.** Canvas: a 13-field JSON blob plus an unused `AppId`. Rebuild: `gateCancelArgs()` sends the state-tracking id alone. Ambiguity 3. The flow is not edited; the replacement is a new custom API.
- **The unpassed `DefaultApprovalGUID`.** Canvas: computed and dropped on the floor. Rebuild: not carried forward. Ambiguity 5.
- **`pcf_…_Buttons_Return` is dead but ported.** Canvas: `Visible` is hard-coded `false`, so Reset-to-previous-cluster is unreachable, though the sibling `Return_1` control carries the real condition. Rebuild: `planReturnToPreviousCluster()` and `showReturnToPrevious()` exist and are tested, and nothing renders them — the behaviour is preserved so it can be switched on without re-deriving it, rather than silently lost.
- **`Remove('Project Checklists', …)` stays deleted.** It sits inside a `/* … */` comment in the refresh handler, so orphan checklist rows are not deleted today and are not deleted here.

#### Build steps

1. Land the `ES_PROCESS` / `CHOICE_PROCESS` split in `src/data/entities.ts` and the nine repos this screen needs, before any rule is written.
2. Register `vsb_CancelGateApproval` and `vsb_CancelCheckListApproval` in `FLOW_REGISTER` so an undeployed custom action fails with a named error rather than a raw Dataverse fault.
3. Write the ordinal and progress primitives — `clusterNo`, `startClusterNo`, `checklistStates`, `hasRealGateProgress`, `expectedApprovalState`, `expectedApprovalComment`, `shouldBackfillSkippedClusters` — with tests UT-CHKLST-001 … 010, and confirm they agree with General Data's `plannedTrackingRows`.
4. Write `buildOperationalSequence`, `buildDisplaySequence`, `previousState`, `nextState`, `defaultSelectedCluster` with tests UT-CHKLST-011 … 015; then the self-heals `planEnsureTracking` and `planChecklistMaterialisation` with UT-CHKLST-016 … 019.
5. Write the row and panel rules — `toChecklistRow`, `rowActionLabel`, `rowActionEnabled`, `completionDateBlocksComplete`, `inProgressTogglePatch`, `commentError`, `showSave`, `canSavePanel`, `showRequestApproval`, `showCancelApproval` — with tests UT-CHKLST-020 … 029, UT-CHKLST-043.
6. Write `planClusterTransition`, `planTerminalStateChange`, `planSkippedClusterBackfill`, `planGateCancel`, `planReturnToPreviousCluster`, `requireEditPermission`, `planWasRefused` and `planToBatchOps`, with tests UT-CHKLST-035 … 038 and the permission refusal UT-CHKLST-042. UT-CHKLST-036 must assert the whole move is one batch.
7. Write the flow argument builders and result handlers — `checklistApprovalArgs`, `gateApprovalArgs`, `gateCancelArgs`, `flowWriteBackPatch`, `checklistCancelSucceeded`, `approvalPersonaSnapshot` — with tests UT-CHKLST-030 … 034.
8. Write `pageLock`, `missingStartClusterMilestones`, `isPageLocked`, `projectIsTerminal` with UT-CHKLST-039 … 041, and the history and label rules (`historyDescriptor`, `clusterMovementTitle`, `clusterStepStateLabel`, `checklistTableTitle`, `gateRelevanceLabel`, `stepVisualStatus`, `stepConnectorLit`) with UT-CHKLST-044 and the GUIDE q18–q20 cases.
9. Build `hooks.ts` — one query key per table, invalidated on mutation, and the four flow mutations each re-checking `canEdit` — then compose `Screen.tsx` as the stepper with its approvers popover, the checklist table, the two-mode right panel and the read-only Cluster Movement dialog.
10. Run `npx tsc --noEmit` filtered to `features/checklist` and `npx vitest run src/features/checklist`.

#### Exit gate

`npx vitest run src/features/checklist` passes all 85 cases, `npx tsc --noEmit` reports nothing under `features/checklist`, and three properties hold. First, no plan builder produces a write without permission: every function returning a `WritePlan` yields `planWasRefused(plan) === true` and `plan.writes.length === 0` when `canEdit` is false (UT-CHKLST-042). Second, a full cluster move emits exactly one batch — `planToBatchOps(planClusterTransition(...))` returns all four operations in one array, with no intermediate call (UT-CHKLST-036). Third, `flowWriteBackPatch()` returns `null` for a flow result carrying an `approvalid` but no `runid`, so no partial flow identity is ever persisted (UT-CHKLST-031). The gate additionally fails while `grep -n "vsb_CancelGateApproval\|vsb_CancelCheckListApproval" src/flows/flowClient.ts` finds those names only at their call sites and not in `FLOW_REGISTER`.

---
### 13. Project Planning Screen — `src/features/planning/`

| | |
|---|---|
| Canvas unit | `PM::Project Planning Screen` (PM app) |
| Power Fx | `84` blocks ≥3 lines · `43` ≥10 · `7` ≥30 · `1726` lines in those blocks (`3562` across all `=` properties) |
| Complexity | band `M` · score `22.8` · `9` build-days |
| Code app | `Screen.tsx` 872 ln · `hooks.ts` 559 ln · `rules.test.ts` 684 ln · `rules.ts` 1228 ln |
| Pure rules exported | `116` |
| Unit tests | `54` cases · IDs `UT-PLAN-001…UT-PLAN-034` |
| Dataverse tables | Aquisition Statuses, Aquisition Types, Custom Choice Values, Permits, Project Plannings, Projects |

#### What it does

Three tabs over one `Project Plannings` row per project plus two child sets. General carries Cooperation with its dependent Partner and Details fields, the two `Custom Choice Values` pickers (Legal Planning Basis and Permit Procedure), Planning Basis Category, Planning Basis Details, the WTG height-limitation toggle with its numeric limit, and a Permits sub-grid with its own add/edit/delete panel; Repowering carries Repowering, "Access to old plants secured" and Repowering Details; Aquisition Status carries the two acquisition galleries, in personam and in rem, each row editable through a side panel that stores Secured, Required and a derived percentage. Saving the tab writes one `Project Plannings` row; permits and acquisition rows write themselves through their own panels. The height limitation this screen stores is the value the Generators screen's save gate reads, so this row is a dependency of screen 15 rather than a leaf.

#### Depends on

- `src/domain/numeric.ts` — `isNumeric`, `isDecimalWithPlaces`, `inRange`, `parseNumber`, `roundDown`, `isBlank`, `Lang`. `roundDown` is what makes the derived acquisition percentage match `RoundDown(value * 100, 0)`.
- `src/domain/dates.ts` — `formatDate`, for the two permit date cells.
- `src/data/entities.ts` — `CHOICE_PROCESS.yesNoUnknown`, `CHOICE_PROCESS.aquisitionType`, `TEXT_MAX_LENGTH` (`default` 55, `long` 300).
- `src/data/repos.ts` — `projectPlanningFullRepo`, `permitRepo`, `aquisitionStatusRepo`, `aquisitionTypeRepo`, `customChoiceValueFullRepo`, `projectFullRepo`; the `…Full` variants exist because the short projections omit columns this screen writes.
- `src/data/queryKeys.ts` — `qk.child`, used by `planningKey`, `permitsKey` and `aquisitionKey` in `hooks.ts`.
- `src/platform/dataClient.ts` — `dataClient.batch`, re-exported from `hooks.ts` as `aquisitionBatchClient` so the seed's one-`$batch` promise is assertable.
- `src/platform/odata.ts` — `f.guid`, `f.eq`, `f.or`, `asc`; `AQUISITION_ORDER_BY` is `asc("vsb_AquisitionStatusType/vsb_order")` and `customChoiceFilter()` builds the field-plus-country clause.
- `src/platform/errors.ts` / `src/platform/telemetry.ts` — `AppError`, `toAppError`, `Result`, `trace`, replacing the four `IfError(…, Notify(FirstError…))` handlers.
- `src/features/shared/useProjectContext.ts` — the project record and the server-derived `canEdit`, which is this screen's replacement for the `Set(gblCurrentUser, Patch(…CanEditSelectedProject…))` preamble.
- `src/components/` — `PageHeader.tsx`, `CommandBar.tsx`, `DataGrid.tsx`, `FormPanel.tsx`, `ConfirmDialog.tsx`, `LoadingOverlay.tsx`, `NumericInput.tsx`, `StateChip.tsx`, `EmptyState.tsx`, `Card.tsx`, `RecordFooter.tsx`. `RecordFooter.tsx` is the guide-parity component that owns Save/Cancel and the Created By / Modified By stamps.
- `src/features/general-data/rules.ts` — `PROJECT_COL` and `formatAuditStamp`, shared rather than re-declared.
- Screen 9 (General Data) must be finished first: `'Project ID'` is assigned there and its absence is the first page-lock bullet. Screens 10, 15 and 16 supply the other three lock prerequisites (`'End Date'`, `'Total Capacity'`, `'Net Yield p50'`), and screen 12 is what moves the project out of Draft — so Planning is only reachable end to end once all five exist.
- Dataverse privileges: `prvWritevsb_projectplanning`, `prvCreatevsb_projectplanning`, `prvCreate`/`prvWrite`/`prvDeletevsb_permit`, `prvWritevsb_aquisitionstatus`, and `prvReadvsb_customchoicevalue`.

There is **no `YearGrid` or `PeriodMatrix` component in this repo** — grep for either name returns nothing. Planning's layout risk is carried by three ordinary pieces instead: a `makeStyles` grid of `repeat(auto-fit, minmax(260px, 1fr))` collapsing to one column below `media.belowMd`, `DataGrid.tsx` for the Permits sub-grid and both acquisition galleries, and `FormPanel.tsx` for the three drawers. Anything matrix-shaped on this screen is a `DataGrid` with computed columns, so the layout risk is column-count and drawer-width, not a missing component.

#### Power Fx → TypeScript

##### pcf_ProjectPlanning_DisplayProjectBodyRightContent_ButtonsSave.OnChange — 227 lines → `buildPlanningPayload()`

Decides the whole `Project Plannings` upsert: which fourteen columns are written, which two are blanked by the Repowering choice, and which two travel as lookups rather than option sets.

```powerfx
IfError(
    Set(
        gblRecordProjectPlanning,
        Patch(
            'Project Plannings',
            If(
                IsBlank(gblRecordProjectPlanning),
                Defaults('Project Plannings'),
                gblRecordProjectPlanning
            ),
            {
                Project: gblRecordSelectedProject,
                Name: gblRecordSelectedProject.'Project Name',
                Cooperation: drp_ProjectPlanning_DisplayProjectBodyRightContent_Cooperation.Selected.Value,
                'Cooperation Partner': txt_ProjectPlanning_DisplayProjectBodyRightContent_CooperationPartner.Value,
                'Cooperation Details': txt_ProjectPlanning_DisplayProjectBodyRightContent_CooperationDetails.Value,
                'Legal Planning': LookUp(
                    'Custom Choice Values',
                    'Custom Choice Value' = drp_ProjectPlanning_DisplayProjectBodyRightContent_LegalPlanningBasis.Selected.vsb_customchoicevalueid
                ),
                'Owning Business Unit': gblRecordSelectedProject.'Besitzer (Unternehmenseinheit)', 
                'Is Height Limitation For WTG': tgl_HeightLimitation_ProjectPlanning.Checked, 
                'Height limitation [m]': If(tgl_HeightLimitation_ProjectPlanning.Checked,Value(txt_HeightLimit_ProjectPlanning.Value), Blank())
            }
        )
    );
// … [201 of the block's 227 lines omitted]
```

```typescript
export function buildPlanningPayload(
  form: PlanningForm,
  project: PlanningProject,
  opts: { isCreate: boolean; language?: Lang },
): Record<string, unknown> {
  const lang = opts.language ?? "en-US";
  const repoweringIsNo = form.repowering === YNU.no;
  const text = (v: string, max: number): string | null =>
    isBlank(v) ? null : v.slice(0, max);

  const payload: Record<string, unknown> = {
    [PLANNING_COL.name]: project.projectName,
    [PLANNING_COL.cooperation]: form.cooperation,
    [PLANNING_COL.cooperationPartner]:
      text(form.cooperationPartner, MAX_LENGTH.cooperationPartner),
// … [6 lines omitted]
    // Rule 7 verbatim.
    [PLANNING_COL.securedAccess]:
      repoweringIsNo ? null : text(form.securedAccess, MAX_LENGTH.securedAccess),
    [PLANNING_COL.repoweringDetails]:
      repoweringIsNo ? null : text(form.repoweringDetails, MAX_LENGTH.repoweringDetails),
    [PLANNING_COL.isHeightLimitation]: form.isHeightLimitation,
    // Rule 9 — `If(Checked, Value(text), Blank())`.
    [PLANNING_COL.heightLimitation]: form.isHeightLimitation
      ? numericOrNull(form.heightLimitation, lang)
      : null,
  };

  // Rule 8's save half — the picker's id becomes an @odata.bind on the real lookup.
  payload[`${PLANNING_LOOKUP.legalPlanning}@odata.bind`] = form.legalPlanningId
    ? `/vsb_customchoicevalues(${form.legalPlanningId})`
    : null;
  payload[`${PLANNING_LOOKUP.permitProcedure}@odata.bind`] = form.permitProcedureId
    ? `/vsb_customchoicevalues(${form.permitProcedureId})`
    : null;

  if (opts.isCreate) {
    payload[`${PLANNING_LOOKUP.project}@odata.bind`] = `/vsb_projects(${project.id})`;
    if (project.owningBusinessUnitId) {
      payload[`${PLANNING_LOOKUP.owningBusinessUnit}@odata.bind`] =
        `/businessunits(${project.owningBusinessUnitId})`;
    }
  }
  return payload;
}
```

**Shape change** — the in-formula `LookUp('Custom Choice Values', 'Custom Choice Value' = drp_….Selected.vsb_customchoicevalueid)` round trip, which re-fetched a row the dropdown had already loaded purely to obtain a record reference, becomes an `@odata.bind` string built from the id the picker already holds; clearing the picker sends an explicit `null` rather than a blank record. Twelve control `.Value` reads become one typed `PlanningForm`, and `Project` plus `Owning Business Unit` are sent on the create only, because re-binding an existing row's project on every Save is a write `Patch` made for free and a PATCH should not repeat. `Notify(…FirstError.Source & …Message & …Details.HttpResponse)` becomes `AppError` plus `trace()`, with `SAVE_ERROR_PREFIX` as the only user-facing text.
**Pinned by** — the `UT-PLAN the planning payload` describe() block (four cases: the create/update binding split, the two custom-choice `@odata.bind` clears, the `MaxLength` and blank-to-null rules, and `numericOrNull`).

##### Project Planning Screen.OnVisible — 341 lines → `buildPlanningSeedPayload()`

Decides what happens when a project has no `Project Plannings` row yet: the screen silently creates one before anything is rendered.

```powerfx
Set(
    gblRecordProjectPlanning,
    LookUp(
        'Project Plannings',
        Project.Project = gblRecordSelectedProject.Project
    )
);
If(
    IsBlank(gblRecordProjectPlanning),
    Set(
        gblRecordProjectPlanning,
        Patch(
            'Project Plannings',
            Defaults('Project Plannings'),
            {
                Project: gblRecordSelectedProject,
                Name: gblRecordSelectedProject.'Project Name','Owning Business Unit':gblRecordSelectedProject.'Besitzer (Unternehmenseinheit)'
            }
        )
    )
);
// … [320 of the block's 341 lines omitted]
```

```typescript
/**
 * Rule 1 — the get-or-create payload. `Patch('Project Plannings', Defaults(...),
 * {Project, Name, 'Owning Business Unit'})`, nothing else: the form fields are written by
 * the Save, not by the self-heal.
 */
export function buildPlanningSeedPayload(project: PlanningProject): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    [PLANNING_COL.name]: project.projectName,
    [`${PLANNING_LOOKUP.project}@odata.bind`]: `/vsb_projects(${project.id})`,
  };
  if (project.owningBusinessUnitId) {
    payload[`${PLANNING_LOOKUP.owningBusinessUnit}@odata.bind`] =
      `/businessunits(${project.owningBusinessUnitId})`;
  }
  return payload;
}
```

**Shape change** — an unconditional write inside a screen-entry handler becomes a payload builder plus one gated call site: `useProjectPlanning(project, canEdit)` in `hooks.ts` takes `canEdit` as an argument and does not seed for a read-only user, so merely opening the screen no longer creates a row the viewer had no right to create. `gblRecordProjectPlanning` — read by five other handlers on this screen and by the Generators save gate — becomes a TanStack query keyed on `planningKey(projectId)` rather than a global, and the `Trace("Warning: Project Planning record was not loaded…")` branch that followed becomes a `trace("warning", …)` with the same severity.
**Pinned by** — UT-PLAN-001, UT-PLAN-002.

##### pcf_btn_ProjectPlanning_RightPanel_AquisitionStatus_InpForm_Buttons_Save_InRem.OnChange — 57 lines → `buildAquisitionPayload()`

Decides what an acquisition row stores: Secured, Required, and the percentage as a fraction.

```powerfx
IfError(
    Patch(
        'Aquisition Statuses',
        locAquisitionStatusEntityToUpdate,
        {
            Secured: Value(txt_ProjectPlanning_RightPanel_AquisitionStatus_InpForm_Body_Secured.Value),
            Required: Value(txt_ProjectPlanning_RightPanel_AquisitionStatus_InpForm_Body_Requered.Value),
            'Aquisition Status [%]': Value(txt_ProjectPlanning_RightPanel_AquisitionStatus_InpForm_Body_Percentage.Value) / 100,
            Project: locAquisitionStatusEntityToUpdate.Project,
            'Aquisition Status Type': locAquisitionStatusEntityToUpdate.'Aquisition Status Type',
            'Owning Business Unit': locAquisitionStatusEntityToUpdate.Project.'Besitzer (Unternehmenseinheit)'
        }
    )
// Show error message
,
    Notify(
        "Error: assosiated Shareholder Entity could not be saved. " & "Internal error: originated on " & FirstError.Source & ". Message: " & FirstError.Message & FirstError.Details.HttpResponse,
        NotificationType.Error
    )
);
// … [37 of the block's 57 lines omitted]
```

```typescript
export function buildAquisitionPayload(
  draft: AquisitionDraft,
  ctx: {
    projectId: string;
    typeId: string;
    owningBusinessUnitId: string | null;
    isCreate: boolean;
    language?: Lang;
  },
): Record<string, unknown> {
  const lang = ctx.language ?? "en-US";
  const secured = numericOrNull(draft.secured, lang);
  const required = numericOrNull(draft.required, lang);
  const display = securedPercent(secured, required, lang);
  const fraction = display === PERCENT_NOT_APPLICABLE ? null : display / 100;

  const payload: Record<string, unknown> = {
    [AQUISITION_COL.secured]: secured,
    [AQUISITION_COL.required]: required,
    [AQUISITION_COL.percentage]: fraction,
  };
  if (ctx.isCreate) {
    payload[`${AQUISITION_LOOKUP.project}@odata.bind`] = `/vsb_projects(${ctx.projectId})`;
    payload[`${AQUISITION_LOOKUP.type}@odata.bind`] =
      `/vsb_aquisitiontypes(${ctx.typeId})`;
    if (ctx.owningBusinessUnitId) {
      payload[`${AQUISITION_LOOKUP.owningBusinessUnit}@odata.bind`] =
        `/businessunits(${ctx.owningBusinessUnitId})`;
    }
  }
  return payload;
}
```

**Shape change** — the percentage stops being re-parsed out of a rendered text box. The canvas wrote `Value(txt_…_Percentage.Value) / 100`, where that box renders the literal `"N/A"` when Required is 0, so the In-rem path could evaluate `Value("N/A")` and error mid-`Patch`; here the fraction is derived from the two numbers by `securedPercent()`, so both LLA types take one code path and `"N/A"` becomes `null` instead of an error. The two verbatim-duplicated handlers (`…_Save_UnderLaw`, 60 lines, and `…_Save_InRem`, 57 lines) collapse into this one function plus `useSaveAquisition()`; `locAquisitionStatusEntityToUpdate` — a `LookUp` re-read of the row the gallery had already selected — disappears, and the trailing `ClearCollect(colAquisitionStatuses…)` gallery reload becomes a TanStack invalidation of `aquisitionKey(projectId)`.
**Pinned by** — UT-PLAN-019, UT-PLAN-020, UT-PLAN-021, UT-PLAN-022, UT-PLAN-023.

##### pcf_ProjectPlanning_RightPanel_NewEditPermitBodyButtons_Save.OnChange — 52 lines → `buildPermitPayload()`

Decides the permit upsert: five fields, bound to the planning row rather than to the project.

```powerfx
IfError(
    //Concurrent(
    Patch(
        Permits,
        If(
            IsBlank(locSelectedPermit),
            Defaults(Permits),
            locSelectedPermit
        ),
        {
            'Project Planning': gblRecordProjectPlanning,
            Name: txt_ProjectPlanning_RightPanel_NewEditPermitBodyContent_Name.Value,
            'Submission Date': dte_ProjectPlanning_RightPanel_NewEditPermitBodyContent_SubmissionDate.SelectedDate,
            'Submission Date Type': rad_ProjectPlanning_RightPanel_NewEditPermitBodyContent_SubmissionDateType.Selected.Value,
            'Approval Date': dte_ProjectPlanning_RightPanel_NewEditPermitBodyContent_ApprovalDate.SelectedDate,
            'Approval Date Type': rad_ProjectPlanning_RightPanel_NewEditPermitBodyContent_ApprovalDateType.Selected.Value,
            'Owning Business Unit': gblRecordProjectPlanning.'Owning Business Unit'
        }
    );
// … [33 of the block's 52 lines omitted]
```

```typescript
/** Rule 16 — the permit upsert payload. Permits bind to the PLANNING row. */
export function buildPermitPayload(
  draft: PermitDraft,
  planningId: string,
  owningBusinessUnitId: string | null,
  opts: { isCreate: boolean },
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    [PERMIT_COL.name]: draft.name.trim(),
    [PERMIT_COL.submissionDate]: draft.submissionDate,
    [PERMIT_COL.submissionDateType]: draft.submissionDateType,
    [PERMIT_COL.approvalDate]: draft.approvalDate,
    [PERMIT_COL.approvalDateType]: draft.approvalDateType,
  };
  if (opts.isCreate) {
    payload[`${PERMIT_LOOKUP.projectPlanning}@odata.bind`] =
      `/vsb_projectplannings(${planningId})`;
    if (owningBusinessUnitId) {
      payload[`${PERMIT_LOOKUP.owningBusinessUnit}@odata.bind`] =
        `/businessunits(${owningBusinessUnitId})`;
    }
  }
  return payload;
}
```

**Shape change** — six control reads become a `PermitDraft`, and the commented-out `//Concurrent(` wrapper plus the commented `UpdateIf(colPlanningFormValidation, Name = "Permits", {Valid: true, Dirty: true})` block are not resurrected: the dirty flag is a diff, so a permit edit marks the form dirty by construction rather than by a hand-maintained row (the canvas's `Permits` validation row was never written, so a permit edit left Save disabled). Two `Notify` arms in the wrong order — the canvas passes the error handler as `IfError`'s second argument and the success `Notify` as its third, so the success message is the *fallback* — are replaced by a `Result`-returning mutation. `ClearCollect(colPermits, Filter(Permits, 'Project Planning'.'Project Planning' = …))` becomes `usePermits(planningId)` with a server `$filter`.
**Pinned by** — UT-PLAN-025, UT-PLAN-026, UT-PLAN-027, UT-PLAN-028, UT-PLAN-029.

##### pcf_btn_ProjectPlanning_RightPanel_AquisitionStatus_InpForm_Buttons_Cancel_1.OnChange — 106 lines → `buildAquisitionClearPayload()`

Decides what the acquisition panel's second button does — and in the canvas it is a destructive write, not a cancel.

```powerfx
UpdateContext(
    {
        locAquisitionStatusEntityToUpdate: LookUp(
            'Aquisition Statuses',
            'Aquisition Status' = locAquisitionStatusEntity.'Aquisition Status'
        )
    }
);
IfError(
    Patch(
        'Aquisition Statuses',
        locAquisitionStatusEntityToUpdate,
        {
            Secured: Blank(),
            Required: Blank(),
            'Aquisition Status [%]': Blank()
        }
    );
// … [88 of the block's 106 lines omitted]
```

```typescript
export function buildAquisitionClearPayload(): Record<string, unknown> {
  return {
    [AQUISITION_COL.secured]: null,
    [AQUISITION_COL.required]: null,
    [AQUISITION_COL.percentage]: null,
  };
}
```

**Shape change** — one control that both looks like a cancel and wipes three columns becomes two controls with honest labels: `Cancel` closes the panel and writes nothing, so it needs no rule at all, and `Clear` calls this payload behind a `ConfirmDialog`. The 88 elided lines are the `If(locLLAType = "personam", ClearCollect(colAquisitionStatusesUnderLaw, …), ClearCollect(colAquisitionStatusesInRem, …))` gallery reload with a further ~46 lines of commented-out `Patch(colAquisition…)` attempts inside it; none of that survives — the reload is a TanStack invalidation and the branch on `locLLAType` becomes the type filter already applied server-side.
**Pinned by** — UT-PLAN-024.

#### Security conditions

| Condition | Canvas today | Where it must be enforced |
|---|---|---|
| Editing any Planning field | `Set(gblCurrentUser, Patch(gblCurrentUser, {CanEditSelectedProject: And(DataSourceInfo(Projects, CreatePermission), Coalesce(RecordInfo(gblRecordSelectedProject, EditPermission), false))}))` in `OnVisible`. Genuinely server-answered — but it is read on the **Save button only**, so a read-only user can type into every field and learn on Save | `prvWritevsb_projectplanning` plus `prvWritevsb_project` at the role's own scope. `canEditPlanning()` folds `canEdit` into the same gate as the lock and Draft clauses, so the fields are disabled, not merely unsaveable |
| Creating the `Project Plannings` row on screen entry | `If(IsBlank(gblRecordProjectPlanning), Patch('Project Plannings', Defaults(…), …))` — unconditional, and it fires for a viewer merely navigating to the tab | `prvCreatevsb_projectplanning`. `useProjectPlanning(project, canEdit)` takes the flag and does not seed without it; the row is created by an editor's first visit, never by a reader's |
| Seeding the acquisition rows | `If(Or(IsBlank(col), IsEmpty(col)), ForAll(allTypesOfThisKind, Patch('Aquisition Statuses', Defaults(…), …)))` — a bulk create with no permission test at all | `prvCreatevsb_aquisitionstatus` at Business Unit scope. `seedAquisitionStatuses()` is gated on `canEdit` before the `$batch` is issued, and it computes the MISSING set so a re-visit cannot duplicate rows |
| Deleting a permit | The canvas Delete command tests `RecordInfo(locSelectedPermit, RecordInfo.DeletePermission)` — correct, and this is the one place on the screen that asks the server per record | `prvDeletevsb_permit` at Business Unit scope, kept as the boundary. `permitCommandState()` reads the per-row `canDelete` flag the projection carries; a direct `DELETE` is still refused by Dataverse |
| Editing a permit | No `RecordInfo(…, EditPermission)` check anywhere — the panel opens for any selected row | `prvWritevsb_permit`. `PermitRow.canEdit` is populated from the row's own privilege annotation and `permitCommandState()` conjoins it, so Edit is disabled on a row the caller cannot write |
| Writing an acquisition row | No permission check on either Save handler or on the destructive Cancel | `prvWritevsb_aquisitionstatus` at Business Unit scope, and the `Clear` action behind the same privilege — it is a write, not a UI reset |
| The `Owning Business Unit` stamp | Copied client-side from `gblRecordSelectedProject.'Besitzer (Unternehmenseinheit)'` on every child write. A caller who can create the row can stamp any BU | A synchronous pre-operation plug-in on Create of `vsb_projectplanning`, `vsb_permit` and `vsb_aquisitionstatus` that derives `owningbusinessunit` from the parent project, ignoring whatever the client sent. Ownership drives every downstream row-scope decision, so it cannot be client-supplied |
| Reading the two `Custom Choice Values` pickers | `App.OnStart` materialised the whole table into `colCustomChoiceValues` and filtered client-side, so every user's session held every country's choices | `prvReadvsb_customchoicevalue` at Organization scope, with `customChoiceFilter()` narrowing to `vsb_fieldname` and `(_vsb_country_value eq null or _vsb_country_value eq {id})` on the server. Narrowing at the client is a convenience; the privilege is the boundary |
| The height limitation that gates the Generators save | An ordinary column on `vsb_projectplanning`. Any writer of the planning row can raise or clear the limit, which silently unblocks over-height turbines on screen 15 | Keep `prvWritevsb_projectplanning` scoped to the roles that own planning, and treat `vsb_isheightlimitationforwtg` / `vsb_heightlimitationm` as the audited pair they are. The override on screen 15 is already project-manager-only; the limit itself must not be looser than the override |
| A hand-edited `?tab=` value | Not applicable — the canvas held the tab in `locGridOperatorTabSelected`-style local state | `parseTab()` accepts only `general`, `repowering`, `aquisition` and falls back to `general`; it cannot throw, and the tab carries no authority of its own |

#### Deliberate divergences

- **The height-limit error label uses `And` where `Or` is needed, and its range message is un-negated** (ambiguity 7). `.Visible` is `And(Not(IsBlank(Trim(v))), Not(IsTwoDecimal(v)), Not(InRange(v,0,99999)))`, so `1.234` (three decimals, in range) and `100000` (integer, out of range) both pass silently; `.Text`'s third branch tests `InRange(v, 0, 99999)` un-negated, so the range message renders when the value *is* in range. Fixed to `Or` with the message on the negated condition. Parity function: `validateHeightLimitCanvasParity()`.
- **`fn_Numeric_Revenues` is referenced but never instantiated on this screen** (ambiguity 6). All three height formulas call it; the component instance exists only on `Project Revenues Screen`, so in the canvas the height validation almost certainly errors at runtime rather than validating anything. The rebuild calls `domain/numeric` directly, so the validation actually runs. No parity twin — there is no behaviour to preserve.
- **`"Secured must be between 0 and 100."` contradicts its own 0–999 check** (ambiguity 8). The condition range-checks 0…999 on both fields; only the Secured *message* claims 100. Both bounds are 0…999 in `validateAquisition()` and the message is corrected. The original strings are kept in `MSG_CANVAS`.
- **The acquisition panel's "Cancel" button clears data** (ambiguity 9). Split into an honest `Cancel` (closes, writes nothing) and a confirmed `Clear`. Parity function: `buildAquisitionClearPayload()` is the write, reachable only from the labelled action.
- **The In-rem save divides without an error guard** (ambiguity 10). The In-personam handler wraps `Value(percentage)/100` in `IfError(…, 0)` and the In-rem handler does not. Fixed by construction — the fraction is derived from the two numbers, never re-parsed from rendered text.
- **Permit edits never mark the form dirty** (ambiguity 11). The `Permits` row of `colPlanningFormValidation` was seeded and never updated, so Save stayed disabled after a permit change. Dirty is now a diff. Parity function: `isDirtyCanvasParity()`.
- **The banner's `Height` switch tests `'Project Start Date'` while its `Visible` and its bullet test `'End Date'`** (ambiguity 13, shared with Grid Operator and Team). Resolved to `'End Date'`: it is what `Visible` uses, and Project Start Date is legitimately blank for any project starting at cluster 1 or later, so testing it would lock the screen permanently. Parity function: `pageLockCanvasHeightParity()`.
- **The acquisition seed is idempotent rather than all-or-nothing.** The canvas guard `If(Or(IsBlank(col), IsEmpty(col)), ForAll(…))` seeds nothing once a single row exists, so a type added to `Aquisition Types` after the first visit never gets a row. `planAquisitionSeed()` computes the missing set. Parity function: `planAquisitionSeedCanvasParity()`.
- **Cancel is always enabled.** The canvas condition is `locAllowPlanningReset && any dirty row`, which greys Cancel out on an untouched or just-saved form; GUIDE q22/q24 show the footer's outline Cancel undecorated on an untouched General tab, matching the `RecordFooter` convention already applied on General Data and Milestones. `canReset()` stays exported and tested so the canvas condition is not lost.
- **The Permits grid is three columns, not five** (GUIDE q22). The submission and approval *type* (Plan/Actual) folds into the same cell as its date via `permitDateCell()`, because the panel that produces the row already presents Plan/Actual as a choice attached to each date. Pinned by UT-PLAN-030.
- **The commented-out bulk save is not resurrected.** `ButtonsSave.OnChange` carries a `/* … */` block that would `ClearCollect(colPermits, ForAll(colPermits, Patch(Permits, …)))` plus both acquisition sets — N writes per Save. Permits and acquisition rows save through their own panels instead.

#### Build steps

1. Add the `Owning Business Unit` derivation plug-in and confirm a create with a forged `owningbusinessunit@odata.bind` is overridden, and that `prvCreatevsb_projectplanning` is absent from read-only roles.
2. Add `projectPlanningFullRepo`, `permitRepo`, `aquisitionStatusRepo`, `aquisitionTypeRepo` and `customChoiceValueFullRepo` to `src/data/repos.ts` with the full column projections, and check every logical name in `PLANNING_COL`, `PERMIT_COL` and `AQUISITION_COL` against `customizations.xml`.
3. Write `rules.ts`'s constants — the three `*_COL` maps, the three `*_LOOKUP` maps, `CUSTOM_CHOICE_FIELD`, `MAX_LENGTH`, `MSG`, `MSG_CANVAS`, `GENERAL_TAB_LABELS`, `REPOWERING_TAB_LABELS`, `PERMIT_GRID_COLUMNS`, `PERMIT_PANEL_LABELS`, `PERMIT_COMMAND_LABELS`, `PLANNING_TABS`, `LLA_TYPE_VALUE`, `LLA_TYPE_LABEL`.
4. Write the lock, gating and visibility rules — `pageLock`, `pageLockCanvasHeightParity`, `isPageLocked`, `isDraft`, `canEditPlanning`, `canSwitchTabs`, `canEditLegalPlanningBasis`, `showCooperationPartner`, `showCooperationDetails`, `cooperationDetailsEditable`, `showSecuredAccess`, `showRepoweringDetails`, `showHeightLimit`, `applyCooperationChange`, `applyRepoweringChange`, `applyHeightToggle`.
5. Write the validation, dirty and save rules — `validateHeightLimit` and its parity twin, `validatePlanning`, `invalidPlanningFields`, `planningMessages`, `toPlanningForm`, `emptyPlanningForm`, `dirtyFields`, `isDirty`, `isDirtyCanvasParity`, `isPlanningRowDirty`, `canSave`, `saveDisabledReason`, `canReset`, `buildPlanningPayload`, `buildPlanningSeedPayload`, `numericOrNull`.
6. Write the permit and acquisition rules — `togglePermitSelection`, `canSavePermit`, `permitPanelErrors`, `permitCommandState`, `buildPermitPayload`, `permitDateCell`, `permitDateTypeLabel`, `permitPanelTitle`, `securedPercent`, `storedPercentToDisplay`, `validateAquisition`, `canSaveAquisition`, `aquisitionPanelErrors`, `buildAquisitionPayload`, `buildAquisitionClearPayload`, `sortByTypeOrder`, `planAquisitionSeed` and its parity twin, `matchesCustomChoiceScope`, `customChoiceOptions`.
7. Write `rules.test.ts` to 54 cases covering UT-PLAN-001…034 across the ten describe blocks, including every parity twin, and run `npx vitest run src/features/planning`.
8. Write `hooks.ts` — `usePlanningProject`, `useProjectPlanning` (with the `canEdit`-gated seed), `usePermits`, `useAquisitionTypes`, `useAquisitionStatuses`, `useCustomChoiceValues` with `customChoiceFilter` and `AQUISITION_ORDER_BY`, `useAquisitionSeed` issuing one `$batch`, and the five mutations.
9. Compose `Screen.tsx` from `PageHeader`, the `TabList`, the responsive `Card` grid, `DataGrid` for the permits sub-grid and both galleries, three `FormPanel` drawers, `ConfirmDialog` for Clear and Delete, and `RecordFooter` for Save/Cancel plus the audit stamps.

#### Exit gate

`npx vitest run src/features/planning` passes all 54 cases including UT-PLAN-017 and UT-PLAN-018 (which fail against `validateHeightLimitCanvasParity` and pass against `validateHeightLimit`), `npx tsc --noEmit | grep features/planning` is empty, saving Secured 25 of Required 100 stores `0.25` in `vsb_aquisitionstatuspercentage` and renders `25`, and opening the screen as a user without `prvCreatevsb_projectplanning` creates no row — verified by a zero-write network trace, not by the absence of an error.

---
### 14. Grid Operator Screen — `src/features/grid-operator/`

| | |
|---|---|
| Canvas unit | `PM::Grid Operator Screen` (PM app) |
| Power Fx | `47` blocks ≥3 lines · `23` ≥10 · `3` ≥30 · `690` lines in those blocks (`1320` across all `=` properties) |
| Complexity | band `XS` · score `6.3` · `4` build-days |
| Code app | `Screen.tsx` 510 ln · `hooks.ts` 212 ln · `rules.test.ts` 569 ln · `rules.ts` 705 ln |
| Pure rules exported | `53` |
| Unit tests | `54` cases · IDs `UT-GRIDOP-001…UT-GRIDOP-032` |
| Dataverse tables | Grid Operators, Projects |

#### What it does

Two tabs over one `Grid Operators` row per project. The Grid Operator tab carries Operator, Grid voltage level [kV], Grid expansion required and Grid expansion details; the Grid Connection tab carries Substation construction required, Substation operator and the four cabling numbers — length and diameter, internal and external. One Save upserts the eleven writable columns, one Cancel restores the bound values without touching the server, and a locked-page banner lists whichever of the five prerequisites is missing. There are no galleries, no child tables, no flows and no batch writes: this is the lowest-scoring project screen on the complexity matrix — band XS, score 6.3 — which is why the earlier plan proved the whole stack on it first.

#### Depends on

This is the **vertical slice**, so its dependency list is the foundation itself. Nothing below is optional and nothing above it in the sequence is required.

- `src/platform/powerClient.ts` and `src/platform/bootstrap.ts` — the Power Apps SDK binding, `dataMode`, and the startup handshake that supplies the signed-in user.
- `src/platform/dataClient.ts` — `list` / `getById` / `getOne` / `create` / `update`; `$skiptoken` paging is not exercised here but the client is the same one every later screen uses.
- `src/platform/odata.ts` — `f.guid`, the only builder this screen needs. Every later filter goes through the same helpers, so this screen is where `f.*` parenthesisation is first compared against live Dataverse.
- `src/platform/errors.ts` — `AppError`, `toAppError`, `Result`, `ok`, `err`. `saveGridOperator()` returns `Result<SaveGridOperatorOutcome>`, which is the error contract every other feature copies.
- `src/platform/telemetry.ts` — `trace`, with the canvas's `TraceSeverity` levels preserved.
- `src/data/entities.ts` — `ES.gridOperators`, `CHOICE_PROCESS.yesNoUnknown`, `TEXT_MAX_LENGTH.default` (55).
- `src/data/repository.ts` — `makeRepository(entitySet, select, { projectLookup })`, the factory itself.
- `src/data/repos.ts` — `gridOperatorFullRepo` and `projectFullRepo`. `gridOperatorFullRepo` exists because the earlier `gridOperatorRepo` projected `vsb_connectionvoltagekv`, `vsb_gridexpansionrequired`, `vsb_connectionpoint` and `vsb_applicationdate`, none of which exist on the table; catching that on the smallest screen is part of the point.
- `src/data/queryKeys.ts` — `qk.child`, `qk.projects.one`.
- `src/domain/numeric.ts` — `isNumeric`, `isDecimalWithPlaces`, `inRange`, `parseNumber`, `isBlank`, `Lang`; the `fn_Numeric` port, first exercised here on five numeric fields with three different precisions.
- `src/domain/session.ts` — `canEditSelectedProject`, `CurrentUser`; the server-privilege path, not role names.
- `src/domain/navigation.ts` — `PM_NAV` and the `GridOperatorKey` rail item, whose completeness dot and `clusterBeyondDraft` prerequisite this screen sits behind.
- `src/store/appStore.ts` — the Zustand session slice replacing `gblCurrentUser`, and `useSelectedProject` replacing `gblRecordSelectedProject`.
- `src/routes/AppRoutes.tsx` — the `/project/grid-operator` route and `RequireProject`.
- `src/features/shared/useProjectContext.ts` — the shared replacement for the `Set(gblRecordSelectedProject, LookUp(Projects, …)); Set(gblCurrentUser, Patch(…))` preamble that opens nearly every canvas `OnVisible`.
- `src/components/` — `AppShell.tsx`, `AppHeader.tsx`, `LeftNav.tsx`, `PageHeader.tsx`, `Card.tsx`, `CommandBar.tsx`, `ConfirmDialog.tsx`, `LoadingOverlay.tsx`, `NumericInput.tsx`, `StateChip.tsx`, `StatTile.tsx`, `EmptyState.tsx`, `ErrorBoundary.tsx`, `useBreakpoint.ts`.
- `src/theme/tokens.ts` and `src/theme/fluentTheme.ts` — `AppTheme.palette` and `gblAppSizes`, plus the dark-mode token swap.
- `src/test/setup.ts` and the Vitest config, since UT-GRIDOP-001 is the first test in the repo to run.
- Dataverse privileges: `prvReadvsb_gridoperator`, `prvCreatevsb_gridoperator`, `prvWritevsb_gridoperator`, and `prvReadvsb_project` / `prvWritevsb_project` for the record-level edit probe.

#### Power Fx → TypeScript

##### pcf_GridOperator_DisplayProjectBodyRightContent_ButtonsSave.OnChange — 49 lines → `buildPayload()`

Decides the whole upsert: which eleven columns are written, how each text box becomes a typed value, and what a create binds that an update does not.

```powerfx
IfError(
    Set(
        gblRecordGridOperator,
        Patch(
            'Grid Operators',
            If(
                IsBlank(gblRecordGridOperator),
                Defaults('Grid Operators'),
                gblRecordGridOperator
            ),
            {
                Project: gblRecordSelectedProject,
                Operator: txt_GridOperator_DisplayProjectBodyRightContent_GridOperator.Value,
                'Voltage level [kV]': Value(txt_GridOperator_DisplayProjectBodyRightContent_GridVoltage.Value),
                'Expansion Required': drp_GridOperator_DisplayProjectBodyRightContent_GridExpansionRequired.Selected.Value,
                'Expansion Details': txt_GridOperator_DisplayProjectBodyRightContent_GridExpansionDetails.Value,
                'Substation Construction Required': drp_GridOperator_DisplayProjectBodyRightContent_SubstationConstruction.Selected.Value,
                'Substation Operator': txt_GridOperator_DisplayProjectBodyRightContent_SubstationOperator.Value,
                'Length internal cabeling': Value(txt_GridOperator_DisplayProjectBodyRightContent_LengthInternalCabeling.Value),
                'Diameter internal cabeling': Value(txt_GridOperator_DisplayProjectBodyRightContent_DiameterInternalCabeling.Value),
                'Length external cabeling': Value(txt_GridOperator_DisplayProjectBodyRightContent_LengthExternalCabeling.Value),
                'Diameter external cabeling': Value(txt_GridOperator_DisplayProjectBodyRightContent_DiameterExternalCabeling.Value),
                'Owning Business Unit': gblRecordSelectedProject.'Besitzer (Unternehmenseinheit)'
            }
        )
    );
// … [23 of the block's 49 lines omitted]
```

```typescript
export function buildPayload(
  form: GridOperatorForm,
  project: GridOperatorProject,
  opts: { isCreate: boolean; language?: Lang } ,
): Record<string, unknown> {
  const lang = opts.language ?? "en-US";
  const payload: Record<string, unknown> = {
    [GRID_OPERATOR_COL.operator]: textColumn(form.operator),
    [GRID_OPERATOR_COL.voltageLevel]: numericColumn(form.voltageLevel, lang),
    [GRID_OPERATOR_COL.expansionRequired]: form.expansionRequired,
    [GRID_OPERATOR_COL.expansionDetails]: textColumn(form.expansionDetails),
    [GRID_OPERATOR_COL.substationConstructionRequired]: form.substationConstructionRequired,
    [GRID_OPERATOR_COL.substationOperator]: textColumn(form.substationOperator),
    [GRID_OPERATOR_COL.lengthInternal]: numericColumn(form.lengthInternal, lang),
    [GRID_OPERATOR_COL.diameterInternal]: numericColumn(form.diameterInternal, lang),
    [GRID_OPERATOR_COL.lengthExternal]: numericColumn(form.lengthExternal, lang),
    [GRID_OPERATOR_COL.diameterExternal]: numericColumn(form.diameterExternal, lang),
  };
  if (opts.isCreate) {
    payload[`${GRID_OPERATOR_LOOKUP.project}@odata.bind`] =
      `/vsb_projects(${project.id})`;
    if (project.owningBusinessUnitId) {
      payload[`${GRID_OPERATOR_LOOKUP.owningBusinessUnit}@odata.bind`] =
        `/businessunits(${project.owningBusinessUnitId})`;
    }
  }
  return payload;
}
```

**Shape change** — eleven control `.Value` reads become one typed `GridOperatorForm` whose numerics stay as the raw text the user typed, so `"1,5"` can be rejected as a decimal-separator mistake instead of being silently coerced; `buildPayload` is the only place text becomes `number | null`. `Value("")` returning `0` in Power Fx becomes an explicit `null` via `numericColumn()`, which is the difference between "nobody entered a diameter" and "the diameter is zero". `Project` and `Owning Business Unit` become `@odata.bind` bindings sent on the create only — `Patch` with the whole record re-bound the project on every Save for free, and a PATCH should not repeat it. `Set(gblRecordGridOperator, …)` followed by a second `LookUp` re-read becomes one TanStack invalidation of `gridOperatorKey(projectId)`, and the `Notify("Error: …" & FirstError.Source & …Message & …Details.HttpResponse)` concatenation becomes `AppError` plus a structured `trace()`, with `SAVE_ERROR_PREFIX` as the only string the user sees.
**Pinned by** — UT-GRIDOP-023, UT-GRIDOP-024, UT-GRIDOP-025.

##### Grid Operator Screen.OnVisible — 130 lines → `useGridOperator()`

Decides what the screen loads and whether the user may edit it — the two questions every project screen in the estate opens with.

```powerfx
Set(
                gblCurrentUser,
                Patch(
                    gblCurrentUser,
                    {
                        CanEditSelectedProject: And(
                            DataSourceInfo(
                                Projects,
                                DataSourceInfo.CreatePermission
                            ),
                            Coalesce(
                                RecordInfo(
                                    gblRecordSelectedProject,
                                    RecordInfo.EditPermission
                                ),
                                false
                            )
                        )
                    }
                )
            );Set(
    gblRecordGridOperator,
    Blank()
);
Set(
    gblRecordGridOperator,
    LookUp(
        'Grid Operators',
        Project.Project = gblRecordSelectedProject.Project
    )
);
// … [99 of the block's 130 lines omitted]
```

```typescript
export function useGridOperator(projectId: string | undefined) {
  const q = useQuery({
    queryKey: gridOperatorKey(projectId ?? "none"),
    enabled: Boolean(projectId),
    queryFn: async (): Promise<GridOperatorRecord | null> => {
      const row = await gridOperatorFullRepo.getOne(
        f.guid(GRID_OPERATOR_COL.project, projectId!),
      );
      return toGridOperatorRecord(row);
    },
  });
  return {
    record: q.data ?? null,
    /** The bound values, i.e. what Cancel restores. */
    baseline: useMemo(() => toForm(q.data ?? null), [q.data]),
    isLoading: q.isLoading,
    isError: q.isError,
    error: q.error as AppError | null,
    refetch: () => void q.refetch(),
  };
}
```

**Shape change** — a blanking write followed by an unprojected table scan, re-run on every navigation, becomes one `useQuery` keyed on the project and projected to the fifteen columns the screen reads; `null` is a first-class result rather than an error, because a project nobody has filled in is the normal state and the Save then becomes a create. `Set(gblCurrentUser, Patch(…CanEditSelectedProject…))` moves out of the screen entirely into `useProjectContext()`, so every later screen gets the same freshly-read project and the same server-derived flag without re-implementing the idiom. The filter column is `_vsb_projectid_value`, not the `_vsb_project_value` shape most tables use — a difference the smallest screen is the cheapest place to discover.
**Pinned by** — UT-GRIDOP-001, UT-GRIDOP-002, UT-GRIDOP-003, UT-GRIDOP-004, UT-GRIDOP-005, UT-GRIDOP-006.

##### txt_GridOperator_DisplayProjectBodyRightContent_GridVoltage.OnChange — 11 lines → `validateForm()`

Decides whether the grid-voltage field is valid, and — in the canvas — maintains the row of a shadow table that decides whether Save is enabled.

```powerfx
UpdateIf(
    colGridOperatorFormValidation,
    Name = "GridVoltage",
    {
        Valid: And(
            Not(IsBlank(txt_GridOperator_DisplayProjectBodyRightContent_GridVoltage.Value)),
            IsNumeric(txt_GridOperator_DisplayProjectBodyRightContent_GridVoltage.Value)
        ),
        Dirty: true
    }
);
```

```typescript
export function validateForm(
  form: GridOperatorForm,
  touched: ReadonlySet<GridOperatorField> = new Set(),
  language: Lang = "en-US",
): FormValidity {
  const numeric = (
    field: GridOperatorField,
    value: string,
    validate: (t: string, l?: Lang) => FieldValidity,
  ): FieldValidity => {
    if (isBlank(value) && !touched.has(field)) return ALWAYS_VALID;
    return validate(value, language);
  };

  return {
    operator: ALWAYS_VALID,
    expansionRequired: ALWAYS_VALID,
    expansionDetails: ALWAYS_VALID,
    substationConstructionRequired: ALWAYS_VALID,
    substationOperator: ALWAYS_VALID,
    voltageLevel: numeric("voltageLevel", form.voltageLevel, (t) => validateVoltage(t)),
    lengthInternal: numeric("lengthInternal", form.lengthInternal, validateLength),
    diameterInternal: numeric("diameterInternal", form.diameterInternal, validateDiameter),
    lengthExternal: numeric("lengthExternal", form.lengthExternal, validateLength),
    diameterExternal: numeric("diameterExternal", form.diameterExternal, validateDiameter),
  };
}
```

**Shape change** — `colGridOperatorFormValidation`, a ten-row `{Name, Dirty, Valid}` table primed by `Collect(colGridOperatorFormValidation, Blank())` and maintained by twelve near-identical `OnChange` handlers, becomes one pure function of the form plus a `touched` set. The `touched` set is not a simplification: in the canvas a never-edited blank numeric field keeps the `Valid: true` it was seeded with in `OnVisible`, while a *cleared* one is invalid, and passing an empty set reproduces the pristine form exactly. The five free-text and choice rows are `{Valid: true}` unconditionally in the source and stay so here, which is why a blank Operator never blocks Save. `validateVoltage()` keeps the source's locale-*independent* comma test verbatim — the canvas hard-codes the comma here even though `fn_Numeric` branches on `Language()` — because a German user typing `1,5` into a field the app then reads with `Value()` is the exact failure the guard exists to catch.
**Pinned by** — UT-GRIDOP-007, UT-GRIDOP-008, UT-GRIDOP-009, UT-GRIDOP-018.

##### cmp_GridOperator_Left_Navigation.OnSelect — 23 lines → `shouldPromptOnLeave()`

Decides whether leaving the screen warns first.

```powerfx
If(
    CountRows(
        Filter(
            colGridOperatorFormValidation,
            Dirty = true
        )
    ) > 0,
    UpdateContext({locLeaveGridOperatorConfirmationDialog: true}),
    If(
        Self.SelectedKey <> gblLeftNavigationSelected.ItemKey,
        Set(
            gblLeftNavigationSelected,
            LookUp(
                LeftNavigationMenu,
                ItemKey = Self.SelectedKey
            )
        );
        Navigate(
            gblLeftNavigationSelected.TargetScreen,
            ScreenTransition.Fade
        )
    )
);
```

```typescript
export function dirtyFields(
  form: GridOperatorForm,
  baseline: GridOperatorForm,
): GridOperatorField[] {
  return FIELDS.filter((f) => form[f] !== baseline[f]);
}

export const isDirty = (form: GridOperatorForm, baseline: GridOperatorForm): boolean =>
  dirtyFields(form, baseline).length > 0;

/**
 * Rule 14 — `cmp_PopUp_Leave_GridOperator_Confirmation` fires from the header logo and
 * the left nav whenever `CountRows(Filter(colGridOperatorFormValidation, Dirty)) > 0`.
 *
 * One rule replaces the two duplicated dirty-count checks (step 13). A clean form
 * navigates straight through.
 */
export const shouldPromptOnLeave = (
  form: GridOperatorForm,
  baseline: GridOperatorForm,
): boolean => isDirty(form, baseline);
```

**Shape change** — a `CountRows(Filter(col, Dirty))` probe over a hand-maintained table becomes a diff between the form and the server row, which is what makes the Operator-field defect below impossible rather than merely fixed. The same check was written twice, here and on `cmp_GridOperator_DisplayProjectHeader.OnLogoClick`; both call one rule. `Set(gblLeftNavigationSelected, LookUp(LeftNavigationMenu, …)); Navigate(…)` — a global write followed by a screen jump — becomes a React Router navigation against `PM_NAV`, so the rail's selected item is derived from the location rather than stored beside it and cannot drift out of step with it.
**Pinned by** — UT-GRIDOP-029, UT-GRIDOP-030.

##### pcf_GridOperator_DisplayProjectBodyRightContent_ButtonsReset.OnChange — 17 lines → `toForm()`

Decides what Cancel restores.

```powerfx
Concurrent(
    Reset(txt_GridOperator_DisplayProjectBodyRightContent_GridOperator),
    Reset(txt_GridOperator_DisplayProjectBodyRightContent_GridVoltage),
    Reset(drp_GridOperator_DisplayProjectBodyRightContent_GridExpansionRequired),
    Reset(txt_GridOperator_DisplayProjectBodyRightContent_GridExpansionDetails),
    Reset(drp_GridOperator_DisplayProjectBodyRightContent_SubstationConstruction),
    Reset(txt_GridOperator_DisplayProjectBodyRightContent_SubstationOperator),
    Reset(txt_GridOperator_DisplayProjectBodyRightContent_LengthInternalCabeling),
    Reset(txt_GridOperator_DisplayProjectBodyRightContent_DiameterInternalCabeling),
    Reset(txt_GridOperator_DisplayProjectBodyRightContent_LengthExternalCabeling),
    Reset(txt_GridOperator_DisplayProjectBodyRightContent_DiameterExternalCabeling),
    UpdateIf(
        colGridOperatorFormValidation,
        true,
        {Dirty: false}
    )
)
```

```typescript
/** The bound values, i.e. what Cancel restores. */
export function toForm(record: GridOperatorRecord | null): GridOperatorForm {
  if (!record) return emptyForm();
  return {
    operator: record.operator ?? "",
    voltageLevel: numText(record.voltageLevel, 2),
    expansionRequired: record.expansionRequired,
    expansionDetails: record.expansionDetails ?? "",
    substationConstructionRequired: record.substationConstructionRequired,
    substationOperator: record.substationOperator ?? "",
    lengthInternal: numText(record.lengthInternal, 3),
    diameterInternal: numText(record.diameterInternal, 2),
    lengthExternal: numText(record.lengthExternal, 3),
    diameterExternal: numText(record.diameterExternal, 2),
  };
}
```

**Shape change** — ten per-control `Reset()` calls inside a `Concurrent(...)`, plus a bulk `UpdateIf(col, true, {Dirty: false})`, become one expression with no control coupling; the same function supplies the `baseline` that `dirtyFields()` diffs against, so "what Cancel restores" and "what counts as unchanged" are by definition the same value. The number-to-text direction is where the two display precisions live: `numText(v, 2)` reproduces `If(Int(x)=x, Text(x,"#"), Text(x,"#0.0#"))` for voltage and both diameters, `numText(v, 3)` reproduces `#0.0##` for both lengths, and `formatDecimal` truncates rather than rounds because UT-GRIDOP-005 expects `1.234` from `1.2345`.
**Pinned by** — UT-GRIDOP-026, UT-GRIDOP-028.

#### Security conditions

| Condition | Canvas today | Where it must be enforced |
|---|---|---|
| Editing any field on the Grid Operator tab | `If(Or(IsBlank('Cluster State'.Name), 'Cluster State'.Name = "Draft", con_Milestones_Page_LockMessage_6.Visible), DisplayMode.Disabled, DisplayMode.Edit)` — present on the tab strip and the four Grid Operator controls | `prvWritevsb_gridoperator` plus `prvWritevsb_project` at the role's own scope. `canEditField()` keeps the lock and Draft clauses as UI, and adds `canEdit` so the field is disabled rather than merely unsaveable |
| Editing any field on the Grid Connection tab | **No `DisplayMode` property at all.** Verified by grepping every `DisplayMode:` occurrence in the screen — lines 538, 632, 710, 739, 807, 870, 1508, 1614 — none of which belongs to the six Grid Connection controls. They stay editable on a locked or Draft project; only the disabled tab strip keeps them out of reach, and only for a user not already standing on that tab | The same privilege. `canEditField()` gates every field identically, which is a deliberate divergence flagged for product sign-off; `canEditFieldCanvasParity()` keeps the original reachable |
| Saving | `gblCurrentUser.CanEditSelectedProject` — server-answered, and the only place on the screen that reads it | `prvCreatevsb_gridoperator` for the create arm and `prvWritevsb_gridoperator` for the update arm. `saveGridOperator()` checks the flag and returns a 403 `AppError` **before any request is issued**: a disabled button is a UI convenience, not an authorisation boundary |
| Saving before the project exists | Not checked. `Patch` with a blank `gblRecordSelectedProject` would create an orphan row | `saveGridOperator()` refuses with "The project must be saved on General Data first." when `project.id` is empty, and a synchronous pre-operation plug-in on Create of `vsb_gridoperator` rejects a missing `vsb_ProjectId` binding |
| More than one row per project | Nothing prevents it — the canvas `LookUp` takes the first match and the Save's `IsBlank` test would create a second row if two callers raced | An alternate key or a uniqueness plug-in on `vsb_gridoperator.vsb_ProjectId`. `useGridOperator()` uses `$top=1`, which is a read convention, not a constraint |
| The `Owning Business Unit` stamp | Copied client-side from `gblRecordSelectedProject.'Besitzer (Unternehmenseinheit)'` on every Save, so a caller who can create the row can stamp any BU | A synchronous pre-operation plug-in on Create that derives `owningbusinessunit` from the parent project and ignores the client's value. Ownership drives every row-scope decision downstream |
| Reading the row | `LookUp('Grid Operators', …)` with no scope clause — it relies entirely on Dataverse returning only readable rows | Keep the reliance and make it explicit: `prvReadvsb_gridoperator` at Business Unit scope for `VSB - Project Data Own Country`, User scope for `VSB - Project Manager Own Projects`, Organization scope for `VSB - Project Data All Countries` |
| Reading the project's lock prerequisites | `'Project ID'`, `'End Date'`, `'Total Capacity'`, `'Net Yield p50'` and `'Cluster State'.Name` are ordinary `vsb_project` columns | `prvReadvsb_project`. `pageLock()` is presentation: a user who cannot read the project sees the "no project loaded" entry, which is the correct answer and not an error |
| A hand-edited `?tab=` value | Not applicable — the canvas held the tab in `locGridOperatorTabSelected` | `parseTab()` accepts only `connection` and falls back to `operator`; it cannot throw, and the tab carries no authority — `canEditField()` does not consult it |

#### Deliberate divergences

- **The Grid Connection tab has no `DisplayMode` gating at all** (ambiguity 14). Six controls stay editable under lock and Draft. `canEditField()` gates every field the same way; `canEditFieldCanvasParity()` keeps the canvas behaviour reachable and asserted. Pinned by UT-GRIDOP-022.
- **The Operator field marked the wrong validation row dirty** (ambiguity 12). `txt_…_GridOperator.OnChange` is `UpdateIf(colGridOperatorFormValidation, Name = "GridExpansionRequired", {Valid: true, Dirty: true})`, so editing Operator marked the *Grid expansion required* row and the `"GridOperator"` row seeded in `OnVisible` was never touched again. Save still enabled — any dirty row will do — so the effect was cosmetic, but the row name is plainly wrong. Fixed by construction: dirtiness is a diff. Parity function: `dirtyFieldsCanvasParity()`.
- **The lock banner's `Height` and `Visible` test different columns** (ambiguity 13). `Height` tests `IsBlank('Project Start Date')` for the Milestones slot while `Visible` and the bullet label test `IsBlank('End Date')`, so the banner can be sized for a bullet it does not render. Resolved to `'End Date'`: it is what `Visible` uses, and Project Start Date is legitimately blank for every project whose start cluster is 1 or later, so testing it would lock this screen permanently for every acquired project. Parity function: `pageLockCanvasHeightParity()`.
- **`canSave` omitted the grid-voltage error label.** The canvas Save gate names the four *cabling* error labels and not the voltage one, so an invalid voltage passed Save whenever some other field was dirty and valid. `invalidFields()` covers all five numeric fields. Parity function: `canSaveCanvasParity()`. Pinned by UT-GRIDOP-018.
- **The diameter display format is looser than its own validator.** Display is `#0.0#` (up to two fraction digits) while the validator is `IsOneDecimal`, so a stored `12.75` renders as `12.75` and then fails validation, blocking Save on a value the app wrote itself. Reported rather than widened — whether the column is one decimal or two is a data decision. Covered by the `SOURCE DEFECT — the diameter DISPLAY format is looser than its VALIDATOR` case.
- **`formatDecimal` truncates where Power Fx `Text` rounds.** `Text(1.2345, "#0.0##")` rounds; UT-GRIDOP-005 expects `1.234`. The spec's expectation wins and the deviation is commented at the function.
- **The permission check moved ahead of the request.** The canvas read `CanEditSelectedProject` on the button's `DisplayMode` only. `saveGridOperator()` returns a 403 before any HTTP call. Pinned by UT-GRIDOP-027.
- **No guide screenshot covers this screen.** `GUIDE-PARITY.md` records it plainly: "Grid Operator remains as built in pass 1; no recording covers it." Its layout is therefore inferred from the control tree alone — the one screen in the PM app where the second and third recordings could not confirm the shape. That is a known risk on the slice, not a defect, and it is worth re-checking before the layout conventions this screen establishes are copied onto twenty-two others.

#### Build steps

1. Stand up the platform layer — `powerClient.ts`, `bootstrap.ts`, `dataClient.ts`, `odata.ts`, `errors.ts`, `telemetry.ts` — and prove one authenticated `GET` against `vsb_gridoperator` in the target environment.
2. Add `makeRepository`, `ES.gridOperators`, `qk.child`, and `gridOperatorFullRepo` with the correct fifteen-column projection, checking every logical name against `customizations.xml` rather than against the canvas display names.
3. Write `src/domain/numeric.ts` with its tests, then `src/domain/session.ts`, `src/domain/navigation.ts` and `src/store/appStore.ts`; these are the modules every later screen imports, so they are proved here.
4. Write `src/features/shared/useProjectContext.ts` and confirm `readPrivileges()` returns real answers against a live environment and permissive ones in mock.
5. Write `rules.ts`'s constants and mappers — `GRID_OPERATOR_COL`, `GRID_OPERATOR_LOOKUP`, `CHAR_MAX_LENGTH`, `FIELDS`, `OPERATOR_TAB_FIELDS`, `CONNECTION_TAB_FIELDS`, `MSG`, `TABS`, `YES_NO_UNKNOWN`, `formatDecimal`, `toForm`, `emptyForm`, `numericColumn`, `charCounter`, `choiceLabel`, `parseTab`.
6. Write the lock, gating, validation and button rules — `pageLock`, `pageLockCanvasHeightParity`, `isPageLocked`, `isDraft`, `canEditField`, `canEditFieldCanvasParity`, `canSwitchTabs`, `validateVoltage`, `validateLength`, `validateDiameter`, `validateForm`, `invalidFields`, `validationMessages`, `tabErrorCount`, `dirtyFields`, `dirtyFieldsCanvasParity`, `isDirty`, `shouldPromptOnLeave`, `canSave`, `canSaveCanvasParity`, `saveDisabledReason`, `canCancel`, `buildPayload`.
7. Write `rules.test.ts` to 54 cases covering UT-GRIDOP-001…032 plus both parity twins and the diameter-format defect, and run `npx vitest run src/features/grid-operator`.
8. Write `hooks.ts` — `toGridOperatorProject`, `toGridOperatorRecord`, `useGridOperator`, `useGridOperatorProject`, `saveGridOperator` with the pre-request permission and project-id guards, and `useSaveGridOperator` with its invalidation.
9. Compose `Screen.tsx` from `PageHeader`, `Card`, `CommandBar`, the `TabList`, `NumericInput`, `ConfirmDialog` and `LoadingOverlay`, wire `?tab=` through `useSearchParams`, and verify `npx tsc --noEmit | grep features/grid-operator` is empty.

#### Exit gate

The slice is proved, not the screen: `npx vitest run src/features/grid-operator src/domain` passes all 54 UT-GRIDOP cases plus the domain suites, `npx tsc --noEmit` is clean repo-wide, `npm run build` succeeds, and against a live environment a signed-in user without `prvWritevsb_gridoperator` gets a 403 `AppError` from `saveGridOperator()` **with zero HTTP requests issued** — the read, the create, the update, the privilege probe, the error model and the telemetry all exercised once, end to end, before a second screen is started.

---
### 15. Project Generators Screen — `src/features/generators/`

| | |
|---|---|
| Canvas unit | `PM::Project Generators Screen` (PM app) |
| Power Fx | `359` blocks ≥3 lines · `190` ≥10 · `47` ≥30 · `9286` lines in those blocks (`15931` across all `=` properties) |
| Complexity | band `XL` · score `72.7` · `30` build-days |
| Code app | `Screen.tsx` 1512 ln · `hooks.ts` 1187 ln · `rules.test.ts` 1044 ln · `rules.ts` 1738 ln |
| Pure rules exported | `137` |
| Unit tests | `80` cases · IDs `UT-GEN-001…UT-GEN-056` |
| Dataverse tables | Device Costs, DeviceTypesInProjects, Estimation Price Inflations, GeneratorInProjects, GeneratorTypeInProjects, Generators, HydrogenTypeInProjects, InverterTypeInProjects, Inverters, Land Lease Allocation WTGS, Land Lease Project Costs, Opex Project Costs, PVModuleTypeInProjects, PVModules, Project Plannings, Projects, StorageTypeInProjects, SubstationTypeInProjects, SubstructureTypeInProjects, Substructures |

#### What it does

Seven parallel "type in project" catalogues — WTG, PV module, inverter, substructure, BESS/storage, hydrogen and substation — each a collapsible card with its own right-hand panel, all driven by one command bar whose `Items` table carries every enablement rule. Under the WTG type sits the individual-turbine grid: saving a WTG type materialises N `GeneratorInProjects` rows named `WTG <Short Name>_<n>`, prices them from a five-band price ladder indexed by an inflation series, and rolls the totals up onto the project's Total Capacity — which is the figure the Production screen's page lock and the rail's Production dot both read. A height-limitation gate reads the Planning row written by screen 13 and refuses an over-limit save to anyone but the project manager; an out-of-country model goes through a request-permission flow instead of saving directly. Deleting a type cascades into its turbines, its OPEX costs and its land-lease allocations, cancelling any open permission request first.

This is the **largest UI rebuild in the solution**: 642 control instances and 33 `CodeComponent` (PCF) instances in the canvas screen, against 15,931 lines of Power Fx across 7,406 `=`-prefixed properties. The 30 build-days are dominated by composition, not by logic — `rules.ts` is 1,738 lines and `Screen.tsx` is 1,512.

#### Depends on

- `src/domain/numeric.ts` — `isNumeric`, `isInteger`, `isDecimalWithPlaces`, `inRange`, `parseNumber`, `pfxRound`, `roundUp`, `isBlank`, `isPercentage`, `Lang`. `roundUp` is what `pageCount()` needs; `pfxRound` is what makes the cost-cap messages match the canvas strings.
- `src/domain/paging.ts` — the shared page arithmetic. `pageCount()` stays in the feature only because UT-GEN-053 pins the canvas's `RoundUp(total / size, 0) + If(total = 0, 1, 0)` shape.
- `src/data/entities.ts` — `ES_PLANT` (the plant-side entity sets, including the `substructuretypeinprojects` spelling that is *not* `…typesinprojects`), `CHOICE_PLANT.requestPermissionState` (approved / declined / pending / canceled), `CHOICE_PLANT.moduleType` (the `RequestModulePermission` discriminator: generator 952850000, pvModule 952850001, inverter 952850002, substructure 952850003) and `CHOICE_PLANT.status` (`statecode` 0 / 1).
- `src/data/repos.ts` — `projectFullRepo`, `countryRepo`, `generatorCatalogRepo`, `generatorTypeInProjectFullRepo`, `generatorInProjectFullRepo`, `pvModuleTypeInProjectRepo`, `inverterTypeInProjectRepo`, `substructureTypeInProjectRepo`, `storageTypeInProjectRepo`, `hydrogenTypeInProjectRepo`, `substationTypeInProjectRepo`, `deviceTypeInProjectRepo`, `deviceCostRepo`, `landLeaseAllocationRepo`, `landLeaseCostFullRepo`, `opexProjectCostFullRepo`, `estimationPriceInflationRepo`, `projectPlanningFullRepo` — eighteen repositories, more than any other screen.
- `src/platform/dataClient.ts` — `dataClient.batch` and the `WriteOp` type. Every `ForAll(…, Patch(…))` on this screen becomes one batch; `saveMany` on the turbine repo is the hot path.
- `src/platform/odata.ts` — `f.and`, `f.guid`, `f.eq`, `f.gt`, `asc`.
- `src/flows/flowClient.ts` — `requestModulePermission` (`RequestModulePermission`, disposition `keep`, 122 actions — a long-running approval that owns its own post-approval recalculation) and `cancelModulePermission` (`Requestpermissioncancellation`, disposition `customApi`, 17 actions). Both must exist before the out-of-country path can be built.
- **Screen 13 (Planning)** must be finished first, not merely started: `useProjectPlanning()` reads `vsb_isheightlimitationforwtg` and `vsb_heightlimitationm` from `vsb_projectplanning`, and without that row the height gate is untestable.
- Screen 9 (General Data) supplies `'Project ID'`, `'Short Name'` (the turbine name prefix), FID (the catalogue's phase-out filter) and the country (the availability flag); screen 10 supplies `'Project Start Date'` and `'End Date'`, both of which gate this command bar.
- `src/features/shared/useProjectContext.ts` — the project record and `canEdit`.
- `src/components/` — `PageHeader.tsx`, `Card.tsx`, `CommandBar.tsx`, `FormPanel.tsx`, `ConfirmDialog.tsx`, `LoadingOverlay.tsx`, `DataGrid.tsx`, `GridPager.tsx`, `NumericInput.tsx` (which also exports `PercentageInput` and `CurrencyInput`), `TextFieldWithCount.tsx`, `StateChip.tsx`, `EmptyState.tsx`.
- Dataverse privileges: create/write/delete on each of the seven `*TypeInProjects` tables plus `vsb_generatorinproject`, read on `vsb_generator`, `vsb_inverter`, `vsb_pvmodule`, `vsb_substructure`, `vsb_devicecost` and `vsb_estimationpriceinflation`, and the Run-Only privilege on `RequestModulePermission`.

#### Power Fx → TypeScript

##### pcf_Generators_DisplayProject_Body_Form_CommandBar.OnSelect — 421 lines → `commandBarState()`

Decides, for all seventeen commands at once, what is visible and what is enabled — and dispatches every panel on the screen from one `Switch`.

```powerfx
Switch(
    Text(Self.Selected.ItemKey),
    "addWTGType",
    UpdateContext(
        {
            locIsVisibleRightPanelNewEditGenerator: true,
            locGeneratorCostsPerWtg: 0,
            locSelectedGeneratorEntity: Blank(),
            locSelectedInverterTypeEntity: Blank(),
            locSelectedSubstructureTypeEntity: Blank(),
            locSelectedPvModuleTypeEntity: Blank(),
            locApplyAllWTGcapacities: false,
            locApplyAllWTGHugHeights: false,
            locHeightLimitationApproval: Blank()
        }
    );
    Reset(cmb_Supplier);
    Reset(cmb_Supplier_1);
    Reset(cmb_Supplier_2);
    Reset(txt_GeneratorData_RightPanel_Form_Fields_NumberOfGenerator);
    Reset(txt_GeneratorData_RightPanel_Form_Fields_Cost);
    Reset(txt_GeneratorData_RightPanel_Form_Fields_HubHeight_1);
    ,
// … [398 of the block's 421 lines omitted]
```

```typescript
export function commandBarState(
  ctx: CommandBarContext,
  opts: { fixSubstationPermission?: boolean } = {},
): Record<GeneratorCommandKey, CommandItemState> {
  const p = ctx.project;
  const hasEndDate = !isBlank(p?.endDate);
  const canAdd = ctx.canEdit && hasEndDate;
  const sel = ctx.selection;

  const del = (family: PlantFamily, row: { id: string } | null): CommandItemState => ({
    visible: row !== null,
    enabled: ctx.canEdit && row !== null && ctx.deletePermission[family] === true,
    label:
      family === "wtg" ? "Delete Generator Type"
      : family === "pv" ? "Delete PV Module Type"
      : family === "inverter" ? "Delete Inverter Type"
      : "Delete Substructure Type",
  });

  const substationEnabled =
    sel.substationType !== null || ctx.counts.substation === 0;

  return {
    addWTGType: { visible: true, enabled: canAdd, label: "Add WTG Type" },
    addPVType: {
      visible: true,
      enabled: canAdd,
      label: sel.pvModuleType ? "Edit PV Module Type" : "Add PV Module Type",
    },
    addInverterType: {
      // ItemVisible: false in the source.
      visible: false,
// … [71 lines omitted]
```

**Shape change** — a 421-line string-keyed `Switch` that both *decided* gating and *performed* twenty-odd `Reset()` and `UpdateContext()` side effects splits in two: `commandBarState()` is a pure record of `{visible, enabled, label}` per key, and the panel opening becomes one `PanelState` React reducer (`{family, mode, typeId, turbineId}`) with a single `CLOSED` constant. The seven `col*FormValidation` tables the resets primed are deleted outright. Two source oddities are reproduced rather than tidied: `addInverterType` and `addSubstructureType` ship with `ItemVisible: false` and are unreachable in the canvas, so they stay hidden; and `deletePermission` is a per-family map fed from `RecordInfo(row, RecordInfo.DeletePermission)`, which is the one gating input this screen genuinely asks the server for.
**Pinned by** — UT-GEN-003, UT-GEN-004, UT-GEN-005, UT-GEN-032.

##### pcf_btn_GeneratorData_RightPanel_Form_Buttons_Save.OnChange — 352 lines → `heightBlocksSave()`

Decides whether a WTG type save is allowed to proceed, or must first raise the height-limitation confirmation.

```powerfx
UpdateContext({locNewWtgWillbeAllocated: IsBlank(locSelectedGeneratorEntity)});
If(
    And(
        locProjectPlanning.'Is Height Limitation For WTG',
        IsBlank(locHeightLimitationApproval),
        locProjectPlanning.'Height limitation [m]' < If(
            cmb_Supplier_2.Selected.Height = 0,
            Value(txt_GeneratorData_RightPanel_Form_Fields_HubHeight_1.Value) + 0.5 * locNewGeneratorEntity.'Rotor Diameter',
            Value(locNewGeneratorEntity.'Hub Height') + 0.5 * locNewGeneratorEntity.'Rotor Diameter'
        )
    ),
    UpdateContext({locIsVisibleHeightLimitationApproval: true}),
// … [340 of the block's 352 lines omitted]
```

```typescript
export function heightLimitExceeded(
  planning: ProjectPlanning | null,
  totalHeight: number | null | undefined,
): boolean {
  if (!planning) return false;
  if (!planning.isHeightLimitationForWtg) return false;
  if (planning.heightLimitation === null || planning.heightLimitation === undefined) {
    return false;
  }
  return (totalHeight ?? 0) > planning.heightLimitation;
}

/**
 * `gblRecordSelectedProject.'Project Manager'.Id <> User().EntraObjectId` — inverted.
 * A project manager gets the override confirmation; anybody else cannot save at all.
 */
export function canOverrideHeightLimit(
  project: Pick<GeneratorsProject, "projectManagerId"> | null,
  entraObjectId: string | null | undefined,
): boolean {
  if (!project?.projectManagerId || !entraObjectId) return false;
  return project.projectManagerId === entraObjectId;
}

/** True when the PM-only error label would be visible, i.e. Save must be disabled. */
export function heightBlocksSave(args: {
  planning: ProjectPlanning | null;
  totalHeight: number | null | undefined;
  project: Pick<GeneratorsProject, "projectManagerId"> | null;
  entraObjectId: string | null | undefined;
}): boolean {
  return (
    heightLimitExceeded(args.planning, args.totalHeight) &&
    !canOverrideHeightLimit(args.project, args.entraObjectId)
  );
}
```

**Shape change** — the gate and the height arithmetic separate. `newTurbineHeights()` owns the `If(selectedHeight = 0, typedHubHeight + 0.5 * rotor, catalogHubHeight + 0.5 * rotor)` expression that the canvas inlined inside the comparison, and `heightLimitExceeded()` owns the comparison; `locHeightLimitationApproval`, a tri-state local whose `Blank()` meant "not yet asked", becomes an explicit `heightApproved` argument on the mutation. The crucial change is who may proceed: `canOverrideHeightLimit()` compares `projectManagerId` against `User().EntraObjectId`, so a non-PM's Save button is disabled with `HEIGHT_LIMIT_PM_MESSAGE` rather than opening a confirmation dialog whose only option was to override. The three verbatim-duplicated save bodies behind this gate — `OnChange` plus two `OnConfirm` copies — collapse into one `useSaveGeneratorType()` call site.
**Pinned by** — UT-GEN-044, UT-GEN-045, UT-GEN-046, UT-GEN-056.

##### cmp_PopUp_Confirmation_WTGTypeHeightLimitation.OnConfirm — 327 lines → `generatorTypeTotals()`

Decides what a WTG type row stores: the count, the banded cost per turbine, and the two products derived from them.

```powerfx
IfError(
    With(
        {
            varNumberOfGenerators: Value(txt_GeneratorData_RightPanel_Form_Fields_NumberOfGenerator.Value),
            varCostWTg: Value(txt_GeneratorData_RightPanel_Form_Fields_Cost.Value),
            varSpecificCapacity: If(
                Not(IsBlank(locNewGeneratorEntity.'Specific Capacity')),
                Value(locNewGeneratorEntity.'Specific Capacity'),
                0
            )
        },
        With(
            {
                varCreatedGeneratorEntity: Patch(
                    GeneratorTypeInProjects,
                    If(
                        IsBlank(locSelectedGeneratorEntity),
                        Defaults(GeneratorTypeInProjects),
                        LookUp(
                            GeneratorTypeInProjects,
                            GeneratorTypeInProject = locSelectedGeneratorEntity.GeneratorTypeInProject
                        )
                    ),
                    {
                        Project: gblRecordSelectedProject,
                        Generator: locNewGeneratorEntity,
                        'Number of Generators': varNumberOfGenerators,
                        'Cost per WTG': varCostWTg,
                        'Generators Cost': varNumberOfGenerators * varCostWTg,
                        'Generators Capacity': varNumberOfGenerators * varSpecificCapacity,
                        'Owning Business Unit': gblRecordSelectedProject.'Besitzer (Unternehmenseinheit)'
                    }
                )
            },
// … [293 of the block's 327 lines omitted]
```

```typescript
/**
 * Rule 6, first half — `Switch(Value(numberOfGenerators), 1, '1 WTG price', 2, …,
 * '5 WTG price')`. The default arm means 5 OR MORE all use the `'5 WTG price'` band; so
 * does 0 and any non-numeric count, because `Switch` falls through to the default.
 */
export function wtgPriceBand(
  model: Pick<CatalogModel, "prices">,
  count: number,
): number {
  const idx = count >= 1 && count <= 4 ? count - 1 : 4;
  return model.prices[idx] ?? 0;
}

export function costPerWtg(args: {
  model: Pick<CatalogModel, "prices" | "foundationCostIncluded" | "additionalFoundationCost">;
  count: number;
  accumulatedIndex: number;
}): number {
  const net = wtgPriceBand(args.model, args.count);
  const base = args.model.foundationCostIncluded
    ? net
    : net + (args.model.additionalFoundationCost ?? 0);
  return base * args.accumulatedIndex;
}

/**
 * Rule 8 — `'Generators Cost': count * costPerWtg`,
 * `'Generators Capacity': count * varSpecificCapacity` where a blank specific capacity
 * is coerced to 0 (`If(Not(IsBlank(…)), Value(…), 0)`).
 */
export function generatorTypeTotals(args: {
  count: number;
  costPerWtg: number;
  specificCapacity: number | null | undefined;
}): { generatorsCost: number; generatorsCapacity: number } {
  const cap = args.specificCapacity ?? 0;
  return {
    generatorsCost: args.count * args.costPerWtg,
    generatorsCapacity: args.count * cap,
  };
}
```

**Shape change** — a nested `With` inside `With` inside `IfError`, whose intermediate variables existed only because Power Fx has no local `const`, becomes three composable pure functions: `wtgPriceBand` → `costPerWtg` → `generatorTypeTotals`. The `Switch` fall-through that makes 5-or-more, 0 and any non-numeric count all land on the `'5 WTG price'` band is preserved deliberately and pinned; `If(Not(IsBlank('Specific Capacity')), Value(…), 0)` becomes `?? 0` at the one place it matters. `Patch(T, If(IsBlank(sel), Defaults(T), LookUp(T, id = sel.id)))` — an upsert that re-fetches the row it already had selected — becomes an explicit create/update branch on `p.existing` in `useSaveGeneratorType()`, and the trailing `Select(btn_AutomatedFlow_TriggerWork_ForWTG_PV)` hidden-button dispatch becomes a direct `requestModulePermission()` await.
**Pinned by** — UT-GEN-012, UT-GEN-013, UT-GEN-014, UT-GEN-015, UT-GEN-016, UT-GEN-017.

##### pcf_btn_GeneratorData_RightPanel_Form_Generator_Buttons_Save.OnChange — 374 lines → `planApplyToAll()`

Decides what the three "apply to all WTGs" checkboxes do to the edited turbine's siblings.

```powerfx
        If(
            chk_GeneratorData_RightPanel_Form_Fields_Effective_Capacity_All.Checked,
            With(
                {
                    varFilteredGenerators: Filter(
                        GeneratorInProjects,
                        AsType(
                            ModuleTypeInProject,
                            GeneratorTypeInProjects
                        ).GeneratorTypeInProject = locSelectedGeneratorEntity.GeneratorTypeInProject
                    )
                },
                UpdateIf(
                    GeneratorInProjects,
                    ThisRecord.GeneratorInProject in varFilteredGenerators.GeneratorInProject,
// … [359 of the block's 374 lines omitted]
```

```typescript
export function planApplyToAll(args: {
  siblings: Pick<TurbineRow, "id">[];
  applyCapacity: boolean;
  applyHubHeight: boolean;
  applyFoundationPlinth: boolean;
  effectiveCapacity: number | null;
  hubHeight: number | null;
  foundationPlinth: number | null;
}): { ids: string[]; fields: Record<string, unknown> } | null {
  const fields: Record<string, unknown> = {};
  if (args.applyCapacity) fields[GEN_INSTANCE_COL.effectiveCapacity] = args.effectiveCapacity;
  if (args.applyHubHeight) fields[GEN_INSTANCE_COL.hubHeightExclPlinth] = args.hubHeight;
  if (args.applyFoundationPlinth) {
    fields[GEN_INSTANCE_COL.foundationPlinth] = args.foundationPlinth;
  }
  if (Object.keys(fields).length === 0) return null;
  return { ids: args.siblings.map((s) => s.id), fields };
}
```

**Shape change** — three separate `If(chk_….Checked, With({varFilteredGenerators: Filter(…)}, UpdateIf(GeneratorInProjects, ThisRecord in …, {…})))` blocks, each re-running the same unbounded `Filter` over the whole table and each issuing its own delegation-limited `UpdateIf`, become one function returning `{ids, fields}` — or `null` when no checkbox is ticked, so the mutation issues nothing at all rather than an empty patch. The `AsType(ModuleTypeInProject, GeneratorTypeInProjects)` polymorphic cast disappears: the sibling set is already the page the turbine grid loaded, filtered server-side by the type id. One `saveMany` batch replaces N round trips. The type is then re-derived from its children by `recomputeTypeFromChildren()` rather than from the form, which is what the canvas intended and did inconsistently.
**Pinned by** — UT-GEN-033, UT-GEN-021, UT-GEN-034.

##### Project Generators Screen.OnVisible — 418 lines → `useProjectPlanning()`

Decides what the screen knows before it renders — including the height limitation that the save gate above depends on.

```powerfx
Set(
    gblRecordProjectPlanning,
    LookUp(
        'Project Plannings',
        Project.Project = gblRecordSelectedProject.Project
    )
);
UpdateContext(
    {
        locTemporaryRequestState: Blank(),
        locGeneratorsPageSize: 30,
        //variables for Generators
        locIsVisibleRightPanelNewEditGenerator: false,
// … [405 of the block's 418 lines omitted]
```

```typescript
/** `locProjectPlanning` — the height limitation the save gate reads. */
export function useProjectPlanning(projectId: string | undefined) {
  const q = useQuery({
    queryKey: ["generators", "planning", projectId ?? "none"],
    enabled: Boolean(projectId),
    queryFn: async () => {
      const rows = await projectPlanningFullRepo.byProject(projectId!, {
        select: [
          "vsb_projectplanningid", "vsb_isheightlimitationforwtg", "vsb_heightlimitationm",
        ],
      });
      return rows[0];
    },
    staleTime: 60_000,
  });
  const planning: ProjectPlanning | null = q.data
    ? {
        isHeightLimitationForWtg: bool(q.data["vsb_isheightlimitationforwtg"]),
        heightLimitation: num(q.data["vsb_heightlimitationm"]),
      }
    : null;
  return { planning, isLoading: q.isLoading };
}
```

**Shape change** — an unprojected `LookUp` into a global, re-run on every navigation and read by four different save handlers, becomes a three-column query with a 60-second `staleTime` and a narrowed `ProjectPlanning` type carrying only the two fields the gate uses. The `UpdateContext` block that follows it declares roughly forty `loc*` flags in one statement — panel visibility, selected entities, per-family save-button booleans, confirmation-dialog flags — and every one of them becomes local React state or is deleted with the `col*FormValidation` table it served. `ClearCollect(colGenerators, Generators)`, the whole model catalogue pulled client-side and then re-filtered twice, becomes `useGeneratorCatalog()`: one `$filter` on `vsb_earliestphaseout gt {FID}` and `statecode eq active`, with the country-availability flag computed by `projectCatalog()` because Dataverse cannot filter a multi-select membership cheaply.
**Pinned by** — UT-GEN-001, UT-GEN-002, UT-GEN-006, UT-GEN-007.

#### Security conditions

| Condition | Canvas today | Where it must be enforced |
|---|---|---|
| Adding any equipment type | `And(gblCurrentUser.CanEditSelectedProject, Not(IsBlank('End Date')))` on every Add item — server-answered for the permission half | Create privilege on the relevant `*TypeInProjects` table plus `prvWritevsb_project`. `commandBarState()`'s `canAdd` is `ctx.canEdit && hasEndDate`; the End Date half is sequencing, not security |
| Adding a substation | `addSubstation.ItemEnabled` is the **only** item that omits `CanEditSelectedProject`, so a read-only user can create a substation row (ambiguity 5) | `prvCreatevsb_substationtypeinproject`. The canvas behaviour is reproduced by default; pass `fixSubstationPermission` to `commandBarState()` to conjoin `canEdit` as every sibling does. The privilege is the boundary either way |
| Deleting a type | `RecordInfo(<row>, RecordInfo.DeletePermission)` per family — genuinely server-answered, and the best-behaved gate on the screen | Delete privilege on each `*TypeInProjects` table at Business Unit scope, kept as the boundary. `deletePermission` is a per-family map on `CommandBarContext` |
| Deleting a turbine or a type that would zero the project's capacity | `blocksLastCapacity()`'s canvas equivalent is a client-side comparison of `'Total Capacity' - entityCapacity = 0`, and it is **not applied to inverter or substructure** (ambiguity 6) | Client-side only by design — it is a business warning, not an authorisation rule. `LAST_CAPACITY_GUARDED` names the guarded families explicitly so the omission is visible; if the rule must hold, it belongs in a pre-operation Delete plug-in on `vsb_generatortypeinproject` |
| Saving a turbine over the height limitation | `gblRecordSelectedProject.'Project Manager'.Id <> User().EntraObjectId` decides whether the override confirmation appears. `User().EntraObjectId` is client-supplied identity | `heightBlocksSave()` disables Save for a non-PM, but the real boundary is a synchronous pre-operation plug-in on `vsb_generatorinproject` that re-reads `vsb_projectplanning.vsb_heightlimitationm` and the project's manager server-side. A height limit enforced only in the client is a suggestion |
| Writing the height limitation itself | Owned by screen 13 (`vsb_projectplanning`). Any writer of the planning row can raise or clear the limit and silently unblock every over-height turbine | `prvWritevsb_projectplanning` must not be broader than the override right. This is a cross-screen coupling, and it is the reason screen 13 ships before screen 15 |
| Requesting permission for an out-of-country model | `Select(btn_AutomatedFlow_TriggerWork_ForWTG_PV)` fires `RequestModulePermission`. The flow runs in its own connection context, not the caller's | Run-Only privilege on `RequestModulePermission` granted only to roles that may create equipment, and the flow's own service principal scoped to what it actually writes. `requiresPermissionRequest()` decides *whether*; it never decides *who* |
| Cancelling an open permission request | The canvas calls `Requestpermissioncancellation.Run(...)` and **then** `Remove(...)` with no error handling (ambiguity 10), so a failed cancellation still deletes the row and leaves an orphan approval | Await the cancellation first, and treat its failure as a failed delete. `needsPermissionCancellation()` decides whether one is open; the custom API this flow becomes must be idempotent |
| Stamping `Request Permission State` | Written client-side to `pending` after the flow returns, alongside `vsb_flowrunid` and `vsb_flowapprovalid` | A Field Security Profile over `vsb_requestpermissionstate` with Update granted only to the flow's principal. Otherwise a client can self-approve an out-of-country model by writing the approved value directly |
| The `Owning Business Unit` stamp on eight child tables | Copied client-side from the project on every write | One pre-operation Create plug-in per table deriving `owningbusinessunit` from the parent project and ignoring the client's value |
| Reading the model catalogues | `ClearCollect(colGenerators, Generators)` — the entire `vsb_generator` table, including prices, into every user's session | `prvReadvsb_generator` at Organization scope is unavoidable for a shared catalogue, but the five price columns are commercial terms: put `vsb_wtgprice`…`vsb_wtgprice5` and `vsb_additionalfoundationcost` behind a Field Security Profile and drop them from the projection for roles that only select models |

#### Deliberate divergences

- **Six of the seven equipment panels do not ship complete form fields, and five of them write nothing at all.** This is the largest open item on the screen and it is not hidden: `Screen.tsx` hosts four `FormPanel`s — the WTG type panel, the turbine panel, a real PV Module Type panel, and one shared panel covering **inverter, substructure, storage, hydrogen and substation**. That shared panel renders an explanatory `<Text>` and calls `saveSimple.mutate({ …, fields: {} })`, so a save creates or touches the row and its project roll-up but writes no user input. The *rules* for all five are complete and tested — `inverterCosts`, `substructureCost`, `plantStorageCapacity`, `plantHydrogenCapacity`, `plantSubstationCapacity`, `buildFamilyRollUp`, `buildInverterPermissionPayload`, `buildSubstructurePermissionPayload` — so what remains is form composition, not logic. The PV panel is the worked example of what the other five need: `TextFieldWithCount` for the label, `NumericInput` for capacity, a freeform `Combobox` for supplier and two `PercentageInput`s for degradation, wired through `buildPvTypeFields()` and `validatePvTypeForm()`. Budget the five panels explicitly; they are why the 30 build-days are composition-heavy.
- **The Effective Capacity and Effective Hub Height error labels range-check a control on a different screen** (ambiguity 4). The canvas label reads `fn_Numeric_Production.InRange(txt_Production_DisplayProject_Body_Form_GrossYield.Value, 0.01, 'Specific Capacity')` — the Production screen's gross-yield box — so the range rule never fired against what the user typed. Its sibling `.Visible` references the right control, which is how the intent is known. Corrected. Parity function: `validateEffectiveCapacityCanvasParity()`. Pinned by UT-GEN-052.
- **`addSubstation.ItemEnabled` omits `CanEditSelectedProject`** (ambiguity 5). Reproduced by default, with `commandBarState(ctx, { fixSubstationPermission: true })` as the corrected form, because changing a permission gate silently is worse than naming it.
- **The last-capacity guard is not applied to inverter or substructure** (ambiguity 6). Reproduced, with `LAST_CAPACITY_GUARDED` naming the guarded families so the gap is a constant rather than an accident. Pinned by UT-GEN-036.
- **`'Effective Hub Height'` and `'Effective Hub Height Changed'` writes are commented out in both save handlers, yet the grid still colours a tag from the flag** (ambiguity 7). Not resurrected — inventing the write would make a currently inert tag start lying. The turbine save writes `'Hub Height excl. Foundation Plinth [m]'`, which is what the uncommented line does.
- **The permission cancellation is awaited before the delete** (ambiguity 10). The canvas fires and forgets. `useDeleteGeneratorType()` and `useDeleteTurbine()` await `cancelModulePermission()` and abort the delete on failure. Pinned by UT-GEN-040/041.
- **`colGeneratorTypesPagging` is deleted.** The client-side `{Id, Event, TotalRows, Page, Pages, PageSize}` record per type and its `{Event: "LoadNextPage" & Text(Rand())}` re-render hack are gone; the data layer follows `$skiptoken`. Only `GENERATORS_PAGE_SIZE` (30) and `pageCount()` survive, the latter because UT-GEN-053 pins its `+ If(total = 0, 1, 0)` shape so an empty type still renders one page.
- **Country availability is array membership, not a string trick.** `And(Not(IsBlank(vsb_countryavailability)), Country.Name in Concat(vsb_countryavailability, Value & ","))` compared a country *name* against a list of option-set *values*, which only worked because the two coincide in this data. `isAvailableInCountry()` compares the option value. Pinned by UT-GEN-008.
- **`Add Others` stays a single action.** The second recording shows a dropdown chevron; `CommandBar`'s `Command` type has no submenu, and adding one is a shared-component decision. Recorded in `GUIDE-PARITY.md`.
- **The turbine detail grid expands in place.** GUIDE q07 settled that Generator expands the detail *inside the list* while Production opens a wide slide-over — two patterns that look identical in a screenshot and are not. Built as observed, with the seven observed fields and the verbatim save-confirmation banner (`GENERATOR_TYPE_SAVED_BANNER`).

#### Build steps

1. Finish screen 13 and confirm `vsb_projectplanning.vsb_isheightlimitationforwtg` / `vsb_heightlimitationm` are readable, then add the height plug-in and the `vsb_requestpermissionstate` field security profile from the Security conditions table.
2. Add the eighteen repositories to `src/data/repos.ts` with full projections, plus `ES_PLANT` and `CHOICE_PLANT`, checking every logical name in the five `*_COL` maps against `customizations.xml`.
3. Write `rules.ts`'s catalogue and pricing rules — `isAvailableInCountry`, `isOrderable`, `buildDisplayName`, `projectCatalog`, `isDummySupplier`, `cascadeOptions`, `resolveModel`, `accumulatedIndex`, `wtgPriceBand`, `costPerWtg`, `generatorTypeTotals`, `pvCosts`, `inverterCosts`, `substructureCost`, `catalogTotalHeight`.
4. Write the turbine rules — `turbineIndex`, `buildTurbineNames`, `newTurbineHeights`, `editedTotalHeight`, `recomputeTypeFromChildren`, `planApplyToAll`, `pageCount`, `planTurbineAllocation`, `isNewAllocationNeeded`, `planTurbineDeletion`, `planStatusToggle`.
5. Write the gating, roll-up and validation rules — `pageLock`, `isPageLocked`, `commandBarState`, `eligibleTypes`, `plantWtgTotals`, the five plant-capacity helpers, `buildFamilyRollUp`, `blocksLastCapacity`, `isLastCapacityGuarded`, `heightLimitExceeded`, `canOverrideHeightLimit`, `heightBlocksSave`, `overHeightLimit`, `countOverHeightLimit`, the eight validators with both parity twins, `validateTypeForm`, `canSaveType`, `canSaveTurbine`.
6. Write the permission and flow rules — `permissionStateLabel`, `permissionStateTone`, `requiresPermissionRequest`, `pvRequestsPermission`, the three `build*PermissionPayload` functions, `pendingPermissionFields`, `buildCancellationPayload`, `needsPermissionCancellation`.
7. Write the PV panel rules — `PV_TYPE_COL`, `PV_PANEL_TITLES`, `PV_FIELD_LABELS`, `PV_SUPPLIER_PLACEHOLDER`, `validatePvTypeForm`, `canSavePvType`, `pvSupplierOptions`, `buildPvTypeFields` — as the template the five stub panels will be filled in from.
8. Write `rules.test.ts` to 80 cases covering UT-GEN-001…056 across the thirteen describe blocks, including all three parity twins, and run `npx vitest run src/features/generators`.
9. Write `hooks.ts` — the nine queries, `useSaveGeneratorType` with its one-`saveMany` turbine batch and the `DeviceTypesInProjects` shadow row, `useSaveTurbine`, `useDeleteTurbine`, `useDeleteGeneratorType` with the awaited cancellation, `useToggleTypeStatus`, `useSaveSimpleType`, `useDeleteSimpleType`, `useEntraObjectId`, `useDerivedCostPerWtg`.
10. Compose `Screen.tsx` — the seven cards, the in-place turbine grid with its radio row selector, the four `FormPanel`s, the confirmation dialogs — then fill the five stub panels' fields from the PV template and re-run `npx tsc --noEmit | grep features/generators`.

#### Exit gate

`npx vitest run src/features/generators` passes all 80 cases including UT-GEN-052 (which fails against `validateEffectiveCapacityCanvasParity` and passes against `validateEffectiveCapacity`) and UT-GEN-040/041 (the cancellation is issued before the delete and only when a run is open), `npx tsc --noEmit | grep features/generators` is empty, saving a three-turbine WTG type issues exactly **two** write requests — one type upsert and one `saveMany` batch, not four — and each of the five shared-panel families either writes at least one user-entered column or is signed off as deferred in writing.

---
### 16. Project Production Screen — `src/features/production/`

| | |
|---|---|
| Canvas unit | `PM::Project Production Screen` (PM app) |
| Power Fx | `150` blocks ≥3 lines · `96` ≥10 · `34` ≥30 · `5659` lines in those blocks (`9080` across all `=` properties) |
| Complexity | band `M` · score `43.8` · `17` build-days |
| Code app | `Screen.tsx` 911 ln · `hooks.ts` 810 ln · `rules.test.ts` 1034 ln · `rules.ts` 1414 ln |
| Pure rules exported | `85` |
| Unit tests | `73` cases · IDs `UT-PROD-001…UT-PROD-075` |
| Dataverse tables | Country Inflation Profiles, DeviceTypesInProjects, Energy Yield Generators, Energy Yields, Fabric Job Types, Fabric Sync Jobs, GeneratorInProjects, GeneratorTypeInProjects, Generators, Land Lease Allocation WTGS, Land Lease Periods, Land Lease Project Costs, Opex Project Costs, Opex Subaccounts, PV Negative Prices, PV Seasonality Values, PVModuleTypeInProjects, Project Revenues, Projects |

#### What it does

Energy-yield assessments for one project. A 2×3 summary grid sits above a collapsible list of `Energy Yields` rows; one command bar adds, edits, deletes, activates and deactivates them, opening a wide right-hand slide-over in one of two shapes — WTG, keyed on wind speed at hub height, or PV, keyed on irradiation. Three radio pairs per panel decide which side of each relationship the user types and which side the app derives: gross yield versus irradiation, losses versus net yield p50, and uncertainty versus net yield p75/p90. Two toggles attach a twelve-month seasonality profile and a fifteen-year negative-price curve, both seeded as editable calculated defaults from the Fabric standard tables. Saving rolls the active yields up onto the project as the sum of two averages, and it is that roll-up which writes `'Net Yield p50'` — **the field the left rail reads to unlock Cluster Check List**, and one of the five prerequisites the Planning and Grid Operator page locks test. Above a p50 of zero the screen also generates the project's standard land-lease and O&M contracts, once, and stamps four recalculation flags for a server-side process to pick up.

#### Depends on

- `src/domain/yieldStats.ts` — `p75`, `p90`, `Z`, `NOT_COMPUTABLE`, `uncertaintyFrom`, `calculateUncertaintyCanvasParity`. This is the port of `fn_Calculate_P75_P90` and it is **not** reimplemented in the feature; `derivedP75`/`derivedP90` only convert the percentage to a fraction and the `-1` sentinel to `undefined`.
- `src/domain/numeric.ts` — `isNumeric`, `isInteger`, `isDecimalWithPlaces`, `inRange`, `parseNumber`, `pfxRound`, `isBlank`, `Lang`. `pfxRound` is what makes `Round(total, 1) <> 100.0` behave identically on the seasonality gate.
- `src/domain/dates.ts` — `addMonths`, for the O&M period chaining in `buildOpexContracts`.
- `src/domain/navigation.ts` — `PM_NAV`. The `GeneralDataCheckListKey` item's prerequisite is `(p) => Boolean(p.netYieldP50)`, which is the coupling this screen exists to satisfy; changing the roll-up changes the rail.
- `src/data/entities.ts` — `CHOICE_PRODUCTION.yieldType` (note the non-standard 100/200 values), `.yieldAssessment`, `.yieldAllocation`, the three two-option boolean columns `.productionAllocation` / `.productionLossesP50` / `.productionUncertainty`, `.opexLandLeasePeriod`, `.landLeasePeriod` and `.typeOfContract`. Active/Inactive on a yield is plain `statecode` (`0` / `1`), not a `CHOICE_PRODUCTION` member.
- `src/data/repos.ts` — `projectFullRepo`, `energyYieldFullRepo`, `seasonalityRepo`, `negativePriceRepo`, `projectRevenueNegativePriceRepo`, `opexLandLeaseAssumptionRepo`, `countryInflationProfileRepo`, `opexSubaccountRepo`, `assumptionsRevenuesRepo`, `generatorInProjectFullRepo`, `generatorTypeInProjectFullRepo`, `deviceTypeInProjectRepo`, `landLeaseCostFullRepo`, `landLeasePeriodRepo`, `opexProjectCostFullRepo`, `landLeaseAllocationRepo` — sixteen repositories, plus `ES_PLANT`, `ES_PRODUCTION` and `OANDM_SUBACCOUNT_NAME` from `entities.ts`.
- `src/platform/dataClient.ts` — `dataClient.batch`; the seasonality write, the negative-price write-back and the contract generation are all batches.
- `src/platform/odata.ts` — `f.and`, `f.guid`, `f.eq`.
- **Screen 15 (Generators)** must be finished first: `'Total Capacity'` is the third page-lock bullet and every command on this screen is `And(CanEditSelectedProject, 'Total Capacity' <> 0)`, so nothing on Production is reachable until a generator exists. `useTurbineCount()` also reads `GeneratorTypeInProjects` and then `GeneratorInProjects` for the "Each turbine" allocation multiplier.
- Screens 9 and 10 supply `'Project ID'` and `'End Date'`, the other two lock bullets, plus COD for the inflation start year.
- `src/features/shared/useProjectContext.ts` — the project record and `canEdit`.
- `src/components/` — `PageHeader.tsx`, `StatTile.tsx` (the 2×3 summary grid), `CommandBar.tsx`, `DataGrid.tsx`, `FormPanel.tsx`, `ConfirmDialog.tsx`, `LoadingOverlay.tsx`, `NumericInput.tsx`, `StateChip.tsx`, `EmptyState.tsx`.
- No `src/flows/…` wrapper. `SynchroniseRecalculationCapexStandardCost` is registered in `FLOW_REGISTER` with disposition `missing` — its only reference in the whole app is inside a `/* … */` comment at `Project Production Screen.pa.yaml:9082`, it is absent from `sol/Workflows/` and absent from the app's `References/DataSources.json`, so its behaviour is unrecoverable and is not invented. What replaced it is the four-column flag write immediately after that comment.
- Dataverse privileges: create/write/delete on `vsb_energyyield`, `vsb_pvseasonalityvalues`, `vsb_pvnegativeprices`, `vsb_landleaseperiod`-family and `vsb_opexprojectcost`; write on `vsb_project` for the roll-up; write on `vsb_projectrevenue` for the negative-price synchronisation.

#### Power Fx → TypeScript

##### fn_Calculate_P75_P90.p75 — 11 lines → `p75()`

Decides the p75 exceedance yield from p50 and an uncertainty, and what to return when either is not a number. It lives in `src/domain/yieldStats.ts`, not in the feature, because the canvas original is a shared `CanvasComponent` and its z-scores are a solution-wide constant; today `features/production` is its only consumer.

```powerfx
If(
    And(
        IsNumeric(p50),
        IsNumeric(Uncertainty)
    ),
    Round(
        Value(p50) + (-0.674490 * (Value(p50) * Value(Uncertainty))),
        0
    ),
    -1
)
```

```typescript
/** Standard-normal z-scores the canvas app hard-codes. */
export const Z = { p75: -0.674490, p90: -1.281551 } as const;

export const NOT_COMPUTABLE = -1;

function exceedance(p50: string | number, uncertainty: string | number, z: number): number {
  if (!isNumeric(p50) || !isNumeric(uncertainty)) return NOT_COMPUTABLE;
  const m = parseNumber(p50);
  const u = parseNumber(uncertainty);
  return pfxRound(m + z * (m * u), 0);
}

export const p75 = (p50: string | number, uncertainty: string | number) =>
  exceedance(p50, uncertainty, Z.p75);

export const p90 = (p50: string | number, uncertainty: string | number) =>
  exceedance(p50, uncertainty, Z.p90);
```

```typescript
export function derivedP75(
  p50Value: string | number,
  uncertaintyPercent: string | number,
): number | undefined {
  if (!isNumeric(p50Value) || !isNumeric(uncertaintyPercent)) return undefined;
  const v = p75(p50Value, parseNumber(uncertaintyPercent) / 100);
  return v === NOT_COMPUTABLE ? undefined : v;
}
```

**Shape change** — a canvas component with three `OutputFunction` properties whose parameters are all `DataType: Text` (with string defaults `"1000"`, `"500"`, `"600"`) becomes one shared domain module with numeric-or-string inputs; both z-scores are named constants asserted against the source literals rather than repeated at each call site. Two things are deliberately preserved and one is deliberately fixed. Preserved: the `-1` sentinel, because screens compare the component's *text* output to the string `"-1"` to blank a field — but it is converted to `undefined` at the feature boundary by `derivedP75`/`derivedP90` so it can never leak into a saved figure. Also preserved: uncertainty is always passed as a **fraction**, because the canvas divides the typed percentage by 100 at every call site. Fixed: the sibling `calculateUncertainty` property is `Round((Value(p50) - Value(p75) / Value(p50)*Value(0.674490)), 1)`, which by operator precedence evaluates as `p50 - ((p75/p50) * 0.674490)` — dimensionally not an uncertainty at all. Both of its canvas call sites are commented out, so nothing depends on the broken result; `uncertaintyFrom()` implements the correct inverse `u = (p50 - pX) / (|z| * p50)` and `calculateUncertaintyCanvasParity()` keeps the shipped formula asserted.
**Pinned by** — UT-PROD-005, UT-PROD-006, UT-PROD-007, UT-PROD-008; and in the domain suite UT-DOM-020, UT-DOM-021, UT-DOM-022, UT-DOM-023, UT-DOM-024, UT-DOM-025, UT-DOM-026, UT-DOM-027, UT-DOM-028.

##### btn_Load_StandardContracts_For_Project.OnSelect — 1104 lines → `projectYieldTotals()`

Decides the project's `'Net Yield p50'` — the single number that unlocks Cluster Check List on the rail and clears the Production bullet on the Planning and Grid Operator page locks.

```powerfx
ClearCollect(
    colEnergyYieldsInProjectToCalcWTG,
    Filter(
        colEnergyYieldsInProject,
        Type = 'Yield Type'.WTG,
        Status = 0
    )
);
            'Net Yield p50': IfError(
                Average(
                    colEnergyYieldsInProjectToCalcWTG,
                    'Net Yield p50 [MWh]'
                ),
                0,
                Average(
                    colEnergyYieldsInProjectToCalcWTG,
                    'Net Yield p50 [MWh]'
                )
            ) + IfError(
                Average(
                    colEnergyYieldsInProjectToCalcPV,
                    'Net Yield p50 [MWh]'
                ),
                0,
                Average(
                    colEnergyYieldsInProjectToCalcPV,
                    'Net Yield p50 [MWh]'
                )
            ),
// … [1075 of the block's 1104 lines omitted]
```

```typescript
/** `IfError(Average(t, f), 0, Average(t, f))` — an empty table averages to 0. */
function avg(rows: EnergyYieldRow[], pick: (r: EnergyYieldRow) => number | null): number {
  if (rows.length === 0) return 0;
  const total = rows.reduce((s, r) => s + (pick(r) ?? 0), 0);
  return total / rows.length;
}

/**
 * Rule 16 — the project roll-up is the SUM OF TWO AVERAGES over the active WTG yields and
 * the active PV yields. `'Wind Speed at Hub Height [m/s]'` is the WTG average only;
 * `'Irradiation [kWh/kWp]'` the PV average only. `Status = 0` is Active.
 *
 * The caller passes rows already filtered by type; `projectYieldTotals` re-applies the
 * active filter so the rule cannot be defeated by a sloppy caller.
 */
export function projectYieldTotals(
  wtgYields: EnergyYieldRow[],
  pvYields: EnergyYieldRow[],
): ProjectYieldTotals {
  const wtg = wtgYields.filter((y) => y.status === 0);
  const pv = pvYields.filter((y) => y.status === 0);
  return {
    grossYield: avg(wtg, (r) => r.grossYield) + avg(pv, (r) => r.grossYield),
    netP50: avg(wtg, (r) => r.netYieldP50) + avg(pv, (r) => r.netYieldP50),
    netP75: avg(wtg, (r) => r.netYieldP75) + avg(pv, (r) => r.netYieldP75),
    netP90: avg(wtg, (r) => r.netYieldP90) + avg(pv, (r) => r.netYieldP90),
    windSpeed: avg(wtg, (r) => r.windSpeed),
    irradiation: avg(pv, (r) => r.irradiation),
  };
}
```

**Shape change** — 1,104 lines of hidden button, reachable only through `Select(...)` and used as a subroutine by four different handlers, split into five pure functions returning payloads (`projectYieldTotals`, `shouldGenerate`, `buildLandLeaseContracts`, `buildOpexContracts`, `markForCapexRecalculationFields`) plus one `useRecalculateProject()` mutation that issues them in the canvas's order. `IfError(Average(t, f), 0, Average(t, f))` — an idiom that evaluates the same average twice because Power Fx has no null-coalescing form — becomes an explicit empty-table guard in `avg()`, and the "sum of two averages" shape is preserved deliberately rather than being corrected to a weighted mean: it is what the field means today and every downstream figure is calibrated against it. The `Status = 0` active filter is re-applied inside the function so the rule cannot be defeated by a caller that pre-filtered wrongly. The `ForAll` inside `ForAll` inside `ForAll` of the contract generator is flattened, and `Refresh('Land Lease Periods')` plus its three siblings become TanStack invalidations.
**Pinned by** — UT-PROD-017, UT-PROD-018, UT-PROD-019, UT-PROD-020, UT-PROD-038, UT-PROD-039.

##### pcf_btn_GeneratorData_RightPanel_Form_PvModuleType_Buttons_Save_1.OnChange — 392 lines → `deriveYieldFields()`

Decides what "Each turbine" means: which four yield figures are multiplied by the turbine count, and which two are blanked.

```powerfx
                'Gross Yield [MWh]': If(
                    rad_ProductionDataWTG_Allocation.Selected.Value = 'Yield Allocation'.'Each turbine',
                    CountIf(
                        colGeneratorsInProjectsTemporary,
                        true
                    ) * Value(txt_ProductionDataWTG_GrossYield.Value),
                    Value(txt_ProductionDataWTG_GrossYield.Value)
                ),
                'Total losses [%]': If(
                    rad_ProductionDataWTG_Allocation.Selected.Value = 'Yield Allocation'.'Each turbine',
                    Blank(),
                    Value(txt_ProductionDataWTG_TotalLosses.Value)
                ),
                'Net Yield p50 [MWh]': If(
                    rad_ProductionDataWTG_Allocation.Selected.Value = 'Yield Allocation'.'Each turbine',
                    CountIf(
                        colGeneratorsInProjectsTemporary,
                        true
                    ) * Value(txt_ProductionDataWTG_NetYieldP50.Value),
                    Value(txt_ProductionDataWTG_NetYieldP50.Value)
                ),
                'Uncertainty [%] ': If(
                    rad_ProductionDataWTG_Allocation.Selected.Value = 'Yield Allocation'.'Each turbine',
                    Blank(),
                    Value(txt_ProductionDataWTG_Uncertainty.Value)
                ),
// … [366 of the block's 392 lines omitted]
```

```typescript
export function deriveYieldFields(
  input: YieldFormInput,
  allocation: YieldAllocation,
  turbineCount: number,
): DerivedYieldFields {
  const each = allocation === "Each turbine";
  const mul = (v: number | null) => (v === null ? null : each ? turbineCount * v : v);
  return {
    grossYield: mul(input.grossYield),
    netP50: mul(input.netP50),
    netP75: mul(input.netP75),
    netP90: mul(input.netP90),
    totalLosses: each ? undefined : input.totalLosses ?? undefined,
    uncertainty: each ? undefined : input.uncertainty ?? undefined,
    windSpeed: input.windSpeed,
    irradiation: input.irradiation,
  };
}
```

**Shape change** — the same `If(allocation = 'Each turbine', CountIf(col, true) * Value(x), Value(x))` conditional written out six times, with `CountIf(colGeneratorsInProjectsTemporary, true)` re-counting a client-side collection on each of them, becomes one `mul` closure over a `turbineCount` supplied once. `useTurbineCount()` resolves it with two server-filtered reads — the project's type ids, then `f.inList("_vsb_moduletypeinprojectid_value", ids)` over `GeneratorInProjects` projected to id and name — instead of counting a client-side collection at each of six call sites. `Blank()` for the two blanked fields becomes `undefined` rather than `null`, which is what keeps them out of the PATCH body entirely instead of writing an explicit null. The bigger change is that this block existed **twice** — the WTG save at 392 lines and the PV save at 339 — and the two are not equivalent: the PV save writes the typed values straight through with no allocation branch at all. `deriveYieldFields` covers both, because PV is exactly the "Whole plant" arm, and the two 300-plus-line panels collapse into one `YieldPanel` parameterised by technology.
**Pinned by** — UT-PROD-013, UT-PROD-014, UT-PROD-015.

##### pcf_ProjectRevenues_Content_ContractCommandBar_1.OnSelect — 560 lines → `commandBarState()`

Decides which of the seven commands are visible and enabled, and — in the canvas — resets twenty-five controls and seeds both editors before dispatching.

```powerfx
// 1. Initial State Reset for all possible Form Controls
Reset(rad_ProductionDataWTG_Assesment);
Reset(txt_ProductionDataWTG_Description);
// 2. Global Pre-Fetch (SQL Cache & Control Cleanup)
//Select(btn_Seasonality_NegatovePrice_Reset_Hidden);
// 3. Command Switch Logic
Switch(
    Text(Self.Selected.ItemKey),
    // CASE: Create New WTG
    "newProductionWTG",
    UpdateContext(
        {
            locShowWTGProdForm: true,
            locSelectedEnergyYield: Blank(),
            locTotalLoses: 15,
            locNetYield50: Blank(),
            locNetYieldP90: Blank(),
            locUncertaintyValue: 10,
            locNetYieldP75: Blank(),
            locSelectedWTGSeasonalityYieldRecord: Blank()
        }
    );
// … [538 of the block's 560 lines omitted]
```

```typescript
export function commandBarState(ctx: {
  canEdit: boolean;
  project: ProductionProject | null;
  selected: EnergyYieldRow | null;
}): Record<ProductionCommandKey, CommandItemState> {
  const capacityOk = (ctx.project?.totalCapacity ?? 0) !== 0;
  const enabled = ctx.canEdit && capacityOk;
  const sel = ctx.selected;
  const hasStatus = sel !== null;
  return {
    newProductionWTG: { visible: true, enabled, label: "Add Production WTG" },
    newProductionPV: { visible: true, enabled, label: "Add Production PV" },
    editProductionWTG: {
      visible: sel?.type === CHOICE_PRODUCTION.yieldType.wtg,
      enabled,
      label: "Edit",
    },
    editProductionPV: {
      visible: sel?.type === CHOICE_PRODUCTION.yieldType.pv,
      enabled,
      label: "Edit",
    },
    deleteProductionItem: { visible: sel !== null, enabled, label: "Delete" },
    activateProdItem: {
      visible: hasStatus && sel.status !== 0,
      enabled,
      label: "Activate Production",
    },
    deactivateProdItem: {
      visible: hasStatus && sel.status !== 1,
      enabled,
      label: "Deactivate Production",
    },
  };
}
```

**Shape change** — gating separates from dispatch. Every one of the seven `Items` rows is `And(CanEditSelectedProject, 'Total Capacity' <> 0)` with no exceptions, so `enabled` is computed once; visibility is per-row and reproduces the source's quirk that `activateProdItem.ItemVisible` is `Status <> Active && !IsBlank(Status)` and its twin `Status <> Inactive && !IsBlank(Status)`, which means with no selection **both** are hidden because a blank `Status` fails the second conjunct. The twenty-five `Reset()` calls become nothing at all — the panel is a controlled React form seeded from the row, so there is no residue to clear — and `locTotalLoses: 15` / `locUncertaintyValue: 10` become the `NEW_YIELD_DEFAULTS` constant. The commented-out `//Select(btn_Seasonality_NegatovePrice_Reset_Hidden)` hidden-button call is not resurrected.
**Pinned by** — UT-PROD-002, UT-PROD-003, UT-PROD-004.

##### tgl_ProductionDataWTG_ConsiderSeasonality.OnCheck — 107 lines → `buildSeasonalityRows()`

Decides the twelve monthly distribution values a newly enabled seasonality profile opens with, and marks every one of them a calculated default.

```powerfx
ClearCollect(
    colWTGSeasonalityValues,
    ForAll(
        Sequence(
            12,
            1
        ),
        With(
            {rec: ThisRecord},
            {
                ID: rec.Value,
                Month: Text(
                    Date(
                        Year(Today()),
                        rec.Value,
                        1
                    ),
                    "[$-en-US]mmmm"
                ),
                Value: LookUp(
                    colStandardSeasonalityYeild,
                    Month = rec.Value
                ).WTG,
                IsStandard: true,
// … [83 of the block's 107 lines omitted]
```

```typescript
export function buildSeasonalityRows(
  standard: StandardSeasonalityRow[],
  technology: Technology,
): SeasonalityRow[] {
  return MONTH_NAMES.map((month, i) => {
    const row = standard.find((s) => s.month === i + 1);
    const value = row ? (technology === "PV" ? row.pv : row.wtg) : 0;
    return { id: i + 1, month, value: value ?? 0, isStandard: true };
  });
}

/**
 * Rule 11 — editing ANY month clears the standard flag on ALL TWELVE:
 * `UpdateIf(col, IsStandard = true, {IsStandard: false})` runs before the per-row patch.
 */
export function applyMonthEdit(
  rows: SeasonalityRow[],
  id: number,
  value: number,
): SeasonalityRow[] {
  return rows.map((r) => ({
    ...r,
    isStandard: false,
    value: r.id === id ? value : r.value,
  }));
}
```

**Shape change** — two 107-line handlers that differ only in reading `.WTG` versus `.PV` (and whose first 71 lines are a commented-out `Concurrent` of twenty-four `locJan_WTG_Val`-style per-month context variables) become one function parameterised by technology. The twelve loose `loc<Month>_<Tech>_Val` and twelve `loc<Month>_<Tech>_IsStandard` variables — forty-eight in total across both technologies — become a twelve-element typed array. `Text(Date(Year(Today()), n, 1), "[$-en-US]mmmm")`, which derives a month name from today's date purely to get a label, becomes the `MONTH_NAMES` constant. A month missing from the standard table seeds `0` and stays `isStandard: true`, matching the canvas exactly: `LookUp` returns blank and `Value()` coerces it to 0. The per-month flags survive to Dataverse only as the `'Standard Values JSON'` string, which `serialiseStandardValuesJson()` builds — the canvas used `Text(bool)`, which happens to emit lowercase `true`/`false` and so happens to be valid JSON.
**Pinned by** — UT-PROD-021, UT-PROD-030, UT-PROD-022, UT-PROD-027.

#### Security conditions

| Condition | Canvas today | Where it must be enforced |
|---|---|---|
| Every command on the screen | `And(gblCurrentUser.CanEditSelectedProject, 'Total Capacity' <> 0)` on all seven items, without exception. The permission half is genuinely server-answered in `OnVisible` | `prvCreatevsb_energyyield`, `prvWritevsb_energyyield` / `prvDeletevsb_energyyield` at Business Unit scope, plus `prvWritevsb_project` for the roll-up. `commandBarState()` reads `canEdit` from `useProjectContext()`; the capacity half is sequencing, not security |
| Saving, deleting or (de)activating a yield | Gated by the command bar only. **`hooks.ts` on this screen carries no pre-request permission check** — unlike `grid-operator/hooks.ts`, which refuses with a 403 `AppError` before issuing anything. That is a gap in the rebuild, not only in the canvas | Dataverse privileges above are the boundary and will refuse the write. The gap to close is the *client* one: add the same `if (!canEdit) return err(toAppError({ status: 403, … }))` guard to `useSaveEnergyYield`, `useDeleteEnergyYield` and `useSetYieldStatus` that `saveGridOperator()` already has, so a disabled button is never the only thing standing between a reader and a PATCH |
| Writing the project roll-up | `Set(gblRecordSelectedProject, Patch(Projects, gblRecordSelectedProject, {'Net Yield p50': …, …}))` inside a hidden button. Six project columns written client-side from client-side averages | `prvWritevsb_project`. This is the screen's highest-value write: `'Net Yield p50'` unlocks Cluster Check List on the rail and clears the Production bullet on three page locks, so a caller who can write it can advance the project's gating. It belongs in a synchronous post-operation plug-in on `vsb_energyyield` that recomputes the averages server-side; until then, treat the six roll-up columns as a Field Security Profile whose Update is granted with the same care as an approval |
| Generating the standard contracts | `If(p50 > 0 && 'Standard Cost Created' = No, …)` — a one-shot flag test, client-side, before creating land-lease periods, allocations and O&M cost rows across five tables | Create privileges on each target table, plus a uniqueness or pre-operation guard on `vsb_project.vsb_standardcostcreated` so two concurrent callers cannot both pass `shouldGenerate()` and double-generate. `shouldGenerate()` is a client-side gate on a race the server has to settle |
| The four recalculation flags | `InitialP50Trigger = Yes` plus `CapexStandardContractsCreated`, `CapexStandardCostsCreated` and `BoPStandardContractsCreated` set to `No`, written client-side. A server-side process (most plausibly `LoadDevexCapexCostTotalCapacityTrigger`, which does ship) picks them up | A Field Security Profile over the four columns, Update granted to the roles that may trigger a recalculation and to the picking-up process. Writing `InitialP50Trigger` is scheduling server work; it is not a form field |
| The Fabric sync write | `Patch('Fabric Sync Jobs', …)` and the `SynchroniseRecalculationCapexStandardCost` call are both **inside a `/* … */` comment**, and the flow is absent from the solution export and from `References/DataSources.json` | Nothing to enforce and nothing to build. `markForCapexRecalculationFields()` is what actually replaced it; `FLOW_REGISTER` records the flow as `missing` so calling it throws a named `AppError` rather than failing silently |
| The negative-price synchronisation reaching `Project Revenues` | The same block appears verbatim **four times** (WTG save, PV save, activate/deactivate confirm, delete confirm) and writes `vsb_projectrevenue.considerNegativePrices` on rows this screen does not own | `prvWritevsb_projectrevenue`. `syncRevenueNegativePrices()` never touches a row with `manualOverride = Yes`, which is the only thing protecting a revenue analyst's deliberate choice from a production edit — that exclusion is a business control and belongs in a plug-in, not in one client function called from four places |
| Seasonality and negative-price rows | Children of `vsb_energyyield` through `vsb_PVEnergyYield`. Both tables hold **WTG data as well as PV** despite their names (ambiguity 3); the discriminator is the parent's `vsb_type` | Create/write on `vsb_pvseasonalityvalues` and `vsb_pvnegativeprices`, cascading from the parent yield's ownership. The naming is legacy and must not be read as a scope boundary |
| The `Owning Business Unit` stamp | Copied client-side from `gblRecordSelectedProject.'Besitzer (Unternehmenseinheit)'` on every yield write | A pre-operation Create plug-in on `vsb_energyyield` deriving `owningbusinessunit` from the parent project |
| Reading the Fabric standard assumptions | `Refresh('OPEX & Land Lease Standard Assumptions')` then an unfiltered read | Read privilege on the assumption table at Organization scope, with `opexLandLeaseAssumptionRepo` filtering server-side on country and technology. `parseFabricNumber()` treats every value as untrusted text and `UT-PROD-058` pins that a Fabric failure degrades to zero-valued rows rather than throwing |

#### Deliberate divergences

- **`fn_Calculate_P75_P90.calculateUncertainty` is mathematically wrong** (ambiguity 2). `Round((Value(p50) - Value(p75) / Value(p50)*Value(0.674490)), 1)` evaluates as `p50 - ((p75/p50) * 0.674490)`, which is not an uncertainty. Both canvas call sites are commented out, so nothing depends on it and neither replacement is reachable from this screen. `uncertaintyFrom()` implements the correct inverse and `calculateUncertaintyCanvasParity()` asserts the shipped result. Pinned by UT-DOM-028.
- **`PV Seasonality Values` and `PV Negative Prices` hold WTG data too** (ambiguity 3). Nothing in the schema distinguishes them; the discriminator is the parent yield's `vsb_type`. Reproduced as-is, with the repository named `seasonalityRepo` rather than `pvSeasonalityRepo` so the code does not repeat the misleading name. Renaming the tables is a data decision.
- **The total-losses `0–100` branch shows the wrong message.** Its own message is commented out in the source, so the branch falls through to the "Gross Yield > Net Yield p50" text. Reproduced verbatim because it is user-facing and support tickets quote it. Pinned by UT-PROD-011.
- **The decimal separator comes from `Intl`, not from `Mid(Text(1.1, "0.0", Language()), 2, 1)`.** `decimalSeparatorFor()` asks the platform. Pinned by UT-PROD-024 and UT-PROD-057.
- **The summary tiles blank rather than zero.** GUIDE q12 shows an empty field, not `0`, when a total has no contributing yield; `fmtSummaryValue()` returns `""` for a zero total, and the six `SUMMARY_LABELS` are verbatim with their units, in the screenshot's 2×3 order.
- **Two kinds of calculated value, styled differently.** Seasonality's monthly `Distribution [%]` and Negative Prices' yearly `Reduction [%]` are *editable calculated defaults* — italic blue, each individually resettable via `resetNegativePriceRow()`. `Total Sum [%]` is a *read-only computed total* — plain, bold, formatted by `fmtPercentTotal()`, which drops a trailing `.0` as the recording shows. The first guide pass had established one treatment for derived values on Milestones; this pass had to split it into two.
- **Production's slide-over scrolls sideways rather than widening.** `FormPanel`'s drawer is a fixed `min(560px, 100vw)` and the panel's columns appear progressively as toggles are switched on. A `wide` variant belongs in `src/components`; recorded in `GUIDE-PARITY.md` as an open shared-component gap.
- **`NumericInput` carries no `className` passthrough**, so the calculated-default cells use a local field wrapper to get the italic-blue treatment. Same fix location as above.
- **Records render as collapsible rows, not grid rows.** `productionRowLabel()` produces `Production - {description}` and `productionStatusLabel()` produces the Active/Inactive chip, which is deliberately distinct from `assessmentLabel()`'s Internal/External chip — two chips on the same row meaning different things.
- **No `src/flows/…` wrapper is created for `SynchroniseRecalculationCapexStandardCost`.** Its behaviour is unrecoverable from the export and is not invented. `markForCapexRecalculationFields()` writes the four flags the canvas wrote immediately after the commented block, and the app does not wait for a result. Pinned by UT-PROD-048/049, which assert the flags are written and no flow is invoked.
- **The four duplicated revenue-sync blocks become one function.** `syncRevenueNegativePrices()` is called from all four sites, so the manual-override exclusion cannot drift between them. Pinned by UT-PROD-033, UT-PROD-034, UT-PROD-035, UT-PROD-036/037.

#### Build steps

1. Finish screen 15 and confirm `vsb_project.vsb_totalcapacity` is non-zero for the test project, then add the roll-up field security profile and the `vsb_standardcostcreated` concurrency guard from the Security conditions table.
2. Extend `src/domain/yieldStats.ts` if needed and run `npx vitest run src/domain/yieldStats.test.ts` — UT-DOM-020…028 must pass before any feature code exists, because every yield figure on the screen depends on them.
3. Add the sixteen repositories and `CHOICE_PRODUCTION` to `src/data`, checking `YIELD_COL`, `SEASONALITY_COL`, `NEGATIVE_PRICE_COL`, `REVENUE_COL` and `PROJECT_YIELD_COL` against `customizations.xml`.
4. Write the yield maths and mode rules — `derivedP75`, `derivedP90`, `totalLossesPct`, `NEW_YIELD_DEFAULTS`, `deriveYieldFields`, `radioFields`, `supersededInternalYields`, `projectYieldTotals`, `projectYieldFields`.
5. Write the editor rules — `buildSeasonalityRows`, `applyMonthEdit`, `seasonalityTotal`, `isSeasonalityValid`, `serialiseStandardValuesJson`, `deserialiseStandardValuesJson`, `seasonalityFields`, `buildNegativePriceRows`, `planNegativePriceWrites`, `negativePriceFields`, `resetNegativePriceRow`, `syncRevenueNegativePrices`.
6. Write the validation, locale and gating rules — `decimalSeparatorFor`, `parseFabricNumber`, `normaliseAmount`, `validateTotalLosses`, `validateUncertainty`, `validateNetYieldP50`, `validateNetYieldP75`, `validateNetYieldP90`, `validateCellPercent`, `canSaveYield`, `hasUnsavedChanges`, `pageLock`, `isPageLocked`, `commandBarState`.
7. Write the generation rules — `shouldGenerate`, `inflationStartYear`, `resolveInflation`, `toLandLeasePeriod`, `buildLandLeaseContracts`, `buildOpexContracts`, `markForCapexRecalculationFields` — plus the GUIDE q12–q16 display rules `SUMMARY_LABELS`, `fmtSummaryValue`, `productionRowLabel`, `productionStatusLabel`, `fmtPercentTotal`.
8. Write `rules.test.ts` to 73 cases covering UT-PROD-001…075 across the fourteen describe blocks, and run `npx vitest run src/features/production`.
9. Write `hooks.ts` — the eleven queries, `useSaveEnergyYield`, `useDeleteEnergyYield`, `useSetYieldStatus` (each with the 403 guard named in the Security conditions table), `useSeasonalityEditor`, `useNegativePriceEditor`, and `useRecalculateProject` with its three ordered phases.
10. Compose `Screen.tsx` from `PageHeader`, the 2×3 `StatTiles`, `CommandBar`, the collapsible record rows, the progressive-column slide-over, and the two confirmation dialogs, then verify `npx tsc --noEmit | grep features/production` is empty.

#### Exit gate

`npx vitest run src/features/production src/domain/yieldStats.test.ts` passes all 73 UT-PROD cases plus UT-DOM-020…028, `npx tsc --noEmit | grep features/production` is empty, and the coupling is demonstrated end to end: saving one active WTG yield with a net p50 above zero writes `vsb_netyieldp50` on `vsb_project` and the left rail's Cluster Check List item changes state on the next render — with `useSetYieldStatus` rejecting a status change from a user without `prvWritevsb_energyyield` **before** the request is issued, not after Dataverse refuses it.

---
### 17. Project Revenues Screen — `src/features/revenues/`

| | |
|---|---|
| Canvas unit | `PM::Project Revenues Screen` (PM app) |
| Power Fx | `216` blocks ≥3 lines · `122` ≥10 · `53` ≥30 · `7486` lines in those blocks (`11769` across all `=` properties) |
| Complexity | band `L` · score `45.4` · `23` build-days |
| Code app | `Screen.tsx` 1065 ln · `hooks.ts` 634 ln · `rules.test.ts` 1030 ln · `rules.ts` 1642 ln |
| Pure rules exported | `126` |
| Unit tests | `102` cases · IDs `UT-REV-001…UT-REV-072` |
| Dataverse tables | Balancing Prices, Country Inflation Profiles, Energy Yields, Project Revenues, Projects, RevenueIndividualHedgeVolumes, Tarrif Price Standard Assumptions |

#### What it does

Two tabs over one project. `Contracted Revenue` lists the project's `Project Revenues` rows — FiT, PPA, CfD, and the German EEG variant — and `Balancing Prices` lists a chronological chain of balancing-price periods, each period starting the day after the previous one ends. Adding or editing a revenue contract opens a right panel whose every field is first *derived* from `Assumptions Revenues SQL` for the project's country and technology, then optionally overridden by the user; each field carries its derived value, its live value and a standardness flag, and standardness drives both persistence and typography. Saving writes the contract, its individual hedge volumes and — for the balancing tab — the period row, and the hedged-volume path first proves that no month of the contract's term pushes the project's total hedge above 100 %. The whole screen is locked behind a five-part data-completeness gate shared verbatim with Project Finance.

#### Depends on

- `src/features/shared/useProjectContext.ts` — `useProjectContext()`, `readPrivileges()`, `toSelectedProject()`. This is the port of the `Set(gblRecordSelectedProject, LookUp(Projects, …)); Set(gblCurrentUser, Patch(…, {CanEditSelectedProject: …}))` idiom that opens the canvas `OnVisible`, and it is the only source of `canEdit` on this screen.
- `src/domain/numeric.ts` — `parseNumber`, `isNumeric`, `isInteger`, `inRange`, `isDecimalWithPlaces`, `isValidCurrency`, `isBlank`, `langRoot`, `decimalSeparator`, `pfxRound`, `Lang`. `langRoot` and `decimalSeparator` are what make `assumptionNumber` reproduce rule 12's locale dance; `pfxRound` is what keeps the two-decimal tariff identical to `Round(x, 2)`.
- `src/domain/dates.ts` — `addDays`, `addMonths`, `addYears`. The contract end date is years-then-months-then-minus-one-day; the balancing end date is months-only. The two are deliberately different functions.
- `src/domain/session.ts` — `canEditSelectedProject()`, and `CurrentUser.canEditSelectedProject`, which starts `false` and is set per record.
- `src/data/entities.ts` — `ES_FINANCE.projectRevenues`, `.balancingPrices`, `.revenueIndividualHedgeVolumes`, `.assumptionsRevenues`-equivalent via `ES.assumptionsRevenues`, and `CHOICE_FINANCE.periods` (`period1`…`period10`), which `nextPeriodValue` indexes. `Status` on `Project Revenues` is `statecode` (`0` Active, `1` Inactive), not a custom picklist.
- `src/data/repos.ts` — `projectFullRepo`, `projectRevenueFullRepo`, `balancingPriceRepo`, `revenueHedgeVolumeRepo`, `assumptionsRevenuesRepo`, `countryInflationProfileRepo`, `energyYieldFullRepo`, `currencyRepo`, `revenueSubaccountRepo`.
- `src/data/queryKeys.ts` — `qk`; every key on this screen carries the project id, which is what replaces the canvas `OnHidden` teardown.
- `src/platform/odata.ts` — `f.and`, `f.or`, `f.eq`, `f.guid`, `f.inList`, `asc`. The Italian two-country assumption slice is an `f.or` pushed into `$filter`, not a client-side filter.
- `src/platform/dataClient.ts` — `dataClient.batch` and the `WriteOp` type. The contract upsert, the `RevenueIndividualHedgeVolumes` rows and the `RemoveIf` of the volumes it replaces go in ONE changeset, so a contract can no longer be saved with its volumes deleted.
- `src/platform/errors.ts` — `toAppError`, `AppError`; the canvas `IfError(…, Notify(…))` swallow is replaced by a surfaced error.
- **Screen 16 (Production)** must be finished first. `'Net Yield p50'` is the fourth page-lock bullet, it is the cap in `validateHedgedVolume`'s fixed-volume sibling (`validateVolumeMwh`), and `negativePriceState` reads `Energy Yields` for an ACTIVE row with `'Consider Negative Prices' = Yes` — with no such row the toggle is permanently disabled.
- Screens 9, 10 and 15 supply the other four lock bullets (`'Project ID'`, `'End Date'`, `'Total Capacity'`, `'Cluster State'`) and COD, which is the anchor for the contract start date, the price-curve year and the first balancing period.
- `src/components/` — `PageHeader.tsx`, `Card.tsx`, `CommandBar.tsx`, `DataGrid.tsx`, `FormPanel.tsx`, `ConfirmDialog.tsx`, `LoadingOverlay.tsx`, `NumericInput.tsx`, `StatTile.tsx`, `EmptyState.tsx`, plus the `SelectProjectPrompt` guard.
- No `src/flows/` wrapper. `brief.py` reports `FLOWS: none` for this screen and no `.Run(` occurs in `Project Revenues Screen.pa.yaml`; the only integration is `Assumptions Revenues SQL`, read here as a repository like any other.
- Dataverse privileges: create/write/delete on `vsb_projectrevenue`, `vsb_balancingprice` and `vsb_revenueindividualhedgevolume`; read on `vsb_energyyield`, `vsb_countryinflationprofile` and the assumptions mirror; write on nothing in `vsb_project` — this screen reads the project and never patches it.

#### Power Fx → TypeScript

##### drp_ProjectRevenues_RightPanel_NewEditCost_BodyContent_Label_1.OnChange — 1634 lines → `priceForYear()`

Decides the bidding price the contract is seeded with: the price-curve row for the COD year, and what to do when the curve has no row for that year.

```powerfx
UpdateContext(
    {
        locRevenuePrice: With(
            {
                recYear: Text(Year(gblRecordSelectedProject.'Operations start date (COD)')),
                recFilteredPrices: Filter(
                    recCountryRelatedAssumptions,
                    valuetype = "price"
                ),
                recPriceRecord: LookUp(
                    Filter(
                        recCountryRelatedAssumptions,
                        valuetype = "price" && category = Text(Year(gblRecordSelectedProject.'Operations start date (COD)'))
                    ),
                    true
                )
            },
                                        Value(recYear) < If(
                                            Value(First(recFilteredPrices).pv),
                                        Value(recYear) > If(
                                            Value(Last(recFilteredPrices).pv),
                                            Value(
                                                First(
                                                    SortByColumns(
                                                        AddColumns(
                                                            recFilteredPrices,
                                                            Diff,
                                                            Abs(
                                                                ) - Value(recYear)
                                                            )
                                                        ),
                                                        "Diff",
                                                        SortOrder.Ascending,
                                                        "pv",
                                                        SortOrder.Descending
                                                    )
                                                ).pv
// … [1597 of the block's 1634 lines omitted]
```

```typescript
export function priceForYear(
  rows: readonly AssumptionRow[], tech: Technology, codYear: number, language: Lang = "en-US",
): number | null {
  const prices = priceRows(rows);
  if (prices.length === 0) return null;

  const exact = prices.find((r) => r.category === String(codYear));
  if (exact) {
    const v = assumptionNumber(techColumn(exact, tech), language);
    return Number.isNaN(v) ? null : v;
  }

  const priceOf = (r: AssumptionRow) => assumptionNumber(techColumn(r, tech), language);
  const yearOf = (r: AssumptionRow) => Number(r.category);

  const first = prices[0]!;
  const last = prices[prices.length - 1]!;
  if (codYear < yearOf(first)) {
    const v = priceOf(first);
    return Number.isNaN(v) ? null : v;
  }
// … [5 lines omitted]
  const ranked = [...prices].sort((a, b) => {
    const da = Math.abs(yearOf(a) - codYear);
    const db = Math.abs(yearOf(b) - codYear);
    if (da !== db) return da - db;
    return priceOf(b) - priceOf(a);
  });
  const v = priceOf(ranked[0]!);
  return Number.isNaN(v) ? null : v;
}
```

**Shape change** — a 1 634-line `OnChange` whose 40-odd derivations each repeat the same `If(Lower(First(Split(Language(),"-")).Value) = "en", Value(x), Value(Substitute(x, ".", ",")))` wrapper collapses into pure functions over an already-fetched `AssumptionRow[]`, with the wrapper extracted once as `assumptionNumber(raw, lang)` and the locale passed in rather than read from ambient state. `Filter(recCountryRelatedAssumptions, valuetype = "price")` becomes `priceRows()` over rows the repository already narrowed by country; the row-order dependence (`First`/`Last`) survives, because the curve's order is the table's order. The clamp-and-nearest fallback is where the two versions part company: see the first entry under Deliberate divergences.
**Pinned by** — UT-REV-016, UT-REV-017, UT-REV-018, and the two unnumbered cases in the `price curve (rule 11 / source ambiguity 1)` describe block that pin the intended nearest-year selection and the parity regression.

##### btn_ProjectRevenue_AddEdit_SaveFunctionality.OnSelect — 444 lines → `validateHedgedVolume()`

Decides whether the contract may be saved at all: for a `Hedged Volume [%]` contract, whether any month of its term would take the project's cross-contract hedge above 100 %.

```powerfx
ClearCollect(
    colRevenueContractHedgedVolumeValidationMonths,
    ForAll(
        Sequence(
            DateDiff(
                dte_ProjectRevenues_RightPanel_NewEditCost_BodyContent_ContractStartDate_1.SelectedDate,
                dte_ProjectRevenues_RightPanel_NewEditCost_BodyContent_ContractEndDate_1.SelectedDate,
                TimeUnit.Months
            ) + 1
        ) As MonthNumber,
With(
    {
        varAllContractsInTimeframe: Filter(
            'Project Revenues',
            And(
                Project.Project = gblRecordSelectedProject.Project,
                'Contract Start Date' <= dte_ProjectRevenues_RightPanel_NewEditCost_BodyContent_ContractEndDate_1.SelectedDate,
                'Contract End Date' >= dte_ProjectRevenues_RightPanel_NewEditCost_BodyContent_ContractStartDate_1.SelectedDate,
                'Project Revenue' <> locSelectedRevenueContract.'Project Revenue'
            )
        )
    },
    ForAll(
        colRevenueContractHedgedVolumeValidationMonths As MonthlyValidation,
        If(
            And(
                Value(
                    Sum(
                        Filter(
                            varAllContractsInTimeframe,
                            And(
                                'Contract Start Date' <= EOMonth(
                                    MonthlyValidation.Value,
                                    0
                                ),
                                'Contract End Date' >= Date(
                                    Year(MonthlyValidation.Value),
                                    Month(MonthlyValidation.Value),
                                    1
                                )
                            )
                        ),
                        'Hedged Volume'
                    )
                ) + Value(txt_ProjectRevenues_RightPanel_NewEditCost_BodyContent_HedgedVolume_1.Value) > 100,
// … [399 of the block's 444 lines omitted]
```

```typescript
export function validateHedgedVolume(
  newContract: { startDate: Date; endDate: Date; hedgedVolume: number },
  overlapping: readonly OverlappingContract[],
): HedgeValidationResult {
  const months = validationMonths(newContract.startDate, newContract.endDate);
  const failed = months.filter(
    (m) => overlappingHedgePercent(overlapping, m) + newContract.hedgedVolume > 100,
  );
  if (failed.length === 0) return { ok: true };
  const sorted = [...failed].sort((a, b) => a.getTime() - b.getTime());
  const from = sorted[0]!;
  const to = sorted[sorted.length - 1]!;
  return { ok: false, from, to, message: hedgeExceededMessage(from, to) };
}

/** Rule 22 — the server-side replacement for `varAllContractsInTimeframe`. */
export function overlapFilterBounds(
  newStart: Date, newEnd: Date, excludeId: string | null,
): { startBefore: Date; endAfter: Date; excludeId: string | null } {
  return { startBefore: newEnd, endAfter: newStart, excludeId };
}
```

**Shape change** — two scratch collections (`colRevenueContractHedgedVolumeValidationMonths` and `…MonthsResults`) rebuilt on every save so that a `Sum(Filter('Project Revenues', …))` could be evaluated once per month client-side — one Dataverse round trip per month of the contract term — become a single query plus a fold. `overlapFilterBounds` is the `$filter` (both date bounds plus `ne` on the contract being edited, which is what excludes it from its own check); `overlappingHedgePercent` reproduces the month-boundary overlap test exactly, comparing against `EOMonth` and the first of the month rather than the contract's exact dates; and the pass/fail collection becomes a returned `from`/`to` range, because the canvas message is a range and not a list of months. The comparison stays strictly `> 100`, so exactly 100 % saves.
**Pinned by** — UT-REV-036, UT-REV-037, UT-REV-038, UT-REV-039.

##### pcf_ProjectRevenues_Content_ContractCommandBar_3.OnSelect — 564 lines → `negativePriceState()`

Decides whether the `Consider Negative Prices` toggle is editable at all, and what it reads when the panel opens.

```powerfx
_ProjectRelatedEnergyYield: !IsEmpty(
    Filter(
        'Energy Yields',
        And(
            Project.Project = gblRecordSelectedProject.Project,
            'Consider Negative Prices' = 'Consider Negative Prices (Energy Yields)'.Yes,
            Status = 'Status (Energy Yields)'.Active
        )
    )
),
_NegativePriceAssumption: Filter(
    locCountryRelatedAssumptions,
    And(
        valuetype in [
            "consider_negtive_prices_active",
            "initial_state_toggle",
            "standard_sync"
        ]
    )
),
_RevenueTypeText: Switch(
    locSelectedRevenueContract.Label,
    'Revenue Labels'.FiT,
    "FiT",
    'Revenue Labels'.PPA,
    "PPA"
)
},
_StandardSync: Switch(
    gblRecordSelectedProject.Technology,
    Technology.Wind,
    _StandardSyncRecord.wind = "true",
    Technology.PV,
    _StandardSyncRecord.pv = "true",
    false
),
_NegativePriceDisplayMode: And(
    Switch(
        gblRecordSelectedProject.Technology,
        Technology.Wind,
        _DisplayModeRecord.wind = "true",
        Technology.PV,
        _DisplayModeRecord.pv = "true",
        false
    ),
    _ProjectRelatedEnergyYield
),
// … [517 of the block's 564 lines omitted]
```

```typescript
export function negativePriceState(
  rows: readonly AssumptionRow[], tech: Technology, revenueTypeLabel: string | null,
  productionExists: boolean,
): NegativePriceState {
  const cat = revenueTypeLabel ?? "";
  const active =
    (assumptionText(rows, "consider_negtive_prices_active", cat, tech) ?? "").toLowerCase() === "true";
  const sync = (assumptionText(rows, "standard_sync", cat, tech) ?? "").toLowerCase() === "true";
  const initial = (assumptionText(rows, "initial_state_toggle", cat, tech) ?? "") === "On";
  return {
    displayMode: active && productionExists ? "edit" : "disabled",
    toggleState: sync ? productionExists : initial,
    manualOverride: false,
  };
}

/** Rule 18 — a manual flip sets `ManualOverride: true`, persisted as `NegativePriceManualOverride`. */
export const flipNegativePrice = (s: NegativePriceState, next: boolean): NegativePriceState =>
  ({ ...s, toggleState: next, manualOverride: true });
```

**Shape change** — a four-deep `With` chain inside a 564-line command-bar handler becomes one function of four arguments. `!IsEmpty(Filter('Energy Yields', …))` — a whole-table read to answer a boolean — becomes `productionExists`, supplied by `useNegativePriceProduction()` as a server-side existence check; the three `valuetype in […]` rows and their per-technology `Switch(…, wind, pv)` collapse into three `assumptionText` calls, and the canvas's misspelt category `"consider_negtive_prices_active"` is preserved verbatim because it is data, not code. `DisplayMode.Edit` / `DisplayMode.Disabled` become a `"edit" | "disabled"` union rather than a Fluent prop, so the rule is testable without rendering.
**Pinned by** — UT-REV-027, UT-REV-028, UT-REV-029, UT-REV-030.

##### Project Revenues Screen.OnVisible — 173 lines → `useProjectContext()`

Decides whether this user may edit anything on the screen — the one genuinely server-answered permission signal in the whole unit.

```powerfx
Set(
    gblRecordSelectedProject,
    LookUp(
        Projects,
        ThisRecord.Project = gblRecordSelectedProject.Project
    )
);
Clear(colRevenueHedgeIndividualVolume);
Set(
    gblCurrentUser,
    Patch(
        gblCurrentUser,
        {
            CanEditSelectedProject: And(
                DataSourceInfo(
                    Projects,
                    DataSourceInfo.CreatePermission
                ),
                Coalesce(
                    RecordInfo(
                        gblRecordSelectedProject,
                        RecordInfo.EditPermission
                    ),
                    false
                )
            )
        }
    )
);
// … [144 of the block's 173 lines omitted]
```

```typescript
export async function readPrivileges(projectId: string): Promise<ProjectPrivileges> {
  if (dataMode === "mock") return { create: true, edit: true };
  try {
    const res = await dataClient.callAction<{ AccessRights?: string }>(
      "RetrievePrincipalAccess",
      { Target: { "@odata.type": `Microsoft.Dynamics.CRM.${ES.projects}`, vsb_projectid: projectId } },
    );
    const rights = res?.AccessRights ?? "";
    return { create: rights.includes("CreateAccess"), edit: rights.includes("WriteAccess") };
  } catch {
    // A privilege probe failure must never read as "allowed".
    return { create: false, edit: false };
  }
}
```

```typescript
export function canEditSelectedProject(
  createPermission: boolean | undefined,
  editPermission: boolean | undefined,
): boolean {
  return Boolean(createPermission) && Boolean(editPermission ?? false);
}
```

**Shape change** — the idiom that opens nearly every canvas `OnVisible` becomes one shared hook, so the freshly read project record and the server-derived edit flag are computed identically on every screen instead of being retyped per screen. `DataSourceInfo(Projects, CreatePermission)` and `RecordInfo(record, EditPermission)` become one `RetrievePrincipalAccess` action whose `AccessRights` string is parsed; `Coalesce(…, false)` becomes the explicit `?? false` in `canEditSelectedProject`, and a *failed* probe returns `{create: false, edit: false}` rather than throwing or defaulting open. The nine `UpdateContext` locals and the three `ClearCollect`s that follow in the elided remainder become React state and `useQuery` keys carrying the project id, which is what removes the need for the canvas `OnHidden` teardown.
**Pinned by** — UT-SES-011, UT-SES-012 in `src/domain/session.test.ts`, and UT-REV-062 for the consumer (`contractCommandBar` reflects server permissions, not roles).

##### pcf_ProjectRevenues_RightPanel_NewEditCost_BodyButtons_Save_2.OnChange — 112 lines → `nextPeriodValue()`

Decides the name and the `Periods` option-set value a new balancing-price period is created with.

```powerfx
Name: "Balancing Price " & If(
    IsEmpty(colProjectBalancingPriceContracts),
    "1",
    IsBlank(locBalancingPriceSelectedContract),
    Text(CountRows(colProjectBalancingPriceContracts) + 1),
    Text(CountRows(colProjectBalancingPriceContracts))
),
Project: gblRecordSelectedProject,
Periods: If(
    IsEmpty(colProjectBalancingPriceContracts),
    Periods.'Period 1',
    !IsBlank(locBalancingPriceSelectedContract),
    locBalancingPriceSelectedContract.Periods,
    Switch(
        CountRows(colProjectBalancingPriceContracts),
        1,
        Periods.'Period 2',
        2,
        Periods.'Period 3',
        3,
        Periods.'Period 4',
        4,
        Periods.'Period 5',
        5,
        Periods.'Period 6',
        6,
        Periods.'Period 7',
        7,
        Periods.'Period 8',
        8,
        Periods.'Period 9',
        9,
        Periods.'Period 10'
    )
),
// … [77 of the block's 112 lines omitted]
```

```typescript
export function nextPeriodValue(existingCount: number): number | null {
  if (existingCount <= 0) return PERIOD_VALUES[0];
  return PERIOD_VALUES[existingCount] ?? null;
}

/** Rule 28 — `Name = "Balancing Price " & <n>`. */
export const balancingPeriodName = (index: number): string => `Balancing Price ${index}`;

/**
 * Rule 28 — a later period starts the day after the previous one ends:
 * `DateAdd(Last(Sort(col,'Created On',Ascending)).'End Date Balancing Contract', 1, TimeUnit.Days)`.
 */
export function nextPeriodStart(periods: readonly BalancingPeriod[]): Date | null {
  const last = newestPeriod(periods);
  if (!last?.endDate) return null;
  return addDays(last.endDate, 1);
}
```

**Shape change** — a ten-arm `Switch(CountRows(col), 1, Period 2, 2, Period 3, …)` becomes an index into the `PERIOD_VALUES` tuple built from `CHOICE_FINANCE.periods`, which makes the eleventh period return `null` (a refusal) instead of silently reusing `Period 10`. The `CountRows(colProjectBalancingPriceContracts)` that the canvas evaluated against a materialised collection becomes the length of the query result, and the `IsBlank(locBalancingPriceSelectedContract)` new-versus-edit branch moves out of the write payload and into the caller, so the payload builder has one job. `Last(Sort(col, 'Created On', Ascending))` becomes `newestPeriod()`, which is also the predicate behind `isNewestPeriod` and therefore behind the whole balancing command bar — only the newest period is editable or deletable.
**Pinned by** — UT-REV-063, UT-REV-064, UT-REV-065, UT-REV-066, UT-REV-067, UT-REV-068.

#### Security conditions

| Condition | Canvas today | Where it must be enforced |
|---|---|---|
| May this user edit the project at all | `OnVisible` line 44: `CanEditSelectedProject: And(DataSourceInfo(Projects, DataSourceInfo.CreatePermission), Coalesce(RecordInfo(gblRecordSelectedProject, RecordInfo.EditPermission), false))`. This is the ONLY `DataSourceInfo`/`RecordInfo` pair in the whole screen and it is genuinely server-answered | `prvCreatevsb_project` on the table plus Write on the row, read through `readPrivileges()` in `useProjectContext()`. A probe failure returns `{create: false, edit: false}` — never "allowed" |
| Edit / Delete a revenue contract | `pcf_ProjectRevenues_Content_ContractCommandBar_3.Items`: `ItemEnabled: RecordInfo(ThisItem, RecordInfo.EditPermission)` and `RecordInfo(ThisItem, RecordInfo.DeletePermission)` — per row, not per user | `prvWritevsb_projectrevenue` / `prvDeletevsb_projectrevenue` at the sharing scope the row actually carries. `contractCommandBar(selected, canEdit, hasSubaccount)` takes `selected.canEdit` / `selected.canDelete` off the DTO the repository returns and ANDs them with the project-level flag; CONVENTIONS.md rule 4 forbids re-deriving either from a role name |
| Creating a contract, a balancing period or a hedge-volume row | Gated by the command bar only. There is no pre-request check anywhere in the canvas save path | `prvCreatevsb_projectrevenue`, `prvCreatevsb_balancingprice`, `prvCreatevsb_revenueindividualhedgevolume`. `hooks.ts` should refuse with a 403 `AppError` before issuing the batch, in the same shape `grid-operator/hooks.ts` already uses — a disabled button must not be the only thing between a reader and a POST |
| The five-part page lock | `con_Milestones_Page_LockMessage_7.Visible` — a client-side completeness test on `'Project ID'`, `'End Date'`, `'Total Capacity'`, `'Net Yield p50'` and `'Cluster State'.Name`. **Not a permission check of any kind** | Nowhere. This is sequencing, and naming it as such is the finding: a user who can PATCH `vsb_projectrevenue` can do so with the page locked, because the lock exists only in the UI. `isPageLocked()` is shared byte-for-byte with Project Finance so the two screens cannot drift |
| The hedged-volume 100 % ceiling | Evaluated entirely client-side in `btn_ProjectRevenue_AddEdit_SaveFunctionality.OnSelect`, month by month, immediately before the `Patch`. Two concurrent savers both pass it and both write | A synchronous pre-operation plug-in on `vsb_projectrevenue`, or a Dataverse custom API that performs the check and the write in one transaction. `validateHedgedVolume` is a client-side gate on a race only the server can settle — it belongs in the panel for feedback, not as the boundary |
| Reading `Assumptions Revenues SQL` | Read directly from the client at `OnVisible` and again on every panel open, unfiltered beyond country | Read privilege on the Dataverse mirror at Organization scope, with `assumptionsRevenuesRepo` filtering server-side on country (and the Italian region). Every value is untrusted text: `assumptionNumber` returns `NaN` rather than throwing, and `priceForYear` degrades to `null` |
| Standardness flags | `IsStandardAssumption` per field, serialised into the contract row and used for typography and for the "may not be described as standard" validation. Written client-side with no server test | `prvWritevsb_projectrevenue`. `validateDescription` refuses a `Standard`-prefixed description on a non-standard contract (UT-REV-048), but a direct PATCH bypasses it; if the prefix carries reporting meaning it needs a plug-in |
| `RevenueIndividualHedgeVolumes` rows | `ForAll(colRevenueHedgeIndividualVolume, Patch(…))` after a `RemoveIf` — one write per contract year, not transactional. A failure halfway leaves a contract whose volumes have been deleted and not replaced | Create/write/delete on `vsb_revenueindividualhedgevolume`, cascading from the parent contract's ownership. The rebuild issues delete-plus-insert in one `$batch`, which removes the observed failure mode without needing a new privilege |

#### Deliberate divergences

- **The price-curve fallback compares prices to years** (ambiguity 1, marked `SOURCE DEFECT` at `rules.ts:628`). The canvas fallback is `If(Value(recYear) < Value(First(recFilteredPrices).pv), …, Value(recYear) > Value(Last(recFilteredPrices).pv), …, First(SortByColumns(AddColumns(recFilteredPrices, Diff, Abs(Value(ThisRecord.pv) - Value(recYear))), "Diff", Ascending, "pv", Descending)).pv)` — `recYear` is `Text(Year(COD))` and `.pv` / `.wind` are PRICES, so both the clamp and the ranking measure the distance between a year (≈2028) and a price (≈65). For any realistic curve that always selects the most expensive row. The year lives in `category`, which the canvas fallback never reads. **The rebuild matches on year**: `priceForYear` clamps to the first or last row by `Number(r.category)` and otherwise takes the nearest year, breaking ties on the higher price to preserve the canvas's `"pv", SortOrder.Descending` secondary sort. `priceForYearCanvasParity` reproduces the shipped comparison verbatim and is asserted by a regression test in the `price curve (rule 11 / source ambiguity 1)` block, so the parity path cannot rot if a product owner asks for it back. Flag this before switching a live environment: contracts already seeded through the canvas carry the expensive-row price.
- **Shift of COD bounds disagree between the message and the visibility rule** (ambiguity 4). The error message says `Value must be between 0 and 24.` and its own predicate treats 0 and 24 as invalid, while the control's `Visible` never shows the error for them. `validateShiftOfCod` ports the *visibility* rule (inclusive 0…24, integers only) and `shiftOfCodMessageRuleCanvasParity` keeps the exclusive test reachable. Pinned by the `source ambiguity 4: the Shift-of-COD bounds disagree; the inclusive rule wins` case in the `field validation` block.
- **`locRevenueContractStartDate.IsStandardAssumption` is hard-coded** (ambiguity 5). The source reads `IsStandardAssumption: /*If(recStandardAssumptionExists, true, true)*/true` — the real test is commented out, so a start date reports itself standard even for a revenue type that has no standard assumption, and because `endDateIsStandard` is a conjunction including it, the end-date flag inflates too. `contractStartDate` takes an explicit `hardCodedStandardFlag` option **defaulting to the canvas `true`**, so today's behaviour is unchanged and the corrected one is one argument away. Pinned by UT-REV-014, UT-REV-015 and UT-REV-060 (the duration cell is styled standard only when BOTH flags are set).
- **Currency has two disagreeing rules** (ambiguity 7). The assumption engine hard-codes `"EUR"` on every branch; the control default is PLN for Poland and EUR elsewhere. Both are exported — `assumptionEngineCurrencyCode()` and `revenueCurrencyCode(countryName)` — and the screen uses `revenueCurrencyCode`, resolving the conflict in favour of the control default because that is the value a user sees and saves. Pinned by the two cases in the `currency (source ambiguity 7)` block.
- **`Tarrif Price Standard Assumptions` is not carried over** (ambiguity 6). The table appears in the screen's data sources and in the brief's table list, but every reference to it in `Project Revenues Screen.pa.yaml` sits inside a `/* … */` block; the live formulas read prices from `Assumptions Revenues SQL`. It stays in the fact table because it is a declared data source of the canvas unit, and it has no repository, no query and no rule.
- **`GUIDE q25`: Currency and `Country Inflation Profile` render as placeholders, not values.** In the recording `Euro` and `Germany` look like entered values and are system-derived defaults. `derivedFieldPlaceholder()` renders them in placeholder grey on a disabled input, which is the convention `general-data` already uses for a field configured elsewhere — rendering them as ordinary input values misrepresents which fields are required-and-empty.
- **The tab lives in `?tab=`, not in a context variable.** `parseRevenueTab` is a pure function of the location, so a reloaded or shared link opens on the tab the user was on. Pinned by UT-REV-002.

#### Build steps

1. Confirm screens 9, 10, 15 and 16 are complete for the test project — `isPageLocked()` returns `true` until all five bullets clear, and nothing on this screen is reachable while it does.
2. Add the nine repositories to `src/data/repos.ts` and `CHOICE_FINANCE.periods` to `entities.ts`, checking `PROJECT_COL`, `REVENUE_COL`, `BALANCING_COL`, `HEDGE_VOLUME_COL` and `FLAG_COL` against `sol/customizations.xml`.
3. Write the assumption plumbing and the standardness model first — `field`, `overrideField`, `assumptionNumber`, `techColumn`, `lookupAssumption`, `assumptionText`, `assumptionValue`, `provinceToPriceRegion`, `bareRegion`, `assumptionCountries`, `selectCountryAssumptions`, `standardAssumptionExists`, `allValuesStandard`, `ALL_STANDARD_FLAG_KEYS` — because every other rule keys off them.
4. Write the derivation rules — `contractStartDate` (with its `hardCodedStandardFlag` switch), `contractDuration`, `contractEndDate`, `endDateWithGuard`, `endDateIsStandard`, `priceForYear`, `priceForYearCanvasParity`, `p90Price`, `correctionFactorDefault`, `germanFitTariff`, `tariffIsStandard`, `tariffP90IsStandard`, `inflation`, `applyCountryInflation`, `countryInflationValue`, `subContractTypeChange`, `negativePriceState`, `revenueCurrencyCode`, `assumptionEngineCurrencyCode`.
5. Write the hedging, validation and gating rules — `hedgeTypeOptions`, `generateVolumeRows`, `volumeRowLabel`, `validationMonths`, `overlappingHedgePercent`, `validateHedgedVolume`, `overlapFilterBounds`, the eleven `validate*` functions, `canSaveRevenueContract`, `needsIndividualVolumesConfirmation`, `pageLock`, `isPageLocked`, `contractCommandBar`, `balancingCommandBar` — plus the balancing chain `nextPeriodValue`, `balancingPeriodName`, `firstPeriodStart`, `nextPeriodStart`, `newestPeriod`, `isNewestPeriod`, `balancingMonthOptions`, `balancingEndDate`.
6. Write `rules.test.ts` to 102 cases covering UT-REV-001…072 across the eighteen describe blocks, including the two parity regressions, then run `npx vitest run src/features/revenues`.
7. Write `hooks.ts` — the country-sliced assumptions query with the Italian `f.or` in the `$filter`, `useOverlappingContracts` (one query, both date bounds, `ne` on the contract id), `useIndividualVolumes`, `useNegativePriceProduction`, and `useSaveRevenueContract` issuing contract, volumes and removals as ONE `$batch` with a 403 pre-check.
8. Compose `Screen.tsx` — page lock, two tabs bound to `?tab=`, two grids, two right panels, the placeholder-styled derived fields, and the individual-volumes confirmation dialog.
9. Verify `npx tsc --noEmit | grep features/revenues` is empty and re-run the suite.

#### Exit gate

`npx vitest run src/features/revenues` passes all 102 UT-REV cases including both parity regressions, and `npx tsc --noEmit | grep features/revenues` is empty. The behavioural gate is the hedge ceiling end to end: saving a `Hedged Volume [%]` contract that would take one month of an overlapping term to 101 % is rejected with the verbatim range message and **issues no request**, while the same contract at exactly 100 % saves its row and its `RevenueIndividualHedgeVolumes` children in a single `$batch` — and a user without `prvWritevsb_projectrevenue` is refused by `hooks.ts` before the batch is built, not by Dataverse afterwards.

---
### 18. Project Finance Screen — `src/features/finance/`

| | |
|---|---|
| Canvas unit | `PM::Project Finance Screen` (PM app) |
| Power Fx | `321` blocks ≥3 lines · `186` ≥10 · `58` ≥30 · `8036` lines in those blocks (`14328` across all `=` properties) |
| Complexity | band `L` · score `62.1` · `30` build-days |
| Code app | `Screen.tsx` 1736 ln · `hooks.ts` 729 ln · `rules.test.ts` 1301 ln · `rules.ts` 1998 ln |
| Pure rules exported | `135` |
| Unit tests | `127` cases · IDs `UT-FIN-001…UT-FIN-102` |
| Dataverse tables | CAPEX Costs, Financing Input Step Up margins, Financing Inputs, Financing Inputs Repayment Amounts, GeneratorInProjects, GeneratorTypeInProjects, Generators, Projects |

#### What it does

The debt-and-equity structuring workspace for one project. Six financing categories — Equity, VAT-Financing, Senior Debt, DSRA/DSRF, Decommissioning and Cash Sweep, keyed by `Order` and not by name — render as collapsible cards, each with its own right-hand form; Senior Debt is the only multi-row category and carries a tranche sub-grid with its own command bar. On every visit the screen derives a complete set of country- and technology-specific standard assumptions from `Assumptions Debt SQL` and, where a `Financing Inputs` row for a category does not yet exist, creates it pre-populated with them. A single radio at the top switches the whole project between `Debt Financing` and `All Equity`, and that switch cascades statuses across the VAT, senior-debt and DSRA/DSRF inputs while remembering what each row's status was before the switch. The tranche form carries the heaviest sub-forms in the solution: an individual repayment profile regenerated from tenor and repayment start, and a step-up bank-margin schedule that must end exactly at the fixed-interest-rate duration.

#### Depends on

- `src/features/revenues/rules.ts` — `assumptionNumber`, `pageLock`, `isPageLocked`. All three are **imported, not reimplemented**: the page lock is the identical five-part formula (`con_Milestones_Page_LockMessage_8` here, `…_7` on Revenues) and the locale-sensitive assumption parse is the same `varLang` wrapper, so screen 17 must be finished first or these move to a shared module.
- `src/features/shared/useProjectContext.ts` — `useProjectContext()`, `readPrivileges()`. The `CanEditSelectedProject` patch at `Project Finance Screen.pa.yaml:53` is byte-identical to the Revenues one.
- `src/domain/numeric.ts` — `parseNumber`, `isNumeric`, `isInteger`, `inRange`, `isDecimalWithPlaces`, `isBlank`, `decimalSeparator`, `pfxRound`, `formatInteger`, `Lang`. `decimalSeparator` is what makes the DSCR regex accept a comma in a non-English locale (UT-FIN-051).
- `src/domain/dates.ts` — `addDays`, `addMonths`, `addYears`, `toMMYY`, `fromMMYY`. `toMMYY`/`fromMMYY` are the shared half of rule 29's `"MMYY"` string packing; `packMMYY`/`unpackMMYY`/`padMMYY` in the feature are the four-character zero-padded form the columns actually hold.
- `src/domain/session.ts` — `canEditSelectedProject()`.
- `src/data/entities.ts` — `ES_FINANCE.financingInputs`, `.financingInputsRepaymentAmounts`, `.financingInputStepUpMargins` (note the double plural — the entity is `vsb_FinancingInputStepUpmargins`), `.financingCategories`, `.assumptionsDebt`, `.assumptionsBanks`, `.assumptionsKfwTranches`; `CHOICE_FINANCE.status` (`statecode` `0`/`1`, not a picklist), `.financingOptions`, `.trancheStatus`, `.baseRate`, `.repaymentProfile`, `.freeEquity`, `.vatFacilityAmount`, `.yesNo`, `.dsraOriginalStatusActive`.
- `src/data/repos.ts` — `projectFullRepo`, `financingCategoryRepo`, `financingInputFullRepo`, `repaymentAmountRepo`, `stepUpMarginRepo`, `assumptionsDebtRepo`, `assumptionsBankRepo`, `assumptionsKfwRepo`, `capexProjectContractRepo`, `capexCostRepo`, `generatorInProjectRepo`.
- `src/data/queryKeys.ts` — `qk`; the keys carry the project id, which is what replaces the canvas `OnHidden` (13 blanked variables and 9 cleared collections) — nothing leaks between projects because no key is project-agnostic.
- `src/platform/dataClient.ts` — `dataClient.batch`, `WriteOp`. The tranche save (tranche row + repayment diff + step-up diff), the seed of the five missing categories, and the delete cascade (step-ups, repayments, then the input) are each ONE changeset.
- `src/platform/errors.ts` — `toAppError`, `AppError`. The canvas `IfError(Patch(…), Notify(…); Blank())` swallows the failure; here it surfaces.
- **Screen 19 (Capex Costs)** supplies the numbers behind `totalDevexCapex()` — the equity card's free-equity cap and the shareholder-loan split are computed from the project's `CAPEX Project Contracts` and `CAPEX Costs`. The screen does not need to be *built* first, but the data does need to exist for the equity figures to be non-zero (UT-FIN-023, UT-FIN-024).
- **Screen 15 (Generators)** supplies `useActiveTurbineCount()` — the per-turbine decommissioning amount multiplies by the count of ACTIVE `GeneratorTypeInProjects` rows (UT-FIN-077, UT-FIN-102).
- Screens 9, 10, 15 and 16 clear the five page-lock bullets; screen 10 additionally supplies `'5-Construction'`, the anchor for `financialClose()`.
- `src/components/` — `PageHeader.tsx`, `Card.tsx`, `CommandBar.tsx`, `DataGrid.tsx`, `FormPanel.tsx`, `ConfirmDialog.tsx`, `LoadingOverlay.tsx`, `NumericInput.tsx`, `StateChip.tsx`, `StatTile.tsx`, plus `SelectProjectPrompt`.
- No `src/flows/` wrapper. `brief.py` reports `FLOWS: none` for this screen and no `.Run(` occurs in `Project Finance Screen.pa.yaml`. The one piece of server work this screen wants is a Dataverse custom API, `vsb_EnsureFinancingInputs`, to make the seed atomic — a custom API, not a flow, because `src/flows/` holds typed wrappers over the 17 existing flows and none of them is edited by this rebuild.
- Dataverse privileges: create/write/delete on `vsb_financinginput`, `vsb_financinginputsrepaymentamount` and the step-up margin table; read on the three assumption mirrors, `vsb_capexprojectcontract`, `vsb_capexcost` and the generator tables; **write on `vsb_project`** for the `'Financing Options'` column — which is the column the first divergence below is about.

#### Power Fx → TypeScript

##### Project Finance Screen.OnVisible — 1888 lines → `financingOptionOnVisit()`

Decides whether the project's `'Financing Options'` column is overwritten when the screen opens. In the canvas the answer is "always"; in the rebuild it is "only when it has never been set".

```powerfx
Patch(
    Projects,
    gblRecordSelectedProject,
    {'Financing Options': 'Financing Options'.'Debt Financing'}
),
If(
    CountIf(
        'Financing Inputs',
        And(
            Project.Project = gblRecordSelectedProject.Project,
            'Financing Category'.'Financing Category' = FinancingCategories.Equity.'Financing Category'
        )
    ) = 0,
    IfError(
        Patch(
            'Financing Inputs',
            Defaults('Financing Inputs'),
            {
                Name: gblRecordSelectedProject.'Project Name' & "-" & "Equity",
                'Financing Category': LookUp(
                    colFinancingCategories,
                    Order = 1
                ),
                'Free Equity': 'Free Equity Options'.Percentage,
                'Free Equity Value': 10,
                'Shareholder Loan Value': 90,
If(
    CountIf(
        'Financing Inputs',
        And(
            Project.Project = gblRecordSelectedProject.Project,
            'Financing Category'.'Financing Category' = FinancingCategories.VATFinancing.'Financing Category'
        )
    ) = 0,
// … [1854 of the block's 1888 lines omitted]
```

```typescript
export function financingOptionOnVisit(current: number | null): number | null {
  return current === null || current === undefined
    ? CHOICE_FINANCE.financingOptions.debtFinancing
    : null;
}

/** Canvas parity: patch `Debt Financing` on every visit, whatever the current value. */
export const unconditionalDebtFinancingCanvasParity = (): number =>
  CHOICE_FINANCE.financingOptions.debtFinancing;
```

```typescript
      const option = financingOptionOnVisit(a.project.financingOptions);
      if (option !== null) {
        await projectFullRepo.update(a.project.id, { [PROJECT_COL.financingOptions]: option });
      }
```

**Shape change** — the `Patch(Projects, …, {'Financing Options': 'Debt Financing'})` sits at the TOP LEVEL of the `OnVisible` `Concurrent`, not inside any `If`, alongside five `If(CountIf('Financing Inputs', …) = 0, IfError(Patch(…), Notify(…)))` seed guards. Both halves change shape: the unconditional patch becomes a guarded write returning `null` when nothing is needed, and the five `CountIf`-then-`Patch` pairs become `planSeeds()`, which returns only the categories that are MISSING and is therefore idempotent by construction (UT-FIN-014) and issued as one `$batch` in `hooks.ts`. `IfError(…, Notify(…); Blank())` — a swallowed failure — becomes a surfaced `AppError`. A write-on-read still races between two users opening the screen at once, which is why `vsb_EnsureFinancingInputs` is named as its production home; the shape above is ready for that move and `useSeedFinancingInputs` is its only caller.
**Pinned by** — UT-FIN-013, UT-FIN-014, UT-FIN-016, UT-FIN-017, UT-FIN-018, UT-FIN-019b, and the `SOURCE DEFECT: OnVisible would overwrite All Equity on every visit; guarded` case in the `financing-option cascade (rules 15–16)` describe block.

##### rad_ProjectFinance_FinancingOptions.OnChange — 177 lines → `applyFinancingOptionCascade()`

Decides what happens to every debt-side financing input when the project switches between `Debt Financing` and `All Equity`, and which rows are exempt.

```powerfx
    If(
        varVATFinancingInput.'Is Deactivated By Button' <> 'Is Deactivated By Button (Financing Inputs)'.Yes,
        UpdateContext(
            {
                locSelectedFinancingInput: Patch(
                    'Financing Inputs',
                    varVATFinancingInput,
                    {
                        Status: If(
                            Self.Selected.Value = 'Financing Options'.'All Equity',
                            'Status (Financing Inputs)'.Inactive,
                            Self.Selected.Value = 'Financing Options'.'Debt Financing',
                            'Status (Financing Inputs)'.Active
                        )
                    }
                )
            }
        );
If(
    Self.Selected.Value = 'Financing Options'.'All Equity',
    With(
        {
            locAllSeniorDebtInputs: Filter(
                colFinancingInputInProject,
                'Financing Category'.'Financing Category' = LookUp(
                    colFinancingCategories,
                    Order = 3,
                    'Financing Category'
                )
            )
        },
        ForAll(
            locAllSeniorDebtInputs As Item,
            Patch(
                'Financing Inputs',
                Item,
                {Status: 'Status (Financing Inputs)'.Inactive}
            );
            Patch(
                colFinancingInputInProject,
                Item,
                {Status: 'Status (Financing Inputs)'.Inactive}
            )
        )
    );
// … [132 of the block's 177 lines omitted]
```

```typescript
export function applyFinancingOptionCascade(
  inputs: readonly FinancingInputStatus[], option: number,
): { id: string; status: number }[] {
  const allEquity = option === CHOICE_FINANCE.financingOptions.allEquity;
  const out: { id: string; status: number }[] = [];
  for (const i of inputs) {
    if (i.categoryOrder === CATEGORY_ORDER.vatFinancing) {
      if (i.isDeactivatedByButton === CHOICE_FINANCE.yesNo.yes) continue;
      out.push({
        id: i.id,
        status: allEquity ? CHOICE_FINANCE.status.inactive : CHOICE_FINANCE.status.active,
      });
    } else if (i.categoryOrder === CATEGORY_ORDER.seniorDebt) {
      out.push({
        id: i.id,
        status: allEquity
          ? CHOICE_FINANCE.status.inactive
          : i.trackStatusActive === CHOICE_FINANCE.yesNo.yes
            ? CHOICE_FINANCE.status.active
            : CHOICE_FINANCE.status.inactive,
      });
    } else if (i.categoryOrder === CATEGORY_ORDER.dsraDsrf) {
      out.push({
        id: i.id,
        status: allEquity
          ? CHOICE_FINANCE.status.inactive
          : i.dsraOriginalStatusActive === CHOICE_FINANCE.dsraOriginalStatusActive.yes
            ? CHOICE_FINANCE.status.active
            : CHOICE_FINANCE.status.inactive,
      });
    }
  }
  return out;
}
```

**Shape change** — three near-identical `ForAll(…, Patch('Financing Inputs', …); Patch(col…, …))` bodies, each writing the Dataverse row and then the local mirror collection, become one pure function that returns the intended `{id, status}` list and one `$batch` that applies it. The dual write disappears entirely: there is no mirror collection to keep in step, so the "collection says Active, Dataverse says Inactive" failure mode goes with it. The three restore columns keep their exact asymmetry — VAT follows the option unless `'Is Deactivated By Button' = Yes`, senior debt restores from `'Track Status Active?'`, DSRA/DSRF from its own `'DSRA/DSRF Original Status Active?'` band — because they are three different columns holding three different memories, and collapsing them would lose a user's pre-switch state.
**Pinned by** — UT-FIN-032, UT-FIN-033, UT-FIN-034, UT-FIN-035, plus the `the DSRA equivalent uses its own 952850000-band memory column` case in the same block.

##### pcf_btn_GeneralData_RightPanel_SeniorDebt_Form_Buttons_Save_1.OnChange — 332 lines → `buildUniqueKey()`

Decides a tranche's identity — the string that makes two tranches the same tranche, and therefore whether a save is an insert, an update or a rejected duplicate.

```powerfx
            locSeniorDebtUniqueKeyToSave: With(
                {
                    locTrancheStatusKey: If(
                        rad_SeniorDebt_Data_TrancheStatus.Selected.Value = 'Senior Debt Tranche Status '.'Standard Assumption',
                        "StandardAssumption",
                        Substitute(
                            Lower(Trim(Text(rad_SeniorDebt_Data_TrancheStatus.Selected.Value))),
                            " ",
                            ""
                        )
                    ),
                    locBankKey: If(
                        Lower(Trim(cmb_SeniorDebt_Data_Bank.Selected.bankname)) = "other",
                        "other-" & Substitute(
                            Lower(Trim(txt_SeniorDebtData_BankName.Value)),
                            " ",
                            ""
                        ),
                        "bank-" & Text(cmb_SeniorDebt_Data_Bank.Selected.id)
                    ),
                    locKfWKey: If(
                        tgl_SeniorDebt_Data_KfW_Tranche.Checked,
                        "kfw-" & Substitute(
                            Lower(
                                Trim(
                                    Coalesce(
                                        drp_SeniorDebt_Data_KfW_Tranche_Value.Selected.loantenor_repayfreeperiod_ratefixing,
                                        "blank"
                                    )
                                )
                            ),
                            " ",
                            ""
                        ),
                        "nokfw"
                    )
                },
                If(
                    rad_SeniorDebt_Data_TrancheStatus.Selected.Value = 'Senior Debt Tranche Status '.'Standard Assumption',
                    gblRecordSelectedProject.Project & "-SeniorDebt-StandardAssumption",
                    gblRecordSelectedProject.Project & "-SeniorDebt-" & locTrancheStatusKey & "-" & locBankKey & "-" & locKfWKey
                )
// … [290 of the block's 332 lines omitted]
```

```typescript
const strip = (s: string) => s.trim().toLowerCase().replace(/ /g, "");

export function buildUniqueKey(input: TrancheKeyInput): string {
  if (strip(input.statusLabel) === "standardassumption") {
    return `${input.projectId}-SeniorDebt-StandardAssumption`;
  }
  const statusKey = strip(input.statusLabel);
  const bankKey = (input.bankName ?? "").trim().toLowerCase() === "other"
    ? `other-${strip(input.otherBankName ?? "")}`
    : `bank-${input.bankId ?? ""}`;
  const kfwKey = input.kfwEnabled
    ? `kfw-${strip(input.kfwValue ?? "blank")}`
    : "nokfw";
  return `${input.projectId}-SeniorDebt-${statusKey}-${bankKey}-${kfwKey}`;
}

/**
 * Rule 18 — duplicates are rejected BEFORE the write:
 * `LookUp('Financing Inputs', UniqueKeyString = key && Or(IsBlank(current),
 *   'Financing Input' <> current.'Financing Input'))`. Editing the row that owns the key
 * is not a collision.
 */
export function isDuplicateTranche(
  key: string,
  existing: readonly { id: string; uniqueKeyString: string | null }[],
  currentId: string | null,
): boolean {
  return existing.some((e) => e.uniqueKeyString === key && e.id !== currentId);
}
```

**Shape change** — the key was composed inline inside a 332-line save handler, reading five named controls directly, so it could not be evaluated anywhere else; it is now a pure function of a seven-field `TrancheKeyInput` and the repeated `Substitute(Lower(Trim(…)), " ", "")` is one `strip()` helper, which is what guarantees the three sub-keys are normalised identically. The re-entrancy guard `locIsSavingSeniorDebtTranche` — a context variable set at entry and cleared on every exit path — becomes `isSaving` in the store, still passed into `canSaveSeniorDebtTranche` as a term because the canvas `DisplayMode` does (UT-FIN-046). The duplicate check moves ahead of the write and out of `IfError`, so a collision is a validation message rather than a swallowed Dataverse error.
**Pinned by** — UT-FIN-041, UT-FIN-042, UT-FIN-043, UT-FIN-044, UT-FIN-045, UT-FIN-047.

##### pcf_FinancingInputs_Content_SeniroDebtTranche_CommandBar.Items — 124 lines → `seniorDebtCommandBar()`

Decides which of the five tranche commands are visible and enabled — the screen's whole permission surface for senior debt, and the place a permission enum is used wrongly.

```powerfx
=Table(
    {
        ItemKey: "AddFinanceInput",
        ItemDisplayName: "Add Tranche",
        ItemIconName: "Add",
        ItemEnabled: And(
            DataSourceInfo(
                'Financing Inputs',
                DataSourceInfo.CreatePermission
            ),
    },
    {
        ItemKey: "EditFinanceInput",
        ItemDisplayName: "Edit Tranche",
        ItemIconName: "Edit",
        ItemEnabled: And(
            Not(IsBlank(locSelectedSeniorDebtTranche)),
            RecordInfo(
                locSelectedSeniorDebtTranche,
                DataSourceInfo.EditPermission
            ),locSelectedSeniorDebtTranche.Status='Status (Financing Inputs)'.Active
        )
    },
// … [101 of the block's 124 lines omitted]
```

```typescript
export function seniorDebtCommandBar(
  tranches: readonly TrancheRow[],
  selected: TrancheRow | null,
  canCreate: boolean,
): Record<SeniorDebtCommandKey, CommandState> {
  const onlyStandard =
    tranches.length === 1 &&
    tranches[0]!.trancheStatus === CHOICE_FINANCE.trancheStatus.standardAssumption;
  const activeCount = tranches.filter((t) => t.status === CHOICE_FINANCE.status.active).length;
  const isActive = selected?.status === CHOICE_FINANCE.status.active;
  const isInactive = selected?.status === CHOICE_FINANCE.status.inactive;
  const undeletableStatus =
    selected?.trancheStatus === CHOICE_FINANCE.trancheStatus.creditAgreement ||
    selected?.trancheStatus === CHOICE_FINANCE.trancheStatus.standardAssumption;

  return {
    add: {
      visible: true,
      enabled: canCreate && !onlyStandard,
      reason: onlyStandard
        ? "Add a Term Sheet or Credit Agreement tranche from the Standard Assumption first."
        : undefined,
    },
    edit: {
      visible: true,
      enabled: Boolean(selected?.canEdit) && isActive,
      reason: selected && !isActive ? "An inactive tranche cannot be edited." : undefined,
    },
    activate: { visible: Boolean(selected) && isInactive, enabled: Boolean(selected?.canEdit) },
    deactivate: {
      visible: Boolean(selected) && isActive,
      enabled: Boolean(selected?.canEdit) && activeCount > 1,
      reason: activeCount <= 1 ? "The last active tranche cannot be deactivated." : undefined,
    },
// … [7 lines omitted]
  };
}
```

**Shape change** — a `Table(...)` literal of five records whose `ItemEnabled` expressions each re-`Filter` and re-`CountIf` the mirror collection becomes one function over a typed `TrancheRow[]` computing `onlyStandard`, `activeCount` and the status predicates once. `DataSourceInfo('Financing Inputs', CreatePermission)` becomes the `canCreate` argument and `RecordInfo(row, EditPermission)` / `RecordInfo(row, DeletePermission)` become `row.canEdit` / `row.canDelete` off the DTO the repository returns — never re-derived from a role name. Each refusal also gains a `reason`, so a disabled button can say why; the canvas has the rule and no explanation. Note the quoted `Edit Tranche` gate: it passes `DataSourceInfo.EditPermission` to `RecordInfo`, mixing two enums. It reads as a copy-paste slip and the rebuild uses the record's own write privilege, which is what the surrounding items use.
**Pinned by** — UT-FIN-036, UT-FIN-037, UT-FIN-038, UT-FIN-039, UT-FIN-040.

##### Drp_SeniorDebtData_Tenor_YY.OnChange — 115 lines → `regenerateRepaymentYears()`

Decides which years the individual repayment profile has rows for, and what happens to the amounts already typed when the tenor or the repayment start moves.

```powerfx
/* 1. MARK FORM AS DIRTY */
UpdateContext({locFormIsDirty: true});

/* 2. INDEXED BACKUP: Capture values by position (1, 2, 3...) to allow "Rotation" */
ClearCollect(
    colIndexedBackup,
    ForAll(
        Sequence(CountRows(colRepaymentProfileAmount)) As Row,
        {
            Index: Row.Value,
            OldValue: Index(Sort(colRepaymentProfileAmount, Year, SortOrder.Ascending), Row.Value).Value,
            OldValid: Index(Sort(colRepaymentProfileAmount, Year, SortOrder.Ascending), Row.Value).Valid
        }
    )
);
With(
    {
        varCOD: gblRecordSelectedProject.'Operations start date (COD)',
        varStartYY: Value(Drp_SeniorDebtData_StartRepayment_YY.Selected.Value),
        varStartMM: Value(Drp_SeniorDebtData_StartRepayment_MM.Selected.Value),
        varTenorYY: Value(Drp_SeniorDebtData_Tenor_YY.Selected.Value),
        varTenorMM: Value(drp_SeniorDebtData_Tenor_MM.Selected.Value),
        varTrancheID: locSelectedSeniorDebtTranche.'Financing Input'
    },
    With(
        {
            /* Determine Start and End years based on date addition logic */
            varStartYear: Year(DateAdd(DateAdd(varCOD, varStartYY, TimeUnit.Years), varStartMM, TimeUnit.Months)),
            varEndYear: Year(DateAdd(DateAdd(varCOD, varTenorYY, TimeUnit.Years), varTenorMM, TimeUnit.Months))
        },
        ClearCollect(
            colRepaymentProfileAmount,
            ForAll(
                Sequence(Max(0, (varEndYear - varStartYear) + 1)) As Seq,
                With(
                    {
                        varCurrentYear: varStartYear + (Seq.Value - 1),
                        /* Pull previous value based on Index (position) to handle Shifting/Rotation */
                        varRotationMatch: LookUp(colIndexedBackup, Index = Seq.Value)
                    },
                    {
                        Year: varCurrentYear,
                        Dirty: true,
                        Valid: Coalesce(varRotationMatch.OldValid, false),
                        Value: Coalesce(varRotationMatch.OldValue, ""),
// … [71 of the block's 115 lines omitted]
```

```typescript
export function regenerateRepaymentYears(
  cod: Date | null,
  startYY: number, startMM: number,
  tenorYY: number, tenorMM: number,
  previous: readonly RepaymentRow[] = [],
  existing: readonly { year: number; id: string }[] = [],
): RepaymentRow[] {
  if (!cod) return [];
  const startYear = addMonths(addYears(cod, startYY), startMM).getFullYear();
  const endYear = addMonths(addYears(cod, tenorYY), tenorMM).getFullYear();
  const n = Math.max(0, endYear - startYear + 1);
  return Array.from({ length: n }, (_, i) => {
    const year = startYear + i;
    const old = previous[i];
    return {
      year,
      value: old?.value ?? "",
      valid: old?.valid ?? false,
      dirty: true,
      repaymentAmountRecordId: existing.find((e) => e.year === year)?.id ?? null,
    };
  });
}
```

**Shape change** — this handler exists in five verbatim copies (tenor YY and MM, start-repayment YY and MM, plus the profile radio) and each one carries `colIndexedBackup`, a collection whose only purpose is to survive the `ClearCollect` of the collection being rebuilt. The regeneration is a pure function of the old array, so the backup collection disappears and one function serves all five call sites. `Coalesce(varRotationMatch.OldValue, "")` with `LookUp(colIndexedBackup, Index = Seq.Value)` is preserved exactly as *carry-over by POSITION*, not by year: shortening the term keeps the first N amounts, and moving the start year shifts the same amounts onto different years. That is a surprising rule and it is deliberate — UT-FIN-053 and UT-FIN-054 pin both halves so nobody "fixes" it into a match-by-year. `Sequence(Max(0, …))` becomes the explicit `Math.max(0, …)` guard, so a degenerate term yields no rows rather than a negative `Sequence` (UT-FIN-055), and the commented-out predecessor block above the live code (which used `Year(COD) - 1` as the anchor and a completely different row count) is not ported.
**Pinned by** — UT-FIN-052, UT-FIN-053, UT-FIN-054, UT-FIN-055, UT-FIN-056.

#### Security conditions

| Condition | Canvas today | Where it must be enforced |
|---|---|---|
| May this user edit the project at all | `OnVisible` line 53: `CanEditSelectedProject: And(DataSourceInfo(Projects, DataSourceInfo.CreatePermission), Coalesce(RecordInfo(gblRecordSelectedProject, RecordInfo.EditPermission), false))` — the same formula as Revenues, genuinely server-answered | `prvCreatevsb_project` plus Write on the row, read through `readPrivileges()`. A failed probe returns `{create: false, edit: false}` |
| Add Tranche | `DataSourceInfo('Financing Inputs', DataSourceInfo.CreatePermission)` AND not (exactly one input, which is the Standard Assumption) | `prvCreatevsb_financinginput`. `seniorDebtCommandBar(tranches, selected, canCreate)` takes the privilege half as `canCreate`; the "only the standard tranche exists" half is a business rule, not security |
| Edit Tranche | `RecordInfo(locSelectedSeniorDebtTranche, DataSourceInfo.EditPermission)` — **the wrong enum is passed to `RecordInfo`**, mixing `DataSourceInfo.EditPermission` into a record-level probe. Every sibling item uses `RecordInfo.EditPermission` correctly | `prvWritevsb_financinginput` at the row's sharing scope. The rebuild reads `row.canEdit` from the record's own privilege annotation, which is what the neighbouring Activate, Deactivate and Delete items already do. Transcribing the slip would make Edit's gate depend on table-level rights rather than the row's |
| Activate / Deactivate a tranche | `RecordInfo(row, RecordInfo.EditPermission)` plus a status test, and for Deactivate `CountIf(seniorDebtInputs, Status = Active) > 1` — the last active tranche cannot be deactivated | `prvWritevsb_financinginput`. The "last active" count is client-side over the mirror collection and two concurrent deactivations both pass it; it belongs in a pre-operation plug-in on `vsb_financinginput` if the invariant matters |
| Delete a tranche | `RecordInfo(row, RecordInfo.DeletePermission)` plus `Tranche Status` neither Credit Agreement nor Standard Assumption, plus more than one input | `prvDeletevsb_financinginput`. Deleting cascades to `vsb_financinginputsrepaymentamount` and the step-up margin rows; the rebuild issues all three in one changeset (UT-FIN-098) where the canvas issues `Concurrent(RemoveIf(…), RemoveIf(…)); Concurrent(Remove(…), …)`, which can half-fail |
| Writing `'Financing Options'` on the project | `Patch(Projects, gblRecordSelectedProject, {'Financing Options': …})` from the radio's `OnChange`, and again UNCONDITIONALLY from `OnVisible` | `prvWritevsb_project`. This single column drives rule 15's whole status cascade, so a caller who can write it can deactivate every debt input on the project. It is the strongest candidate on this screen for a Field Security Profile whose Update is granted narrowly |
| Seeding the five missing `Financing Inputs` | Five `If(CountIf(…) = 0, IfError(Patch(…), Notify(…)))` pairs in `OnVisible` — a write on read, from the client, with the failure swallowed. Two users opening the screen at once both see zero and both create | `prvCreatevsb_financinginput`, and a `vsb_EnsureFinancingInputs` custom API to make it atomic. `planSeeds()` is idempotent by construction, which removes the double-write on a *single* client; it cannot remove the cross-client race |
| The category command bar's Activate / Deactivate | `pcf_ProjectRevenues_Content_ContractCommandBar_2` (misnamed — it is the Finance category bar, source ambiguity 9): visible only for `Order in [2, 5]`, enabled on the record's edit permission | `prvWritevsb_financinginput`. `categoryCommandBar(order, status, canEditRecord)` keeps the `Order`-based eligibility, which is data-driven and not a privilege |
| The five-part page lock | `con_Milestones_Page_LockMessage_8.Visible` — a client-side completeness test, **not a permission check** | Nowhere, and that is the finding. A user with `prvWritevsb_financinginput` can PATCH a tranche with the page locked. `isPageLocked()` is imported from `features/revenues/rules.ts` so the two screens cannot drift apart |
| Reading the three assumption mirrors | `ClearCollect(colAssumptionBanks, 'Assumptions Banks SQL')` and `ClearCollect(colAssumptionKfWs, AssumptionsKfWTrancheSQL)` — WHOLE tables, at app start, from the client | Read at Organization scope on the mirrors, with `assumptionsDebtRepo` filtering server-side on country and debt type. Every value is untrusted text: `assumptionNumber` returns `NaN` rather than throwing, and `swapRateForYear` returns `null` past 2030 rather than 0 |
| The `Owning Business Unit` stamp | Copied client-side from `gblRecordSelectedProject.'Besitzer (Unternehmenseinheit)'` on every seeded row | A pre-operation Create plug-in on `vsb_financinginput` deriving `owningbusinessunit` from the parent project |

#### Deliberate divergences

- **The canvas OVERWRITES `Debt Financing` over `All Equity` on every visit to the screen. The rebuild does not. This is a product decision already taken, not an open question.** `Project Finance Screen.OnVisible` runs `Patch(Projects, gblRecordSelectedProject, {'Financing Options': 'Financing Options'.'Debt Financing'})` at the top level of its `Concurrent` — not inside any `If`, not guarded by a blank test. Since `rad_ProjectFinance_FinancingOptions.OnChange` lets the user choose `All Equity` and writes it to the same column, the choice survives exactly until the next time anyone opens the screen; and because rule 15's cascade then reads the overwritten value, the project ends up claiming `Debt Financing` while its tranches sit Inactive from the earlier `All Equity` switch. `financingOptionOnVisit(current)` fires the patch **only when the column has never been set**, so a project that already carries a choice keeps it (`rules.ts:1616`, and the guarded write is in `useSeedFinancingInputs` in `hooks.ts:497`). `unconditionalDebtFinancingCanvasParity()` is the twin: it returns `Debt Financing` unconditionally and exists so the shipped behaviour can be restored in one place if a product owner ever asks for it. Both are asserted by the same test — the `SOURCE DEFECT: OnVisible would overwrite All Equity on every visit; guarded` case in the `financing-option cascade (rules 15–16)` describe block, which pins that the guard returns the default for `null`, `null` for either existing choice, and that the parity function still returns `Debt Financing`. The decision is recorded in four places in the code — `rules.ts:36` (defect list), `rules.ts:1604` (at the rule), `hooks.ts:497` (at the write) and `Screen.tsx:23` — and it is not to be re-opened during the build.
- **`MarginDSRA` reads the DSRF category in the canvas; the rebuild reads `"margin dsra"` with a documented fallback** (ambiguity 2, `rules.ts:478`). `locStandardDSRA_DSRF.MarginDSRA` looks up `category = "margin dsrf"`, byte-identical to `.MarginDSRF` (`Project Finance Screen.pa.yaml` lines 187 and 233), and no `"margin dsra"` lookup exists anywhere in the screen. The seed then writes `If(type = DSRF, MarginDSRF, MarginDSRA)`, so a DSRA project silently receives the DSRF margin — and DSRA is allowed a NEGATIVE margin while DSRF is not, so the two are not interchangeable. `buildDsraStandard` reads the correct category and falls back to `"margin dsrf"` when the row is absent, which reproduces the canvas result exactly while the SQL table has no DSRA row and corrects it the day one appears; `opts.canvasParityMarginDsra: true` forces the shipped path and `marginDsraCanvasParity()` is asserted directly. Whether the table genuinely has no DSRA row is a data question, not a code one. Pinned by the `SOURCE DEFECT: MarginDSRA reads the DSRF category in the canvas` case in the `DSRA/DSRF standard assumption (rule 7)` block, plus UT-FIN-075 for the negative-margin asymmetry.
- **The swap rate has no fallback after 2030** (ambiguity 8). `Switch(Year(Today()), 2025, swap_rate_10y_2025, … 2030, swap_rate_10y_2030)` yields blank from 1 January 2031, so a freshly seeded senior-debt tranche would get no swap rate at all. `swapRateForYear` returns `null` — not `0` — so the blank stays visible instead of silently structuring debt at a 0 % swap, and `SWAP_RATE_FIRST_YEAR` / `SWAP_RATE_LAST_YEAR` name the cliff so a test fails when it arrives rather than a project mis-pricing quietly. Pinned by UT-FIN-007 and UT-FIN-008.
- **Two control names contradict their bodies** (ambiguity 9). `pcf_btn_GeneralData_RightPanel_Equity_Form_Buttons_Save_1.OnChange` saves DSRA/DSRF, and `pcf_ProjectRevenues_Content_ContractCommandBar_2` is the Finance category command bar. Every function in `rules.ts` is named after what the formula DOES, with the canvas control name in its doc comment so the provenance is still greppable.
- **`RecordInfo(row, DataSourceInfo.EditPermission)` on Edit Tranche is not transcribed.** The rebuild uses the record's own write privilege, consistent with the four sibling items. Reproducing the enum slip would make Edit depend on table-level rights while Activate, Deactivate and Delete depend on row-level ones.
- **`con_FinancingInput_SeniorDebtCalculationStatus` is not ported** (ambiguity 11). Its `.Visible` is hard-coded `false` with its real predicate commented out, so nothing observable depends on it.
- **The `varLang` wrapper is imported, not copied.** `With({varLang: …}, Switch(varLang, "en", Value(x), Value(Substitute(x, ".", ","))))` appears around each of the 27 senior-debt fields and again for DSRA/DSRF and Decommissioning. `assumptionNumber` is imported from `features/revenues/rules.ts` so the two screens cannot drift apart — a cross-feature import that is deliberate and worth noticing in review.
- **`GUIDE q26`: the `Edit Tranche` panel scrolls, its Status options disable conditionally, and five controls that had columns and state but no UI were added** — Drawdown, Upfront Fee, Commitment Fee with its free period, and Base Rate. `trancheStatusOptionDisabled` is the pure predicate behind the conditional disabling.

#### Build steps

1. Finish screen 17 first: `assumptionNumber`, `pageLock` and `isPageLocked` are imported from `features/revenues/rules.ts`, and confirm the five lock bullets clear for the test project.
2. Add the eleven repositories and the `CHOICE_FINANCE` / `ES_FINANCE` members to `src/data`, checking `INPUT_COL`, `REPAYMENT_COL`, `STEPUP_COL` and `PROJECT_COL` against `sol/customizations.xml` — including the double-plural entity set for the step-up margins.
3. Write the assumption readers and the three standard-assumption builders — `buildCategoryMap`, `CATEGORY_ORDER`, `sliceDebtAssumptions`, `toDebtAssumptionRow`, `debtText`/`debtValue`/`debtPercent`, `debtTechColumn`, the `decode*` family, `swapRateForYear`, `financialClose`, `buildSeniorDebtStandard`, `buildDsraStandard` (with `canvasParityMarginDsra`), `marginDsraCanvasParity`, `buildDecommissioningStandard`.
4. Write the divergence pair and the cascade — `financingOptionOnVisit`, `unconditionalDebtFinancingCanvasParity`, `applyFinancingOptionCascade`, `toggleTrancheStatus`, `toggleDsraStatus` — and add the `financing-option cascade (rules 15–16)` tests before anything calls them, so the guard cannot be built the canvas way by accident.
5. Write the tranche sub-forms — `buildUniqueKey`, `isDuplicateTranche`, `standardAssumptionConflict`, `parseDscr`/`formatDscr`/`validateDscr`, `regenerateRepaymentYears`, `repaymentDiff`, `validateRepaymentAmount`, the `stepUp*` family with `stepUpScheduleValid` and `stepUpWrites`, `packMMYY`/`unpackMMYY`/`padMMYY`/`mmyyLabel`, `dsrfOnlyFields`, `defaultEndOfDebtServiceSavings`, `endDateOfSaving`.
6. Write the equity, VAT and gating rules — `totalDevexCapex`, `shareholderLoan`, `freeEquityCap`, `freeEquityLabel`, `validateFreeEquity`, `canSaveVatFinancing`, `validateVatBankMargin`, `validateVatFacilityAmount`, the remaining `validate*` functions, `canSaveSeniorDebtTranche`, `seniorDebtCommandBar`, `categoryCommandBar`, `trancheStatusOptionDisabled`, `resetOnTrancheStatusChange`, `trancheDeletePlan`, `planSeeds`, `serialiseStandardFlags`/`parseStandardFlags`.
7. Write `rules.test.ts` to 127 cases covering UT-FIN-001…102 across the nineteen describe blocks — including both parity twins — and run `npx vitest run src/features/finance`.
8. Write `hooks.ts` — the reference and project-scoped queries, `useSeedFinancingInputs` with the guarded `'Financing Options'` write, `useSaveSeniorDebtTranche` as one `$batch`, `useDeleteSeniorDebtTranche` as one cascade changeset, and a 403 pre-check on every mutation.
9. Compose `Screen.tsx` — page lock, the financing-options radio, six category cards, the tranche grid with `seniorDebtCommandBar`, the scrolling `Edit Tranche` panel with its five added controls, the repayment and step-up sub-grids — then verify `npx tsc --noEmit | grep features/finance` is empty.

#### Exit gate

`npx vitest run src/features/finance` passes all 127 UT-FIN cases including the two canvas-parity assertions, and `npx tsc --noEmit | grep features/finance` is empty. The behavioural gate is the divergence: set a project to `All Equity`, navigate away, return to the screen, and `vsb_project.vsb_financingoptions` still reads `All Equity` with **zero PATCH issued against `Projects`** on that second visit — while a project whose column has never been set receives exactly one write of `Debt Financing`, and the five seed rows are created once and not re-created on the visit after that.

---

## 10. Phase 3 — Project Costs app screens

Five screens, 71 build-days, 771 logic blocks, 28,878 lines of Power Fx inside them (44,724 across
all properties). Every one reads master data an admin screen owns, which is why this phase is last
and why Phase 1 is first.

Build `capex-costs` first despite it being band XL: the other three cost screens read grids it
establishes and `add-costs-from-table` is a panel over its data. Capex Costs is the densest logic
in the solution — 107 blocks of 30 lines or more, and 17,691 lines inside its blocks, more than any
other screen by a wide margin.

Two carried-forward conditions apply across the phase. **Standard-contract instantiation is computed
and tested but not written**: it wants `vsb_CreateCapexStandardContract` and its siblings as
Dataverse custom APIs, and until they exist the three affected screens compute a result they cannot
persist. And **`Opex Costs`, `Land Lease Costs` and `Add Costs from Table` were built from the
`.msapp` sources without screenshots**, unlike most Project Management screens — their exit gates
declare inferred layout rather than claiming parity they cannot demonstrate.

---
### 19. Capex Costs Screen — `src/features/capex-costs/`

| | |
|---|---|
| Canvas unit | `Cost::Capex Costs Screen` (Cost app) |
| Power Fx | `294` blocks ≥3 lines · `180` ≥10 · `107` ≥30 · `17691` lines in those blocks (`22286` across all `=` properties) |
| Complexity | band `XL` · score `70.8` · `27` build-days |
| Code app | `Screen.tsx` 771 ln · `hooks.ts` 337 ln · `rules.test.ts` 999 ln · `rules.ts` 1452 ln |
| Pure rules exported | `93` |
| Unit tests | `91` cases · IDs `UT-CAPEX-001…UT-CAPEX-058` |
| Dataverse tables | CAPEX Account Lists, CAPEX Costs, CAPEX Project Contracts, Capex Comments, Devex/Capex Standard Assumptions, GeneratorTypeInProjects, Generators, Milestones Standard Assumptions, Project States, Projects, SPVDevCo Mapping Capex Devexes |

#### What it does

The project's DEVEX/CAPEX cost matrix, one cost category per tab plus a `DEVEX/CAPEX Summary` tab. Each tab shows a two-level account → sub-account tree with each sub-account's contracts beneath it, and twelve month columns for one stepped year, closed by a dark-banded `Grand Total` row; an empty cell renders `-` while a real zero renders `0`. A per-row `••• Add → + Add New Cost` flyout opens the contract panel, where a total cost is spread either by equal distribution over a date range or a cluster window, or typed month by month as percentages or absolute amounts. A sub-account can also instantiate a *standard contract* from the country's `Devex/Capex Standard Assumptions` catalogue, which converts a unit cost into money and spreads it over the clusters the assumption is ticked for. Every contract and every month cell carries a threaded comment surface, and every month cell carries a paid/unpaid flag. This is the densest logic in the solution — 107 blocks of thirty lines or more.

#### Depends on

- `src/features/shared/useProjectContext.ts` — the project record and `canEdit`, feeding `useCapexPrivileges(canEdit)`. Unlike the PM screens, the Cost app canvas never computes `CanEditSelectedProject`; the only permission signals here are four `DataSourceInfo` probes on the command bar.
- `src/domain/numeric.ts` — `coalesce`, `isBlank`, `isInteger`, `inRange`, `pfxRound`, `roundDown`, `parseNumber`. `roundDown` is load-bearing twice: the payment count is `RoundDown(span / freq, 0) + 1` and the equal amount is `RoundDown(total / n, 0)`, so a plain `Math.round` changes every distributed figure.
- `src/data/entities.ts` — `ES_COST.capexAccountLists`, `.capexProjectContracts`, `.capexCosts`, `.capexComments` (note the double plural — `vsb_capexcommentses`), `.devexCapexStandardAssumptions`, `.milestonesStandardAssumptions`, `.spvDevCoMappingCapexDevexes`; `CAPEX_ROOT_NUMBER` (`"00001"`, the root whose children are the categories), `OVERLEVERAGING`, `CAPEX_SUMMARY_TAB_NAME`, and **`CHOICE_COST`, not `CHOICE_ADMIN`** — `CHOICE_ADMIN.costPaidType` has DevCo and SPV swapped and an invented `shared` member, so writing it on a `CAPEX Project Contracts` row stores the wrong payer. `DEAD_CAPEX_MARGIN` documents the CAPEX margin feature that exists in the canvas only inside comment blocks and is deliberately not ported.
- `src/data/repos.ts` — `costCapexAccountRepo`, `costCapexContractRepo`, `costCapexCostRepo`, `capexCommentRepo`, `devexCapexAssumptionRepo`, `generatorTypeInProjectRepo`. `milestoneStandardAssumptionRepo` and `spvDevCoMappingRepo` exist and are **not yet wired to this screen** — see the cluster-durations gap below.
- `src/platform/dataClient.ts` — `dataClient.batch`, `WriteOp`. Every Capex write is one `$batch` through `useCapexBatch`; the canvas issues a `Patch` per row inside `ForAll` and a `Remove` per row after it.
- `src/platform/odata.ts` — `f.and`, `f.eq`, `f.guid`, `f.inList`, `asc`. Two server queries per category replace the canvas's seven-step collection chain.
- **A milestone query for `gblClusterDurations`.** `Screen.tsx:156` currently reads `const clusters: ClusterDuration[] = useMemo(() => [], []);` — an empty array. `navigationWindow`, `eligibleClusters`, `clustersHavingCost` and `buildStandardOptions` all take it, and all four degrade quietly: the year window falls back to the project's own dates, and `buildStandardOptions` returns nothing because every option needs at least one eligible cluster. Wiring `milestoneStandardAssumptionRepo` plus the project's own cluster dates into six `ClusterDuration` rows — with `synthesiseClusterDates` for clusters 1–4 and the project's actual values for 5 and 6 — is a prerequisite for the standard-contract path, not a nice-to-have.
- **A Dataverse custom API, `vsb_CreateCapexStandardContract`, which does not exist yet.** See the gap below; it belongs in `src/flows/flowClient.ts` as a typed wrapper next to `vsb_CancelGateApproval`, with siblings `vsb_DeleteCapexContract` for the comment-and-cost cascade and `vsb_DeactivateCapexAccount` for the account cascade. A custom API, not a flow: none of the solution's 17 flows is edited by this rebuild, and `SynchroniseRecalculationCapexStandardCost` — the flow whose name suggests it would help — is registered in `FLOW_REGISTER` with disposition `missing` and is absent from the solution export.
- **Screen 15 (Generators)** supplies `useActiveWtgCount()`; the `EUR/WTG` and `PLN/WTG` units multiply by the count of ACTIVE `GeneratorTypeInProjects` rows, and `'Total Capacity'` drives the `/MW(p)` units.
- **Screen 3 (CAPEX Accounts, `src/features/admin-capex-accounts/`)** owns the chart of accounts this screen renders and the deactivation cascade described under Deliberate divergences. Only `statecode = Active` accounts reach `useCapexAccountTree()`, so an account deactivated there disappears from every category tab here.
- `src/components/` — `PageHeader.tsx`, `CommandBar.tsx`, `DataGrid.tsx` (the month matrix, its `-` convention and its phone layout), `FormPanel.tsx`, `ConfirmDialog.tsx`, `LoadingOverlay.tsx` (the blocking `Please wait, saving costs...` overlay), `NumericInput.tsx`, `TextFieldWithCount.tsx` (the 512-character description and the 250-character comment counters), `StatTile.tsx`, `EmptyState.tsx`.
- Dataverse privileges: create/write/delete on `vsb_capexprojectcontract`, `vsb_capexcost` and `vsb_capexcommentses`; read on `vsb_capexaccountlists`, `vsb_devexcapexstandardassumptionses`, `vsb_milestonesstandardassumptionses`, `vsb_spvdevcomappingcapexdevexes` and the generator tables.

#### Power Fx → TypeScript

##### btn_SaveCost_Execute____.OnChange — 1896 lines → `capexWriteSet()`

Decides, for every month cell in the panel, whether the save writes a row, updates a row, deletes a row or does nothing — the rule that makes a typed zero mean something different from an empty box.

```powerfx
IfError(
    Patch(
        'CAPEX Costs',
        ForAll(
            Filter(
                colCapexFinalDataToPatch,
                And(
                    Not(IsBlank(Cost)),
                    Or(
                        Cost <> 0,
                        Not(IsBlank('CAPEX Cost'.'CAPEX Cost'))// <-- existing record, allow 0 update
                    )
                )
            ) As Data,
            {
                Contract: Data.Contract,
                'CAPEX Cost': Data.'CAPEX Cost'.'CAPEX Cost',
                Cost: Data.Cost,
                Month: Data.Month,
                Year: Value(Data.Year),
                'Owning Business Unit': gblSelectedProject.'Besitzer (Unternehmenseinheit)'
            }
        )
    ),
ClearCollect(
    colCapexToDelete,
    Filter(
        colCapexFinalDataToPatch,
        IsBlank(Cost) && !IsBlank('CAPEX Cost'.'CAPEX Cost')// means this is an existing record, not Defaults
    )
);
ForAll(
    colCapexToDelete As D,
    Remove(
        'CAPEX Costs',
        D.'CAPEX Cost'
    )
);
// … [1858 of the block's 1896 lines omitted]
```

```typescript
export function capexWriteSet(
  rows: { year: number; month: number; cost: number | null; costId: string | null }[],
): CapexWriteSet {
  const upserts: CapexWriteSet["upserts"] = [];
  const deletes: string[] = [];
  for (const r of rows) {
    if (r.cost === null || r.cost === undefined) {
      if (r.costId) deletes.push(r.costId);
      continue;
    }
    if (r.cost !== 0 || r.costId) {
      upserts.push({ year: r.year, month: r.month, cost: r.cost, costId: r.costId });
    }
  }
  return { upserts, deletes };
}
```

**Shape change** — a 1 896-line hidden "code button" that built four successive collections (`colCapexEditContract`, `colCapexFinalDataToPatch`, `colCapexToDelete`, plus the twelve-column-per-year `colNewEditPanelCostProcessed`) becomes one pure function over a flat `{year, month, cost, costId}` array. Both halves of the canvas's rule survive intact and are the reason this is not a naive upsert: a `0` is written only when the row already exists (`Cost <> 0` OR `'CAPEX Cost'` is not blank), and a blank with an id is a DELETE rather than a no-op. `Patch(table, ForAll(...))` plus a separate `ForAll(..., Remove(...))` become one `$batch` through `useCapexBatch`, so a save can no longer land its updates and lose its deletes. `IfError(…, Trace(…); Notify(…))` — which reports the failure and then continues as if it had succeeded — becomes an `AppError` on the mutation, and the panel keeps the user's input on failure (UT-CAPEX-057). The `'Owning Business Unit'` copied client-side from the project belongs in a pre-operation Create plug-in.
**Pinned by** — UT-CAPEX-021, UT-CAPEX-022, UT-CAPEX-057.

##### btn_Capex_Cost_Refresh_Capex_Cost_Code.OnSelect — 1279 lines → `buildGrid()`

Decides the whole row model the grid renders: which accounts, which sub-accounts, which contracts, and what each of the twelve month cells holds at each level.

```powerfx
UpdateContext({locIsVisibleLoadingCostSpinner: true});
// 1. Build selected category collections directly.
// Do not depend on timer for this.
// 3. Build account + subaccount rows only for selected category.
ClearCollect(
    colAllGroupedAccounts,
    Ungroup(
        ForAll(
            colCapexAccountsInSelectedCategoryNew As AccountRow,
            Table(
                {
                    vsb_capexaccountlistid: AccountRow.'CAPEX Account List',
                    vsb_name: AccountRow.Name,
                    vsb_number: AccountRow.Number,
                    vsb_costdescription: "",
                    IsAccount: true,
                    IsContract: false,
                    vsb_parentaccountid: AccountRow.'Parent Account'.'CAPEX Account List',
                    vsb_statusbool: If(
                        AccountRow.Status = 'Status (CAPEX Account Lists)'.Active,
                        true,
                        AccountRow.Status = 'Status (CAPEX Account Lists)'.Inactive,
                        false,
                        true
                    ),
                    vsb_AccountCategory: locSelectedCapexAccountCategory.'CAPEX Account List',
                    IsStandardContract: false,
                    SubLabel: Blank(),
                    CostPaidBy: "",
                    DistributionType: ""
                },
                ForAll(
                    Filter(
                        colCapexSubaccountsInSelectedCategoryNew,
                        'Parent Account'.'CAPEX Account List' = AccountRow.'CAPEX Account List'
                    ) As SubRow,
// … [1243 of the block's 1279 lines omitted]
```

```typescript
export function buildGrid(input: GridInput): GridRow[] {
  const {
    accounts, subaccounts, contracts, flat, allCosts,
    commentFlags, showEmptyAccounts = true, costPaidByFilter = "all",
  } = input;
// … [16 lines omitted]
  const sumInto = (
    rows: FlatCost[],
    months: (number | null)[],
    paid: boolean[],
    flagPaid: boolean,
  ) => {
    for (const r of rows) {
      if (r.monthIndex < 1 || r.monthIndex > 12) continue;
      const i = r.monthIndex - 1;
      // GUIDE r06 — a month only leaves `null` (renders "-") once a cost row actually
      // lands in it; a row present with cost 0 stays a real, visible zero.
      months[i] = (months[i] ?? 0) + r.cost;
      // Rule 10 — a month cell is paid if ANY cost row in it is paid, contracts only.
      if (flagPaid && r.isPaid) paid[i] = true;
    }
  };

  const out: GridRow[] = [];
  for (const account of [...accounts].sort((a, b) => a.order - b.order)) {
    const accountMonths = emptyMonths();
    sumInto(usable.filter((f) => f.accountId === account.id), accountMonths, emptyFlags(), false);
// … [55 lines omitted]
    out.push({
      id: account.id, type: "account", number: account.number, name: account.name,
      subLabel: "", parentId: null,
      m: accountMonths, mPaid: emptyFlags(),
      ...accountTotals,
      hasComments: false, mHasComments: emptyFlags(),
      isStandard: false, costPaidByText: "", distribution: null,
    }, ...subRows);
  }
  return out;
}
```

**Shape change** — a seven-step chain of `ClearCollect`s (accounts → sub-accounts → contracts → costs → reference → grouped → optimised), re-run in full after every write via `Select(btn_Capex_Cost_Reload_PCF_After_Mutation_Code)`, becomes TWO server queries per category plus one pure builder and a `invalidateQueries(['capex', projectId])`. Four timers that existed only because `App.OnStart` collections were not ready when `OnVisible` ran (`tmr_Capex_Initial_Load` at 500 ms repeating, `tmr_Capex_Cost_Category_SwitchTabs`, `tmr_Capex_Cost_Cost_EnrichLoader`, `tmr_Load_Contract_Gallery_Warmup`) are deleted outright, along with `cmp_Hotfix_CDN_FluentUI` and the five hidden code buttons. `Ungroup(ForAll(..., Table({account}, ForAll(..., {subaccount}))))` — a flatten-a-nested-table idiom — becomes an ordinary nested loop returning a typed `GridRow[]`. The `vsb_statusbool` three-arm `If` disappears because only Active accounts are ever fetched (UT-CAPEX-008), and `null` versus `0` in a month cell is preserved deliberately: `-` means no cost row exists, `0` means one exists and is zero.
**Pinned by** — UT-CAPEX-008, UT-CAPEX-009, UT-CAPEX-010, UT-CAPEX-006b, UT-CAPEX-011, UT-CAPEX-012, UT-CAPEX-013, UT-CAPEX-056.

##### btn_Capex_Cost_Add_Standard_Contract_Code.OnSelect — 696 lines → `standardAssumptionAmount()`

Decides how much money a standard contract is worth — converting the assumption's unit cost into a project total — and which clusters it may be spread over.

```powerfx
locNumberOfActiveWTGs: Sum(
    Filter(
        GeneratorTypeInProjects,
        Project.Project = gblSelectedProject.Project,
        Status = 'Status (GeneratorTypeInProjects)'.Active
    ),
    'Number of Generators'
)
},
Switch(
    varStandardContractAssumption.Unit,
    'Cost Unit'.EUR,
    Value(varStandardContractAssumption.'Cost Amount'),
    'Cost Unit'.PLN,
    Value(varStandardContractAssumption.'Cost Amount'),
    'Cost Unit'.'EUR/WTG',
    Round(
        Value(locNumberOfActiveWTGs * Value(varStandardContractAssumption.'Cost Amount')),
        0
    ),
    'Cost Unit'.'PLN/WTG',
    Round(
        Value(locNumberOfActiveWTGs * Value(varStandardContractAssumption.'Cost Amount')),
        0
    ),
    'Cost Unit'.'EUR/MW(p)',
    Round(
        Value(locTotalCapacity * Value(varStandardContractAssumption.'Cost Amount')),
        0
    ),
    'Cost Unit'.'PLN/MW(p)',
    Round(
        Value(locTotalCapacity * Value(varStandardContractAssumption.'Cost Amount')),
        0
    )
)
)
varApplicableStartCostClusterNo: If(
    Coalesce(
        locProjectStartClusterNo,
        0
    ) >= 5,
    5,
    Coalesce(
        locProjectStartClusterNo,
        0
    )
),
// … [648 of the block's 696 lines omitted]
```

```typescript
export function standardAssumptionAmount(
  unit: number | null,
  costAmount: number | null,
  ctx: { totalCapacity: number | null; activeWtgCount: number },
): number {
  const amount = costAmount ?? 0;
  switch (unit) {
    case CHOICE_COST.costUnit.eurPerWtg:
    case CHOICE_COST.costUnit.plnPerWtg:
      return pfxRound(ctx.activeWtgCount * amount, 0);
    case CHOICE_COST.costUnit.eurPerMw:
    case CHOICE_COST.costUnit.plnPerMw:
      return pfxRound((ctx.totalCapacity ?? 0) * amount, 0);
    default:
      return amount;
  }
}

/** Rule 17 — `varApplicableStartCostClusterNo: If(locProjectStartClusterNo >= 5, 5, …)`. */
export function applicableStartCluster(startClusterNo: number | null | undefined): number {
  const n = startClusterNo ?? 0;
  return n >= 5 ? 5 : n;
}

export function eligibleClusters(
  assumption: Pick<DevexCapexAssumption, "clusters">,
  clusterDurations: ClusterDuration[],
  startClusterNo: number | null,
): ClusterDuration[] {
  const floor = applicableStartCluster(startClusterNo);
  const idx = (y: number, m: number) => y * 12 + m;
  return clusterDurations.filter((c) => {
    if (!assumption.clusters[c.order - 1]) return false;
    if (!c.startYear || !c.endYear || !c.startMonth || !c.endMonth) return false;
    if (idx(c.endYear, c.endMonth) < idx(c.startYear, c.startMonth)) return false;
    return floor === 0 || c.order >= floor;
  });
}
```

**Shape change** — a six-arm `Switch` over `'Cost Unit'` in which the EUR and PLN arms are byte-identical and the four per-unit arms differ only in their multiplier becomes a four-case `switch` on `CHOICE_COST.costUnit` with the currency dropped from the decision entirely: the currency is a property of the project, not of the arithmetic, and `formatSummaryAmount` applies it at display time. `Sum(Filter(GeneratorTypeInProjects, …), 'Number of Generators')` — a cross-table read inside a `With` — becomes `activeWtgCount()` over rows `useActiveWtgCount()` fetched with a server-side status filter. `Round(Value(x * Value(y)), 0)` becomes `pfxRound(x * y, 0)`; the doubled `Value()` was coping with string columns, which the repository mapper now handles. `varApplicableStartCostClusterNo` becomes `applicableStartCluster()` and the cluster-window test becomes `eligibleClusters()`, which additionally rejects a cluster whose dates are missing or inverted — the canvas relies on the data never doing that.
**Pinned by** — UT-CAPEX-031, UT-CAPEX-032, UT-CAPEX-033, UT-CAPEX-034, UT-CAPEX-035, UT-CAPEX-036, UT-CAPEX-037.

##### btn_Right_Panel_Add_Contract_Calculate_Allocated_Cost.OnSelect — 431 lines → `individualDistribution()`

Decides what each typed month box is worth in money: a percentage of the contract total, or an absolute amount.

```powerfx
Clear(colNewEditPanelCostProcessed);
With(
    {
        // Get contract & total cost info
        contractRec: LookUp(
            colCapexProjectContracts,
            'CAPEX Project Contract' = locSelectedCostRow.vsb_capexaccountlistid
        ),
        allYearsCost: Coalesce(
            locSelectedProjectContract.'Total Cost',
            Sum(
                Filter(
                    colCapexCostsInSelectedContracts,
                    Contract.'CAPEX Project Contract' = locSelectedProjectContract.'CAPEX Project Contract'
                ),
                Cost
            ),
            Value(txt_AddContract_RightPanel_TotalCost_1.Value)
        )
    },
    With(
        {
            isPctScheme: rad_AddContract_RightPanel_DistributionScheme_1.Selected.Value = 'Distribution Scheme'.'% Values'
            /*Coalesce(
                contractRec.'Distribution Scheme' = 'Distribution Scheme'.'% Values',
                rad_AddContract_RightPanel_DistributionScheme_1.Selected.Value = 'Distribution Scheme'.'% Values'
            )*/,
            totalCostForPct: allYearsCost
            /*Coalesce(
                contractRec.'Total Cost',
                allYearsCost
            )*/
        },
JanSv: If(
    IsBlank(JanUIv),
    Blank(),
    If(
        isPctScheme && totalCostForPct <> 0,
        Round(
            totalCostForPct * JanUIv / 100,
            0
        ),
        Round(
            JanUIv,
            0
        )
    )
),
// … [383 of the block's 431 lines omitted]
```

```typescript
export function individualDistribution(
  rows: PanelMonthRow[],
  scheme: DistributionScheme,
  totalCostForPct: number,
): { year: number; month: number; cost: number | null; costId: string | null }[] {
  return rows.map((r) => ({
    year: r.year,
    month: r.month,
    cost: r.value === null || r.value === undefined
      ? null
      : scheme === "percent"
        ? pfxRound((totalCostForPct * r.value) / 100, 0)
        : pfxRound(r.value, 0),
    costId: r.costId,
  }));
}

/** `totalCostForPct` — `Coalesce('Total Cost', Sum(existing costs), Value(typed box))`. */
export function totalCostForPercent(
  contractTotal: number | null,
  existingSum: number,
  typed: string,
  language = "en-US",
): number {
  const typedValue = parseNumber(typed, language);
  return coalesce(contractTotal, existingSum || null, Number.isNaN(typedValue) ? null : typedValue)
    ?? 0;
}
```

**Shape change** — the twelve `<Month>UIv` guards and the twelve `<Month>Sv` conversions are written out longhand, once per month, in FOUR near-identical handlers (`btn_SaveCost_Execute____`, `btn_GeneratorData_RightPanel_Form_PvModuleType_Buttons_Save`, `ico_Production_CardHeader_Up_3` and this one) — roughly 1 700 lines of copy-paste for one rule. They become one `.map` over `PanelMonthRow[]`, so the four call sites cannot drift. `Blank()` for an unparseable or empty box becomes `null`, which `capexWriteSet` then reads as "delete if it exists"; `Round(x, 0)` becomes `pfxRound` so half-way values round as Power Fx does. The two commented-out `Coalesce(contractRec.…, radio.…)` alternatives are not resurrected — the live code reads the radio and the typed total, and `totalCostForPercent` reproduces exactly the three-term `Coalesce` the live code uses. The `isPctScheme && totalCostForPct <> 0` guard survives as the `scheme === "percent"` branch over a total that `totalCostForPercent` already floors at 0, so a percentage against a zero total yields 0 rather than `NaN`.
**Pinned by** — UT-CAPEX-018, UT-CAPEX-019, UT-CAPEX-020, UT-CAPEX-021, UT-CAPEX-022.

##### cmd_Costs_ProjectCosts_TableCommandBar.Items — 144 lines → `capexCommands()`

Decides which of the four commands are available, and carries every permission probe on the screen.

```powerfx
Table(
    {
        ItemKey: "addContract",
        ItemDisplayName: "Add New Cost",
        ItemIconName: "Add",
        ItemEnabled: And(
            !Coalesce(
                locIsAddingStandardContract,
                false
            ),
            !locIsVisiblePopUpSpinner,
            Not(IsBlank(locSelectedCostRow)),
            DataSourceInfo(
                'CAPEX Costs',
                DataSourceInfo.CreatePermission
            ),
            !locSelectedCostRow.IsContract
        )
    },
    {
        ItemKey: "addStandardContract",
        ItemDisplayName: "Add Standard Contract",
        ItemIconName: "Add",
        ItemEnabled: And(
            Not(IsBlank(locSelectedCostRow)),
            DataSourceInfo(
                'CAPEX Costs',
                DataSourceInfo.CreatePermission
            ),
            !locSelectedCostRow.IsContract,
            CountRows(varAvailableStandardContracts) > 0
        ),
        ItemVisible: CountRows(varAvailableStandardContracts) > 0,
        ItemGUIDForLoadingStandardContract: Text(First(varAvailableStandardContracts).vsb_devexcapexstandardassumptionsid)
    },
    {
        ItemKey: "deleteCostsInSubaccount",
        ItemDisplayName: "Delete Cost",
        ItemIconName: "Delete",
        ItemEnabled: And(
            Not(IsBlank(locSelectedCostRow)),
            DataSourceInfo(
                'CAPEX Costs',
                DataSourceInfo.DeletePermission
            ),
            locSelectedCostRow.IsContract
        )
    },
// … [96 of the block's 144 lines omitted]
```

```typescript
export function capexCommands(args: {
  selected: { type: GridRowType } | null;
  privileges: CapexPrivileges;
  standardOptionCount: number;
  busy: boolean;
}): CommandGates {
  const { selected, privileges, standardOptionCount, busy } = args;
  const isContract = selected?.type === "contract";
  const isSubaccount = selected?.type === "subaccount";
  return {
    addNewCost: !busy && privileges.canCreateCost && isSubaccount,
    addStandardVisible: standardOptionCount > 0,
    addStandardContract:
      !busy && privileges.canCreateCost && isSubaccount && standardOptionCount > 0,
    edit: !busy && privileges.canCreateCost && isContract,
    deleteCost: !busy && privileges.canDeleteCost && isContract,
  };
}
```

```typescript
export function useCapexPrivileges(canEdit: boolean): CapexPrivileges {
  const user = useAppStore((s) => s.session.user);
  return useMemo(() => ({
    canCreateCost: canEdit,
    // Deleting a contract destroys its cost history; an admin or the project's own editor.
    canDeleteCost: canEdit || Boolean(user?.isApplicationAdministrator),
  }), [canEdit, user]);
}
```

**Shape change** — a `Table(...)` literal whose `ItemEnabled` expressions each re-evaluate `varAvailableStandardContracts` (itself a `Sort(ShowColumns(Filter(...)))` over the assumption catalogue with a per-row `LookUp` against existing contracts) becomes one function over a precomputed `standardOptionCount`, with the option list itself built once by `buildStandardOptions`. `!locIsVisiblePopUpSpinner` and `!Coalesce(locIsAddingStandardContract, false)` — two ad-hoc busy flags — collapse into one `busy` term supplied by the mutation's `isPending`. The two boolean discriminators `IsAccount` / `IsContract` on the flattened row become a `GridRowType` union, so "a sub-account row is selected" is one comparison rather than two negations. The four `DataSourceInfo` probes become `CapexPrivileges`; the canvas gates **Edit on `CreatePermission`**, not on a write probe, and that pairing is transcribed as-is rather than silently upgraded — see the note in `rules.ts:1171`.
**Pinned by** — UT-CAPEX-052, UT-CAPEX-053.

#### Security conditions

| Condition | Canvas today | Where it must be enforced |
|---|---|---|
| May this user edit this project's costs | **The Cost app never computes `CanEditSelectedProject`.** There is no `RecordInfo` call anywhere in `Capex Costs Screen.pa.yaml` and no project-level edit test — the whole screen's permission surface is four `DataSourceInfo` probes on the command bar. That is the finding | `prvCreatevsb_capexcost` / `prvDeletevsb_capexcost` plus row-level Write on the project. The rebuild routes both through `useCapexPrivileges(canEdit)`, where `canEdit` comes from `useProjectContext()` — a project-scope check the canvas does not make at all |
| Add New Cost | `DataSourceInfo('CAPEX Costs', DataSourceInfo.CreatePermission)` AND a sub-account row selected AND neither busy flag set | `prvCreatevsb_capexprojectcontract` and `prvCreatevsb_capexcost`. `capexCommands` takes the privilege as `privileges.canCreateCost`; the row-type test is UI state, not security |
| Edit a contract | `DataSourceInfo('CAPEX Costs', DataSourceInfo.CreatePermission)` — the CREATE probe gates an UPDATE. There is no separate write probe in this screen's `DataSourceInfo` usage | `prvWritevsb_capexprojectcontract` and `prvWritevsb_capexcost`. Transcribed as-is with the discrepancy documented at `rules.ts:1171`, because upgrading it silently would change who can edit; the correct probe is a deliberate change to raise, not to slip in |
| Delete Cost | `DataSourceInfo('CAPEX Costs', DataSourceInfo.DeletePermission)` AND a contract row selected | `prvDeletevsb_capexprojectcontract`, `prvDeletevsb_capexcost`, `prvDeletevsb_capexcommentses`. `useCapexPrivileges` additionally lets an Application Administrator delete, because deleting a contract destroys its whole cost history — that is a widening of the canvas rule and is marked in the hook |
| Deleting a contract's children | The canvas's matching `RemoveIf('CAPEX Costs', …)` is COMMENTED OUT; only the comments are removed explicitly and the cost rows are left to Dataverse cascade behaviour | The `vsb_capexcost` → `vsb_capexprojectcontract` relationship must actually be configured cascade-delete. `planDeleteContract` deliberately does NOT emit cost deletes (adding them would double-delete inside one batch), so if that cascade is not configured, deleting a contract orphans its costs. **Verify the relationship behaviour in the solution before go-live** |
| Instantiating a standard contract | `Patch('CAPEX Project Contracts', …)` plus a `Collect` of the distributed `CAPEX Costs`, from the client, after a client-side duplicate re-check | A Dataverse custom API, `vsb_CreateCapexStandardContract(projectId, subaccountId, assumptionId)`. `checkStandardContractClick` re-queries and refuses at click time (UT-CAPEX-037), but two clients both pass that check and both create; the uniqueness of (project, sub-account, assumption) can only be settled server-side |
| Marking a month cell paid | `Btn_CodeforSettingCostPaidUnpaid` writes `'Cost Paid'` directly, and for a milestone-linked individual cost also strips the cluster link from EVERY cost in the contract | `prvWritevsb_capexcost`. `paidToggleNeedsConfirmation` gates the destructive half behind the verbatim confirmation, and `resolvePaidTarget` refuses with `MSG.noCostRow` rather than writing when no row matches (UT-CAPEX-040). The cluster-link strip is a multi-row write and belongs in the same custom API family |
| Total-cost ceiling | `Value must be between 1 and …` — 2 250 000 000 for Poland, a lower ceiling elsewhere, tested client-side in the panel | A pre-operation plug-in on `vsb_capexprojectcontract` if the ceiling is a control rather than a typo guard. `validateTotalCost` / `totalCostMax` are the client half (UT-CAPEX-026) |
| Comment threads | `Capex Comments` rows created and resolved client-side; `vsb_resolvedby` stamped from `gblCurrentUser` | `prvCreatevsb_capexcommentses` / `prvWritevsb_capexcommentses`, cascading from the parent contract. `resolveThread` stamps the resolver id client-side, which a plug-in should override from the calling user's context — a client-supplied "resolved by" is not evidence |
| The hard-coded fallback project | `LookUp(Projects, Project = GUID("33b9cc79-…"))` — a literal test-project GUID used when no project is selected | Deleted. A missing project id is an error state with `MSG.missingProject`, never a silent default (UT-CAPEX-058). A production user must never be shown another project's costs because a store read came back empty |
| The `Owning Business Unit` stamp | Copied client-side from `gblSelectedProject.'Besitzer (Unternehmenseinheit)'` on every cost row | A pre-operation Create plug-in on `vsb_capexcost` deriving it from the parent contract's project |

#### Deliberate divergences

- **Standard-contract instantiation is COMPUTED AND TESTED BUT NOT WRITTEN. This is a known, open gap in the rebuild, not a divergence that has been settled.** Everything up to the write exists and is under test: `buildStandardOptions` produces the offerable assumptions, `standardAssumptionAmount` converts the unit cost, `eligibleClusters` and `applicableStartCluster` pick the cost periods, `standardContractRefusal` produces the abort message, `checkStandardContractClick` re-checks at click time, and `synthesiseClusterDates` derives clusters 1–4. What is missing is the persistence: `addStandard()` in `Screen.tsx` resolves the option, applies the refusal, and then only calls `setNotice("… will be created with N cost period(s).")` — **no `CAPEX Project Contracts` row and no `CAPEX Costs` rows are created.** The canvas does write, in a 696-line handler that issues a `Patch` plus a `Collect` from the client after a client-side duplicate check. The rebuild's home for it is a Dataverse custom API, **`vsb_CreateCapexStandardContract`**, with siblings `vsb_DeleteCapexContract` (the comment-and-cost cascade) and `vsb_DeactivateCapexAccount` (the account cascade); it is listed under Depends on and it is in the exit gate. Until it ships, `Add Standard Contract` is a preview, and the screen is not feature-complete. No flow is created or edited for this: `SynchroniseRecalculationCapexStandardCost` is absent from the solution export and is registered `missing` in `FLOW_REGISTER`, so calling it throws a named `AppError`.
- **Capex cluster durations are an empty array.** `Screen.tsx:156` reads `const clusters: ClusterDuration[] = useMemo(() => [], []);` with the comment "Until the milestone repository is wired for this screen the window degrades to the project's own dates, which is exactly what `navigationWindow` falls back to." The degradation is graceful but it is not neutral: with no clusters, `eligibleClusters` returns nothing for every assumption, so `buildStandardOptions` returns an empty list, `showStandardSubMenu` is false and the Add Standard Contract command never becomes visible. `clustersHavingCost` also returns nothing, which suppresses the cluster-linkage confirmation. The fix is a milestone query — `milestoneStandardAssumptionRepo` for the durations plus the project's own cluster dates — feeding six `ClusterDuration` rows, and it must land before or with the custom API.
- **The CAPEX deactivation cascade sets sub-accounts Inactive; the canvas sets them Active.** This one lives upstream, in `src/features/admin-capex-accounts/rules.ts`, and it governs which accounts this screen can render, so it is recorded here as an inherited decision. `cmp_Account_PopUpConfirmation_ChangeStatusOfAccount.OnConfirm` sets the account to Inactive and then sets EVERY CHILD to **Active**, while the confirmation the user just read says "All related subaccounts will be automatically deactivated and associated forecasted costs will be deleted." It leaves the tree in a state the UI cannot describe — an inactive parent with active children whose forecast costs have just been destroyed — and because `useCapexAccountTree()` loads only `statecode = Active` rows, those orphaned children keep appearing on this screen under a parent that has gone. `childStatusOnDeactivate()` returns Inactive, which is what the dialog promises; `childStatusOnDeactivateCanvasParity()` returns Active and is asserted by the parity test so the decision is reversible in one place. Pinned by UT-ADCAPEX-019b, with UT-ADCAPEX-018, UT-ADCAPEX-019, UT-ADCAPEX-019c and UT-ADCAPEX-025b covering the cost window and the fact that reactivating does not restore the deleted rows. The durable fix is `vsb_DeactivateCapexAccount(accountId)` doing the status flips and the cost zero/delete in one transaction; the plan is one `$batch` until then.
- **The CAPEX margin feature is not ported.** `App.Formulas: DefaultProjectCostsMarginValue = 10` and the `'Capex Project Cost Margins'` table both exist in the canvas, and every reference to either is commented out — there is no CAPEX margin in the shipped app. `DEAD_CAPEX_MARGIN` in `data/entities.ts` records this so a future reader greps the name and finds the note instead of re-implementing a feature that never shipped. The only live margin is the BoP contract margin on the Contracts screen.
- **`CHOICE_COST` replaces `CHOICE_ADMIN` for this screen's option sets.** `CHOICE_ADMIN.costPaidType` has `spv: 952850001, devCo: 952850002` plus an invented `shared`; the real `Cost paid type` set is `None 952850000, DevCo 952850001, SPV 952850002` with no Shared member. The two are SWAPPED, so writing `CHOICE_ADMIN.costPaidType.devCo` on a `CAPEX Project Contracts` row stores SPV. The admin screens are not changed by this section; `CHOICE_COST` is what the cost screens use, and `costPaidByText` reads from it.
- **The hard-coded fallback project is deleted.** `LookUp(Projects, Project = GUID("33b9cc79-…"))` becomes an error state with `MSG.missingProject`, pinned by UT-CAPEX-058.
- **Four timers, five hidden code buttons and a CDN hotfix component are deleted.** `tmr_Capex_Initial_Load` (500 ms, repeating), `tmr_Capex_Cost_Category_SwitchTabs`, `tmr_Capex_Cost_Cost_EnrichLoader`, `tmr_Load_Contract_Gallery_Warmup`; `btn_Capex_Cost_Refresh_Capex_Cost_Code`, `btn_Capex_Cost_Reload_PCF_After_Mutation_Code`, `btn_Capex_Cost_Build_StandardContractOptions_Code`, `btn_SaveCost_Execute____`, `Btn_CodeforSettingCostPaidUnpaid`; and `cmp_Hotfix_CDN_FluentUI`. All of them existed because `App.OnStart` collections were not ready when `OnVisible` ran. React state plus query invalidation replaces the lot. The three dead view toggles (`…_ShowInactiveAccounts`, `…_FiscalYear`, `…_ProjectTimeline`, all `Visible: false`) go with them.
- **Equal distribution puts the whole remainder on the last payment.** `equalDistributionAmounts` is deliberately NOT a spread-the-remainder algorithm: the canvas stores `RoundDown(total / n, 0)` as the average payment and drops every remaining cent on the final row. Pinned by UT-CAPEX-016 and UT-CAPEX-017, so nobody "improves" it into an even spread.
- **`GUIDE r06/r08`: `-` for empty, a real `0` for zero.** A month cell renders `-` only when no cost row lands in it; a row present with cost 0 renders `0`. The `Grand Total` row sums the ACCOUNT-level rows only — summing every row would double-count — and is dark-banded. `Add New Cost` is a row-level `••• Add` flyout on a sub-account row, not a page-level command. Saving shows the blocking overlay with its verbatim text `Please wait, saving costs...`.

#### Build steps

1. Wire the cluster durations first: add the milestone query feeding six `ClusterDuration` rows from `milestoneStandardAssumptionRepo` plus the project's own cluster dates, replacing `Screen.tsx:156`'s empty array — `navigationWindow`, `eligibleClusters`, `clustersHavingCost` and `buildStandardOptions` are all inert without it.
2. Agree and register the custom APIs — `vsb_CreateCapexStandardContract`, `vsb_DeleteCapexContract`, `vsb_DeactivateCapexAccount` — and add typed wrappers for them in `src/flows/flowClient.ts` beside `vsb_CancelGateApproval`. No flow definition is edited.
3. Add the six repositories and the `ES_COST` / `CHOICE_COST` / `CAPEX_ROOT_NUMBER` / `OVERLEVERAGING` / `CAPEX_SUMMARY_TAB_NAME` constants, checking `ACCOUNT_COL`, `CONTRACT_COL`, `COST_COL`, `COMMENT_COL` and `ASSUMPTION_COL` against `sol/customizations.xml` — including the double-plural entity set for the comments.
4. Write the window and normalisation rules — `costAllowedStart`, `navigationWindow`, `clampSelectedYear`, `projectPeriods`, `canGoPreviousYear`/`canGoNextYear`, `visibleCategories`, `isSummaryTab`, `monthIndex` with its localised and numeric arms — plus the grid model `flattenCosts`, `contractTotals`, `contractSubLabel`, `rollupTotals`, `buildGrid`, `grandTotalRow`, `formatCostCell`, `formatThousands`, `costPaidByText`, `parseByClusterJson`, `parseStartEndJson`.
5. Write the distribution and write-set rules — `distributionSchedule`, `equalDistributionAmounts`, `planEqualDistribution`, `individualDistribution`, `canPersistIndividual`, `capexWriteSet`, `totalCostForPercent`, `clustersHavingCost`, `needsClusterLinkageConfirmation`.
6. Write the standard-assumption and validation rules — `activeWtgCount`, `standardAssumptionAmount`, `applicableStartCluster`, `eligibleClusters`, `standardContractRefusal`, `buildStandardOptions`, `showStandardSubMenu`, `checkStandardContractClick`, `synthesiseClusterDates`, `validateTotalCost`, `totalCostMax`, `validateMonthYear`, `describeDescriptionError`, `applyDescriptionChange`, `byClusterJson`, `canSaveContract`, `capexCommands`, `paidToggleNeedsConfirmation`, `resolvePaidTarget` — and the comment surface `commentThreads`, `renumberThreads`, `gridCommentFlags`, `resolveThread`, `planDeleteRoot`, `sortComments`, `paymentDateCommentsAllowed`, `canSaveComments`, `truncateComment`, `commentName`, `planDeleteContract`, `summaryRows`, `formatSummaryAmount`.
7. Write `rules.test.ts` to 91 cases covering UT-CAPEX-001…058 across the eleven describe blocks, and run `npx vitest run src/features/capex-costs`.
8. Write `hooks.ts` — `useCapexAccountTree` (Active only, one long-lived key), the two per-category queries, `useCapexComments`, `useDevexCapexAssumptions`, `useActiveWtgCount`, `useCapexPrivileges`, and `useCapexBatch` as the single `$batch` mutation with a 403 pre-check.
9. Compose `Screen.tsx` — category tabs plus the summary tab, the month matrix with its `-` convention and dark-banded grand total, the row-level `••• Add` flyout, the contract panel, the comment drawer, the paid confirmation, and the blocking save overlay — then verify `npx tsc --noEmit | grep features/capex-costs` is empty.

#### Exit gate

`npx vitest run src/features/capex-costs` passes all 91 UT-CAPEX cases and `npx tsc --noEmit | grep features/capex-costs` is empty; and the standard-contract gap is closed, demonstrably: with the cluster-duration query wired, `Add Standard Contract` on a sub-account calls `vsb_CreateCapexStandardContract` and the created contract plus its distributed `CAPEX Costs` rows appear in the grid on the next invalidation, while a second call for the same (project, sub-account, assumption) is refused **by the API** and not only by `checkStandardContractClick`. Until that custom API exists this screen does not pass its gate, whatever the test count says.

---
### 20. Contracts Screen — `src/features/contracts/`

| | |
|---|---|
| Canvas unit | `Cost::Contracts Screen` (Cost app) |
| Power Fx | `149` blocks ≥3 lines · `80` ≥10 · `21` ≥30 · `3063` lines in those blocks (`6713` across all `=` properties) |
| Complexity | band `M` · score `32.5` · `15` build-days |
| Code app | `Screen.tsx` 776 ln · `hooks.ts` 301 ln · `rules.test.ts` 685 ln · `rules.ts` 867 ln |
| Pure rules exported | `53` |
| Unit tests | `63` cases · IDs `UT-CONTR-001…UT-CONTR-056` |
| Dataverse tables | BoP Contracts DevCo Costs, BoP Contracts Payment Targets, BoP Contracts Standard Assumptions, BoP Projects Contracts, CAPEX Account Lists, CAPEX Costs, CAPEX Project Contracts |

#### What it does

Balance-of-Plant contracts for one project, grouped into three flavours — Development, Construction and Project Rights — as a list of collapsible cards, each card carrying its own payment-target sub-list with its own command bar. A Development or Construction contract owns a set of level-3 CAPEX accounts picked from a three-level tree, and from that selection plus a closing date it derives four figures: the DevCo costs falling up to and including the closing month, the costs falling after it, their total (or a manual overwrite), and the total cost of contract once the margin is applied. Saving writes the `BoP Projects Contracts` row and *replaces* its whole `BoP Contracts DevCo Costs` join set in the same batch; payment targets are percentage splits capped at 100 in aggregate and dated `MM/YYYY`. The margin defaults come from `Assumptions BoP Contracts`, the only connected (Fabric/SQL) source in the solution, and are looked up case-insensitively on country, technology and contract-type label.

#### Depends on

- `src/domain/numeric.ts` — `isBlank`, `isNumeric`, `parseNumber`, `pfxRound`. `pfxRound` is what makes `paymentTargetHeadroom`'s `Round(100 − …, 1)` and the `"between 0 and 60.0"` message agree with the canvas; `isDecimalWithPlaces` reaches this screen indirectly through `NumericInput`.
- `src/domain/dates.ts` — `formatDate` for the closing-date column.
- `src/data/entities.ts` — `ES_COST` (`bopProjectsContracts`, `bopContractsPaymentTargets`, `bopContractsDevCoCosts`, `capexAccountLists`, `capexCosts`, `capexProjectContracts`, `assumptionsBopContracts`), `CHOICE_COST.closingDateType`, `CHOICE_COST.totalCostsType`, `CHOICE_COST.contractMarginType`, `CHOICE_COST.bopContractTypes`, `CHOICE_COST.costPaidType`, and the two account-number literals `CAPEX_ROOT_NUMBER` (`"00001"`) and `CAPEX_CONTRACT_TREE_EXCLUDED_NUMBER` (`"10006"`).
- `src/data/repos.ts` — `costCapexAccountRepo`, `costCapexContractRepo`, `costCapexCostRepo`, `costBopContractRepo`, `bopPaymentTargetRepo`, `costBopDevCoCostRepo`, `bopAssumptionsRepo`. The last of these is the Fabric/SQL repository and is the only one whose column names are not `vsb_`-prefixed.
- The **Fabric/SQL connection behind `Assumptions BoP Contracts`** must exist in the target environment before the margin-default path can be built or tested. `useBopAssumptions` degrades to an empty list on failure by design, so its absence is not a build blocker — but it makes UT-CONTR-019, UT-CONTR-020 and UT-CONTR-022 the only proof the mapping is right.
- The **Capex Costs screen** must land first: this screen reads `CAPEX Project Contracts` filtered to `'Cost Type' = DevCo` and their `CAPEX Costs` month rows, and derives every figure from them. Without those rows the cost split is untestable against real data.
- `src/platform/dataClient.ts` — `dataClient.batch` and `WriteOp`. Both the contract upsert plus DevCo-cost replacement and the delete cascade go through one batch each.
- `src/platform/odata.ts` — `f.and`, `f.eq`, `f.guid`, `f.inList`, `asc`.
- `src/platform/errors.ts` — `toAppError`; `src/platform/telemetry.ts` — `trace`.
- `src/features/shared/useProjectContext.ts` — the project record and `canEdit`.
- `src/components/` — `PageHeader.tsx`, `Card.tsx`, `DataGrid.tsx`, `CommandBar.tsx`, `FormPanel.tsx`, `ConfirmDialog.tsx`, `LoadingOverlay.tsx`, `EmptyState.tsx`, `NumericInput.tsx` (which also exports `PercentageInput`), `StatTile.tsx`.
- Dataverse privileges: create/write/delete on `vsb_bopprojectscontracts`, `vsb_bopcontractspaymenttargets` and `vsb_bopcontractsdevcocosts`; read on `vsb_capexaccountlist`, `vsb_capexprojectcontract` and `vsb_capexcost`; read on the Fabric source. No flow is called from this screen.

#### Power Fx → TypeScript

##### but_Contracts_RightPanel_NewEdit_Buttons_Recalculate.OnSelect — 170 lines → `deriveFigures()`

Decides all four derived figures at once — the two closing-date halves, the total, and the total cost of contract — and is the only thing in the canvas that sets `locContractDevCoCostsDirty`, which Save requires.

```powerfx
/*Notify(
    $"Recalculation started",
    NotificationType.Information,
    500
);*/
UpdateContext({locContractDevCoCostsCahnged: true});
With(
    {
        varSelectedContractCostsUntilClosingDatePlan: If(
            Not(IsBlank(dtp_Contracts_RightPanel_NewEdit_ContractClosingDate.SelectedDate)),
            With(
                {
                    varColSelectedCAPEXAccounts: ShowColumns(
                        Filter(
                            colSelectedConratctWithDevCoCosts,
                            And(
                                ThisRecord.Selected = true,
                                ThisRecord.Level = 3
                            )
                        ),
                        Id
                    ),
                    varMonth: Month(dtp_Contracts_RightPanel_NewEdit_ContractClosingDate.SelectedDate),
                    varYear: Year(dtp_Contracts_RightPanel_NewEdit_ContractClosingDate.SelectedDate)
                },
                With(
                    {
                        varColSelectedCAPEXContracts: ShowColumns(
                            Filter(
                                colBoPCapexProjectContracts,
                                ThisRecord.Account.'CAPEX Account List' in varColSelectedCAPEXAccounts
                            ),
                            'CAPEX Project Contract'
                        )
                    },
// … [135 of the block's 170 lines omitted]
```

```typescript
export function deriveFigures(
  form: ContractForm,
  costs: CapexCostForContract[],
  tree: AccountNode[],
  language = "en-US",
): {
  until: number | undefined;
  after: number | undefined;
  total: number | undefined;
  totalOfContract: number | undefined;
} {
  const closing = toClosingDate(form.closingDate);
  const accountIds = selectedLevel3Ids(tree);
  const until = costsUntilClosing(costs, closing, accountIds);
  const after = costsAfterClosing(costs, closing, accountIds);
  const total = totalCosts(form, { until, after }, language);
  return {
    until,
    after,
    total,
    totalOfContract: totalCostOfContract(total, {
      enabled: form.marginEnabled, type: form.marginType,
      percentage: form.marginPercentage, fixedValue: form.marginFixedValue,
    }, language),
  };
}
```

**Shape change** — a 170-line imperative recalculation triggered by a button becomes four small pure functions composed by one derivation, recomputed on every render from the form and the cost set. The `colSelectedProjectCapexContractsCosts` collection with its `vsb_`-prefixed join columns becomes a typed `CapexCostForContract[]` whose `accountId` and `costType` are carried down from the parent contract at mapping time, so the in-formula two-hop `ThisRecord.vsb_Contract.'CAPEX Project Contract' in …` disappears. The canvas' two-sum arithmetic is preserved exactly rather than rewritten as a single month comparison, because UT-CONTR-010 pins that `until + after` equals the unfiltered total. `locContractDevCoCostsDirty` — settable only by the deleted Recalculate button — is replaced by `form.isDirty`.
**Pinned by** — UT-CONTR-008, UT-CONTR-009, UT-CONTR-010, UT-CONTR-011, UT-CONTR-012, UT-CONTR-013, UT-CONTR-014, UT-CONTR-053, UT-CONTR-056.

##### pcf_Contracts_RightPanel_NewEdit_Buttons_Save.OnChange — 180 lines → `contractWritePayload()`

Decides which of each mutually exclusive column pair is written and which is blanked.

```powerfx
UpdateContext(
    {
        locContractSpinnerInformationText: "Saving Contract data...",
        locIsContractVisiblePopUpSpinner: true
    }
);
IfError(
    With(
        {
            varUpdatedContract: Patch(
                'BoP Projects Contracts',
                If(
                    IsBlank(locSelectedContract),
                    Defaults('BoP Projects Contracts'),
                    locSelectedContract
                ),
                {
                    Name: $"BoP-{gblSelectedProject.'Project ID'}-{txt_Contracts_RightPanel_NewEdit_Description.Value}",
                    Project: gblSelectedProject,
                    Description: Trim(txt_Contracts_RightPanel_NewEdit_Description.Value),
                    'BoP Standard Assumption Contract': Blank(),
                    'Closing Date': dtp_Contracts_RightPanel_NewEdit_ContractClosingDate.SelectedDate,
                    'Contract Types': locSelectedContractType,
                    'Costs Until Closing Date [EUR]': rad_Contracts_RightPanel_NewEdit_CostsUntilClosingDate.Selected.Value,
                    'Costs Until Closing Date Plan': If(
                        rad_Contracts_RightPanel_NewEdit_CostsUntilClosingDate.Selected.Value = 'Closing Date Type'.Plan,
                        Value(txt_Contracts_RightPanel_NewEdit_CostsUntilClosingDate_Plan.Value),
                        Blank()
                    ),
                    'Costs Until Closing Date Actual': If(
                        rad_Contracts_RightPanel_NewEdit_CostsUntilClosingDate.Selected.Value = 'Closing Date Type'.Actual,
                        Value(txt_Contracts_RightPanel_NewEdit_CostsUntilClosingDate_Actual.Value),
                        Blank()
                    ),
// … [146 of the block's 180 lines omitted]
```

```typescript
export function contractWritePayload(
  form: ContractForm,
  computed: { until: number | undefined; after: number | undefined },
  language = "en-US",
): Record<string, number | boolean | string | null> {
  const nOrNull = (v: string) => {
    const n = parseNumber(v, language);
    return Number.isNaN(n) ? null : n;
  };
  const marginVisible = form.marginEnabled;
  const total = totalCosts(form, computed, language);

  return {
    costsUntilClosingType: form.untilType,
    costsUntilClosingPlan:
      form.untilType === CHOICE_COST.closingDateType.plan ? computed.until ?? null : null,
    costsUntilClosingActual:
      form.untilType === CHOICE_COST.closingDateType.actual ? nOrNull(form.untilActual) : null,
// … [23 lines omitted]
    isStandardContract: false,
    isMarginStandardAssumption: form.isMarginStandardAssumption,
    bopStandardAssumptionContract: null,
  };
}
```

**Shape change** — the payload no longer reads control values; it reads a typed `ContractForm`, so the same rule is testable without a panel. `IfError(…, Notify(…FirstError.Details.HttpResponse))` — which leaked an HTTP response body into a toast — becomes an `AppError` from `toAppError` surfaced in the panel's error area, with the panel staying open so the entry is not lost (UT-CONTR-054). The `ForAll(…, Patch(…))` that rewrote the DevCo-cost joins one row at a time becomes `planDevCoCostSet()` returning `{ deleteIds, create }`, sent with the contract upsert in a single `dataClient.batch`.
**Pinned by** — UT-CONTR-029, UT-CONTR-030, UT-CONTR-031, UT-CONTR-032, UT-CONTR-034, UT-CONTR-035, UT-CONTR-036, UT-CONTR-054.

##### cmd_Contracts_CommandBar.Items — 53 lines → `contractCommands()`

Decides which of the five commands are enabled, and carries the Delete-privilege defect.

```powerfx
=Table(
    {
        ItemKey: "newDevContarct",
        ItemDisplayName: "Add Development Contract",
        ItemIconName: "Add",
        ItemEnabled: DataSourceInfo(
            'BoP Projects Contracts',
            DataSourceInfo.CreatePermission
        )
    },
    {
        ItemKey: "editContarct",
        ItemDisplayName: "Edit",
        ItemIconName: "Edit",
        ItemEnabled: And(
            Not(IsBlank(locSelectedContract)),
            RecordInfo(
                locSelectedContract,
                RecordInfo.EditPermission
            )
        )
    },
    {
        ItemKey: "deleteContarct",
        ItemDisplayName: "Delete",
        ItemIconName: "Delete",
        ItemEnabled: And(
            Not(IsBlank(locSelectedContract)),
            RecordInfo(
                locSelectedContract,
                RecordInfo.EditPermission
            )
        )
    }
)
// … [18 of the block's 53 lines omitted]
```

```typescript
export function contractCommands(args: {
  selected: BopContract | null;
  permissions: ContractPermissions;
  busy: boolean;
}): ContractCommandGates {
  const { selected, permissions, busy } = args;
  const add = permissions.canCreate && !busy;
  return {
    addDevelopment: add,
    addConstruction: add,
    addRights: add,
    edit: !busy && selected !== null && permissions.canEditRecord,
    delete: !busy && selected !== null && permissions.canDeleteRecord,
  };
}

export function contractCommandsCanvasParity(args: {
  selected: BopContract | null;
  permissions: ContractPermissions;
}): Pick<ContractCommandGates, "edit" | "delete"> {
  const enabled = args.selected !== null && args.permissions.canEditRecord;
  return { edit: enabled, delete: enabled };
}
```

**Shape change** — a data table of records whose `ItemEnabled` cells each call a synchronous platform function becomes one pure gate record plus a `busy` input the canvas did not have (it disabled nothing while a save was in flight). `DataSourceInfo.CreatePermission` and `RecordInfo.*Permission` become named booleans on `ContractPermissions`, filled from the server-answered privileges rather than from a role name — so the gate is one value the test can vary. The five labels are frozen as `CONTRACT_COMMAND_LABELS`, confirmed against the recording in `GUIDE-PARITY.md`.
**Pinned by** — UT-CONTR-049, UT-CONTR-050, UT-CONTR-047.

##### Contracts Screen.OnVisible — 281 lines → `buildAccountTree()` + `useCapexAccountRows()`

Loads six collections and builds the three-level CAPEX account picker the contract selects from.

```powerfx
UpdateContext({locContractScreenLoading:true});

UpdateContext(
    {
        locContractsCostsMax: 1000000000,
        locSelectedContract: First(
            FirstN(
                'BoP Projects Contracts',
                0
            )
        ),
ClearCollect(
    colBoPContracts,
    AddColumns(
        Filter(
            'BoP Projects Contracts',
            Project.Project = gblSelectedProject.Project
        ),
        IsFolded,
        true
    )
);
ClearCollect(
    colBoPCapexProjectContracts,
    Filter(
        'CAPEX Project Contracts',
        And(
            Project.Project = gblSelectedProject.Project,
            'Cost Type' = 'Cost paid type'.DevCo
        )
// … [252 of the block's 281 lines omitted]
```

```typescript
export function buildAccountTree(
  accounts: CapexAccountRow[],
  capexContracts: DevCoCapexContract[],
): AccountNode[] {
  const root = accounts.find((a) => a.number === CAPEX_ROOT_NUMBER);
  if (!root) return [];

  const devCoTotals = new Map<string, number>();
  for (const c of capexContracts) {
    if (c.costType !== CHOICE_COST.costPaidType.devCo) continue;
    if (!c.accountId) continue;
    devCoTotals.set(c.accountId, (devCoTotals.get(c.accountId) ?? 0) + (c.totalCost ?? 0));
  }

  const childrenOf = (id: string) =>
    accounts.filter((a) => a.parentId === id).sort((a, b) => a.order - b.order);

  const out: AccountNode[] = [];
  for (const level1 of childrenOf(root.id)) {
    if (level1.number === CAPEX_CONTRACT_TREE_EXCLUDED_NUMBER) continue;
    const level2s = childrenOf(level1.id);
    out.push(node(level1, 1, null, null, level2s.length, 0));
    for (const level2 of level2s) {
      const level3s = childrenOf(level2.id);
      out.push(node(level2, 2, level1.id, null, level3s.length, 0));
      for (const level3 of level3s) {
        out.push(node(
          level3, 3, level1.id, level2.id, 0, devCoTotals.get(level3.id) ?? 0,
        ));
      }
    }
  }
  return out;
// … [16 lines omitted]
}
```

**Shape change** — twelve `UpdateContext` locals and six `ClearCollect`s become five `useQuery` calls keyed by `bopKeys`, each carrying its own OData `$filter`; the `First(FirstN(T, 0))` idiom used purely to type a blank local disappears with the types. `ClearCollect(colCapexAllAccountsTemporary, 'CAPEX Account Lists')` — a full-table load to build the picker — becomes a filtered `listAll` on `statecode = active` ordered by `vsb_order`, and the flattening into levels happens once in a pure function instead of inside three nested galleries. `AddColumns(…, IsFolded, true)` becomes a field on the typed node.
**Pinned by** — UT-CONTR-002, UT-CONTR-003, UT-CONTR-004, UT-CONTR-005, UT-CONTR-006, UT-CONTR-007, UT-CONTR-001.

##### fn_Numeric.IsTwoDecimal — 24 lines → `validateCostValue()` + `isDecimalWithPlaces()`

Decides whether a typed cost is a two-decimal number — and, in the canvas, decides it wrongly.

```powerfx
=With(
    {
        varLang: Lower(
            First(
                Split(
                    Language(),
                    "-"
                )
            ).Value
        )
    },
    Switch(
        varLang,
        "en",
        IsMatch(
            candidate,
            "^((\+|-?)?\d+(|\.\d{0,2})?)"
        ),
        IsMatch(
            candidate,
            "^((\+|-?)?\d+(|\,\d{0,2})?)"
        )
    )
)
```

```typescript
export function validateCostValue(value: string, language = "en-US"): string | null {
  if (isBlank(value)) return null;
  const sep = language.startsWith("en") ? "\\." : ",";
  if (!new RegExp(`^\\d+(?:${sep}\\d{0,2})?$`).test(value)) return CONTR_MSG.costRange;
  const n = parseNumber(value, language);
  return n >= 0 && n <= CONTRACT_COSTS_MAX ? null : CONTR_MSG.costRange;
}

/** Payment-target percentages are ONE-decimal (`fn_Numeric_Contracts.IsOneDecimal`). */
export function validatePaymentPercentage(
  value: string,
  headroom: number,
  language = "en-US",
): string | null {
  if (isBlank(value)) return null;
  const sep = language.startsWith("en") ? "\\." : ",";
  if (!new RegExp(`^\\d+(?:${sep}\\d?)?$`).test(value)) return CONTR_MSG.oneDecimal;
  const n = parseNumber(value, language);
  return n >= 0 && n <= headroom ? null : CONTR_MSG.headroom(headroom);
}
```

**Shape change** — a canvas component custom property that read `Language()` from global state becomes a pure function with an explicit `language` argument, so both locales are testable without changing the browser. The regexes gain a `$`: the canvas patterns have no end anchor, so `"12.34abc"` and `"1000000000zzz"` both satisfy `IsTwoDecimal` and only the subsequent `Value()` coercion catches them. `src/domain/numeric.ts` keeps the canvas form reachable behind `isDecimalWithPlaces(candidate, places, lang, /* looseTail */ true)`.
**Pinned by** — UT-CONTR-028, UT-CONTR-041, UT-CONTR-042, UT-DOM-008, UT-DOM-009.

#### Security conditions

| Condition | Canvas today | Where it must be enforced |
|---|---|---|
| Adding any of the three contract types | `ItemEnabled: DataSourceInfo('BoP Projects Contracts', DataSourceInfo.CreatePermission)` — genuinely server-answered, and the same expression on all three Add items | `prvCreatevsb_bopprojectscontracts`. `contractCommands()`'s `canCreate` comes from `useProjectContext().canEdit` plus the table privilege, never from a role name |
| Editing a contract | `And(Not(IsBlank(locSelectedContract)), RecordInfo(locSelectedContract, RecordInfo.EditPermission))` — correct | Write privilege on `vsb_bopprojectscontracts` at Business Unit scope, kept as the boundary |
| Deleting a contract | The **same** `RecordInfo.EditPermission` expression as Edit — the Delete privilege is never consulted (see Deliberate divergences) | `prvDeletevsb_bopprojectscontracts`. The server already rejects the write, so the canvas defect is a misleading enabled button rather than a hole; the fix belongs in the gate so the button tells the truth |
| Adding, editing or deleting a payment target | **No check at all.** None of the three commands on `pcf_Contracts_List_Card_Body_PaymentTargets_CommandBar` carries a `DataSourceInfo` or `RecordInfo` test — the gate is entirely `locSelectedContract` scoping | Create/write/delete on `vsb_bopcontractspaymenttargets`. `paymentTargetCommands()` **adds** the three privilege gates the canvas omits; that is a deliberate tightening, not a transcription |
| Replacing a contract's DevCo-cost joins | Unchecked: `ForAll(…, Patch('BoP Contracts DevCo Costs', …))` runs on the strength of the contract's own Save gate | Create/delete on `vsb_bopcontractsdevcocosts`. Because the whole set is replaced, a user who can save a contract can silently delete join rows they could not delete directly — the two privileges must be granted and revoked together |
| The payment-target 100 % cap | Client-side only: `canAddPaymentTarget` and `paymentTargetHeadroom` are arithmetic over the rows already loaded, so two concurrent editors can each pass the check and jointly exceed 100 | Business rule, not authorisation — but if it must hold, it belongs in a synchronous pre-operation Create/Update plug-in on `vsb_bopcontractspaymenttargets` that re-sums the siblings server-side |
| `'Is Standard Contract'` and `'Is Margin Standard Assumption?'` | Written client-side on every save — always `No` for the first, and whatever the panel believes for the second | A Field Security Profile over `vsb_isstandardcontract` if a standard contract must not be forgeable from the app. Otherwise a client can mark an ad-hoc contract as standard and change what the Admin Contract screen's Apply-All will overwrite |
| `'Owning Business Unit'` | Copied client-side from `gblSelectedProject.'Besitzer (Unternehmenseinheit)'` on the contract, the payment target and the join row | One pre-operation Create plug-in per table deriving `owningbusinessunit` from the parent project and ignoring the client's value |
| Reading the margin assumptions | `LookUp('Assumptions BoP Contracts', …)` over the Fabric/SQL source. Margin percentages and fixed values are commercial terms | The connection's own credentials and row-level scope. `useBopAssumptions` pre-filters on country and technology server-side, so the projection sent to the browser is six columns for one country, not the table |
| Error text reaching the user | `Notify(… & FirstError.Details.HttpResponse, NotificationType.Error)` on all three save handlers — the raw HTTP response body is shown to whoever pressed Save | `toAppError` maps status to a message; the response body goes to `trace`, not to the screen. `CONTR_MSG.saveFailed` is what the user sees |

#### Deliberate divergences

- **`Margin = No` still adds the fixed value.** The canvas arithmetic is `If(Margin = Yes, If(MarginType = Percentage, total * (1 + pct/100), Sum(total, fixed)), Sum(total, fixed))` — the *else* branch adds `'Margin Fixed Value'` to a contract that has no margin at all. Because the fixed-value box is only rendered for `Margin = Yes` + `Fixed Value` it is usually blank and `Value("")` is 0, so the bug rarely bites; a stale value left in panel state is enough to make it bite. Corrected: `Margin = No` adds nothing. Parity function: `totalCostOfContractCanvasParity()`. Pinned by UT-CONTR-017 (with UT-CONTR-015, UT-CONTR-016 and UT-CONTR-018 fixing the surrounding arithmetic, including that a non-numeric percentage yields blank and never `NaN`).
- **Delete now checks the Delete privilege.** Both `editContarct` and `deleteContarct` gate on `RecordInfo(locSelectedContract, RecordInfo.EditPermission)`; Delete never asks about deletion. Corrected to `permissions.canDeleteRecord`. Parity function: `contractCommandsCanvasParity()`. Pinned by UT-CONTR-049.
- **The cost `fn_Numeric` regexes are anchored.** The Cost app's `fn_Numeric.IsOneDecimal` / `IsTwoDecimal` / `IsThreeDecimal` / `IsSixDecimal` all end `\d{0,n})?)` with no `$`, so any trailing junk passes the format check and only `Value()` catches it — and where the code path does not call `Value()`, nothing does. Anchored here in `validateCostValue`, `validatePaymentPercentage` and the shared `src/domain/numeric.ts`. Parity switch: `isDecimalWithPlaces(candidate, places, lang, true)`. Pinned by UT-DOM-009, with UT-CONTR-028 and UT-CONTR-041 pinning the screen's use of it.
- **The Rights-contract `Name` uses its own description box.** The canvas builds `Name` from `txt_Contracts_RightPanel_NewEdit_Description.Value` — the *other* panel's field — while writing `Description` from `txt_…_RightsContract_Content_Description.Value`, so the name is built from a stale or blank value. Corrected in `rightsContractName()`. Pinned by UT-CONTR-033.
- **Recalculate is deleted and Save is driven by validity.** The canvas Save requires `locContractDevCoCostsDirty`, which only `but_Contracts_RightPanel_NewEdit_Buttons_Recalculate` sets, so the user had to press Recalculate before Save became available. Every figure now derives reactively through `deriveFigures()` and `canSaveContract()` reads `form.isDirty`. The "Reset to standard assumption" action is kept, because that has real meaning. Pinned by UT-CONTR-056.
- **The delete cascade is explicit.** The canvas does `Remove('BoP Projects Contracts', locSelectedContract)` and trusts Dataverse cascade configuration for the payment targets and DevCo-cost joins. `planDeleteContract()` names all three id sets and they go in one batch, so a missing or reconfigured cascade cannot orphan them. Pinned by UT-CONTR-048.
- **The payment date is compared at month precision.** The canvas builds its comparison date as `DateValue($"{yyyy}-{mm}-{Day('Project Start Date')}")`, reusing the project start's day-of-month, so a `MM/YYYY` field's validity depended on an irrelevant field. `validatePaymentDate()` compares `year * 12 + month`. Pinned by UT-CONTR-044.
- **Payment-target commands gain privilege gates the canvas never had.** Named here rather than in the divergence list of the source, because it tightens rather than corrects. Pinned by UT-CONTR-047.

#### Build steps

1. Add the seven repositories to `src/data/repos.ts` with full projections, and check every logical name in `BOP_COL`, `TARGET_COL` and `JOIN_COL` against `customizations.xml`; register the Fabric connection and confirm `bopAssumptionsRepo` returns its six lower-case columns.
2. Anchor the four `fn_Numeric` decimal regexes in `src/domain/numeric.ts` behind the `looseTail` switch, and prove UT-DOM-009 before any screen consumes them.
3. Write the account-tree and cost-split rules — `buildAccountTree`, `markUsedAccounts`, `selectedLevel3Ids`, `toClosingDate`, `devCoCosts`, `costsUntilClosing`, `costsAfterClosing`.
4. Write the totals, margin and Fabric-default rules — `totalCosts`, `totalCostOfContract` with `totalCostOfContractCanvasParity`, `deriveFigures`, `fabricMarginDefaults`, `fabricRowsForProject`, `CONTRACT_TYPE_LABEL`, `marginDisplay`.
5. Write the naming, payload, gating and validation rules — `contractName`, `rightsContractName`, `paymentTargetName`, `devCoCostName`, `contractWritePayload`, `planDevCoCostSet`, `planDeleteContract`, `validateCostValue`, `validatePaymentPercentage`, `validatePaymentDate`, `paymentTargetHeadroom`, `canAddPaymentTarget`, `canSaveContract`, `canSaveRightsContract`, `contractCommands` with its parity twin, `paymentTargetCommands`, `panelForContract`, `groupByContractType`.
6. Write `rules.test.ts` to 63 cases covering UT-CONTR-001…056 across the seven describe blocks, including both parity twins, and run `npx vitest run src/features/contracts`.
7. Write `hooks.ts` — the five queries with their OData filters, `useBopAssumptions` with its long `staleTime` and its degrade-to-empty `catch`, and `useBopBatch` for the two batched write paths.
8. Add the plug-ins and Field Security Profile named in the Security conditions table — the `owningbusinessunit` derivation on all three tables, and the `vsb_isstandardcontract` profile.
9. Compose `Screen.tsx` — the grouped card list, the three-level account picker, the main and Rights panels, the payment-target sub-list with its own command bar, the confirmation dialogs — then run `npx tsc --noEmit | grep features/contracts`.

#### Exit gate

`npx vitest run src/features/contracts` passes all 63 cases, including UT-CONTR-017 (which must fail against `totalCostOfContractCanvasParity` and pass against `totalCostOfContract`) and UT-CONTR-049 (Delete must be false when `canDeleteRecord` is false and `canEditRecord` is true); `npx tsc --noEmit | grep features/contracts` is empty; saving a contract with three selected level-3 accounts issues exactly **one** batch request containing the contract upsert plus the join replacement, not four; and a user holding write-but-not-delete on `vsb_bopprojectscontracts` sees Delete disabled rather than a rejected write.

---
### 21. Opex Costs Screen — `src/features/opex-costs/`

| | |
|---|---|
| Canvas unit | `Cost::Opex Costs Screen` (Cost app) |
| Power Fx | `163` blocks ≥3 lines · `65` ≥10 · `24` ≥30 · `4139` lines in those blocks (`8147` across all `=` properties) |
| Complexity | band `M` · score `34.1` · `13` build-days |
| Code app | `Screen.tsx` 646 ln · `hooks.ts` 304 ln · `rules.test.ts` 577 ln · `rules.ts` 787 ln |
| Pure rules exported | `67` |
| Unit tests | `57` cases · IDs `UT-OPEX-001…UT-OPEX-048` |
| Dataverse tables | Country Inflation Profiles, DeviceTypesInProjects, GeneratorInProjects, GeneratorTypeInProjects, Generators, Opex Project Costs, PVModuleTypeInProjects |

#### What it does

One screen serving two rail items — Operation & Maintenance and Other OPEX Costs — whose difference is which OPEX account is in scope, which sub-accounts are listed, and whether the Threshold and % of Revenues columns exist at all. In O&M mode the cards are the project's device types (WTG types ordered by the generator's creation date, then PV module types) and the device type *is* the contract type; in Other mode the cards are the Other-OPEX sub-accounts and each can hold several contract types. Under either, a contract type is a chain: a root cost with a blank `'Parent Cost'` plus later periods pointing at it, each period starting where the previous one ended, and saving a root cascades ten inflation and threshold fields down every child. A sub-account with no costs at all can instead load a whole standard contract from `OPEX & Land Lease Standard Assumptions`, which creates the chain, chains the start dates from COD, and stamps every row as standard so it can no longer be edited.

#### Depends on

- `src/domain/dates.ts` — `addMonths`. Every period start, period end and standard-load chain is `addMonths(cursor, years * 12 + months)`, matching the canvas' `DateAdd(…, TimeUnit.Months)`.
- `src/domain/numeric.ts` — `isBlank`, `isDecimalWithPlaces`, `inRange`, `parseNumber`. `isDecimalWithPlaces` must already be anchored (see screen 20's divergence) before `validateOpexNumber` is written.
- `src/data/entities.ts` — `ES_COST.opexProjectCosts`, `CHOICE_COST.thresholdType`, `CHOICE_COST.typeOfContract` (`opexOandM` / `opexOther`), `OPEX_MODE_NAMES` (the two literal account names `"Operation & Maintenance"` and `"Other OPEX Costs"`) and `DISTRIBUTION_FREQUENCY` (re-exported as `OPEX_DISTRIBUTION_FREQUENCY`).
- `src/data/repos.ts` — `opexAccountRepo`, `costOpexSubaccountRepo`, `opexProjectCostFullRepo`, `deviceTypeInProjectRepo`, `generatorTypeInProjectRepo`, `pvModuleTypeInProjectRepo`, `opexLandLeaseAssumptionRepo`, `countryInflationProfileRepo`.
- `src/routes/AppRoutes.tsx` — the two routes `costs/opex/om` and `costs/opex/other` both mount this screen with a `mode` prop. That routing decision replaces the canvas' re-derivation of the mode from a display string and must exist before the screen is written.
- The **Generators screen** must land first for O&M: the cards *are* `DeviceTypesInProjects` rows joined to `GeneratorTypeInProjects` and `PVModuleTypeInProjects`, and the ordering key is the underlying `Generators` row's `createdon`. With no generator the O&M mode renders only `O_AND_M_EMPTY_STATE`, which is not enough to test rules 3, 8 or 12.
- `src/platform/dataClient.ts` — `dataClient.batch` and `WriteOp`; the ten-field cascade and the chain delete are one batch each.
- `src/platform/odata.ts` — `f.and`, `f.eq`, `f.guid`, `asc`; `src/platform/errors.ts` — `toAppError`; `src/platform/telemetry.ts` — `trace`.
- `src/features/shared/useProjectContext.ts` — the project record (`Operations start date (COD)`, `Country`, `Technology`, `End Date`) and `canEdit`.
- `src/components/` — `PageHeader.tsx`, `Card.tsx`, `DataGrid.tsx`, `CommandBar.tsx`, `FormPanel.tsx`, `ConfirmDialog.tsx`, `LoadingOverlay.tsx`, `EmptyState.tsx`, `NumericInput.tsx` (also `PercentageInput`).
- Dataverse privileges: create/write/delete on `vsb_opexprojectcost`; read on `vsb_opexaccount`, `vsb_opexsubaccount`, `vsb_devicetypesinproject`, `vsb_generatortypeinproject`, `vsb_pvmoduletypeinproject`, `vsb_opexlandleasestandardassumptions` and `vsb_countryinflationprofile`. No flow is called from this screen.

#### Power Fx → TypeScript

##### pcf_con_OpexCosts_Content_GeneratorsInProject_CardBody_CommandBar.OnSelect — 502 lines → `deviceTypeList()` + `useDeviceTypes()`

Resolves which device a card represents by walking a polymorphic lookup, and then dispatches every O&M command from one `Switch`.

```powerfx
UpdateContext(
    {
        locSelectedRecordTypeAddPeriod: If(
            Left(
                ThisItem.Name,
                3
            ) = "WTG",
            "Generator",
            "PVModule"
        ),
        locSelectedDevice: With(
            {
                varRecordPVModuleType: If(
                    IsType(
                        ThisItem.TypeInProject,
                        PVModuleTypeInProjects
                    ),
                    LookUp(
                        PVModuleTypeInProjects,
                        PVModuleTypeInProject = AsType(
                            ThisItem.TypeInProject,
                            PVModuleTypeInProjects
                        ).PVModuleTypeInProject
                    ),
                    Blank()
                )
            },
            If(
                IsType(
                    ThisItem.TypeInProject,
                    PVModuleTypeInProjects
                ),
// … [470 of the block's 502 lines omitted]
```

```typescript
export function deviceTypeList(
  generators: Omit<DeviceTypeInProject, "kind" | "isFolded">[],
  pvModules: Omit<DeviceTypeInProject, "kind" | "isFolded">[],
): DeviceTypeInProject[] {
  const gen = [...generators]
    .sort((a, b) => (a.createdOn ?? "").localeCompare(b.createdOn ?? ""))
    .map((d) => ({ ...d, kind: "generator" as const, isFolded: true }));
  const pv = pvModules.map((d) => ({ ...d, kind: "pv" as const, isFolded: true }));
  return [...gen, ...pv];
}
```

**Shape change** — the polymorphic `IsType` / `AsType` pair plus a `LookUp` per card, evaluated inside a gallery, becomes a discriminated `kind: "generator" | "pv"` decided once in `useDeviceTypes()` by set membership against the two type-in-project id sets, and `Left(ThisItem.Name, 3) = "WTG"` — a naming-convention test standing in for a type test — disappears with it. The `"Generator"` / `"PVModule"` sentinel string in `locSelectedRecordTypeAddPeriod` becomes that same `kind` field on a typed row. The three `LookUp`s per card collapse into three `Promise.all` queries per screen.
**Pinned by** — UT-OPEX-006, UT-OPEX-007, UT-OPEX-004, UT-OPEX-044.

##### pcf_con_OpexCosts_Content_Subaccounts_CardBody_SubaccountsCommandBar.OnSelect — 382 lines → `standardPeriodStarts()`

Decides the whole standard-contract load: whether it may run at all, which assumptions match, and where each created period starts.

```powerfx
"newAddStandardContractKey",
UpdateContext(
    {
        locIsVisiblePopUpSpinner: true,
        locSpinnerInformationText: "Please wait, loading Standard Assumption Contract..."
    }
);
Clear(colOtherOpexPeriods);
Clear(colOtherOpexStandardAssumptionContract);
With(
    {
        recFilteredStandardContractsForProject: Filter(
            'Opex Project Costs',
            And(
                Project.Project = gblSelectedProject.Project,
                'Is Standard Contract?' = 'Is Standard Contract? (Opex Project Costs)'.Yes,
                Subaccount.'Opex Subaccount' = ThisItem.'Opex Subaccount'
            )
        ),
        recCountryTechnologyRelatedStandardAssumption: Sort(
            Filter(
                'OPEX & Land Lease Standard Assumptions',
                And(
                    Country.Country = gblSelectedProject.Country.Country,
                    Technology = gblSelectedProject.Technology,
                    'Type Of Contract' = 'Contract Types'.'Opex Other',
                    'Opex Subaccount'.'Opex Subaccount' = ThisItem.'Opex Subaccount'
                )
            ),
            Description,
            SortOrder.Ascending
        ),
        recCODDate: gblSelectedProject.'Operations start date (COD)',
        recCODYear: Year(gblSelectedProject.'Operations start date (COD)') + 1
    },
// … [347 of the block's 382 lines omitted]
```

```typescript
export function standardPeriodStarts(
  codDate: string | Date,
  assumptions: Pick<OpexAssumption, "period" | "durationYears" | "durationMonths">[],
): { period: number; startDate: Date }[] {
  const ordered = [...assumptions].sort((a, b) => a.period - b.period);
  const out: { period: number; startDate: Date }[] = [];
  let cursor = codDate instanceof Date ? new Date(codDate.getTime()) : new Date(codDate);
  for (const a of ordered) {
    out.push({ period: a.period, startDate: new Date(cursor.getTime()) });
    cursor = addMonths(cursor, (a.durationYears ?? 0) * 12 + (a.durationMonths ?? 0));
  }
  return out;
}

/** `recCODYear = Year('Operations start date (COD)') + 1`. */
export function inflationStartYear(codDate: string | Date | null): number | null {
  if (!codDate) return null;
  const d = codDate instanceof Date ? codDate : new Date(codDate);
  return Number.isNaN(d.getTime()) ? null : d.getFullYear() + 1;
}
```

**Shape change** — the assumption match splits into `standardAssumptionFilter()` (which differs by mode: O&M matches country plus technology, Other adds the card's own sub-account) and `matchesStandardAssumption()`, so the filter is a value the test can inspect rather than a `Filter(…)` embedded in a command handler. The canvas computed period ≥ 3 from `Last(Sort(colOtherOpexPeriods, Period, Asc))` — reading back a collection it was still growing — and that becomes a plain cursor over a sorted array. `ForAll(recStandardAssumptionContracts, Collect(col, Patch('Opex Project Costs', Defaults(…), {…})))`, one server round trip per created row, becomes one `useOpexBatch` call.
**Pinned by** — UT-OPEX-020, UT-OPEX-021, UT-OPEX-022, UT-OPEX-023, UT-OPEX-024, UT-OPEX-025, UT-OPEX-018.

##### pcf_OpexCosts_RightPanel_NewEditCost_BodyButtons_InflationProfileUpdates.OnTimerEnd — 50 lines → `cascadeToChildren()`

Decides which ten fields propagate from a saved cost to its child periods — by walking the chain one row per timer tick.

```powerfx
UpdateContext(
    {
        locSpinnerInformationText: "Updating inflation profiles on child costs...",
        locIsVisiblePopUpSpinner: true
    }
);
Patch(
    'Opex Project Costs',
    locOpexCostChild,
    {
        'Use Inflation Profile': locSelectedOpexCost.'Use Inflation Profile',
        'Use Country Inflation Profile': locSelectedOpexCost.'Use Country Inflation Profile',
        'Inflation Profile': locSelectedOpexCost.'Inflation Profile',
        'Inflation Start Year': locSelectedOpexCost.'Inflation Start Year',
        'Inflation Country Area': locSelectedOpexCost.'Inflation Country Area',Threshold:locSelectedOpexCost.Threshold,'Threshold individual':locSelectedOpexCost.'Threshold individual','Threshold Type':locSelectedOpexCost.'Threshold Type','Align With Project Duration':tgl_OpexCosts_RightPanel_NewEditCost_BodyContent_AlignWithProjectDuration.Checked
    }
);
UpdateContext(
    {
        locOpexCostChild: LookUp(
            'Opex Project Costs',
            'Parent Cost'.'Opex Project Cost' = locOpexCostChild.'Opex Project Cost'
        )
    }
);
If(
    Not(IsBlank(locOpexCostChild)),
    UpdateContext({locRunTimer: false});
    UpdateContext({locRunTimer: true})
);
// … [20 of the block's 50 lines omitted]
```

```typescript
export const CASCADED_FIELDS = [
  "useInflationProfile", "useCountryInflationProfile", "inflationProfile",
  "inflationStartYear", "inflationCountryArea", "threshold", "thresholdIndividual",
  "thresholdType", "alignWithProjectDuration", "externalContract",
] as const;

export type CascadePayload = Pick<OpexCost, (typeof CASCADED_FIELDS)[number]>;

export function cascadeToChildren(
  saved: OpexCost,
  children: OpexCost[],
): { id: string; payload: CascadePayload }[] {
  if (children.length === 0) return [];
  const payload = Object.fromEntries(
    CASCADED_FIELDS.map((k) => [k, saved[k]]),
  ) as unknown as CascadePayload;
  return children.map((c) => ({ id: c.id, payload }));
}
```

**Shape change** — this is the second timer-driven loop in the Cost app: the canvas patches one child, re-`LookUp`s the next child from the server, and restarts a `Timer` by toggling `locRunTimer` false-then-true, so a five-period chain costs five sequential round trips and five re-renders and cannot be cancelled. `cascadeToChildren()` returns the whole plan, the mutation sends it as one `$batch`, and the timer, `locRunTimer`, `locOpexCostChild` and `locTimer` all disappear. The ten cascaded columns become a named tuple so the test can assert the set exactly, and — the easy thing to lose — assert that rates, start dates and durations are *not* in it.
**Pinned by** — UT-OPEX-026, UT-OPEX-027.

##### Opex Costs Screen.OnVisible — 110 lines → `selectedAccount()` + `modeFromNavKey()`

Decides which of the two modes the screen is in, and therefore which account, sub-accounts and columns apply.

```powerfx
UpdateContext(
    {
        locSelectedAccount: If(
            gblLeftNavigationSelected.ItemDisplayName = "Operation & Maintenance",
            First(colOpexAccounts),
            gblLeftNavigationSelected.ItemDisplayName = "Other OPEX Costs",
            Last(colOpexAccounts)
        ),
        locSelectedDeviceTypeInProject: Blank(),
        locSelectedOpexCost: Blank(),
        locSelectedOpexCostParent: Blank(),
        locIsVisibleRightPanelNewEditOpexCost: false,
        locIsVisiblePopUpDeleteOpexCosts: false,
        locSpinnerInformationText: "",
        locIsVisiblePopUpSpinner: false,
        locCandidateOpexCostDesc: "",
        locColDistributionFrequency: Table(
            {
                Name: "1 month",
                Value: 1
            },
            {
                Name: "2 months",
                Value: 2
            },
// … [85 of the block's 110 lines omitted]
```

```typescript
export const NAV_KEY_TO_MODE: Record<string, OpexMode> = {
  "O&MKey": "om",
  OtherOpexCostsKey: "other",
};

export function modeFromNavKey(key: string | null | undefined): OpexMode | null {
  if (!key) return null;
  return NAV_KEY_TO_MODE[key] ?? null;
}

export const MODE_DISPLAY_NAME: Record<OpexMode, string> = {
  om: OPEX_MODE_NAMES.oandm,
  other: OPEX_MODE_NAMES.other,
};

export function selectedAccount(
  accounts: OpexAccount[],
  mode: OpexMode,
): OpexAccount | null {
  if (accounts.length === 0) return null;
  const sorted = [...accounts].sort((a, b) => a.order - b.order);
  const byName = sorted.find((a) => a.name === MODE_DISPLAY_NAME[mode]);
  if (byName) return byName;
  return mode === "om" ? sorted[0] : sorted[sorted.length - 1];
}
```

**Shape change** — the mode came from `gblLeftNavigationSelected.ItemDisplayName`, a *display string* on a global; it now comes from the route, passed in as a `mode` prop, so switching rail items no longer re-`Navigate`s to the same screen and re-runs a 110-line `OnVisible`. `NAV_KEY_TO_MODE` keeps the canvas' two `ItemKey`s resolvable for a deep link. `First(colOpexAccounts)` / `Last(colOpexAccounts)` — a positional assumption about table order that is data, not code — becomes a name match with the positional rule as a documented fallback. `locColDistributionFrequency`, a five-row table declared inline in an event handler, becomes the shared `DISTRIBUTION_FREQUENCY` constant.
**Pinned by** — UT-OPEX-001, UT-OPEX-002, UT-OPEX-002b, UT-OPEX-003, UT-OPEX-005, UT-OPEX-048.

##### cmp_OpexCosts_PopUpConfirmation_DeleteCost.OnConfirm — 59 lines → `planDeleteCost()`

Decides whether a delete removes one period or the whole chain.

```powerfx
UpdateContext(
    {
        locSpinnerInformationText: "Deleting OPEX cost...",
        locIsVisiblePopUpSpinner: true,
        locIsVisiblePopUpDeleteOpexCosts: false
    }
);
If(
    IsBlank(locSelectedOpexCost.'Parent Cost'),
    RemoveIf(
        'Opex Project Costs',
        Or(
            'Parent Cost'.'Opex Project Cost' = locSelectedOpexCost.'Opex Project Cost',
            'Opex Project Cost' = locSelectedOpexCost.'Opex Project Cost'
        )
    ),
    RemoveIf(
        'Opex Project Costs',
        'Opex Project Cost' = locSelectedOpexCost.'Opex Project Cost'
    )
);
ClearCollect(
    colOpexProjectCosts,
    Filter(
        'Opex Project Costs',
        Project.Project = gblSelectedProject.Project
    )
);
// … [31 of the block's 59 lines omitted]
```

```typescript
export function planDeleteCost(
  chains: OpexChain[],
  selected: OpexCost,
): { ids: string[]; cascades: boolean } {
  if (selected.parentCostId !== null) return { ids: [selected.id], cascades: false };
  const chain = chains.find((c) => c.root.id === selected.id);
  return { ids: chain ? chain.periods.map((p) => p.id) : [selected.id], cascades: true };
}

export function deleteDialogText(selected: OpexCost | null): string {
  return selected?.parentCostId === null ? DELETE_DIALOG.cascade : DELETE_DIALOG.single;
}

/** The canvas behaviour, kept reachable for a parity test. */
export function deleteDialogTextCanvasParity(selected: OpexCost | null): string {
  return selected === null ? DELETE_DIALOG.cascade : DELETE_DIALOG.single;
}
```

**Shape change** — `RemoveIf` with a server-side `Or` predicate becomes an explicit list of ids sent in one batch, so the request is inspectable and the chain the user was shown is the chain that gets deleted. `ClearCollect(colOpexProjectCosts, Filter(…))` — a full reload after every delete — becomes `invalidateQueries` on `opexKeys`. The `cascades` flag is what the dialog reads, which is how the dialog wording and the action stop disagreeing.
**Pinned by** — UT-OPEX-015, UT-OPEX-016, UT-OPEX-017, UT-OPEX-047.

#### Security conditions

| Condition | Canvas today | Where it must be enforced |
|---|---|---|
| Adding a contract type or a period in Other-OPEX mode | `And(DataSourceInfo('Opex Project Costs', DataSourceInfo.CreatePermission), …)` — server-answered on both Add items | `prvCreatevsb_opexprojectcost`. `opexCommands()`'s `permissions.canCreate` is that privilege plus `canEdit`, never a role name |
| Editing or deleting in Other-OPEX mode | `RecordInfo(locSelectedOpexCost, RecordInfo.EditPermission)` and `RecordInfo(…, RecordInfo.DeletePermission)` — both correct, and the only screen pair in the Cost app that gets Delete right | Write and delete privileges on `vsb_opexprojectcost` at Business Unit scope, kept as the boundary |
| Editing or deleting in **O&M mode** | **No record check.** `pcf_con_OpexCosts_Content_GeneratorsInProject_CardBody_CommandBar` carries exactly one privilege test on its four items — `DataSourceInfo('Opex Project Costs', DataSourceInfo.CreatePermission)` on Add Period — and **no** `RecordInfo.EditPermission` or `RecordInfo.DeletePermission` on Edit or Delete, where its Other-OPEX twin carries both. A user without write or delete sees those two commands enabled | Write and delete privileges on `vsb_opexprojectcost`. `canEditCost` and `canDeleteCost` are mode-independent here, which normalises O&M up to the Other-OPEX behaviour. Dataverse rejects the write either way, so the canvas effect is a misleading enabled button — but the asymmetry is a finding, not a transcription choice |
| Adding a standard contract | Gated only on "no cost exists in this scope" — **no privilege test on either bar**, and it creates a whole chain | `prvCreatevsb_opexprojectcost`. `canAddStandardContract()` conjoins `permissions.canCreate`, which the canvas does not |
| The ten-field cascade onto child periods | Unchecked: the timer patches children on the strength of the parent's save gate | Write privilege on `vsb_opexprojectcost`. Because the cascade rewrites rows the user never opened, a user who can save one period can silently change nine others — write must not be narrower than the cascade's reach, and if per-row control is needed the cascade belongs in a Dataverse custom API that re-reads the chain server-side |
| Deleting a chain root | Cascades with `RemoveIf('Opex Project Costs', Or('Parent Cost'… , 'Opex Project Cost'…))` | Delete privilege on `vsb_opexprojectcost`. `planDeleteCost()` lists the ids explicitly so the batch matches the confirmation, but the privilege check is still the server's |
| `'Is Standard Contract?'` and `'Is Start Date Standard Assumption'` | Written client-side by the standard load, and `isStandardLocked()` is the *only* thing preventing a standard row from being edited | A Field Security Profile over `vsb_isstandardcontract` (Update granted to the standard-load principal only) if a standard chain must not be unlocked by a client that flips the flag |
| `'Time Zone Rule Version Number': 4` | Written literally on every `Opex Project Costs` patch, with no comment and no equivalent on any other table | `timezoneruleversionnumber` is a platform column and normally server-managed. Kept as `TIME_ZONE_RULE_VERSION_NUMBER` so it can be removed in one place once the metadata is checked; a client writing a platform column is worth confirming, not copying blind |
| `'Owning Business Unit'` | Copied client-side from the project | A pre-operation Create plug-in on `vsb_opexprojectcost` deriving `owningbusinessunit` from the parent project and ignoring the client's value |
| Error text reaching the user | `IfError(…, Notify(… & FirstError.Details.HttpResponse, NotificationType.Error))` | `toAppError` maps status to `OPEX_MSG.saveFailed`; the response body goes to `trace`. The panel stays open so the entry survives |

#### Deliberate divergences

- **The delete dialog now warns about the cascade it performs.** `cmp_OpexCosts_PopUpConfirmation_DeleteCost.Description` is `If(IsBlank(locSelectedOpexCost), "…and all its related periods?", "…cost?")` — it tests the *selected cost* rather than its `'Parent Cost'`. A delete is only ever raised with a selection, so the cascade wording is unreachable, while `OnConfirm` genuinely cascades on `IsBlank(locSelectedOpexCost.'Parent Cost')`. The dialog promised a single-row delete and performed a chain delete. Corrected to branch on the parent. Parity function: `deleteDialogTextCanvasParity()`. Pinned by UT-OPEX-047.
- **The start-date error label now shows when the date is missing.** `lbl_OpexCosts_RightPanel_NewEditCost_BodyContent_StartDate_ErrorMessage` has `Visible = Not(IsBlank(dte_…SelectedDate))` and `Text = If(IsBlank(dte_…SelectedDate), "Value cannot be blank")`, so it rendered empty when a date *was* chosen and hid when it was missing. The save gate independently requires a non-blank date, so the defect is cosmetic. Corrected. Parity function: `startDateErrorVisibleCanvasParity()`. Pinned by UT-OPEX-046.
- **The mode comes from the route, not from a display string.** Both rail items target the same screen and `cmp_Left_Navigation.OnSelect` only guards `Self.SelectedKey <> gblLeftNavigationSelected.ItemKey`, so picking the other row re-navigated to the same screen and re-ran `OnVisible`. `/costs/opex/om` and `/costs/opex/other` now pass `mode` as a prop and switching modes no longer forces a full reload. Recorded as source ambiguity 2. Pinned by UT-OPEX-003.
- **"O&M is the first account, Other OPEX the last" is a fallback, not the rule.** That positional assumption is data, not code, and could not be verified from the canvas source. `selectedAccount()` prefers a name match on `OPEX_MODE_NAMES` so a re-ordered `Opex Accounts` table cannot silently select the wrong account. Recorded as source ambiguity 1. Pinned by UT-OPEX-002b.
- **A one-period chain is its own last period.** The canvas computes `locLastPeriod` as `Last(Sort(Filter(costs, 'Parent Cost' = firstPeriod), Name, Asc))`, which is blank for a cost type with no second period, so `locLastPeriod.'Opex Project Cost' = selected` is false and "Add Period" could never enable on a brand-new one-period cost type. `groupChains()` includes the root in `periods`. Pinned by UT-OPEX-012.
- **The O&M empty state loses its "refresh this page" step.** The canvas string is `"Please add a generator and refresh this page to enter Operation & Maintenance costs"`; the code app has no refresh step. Both strings are exported — `O_AND_M_EMPTY_STATE` and `O_AND_M_EMPTY_STATE_CANVAS` — so the change is visible rather than silent. Pinned by UT-OPEX-007.
- **The inflation cascade is one batch, not a timer walk.** Described above; the behaviour is the same and the mechanism is not. Nothing in `rules.ts` retains the timer.
- **Threshold and % of Revenues columns are omitted in Other mode, not collapsed.** The canvas sets `Width: 0`; `showThresholdColumns(mode)` decides whether the column exists. A zero-width column is still in the DOM and still in the tab order. Pinned by UT-OPEX-004.
- **`Screen.tsx` and `rules.ts` were built from the `.msapp` sources with no screenshot to check them against.** `GUIDE-PARITY.md` lists Opex Costs among the screens still inferred — the third recording covers only Capex Costs and a loading Contracts screen — so the layout, column order and panel field order are transcribed from control geometry, not observed. Every *rule* on this screen is pinned by a test; the *visual* arrangement is not.

#### Build steps

1. Add the two routes `costs/opex/om` and `costs/opex/other` with the `mode` prop, and confirm the rail's two `ItemKey`s resolve through `modeFromNavKey`.
2. Add the eight repositories to `src/data/repos.ts` with full projections, and check every logical name in `OPEX_COST_COL` and `ASSUMPTION_COL` against `customizations.xml`.
3. Write the mode, sub-account and device rules — `modeFromNavKey`, `MODE_DISPLAY_NAME`, `selectedAccount`, `isOandMSubaccount`, `showThresholdColumns`, `subaccountsForMode`, `deviceTypeList`, both empty-state constants.
4. Write the chain rules — `groupChains`, `lastPeriod`, `chainOf`, `nextStartDate`, `startDateStandardFlagAfterManualChange`, `inheritStartDateStandard`, `periodEndDate`, `durationBadge`, `sortCosts`, `costsForDevice`, `costsForSubaccount`.
5. Write the standard-load and cascade rules — `standardAssumptionFilter`, `matchesStandardAssumption`, `standardPeriodStarts`, `inflationStartYear`, `resolveInflationProfile`, `STANDARD_STAMP`, `standardCostName`, `CASCADED_FIELDS`, `cascadeToChildren`, `TIME_ZONE_RULE_VERSION_NUMBER`.
6. Write the gating, delete and validation rules — `isStandardLocked`, `canAddPeriod`, `canEditCost`, `canDeleteCost`, `canAddStandardContract`, `commandsInScope`, `opexCommands`, `descriptionIsFree`, `planDeleteCost`, `deleteDialogText` with its parity twin, `costName`, `deviceTypeForSave`, `OPEX_RANGES`, `validateOpexNumber`, `startDateError` with its parity twin, `canSaveOpexCost`.
7. Write `rules.test.ts` to 57 cases covering UT-OPEX-001…048 across the six describe blocks, including both parity twins and UT-OPEX-002b, and run `npx vitest run src/features/opex-costs`.
8. Write `hooks.ts` — the six queries, `useDeviceTypes` with its set-membership join replacing `IsType`/`AsType`, `useScopedCosts`, and `useOpexBatch` for the save-plus-cascade and the chain delete.
9. Compose `Screen.tsx` for both modes off the one `mode` prop, then run `npx tsc --noEmit | grep features/opex-costs`.

#### Exit gate

`npx vitest run src/features/opex-costs` passes all 57 cases, including UT-OPEX-047 (which must fail against `deleteDialogTextCanvasParity` and pass against `deleteDialogText`), UT-OPEX-026 (the cascade payload's keys equal `CASCADED_FIELDS` exactly and contain none of `fixCosts`, `startDate`, `durationYears`) and UT-OPEX-044 (Edit and Delete are false without the record privileges in **both** modes); `npx tsc --noEmit | grep features/opex-costs` is empty; and saving a chain root with four child periods issues exactly **one** batch request, not five sequential ones.

Because `GUIDE-PARITY.md` still lists this screen as inferred, the gate deliberately does **not** claim visual parity: there is no recording to compare against, so the layout cannot be signed off here. What it does require is that the gap be closed rather than left open — either a screenshot or a walkthrough of the live canvas screen is captured and `docs/` gains a transcription with the usual `// GUIDE` provenance comments, or the screen is signed off in writing as visually unverified before it ships. `scripts/scenario.mjs` must reach both rail items with no page or console error either way; that proves it renders, not that it matches.

---
### 22. Land Lease Costs Screen — `src/features/land-lease/`

| | |
|---|---|
| Canvas unit | `Cost::Land Lease Costs Screen` (Cost app) |
| Power Fx | `156` blocks ≥3 lines · `61` ≥10 · `10` ≥30 · `2783` lines in those blocks (`6169` across all `=` properties) |
| Complexity | band `S` · score `18.6` · `12` build-days |
| Code app | `Screen.tsx` 697 ln · `hooks.ts` 294 ln · `rules.test.ts` 534 ln · `rules.ts` 707 ln |
| Pure rules exported | `61` |
| Unit tests | `48` cases · IDs `UT-LEASE-001…UT-LEASE-040` |
| Dataverse tables | Country Inflation Profiles, GeneratorInProjects, GeneratorTypeInProjects, Generators, Land Lease Allocation WTGS, Land Lease Periods, Land Lease Project Costs, Land Lease Subaccounts, Opex Project Costs, PVModuleTypeInProjects |

#### What it does

Land-lease contracts for one project, grouped under the `Land Lease Subaccounts` cards in `Order`, each contract a chain of up to nine numbered periods. The shape that makes this screen surprising is that a contract is split across two tables: the header — description, currency, up to three one-time payments, the Secured flag, the WTG allocation and the inflation settings — lives on `Land Lease Project Costs`, while the recurring economics — start date, duration, the five rates, aggregation and distribution frequency — live on `Land Lease Periods`. One right-hand panel edits both, and it decides which of the two tables to write purely from whether the selected period is Period 1. Alongside that, a period can allocate specific turbines through `Land Lease Allocation WTGS` (a diff, not a replace, and editable only from Period 1), and an empty sub-account can load a whole standard contract from `OPEX & Land Lease Standard Assumptions` — which is where the assumption side's ten-period enumeration has to be mapped onto the child side's nine.

#### Depends on

- `src/domain/dates.ts` — `addMonths`, for both the period chaining and the standard load's start dates.
- `src/domain/numeric.ts` — `isBlank`, `pfxRound`. `pfxRound` is what `roundTwoDecimals` uses to reproduce the canvas' round-through-text (`Value(Text(x, "##0.00"))`).
- `src/data/entities.ts` — `ES_COST.landLeaseProjectCosts`, `ES_COST.landLeasePeriods`, `ES_COST.landLeaseAllocationWtgs`, `ES_COST.landLeaseSubaccounts`, `CHOICE_COST.landLeasePeriod` (nine values), `CHOICE_COST.opexLandLeasePeriod` (**ten** values — the mismatch `mapAssumptionPeriod` exists for), `CHOICE_COST.landLeaseSecured`, `CHOICE_COST.typeOfContract`, and `DISTRIBUTION_FREQUENCY`.
- `src/data/repos.ts` — `landLeaseSubaccountRepo`, `landLeaseCostFullRepo`, `landLeasePeriodRepo`, `landLeaseAllocationRepo`, `generatorInProjectFullRepo`, `opexLandLeaseAssumptionRepo`, `countryInflationProfileRepo`.
- The **Generators screen** must land first: the WTG picker is `GeneratorInProjects` joined through `GeneratorTypeInProjects` and `PVModuleTypeInProjects`, labelled `${name} - ${status}` and ordered by the numeric suffix after the last `_` in the generator name. With no turbines, rules 9 to 12 and UT-LEASE-016 through UT-LEASE-020 have nothing to act on (UT-LEASE-037 covers the zero-generator case explicitly).
- **Screen 21 (Opex Costs)** should land first even though nothing is shared in code: `standardPeriodStarts`, `resolveInflationProfile`, `inflationStartYear` and `isStandardLocked` are the same rules against a different pair of tables, and `Opex Project Costs` appears in this screen's table list because a commented-out OPEX handler was left in the source. Building OPEX first means these four arrive already understood.
- `src/platform/dataClient.ts` — `dataClient.batch` and `WriteOp`. The contract-plus-period-plus-allocation save is one batch; so is the Period-1 delete cascade.
- `src/platform/odata.ts` — `f.and`, `f.eq`, `f.guid`, `f.inList`, `asc`; `src/platform/errors.ts` — `toAppError`; `src/platform/telemetry.ts` — `trace`.
- `src/features/shared/useProjectContext.ts` — the project record (`Project Name`, `Operations start date (COD)`, `Country`, `Technology`) and `canEdit`.
- `src/components/` — `PageHeader.tsx`, `Card.tsx`, `DataGrid.tsx`, `CommandBar.tsx`, `FormPanel.tsx`, `ConfirmDialog.tsx`, `LoadingOverlay.tsx`, `EmptyState.tsx`, `NumericInput.tsx` (also `PercentageInput`).
- Dataverse privileges: create/write/delete on `vsb_landleaseprojectcost`, `vsb_landleaseperiod` and `vsb_landleaseallocationwtg`; read on `vsb_landleasesubaccount`, `vsb_generatorinproject`, `vsb_opexlandleasestandardassumptions` and `vsb_countryinflationprofile`. No flow is called from this screen.

#### Power Fx → TypeScript

##### pcf_LandLease_RightPanel_NewEditPeriod_BodyButtons_Save_1.OnChange — 221 lines → `writesContractHeader()` + `nextPeriod()`

Decides which of the two tables a save writes to, and what period number a newly added period gets.

```powerfx
UpdateContext(
    {
        locSpinnerInformationText: "Saving Land Lease Contract...",
        locIsVisiblePopUpSpinner: true,
        locIsVisibleRightPanelNewEditPeriod: false
    }
);
If(
    IsBlank(locSelectedLandLeaseCost) || locSelectedLandLeasePeriod.Period = 'Land Lease Period'.'Period 1',
    IfError(
        UpdateContext(
            {
                locSelectedLandLeaseCost: Patch(
                    'Land Lease Project Costs',
                    Period: If(
                        locRightPanelState = "New",
                        Switch(
                            locParentLandLeasePeriod.Period,
                            'Land Lease Period'.'Period 1',
                            'Land Lease Period'.'Period 2',
                            'Land Lease Period'.'Period 2',
                            'Land Lease Period'.'Period 3',
                            'Land Lease Period'.'Period 3',
                            'Land Lease Period'.'Period 4',
                            'Land Lease Period'.'Period 4',
                            'Land Lease Period'.'Period 5',
                            'Land Lease Period'.'Period 5',
                            'Land Lease Period'.'Period 6',
                            'Land Lease Period'.'Period 6',
                            'Land Lease Period'.'Period 7',
                            'Land Lease Period'.'Period 7',
                            'Land Lease Period'.'Period 8',
                            'Land Lease Period'.'Period 8',
                            'Land Lease Period'.'Period 9',
                            'Land Lease Period'.'Period 1'
                        ),
                        locSelectedLandLeasePeriod.Period
                    ),
// … [183 of the block's 221 lines omitted]
```

```typescript
export function writesContractHeader(
  selectedPeriod: Pick<LandLeasePeriod, "period"> | null,
  isNewContract: boolean,
): boolean {
  if (isNewContract) return true;
  return isPeriodOne(selectedPeriod?.period ?? null);
}

export function nextPeriod(current: number | null | undefined): number | null {
  const n = periodNumber(current);
  if (n === 0) return CHOICE_COST.landLeasePeriod.period1;
  if (n >= 9) return null;
  return periodValue(n + 1);
}

/** The canvas behaviour: Period 9 wraps back to Period 1. Parity only. */
export function nextPeriodCanvasParity(current: number | null | undefined): number {
  const n = periodNumber(current);
  if (n === 0 || n >= 9) return CHOICE_COST.landLeasePeriod.period1;
  return periodValue(n + 1)!;
}
```

**Shape change** — a two-table write whose target was implicit in the nesting of one `If` becomes a named predicate, so the panel can *disable* the contract section on Period 2+ rather than accept edits and silently drop them. The nine-arm `Switch` over option-set values becomes an index into `PERIOD_VALUES` via `periodNumber` / `periodValue`, which is what makes a bounds check possible at all — a `Switch` has no way to say "no next value", so its default arm had to return something. `locRightPanelState = "New"` — a sentinel string in a local — becomes the `isNewContract` boolean argument. `IfError(…, Notify(… & FirstError.Details.HttpResponse))` becomes an `AppError` surfaced in the panel with the panel left open (UT-LEASE-038).
**Pinned by** — UT-LEASE-003, UT-LEASE-004, UT-LEASE-005, UT-LEASE-006, UT-LEASE-010, UT-LEASE-011, UT-LEASE-011b, UT-LEASE-038.

##### pcf_con_LandLease_Content_Subaccounts_CardBody_SubaccountsCommandBar_1.OnSelect — 507 lines → `standardPeriodStarts()` + `mapAssumptionPeriod()`

Decides the whole standard-contract load: whether it may run, which assumptions match, where each period starts, and how the assumption side's enumerations map onto the child tables.

```powerfx
Switch(
    Self.Selected.ItemKey,
    "newLandLeaseContractKey",
    Clear(colAllocatedWtgsInSelectedLandLeaseCost);
    "AddLandLeaseStandardContractKey",
        //LoadLandLeaseStandardContractsAndPeriods
    UpdateContext(
        {
            locIsVisiblePopUpSpinner: true,
            locSpinnerInformationText: "Please wait, loading Standard Assumption Contract..."
        }
    );
    Clear(colLoadLandLeasePeriods);
    Clear(colLandLeaseStandardAssumptionContract);
    With(
        {
            recFilteredStandardContractsForProject: Filter(
                'Land Lease Project Costs',
                And(
                    Project.Project = gblSelectedProject.Project,
                    'Is Standard Contract?' = 'Is Standard Contract? (Land Lease Project Costs)'.Yes,
                    Subaccount.'Land Lease Subaccount' = ThisItem.'Land Lease Subaccount'
                )
            ),
            recCountryTechnologyRelatedStandardAssumption: Sort(
                Filter(
                    'OPEX & Land Lease Standard Assumptions',
                    And(
                        Country.Country = gblSelectedProject.Country.Country,
                        Technology = gblSelectedProject.Technology,
                        'Type Of Contract' = 'Contract Types'.Landlease,
                        'Land Lease Subaccount'.'Land Lease Subaccount' = ThisItem.'Land Lease Subaccount'
                    )
                ),
                Description,
                SortOrder.Ascending
            ),
            recCODDate: gblSelectedProject.'Operations start date (COD)',
            recCODYear: Year(gblSelectedProject.'Operations start date (COD)') + 1
// … [468 of the block's 507 lines omitted]
```

```typescript
export function standardPeriodStarts(
  codDate: string | Date,
  assumptions: Pick<LandLeaseAssumption, "period" | "durationYears" | "durationMonths">[],
): { period: number; startDate: Date }[] {
  const ordered = [...assumptions].sort((a, b) => a.period - b.period);
  const out: { period: number; startDate: Date }[] = [];
  let cursor = codDate instanceof Date ? new Date(codDate.getTime()) : new Date(codDate);
  for (const a of ordered) {
    out.push({ period: a.period, startDate: new Date(cursor.getTime()) });
    cursor = addMonths(cursor, (a.durationYears ?? 0) * 12 + (a.durationMonths ?? 0));
  }
  return out;
}

/**
 * Rule 14 — the enumeration mapping between the assumption side and the child side.
 * `'Opex & Land Lease Period'` has TEN values, `'Land Lease Period'` has nine, so
 * Period 10 has nowhere to go and falls to the canvas' default of Period 1.
 */
export function mapAssumptionPeriod(assumptionPeriod: number): number {
  const i = OPEX_PERIOD_VALUES.indexOf(assumptionPeriod);
  if (i < 0 || i > 8) return CHOICE_COST.landLeasePeriod.period1;
  return PERIOD_VALUES[i];
}

/**
 * Rule 15 — the standard load rounds money THROUGH TEXT:
 * `Value(Text(x, "##0.00"))` for the one-time payments, `Value(Text(x, "#0.00"))` for
 * `Fixed Costs`. Both are a two-decimal normalisation.
 */
export function roundTwoDecimals(value: number | null | undefined): number | null {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return pfxRound(value, 2);
}
```

**Shape change** — a 507-line `Switch` over five `ItemKey`s that both gated and performed every command becomes `leaseCommands()` (a pure `{visible, enabled}` record) plus one handler per command. The four `Filter(...)` expressions over whole tables become the `useLeaseAssumptions` and `useLeaseContracts` queries with server-side `$filter`s, and the two staging collections `colLoadLandLeasePeriods` / `colLandLeaseStandardAssumptionContract` — which existed only because Power Fx cannot hold a computed set in a variable — disappear. `Value(Text(x, "##0.00"))`, a round-trip through a formatted string, becomes `pfxRound(x, 2)`, which is a different mechanism reaching the same two decimals. The ten-to-nine period mapping is now a named function with the truncation stated, instead of a `Switch` whose default arm quietly absorbed Period 10.
**Pinned by** — UT-LEASE-026, UT-LEASE-027, UT-LEASE-028, UT-LEASE-029, UT-LEASE-030, UT-LEASE-024, UT-LEASE-025.

##### cmp_LandLease_PopUpConfirmation_DeleteLandLeaseCost.OnConfirm — 43 lines → `planDelete()`

Decides whether a delete removes one period or the contract, its periods and its turbine allocations.

```powerfx
UpdateContext(
    {
        locSpinnerInformationText: "Deleting Land Lease cost...",
        locIsVisiblePopUpSpinner: true,
        locIsVisiblePopUpDeleteLandLeaseCost: false
    }
);
RemoveIf(
    'Land Lease Allocation WTGS',
    'Project Cost'.'Land Lease Project Cost' = locSelectedLandLeaseCost.'Land Lease Project Cost'
);
RemoveIf(
    'Land Lease Periods',
    'Project Cost'.'Land Lease Project Cost' = locSelectedLandLeaseCost.'Land Lease Project Cost'
);
RemoveIf(
    'Land Lease Project Costs',
    'Land Lease Project Cost' = locSelectedLandLeaseCost.'Land Lease Project Cost'
);
RemoveIf(
    colLandLeaseProjectCosts,
    'Land Lease Project Cost' = locSelectedLandLeaseCost.'Land Lease Project Cost'
);
RemoveIf(
    colLandLeasePeriods,
    'Project Cost'.'Land Lease Project Cost' = locSelectedLandLeaseCost.'Land Lease Project Cost'
);
RemoveIf(
    colAllocatedWtgsInSelectedLandLeaseCost,
    'Project Cost'.'Land Lease Project Cost' = locSelectedLandLeaseCost.'Land Lease Project Cost'
);
// … [12 of the block's 43 lines omitted]
```

```typescript
export function planDelete(
  contract: LandLeaseContract,
  selectedPeriod: LandLeasePeriod,
  allocations: AllocationRow[],
): LeaseDeletePlan {
  if (!isPeriodOne(selectedPeriod.period)) {
    return {
      kind: "period", periodIds: [selectedPeriod.id], allocationIds: [], costIds: [],
    };
  }
  return {
    kind: "contract",
    periodIds: contract.periods.map((p) => p.id),
    allocationIds: allocations
      .filter((a) => a.projectCostId === contract.cost.id)
      .map((a) => a.id),
    costIds: [contract.cost.id],
  };
}

export function deleteDialog(
  selectedPeriod: Pick<LandLeasePeriod, "period"> | null,
): { title: string; body: string } {
  return isPeriodOne(selectedPeriod?.period ?? null)
    ? { title: LEASE_MSG.deleteContractTitle, body: LEASE_MSG.deleteContractBody }
    : { title: LEASE_MSG.deletePeriodTitle, body: LEASE_MSG.deletePeriodBody };
}
```

**Shape change** — six `RemoveIf` statements, three against Dataverse and three against local mirrors of the same rows, become one `LeaseDeletePlan` of explicit id lists sent as a single `$batch`. The three collection `RemoveIf`s existed only to keep the client's copy in step and are replaced by `invalidateQueries` on `leaseKeys`. Three sequential server deletes were not atomic: a failure after the allocations went but before the cost did left a contract with no turbines and no periods. One batch either applies or does not. `deleteDialog()` reads the same `isPeriodOne` predicate the plan does, so the dialog cannot promise one thing and the batch do another.
**Pinned by** — UT-LEASE-021, UT-LEASE-022, UT-LEASE-023, UT-LEASE-032.

##### Land Lease Costs Screen.OnVisible — 75 lines → `useLeaseContracts()` + `buildContracts()`

Loads the sub-accounts, the contracts, their periods and the WTG picker.

```powerfx
Concurrent(
    ClearCollect(
        colLandLeaseSubaccounts,
        Sort(
            AddColumns(
                'Land Lease Subaccounts',
                IsFolded,
                true
            ),
            Order,
            SortOrder.Ascending
        )
    );
    ,
    ClearCollect(
        colLandLeaseProjectCosts,
        Filter(
            'Land Lease Project Costs',
            Project.Project = gblSelectedProject.Project
        )
    );
    ClearCollect(
        colLandLeasePeriods,
        Filter(
            'Land Lease Periods',
            'Project Cost'.'Land Lease Project Cost' in colLandLeaseProjectCosts.'Land Lease Project Cost'
        )
    );
// … [47 of the block's 75 lines omitted]
```

```typescript
export function orderedSubaccounts(
  rows: Omit<LandLeaseSubaccount, "isFolded">[],
): LandLeaseSubaccount[] {
  return [...rows]
    .sort((a, b) => a.order - b.order)
    .map((r) => ({ ...r, isFolded: true }));
}

export function buildContracts(
  costs: LandLeaseCost[],
  periods: LandLeasePeriod[],
): LandLeaseContract[] {
  return costs.map((cost) => ({
    cost,
    periods: periods
      .filter((p) => p.projectCostId === cost.id)
      .sort((a, b) => periodNumber(a.period) - periodNumber(b.period)),
  }));
}
```

**Shape change** — `Filter('Land Lease Periods', 'Project Cost'.'Land Lease Project Cost' in colLandLeaseProjectCosts…)` is a client-side join over an already-materialised collection, and `in` against a collection column is not delegable, so on a project with many contracts it silently truncated. `useLeaseContracts` fetches the costs with one `$filter` on the project, then the periods with one `f.inList` on the ids it just received, and `buildContracts()` groups them in memory from data that is known complete. `Concurrent(...)` with its statement-separator quirks becomes ordinary dependent queries. `AddColumns(…, IsFolded, true)` becomes a field on the typed sub-account.
**Pinned by** — UT-LEASE-001, UT-LEASE-002, UT-LEASE-039.

#### Security conditions

| Condition | Canvas today | Where it must be enforced |
|---|---|---|
| Adding a contract type | `And(DataSourceInfo('Land Lease Project Costs', DataSourceInfo.CreatePermission), …)` — server-answered | `prvCreatevsb_landleaseprojectcost`. `leaseCommands()`'s `permissions.canCreateCost` is that privilege plus `canEdit` |
| Adding a period | `And(DataSourceInfo('Land Lease Periods', DataSourceInfo.CreatePermission), …)` — server-answered, and correctly against the *periods* table rather than the costs table | `prvCreatevsb_landleaseperiod`, held separately as `permissions.canCreatePeriod`. Keeping the two apart is what lets a role add periods to an existing contract without being able to create contracts |
| Editing a period | `And(Not(IsBlank(locSelectedLandLeasePeriod)), RecordInfo(locSelectedLandLeasePeriod, RecordInfo.EditPermission))` — correct | Write privilege on `vsb_landleaseperiod` at Business Unit scope |
| Deleting a period or a contract | `RecordInfo(locSelectedLandLeasePeriod, RecordInfo.DeletePermission)` — correct on the *period*, and the only privilege consulted even when the selection is Period 1 and the delete cascades the contract and every allocation | `prvDeletevsb_landleaseperiod` **and** `prvDeletevsb_landleaseprojectcost` **and** `prvDeletevsb_landleaseallocationwtg`. Delete on the period must not be broader than delete on the parent cost, or Period 1 becomes a way to delete a contract without the contract's delete right |
| Adding a standard contract | **No privilege check.** `AddLandLeaseStandardContractKey`'s `ItemEnabled` tests only that a matching assumption exists and the sub-account is empty. It then creates a contract, its periods and its allocations | `prvCreatevsb_landleaseprojectcost`. `leaseCommands()`'s `addStandardContract` conjoins `permissions.canCreateCost`, which the canvas does not — a tightening, named here so it is not mistaken for a transcription |
| Writing the contract header from Period 1 | Implicit in the save's nesting, with no separate gate | Write privilege on `vsb_landleaseprojectcost`. Because the same panel writes two tables, a role with write on `vsb_landleaseperiod` but not on `vsb_landleaseprojectcost` gets a partially applied save unless the two travel together in one batch — which is why the save is one `$batch` and not two calls |
| Editing the WTG allocation | Unchecked: `ForAll(cmb_….SelectedItems, Patch('Land Lease Allocation WTGS', …))` then a second `ForAll` removing what is no longer selected, both on the strength of the panel's own save gate | Create/delete on `vsb_landleaseallocationwtg`. The allocation is a full diff, so a user who can save a period can delete allocation rows they could not delete directly; grant and revoke the two together |
| `'Is Standard Contract?'` and `'Is Start Date Standard Assumption'` | Written client-side by the standard load; `isStandardLocked()` is the only thing keeping a standard chain read-only | A Field Security Profile over `vsb_isstandardcontract` if a standard contract must not be unlocked by a client that clears the flag |
| `Secured` | A Yes/No **choice** written from a toggle, client-side | Business data, not authorisation — but `securedValue()` exists so the toggle cannot write a boolean into a choice column. Worth a Business Rule if "secured" carries contractual meaning downstream |
| `'Owning Business Unit'` | Copied client-side from the project onto the cost, the period and every allocation row | One pre-operation Create plug-in per table deriving `owningbusinessunit` from the parent project and ignoring the client's value |
| Error text reaching the user | `Notify("Error: Land Lease Contract could not be saved correctly. " & … & FirstError.Details.HttpResponse, NotificationType.Error)` | `toAppError` maps status to `LEASE_MSG.saveFailed`; the response body goes to `trace`, and the panel stays open |

#### Deliberate divergences

- **Period 9 no longer wraps to Period 1.** This is the significant one. The canvas' `Switch(locParentLandLeasePeriod.Period, …)` maps `'Period 8' → 'Period 9'` and then, in its **default arm**, everything else — including `'Period 9'` — to `'Period 1'`. Adding a tenth period to a contract therefore creates a *second* Period 1 in the same contract: no error, no warning, and the chain is corrupted, because `firstPeriod`, `writesContractHeader`, `allocationEditable` and `planDelete` all key off "is this Period 1". The choice set stops at Period 9, so what should happen beyond nine is genuinely undefined (source ambiguity 11) — but silently creating a duplicate is not a defensible answer to that. Corrected: `nextPeriod()` returns `null` at Period 9 and `leaseCommands().addPeriod` is false, so the command is disabled rather than the write being wrong. The parity twin is **`nextPeriodCanvasParity()`**, which returns Period 1 from Period 9 and Period 9 from Period 8; UT-LEASE-011 asserts both halves in one test, so the corrected cap and the canvas wrap are pinned against each other, and UT-LEASE-011b asserts that the command bar actually goes dark on Period 9.
- **The period-name auto-increment keeps its odd sibling condition.** `nextPeriodName()` increments a trailing `" - <digits>"` only when no Period-1 sibling exists, otherwise appending `" - 2"` — so `"Lease - 3"` with a Period-1 sibling becomes `"Lease - 3 - 2"`. That is what the canvas does and it is preserved rather than tidied, because the naming is user-visible and no rule in the source explains the condition. Pinned by UT-LEASE-012, UT-LEASE-013.
- **`Add Standard Contract` gains a create-privilege gate.** Described in the Security conditions table. Pinned by UT-LEASE-024, UT-LEASE-025.
- **The delete cascade is one atomic batch.** The canvas issues three sequential `RemoveIf`s against Dataverse plus three against local mirrors, so a mid-sequence failure leaves a contract with no periods. `planDelete()` lists every id and `useLeaseBatch` sends them together. Pinned by UT-LEASE-022.
- **The period load is a server-side join.** `Filter('Land Lease Periods', 'Project Cost'… in colLandLeaseProjectCosts…)` is non-delegable and truncates silently; replaced by `f.inList` on the cost ids. Pinned by UT-LEASE-002.
- **The one-time-payment due date is a month picker over a normalised string.** The canvas field is a free-text `TextInput` written straight into `'Due Date One-Time Payment'`, and the Dataverse column's type is not visible from the app source (source ambiguity 5). `validateDueDate()` enforces `MM/YYYY` and remains the fallback parse error for legacy values already stored. Pinned by UT-LEASE-009.
- **`Period 10` on the assumption side is named, not absorbed.** `'Opex & Land Lease Period'` carries ten values and `'Land Lease Period'` nine. `mapAssumptionPeriod()` reproduces the canvas' fall-to-Period-1 but states it in a comment and a test, so a standard assumption with ten periods is a known data problem rather than a mystery duplicate. Pinned by UT-LEASE-027.
- **`Screen.tsx` and `rules.ts` were built from the `.msapp` sources with no screenshot to check them against.** `GUIDE-PARITY.md` lists Land Lease among the screens still inferred — the third recording covers only Capex Costs and a loading Contracts screen — so the card layout, the period table's columns and the panel's field order come from control geometry, not from anything observed. The rules are pinned by 48 tests; the arrangement is not.

#### Build steps

1. Add the seven repositories to `src/data/repos.ts` with full projections, and check every logical name in `LEASE_COST_COL`, `LEASE_PERIOD_COL` and `LEASE_ALLOC_COL` against `customizations.xml` — particularly the nine `'…One-Time Payment 2/3'` columns, which are easy to mis-transcribe.
2. Add `CHOICE_COST.landLeasePeriod` (nine values) and `CHOICE_COST.opexLandLeasePeriod` (ten) to `src/data/entities.ts` and confirm the two sets against the solution's option-set metadata before writing `mapAssumptionPeriod`.
3. Write the period-number rules first — `periodNumber`, `periodValue`, `isPeriodOne`, `nextPeriod`, `nextPeriodCanvasParity`, `nextPeriodName` — and prove UT-LEASE-011 and UT-LEASE-011b before anything consumes them, because every other rule on this screen branches on "is this Period 1".
4. Write the model and header rules — `orderedSubaccounts`, `buildContracts`, `contractsForSubaccount`, `firstPeriod`, `lastPeriod`, `firstPeriodHasRate`, `writesContractHeader`, `landLeaseCostName`, `oneTimePaymentPayload`, `showSecondPayment`, `showThirdPayment`, `securedValue`, `validateDueDate`.
5. Write the allocation rules — `diffAllocation`, `allWtgSelected`, `allocationEditable`, `allocationVisible`, `generatorOptions`, `allocationName`, `planStandardAllocation`.
6. Write the standard-load, delete and gating rules — `standardPeriodStarts`, `mapAssumptionPeriod`, `mapAggregation`, `mapSecured`, `mapAllWtgAllocated`, `roundTwoDecimals`, `resolveInflationProfile`, `inflationStartYear`, `LEASE_STANDARD_STAMP`, `planDelete`, `deleteDialog`, `isStandardLocked`, `leaseCommands`, `LEASE_RANGES`, `validateLeaseNumber`, `canSaveLandLease`, `clearsSelectionAfterSave`.
7. Write `rules.test.ts` to 48 cases covering UT-LEASE-001…040 across the eight describe blocks, including `nextPeriodCanvasParity` and UT-LEASE-037's zero-generator case, and run `npx vitest run src/features/land-lease`.
8. Write `hooks.ts` — the five queries with `useLeaseContracts`' two-step server-side join, and `useLeaseBatch` for the save (contract header, period, allocation diff, all in one batch) and the delete cascade.
9. Compose `Screen.tsx` — the sub-account cards, the period table, the one panel that writes two tables with its contract section disabled outside Period 1, the WTG picker and the two confirmation dialogs — then run `npx tsc --noEmit | grep features/land-lease`.

#### Exit gate

`npx vitest run src/features/land-lease` passes all 48 cases, including UT-LEASE-011 (`nextPeriod` returns `null` from Period 9 while `nextPeriodCanvasParity` returns Period 1) and UT-LEASE-004 (`writesContractHeader` is false for Period 2 **and** Period 9); `npx tsc --noEmit | grep features/land-lease` is empty; adding a tenth period is impossible from the UI — the command is disabled, and no `Land Lease Periods` row with `Period 1` can be created under a contract that already has one; and deleting Period 1 of a contract with three periods and five allocations issues exactly **one** batch request containing nine deletes.

Because `GUIDE-PARITY.md` still lists this screen as inferred, the gate deliberately does **not** claim visual parity — there is no recording of it, so the layout cannot be signed off from anything the repo holds. What the gate requires instead is that the gap be closed rather than carried: either a capture of the live canvas screen is added to `docs/` with the usual `// GUIDE` provenance comments and this section revised against it, or the screen ships with its visual arrangement signed off in writing as unverified. `scripts/scenario.mjs` must reach the screen with no page or console error regardless; that proves it renders, not that it matches.

---
### 23. Add Costs from Table — `src/features/add-costs-from-table/`

| | |
|---|---|
| Canvas unit | `Cost::Add Costs from Table` (Cost app) |
| Power Fx | `9` blocks ≥3 lines · `3` ≥10 · `1` ≥30 · `1202` lines in those blocks (`1409` across all `=` properties) |
| Complexity | band `XS` · score `0.3` · `4` build-days |
| Code app | `Screen.tsx` 293 ln · `rules.test.ts` 427 ln · `rules.ts` 526 ln |
| Pure rules exported | `30` |
| Unit tests | `40` cases · IDs `UT-ADDCOST-001…UT-ADDCOST-032` |
| Dataverse tables | CAPEX Account Lists, CAPEX Costs, CAPEX Project Contracts |

#### What it does

A spreadsheet for bulk-editing one CAPEX account category: one row per (sub-account, contract, year) with twelve month columns, reached only from the Capex screen's "Add Cost from Table" command and returning there on Cancel or a successful save. Six validations run over the whole sheet before anything is written — duplicate sub-accounts, a cost typed on an account rather than a sub-account, two contracts with one name under one sub-account, missing Depreciation/ApplyVAT/CostPaidBy, the reserved word "Standard" on a new row, and a contract with no cost at all — and nothing is written while any of them fails. When the sheet passes, unchanged rows are skipped, one contract is upserted per (sub-account, contract) group, twelve cost candidates are staged per row of which the blanks are deleted or dropped, contracts that disappeared from the sheet are deleted, and every affected contract's `'Total Cost'` is recomputed.

**Almost all of that lives in one formula.** `tmr__CheckChanges_Add_Costs_To_Dataverse.OnTimerEnd` is 1150 lines and 45,959 bytes — 96 % of the substantive Power Fx on the screen and the single largest logic block in the solution. It is the whole section, because everything else here is a nine-line `OnVisible` and four handlers of ten lines or fewer.

The mechanism matters as much as the size. The sheet itself is a PCF spreadsheet component, and Power Fx has no way to be told that a code component's output changed. So the canvas **polls**: `tmr__CheckChanges_Add_Costs_To_Dataverse` has `AutoStart: =locTimerStart` and `Duration: =1000`, and every second while armed its `OnTimerEnd` reads `cmp__PCF_SpreadSheet_….jsonDataOut`, compares that JSON string against the copy it kept in `locPCFJsonInput`, and if they differ `ParseJSON`s the whole sheet, rebuilds seven collections from it, validates, writes, and navigates away — all inside the tick. Pressing Save does not save; it sets `locTimerStart: true` and `locTimerEnd: true` and waits for the next tick to notice. **The rebuild does none of this.** The sheet is React state, `onChange` fires when a cell changes, `validateSheet` is a `useMemo` over the rows, and the save handler runs when Save is pressed. There is no timer, no JSON string, no `ParseJSON`, no polling interval, and no window in which a change can be missed because it landed between ticks.

#### Depends on

- **The Capex Costs screen must be finished first, and this screen cannot be tested without it.** It supplies everything: the navigation state (`locSelectedAccountCategory` → the category whose sub-accounts become the sheet's rows), the sub-account list the rows resolve against, the existing `CAPEX Project Contracts` and `CAPEX Costs` the diff and the deletion plan compare to, `costAllowedStartYear`, and the mutation the save uses. `Screen.tsx` currently opens with an empty sheet rather than inventing rows, and says so in a comment — an empty sheet validates cleanly and writes nothing (UT-ADDCOST-030), which is the honest placeholder, not the finished screen.
- `src/features/capex-costs/hooks.ts` — `useCapexAccountTree`, `useCapexContracts`, `useCapexCosts`, `useCapexBatch`, `CAPEX_ENTITY`, `useCapexPrivileges`. This feature deliberately has **no `hooks.ts` of its own**: it owns rules and composition, and every query and write belongs to the Capex feature, so the two screens cannot diverge on what a contract or a cost row is.
- `src/features/capex-costs/rules.ts` — the year-range and account-tree rules the sheet's columns are built from. `sheetYearRange` and `referenceYears` here are the two the sheet needs directly; the rest stay where they are.
- `src/domain/numeric.ts` — `isBlank`, `pfxRound`. `pfxRound(sum, 0)` is `recomputeContractTotal`'s `Round(Sum(costs), 0)`.
- `src/data/entities.ts` — `CHOICE_COST.costPaidType` (DevCo / SPV), `CHOICE_COST.distributionType` (`equal` / `individual`), `CHOICE_COST.distributionScheme` (`percentValues` / `absoluteValues`), `CHOICE_COST.initialContractSource` (`pcf: 95285` / `powerapps: 95289`), and `ES_COST.capexProjectContracts` / `capexCosts` / `capexAccountLists`.
- `SPVDevCo Mapping Capex Devexes` — the reference table `devCoSpvDefault` reads the DevCo/SPV default per sub-account number from. It is not in this screen's table list because the canvas reads it from a collection the Capex screen already loaded.
- `src/features/shared/useProjectContext.ts` — the project record (`Project Name`, `Operations start date (COD)`) and `canEdit`, which is the *only* permission signal this screen has (see Security conditions).
- `src/routes/AppRoutes.tsx` — the route `costs/add-from-table`, plus `useNavigate` for the two exits back to `/costs/capex`.
- `src/components/` — `PageHeader.tsx`, `DataGrid.tsx`, `CommandBar.tsx`, `ConfirmDialog.tsx`, `LoadingOverlay.tsx`, `EmptyState.tsx`.
- Dataverse privileges: create/write/delete on `vsb_capexprojectcontract` and `vsb_capexcost`; read on `vsb_capexaccountlist`. No flow is called from this screen.
- **Not** the `vsb_Dev.SpreadSheet` PCF component. Its `jsonDataIn` / `jsonDataOut` contract is the thing being removed; `DataGrid` with per-cell inputs replaces it.

#### Power Fx → TypeScript

##### tmr__CheckChanges_Add_Costs_To_Dataverse.OnTimerEnd — 1150 lines → `validateSheet()`

Decides, once per timer tick, whether the PCF's JSON changed — and if it did, ingests the whole sheet, runs all six validations, and gates every write on their being empty.

```powerfx
UpdateContext ({locSaveData: !locSaveData});
UpdateContext({locPCFDataChanged: cmp__PCF_SpreadSheet_Costs_ProjectCosts_TableCommandBar_AddDataTable.jsonDataOut});
If(
    locPCFJsonInput <> locPCFDataChanged,
    UpdateContext({locTimerStart: false});
    UpdateContext({locTimerEnd: false});
    Set(
        varJSONOUT,
        locPCFDataChanged
    );
    UpdateContext({locPCFDataJSON: ParseJSON(cmp__PCF_SpreadSheet_Costs_ProjectCosts_TableCommandBar_AddDataTable.jsonDataOut)});
    ClearCollect(
        colPCFDataOut,
        ForAll(
    Concurrent(
        ClearCollect(
            colUniqueContracts,
            Distinct(
                colPCFDataOut,
                ProjectContract.'CAPEX Project Contract'
            )
        ),
        ClearCollect(
            colNewStandardDisallowed,
            AddColumns(
                Filter(
                    colPCFDataOut As R,
                    Not(
                        IsBlank(
                            Find(
                                "standard",
                                Lower(R.Description)
                            )
                        )
                    )
// … [1115 of the block's 1150 lines omitted]
```

```typescript
export function validateSheet(rows: SheetRow[]): ValidationError[] {
  const all = [
    ...validateDuplicateSubaccounts(rows),
    ...validateCostOnAccount(rows),
    ...validateDuplicateContracts(rows),
    ...validateMissingMetadata(rows),
    ...validateStandardWord(rows),
    ...validateContractHasCost(rows),
  ];
  const seen = new Set<string>();
  return all.filter((e) => {
    if (seen.has(e.message)) return false;
    seen.add(e.message);
    return true;
  });
}

export const sheetIsWritable = (errors: ValidationError[]) => errors.length === 0;

/** Rule 3 — resolve a row to its sub-account and any existing contract. */
export function resolveRow(
  row: SheetRow,
  subaccounts: { id: string; name: string; number: string }[],
  contracts: ExistingContract[],
): SheetRow {
  const sub = subaccounts.find(
    (s) => s.name === row.accountName && s.number === row.accountNumber,
  );
  const contract = sub
    ? contracts.find((c) => c.name === row.description && c.subaccountId === sub.id)
    : undefined;
  return {
    ...row,
    subAccountId: sub?.id ?? null,
    projectContractId: contract?.id ?? null,
  };
}
```

**Shape change** — this is the biggest single reduction in the migration, and it is structural rather than cosmetic. Three things go at once. **The polling goes**: `locPCFJsonInput <> locPCFDataChanged`, the string comparison that stood in for a change event, is replaced by the fact that a controlled React input already knows when it changed; `locSaveData`, `locTimerStart`, `locTimerEnd` and `varJSONOUT` all disappear with it. **The JSON round trip goes**: the sheet's contents were serialised by the PCF, handed over as one string, `ParseJSON`ed, and re-typed field by field through `Text(Data.Name)` / `Value(Data.Jan)` — an untyped boundary in the middle of the app, where a renamed column produces a blank rather than an error. `SheetRow` is a TypeScript interface with `months: (number | null)[]`, so a renamed field is a compile error. **The seven staging collections go**: `colPCFDataOut`, `colUniqueContracts`, `colNewStandardDisallowed`, `colValidationPCFOutRow`, `colNonExistingSubaccountsPCF`, `colDuplicateSubaccounts` and `colGroupedContracts` existed because Power Fx cannot hold an intermediate set in a variable; each becomes one pure function over `SheetRow[]`. Two behaviours are kept exactly: the six passes are unioned and de-duplicated *by message* (UT-ADDCOST-012), and the write branch runs only when the union is empty, so nothing is ever partially applied (UT-ADDCOST-013).
**Pinned by** — UT-ADDCOST-001, UT-ADDCOST-005, UT-ADDCOST-006, UT-ADDCOST-007, UT-ADDCOST-008, UT-ADDCOST-009, UT-ADDCOST-010, UT-ADDCOST-011, UT-ADDCOST-012, UT-ADDCOST-013, UT-ADDCOST-030.

##### btn_SaveData_SpreadSheet_Costs_ProjectCosts_TableCommandBar_AddDataTable.OnSelect — 10 lines → `save()`

Decides nothing. It arms the timer and hopes.

```powerfx
UpdateContext({locSaveData: !locSaveData});
UpdateContext(
    {
        locSpinnerInformationText: "Checking subaccounts validations...",
        locIsVisiblePopUpSpinner: true,
        locIsVisibleRightPanelSubaccountCostsEdit: false
    }
);
UpdateContext({locTimerStart:true});
UpdateContext({locTimerEnd:true});
```

```typescript
  const save = (allowPastCostDeletion = false) => {
    setError(null);
    // Rule 10 — nothing is written while any validation fails.
    if (!canSaveBulkEdit(permissions, errors)) return;

    const changed = diffRows(rows, context.originalRows);
    const deletions = planContractDeletions({
      originalRows: context.originalRows,
      sheetRows: rows,
      contracts: context.contracts,
      costs: context.costs,
      currentYear: new Date().getFullYear(),
      allowPastCostDeletion,
    });

    // The reinstated guard: ask before destroying booked history.
    if (deletions.blockedByPastCosts.length > 0 && !allowPastCostDeletion) {
      setConfirmPastCosts(deletions.blockedByPastCosts);
      return;
    }
// … [9 lines omitted]
    nav("/costs/capex");
  };
```

**Shape change** — the canvas Save button is a *trigger for a poll*, not a save: it toggles `locSaveData`, shows a blocking spinner reading `"Checking subaccounts validations..."`, and sets `locTimerStart`/`locTimerEnd` so that the next `OnTimerEnd` tick — up to one second later — does the work. `pcf_Spreadsheet_Costs_ProjectCosts_BodyButtons_Save.OnChange` is the same ten lines again, so the screen has two Save controls arming the same timer. In the rebuild, `save()` *is* the save: it is called synchronously from the command bar, reads the validation result already computed by `useMemo`, and returns early rather than opening a spinner over work that has not started. The command is disabled with a `disabledReason` when the sheet is not writable, so the user learns why before pressing rather than after a tick. The duplicate Save control and the hidden `con_btns_SpreadSheet_…` row (`Visible: false`) are not carried over.
**Pinned by** — UT-ADDCOST-013, UT-ADDCOST-014, UT-ADDCOST-015, UT-ADDCOST-031.

##### tmr__CheckChanges_Add_Costs_To_Dataverse.OnTimerEnd · `colAddCostDataToPatch` — 1150 lines → `costWrites()`

Decides what happens to each of the twelve month cells: upsert, delete, or nothing.

```powerfx
// … [789 lines omitted]
                    {
                        'CAPEX Cost': Coalesce(
                            LookUp(
                                colCapexCosts,
                                Contract.'CAPEX Project Contract' = locSelectedProjectContract.'CAPEX Project Contract' && Year = Value(Item.CurrentYear) && Month = [@Month].December,
                                'CAPEX Cost'
                            ),
                            Blank()
                        ),
                        Contract: locSelectedProjectContract,
                        Cost: Item.Dec,
                        Year: Item.CurrentYear,
                        Month: [@Month].December
                    }
                )
            )
        );
        ClearCollect(
            colCapexToDeletePCF,
            Filter(
                colAddCostDataToPatch,
                IsBlank(Cost) && !IsBlank('CAPEX Cost')// means an existing record was found
            )
        );
// … [337 lines omitted]
```

```typescript
export function costWrites(
  rows: SheetRow[],
  existingCosts: ExistingCost[],
): { upserts: CostWrite[]; deletes: string[]; candidates: number } {
  const upserts: CostWrite[] = [];
  const deletes: string[] = [];
  let candidates = 0;

  for (const row of rows) {
    for (let m = 1; m <= 12; m++) {
      candidates += 1;
      const value = row.months[m - 1] ?? null;
      const existing = existingCosts.find(
        (c) => c.contractId === row.projectContractId && c.year === row.year && c.month === m,
      );
      if (value === null) {
        // `// means an existing record was found`
        if (existing) deletes.push(existing.id);
        continue;
      }
      upserts.push({
        costId: existing?.id ?? null,
        contractId: row.projectContractId,
        year: row.year,
        month: m,
        cost: value,
      });
    }
  }
  return { upserts, deletes, candidates };
}
```

**Shape change** — the canvas writes out all twelve month records literally, one `{ 'CAPEX Cost': Coalesce(LookUp(...)), Contract, Cost: Item.Jan, Year, Month: [@Month].January }` block per month, each with its own `LookUp` against `colCapexCosts`: roughly 250 of the 1150 lines are twelve near-identical copies differing only in the month constant and the field name. That becomes a loop with an index, and the twelve `LookUp`s become one indexed find per candidate. `Item.Jan … Item.Dec` — twelve separate columns on a flattened record — become `months: (number | null)[]`, which is why the loop is possible at all. The blank-cell rule is preserved with the canvas' own comment kept verbatim in the code, because the distinction is easy to get wrong: a blank month *with* an existing id is a delete, and a blank month *without* one is dropped, not created as zero.
**Pinned by** — UT-ADDCOST-021, UT-ADDCOST-022, UT-ADDCOST-023, UT-ADDCOST-024.

##### tmr__CheckChanges_Add_Costs_To_Dataverse.OnTimerEnd · `ColContractstoDelete` — 1150 lines → `planContractDeletions()`

Decides which contracts that vanished from the sheet get deleted — and carries a guard that was written and then commented out.

```powerfx
// … [914 lines omitted]
            With(
                {
                    locContractsWithPastCosts: Distinct(
                        Filter(
                            'CAPEX Costs',
                            Year < locCurrentYear,
                            Not(IsBlank(Cost)),
                            Contract.'CAPEX Project Contract' in locrows
                        ),
                        Contract.'CAPEX Project Contract'
                    )
                },
                ClearCollect(
                    ColContractstoDelete,
                    Filter(
                        colCapexProjectContracts,
                        'CAPEX Project Contract' in locrows
                        /*,
                        IsBlank(
                            LookUp(
                                locContractsWithPastCosts,
                                Value = 'CAPEX Project Contract'
                            )
                        )*/
                    )
                )
            );
            RemoveIf(
                'CAPEX Project Contracts',
                'CAPEX Project Contract' in ColContractstoDelete.'CAPEX Project Contract'
            )
// … [204 lines omitted]
```

```typescript
export function planContractDeletions(args: {
  originalRows: SheetRow[];
  sheetRows: SheetRow[];
  contracts: ExistingContract[];
  costs: ExistingCost[];
  currentYear: number;
  allowPastCostDeletion?: boolean;
}): ContractDeletePlan {
  const { originalRows, sheetRows, contracts, costs, currentYear } = args;
  const stillPresent = new Set(
    sheetRows.map((r) => r.projectContractId).filter((x): x is string => x !== null),
  );
  const removed = [...new Set(
    originalRows
      .map((r) => r.projectContractId)
      .filter((x): x is string => x !== null && !stillPresent.has(x)),
  )];

  const hasPastCosts = (contractId: string) =>
    costs.some((c) => c.contractId === contractId && c.year < currentYear
      && (c.cost ?? 0) !== 0);

  if (args.allowPastCostDeletion) {
    return { deleteIds: removed, blockedByPastCosts: [] };
  }

  const blocked = removed.filter(hasPastCosts);
  return {
    deleteIds: removed.filter((id) => !blocked.includes(id)),
    blockedByPastCosts: blocked.map((id) => ({
      id, name: contracts.find((c) => c.id === id)?.name ?? id,
    })),
  };
}
```

**Shape change** — `locContractsWithPastCosts` is still computed, at the cost of a full `Filter` over `CAPEX Costs`, and then never used: the only clause that would have consumed it sits inside a `/* … */` in the middle of the `Filter` argument list. So the canvas pays for the guard and does not get it. The rebuild returns a plan with two lists instead of one collection — `deleteIds` and `blockedByPastCosts` — so the caller can act on the second rather than being told only what to remove, and `Screen.tsx` turns that into a `ConfirmDialog` naming the contracts. `RemoveIf('CAPEX Project Contracts', … in ColContractstoDelete…)` becomes explicit ids in the same batch as the cost writes.
**Pinned by** — UT-ADDCOST-025, UT-ADDCOST-026, UT-ADDCOST-026b.

##### pcf_Spreadsheet_Costs_ProjectCosts_BodyButtons_Cancel.OnChange — 7 lines → `cancelWritesNothing`

Decides that Cancel discards everything and restores the caller's category.

```powerfx
Navigate(
    'Capex Costs Screen',
    ScreenTransition.None,
    {
        locSelectedAccountCategory: locSelectedTglTab
    }
);
```

```typescript
/** Rule 23 — Cancel navigates back with the selected category restored, writing nothing. */
export const cancelWritesNothing = true;
```

**Shape change** — the one place where the canvas is already right, and the interesting part is what happens on the *success* path rather than on Cancel. The successful save's tail re-derives eight Capex collections before its own `Navigate`, roughly 200 lines of `ClearCollect(colCapexAccountsInSelectedCategoryNew, Filter(…))` and its siblings, ending in a commented-out `Clear` of eight staging collections and a `Set(gblTimerAfterNavigation8, Text(Now(), "hh:mm:ss"))`. All of it becomes one `invalidateQueries(['capex', projectId])`: the Capex screen re-fetches what it needs when it mounts, so the departing screen does not have to rebuild the arriving screen's state. Four `gblTimer*` instrumentation stamps left in production code go with it. `cancelWritesNothing` is a constant rather than a function because there is no branch to test — the point of the test is that no write path is reachable from Cancel.
**Pinned by** — UT-ADDCOST-028.

#### Security conditions

| Condition | Canvas today | Where it must be enforced |
|---|---|---|
| Opening the bulk-edit table | **No check.** The screen inherits whatever gate the Capex screen's `btn_Costs_ProjectCosts_TableCommandBar_AddCostFromTable` applied, and re-checks nothing on arrival. A deep link to the screen bypasses even that | `prvCreatevsb_capexcost` **and** `prvCreatevsb_capexprojectcontract`. `canOpenBulkEdit()` requires both and `Screen.tsx` renders `EmptyState` with `ADDCOST_MSG.noPermission` instead of the sheet — added here, not transcribed |
| Saving the sheet | **No check.** Neither `btn_SaveData_…OnSelect` nor `pcf_…_BodyButtons_Save.OnChange` carries a `DataSourceInfo` test, and the timer writes on the strength of the validation pass alone. There is no `DataSourceInfo` or `RecordInfo` call anywhere on this screen | The same two create privileges plus write on both tables. `canSaveBulkEdit()` re-checks at the point of write, because a permission can change between opening the sheet and pressing Save |
| Creating contracts through the sheet | `Patch('CAPEX Project Contracts', ForAll(colContractsToPatch As Item, {…}))` — unchecked | `prvCreatevsb_capexprojectcontract` / `prvWritevsb_capexprojectcontract`. This is the screen's sharpest edge: a single save can create, rewrite and delete arbitrarily many contracts, so the privilege is the only boundary and it must be granted deliberately rather than as a side effect of cost entry |
| Deleting contracts through the sheet | `RemoveIf('CAPEX Project Contracts', 'CAPEX Project Contract' in ColContractstoDelete…)` — unchecked, and with the past-cost guard commented out (see Deliberate divergences) | `prvDeletevsb_capexprojectcontract`. Delete on the contract must not be granted to a role that only needs to type costs — removing a row from a sheet is far too quiet a way to destroy a contract and its history |
| Deleting cost rows through the sheet | `RemoveIf('CAPEX Costs', 'CAPEX Cost' in colCapexToDeletePCF…)` for every cleared month cell — unchecked | `prvDeletevsb_capexcost`. Clearing twelve cells deletes twelve rows; grant delete alongside write on `vsb_capexcost` or not at all, since a write-only role can otherwise be surprised by which edits are rejected |
| Destroying historical cost | The guard exists in the source and is commented out, so a contract with years of booked cost is deleted as readily as an empty one | Reinstated client-side as a confirmation (see below). If historical cost must be immutable, that is a **pre-operation Delete plug-in** on `vsb_capexprojectcontract` that refuses when child `vsb_capexcost` rows exist in a prior year. A client-side guard is a courtesy; the plug-in is the rule |
| Forcing Individual + Absolute distribution | Every contract edited through the sheet is rewritten to Individual Distribution and Absolute Values, unchecked | Business behaviour, deliberate and preserved (UT-ADDCOST-017) — but it means a user with write on `vsb_capexprojectcontract` can silently convert an Equal-distributed contract by touching one cell. Worth a Business Rule or a plug-in if the distribution scheme is a controlled attribute |
| `'Is Edited from PCF?'` and `'Initial Contract Source'` | Written client-side, and they are what decide whether a standard contract is treated as system-prefilled | A Field Security Profile over `vsb_iseditedfrompcf` and `vsb_initialcontractsource` if the "system-prefilled" status must not be forgeable. Otherwise the `"Standard"` reserved-word rule is decorative: a client can write `powerapps` into the source column and pass `validateStandardWord` |
| The `"Standard"` reserved word | `Find("standard", Lower(R.Description))` on new rows only | Client-side naming convention, correctly scoped to new rows so an existing standard contract keeps its name (UT-ADDCOST-010). Not a security boundary and should not be mistaken for one |
| `'Owning Business Unit'` | Copied client-side from `gblSelectedProject.'Besitzer (Unternehmenseinheit)'` onto every patched `CAPEX Costs` row | A pre-operation Create plug-in on `vsb_capexcost` deriving `owningbusinessunit` from the parent contract's project and ignoring the client's value |
| Error text reaching the user | `Trace("Error While Trying to Patch Data to Capex Cost: " & Concat(AllErrors, Message, ", "), TraceSeverity.Error)` then a five-second `Notify`. The trace is right; the toast tells the user to "refresh the page and verify your changes were saved correctly" | `ADDCOST_MSG.saveFailed` keeps that wording verbatim (UT-ADDCOST-027) because it is honest about a partially applied batch — but the batch is now atomic, so the message should be revisited once the write is a single `$batch` that either applies or does not |

#### Deliberate divergences

- **The past-cost guard is reinstated.** The canvas computes `locContractsWithPastCosts` — a `Distinct(Filter('CAPEX Costs', Year < locCurrentYear, Not(IsBlank(Cost)), …))` — and then comments out the one `IsBlank(LookUp(...))` clause that would have used it, so a contract dropped from the sheet is deleted regardless of how much booked history it carries. Whether that was a deliberate hotfix or an accident is not recoverable from the source (source ambiguity 8), and silently destroying booked cost is bad enough to need a decision rather than a default. The guard is on by default: a contract with `CAPEX Costs` in a prior year is **not** deleted, and its name is reported so the user can confirm explicitly through a `ConfirmDialog`. Parity function: `planContractDeletionsCanvasParity()`, and `planContractDeletions({ …, allowPastCostDeletion: true })` — which the dialog's confirm branch passes — restores the canvas behaviour. Pinned by UT-ADDCOST-025, UT-ADDCOST-026 and UT-ADDCOST-026b.
- **The timer and the JSON round trip are deleted outright.** Described at length above. There is no equivalent in `rules.ts` and no parity twin, because a polling interval is not a behaviour worth keeping reachable: the observable behaviour is identical and strictly better — a change is picked up immediately instead of within one second, and a change made while a tick is in flight cannot be missed.
- **Permission checks are added where the canvas has none.** This is the only screen in the solution with **zero** `DataSourceInfo` and `RecordInfo` calls, and it is also the one that can create, rewrite and delete the most rows per press. `canOpenBulkEdit()` and `canSaveBulkEdit()` are additions, not transcriptions. Pinned by UT-ADDCOST-031.
- **Any contract edited through the sheet is forced to Individual + Absolute.** Preserved exactly, because it is a real constraint of the sheet — it types absolute monthly figures, so an Equal-distributed contract cannot survive an edit through it — but it is preserved *loudly*: `Screen.tsx` renders the note under the grid, and UT-ADDCOST-017 asserts the conversion rather than treating it as incidental.
- **`'Is Edited from PCF?'` keeps its double negative.** The canvas writes `No` only when the existing contract is a Powerapps-sourced standard contract that is already Individual + Absolute and is not already flagged; `Yes` in every other case. `isEditedFromPcf()` reproduces that condition verbatim rather than simplifying it, because the flag feeds the Admin Cost screen's Apply-All and simplifying it would change which contracts get overwritten. Pinned by UT-ADDCOST-018, UT-ADDCOST-019.
- **`Show Cost from Project Start` is dropped.** The toggle's `OnCheck`/`OnUncheck` set `lcltglShowCostEnabled`, which nothing reads, and its `Default` carries the comment `//true : Changed to False, Hotfix to Prod`. A control that does nothing but suggests it filters the sheet is worse than no control.
- **The eight-collection re-derivation before `Navigate` is replaced by one invalidation.** Roughly 200 lines of the block exist to rebuild the Capex screen's state from the departing screen. `invalidateQueries` does it, and the Capex screen owns its own loading.
- **The sheet's initial rows are not yet wired.** `Screen.tsx` builds its `SheetContext` with empty `originalRows`, `contracts` and `costs` and a comment saying so, because the navigation state that carries the selected category and its rows arrives with the Capex screen. This is the screen's one genuine incompleteness, and it is bounded: every rule is written and tested against fixtures, and an empty sheet validates cleanly and writes nothing (UT-ADDCOST-030). Wiring the hand-over is step 1 below, not a later discovery.
- **`Screen.tsx` was built from the `.msapp` source with no screenshot to check it against.** `GUIDE-PARITY.md` lists Add Costs from Table among the screens still inferred, alongside Opex Costs and Land Lease. The rules are pinned by 40 tests; the grid's column widths, the `hideBelow` breakpoints and the placement of the validation banner are not observed.

#### Build steps

1. Finish the Capex Costs screen and define the hand-over: the route state or store slice carrying `categoryName`, the resolved `originalRows`, the existing contracts and costs, and `costAllowedStartYear` — then replace `Screen.tsx`'s placeholder `SheetContext` with it.
2. Write the sheet-shape rules — `sheetYearRange`, `referenceYears`, `uniqueId`, `costUniqueId`, `devCoSpvDefault`, `resolveRow`, `sheetTitle` — and prove UT-ADDCOST-002 and UT-ADDCOST-003 against a project with and without a COD.
3. Write the six validators and their union — `validateDuplicateSubaccounts`, `validateCostOnAccount`, `validateDuplicateContracts`, `validateMissingMetadata`, `validateStandardWord`, `validateContractHasCost`, `validateSheet`, `sheetIsWritable` — keeping every message string verbatim from `ADDCOST_MSG`.
4. Write the diff rules — `rowSignature` (the canvas' pipe-separated lower-cased string form, kept so a test can prove the two agree), `rowChanged`, `diffRows`.
5. Write the write-plan rules — `costTypeFromText`, `isEditedFromPcf`, `initialContractSource`, `contractUpserts`, `costWrites`, `recomputeContractTotal`, `planContractDeletions` with `planContractDeletionsCanvasParity`, `canOpenBulkEdit`, `canSaveBulkEdit`, `cancelWritesNothing`.
6. Write `rules.test.ts` to 40 cases covering UT-ADDCOST-001…032 across the seven describe blocks, including UT-ADDCOST-026b's confirmation path, and run `npx vitest run src/features/add-costs-from-table`.
7. Add the pre-operation Delete plug-in on `vsb_capexprojectcontract` and the `owningbusinessunit` derivation plug-in on `vsb_capexcost` from the Security conditions table, and decide the Field Security Profile question on `vsb_iseditedfrompcf` / `vsb_initialcontractsource`.
8. Compose `Screen.tsx` — the `DataGrid` with per-cell inputs and twelve month columns, the validation banner, the four-command bar with its `disabledReason`, and the past-cost `ConfirmDialog` — then run `npx tsc --noEmit | grep features/add-costs-from-table`.
9. Wire the save to the Capex feature's `useCapexBatch` so the contract upserts, cost upserts, cost deletes and contract deletes travel as one batch, and confirm the Capex screen re-renders from `invalidateQueries` rather than from state pushed by this screen.

#### Exit gate

`npx vitest run src/features/add-costs-from-table` passes all 40 cases, including UT-ADDCOST-026 (a contract with a cost in a prior year appears in `blockedByPastCosts` and **not** in `deleteIds`) and UT-ADDCOST-026b (the same input with `allowPastCostDeletion: true` deletes it, matching `planContractDeletionsCanvasParity`); `npx tsc --noEmit | grep features/add-costs-from-table` is empty; a sheet with one failing validation issues **zero** write requests; a passing sheet of three changed rows issues exactly **one** batch request; and `grep -rn "setInterval\|setTimeout\|ParseJSON\|jsonData" src/features/add-costs-from-table` returns nothing — the timer-and-JSON pattern must be absent, not merely unused.

Because `GUIDE-PARITY.md` also lists this screen as inferred, the gate does not claim visual parity for the grid layout; the rules above either pass or fail, and the arrangement stays flagged until a capture of the live canvas screen exists in `docs/`.

---

## Appendix A — reproducing every number in this document

### A.1 The Power Fx side

```bash
mkdir -p vsb/sol vsb/pm vsb/cost && cd vsb
unzip -q "VSBCloud 2.zip" -d sol
unzip -q sol/CanvasApps/vsb_projectmanagement_88aff_DocumentUri.msapp -d pm
unzip -q sol/CanvasApps/vsb_projectcosts_ba045_DocumentUri.msapp      -d cost
python3 tools/fx.py     # -> fxcat.json : 52 units, 3,097 blocks, 89,804 lines in blocks
python3 tools/map.py    # -> map.json   : per-screen metrics against the code-app folders
python3 tools/brief.py  # -> briefs/    : one brief per screen, formulas verbatim
```

`tools/fx.py` needs a YAML constructor for `tag:yaml.org,2002:value`, because `.pa.yaml` stores
bare `=` values that PyYAML otherwise rejects. Long formulas are stored as single escaped YAML
scalars, so a 1,151-line formula can sit on one physical line — grep by control name, never by line
number.

### A.2 The code-app side, and the harness

```bash
cd vsbcode
npm install
npx tsc --noEmit                                    # G-TYPE
npx vitest run                                      # G-UNIT
npx vite build                                      # G-BUILD
npm i -D @vitest/coverage-v8@3.2.4
npx vitest run --coverage --coverage.provider=v8 \
  --coverage.reporter=json-summary --coverage.reporter=text

# G-WALK — Playwright is deliberately not a package dependency
npx vite preview --port 4176 --host 127.0.0.1 &
npm i -D --no-save playwright
APP_URL=http://127.0.0.1:4176 CHROMIUM_PATH=/path/to/chrome node scripts/scenario.mjs
```

`scripts/scenario.mjs` exits with the problem count, so it drops into CI unchanged. It takes
`APP_URL` and `CHROMIUM_PATH` from the environment.

---

## Appendix B — decisions owed

Ordered by how much of the plan waits on them.

| # | Decision | Waits on it | Owner |
|---:|---|---|---|
| B1 | The **five roles → Dataverse privilege matrix**: which of Create/Read/Write/Delete/Append/AppendTo/Assign/Share, at which of User / BU / Parent:Child BU / Organization, on each of the six master-data tables | **G-SEC, and therefore all of Phase 1** | Platform + business |
| B2 | Whether `vsb_CreateCapexStandardContract` and its two siblings are built as **Dataverse custom APIs** | Phase 3 screens 19, 20, 21 can compute but not persist until then | Platform |
| B3 | **Three flow wrappers are marked `disposition: "missing"` and throw when called** — `SynchronizeStandardAssumptionCosts`, `ForCountriestriggerFabricrecalculationsforProjects`, `SynchroniseRecalculationCapexStandardCost`. Do definitions exist for them under other names, or not at all? Not a flow change — a question of which definitions exist | Stage 4, and the Admin Cost, Admin Contract, Admin Milestones and Production call sites | Solution owner |
| B4 | The Apply / Apply-All audit rows are written while the **Fabric pipeline behind them is commented out**. Restore the call sites or stop writing the rows | Admin Cost, Admin Contract, Admin Milestones | Business |
| B5 | Whether the **eleven documented source defects** stand as product decisions. All eleven already have the fix wired and a `…CanvasParity` twin under test; the load-bearing one is Finance overwriting `Debt Financing` on every visit | Stage 5 sign-off | Business |
| B6 | `gblCurrentUser.EditableCounties` is **never read on any admin screen** — scoping there is literal country and technology filters typed per formula. Should it come from the user's business unit instead | Workstream S design | Platform + business |
| B7 | Whether **child-table per-record privilege probes** keep inheriting the project's right. The swap is one function | Phase 2 and 3 security | Platform |

---

## Appendix C — findings raised while producing this document

These came out of reading the canvas source against the repo, screen by screen. None was known
going in; each is in the relevant section too.

1. **`useCapexPrivileges` and `useCostPrivileges` compute privileges from role names**, breaching
   `CONVENTIONS.md` rule 4 and contradicting their own file headers. The only two admin screens
   whose UI reads privileges at all are the two that read them wrongly. In both exit gates.
2. **`vsb_CancelCheckListApproval` and `vsb_CancelGateApproval` are not in `FLOW_REGISTER`.** The
   wrappers invoke those action names, so `invokeFlow`'s missing-flow guard never fires and the
   call falls through to `dataClient.callAction` — silently `{ok:true}` in mock mode, a raw
   Dataverse fault live. Register both names.
3. **`production/hooks.ts` has no pre-request permission guard at all**, where
   `grid-operator/hooks.ts` refuses with a 403 `AppError` before issuing anything. A gap in the
   rebuild, not only in the canvas.
4. **Generators ships five stub panels, not six.** The PV Module Type panel is now real; the
   remaining shared panel covers inverter, substructure, storage, hydrogen and substation and saves
   `fields: {}`.
5. **There is no `YearGrid` or `PeriodMatrix` anywhere in the repository.** The earlier plan named
   that component as the largest UI rebuild risk. Planning uses a `repeat(auto-fit, minmax(260px,
   1fr))` grid with `DataGrid` for the permits sub-grid instead. The risk was mitigated by not
   building the component; the plan should stop citing it.
6. **`MarginDSRA` is a Finance divergence, not a Revenues one.** Nothing under
   `src/features/revenues/` reads that category.
7. **The CAPEX deactivation cascade is decided upstream**, in `admin-capex-accounts/rules.ts`, not
   in `capex-costs`. It is a Phase 1 decision that determines what Phase 3 can render.
8. **The Cost app never computes `CanEditSelectedProject`.** There is no `RecordInfo` call anywhere
   in `Capex Costs Screen.pa.yaml`; "Edit" is gated on `CreatePermission`. The rebuild adds the
   project-scope check and the `CreatePermission`-for-update pairing is transcribed as-is rather
   than silently upgraded.
9. **`GUIDE-PARITY.md` names three inferred screens, not two** — Add Costs from Table is inferred
   alongside Opex Costs and Land Lease.
10. **The repo's `rules.ts` provenance headers and this document's block counts measure different
    things and both are right.** The headers count all `=` properties; this document also counts
    lines inside blocks of three or more. They agree to the line on every screen checked, which is
    what validates the parse. Anyone comparing the two documents needs that sentence.

---

*Every visible string in the rebuild is the canvas's own string; section 3.2 is the standing rule
and `G-LABEL` the gate. Power Fx quoted throughout is verbatim from `Src/*.pa.yaml` inside the two `.msapp` archives in
`VSBCloud 2.zip`. TypeScript quoted throughout is verbatim from `VSBCloudCodeAppfinal.zip`. Elisions
are marked with the number of lines omitted. Harness figures are from the run recorded in
`VSBCloud-Test-Evidence-Report.md`, executed 7 September 2026.*
