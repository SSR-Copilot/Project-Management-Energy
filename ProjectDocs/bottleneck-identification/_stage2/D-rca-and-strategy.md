# Stage 2, agent D: React rendering, state and the CPU/memory data path (T10, T11)

> 26 Nov 2026. Base `dde9e92`, branch `feature/bottleneck-identification-optimization`. Planning only: nothing under `ProjectCosts-CodeApp/` was edited. One throwaway script was run (`_bench/S2D/muni-filter.bench.mjs`, output `muni-filter.bench.out.txt`). Evidence labels as in the Stage 1 brief (CONFIRMED / HIGH / SUSPECTED; MEASURED / DERIVED / ESTIMATED).

## 0. The answer in five lines

1. Of 26 findings, **one is worth fixing now without further input** (RND-09, a telemetry-integrity defect, not a speed one), **one needs a product decision** (RND-02, the municipality search, DEC-6), **eleven are only worth touching if a browser measurement crosses a stated threshold** (MEASURE-FIRST), and **thirteen should be left alone or deferred** (9 ACCEPT, one of them the SCC-21 duplicate of MEM-02; 4 DEFER with a trigger).
2. Almost all Stage 1 evidence for T10/T11 is jsdom with React's dev build, or Node on synthetic data. D140 (`02-OPEN-DECISIONS.md` ~8028) already proved that jsdom misses layout and paint: the real browser keystroke was 630 ms where the jsdom figures had suggested far less. The two errors (dev build too slow, no layout too fast) point in opposite directions, so a jsdom millisecond figure cannot be converted into a browser one. Section 6 is the protocol that replaces the conversion.
3. Prior programmes (D162 `06_Frontend_Optimization_Strategy.md` items 44, 45, 48, 50) deferred CMP-01/02, SCC-20, RND-14 and SAD-17 "until a profile shows a cost". No profile was ever taken (`09_Performance_Benchmark_Report.md` section 4: "Not measured here"; the owner's DEV routine in `07` section 4 was never recorded). Stage 3 should therefore start with one measurement campaign (task T-D00), not with code.
4. Doc 12's root **R9 ("URL-driven and whole-list UI state") is a label, not a root**: its members (RND-01, RND-02, RND-14, RND-05, SCC-20, SPB-17, SAD-17) have seven different mechanisms and no shared fix.
5. Two corrections to Stage 1 on RND-02 change the DEC-6 conversation (section 3.1): the canvas Germany box **does** carry `DelayOutput: =true`, and the Area's full list is **already fetched when the screen opens**, so a client-side filter costs no request at all.

## 1. Scope: findings owned

T10 (15): RND-01, RND-02, RND-14, CMP-02, RND-04, RND-05, RND-06, RND-07, RND-09, RND-11, RND-12, RND-13, SAD-17, SCC-20, SPB-17.
T11 (10): CMP-01, MEM-03, CMP-03, CMP-05, CMP-06, CMP-07, CMP-09, MEM-02, MEM-04, SCC-21.
Plus RND-10 (T2, requested by name). There are no `SPA-` rows in T10/T11. Merged duplicates handled inside their canonical rows: SPA-12 and BND-15 (RND-01), CMP-08 and SPA-15 (RND-02), SCC-03 (CMP-01), RND-03 (CMP-03), SAD-12 (RND-04), MEM-01 (RND-10).

Source re-opened for this document (current tree): `features/pm/general-data/{hooks.ts,Screen.tsx}`, `data/generalData.ts`, `features/shared/useDebouncedValue.ts`, `features/pm/project-main/{hooks.ts,Screen.tsx}`, `app/{SessionContext.tsx,Providers.tsx,queryStructuralSharing.ts}`, `App.tsx`, `components/{AppShell,QueryStates,RowActions,DisabledReason}.tsx`, `platform/{telemetry,userMessage,renderProbe,e2eHook}.ts`, `features/cost/capex-costs/{PcfGrid.tsx,Screen.tsx,CommentsPanel.tsx,pcf/services/DatasetParser.js,pcf/ui/GridRenderer.js}`, `features/cost/add-costs-from-table/{Screen.tsx,spreadsheet/SpreadSheet.tsx,spreadsheet/rowWindow.ts}`, `features/cost/costing/{savedSheetPatch.ts,useCostBook.ts}`, `data/client.ts`, `styles/canvas.css`, `components/fieldSkin.ts`; canvas `Project General Data Screen.pa.yaml` (Germany and France combobox); D140 and OPT-19 entries in `02-OPEN-DECISIONS.md`; D162 `02`, `04`, `06`, `07`, `08`, `09`; D165 `20 - Caching Architecture.md`. Not read: the Fluent and react-spreadsheet internals beyond what D140 already records; `LeftNav`; the Griffel runtime.

## 2. RCA verdict table

Classification vocabulary: architecture / execution order / data volume / network latency / implementation.

| ID | Verdict | Classification | Isolated / cross-screen | Note |
|---|---|---|---|---|
| RND-02 | ACTUAL | implementation (request per keystroke) + data volume (up to 5,000 rows each) | Isolated: General Data, DE and FR projects | Mechanism re-verified at `general-data/hooks.ts:182-195`: raw `search` in the key, no debounce. Reframed: canvas Germany box has `DelayOutput: =true` (YAML 3634); the code app dropped it on purpose (`Screen.tsx:429-430`, user 3 Nov 2026) |
| RND-14 | UNRESOLVED | implementation (all Options mounted) + data volume | Isolated: General Data, German Areas | Cost is a jsdom-dev number (0.17 ms per Option); no layout in jsdom. Needs BM-01 |
| RND-01 | OVERSTATED (P2 to P3) | implementation | Isolated to Overview (shell part touches every URL change, but only the Overview changes its URL per keystroke) | Session context value is memoised on primitives (`SessionContext.tsx:~146-158`), so only `SessionProvider`, `App`, `AppShell`, `AppHeader` and the routes re-render. Measured shell cost is 0.67 ms per render in jsdom dev; production is lower. The URL-driven input itself is pinned by UT-OVUI-047 / UT-OVFIX-060 |
| CMP-01 | ACTUAL | implementation (redundant recomputation) | Isolated: CAPEX grid | Same dataset object re-parsed on every fold, year-independent filter, payer and options change (`GridRenderer.js:165`; `PcfGrid.tsx` keeps `currentDataset` stable). Magnitude is Node-synthetic (6.8 to 112 ms) |
| CMP-02 | UNRESOLVED | implementation (full tbody rebuild + 2 forced layouts) | Isolated: CAPEX grid | DERIVED only. Cannot be ranked against CMP-01 without a trace |
| CMP-03 | NOT-A-BOTTLENECK | implementation (deliberate trade-off) | Cross-cutting but cheap | 20 to 35 ms on a 60k to 100k object refetch, inside a refetch that costs seconds; it is what keeps unchanged refetches from re-rendering and protects CA-31. Only about 10 % over stock TanStack |
| CMP-05 | OVERSTATED | implementation | Isolated: Add Cost save success path | 13 to 60 ms once per Save in a path that is 1.6 to 1.9 s on DEV (D51 record). Free to fix, not worth a task |
| CMP-06 | ACTUAL | implementation (lazy first-edit pass) | Isolated: Add Cost sheet | The only T11 item with a real-browser number: D140 recorded the first key after opening at 141-155 ms against 21-28 ms afterwards (Edge, production build) |
| CMP-07 | NOT-A-BOTTLENECK | data volume (extreme sheets only) | Isolated | 90 ms at 15,000 rows; typical sheet is 210 rows x 10 years. The round trip it contains is the D51 safety net |
| CMP-09 | NOT-A-BOTTLENECK | implementation | Cross-cutting, immeasurable | 1.85 us against 0.69 us held; a 1,000-cell screen spends 2-6 ms |
| MEM-02 | OVERSTATED | data volume | Isolated | 8.2 MB typical; the extra copy exists for the D51 identity safety net, which must stay |
| SCC-21 | SYMPTOM of MEM-02 | data volume | Isolated | Same six representations, same screen, no heap measured. Close with MEM-02 |
| MEM-03 | UNRESOLVED | implementation (per-cell subscriptions) | Isolated | The 207-214 MB is jsdom drawing a 56 x 126 fallback window with no layout. D140 records 748 cells in the real page. Real heap unknown |
| MEM-04 | NOT-A-BOTTLENECK | implementation | Isolated | Token strings per distinct filter/sort/page; well under 1 MB; `invalidatePageTokens` already clears per table on writes (`client.ts:299-305`) |
| RND-04 | UNRESOLVED | implementation (a Tooltip per row control) | Cross-cutting mechanism, hot on 3 screens | 0.34 ms per Tooltip in jsdom dev; the 1,000-1,500 instance count is a D162 estimate. Real mount share unknown |
| RND-05 | UNRESOLVED | implementation | Isolated: Overview first paint | Fluent Table 2.5x a plain table in jsdom dev. The page also carries about 540 kB of payload per 200 rows (D119), which dominates |
| RND-06 | OVERSTATED | implementation | Cross-cutting, immeasurable | 0.76 ms per parent re-render with five closed panels, jsdom dev |
| RND-07 | UNRESOLVED | initialisation | Cross-cutting, first use per session | 116 ms first against 22 ms later in jsdom includes JIT warm-up. Griffel runtime style generation (no AOT) is plausible but unseparated |
| RND-09 | ACTUAL | implementation (side effect in render) | Isolated: Admin Project Gates (the only one of 8 `QueryStates` sites whose `fatal.text` traces) | CONFIRMED by bench. Telemetry integrity, not speed |
| RND-10 | OVERSTATED | data volume + policy | Cross-cutting | A tab normally holds one project (Cost screens cannot switch project in-tab; `Providers.tsx` comment). D165 rule C6 says `gcTime` stays at its default. Collides with agent C |
| RND-11 | OVERSTATED | implementation | Isolated | One extra render of a 933-line panel per open, after commit; seeded-once guard (`seededFor`) protects edits |
| RND-12 | NOT-A-BOTTLENECK | implementation (latent) | Cross-cutting, latent | No current consumer is affected; `useStableCallback` already compensates |
| RND-13 | UNRESOLVED | implementation (CSS) | Cross-cutting mechanism | Selectors are scoped to panel roots (`canvas.css` 653-729), about 20 `:has()` rules; a visual-parity risk to change |
| SAD-17 | UNRESOLVED | implementation | Isolated: Admin Cost | D162 FE-AD-09 deferred it with the trigger "more than 16 ms in a profile" |
| SCC-20 | UNRESOLVED | implementation | Isolated: CAPEX panel | D162 FE-C1-07 trigger "more than about 8 ms per keystroke". `categoryAccounts` and `PcfGrid` props are guarded; the rest of the 1,408-line body re-renders |
| SPB-17 | UNRESOLVED | implementation | Isolated: Revenues, Production | Calculation behind a keystroke is under 1 ms (SPB bench); render cost is dev-build jsdom only |

Roots. The T10/T11 findings share no root with each other except "no browser profile was ever taken". They touch R2 only through RND-10 (policy, not mechanism).

## 3. Per-finding specifications

### 3.1 RND-02 (with RND-14 and merged CMP-08 / SPA-15): municipality combobox — ACTUAL, FIX-AFTER-DECISION (DEC-6)

(1) Current implementation.
- `useMunicipalitySearch` (`features/pm/general-data/hooks.ts:182-195`): the query key carries the raw `search` (`qk.germanMunicipalities(areaName, search.trim())`, `data/keys.ts:109`), no `useDebouncedValue`; `staleTime: REFERENCE_STALE` (30 min), default `gcTime`.
- The key for the empty term is enabled as soon as the screen shows a German project with an Area (`germany = mode === "germany" && Boolean(areaName)`, `enabled: germany || france`). So the Area's whole list (up to 5,000 rows, `MUNICIPALITY_SEARCH_TOP`, `data/generalData.ts:281`) is read **when General Data opens**, whether or not the box is touched. France waits for three letters (`municipalitySearchIsSuppressed`).
- Every keystroke changes `muniSearch` (`Screen.tsx:387`, `onChange` 696-701). A new key has no data, so `out()` returns `NONE`, the options list empties (`hiddenListbox`, `Screen.tsx:705`, class at 186) and then remounts up to 2,000-5,000 `Option`s when the result arrives (`muniOptions` memo, 630-639).
- The vendored SDK has no abort (NET-03), so each superseded request still completes.

(2) Root cause (validated). Two causes, not one. (a) Network and server side: one read per keystroke, because the key is the raw text. (b) Render side: the remount of the whole list per result, because Fluent's Combobox mounts every `Option` it is given (no windowing; FE-P1-02b). A debounce fixes (a) only. Even with a perfect debounce the settled term still mounts its full list, so RND-14 is a separate residual that only measurement can size.

Two corrections to Stage 1, both verified in source:
- The canvas Germany box has `DelayOutput: =true` (`Project General Data Screen.pa.yaml:3634`); the France box has none. The code app removed it for Germany on the user's instruction (`Screen.tsx:429-430`, "DIVERGENCE (user, 3 Nov 2026)", recorded in `02-OPEN-DECISIONS.md` ~6606). So re-adding a Germany debounce would **restore** canvas parity, and reverse a product-owner choice. That is the DEC-6 trade-off in its true form.
- The canvas `Items` is `Search(Filter(colAssumptionsGermanyTaxSQL, …), Lower(Self.SearchText), municipality, uid)` over a collection loaded once: it filters on the client. The code app's per-keystroke server search is the departure from the canvas, and it is not needed for Germany, because the Area's list is already in the cache from screen open.

(3) Proposed implementation: options, not a decision. All keep the displayed list for a settled term identical.

| Option | Change | Requests per typed word (k letters, DERIVED) | Parity effect | Residual |
|---|---|---|---|---|
| O0 | Leave as is; close DEC-6 as "accepted" | k | none (current divergence stands) | all |
| O1 | Debounce the Germany term with the existing `useDebouncedValue` (value: canvas `DelayOutput` is about half a second, to be confirmed against Microsoft's documentation; the app's Entra pattern is 250 ms, `ENTRA_SEARCH_DEBOUNCE_MS`) | about 1 (all keystrokes closer together than the delay collapse) | Restores canvas `DelayOutput` for Germany; reverses the 3 Nov choice | list mount per settled term; list empties between key change and result unless O2 |
| O2 | O1 on both boxes, plus `placeholderData` that keeps the previous list **only while the Area is unchanged** | about 1 | France gains a debounce the canvas lacks (timing only) | mount per settled term |
| O3 | Germany only: filter the Area's already-loaded empty-term list on the client (a pure `filterMunicipalities(rows, term)` in `general-data/rules.ts`, matching the server's `contains` on municipality and uid, case-insensitive); France keeps the server search with O1/O2. Requires the empty-term list to be complete | 0 after screen open | Closest to canvas `Search()` over a collection; no divergence in the settled list if equivalence is proven | shrinks Options after the first letter; the unfiltered first open still mounts the Area |
| O4 | `useDeferredValue(municipalities.data)` for `muniOptions`: the input stays urgent, the list rebuild is interruptible | unchanged (k) | none | work is moved, not removed |
| O5 | Windowed or capped list (RND-14): a custom virtualised listbox, or render the first N and say how to narrow | n/a | O5 windowed keeps all items but risks keyboard active-descendant and screen-reader semantics (D162 FE-P1-02b); capped changes what the canvas shows (DECISION) | fixes the mount cost |

Client-side filtering cost, MEASURED here (`_bench/S2D/muni-filter.bench.mjs`, Node, synthetic rows, median of 200): 2,000 rows 0.05-0.09 ms per term; 5,000 rows 0.12-0.23 ms. So O3's per-keystroke CPU is negligible next to any Option mount.

O3 gate: the OPT-19 / PB-02 / D165 T-33 question must be answered first. `fetchPage` sends `maxPageSize: 500` and `$top: 5000` together and never follows a skip token (`data/client.ts` `fetchPage`); whether a Bavarian Area (about 2,000 rows) comes back whole is "not evidenced in the repo" (`02-OPEN-DECISIONS.md` ~8859). If the empty-term list is truncated, O3 would hide municipalities beyond the cut that a narrower server search currently reaches. Check on DEV: search Bayern with an empty term and count the options (about 2,000 = whole; 500 = truncated).

(4) Expected technical benefit (DERIVED): O1/O2: requests per typed word from k to about 1; O3: from k to 0 (after the one read at screen open, which exists today). Rows read per typed word: from k times up to 5,000 to at most 5,000. Payload per row is not recorded in the repo (`select` is 5 columns plus annotations); the HAR in BM-01 gives it.

(5) User-visible benefit: UNKNOWN until BM-01. What can be said: fewer list flashes while typing (the list empties on every key today) and fewer requests against Dataverse. The 326-407 ms (2,000 Options) and 762-859 ms (5,000) are jsdom-dev figures and are not claimed as browser time.

(6) Dependencies: DEC-6 (owner: product owner who made the 3 Nov change); D165 T-33 / PB-02 truncation probe (gate for O3); RND-14 (O5); NET-03 (no abort, so a debounce is the only way to avoid the extra server work); agent on SPA-15 (merged here).

(7) Functional risks: O1/O2: a quick Enter or blur inside the delay acts on a stale list (mitigated: `pickMunicipality` reads `municipalities.data.find`, so the picked uid must be in the list shown; check the in-flight window). O3: equivalence with `contains` for special characters (`%`, `_`, `'`, German umlauts under the server collation) and with the `Trim(state) === areaName` post-filter; both need a generated-term equivalence test. Any option: the `…CanvasParity` twin and a DIVERGENCE/decision entry (CONVENTIONS rule 8).

(8) Performance risks: O2's kept-previous list shows briefly stale options; O3 holds the full Area in memory (already the case today for the empty term); O5 adds scroll-handler cost.

(9) Complexity: O1 Low (about 10 lines + constant); O2 Low-Medium; O3 Medium (a pure function, a hook change, equivalence tests, about 150 lines); O4 Low; O5 High.

(10) Tests: new `features/pm/general-data/hooks.muniSearch.test.tsx` in the style of `hooks.entraSearch.test.tsx` (GD-024): `UT-GDATA-MUNI-001` (typing 5 letters inside the delay issues 1 read), `-002` (blank term is not delayed), `-003` (France below 3 letters stays suppressed), `-004` (kept list does not cross Areas). For O3: `UT-GDATA-MUNI-101..` in `rules.test.ts` (filter equals a fake server `contains` over 400 generated terms and the umlaut set). Extend `Screen.perf.test.tsx` with `probeRender("GeneralDataMuniOptions")` counts per settled term (existing probe at `Screen.tsx:633`). `canvasIdentities` and `controlLabels` gates unchanged (no control added).

(11) Acceptance criteria: BM-01 (section 6). Keep a change only if, on a Bavarian project at CPU 4x, (a) requests per typed 6-letter word fall from 6 to at most 1 (O1/O2) or 0 (O3), (b) median keystroke-to-paint of the typed word does not regress and the p90 does not exceed 100 ms, (c) the settled list equals the pre-change list for 20 recorded terms (count and first/last item), (d) no truncation regression (PB-02 probe recorded).

(12) Rollback: a `MUNICIPALITY_SEARCH` switch object in the existing `features/pm/general-data/gdPerfFlags.ts` pattern (`GD_CANCEL_REUSES_CACHE`, default and test seam), one field per option; OFF restores today's code path (kept per CONVENTIONS rule 15).

RND-14 (compact, MEASURE-FIRST): Option windowing is only justified if BM-01 shows the click that opens a 2,000-Option list taking over 200 ms at 4x (INP "needs improvement" line). If it does, O5 is High complexity and Medium risk (keyboard `aria-activedescendant`, Tosca ids `general-data-municipality-suggestion-<uid>`, rule 16). A cheaper first step is O3 plus an "at least one letter" gate, which is a canvas divergence (DECISION). If it does not, close RND-14 as ACCEPT.

### 3.2 CMP-01 and CMP-02 (one task, T-D02): CAPEX grid parse and repaint — MEASURE-FIRST

(1) Current implementation. `PcfGrid.tsx` builds `costDataset` once per `rows` (memo) and keeps it in `currentDataset`; every repaint calls `GridRenderer.render(context)` (`GridRenderer.js:150`), which runs `DatasetParser.parseDatasetToTree(dataset)` (`:165`; the parser probes up to 20 alias names per field with `firstAvailableValue`, `DatasetParser.js:246-327`), applies the filters (`:179-187`), clears `tbody` and rebuilds every visible row (`:195-257`), calls `renderColGroup` twice (`:196`, then in `fitColumnsToScrollViewport` `:276-283`, which reads `clientWidth`) and then `syncGrandTotalSpacer` (`:309-337`, reads `clientHeight` and every row's `offsetHeight`). A fold click goes `toggleCollapse` (`:1421`) to a `PCF_RE_RENDER` event to `render()` with the **same dataset object**. The expanded set starts empty.

(2) Root cause (validated). CMP-01: the tree is a pure function of `(dataset, nothing else)` and the dataset object does not change on a fold, a payer filter, show-empty or show-planned change, yet it is rebuilt each time. It is redundant work, not an inherent cost. CMP-02: a full DOM rebuild plus two synchronous layouts (read `clientWidth` after appending rows, write col widths, then read `clientHeight`) per repaint. Whether the parse or the layout/rebuild dominates in the browser is not known: the only measurement of the parse is Node on synthetic rows (6.8 ms at 96 records, 32.1 at 570, 112.1 at 1,900; 526 accessor calls per contract record), and CMP-02 was never measured.

(3) Proposed implementation, in order. Step 0 is BM-03 (parse versus layout versus paint in one trace). If parse self-time is over 15 ms at 4x on the nominated category: cache the parse. Smallest safe shape: in `GridRenderer.render`, `if (dataset !== this._parsedFor) { this._parsed = DatasetParser.parseDatasetToTree(dataset); this._parsedFor = dataset; }` and copy one level before the filters and `applyStandardContractOptions`. **Trap, verified in source:** `applyStandardContractOptions` mutates subaccount objects in place (`GridRenderer.js:345-353`), `applyCostPaidByFilter` returns the same tree for "Show All" (`:362-370`), and `applyStandardContractOptions` returns early when the options map is empty, so a cached tree would keep stale `standardContractOptions` from an earlier render. So either clone the subaccount objects before applying options (O(subaccounts), not O(records)) or always assign `[]` when the map is empty. Do **not** change the alias probing in the vendored parser (parity with the vendor control; larger blast radius). CMP-02 only if BM-03 shows Layout or the rebuild above 30 ms at 4x: batch the layout reads before the writes (one `renderColGroup` pass using the previous scrollbar state) and reuse row nodes for unchanged rows. The vendored stylesheet stays byte-identical (`styles/pcfCascade.test.ts`).

(4) Expected technical benefit. Removes one `parseDatasetToTree` per fold/filter repaint: 6.8 to 112 ms (MEASURED, Node synthetic; basis `_bench/CMP/datasetparse.bench.out.txt`), which is the only quantity that can be derived. CMP-02: 2 forced layouts per repaint, DERIVED from the read/write order at `:276-337`; time unknown.

(5) User-visible benefit: UNKNOWN; a fold click on a category with a few hundred records should drop by the parse share only. Not claimed in ms.

(6) Dependencies: none on decisions. Same repaint as the SCC agent's CAPEX findings (SCC-03 is merged here); `applyStandardContractOptions` behaviour is pinned by `pcfWriteActions.test.ts` / `pcfGridFormat.test.ts`.

(7) Functional risks: the cache trap above (stale Add-menu options); a dataset mutated in place by a test or a future caller would be served stale (keep identity as the key and document that datasets are immutable; `PcfGrid.tsx:dataset()` builds a fresh one per `rows`).

(8) Performance risks: one retained tree per dataset (a WeakMap or a field; released with the dataset); memory is small next to the book.

(9) Complexity: CMP-01 Low (about 15 lines in `GridRenderer.js`); CMP-02 Medium to High (renderer is a vendored port with D58 divergences).

(10) Tests: extend `PcfGrid.render.test.tsx` (UT-PCFGRID-OPT-001..006 exist): `UT-PCFGRID-OPT-010` (a second render with the same dataset calls the parser once), `-011` (rendered `tbody` HTML identical for 12 combinations of fold, payer, show-empty, show-planned, standard options present/absent/removed), `-012` (the trap: options present, then removed, then Add menu offers none), `-013` (a new dataset object re-parses). Existing `pcfGridFormat.test.ts` and `pcfWriteActions.test.ts` must pass unchanged. For CMP-02 add a layout-read counter test only if BM-03 requires the change.

(11) Acceptance criteria: BM-03 and BM-04. Proceed past the gate only if median fold-click latency (click to next paint) at 4x exceeds 100 ms on a category with at least 500 records, or parse self-time exceeds 15 ms. Keep the change if the median improves by at least 20 % and at least 10 ms, p90 does not regress, and Layout events per click do not increase.

(12) Rollback: a module constant beside `data/capexOptFlags.ts` (`CAPEX_OPT`), `PARSE_CACHE`, default per the BM-03 result; or revert the single unit.

CMP-02 on its own is not a second task: it rides T-D02 and is dropped if the trace shows layout under 30 ms.

### 3.3 CMP-06 (task T-D03): Add Cost first edit — ACTUAL, MEASURE-FIRST

(1) Current implementation. `cleanRows` is a `WeakSet` that is empty after a load (`SpreadSheet.tsx:438`). In `handleChange` (`:490-540`) a row is reused only if the library returned the same array **and** it is in `cleanRows` (`:519`), or if `sanitizeRow` returns the same values on an already dressed row (`:524-527`, which also adds it to `cleanRows`). So the first edit runs `sanitizeRow` and `sameValues` on every row.

(2) Root cause (validated). The work is deferred to the first keystroke instead of being done while the user reads the sheet. Real-browser evidence exists and is the strongest in this theme: D140 table, Edge production build, 210 rows x 10 years, first key after opening 141-155 ms against 21-28 ms median afterwards.

(3) Proposed implementation. After the seeded grid is mounted, mark rows clean in idle chunks (`requestIdleCallback` with a timeout, the pattern of `schedulePanelPreload`): for each row, run `sanitizeRow(row, rowIndex)` and `sameValues`, and add the row to `cleanRows` **only under the exact condition at `:524`** (dressed and unchanged). No state is set, no `onDataChange` fires, nothing in `data` changes, so the identity safeguard around `roundTripped` is untouched. Cancel the idle job on unmount and when `initialData` changes. Check in Stage 3 that `sanitizeRow` does not depend on `rowIndex` in a way that makes marking a row clean unsafe after Add Row / Delete Row (the existing code marks `previous` clean at its index too, so this is the same contract).

(4) Expected technical benefit: moves about 120 ms (141-155 minus 21-28, RECORDED) of main-thread work off the first keystroke into idle slices of at most one chunk each. Sheet sizes: 210-225 rows typical.

(5) User-visible benefit: removes a one-time hitch on the first edit of a sheet. At 4x CPU it would be 4x larger in proportion; BM-06 measures it.

(6) Dependencies: none (D140 spreadsheet window); coordinate with MEM-03 if `OVERSCAN_*` changes.

(7) Functional risks: marking a row clean that the rules would still change (prevented by using the same predicate); an idle job racing a user edit (mark only rows whose array identity is still the seeded one).

(8) Performance risks: idle work competes with the initial hydration and with the user's first scroll; use small chunks (about 20 rows) and `timeout`.

(9) Complexity: Low to Medium (about 40 lines in `SpreadSheet.tsx`).

(10) Tests: `spreadsheet/SpreadSheet.test.tsx` / `adapter.test.ts`: `UT-ADDCOST-130` (after the idle pass the first edit touches only the edited row), `-131` (output of the first edit identical with and without the pre-pass over generated sheets), `-132` (idle job cancelled on unmount and on new `initialData`), `-133` (a row Add Row inserted is still dressed on the next edit, as today; UT-ADDCOST-120..124 unchanged).

(11) Acceptance criteria: BM-06. Do it if the median first-keystroke event duration at 4x is over 200 ms (the INP "needs improvement" line; at 1x it will be about 150 ms from D140) on a 200-row, 10-year sheet. Keep it if the first-key median falls to within 20 % of the second-key median and no long task appears during the idle pass above 50 ms.

(12) Rollback: a one-line switch (a constant in a new or existing UI-perf flag file) or revert the unit.

CMP-05 (ride-along, DEFER): `patchPayments` could `return null` at once when `costs.length === 0 && deleted.size === 0` (same result: it would return `null`, `savedSheetPatch.ts:29-60`). 13 to 60 ms (MEASURED, synthetic) once per Save in a 1.6-1.9 s path. Take it only if T-D03 or another task already touches `savedSheetPatch.ts`; add `UT-SHEETPATCH-004` (same result, no allocation).

### 3.4 RND-09 (task T-D04): trace in render — ACTUAL, FIX

(1) Current implementation. `QueryStates` calls `fatal.text(health.fatalError)` during render (`components/QueryStates.tsx:47`). Only the Admin Project Gates screen passes a text function that traces (`admin-gates-approvals/Screen.tsx:410`, `userErrorText(error, "load the gate approvals")`, which calls `trace` unless `options.trace === false`, `platform/userMessage.ts:122`). The other seven call sites use `loadErrorText`, `userReason`, `errorText` or `reasonOf`, which do not trace (checked in `admin-contract/messages.ts:84`, `admin-default-checklists/messages.ts:71`). `trace` appends to a 200-entry ring (`platform/telemetry.ts:54-71`), prints a `[VSB] ERROR` line and fans out to the Application Insights sink.

(2) Root cause (validated). A side effect inside render; every re-render of the fatal state (a context change, a retry click that re-enters the state, StrictMode in dev) repeats it. `useHasTracedError` already defers its notification to a microtask because of exactly this (D162 FE-SH-08), which confirms the pattern is known and worked around rather than removed.

(3) Proposed implementation. Gates only: pass `{ trace: false }` in the render-time text and trace once from the query error path, or from an effect keyed on `health.fatalError`; leave `QueryStates` as is. Optional guard for any future consumer: in `QueryStates`, cache the text per error identity in a ref so `fatal.text` runs once per distinct error object. Prefer the Gates-only change: smaller, and the other seven sites do not trace.

(4) Expected technical benefit: one trace entry and one console/App Insights event per load failure instead of one per re-render (MEASURED in Stage 1: 10 renders gave 10 entries). No time saved.

(5) User-visible benefit: none. Telemetry correctness: the error rate and the "Report a problem" trace stop being inflated, and the real first error is not evicted from the ring. This matters because D161 App Insights is the only field data this audit says to consult first.

(6) Dependencies: D74 ERROR line contract (keep the format and the single line); CONVENTIONS rule 23 (errors go through `trace`).

(7) Functional risks: losing the trace entirely if the effect never runs; the load failure must still produce exactly one `[VSB] ERROR` line.

(8) Performance risks: none.

(9) Complexity: Low (about 10 lines + tests).

(10) Tests: `admin-gates-approvals/Screen.test.tsx` `UT-ADGATE-920` (10 re-renders of a fatal load error yield 1 trace entry), `UT-ADGATE-921` (the one entry carries the root cause); extend `components/QueryStates.test.tsx` (`UT-QSTATES-007` if the ref cache is added). Existing UT-ADGATE-9xx tests keep using `{ hidden: true }` queries for dialogs (CA-19).

(11) Acceptance criteria: the existing Stage 1 bench (`_bench/RND/rendertrace.bench.test.tsx`) prints 1 entry for 10 renders; in a browser with a forced failed load (block `vsb_` Gates request), the console shows one `[VSB] ERROR` line and App Insights receives one event (BM-09 optional).

(12) Rollback: revert the unit.

### 3.5 RND-04 (task T-D05): Tooltip volume — UNRESOLVED, MEASURE-FIRST

(1) Current implementation. Fluent `Tooltip` per row control: 52 literal `<Tooltip` sites; the hot paths are `GateTable.tsx:146-180,251` (about 4-5 per task row), `admin-default-checklists/TaskTable.tsx:215`, `pm/checklist/Screen.tsx:606`, and, through shared helpers, `RowActions.tsx:96-98` (`tooltip === "always"`) and `DisabledReason.tsx` (every locked control). D162 B5 already memoised the gate rows, so only mount (and a post-save remount of changed rows) costs.

(2) Root cause (validated). A Tooltip instance is created per row control at mount instead of on first hover or focus. The Stage 1 figure (0.34 ms each, 250 Tooltip+Button = 110 ms against 25 ms for 250 plain Fluent buttons) is jsdom dev; the "1,000-1,500 instances" is a D162 estimate; "about 100 ms in production" is ESTIMATED without a basis. Verdict stays UNRESOLVED until BM-08.

(3) Proposed implementation, only if BM-08 says so. One shared `OnDemandTooltip` in `@/components` (CONVENTIONS rule 17): renders the child with `aria-label` / `aria-description` (or `aria-describedby`, whichever the Fluent `relationship` produced) and mounts the real Fluent `Tooltip` on first `pointerenter` / `focus`. Wire it into `RowActions` and `DisabledReason` first (they cover most sites), then the `GateTable` / `TaskTable` direct uses. Tooltip texts stay verbatim (rules 7, 22). Do not use native `title` where the canvas tooltip is rich or where tests query the Fluent tooltip by hover.

(4) Expected technical benefit: removes N Tooltip mounts per screen mount, where N is read from BM-08 (the instance count on the largest Gates scope). Unit cost to apply: 0.34 ms (jsdom dev, so only an upper bound on the production figure).

(5) User-visible benefit: a faster first open of Project Gates / Check List Settings, an admin and rarely-used screen set; not claimed in ms.

(6) Dependencies: rule 16 (`aria-label` and `data-testid` untouched), `controlLabels.test.ts`, `canvasIdentities.test.ts`; hover tests in the Gates and Check List screens.

(7) Functional risks: accessible name or description missing before the first hover (screen readers and Tosca read attributes); a tooltip that must show on keyboard focus before any pointer event; first-hover delay.

(8) Performance risks: a first-hover mount cost moved to interaction time (about 0.3 ms, negligible).

(9) Complexity: Medium (a shared component plus 5-6 call sites; about 120 lines).

(10) Tests: new `components/OnDemandTooltip.test.tsx`: `UT-TIP-001` (no Fluent Tooltip mounted before hover), `-002` (hover mounts it with the verbatim text), `-003` (keyboard focus mounts it), `-004` (accessible name/description present before hover); extend `RowActions.test.tsx`; the existing Gates hover tests pass unchanged.

(11) Acceptance criteria: BM-08. Proceed only if Tooltip-attributable self time (bottom-up, source maps loaded) is at least 15 % of the Gates mount scripting time or the mount exceeds 300 ms at 4x on the largest scope. Keep it if mount scripting falls by at least 20 % and every existing hover and label test passes.

(12) Rollback: a prop default on the wrapper (`always` mounts as today) or revert the unit.

### 3.6 RND-07 (task T-D06): first panel/dialog/dropdown in a session — UNRESOLVED, MEASURE-FIRST

(1) Current implementation. Only the Generators panels are warmed (`generators/sections/panelLoader.ts:63-69`, `schedulePanelPreload`, `requestIdleCallback`). That warms the **lazy chunks**; Griffel runtime style generation (no AOT plugin in `vite.config.ts`), `tabster` and the motion code are first exercised by the user's first click on any other screen.
(2) Root cause: unseparated. The 116 ms against 22-24 ms (jsdom dev) includes V8 warm-up of any code path, which a hidden pre-render would also pay and then discard.
(3) Proposed implementation, if BM-10 says so: at idle after first paint render a hidden closed `FormPanel`, `Dropdown` and `ConfirmDialog` once (the D143 pattern, one shared helper).
(4) Benefit: moves the first-use cost from the first click to idle; size unknown until BM-10 (first minus second open, 5 fresh sessions).
(5) Visible benefit: a faster first Edit/Add panel per session on Contracts, OPEX, Finance, Check List.
(6) Dependencies: the BND agent's start-up and idle-work findings (BND-13 warm-up group; do not add idle work that competes with data loads); FormPanel contexts.
(7) Functional risks: hidden pre-render leaving a DOM node, a focus trap or an `aria-hidden` side effect (Fluent portals); must unmount cleanly.
(8) Performance risks: idle work on slow clients competing with the first reads.
(9) Complexity: Low (about 50 lines + tests).
(10) Tests: `UT-WARM-001` (nothing visible or focusable remains), `UT-WARM-002` (second real open unaffected); `FormPanel.test.tsx` unchanged.
(11) Acceptance criteria: BM-10. Do it if first-open median at 4x is at least 100 ms slower than the second open (5 fresh sessions). Keep it if the first open falls to within 30 % of the second and Overview/CAPEX first-load long tasks (BM-12 regression set) do not worsen.
(12) Rollback: a constant switch or revert.

### 3.7 MEM-03 (with MEM-02, SCC-21): Add Cost drawn window and sheet copies — MEASURE-FIRST for MEM-03, ACCEPT for MEM-02/SCC-21

MEM-03: the D140 window already limits drawn rows to the viewport plus `OVERSCAN_ROWS = 15` each side and columns to `OVERSCAN_COLUMNS = 4` once widths are pinned (`rowWindow.ts`, `SpreadSheet.tsx:760-830`). Before widths are pinned (250 ms timer) the drawn rows have all 126 columns (`columns: null`). D140 recorded 748 cells in the real page (against 26,586 before), and 21-28 ms keystrokes. The jsdom number (207-214 MB, 14,696 elements) is a different configuration: jsdom has no layout, so it draws the 56-row fallback at 126 columns. I do **not** claim a browser heap; BM-05 takes one. If BM-05 shows the screen's JS heap above 150 MB at the largest real project, or a Major GC above 50 ms during scroll, the knobs already exist: first-paint column window (pin widths earlier or draw fewer columns before they are known) and `OVERSCAN_ROWS`/`OVERSCAN_COLUMNS`. No task is created until then.

MEM-02/SCC-21: the extra copies (`loadedRows`, `grid`, `roundTripped`, `originalRows`, `currentRows`) exist so `prepareSheetSave` can run `identityRoundTripFailures` (the D51 safety net). 8.2 MB typical (32,886 cells), 63.8 MB for a 15,000-row stress sheet (MEASURED, node, forced GC). Verdict ACCEPT: the only fix touches the safety net (Medium risk, High consequence) for a saving that matters only on a project nobody has reported. Reopen if BM-05 shows a heap above the threshold at the largest real project.

### 3.8 RND-10 (gcTime): OVERSTATED, DEFER, and a named collision with agent C

Facts. `gcTime` is set nowhere in `src` (grep; only a comment in `planning/seedOnce.ts` mentions it). A key stays 5 minutes after its last observer leaves. The Stage 1 remedy (0-30 s `gcTime` for per-term search keys, `add-cost-sheet` and `cost-book` after leaving) conflicts with three standing positions:
- **D165 `20 - Caching Architecture.md` rule C6: "`gcTime` stays at its default"**, and rule C7: "freshness is a product choice, not an optimisation".
- **Agent C's freshness policy (R2, DEC-F / DEC-3, theme T2).** C will most likely want cache entries to live **longer** (reference data, the prefetched session project and the cost book valid across navigation; doc 12 section 3 item 4: "prefetch is only valid inside `staleTime`"). A shorter `gcTime` on `cost-book` and `add-cost-sheet` works against that and against `applySavedSheetToBook`, which patches the cached book after an Add Cost Save (D51 §11.19, CA-13) and relies on it being there. Doc 12 section 4 already lists "Longer `gcTime` / `staleTime` (R2) vs memory (MEM-01, MEM-02)" as a conflict.
- The memory it would save is bounded: a tab normally holds one project (Cost screens have no in-tab project switcher; `Providers.tsx` comment), 4.7 MB typical to 36.7 MB stress per cost book (MEASURED).

Resolution proposed to the orchestrator: agent D yields. No global `gcTime` change from this theme. The only candidate is a per-key `gcTime` on the municipality and Entra search keys, which agent C's reference-data policy does not need (those keys are per typed term and only reused by retyping the same term). It is worth doing only if BM-13 shows search-term keys retaining a material heap after the user leaves General Data, and it needs an explicit, recorded exception to C6. Until then: DEFER.

### 3.9 RND-01 (and merged SPA-12, BND-15): Overview URL-driven filter and shell — OVERSTATED, MEASURE-FIRST

Re-verified path: `Input value={criteria.filter.keyword}` and `onChange` to `setFilter` to `navigate(..., { replace })` (`project-main/hooks.ts:51-71`, `Screen.tsx:983`). `SessionProvider` re-renders (it uses `useLocation`) but its memoised context value does not change (deps are primitives, `SessionContext.tsx:~146-158`), so the 29 `useSession` consumers do not re-render from it. `App` re-renders (it uses `useLocation`), then `AppShell` and `AppHeader` (neither memoised). `ROUTES` is a stable element (`App.tsx:31`). The query itself is debounced (350 ms keyword, 300 ms capacity, `hooks.ts:121-127`), so no request per keystroke. On `/projects` the shell props are primitives and `setCommandSlot` is stable, so `memo(AppHeader)` would stop its re-render without touching any URL behaviour or test.

Verdict. The expensive part, re-rendering the Overview body, is inherent to a URL-controlled input and is exactly what UT-OVUI-047 / UT-OVFIX-060 / PO-007 pin; the shell part is 0.67 ms per render in jsdom dev. Priority P2 to P3. D162's skip (FE-P1-04, "not behaviour-identical") stands.

Action: MEASURE-FIRST (BM-02, typing 10 characters). Trigger for a task: median keystroke-to-paint at 4x over 100 ms, or more than one long task in the 10-keystroke window. First step if triggered: `memo(AppHeader)` / `memo(AppShell)` (test-neutral, Low). Second step only on a product decision (D162 D-5): local draft plus debounced URL write, which needs UT-OVUI-047 / UT-OVFIX-060 re-pointed and a rule for a reload inside the pause.

### 3.10 The remaining findings (3-line blocks)

- **CMP-03 (structural sharing), ACCEPT.** Why not now: 20-35 ms inside a refetch that costs seconds, about 10 % over stock `replaceEqualDeep`, and it is the D162 D-1 mechanism that keeps an unchanged refetch from re-rendering and that CA-31 depends on (`useAddCostSheet` re-seeds the grid on a new `data` object). What would change it: BM-08b shows `replaceEqualDeepWithDates` over 50 ms at 4x on the largest book; then opt out per key (`cost-book`) only, never `add-cost-sheet`.
- **CMP-07 (Add Cost load memo), ACCEPT.** 90.6 ms at the 15,000-row extreme (MEASURED), an order of magnitude less at the typical 210 rows; the round trip is the identity safeguard and must stay. Reopen on a real sheet over 100 ms in BM-05.
- **CMP-09 (Intl pools), ACCEPT.** 1.85 us against 0.69 us held per call; 2-6 ms per 1,000-cell screen. Reopen only for a screen formatting over 10,000 values.
- **MEM-04 (`tokenCache`), ACCEPT.** Strings per distinct filter/sort/page, well under 1 MB, cleared per table on writes. Reopen if BM-13 heap snapshots show it.
- **RND-06 (closed panels), ACCEPT.** 0.76 ms per parent re-render with five closed panels in jsdom dev; production is lower. Reopen if BM-07 on Finance shows panel hook trees in the top commit cost.
- **RND-11 (`CommentsPanel` effect), ACCEPT.** One extra render of the panel per open; seeded-once semantics protect edits. A render-time seed is the pattern if it ever matters.
- **RND-12 (fresh hook objects), ACCEPT.** Latent; `useStableCallback` (96 uses) already compensates; no consumer affected today. Reopen when a memo child is given a hook object.
- **RND-05 (Overview Fluent Table), DEFER.** 114-165 ms against 40-55 ms in jsdom dev; the 540 kB payload per page dominates and replacing the Table costs a11y roles, `select-<id>` ids and Tosca. The first mount of `/projects` is visible in the BM-02 trace for free; reopen if that mount exceeds 100 ms at 4x.
- **RND-13 (`:has()` CSS), DEFER.** About 20 rules scoped to panel roots, visual parity with the canvas at stake; Chrome's invalidation is selective. BM-11 records Recalculate Style for free; reopen if one focus change recalculates over 5 ms at 4x.
- **SAD-17, SCC-20, SPB-17, MEASURE-FIRST (BM-07).** D162 deferred each on a profile threshold that was never taken: more than 16 ms (SAD-17, FE-AD-09), more than about 8 ms per keystroke (SCC-20, FE-C1-07), no stated threshold for SPB-17 (D146 left the lift undone; the calculation behind a keystroke is under 1 ms). One React Profiler session on three named screens decides all three; each fix is "extract the panel/form into its own memoised component".

## 4. Proposed Stage 3 tasks

| Task | Title | Findings covered | Files touched | Shared-file conflicts | Order constraints |
|---|---|---|---|---|---|
| **T-D00** | Browser measurement campaign (no code) | RND-01, RND-14, CMP-01/02, CMP-06, MEM-03, RND-04, RND-07, RND-13, RND-05, RND-10 (municipality keys), SAD-17, SCC-20, SPB-17, CMP-03 recheck | none in the repo; a results table under `ProjectDocs/bottleneck-identification/` and throwaway scripts under `_bench/` | none | First. Everything marked MEASURE-FIRST waits for it. Needs the user: nominations of the reference projects, a signed-in Chrome on DEV, about 3 hours (manual) |
| **T-D01** | Municipality search (options O0 to O5) | RND-02, RND-14, CMP-08, SPA-15 | `features/pm/general-data/{hooks.ts,Screen.tsx,rules.ts,gdPerfFlags.ts}`, tests; maybe `data/generalData.ts` | Network agent on PB-02 / T-33 (`data/generalData.ts`, `fetchPage` truncation); the SPA agent that owns SPA-15; both touch `general-data/hooks.ts` | DEC-6 decision, BM-01, and the truncation probe (for O3) before any code |
| **T-D02** | CAPEX grid repaint | CMP-01, CMP-02, SCC-03 | `capex-costs/pcf/ui/GridRenderer.js`, maybe `pcf/services/DatasetParser.js`, `PcfGrid.tsx`, tests | The SCC agent's CAPEX findings; the byte-identical vendored CSS gate (no CSS change) | After BM-03 and BM-04 |
| **T-D03** | Add Cost first-edit pre-pass (+ CMP-05 early return if the file is open) | CMP-06, CMP-05 | `add-costs-from-table/spreadsheet/SpreadSheet.tsx`, `costing/savedSheetPatch.ts`, tests | Add Cost save and sheet agents (SCC, NET: SCC-12/13, NET-06) | After BM-06; `rowWindow.ts` `OVERSCAN_*` only if BM-05 asks |
| **T-D04** | Gates fatal-state trace once | RND-09 | `admin-gates-approvals/Screen.tsx`, tests (maybe `components/QueryStates.tsx`) | SAD agent on Gates screen findings (SAD-02 etc.) | None. Safe to do first. Smallest task here |
| **T-D05** | On-demand Tooltip | RND-04, SAD-12 | `components/{OnDemandTooltip,RowActions,DisabledReason}.tsx`, `GateTable.tsx`, `TaskTable.tsx`, tests | SAD agent (Gates, Check List Settings); rules 16, 22 gates | After BM-08 |
| **T-D06** | Idle warm of the first panel/dialog/dropdown | RND-07 | one shared idle helper, `app/` or `components/` | BND agent (idle work, BND-13 group, start-up); FormPanel | After BM-10 and after the BND decisions on idle work |

## 5. Conflicts with other areas

- **Agent C (freshness, T2 / R2):** RND-10 against D165 C6/C7 and doc 12 section 4 (named above). Also CMP-03: if agent C changes `staleTime` or focus-refetch frequency, the number of structural-sharing walks per session changes (BND-02 group), but the per-walk cost does not.
- **Network agent (T3/T6/T7):** PB-02 / T-33 truncation of the municipality read (RND-02 option O3 depends on its answer); NET-03 (no abort), which is why a debounce is the only way to avoid superseded municipality reads; NET-06 (Add Cost mounts CAPEX and Add Cost together), which moves some Add Cost heap findings if it is fixed first.
- **SPA agent:** SPA-15 (municipality, merged into RND-02) and SPA-12 (Overview, merged into RND-01): one change set, not two.
- **SCC / SAD / SPB agents:** SCC-03 (merged into CMP-01), SCC-12/13 (Add Cost save), SAD-12 (merged into RND-04), SPB-17 own area screens.
- **BND agent:** idle work in RND-07 must not worsen start-up (BND-01, BND-13); the dist source maps used by the protocol are a BND artefact.
- **Decision log:** RND-02 needs the DEC-6 entry updated, because the 3 Nov DIVERGENCE marker at `Screen.tsx:429-430` and its `02-OPEN-DECISIONS.md` record describe a change that the options above either keep or reverse.

## 6. Browser measurement protocol

This is the protocol doc 22 should reuse. It extends the owner's DEV routine in `07_Implementation_Roadmap.md` section 4 (Profiler, Memory tab, Network tab), which was never recorded, and it uses seams that already exist in the repo. **All thresholds below are proposals for the user to ratify: the repo records no performance budget** (searched `frontend-optimization/` and `dataverse-network-performance-optimization/`; no INP, long-task or budget statement found).

### 6.1 Rules for every run

1. **Build.** A production build. Never `npm run dev` (React dev build, `StrictMode` runs every effect and render twice, `main.tsx:21`). Use the deployed DEV build, or `npm run build` and serve `dist/` on a local port behind `pac code run --appUrl <that url>`; open the `apps.powerapps.com/.../app/local?...` URL it prints (AGENT-GUIDE). Keep `dist/*.map` reachable so DevTools shows real function names (the build has 26 MB of source maps, doc 13).
2. **Machine.** One named machine, plugged in, high-performance power plan, a clean Chrome profile with no extensions, DevTools docked, window 1920 x 1080 at 100 % zoom, no other heavy tab. Record CPU, RAM, Chrome version, build id (`__APP_BUILD__`) and date in the result sheet.
3. **Two CPU profiles.** T1 = no throttling. T4 = DevTools "CPU: 4x slowdown" (a proxy for the low-end client; record that the factor is relative to this machine, or use the calibrated preset if the Chrome version offers it). Decisions are taken on T4; T1 is reported beside it.
4. **Network.** Not throttled. Render metrics are main-thread slices (Scripting, Rendering, Painting), never time-to-data, so DEV latency does not enter them. Network metrics (BM-01) count requests and bytes, not seconds.
5. **Data.** Named reference projects, nominated by the owner, described by size, **never by id in any file** (TESTING-AND-HARNESS rule; ids live only in environment variables such as `PARITY_READ_PROJECT_ID` and are printed masked). Log the row counts of each (contracts, records, sheet rows, tasks, municipalities) in the result sheet so a later run is comparable.
6. **Runs.** For per-interaction metrics: 1 warm-up discarded, then 10 measured interactions in one session; report median and p90. For first-in-session metrics (BM-06, BM-10): 5 fresh tabs, first interaction only. For an A/B of a change: baseline and variant built from the same commit pair, served from the same host, run alternately (A B A B A B), at least 5 pairs.
7. **Idle.** Before each measurement wait for the app to be idle. `window.__vsbIdle()` exists when `localStorage.__vsbE2E = "1"` is set **before** the app loads (`platform/e2eHook.ts`; it has no effect for normal users); otherwise wait until the Network tab and the main thread are quiet for 2 seconds.
8. **Observer effect.** The Performance panel itself slows the page. Use it to find causes; use the `PerformanceObserver` snippet (6.2) or a scripted Playwright run (existing saved sessions: `npm run e2e:auth:codeapp`; `e2e/lib/cost.ts` opens Cost screens; Chromium `browser.startTracing`) for the numbers that gate a decision.
9. **Console.** In every environment except Production (`vsb_EnvironmentName = Prod`) the app prints `[VSB] HTTP/DATA/ACTION` lines; the logger costs 1.5 us per call (doc 13) and can be ignored, but keep the Console panel closed during timed runs.
10. **App in a frame?** If the player hosts the app in an iframe, install observers and read `performance` in that frame's console context (the context selector at the top of the Console), not the top page's.

### 6.2 What to capture, and how

| Metric | How | Notes |
|---|---|---|
| Interaction latency | `PerformanceObserver({type:"event", durationThreshold:16, buffered:true})`: record `duration`, input delay `processingStart - startTime`, processing `processingEnd - processingStart`, presentation delay (the rest), grouped by `interactionId` | Resolution is 8 ms. For typing, use the `keydown`/`input` entry of each keystroke. The Performance panel's "Interactions" track shows the same |
| Long tasks | `PerformanceObserver({type:"longtask", buffered:true})`: count and total over the window | Entries over 50 ms |
| Where the time went | Performance panel, one recording per scenario, 4x CPU; read Summary (Scripting / Rendering / Painting) for the window, Bottom-Up for named functions (with source maps), Main-thread "Layout" and "Recalculate Style" event counts and durations | CMP-02 needs the Layout count per click; RND-13 needs Recalculate Style "elements affected" |
| React commit time | React DevTools Profiler on a **profiling** build (`react-dom/profiling` alias in a throwaway Vite config kept outside `src/`), or in jsdom with `probeRender` counts (`platform/renderProbe.ts`) for deterministic render counts | `renderProbe.current` is `null` in production and not on `window`, so counts come from vitest, times from the Profiler |
| JS heap | Memory panel: collect garbage 3 times (trash icon), wait 2 s, take a heap snapshot; record Statistics (total JS heap) and the largest constructors; search "Detached" for leaked DOM. For a coarse series launch Chrome with `--enable-precise-memory-info` and read `performance.memory.usedJSHeapSize` | 3 snapshots on fresh tabs, median. DOM nodes and listeners: Performance panel "Memory" checkbox |
| GC pauses | Performance panel, "GC" events (Major GC) during the scenario | Over 50 ms matters |
| Requests | Network panel filtered to the entity set (`vsb_assumptionslocaltaxgermanies`): count, transferred and decoded bytes; export HAR; or count `[VSB] HTTP` lines | BM-01 |

Snippet to paste in the app frame's console before a scenario (read `__bm` afterwards):

```js
window.__bm = { ev: [], lt: [] };
new PerformanceObserver(l => l.getEntries().forEach(e => __bm.ev.push({ n: e.name, id: e.interactionId, t: Math.round(e.startTime), d: e.duration,
  inDelay: Math.round(e.processingStart - e.startTime), proc: Math.round(e.processingEnd - e.processingStart) })))
  .observe({ type: "event", durationThreshold: 16, buffered: true });
new PerformanceObserver(l => l.getEntries().forEach(e => __bm.lt.push({ t: Math.round(e.startTime), d: Math.round(e.duration) })))
  .observe({ type: "longtask", buffered: true });
```

### 6.3 Scenarios

Each scenario states the screen, the steps, the metric, the runs and the finding it decides. IDs are `BM-nn` so doc 22 can cite them.

| ID | Screen / project | Steps | Metric | Runs | Decides |
|---|---|---|---|---|---|
| BM-01 | General Data, a Bavarian project (about 2,000 municipalities) and a French project | Wait idle. Click the Municipality box (record click to list painted). Type a 6-letter word at about 5 characters per second (`pressSequentially` with 200 ms delay in Playwright). Escape. Then type 20 different 1-3 letter terms | per-keystroke event duration, longest task, Option count (`document.querySelectorAll('[role=option]').length`), requests and bytes per word, heap before/after | 10 words, T1 and T4; 5 fresh tabs for the first click | RND-02, RND-14 (and the O3 truncation check: empty-term Option count) |
| BM-02 | Project Overview, 200 rows loaded | Type 10 characters into the Project keyword at 120 ms cadence; then 10 characters into the Project Manager search (local state, an in-page floor); then Next page | per-keystroke event duration, commits per keystroke (profiling build), Layout and Recalculate Style; first mount of the 200-row Table | 10 per box, T4 | RND-01, RND-05 |
| BM-03 | CAPEX tab of a category with at least 500 records | Expand the first account, then 10 sub-accounts one at a time; collapse them; again with 5 and with 30 accounts expanded | click to next paint; Scripting vs Layout vs Painting; self time of `parseDatasetToTree`; Layout events per click | 10 folds per setting, T1 and T4 | CMP-01, CMP-02 |
| BM-04 | Same | Change payer filter, show-empty, show-planned (dataset unchanged) and year (dataset changes) | same as BM-03 | 10 each | CMP-01 (what the cache would cover) |
| BM-05 | Add Costs from Table, largest real project (and a typical one) | From CAPEX press Add Costs from Table; settle; scroll to the bottom; leave to CAPEX; settle | click to first grid paint; long tasks during open; heap after settle, after scroll, after leaving and GC; `document.querySelectorAll('td').length`; DOM node count; Major GC during scroll | 3 fresh tabs, T1 and T4 | MEM-03, MEM-02, SCC-21, CMP-07 |
| BM-06 | Add Costs from Table, 200+ rows x 10 years | Fresh load, click a cell, type one character (first edit); then 10 more characters | first-edit event duration against the median of the rest | 5 fresh tabs, T1 and T4 | CMP-06 |
| BM-07 | CAPEX Edit panel (300-contract category), Revenues contract panel with 10-15 contracts, Admin Cost DEVEX tree with the largest scope, Finance Senior Debt panel | Type 10 characters in a panel field; on Admin Cost expand the largest section and press a row action | commit time (Profiler) and event duration per keystroke; render count; the commit's top components | 10 per screen, T4 | SCC-20, SPB-17, SAD-17, RND-06 |
| BM-08 | Admin Project Gates (country and technology with the most tasks); Check List Settings | Open the screen cold; open again after a save | mount Scripting time; Tooltip share (Bottom-Up `useTooltip`/`Tooltip`); DOM node count; Tooltip instance count | 5 fresh tabs, T1 and T4 | RND-04 |
| BM-08b | CAPEX tab, largest book | Return to the tab after more than 30 s (focus refetch) | self time of `replaceEqualDeepWithDates` in the refetch response | 5 | CMP-03 |
| BM-09 | Admin Project Gates | Block the gate-approvals request (DevTools request blocking) to force the fatal state; trigger 5 re-renders | count of `[VSB] ERROR` lines and App Insights events | 3 | RND-09 (optional; vitest covers it) |
| BM-10 | Contracts (or Finance) | Fresh tab: open an Add/Edit panel, close it, open it again | click to panel painted, first minus second | 5 fresh tabs, T1 and T4 | RND-07 |
| BM-11 | Finance Senior Debt panel | Tab through 30 fields; hover 10 controls | Recalculate Style events per focus change (count, ms, elements affected) | 3 passes, T4 | RND-13 |
| BM-12 | Regression set: Overview first load, CAPEX first load, Contracts open | Run before and after any T-D change | long tasks and Scripting of each load; JS heap after load | 5 pairs | collateral damage guard for every task |
| BM-13 | General Data (Bavaria) then Overview, 10 projects | Type 20 distinct terms; leave; heap snapshot at once and after 6 minutes idle | retained size of `germanMunicipalities` keys (search the snapshot); Detached DOM | 3 | RND-10 (municipality keys), MEM-04 |

### 6.4 Pass rules (proposed; to be ratified by the user)

- **Worth fixing** (a task is created) when the metric on T4 is over: 200 ms for a discrete interaction (a click, an open), 100 ms per keystroke while typing, 50 ms for a single long task caused by a named function, or, for memory, 150 MB retained by one screen or a Major GC over 50 ms. These follow the web.dev INP bands (200 ms good, 500 ms needs improvement) and the 100 ms responsiveness rule of thumb; they are bars to be chosen, not facts about this app.
- **Keep a change** only if, in the paired A/B: the median of the gating metric improves by at least 20 % **and** at least 10 ms at T1 (30 ms at T4); the p90 does not worsen by more than 5 %; BM-12 shows no regression above 5 % in any screen outside the change; heap does not grow; and the existing functional tests pass unchanged.
- **Close as ACCEPT** a MEASURE-FIRST finding whose metric is under the bar at T4 on the largest nominated data.
- If a metric is between the bar and 1.5x the bar, repeat with 10 more runs before deciding; report the spread, not only the median.
- A figure from jsdom, Node or the dev server is never a basis for keeping a change; it may be cited only as a ratio.

### 6.5 Result sheet

One row per run: scenario id, finding ids, date, machine, Chrome version, build id, CPU profile, project description and its row counts, run number, each metric, variant (A or B), and a link to the trace or snapshot file kept outside the repo. Doc 22 should reference scenarios by ID and quote medians and p90, with the number of runs.

## 7. What could not be determined

- Any browser number: no Chrome, host or DEV access in this audit. Every MEASURE-FIRST verdict above is a statement that the Stage 1 evidence cannot decide the question.
- Whether the Area's empty-term municipality list is truncated at 500 rows (the PB-02 / OPT-19 probe was never run); this decides O3.
- The Fluent Tooltip and Combobox production costs, and how much of the Stage 1 "first open" cost is V8 warm-up rather than Griffel style generation (RND-07).
- Real row counts: records per CAPEX category, tasks per Gates scope, municipalities per Area, sheet rows of the largest project. The protocol requires them to be logged.
- Payload bytes per municipality row (5 columns plus annotations) and the real DelayOutput delay value in the Modern Combobox (confirm against Microsoft's documentation before using it as a parity value).
- Whether the DEV player hosts the app in an iframe (affects where observers are installed).
