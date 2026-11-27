# 10b. Screen-level audit: Project Management core screens (prefix SPA)

Read-only audit of the PM core screens, 26 Nov 2026, worktree branch `feature/bottleneck-identification-optimization` at base `dde9e92`. Register: `_register/SPA.md` (19 findings: P1 3, P2 8, P3 8; CONFIRMED 4, HIGH 11, SUSPECTED 4). Path shorthand: `src/` = `ProjectCosts-CodeApp/src/`.

Labels used below, as in the brief: **MEASURED** = I ran something (command and output given) or a repo document records a measurement (cited); **DERIVED** = counted from code or from the solution export; **ESTIMATED** = reasoning. Wall-clock time is ESTIMATED everywhere unless stated: the only recorded DEV unit costs are in D144 sect 1 (`ProjectDocs/app-docs/02-OPEN-DECISIONS.md:8152`, Playwright run on DEV, other screens): a trivial call about 0.18 s, an ordinary write 0.25-0.5 s, a `vsb_projects` PATCH 0.45-0.85 s. I multiply logical rounds by those units and say so. No live Dataverse was used.

## 1. Scope, method, limits

**Folders and files actually read** (whole file unless a line range is given):
- `src/features/pm/checklist/`: `hooks.ts`, `reload.ts`, `Screen.tsx` (620-1075 and greps), `rules.ts` (425-560, 731-776, 825-1075, 1480-1600, 2519-2530, 3085-3135); `src/data/checklist.ts`, `checklistPerfFlags.ts`, `checklistBulkFlags.ts`, `checklistPeople.ts`, `personCache.ts`, `flows.ts`, `usePlanWrite.ts` (1-260), `executePlan.ts` (280-440), `client.ts` (60-420, 469-500).
- `src/features/pm/project-main/`: `hooks.ts`, `queries.ts`, `Screen.tsx` (525-770, 1320-1400, 1625-1720), `rules.ts` (106-113, 269-311, 841-866); `src/data/projects.ts` (1-330).
- `src/features/pm/general-data/`: `hooks.ts`, `queries.ts`, `reload.ts`, `gdPerfFlags.ts`, `ProjectMap.tsx`, `Screen.tsx` (360-650 and greps), `rules.ts` (1995-2181); `src/data/generalData.ts` (240-345); `src/platform/azureMapsToken.ts` (1-140).
- `src/features/pm/team/hooks.ts`, `reload.ts`; `planning/hooks.ts`, `queries.ts`, `reload.ts`; `milestones/hooks.ts`, `milestonesPerfFlags.ts`; `grid-operator/queries.ts`, `reload.ts`; `shared/projectRow.ts` (head). `Screen.tsx` of Team, Planning, Milestones and Grid Operator: greps only. `rules.ts` of those four: not read.
- `src/app/`: `bootPrefetch.ts`, `bootPlan.ts`, `SessionContext.tsx`, `pmScreenPrefetch.ts`, `routes.tsx`, `generatorsWarmup.ts`, `Providers.tsx`, `screenLoaders.ts`, `startupFlags.ts`; `src/main.tsx`, `src/App.tsx` (head); `src/data/bootDvoptFlags.ts`, `project.ts` (100-490), `planningProjectKey.ts`.
- Docs: D165 docs 02/03/12/27/28, `16-PM-FLOWS-IN-THE-CODE-APP.md`, `CLUSTER-CHECKLIST-ANALYSIS-2026-11-17.md`, frontend programme docs 02/09, and decisions D43, D119, D138, D144, D150, D156 in `02-OPEN-DECISIONS.md`.
- Solution export `ProjectDocs/_extracted/VSBCloud/Workflows/*.json` (1.21.709) for the three flows the Check List calls that exist there.

**Not read:** Admin screens, Revenues/Finance/Production/Generators (other agents), `ProjectStates.tsx`, `data/team.ts`, `data/planning.ts`, `data/gridOperator.ts`, `data/milestones.ts`, `data/currentUser.ts` in full, the live flows in DEV (the export is solution 1.21.709; the check-list-cancellation flow and the Azure Maps token flow are not in it).

**What I ran (all read-only, from `ProjectCosts-CodeApp/`):**
1. `CHKBENCH=1 CHKBENCH_OUT=<_bench/SPA/checklistVisit.bench.json> npx vitest run src/features/pm/checklist/checklistVisit.bench.test.tsx --maxWorkers=1` (the repo's own opt-in bench; 15 tests passed, 141.75 s). It runs the real screen, `hooks.ts`, TanStack Query, `usePlanWrite`, the plan builders and `executePlan`; only the SDK edge is stubbed at 120 ms per hop. Its output is a logical critical path ("rounds") and a request count: MEASURED for structure, not for time. Outputs: `_bench/SPA/checklistVisit.bench.out.txt` and `.json`.
2. `node scripts/bundle-report.mjs dist --top 40` on the existing production build in `dist/`: MEASURED sizes.
3. Two throwaway scripts (outside the repo tree, in the session scratchpad) that read the three exported flow definitions and compute the longest chain of connector actions before each Respond action. DERIVED, see sect. 5.6.

**Limits:** no browser, no DEV, no profile. Rendering cost of the 200-row Overview grid and of the PM forms was not measured. Every wall-clock figure is a model.

## 2. Shared path of every PM screen (src/app)

Boot (`src/main.tsx:15`): `startBootPrefetch` runs before React mounts. For `#/projects` it dynamic-imports the Overview's `queries` and `rules` then starts page 1, the countries and the states (`src/app/bootPrefetch.ts:71-88`); for an empty hash it first awaits the host context for the launch parameters (`:143-150`). A PM deep link also starts the session project (`:45-46`) and, with `BOOT_PREFETCH_SCREEN_READS` ON (`src/data/bootDvoptFlags.ts:31`), the screen's own first reads (`src/app/pmScreenPrefetch.ts:116-128`: Check List, Team, Milestones, Planning, Grid Operator). General Data and Generators have their own targets.

First paint: `App.tsx` blocks only on the session (and, on PM routes, the session project). The environment variables no longer block (`src/app/startupFlags.ts:17`, S1). The session project is a one-request row-only read on PM routes (`src/data/project.ts:180`, `PM_ROW_ONLY_PROJECT_LOAD`), cached 5 min (`SessionContext.tsx:71-77`). `ProjectScreenGate` (`src/app/routes.tsx:130-149`) opens when that row has answered.

Startup bundle (MEASURED, `bundle-report` on `dist/`): 8 files, 1,030.1 kB min / 302.0 kB gzip (`index` 142.7 kB gzip, `fluent` 135.4 kB gzip). PM screen chunks (min / gzip): Overview 59.3 / 17.5, Check List 53.9 / 15.5 plus data chunk 49.1 / 13.5, General Data 36.2 / 10.5 plus rules 32.8 / 10.5, Planning 33.6 / 8.5, Milestones 18.6 / 5.9 plus data 31.4 / 9.4. The Azure Maps chunk is 1,658.3 / 427.8 and is lazy.

Cache defaults (`src/app/Providers.tsx:25-31`): `staleTime` 30 s, `refetchOnWindowFocus` true, retry up to 2 for retryable errors, mutations never retried. Reference lists use 30 min.

**Warm-up:** 1.5 s after any PM screen opens, the Generators chunk and 11 reads start (`src/app/generatorsWarmup.ts:56-86`, `src/features/pm/generators/queries.ts:101-117`); the lazy variant is OFF (`bootDvoptFlags.ts:37`). SPA-10.

**Screen switching inside the app** has no prefetch: `pmScreenPrefetch` and `PM_SCREEN_LOADERS` are used only by `bootPrefetch.ts` (grep), and `LeftNav` `NavLink` has no hover or focus hook (`src/components/LeftNav.tsx:379-415`). SPA-09.

## 3. Project Overview (`features/pm/project-main`)

There is no map on this screen; the project map belongs to General Data (sect. 4). Data volume: 1,129 projects in the cited screenshot (`src/data/projects.ts:5-6`), so about 6 pages of 200. One page is about 540 kB decoded (D119 F4, a HAR of 17 Nov 2026: MEASURED in a repo document); `odata.include-annotations=*` is an SDK constant (D119 F6).

### 3.1 Sixteen stages

| # | Stage | What happens (file:line) | Cost / note |
|---|---|---|---|
| 1 | Initial loading | Boot prefetch (`bootPrefetch.ts:71-88`); chunk preloaded speculatively (`:146`) | Hash `#/` waits for host context, then a dynamic import, then the reads: 3 steps before the page request leaves (DERIVED) |
| 2 | Component init | `Screen.tsx:527-590`: 8 hooks (`useProjectPage`, `useCountries`, `useCountryAreas` (disabled until a country), `useProjectStates`, `useProjectManagerSearch` (disabled under 2 chars), `useProjectManagerLabel`, `useProjectStateOrder`, `useDeleteProject`) | Cheap |
| 3 | State init | Criteria from the URL (`hooks.ts:43-94`, `parseCriteria`), capacity "last applied" memory (`:136-142`) | Cheap |
| 4 | Data retrieval | `projectPageOptions` (`queries.ts:59-68`), `staleTime` 30 s; `keepPreviousData` | Prefetched under the same key |
| 5 | Dataverse requests | Named page + 1-row blank probe in parallel per page view (`projects.ts:282`); countries and states from shared keys; D165 PB-OP-14/15/18/06 | 2 requests per page view; 3 waves for the whole boot (doc 03 B.0) |
| 6 | Business logic | `buildProjectFilter` (`rules.ts:269-282`), command gates, pager arithmetic (`pageWindow`) | Pure; not a cost |
| 7 | Transformation | `toProjectRow` on 200 raw rows | Linear, 22 columns (`rules.ts:106-113`); not measured |
| 8 | Calculations | `RoundUp(total/200)`, clamp, `named ++ blank` (`projects.ts:186-330`) | O(1) |
| 9 | Rendering | 200 `ProjectGridRow` (`memo`, stable props, `Screen.tsx:1348-1359, 1632-1720`) x 12 Fluent cells, no virtualisation | Row memo verified; first mount of about 2,400 cells not measured (SPA-12) |
| 10 | Interaction | Select row: 0 requests (states shared); keyword 350 ms and capacity 300 ms debounce (`hooks.ts:130-132`); sort/filter = new walk = 2 requests | Each keystroke is a router navigation (FE-P1-04, skipped) |
| 11 | Save | Delete project only: `deleteRecord`, optimistic patch (`hooks.ts:297-322`) | 1 round |
| 12 | Bulk | none | |
| 13 | Refresh | Delete: invalidate every `projectPage` (active page 2 requests); focus after 30 s: 2 requests of about 540 kB | SPA-11 |
| 14 | Navigation | Edit Project / Edit Costs open a new tab with a full cold boot (`Screen.tsx:684-728`) | SPA-13 |
| 15 | Error handling | Filter-list errors shown (`:566-571`), page error state, prefetch failure traced (`hooks.ts:194-195`) | |
| 16 | Cleanup | Debounce and prefetch timers cleared (`hooks.ts:204-205`); `tokenCache` Map holds one entry per signature until a write (`client.ts:261, 299-304`) | Memory trivial |

### 3.2 Critical path

- **To usable (cold landing):** host context, then module import, then wave 1 of 8 requests, of which the 540 kB page is the longest. Interactive after wave 1; waves 2 and 3 (environment values, roles, teams, team roles) are off the paint path (doc 03 B.0, re-verified in `bootPrefetch.ts`/`SessionContext.tsx:142-146`). DERIVED.
- **Filter / sort / keyword:** debounce (350 or 300 ms) + 1 round of 2 parallel requests. Page 1 of a new signature also asks `$count` once (`client.ts` D43).
- **Next / Previous:** served from cache if the +1.5 s prefetch landed; otherwise 1 round of 2 requests with a cached token. Deep link `?p=N` walks N-1 pages in sequence (cap 100): by design (D41-D46, forward-only cursor).
- **Longest step:** the page response (about 540 kB, annotations included).
- **User-visible delay candidates:** the landing page payload, the speculative page 2 (another 540 kB at +1.5 s), the refetch on every focus after 30 s, typing in two URL-controlled boxes.
- **Prior fixes and switch state:** D119 S1-S4 ON (`startupFlags.ts`), PB-06 countries one key ON, D43 count-once ON, row memo ON; FE-P1-04 skipped; OPT-18 deferred.

## 4. General Data and New Project (`features/pm/general-data`)

Volumes: 1 project row, about 7 trackings, a handful of shareholders, an Area list per country, municipalities up to 5,000 per Area (`generalData.ts:281`), 2,000 modelled for Bavaria (frontend doc FE-P1-02b).

| # | Stage | What happens (file:line) | Cost / note |
|---|---|---|---|
| 1 | Initial loading | Deep link: boot prefetch of row, countries, states, shareholders, trackings, then areas and utilizations once the row has a country (`bootPrefetch.ts:90-113`); in-app: reads start at mount | In-app: 1 round for the loader gate, a 2nd for areas, Entra, tax fallback |
| 2 | Component init | `Screen.tsx:360-436`: 9 queries, `loadProjectMap()` started at mount (`:370`) | |
| 3 | State init | `form` null until edited, `baseline` from the row (`:408-412`) | |
| 4 | Data retrieval | Loader gate waits only for the row, countries, states (`:647-649`); trackings and shareholders fill in | |
| 5 | Dataverse requests | 6 parallel in wave 1, 4-5 in wave 2 (doc 03 B.2) | About 9-11 requests |
| 6 | Business logic | `fieldErrors`, `canSave`, `formLocks`, `fieldModes` each render (`:450-475`); GD-022 computes errors once | Cheap |
| 7 | Transformation | `toForm`, `toSnapshot` memoised on row/countries (`:408-421`) | |
| 8 | Calculations | German tax fallback read only when needed | |
| 9 | Rendering | Whole screen re-renders per keystroke (form in screen state); municipality options memoised (`:630-637`, FE-P1-02a) | Combobox mounts N Options on focus (FE-P1-02b deferred) |
| 10 | Interaction | Manager/deputy search debounced 250 ms (`hooks.ts:138-157`); municipality box 1 request per keystroke (DEC-6) | SPA-15 |
| 11 | Save | See 4.2 | |
| 12 | Bulk | create path sends children `concurrent` (`rules.ts:2082-2096`); edit path does not | SPA-14 |
| 13 | Refresh | Awaited reload of 4 keys (`reload.ts:15-18`): row, shareholders, trackings, session row | 1 round, 4 requests |
| 14 | Navigation | Unsaved-changes guard (`Screen.tsx:1291`); after a create, `navigate` to the new project (`:476-480`) | New project then pays the screen reads again |
| 15 | Error handling | Load error empty state (`:639-646`); the Draft-cancel flow failure is traced and the save continues (`hooks.ts:273-275`) | |
| 16 | Cleanup | Map disposed, token refresh timer only while a map is mounted (`ProjectMap.tsx:135-141`, `azureMapsToken.ts:96-107`) | |

### 4.2 Save timelines (DERIVED unless stated)

| Case | Sequence | Rounds | ESTIMATED |
|---|---|---|---|
| Normal edit | Patch #1 (`planGeneralDataSaveHead`, Patch #2 skipped when a no-op, `rules.ts:2027-2039`), reload 4 keys | 2 | about 1-1.7 s (project PATCH 0.45-0.85 s + one read round) |
| Start-cluster change, Draft approval not running | cluster-panel job (milestone PATCH) then main job: Patch #1, Draft reset, up to 7 tracking upserts one by one, shareholders one by one, reload | up to about 17 waves (doc 03 B.2) | 5-9 s |
| Same with a running Draft approval | adds gates + Entra (cached with PB-15) and the gate-cancellation flow `Run` (no Respond: lasts the whole run, sect. 5.6) | + flow | + flow time |
| New project | create, re-read, follow-ups concurrent, reload 4 keys, navigate, screen reads for the new project | about 4 + 3 | 2-4 s plus the server flow `CreatingTeamsandSPOSite` runs asynchronously (not awaited) |

Every save writes `vsb_clusterstate` (hooks header), so `UpdateTeamsandSPOSite` fires on every save server-side; it is asynchronous and filters on value change, not a client wait.

### 4.3 Map

`ProjectMap` is lazy; the chunk (1,658.3 kB min / 427.8 kB gzip, MEASURED) starts at mount in parallel with the reads (`Screen.tsx:370`) and the form does not wait for it (`Suspense fallback={null}`, `:1003`). Authentication is a SAS token from the flow `Get Azure Maps SAS Token`, cached in memory and `localStorage`, refreshed in the background only while a map is mounted. Cold token time and parse time are unmeasured (SPA-16).

## 5. Cluster Check List (`features/pm/checklist`), in depth

### 5.1 Data volumes (realistic)

- A cluster holds 10-40 tasks: the repo bench models 10 and 40 templates; admin doc 03 models 100-250 tasks per country-and-technology scope across all clusters. A project has Draft plus up to 6 clusters = 7 trackings.
- Gates per (country, technology): up to 7 active gate rows; a few distinct portfolio managers.
- Approval settings: one read per 40 template ids (`listChecklistApprovals`, chunk size 40, `adminGatesApprovals.ts:283-297`).
- History notes: read only when a panel is open.

### 5.2 Sixteen stages

| # | Stage | What happens (file:line) | Cost / note |
|---|---|---|---|
| 1 | Initial loading | Deep link: boot prefetch of project, states, trackings, gates (`pmScreenPrefetch.ts:24-51`); in-app: from mount | Chunk 15.5 + 13.5 kB gzip |
| 2 | Component init | `Screen.tsx:639-736`: project, sequence (3 queries), rows, approval settings, history, writes | |
| 3 | State init | Selected cluster derived from trackings (`defaultSelectedCluster`), orchestration refs (`hooks.ts:658-706`) | |
| 4 | Data retrieval | Round 1 project, states (shared 30 min key), trackings; round 2 gates, early rows, count; round 3 gates' Entra, approvals; round 4 approvals' Entra (harness S1) | usable at round 4 |
| 5 | Dataverse requests | 9 requests (S1 shipped); D165 PB-OP-66..72 | |
| 6 | Business logic | Back-fill (`hooks.ts:408-428`), prepare (`:436-473`), 6 plan builders, stale-guards C6 | Pure, cheap |
| 7 | Transformation | `toChecklistRow` per row, `approvalIndexes` once per settings array (`Screen.tsx:719`) | |
| 8 | Calculations | Sequences memoised (`:674-675`); O(states x gates) | Typing = 1 commit, 8.7-10.7 ms/keystroke (harness S6, jsdom dev build, relative) |
| 9 | Rendering | Memoised `ChecklistTaskTable`, stable handlers; loader until gates answer (`:678-683`) | Not a bottleneck |
| 10 | Interaction | Row action disabled until approval settings are known (`:721-726`, `:837-840`) | SPA-05 |
| 11 | Save | Row patch, Move, Reset, terminal change, Request/Cancel approval | sect. 5.4-5.6 |
| 12 | Bulk | Template copy: 16-wide singles; bulk OFF (`checklistBulkFlags.ts:7-9`) | SPA-06 |
| 13 | Refresh | Row action: rows only (`reload.ts:20-23`); every other job: 9 keys (`hooks.ts:131-135`); command-bar Refresh: 9-10 requests, 2 rounds (S5) | |
| 14 | Navigation | Screen keyed per project (`Screen.tsx:634-637`); the prepare job runs once per cluster per visit (`hooks.ts:695-701`) | |
| 15 | Error handling | Blocking only without data, banner otherwise (`rules.ts:3114-3123`); failed Entra lookup loses one mail only (`checklist.ts:155-161`) | |
| 16 | Cleanup | The transition poll loop has no cancellation if the screen unmounts mid-wait (`hooks.ts:79-92`); bounded by the 30 s deadline | Minor |

### 5.3 Timeline to usable (MEASURED rounds, harness S1, shipped switches)

```
round 1  project, states, trackings
round 2  gates (rows), cluster rows (early), row count
round 3  gates' Entra lookups  (loader ends: gates answered)      approvals (rows)
round 4  approvals' Entra lookups                                  (row actions enabled)
```
4 rounds / 9 requests; all switches off: 6 / 10. Longest step: the Entra lookups (unmeasured). A deep link starts round 1 beside the session project (PB-03), so the first round is shared. ESTIMATED 1-2 s of round trips plus the Entra cost.

### 5.4 Row action (Complete / In Progress / date / comment)

`read existence` (round 1) then `PATCH` (round 2) then `read rows` (round 3), overlay held until the third round (harness S3: 3 rounds / 3 requests; all off: 4 / 11). ESTIMATED 0.7-1.4 s per click. SPA-01.

### 5.5 Move to the next cluster

Harness S4, shipped switches, 11 rounds / 37 requests:

```
1     read trackings, rows, count, history (plan inputs)
2     guard read of the current tracking     (also: warm-up templates read #1)
3     PATCH current tracking -> Completed    (warm-up templates #2)
4     guard read of the next tracking
5     PATCH next tracking -> In Progress
6     POST audit note
7     PATCH project (cluster state, approval state)
8     reload: project, trackings, rows, approvals, history, session project
9-11  first visit of the next (empty) cluster: count, 10 creates, rows and approvals reload
```
The order is pinned for `SynchroniseProjectState` (D150). ESTIMATED 3-5 s. SPA-02.

### 5.6 Power Automate dependencies (separate section, as requested)

The screen calls four flows through `src/data/flows.ts` (`loggedCall("execute", ...)`, `unwrap`); none is called from a screen directly. A flow call runs inside the same `usePlanWrite` job as the Dataverse writes around it, so the blocking overlay covers it.

| Flow (call) | When | Does the UI block? | Waiting / polling | What it can add |
|---|---|---|---|---|
| Perform Common Request of Gate Approval (`requestGateApproval`, `hooks.ts:578-594`) | Request Approval in cluster mode | Yes: after trackings list (round 1), guard GET (2), PATCH (3) the job awaits the `Run`, then rows read, note POST and the 9-key reload | Returns at the flow's Respond action; for an active Only-Notifications gate the screen then sleeps 1.5 s and polls one tracking per 1.5 s for up to 30 s until the flow completes the cluster (`hooks.ts:70-92, 583-588`) | DERIVED from the export: Respond comes after at least 5 sequential connector levels (the Dataverse and Office 365 reads of `Retrieve_Dataverse_Records` are 4), up to about 19 on the Draft-state Only-Notifications branch (upper bound that assumes every branch on the longest chain runs). The human approval wait starts after the Respond and is not awaited. After the Respond, an Only-Notifications flow still runs its notification fan-out (Teams card and mail per recipient), then `Update_current_State_Tracking_Completed`, then the next tracking; the app polls for that. The canvas tooltip tells users to wait 30 seconds (`rules.ts:2521-2523`) |
| Perform Common Request of Check List Approval (`requestChecklistApproval`, `hooks.ts:555-562`) | Request Approval in checklist mode | Yes: one-task read, guarded PATCH (GET+PATCH), the `Run`, then a write-back and note, then the reload | Returns at Respond (depth 5 formal, 11 approvers, 18 Only Notifications; DERIVED) | Same order of magnitude as above |
| Perform Request of Gate Approval Cancellation (`cancelGateApproval`, `hooks.ts:598-622`; also General Data's Draft reset) | Cancel Approval Request; a start-cluster change while a Draft approval runs | Yes | The flow has no Respond action (export), so `Run` returns when the whole flow ends (`16-PM-FLOWS-IN-THE-CODE-APP.md:26-27`); the flow is 3 connector levels: two sequential Dataverse updates inside a try scope, plus a catch mail on failure (DERIVED) | A few seconds ESTIMATED |
| Perform Request of Check List Approval Cancellation (`cancelChecklistApproval`, `hooks.ts:625-634`) | Row cancel icon | Yes: the flow, then a refresh | Returns `success` (not in the export; doc 16) | Unknown |

Server-triggered flows that the screen's writes fire but never waits for: `SynchroniseProjectState` (tracking Added/Modified with In Progress: sets the project's cluster state), `UpdateTeamsandSPOSite` (project `vsb_clusterstate` Modified; acts for Croatia), `WhenProjectDatagetsupdated-...` (not in the export). They run after the writes and are the reason the reload can read a project that a flow is still updating; they add no client latency.

Evidence status: the repo contains no measured flow duration. Everything above about duration is structural (DERIVED) or ESTIMATED. The existing bounds in code are: platform limit 120 s for the Respond, poll deadline 30 s (`hooks.ts:71`), poll step 1.5 s (`:72`). There is no client deadline on the `Run` itself (PB-01 / CA-02). Flows are not to be modified (brief). SPA-03, SPA-04.

### 5.7 First visit to an empty cluster

Harness S2: 10 templates 6 rounds / 22 requests (all off 11 / 29); 40 templates 8 / 52 (all off 14 / 59). The copy sends N single creates 16 wide; the approval settings of the copied templates are read while the copy writes (`warmSettings`, `hooks.ts:359-365`). Bulk (`CHECKLIST_BULK.materialise`) is OFF: the host floor for a bulk request is 1.2-1.9 s (D156 sect 6), about the cost of 3 waves of 16 ordinary creates. SPA-06.

### 5.8 Prior fixes and their current switch state

All thirteen switches of `checklistPerfFlags.ts` ship as in `CHECKLIST_PERF` (re-read in this tree): `targetedReload`, `earlyRows`, `earlyVisit`, `prefetchCopy`, `wideCopy`, `longPeopleCache`, `scopedGates`, `sharedStates`, `quietFocus`, `completeCopy`, `trackingsOnce`, `backfillGuard` ON; `backfillTogether` OFF; `CHECKLIST_BULK.materialise` OFF. The benefit of the ON set is what the harness shows (S1 6 to 4 rounds, S2 11 to 6, S3 4 to 3, S4 16 to 11).

## 6. Team, Planning, Milestones, Grid Operator

| # | Stage | Team | Planning | Milestones | Grid Operator |
|---|---|---|---|---|---|
| 1-5 | Load and requests | Wave 1: project, members, descriptions; wave 2: Entra for manager, deputy, members, 6 wide, kept 30 min (`personCache.ts`, OPT-14). Cold team of 10 about 15 requests, warm 3 (doc 03 B.4) | Wave 1: project, planning row, types; wave 2: statuses, choices (OPT-16). About 7 requests, 2 waves | Wave 1: project (+ countries from cache), states, contract count, recalculation; wave 2: assumptions; wave 3: seed inputs. 6-10 requests, 3 waves | Wave 1: project and row in parallel. 2 requests |
| 6-8 | Logic / transform / calc | Rules pure | Seeds run once per project (`seedOnce.ts`, PB-05 ON) | FID re-pricing in the client; ladder reads 40 ids per chunk side by side (PB-12 ON) | pure |
| 9 | Rendering | Gallery rows | Tabs, permits table, 2 Comboboxes | 17-19 DatePickers (FE-P2-04 not memoised, P3) | small form |
| 10-11 | Interaction / save | 1 write + members-only reload (`team/reload.ts`) | 1 write per job + per-kind reload (`planning/reload.ts`) | Patch project, one group of generator-type PATCHes (8 wide), plant-cost PATCH, revenue seed POST, 6-key reload: about 6-8 rounds (DERIVED) | 1 write + 1 reload |
| 13 | Refresh width | Members key only | Readers of the written table only | 6 keys; active: milestone project, session row, recalculation flag, revenue count | Row key (+ project row key shared with Planning) |
| 14-16 | Navigation / errors / cleanup | Unsaved-changes guard | same | Fabric read failure does not stop the save (`hooks.ts:174-182`) | same |

Server side of Milestones: every save writes `vsb_operationsstartdatecod`, `vsb_construction` and `vsb_enddate` (canvas parity), so the synchronous and asynchronous plugin steps on `vsb_project` run on every save. The client cannot see that time. SPA-17.

Window focus (D165 doc 03 B.9): Team 2, Planning 4, Grid Operator 2, Milestones 3-4 requests per focus after 30 s (OPT-18, deferred by decision).

## 7. Critical user journeys (for doc 11)

Round counts are DERIVED from code unless a harness figure is named; wall time = rounds x 0.25-0.5 s (D144 unit) and is ESTIMATED.

| Journey | Sequence (critical path) | Rounds | Longest step | Candidates / findings |
|---|---|---|---|---|
| Open the app on the project list | host context, import, wave 1 (page, probe, countries, states, env defs, user, directory, country map), interactive; waves 2-3 off the paint path | 1 data round after 2 start-up steps | 540 kB page response | SPA-11 |
| Open a project (Edit Project from the list) | new tab: full cold boot, session project, General Data prefetch of row/lists/children, gate opens, areas and Entra | 3 | session row then row | SPA-13 |
| Load a PM screen by deep link | context, session project, gate, screen reads (prefetched since PB-03), dependent reads | Check List 4, Team 2+Entra, Planning 2, Milestones 3, Grid Operator 1, General Data 2 | Entra (Check List, Team), gates (Check List) | SPA-05 |
| Switch PM screen in the app | lazy chunk, mount, reads (no prefetch), 30 s cache on revisit | as above + chunk | chunk + first read round | SPA-09, SPA-19 |
| Edit and save (typical field screens) | 1 write (project PATCH 0.45-0.85 s for projects) + awaited reload of the written table's readers | 2 | the PATCH | none beyond server time |
| General Data save with start-cluster change | see 4.2 | up to 17 | sequential tail | SPA-14 |
| Check List: complete a task | existence read, PATCH, rows reload | 3 (MEASURED rounds) | 3 sequential requests | SPA-01 |
| Check List: Move to next cluster | sect. 5.5 | 11 / 37 requests (MEASURED rounds) | the 7-step write chain | SPA-02 |
| Check List: Request Approval | 3 reads/writes, flow Run (5-19 connector levels), [Only Notifications: 1.5 s + polls up to 30 s], rows, note, reload | 6-7 app rounds + flow + poll | the flow | SPA-03, SPA-04 |
| Project list: next page / filter / sort | cached next page: 0; else 1 round of 2 requests; filter adds 300-350 ms debounce | 0-1 | 540 kB page | SPA-11 |

## 8. Prior findings re-checked in the current source

| Prior ID | Raised | Current status here |
|---|---|---|
| D41-D46 (pagination invariants) | Overview | Kept, verified: `maxPageSize` not `$top` (`client.ts:321-340`), `named ++ blank` (`projects.ts:125-184`), count once per walk (D43). Not proposed for change |
| D119 S1-S4 | Boot / Overview / GD | Fixed, switches ON (`startupFlags.ts`). F6 annotations: open, platform constant (SPA-11) |
| PB-03 | PM deep link prefetch | Fixed (ON, `bootDvoptFlags.ts:31`); not extended to in-app navigation (SPA-09) |
| PB-04 | New tab cold boot | Open, decision held (tracker DEC-A..G); D142 persistence exists only for Generators catalogue (SPA-13) |
| PB-05 | Planning writes in query functions | Fixed behind `PLANNING_CREATE_ONCE` ON (`bootDvoptFlags.ts:36`) |
| PB-06 | countries one key | ON (`bootDvoptFlags.ts:32`) |
| PB-07 | current user chain | Not done on purpose (`CURRENT_USER_BY_ENTRA` OFF, `:33`) |
| PB-08 | env vars together | Switch OFF (`:34`, QA-09) (SPA-18) |
| PB-09 | Generators warm-up | Open, lazy switch OFF (`:37`) (SPA-10) |
| PB-10 | project row re-reads | Half done: Planning and Grid Operator share a key; others do not (SPA-19) |
| PB-11 | General Data edit tail sequential | Open, verified in `rules.ts:2112-2181` (SPA-14) |
| PB-12 | Milestones re-pricing | Fixed, `MILESTONES_REPRICE_TOGETHER` ON (`milestonesPerfFlags.ts`) |
| PB-13 / PB-14 | Check List trackings twice / back-fill | Fixed behind `trackingsOnce`, `backfillGuard` ON; `backfillTogether` OFF |
| PB-15 / PB-16 | GD cancel reuses cache / one Entra cache | Fixed (`GD_CANCEL_REUSES_CACHE`, `ONE_PERSON_CACHE` ON) |
| PB-02 | municipality truncation | Open (T-30 not started); SPA-15 |
| PB-01 | flow reliability | Open (owner wording needed); SPA-03 adds the latency angle |
| OPT-13, OPT-14, OPT-16, OPT-19 | PM save reload width, Entra cache, Planning 2 waves, search debounce | Fixed, verified in `team/reload.ts`, `planning/reload.ts`, `grid-operator/reload.ts`, `planning/hooks.ts:100-121` |
| D150, D156, D158, D138 | Check List switches | Table in 5.8; remaining ideas listed as not built in D150 and D156 sect 6 (SPA-01, 02, 05, 06) |
| FE-P1-01, 02a/b, 03, 04 | frontend programme | 01 done (starts early, not smaller), 02a done, 02b deferred, 03 done, 04 skipped |
| OPT-18 | focus refetch | Deferred by decision DEC-3; counts in sect. 6 |

## 9. Checked and found NOT to be a bottleneck

- **Row rendering on the Overview and Check List:** `ProjectGridRow` is memoised with stable props; `ChecklistTaskTable` is memoised with `useStableCallback`; a comment keystroke is 1 commit, 8.7 ms (shipped) to 10.7 ms (all off) in the harness (jsdom, development build: relative only). Computation per render is O(states x gates) and O(rows).
- **Overview `$select`:** 22 columns, not the 112 of the table (`rules.ts:106-113`). Row mapping is linear.
- **Next-page prefetch timing:** delayed 1.5 s, one page ahead, `qc.query` with `staleTime`, cleared on change (`hooks.ts:187-206`).
- **Startup bundle:** 302 kB gzip; Application Insights and the map are lazy; PM screen chunks are 6-29 kB gzip including their data chunk.
- **Check List reload width:** a row action reloads the rows key only; approvals are not refetched because their key is the template ids (`reload.ts`, harness S3: 3 requests).
- **Check List guards and write order:** the guard reads and the pinned order protect against re-creating deleted rows and drive `SynchroniseProjectState`; recorded as business-relevant, not as defects.
- **Team, Planning, Grid Operator, Milestones loads:** already 1-3 waves with targeted reloads; Entra cached 30 min.
- **Planning seeds:** run once per project (`seedOnce`), no longer in every query-function run.
- **Template copy memory/CPU:** plan building is O(templates); the cost is request count.

## 10. Limitations and what would settle the open items

1. No measurement of any real latency: Entra lookups (SPA-05), flow runs (SPA-03/04), plugin time (SPA-17), 540 kB page time (SPA-11), grid mount time (SPA-12), map parse time (SPA-16), municipality payload (SPA-15). Each register row names the capture that settles it; the existing `[VSB]` console lines carry per-request milliseconds.
2. The harness hop is 120 ms of fake latency; rounds are exact, durations are not.
3. The flow depths come from export 1.21.709; DEV may differ and two flows are not in the export.
4. Team, Planning, Milestones and Grid Operator screens were read through their hooks and greps, not line by line, and the admin flows were out of scope.
5. The register header has 17 column names as listed in the brief (the brief's text says 15 and 16); I kept the 17-name header.

## Appendix A. Harness output (MEASURED, 26 Nov 2026)

Command and file: sect. 1. Rounds / requests (R / Q); S1 usual visit, 40 tasks; S2 first visit; S3 complete one task; S4 move to next cluster (next empty, 10 templates); S5 Refresh icon.

| Scenario | All switches off R / Q | Shipped R / Q |
|---|---|---|
| S1 usual visit to usable | 6 / 10 | 4 / 9 |
| S2 first visit, 10 templates | 11 / 29 | 6 / 22 |
| S2 first visit, 40 templates | 14 / 59 | 8 / 52 |
| S3 complete a task | 4 / 11 | 3 / 3 |
| S4 move to next cluster | 16 / 43 | 11 / 37 |
| S5 Refresh icon | 3 / 10 | 2 / 9 |
| S6 typing per keystroke | 1 commit, 10.71 ms median | 1 commit, 8.67 ms median |

These equal the figures recorded in D150 (S1 6/10 to 4/10, S2 11/29 to 6/23, S3 4/11 to 3/3, S4 16/43 to 11/38) within one request, so the repo's recorded benchmark still holds on this tree.

## Appendix B. Flow chain depths (DERIVED from solution export 1.21.709)

Longest chain of connector actions (OpenApiConnection, child-flow call, webhook) before a Respond action, loops counted once, a child-flow call counted as one level.

| Flow | Respond depths | Notes |
|---|---|---|
| Perform Common Request of Gate Approval | 5 (PM approval), 10 (approvers), 19 (Only Notifications) | `Retrieve_Dataverse_Records` scope ends at depth 4; the Draft-state Internal-ID block contains an Until with up to 20 iterations (`Do_until_Project_updated_successfully`, limit 20, PT1H) |
| Perform Common Request of Check List Approval | 5, 11, 18 | Same shape |
| Perform Request of Gate Approval Cancellation | no Respond | 3 levels: parse, two updates, catch mail |
| Compose Checklist Items (child) | 4 | |
| Request Portfolio Managers Approval (child) | 2 | approval wait after it |
