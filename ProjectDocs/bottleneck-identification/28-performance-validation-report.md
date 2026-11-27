# 28 — Performance validation report

> Stage 3, 27 Nov 2026. This report says what the evidence supports and what it does not. The brief's rule: "do not claim improvement without comparable evidence". Comparable evidence here means before and after measured the same way (doc 26). **There is no browser, DEV or Dataverse measurement behind any claim below.**

## 1. Claims and their evidence

| Claim | Evidence | Strength |
|---|---|---|
| First visit of Milestones, General Data, Revenues, Finance, Planning, Grid Operator and the landing page downloads 16 to 61 KiB gzip less | `cmp.mjs` base vs worktree builds (doc 26 section 1) | **Measured (bytes)**. Cold cache only; combined-tree per-screen figures not re-measured |
| The start-up closure did **not** shrink: +1.9 KiB gzip | `bundle:report` on the final build | **Measured; fails the criterion** |
| A Cost deep link starts its first reads 2 waves earlier; Production/Revenues 1 wave | `costScreenPrefetch.waves.test.ts` | **Measured (rounds)** on the real data modules; seconds not measured |
| Same reads, same requests, just earlier | Asserted by `toHaveLength` in the wave tests | Measured |
| Reads of 17+ chunks queue at 16; waves unchanged up to 16 chunks | `readChunks.test.ts`, `costReadPath.waves.test.ts` | Measured (counts) |
| Reference lists are not re-read within their stale time | `UT-QPOL-005/006` | Measured (counts) |
| Check List shipped Move is 34 requests, not 37 | bench before/after | Measured (counts), a **baseline correction**, not an improvement |
| Cost entry is faster by about 0.4 to 1.0 s | Stage 2 derivation from D144 unit costs | **Estimated only**; D144 and D51 disagree 4 to 10x on one read |
| The splash makes first paint feel faster | none | **Unverified**: never viewed in a browser |
| Fewer background requests on tab return (admin CAPEX tree) | `UT-ADCAPEX-FOCUS-001` | Measured (counts) |

## 2. Where there is no gain, or a cost

- **Start-up closure +0.6 %** (above).
- **Read lane adds a wave at 17+ chunks** (680 contracts: 3 waves to 4). Not expected to bind at normal volumes.
- **Hover chunk prefetch** downloads a screen's code the user may not open (31 to 75 KiB gzip for admin screens). Data prefetch on hover is OFF; its hit rate is unknown.
- **`gcTime = staleTime` for reference lists** keeps them in memory 30 min instead of 5 (small fixed-key lists).
- **No write path changed**, so no save got faster in this batch. The seconds-level opportunities from the analysis (Production first save 22 to 5 rounds, Check List row action 3 to 2) are still ahead, behind DEV checks and decisions.

## 3. Acceptance criteria (doc 22) against results

| Criterion | Result |
|---|---|
| `verify` steps green | Met (doc 27) |
| Cost waves 2 fewer; Production/Revenues 1 fewer | Met |
| Peak in-flight reads at most 16 | Met |
| Landing about -16 KiB, Planning/Grid/Revenues about -20, Milestones 128 to 68, General Data 118 to 77 | Met (bundle-structure alone) |
| Start-up closure not above 302 KiB gz | **Not met (303.9)** |
| `importGraph` guard fails on a new edge | Met (mutation-proven) |
| Browser metrics (INP-style 200 ms / 100 ms thresholds, 20 % and 10 ms rule) | **Not applicable yet**: no browser campaign; the tasks that depend on it (T-D02, D03, D05, D06) were not started |
| Before/after in a real environment | **Not done** |

## 4. What would turn this into a performance result

1. A DEV measurement of a Cost deep link and of a Production/Revenues deep link before and after (the `[VSB]` timing lines and the browser Network timeline), to convert waves to seconds (probe P-0).
2. A browser capture of first paint with the splash.
3. A repeat-visit and cold-visit HAR of the built app (settles BND-11 and BND-16).
4. The Wave 0 campaign (T-D00) for the measure-first rendering items.
5. Application Insights data (D161) for a real baseline by screen.
