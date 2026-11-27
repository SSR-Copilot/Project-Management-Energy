# 26 — Before and after performance benchmark

> Stage 3, 27 Nov 2026. Every number below is machine-independent (bytes, requests, waves/rounds, in-flight counts) and has its command. **No wall-clock browser or DEV measurement exists**: that needs the Wave 0 campaign (doc 22 section 4). "Before" is base commit `dde9e92`.

## 1. Bundle (bytes, gzip KiB, first visit / cold cache)

Measured by the `bundle-structure` workstream with the Stage 2 script `_bench/S2E/cmp.mjs` (base vs its worktree). **These per-screen figures are for the bundle-structure changes alone.** They were not re-measured on the final combined tree (only the start-up closure was, below).

| Screen (first load) | Before | After | Change |
|---|---|---|---|
| Landing (Project Overview) | 55.6 | 39.8 | -15.8 |
| Planning | 94.1 | 74.2 | -19.9 |
| Grid Operator | 52.1 | 32.1 | -20.0 |
| Revenues | 140.7 | 103.3 | -37.4 |
| Milestones | 128.1 | 67.4 | -60.7 |
| General Data | 118.0 | 76.9 | -41.1 |
| Finance | 107.6 | 85.9 | -21.7 |
| JS files in the build | 155 | 151 (bundle-structure alone) / 165 chunks (combined) | |

Stage 2 predicted: landing about -16, Planning/Grid/Revenues about -20, Milestones 128 to 68, General Data 118 to 77, Finance -22. Measured results match (Revenues is better than predicted).

## 2. Start-up closure (final combined tree, `npm run build` then `node scripts/bundle-report.mjs dist --top 12`)

| | Files | min | gzip |
|---|---|---|---|
| Base `dde9e92` | 8 | 1030.1 kB | 302.0 KiB |
| bundle-structure alone | 8 | | 301.9 KiB |
| entry-prefetch alone | 11 | 1032.9 kB | 303.6 KiB |
| **Final combined** | **12** | **1033.0 kB** | **303.9 KiB** |

Result: **+1.9 KiB gzip (+0.6 %), against the criterion "must not grow".** The implementer's breakdown: the `index` chunk +0.5 KiB (flags, admin boot target, category parsing, admin loader map, a 20-line `useRailIntent` hook); the rest is bundler re-chunking caused by new dynamic importers (the previous single `requestLog` chunk is now `requestLog` + `data` + `telemetry`, 17.2 KiB gz in total, plus a 0.3 KiB `QueryClientProvider` chunk). Everything screen-sized (`costScreenPrefetch`, `costQueries`, the Production/Revenues/Finance queries, `screenPrefetch`, `intentPrefetch`, `intentStart`) is outside the start-up closure. **Decision needed from the owner** (accept, defer the Cost prefetch to a lazy chunk, or offset elsewhere).

## 3. Waves before the first read (test-recorded over the real data modules)

Command: `npx vitest run src/app/costScreenPrefetch.waves.test.ts`.

| Scenario | Before | After |
|---|---|---|
| Cost Summary landing: wave of the first Cost read | 2 | 0 (2 earlier) |
| Cost Summary landing: wave of the per-contract sums | 3 | 1 |
| Cost `?category=0`: wave of the cost rows | 4 | 2 |
| Production / Revenues first screen read | 1 | 0 (1 earlier) |
| Requests | identical (same reads, earlier), asserted | |

Stage 2 said the Summary's first figures arrive at wave 4 today; the recorder shows wave 3 (the contracts-totals read does not need the chart). The two-wave saving is as predicted.

## 4. Read lane (peak in-flight reads)

Command: `npx vitest run src/data/readChunks.test.ts src/data/costReadPath.waves.test.ts`.

| Case | Before | After |
|---|---|---|
| One call of 40 chunks (1,600 ids), peak in flight | 40 | 16 |
| 100 chunks, peak | 100 | 16 |
| CAPEX tab, 640 contracts (16 payment chunks) | 3 waves, 20 requests | 3 waves, 20 requests (unchanged) |
| CAPEX tab, 680 contracts (17 chunks) | 3 waves, 21 requests, 17 in flight | **4 waves**, 21 requests, 16 in flight |
| Reference list, return visit after 6 min (30 min stale) | read again | served from cache, 0 reads |
| Admin CAPEX tree, tab return after 30 s | one has-contracts read per visible sub-account | 0 |

The 680-contract row is the price of the lane: above 16 chunks one request queues, adding a wave. At today's expected volumes ("a few hundred contracts per category") it does not bind.

## 5. Check List bench (T-A08, `CHKBENCH=1 npx vitest run src/features/pm/checklist/checklistVisit.bench.test.tsx --maxWorkers=1`, LAT 120 ms per hop, logical rounds)

| Scenario | Before (4-request probe) rounds / requests | After (1-request probe) |
|---|---|---|
| S2 first visit, 10 templates, OFF | 11 / 29 | 11 / 26 |
| S3 complete a task, OFF | 4 / 11 | 4 / 8 |
| **S4 Move to next cluster, shipped (ON)** | **11 / 37** | **11 / 34** |
| S4 Move, OFF | 16 / 43 | 16 / 37 |
| S7a Request Approval, formal (new) | n/a | 12 / 18 |
| S7b Request Approval, Only Notifications (new) | n/a | 13 / 19 |
| S8 Cancel Approval Request (new) | n/a | 9 / 13 |

This corrects the baseline, it does not change production behaviour: the harness probed the session project as the Cost app's 4-request load where a PM route costs 1. The shipped Move is 34 requests, rounds unchanged at 11.

## 6. Small items

| Item | Before | After | Evidence |
|---|---|---|---|
| Gates failed load, 10 re-renders | 10 trace entries | 1 | UT-ADGATE-950 |
| Check List Settings cold entry | locks and clusters wait for the tab list | start with it (one hop less, derived) | UT-ADCHK-960 |
| CAPEX comment dots after add/delete contract | vanish while the next key loads | kept | UT-CAPEXCOM-020..023 |

## 7. What is not measured

Seconds in a browser or on DEV; the splash; the effect of prefetch on real navigation; memory; the combined per-screen bundle sizes; the intent prefetch hit rate (data intent is OFF). See doc 28.
