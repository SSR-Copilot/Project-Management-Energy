# 16 - Network Optimization Strategy

> Stage 2 (design and planning only), 25 Nov 2026. Inputs: doc 04 (28 findings name the network area), doc 03 (per-screen traces). Tasks: T-20 to T-24, T-22.

## 1. What the audit found, in four patterns

1. **Refresh wider than the write.** A paid toggle, a panel save or delete reloads the whole category book (CA-05); an Add Cost Save refetches the not-displayed project-wide Summary twice (CA-06); every Land Lease write reloads reference rows (CB-15); Project Gates reloads three or four waves per pill click (AD-06).
2. **Independent reads waiting for each other.** Comments start after payments (CA-09); the cancellation flow runs before the independent Identify reads (PA-05); trackings are read twice per cluster visit (PB-13); the PM deep link starts only the project read, so the screen's own reads wait for the gate (PB-03); environment variables take two sequential reads (PB-08).
3. **The same table read under several keys or by several screens.** `vsb_countries` four ways (PB-06); `vsb_projects` per PM screen (PB-10); three Entra person caches (PB-16); the SPV/DevCo mapping on every book load (CA-08).
4. **Speculative work on every screen.** The Generators warm-up sends 10-13 reads from every PM screen, most stale before use (PA-11, PB-09).

None of these changes what the user sees; each is a scheduling or scope decision.

## 2. Rules (the standard Stage 3 applies)

| # | Rule | How it is checked |
|---|---|---|
| N1 | **A write refreshes what it wrote.** Patch the cached rows from the values just written, or invalidate only the affected key; never reload a whole screen to show one row. A patch must equal a reload (differential test). | request-count assertion per interaction; patch-equals-reload test |
| N2 | **Start every independent read in the same wave.** Two reads may be sequential only if the second needs a value from the first, and the code says which value. | wave count per scenario (census, T-00) |
| N3 | **One key, one select, per table per purpose.** Reference tables go through `sharedRead` or one query key with the widest select any screen needs. | grep gate for duplicate keys on the listed tables; keyed-cache tests |
| N4 | **No speculative read without a measured payoff.** A warm-up runs only where the next navigation is likely, and is measured against first paint. | census before/after on the PM screens |
| N5 | **A flow or write that does not feed the next read does not delay it.** | wave count |
| N6 | **Every refresh path runs on every outcome** (success, partial failure, unknown outcome), because a stale cache after a failure is what turns a retry into a duplicate (CB-02). | failure-injection tests |

## 3. Scope of each change (task to patterns)

| Task | Patterns | Findings |
|---|---|---|
| T-20 Cost | 1, 2, 3 | CA-05, CA-06, CA-08, CA-09, CA-15, CA-16 |
| T-21 Contracts, OPEX, Land Lease | 1, 2 | CB-07, CB-08, CB-09, CB-11, CB-12, CB-13, CB-15 |
| T-22 Generators, Production, Revenues, Finance | 2, 3, 4 | PA-05, PA-08, PA-09, PA-10, PA-11, PB-09, PA-15 |
| T-23 Boot and PM screens | 2, 3 | PB-03, PB-06, PB-07, PB-08, PB-10, PB-12, PB-13, PB-15, PB-16 |
| T-24 Admin | 1, 3 | AD-03, AD-06, AD-08, AD-09, AD-11, AD-12 |

## 4. What this strategy does not do

- It does not remove a request without proof that the data is unneeded or already held; every removal names the value that makes it safe, and N1's differential test is the proof.
- It does not change the focus-refetch default (30 s stale, refetch on focus). That protects against overwriting a colleague's change and is held as DEC-F (doc 22 section 3).
- It does not touch the speculative second page of Project Overview (D41-D46 invariants).
- Opening 'Edit Project' / 'Edit Costs' in a new tab still pays a cold boot (PB-04, DEC-C).

## 5. Measuring success

Per scenario, from the same capture before and after (T-00): number of requests, **waves** (sequential depth), and time to the first usable paint. Request count and latency are reported separately: fewer requests do not always mean less time, and the host's per-request round trip is a platform constant that this programme cannot lower. Targets: doc 25.
