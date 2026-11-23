# 06 — Performance comparison

Final state, 24 Nov 2026. **Nothing in this file is a wall-clock measurement.** No signed-in DEV session was available to the agents, so no timing through the Power Apps host was taken. Every figure below is a **count** produced by a test in the repository (sequential waves, requests, renders, recomputations) and is labelled with the test id. The old figure was recorded by running the same test against the unmodified code where the table says so; where it says "by construction" or "from the code" it was derived from reading the old code and not re-run (called out per row).

Labels: **measured (old+new)** old and new both produced by a test run; **measured (new), old from code** the new figure is a test result and the old figure comes from reading the code; **owner** only the owner can produce it on DEV.

## Why counts, not seconds

A request through the host costs one round trip (the docs record 1.2–1.9 s per request through the host, D51); requests that start together overlap. So the time cost of a load is its number of SEQUENTIAL WAVES. Translating waves to seconds is an estimate (waves × the round-trip time, `04` §7 used 0.3–1.5 s) and stays an estimate until the owner runs the DEV timings below.

## Counts

### Cost reads and invalidation (B2)

| Action | Before | After | Test | Label |
|---|---|---|---|---|
| OPEX visit (project with devices) | 4 waves, 10 requests | 2 waves, 4 requests | UT-COSTWAVE-OPT-001…004 | measured (old on unmodified tree, recorded as constants in the test) |
| CAPEX tab load, cold | 4 waves, 5 requests | 3 waves, 5 requests | OPT-005 | same |
| CAPEX tab load, chart warm | 4 waves | 2 waves | OPT-010 | same |
| CAPEX Summary tab, chart-of-accounts requests | 3 | 1 | OPT-009, UT-COSTREAD-OPT-009 | measured (new), old from code |
| Contracts screen, DevCo contracts reads | 2 | 1 | UT-CONTR-OPT-004 | measured |
| Mark a month paid: keys reloaded | 5 | 1 (the cost book) | UT-CAPEXINV-OPT-001…008 | measured |
| Comment save: reload | the whole cost book | comments only | UT-CAPEXINV-OPT-105 | measured |
| OPEX Other: O&M device-type requests | 4–5 | 0 | UT-OPEXLOAD-005…007 | measured |

### Cost writes (B3)

| Action | Before | After | Test | Label |
|---|---|---|---|---|
| Land Lease 40-WTG Period-1 save | 44 sequential waves | 9 | UT-LLWRITE-010 | measured (old+new, same fake, legacy executor kept as oracle) |
| Land Lease contract delete, 40 allocations | 44 | 7 | UT-LLWRITE-011 | same |
| Land Lease standard import | 44 | 9 | UT-LLWRITE-012 | same |
| OPEX head save, 6 children | 9 waves, 11 requests | 4 waves, 11 requests (3 waves, 8 requests with catalogue and warm currency) | UT-PWOPEX-001…006 | measured |
| OPEX child edit with 4 followers | 8 waves | 3 | UT-PWOPEX | measured |
| OPEX head delete, 6 children | 8 | 3 | UT-PWOPEX | measured |
| OPEX standard import, head + 5 rows | 9 | 5 | UT-PWOPEX | measured |

(The first version of the Land Lease tiering reported 7 / 5 / 7 and was not safe on failure; the corrected rule costs two or four more waves. These are the final numbers.)

### Cost UI (B4) — counts of work, not time

| Check | Before | After | Test | Label |
|---|---|---|---|---|
| 5 parent renders, rendered inputs unchanged: `grid.render` / `gridRows` | 6 / 6 | 1 / 1 | UT-PCFGRID-OPT-001 | measured (old+new) |
| 10 resize ticks at an unchanged size | 11 renders | 0 | UT-PCFGRID-OPT-005 | measured (old+new) |
| O&M card of 40 rows: `localeCompare` calls | 3,040 | 76 | UT-OPEX-OPT-005 | measured |
| Other OPEX chain of 40: `localeCompare` calls | 5,840 | 39 | UT-OPEX-OPT-006 | measured |
| 5 panel keystrokes: badge / gates / row builds | every open card (by construction) | 0 extra | UT-OPEXUI-OPT-001, UT-LLUI-OPT-001 | measured (new), old from code |
| Comment-dot projection of a 5,000-payment category | 5,000 objects | 2 (linked only) | UT-CMT-OPT-004 | measured |
| Contracts Save gate: mismatches vs the old gate over 1,500 generated forms | — | 0 | UT-CONTR-OPT-003 | measured |

### PM and app (B5a, B5b)

| Action | Before | After | Test | Label |
|---|---|---|---|---|
| PM screen entry, session project load | 4 requests, 2 waves | 1 request, 1 wave (2/2 if the annotation is absent) | UT-PROJLOAD-OPT-001, 010, 014 | measured (old+new) |
| PM save: session reload | 4 requests | 1 | UT-PROJLOAD-OPT-001/010 | measured |
| Team save: keys reloaded | project + members (+2 directory lookups) | members only | UT-TEAM-OPT-201…203 | measured |
| Team load, 20 members | 1 members + 1 descriptions + 20 lookups at once | 1 + 0 + 20 at 6 once; a reload after a save: 1 read, 0 lookups | UT-TEAM-OPT-001 (old), 002…010 | measured (old+new) |
| Team search, 3 keystrokes | 3 searches | 1 | UT-TEAM-OPT-103 | measured (old+new) |
| Milestones load | 2 requests | 1 (warm list) | UT-MSTONE-OPT-001…004 | measured (new), old from code |
| Production device types | 1 request per type | 1 per 40 types | UT-PROD-OPT-001…004 | measured |
| Production one-shot generation: project reads | 2 | 1 | UT-PRODBASE-103 | measured (old existing test, new updated) |
| Boot prefetch | Overview, General Data, Generators only | also Cost and 8 more PM screens | UT-BOOT-OPT-010…016 | measured (tests assert what starts) |

### Generators, Check List (B6)

| Action | Before | After | Test | Label |
|---|---|---|---|---|
| WTG type delete: sequential reads | 4 | 3 | UT-GENWAVE-OPT-001…007 | measured (old via the switch, new) |
| PV type delete: sequential reads | 5 | 3 | same | same |
| Generators project read, warm countries list | 2 requests per save reload | 1 | UT-GENCOUNTRY-OPT-101…104 | measured |
| Check List cluster-transition poll | all trackings, 11 columns, up to 20 times | 1 row, 3 columns | UT-CHKNARROW-OPT-021/022 | measured |
| Check List template copy: row ids drawn on the single-create path | one per template | 0 | UT-CHKMAT-OPT-001 | measured (old from code) |

### Admin (B7)

| Action | Before | After | Test | Label |
|---|---|---|---|---|
| Check List Settings locks read: columns | 9 (three 1,000-character JSON columns) | 3, more than 5× smaller on a 300-row fixture | UT-ADCHKTBL-OPT-001…003 | measured |
| Gates load, 100 tasks: approval chunks | one at a time | together (`mapLimit` 4) | UT-ADCHKTBL-OPT-004…006 | measured |
| Gates load, 31 distinct managers: people chunks | 3 serial | 1 wave | UT-ADGATE-OPT-001…006 | measured |
| Gates reload after a toggle/save: name lookups | 1 Graph lookup | 0 when all ids known | UT-ADGATE-OPT-007…010, 014, 015 | measured |
| Gates grid render: element reads per render (150 × 100 × 6) | 65,538 | 400 once per dataset, 0 per render | UT-ADGATE-OPT-020…024 | measured |
| `buildCapexHierarchy`, 299-row chart | 14,951 element reads | ≤ 897 | UT-ADCOST-OPT-003 | measured |
| Costs screen: `groupContracts` calls on mount | 12 | 3 | UT-ADCOST-OPT-001/002 | measured |
| Contracts: tag-group derivations over 3 keystrokes | 6 | 0 | UT-ADCONTR-OPT-001…003 | measured |

### Sweep (B8)

| Check | Before | After | Test | Label |
|---|---|---|---|---|
| Cost screen entry: `loadProjectExtras` calls when the session project is the one asked for | 1 per screen | 0 | UT-PROJEXTRAS-OPT-020…024 | measured |
| 500-row number column: `Intl.NumberFormat` built | 1000 (2 per cell) | ≤ 3 | UT-INTLPOOL-OPT-001…003 | measured (old+new) |
| `useMediaQuery`: listener adds after 5 re-renders | > 1 | 1 | UT-MEDIAQUERY-OPT-001…003 | measured (old+new) |
| `trackMetric` with telemetry off, 50 metrics: payloads built | 50 | 0 | UT-AI-OPT-001…003 | measured (old+new) |

## Not measured

- **Any wall-clock time** through the host (all of the above are counts). The owner-measured table below is empty on purpose.
- The CPU cost of a CAPEX panel keystroke on a large category (the repaint is now zero, but how many milliseconds the old repaint cost was not profiled). Add Cost from Table's own bench (15,000 rows) shows `validateSheet` 13 ms and a Save prepare 6 ms and was left alone.
- The two figures the independent review noted are recorded constants rather than reproducible old-code runs: the B2 "before" wave counts (UT-COSTWAVE-OPT-001/005 compare a constant to itself; the new-side assertions are real).

## Owner-measured (to be filled on DEV)

Record the `[VSB]` ACTION line durations (before = a build of `b976a96`, after = this branch) for: OPEX visit and save; CAPEX tab switch, paid toggle and comment save; Land Lease save/delete/import on a project with about 40 turbines; a PM screen entry; a Team load; the Project Gates load and a toggle; a Generators type delete.

| Action | `b976a96` | this branch | Notes |
|---|---|---|---|
| | | | |
