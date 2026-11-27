# 29 — Memory and resource validation

> Stage 3, 27 Nov 2026. **No heap, memory-growth or browser measurement was taken in Stage 3.** This document records what the changes could do to memory and resources, and what tests pin. The Stage 1 audit (doc 08) found no leak; nothing here was meant to change that, and nothing was measured to prove it still holds.

## 1. Changes with a resource effect

| Change | Effect | Bound | Evidence |
|---|---|---|---|
| `REFERENCE` preset (`gcTime = staleTime`, 30 min) on 7 local `REFERENCE_STALE` constants, `COUNTRIES_STALE_MS`, and the Revenues and Finance reference factories | Small fixed-key reference lists stay in the query cache 30 min after their screen closes instead of 5 | Fixed keys, small lists (countries, banks, KfW tranches, categories, currencies, project states, assumptions). Typed-search, per-person and catalogue queries were deliberately left out (RND-10 deferred) | `UT-QPOL-001..009` |
| Reference tier and the D51 Add Cost design | The Add Cost sheet and the cost book keep the default `gcTime` (D165 rule C6) | `UT-QPOL-004` pins that no Cost module uses the preset | `UT-ACSHEET-REF-001/002` |
| Read lane | Caps concurrent reads at 16, so fewer simultaneous response bodies in memory for a very large project | Module-level gate of 16 slots | `readChunks.test.ts` (peak 16 for 40 and 100 chunks) |
| Boot prefetch (Cost, Production, Revenues, Finance reference) | Fills the query cache earlier with data the screen would have read anyway (same keys); no extra copies | Same data, same keys | key-equality tests |
| Intent chunk prefetch | A screen's JS may be downloaded and held although the screen is never opened | 31 to 75 KiB gzip for an admin chunk; browser cache | `UT-INTENT-*` |
| Intent DATA prefetch | OFF. If enabled: at most 4 screens in flight, one start per project and screen per 30 s | Bounded | `UT-INTENT-*` |
| `holdBeforeUnload` in the CAPEX Accounts clean-up | Reuses the shared reference-counted hook; released on success and on failure | Counted | `UT-ADCAPEX-960..962` |
| `keepPreviousData` on the CAPEX comments query (opt-in) | Holds the previous threads while the next key loads | One extra threads array, CAPEX grid only | `UT-CAPEXCOM-020..023` |
| Hover/focus document listeners (`useRailIntent` + on-demand `intentPrefetch`) | Document-level listeners attached after first render | Attached once, removed on unmount (tested) | `UT-INTENT-*` |

## 2. Known retention that this batch does not change

- No `gcTime` for the cost book, the Add Cost sheet or typed searches: heavy per-project data stays 5 min after its last observer (MEM-01, 4.7 MB typical, 36.7 MB stress in jsdom).
- The Add Cost screen still holds six or more copies of the sheet (MEM-02: a deliberate D51 safety net).
- MEM-03 (the drawn grid window) is unmeasured in a real browser.

## 3. Not measured

Heap before/after; memory growth across repeated navigation with the new prefetch and the reference tier; the intent-prefetch listener cost; the splash. The Stage 2 plan's memory check is part of the Wave 0 browser campaign (BM-05, BM-13).
