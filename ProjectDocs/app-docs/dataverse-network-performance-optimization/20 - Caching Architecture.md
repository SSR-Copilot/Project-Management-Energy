# 20 - Caching Architecture

> Stage 2 (design and planning only), 25 Nov 2026. Inputs: doc 09 (23 findings name caching). Tasks: T-20 to T-24, T-41 (PA-12), DEC-C, DEC-F.

## 1. What exists

TanStack Query (in memory, per tab, per signed-in user) with a global `staleTime` of 30 s and refetch on window focus; several dozen per-query overrides (5-30 minutes for reference data, `Infinity` for session constants, `staleTime: 0` for 'fresh on entry'); `sharedRead` (in-flight coalescing plus a short memo); `countedPage` skip-token cache; `persistedReference` (IndexedDB, off by default); `pendingDeletes` registry. No new cache library is needed.

## 2. Data classes and the policy for each

| Class | Examples | Lifetime | Invalidation | Stale-data behaviour |
|---|---|---|---|---|
| A. Session constants | host context, current user, environment variables | for the session (`Infinity`) | none (a reload re-reads) | not applicable |
| B. Reference data | countries, project states, currencies, chart of accounts, device types, clusters | 5-30 min (as today) | in-session write of that table invalidates the key; `sharedRead.invalidate()` | a colleague's change appears after the lifetime; stated per entry in D160 |
| C. Project working data | cost book, contracts, periods, generators, milestones | 30 s default; refetch on focus kept | the writing screen patches or invalidates its key on every outcome (N1, X4) | a second user's change appears on focus |
| D. Never cached | existence guards, pre-write verify reads, flow state reads before a flow call | 0 | - | must be fresh |

## 3. Rules

| # | Rule |
|---|---|
| C1 | **One key per table and purpose** (N3); the key includes every input that changes the result (project id, scope, select). |
| C2 | **Scope.** The TanStack cache is in memory per tab, so it cannot leak between users. Anything that **persists** (IndexedDB catalogue, any storage) must be keyed by environment id **and** user id, and cleared on sign-out; PA-12 shows the catalogue key lacks both (flag off; fix before it is enabled, T-41). |
| C3 | **Invalidate on every outcome** of a write, not only success (X4). A patch-in-place equals a reload (differential test). |
| C4 | **In-flight sharing** through `sharedRead` for reference reads started by several callers (the CAPEX chart, currencies, the SPV/DevCo mapping, CA-08). |
| C5 | **Server-side changes the client did not make** (plug-in cascade deletes, flow writes) are invalidated explicitly after the call that triggers them (AD-11), because nothing else tells the cache. |
| C6 | **Bound memory.** Large lists stay paged (5,000 rows for Cost); `gcTime` stays at its default; a persisted cache has a row and size cap and a version key. |
| C7 | **Freshness is a product choice, not an optimisation.** Raising a `staleTime` on a working-data query needs the owner's decision (DEC-F); reference-data lifetimes are already recorded in D160 and change only with a note there. |

## 4. Deduplication work (T-20 to T-24), by mechanism

| Mechanism | Used for | Findings |
|---|---|---|
| Patch the cached rows after a write | CAPEX book after paid toggle, panel save, panel delete | CA-05 |
| Narrower refetch (`refetchType`, specific key) | Add Cost Summary totals, Project Gates, Land Lease reference rows | CA-06, AD-06, CB-15 |
| `sharedRead` | SPV/DevCo mapping, OPEX subaccount catalogue | CA-08, CB-08 |
| One key, widest select | `vsb_countries`, `vsb_projects` per PM screen, Generator types, Entra person lookups | PB-06, PB-10, PA-10, PB-16 |
| Prefetch at boot | PM screens' first reads | PB-03 |
| Do not start the read | Generators warm-up on screens that rarely lead to Generators | PA-11, PB-09 |
| Explicit invalidation after server-side change | plug-in cascade deletes | AD-11 |

## 5. Held decisions

- **DEC-F** (focus refetch of the heavy Cost reads and the CAPEX tree): default **keep**; the choice and the 'Refresh' alternative are put to you.
- **DEC-C** (cache shared across tabs for a faster 'Edit Project' tab): if wanted, scope to one user and environment, store only class B and A data, and expire on sign-out.

## 6. Validation

A cache change is validated by: the keyed-cache unit test (right key, right invalidation, on success, partial failure and unknown outcome); the patch-equals-reload differential test; a request-count assertion for the interaction; a DEV check that a second browser profile (another user) sees its own data and a colleague's change after the stated lifetime.
