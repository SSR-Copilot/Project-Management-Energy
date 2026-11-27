# 17 — Systemic bottleneck analysis

> Stage 2, 26 Nov 2026. Stage 1 doc 12 named nine candidate roots. After the Stage 2 re-verification, six are real systemic causes, one is a label, and two were narrowed. This is the set to address through shared infrastructure rather than screen by screen. Sources: `_stage2/A…E-rca-and-strategy.md`; findings are in doc 14, verdicts in doc 16.

## 1. The systemic causes, validated

| # | Systemic cause | Evidence (current source) | Findings it explains | Why shared infrastructure, not per-screen |
|---|---|---|---|---|
| S1 | **A screen's own reads start only after it renders** | `bootPrefetch.ts:45-57` starts only the session project for a Cost deep link; the Cost route gate holds the whole Cost subtree until `loadProject` (row, then country/state/area). `prefetchPmScreenReads` is used only from `bootPrefetch.ts`, so in-app rail navigation has none (`SPA-09`, confirmed by grep). The Generators hover/focus delegation (`generatorsWarmup.ts:40-86`) already shows the pattern | SCC-01, SPB-02, SPA-09, BND-17, SCC-15 (and the boot-chain items) | Every screen needs the same registry, the same bounds and the same telemetry; five per-screen prefetchers would diverge |
| S2 | **One global freshness policy** | `Providers.tsx:24-32`: 30 s `staleTime`, refetch on `visibilitychange` for stale active queries (in the background), default 5 min `gcTime`; no `gcTime` set in `src` | BND-02 group, NET-08, SAD-06, SCC-14 (RND-10 yields) | A per-screen override cannot fix a policy; but the *policy itself* is a product decision (DEC-F / DEC-3), so only the reference-data tier is in scope without the owner |
| S3 | **Write engine: guarded, per-row, bulk OFF** | Guarded update = existence GET + PATCH (`client.ts:469-495`, root of SAD-07/08/09); Generators bulk, Production allocations and Finance bulk switches are OFF; width 8 where 16 is proven for Generators | SPB-01, NET-13, SCC-09, SCC-06, SAD-07, SAD-08, SPB-07, SPB-08 | One width/bulk policy with one DEV check is safer than five tuned loops |
| S4 | **Saves wait for a reload** | `usePlanWrite.ts:216-221` awaits the refresh; Land Lease (`useCostBook.ts`), Revenues, Finance and Check List do; Production and Generators already reload in the background | SPA-01, SPB-09, SCC-07 | One `refresh` option in one hook serves all four screens (and the canvas does not re-read after a Check List row action) |
| S5 | **Read fan-out without a lane, and no abort in the SDK** | 17 read sites are `Promise.all(chunk(ids).map(fetchAll))` of width ceil(N/40); `requestGate` is referenced only from `requestPolicy.ts` (reads cannot enter it); `fetchAll` bypasses `sendWithPolicy`, so deadlines would not cover reads; the SDK has no abort | NET-04 group, NET-05, NET-02, NET-16 | A read lane belongs in the data layer once. **Its measured size is small** (binds above about 16 chunks; the repo says a few hundred contracts per category) |
| S6 | **Module coupling: `data/` imports `features/`** | 46 value+type imports from `data/**` to `features/**` in 28 files; about 10 are heavy cross-screen edges (`data/revenues -> landLease`; `costBook -> landLease + capex-costs/rules`; `projectStates -> generalData`) | BND-18 (root), BND-03/04/06/07, SCC-19, BND-08 | MEASURED in scratch rebuilds: -16 to -22 KiB gz per affected first screen. The fix is import structure, which is behaviour-neutral |

## 2. What is NOT systemic (corrections to Stage 1's doc 12)

- **R9 "URL-driven and whole-list UI state" is a label, not a root.** The Overview filter (RND-01, now P3), the municipality combobox (RND-02/14) and the whole-screen re-renders are independent and mostly unmeasured.
- **Flows in blocking jobs (R8)** is real but only partly addressable: the flow duration is not ours to change and is unmeasured. App-side, one round and a timeout message are removable; the rest needs the owner (T-08 wording, non-modal UX).
- **The calculation and memory layers are not systemic bottlenecks.** Calculations measured at 0.5-25 ms; no leak; MEM-02 is a deliberate D51 safety net.

## 3. New systemic insights from Stage 2 (not in Stage 1)

1. **Prefetch is worthless for keys that re-read on every mount** (`refetchOnMount: "always"` on Finance, and the Contracts, OPEX and admin-tree keys). S1's gain is therefore bounded to screens whose keys honour `staleTime`; for Finance only the reference reads are prefetched.
2. **Prefetch is only valid inside `staleTime`.** A user who takes longer than 30 s to arrive pays again. S1 and S2 are coupled: the reference tier (gc = stale) helps S1; the global 30 s stays the owner's call.
3. **Query reads bypass the request policy**, so the D165 retry, deadline and global-gate machinery protects writes only. Anything planned around "the gate" or "deadlines" must say whether it covers reads.
4. **The latency scale is unknown.** D144 and D51 disagree 4-10x on the cost of one read. Until probe P-0 runs, the honest unit for every benefit is the wave or round, and seconds are only quoted where a recorded live DEV number exists (SCC-12: 1,916 ms; Generators add: 3.0-3.7 s; Add Cost bulk: 9.5 s to 1.6-1.9 s).
5. **Several earlier "optimisation" remedies turned out wrong on measurement**: lazy `costRepository` (+1.5 to +6 KiB gz), a vendor chunk for churn (80 to 78 files), env-var boot prefetch (no-op), a short `gcTime` on the cost book (fights D51).
6. **A bench can mislead**: the Check List harness probes the session project in 4 requests where the real route costs 1, so the recorded Move baseline was 37 requests instead of about 34.

## 4. Where a systemic fix beats the sum of its parts

| Shared fix | Findings it resolves or reduces | Tasks |
|---|---|---|
| One prefetch registry + intent prefetch | SCC-01, SPB-02, SPA-09, BND-17, BND-13 group, SCC-15 | T-C01, T-C02, T-C03, T-A04 |
| One `usePlanWrite` per-job refresh | SPA-01, SPB-09, SCC-07 (and the overlay length of SPA-02/03) | T-A01, T-B08, T-B09 |
| Chunked existence guard | SAD-07, SAD-08, SAD-09, the zero phase of NET-14 | T-B06 |
| Pure-helper import structure + guard | BND-03, BND-04, BND-06, BND-07, BND-18 (and part of SCC-19) | T-E01, T-E02, T-E03 |
| Reference-data cache tier | NET-08, SAD-06, SCC-14 | T-C04 |
| One measured browser campaign | 28 measure-first findings | T-D00 |
