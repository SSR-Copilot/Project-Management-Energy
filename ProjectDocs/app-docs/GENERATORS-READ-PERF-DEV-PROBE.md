# Probe plan - Generators read performance (D142)

Status: **draft, 19 Nov 2026.** The code is in the worktree `generators-perf` (branch `perf/generators-screen`), **not committed, not product-approved, not run against DEV**. Decision record: `02-OPEN-DECISIONS.md` **D142** (provisional number, it may be renumbered at merge). It is phase B of the Generators performance programme; phase A is **D141**.

This plan has two halves:
- **Part A** is automated and runs in `npm run verify`.
- **Part B** is a manual probe against **VSBCloud_Dev** on the DEV test project, which only a person with a signed-in browser can run.

Run Part B only after Part A is green. **Do not change a switch in a committed file** until the probe has passed and the result is recorded in D142.

## What the probe is for, in one paragraph

Three switches in `src/data/generatorsPerfFlags.ts` (`GENERATORS_PERF`) belong to this phase:

| Switch | Ships | What it does | What nobody has verified |
|---|---|---|---|
| `parallelChunks` | **ON** | The reads that filter by a list of ids (40 ids per request) send their chunks together (at most 4 at once) instead of one after another. Same rows, same order. | Nothing server-side: it is the same requests. Only the timing is worth a look (P1). |
| `readsByProject` | **OFF** | The turbines are read with ONE request filtered by the project, so they no longer wait for the types read. Prefetch also starts them at once. | **Whether Dataverse answers the filter through the turbine's polymorphic type lookup, and with the same rows as the by-type read.** This is what P2 to P5 test. |
| `persistCatalogue` | **OFF** | The orderable generator catalogue is kept in the browser (IndexedDB) and shown at once on the next visit while it is re-read. | How it behaves in a real browser, a private window, and after a new build (P6 to P11). |

The host adds about 1.2 to 1.9 seconds per request (D51), so the number of requests that must wait for another request is what matters. Today the first view has a chain: **types, then turbines**. With `readsByProject` on, the turbines start at the same time as the types.

---

## Part A - automated (no environment needed)

From `ProjectCosts-CodeApp/`:

```powershell
npx vitest run src/data/generators.chunks.test.ts src/data/persistedReference.test.ts src/features/pm/generators/readsPerf.hooks.test.tsx
npm run verify
```

| Suite | Ids | What it proves |
|---|---|---|
| `data/generators.chunks.test.ts` | UT-GENPERF-200...210 | `parallelChunks` on and off: the same rows in the same order for 90 types in 3 chunks, for the models, the inverter catalogue suppliers and the land-lease allocations; chunks overlap up to 4 and never more (peak count); one chunk at a time when off; a failed chunk fails the whole read both ways; no chunk starts after a failure |
| `data/generators.chunks.test.ts` | UT-GENPERF-220...223 | The by-project read: one request, the filter text, the same `$select` and the same rows as the by-type read, a bad id refused before any request, a refused request fails the read, the switch ships off |
| `features/pm/generators/readsPerf.hooks.test.tsx` | UT-GENPERF-270...275 | The turbines hook on and off (key, enabling, no re-read when the type set changes), the new key sits under the `turbines` family so every reload reaches it, the prefetch on and off |
| `data/persistedReference.test.ts` | UT-GENPERF-240...265 | Version key, maximum age, malformed entries, storage missing or throwing behaves as an empty cache, the IndexedDB wrapper against a fake database (open fails, blocked, never answers) |
| `features/pm/generators/readsPerf.hooks.test.tsx` | UT-GENPERF-280...286 | The catalogue hook with `persistCatalogue` on and off: stored rows shown at once but not "known", replaced by the server's rows, saved after every successful read, never overwriting a fresher answer, a failed re-read is a load error |

Expected: every step passes.

---

## Part B - manual, VSBCloud_Dev

### Before you start

1. **Use the DEV test project and nothing else.** Never use a live project. It needs: **at least 3 WTG types**, one of them **inactive** (deactivated), each with turbines; **at least one PV module type** (it has a unit row in the same table as the turbines); and, for P1, a project with **41 or more WTG types** if one exists (otherwise skip P1 and say so). The project id stays in your head and your session: **never write it, a token or a URL with a secret into a file, a screenshot caption or a commit**.
2. **Start the app against DEV** from `ProjectCosts-CodeApp/`: `pa app run` (or `npm run dev` plus `pac code run --appUrl http://localhost:3000`). Open the `apps.powerapps.com/.../app/local?...` URL it prints, **not** `localhost:3000`. Check `pac auth list` shows VSBCloud_Dev.
3. **Switches, one at a time.** Edit `GENERATORS_PERF` in `src/data/generatorsPerfFlags.ts` **locally** (a working-tree change you never commit), change only the switch the step names, and let the dev server reload (reload the browser tab as well). Revert the file when you are done: `git checkout -- src/data/generatorsPerfFlags.ts`.
4. **Open the developer tools (F12).** Console: filter `[VSB]`; keep **Preserve log** on. Network: keep the full list. Leave them open for the whole probe.
5. **A way to read raw rows**: a Web API read in a signed-in browser tab on `https://vsbclouddev.crm4.dynamics.com/api/data/v9.2/...`, or make.powerapps.com (Tables, Data).
6. **Record each result** as Pass, Fail or Blocked, with the `[VSB]` lines pasted (they carry counts, names and timings, never row values).

### What to read in the console

- `[VSB] HTTP GET <path> -> <status> · <ms> ms`: every request. The turbine request is the one to `vsb_generatorinprojects`.
- `[VSB] DATA read load the project's turbines: N rows, P pages, T ms`: one line per read, however many pages it walked. With the by-type read there is one such line **per chunk** of 40 types; with the by-project read there is one line in all.
- `[VSB] ACTION Load @ /project/generators ...`: one line per query the screen starts, with its time and request count.
- `[VSB] ACTION Generators prefetch: N independent reads started`: with `readsByProject` on, N is **11** (10 when off).
- `[VSB] ACTION Reference cache generatorCatalogue: ...`: the stored catalogue's hit, miss, drop and save lines (P6 onward).
- `[VSB] ERROR ...`: a failure with its root cause.

**How to tell "waiting" from "together"** in the Network tab: two requests that start within a few milliseconds of each other are together; a request that starts only after another one has answered is waiting for it. Read the start times in the waterfall.

---

### P0. Baseline (both reads as they were)

Set `readsByProject: false` and `parallelChunks: false` (everything else as shipped). Open Generators on the test project with the console open.

Record: the number of WTG types; the **turbine rows** (the count in the `DATA read load the project's turbines` line, summed over its chunks); the list of turbine names per type as the screen shows them (write down the counts per type, not the names); the order of the requests (types first, then turbines); the time from opening the screen to the list.

### P1. `parallelChunks` (needs a project with 41 or more WTG types; otherwise Blocked)

Set `parallelChunks: true`. Reload.

| Check | Expected |
|---|---|
| The turbine reads | One `DATA read load the project's turbines` line per 40 types, and in the Network tab those requests start together (at most 4 at once), not one after the other |
| The rows | The same total turbine count as P0, and the screen shows the same turbines per type |
| The models read (`load the project's generator models`) | The same: its chunk requests start together |
| The time | Shorter than P0 by roughly (chunks - 1) x one request; record both |

### P2. The by-project filter in the raw Web API (no code change)

In a signed-in browser tab on DEV, open this URL. Replace `<project-id>` with the test project's id (do not save the URL anywhere):

```
https://vsbclouddev.crm4.dynamics.com/api/data/v9.2/vsb_generatorinprojects?$select=vsb_generatorinprojectid,_vsb_moduletypeinprojectid_value&$filter=vsb_ModuleTypeInProjectId_vsb_generatortypeinproject/_vsb_project_value eq <project-id>&$count=true
```

This is the filter `listProjectTurbinesByProject` sends (`TURBINES_BY_PROJECT_NAVIGATION` in `src/data/generators.ts`).

| Outcome | What it means | Do |
|---|---|---|
| **200**, and `@odata.count` equals the P0 turbine count | The server answers the filter with the right number of rows | Go on to P3 |
| **200**, but the count differs from P0 | The filter reaches other rows or misses some | **Fail.** Record both counts and stop: the switch must stay off |
| **400** or **404** (a message about the navigation property or the path) | The spelling is not accepted | Try the spellings in P2b, then record the message. If none works: **Fail**, the switch must stay off |
| 200 with a count of 0 where P0 had turbines | The path matched nothing | **Fail**, as above |

**P2b. Other spellings to try (only if P2 answered 400 or 404)**, one at a time, in place of `vsb_ModuleTypeInProjectId_vsb_generatortypeinproject` in the URL:
- `vsb_moduletypeinprojectid_vsb_generatortypeinproject`
- `vsb_ModuleTypeInProjectId` (the plain name, which a polymorphic lookup does not usually accept)

Also read `https://vsbclouddev.crm4.dynamics.com/api/data/v9.2/$metadata` and search for `vsb_generatorinproject` to see the real navigation property names of the entity. If a spelling works, change `TURBINES_BY_PROJECT_NAVIGATION` locally, repeat P2, and **report the working spelling** so the code can be corrected and the unit test (UT-GENPERF-220) updated; do not commit the change yourself.

### P3. Same rows as the by-type read

If P2 passed: in the same browser tab, run the by-type form for the same project and compare the two lists as **sets of ids** (the order may differ: neither read has an `$orderby`, and the screen sorts by the turbine's index):

```
https://vsbclouddev.crm4.dynamics.com/api/data/v9.2/vsb_generatortypeinprojects?$select=vsb_generatortypeinprojectid&$filter=_vsb_project_value eq <project-id>
```

Then for each type id, `.../vsb_generatorinprojects?$select=vsb_generatorinprojectid&$filter=_vsb_moduletypeinprojectid_value eq <type-id>`. The union of those must equal the ids returned by P2.

| Check | Expected |
|---|---|
| Same ids | Identical sets |
| The inactive type | Its turbines are in both lists (neither read filters on `statecode`) |
| The PV unit | The PV module type's unit row is in **neither** list (the by-project filter goes through the WTG type's navigation, so a unit that points at a PV type must not appear) |

### P4. The switch in the app

Set `readsByProject: true`. Reload the app and open Generators on the test project.

| Check | Expected |
|---|---|
| The requests | The turbine request (`vsb_generatorinprojects` with a `$filter` that names the navigation, **one request**, no `or` chain) starts **together with** the types request, not after it. With a deep link, the console shows `Generators prefetch: 11 independent reads started` |
| `DATA read load the project's turbines` | One line, the same row count as P0 |
| The screen | The same turbines per type as P0 (counts per type), the same totals, no error banner, no `[VSB] ERROR` |
| The time | Shorter than P0 by about one request (the types read no longer comes first); record both |

### P5. Reloads after a save with the switch on

Still with `readsByProject: true`. Edit one turbine (change a value and Save), then Add one WTG type with 2 turbines, then Deactivate and Activate it.

| Check | Expected |
|---|---|
| After each save | `Generators reload after <kind>` names the turbines family where the kind changes turbines, and one `Load` of the turbines follows (the by-project read), once |
| The screen | Shows the saved change; the new type's turbines appear; no stale list, no blink to empty |
| Writes | The Save buttons and commands stay off while the reload runs (nothing is built from a half-reloaded list); then come back |

Delete the type you created. Add every row you created to a manifest outside the repository.

### P6. `persistCatalogue`, first visit (miss, then saved)

Revert the switches above (`git checkout -- src/data/generatorsPerfFlags.ts`), then set only `persistCatalogue: true`. Open the browser's developer tools, tab **Application**, **IndexedDB**, and delete the database `vsb-reference-cache` if it exists. Reload the app, open Generators, then open **Add Generator Type** (the catalogue loads only when a panel needs it).

| Check | Expected |
|---|---|
| Console | `Reference cache generatorCatalogue: miss (nothing saved)`, then the catalogue read as before, then `Reference cache generatorCatalogue: saved (N rows)` |
| IndexedDB | The database `vsb-reference-cache`, store `entries`, one key `generatorCatalogue:<fid date>`; its value holds `v`, `t` and `data`. **Look at one row of `data`: it must hold only the model columns** (name, display name, supplier, turbine type, hub height, rotor diameter, specific capacity, total height, earliest phase-out, country availability numbers, foundation cost flag, additional foundation cost, five prices) and **no name of a person, no project, no id of a user** |

### P7. Second visit (hit, shown now, replaced)

Close the panel, reload the page, open Generators, open **Add Generator Type**.

| Check | Expected |
|---|---|
| Console | `Reference cache generatorCatalogue: hit (N rows, saved S s ago), shown now and re-read from the server`, and the catalogue request **still goes out** (stale-while-revalidate) |
| The panel | The supplier list is there at once; **Save stays disabled** until the re-read has answered (the cached rows are shown but not trusted) |
| After the re-read | Save is available as before; `saved (N rows)` is printed again |

### P8. A stale copy is replaced

In the Application tab, edit the stored value (change one model's `displayName` to `STALE-TEST`) and reload. Open the panel.

| Check | Expected |
|---|---|
| First | The panel may show `STALE-TEST` for the length of one read |
| Then | The real name replaces it; reopening the panel shows the real name; the stored value is the real one again |

### P9. Version and age

1. In the Application tab, edit the stored value's `v` to `old` and reload; open the panel. Expected: `dropped (other version)`, the plain read, a new entry saved.
2. Set `t` to a time 13 hours ago (`Date.now() - 13*3600*1000`, in milliseconds) and reload; open the panel. Expected: `dropped (older than 43200 s)`, the plain read, a new entry saved.
3. Stop the dev server and start it again (a new build id), reload, open the panel. Expected: `dropped (other version)` (the build id is part of the version).

### P10. Storage unavailable

1. Open the app in a **private / incognito window** signed in to DEV, open the panel. Expected: no error on the screen; the console shows either `unavailable (...)` or a `miss`, and the catalogue loads as before.
2. In a normal window, block site data for the host (browser settings, "block third-party / all cookies and site data"), reload, open the panel. Expected: the same, nothing breaks, and no `[VSB] ERROR` line.

### P11. A failed re-read after a stored copy

With a stored copy present, in the Network tab block the request for `vsb_generators` (right-click the request, **Block request URL**), reload, open the panel.

| Check | Expected |
|---|---|
| The panel | Shows the load-error state, **not** a quiet catalogue; Save stays disabled |
| Console | One `[VSB] ERROR` for the failed read, and no `saved` line |

Remove the block afterwards. Revert the switch: `git checkout -- src/data/generatorsPerfFlags.ts`.

---

## What to record

| Item | Value |
|---|---|
| Build (`git log -1`) and the date | |
| Number of WTG types; turbine rows (P0) | |
| P1: chunks, start times, time before and after (or Blocked) | |
| P2: HTTP status, the count, the spelling that worked | |
| P3: the id sets equal? PV unit excluded? inactive type included? | |
| P4: first view time before and after; the prefetch line; row count | |
| P5: reload lines per kind; any stale list | |
| P6 to P11: Pass, Fail or Blocked each, with the `Reference cache` lines | |
| Anything unexpected | |

## Decision after the probe

- **`readsByProject`**: flip to `true` in `generatorsPerfFlags.ts` only if **P2, P3, P4 and P5 all pass**. If P2 passes only with another spelling, correct `TURBINES_BY_PROJECT_NAVIGATION` and its test first. Record the result in D142.
- **`persistCatalogue`**: flip only if **P6 to P11 pass** and the product owner accepts that the catalogue may show up to 12 hours old for the length of one read (D142 divergence).
- **`parallelChunks`** ships on. If P1 shows a 429 or a failure that the serial read did not have, set it to `false` (one line) and report it.
